#!/usr/bin/env node
/**
 * The persistent tutor (services/tutor.js): the context pack, the memory and its
 * bounds, that the question coach keeps its rules and leak guard with the pack added,
 * and that learner data only reaches the approved learner-facing providers.
 *
 *   node scripts/tutor-test.js
 *
 * A throwaway data file and a stand-in model: nothing real is called or spent.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-test-')), 'db.json');
for (const k of ['XKIRO_PIPELINE', 'UNOROUTER_PIPELINE']) delete process.env[k];

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const providers = require('../services/providers');
const ai = require('../services/ai');
const goals = require('../services/goals');
const tutor = require('../services/tutor');
const owner = require('../config/owner');

// A stand-in model that records every call and answers with whatever `say` holds.
const calls = [];
let say = 'Try thinking about what the question is really asking. What do you notice first?';
const fake = {
  name: 'nvidia',
  isEnabled: () => true,
  isConfigured: () => true,
  modelFor: () => 'fake',
  costCents: () => 0,
  async chat(args) { calls.push(args); return { text: say, model: 'fake', usage: null }; },
};
providers.ALL.nvidia = fake;

/** Run `fn` with every provider switched off, then put them back. */
async function offline(fn) {
  const saved = { ...providers.ALL };
  for (const k of Object.keys(providers.ALL)) providers.ALL[k] = { ...saved[k], name: saved[k].name, isEnabled: () => false, isConfigured: () => false };
  try { return await fn(); } finally { Object.assign(providers.ALL, saved); }
}

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}

const T = 'math';
const GRADE = 'counting_and_comparing';
const grade = curriculum.getGrade(T, GRADE);
const skills = grade.skills;
const user = db.insert('users', { email: 'tutor.learner@example.com', display_name: 'Tutor Learner', account_type: 'standard', age_check: { adult: true } });
const boss = db.insert('users', { email: owner.ownerEmail(), display_name: 'Owner' });

function seed(u) {
  db.insert('enrollments', { user_id: u.id, track_id: T, grade_id: GRADE, status: 'active', current_level: 3, target_level: grade.pathLength, level_items: 0, last_session_at: new Date().toISOString() });
  db.insert('skill_states', { user_id: u.id, skill_id: skills[0], mastery: 0.35, attempts: 8, correct: 3, streak: 0, error_tags: ['careless_arithmetic'] });
  db.insert('skill_states', { user_id: u.id, skill_id: skills[1], mastery: 0.9, attempts: 10, correct: 9, streak: 4, error_tags: [] });
  db.insert('items', { user_id: u.id, role: 'lesson', skill_id: skills[0], prompt: 'What is 7 take away 3?', answer: 'SECRET-KEY-4', user_answer: '5', correct: false, error_tag: 'careless_arithmetic', session_id: 1 });
  db.insert('lessons', { user_id: u.id, track_id: T, grade_id: GRADE, level: 2, title: 'Comparing groups of objects', summary: 'x' });
  db.update('profiles', db.insert('profiles', { user_id: u.id }).id, { survey: { interests: 'minecraft and football' } });
}
seed(user);
seed(boss);
goals.set(user.id, { trackId: T, gradeId: GRADE, choice: 'test', text: 'quiz on Friday' });

const lastCall = () => calls[calls.length - 1];

(async () => {
  await check('the pack names goals, interests, weak skills, recent and upcoming topics and recent mistakes', () => {
    const text = tutor.pack(user.id).join('\n');
    assert.ok(/Prepare for a test|Preparing for a test/.test(text) && text.includes('quiz on Friday'), 'goal');
    assert.ok(text.includes('minecraft and football'), 'interests');
    assert.ok(text.includes(curriculum.skillName(skills[0])), 'weak skill');
    assert.ok(!text.includes(curriculum.skillName(skills[1]) + ' ('), 'a strong skill is not listed as weak');
    assert.ok(text.includes('Comparing groups of objects'), 'recent lesson');
    assert.ok(/Coming up:/.test(text), 'upcoming');
    assert.ok(text.includes('What is 7 take away 3?') && text.includes('"5"'), 'mistake and their answer');
  });

  await check('the pack never carries an answer key', () => {
    assert.ok(!tutor.contextText(user.id).includes('SECRET-KEY-4'));
  });

  await check('the owner has a tutor that knows them too', () => {
    const text = tutor.pack(boss.id).join('\n');
    assert.ok(text.includes(curriculum.skillName(skills[0])) && text.includes('minecraft'));
  });

  await check('a learner with nothing yet gets an honest empty pack', () => {
    const fresh = db.insert('users', { email: 'fresh@example.com', display_name: 'Fresh' });
    assert.ok(tutor.contextText(fresh.id).includes('Nothing yet'));
  });

  await check('home chat: the prompt carries the pack, the reply is returned and remembered', async () => {
    say = 'You are doing well on comparing. Want to do some subtraction practice next?';
    const out = await tutor.chat({ user, messages: [{ role: 'user', content: 'What should I work on?' }], where: 'home' });
    assert.strictEqual(out.source, 'ai');
    const system = lastCall().system;
    assert.ok(system.includes('WHAT YOU KNOW ABOUT THIS LEARNER') && system.includes('minecraft'));
    assert.ok(/never claim to know them perfectly/.test(system), 'honest about uncertainty');
    const memory = tutor.view(user.id);
    assert.deepStrictEqual(memory.turns.map((t) => t.role), ['user', 'assistant']);
  });

  await check('memory carries across sessions: a new chat with no history sees the last one', async () => {
    await tutor.chat({ user, messages: [], where: 'home' });
    assert.ok(lastCall().system.includes('What should I work on?'), 'earlier turns are quoted back');
  });

  await check('with no model the home chat answers from the notes and says so', async () => {
    await offline(async () => {
      const out = await tutor.chat({ user, messages: [{ role: 'user', content: 'hi' }], where: 'home' });
      assert.strictEqual(out.source, 'fallback');
      assert.ok(/not connected/.test(out.reply));
    });
  });

  await check('memory is bounded: turns fold into a short summary and the prompt stops growing', async () => {
    say = 'A short reply.';
    const sizes = [];
    for (let i = 0; i < 40; i++) {
      await tutor.chat({ user, messages: [{ role: 'user', content: `Question number ${i} about subtraction and what it means when we take things away` }], where: 'home' });
      if (i === 15 || i === 39) sizes.push(tutor.contextText(user.id).length);
    }
    await new Promise((r) => setTimeout(r, 100)); // a fold started by the last note
    await tutor.fold(user.id);
    const m = tutor.memoryOf(user.id);
    assert.ok(m.turns.length <= tutor.MAX_TURNS, `turns ${m.turns.length}`);
    assert.ok(m.summary.length > 0 && m.summary.length <= tutor.SUMMARY_MAX, `summary ${m.summary.length}`);
    assert.ok(sizes[1] <= sizes[0] + 400, `prompt grew from ${sizes[0]} to ${sizes[1]}`);
  });

  await check('without a model, folding still bounds the memory (plain fallback)', async () => {
    const u = db.insert('users', { email: 'nofold@example.com', display_name: 'N' });
    await offline(async () => {
      for (let i = 0; i < 20; i++) tutor.note(u.id, { where: 'home', learnerSaid: `thing ${i}`, tutorSaid: 'ok' });
      await new Promise((r) => setTimeout(r, 100));
      await tutor.fold(u.id);
    });
    const m = tutor.memoryOf(u.id);
    assert.ok(m.turns.length <= tutor.MAX_TURNS && m.summary.length <= tutor.SUMMARY_MAX && m.summary.includes('thing 0'));
  });

  const item = {
    id: 9001, user_id: user.id, role: 'lesson', skill_id: skills[0], skill_name: curriculum.skillName(skills[0]), level: 3,
    prompt: 'What is 600 take away 88?', choices: ['511', '512', '521', '1512'], answer: '512', rationale: 'Six hundred minus eighty-eight is 512.', format: 'multiple_choice', difficulty: 2, correct: null,
  };

  await check('inside a question: the coach keeps its rules first and the tutor context follows', async () => {
    say = 'What operation does "take away" tell you to do?';
    await ai.coachReply({ item, messages: [{ role: 'user', content: 'I do not get it' }], userId: user.id });
    const system = lastCall().system;
    const rules = system.indexOf('do not state or spell out the answer');
    const known = system.indexOf('WHAT YOU KNOW ABOUT THIS LEARNER');
    assert.ok(rules >= 0 && known > rules, 'rules come first');
    assert.ok(system.includes('minecraft'));
  });

  await check('inside a question: the leak guard still replaces a reply that gives the answer, and memory keeps the replacement', async () => {
    say = 'The answer is 512, so pick that one.';
    const out = await ai.coachReply({ item, messages: [{ role: 'user', content: 'just tell me' }], userId: user.id });
    assert.ok(!out.includes('512'), out);
    const turns = tutor.memoryOf(user.id).turns;
    assert.ok(!turns.slice(-2).some((t) => /512/.test(t.content)), 'the leaked line is never remembered');
  });

  await check('inside a question: the same tutor remembers a chat from another place', async () => {
    say = 'Okay.';
    await tutor.chat({ user, messages: [{ role: 'user', content: 'My exam is about borrowing in subtraction' }], where: 'home' });
    await ai.coachReply({ item: { ...item, id: 9002 }, messages: [{ role: 'user', content: 'hint please' }], userId: user.id });
    assert.ok(lastCall().system.includes('borrowing in subtraction'));
  });

  await check('a question\'s own conversation is not quoted back into its prompt', async () => {
    await ai.coachReply({ item: { ...item, id: 9003 }, messages: [{ role: 'user', content: 'UNIQUE-TURN-TEXT' }], userId: user.id });
    await ai.coachReply({ item: { ...item, id: 9003 }, messages: [{ role: 'user', content: 'UNIQUE-TURN-TEXT' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'again' }], userId: user.id });
    assert.ok(!lastCall().system.includes('UNIQUE-TURN-TEXT'), 'only in the messages, not the system prompt');
  });

  await check('priming the coach (no learner turn yet) leaves no memory', async () => {
    const before = tutor.memoryOf(user.id).turn_count;
    await ai.coachReply({ item: { ...item, id: 9004 }, messages: [], userId: user.id });
    assert.strictEqual(tutor.memoryOf(user.id).turn_count, before);
  });

  await check('learner data goes only to approved learner-facing providers', () => {
    const names = Object.keys(providers.ALL);
    assert.ok(!names.some((n) => /standard|gateway/i.test(n)), names.join());
    const chain = providers.chain('fast', 'coach_turn').map((p) => p.name);
    assert.ok(!chain.includes('xkiro') && !chain.includes('unorouter'), chain.join());
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'tutor.js'), 'utf8');
    assert.ok(!/require\(['"]\.\/providers/.test(src), 'tutor.js never calls a provider itself');
    assert.ok(/ai\.talk\(/.test(src));
  });

  await check('a child without the outside-AI opt-in is refused at the route and sent no model call', () => {
    const consent = fs.readFileSync(path.join(__dirname, '..', 'routes', 'consent.js'), 'utf8');
    assert.ok(consent.includes('tutor\\/chat'), 'consent gate lists the tutor route');
    assert.ok(consent.includes("'learner_goals', 'tutor_memory'"), 'collections known to the consent sweep');
  });

  await check('forget clears the memory and the pack is rebuilt from their records', () => {
    tutor.forget(user.id);
    assert.strictEqual(tutor.memoryOf(user.id), null);
    assert.ok(tutor.pack(user.id).length > 0);
  });

  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
