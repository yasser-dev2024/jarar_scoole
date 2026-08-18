'use strict';

const APP_VERSION = '1.3.0';
const BUNDLED_DATA_VERSION = 6;
const SCHOOL_TIME_ZONE = 'Asia/Riyadh';
const STORAGE_DB = 'school-smart-pwa';
const STORAGE_STORE = 'app-data';
const DATA_KEY = 'dataset';
const BELL_KEY = 'school-pwa-bell-enabled';
const INSTALL_DISMISSED_KEY = 'school-pwa-install-dismissed';
const DATA_FALLBACK_KEY = 'school-pwa-dataset-fallback';
const TRANSFER_SIGNING_KEY = 'SchoolOfflineSuite-DataTransfer-Integrity-2026';
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const REQUIRED_TABLES = ['app_settings', 'schedule_entries', 'classes', 'teachers', 'assignments'];
const RING_LENGTH = 2 * Math.PI * 142;

const elements = {
  app: document.getElementById('app'),
  boot: document.getElementById('boot'),
  connection: document.getElementById('connection-state'),
  installCard: document.getElementById('install-card'),
  installHelp: document.getElementById('install-help-button'),
  dismissInstall: document.getElementById('dismiss-install'),
  schoolName: document.getElementById('school-name'),
  schoolDate: document.getElementById('school-date'),
  currentTime: document.getElementById('current-time'),
  periodTitle: document.getElementById('period-title'),
  periodDetail: document.getElementById('period-detail'),
  countdown: document.getElementById('countdown'),
  ring: document.getElementById('ring-progress'),
  daySelect: document.getElementById('day-select'),
  search: document.getElementById('search-input'),
  links: document.getElementById('current-links'),
  linksCount: document.getElementById('links-count'),
  currentLinksTitle: document.getElementById('current-links-title'),
  nextLinks: document.getElementById('next-links'),
  nextLinksCount: document.getElementById('next-links-count'),
  nextLinksTitle: document.getElementById('next-links-title'),
  schedule: document.getElementById('schedule-list'),
  updateButton: document.getElementById('update-button'),
  updateFile: document.getElementById('update-file'),
  bellButton: document.getElementById('bell-button'),
  wakeButton: document.getElementById('wake-button'),
  resetButton: document.getElementById('reset-button'),
  modal: document.getElementById('modal'),
  modalContent: document.getElementById('modal-content'),
  toast: document.getElementById('toast'),
};

const runtime = {
  data: null,
  entries: [],
  scheduleState: null,
  selectedDay: saudiNow().getDay(),
  visibleEntriesKey: null,
  bellEnabled: localStorage.getItem(BELL_KEY) === '1',
  lastBellDate: '',
  lastBellSecond: null,
  wakeLock: null,
  keepAwake: false,
  deferredInstallPrompt: null,
  sql: null,
};

function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORAGE_STORE)) {
        request.result.createObjectStore(STORAGE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function timeoutAfter(milliseconds, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds));
}

async function safeStoredData() {
  try {
    return await Promise.race([
      storedValue(DATA_KEY),
      timeoutAfter(2500, 'انتهت مهلة فتح التخزين المحلي.'),
    ]);
  } catch (_) {
    const fallback = localStorage.getItem(DATA_FALLBACK_KEY);
    return fallback ? JSON.parse(fallback) : null;
  }
}

async function safelyStoreData(value) {
  try {
    await Promise.race([
      storeValue(DATA_KEY, value),
      timeoutAfter(2500, 'انتهت مهلة حفظ البيانات محليًا.'),
    ]);
    localStorage.removeItem(DATA_FALLBACK_KEY);
  } catch (_) {
    localStorage.setItem(DATA_FALLBACK_KEY, JSON.stringify(value));
  }
}

async function storedValue(key) {
  const database = await openStorage();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORAGE_STORE).objectStore(STORAGE_STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function storeValue(key, value) {
  const database = await openStorage();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORAGE_STORE, 'readwrite');
      transaction.objectStore(STORAGE_STORE).put(value, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function defaultData() {
  const response = await fetch(`./data/default-data.json?v=${APP_VERSION}`);
  if (!response.ok) throw new Error('تعذر تحميل بيانات المدرسة الأصلية.');
  return normalizeData(await response.json(), BUNDLED_DATA_VERSION);
}

function normalizeData(value, fallbackDataVersion = 0) {
  const source = value && value.tables ? value.tables : value;
  if (!source || typeof source !== 'object') throw new Error('صيغة ملف البيانات غير صحيحة.');
  const tables = {};
  for (const table of REQUIRED_TABLES) {
    if (!Array.isArray(source[table])) throw new Error(`الملف لا يحتوي جدول ${table}.`);
    tables[table] = source[table].map((row) => ({ ...row }));
  }
  if (!tables.app_settings.length || !tables.schedule_entries.length) {
    throw new Error('ملف البيانات لا يحتوي إعدادات وجدولًا صالحًا.');
  }
  return {
    format_version: 'pwa-1',
    app_name: 'SchoolOfflineSuite',
    data_version: Number(value?.data_version ?? fallbackDataVersion),
    imported_at: new Date().toISOString(),
    tables,
  };
}

function secondsOfDay(value) {
  const parts = String(value || '00:00:00').split(':').map((item) => Number.parseInt(item, 10) || 0);
  return parts[0] * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function shiftedEntries() {
  const entries = runtime.data.tables.schedule_entries
    .map((entry) => ({ ...entry }))
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
  return entries;
}

function saudiNow(source = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(source);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
}

function settings() {
  return runtime.data.tables.app_settings[0] || {};
}

function workingDays() {
  return new Set(String(settings().working_days || '0,1,2,3,4')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6));
}

function calculateSchedule(now) {
  const entries = runtime.entries;
  if (!workingDays().has(now.getDay())) {
    return { status: 'nonWorking', remaining: 0, total: 0, progress: 0, current: null, next: null };
  }
  if (!entries.length) return { status: 'finished', remaining: 0, total: 0, progress: 1, current: null, next: null };
  const currentSecond = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let previous = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const start = secondsOfDay(entry.start_time);
    const end = secondsOfDay(entry.end_time);
    const next = entries[index + 1] || null;
    if (currentSecond >= start && currentSecond < end) {
      const total = Math.max(1, end - start);
      const remaining = Math.max(0, end - currentSecond);
      return { status: 'inProgress', remaining, total, progress: (total - remaining) / total, current: entry, next, previous };
    }
    if (currentSecond < start) {
      if (previous) {
        const previousEnd = secondsOfDay(previous.end_time);
        if (currentSecond >= previousEnd && start > previousEnd) {
          const total = start - previousEnd;
          const remaining = start - currentSecond;
          return { status: 'transition', remaining, total, progress: 1 - remaining / total, current: null, next: entry, previous };
        }
      }
      return { status: 'waiting', remaining: start - currentSecond, total: 0, progress: 0, current: null, next: entry, previous };
    }
    previous = entry;
  }
  return { status: 'finished', remaining: 0, total: 0, progress: 1, current: null, next: null, previous };
}

function countdown(seconds) {
  const value = Math.max(0, Math.min(359999, Math.round(seconds)));
  return [Math.floor(value / 3600), Math.floor((value % 3600) / 60), value % 60]
    .map((item) => String(item).padStart(2, '0'))
    .join(':');
}

function titleForState(state) {
  if (state.status === 'nonWorking') return 'يوم غير دراسي';
  if (state.status === 'waiting') return 'قبل بداية الدوام';
  if (state.status === 'inProgress') return state.current.title || 'حصة جارية';
  if (state.status === 'transition') return 'فاصل بين الحصص';
  return 'انتهى اليوم الدراسي';
}

function detailForState(state) {
  if (state.status === 'inProgress') return `${String(state.current.start_time).slice(0, 5)} — ${String(state.current.end_time).slice(0, 5)}`;
  if ((state.status === 'waiting' || state.status === 'transition') && state.next) return `التالي: ${state.next.title}`;
  return '';
}

function renderClock(now) {
  const state = calculateSchedule(now);
  runtime.scheduleState = state;
  elements.currentTime.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
  elements.periodTitle.textContent = titleForState(state);
  elements.periodDetail.textContent = detailForState(state);
  elements.countdown.textContent = state.remaining > 0 ? countdown(state.remaining) : '';
  const progress = state.status === 'inProgress' || state.status === 'transition' ? Math.max(.01, Math.min(1, state.progress)) : .018;
  elements.ring.style.strokeDashoffset = String(RING_LENGTH * (1 - progress));
  const visibleEntriesKey = `${state.current?.id ?? ''}:${state.next?.id ?? ''}`;
  if (runtime.visibleEntriesKey !== visibleEntriesKey) {
    runtime.visibleEntriesKey = visibleEntriesKey;
    renderLinks();
    renderSchedule();
  }
}

function renderIdentity(now = saudiNow()) {
  elements.schoolName.textContent = settings().school_name || 'ابتدائية الملك عبدالعزيز بأبها';
  const date = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  elements.schoolDate.textContent = date;
}

function renderDayOptions() {
  const days = workingDays();
  elements.daySelect.replaceChildren();
  DAY_NAMES.forEach((name, day) => {
    const option = document.createElement('option');
    option.value = String(day);
    option.textContent = `${name}${days.has(day) ? '' : ' • إجازة'}`;
    option.selected = day === runtime.selectedDay;
    elements.daySelect.append(option);
  });
}

function assignmentRows(entry) {
  if (!entry) return [];
  const classes = new Map(runtime.data.tables.classes.map((row) => [Number(row.id), row]));
  const teachers = new Map(runtime.data.tables.teachers.map((row) => [Number(row.id), row]));
  return runtime.data.tables.assignments
    .filter((row) => Number(row.day_of_week) === runtime.selectedDay && Number(row.schedule_entry_id) === Number(entry.id))
    .map((row) => ({
      className: classes.get(Number(row.class_id))?.class_name || 'فصل غير محدد',
      teacherName: teachers.get(Number(row.teacher_id))?.teacher_name || 'معلم غير محدد',
      subjectName: row.subject_name || 'مادة غير محددة',
    }))
    .sort((left, right) => left.className.localeCompare(right.className, 'ar'));
}

function renderLinks() {
  const query = elements.search.value.trim().toLocaleLowerCase('ar');
  const current = runtime.scheduleState && runtime.scheduleState.current;
  const next = runtime.scheduleState && runtime.scheduleState.next;
  const filterRows = (entry) => {
    const rows = assignmentRows(entry);
    return query
      ? rows.filter((row) => `${row.className} ${row.teacherName} ${row.subjectName}`.toLocaleLowerCase('ar').includes(query))
      : rows;
  };
  const currentRows = filterRows(current);
  const nextRows = filterRows(next);
  elements.currentLinksTitle.textContent = current
    ? `الحصة الحالية: ${current.title}`
    : 'الحصة الحالية: لا توجد';
  elements.nextLinksTitle.textContent = next
    ? `الحصة القادمة: ${next.title}`
    : 'الحصة القادمة: لا توجد';
  elements.linksCount.textContent = String(currentRows.length);
  elements.nextLinksCount.textContent = String(nextRows.length);
  renderAssignmentRows(elements.links, current, currentRows, query, 'لا توجد حصة جارية الآن لعرض الربط.');
  renderAssignmentRows(elements.nextLinks, next, nextRows, query, 'لا توجد حصة قادمة لعرض الربط.');
}

function renderAssignmentRows(container, entry, rows, query, noEntryMessage) {
  container.replaceChildren();
  if (!entry) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = noEntryMessage;
    container.append(empty);
    return;
  }
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = query ? 'لا توجد نتيجة مطابقة للبحث.' : `لا يوجد ربط لهذه الحصة في ${DAY_NAMES[runtime.selectedDay]}.`;
    container.append(empty);
    return;
  }
  const table = document.createElement('div');
  table.className = 'assignment-table';
  table.append(assignmentTableRow(['#', 'الفصل', 'المعلم', 'المادة'], 'assignment-table-head'));
  rows.forEach((row, index) => {
    table.append(assignmentTableRow(
      [String(index + 1), row.className, row.teacherName, row.subjectName],
      `assignment-table-body palette-${index % 6}`,
    ));
  });
  container.append(table);
}

function assignmentTableRow(values, className) {
  const row = document.createElement('div');
  row.className = `assignment-table-row ${className}`;
  values.forEach((value) => {
    const cell = document.createElement('span');
    cell.textContent = value;
    row.append(cell);
  });
  return row;
}

function renderSchedule() {
  elements.schedule.replaceChildren();
  const currentId = runtime.scheduleState?.current ? Number(runtime.scheduleState.current.id) : null;
  for (const entry of runtime.entries) {
    const row = document.createElement('article');
    row.className = `schedule-row${Number(entry.id) === currentId ? ' is-current' : ''}`;
    const time = document.createElement('time');
    time.textContent = String(entry.start_time).slice(0, 5);
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const end = document.createElement('small');
    end.textContent = `حتى ${String(entry.end_time).slice(0, 5)}`;
    row.append(time, title, end);
    elements.schedule.append(row);
  }
}

function refreshDataViews() {
  runtime.entries = shiftedEntries();
  runtime.visibleEntriesKey = Symbol('refresh');
  renderIdentity();
  renderDayOptions();
  renderClock(saudiNow());
  renderLinks();
  renderSchedule();
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function renderInstallState() {
  document.body.classList.toggle('standalone', isStandalone());
  if (localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') elements.installCard.hidden = true;
}

function showInstallHelp() {
  openModal(`
    <h2 id="modal-title">تثبيت التطبيق على iPhone</h2>
    <p>نفّذ الخطوات مرة واحدة من Safari، وبعدها سيفتح التطبيق من أيقونته مباشرة.</p>
    <ol>
      <li>اضغط زر <span class="share-glyph">↥</span> <strong>مشاركة</strong> في Safari.</li>
      <li>اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</li>
      <li>فعّل <strong>فتح كتطبيق ويب</strong> ثم اضغط <strong>إضافة</strong>.</li>
      <li>افتح أيقونة «المدرسة والجرس» من الشاشة الرئيسية.</li>
    </ol>
    <p><strong>بعد أول فتح كامل تصبح الشاشة والبيانات الأساسية متاحة دون إنترنت.</strong></p>
  `);
}

function openModal(content) {
  elements.modalContent.innerHTML = content;
  elements.modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  elements.modal.hidden = true;
  elements.modalContent.replaceChildren();
  document.body.style.overflow = '';
}

function showToast(message, error = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', error);
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 4300);
}

async function verifySchoolData(files) {
  const dataBytes = files['data.json'];
  const signatureBytes = files['signature.sha256'];
  if (!dataBytes || !signatureBytes) throw new Error('حزمة التحديث لا تحتوي البيانات والتوقيع.');
  const text = new TextDecoder().decode(dataBytes).replaceAll('\r\n', '\n');
  const storedSignature = new TextDecoder().decode(signatureBytes).trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(TRANSFER_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  const actual = [...new Uint8Array(signature)].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (actual.length !== storedSignature.length || actual !== storedSignature) {
    throw new Error('توقيع حزمة التحديث غير صالح.');
  }
  return JSON.parse(text);
}

function tableFromSql(database, table) {
  const result = database.exec(`SELECT * FROM "${table}"`);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((valuesRow) => Object.fromEntries(columns.map((column, index) => [column, valuesRow[index]])));
}

async function dataFromSqlite(bytes) {
  if (!runtime.sql) {
    runtime.sql = await window.initSqlJs({ locateFile: () => './vendor/sql-wasm.wasm' });
  }
  const database = new runtime.sql.Database(bytes);
  try {
    const tables = Object.fromEntries(REQUIRED_TABLES.map((table) => [table, tableFromSql(database, table)]));
    return { tables };
  } finally {
    database.close();
  }
}

async function importUpdate(file) {
  const extension = file.name.toLowerCase().split('.').pop();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let imported;
  if (extension === 'schooldata') {
    if (!window.fflate) throw new Error('قارئ حزم التحديث غير جاهز.');
    imported = normalizeData(await verifySchoolData(window.fflate.unzipSync(bytes)), BUNDLED_DATA_VERSION);
  } else if (['db', 'sqlite', 'sqlite3'].includes(extension)) {
    imported = normalizeData(await dataFromSqlite(bytes), BUNDLED_DATA_VERSION);
  } else if (extension === 'json') {
    imported = normalizeData(JSON.parse(new TextDecoder().decode(bytes)), BUNDLED_DATA_VERSION);
  } else {
    throw new Error('نوع الملف غير مدعوم.');
  }
  await safelyStoreData(imported);
  runtime.data = imported;
  refreshDataViews();
}

async function unlockAndPlay(sound = 'school_bell') {
  const audio = new Audio(`./sounds/${sound}.wav`);
  audio.preload = 'auto';
  await audio.play();
}

async function requestNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (_) { /* Safari may require Home Screen mode. */ }
  }
}

async function notifyBell(title) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('الجرس المدرسي', {
      body: title,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'school-bell-current',
      renotify: true,
      dir: 'rtl',
      lang: 'ar',
    });
  } catch (_) { /* The audio remains the primary foreground alert. */ }
}

async function ringBell(entry, eventType) {
  const sound = eventType === 'start' ? 'class_start' : 'class_end';
  try { await unlockAndPlay(sound); } catch (_) { /* A first user tap may still be required by Safari. */ }
  await notifyBell(`${eventType === 'start' ? 'بداية' : 'نهاية'} ${entry.title}`);
  if ('setAppBadge' in navigator) {
    try { await navigator.setAppBadge(1); } catch (_) { /* Optional enhancement. */ }
  }
}

function checkBell(now) {
  if (!runtime.bellEnabled || !workingDays().has(now.getDay())) return;
  const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const currentSecond = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  if (runtime.lastBellDate !== dateKey || runtime.lastBellSecond === null || currentSecond < runtime.lastBellSecond) {
    runtime.lastBellDate = dateKey;
    runtime.lastBellSecond = Math.max(-1, currentSecond - 1);
  }
  const elapsed = currentSecond - runtime.lastBellSecond;
  if (elapsed > 5) {
    runtime.lastBellSecond = currentSecond;
    return;
  }
  const firedTimes = new Set();
  for (const entry of runtime.entries) {
    for (const eventType of ['start', 'end']) {
      const target = secondsOfDay(entry[`${eventType}_time`]);
      if (target > runtime.lastBellSecond && target <= currentSecond && !firedTimes.has(target)) {
        firedTimes.add(target);
        void ringBell(entry, eventType);
      }
    }
  }
  runtime.lastBellSecond = currentSecond;
}

async function toggleBell() {
  runtime.bellEnabled = !runtime.bellEnabled;
  localStorage.setItem(BELL_KEY, runtime.bellEnabled ? '1' : '0');
  elements.bellButton.classList.toggle('is-active', runtime.bellEnabled);
  if (runtime.bellEnabled) {
    try { await unlockAndPlay(); } catch (_) { /* Permission state is explained by the toast. */ }
    await requestNotifications();
    showToast('تم تشغيل الجرس والتنبيهات داخل التطبيق.');
  } else {
    showToast('تم إيقاف الجرس.');
  }
}

async function requestWakeLock() {
  runtime.keepAwake = !runtime.keepAwake;
  if (!runtime.keepAwake) {
    if (runtime.wakeLock) await runtime.wakeLock.release();
    runtime.wakeLock = null;
    elements.wakeButton.classList.remove('is-active');
    elements.wakeButton.textContent = 'إبقاء الشاشة مضاءة';
    return;
  }
  if (!('wakeLock' in navigator)) {
    runtime.keepAwake = false;
    showToast('فعّل القفل التلقائي من إعدادات iPhone إذا أردت بقاء الشاشة مضاءة.', true);
    return;
  }
  try {
    runtime.wakeLock = await navigator.wakeLock.request('screen');
    elements.wakeButton.classList.add('is-active');
    elements.wakeButton.textContent = 'الشاشة مضاءة';
  } catch (_) {
    runtime.keepAwake = false;
    showToast('تعذر إبقاء الشاشة مضاءة.', true);
  }
}

function updateConnectionState() {
  elements.connection.textContent = navigator.onLine ? 'يعمل محليًا • متصل' : 'يعمل دون إنترنت';
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('./sw.js', { scope: './' }); } catch (_) { /* App still works online. */ }
}

function bindEvents() {
  elements.daySelect.addEventListener('change', () => {
    runtime.selectedDay = Number(elements.daySelect.value);
    renderLinks();
  });
  elements.search.addEventListener('input', renderLinks);
  elements.updateButton.addEventListener('click', () => elements.updateFile.click());
  elements.updateFile.addEventListener('change', async () => {
    const file = elements.updateFile.files && elements.updateFile.files[0];
    if (!file) return;
    elements.updateButton.disabled = true;
    try {
      await importUpdate(file);
      showToast(`تم تطبيق تحديث ${file.name} وحفظه على الجهاز.`);
    } catch (error) {
      showToast(`تعذر تطبيق التحديث: ${error.message || error}`, true);
    } finally {
      elements.updateButton.disabled = false;
      elements.updateFile.value = '';
    }
  });
  elements.bellButton.addEventListener('click', toggleBell);
  elements.wakeButton.addEventListener('click', requestWakeLock);
  elements.installHelp.addEventListener('click', async () => {
    if (runtime.deferredInstallPrompt) {
      runtime.deferredInstallPrompt.prompt();
      await runtime.deferredInstallPrompt.userChoice;
      runtime.deferredInstallPrompt = null;
    } else {
      showInstallHelp();
    }
  });
  elements.dismissInstall.addEventListener('click', () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    elements.installCard.hidden = true;
  });
  elements.modal.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-modal]')) closeModal();
  });
  elements.resetButton.addEventListener('click', async () => {
    if (!window.confirm('هل تريد استعادة بيانات التطبيق الأصلية؟')) return;
    try {
      runtime.data = await defaultData();
      await safelyStoreData(runtime.data);
      refreshDataViews();
      showToast('تمت استعادة بيانات التطبيق الأصلية.');
    } catch (error) {
      showToast(`تعذرت الاستعادة: ${error.message || error}`, true);
    }
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    runtime.deferredInstallPrompt = event;
  });
  window.addEventListener('appinstalled', renderInstallState);
  window.addEventListener('online', updateConnectionState);
  window.addEventListener('offline', updateConnectionState);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && runtime.keepAwake && !runtime.wakeLock) {
      try { runtime.wakeLock = await navigator.wakeLock.request('screen'); } catch (_) { /* User can retry. */ }
    }
  });
}

async function start() {
  try {
    localStorage.removeItem('school-pwa-local-start');
    bindEvents();
    renderInstallState();
    updateConnectionState();
    elements.bellButton.classList.toggle('is-active', runtime.bellEnabled);
    runtime.data = await safeStoredData();
    runtime.data = runtime.data ? normalizeData(runtime.data) : null;
    try {
      const bundled = await defaultData();
      if (!runtime.data || Number(runtime.data.data_version || 0) < Number(bundled.data_version || 0)) {
        runtime.data = bundled;
        await safelyStoreData(runtime.data);
      }
    } catch (error) {
      if (!runtime.data) throw error;
    }
    runtime.entries = shiftedEntries();
    refreshDataViews();
    elements.app.hidden = false;
    elements.boot.hidden = true;
    setInterval(() => {
      const now = saudiNow();
      renderClock(now);
      checkBell(now);
      if (now.getSeconds() === 0) renderIdentity(now);
    }, 1000);
    await registerServiceWorker();
  } catch (error) {
    elements.boot.querySelector('span').textContent = `تعذر تشغيل التطبيق: ${error.message || error}`;
    elements.boot.querySelector('.boot-bar').hidden = true;
  }
}

void start();
