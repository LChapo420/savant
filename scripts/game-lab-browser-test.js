/** Actual Chromium/CDP checks, no extra browser library. Start Chrome with
 * --remote-debugging-port=9227, then run this against localhost:7070. */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const registry = require('../game_registry.json');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const target = await (await fetch('http://localhost:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let seq = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) { const promise = pending.get(message.id); if (promise) { pending.delete(message.id); message.error ? promise.reject(new Error(message.error.message)) : promise.resolve(message.result); } }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  });
  function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
  async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:7070/game-lab' }); await delay(1200);
  assert.equal(await evaluate('document.querySelectorAll("#lab-games button:not(:disabled)").length'), 40);
  console.log('PASS lab lists 40 enabled game buttons');
  const problems = [];
  for (const engine of registry.engines) {
    // Moto X3M and Mario are full game blocks tested by their own browser tests
    // (moto-x3m-browser-test.js / mario-browser-test.js); they have no shared
    // RemadeGames buttons to drive here.
    if (engine.id === 'moto-x3m' || engine.id === 'mario') continue;
    errors.length = 0;
    await send('Page.navigate', { url: `http://localhost:7070/game-lab/play/${engine.id}` });
    let state;
    for (let i = 0; i < 30; i++) {
      await delay(100);
      state = await evaluate('({ready:!!document.querySelector("[data-game-end]:not(:disabled)"),title:document.title,status:document.querySelector("[data-game-status]")?.textContent})');
      if (state.ready) break;
    }
    if (!state.ready) { problems.push(`${engine.id}: did not initialize: ${state.status}`); continue; }
    await delay(150);
    const flow = await evaluate(`(async()=>{
      let buttons=[...document.querySelectorAll('[data-game-choice]')];
      if(buttons.length&&!buttons[0].disabled){buttons[0].click();if(document.querySelector('[data-game-continue]').hidden)throw Error('Feedback did not unlock Continue');document.querySelector('[data-game-continue]').click();}
      document.querySelector('[data-game-end]').click();
      const ended=document.querySelector('[data-game-modal]').dataset.open==='true';
      document.querySelector('[data-game-restart]').click();
      return {ended,restarted:document.querySelector('[data-game-modal]').dataset.open==='false',canvas:!!document.querySelector('canvas'),overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    if (!flow.ended || !flow.restarted || errors.length) problems.push(`${engine.id}: ${JSON.stringify({ flow, errors })}`);
    else console.log(`PASS browser ${engine.id}: load, controls, finish, replay`);
  }
  for (const id of ['hangman','pinball','ring-toss','coin-flip','air-hockey','duck-hunt','yahtzee']) {
    await send('Page.navigate',{url:`http://localhost:7070/game-lab/play/${id}`});await delay(400);
    const acceptance=await evaluate(`(async()=>{
      const api=RemadeGames.current,c=api.controller,id=${JSON.stringify(id)};
      async function correct(){const p=await(await fetch('/api/game-lab/'+id+'/payload')).json();const at=(PolymathGame.cursor.at-1)%p.questions.length;api.choose(p.questions[at].answerIndex);document.querySelector('[data-game-continue]').click();}
      if(id==='hangman'){await correct();return c.state().unlocked&&c.state().solved===0;}
      if(id==='pinball'){await correct();document.querySelectorAll('[data-game-action]')[0].click();const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Left flipper');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));const held=c.state().left;b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));return held&&!c.state().left&&document.querySelector('canvas').height===760;}
      if(id==='ring-toss'){const at=PolymathGame.cursor.at;c.throwRing(0,0);await new Promise(r=>setTimeout(r,1100));return api.phase()==='question'&&PolymathGame.cursor.at===at;}
      if(id==='coin-flip'){document.querySelector('[data-wager]').value=3;[...document.querySelectorAll('button')].find(b=>b.textContent==='Flip wagered coin').click();await correct();return c.state().points===8&&c.state().face==='Heads';}
      if(id==='air-hockey'){await correct();[...document.querySelectorAll('button')].find(b=>b.textContent==='Serve').click();const canvas=document.querySelector('canvas'),box=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:box.left+box.width*.35,clientY:box.top+box.height*.2,bubbles:true}));return c.state().you.x>200&&c.state().you.x<320&&c.state().you.y<100;}
      if(id==='duck-hunt'){const at=PolymathGame.cursor.at;c.shoot(0,0);return api.phase()==='question'&&PolymathGame.cursor.at===at&&document.querySelectorAll('[data-game-choice]').length===4;}
      if(id==='yahtzee'){const at=PolymathGame.cursor.at;c.roll();c.state().held[0]=true;const value=c.state().dice[0];c.roll();c.roll();return c.state().rolls===3&&c.state().dice[0]===value&&PolymathGame.cursor.at===at;}
      return false;
    })()`);
    if(!acceptance)problems.push(id+': correction browser acceptance failed');else console.log('PASS browser corrected interaction '+id);
  }
  await send('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
  for (const id of ['tetris', 'air-hockey', 'memory-match','mancala','snakes-and-ladders','pinball','mario','moto-x3m']) {
    await send('Page.navigate', { url:`http://localhost:7070/game-lab/play/${id}` }); await delay(450);
    const overflow = await evaluate('document.documentElement.scrollWidth>innerWidth');
    if (overflow) problems.push(`${id}: mobile horizontal overflow`); else console.log(`PASS mobile layout ${id}`);
  }
  const screenshot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
  const screenshotPath = path.join(require('os').tmpdir(),'polymath-game-lab-mobile.png'); fs.writeFileSync(screenshotPath,Buffer.from(screenshot.data,'base64'));
  console.log('Screenshot: '+screenshotPath);
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.navigate', { url:'http://localhost:7070/game-lab' }); await delay(500);
  errors.length=0;
  await evaluate('document.querySelector("#lab-games button").click()'); await delay(700);
  const frameWorks = await evaluate('document.querySelector("#lab-frame").contentDocument?.querySelector("[data-game-end]")!==null');
  if (!frameWorks || errors.length) problems.push('Embedded game iframe failed: '+errors.join('; '));else console.log('PASS embedded same-origin CSP-safe game frame');
  problems.forEach(problem=>console.error('FAIL '+problem));
  await fetch(`http://localhost:9227/json/close/${target.id}`);ws.close();
  console.log(`${registry.engines.length-problems.length}/${registry.engines.length} actual-browser engine checks passed`);
  process.exitCode=problems.length?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});