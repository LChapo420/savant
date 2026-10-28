/**
 * Builds piano/drills.json: the technique batteries, sight-reading staircase and ear
 * batteries the staged piano progression gates on. Every note list is computed here
 * by letter steps (our own small spelling model, NOT content/piano-theory.js), and
 * verify-skill-curricula.js re-derives each one a second way (from the key signature)
 * and also cross-checks against the app's theory engine.
 *
 *   node curriculum-build/staged/skills/piano/build-drills.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LETTERS = 'CDEFGAB';
const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod12 = (n) => ((n % 12) + 12) % 12;
const accOf = (s) => ({ '': 0, '#': 1, '##': 2, b: -1, bb: -2 })[s];
const accStr = (a) => ({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' })[a];
const parse = (n) => { const m = /^([A-G])(##|#|bb|b)?$/.exec(n); return { letter: m[1], acc: accOf(m[2] || '') }; };
const pc = (n) => { const p = parse(n); return mod12(NAT[p.letter] + p.acc); };

/** Spell a 7-note scale from `tonic` with the given semitone steps, one letter per degree. */
function spell(tonic, steps) {
  const out = [tonic];
  let semis = 0;
  const t = parse(tonic);
  for (let i = 0; i < 6; i++) {
    semis += steps[i];
    const letter = LETTERS[(LETTERS.indexOf(t.letter) + i + 1) % 7];
    let acc = mod12(pc(tonic) + semis - NAT[letter]);
    if (acc > 6) acc -= 12;
    out.push(letter + accStr(acc));
  }
  return out;
}
const STEPS = {
  major: [2, 2, 1, 2, 2, 2, 1],
  natural_minor: [2, 1, 2, 2, 1, 2, 2],
  harmonic_minor: [2, 1, 2, 2, 1, 3, 1],
  melodic_minor_up: [2, 1, 2, 2, 2, 2, 1],
};
/** MIDI numbers for `octaves` octaves ascending from the tonic in octave 4 (C4 = 60), top tonic included. */
function midiUp(notes, octaves, startOctave = 4) {
  const out = [];
  let last = -1; let oct = startOctave;
  for (let o = 0; o < octaves; o++) {
    for (const n of notes) {
      let m = pc(n) + 12 * (oct + 1);
      while (m <= last) m += 12;
      out.push(m); last = m;
    }
  }
  let top = pc(notes[0]) + 12 * (oct + 1);
  while (top <= last) top += 12;
  out.push(top);
  return out;
}

const scale = (tonic, kind, opts = {}) => {
  const notes = kind === 'melodic_minor' ? spell(tonic, STEPS.melodic_minor_up) : spell(tonic, STEPS[kind]);
  const e = { item: `${tonic} ${kind.replace(/_/g, ' ')}`, kind, tonic, notes, hands: opts.hands || 'HT', octaves: opts.octaves || 2, motion: opts.motion || 'similar' };
  if (kind === 'melodic_minor') e.descending = spell(tonic, STEPS.natural_minor).slice().reverse();
  e.midi_ascending = midiUp(notes, e.octaves, tonic[0] >= 'A' && tonic[0] <= 'B' ? 3 : 4);
  return e;
};
const arpeggio = (tonic, quality, opts = {}) => {
  const q = { major: [0, 4, 7], minor: [0, 3, 7], dominant_seventh: [0, 4, 7, 10], diminished_seventh: [0, 3, 6, 9] }[quality];
  const letters = quality.endsWith('seventh') ? [0, 2, 4, 6] : [0, 2, 4];
  const t = parse(tonic);
  const notes = q.map((s, i) => {
    const letter = LETTERS[(LETTERS.indexOf(t.letter) + letters[i]) % 7];
    let acc = mod12(pc(tonic) + s - NAT[letter]);
    if (acc > 6) acc -= 12;
    return letter + accStr(acc);
  });
  return { item: `${tonic} ${quality.replace(/_/g, ' ')} arpeggio`, kind: `arpeggio_${quality}`, tonic, notes, hands: opts.hands || 'HT', octaves: opts.octaves || 2 };
};
const pentascale = (tonic, quality) => ({ item: `${tonic} ${quality} five-finger pattern`, kind: `pentascale_${quality}`, tonic, notes: spell(tonic, STEPS[quality === 'major' ? 'major' : 'natural_minor']).slice(0, 5), hands: 'HS', octaves: 0 });
const chromatic = (start, opts = {}) => ({ item: `chromatic from ${start}`, kind: 'chromatic', tonic: start, pitch_classes: Array.from({ length: 12 }, (_, i) => mod12(pc(start) + i)), hands: opts.hands || 'HT', octaves: opts.octaves || 2 });
const wholeTone = (start) => ({ item: `whole-tone scale on ${start}`, kind: 'whole_tone', tonic: start, pitch_classes: Array.from({ length: 6 }, (_, i) => mod12(pc(start) + 2 * i)), hands: 'HT', octaves: 2, note: 'spelling varies by context; graded by pitch' });

const MAJORS12 = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const MINORS12 = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'];

const batteries = [
  { stage: 'PI2', grade: 'piano_first_reader', items: [pentascale('C', 'major'), pentascale('G', 'major'), pentascale('D', 'major'), pentascale('F', 'major'), pentascale('D', 'minor'), pentascale('E', 'minor'), scale('C', 'major', { hands: 'HS', octaves: 1 })] },
  { stage: 'PI3', grade: 'piano_elementary_1', items: [scale('C', 'major', { octaves: 2 }), scale('C', 'major', { octaves: 2, motion: 'contrary' }), scale('G', 'major', { hands: 'HS' }), scale('F', 'major', { hands: 'HS' }), scale('A', 'natural_minor', { hands: 'HS' }), scale('D', 'natural_minor', { hands: 'HS' }), scale('A', 'harmonic_minor', { hands: 'HS' }), scale('D', 'harmonic_minor', { hands: 'HS' }), arpeggio('G', 'major', { hands: 'HS' }), arpeggio('A', 'minor', { hands: 'HS' })] },
  { stage: 'PI4', grade: 'piano_elementary_2', items: [scale('G', 'major'), scale('F', 'major'), scale('D', 'major'), scale('A', 'major'), scale('A', 'harmonic_minor'), scale('D', 'harmonic_minor'), scale('E', 'harmonic_minor'), scale('G', 'harmonic_minor'), chromatic('C', { hands: 'HS', octaves: 1 }), arpeggio('D', 'major'), arpeggio('A', 'major'), arpeggio('E', 'minor'), arpeggio('G', 'minor')] },
  { stage: 'PI5', grade: 'piano_lower_intermediate', items: [scale('Bb', 'major'), scale('Eb', 'major'), scale('C', 'harmonic_minor'), scale('B', 'harmonic_minor'), scale('E', 'major', { motion: 'contrary' }), arpeggio('Bb', 'major'), arpeggio('Eb', 'major'), arpeggio('C', 'minor'), arpeggio('B', 'minor')] },
  { stage: 'PI6', grade: 'piano_intermediate', items: [scale('B', 'major'), scale('F#', 'major'), scale('Ab', 'major'), scale('F', 'harmonic_minor'), scale('F#', 'harmonic_minor'), scale('F', 'melodic_minor'), scale('Eb', 'major', { motion: 'contrary' }), scale('C', 'harmonic_minor', { motion: 'contrary' }), chromatic('F#')] },
  { stage: 'PI7', grade: 'piano_upper_intermediate', items: [...MAJORS12.map((k) => scale(k, 'major')), ...MINORS12.map((k) => scale(k, 'harmonic_minor')), ...MINORS12.map((k) => scale(k, 'melodic_minor')), ...['G', 'C', 'F'].map((k) => arpeggio(k, 'dominant_seventh')), ...['B', 'E', 'A'].map((k) => arpeggio(k, 'diminished_seventh'))] },
  { stage: 'PI8', grade: 'piano_early_advanced', items: [...['D', 'F', 'Ab', 'B'].map((k) => scale(k, 'major', { octaves: 4 })), ...['D', 'F', 'Ab', 'B'].map((k) => scale(k, 'major', { octaves: 2, motion: 'contrary' })), chromatic('C', { octaves: 4 })] },
  { stage: 'PI10', grade: 'piano_pre_professional', items: [wholeTone('Eb'), wholeTone('C'), chromatic('D', { octaves: 4 })] },
];

const KEYS_BY_ACC = { 0: ['C', 'a'], 1: ['G', 'F', 'e', 'd'], 2: ['D', 'Bb', 'b', 'g'], 3: ['A', 'Eb', 'f#', 'c'], 4: ['E', 'Ab', 'c#', 'f'], 5: ['B', 'Db', 'g#', 'bb'], 6: ['F#', 'Gb', 'd#', 'eb'], 7: ['C#', 'Cb', 'a#', 'ab'] };
const keysUpTo = (n) => Object.entries(KEYS_BY_ACC).filter(([k]) => Number(k) <= n).flatMap(([, v]) => v);
const staircase = [
  { level: 'SR1', max_accidentals: 0, keys: ['C'], clefs: ['treble'], metres: ['4/4'], values: ['whole', 'half', 'quarter'], motion: 'steps in one five-finger position', hands: 'one', bars: 4 },
  { level: 'SR2', max_accidentals: 1, keys: ['C', 'G'], clefs: ['treble', 'bass'], metres: ['4/4', '3/4'], values: ['whole', 'half', 'dotted half', 'quarter'], motion: 'steps and thirds', hands: 'one', bars: 4 },
  { level: 'SR3', max_accidentals: 1, keys: ['C', 'G', 'F'], clefs: ['grand staff'], metres: ['4/4', '3/4', '2/4'], values: ['half', 'dotted half', 'quarter', 'quarter rest'], motion: 'hands alternate', hands: 'alternating', bars: 8 },
  { level: 'SR4', max_accidentals: 1, keys: keysUpTo(1), clefs: ['grand staff'], metres: ['4/4', '3/4', '2/4'], values: ['half', 'quarter', 'eighth pairs'], motion: 'hands together, LH long notes', hands: 'together', bars: 8 },
  { level: 'SR5', max_accidentals: 2, keys: keysUpTo(2), clefs: ['grand staff'], metres: ['4/4', '3/4', '2/4'], values: ['quarter', 'eighths', 'dotted quarter + eighth'], motion: 'position shifts', hands: 'together', bars: 8 },
  { level: 'SR6', max_accidentals: 3, keys: keysUpTo(3), clefs: ['grand staff'], metres: ['4/4', '3/4', '6/8', '3/8'], values: ['eighths', 'dotted', 'ties', 'two-note chords'], motion: 'shifts and slurs', hands: 'together', bars: 12 },
  { level: 'SR7', max_accidentals: 4, keys: keysUpTo(4), clefs: ['grand staff'], metres: ['4/4', '3/4', '6/8', '2/2'], values: ['syncopation', 'eighth triplets', 'hairpins'], motion: 'read ahead a beat', hands: 'together', bars: 12 },
  { level: 'SR8', max_accidentals: 5, keys: keysUpTo(5), clefs: ['grand staff', 'clef changes'], metres: ['4/4', '3/4', '6/8', '9/8', '2/2'], values: ['semiquavers', 'triplets', 'ties'], motion: 'page turn', hands: 'together', bars: 16 },
  { level: 'SR9', max_accidentals: 6, keys: keysUpTo(6), clefs: ['grand staff', 'clef changes'], metres: ['5/8', '7/8', '9/8', '5/4', '12/8'], values: ['four-part chords', 'triplets', 'semiquavers'], motion: 'patterns, not single notes', hands: 'together', bars: 16 },
  { level: 'SR10', max_accidentals: 7, keys: keysUpTo(7), clefs: ['grand staff', 'clef changes'], metres: ['changing metres', '7/8', '5/8', '12/8'], values: ['all'], motion: 'full page, tempo changes, 8va', hands: 'together', bars: 32 },
];

const INTERVALS = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12 };
const ear = [
  { stage: 'PI0', items: ['higher or lower', 'loud or soft', 'echo 2-3 notes'] },
  { stage: 'PI1', items: ['step or skip', 'same or different', 'find a 5-note tune by ear'] },
  { stage: 'PI2', items: ['major or minor triad', 'echo a 4-note phrase'], intervals: {} },
  { stage: 'PI3', intervals: { M2: 2, M3: 4, P5: 7, P8: 12 }, items: ['interval by ear (melodic)', 'clap back a 2-bar rhythm'] },
  { stage: 'PI4', intervals: { M2: 2, m3: 3, M3: 4, P4: 5, P5: 7, M6: 9, P8: 12 }, chords: { major: [4, 3], minor: [3, 4] }, items: ['perfect or imperfect cadence'] },
  { stage: 'PI5-7', intervals: INTERVALS, chords: { major: [4, 3], minor: [3, 4], diminished: [3, 3], augmented: [4, 4], dominant_seventh: [4, 3, 3] }, items: ['perfect, plagal, imperfect, interrupted cadence', 'melodic dictation 4 bars', 'play back a 4-bar melody by ear'] },
  { stage: 'PI8-10', intervals: { ...INTERVALS, m9: 13, M9: 14, m10: 15, M10: 16 }, chords: { major: [4, 3], minor: [3, 4], diminished: [3, 3], augmented: [4, 4], dominant_seventh: [4, 3, 3], diminished_seventh: [3, 3, 3], half_diminished_seventh: [3, 3, 4], major_seventh: [4, 3, 4], minor_seventh: [3, 4, 3] }, items: ['modulation to a related key by ear', 'two-part dictation'] },
];

const tempo_ladder = { start_percent: [60, 70], step_percent: 10, small_step_percent: 5, steps_from_60: [60, 70, 80, 90, 100], up_after: '2 clean takes in a row (noteAccuracy 1.0, on_beat_share >= 0.9)', down_after: '2 failed takes', gate_at: 100 };

const out = {
  subject: 'piano', version: 1, status: 'STAGED', generated_by: 'piano/build-drills.js',
  doc: 'Technique batteries per stage (from the scale and arpeggio lessons in curriculum-build/piano/drafts), the sight-reading staircase SR1-SR10, ear batteries with interval and chord sizes in semitones, and the tempo ladder. Note names use # and b; every spelling is re-derived by verify-skill-curricula.js. Tempo targets are per lesson and not set here (exam-board tempo tables were not verified).',
  technique_batteries: batteries,
  sight_reading_staircase: { rule: '>= 80% (pitch and rhythm scored separately, both >= 80%) moves up; 3 failed new excerpts at a level move down; excerpts are generated new each time and never repeat for a learner', levels: staircase, stage_minimum: { PI2: 'SR2', PI3: 'SR3', PI4: 'SR4', PI5: 'SR5', PI6: 'SR6', PI7: 'SR7', PI8: 'SR8', PI9: 'SR9', PI10: 'SR10' } },
  ear_batteries: ear,
  tempo_ladder,
};
fs.writeFileSync(path.join(__dirname, 'drills.json'), JSON.stringify(out, null, 1));
console.log('wrote', batteries.reduce((s, b) => s + b.items.length, 0), 'technique items,', staircase.length, 'staircase levels,', ear.length, 'ear batteries');
