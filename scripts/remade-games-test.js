/** Gameplay-aware tests with fake time and a canvas drawing stub. The stub tests
 * physics/state, not browser pixel output. No database writes or model calls. */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const registry = require('../game_registry.json');
function checkEngine(id) {
  if (id === 'tetris') return require('./tetris-test').run().problems;
  const problems = [], errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="game-root"></div>', { runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:vc });
  const w = dom.window, ctx = new Proxy({}, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target,key,value) { target[key]=value;return true; } });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  let now=0,tid=0;const timers=new Map(),frames=new Map();
  w.setTimeout=(fn,ms)=>{const id=++tid;timers.set(id,{fn,at:now+ms});return id;};w.clearTimeout=(id)=>timers.delete(id);
  w.requestAnimationFrame=(fn)=>{const id=++tid;frames.set(id,fn);return id;};w.cancelAnimationFrame=(id)=>frames.delete(id);
  function advance(seconds){for(let t=0;t<seconds;t+=.02){now+=20;for(const [id,item] of [...timers])if(item.at<=now){timers.delete(id);item.fn();}const callbacks=[...frames];frames.clear();callbacks.forEach(([,fn])=>fn(now));}}
  const cursor={at:0,next(total){const index=this.at%total,wrapped=this.at>0&&index===0;this.at++;return {index,wrapped};}};
  w.PolymathGame={cursor,nextLevelUrl:'/game-lab'};
  const events=[];['start','answer','win','lose','draw'].forEach(name=>w.addEventListener('game:'+name,e=>events.push({name,...e.detail})));
  w.addEventListener('error',e=>errors.push(e.message));
  for(const file of ['remade.js','boards.js','arcade.js'])w.eval(fs.readFileSync(path.join(ROOT,'public','games',file),'utf8'));
  const payload={meta:{topic:'Ethos, logos, pathos'},questions:Array.from({length:50},(_,i)=>({id:'q'+(i+1),prompt:'Which appeal is illustrated by example '+(i+1)+'?',choices:['Ethos','Logos','Pathos','Kairos'],answerIndex:i%4,explanation:'Because the example uses the specified appeal.'})),feedback:{}};
  w.GAME_ID=id;w.initGame=(data)=>w.RemadeGames.start(id,data);
  const root=w.document.getElementById('game-root');
  const q=(name)=>root.querySelector('[data-game-'+name+']');
  const click=(button)=>{assert.ok(button,'expected button');if(!button.disabled)button.click();};
  const button=(text)=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
  function answer(right=true){assert.equal(w.RemadeGames.current.phase(),'question');const n=(cursor.at-1)%50,at=right?payload.questions[n].answerIndex:(payload.questions[n].answerIndex+1)%4;w.RemadeGames.current.choose(at);click(q('continue'));}
  function test(name,fn){try{fn();}catch(e){problems.push(id+' '+name+': '+e.message);}}
  let api,controller;
  test('initialization',()=>{api=w.initGame(payload);controller=api.controller;assert.ok(controller);assert.equal(events[0].name,'start');assert.equal(q('next').getAttribute('href'),'/game-lab');advance(.1);});
  if(!controller){dom.window.close();return problems;}
  test('game-specific rules',()=>{
    if(id==='tic-tac-toe'||id==='connect-four'){answer(true);controller.play(0);assert.ok(controller.state.includes(1));assert.ok(controller.state.includes(2));assert.equal(api.phase(),'question');answer(false);assert.equal(controller.state.filter(v=>v===2).length,2);}
    else if(id==='mancala'){assert.equal(controller.state.reduce((a,b)=>a+b,0),48);answer(true);controller.play(0);assert.equal(controller.state.reduce((a,b)=>a+b,0),48);assert.ok(controller.state[0]<4);}
    else if(id==='memory-match'){controller.select(0);const other=controller.state.deck.findIndex((v,i)=>i!==0&&v===controller.state.deck[0]);controller.select(other);assert.equal(controller.state.matched.size,2);assert.equal(cursor.at,0);const a=controller.state.deck.findIndex((v,i)=>!controller.state.matched.has(i)),b=controller.state.deck.findIndex((v,i)=>!controller.state.matched.has(i)&&v!==controller.state.deck[a]);controller.select(a);controller.select(b);click(button('Next pair'));answer(false);assert.equal(api.phase(),'question');answer(true);assert.equal(controller.state.open().length,0);}
    else if(id==='bingo'){controller.state.calls.push(controller.state.numbers[0]);click(button('Call next ball'));const called=controller.state.called();answer(false);assert.equal(controller.state.called(),called);answer(true);controller.mark(0);assert.equal(controller.state.marks[0],true);}
    else if(id==='blackjack'){assert.equal(controller.value([{rank:1},{rank:1},{rank:9}]),21);click(button('Deal next hand'));answer(true);assert.equal(controller.state().you.length,2);if(api.phase()==='play'&&!button('Stand').disabled)click(button('Stand'));assert.equal(controller.state().hands,1);}
    else if(id==='yahtzee'){assert.equal(controller.value([1,2,3,4,5],10),40);assert.equal(controller.value([3,3,3,3,3],11),50);assert.equal(controller.value([2,2,2,5,5],8),25);controller.roll();const held=controller.state().dice[0];controller.state().held[0]=true;controller.roll();controller.roll();assert.equal(controller.state().rolls,3);assert.equal(controller.state().dice[0],held);assert.equal(cursor.at,0);controller.scoreCategory(12);assert.equal(controller.state().open[12],false);assert.equal(api.phase(),'question');answer(false);assert.equal(api.phase(),'question');answer(true);assert.equal(controller.state().rolls,0);}
    else if(id==='war'){controller.play();if(api.phase()==='question')answer(true);const s=controller.state();assert.equal(s.you.length+s.bot.length+s.pot.length,52);}
    else if(id==='trash'){controller.draw();if(api.phase()==='question')answer(true);assert.equal(controller.state.you.length,10);}
    else if(id==='uno'){const s=controller.state(),at=s.hand.findIndex(controller.legal);if(at>=0)controller.play(at);else click(button('Draw (question)'));if(api.phase()==='question')answer(false);assert.ok(controller.state().hand.length>=0);}
    else if(id==='hangman'){answer(false);assert.equal(controller.state().unlocked,false);answer(true);const word=controller.state().word;controller.guess(word[0]);assert.equal(controller.state().guesses.size,1);assert.equal(controller.state().solved,0);assert.equal(api.phase(),'question');const missing='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c=>!word.includes(c));answer(true);controller.guess(missing);assert.equal(controller.state().misses,1);}
    else if(id==='spot-it'){const s=controller.state();click([...root.querySelectorAll('[data-symbol]')].find(b=>b.dataset.symbol===s.match));assert.equal(controller.state().you,1);}
    else if(id==='simon-says'){advance(1);assert.equal(api.phase(),'question');answer(true);const seq=controller.state.slice();controller.press(seq[0]);assert.equal(controller.state.length,2);}
    else if(id==='coin-flip'){root.querySelector('[data-wager]').value=3;click(button('Flip wagered coin'));answer(true);assert.equal(controller.state().points,8);root.querySelector('[data-wager]').value=8;click(button('Flip wagered coin'));answer(false);assert.equal(controller.state().points,5);assert.equal(controller.state().face,'Tails');}
    else if(['hot-air-balloon','tug-of-war'].includes(id)){const before=controller.state();click(button(id==='hot-air-balloon'?'Try to rise':'Heave the rope'));answer(true);assert.equal(controller.state(),before+1);}
    else if(id==='snake'){answer(true);click(button('Start snake'));const before=controller.state().snake[0].x;controller.step();assert.equal(controller.state().snake[0].x,before+1);controller.steer(-1,0);controller.step();assert.equal(controller.state().direction.x,1);}
    else if(['dino-runner','flappy-bird'].includes(id)){answer(true);click(button('Start / restart run'));assert.equal(controller.state().running,true);advance(.2);assert.ok(controller.state().objects.length===0);controller.crash();assert.equal(api.phase(),'question');}
    else if(['mario','moto-x3m'].includes(id)){assert.equal(api.phase(),'play');assert.equal(controller.state().running,true);controller.key('ArrowRight');advance(.4);assert.ok(controller.state().player.x>80);controller.crash();assert.equal(api.phase(),'question');answer(false);assert.equal(controller.state().running,false);answer(true);assert.equal(controller.state().running,true);}
    else if(['ping-pong','pong-breakout','pinball'].includes(id)){answer(false);assert.equal(api.phase(),'question');answer(true);click(button(id==='pinball'?'Launch ball':'Serve'));const before=controller.state().ball.x;advance(id==='pinball'?.9:.2);assert.notEqual(controller.state().ball.x,before);if(id==='pinball'){controller.key('ArrowLeft');assert.equal(controller.state().left,true);root.dispatchEvent(new w.KeyboardEvent('keyup',{key:'ArrowLeft',bubbles:true}));assert.equal(controller.state().left,false);assert.equal(root.querySelector('canvas').height,760);}}
    else if(id==='air-hockey'){answer(true);click(button('Serve'));const s=controller.state();s.puck.x=24;s.puck.y=60;s.puck.vx=-200;advance(.05);assert.equal(s.points[1],0);assert.ok(s.puck.vx>0);s.puck.x=24;s.puck.y=200;s.puck.vx=-200;advance(.05);assert.equal(controller.state().points[1],1);}
    else if(['archery','free-throw','whack-a-mole'].includes(id)){click(button('Prepare next shot'));answer(true);assert.equal(controller.state().armed,true);controller.fire();if(id!=='whack-a-mole')assert.ok(controller.state().projectile);advance(4);assert.ok(controller.state().shots>0);}
    else if(id==='bowling'){click(button('Prepare next ball'));answer(true);controller.fire();assert.ok(controller.state().ball);assert.equal(root.querySelectorAll('input[type="range"]').length,3);advance(4);assert.equal(controller.state().ball,null);assert.ok(controller.state().pins.some(p=>!p.standing)||controller.state().frame>1);}
    else if(id==='ring-toss'){const at=cursor.at;controller.throwRing(0,0);advance(1);assert.equal(cursor.at,at);assert.equal(api.phase(),'question');controller.throwRing(0,85);advance(1);assert.equal(api.phase(),'question');assert.equal(cursor.at,at);const bottle=controller.state().bottles[payload.questions[(at-1)%50].answerIndex];controller.throwRing((320-bottle.x)/(3*.9),(350-bottle.y)/(3*.9));advance(1);assert.equal(api.phase(),'feedback');click(q('continue'));assert.equal(controller.state().points,1);}
    else if(id==='duck-hunt'){const at=cursor.at;controller.shoot(0,0);assert.equal(cursor.at,at);const d=controller.state().ducks[0];const x=d.x;advance(.2);assert.notEqual(d.x,x);controller.shoot(d.x,d.y);assert.equal(api.phase(),'feedback');click(q('continue'));assert.equal(cursor.at,at+1);}
    else if(id==='crossy-road'){if(api.phase()==='question')answer(true);const y=controller.state.player.y;controller.move(0,-1);assert.equal(controller.state.player.y,y-45);const x=controller.state.cars[0].x;advance(.2);assert.notEqual(controller.state.cars[0].x,x);}
    else if(id==='pac-man'){assert.equal(controller.legal(0,0),false);assert.equal(controller.legal(1,1),true);const count=controller.state().dots.size;advance(.3);assert.ok(controller.state().dots.size<count);}
    else if(id==='capture-the-flag'){answer(true);controller.move(0,-1);assert.equal(controller.state.you.y,3);assert.equal(api.phase(),'question');}
    else if(id==='hole-io'){const s=controller.state;s.hole.x=s.objects[0].x;s.hole.y=s.objects[0].y;advance(.05);assert.ok(s.objects.length<35);}
    else if(id==='tower-defense'){click(button('Build tower / start wave'));answer(true);advance(1);assert.equal(controller.state().towers.length,1);assert.ok(controller.state().enemies.length>0);}
    else if(id==='tiny-fishing'){click(button('Cast'));advance(.2);assert.ok(controller.state().hook.y>40);click(button('Upgrade depth / hook'));answer(true);assert.equal(controller.state().capacity,3);}
    else if(id==='eight-ball-pool'){answer(true);const s=controller.state(),x=s.cue.x;assert.equal(new Set(s.balls.filter(b=>b.number).map(b=>b.number)).size,15);assert.equal(s.balls[5].number,8);assert.equal(s.balls[11].type,1);assert.equal(s.balls[15].type,2);controller.fire();advance(.2);assert.notEqual(controller.state().cue.x,x);const own=controller.state().balls.find(b=>b.type===1);controller.pot(own);controller.settle();assert.equal(controller.state().armed,true);assert.equal(api.phase(),'play');controller.fire();controller.settle();assert.equal(controller.state().turn,'bot');}
    else if(id==='snakes-and-ladders'){click(button('Roll dice'));answer(true);assert.equal(controller.state[0],0);advance(1.2);assert.ok(controller.state[0]>0);assert.match(root.querySelector('.rg-die').getAttribute('aria-label'),/Rolled [1-6]/);}
    else assert.fail('missing gameplay assertion');
  });
  test('reported correction acceptance cases',()=>{
    api=w.initGame(payload);controller=api.controller;
    if(id==='coin-flip'){
      for(let i=0;i<10;i++){root.querySelector('[data-wager]').value=1;click(button('Flip wagered coin'));answer(true);}
      assert.equal(api.phase(),'over');assert.equal(q('keep-playing').hidden,false);const bankroll=controller.state().points;click(q('keep-playing'));assert.equal(api.phase(),'play');assert.equal(controller.state().points,bankroll);
    }else if(id==='blackjack'){
      assert.equal(controller.state().coins,100);root.querySelector('[data-wager]').value=25;click(button('Deal next hand'));answer(false);assert.equal(controller.state().coins,100);assert.equal(controller.state().hands,0);answer(true);assert.equal(controller.state().bet,25);assert.equal(controller.state().hands,1);
      if(!button('Stand').disabled)click(button('Stand'));
      for(let i=1;i<5;i++){root.querySelector('[data-wager]').value=1;click(button('Deal next hand'));answer(true);if(api.phase()==='play'&&!button('Stand').disabled)click(button('Stand'));}
      assert.equal(api.phase(),'over');assert.equal(q('keep-playing').hidden,false);click(q('keep-playing'));assert.equal(controller.state().hands,5);
    }else if(id==='mancala'){
      answer(true);controller.state[5]=1;const count=cursor.at;controller.play(5);assert.equal(cursor.at,count);assert.equal(api.phase(),'play');assert.ok(root.querySelector('.rg-mancala .rg-stone'));controller.play(0);assert.equal(controller.state.reduce((a,b)=>a+b,0),45);
    }else if(id==='capture-the-flag'){
      answer(true);controller.move(1,0);assert.equal(controller.state.bot.y,0);answer(true);controller.move(0,-1);assert.equal(controller.state.bot.y,1);answer(false);assert.equal(controller.state.bot.y,2);
    }else if(id==='spot-it'){
      advance(4.3);assert.equal(api.phase(),'play');advance(.3);assert.equal(api.phase(),'question');answer(true);assert.equal(controller.state().you,1);assert.equal(controller.state().bot,0);
    }else if(id==='simon-says'){
      advance(.1);assert.ok(root.querySelector('.rg-simon-glow'));
    }else if(id==='uno'){
      const s=controller.state();s.top.color=0;s.top.value=3;s.hand.splice(0,s.hand.length,{color:1,value:5});controller.requestDraw(1);answer(false);assert.equal(controller.state().hand.length,1);assert.equal(api.phase(),'question');answer(true);assert.ok(controller.state().hand.length>=2);assert.ok(!q('modal')||q('modal').dataset.open==='false');
    }else if(id==='pac-man'){
      for(let i=0;i<6;i++){controller.die();answer(false);assert.equal(controller.state().alive,false);answer(true);assert.equal(controller.state().alive,true);}assert.equal(controller.state().deaths,6);
      const s=controller.state(),seen=new Set(['1,1']),todo=[{x:1,y:1}];while(todo.length){const p=todo.pop();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=x+','+y;if(controller.legal(x,y)&&!seen.has(k)){seen.add(k);todo.push({x,y});}}}assert.ok([...s.dots].every(k=>seen.has(k)),'all dots must be reachable');
    }else if(['snake','crossy-road','pac-man'].includes(id)){
      assert.equal(root.querySelectorAll('.rg-dpad [data-direction]').length,4);
    }else if(id==='duck-hunt'){
      for(let i=0;i<7;i++){const at=(cursor.at-1)%50,d=controller.state().ducks[payload.questions[at].answerIndex];controller.shoot(d.x,d.y);click(q('continue'));}assert.equal(api.phase(),'over');click(q('keep-playing'));assert.equal(api.phase(),'question');assert.equal(controller.state().points,7);
    }else if(id==='pinball'){answer(true);click(button('Launch ball'));const s=controller.state();assert.equal(s.running,true);advance(1.2);assert.ok(s.ball.y<600,'ball should enter the playfield above the launch lane');assert.ok(s.ball.x<417);const left=button('Left flipper');left.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true}));assert.equal(controller.state().left,true);left.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true}));assert.equal(controller.state().left,false);}
    else if(id==='spot-it'){const before=controller.state().bot;controller.choose('__wrong__');assert.equal(controller.state().bot,before+1);assert.equal(controller.state().round,2);const r=controller.state().round;controller.choose(controller.state().match);assert.equal(controller.state().round,r+1,'each press starts a fresh round, so one icon per round');}
    else if(id==='pong-breakout'){
      answer(true);click(button('Serve'));for(let i=1;i<10;i++){const s=controller.state();s.ball.y=416;s.ball.vy=200;advance(.03);answer(true);if(api.phase()==='play')click(button('Serve'));}assert.equal(api.phase(),'over');assert.equal(q('keep-playing').hidden,false);
    }else if(id==='yahtzee'){
      const questionCount=cursor.at;controller.roll();const before=controller.state().dice.slice();controller.state().held.fill(true);controller.state().held[4]=false;const original=w.Math.random;w.Math.random=()=>.99;controller.roll();controller.roll();w.Math.random=original;assert.deepEqual(controller.state().dice.slice(0,4),before.slice(0,4));assert.equal(controller.state().dice[4],6);assert.equal(cursor.at,questionCount);
    }
  });
  test('pause, answer locking, finish and replay lifecycle',()=>{
    api=w.initGame(payload);controller=api.controller;
    if(api.phase()==='question'){
      const at=(cursor.at-1)%50,choice=root.querySelector('[data-game-choice="'+payload.questions[at].answerIndex+'"]');
      const before=events.filter(e=>e.name==='answer').length;api.choose(payload.questions[at].answerIndex);choice.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(events.filter(e=>e.name==='answer').length,before+1);
      assert.equal(api.phase(),'feedback');assert.equal(q('continue').hidden,false);
    }
    click(q('pause'));assert.equal(api.isPaused(),true);advance(.5);click(q('pause'));assert.equal(api.isPaused(),false);
    click(q('end'));assert.equal(q('modal').dataset.open,'true');assert.equal(events.at(-1).name,'draw');
    const before=cursor.at;click(q('restart'));assert.equal(q('modal').dataset.open,'false');assert.ok(cursor.at>=before);assert.equal(frames.size,1);
    for(let i=0;i<5;i++)w.initGame(payload);assert.equal(frames.size,1);
    w.dispatchEvent(new w.Event('blur'));assert.equal(w.RemadeGames.current.isPaused(),true);
    w.RemadeGames.dispose();assert.equal(frames.size,0);assert.equal(timers.size,0);
    assert.deepEqual(errors,[]);
  });
  test('long-play simulation never throws, double-ends, or creates duplicate loops',()=>{
    api=w.initGame(payload);controller=api.controller;
    for(let step=0;step<240;step++){
      if(api.phase()==='over')break;
      if(api.phase()==='question'){answer(step%4!==0);continue;}
      const candidates=[...root.querySelectorAll('button')].filter(b=>!b.disabled&&!b.hidden&&!b.hasAttribute('data-game-pause')&&!b.hasAttribute('data-game-end')&&!b.hasAttribute('data-game-restart')&&!b.hasAttribute('data-game-continue')&&!b.hasAttribute('data-game-choice'));
      if(candidates.length)click(candidates[step%candidates.length]);
      const canvas=root.querySelector('canvas');
      if(canvas){canvas.dispatchEvent(new w.MouseEvent('pointermove',{clientX:80+step%6*90,clientY:140+step%3*60,bubbles:true}));canvas.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:80+step%6*90,clientY:140+step%3*60,bubbles:true}));canvas.dispatchEvent(new w.MouseEvent('pointerup',{clientX:80+step%6*90,clientY:140+step%3*60,bubbles:true}));}
      advance(.35);
    }
    assert.deepEqual(errors,[]);assert.equal(frames.size,1);
    const answers=events.filter(e=>e.name==='answer');
    assert.ok(answers.every(e=>typeof e.correct==='boolean'&&e.questionId&&Number.isInteger(e.questionIndex)&&e.ms>=0));
    w.RemadeGames.dispose();assert.equal(frames.size,0);assert.equal(timers.size,0);
  });
  dom.window.close();return problems;
}
function main(){const ids=process.argv.slice(2).filter(id=>id!=='--certify');const engines=ids.length?ids:registry.engines.map(e=>e.id);const status={};let failed=0;for(const id of engines){const problems=checkEngine(id);if(problems.length){failed++;console.log('FAIL '+id);problems.forEach(p=>console.log('  '+p));}else{status[id]='ready';console.log('PASS '+id);}}if(process.argv.includes('--certify'))fs.writeFileSync(path.join(ROOT,'public','games','remade-status.json'),JSON.stringify(status,null,2));console.log(`${engines.length-failed}/${engines.length} remade engines pass gameplay tests`);process.exitCode=failed?1:0;}
module.exports={checkEngine};if(require.main===module)main();