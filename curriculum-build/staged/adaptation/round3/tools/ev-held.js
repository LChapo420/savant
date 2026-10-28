(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(2500);
  const item = document.getElementById('item');
  const choice = item && item.querySelector('.choice');
  if (choice) choice.click();
  else if (item) {
    const input = item.querySelector('input, textarea');
    input.value = '3'; input.dispatchEvent(new Event('input', { bubbles: true }));
    (item.querySelector('.answer-row button') || [...item.querySelectorAll('button')].pop()).click();
  }
  await wait(5000);
  await __snap2('09-held-recap', true);
  return document.body.innerText.slice(0, 400);
})()
