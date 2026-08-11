'use strict';

const copyButton = document.getElementById('copy-sha');
const shaValue = document.getElementById('sha-value');
const copyStatus = document.getElementById('copy-status');

copyButton.addEventListener('click', async () => {
  const value = shaValue.textContent.trim();
  try {
    await navigator.clipboard.writeText(value);
    copyStatus.textContent = 'تم نسخ البصمة بنجاح.';
  } catch (_) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(shaValue);
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = 'حدّدنا البصمة؛ انسخها يدويًا.';
  }
});
