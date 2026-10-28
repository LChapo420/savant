(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const answerOne = async (k) => {
    const item = document.getElementById('item');
    const choice = item.querySelector('.choice');
    if (choice) choice.click();
    else {
      const input = item.querySelector('input, textarea');
      input.value = k % 3 === 0 ? 'not sure' : '5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = [...item.querySelectorAll('button')].find((b) => /check|submit|answer/i.test(b.textContent)) || item.querySelector('.answer-row button');
      btn.click();
    }
    await wait(1200);
  };
  document.getElementById('start').click();
  await wait(2000);
  await __snap2('03-review-question');
  await answerOne(1);
  await __snap2('04-review-verdict');
  for (let k = 2; k < 30; k++) {
    const next = document.querySelector('[data-act="next"]');
    if (!next) break;
    next.click();
    await wait(1500);
    if (!document.getElementById('item')) break;
    await answerOne(k);
  }
  await wait(2500);
  await __snap2('05-review-done', true);
  return document.querySelector('h1') && document.querySelector('h1').textContent;
})()
