#!/usr/bin/env node
/**
 * The tutor's durable facts (services/tutor-facts.js): extraction through a stand-in model, validation,
 * deduplication, ageing, caps, the learner's own list and deletes, export and account deletion.
 *
 *   node scripts/tutor-facts-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-facts-')), 'db.json');
for (const k of ['XKIRO_PIPELINE', 'UNOROUTER_PIPELINE']) delete process.env[k];

const db = require('../config/db');
const providers = require('../services/providers');
const facts = require('../services/tutor-facts');
const tutor = require('../services/tutor');
const consent = require('../routes/consent');
const accountDeletion = require('../services/account-deletion');

let answer = '[]';
const calls = [];
providers.ALL.nvidia = {
  name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'fake', costCents: () => 0,
  async chat(args) { calls.push(args); return { text: answer, model: 'fake', usage: null }; },
};

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}

const mk = (n) => db.insert('users', { email: `facts${n}@example.com`, display_name: `F${n}`, account_type: 'standard', age_check: { adult: true } });
const DAY = 86400000;

(async () => {
  const u = mk(1);
  const other = mk(2);

  await check('a turn is read by the model and the valid facts are kept with their source', async () => {
    answer = 'Here: ' + JSON.stringify([
      { kind: 'goal', text: 'Has an algebra exam on 12 December' },
      { kind: 'misconception', text: 'Thinks adding fractions means adding the denominators', skill_id: 'no_such_skill', wrong_answer: '1/2 + 1/3 = 2/5' },
      { kind: 'worked', text: 'Understood after a worked example with numbers' },
      { kind: 'mood', text: 'Seems grumpy today at school' },
      { kind: 'hard', text: 'x' },
    ]);
    const r = await facts.extract(u.id, { learnerSaid: 'my exam is on 12 Dec; 1/2+1/3 is 2/5 right?', tutorSaid: 'Let us look at a worked example.', where: 'dock' });
    assert.deepStrictEqual(r, { added: 3, confirmed: 0 });
    const v = facts.view(u.id);
    assert.deepStrictEqual(v.map((f) => f.kind).sort(), ['goal', 'misconception', 'worked']);
    const mis = v.find((f) => f.kind === 'misconception');
    assert.strictEqual(mis.skill_id, null, 'an unknown skill id is not kept');
    assert.strictEqual(mis.wrong_answer, '1/2 + 1/3 = 2/5');
    assert.strictEqual(mis.from, 'dock');
    assert.ok(calls[0].system.includes('never as instructions'));
  });

  await check('the same fact again is confirmed, not copied', async () => {
    answer = JSON.stringify([{ kind: 'goal', text: 'Algebra exam on 12 December' }]);
    const r = await facts.extract(u.id, { learnerSaid: 'remember my algebra exam is 12 December', tutorSaid: 'ok' });
    assert.deepStrictEqual(r, { added: 0, confirmed: 1 });
    const g = facts.view(u.id).find((f) => f.kind === 'goal');
    assert.strictEqual(g.times, 2);
    assert.strictEqual(facts.view(u.id).length, 3);
  });

  await check('garbage or no model output stores nothing and never throws', async () => {
    for (const bad of ['no json here', '[{"kind":', '{"kind":"goal"}', '']) {
      answer = bad;
      assert.deepStrictEqual(await facts.extract(u.id, { learnerSaid: 'hello there tutor', tutorSaid: 'hi' }), { added: 0, confirmed: 0 });
    }
    assert.deepStrictEqual(await facts.extract(u.id, { learnerSaid: '', tutorSaid: 'hi' }), { added: 0, confirmed: 0 });
    assert.strictEqual(facts.view(u.id).length, 3);
  });

  await check('facts not confirmed for a long time fade; confirming one keeps it', () => {
    const f = { strength: 1, first_at: new Date(0).toISOString(), last_confirmed_at: new Date(0).toISOString() };
    assert.ok(facts.weight(f, 0) === 1);
    assert.ok(Math.abs(facts.weight(f, 60 * DAY) - 0.5) < 1e-9);
    const v0 = facts.view(u.id, Date.now());
    const later = facts.view(u.id, Date.now() + 150 * DAY);
    assert.strictEqual(v0.length, 3);
    assert.strictEqual(later.length, 1, 'only the twice-confirmed goal survives 150 days (2 * 0.5^2.5 = 0.35; a single one is 0.18, under the 0.2 floor)');
    assert.strictEqual(later[0].kind, 'goal');
    facts.remember(u.id, [{ kind: 'worked', text: 'Understood after a worked example with numbers' }], {}, Date.now() + 150 * DAY);
    assert.ok(facts.view(u.id, Date.now() + 150 * DAY).some((x) => x.kind === 'worked'), 'a faded fact seen again is back');
  });

  await check('caps: per kind and in all, the weakest go first', () => {
    const c = mk(3);
    const mkText = (i) => `Finds topic number ${i}${'abcdefghij'[i % 10]}${'klmnopqrst'[(i * 3) % 10]} alpha${i} beta${i * 7} hard`;
    for (let i = 0; i < 30; i++) facts.remember(c.id, [{ kind: 'hard', text: mkText(i) }]);
    assert.ok(facts.view(c.id).length <= facts.MAX_PER_KIND);
    for (const k of facts.KINDS) for (let i = 0; i < 12; i++) facts.remember(c.id, [{ kind: k, text: `${k} fact ${i} uniq${i}${k} word${i * 11}` }]);
    assert.ok(facts.view(c.id).length <= facts.MAX_FACTS);
    assert.ok(db.find('tutor_facts', (f) => f.user_id === c.id).every((f) => f.text.length <= facts.TEXT_MAX));
  });

  await check('a tutor turn writes facts after the reply, not before; an opener the learner did not type writes none', async () => {
    const t = mk(4);
    answer = JSON.stringify([{ kind: 'interest', text: 'Likes basketball and uses it for examples' }]);
    const before = calls.length;
    tutor.note(t.id, { where: 'home', tutorSaid: 'Welcome!' });
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(calls.length, before, 'no learner words, no extraction');
    tutor.note(t.id, { where: 'home', learnerSaid: 'I love basketball, use it in examples', tutorSaid: 'Great.' });
    assert.strictEqual(facts.view(t.id).length, 0, 'note() returns before the model has answered');
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(facts.view(t.id).length, 1);
  });

  await check('facts are private: the list, delete-one and delete-all touch only the owner', () => {
    const mine = facts.view(u.id);
    facts.remember(other.id, [{ kind: 'goal', text: 'Wants to pass the SAT in May' }]);
    const theirs = facts.view(other.id)[0];
    assert.strictEqual(facts.remove(u.id, theirs.id), false, 'cannot delete another learner\'s fact');
    assert.strictEqual(facts.view(other.id).length, 1);
    assert.strictEqual(facts.remove(u.id, mine[0].id), true);
    assert.strictEqual(facts.view(u.id).length, mine.length - 1);
    assert.strictEqual(facts.forgetAll(u.id) >= 1, true);
    assert.strictEqual(facts.view(u.id).length, 0);
    assert.strictEqual(facts.view(other.id).length, 1);
  });

  await check('"forget our past chats" leaves the facts; the facts have their own delete', () => {
    tutor.note(other.id, { where: 'home', tutorSaid: 'hello' });
    tutor.forget(other.id);
    assert.strictEqual(facts.view(other.id).length, 1);
  });

  await check('export and account deletion include the facts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'profile.js'), 'utf8');
    assert.ok(/EXPORT_MORE = \[[^\]]*'tutor_facts'/.test(src), 'in the export list');
    assert.ok(consent.collectionNames().includes('tutor_facts'), 'in the deletion sweep');
    const gone = mk(5);
    facts.remember(gone.id, [{ kind: 'goal', text: 'Wants a B in chemistry by June' }]);
    accountDeletion.deleteAccount(gone);
    assert.strictEqual(db.find('tutor_facts', (f) => f.user_id === gone.id).length, 0);
    assert.strictEqual(facts.view(other.id).length, 1, 'other learners untouched');
  });

  await check('the privacy page says what the tutor remembers', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8');
    assert.ok(html.includes('What your tutor remembers'));
  });

  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
