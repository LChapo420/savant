(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40 && !document.querySelector('#item .choice, #item input'); i++) await wait(100);
  const item = document.getElementById('item');
  const choice = item.querySelector('.choice');
  if (choice) choice.click();
  else { const input = item.querySelector('input'); input.value = '3'; input.dispatchEvent(new Event('input', { bubbles: true })); (item.querySelector('.answer-row button')).click(); }
  await wait(2000);
  await __snap2('11-too-fast');
  return document.getElementById('item').innerText.slice(0, 300);
})()
