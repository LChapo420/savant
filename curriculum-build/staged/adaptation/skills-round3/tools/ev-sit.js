(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('[data-sit]')].find((b) => /Sit it/.test(b.textContent));
  btn.click();
  await wait(2500);
  await __snap2('03-stage-check-question');
  for (let k = 0; k < 20; k++) {
    const nm = document.querySelector('[data-nomate]');
    if (!nm) break;
    nm.click();
    await wait(700);
  }
  await wait(2000);
  await __snap2('04-stage-check-result', true);
  return document.querySelector('.skill-verdict') && document.querySelector('.skill-verdict').textContent;
})()
