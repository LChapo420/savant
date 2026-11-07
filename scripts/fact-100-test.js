#!/usr/bin/env node
/** Frozen facts, recomputation and the rewrite check, offline (no key, no network; Python with SymPy is used when present). Part of npm test. */
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const B = require('../services/fact-bank');
const F = require('../services/fact-compute');
const S = require('../services/fact-source');
const D = require('../services/fact-dictionary');

// Everything here is off unless switched on.
for (const k of ['FACT_BANK', 'FACT_COMPUTE', 'FACT_SOURCE', 'FACT_DICTIONARY']) delete process.env[k];
assert.equal(B.isOn(), false); assert.equal(F.isOn(), false); assert.equal(S.isOn(), false); assert.equal(D.isOn(), false);

// Tokens: numbers, years, names, formulas; a Spanish word only in a Spanish lesson.
const tk = (t, track) => B.tokensOf(t, track).map((x) => `${x.type}:${x.value}`);
assert.ok(tk('In 1846 Euclid wrote it.').includes('name:euclid') && tk('In 1846 Euclid wrote it.').includes('year:1846')); // a name opening a sentence is not seen: a known limit, the reader's job
assert.ok(tk('It costs $12.50, or twelve dollars.').includes('number:12.50') && tk('It costs $12.50, or twelve dollars.').includes('number:12'));
assert.ok(tk('The rule a(b + c) = ab + ac holds.').some((t) => t === 'formula:a(b+c)=ab+ac'), tk('The rule a(b + c) = ab + ac holds.').join());
assert.ok(tk('¿Dónde está?', 'spanish').includes('foreign:dónde') && !tk('¿Dónde está?', 'english').includes('foreign:dónde'));
// No regular expression blow-up on long text (a nested one hung on real lessons).
const t0 = Date.now(); B.tokensOf('word 12 and more words, '.repeat(4000), 'math'); assert.ok(Date.now() - t0 < 3000, 'tokens must stay linear');

// Mechanical: a new number or name is caught, a rephrase with the same tokens is not, a reversal with the same words is not (that is what the entailment read is for).
const bank = ['The Spanish-American War ended in 1898.', 'A triangle has 3 sides.', 'Pressure rises when volume falls.'];
const allowed = B.allowedFrom(bank, 'english');
assert.equal(B.mechanicalCheck('A triangle has 4 sides.', allowed).missing[0].value, '4');
assert.equal(B.mechanicalCheck('As Euclid said, a triangle has 3 sides.', allowed).missing[0].value, 'euclid');
assert.equal(B.mechanicalCheck('Every triangle has exactly 3 sides.', allowed).missing.length, 0);
assert.equal(B.mechanicalCheck('Volume rises when pressure falls.', allowed).missing.length, 0, 'mechanical cannot see a reversal');
// A word the bank uses in lower case is not a name when it starts a title.
assert.equal(B.mechanicalCheck('The Triangle has 3 Sides.', allowed).missing.length, 0);

// Illustrations: made-up numbers are fine, claims are not.
assert.equal(B.mechanicalCheck('[[eg]]Your 7 skateboards[[/eg]] A triangle has 3 sides.', allowed).missing.length, 0);
const ill = (t) => B.illustrationCheck(t, { allowedNames: ['skateboards'], allowed }).map((p) => p.problem);
assert.equal(ill('[[eg]]Your 7 skateboards[[/eg]]').length, 0);
assert.ok(ill('[[eg]]Back in 1999 your 7 skateboards[[/eg]]').some((p) => /year/.test(p)));
assert.ok(ill('[[eg]]As Tony Hawk showed, skateboards[[/eg]]').some((p) => /name/.test(p)));
assert.ok(ill('[[eg]]Research shows skateboards always win[[/eg]]').some((p) => /general claim/.test(p)));

// A flag is a suspicion. Nothing acts on it until a second step confirms it; a recomputation that holds clears it; an unconfirmed flag is logged and the block stays.
const CF = require('../services/fact-confirm');
const os = require('os');
const fs = require('fs');

assert.equal(CF.isOn(), false);
const dp = (f, p) => CF.decide({ raisers: ['kimi31'], rulings: {}, source: null, recompute: null, ...f }, p).act;
assert.equal(dp({}, 'three_families'), false, 'one reader alone confirms nothing');
assert.equal(dp({ rulings: { grok43: true } }, 'three_families'), false);
assert.equal(dp({ rulings: { grok43: true, ds41_coral: true } }, 'three_families'), true);
assert.equal(dp({ raisers: ['ds41_coral'], rulings: { ds41_coral: true, grok43: false } }, 'three_families'), false, 'a raiser cannot rule on itself');
assert.equal(dp({ raisers: ['kimi31', 'grok43'], rulings: { ds41_coral: true } }, 'three_families'), true);
assert.equal(dp({ source: 'contradicted' }, 'hard_only'), true);
assert.equal(dp({ recompute: 'false' }, 'hard_only'), true);
assert.equal(dp({ recompute: 'true', rulings: { grok43: true, ds41_coral: true } }, 'three_families'), false, 'it recomputes as right: the flag is cleared');
assert.equal(dp({ raisers: ['kimi31', 'grok43'] }, 'independent'), true);
assert.equal(dp({ raisers: ['compute_ds41_coral', 'code'] }, 'independent'), false, 'two code paths are not two readers');
const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flag-')), 'log.jsonl');
CF.logFlag({ level: 'math/x/1', claim: 'x' }, logFile);
assert.equal(JSON.parse(fs.readFileSync(logFile, 'utf8').trim()).level, 'math/x/1');

(async () => {
  // The rewrite check, with the local checkers stubbed: a fact the bank does not support fails; when the checkers are down it is not_checked, never a pass.
  const high = async (ps) => ps.map(() => ({ factcg: 0.9, minicheck: 0.9 }));
  const low = async (ps) => ps.map(() => ({ factcg: 0.1, minicheck: 0.1 }));
  const down = async () => { throw new Error('down'); };
  const ok = await S.checkRewrite({ text: 'A triangle has 3 sides.', bank, stage1Fn: high });
  assert.equal(ok.status, 'pass');
  const nums = await S.checkRewrite({ text: 'A triangle has 5 sides.', bank, stage1Fn: high });
  assert.equal(nums.status, 'fail'); assert.equal(nums.problems[0].kind, 'token');
  const unsupported = await S.checkRewrite({ text: 'Volume rises when pressure falls.', bank, stage1Fn: low });
  assert.equal(unsupported.status, 'fail'); assert.equal(unsupported.problems[0].kind, 'unsupported');
  const ruledFine = await S.checkRewrite({ text: 'Pressure goes up as volume goes down.', bank, stage1Fn: low, rule: async () => false });
  assert.equal(ruledFine.status, 'pass');
  const ruleDown = await S.checkRewrite({ text: 'Pressure goes up as volume goes down.', bank, stage1Fn: low, rule: async () => { throw new Error('x'); } });
  assert.equal(ruleDown.status, 'fail', 'a ruling that cannot answer does not clear a flag');
  const off = await S.checkRewrite({ text: 'A triangle has 3 sides.', bank, stage1Fn: down });
  assert.equal(off.status, 'not_checked');

  // SymPy decides; what it cannot parse is silent, and nothing outside the whitelist reaches its parser.
  const py = spawnSync('python', ['-c', 'import sympy'], { encoding: 'utf8' });
  if (py.status !== 0) { console.log('fact-100-test: ok (SymPy not on this machine: recomputation steps skipped)'); return; }
  const v = async (st) => (await F.compute([{ id: 0, ...st }]))[0].verdict;
  assert.equal(await v({ type: 'equal', lhs: '(9 - 1)/2', rhs: '4' }), 'true');
  assert.equal(await v({ type: 'equal', lhs: '(9 - 1)/2', rhs: '5' }), 'false');
  assert.equal(await v({ type: 'equal', lhs: '4*x - y', rhs: '7' }), 'unknown', 'an equation with letters is not claimed for every value');
  assert.equal(await v({ type: 'identity', lhs: 'a(b + c)', rhs: 'a*b + a*c' }), 'true');
  assert.equal(await v({ type: 'identity', lhs: 'a(b + c)', rhs: 'a*b + 2*a*c' }), 'false');
  assert.equal(await v({ type: 'solve', equation: '3x + 5 = 20', var: 'x', solutions: ['5'] }), 'true');
  assert.equal(await v({ type: 'inequality', inequality: '-2x > 4', var: 'x', solution: 'x > -2' }), 'false');
  assert.equal(await v({ type: 'derivative', expr: 'x^3', var: 'x', result: '3x^2' }), 'true');
  assert.equal(await v({ type: 'limit', expr: '(x^2 - 1)/(x - 1)', var: 'x', to: '1', result: '2' }), 'true');
  assert.equal(await v({ type: 'compare', a: '19', op: '<=', b: '13', negated: true }), 'true', 'the lesson says it fails, and it does');
  assert.equal(await v({ type: 'equivalent', a: '3x + 2y = 16', b: '8x = 24', var: 'x' }), 'unknown', 'two letters: not one set');
  assert.equal(await v({ type: 'equal', lhs: "__import__('os').system('x')", rhs: '1' }), 'unknown');
  assert.equal(await v({ type: 'equal', lhs: 'open.read', rhs: '1' }), 'unknown');

  // The compute layer end to end, with the model stubbed: a transcribed wrong sum is flagged, a blind answer that fits another option flags the key.
  const stub = async (system) => (system === F.TRANSCRIBE_SYSTEM
    ? { data: { statements: [{ where: 'block 0', quote: '20 hours at $15 earns $250', type: 'equal', lhs: '20*15', rhs: '250' }, { where: 'block 0', quote: 'half of 8 is 4', type: 'equal', lhs: '8/2', rhs: '4' }] }, cost: 0.001 }
    : { data: { answers: [{ check: 0, value: '27^(2/3)' }] }, cost: 0.001 });
  const r = await F.check({ context: 'Subject: math.', blocks: [{ index: 0, block: 'Basic_TextBlock', data: { text: 'x' } }], checks: [{ index: 0, format: 'multiple_choice', prompt: 'Evaluate 27^(2/3)', choices: ['3', '9', '18'], answer: 2 }], call: stub });
  assert.equal(r.flags.filter((f) => f.rule === 'compute_equal').length, 1);
  assert.equal(r.flags.filter((f) => f.rule === 'blind_compute').length, 1);
  assert.ok(path.basename(__filename));
  // The gate takes the layer only when switched on, and its findings go to the decider.
  const gate = require('../services/fact-gate'); // eslint-disable-line global-require
  process.env.FACT_GATE_READERS = 'x:r'; process.env.FACT_GATE_DECIDER = 'x:d'; process.env.FACT_GATE_NO_WAIT = '1';
  const level = { context: { text: 'Subject: math.', trackId: 'math' }, trackId: 'math', blocks: [{ index: 0, block: 'Basic_TextBlock', data: { text: 'x' } }], checks: [] };
  const seen = [];
  const gcall = async (slot, args) => { seen.push(args.system.slice(0, 30)); if (args.system === F.TRANSCRIBE_SYSTEM) return stub(args.system); if (args.schemaName === 'submit_rulings') return { data: { rulings: [] }, cost: 0 }; return { data: { errors: [] }, cost: 0, model: 'r' }; };
  const off2 = await gate.read({ ...level, call: gcall });
  assert.equal(off2.claims.length, 0); assert.ok(!seen.some((x) => x.startsWith('You copy')), 'off: no transcription');
  process.env.FACT_COMPUTE = 'on';
  const on2 = await gate.read({ ...level, call: gcall });
  delete process.env.FACT_COMPUTE;
  assert.equal(on2.claims.length, 1); assert.equal(on2.stages.compute, 1);
  // FACT_CONFIRM: one family's flag is logged and changes nothing; two more families make it stand; a ruler that cannot answer does not count.
  process.env.FACT_GATE_READERS = 'x:moonshotai/kimi'; process.env.FACT_CONFIRM_RULERS = 'x:deepseek-a,x:grok-b'; process.env.FACT_CONFIRM = 'on'; process.env.FACT_FLAG_LOG = logFile;
  const flagging = (real) => async (slot, args) => { if (args.schemaName === 'submit_rulings') { if (real === null) throw new Error('down'); return { data: { rulings: [{ flag: 0, real: real === 'both' || (real === 'one' && slot.model === 'grok-b'), reason: 'r' }] }, cost: 0 }; } return { data: { errors: [{ where: 'block 0', quote: 'wrong words', why: 'w', truth: 't' }] }, cost: 0, model: slot.model }; };
  const both = await gate.read({ ...level, call: flagging('both') });
  assert.equal(both.claims.length, 1); assert.equal(both.stages.unconfirmed, 0);
  const one = await gate.read({ ...level, call: flagging('one') });
  assert.equal(one.claims.length, 0, 'two families are not enough'); assert.equal(one.stages.unconfirmed, 1);
  const none = await gate.read({ ...level, call: flagging(null) });
  assert.equal(none.claims.length, 0, 'rulers down: the part stays, the flag is logged');
  assert.ok(fs.readFileSync(logFile, 'utf8').includes('wrong words'));
  delete process.env.FACT_CONFIRM; delete process.env.FACT_CONFIRM_RULERS; delete process.env.FACT_FLAG_LOG;
  console.log('fact-100-test: ok');
})().catch((e) => { console.error(e); process.exit(1); });
