(function () {
  'use strict';
  // The crash gate. Questions come only from window.GAME_DATA (the site's
  // token-saving 1-prompt-fill payload), never generated here. Game code is
  // fixed; a model fills only the question list at the injection marker.
  var state = { open: false, question: null, questionIndex: 0, started: 0 };
  var correctCount = 0, wrongCount = 0;

  function getPayload() {
    return (window.GAME_DATA && Array.isArray(window.GAME_DATA.questions) && window.GAME_DATA.questions.length)
      ? window.GAME_DATA : null;
  }

  // Question cursor: advances across deaths, wraps only after the pool is spent.
  var CURSOR_KEY = 'polymath.lab.cursor.moto-x3m';
  var fallbackAt = 0;
  try { fallbackAt = Math.max(0, Number(localStorage.getItem(CURSOR_KEY)) || 0); } catch (e) {}
  var fallbackCursor = {
    at: fallbackAt,
    next: function (total) {
      var index = this.at % total, wrapped = this.at > 0 && index === 0;
      this.at += 1;
      try { localStorage.setItem(CURSOR_KEY, String(this.at)); } catch (e) {}
      return { index: index, wrapped: wrapped };
    },
  };
  function takeQuestion(questions) {
    var cursor = (window.PolymathGame && window.PolymathGame.cursor) || fallbackCursor;
    var taken = cursor.next(questions.length);
    return { question: questions[taken.index], index: taken.index, wrapped: taken.wrapped };
  }

  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent('game:' + name, {
        detail: Object.assign({ source: 'moto-x3m', engineId: 'moto-x3m', result: name, correct: correctCount, wrong: wrongCount }, detail || {}),
      }));
    } catch (e) {}
  }

  var overlay = document.createElement('div');
  overlay.id = 'mx3m-math-gate';
  overlay.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(4,10,22,.85);z-index:2147483647;font-family:Arial,Verdana,sans-serif;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);';

  overlay.innerHTML = [
    '<div id="mx3m-math-card" style="width:min(92vw,460px);box-sizing:border-box;background:linear-gradient(180deg,#1e3a5f,#122139);border:3px solid #6ec1ff;border-radius:18px;padding:24px;text-align:center;color:#eaf6ff;box-shadow:0 18px 60px rgba(0,0,0,.6),0 0 0 6px rgba(110,193,255,.15);">',
    '<div style="font-size:26px;font-weight:bold;letter-spacing:.5px;color:#ffde59;text-shadow:2px 2px 0 #7a3b00;">You crashed!</div>',
    '<div style="margin:6px 0 16px;font-size:14px;color:#bcd8f2;">Answer correctly to keep riding</div>',
    '<div id="mx3m-math-q" style="font-size:21px;font-weight:bold;margin:8px 0 16px;color:#fff;line-height:1.35;"></div>',
    '<div id="mx3m-math-choices" style="display:grid;gap:8px;"></div>',
    '<div id="mx3m-math-fb" style="margin-top:12px;min-height:20px;font-size:14px;color:#cfe6ff;text-align:left;"></div>',
    '<button id="mx3m-math-next" type="button" style="margin-top:12px;width:100%;font-size:18px;font-weight:bold;padding:11px;border:0;border-radius:12px;cursor:pointer;color:#08240f;background:linear-gradient(180deg,#7ee787,#39b54a);box-shadow:0 5px 0 #1f7a2d;display:none;">Next question</button>',
    '</div>',
  ].join('');

  function qEl() { return document.getElementById('mx3m-math-q'); }
  function choicesEl() { return document.getElementById('mx3m-math-choices'); }
  function fbEl() { return document.getElementById('mx3m-math-fb'); }
  function nextBtn() { return document.getElementById('mx3m-math-next'); }

  function shake() {
    var c = document.getElementById('mx3m-math-card');
    c.style.transition = 'none';
    var t = 0;
    var iv = setInterval(function () {
      t++;
      c.style.transform = 'translateX(' + (t % 2 ? 8 : -8) + 'px)';
      if (t >= 6) { clearInterval(iv); c.style.transform = ''; }
    }, 45);
  }

  function releaseStuckKeys() {
    [13, 16, 17, 32, 37, 38, 39, 40, 65, 68, 82, 83, 87].forEach(function (code) {
      [window, document].forEach(function (t) {
        try { t.dispatchEvent(new KeyboardEvent('keyup', { keyCode: code, which: code, bubbles: true })); } catch (e) {}
      });
    });
  }

  function showQuestion() {
    var p = getPayload();
    if (!p) {
      qEl().textContent = 'No questions are loaded for this level yet.';
      choicesEl().innerHTML = '';
      fbEl().textContent = 'The question set is still being prepared. Reload the page to retry.';
      return;
    }
    var taken = takeQuestion(p.questions);
    state.question = taken.question;
    state.questionIndex = taken.index;
    state.started = Date.now();
    qEl().textContent = state.question.prompt;
    fbEl().textContent = taken.wrapped ? ((p.feedback && p.feedback.outOfQuestions) || 'Starting the question pool again.') : '';
    nextBtn().style.display = 'none';
    choicesEl().innerHTML = '';
    (state.question.choices || []).forEach(function (choice, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.index = String(i);
      b.textContent = String.fromCharCode(65 + i) + '. ' + choice;
      b.style.cssText = 'width:100%;text-align:left;font-size:17px;font-weight:600;padding:11px 14px;border:2px solid #6ec1ff;border-radius:11px;background:#0b1626;color:#eaf6ff;cursor:pointer;';
      choicesEl().appendChild(b);
    });
  }

  function submit(index) {
    if (!state.open || !state.question) return;
    var q = state.question;
    var right = index === q.answerIndex;
    if (right) {
      correctCount++;
      emit('answer', { questionId: q.id, questionIndex: state.questionIndex, correct: true, chosen: (q.choices || [])[index], ms: Date.now() - state.started });
      releaseStuckKeys();
      state.open = false;
      overlay.style.display = 'none';
    } else {
      wrongCount++;
      emit('answer', { questionId: q.id, questionIndex: state.questionIndex, correct: false, chosen: (q.choices || [])[index], ms: Date.now() - state.started });
      fbEl().innerHTML = '<strong style="color:#7ee787">Correct: ' + (q.choices || [])[q.answerIndex] + '</strong><br>' + (q.explanation || '');
      Array.prototype.forEach.call(choicesEl().children, function (b, i) {
        b.disabled = true;
        if (i === q.answerIndex) b.style.borderColor = '#7ee787';
        else if (i === index) b.style.borderColor = '#ff8a8a';
      });
      nextBtn().style.display = 'block';
      shake();
    }
  }

  function show() {
    state.open = true;
    overlay.style.display = 'flex';
    showQuestion();
  }

  function attach() {
    document.body.appendChild(overlay);
    choicesEl().addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-index]') : null;
      if (b && !b.disabled) submit(Number(b.dataset.index));
    });
    nextBtn().addEventListener('click', function () { if (state.open) showQuestion(); });
    ['keydown', 'keypress'].forEach(function (evt) {
      overlay.addEventListener(evt, function (e) { e.stopPropagation(); }, false);
    });
    ['mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'pointerdown', 'pointerup'].forEach(function (evt) {
      overlay.addEventListener(evt, function (e) { e.stopPropagation(); }, false);
    });
  }

  // The game (motox3m4.min.js) calls these to pause input and gate a revive.
  window.__mx3mGate = {
    blocking: function () { return state.open; },
    onDeath: function () { if (!state.open) show(); },
  };

  // Accepts a payload from the shared shell without touching game code.
  window.initGame = function (payload) {
    if (payload && Array.isArray(payload.questions)) window.GAME_DATA = payload;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();