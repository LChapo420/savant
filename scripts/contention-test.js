#!/usr/bin/env node
/**
 * Free-model contention (backlog N1), mocked models and fake clocks only:
 *   1. one material build at a time per learner (services/build-gate.js), and a pack whose models were
 *      all unavailable retries with backoff instead of ending "failed"
 *   2. tutor fact extraction: its own light task, once per 3 turns or on close, never while a dock reply
 *      for that learner is in flight, dropped (not queued) when the models are busy
 *   3. NVIDIA: at most 2 learner-facing calls in flight, dock replies ahead of builds ahead of fact extraction
 *
 *   node scripts/contention-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'contention-')), 'db.json');
for (const k of Object.keys(process.env)) if (/^NVIDIA_(TIER|ROLE|TASK)_/.test(k)) delete process.env[k];
process.env.NVIDIA_API_KEY = 'test-key';
delete process.env.MODEL_LINEUP_FILE;

const nvidia = require('../services/providers/nvidia');
const gate = require('../services/build-gate');
const db = require('../config/db');

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); } catch (err) { failed++; console.log(`  FAIL ${name}\n       ${err.message}`); }
}
const tick = () => new Promise((r) => setImmediate(r));
const ok = (content = 'hi') => {
  const payload = { model: 'x', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content, reasoning_content: null } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  return { ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => payload, text: async () => JSON.stringify(payload) };
};

(async () => {
  console.log('\nthe per-learner build line');
  await check('a learner\'s builds run one at a time, in order; another learner is not held up', async () => {
    const log = [];
    const gates = {};
    const job = (name) => () => new Promise((r) => { gates[name] = () => { log.push(`end ${name}`); r(name); }; log.push(`start ${name}`); });
    const a = gate.run('u1', 'pack:1', job('pack'));
    const b = gate.run('u1', 'course:1', job('course'));
    const c = gate.run('u2', 'pack:9', job('other'));
    await tick();
    assert.deepStrictEqual(log, ['start pack', 'start other']);
    assert.ok(gate.queuedFor('u1', 'course:1'));
    assert.deepStrictEqual(gate.state('u1'), { running: 'pack:1', waiting: ['course:1'] });
    gates.pack(); await tick();
    assert.ok(log.includes('start course'));
    assert.ok(!gate.queuedFor('u1', 'course:1'));
    gates.course(); gates.other();
    assert.deepStrictEqual(await Promise.all([a, b, c]), ['pack', 'course', 'other']);
    assert.strictEqual(gate.busy('u1'), false);
  });
  await check('a failing build does not block the line', async () => {
    const bad = gate.run('u3', 'a', async () => { throw new Error('boom'); });
    const good = gate.run('u3', 'b', async () => 'fine');
    await assert.rejects(bad);
    assert.strictEqual(await good, 'fine');
  });

  console.log('\nstudy pack retry when every model was unavailable');
  const materials = require('../services/materials');
  const packs = require('../services/material-pack');
  const user = db.insert('users', { email: 'c@example.com', display_name: 'C', account_type: 'standard', age_check: { adult: true } });
  const text = 'Photosynthesis is the process by which plants make sugar from light. '.repeat(60);
  const added = materials.addPaste(user.id, 'Plants', text);
  const mat = added.value;
  await check('unavailable models: retried on the backoff, then built; the row never says failed in between', async () => {
    let calls = 0;
    const llm = async () => { calls++; return calls <= 4 ? null : { data: { summary: ['Plants make sugar from light.'], flashcards: [{ front: 'What do plants make?', back: 'Sugar from light.', passage_id: 'p1', quote: 'Photosynthesis is the process by which plants make sugar' }], questions: [] }, model: 'm' }; };
    const waits = [];
    const seen = [];
    const out = await packs.buildWithRetry(user.id, mat.id, {
      llm, sleep: async (ms) => { waits.push(ms); const r = packs.get(user.id, mat.id); seen.push(r && r.status); assert.ok(packs.activity(user.id, mat.id).retrying); },
      backoff: [10, 20, 30],
    });
    assert.ok(out.pack, JSON.stringify(out));
    assert.deepStrictEqual(waits, [10, 20]);
    assert.ok(seen.every((s) => s === 'building'), seen.join());
    assert.deepStrictEqual(packs.activity(user.id, mat.id), {});
  });
  await check('still unavailable after the last retry: "busy, try later", not "nothing passed the checks"', async () => {
    const waits = [];
    const out = await packs.buildWithRetry(user.id, mat.id, { llm: async () => null, force: true, sleep: async (ms) => { waits.push(ms); }, backoff: [1, 2, 3] });
    assert.strictEqual(out.code, 'models_busy');
    assert.strictEqual(waits.length, 3);
    assert.strictEqual(packs.get(user.id, mat.id).status, 'failed');
  });
  await check('a pack whose answers all fail the checks is not retried', async () => {
    let calls = 0;
    const waits = [];
    const out = await packs.buildWithRetry(user.id, mat.id, { llm: async () => { calls++; return { data: { summary: [], flashcards: [], questions: [] }, model: 'm' }; }, force: true, sleep: async (ms) => { waits.push(ms); }, backoff: [1, 2] });
    assert.strictEqual(out.code, 'nothing_verified');
    assert.strictEqual(waits.length, 0);
  });
  await check('each retry attempt takes its turn in the learner\'s line (the wait does not hold it)', async () => {
    const order = [];
    const between = (fn) => gate.run(user.id, 'pack:t', async () => { order.push('in'); const r = await fn(); order.push('out'); return r; });
    await packs.buildWithRetry(user.id, mat.id, { llm: async () => null, force: true, sleep: async () => { order.push(`wait:${gate.busy(user.id)}`); }, backoff: [1], between });
    assert.deepStrictEqual(order, ['in', 'out', 'wait:false', 'in', 'out']);
  });

  console.log('\nthe route and page say what is happening');
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  await check('course, pack, extend, retry and podcast go through the line; GETs report queued/retrying', () => {
    const r = src('routes/materials.js');
    assert.ok(/queueBuild\(userId, `course:\$\{m\.id\}`/.test(r));
    assert.ok(/queueBuild\(userId, `course:\$\{c\.material_id\}`, \(\) => extend\.start/.test(r));
    assert.ok(/queueBuild\(req\.user\.id, `podcast:/.test(r));
    assert.ok(/between: \(fn\) => gate\.run/.test(r));
    assert.ok(/activity: activityOf\(req\.user\.id, `pack:/.test(r) && /activity: activityOf\(req\.user\.id, `course:/.test(r));
    const js = src('public/js/my-material.js');
    assert.ok(/Queued…/.test(js) && /trying your \$\{what\} again by itself/.test(js));
  });

  console.log('\ntutor fact extraction');
  const facts = require('../services/tutor-facts');
  const providers = require('../services/providers');
  let busy = false;
  const asked = [];
  providers.ALL.nvidia = {
    name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'fake', costCents: () => 0,
    learnerBusy: () => busy,
    async chat(args) { asked.push(args); return { text: '[]', model: 'fake', usage: null }; },
  };
  const turn = (n) => ({ learnerSaid: `I want to pass my chemistry exam question ${n}`, tutorSaid: 'ok', before: '', where: 'dock' });
  const fu = db.insert('users', { email: 'c2@example.com', display_name: 'C2', account_type: 'standard', age_check: { adult: true } }).id;
  await check('it has its own light task with reasoning off', () => {
    const lineup = JSON.parse(src('config/model-lineup.json'));
    const t = lineup.tasks.tutor_facts;
    assert.ok(t && t.only === true);
    assert.deepStrictEqual(t.models.map((m) => `${m.model.split('/').pop()}@${m.effort}`), ['nemotron-3.5-lightning-30b-a3b@off', 'glm-5.3-flash@off']);
    assert.ok(/task: 'tutor_facts'/.test(src('services/tutor-facts.js')));
  });
  await check('it runs once per 3 learner turns, not after every reply', async () => {
    asked.length = 0;
    assert.strictEqual((await facts.offer(fu, turn(1))).skipped, 'batching');
    assert.strictEqual((await facts.offer(fu, turn(2))).skipped, 'batching');
    assert.strictEqual(asked.length, 0);
    const r = await facts.offer(fu, turn(3));
    assert.strictEqual(r.skipped, null);
    assert.strictEqual(asked.length, 1);
    assert.ok(/question 1/.test(asked[0].messages[0].content) && /question 3/.test(asked[0].messages[0].content), 'one call reads all three turns');
    assert.strictEqual(asked[0].task, 'tutor_facts');
  });
  await check('closing the dock reads what is waiting; with nothing waiting it does nothing', async () => {
    asked.length = 0;
    await facts.offer(fu, turn(4));
    assert.strictEqual(asked.length, 0);
    await facts.flush(fu);
    assert.strictEqual(asked.length, 1);
    await facts.flush(fu);
    assert.strictEqual(asked.length, 1);
  });
  await check('never while a dock reply for that learner is in flight; kept and read later; other learners unaffected', async () => {
    asked.length = 0;
    const other = db.insert('users', { email: 'c3@example.com', display_name: 'C3', account_type: 'standard', age_check: { adult: true } }).id;
    facts.dockStarted(fu);
    await facts.offer(fu, turn(5));
    const held = await facts.flush(fu);
    assert.strictEqual(held.skipped, 'dock_in_flight');
    assert.strictEqual(asked.length, 0);
    await facts.flush(other); // nothing pending for them: no call, and no waiting on someone else's dock
    facts.dockEnded(fu);
    const later = await facts.flush(fu);
    assert.strictEqual(later.skipped, null);
    assert.strictEqual(asked.length, 1, 'the held turn was kept');
  });
  await check('dropped, not queued, when the models are busy', async () => {
    asked.length = 0;
    busy = true;
    await facts.offer(fu, turn(6));
    const r = await facts.flush(fu);
    assert.strictEqual(r.skipped, 'busy');
    busy = false;
    assert.strictEqual((await facts.flush(fu)).skipped, null);
    assert.strictEqual(asked.length, 0, 'the dropped turn was not kept for later');
  });
  await check('the dock marks its reply in flight, and closing the dock reaches the server', () => {
    const c = src('services/tutor-context.js');
    assert.ok(c.indexOf('facts.dockStarted(user.id)') < c.indexOf("task: 'dock_help'") && c.indexOf('facts.dockEnded(user.id)') > c.indexOf("task: 'dock_leak_check'"));
    assert.ok(/post\('\/tutor\/dock\/closed'/.test(src('routes/tutor.js')) && /\/api\/tutor\/dock\/closed/.test(src('public/js/tutor-dock.js')));
    assert.ok(/require\('\.\/tutor-facts'\)\.offer\(/.test(src('services/tutor.js')));
  });

  console.log('\nNVIDIA: learner-facing cap and order');
  const sent = [];
  const open = [];
  const mock = async (url, opts) => {
    const body = JSON.parse(opts.body);
    return new Promise((resolve) => { sent.push(body); open.push(() => resolve(ok())); });
  };
  const finishOne = async () => { open.shift()(); await tick(); await tick(); };
  const call = (task, role = 'fast') => nvidia.chat({ role, task, system: task, messages: [{ role: 'user', content: task }], maxTokens: 20 });
  const taskOf = (b) => b.messages[0].content;
  nvidia._reset();
  nvidia._setSleep(async () => {});
  nvidia._setFetch(mock);
  await check('classes: dock, build and fact tasks are learner-facing; others are not', () => {
    assert.strictEqual(nvidia.learnerClass('dock_help'), 'dock');
    assert.strictEqual(nvidia.learnerClass('dock_leak_check'), 'dock');
    assert.strictEqual(nvidia.learnerClass('material_pack'), 'build');
    assert.strictEqual(nvidia.learnerClass('material_lesson'), 'build');
    assert.strictEqual(nvidia.learnerClass('tutor_facts'), 'facts');
    assert.strictEqual(nvidia.learnerClass('author_items'), null);
    assert.strictEqual(nvidia.learnerClass(null), null);
  });
  await check('only 2 learner-facing calls are in flight at once', async () => {
    const ps = ['material_lesson', 'material_lesson', 'material_lesson', 'material_pack'].map((t) => call(t));
    await tick(); await tick();
    assert.strictEqual(sent.length, 2);
    assert.ok(nvidia.learnerBusy());
    while (open.length || sent.length < 4) { await finishOne(); }
    await Promise.all(ps);
    assert.strictEqual(sent.length, 4);
    assert.strictEqual(nvidia.learnerBusy(), false);
  });
  await check('other work (grading, authoring) is not counted against the cap', async () => {
    sent.length = 0; open.length = 0;
    const ps = [call('material_lesson'), call('material_lesson'), call('author_items'), call('grade_free_response')];
    await tick(); await tick();
    assert.strictEqual(sent.length, 4, sent.map(taskOf).join());
    while (open.length) await finishOne();
    await Promise.all(ps);
  });
  await check('a dock reply goes ahead of waiting builds, and builds ahead of fact extraction', async () => {
    sent.length = 0; open.length = 0;
    const ps = [call('material_lesson'), call('material_lesson'), call('tutor_facts'), call('material_pack'), call('dock_help')];
    await tick(); await tick();
    assert.strictEqual(sent.length, 2);
    const order = [];
    for (let i = 0; i < 3; i++) {
      const before = sent.length;
      await finishOne(); await tick();
      if (sent.length > before) order.push(taskOf(sent[sent.length - 1]));
    }
    assert.deepStrictEqual(order, ['dock_help', 'material_pack', 'tutor_facts']);
    while (open.length) await finishOne();
    await Promise.all(ps);
  });
  await check('NVIDIA_LEARNER_CAP raises the cap', async () => {
    sent.length = 0; open.length = 0;
    process.env.NVIDIA_LEARNER_CAP = '3';
    const ps = ['dock_help', 'material_pack', 'tutor_facts', 'material_lesson'].map((t) => call(t));
    await tick(); await tick();
    assert.strictEqual(sent.length, 3);
    delete process.env.NVIDIA_LEARNER_CAP;
    while (open.length || sent.length < 4) await finishOne();
    await Promise.all(ps);
  });

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
