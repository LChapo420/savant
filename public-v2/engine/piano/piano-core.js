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
})(typeof self !== 'undefined' ? self : this, function () {
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
    const fromMic = played.some((p) => p.source === 'mic');
    const confidence = fromMic ? Math.round((played.reduce((s, p) => s + (p.confidence || 0), 0) / Math.max(1, played.length)) * 100) / 100 : 1;

    return {
      noteAccuracy: Math.round(noteAccuracy * 100) / 100,
      correct: matched.length,
      total: target.length,
      wrong, missed, extra,
      timing, evenness, dynamics,
      estimated: fromMic,
      confidence,
      notMeasured: ['phrasing', 'tone', 'character'].concat(dynamics ? [] : ['dynamics']).concat(fromMic ? ['pedalling'] : []),
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

  return {
    noteToMidi, midiToName, pitchClass, freqToMidi, midiToFreq, isBlack,
    detectPitch, framesToNotes, align, scorePerformance, samePitchClasses, parseNotes,
    readToken, parsePart, songParts, learnScore, scoreSong, songStars, chordMidis, parseChords,
  };
});
