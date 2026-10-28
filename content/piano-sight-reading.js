/**
 * New music to read, generated on the server: the sight-reading staircase
 * SR1-SR10 of the piano progression (content/skill-progressions/piano.json
 * sight_reading_staircase; the level specs are curriculum-build/staged/skills/
 * piano/drills.json, kept below), and the passages the later piano stage
 * checks need (a p/f passage for dynamics, a chord passage for pedalling, a
 * longer piece to learn from the score). Used by services/skill-piano-bb-sittings.js.
 *
 * Every excerpt is new: it is drawn from a seeded generator at the moment a
 * sitting opens, so it has never been seen before ("New, never-seen excerpts
 * only"). The same object carries
 *   score   what the page draws (public/js/piano-notation.js): key, metre,
 *           staves, and per bar each staff's events with spelled note names,
 *           durations in quarter notes, ties, beams, triplets, dynamics;
 *   target  what piano-core's scorePerformance scores against: every onset as
 *           {midi, beat} (beats in quarter notes from the first downbeat);
 *           tied continuations and rests are not onsets.
 *
 * Pitch and rhythm are scored separately, as the staircase rule asks: the
 * share of notes right (noteAccuracy) and the share of onsets on the beat
 * (onBeatShare). Musicality is never scored.
 *
 * Pure: no database, no clock. Levels SR8-SR10 are listed but not generated:
 * no stage check asks for them (PI8-10 has no sight-reading metric), and
 * notation for them (clef changes, semiquaver runs, metre changes) is not drawn.
 */
'use strict';

const LEVELS = {
  SR1: { keys: ['C'], clefs: ['treble'], metres: ['4/4'], cells: ['w', 'h', 'q'], motion: 'steps', hands: 'one', bars: 4, tempo: 60 },
  SR2: { keys: ['C', 'G'], clefs: ['treble', 'bass'], metres: ['4/4', '3/4'], cells: ['w', 'hd', 'h', 'q'], motion: 'thirds', hands: 'one', bars: 4, tempo: 60 },
  SR3: { keys: ['C', 'G', 'F'], clefs: ['grand'], metres: ['4/4', '3/4', '2/4'], cells: ['hd', 'h', 'q', 'qr'], motion: 'thirds', hands: 'alternating', bars: 8, tempo: 63 },
  SR4: { keys: ['C', 'a', 'G', 'F', 'e', 'd'], clefs: ['grand'], metres: ['4/4', '3/4', '2/4'], cells: ['h', 'q', '8p'], motion: 'thirds', hands: 'together', bars: 8, tempo: 60 },
  SR5: { keys: ['C', 'a', 'G', 'F', 'e', 'd', 'D', 'Bb', 'b', 'g'], clefs: ['grand'], metres: ['4/4', '3/4', '2/4'], cells: ['q', '8p', 'qd8', 'h'], motion: 'shifts', hands: 'together', bars: 8, tempo: 66 },
  SR6: { keys: ['C', 'a', 'G', 'F', 'e', 'd', 'D', 'Bb', 'b', 'g', 'A', 'Eb', 'f#', 'c'], clefs: ['grand'], metres: ['4/4', '3/4', '6/8', '3/8'], cells: ['8p', 'q', 'qd8', 'h'], motion: 'shifts', hands: 'together', bars: 12, tempo: 60, ties: true, dyads: true },
  SR7: { keys: ['C', 'a', 'G', 'F', 'e', 'd', 'D', 'Bb', 'b', 'g', 'A', 'Eb', 'f#', 'c', 'E', 'Ab', 'c#', 'f'], clefs: ['grand'], metres: ['4/4', '3/4', '6/8', '2/2'], cells: ['syn', 'trip', '8p', 'q', 'h'], motion: 'leaps', hands: 'together', bars: 12, tempo: 60, hairpins: true },
};
const STAGE_MINIMUM = { PI2: 'SR2', PI3: 'SR3', PI4: 'SR4', PI5: 'SR5', PI6: 'SR6', PI7: 'SR7', PI8: 'SR8', PI9: 'SR9', PI10: 'SR10' };

// ── keys and spelling ──────────────────────────────────────────────────────

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLATS = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, a: 0, e: 1, b: 2, 'f#': 3, 'c#': 4, 'g#': 5, d: -1, g: -2, c: -3, f: -4, bb: -5, eb: -6 };

/** A key by its staircase name: "G" is G major, "e" is E minor. */
function keyOf(name) {
  if (!(name in FIFTHS)) throw new Error(`unknown key ${name}`);
  const minor = name[0] === name[0].toLowerCase();
  const letter = name[0].toUpperCase();
  const fifths = FIFTHS[name];
  const acc = name.slice(1) === '#' ? '♯' : name.slice(1) === 'b' ? '♭' : '';
  return { name, mode: minor ? 'minor' : 'major', fifths, letter, label: `${letter}${acc} ${minor ? 'minor' : 'major'}` };
}

/** The alteration the key signature gives a letter: +1, -1 or 0. */
function alterIn(fifths, letter) {
  if (fifths > 0 && SHARPS.indexOf(letter) < fifths) return 1;
  if (fifths < 0 && FLATS.indexOf(letter) < -fifths) return -1;
  return 0;
}

/** A diatonic step (0 = the key's tonic at `octave`) as {name, midi, letter, octave, alter}. */
function degree(key, d, octave) {
  const li = LETTERS.indexOf(key.letter) + d;
  const letter = LETTERS[((li % 7) + 7) % 7];
  const oct = octave + Math.floor(li / 7);
  const alter = alterIn(key.fifths, letter);
  const midi = 12 * (oct + 1) + NATURAL[letter] + alter;
  return { name: `${letter}${alter > 0 ? '#' : alter < 0 ? 'b' : ''}${oct}`, midi, letter, octave: oct, alter };
}

/** The tonic's octave: the right hand's tonic between C4 and B4, the left hand's an octave lower. */
function tonicOctave(key, hand) {
  if (hand === 'left-melody') return NATURAL[key.letter] >= 7 ? 2 : 3; // a bass-clef tune sits in the staff
  return hand === 'left' ? 3 : 4;
}

/** A left-hand chord note: the scale step at the left hand's octave, an octave down when it would climb above G3. */
function lowNote(key, d, lhOct) {
  const n = degree(key, d, lhOct);
  return n.midi > 55 ? degree(key, d - 7, lhOct) : n;
}

// ── rhythm ─────────────────────────────────────────────────────────────────

const METRES = {
  '4/4': { len: 4, beats: [0, 1, 2, 3], strong: [0, 2], compound: false },
  '3/4': { len: 3, beats: [0, 1, 2], strong: [0], compound: false },
  '2/4': { len: 2, beats: [0, 1], strong: [0], compound: false },
  '2/2': { len: 4, beats: [0, 2], strong: [0], compound: false },
  '6/8': { len: 3, beats: [0, 1.5], strong: [0], compound: true },
  '3/8': { len: 1.5, beats: [0], strong: [0], compound: true },
};

/** Rhythm cells: durations in quarter notes; `at` says where in the bar a cell may start. */
const CELLS = {
  w: { d: [4], at: (p, m) => p === 0 && m.len === 4 },
  hd: { d: [3], at: (p, m) => p === 0 && m.len >= 3 && !m.compound },
  h: { d: [2], at: (p, m) => !m.compound && p % 2 === 0 || (!m.compound && m.len === 3 && p === 1) },
  q: { d: [1], at: (p, m) => !m.compound && Number.isInteger(p) },
  qr: { d: [1], rest: [true], at: (p, m) => !m.compound && Number.isInteger(p) && p > 0 },
  '8p': { d: [0.5, 0.5], beam: true, at: (p, m) => !m.compound && Number.isInteger(p) },
  qd8: { d: [1.5, 0.5], at: (p, m) => !m.compound && (p === 0 || p === 2 || (m.len === 3 && p === 1)) },
  syn: { d: [0.5, 1, 0.5], at: (p, m) => !m.compound && (p === 0 || p === 2) },
  trip: { d: [1 / 3, 1 / 3, 1 / 3], beam: true, tuplet: 3, at: (p, m) => !m.compound && Number.isInteger(p) },
  // compound metres (6/8, 3/8): a beat is a dotted quarter
  dq: { d: [1.5], at: (p, m) => m.compound && p % 1.5 === 0 },
  e3: { d: [0.5, 0.5, 0.5], beam: true, at: (p, m) => m.compound && p % 1.5 === 0 },
  qe: { d: [1, 0.5], at: (p, m) => m.compound && p % 1.5 === 0 },
  dh: { d: [3], at: (p, m) => m.compound && p === 0 && m.len === 3 },
};

function pick(xs, rnd) { return xs[Math.floor(rnd() * xs.length)]; }

/** One bar's rhythm from the level's cells; `final` ends the piece with one long note. */
function barRhythm(metre, cellNames, rnd, final) {
  const m = METRES[metre];
  const names = m.compound ? ['dq', 'e3', 'qe', ...(cellNames.includes('w') ? ['dh'] : [])] : cellNames.filter((c) => !['dq', 'e3', 'qe', 'dh'].includes(c));
  if (final) {
    const longest = m.compound ? (m.len === 3 ? 'dh' : 'dq') : m.len === 4 ? (cellNames.includes('w') ? 'w' : 'h') : m.len === 3 ? 'hd' : 'h';
    if (longest === 'h' && m.len === 4) return [{ d: 2 }, { d: 2 }].map((x, i) => ({ ...x, start: i * 2 }));
    return [{ d: CELLS[longest].d[0], start: 0 }];
  }
  for (let tries = 0; tries < 200; tries++) {
    const out = [];
    let p = 0;
    let beamId = 0;
    while (p < m.len - 1e-9) {
      const fits = names.filter((n) => CELLS[n].at(p, m) && CELLS[n].d.reduce((a, b) => a + b, 0) <= m.len - p + 1e-9);
      if (!fits.length) break;
      // Shorter notes are rarer at the lower levels; the bar's first cell is not a rest.
      const name = pick(fits.filter((n) => !(n === 'qr' && p === 0)), rnd);
      const c = CELLS[name];
      beamId += 1;
      c.d.forEach((d, i) => {
        out.push({ d, start: p, rest: !!(c.rest && c.rest[i]), beam: c.beam ? `${beamId}` : null, tuplet: c.tuplet ? (i === 0 ? 'start' : i === c.d.length - 1 ? 'end' : 'mid') : null });
        p += d;
      });
    }
    if (Math.abs(p - m.len) < 1e-6 && out.some((x) => !x.rest)) return out.map((x) => ({ ...x, start: Math.round(x.start * 1000) / 1000 }));
  }
  return [{ d: m.len, start: 0 }];
}

// ── melody ─────────────────────────────────────────────────────────────────

const MOTION = {
  steps: { steps: [-1, 1], range: [0, 4] },
  thirds: { steps: [-2, -1, 1, 2], range: [0, 4] },
  shifts: { steps: [-2, -1, 1, 2, 3, -3], range: [-3, 7] },
  leaps: { steps: [-4, -3, -2, -1, 1, 2, 3, 4], range: [-3, 9] },
};

/** The next scale step from `from`, inside the range, never the minor key's 7th (no accidentals beyond the key). */
function nextDegree(from, motion, rnd, key, range) {
  const ok = (d) => d >= range[0] && d <= range[1] && !(key.mode === 'minor' && ((d % 7) + 7) % 7 === 6);
  const opts = motion.steps.map((s) => from + s).filter(ok);
  return opts.length ? pick(opts, rnd) : from;
}

const HARMONY = [[0, 3, 4, 0], [0, 4, 0, 4], [0, 3, 0, 4], [0, 4, 3, 4], [0, 0, 3, 4]];

// ── one excerpt ────────────────────────────────────────────────────────────

/**
 * A new excerpt at a staircase level (SR1-SR7).
 * @param {string} levelId 'SR1'..'SR7'
 * @param {function} rnd a seeded random number generator (0..1)
 * @param {object} [o] { bars, key, metre, dynamics: 'pf' (bars marked p and f in pairs), hands }
 * @returns {{level, key, metre, tempo, hands, score, target}}
 */
function excerpt(levelId, rnd, o = {}) {
  const L = LEVELS[levelId];
  if (!L) throw new Error(`no generator for ${levelId}`);
  const key = keyOf(o.key || pick(L.keys, rnd));
  const metre = o.metre || pick(L.metres, rnd);
  const m = METRES[metre];
  const bars = o.bars || L.bars;
  const hands = o.hands || L.hands;
  const clef = o.clef || (L.clefs[0] === 'grand' ? 'grand' : pick(L.clefs, rnd));
  const staves = clef === 'grand' || hands !== 'one' ? ['treble', 'bass'] : [clef];
  const motion = MOTION[L.motion];
  const rhOct = tonicOctave(key, 'right');
  const lhOct = tonicOctave(key, 'left');
  const lhMelodyOct = tonicOctave(key, 'left-melody');
  const harmony = [];
  const progression = pick(HARMONY, rnd);
  for (let b = 0; b < bars; b++) harmony.push(b === bars - 1 ? 0 : b === bars - 2 ? 4 : progression[b % 4]);

  const score = { level: levelId, key: { name: key.name, fifths: key.fifths, mode: key.mode, label: key.label }, metre: metre.split('/').map(Number), tempo: L.tempo, staves, bars: [] };
  const target = [];
  let rhDeg = pick([0, 2, 4].filter((d) => d <= motion.range[1]), rnd);
  let lhDeg = 0;
  // Alternating hands: phrases of 2 bars, right hand first.
  const handOf = (b) => (hands === 'alternating' ? (Math.floor(b / 2) % 2 === 0 ? 'right' : 'left') : hands === 'one' ? (staves[0] === 'bass' ? 'left' : 'right') : 'both');
  let tieFrom = null; // a note tied over the bar line
  for (let b = 0; b < bars; b++) {
    const bar = { treble: [], bass: [] };
    const final = b === bars - 1;
    const hand = handOf(b);
    const rhythm = barRhythm(metre, L.cells, rnd, final);
    const root = harmony[b];
    const melodyStaff = hand === 'left' ? 'bass' : 'treble';
    const melodyOct = hand === 'left' ? lhMelodyOct : rhOct;
    rhythm.forEach((r, i) => {
      const beat = b * m.len + r.start;
      if (r.rest) { bar[melodyStaff].push({ dur: r.d, rest: true, beam: null, tuplet: r.tuplet || null }); return; }
      let d;
      if (final && i === rhythm.length - 1) d = 0;
      else if (i === 0 && hands === 'together') d = [root, root + 2, root + 4].map((x) => (x > motion.range[1] ? x - 7 : x)).filter((x) => x >= motion.range[0] && !(key.mode === 'minor' && ((x % 7) + 7) % 7 === 6)).sort((x, y) => Math.abs(x - rhDeg) - Math.abs(y - rhDeg))[0];
      else d = nextDegree(hand === 'left' ? lhDeg : rhDeg, motion, rnd, key, motion.range);
      if (d === undefined) d = rhDeg;
      if (tieFrom && i === 0 && melodyStaff === 'treble') d = tieFrom.d;
      const note = degree(key, d, melodyOct);
      const ev = { dur: r.d, notes: [note.name], beam: r.beam, tuplet: r.tuplet || null };
      const tiedIn = !!(tieFrom && i === 0 && melodyStaff === 'treble');
      if (tiedIn) tieFrom.ev.tie = true;
      else target.push({ midi: note.midi, beat, hand: hand === 'left' ? 'left' : 'right' });
      // A two-note chord (SR6): a third below the melody on a strong beat.
      if (L.dyads && hand !== 'left' && m.strong.includes(r.start) && r.d >= 1 && rnd() < 0.35 && !tiedIn) {
        const low = degree(key, d - 2, melodyOct);
        if (!(key.mode === 'minor' && (((d - 2) % 7) + 7) % 7 === 6)) { ev.notes = [low.name, note.name]; target.push({ midi: low.midi, beat, hand: 'right' }); }
      }
      bar[melodyStaff].push(ev);
      if (hand === 'left') lhDeg = d; else rhDeg = d;
    });
    tieFrom = null;
    // A tie over the bar line (SR6): the bar's last note held into the next bar's first.
    if (L.ties && !final && b < bars - 2 && melodyStaff === 'treble' && rnd() < 0.3) {
      const last = bar.treble[bar.treble.length - 1];
      if (last && !last.rest && last.notes.length === 1 && !last.tuplet) tieFrom = { ev: last, d: rhDeg };
    }
    // The other staff: the left hand's long notes when hands are together, else a bar's rest.
    const other = melodyStaff === 'treble' ? 'bass' : 'treble';
    if (hands === 'together') {
      const lhNote = lowNote(key, root, lhOct);
      const halves = !m.compound && m.len === 4 && !final && rnd() < 0.4;
      const parts = halves ? [2, 2] : [m.len];
      let at = 0;
      parts.forEach((d, k) => {
        const n = k === 1 ? lowNote(key, root + 4 <= 6 ? root + 4 : root - 3, lhOct) : lhNote;
        bar.bass.push({ dur: d, notes: [n.name], beam: null, tuplet: null });
        target.push({ midi: n.midi, beat: b * m.len + at, hand: 'left' });
        at += d;
      });
    } else if (staves.length === 2) {
      bar[other].push({ dur: m.len, rest: true, whole_bar: true });
    }
    if (o.dynamics === 'pf') bar.dynamic = Math.floor(b / 2) % 2 === 0 ? 'p' : 'f';
    if (L.hairpins && !final && b % 3 === 1 && !o.dynamics) bar.hairpin = rnd() < 0.5 ? 'cresc' : 'dim';
    score.bars.push(bar);
  }
  if (o.dynamics === 'pf') {
    for (const t of target) t.dynamic = score.bars[Math.floor(t.beat / m.len)].dynamic;
  }
  target.sort((x, y) => x.beat - y.beat || x.midi - y.midi);
  for (const t of target) t.beat = Math.round(t.beat * 1000) / 1000;
  return { level: levelId, key: key.name, key_label: key.label, metre, tempo: L.tempo, hands, score, target };
}

/**
 * A chord passage for pedalling: one chord a bar (left-hand root, right-hand
 * triad), 4/4, marked to change the pedal at every chord. The changes are the
 * chord onsets.
 */
function pedalPassage(rnd, o = {}) {
  const key = keyOf(o.key || pick(['C', 'G', 'F', 'D', 'Bb', 'a', 'e', 'd'], rnd));
  const bars = o.bars || 8;
  const prog = [];
  const pats = [[0, 5, 3, 4], [0, 3, 4, 0], [0, 4, 5, 3], [0, 2, 3, 4]];
  for (let b = 0; b < bars; b++) prog.push(b === bars - 1 ? 0 : b === bars - 2 ? 4 : pick(pats, rnd)[b % 4]);
  const rhOct = tonicOctave(key, 'right');
  const lhOct = tonicOctave(key, 'left');
  const score = { level: 'pedal', key: { name: key.name, fifths: key.fifths, mode: key.mode, label: key.label }, metre: [4, 4], tempo: 60, staves: ['treble', 'bass'], bars: [], pedal: true };
  const target = [];
  const chords = [];
  prog.forEach((root, b) => {
    const tones = [root, root + 2, root + 4].map((d) => degree(key, d > 4 ? d - 7 : d, rhOct));
    const bass = lowNote(key, root, lhOct);
    score.bars.push({ treble: [{ dur: 4, notes: tones.map((t) => t.name) }], bass: [{ dur: 4, notes: [bass.name] }], pedal_change: true });
    const midis = [bass.midi, ...tones.map((t) => t.midi)];
    chords.push(midis);
    for (const mm of midis.sort((x, y) => x - y)) target.push({ midi: mm, beat: b * 4 });
  });
  return { level: 'pedal', key: key.name, key_label: key.label, metre: '4/4', tempo: 60, hands: 'together', score, target, chords };
}


// ── scales and arpeggios for the technique checks ───────────────────────────

// Fixed 2026-10-25: double sharps and flats (F## in G# harmonic minor) were read as single ones.
const ACCIDENTAL = { '': 0, '#': 1, '##': 2, x: 2, b: -1, bb: -2 };
const PC_OF = (name) => { const m = /^([A-G])(##|#|x|bb|b)?/.exec(name); return ((NATURAL[m[1]] + ACCIDENTAL[m[2] || '']) % 12 + 12) % 12; };
/** The lowest key at or above `from` with this pitch class. */
const atOrAbove = (from, pc) => from + (((pc - from) % 12) + 12) % 12;
/** The highest key at or below `from` with this pitch class. */
const atOrBelow = (from, pc) => from - (((from - pc) % 12) + 12) % 12;

/**
 * A technique item (content/skill-*.data.json, from piano/drills.json) as the
 * keys played, up and back down, one note a beat: scales of 1-4 octaves to the
 * top tonic and back (melodic minor down as the natural minor), arpeggios of
 * three or four notes to the top tonic and back, chromatic and whole-tone
 * scales by pitch class, five-finger patterns up and back.
 */
function scaleRun(item) {
  const octaves = Number(item.octaves) || 0;
  if (Array.isArray(item.midi_ascending) && item.midi_ascending.length) {
    // Long scales written from the 4th octave would run off the top of the piano: start them lower.
    let shift = 0;
    while (item.midi_ascending[item.midi_ascending.length - 1] + shift > 96) shift -= 12;
    const up = item.midi_ascending.map((m) => m + shift);
    if (Array.isArray(item.descending) && item.descending.length) {
      const down = [];
      let cur = up[up.length - 1];
      for (let o = 0; o < Math.max(1, octaves); o++) for (const n of item.descending) { cur = atOrBelow(cur - 1, PC_OF(n)); down.push(cur); }
      return up.concat(down);
    }
    return up.concat(up.slice(0, -1).reverse());
  }
  const tonicName = item.tonic || (item.notes && item.notes[0]) || 'C';
  const tpc = PC_OF(tonicName);
  const startOct = octaves >= 3 ? 2 : tpc >= 7 ? 3 : 4;
  const start = 12 * (startOct + 1) + tpc;
  let pcs;
  if (Array.isArray(item.pitch_classes) && item.pitch_classes.length) pcs = item.pitch_classes.slice();
  else if (/chromatic/.test(item.kind || '')) pcs = Array.from({ length: 12 }, (_, i) => (tpc + i) % 12);
  else pcs = (item.notes || [tonicName]).map(PC_OF);
  if (octaves === 0) { // a five-finger pattern
    const up = [];
    let cur = start - 1;
    for (const pc of pcs) { cur = atOrAbove(cur + 1, pc); up.push(cur); }
    return up.concat(up.slice(0, -1).reverse());
  }
  const up = [];
  let cur = start - 1;
  for (let o = 0; o < octaves; o++) for (const pc of pcs) { cur = atOrAbove(cur + 1, pc); up.push(cur); }
  up.push(start + 12 * octaves);
  return up.concat(up.slice(0, -1).reverse());
}

/**
 * A spelled note name with its octave for a key: the octave follows the letter,
 * so B#3 sounds as C4 and Cb4 as B3 (scientific pitch notation). Null when the
 * name is not that key.
 */
function spelledName(midi, name) {
  const m = /^([A-G])(##|#|x|bb|b)?$/.exec(String(name || ''));
  if (!m) return null;
  const base = midi - ACCIDENTAL[m[2] || ''] - NATURAL[m[1]];
  return base % 12 === 0 ? `${name}${base / 12 - 1}` : null;
}

// Chromatic scales: sharps going up, flats coming down, the tonic keeping its own name.
const CHROMATIC_UP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_DOWN = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// The two whole-tone collections: C D E F# G# A# and Db Eb F G A B.
const WHOLE_TONE = ['C', 'D', 'E', 'F#', 'G#', 'A#', 'Db', 'Eb', 'F', 'G', 'A', 'B'];

/**
 * The note names a technique run shows, spelled from the item's own notes, not
 * from the key's MIDI number: D harmonic minor reads B-flat, not A-sharp, and
 * melodic minor comes down with its descending notes. Fixed 2026-10-25: the
 * names were midiToName's sharps, so every flat in a scale showed as a sharp.
 * `run` defaults to scaleRun(item); a key whose spelling is unknown is null.
 */
function scaleNames(item, run = scaleRun(item)) {
  const tonic = item.tonic || (item.notes && item.notes[0]) || 'C';
  const byPc = (names) => { const o = {}; for (const n of names) o[PC_OF(n)] = n; return o; };
  let up;
  let down;
  if (/chromatic/.test(item.kind || '')) {
    up = byPc(CHROMATIC_UP);
    down = byPc(CHROMATIC_DOWN);
    up[PC_OF(tonic)] = tonic;
    down[PC_OF(tonic)] = tonic;
  } else if (/whole_tone/.test(item.kind || '')) {
    up = byPc(WHOLE_TONE);
    up[PC_OF(tonic)] = tonic;
    down = up;
  } else {
    up = byPc(item.notes && item.notes.length ? item.notes : [tonic]);
    down = Array.isArray(item.descending) && item.descending.length ? byPc(item.descending) : up;
  }
  const peak = run.indexOf(Math.max(...run));
  return run.map((midi, i) => {
    const pc = ((midi % 12) + 12) % 12;
    const name = (i <= peak ? up : down)[pc] || (i <= peak ? down : up)[pc];
    return name ? spelledName(midi, name) : null;
  });
}

module.exports = { scaleRun, scaleNames, spelledName, LEVELS, STAGE_MINIMUM, METRES, keyOf, degree, alterIn, excerpt, pedalPassage, barRhythm };
