/**
 * Reasoning items. Series, matrices, ciphers, and numerical reasoning are
 * generated (the rule is the answer key, so correctness is free); analogies,
 * deduction puzzles, and spatial items come from authored pools.
 *
 * These drills train the item types IQ tests use. They are practice material,
 * not a measurement instrument, and nothing here produces an IQ score — the
 * product never claims one.
 */
const { choicesFrom } = require('./rng');
const { fromPool, withShapes } = require('./pool');
const { FAMILIES } = require('./iq-families');

const { onlyOdd } = require('./iq-oddity');

const item = (o) => ({ source: 'bank', ...o });
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** "4, 7, and 9", "11 and 12". */
const listAnd = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`);

const POOLS = {
  verbal_analogy: [
    { d: 2, p: 'Hot is to cold as tall is to ___', c: ['short', 'wide', 'heavy', 'high'], a: 'short', r: 'The pair is a direct opposite, and the opposite of tall is short.' },
    { d: 3, p: 'Puppy is to dog as kitten is to ___', c: ['cat', 'kitten', 'pet', 'mouse'], a: 'cat', r: 'The relation is young animal to adult animal.' },
    { d: 4, p: 'Page is to book as ___ is to building', c: ['floor', 'brick', 'window', 'roof'], a: 'floor', r: 'A page is one of the stacked units that compose a book, as a floor is for a building. A brick is material, not a stacked division.' },
    { d: 5, p: 'Thermometer is to temperature as ___ is to pressure', c: ['barometer', 'altimeter', 'compass', 'scale'], a: 'barometer', r: 'The relation is instrument to the quantity it measures.' },
    { d: 6, p: 'Sculptor is to marble as author is to ___', c: ['words', 'novel', 'reader', 'publisher'], a: 'words', r: 'Marble is the raw material a sculptor shapes; the author’s material is words. The novel is the finished product.' },
    { d: 7, p: 'Drought is to famine as ___ is to unemployment', c: ['recession', 'poverty', 'factory', 'wage'], a: 'recession', r: 'The relation is cause to consequence: drought causes famine as recession causes unemployment.' },
    { d: 8, p: 'Meticulous is to careless as frugal is to ___', c: ['wasteful', 'thrifty', 'wealthy', 'cautious'], a: 'wasteful', r: 'The pairs are antonyms; the opposite of frugal is wasteful, while thrifty is a synonym.' },
    { d: 9, p: 'Vaccine is to immunity as ___ is to endurance', c: ['training', 'fatigue', 'muscle', 'athlete'], a: 'training', r: 'A vaccine is the deliberate process that produces immunity, as training is the process that produces endurance.' },
  ],

  logic_deduction: [
    { d: 4, p: 'Three runners finish. Beto finishes ahead of Cara. Dia finishes ahead of Beto. Who finished last?', c: ['Cara', 'Beto', 'Dia', 'Cannot be determined'], a: 'Cara', r: 'The order is Dia, Beto, Cara, so Cara is last.' },
    { d: 5, p: 'If it rains, the game is cancelled. The game was not cancelled. What follows?', c: ['It did not rain', 'It rained', 'The game was delayed', 'Nothing follows'], a: 'It did not rain', r: 'Denying the consequence of a true conditional denies the antecedent. This is valid (modus tollens).' },
    { d: 6, p: 'Five books sit on a shelf. The atlas is to the left of the novel. The novel is immediately right of the diary. The atlas is not next to the diary. Which is true?', c: ['At least one book sits between the atlas and the diary', 'The atlas is immediately left of the novel', 'The diary is leftmost', 'The novel is leftmost'], a: 'At least one book sits between the atlas and the diary', r: 'The atlas is left of the novel, the diary sits immediately left of the novel, and the atlas is not adjacent to the diary, so something separates them.' },
    { d: 7, p: 'Every member of the club can swim. Some members can sail. Which must be true?', c: ['Some people who can sail can swim', 'All swimmers are club members', 'Most members can sail', 'No sailor is a club member'], a: 'Some people who can sail can swim', r: 'The sailing members are members, and all members swim, so those people do both.' },
    // Rewritten: the earlier version ("A says B lies. B says C lies. C says A and
    // B both lie", four suspects) had no consistent answer at all — if C is the
    // liar, A's true statement makes B a second liar.
    { d: 8, p: 'Three suspects: exactly one lies. A says B tells the truth. B says C lies. C says A lies. Who lies?', c: ['C', 'A', 'B', 'Cannot be determined'], a: 'C', r: 'If A lied, B would be lying too, which is two liars. If B lied, A’s statement would be false as well. So C lies: A and B are truthful, B is right that C lies, and C’s claim that A lies is false.' },
    { d: 9, p: 'If all X are Y, and no Y are Z, what follows about X and Z?', c: ['No X are Z', 'Some X are Z', 'All Z are X', 'Nothing follows'], a: 'No X are Z', r: 'Every X sits inside Y, and Y is entirely outside Z, so no X can be Z.' },
  ],

  spatial_reason: [
    { d: 4, p: 'A square piece of paper is folded in half twice, then a single hole is punched through all layers. When unfolded, how many holes are there?', c: ['4', '2', '3', '8'], a: '4', r: 'Two folds make four layers, and one punch passes through all four.' },
    { d: 5, p: 'The letter "b" is rotated 180 degrees in the plane. Which letter shape does it most resemble?', c: ['q', 'd', 'p', 'b'], a: 'q', r: 'A 180-degree rotation flips both horizontally and vertically, turning b into q. A mirror alone would give d.' },
    { d: 6, p: 'A cube is painted on all faces, then cut into 27 equal smaller cubes. How many small cubes have exactly one painted face?', c: ['6', '8', '12', '9'], a: '6', r: 'The one-face cubes are the centers of the six faces.' },
    { d: 7, p: 'A cube is painted and cut into 27 equal cubes. How many have no paint at all?', c: ['1', '6', '8', '0'], a: '1', r: 'Only the single cube at the very center is untouched.' },
    { d: 8, p: 'Unfolded, a cube net shows faces in a row: 1, 2, 3, 4, with 5 above face 2 and 6 below face 2. When folded, which face is opposite face 2?', c: ['4', '1', '3', '5'], a: '4', r: 'In a four-in-a-row strip, faces two apart end up opposite, so 2 faces 4 and 1 faces 3.' },
    { d: 9, p: 'A 4×4×4 cube built from unit cubes is painted outside, then taken apart. How many unit cubes have exactly two painted faces?', c: ['24', '8', '12', '16'], a: '24', r: 'Two-face cubes lie along the edges but not at corners: 12 edges × 2 middle cubes each = 24.' },
  ],
};

const RULES = [
  { name: 'add', build: (rng, d) => { const s = rng.int(2, 3 + d); const a0 = rng.int(1, 9 + d); return { seq: (i) => a0 + i * s, why: `each term adds ${s}` }; } },
  { name: 'sub', build: (rng, d) => { const s = rng.int(2, 3 + d); const a0 = rng.int(40, 60 + d * 5); return { seq: (i) => a0 - i * s, why: `each term subtracts ${s}` }; } },
  { name: 'mul', build: (rng, d) => { const r = rng.pick([2, 3, 2, 4]); const a0 = rng.int(1, 5); return { seq: (i) => a0 * Math.pow(r, i), why: `each term multiplies by ${r}` }; } },
  { name: 'growing', build: (rng, d) => { const a0 = rng.int(1, 8); const s = rng.int(1, 3); return { seq: (i) => a0 + (s * i * (i + 1)) / 2, why: `the gaps grow by ${s} each step` }; } },
  { name: 'squares', build: (rng) => { const off = rng.int(0, 3); return { seq: (i) => Math.pow(i + 1 + off, 2), why: 'the terms are consecutive perfect squares' }; } },
  { name: 'fib', build: (rng) => { const a = rng.int(1, 5), b = rng.int(2, 7); const memo = [a, b]; return { seq: (i) => { while (memo.length <= i) memo.push(memo[memo.length - 1] + memo[memo.length - 2]); return memo[i]; }, why: 'each term is the sum of the two before it' }; } },
  { name: 'alternating', build: (rng, d) => { const up = rng.int(3, 8 + d), down = rng.int(1, 5); const a0 = rng.int(3, 12); return { seq: (i) => a0 + Math.ceil(i / 2) * up - Math.floor(i / 2) * down, why: `the sequence alternates: +${up} then -${down}` }; } },
];

/**
 * One odd-one-out set: three numbers sharing a property, one without it, and the
 * property named. The caller re-draws until the odd number is the only odd one.
 */
function drawOddSet(rng, kind) {
  if (kind === 'even') {
    return [rng.sample([2, 4, 6, 8, 10, 12, 14, 16, 18], 3), rng.pick([3, 5, 7, 9, 11, 13]), 'every other number is even'];
  }
  if (kind === 'squares') {
    return [rng.sample([4, 9, 16, 25, 36, 49, 64, 81, 100], 3), rng.pick([12, 18, 20, 30, 50, 72]), 'every other number is a perfect square'];
  }
  if (kind === 'multiples') {
    const m = rng.pick([3, 4, 6, 7]);
    const group = rng.sample([2, 3, 4, 5, 6, 7, 8, 9], 3).map((k) => k * m);
    return [group, group[0] + 1, `every other number is a multiple of ${m}`];
  }
  if (kind === 'primes') {
    return [rng.sample([2, 3, 5, 7, 11, 13, 17, 19, 23, 29], 3), rng.pick([9, 15, 21, 25, 27, 33]), 'every other number is prime'];
  }
  return [rng.sample([8, 27, 64, 125, 216], 3), rng.pick([30, 50, 100, 150]), 'every other number is a perfect cube'];
}

/** A set per kind known to have one odd one out, should every draw fail. */
const SAFE_ODD_SETS = {
  even: [[10, 14, 16], 13, 'every other number is even'],
  squares: [[16, 36, 64], 50, 'every other number is a perfect square'],
  multiples: [[21, 35, 49], 50, 'every other number is a multiple of 7'],
  primes: [[11, 17, 23], 21, 'every other number is prime'],
  cubes: [[27, 64, 125], 100, 'every other number is a perfect cube'],
};

const G = {
  number_series(rng, d) {
    const rule = d <= 3 ? rng.pick(RULES.slice(0, 2)) : d <= 6 ? rng.pick(RULES.slice(0, 5)) : rng.pick(RULES);
    const { seq, why } = rule.build(rng, d);
    const shown = [0, 1, 2, 3, 4].map(seq);
    const answer = seq(5);
    if (!shown.every(Number.isFinite) || !Number.isFinite(answer)) return G.number_series(rng, Math.max(1, d - 1));
    return item({
      format: 'type_in',
      prompt: `What comes next?\n${shown.join(', ')}, ___`,
      answer: String(answer),
      rationale: `The pattern: ${why}. The next term is ${answer}.`,
    });
  },

  letter_series(rng, d) {
    // Start and step both range widely: those two choices are what make one
    // series a different question from another.
    const start = rng.int(0, 25);
    const step = rng.int(1, d <= 4 ? 4 : 7);
    const alternating = d >= 6 && rng.bool();
    // Two equal gaps are not an alternation, and the rationale would say "+3 then +3".
    let second = rng.int(1, 6);
    if (second === step) second = step === 6 ? 1 : step + 1;
    const offset = (i) => (alternating ? Math.ceil(i / 2) * step + Math.floor(i / 2) * second : i * step);
    const at = (i) => LETTERS[(start + offset(i)) % 26];
    const shown = [0, 1, 2, 3, 4].map(at);
    const answer = at(5);
    // A series that runs past Z carries on from A; say so, or "Y, B" looks like a typo.
    const wraps = start + offset(5) >= 26 ? ' (after Z, the count carries on from A)' : '';
    return item({
      format: 'type_in',
      prompt: `What letter comes next?\n${shown.join(', ')}, ___`,
      answer,
      rationale: alternating
        ? `The gaps alternate: +${step} then +${second} positions in the alphabet${wraps}, so the next letter is ${answer}.`
        : `Each letter moves ${step} position${step === 1 ? '' : 's'} forward in the alphabet${wraps}, so the next is ${answer}.`,
    });
  },

  odd_one_out(rng, d) {
    const kind = d <= 4 ? rng.pick(['even', 'squares', 'multiples']) : rng.pick(['squares', 'multiples', 'primes', 'cubes']);
    let group = [];
    let odd = 0;
    let why = '';
    // Draw until the intended number is the *only* odd one: three squares and
    // 72 is no question when one of the squares is the only odd number.
    for (let tries = 0; tries < 400 && !(group.length && onlyOdd([...group, odd], odd)); tries++) {
      [group, odd, why] = drawOddSet(rng, kind);
    }
    if (!onlyOdd([...group, odd], odd)) [group, odd, why] = SAFE_ODD_SETS[kind];
    const choices = rng.shuffle([...group, odd].map(String));
    return item({
      format: 'multiple_choice',
      // The numbers belong in the prompt as well as the options: the question
      // should read completely on its own.
      prompt: `Which number does not belong: ${choices.join(', ')}?`,
      choices,
      answer: String(odd),
      rationale: `${odd} is the exception: ${why}.`,
    });
  },

  matrix_pattern(rng, d) {
    const rowStep = rng.int(2, 4 + d);
    const colStep = rng.int(1, 3 + d);
    const base = rng.int(1, 9);
    const cell = (r, c) => base + r * rowStep + c * colStep;
    const answer = cell(2, 2);
    // The gap is "___". A "?" here was printed as "7 8?" once spacing was tidied,
    // which reads as a question about the 8 rather than a blank cell.
    const grid = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (r === 2 && c === 2 ? '___' : cell(r, c))).join('  ')).join('\n');
    return item({
      format: 'multiple_choice',
      prompt: `Find the missing value.\n\n${grid}`,
      choices: choicesFrom(rng, answer, [answer + colStep, answer - rowStep, answer + rowStep + colStep]),
      answer: String(answer),
      rationale: `Moving down a column adds ${rowStep}; moving right along a row adds ${colStep}. The missing cell is ${answer}.`,
    });
  },

  syllogism(rng, d) {
    const groups = rng.sample(['painters', 'chemists', 'cyclists', 'editors', 'pilots', 'gardeners', 'welders', 'violinists'], 3);
    const [A, B, C] = groups;
    const valid = rng.bool();
    if (valid) {
      const answer = `All ${A} are ${C}`;
      return item({
        format: 'multiple_choice',
        prompt: `Assume both statements are true:\n1. All ${A} are ${B}.\n2. All ${B} are ${C}.\n\nWhat must be true?`,
        choices: choicesFrom(rng, answer, [`All ${C} are ${A}`, `Some ${C} are not ${A}`, `No ${A} are ${C}`]),
        answer,
        rationale: `All ${A} are among the ${B}, and all ${B} are among the ${C}, so all ${A} are among the ${C}. The reverse does not follow.`,
      });
    }
    const answer = 'Nothing certain follows';
    return item({
      format: 'multiple_choice',
      prompt: `Assume both statements are true:\n1. All ${A} are ${B}.\n2. Some ${B} are ${C}.\n\nWhat must be true?`,
      choices: choicesFrom(rng, answer, [`Some ${A} are ${C}`, `All ${A} are ${C}`, `No ${A} are ${C}`]),
      answer,
      rationale: `The ${B} that are ${C} need not be the ones that are ${A}, so no conclusion about ${A} and ${C} is forced.`,
    });
  },

  numeric_reason(rng, d) {
    const kind = d <= 4 ? rng.pick(['average', 'share']) : rng.pick(['average', 'share', 'work', 'compound']);
    if (kind === 'average') {
      const n = rng.int(3, 5);
      const target = rng.int(6, 20);
      // Drawn until the missing number is a positive whole number: a "last
      // number" of -6 is arithmetic, but not a question anyone sets.
      let nums = [];
      let missing = 0;
      do {
        nums = Array.from({ length: n - 1 }, () => rng.int(2, target * 2));
        missing = target * n - nums.reduce((a, b) => a + b, 0);
      } while (missing < 1);
      return item({
        format: 'type_in',
        prompt: `The average of ${n} numbers is ${target}. ${COUNT_WORDS[n - 1].charAt(0).toUpperCase() + COUNT_WORDS[n - 1].slice(1)} of them are ${listAnd(nums)}. What is the last number?`,
        answer: String(missing),
        rationale: `The total must be ${n} × ${target} = ${target * n}; the known numbers sum to ${nums.reduce((a, b) => a + b, 0)}, leaving ${missing}.`,
      });
    }
    if (kind === 'share') {
      // Not all three equal, or there is no "largest share" to ask about.
      let parts = [];
      do parts = [rng.int(1, 5), rng.int(1, 5), rng.int(1, 5)]; while (new Set(parts).size === 1);
      const unit = rng.int(3, 12);
      const total = parts.reduce((a, b) => a + b, 0) * unit;
      return item({
        format: 'type_in',
        prompt: `$${total} is split in the ratio ${parts.join(':')}. What is the largest share?`,
        answer: String(Math.max(...parts) * unit),
        rationale: `There are ${parts.reduce((a, b) => a + b, 0)} parts, so one part is $${unit}; the largest share is ${Math.max(...parts)} parts, or $${Math.max(...parts) * unit}.`,
      });
    }
    if (kind === 'work') {
      const rate = rng.int(2, 8);
      const workers = rng.int(2, 6);
      const days = rng.int(2, 9);
      return item({
        format: 'type_in',
        prompt: `${workers} machines each produce ${rate} units per hour. How many units do they produce in ${days} hours?`,
        answer: String(workers * rate * days),
        rationale: `${workers} × ${rate} = ${workers * rate} units per hour, over ${days} hours that is ${workers * rate * days}.`,
      });
    }
    const start = rng.int(2, 10) * 100;
    const pct = rng.pick([10, 20, 50]);
    const after = Math.round(start * (1 + pct / 100) * (1 - pct / 100));
    return item({
      format: 'type_in',
      prompt: `A price of $${start} rises ${pct}% and then falls ${pct}%. What is the final price? Enter the number only.`,
      answer: String(after),
      rationale: `The second change applies to the larger amount, so the two do not cancel: ${start} × ${1 + pct / 100} × ${1 - pct / 100} = ${after}.`,
    });
  },

  code_cipher(rng, d) {
    const words = ['LIGHT', 'RIVER', 'STONE', 'CABLE', 'MOTOR', 'PLANT', 'BRAVE', 'QUIET'];
    const word = rng.pick(words);
    const shift = rng.int(1, d <= 5 ? 3 : 7);
    const encode = (w, s) => w.split('').map((ch) => LETTERS[(LETTERS.indexOf(ch) + s) % 26]).join('');
    const kind = d <= 5 ? 'forward' : rng.pick(['forward', 'reverse', 'number']);
    if (kind === 'forward') {
      const example = rng.pick(words.filter((w) => w !== word));
      return item({
        format: 'type_in',
        prompt: `In a code, ${example} is written ${encode(example, shift)}. How is ${word} written?`,
        answer: encode(word, shift),
        rationale: `Each letter moves ${shift} position${shift === 1 ? '' : 's'} forward in the alphabet, so ${word} becomes ${encode(word, shift)}.`,
      });
    }
    if (kind === 'reverse') {
      const rev = (w) => w.split('').reverse().join('');
      const example = rng.pick(words.filter((w) => w !== word));
      return item({
        format: 'type_in',
        prompt: `In a code, ${example} is written ${rev(encode(example, shift))}. How is ${word} written?`,
        answer: rev(encode(word, shift)),
        rationale: `Shift each letter ${shift} forward, then reverse the word: ${word} becomes ${rev(encode(word, shift))}.`,
      });
    }
    const toNums = (w) => w.split('').map((ch) => LETTERS.indexOf(ch) + 1).join('-');
    // The whole word: its first three letters ("LIG", "QUI") were not a word.
    const short = word;
    return item({
      format: 'type_in',
      prompt: `If A=1, B=2, and so on, write ${short} as numbers separated by hyphens.`,
      answer: toNums(short),
      rationale: `${short.split('').map((c) => `${c}=${LETTERS.indexOf(c) + 1}`).join(', ')}, giving ${toNums(short)}.`,
    });
  },

  working_memory(rng, d) {
    const len = Math.min(9, 4 + Math.floor(d / 2));
    const digits = Array.from({ length: len }, () => rng.int(1, 9));
    const task = d <= 4 ? 'reverse' : rng.pick(['reverse', 'sumPositions', 'dropRule']);
    if (task === 'reverse') {
      return item({
        format: 'type_in',
        prompt: `Hold these digits in mind, then enter them in reverse order, no spaces:\n${digits.join(' ')}`,
        answer: [...digits].reverse().join(''),
        rationale: `Reversed, ${digits.join(' ')} is ${[...digits].reverse().join(' ')}.`,
      });
    }
    if (task === 'sumPositions') {
      const a = 1, b = Math.min(len - 1, 3);
      return item({
        format: 'type_in',
        prompt: `For the sequence below, add the 2nd digit and the ${b + 1}th digit:\n${digits.join(' ')}`,
        answer: String(digits[a] + digits[b]),
        rationale: `The 2nd digit is ${digits[a]} and the ${b + 1}th is ${digits[b]}: their sum is ${digits[a] + digits[b]}.`,
      });
    }
    // At least one even digit, or the keyed answer is a "0" the prompt never
    // asked for and no learner could guess.
    if (!digits.some((n) => n % 2 === 0)) digits[rng.int(0, len - 1)] = rng.pick([2, 4, 6, 8]);
    const kept = digits.filter((n) => n % 2 === 0);
    return item({
      format: 'type_in',
      prompt: `From the sequence below, enter only the even digits, in order, no spaces:\n${digits.join(' ')}`,
      answer: kept.join(''),
      rationale: `The even digits in order are ${kept.join(', ')}.`,
    });
  },
};

// Authored items and generated families share one pool per skill.
for (const skill of new Set([...Object.keys(POOLS), ...Object.keys(FAMILIES)])) {
  G[skill] = fromPool([...(POOLS[skill] || []), ...(FAMILIES[skill] || [])], skill);
}

// A skill with shapes in it alternates between the pool and a different *kind*
// of question on the same material: naming a rule rather than extending it,
// saying why rather than which, applying a cipher rather than cracking one.
const SHAPES = require('./iq-shapes');
for (const [skill, shapes] of Object.entries(SHAPES)) {
  const base = G[skill];
  if (!base) continue;
  G[skill] = withShapes(base, shapes, skill);
}

module.exports = { GENERATORS: G, POOLS };
