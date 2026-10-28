// Death pauses the game and asks a question from window.GAME_DATA — the site's
// token-saving 1-prompt-fill payload. Nothing here generates questions: the
// game code is fixed and a model fills only the question list at the injection
// marker. Correct revives; a wrong answer reveals the answer and advances.
(function() {
  if (typeof Mario === 'undefined') window.Mario = {};

  var overlay, questionEl, optionsEl, feedbackEl, nextBtn;
  var current = null, questionIndex = 0, started = 0;
  var resume = null;
  var correctCount = 0, wrongCount = 0;

  function getPayload() {
    return (window.GAME_DATA && Array.isArray(window.GAME_DATA.questions) && window.GAME_DATA.questions.length)
      ? window.GAME_DATA : null;
  }

  // Question cursor: advances across deaths, wraps only after the pool is spent.
  var CURSOR_KEY = 'polymath.lab.cursor.mario';
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
        detail: Object.assign({ source: 'mario', engineId: 'mario', result: name, correct: correctCount, wrong: wrongCount }, detail || {}),
      }));
    } catch (e) {}
  }

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'math-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML =
      '<div class="math-dialog">' +
        '<h2>You died!</h2>' +
        '<p>Pick the right answer to come back to life.</p>' +
        '<div class="math-question"></div>' +
        '<div class="math-options"></div>' +
        '<div class="math-feedback"></div>' +
        '<button type="button" class="math-next" hidden>Next question</button>' +
      '</div>';

    document.body.appendChild(overlay);
    questionEl = overlay.querySelector('.math-question');
    optionsEl = overlay.querySelector('.math-options');
    feedbackEl = overlay.querySelector('.math-feedback');
    nextBtn = overlay.querySelector('.math-next');
    nextBtn.addEventListener('click', function () {
      if (!overlay.classList.contains('hidden')) ask();
    });

    // number keys 1-4 pick an option on desktop
    document.addEventListener('keydown', function(e) {
      if (overlay.classList.contains('hidden')) return;
      var code = e.keyCode - 48;
      if (code >= 1 && code <= 4) {
        var btn = optionsEl.children[code - 1];
        if (btn) { e.preventDefault(); btn.click(); }
      }
    });
  }

  function ask() {
    var p = getPayload();
    if (!p) {
      questionEl.textContent = 'No questions loaded for this level yet.';
      optionsEl.innerHTML = '';
      feedbackEl.textContent = 'The question set is being prepared. Reload to retry.';
      return;
    }
    var taken = takeQuestion(p.questions);
    current = taken.question;
    questionIndex = taken.index;
    started = Date.now();
    questionEl.textContent = current.prompt;
    feedbackEl.textContent = taken.wrapped ? ((p.feedback && p.feedback.outOfQuestions) || 'Starting the question pool again.') : '';
    nextBtn.hidden = true;
    optionsEl.innerHTML = '';
    (current.choices || []).forEach(function(choice, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'math-option';
      btn.textContent = String.fromCharCode(65 + i) + '. ' + choice;
      btn.addEventListener('click', function() { choose(i); });
      optionsEl.appendChild(btn);
    });
  }

  function choose(index) {
    if (!current) return;
    var right = index === current.answerIndex;
    if (right) {
      correctCount++;
      emit('answer', { questionId: current.id, questionIndex: questionIndex, correct: true, chosen: (current.choices || [])[index], ms: Date.now() - started });
      feedbackEl.textContent = '';
      overlay.classList.add('hidden');
      var cb = resume;
      resume = null;
      if (cb) cb();
    } else {
      wrongCount++;
      emit('answer', { questionId: current.id, questionIndex: questionIndex, correct: false, chosen: (current.choices || [])[index], ms: Date.now() - started });
      feedbackEl.innerHTML = '<strong style="color:#7ee787">Correct: ' + (current.choices || [])[current.answerIndex] + '</strong> ' + (current.explanation || '');
      Array.prototype.forEach.call(optionsEl.children, function(btn, i) {
        btn.disabled = true;
        btn.style.borderColor = i === current.answerIndex ? '#4caf50' : (i === index ? '#ff6b6b' : '');
      });
      nextBtn.hidden = false;
    }
  }

  Mario.requireMathToRevive = function(callback) {
    resume = callback;
    if (!overlay) build();
    feedbackEl.textContent = '';
    ask();
    overlay.classList.remove('hidden');
  };

  // Accepts a payload from the shared shell without touching game code.
  window.initGame = function (payload) {
    if (payload && Array.isArray(payload.questions)) window.GAME_DATA = payload;
  };
})();