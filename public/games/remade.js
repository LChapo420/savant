/* Shared lifecycle only. Mechanics are in boards.js and arcade.js; curriculum is
 * exclusively GAME_DATA. No models ever write or fill executable game code. */
(function () {
  'use strict';
  if (window.RemadeGames) return;
  var factories = {}, disposePrevious = function () {};
  var fallback = {};
  function shuffle(values, random) {
    var out = values.slice(); random = random || Math.random;
    for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)); var temp = out[i]; out[i] = out[j]; out[j] = temp; }
    return out;
  }
  function node(tag, text, className) { var el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
  window.RemadeGames = {
    factories: factories, shuffle: shuffle,
    register: function (id, factory) { factories[id] = factory; },
    dispose: function () { disposePrevious(); },
    start: function (id, payload) {
      disposePrevious();
      var root = document.getElementById('game-root');
      if (!root) return;
      root.replaceChildren();
      var timers = new Set(), listeners = [], raf = null, disposed = false;
      var phase = 'play', paused = false;
      var correct = 0, wrong = 0, used = 0, question = null, questionIndex = null, questionStart = 0, callback = null;
      var shell = window.PolymathGame || {};
      var cursor = shell.cursor || (fallback[id] || (fallback[id] = {
        at:0, next:function (total) { var index = this.at % total, wrapped = this.at > 0 && index === 0; this.at++; return {index:index,wrapped:wrapped}; }
      }));
      var header = node('div',null,'rg-header');
      var title = node('h2',id.split('-').map(function (part) { return part[0].toUpperCase()+part.slice(1); }).join(' '));
      var topic = node('div',String((payload && payload.meta || {}).topic || ''),'rg-topic');
      var toolbar = node('div',null,'rg-toolbar');
      var pause = node('button','Pause'); pause.type = 'button'; pause.dataset.gamePause = '';
      var finish = node('button','Finish'); finish.type = 'button'; finish.dataset.gameEnd = '';
      toolbar.append(pause,finish); header.append(title,toolbar); root.append(header,topic);
      var status = node('div','Ready.','rg-status'); status.dataset.gameStatus = ''; status.setAttribute('role','status'); root.append(status);
      var layout = node('div',null,'rg-layout'), stage = node('div',null,'rg-stage'), quiz = node('div',null,'rg-stage');
      stage.dataset.gameStage = ''; var score = node('div','','rg-score'); score.dataset.gameScore = ''; stage.append(score);
      var counter = node('div','Questions appear when the game needs them.','rg-topic'); counter.dataset.gameCounter = '';
      var prompt = node('p','Play on the left. Questions pause the game.','rg-prompt'); prompt.dataset.gamePrompt = '';
      var choices = node('div',null,'rg-choices'); choices.dataset.gameChoices = '';
      var feedback = node('div',null,'rg-feedback'); feedback.dataset.gameVerdict = ''; feedback.setAttribute('role','status');
      var next = node('button','Continue'); next.type='button'; next.dataset.gameContinue=''; next.hidden=true;
      quiz.append(counter,prompt,choices,feedback,next); layout.append(stage,quiz); root.append(layout);
      var help = node('p','','rg-help'); root.append(help);
      var modal=node('div',null,'rg-modal'); modal.hidden=true; modal.dataset.gameModal=''; modal.dataset.open='false'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label','Game results');
      var card=node('div',null,'rg-modal-card'), result=node('h3'), stats=node('p'); result.dataset.gameResult='';
      var restart=node('button','Play again'); restart.type='button'; restart.dataset.gameRestart='';
      var keepPlaying=node('button','Continue playing');keepPlaying.type='button';keepPlaying.dataset.gameKeepPlaying='';keepPlaying.hidden=true;
      var door=node('a','Next level','rg-link'); door.dataset.gameNext=''; door.href=shell.nextLevelUrl||'#'; door.hidden=!shell.nextLevelUrl;
      card.append(result,stats,restart,keepPlaying,door); modal.append(card); root.append(modal);
      var continueRound=null;
      function listen(target,name,handler,options) { target.addEventListener(name,handler,options); listeners.push(function () { target.removeEventListener(name,handler,options); }); }
      function later(fn,ms) { var handle=window.setTimeout(function () { timers.delete(handle); if(!disposed) fn(); },ms); timers.add(handle); return handle; }
      function emit(name,data) { window.dispatchEvent(new CustomEvent('game:'+name,{detail:Object.assign({source:id,engineId:id},data)})); }
      var controller;
      function dispose() {
        if(disposed) return; disposed=true; timers.forEach(window.clearTimeout); timers.clear(); window.cancelAnimationFrame(raf);
        listeners.forEach(function(remove){remove();}); if(controller&&controller.dispose) controller.dispose();
      }
      disposePrevious=dispose;
      function end(outcome,text) {
        if(phase==='over'||disposed) return;
        phase='over'; paused=false; next.hidden=true; finish.disabled=true; pause.disabled=true;
        stage.setAttribute('inert',''); quiz.setAttribute('inert','');
        result.textContent=text||(payload.feedback||{})[outcome]||('Round '+outcome);
        stats.textContent=score.textContent+' · '+correct+' correct, '+wrong+' incorrect, '+used+' questions.';
        modal.hidden=false; modal.dataset.open='true';
        emit(outcome,{result:outcome,correct:correct,wrong:wrong,questionsUsed:used}); restart.focus();
      }
      var api={
        id:id,root:root,stage:stage,score:score,random:Math.random,shuffle:shuffle,node:node,listen:listen,later:later,
        status:function(text){status.textContent=text;},
        help:function(text){help.textContent=text;},
        active:function(){return !disposed&&!paused&&phase==='play';},
        phase:function(){return phase;},
        isPaused:function(){return paused;},
        end:end,
        milestone:function(text,fn){continueRound=fn;keepPlaying.hidden=false;end('win',text);},
        correctCount:function(){return correct;},
        canAnswer:function(){return !disposed&&!paused&&phase==='question';},
        liveQuestion:false,
        inputAnswer:false,
        ask:function(fn,text){
          if(disposed||phase==='over'||phase==='question'||phase==='feedback') return;
          phase='question'; paused=false; pause.textContent='Pause'; callback=fn;
          var taken=cursor.next(payload.questions.length); questionIndex=taken.index; question=payload.questions[questionIndex]; questionStart=Date.now();
          counter.textContent='Question '+(questionIndex+1)+' of '+payload.questions.length;
          prompt.textContent=question.prompt; feedback.textContent=''; next.hidden=true; choices.replaceChildren();
          question.choices.forEach(function(choice,i){var button=node('button',String.fromCharCode(65+i)+'. '+choice,'rg-choice');button.type='button';button.dataset.gameChoice=String(i);choices.append(button);});
          status.textContent=(taken.wrapped?'Question pool complete; starting it again. ':'')+(text||'Answer to continue playing.');
          if(controller&&controller.question) controller.question(question);
          choices.querySelectorAll('button').forEach(function(b){b.disabled=api.inputAnswer;});
          choices.firstChild.focus();
        },
        question:function(){return question;},
        choose:function(index){submitAnswer(index);},
        dpad:function(fn){var pad=node('div',null,'rg-dpad');stage.append(pad);[['↑',0,-1,'up'],['←',-1,0,'left'],['↓',0,1,'down'],['→',1,0,'right']].forEach(function(d){var b=api.button(d[0],function(){fn(d[1],d[2]);},pad);b.dataset.direction=d[3];b.setAttribute('aria-label','Move '+d[3]);});return pad;},
        button:function(label,fn,parent){var b=node('button',label);b.type='button';b.dataset.gameAction='';(parent||stage).append(b);listen(b,'click',function(){if(api.active()&&!b.disabled)fn();});return b;},
        grid:function(columns){var grid=node('div',null,'rg-grid');grid.style.gridTemplateColumns='repeat('+columns+',minmax(0,1fr))';stage.append(grid);return grid;},
        canvas:function(){var canvas=node('canvas');canvas.width=640;canvas.height=400;canvas.tabIndex=0;canvas.setAttribute('aria-label','Game field. Use keyboard or touch controls.');stage.append(canvas);return canvas;}
      };
      function submitAnswer(index){
        if(!api.canAnswer()||!Number.isInteger(index)||index<0||index>=question.choices.length)return;
        var right=index===question.answerIndex;
        phase='feedback'; used++; if(right)correct++;else wrong++;
        Array.from(choices.children).forEach(function(b,i){b.disabled=true;if(i===question.answerIndex)b.classList.add('correct');else if(i===index)b.classList.add('incorrect');});
        feedback.textContent=(right?'Correct.':'Incorrect. Correct answer: '+question.choices[question.answerIndex])+ (question.explanation?'\n'+question.explanation:''); next.hidden=false;
        emit('answer',{questionId:question.id||'q'+(questionIndex+1),questionIndex:questionIndex,correct:right,chosen:question.choices[index],ms:Math.max(0,Date.now()-questionStart)});
        api.pendingAnswer=right; next.focus();
      }
      listen(choices,'click',function(e){var button=e.target.closest('[data-game-choice]');if(button&&!button.disabled)submitAnswer(Number(button.dataset.gameChoice));});
      listen(next,'click',function(){if(phase!=='feedback'||paused)return;phase='play';next.hidden=true;choices.replaceChildren();prompt.textContent='Keep playing. The next question appears when needed.';feedback.textContent='';var fn=callback;callback=null;if(fn)fn(api.pendingAnswer);});
      function togglePause(){if(phase==='over')return;paused=!paused;pause.textContent=paused?'Resume':'Pause';status.textContent=paused?'Paused.': 'Resumed.';if(controller&&controller.pause)controller.pause(paused);}
      listen(pause,'click',togglePause);listen(finish,'click',function(){end('draw');});listen(restart,'click',function(){window.initGame(payload);});
      listen(keepPlaying,'click',function(){if(phase!=='over'||!continueRound)return;phase='play';modal.hidden=true;modal.dataset.open='false';stage.removeAttribute('inert');quiz.removeAttribute('inert');finish.disabled=false;pause.disabled=false;keepPlaying.hidden=true;var fn=continueRound;continueRound=null;fn();});
      listen(root,'keydown',function(e){
        if(phase==='over'&&e.key==='Tab'){e.preventDefault();var options=[restart];if(!keepPlaying.hidden)options.push(keepPlaying);if(!door.hidden)options.push(door);var at=options.indexOf(document.activeElement);options[(at+(e.shiftKey?-1:1)+options.length)%options.length].focus();return;}
        if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;
        if(e.key.toLowerCase()==='p'||e.key==='Escape'){if(!e.repeat){e.preventDefault();togglePause();}return;}
        if((api.active()||api.canAnswer()&&api.liveQuestion)&&controller&&controller.key&&controller.key(e.key,e.repeat)){e.preventDefault();}
      });
      listen(window,'blur',function(){if(!paused&&phase!=='over')togglePause();});
      listen(document,'visibilitychange',function(){if(document.hidden&&!paused&&phase!=='over')togglePause();});listen(window,'pagehide',dispose);
      if(!payload||!Array.isArray(payload.questions)||!payload.questions.length||!payload.questions.every(function(q){return q&&typeof q.prompt==='string'&&Array.isArray(q.choices)&&q.choices.length===4&&Number.isInteger(q.answerIndex)&&q.answerIndex>=0&&q.answerIndex<4;})){
        status.textContent='A valid four-choice question set is required.';pause.disabled=true;finish.disabled=true;return api;
      }
      if(!factories[id]){status.textContent='This engine is not installed.';return api;}
      controller=factories[id](api);
      // Exposes deterministic state to the gameplay test harness, not server grades.
      api.controller=controller; window.RemadeGames.current=api;
      emit('start',{});
      if(controller.start)controller.start();
      var last=null;
      function frame(time){
        if(disposed)return;if(!root.isConnected){dispose();return;}
        var dt=last==null?0:Math.min(.035,(time-last)/1000);last=time;
        if(dt>0&&(api.active()||api.canAnswer()&&api.liveQuestion)&&controller.update)controller.update(dt);
        if(controller.draw)controller.draw();
        raf=window.requestAnimationFrame(frame);
      }
      raf=window.requestAnimationFrame(frame);
      return api;
    }
  };
}());