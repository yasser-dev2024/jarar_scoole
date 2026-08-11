# نشر صفحة تنزيل التطبيق على Netlify

هذا المجلد صفحة Static مستقلة؛ لا يحتاج Node.js أو npm أو خادمًا أو قاعدة بيانات.

تحتوي الصفحة على تنزيل Android الفعلي وقسم حالة لنسخة iPhone. لا يتحول زر iPhone إلى زر تثبيت إلا بعد توفر رابط TestFlight أو App Store صالح؛ ملف IPA لا يثبت للعامة بالطريقة نفسها التي يثبت بها APK.

## النشر عبر GitHub Pages

المستودع المستهدف:

`https://github.com/yasser-dev2024/jarar_scoole`

ترفع ملفات هذا المجلد إلى جذر الفرع `main`. بعد الرفع فعّل GitHub Pages من `Settings > Pages` واختر GitHub Actions أو النشر من جذر فرع `main`. رابط المشروع المتوقع بعد التفعيل:

`https://yasser-dev2024.github.io/jarar_scoole/`

## النشر اليدوي

1. تحقق من وجود `downloads/SchoolApp.apk` و`downloads/SchoolApp.apk.sha256`.
2. افتح لوحة Netlify واختر إضافة موقع جديد بالنشر اليدوي.
3. اسحب مجلد `download_page` كاملًا إلى منطقة النشر.
4. بعد النشر افتح الصفحة واضغط زر «تحميل أو تحديث تطبيق المدرسة للأندرويد».
5. تأكد أن الرابط ينزّل `SchoolApp.apk` ثم قارن SHA-256 الظاهر في الصفحة.

لا تُدخل بيانات حساب أو مفاتيح داخل ملفات الصفحة، ولا تضف أدوات تتبع.

## تحديث نسخة APK

بعد كل بناء ناجح، استبدل الملف فقط بنفس الاسم:

`download_page/downloads/SchoolApp.apk`

ثم حدّث ملف البصمة ومعلومات الإصدار والحجم في `index.html`. لا تغيّر رابط الزر `./downloads/SchoolApp.apk`.

لكي يظهر Android خيار «تحديث» يجب رفع APK برقم `versionCode` أعلى، مع بقاء `applicationId` وشهادة Release كما هما. راجع `../update_workflow.md` لمسار نشر بيانات الديسكتوب والأصوات داخل الإصدار الجديد.
