/**
 * Render every built-in IQ question template and check what comes out.
 *
 *   node scripts/iq-template-audit.js               audit; exits 1 on any flag
 *   node scripts/iq-template-audit.js --skill=number_series   one skill only
 *   node scripts/iq-template-audit.js --examples=5  more examples per problem
 *   node scripts/iq-template-audit.js --show=2      also print renderings per family
 *   node scripts/iq-template-audit.js --seeds=300   seeds per difficulty for generators
 *   node scripts/iq-template-audit.js --content=DIR read the content files from DIR
 *        instead of content/ (used to audit a backup, to see what a fix changed)
 *
 * An IQ item is only worth asking if it has exactly one defensible answer. A
 * generator that computes its own key is internally consistent and can still be
 * wrong: the key can follow from a rule the prompt never shows, a distractor can
 * satisfy the rule as well as the key does, a "which is the odd one out" can
 * have two odd ones, and a series can have two plausible next terms. So this does
 * not trust the generator. It reads the *rendered prompt*, re-solves the question
 * by its own route, and compares that with the key:
 *
 *   - number and letter series: every rule it knows (constant step, constant
 *     ratio, constant second difference, alternating steps, sum of the previous
 *     two, steps that grow by a constant ratio) is tried against the terms shown,
 *     and every rule that fits must predict the same next term, which must be
 *     the key
 *   - odd one out: for every option, is there a property (parity, prime,
 *     composite, square, cube, multiple of 3..10, digit count, or a fact from
 *     this file's own word tables) that the other three share and it lacks?
 *     Exactly one option may be odd, and it must be the key
 *   - analogies: the relation the first pair holds is looked up, and exactly one
 *     option may complete the second pair under it
 *   - deduction: orderings, liar puzzles and seating are brute-forced over every
 *     arrangement; categorical statements are checked against every Venn model
 *     (each named group non-empty); conditionals by modus ponens / tollens
 *   - spatial, cipher, memory and numeric items are recomputed from the numbers
 *     and letters printed in the prompt
 *
 * A prompt no verifier recognises is itself a flag, so a new template cannot slip
 * in unchecked.
 *
 * Covered:
 *   content/iq-families.js   every family, every slot combination where that is
 *                            2,500 or fewer, else 1,500 seeded draws
 *   content/iq-items.js      every authored pool item, and every base generator
 *                            at 10 difficulties × N seeds
 *   content/iq-shapes.js     every shape at 10 difficulties × N seeds
 *
 * Checked on every item, besides the re-solve:
 *   - template debris: undefined, null, NaN, Infinity, "${", "[object"
 *   - grammar: a/an, doubled words, lower-case sentence starts, "1 folds make",
 *     ordinals ("4th", not "4rd"), stray spaces in a key
 *   - false facts stated as premises ("A cube has 4 faces")
 *   - multiple choice: key among the choices, no duplicate or equivalent choices
 *     (the grader's own normalisation decides "equivalent"), at least three
 *   - grading: the key grades correct through services/grading, every accepted
 *     spelling does, the spellings a learner would reasonably type do, and no
 *     distractor does
 *   - an `x` written on an item that never reaches grading as `accepts`
 *
 * No model is called and nothing is written.
 */
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';

const path = require('path');
const { grade, normalize: gradeNorm } = require('../services/grading');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = arg('skill', null);
const EXAMPLES = Number(arg('examples', 2));
const SHOW = Number(arg('show', 0));
const SEEDS = Number(arg('seeds', 150));
const CONTENT = path.resolve(arg('content', path.join(__dirname, '..', 'content')));
const load = (name) => require(path.join(CONTENT, name));

const ENUMERATE_UP_TO = 2500;
const SAMPLES = 1500;

const { makeRng } = load('rng');
const { fillSlots } = load('pool');
const { RELATIONS } = load('relations');

// ── the item a learner sees ─────────────────────────────────────────────────
/** bank.tidy, which is not exported: the same text a learner is shown. */
function tidy(text) {
  return String(text)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!])/g, '$1')
    .replace(/[ \t]+\?(?![ \t]*[\w=+\-×÷*/(])/g, '?')
    .trim();
}

/** bank.normalize's fields, from a generator's raw item. */
function normalizeItem(raw) {
  const it = {
    format: raw.format || 'multiple_choice',
    prompt: tidy(raw.prompt || ''),
    answer: String(raw.answer),
    rationale: tidy(raw.rationale || ''),
  };
  if (Array.isArray(raw.accepts) && raw.accepts.length) it.accepts = raw.accepts.map(String);
  if (it.format === 'multiple_choice') {
    it.rawChoices = (raw.choices || []).map(String);
    it.choices = [...new Set(it.rawChoices)];
  }
  return it;
}

/** pool.entryToItem without the shuffle, so duplicate choices stay visible. */
function entryRaw(e) {
  const raw = {
    format: e.c ? 'multiple_choice' : (e.format || 'type_in'),
    prompt: e.p,
    answer: String(e.a),
    rationale: e.r,
  };
  if (e.c) raw.choices = e.c.map(String);
  if (e.x) raw.accepts = [].concat(e.x).map(String);
  return raw;
}

function renderFamily(entry, s) {
  const v = (f) => (typeof f === 'function' ? f(s) : f);
  return entryRaw({
    p: String(v(entry.p)),
    c: entry.c ? v(entry.c).map(String) : undefined,
    a: String(v(entry.a)),
    r: String(v(entry.r)),
    x: entry.x ? v(entry.x) : undefined,
    format: entry.format,
  });
}

function* slotFills(entry, seedText) {
  const slots = entry.slots || {};
  const names = Object.keys(slots);
  const allArrays = names.every((n) => Array.isArray(slots[n]));
  const size = allArrays ? names.reduce((n, k) => n * slots[k].length, 1) : Infinity;
  if (size <= ENUMERATE_UP_TO) {
    const idx = names.map(() => 0);
    for (let i = 0; i < size; i++) {
      const s = {};
      names.forEach((n, j) => { s[n] = slots[n][idx[j]]; });
      yield s;
      for (let j = names.length - 1; j >= 0; j--) {
        idx[j]++;
        if (idx[j] < slots[names[j]].length) break;
        idx[j] = 0;
      }
    }
    return;
  }
  const rng = makeRng(`iq-audit:${seedText}`);
  for (let i = 0; i < SAMPLES; i++) yield fillSlots(rng, slots);
}

// ── small helpers ───────────────────────────────────────────────────────────
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const uniq = (xs) => [...new Set(xs)];
const close = (a, b) => Math.abs(a - b) < 1e-9;
const isInt = (s) => /^-?\d+$/.test(String(s).trim());
const numsOf = (text) => text.split(/,\s*/).map((t) => t.trim());
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let k = 2; k * k <= n; k++) if (n % k === 0) return false;
  return true;
}
const isSquare = (n) => n >= 0 && Number.isInteger(Math.sqrt(n));
const isCube = (n) => n >= 0 && Math.round(Math.cbrt(n)) ** 3 === n;
/** Half up, on the magnitude, which is how a learner is taught to round. */
const roundHalfUp = (x) => Math.sign(x) * Math.floor(Math.abs(x) + 0.5 + 1e-9);

function* permutations(list) {
  if (list.length <= 1) { yield list.slice(); return; }
  for (let i = 0; i < list.length; i++) {
    const rest = list.slice(0, i).concat(list.slice(i + 1));
    for (const p of permutations(rest)) yield [list[i], ...p];
  }
}

// ── series ──────────────────────────────────────────────────────────────────
/**
 * Every rule this file knows that fits the terms shown, with the next term each
 * predicts. A well-made series has one distinct prediction.
 */
function seriesPredictions(xs) {
  const out = [];
  const n = xs.length;
  if (n < 3) return out;
  const diffs = xs.slice(1).map((v, i) => v - xs[i]);
  const d2 = diffs.slice(1).map((v, i) => v - diffs[i]);
  if (diffs.every((d) => d === diffs[0])) out.push(['constant step', xs[n - 1] + diffs[0]]);
  if (xs.every((v) => v !== 0)) {
    const r = xs[1] / xs[0];
    if (r !== 1 && xs.every((v, i) => i === 0 || close(v, xs[i - 1] * r))) out.push(['constant ratio', xs[n - 1] * r]);
  }
  if (n >= 4 && d2.every((d) => d === d2[0]) && d2[0] !== 0) out.push(['constant second difference', xs[n - 1] + diffs[diffs.length - 1] + d2[0]]);
  if (n >= 4 && xs.slice(2).every((v, i) => v === xs[i] + xs[i + 1])) out.push(['sum of previous two', xs[n - 1] + xs[n - 2]]);
  if (diffs.length >= 4 && diffs[0] !== diffs[1] && diffs.every((d, i) => d === diffs[i % 2])) {
    out.push(['alternating steps', xs[n - 1] + diffs[diffs.length % 2]]);
  }
  if (n >= 4 && diffs.every((d) => d !== 0)) {
    const r = diffs[1] / diffs[0];
    if (r !== 1 && Number.isInteger(r) && diffs.every((d, i) => i === 0 || d === diffs[i - 1] * r)) {
      out.push(['steps grow by a ratio', xs[n - 1] + diffs[diffs.length - 1] * r]);
    }
  }
  return out;
}

function letterPredictions(letters) {
  const idx = letters.map((l) => LETTERS.indexOf(l));
  if (idx.some((i) => i < 0)) return null;
  const diffs = idx.slice(1).map((v, i) => (((v - idx[i]) % 26) + 26) % 26);
  const d2 = diffs.slice(1).map((v, i) => v - diffs[i]);
  const out = [];
  const at = (i) => LETTERS[((i % 26) + 26) % 26];
  const last = idx[idx.length - 1];
  if (diffs.every((d) => d === diffs[0])) out.push(['constant step', at(last + diffs[0])]);
  if (diffs.length >= 4 && diffs[0] !== diffs[1] && diffs.every((d, i) => d === diffs[i % 2])) {
    out.push(['alternating steps', at(last + diffs[diffs.length % 2])]);
  }
  if (diffs.length >= 3 && d2.every((d) => d === d2[0]) && d2[0] !== 0) {
    out.push(['steps grow by a constant', at(last + diffs[diffs.length - 1] + d2[0])]);
  }
  return out;
}

// ── odd one out ─────────────────────────────────────────────────────────────
/** Properties a learner could reasonably name for whole numbers. */
const NUMBER_PROPS = [
  ['even', (n) => n % 2 === 0], ['odd', (n) => n % 2 !== 0],
  ['prime', isPrime], ['composite', (n) => n > 3 && !isPrime(n)],
  ['a perfect square', isSquare], ['a perfect cube', isCube],
  // A number that alone *has* a striking property is as odd as one that alone
  // lacks a shared one: "16 is the only perfect square".
  ['not a perfect square', (n) => !isSquare(n)], ['not a perfect cube', (n) => !isCube(n)],
  ...[3, 4, 5, 6, 7, 8, 9, 10].map((k) => [`a multiple of ${k}`, (n) => n % k === 0]),
  ['one digit', (n) => n < 10], ['two digits', (n) => n >= 10 && n < 100], ['three digits', (n) => n >= 100 && n < 1000],
];

/**
 * The audit's own word knowledge. A word missing from a table makes that
 * property unknowable for its set, and the property is then not used.
 */
const WORD_FACTS = {
  'served hot': {
    yes: ['tea', 'coffee', 'cocoa', 'soup', 'porridge', 'broth', 'stew'],
    no: ['water', 'juice', 'ice', 'sorbet', 'lemonade', 'salad', 'ice cream', 'milkshake'],
  },
  'can fly': {
    yes: ['butterfly', 'woodpecker', 'beetle', 'hummingbird', 'bee', 'bat', 'sparrow', 'eagle', 'owl', 'moth', 'pigeon'],
    no: ['caterpillar', 'dolphin', 'goldfish', 'otter', 'iguana', 'penguin', 'ostrich', 'snail', 'shark'],
  },
  'solid at room temperature': {
    yes: ['iron', 'copper', 'wood', 'salt', 'glass', 'silver', 'stone', 'brick', 'gold', 'tin'],
    no: ['water', 'oil', 'milk', 'juice', 'steam', 'air', 'vinegar'],
  },
};
const vowelSound = (w) => (/^(uni|use|usu|eu|one\b)/i.test(w) ? false : /^(hour|honest|honou?r)/i.test(w) ? true : /^[aeiou]/i.test(w));
function wordProp(prop, w) {
  if (prop === 'begins with a vowel sound') return vowelSound(w);
  if (prop === 'begins with a consonant sound') return !vowelSound(w);
  const t = WORD_FACTS[prop];
  if (t.yes.includes(w)) return true;
  if (t.no.includes(w)) return false;
  return null;
}
const WORD_PROPS = ['begins with a vowel sound', 'begins with a consonant sound', ...Object.keys(WORD_FACTS)];

/** Properties evaluable for every member of the set, as [name, test]. */
function propsFor(items) {
  if (items.every(isInt)) return NUMBER_PROPS.map(([n, f]) => [n, (x) => f(Number(x))]);
  return WORD_PROPS.filter((p) => items.every((w) => wordProp(p, w) !== null)).map((p) => [p, (w) => wordProp(p, w)]);
}

/** Every option that is odd under some property: the other three have it and it does not. */
function oddCandidates(items) {
  const props = propsFor(items);
  const odd = new Map();
  items.forEach((x, i) => {
    const others = items.filter((_, j) => j !== i);
    for (const [name, f] of props) {
      if (!f(x) && others.every(f)) { odd.set(x, name); break; }
    }
  });
  return odd;
}

/** A reason sentence, mapped to the property it names. */
function reasonProp(text) {
  const t = text.toLowerCase();
  if (/begin with a vowel sound/.test(t)) return 'begins with a vowel sound';
  if (/are even/.test(t)) return 'even';
  if (/served hot/.test(t)) return 'served hot';
  if (/can fly/.test(t)) return 'can fly';
  if (/solid at room temperature/.test(t)) return 'solid at room temperature';
  return null;
}
function propHolds(prop, w) {
  if (prop === 'even') return isInt(w) ? Number(w) % 2 === 0 : false;
  if (isInt(w)) return false;
  return wordProp(prop, w);
}

// ── categorical logic ───────────────────────────────────────────────────────
/**
 * Statements about groups, checked against every Venn model of the terms in
 * play with each named group non-empty. A conclusion "must be true" when it
 * holds in every model where the premises do.
 */
function evalCat(st, model, terms) {
  const ix = (t) => terms.indexOf(t);
  const has = (region, t) => !!(region & (1 << ix(t)));
  const regions = model;
  switch (st.form) {
    case 'all': return !regions.some((r) => has(r, st.x) && !has(r, st.y));
    case 'no': return !regions.some((r) => has(r, st.x) && has(r, st.y));
    case 'some': return regions.some((r) => has(r, st.x) && has(r, st.y));
    case 'somenot': return regions.some((r) => has(r, st.x) && !has(r, st.y));
    default: return false;
  }
}
const catCache = new Map();
function mustFollow(premises, conclusion) {
  if (!conclusion || conclusion.form === 'unknown') return false;
  const terms = uniq([...premises, conclusion].flatMap((s) => [s.x, s.y]));
  const key = JSON.stringify([premises, conclusion]);
  if (catCache.has(key)) return catCache.get(key);
  const k = terms.length;
  const allRegions = Array.from({ length: (1 << k) - 1 }, (_, i) => i + 1);
  let holds = true;
  let anyModel = false;
  for (let mask = 0; mask < (1 << allRegions.length) && holds; mask++) {
    const model = allRegions.filter((_, i) => mask & (1 << i));
    if (!terms.every((t, ti) => model.some((r) => r & (1 << ti)))) continue;
    if (!premises.every((p) => evalCat(p, model, terms))) continue;
    anyModel = true;
    if (!evalCat(conclusion, model, terms)) holds = false;
  }
  const out = holds && anyModel;
  catCache.set(key, out);
  return out;
}

/** "the archivists" / "careful people" / "archivist" → one canonical term. */
function term(t) {
  return t.toLowerCase().trim()
    .replace(/^(the|a|an) /, '')
    .replace(/ people$/, '')
    .split(' ')
    .map((w) => (w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w))
    .join(' ');
}

/** One sentence about groups, or { form: 'unknown' }. `ctx.subject` names "they"/"some". */
function parseCat(sentence, ctx = {}) {
  const s = sentence.replace(/[.]$/, '').trim();
  let m;
  const st = (form, x, y) => ({ form, x: term(x), y: term(y) });
  if ((m = s.match(/^All (?:the )?(.+?) are (.+)$/i))) return st('all', m[1], m[2]);
  if ((m = s.match(/^No (.+?) (?:are|is) (?:a |an )?(.+)$/i))) return st('no', m[1], m[2]);
  if ((m = s.match(/^Some (.+?) are not (.+)$/i))) return st('somenot', m[1], m[2]);
  if ((m = s.match(/^Some people who can (.+?) can (.+)$/i))) return st('some', `can ${m[1]}`, `can ${m[2]}`);
  if ((m = s.match(/^Some can (.+)$/i)) && ctx.subject) return st('some', ctx.subject, `can ${m[1]}`);
  if ((m = s.match(/^Some (.+?) are (.+)$/i))) return st('some', m[1], m[2]);
  if ((m = s.match(/^Every (.+?) can (.+)$/i))) return st('all', m[1], `can ${m[2]}`);
  if ((m = s.match(/^Everyone who can (.+?) is (?:a |an )?(.+)$/i))) return st('all', `can ${m[1]}`, m[2]);
  if ((m = s.match(/^Nobody who can (.+?) is (?:a |an )?(.+)$/i))) return st('no', `can ${m[1]}`, m[2]);
  if ((m = s.match(/^Anyone who is not (.+?) is not (?:a |an )?(.+)$/i))) return st('all', m[2], m[1]);
  if ((m = s.match(/^They are (.+)$/i)) && ctx.subject) return st('all', ctx.subject, m[1]);
  return { form: 'unknown', text: s };
}

// ── conditionals ────────────────────────────────────────────────────────────
const STOP = new Set(['the', 'a', 'an', 'is', 'was', 'did', 'does', 'do', 'not', 'it', 'be', 'are', 'were', 'below', 'before']);
const stemW = (w) => w.replace(/(es|ed|s|e)$/, '');
const content = (t) => uniq(t.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map(stemW)).sort().join(' ');
function classify(text, P, Q) {
  if (/^nothing (certain )?follows$/i.test(text.trim())) return 'nothing';
  const neg = /\bnot\b|n't/.test(text);
  const c = content(text);
  if (c === content(P)) return neg ? 'notP' : 'P';
  if (c === content(Q)) return neg ? 'notQ' : 'Q';
  return 'other';
}

// ── orderings ───────────────────────────────────────────────────────────────
/**
 * Relations between named people, read off the prompt. Returns the names in the
 * order they appear and a list of constraints over a position map (0 = first,
 * or tallest, or oldest).
 */
function readOrderFacts(text) {
  const facts = [];
  const names = [];
  const add = (n) => { if (!names.includes(n)) names.push(n); };
  const N = '([A-Z][a-z]+)\\b';
  const rel = (re, fn) => {
    for (const m of text.matchAll(new RegExp(re, 'g'))) { fn(m); }
  };
  rel(`${N} (?:finishes|finished|is) ahead of ${N}(?! but)`, (m) => { add(m[1]); add(m[2]); facts.push((p) => p[m[1]] < p[m[2]]); });
  rel(`${N} is behind ${N} but ahead of ${N}`, (m) => { add(m[1]); add(m[2]); add(m[3]); facts.push((p) => p[m[1]] > p[m[2]] && p[m[1]] < p[m[3]]); });
  rel(`${N} is behind ${N}(?! but)`, (m) => { add(m[1]); add(m[2]); facts.push((p) => p[m[1]] > p[m[2]]); });
  rel(`${N} is (?:taller|older) than ${N}`, (m) => { add(m[1]); add(m[2]); facts.push((p) => p[m[1]] < p[m[2]]); });
  return { names, facts };
}
function orderings(names, facts) {
  const out = [];
  for (const perm of permutations(names)) {
    const p = {};
    perm.forEach((n, i) => { p[n] = i; });
    if (facts.every((f) => f(p))) out.push(p);
  }
  return out;
}

// ── analogies ───────────────────────────────────────────────────────────────
/** Pairs the audit also accepts as holding a relation, beyond relations.js's own lists. */
const EXTRA_PAIRS = {
  opposites: [['meticulous', 'careless'], ['frugal', 'wasteful']],
  produces: [['vaccine', 'immunity'], ['training', 'endurance']],
  // Tempting decoys that are, on reflection, also a cause and its consequence.
  cause: [['recession', 'poverty'], ['drought', 'poverty'], ['flood', 'poverty'], ['flood', 'crop loss'],
    ['drought', 'crop loss'], ['drought', 'harvest failure']],
};
const SYMMETRIC = new Set(['opposites']);
function relationPairs(name) {
  const base = (RELATIONS[name] ? RELATIONS[name].pairs : []).concat(EXTRA_PAIRS[name] || []);
  return SYMMETRIC.has(name) ? base.concat(base.map(([a, b]) => [b, a])) : base;
}
const ALL_RELATIONS = uniq([...Object.keys(RELATIONS), ...Object.keys(EXTRA_PAIRS)]);
const holds = (name, a, b) => relationPairs(name).some(([x, y]) => x === a && y === b);
const relationsOf = (a, b) => ALL_RELATIONS.filter((n) => holds(n, a.toLowerCase(), b.toLowerCase()));

// ── verifiers ───────────────────────────────────────────────────────────────
/**
 * Each returns a verdict:
 *   str      the answer, re-derived (type-in: must grade correct; choice: must be the key)
 *   mc       a predicate: is this option a right answer? Exactly one may pass.
 *   set      type-in answers that are all right (every one must grade correct)
 *   typed    other spellings a learner would type that must grade correct
 *   wrong    answers that must grade wrong
 *   flags    [code, detail] pairs the verifier found in the prompt itself
 */
const V = [];
const def = (name, re, fn) => V.push({ name, re, fn });

// series
def('series: what comes next', /^What comes next\?\n(-?\d+(?:, -?\d+)+), ___$/, (m) => {
  const xs = numsOf(m[1]).map(Number);
  const preds = seriesPredictions(xs);
  const values = uniq(preds.map((p) => p[1]));
  const flags = [];
  if (!values.length) return { flags: [['no-rule-fits', `no known rule fits ${xs.join(', ')}`]] };
  if (values.length > 1) flags.push(['two-continuations', preds.map(([r, v]) => `${r} → ${v}`).join('; ')]);
  return { str: String(values[0]), flags };
});
def('series: what letter comes next', /^What letter comes next\?\n([A-Z](?:, [A-Z])+), ___$/, (m) => {
  const preds = letterPredictions(numsOf(m[1]));
  const values = uniq(preds.map((p) => p[1]));
  if (!values.length) return { flags: [['no-rule-fits', m[1]]] };
  const flags = values.length > 1 ? [['two-continuations', preds.map(([r, v]) => `${r} → ${v}`).join('; ')]] : [];
  return { str: values[0], typed: [values[0].toLowerCase()], flags };
});
def('series: letter code next', /^What comes next in this (?:code|letter series)\? ([A-Z](?: [A-Z])+) ___$/, (m) => {
  const preds = letterPredictions(m[1].split(' '));
  const values = uniq(preds.map((p) => p[1]));
  if (!values.length) return { flags: [['no-rule-fits', m[1]]] };
  const flags = values.length > 1 ? [['two-continuations', preds.map(([r, v]) => `${r} → ${v}`).join('; ')]] : [];
  return { str: values[0], flags };
});
def('series: name the rule', /^Which rule fits (-?\d+(?:, -?\d+)+)\?$/, (m) => {
  const xs = numsOf(m[1]).map(Number);
  const diffs = xs.slice(1).map((v, i) => v - xs[i]);
  const fits = (c) => {
    let mm;
    if ((mm = c.match(/^Each term is (\d+) more than the one before$/))) return diffs.every((d) => d === +mm[1]);
    if (/^Each term is twice the one before$/.test(c)) return xs.every((v, i) => i === 0 || v === 2 * xs[i - 1]);
    if (/^The terms are in no pattern$/.test(c)) return seriesPredictions(xs).length === 0;
    return null;
  };
  return { mc: fits };
});
def('series: the step', /^In the series (-?\d+(?:, -?\d+)+), by how much does each term increase\?$/, (m) => {
  const xs = numsOf(m[1]).map(Number);
  const diffs = uniq(xs.slice(1).map((v, i) => v - xs[i]));
  if (diffs.length !== 1) return { flags: [['inconsistent-prompt', `gaps ${diffs.join(', ')}`]] };
  return { str: String(diffs[0]) };
});
def('series: the broken term', /^In (-?\d+(?:, -?\d+)+), which position breaks the pattern\? Give the position number, 1 to (\d+)\.$/, (m) => {
  const xs = numsOf(m[1]).map(Number);
  const flags = [];
  if (+m[2] !== xs.length) flags.push(['inconsistent-prompt', `"1 to ${m[2]}" for ${xs.length} terms`]);
  // A position is the break when the other terms form one series on their own
  // positions: equal steps, or equal ratios.
  const fitsWithout = (j) => {
    const pts = xs.map((v, i) => [i, v]).filter(([i]) => i !== j);
    const [[i0, v0], [i1, v1]] = pts;
    const step = (v1 - v0) / (i1 - i0);
    if (pts.every(([i, v]) => close(v, v0 + (i - i0) * step))) return true;
    if (v0 !== 0 && pts.every(([, v]) => v !== 0)) {
      const r = Math.pow(v1 / v0, 1 / (i1 - i0));
      if (Number.isFinite(r) && pts.every(([i, v]) => close(v, v0 * Math.pow(r, i - i0)))) return true;
    }
    return false;
  };
  const breaks = xs.map((_, j) => j).filter(fitsWithout).map((j) => String(j + 1));
  if (breaks.length !== 1) flags.push(['not-unique', `positions that could be the break: ${breaks.join(', ') || 'none'}`]);
  return { str: breaks[0] || '?', flags };
});

// odd one out
function oddVerdict(listText, opts = {}) {
  const items = listText.split(/,\s*/).map((s) => s.trim());
  const odd = oddCandidates(items);
  const flags = [];
  if (!propsFor(items).length) flags.push(['unknown-words', `the audit has no facts for ${items.join(', ')}`]);
  return { items, odd, mc: (c) => odd.has(c), flags, ...opts };
}
def('odd one out: which number', /^Which number does not belong: (.+)\?$/, (m, it) => {
  const v = oddVerdict(m[1]);
  if (it.choices && uniq(v.items).sort().join() !== [...it.choices].sort().join()) v.flags.push(['choices-differ-from-list', `${v.items.join(', ')} vs ${it.choices.join(', ')}`]);
  return v;
});
def('odd one out: which one', /^Which is the odd one out: (.+)\?$/, (m, it) => {
  const v = oddVerdict(m[1]);
  if (it.choices && uniq(v.items).sort().join() !== [...it.choices].sort().join()) v.flags.push(['choices-differ-from-list', `${v.items.join(', ')} vs ${it.choices.join(', ')}`]);
  return v;
});
def('odd one out: the reason', /^In (.+), the odd one out is (.+?)\. Which reason explains why\?$/, (m) => {
  const items = m[1].split(/,\s*/);
  const theOdd = m[2];
  const flags = [];
  const odd = oddCandidates(items);
  if (odd.size !== 1 || !odd.has(theOdd)) flags.push(['not-unique', `odd under the audit's properties: ${[...odd.keys()].join(', ') || 'none'}`]);
  const others = items.filter((w) => w !== theOdd);
  return {
    flags,
    mc: (c) => {
      const p = reasonProp(c);
      if (!p) return null;
      return others.every((w) => propHolds(p, w) === true) && propHolds(p, theOdd) === false;
    },
  };
});
def('odd one out: name one of the three', /^In (.+), three of them belong together\. Name one of those three\.$/, (m) => {
  const items = m[1].split(/,\s*/);
  const odd = oddCandidates(items);
  const flags = [];
  if (odd.size !== 1) return { flags: [['not-unique', `odd under the audit's properties: ${[...odd.keys()].join(', ') || 'none'}`]] };
  const theOdd = [...odd.keys()][0];
  const three = items.filter((w) => w !== theOdd);
  return { set: three, wrong: [theOdd], flags };
});
def('odd one out: remembered list', /^Look at this list once: (.+)\. Which one was not like the others\?$/, (m) => {
  const items = m[1].split(/,\s*/);
  const odd = oddCandidates(items);
  if (odd.size !== 1) return { flags: [['not-unique', `odd under the audit's properties: ${[...odd.keys()].join(', ') || 'none'}`]] };
  return { str: [...odd.keys()][0] };
});

// matrices
function readGrid(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/));
}
function arithmeticRow(row) {
  const xs = row.map(Number);
  const d = xs[1] - xs[0];
  return xs.every((v, i) => i === 0 || v - xs[i - 1] === d) ? d : null;
}
def('matrix: missing value', /^Find the missing value\.\n\n([\s\S]+)$/, (m) => {
  const g = readGrid(m[1]);
  const flags = [];
  // A "?" glued onto the number before it ("7 8?") is how bank.tidy prints a
  // blank written as " ?": the learner sees a question mark, not a gap.
  if (g.length !== 3 || g.some((r) => r.length !== 3) || g[2][2] !== '___') return { flags: [['unreadable-grid', m[1].replace(/\n/g, ' / ')]] };
  const steps = [arithmeticRow(g[0]), arithmeticRow(g[1]), arithmeticRow(g[2].slice(0, 2))];
  const colSteps = [0, 1].map((c) => arithmeticRow([g[0][c], g[1][c], g[2][c]]));
  if (steps[0] == null || steps[0] !== steps[1] || colSteps[0] == null || colSteps[0] !== colSteps[1]) {
    flags.push(['inconsistent-prompt', 'rows or columns do not step evenly']);
  }
  const byRow = Number(g[2][1]) + steps[0];
  const byCol = Number(g[1][2]) + (Number(g[1][2]) - Number(g[0][2]));
  if (byRow !== byCol) flags.push(['two-continuations', `row rule → ${byRow}, column rule → ${byCol}`]);
  return { str: String(byRow), mc: (c) => Number(c) === byRow, flags };
});
def('matrix: next row', /^In each row, the numbers add the same amount going right\.\n([\s\S]+?)\n___ ___ ___(?:\n(.+))?$/, (m) => {
  const g = readGrid(m[1]).map((r) => r.map(Number));
  const flags = [];
  const step = arithmeticRow(g[0]);
  if (g.some((r) => arithmeticRow(r) !== step)) flags.push(['inconsistent-prompt', 'rows do not add the same amount']);
  const down = g[1][0] - g[0][0];
  if (g.some((r, i) => i > 0 && r[0] - g[i - 1][0] !== down)) flags.push(['inconsistent-prompt', 'rows do not start evenly']);
  const next = g[g.length - 1].map((v) => v + down);
  return { str: next.join(' '), typed: [next.join(' '), next.join(', ')], flags };
});
def('matrix: count-up grid', /^What goes in the blank\?\n\n1 2 3\n4 5 6\n7 8 ___$/, () => ({ str: '9', mc: (c) => c === '9' }));
def('matrix: times-then-plus-one rows', /^In each row, the second number is (\d+) times the first, and the third is the second plus one\.\n([\s\S]+?)\n(\d+) ___ ___(?:\n(.+))?$/, (m) => {
  const k = +m[1];
  const rows = readGrid(m[2]).map((r) => r.map(Number));
  const flags = [];
  for (const r of rows) {
    if (r[1] !== k * r[0] || r[2] !== r[1] + 1) flags.push(['inconsistent-prompt', `row ${r.join(' ')} does not follow "${k} times, then plus one"`]);
  }
  const a = +m[3];
  return { str: `${k * a} ${k * a + 1}`, typed: [`${k * a} ${k * a + 1}`, `${k * a}, ${k * a + 1}`], flags };
});
def('matrix: replace the blank', /^What number replaces the blank\?\n([\s\S]+)$/, (m) => {
  const g = readGrid(m[1]);
  const r = g.findIndex((row) => row.includes('___'));
  const c = g[r].indexOf('___');
  const flags = [];
  const others = g.filter((_, i) => i !== r).map((row) => row.map(Number));
  const rowStep = arithmeticRow(others[0]);
  if (others.some((row) => arithmeticRow(row) !== rowStep)) flags.push(['inconsistent-prompt', 'rows step unevenly']);
  const known = g[r].map((v, i) => (i === c ? null : Number(v)));
  const byRow = c > 0 ? known[c - 1] + rowStep : known[c + 1] - rowStep;
  // The column read the other way must agree, or the grid has two answers.
  const colVals = g.map((row, i) => (i === r ? null : Number(row[c])));
  const byCol = r > 0 && r < g.length - 1 ? (colVals[r - 1] + colVals[r + 1]) / 2
    : r === 0 ? 2 * colVals[1] - colVals[2] : 2 * colVals[r - 1] - colVals[r - 2];
  if (byCol !== byRow) flags.push(['two-continuations', `row rule → ${byRow}, column rule → ${byCol}`]);
  return { str: String(byRow), flags };
});

// syllogisms and groups
function catVerdict(premises, ask, choicesCtx = {}) {
  const flags = [];
  for (const p of premises) if (p.form === 'unknown') flags.push(['unparsed-premise', p.text]);
  const parsed = (c) => parseCat(c, choicesCtx);
  const must = (c) => {
    if (/^Nothing (certain )?follows$/i.test(c)) {
      // Nothing follows when no relation between any two terms that is not
      // already a premise is forced.
      const terms = uniq(premises.flatMap((p) => [p.x, p.y]));
      for (const x of terms) {
        for (const y of terms) {
          if (x === y) continue;
          for (const form of ['all', 'no', 'some', 'somenot']) {
            const st = { form, x, y };
            if (premises.some((p) => p.form === form && p.x === x && p.y === y)) continue;
            if (form === 'some' && premises.some((p) => p.form === 'all' && p.x === x && p.y === y)) continue;
            if (form === 'some' && premises.some((p) => (p.form === 'some' || p.form === 'all') && p.x === y && p.y === x)) continue;
            if (form === 'no' && premises.some((p) => p.form === 'no' && p.x === y && p.y === x)) continue;
            if (mustFollow(premises, st)) return false;
          }
        }
      }
      return true;
    }
    const st = parsed(c);
    if (st.form === 'unknown') return /^Most\b/i.test(c) || /^Something else/i.test(c) || /must be false/.test(c) ? false : null;
    return mustFollow(premises, st);
  };
  return { mc: ask === 'not' ? (c) => { const r = must(c); return r == null ? null : !r; } : must, flags };
}
def('syllogism: two premises', /^Assume both statements are true:\n1\. (.+)\.\n2\. (.+)\.\n\nWhat must be true\?$/, (m) => catVerdict([parseCat(m[1]), parseCat(m[2])]));
def('syllogism: letters', /^If all (\w+) are (\w+), and no (\w+) are (\w+), what follows about (\w+) and (\w+)\?$/, (m) => catVerdict([parseCat(`All ${m[1]} are ${m[2]}`), parseCat(`No ${m[3]} are ${m[4]}`)]));
def('syllogism: every member can', /^Every (.+?) can (.+?)\. Some (?:members )?can (.+?)\. Which must be true\?$/, (m) => {
  return catVerdict([parseCat(`Every ${m[1]} can ${m[2]}`), parseCat(`Some can ${m[3]}`, { subject: m[1] })], 'must', { subject: m[1] });
});
def('syllogism: club members', /^Every member of the club can swim\. Some members can sail\. Which must be true\?$/, () => {
  const prem = [parseCat('Every member of the club can swim'), parseCat('Some can sail', { subject: 'member of the club' })];
  const map = {
    'All swimmers are club members': { form: 'all', x: 'can swim', y: 'member of the club' },
    'Most members can sail': { form: 'unknown' },
    'No sailor is a club member': { form: 'no', x: 'can sail', y: 'member of the club' },
  };
  return { mc: (c) => (map[c] ? mustFollow(prem, map[c]) : mustFollow(prem, parseCat(c))) };
});
def('syllogism: one premise', /^All the (\w+) are (\w+)\. Which statement must be true\?$/, (m) => catVerdict([parseCat(`All ${m[1]} are ${m[2]}`)]));
def('syllogism: does not follow', /^All the (\w+) are (\w+)\. Some (\w+) people are (\w+)\. Which conclusion does NOT follow\?$/, (m) => catVerdict([parseCat(`All ${m[1]} are ${m[2]}`), parseCat(`Some ${m[3]} are ${m[4]}`)], 'not'));
def('syllogism: chain', /^All the (\w+) are (\w+)\. All the (\w+) people are (\w+)\. What must be true of every (\w+)\?$/, (m) => catVerdict([parseCat(`All ${m[1]} are ${m[2]}`), parseCat(`All ${m[3]} are ${m[4]}`)], 'must', { subject: m[5] }));
def('syllogism: is it possible', /^All the (\w+) are (\w+)\. Some (\w+) people are (\w+)\. Is it possible that some (\w+) are (\w+)\?$/, (m) => {
  const prem = [parseCat(`All ${m[1]} are ${m[2]}`), parseCat(`Some ${m[3]} are ${m[4]}`)];
  const st = parseCat(`Some ${m[5]} are ${m[6]}`);
  // Possible unless its denial must follow.
  const possible = !mustFollow(prem, { form: 'no', x: st.x, y: st.y });
  return { str: possible ? 'Yes' : 'No', typed: [possible ? 'yes' : 'no'], wrong: [possible ? 'No' : 'Yes'] };
});

// conditionals
def('conditional: what follows', /^If (.+?), (.+?)\. (.+?)\. What follows\?$/, (m) => {
  const [, P, Q, given] = m;
  const g = classify(given, P, Q);
  const flags = [];
  if (g === 'other' || g === 'nothing') return { flags: [['unparsed-premise', given]] };
  const want = { notQ: 'notP', P: 'Q', Q: 'nothing', notP: 'nothing' }[g];
  return { mc: (c) => classify(c, P, Q) === want, flags };
});

// orderings
def('order: who finished last', /^(Three|Four|Five) (?:people|runners) .+?\. Who finished last\?$/, (m, it) => {
  const { names, facts } = readOrderFacts(it.prompt);
  const flags = [];
  if (names.length !== NUMBER_WORDS[m[1].toLowerCase()]) flags.push(['inconsistent-prompt', `"${m[1]}" people, ${names.length} named`]);
  const sols = orderings(names, facts);
  const lasts = uniq(sols.map((p) => names.find((n) => p[n] === names.length - 1)));
  return { mc: (c) => (c === 'Cannot be determined' ? lasts.length > 1 : lasts.length === 1 && lasts[0] === c), flags };
});
def('order: who is second', /^(Three|Four|Five) people .+?\. Who is second\?$/, (m, it) => {
  const { names, facts } = readOrderFacts(it.prompt);
  const flags = [];
  if (names.length !== NUMBER_WORDS[m[1].toLowerCase()]) flags.push(['inconsistent-prompt', `"${m[1]}" people, ${names.length} named`]);
  const sols = orderings(names, facts);
  const seconds = uniq(sols.map((p) => names.find((n) => p[n] === 1)));
  return { mc: (c) => (c === 'Cannot be determined' ? seconds.length > 1 : seconds.length === 1 && seconds[0] === c), flags };
});
def('order: which must be true', /^([A-Z][a-z]+) is taller than ([A-Z][a-z]+)\. ([A-Z][a-z]+) is taller than ([A-Z][a-z]+)\. Which must be true\?$/, (m, it) => {
  const { names, facts } = readOrderFacts(it.prompt);
  const sols = orderings(names, facts);
  const claim = (c) => {
    let mm;
    if ((mm = c.match(/^([A-Z][a-z]+) is taller than ([A-Z][a-z]+)$/))) return (p) => p[mm[1]] < p[mm[2]];
    if ((mm = c.match(/^([A-Z][a-z]+) is the shortest$/))) return (p) => p[mm[1]] === names.length - 1;
    if ((mm = c.match(/^([A-Z][a-z]+) is the tallest$/))) return (p) => p[mm[1]] === 0;
    return null;
  };
  const must = (c) => {
    if (c === 'Nothing follows') return !it.choices.some((o) => o !== c && claim(o) && sols.every(claim(o)));
    const f = claim(c);
    return f ? sols.every(f) : null;
  };
  return { mc: must };
});
def('order: how many older', /^([A-Z][a-z]+) is older than ([A-Z][a-z]+)\. ([A-Z][a-z]+) is older than ([A-Z][a-z]+)\. How many of the (\w+) are older than ([A-Z][a-z]+)\?$/, (m, it) => {
  const { names, facts } = readOrderFacts(it.prompt);
  const flags = [];
  if (names.length !== NUMBER_WORDS[m[5]]) flags.push(['inconsistent-prompt', `"the ${m[5]}", ${names.length} named`]);
  const counts = uniq(orderings(names, facts).map((p) => names.filter((n) => p[n] < p[m[6]]).length));
  if (counts.length !== 1) return { flags: [['not-unique', `counts ${counts.join(', ')}`]] };
  return { str: String(counts[0]), flags };
});
def('order: how many ahead', /^([A-Z][a-z]+), ([A-Z][a-z]+), ([A-Z][a-z]+), and ([A-Z][a-z]+) finished a race in that order, with no ties\. How many finished ahead of ([A-Z][a-z]+)\?$/, (m) => {
  const order = [m[1], m[2], m[3], m[4]];
  return { str: String(order.indexOf(m[5])) };
});
def('order: who ran which leg', /^([A-Z][a-z]+), ([A-Z][a-z]+), and ([A-Z][a-z]+) each ran one of three legs: (\w+), (\w+), (\w+)\. (.+) Who ran (\w+)\?$/, (m) => {
  const people = [m[1], m[2], m[3]];
  const legs = [m[4], m[5], m[6]];
  const clauses = m[7].replace(/\.$/, '').split(/, (?:and )?/);
  const tests = clauses.map((cl) => {
    let mm;
    if ((mm = cl.match(/^(?:and )?([A-Z][a-z]+) did not run (\w+)$/))) return (a) => a[mm[1]] !== mm[2];
    if ((mm = cl.match(/^(?:and )?([A-Z][a-z]+) ran (\w+)$/))) return (a) => a[mm[1]] === mm[2];
    return null;
  });
  if (tests.some((t) => !t)) return { flags: [['unparsed-premise', m[7]]] };
  const who = uniq([...permutations(legs)].map((perm) => {
    const a = {};
    people.forEach((p, i) => { a[p] = perm[i]; });
    return tests.every((t) => t(a)) ? people.find((p) => a[p] === m[8]) : null;
  }).filter(Boolean));
  if (who.length !== 1) return { flags: [['not-unique', `could be ${who.join(', ') || 'nobody'}`]] };
  return { str: who[0], typed: [who[0].toLowerCase()] };
});
def('order: liar puzzle', /^(Three|Four) suspects: exactly one lies\. (.+) Who lies\?$/, (m) => {
  const count = NUMBER_WORDS[m[1].toLowerCase()];
  const claims = [];
  for (const s of m[2].split(/(?<=\.) /)) {
    let mm;
    if ((mm = s.match(/^([A-Z]) says ([A-Z]) lies\.$/))) claims.push([mm[1], (L) => L === mm[2]]);
    else if ((mm = s.match(/^([A-Z]) says ([A-Z]) tells the truth\.$/))) claims.push([mm[1], (L) => L !== mm[2]]);
    else if ((mm = s.match(/^([A-Z]) says ([A-Z]) and ([A-Z]) both lie\.$/))) claims.push([mm[1], () => false]);
    else return { flags: [['unparsed-premise', s]] };
  }
  const named = uniq(claims.map((c) => c[0]).concat(m[2].match(/\b[A-Z]\b/g)));
  const suspects = named.concat(Array.from({ length: Math.max(0, count - named.length) }, (_, i) => `(unnamed ${i + 1})`));
  // With exactly one liar, "X and Y both lie" is always false, which the claim above encodes.
  const liars = suspects.filter((L) => claims.every(([who, f]) => (who === L ? !f(L) : f(L))));
  const flags = [];
  if (!liars.length) flags.push(['unsolvable', 'no single liar is consistent with every statement']);
  return { mc: (c) => (c === 'Cannot be determined' ? liars.length > 1 : liars.length === 1 && liars[0] === c), flags };
});
def('order: books on a shelf', /^(Five|Four|Three) books sit on a shelf\. (.+) Which is true\?$/, (m) => {
  const n = NUMBER_WORDS[m[1].toLowerCase()];
  const facts = [];
  for (const s of m[2].split(/(?<=\.) /)) {
    let mm;
    if ((mm = s.match(/^The (\w+) is to the left of the (\w+)\.$/))) facts.push((p) => p[mm[1]] < p[mm[2]]);
    else if ((mm = s.match(/^The (\w+) is immediately right of the (\w+)\.$/))) facts.push((p) => p[mm[1]] === p[mm[2]] + 1);
    else if ((mm = s.match(/^The (\w+) is not next to the (\w+)\.$/))) facts.push((p) => Math.abs(p[mm[1]] - p[mm[2]]) !== 1);
    else return { flags: [['unparsed-premise', s]] };
  }
  const books = uniq(m[2].match(/the (\w+)/gi).map((x) => x.split(' ')[1].toLowerCase())).filter((b) => b !== 'left');
  const places = [];
  const pos = Array.from({ length: n }, (_, i) => i);
  for (const perm of permutations(pos)) {
    const p = {};
    books.forEach((b, i) => { p[b] = perm[i]; });
    if (facts.every((f) => f(p))) places.push(p);
  }
  const claim = (c) => {
    let mm;
    if ((mm = c.match(/^At least one book sits between the (\w+) and the (\w+)$/))) return (p) => Math.abs(p[mm[1]] - p[mm[2]]) >= 2;
    if ((mm = c.match(/^The (\w+) is immediately left of the (\w+)$/))) return (p) => p[mm[1]] === p[mm[2]] - 1;
    if ((mm = c.match(/^The (\w+) is leftmost$/))) return (p) => p[mm[1]] === 0;
    return null;
  };
  return { mc: (c) => { const f = claim(c); return f ? places.length > 0 && places.every(f) : null; } };
});

// analogies
def('analogy: complete the pair', /^"?([A-Za-z][a-z]*(?: [a-z]+)?) is to (___|[a-z]+(?: [a-z]+)?) as (___|[a-z]+(?: [a-z]+)?) is to (___|[a-z]+(?: [a-z]+)?)[.:]?"?$/, (m, it) => {
  const [, a, b, c, d] = m.map((x) => (x || '').toLowerCase());
  const rels = relationsOf(a, b);
  if (!rels.length) return { flags: [['unknown-relation', `no relation holds ${a} : ${b}`]] };
  const flags = rels.length > 1 ? [['two-relations', `${a} : ${b} is ${rels.join(' and ')}`]] : [];
  const fits = (x) => rels.some((r) => (c === '___' ? holds(r, x.toLowerCase(), d) : holds(r, c, x.toLowerCase())));
  if (it.format !== 'multiple_choice') return { flags: flags.concat([['format', 'expected multiple choice']]) };
  return { mc: fits, flags };
});
def('analogy: name the relation', /^"(.+?) is to (.+?) as (.+?) is to ___" — what is the relation between (.+?) and (.+?)\?$/, (m) => {
  const [a, b] = [m[4].toLowerCase(), m[5].toLowerCase()];
  const rels = relationsOf(a, b);
  if (!rels.length) return { flags: [['unknown-relation', `${a} : ${b}`]] };
  const whys = new Map(Object.entries(RELATIONS).map(([k, r]) => [r.why, k]));
  return {
    mc: (c) => {
      if (whys.has(c)) return rels.includes(whys.get(c));
      if (/^There is no relation$/.test(c)) return false;
      return null;
    },
  };
});
def('analogy: which pair matches', /^Which pair has the same relationship as (.+?) and (.+?)\?$/, (m) => {
  const rels = relationsOf(m[1], m[2]);
  if (!rels.length) return { flags: [['unknown-relation', `${m[1]} : ${m[2]}`]] };
  return {
    mc: (c) => {
      const mm = c.match(/^(.+?) and (.+)$/);
      return !!mm && rels.some((r) => holds(r, mm[1], mm[2])) && !(mm[1] === m[1] && mm[2] === m[2]);
    },
  };
});
def('analogy: which pair does not match', /^Which pair does NOT show the same relationship as (.+?) and (.+?)\?$/, (m) => {
  const rels = relationsOf(m[1], m[2]);
  if (!rels.length) return { flags: [['unknown-relation', `${m[1]} : ${m[2]}`]] };
  return {
    mc: (c) => {
      const mm = c.match(/^(.+?) and (.+)$/);
      return !!mm && !rels.some((r) => holds(r, mm[1], mm[2]));
    },
  };
});

// spatial
const COMPASS = ['north', 'east', 'south', 'west'];
def('spatial: fold and punch', /^A square piece of paper is folded in half (once|twice|three times|\d+ times), then (a single hole is|\d+ holes are) punched through all layers\. When unfolded, how many holes are there\?$/, (m) => {
  const folds = { once: 1, twice: 2, 'three times': 3 }[m[1]] || parseInt(m[1], 10);
  const holes = /single/.test(m[2]) ? 1 : parseInt(m[2], 10);
  return { str: String(2 ** folds * holes), mc: (c) => Number(c) === 2 ** folds * holes };
});
def('spatial: letter rotated', /^The letter "(.)" is rotated 180 degrees in the plane\. Which letter shape does it most resemble\?$/, (m) => {
  const ROT = { b: 'q', q: 'b', d: 'p', p: 'd', n: 'u', u: 'n', N: 'N', S: 'S', Z: 'Z', H: 'H', O: 'O', X: 'X', M: 'W', W: 'M', s: 's', z: 'z', o: 'o', x: 'x' };
  const want = ROT[m[1]];
  if (!want) return { flags: [['unknown-letter', m[1]]] };
  return { str: want, mc: (c) => c === want };
});
const cubeN = (k) => { const n = Math.round(Math.cbrt(k)); return n ** 3 === k ? n : null; };
def('spatial: one painted face', /cut into (\d+) equal smaller cubes\. How many small cubes have exactly one painted face\?$/, (m) => {
  const n = cubeN(+m[1]);
  if (!n) return { flags: [['impossible-figure', `${m[1]} is not a cube number`]] };
  const want = 6 * (n - 2) ** 2;
  return { str: String(want), mc: (c) => Number(c) === want };
});
def('spatial: no paint', /cut into (\d+) equal cubes\. How many have no paint at all\?$/, (m) => {
  const n = cubeN(+m[1]);
  if (!n) return { flags: [['impossible-figure', `${m[1]} is not a cube number`]] };
  const want = (n - 2) ** 3;
  return { str: String(want), mc: (c) => Number(c) === want };
});
def('spatial: two painted faces', /^A (\d+)×(\d+)×(\d+) cube built from unit cubes is painted outside, then taken apart\. How many unit cubes have exactly two painted faces\?$/, (m) => {
  if (m[1] !== m[2] || m[2] !== m[3]) return { flags: [['impossible-figure', 'not a cube']] };
  const want = 12 * (+m[1] - 2);
  return { str: String(want), mc: (c) => Number(c) === want };
});
def('spatial: facing after turns', /^You are facing (north|east|south|west)\. You turn (.+)\. Which way are you facing\?$/, (m) => {
  const steps = m[2].split(/, then (?:turn )?/).map((t) => t.replace(/^turn /, '').trim());
  let at = COMPASS.indexOf(m[1]);
  for (const s of steps) {
    if (s === 'right') at += 1;
    else if (s === 'left') at += 3;
    else if (s === 'around' || s === 'about-face' || s === 'all the way around') at += 2;
    else return { flags: [['unparsed-premise', s]] };
  }
  const want = COMPASS[at % 4];
  return { str: want, mc: (c) => c === want };
});
def('spatial: surface cubes', /^A solid (\d+)×\1×\1 block is built from unit cubes\. How many of them touch the outside surface\?$/, (m) => {
  const n = +m[1];
  const want = n ** 3 - (n - 2) ** 3;
  return { str: String(want), mc: (c) => Number(c) === want };
});
def('spatial: clock angle', /^On an analog clock at (\d+):(\d\d), what is the smaller angle between the hands\?$/, (m) => {
  const h = +m[1]; const mi = +m[2];
  const gap = Math.abs(((h % 12) * 30 + mi * 0.5) - mi * 6);
  const want = Math.min(gap, 360 - gap);
  const val = (c) => Number(String(c).replace(/ degrees?$/, ''));
  return { mc: (c) => close(val(c), want), num: want };
});
def('spatial: cube net', /cube net shows (?:four )?faces in a row: (\d), (\d), (\d), (\d)(?:, with (\d) above face (\d) and (\d) below face (\d))?\. When folded, which face is opposite face (\d)\?$/, (m, it) => {
  const row = [m[1], m[2], m[3], m[4]];
  const i = row.indexOf(m[9]);
  if (i < 0) return { flags: [['inconsistent-prompt', `face ${m[9]} is not in the row`]] };
  const want = row[(i + 2) % 4];
  const flags = uniq(row).length !== 4 ? [['inconsistent-prompt', 'a face appears twice']] : [];
  // Every option has to be a face the net actually has.
  const faces = new Set([...row, m[5], m[7]].filter(Boolean));
  for (const c of it.choices || []) if (!faces.has(c)) flags.push(['impossible-choice', `face ${c} is not on this net`]);
  return { str: want, mc: (c) => c === want, flags };
});
def('spatial: plane cuts', /^A block of cheese shaped like a cube is cut with (\d+) straight cuts?, and the pieces are not moved between cuts\. What is the greatest number of pieces it can end up in\?$/, (m) => {
  const k = +m[1];
  return { str: String((k ** 3 + 5 * k + 6) / 6) };
});
def('spatial: cube vertices', /^Which set of numbers describes a cube\?$/, () => ({
  mc: (c) => { const mm = c.match(/^(\d+) vertices, (\d+) edges, (\d+) faces$/); return mm ? +mm[1] === 8 && +mm[2] === 12 && +mm[3] === 6 : null; },
}));
def('spatial: room perimeter', /^A rectangular room is (\d+) metres by (\d+) metres\. Walking once around its walls, how many metres is that\?$/, (m) => ({ str: String(2 * (+m[1] + +m[2])) }));
def('spatial: edges at a corner', /^How many edges meet at each corner of a cube\?$/, () => ({ str: '3' }));

// numeric reasoning
def('numeric: average', /^The average of (\d+) numbers is (\d+)\. (\w+) of them are ([\d, ]+?)(?:,? and (\d+))?\. What is the last number\?$/, (m) => {
  const n = +m[1];
  const known = m[4].split(/,\s*/).filter(Boolean).map(Number).concat(m[5] ? [Number(m[5])] : []);
  const flags = [];
  const said = NUMBER_WORDS[m[3].toLowerCase()] || Number(m[3]);
  if (said !== n - 1 || known.length !== n - 1) flags.push(['inconsistent-prompt', `"${m[3]} of them" for ${known.length} numbers listed`]);
  return { str: String(n * +m[2] - known.reduce((a, b) => a + b, 0)), flags };
});
def('numeric: ratio share', /^\$(\d+) is split in the ratio ([\d:]+)\. What is the largest share\?/, (m) => {
  const parts = m[2].split(':').map(Number);
  const unit = +m[1] / parts.reduce((a, b) => a + b, 0);
  const flags = Number.isInteger(unit) ? [] : [['not-whole', `one part is ${unit}`]];
  if (new Set(parts).size === 1) flags.push(['no-largest', `every share is the same in ${m[2]}`]);
  return { str: String(unit * Math.max(...parts)), typed: [`$${unit * Math.max(...parts)}`], flags };
});
def('numeric: machines', /^(\d+) machines each produce (\d+) units per hour\. How many units do they produce in (\d+) hours\?$/, (m) => ({ str: String(+m[1] * +m[2] * +m[3]) }));
def('numeric: rise then fall', /^A price of \$(\d+) rises (\d+)% and then falls \2%\. What is the final price\?/, (m) => {
  const v = +m[1] * (1 + +m[2] / 100) * (1 - +m[2] / 100);
  const flags = close(v, Math.round(v)) ? [] : [['not-whole', String(v)]];
  return { str: String(Math.round(v * 100) / 100), typed: [`$${Math.round(v * 100) / 100}`], flags };
});
def('numeric: round a product', /^Roughly what is (\d+) × (\d+), to the nearest ten\?$/, (m) => ({ str: String(roundHalfUp((+m[1] * +m[2]) / 10) * 10) }));
def('numeric: times as large', /^How many times as large as (\d+) is (\d+)\?$/, (m) => {
  const q = +m[2] / +m[1];
  return Number.isInteger(q) ? { str: String(q) } : { flags: [['not-whole', String(q)]] };
});
def('numeric: percent change', /^A value went from (\d+) to (\d+)\. By what percent did it (increase|decrease)\? Round to the nearest whole number\.$/, (m) => {
  const before = +m[1]; const after = +m[2];
  const flags = [];
  if ((after > before) !== (m[3] === 'increase') || after === before) flags.push(['wrong-direction', `${before} → ${after} is not an ${m[3]}`]);
  const exact = (Math.abs(after - before) / before) * 100;
  if (close(exact % 1, 0.5)) flags.push(['rounding-tie', `${exact}% is exactly halfway`]);
  return { str: String(roundHalfUp(exact)), typed: [`${roundHalfUp(exact)}%`], flags };
});
def('numeric: unit price', /^A shop sells (\d+) items for \$(\d+) and (\d+) (?:items )?for \$(\d+)\. How much does one item cost\?/, (m) => {
  const p1 = +m[2] / +m[1]; const p2 = +m[4] / +m[3];
  const flags = close(p1, p2) ? [] : [['inconsistent-prompt', `$${p1} and $${p2} each`]];
  return { str: String(p1), typed: [`$${p1}`], flags };
});

// codes
const shiftWord = (w, s) => w.split('').map((ch) => LETTERS[(((LETTERS.indexOf(ch) + s) % 26) + 26) % 26]).join('');
const rev = (w) => w.split('').reverse().join('');
def('cipher: crack and apply', /^In a code, ([A-Z]+) is written ([A-Z]+)\. How is ([A-Z]+) written\?$/, (m) => {
  const [, ex, enc, w] = m;
  const preds = [];
  for (let s = 0; s < 26; s++) {
    if (shiftWord(ex, s) === enc) preds.push([`shift ${s}`, shiftWord(w, s)]);
    if (rev(shiftWord(ex, s)) === enc) preds.push([`shift ${s} and reverse`, rev(shiftWord(w, s))]);
  }
  const values = uniq(preds.map((p) => p[1]));
  if (!values.length) return { flags: [['no-rule-fits', `${ex} → ${enc}`]] };
  const flags = values.length > 1 ? [['two-continuations', preds.map(([r, v]) => `${r} → ${v}`).join('; ')]] : [];
  return { str: values[0], typed: [values[0].toLowerCase()], flags };
});
def('cipher: letters as numbers', /^If A=1, B=2, and so on, write ([A-Z]+) as numbers separated by hyphens\.$/, (m) => ({
  str: m[1].split('').map((c) => LETTERS.indexOf(c) + 1).join('-'),
}));
def('cipher: decode a growing shift', /^Encode a word by shifting each letter forward by (\d+) places?, and then (\d+) more for each letter after the first, wrapping from Z back to A\. ([A-Z]+) is the encoding of which word\? Give it in capitals\.$/, (m) => {
  const start = +m[1]; const step = +m[2];
  return { str: m[3].split('').map((ch, i) => shiftWord(ch, -(start + i * step))).join('') };
});
def('cipher: decode a shift', /^Each letter is replaced by the letter (\d+) places? later in the alphabet, wrapping from Z back to A\. What word does ([A-Z]+) stand for\? Give it in capitals\.$/, (m) => ({ str: shiftWord(m[2], -(+m[1])) }));
def('cipher: undo by going forward', /^A code shifts every letter (\d+) places? later in the alphabet, wrapping from Z back to A\. To decode it by shifting letters forward instead of back, how many places forward must each letter move\?$/, (m) => ({ str: String(26 - +m[1]) }));

// working memory
const digitsOf = (t) => t.trim().split(/\s+/).map(Number);
def('memory: reverse digits', /^Hold these digits in mind, then enter them in reverse order, no spaces:\n([\d ]+)$/, (m) => ({ str: digitsOf(m[1]).reverse().join('') }));
def('memory: add two positions', /^For the sequence below, add the (\d+)(st|nd|rd|th) digit and the (\d+)(st|nd|rd|th) digit:\n([\d ]+)$/, (m) => {
  const ds = digitsOf(m[5]);
  return { str: String(ds[+m[1] - 1] + ds[+m[3] - 1]) };
});
def('memory: even digits', /^From the sequence below, enter only the even digits, in order, no spaces:\n([\d ]+)$/, (m) => {
  const ev = digitsOf(m[1]).filter((d) => d % 2 === 0);
  if (!ev.length) return { flags: [['unanswerable', 'there are no even digits to enter']] };
  return { str: ev.join('') };
});
def('memory: sort largest first', /^Remember this order: ([\d, ]+)\. Write it back, largest first(?:, separated by commas)?\.$/, (m) => {
  const xs = m[1].split(/,\s*/).map(Number).sort((a, b) => b - a);
  return { str: xs.join(', '), typed: [xs.join(', '), xs.join(' ')] };
});
def('memory: removed letter', /^Look at the word ([A-Z]+)\. Now look at ([A-Z]+)\. Which letter was removed\?$/, (m) => {
  const [, full, cut] = m;
  const options = uniq(full.split('').map((_, i) => (full.slice(0, i) + full.slice(i + 1) === cut ? full[i] : null)).filter(Boolean));
  if (options.length !== 1) return { flags: [['not-unique', `removed letter could be ${options.join(', ') || 'none'}`]] };
  return { str: options[0], typed: [options[0].toLowerCase()] };
});
def('memory: total', /^What is the total of ([\d +]+)\?$/, (m) => ({ str: String(m[1].split('+').map(Number).reduce((a, b) => a + b, 0)) }));

// ── text checks ─────────────────────────────────────────────────────────────
const TEXT_CHECKS = [
  ['debris', /undefined|NaN|Infinity|\bnull\b|\$\{|\[object|\{\{/],
  ['doubled-word', /\b([A-Za-z]{2,}) \1\b/i],
  ['article', /\ba (?!one\b|uni|use|usu|eu)[aeiouAEIOU]\w*/],
  ['article', /\ban (?!hour|honest|h?onou?r|[aeiouAEIOU8])[a-zA-Z]\w*/],
  ['agreement', /(?<![\d.])1 [a-z]+s (make|are|were|have)\b|(?<![\d.])1 [a-z]+ (make|are|were|have)\b/],
  ['spacing', / {2,}|\s[,;:](?=\s)/],
  // "Every violinists is": a plural group name dropped into a singular frame.
  ['agreement', /\b[Ee]very (?!\w+ss\b)\w+s (is|are|sits|can)\b/],
  // A sentence spliced into the middle of another: "the rule is that The other three".
  ['capitals', /\b(that|because|so|and) (The|It|They|Every|All|Each|There)\b/],
  // A clause said twice: "The other three go together because the other three ...".
  ['repeated-phrase', /\bthe other (three|ones) go together because the other \1\b/i],
];
const ORDINAL = /\b(\d+)(st|nd|rd|th)\b/g;
const ordinalOk = (n, suf) => {
  const k = n % 100;
  if (k >= 11 && k <= 13) return suf === 'th';
  return suf === ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
};
/** Facts a premise may not contradict. */
const FACT_CHECKS = [
  [/\bcube has (\d+) faces/i, (m) => +m[1] === 6, 'a cube has 6 faces'],
  [/\bcube has (\d+) (?:corners|vertices)/i, (m) => +m[1] === 8, 'a cube has 8 vertices'],
  [/\bcube has (\d+) edges/i, (m) => +m[1] === 12, 'a cube has 12 edges'],
];

function textFlags(text) {
  const out = [];
  for (const [code, re] of TEXT_CHECKS) {
    const m = String(text).match(re);
    if (m) out.push([code, m[0].trim()]);
  }
  for (const m of String(text).matchAll(ORDINAL)) if (!ordinalOk(+m[1], m[2])) out.push(['ordinal', m[0]]);
  for (const [re, ok, fact] of FACT_CHECKS) {
    const m = String(text).match(re);
    if (m && !ok(m)) out.push(['false-fact', `"${m[0]}" — ${fact}`]);
  }
  return out;
}

// ── reporting ───────────────────────────────────────────────────────────────
const report = new Map();
function fam(key) {
  if (!report.has(key)) report.set(key, { rendered: 0, flags: new Map(), samples: [] });
  return report.get(key);
}
function flag(f, code, detail, it) {
  if (!f.flags.has(code)) f.flags.set(code, { n: 0, ex: [] });
  const e = f.flags.get(code);
  e.n++;
  if (e.ex.length < EXAMPLES) e.ex.push({ detail, prompt: it.prompt, choices: it.choices, answer: it.answer, accepts: it.accepts });
}

function checkItem(f, raw) {
  const it = normalizeItem(raw);
  f.rendered++;
  if (SHOW && f.samples.length < SHOW) f.samples.push(it);
  const seen = new Set();
  const once = (code, detail) => {
    const k = `${code}:${detail}`;
    if (seen.has(k)) return;
    seen.add(k);
    flag(f, code, detail, it);
  };

  // What the learner reads is held to every rule; a distractor only to debris,
  // grammar and the facts.
  for (const t of [it.prompt, it.rationale]) for (const [code, hit] of textFlags(t)) once(code, hit);
  for (const [code, hit] of textFlags(raw.answer)) once(`key:${code}`, hit);
  for (const t of it.accepts || []) for (const [code, hit] of textFlags(t)) if (code === 'debris') once('accept:debris', hit);
  for (const c of it.rawChoices || []) for (const [code, hit] of textFlags(c)) once(`choice:${code}`, hit);
  for (const t of [it.prompt.replace(/^["“]/, ''), it.rationale]) {
    if (/^[a-z]/.test(t)) once('capitals', `starts lower-case: "${t.slice(0, 40)}"`);
  }
  if (/\n[a-z]/.test(it.prompt) && !/\n(what|which)/.test(it.prompt)) once('capitals', 'a line starts lower-case');
  if (!it.prompt) once('empty', 'empty prompt');
  if (!it.answer.trim()) once('empty', 'empty answer');
  if (raw.x && !raw.accepts) once('accepts-dropped', `x: ${[].concat(raw.x).join(' / ')} never reaches grading`);

  if (it.format === 'multiple_choice') {
    if (it.rawChoices.length !== it.choices.length) once('duplicate-choices', it.rawChoices.join(' | '));
    const norm = it.choices.map((c) => gradeNorm(c));
    if (uniq(norm).length !== norm.length) once('equivalent-choices', it.choices.join(' | '));
    const asNum = it.choices.map((c) => (/^-?\d+(\.\d+)?( degrees)?$/.test(c) ? parseFloat(c) : null)).filter((x) => x != null);
    if (uniq(asNum).length !== asNum.length) once('equivalent-choices', it.choices.join(' | '));
    if (!it.choices.includes(it.answer)) once('key-not-a-choice', it.answer);
    if (it.choices.length < 3) once('too-few-choices', `${it.choices.length} choices`);
    if (!grade(it, it.answer).correct) once('key-fails-grading', it.answer);
    for (const c of it.choices) if (c !== it.answer && grade(it, c).correct) once('distractor-grades-correct', c);
  } else {
    if (!grade(it, it.answer).correct) once('key-fails-grading', it.answer);
    for (const a of it.accepts || []) if (!grade(it, a).correct) once('accept-fails-grading', a);
  }

  const hit = V.find((v) => v.re.test(it.prompt));
  if (!hit) { once('no-verifier', 'no verifier recognises this prompt'); return null; }
  let v;
  try { v = hit.fn(it.prompt.match(hit.re), it); } catch (err) { once('verifier-error', err.message); return hit.name; }
  for (const [code, detail] of v.flags || []) once(code, detail);

  if (v.mc) {
    if (it.format !== 'multiple_choice') once('format', 'expected multiple choice');
    else {
      const verdicts = it.choices.map((c) => [c, v.mc(c)]);
      const unknown = verdicts.filter(([, r]) => r == null).map(([c]) => c);
      if (unknown.length) once('unjudged-choice', unknown.join(' | '));
      const right = verdicts.filter(([, r]) => r === true).map(([c]) => c);
      if (right.length !== 1) once('keys', `${right.length} choices are correct: ${right.join(' | ') || 'none'}`);
      else if (right[0] !== it.answer) once('wrong-key', `keyed "${it.answer}", correct "${right[0]}"`);
    }
  } else if ('str' in v) {
    if (it.format === 'multiple_choice') {
      if (it.answer !== v.str) once('wrong-key', `keyed "${it.answer}", correct "${v.str}"`);
    } else if (!grade(it, v.str).correct) once('wrong-key', `keyed "${it.answer}", correct "${v.str}"`);
  }
  if (v.set) {
    for (const s of v.set) if (!grade(it, s).correct) once('right-answer-fails-grading', s);
    if (!v.set.some((s) => gradeNorm(s) === gradeNorm(it.answer))) once('wrong-key', `keyed "${it.answer}", right answers ${v.set.join(' / ')}`);
  }
  if (it.format !== 'multiple_choice') {
    for (const s of v.typed || []) if (!grade(it, s).correct) once('right-answer-fails-grading', s);
    for (const s of v.wrong || []) if (grade(it, s).correct) once('wrong-answer-grades-correct', s);
  }
  // A rationale that names the answer has to name the right one.
  const said = it.rationale.match(/(?:[Tt]he next (?:term|letter) is|so the next is|the next letter is|[Tt]he missing cell is) (-?\w+)/);
  if (said && 'str' in v && gradeNorm(said[1]) !== gradeNorm(v.str) && gradeNorm(said[1]) !== gradeNorm(it.answer)) {
    once('rationale-contradicts', `rationale says ${said[1]}`);
  }
  return hit.name;
}

// ── sources ─────────────────────────────────────────────────────────────────
function auditFamilies() {
  const { FAMILIES } = load('iq-families');
  for (const [skill, list] of Object.entries(FAMILIES)) {
    if (ONLY && skill !== ONLY) continue;
    list.forEach((entry, i) => {
      const f = fam(`iq-families/${skill}[${i}]`);
      for (const s of slotFills(entry, `${skill}[${i}]`)) {
        let raw;
        try { raw = renderFamily(entry, s); } catch (err) { flag(f, 'throws', err.message, { prompt: JSON.stringify(s) }); continue; }
        checkItem(f, raw);
      }
    });
  }
}

function auditPools() {
  const { POOLS } = load('iq-items');
  for (const [skill, list] of Object.entries(POOLS)) {
    if (ONLY && skill !== ONLY) continue;
    list.forEach((entry, i) => checkItem(fam(`iq-items POOLS/${skill}[${i}]`), entryRaw(entry)));
  }
}

const POOL_SKILLS = new Set(['verbal_analogy', 'logic_deduction', 'spatial_reason']);
function auditGenerators() {
  const { GENERATORS } = load('iq-items');
  const SHAPES = load('iq-shapes');
  for (const skill of Object.keys(GENERATORS)) {
    if (ONLY && skill !== ONLY) continue;
    const sources = [];
    // The pool skills' base generator is the pool and its families, audited
    // above in full; the others are computed, and are audited here. From the
    // thirteenth call on, `withShapes` serves the base generator only.
    if (!POOL_SKILLS.has(skill)) {
      const base = GENERATORS[skill];
      if (SHAPES[skill]) for (let i = 0; i < 12; i++) base(makeRng(`burn:${skill}:${i}`), 5, {});
      sources.push(['iq-items', base]);
    }
    if (SHAPES[skill]) sources.push(['iq-shapes', SHAPES[skill]]);
    for (const [source, gen] of sources) {
      for (let d = 1; d <= 10; d++) {
        for (let i = 0; i < SEEDS; i++) {
          const raw = gen(makeRng(`iq-audit:${source}:${skill}:${d}:${i}`), d, { avoid: new Set() });
          const probe = normalizeItem(raw);
          const hit = V.find((vv) => vv.re.test(probe.prompt));
          checkItem(fam(`${source}/${skill}: ${hit ? hit.name : 'unrecognised'}`), raw);
        }
      }
    }
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
const started = Date.now();
auditFamilies();
auditPools();
auditGenerators();

let renderings = 0;
let problems = 0;
const bySource = new Map();
for (const [key, f] of report) {
  renderings += f.rendered;
  const src = key.split(/[/[]/)[0];
  const row = bySource.get(src) || { families: 0, flagged: 0, rendered: 0 };
  row.families++;
  row.rendered += f.rendered;
  if (f.flags.size) row.flagged++;
  bySource.set(src, row);
  for (const e of f.flags.values()) problems += e.n;
}

if (SHOW) {
  for (const [key, f] of report) {
    console.log(`\n${key}  (${f.rendered} rendered)`);
    for (const it of f.samples) {
      console.log(`  Q: ${it.prompt.replace(/\n/g, ' / ')}`);
      if (it.choices) console.log(`     [${it.choices.join(' | ')}]`);
      console.log(`     key: ${it.answer}${it.accepts ? `  (also: ${it.accepts.join(' / ')})` : ''}`);
      console.log(`     why: ${it.rationale}`);
    }
  }
}

console.log('\nIQ template audit');
console.log(`content: ${path.relative(process.cwd(), CONTENT) || '.'}`);
console.log(`${report.size} families, ${renderings} renderings, ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
console.log('source'.padEnd(20) + 'families  flagged  renderings');
for (const [src, row] of bySource) {
  console.log(`${src.padEnd(20)}${String(row.families).padStart(8)}${String(row.flagged).padStart(9)}${String(row.rendered).padStart(12)}`);
}

const flagged = [...report].filter(([, f]) => f.flags.size);
for (const [key, f] of flagged) {
  console.log(`\n✗ ${key}  (${f.rendered} rendered)`);
  for (const [code, e] of f.flags) {
    console.log(`    ${code} ×${e.n}`);
    for (const ex of e.ex) {
      console.log(`      - ${ex.detail}`);
      console.log(`        Q: ${String(ex.prompt).replace(/\n/g, ' / ')}`);
      if (ex.choices) console.log(`        [${ex.choices.join(' | ')}]  key: ${ex.answer}`);
      else console.log(`        key: ${ex.answer}${ex.accepts ? `  (also: ${ex.accepts.join(' / ')})` : ''}`);
    }
  }
}

if (problems) {
  console.log(`\n${problems} flags in ${flagged.length} families.`);
  process.exit(1);
}
console.log('\nClean: every rendering passed.');
