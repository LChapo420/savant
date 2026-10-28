/**
 * Render every built-in Math and Reading question template and check what comes out.
 *
 *   node scripts/math-reading-template-audit.js               audit; exits 1 on any flag
 *   node scripts/math-reading-template-audit.js --skill=fractions   one skill only
 *   node scripts/math-reading-template-audit.js --examples=5  more examples per problem
 *   node scripts/math-reading-template-audit.js --show=2      also print renderings per family
 *   node scripts/math-reading-template-audit.js --content=DIR read the content files from
 *        DIR instead of content/ (used to audit a backup, to see what a fix changed)
 *
 * The bank's math items say their answers are "computed, not typed", and they are
 * — but a computed answer is only as right as the question it is computed for. A
 * prompt that prints the wrong number, a key computed from a variable the prompt
 * never shows, a distractor that happens to equal the key: the generator is
 * internally consistent and the learner is told something false. So this does not
 * trust the generator's own arithmetic. It reads the *rendered prompt*, pulls the
 * numbers back out of it, works the question again by its own route, and compares
 * that with the key. A prompt no verifier recognises is itself a flag, so a new
 * template cannot slip in unchecked.
 *
 * Covered:
 *   math   content/math-items.js (the base generator of every skill) and
 *          content/math-shapes.js (the alternative tasks), 10 difficulties × N seeds
 *   phonics content/phonics-families.js, every slot combination
 *   reading content/passages.js and content/passages-2.js (every authored question)
 *          and content/passage-families.js (seeded renderings of every family)
 *
 * Checked on every item:
 *   - template debris: undefined, null, NaN, Infinity, "${", float noise (0.1499999)
 *   - notation: "+ -3", "1x", "+ 0x", "x^1"; plurals ("1 apples", "1 degrees")
 *   - impossible quantities: a negative or fractional answer to "how many"
 *   - multiple choice: key among the choices, no duplicate choices, at least three,
 *     and no rendering with fewer choices than its own family usually has
 *   - the keyed answer re-derived independently (math), or against the rule the
 *     family states (phonics), or against the passage (reading)
 *   - rounding: a keyed answer that is a rounded value needs a prompt that says so
 *   - grading: the key, and every accepted spelling, grade as correct
 *   - reading: quotes in a prompt or rationale are in the passage; numbers a prompt
 *     states are in the passage; grammar (doubled words, a/an, spacing, sentence
 *     capitals); a generated passage's subject can live at its site; a vocabulary
 *     question has exactly one option carrying the passage's sense
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
const { grade, numericValue } = require('../services/grading');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = arg('skill', null);
const EXAMPLES = Number(arg('examples', 2));
const SHOW = Number(arg('show', 0));
const CONTENT = path.resolve(arg('content', path.join(__dirname, '..', 'content')));
const load = (name) => require(path.join(CONTENT, name));

/** Seeds per difficulty for each math generator. Ten difficulties, two sources. */
const MATH_SEEDS = Number(arg('seeds', 150));
const PASSAGE_SAMPLES = 150;

const { makeRng } = load('rng');

// ── a small expression evaluator ────────────────────────────────────────────
/**
 * Arithmetic and polynomial expressions as the prompts print them: "−4 + 3 × 2",
 * "2x^2 − 3x + 1", "(3x)/4 + 2", "√144", "5(3 + 4)^2". Implicit multiplication,
 * unary minus binding looser than a power (−x^2 is −(x^2)), and named variables.
 * Written out rather than handed to eval, so a prompt is read the way a learner
 * reads it and anything unexpected fails loudly instead of meaning something else.
 */
function parseExpr(text) {
  const src = String(text)
    .replace(/[−–]/g, '-').replace(/×|·/g, '*').replace(/÷/g, '/').replace(/²/g, '^2')
    .replace(/\s+/g, '');
  const toks = [];
  for (let i = 0; i < src.length;) {
    const rest = src.slice(i);
    const num = rest.match(/^(\d+\.?\d*|\.\d+)/);
    if (num) { toks.push({ t: 'n', v: Number(num[1]) }); i += num[1].length; continue; }
    if (/^[a-z]/.test(rest)) { toks.push({ t: 'v', v: rest[0] }); i++; continue; }
    if ('+-*/^()√'.includes(rest[0])) { toks.push({ t: rest[0] }); i++; continue; }
    throw new Error(`unexpected "${rest[0]}" in ${text}`);
  }
  let k = 0;
  const peek = () => toks[k];
  const startsPrimary = (tk) => tk && (tk.t === 'n' || tk.t === 'v' || tk.t === '(' || tk.t === '√');
  function expr() {
    let node = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = toks[k++].t; const right = term();
      const left = node; node = op === '+' ? (env) => left(env) + right(env) : (env) => left(env) - right(env);
    }
    return node;
  }
  function term() {
    let node = unary();
    for (;;) {
      if (peek() && (peek().t === '*' || peek().t === '/')) {
        const op = toks[k++].t; const right = unary();
        const left = node; node = op === '*' ? (env) => left(env) * right(env) : (env) => left(env) / right(env);
      } else if (startsPrimary(peek())) {
        const right = power(); const left = node; node = (env) => left(env) * right(env);
      } else return node;
    }
  }
  function unary() {
    if (peek() && peek().t === '-') { k++; const inner = unary(); return (env) => -inner(env); }
    if (peek() && peek().t === '+') { k++; return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (peek() && peek().t === '^') { k++; const ex = unary(); return (env) => Math.pow(base(env), ex(env)); }
    return base;
  }
  function primary() {
    const tk = toks[k++];
    if (!tk) throw new Error(`unexpected end in ${text}`);
    if (tk.t === 'n') return () => tk.v;
    if (tk.t === 'v') return (env) => (tk.v in env ? env[tk.v] : NaN);
    if (tk.t === '√') { const inner = power(); return (env) => Math.sqrt(inner(env)); }
    if (tk.t === '(') {
      const inner = expr();
      if (!peek() || peek().t !== ')') throw new Error(`unbalanced ( in ${text}`);
      k++;
      return inner;
    }
    throw new Error(`unexpected ${tk.t} in ${text}`);
  }
  const fn = expr();
  if (k !== toks.length) throw new Error(`trailing tokens in ${text}`);
  return fn;
}
const evalAt = (text, env = {}) => parseExpr(text)(env);
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 1e-9);

/** Solve L = R for x when both sides are linear in x. */
function solveLinear(left, right) {
  const f = (x) => evalAt(left, { x }) - evalAt(right, { x });
  const m = f(1) - f(0);
  if (!close(f(2) - f(1), m) || m === 0) return NaN;
  return -f(0) / m;
}

/** Coefficients a, b, c of a quadratic in x, read off by evaluation. */
function quadCoefs(text) {
  const f = (x) => evalAt(text, { x });
  const c = f(0);
  const a = (f(1) + f(-1) - 2 * c) / 2;
  const b = (f(1) - f(-1)) / 2;
  return { a, b, c };
}

/** Two expressions equal as polynomials in x: compared at a spread of points. */
function sameFunction(e1, e2, avoid = []) {
  const xs = [-3.7, -1.3, 0.6, 2.1, 4.9].filter((x) => !avoid.some((p) => Math.abs(p - x) < 1e-6));
  try {
    const f = parseExpr(e1); const g = parseExpr(e2);
    return xs.every((x) => close(f({ x }), g({ x }), 1e-7));
  } catch (err) { return false; }
}

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const fracStr = (n, d) => {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`;
};
const round2 = (x) => Math.round(x * 100) / 100;
/** "3 + 2i", "4 - i", "6i", "-2 + 0i" → [re, im]. */
function complexOf(text) {
  const s = String(text).replace(/[−–]/g, '-').replace(/\s+/g, '');
  let m = s.match(/^(-?\d+)([+-])(\d*)i$/);
  if (m) return [Number(m[1]), (m[2] === '-' ? -1 : 1) * (m[3] === '' ? 1 : Number(m[3]))];
  m = s.match(/^(-?\d*)i$/);
  if (m) return [0, m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1])];
  m = s.match(/^(-?\d+)$/);
  if (m) return [Number(m[1]), 0];
  return null;
}
const numOf = (s) => {
  const v = numericValue(String(s));
  if (v !== null) return v;
  try { return evalAt(String(s)); } catch (err) { return NaN; }
};

// ── math verifiers ──────────────────────────────────────────────────────────
/**
 * Each verifier recognises one template by its rendered prompt and returns what
 * the answer must be, worked out from the numbers in that prompt:
 *   { num, places? }   a number (places: the prompt asked for this rounding)
 *   { str }            an exact string
 *   { lowest: true }   with num: a fraction answer must be in lowest terms
 *   { mc: test }       exactly one choice passes test(choice), and it is the key
 * `name` is the family a flag is reported under.
 */
const N = '(-?\\d+(?:\\.\\d+)?)';
const I = '(-?\\d+)';
const rx = (s) => new RegExp(s.replace(/\$N/g, N).replace(/\$I/g, I));

const V = [];
const def = (skills, name, pattern, fn) => V.push({ skills: [].concat(skills), name, re: rx(pattern), fn });

// arithmetic printed as "<expression> =" — evaluated as written.
const ARITH = ['add_sub', 'mul_div', 'integers', 'order_ops', 'exponents', 'decimals'];
def(ARITH, 'expression =', '^([-−\\d\\s+×÷()^.√]+?) =$', (m) => ({ num: evalAt(m[1]) }));

// add_sub
def('add_sub', 'missing addend', '^___ \\+ $I = $I$', (m) => ({ num: +m[2] - +m[1] }));
def('add_sub', 'error in a sum', '^Someone adds $I \\+ $I and writes $I\\. By how much are they wrong\\?$', (m) => ({ num: Math.abs(+m[3] - (+m[1] + +m[2])) }));
def('add_sub', 'which is larger', '^Which is larger: (.+), (.+), or (.+)\\?$', (m) => {
  const vals = [m[1], m[2], m[3]].map((e) => evalAt(e));
  const best = Math.max(...vals);
  return { mc: (c) => close(evalAt(c), best), unique: vals.filter((v) => v === best).length === 1 };
});
def('add_sub', 'round the sum', '^Work out $I \\+ $I, then round the sum to the nearest ten\\.$', (m) => ({ num: Math.round((+m[1] + +m[2]) / 10) * 10 }));
def('add_sub', 'boxes word problem', '^There are $I boxes .+ with $I (\\w+) in each\\. $I \\3 are taken out\\. How many \\3 are left\\?$', (m) => ({ num: +m[1] * +m[2] - +m[4], count: true }));

// mul_div
def('mul_div', 'missing factor', '^$I × ___ = $I$', (m) => ({ num: +m[2] / +m[1], count: true }));
def('mul_div', 'fence posts', '^A garden has $I rows of fence posts with $I posts in each row, and the posts in a row are one metre apart\\. How many metres long is one row of fence\\?$', (m) => ({ num: +m[2] - 1, count: true }));
def('mul_div', 'mixed-number division', '^$I ÷ $I = ___\\. Write the answer as a whole number and a fraction, like 3 1/4\\.$', (m) => {
  const n = +m[1]; const b = +m[2];
  return { str: `${Math.floor(n / b)} ${fracStr(n % b, b)}` };
});
def('mul_div', 'ticket cost', '^One ticket costs \\$$I\\. How much do $I tickets cost\\?$', (m) => ({ num: +m[1] * +m[2] }));
def('mul_div', 'square area', '^A square has sides of $I cm\\. What is its area in square centimetres\\?$', (m) => ({ num: +m[1] * +m[1] }));

// fractions
def('fractions', 'fraction operation', '^$I/$I ([+\\-×÷]) $I/$I =\\s+\\(answer in lowest terms, as a fraction like 3/4\\)$', (m) => ({ num: evalAt(`(${m[1]}/${m[2]})${m[3]}(${m[4]}/${m[5]})`), lowest: true }));
def('fractions', 'fraction sum', '^$I/$I \\+ $I/$I = \\? \\(answer in lowest terms, as a fraction like 3/4\\)$', (m) => ({ num: +m[1] / +m[2] + +m[3] / +m[4], lowest: true }));
def('fractions', 'lowest terms', '^Write $I/$I in lowest terms(?:, as a fraction)?\\.$', (m) => ({ num: +m[1] / +m[2], lowest: true }));
def('fractions', 'improper fraction', '^Write $I $I/$I as an improper fraction\\.$', (m) => ({ num: +m[1] + +m[2] / +m[3], lowest: true, mixedReduced: gcd(+m[2], +m[3]) === 1 }));
def('fractions', 'missing numerator', '^$I/$I \\+ ___/$I = (\\S+)\\. Give the missing numerator\\.$', (m) => ({ num: (numOf(m[4]) - +m[1] / +m[2]) * +m[3], count: true }));
def('fractions', 'larger fraction', '^Which is larger: $I/$I or $I/$I\\?$', (m) => {
  const a = +m[1] / +m[2]; const b = +m[3] / +m[4];
  const key = a === b ? 'They are the same' : a > b ? `${m[1]}/${m[2]}` : `${m[3]}/${m[4]}`;
  return { str: key };
});

// decimals
def('decimals', 'hundredths digit', '^In (\\d+)\\.(\\d)(\\d), which digit is in the hundredths place\\?$', (m) => ({ num: +m[3] }));
def('decimals', 'fraction to decimal', '^Write $I/$I as a decimal\\.$', (m) => ({ num: +m[1] / +m[2] }));
def('decimals', 'error in a decimal sum', '^$N \\+ $N is written as $N\\. By how much is it wrong\\?$', (m) => ({ num: round2(Math.abs(+m[3] - (+m[1] + +m[2]))) }));
def('decimals', 'order decimals', '^Put these in order, largest first: $N, $N, $N$', (m) => {
  const vals = [m[1], m[2], m[3]];
  const sorted = [...vals].sort((x, y) => Number(y) - Number(x));
  return { str: sorted.join(', '), unique: new Set(vals.map(Number)).size === 3 };
});

// percents
def('percents', 'percent of', '^What is $I% of $I\\?(?: Give the number only\\.)?$', (m) => ({ num: +m[1] * +m[2] / 100 }));
def('percents', 'what percent', '^$N is what percent of $I\\?\\s+\\(enter the number only\\)$', (m) => ({ num: +m[1] / +m[2] * 100 }));
def('percents', 'what percent (shape)', '^What percent of $I is $N\\? Give the number only\\.$', (m) => ({ num: +m[2] / +m[1] * 100 }));
def('percents', 'reverse percent', '^$I% of a number is $N\\. What is the number\\?$', (m) => ({ num: +m[2] / (+m[1] / 100) }));
def('percents', 'percent change', '^A price (rises|falls) from \\$$I to \\$$N\\. By what percent did it change\\?\\s+\\(enter the number only\\)$', (m) => ({
  num: Math.abs(+m[3] - +m[2]) / +m[2] * 100, direction: (m[1] === 'rises') === (+m[3] > +m[2]) }));
def('percents', 'percent change (shape)', '^A price goes from \\$$I to \\$$N\\. By what percent did it (rise|fall)\\? Give the number only\\.$', (m) => ({
  num: Math.abs(+m[2] - +m[1]) / +m[1] * 100, direction: (m[3] === 'rise') === (+m[2] > +m[1]) }));
def('percents', 'successive discount', '^A price of \\$$I is reduced by 20%, then the new price is reduced by 10%\\.', (m) => {
  const total = 1 - 0.8 * 0.9;
  return { str: total < 0.3 ? 'less than 30%' : total > 0.3 ? 'more than 30%' : 'exactly 30%' };
});
def('percents', 'sale price', '^A \\$$I item is $I% off\\. What is the sale price, in dollars\\?$', (m) => ({ num: +m[1] * (1 - +m[2] / 100) }));

// word problems
def('word_problems', 'distance', '^A train travels at $I miles per hour for $I hours\\. How many miles does it cover\\?$', (m) => ({ num: +m[1] * +m[2] }));
def('word_problems', 'change from a purchase', '^Notebooks cost \\$$N each\\. You buy $I and pay with \\$$N\\. How much change do you get\\?', (m) => ({ num: round2(+m[3] - +m[1] * +m[2]), money: [m[1], m[3]], nonNegative: true }));
def('word_problems', 'left over from teams', '^$I students are put into teams of $I\\. How many students are left over', (m) => ({ num: +m[1] % +m[2], count: true }));
def('word_problems', 'mixture ratio', '^A mix holds sand and gravel in the ratio $I:$I\\. In $I pounds of the mix, how many pounds are sand\\?$', (m) => ({ num: +m[3] * +m[1] / (+m[1] + +m[2]) }));
def('word_problems', 'take away', '^A \\w+ has $I (\\w+)\\. If $I are \\w+, how many \\2 are left\\?$', (m) => ({ num: +m[1] - +m[3], count: true }));
def('word_problems', 'packing', '^A \\w+ has $I (\\w+) and puts them $I to a (\\w+)\\. How many (\\w+) are needed to hold all of them\\?$', (m) => ({ num: Math.ceil(+m[1] / +m[3]), count: true }));
def('word_problems', 'two steps', '^A \\w+ starts with $I (\\w+) and gets $I more\\. Then $I (is|are) given away\\. How many \\2 are there now\\?$', (m) => ({
  num: +m[1] + +m[3] - +m[4], count: true, agree: (+m[4] === 1) === (m[5] === 'is') }));
def('word_problems', 'which operation', '^A \\w+ has $I (\\w+) and gets $I more\\. Which calculation gives how many there are now\\?$', (m) => ({ str: `${m[1]} + ${m[3]}` }));
def('word_problems', 'add more', '^A \\w+ has $I (\\w+) and gets $I more\\. How many \\2 are there now\\?$', (m) => ({ num: +m[1] + +m[3], count: true }));

// integers
def('integers', 'number line', '^A counter on a number line starts at $I and moves $I to the right\\. Where does it end\\?$', (m) => ({ num: +m[1] + +m[2] }));
def('integers', 'freezer', '^A freezer is at $I°C\\. It gets $I degrees? colder\\. What is the new temperature, in °C\\?$', (m) => ({ num: +m[1] - +m[2] }));

// order of operations
def('order_ops', 'where the brackets go', '^Where do brackets go in $I \\+ $I × $I to make it equal $I\\?$', (m) => {
  const target = +m[4];
  const plain = evalAt(`${m[1]} + ${m[2]} × ${m[3]}`);
  return { mc: (c) => {
    if (c === 'No brackets are needed') return plain === target;
    if (c === 'No placement of brackets can do it') return ![plain, (+m[1] + +m[2]) * +m[3]].includes(target);
    return close(evalAt(c), target) && c.includes('(');
  } };
});
def('order_ops', 'value of an expression', '^Which is the value of (.+)\\?$', (m) => ({ num: evalAt(m[1]) }));
def('order_ops', 'undo the grouping', '^\\($I \\+ $I\\) × $I = $I\\. What is $I \\+ $I\\?$', (m) => ({ num: +m[4] / +m[3], consistent: (+m[1] + +m[2]) * +m[3] === +m[4] }));

// ratios
def('ratios', 'proportion', '^Solve the proportion: $I/$I = $I/x$', (m) => ({ num: +m[2] * +m[3] / +m[1] }));
def('ratios', 'simplest ratio', '^Write the ratio $I:$I in its simplest form, as a:b\\.$', (m) => {
  const g = gcd(+m[1], +m[2]);
  return { str: `${+m[1] / g}:${+m[2] / g}` };
});
def('ratios', 'unit rate', '^One pack holds $I cards\\. How many cards do $I packs hold\\?$', (m) => ({ num: +m[1] * +m[2] }));
def('ratios', 'part of a group', '^In a bag of $I marbles, $I are blue\\. At the same rate, how many blue marbles are there in a group of $I\\?$', (m) => ({ num: +m[2] * +m[3] / +m[1], count: true }));
def('ratios', 'scale a recipe', '^A recipe for $I servings uses $I g of flour\\. How many grams of flour are needed for $I servings\\?$', (m) => ({ num: +m[2] * +m[3] / +m[1] }));
def('ratios', 'second quantity', '^The ratio is $I:$I\\. If the first quantity is $I, what is the second\\?$', (m) => ({ num: +m[2] * +m[3] / +m[1] }));

// exponents
def('exponents', 'exponent laws', '^Simplify: x\\^$I (·|÷) x\\^$I$', (m) => {
  const k = m[2] === '·' ? +m[1] + +m[3] : +m[1] - +m[3];
  return { str: k === 1 ? 'x' : `x^${k}` };
});
def('exponents', 'negative exponent', '^$I\\^-$I =\\s+\\(as a fraction\\)$', (m) => ({ num: Math.pow(+m[1], -m[2]), lowest: true }));
def('exponents', 'square root as a power', '^$I\\^\\(1/2\\) =$', (m) => ({ num: Math.sqrt(+m[1]) }));
def('exponents', 'square root', '^What is the positive square root of $I\\?$', (m) => ({ num: Math.sqrt(+m[1]) }));
def('exponents', 'square root (whole)', '^√$I = ___\\. Give a whole number\\.$', (m) => ({ num: Math.sqrt(+m[1]), whole: true }));
def('exponents', 'power of two', '^2\\^$I × 2\\^$I = ___\\. Give the answer as a power of 2\\.$', (m) => ({ str: `2^${+m[1] + +m[2]}` }));

// linear equations
def(['linear_eq'], 'solve for x', '^Solve for x:\\s+(.+) = (.+)$', (m) => ({ num: solveLinear(m[1], m[2]) }));
def('linear_eq', 'what is x', '^If (.+) = $I, what is x\\?$', (m) => ({ num: solveLinear(m[1], m[2]) }));
def('linear_eq', 'is it a solution', '^Is x = $I a solution of (.+) = $I\\?$', (m) => ({ str: close(evalAt(m[2], { x: +m[1] }), +m[3]) ? 'Yes' : 'No' }));
def('linear_eq', 'tickets and fees', '^Tickets cost \\$$I each\\. A group pays \\$$I, including \\$$I in fees\\. How many tickets did the group buy\\?$', (m) => ({ num: (+m[2] - +m[3]) / +m[1], count: true }));
def('linear_eq', 'balance', '^A balance has $I identical blocks and a $I g weight on one pan, and a $I g weight on the other\\. It balances\\. How many grams does one block weigh\\?$', (m) => ({ num: (+m[3] - +m[2]) / +m[1] }));

// inequalities
def('inequalities', 'solve an inequality', '^Solve:\\s+(.+) > $I$', (m) => {
  const f = (x) => evalAt(m[1], { x }) - +m[2];
  const slope = f(1) - f(0);
  const x0 = -f(0) / slope;
  return { str: `x ${slope > 0 ? '>' : '<'} ${x0}` };
});
def('inequalities', 'does it satisfy', '^Does x = $I satisfy\\s+(\\d+)x < $I\\?$', (m) => ({ str: +m[2] * +m[1] < +m[3] ? 'Yes' : 'No' }));
def('inequalities', 'count whole numbers', '^How many whole numbers satisfy\\s+(\\d+)x < $I\\?$', (m) => {
  let n = 0; for (let x = 0; +m[1] * x < +m[2]; x++) n++;
  return { num: n };
});
def('inequalities', 'smallest whole number', '^Solve for x:\\s+(\\d+)x > $I\\. What is the smallest whole number x\\?$', (m) => {
  let x = 0; while (!(+m[1] * x > +m[2])) x++;
  return { num: x };
});
def('inequalities', 'largest whole number', '^Solve for x, giving the largest whole number that works:\\s+(\\d+)x ≤ $I$', (m) => ({ num: Math.floor(+m[2] / +m[1]) }));

// slope and lines
const slopeOf = (x1, y1, x2, y2) => (y2 - y1) / (x2 - x1);
const PT = '\\($I, $I\\)';
def('slope_lines', 'slope through two points', `^What is the slope of the line through ${PT} and ${PT}\\?$`, (m) => ({ num: slopeOf(+m[1], +m[2], +m[3], +m[4]) }));
def('slope_lines', 'slope from standard form', '^What is the slope of the line (.+) = $I\\?\\s+\\(a fraction like -2/3, or an integer\\)$', (m) => {
  const f = (x, y) => evalAt(m[1], { x, y });
  const A = f(1, 0) - f(0, 0); const B = f(0, 1) - f(0, 0);
  return { num: -A / B, lowest: true };
});
def('slope_lines', 'evaluate a line', '^For the line y = (.+), what is y when x = $I\\?$', (m) => ({ num: evalAt(m[1], { x: +m[2] }) }));
def('slope_lines', 'parallel slope', '^A line is parallel to y = (.+)\\. What is its slope\\?$', (m) => ({ num: evalAt(m[1], { x: 1 }) - evalAt(m[1], { x: 0 }) }));
def('slope_lines', 'sign of a slope', `^A line passes through ${PT} and ${PT}\\. Is its slope positive, negative, or zero\\?$`, (m) => {
  const s = slopeOf(+m[1], +m[2], +m[3], +m[4]);
  return { str: s > 0 ? 'Positive' : s < 0 ? 'Negative' : 'Zero' };
});
def('slope_lines', 'y-intercept', `^A line passes through ${PT} and ${PT}\\. Write its equation in the form y = mx \\+ b, and give b\\.`, (m) => {
  const s = slopeOf(+m[1], +m[2], +m[3], +m[4]);
  return { num: +m[2] - s * +m[1], lowest: true };
});
def('slope_lines', 'perpendicular slopes', '^Line A has slope (\\S+) and line B has slope (\\S+)\\. What is the relationship\\?$', (m) => {
  const a = numOf(m[1]); const b = numOf(m[2]);
  return { str: close(a * b, -1) ? 'They are perpendicular' : close(a, b) ? 'They are parallel' : 'Nothing can be said' };
});
def('slope_lines', 'slope from the intercept', '^A line crosses the y-axis at \\(0, $I\\)\\. Another point on it is \\($I, $I\\)\\. What is the slope\\?', (m) => ({ num: slopeOf(0, +m[1], +m[2], +m[3]), lowest: true }));
def('slope_lines', 'slope through two points (shape)', `^A line passes through ${PT} and ${PT}\\. What is its slope\\?`, (m) => ({ num: slopeOf(+m[1], +m[2], +m[3], +m[4]), lowest: true }));

// systems
const lin2 = (text) => {
  const f = (x, y) => evalAt(text, { x, y });
  return [f(1, 0) - f(0, 0), f(0, 1) - f(0, 0), f(0, 0)];
};
def('systems', 'solve a system', '^Solve the system and enter (x|y):\\n\\s*(.+) = $I\\n\\s*(.+) = $I$', (m) => {
  const [a, b, k1] = lin2(m[2]); const [c, e, k2] = lin2(m[4]);
  const det = a * e - b * c;
  const x = ((+m[3] - k1) * e - b * (+m[5] - k2)) / det;
  const y = (a * (+m[5] - k2) - c * (+m[3] - k1)) / det;
  return { num: m[1] === 'x' ? x : y };
});
def('systems', 'check a solution', '^Is x = $I, y = $I a solution of the pair\\s+(.+) = $I\\s+and\\s+(.+) = $I\\?$', (m) => {
  const ok = close(evalAt(m[3], { x: +m[1], y: +m[2] }), +m[4]) && close(evalAt(m[5], { x: +m[1], y: +m[2] }), +m[6]);
  return { str: ok ? 'Yes' : 'No' };
});
def('systems', 'substitute for y', '^If y = $I in\\s+(.+) = $I, what is x\\?$', (m) => ({ num: solveLinear(m[2].replace(/y/g, `(${m[1]})`), m[3]) }));
def('systems', 'pens and tickets', '^Tickets cost \\$$I each\\. A group buys $I tickets and $I pens and pays \\$$I in all\\. How much does one pen cost, in dollars\\?$', (m) => ({ num: (+m[4] - +m[1] * +m[2]) / +m[3] }));
def('systems', 'add the equations', '^Solve the pair:\\s+x \\+ y = $I\\s+and\\s+x − y = $I\\. What is x\\?$', (m) => ({ num: (+m[1] + +m[2]) / 2 }));

// quadratics
const roots = (text) => {
  const { a, b, c } = quadCoefs(text);
  const disc = b * b - 4 * a * c;
  return [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
};
def('quadratics', 'factor a trinomial', '^Factor:\\s+(.+)$', (m) => ({ mc: (c) => sameFunction(c, m[1]) }));
def('quadratics', 'larger solution', '^Solve (.+) = 0 and enter the larger solution\\.$', (m) => {
  const r = roots(m[1]);
  return { num: Math.max(...r), unique: !close(r[0], r[1]) };
});
def('quadratics', 'sum of roots', '^The quadratic (.+) = 0 has two roots\\. What is their sum\\?$', (m) => { const r = roots(m[1]); return { num: r[0] + r[1] }; });
def('quadratics', 'which root is larger', '^For (.+) = 0, which root is larger\\?$', (m) => {
  const r = roots(m[1]);
  return { num: Math.max(...r), unique: !close(r[0], r[1]) };
});
def('quadratics', 'vertex', '^For y = (.+), what is the x-coordinate of the lowest point\\?$', (m) => { const { a, b } = quadCoefs(m[1]); return { num: -b / (2 * a), lowestPoint: a > 0 }; });
def('quadratics', 'larger root', '^Solve:\\s+(.+) = 0\\. Give the larger root\\.$', (m) => {
  const r = roots(m[1]);
  return { num: Math.max(...r), unique: !close(r[0], r[1]) };
});

// geometry
def('geometry_area', 'rectangle', '^A rectangle is $I by $I\\. What is its (perimeter|area)\\?$', (m) => ({ num: m[3] === 'area' ? +m[1] * +m[2] : 2 * (+m[1] + +m[2]) }));
def('geometry_area', 'rectangle perimeter (choice)', '^A rectangle is $I by $I\\. Which is its perimeter\\?$', (m) => ({ num: 2 * (+m[1] + +m[2]) }));
def('geometry_area', 'triangle', '^A triangle has (?:a )?base (?:of )?$I(?: cm)? and (?:a )?height (?:of )?$I(?: cm)?\\. What is its area\\?$', (m) => ({ num: +m[1] * +m[2] / 2 }));
def('geometry_area', 'circle', '^A circle has radius $I\\. What is its (area|circumference)\\?\\s+\\(use π ≈ 3\\.14159, round to 2 decimals\\)$', (m) => ({ num: m[2] === 'area' ? Math.PI * m[1] * m[1] : 2 * Math.PI * m[1], places: 2 }));
def('geometry_area', 'circumference from diameter', '^A circle has a diameter of $I cm\\. What is its circumference\\? Use 3\\.14 for pi, and round to two decimals\\.$', (m) => ({ num: 3.14 * m[1], places: 2 }));
def('geometry_area', 'box volume', '^A (?:rectangular )?box is $I by $I by $I(?: cm)?\\. What is its volume(?: in cubic centimetres)?\\?$', (m) => ({ num: m[1] * m[2] * m[3] }));
def('geometry_area', 'cylinder', '^A cylinder has radius $I and height $I\\. What is its volume\\?\\s+\\(π ≈ 3\\.14159, 2 decimals\\)$', (m) => ({ num: Math.PI * m[1] * m[1] * m[2], places: 2 }));
def('geometry_area', 'square minus circle', '^A circle of radius $I is cut out of a square of side $I\\. What area is left\\?\\s+\\(π ≈ 3\\.14159, 2 decimals\\)$', (m) => ({ num: m[2] * m[2] - Math.PI * m[1] * m[1], places: 2, fits: 2 * m[1] <= +m[2] }));
def('geometry_area', 'missing width', '^A rectangle has a perimeter of $I cm and is $I cm long\\. How wide is it\\?$', (m) => ({ num: +m[1] / 2 - +m[2] }));

// polynomials
def('polynomials', 'add polynomials', '^Simplify: \\((.+)\\) \\+ \\((.+)\\)$', (m) => ({ mc: (c) => sameFunction(c, `(${m[1]}) + (${m[2]})`) }));
def('polynomials', 'expand', '^Expand: \\((.+)\\)\\((.+)\\)$', (m) => ({ mc: (c) => sameFunction(c, `(${m[1]})(${m[2]})`) }));
def('polynomials', 'degree of a product', '^What is the degree of the product of a degree-$I polynomial and a degree-$I polynomial\\?$', (m) => ({ num: +m[1] + +m[2] }));
def('polynomials', 'x coefficient', '^\\(x \\+ $I\\)\\(x \\+ $I\\) = x\\^2 \\+ ___x \\+ ___\\. What is the coefficient of x\\?$', (m) => ({ num: +m[1] + +m[2] }));
def('polynomials', 'constant term', '^\\(x \\+ $I\\)\\(x \\+ $I\\) = x\\^2 \\+ $Ix \\+ ___\\. What is the constant term\\?$', (m) => ({ num: +m[1] * +m[2], consistent: +m[3] === +m[1] + +m[2] }));
def('polynomials', 'evaluate', '^What is the value of (.+) when x = $I\\?$', (m) => ({ num: evalAt(m[1], { x: +m[2] }) }));
def('polynomials', 'difference of squares', '^Expand \\(x \\+ $I\\)² − \\(x − $I\\)²\\. What is the coefficient of x\\?$', (m) => {
  const f = (x) => (x + +m[1]) ** 2 - (x - +m[2]) ** 2;
  return { num: f(1) - f(0), linear: close(f(2) - f(1), f(1) - f(0)) };
});
def('polynomials', 'missing middle coefficient', '^\\(x \\+ $I\\)\\(x \\+ $I\\) = x\\^2 \\+ ___x \\+ $I\\. What number goes in the blank\\?$', (m) => ({ num: +m[1] + +m[2], consistent: +m[3] === +m[1] * +m[2] }));

// functions
def('functions', 'evaluate f', '^If f\\(x\\) = (.+), what is f\\($I\\)\\?$', (m) => ({ num: evalAt(m[1], { x: +m[2] }) }));
def('functions', 'composition', '^If f\\(x\\) = (.+) and g\\(x\\) = (.+), what is f\\(g\\($I\\)\\)\\?$', (m) => ({ num: evalAt(m[1], { x: evalAt(m[2], { x: +m[3] }) }) }));
def('functions', 'input for an output', '^f\\(x\\) = (.+)\\. Which value of x gives f\\(x\\) = $I\\?$', (m) => ({ num: solveLinear(m[1], m[2]) }));
def('functions', 'domain', '^f\\(x\\) = 1/\\((.+)\\)\\. What is the one value of x that is not in the domain\\?$', (m) => ({ num: solveLinear(m[1], '0') }));
def('functions', 'table', '^A linear function has f\\(1\\) = $I, f\\(2\\) = $I, f\\(3\\) = $I\\. What is f\\(4\\)\\?$', (m) => ({ num: +m[3] + (+m[3] - +m[2]), consistent: +m[3] - +m[2] === +m[2] - +m[1] }));
def('functions', 'evaluate f (shape)', '^f\\(x\\) = (.+)\\. What is f\\($I\\)\\?$', (m) => ({ num: evalAt(m[1], { x: +m[2] }) }));

// logs
def('logs', 'evaluate a log', '^log$I\\($I\\) =$', (m) => ({ num: Math.log(+m[2]) / Math.log(+m[1]), whole: true }));
def('logs', 'exponential equation', '^Solve for x:\\s+$I\\^x = $I$', (m) => ({ num: Math.log(+m[2]) / Math.log(+m[1]), whole: true }));
def('logs', 'ln of e', '^ln\\(e\\^$I\\) =$', (m) => ({ num: +m[1] }));
const LOG_RULES = { 'log(ab)': 'log(a) + log(b)', 'log(a/b)': 'log(a) - log(b)' };
def('logs', 'log rules', '^Which expression equals (.+)\\?$', (m) => {
  const q = m[1];
  if (LOG_RULES[q]) return { str: LOG_RULES[q] };
  let k = q.match(/^log\(a\^(\d+)\)$/);
  if (k) return { str: `${k[1]}·log(a)` };
  k = q.match(/^log(\d+)\((\d+)\), evaluated$/);
  if (k) return { str: String(Math.log(+k[2]) / Math.log(+k[1])) };
  return { unknown: true };
});
def('logs', 'log base (words)', '^What is log base $I of $I\\?$', (m) => ({ num: Math.log(+m[2]) / Math.log(+m[1]), whole: true }));
def('logs', 'solve for the base', '^Solve for x:\\s+log base x of $I = $I$', (m) => ({ num: Math.pow(+m[1], 1 / +m[2]), whole: true }));
def('logs', 'product rule', '^Use log\\(ab\\) = log a \\+ log b: what is log base $I of \\($I × $I\\)\\? Give a whole number\\.$', (m) => ({ num: Math.log(+m[2] * +m[3]) / Math.log(+m[1]), whole: true }));
def('logs', 'true or false', '^Is this true\\?\\s+log base $I of $I = $I$', (m) => ({ str: close(Math.log(+m[2]) / Math.log(+m[1]), +m[3], 1e-9) ? 'Yes' : 'No' }));
def('logs', 'exponential form', '^If log base $I of y = $I, what is y\\?$', (m) => ({ num: Math.pow(+m[1], +m[2]) }));

// sequences
def('sequences', 'arithmetic sum', '^An arithmetic sequence starts at $I and (increases|decreases) by $I each term\\. What is the sum of the first $I terms\\?$', (m) => {
  const a1 = +m[1]; const d = (m[2] === 'decreases' ? -1 : 1) * +m[3]; const n = +m[4];
  return { num: n * (2 * a1 + (n - 1) * d) / 2 };
});
def('sequences', 'arithmetic term', '^An arithmetic sequence starts at $I with common difference $I\\. What is term $I\\?$', (m) => ({ num: +m[1] + (+m[3] - 1) * +m[2] }));
def('sequences', 'geometric term', '^A geometric sequence starts at $I with common ratio $I\\. What is term $I\\?$', (m) => ({ num: +m[1] * Math.pow(+m[2], +m[3] - 1) }));
const seqOf = (text) => text.split(/,\s*/).filter((t) => /^-?\d+$/.test(t.trim())).map(Number);
def('sequences', 'which rule', '^Which rule fits (.+)\\?$', (m) => {
  const s = seqOf(m[1]); const d = s[1] - s[0];
  const arith = s.every((v, i) => i === 0 || v - s[i - 1] === d);
  return { str: arith ? `Each term is ${d} more than the one before` : '?' };
});
def('sequences', 'nth term', '^In the sequence (.+), … what is the $Ith term\\?$', (m) => {
  const s = seqOf(m[1]); const d = s[1] - s[0];
  return { num: s[0] + (+m[2] - 1) * d, consistent: s.every((v, i) => i === 0 || v - s[i - 1] === d) };
});
def('sequences', 'next term', '^What is the next term\\?\\n(.+), ___$', (m) => {
  const s = seqOf(m[1]);
  const d = s[1] - s[0]; const r = s[1] / s[0];
  if (s.every((v, i) => i === 0 || v - s[i - 1] === d)) return { num: s[s.length - 1] + d };
  if (s.every((v, i) => i === 0 || close(v / s[i - 1], r))) return { num: s[s.length - 1] * r };
  return { unknown: true };
});
def('sequences', 'odd one out', '^In (.+), which position breaks the pattern\\? Give the position number\\.$', (m) => {
  const s = seqOf(m[1]);
  // A position breaks the pattern when the other four are one arithmetic sequence
  // that it is not part of. More than one such position means no single answer.
  const fits = [];
  for (let bad = 0; bad < s.length; bad++) {
    const idx = s.map((_, i) => i).filter((i) => i !== bad);
    const d = (s[idx[1]] - s[idx[0]]) / (idx[1] - idx[0]);
    const ok = idx.every((i) => close(s[i], s[idx[0]] + (i - idx[0]) * d));
    if (ok && !close(s[bad], s[idx[0]] + (bad - idx[0]) * d)) fits.push(bad + 1);
  }
  return fits.length === 1 ? { num: fits[0] } : { str: `ambiguous: positions ${fits.join(', ') || 'none'}` };
});

// rational expressions
def('rational_expr', 'simplify a rational expression', '^Simplify:\\s+\\((.+)\\) / \\((.+)\\)$', (m) => {
  const pole = solveLinear(m[2], '0');
  return { mc: (c) => sameFunction(c, `(${m[1]})/(${m[2]})`, [pole]) };
});
def('rational_expr', 'not defined', '^For which values is\\s+1 / \\(x² - $I\\)\\s+not defined\\?$', (m) => {
  const a = Math.sqrt(+m[1]);
  return { str: `x = ${a} or x = -${a}` };
});
def('rational_expr', 'numerator of a product', '^Multiply \\($I/$I\\) × \\($I/$I\\) and write the result in lowest terms\\. What is its numerator\\?$', (m) => ({ str: fracStr(+m[1] * +m[3], +m[2] * +m[4]).split('/')[0] }));
def('rational_expr', 'not equal', '^Which is NOT equal to $I/$I\\?$', (m) => ({ mc: (c) => !close(numOf(c), +m[1] / +m[2]) }));
def('rational_expr', 'substitute', '^If x = $I, what is the value of \\((.+)\\)/$I\\?', (m) => ({ num: evalAt(m[2], { x: +m[1] }) / +m[3], lowest: true }));
def('rational_expr', 'zero denominator', '^At what value of x can \\((.+)\\)/\\((.+)\\) not be worked out\\?', (m) => ({ num: solveLinear(m[2], '0'), lowest: true }));
def('rational_expr', 'divide fractions', '^Simplify \\($I/$I\\) ÷ \\($I/$I\\)\\. Give an integer or a fraction in lowest terms\\.$', (m) => ({ num: (+m[1] / +m[2]) / (+m[3] / +m[4]), lowest: true }));

// complex numbers
const cxEq = (s, re, im) => { const c = complexOf(s); return !!c && c[0] === re && c[1] === im; };
def('complex_nums', 'add complex numbers', '^Simplify: \\((.+)\\) \\+ \\((.+)\\)$', (m) => {
  const a = complexOf(m[1]); const b = complexOf(m[2]);
  return { mc: (c) => cxEq(c, a[0] + b[0], a[1] + b[1]) };
});
def('complex_nums', 'multiply complex numbers', '^Multiply: \\((.+)\\)\\((.+)\\)$', (m) => {
  const [a, b] = complexOf(m[1]); const [c, e] = complexOf(m[2]);
  return { mc: (x) => cxEq(x, a * c - b * e, a * e + b * c) };
});
def('complex_nums', 'power of i', '^i\\^$I =$', (m) => ({ str: ['1', 'i', '-1', '-i'][+m[1] % 4] }));
def('complex_nums', 'conjugate', '^What is the conjugate of (.+)\\? Answer in the form a - bi\\.$', (m) => {
  const [a, b] = complexOf(m[1]);
  return { cx: [a, -b] };
});
def('complex_nums', 'which is real', '^Which of these is a real number\\?$', () => ({ mc: (c) => { const z = complexOf(c); return !!z && z[1] === 0; } }));
def('complex_nums', 'complex product', '^Multiply \\((.+)\\)\\((.+)\\)\\. Give the answer in the form "x \\+ yi"\\.$', (m) => {
  const [a, b] = complexOf(m[1]); const [c, e] = complexOf(m[2]);
  return { cx: [a * c - b * e, a * e + b * c] };
});
def('complex_nums', 'complex sum or difference', '^(?:Add|Subtract) \\((.+)\\) (\\+|−) \\((.+)\\)\\. Give the answer in the form "x \\+ yi"\\.$', (m) => {
  const a = complexOf(m[1]); const b = complexOf(m[3]); const sg = m[2] === '+' ? 1 : -1;
  return { cx: [a[0] + sg * b[0], a[1] + sg * b[1]] };
});

// trigonometry
const TRIG = { sin: Math.sin, cos: Math.cos, tan: Math.tan };
const rad = (deg) => deg * Math.PI / 180;
def('trig_basics', 'hypotenuse (triple)', '^A right triangle has legs $I and $I\\. How long is the hypotenuse\\?$', (m) => ({ num: Math.hypot(+m[1], +m[2]), whole: true }));
def('trig_basics', 'special angle', '^What is (sin|cos|tan)\\($I°\\)\\?$', (m) => ({ mc: (c) => close(numOf(c), TRIG[m[1]](rad(+m[2])), 1e-9) }));
def('trig_basics', 'trig ratio', '^In a right triangle, the side opposite angle A is $I, the adjacent side is $I, and the hypotenuse is $I\\. What is (sin|cos|tan)\\(A\\)\\?', (m) => {
  const o = +m[1]; const a = +m[2]; const h = +m[3];
  const v = { sin: o / h, cos: a / h, tan: o / a }[m[4]];
  return { num: v, lowest: true, consistent: o * o + a * a === h * h };
});
def('trig_basics', 'which ratio is sine', '^In a right triangle the side opposite angle A is $I and the hypotenuse is $I\\. Which ratio gives the sine of angle A\\?$', (m) => ({ str: `${m[1]}/${m[2]}`, consistent: +m[2] > +m[1] }));
def('trig_basics', 'special angle (words)', '^What is the (sin|cos|tan) of $I°\\?$', (m) => ({ mc: (c) => close(numOf(c), TRIG[m[1]](rad(+m[2])), 1e-9) }));
def('trig_basics', 'hypotenuse (rounded)', '^A right triangle has legs of $I and $I cm\\. How long is the hypotenuse\\? Round to two decimals\\.$', (m) => ({ num: Math.hypot(+m[1], +m[2]), places: 2 }));
def('trig_basics', 'degrees to radians', '^Convert $I° to radians\\. Give a decimal, rounded to two places\\.$', (m) => ({ num: rad(+m[1]), places: 2 }));
def('trig_basics', 'angle from tangent', '^An angle has a tangent of about $N\\. Which is it most likely to be\\?$', (m) => {
  const best = [30, 45, 60].reduce((x, y) => (Math.abs(Math.tan(rad(y)) - m[1]) < Math.abs(Math.tan(rad(x)) - m[1]) ? y : x));
  return { str: `${best}°` };
});
def('trig_basics', 'sine (rounded)', '^A right triangle has a hypotenuse of $I and the side opposite angle A is $I\\. What is the sine of angle A\\? Round to two decimals\\.$', (m) => ({ num: +m[2] / +m[1], places: 2, consistent: +m[1] > +m[2] }));

// data
def('act_data', 'unit rate', '^$I identical parts cost \\$$I\\. At the same rate, what do $I parts cost\\?', (m) => ({ num: +m[2] / +m[1] * +m[3] }));
def('act_data', 'table maximum', '^Units sold by year\\n(.+)\\n\\nIn which year were the most units sold\\?$', (m) => {
  const rows = [...m[1].matchAll(/(\d{4}): (\d+)/g)].map((r) => [r[1], +r[2]]);
  const max = Math.max(...rows.map((r) => r[1]));
  return { str: rows.find((r) => r[1] === max)[0], unique: rows.filter((r) => r[1] === max).length === 1 };
});
def('act_data', 'average', '^What is the average of (.+)\\?\\s+\\(2 decimals if needed\\)$', (m) => {
  const xs = m[1].split(/,\s*/).map(Number);
  return { num: xs.reduce((a, b) => a + b, 0) / xs.length, places: 2 };
});

// ── grade-fit skills (content/math-grade-items.js, 2026-10-24) ──────────────
// Worked again from the printed prompt, by routes of their own: counting the
// symbols, brute-force group orders and permutation powers, determinants by
// cofactor expansion, a five-point stencil for derivatives, Simpson's rule for
// integrals, power iteration for a Markov chain, inclusion-exclusion for
// derangements, and fixed tables written here for the facts (sides of shapes,
// coin values, unit sizes, fundamental groups).
const intsIn = (s) => String(s).split(/,\s*/).map((t) => Number(t.replace(/,/g, '')));
const noCommas = (s) => Number(String(s).replace(/,/g, ''));
const sortNum = (xs) => [...xs].sort((a, b) => a - b);
const SHAPE_SIDES = { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, circle: 0 };
const SOLIDS = new Set(['cube', 'sphere', 'cone', 'cylinder', 'pyramid', 'prism']);
const FLATS = new Set(['circle', 'square', 'triangle', 'rectangle', 'hexagon', 'oval']);
const PLACE_INDEX = { ones: 0, tens: 1, hundreds: 2, thousands: 3, 'ten thousands': 4, 'hundred thousands': 5 };
const COIN_CENTS = { quarter: 25, quarters: 25, dime: 10, dimes: 10, nickel: 5, nickels: 5, penny: 1, pennies: 1 };
const PER = { 'centimetres/metres': 100, 'inches/feet': 12, 'minutes/hours': 60, 'hours/days': 24, 'grams/kilograms': 1000, 'days/weeks': 7, 'months/years': 12 };
const factI = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const binom = (n, k) => { let c = 0; for (let mask = 0; mask < (1 << n); mask++) { let b = 0; for (let i = 0; i < n; i++) if (mask & (1 << i)) b++; if (b === k) c++; } return c; };
function detOf(M) {
  if (M.length === 1) return M[0][0];
  return M[0].reduce((s, a, j) => s + (j % 2 ? -1 : 1) * a * detOf(M.slice(1).map((r) => r.filter((_, k) => k !== j))), 0);
}
function rankOf(M) {
  const A = M.map((r) => r.slice());
  let rank = 0;
  for (let col = 0; col < A[0].length && rank < A.length; col++) {
    const piv = A.findIndex((r, i) => i >= rank && Math.abs(r[col]) > 1e-9);
    if (piv < 0) continue;
    [A[rank], A[piv]] = [A[piv], A[rank]];
    for (let i = 0; i < A.length; i++) if (i !== rank) { const f = A[i][col] / A[rank][col]; A[i] = A[i].map((v, k) => v - f * A[rank][k]); }
    rank++;
  }
  return rank;
}
const stencil = (f, a) => (f(a - 2) - 8 * f(a - 1) + 8 * f(a + 1) - f(a + 2)) / 12; // exact for degree <= 4
function partitions(n) { const p = [1]; for (let i = 1; i <= n; i++) p[i] = 0; for (let k = 1; k <= n; k++) for (let i = k; i <= n; i++) p[i] += p[i - k]; return p[n]; }
function factorize(n) { const out = {}; for (let p = 2; n > 1; p++) while (n % p === 0) { out[p] = (out[p] || 0) + 1; n /= p; } return out; }
const isPrime = (n) => { if (n < 2) return false; for (let k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; };
const TRUTH = { 'p → q': (p, q) => !p || q, 'p ∧ q': (p, q) => p && q, 'p ∨ q': (p, q) => p || q, '¬p ∨ q': (p, q) => !p || q, 'p ↔ q': (p, q) => p === q, '¬(p ∧ q)': (p, q) => !(p && q) };
function graphical(deg) {
  const d = sortNum(deg).reverse(); const n = d.length;
  if (d.reduce((a, b) => a + b, 0) % 2) return false;
  for (let k = 1; k <= n; k++) {
    const lhs = d.slice(0, k).reduce((a, b) => a + b, 0);
    const rhs = k * (k - 1) + d.slice(k).reduce((a, b) => a + Math.min(b, k), 0);
    if (lhs > rhs) return false;
  }
  return true;
}
const ENTIRE_FNS = new Set(['e^z', 'sin z', 'cos z + z^2', 'z^3 + 2z']);
const NOT_ENTIRE = new Set(['the complex conjugate of z', '|z|^2', 'Re(z)', 'Im(z)', '|z|']);
const PI1_OF = { 'the circle S^1': 'ℤ', 'the 2-sphere S^2': 'the trivial group', 'the torus': 'ℤ × ℤ', 'the real projective plane': 'ℤ/2ℤ', 'the figure-eight space': 'the free group on two generators' };
const fracQ = '\\?\\s+\\(as a fraction in lowest terms\\)$';

// ── school tiers (content/math-grade-items.js SCHOOL, standards check 2026-10-24) ──
// The prompts a school grade is served in place of the shared generators'.
// Worked again from the printed numbers; the arithmetic ones ("12 + 7 =",
// "3 × 70 =", "10^4 =") are the shared 'expression =' verifier above.
def(['add_sub', 'word_problems'], 'story: gets more', '^(\\w+) has $I (\\w+)\\. \\1 gets $I more\\. How many \\3 does \\1 have now\\?$', (m) => ({ num: +m[2] + +m[4], count: true }));
def(['add_sub', 'word_problems'], 'story: gives away', '^(\\w+) has $I (\\w+) and gives $I away\\. How many \\3 are left\\?$', (m) => ({ num: +m[2] - +m[4], count: true }));
def(['add_sub', 'word_problems'], 'story: compare', '^(\\w+) has $I (\\w+)\\. (\\w+) has $I \\3\\. How many more \\3 does \\1 have than \\4\\?$', (m) => ({ num: +m[2] - +m[5], count: true, consistent: m[1] !== m[4] }));
def(['add_sub', 'word_problems'], 'story: two steps', '^(\\w+) had $I (\\w+), got $I more and then gave away $I\\. How many \\3 does \\1 have now\\?$', (m) => ({ num: +m[2] + +m[4] - +m[5], count: true }));
def('add_sub', 'estimate by rounding', '^Round $I and $I to the nearest (hundred|thousand), then add\\. What is the estimate\\?$', (m) => {
  const u = m[3] === 'hundred' ? 100 : 1000; const r = (x) => Math.round(x / u) * u;
  return { num: r(+m[1]) + r(+m[2]), consistent: +m[1] % u !== u / 2 && +m[2] % u !== u / 2 };
});
def('mul_div', 'array', '^An array has $I rows with $I (stars|dots|squares|triangles|hearts) in each row\\. How many \\3 are there in all\\?$', (m) => ({ num: +m[1] * +m[2], count: true }));
def('mul_div', 'skip count', '^Skip count by $Is: $I, $I, $I, ___\\. What comes next\\?$', (m) => ({ num: +m[4] + +m[1], consistent: +m[3] - +m[2] === +m[1] && +m[4] - +m[3] === +m[1] && +m[2] % +m[1] === 0 }));
def('mul_div', 'which is even', '^Which of these numbers is even\\?$', () => ({ mc: (c) => +c % 2 === 0 }));
def(['mul_div', 'word_problems'], 'equal groups', '^There are $I bags with $I (\\w+) in each bag\\. How many \\3 are there in all\\?$', (m) => ({ num: +m[1] * +m[2], count: true }));
def(['mul_div', 'word_problems'], 'equal shares', '^(\\w+) shares $I (\\w+) equally among $I friends\\. How many \\3 does each friend get\\?$', (m) => ({ num: +m[2] / +m[4], count: true, whole: true }));
def('mul_div', 'remainder', '^What is the remainder when $I is divided by $I\\?$', (m) => ({ num: +m[1] % +m[2], count: true }));
def('mul_div', 'factor', '^Which of these numbers is a factor of $I\\?$', (m) => ({ mc: (c) => +m[1] % +c === 0 }));
def('mul_div', 'times as many', '^(\\w+) has $I (\\w+)\\. (\\w+) has $I times as many\\. How many \\3 does \\4 have\\?$', (m) => ({ num: +m[2] * +m[5], count: true, consistent: m[1] !== m[4] }));
def('fractions', 'unit fraction', '^An? (\\w+) is cut into $I equal pieces\\. What fraction of the \\1 is one piece\\?$', (m) => ({ str: `1/${+m[2]}` }));
def('fractions', 'shaded part', '^A bar is split into $I equal parts and $I of them (is|are) shaded\\. What fraction of the bar is shaded\\?$', (m) => ({ num: +m[2] / +m[1], lowest: true, agree: (+m[2] === 1) === (m[3] === 'is'), consistent: +m[2] < +m[1] }));
def('fractions', 'point on a number line', '^A number line from 0 to 1 is split into $I equal parts\\. What fraction names the point $I parts? from 0\\?$', (m) => ({ num: +m[2] / +m[1], lowest: true, agree: (+m[2] === 1) === / part from/.test(m[0]) }));
def('fractions', 'equivalent fraction', '^$I/$I = ___/$I\\. What number goes in the blank\\?$', (m) => ({ num: +m[1] * +m[3] / +m[2], count: true, whole: true }));
def('fractions', 'pieces in a whole', '^How many 1/$I pieces make one whole\\?$', (m) => ({ num: +m[1], count: true }));
def('fractions', 'whole times a fraction', '^$I × $I/$I =\\s+\\(answer in lowest terms, as a fraction like 3/4\\)$', (m) => ({ num: +m[1] * +m[2] / +m[3], lowest: true }));
def('fractions', 'unit fraction divided by a whole', '^1/$I ÷ $I =\\s+\\(answer in lowest terms, as a fraction like 3/4\\)$', (m) => ({ num: 1 / (+m[1] * +m[2]), lowest: true }));
def('fractions', 'whole divided by a unit fraction', '^$I ÷ 1/$I =$', (m) => ({ num: +m[1] * +m[2] }));
def('decimals', 'decimal as hundredths', '^Write $N as a fraction with a denominator of 100\\.$', (m) => ({ str: `${Math.round(+m[1] * 100)}/100` }));
def('decimals', 'larger decimal', '^Which is larger: $N or $N\\?$', (m) => ({ num: Math.max(+m[1], +m[2]), consistent: +m[1] !== +m[2] }));
def('decimals', 'round to tenths', '^Round $N to the nearest tenth\\.$', (m) => { const h = Math.round(+m[1] * 100); return { num: Math.round(h / 10) / 10, consistent: h % 10 !== 5 }; });
def('geometry_area', 'unit squares', '^A rectangle is made of $I rows of $I unit squares\\. What is its area, in square units\\?$', (m) => ({ num: +m[1] * +m[2], count: true }));
def('geometry_area', 'length from area', '^A rectangle has an area of $I square metres and is $I metres wide\\. How long is it, in metres\\?$', (m) => ({ num: +m[1] / +m[2], whole: true }));
def('geometry_area', 'angles add', '^Two angles of $I° and $I° fit together with no gap and no overlap\\. What is the measure of the angle they make together, in degrees\\?$', (m) => ({ num: +m[1] + +m[2] }));
def('geometry_area', 'part of an angle', '^A $I° angle is split into two angles\\. One of them is $I°\\. What is the other one, in degrees\\?$', (m) => ({ num: +m[1] - +m[2], consistent: +m[2] < +m[1] }));
def('geometry_area', 'degrees in a turn', '^How many degrees does a (quarter|half|three-quarter|full) turn sweep through\\?$', (m) => ({ num: { quarter: 90, half: 180, 'three-quarter': 270, full: 360 }[m[1]] }));
def('geometry_area', 'unit cubes', '^A box is packed with unit cubes: $I cubes long, $I cubes wide and $I cubes high\\. How many unit cubes fill it\\?$', (m) => ({ num: m[1] * m[2] * m[3], count: true }));
def('geometry_area', 'two boxes', '^One box is $I by $I by $I and another is $I by $I by $I\\. What is their total volume\\?$', (m) => ({ num: m[1] * m[2] * m[3] + m[4] * m[5] * m[6] }));
def('geometry_area', 'height from volume', '^A rectangular box has a volume of $I cubic centimetres\\. Its base is $I cm by $I cm\\. How tall is it, in centimetres\\?$', (m) => ({ num: m[1] / (m[2] * m[3]), whole: true }));
def('geometry_area', 'parallelogram', '^A parallelogram has a base of $I and a height of $I\\. What is its area\\?$', (m) => ({ num: m[1] * m[2] }));
def('geometry_area', 'surface area', '^What is the surface area of a rectangular box that is $I by $I by $I\\?$', (m) => ({ num: 2 * (m[1] * m[2] + m[2] * m[3] + m[1] * m[3]) }));
def('exponents', 'zeros in a power of ten', '^How many zeros does 10\\^$I have when it is written out\\?$', (m) => ({ num: String(10 ** +m[1]).replace(/[^0]/g, '').length, count: true }));
def('exponents', 'repeated factor as a power', '^Write ((?:\\d+ × )+\\d+) as a power of $I\\.$', (m) => {
  const f = m[1].split(' × ').map(Number);
  return { str: `${m[2]}^${f.length}`, consistent: f.every((x) => x === +m[2]) };
});
def('integers', 'which is greater', '^Which is greater: $I or $I\\?$', (m) => ({ num: Math.max(+m[1], +m[2]), consistent: +m[1] !== +m[2] }));
def('integers', 'least of three', '^Which of these numbers is the least: $I, $I, $I\\?$', (m) => {
  const xs = [+m[1], +m[2], +m[3]];
  return { mc: (c) => +c === Math.min(...xs), unique: new Set(xs).size === 3 };
});
def('integers', 'opposite', '^What is the opposite of $I\\?$', (m) => ({ num: 0 - +m[1] }));
def('integers', 'absolute value', '^What is the absolute value of $I\\?$', (m) => ({ num: Math.abs(+m[1]) }));
def('integers', 'colder', '^One morning it is $I°C and the next morning it is $I°C\\. Which temperature is colder, in °C\\?$', (m) => ({ num: Math.min(+m[1], +m[2]), consistent: +m[1] !== +m[2] }));
def('integers', 'distance on a grid', '^How far apart are the points \\($I, $I\\) and \\($I, $I\\) on a grid\\?$', (m) => ({ num: Math.abs(+m[2] - +m[4]), consistent: +m[1] === +m[3], count: true }));
def('linear_eq', 'which value makes it true', '^Which value of x makes (.+) = $I true\\?$', (m) => ({ mc: (c) => close(evalAt(m[1], { x: +c }), +m[2]) }));
const INEQ = { '>': (a, b) => a > b, '<': (a, b) => a < b, '≥': (a, b) => a >= b, '≤': (a, b) => a <= b };
def('inequalities', 'which value makes it true', '^Which value of x makes x (>|<|≥|≤) $I true\\?$', (m) => ({ mc: (c) => INEQ[m[1]](+c, +m[2]) }));
def('inequalities', 'write an inequality', '^Which inequality says "x is (more than|less than|at least|at most) $I"\\?$', (m) => ({ mc: (c) => c === `x ${{ 'more than': '>', 'less than': '<', 'at least': '≥', 'at most': '≤' }[m[1]]} ${m[2]}` }));
def('inequalities', 'count whole-number solutions', '^How many whole numbers from 0 to $I make x (<|>) $I true\\?$', (m) => {
  let n = 0; for (let v = 0; v <= +m[1]; v++) if (m[2] === '<' ? v < +m[3] : v > +m[3]) n++;
  return { num: n, count: true };
});
def('percents', 'percent as per 100', '^Out of 100 students, $I walk to school\\. What percent of the students walk to school\\?\\s+\\(enter the number only\\)$', (m) => ({ num: +m[1] }));
def('word_problems', 'three addends', '^(\\w+) has $I red, $I blue and $I green (\\w+)\\. How many \\5 is that in all\\?$', (m) => ({ num: +m[2] + +m[3] + +m[4], count: true }));
def('word_problems', 'length difference', '^A ribbon is $I centimetres long\\. A string is $I centimetres long\\. How much longer is the ribbon, in centimetres\\?$', (m) => ({ num: +m[1] - +m[2], count: true }));
def('word_problems', 'coins in cents', '^(\\w+) has (.+)\\. How many cents is that\\?$', (m) => {
  const hits = [...m[2].matchAll(/(\d+) (quarters?|dimes?|nickels?|penny|pennies)/g)];
  return { num: hits.reduce((s, h) => s + +h[1] * COIN_CENTS[h[2]], 0), agree: hits.every((h) => (+h[1] === 1) === /^(quarter|dime|nickel|penny)$/.test(h[2])), count: true };
});
def('word_problems', 'packs, then some given away', '^(\\w+) buys $I packs of $I (\\w+) and gives away $I\\. How many \\4 are left\\?$', (m) => ({ num: m[2] * m[3] - m[5], count: true }));
def('word_problems', 'packs added', '^(\\w+) has $I (\\w+) and buys $I packs of $I more\\. How many \\3 does \\1 have now\\?$', (m) => ({ num: +m[2] + m[4] * m[5], count: true }));
def('word_problems', 'cars needed', '^$I people need a ride and each car holds $I people\\. How many cars are needed to carry everyone\\?$', (m) => ({ num: Math.ceil(m[1] / m[2]), count: true }));
def('word_problems', 'times as long', '^A red ribbon is $I cm long\\. A blue ribbon is $I times as long\\. How long is the blue ribbon, in cm\\?$', (m) => ({ num: m[1] * m[2] }));

// counting
def('counting', 'count the symbols', '^How many (stars|dots|squares|triangles|hearts)\\? ([★●■▲♥ ]+)$', (m) => {
  const sym = { stars: '★', dots: '●', squares: '■', triangles: '▲', hearts: '♥' }[m[1]];
  const marks = [...m[2].replace(/ /g, '')];
  return { num: marks.length, count: true, consistent: marks.every((c) => c === sym) };
});
def('counting', 'just after/before', '^What number comes just (after|before) $I\\?$', (m) => ({ num: m[1] === 'after' ? +m[2] + 1 : +m[2] - 1, count: true }));
def('counting', 'greatest/smallest', '^Which number is the (greatest|smallest)\\?$', (m, it) => {
  const xs = it.choices.map(Number);
  const best = m[1] === 'greatest' ? Math.max(...xs) : Math.min(...xs);
  return { mc: (c) => Number(c) === best, unique: xs.filter((x) => x === best).length === 1 };
});
def('counting', 'one more/less', '^What is one (more|less) than $I\\?$', (m) => ({ num: m[1] === 'more' ? +m[2] + 1 : +m[2] - 1, count: true }));
def('counting', 'teen as ten and ones', '^$I is one ten and how many ones\\?$', (m) => ({ num: +m[1] - 10, consistent: +m[1] >= 11 && +m[1] <= 19 }));
def('counting', 'count by tens', '^Count by tens: $I, $I, $I, ___\\. What comes next\\?$', (m) => ({ num: +m[3] + 10, consistent: +m[2] - +m[1] === 10 && +m[3] - +m[2] === 10 && +m[1] % 10 === 0 }));
def('counting', 'number between', '^What number is between $I and $I\\?$', (m) => ({ num: +m[1] + 1, count: true, consistent: +m[2] - +m[1] === 2 }));
def('counting', 'count on by ones', '^Count on: $I, $I, $I, ___\\. What comes next\\?$', (m) => ({ num: +m[3] + 1, count: true, consistent: +m[2] - +m[1] === 1 && +m[3] - +m[2] === 1 }));
def('counting', 'which group has more', '^Which group has more\\? A: ([★●■▲♥ ]+?)\\s+B: ([★●■▲♥ ]+)$', (m) => {
  const a = [...m[1].replace(/ /g, '')]; const b = [...m[2].replace(/ /g, '')];
  return { mc: (c) => c === (a.length > b.length ? 'A' : 'B'), consistent: a.length !== b.length && [...a, ...b].every((c) => c === a[0]) };
});
def('counting', 'numeral for a count', '^Which number tells how many (stars|dots|squares|triangles|hearts)\\? ([★●■▲♥ ]+)$', (m, it) => {
  const sym = { stars: '★', dots: '●', squares: '■', triangles: '▲', hearts: '♥' }[m[1]];
  const marks = [...m[2].replace(/ /g, '')];
  return { mc: (c) => Number(c) === marks.length, consistent: marks.every((c) => c === sym), unique: it.choices.filter((c) => Number(c) === marks.length).length === 1 };
});

// facts within 20
def('facts_within_20', 'expression =', '^([-−\\d\\s+×÷()^.√]+?) =$', (m) => ({ num: evalAt(m[1]), nonNegative: true }));
def('facts_within_20', 'missing first addend', '^___ \\+ $I = $I$', (m) => ({ num: +m[2] - +m[1], count: true }));
def('facts_within_20', 'missing second addend', '^$I \\+ ___ = $I$', (m) => ({ num: +m[2] - +m[1], count: true }));
def('facts_within_20', 'story: gets more', '^(\\w+) has $I (\\w+)\\. \\1 gets $I more\\. How many \\3 does \\1 have now\\?$', (m) => ({ num: +m[2] + +m[4], count: true }));
def('facts_within_20', 'story: gives away', '^(\\w+) has $I (\\w+) and gives $I away\\. How many \\3 are left\\?$', (m) => ({ num: +m[2] - +m[4], count: true }));
def('facts_within_20', 'split a number', '^$I = $I \\+ ___$', (m) => ({ num: +m[1] - +m[2], count: true }));
def('facts_within_20', 'story: put together', '^(\\w+) has $I red (\\w+) and $I blue \\3\\. How many \\3 does \\1 have in all\\?$', (m) => ({ num: +m[2] + +m[4], count: true }));
def('facts_within_20', 'story: compare', '^(\\w+) has $I (\\w+)\\. (\\w+) has $I \\3\\. How many more \\3 does \\1 have than \\4\\?$', (m) => ({ num: +m[2] - +m[5], count: true, consistent: m[1] !== m[4] }));

// shapes
def('shapes', 'sides/corners', '^How many (sides|corners) does an? (\\w+) have\\?$', (m) => ({ num: SHAPE_SIDES[m[2]], count: true }));
def('shapes', 'which shape has n sides', '^Which shape has $I sides\\?$', (m) => ({ mc: (c) => SHAPE_SIDES[c] === +m[1] }));
def('shapes', 'count the corners', '^Count the corners on an? (\\w+)\\. How many corners are there\\?$', (m) => ({ num: SHAPE_SIDES[m[1]], count: true }));
def('shapes', 'which one is flat', '^Which one is flat, like a shape drawn on paper\\?$', () => ({ mc: (c) => FLATS.has(c) }));
def('shapes', 'round with no corners', '^Which shape is round and has no corners\\?$', () => ({ mc: (c) => c === 'circle' }));
def('shapes', 'name from sides and corners', '^A shape has $I straight sides and $I corners\\. What shape is it\\?$', (m) => ({ mc: (c) => SHAPE_SIDES[c] === +m[1], consistent: m[1] === m[2] }));
def('shapes', 'solid or flat', '^Which of these is a (solid|flat) shape, not an? (solid|flat) one\\?$', (m) => ({ mc: (c) => (m[1] === 'solid' ? SOLIDS : FLATS).has(c), consistent: m[1] !== m[2] }));
def('shapes', 'pattern', '^What comes next in the pattern\\? (.+), ___$', (m) => {
  const seq = m[1].split(', ');
  let p = 1;
  while (p < seq.length && !seq.every((t, i) => i < p || t === seq[i - p])) p++;
  return { mc: (c) => c === seq[seq.length - p], consistent: seq.length >= 2 * p };
});
def('shapes', 'compare length/weight', '^The (.+?) is $I (cubes long|blocks heavy on a balance)\\. The (.+?) is $I \\3\\. Which is (longer|heavier)\\?$', (m) => {
  const win = +m[2] > +m[5] ? m[1] : m[4];
  return { mc: (c) => c === `the ${win}`, consistent: +m[2] !== +m[5] && (m[3] === 'cubes long') === (m[6] === 'longer') };
});
def('shapes', 'equal parts', '^An? (.+) is cut into $I equal parts\\. What is each part called\\?$', (m) => ({ mc: (c) => c === { 2: 'one half', 3: 'one third', 4: 'one fourth' }[m[2]] }));

// place value
def('place_value', 'value of a digit', '^In ([\\d,]+), what is the value of the digit $I\\?$', (m) => {
  const s = m[1].replace(/,/g, ''); const at = s.indexOf(m[2]);
  return { num: +m[2] * 10 ** (s.length - 1 - at), unique: s.split(m[2]).length === 2 };
});
def('place_value', 'value of a decimal digit', '^In (\\d+)\\.(\\d+), what is the value of the digit $I\\?$', (m) => {
  const at = m[2].indexOf(m[3]);
  return { num: +m[3] / 10 ** (at + 1), unique: (m[1] + m[2]).split(m[3]).length === 2 };
});
def('place_value', 'digit in a place', '^In ([\\d,]+), which digit is in the (ones|tens|hundreds|thousands|ten thousands|hundred thousands) place\\?$', (m) => {
  const s = m[1].replace(/,/g, ''); const k = PLACE_INDEX[m[2]];
  return { num: Number(s[s.length - 1 - k]), consistent: k < s.length };
});
def('place_value', 'expanded form', '^Write as one number: ([\\d,]+(?: \\+ [\\d,]+)+)\\.$', (m) => {
  const parts = m[1].split(' + ').map(noCommas);
  return { num: parts.reduce((a, b) => a + b, 0), consistent: parts.every((p) => /^[1-9]0*$/.test(String(p))) && new Set(parts.map((p) => String(p).length)).size === parts.length };
});
def('place_value', 'rounding', '^Round ([\\d,]+) to the nearest (ten|hundred|thousand)\\.$', (m) => {
  const n = noCommas(m[1]); const to = { ten: 10, hundred: 100, thousand: 1000 }[m[2]];
  return { num: Math.floor(n / to + 0.5) * to, unique: n % to !== to / 2 };
});
def('place_value', 'ten/hundred more or less', '^What is (10|100) (more|less) than ([\\d,]+)\\?$', (m) => ({ num: noCommas(m[3]) + (m[2] === 'more' ? 1 : -1) * +m[1], count: true }));
def('place_value', 'tens and ones to a number', '^What number is $I tens? and $I ones?\\?$', (m) => ({ num: 10 * +m[1] + +m[2], count: true, agree: (+m[1] === 1) === / ten and/.test(m[0]) && (+m[2] === 1) === / one\?$/.test(m[0]) }));
def('place_value', 'bags of ten', '^(\\w+) has $I bags? of 10 (\\w+) and $I loose \\3\\. How many \\3 is that in all\\?$', (m) => ({ num: 10 * +m[2] + +m[4], count: true, agree: (+m[2] === 1) === / bag of/.test(m[0]) }));
def('place_value', 'teen as 10 plus', '^$I = 10 \\+ ___$', (m) => ({ num: +m[1] - 10, count: true, consistent: +m[1] >= 11 && +m[1] <= 19 }));
def('place_value', 'tens in a number', '^How many tens are in $I\\?$', (m) => ({ num: Math.floor(+m[1] / 10), count: true }));
def('place_value', 'ones digit', '^What digit is in the ones place of $I\\?$', (m) => ({ num: +m[1] % 10, count: true }));
def('place_value', 'full ten frame plus', '^A ten frame is full and $I more dots? (is|are) next to it\\. How many dots are there in all\\?$', (m) => ({ num: 10 + +m[1], count: true, agree: (+m[1] === 1) === (m[2] === 'is') }));
def('place_value', 'which is more', '^Which is more: $I or $I\\?$', (m) => ({ num: Math.max(+m[1], +m[2]), count: true, consistent: +m[1] !== +m[2] }));
def('place_value', 'count on from ten', '^Start at 10 and count on $I more\\. What number do you reach\\?$', (m) => ({ num: 10 + +m[1], count: true }));
def('place_value', 'teen number word', '^Which number is (eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\\?$', (m, it) => {
  const want = { eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 }[m[1]];
  return { mc: (c) => Number(c) === want, unique: it.choices.filter((c) => Number(c) === want).length === 1 };
});
def('place_value', 'greatest number', '^Which of these numbers is the greatest\\?$', (m, it) => {
  const xs = it.choices.map(noCommas); const best = Math.max(...xs);
  return { mc: (c) => noCommas(c) === best, unique: xs.filter((x) => x === best).length === 1 };
});

// measurement
def('measurement', 'coins', '^What is the total value, in cents, of (.+)\\?$', (m) => {
  const hits = [...m[1].matchAll(/(\d+) (quarters?|dimes?|nickels?|penny|pennies)/g)];
  return { num: hits.reduce((s, h) => s + +h[1] * COIN_CENTS[h[2]], 0), agree: hits.every((h) => (+h[1] === 1) === /^(quarter|dime|nickel|penny)$/.test(h[2])) };
});
def('measurement', 'clock on the hour', '^The minute hand points to 12 and the hour hand points to $I\\. What time is it\\?$', (m) => ({ mc: (c) => c === `${+m[1]}:00` }));
def('measurement', 'clock half past', '^The minute hand points to 6 and the hour hand is halfway between $I and $I\\. What time is it\\?$', (m) => ({ mc: (c) => c === `${+m[1]}:30`, consistent: +m[2] === (+m[1] % 12) + 1 }));
def('measurement', 'elapsed time', '^A lesson starts at (\\d+):(\\d\\d) and lasts $I minutes\\. What time does it end\\?$', (m) => {
  const t = +m[1] * 60 + +m[2] + +m[3];
  return { mc: (c) => c === `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` };
});
def('measurement', 'unit conversion', '^How many (\\w+) are in $I (\\w+)\\?$', (m) => ({ num: +m[2] * PER[`${m[1]}/${m[3]}`] }));
// grade tiers (standards check, 2026-10-24): 1.MD.1-2, 2.MD.4 and 7, 3.MD.2
def('measurement', 'length in same-size units', '^A (\\w+) is $I (paper clips|cubes|erasers) long and a (\\w+) is $I \\3 long\\. How many \\3 longer is the \\1\\?$', (m) => ({ num: +m[2] - +m[5], count: true, consistent: m[1] !== m[4] && +m[2] > +m[5] }));
def('measurement', 'order three lengths', '^The (\\w+) is longer than the (\\w+)\\. The \\2 is longer than the (\\w+)\\. Which is the (longest|shortest)\\?$', (m) => ({ mc: (c) => c === `the ${m[4] === 'longest' ? m[1] : m[3]}`, consistent: new Set([m[1], m[2], m[3]]).size === 3 }));
def('measurement', 'clock to five minutes', '^The hour hand is just past $I and the minute hand points to $I\\. What time is it\\?$', (m) => ({ mc: (c) => c === `${+m[1]}:${String(5 * +m[2]).padStart(2, '0')}`, consistent: +m[2] >= 1 && +m[2] <= 11 && +m[1] >= 1 && +m[1] <= 12 }));
def('measurement', 'compare lengths', '^A (\\w+) is $I (inches|centimetres) long\\. A (\\w+) is $I \\3 long\\. How much longer is the \\1, in \\3\\?$', (m) => ({ num: +m[2] - +m[5], count: true, consistent: m[1] !== m[4] }));
def('measurement', 'total mass', '^A bag of rice has a mass of $I kilograms and a bag of beans has a mass of $I kilograms\\. What is their total mass, in kilograms\\?$', (m) => ({ num: +m[1] + +m[2] }));
def('measurement', 'total volume', '^A jug holds $I litres and a bucket holds $I litres\\. How many litres do they hold together\\?$', (m) => ({ num: +m[1] + +m[2], count: true }));

// data and statistics
def('data_stats', 'tally total', '^A class voted for a favourite pet: (.+)\\. How many votes were there in all\\?$', (m) => ({ num: [...m[1].matchAll(/\w+ (\d+)/g)].reduce((s, h) => s + +h[1], 0), count: true }));
def('data_stats', 'tally difference', '^A class voted for a favourite pet: (.+)\\. How many more votes did (\\w+) get than (\\w+)\\?$', (m) => {
  const v = Object.fromEntries([...m[1].matchAll(/(\w+) (\d+)/g)].map((h) => [h[1], +h[2]]));
  return { num: v[m[2]] - v[m[3]], count: true };
});
def('data_stats', 'median', '^What is the median of ([\\d, ]+)\\?(?:\\s+\\(as a decimal if needed\\))?$', (m) => {
  const s = sortNum(intsIn(m[1])); const n = s.length;
  return { num: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 };
});
def('data_stats', 'range', '^What is the range of ([\\d, ]+)\\?$', (m) => { const s = intsIn(m[1]); return { num: Math.max(...s) - Math.min(...s) }; });
def('data_stats', 'mode', '^What is the mode of ([\\d, ]+)\\?$', (m) => {
  const counts = {}; for (const x of intsIn(m[1])) counts[x] = (counts[x] || 0) + 1;
  const top = Math.max(...Object.values(counts)); const modes = Object.keys(counts).filter((k) => counts[k] === top);
  return { num: Number(modes[0]), unique: modes.length === 1 };
});
def('data_stats', 'mean', '^What is the mean of ([\\d, ]+)\\?$', (m) => { const s = intsIn(m[1]); return { num: s.reduce((a, b) => a + b, 0) / s.length }; });
def('data_stats', 'mean, rounded', '^What is the mean of ([\\d, ]+)\\?\\s+\\(round to 2 decimals\\)$', (m) => { const s = intsIn(m[1]); return { num: s.reduce((a, b) => a + b, 0) / s.length, places: 2 }; });
def('data_stats', 'z-score', '^Scores have mean $I and standard deviation $I\\. What is the z-score of a score of $I\\?$', (m) => ({ num: (+m[3] - +m[1]) / +m[2] }));
def('data_stats', 'standard deviation', '^What is the population standard deviation of ([\\d, ]+)\\?\\s+\\(round to 2 decimals\\)$', (m) => {
  const s = intsIn(m[1]); const mu = s.reduce((a, b) => a + b, 0) / s.length;
  return { num: Math.sqrt(s.reduce((a, b) => a + (b - mu) * (b - mu), 0) / s.length), places: 2 };
});
def('data_stats', 'expected value', '^A random variable X takes the values $I, $I and $I with probabilities 1/2, 1/4 and 1/4\\. What is E\\[X\\]\\?$', (m) => ({ num: (2 * +m[1] + +m[2] + +m[3]) / 4 }));
def('data_stats', 'regression slope', '^For the points (.+), what is the slope of the least-squares regression line\\?\\s+\\(round to 2 decimals\\)$', (m) => {
  const pts = [...m[1].matchAll(/\((-?\d+), (-?\d+)\)/g)].map((h) => [+h[1], +h[2]]); const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0); const sy = pts.reduce((a, p) => a + p[1], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0); const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  return { num: (n * sxy - sx * sy) / (n * sxx - sx * sx), places: 2 };
});

// calculus
def('calculus', 'power rule', '^What is the derivative of x\\^$I\\?$', (m) => ({ mc: (c) => {
  const mm = c.match(/^(\d*)x(?:\^(\d+))?$/); if (!mm) return false;
  return Number(mm[1] || 1) === +m[1] && Number(mm[2] || 1) === +m[1] - 1;
} }));
def('calculus', 'chain rule at a point', '^If f\\(x\\) = \\((.+)\\)\\^$I, what is f\'\\($I\\)\\?$', (m) => {
  const L = (x) => evalAt(m[1], { x });
  return { num: +m[2] * L(+m[3]) ** (+m[2] - 1) * (L(1) - L(0)) };
});
def('calculus', 'derivative at a point', '^If f\\(x\\) = (.+), what is f\'\\($I\\)\\?$', (m) => ({ num: Math.round(stencil((x) => evalAt(m[1], { x }), +m[2]) * 1e6) / 1e6 }));
def('calculus', 'limit by factoring', '^What is the limit of \\(x\\^2 - $I\\) / \\((x [+-] \\d+)\\) as x approaches $I\\?$', (m) => {
  const a = +m[3];
  return { num: 2 * a, consistent: Math.abs(evalAt(m[2], { x: a })) < 1e-12 && +m[1] === a * a };
});
def('calculus', 'limit at infinity', `^What is the limit of \\((.+)\\) / \\((.+)\\) as x approaches infinity${fracQ}`, (m) => {
  const big = 1e12;
  return { num: evalAt(m[1], { x: big }) / evalAt(m[2], { x: big }), lowest: true };
});
def('calculus', 'definite integral', '^Evaluate the definite integral of $I(x(?:\\^\\d+)?) dx from x = 0 to x = $I\\.$', (m) => {
  const n = m[2] === 'x' ? 1 : +m[2].slice(2); const b = +m[3];
  // Simpson's rule is exact for powers up to 3 and, with 200 panels, within 1e-6 at 4.
  const N = 200; const h = b / N; let s = 0;
  for (let i = 0; i <= N; i++) s += (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * +m[1] * (i * h) ** n;
  return { num: Math.round(((s * h) / 3) * 1e4) / 1e4 };
});
def('calculus', 'geometric series', `^What is the sum of the infinite geometric series with first term $I and common ratio 1/$I${fracQ}`, (m) => {
  let s = 0; for (let i = 0; i < 200; i++) s += Number(m[1]) / Number(m[2]) ** i;
  return { num: Math.round(s * 1e9) / 1e9, lowest: true };
});

// linear algebra
def('linear_algebra', 'determinant', '^What is the determinant of the matrix (\\[\\[.+\\]\\])\\?$', (m) => ({ num: detOf(JSON.parse(m[1])) }));
def('linear_algebra', 'dot product', '^What is the dot product of \\(([-\\d, ]+)\\) and \\(([-\\d, ]+)\\)\\?$', (m) => { const u = intsIn(m[1]); const v = intsIn(m[2]); return { num: u.reduce((s, x, i) => s + x * v[i], 0) }; });
def('linear_algebra', 'matrix times vector', '^If A = (\\[\\[.+\\]\\]) and v = \\($I, $I\\), what is the (first|second) entry of Av\\?$', (m) => {
  const A = JSON.parse(m[1]); const r = A[m[4] === 'first' ? 0 : 1];
  return { num: r[0] * +m[2] + r[1] * +m[3] };
});
def('linear_algebra', 'eigenvalue', '^What is the (larger|smaller) eigenvalue of the matrix (\\[\\[.+\\]\\])\\?$', (m) => {
  const A = JSON.parse(m[2]); const tr = A[0][0] + A[1][1]; const det = detOf(A); const disc = tr * tr - 4 * det;
  const l = [(tr - Math.sqrt(disc)) / 2, (tr + Math.sqrt(disc)) / 2];
  return { num: m[1] === 'larger' ? l[1] : l[0], unique: disc > 0 };
});
def('linear_algebra', 'rank', '^What is the rank of the matrix (\\[\\[.+\\]\\])\\?$', (m) => ({ num: rankOf(JSON.parse(m[1])) }));
def('linear_algebra', 'determinant of a product', '^A and B are $I×$I matrices with det\\(A\\) = $I and det\\(B\\) = $I\\. What is det\\($IAB\\)\\?$', (m) => ({ num: (+m[5]) ** +m[1] * +m[3] * +m[4], consistent: m[1] === m[2] }));

// probability
def('probability', 'die greater than', `^A fair six-sided die is rolled once\\. What is the probability of rolling a number greater than $I${fracQ}`, (m) => ({ num: [1, 2, 3, 4, 5, 6].filter((f) => f > +m[1]).length / 6, lowest: true }));
def('probability', 'one marble', `^A bag holds $I red, $I blue and $I green marbles\\. One marble is picked at random\\. What is the probability that it is blue${fracQ}`, (m) => ({ num: +m[2] / (+m[1] + +m[2] + +m[3]), lowest: true }));
def('probability', 'combinations', '^How many ways are there to choose $I items from $I distinct items, when order does not matter\\?$', (m) => ({ num: binom(+m[2], +m[1]), count: true }));
def('probability', 'permutations', '^How many ordered arrangements of $I items can be made from $I distinct items\\?$', (m) => ({ num: factI(+m[2]) / factI(+m[2] - +m[1]), count: true }));
def('probability', 'two draws', `^A bag holds $I red and $I blue marbles\\. Two are drawn without replacement\\. What is the probability that both are red${fracQ}`, (m) => {
  const r = +m[1]; const t = r + +m[2]; let good = 0; let all = 0;
  for (let i = 0; i < t; i++) for (let j = 0; j < t; j++) if (i !== j) { all++; if (i < r && j < r) good++; }
  return { num: good / all, lowest: true };
});
def('probability', 'binomial', `^A fair coin is flipped $I times\\. What is the probability of exactly $I heads?${fracQ}`, (m) => ({ num: binom(+m[1], +m[2]) / 2 ** +m[1], lowest: true }));
def('probability', 'expected die roll', '^A fair die with faces numbered 1 to $I is rolled\\. What is the expected value of the roll\\?\\s+\\(as a decimal\\)$', (m) => { let s = 0; for (let i = 1; i <= +m[1]; i++) s += i; return { num: s / +m[1] }; });
def('probability', 'conditional', `^Of $I people, $I like tea, $I like coffee and $I like both\\. One person who likes coffee is chosen at random\\. What is the probability that this person also likes tea${fracQ}`, (m) => ({
  num: +m[4] / +m[3], lowest: true, consistent: +m[4] <= Math.min(+m[2], +m[3]) && +m[1] >= +m[2] + +m[3] - +m[4],
}));
def('probability', 'geometric waiting time', '^Independent trials each succeed with probability 1/$I\\. What is the expected number of trials up to and including the first success\\?$', (m) => {
  const p = 1 / +m[1]; let s = 0; for (let k = 1; k < 20000; k++) s += k * p * (1 - p) ** (k - 1);
  return { num: Math.round(s * 1e6) / 1e6 };
});
def('probability', 'two-state Markov chain', `^A two-state Markov chain moves from state 1 to state 2 with probability $I/$I and from state 2 to state 1 with probability $I/$I\\. What is the long-run probability of being in state 1${fracQ}`, (m) => {
  const p = +m[1] / +m[2]; const q = +m[3] / +m[4]; let v = [1, 0];
  for (let i = 0; i < 5000; i++) v = [v[0] * (1 - p) + v[1] * q, v[0] * p + v[1] * (1 - q)];
  return { num: Math.round(v[0] * 1e10) / 1e10, lowest: true };
});

// discrete mathematics
def('discrete_math', 'mod', '^What is $I mod $I\\?$', (m) => ({ num: ((+m[1] % +m[2]) + +m[2]) % +m[2] }));
def('discrete_math', 'gcd', '^What is gcd\\($I, $I\\)\\?$', (m) => { let g = 1; for (let k = 1; k <= Math.min(+m[1], +m[2]); k++) if (+m[1] % k === 0 && +m[2] % k === 0) g = k; return { num: g }; });
def('discrete_math', 'inclusion-exclusion', '^Sets A and B have \\|A\\| = $I, \\|B\\| = $I and \\|A ∩ B\\| = $I\\. What is \\|A ∪ B\\|\\?$', (m) => ({ num: +m[1] + +m[2] - +m[3], consistent: +m[3] <= Math.min(+m[1], +m[2]) }));
def('discrete_math', 'subsets', '^How many subsets does a set with $I elements have\\?$', (m) => ({ num: 2 ** +m[1] }));
def('discrete_math', 'truth value', '^If p is (true|false) and q is (true|false), what is the truth value of (.+)\\?$', (m) => {
  const fn = TRUTH[m[3]];
  return fn ? { mc: (c) => c === String(fn(m[1] === 'true', m[2] === 'true')) } : { unknown: true };
});
def('discrete_math', 'handshake lemma', '^A simple graph has vertex degrees ([\\d, ]+)\\. How many edges does it have\\?$', (m) => { const d = intsIn(m[1]); return { num: d.reduce((a, b) => a + b, 0) / 2, consistent: graphical(d) }; });
def('discrete_math', 'functions between sets', '^How many functions are there from a set with $I elements to a set with $I elements\\?$', (m) => ({ num: (+m[2]) ** +m[1] }));
def('discrete_math', 'recurrence', '^a_1 = $I and a_n = $Ia_\\(n-1\\)(?: ([+-]) (\\d+))? for n ≥ 2\\. What is a_5\\?$', (m) => {
  const c = m[3] ? (m[3] === '-' ? -1 : 1) * +m[4] : 0; let a = +m[1];
  for (let i = 2; i <= 5; i++) a = +m[2] * a + c;
  return { num: a };
});
def('discrete_math', 'pigeonhole', '^What is the smallest number of people that guarantees at least $I of them share a birth month\\?$', (m) => {
  let n = 1; while (Math.ceil(n / 12) < +m[1]) n++;
  return { num: n };
});
def('discrete_math', 'bijections', '^How many bijections are there from a set with $I elements to itself\\?$', (m) => ({ num: factI(+m[1]) }));
def('discrete_math', 'derangements', '^How many derangements \\(permutations with no fixed point\\) of $I objects are there\\?$', (m) => {
  const n = +m[1]; let s = 0; for (let k = 0; k <= n; k++) s += (k % 2 ? -1 : 1) * factI(n) / factI(k);
  return { num: Math.round(s) };
});

// abstract algebra
def('abstract_algebra', 'order in Z_n', '^In the group of integers mod $I under addition, what is the order of the element $I\\?$', (m) => { let k = 1; while ((k * +m[2]) % +m[1] !== 0) k++; return { num: k }; });
def('abstract_algebra', 'order of S_n', '^How many elements does the symmetric group S_$I have\\?$', (m) => ({ num: factI(+m[1]) }));
def('abstract_algebra', 'order of a permutation', '^What is the order of the permutation ((?:\\([\\d ]+\\))+) in S_$I\\?$', (m) => {
  const n = +m[2]; const map = Array.from({ length: n + 1 }, (_, i) => i); const seen = [];
  for (const cyc of m[1].match(/\(([\d ]+)\)/g)) {
    const xs = cyc.slice(1, -1).split(' ').map(Number); seen.push(...xs);
    xs.forEach((x, i) => { map[x] = xs[(i + 1) % xs.length]; });
  }
  let cur = map.slice(); let k = 1;
  while (!cur.every((v, i) => v === i)) { cur = cur.map((v) => map[v]); k++; }
  return { num: k, consistent: new Set(seen).size === seen.length && seen.every((x) => x >= 1 && x <= n) };
});
def('abstract_algebra', 'Lagrange', '^A group has order $I\\. By Lagrange\'s theorem, which of these could be the order of one of its subgroups\\?$', (m) => ({ mc: (c) => +m[1] % Number(c) === 0 }));
def('abstract_algebra', 'generators of a cyclic group', '^How many generators does a cyclic group of order $I have\\?$', (m) => {
  const n = +m[1]; let c = 0;
  for (let g = 0; g < n; g++) { let k = 1; while ((k * g) % n !== 0) k++; if (k === n) c++; }
  return { num: c };
});
def('abstract_algebra', 'units of Z/nZ', '^How many units does the ring ℤ/$Iℤ have\\?$', (m) => {
  const n = +m[1]; let c = 0; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if ((a * b) % n === 1) { c++; break; }
  return { num: c };
});
def('abstract_algebra', 'ideals of Z/nZ', '^How many ideals does the ring ℤ/$Iℤ have\\?$', (m) => {
  const n = +m[1]; const sets = new Set();
  for (let a = 0; a < n; a++) { const s = new Set(); for (let k = 0; k < n; k++) s.add((k * a) % n); sets.add([...s].sort((x, y) => x - y).join(',')); }
  return { num: sets.size };
});
def('abstract_algebra', 'inverse mod p', '^What is the multiplicative inverse of $I modulo $I\\?\\s+\\(a number from 1 to $I\\)$', (m) => {
  let b = 1; while (b < +m[2] && (+m[1] * b) % +m[2] !== 1) b++;
  return { num: b, consistent: isPrime(+m[2]) && +m[3] === +m[2] - 1 };
});
def('abstract_algebra', 'abelian groups of order n', '^How many abelian groups of order $I are there, up to isomorphism\\?$', (m) => ({ num: Object.values(factorize(+m[1])).reduce((s, e) => s * partitions(e), 1) }));
def('abstract_algebra', 'degree of a radical extension', '^What is the degree of the field extension ℚ\\($I\\^\\(1/$I\\)\\) over ℚ\\?$', (m) => ({ num: +m[2], consistent: isPrime(+m[1]) }));

// analysis
def('analysis', 'limit of a sequence', `^What is the limit of the sequence \\((.+)\\) / \\((.+)\\) as n → ∞${fracQ}`, (m) => {
  const n = 1e12; const top = evalAt(m[1].replace(/n/g, 'x'), { x: n }); const bot = evalAt(m[2].replace(/n/g, 'x'), { x: n });
  return { num: top / bot, lowest: true };
});
def('analysis', 'sup/inf', '^What is the (supremum|infimum) of the set \\{$I - 1/n ?: n = 1, 2, 3, …\\}\\?$', (m) => {
  let lo = Infinity; let hi = -Infinity;
  for (let i = 1; i <= 100000; i++) { const v = +m[2] - 1 / i; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { num: m[1] === 'infimum' ? lo : Math.round(hi) };
});
def('analysis', 'complex modulus', '^What is the modulus of the complex number $I ([+-]) $Ii\\?$', (m) => ({ num: Math.hypot(+m[1], +m[3]) }));
def('analysis', 'p-series', '^Does the series Σ 1/n\\^p \\(n = 1, 2, 3, …\\) converge when p = (\\d+)(?:/(\\d+))?\\?$', (m) => {
  const p = +m[1] / (m[2] ? +m[2] : 1);
  return { mc: (c) => c === (p > 1 ? 'it converges' : 'it diverges') };
});
def('analysis', 'radius of convergence', '^What is the radius of convergence of the power series Σ (n(?:\\^$I)? )?x\\^n / $I\\^n \\(n ≥ 0\\)\\?$', (m) => {
  const j = m[1] ? (m[2] ? +m[2] : 1) : 0; const k = +m[3];
  const n = 4000; const root = (n ** j) ** (1 / n) / k; // nth root of the nth coefficient
  return { num: Math.round(1 / root) };
});
def('analysis', 'residue at a simple pole', `^What is the residue of f\\(z\\) = 1 / \\((.+)\\) at z = $I${fracQ}`, (m) => {
  const roots = [];
  if (/^z(?=\(|$)/.test(m[1]) || /\)z$/.test(m[1])) roots.push(0);
  for (const h of m[1].matchAll(/\(z ([+-]) (\d+)\)/g)) roots.push(h[1] === '-' ? +h[2] : -+h[2]);
  const a = +m[2]; const others = roots.filter((r) => r !== a);
  return { num: 1 / others.reduce((s, r) => s * (a - r), 1), lowest: true, consistent: roots.includes(a) && others.length === roots.length - 1 };
});
def('analysis', 'contour integral', '^Let C be the circle \\|z\\| = $I, traversed once counterclockwise\\. What is the integral of 1/\\((z(?: [+-] \\d+)?)\\) dz around C\\?$', (m) => {
  const mm = m[2].match(/z(?: ([+-]) (\d+))?/); const pole = mm[1] ? (mm[1] === '-' ? +mm[2] : -+mm[2]) : 0;
  return { mc: (c) => c === (Math.abs(pole) < +m[1] ? '2πi' : '0'), consistent: Math.abs(pole) !== +m[1] };
});
def('analysis', 'entire function', '^Which of these functions is holomorphic on all of ℂ\\?$', (m, it) => ({ mc: (c) => ENTIRE_FNS.has(c), consistent: it.choices.every((c) => ENTIRE_FNS.has(c) || NOT_ENTIRE.has(c)) }));

// topology
def('topology', 'open or closed interval', '^In ℝ with the usual topology, the interval ([\\[(])$I, $I([\\])]) is$', (m) => {
  const ans = m[1] === '(' && m[4] === ')' ? 'open' : m[1] === '[' && m[4] === ']' ? 'closed' : 'neither open nor closed';
  return { mc: (c) => c === ans, consistent: +m[2] < +m[3] };
});
def('topology', 'connected components', '^How many connected components does the subset (.+) of ℝ have\\?$', (m) => {
  const parts = [...m[1].matchAll(/\[(-?\d+), (-?\d+)\]|\{(-?\d+)\}/g)].map((h) => (h[3] != null ? [+h[3], +h[3]] : [+h[1], +h[2]])).sort((a, b) => a[0] - b[0]);
  let count = 0; let end = -Infinity;
  for (const [a, b] of parts) { if (a > end) count++; end = Math.max(end, b); }
  return { num: count };
});
def('topology', 'Euler formula for a polyhedron', '^A convex polyhedron has $I vertices and $I edges\\. How many faces does it have\\?$', (m) => ({ num: 2 - +m[1] + +m[2], count: true }));
def('topology', 'Euler characteristic of a surface', '^What is the Euler characteristic of a closed orientable surface of genus $I\\?$', (m) => ({ num: 2 - 2 * +m[1] }));
def('topology', 'first Betti number', '^What is the first Betti number of a closed orientable surface of genus $I\\?$', (m) => ({ num: 2 * +m[1] }));
def('topology', 'compact subset', '^Which of these subsets of ℝ is compact\\?$', () => ({ mc: (c) => /^\[-?\d+, -?\d+\]$/.test(c) }));
def('topology', 'fundamental group', '^What is the fundamental group of (.+)\\?$', (m) => (PI1_OF[m[1]] ? { mc: (c) => c === PI1_OF[m[1]] } : { unknown: true }));

// ── generic text checks ─────────────────────────────────────────────────────
const TEXT_CHECKS = [
  ['debris', /undefined|NaN|Infinity|\bnull\b|\$\{|\[object|\{\{/],
  ['float-noise', /\d\.\d*(\d)\1{4,}\d*|\d\.\d{7,}/],
  ['sign-stacking', /(^|[\s(])[+\-−] [-−]\d|--\d/],
  ['unit-coefficient', /(^|[^\d.\w/])1[xy]\b/],
  ['zero-term', /[+\-−] 0[xy]\b/],
  ['power-of-one', /[a-z]\^1(?!\d)/],
  ['plural-after-1', /(^|[^\d.,/-])1 (?!is\b|was\b|has\b|plus\b|minus\b|less\b|more\b|times\b|gives\b|makes\b|means\b|changes\b|leaves\b|equals\b|stays\b|holds\b|goes\b|lands\b|and\b|or\b)[a-z]+s\b/],
  ['doubled-word', /\b([A-Za-z]{2,}) \1\b/i],
  ['spacing', / {2,}(?![(])|\s[,;:](?=\s)/],
  // bank.tidy() pulls a space-preceded "?" onto the word before it, so a "?"
  // used as a blank renders as "3 ×? = 21" or "x^2 +?x". Blanks are "___".
  ['glued-placeholder', /[=+×÷−-]\?|\?[\w/(]|\bthe\?/],
];

function textFlags(text) {
  const out = [];
  for (const [code, re] of TEXT_CHECKS) {
    const m = String(text).match(re);
    if (m) out.push([code, m[0].trim()]);
  }
  return out;
}

// ── reporting ───────────────────────────────────────────────────────────────
const report = new Map(); // family → { rendered, flags: Map(code → {n, ex[]}), samples[] }
function fam(key) {
  if (!report.has(key)) report.set(key, { rendered: 0, flags: new Map(), samples: [], maxChoices: 0, renders: [] });
  return report.get(key);
}
function flag(f, code, detail, it) {
  if (!f.flags.has(code)) f.flags.set(code, { n: 0, ex: [] });
  const e = f.flags.get(code);
  e.n++;
  if (e.ex.length < EXAMPLES) e.ex.push({ detail, prompt: it.prompt, choices: it.choices, answer: it.answer, passage: it.passage });
}

// ── math ────────────────────────────────────────────────────────────────────
const { normalize: normalizeItem } = (() => {
  // bank.normalize is not exported; this is the same shape it produces for the
  // fields the checks read, so a check sees what a learner would.
  const tidy = (t) => String(t).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;:?!])/g, '$1').trim();
  return {
    normalize: (raw) => {
      const item = {
        format: raw.format || 'multiple_choice',
        prompt: tidy(raw.prompt || ''),
        answer: String(raw.answer),
        rationale: tidy(raw.rationale || ''),
      };
      if (raw.passage) item.passage = tidy(raw.passage);
      if (Array.isArray(raw.accepts) && raw.accepts.length) item.accepts = raw.accepts.map(String);
      if (item.format === 'multiple_choice') item.rawChoices = (raw.choices || []).map(String);
      if (item.format === 'multiple_choice') item.choices = [...new Set(item.rawChoices)];
      return item;
    },
  };
})();

function compare(f, v, it, raw) {
  const key = it.answer;
  if (v.unknown) { flag(f, 'no-verifier', 'template variant not recognised', it); return; }
  if (v.unique === false) flag(f, 'not-unique', 'the question has more than one right answer', it);
  if (v.consistent === false) flag(f, 'inconsistent-prompt', 'the numbers in the prompt contradict each other', it);
  if (v.direction === false) flag(f, 'wrong-direction', 'rises/falls disagrees with the numbers', it);
  if (v.agree === false) flag(f, 'agreement', 'is/are does not match the number', it);
  if (v.fits === false) flag(f, 'impossible-figure', 'the shape described cannot exist', it);
  if (v.linear === false) flag(f, 'not-linear', 'the expression asked about is not linear', it);
  if (v.lowestPoint === false) flag(f, 'no-lowest-point', 'a downward parabola has no lowest point', it);
  if (v.mixedReduced === false) flag(f, 'mixed-not-reduced', 'the mixed number in the prompt is not in lowest terms', it);
  if (v.mc) {
    if (it.format !== 'multiple_choice') { flag(f, 'format', 'expected multiple choice', it); return; }
    const passing = it.choices.filter((c) => { try { return v.mc(c); } catch (err) { return false; } });
    if (passing.length !== 1) flag(f, 'keys', `${passing.length} choices are correct: ${passing.join(' | ') || 'none'}`, it);
    else if (passing[0] !== key) flag(f, 'wrong-key', `keyed "${key}", correct "${passing[0]}"`, it);
    return;
  }
  if (v.cx) {
    if (!cxEq(key, v.cx[0], v.cx[1])) flag(f, 'wrong-key', `keyed "${key}", correct ${v.cx[0]} + ${v.cx[1]}i`, it);
    if (/[+-] -/.test(key)) flag(f, 'sign-stacking', key, it);
    return;
  }
  if ('str' in v) {
    if (key !== v.str) flag(f, 'wrong-key', `keyed "${key}", correct "${v.str}"`, it);
    return;
  }
  if ('num' in v) {
    if (!Number.isFinite(v.num)) { flag(f, 'unsolvable', `recomputed value is ${v.num}`, it); return; }
    const got = numOf(key);
    if (!Number.isFinite(got)) { flag(f, 'wrong-key', `keyed "${key}" is not a number; correct ${v.num}`, it); return; }
    if (v.places != null) {
      const want = Math.round(v.num * 10 ** v.places) / 10 ** v.places;
      if (!close(got, want, 1e-9)) flag(f, 'wrong-key', `keyed ${key}, correct ${v.num} → ${want}`, it);
    } else if (!close(got, v.num, 1e-9)) {
      const rounded = round2(v.num);
      const says = /round|decimal|nearest/i.test(it.prompt);
      if (close(got, rounded, 1e-9) && says) { /* asked for, and given, a rounded value */ } else {
        flag(f, close(got, rounded, 1e-9) ? 'unannounced-rounding' : 'wrong-key', `keyed ${key}, correct ${v.num}`, it);
      }
    }
    if (v.whole && !close(v.num, Math.round(v.num), 1e-9)) {
      flag(f, 'not-whole', `the question promises a whole number; the true value is ${v.num}`, it);
    }
    if (v.count && (got < 0 || !Number.isInteger(got))) flag(f, 'impossible-quantity', `a count of ${key}`, it);
    if (v.nonNegative && got < 0) flag(f, 'impossible-quantity', `negative amount ${key}`, it);
    if (v.lowest && /\//.test(key)) {
      const mm = key.match(/^(-?\d+)\/(\d+)$/);
      if (!mm || gcd(+mm[1], +mm[2]) !== 1 || +mm[2] === 1) flag(f, 'not-lowest-terms', key, it);
    }
    if (v.money) {
      for (const p of v.money) if (/\.\d$/.test(p)) flag(f, 'money-format', `$${p}`, it);
    }
  }
}

function checkItem(f, raw, verifiers) {
  const it = normalizeItem(raw);
  f.rendered++;
  if (SHOW && f.samples.length < SHOW) f.samples.push(it);
  // What the learner reads is held to every notation rule. An accepted spelling
  // is never shown, so it may be lenient ("3 + -2i" is accepted for 3 - 2i) and
  // is only checked for debris. A distractor is wrong on purpose, but not badly
  // written on purpose.
  for (const t of [it.prompt, it.answer, it.rationale]) for (const [code, hit] of textFlags(t)) flag(f, code, hit, it);
  for (const t of it.accepts || []) for (const [code, hit] of textFlags(t)) if (code === 'debris' || code === 'float-noise') flag(f, code, hit, it);
  for (const c of it.choices || []) for (const [code, hit] of textFlags(c)) if (code !== 'plural-after-1' && code !== 'doubled-word') flag(f, `choice:${code}`, hit, it);
  if (!it.prompt) flag(f, 'empty', 'empty prompt', it);
  if (!it.answer.trim()) flag(f, 'empty', 'empty answer', it);
  if (raw.x && !raw.accepts) flag(f, 'accepts-dropped', `x: ${raw.x.join(' / ')} never reaches grading`, it);
  if (it.format === 'multiple_choice') {
    if (it.rawChoices.length !== it.choices.length) flag(f, 'duplicate-choices', it.rawChoices.join(' | '), it);
    if (!it.choices.includes(it.answer)) flag(f, 'key-not-a-choice', it.answer, it);
    if (it.choices.length < 3) flag(f, 'too-few-choices', `${it.choices.length} choices`, it);
    f.maxChoices = Math.max(f.maxChoices, it.choices.length);
    f.renders.push(it);
  } else {
    const graded = grade({ ...it, format: it.format }, it.answer);
    if (!graded.correct) flag(f, 'key-fails-grading', it.answer, it);
    for (const a of it.accepts || []) {
      if (!grade(it, a).correct) flag(f, 'accept-fails-grading', a, it);
    }
  }
  if (/how many/i.test(it.prompt) && it.format !== 'multiple_choice') {
    const n = numOf(it.answer);
    if (Number.isFinite(n) && (n < 0 || !Number.isInteger(n)) && !/\b(grams|metres|miles|pounds|cm|kilometres)\b/i.test(it.prompt)) {
      flag(f, 'impossible-quantity', `"how many" answered ${it.answer}`, it);
    }
  }
  const hit = verifiers.find((vv) => vv.re.test(it.prompt));
  if (!hit) { flag(f, 'no-verifier', 'no verifier recognises this prompt', it); return null; }
  let v;
  try { v = hit.fn(it.prompt.match(hit.re), it); } catch (err) { flag(f, 'verifier-error', err.message, it); return hit.name; }
  compare(f, v, it, raw);
  return hit.name;
}

function auditMath() {
  const G = load('math-items');
  const SHAPES = load('math-shapes');
  const skills = Object.keys(G).filter((s) => !ONLY || s === ONLY);
  for (const skill of skills) {
    const verifiers = V.filter((v) => v.skills.includes(skill));
    // The base generator, after the shape rotation has spent its budget: from
    // the thirteenth call on, `withShapes` serves the base generator only.
    const base = G[skill];
    if (SHAPES[skill]) for (let i = 0; i < 12; i++) base(makeRng(`burn:${skill}:${i}`), 5, {});
    const sources = [['math-items', base]];
    if (SHAPES[skill]) sources.push(['math-shapes', SHAPES[skill]]);
    for (const [source, gen] of sources) {
      for (let d = 1; d <= 10; d++) {
        for (let i = 0; i < MATH_SEEDS; i++) {
          const raw = gen(makeRng(`audit:${source}:${skill}:${d}:${i}`), d, { avoid: new Set() });
          // Family = the verifier that recognised it; until one does, the source.
          const probe = normalizeItem(raw);
          const hit = verifiers.find((vv) => vv.re.test(probe.prompt));
          const f = fam(`${source}/${skill}: ${hit ? hit.name : 'unrecognised'}`);
          checkItem(f, raw, verifiers);
        }
      }
    }
  }
  // Grade tiers (standards check, 2026-10-24). The grade-fit generators step by
  // tenths in the early band (a grade's range in config/grade-skills.js can sit
  // between two whole difficulties), and the school tiers are served only to a
  // caller that passes a school grade, so neither is reached by the loop above.
  let gradeItems = null;
  try { gradeItems = load('math-grade-items'); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
  if (!gradeItems) return;
  const tenths = Array.from({ length: 30 }, (_, i) => Math.round((1 + i / 10) * 10) / 10);
  for (const skill of Object.keys(gradeItems).filter((s) => !ONLY || s === ONLY)) {
    const verifiers = V.filter((v) => v.skills.includes(skill));
    for (const d of tenths) {
      for (let i = 0; i < Math.ceil(MATH_SEEDS / 3); i++) {
        const raw = G[skill](makeRng(`audit:tenths:${skill}:${d}:${i}`), d, { avoid: new Set() });
        const hit = verifiers.find((vv) => vv.re.test(normalizeItem(raw).prompt));
        checkItem(fam(`math-grade-items/${skill}: ${hit ? hit.name : 'unrecognised'}`), raw, verifiers);
      }
    }
  }
  const SCHOOL = gradeItems.SCHOOL || {};
  for (const skill of Object.keys(SCHOOL).filter((s) => !ONLY || s === ONLY)) {
    const verifiers = V.filter((v) => v.skills.includes(skill));
    for (let school = -1; school <= 12; school++) {
      for (const d of [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7]) {
        for (let i = 0; i < Math.ceil(MATH_SEEDS / 3); i++) {
          const raw = G[skill](makeRng(`audit:school:${skill}:${school}:${d}:${i}`), d, { avoid: new Set(), school });
          const hit = verifiers.find((vv) => vv.re.test(normalizeItem(raw).prompt));
          checkItem(fam(`math-school/${skill}: ${hit ? hit.name : 'unrecognised'}`), raw, verifiers);
        }
      }
    }
  }
}

/** A rendering offering fewer choices than its own family usually does lost one to a collision. */
function collapsedChoices() {
  for (const f of report.values()) {
    for (const it of f.renders) {
      if (it.choices.length < f.maxChoices) flag(f, 'choices-collapsed', `${it.choices.length} of ${f.maxChoices} choices survived de-duplication`, it);
    }
    f.renders = [];
  }
}

// ── reading: shared text checks ─────────────────────────────────────────────
const PROSE_CHECKS = [
  ['debris', /undefined|NaN|\bnull\b|\$\{|\[object|\{\{/],
  ['doubled-word', /\b(?!(?:had|that)\b)([A-Za-z]{2,}) \1\b/i],
  ['a-before-vowel', /\ba (?!one\b|uni|use|usu|eu|once\b)[aeiou]\w*/i],
  ['an-before-consonant', /\ban (?!hour|honest|h?onou?r)[b-df-hj-np-tv-z]\w*/i],
  ['a-before-number', /\ba (8\d*|11|18)\b/i],
  ['an-before-number', /\ban (?!8|11\b|18\b)\d+/i],
  ['spacing', / {2,}|\s[,.;:!?](?=\s|$)/],
  ['lower-after-stop', /[a-z]\. [a-z]/],
  // "by" is left out of the second place: "agreed on by", "closed in by" are English.
  ['stacked-prepositions', /\b(at|in|on|to|for|by|of|with|under) (at|on|under|in|of)\b/i],
  ['article-stack', /\b(the|a|an) (the|a|an)\b/i],
];
function proseFlags(text) {
  const out = [];
  for (const [code, re] of PROSE_CHECKS) {
    const m = String(text).match(re);
    if (m) out.push([code, m[0]]);
  }
  if (/^[a-z]/.test(String(text).trim()) && !/^(?:[a-z]+ )*[a-z]+$/.test(String(text).trim())) {
    // A choice that completes the prompt's sentence starts lower-case on purpose;
    // a sentence does not.
  }
  const opens = (String(text).match(/\(/g) || []).length;
  const shut = (String(text).match(/\)/g) || []).length;
  if (opens !== shut) out.push(['unbalanced-brackets', `${opens} ( vs ${shut} )`]);
  return out;
}

const squash = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
/** Every double-quoted phrase in a prompt or rationale that is meant to come from the passage. */
function quotesIn(text) {
  const out = [];
  // A quoted definition (used to mean "…") is the question's own words, not the passage's.
  for (const m of String(text).matchAll(/(mean(?:s|ing)? )?["“]([^"”]{3,})["”]/g)) if (!m[1]) out.push(m[2]);
  return out;
}
function quoteInPassage(q, passage) {
  const want = squash(q).replace(/^[\s.,;:]+|[\s.,;:]+$/g, '');
  return squash(passage).includes(want);
}

const NUMBER_WORDS = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'hundred', 'thousand'];

function checkReadingItem(f, it, opts = {}) {
  f.rendered++;
  if (SHOW && f.samples.length < SHOW) f.samples.push(it);
  const passage = it.passage || '';
  for (const [code, hit] of proseFlags(passage)) flag(f, `passage:${code}`, hit, it);
  for (const t of [it.prompt, it.answer, it.rationale]) for (const [code, hit] of proseFlags(t)) flag(f, code, hit, it);
  for (const c of it.choices || []) for (const [code, hit] of proseFlags(c)) if (!['spacing'].includes(code)) flag(f, `choice:${code}`, hit, it);
  if (it.format === 'multiple_choice') {
    if (it.rawChoices.length !== new Set(it.rawChoices).size) flag(f, 'duplicate-choices', it.rawChoices.join(' | '), it);
    if (!it.rawChoices.includes(it.answer)) flag(f, 'key-not-a-choice', it.answer, it);
    if (it.rawChoices.length < 4 && !opts.allowFewer) flag(f, 'too-few-choices', `${it.rawChoices.length} choices`, it);
  }
  if (passage && !opts.noQuotes) {
    for (const q of [...quotesIn(it.prompt), ...quotesIn(it.rationale)]) {
      if (q.includes('…') || q.includes('...')) continue;
      // A word put in quotes to name it ("narrower") is quoted from the passage
      // too, so the same rule applies.
      if (!quoteInPassage(q, passage)) flag(f, 'quote-not-in-passage', `"${q}"`, it);
    }
  }
  if (passage) {
    // A number the prompt or the key states is one the passage states.
    const unquoted = (t) => String(t).replace(/["“][^"”]*["”]/g, ' ');
    for (const t of [it.prompt, it.answer]) {
      for (const m of unquoted(t).matchAll(/\b(\d{1,4})\b/g)) {
        if (!new RegExp(`\\b${m[1]}\\b`).test(passage)) flag(f, 'number-not-in-passage', `${m[1]} in "${t.slice(0, 80)}"`, it);
      }
      // Number words only where they count something ("ten years later"), not
      // where they point at the text ("the final two sentences", "the two records").
      for (const m of unquoted(t).toLowerCase().matchAll(new RegExp(`\\b(${NUMBER_WORDS.join('|')}) (?=years|minutes|hours|days|weeks|months|seasons|kilometres|miles|times|percent|questions)`, 'g'))) {
        if (!new RegExp(`\\b${m[1]}\\b`, 'i').test(passage)) flag(f, 'number-not-in-passage', `"${m[1]}" in "${t.slice(0, 80)}"`, it);
      }
    }
  }
}

// ── reading: authored passages ──────────────────────────────────────────────
function auditPassages() {
  for (const file of ['passages', 'passages-2']) {
    const { PASSAGES } = load(file);
    for (const p of PASSAGES) {
      for (const q of p.questions) {
        if (ONLY && q.skill !== ONLY) continue;
        const it = {
          format: q.c ? 'multiple_choice' : 'type_in', prompt: q.p, answer: q.a, rationale: q.r,
          rawChoices: q.c || [], choices: q.c || [], passage: p.text,
        };
        checkReadingItem(fam(`${file}/${p.id}: ${q.skill}`), it);
      }
    }
  }
}

// ── reading: generated passages ─────────────────────────────────────────────
/**
 * Audit-only knowledge about where each subject of a field study can be counted,
 * written down independently of the slot tables so the slots cannot vouch for
 * themselves. Keyed by words in the rendered place.
 */
const HABITAT = {
  'reed warblers': /marsh|lake|quarry/,
  'freshwater mussels': /lake|quarry/,
  'ground beetles': /marsh|plateau|coast|orchard/,
  'wild bees': /plateau|orchard|marsh/,
  'brown trout': /lake|quarry/,
  'moss species': /plateau|quarry|coast|orchard/,
};
const PLACE_RE = /\b(?:at|At) (a salt marsh[^,.]*|a limestone plateau[^,.]*|a flooded quarry[^,.]*|a stretch of cold coastline[^,.]*|an abandoned orchard[^,.]*|a shallow lake[^,.]*)/g;
/** Causes that are weather, which a passage that says "the weather was shared" cannot use. */
const WEATHER_CAUSE = /spring arrived|ice lasted|drought|heatwave|storm/;

function auditPassageFamilies() {
  const PF = load('passage-families');
  const { entryToItem } = load('pool');
  const CONTEXT = (() => {
    // Rebuild the sense table from the rendered items is impossible, so read the
    // words the families use from the module source: every { word, sense, decoys }.
    const src = require('fs').readFileSync(path.join(CONTENT, 'passage-families.js'), 'utf8');
    const out = {};
    for (const m of src.matchAll(/\{ word: '([^']+)', sense: '([^']+)', decoys: \[([^\]]+)\] \}/g)) {
      out[m[1]] = { sense: m[2], decoys: [...m[3].matchAll(/'([^']+)'/g)].map((d) => d[1]) };
    }
    return out;
  })();
  for (const [skill, list] of Object.entries(PF.FAMILIES)) {
    if (ONLY && skill !== ONLY) continue;
    list.forEach((entry, i) => {
      const f = fam(`passage-families/${skill}[${i}]: ${entry.frame || ''}`.slice(0, 110));
      for (let n = 0; n < PASSAGE_SAMPLES; n++) {
        const built = entryToItem(makeRng(`audit:pf:${skill}:${i}:${n}`), entry, entry.d || 5);
        const raw = typeof entry.c === 'function' ? null : null;
        const it = {
          format: built.format, prompt: built.prompt, answer: built.answer, rationale: built.rationale,
          rawChoices: built.choices || [], choices: built.choices || [], passage: built.passage || '',
        };
        checkReadingItem(f, it);
        // Subject and site.
        const subject = Object.keys(HABITAT).find((s) => it.passage.includes(s));
        for (const m of it.passage.matchAll(PLACE_RE)) {
          if (subject && !HABITAT[subject].test(m[1])) flag(f, 'subject-cannot-live-there', `${subject} at ${m[1]}`, it);
        }
        if (/weather (?:was shared|system)/.test(it.passage) && WEATHER_CAUSE.test(it.passage)) {
          flag(f, 'weather-cause-contradiction', it.passage.match(WEATHER_CAUSE)[0], it);
        }
        // Vocabulary questions: one option carries the passage's sense.
        const word = (it.prompt.match(/"([a-z]+)"/) || [])[1];
        const cw = word && CONTEXT[word];
        if (cw) {
          if (/most nearly means/.test(it.prompt) && it.answer !== cw.sense) flag(f, 'vocab-key', `keyed "${it.answer}" for sense "${cw.sense}"`, it);
          if (/NOT/.test(it.prompt)) {
            const notSense = it.choices.filter((c) => c !== cw.sense);
            if (notSense.length > 1) flag(f, 'vocab-several-keys', `${notSense.length} options do not fit`, it);
          }
          if (/pairing/.test(it.prompt)) {
            const first = it.choices.filter((c) => c.startsWith(cw.sense));
            if (first.length !== 1 || !it.answer.startsWith(cw.sense)) flag(f, 'vocab-several-keys', first.join(' | '), it);
          }
        }
      }
    });
  }
}

// ── phonics ─────────────────────────────────────────────────────────────────
/** Audit-only facts about the words the phonics families use. */
const SILENT = { know: ['k', 'w'], write: ['w', 'e'], gnome: ['g', 'e'], lamb: ['b'], climb: ['b'], island: ['s'] };
const R_SOUND = { ar: '/ar/', or: '/or/', er: '/er/', ir: '/er/', ur: '/er/' };
const PREFIX_MEANS = { re: ['again'], un: ['not', 'the opposite of'], dis: ['not', 'the opposite of'], mis: ['wrongly'],
  pre: ['before'], sub: ['under'], inter: ['between'], trans: ['across'] };
function syllableType(syl) {
  if (/[aeiou][^aeiou]e$/.test(syl)) return 'vowel-consonant-e';
  if (/[aeiou]{2}|[aeiou][wy]$/.test(syl)) return 'vowel team';
  if (/[aeiou]$/.test(syl)) return 'open';
  return 'closed';
}

function phonicsRule(it, f) {
  const p = it.prompt; const key = it.answer; const ch = it.choices;
  let m = p.match(/^Which two letters make the (first|last) sound in "(\w+)"\?$/);
  if (m) {
    const at = m[1] === 'first' ? m[2].startsWith(key) : m[2].endsWith(key);
    if (!at) flag(f, 'rule', `"${key}" is not the ${m[1]} sound of ${m[2]}`, it);
    for (const c of ch) if (c !== key && m[2].includes(c)) flag(f, 'rule', `distractor "${c}" is also in ${m[2]}`, it);
    return;
  }
  m = p.match(/^In "(\w+)", which letters work together to make the (.+) sound\?$/);
  if (m) {
    if (!m[1].includes(key)) flag(f, 'rule', `"${key}" is not in ${m[1]}`, it);
    for (const c of ch) if (c !== key && m[1].includes(c)) flag(f, 'rule', `distractor "${c}" is also in ${m[1]}`, it);
    return;
  }
  m = p.match(/^In "(\w+)", which sound do the letters "(\w+)" make\?$/);
  if (m) {
    if (!m[1].includes(m[2]) || !key.startsWith(R_SOUND[m[2]])) flag(f, 'rule', `${m[2]} in ${m[1]} keyed ${key}`, it);
    if (ch.filter((c) => c.startsWith(R_SOUND[m[2]])).length !== 1) flag(f, 'rule', 'more than one option names the sound', it);
    return;
  }
  m = p.match(/^In "(\w+)", what does the final e do\?$/);
  if (m) { if (!m[1].endsWith('e') || !/own name/.test(key)) flag(f, 'rule', key, it); return; }
  m = p.match(/^Which letter in "(\w+)" is not pronounced\?$/);
  if (m) {
    const quiet = SILENT[m[1]] || [];
    if (!quiet.includes(key.toLowerCase())) flag(f, 'rule', `${key} keyed for ${m[1]}`, it);
    for (const c of ch) if (c !== key && quiet.includes(c.toLowerCase())) flag(f, 'rule', `distractor ${c} is also silent in ${m[1]}`, it);
    return;
  }
  m = p.match(/^What does the ending -(\w+) add to "(\w+)"\?$/);
  if (m) {
    const ending = m[1];
    if (/^e?s$/.test(ending) && !/plural/.test(key)) flag(f, 'rule', key, it);
    if (ending === 'ed' && key !== 'past tense') flag(f, 'rule', key, it);
    const pastLike = ch.filter((c) => /past tense/.test(c));
    if (pastLike.length > 1) flag(f, 'rule', 'two options both say past tense', it);
    if (/\(|\b(walking|walked)\b/.test(key) && new RegExp(`\\b${m[2]}`).test(key)) flag(f, 'rule', 'the key gives the word away', it);
    return;
  }
  m = p.match(/^What does the prefix "(\w+)-" mean in "(\w+)"\?$/);
  if (m) {
    const means = PREFIX_MEANS[m[1]] || [];
    if (!m[2].startsWith(m[1])) flag(f, 'rule', `${m[2]} does not start with ${m[1]}`, it);
    if (!means.includes(key)) flag(f, 'rule', `${m[1]}- keyed "${key}"`, it);
    for (const c of ch) if (c !== key && (means.includes(c) || means.some((x) => c.startsWith(x)))) flag(f, 'rule', `distractor "${c}" is also a meaning of ${m[1]}-`, it);
    return;
  }
  m = p.match(/^Which word contains the root "(\w+)", meaning "(.+)"\?$/);
  if (m) {
    const having = ch.filter((c) => c.includes(m[1]));
    if (having.length !== 1 || having[0] !== key) flag(f, 'rule', `${having.length} options contain ${m[1]}: ${having.join(', ')}`, it);
    return;
  }
  m = p.match(/^Which letters are in the set named by "([A-Z])-([A-Z])"\?$/);
  if (m) { if (key !== `${m[1]} through ${m[2]}`) flag(f, 'rule', key, it); return; }
  m = p.match(/^Which type of syllable is "(\w+)"(?: in "([\w-]+)")?\?$/);
  if (m) {
    if (m[1].includes('-')) flag(f, 'rule', 'more than one syllable asked about', it);
    if (m[2] && !m[2].split('-').includes(m[1])) flag(f, 'rule', `${m[1]} is not a syllable of ${m[2]}`, it);
    if (syllableType(m[1]) !== key) flag(f, 'rule', `${m[1]} keyed ${key}, is ${syllableType(m[1])}`, it);
    return;
  }
  // Kindergarten (standards check, 2026-10-24): RF.K.2d-e and RF.K.3b.
  m = p.match(/^Which vowel sound do you hear in the middle of "([a-z])([aeiou])([a-z])"\?$/);
  if (m) {
    if (!key.startsWith(`short ${m[2]},`)) flag(f, 'rule', `${m[1]}${m[2]}${m[3]} keyed "${key}"`, it);
    if (ch.filter((c) => c.startsWith(`short ${m[2]},`)).length !== 1) flag(f, 'rule', 'the vowel is named by more than one option', it);
    return;
  }
  m = p.match(/^Which word has the same middle sound as "([a-z])([aeiou])([a-z])"\?$/);
  if (m) {
    const word = m[1] + m[2] + m[3];
    const sharing = ch.filter((c) => /^[a-z][aeiou][a-z]$/.test(c) && c[1] === m[2] && c !== word);
    if (sharing.length !== 1 || sharing[0] !== key) flag(f, 'rule', `options sharing the ${m[2]} sound: ${sharing.join(', ') || 'none'}; keyed ${key}`, it);
    return;
  }
  if (p === 'Which word has a long vowel sound because it ends in a silent e?') {
    if (!/[aeiou][^aeiou]e$/.test(key)) flag(f, 'rule', `${key} does not end vowel-consonant-e`, it);
    if (ch.filter((c) => /e$/.test(c)).length !== 1) flag(f, 'rule', 'more than one option ends in e', it);
    return;
  }
  m = p.match(/^Put the sounds together: \/([a-z])\/ \/([a-z])\/ \/([a-z])\/\. What word do they make\?$/);
  if (m) {
    const word = m[1] + m[2] + m[3];
    if (key !== word) flag(f, 'rule', `the sounds make "${word}", keyed "${key}"`, it);
    if (/[ck]/.test(word)) flag(f, 'rule', 'c and k share a sound, so the letters do not name the sounds', it);
    if (ch.filter((c) => c === word).length !== 1) flag(f, 'rule', 'the word is offered more or less than once', it);
    return;
  }
  m = p.match(/^Change the first sound in "([a-z])([a-z]+)" to \/([a-z])\/\. What new word do you make\?$/);
  if (m) {
    if (key !== m[3] + m[2]) flag(f, 'rule', `keyed "${key}", the change makes "${m[3]}${m[2]}"`, it);
    if (ch.filter((c) => c.slice(1) === m[2]).length !== 1) flag(f, 'rule', 'another option keeps the same ending', it);
    return;
  }
  flag(f, 'no-verifier', 'no rule check recognises this prompt', it);
}

function auditPhonics() {
  if (ONLY && ONLY !== 'phonics') return;
  const mod = load('phonics-families');
  const items = [];
  if (mod.FAMILIES) {
    mod.FAMILIES.phonics.forEach((entry, i) => {
      const names = Object.keys(entry.slots);
      const lists = names.map((n) => entry.slots[n]);
      const total = lists.reduce((n, l) => n * l.length, 1);
      for (let k = 0; k < total; k++) {
        const s = {}; let r = k;
        names.forEach((n, j) => { s[n] = lists[j][r % lists[j].length]; r = Math.floor(r / lists[j].length); });
        const c = entry.c(s).map(String);
        items.push([`phonics[${i}]: ${entry.frame}`, { format: 'multiple_choice', prompt: entry.p(s), answer: String(entry.a(s)), rationale: entry.r(s), rawChoices: c, choices: [...new Set(c)] }]);
      }
    });
  } else {
    // An older file that does not export its families: sample the generator.
    for (let i = 0; i < 3000; i++) {
      const raw = mod.GENERATORS.phonics(makeRng(`audit:ph:${i}`), 1 + (i % 10), {});
      items.push([`phonics: ${raw.family_frame}`, { format: raw.format, prompt: raw.prompt, answer: raw.answer, rationale: raw.rationale, rawChoices: raw.choices || [], choices: raw.choices || [] }]);
    }
  }
  for (const [key, it] of items) {
    const f = fam(key);
    checkReadingItem(f, it, { noQuotes: true });
    phonicsRule(it, f);
  }
}

// ── grade-fit English and Reading skills (content/english-grade-items.js) ──
// The generated families (letters, rhymes, first sounds, syllables, words in a
// sentence, short stories and fact texts) are re-derived from what the learner
// sees with rules written here; the authored items are held to REVIEWED_ENGLISH,
// the key each was fact-checked with when it was written (2026-10-24). A new or
// edited authored item is flagged until it is checked and recorded there.
const REVIEWED_ENGLISH = {
  early_literacy: {
    "In English, which way do we read the words on a page?": "from left to right",
    "What is the front of a book called?": "the cover",
    "Who writes the words in a book?": "the author",
    "Who draws the pictures in a picture book?": "the illustrator",
    "What is the name of a book called?": "the title",
  },
  literary_analysis: {
    "Which sentence uses a simile?": "Her smile was as bright as the sun.",
    "Which sentence uses personification?": "The wind whispered through the trees.",
    "What is the setting of a story?": "when and where it takes place",
    "\"My backpack weighs a thousand pounds.\" This sentence is an example of": "hyperbole",
    "Which line uses alliteration?": "Seven silly snakes slid south.",
    "A story is told by a narrator who uses \"I\" and takes part in the events. This is": "first-person point of view",
    "Which word is an example of onomatopoeia?": "buzz",
    "What is the theme of a story?": "the central message or insight about life it conveys",
    "A sailor alone on a raft struggles to survive a storm. Which type of conflict is this?": "character versus nature",
    "An author gives hints early in a story about what will happen later. This technique is called": "foreshadowing",
    "A poem with the rhyme pattern AABB is made of": "pairs of rhyming lines",
    "In a play, the audience knows a character is about to walk into a trap, but the character does not. This is": "dramatic irony",
    "A fire station burns down. This is an example of": "situational irony",
    "Which phrase is an oxymoron?": "deafening silence",
    "How many lines does a sonnet traditionally have?": "14",
    "A Shakespearean (English) sonnet ends with": "a rhyming couplet",
    "A character alone on stage speaks his thoughts aloud for the audience. This speech is": "a soliloquy",
    "In classical tragedy, the hero's fatal error or flaw is called": "hamartia",
    "\"I have a dream that... I have a dream that... I have a dream that...\" The repetition at the start of each clause is": "anaphora",
    "A sentence of poetry that runs on past the end of a line without a pause is an example of": "enjambment",
    "A novel told entirely through letters is called": "an epistolary novel",
    "A novel that follows a young protagonist's growth into adulthood is a": "bildungsroman",
    "\"Shall I compare thee to a summer's day?\" opens a Shakespeare sonnet. The meter of that sonnet is": "iambic pentameter",
    "\"All hands on deck\" uses a part (hands) to stand for the whole (sailors). This figure is": "synecdoche",
    "\"The White House announced a new policy\" uses a building to stand for the president's staff. This figure is": "metonymy",
    "\"Ask not what your country can do for you; ask what you can do for your country.\" The reversed structure is": "chiasmus",
    "\"She was not unaware of the danger\" makes its point by denying the opposite. This figure is": "litotes",
    "A third-person narration that slips into a character's own idiom and thoughts without quotation marks is called": "free indirect discourse",
    "An epic that opens in the middle of the action, as the Iliad does, begins": "in medias res",
    "In a Petrarchan sonnet, the octave is followed by": "a sestet",
    "The meter of Homer's Iliad and Virgil's Aeneid is": "dactylic hexameter",
    "In Aristotle's Poetics, the purging of pity and fear that tragedy brings about is": "catharsis",
    "Viktor Shklovsky argued that art makes the familiar strange so we perceive it anew. His term for this is": "defamiliarization",
    "Wimsatt and Beardsley called judging a poem by what its author meant to do": "the intentional fallacy",
    "Which critic is most associated with New Historicism?": "Stephen Greenblatt",
    "Roland Barthes's 1967 essay arguing that a text's meaning lies with its reader rather than its writer is": "\"The Death of the Author\"",
    "Mikhail Bakhtin's term for the many social voices and registers present within a novel is": "heteroglossia",
    "Edward Said's 1978 study of how the West represented \"the East\" is": "Orientalism",
    "In Gérard Genette's narratology, an analepsis is": "a narration of events earlier than the present point of the story",
    "Sandra Gilbert and Susan Gubar's 1979 study of nineteenth-century women writers is": "The Madwoman in the Attic",
    "Harold Bloom's theory that poets write in struggle against their strong predecessors is called": "the anxiety of influence",
    "Julia Kristeva coined a term for the way every text is built from and responds to other texts. It is": "intertextuality",
    "Hans Robert Jauss's reception theory describes the assumptions a work's first readers bring to it as": "the horizon of expectations",
  },
  academic_writing: {
    // Grade 4 (standards check, 2026-10-24): RI.4.6 firsthand and secondhand
    // accounts; W.4.8 a list of sources; facts are what can be checked.
    'Which sentence states a fact rather than an opinion?': 'A week has seven days.',
    'A firsthand account of an event is written by': 'someone who was there and saw it happen',
    'When you write a report, why do you list the books and websites you used?': 'so readers know where the information came from',
    "Which statement is an opinion rather than a fact?": "Summer is the best season of the year.",
    "A diary written by a soldier during a war is": "a primary source",
    "Which is the strongest thesis statement for an essay?": "School should start later because teenagers need more sleep to learn well.",
    "Using another writer's words or ideas without giving them credit is called": "plagiarism",
    "Which source is usually the most reliable for a science report?": "an article in a peer-reviewed journal",
    "In an argument essay, a counterclaim is": "an opposing point of view that the writer answers",
    "Which logical fallacy attacks the person making an argument instead of the argument?": "ad hominem",
    "\"Either we ban all cars or the city will choke on smog.\" This argument is": "a false dilemma",
    "Which in-text citation follows APA style?": "(Nguyen, 2019)",
    "Which in-text citation follows MLA style?": "(Okafor 112)",
    "A study finds that towns with more ice-cream sales have more drownings. The best conclusion is that": "the two are correlated, perhaps both rising in hot weather, but this does not show one causes the other",
    "Which wording is the most appropriately hedged for an academic claim from one small study?": "These results suggest that the method may improve recall.",
    "The main purpose of an abstract at the start of a research article is to": "summarize the question, methods, results and conclusion briefly",
    "The main job of a literature review is to": "survey and synthesize existing research to show where a new study fits",
    "In Aristotle's rhetoric, an appeal based on the speaker's credibility and character is": "ethos",
    "In the Toulmin model of argument, the assumption that connects the evidence to the claim is the": "warrant",
    "A researcher interviews twelve nurses and analyses recurring themes in what they say. This is": "a qualitative method",
    "Which research question is the most focused and researchable?": "How does daily phone use relate to sleep duration among first-year university students?",
    "A measuring instrument that gives consistent results each time it is used is": "reliable",
    "The standard structure of many scientific articles is abbreviated IMRaD. It stands for": "Introduction, Methods, Results and Discussion",
    "Before human participants take part in a university study, researchers normally need": "approval from an ethics board and the participants' informed consent",
    "Using several methods or data sources to cross-check a finding is called": "triangulation",
    "In double-blind peer review,": "neither the authors nor the reviewers know each other's identities",
    "A DOI attached to a journal article is": "a persistent identifier that links to the article",
    "The h-index of a scholar is 12. This means": "12 of their papers have each been cited at least 12 times",
    "Publicly registering a study's hypotheses and analysis plan before collecting data is called": "preregistration",
    "Trying many analyses and reporting only the ones that reach statistical significance is": "p-hacking",
    "A journal's impact factor measures": "the average number of recent citations to the articles it published",
    "Under the widely used ICMJE criteria, which contribution alone does not qualify someone as an author?": "acquiring the funding for the project",
    "The \"replication crisis\" refers to": "the finding that many published results could not be reproduced by later studies",
    "An editor reconstructing the text closest to an author's intention by comparing surviving versions is practising": "textual criticism",
    "In a research grant proposal, the \"specific aims\" section mainly": "states the concrete objectives the project will achieve and why they matter",
  },
  linguistics: {
    "How many morphemes are in the word \"unhappiness\"?": "3",
    "\"Brunch\" (breakfast + lunch) was formed by": "blending",
    "\"Laser\" (light amplification by stimulated emission of radiation) is": "an acronym",
    "A morpheme that cannot stand alone as a word, such as \"-ed\", is": "a bound morpheme",
    "Which pair of words is a minimal pair?": "ship and sheep",
    "Which IPA symbol represents the first sound of \"shoe\"?": "ʃ",
    "The sounds /p/, /b/ and /m/ are all made with both lips. Their place of articulation is": "bilabial",
    "The difference between /t/ and /d/ is mainly": "voicing",
    "A grammar that describes how people actually speak, without judging it, is": "descriptive",
    "A contact language with no native speakers, used between groups who share no language, is": "a pidgin",
    "Switching between two languages within one conversation is called": "code-switching",
    "English belongs to which language family?": "Indo-European",
    "The Great Vowel Shift changed the pronunciation of English long vowels during": "the late Middle English and Early Modern English period",
    "The [pʰ] in \"pin\" and the [p] in \"spin\" are, in English,": "allophones of one phoneme",
    "The Norman Conquest of 1066 most strongly affected English by": "adding a large French vocabulary",
    "The idea that the language we speak shapes how we think is usually called": "the Sapir-Whorf hypothesis",
    "The claim that there is an age window after which a first language is hard to acquire fully is": "the critical period hypothesis",
    "Words like \"here\", \"now\" and \"you\", whose reference depends on the context of speaking, are examples of": "deixis",
    "\"The horse raced past the barn fell.\" Readers stumble on this sentence because it is": "a garden-path sentence",
    "A says \"Did you finish the report?\" and B replies \"I finished the introduction.\" B implies the rest is not done. This inference is": "a conversational implicature",
    "Which of these is one of Grice's conversational maxims?": "Quantity: be as informative as required, and no more",
    "J. L. Austin called utterances such as \"I promise to come\" that perform an act in being said": "performatives",
    "William Labov's New York department-store study showed that pronouncing /r/ after vowels": "varied with the social status of the store",
    "A language that builds words by stringing together many distinct affixes, each with one meaning, as Turkish does, is": "agglutinative",
    "In an ergative-absolutive language such as Basque, the subject of an intransitive verb is marked like": "the object of a transitive verb",
    "Noam Chomsky's proposal of an innate, species-wide set of principles underlying all human languages is": "universal grammar",
    "In corpus linguistics, a concordance is": "a list of every occurrence of a word shown in its surrounding context",
  },
};
const SYLLABLE_COUNT = {
  cat: 1, dog: 1, sun: 1, ball: 1, tree: 1, apple: 2, tiger: 2, rabbit: 2, pencil: 2, monkey: 2, table: 2, zebra: 2,
  banana: 3, butterfly: 3, elephant: 3, dinosaur: 3, umbrella: 3, kangaroo: 3, computer: 3, caterpillar: 4,
  watermelon: 4, alligator: 4, helicopter: 4,
};
/** The rhyming part of a short word: its last vowel and what follows, keeping a final silent e. */
function rimeOf(w) {
  const silentE = /[^aeiou]e$/.test(w);
  const core = silentE ? w.slice(0, -1) : w;
  const m = core.match(/[aeiou]+[^aeiou]*$/);
  return (m ? m[0] : core) + (silentE ? 'e' : '');
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const STORY_RE = /^(\w+) went to the (\w+) with (his|her) ([\w ]+)\. First, they (.+?)\. Then they (.+?)\. Last, they (.+?)\. \1 felt (\w+) because (.+)\.$/;
const FACTS_RE = /^([A-Z][\w ]+?) (live [^.]+)\. They (eat [^.]+)\. (.+)$/;

function gradeFitRule(it) {
  const p = it.prompt;
  let m;
  if ((m = p.match(/^Which word rhymes with "(\w+)"\?$/))) {
    const r = rimeOf(m[1]);
    const rhymers = it.choices.filter((c) => c !== m[1] && rimeOf(c) === r);
    return rhymers.length === 1 && rhymers[0] === it.answer ? null : `rhymes: ${rhymers.join(', ') || 'none'}`;
  }
  if ((m = p.match(/^Which word begins with the same sound as "(\w+)"\?$/))) {
    const w = m[1];
    const plain = (x) => /^[bdfjlmnprstvz][^h]/.test(x);
    if (!plain(w) || it.choices.some((c) => !plain(c))) return 'a word without a plain single-consonant start';
    const same = it.choices.filter((c) => c[0] === w[0]);
    return same.length === 1 && same[0] === it.answer ? null : `same first sound: ${same.join(', ') || 'none'}`;
  }
  if ((m = p.match(/^Which letter comes right (after|before) "([A-Z])" in the alphabet\?$/))) {
    const want = ALPHABET[ALPHABET.indexOf(m[2]) + (m[1] === 'after' ? 1 : -1)];
    return want && it.answer === want ? null : `keyed ${it.answer}, want ${want}`;
  }
  if ((m = p.match(/^Which lowercase letter goes with the capital letter "([A-Z])"\?$/))) return it.answer === m[1].toLowerCase() ? null : `keyed ${it.answer}`;
  if ((m = p.match(/^Which letter is just before "([A-Z])" when you say the ABCs\?$/))) {
    const want = ALPHABET[ALPHABET.indexOf(m[1]) - 1];
    return want && it.answer === want && it.choices.filter((c) => c === want).length === 1 ? null : `keyed ${it.answer}, want ${want}`;
  }
  if ((m = p.match(/^Find the capital letter for the small letter "([a-z])"\.$/))) {
    const want = m[1].toUpperCase();
    return it.answer === want && it.choices.filter((c) => c.toUpperCase() === want).length === 1 ? null : `keyed ${it.answer}, want ${want}`;
  }
  if ((m = p.match(/^Which word starts with the letter "([a-z])"\?$/))) {
    const same = it.choices.filter((c) => c[0] === m[1]);
    return same.length === 1 && same[0] === it.answer ? null : `starting with ${m[1]}: ${same.join(', ') || 'none'}`;
  }
  if ((m = p.match(/^Clap the word "(\w+)"\. How many syllables does it have\?$/))) {
    return SYLLABLE_COUNT[m[1]] != null && String(SYLLABLE_COUNT[m[1]]) === it.answer ? null : `keyed ${it.answer}, table says ${SYLLABLE_COUNT[m[1]]}`;
  }
  if (/^Which of these letters is a vowel\?$/.test(p)) {
    const v = it.choices.filter((c) => /^[aeiou]$/.test(c));
    return v.length === 1 && v[0] === it.answer ? null : `vowels offered: ${v.join(', ')}`;
  }
  if ((m = p.match(/^How many words are in this sentence\? "(.+)"$/))) return String(m[1].trim().split(/\s+/).length) === it.answer ? null : `keyed ${it.answer}`;
  if (it.passage && (m = it.passage.match(STORY_RE))) {
    const [, name, place, poss, rel, a1, a2, a3, feel, reason] = m;
    const want = {
      [`Who went to the ${place} with ${name}?`]: `${poss} ${rel}`,
      [`Where did ${name} go?`]: `to the ${place}`,
      'What did they do first?': a1,
      'What did they do second?': a2,
      'What did they do last?': a3,
      [`How did ${name} feel at the end?`]: feel,
      [`Why did ${name} feel ${feel}?`]: reason,
      'What is the story mostly about?': `a trip to the ${place}`,
    }[p];
    if (want === undefined) return 'story question not recognised';
    return it.answer === want ? null : `keyed "${it.answer}", the story says "${want}"`;
  }
  if (it.passage && (m = it.passage.match(FACTS_RE))) {
    const [, animal, home, food, extra] = m;
    const a = animal.toLowerCase();
    const want = {
      [`According to the text, what do ${a} eat?`]: food.replace(/^eat /, ''),
      [`According to the text, where do ${a} live?`]: home.replace(/^live /, ''),
      'What is this text mostly about?': a,
      'Which fact is in the text?': extra,
    }[p];
    if (want === undefined) return 'fact-text question not recognised';
    return it.answer === want ? null : `keyed "${it.answer}", the text says "${want}"`;
  }
  return undefined;
}

function auditGradeFitEnglish() {
  let mod;
  // A content folder from before this skill set (--content=backup) has no file
  // to audit; anything else that stops it loading is a failure, not a skip.
  try { mod = load('english-grade-items'); } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && /english-grade-items/.test(err.message)) return;
    throw err;
  }
  const reviewedKey = (skill, prompt) => (REVIEWED_ENGLISH[skill] || {})[prompt];
  for (const skill of Object.keys(mod.GENERATORS)) {
    if (ONLY && ONLY !== skill) continue;
    // Authored entries, every one, against the record.
    for (const e of (mod.POOLS[skill] || [])) {
      if (typeof e.p === 'function') continue;
      const it = { format: 'multiple_choice', prompt: e.p, answer: String(e.a), rationale: e.r, rawChoices: e.c.map(String), choices: e.c.map(String) };
      const f = fam(`english-grade-items/${skill}: authored`);
      checkReadingItem(f, it, { noQuotes: true });
      const k = reviewedKey(skill, e.p);
      if (k === undefined) flag(f, 'unreviewed', 'not in REVIEWED_ENGLISH: fact-check it and record its key', it);
      else if (k !== it.answer) flag(f, 'wrong-key', `keyed "${it.answer}", reviewed "${k}"`, it);
      if (!it.rationale || it.rationale.length < 12) flag(f, 'no-rationale', it.rationale || '', it);
    }
    // Every rendering the generator serves, across the whole difficulty scale.
    for (let d = 1; d <= 10; d++) {
      for (let i = 0; i < 300; i++) {
        const raw = mod.GENERATORS[skill](makeRng(`audit:grade-fit:${skill}:${d}:${i}`), d, { avoid: new Set() });
        const it = { format: raw.format || 'multiple_choice', prompt: raw.prompt, answer: String(raw.answer), rationale: raw.rationale || '', passage: raw.passage,
          rawChoices: (raw.choices || []).map(String), choices: [...new Set((raw.choices || []).map(String))] };
        const rule = gradeFitRule(it);
        const reviewed = reviewedKey(skill, it.prompt);
        const f = fam(`english-grade-items/${skill}: ${rule !== undefined ? (it.passage ? 'passage' : it.prompt.split(/[?"]/)[0].slice(0, 32)) : 'authored'}`);
        checkReadingItem(f, it, { noQuotes: true });
        if (it.format !== 'multiple_choice') {
          if (!grade(it, it.answer).correct) flag(f, 'key-fails-grading', it.answer, it);
          if (it.choices.length) flag(f, 'stray-choices', '', it);
        }
        if (rule) flag(f, 'wrong-key', rule, it);
        else if (rule === undefined) {
          if (reviewed === undefined) flag(f, 'no-verifier', 'no rule recognises this item and it is not in REVIEWED_ENGLISH', it);
          else if (reviewed !== it.answer) flag(f, 'wrong-key', `keyed "${it.answer}", reviewed "${reviewed}"`, it);
        }
      }
    }
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
const started = Date.now();
const PHONICS_SKILLS = ['phonics'];
const READING_SKILLS = ['main_idea', 'inference', 'author_purpose', 'detail_support', 'vocab_context'];
if (!ONLY || !PHONICS_SKILLS.concat(READING_SKILLS).includes(ONLY)) auditMath();
collapsedChoices();
if (!ONLY || PHONICS_SKILLS.includes(ONLY)) auditPhonics();
if (!ONLY || READING_SKILLS.includes(ONLY)) { auditPassages(); auditPassageFamilies(); }
auditGradeFitEnglish();

let renderings = 0; let problems = 0;
const bySource = new Map();
for (const [key, f] of report) {
  renderings += f.rendered;
  const src = key.split(/[/:[]/)[0];
  const row = bySource.get(src) || { families: 0, flagged: 0, rendered: 0 };
  row.families++; row.rendered += f.rendered;
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

console.log('\nMath and Reading template audit');
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
      else console.log(`        key: ${ex.answer}`);
    }
  }
}

if (problems) {
  console.log(`\n${problems} flags in ${flagged.length} families.`);
  process.exit(1);
}
console.log('\nClean: every rendering passed.');
