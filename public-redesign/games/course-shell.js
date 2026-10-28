(function () {
  'use strict';

  var body = document.body;
  var engineId = String(body.dataset.engine || '');
  var track = String(body.dataset.track || '');
  var grade = String(body.dataset.grade || '');
  var level = Number(body.dataset.level);
  var cursorKey = 'polymath.game.cursor.' + track + '.' + grade + '.' + level + '.' + engineId;
  var cursorAt = 0;
  try { cursorAt = Math.max(0, Number(localStorage.getItem(cursorKey)) || 0); } catch (err) {}

  function relay(name, event) {
    var detail = event && event.detail ? event.detail : {};
    window.parent.postMessage({
      type: 'polymath:game',
      name: name,
      engineId: engineId,
      questionId: detail.questionId,
      questionIndex: detail.questionIndex,
      correct: !!detail.correct,
      ms: Number(detail.ms) || 0,
      result: detail.result || name,
      correctCount: Number(detail.correctCount || detail.correct) || 0,
      wrongCount: Number(detail.wrongCount || detail.wrong) || 0,
      questionsUsed: Number(detail.questionsUsed) || 0,
    }, window.location.origin);
  }

  // The course page owns the cursor position so standalone game pages and course
  // games cannot accidentally share a question sequence.
  window.PolymathGame = {
    engineId: engineId,
    level: level,
    cursor: {
      at: cursorAt,
      next: function (total) {
        var size = Math.max(1, Number(total) || 1);
        var index = this.at % size;
        var wrapped = this.at > 0 && index === 0;
        this.at += 1;
        try { localStorage.setItem(cursorKey, String(this.at)); } catch (err) {}
        window.parent.postMessage({
          type: 'polymath:game',
          name: 'question',
          engineId: engineId,
          questionIndex: index,
        }, window.location.origin);
        return { index: index, wrapped: wrapped };
      },
    },
  };

  ['answer', 'win', 'lose', 'draw'].forEach(function (name) {
    window.addEventListener('game:' + name, function (event) { relay(name, event); });
  });

  if (window.GAME_DATA && typeof window.initGame === 'function') {
    window.initGame(window.GAME_DATA);
  }
}());