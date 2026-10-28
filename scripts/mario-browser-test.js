/** Real Chromium check for the Mario game block. Start Chrome with
 * --remote-debugging-port=9227, then run against localhost:7070. */
const assert = require('node:assert/strict');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const target = await (await fetch('http://localhost:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let seq = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) { const p = pending.get(message.id); if (p) { pending.delete(message.id); message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result); } }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:7070/game-lab/play/mario' });

  let booted = false;
  for (let i = 0; i < 40; i++) {
    await delay(250);
    booted = await evaluate('!!(window.Mario && window.Mario.requireMathToRevive && document.querySelector("canvas"))');
    if (booted) break;
  }
  assert.ok(booted, 'game should boot with a canvas and the revive gate');
  console.log('PASS mario: game booted (canvas + requireMathToRevive)');

  assert.ok(await evaluate('!!(window.GAME_DATA && Array.isArray(window.GAME_DATA.questions) && window.GAME_DATA.questions.length)'), 'GAME_DATA questions should be injected');
  console.log('PASS mario: GAME_DATA questions injected (fill format)');

  await evaluate('window.Mario.requireMathToRevive(function(){ window.__marioRevived = true; })'); await delay(150);
  const gate = await evaluate('({open:!document.getElementById("math-overlay").classList.contains("hidden"),prompt:(document.querySelector(".math-question")||{}).textContent,choices:document.querySelectorAll(".math-option").length})');
  assert.ok(gate.open, 'death should open the gate');
  assert.equal(gate.choices, 4, 'gate should show exactly 4 choices');
  assert.ok(gate.prompt && gate.prompt.length > 2, 'gate should show a prompt');
  console.log('PASS mario: death gate shows a 4-choice GAME_DATA question');

  const revived = await evaluate(`(async()=>{
    const prompt=document.querySelector('.math-question').textContent;
    const q=window.GAME_DATA.questions.find(q=>q.prompt===prompt);
    document.querySelectorAll('.math-option')[q.answerIndex].click();
    await new Promise(r=>setTimeout(r,120));
    return {hidden:document.getElementById('math-overlay').classList.contains('hidden'), revived:!!window.__marioRevived};
  })()`);
  assert.ok(revived.hidden && revived.revived, 'correct answer should revive (close the gate and run the callback)');
  console.log('PASS mario: correct answer revives');

  await evaluate('window.Mario.requireMathToRevive(function(){})'); await delay(150);
  const wrong = await evaluate(`(async()=>{
    const prompt=document.querySelector('.math-question').textContent;
    const q=window.GAME_DATA.questions.find(q=>q.prompt===prompt);
    const btns=[...document.querySelectorAll('.math-option')];
    btns.find((b,i)=>i!==q.answerIndex).click();
    await new Promise(r=>setTimeout(r,120));
    return {open:!document.getElementById('math-overlay').classList.contains('hidden'),fb:document.querySelector('.math-feedback').textContent,next:!document.querySelector('.math-next').hidden};
  })()`);
  assert.ok(wrong.open, 'wrong answer should keep the gate open (retry)');
  assert.match(wrong.fb, /Correct:/, 'wrong answer should reveal the correct answer');
  assert.ok(wrong.next, 'wrong answer should offer the next question');
  console.log('PASS mario: wrong answer reveals answer + advances to next question');

  // Portrait on a handheld shows the rotate prompt; landscape hides it.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.dispatchEvent(new Event("resize"))'); await delay(150);
  assert.equal(await evaluate('document.getElementById("mx3m-rotate").className'), 'show', 'portrait should show the rotate prompt');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.dispatchEvent(new Event("resize"))'); await delay(150);
  assert.equal(await evaluate('document.getElementById("mx3m-rotate").className'), '', 'landscape should hide the rotate prompt');
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('PASS mario: rotate prompt shows in portrait, hides in landscape');

  assert.deepEqual(errors, [], 'no console/CSP/script errors');
  console.log('PASS mario: no browser errors');
  await fetch(`http://localhost:9227/json/close/${target.id}`); ws.close();
  console.log('All mario browser checks passed');
  process.exitCode = 0;
})().catch((e) => { console.error('FAIL mario:', e.message); try { process.exit(1); } catch (_) {} });