/* The basketball blocks.
 *
 *   Basketball_Play    { prompt, frames, pauseAt?, options: [{id, label}], answer, explanation, seconds? }
 *                      A play runs on the court and stops at the decision; the learner
 *                      picks the read against the clock, then sees why and how it ends.
 *   Check_Play         { id, prompt, frames, pauseAt?, options, seconds? }
 *                      The same, graded on the server: no answer is on the page.
 *   Basketball_Film    { prompt, protocol: [steps], seconds, cameraTip, rubric: [criteria] }
 *                      Film a set from the phone, watch it back, rate it against the rubric.
 *                      The clip stays on this device.
 *   Basketball_ShotLog { prompt, shots? }
 *                      Tap where each shot was taken and whether it went in; see FG%,
 *                      eFG% and where the points came from.
 *   Basketball_Session { title, warmup: [{name, seconds}], drills: [{name, minutes, cue}] }
 *                      A court session card: a health check, the warm-up (always first),
 *                      timed drills, then effort, pain and enjoyment, logged.
 *
 * Needs court.js and tracking.js (zones and shot numbers); Check_Play needs
 * checks-common.js. The camera blocks, Basketball_ShotTracker and
 * Basketball_HandleDrill, are in camera-blocks.js and build on this file.
 */
(function (global) {
  var Court = global.PolymathCourt;
  var TAG = 'polymath_bball';

  function blocks() {
    return global.LessonBlocks = global.LessonBlocks || {
      modules: {},
      register: function (tag, mod) { this.modules[tag] = mod; },
      get: function (tag) { return this.modules[tag]; },
      all: function () { var out = []; for (var k in this.modules) if (this.modules.hasOwnProperty(k)) out.push(this.modules[k]); return out; },
    };
  }

  function styles() {
    if (document.getElementById(TAG + '__styles')) return;
    var t = TAG;
    var st = document.createElement('style');
    st.id = t + '__styles';
    st.textContent = [
      '.' + t + '__card{background:#111827;border:1px solid #1f293d;border-radius:12px;padding:18px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f8fafc;}',
      '.' + t + '__kicker{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#38bdf8;margin:0 0 8px;}',
      '.' + t + '__prompt{margin:0 0 12px;font-size:16px;line-height:1.55;font-weight:600;white-space:pre-wrap;}',
      '.' + t + '__note{margin:10px 0 0;font-size:14px;line-height:1.55;color:#cbd5e1;white-space:pre-wrap;}',
      '.' + t + '__row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;}',
      '.' + t + '__col{display:flex;flex-direction:column;gap:8px;margin:10px 0;}',
      '.' + t + '__btn{min-height:44px;padding:0 16px;border:1px solid #334155;border-radius:10px;background:#090d16;color:#f8fafc;font:inherit;font-weight:600;cursor:pointer;text-align:left;}',
      '.' + t + '__btn.is-primary{background:#38bdf8;color:#090d16;border-color:#38bdf8;}',
      '.' + t + '__btn.is-right{border-color:#34d399;box-shadow:0 0 0 1px #34d399;}',
      '.' + t + '__btn.is-wrong{border-color:#f87171;box-shadow:0 0 0 1px #f87171;}',
      '.' + t + '__btn.is-on{border-color:#38bdf8;box-shadow:0 0 0 1px #38bdf8;}',
      '.' + t + '__btn:disabled{opacity:.55;cursor:default;}',
      '.' + t + '__btn:focus-visible{outline:2px solid #38bdf8;outline-offset:2px;}',
      '.' + t + '__clock{font-size:22px;font-weight:800;color:#fbbf24;text-align:center;min-height:1.3em;}',
      '.' + t + '__result{margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #1f293d;background:#090d16;font-size:14px;line-height:1.55;}',
      '.' + t + '__result.is-right{border-color:#34d399;}',
      '.' + t + '__result.is-wrong{border-color:#f87171;}',
      '.' + t + '__video{width:100%;max-width:460px;border-radius:10px;background:#000;display:block;margin:8px auto;}',
      '.' + t + '__stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:10px;}',
      '.' + t + '__stat{background:#090d16;border:1px solid #1f293d;border-radius:10px;padding:10px;text-align:center;}',
      '.' + t + '__stat b{display:block;font-size:20px;}',
      '.' + t + '__stat span{font-size:12px;color:#94a3b8;}',
      '.' + t + '__warn{margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #fbbf24;background:#1c1917;font-size:14px;line-height:1.55;}',
    ].join('');
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls.split(' ').map(function (c) { return /^is-/.test(c) ? c : TAG + '__' + c; }).join(' ');
    if (text != null) e.textContent = String(text);
    return e;
  }
  function button(text, cls) { var b = el('button', 'btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; return b; }

  // ── shared by the court blocks and the camera blocks (camera-blocks.js) ────
  var HEALTH_STOP = 'Skip court work today. Pain that changes how you move needs rest, and if it lasts more than a few days or keeps coming back, see a doctor or physio. After a head knock with symptoms, no basketball until a healthcare provider clears you; get urgent help for repeated vomiting, a worsening headache or confusion. You can still do the screen parts of the lesson.';
  var HURT_STOP = 'Stop the session now and rest. Pain that changes how you move is the body asking you to stop. If it lasts into tomorrow, or comes back, get it checked by a doctor or physio before playing again.';

  function stopFor(body, text) {
    body.innerHTML = '';
    var w = el('div', 'warn', text);
    w.setAttribute('role', 'alert');
    body.appendChild(w);
  }

  /** The health check before court work: pain or a head knock stops it before it starts. */
  function healthGate(body, onClear) {
    body.innerHTML = '';
    body.appendChild(el('p', 'note', 'Before you start: do you have pain that changes how you move, or did you have a knock to the head with symptoms (headache, dizziness, feeling foggy)?'));
    var hr = el('div', 'row');
    var yes = button('Yes');
    var no = button('No, I feel fine', 'is-primary');
    hr.appendChild(yes);
    hr.appendChild(no);
    body.appendChild(hr);
    yes.addEventListener('click', function () { stopFor(body, HEALTH_STOP); });
    no.addEventListener('click', function () { onClear(); });
  }

  /** The numbers of a set of shots as tiles: FG%, eFG%, threes and the three zones. */
  function statTiles(host, st) {
    var pct = function (v) { return v == null ? '-' : v + '%'; };
    var zone = function (z) { return pct(st.zones[z].pct) + ' (' + st.zones[z].attempts + ')'; };
    host.innerHTML = '';
    [['Shots', st.fgm + ' / ' + st.fga], ['FG%', pct(st.fg)], ['eFG%', pct(st.efg)], ['Threes', st.tpm + ' / ' + st.tpa], ['Paint', zone('paint')], ['Mid-range', zone('mid-range')], ['Three', zone('three')]].forEach(function (s) {
      var b = el('div', 'stat');
      b.appendChild(el('b', null, s[1]));
      b.appendChild(el('span', null, s[0]));
      host.appendChild(b);
    });
  }

  // ── Basketball_Play and Check_Play ─────────────────────────────────────────
  function renderDecision(container, data, graded) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var Kit = global.PolymathCheckKit;
    if (graded && Kit) Kit.styles();
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', graded ? 'Check: read the play' : 'Read the play'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Watch the play. What is the right read?'));
    var problem = Court.validate(d.frames);
    if (problem) { card.appendChild(el('p', 'note', 'This play could not be shown.')); container.appendChild(card); return; }
    var host = el('div');
    card.appendChild(host);
    var court = Court.create(host, { frames: d.frames, label: d.prompt });
    var pauseAt = Math.max(0, Math.min(d.frames.length - 1, Number.isInteger(d.pauseAt) ? d.pauseAt : d.frames.length - 1));
    var clock = el('p', 'clock', '');
    card.appendChild(clock);
    var opts = el('div', 'col');
    var watch = button('Watch the play', 'is-primary');
    card.appendChild(watch);
    card.appendChild(opts);
    container.appendChild(card);
    var timer = null;
    var choices = [];
    var answered = false;

    function reveal(result, chosen) {
      answered = true;
      clearInterval(timer);
      clock.textContent = '';
      choices.forEach(function (b) {
        b.disabled = true;
        if (b.dataset.id === result.answerId) b.classList.add('is-right');
        else if (b.dataset.id === chosen) b.classList.add('is-wrong');
      });
      if (graded && Kit) Kit.verdict(card, result);
      else {
        var box = el('div', 'result ' + (result.correct ? 'is-right' : 'is-wrong'), (result.correct ? 'Right read. ' : chosen ? 'Not the best read. ' : 'Time ran out. ') + (result.rationale || ''));
        box.setAttribute('role', 'status');
        card.appendChild(box);
      }
      // Show how the play ends from the decision on.
      if (pauseAt < d.frames.length - 1) setTimeout(function () { court.play(pauseAt, d.frames.length - 1, 800); }, 600);
    }

    function choose(id) {
      if (answered) return;
      if (graded) {
        answered = true;
        choices.forEach(function (b) { b.disabled = true; });
        clearInterval(timer);
        var api = Kit ? Kit.submit(d.id, id || 'none') : Promise.reject(new Error('Checks are not connected on this page.'));
        api.then(function (r) {
          var match = (d.options || []).filter(function (o) { return o.label === r.answer || o.id === r.answer; })[0];
          reveal({ correct: r.correct, answer: r.answer, rationale: r.rationale, answerId: match ? match.id : r.answer }, id);
        }).catch(function (err) { if (Kit) Kit.verdict(card, { correct: false, answer: '', rationale: err.message }); });
        return;
      }
      var right = (d.options || []).filter(function (o) { return o.id === d.answer; })[0];
      reveal({ correct: id === d.answer, rationale: d.explanation || '', answerId: d.answer, answer: right ? right.label : '' }, id);
    }

    watch.addEventListener('click', function () {
      watch.disabled = true;
      court.show(0);
      court.play(0, pauseAt, 900).then(function () {
        opts.innerHTML = '';
        choices = (d.options || []).map(function (o) {
          var b = button(o.label);
          b.dataset.id = o.id;
          b.addEventListener('click', function () { choose(o.id); });
          opts.appendChild(b);
          return b;
        });
        var left = Math.max(2, Math.min(30, Number(d.seconds) || 6));
        clock.textContent = left + 's';
        timer = setInterval(function () {
          left--;
          clock.textContent = left > 0 ? left + 's' : '';
          if (left <= 0) { clearInterval(timer); choose(null); }
        }, 1000);
      });
    });

    if (graded && Kit) {
      var before = Kit.previous(d.id);
      if (before) {
        watch.disabled = true;
        court.show(pauseAt);
        Kit.verdict(card, before);
      }
    }
  }
  function renderPlay(c, d) { renderDecision(c, d, false); }
  function renderCheckPlay(c, d) { renderDecision(c, d, true); }

  // ── Basketball_Film ────────────────────────────────────────────────────────
  function renderFilm(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Film it, rate it'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Film your set, then rate it.'));
    if (Array.isArray(d.protocol) && d.protocol.length) {
      var list = el('ol', 'note');
      d.protocol.forEach(function (s) { list.appendChild(el('li', null, s)); });
      card.appendChild(list);
    }
    card.appendChild(el('p', 'note', 'Camera: ' + (d.cameraTip || 'prop the phone at waist height, side-on, 3 to 4 metres away, with your whole body in the picture.')));
    card.appendChild(el('p', 'note', 'Your clip stays on this device and is not uploaded. If you are under 13, ask a parent before filming, and never film other people without asking them.'));
    var video = el('video', 'video');
    video.setAttribute('playsinline', '');
    video.muted = true;
    var row = el('div', 'row');
    var open = button('Open camera', 'is-primary');
    var rec = button('Record');
    var stop = button('Stop');
    rec.disabled = true;
    stop.disabled = true;
    row.appendChild(open);
    row.appendChild(rec);
    row.appendChild(stop);
    // Phones without in-page recording can still film with the camera app and load the clip here.
    var file = el('input');
    file.type = 'file';
    file.accept = 'video/*';
    file.setAttribute('capture', 'environment');
    file.setAttribute('aria-label', 'Load a clip you filmed');
    var status = el('p', 'note', '');
    card.appendChild(row);
    card.appendChild(video);
    card.appendChild(status);
    var alt = el('p', 'note', 'Or film with your camera app and load the clip: ');
    alt.appendChild(file);
    card.appendChild(alt);
    var rate = el('div');
    card.appendChild(rate);
    container.appendChild(card);
    var stream = null;
    var recorder = null;
    var chunks = [];
    var maxMs = Math.max(5, Math.min(120, Number(d.seconds) || 45)) * 1000;
    var cutoff = null;

    function showClip(blob) {
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      video.srcObject = null;
      video.src = URL.createObjectURL(blob);
      video.controls = true;
      video.muted = false;
      status.textContent = 'Watch it back, then rate each part below. Watch your clip at least twice: once for the whole, once for one detail.';
      var keep = el('a', 'btn', 'Keep the clip on this device');
      keep.href = video.src;
      keep.download = 'my-set.webm';
      keep.style.display = 'inline-flex';
      keep.style.alignItems = 'center';
      keep.style.textDecoration = 'none';
      status.appendChild(document.createElement('br'));
      status.appendChild(keep);
      rubric();
    }

    function rubric() {
      rate.innerHTML = '';
      var criteria = Array.isArray(d.rubric) && d.rubric.length ? d.rubric : ['Balance at the finish', 'Same motion every time', 'Ball flight: arc and line'];
      var answers = {};
      criteria.forEach(function (c) {
        var r = el('div', 'row');
        r.appendChild(el('span', 'note', c + ':'));
        ['Good', 'OK', 'Needs work'].forEach(function (level) {
          var b = button(level);
          b.addEventListener('click', function () {
            [].forEach.call(r.querySelectorAll('button'), function (x) { x.classList.remove('is-on'); });
            b.classList.add('is-on');
            answers[c] = level;
            if (Object.keys(answers).length === criteria.length) summary(answers, criteria);
          });
          r.appendChild(b);
        });
        rate.appendChild(r);
      });
    }

    function summary(answers, criteria) {
      var old = card.querySelector('.' + TAG + '__result');
      if (old) old.remove();
      var focus = criteria.filter(function (c) { return answers[c] === 'Needs work'; })[0] || criteria.filter(function (c) { return answers[c] === 'OK'; })[0];
      var box = el('div', 'result is-right', focus
        ? 'Rated. Your one focus for the next three sessions: ' + focus + '. Practise it close in first, then from your normal spots, then with a defender; film again after.'
        : 'Rated: everything looked good. Next time, film from the other side or add a defender.');
      box.setAttribute('role', 'status');
      card.appendChild(box);
    }

    open.addEventListener('click', function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status.textContent = 'This browser cannot open the camera here. Use the camera app and load the clip below.'; return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
        stream = s;
        video.srcObject = s;
        video.play();
        rec.disabled = typeof global.MediaRecorder === 'undefined';
        status.textContent = rec.disabled ? 'Recording in the page is not supported here: use the camera app and load the clip below.' : 'Line up the shot, then press Record.';
      }).catch(function () { status.textContent = 'The camera could not be opened. Check the permission, or use the camera app and load the clip below.'; });
    });
    rec.addEventListener('click', function () {
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = function () { clearTimeout(cutoff); showClip(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })); };
      recorder.start();
      rec.disabled = true;
      stop.disabled = false;
      status.textContent = 'Recording... (stops by itself after ' + Math.round(maxMs / 1000) + ' seconds)';
      cutoff = setTimeout(function () { if (recorder.state === 'recording') recorder.stop(); stop.disabled = true; }, maxMs);
    });
    stop.addEventListener('click', function () { if (recorder && recorder.state === 'recording') recorder.stop(); stop.disabled = true; });
    file.addEventListener('change', function () { if (file.files && file.files[0]) showClip(file.files[0]); });
  }

  // ── Basketball_ShotLog ─────────────────────────────────────────────────────
  function zoneOf(x, y) { return global.PolymathTracking.zoneOf(x, y); }

  function renderShotLog(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Shot log'));
    card.appendChild(el('p', 'prompt', d.prompt || 'After each shot, tap where you took it, then whether it went in.'));
    var shots = [];
    var pending = null;
    var host = el('div');
    card.appendChild(host);
    var row = el('div', 'row');
    var made = button('Made it');
    var missed = button('Missed');
    var undo = button('Undo last');
    made.disabled = true;
    missed.disabled = true;
    undo.disabled = true;
    row.appendChild(made);
    row.appendChild(missed);
    row.appendChild(undo);
    var hint = el('p', 'note', 'Tap the court where the shot was taken.');
    card.appendChild(hint);
    card.appendChild(row);
    var stats = el('div', 'stats');
    card.appendChild(stats);
    container.appendChild(card);
    var court = Court.create(host, { frames: [], label: 'Shot chart', onTapSpot: function (x, y) {
      pending = { x: x, y: y };
      made.disabled = false;
      missed.disabled = false;
      hint.textContent = 'Shot from here (' + zoneOf(x, y) + '): did it go in?';
    } });

    function draw() {
      court.clearMarks();
      shots.forEach(function (s) { court.mark(s.x, s.y, s.made ? 'make' : 'miss'); });
      var fga = shots.length;
      statTiles(stats, global.PolymathTracking.shotStats(shots));
      undo.disabled = !shots.length;
      if (d.shots && fga >= d.shots) hint.textContent = 'Set done: ' + fga + ' shots logged. eFG% counts a made three as one and a half makes.';
    }
    function log(isMade) {
      if (!pending) return;
      shots.push({ x: pending.x, y: pending.y, made: isMade, zone: zoneOf(pending.x, pending.y) });
      pending = null;
      made.disabled = true;
      missed.disabled = true;
      hint.textContent = 'Tap the court for the next shot.';
      draw();
    }
    made.addEventListener('click', function () { log(true); });
    missed.addEventListener('click', function () { log(false); });
    undo.addEventListener('click', function () { shots.pop(); draw(); });
    draw();
  }

  // ── Basketball_Session ─────────────────────────────────────────────────────
  function renderSession(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Court session'));
    card.appendChild(el('p', 'prompt', d.title || 'Today\'s court session'));
    var body = el('div');
    card.appendChild(body);
    container.appendChild(card);
    var warmup = Array.isArray(d.warmup) && d.warmup.length ? d.warmup : [
      { name: 'Jog, side shuffle and backpedal', seconds: 120 },
      { name: 'Squats and lunges with knees over toes', seconds: 120 },
      { name: 'Jump and land softly on two feet, then one', seconds: 120 },
      { name: 'Balance on one leg, then the other', seconds: 90 },
    ];
    var drills = Array.isArray(d.drills) ? d.drills : [];

    // 1. Health check: pain or a head knock stops the session before it starts.
    healthGate(body, function () { step(0, 'warmup'); });

    function timerRow(label, seconds, done) {
      body.innerHTML = '';
      body.appendChild(el('p', 'kicker', label));
      var t = el('p', 'clock', '');
      body.appendChild(t);
      var r = el('div', 'row');
      var go = button('Start', 'is-primary');
      var next = button('Done');
      r.appendChild(go);
      r.appendChild(next);
      body.appendChild(r);
      var left = seconds;
      var iv = null;
      var show = function () { t.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'); };
      show();
      go.addEventListener('click', function () {
        go.disabled = true;
        iv = setInterval(function () { left = Math.max(0, left - 1); show(); if (!left) { clearInterval(iv); next.classList.add('is-primary'); } }, 1000);
      });
      next.addEventListener('click', function () { clearInterval(iv); done(); });
      return body;
    }

    function step(i, phase) {
      if (phase === 'warmup') {
        if (i >= warmup.length) return step(0, 'drill');
        var b = timerRow('Warm-up ' + (i + 1) + ' of ' + warmup.length + ': ' + warmup[i].name, Number(warmup[i].seconds) || 90, function () { step(i + 1, 'warmup'); });
        b.appendChild(el('p', 'note', 'The warm-up always comes first: it is what cuts injuries.'));
        return;
      }
      if (i >= drills.length) return finish();
      var dr = drills[i];
      var b2 = timerRow('Drill ' + (i + 1) + ' of ' + drills.length + ': ' + dr.name, Math.round((Number(dr.minutes) || 5) * 60), function () { step(i + 1, 'drill'); });
      if (dr.cue) b2.appendChild(el('p', 'note', 'Cue: ' + dr.cue));
      var hurt = button('Stop: something hurts');
      hurt.addEventListener('click', function () { stopFor(body, HURT_STOP); });
      b2.appendChild(hurt);
    }

    function finish() {
      body.innerHTML = '';
      body.appendChild(el('p', 'note', 'How hard was that session, from 0 (rest) to 10 (the hardest you can go)?'));
      var r = el('div', 'row');
      var effort = null;
      for (var k = 0; k <= 10; k++) {
        (function (v) {
          var b = button(String(v));
          b.addEventListener('click', function () { effort = v; [].forEach.call(r.querySelectorAll('button'), function (x) { x.classList.remove('is-on'); }); b.classList.add('is-on'); ask(); });
          r.appendChild(b);
        })(k);
      }
      body.appendChild(r);
      function ask() {
        if (body.querySelector('[data-step="fun"]')) return;
        var q = el('p', 'note', 'How much did you enjoy it?');
        q.setAttribute('data-step', 'fun');
        body.appendChild(q);
        var f = el('div', 'row');
        ['Not much', 'It was OK', 'Loved it'].forEach(function (lab) {
          var b = button(lab);
          b.addEventListener('click', function () {
            var box = el('div', 'result is-right', 'Session logged: effort ' + effort + ' of 10, "' + lab + '". Rest days count as training too: keep at least one or two each week.');
            box.setAttribute('role', 'status');
            body.innerHTML = '';
            body.appendChild(box);
          });
          f.appendChild(b);
        });
        body.appendChild(f);
      }
    }
  }

  // The camera blocks (camera-blocks.js) build on these.
  global.PolymathBball = { TAG: TAG, el: el, button: button, styles: styles, healthGate: healthGate, stopFor: stopFor, statTiles: statTiles, HURT_STOP: HURT_STOP, registry: blocks };

  var reg = blocks();
  reg.register('Basketball_Play', { tag: 'Basketball_Play', render: renderPlay, renderBlock: renderPlay, schema: null });
  reg.register('Check_Play', { tag: 'Check_Play', render: renderCheckPlay, renderBlock: renderCheckPlay, schema: null });
  reg.register('Basketball_Film', { tag: 'Basketball_Film', render: renderFilm, renderBlock: renderFilm, schema: null });
  reg.register('Basketball_ShotLog', { tag: 'Basketball_ShotLog', render: renderShotLog, renderBlock: renderShotLog, schema: null });
  reg.register('Basketball_Session', { tag: 'Basketball_Session', render: renderSession, renderBlock: renderSession, schema: null });
})(typeof window !== 'undefined' ? window : globalThis);
