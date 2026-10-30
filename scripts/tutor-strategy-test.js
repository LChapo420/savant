#!/usr/bin/env node
/**
 * The tutor chooses how to explain from what has worked for this learner (T4, 06-M8): two simulated
 * learners with opposite histories get different strategies, a strategy that fails is tried less, and the
 * choice reaches the prompt.
 *
 *   node scripts/tutor-strategy-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-strat-')), 'db.json');
for (const k of ['XKIRO_PIPELINE', 'UNOROUTER_PIPELINE']) delete process.env[k];

const db = require('../config/db');
const providers = require('../services/providers');
const strategy = require('../services/tutor-strategy');
const facts = require('../services/tutor-facts');
const tutor = require('../services/tutor');

let reply = '[]';
providers.ALL.nvidia = {
  name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'fake', costCents: () => 0,
  async chat() { return { text: reply, model: 'fake', usage: null }; },
};

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}
const mk = (n) => db.insert('users', { email: `${n}@example.com`, display_name: n, account_type: 'standard', age_check: { adult: true } });
const top = (u, skill) => strategy.ranked(u.id, skill)[0].style;

(async () => {
  await check('with no history the fallback order decides', () => {
    const u = mk('fresh');
    assert.strictEqual(top(u), 'step_questions');
    assert.deepStrictEqual(strategy.ranked(u.id).map((r) => r.style), strategy.ORDER);
  });

  await check('two learners with opposite histories get different strategies', () => {
    const a = mk('a');
    const b = mk('b');
    strategy.record(a.id, 'step_questions', 'failed');
    strategy.record(a.id, 'step_questions', 'failed');
    strategy.record(a.id, 'worked_example', 'worked');
    strategy.record(b.id, 'step_questions', 'worked');
    strategy.record(b.id, 'worked_example', 'failed');
    assert.strictEqual(top(a), 'worked_example');
    assert.strictEqual(top(b), 'step_questions');
    assert.notStrictEqual(top(a), top(b));
  });

  await check('a strategy that fails is tried less: it drops below every untried one, and keeps dropping', () => {
    const u = mk('fail');
    const s1 = strategy.ranked(u.id).find((r) => r.style === 'step_questions').score;
    strategy.record(u.id, 'step_questions', 'failed');
    const s2 = strategy.ranked(u.id).find((r) => r.style === 'step_questions').score;
    strategy.record(u.id, 'step_questions', 'failed');
    const s3 = strategy.ranked(u.id).find((r) => r.style === 'step_questions').score;
    assert.ok(s1 > s2 && s2 > s3, `${s1} ${s2} ${s3}`);
    assert.notStrictEqual(top(u), 'step_questions');
    // Simulate 30 turns that each take the top choice and fail when it is step_questions or worked_example.
    const sim = mk('sim');
    const used = {};
    for (let i = 0; i < 30; i += 1) {
      const s = top(sim);
      used[s] = (used[s] || 0) + 1;
      strategy.record(sim.id, s, s === 'analogy' ? 'worked' : 'failed');
    }
    assert.ok(used.analogy >= 20, `the one that works takes over: ${JSON.stringify(used)}`);
    assert.ok((used.step_questions || 0) <= 2 && (used.worked_example || 0) <= 2, JSON.stringify(used));
  });

  await check('mastery on the page\'s skill nudges the default, and never beats a measured success', () => {
    const u = mk('mast');
    db.insert('skill_states', { user_id: u.id, skill_id: 'fractions', mastery: 0.2, attempts: 6 });
    assert.strictEqual(top(u, 'fractions'), 'worked_example');
    strategy.record(u.id, 'analogy', 'worked');
    assert.strictEqual(top(u, 'fractions'), 'analogy');
  });

  await check('record ignores unknown styles and outcomes', () => {
    const u = mk('bad');
    assert.strictEqual(strategy.record(u.id, 'telepathy', 'worked'), false);
    assert.strictEqual(strategy.record(u.id, 'analogy', 'maybe'), false);
    assert.strictEqual(db.find('tutor_strategies', (r) => r.user_id === u.id).length, 0);
  });

  await check('the choice reaches the prompt and says it never changes whether the answer is given', () => {
    const u = mk('prompt');
    strategy.record(u.id, 'visual', 'worked');
    const text = tutor.contextText(u.id, { about: 'Help me with this' });
    assert.ok(text.includes('HOW TO HELP THEM') && text.includes('Describe a picture'), text);
    assert.ok(/never whether you give the answer/.test(text));
  });

  await check('after a turn, the model\'s judgment of the previous style is counted; a worked fact with a style counts as a success', async () => {
    const u = mk('loop');
    tutor.contextText(u.id, { about: 'turn one' }); // uses step_questions (default)
    tutor.contextText(u.id, { about: 'turn two' }); // the previous turn's way is now judged
    reply = JSON.stringify([{ kind: 'strategy', style: 'step_questions', outcome: 'failed' }, { kind: 'worked', text: 'Understood after an analogy with pizza slices', style: 'analogy' }]);
    await facts.extract(u.id, { learnerSaid: 'I still do not get it', tutorSaid: 'Try this.', where: 'dock' });
    const r = Object.fromEntries(strategy.ranked(u.id).map((x) => [x.style, x]));
    assert.strictEqual(r.step_questions.tried, 1);
    assert.strictEqual(r.step_questions.worked, 0);
    assert.strictEqual(r.analogy.worked, 1);
    assert.strictEqual(top(u), 'analogy');
    // The outcome is counted once: a second extraction with no new prompt does not recount it.
    await facts.extract(u.id, { learnerSaid: 'ok', tutorSaid: 'Good.', where: 'dock' });
    assert.strictEqual(strategy.ranked(u.id).find((x) => x.style === 'step_questions').tried, 1);
    assert.strictEqual(facts.list(u.id).filter((f) => f.kind === 'strategy').length, 0, 'an outcome is not stored as a fact');
  });

  await check('an outcome the model reports for a style that was not the previous one is ignored', async () => {
    const u = mk('mismatch');
    tutor.contextText(u.id, { about: 'one' });
    tutor.contextText(u.id, { about: 'two' });
    reply = JSON.stringify([{ kind: 'strategy', style: 'visual', outcome: 'worked' }]);
    await facts.extract(u.id, { learnerSaid: 'hm', tutorSaid: 'ok', where: 'dock' });
    assert.strictEqual(strategy.ranked(u.id).find((x) => x.style === 'visual').tried, 0);
  });

  await check('forgetAll removes a learner\'s strategy rows and nobody else\'s', () => {
    const a = mk('del-a');
    const b = mk('del-b');
    strategy.record(a.id, 'analogy', 'worked');
    strategy.record(b.id, 'analogy', 'worked');
    strategy.forgetAll(a.id);
    assert.strictEqual(db.find('tutor_strategies', (r) => r.user_id === a.id).length, 0);
    assert.strictEqual(db.find('tutor_strategies', (r) => r.user_id === b.id).length, 1);
  });

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
