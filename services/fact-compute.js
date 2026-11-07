/**
 * Compute what can be computed (brief fact-100, docs/FACT-100.md). Build time only, behind FACT_COMPUTE=on (default off); nothing live calls this yet.
 *
 * The code pass (services/fact-code-checks.js) reads prose with regular expressions and stays silent on what it cannot parse. This layer splits the job differently:
 *   1. a cheap model TRANSCRIBES what the lesson asserts into a small statement language (it is told to copy, never to correct, and it decides nothing);
 *   2. a second cheap call answers each graded check with an EXPRESSION, the key hidden (a program works out the value, so the model's arithmetic is never trusted);
 *   3. tools/fact-checkers/compute.py works every statement out with SymPy, no model involved. "false" is a recomputed disagreement; what it cannot parse is "unknown", silence.
 *
 * What this can guarantee: a statement that was transcribed and recomputed is right, for what was transcribed. What it cannot: that the transcription is faithful, or that everything was transcribed.
 * So a "false" is a flag for repair (the transcription may be at fault), and a level is only "computed" for the statements listed.
 *   check({ context, blocks, checks, call }) -> { flags, statements, results, cost, ms }
 */
const { spawn } = require('child_process');
const path = require('path');

function isOn() { return String(process.env.FACT_COMPUTE || '').toLowerCase() === 'on'; }

const TYPES = `equal {lhs, rhs, approx?}: two NUMBER expressions are the same, no letters: "(41 - 5) / 6" and "6". Set approx true when the lesson rounds ("about", "≈").
identity {lhs, rhs}: a general rule that holds for EVERY value of its letters: a(b + c) = ab + ac. An equation to solve like 4x - y = 7 is NOT an identity: never list it alone; it only appears inside solve, system, inequality or equivalent.
compare {a, op, b}: a numeric comparison, op one of < > <= >=.
substitute {expr, values: {x: "2"}, result}: expr at those values is result.
solve {equation, var, solutions: []}: the lesson says these are ALL the real solutions of the equation.
system {equations: [], solution: {x: "3", y: "2"}}: the lesson's solution of a system.
inequality {inequality, var, solution}: the lesson says this inequality's solution is this (for example "x > 2", "2 < x <= 5", "x < 1 or x > 3").
equivalent {a, b, var}: one step of solving ONE equation in ONE letter: a becomes b, with the same solutions. Steps that combine two equations go in system, not here.
derivative {expr, var, result}. antiderivative {expr, var, result}. integral {expr, var, lower, upper, result}. limit {expr, var, to, result, dir?}.
factor {expr, result}: expr equals this factored or expanded form.
percent {percent, of, result}: percent% of "of" is result.
convert {value, from, to, result}: a unit conversion. Units: m cm mm km in ft yd mi s min h day g kg mg lb oz L mL gal cup.`;

const TRANSCRIBE_SYSTEM = `You copy the mathematics a lesson asserts into a strict statement language, so a program can recompute it. You do not check anything and you never correct anything: if the lesson says 2 + 2 = 5, you write exactly that, lhs "2 + 2", rhs "5". A program decides what is right.

List every assertion a calculation can settle:
- every calculation, sum, product, fraction, percent, rate, unit conversion and table value computed by a stated rule;
- every step of every worked example, one statement a step (an "equivalent" for each change to an equation);
- every general rule or formula written in symbols (type identity), or in words that plainly mean a formula ("the slope is rise over run" has no letters to test, skip it; "a^(m/n) is the nth root of a raised to the m" becomes identity lhs "a^(m/n)" rhs "root(a, n)^m");
- every value given for a function defined in the lesson: expand it (for s(t) = t^2, "s(3) = 9" is substitute expr "t^2" values t 3 result 9);
- what a graded check's rationale or key states as a calculation.

Do not list: wrong options, trap text, deliberately wrong examples, words with no number or symbol to compute, made-up scenario details that are not calculated, or anything marked as an error.

Expressions: plain math with * ^ / ( ), letters for variables, sqrt root(a, n) abs log ln exp sin cos tan pi e oo. No words, no units, no equals signs inside lhs or rhs, no dollar signs. Write 1/2 not "half". Names of more than three letters are not allowed.

Statement types:
${TYPES}

If the lesson says an assertion FAILS ("x = 0 does not work", "19 ≤ 13, false"), write the assertion and set negated true.

For each statement give: where ("block N" or "check N"), quote (the lesson's exact words for this assertion, short), type, and that type's fields as strings. Empty list when the lesson has nothing to compute.`;

const BLIND_SYSTEM = `You get a lesson's graded questions, with the answers hidden. For each question whose answer a program could calculate (arithmetic, algebra, functions, equations, inequalities, percent, rates, conversions, calculus), write the calculation, using only what the question says. Do not state the answer yourself: write what would produce it.

Give for each: check (its number), and one of:
  value: an expression that evaluates to the answer, like "27^(2/3)" or "(50 - 32) / (5 - 3)";
  solve: {equation, var}: the answer is the real solution of this equation;
  inequality: {inequality, var}: the answer is the solution set of this inequality.
Plain math with * ^ / ( ), letters for variables, sqrt root(a, n) abs log ln exp sin cos tan pi e. No words or units inside an expression.
Skip a question a calculation cannot settle (a definition, a word meaning, a choice of method). Most language and concept questions are skipped; that is fine.`;

const STATEMENT = {
  type: 'object',
  required: ['where', 'quote', 'type'],
  properties: {
    where: { type: 'string' }, quote: { type: 'string' }, type: { type: 'string' },
    lhs: { type: 'string' }, rhs: { type: 'string' }, approx: { type: 'boolean' }, negated: { type: 'boolean' }, a: { type: 'string' }, op: { type: 'string' }, b: { type: 'string' }, expr: { type: 'string' }, values: { type: 'object' }, result: { type: 'string' },
    equation: { type: 'string' }, var: { type: 'string' }, solutions: { type: 'array', items: { type: 'string' } }, equations: { type: 'array', items: { type: 'string' } }, solution: {}, inequality: { type: 'string' },
    lower: { type: 'string' }, upper: { type: 'string' }, to: { type: 'string' }, dir: { type: 'string' }, percent: { type: 'string' }, of: { type: 'string' }, value: { type: 'string' }, from: { type: 'string' },
  },
};
const TRANSCRIBE_SCHEMA = { type: 'object', required: ['statements'], properties: { statements: { type: 'array', items: STATEMENT } } };
const BLIND_SCHEMA = { type: 'object', required: ['answers'], properties: { answers: { type: 'array', items: { type: 'object', required: ['check'], properties: { check: { type: 'integer' }, value: { type: 'string' }, solve: { type: 'object', properties: { equation: { type: 'string' }, var: { type: 'string' } } }, inequality: { type: 'object', properties: { inequality: { type: 'string' }, var: { type: 'string' } } } } } } } };

const render = ({ context, blocks, checks }) => [
  typeof context === 'string' ? context : (context && context.text) || '',
  '',
  ...blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`),
  ...checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, options: c.options, choices: c.choices, answer: c.answer, accepts: c.accepts, rationale: c.rationale, hint: c.hint })}`),
].join('\n');
const renderBlind = ({ context, checks }) => [
  typeof context === 'string' ? context : (context && context.text) || '',
  '',
  ...checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, options: c.options, choices: c.choices })}`),
].join('\n');

/** Runs statements through SymPy; one short-lived process per level. */
function compute(statements) {
  if (!statements.length) return Promise.resolve([]);
  const py = process.env.FACT_COMPUTE_PYTHON || 'python';
  const script = path.join(__dirname, '..', 'tools', 'fact-checkers', 'compute.py');
  return new Promise((resolve) => {
    const p = spawn(py, ['-I', script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { p.kill(); resolve(statements.map((s) => ({ id: s.id, verdict: 'unknown', detail: 'timeout' }))); }, Number(process.env.FACT_COMPUTE_TIMEOUT_MS || 60000));
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => { clearTimeout(timer); resolve(statements.map((s) => ({ id: s.id, verdict: 'unknown', detail: 'no python' }))); });
    p.on('close', () => { clearTimeout(timer); try { resolve(JSON.parse(out).results); } catch { resolve(statements.map((s) => ({ id: s.id, verdict: 'unknown', detail: 'bad output' }))); } });
    p.stdin.end(JSON.stringify({ statements }));
  });
}

/** The text of a check's key. */
function keyText(c) {
  const list = c.choices || c.options;
  if (typeof c.answer === 'number' && Array.isArray(list)) return String(list[c.answer] ?? '');
  return c.answer === undefined || c.answer === null ? '' : String(c.answer);
}
const optionTexts = (c) => (c.choices || c.options || []).map((o) => (typeof o === 'string' ? o : (o && (o.text || o.label)) || ''));
const numbersIn = (t) => (String(t).replace(/[−–]/g, '-').replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []).map((n) => (n.includes('/') ? Number(n.split('/')[0]) / Number(n.split('/')[1]) : Number(n)));

/**
 * The blind answers: value statements are computed by SymPy as "equal" against each number in the key; when the key's text has no number matching, and some other option does, it is a flag.
 * The value itself is computed with a throwaway substitute in compute.py by asking "is it equal to this candidate?", so no model number is taken on trust.
 */
async function blindChecks(answers, checks) {
  const stmts = [];
  for (const a of answers) {
    const c = checks.find((x) => x.index === Number(a.check));
    if (!c) continue;
    const key = keyText(c);
    if (!key) continue;
    const opts = optionTexts(c);
    const candidates = [{ text: key, isKey: true }, ...opts.filter((o) => o && o !== key).map((text) => ({ text, isKey: false }))];
    candidates.forEach((cand, n) => {
      numbersIn(cand.text).slice(0, 6).forEach((num, m) => {
        if (a.value) stmts.push({ id: `${a.check}:${n}:${m}`, type: 'equal', lhs: a.value, rhs: String(num), approx: /\./.test(String(num)), check: Number(a.check), isKey: cand.isKey, text: cand.text });
        else if (a.solve && a.solve.equation) stmts.push({ id: `${a.check}:${n}:${m}`, type: 'solve', equation: a.solve.equation, var: a.solve.var || 'x', solutions: [String(num)], check: Number(a.check), isKey: cand.isKey, text: cand.text });
      });
    });
  }
  const results = await compute(stmts);
  const byCheck = new Map();
  stmts.forEach((s, i) => {
    const r = results[i] || {}; const m = byCheck.get(s.check) || { keyTrue: false, otherTrue: null, keyTried: false };
    if (s.isKey) { m.keyTried = true; if (r.verdict === 'true') m.keyTrue = true; } else if (r.verdict === 'true' && !m.otherTrue) m.otherTrue = s.text;
    byCheck.set(s.check, m);
  });
  const flags = [];
  for (const [check, m] of byCheck) {
    if (!m.keyTrue && m.otherTrue) {
      const c = checks.find((x) => x.index === check);
      flags.push({ where: `check ${check}`, claim: keyText(c), why: `Worked out from the question alone by SymPy, the answer is the marked key's rival: "${m.otherTrue}" fits, the marked key does not. The marked answer or key is wrong.`, truth: m.otherTrue, certain: true, rule: 'blind_compute' });
    }
  }
  return { flags, tried: byCheck.size, statements: stmts.length };
}

/** `call(system, user, schema, schemaName, maxTokens)` is the cheap model, passed in by the caller so its ledger counts it. */
async function check({ context, blocks, checks, call }) {
  const t0 = Date.now();
  let cost = 0;
  const [tr, bl] = await Promise.all([
    call(TRANSCRIBE_SYSTEM, render({ context, blocks, checks }), TRANSCRIBE_SCHEMA, 'submit_statements', 8000),
    (checks && checks.length) ? call(BLIND_SYSTEM, renderBlind({ context, checks }), BLIND_SCHEMA, 'submit_answers', 3000) : Promise.resolve({ data: { answers: [] }, cost: 0 }),
  ]);
  cost += (tr.cost || 0) + (bl.cost || 0);
  const statements = ((tr.data && tr.data.statements) || []).map((s, id) => ({ ...s, id }));
  const results = await compute(statements);
  const flags = [];
  statements.forEach((s, i) => {
    const r = results[i] || {};
    if (r.verdict === 'false') flags.push({ where: s.where, claim: s.quote, why: `Recomputed by SymPy: this ${s.type} does not hold (${JSON.stringify({ lhs: s.lhs, rhs: s.rhs, expr: s.expr, result: s.result, equation: s.equation, solutions: s.solutions, a: s.a, b: s.b })})`, truth: '', certain: true, rule: `compute_${s.type}` });
  });
  const blind = await blindChecks((bl.data && bl.data.answers) || [], checks || []);
  flags.push(...blind.flags);
  const tally = { true: 0, false: 0, unknown: 0 };
  results.forEach((r) => { tally[r.verdict] = (tally[r.verdict] || 0) + 1; });
  return { flags, statements: statements.length, tally, blindTried: blind.tried, cost, ms: Date.now() - t0 };
}

module.exports = { isOn, check, compute, render, renderBlind, TRANSCRIBE_SYSTEM, BLIND_SYSTEM, TRANSCRIBE_SCHEMA, BLIND_SCHEMA };
