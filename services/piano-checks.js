/**
 * Checking what a model writes about notes to be played, and grading what was played.
 *
 * A "keys" check asks the learner to play something: a chord (any order, any
 * octave), a sequence of notes (in order, any octave) or a set of notes (any
 * order, any octave). Where the question names a chord or a scale ("Play the D
 * major triad"), the answer is worked out again with the theory engine
 * (content/piano-theory.js) and must agree, so a wrong key written by the model
 * never reaches a learner.
 *
 * Every rule below was written for something the model really wrote; the tests in
 * scripts/piano-items-test.js keep those prompts and keys.
 */
const P = require('../public/engine/piano/piano-core');
const T = require('../content/piano-theory');

const QUALITY = {
  major: 'major', minor: 'minor', diminished: 'diminished', augmented: 'augmented',
  'dominant 7th': 'dominant 7th', 'dominant seventh': 'dominant 7th', 'major 7th': 'major 7th', 'major seventh': 'major 7th',
  'minor 7th': 'minor 7th', 'minor seventh': 'minor 7th',
};

/** The pitch classes a prompt's named chord or scale must have, or null when it names none. */
function expectedFromPrompt(prompt) {
  const text = String(prompt || '');
  const chord = /\b([A-G](?:#|b)?)\s+(major 7th|major seventh|minor 7th|minor seventh|dominant 7th|dominant seventh|major|minor|diminished|augmented)\s+(chord|triad)\b/i.exec(text);
  if (chord) {
    const root = chord[1][0].toUpperCase() + chord[1].slice(1);
    const notes = T.chord(root, QUALITY[chord[2].toLowerCase()]);
    return notes ? { mode: 'chord', pcs: notes.map((n) => T.pc(n)), names: notes, label: `${root} ${chord[2].toLowerCase()} ${chord[3].toLowerCase()}` } : null;
  }
  const scale = /\b([A-G](?:#|b)?)\s+(major|natural minor|harmonic minor|melodic minor)\s+scale\b/i.exec(text);
  if (scale) {
    const root = scale[1][0].toUpperCase() + scale[1].slice(1);
    const kind = scale[2].toLowerCase();
    const notes = kind === 'major' ? T.majorScale(root) : T.minorScale(root, kind.split(' ')[0]);
    if (notes.includes(null)) return null;
    return { mode: 'sequence', pcs: notes.map((n) => T.pc(n)).concat([T.pc(root)]), names: notes.concat([root]), label: `${root} ${kind} scale` };
  }
  return null;
}

const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

/** Does the prompt let the learner choose what to play ("any black key", "your own tune")? "Any order" and "any octave" do not count. */
function openEnded(prompt) {
  const p = String(prompt || '').toLowerCase().replace(/\bany (order|octave)\b/g, '');
  return /\b(any|anything|whatever|you like|your own|you choose|of your choice|make up|improvi[sz]\w*)\b/.test(p);
}

// A check is silent and untimed: the page plays nothing and measures no rhythm.
const NEEDS_SOUND = /\b(echo|heard|you hear|listen|play (it |that |this )?back|copy (the|what)|groove|backing|the band|play along|along with|in time with)\b/;
const NEEDS_TIMING = /\b(on (each|every|the) beats?|one (key|note) (per|each|a) beat|in time|steady (pulse|beat)|with the beat|to the beat)\b/;
// The black keys come in a group of two (C#, D#) and a group of three (F#, G#, A#).
const TWO_GROUP = /\b(group of (two|2)( black)?( keys)?|(two|2)[- ]group|(two|2)[- ](black[- ])?key[- ]group|black[- ]key pair|pair of black keys|twin black keys)\b/;
const THREE_GROUP = /\b(group of (three|3)( black)?( keys)?|(three|3)[- ]group|(three|3)[- ](black[- ])?key[- ]group)\b/;
const TWO_PCS = [1, 3];
const THREE_PCS = [6, 8, 10];
// "Just above the group of three": the group is a landmark, not what is played.
const LANDMARK = /\b(above|below|beside|next to|after|before|past|beyond|left of|right of|up from|down from)\s+(the|that|this|a)\s+$/;
// "Play a black key from the group of three" has three right answers.
const PICK_ONE = /\b(a|one|some)\s+(black\s+|white\s+)?(key|note)s?\s+(from|in|of|out of)\b/;
const NAMES_ONE = /\b(lowest|highest|leftmost|rightmost|left|right|first|last|middle|top|bottom|named|called)\b/;
// Words that say in what order a line of notes goes. "Next to" and "the lowest group"
// are places, not orders, so a bare "next", "first" or "lowest" does not count.
const ORDER_WORDS = /\b(left to right|right to left|low(est)? to high(est)?|high(est)? to low(est)?|bottom to top|top to bottom|(lowest|highest|left(most)?|right(most)?|top|bottom|low|high)( (one|key|note))? first|going (up|down)|goes (up|down)|walk(ing|s)? (up|down)|mov(e|es|ing) (up|down|left|right)|steps? (up|down|right|left)|stepping (up|down|right|left)|up and (back )?down|down and (back )?up|ascending|descending|upwards?|downwards?|in (this|that|the same) order|in order|then|after that|followed by|start(ing)? (on|at|with|from)|begin(ning)? (on|at|with)|end(ing)? on|finish(ing)? on|scale|tune|melody|song|phrase|arpeggio)\b/;

/** Is a group of black keys named as the thing to play (not as a landmark), with no more notes than it has? */
function playsGroup(p, re, size, count) {
  if (count > size) return false;
  const m = re.exec(p);
  return !!m && !LANDMARK.test(p.slice(Math.max(0, m.index - 24), m.index));
}

/** Does a prompt say in what order its notes are played: order words, or the notes named in turn? */
function statesOrder(prompt) {
  const raw = String(prompt || '');
  if (ORDER_WORDS.test(raw.toLowerCase())) return true;
  // Note names with an accidental or an octave ("C#", "Bb", "E4"), not a lone capital like "A pair".
  const named = raw.match(/\b[A-G](?:#|b|♯|♭)\d?(?![a-z])|\b[A-G]\d(?![a-z])/g) || [];
  return named.length >= 2;
}

/**
 * The mode a keys check is graded in, from what the model set and what the prompt
 * says. Different keys asked for with no order ("play the group of two") are a set,
 * right in any order: grading them in one order would mark a right answer wrong.
 */
function modeFor(prompt, rawMode, notes) {
  const p = String(prompt || '');
  if (rawMode === 'chord' || /\b(chord|triad|together|at the same time|at once)\b/i.test(p)) return 'chord';
  if (rawMode === 'set' || /\bany order\b/i.test(p)) return 'set';
  if (notes && notes.length > 1 && new Set(notes.map(P.pitchClass)).size === notes.length && !statesOrder(p)) return 'set';
  return 'sequence';
}

// ── songs the model names ────────────────────────────────────────────────────
// The model does not reliably know a melody: asked for Mary Had a Little Lamb on the
// black keys it wrote F# G# A# A# G# G# F# (the tune is A# G# F# G# A# A# A#). When a
// prompt names a song in the library, the notes are held to the library's melody.

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The library song a text names by title ("Mary Had a Little Lamb", "Für Elise"), or null. */
function songNamed(text) {
  // eslint-disable-next-line global-require
  const { SONGS } = require('../content/piano-songs');
  const t = ` ${fold(text)} `;
  const base = (s) => fold(s.title.replace(/\(.*?\)/g, ''));
  const hits = SONGS.filter((s) => base(s).length >= 6 && t.includes(` ${base(s)} `));
  if (!hits.length) return null;
  const longest = Math.max(...hits.map((s) => base(s).length));
  const top = hits.filter((s) => base(s).length === longest);
  // The black-key arrangement when the text is about black keys, else the other.
  const black = /\bblack\b/.test(t) || TWO_GROUP.test(t) || THREE_GROUP.test(t);
  return top.find((s) => /black/.test(s.id) === black) || top[0];
}

/** A song's right-hand melody, top note of each event, as MIDI numbers. */
function melodyOf(song) {
  return P.parsePart(song.rh).events.map((e) => Math.max(...e.midis));
}

const steps = (ms) => ms.slice(1).map((m, i) => m - ms[i]);

/**
 * Do these notes follow the song's melody, in any key: the same steps up and down as
 * a run of the melody (from its start, when `fromStart`)? Too few notes to tell is a yes.
 */
function followsMelody(notes, song, fromStart) {
  if (notes.length < 3) return true;
  const want = steps(melodyOf(song));
  const got = steps(notes);
  const at = (i) => got.every((x, k) => want[i + k] === x);
  if (fromStart) return at(0);
  for (let i = 0; i + got.length <= want.length; i++) if (at(i)) return true;
  return false;
}

/** How a library song's melody goes, for a refusal the repair call can act on. */
function melodyText(song, count = 8) {
  return melodyOf(song).slice(0, count).map(P.midiToName).join(' ');
}

/**
 * Why a keys check's key cannot be the one right answer to its prompt, or ''.
 *
 * Each of these was written by the model in a real lesson: "play any black key"
 * with one key accepted, "echo the phrase you heard" on a check that plays no
 * sound, "one key from each group" answered with three notes, "the group of three
 * just above middle C" keyed C# D# F#, "play the jam phrase over the groove" on a
 * silent check, and "press both notes, one after the other" graded in one order.
 */
function keyMismatch(prompt, notes, mode) {
  const p = String(prompt || '').toLowerCase();
  const m = mode || modeFor(prompt, null, notes);
  if (openEnded(p)) return 'the prompt lets the learner choose, but only one answer is accepted';
  if (NEEDS_SOUND.test(p)) return 'the check plays no sound, so it cannot ask about a groove, a band or something heard; ask only for notes the prompt itself names';
  if (NEEDS_TIMING.test(p)) return 'the check is not timed (it hears which keys, not when), so it cannot ask for a beat or a steady pulse; ask only for the keys';
  if (PICK_ONE.test(p) && !NAMES_ONE.test(p)) return 'the prompt asks for "a key from" a group, which has more than one right answer; name the exact key (e.g. "the lowest key of the group of three")';
  const black = /\bblack keys?\b/.test(p) || TWO_GROUP.test(p) || THREE_GROUP.test(p);
  const white = /\bwhite keys?\b/.test(p);
  if (black && !white && !notes.every((n) => P.isBlack(n))) return 'the prompt asks for black keys, and the key has a white one';
  if (white && !black && !notes.every((n) => !P.isBlack(n))) return 'the prompt asks for white keys, and the key has a black one';
  // A group asked for as the thing to play: its keys and no others. A group used as a
  // landmark ("start just above the group of two"), or a line longer than the group,
  // is not checked this way.
  const two = TWO_GROUP.test(p);
  const three = THREE_GROUP.test(p);
  if (three && !two && playsGroup(p, THREE_GROUP, 3, notes.length) && !notes.every((n) => THREE_PCS.includes(P.pitchClass(n)))) {
    return 'the prompt asks for the group of three black keys (F# G# A#), and the key has a note outside it';
  }
  if (two && !three && playsGroup(p, TWO_GROUP, 2, notes.length) && !notes.every((n) => TWO_PCS.includes(P.pitchClass(n)))) {
    return 'the prompt asks for the group of two black keys (C# D#), and the key has a note outside it';
  }
  let counted = 0;
  const re = /\b(one|two|three|four|five|six|seven|eight|[1-8])[- ](?:[a-z]+[- ])?(notes?|keys?)\b/g;
  for (let x = re.exec(p); x; x = re.exec(p)) {
    // "the two-black-key group" names a group, and "the three-key group" too: not a count to play.
    if (/^[- ]?(black[- ])?key[- ]group/.test(p.slice(x.index + x[1].length))) continue;
    counted += NUMBERS[x[1]] || Number(x[1]);
  }
  if (!counted && /\bboth (notes|keys)\b/.test(p)) counted = 2;
  // "The two keys of the pair, then the group of three, then back to the first key"
  // counts only part of a longer line: a count below the key's length is a part when
  // the prompt goes on with "then".
  const compound = /\b(then|followed by|back to|and back)\b/.test(p);
  if (counted && counted !== notes.length && !(compound && counted < notes.length)) return `the prompt asks for ${counted} note(s), and the key has ${notes.length}`;
  // A melody with a repeated note and no order stated cannot be graded as a set.
  if (m === 'sequence' && new Set(notes).size > 1 && !statesOrder(prompt)) {
    return 'the prompt does not say in what order to play the notes, but they are graded in one order; say the order (e.g. "from left to right") or ask for them together as a chord';
  }
  // A named song's notes are the song's.
  const song = m !== 'chord' ? songNamed(prompt) : null;
  if (song && !followsMelody(notes, song, /\b(first|start|begin|opening)\b/.test(p))) {
    return `the notes are not ${song.title.replace(/\s*\(.*?\)/, '')}: its melody goes ${melodyText(song)} (in this key: ${song.key})`;
  }
  return '';
}

/**
 * Look at a keys check as the model wrote it: the safe check, or why it was refused.
 * @returns {{ check: object|null, why: string }}
 */
function inspectKeysCheck(raw) {
  if (!raw || typeof raw !== 'object') return { check: null, why: 'not written' };
  const prompt = String(raw.prompt || '').trim();
  const rationale = String(raw.rationale || '').trim();
  if (prompt.length < 4) return { check: null, why: 'no question' };
  if (rationale.length < 10) return { check: null, why: 'no rationale' };
  const notes = P.parseNotes(raw.answer);
  if (!notes.length) return { check: null, why: 'the answer is not notes with octaves, like "C#4 D#4"' };
  if (notes.some((n) => n < 21 || n > 108)) return { check: null, why: 'the answer has a note off the piano (A0 to C8)' };
  const mode = modeFor(prompt, raw.mode, notes);
  if (mode === 'chord' && notes.length < 2) return { check: null, why: 'a chord needs at least two notes' };
  const mismatch = keyMismatch(prompt, notes, mode);
  if (mismatch) return { check: null, why: mismatch };
  const expected = expectedFromPrompt(prompt);
  if (expected) {
    const spelled = `the ${expected.label} is ${expected.names.join(' ')}`;
    if (expected.mode === 'chord' && !P.samePitchClasses(notes, expected.pcs)) return { check: null, why: `the answer does not spell the chord the prompt names: ${spelled}` };
    if (expected.mode === 'sequence') {
      const got = notes.map(P.pitchClass);
      const want = expected.pcs;
      const up = got.join(',') === want.join(',');
      const upNoTop = got.join(',') === want.slice(0, -1).join(',');
      if (!up && !upNoTop) return { check: null, why: `the answer is not the scale the prompt names, going up: ${spelled}` };
    }
  }
  return {
    check: {
      format: 'keys',
      mode,
      prompt: prompt.slice(0, 600),
      answer: notes.map(P.midiToName).join(' '),
      accepts: [],
      rationale: rationale.slice(0, 600),
      hint: String(raw.hint || '').trim().slice(0, 300),
    },
    why: '',
  };
}

/**
 * A keys check written by the model, made safe, or null. The answer is stored as
 * note names with octaves ("C4 E4 G4"); a chord answer must have at least two
 * notes and a sequence at least one.
 */
function cleanKeysCheck(raw) {
  return inspectKeysCheck(raw).check;
}

/** Why a keys check was refused, in words the repair call can act on. */
function whyRefused(raw) {
  return inspectKeysCheck(raw).why || 'refused by the keys check';
}

/** Is what was played the answer? Chords by their notes in any order or octave; sequences in order, any octave; sets in any order. */
function gradeKeys(check, answer) {
  const played = P.parseNotes(answer);
  const want = P.parseNotes(check.answer);
  if (!played.length || !want.length) return false;
  if (check.mode === 'chord') return P.samePitchClasses(played, want) && new Set(played.map(P.pitchClass)).size === new Set(want.map(P.pitchClass)).size;
  if (check.mode === 'set') {
    const sorted = (xs) => xs.map(P.pitchClass).sort((a, b) => a - b).join(',');
    return played.length === want.length && sorted(played) === sorted(want);
  }
  return played.length === want.length && played.every((m, i) => P.pitchClass(m) === P.pitchClass(want[i]));
}

// ── blocks ──────────────────────────────────────────────────────────────────

/** The grade's number on the piano path (1 = Keyboard Explorer), or null. */
function gradeNumber(gradeId) {
  if (!gradeId) return null;
  // eslint-disable-next-line global-require
  const { GRADES } = require('../content/piano-grades');
  const at = GRADES.findIndex((g) => g.id === gradeId);
  return at === -1 ? null : at + 1;
}

/**
 * The widest a one-hand part may reach at a grade, in semitones: an octave for the
 * first two grades, a ninth (one shift of a five-finger position) at First Reader,
 * then an octave and a fifth, then the whole hand's travel.
 */
function handSpan(grade) {
  if (!grade || grade >= 7) return 36;
  if (grade <= 2) return 12;
  if (grade === 3) return 14;
  return 19;
}

/** The most notes in a phrase to echo by ear ('ear') or to play along with ('along') at a grade. */
function phraseLimit(grade, kind) {
  const g = grade || 7;
  if (kind === 'ear') return g <= 1 ? 4 : g <= 2 ? 5 : g <= 3 ? 6 : g <= 6 ? 8 : 16;
  return g <= 1 ? 8 : g <= 2 ? 12 : 24;
}

const TEXT_FIELDS = ['caption', 'prompt', 'note'];
const textOf = (data) => TEXT_FIELDS.map((k) => (typeof data[k] === 'string' ? data[k] : '')).join(' ');

/**
 * Problems with a piano block's data that its schema cannot see.
 *
 * @param {string} tag the block
 * @param {object} data what the model wrote
 * @param {object} [ctx] { gradeId } the level's grade, when known
 */
function blockProblems(tag, data, ctx = {}) {
  if (!data || typeof data !== 'object' || !/^Piano_/.test(tag)) return [];
  const grade = gradeNumber(ctx.gradeId);
  const text = textOf(data).toLowerCase();
  if (tag === 'Piano_Jam') return jamProblems(data, text);
  if (tag === 'Piano_Song') {
    // eslint-disable-next-line global-require
    const songs = require('../content/piano-songs');
    const out = songs.songBlockProblems(data, grade);
    if (data.pedal !== undefined && data.pedal !== 'legato') out.push('pedal: must be "legato" or left out');
    const song = data.pedal ? songs.get(data.song) : null;
    if (song && !String(song.chords || '').trim()) out.push('pedal: this song has no chord changes to pedal with; leave "pedal" out');
    return out;
  }
  const list = Array.isArray(data.notes) ? data.notes : [];
  const names = list.map((n) => (typeof n === 'string' ? n : n && n.note));
  const bad = names.filter((n) => P.noteToMidi(n) === null);
  if (!list.length) return ['notes: none given'];
  if (bad.length) return [`notes: "${bad[0]}" is not a note name with an octave, like C4 or F#3`];
  const midis = names.map(P.noteToMidi);
  const problems = [];
  // Keyboard Explorer and Pre-Reader learners do not read the staff yet.
  if (tag === 'Piano_Staff' && grade && grade <= 2) {
    problems.push('Piano_Staff: learners at this grade (Keyboard Explorer, Pre-Reader) do not read the staff yet');
  }
  const expected = expectedFromPrompt(`${data.caption || ''} ${data.prompt || ''}`);
  if (expected && expected.mode === 'chord' && !P.samePitchClasses(midis, expected.pcs)) {
    problems.push(`notes: they do not spell the chord the block names (the ${expected.label} is ${expected.names.join(' ')})`);
  }
  // A play-along or echo is scored note by note against its notes, so it cannot
  // also invite the learner to play what they like.
  if ((tag === 'Piano_PlayAlong' || tag === 'Piano_EarEcho') && openEnded(data.prompt)) {
    problems.push('prompt: it lets the learner play what they like, but the block scores every note against "notes"; ask for exactly these notes (a free jam is Piano_Jam\'s job)');
  }
  // Only Piano_Jam and Piano_Song play a backing band: a groove promised anywhere else never sounds.
  const bandWords = tag === 'Piano_EarEcho' ? /\b(groove|backing)\b/ : /\b(groove|backing|band)\b/;
  if (bandWords.test(text)) {
    problems.push('text: this block plays no backing groove or band (only Piano_Jam does), so it must not mention one');
  }
  // A phrase to play is one hand's: within a five-finger reach for the first grades.
  if ((tag === 'Piano_PlayAlong' || tag === 'Piano_EarEcho') && midis.length) {
    const span = Math.max(...midis) - Math.min(...midis);
    if (span > handSpan(grade)) problems.push(`notes: they span ${span} semitones, too wide for one hand at this grade (at most ${handSpan(grade)})`);
    // A young beginner echoes two to four notes by ear, and follows a short line of lights.
    const most = tag === 'Piano_EarEcho' ? phraseLimit(grade, 'ear') : phraseLimit(grade, 'along');
    if (midis.length > most) problems.push(`notes: ${midis.length} notes is too long for this grade (at most ${most} ${tag === 'Piano_EarEcho' ? 'to echo by ear' : 'to play along'})`);
  }
  // Loud and soft asked for in a play-along: every note says how loud, so a MIDI
  // keyboard can grade it; marks with no loud-and-soft task are noise.
  if (tag === 'Piano_PlayAlong') {
    const marks = list.map((n) => (n && typeof n === 'object' ? n.dynamic : undefined));
    const marked = marks.filter((x) => x !== undefined);
    const asksDynamics = /\b(loud(ly|er)?|quiet(ly|er)?|soft(ly|er)?|forte|crescendo|diminuendo|decrescendo|dynamics?)\b/.test(text);
    if (marked.some((x) => !P.DYNAMICS.includes(x))) problems.push(`notes: a dynamic must be one of ${P.DYNAMICS.join(', ')}`);
    if (marked.length && marked.length < list.length) problems.push('notes: when notes say how loud ("dynamic"), every note must say it');
    if (asksDynamics && !marked.length) problems.push('notes: the prompt asks for loud and soft, so give every note a "dynamic" (p, f, ...), which a MIDI keyboard grades');
    if (marked.length && new Set(marked).size < 2) problems.push('notes: every note has the same dynamic, so there is no loud-against-soft to grade; leave "dynamic" out or mark the contrast');
    const asksPedal = /\bpedal(ling|ing|led|ed|s)?\b/.test(text) && !/\b(soft|una corda|middle|sostenuto) pedal\b/.test(text);
    if (data.pedal !== undefined && data.pedal !== 'legato') problems.push('pedal: must be "legato" or left out');
    if (data.pedal && !asksPedal) problems.push('pedal: set only when the prompt asks the learner to pedal');
    if (asksPedal && !data.pedal && /\b(change|lift|press|use|with) (the )?(sustain |right )?pedal\b/.test(text)) problems.push('pedal: the prompt asks for pedalling, so set "pedal": "legato" (graded with a MIDI keyboard)');
  }
  // A phrase from a library song, named in the block or by the level's topic, is that song's.
  if (tag !== 'Piano_Keys') {
    const song = songNamed(text) || (/\b(song|tune|melody)\b/.test(text) ? songNamed(ctx.topic) : null);
    if (song && !followsMelody(midis, song, /\b(first|start|begin|opening)\b/.test(text))) {
      problems.push(`notes: they are not ${song.title.replace(/\s*\(.*?\)/, '')}, whose melody goes ${melodyText(song)} (${song.key}); write that, or play the song with Piano_Song "${song.id}"`);
    }
  }
  // Black or white keys named in the text must be the ones lit or played.
  const black = /\bblack keys?\b/.test(text) && !/\bwhite keys?\b/.test(text);
  const white = /\bwhite keys?\b/.test(text) && !/\bblack keys?\b/.test(text);
  if (tag !== 'Piano_Staff' && black && /\b(every|all|only)\b/.test(text) && !midis.every((m) => P.isBlack(m))) {
    problems.push('notes: the text says black keys only, and a note is a white key');
  }
  if (tag !== 'Piano_Staff' && white && /\b(every|all|only)\b/.test(text) && !midis.every((m) => !P.isBlack(m))) {
    problems.push('notes: the text says white keys only, and a note is a black key');
  }
  return problems;
}

/** A jam: free play over the app's groove, on one kind of key. */
function jamProblems(data, text) {
  const problems = [];
  if (!['black', 'white'].includes(data.keys)) problems.push('keys: must be "black" or "white"');
  const saysBlack = /\bblack keys?\b/.test(text);
  const saysWhite = /\bwhite keys?\b/.test(text);
  if (data.keys === 'black' && saysWhite && !saysBlack) problems.push('prompt: it asks for white keys, but "keys" is "black"');
  if (data.keys === 'white' && saysBlack && !saysWhite) problems.push('prompt: it asks for black keys, but "keys" is "white"');
  if (/\b(echo|copy|repeat after|play (it )?back)\b/.test(text)) problems.push('prompt: a jam is free play over the groove; to copy a phrase use Piano_EarEcho');
  return problems;
}

module.exports = {
  cleanKeysCheck, inspectKeysCheck, whyRefused, gradeKeys, blockProblems, expectedFromPrompt, keyMismatch,
  openEnded, statesOrder, modeFor, gradeNumber, handSpan, songNamed, followsMelody,
};
