/* Real-time engines. Fixed world coordinates, dt-based physics, explicit
 * question gates, pointer/keyboard controls. No educational text in mechanics. */
(function(){
  'use strict';
  var R=window.RemadeGames;
  function rand(n){return Math.floor(Math.random()*n);}
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function field(g){
    var canvas=g.canvas(),ctx=canvas.getContext('2d'),keys={},pointer={x:320,y:200,down:false},buttons=g.node('div',null,'rg-controls');g.stage.append(buttons);
    function position(e){var box=canvas.getBoundingClientRect();pointer.x=clamp((e.clientX-box.left)*640/(box.width||640),0,640);pointer.y=clamp((e.clientY-box.top)*400/(box.height||400),0,400);}
    g.listen(canvas,'pointerdown',function(e){if(!g.active())return;position(e);pointer.down=true;canvas.focus();if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);if(f.down)f.down(pointer);});
    g.listen(canvas,'pointermove',function(e){position(e);if(g.active()&&f.move)f.move(pointer);});
    g.listen(canvas,'pointerup',function(e){position(e);pointer.down=false;if(g.active()&&f.up)f.up(pointer);});
    g.listen(canvas,'pointercancel',function(){pointer.down=false;if(f.cancel)f.cancel();});
    g.listen(g.root,'keyup',function(e){keys[e.key.toLowerCase()]=false;});
    g.listen(window,'blur',function(){keys={};pointer.down=false;});
    var f={canvas:canvas,ctx:ctx,pointer:pointer,
      key:function(name,repeat){keys[name.toLowerCase()]=true;return ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','w','a','s','d'].includes(name);},
      pressed:function(name){return !!keys[name.toLowerCase()];},
      controls:function(labels,fn){labels.forEach(function(label,i){g.button(label,function(){fn(i);},buttons);});},
      clear:function(){ctx.fillStyle='#0b1428';ctx.fillRect(0,0,640,400);},
      rect:function(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);},
      circle:function(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();},
      text:function(text,x,y,size,color){ctx.font=(size||18)+'px system-ui';ctx.fillStyle=color||'#f1f5ff';ctx.fillText(text,x,y);},
      line:function(x,y,xx,yy,color,width){ctx.strokeStyle=color||'#94a3b8';ctx.lineWidth=width||2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();},
      resetInput:function(){keys={};pointer.down=false;}
    };return f;
  }
  function buttonGate(g,label,fn,text){return g.button(label,function(){g.ask(fn,text);});}

  ['ping-pong','air-hockey','pong-breakout','pinball'].forEach(function(id){R.register(id,function(g){
    var f=field(g),ball={x:320,y:200,vx:190,vy:160,r:8},paddle=320,bot=200,running=false,armed=false,you=0,them=0,balls=0;
    var breakout=id==='pong-breakout',pinball=id==='pinball',hockey=id==='air-hockey';
    var bricks=Array.from({length:24},function(_,i){return {x:40+(i%8)*70,y:40+Math.floor(i/8)*26,w:64,h:20,alive:true};});
    var bumpers=[{x:220,y:115,r:28},{x:420,y:115,r:28},{x:320,y:200,r:24}],flippers=[false,false];
    var serve=g.button(pinball?'Launch ball':'Serve',function(){if(!armed||running)return;armed=false;running=true;ball={x:pinball?585:320,y:pinball?330:breakout?320:200,vx:pinball?-150:190,vy:pinball?-450:breakout?-240:160,r:8};serve.disabled=true;});
    function gate(){running=false;armed=false;serve.disabled=true;g.ask(function(right){if(right){armed=true;serve.disabled=false;g.status('Ready. Press '+(pinball?'Launch and use the flippers.':'Serve and control your paddle.'));}else gate();},'Answer correctly to '+(pinball?'launch the next ball.':hockey?'take this serve.':'restart the rally.'));}
    f.move=function(p){paddle=breakout||pinball?p.x:p.y;};
    if(hockey)f.move=function(p){paddle=clamp(p.y,35,365);};
    f.down=function(p){if(pinball)flippers[p.x<320?0:1]=true;};f.up=function(){flippers=[false,false];};
    f.controls(pinball?['Left flipper','Right flipper']:breakout?['Left','Right']:['Up','Down'],function(i){if(pinball){flippers[i]=true;g.later(function(){flippers[i]=false;},180);}else paddle=clamp(paddle+(i?40:-40),35,breakout?605:365);});
    function lost(side){running=false;if(pinball){balls++;if(balls>=5)g.end('win','Five balls played. Final score '+you+'.');else gate();}else if(breakout){gate();}else{if(side)you++;else them++;if(hockey&&(you>=7||them>=7))g.end(you>=7?'win':'lose');else gate();}}
    function update(dt){
      if(!running)return;
      if(f.pressed('arrowleft')||f.pressed('a'))paddle-=300*dt;if(f.pressed('arrowright')||f.pressed('d'))paddle+=300*dt;
      if(f.pressed('arrowup')||f.pressed('w'))paddle-=300*dt;if(f.pressed('arrowdown')||f.pressed('s'))paddle+=300*dt;
      paddle=clamp(paddle,35,breakout||pinball?605:365);
      var old={x:ball.x,y:ball.y};ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
      if(pinball){
        ball.vy+=260*dt;if(ball.x<18||ball.x>622){ball.x=clamp(ball.x,18,622);ball.vx*=-.95;}if(ball.y<15){ball.y=15;ball.vy=Math.abs(ball.vy);}
        bumpers.forEach(function(b){var d=distance(ball,b);if(d<b.r+ball.r){var nx=(ball.x-b.x)/(d||1),ny=(ball.y-b.y)/(d||1);ball.x=b.x+nx*(b.r+ball.r+1);ball.y=b.y+ny*(b.r+ball.r+1);var speed=Math.max(310,Math.hypot(ball.vx,ball.vy));ball.vx=nx*speed;ball.vy=ny*speed;you+=10;}});
        for(var i=0;i<2;i++){var on=flippers[i]||f.pressed(i?'arrowright':'arrowleft');var x=i?365:175;if(ball.y>330&&ball.y<365&&ball.x>x&&ball.x<x+100&&ball.vy>0){if(on){ball.vy=-440;ball.vx=(i?-1:1)*200;ball.y=328;you+=2;}}}
        if(ball.y>415)lost(false);
      }else if(breakout){
        if(ball.x<8||ball.x>632){ball.x=clamp(ball.x,8,632);ball.vx*=-1;}if(ball.y<8){ball.y=8;ball.vy=Math.abs(ball.vy);}
        if(ball.vy>0&&old.y<=348&&ball.y>=348&&Math.abs(ball.x-paddle)<53){ball.y=347;ball.vy=-Math.abs(ball.vy);ball.vx=(ball.x-paddle)*5;}
        for(var b of bricks){if(b.alive&&ball.x+8>b.x&&ball.x-8<b.x+b.w&&ball.y+8>b.y&&ball.y-8<b.y+b.h){b.alive=false;you++;ball.vy*=-1;break;}}
        if(bricks.every(function(b){return !b.alive;})){running=false;g.end('win');}else if(ball.y>410)lost(false);
      }else{
        if(ball.y<10||ball.y>390){ball.y=clamp(ball.y,10,390);ball.vy*=-1;}
        bot+=clamp(ball.y-bot,-190*dt,190*dt);bot=clamp(bot,35,365);
        if(ball.vx<0&&ball.x<43&&old.x>=35&&Math.abs(ball.y-paddle)<(hockey?37:48)){ball.x=44;ball.vx=Math.min(450,Math.abs(ball.vx)*1.035);ball.vy=(ball.y-paddle)*6;}
        if(ball.vx>0&&ball.x>597&&old.x<=605&&Math.abs(ball.y-bot)<(hockey?37:48)){ball.x=596;ball.vx=-Math.min(450,Math.abs(ball.vx)*1.035);ball.vy=(ball.y-bot)*5;}
        if(ball.x<0)lost(false);else if(ball.x>640)lost(true);
      }
      g.score.textContent=pinball?'Score '+you+' · '+balls+' / 5 balls':breakout?you+' / 24 bricks':'You '+you+' · Bot '+them;
    }
    function draw(){f.clear();if(pinball){bumpers.forEach(function(b){f.circle(b.x,b.y,b.r,'#a78bfa');});f.line(175,350,275,flippers[0]?315:365,'#facc15',12);f.line(365,flippers[1]?315:365,465,350,'#facc15',12);f.line(70,300,175,355);f.line(570,300,465,355);}else if(breakout){bricks.forEach(function(b){if(b.alive)f.rect(b.x,b.y,b.w,b.h,'#38bdf8');});f.rect(paddle-45,355,90,12,'#4ade80');}else{f.line(320,0,320,400,'#334155');if(hockey){f.circle(35,paddle,28,'#38bdf8');f.circle(605,bot,28,'#fb7185');}else{f.rect(24,paddle-40,14,80,'#38bdf8');f.rect(602,bot-40,14,80,'#fb7185');}}if(running)f.circle(ball.x,ball.y,8,'#fff');else f.text(armed?'Ready to serve':'Answer to unlock play',190,250);}
    g.help(pinball?'Answer to launch each of five balls. Left/right arrows or touch flipper buttons keep the ball away from the drain. Bumpers pay points.':breakout?'Answer to unlock a serve. Move the paddle with the pointer or left/right arrows; clear the wall. Missing the ball asks another question.':'Answer to serve, then play a real rally. Move your paddle with pointer or up/down controls. '+(hockey?'First to seven goals wins.':'Finish ends this open-ended table-tennis session.'));
    return {start:gate,update:update,draw:draw,key:f.key,pause:function(){f.resetInput();flippers=[false,false];},state:function(){return {ball:ball,running:running,armed:armed,bricks:bricks,you:you,bot:them};}};
  });});

  ['dino-runner','flappy-bird','mario','moto-x3m'].forEach(function(id){R.register(id,function(g){
    var f=field(g),flappy=id==='flappy-bird',platform=id==='mario',bike=id==='moto-x3m';
    var player={x:100,y:310,w:30,h:36,vy:0},objects=[],travel=0,spawn=0,runs=0,crashes=0,cleared=0,score=0,running=false,armed=false,onGround=true,boost=false,wheelie=0;
    var begin=g.button('Start / restart run',function(){if(!armed)return;armed=false;begin.disabled=true;running=true;player.y=flappy?180:310;player.vy=0;objects=[];travel=0;spawn=0;onGround=true;});
    function gate(){running=false;armed=false;begin.disabled=true;g.ask(function(right){if(right){armed=true;begin.disabled=false;g.status('Run ready. Start, then use jump/flap and movement controls.');}else{if(id==='dino-runner'||flappy){runs++;if(runs>=6){g.end('lose');return;}}gate();}},'Answer correctly to '+(platform?'earn an extra life.':bike?'restart after the crash.':'start another run.'));}
    function jump(){if(!running)return;if(flappy)player.vy=-230;else if(onGround){player.vy=bike?-360:-390;onGround=false;}}
    f.down=jump;f.controls(bike?['Jump ramp','Accelerate','Brake','Wheelie low barrier']:['Jump / flap'],function(i){if(i===0)jump();else if(i===3)wheelie=1.1;else boost=i===1;});
    function finishRun(success){if(!running)return;running=false;runs++;if(success)cleared++;else crashes++;if(platform&&cleared>=3||bike&&cleared>=5){g.end('win');return;}if((bike?crashes:runs)>=6){g.end(score||cleared?'draw':'lose');return;}gate();}
    function update(dt){if(!running)return;
      var speed=bike?(boost||f.pressed('arrowright')?280:f.pressed('arrowleft')?130:210):platform?180:flappy?150:230;
      travel+=speed*dt;spawn+=dt;wheelie=Math.max(0,wheelie-dt);player.vy+=(flappy?650:950)*dt;player.y+=player.vy*dt;
      if(!flappy&&player.y>=310){player.y=310;player.vy=0;onGround=true;}
      if(spawn>(flappy?1.65:1.45)){spawn=0;if(flappy){var gap=90+rand(140);objects.push({x:650,y:0,w:48,h:gap,kind:'pipe',gap:145,passed:false});}else if(platform){objects.push({x:650,y:rand(2)?290:230,w:45,h:346-(rand(2)?290:230),kind:'crate'});if(rand(3)===0)objects.push({x:800,y:345,w:75,h:55,kind:'gap'});}else {var low=bike&&rand(2)===0;objects.push({x:650,y:low?332:310,w:bike?45:24,h:low?14:36,kind:low?'low':'obstacle'});}}
      objects.forEach(function(o){o.x-=speed*dt;if(flappy){var top={x:o.x,y:0,w:o.w,h:o.h},bottom={x:o.x,y:o.h+o.gap,w:o.w,h:400-o.h-o.gap};if(hit(player,top)||hit(player,bottom))finishRun(false);}else if(o.kind==='gap'){if(player.x+player.w>o.x&&player.x<o.x+o.w&&player.y>300)finishRun(false);}else if(hit(player,o)){if(bike&&o.kind==='low'&&wheelie>0){/* lifted front wheel clears the barrier */}else if(platform&&player.vy>=0&&player.y+player.h-o.y<22){player.y=o.y-player.h;player.vy=0;onGround=true;}else finishRun(false);}if(!o.passed&&o.x+o.w<player.x){o.passed=true;score++;}});
      objects=objects.filter(function(o){return o.x>-100;});
      if(player.y<-50||player.y>400)finishRun(false);
      if((platform||bike)&&travel>=2000)finishRun(true);
      g.score.textContent='Score '+score+' · '+runs+' / 6 runs'+(platform||bike?' · stretches '+cleared+' / '+(bike?5:3):'');
    }
    function draw(){f.clear();f.rect(0,346,640,54,'#253d32');if(platform||bike)f.text('Finish: '+Math.max(0,Math.round(2000-travel))+' m',400,30);objects.forEach(function(o){if(flappy){f.rect(o.x,0,o.w,o.h,'#4ade80');f.rect(o.x,o.h+o.gap,o.w,400-o.h-o.gap,'#4ade80');}else f.rect(o.x,o.y,o.w,o.h,o.kind==='gap'?'#05080f':'#fb923c');});f.rect(player.x,player.y,player.w,player.h,flappy?'#facc15':'#38bdf8');if(bike){f.circle(player.x,player.y+36,10,'#a5b4fc');f.circle(player.x+35,player.y+(wheelie>0?22:36),10,'#a5b4fc');}if(!running)f.text(armed?'Press Start':'Answer to restart',200,160);}
    g.help(flappy?'Flap with Space, Up or a tap. Pass between pipes without touching them. Questions gate each flight; six runs end the round.':platform?'Jump crates and gaps with Space, Up or touch. Reach three flags before six runs are spent. Questions gate extra lives.':bike?'Jump tall ramps, wheelie low barriers, accelerate or brake to adjust approach speed. Finish five tracks before six crashes. A question gates each restart.':'Jump with Space, Up or tap to clear obstacles. Questions unlock each endless run; finish six runs or quit early.');
    return {start:gate,update:update,draw:draw,key:function(key,repeat){if((key===' '||key==='ArrowUp')&&!repeat)jump();return f.key(key,repeat);},pause:f.resetInput,state:function(){return {player:player,objects:objects,running:running,runs:runs,cleared:cleared,score:score};},crash:function(){finishRun(false);}};
  });});

  R.register('snake',function(g){
    var f=field(g),snake=[],direction={x:1,y:0},nextDirection=direction,food={x:10,y:10},clock=0,runs=0,score=0,running=false,armed=false,moved=true;
    var begin=g.button('Start snake',function(){if(!armed)return;armed=false;begin.disabled=true;snake=[{x:5,y:10},{x:4,y:10},{x:3,y:10}];direction={x:1,y:0};nextDirection=direction;running=true;clock=0;moved=true;foodAt();});
    function foodAt(){var empty=[];for(var y=0;y<20;y++)for(var x=0;x<32;x++)if(!snake.some(function(p){return p.x===x&&p.y===y;}))empty.push({x:x,y:y});if(!empty.length){running=false;g.end('win');return;}food=empty[rand(empty.length)];}
    function gate(){begin.disabled=true;g.ask(function(right){if(right){armed=true;begin.disabled=false;}else gate();},'Answer correctly to start the next snake run.');}
    function steer(x,y){if(!running||!moved||x===-direction.x&&y===-direction.y)return;nextDirection={x:x,y:y};moved=false;}
    g.dpad(steer);
    function crash(){running=false;runs++;if(runs>=5)g.end(score?'draw':'lose');else gate();}
    function step(){direction=nextDirection;moved=true;var head={x:snake[0].x+direction.x,y:snake[0].y+direction.y},eat=head.x===food.x&&head.y===food.y;
      var check=eat?snake:snake.slice(0,-1);if(head.x<0||head.x>=32||head.y<0||head.y>=20||check.some(function(p){return p.x===head.x&&p.y===head.y;})){crash();return;}snake.unshift(head);if(eat){score++;foodAt();}else snake.pop();g.score.textContent='Pellets '+score+' · '+runs+' / 5 runs';}
    function draw(){f.clear();snake.forEach(function(p,i){f.rect(p.x*20+1,p.y*20+1,18,18,i?'#4ade80':'#a7f3d0');});f.circle(food.x*20+10,food.y*20+10,7,'#fb7185');}
    return {start:gate,draw:draw,update:function(dt){if(!running)return;clock+=dt;if(clock>=.14){clock-=.14;step();}},key:function(key){var dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(dirs[key]){steer.apply(null,dirs[key]);return true;}return false;},state:function(){return {snake:snake,food:food,running:running,direction:direction};},steer:steer,step:step};
  });

  R.register('crossy-road',function(g){
    // The chicken rides the ACTUAL car lanes (its 19px height sits inside one
    // 26px car band, so only one lane's traffic can ever hit it at a time). It
    // starts on the bottom verge (safe and visible), hops lane-to-lane dodging
    // cars, and scores by reaching the far verge.
    var f=field(g),player={x:310,y:340,w:22,h:19},cars=[],deaths=0,crossings=0,alive=true;
    for(var lane=0;lane<6;lane++)for(var i=0;i<3;i++)cars.push({x:i*230+rand(80),y:65+lane*45,w:55+rand(25),h:26,vx:(lane%2?-1:1)*(55+lane*13)});
    function move(dx,dy){if(!alive)return;player.x=clamp(player.x+dx*35,0,618);player.y=clamp(player.y+dy*45,25,340);if(player.y<=25){crossings++;player.y=340;g.status('Crossing complete! Keep going.');}}
    g.dpad(move);
    function revive(){g.ask(function(right){if(right){alive=true;player.x=310;player.y=340;}else revive();},'You were hit. Answer correctly to revive.');}
    function update(dt){cars.forEach(function(c){c.x+=c.vx*dt;if(c.x>700)c.x=-90;if(c.x<-100)c.x=680;});if(alive&&cars.some(function(c){return hit(player,c);})){alive=false;deaths++;if(deaths>=5)g.end('lose');else revive();}g.score.textContent='Crossings '+crossings+' · '+deaths+' / 5 deaths';}
    function draw(){f.clear();f.rect(0,0,640,48,'#214934');f.rect(0,340,640,60,'#214934');cars.forEach(function(c){f.rect(c.x,c.y,c.w,c.h,'#fb923c');});if(alive)f.rect(player.x,player.y,22,22,'#4ade80');}
    g.help('Hop through moving traffic with arrow keys or buttons. Reach the opposite verge to score a crossing. Each collision needs a question-gated revive; five deaths end the round.');
    return {update:update,draw:draw,key:function(key,repeat){var d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[key];if(d&&!repeat)move(d[0],d[1]);return !!d;},move:move,state:{player:player,cars:cars}};
  });

  R.register('pac-man',function(g){
    var f=field(g),cols=21,rows=13,size=30,walls=new Set(),dots=new Set(),player={x:1,y:1},guards=[{x:19,y:11},{x:19,y:1}],direction={x:1,y:0},clock=0,guardClock=0,lives=0,grids=0,score=0,alive=true;
    for(var y=0;y<rows;y++)for(var x=0;x<cols;x++)if(!x||!y||x===cols-1||y===rows-1||x%4===0&&y%4!==1&&y%4!==3)walls.add(x+','+y);
    function fill(){dots.clear();for(var y=1;y<rows-1;y++)for(var x=1;x<cols-1;x++)if(!walls.has(x+','+y))dots.add(x+','+y);dots.delete('1,1');}
    function legal(x,y){return x>=0&&y>=0&&x<cols&&y<rows&&!walls.has(x+','+y);}
    function steer(x,y){direction={x:x,y:y};}
    g.dpad(steer);
    function revive(){g.ask(function(right){if(right){alive=true;player.x=1;player.y=1;guards=[{x:19,y:11},{x:19,y:1}];clock=guardClock=0;}else revive();},'Answer correctly to earn an extra life in this maze.');}
    function caught(){if(guards.some(function(b){return b.x===player.x&&b.y===player.y;})){alive=false;lives++;revive();}}
    function update(dt){if(!alive)return;clock+=dt;guardClock+=dt;if(clock>=.13){clock=0;var x=player.x+direction.x,y=player.y+direction.y;if(legal(x,y)){player.x=x;player.y=y;}if(dots.delete(player.x+','+player.y))score++;caught();if(!dots.size){grids++;if(grids>=2){g.end('win');return;}fill();player.x=1;player.y=1;}}
      if(alive&&guardClock>=.28){guardClock=0;guards.forEach(function(b){var moves=[[1,0],[-1,0],[0,1],[0,-1]].map(function(d){return {x:b.x+d[0],y:b.y+d[1]};}).filter(function(p){return legal(p.x,p.y);});moves.sort(function(a,b){return Math.abs(a.x-player.x)+Math.abs(a.y-player.y)-Math.abs(b.x-player.x)-Math.abs(b.y-player.y);});var chosen=Math.random()<.75?moves[0]:moves[rand(moves.length)];if(chosen){b.x=chosen.x;b.y=chosen.y;}});caught();}g.score.textContent='Dots '+score+' · grids '+grids+' / 2 · lives spent '+lives+' / 4';}
    function draw(){f.clear();walls.forEach(function(k){var p=k.split(',').map(Number);f.rect(p[0]*size,p[1]*size,28,28,'#274896');});dots.forEach(function(k){var p=k.split(',').map(Number);f.circle(p[0]*size+15,p[1]*size+15,3,'#fde68a');});f.circle(player.x*size+15,player.y*size+15,11,'#facc15');guards.forEach(function(b){f.circle(b.x*size+15,b.y*size+15,11,'#fb7185');});}
    g.help('Collect every dot while avoiding guards. Arrows or touch buttons steer. Questions gate extra lives; clear two mazes before four lives are spent.');
    return {start:fill,update:update,draw:draw,key:function(key){var d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[key];if(d)steer(d[0],d[1]);return !!d;},legal:legal,state:function(){return {player:player,dots:dots,guards:guards};}};
  });

  ['archery','free-throw','bowling','ring-toss','duck-hunt','whack-a-mole'].forEach(function(id){R.register(id,function(g){
    var f=field(g),armed=false,power=0,charging=false,clock=0,shots=0,score=0,botScore=0,correctTosses=0,target={x:450,y:190,vx:70},projectile=null,pins=Array(10).fill(true),frame=1,ballNo=1,wind=0;
    var archery=id==='archery',basket=id==='free-throw',bowling=id==='bowling',ring=id==='ring-toss',duck=id==='duck-hunt',mole=id==='whack-a-mole';
    var charge=g.button(archery?'Draw bow':basket?'Set shot power':bowling?'Set ball power':'Aim',function(){if(armed)charging=!charging;});
    var shoot=g.button(archery?'Release arrow':basket?'Shoot':bowling?'Bowl':'Take shot',function(){fire();});
    var prepare=g.button('Prepare next '+(bowling?'ball':'shot'),gate);
    function ready(){armed=true;charging=false;power=.5;clock=0;wind=(Math.random()-.5)*70;prepare.disabled=true;charge.disabled=false;shoot.disabled=false;g.status('Aim on the field. Set power and take the shot.');}
    function gate(){if(projectile||armed)return;if(ring){g.ask(function(right){if(right)correctTosses++;shots++;score+=right?1:0;renderScore();if(correctTosses>=4)g.end('win');else g.status('Prepare the next toss.');},'Choose the bottle whose answer is correct.');return;}
      g.ask(function(right){if(right)ready();else if(bowling){botScore+=rand(11);endBall(true);}else if(duck){shots++;g.status('The duck escaped. Prepare another question.');renderScore();}else gate();},bowling?'Answer correctly to bowl. Wrong: the bot bowls instead.':'Answer correctly to arm the '+(archery?'arrow':basket?'free throw':duck?'duck shot':'mallet')+'.');}
    function fire(){if(!armed||projectile)return;armed=false;charging=false;charge.disabled=shoot.disabled=true;
      if(duck){var d=distance(f.pointer,target);if(d<40){score++;correctTosses++;}shots++;renderScore();if(correctTosses>=7)g.end('win');else prepare.disabled=false;return;}
      if(mole){var d=distance(f.pointer,target);if(d<44){score++;correctTosses++;}shots++;renderScore();if(correctTosses>=5)g.end('win');else prepare.disabled=false;return;}
      if(bowling){projectile={x:clamp(f.pointer.x,210,430),y:360,vx:(f.pointer.x-320)*.2,vy:-(180+power*280),r:12};}
      else if(archery){projectile={x:70,y:320,vx:250+power*250,vy:-120-(320-f.pointer.y)*.6,r:5,age:0};}
      else if(basket){projectile={x:110,y:330,vx:180+power*140,vy:-(300+power*220),r:10,age:0};}
    }
    function endBall(skipped){if(!skipped)shots++;projectile=null;prepare.disabled=false;
      if(bowling){if(!skipped&&pins.every(function(v){return !v;})||ballNo===2||skipped){frame++;ballNo=1;pins.fill(true);}else ballNo++;if(frame>10)g.end(score>botScore?'win':score<botScore?'lose':'draw');}
      else if(shots>=10)g.end('win','Ten '+(archery?'arrows':'free throws')+' completed. Score '+score+'.');renderScore();}
    function renderScore(){g.score.textContent=bowling?'Frame '+Math.min(frame,10)+' · ball '+ballNo+' · You '+score+' · Bot '+botScore:ring?'Correct tosses '+correctTosses+' / 4':duck?'Ducks shot '+correctTosses+' / 7':mole?'Moles whacked '+correctTosses+' / 5':shots+' / 10 shots · score '+score;}
    f.down=function(){if(!armed)return;if(duck||mole){fire();return;}charging=true;power=0;};f.up=function(){if(charging)fire();};
    if(ring){
      // The bottles themselves are answer controls. Throws choose a bottle,
      // rather than resolving an automatic correct toss behind an Aim button.
      g.listen(f.canvas,'pointerdown',function(e){
        if(g.phase()!=='question'||g.isPaused())return;
        var box=f.canvas.getBoundingClientRect(),x=(e.clientX-box.left)*640/(box.width||640),y=(e.clientY-box.top)*400/(box.height||400);
        for(var i=0;i<4;i++)if(Math.abs(x-(115+i*145))<58&&y>=100&&y<=320){projectile={x:115+i*145,y:150,r:30,tossed:true};g.choose(i);break;}
      });
      charge.hidden=shoot.hidden=true;
    }
    function update(dt){clock+=dt;if(armed&&charging)power=(power+dt*.65)%1;
      if(duck&&armed){target.x+=target.vx*dt;target.y=160+Math.sin(clock*2)*65;if(target.x>590||target.x<60)target.vx*=-1;}
      if(mole&&armed&&clock>1.3){target.x=100+rand(5)*105;target.y=120+rand(2)*130;clock=0;}
      if(archery&&armed&&clock>12){fire();}
      if(projectile&&!projectile.tossed){var old={x:projectile.x,y:projectile.y};projectile.x+=projectile.vx*dt;projectile.y+=projectile.vy*dt;
        if(bowling){for(var i=0;i<10;i++){var row=Math.floor((Math.sqrt(8*i+1)-1)/2),base=row*(row+1)/2,x=320+(i-base-row/2)*28,y=95-row*28;if(pins[i]&&Math.hypot(projectile.x-x,projectile.y-y)<28){pins[i]=false;score++;}}if(projectile.y<0)endBall(false);}
        else if(archery){projectile.vx+=wind*dt;projectile.vy+=130*dt;if(old.x<450&&projectile.x>=450){var dy=Math.abs(projectile.y-190);score+=dy<90?Math.max(10,50-Math.floor(dy/18)*10):0;endBall(false);}else if(projectile.y>410||projectile.x>660)endBall(false);}
        else{projectile.vy+=460*dt;if(projectile.vy>0&&old.y<145&&projectile.y>=145&&projectile.x>452&&projectile.x<510){score+=1;g.status('Basket!');endBall(false);}else if(projectile.y>410||projectile.x>660)endBall(false);}
      }renderScore();}
    function draw(){f.clear();if(archery){for(var i=5;i>=1;i--)f.circle(450,190,i*18,['','#facc15','#ef4444','#38bdf8','#e2e8f0','#64748b'][i]);f.text('Wind '+Math.round(wind),20,28);}else if(basket){f.line(515,70,515,170,'#fff',7);f.line(452,145,515,145,'#fb923c',5);f.line(456,149,475,190,'#fff');f.line(509,149,485,190,'#fff');}else if(bowling){f.rect(190,25,260,365,'#785632');for(var j=0;j<10;j++){var row=Math.floor((Math.sqrt(8*j+1)-1)/2),base=row*(row+1)/2;if(pins[j])f.circle(320+(j-base-row/2)*28,95-row*28,10,'#fff');}}else if(duck){f.circle(target.x,target.y,22,'#4ade80');f.line(target.x-35,target.y-10,target.x+30,target.y+5,'#facc15',6);}else if(mole){for(var x=100;x<=520;x+=105)for(var y=120;y<=250;y+=130)f.circle(x,y,42,'#334155');if(armed)f.circle(target.x,target.y,30,'#fb923c');}else{for(var k=0;k<4;k++){f.rect(95+k*145,135,40,120,'#22c55e');f.text(String.fromCharCode(65+k),105+k*145,285,28);}}
      if(projectile){if(projectile.tossed){f.ctx.strokeStyle='#fde68a';f.ctx.lineWidth=7;f.ctx.beginPath();f.ctx.arc(projectile.x,projectile.y,30,0,Math.PI*2);f.ctx.stroke();}else f.circle(projectile.x,projectile.y,projectile.r,'#fde68a');}if(armed){f.line(f.pointer.x-12,f.pointer.y,f.pointer.x+12,f.pointer.y,'#facc15');f.line(f.pointer.x,f.pointer.y-12,f.pointer.x,f.pointer.y+12,'#facc15');f.rect(20,365,power*150,12,'#4ade80');} }
    charge.disabled=shoot.disabled=true;
    g.help(ring?'Four bottles correspond to A–D. Choose the correct bottle’s answer in the question panel to throw your ring; four correct tosses win.':archery?'Answer to arm each arrow. Drag/hold to draw, aim vertically, then release. Wind bends the flight; the target ring determines 10–50 points. Ten arrows, with a 12-second shot clock.':basket?'Answer to unlock a shot. Hold to build power, release to shoot. A real gravity arc must cross the hoop while descending; ten shots.':bowling?'Ten frames, up to two balls per frame. Aim along the lane, set power and bowl. Pins fall on contact; a wrong question gives the ball to the bot.':'Answer to unlock '+(duck?'a moving duck shot. Tap the duck to hit it; seven hits win.':'the mallet. Tap the mole while it is visible; five hits win.'));
    return {start:renderScore,update:update,draw:draw,key:function(key,repeat){if(key===' '&&!repeat){fire();return true;}return f.key(key,repeat);},question:function(){if(ring)projectile=null;},state:function(){return {armed:armed,pins:pins,projectile:projectile,shots:shots,score:score,target:target};},fire:fire};
  });});

  R.register('eight-ball-pool',function(g){
    var f=field(g),balls=[],armed=false,moving=false,you=0,bot=0,shot=false;
    var cue={x:170,y:200,vx:0,vy:0,r:9,type:0};balls.push(cue);
    for(var row=0,n=1;row<5;row++)for(var j=0;j<=row;j++,n++)balls.push({x:410+row*19,y:200+(j-row/2)*21,vx:0,vy:0,r:9,type:n===8?8:n<8?1:2});
    var pockets=[{x:30,y:30},{x:320,y:30},{x:610,y:30},{x:30,y:370},{x:320,y:370},{x:610,y:370}];
    var power=.55,range=g.node('input');range.type='range';range.min='10';range.max='100';range.value='55';range.setAttribute('aria-label','Shot power');g.stage.append(range);g.listen(range,'input',function(){power=Number(range.value)/100;});
    var shoot=g.button('Shoot toward pointer',fire),prepare=buttonGate(g,'Prepare shot',function(right){if(right){armed=true;shoot.disabled=false;prepare.disabled=true;}else{var stripe=balls.find(function(b){return b.type===2;});if(stripe){balls.splice(balls.indexOf(stripe),1);bot++;}else g.end('lose');renderScore();}},'Correct: aim and shoot your solids. Incorrect: the bot pots a stripe.');shoot.disabled=true;
    function fire(){if(!armed||moving)return;var dx=f.pointer.x-cue.x,dy=f.pointer.y-cue.y,d=Math.hypot(dx,dy)||1;cue.vx=dx/d*(150+power*450);cue.vy=dy/d*(150+power*450);armed=false;moving=true;shot=true;shoot.disabled=true;}
    f.up=fire;
    function renderScore(){g.score.textContent='Solids potted '+you+' / 7 · Bot stripes '+bot+' / 7';}
    function update(dt){if(!moving)return;balls.forEach(function(b){b.x+=b.vx*dt;b.y+=b.vy*dt;b.vx*=Math.pow(.22,dt);b.vy*=Math.pow(.22,dt);if(b.x<42||b.x>598){b.x=clamp(b.x,42,598);b.vx*=-.9;}if(b.y<42||b.y>358){b.y=clamp(b.y,42,358);b.vy*=-.9;}});
      for(var i=0;i<balls.length;i++)for(var j=i+1;j<balls.length;j++){var a=balls[i],b=balls[j],d=distance(a,b);if(d<18){var nx=(b.x-a.x)/(d||1),ny=(b.y-a.y)/(d||1),imp=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(imp>0){a.vx-=imp*nx;a.vy-=imp*ny;b.vx+=imp*nx;b.vy+=imp*ny;}var push=(18-d)/2;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}}
      balls.slice().forEach(function(b){if(pockets.some(function(p){return distance(p,b)<25;})){if(b===cue){cue.x=170;cue.y=200;cue.vx=cue.vy=0;bot++;}else{balls.splice(balls.indexOf(b),1);if(b.type===1)you++;else if(b.type===2)bot++;else{moving=false;g.end(you>=7?'win':'lose',you>=7?'8-ball potted: you win.':'8-ball potted too early.');}}}});
      if(balls.every(function(b){return Math.hypot(b.vx,b.vy)<8;})){balls.forEach(function(b){b.vx=b.vy=0;});moving=false;prepare.disabled=false;g.status('Balls stopped. Prepare another shot.');}renderScore();}
    function draw(){f.clear();f.rect(24,24,592,352,'#176442');pockets.forEach(function(p){f.circle(p.x,p.y,22,'#06110d');});balls.forEach(function(b){f.circle(b.x,b.y,9,b.type===0?'#fff':b.type===8?'#111':b.type===1?'#facc15':'#fb7185');if(b.type===2)f.line(b.x-7,b.y,b.x+7,b.y,'#fff',5);});if(armed)f.line(cue.x,cue.y,f.pointer.x,f.pointer.y,'#e2e8f0');}
    g.help('Aim with pointer or touch; release or press Shoot. Adjust power. Solid balls are yours; stripes belong to the bot. Collision and pocket physics decide your shot. Clear your solids before pocketing the black 8-ball.');
    return {start:renderScore,update:update,draw:draw,state:{balls:balls,cue:cue},fire:fire};
  });

  R.register('capture-the-flag',function(g){
    var f=field(g),you={x:0,y:4},bot={x:4,y:0},allowed=false,steps=0;
    function botMove(){if(bot.y<4)bot.y++;else if(bot.x>0)bot.x--;if(bot.x===0&&bot.y===4){g.end('lose');return;}gate();}
    function gate(){allowed=false;g.ask(function(right){if(right){allowed=true;g.status('Choose one adjacent tile toward the enemy flag.');}else botMove();},'Answer correctly to move. Incorrect: the bot moves instead.');}
    function move(dx,dy){if(!allowed)return;var x=you.x+dx,y=you.y+dy;if(x<0||x>4||y<0||y>4)return;you.x=x;you.y=y;allowed=false;steps++;if(x===4&&y===0)g.end('win');else if(steps%2===0)botMove();else gate();}
    f.controls(['Left','Up','Down','Right'],function(i){var d=[[-1,0],[0,-1],[0,1],[1,0]][i];move(d[0],d[1]);});
    f.down=function(p){var x=Math.floor(p.x/128),y=Math.floor(p.y/80);if(Math.abs(x-you.x)+Math.abs(y-you.y)===1)move(x-you.x,y-you.y);};
    function draw(){f.clear();for(var y=0;y<5;y++)for(var x=0;x<5;x++)f.rect(x*128+2,y*80+2,124,76,(x+y)%2?'#203856':'#162b46');f.text('YOUR FLAG',5,390,14);f.text('ENEMY FLAG',515,24,14);f.circle(you.x*128+64,you.y*80+40,22,'#38bdf8');f.circle(bot.x*128+64,bot.y*80+40,22,'#fb7185');g.score.textContent='Moves '+steps+' · You ('+you.x+','+you.y+') · Bot ('+bot.x+','+bot.y+')';}
    g.help('Move one tile at a time to capture the enemy’s flag at the upper right. A question unlocks each move; the bot races for your lower-left flag.');
    return {start:gate,draw:draw,move:move,state:{you:you,bot:bot}};
  });

  R.register('hole-io',function(g){
    var f=field(g),hole={x:320,y:200,r:18},objects=[],eaten=0,batch=0,level=0,waiting=false;
    for(var i=0;i<35;i++)objects.push({x:30+rand(580),y:30+rand(340),r:i<15?8:i<25?17:28,color:i<15?'#4ade80':i<25?'#facc15':'#fb923c'});
    f.move=function(p){if(f.pointer.down){hole.x=p.x;hole.y=p.y;}};f.down=function(p){hole.x=p.x;hole.y=p.y;};
    function upgrade(){waiting=true;g.ask(function(right){waiting=false;if(right){hole.r+=10;level++;batch=0;g.status('Hole grew. Bigger items are now edible.');}else{g.status('No size-up. Try the growth question again.');if(!objects.some(function(o){return o.r<hole.r;}))upgrade();}},'Growth meter filled: answer correctly to increase the hole’s size.');}
    function update(dt){if(waiting)return;hole.x+=((f.pressed('arrowright')?1:0)-(f.pressed('arrowleft')?1:0))*180*dt;hole.y+=((f.pressed('arrowdown')?1:0)-(f.pressed('arrowup')?1:0))*180*dt;hole.x=clamp(hole.x,hole.r,640-hole.r);hole.y=clamp(hole.y,hole.r,400-hole.r);
      for(var i=objects.length-1;i>=0;i--)if(objects[i].r<hole.r&&distance(hole,objects[i])<hole.r-objects[i].r/2){objects.splice(i,1);eaten++;batch++;}
      if(!objects.length){g.end('win');return;}if(batch>=5||!objects.some(function(o){return o.r<hole.r;}))upgrade();g.score.textContent=eaten+' / 35 swallowed · size '+level+' · growth '+batch+' / 5';}
    function draw(){f.clear();objects.forEach(function(o){f.circle(o.x,o.y,o.r,o.color);});f.circle(hole.x,hole.y,hole.r+3,'#94a3b8');f.circle(hole.x,hole.y,hole.r,'#000');}
    g.help('Drag the hole or move with arrows. Only smaller objects fit. Every five swallowed items asks a size-up question; wrong keeps your size. Swallow the entire map.');
    return {update:update,draw:draw,key:f.key,state:{hole:hole,objects:objects}};
  });

  R.register('tower-defense',function(g){
    var f=field(g),towers=[],enemies=[],base=20,wave=0,running=false,spawn=0,toSpawn=0,selected={x:120,y:150},kills=0;
    var path=[{x:0,y:220},{x:200,y:220},{x:200,y:80},{x:450,y:80},{x:450,y:310},{x:640,y:310}];
    f.down=function(p){selected={x:p.x,y:p.y};g.status('Tower position selected. Answer to build it.');};
    var build=buttonGate(g,'Build tower / start wave',function(right){if(right)towers.push({x:selected.x,y:selected.y,cool:0});wave++;toSpawn=4+wave;running=true;build.disabled=true;},'Correct builds a tower; incorrect starts the wave without one.');
    function update(dt){if(!running)return;spawn+=dt;if(toSpawn&&spawn>.8){spawn=0;toSpawn--;enemies.push({x:0,y:220,hp:2+Math.floor(wave/3),segment:1,speed:35+wave*3});}
      enemies.forEach(function(e){var dest=path[e.segment],dx=dest.x-e.x,dy=dest.y-e.y,d=Math.hypot(dx,dy);if(d<e.speed*dt){e.x=dest.x;e.y=dest.y;e.segment++;if(e.segment>=path.length){e.hp=0;base--;}}else{e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;}});
      towers.forEach(function(t){t.cool-=dt;if(t.cool<=0){var target=enemies.find(function(e){return e.hp>0&&distance(t,e)<130;});if(target){target.hp--;t.cool=.45;t.shot={x:target.x,y:target.y};if(target.hp<=0)kills++;}else t.shot=null;}});
      enemies=enemies.filter(function(e){return e.hp>0;});if(base<=0){running=false;g.end('lose');}else if(!toSpawn&&!enemies.length){running=false;if(wave>=10)g.end('win');else{build.disabled=false;g.status('Wave cleared. Select another tower position.');}}g.score.textContent='Wave '+wave+' / 10 · Base '+base+' · Kills '+kills;}
    function draw(){f.clear();for(var i=1;i<path.length;i++)f.line(path[i-1].x,path[i-1].y,path[i].x,path[i].y,'#5b4b34',30);towers.forEach(function(t){f.circle(t.x,t.y,12,'#38bdf8');if(t.shot&&t.cool>.35)f.line(t.x,t.y,t.shot.x,t.shot.y,'#facc15');});enemies.forEach(function(e){f.circle(e.x,e.y,10,'#fb7185');f.text(String(e.hp),e.x-4,e.y+5,12);});f.circle(selected.x,selected.y,15,'#4ade80');}
    g.help('Tap to choose a tower site, then answer to build and start a wave. Towers attack enemies within range; enemies follow the path and damage the base if they escape. Clear ten waves.');
    return {update:update,draw:draw,state:function(){return {towers:towers,enemies:enemies,base:base,wave:wave};}};
  });

  R.register('tiny-fishing',function(g){
    var f=field(g),fish=Array.from({length:22},function(_,i){return {x:40+rand(560),y:100+rand(260),vx:(i%2?-1:1)*(30+rand(50)),caught:false};}),hook={x:320,y:40},depth=180,capacity=2,phase='idle',caught=[],coins=0;
    var cast=g.button('Cast',function(){if(phase!=='idle')return;phase='down';hook.x=320;hook.y=40;caught=[];});
    var upgrade=buttonGate(g,'Upgrade depth / hook',function(right){if(right){depth=Math.min(350,depth+30);capacity++;g.status('Upgrade purchased.');}else g.status('No upgrade purchased.');if(phase!=='idle')phase='up';},'Answer correctly to buy a deeper line and larger hook.');
    f.move=function(p){if(phase!=='idle')hook.x=p.x;};
    f.controls(['Move hook left','Move hook right'],function(i){hook.x=clamp(hook.x+(i?40:-40),20,620);});
    function update(dt){fish.forEach(function(o){if(o.caught)return;o.x+=o.vx*dt;if(o.x<20||o.x>620)o.vx*=-1;});if(phase==='down'){hook.y+=150*dt;if(hook.y>=depth)phase='up';}else if(phase==='up'){hook.y-=100*dt;fish.forEach(function(o){if(!o.caught&&caught.length<capacity&&distance(hook,o)<25){o.caught=true;caught.push(o);}});if(hook.y<=40){phase='idle';coins+=caught.length*10;fish=fish.filter(function(o){return !o.caught;});while(fish.length<22)fish.push({x:40+rand(560),y:100+rand(260),vx:40,caught:false});}}if(f.pressed('arrowleft'))hook.x-=180*dt;if(f.pressed('arrowright'))hook.x+=180*dt;hook.x=clamp(hook.x,20,620);cast.disabled=phase!=='idle';g.score.textContent='Coins '+coins+' · Depth '+depth+' · Hook capacity '+capacity;}
    function draw(){f.clear();f.rect(0,55,640,345,'#113b58');f.line(320,35,hook.x,hook.y,'#fff');f.circle(hook.x,hook.y,7,'#facc15');fish.forEach(function(o){if(!o.caught){f.circle(o.x,o.y,9,'#38bdf8');f.rect(o.x-18,o.y-4,10,8,'#38bdf8');}});caught.forEach(function(_,i){f.circle(hook.x+i*7,hook.y+12,7,'#4ade80');});}
    g.help('Cast the line, steer the hook while it reels in, and catch fish up to your hook capacity. Questions gate upgrade purchases only—not every cast. This is open-ended; Finish ends the sitting.');
    return {update:update,draw:draw,key:f.key,state:function(){return {fish:fish,hook:hook,depth:depth,capacity:capacity,phase:phase,coins:coins};}};
  });
}());

(function(){
  'use strict';var R=window.RemadeGames;
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function retry(g,fn,text){g.ask(function(ok){if(ok)fn();else retry(g,fn,text);},text);}
  R.register('eight-ball-pool',function(g){
    var c=g.canvas(),ctx=c.getContext('2d'),balls=[],cue={x:170,y:200,vx:0,vy:0,r:9,type:0,number:0},power=.6,aim={x:420,y:200},armed=false,moving=false,turn='you',ownPots=0,scratch=false,counts=[0,0],botDelay=0;
    var pockets=[{x:26,y:26},{x:320,y:24},{x:614,y:26},{x:26,y:374},{x:320,y:376},{x:614,y:374}];
    var rackNumbers=[1,9,2,10,8,3,4,11,5,12,7,6,13,14,15];balls.push(cue);for(var row=0,n=0;row<5;row++)for(var i=0;i<=row;i++){var number=rackNumbers[n++];balls.push({x:414+row*16,y:200+(i-row/2)*19,vx:0,vy:0,r:9,type:number===8?8:number<8?1:2,number:number});}
    // 8 is centered in row three; rear corners are one solid and one stripe.
    var label=g.node('label','Cue power '),slider=g.node('input'),readout=g.node('span','60%');slider.type='range';slider.min=5;slider.max=100;slider.value=60;label.append(slider,readout);g.stage.append(label);g.listen(slider,'input',function(){power=Number(slider.value)/100;readout.textContent=slider.value+'%';});
    var prepare=g.button('Prepare shot',gate),shoot=g.button('Shoot',fire);shoot.disabled=true;
    function pos(e){var b=c.getBoundingClientRect();aim.x=(e.clientX-b.left)*640/(b.width||640);aim.y=(e.clientY-b.top)*400/(b.height||400);}
    g.listen(c,'pointermove',pos);g.listen(c,'pointerdown',function(e){if(g.active()){pos(e);c.focus();}});g.listen(c,'pointerup',function(e){if(armed&&g.active()){pos(e);fire();}});
    function gate(){if(moving)return;armed=false;prepare.disabled=true;shoot.disabled=true;retry(g,function(){turn='you';armed=true;shoot.disabled=false;},'Answer correctly to begin your pool turn. Own-ball pots grant extra shots without questions.');}
    function fire(){if(!armed||moving)return;shootAt(aim.x,aim.y,power);}
    function shootAt(x,y,p){var dx=x-cue.x,dy=y-cue.y,d=Math.hypot(dx,dy)||1,s=280+Math.pow(p,1.3)*1520;cue.vx=dx/d*s;cue.vy=dy/d*s;armed=false;moving=true;ownPots=0;scratch=false;shoot.disabled=prepare.disabled=true;}
    function botShot(){turn='bot';var candidates=balls.filter(function(b){return b.type===2;});var target=candidates[0]||balls.find(function(b){return b.type===8;});if(!target){g.end('win');return;}var pocket=pockets.reduce(function(a,b){return Math.hypot(a.x-target.x,a.y-target.y)<Math.hypot(b.x-target.x,b.y-target.y)?a:b;}),dx=pocket.x-target.x,dy=pocket.y-target.y,d=Math.hypot(dx,dy)||1;shootAt(target.x-dx/d*18,target.y-dy/d*18,.65);}
    function pot(b){if(b===cue){scratch=true;cue.x=170;cue.y=200;cue.vx=cue.vy=0;return;}balls.splice(balls.indexOf(b),1);if(b.type===8){moving=false;var group=turn==='you'?1:2,cleared=!balls.some(function(x){return x.type===group;});g.end(cleared?(turn==='you'?'win':'lose'):(turn==='you'?'lose':'win'),cleared?'8-ball potted after clearing the group.':'8-ball potted too early.');return;}counts[b.type-1]++;if(b.type===(turn==='you'?1:2))ownPots++;}
    function settle(){moving=false;balls.forEach(function(b){b.vx=b.vy=0;});if(turn==='you'){if(ownPots&&!scratch){armed=true;shoot.disabled=false;g.status('Your ball potted: FREE extra shot.');}else{turn='bot';botDelay=.65;g.status('No own ball potted. Bot’s turn.');}}else if(ownPots&&!scratch){botDelay=.65;}else{turn='you';gate();}}
    function update(dt){if(botDelay>0){botDelay-=dt;if(botDelay<=0)botShot();}if(!moving)return;for(var step=0;step<4;step++){var t=dt/4;balls.forEach(function(b){b.x+=b.vx*t;b.y+=b.vy*t;b.vx*=Math.pow(.10,t);b.vy*=Math.pow(.10,t);if(pockets.some(function(p){return Math.hypot(p.x-b.x,p.y-b.y)<21;})){pot(b);return;}if(b.x<36||b.x>604){b.x=clamp(b.x,36,604);b.vx*=-.88;}if(b.y<36||b.y>364){b.y=clamp(b.y,36,364);b.vy*=-.88;}});
      for(var i=0;i<balls.length;i++)for(var j=i+1;j<balls.length;j++){var a=balls[i],b=balls[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<18){var nx=dx/(d||1),ny=dy/(d||1),dot=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(dot>0){a.vx-=dot*nx;a.vy-=dot*ny;b.vx+=dot*nx;b.vy+=dot*ny;}var push=(18-d)/2+.01;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}}}
      if(g.phase()==='over')return;if(balls.every(function(b){return Math.hypot(b.vx,b.vy)<6;}))settle();g.score.textContent='Solids '+counts[0]+' / 7 · stripes '+counts[1]+' / 7 · '+turn+' turn';}
    function draw(){ctx.fillStyle='#724b2a';ctx.fillRect(0,0,640,400);ctx.fillStyle='#176747';ctx.fillRect(22,22,596,356);pockets.forEach(function(p){ctx.fillStyle='#050c08';ctx.beginPath();ctx.arc(p.x,p.y,21,0,Math.PI*2);ctx.fill();});balls.forEach(function(b){ctx.fillStyle=b.type===0?'#fff':b.type===8?'#151515':b.type===1?'#eab308':'#ef4444';ctx.beginPath();ctx.arc(b.x,b.y,9,0,Math.PI*2);ctx.fill();if(b.type===2){ctx.fillStyle='#fff';ctx.fillRect(b.x-7,b.y-3,14,6);}if(b.number){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.font='8px system-ui';ctx.fillText(b.number,b.x-3,b.y+3);}});if(armed){var dx=aim.x-cue.x,dy=aim.y-cue.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;ctx.strokeStyle='#f8fafc';ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(cue.x,cue.y);ctx.lineTo(cue.x+nx*160,cue.y+ny*160);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#b58043';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cue.x-nx*25,cue.y-ny*25);ctx.lineTo(cue.x-nx*160,cue.y-ny*160);ctx.stroke();}}
    g.help('Mobile-style cue aiming and power slider. Your solids earn free extra shots. After a miss/scratch the bot takes actual physics-based shots; its stripe pots also earn extra shots. Center 8-ball rack with solid/stripe rear corners.');
    return {start:gate,draw:draw,update:update,fire:fire,pot:pot,settle:settle,state:function(){return {balls:balls,cue:cue,turn:turn,armed:armed,moving:moving,ownPots:ownPots,counts:counts};}};
  });

  R.register('pac-man',function(g){var c=g.canvas(),ctx=c.getContext('2d'),size=20,cols=29,rows=19,level=0,deaths=0,score=0,alive=true,clock=0,guardClock=0,direction={x:1,y:0},queued=direction,player={x:1,y:1},guards=[],walls=new Set(),dots=new Set();
    var maps=[
      ['#############################','#.............#.............#','#.###.#####.#.#.#.#####.###.#','#...........................#','#.###.#.###.#####.###.#.###.#','#.....#.....#...#.....#.....#','#####.#####.#.#.#.#####.#####','#.....#...............#.....#','#.###.#.###.     .###.#.###.#','#.......#..       ..#.......#','#.###.#.###.     .###.#.###.#','#.....#...............#.....#','#####.#.###.#####.###.#.#####','#.....#.....#...#.....#.....#','#.###.#####.#.#.#.#####.###.#','#...#...................#...#','###.#.#.###.#####.###.#.#.###','#.....#...............#.....#','#############################'],
      ['#############################','#.............#.............#','#.#####.###.#.#.#.###.#####.#','#.......#...........#.......#','###.###.#.###.###.###.#.###.##','#...#...............#.......#','#.###.###.###.#.###.###.###.#','#.......#.....#.....#.......#','#.#####.#.##.   .##.#.#####.#','#...........     ...........#','#.#####.#.##.   .##.#.#####.#','#.......#.....#.....#.......#','#.###.###.###.#.###.###.###.#','#...#...............#.......#','###.#.#.###.#####.###.#.#.###','#...#...................#...#','#.#####.###.#.#.#.###.#####.#','#.............#.............#','#############################']
    ];
    function load(){walls.clear();dots.clear();maps[level%2].forEach(function(row,y){for(var x=0;x<cols;x++){if((row[x]||'#')==='#')walls.add(x+','+y);else if(row[x]==='.')dots.add(x+','+y);}});player.x=1;player.y=1;guards=[{x:27,y:17},{x:27,y:1},{x:13,y:9}];alive=true;clock=guardClock=0;}
    function legal(x,y){return x>0&&y>0&&x<cols-1&&y<rows-1&&!walls.has(x+','+y);}
    function steer(x,y){queued={x:x,y:y};}g.dpad(steer);
    function die(){if(!alive)return;alive=false;deaths++;retry(g,function(){player.x=1;player.y=1;guards=[{x:27,y:17},{x:27,y:1},{x:13,y:9}];alive=true;clock=guardClock=0;},'Infinite lives: answer correctly to revive in this maze.');}
    function caught(){if(guards.some(function(b){return b.x===player.x&&b.y===player.y;}))die();}
    function update(dt){if(!alive)return;clock+=dt;guardClock+=dt;if(clock>=.24){clock=0;if(legal(player.x+queued.x,player.y+queued.y))direction=queued;if(legal(player.x+direction.x,player.y+direction.y)){player.x+=direction.x;player.y+=direction.y;}if(dots.delete(player.x+','+player.y))score++;caught();if(!dots.size){level++;if(level>=2)g.milestone('Two original mazes cleared!',function(){load();});else load();}}
      if(alive&&guardClock>=.6){guardClock=0;guards.forEach(function(b){var moves=[[1,0],[-1,0],[0,1],[0,-1]].map(function(d){return {x:b.x+d[0],y:b.y+d[1]};}).filter(function(p){return legal(p.x,p.y);});moves.sort(function(a,b){return Math.abs(a.x-player.x)+Math.abs(a.y-player.y)-Math.abs(b.x-player.x)-Math.abs(b.y-player.y);});var next=moves[Math.random()<.8?0:Math.floor(Math.random()*moves.length)];if(next){b.x=next.x;b.y=next.y;}});caught();}g.score.textContent='Maze '+(level%2+1)+' · dots '+score+' · deaths '+deaths+' · infinite lives';}
    function draw(){ctx.fillStyle='#030719';ctx.fillRect(0,0,640,400);walls.forEach(function(k){var p=k.split(',').map(Number);ctx.strokeStyle='#3b5de4';ctx.lineWidth=2;ctx.strokeRect(30+p[0]*size+2,p[1]*size+2,16,16);});dots.forEach(function(k){var p=k.split(',').map(Number);ctx.fillStyle='#fde68a';ctx.beginPath();ctx.arc(40+p[0]*size,10+p[1]*size,2,0,Math.PI*2);ctx.fill();});ctx.fillStyle='#facc15';ctx.beginPath();ctx.arc(40+player.x*size,10+player.y*size,8,.3,Math.PI*2-.3);ctx.lineTo(40+player.x*size,10+player.y*size);ctx.fill();guards.forEach(function(b,i){ctx.fillStyle=['#fb7185','#38bdf8','#f472b6'][i];ctx.beginPath();ctx.arc(40+b.x*size,10+b.y*size,8,0,Math.PI*2);ctx.fill();});}
    g.help('Two ORIGINAL classic-style mazes (not proprietary Pac-Man level copies). Arrow keys or remote D-pad steer. Infinite lives; every death needs a correct answer to revive.');return {start:load,draw:draw,update:update,die:die,legal:legal,key:function(k){var d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];if(d)steer(d[0],d[1]);return !!d;},state:function(){return {player:player,dots:dots,guards:guards,walls:walls,level:level,deaths:deaths,alive:alive};}};
  });
}());

(function(){
  'use strict';var R=window.RemadeGames;
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function retry(g,fn,text){g.ask(function(ok){if(ok)fn();else retry(g,fn,text);},text);}
  function canvas(g){var c=g.canvas(),ctx=c.getContext('2d'),pointer={x:470,y:170};function pos(e){var r=c.getBoundingClientRect();pointer.x=(e.clientX-r.left)*640/(r.width||640);pointer.y=(e.clientY-r.top)*400/(r.height||400);}g.listen(c,'pointermove',pos);g.listen(c,'pointerdown',function(e){pos(e);c.focus();});return {c:c,ctx:ctx,p:pointer,clear:function(){ctx.fillStyle='#0b1428';ctx.fillRect(0,0,640,400);},line:function(x,y,a,b,color,width){ctx.strokeStyle=color;ctx.lineWidth=width||2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();},circle:function(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();},text:function(t,x,y){ctx.fillStyle='#fff';ctx.font='17px system-ui';ctx.fillText(t,x,y);}};}
  function slider(g,label,min,max,value,fn){var wrap=g.node('label',label+' '),input=g.node('input');input.type='range';input.min=min;input.max=max;input.value=value;input.setAttribute('aria-label',label);wrap.append(input);g.stage.append(wrap);g.listen(input,'input',function(){fn(Number(input.value));});return input;}

  ['archery','free-throw'].forEach(function(id){R.register(id,function(g){var f=canvas(g),arch=id==='archery',armed=false,shots=0,score=0,power=.6,angle=0,flight=null,wind={x:0,y:0},clock=0;
    slider(g,'Power',10,100,60,function(v){power=v/100;});slider(g,'Aim fine-tune (deg)',-35,35,0,function(v){angle=v;});
    var prepare=g.button('Prepare next shot',function(){if(armed||flight)return;retry(g,function(){armed=true;clock=0;var axis=Math.random()<.5?'x':'y';wind={x:0,y:0};wind[axis]=(Math.random()<.5?-1:1)*(10+Math.floor(Math.random()*30));prepare.disabled=true;shoot.disabled=false;},'Answer correctly to unlock this shot.');});
    var shoot=g.button(arch?'Release arrow':'Shoot',fire);shoot.disabled=true;
    function initial(){var speed=arch?330+power*280:220+power*330,sx=arch?65:110,sy=330,dx=f.p.x-sx,dy=f.p.y-sy,d=Math.hypot(dx,dy)||1,r=Math.atan2(dy,dx)+angle*Math.PI/180;return {x:sx,y:sy,vx:Math.cos(r)*speed,vy:Math.sin(r)*speed,age:0};}
    function fire(){if(!armed||flight)return;armed=false;flight=initial();shoot.disabled=true;}
    function finish(){flight=null;shots++;prepare.disabled=false;if(shots>=10)g.milestone('Ten shots complete: '+score+' points.',function(){shots=0;prepare.disabled=false;});}
    function update(dt){if(armed){clock+=dt;if(arch&&clock>=12)fire();}if(flight){var old={x:flight.x,y:flight.y};flight.x+=flight.vx*dt;flight.y+=flight.vy*dt;flight.vx+=(arch?wind.x:0)*dt;flight.vy+=(arch?130+wind.y:460)*dt;flight.age+=dt;
      if(!arch){
        // Backboard and rim are solid and bouncy, not passive scenery.
        if(flight.x>512&&flight.x<522&&flight.y>60&&flight.y<180&&flight.vx>0){flight.x=512;flight.vx=-Math.abs(flight.vx)*.7;}
        [[447,150],[518,150]].forEach(function(r){var dx=flight.x-r[0],dy=flight.y-r[1],d=Math.hypot(dx,dy);if(d<13){var nx=dx/(d||1),ny=dy/(d||1);flight.x=r[0]+nx*13;flight.y=r[1]+ny*13;var dot=flight.vx*nx+flight.vy*ny;if(dot<0){flight.vx-=1.7*dot*nx;flight.vy-=1.7*dot*ny;}}});
      }
      if(arch&&old.x<470&&flight.x>=470){var error=Math.abs(flight.y-190);score+=error<90?Math.max(10,50-Math.floor(error/18)*10):0;finish();}else if(!arch&&flight.vy>0&&old.y<150&&flight.y>=150&&flight.x>455&&flight.x<512){score++;finish();}else if(flight.x>660||flight.y>415||flight.age>8)finish();}g.score.textContent=shots+' / 10 shots · score '+score+(arch?' · wind '+(wind.x<0?'← left':wind.x>0?'→ right':wind.y<0?'↑ up':'↓ down')+' '+Math.abs(wind.x||wind.y)+' km/h':'');}
    function arrow(p){var r=Math.atan2(p.vy,p.vx);f.line(p.x-Math.cos(r)*28,p.y-Math.sin(r)*28,p.x,p.y,'#854d27',4);f.line(p.x,p.y,p.x-Math.cos(r-.5)*9,p.y-Math.sin(r-.5)*9,'#51331d',3);f.line(p.x,p.y,p.x-Math.cos(r+.5)*9,p.y-Math.sin(r+.5)*9,'#51331d',3);}
    function draw(){f.clear();if(arch){for(var i=5;i>=1;i--)f.circle(470,190,i*18,['','#facc15','#ef4444','#38bdf8','#e2e8f0','#64748b'][i]);f.line(f.p.x-12,f.p.y,f.p.x+12,f.p.y,'#000',3);f.line(f.p.x,f.p.y-12,f.p.x,f.p.y+12,'#000',3);}else{f.line(518,65,518,175,'#fff',6);f.line(447,150,518,150,'#fb923c',5);f.line(451,155,470,190,'#fff');f.line(514,155,491,190,'#fff');}
      f.ctx.strokeStyle='#fff';f.ctx.lineWidth=2;f.ctx.strokeRect(25,367,180,16);f.ctx.fillStyle='#4ade80';f.ctx.fillRect(27,369,176*power,12);f.text('0%',25,360);f.text('100%',166,360);
      if(armed){var p=initial();for(var t=0;t<1.8;t+=.05){var x=p.x+p.vx*t+.5*(arch?wind.x:0)*t*t,y=p.y+p.vy*t+.5*(arch?130+wind.y:460)*t*t;if(x>640||y>400)break;f.circle(x,y,2,'#f8fafc');}}
      if(flight){if(arch)arrow(flight);else f.circle(flight.x,flight.y,10,'#fb923c');}}
    g.help(arch?'Choose power and angle; dotted trajectory accounts for wind. Wind shows direction and speed. Brown arrows fly into the target; black crosshair marks your pointer.':'Set power and angle using the labeled sliders. The dotted trajectory shows the expected arc; the bounded bar shows 0–100% power. The ball must enter the hoop descending.');return {update:update,draw:draw,fire:fire,state:function(){return {armed:armed,projectile:flight,shots:shots,score:score,wind:wind,power:power,angle:angle};}};
  });});

  R.register('bowling',function(g){var f=canvas(g),position=320,angle=0,power=.6,armed=false,ball=null,pins=[],frame=1,ballNo=1,scores=[0,0],frameHits=[];
    slider(g,'Starting position',210,430,320,function(v){position=v;});slider(g,'Bowling angle',-25,25,0,function(v){angle=v;});slider(g,'Throw power',10,100,60,function(v){power=v/100;});
    function rack(){pins=[];for(var row=0;row<4;row++)for(var i=0;i<=row;i++)pins.push({x:320+(i-row/2)*27,y:108-row*26,vx:0,vy:0,standing:true});}
    var prepare=g.button('Prepare next ball',function(){if(armed||ball)return;retry(g,function(){armed=true;bowl.disabled=false;prepare.disabled=true;},'Answer correctly to bowl this ball.');}),bowl=g.button('Bowl',fire);bowl.disabled=true;
    function fire(){if(!armed)return;armed=false;bowl.disabled=true;var a=angle*Math.PI/180,s=150+power*500;ball={x:position,y:355,vx:Math.sin(a)*s,vy:-Math.cos(a)*s,r:12,age:0};}
    function impact(a,b,r){var dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<r){var nx=dx/(d||1),ny=dy/(d||1),imp=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(imp>0){b.vx+=imp*nx*.85;b.vy+=imp*ny*.85;a.vx-=imp*nx*.5;a.vy-=imp*ny*.5;if(Math.hypot(b.vx,b.vy)>35)b.standing=false;}b.x+=nx*(r-d)/2;b.y+=ny*(r-d)/2;}}
    function settle(){var fallen=pins.filter(function(p){return !p.standing;}).length,previous=frameHits.reduce(function(a,b){return a+b;},0);frameHits.push(fallen-previous);scores[0]+=fallen-previous;ball=null;var extra=frame===10&&(fallen===10||ballNo===2&&frameHits[0]+frameHits[1]===10);if(ballNo===1&&fallen<10||frame===10&&ballNo<3&&extra){ballNo++;if(fallen===10){rack();frameHits=[];}}else{scores[1]+=Math.floor(Math.random()*11);frame++;ballNo=1;frameHits=[];rack();}prepare.disabled=false;if(frame>10)g.milestone('Ten frames: '+scores[0]+' pins. Bot '+scores[1]+'.',function(){frame=1;ballNo=1;scores=[0,0];rack();});}
    function update(dt){if(!ball)return;ball.age+=dt;for(var k=0;k<4;k++){var t=dt/4;ball.x+=ball.vx*t;ball.y+=ball.vy*t;pins.forEach(function(p){if(ball.x>190&&ball.x<450)impact(ball,p,23);p.x+=p.vx*t;p.y+=p.vy*t;p.vx*=Math.pow(.06,t);p.vy*=Math.pow(.06,t);});for(var i=0;i<pins.length;i++)for(var j=i+1;j<pins.length;j++)impact(pins[i],pins[j],20);}if(ball.age>3)settle();g.score.textContent='Frame '+Math.min(frame,10)+' · ball '+ballNo+' · pins '+scores[0];}
    function draw(){f.clear();f.ctx.fillStyle='#9e7549';f.ctx.fillRect(195,15,250,375);f.line(190,0,190,400,'#333',10);f.line(450,0,450,400,'#333',10);pins.forEach(function(p){f.circle(p.x,p.y,p.standing?9:6,p.standing?'#fff':'#9ca3af');});if(ball)f.circle(ball.x,ball.y,12,'#60a5fa');else{f.circle(position,355,12,'#60a5fa');var a=angle*Math.PI/180;f.line(position,355,position+Math.sin(a)*150,355-Math.cos(a)*150,'#facc15',3);}}
    rack();g.help('Set your starting position, aim angle and throw power. Ball-to-pin and pin-to-pin impacts knock pins down. Two balls per frame, with a bonus ball in the tenth when earned.');return {draw:draw,update:update,fire:fire,state:function(){return {pins:pins,ball:ball,frame:frame,ballNo:ballNo,position:position,angle:angle,power:power,shots:frame-1};}};
  });

  R.register('pong-breakout',function(g){var f=canvas(g),paddle=320,ball={x:320,y:330,vx:190,vy:-250},bricks=[],running=false,armed=false,levels=0,correct=0,levelTarget=5,answerTarget=10,keys={};
    function layout(){bricks=[];for(var y=0;y<4;y++)for(var x=0;x<9;x++){var kind=levels%5,include=kind===0||kind===1&&(x+y)%2===0||kind===2&&Math.abs(x-4)<=y+1||kind===3&&(x===0||x===8||y===0||y===3)||kind===4&&(x+y)%3!==0;if(include)bricks.push({x:28+x*65,y:38+y*27,w:58,h:20,alive:true});}}
    var serve=g.button('Serve',function(){if(!armed)return;armed=false;running=true;ball={x:paddle,y:330,vx:180,vy:-260};serve.disabled=true;});
    function gate(){running=false;serve.disabled=true;retry(g,function(){correct++;if(correct>=answerTarget){g.milestone('Ten correct answers completed!',function(){answerTarget=correct+10;armed=true;serve.disabled=false;});}else{armed=true;serve.disabled=false;}},'Answer correctly to serve after the lost ball.');}
    g.listen(f.c,'pointermove',function(){paddle=clamp(f.p.x,45,595);});g.dpad(function(dx){paddle=clamp(paddle+dx*35,45,595);});g.listen(g.root,'keyup',function(e){keys[e.key]=false;});
    function update(dt){if(!running)return;paddle=clamp(paddle+((keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0))*340*dt,45,595);var old=ball.y;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;if(ball.x<8||ball.x>632){ball.x=clamp(ball.x,8,632);ball.vx*=-1;}if(ball.y<8){ball.y=8;ball.vy=Math.abs(ball.vy);}if(ball.vy>0&&old<345&&ball.y>=345&&Math.abs(ball.x-paddle)<55){ball.y=344;ball.vy=-Math.abs(ball.vy);ball.vx=(ball.x-paddle)*5;}for(var b of bricks){if(b.alive&&ball.x>b.x-8&&ball.x<b.x+b.w+8&&ball.y>b.y-8&&ball.y<b.y+b.h+8){b.alive=false;ball.vy*=-1;break;}}if(bricks.every(function(b){return !b.alive;})){levels++;running=false;layout();if(levels>=levelTarget)g.milestone('Five layouts cleared!',function(){levelTarget=levels+5;armed=true;serve.disabled=false;});else{armed=true;serve.disabled=false;}}else if(ball.y>415)gate();g.score.textContent='Layouts '+levels+' · correct '+correct;}
    function draw(){f.clear();bricks.forEach(function(b){if(b.alive){f.ctx.fillStyle=['#38bdf8','#a78bfa','#f472b6','#4ade80','#fb923c'][levels%5];f.ctx.fillRect(b.x,b.y,b.w,b.h);}});f.ctx.fillStyle='#4ade80';f.ctx.fillRect(paddle-45,350,90,12);f.circle(ball.x,ball.y,8,'#fff');}
    layout();g.help('Five distinct brick layouts. Paddle follows pointer or arrows. A lost ball needs a correct question. Five layouts OR ten correct answers unlock Continue/Next.');return {start:gate,draw:draw,update:update,key:function(k){keys[k]=true;return k==='ArrowLeft'||k==='ArrowRight';},state:function(){return {ball:ball,bricks:bricks,running:running,armed:armed,levels:levels,correct:correct};}};
  });
}());

(function(){
  'use strict';var R=window.RemadeGames;
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function retry(g,fn,text){g.ask(function(ok){if(ok)fn();else retry(g,fn,text);},text);}
  function field(g,w,h){var canvas=g.canvas();canvas.width=w||640;canvas.height=h||400;var ctx=canvas.getContext('2d'),keys={},pointer={x:canvas.width/2,y:canvas.height/2};
    function pos(e){var b=canvas.getBoundingClientRect();pointer.x=(e.clientX-b.left)*canvas.width/(b.width||canvas.width);pointer.y=(e.clientY-b.top)*canvas.height/(b.height||canvas.height);return pointer;}
    ['pointerdown','pointermove','pointerup','pointercancel'].forEach(function(name){g.listen(canvas,name,function(e){if(!(g.active()||g.canAnswer()&&g.liveQuestion))return;var p=pos(e);canvas.focus();if(name==='pointerdown'&&canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);if(f[name])f[name](p,e);});});
    g.listen(g.root,'keyup',function(e){keys[e.key.toLowerCase()]=false;if(f.release)f.release(e.key);});g.listen(window,'blur',function(){keys={};if(f.cancel)f.cancel();});
    var f={canvas:canvas,ctx:ctx,p:pointer,key:function(k){keys[k.toLowerCase()]=true;return ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','a','d','w','s'].includes(k);},pressed:function(k){return !!keys[k.toLowerCase()];},clear:function(){ctx.fillStyle='#0b1428';ctx.fillRect(0,0,canvas.width,canvas.height);},circle:function(x,y,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();},line:function(x,y,a,b,c,width){ctx.strokeStyle=c;ctx.lineWidth=width||2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();},text:function(t,x,y,c,size){ctx.fillStyle=c||'#fff';ctx.font=(size||18)+'px system-ui';ctx.fillText(t,x,y);},reset:function(){keys={};}};return f;}
  function range(g,label,min,max,value,fn){var wrap=g.node('label',label+' '),input=g.node('input');input.type='range';input.min=min;input.max=max;input.value=value;input.setAttribute('aria-label',label);wrap.append(input);g.stage.append(wrap);g.listen(input,'input',function(){fn(Number(input.value));});return input;}

  R.register('pinball',function(g){
    var f=field(g,440,760);f.canvas.classList.add('rg-portrait');var ball={x:400,y:660,vx:0,vy:0,r:9},running=false,armed=false,left=false,right=false,score=0,balls=0;
    var bumps=[{x:130,y:170,r:34},{x:300,y:170,r:34},{x:220,y:270,r:30}],launch=g.button('Launch ball',function(){if(!armed)return;armed=false;running=true;ball={x:405,y:670,vx:0,vy:-1020,r:9};launch.disabled=true;});
    function gate(){running=false;launch.disabled=true;retry(g,function(){armed=true;launch.disabled=false;},'Answer correctly to launch a pinball.');}
    function hold(label,side){var b=g.node('button',label);b.type='button';g.stage.append(b);g.listen(b,'pointerdown',function(e){e.preventDefault();if(!g.active())return;if(side)right=true;else left=true;if(b.setPointerCapture)b.setPointerCapture(e.pointerId);});['pointerup','pointercancel','lostpointercapture'].forEach(function(n){g.listen(b,n,function(){if(side)right=false;else left=false;});});}
    hold('Left flipper',0);hold('Right flipper',1);
    f.release=function(k){if(k==='ArrowLeft'||k==='a')left=false;if(k==='ArrowRight'||k==='d')right=false;};
    function bounceSegment(x1,y1,x2,y2,kick){var dx=x2-x1,dy=y2-y1,t=clamp(((ball.x-x1)*dx+(ball.y-y1)*dy)/(dx*dx+dy*dy),0,1),x=x1+dx*t,y=y1+dy*t,d=Math.hypot(ball.x-x,ball.y-y);if(d<ball.r+8){var nx=(ball.x-x)/(d||1),ny=(ball.y-y)/(d||1),dot=ball.vx*nx+ball.vy*ny;ball.x=x+nx*(ball.r+9);ball.y=y+ny*(ball.r+9);if(dot<0){ball.vx-=1.85*dot*nx;ball.vy-=1.85*dot*ny;}if(kick){ball.vy=-650;ball.vx=kick*220;}}}
    function physics(dt){ball.vy+=480*dt;if(ball.x>380&&ball.y<150&&ball.vy<0)ball.vx=-280;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;if(ball.x<23||ball.x>417){ball.x=clamp(ball.x,23,417);ball.vx*=-.92;}if(ball.y<24){ball.y=24;ball.vy=Math.abs(ball.vy);}
      bumps.forEach(function(b){var d=Math.hypot(ball.x-b.x,ball.y-b.y);if(d<ball.r+b.r){var nx=(ball.x-b.x)/(d||1),ny=(ball.y-b.y)/(d||1);ball.x=b.x+nx*(b.r+ball.r+1);ball.y=b.y+ny*(b.r+ball.r+1);ball.vx=nx*510;ball.vy=ny*510;score+=10;}});
      // The right outlane guide must stop at the launch-lane wall (x=382), or it
      // crosses the lane and blocks every launched ball before it reaches play.
      bounceSegment(25,500,125,650,0);bounceSegment(382,548,315,650,0);bounceSegment(80,370,150,425,0);bounceSegment(360,370,290,425,0);
      // Top-right deflector angles a launched ball into the playfield.
      bounceSegment(417,120,345,25,0);
      bounceSegment(125,655,210,left?625:690,left?1:0);bounceSegment(315,655,230,right?625:690,right?-1:0);
    }
    function update(dt){if(!running)return;left=left||f.pressed('arrowleft')||f.pressed('a');right=right||f.pressed('arrowright')||f.pressed('d');for(var i=0;i<4;i++)physics(dt/4);if(ball.y>780){running=false;balls++;if(balls>=5)g.milestone('Five balls: '+score+' points.',function(){balls=0;gate();});else gate();}g.score.textContent='Score '+score+' · balls '+balls+' / 5';}
    function draw(){f.clear();f.ctx.strokeStyle='#b38ff7';f.ctx.lineWidth=8;f.ctx.strokeRect(18,18,404,722);f.line(382,730,382,340,'#94a3b8',5);f.line(417,120,345,25,'#b38ff7',8);bumps.forEach(function(b){f.circle(b.x,b.y,b.r,'#a78bfa');f.circle(b.x,b.y,b.r-10,'#facc15');});f.line(25,500,125,650,'#f472b6',12);f.line(382,548,315,650,'#f472b6',12);f.line(80,370,150,425,'#38bdf8',10);f.line(360,370,290,425,'#38bdf8',10);f.line(125,655,210,left?625:690,'#facc15',16);f.line(315,655,230,right?625:690,'#facc15',16);f.circle(ball.x,ball.y,9,'#e2e8f0');f.text('PINBALL',160,70);}
    g.help('Full-height pinball table. HOLD the left/right flipper buttons or arrow keys: input acts immediately, releasing lowers the flipper. Question gates each ball.');
    return {start:gate,update:update,draw:draw,key:function(k){if(k==='ArrowLeft'||k==='a'){left=true;return true;}if(k==='ArrowRight'||k==='d'){right=true;return true;}return false;},pause:function(){left=right=false;f.reset();},state:function(){return {ball:ball,armed:armed,running:running,left:left,right:right,score:score};},release:function(){left=right=false;}};
  });

  R.register('air-hockey',function(g){var f=field(g),you={x:130,y:200,r:26,vx:0,vy:0},bot={x:500,y:200,r:26,vx:0,vy:0},puck={x:260,y:200,vx:180,vy:60,r:11},running=false,armed=false,points=[0,0];
    var serve=g.button('Serve',function(){if(!armed)return;armed=false;running=true;puck={x:270,y:200,vx:210,vy:90,r:11};serve.disabled=true;});
    function gate(){running=false;serve.disabled=true;retry(g,function(){armed=true;serve.disabled=false;},'Answer correctly to serve the puck.');}
    f.pointermove=function(p){you.vx=(clamp(p.x,40,294)-you.x)*15;you.vy=(clamp(p.y,40,360)-you.y)*15;you.x=clamp(p.x,40,294);you.y=clamp(p.y,40,360);};f.pointerdown=f.pointermove;
    g.dpad(function(dx,dy){you.x=clamp(you.x+dx*25,40,294);you.y=clamp(you.y+dy*25,40,360);});
    function collide(p){var dx=puck.x-p.x,dy=puck.y-p.y,d=Math.hypot(dx,dy),r=p.r+puck.r;if(d<r){var nx=dx/(d||1),ny=dy/(d||1);puck.x=p.x+nx*(r+1);puck.y=p.y+ny*(r+1);var dot=puck.vx*nx+puck.vy*ny;if(dot<0){puck.vx-=2*dot*nx;puck.vy-=2*dot*ny;}puck.vx+=p.vx*.15+nx*60;puck.vy+=p.vy*.15+ny*60;var s=Math.hypot(puck.vx,puck.vy);if(s>650){puck.vx*=650/s;puck.vy*=650/s;}}}
    function goal(who){points[who]++;running=false;if(points[who]>=7)g.end(who?'lose':'win');else gate();}
    function update(dt){if(!running)return;you.x=clamp(you.x+((f.pressed('arrowright')?1:0)-(f.pressed('arrowleft')?1:0))*260*dt,40,294);you.y=clamp(you.y+((f.pressed('arrowdown')?1:0)-(f.pressed('arrowup')?1:0))*260*dt,40,360);var bx=bot.x,by=bot.y;bot.x+=clamp(clamp(puck.x,360,590)-bot.x,-160*dt,160*dt);bot.y+=clamp(puck.y-bot.y,-190*dt,190*dt);bot.y=clamp(bot.y,40,360);bot.vx=(bot.x-bx)/dt;bot.vy=(bot.y-by)/dt;
      for(var i=0;i<3;i++){puck.x+=puck.vx*dt/3;puck.y+=puck.vy*dt/3;if(puck.y<25||puck.y>375){puck.y=clamp(puck.y,25,375);puck.vy*=-.98;}if(puck.x<22){if(puck.y>145&&puck.y<255){goal(1);return;}puck.x=22;puck.vx=Math.abs(puck.vx);}if(puck.x>618){if(puck.y>145&&puck.y<255){goal(0);return;}puck.x=618;puck.vx=-Math.abs(puck.vx);}collide(you);collide(bot);}you.vx*=.8;you.vy*=.8;g.score.textContent='You '+points[0]+' · Bot '+points[1];}
    function draw(){f.clear();f.ctx.strokeStyle='#94a3b8';f.ctx.lineWidth=8;f.ctx.strokeRect(15,15,610,370);f.line(15,145,15,255,'#38bdf8',12);f.line(625,145,625,255,'#fb7185',12);f.line(320,15,320,385,'#475569');f.circle(you.x,you.y,26,'#38bdf8');f.circle(bot.x,bot.y,26,'#fb7185');f.circle(puck.x,puck.y,11,'#fff');}
    g.help('Move the striker anywhere in your half with pointer, touch or arrows. Only the central 110px opening of each end wall is a goal; the rest rebounds. First to seven.');return {start:gate,update:update,draw:draw,key:f.key,pause:f.reset,state:function(){return {you:you,bot:bot,puck:puck,points:points,running:running,armed:armed};}};
  });

  R.register('ring-toss',function(g){var f=field(g),start=null,flight=null,points=0,goal=4,bottles=[{x:105,y:150},{x:250,y:150},{x:395,y:150},{x:540,y:150}];g.liveQuestion=true;g.inputAnswer=true;
    function gate(){flight=null;g.ask(function(ok){if(ok)points++;if(points>=goal)g.milestone('Four correct tosses!',function(){goal=points+4;gate();});else gate();},'Drag the ring from the launch spot, pull BACK to set power, then release toward a bottle.');}
    function throwRing(dx,dy){if(!g.canAnswer()||flight)return;flight={x:320,y:350,z:0,vx:-dx*3,vy:-dy*3,vz:150,t:0};}
    f.pointerdown=function(p){if(g.canAnswer()&&!flight&&Math.hypot(p.x-320,p.y-350)<55)start={x:p.x,y:p.y};};f.pointerup=function(p){if(start){throwRing(p.x-start.x,p.y-start.y);start=null;}};f.pointercancel=function(){start=null;};
    function update(dt){if(!flight)return;flight.t+=dt;flight.x+=flight.vx*dt;flight.y+=flight.vy*dt;flight.z+=flight.vz*dt;flight.vz-=340*dt;if(flight.z<0&&flight.t>.1){var selected=bottles.findIndex(function(b){return Math.hypot(b.x-flight.x,b.y-flight.y)<35;});flight=null;if(selected<0)g.status('Missed all bottles—retry this SAME question. No points lost.');else g.choose(selected);}g.score.textContent='Correct tosses '+points;}
    function draw(){f.clear();bottles.forEach(function(b,i){f.ctx.fillStyle='#22c55e';f.ctx.fillRect(b.x-15,b.y-35,30,85);f.ctx.fillRect(b.x-7,b.y-60,14,30);f.text(String.fromCharCode(65+i),b.x-8,b.y+80);});var r=flight||{x:320,y:350,z:0};f.ctx.strokeStyle='#facc15';f.ctx.lineWidth=6;f.ctx.beginPath();f.ctx.ellipse(r.x,r.y-(r.z||0),25,12,0,0,Math.PI*2);f.ctx.stroke();if(start)f.line(320,350,f.p.x,f.p.y,'#fff',3);}
    g.help('A–D bottles represent the lettered answers. Pull the ring back and release to THROW it. Landing around a bottle submits that answer; missing short/long keeps the same question.');return {start:gate,update:update,draw:draw,throwRing:throwRing,state:function(){return {flight:flight,points:points,bottles:bottles};}};
  });

  R.register('duck-hunt',function(g){var f=field(g),ducks=[],points=0,goal=7;g.liveQuestion=true;g.inputAnswer=true;
    function gate(){ducks=Array.from({length:4},function(_,i){return {x:80+i*150,y:100+i%2*120,vx:(i%2?-1:1)*(150+i*25),vy:100+i*15,letter:i};});g.ask(function(ok){if(ok)points++;if(points>=goal)g.milestone('Seven ducks answered correctly!',function(){goal=points+7;gate();});else gate();},'Shoot the moving duck with the letter of your answer. Misses retry the same question.');}
    function shoot(x,y){if(!g.canAnswer())return;var d=ducks.find(function(d){return Math.hypot(d.x-x,d.y-y)<29;});if(d)g.choose(d.letter);else g.status('Miss—try again. The question has not changed.');}
    f.pointerdown=function(p){shoot(p.x,p.y);};function update(dt){ducks.forEach(function(d){d.x+=d.vx*dt;d.y+=d.vy*dt;if(d.x<35||d.x>605){d.x=clamp(d.x,35,605);d.vx*=-1;}if(d.y<45||d.y>335){d.y=clamp(d.y,45,335);d.vy*=-1;}});g.score.textContent='Points '+points+' / '+goal;}
    function draw(){f.clear();ducks.forEach(function(d){f.circle(d.x,d.y,25,'#4ade80');f.line(d.x-34,d.y-8,d.x+30,d.y+8,'#facc15',5);f.text(String.fromCharCode(65+d.letter),d.x-7,d.y+6,'#111',22);});}
    g.help('Question and A–D answers stay visible while four lettered ducks fly. A hit submits that duck’s answer; wrong changes the question. A miss changes nothing. Seven points unlock Continue/Next.');return {start:gate,update:update,draw:draw,shoot:shoot,state:function(){return {ducks:ducks,points:points};}};
  });
}());

/* Original scrolling platform/bike stages: no proprietary level maps or assets. */
(function(){
  'use strict';var R=window.RemadeGames;
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function gate(g,fn){g.ask(function(ok){if(ok)fn();else gate(g,fn);},'Answer correctly to revive. Lives are unlimited.');}
  ['mario','moto-x3m'].forEach(function(id){R.register(id,function(g){var bike=id==='moto-x3m',canvas=g.canvas(),ctx=canvas.getContext('2d'),keys={},player={x:80,y:270,vx:0,vy:0,w:24,h:32,angle:0,av:0},level=0,deaths=0,coins=0,running=true,grounded=false,camera=0,platforms=[],enemies=[],coinItems=[],length=2800;
    function terrain(x){return 310+Math.sin(x/150+level)*35+Math.sin(x/330)*45;}
    function load(){player.x=80;player.y=bike?terrain(80)-30:275;player.vx=player.vy=player.angle=player.av=0;running=true;grounded=false;camera=0;platforms=[];enemies=[];coinItems=[];for(var i=0;i<18;i++){var x=220+i*135;platforms.push({x:x,y:230-(i+level)%3*35,w:70,h:18});coinItems.push({x:x+30,y:platforms[i].y-25,taken:false});if(i%3===0)enemies.push({x:x+70,y:285,vx:i%2?-40:40,alive:true});}}
    function die(){if(!running)return;running=false;deaths++;gate(g,load);}
    function jump(){if(grounded&&running){player.vy=bike?-310:-410;grounded=false;}}
    var pad=g.dpad(function(dx,dy){if(dy<0)jump();});var controller=g.node('div',null,'rg-nes');g.stage.append(controller);controller.append(pad);
    function held(label,key){var b=g.node('button',label,'action');b.type='button';controller.append(b);g.listen(b,'pointerdown',function(e){e.preventDefault();if(!g.active())return;keys[key]=true;if(key===' ')jump();if(b.setPointerCapture)b.setPointerCapture(e.pointerId);});['pointerup','pointercancel','lostpointercapture'].forEach(function(n){g.listen(b,n,function(){keys[key]=false;});});}
    held(bike?'Throttle':'B / Run','ArrowRight');held(bike?'Jump':'A / Jump',' ');if(bike){held('Brake','ArrowDown');held('Lean back','a');held('Lean forward','d');}
    g.listen(g.root,'keyup',function(e){keys[e.key]=false;});pad.querySelectorAll('button').forEach(function(b){g.listen(b,'pointerdown',function(e){if(!g.active())return;e.preventDefault();var dir=b.dataset.direction;if(dir==='left'||dir==='right')keys[dir==='left'?'ArrowLeft':'ArrowRight']=true;else if(dir==='up')jump();if(b.setPointerCapture)b.setPointerCapture(e.pointerId);});['pointerup','pointercancel','lostpointercapture'].forEach(function(n){g.listen(b,n,function(){keys.ArrowLeft=keys.ArrowRight=false;});});});
    function key(k,repeat){keys[k]=true;if((k===' '||k==='ArrowUp')&&!repeat)jump();return ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','a','d'].includes(k);}
    function update(dt){if(!running)return;var oldY=player.y,accel=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0);player.vx+=accel*(bike?240:900)*dt;player.vx*=Math.pow(keys.ArrowDown&&bike?.04:accel?.95:.08,dt);player.vx=clamp(player.vx,bike?-100:-230,bike?380:230);player.x=clamp(player.x+player.vx*dt,15,length);player.vy+=900*dt;player.y+=player.vy*dt;grounded=false;
      if(bike){var ground=terrain(player.x),slope=Math.atan2(terrain(player.x+15)-terrain(player.x-15),30);player.av+=((keys.d?1:0)-(keys.a?1:0))*6*dt;player.angle+=player.av*dt;player.av*=Math.pow(.12,dt);if(player.y+30>=ground&&player.vy>=0){if(Math.abs(Math.atan2(Math.sin(player.angle-slope),Math.cos(player.angle-slope)))>1.65&&Math.abs(player.vx)>35){die();return;}player.y=ground-30;player.vy=0;grounded=true;player.angle+=(slope-player.angle)*Math.min(1,dt*8);}}
      else{var gap=Math.floor(player.x/600)%2===1&&player.x%600>440;if(player.y+player.h>=320&&!gap&&player.vy>=0){player.y=320-player.h;player.vy=0;grounded=true;}platforms.forEach(function(p){if(player.x+player.w>p.x&&player.x<p.x+p.w&&oldY+player.h<=p.y+3&&player.y+player.h>=p.y&&player.vy>=0){player.y=p.y-player.h;player.vy=0;grounded=true;}});enemies.forEach(function(e){if(!e.alive)return;e.x+=e.vx*dt;if(e.x%200<15)e.vx*=-1;if(player.x+player.w>e.x&&player.x<e.x+24&&player.y+player.h>e.y&&player.y<e.y+25){if(player.vy>80&&oldY+player.h<e.y+12){e.alive=false;player.vy=-220;}else die();}});coinItems.forEach(function(c){if(!c.taken&&Math.hypot(player.x-c.x,player.y-c.y)<32){c.taken=true;coins++;}});}
      if(player.y>440){die();return;}if(player.x>=length-70){level++;if(level>=(bike?5:6))g.milestone((bike?'Five tracks':'Six original stages')+' complete!',function(){level=0;load();});else load();}camera=clamp(player.x-170,0,length-640);g.score.textContent=(bike?'Track ':'Stage ')+(level+1)+' · deaths '+deaths+' · coins '+coins;}
    function draw(){ctx.fillStyle=bike?'#93bad5':'#66b9ed';ctx.fillRect(0,0,640,400);ctx.save();ctx.translate(-camera,0);if(bike){ctx.fillStyle='#a77340';ctx.beginPath();ctx.moveTo(camera,400);for(var x=camera;x<camera+660;x+=8)ctx.lineTo(x,terrain(x));ctx.lineTo(camera+660,400);ctx.fill();ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.strokeStyle='#171d27';ctx.lineWidth=5;ctx.beginPath();ctx.arc(-16,23,12,0,Math.PI*2);ctx.arc(20,23,12,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#e23b34';ctx.beginPath();ctx.moveTo(-16,23);ctx.lineTo(0,3);ctx.lineTo(20,23);ctx.lineTo(-16,23);ctx.stroke();ctx.fillStyle='#222';ctx.fillRect(-5,-18,12,28);ctx.fillStyle='#facc15';ctx.beginPath();ctx.arc(2,-23,8,0,Math.PI*2);ctx.fill();ctx.restore();}else{ctx.fillStyle='#79502d';for(var x=camera;x<camera+660;x+=20){var gap=Math.floor(x/600)%2===1&&x%600>440;if(!gap)ctx.fillRect(x,320,20,80);}platforms.forEach(function(p){ctx.fillStyle='#b16d32';ctx.fillRect(p.x,p.y,p.w,p.h);});enemies.forEach(function(e){if(e.alive){ctx.fillStyle='#652d39';ctx.fillRect(e.x,e.y,24,25);}});coinItems.forEach(function(c){if(!c.taken){ctx.fillStyle='#facc15';ctx.beginPath();ctx.arc(c.x,c.y,7,0,Math.PI*2);ctx.fill();}});ctx.fillStyle='#e53d47';ctx.fillRect(player.x,player.y,24,16);ctx.fillStyle='#2455b6';ctx.fillRect(player.x,player.y+16,24,16);}ctx.fillStyle='#fff';ctx.fillRect(length-65,140,4,180);ctx.fillStyle='#22c55e';ctx.fillRect(length-61,140,35,25);ctx.restore();}
    g.help(bike?'ORIGINAL motorcycle courses: throttle, brake, jump and lean with terrain suspension, rotation and crash physics. Not an exact Moto X3M copy. Question-gated unlimited revives.':'ORIGINAL six-stage platformer: manual left/right movement, jump, platforms, gaps, coins, stompable enemies and flags. NES-style controller. Not Nintendo’s maps/artwork. Question-gated unlimited revives.');
    return {start:load,draw:draw,update:update,key:key,pause:function(){keys={};},crash:die,state:function(){return {player:player,platforms:platforms,enemies:enemies,level:level,deaths:deaths,running:running};}};
  });});
}());