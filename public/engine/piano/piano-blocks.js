/* The piano blocks.
 *
 *   Piano_Keys      { caption, notes: ["C4","E4","G4"], together?: bool, note? }
 *                   A keyboard with the notes lit, and a button to hear them.
 *   Piano_Staff     { caption, clef: "treble"|"bass", notes: [{note, beats}], note? }
 *                   The notes on a staff, to read, with a button to hear them.
 *   Piano_PlayAlong { prompt, notes: [{note, beats, dynamic?}], tempo, mode: "wait"|"tempo", pedal?: "legato" }
 *                   Play a phrase: in wait mode the next key lights and the app waits
 *                   for it; in tempo mode a count-in starts a timed take. The learner
 *                   rates the take before seeing what was measured. With a MIDI
 *                   keyboard, notes marked p/f (`dynamic`) are graded loud against
 *                   soft, and `pedal: "legato"` grades the sustain pedal changed
 *                   with each new note.
 *   Piano_EarEcho   { prompt, notes: [{note, beats}], tempo }
 *                   Hear a phrase, then play it back by ear.
 *   Piano_Jam       { prompt, keys: "black"|"white", tempo, bars, note? }
 *                   The app plays a backing band (bass, chords, soft drums) built so
 *                   every key of one kind fits; the learner plays freely over it.
 *                   It reports how many notes were on that kind of key and how many
 *                   landed with the beat, never "wrong notes".
 *   Check_Piano     { id, prompt, mode: "chord"|"sequence"|"set" }
 *                   A graded check: the notes played go to the server, which grades
 *                   them. No answer is on the page. A chord check takes a MIDI
 *                   keyboard or the on-screen keys only: hearing a chord through the
 *                   microphone needs the expected notes, which a graded check keeps
 *                   off the page.
 *
 * Every block takes notes from the on-screen keys, a MIDI keyboard or the
 * microphone. Needs piano-core.js and piano-io.js, and checks-common.js for Check_Piano.
 */
(function (global) {
  var P = global.PolymathPiano;
  var IO = global.PolymathPianoIO;
  var TAG = 'polymath_pblock';

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
      '.' + t + '__note{margin:12px 0 0;font-size:14px;line-height:1.55;color:#cbd5e1;white-space:pre-wrap;}',
      '.' + t + '__row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;}',
      '.' + t + '__btn{min-height:44px;padding:0 16px;border:1px solid #334155;border-radius:10px;background:#090d16;color:#f8fafc;font:inherit;font-weight:600;cursor:pointer;}',
      '.' + t + '__btn.is-primary{background:#38bdf8;color:#090d16;border-color:#38bdf8;}',
      '.' + t + '__btn.is-on{border-color:#38bdf8;box-shadow:0 0 0 1px #38bdf8;}',
      '.' + t + '__btn:disabled{opacity:.5;cursor:default;}',
      '.' + t + '__btn:focus-visible{outline:2px solid #38bdf8;outline-offset:2px;}',
      '.' + t + '__status{font-size:13px;color:#94a3b8;}',
      '.' + t + '__played{font-size:14px;color:#cbd5e1;min-height:1.4em;margin:8px 0 0;}',
      '.' + t + '__score{margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #1f293d;background:#090d16;font-size:14px;line-height:1.6;}',
      '.' + t + '__score.is-right{border-color:#34d399;}',
      '.' + t + '__score.is-wrong{border-color:#f87171;}',
      '.' + t + '__staff{width:100%;max-width:520px;height:auto;display:block;margin:0 auto;}',
    ].join('');
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls.split(' ').map(function (c) { return /^is-/.test(c) ? c : TAG + '__' + c; }).join(' ');
    if (text != null) e.textContent = String(text);
    return e;
  }

  /** [{note, beats}] or ["C4", ...] -> [{midi, beat, beats, name}], skipping unreadable notes. */
  function phrase(list) {
    var out = [];
    var beat = 0;
    (Array.isArray(list) ? list : []).forEach(function (n) {
      var name = typeof n === 'string' ? n : n && n.note;
      var beats = typeof n === 'object' && n && Number(n.beats) > 0 ? Number(n.beats) : 1;
      var m = P.noteToMidi(name);
      if (m === null) return;
      var dyn = typeof n === 'object' && n && P.DYNAMICS.indexOf(n.dynamic) > -1 ? n.dynamic : null;
      out.push({ midi: m, beat: beat, beats: beats, name: name, dynamic: dyn });
      beat += beats;
    });
    return out;
  }

  /** A keyboard range that shows every note with a little room either side. */
  function rangeFor(midis) {
    if (!midis.length) return { from: 60, to: 72 };
    // From the C at or below the lowest note, to at least an octave and two notes past the highest.
    var lo = Math.min.apply(null, midis);
    var hi = Math.max.apply(null, midis);
    var from = lo - P.pitchClass(lo);
    var to = Math.max(hi + 2, from + 12);
    return { from: Math.max(21, from), to: Math.min(108, to) };
  }

  /**
   * The input picker under a block: the on-screen keys always, plus a MIDI keyboard
   * or the microphone on request. Every note reaches `onNote` the same way.
   * opts: { expected(time) -> midis the microphone should listen for,
   *         onPedal(event) for MIDI pedal moves,
   *         noMicChords: the microphone is not offered (a graded chord check) }
   */
  function inputs(card, range, onNote, opts) {
    opts = opts || {};
    var row = el('div', 'row');
    var midiBtn = el('button', 'btn', 'Use MIDI keyboard');
    midiBtn.type = 'button';
    var micBtn = el('button', 'btn', 'Use microphone');
    micBtn.type = 'button';
    var status = el('span', 'status', 'Playing on the on-screen keys (or your computer keys A to K).');
    row.appendChild(midiBtn);
    row.appendChild(micBtn);
    card.appendChild(row);
    card.appendChild(status);
    var kbHost = el('div');
    card.appendChild(kbHost);
    var stopper = null;
    // Computer keys play this keyboard once anything in its block is touched.
    var kb = IO.keyboard(kbHost, { from: range.from, to: range.to, onPress: function (n) { onNote(n); }, activateOn: card });
    function stopOthers() { if (stopper) { stopper.stop(); stopper = null; } source = 'screen'; midiBtn.classList.remove('is-on'); micBtn.classList.remove('is-on'); }
    var source = 'screen';
    midiBtn.addEventListener('click', function () {
      stopOthers();
      IO.midi.connect(function (n) { kb.highlight(n.midi, 'hint'); setTimeout(function () { kb.clear(n.midi); }, 150); onNote(n); }, { onPedal: opts.onPedal }).then(function (h) {
        source = 'midi';
        stopper = h;
        midiBtn.classList.add('is-on');
        status.textContent = h.devices.length ? 'Listening to ' + h.devices.join(', ') + '.' : 'No MIDI keyboard found. Plug one in and press again.';
      }).catch(function (err) { status.textContent = err.message; });
    });
    if (opts.noMicChords) {
      micBtn.disabled = true;
      micBtn.title = 'MIDI keyboard or on-screen keys only for chords';
      status.textContent = 'Chord check: play it on the on-screen keys (or computer keys) or a MIDI keyboard. The microphone cannot be used to grade a chord yet.';
    }
    micBtn.addEventListener('click', function () {
      if (opts.noMicChords) return;
      stopOthers();
      IO.mic.start(function (n) { onNote(n); }, { expected: opts.expected }).then(function (h) {
        stopper = h;
        source = 'mic';
        micBtn.classList.add('is-on');
        status.textContent = 'Listening through the microphone: play one note at a time, at a steady speed. Results from the microphone are estimates.';
      }).catch(function (err) { status.textContent = err.message || 'The microphone could not be opened.'; });
    });
    return { keyboard: kb, stop: stopOthers, status: status, source: function () { return stopper ? source : 'screen'; } };
  }

  /** Ask the learner to rate a take before showing the measurement (research/02: self-assessment first). */
  function selfRate(card, done) {
    var box = el('div', 'score');
    box.appendChild(el('p', null, 'Before you see the result: how did that go?'));
    var row = el('div', 'row');
    [['clean', 'All the right notes, steady'], ['slips', 'A few slips'], ['rough', 'Lots of slips or stops']].forEach(function (o) {
      var b = el('button', 'btn', o[1]);
      b.type = 'button';
      b.addEventListener('click', function () { box.remove(); done(o[0]); });
      row.appendChild(b);
    });
    box.appendChild(row);
    card.appendChild(box);
  }

  function report(card, score, self) {
    var good = score.noteAccuracy >= 0.9 && (!score.timing || score.timing.onBeatShare >= 0.75);
    var box = el('div', 'score ' + (good ? 'is-right' : 'is-wrong'));
    box.setAttribute('role', 'status');
    var lines = ['Notes: ' + score.correct + ' of ' + score.total + ' right' + (score.missed.length ? ', ' + score.missed.length + ' missed' : '') + (score.extra.length ? ', ' + score.extra.length + ' extra' : '') + '.'];
    if (score.timing) lines.push('In time: ' + Math.round(score.timing.onBeatShare * 100) + '% of notes' + (score.timing.dragging ? ' (you slowed down)' : score.timing.rushing ? ' (you sped up)' : '') + '.');
    if (score.evenness) lines.push('Evenness: ' + (score.evenness.cv <= 0.1 ? 'very even' : score.evenness.cv <= 0.2 ? 'fairly even' : 'uneven') + ', about ' + score.evenness.playedTempo + ' beats a minute.');
    if (score.dynamicsCheck) {
      var dc = score.dynamicsCheck;
      var by = dc.levels.map(function (l) { return l.mark + ' notes averaged ' + l.mean; }).join(', ');
      lines.push(dc.ok ? 'Loud and soft: ' + by + ' (out of 127), so the markings came through.' : 'Loud and soft: ' + by + ' (out of 127). Make the ' + dc.flat.map(function (f) { return f[1] + ' notes clearly louder than the ' + f[0] + ' ones'; }).join(', and the ') + '.');
    } else if (score.dynamics) lines.push('Loudness range: ' + score.dynamics.range + ' (out of 127).');
    if (score.pedal) {
      var pd = score.pedal;
      lines.push('Pedal: changed cleanly at ' + pd.clean + ' of ' + pd.changes + ' notes' + (pd.blurred.length ? '; held through ' + pd.blurred.length + ' (lift it as the new note sounds)' : '') + (pd.dry.length ? '; not pressed again after ' + pd.dry.length + ' (press it just after the new note)' : '') + '.');
    } else if (score.pedalWanted) lines.push('Pedal: this phrase grades the pedal with a MIDI keyboard; listen for a smooth, unblurred change instead.');
    if (self) {
      var actual = score.noteAccuracy >= 0.95 && !score.extra.length && !score.wrong.length ? 'clean' : score.noteAccuracy >= 0.75 ? 'slips' : 'rough';
      lines.push(self === actual ? 'Your own rating matched the measurement.' : 'Your rating and the measurement differ - listen back and compare.');
    }
    if (score.estimated) lines.push('Heard through the microphone, so these are estimates.');
    lines.push('Not measured: ' + score.notMeasured.join(', ') + ' - judge those by ear.');
    box.appendChild(el('p', null, (good ? 'Win: ' : 'Keep going: ') + lines.join(' ')));
    card.appendChild(box);
    return box;
  }

  // ── Piano_Keys ─────────────────────────────────────────────────────────────
  function renderKeys(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var notes = (Array.isArray(d.notes) ? d.notes : []).map(P.noteToMidi).filter(function (m) { return m !== null; });
    var card = el('div', 'card');
    if (d.caption) card.appendChild(el('p', 'kicker', d.caption));
    var host = el('div');
    card.appendChild(host);
    var kb = IO.keyboard(host, Object.assign(rangeFor(notes), { labels: 'all', computerKeys: false }));
    notes.forEach(function (m) { kb.highlight(m, 'hint'); });
    var row = el('div', 'row');
    var play = el('button', 'btn is-primary', d.together ? 'Hear it' : 'Hear the notes');
    play.type = 'button';
    play.addEventListener('click', function () {
      if (d.together) notes.forEach(function (m) { IO.synth.play(m, 1200); });
      else IO.synth.sequence(notes.map(function (m, i) { return { midi: m, beat: i, beats: 1 }; }), 100);
    });
    row.appendChild(play);
    card.appendChild(row);
    if (d.note) card.appendChild(el('p', 'note', d.note));
    container.appendChild(card);
  }

  // ── Piano_Staff ────────────────────────────────────────────────────────────
  var LETTERS = 'CDEFGAB';
  function staffStep(midi, name, clef) {
    // Diatonic steps above the bottom line: E4 (treble) or G2 (bass).
    var m = /^([A-Ga-g])(##|#|bb|b|x)?(-?\d)$/.exec(name);
    var letter = m ? m[1].toUpperCase() : P.midiToName(midi)[0];
    var octave = m ? Number(m[3]) : Math.floor(midi / 12) - 1;
    var idx = LETTERS.indexOf(letter) + octave * 7;
    var bottom = clef === 'bass' ? LETTERS.indexOf('G') + 2 * 7 : LETTERS.indexOf('E') + 4 * 7;
    var acc = m && m[2] ? ({ '#': '#', '##': '##', x: '##', b: 'b', bb: 'bb' }[m[2]] || '') : '';
    return { step: idx - bottom, acc: acc };
  }

  function renderStaff(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var clef = d.clef === 'bass' ? 'bass' : 'treble';
    var notes = phrase(d.notes);
    var card = el('div', 'card');
    if (d.caption) card.appendChild(el('p', 'kicker', d.caption));
    var ns = 'http://www.w3.org/2000/svg';
    var gap = 10;
    var width = Math.max(220, 70 + notes.length * 44);
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', TAG + '__staff');
    svg.setAttribute('viewBox', '0 0 ' + width + ' 120');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', clef + ' clef: ' + notes.map(function (n) { return n.name; }).join(', '));
    var top = 30;
    var lineY = function (step) { return top + 4 * gap - step * (gap / 2); };
    for (var i = 0; i < 5; i++) {
      var ln = document.createElementNS(ns, 'line');
      ln.setAttribute('x1', 8); ln.setAttribute('x2', width - 8);
      ln.setAttribute('y1', top + i * gap); ln.setAttribute('y2', top + i * gap);
      ln.setAttribute('stroke', '#cbd5e1'); ln.setAttribute('stroke-width', '1');
      svg.appendChild(ln);
    }
    var clefText = document.createElementNS(ns, 'text');
    clefText.setAttribute('x', 10); clefText.setAttribute('y', top - 12);
    clefText.setAttribute('fill', '#94a3b8'); clefText.setAttribute('font-size', '10'); clefText.setAttribute('font-weight', '700');
    clefText.textContent = clef === 'bass' ? 'Bass clef' : 'Treble clef';
    svg.appendChild(clefText);
    notes.forEach(function (n, k) {
      var x = 76 + k * 44;
      var s = staffStep(n.midi, n.name, clef);
      var y = lineY(s.step);
      // Ledger lines below and above the staff.
      for (var st = -2; st >= s.step; st -= 2) addLedger(x, lineY(st));
      for (var st2 = 10; st2 <= s.step; st2 += 2) addLedger(x, lineY(st2));
      var head = document.createElementNS(ns, 'ellipse');
      head.setAttribute('cx', x); head.setAttribute('cy', y); head.setAttribute('rx', 6.5); head.setAttribute('ry', 4.8);
      head.setAttribute('transform', 'rotate(-20 ' + x + ' ' + y + ')');
      var open = n.beats >= 2;
      head.setAttribute('fill', open ? 'none' : '#f8fafc'); head.setAttribute('stroke', '#f8fafc'); head.setAttribute('stroke-width', '1.6');
      svg.appendChild(head);
      if (n.beats < 4) {
        var stem = document.createElementNS(ns, 'line');
        var up = s.step < 4;
        stem.setAttribute('x1', up ? x + 6 : x - 6); stem.setAttribute('x2', up ? x + 6 : x - 6);
        stem.setAttribute('y1', y); stem.setAttribute('y2', up ? y - 30 : y + 30);
        stem.setAttribute('stroke', '#f8fafc'); stem.setAttribute('stroke-width', '1.4');
        svg.appendChild(stem);
      }
      if (s.acc) {
        var acc = document.createElementNS(ns, 'text');
        acc.setAttribute('x', x - 19); acc.setAttribute('y', y + 5);
        acc.setAttribute('fill', '#f8fafc'); acc.setAttribute('font-size', '15');
        acc.textContent = s.acc.replace(/#/g, '♯').replace(/b/g, '♭');
        svg.appendChild(acc);
      }
    });
    function addLedger(x, y) {
      var l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x - 11); l.setAttribute('x2', x + 11); l.setAttribute('y1', y); l.setAttribute('y2', y);
      l.setAttribute('stroke', '#cbd5e1'); l.setAttribute('stroke-width', '1');
      svg.appendChild(l);
    }
    card.appendChild(svg);
    var row = el('div', 'row');
    var play = el('button', 'btn is-primary', 'Hear it');
    play.type = 'button';
    play.addEventListener('click', function () { IO.synth.sequence(notes, Number(d.tempo) || 90); });
    row.appendChild(play);
    card.appendChild(row);
    if (d.note) card.appendChild(el('p', 'note', d.note));
    container.appendChild(card);
  }

  // ── Piano_PlayAlong ────────────────────────────────────────────────────────
  function renderPlayAlong(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var notes = phrase(d.notes);
    var tempo = Math.max(30, Math.min(200, Number(d.tempo) || 72));
    var mode = d.mode === 'tempo' ? 'tempo' : 'wait';
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', mode === 'wait' ? 'Play along: the app waits for you' : 'Play in time'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Play the phrase.'));
    if (!notes.length) { card.appendChild(el('p', 'note', 'This phrase could not be shown.')); container.appendChild(card); return; }
    var played = el('p', 'played', '');
    var controls = el('div', 'row');
    var listen = el('button', 'btn', 'Hear it first');
    listen.type = 'button';
    var go = el('button', 'btn is-primary', mode === 'wait' ? 'Start' : 'Count me in');
    go.type = 'button';
    controls.appendChild(listen);
    controls.appendChild(go);
    card.appendChild(controls);
    var take = null;
    var pedalWanted = d.pedal === 'legato';
    var pedalEvents = [];
    var heardCount = 0;
    var waitAt = 0;
    var io = inputs(card, rangeFor(notes.map(function (n) { return n.midi; })), function (n) { if (take) take(n); }, {
      onPedal: function (e) { if (take) pedalEvents.push({ time: e.time, down: e.down }); },
      // The microphone listens for the note due next.
      expected: function () { var k = mode === 'wait' ? waitAt : heardCount; return notes[k] ? [notes[k].midi] : []; },
    });
    card.appendChild(played);
    if (pedalWanted) card.appendChild(el('p', 'note', 'Pedal: lift the sustain pedal as you play each new note and press it again just after. A MIDI keyboard with a pedal lets the app check it.'));
    if (notes.some(function (n) { return n.dynamic; })) card.appendChild(el('p', 'note', 'Loud and soft: ' + notes.map(function (n) { return n.name + (n.dynamic ? ' ' + n.dynamic : ''); }).join(', ') + '. A MIDI keyboard lets the app check them.'));
    container.appendChild(card);
    listen.addEventListener('click', function () { IO.synth.sequence(notes, tempo); });

    var result = null;
    function finish(list) {
      take = null;
      io.keyboard.clear();
      go.disabled = false;
      go.textContent = 'Try again';
      var pedals = pedalEvents.slice();
      selfRate(card, function (self) {
        var score = P.scorePerformance(notes, list, { tempo: tempo });
        // In wait mode the app waits for each note, so there is no timing to judge.
        if (mode === 'wait') { score.timing = null; score.evenness = null; }
        // Legato pedal: graded against when each right note was played (MIDI only).
        if (pedalWanted) {
          var onsets = [];
          var seen = {};
          P.align(notes, list).forEach(function (x) { if (x.t !== null && x.p !== null && notes[x.t].midi === list[x.p].midi && !seen[x.t]) { seen[x.t] = 1; onsets.push(list[x.p].time); } });
          var allMidi = list.length && list.every(function (x) { return x.source === 'midi'; });
          score.pedalWanted = true;
          score.pedal = allMidi && onsets.length ? P.scorePedal(onsets, pedals) : null;
          if (!score.pedal && score.notMeasured.indexOf('pedalling') < 0) score.notMeasured.push('pedalling');
        }
        if (result) result.remove();
        result = report(card, score, self);
      });
    }

    go.addEventListener('click', function () {
      if (result) { result.remove(); result = null; }
      go.disabled = true;
      var list = [];
      pedalEvents = [];
      heardCount = 0;
      waitAt = 0;
      if (mode === 'wait') {
        var at = 0;
        io.keyboard.clear();
        io.keyboard.highlight(notes[0].midi, 'hint');
        played.textContent = 'Play the lit key.';
        take = function (n) {
          list.push(n);
          if (n.midi === notes[at].midi) {
            io.keyboard.clear(notes[at].midi);
            at++;
            waitAt = at;
            played.textContent = notes.slice(0, at).map(function (x) { return x.name; }).join(' ');
            if (at >= notes.length) { finish(list); return; }
            io.keyboard.highlight(notes[at].midi, 'hint');
          }
        };
        return;
      }
      // Tempo mode: four clicks, then the take runs for the phrase plus one beat.
      var beatMs = 60000 / tempo;
      played.textContent = 'Get ready...';
      for (var c = 0; c < 4; c++) setTimeout(IO.synth.click.bind(null, c === 0), c * beatMs);
      setTimeout(function () {
        played.textContent = 'Play now.';
        take = function (n) { list.push(n); heardCount = list.length; played.textContent = list.map(function (x) { return P.midiToName(x.midi); }).join(' '); };
        var last = notes[notes.length - 1];
        setTimeout(function () { finish(list); }, (last.beat + last.beats + 1) * beatMs);
      }, 4 * beatMs - 60);
    });
  }

  // ── Piano_EarEcho ──────────────────────────────────────────────────────────
  function renderEarEcho(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var notes = phrase(d.notes);
    var tempo = Math.max(30, Math.min(200, Number(d.tempo) || 80));
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Play it back by ear'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Listen, then play the phrase back.'));
    if (!notes.length) { card.appendChild(el('p', 'note', 'This phrase could not be played.')); container.appendChild(card); return; }
    var row = el('div', 'row');
    var listen = el('button', 'btn is-primary', 'Listen');
    listen.type = 'button';
    var done = el('button', 'btn', 'I have played it');
    done.type = 'button';
    row.appendChild(listen);
    row.appendChild(done);
    card.appendChild(row);
    var heard = [];
    var played = el('p', 'played', '');
    inputs(card, rangeFor(notes.map(function (n) { return n.midi; })), function (n) {
      heard.push(n);
      played.textContent = heard.map(function (x) { return P.midiToName(x.midi); }).join(' ');
    });
    card.appendChild(played);
    container.appendChild(card);
    var result = null;
    listen.addEventListener('click', function () { heard = []; played.textContent = ''; if (result) { result.remove(); result = null; } IO.synth.sequence(notes, tempo); });
    done.addEventListener('click', function () {
      if (!heard.length) { played.textContent = 'Play the phrase first.'; return; }
      // By ear the octave may differ: compare note names, not the exact key.
      var score = P.scorePerformance(notes, heard, { octaveFree: true });
      score.timing = null;
      score.evenness = null;
      if (result) result.remove();
      result = report(card, score, null);
      result.appendChild(el('p', null, 'The phrase was: ' + notes.map(function (n) { return n.name.replace(/-?\d$/, ''); }).join(' ')));
    });
  }

  // ── Check_Piano ────────────────────────────────────────────────────────────
  function renderCheck(container, data) {
    if (!container) return;
    var Kit = global.PolymathCheckKit;
    styles();
    if (Kit) Kit.styles();
    container.innerHTML = '';
    var d = data || {};
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Check'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Play the answer.'));
    var notes = [];
    var played = el('p', 'played', 'Play your answer, then press Check.');
    var io = inputs(card, { from: Number(d.from) || 48, to: Number(d.to) || 84 }, function (n) {
      if (done) return;
      // A chord from the microphone cannot be graded (see the note at the top).
      if (n.source === 'mic' && d.mode === 'chord') return;
      notes.push(n.midi);
      played.textContent = 'You played: ' + notes.map(P.midiToName).join(' ');
      send.disabled = false;
      clear.disabled = false;
    }, { noMicChords: d.mode === 'chord' });
    card.appendChild(played);
    var row = el('div', 'row');
    var clear = el('button', 'btn', 'Clear');
    clear.type = 'button';
    clear.disabled = true;
    var send = el('button', 'btn is-primary', 'Check');
    send.type = 'button';
    send.disabled = true;
    row.appendChild(clear);
    row.appendChild(send);
    card.appendChild(row);
    container.appendChild(card);
    var done = false;
    clear.addEventListener('click', function () { notes = []; played.textContent = 'Play your answer, then press Check.'; send.disabled = true; clear.disabled = true; });
    function lock(result) {
      done = true;
      io.stop();
      io.keyboard.setDisabled(true);
      send.disabled = true;
      clear.disabled = true;
      if (Kit) Kit.verdict(card, result);
    }
    send.addEventListener('click', function () {
      if (!notes.length) return;
      send.disabled = true;
      var api = Kit ? Kit.submit(d.id, 'notes:' + notes.join(',')) : Promise.reject(new Error('Checks are not connected on this page.'));
      api.then(lock).catch(function (err) {
        send.disabled = false;
        if (Kit) Kit.verdict(card, { correct: false, answer: '', rationale: err.message || 'That answer could not be saved. Try again.' });
      });
    });
    var before = Kit ? Kit.previous(d.id) : null;
    if (before) {
      played.textContent = 'You played: ' + P.parseNotes(before.choice).map(P.midiToName).join(' ');
      lock(before);
    }
  }

  // ── Piano_Jam ──────────────────────────────────────────────────────────────
  // The band: two chords that alternate bar by bar, built so that every key of
  // one kind fits. Black keys are the F sharp major pentatonic scale, so the band
  // plays F sharp and D sharp minor; white keys fit D Dorian, so it plays D minor 7
  // and G 7. Bass on beats 1 and 3, a soft chord on 2 and 4.
  var GROOVES = {
    black: {
      fits: function (m) { return P.isBlack(m); },
      kind: 'black keys',
      bars: [{ bass: [42, 49], chord: [54, 58, 61] }, { bass: [39, 46], chord: [51, 54, 58] }],
    },
    white: {
      fits: function (m) { return !P.isBlack(m); },
      kind: 'white keys',
      bars: [{ bass: [38, 45], chord: [50, 53, 57, 60] }, { bass: [43, 50], chord: [55, 59, 62, 65] }],
    },
  };

  function renderJam(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var groove = GROOVES[d.keys] || GROOVES.black;
    var tempo = Math.max(50, Math.min(140, Number(d.tempo) || 80));
    var bars = Math.max(2, Math.min(16, Number(d.bars) || 8));
    var beatMs = 60000 / tempo;
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Jam with the band'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Play along with the band.'));
    var row = el('div', 'row');
    var go = el('button', 'btn is-primary', 'Start the band');
    go.type = 'button';
    row.appendChild(go);
    var beatLabel = el('span', 'status', '');
    row.appendChild(beatLabel);
    card.appendChild(row);
    var notes = [];
    var running = false;
    var startPerf = 0;
    var io = inputs(card, { from: 60, to: 84 }, function (n) {
      // From the band's first beat (a little before, for an eager start), by the clock
      // rather than a timer, which a busy or background page may fire late.
      if (!running || n.time < startPerf - beatMs / 2) return;
      notes.push(n);
      var ok = groove.fits(n.midi);
      io.keyboard.highlight(n.midi, ok ? 'right' : 'wrong');
      setTimeout(function () { io.keyboard.clear(n.midi); }, 220);
    });
    var played = el('p', 'played', '');
    card.appendChild(played);
    if (d.note) card.appendChild(el('p', 'note', d.note));
    container.appendChild(card);
    var result = null;
    var timers = [];

    function schedule() {
      var a = IO.synth.context();
      var beat = beatMs / 1000;
      var t0 = (a ? a.currentTime : 0) + 0.15;
      // A bar of count-in clicks, then the band.
      for (var c = 0; c < 4; c++) IO.synth.click(c === 0, t0 + c * beat);
      var bandAt = t0 + 4 * beat;
      for (var b = 0; b < bars; b++) {
        var bar = groove.bars[b % groove.bars.length];
        var at = bandAt + b * 4 * beat;
        IO.synth.play(bar.bass[0], beatMs * 1.8, at, 70);
        IO.synth.play(bar.bass[1], beatMs * 1.8, at + 2 * beat, 60);
        [1, 3].forEach(function (k) { bar.chord.forEach(function (m) { IO.synth.play(m, beatMs * 0.6, at + k * beat, 32); }); });
        [0, 2].forEach(function (k) { IO.synth.drum('kick', at + k * beat, 0.8); });
        for (var h = 0; h < 8; h++) IO.synth.drum('hat', at + h * beat / 2, h % 2 ? 0.5 : 0.9);
      }
      startPerf = IO.synth.perfTime(bandAt);
      return { countMs: startPerf - performance.now(), totalMs: bars * 4 * beatMs };
    }

    function finish() {
      running = false;
      go.disabled = false;
      go.textContent = 'Jam again';
      beatLabel.textContent = '';
      var fit = notes.filter(function (n) { return groove.fits(n.midi); }).length;
      // With the beat: within a sixth of a beat of a beat or half-beat.
      var tol = Math.max(90, beatMs / 6);
      var withBeat = notes.filter(function (n) {
        var half = beatMs / 2;
        var off = (n.time - startPerf) % half;
        if (off < 0) off += half;
        return Math.min(off, half - off) <= tol;
      }).length;
      if (result) result.remove();
      result = el('div', 'score ' + (notes.length && fit === notes.length ? 'is-right' : ''));
      result.setAttribute('role', 'status');
      var lines = [];
      if (!notes.length) lines.push('No notes reached the app that time. Press Jam again and play along.');
      else {
        lines.push('You played ' + notes.length + ' note' + (notes.length === 1 ? '' : 's') + ': ' + fit + ' on ' + groove.kind + '.');
        if (fit < notes.length) lines.push('Today the band fits ' + groove.kind + ', so keep to those.');
        lines.push(withBeat + ' of them landed with the beat.');
        if (notes.some(function (n) { return n.source === 'mic'; })) lines.push('Heard through the microphone, so these are estimates.');
        lines.push('How it sounded is up to your ears: there are no wrong notes in a jam on ' + groove.kind + '.');
      }
      result.appendChild(el('p', null, lines.join(' ')));
      card.appendChild(result);
    }

    go.addEventListener('click', function () {
      if (running) return;
      if (result) { result.remove(); result = null; }
      timers.forEach(clearTimeout);
      timers = [];
      notes = [];
      played.textContent = '';
      go.disabled = true;
      var plan = schedule();
      running = true;
      beatLabel.textContent = 'Get ready: 1, 2, 3, 4...';
      timers.push(setTimeout(function () { if (running) beatLabel.textContent = 'Jam now!'; }, Math.max(0, plan.countMs - beatMs / 3)));
      timers.push(setTimeout(finish, plan.countMs + plan.totalMs + 300));
    });
  }

  var reg = blocks();
  reg.register('Piano_Jam', { tag: 'Piano_Jam', render: renderJam, renderBlock: renderJam, schema: null });
  reg.register('Piano_Keys', { tag: 'Piano_Keys', render: renderKeys, renderBlock: renderKeys, schema: null });
  reg.register('Piano_Staff', { tag: 'Piano_Staff', render: renderStaff, renderBlock: renderStaff, schema: null });
  reg.register('Piano_PlayAlong', { tag: 'Piano_PlayAlong', render: renderPlayAlong, renderBlock: renderPlayAlong, schema: null });
  reg.register('Piano_EarEcho', { tag: 'Piano_EarEcho', render: renderEarEcho, renderBlock: renderEarEcho, schema: null });
  reg.register('Check_Piano', { tag: 'Check_Piano', render: renderCheck, renderBlock: renderCheck, schema: null });
})(typeof window !== 'undefined' ? window : globalThis);
