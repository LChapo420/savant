/**
 * Piano logic for Polymath, shared by the server and the browser: note names,
 * microphone pitch detection, and scoring a played performance against a target.
 *
 * Everything here is pure: no audio devices, no DOM. The browser side
 * (piano-io.js) feeds it MIDI messages, microphone frames and on-screen key
 * presses; the server uses the same scoring to grade a played check, so the page
 * and the grader cannot disagree about what was played.
 *
 * Honesty about the microphone (research/02, "hardware honesty"): pitch from a
 * microphone is reliable for one note at a time at moderate speed. Chords, fast
 * passages, pedal and loudness are not, so every microphone result carries a
 * confidence and the scoring says when it is only an estimate. Musicality is never
 * scored here.
 *
 * Loaded in the browser it sets window.PolymathPiano.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PolymathPiano = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /** "C4" -> 60, "F#3" -> 54, "Bb2" -> 46. Middle C is C4. Null if unreadable. */
  function noteToMidi(name) {
    const m = /^([A-Ga-g])(##|#|bb|b|x)?(-?\d)$/.exec(String(name || '').trim());
    if (!m) return null;
    const acc = { '#': 1, '##': 2, x: 2, b: -1, bb: -2 }[m[2]] || 0;
    const midi = LETTER_PC[m[1].toUpperCase()] + acc + (Number(m[3]) + 1) * 12;
    return midi >= 0 && midi <= 127 ? midi : null;
  }

  /** 60 -> "C4" (sharps). */
  function midiToName(midi) {
    return NAMES_SHARP[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  const pitchClass = (midi) => ((midi % 12) + 12) % 12;
  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const isBlack = (midi) => [1, 3, 6, 8, 10].includes(pitchClass(midi));

  /**
   * The pitch in one frame of microphone audio, by the YIN method.
   *
   * @param {Float32Array} buf mono samples, about 2048-4096 long
   * @param {number} sampleRate e.g. 44100
   * @param {object} [opts] { minHz (default 55, A1), maxHz (4200), threshold (0.12), minRms (0.01) }
   * @returns {{hz:number, midi:number, cents:number, clarity:number}|null} null when silent or unclear
   */
  function detectPitch(buf, sampleRate, opts = {}) {
    // opts.decimate: halve the rate first (pairs averaged), a quarter of the work;
    // fine while half the rate stays well above twice maxHz.
    if (opts.decimate === 2 && sampleRate / 2 >= 2 * (opts.maxHz || 4200)) {
      const half = new Float32Array(buf.length >> 1);
      for (let i = 0; i < half.length; i++) half[i] = 0.5 * (buf[2 * i] + buf[2 * i + 1]);
      return detectPitch(half, sampleRate / 2, Object.assign({}, opts, { decimate: 0 }));
    }
    const minHz = opts.minHz || 55;
    const maxHz = opts.maxHz || 4200;
    const threshold = opts.threshold || 0.12;
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < (opts.minRms || 0.01)) return null;
    const maxTau = Math.min(Math.floor(buf.length / 2), Math.floor(sampleRate / minHz));
    const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
    const W = buf.length - maxTau;
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) {
        const diff = buf[j] - buf[j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    // Cumulative mean normalised difference.
    const cmnd = new Float32Array(maxTau + 1);
    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      running += d[tau];
      cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }
    let tau = -1;
    for (let t = minTau; t <= maxTau; t++) {
      if (cmnd[t] < threshold) {
        while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;
    // Parabolic interpolation around the minimum for sub-sample accuracy.
    let better = tau;
    if (tau > 1 && tau < maxTau) {
      const a = cmnd[tau - 1];
      const b = cmnd[tau];
      const c = cmnd[tau + 1];
      const denom = a + c - 2 * b;
      if (denom !== 0) better = tau + (a - c) / (2 * denom);
    }
    const hz = sampleRate / better;
    const exact = freqToMidi(hz);
    const midi = Math.round(exact);
    return { hz, midi, cents: Math.round((exact - midi) * 100), clarity: Math.max(0, Math.min(1, 1 - cmnd[tau])) };
  }

  /**
   * Turn a stream of pitch frames into notes: a note starts when a steady pitch
   * appears and ends when it changes or stops.
   *
   * @param {Array<{t:number, pitch:object|null}>} frames time in ms and detectPitch output
   * @param {object} [opts] { minFrames (3) }
   * @returns {Array<{midi:number, time:number, end:number, confidence:number, source:'mic'}>}
   */
  function framesToNotes(frames, opts = {}) {
    const minFrames = opts.minFrames || 3;
    const notes = [];
    let run = null;
    const close = (t) => {
      if (run && run.count >= minFrames) notes.push({ midi: run.midi, time: run.start, end: t, confidence: run.clarity / run.count, source: 'mic' });
      run = null;
    };
    for (const f of frames) {
      const p = f.pitch;
      if (!p || p.clarity < 0.6) { close(f.t); continue; }
      if (run && run.midi === p.midi) { run.count++; run.clarity += p.clarity; continue; }
      close(f.t);
      run = { midi: p.midi, start: f.t, count: 1, clarity: p.clarity };
    }
    close(frames.length ? frames[frames.length - 1].t : 0);
    return notes;
  }

  /**
   * Line up what was played with what was asked for (edit distance on pitch), so
   * one wrong or missed note does not count every note after it as wrong.
   *
   * @param {Array<{midi:number, beat?:number}>} target the notes asked for, in order
   * @param {Array<{midi:number, time?:number}>} played the notes played, in order
   * @param {object} [opts] { octaveFree: compare pitch classes only }
   * @returns {Array<{t:number|null, p:number|null}>} pairs of indexes; null = missed or extra
   */
  function align(target, played, opts = {}) {
    const same = (a, b) => (opts.octaveFree ? pitchClass(a) === pitchClass(b) : a === b);
    const n = target.length;
    const m = played.length;
    const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) D[i][0] = i;
    for (let j = 0; j <= m; j++) D[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const sub = same(target[i - 1].midi, played[j - 1].midi) ? 0 : 1;
        D[i][j] = Math.min(D[i - 1][j - 1] + sub, D[i - 1][j] + 1, D[i][j - 1] + 1);
      }
    }
    const pairs = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (same(target[i - 1].midi, played[j - 1].midi) ? 0 : 1)) {
        pairs.unshift({ t: i - 1, p: j - 1 });
        i--; j--;
      } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
        pairs.unshift({ t: i - 1, p: null });
        i--;
      } else {
        pairs.unshift({ t: null, p: j - 1 });
        j--;
      }
    }
    return pairs;
  }

  /**
   * Score a performance of a phrase: notes, timing and evenness, plus dynamics when
   * the input could measure them. What cannot be measured is reported as such.
   *
   * @param {Array<{midi:number, beat:number}>} target notes with their start beat
   * @param {Array<{midi:number, time:number, velocity?:number, confidence?:number, source?:string}>} played time in ms
   * @param {object} [opts] { tempo (bpm, default 80), octaveFree, toleranceMs }
   */
  function scorePerformance(target, played, opts = {}) {
    const tempo = opts.tempo || 80;
    const beatMs = 60000 / tempo;
    const pairs = align(target, played, opts);
    const same = (a, b) => (opts.octaveFree ? pitchClass(a) === pitchClass(b) : a === b);
    const matched = pairs.filter((x) => x.t !== null && x.p !== null && same(target[x.t].midi, played[x.p].midi));
    const wrong = pairs.filter((x) => x.t !== null && x.p !== null && !same(target[x.t].midi, played[x.p].midi)).map((x) => x.t);
    const missed = pairs.filter((x) => x.t !== null && x.p === null).map((x) => x.t);
    const extra = pairs.filter((x) => x.t === null).map((x) => x.p);
    const noteAccuracy = target.length ? matched.length / target.length : 0;

    // Timing: compare each onset with its beat, from `opts.origin` (the time of beat 0,
    // when a count-in set it) or else anchored on the first matched note.
    let timing = null;
    const timed = matched.filter((x) => typeof target[x.t].beat === 'number' && typeof played[x.p].time === 'number');
    if (timed.length >= 2) {
      const first = timed[0];
      const origin = typeof opts.origin === 'number' ? opts.origin : played[first.p].time - target[first.t].beat * beatMs;
      const tolerance = opts.toleranceMs || Math.max(80, beatMs * 0.15);
      const errors = timed.map((x) => played[x.p].time - (origin + target[x.t].beat * beatMs));
      const inTime = errors.filter((e) => Math.abs(e) <= tolerance).length;
      const late = timed.filter((x, k) => errors[k] > tolerance).map((x) => x.t);
      timing = {
        onBeatShare: inTime / timed.length,
        meanAbsMs: Math.round(errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length),
        rushing: errors.length > 2 && errors[errors.length - 1] < -tolerance,
        dragging: errors.length > 2 && errors[errors.length - 1] > tolerance,
        offBeatNotes: timed.filter((x, k) => Math.abs(errors[k]) > tolerance).map((x) => x.t),
        lateNotes: late,
      };
    }

    // Evenness: spread of the gaps between notes that should be equally spaced.
    let evenness = null;
    const gaps = [];
    for (let k = 1; k < timed.length; k++) {
      const db = target[timed[k].t].beat - target[timed[k - 1].t].beat;
      if (db > 0) gaps.push((played[timed[k].p].time - played[timed[k - 1].p].time) / db);
    }
    if (gaps.length >= 3) {
      const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) * (g - mean), 0) / gaps.length);
      evenness = { cv: Math.round((sd / mean) * 100) / 100, playedTempo: Math.round(60000 / mean) };
    }

    // Dynamics only from MIDI, which reports how hard each key went down.
    const velocities = matched.map((x) => played[x.p].velocity).filter((v) => typeof v === 'number');
    const dynamics = velocities.length >= 3 && played.every((p) => p.source === 'midi')
      ? { min: Math.min(...velocities), max: Math.max(...velocities), range: Math.max(...velocities) - Math.min(...velocities) }
      : null;
    // Loud and soft as marked (target notes with `dynamic`), by rank, from MIDI only.
    const marked = target.some((t) => DYNAMICS.includes(t.dynamic));
    const dynamicsCheck = marked && played.length && played.every((p) => p.source === 'midi') ? scoreDynamics(target, played, pairs) : null;
    const fromMic = played.some((p) => p.source === 'mic');
    const confidence = fromMic ? Math.round((played.reduce((s, p) => s + (p.confidence || 0), 0) / Math.max(1, played.length)) * 100) / 100 : 1;

    return {
      noteAccuracy: Math.round(noteAccuracy * 100) / 100,
      correct: matched.length,
      total: target.length,
      wrong, missed, extra,
      timing, evenness, dynamics, dynamicsCheck,
      estimated: fromMic,
      confidence,
      notMeasured: ['phrasing', 'tone', 'character'].concat(dynamics || dynamicsCheck ? [] : ['dynamics']).concat(fromMic ? ['pedalling'] : []),
    };
  }

  /** Same pitch classes, any order or octave: for "play the D major chord". */
  function samePitchClasses(a, b) {
    const set = (xs) => [...new Set(xs.map(pitchClass))].sort((x, y) => x - y).join(',');
    return set(a) === set(b);
  }

  /** "notes:60,64,67" or "C4 E4 G4" -> [60, 64, 67]. */
  function parseNotes(text) {
    const raw = String(text == null ? '' : text).trim().replace(/^notes:/i, '');
    if (!raw) return [];
    return raw.split(/[\s,]+/).filter(Boolean).map((t) => (/^-?\d+$/.test(t) ? Number(t) : noteToMidi(t))).filter((x) => Number.isInteger(x));
  }

  // ── Songs ──────────────────────────────────────────────────────────────────
  //
  // A song part is written compactly: tokens separated by spaces, bars by "|".
  // A token is a note ("E4"), a chord ("C3+E3+G3") or a rest ("r"), with its length
  // in beats after a colon ("D4:2", "E4:1.5"); no colon means one beat. The same part
  // may come as a list of {note, beats}, which is how a model writes one.

  /** One token or {note, beats} -> { midis: [..], names: [..], beats } or an error string. */
  function readToken(tok) {
    let text = tok;
    let beats = 1;
    if (tok && typeof tok === 'object') {
      text = String(tok.note == null ? '' : tok.note);
      beats = Number(tok.beats);
    } else {
      const m = /^([^:]+)(?::([0-9.]+))?$/.exec(String(tok));
      if (!m) return `"${tok}" is not a note`;
      text = m[1];
      beats = m[2] === undefined ? 1 : Number(m[2]);
    }
    if (!(beats > 0)) return `"${text}" has no length`;
    if (/^r(est)?$/i.test(text)) return { midis: [], names: [], beats };
    const names = text.split('+');
    const midis = names.map(noteToMidi);
    if (midis.some((x) => x === null)) return `"${text}" is not a note with an octave, like C4 or F#3`;
    return { midis, names, beats };
  }

  /**
   * A song part as events: [{ beat, beats, midis, names, bar }], plus the length of
   * every bar and anything unreadable.
   *
   * @param {string|Array} part compact text or a list of {note, beats}
   */
  function parsePart(part) {
    const events = [];
    const bars = [];
    const errors = [];
    let beat = 0;
    let barLen = 0;
    const closeBar = () => { bars.push(barLen); barLen = 0; };
    const tokens = Array.isArray(part) ? part : String(part || '').split(/\s+/).filter(Boolean);
    tokens.forEach((tok) => {
      if (tok === '|') { closeBar(); return; }
      const t = readToken(tok);
      if (typeof t === 'string') { errors.push(t); return; }
      if (t.midis.length) events.push({ beat, beats: t.beats, midis: t.midis, names: t.names, bar: bars.length });
      beat += t.beats;
      barLen += t.beats;
    });
    if (barLen > 0 || !bars.length) closeBar();
    return { events, bars, errors, length: beat };
  }

  /**
   * What the learner plays for a choice of hands: `steps` (notes that start together,
   * in order, for learn mode), `target` (every note with its beat, for scoring), and
   * the part the app plays alongside.
   *
   * @param {{rh, lh}} song parts in either form
   * @param {'right'|'left'|'both'} hands
   */
  function songParts(song, hands) {
    const rh = parsePart(song.rh);
    const lh = parsePart(song.lh);
    const mine = hands === 'left' ? [lh] : hands === 'both' ? [rh, lh] : [rh];
    const other = hands === 'left' ? rh : hands === 'both' ? null : lh;
    const byBeat = new Map();
    mine.forEach((part, k) => part.events.forEach((e) => {
      const key = Math.round(e.beat * 1000);
      if (!byBeat.has(key)) byBeat.set(key, { beat: e.beat, midis: [], hands: [] });
      const step = byBeat.get(key);
      e.midis.forEach((m) => { step.midis.push(m); step.hands.push(mine.length === 2 ? (k === 0 ? 'right' : 'left') : hands); });
    }));
    const steps = [...byBeat.values()].sort((a, b) => a.beat - b.beat);
    const target = [];
    steps.forEach((s) => s.midis.slice().sort((a, b) => a - b).forEach((m) => target.push({ midi: m, beat: s.beat })));
    return { steps, target, other: other ? other.events : [], length: Math.max(rh.length, lh.length) };
  }

  /**
   * Learn mode: the app waits at each step until all its keys are pressed. Replays the
   * presses against the steps; a press that is not one of the waiting keys is a slip.
   *
   * @param {Array<{midis:number[]}>} steps
   * @param {Array<{midi:number}>} presses in order
   * @param {object} [opts] { octaveFree }
   */
  function learnScore(steps, presses, opts = {}) {
    const same = (a, b) => (opts.octaveFree ? pitchClass(a) === pitchClass(b) : a === b);
    const total = steps.reduce((n, s) => n + s.midis.length, 0);
    let at = 0;
    let waiting = steps.length ? steps[0].midis.slice() : [];
    let right = 0;
    let wrong = 0;
    for (const p of presses) {
      if (at >= steps.length) break;
      const k = waiting.findIndex((m) => same(m, p.midi));
      if (k === -1) { wrong++; continue; }
      waiting.splice(k, 1);
      right++;
      if (!waiting.length) {
        at++;
        waiting = at < steps.length ? steps[at].midis.slice() : [];
      }
    }
    return { total, right, wrong, steps: at, done: at >= steps.length };
  }

  /**
   * Play mode: score a timed take of a song. Notes that start together may be played
   * in any order, so each is ordered by pitch on both sides before they are lined up.
   *
   * @param {Array<{midi, beat}>} target from songParts
   * @param {Array<{midi, time}>} played time in ms from beat 0
   * @param {object} opts { tempo, octaveFree }
   */
  function scoreSong(target, played, opts = {}) {
    const sorted = played.slice().sort((a, b) => a.time - b.time);
    const ordered = [];
    for (let i = 0; i < sorted.length;) {
      let j = i + 1;
      while (j < sorted.length && sorted[j].time - sorted[i].time <= 60) j++;
      sorted.slice(i, j).sort((a, b) => a.midi - b.midi).forEach((x) => ordered.push(x));
      i = j;
    }
    return scorePerformance(target, ordered, { tempo: opts.tempo, octaveFree: opts.octaveFree, origin: 0, toleranceMs: opts.toleranceMs });
  }

  /**
   * Stars, 0 to 3, from a learn-mode or play-mode result.
   *   learn: the share of the song reached times the share of presses that were right.
   *   play:  60% notes (correct over target plus half the extra notes) and 40% timing
   *          (the share of matched notes on the beat).
   * 3 stars from 0.9, 2 from 0.75, 1 from 0.5. Learn mode, which waits, and play mode
   * at half speed earn at most 2: the third star is for playing it in time at medium
   * or full speed.
   */
  function songStars(mode, r, opts = {}) {
    const out = songStarsRaw(mode, r);
    const cap = mode === 'learn' || (opts.speed && opts.speed < 0.75) ? 2 : 3;
    return Object.assign(out, { stars: Math.min(out.stars, cap), capped: out.stars > cap });
  }

  function songStarsRaw(mode, r) {
    let notes;
    let timing = null;
    let score;
    if (mode === 'learn') {
      notes = r.total ? (r.right / r.total) * (r.right / Math.max(1, r.right + r.wrong)) : 0;
      score = notes;
    } else {
      notes = r.total ? Math.min(1, r.correct / (r.total + 0.5 * r.extra.length)) : 0;
      timing = r.timing ? r.timing.onBeatShare : 0;
      score = 0.6 * notes + 0.4 * timing;
    }
    const round = (x) => Math.round(x * 100) / 100;
    return {
      stars: score >= 0.9 ? 3 : score >= 0.75 ? 2 : score >= 0.5 ? 1 : 0,
      score: round(score),
      notes: round(notes),
      timing: timing === null ? null : round(timing),
    };
  }

  // Chord symbols for a song's backing: "C", "Am", "G7", "Dm7/C", "F#", "Bm", "D#m".
  const QUALITIES = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], aug: [0, 4, 8], sus4: [0, 5, 7] };

  /** A chord symbol -> { bass, midis } voiced low (bass in octave 2, chord from octave 3), or null. */
  function chordMidis(symbol) {
    const m = /^([A-G])(#|b)?(maj7|m7|sus4|dim|aug|m|7)?(?:\/([A-G])(#|b)?)?$/.exec(String(symbol || '').trim());
    if (!m) return null;
    const pc = (letter, acc) => (LETTER_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
    const root = 48 + pc(m[1], m[2]);
    const midis = QUALITIES[m[3] || ''].map((i) => root + i);
    const bass = 36 + (m[4] ? pc(m[4], m[5]) : pc(m[1], m[2]));
    return { bass, midis };
  }

  /**
   * A song's chord line -> [{ beat, beats, symbol, bass, midis }]. Bars are split by
   * "|"; chords in one bar share it evenly; "-" is a bar (or part) with no chord.
   */
  function parseChords(text, beatsPerBar, pickup) {
    const out = [];
    const errors = [];
    let beat = 0;
    String(text || '').split('|').map((b) => b.trim()).forEach((bar, i) => {
      const len = i === 0 && pickup ? pickup : beatsPerBar;
      const symbols = bar.split(/\s+/).filter(Boolean);
      symbols.forEach((s, k) => {
        const each = len / symbols.length;
        if (s !== '-') {
          const c = chordMidis(s);
          if (!c) errors.push(`"${s}" is not a chord symbol`);
          else out.push({ beat: beat + k * each, beats: each, symbol: s, bass: c.bass, midis: c.midis });
        }
      });
      beat += len;
    });
    return { chords: out, errors };
  }

  // ── Hearing notes the app expects (chords from the microphone) ─────────────
  //
  // YIN hears one pitch. Given a chord it returns the notes' common period, a low
  // note nobody played (C4 E4 G4 reads as C2), so a chord from the microphone came
  // out as one wrong note. The app always knows what should be played next, so it
  // does not transcribe blind: it asks "are these notes sounding?" Each candidate
  // note gets a harmonic-sum salience (its first six partials, allowing for the
  // stretched partials of a piano string), and a note counts as sounding when it
  // stands out from both neighbouring semitones and is not buried under the
  // loudest note. Score-informed checking, after Benetos, Klapuri and Dixon
  // (EUSIPCO 2012) and Klapuri's harmonic sum (ISMIR 2006). Our own code.

  const fftCache = {};
  /** Radix-2 FFT tables for size n (a power of two). */
  function fftTables(n) {
    if (fftCache[n]) return fftCache[n];
    const rev = new Uint32Array(n);
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      rev[i] = j;
    }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos((2 * Math.PI * k) / n); sin[k] = -Math.sin((2 * Math.PI * k) / n); }
    fftCache[n] = { rev, cos, sin };
    return fftCache[n];
  }

  /**
   * Magnitude spectrum of one frame: Hann window, zero-padded to twice the frame
   * (rounded up to a power of two) for finer bins.
   * @returns {{mag: Float64Array, binHz: number, max: number}}
   */
  function spectrum(buf, sampleRate) {
    let n = 1;
    while (n < buf.length * 2) n <<= 1;
    const { rev, cos, sin } = fftTables(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const L = buf.length;
    for (let i = 0; i < L; i++) re[rev[i]] = buf[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1)));
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step];
          const wi = sin[k * step];
          const a = i + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
    const mag = new Float64Array(n / 2);
    let max = 0;
    for (let i = 0; i < n / 2; i++) { mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]); if (mag[i] > max) max = mag[i]; }
    return { mag, binHz: sampleRate / n, max };
  }

  /**
   * The highest spectral peak (a bin above both its neighbours) between two
   * frequencies, or 0. Only true peaks count: the skirt of a loud partial a
   * semitone away slopes through the range without peaking in it.
   */
  function peakBetween(spec, loHz, hiHz) {
    const lo = Math.max(1, Math.floor(loHz / spec.binHz));
    const hi = Math.min(spec.mag.length - 2, Math.ceil(hiHz / spec.binHz));
    const mag = spec.mag;
    let pk = 0;
    for (let b = lo; b <= hi; b++) if (mag[b] > pk && mag[b] >= mag[b - 1] && mag[b] >= mag[b + 1]) pk = mag[b];
    return pk;
  }

  /** Harmonic-sum salience of a MIDI note: partials 1-6 (to 8 kHz), each weighted 1/sqrt(k), a little sharp allowed. */
  function noteSalience(spec, m) {
    const f0 = midiToFreq(m);
    let s = 0;
    for (let k = 1; k <= 6; k++) {
      const f = k * f0;
      if (f > 8000) break;
      s += peakBetween(spec, f * Math.pow(2, -35 / 1200), f * Math.pow(2, 45 / 1200)) / Math.sqrt(k);
    }
    return s;
  }

  /**
   * Are the expected notes sounding in this frame?
   *
   * @param {Float32Array} buf mono samples, about 4096 (85 ms at 48 kHz), taken a
   *   few tens of ms after the notes start, past the hammer noise
   * @param {number} sampleRate
   * @param {number[]} expected MIDI notes that should be sounding
   * @param {object} [opts] { octaveFree: any octave within one either side counts,
   *   ratio (1.1): how far a note must stand above its neighbouring semitones,
   *   floor (0.1): share of the strongest note's salience it must reach }
   * @returns {{ok:boolean, present:number[], missing:number[], extra:number[], heard:object}}
   *   `present` and `missing` are the expected notes; `extra` strong notes that
   *   were not expected and are not a partial of one that was; `heard` maps each
   *   present expected note to the key that was heard (another octave when octaveFree).
   */
  function hearNotes(buf, sampleRate, expected, opts = {}) {
    const ratio = opts.ratio || 1.1;
    const floor = opts.floor || 0.1;
    const want = [...new Set((expected || []).filter((m) => Number.isInteger(m) && m >= 21 && m <= 108))];
    const out = { ok: false, present: [], missing: [], extra: [], heard: {} };
    if (!want.length) return out;
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    if (Math.sqrt(rms / buf.length) < (opts.minRms || 0.003)) { out.missing = want; return out; }
    const spec = opts.spec || spectrum(buf, sampleRate);
    const lo = Math.max(20, Math.min(...want) - 13);
    const hi = Math.min(109, Math.max(...want) + 13);
    const sal = {};
    for (let m = lo; m <= hi; m++) sal[m] = noteSalience(spec, m);
    let max = 0;
    for (let m = lo + 1; m < hi; m++) if (sal[m] > max) max = sal[m];
    // Some of a note's evidence must be its own: partials that no other expected
    // note shares. Otherwise the partials of the notes around it add up to it (C3's
    // third and sixth partials are G3's second and fourth), and a chord with a note
    // left out would pass. A note whose partials are all shared (an octave doubling)
    // cannot be told apart, and is taken as heard.
    const uniqueShare = opts.uniqueShare == null ? 0.15 : opts.uniqueShare;
    const shared = (f, others) => others.some((o) => {
      const fo = midiToFreq(o);
      const k = Math.round(f / fo);
      return k >= 1 && k <= 12 && Math.abs(1200 * Math.log2(f / (k * fo))) < 50;
    });
    const own = (m) => {
      const others = want.filter((w) => w !== m && Math.abs(w - m) !== 12);
      const f0 = midiToFreq(m);
      let mine = 0;
      let all = 0;
      let possible = 0;
      for (let k = 1; k <= 6; k++) {
        const f = k * f0;
        if (f > 8000) break;
        const v = peakBetween(spec, f * Math.pow(2, -35 / 1200), f * Math.pow(2, 45 / 1200)) / Math.sqrt(k);
        all += v;
        if (!shared(f, others)) { mine += v; possible++; }
      }
      return possible === 0 || (all > 0 && mine >= uniqueShare * all && mine > 0);
    };
    const sounding = (m) => sal[m] !== undefined && sal[m - 1] !== undefined && sal[m + 1] !== undefined
      && sal[m] > floor * max && sal[m] > ratio * sal[m - 1] && sal[m] > ratio * sal[m + 1] && own(m);
    want.forEach((m) => {
      let hit = sounding(m) ? m : null;
      if (hit === null && opts.octaveFree) hit = [m - 12, m + 12].find(sounding) || null;
      if (hit !== null) { out.present.push(m); out.heard[m] = hit; } else out.missing.push(m);
    });
    // A strong note that was not expected and is no partial of an expected one: a wrong key.
    const partialOf = (m) => want.some((w) => {
      const r = midiToFreq(m) / midiToFreq(w);
      const k = Math.round(r);
      return k >= 1 && k <= 6 && Math.abs(1200 * Math.log2(r / k)) < 60;
    });
    const weakest = Math.min(...out.present.map((m) => sal[out.heard[m]]).concat([max]));
    for (let m = lo + 1; m < hi; m++) {
      if (want.includes(m) || Object.values(out.heard).includes(m)) continue;
      if (sounding(m) && sal[m] >= 0.6 * weakest && !partialOf(m)) out.extra.push(m);
    }
    out.ok = out.missing.length === 0;
    return out;
  }

  /**
   * Is a YIN pitch a real note, or the ghost a chord makes? A real note has energy
   * at its own frequency, or (a bass note with a weak fundamental) at both its
   * second and third partials. The ghost of a chord (C2 under C4 E4 G4) has none
   * of these: its "partials" 4, 5 and 6 are the chord's notes.
   */
  function pitchIsReal(spec, hz, opts = {}) {
    const share = opts.share || 0.06;
    const at = (f) => peakBetween(spec, f * Math.pow(2, -40 / 1200), f * Math.pow(2, 40 / 1200)) >= share * spec.max;
    return at(hz) || (at(2 * hz) && at(3 * hz));
  }

  /**
   * Note starts, to the millisecond, from a stream of samples. Works on blocks of
   * about 1.3 ms: the energy of the sample-to-sample change (high frequencies,
   * where a hammer strike is loud and a held note is quiet), in dB, against its
   * own level over the 40 ms before. A rise of `riseDb` is a note start; the start
   * is then walked back to where the rise began. Pure: the AudioWorklet runs it on
   * the audio thread and the tests run it on recordings.
   *
   *   const det = createOnsetDetector(48000);
   *   det.push(samples, firstSampleIndex) -> [{ sample, strength }]
   */
  function createOnsetDetector(sampleRate, opts = {}) {
    const B = opts.block || (sampleRate > 60000 ? 128 : 64);
    // The hammer channel needs a bigger rise than the level: a held note's high partials flicker.
    const riseDb = [opts.riseDb || 7, opts.levelRiseDb || 4];
    // A softer rise in the hammer channel (a key struck under the pedal, over strings
    // still ringing) is reported as a weak start: the note listener keeps it only when
    // a note's own partials are seen to grow there. null turns weak starts off.
    const weakDb = opts.weakDb === undefined ? 4.5 : opts.weakDb;
    const startDb = opts.startDb || 3;
    const floorDb = opts.floorDb == null ? -75 : opts.floorDb;
    const refractory = Math.round(((opts.refractoryMs || 60) / 1000) * sampleRate / B);
    const histLen = Math.max(8, Math.round((0.04 * sampleRate) / B));
    const gap = Math.max(2, Math.round((0.008 * sampleRate) / B));
    // The level must also beat its peak over the last 300 ms: a piano note's level
    // dips and swells as its strings beat, and the swell is not a new note.
    const longLen = Math.max(histLen, Math.round((0.3 * sampleRate) / B));
    const size = longLen + gap + 16;
    // Two channels: the change from sample to sample (high frequencies: the hammer)
    // and the plain level (a low note or chord in a noisy room rises there first).
    const rings = [new Float64Array(size).fill(-120), new Float64Array(size).fill(-120)];
    const acc = [0, 0];
    let filled = 0;
    let blockIndex = 0;
    let accN = 0;
    let lastX = 0;
    let blockStart = 0;
    let quietUntil = -1;
    // A weak start waits a few ms: if the rise goes on to the full bar, it is a normal start.
    let pendingWeak = null;
    let weakQuiet = -1; // weak starts keep their own quiet spell: they never hold back a normal start
    const weakHold = Math.max(2, Math.round(((Number(opts.weakHoldMs) || 10) / 1000) * sampleRate / B));
    const L = (c, k) => rings[c][((k % size) + size) % size];
    function closeBlock(found) {
      const levels = acc.map((a) => 10 * Math.log10(a / B + 1e-12));
      rings[0][blockIndex % size] = levels[0];
      rings[1][blockIndex % size] = levels[1];
      filled++;
      if (filled > histLen + gap && blockIndex > quietUntil) {
        let best = null;
        let weakBase = null;
        let fresh = 0;
        const rises = [0, 0];
        for (let c = 0; c < 2; c++) {
          // The hammer channel against its mean over the last 40 ms; the level against
          // its highest point then, so a slow swell of beating strings does not count.
          let base = c === 0 ? 0 : -Infinity;
          for (let k = blockIndex - gap - histLen; k < blockIndex - gap; k++) base = c === 0 ? base + L(c, k) : Math.max(base, L(c, k));
          if (c === 0) base /= histLen;
          const rise = levels[c] - base;
          rises[c] = rise;
          if (c === 1) {
            // Optionally, a level rise needs some rise in the hammer channel too.
            if (rises[0] < (opts.levelNeedsAttackDb == null ? 0 : opts.levelNeedsAttackDb)) continue;
            let peak = -Infinity;
            for (let k = blockIndex - gap - longLen; k < blockIndex - gap; k++) peak = Math.max(peak, L(1, k));
            fresh = levels[1] - peak;
            if (fresh < (opts.freshDb == null ? -6 : opts.freshDb)) continue;
          }
          if (levels[c] > floorDb && rise >= riseDb[c] && (!best || rise - riseDb[c] > best.rise - riseDb[best.c])) best = { c, base, rise };
          if (c === 0 && weakDb !== null && levels[0] > floorDb && rise >= weakDb && rise < riseDb[0]) weakBase = base;
        }
        if (!best && weakBase !== null) best = { c: 0, base: weakBase, rise: rises[0], weak: true };
        if (best) {
          // Walk back to where the rise began (at most 12 ms).
          let j = blockIndex;
          const back = Math.round((0.012 * sampleRate) / B);
          while (j > blockIndex - back && L(best.c, j - 1) - best.base > startDb) j--;
          const o = { sample: blockStart - (blockIndex - j) * B, strength: Math.round(best.rise * 10) / 10, levelRise: Math.round(rises[1] * 10) / 10, louder: Math.round(fresh * 10) / 10, channel: best.c ? 'level' : 'attack' };
          if (best.weak) {
            if (!pendingWeak && blockIndex > weakQuiet) pendingWeak = { o: { ...o, weak: true }, until: blockIndex + weakHold };
            else if (pendingWeak && o.strength > pendingWeak.o.strength) pendingWeak.o.strength = o.strength;
          } else {
            pendingWeak = null;
            found.push(o);
            quietUntil = blockIndex + refractory;
          }
        }
      }
      if (pendingWeak && blockIndex >= pendingWeak.until) {
        found.push(pendingWeak.o);
        pendingWeak = null;
        weakQuiet = blockIndex + refractory;
      }
      blockIndex++;
      acc[0] = 0;
      acc[1] = 0;
      accN = 0;
    }
    return {
      block: B,
      push(samples, first) {
        const found = [];
        for (let i = 0; i < samples.length; i++) {
          if (accN === 0) blockStart = first + i;
          const x = samples[i];
          const d = x - lastX;
          lastX = x;
          acc[0] += d * d;
          acc[1] += x * x;
          accN++;
          if (accN === B) closeBlock(found);
        }
        return found;
      },
    };
  }

  /**
   * The microphone tap the AudioWorklet runs: keeps the last few thousand samples,
   * finds note starts, and hands out frames to judge. Messages:
   *   { type: 'onset', sample, strength }            a note started at this sample
   *   { type: 'attack', sample, end, buf, pre }      the frame `attackDelayMs` after that start, and the frame before it
   *   { type: 'frame', end, buf }                    every `hop` samples, the newest frame
   * Sample indexes count from the start of the stream (the audio clock times the rate).
   */
  function createMicTap(sampleRate, opts = {}) {
    const N = opts.frame || 4096;
    const hop = opts.hop || 2048;
    const delay = Math.round(((opts.attackDelayMs == null ? 30 : opts.attackDelayMs) / 1000) * sampleRate);
    const size = 1 << Math.ceil(Math.log2(N * 4));
    const ring = new Float32Array(size);
    const det = createOnsetDetector(sampleRate, opts.onset || {});
    let written = 0;
    let sinceHop = 0;
    let pending = [];
    function copy(end) {
      const out = new Float32Array(N);
      for (let i = 0; i < N; i++) out[i] = ring[(end - N + i) & (size - 1)];
      return out;
    }
    return {
      process(samples, first) {
        const msgs = [];
        // The audio clock's sample number when given (the worklet's currentFrame), so a
        // dropped block cannot shift every later time.
        const start = typeof first === 'number' ? first : written;
        for (let i = 0; i < samples.length; i++) ring[(start + i) & (size - 1)] = samples[i];
        det.push(samples, start).forEach((o) => {
          msgs.push({ type: 'onset', sample: o.sample, strength: o.strength, levelRise: o.levelRise, louder: o.louder, ...(o.weak ? { weak: true } : {}) });
          pending.push(o.sample);
        });
        written = start + samples.length;
        pending = pending.filter((s) => {
          const end = s + delay + N;
          if (written < end) return true;
          // The frame after the start, and the one just before it: what is new is the difference.
          if (written - end < size - 2 * N) msgs.push({ type: 'attack', sample: s, end, buf: copy(end), pre: copy(s) });
          return false;
        });
        sinceHop += samples.length;
        if (sinceHop >= hop && written >= N) {
          sinceHop = 0;
          msgs.push({ type: 'frame', end: written, buf: copy(written) });
        }
        return msgs;
      },
      get written() { return written; },
    };
  }

  /**
   * Turns the tap's messages into notes: each note start is judged on its attack
   * frame (the expected notes, when there are any, by hearNotes; otherwise one
   * pitch by YIN, with the chord ghost refused); a pitch that appears with no
   * start heard (a soft legato note) is reported from the running frames, as
   * before. Every note carries the sample where it started.
   *
   *   const L = createNoteListener(48000, { expected: (sample) => [60, 64, 67], octaveFree, onNote });
   *   L.message(msg)  // each message from createMicTap
   *   onNote({ midi, sample, confidence, cents?, chord?, how: 'onset'|'held' })
   */
  function createNoteListener(sampleRate, opts = {}) {
    const minRms = opts.minRms || 0.012;
    const userOnNote = opts.onNote || function () {};
    // When each key was last reported: a weak start never reports a key again within
    // `weakRepeatMs` (a held chord's beating is not the key struck again).
    const lastAt = {};
    const onNote = (n) => { lastAt[n.midi] = n.sample; userOnNote(n); };
    const repeatGap = ((opts.weakRepeatMs == null ? 300 : opts.weakRepeatMs) / 1000) * sampleRate;
    const fresh = (m, sample) => lastAt[m] === undefined || sample - lastAt[m] > repeatGap;
    const attackDelay = Math.round(((opts.attackDelayMs == null ? 30 : opts.attackDelayMs) / 1000) * sampleRate);
    let last = null;
    let held = 0;
    let reported = null;
    let quietFrames = 0;
    let prevEnd = null;
    // Note starts heard, waiting for their attack frame or for a pitch to claim them.
    let starts = [];
    const stats = { onsets: 0, ghosts: 0, chords: 0, held: 0, late: 0 };
    function single(buf, spec) {
      const p = detectPitch(buf, sampleRate, { minRms, decimate: 2 });
      if (!p || p.clarity < 0.7) return null;
      if (!pitchIsReal(spec, p.hz)) { stats.ghosts++; return { ghost: true, p }; }
      return { p };
    }
    function claim(sample) { starts.forEach((s) => { if (s.sample === sample) s.claimed = true; }); }
    /**
     * The note that came in at a start: the one whose salience grew most from the
     * frame before the start to the frame after it. Older notes still ringing do
     * not grow, so this finds a new note YIN cannot pick out of the mixture.
     */
    function newestNote(pre, buf, specAfter) {
      if (!pre) return null;
      const specBefore = spectrum(pre, sampleRate);
      const gain = {};
      let top = 0;
      for (let m = 27; m <= 101; m++) {
        const after = noteSalience(specAfter, m);
        gain[m] = after - noteSalience(specBefore, m);
        if (after > top) top = after;
      }
      let best = null;
      for (let m = 28; m <= 100; m++) {
        if (gain[m] <= 0.25 * top || gain[m] <= 1.1 * gain[m - 1] || gain[m] <= 1.1 * gain[m + 1]) continue;
        if (!pitchIsReal(specAfter, midiToFreq(m), { share: 0.04 })) continue;
        if (!best || gain[m] > gain[best]) best = m;
      }
      return best;
    }
    /** Notes among `cands` whose own salience grew across the start (struck there, not still ringing). */
    function grew(pre, specAfter, cands) {
      if (!pre) return [];
      const specBefore = spectrum(pre, sampleRate);
      let top = 0;
      for (let m = 27; m <= 101; m++) top = Math.max(top, noteSalience(specAfter, m));
      return cands.filter((m) => {
        const after = noteSalience(specAfter, m);
        const before = noteSalience(specBefore, m);
        return after >= 0.1 * top && after - before >= (opts.weakGrowth || 0.5) * after;
      });
    }
    function attack(msg) {
      const want = (opts.expected ? opts.expected(msg.sample) : null) || [];
      const spec = spectrum(msg.buf, sampleRate);
      const st0 = starts.find((x) => x.sample === msg.sample);
      if (st0 && st0.weak && starts.some((x) => !x.weak && x.sample > msg.sample && x.sample - msg.sample < 0.1 * sampleRate)) return;
      if (st0 && st0.weak) {
        // A chord is struck, not slipped in under the pedal: while a chord is expected,
        // weak starts are left alone (a held chord's beating must not read as a new one).
        if (want.length >= 2) return;
        // A weak start (under the pedal): only a note that grew here is new.
        const cands = want.length ? [...new Set(want.concat(opts.octaveFree ? want.flatMap((m) => [m - 12, m + 12]) : []))] : null;
        if (cands) {
          const g = grew(msg.pre, spec, cands);
          const hit = want.filter((m) => fresh(m, msg.sample) && (g.includes(m) || (opts.octaveFree && (g.includes(m - 12) || g.includes(m + 12)))));
          if (!hit.length) return;
          const h = hearNotes(msg.buf, sampleRate, hit, { octaveFree: opts.octaveFree, spec });
          if (!h.present.length) return;
          claim(msg.sample);
          stats.weak = (stats.weak || 0) + 1;
          h.present.forEach((m) => onNote({ midi: m, sample: msg.sample, confidence: 0.5, chord: want.length >= 2, how: 'onset', weak: true }));
          h.present.forEach((m) => { lastAt[h.heard[m]] = msg.sample; });
          reported = h.present.length === 1 ? h.present[0] : reported;
          return;
        }
        const m = newestNote(msg.pre, msg.buf, spec);
        if (m === null || m === reported || !fresh(m, msg.sample) || !grew(msg.pre, spec, [m]).length) return;
        claim(msg.sample);
        reported = m;
        stats.weak = (stats.weak || 0) + 1;
        onNote({ midi: m, sample: msg.sample, confidence: 0.5, how: 'onset', weak: true });
        return;
      }
      if (want.length >= 2) {
        const h = hearNotes(msg.buf, sampleRate, want, { octaveFree: opts.octaveFree, spec });
        if (h.present.length) {
          stats.chords++;
          claim(msg.sample);
          // Strong notes that were not expected ride along as `extra`, for display only:
          // a doubled bass or a partial must never be marked as a wrong key.
          h.present.forEach((m) => onNote({ midi: m, sample: msg.sample, confidence: h.ok ? 0.8 : 0.6, chord: true, how: 'onset', extra: h.extra }));
          const s = single(msg.buf, spec);
          reported = s && !s.ghost ? s.p.midi : null;
          return;
        }
      }
      const s = single(msg.buf, spec);
      const st = starts.find((x) => x.sample === msg.sample);
      // The note already sounding, heard again after a click or its strings' beating:
      // no new note unless the sound got louder than it was, as a key struck again makes it.
      const stale = s && !s.ghost && s.p.midi === reported && st && !st.fresh;
      if ((!s || s.ghost || stale) && !want.length) {
        // YIN found nothing new: a note played over others still ringing, or one note
        // of a chord. Report the note that grew, a real key, never the chord's ghost.
        const m = newestNote(msg.pre, msg.buf, spec);
        if (m !== null && !(m === reported && st && !st.fresh)) {
          claim(msg.sample);
          reported = m;
          stats.newest = (stats.newest || 0) + 1;
          onNote({ midi: m, sample: msg.sample, confidence: 0.6, how: 'onset' });
        }
        return;
      }
      if (stale) return;
      if (s && !s.ghost) {
        claim(msg.sample);
        reported = s.p.midi;
        last = s.p.midi;
        held = 2;
        onNote({ midi: s.p.midi, sample: msg.sample, confidence: Math.round(s.p.clarity * 100) / 100, cents: s.p.cents, how: 'onset' });
        return;
      }
      if (want.length === 1) {
        const h = hearNotes(msg.buf, sampleRate, want, { octaveFree: opts.octaveFree, spec });
        if (h.ok && !(want[0] === reported && st && !st.fresh)) { claim(msg.sample); reported = want[0]; onNote({ midi: want[0], sample: msg.sample, confidence: 0.6, how: 'onset' }); }
      }
    }
    function frame(msg) {
      const N = msg.buf.length;
      const hop = prevEnd === null ? N / 2 : msg.end - prevEnd;
      prevEnd = msg.end;
      let rms = 0;
      for (let i = 0; i < N; i++) rms += msg.buf[i] * msg.buf[i];
      rms = Math.sqrt(rms / N);
      if (rms < 0.008) { quietFrames++; if (quietFrames >= 2) reported = null; } else quietFrames = 0;
      starts = starts.filter((s) => msg.end - s.sample < sampleRate);
      // A start whose attack frame has not been judged yet speaks first.
      if (starts.some((s) => !s.judged && msg.end < s.sample + attackDelay + N + hop)) return;
      const spec = spectrum(msg.buf, sampleRate);
      const s = single(msg.buf, spec);
      if (!s || s.ghost) { held = 0; last = null; return; }
      if (last === s.p.midi) held++; else { last = s.p.midi; held = 1; }
      if (held === 2 && reported !== s.p.midi) {
        reported = s.p.midi;
        // A start heard but not yet given a note is this note's start; else the
        // best guess is a little over half a frame before the earlier frame ended.
        const firstEnd = msg.end - hop;
        const open = starts.filter((x) => !x.claimed && x.sample >= firstEnd - N - 0.15 * sampleRate && x.sample <= msg.end);
        const start = open.length ? open[open.length - 1].sample : Math.round(firstEnd - 0.6 * N);
        if (open.length) { claim(start); stats.late++; } else stats.held++;
        onNote({ midi: s.p.midi, sample: start, confidence: Math.round(s.p.clarity * 80) / 100, cents: s.p.cents, how: open.length ? 'onset' : 'held' });
      }
    }
    return {
      message(msg) {
        if (!msg) return;
        if (msg.type === 'onset') { stats.onsets++; starts.push({ sample: msg.sample, claimed: false, judged: false, weak: !!msg.weak, levelRise: msg.levelRise == null ? 99 : msg.levelRise, fresh: msg.louder == null || msg.louder >= -4 }); }
        else if (msg.type === 'attack') { starts.forEach((s) => { if (s.sample === msg.sample) s.judged = true; }); attack(msg); }
        else if (msg.type === 'frame') frame(msg);
      },
      stats,
    };
  }

  // ── Dynamics and pedalling, from MIDI ───────────────────────────────────────

  const DYNAMICS = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];

  /**
   * Did the louder markings come out louder? MIDI velocity is exact, but its scale
   * differs from keyboard to keyboard, so markings are graded by rank, not by
   * number: the notes marked f must average higher than those marked p, by at least
   * `step` (8 of 127) per step of marking apart, capped at 20.
   *
   * @param {Array<{midi, beat, dynamic?}>} target
   * @param {Array<{midi, velocity?, source?}>} played
   * @param {Array<{t, p}>} pairs from align(target, played)
   * @returns {null|{ok, levels:[{mark, mean, n}], flat:[[soft, loud]]}} null when nothing is marked or not MIDI
   */
  function scoreDynamics(target, played, pairs, opts = {}) {
    const step = opts.step || 8;
    const groups = {};
    pairs.forEach((x) => {
      if (x.t === null || x.p === null) return;
      const mark = target[x.t].dynamic;
      const v = played[x.p].velocity;
      if (!DYNAMICS.includes(mark) || typeof v !== 'number' || played[x.p].source !== 'midi') return;
      (groups[mark] = groups[mark] || []).push(v);
    });
    const levels = DYNAMICS.filter((m) => groups[m]).map((m) => ({ mark: m, mean: Math.round(groups[m].reduce((s, v) => s + v, 0) / groups[m].length), n: groups[m].length }));
    if (levels.length < 2) return null;
    const flat = [];
    for (let i = 1; i < levels.length; i++) {
      const apart = DYNAMICS.indexOf(levels[i].mark) - DYNAMICS.indexOf(levels[i - 1].mark);
      if (levels[i].mean - levels[i - 1].mean < Math.min(20, step * apart)) flat.push([levels[i - 1].mark, levels[i].mark]);
    }
    return { ok: flat.length === 0, levels, flat };
  }

  /**
   * Legato ("syncopated") pedalling against the harmony changes: at each change the
   * pedal comes up as the new notes sound (from `before` ms ahead to `lift` ms after)
   * and goes down again soon after (by `catchMs`), so the old harmony does not blur
   * into the new and the new one is held. Times in ms on one clock.
   *
   * @param {number[]} changes when each new harmony starts (the first one need only be caught)
   * @param {Array<{time:number, down:boolean}>} pedal CC64 events in time order
   * @returns {{changes:number, clean:number, blurred:number[], dry:number[], share:number}}
   */
  function scorePedal(changes, pedal, opts = {}) {
    const before = opts.beforeMs == null ? 80 : opts.beforeMs;
    const lift = opts.liftMs || 300;
    const catchMs = opts.catchMs || 700;
    const ev = (pedal || []).slice().sort((a, b) => a.time - b.time);
    const downAt = (t) => { let d = false; ev.forEach((e) => { if (e.time <= t) d = e.down; }); return d; };
    const blurred = [];
    const dry = [];
    let clean = 0;
    changes.forEach((T, i) => {
      const upInWindow = ev.some((e) => !e.down && e.time >= T - before && e.time <= T + lift) || (i === 0 && !downAt(T - before));
      const caught = downAt(T + catchMs) || ev.some((e) => e.down && e.time > T - before && e.time <= T + catchMs);
      if (!upInWindow) blurred.push(i);
      else if (!caught) dry.push(i);
      else clean++;
    });
    return { changes: changes.length, clean, blurred, dry, share: changes.length ? Math.round((clean / changes.length) * 100) / 100 : 0 };
  }

  // ── practice engine: tempo ladder, hotspot loop, feedback fading ─────────
  // (SKILL-CURRICULA.md §4; evidence article 04, P2 and P3.) Warm practice only:
  // a cold stage take is always at the target tempo with the full result.

  /**
   * The tempo ladder: start at 65% of the target tempo (the curriculum's 60-70%),
   * step up 10% after 2 clean takes in a row, step back 10% after 2 failures in a
   * row, never below 60% or above the target. `state` {pct, clean, fails} or null.
   */
  const LADDER = { start: 0.65, step: 0.1, min: 0.6, max: 1, up: 2, down: 2 };
  function tempoLadder(state, pass) {
    const s = state && typeof state.pct === 'number' ? { pct: state.pct, clean: state.clean || 0, fails: state.fails || 0 } : { pct: LADDER.start, clean: 0, fails: 0 };
    if (pass === undefined || pass === null) return s;
    const round = (x) => Math.round(x * 100) / 100;
    if (pass) {
      s.clean += 1; s.fails = 0;
      if (s.clean >= LADDER.up) { s.pct = round(Math.min(LADDER.max, s.pct + LADDER.step)); s.clean = 0; }
    } else {
      s.fails += 1; s.clean = 0;
      if (s.fails >= LADDER.down) { s.pct = round(Math.max(LADDER.min, s.pct - LADDER.step)); s.fails = 0; }
    }
    return s;
  }

  /** Errors per bar of a scored take: wrong, missed and off-beat notes of the target, by bar. */
  function barErrors(target, score, beatsPerBar = 4) {
    const bpb = beatsPerBar > 0 ? beatsPerBar : 4;
    const bad = new Set([].concat(score.wrong || [], score.missed || [], (score.timing && score.timing.offBeatNotes) || []));
    const bars = new Map();
    target.forEach((t, i) => {
      const b = Math.floor((t.beat || 0) / bpb);
      const x = bars.get(b) || { bar: b, notes: 0, errors: 0 };
      x.notes += 1;
      if (bad.has(i)) x.errors += 1;
      bars.set(b, x);
    });
    return [...bars.values()].sort((a, b) => a.bar - b.bar);
  }

  /**
   * The hotspot: the worst bar (most errors, then the larger share) and, when a
   * neighbour also has errors, the worse neighbour with it, so 1-2 bars loop.
   * Null when the take had no errors or the piece has a single bar.
   */
  function hotspot(target, score, beatsPerBar = 4) {
    const bars = barErrors(target, score, beatsPerBar);
    if (bars.length < 2) return null;
    const worst = bars.slice().sort((a, b) => b.errors - a.errors || b.errors / b.notes - a.errors / a.notes || a.bar - b.bar)[0];
    if (!worst || !worst.errors) return null;
    const near = bars.filter((x) => Math.abs(x.bar - worst.bar) === 1 && x.errors > 0).sort((a, b) => b.errors - a.errors)[0];
    const from = near ? Math.min(worst.bar, near.bar) : worst.bar;
    const to = near ? Math.max(worst.bar, near.bar) : worst.bar;
    return { from, to, errors: worst.errors + (near ? near.errors : 0) };
  }

  /** The notes of bars from..to (inclusive), re-timed to start on beat 0. */
  function sliceBars(target, from, to, beatsPerBar = 4) {
    const bpb = beatsPerBar > 0 ? beatsPerBar : 4;
    const lo = from * bpb;
    const hi = (to + 1) * bpb;
    return target.filter((t) => t.beat >= lo && t.beat < hi).map((t) => ({ ...t, beat: Math.round((t.beat - lo) * 1000) / 1000 }));
  }

  /**
   * Bandwidth feedback (P2): which of a take's measures fall outside the bar.
   * `facts` {notes, on_beat, cv, stops, chords...}; `rule` the check's bar
   * {notes, on_beat, cv, no_stops, chords}. Inside the bar is not flagged.
   */
  function outsideBar(facts, rule) {
    const r = rule || {};
    const off = [];
    if (facts.notes != null && r.notes != null && facts.notes < r.notes - 1e-9) off.push('notes');
    if (facts.chords != null && r.chords != null && facts.chords_right / Math.max(1, facts.chords) < r.chords - 1e-9) off.push('chords');
    if (facts.on_beat != null && r.on_beat != null && facts.on_beat < r.on_beat) off.push('on_beat');
    if (facts.cv != null && r.cv != null && facts.cv > r.cv) off.push('cv');
    if (facts.stops && r.no_stops) off.push('stops');
    return off;
  }

  return {
    noteToMidi, midiToName, pitchClass, freqToMidi, midiToFreq, isBlack,
    detectPitch, framesToNotes, align, scorePerformance, samePitchClasses, parseNotes,
    readToken, parsePart, songParts, learnScore, scoreSong, songStars, chordMidis, parseChords,
    spectrum, noteSalience, hearNotes, pitchIsReal, createOnsetDetector, createMicTap, createNoteListener,
    DYNAMICS, scoreDynamics, scorePedal,
    LADDER, tempoLadder, barErrors, hotspot, sliceBars, outsideBar,
  };
});
