/** Real Chromium check for the full Moto X3M Phaser game block. Start Chrome
 * with --remote-debugging-port=9227, then run against localhost:7070. */
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
  await send('Page.navigate', { url: 'http://localhost:7070/game-lab/play/moto-x3m' });

  let booted = false;
  for (let i = 0; i < 40; i++) {
    await delay(250);
    booted = await evaluate('!!(window.__mx3mGate && document.querySelector("#content canvas"))');
    if (booted) break;
  }
  assert.ok(booted, 'Phaser should boot and render a canvas with the crash gate installed');
  console.log('PASS moto-x3m: Phaser booted (canvas + __mx3mGate)');

  // The game canvas must scale to fill its frame (not stay clipped at 720x480).
  const scaled = await evaluate('!!(window.Phaser && Phaser.GAMES && Phaser.GAMES[0] && Phaser.GAMES[0].scale && Phaser.GAMES[0].scale.scaleMode === Phaser.ScaleManager.SHOW_ALL)');
  assert.ok(scaled, 'game should use SHOW_ALL scaling to fit the frame');
  console.log('PASS moto-x3m: canvas scales to fit (SHOW_ALL)');

  assert.ok(await evaluate('!!(window.GAME_DATA && Array.isArray(window.GAME_DATA.questions) && window.GAME_DATA.questions.length)'), 'GAME_DATA questions should be injected');
  console.log('PASS moto-x3m: GAME_DATA questions injected (fill format)');

  await evaluate('window.__mx3mGate.onDeath()'); await delay(150);
  const gate = await evaluate('({blocking:window.__mx3mGate.blocking(),prompt:document.getElementById("mx3m-math-q").textContent,choices:document.querySelectorAll("#mx3m-math-choices button").length})');
  assert.ok(gate.blocking, 'crash should open the gate');
  assert.equal(gate.choices, 4, 'gate should show exactly 4 choices');
  assert.ok(gate.prompt && gate.prompt.length > 2, 'gate should show a prompt');
  console.log('PASS moto-x3m: crash gate shows a 4-choice GAME_DATA question');

  const revived = await evaluate(`(async()=>{
    const prompt=document.getElementById('mx3m-math-q').textContent;
    const q=window.GAME_DATA.questions.find(q=>q.prompt===prompt);
    document.querySelector('#mx3m-math-choices button[data-index="'+q.answerIndex+'"]').click();
    await new Promise(r=>setTimeout(r,120));
    return !window.__mx3mGate.blocking();
  })()`);
  assert.ok(revived, 'correct answer should revive (close the gate)');
  console.log('PASS moto-x3m: correct answer revives');

  await evaluate('window.__mx3mGate.onDeath()'); await delay(150);
  const wrong = await evaluate(`(async()=>{
    const prompt=document.getElementById('mx3m-math-q').textContent;
    const q=window.GAME_DATA.questions.find(q=>q.prompt===prompt);
    const bad=[...document.querySelectorAll('#mx3m-math-choices button')].find(b=>Number(b.dataset.index)!==q.answerIndex);
    bad.click(); await new Promise(r=>setTimeout(r,120));
    return {blocking:window.__mx3mGate.blocking(),fb:document.getElementById('mx3m-math-fb').textContent,next:getComputedStyle(document.getElementById('mx3m-math-next')).display!=='none'};
  })()`);
  assert.ok(wrong.blocking, 'wrong answer should keep the gate open (retry)');
  assert.match(wrong.fb, /Correct:/, 'wrong answer should reveal the correct answer');
  assert.ok(wrong.next, 'wrong answer should offer the next question');
  console.log('PASS moto-x3m: wrong answer reveals answer + advances to next question');

  // Portrait on a handheld shows the rotate prompt; landscape hides it.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.dispatchEvent(new Event("resize"))'); await delay(150);
  assert.equal(await evaluate('document.getElementById("mx3m-rotate").className'), 'show', 'portrait should show the rotate prompt');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.dispatchEvent(new Event("resize"))'); await delay(150);
  assert.equal(await evaluate('document.getElementById("mx3m-rotate").className'), '', 'landscape should hide the rotate prompt');
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('PASS moto-x3m: rotate prompt shows in portrait, hides in landscape');

  assert.deepEqual(errors, [], 'no console/CSP/script errors');
  console.log('PASS moto-x3m: no browser errors');
  await fetch(`http://localhost:9227/json/close/${target.id}`); ws.close();
  console.log('All moto-x3m browser checks passed');
  process.exitCode = 0;
})().catch((e) => { console.error('FAIL moto-x3m:', e.message); try { process.exit(1); } catch (_) {} });