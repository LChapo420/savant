/** ACT Writing: the four-domain rubric fits the essay marking's shape, and a marked attempt reports by domain. */
const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `act-writing-test-${process.pid}.json`);
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

const db = require('../config/db');
const user = db.insert('users', { email: 'aw@example.test', name: 'AW' });
const enrollment = db.insert('enrollments', { user_id: user.id, track_id: 'act', grade_id: 'act_1' });

check('a timed ACT Writing practice opens with a prompt, the rubric and 40 minutes', () => {
  const row = essays.startActWriting({ userId: user.id, enrollment });
  const out = essays.sanitize(row);
  assert.strictEqual(out.minutes, 40);
  assert.strictEqual(out.criteria.length, 4);
  assert.strictEqual(out.prompt, W.PROMPTS[0]);
  assert.strictEqual(out.domain_report, null);
  assert.strictEqual(row.level, essays.ACT_WRITING_LEVEL);
});

check('starting again resumes the unmarked attempt instead of adding rows', () => {
  const a = essays.startActWriting({ userId: user.id, enrollment });
  const b = essays.startActWriting({ userId: user.id, enrollment });
  assert.strictEqual(a.id, b.id);
  assert.strictEqual(db.find('essays', (e) => e.user_id === user.id).length, 1);
});

check('after a marked attempt the next start is a new prompt, and the result carries the domain report', () => {
  const first = essays.startActWriting({ userId: user.id, enrollment });
  db.update('essays', first.id, { attempts: [{ overall: 3, source: 'ai', words: 300, criteria: [
    { index: 0, score: 3 }, { index: 1, score: 2 }, { index: 2, score: 4 }, { index: 3, score: null }] }] });
  const report = essays.sanitize(db.byId('essays', first.id)).domain_report;
  assert.strictEqual(report.domains.length, 4);
  assert.strictEqual(report.domains[3].score, null);
  const next = essays.startActWriting({ userId: user.id, enrollment });
  assert.notStrictEqual(next.id, first.id);
  assert.strictEqual(next.prompt, W.PROMPTS[1]);
});

check('an ordinary essay row carries no minutes or domain report', () => {
  const out = essays.sanitize({ id: 9, level: 25, prompt: 'p', source: 'ai', criteria: [], attempts: [{ overall: 3, criteria: [] }] });
  assert.strictEqual(out.minutes, null);
  assert.strictEqual(out.domain_report, null);
});

check('the prompt bank wraps and every prompt asks for a position', () => {
  assert.strictEqual(W.promptFor(W.PROMPTS.length + 1), W.PROMPTS[0]);
  W.PROMPTS.forEach((p) => assert.ok(/position/.test(p)));
});

check('ACT timing lists the 40-minute writing section without changing the scored blend', () => {
  const t = require('../services/act-timing');
  assert.strictEqual(t.SECTIONS.writing.minutes, 40);
  assert.ok(!t.SCORED.includes('writing'));
});

const fs = require('fs');
const root = path.join(__dirname, '..');
check('the ACT Writing page exists, loads its script, and posts only to the essay routes', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'act-writing.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'public', 'js', 'act-writing.js'), 'utf8');
  assert.ok(html.includes('/js/act-writing.js') && html.includes('width=device-width'));
  assert.ok(js.includes('/api/essays/act-writing') && js.includes('/draft') && js.includes('/submit'));
  assert.ok(!/innerHTML\s*=\s*[^;]*box\.value/.test(js), 'the learner text never goes into innerHTML');
});

check('the start route finds the learner\'s own ACT enrollment when none is named', () => {
  const src = fs.readFileSync(path.join(root, 'routes', 'essays.js'), 'utf8');
  assert.ok(/track_id === 'act'/.test(src) && /enrollment\.user_id !== req\.user\.id/.test(src));
});
