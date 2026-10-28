/* The bridge inside a sandboxed lesson or game frame (security review 2026-10-24, D4).
 *
 * routes/base-lessons.js serves model-written pages as their own document, loaded by
 * the course page (public/js/base-lesson.js) in <iframe sandbox="allow-scripts
 * allow-forms">. The frame has an opaque origin: it cannot read the app's cookies,
 * storage or DOM, and it cannot call the API as the learner. Everything a page used to
 * reach on the course page arrives here instead, as a message to the parent:
 *
 *   window.polymathFinishLesson(level)   -> { name: 'finish', level }
 *   window.PolymathGame.cursor.next(n)   -> { name: 'question', questionIndex, at }
 *   game:answer / game:win|lose|draw     -> { name: 'answer' | 'win' | 'lose' | 'draw', ... }
 *   what the learner did on the page     -> { name: 'capture', report } (LevelCapture)
 *   the page's height                    -> { name: 'size', height }
 *   a link to the next level or the path -> { name: 'navigate', href }
 *   the page has run                     -> { name: 'ready', hasFinish }
 *
 * The parent checks every message (its source is this frame, its origin is "null",
 * its shape is one of the above) and decides what to do. Nothing secret is in here:
 * the page's own code can read this file's state, and that is fine, because nothing
 * the frame holds is worth having.
 */
(function () {
  'use strict';

  var config = {};
  try { config = JSON.parse(document.getElementById('polymath-frame-config').textContent || '{}'); } catch (err) { config = {}; }
  // The parent's origin: this document's URL is the app's (the origin is opaque, the
  // URL is not), so messages go to that origin only.
  var parentOrigin = '*';
  try { parentOrigin = new URL(window.location.href).origin; } catch (err) { /* keep '*' */ }
  if (!parentOrigin || parentOrigin === 'null') parentOrigin = '*';

  function post(name, data) {
    if (window.parent === window) return;
    var message = { type: 'polymath:frame', name: name };
    if (data) Object.keys(data).forEach(function (k) { message[k] = data[k]; });
    try { window.parent.postMessage(message, parentOrigin); } catch (err) { /* the parent went away */ }
  }

  // ── finishing a lesson ───────────────────────────────────────────────────
  window.polymathFinishLesson = function finishLesson(level) {
    post('finish', { level: Number(level) || Number(config.level) || null });
  };

  // ── a game's shell ───────────────────────────────────────────────────────
  if (config.kind === 'game') {
    var at = Math.max(0, Math.floor(Number(config.cursorAt) || 0));
    window.PolymathGame = {
      engineId: config.engineId || 'game',
      level: Number(config.level),
      nextLevelUrl: config.nextLevelUrl || null,
      current: null,
      answered: {},
      cursor: {
        at: at,
        next: function (total) {
          var size = Math.max(1, Number(total) || 1);
          var index = this.at % size;
          var wrapped = this.at > 0 && index === 0;
          this.at += 1;
          window.PolymathGame.current = index;
          post('question', { questionIndex: index, at: this.at });
          return { index: index, wrapped: wrapped };
        },
      },
    };
    ['answer', 'win', 'lose', 'draw'].forEach(function (name) {
      window.addEventListener('game:' + name, function (event) {
        var d = (event && event.detail) || {};
        if (name === 'answer') {
          if (d.questionId) window.PolymathGame.answered[d.questionId] = true;
          post('answer', {
            questionId: String(d.questionId || ''), questionIndex: Number(d.questionIndex),
            correct: !!d.correct, ms: Math.max(0, Number(d.ms) || 0),
          });
        } else {
          post(name, {
            result: name, correct: Number(d.correct) || 0, wrong: Number(d.wrong) || 0,
            questionsUsed: Number(d.questionsUsed) || 0,
          });
        }
      });
    });
  }

  // ── links: the course page navigates, the frame never does ──────────────
  document.addEventListener('click', function (event) {
    var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return;
    event.preventDefault();
    post('navigate', { href: href });
  }, true);

  // ── size, capture, ready ────────────────────────────────────────────────
  var lastHeight = 0;
  function sendSize() {
    // The content's own height (the body does not stretch to the frame), so the course
    // page can fit the frame to a short page and cap a long one at its viewport.
    var host = document.getElementById('base-lesson-host');
    var h = Math.ceil(host ? host.getBoundingClientRect().height : (document.body ? document.body.scrollHeight : 0));
    if (Math.abs(h - lastHeight) < 2) return;
    lastHeight = h;
    post('size', { height: h });
  }

  var report = null;
  var captureTimer = null;
  function sendCapture() {
    captureTimer = null;
    if (!report) return;
    try { post('capture', { report: report() }); } catch (err) { /* nothing to send */ }
  }
  function queueCapture() {
    if (captureTimer === null) captureTimer = window.setTimeout(sendCapture, 400);
  }

  function start() {
    var host = document.getElementById('base-lesson-host');
    if (config.kind !== 'game' && host && window.LevelCapture) {
      report = window.LevelCapture.watch([host], { name: function () { return 'the lesson page'; } });
      ['click', 'change', 'keydown'].forEach(function (type) { host.addEventListener(type, queueCapture, true); });
      window.setInterval(sendCapture, 5000);
      window.addEventListener('pagehide', sendCapture);
      document.addEventListener('visibilitychange', sendCapture);
    }
    sendSize();
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(sendSize);
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } else {
      window.setInterval(sendSize, 500);
    }
    window.addEventListener('load', sendSize);
  }

  document.addEventListener('DOMContentLoaded', start);
  // "ready" once the page's own DOMContentLoaded work has run: the listener above was
  // added first, so this one, added on load, comes after every page handler.
  window.addEventListener('load', function () {
    var hasFinish = Array.prototype.some.call(document.querySelectorAll('#base-lesson-host button'), function (b) {
      return /finish/i.test(b.textContent || '');
    });
    sendSize();
    post('ready', { hasFinish: hasFinish });
  });
}());
