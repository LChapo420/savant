#!/usr/bin/env node
/**
 * The tutor uses what it durably knows (T3): the facts that match the skill on the page and the words of
 * the question go into the reply's prompt within a fixed budget, with current mastery on that skill; facts
 * about something unrelated do not.
 *
 *   node scripts/tutor-relevance-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-rel-')), 'db.json');
for (const k of ['XKIRO_PIPELINE', 'UNOROUTER_PIPELINE']) delete process.env[k];

const db = require('../config/db');
const providers = require('../services/providers');
const facts = require('../services/tutor-facts');
const tutor = require('../services/tutor');
const dock = require('../services/tutor-context');

const calls = [];
providers.ALL.nvidia = {
  name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'fake', costCents: () => 0,
  async chat(args) { if (!/long-term notes on one learner/.test(args.system || '')) calls.push(args); return { text: 'What do you notice about the bottom numbers?', model: 'fake', usage: null }; },
};

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}

const DAY = 86400000;
const u = db.insert('users', { email: 'rel@example.com', display_name: 'Rel', account_type: 'standard', age_check: { adult: true } });
const day1 = Date.now() - 4 * DAY;
facts.remember(u.id, [
  { kind: 'misconception', text: 'Adds the denominators when adding fractions', skill_id: 'fractions', wrong_answer: '1/2 + 1/3 = 2/5' },
  { kind: 'hard', text: 'Cannot picture the volume of a cylinder', skill_id: 'geometry_area' },
  { kind: 'worked', text: 'Gets it after a worked example with small numbers' },
  { kind: 'interest', text: 'Likes chess and uses it for examples' },
], { where: 'dock' }, day1);
facts.remember(u.id, [{ kind: 'goal', text: 'Algebra exam on 12 December' }], { where: 'home' }, day1); // one turn keeps at most MAX_PER_TURN
db.insert('skill_states', { user_id: u.id, skill_id: 'word_problems', mastery: 0.42, attempts: 7 });

(async () => {
  await check('a mix-up recorded on day 1 shapes the context on day 5 for a related skill (matched by the question\'s words)', () => {
    const text = tutor.contextText(u.id, { skillId: 'word_problems', about: 'Maya ate 3/4 of a pizza and Sam ate 1/8. How much of the fraction is left?' });
    assert.ok(text.includes('Adds the denominators when adding fractions'), text);
    assert.ok(text.includes('1/2 + 1/3 = 2/5'), 'the wrong answer they gave is there');
  });

  await check('the same skill is matched by id even when the question text says nothing', () => {
    const text = tutor.contextText(u.id, { skillId: 'fractions', about: 'Help' });
    assert.ok(text.includes('Adds the denominators'));
  });

  await check('an unrelated fact is not sent', () => {
    const text = tutor.contextText(u.id, { skillId: 'word_problems', about: 'Maya ate 3/4 of a pizza. How much of the fraction is left?' });
    assert.ok(!text.includes('cylinder'), 'a hard spot on volume stays out of a fractions question');
    assert.ok(!text.includes('chess'), 'an interest nobody mentioned stays out');
  });

  await check('goals and what has worked always go; an interest goes when the question touches it', () => {
    const text = tutor.contextText(u.id, { about: 'Can you explain this with a chess example?' });
    assert.ok(text.includes('Algebra exam on 12 December') && text.includes('worked example with small numbers'));
    assert.ok(text.includes('Likes chess'));
  });

  await check('current mastery on the page\'s skill is added', () => {
    const text = tutor.contextText(u.id, { skillId: 'word_problems', about: 'help' });
    assert.ok(/Mastery on Word problems right now: 42% over 7 questions/.test(text), text);
    assert.ok(!/Mastery on .* right now/.test(tutor.contextText(u.id, { skillId: 'decimals', about: 'help' })), 'nothing for a skill they have not tried');
  });

  await check('the skill is found from the page text when the page does not name it', () => {
    assert.strictEqual(facts.inferSkill('Practice: Fractions, question 4'), 'fractions');
    assert.strictEqual(facts.inferSkill('nothing relevant'), null);
  });

  await check('the facts stay inside the budget however many there are', () => {
    const b = db.insert('users', { email: 'rel2@example.com', display_name: 'R2', account_type: 'standard', age_check: { adult: true } });
    for (let i = 0; i < 12; i++) facts.remember(b.id, [{ kind: 'hard', text: `Struggles with fraction step number ${i} when comparing unlike denominators carefully`, skill_id: 'fractions' }]);
    const r = facts.relevant(b.id, { skillId: 'fractions', text: 'fractions' });
    const size = r.lines.join('\n').length;
    assert.ok(r.lines.length > 0 && size <= facts.FACTS_BUDGET, `${size} chars`);
    assert.ok(facts.relevant(b.id, { skillId: 'fractions', text: 'x' }, { budget: 100 }).lines.join('').length <= 100);
  });

  await check('a skill id from the browser that is not a skill does not break anything', () => {
    for (const bad of [{ a: 1 }, 42, '__proto__', 'nope']) tutor.contextText(u.id, { skillId: bad, about: 'fractions' });
  });

  await check('on the dock the relevant facts reach the model and the page decides which', async () => {
    calls.length = 0;
    await dock.reply({ user: u, messages: [{ role: 'user', content: 'I do not get this one' }], page: { path: '/lesson', question: 'What is 1/2 + 1/3 as a fraction?' } });
    const sys = calls[calls.length - 1].system;
    assert.ok(sys.includes('Adds the denominators when adding fractions'), 'mix-up reached the prompt');
    assert.ok(!sys.includes('cylinder'));
    assert.ok(sys.indexOf('RULE FOR EVERY REPLY') > sys.indexOf('Adds the denominators'), 'the answer rule still comes last');
    await dock.reply({ user: u, messages: [{ role: 'user', content: 'hi' }], page: { path: '/lesson', question: 'Find the volume of a cylinder with radius 2.' } });
    const sys2 = calls[calls.length - 1].system;
    assert.ok(sys2.includes('volume of a cylinder') && !sys2.includes('Adds the denominators'));
  });

  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
