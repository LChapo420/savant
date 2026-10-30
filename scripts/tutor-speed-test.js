#!/usr/bin/env node
/**
 * The tutor stays fast (T6, 06-M10): building the whole context for a learner with 5,000 events
 * takes under 30 ms (median of 15 builds, after one warm-up), and a dock reply makes exactly one
 * model call on its path (the note-taking call runs after the reply, under its own task).
 *
 *   node scripts/tutor-speed-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-speed-')), 'db.json');
for (const k of ['XKIRO_PIPELINE', 'UNOROUTER_PIPELINE']) delete process.env[k];

const db = require('../config/db');
const providers = require('../services/providers');
const tutor = require('../services/tutor');
const facts = require('../services/tutor-facts');
const dock = require('../services/tutor-context');

const calls = [];
providers.ALL.nvidia = {
  name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'fake', costCents: () => 0,
  async chat(req) { calls.push(req); return { text: calls.length && /durable|facts|notes? about/i.test(JSON.stringify(req).slice(0, 600)) ? '[]' : 'Which step is tricky for you?', model: 'fake', usage: null }; },
};

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const ms = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };

const SKILLS = Array.from({ length: 60 }, (_, i) => `skill_${i}`);
function history(user, n) {
  const day = 24 * 3600 * 1000;
  for (let i = 0; i < n; i += 1) {
    const skill = SKILLS[i % SKILLS.length];
    const correct = i % 3 !== 0;
    db.insert('events', { user_id: user.id, item_id: `it${i}`, skill_id: skill, correct, difficulty: 5, latency_ms: 4000 + (i % 50) * 100, created_at: new Date(Date.now() - (n - i) * day / 40).toISOString() });
    if (i % 2 === 0) db.insert('items', { user_id: user.id, skill_id: skill, prompt: `Question ${i} about ${skill}`, user_answer: `answer ${i}`, correct, role: 'practice', error_tag: correct ? null : 'sign_error' });
  }
  SKILLS.forEach((s, i) => db.insert('skill_states', { user_id: user.id, skill_id: s, mastery: (i % 10) / 10, attempts: 20 + i, correct: 12, streak: 1, ease: 2.3 }));
}

(async () => {
  const noise = db.insert('users', { email: 'noise@example.com', display_name: 'noise', account_type: 'standard', age_check: { adult: true } });
  const u = db.insert('users', { email: 'busy@example.com', display_name: 'busy', account_type: 'standard', age_check: { adult: true } });
  history(noise, 2000);
  history(u, 5000);
  for (let i = 0; i < 12; i += 1) db.insert('tutor_facts', { user_id: u.id, kind: i % 2 ? 'misconception' : 'hard', text: `fact ${i} about skill_${i}`, skill_id: SKILLS[i], strength: 1, confirmations: 2, first_at: new Date().toISOString(), last_at: new Date().toISOString() });
  require('../services/scorecard').get(u.id); // a stored scorecard, as every active learner has
  tutor.note(u.id, { where: 'home', learnerSaid: 'I want to get better at fractions', tutorSaid: 'Good goal.' });
  await new Promise((r) => setTimeout(r, 50));

  const page = { path: '/practice', skill_id: 'skill_3', question: 'What is 3/4 + 1/8?', heading: 'Practice', text: 'fractions' };
  const text = () => tutor.contextText(u.id, { skillId: 'skill_3', about: 'what is 3/4 + 1/8 fractions' });
  const full = () => { dock.build(u.id, page, 'full'); text(); };

  await check('the generated learner really has 5,000 events', () => {
    assert.strictEqual(db.find('events', (e) => e.user_id === u.id).length, 5000);
  });

  await check('tutor context (dock block + notes + facts + strategy) builds in under 30 ms with 5,000 events', () => {
    full(); // warm-up
    const t = median(Array.from({ length: 15 }, () => ms(full)));
    console.log(`     median ${t.toFixed(1)} ms`);
    assert.ok(t < 30, `median ${t.toFixed(1)} ms`);
  });

  await check('the context for that learner is not empty (the timing measures real work)', () => {
    assert.ok(text().includes('Skills still weak'));
    assert.ok(dock.build(u.id, page, 'full').text.includes('Mastery'));
  });

  await check('a dock reply makes one model call on its path; note-taking runs after it, under another task', async () => {
    calls.length = 0;
    const seen = [];
    const ai = require('../services/ai');
    const talk = ai.talk;
    ai.talk = (opts) => { seen.push({ task: opts.task, at: Date.now() }); return talk.call(ai, opts); };
    let replied;
    try {
      const p = dock.reply({ user: u, messages: [{ role: 'user', content: 'help me with this' }], page });
      replied = await p;
      const atReply = seen.map((s) => s.task);
      assert.deepStrictEqual(atReply.filter((t) => t === 'dock_help'), ['dock_help']);
      assert.ok(replied.reply);
      await new Promise((r) => setTimeout(r, 50));
    } finally { ai.talk = talk; }
    const other = seen.filter((s) => s.task !== 'dock_help');
    assert.ok(other.every((s) => s.task === 'assist_help'), JSON.stringify(seen));
    assert.strictEqual(seen.filter((s) => s.task === 'dock_help').length, 1);
    assert.ok(other.length <= 1, 'at most the one note-taking call');
  });

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
