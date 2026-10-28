/**
 * Piano items: the deterministic fallback for the piano track.
 *
 * Everything that has a worked-out answer is computed by piano-theory.js: the
 * keyboard, staff reading, rhythm arithmetic, key signatures, scales, intervals,
 * chords and jazz progressions. Playing itself is judged by the levels, not here;
 * these items cover the knowledge that playing rests on. The idea skills
 * (terms, technique, repertoire and history, practice, the profession, science)
 * come from authored pools kept to settled facts.
 */
const T = require('./piano-theory');
const { fromPool } = require('./pool');

const item = (o) => ({ source: 'bank', ...o });
const KEYS = Object.keys(T.MAJOR_KEYS);
const easyKeys = ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb'];
const keyFor = (rng, d) => rng.pick(d <= 4 ? easyKeys : KEYS);
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
// Shuffled: the bank shows choices in the order given, so an answer listed first is
// an answer always in the top slot.
const choices = (rng, answer, pool, n = 3) => rng.shuffle([answer, ...rng.sample(pool.filter((x) => x !== answer), n)]);
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
// A double sharp is also written "x" (Fx for F##); both spellings are the right answer.
const withX = (...answers) => [...new Set(answers.flatMap((a) => [a, a.replace(/##/g, 'x')]))];
const ALL_NOTES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

const G = {
  piano_keyboard(rng, d) {
    const kind = rng.pick(d <= 3 ? ['landmark', 'halfstep'] : ['landmark', 'halfstep', 'count']);
    if (kind === 'landmark') {
      const q = rng.pick([
        ['Which white key sits just to the left of a group of two black keys?', 'C', 'C is always just left of the two black keys, which is how you find it anywhere on the piano.'],
        ['Which white key sits just to the left of a group of three black keys?', 'F', 'F is just left of the three black keys.'],
        ['Which white key sits between the two black keys of a group of two?', 'D', 'D sits in the middle of the two black keys.'],
        ['Which white key sits just to the right of a group of two black keys?', 'E', 'E is just right of the two black keys, and E to F has no black key between them.'],
        ['Which white key sits just to the right of a group of three black keys?', 'B', 'B is just right of the three black keys, and B to C has no black key between them.'],
      ]);
      return item({ format: 'multiple_choice', prompt: q[0], choices: choices(rng, q[1], ['C', 'D', 'E', 'F', 'G', 'A', 'B']), answer: q[1], rationale: q[2] });
    }
    if (kind === 'halfstep') {
      const from = rng.pick(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
      const up = rng.next() < 0.5;
      const target = T.above(from, up ? 1 : 6, up ? 1 : 11);
      const plain = { 'B#': 'C', 'E#': 'F', Cb: 'B', Fb: 'E' }[target] || target;
      const accepts = [...new Set([target, plain, ...(plain.includes('#') ? [T.above(plain, 1, 0)] : []), ...(plain.includes('b') ? [T.above(plain, 6, 0)] : [])].filter(Boolean))];
      return item({
        format: 'type_in', prompt: `What key is a half step ${up ? 'above' : 'below'} ${from}?`, answer: plain, accepts,
        rationale: `A half step is the very next key, black or white. ${['E', 'B'].includes(from) && up ? `There is no black key after ${from}, so it is the white key ${plain}.` : ['C', 'F'].includes(from) && !up ? `There is no black key before ${from}, so it is the white key ${plain}.` : `From ${from} that is the black key ${plain}, also written ${accepts.find((x) => x !== plain && x !== target) || accepts.find((x) => x !== plain)}.`}`,
      });
    }
    const a = rng.pick(['C', 'D', 'E', 'F', 'G', 'A']);
    const b = rng.pick(['D', 'E', 'F', 'G', 'A', 'B'].filter((x) => 'CDEFGAB'.indexOf(x) > 'CDEFGAB'.indexOf(a)));
    const n = (T.pc(b) - T.pc(a) + 12) % 12;
    return item({ format: 'type_in', prompt: `How many half steps is it from ${a} up to ${b}?`, answer: String(n), rationale: `Count every key, black and white, after ${a} up to and including ${b}: ${n}.` });
  },

  piano_reading(rng, d) {
    const clef = d <= 2 ? 'treble' : rng.pick(['treble', 'bass']);
    const lo = d <= 3 ? 0 : d <= 6 ? -2 : -5;
    const hi = d <= 3 ? 8 : d <= 6 ? 10 : 13;
    const pos = rng.int(lo, hi);
    const note = T.staffNote(clef, pos);
    return item({
      format: 'multiple_choice', prompt: `In the ${clef} clef, which note sits on ${T.describePosition(pos)}?`,
      choices: choices(rng, note.letter, ['C', 'D', 'E', 'F', 'G', 'A', 'B']), answer: note.letter,
      rationale: `The ${clef} clef's bottom line is ${clef === 'treble' ? 'E' : 'G'}; each line or space up is the next letter, and each one down the letter before. This note is ${note.letter}${note.octave}${note.letter === 'C' && note.octave === 4 ? ', middle C' : ''}.`,
    });
  },

  piano_rhythm(rng, d) {
    const VALUES = d <= 3
      ? [['whole note', 4], ['half note', 2], ['quarter note', 1]]
      : [['whole note', 4], ['dotted half note', 3], ['half note', 2], ['dotted quarter note', 1.5], ['quarter note', 1], ['eighth note', 0.5], ['sixteenth note', 0.25]];
    if (d >= 5 && rng.next() < 0.4) {
      const [sig, eighths, kind] = rng.pick([['6/8', 6, 'compound duple'], ['9/8', 9, 'compound triple'], ['12/8', 12, 'compound quadruple'], ['3/4', 6, 'simple triple'], ['2/4', 4, 'simple duple'], ['5/4', 10, 'irregular']]);
      return item({ format: 'type_in', prompt: `How many eighth notes fill one bar of ${sig}?`, answer: String(eighths), rationale: `${sig} is ${kind} time; it holds ${eighths} eighth notes.` });
    }
    const picked = rng.sample(VALUES, rng.int(2, d <= 3 ? 2 : 3));
    const total = picked.reduce((s, [, v]) => s + v, 0);
    return item({
      format: 'type_in', prompt: `Counting a quarter note as one beat, how many beats do these notes last together: ${picked.map(([n]) => `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`).join(', ')}?`,
      answer: String(total), accepts: [String(total), total % 1 ? String(total).replace('.5', ' and a half') : String(total)],
      rationale: `${picked.map(([n, v]) => `${n} = ${v}`).join(', ')}; together ${total} beats. A dot adds half the note's value.`,
    });
  },

  piano_keys(rng, d) {
    const minor = d >= 5 && rng.next() < 0.4;
    const table = minor ? T.MINOR_KEYS : T.MAJOR_KEYS;
    const keys = Object.keys(table).filter((k) => d >= 6 || Math.abs(table[k]) <= 4);
    const key = rng.pick(keys);
    const n = table[key];
    const sig = T.signature(n);
    const label = `${key} ${minor ? 'minor' : 'major'}`;
    if (rng.next() < 0.5) {
      const answer = n === 0 ? 'none' : `${Math.abs(n)} ${n > 0 ? 'sharp' : 'flat'}${Math.abs(n) > 1 ? 's' : ''}`;
      const pool = ['none', ...[1, 2, 3, 4, 5, 6, 7].flatMap((k) => [`${k} sharp${k > 1 ? 's' : ''}`, `${k} flat${k > 1 ? 's' : ''}`])];
      return item({ format: 'multiple_choice', prompt: `How many sharps or flats are in the key signature of ${label}?`, choices: choices(rng, answer, pool), answer,
        rationale: n === 0 ? `${label} has no sharps or flats.` : `${label} has ${answer}: ${sig.join(', ')}. Sharps are added in the order F C G D A E B; flats in the order B E A D G C F.` });
    }
    const other = minor ? Object.keys(T.MAJOR_KEYS).find((k) => T.MAJOR_KEYS[k] === n) : T.relativeMinor(key);
    return item({ format: 'multiple_choice', prompt: minor ? `What is the relative major of ${label}?` : `What is the relative minor of ${label}?`,
      // A distractor spelled as the same pitch (Eb for D#) would be the same key under
      // another name, so those are left out.
      choices: choices(rng, other, KEYS.filter((k) => T.pc(k) !== T.pc(other))), answer: other,
      rationale: `Relative keys share a key signature. The relative minor starts on the 6th note of the major scale (three half steps below its tonic): ${minor ? `${other} major and ${label}` : `${label} and ${other} minor`}.` });
  },

  piano_scales(rng, d) {
    const minor = d >= 5 && rng.next() < 0.5;
    const form = minor ? rng.pick(['natural', 'harmonic', 'melodic']) : null;
    const tonic = minor ? rng.pick(Object.keys(T.MINOR_KEYS).filter((k) => d >= 7 || Math.abs(T.MINOR_KEYS[k]) <= 4)) : keyFor(rng, d);
    const sc = minor ? T.minorScale(tonic, form) : T.majorScale(tonic);
    const deg = rng.int(1, 6);
    const label = minor ? `${tonic} ${form} minor${form === 'melodic' ? ' (ascending)' : ''}` : `${tonic} major`;
    return item({
      format: 'type_in', prompt: `What is the ${ORD[deg]} note of the ${label} scale? Spell it with the right sharp or flat.`,
      answer: sc[deg], accepts: withX(sc[deg]), rationale: `${label}: ${sc.join(' ')}. Each letter appears once, so ${sc[deg]} is the ${ORD[deg]} note.`,
    });
  },

  piano_intervals(rng, d) {
    const pool = T.INTERVALS.filter(([s, , n]) => s > 0 && s < 7 && (d >= 6 || !/augmented|diminished/.test(n)) && (d >= 3 || /(major|perfect)/.test(n)));
    const [steps, semis, iname] = rng.pick(pool);
    const from = rng.pick(d <= 4 ? ['C', 'D', 'F', 'G', 'A'] : ALL_NOTES.filter((x) => x !== 'A#' && x !== 'D#' && x !== 'G#'));
    const to = T.above(from, steps, semis);
    if (!to) return G.piano_intervals(rng, Math.max(1, d - 1));
    if (rng.next() < 0.5) {
      return item({ format: 'multiple_choice', prompt: `What is the interval from ${from} up to ${to}?`, choices: choices(rng, iname, T.INTERVALS.map((x) => x[2])), answer: iname,
        rationale: `Count the letters ${from} to ${to} (${steps + 1}, so a ${steps + 1}${steps + 1 === 2 ? 'nd' : steps + 1 === 3 ? 'rd' : 'th'}) and the half steps (${semis}): that makes it ${article(iname)} ${iname}.` });
    }
    return item({ format: 'type_in', prompt: `What note is ${article(iname)} ${iname} above ${from}? Spell it correctly.`, answer: to, accepts: withX(to),
      rationale: `${article(iname) === 'an' ? 'An' : 'A'} ${iname} spans ${steps + 1} letter names and ${semis} half step${semis === 1 ? '' : 's'}, so from ${from} it is ${to}.` });
  },

  piano_chords(rng, d) {
    const qualities = d <= 3 ? ['major', 'minor'] : d <= 6 ? ['major', 'minor', 'diminished', 'augmented', 'dominant 7th'] : Object.keys(T.CHORDS);
    for (let tries = 0; tries < 20; tries++) {
      const root = rng.pick(d <= 4 ? ['C', 'D', 'E', 'F', 'G', 'A'] : ALL_NOTES);
      const quality = rng.pick(qualities);
      const notes = T.chord(root, quality);
      // Double sharps and flats are correct but belong to the top of the course.
      if (!notes || (d < 9 && notes.some((x) => /##|bb/.test(x)))) continue;
      const symbol = root + T.CHORDS[quality].symbol;
      if (rng.next() < 0.5) {
        return item({ format: 'type_in', prompt: `Spell the ${root} ${quality} chord (${symbol}) from the root up, notes separated by spaces.`,
          answer: notes.join(' '), accepts: withX(notes.join(' '), notes.join(', '), notes.join(','), notes.join('-')),
          rationale: `${symbol} is built in stacked thirds on ${root}: ${notes.join(' ')}.` });
      }
      return item({ format: 'multiple_choice', prompt: `Which chord symbol names the notes ${notes.join(' ')}?`,
        choices: choices(rng, symbol, Object.values(T.CHORDS).map((c) => root + c.symbol)), answer: symbol,
        rationale: `${notes.join(' ')} is ${article(quality)} ${quality} chord on ${root}, written ${symbol}.` });
    }
    return G.piano_intervals(rng, d);
  },

  piano_jazz(rng, d) {
    const key = keyFor(rng, d);
    const sc = T.majorScale(key);
    const [two, five, one] = [T.chord(sc[1], 'minor 7th'), T.chord(sc[4], 'dominant 7th'), T.chord(sc[0], 'major 7th')];
    if (!two || !five || !one) return G.piano_chords(rng, d);
    const answer = `${sc[1]}m7 ${sc[4]}7 ${key}maj7`;
    return item({ format: 'multiple_choice', prompt: `Which is the ii-V-I progression in ${key} major?`,
      choices: rng.shuffle([answer, `${sc[3]}maj7 ${sc[4]}7 ${key}maj7`, `${sc[1]}7 ${sc[4]}m7 ${key}maj7`, `${sc[5]}m7 ${sc[1]}m7 ${key}maj7`]),
      answer, rationale: `Build seventh chords on scale degrees 2, 5 and 1 of ${key} major: ${answer}. The ii-V-I is the most common progression in jazz.` });
  },
};

// ── Authored pools ───────────────────────────────────────────────────────
const POOLS = {
  piano_terms: [
    { d: 2, p: 'What does "forte" (f) mean?', c: ['Loud', 'Soft', 'Fast', 'Slow'], a: 'Loud', r: 'Forte means loud; piano (p) means soft.' },
    { d: 2, p: 'What does "piano" (p) mean as a dynamic?', c: ['Soft', 'Loud', 'Gradually louder', 'Detached'], a: 'Soft', r: 'The instrument\'s full name, pianoforte, means soft-loud.' },
    { d: 3, p: 'What does "crescendo" mean?', c: ['Gradually getting louder', 'Gradually getting softer', 'Gradually getting faster', 'Suddenly loud'], a: 'Gradually getting louder', r: 'Diminuendo (or decrescendo) is the opposite.' },
    { d: 3, p: 'What does "staccato" (a dot above or below a note) ask for?', c: ['Short and detached', 'Smooth and connected', 'Held for its full value', 'Accented'], a: 'Short and detached', r: 'Legato is the opposite: smooth and connected.' },
    { d: 4, p: 'What does "allegro" mean?', c: ['Fast and lively', 'Slow', 'At a walking pace', 'Very slow'], a: 'Fast and lively', r: 'Andante is a walking pace; adagio and largo are slow.' },
    { d: 4, p: 'What does "D.C. al Fine" tell you to do?', c: ['Go back to the beginning and play until Fine', 'Go back to the sign and play to the end', 'Repeat the last bar', 'Play the ending twice'], a: 'Go back to the beginning and play until Fine', r: 'Da capo means "from the head"; D.S. means "from the sign".' },
    { d: 5, p: 'What does "rallentando" (rall.) mean?', c: ['Gradually slowing down', 'Gradually speeding up', 'Return to the original speed', 'In strict time'], a: 'Gradually slowing down', r: 'Accelerando speeds up; a tempo returns to the original speed.' },
    { d: 6, p: 'What does "una corda" ask the pianist to do?', c: ['Press the left (soft) pedal', 'Press the right (sustain) pedal', 'Play with one hand', 'Play one note at a time'], a: 'Press the left (soft) pedal', r: '"Tre corde" cancels it. On a grand, the soft pedal shifts the hammers so fewer strings are struck.' },
    { d: 7, p: 'What does "rubato" mean?', c: ['Flexible tempo, stretching and giving back time for expression', 'Strictly in time', 'Very fast', 'Played with the pedal throughout'], a: 'Flexible tempo, stretching and giving back time for expression', r: 'Rubato literally means "robbed" time and is central to Romantic style.' },
  ],
  piano_technique: [
    { d: 2, p: 'Which finger number is the thumb?', c: ['1', '5', '2', '3'], a: '1', r: 'Fingers are numbered 1 (thumb) to 5 (little finger) on both hands.' },
    { d: 3, p: 'In the C major scale with the right hand going up, where does the thumb pass under?', c: ['After finger 3 plays E, the thumb plays F', 'After finger 4 plays F', 'After finger 2 plays D', 'The thumb never passes under'], a: 'After finger 3 plays E, the thumb plays F', r: 'Standard fingering is 1 2 3 1 2 3 4 5 for one octave.' },
    { d: 4, p: 'What is legato pedalling (syncopated pedalling)?', c: ['Lifting the pedal as you play the new chord and pressing it again just after', 'Pressing the pedal before playing each chord', 'Holding the pedal down for the whole piece', 'Using only the soft pedal'], a: 'Lifting the pedal as you play the new chord and pressing it again just after', r: 'Changing just after the new sound connects chords without blurring them.' },
    { d: 4, p: 'What should you do if playing hurts?', c: ['Stop, rest and check your posture or ask a teacher', 'Play through it to build strength', 'Practise faster to finish sooner', 'Ignore it if it only hurts a little'], a: 'Stop, rest and check your posture or ask a teacher', r: 'Pain is a warning sign; sudden increases in practice and no breaks raise injury risk.' },
    { d: 5, p: 'What is the main purpose of practising a passage slowly?', c: ['To play the right notes, fingering and sound every time so the correct version is learned', 'To build endurance', 'To make the piece easier to memorise by ear', 'It has no real benefit'], a: 'To play the right notes, fingering and sound every time so the correct version is learned', r: 'Accurate repetitions, not just more repetitions, predict progress.' },
    { d: 6, p: 'On a grand piano, what does the middle (sostenuto) pedal do?', c: ['Sustains only the notes held down when it is pressed', 'Sustains every note played', 'Softens the sound', 'Mutes the strings'], a: 'Sustains only the notes held down when it is pressed', r: 'It lets a bass note ring while the hands play cleanly above it.' },
    // "Voicing" also names how a chord's notes are spaced (jazz, arranging), so the
    // prompt says it means the touch here, and no option is about spacing.
    { d: 7, p: 'In piano technique, what does it mean to "voice" a chord?', c: ['Making one note, often the melody, sound louder than the others', 'Singing along while playing', 'Playing the notes one at a time', 'Playing every note of the chord equally loud'], a: 'Making one note, often the melody, sound louder than the others', r: 'It is done by weighting that finger more; it is central to a singing tone. In jazz and arranging, a chord\'s "voicing" also means how its notes are spaced.' },
  ],
  piano_repertoire: [
    { d: 3, p: 'Which composer wrote the 48 Preludes and Fugues of "The Well-Tempered Clavier"?', c: ['J. S. Bach', 'Mozart', 'Chopin', 'Handel'], a: 'J. S. Bach', r: 'Two books of 24 preludes and fugues, one in every major and minor key.' },
    { d: 3, p: 'The popular Minuet in G from the Anna Magdalena Bach Notebook is now attributed to…', c: ['Christian Petzold', 'J. S. Bach', 'Handel', 'Telemann'], a: 'Christian Petzold', r: 'It was long credited to Bach, but scholars attribute it to Petzold.' },
    { d: 4, p: 'Which musical period do Haydn, Mozart and early Beethoven belong to?', c: ['Classical', 'Baroque', 'Romantic', 'Impressionist'], a: 'Classical', r: 'Roughly 1750-1820; balanced phrases, clear forms such as the sonata.' },
    { d: 4, p: 'Which composer wrote most of his music for solo piano, including nocturnes, mazurkas and ballades?', c: ['Frédéric Chopin', 'Johannes Brahms', 'Franz Schubert', 'Claude Debussy'], a: 'Frédéric Chopin', r: 'Chopin (1810-1849) wrote almost exclusively for the piano.' },
    { d: 5, p: 'How many piano sonatas did Beethoven write (the standard numbered set)?', c: ['32', '24', '48', '12'], a: '32', r: 'The 32 sonatas span his whole career and are a core of the repertoire.' },
    { d: 5, p: 'Which composer is most associated with Impressionism at the piano, with pieces like "Clair de lune"?', c: ['Claude Debussy', 'Franz Liszt', 'Sergei Rachmaninoff', 'Robert Schumann'], a: 'Claude Debussy', r: 'Clair de lune is from his Suite bergamasque.' },
    { d: 6, p: 'What is an "Urtext" edition?', c: ['An edition that aims to show what the composer wrote, with editorial additions marked', 'A simplified edition for beginners', 'An arrangement for two pianos', 'A recording of the first performance'], a: 'An edition that aims to show what the composer wrote, with editorial additions marked', r: 'Henle and Wiener Urtext are well-known publishers of Urtext editions.' },
    { d: 7, p: 'Which early hammer keyboard, played by Mozart and Haydn, is the forerunner of the modern piano?', c: ['The fortepiano', 'The harpsichord', 'The organ', 'The clavichord'], a: 'The fortepiano', r: 'Cristofori built the first piano, with hammers, around 1700. The harpsichord plucks its strings, the clavichord presses them with metal tangents, and the organ sounds pipes with air.' },
  ],
  piano_practice: [
    { d: 3, p: 'When you make a mistake while practising, what works best?', c: ['Stop, find the exact spot, fix it slowly, play it right several times, then rejoin', 'Start again from the very beginning', 'Keep going and hope it improves', 'Play the whole piece faster'], a: 'Stop, find the exact spot, fix it slowly, play it right several times, then rejoin', r: 'Fixing errors precisely is what best predicts progress.' },
    { d: 4, p: 'Why play a piece "cold" the next day before warming up?', c: ['It shows what you really learned, not what you can do after repeating it', 'Cold hands play better', 'It saves time', 'It is the best warm-up'], a: 'It shows what you really learned, not what you can do after repeating it', r: 'Performance right after repetition overstates learning; the next-day take is the honest measure.' },
    { d: 5, p: 'Which memorisation method do concert pianists rely on most?', c: ['Knowing the structure and having planned cues they can start from anywhere', 'Only finger memory from many repetitions', 'Memorising by looking at the score once', 'Playing with eyes closed'], a: 'Knowing the structure and having planned cues they can start from anywhere', r: 'Chaffin and Imreh\'s studies show experts build a map of performance cues.' },
    { d: 6, p: 'Which is a well-supported way to manage performance nerves?', c: ['Gradual exposure: perform first privately, then for one person, then for small groups', 'Avoid performing until you feel no nerves', 'Practise only on the day', 'Play faster to finish quickly'], a: 'Gradual exposure: perform first privately, then for one person, then for small groups', r: 'Graded exposure and a routine before playing are common, practical approaches.' },
  ],
  piano_profession: [
    { d: 5, p: 'What is a collaborative pianist?', c: ['A pianist who plays with singers, instrumentalists or ensembles as an equal partner', 'A pianist who only plays solo recitals', 'A piano tuner', 'A pianist who composes'], a: 'A pianist who plays with singers, instrumentalists or ensembles as an equal partner', r: 'The field covers art song, instrumental duos, opera coaching and chamber music.' },
    { d: 6, p: 'What does a piano technician do when "regulating" a piano?', c: ['Adjusts the action so the keys and hammers respond evenly', 'Tunes the strings', 'Replaces the soundboard', 'Polishes the case'], a: 'Adjusts the action so the keys and hammers respond evenly', r: 'Tuning, regulation and voicing are the three core parts of piano care.' },
    { d: 6, p: 'What is equal temperament?', c: ['A tuning that divides the octave into 12 equal half steps', 'A tuning with pure fifths throughout', 'A tuning used only for Baroque music', 'A tuning that changes with each key'], a: 'A tuning that divides the octave into 12 equal half steps', r: 'It makes every key usable at the cost of slightly impure thirds and fifths.' },
    { d: 5, p: 'In a good first lesson with a young child, the teacher should mostly…', c: ['Have them play and explore sounds quickly, with short activities and early success', 'Explain all of music theory first', 'Correct every detail of posture before playing', 'Assign an hour of daily practice'], a: 'Have them play and explore sounds quickly, with short activities and early success', r: 'Early success and short activities support motivation in young beginners.' },
  ],
  piano_science: [
    { d: 6, p: 'Why are a piano string\'s overtones slightly sharper than exact multiples of the fundamental?', c: ['The steel string is stiff, which raises the higher partials (inharmonicity)', 'The hammer hits too hard', 'The soundboard is curved', 'The room adds reverb'], a: 'The steel string is stiff, which raises the higher partials (inharmonicity)', r: 'Inharmonicity is why tuners stretch octaves, especially at the top and bottom.' },
    { d: 7, p: 'What does a MIDI keyboard send to a computer when a key is played?', c: ['Which note, when, and how fast the key went down (velocity), but no audio', 'An audio recording of the note', 'Only the note name', 'Only how long the note lasted'], a: 'Which note, when, and how fast the key went down (velocity), but no audio', r: 'That is why MIDI can judge notes, timing and dynamics more reliably than a microphone.' },
    { d: 7, p: 'Why is grading piano playing from a microphone harder than from MIDI?', c: ['Many notes sound at once and overlap, so separating them from audio is error-prone', 'Microphones cannot hear low notes', 'Audio has no timing information', 'Pianos are too quiet'], a: 'Many notes sound at once and overlap, so separating them from audio is error-prone', r: 'Polyphonic transcription is an active research area; single lines are much easier.' },
    { d: 8, p: 'Do music lessons reliably raise children\'s IQ or school grades?', c: ['No; well-controlled studies find little or no far-transfer effect', 'Yes, by about 10 IQ points', 'Yes, but only with Mozart', 'Yes, for every child'], a: 'No; well-controlled studies find little or no far-transfer effect', r: 'Meta-analyses (e.g. Sala and Gobet) find effects vanish in better-designed studies. Learn piano for piano.' },
  ],
};

for (const [skill, pool] of Object.entries(POOLS)) G[skill] = fromPool(pool, skill);

module.exports = { GENERATORS: G, POOLS };
