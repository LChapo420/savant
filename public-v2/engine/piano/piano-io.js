/**
 * The piano's ways in and out of the browser: a MIDI keyboard, the microphone,
 * an on-screen keyboard, and a small built-in synthesizer for models and ear work.
 *
 * Every input produces the same note event, { midi, velocity, time, source,
 * confidence }, so a block does not care how the learner plays. MIDI is the best
 * source (exact notes, timing, loudness, pedal); the microphone hears one note at
 * a time and says how sure it is; the on-screen keys work anywhere, even with no
 * instrument. Needs piano-core.js (window.PolymathPiano).
 *
 *   PolymathPianoIO.midi.connect(onNote) -> Promise<{ devices, stop }>
 *   PolymathPianoIO.mic.start(onNote)    -> Promise<{ stop }>
 *   PolymathPianoIO.keyboard(container, { from, to, onPress, labels, computerFrom, activateOn })
 *                                        -> { highlight, clear, activate, destroy, computerC }
 *   PolymathPianoIO.synth.play(midi, ms, when, velocity, bus) / .sequence(notes, tempo) / .click(accent, when)
 *   PolymathPianoIO.synth.context() / .perfTime(audioTime) / .bus(level) / .drum('kick'|'hat', when)
 *
 * Computer keys: A S D F G H J K are white keys from a C, W E T Y U O P the black
 * keys, Z X C V B N M the white keys an octave lower. With several keyboards on a
 * page they play only the one last touched (or the one most in view).
 */
(function (global) {
  var P = global.PolymathPiano;
  var TAG = 'polymath_piano';
  var now = function () { return (global.performance && performance.now) ? performance.now() : Date.now(); };

  // ── MIDI ──────────────────────────────────────────────────────────────────
  var midi = {
    supported: function () { return !!(global.navigator && navigator.requestMIDIAccess); },
    connect: function (onNote) {
      if (!midi.supported()) return Promise.reject(new Error('This browser cannot use a MIDI keyboard. Try Chrome or Edge, or use the microphone or the on-screen keys.'));
      return navigator.requestMIDIAccess().then(function (access) {
        var pedal = false;
        var handler = function (msg) {
          var d = msg.data;
          var type = d[0] & 0xf0;
          if (type === 0x90 && d[2] > 0) onNote({ midi: d[1], velocity: d[2], time: now(), source: 'midi', confidence: 1, pedal: pedal });
          else if (type === 0xb0 && d[1] === 64) pedal = d[2] >= 64;
        };
        var inputs = [];
        access.inputs.forEach(function (input) { input.onmidimessage = handler; inputs.push(input.name || 'MIDI keyboard'); });
        return {
          devices: inputs,
          stop: function () { access.inputs.forEach(function (input) { input.onmidimessage = null; }); },
        };
      });
    },
  };

  // ── Microphone ────────────────────────────────────────────────────────────
  var mic = {
    supported: function () { return !!(global.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    /**
     * Listen and report each new note as it starts. A note is reported once its
     * pitch has held for two frames (about 90 ms), which ignores the noise of the
     * hammer strike; the same pitch played again is reported after a short drop in
     * level between the two.
     */
    start: function (onNote, opts) {
      opts = opts || {};
      if (!mic.supported()) return Promise.reject(new Error('This browser cannot use the microphone here.'));
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
        var Ctx = global.AudioContext || global.webkitAudioContext;
        var ctx = new Ctx();
        var source = ctx.createMediaStreamSource(stream);
        var analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;
        source.connect(analyser);
        var buf = new Float32Array(analyser.fftSize);
        var last = null;
        var held = 0;
        var reported = null;
        var lastRms = 0;
        var timer = setInterval(function () {
          analyser.getFloatTimeDomainData(buf);
          var rms = 0;
          for (var i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
          rms = Math.sqrt(rms / buf.length);
          var pitch = P.detectPitch(buf, ctx.sampleRate, { minRms: opts.minRms || 0.012 });
          if (opts.onFrame) opts.onFrame(pitch, rms);
          var reattack = rms > lastRms * 1.6 && rms > 0.02;
          lastRms = rms;
          if (!pitch || pitch.clarity < 0.7) { held = 0; last = null; if (rms < 0.008) reported = null; return; }
          if (last === pitch.midi) held++; else { last = pitch.midi; held = 1; }
          if (held === 2 && (reported !== pitch.midi || reattack)) {
            reported = pitch.midi;
            onNote({ midi: pitch.midi, velocity: null, time: now() - 90, source: 'mic', confidence: Math.round(pitch.clarity * 100) / 100, cents: pitch.cents });
          }
        }, 45);
        return {
          stop: function () {
            clearInterval(timer);
            stream.getTracks().forEach(function (t) { t.stop(); });
            if (ctx.close) ctx.close();
          },
        };
      });
    },
  };

  // ── Built-in sound ────────────────────────────────────────────────────────
  var ctx = null;
  function audio() {
    if (!ctx) {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }
  var synth = {
    /**
     * A plain piano-like tone: a few harmonics with a quick attack and a long decay.
     * `dest` is an optional bus (synth.bus()) so a whole backing part can be silenced.
     */
    play: function (m, ms, when, velocity, dest) {
      var a = audio();
      if (!a) return;
      var t = (when || a.currentTime) + 0.01;
      var dur = Math.max(0.15, (ms || 600) / 1000);
      var gain = a.createGain();
      var peak = 0.18 * ((velocity || 80) / 100);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(peak * 0.35, t + Math.min(0.4, dur));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
      gain.connect(dest || a.destination);
      [1, 2, 3, 4].forEach(function (k) {
        var o = a.createOscillator();
        var g = a.createGain();
        o.type = k === 1 ? 'triangle' : 'sine';
        o.frequency.value = P.midiToFreq(m) * k;
        g.gain.value = 1 / (k * k);
        o.connect(g);
        g.connect(gain);
        o.start(t);
        o.stop(t + dur + 0.7);
      });
    },
    /** Play notes [{midi, beat, beats}] at a tempo; resolves when done. */
    sequence: function (notes, tempo) {
      var a = audio();
      if (!a) return Promise.resolve();
      var beat = 60 / (tempo || 80);
      var start = a.currentTime + 0.1;
      var end = 0;
      notes.forEach(function (n) {
        synth.play(n.midi, (n.beats || 1) * beat * 1000, start + n.beat * beat, 80);
        end = Math.max(end, (n.beat + (n.beats || 1)) * beat);
      });
      return new Promise(function (resolve) { setTimeout(resolve, (end + 0.3) * 1000); });
    },
    /** A metronome click, now or at an audio-clock time. */
    click: function (accent, when) {
      var a = audio();
      if (!a) return;
      var t = when || a.currentTime;
      var o = a.createOscillator();
      var g = a.createGain();
      o.frequency.value = accent ? 1600 : 1000;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g);
      g.connect(a.destination);
      o.start(t);
      o.stop(t + 0.06);
    },
    /** The audio clock (AudioContext), started on first use. Null when the browser has no Web Audio. */
    context: function () { return audio(); },
    /** A bus for scheduled sounds: { node, stop() }. stop() silences everything sent to it at once. */
    bus: function (level) {
      var a = audio();
      if (!a) return { node: null, stop: function () {} };
      var g = a.createGain();
      g.gain.value = level == null ? 1 : level;
      g.connect(a.destination);
      return { node: g, stop: function () { try { g.gain.setValueAtTime(0, a.currentTime); g.disconnect(); } catch (e) { /* already stopped */ } } };
    },
    /**
     * The performance.now() time at which a sound scheduled for `audioTime` reaches
     * the speakers, so a note played can be lined up with the band it was played to.
     */
    perfTime: function (audioTime) {
      var a = audio();
      if (!a) return now();
      var lag = ((a.outputLatency || 0) + (a.baseLatency || 0)) * 1000;
      return now() + (audioTime - a.currentTime) * 1000 + lag;
    },
    /** A soft drum for the backing band: 'kick' (a low thump) or 'hat' (a short tick of noise). */
    drum: function (kind, when, level) {
      var a = audio();
      if (!a) return;
      var t = when || a.currentTime;
      var g = a.createGain();
      g.connect(a.destination);
      var vol = level || 1;
      if (kind === 'kick') {
        var o = a.createOscillator();
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.2);
        return;
      }
      if (!synth._noise || synth._noise.sampleRate !== a.sampleRate) {
        var len = Math.floor(a.sampleRate * 0.05);
        var buf = a.createBuffer(1, len, a.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        synth._noise = buf;
      }
      var src = a.createBufferSource();
      src.buffer = synth._noise;
      var hp = a.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      g.gain.setValueAtTime(0.06 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      src.connect(hp);
      hp.connect(g);
      src.start(t);
      src.stop(t + 0.05);
    },
  };

  // ── On-screen keyboard ────────────────────────────────────────────────────
  function styles() {
    if (document.getElementById(TAG + '__styles')) return;
    var t = TAG;
    var st = document.createElement('style');
    st.id = t + '__styles';
    st.textContent = [
      '.' + t + '__kb{position:relative;display:flex;height:140px;max-width:100%;overflow-x:auto;user-select:none;-webkit-user-select:none;touch-action:manipulation;border-radius:6px;}',
      '.' + t + '__white{position:relative;flex:0 0 auto;width:38px;height:100%;border:1px solid #334155;border-radius:0 0 6px 6px;background:#f8fafc;color:#334155;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;font:600 11px/1 -apple-system,Segoe UI,sans-serif;cursor:pointer;}',
      '.' + t + '__black{position:absolute;top:0;width:24px;height:60%;margin-left:-12px;border-radius:0 0 4px 4px;background:#111827;border:1px solid #000;color:#e2e8f0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;font:600 9px/1 -apple-system,Segoe UI,sans-serif;z-index:2;cursor:pointer;}',
      '.' + t + '__white:focus-visible,.' + t + '__black:focus-visible{outline:3px solid #38bdf8;outline-offset:-3px;}',
      '.' + t + '__key.is-hint{background:#7dd3fc !important;}',
      '.' + t + '__key.is-right{background:#34d399 !important;}',
      '.' + t + '__key.is-wrong{background:#f87171 !important;}',
      '.' + t + '__key.is-down{filter:brightness(.85);}',
    ].join('');
    document.head.appendChild(st);
  }

  // Computer keys: the home row plays white keys from the first C, the row above the
  // black keys, and the bottom row (Z to M) the white keys an octave lower, for a left hand.
  var COMPUTER = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, z: -12, x: -10, c: -8, v: -7, b: -5, n: -3, m: -1 };

  // A page may hold several keyboards (a lesson has a play-along, an ear echo and a
  // check). Computer keys go to one: the one last touched or started, else the one
  // most in view, so a note typed for one block never lands in another.
  var boards = [];
  var activeBoard = null;
  function inView(el) {
    var r = el.getBoundingClientRect();
    var h = global.innerHeight || 0;
    var w = global.innerWidth || 0;
    return Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, w) - Math.max(r.left, 0));
  }
  function computerTarget() {
    boards = boards.filter(function (b) { return b.isConnected; });
    if (activeBoard && activeBoard.isConnected) return activeBoard;
    var best = null;
    var bestArea = 0;
    boards.forEach(function (b) { var a = inView(b); if (a > bestArea) { best = b; bestArea = a; } });
    return best;
  }

  function keyboard(container, opts) {
    styles();
    opts = opts || {};
    var from = opts.from || 60;
    var to = opts.to || 72;
    while (P.isBlack(from)) from--;
    while (P.isBlack(to)) to++;
    var kb = document.createElement('div');
    kb.className = TAG + '__kb';
    kb.setAttribute('role', 'group');
    kb.setAttribute('aria-label', 'Piano keyboard');
    var keys = {};
    var whiteIndex = 0;
    for (var m = from; m <= to; m++) {
      var k = document.createElement('button');
      k.type = 'button';
      k.dataset.midi = String(m);
      var name = P.midiToName(m);
      k.setAttribute('aria-label', name);
      if (P.isBlack(m)) {
        k.className = TAG + '__black ' + TAG + '__key';
        k.style.left = (whiteIndex * 38) + 'px';
        if (opts.labels === 'all') k.textContent = name.replace(/\d/, '');
      } else {
        k.className = TAG + '__white ' + TAG + '__key';
        if (opts.labels !== false && (opts.labels === 'all' || name[0] === 'C')) k.textContent = opts.labels === 'all' ? name.replace(/-?\d/, '') : name;
        whiteIndex++;
      }
      keys[m] = k;
      kb.appendChild(k);
    }
    container.appendChild(kb);

    function press(m, source) {
      var k = keys[m];
      if (k) { k.classList.add('is-down'); setTimeout(function () { k.classList.remove('is-down'); }, 140); }
      if (opts.sound !== false) synth.play(m, 500);
      if (opts.onPress) opts.onPress({ midi: m, velocity: null, time: now(), source: source || 'screen', confidence: 1 });
    }
    kb.addEventListener('pointerdown', function (e) {
      activeBoard = kb;
      var k = e.target.closest('[data-midi]');
      if (!k || opts.disabled) return;
      e.preventDefault();
      press(Number(k.dataset.midi));
    });
    // Touching anything in the block (a Start button, say) makes this the keyboard the computer keys play.
    if (opts.activateOn) opts.activateOn.addEventListener('pointerdown', function () { activeBoard = kb; });
    kb.addEventListener('keydown', function (e) {
      var k = e.target.closest('[data-midi]');
      if (k && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); press(Number(k.dataset.midi)); }
    });
    var firstC = from;
    while (P.pitchClass(firstC) !== 0 && firstC < to) firstC++;
    if (opts.computerFrom) firstC = opts.computerFrom - P.pitchClass(opts.computerFrom);
    function onComputerKey(e) {
      if (opts.disabled || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      var off = COMPUTER[String(e.key).toLowerCase()];
      if (off === undefined || !kb.isConnected || computerTarget() !== kb) return;
      var m = firstC + off;
      if (m >= from && m <= to) press(m, 'computer');
    }
    if (opts.computerKeys !== false) {
      boards.push(kb);
      document.addEventListener('keydown', onComputerKey);
    }

    return {
      element: kb,
      /** The first C the computer keys play (A is this C, Z the C an octave lower). */
      computerC: firstC,
      highlight: function (m, kind) { if (keys[m]) keys[m].classList.add('is-' + (kind || 'hint')); },
      clear: function (m) {
        var list = m === undefined ? Object.keys(keys) : [m];
        list.forEach(function (x) { if (keys[x]) keys[x].classList.remove('is-hint', 'is-right', 'is-wrong'); });
      },
      setDisabled: function (on) { opts.disabled = !!on; },
      /** Make this the keyboard the computer keys play. */
      activate: function () { activeBoard = kb; },
      destroy: function () {
        document.removeEventListener('keydown', onComputerKey);
        boards = boards.filter(function (b) { return b !== kb; });
        if (activeBoard === kb) activeBoard = null;
        if (kb.parentNode) kb.parentNode.removeChild(kb);
      },
    };
  }

  global.PolymathPianoIO = { midi: midi, mic: mic, synth: synth, keyboard: keyboard };
})(typeof window !== 'undefined' ? window : globalThis);
