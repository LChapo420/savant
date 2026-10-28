(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('[data-set]')].find((b) => /Practise/.test(b.textContent));
  btn.click();
  await wait(2500);
  await __snap2('06-practice-set-keys');
  const key = document.querySelector('.skill-keys [data-midi], .skill-keys button, .skill-keys [role=button]');
  if (key) key.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await wait(1500);
  await __snap2('07-practice-set-verdict');
  return document.querySelector('.skill-verdict') && document.querySelector('.skill-verdict').textContent;
})()
