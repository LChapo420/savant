/** ACT Writing: the four-domain rubric fits the essay marking's shape, and a marked attempt reports by domain. */
const assert = require('assert');
const W = require('../services/act-writing');
const essays = require('../services/essays');

function check(message, fn) {
  try { fn(); console.log(`ok   ${message}`); } catch (error) { console.error(`FAIL ${message}: ${error.message}`); process.exitCode = 1; }
}

check('the rubric has the four domains, four descriptors each, and is a fresh copy', () => {
  const r = W.buildRubric();
  assert.deepStrictEqual(r.map((c) => c.name), ['Ideas and Analysis', 'Development and Support', 'Organization', 'Language Use and Conventions']);
  r.forEach((c) => { assert.strictEqual(c.levels.length, 4); assert.ok(c.skill_id && c.skill_name && c.levels.every((l) => l.trim())); });
  assert.strictEqual(new Set(r.map((c) => c.skill_id)).size, 4);
  r[0].levels[0] = 'changed';
  assert.notStrictEqual(W.buildRubric()[0].levels[0], 'changed');
});

check('the rubric is accepted as the criteria of an essay row (sanitize keeps it)', () => {
  const out = essays.sanitize({ id: 1, level: 25, prompt: 'p', criteria: W.buildRubric(), attempts: [] });
  assert.strictEqual(out.criteria.length, 4);
});

check('marks of 1 to 4 map onto the 2 to 12 scale, clamped', () => {
  assert.deepStrictEqual([1, 2, 3, 4].map(W.toDomainScale), [2, 5, 9, 12]);
  assert.strictEqual(W.toDomainScale(0), 2);
  assert.strictEqual(W.toDomainScale(9), 12);
});

check('a marked attempt reports by domain with an honest estimate', () => {
  const r = W.domainReport({ criteria: [
    { index: 0, score: 4, evidence: 'q', next_step: 'n' }, { index: 1, score: 3 }, { index: 2, score: 2 }, { index: 3, score: 1 },
  ] });
  assert.deepStrictEqual(r.domains.map((d) => d.score), [12, 9, 5, 2]);
  assert.strictEqual(r.domains[0].evidence, 'q');
  assert.strictEqual(r.estimate, 7);
  assert.ok(/not an ACT score/.test(r.note));
});

check('unmarked criteria (rule fallback) give null, never zero', () => {
  const r = W.domainReport({ criteria: [{ index: 0, score: null, evidence: null, next_step: 'Not marked' }] });
  assert.ok(r.domains.every((d) => d.score === null));
  assert.strictEqual(r.estimate, null);
  assert.strictEqual(W.domainReport(null).estimate, null);
  const half = W.domainReport({ criteria: [{ index: 1, score: 4 }] });
  assert.strictEqual(half.estimate, 12);
});
