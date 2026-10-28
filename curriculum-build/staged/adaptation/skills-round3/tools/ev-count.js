(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('[data-sit]')].find((b) => /Log it|Sit warm/.test(b.textContent));
  btn.click();
  await wait(1500);
  const set = (n, v) => { const i = document.querySelector(`input[name="${n}"]`); if (i) i.value = v; };
  set('left.makes', 9); set('left.attempts', 10); set('right.makes', 10); set('right.attempts', 10);
  const cam = document.querySelector('input[name=source][value=camera]'); if (cam) { cam.checked = true; cam.dispatchEvent(new Event('change', { bubbles: true })); }
  await wait(500);
  await __snap2('09-basketball-count');
  document.querySelector('.skill-count-form [type=submit]').click();
  await wait(2000);
  await __snap2('10-basketball-count-result');
  return document.querySelector('.skill-verdict') && document.querySelector('.skill-verdict').parentElement.textContent.trim().slice(0, 200);
})()
