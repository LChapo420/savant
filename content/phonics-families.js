/**
 * Phonics, decoding and spelling — the first half of the English track.
 *
 * Ninety-odd of the creator's seven hundred and fifty-five topics are about
 * reading and writing words: which letters make which sounds, which chunks
 * blend, which endings change a word's form, and how a root carries meaning
 * across hundreds of words. They are the preschool through third-grade
 * material, and a grade cannot be a course if a learner on it can never be
 * asked anything.
 *
 * Every answer here is a fact about spelling rather than a calculation, so the
 * bank can verify all of it: a word either takes that ending, blends that way,
 * or it does not. Nothing is a judgement call, which is why it is written out
 * rather than generated — a wrong answer about which letters are silent would be
 * taught as fact and there is no way to catch that downstream.
 *
 * It is a family rather than a shape, and that matters. A skill with one
 * generator gives every block drawn from it the same question forms, so a
 * twelve-question block runs the avoid set against itself and the learner meets
 * the same four questions. Every skill whose questions can be told apart needs
 * several.
 */

// A word, the sound it carries, and the chunk that carries it. The chunk is what
// makes the question teachable: "sh in ship" is a fact; "which sound does ship
// have" is a guess.
//
// `at` is where the chunk sits. "ck" never starts an English word, so asking for
// the first sound of "duck" keyed a chunk that is the last one. And the old
// rationale claimed that removing the chunk "leaves 'tink', which is a different
// word" — "tink", "kip", "ducc" and "pone" are not words, and removing "sh" from
// "ship" leaves "ip", not "sip".
const BLENDS = [
  { chunk: 'sh', sound: 'sh', word: 'ship', at: 'first' },
  { chunk: 'ch', sound: 'ch', word: 'chip', at: 'first' },
  { chunk: 'th', sound: 'th', word: 'think', at: 'first' },
  { chunk: 'wh', sound: 'w', word: 'wheel', at: 'first' },
  { chunk: 'ck', sound: 'k', word: 'duck', at: 'last' },
  { chunk: 'ph', sound: 'f', word: 'phone', at: 'first' },
  { chunk: 'sh', sound: 'sh', word: 'fish', at: 'last' },
  { chunk: 'ch', sound: 'ch', word: 'lunch', at: 'last' },
];

const VOWEL_TEAMS = [
  { team: 'ai', word: 'rain', sound: 'long a' },
  { team: 'ay', word: 'play', sound: 'long a' },
  { team: 'ee', word: 'tree', sound: 'long e' },
  { team: 'ea', word: 'sea', sound: 'long e' },
  { team: 'oa', word: 'boat', sound: 'long o' },
  { team: 'oo', word: 'book', sound: 'short oo' },
  { team: 'ou', word: 'cloud', sound: 'ow' },
  { team: 'oi', word: 'coin', sound: 'oy' },
  { team: 'oy', word: 'toy', sound: 'oy' },
  { team: 'au', word: 'sauce', sound: 'aw' },
];

// The r-controlled sounds as phonics teaches them: /ar/, /or/, and the one /er/
// that er, ir and ur all spell. "or in corn says aw" was wrong in most accents,
// and with only three distinct sounds the distractor helper padded the list with
// the answer itself. A short-vowel sound is the fourth option: it is what the
// vowel would say without the r, which is the contrast being taught.
const R_CONTROLLED = [
  { r: 'ar', word: 'car', sound: '/ar/ as in "star"', plain: '/a/ as in "cat"' },
  { r: 'or', word: 'corn', sound: '/or/ as in "fork"', plain: '/o/ as in "hot"' },
  { r: 'er', word: 'her', sound: '/er/ as in "fern"', plain: '/e/ as in "bed"' },
  { r: 'ir', word: 'bird', sound: '/er/ as in "fern"', plain: '/i/ as in "sit"' },
  { r: 'ur', word: 'turn', sound: '/er/ as in "fern"', plain: '/u/ as in "cup"' },
];

const MAGIC_E = [
  { word: 'make', base: 'mak', sound: 'long a' },
  { word: 'bike', base: 'bik', sound: 'long i' },
  { word: 'home', base: 'hom', sound: 'long o' },
  { word: 'nose', base: 'nos', sound: 'long o' },
  { word: 'cube', base: 'cub', sound: 'long u' },
];

// `alsoQuiet` lists the other letters in the word that are not sounded on their
// own — the final e of "write" and "gnome", the w of the "ow" team in "know" —
// so they are never offered as wrong answers to "which letter is not
// pronounced?". Offering "E" for "write" made a right answer a wrong one.
const SILENT_LETTERS = [
  { word: 'know', silent: 'k', alsoQuiet: ['w'] },
  { word: 'write', silent: 'w', alsoQuiet: ['e'] },
  { word: 'gnome', silent: 'g', alsoQuiet: ['e'] },
  { word: 'lamb', silent: 'b', alsoQuiet: [] },
  { word: 'climb', silent: 'b', alsoQuiet: [] },
  { word: 'island', silent: 's', alsoQuiet: [] },
];

// What each ending adds, in words that do not overlap: "past tense" and "past
// tense, with the consonant doubled" were both offered for "stop" + -ed, and both
// are true. The doubling is a spelling note, so it lives in `note` and the
// rationale. "poss" + -ible was not a word and "possible" does not mean "can be
// possessed"; "flex" + -ible is "flexible", able to be bent.
const ENDINGS = [
  { ending: 's', after: 'cat', adds: 'plural (more than one)', example: 'cats' },
  { ending: 'es', after: 'box', adds: 'plural (more than one)', example: 'boxes' },
  { ending: 'ed', after: 'walk', adds: 'past tense', example: 'walked' },
  { ending: 'ed', after: 'stop', adds: 'past tense', example: 'stopped', note: 'the final p is doubled before the ending' },
  { ending: 'ing', after: 'walk', adds: 'an action that is going on', example: 'walking' },
  { ending: 'ly', after: 'quick', adds: 'how something is done (an adverb)', example: 'quickly' },
  { ending: 'ful', after: 'care', adds: 'full of', example: 'careful' },
  { ending: 'less', after: 'hope', adds: 'without', example: 'hopeless' },
  { ending: 'er', after: 'tall', adds: 'more (comparing two)', example: 'taller' },
  { ending: 'est', after: 'tall', adds: 'most (comparing three or more)', example: 'tallest' },
  { ending: 'able', after: 'read', adds: 'able to be', example: 'readable' },
  { ending: 'ible', after: 'flex', adds: 'able to be', example: 'flexible' },
];

// `gloss` is what the whole word means with the prefix read in, so the rationale
// says "rewrite means write again" rather than gluing the meaning on the end
// ("'transport' is 'port' across").
const PREFIXES = [
  { prefix: 're', before: 'write', means: 'again', whole: 'rewrite', gloss: 'to write again' },
  { prefix: 'un', before: 'happy', means: 'not', whole: 'unhappy', gloss: 'not happy' },
  { prefix: 'dis', before: 'agree', means: 'the opposite of', whole: 'disagree', gloss: 'the opposite of agree' },
  { prefix: 'mis', before: 'read', means: 'wrongly', whole: 'misread', gloss: 'to read wrongly' },
  { prefix: 'pre', before: 'view', means: 'before', whole: 'preview', gloss: 'to view before' },
  { prefix: 'sub', before: 'marine', means: 'under', whole: 'submarine', gloss: 'under the sea' },
  { prefix: 'inter', before: 'national', means: 'between', whole: 'international', gloss: 'between nations' },
  { prefix: 'trans', before: 'atlantic', means: 'across', whole: 'transatlantic', gloss: 'across the Atlantic' },
];

const ROOTS = [
  { root: 'port', means: 'carry', words: ['transport', 'export', 'portable'] },
  { root: 'dict', means: 'say', words: ['predict', 'dictate', 'contradict'] },
  { root: 'scrib', means: 'write', words: ['describe', 'prescribe', 'scribble'] },
  { root: 'bio', means: 'life', words: ['biology', 'biography', 'biopsy'] },
  { root: 'geo', means: 'earth', words: ['geography', 'geology', 'geologist'] },
  { root: 'spect', means: 'look', words: ['inspect', 'respect', 'spectator'] },
  { root: 'struct', means: 'build', words: ['construct', 'structure', 'destruction'] },
  { root: 'graph', means: 'write, draw', words: ['paragraph', 'graphics', 'biography'] },
  { root: 'rupt', means: 'break', words: ['interrupt', 'disrupt', 'rupture'] },
  { root: 'vis', means: 'see', words: ['visible', 'vision', 'revise'] },
];

const { fromPool } = require('./pool');

const LETTER_SETS = [
  { set: 'A-E', names: 'A through E' },
  { set: 'F-J', names: 'F through J' },
  { set: 'K-O', names: 'K through O' },
  { set: 'P-T', names: 'P through T' },
  { set: 'U-Z', names: 'U through Z' },
];

// One syllable each, named inside its word. "hap-py" is two syllables of two
// different types (closed "hap", open "py"), so asking which type it is had two
// answers. A closed vowel makes its short *sound*, not its "short name".
const SYLLABLE_TYPES = [
  { name: 'closed', syllable: 'hap', word: 'hap-py', rule: 'the vowel is closed in by a consonant after it, so it makes its short sound' },
  { name: 'open', syllable: 'o', word: 'o-pen', rule: 'the vowel ends the syllable with no consonant after it, so it says its name (the long sound)' },
  { name: 'vowel-consonant-e', syllable: 'note', word: 'note', rule: 'the final e is silent and makes the vowel before it long' },
  { name: 'vowel team', syllable: 'rain', word: 'rain', rule: 'two vowels together make one sound' },
];

const item = (o) => ({ source: 'bank', ...o });

/** Three wrong options that cannot be the answer, so a question is decidable. */
function threeFrom(pool, correct) {
  const out = [];
  for (const p of pool) {
    if (p === correct || out.includes(p)) continue;
    out.push(p);
    if (out.length === 3) break;
  }
  // No padding with the answer: a pool with fewer than three wrong options gives
  // fewer than three, and the item has fewer choices rather than two keys. (The
  // padding loop used to add `correct` itself when the pool ran short.)
  return out;
}

// Kindergarten (standards check, 2026-10-24). RF.K.2-3 is one sound per letter:
// the short vowel in a three-letter word, blending three sounds and changing the
// first one. Digraphs, vowel teams and silent letters are grade 1 and up, and
// were all a Kindergarten phonics level had. The words are spelled exactly as
// they sound, with no c or k (two letters for one sound) and no doubled letters.
const CVC = [
  { word: 'cat', v: 'a' }, { word: 'map', v: 'a' }, { word: 'hat', v: 'a' }, { word: 'bed', v: 'e' }, { word: 'net', v: 'e' },
  { word: 'ten', v: 'e' }, { word: 'pig', v: 'i' }, { word: 'sit', v: 'i' }, { word: 'fin', v: 'i' }, { word: 'hot', v: 'o' },
  { word: 'mop', v: 'o' }, { word: 'dog', v: 'o' }, { word: 'sun', v: 'u' }, { word: 'bug', v: 'u' }, { word: 'rug', v: 'u' },
];
const BLENDABLE = CVC.filter((w) => !/[ck]/.test(w.word));
const SHORT = { a: 'short a, as in "apple"', e: 'short e, as in "egg"', i: 'short i, as in "itch"', o: 'short o, as in "octopus"', u: 'short u, as in "up"' };
// A word, a new first sound, and the real word that makes.
const SWAPS = [
  { word: 'hat', to: 'm', makes: 'mat' }, { word: 'pig', to: 'w', makes: 'wig' }, { word: 'sun', to: 'b', makes: 'bun' },
  { word: 'dog', to: 'l', makes: 'log' }, { word: 'bed', to: 'r', makes: 'red' }, { word: 'ten', to: 'h', makes: 'hen' },
  { word: 'mop', to: 't', makes: 'top' }, { word: 'bug', to: 'r', makes: 'rug' }, { word: 'fin', to: 'p', makes: 'pin' },
  { word: 'net', to: 'p', makes: 'pet' },
];

const FAMILIES = {
  phonics: [
    // Kindergarten: the short vowel in a three-letter word (RF.K.3b).
    {
      d: 1,
      g: 0,
      slots: { w: CVC },
      p: (s) => `Which vowel sound do you hear in the middle of "${s.w.word}"?`,
      c: (s) => [SHORT[s.w.v], ...threeFrom(Object.values(SHORT), SHORT[s.w.v])],
      a: (s) => SHORT[s.w.v],
      r: (s) => `Say it slowly: "${s.w.word}". The middle letter is "${s.w.v}", which makes the ${SHORT[s.w.v].split(',')[0]} sound.`,
      frame: 'which vowel sound in a short word',
      varies: ['word', 'v'],
    },
    // Kindergarten: two words that share the middle (vowel) sound (RF.K.2d).
    {
      d: 1,
      g: 0,
      slots: { w: CVC },
      p: (s) => `Which word has the same middle sound as "${s.w.word}"?`,
      c: (s) => {
        const same = CVC.find((x) => x.v === s.w.v && x.word !== s.w.word);
        const others = [...new Set(CVC.filter((x) => x.v !== s.w.v).map((x) => x.v))].map((v) => CVC.find((x) => x.v === v).word);
        return [same.word, ...threeFrom(others, same.word)];
      },
      a: (s) => CVC.find((x) => x.v === s.w.v && x.word !== s.w.word).word,
      r: (s) => `"${s.w.word}" and "${CVC.find((x) => x.v === s.w.v && x.word !== s.w.word).word}" both have the short ${s.w.v} sound in the middle.`,
      frame: 'which word has the same middle sound',
      varies: ['word', 'v'],
    },
    // Grade 1: a final e makes the vowel long (RF.1.3c).
    {
      d: 1,
      g: 1,
      slots: { word: MAGIC_E },
      p: () => 'Which word has a long vowel sound because it ends in a silent e?',
      c: (s) => [s.word.word, ...threeFrom(CVC.filter((x) => x.v === { 'long a': 'a', 'long i': 'i', 'long o': 'o', 'long u': 'u' }[s.word.sound]).map((x) => x.word).concat(CVC.map((x) => x.word)), s.word.word)],
      a: (s) => s.word.word,
      r: (s) => `In "${s.word.word}" the final e is silent and makes the vowel say its name (${s.word.sound}); the other words end in a consonant and keep a short vowel.`,
      frame: 'which word has a long vowel from a final e',
      varies: ['word', 'sound'],
    },
    // Kindergarten: blend three sounds into a word (RF.K.2d).
    {
      d: 1,
      g: 0,
      slots: { w: BLENDABLE },
      p: (s) => `Put the sounds together: /${s.w.word[0]}/ /${s.w.word[1]}/ /${s.w.word[2]}/. What word do they make?`,
      c: (s) => [s.w.word, ...threeFrom(BLENDABLE.map((x) => x.word).filter((x) => x[0] !== s.w.word[0] || x[1] !== s.w.word[1]), s.w.word)],
      a: (s) => s.w.word,
      r: (s) => `Say each sound and push them together: /${s.w.word.split('').join('/ /')}/ makes "${s.w.word}".`,
      frame: 'put the sounds together',
      varies: ['word'],
    },
    // Kindergarten: change the first sound to make a new word (RF.K.2e).
    {
      d: 1,
      g: 0,
      slots: { sw: SWAPS },
      p: (s) => `Change the first sound in "${s.sw.word}" to /${s.sw.to}/. What new word do you make?`,
      c: (s) => [s.sw.makes, ...threeFrom(SWAPS.map((x) => x.makes).filter((x) => x.slice(1) !== s.sw.makes.slice(1)), s.sw.makes)],
      a: (s) => s.sw.makes,
      r: (s) => `Keep the end of "${s.sw.word}" ("${s.sw.word.slice(1)}") and start it with /${s.sw.to}/: "${s.sw.makes}".`,
      frame: 'change the first sound',
      varies: ['word', 'to', 'makes'],
    },
    // Which two letters make a sound.
    {
      d: 1,
      slots: { set: BLENDS },
      p: (s) => `Which two letters make the ${s.set.at} sound in "${s.set.word}"?`,
      // Distractors are pairs that are not in the word at all, so only one
      // option can be read off it.
      c: (s) => [s.set.chunk, ...threeFrom([...new Set(BLENDS.map((b) => b.chunk))]
        .filter((ch) => !s.set.word.includes(ch)), s.set.chunk)],
      a: (s) => s.set.chunk,
      r: (s) => `The letters "${s.set.chunk}" work together to make one sound, /${s.set.sound}/, at the`
        + ` ${s.set.at === 'first' ? 'start' : 'end'} of "${s.set.word}".`,
      frame: 'which two letters make the sound',
      varies: ['chunk', 'sound', 'word', 'other'],
    },
    // Two vowels working together.
    {
      d: 2,
      slots: { team: VOWEL_TEAMS },
      p: (s) => `In "${s.team.word}", which letters work together to make the ${s.team.sound} sound?`,
      c: (s) => [s.team.team, ...threeFrom(VOWEL_TEAMS.map((v) => v.team), s.team.team)],
      a: (s) => s.team.team,
      r: (s) => `"${s.team.team}" makes the ${s.team.sound} sound in "${s.team.word}".`,
      frame: 'which letters work together',
      varies: ['team', 'word', 'sound'],
    },
    // The r-controlled vowel.
    {
      d: 3,
      slots: { pair: R_CONTROLLED },
      p: (s) => `In "${s.pair.word}", which sound do the letters "${s.pair.r}" make?`,
      c: (s) => {
        const sounds = [...new Set(R_CONTROLLED.map((x) => x.sound))];
        return [s.pair.sound, ...threeFrom(sounds, s.pair.sound), s.pair.plain];
      },
      a: (s) => s.pair.sound,
      r: (s) => `When r follows a vowel, it changes the vowel's sound: "${s.pair.r}" in "${s.pair.word}" says`
        + ` ${s.pair.sound}, not the short ${s.pair.plain}.`
        + `${s.pair.sound.startsWith('/er/') ? ' "er", "ir" and "ur" all spell this same sound.' : ''}`,
      frame: 'what sound does r make',
      varies: ['r', 'word', 'sound'],
    },
    // The final e.
    {
      d: 3,
      slots: { word: MAGIC_E },
      p: (s) => `In "${s.word.word}", what does the final e do?`,
      c: (s) => [
        `It makes the vowel say its own name (${s.word.sound})`,
        // Not "it is silent and dropped before -ing": that is true of the final
        // e (make, making) and was offered as a wrong answer.
        'It makes the vowel short',
        'It is pronounced as a separate /e/ sound',
        'It always makes the word plural',
      ],
      a: (s) => `It makes the vowel say its own name (${s.word.sound})`,
      r: (s) => `Without the final e, "${s.word.base}" has a short vowel. The e gives`
        + ` the ${s.word.sound} sound.`,
      frame: 'what the final e does',
      varies: ['word', 'base', 'sound'],
    },
    // A letter that is not pronounced.
    {
      d: 4,
      slots: { word: SILENT_LETTERS },
      p: (s) => `Which letter in "${s.word.word}" is not pronounced?`,
      c: (s) => {
        const quiet = [s.word.silent, ...s.word.alsoQuiet].map((ch) => ch.toUpperCase());
        const inWord = [...new Set(s.word.word.toUpperCase().split(''))]
          .filter((ch) => !quiet.includes(ch));
        const padded = [...inWord];
        for (const ch of 'BCDFGHJKLMNPQRSTVWXYZ') {
          if (padded.length >= 3) break;
          if (!padded.includes(ch) && !quiet.includes(ch)) padded.push(ch);
        }
        return [s.word.silent.toUpperCase(), ...padded.slice(0, 3)];
      },
      a: (s) => s.word.silent.toUpperCase(),
      r: (s) => `The ${s.word.silent} in "${s.word.word}" is written but not pronounced.`,
      frame: 'which letter is silent',
      varies: ['word', 'silent'],
    },
    // What an ending adds.
    {
      d: 4,
      slots: { ending: ENDINGS },
      p: (s) => `What does the ending -${s.ending.ending} add to "${s.ending.after}"?`,
      // The other endings' meanings, drawn from the table itself so no two
      // options say the same thing in different words.
      c: (s) => [s.ending.adds, ...threeFrom([...new Set(ENDINGS.map((e) => e.adds))], s.ending.adds)],
      a: (s) => s.ending.adds,
      r: (s) => `"${s.ending.after}" becomes "${s.ending.example}" — the ending -${s.ending.ending} adds the meaning`
        + ` "${s.ending.adds}".${s.ending.note ? ` (In spelling it, ${s.ending.note}.)` : ''}`,
      frame: 'what an ending adds',
      varies: ['ending', 'after', 'adds', 'example'],
    },
    // What a prefix means.
    {
      d: 5,
      slots: { prefix: PREFIXES },
      p: (s) => `What does the prefix "${s.prefix.prefix}-" mean in "${s.prefix.whole}"?`,
      // "not" and "the opposite of" are near enough that each would be a fair
      // reading of the other's word (unhappy is the opposite of happy), so
      // neither is offered as a wrong answer to the other.
      c: (s) => {
        const clash = { not: ['the opposite of'], 'the opposite of': ['not'] }[s.prefix.means] || [];
        const others = PREFIXES.map((p) => p.means).filter((m) => !clash.includes(m));
        return [s.prefix.means, ...threeFrom(others, s.prefix.means)];
      },
      a: (s) => s.prefix.means,
      r: (s) => `"${s.prefix.prefix}-" means "${s.prefix.means}", so "${s.prefix.whole}" means`
        + ` ${s.prefix.gloss}.`,
      frame: 'what a prefix means',
      varies: ['prefix', 'before', 'means', 'whole'],
    },
    // Which word contains a root.
    {
      d: 5,
      slots: { root: ROOTS },
      p: (s) => `Which word contains the root "${s.root.root}", meaning "${s.root.means}"?`,
      // Wrong options come from the other roots and never contain this one:
      // the old list offered "export" and "portable" as wrong answers to a
      // question about "port", and "biography" (graph) for "paragraph".
      c: (s) => {
        const others = ROOTS.filter((r) => r !== s.root).flatMap((r) => r.words)
          .filter((w) => !w.includes(s.root.root));
        return [s.root.words[0], ...threeFrom(others, s.root.words[0])];
      },
      a: (s) => s.root.words[0],
      r: (s) => `"${s.root.root}" means "${s.root.means}", and it is the part of`
        + ` "${s.root.words[0]}" that carries that meaning.`,
      frame: 'which word shares a root',
      varies: ['root', 'means', 'words'],
    },
    // Which letters are in a set, for the earliest grades.
    {
      d: 1,
      slots: { set: LETTER_SETS },
      p: (s) => `Which letters are in the set named by "${s.set.set}"?`,
      c: (s) => [s.set.names, ...threeFrom(LETTER_SETS.map((x) => x.names), s.set.names)],
      a: (s) => s.set.names,
      r: (s) => `"${s.set.set}" is the run of letters ${s.set.names}.`,
      frame: 'which letters are in the set',
      varies: ['set', 'names'],
    },
    // How a word splits into syllables.
    {
      d: 4,
      slots: { type: SYLLABLE_TYPES },
      p: (s) => (s.type.word === s.type.syllable
        ? `Which type of syllable is "${s.type.syllable}"?`
        : `Which type of syllable is "${s.type.syllable}" in "${s.type.word}"?`),
      c: (s) => [s.type.name, ...threeFrom(SYLLABLE_TYPES.map((x) => x.name), s.type.name)],
      a: (s) => s.type.name,
      r: (s) => `"${s.type.syllable}" is ${/^[aeiou]/.test(s.type.name) ? 'an' : 'a'} ${s.type.name} syllable: ${s.type.rule}.`,
      frame: 'which type of syllable',
      varies: ['name', 'syllable', 'word', 'rule'],
    },
  ],
};

// The first US grade each family's rule is taught (content/english-grade-items.js
// SCHOOL_GRADES): a school grade is served only its own (content/pool.js forSchool).
const UNTAGGED = require('./english-grade-items').tagSchoolGrades('phonics', FAMILIES.phonics);

module.exports = { GENERATORS: { phonics: fromPool(FAMILIES.phonics, 'phonics') }, FAMILIES, UNTAGGED };
