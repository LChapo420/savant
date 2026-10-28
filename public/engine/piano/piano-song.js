/* Piano_Song: a song player.
 *
 *   Piano_Song { prompt?, song?: "<library id>", hands?: "right"|"left"|"both", mode?: "learn"|"play",
 *                pedal?: "legato", title?, beatsPerBar?, tempo?, rh?, lh? }
 *
 * A library song is named by id and fetched from /api/piano/songs/<id>; a short song
 * may instead be written into the block (rh, lh as lists of {note, beats}).
 *
 *   - Falling notes drop onto the on-screen keyboard; a scrolling grand staff is the
 *     other view.
 *   - Learn mode waits at each note (or notes played together) until it is played right.
 *   - Play mode runs at tempo after a one-bar count-in, with the app playing the other
 *     hand (or, for both hands, the song's chords), at full, three-quarter or half speed.
 *   - Right hand, left hand or both.
 *   - At the end: 0-3 stars from notes and timing (piano-core songStars), saved on the
 *     server for a library song, which scores the take again itself.
 *   - Input from a MIDI keyboard, the microphone, the on-screen keys or the computer
 *     keys. Before the first microphone take in play mode the app measures how late the
 *     microphone hears the piano, once per device; MIDI needs no such check.
 *   - The microphone is told which notes are due (the waiting step in learn mode, the
 *     notes near the play head in play mode), so it hears chords as well as single
 *     notes, and times each from the audio clock.
 *   - With `pedal: "legato"` and a MIDI keyboard, play mode also grades the sustain
 *     pedal against the song's chord changes (lifted as each new chord sounds,
 *     pressed again just after).
 *
 * Needs piano-core.js and piano-io.js. Self-contained otherwise, so a lesson with only
 * this block works.
 */
(function (global) {
  var P = global.PolymathPiano;
  var IO = global.PolymathPianoIO;
  var TAG = 'polymath_psong';
  var WHITE = 38;
  var BLACK = 24;
  var FALL_H = 220;
  var PX_BEAT = 64;
  var LAT_KEY = 'polymath_piano_mic_latency';
  var COLORS = { right: '#38bdf8', left: '#a78bfa', other: '#475569', hit: '#34d399', miss: '#f87171', line: '#1f293d', bar: '#334155' };

  function registry() {
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
      '.' + t + '__kicker{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#38bdf8;margin:0 0 6px;}',
      '.' + t + '__title{margin:0;font-size:20px;line-height:1.3;}',
      '.' + t + '__by{margin:2px 0 10px;font-size:13px;color:#94a3b8;}',
      '.' + t + '__prompt{margin:0 0 12px;font-size:16px;line-height:1.55;font-weight:600;white-space:pre-wrap;}',
      '.' + t + '__row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0;}',
      '.' + t + '__seg{display:inline-flex;border:1px solid #334155;border-radius:10px;overflow:hidden;}',
      '.' + t + '__seg button{min-height:40px;padding:0 12px;border:0;border-right:1px solid #334155;background:#090d16;color:#cbd5e1;font:inherit;font-size:14px;cursor:pointer;}',
      '.' + t + '__seg button:last-child{border-right:0;}',
      '.' + t + '__seg button[aria-pressed="true"]{background:#38bdf8;color:#090d16;font-weight:700;}',
      '.' + t + '__seg button:disabled{opacity:.4;cursor:default;}',
      '.' + t + '__btn{min-height:44px;padding:0 16px;border:1px solid #334155;border-radius:10px;background:#090d16;color:#f8fafc;font:inherit;font-weight:600;cursor:pointer;}',
      '.' + t + '__btn.is-primary{background:#38bdf8;color:#090d16;border-color:#38bdf8;}',
      '.' + t + '__btn.is-on{border-color:#38bdf8;box-shadow:0 0 0 1px #38bdf8;}',
      '.' + t + '__btn:disabled{opacity:.5;cursor:default;}',
      '.' + t + '__btn:focus-visible,.' + t + '__seg button:focus-visible{outline:2px solid #38bdf8;outline-offset:2px;}',
      '.' + t + '__label{font-size:12px;color:#94a3b8;margin-right:2px;}',
      '.' + t + '__status{font-size:13px;color:#94a3b8;min-height:1.3em;}',
      '.' + t + '__stage{overflow-x:auto;margin:10px 0 4px;border-radius:8px;background:#090d16;}',
      '.' + t + '__inner{position:relative;}',
      '.' + t + '__canvas{display:block;}',
      '.' + t + '__panel{margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #334155;background:#090d16;font-size:14px;line-height:1.6;}',
      '.' + t + '__result{margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #1f293d;background:#090d16;font-size:14px;line-height:1.6;}',
      '.' + t + '__result.is-right{border-color:#34d399;}',
      '.' + t + '__stars{font-size:28px;letter-spacing:4px;color:#fbbf24;margin:0 0 4px;}',
      '.' + t + '__stars span.is-empty{color:#334155;}',
      '.' + t + '__small{font-size:12px;color:#94a3b8;margin:6px 0 0;}',
      '.' + t + '__small a{color:#7dd3fc;}',
    ].join('');
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls.split(' ').map(function (c) { return /^is-/.test(c) ? c : TAG + '__' + c; }).join(' ');
    if (text != null) e.textContent = String(text);
    return e;
  }

  function readLatency() {
    try { var v = JSON.parse(global.localStorage.getItem(LAT_KEY) || 'null'); return v && typeof v.ms === 'number' ? v : null; } catch (e) { return null; }
  }
  function saveLatency(v) {
    try { global.localStorage.setItem(LAT_KEY, JSON.stringify(v)); } catch (e) { /* private mode: measured again next time */ }
  }

  /** Key positions laid out exactly as the on-screen keyboard draws them. */
  function geometry(from, to) {
    var keys = {};
    var wi = 0;
    for (var m = from; m <= to; m++) {
      if (P.isBlack(m)) keys[m] = { x: wi * WHITE - BLACK / 2, w: BLACK, black: true };
      else { keys[m] = { x: wi * WHITE, w: WHITE, black: false }; wi++; }
    }
    return { keys: keys, width: wi * WHITE };
  }

  function getSong(d) {
    if (d.song) {
      return fetch('/api/piano/songs/' + encodeURIComponent(d.song), { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('This song could not be loaded.'); return r.json(); })
        .then(function (j) { return j.song; });
    }
    if (!d.rh) return Promise.reject(new Error('This song has no notes.'));
    return Promise.resolve({ id: null, title: d.title || 'A short song', by: '', beatsPerBar: d.beatsPerBar || 4, pickup: 0, tempo: d.tempo || 80, rh: d.rh, lh: d.lh || '', chords: d.chords || '' });
  }

  function render(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Play a song'));
    var title = el('h3', 'title', 'Loading the song...');
    card.appendChild(title);
    var byline = el('p', 'by', '');
    card.appendChild(byline);
    if (d.prompt) card.appendChild(el('p', 'prompt', d.prompt));
    container.appendChild(card);
    getSong(d).then(function (song) { build(card, d, song, title, byline); })
      .catch(function (err) { title.textContent = err.message || 'This song could not be loaded.'; });
  }

  function segmented(label, options, value, onPick) {
    var wrap = el('span');
    wrap.appendChild(el('span', 'label', label));
    var seg = el('span', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    var buttons = {};
    options.forEach(function (o) {
      var b = el('button', null, o[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(o[0] === value));
      b.addEventListener('click', function () {
        if (b.disabled) return;
        Object.keys(buttons).forEach(function (k) { buttons[k].setAttribute('aria-pressed', String(k === String(o[0]))); });
        onPick(o[0]);
      });
      buttons[o[0]] = b;
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
    return { el: wrap, buttons: buttons, set: function (v) { Object.keys(buttons).forEach(function (k) { buttons[k].setAttribute('aria-pressed', String(k === String(v))); }); } };
  }

  function build(card, d, song, title, byline) {
    title.textContent = song.title;
    var pd = song.publicDomain;
    byline.textContent = (song.by || '') + (song.key ? ' · ' + song.key : '') + (pd && pd.basis ? ' · public domain' : '');
    if (pd && pd.detail) byline.title = pd.detail;

    var hasLeft = !!(song.lh && P.parsePart(song.lh).events.length);
    var state = {
      hands: d.hands === 'left' && hasLeft ? 'left' : d.hands === 'both' && hasLeft ? 'both' : 'right',
      mode: d.mode === 'play' ? 'play' : 'learn',
      speed: 1,
      view: 'fall',
      running: false,
      source: 'screen',
    };
    var bpb = Number(song.beatsPerBar) || 4;
    var pickup = Number(song.pickup) || 0;

    // ── controls ──
    var row1 = el('div', 'row');
    var handsSeg = segmented('Hands', [['right', 'Right'], ['left', 'Left'], ['both', 'Both']], state.hands, function (v) { state.hands = v; layout(); });
    if (!hasLeft) { handsSeg.buttons.left.disabled = true; handsSeg.buttons.both.disabled = true; }
    var modeSeg = segmented('Mode', [['learn', 'Learn'], ['play', 'Play']], state.mode, function (v) { state.mode = v; layout(); });
    row1.appendChild(handsSeg.el);
    row1.appendChild(modeSeg.el);
    card.appendChild(row1);
    var row2 = el('div', 'row');
    var speedSeg = segmented('Speed', [['0.5', 'Slow'], ['0.75', 'Medium'], ['1', 'Full']], '1', function (v) { state.speed = Number(v); setStatus(); });
    var viewSeg = segmented('View', [['fall', 'Falling notes'], ['staff', 'Staff']], 'fall', function (v) { state.view = v; showView(); draw(lastPos); });
    row2.appendChild(speedSeg.el);
    row2.appendChild(viewSeg.el);
    card.appendChild(row2);
    var row3 = el('div', 'row');
    var go = el('button', 'btn is-primary', 'Start');
    go.type = 'button';
    var stop = el('button', 'btn', 'Stop');
    stop.type = 'button';
    stop.disabled = true;
    var status = el('span', 'status', '');
    status.setAttribute('aria-live', 'polite');
    row3.appendChild(go);
    row3.appendChild(stop);
    row3.appendChild(status);
    card.appendChild(row3);

    // ── stage: falling notes or staff, over the keyboard ──
    var stage = el('div', 'stage');
    var inner = el('div', 'inner');
    stage.appendChild(inner);
    var fall = el('canvas', 'canvas');
    fall.setAttribute('role', 'img');
    var staff = el('canvas', 'canvas');
    staff.setAttribute('role', 'img');
    inner.appendChild(fall);
    inner.appendChild(staff);
    var kbHost = el('div');
    inner.appendChild(kbHost);
    card.appendChild(stage);

    // ── inputs ──
    var inRow = el('div', 'row');
    var midiBtn = el('button', 'btn', 'Use MIDI keyboard');
    midiBtn.type = 'button';
    var micBtn = el('button', 'btn', 'Use microphone');
    micBtn.type = 'button';
    inRow.appendChild(midiBtn);
    inRow.appendChild(micBtn);
    card.appendChild(inRow);
    var inStatus = el('p', 'small', '');
    card.appendChild(inStatus);
    var panel = null;
    var result = null;
    var foot = el('p', 'small', '');
    if (song.id) {
      foot.appendChild(document.createTextNode('Stars for this song are kept on your '));
      var a = el('a', null, 'song path');
      a.href = '/engine/piano/songs.html';
      foot.appendChild(a);
      foot.appendChild(document.createTextNode('.'));
    }
    if (pd && pd.detail) foot.appendChild(document.createTextNode(' ' + pd.detail));
    card.appendChild(foot);

    // ── the music, for the chosen hands ──
    var parts;
    var mine;
    var kb = null;
    var geo = null;
    var endBeat = 0;
    var lastPos = -2;

    function layout() {
      if (state.running) stopRun(true);
      parts = P.songParts(song, state.hands);
      var rh = P.parsePart(song.rh).events;
      var lh = hasLeft ? P.parsePart(song.lh).events : [];
      mine = [];
      if (state.hands !== 'left') rh.forEach(function (e) { e.midis.forEach(function (m) { mine.push({ midi: m, beat: e.beat, beats: e.beats, hand: 'right', name: e.names[e.midis.indexOf(m)] }); }); });
      if (state.hands !== 'right') lh.forEach(function (e) { e.midis.forEach(function (m) { mine.push({ midi: m, beat: e.beat, beats: e.beats, hand: 'left', name: e.names[e.midis.indexOf(m)] }); }); });
      var others = [];
      if (state.hands === 'right') lh.forEach(function (e) { e.midis.forEach(function (m, i) { others.push({ midi: m, beat: e.beat, beats: e.beats, hand: 'other', name: e.names[i] }); }); });
      if (state.hands === 'left') rh.forEach(function (e) { e.midis.forEach(function (m, i) { others.push({ midi: m, beat: e.beat, beats: e.beats, hand: 'other', name: e.names[i] }); }); });
      mine.others = others;
      endBeat = parts.length;
      var ms = mine.map(function (n) { return n.midi; });
      var lo = Math.min.apply(null, ms);
      var hi = Math.max.apply(null, ms);
      var from = Math.max(21, lo - P.pitchClass(lo));
      var to = Math.min(108, Math.max(hi + 2, from + 12));
      while (P.isBlack(to)) to++;
      if (kb) kb.destroy();
      kbHost.innerHTML = '';
      kb = IO.keyboard(kbHost, { from: from, to: to, onPress: onNote, activateOn: card, computerFrom: computerBase(), labels: true });
      geo = geometry(from, to);
      size(fall, geo.width, FALL_H);
      size(staff, Math.max(geo.width, 520), 170);
      fall.setAttribute('aria-label', 'Falling notes for ' + song.title);
      staff.setAttribute('aria-label', 'Staff for ' + song.title);
      showView();
      if (panel) { panel.remove(); panel = null; }
      lastPos = -2;
      draw(lastPos);
      setStatus();
    }

    /**
     * The C the computer keys start from: the one that puts the most of the notes to
     * play in reach. A to P reach 16 keys up from it; Z to M the white keys of the
     * octave below, which is where a left hand goes when both hands play.
     */
    function computerBase() {
      var reach = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, '-12': 1, '-10': 1, '-8': 1, '-7': 1, '-5': 1, '-3': 1, '-1': 1 };
      var ms = mine.map(function (n) { return n.midi; });
      var lo = Math.min.apply(null, ms);
      var hi = Math.max.apply(null, ms);
      var best = lo - P.pitchClass(lo);
      var bestCount = -1;
      for (var c = lo - P.pitchClass(lo) - 12; c <= hi; c += 12) {
        var count = ms.filter(function (m) { return reach[m - c]; }).length;
        if (count > bestCount) { best = c; bestCount = count; }
      }
      return best;
    }

    function size(canvas, w, h) {
      var ratio = global.devicePixelRatio || 1;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function showView() {
      fall.style.display = state.view === 'fall' ? 'block' : 'none';
      staff.style.display = state.view === 'staff' ? 'block' : 'none';
    }
    function computerHelp() {
      if (!kb) return '';
      var c = P.midiToName(kb.computerC);
      return 'Computer keys: A S D F G H J K are the white keys from ' + c + ', W E T Y U O P the black keys' + (state.hands !== 'right' ? ', Z X C V B N M the white keys an octave lower' : '') + '.';
    }
    function setStatus(text) {
      if (text) { status.textContent = text; return; }
      var tempo = Math.round((Number(song.tempo) || 80) * state.speed);
      status.textContent = (state.mode === 'learn' ? 'Learn: the app waits for each note.' : 'Play: ' + tempo + ' beats a minute, after a count-in.') + ' ' + computerHelp();
    }

    // ── drawing ──
    var hit = {};
    var missed = {};
    function noteKey(n) { return n.hand + ':' + n.beat + ':' + n.midi; }

    function draw(pos) {
      lastPos = pos;
      if (state.view === 'fall') drawFall(pos); else drawStaff(pos);
    }

    function drawFall(pos) {
      var c = fall.getContext('2d');
      var w = geo.width;
      c.clearRect(0, 0, w, FALL_H);
      c.fillStyle = '#090d16';
      c.fillRect(0, 0, w, FALL_H);
      // Beat and bar lines.
      for (var b = Math.ceil(pos); b <= pos + FALL_H / PX_BEAT + 1; b++) {
        var yb = FALL_H - (b - pos) * PX_BEAT;
        var isBar = ((b - pickup) % bpb + bpb) % bpb === 0;
        c.fillStyle = isBar ? COLORS.bar : COLORS.line;
        c.fillRect(0, yb, w, isBar ? 2 : 1);
      }
      function rect(n, color, alpha) {
        var k = geo.keys[n.midi];
        if (!k) return;
        var yBottom = FALL_H - (n.beat - pos) * PX_BEAT;
        var yTop = FALL_H - (n.beat + n.beats - pos) * PX_BEAT;
        if (yBottom < 0 || yTop > FALL_H) return;
        c.globalAlpha = alpha;
        c.fillStyle = color;
        var x = k.x + (k.black ? 1 : 4);
        var wd = k.w - (k.black ? 2 : 8);
        var h = Math.max(6, yBottom - yTop - 2);
        roundRect(c, x, yTop + 1, wd, h, 5);
        c.globalAlpha = 1;
      }
      (mine.others || []).forEach(function (n) { rect(n, COLORS.other, 0.45); });
      mine.forEach(function (n) {
        var key = noteKey(n);
        rect(n, hit[key] ? COLORS.hit : missed[key] ? COLORS.miss : COLORS[n.hand], 1);
      });
      c.fillStyle = '#f8fafc';
      c.fillRect(0, FALL_H - 2, w, 2);
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.fill();
    }

    var LETTERS = 'CDEFGAB';
    function staffStep(name, clef) {
      var m = /^([A-Ga-g])(##|#|bb|b|x)?(-?\d)$/.exec(name || '');
      if (!m) return null;
      var idx = LETTERS.indexOf(m[1].toUpperCase()) + Number(m[3]) * 7;
      var bottom = clef === 'bass' ? LETTERS.indexOf('G') + 2 * 7 : LETTERS.indexOf('E') + 4 * 7;
      return { step: idx - bottom, acc: m[2] ? m[2].replace(/#/g, '♯').replace(/b/g, '♭') : '' };
    }

    function drawStaff(pos) {
      var c = staff.getContext('2d');
      var w = Math.max(geo.width, 520);
      var H = 170;
      var GAP = 8;
      var TOP = { treble: 26, bass: 104 };
      var PX = 46;
      var HEAD = 70;
      c.clearRect(0, 0, w, H);
      c.fillStyle = '#090d16';
      c.fillRect(0, 0, w, H);
      ['treble', 'bass'].forEach(function (clef) {
        c.fillStyle = '#64748b';
        for (var i = 0; i < 5; i++) c.fillRect(8, TOP[clef] + i * GAP, w - 16, 1);
        c.fillStyle = '#94a3b8';
        c.font = '600 10px -apple-system,Segoe UI,sans-serif';
        c.fillText(clef === 'treble' ? 'Treble' : 'Bass', 10, TOP[clef] - 6);
      });
      // Bar lines through both staves.
      for (var b = Math.ceil(pos - HEAD / PX); b <= pos + w / PX; b++) {
        if (((b - pickup) % bpb + bpb) % bpb !== 0) continue;
        var xb = HEAD + (b - pos) * PX - 10;
        if (xb < 40 || xb > w - 8) continue;
        c.fillStyle = '#334155';
        c.fillRect(xb, TOP.treble, 1, TOP.bass + 4 * GAP - TOP.treble);
      }
      c.fillStyle = 'rgba(56,189,248,.18)';
      c.fillRect(HEAD - 14, 6, 28, H - 12);
      function head(n, color) {
        var clef = n.hand === 'left' || (n.hand === 'other' && state.hands === 'right') ? 'bass' : 'treble';
        var s = staffStep(n.name || P.midiToName(n.midi), clef);
        if (!s) return;
        var x = HEAD + (n.beat - pos) * PX;
        if (x < 40 || x > w - 8) return;
        var lineY = function (step) { return TOP[clef] + 4 * GAP - step * (GAP / 2); };
        var y = lineY(s.step);
        c.fillStyle = '#64748b';
        for (var st = -2; st >= s.step; st -= 2) c.fillRect(x - 9, lineY(st), 18, 1);
        for (var st2 = 10; st2 <= s.step; st2 += 2) c.fillRect(x - 9, lineY(st2), 18, 1);
        c.strokeStyle = color;
        c.fillStyle = color;
        c.lineWidth = 1.6;
        c.beginPath();
        c.ellipse(x, y, 5.5, 4, -0.35, 0, Math.PI * 2);
        if (n.beats >= 2) c.stroke(); else c.fill();
        if (n.beats < 4) {
          var up = s.step < 4;
          c.fillRect(up ? x + 4.5 : x - 5.5, up ? y - 26 : y, 1.3, 26);
        }
        if (s.acc) { c.font = '14px serif'; c.fillText(s.acc, x - 18, y + 5); }
      }
      (mine.others || []).forEach(function (n) { head(n, COLORS.other); });
      mine.forEach(function (n) {
        var key = noteKey(n);
        head(n, hit[key] ? COLORS.hit : missed[key] ? COLORS.miss : COLORS[n.hand]);
      });
    }

    // ── running a take ──
    var raf = 0;
    var lastFrame = 0;
    var learnPos = 0;
    var learnAt = 0;
    var waiting = [];
    var presses = [];
    var played = [];
    var origin = 0;
    var beatMs = 750;
    var bus = null;
    var timers = [];
    var latency = 0;
    var pedalEvents = [];
    var pedalWanted = d.pedal === 'legato' && !!song.chords;

    function sameKey(a, b) { return state.source === 'mic' ? P.pitchClass(a) === P.pitchClass(b) : a === b; }
    function flash(m, kind) {
      if (!kb) return;
      kb.highlight(m, kind);
      setTimeout(function () { kb.clear(m); light(); }, 180);
    }
    function light() {
      if (!kb || !state.running || state.mode !== 'learn') return;
      waiting.forEach(function (m) { kb.highlight(m, 'hint'); });
    }

    /** The notes the microphone should listen for at a time (performance.now() ms). */
    function dueNotes(time) {
      if (!state.running) return [];
      if (state.mode === 'learn') return waiting.slice();
      var beat = (time - origin - latency) / beatMs;
      var tol = Math.max(0.3, 160 / beatMs);
      var near = mine.filter(function (x) { return !hit[noteKey(x)] && Math.abs(x.beat - beat) <= tol; });
      if (!near.length) return [];
      // The notes that start together nearest that time: one step of the song.
      var first = near.reduce(function (a, x) { return Math.abs(x.beat - beat) < Math.abs(a.beat - beat) ? x : a; });
      return near.filter(function (x) { return Math.abs(x.beat - first.beat) < 1e-6; }).map(function (x) { return x.midi; });
    }

    function onNote(n) {
      if (n.source) state.source = n.source === 'computer' ? 'screen' : n.source;
      if (!state.running) return;
      if (state.mode === 'learn') {
        presses.push({ midi: n.midi, source: n.source });
        var k = waiting.findIndex(function (m) { return sameKey(m, n.midi); });
        if (k === -1) { flash(n.midi, 'wrong'); return; }
        var want = waiting[k];
        var step = parts.steps[learnAt];
        mine.forEach(function (x) { if (Math.abs(x.beat - step.beat) < 1e-6 && x.midi === want) hit[noteKey(x)] = true; });
        waiting.splice(k, 1);
        kb.clear(want);
        flash(n.midi, 'right');
        if (!waiting.length) {
          learnAt++;
          if (learnAt >= parts.steps.length) { finishLearn(); return; }
          waiting = parts.steps[learnAt].midis.slice();
          light();
        }
        return;
      }
      // Play mode: time from beat 0, less the microphone's measured delay.
      var t = n.time - origin - (n.source === 'mic' ? latency : 0);
      // Anything before half a beat ahead of the first note is the count-in, not the song.
      if (t < -beatMs / 2) return;
      played.push({ midi: n.midi, time: Math.round(t), source: n.source, confidence: n.confidence });
      var beat = t / beatMs;
      var tol = Math.max(0.3, 160 / beatMs);
      var match = null;
      mine.forEach(function (x) {
        if (match || hit[noteKey(x)] || !sameKey(x.midi, n.midi)) return;
        if (Math.abs(x.beat - beat) <= tol) match = x;
      });
      if (match) { hit[noteKey(match)] = true; flash(n.midi, 'right'); } else flash(n.midi, 'wrong');
    }

    function frame(now) {
      if (!state.running) return;
      var pos;
      if (state.mode === 'play') {
        pos = (now - origin) / beatMs;
        mine.forEach(function (x) { if (!hit[noteKey(x)] && x.beat < pos - 0.6) missed[noteKey(x)] = true; });
        if (pos > endBeat + 1) { draw(pos); finishPlay(); return; }
        if (pos >= 0) setStatus('Bar ' + Math.min(Math.floor((pos - pickup) / bpb) + (pickup ? 2 : 1), Math.ceil((endBeat - pickup) / bpb) + (pickup ? 1 : 0)) + '. Keep going.');
      } else {
        learnPos += (now - lastFrame) / beatMs;
        var stopAt = learnAt < parts.steps.length ? parts.steps[learnAt].beat : endBeat;
        if (learnPos > stopAt) learnPos = stopAt;
        pos = learnPos;
      }
      lastFrame = now;
      draw(pos);
      raf = global.requestAnimationFrame(frame);
    }

    function beginTake() {
      hit = {};
      missed = {};
      presses = [];
      played = [];
      pedalEvents = [];
      if (result) { result.remove(); result = null; }
      state.running = true;
      go.disabled = true;
      stop.disabled = false;
      kb.activate();
      var tempo = (Number(song.tempo) || 80) * state.speed;
      beatMs = 60000 / tempo;
      if (state.mode === 'learn') {
        learnAt = 0;
        learnPos = -2;
        waiting = parts.steps.length ? parts.steps[0].midis.slice() : [];
        kb.clear();
        light();
        setStatus('Play the lit key' + (waiting.length > 1 ? 's' : '') + '. The app waits for you.');
        lastFrame = performance.now();
        raf = global.requestAnimationFrame(frame);
        return;
      }
      latency = state.source === 'mic' ? ((readLatency() || {}).ms || 0) : 0;
      // A bar of count-in clicks, then the song; the app plays the other part.
      var a = IO.synth.context();
      var beatSec = beatMs / 1000;
      var t0 = (a ? a.currentTime : 0) + 0.2;
      bus = IO.synth.bus(1);
      for (var c = 0; c < bpb; c++) IO.synth.click(c === 0, t0 + c * beatSec);
      var start = t0 + bpb * beatSec;
      // The microphone would hear the app's own backing as notes played, so with the
      // microphone the app plays only the count-in.
      var backing = state.source !== 'mic';
      if (backing) (mine.others || []).forEach(function (n) { IO.synth.play(n.midi, n.beats * beatMs * 0.95, start + n.beat * beatSec, 55, bus.node); });
      if (backing && state.hands === 'both' && song.chords) {
        P.parseChords(song.chords, bpb, pickup).chords.forEach(function (ch) {
          ch.midis.forEach(function (m) { IO.synth.play(m, ch.beats * beatMs * 0.9, start + ch.beat * beatSec, 24, bus.node); });
        });
      }
      origin = IO.synth.perfTime(start);
      // The take ends on a timer too, not only from the drawing loop, which a browser
      // pauses in a background tab.
      timers.push(setTimeout(function () {
        if (!state.running || state.mode !== 'play') return;
        mine.forEach(function (x) { if (!hit[noteKey(x)]) missed[noteKey(x)] = true; });
        draw(endBeat + 1);
        finishPlay();
      }, Math.max(0, origin - performance.now()) + (endBeat + 1) * beatMs + 80));
      setStatus('Get ready: ' + bpb + ' clicks, then play.' + (backing ? '' : ' With the microphone the app stays quiet after the clicks, so it hears only you.'));
      kb.clear();
      lastFrame = performance.now();
      raf = global.requestAnimationFrame(frame);
    }

    function stopRun(quiet) {
      state.running = false;
      global.cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      timers = [];
      if (bus) { bus.stop(); bus = null; }
      go.disabled = false;
      stop.disabled = true;
      if (kb) kb.clear();
      if (!quiet) setStatus();
    }

    function stars(n) {
      var box = el('p', 'stars');
      box.setAttribute('aria-label', n + ' of 3 stars');
      for (var i = 0; i < 3; i++) { var s = el('span', i < n ? null : 'is-empty', '★'); box.appendChild(s); }
      return box;
    }

    function showResult(r, lines, payload) {
      if (result) result.remove();
      result = el('div', 'result' + (r.stars >= 2 ? ' is-right' : ''));
      result.setAttribute('role', 'status');
      result.appendChild(stars(r.stars));
      result.appendChild(el('p', null, lines.join(' ')));
      var saved = el('p', 'small', song.id ? 'Saving your stars...' : '');
      result.appendChild(saved);
      card.insertBefore(result, foot);
      go.textContent = 'Play again';
      if (!song.id) return;
      fetch('/api/piano/songs/' + encodeURIComponent(song.id) + '/result', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then(function (res) {
        if (res.status === 401) { saved.textContent = 'Sign in to keep your stars on your song path.'; return null; }
        return res.json().then(function (j) {
          if (!res.ok) { saved.textContent = j.error || 'Your stars could not be saved.'; return; }
          saved.textContent = 'Saved. Your best on this song: ' + j.best + ' of 3 stars' + (j.stars !== r.stars ? ' (the server counted ' + j.stars + ' for this take)' : '') + '.';
          // The song path listens for this to refresh its stars.
          card.dispatchEvent(new CustomEvent('pianosongresult', { bubbles: true, detail: { song: song.id, stars: j.stars, best: j.best } }));
        });
      }).catch(function () { saved.textContent = 'Your stars could not be saved. Check your connection.'; });
    }

    function finishLearn() {
      stopRun(true);
      draw(endBeat);
      var octaveFree = state.source === 'mic';
      var r = P.learnScore(parts.steps, presses, { octaveFree: octaveFree });
      var s = P.songStars('learn', r, { speed: state.speed });
      var lines = ['You played all ' + r.total + ' notes, with ' + r.wrong + ' slip' + (r.wrong === 1 ? '' : 's') + ' on the way.'];
      lines.push('Learn mode waits for you, so timing is not scored and it earns up to 2 stars: the third is for Play mode at medium or full speed.');
      if (octaveFree) lines.push('Heard through the microphone, so this is an estimate (a note in another octave counts).');
      setStatus('Done.');
      showResult(s, lines, { mode: 'learn', hands: state.hands, speed: state.speed, presses: presses.map(function (p) { return { midi: p.midi, source: p.source }; }) });
    }

    function finishPlay() {
      stopRun(true);
      var octaveFree = state.source === 'mic';
      var tempo = (Number(song.tempo) || 80) * state.speed;
      var score = P.scoreSong(parts.target, played, { tempo: tempo, octaveFree: octaveFree });
      var s = P.songStars('play', score, { speed: state.speed });
      var lines = ['Notes: ' + score.correct + ' of ' + score.total + ' right' + (score.missed.length ? ', ' + score.missed.length + ' missed' : '') + (score.extra.length ? ', ' + score.extra.length + ' extra' : '') + '.'];
      lines.push(score.timing ? 'In time: ' + Math.round(score.timing.onBeatShare * 100) + '% of the notes you hit' + (score.timing.dragging ? ' (you fell behind at the end)' : score.timing.rushing ? ' (you got ahead at the end)' : '') + '.' : 'Too few notes to judge the timing.');
      if (state.speed < 1) lines.push('At ' + (state.speed === 0.5 ? 'slow speed, which earns up to 2 stars' : 'medium speed') + '.');
      if (score.estimated) lines.push('Heard through the microphone, so this is an estimate: it listens for the notes due at each moment, chords included, and can miss a soft note.');
      if (pedalWanted) {
        if (state.source === 'midi') {
          var changes = P.parseChords(song.chords, bpb, pickup).chords.filter(function (c) { return c.beat < endBeat; }).map(function (c) { return c.beat * beatMs; });
          var pd = P.scorePedal(changes, pedalEvents);
          lines.push('Pedal: changed cleanly at ' + pd.clean + ' of ' + pd.changes + ' chord changes' + (pd.blurred.length ? '; held through ' + pd.blurred.length + ' (lift as the new chord sounds)' : '') + (pd.dry.length ? '; not pressed again after ' + pd.dry.length + ' (press just after the new chord)' : '') + '.');
        } else if (score.notMeasured.indexOf('pedalling') < 0) score.notMeasured.push('pedalling (needs a MIDI keyboard with a pedal)');
      }
      lines.push('Not measured: ' + score.notMeasured.join(', ') + '.');
      setStatus('Done.');
      showResult(s, lines, { mode: 'play', hands: state.hands, speed: state.speed, played: played });
    }

    // ── microphone delay, measured once per device before play mode ──
    function needsCalibration() { return state.mode === 'play' && state.source === 'mic' && !readLatency(); }

    function median(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length / 2)]; }

    function calibrate(done) {
      if (panel) panel.remove();
      panel = el('div', 'panel');
      panel.appendChild(el('p', null, 'The microphone hears your piano a little late. Measure that delay once on this device so play mode can allow for it: turn your speakers up, keep the room quiet, then press Measure. You will hear four beeps.'));
      var r = el('div', 'row');
      var measure = el('button', 'btn is-primary', 'Measure');
      measure.type = 'button';
      var skip = el('button', 'btn', 'Skip (score timing as heard)');
      skip.type = 'button';
      r.appendChild(measure);
      r.appendChild(skip);
      panel.appendChild(r);
      var msg = el('p', 'small', '');
      panel.appendChild(msg);
      card.insertBefore(panel, stage);
      skip.addEventListener('click', function () { saveLatency({ ms: 0, how: 'skipped', at: Date.now() }); panel.remove(); panel = null; done(); });
      measure.addEventListener('click', function () {
        measure.disabled = true;
        msg.textContent = 'Listening...';
        listen('beep', function (ms) {
          if (ms !== null) return finished(ms, 'speaker');
          msg.textContent = 'The beeps were not heard (headphones?). Instead: play any key on your piano each time you hear a click. Four clicks.';
          setTimeout(function () {
            listen('tap', function (ms2) {
              if (ms2 !== null) return finished(ms2, 'tap');
              msg.textContent = 'Nothing was heard. Check the microphone, or play with a MIDI keyboard or the on-screen keys.';
              measure.disabled = false;
            });
          }, 1500);
        });
      });
      function finished(ms, how) {
        saveLatency({ ms: Math.max(0, Math.round(ms)), how: how, at: Date.now() });
        msg.textContent = 'Measured: the microphone hears the piano about ' + Math.round(ms) + ' ms late. Starting...';
        setTimeout(function () { if (panel) { panel.remove(); panel = null; } done(); }, 900);
      }
    }

    // Four sounds a beat apart; each heard note is matched to the sound before it.
    function listen(kind, cb) {
      var a = IO.synth.context();
      if (!a) { cb(null); return; }
      var heard = [];
      IO.mic.start(function (n) { heard.push(n); }).then(function (h) {
        var gap = 0.7;
        var t0 = a.currentTime + 0.6;
        var expected = [];
        for (var i = 0; i < 4; i++) {
          var t = t0 + i * gap;
          if (kind === 'beep') IO.synth.play(69, 220, t, 100); else IO.synth.click(true, t);
          expected.push(IO.synth.perfTime(t));
        }
        setTimeout(function () {
          h.stop();
          var lags = [];
          expected.forEach(function (e) {
            var n = heard.find(function (x) { return x.time >= e - (kind === 'tap' ? 250 : 0) && x.time <= e + 650 && (kind === 'tap' || P.pitchClass(x.midi) === 9); });
            if (n) lags.push(n.time - e);
          });
          cb(lags.length >= 3 ? median(lags) : null);
        }, (0.6 + 4 * gap + 0.9) * 1000);
      }).catch(function () { cb(null); });
    }

    // ── wiring ──
    go.addEventListener('click', function () {
      if (state.running) return;
      if (needsCalibration()) { calibrate(beginTake); return; }
      beginTake();
    });
    stop.addEventListener('click', function () { stopRun(); draw(lastPos); });

    var stopper = null;
    function stopInputs() { if (stopper) { stopper.stop(); stopper = null; } midiBtn.classList.remove('is-on'); micBtn.classList.remove('is-on'); state.source = 'screen'; }
    midiBtn.addEventListener('click', function () {
      stopInputs();
      IO.midi.connect(function (n) { onNote(n); }, { onPedal: function (e) { if (state.running && state.mode === 'play') pedalEvents.push({ time: e.time - origin, down: e.down }); } }).then(function (h) {
        stopper = h;
        state.source = 'midi';
        midiBtn.classList.add('is-on');
        inStatus.textContent = h.devices.length ? 'Listening to ' + h.devices.join(', ') + '. MIDI needs no delay check.' : 'No MIDI keyboard found. Plug one in and press again.';
      }).catch(function (err) { inStatus.textContent = err.message; });
    });
    micBtn.addEventListener('click', function () {
      stopInputs();
      IO.mic.start(function (n) { onNote(n); }, { expected: dueNotes, octaveFree: true }).then(function (h) {
        stopper = h;
        state.source = 'mic';
        micBtn.classList.add('is-on');
        var lat = readLatency();
        inStatus.textContent = 'Listening through the microphone: it listens for the notes due next, chords too, so results are estimates.'
          + (lat ? ' Delay measured on this device: about ' + lat.ms + ' ms.' : ' Play mode will measure its delay first.')
          + (state.hands === 'both' ? ' For both hands, a MIDI keyboard is the most exact.' : '');
      }).catch(function (err) { inStatus.textContent = err.message || 'The microphone could not be opened.'; });
    });
    inStatus.textContent = 'Playing on the on-screen keys or your computer keys. A MIDI keyboard or the microphone works too.';

    layout();
  }

  registry().register('Piano_Song', { tag: 'Piano_Song', render: render, renderBlock: render, schema: null });
})(typeof window !== 'undefined' ? window : globalThis);
