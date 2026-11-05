/**
 * "Instant" (owner, 3 Nov 2026): nothing a learner waits on is slow unless it has to be written when they arrive.
 *
 *   node scripts/instant-test.js      (also run by `npm test`)
 *
 * No model is called. Covers: the pool's waiting-learner lane (a permit kept free, an 8 s backup to the cheapest paid slot for a
 * waiting learner and never for background work, promotion of a write a learner then asks for); the write-ahead (checkpoints
 * written ahead for base and tailored learners, the first level after a placement jumping the caps and running in the
 * waiting-learner lane, the daily cap, the 7-day dormancy of passive triggers); a checkpoint start that never waits on writing;
 * and uploads starting their notes and pack on upload (limits kept, background lane, off switch).
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO|UNOROUTER)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ownCopy = path.join(os.tmpdir(), `instant-test-${process.pid}.json`);
fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
process.env.DB_FILE = ownCopy;
process.on('exit', () => { try { fs.unlinkSync(ownCopy); } catch { /* gone */ } });
for (const name of ['WRITE_AHEAD', 'WRITE_AHEAD_LEVELS', 'WRITE_AHEAD_SONNET', 'WRITE_AHEAD_PER_USER', 'WRITE_AHEAD_GLOBAL', 'WRITE_AHEAD_DAILY_CAP', 'WRITE_AHEAD_FAST',
  'WRITE_AHEAD_DORMANT_DAYS', 'BLOCK_LEVELS', 'BLOCK_GENERATE', 'BLOCK_TAILOR_OWNER', 'POOL_FOREGROUND_RESERVE', 'POOL_FOREGROUND_HEDGE_MS']) delete process.env[name];
delete process.env.UPLOAD_AUTOBUILD; // run-tests turns it off; this test turns it on with fake builders
process.env.TESTER_TAILORING = 'off';
process.env.OWNER_EMAIL = `instant-owner-${process.pid}@example.test`;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const learner = require('../services/learner');
const pool = require('../services/pool');
const blockLevels = require('../services/block-levels');
const writeAhead = require('../services/write-ahead');
const cps = require('../services/block-checkpoints');
const autobuild = require('../services/material-autobuild');
const ai = require('../services/ai');

let failed = 0;
async function check(label, fn) {
  try { await fn(); console.log(`  ok   ${label}`); } catch (err) { failed++; console.log(`  FAIL ${label} — ${String(err.message).slice(0, 400)}`); }
}
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** A fake slot. o: ms (latency), conc, price (USD per call: paid), hang (never answers until aborted). */
function fake(id, o = {}) {
  const log = [];
  const slot = pool.makeSlot({
    id, provider: id, label: id, maxConcurrent: o.conc || 2, latencyHintMs: o.ms || 30, dataClass: 'learner',
    priceIn: o.price ? 1 : 0, priceOut: o.price ? 1 : 0, estimateUsd: o.price ? () => o.price : null, costOf: o.price ? () => o.price : null,
    call: async (req, ctx) => {
      log.push({ n: req.n, at: Date.now() });
      if (o.hang) await new Promise((_, rej) => ctx.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { aborted: true })), { once: true }));
      await sleep(o.ms || 30);
      return { data: { n: req.n, by: id }, usage: { input_tokens: 10, output_tokens: 10 }, model: id };
    },
  });
  slot.log = log;
  return slot;
}
const call = (n, slots, opts = {}) => pool.callHedged({ kind: 'structured', n }, { slots, timeoutMs: 600, ...opts });

(async () => {
  console.log('the pool: a waiting learner comes first');
  await check('background calls leave a permit free; a foreground call starts at once', async () => {
    pool._reset();
    const f = fake('F', { ms: 250, conc: 2 });
    const t0 = Date.now();
    const bg1 = pool.runBackground(() => call(1, [f]));
    await sleep(20);
    const bg2 = pool.runBackground(() => call(2, [f])); // second permit is reserved: waits for the first
    await sleep(20);
    const fg = await call(3, [f]); // a learner is waiting: takes the reserved permit now
    const fgStart = f.log.find((l) => l.n === 3).at - t0;
    await Promise.all([bg1, bg2]);
    const bg2Start = f.log.find((l) => l.n === 2).at - t0;
    assert.ok(fg && fgStart < 120, `foreground started after ${fgStart} ms`);
    assert.ok(bg2Start >= 200, `background second call started after ${bg2Start} ms (should wait for the first)`);
  });
  await check('a foreground call that has waited goes to the paid slot; a background call never pays for speed', async () => {
    pool._reset();
    process.env.POOL_FOREGROUND_HEDGE_MS = '120';
    const slow = () => fake('S', { hang: true });
    const paid = () => fake('P', { ms: 20, price: 0.001 });
    const fg = await call(1, [slow(), paid()]);
    assert.ok(fg && fg.pool.slot === 'P', `foreground winner ${fg && fg.pool.slot}`);
    const bg = await pool.runBackground(() => call(2, [slow(), paid()], { timeoutMs: 1200 }));
    const pAttempt = bg && bg.pool.attempts.find((a) => a.slot === 'P');
    assert.ok(pAttempt && pAttempt.why === 'fallback' && bg.pool.attempts[0].slot === 'S' && !bg.pool.attempts[0].ok, `background: the paid slot is only a last resort after the free one failed (${JSON.stringify(bg && bg.pool.attempts.map((a) => `${a.slot}:${a.why}`))})`);
    // Every free slot busy: the waiting learner overflows to the paid slot after the wait, background waits.
    pool._reset();
    const busy = fake('B', { ms: 400, conc: 1 });
    const p2 = fake('P2', { ms: 20, price: 0.001 });
    const hold = call(0, [busy], { timeoutMs: 2000 });
    await sleep(20);
    const t0 = Date.now();
    const over = await call(5, [busy, p2], { timeoutMs: 2000 });
    assert.ok(over && over.pool.slot === 'P2' && Date.now() - t0 < 350, `overflow winner ${over && over.pool.slot} after ${Date.now() - t0} ms`);
    await hold;
    delete process.env.POOL_FOREGROUND_HEDGE_MS;
  });
  await check('a background write a learner then asks for is promoted to the waiting-learner lane', async () => {
    let store = null;
    await pool.runBackground(async () => {
      store = pool.laneStore();
      assert.ok(pool.inBackground());
      pool.promote(store);
      assert.ok(!pool.inBackground(), 'promoted in place');
    });
    await pool.runBackground(() => pool.runForeground(async () => { assert.ok(!pool.inBackground()); }));
  });

  console.log('\nthe write-ahead');
  const TRACK = 'english';
  const GRADE = 'proficient';
  const mk = (tag) => {
    const user = db.insert('users', { email: `instant-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`, display_name: tag, password_hash: 'x', xp: 0, streak: 0, onboarded: true });
    learner.saveProfile(user.id, { subscription: 'pro' });
    return user;
  };
  const enroll = (user, level) => db.insert('enrollments', {
    user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: curriculum.getGrade(TRACK, GRADE).pathLength, current_level: level, status: 'active', xp: 0, level_items: 0,
  });
  const realEnsure = blockLevels.ensure;
  const realAiReady = blockLevels.aiReady;
  const realMay = blockLevels.mayGenerate;
  const realPending = blockLevels.sonnetPending;
  const realFindPlan = blockLevels.findPlan;
  const realPrefetch = cps.prefetch;
  const realShared = cps.prefetchShared;
  const realReady = cps.isReady;
  const ensured = [];
  let ensureMs = 0;
  blockLevels.aiReady = () => true;
  blockLevels.mayGenerate = () => true;
  blockLevels.sonnetPending = () => false;
  blockLevels.findPlan = () => null;
  blockLevels.ensure = async (a) => { ensured.push({ ...a, at: Date.now(), background: pool.inBackground() }); await sleep(ensureMs); return { id: 1, check_tier: 'free' }; };
  const cp = [];
  cps.prefetch = (a) => { cp.push({ kind: 'own', level: a.level, background: pool.inBackground() }); };
  cps.prefetchShared = (a) => { cp.push({ kind: 'shared', level: a.level, background: pool.inBackground() }); };
  cps.isReady = () => false;
  const grade = curriculum.getGrade(TRACK, GRADE);

  await check('a checkpoint inside the horizon is written ahead (the learner\'s own, or the level\'s shared quiz), as background', async () => {
    writeAhead.reset();
    const u = mk('cp');
    const e = enroll(u, 50);
    const steps = writeAhead.trigger({ user: u, enrollment: e, grade, reason: 'prefetch' });
    const step = steps.find((s) => s.kind === 'checkpoint');
    assert.ok(step && step.level === 51, `steps ${JSON.stringify(steps.map((s) => `${s.level}:${s.kind}`))}`);
    assert.strictEqual(cp.length, 1);
    assert.strictEqual(cp[0].kind, step.tailored ? 'own' : 'shared');
    assert.ok(cp[0].background, 'written in the background lane');
    await writeAhead.idle();
  });
  await check('the first level after a placement is fast: it ignores the caps and runs in the waiting-learner lane', async () => {
    writeAhead.reset();
    ensured.length = 0;
    ensureMs = 300;
    process.env.WRITE_AHEAD_GLOBAL = '1';
    process.env.WRITE_AHEAD_PER_USER = '1';
    const a = mk('busy');
    writeAhead.trigger({ user: a, enrollment: enroll(a, 50), grade, reason: 'prefetch' });
    await sleep(30);
    const b = mk('placed');
    const t0 = Date.now();
    writeAhead.trigger({ user: b, enrollment: enroll(b, 50), grade, reason: 'placed' });
    await sleep(60);
    const first = ensured.find((x) => x.userId === b.id && x.level === 50);
    assert.ok(first, 'the placed learner\'s first level started while the global cap was full');
    assert.ok(first.at - t0 < 100, `started after ${first.at - t0} ms`);
    assert.strictEqual(first.background, false, 'fast lane');
    assert.ok(ensured.filter((x) => x.userId === a.id).every((x) => x.background), 'ordinary write-ahead is background');
    await writeAhead.idle();
    delete process.env.WRITE_AHEAD_GLOBAL;
    delete process.env.WRITE_AHEAD_PER_USER;
    ensureMs = 0;
  });
  await check('a learner has a daily cap of background writes (the fast first level is exempt)', async () => {
    writeAhead.reset();
    ensured.length = 0;
    cp.length = 0;
    process.env.WRITE_AHEAD_DAILY_CAP = '2';
    const u = mk('cap');
    const e = enroll(u, 50);
    writeAhead.trigger({ user: u, enrollment: e, grade, reason: 'prefetch' });
    await writeAhead.idle();
    const first = ensured.filter((x) => x.userId === u.id).length + cp.length;
    assert.ok(writeAhead.writesToday(u.id) === 2, `counted ${writeAhead.writesToday(u.id)}`);
    assert.ok(first <= 2 + 0, `wrote ${first} with a cap of 2`);
    assert.ok(writeAhead.events.some((x) => x.type === 'daily-cap'), 'the cap was hit and noted');
    const f = mk('capfast');
    writeAhead.trigger({ user: f, enrollment: enroll(f, 50), grade, reason: 'placed' });
    await writeAhead.idle();
    assert.ok(ensured.some((x) => x.userId === f.id && x.level === 50), 'fast first level is not capped');
    delete process.env.WRITE_AHEAD_DAILY_CAP;
  });
  await check('a learner inactive for 7 days gets nothing from a passive trigger until they act', async () => {
    writeAhead.reset();
    ensured.length = 0;
    const u = mk('dormant');
    const e = enroll(u, 50);
    const old = new Date(Date.now() - 9 * 86400000).toISOString();
    // db.update stamps updated_at, so the rows are aged in place.
    for (const row of [db.byId('users', u.id), db.byId('enrollments', e.id)]) { row.created_at = old; row.updated_at = old; }
    const fresh = db.byId('users', u.id);
    assert.ok(writeAhead.dormant(fresh), 'dormant after 9 days');
    assert.deepStrictEqual(writeAhead.trigger({ user: fresh, enrollment: db.byId('enrollments', e.id), grade, reason: 'sweep', passive: true }), []);
    assert.ok(writeAhead.events.some((x) => x.type === 'dormant'));
    // They come back: a request-driven trigger runs, and they are not dormant any more.
    const steps = writeAhead.trigger({ user: fresh, enrollment: db.byId('enrollments', e.id), grade, reason: 'dashboard' });
    assert.ok(steps.length > 0, 'a returning learner is written ahead');
    assert.ok(!writeAhead.dormant(fresh));
    await writeAhead.idle();
  });
  blockLevels.ensure = realEnsure; blockLevels.aiReady = realAiReady; blockLevels.mayGenerate = realMay; blockLevels.sonnetPending = realPending;
  blockLevels.findPlan = realFindPlan; cps.prefetch = realPrefetch; cps.prefetchShared = realShared; cps.isReady = realReady;

  console.log('\nstarting a checkpoint');
  await check('claim() never waits on writing: what is not ready is left to the bank, and the write carries on', async () => {
    const realDetail = ai.structuredDetail;
    const realReadyAi = blockLevels.aiReady;
    let called = 0;
    ai.structuredDetail = () => { called++; return new Promise(() => {}); }; // a write that never finishes
    blockLevels.aiReady = () => true;
    const u = mk('claim');
    const e = enroll(u, 51);
    const entries = require('../services/sessions').planCheckpoint({ ...e, current_level: 51 }, grade, curriculum.levelKind(51, grade.pathLength, grade));
    const t0 = Date.now();
    const out = await cps.claim({ userId: u.id, enrollment: e, grade, level: 51, entries, attempt: 1, waitMs: 80 });
    const took = Date.now() - t0;
    ai.structuredDetail = realDetail;
    blockLevels.aiReady = realReadyAi;
    assert.deepStrictEqual(out, {});
    assert.ok(took < 400, `claim took ${took} ms`);
    assert.ok(called >= 1, 'the write was started and left running in the background');
  });

  console.log('\nuploads');
  await check('placement does not rewrite the HTML base page of a level the learner reads as a block level (it hogged Coral Fast, 4 Nov walk)', async () => {
    const levelEditor = require('../services/level-editor');
    const user = mk('editor-skip');
    const grade = curriculum.getGrade(TRACK, GRADE);
    const enr = enroll(user, 10);
    assert.strictEqual(blockLevels.kindFor(grade, 10), 'lesson', 'level 10 is a block lesson level');
    let calls = 0;
    const realStructured = ai.structured;
    ai.structured = async (...a) => { calls += 1; return realStructured(...a); };
    try {
      const out = await levelEditor.ensure({ userId: user.id, enrollment: enr, grade, level: 10 });
      assert.strictEqual(out, null, 'nothing to serve');
      assert.strictEqual(calls, 0, 'no model call was started');
    } finally { ai.structured = realStructured; }
  });
  await check('a new material starts its notes and study pack at once, one at a time per learner, as background work', async () => {
    autobuild.reset();
    const order = [];
    const deps = {
      ai: { isEnabled: () => true },
      outside: () => true,
      notes: { build: async () => { order.push(['notes:start', pool.inBackground()]); await sleep(60); order.push(['notes:end']); return {}; } },
      packs: { buildWithRetry: async (u, id, { between }) => between(async () => { order.push(['pack:start', pool.inBackground()]); await sleep(20); order.push(['pack:end']); return {}; }) },
    };
    const out = autobuild.start(990001, 7, deps);
    assert.deepStrictEqual(out.started, ['notes', 'pack']);
    await sleep(250);
    assert.deepStrictEqual(order.map((o) => o[0]), ['notes:start', 'notes:end', 'pack:start', 'pack:end'], 'one build at a time');
    assert.ok(order.filter((o) => o[0].endsWith(':start')).every((o) => o[1] === true), 'background lane');
  });
  await check('opening the notes or the pack while their build runs promotes it to the waiting-learner lane (walk 4 Nov: 160 s on busy free models)', async () => {
    autobuild.reset();
    const seen = { notes: [], pack: [] };
    let release;
    const hold = new Promise((r) => { release = r; });
    const deps = {
      ai: { isEnabled: () => true },
      outside: () => true,
      notes: { build: async () => { seen.notes.push(pool.inBackground()); await hold; seen.notes.push(pool.inBackground()); return {}; } },
      packs: { buildWithRetry: async (u, id, { between }) => between(async () => { seen.pack.push(pool.inBackground()); await hold; seen.pack.push(pool.inBackground()); return {}; }) },
    };
    autobuild.start(990011, 3, deps);
    await sleep(30);
    assert.strictEqual(autobuild.promote(990012, 3), 0, 'another learner promotes nothing');
    assert.strictEqual(autobuild.promote(990011, 3, ['notes']), 1, 'the learner opened the notes');
    release();
    await sleep(80);
    assert.deepStrictEqual(seen.notes, [true, false], 'notes: background at start, a waiting learner after opening');
    assert.strictEqual(autobuild.promote(990011, 3), 0, 'nothing left running to promote');
  });
  await check('uploads: no consent, no model, over the daily cap, or switched off: nothing starts', async () => {
    autobuild.reset();
    const base = { notes: { build: async () => ({}) }, packs: { buildWithRetry: async () => ({}) } };
    assert.strictEqual(autobuild.start(990002, 1, { ...base, ai: { isEnabled: () => true }, outside: () => false }).skipped, 'no consent');
    assert.strictEqual(autobuild.start(990002, 1, { ...base, ai: { isEnabled: () => false }, outside: () => true }).skipped, 'no model');
    process.env.UPLOAD_AUTOBUILD_PER_DAY = '1';
    const ok = { ...base, ai: { isEnabled: () => true }, outside: () => true };
    assert.deepStrictEqual(autobuild.start(990003, 1, ok).started, ['notes', 'pack']);
    assert.strictEqual(autobuild.start(990003, 2, ok).skipped, 'daily cap');
    delete process.env.UPLOAD_AUTOBUILD_PER_DAY;
    process.env.UPLOAD_AUTOBUILD = 'off';
    assert.strictEqual(autobuild.start(990004, 1, ok).skipped, 'off');
    delete process.env.UPLOAD_AUTOBUILD;
    await sleep(50);
  });

  pool._reset();
  if (failed) { console.log(`\n${failed} failure(s)`); process.exit(1); }
  console.log('\nall instant checks passed');
  process.exit(0);
})();
