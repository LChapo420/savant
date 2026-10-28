/* Board, card and turn-based engines. Each factory owns its rules; only the
 * question/feedback lifecycle is shared. Nothing here contains subject content. */
(function(){
  'use strict';
  var R=window.RemadeGames;
  function register(ids,factory){ids.forEach(function(id){R.register(id,factory);});}
  function controls(g){var row=g.node('div',null,'rg-controls');g.stage.append(row);return row;}
  function rand(n){return Math.floor(Math.random()*n);}
  function ask(g,fn,text){g.ask(fn,text);}
  function result(g,a,b){g.end(a>b?'win':a<b?'lose':'draw');}
  function gridButtons(g,n,cols,fn){var grid=g.grid(cols),buttons=[];for(var i=0;i<n;i++){var b=g.node('button');b.type='button';b.dataset.cell=String(i);grid.append(b);buttons.push(b);}g.listen(grid,'click',function(e){var b=e.target.closest('[data-cell]');if(b&&!b.disabled&&g.active())fn(Number(b.dataset.cell));});return buttons;}

  register(['tic-tac-toe','connect-four'],function(g){
    var connect=g.id==='connect-four',rows=connect?6:3,cols=connect?7:3,need=connect?4:3;
    var board=Array(rows*cols).fill(0),allowed=false,done=false;
    var buttons=gridButtons(g,board.length,cols,play);
    function lines(player){for(var y=0;y<rows;y++)for(var x=0;x<cols;x++)for(var d of [[1,0],[0,1],[1,1],[-1,1]]){var win=[];for(var k=0;k<need;k++){var xx=x+d[0]*k,yy=y+d[1]*k;if(xx<0||xx>=cols||yy>=rows||board[yy*cols+xx]!==player)break;win.push(yy*cols+xx);}if(win.length===need)return win;}return null;}
    function legal(){return board.map(function(v,i){return !v&&(!connect||Math.floor(i/cols)===0)?i:-1;}).filter(function(i){return i>=0;});}
    function landing(column){for(var y=rows-1;y>=0;y--)if(!board[y*cols+column])return y*cols+column;return -1;}
    function render(){buttons.forEach(function(b,i){b.textContent=board[i]===1?'X':board[i]===2?'O':connect?'·':'—';b.className=board[i]===1?'player':board[i]===2?'bot':'';b.disabled=done||!allowed||!!board[i];});g.score.textContent='You: X · Computer: O';}
    function settle(){for(var p=1;p<=2;p++){var win=lines(p);if(win){done=true;render();win.forEach(function(i){buttons[i].classList.add('winning');});g.end(p===1?'win':'lose');return true;}}if(!legal().length){done=true;g.end('draw');return true;}return false;}
    function bot(){var options=legal(),pick=options[rand(options.length)];
      // Win first, then block a one-move threat; otherwise prefer the center.
      for(var p of [2,1]){var found=false;for(var candidate of options){var at=connect?landing(candidate%cols):candidate;board[at]=p;var win=lines(p);board[at]=0;if(win){pick=candidate;found=true;break;}}if(found)break;}
      if(pick!=null)board[connect?landing(pick%cols):pick]=2;
      if(!settle())gate();
    }
    function gate(){allowed=false;render();ask(g,function(right){if(right){allowed=true;g.status('Choose '+(connect?'a column.':'an empty square.'));render();}else bot();},'Answer correctly to place your '+(connect?'token.':'X.'));}
    function play(i){if(!allowed||done)return;var at=connect?landing(i%cols):i;if(at<0||board[at])return;board[at]=1;allowed=false;render();if(!settle())bot();}
    g.help('Answer correctly to take your turn. A wrong answer gives the computer a turn. '+(connect?'Choose a column; gravity places the token at its bottom. Connect four in any direction.':'Get three in a row.'));
    return {state:board,start:gate,play:play,legal:legal,lines:lines};
  });

  R.register('memory-match',function(g){
    var deck=R.shuffle(Array.from({length:16},function(_,i){return Math.floor(i/2);})),matched=new Set(),open=[],busy=false,pairs=0;
    var buttons=gridButtons(g,16,4,select);
    function render(){buttons.forEach(function(b,i){b.textContent=matched.has(i)||open.includes(i)?String.fromCharCode(65+deck[i]):'?';b.className=matched.has(i)?'matched':'';b.disabled=busy||matched.has(i)||open.includes(i);});g.score.textContent=pairs+' / 8 pairs';}
    function select(i){if(busy||matched.has(i)||open.includes(i))return;busy=true;render();ask(g,function(right){busy=false;if(!right){g.status('The card stays face down. Select a card to try again.');render();return;}open.push(i);render();if(open.length===2){if(deck[open[0]]===deck[open[1]]){open.forEach(function(n){matched.add(n);});open=[];pairs++;render();if(pairs===8)g.end('win');}else{busy=true;g.status('Not a pair. Memorize them, then hide the cards.');hide.hidden=false;}}},'Answer correctly to flip this selected card.');}
    var hide=g.button('Hide mismatched pair',function(){open=[];busy=false;hide.hidden=true;render();});hide.hidden=true;
    g.help('Select a face-down card, then answer its question. Matching pairs stay visible. Mismatches remain visible until you hide them.');
    return {state:{deck:deck,matched:matched,open:function(){return open;}},start:render,select:select};
  });

  R.register('bingo',function(g){
    var marks=Array(25).fill(false),selected=12;marks[12]=true;
    var numbers=R.shuffle(Array.from({length:75},function(_,i){return i+1;})).slice(0,25);
    var buttons=gridButtons(g,25,5,function(i){if(!marks[i]){selected=i;render();}});
    var drop=g.button('Drop ball into selected cell',function(){if(marks[selected])return;ask(g,function(right){if(right)marks[selected]=true;render();if(win())g.end('win');else g.status(right?'Ball dropped. Choose another cell.':'Ball waits. Try the selected cell again.');},'Answer correctly to drop a ball into your selected cell.');});
    function win(){for(var i=0;i<5;i++)if(marks.slice(i*5,i*5+5).every(Boolean)||[0,1,2,3,4].every(function(y){return marks[y*5+i];}))return true;return [0,6,12,18,24].every(function(i){return marks[i];})||[4,8,12,16,20].every(function(i){return marks[i];});}
    function render(){buttons.forEach(function(b,i){b.textContent=i===12?'FREE':String(numbers[i]);b.className=marks[i]?'matched':i===selected?'selected':'';b.disabled=marks[i];});drop.disabled=marks[selected];g.score.textContent=marks.filter(Boolean).length+' marked cells';}
    g.help('Choose a cell and answer to drop its numbered ball. Fill a horizontal, vertical or diagonal line. The center is free.');
    return {state:{marks:marks},start:render,win:win};
  });

  R.register('mancala',function(g){
    var pits=Array(14).fill(4);pits[6]=pits[13]=0;var allowed=false;
    var grid=g.grid(7),buttons=[];var order=[12,11,10,9,8,7,13,0,1,2,3,4,5,6];
    order.forEach(function(i){var b=g.node('button');b.type='button';b.dataset.pit=String(i);grid.append(b);buttons[i]=b;});
    function render(){buttons.forEach(function(b,i){b.textContent=(i===6?'Your store':i===13?'Bot store':'Pit '+(i<6?i+1:13-i))+': '+pits[i];b.disabled=!allowed||i>5||!pits[i];b.className=i===6?'player':i===13?'bot':'';});g.score.textContent='You '+pits[6]+' · Bot '+pits[13];}
    function endIf(){if(pits.slice(0,6).every(function(n){return !n;})||pits.slice(7,13).every(function(n){return !n;})){for(var i=0;i<6;i++){pits[6]+=pits[i];pits[i]=0;}for(var j=7;j<13;j++){pits[13]+=pits[j];pits[j]=0;}allowed=false;render();result(g,pits[6],pits[13]);return true;}return false;}
    function sow(i,player){var count=pits[i];pits[i]=0;var store=player===1?6:13,skip=player===1?13:6;while(count){i=(i+1)%14;if(i===skip)continue;pits[i]++;count--;}
      if(pits[i]===1&&(player===1?i<6:i>6&&i<13)&&pits[12-i]){pits[store]+=pits[12-i]+1;pits[i]=pits[12-i]=0;}return i===store;}
    function gate(){allowed=false;render();ask(g,function(right){if(right){allowed=true;render();g.status('Choose a nonempty pit on your row.');}else bot();},'Answer correctly to sow one of your pits.');}
    function bot(){var moves=[7,8,9,10,11,12].filter(function(i){return pits[i]>0;});if(!moves.length){endIf();return;}var extra=sow(moves[rand(moves.length)],2);render();if(endIf())return;if(extra)bot();else gate();}
    function play(i){if(!allowed||i>5||!pits[i])return;allowed=false;var extra=sow(i,1);render();if(endIf())return;if(extra){allowed=true;render();}else bot();}
    g.listen(grid,'click',function(e){var b=e.target.closest('[data-pit]');if(b&&!b.disabled&&g.active())play(Number(b.dataset.pit));});
    g.help('Sow counterclockwise, skipping the opponent’s store. Last stone in your store earns another question-gated turn; last in an empty home pit captures the opposite stones.');
    return {state:pits,start:gate,sow:sow,play:play};
  });

  R.register('snakes-and-ladders',function(g){
    var pos=[0,0],links={3:17,8:26,20:34,28:44,22:5,37:14,46:30,49:9},turns=0;
    var buttons=gridButtons(g,50,10,function(){});buttons.forEach(function(b){b.disabled=true;});
    var roll=g.button('Roll dice',function(){ask(g,function(right){var who=right?0:1,dice=1+rand(6);if(pos[who]+dice<=50)pos[who]+=dice;var before=pos[who];pos[who]=links[before]||before;turns++;render();g.status((who?'Bot':'You')+' rolled '+dice+(before!==pos[who]?' and moved from '+before+' to '+pos[who]:'')+'.');if(pos[who]===50)g.end(who?'lose':'win');},'Correct: you roll. Incorrect: the bot rolls instead.');});
    function render(){buttons.forEach(function(b,i){var n=50-i;b.textContent=n+(links[n]?' →'+links[n]:'')+(pos[0]===n?' YOU':'')+(pos[1]===n?' BOT':'');b.className=pos[0]===n?'player':pos[1]===n?'bot':'';});g.score.textContent='You '+pos[0]+' · Bot '+pos[1]+' · turns '+turns;}
    g.help('Race to square 50. Ladders lift you; snakes slide you back. You need an exact roll to finish.');
    return {state:pos,start:render};
  });

  register(['coin-flip','hot-air-balloon','tug-of-war'],function(g){
    var coin=g.id==='coin-flip',balloon=g.id==='hot-air-balloon',value=coin?5:balloon?3:0,ended=false;
    var display=g.node('div',null,'rg-stake-field'),token=g.node('div',null,coin?'rg-coin':balloon?'rg-balloon':'rg-rope-flag'),caption=g.node('div',null,'rg-stake-caption');
    g.stage.append(display);display.append(token,caption);
    var go=g.button(coin?'Stake a flip':balloon?'Try to rise':'Heave the rope',gate);
    function render(){
      if(coin){token.textContent=String(value);token.style.transform='rotateY('+(value%2?360:0)+'deg)';caption.textContent='Stake '+value+' points';}
      else if(balloon){token.textContent='◉';token.style.bottom=(20+value*17)+'px';caption.textContent='Clouds below · summit above';}
      else{token.textContent='⚑';token.style.left=(50-value*7)+'%';caption.textContent='YOUR LINE ← rope → BOT LINE';}
      g.score.textContent=coin?'Pot: '+value+' / 100':balloon?'Altitude '+value+' / 10':'Flag position '+value+' (win at +5)';
    }
    function gate(){if(ended)return;ask(g,function(right){value=coin?(right?value*2:Math.floor(value/2)):balloon?(value+(right?1:-1)):(value+(right?1:-1));render();g.status(coin?(right?'Coin flips: your pot doubles.':'Half the pot is lost.'):right?'You advance.':'The opponent or gravity pushes back.');if(value>=(coin?100:balloon?10:5)){ended=true;g.end('win');}else if(value<=(coin?0:balloon?0:-5)){ended=true;g.end('lose');}},coin?'Answer to stake this flip.':balloon?'Answer to control this rise attempt.':'Answer to take this heave.');}
    g.help(coin?'The coin visual is not a random loss: correct doubles the pot, incorrect halves it. Start at 5 and reach 100.':balloon?'Each answer moves the balloon up or down. Reach 10 before falling below the clouds.':'Each answer pulls the flag one step toward you or the computer. Pull it across your line.');
    return {state:function(){return value;},start:render};
  });

  R.register('hangman',function(g){
    var solved=0,misses=0,word='',revealed=false;
    var drawing=g.node('pre'),letters=g.node('div',null,'rg-prompt');g.stage.append(drawing,letters);
    var go=g.button('Next word',gate);
    function render(){drawing.textContent=['  ┌────┐','  │    '+(misses>0?'O':''),'  │   '+(misses>2?'/|\\':misses>1?' |':''),'  │   '+(misses>4?'/ \\':misses>3?'/':''),'──┴──'].join('\n');letters.textContent=revealed?word:word.replace(/[A-Za-z]/g,'_ ');g.score.textContent=solved+' / 2 words solved · '+misses+' / 6 mistakes';}
    function gate(){ask(g,function(right){if(right){revealed=true;solved++;render();if(solved===2)g.end('win');}else{misses++;revealed=false;render();if(misses>=6)g.end('lose');else gate();}},'Choose the one-word answer to reveal the hidden word.');}
    g.help('The correct choice is the hidden word. Solve two words; incorrect answers add parts to the gallows. Curriculum supplies the word, never the engine.');
    return {start:gate,question:function(q){word=q.choices[q.answerIndex];revealed=false;render();}};
  });

  R.register('spot-it',function(g){
    var symbols=['☀','☾','★','◆','●','▲','■','✚','♠','♣','♥','♦','✿','⚑','✦'],round=0,you=0,bot=0,match='',botFirst=false;
    var row=controls(g),left=g.node('div',null,'rg-controls'),right=g.node('div',null,'rg-controls');g.stage.append(left,right);
    function deal(){round++;if(round>15){result(g,you,bot);return;}var pool=R.shuffle(symbols);match=pool[0];var cards=[R.shuffle([match].concat(pool.slice(1,6))),R.shuffle([match].concat(pool.slice(6,11)))];left.replaceChildren();right.replaceChildren();botFirst=round%3===0;
      cards.forEach(function(card,i){card.forEach(function(s){var b=g.button(s,function(){if(s!==match){g.status('That symbol appears on only one card.');return;}you++;render();deal();},i?right:left);b.dataset.symbol=s;b.disabled=botFirst;});});render();
      if(botFirst)ask(g,function(correct){if(correct)you++;else bot++;render();deal();},'The bot spotted the match first. Answer correctly to steal its point.');
    }
    function render(){g.score.textContent='Card '+Math.min(round,15)+' / 15 · You '+you+' · Bot '+bot;}
    g.help('Tap the one symbol present on both cards. On every third card the bot gets there first; a question gates your steal.');
    return {start:deal,state:function(){return {round:round,match:match,you:you,bot:bot};}};
  });

  R.register('simon-says',function(g){
    var sequence=[],input=0,completed=0,failures=0,showing=false,flashIndex=0,clock=0,waiting=false;
    var names=['Red','Blue','Green','Yellow'],colors=['#ef4444','#3b82f6','#22c55e','#eab308'];
    var buttons=gridButtons(g,4,2,press);buttons.forEach(function(b,i){b.textContent=names[i];b.style.background=colors[i];});
    var replay=g.button('Watch sequence again',function(){showing=true;flashIndex=0;clock=0;input=0;});
    function render(){g.score.textContent=completed+' / 10 sequences · '+failures+' / 5 failed attempts';buttons.forEach(function(b,i){b.disabled=showing||waiting;b.className=showing&&flashIndex<sequence.length&&clock<.55&&sequence[flashIndex]===i?'rg-simon-glow':'';});replay.disabled=waiting;}
    function start(){sequence.push(rand(4));input=0;showing=true;flashIndex=0;clock=0;render();g.status('Watch the sequence, then repeat it.');}
    function retry(){ask(g,function(right){waiting=false;if(right){input=0;showing=true;flashIndex=0;clock=0;render();}else{waiting=true;retry();}},'Answer correctly to retry the failed sequence.');}
    function press(i){if(showing||waiting)return;waiting=true;render();ask(g,function(right){waiting=false;if(!right){render();g.status('That color press is not unlocked yet.');return;}if(i!==sequence[input]){failures++;if(failures>=5){g.end('lose');return;}waiting=true;render();retry();return;}input++;if(input===sequence.length){completed++;if(completed>=10){g.end('win');return;}start();}else{g.status('Correct color. Continue the sequence.');render();}},'Answer correctly to press '+names[i]+'.');}
    return {start:start,press:press,state:sequence,update:function(dt){if(showing){clock+=dt;if(clock>=.85){clock=0;flashIndex++;if(flashIndex>=sequence.length){showing=false;g.status('Your turn: repeat the colors.');}render();}}},draw:render};
  });

  // Shared physical card deck, not shared game rules.
  function deck(){var cards=[];for(var s=0;s<4;s++)for(var r=1;r<=13;r++)cards.push({rank:r,suit:s});return R.shuffle(cards);}
  function cardText(c){return (['','A','2','3','4','5','6','7','8','9','10','J','Q','K'][c.rank])+['♠','♥','♦','♣'][c.suit];}
  function blackjackValue(hand){var total=0,aces=0;hand.forEach(function(c){total+=c.rank===1?11:Math.min(10,c.rank);if(c.rank===1)aces++;});while(total>21&&aces){total-=10;aces--;}return total;}
  R.register('blackjack',function(g){
    var cards=deck(),you=[],dealer=[],hands=0,chips=0,playing=false,finished=false;
    var display=g.node('div',null,'rg-prompt');g.stage.append(display);var row=controls(g);
    var hit=g.button('Hit',function(){if(!playing)return;you.push(draw());render();if(blackjackValue(you)>21)settle();},row);
    var stand=g.button('Stand',settle,row),deal=g.button('Deal next hand',gate,row);
    function draw(){if(!cards.length)cards=deck();return cards.pop();}
    function render(){display.textContent='You: '+you.map(cardText).join(' ')+' = '+blackjackValue(you)+'\nDealer: '+(playing?cardText(dealer[0])+' [hidden]':dealer.map(cardText).join(' ')+' = '+blackjackValue(dealer));hit.disabled=stand.disabled=!playing;deal.disabled=playing||finished;g.score.textContent=hands+' / 5 hands · net chips '+chips;}
    function gate(){if(finished)return;ask(g,function(right){hands++;you=[draw(),draw()];dealer=[draw(),draw()];if(!right){chips--;playing=false;render();checkEnd();return;}playing=true;render();if(blackjackValue(you)===21)settle();},'Answer correctly to play this blackjack hand. A wrong answer awards it to the dealer.');}
    function checkEnd(){if(hands===5){finished=true;result(g,chips,0);}else g.status('Hand complete. Deal the next hand.');}
    function settle(){if(!playing)return;playing=false;while(blackjackValue(dealer)<17)dealer.push(draw());var a=blackjackValue(you),b=blackjackValue(dealer);chips+=a>21?-1:b>21||a>b?1:a<b?-1:0;render();checkEnd();}
    g.help('Five real hands of blackjack. Hit or stand after answering. Aces count as 1 or 11, face cards as 10; dealer draws to 17. A tie pushes.');
    return {start:render,state:function(){return {you:you,dealer:dealer,hands:hands,chips:chips};},value:blackjackValue,settle:settle};
  });

  R.register('war',function(g){
    var all=deck(),you=all.slice(0,26),bot=all.slice(26),pot=[],wins=0,turn=0,waiting=false,clock=0;
    var display=g.node('p',null,'rg-prompt');g.stage.append(display);var flip=g.button('Flip cards',play);
    function render(){g.score.textContent='Your deck '+you.length+' · Bot '+bot.length+' · '+wins+' / 10 wars won';flip.disabled=waiting;}
    function award(player){var hand=player?you:bot;hand.push.apply(hand,R.shuffle(pot));pot=[];render();if(wins>=10||!bot.length)g.end('win');else if(!you.length)g.end('lose');}
    function play(){if(waiting)return;if(!you.length||!bot.length){result(g,you.length,bot.length);return;}var a=you.shift(),b=bot.shift();pot.push(a,b);turn++;display.textContent='You '+cardText(a)+' · Bot '+cardText(b);if(a.rank===b.rank){waiting=true;render();ask(g,function(right){waiting=false;if(right)wins++;award(right);},'Tie: answer this war question to win the contested cards.');}else award(a.rank>b.rank);}
    g.help('Flip real cards. Higher rank takes both. Every tie is a question-gated war. Win ten wars or take the entire deck. Finish can end the game early.');
    return {start:render,play:play,update:function(dt){clock+=dt;if(clock>=1.4){clock=0;play();}},state:function(){return {you:you,bot:bot,pot:pot,turn:turn};}};
  });

  R.register('trash',function(g){
    var cards=deck(),you=Array(10).fill(null),bot=Array(10).fill(null),held=null,dead=false,discard=[];
    var display=g.node('div',null,'rg-prompt');g.stage.append(display);
    var buttons=gridButtons(g,10,5,place),botGrid=g.grid(5);var botButtons=Array.from({length:10},function(){var b=g.node('button');b.disabled=true;botGrid.append(b);return b;});
    var drawButton=g.button('Draw card',draw);
    function take(){if(!cards.length){cards=R.shuffle(discard);discard=[];}return cards.pop()||{rank:11,suit:0};}
    function render(){buttons.forEach(function(b,i){b.textContent=you[i]?cardText(you[i]):String(i+1)+' ?';b.className=you[i]?'matched':'';b.disabled=!held||dead||!!you[i]||!(held.rank===13||held.rank===i+1);botButtons[i].textContent=bot[i]?cardText(bot[i]):String(i+1)+' ?';});display.textContent=held?'Held: '+cardText(held):'Draw, then place the card in its matching numbered spot.';drawButton.disabled=!!held;g.score.textContent='You '+you.filter(Boolean).length+' / 10 · Bot '+bot.filter(Boolean).length+' / 10';}
    function finish(){if(you.every(Boolean)){g.end('win');return true;}if(bot.every(Boolean)){g.end('lose');return true;}return false;}
    function botTurn(){var card=take(),at=card.rank===13?bot.findIndex(function(v){return !v;}):card.rank-1;if(at>=0&&at<10&&!bot[at])bot[at]=card;else discard.push(card);finish();}
    function check(){var possible=held&&(held.rank===13?you.some(function(v){return !v;}):held.rank<=10&&!you[held.rank-1]);if(!possible&&held){if(held.rank<=10&&you[held.rank-1]){dead=true;rescue();}else{discard.push(held);held=null;botTurn();}}render();}
    function rescue(){ask(g,function(right){if(!right){rescue();return;}discard.push(held);held=null;dead=false;botTurn();render();finish();},'You already have this number. Answer correctly to complete your turn; wrong answers retry.');}
    function draw(){if(held)return;held=take();check();}
    function place(i){if(!held||dead||you[i]||!(held.rank===13||held.rank===i+1))return;you[i]=held;held=null;render();if(!finish()){botTurn();render();}}
    g.help('Fill spots Ace through 10. Kings are wild; Jacks and Queens discard. Duplicate numbered cards require a correct question. The bot follows every completed user turn.');
    return {start:render,state:{you:you,bot:bot},draw:draw,place:place};
  });

  R.register('uno',function(g){
    var colors=['Red','Blue','Green','Yellow'],pile=[],hand=[],bot=[],top=null,questions=0,chosenColor=0,waiting=false;
    for(var c=0;c<4;c++)for(var v=0;v<13;v++){pile.push({color:c,value:v});if(v)pile.push({color:c,value:v});}for(var w=0;w<4;w++)pile.push({color:-1,value:13},{color:-1,value:14});pile=R.shuffle(pile);
    function take(){if(!pile.length){pile=R.shuffle(discard);discard=[];}return pile.pop()||{color:rand(4),value:rand(10)};}
    var discard=[];for(var i=0;i<7;i++){hand.push(take());bot.push(take());}top=take();if(top.color<0)top.color=0;
    var display=g.node('div',null,'rg-prompt'),cards=g.node('div',null,'rg-controls');g.stage.append(display,cards);
    var colorSelect=g.node('select');colors.forEach(function(color,i){var o=g.node('option',color);o.value=String(i);colorSelect.append(o);});colorSelect.setAttribute('aria-label','Wild color');g.stage.append(colorSelect);g.listen(colorSelect,'change',function(){chosenColor=Number(colorSelect.value);});
    var draw=g.button('Draw (question)',function(){drawGate(1);});
    function text(card){return (card.color<0?'Wild':colors[card.color])+' '+(card.value<10?card.value:['Skip','Reverse','Draw 2','Color','Draw 4'][card.value-10]);}
    function legal(card){return card.color<0||card.color===top.color||card.value===top.value;}
    function render(){display.textContent='Top card: '+text(top);display.className='rg-uno-top rg-prompt';display.style.background=['#bd273c','#215da8','#18724b','#a9740c'][top.color]||'#293d65';cards.replaceChildren();hand.forEach(function(card,i){var b=g.node('button',text(card),'rg-uno-card');b.type='button';b.style.background=card.color<0?'linear-gradient(135deg,#be273c,#215da8,#18724b,#b48114)':['#bd273c','#215da8','#18724b','#a9740c'][card.color];cards.append(b);b.disabled=waiting||!legal(card);b.dataset.handIndex=String(i);});draw.disabled=waiting||hand.some(legal);g.score.textContent='Your hand '+hand.length+' · Bot '+bot.length+' · answered draws '+questions;}
    g.listen(cards,'click',function(e){var b=e.target.closest('[data-hand-index]');if(b&&!b.disabled&&g.active())play(Number(b.dataset.handIndex));});
    function endIf(){if(!hand.length){g.end('win');return true;}if(!bot.length){g.end('lose');return true;}return false;}
    function setTop(card){discard.push(top);top=card;if(top.color<0)top={color:chosenColor,value:card.value};}
    function setTopFor(card,color){discard.push(top);top=card.color<0?{color:color,value:card.value}:card;}
    function botTurn(){var at=bot.findIndex(legal),card;if(at<0){card=take();bot.push(card);if(!legal(card)){waiting=false;render();g.status('Bot drew a card and passes.');return;}at=bot.indexOf(card);}card=bot.splice(at,1)[0];setTopFor(card,rand(4));g.status('Bot plays '+text(top)+'.');render();if(endIf())return;if(card.value===10||card.value===11){botTurn();return;}if(card.value===12||card.value===14){penaltyDraw(card.value===12?2:4);return;}waiting=false;render();}
    function penaltyDraw(count){waiting=true;render();ask(g,function(right){questions++;if(!right){penaltyDraw(count);return;}waiting=false;for(var i=0;i<count;i++)hand.push(take());g.status('You drew '+count+' penalty card'+(count===1?'':'s')+'. Bot plays again.');render();if(endIf())return;botTurn();},'Bot played a draw card. Answer correctly to take the '+count+' penalty card'+(count===1?'':'s')+'. Wrong answers retry.');}
    function drawGate(count){if(waiting)return;waiting=true;render();drawQuestion(count);}
    function drawQuestion(count){ask(g,function(right){questions++;if(!right){drawQuestion(count);return;}waiting=false;var drawn;for(var i=0;i<count;i++){drawn=take();hand.push(drawn);}render();if(endIf())return;if(count===1&&legal(drawn)){g.status('You drew '+text(drawn)+'. Play it or another card.');waiting=false;render();}else botTurn();},'Answer correctly to draw '+count+' required card'+(count===1?'':'s')+'. Wrong answers retry; the draw penalty remains.');}
    function play(i){if(waiting||!hand[i]||!legal(hand[i]))return;var card=hand.splice(i,1)[0];setTop(card);g.status('You play '+text(top)+'.');if(card.value===12||card.value===14)for(var j=0;j<(card.value===12?2:4);j++)bot.push(take());render();if(endIf())return;if(card.value<10||card.value===13)botTurn();else{g.status('Bot is skipped.');waiting=false;render();}}
    g.help('108-card two-player game. Match color/value, choose wild colors; Skip/Reverse skip the other player. Questions unlock REQUIRED draws—not avoiding them. Wrong answers retry until correct. Empty your hand to win.');
    return {start:render,play:play,legal:legal,requestDraw:function(n){drawGate(n||1);},state:function(){return {hand:hand,bot:bot,top:top,questions:questions};}};
  });

  R.register('yahtzee',function(g){
    var dice=[1,1,1,1,1],held=[false,false,false,false,false],rolls=0,you=0,bot=0,open=Array(13).fill(true),round=0;
    var names=['Ones','Twos','Threes','Fours','Fives','Sixes','Three of a kind','Four of a kind','Full house','Small straight','Large straight','Yahtzee','Chance'];
    var diceButtons=gridButtons(g,5,5,function(i){if(rolls>0&&rolls<3){held[i]=!held[i];render();}});
    var roll=g.button('Roll dice (question)',gate),sheet=gridButtons(g,13,2,scoreCategory);
    function value(values,i){var counts=Array(7).fill(0);values.forEach(function(v){counts[v]++;});var sum=values.reduce(function(a,b){return a+b;},0),unique=Array.from(new Set(values)).sort();
      if(i<6)return counts[i+1]*(i+1);if(i===6)return counts.some(function(n){return n>=3;})?sum:0;if(i===7)return counts.some(function(n){return n>=4;})?sum:0;
      if(i===8)return counts.includes(3)&&counts.includes(2)?25:0;
      if(i===9)return [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(function(run){return run.every(function(n){return unique.includes(n);});})?30:0;
      if(i===10)return unique.length===5&&unique[4]-unique[0]===4?40:0;if(i===11)return counts.includes(5)?50:0;return sum;
    }
    function render(){diceButtons.forEach(function(b,i){b.textContent=String(dice[i]);b.className=held[i]?'selected':'';b.disabled=!rolls||rolls>=3;});sheet.forEach(function(b,i){b.textContent=names[i]+': '+(open[i]?value(dice,i):'filled');b.disabled=!open[i]||!rolls;});roll.disabled=rolls>=3;g.score.textContent='You '+you+' · Bot '+bot+' · '+round+' / 13 categories · roll '+rolls+' / 3';}
    function nextRound(){round++;rolls=0;held.fill(false);render();if(round===13)result(g,you,bot);}
    function gate(){if(rolls>=3)return;ask(g,function(right){if(right){dice=dice.map(function(v,i){return held[i]?v:1+rand(6);});rolls++;render();}else{var values=Array.from({length:5},function(){return 1+rand(6);}),best=-1,score=-1;open.forEach(function(v,i){if(v&&value(values,i)>score){best=i;score=value(values,i);}});open[best]=false;bot+=score;nextRound();}},'Answer correctly for this roll. Wrong: the bot fills one open category.');}
    function scoreCategory(i){if(!open[i]||!rolls)return;open[i]=false;you+=value(dice,i);nextRound();}
    g.help('Up to three question-gated rolls per turn. Tap dice to hold them between rolls, then choose an open category. A wrong answer skips your turn and lets the bot score a category.');
    return {start:render,value:value,scoreCategory:scoreCategory,state:function(){return {dice:dice,held:held,open:open,you:you,bot:bot};}};
  });
}());

/* Revised rules. Factory replacement is explicit so entry fragments and payloads
 * stay interchangeable; no curriculum needs regenerating for a rule change. */
(function(){
  'use strict';var R=window.RemadeGames;
  function random(n){return Math.floor(Math.random()*n);}
  function grid(g,count,columns,fn){var el=g.grid(columns),buttons=[];for(var i=0;i<count;i++){var b=g.node('button');b.type='button';b.dataset.slot=i;el.append(b);buttons.push(b);}g.listen(el,'click',function(e){var b=e.target.closest('[data-slot]');if(b&&!b.disabled&&g.active())fn(Number(b.dataset.slot));});return {el:el,buttons:buttons};}
  function retry(g,fn,text){g.ask(function(ok){if(ok)fn();else retry(g,fn,text);},text);}
  function dots(g,b,n){b.replaceChildren();for(var i=0;i<n;i++)b.append(g.node('span',null,'rg-stone'));b.setAttribute('aria-label',n+' stones');}
  function card(g,c,hidden){var el=g.node('div',null,'rg-card'+(hidden?' back':''));if(hidden){el.textContent='◆';return el;}var rank=['','A','2','3','4','5','6','7','8','9','10','J','Q','K'][c.rank],suit=['♠','♥','♦','♣'][c.suit];el.classList.toggle('red',c.suit===1||c.suit===2);el.append(g.node('span',rank+'\n'+suit,'rg-card-corner'),g.node('span',suit,'rg-card-center'),g.node('span',rank+'\n'+suit,'rg-card-bottom'));return el;}
  function deck(){var d=[];for(var s=0;s<4;s++)for(var n=1;n<=13;n++)d.push({rank:n,suit:s});return R.shuffle(d);}
  function total(hand){var sum=0,aces=0;hand.forEach(function(c){sum+=c.rank===1?11:Math.min(10,c.rank);if(c.rank===1)aces++;});while(sum>21&&aces--){sum-=10;}return sum;}

  R.register('hangman',function(g){
    var word='',guesses=new Set(),misses=0,solved=0,unlocked=false;
    var gallows=g.node('pre',null,'rg-gallows'),display=g.node('div',null,'rg-word');g.stage.append(gallows,display);
    var letters=grid(g,26,7,guess);letters.el.classList.add('rg-letters');
    function render(){display.textContent=Array.from(word).map(function(c){return /[A-Z]/.test(c)&&!guesses.has(c)?'_':c;}).join(' ');gallows.textContent=['  ┌────┐','  │    '+(misses>0?'O':''),'  │   '+(misses>2?'/|\\':misses>1?' |':''),'  │   '+(misses>4?'/ \\':misses>3?'/':''),'──┴──'].join('\n');letters.buttons.forEach(function(b,i){var c=String.fromCharCode(65+i);b.textContent=c;b.disabled=!unlocked||guesses.has(c);});g.score.textContent='Words solved '+solved+' · letter misses '+misses+' / 6';}
    function gate(){unlocked=false;render();retry(g,function(){unlocked=true;render();g.status('Correct: guess one unused letter.');},'Answer correctly to unlock one letter guess.');}
    function newWord(){var q=g.question();word=String(q?q.choices[q.answerIndex]:'').toUpperCase().replace(/[^A-Z ]/g,'').trim();if(!word)word=String((window.GAME_DATA&&window.GAME_DATA.meta||{}).topic||'LEARNING').toUpperCase().replace(/[^A-Z]/g,'');guesses.clear();misses=0;}
    function guess(i){var c=typeof i==='string'?i.toUpperCase():String.fromCharCode(65+i);if(!unlocked||guesses.has(c))return;unlocked=false;guesses.add(c);if(!word.includes(c))misses++;render();if(misses>=6){g.end('lose','The word was '+word+'.');return;}if(Array.from(word).every(function(x){return !/[A-Z]/.test(x)||guesses.has(x);})){solved++;if(solved>=2){g.end('win','Two words solved!');return;}word='';}gate();}
    g.help('Each correct question unlocks ONE letter. Wrong question answers simply retry. Wrong letters build the gallows; six misses lose the word. Solve two words.');
    return {start:gate,question:function(q){if(!word){word=q.choices[q.answerIndex].toUpperCase().replace(/[^A-Z ]/g,'');guesses.clear();misses=0;}render();},guess:guess,key:function(k){if(/^[a-z]$/i.test(k)){guess(k);return true;}return false;},state:function(){return {word:word,guesses:guesses,misses:misses,unlocked:unlocked,solved:solved};}};
  });

  R.register('coin-flip',function(g){
    var points=5,wins=0,threshold=100,nextWins=10,busy=false,face='Heads';
    var coin=g.node('div','5','rg-coin'),field=g.node('div',null,'rg-stake-field');field.append(coin);g.stage.append(field);
    var label=g.node('label','Wager points: '),wager=g.node('input');wager.type='number';wager.min=1;wager.value=1;wager.dataset.wager='';label.append(wager);g.stage.append(label);
    var flip=g.button('Flip wagered coin',function(){var bet=Number(wager.value);if(busy||!Number.isInteger(bet)||bet<1||bet>points){g.status('Choose a whole-number wager between 1 and '+points+'.');return;}busy=true;flip.disabled=true;g.ask(function(ok){wins+=ok?1:0;points+=ok?bet:-bet;face=ok?'Heads':'Tails';coin.classList.remove('rg-flipping');void coin.offsetWidth;coin.classList.add('rg-flipping');coin.textContent=face+'\n'+(ok?'+':'−')+bet;if(points===0){points=5;g.status('Zero points: bankroll restarted at 5.');}busy=false;render();if(points>=threshold||wins>=nextWins)g.milestone('Goal reached: '+points+' points, '+wins+' correct.',function(){threshold=Math.max(100,points+100);nextWins=wins+10;render();});},'Heads if correct: your wager doubles (net +wager). Tails if incorrect: lose the wager.');});
    function render(){wager.max=points;if(Number(wager.value)>points)wager.value=points;flip.disabled=busy;g.score.textContent='Bankroll '+points+' · correct '+wins;}
    g.help('Wager any whole amount up to your bankroll. Correct pays back twice the wager; incorrect loses only that wager. Zero restarts at five. Ten correct answers or 100 points unlock Continue/Next.');
    return {start:render,state:function(){return {points:points,wins:wins,face:face};}};
  });

  R.register('memory-match',function(g){
    var deck=R.shuffle(Array.from({length:16},function(_,i){return Math.floor(i/2);})),matched=new Set(),open=[],busy=false,pairs=0;
    var cards=grid(g,16,4,select);var next=g.button('Next pair',function(){if(!busy)return;open=[];retry(g,function(){busy=false;render();},'Answer correctly to unlock the next two-card turn.');render();});next.hidden=true;
    function render(){cards.buttons.forEach(function(b,i){b.textContent=matched.has(i)||open.includes(i)?String.fromCharCode(65+deck[i]):'?';b.disabled=busy||matched.has(i)||open.includes(i);b.className=matched.has(i)?'matched':'';});next.hidden=!busy||g.phase()!=='play';g.score.textContent=pairs+' / 8 pairs';}
    function select(i){if(busy||matched.has(i)||open.includes(i))return;open.push(i);if(open.length===2){if(deck[open[0]]===deck[open[1]]){open.forEach(function(j){matched.add(j);});open=[];pairs++;g.status('Match! Your next two reveals are free.');if(pairs===8)g.end('win');}else{busy=true;g.status('Memorize the pair, then answer to unlock the next turn.');}}render();}
    g.help('Reveal two cards freely. A match grants another free two-card turn. After a mismatch, answer correctly before revealing the next pair; wrong answers retry.');
    return {start:render,select:select,state:{deck:deck,matched:matched,open:function(){return open;}}};
  });

  R.register('bingo',function(g){
    var numbers=[],marks=Array(25).fill(false),calls=R.shuffle(Array.from({length:75},function(_,i){return i+1;})),called=null,unlocked=false;
    for(var c=0;c<5;c++){var col=R.shuffle(Array.from({length:15},function(_,i){return c*15+i+1;})).slice(0,5);for(var y=0;y<5;y++)numbers[y*5+c]=col[y];}marks[12]=true;numbers[12]=0;
    var display=g.node('div','B I N G O','rg-called');g.stage.append(display);var board=grid(g,25,5,mark);
    var call=g.button('Call next ball',nextCall);
    function win(){for(var i=0;i<5;i++)if([0,1,2,3,4].every(function(k){return marks[i*5+k];})||[0,1,2,3,4].every(function(k){return marks[k*5+i];}))return true;return [0,6,12,18,24].every(function(i){return marks[i];})||[4,8,12,16,20].every(function(i){return marks[i];});}
    function render(){board.buttons.forEach(function(b,i){b.textContent=i===12?'FREE':String(numbers[i]);b.className=marks[i]?'matched':'';b.disabled=!unlocked||marks[i]||numbers[i]!==called;});g.score.textContent='Marked '+marks.filter(Boolean).length+' / 25';call.disabled=unlocked;}
    function nextCall(){if(unlocked)return;if(!calls.length){g.end('draw');return;}called=calls.pop();display.textContent='BINGO · '+['B','I','N','G','O'][Math.floor((called-1)/15)]+' '+called;var at=numbers.indexOf(called);if(at>=0&&!marks[at])retry(g,function(){unlocked=true;render();g.status('Mark the called number '+called+' on your card.');},'Your card has '+called+'. Answer correctly to mark this same ball.');else g.status('That ball is not on your card. Call the next ball.');render();}
    function mark(i){if(!unlocked||numbers[i]!==called||marks[i])return;marks[i]=true;unlocked=false;render();if(win())g.end('win','Bingo!');}
    g.help('Normal 1–75 bingo with B/I/N/G/O number bands and a free center. Questions appear only for called numbers on your card. Wrong answers retry the same ball.');
    return {start:render,nextCall:nextCall,mark:mark,win:win,state:{numbers:numbers,marks:marks,calls:calls,called:function(){return called;}}};
  });

  R.register('mancala',function(g){
    var pits=Array(14).fill(4);pits[6]=pits[13]=0;var allowed=false;
    var board=g.node('div',null,'rg-mancala');g.stage.append(board);var buttons=[];
    [13,12,11,10,9,8,7,6,0,1,2,3,4,5].forEach(function(i){var b=g.node('button',null,'rg-pit'+(i===6||i===13?' rg-store':''));b.type='button';b.dataset.pit=i;board.append(b);buttons[i]=b;if(i===13)b.style.gridArea='1 / 1 / 3 / 2';else if(i===6)b.style.gridArea='1 / 8 / 3 / 9';else if(i<6)b.style.gridArea='2 / '+(i+2);else b.style.gridArea='1 / '+(14-i);});
    function render(){buttons.forEach(function(b,i){dots(g,b,pits[i]);b.disabled=!allowed||i>5||!pits[i];});g.score.textContent='Your store '+pits[6]+' · Bot store '+pits[13];}
    function finish(){if(pits.slice(0,6).some(Boolean)&&pits.slice(7,13).some(Boolean))return false;for(var i=0;i<6;i++){pits[6]+=pits[i];pits[i]=0;}for(var i=7;i<13;i++){pits[13]+=pits[i];pits[i]=0;}allowed=false;render();g.end(pits[6]>pits[13]?'win':pits[6]<pits[13]?'lose':'draw');return true;}
    function sow(i,p){var n=pits[i];pits[i]=0;var store=p===1?6:13;while(n){i=(i+1)%14;if(i===(p===1?13:6))continue;pits[i]++;n--;}if(pits[i]===1&&(p===1?i<6:i>6&&i<13)&&pits[12-i]){pits[store]+=pits[12-i]+1;pits[i]=pits[12-i]=0;}return i===store;}
    function gate(){allowed=false;render();g.ask(function(ok){if(ok){allowed=true;render();}else bot();},'Correct: take a mancala turn. Wrong: the bot takes the turn.');}
    function bot(){var legal=[7,8,9,10,11,12].filter(function(i){return pits[i];});if(!legal.length){finish();return;}var extra=sow(legal[random(legal.length)],2);render();if(finish())return;if(extra)bot();else gate();}
    function play(i){if(!allowed||i>5||!pits[i])return;allowed=false;var extra=sow(i,1);if(finish())return;if(extra){allowed=true;g.status('Last stone in your store: free turn, no question!');render();}else{render();bot();}}
    g.listen(board,'click',function(e){var b=e.target.closest('[data-pit]');if(b&&!b.disabled&&g.active())play(Number(b.dataset.pit));});
    g.help('Sow stones counterclockwise; capture an empty home pit’s opposite stones. Last stone in your take bowl earns a FREE turn without a question.');
    return {start:gate,state:pits,play:play,sow:sow};
  });

  R.register('snakes-and-ladders',function(g){
    var positions=[0,0],links={3:17,8:26,20:34,28:44,22:5,37:14,46:30,49:9},clock=0,rolling=false,target=1,who=0,shown=1;
    var canvas=g.canvas(),ctx=canvas.getContext('2d'),die=g.node('div','⚀','rg-die');g.stage.append(die);
    var roll=g.button('Roll dice',function(){if(rolling)return;g.ask(function(ok){who=ok?0:1;target=1+random(6);clock=0;rolling=true;roll.disabled=true;die.classList.add('rolling');},'Correct: you roll. Wrong: the bot rolls.');});
    function cell(n){var row=Math.floor((n-1)/10),col=(n-1)%10;return {x:(row%2?9-col:col)*64+32,y:360-row*80};}
    function draw(){ctx.clearRect(0,0,640,400);for(var n=1;n<=50;n++){var p=cell(n);ctx.fillStyle=n%2?'#e3c786':'#92cdbb';ctx.fillRect(p.x-31,p.y-39,62,78);ctx.fillStyle='#162c38';ctx.font='14px system-ui';ctx.fillText(n,p.x-24,p.y-23);}Object.keys(links).forEach(function(from){var a=cell(Number(from)),b=cell(links[from]),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),nx=-dy/d*7,ny=dx/d*7;ctx.strokeStyle=Number(from)<links[from]?'#704016':'#be395a';ctx.lineWidth=Number(from)<links[from]?3:10;ctx.beginPath();ctx.moveTo(a.x+nx,a.y+ny);if(Number(from)>links[from])ctx.quadraticCurveTo(a.x+80,b.y-40,b.x,b.y);else ctx.lineTo(b.x+nx,b.y+ny);ctx.stroke();if(Number(from)<links[from]){ctx.beginPath();ctx.moveTo(a.x-nx,a.y-ny);ctx.lineTo(b.x-nx,b.y-ny);for(var t=.1;t<1;t+=.12){ctx.moveTo(a.x+dx*t+nx,a.y+dy*t+ny);ctx.lineTo(a.x+dx*t-nx,a.y+dy*t-ny);}ctx.stroke();}});positions.forEach(function(n,i){if(!n)return;var p=cell(n);ctx.fillStyle=i?'#dc2626':'#2563eb';ctx.beginPath();ctx.arc(p.x+(i?10:-10),p.y,12,0,Math.PI*2);ctx.fill();});g.score.textContent='You '+positions[0]+' · Bot '+positions[1];}
    function update(dt){if(!rolling)return;clock+=dt;shown=1+Math.floor(clock*20)%6;die.textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][shown-1];if(clock>=1){rolling=false;die.classList.remove('rolling');die.textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][target-1];die.setAttribute('aria-label','Rolled '+target);if(positions[who]+target<=50)positions[who]+=target;positions[who]=links[positions[who]]||positions[who];roll.disabled=false;if(positions[who]===50)g.end(who?'lose':'win');}}
    g.help('Serpentine board with real connecting ladder rungs and snake slides. Dice animate, then show the final face. Exact roll to square 50.');return {start:draw,draw:draw,update:update,state:positions,links:links};
  });

  R.register('blackjack',function(g){
    var cards=deck(),you=[],dealer=[],coins=100,hands=0,nextGoal=5,bet=0,playing=false;
    var yourRow=g.node('div',null,'rg-card-row'),dealerRow=g.node('div',null,'rg-card-row');g.stage.append(g.node('p','Dealer'),dealerRow,g.node('p','Your hand'),yourRow);
    var wager=g.node('input');wager.type='number';wager.min=1;wager.value=10;wager.dataset.wager='';var label=g.node('label','Wager coins: ');label.append(wager);g.stage.append(label);
    var hit=g.button('Hit',function(){if(!playing)return;you.push(take());render();if(total(you)>21)settle();}),stand=g.button('Stand',settle),deal=g.button('Deal next hand',gate);
    function take(){if(cards.length<10)cards=deck();return cards.pop();}
    function render(){yourRow.replaceChildren();dealerRow.replaceChildren();you.forEach(function(c){yourRow.append(card(g,c));});dealer.forEach(function(c,i){dealerRow.append(card(g,c,playing&&i===1));});hit.disabled=stand.disabled=!playing;deal.disabled=playing;wager.disabled=playing;wager.max=coins;if(Number(wager.value)>coins)wager.value=coins;g.score.textContent='Coins '+coins+' · hands '+hands+' · your total '+total(you)+(playing?'':' · dealer '+total(dealer));}
    function gate(){var amount=Number(wager.value);if(playing)return;if(!Number.isInteger(amount)||amount<1||amount>coins){g.status('Choose a wager from 1 to '+coins+'.');return;}bet=amount;retry(g,function(){coins-=bet;hands++;you=[take(),take()];dealer=[take(),take()];playing=true;render();if(total(you)===21)settle();},'Answer correctly to play this hand. Incorrect answers do not lose coins or a hand.');}
    function settle(){if(!playing)return;playing=false;while(total(dealer)<17)dealer.push(take());var a=total(you),b=total(dealer),natural=a===21&&you.length===2,dealerNatural=b===21&&dealer.length===2;
      if(a<=21&&(!dealerNatural||natural)){if(natural&&!dealerNatural)coins+=bet+bet*1.5;else if(b>21||a>b)coins+=bet*2;else if(a===b)coins+=bet;}render();if(coins<=0){coins=100;g.status('Bankroll empty: reset to 100 coins.');render();}if(hands>=nextGoal)g.milestone('Five hands complete. Coins: '+coins,function(){nextGoal=hands+5;render();});}
    g.help('100 starting coins. Wager, answer correctly, then play normal 21. Hit/stand, soft aces, dealer draws to 17, blackjack pays 3:2, ties push. Wrong questions only retry. Every five hands offers Continue/Next.');
    return {start:render,value:total,settle:settle,state:function(){return {you:you,dealer:dealer,hands:hands,coins:coins,bet:bet};}};
  });

  R.register('war',function(g){var all=deck(),you=all.slice(0,26),bot=all.slice(26),pot=[],wins=0,clock=0,waiting=false,turn=0;var display=g.node('div',null,'rg-card-row');g.stage.append(display);g.button('Flip cards',play);
    function render(){g.score.textContent='You '+you.length+' cards · Bot '+bot.length+' · wars won '+wins;}
    function award(ok){(ok?you:bot).push.apply(ok?you:bot,R.shuffle(pot));pot=[];render();if(wins>=10||!bot.length)g.end('win');else if(!you.length)g.end('lose');}
    function play(){if(waiting||!you.length||!bot.length)return;var a=you.shift(),b=bot.shift();pot.push(a,b);turn++;display.replaceChildren(card(g,a),card(g,b));if(a.rank===b.rank){waiting=true;g.ask(function(ok){waiting=false;if(ok)wins++;award(ok);},'War tie: answer to win the cards.');}else award(a.rank>b.rank);}
    return {start:render,play:play,update:function(dt){clock+=dt;if(clock>=1.4){clock=0;play();}},state:function(){return {you:you,bot:bot,pot:pot,turn:turn};}};
  });

  R.register('spot-it',function(g){var symbols=['☀','☾','★','◆','●','▲','■','✚','♠','♣','♥','♦','✿','⚑','✦'],round=0,you=0,bot=0,match='',elapsed=0,timedOut=false,attempted=false;var panels=[g.node('div',null,'rg-controls'),g.node('div',null,'rg-controls')];panels.forEach(function(p){g.stage.append(p);});
    function render(){g.score.textContent='Card '+round+' / 15 · You '+you+' · Bot '+bot+' · '+Math.max(0,4.5-elapsed).toFixed(1)+' seconds';}
    function choose(s){if(timedOut||attempted)return;attempted=true;if(s===match)you++;else bot++;deal();}
    function deal(){round++;if(round>15){g.end(you>bot?'win':you<bot?'lose':'draw');return;}elapsed=0;timedOut=false;attempted=false;var pool=R.shuffle(symbols);match=pool[0];[R.shuffle([match].concat(pool.slice(1,6))),R.shuffle([match].concat(pool.slice(6,11)))].forEach(function(set,i){panels[i].replaceChildren();set.forEach(function(s){var b=g.node('button',s);b.type='button';b.dataset.symbol=s;panels[i].append(b);});});render();}
    panels.forEach(function(p){g.listen(p,'click',function(e){var b=e.target.closest('[data-symbol]');if(b&&g.active())choose(b.dataset.symbol);});});
    function update(dt){if(timedOut||attempted)return;elapsed+=dt;render();if(elapsed>=4.5){timedOut=true;g.ask(function(ok){if(ok)you++;else bot++;deal();},'4.5 seconds elapsed: the bot found it. Answer correctly to steal the point.');}}
    g.help('Find the symbol shared by both cards within 4.5 seconds. If the bot wins the timer, a correct answer steals its point.');return {start:deal,update:update,state:function(){return {round:round,match:match,you:you,bot:bot,elapsed:elapsed};}};
  });

  R.register('yahtzee',function(g){var dice=[1,1,1,1,1],held=[false,false,false,false,false],rolls=0,you=0,bot=0,open=Array(13).fill(true),round=0,awaiting=false;
    var names=['Ones','Twos','Threes','Fours','Fives','Sixes','Three of a kind','Four of a kind','Full house','Small straight','Large straight','Yahtzee','Chance'];
    var diceGrid=grid(g,5,5,function(i){if(rolls>0&&rolls<3){held[i]=!held[i];render();}}),roll=g.button('Roll dice',rollDice),sheet=grid(g,13,2,scoreCategory);
    function value(v,i){var n=Array(7).fill(0);v.forEach(function(x){n[x]++;});var sum=v.reduce(function(a,b){return a+b;},0);if(i<6)return n[i+1]*(i+1);if(i===6||i===7)return n.some(function(x){return x>=i-3;})?sum:0;if(i===8)return n.includes(3)&&n.includes(2)?25:0;if(i===9)return [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(function(seq){return seq.every(function(x){return n[x];});})?30:0;if(i===10)return new Set(v).size===5&&Math.max.apply(null,v)-Math.min.apply(null,v)===4?40:0;if(i===11)return n.includes(5)?50:0;return sum;}
    function render(){diceGrid.buttons.forEach(function(b,i){b.textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][dice[i]-1];b.dataset.value=dice[i];b.className=held[i]?'selected':'';b.disabled=!rolls||rolls>=3||awaiting;});sheet.buttons.forEach(function(b,i){b.textContent=names[i]+': '+(open[i]?value(dice,i):'filled');b.disabled=awaiting||!open[i]||!rolls;});roll.disabled=awaiting||rolls>=3;g.score.textContent='Roll '+rolls+' / 3 · rounds '+round+' / 13 · You '+you+' · Bot '+bot;}
    function rollDice(){if(awaiting||rolls>=3)return;dice=dice.map(function(v,i){return held[i]?v:1+random(6);});rolls++;diceGrid.buttons.forEach(function(b,i){if(!held[i]){b.classList.remove('rolling');void b.offsetWidth;b.classList.add('rolling');}});render();}
    function scoreCategory(i){if(awaiting||!rolls||!open[i])return;you+=value(dice,i);open[i]=false;var botDice=Array.from({length:5},function(){return 1+random(6);});bot+=value(botDice,i);round++;awaiting=true;render();retry(g,function(){awaiting=false;rolls=0;held.fill(false);render();if(round>=13)g.end(you>bot?'win':you<bot?'lose':'draw');},'Round scored. Answer correctly to unlock the next three-roll round.');}
    g.help('Three free rolls per round. Hold selected dice before roll two/three; only unheld dice reroll. Choose a category, then answer one question to unlock the next round.');return {start:render,value:value,roll:rollDice,scoreCategory:scoreCategory,state:function(){return {dice:dice,held:held,open:open,rolls:rolls,you:you,bot:bot};}};
  });

  R.register('simon-says',function(g){
    var sequence=[],input=0,completed=0,failures=0,showing=false,flashIndex=0,clock=0,waiting=false,armed=false;
    var names=['Red','Blue','Green','Yellow'],colors=['#ef4444','#3b82f6','#22c55e','#eab308'];
    var btns=grid(g,4,2,press).buttons;btns.forEach(function(b,i){b.textContent=names[i];b.style.background=colors[i];});
    var replay=g.button('Watch sequence again',function(){if(waiting)return;showing=true;flashIndex=0;clock=0;input=0;armed=false;render();});
    function render(){g.score.textContent=completed+' / 10 sequences · '+failures+' / 5 failed attempts';btns.forEach(function(b,i){b.disabled=showing||waiting||!armed;b.className=showing&&flashIndex<sequence.length&&clock<.55&&sequence[flashIndex]===i?'rg-simon-glow':'';});replay.disabled=waiting;}
    function unlock(){g.ask(function(right){if(!right){unlock();return;}armed=true;waiting=false;input=0;showing=false;render();g.status('Now repeat the colors.');},'Answer correctly to unlock the sequence input.');}
    function start(){sequence.push(random(4));input=0;showing=true;flashIndex=0;clock=0;armed=false;render();g.status('Watch the sequence, then answer to repeat it.');}
    function retry(){g.ask(function(right){waiting=false;if(right){input=0;armed=true;render();g.status('Retry the sequence.');}else retry();},'Sequence failed. Answer correctly to retry it.');}
    function press(i){if(showing||waiting||!armed)return;if(i!==sequence[input]){failures++;waiting=true;render();if(failures>=5){g.end('lose');return;}retry();return;}input++;if(input===sequence.length){completed++;armed=false;if(completed>=10){g.end('win');return;}render();start();}else render();}
    g.help('Sequence glows, then ONE question unlocks input. Repeat the colors freely with no per-click questions. Next sequence then question again. Ten sequences or five failures end the round.');
    return {start:start,press:press,state:sequence,update:function(dt){if(showing){clock+=dt;if(clock>=.85){clock=0;flashIndex++;if(flashIndex>=sequence.length){showing=false;unlock();}render();}}},draw:render};
  });
}());