/**
 * A small music-theory engine for the piano question bank.
 *
 * Notes are spelled, not just pitched: F# and Gb are different answers, so every
 * scale, interval and chord is built by letter steps first and then given the
 * accidental that makes the semitone count right. That is how the answer key
 * stays correct in every key, including the ones with double sharps.
 */
const LETTERS = 'CDEFGAB';
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod12 = (n) => ((n % 12) + 12) % 12;

/** "F#" -> { letter: 'F', acc: 1 } */
function parse(note) {
  const m = /^([A-G])(##|#|bb|b|x)?$/.exec(note);
  if (!m) throw new Error(`not a note: ${note}`);
  const acc = { '#': 1, '##': 2, x: 2, b: -1, bb: -2 }[m[2]] || 0;
  return { letter: m[1], acc };
}
const accText = (acc) => ({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[acc]);
const name = (letter, acc) => letter + accText(acc);
const pc = (note) => { const n = parse(note); return mod12(NATURAL[n.letter] + n.acc); };

/** The note `letterSteps` letters above `from` that sits `semis` semitones above it. */
function above(from, letterSteps, semis) {
  const f = parse(from);
  const letter = LETTERS[(LETTERS.indexOf(f.letter) + letterSteps) % 7];
  let acc = mod12(pc(from) + semis - NATURAL[letter]);
  if (acc > 6) acc -= 12;
  if (acc < -2 || acc > 2) return null;
  return name(letter, acc);
}

const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
const MINOR_FORMS = {
  natural: [2, 1, 2, 2, 1, 2, 2],
  harmonic: [2, 1, 2, 2, 1, 3, 1],
  melodic: [2, 1, 2, 2, 2, 2, 1], // ascending
};

function scale(tonic, steps) {
  const out = [tonic];
  let semis = 0;
  for (let i = 0; i < 6; i++) {
    semis += steps[i];
    out.push(above(tonic, i + 1, semis));
  }
  return out;
}
const majorScale = (t) => scale(t, MAJOR_STEPS);
const minorScale = (t, form = 'natural') => scale(t, MINOR_FORMS[form]);

// Keys in circle-of-fifths order, with their signature sizes (+ sharps, - flats).
const MAJOR_KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const MINOR_KEYS = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, 'A#': 7, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7 };
const SHARP_ORDER = ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'];
const FLAT_ORDER = ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb'];
const signature = (n) => (n >= 0 ? SHARP_ORDER.slice(0, n) : FLAT_ORDER.slice(0, -n));
const relativeMinor = (major) => above(major, 5, 9);

const INTERVALS = [
  // [letter steps, semitones, name]
  [0, 0, 'perfect unison'], [1, 1, 'minor 2nd'], [1, 2, 'major 2nd'], [2, 3, 'minor 3rd'], [2, 4, 'major 3rd'],
  [3, 5, 'perfect 4th'], [3, 6, 'augmented 4th'], [4, 6, 'diminished 5th'], [4, 7, 'perfect 5th'],
  [4, 8, 'augmented 5th'], [5, 8, 'minor 6th'], [5, 9, 'major 6th'], [6, 9, 'diminished 7th'],
  [6, 10, 'minor 7th'], [6, 11, 'major 7th'], [7, 12, 'perfect octave'],
];

/** The name of the interval from `a` up to `b` (within an octave). */
function intervalName(a, b) {
  const steps = (LETTERS.indexOf(parse(b).letter) - LETTERS.indexOf(parse(a).letter) + 7) % 7;
  const semis = mod12(pc(b) - pc(a));
  const hit = INTERVALS.find(([s, n]) => s === steps && n === semis);
  return hit ? hit[2] : null;
}

const CHORDS = {
  major: { steps: [[2, 4], [4, 7]], symbol: '' },
  minor: { steps: [[2, 3], [4, 7]], symbol: 'm' },
  diminished: { steps: [[2, 3], [4, 6]], symbol: 'dim' },
  augmented: { steps: [[2, 4], [4, 8]], symbol: 'aug' },
  'major 7th': { steps: [[2, 4], [4, 7], [6, 11]], symbol: 'maj7' },
  'dominant 7th': { steps: [[2, 4], [4, 7], [6, 10]], symbol: '7' },
  'minor 7th': { steps: [[2, 3], [4, 7], [6, 10]], symbol: 'm7' },
  'half-diminished 7th': { steps: [[2, 3], [4, 6], [6, 10]], symbol: 'm7b5' },
  'diminished 7th': { steps: [[2, 3], [4, 6], [6, 9]], symbol: 'dim7' },
};
function chord(root, quality) {
  const notes = [root, ...CHORDS[quality].steps.map(([s, n]) => above(root, s, n))];
  return notes.includes(null) ? null : notes;
}

// Staff positions: index 0 is the bottom line. Treble bottom line E4, bass bottom line G2.
const STAFF_BOTTOM = { treble: { letter: 'E', octave: 4 }, bass: { letter: 'G', octave: 2 } };
/** The note at a staff position (0 = bottom line, 1 = first space, ... 8 = top line; negatives below). */
function staffNote(clef, position) {
  const b = STAFF_BOTTOM[clef];
  const idx = LETTERS.indexOf(b.letter) + b.octave * 7 + position;
  return { letter: LETTERS[mod7(idx)], octave: Math.floor(idx / 7) };
}
const mod7 = (n) => ((n % 7) + 7) % 7;
// Lines and spaces are numbered from the bottom of the staff, so the text says so:
// "line 2" alone does not tell a beginner which end to count from.
const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th'];
const LEDGER = ['', 'first', 'second', 'third'];
function describePosition(position) {
  if (position >= 0 && position <= 8) {
    return position % 2 === 0 ? `the ${ORDINAL[position / 2 + 1]} line from the bottom` : `the ${ORDINAL[(position + 1) / 2]} space from the bottom`;
  }
  const below = position < 0;
  const n = below ? Math.ceil(-position / 2) : Math.ceil((position - 8) / 2);
  const way = below ? 'below' : 'above';
  if (position % 2 === 0) return `the ${LEDGER[n]} ledger line ${way} the staff`;
  return n === 1 ? `the space just ${way} the staff` : `the space just ${way} the ${LEDGER[n - 1]} ledger line ${way} the staff`;
}

module.exports = {
  LETTERS, parse, pc, above, majorScale, minorScale, MAJOR_KEYS, MINOR_KEYS, signature, relativeMinor,
  intervalName, INTERVALS, CHORDS, chord, staffNote, describePosition,
};
