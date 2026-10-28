/**
 * The write-ahead (services/write-ahead.js, WRITE_AHEAD) and the fixes that came
 * with it: a lesson level never shows its checks alone, a "writing" plan never
 * stays stuck, and failed levels are tried again.
 *
 *   node scripts/write-ahead-test.js      (also run by `npm test`)
 *
 * No model is called: every key is blanked, Ollama is off, the `blocks` route is
 * a stub, the owner's Anthropic key is a fake whose reader (Sonnet) is a stub, and
 * the blind re-solve has a stub judge. The ledger is a copy. It writes to its own
 * copy of the data file, deleted at the end.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO|UNOROUTER)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ownCopy = path.join(os.tmpdir(), `write-ahead-test-${process.pid}.json`);
fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
process.env.DB_FILE = ownCopy;
const ledgerCopy = path.join(os.tmpdir(), `write-ahead-ledger-${process.pid}.json`);
try { fs.copyFileSync(path.join(__dirname, '..', 'data', 'anthropic-ledger.json'), ledgerCopy); } catch { /* a fresh one is made */ }
process.env.ANTHROPIC_LEDGER_FILE = ledgerCopy;
require('../config/db');
process.on('exit', () => { for (const f of [ownCopy, ledgerCopy]) try { fs.unlinkSync(f); } catch { /* gone */ } });

for (const name of ['FACT_CHECK_ANTHROPIC_KEY', 'BLOCK_FACT_CHECK', 'BLOCK_FACT_GATE', 'FACT_PIPELINE', 'FACT_CHEAP_MODEL', 'LEVEL_SELF_CHECK', 'WRITE_AHEAD',
  'WRITE_AHEAD_LEVELS', 'WRITE_AHEAD_SONNET', 'WRITE_AHEAD_PER_USER', 'WRITE_AHEAD_GLOBAL', 'WRITE_AHEAD_RETRY_MS', 'ANTHROPIC_LEDGER_STOP_USD', 'BLOCK_LEVELS', 'BLOCK_GENERATE', 'BLOCK_TAILOR_OWNER']) delete process.env[name];
process.env.BLOCK_WAIT_MS = '2000';
// Tier matters here: tailored is decided by the plan, not the tester phase.
process.env.TESTER_TAILORING = 'off';
process.env.OWNER_EMAIL = `wa-owner-${process.pid}@example.test`;
// One Sonnet read per check, so the calls can be counted exactly.
process.env.FACT_PIPELINE = 'sonnet';
process.env.FACT_CHECK_ANTHROPIC_KEY = 'sk-ant-test-not-a-real-key';

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const learner = require('../services/learner');
const ai = require('../services/ai');
const providers = require('../services/providers');
const blockLevels = require('../services/block-levels');
const writeAhead = require('../services/write-ahead');
const keyGate = require('../services/key-gate');
const factReader = require('../services/fact-check-anthropic');
const lessons = require('../services/lessons');
const sessions = require('../services/sessions');

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  }
}

const TRACK = 'english';
const GRADE = 'proficient';
const grade = curriculum.getGrade(TRACK, GRADE);

function makeUser(tag, { email = null, subscription = 'pro' } = {}) {
  const user = db.insert('users', {
    email: email || `watest-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`,
    display_name: `WA ${tag}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true,
  });
  learner.saveProfile(user.id, { subscription });
  return user;
}
/** A tailored learner outside the 10% holdout on the levels used here. */
function tailoredUser(tag) {
  // eslint-disable-next-line global-require
  const personalize = require('../services/personalize');
  for (let i = 0; i < 60; i++) {
    const u = makeUser(tag);
    if ([10, 18, 19, 20, 28, 29, 30, 38, 39, 40, 48, 49, 50, 52].every((level) => personalize.armFor(u.id, { trackId: TRACK, gradeId: GRADE, level }).arm !== 'holdout')) return u;
  }
  throw new Error('no learner outside the holdout');
}
function enroll(user, level, track = TRACK, gradeId = GRADE) {
  return db.insert('enrollments', {
    user_id: user.id, track_id: track, grade_id: gradeId, target_level: curriculum.getGrade(track, gradeId).pathLength,
    current_level: level, status: 'active', xp: 0, level_items: 0,
  });
}
function moveTo(enrollment, level) { return db.update('enrollments', enrollment.id, { current_level: level }); }
const planOf = (owner, level) => db.findOne('block_plans', (p) => (p.user_id || null) === owner && p.track_id === TRACK && p.grade_id === GRADE && p.level === level) || null;

function samples() {
  const out = {};
  const root = path.join(__dirname, '..');
  for (const [reg, base] of [['public/engine/registry.json', 'public/engine/'], ['public/engine/retention/registry.json', 'public/engine/retention/']]) {
    const r = JSON.parse(fs.readFileSync(path.join(root, reg), 'utf8'));
    for (const [tag, b] of Object.entries(r)) {
      const ctx = {};
      ctx.window = ctx;
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(path.join(root, base, b.file.replace('./', '')), 'utf8'), ctx);
      const mod = ctx.LessonBlocks && ctx.LessonBlocks.get(tag);
      if (mod) out[tag] = JSON.parse(JSON.stringify(mod.testPayload));
    }
  }
  return out;
}

const levelIn = (text) => { const m = /LEVEL: (\d+) of/.exec(String(text || '')); return m ? Number(m[1]) : null; };
const MC = { prompt: 'Which sentence is the most formal?', choices: ['Hey, what\'s up?', 'Good afternoon, everyone.', 'Yo, listen up.', 'Sup, folks?'], answer: 'Good afternoon, everyone.', accepts: [], rationale: 'A full greeting with no slang marks formal tone.', hint: '' };
const TYPED = { prompt: 'One word for the writer\'s attitude toward the subject?', choices: [], answer: 'tone', accepts: [], rationale: 'Tone is the attitude a writer takes toward the subject.', hint: '' };
const claim = (where, text) => ({ where, claim: text, kind: 'fact', verdict: 'verified', evidence: 'knowledge', source_url: '', truth: '' });

(async () => {
  const realDetail = ai.structuredDetail;
  const realCurrent = providers.current;
  const realAsk = factReader.ask;
  const realResolve = keyGate.blindResolve;
  const stubProvider = { name: 'stub', modelFor: () => 'stub-glm', isEnabled: () => true };
  providers.current = (role) => (role === 'blocks' ? stubProvider : realCurrent(role));
  const payloads = samples();
  // Every call, by level and kind.
  const layouts = [];
  const freeReads = [];
  const sonnet = [];
  let delayMs = 0;
  let hang = null; // a level whose layout call never returns, while set
  let failFill = null; // a level whose fill returns nothing, while set
  ai.structuredDetail = async (args) => {
    const level = levelIn(args.user);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (args.schemaName === 'submit_layout') {
      layouts.push(level);
      if (hang && hang.level === level) return hang.promise;
      return null; // the default layout for the kind
    }
    if (args.schemaName === 'submit_block_content') {
      if (failFill === level) return null;
      const blocks = [...String(args.user).matchAll(/^BLOCK (\d+): (\S+)/gm)].map((m) => ({ index: Number(m[1]), data: payloads[m[2]] }));
      const checks = [...String(args.user).matchAll(/^CHECK (\d+): (\S+),/gm)].map((m) => ({ index: Number(m[1]), ...(m[2] === 'multiple_choice' ? MC : TYPED) }));
      return { model: 'stub-glm', usage: { input_tokens: 100, output_tokens: 100 }, data: { blocks, checks } };
    }
    if (args.schemaName === 'submit_verification') {
      freeReads.push(level);
      return { model: 'stub-glm', usage: { input_tokens: 10, output_tokens: 5 }, data: { claims: [claim('block 0', 'fine')] } };
    }
    return null;
  };
  factReader.ask = async (args) => {
    sonnet.push({ level: levelIn(args.user), what: args.schemaName });
    if (args.schemaName === 'submit_fact_sheet') return { data: { facts: [{ fact: 'Formal register avoids slang.', kind: 'established', source_url: 'https://example.org/r' }], misconceptions: [] }, usage: { input_tokens: 10, output_tokens: 5 }, cost: 0.01, sources: [], searches: 1, model: 'claude-sonnet-5-5' };
    return { data: { claims: [claim('block 0', 'fine')] }, usage: { input_tokens: 10, output_tokens: 5 }, cost: 0.02, sources: [], searches: 1, model: 'claude-sonnet-5-5' };
  };
  const judged = [];
  keyGate.blindResolve = (qs) => { judged.push(qs.length); return realResolve(qs, { judge: async (b) => b.map((q) => q.choices.indexOf(q.answer)) }); };
  const sonnetFor = (level) => sonnet.filter((s) => s.level === level);
  const reset = () => { layouts.length = 0; freeReads.length = 0; sonnet.length = 0; judged.length = 0; };
  // Fixtures, not content: this grade's stored plans are set aside on the copy.
  db.remove('block_plans', (p) => p.track_id === TRACK && p.grade_id === GRADE);

  try {
    console.log('\nthe switches');
    check('WRITE_AHEAD is on by default, with 3 levels and 1 Sonnet', blockLevels.writeAheadOn() && writeAhead.status().levels === 3 && writeAhead.status().sonnet === 1, writeAhead.status());
    check('the key\'s gate is on (fake key) and the ledger has room', blockLevels.gateOn() && blockLevels.sonnetAffordable());

    console.log('\nnothing unchecked is ever served');
    const free = { status: 'ready', check_tier: 'free', verification: { status: 'verified', model: 'stub-glm' }, self_check: { status: 'passed' } };
    check('a plan with no check is not served', !blockLevels.servable({ status: 'ready' }));
    check('a free claim read alone (no self-check) is not served', !blockLevels.servable({ ...free, self_check: null }));
    check('a failed free check is not served', !blockLevels.servable({ ...free, self_check: { status: 'failed' } }));
    check('a passed free check is served while its Sonnet check is pending', blockLevels.servable(free) && blockLevels.sonnetPending(free));
    check('a Sonnet-checked plan is served and is not pending', blockLevels.servable({ status: 'ready', check_tier: 'sonnet', verification: { status: 'verified', model: 'claude-sonnet-5-5' } })
      && !blockLevels.sonnetPending({ status: 'ready', check_tier: 'sonnet', verification: { status: 'verified', model: 'claude-sonnet-5-5' }, self_check: { status: 'passed' } }));
    check('older rows keep the gate\'s rule (verified = served)', blockLevels.servable({ status: 'ready', verification: { status: 'verified' } }));

    console.log('\na jump: the target level first, then the next 3 written levels');
    const learnerU = tailoredUser('learner');
    const e1 = enroll(learnerU, 11);
    moveTo(e1, 20); // as mastery.jumpToLevel leaves it
    const steps = writeAhead.trigger({ user: learnerU, enrollment: db.byId('enrollments', e1.id), grade, reason: 'jump' });
    check('target 20 and the next three written levels (28, 29, 30) are queued, past the practice levels between',
      steps.map((s) => s.level).join() === '20,28,29,30', steps);
    check('tiers: 20 open (free first, then Sonnet), 28 Sonnet, 29 and 30 free',
      steps.map((s) => s.tier).join() === 'open,sonnet,free,free', steps.map((s) => s.tier));
    const queued = writeAhead.status().queued;
    check('the target is first in the queue', queued[0] && /:20$/.test(queued[0].key) && queued.length === 4, queued);
    check('a tailored learner\'s levels are their own', queued.every((j) => j.key.startsWith(`${learnerU.id}:`)), queued);
    await writeAhead.idle();
    const p20 = planOf(learnerU.id, 20);
    const p28 = planOf(learnerU.id, 28);
    const p29 = planOf(learnerU.id, 29);
    const p30 = planOf(learnerU.id, 30);
    check('all four were written', [p20, p28, p29, p30].every((p) => p && p.status === 'ready'), [p20, p28, p29, p30].map((p) => p && p.status));
    check('1 ahead (28) is Sonnet-checked in advance: research and a Sonnet read, no free check',
      p28.check_tier === 'sonnet' && blockLevels.sonnetChecked(p28) && sonnetFor(28).map((s) => s.what).join() === 'submit_fact_sheet,submit_verification' && !p28.self_check, { tier: p28.check_tier, sonnet: sonnetFor(28) });
    check('2 and 3 ahead (29, 30) are free-checked: the claim read on the app route and the blind re-solve, no Sonnet',
      [p29, p30].every((p) => p.check_tier === 'free' && p.self_check && p.self_check.status === 'passed' && p.verification.model === 'stub-glm' && !p.fact_sheet)
      && !sonnetFor(29).length && !sonnetFor(30).length && freeReads.includes(29) && freeReads.includes(30), { s29: sonnetFor(29), s30: sonnetFor(30), freeReads });
    check('29 and 30 are served now (free check passed), Sonnet still pending', blockLevels.servable(p29) && blockLevels.sonnetPending(p29) && blockLevels.sonnetPending(p30));
    check('the target (20) was written on the free check, then Sonnet-checked right after',
      p20.check_tier === 'sonnet' && p20.self_check && p20.self_check.status === 'passed' && p20.sonnet_check && p20.sonnet_check.status === 'verified'
      && sonnetFor(20).map((s) => s.what).join() === 'submit_verification', { tier: p20.check_tier, sonnet: sonnetFor(20), sc: p20.sonnet_check });
    check('no level was written twice', layouts.filter((l) => l === 20).length === 1 && layouts.filter((l) => l === 28).length === 1
      && layouts.filter((l) => l === 29).length === 1 && layouts.filter((l) => l === 30).length === 1, layouts);

    console.log('\nopened before its Sonnet check: served on the free check, Sonnet runs on open');
    reset();
    const t0 = Date.now();
    const opened = await blockLevels.forLevel({ user: learnerU, trackId: TRACK, gradeId: GRADE, level: 30 });
    const openMs = Date.now() - t0;
    check(`served at once (${openMs} ms), the free-checked plan`, opened.plan && opened.plan.id === p30.id && openMs < 500, { openMs, writing: opened.writing });
    const key30 = blockLevels.planKey(learnerU.id, TRACK, GRADE, 30);
    check('its Sonnet check started on open, in the level\'s in-flight slot', blockLevels.inFlight.has(key30));
    await blockLevels.inFlight.get(key30);
    check('then it is Sonnet-checked', blockLevels.sonnetChecked(planOf(learnerU.id, 30)) && sonnetFor(30).length === 1, sonnetFor(30));
    const again = await blockLevels.forLevel({ user: learnerU, trackId: TRACK, gradeId: GRADE, level: 30 });
    check('opening it again asks Sonnet nothing more', again.plan && sonnetFor(30).length === 1 && !blockLevels.inFlight.has(key30));

    console.log('\nmoving forward upgrades the new next level');
    reset();
    moveTo(e1, 28);
    const fwd = writeAhead.trigger({ user: learnerU, enrollment: db.byId('enrollments', e1.id), grade, reason: 'level finished' });
    check('from 28: 28 (stood on), 29 next (Sonnet), 30 and 38', fwd.map((s) => `${s.level}:${s.tier}`).join() === '28:open,29:sonnet,30:free,38:free', fwd);
    await writeAhead.idle();
    check('29, free-checked before, is upgraded to the Sonnet check in the background, not rewritten',
      blockLevels.sonnetChecked(planOf(learnerU.id, 29)) && sonnetFor(29).map((s) => s.what).join() === 'submit_verification' && !layouts.includes(29), { sonnet: sonnetFor(29), layouts });
    check('38, new 3 ahead, is written on the free check', planOf(learnerU.id, 38).check_tier === 'free' && !sonnetFor(38).length && layouts.filter((l) => l === 38).length === 1);
    check('28 and 30, already Sonnet-checked, are left alone', !layouts.includes(28) && !layouts.includes(30) && !sonnetFor(28).length && !sonnetFor(30).length);

    console.log('\nno duplicate writes: a request and the write-ahead on one cold level');
    reset();
    delayMs = 40;
    moveTo(e1, 39);
    writeAhead.trigger({ user: learnerU, enrollment: db.byId('enrollments', e1.id), grade, reason: 'jump' });
    writeAhead.trigger({ user: learnerU, enrollment: db.byId('enrollments', e1.id), grade, reason: 'path' });
    writeAhead.trigger({ user: learnerU, enrollment: db.byId('enrollments', e1.id), grade, reason: 'dashboard' });
    const [r1, r2] = await Promise.all([
      blockLevels.forLevel({ user: learnerU, trackId: TRACK, gradeId: GRADE, level: 39 }),
      blockLevels.forLevel({ user: learnerU, trackId: TRACK, gradeId: GRADE, level: 39 }),
    ]);
    await writeAhead.idle();
    delayMs = 0;
    check('three triggers and two requests wrote level 39 once', layouts.filter((l) => l === 39).length === 1, layouts);
    check('and 40, 48, 49 once each', [40, 48, 49].every((l) => layouts.filter((x) => x === l).length === 1), layouts);
    check('both requests got the plan (or were told it is being written)', [r1, r2].every((r) => r.plan || r.writing));
    check('caps: at most 2 at once for one account', writeAhead.status().per_user === 2
      && writeAhead.events.filter((e) => e.type === 'start').length > 0);
    {
      // The per-account cap, measured: no more than 2 of this account's jobs ever ran together.
      let live = 0;
      let most = 0;
      for (const e of writeAhead.events) {
        if (e.type === 'start' && e.key.startsWith(`${learnerU.id}:`)) most = Math.max(most, ++live);
        if (e.type === 'done' && e.key.startsWith(`${learnerU.id}:`)) live--;
      }
      check(`no more than 2 of one account's write-aheads ran together (${most})`, most <= 2 && most >= 1);
    }

    console.log('\nthe owner gets base levels only');
    reset();
    const owner = makeUser('owner', { email: process.env.OWNER_EMAIL, subscription: 'pro' });
    check('the test account is the owner, untailored, and may generate', blockLevels.isOwner(owner) && !blockLevels.tailorsFor(owner) && blockLevels.mayGenerate(owner));
    const eo = enroll(owner, 50);
    const ownerSteps = writeAhead.trigger({ user: owner, enrollment: eo, grade, reason: 'dashboard' });
    check('the owner\'s write-ahead is untailored', ownerSteps.length && ownerSteps.every((s) => !s.tailored), ownerSteps);
    check('every queued key is a shared (base) level', writeAhead.status().queued.every((j) => j.key.startsWith('shared:')), writeAhead.status().queued);
    await writeAhead.idle();
    const ownerRows = db.find('block_plans', (p) => p.user_id === owner.id);
    const base50 = planOf(null, 50);
    check('nothing personalised was written for the owner', ownerRows.length === 0, ownerRows.map((p) => p.level));
    check('the base plans are written and reused: a standard learner is served them', base50 && base50.status === 'ready' && base50.arm === 'shared' && !base50.brief_hash);
    const standard = makeUser('standard', { subscription: 'standard' });
    check('a standard learner (tester phase off) gets the base level and causes no write', !blockLevels.mayGenerate(standard)
      && blockLevels.servedPlan(standard, TRACK, GRADE, 50) && blockLevels.servedPlan(standard, TRACK, GRADE, 50).id === base50.id);
    const es = enroll(standard, 50);
    check('and no write-ahead for them (mayGenerate)', writeAhead.trigger({ user: standard, enrollment: es, grade }).length === 0);
    process.env.TESTER_TAILORING = 'on';
    check('in the tester phase a standard tester is tailored, the owner still is not', blockLevels.tailorsFor(standard) && !blockLevels.tailorsFor(owner)
      && writeAhead.planFor({ user: standard, enrollment: es, grade }).every((s) => s.tailored)
      && writeAhead.planFor({ user: owner, enrollment: eo, grade }).every((s) => !s.tailored));
    process.env.TESTER_TAILORING = 'off';

    console.log('\nthe ledger\'s stop: the next level gets the free check too');
    reset();
    process.env.ANTHROPIC_LEDGER_STOP_USD = '0';
    check('past the stop no Sonnet check can be paid for', !blockLevels.sonnetAffordable() && blockLevels.tierFor('sonnet') === 'free');
    const ledgerU = tailoredUser('ledger');
    const el = enroll(ledgerU, 10);
    writeAhead.trigger({ user: ledgerU, enrollment: el, grade, reason: 'path' });
    await writeAhead.idle();
    const l18 = planOf(ledgerU.id, 18);
    check('1 ahead (18) is written on the free check, and Sonnet is never asked', l18 && l18.check_tier === 'free' && blockLevels.servable(l18) && sonnet.length === 0, { tier: l18 && l18.check_tier, sonnet });
    check('the level stood on (10) is served on its free check and waits for room in the ledger', blockLevels.sonnetPending(planOf(ledgerU.id, 10)));
    delete process.env.ANTHROPIC_LEDGER_STOP_USD;

    console.log('\nconsent and readiness');
    providers.current = () => null;
    check('no model ready: nothing is queued', writeAhead.trigger({ user: ledgerU, enrollment: el, grade }).length === 0);
    providers.current = (role) => (role === 'blocks' ? stubProvider : realCurrent(role));
    check('a placement not yet taken: nothing is queued', writeAhead.trigger({ user: ledgerU, enrollment: { ...el, status: 'placement_pending' }, grade }).length === 0);

    console.log('\nfailed levels are tried again');
    reset();
    const retryU = tailoredUser('retry');
    const er = enroll(retryU, 40);
    failFill = 40;
    process.env.WRITE_AHEAD_LEVELS = '0';
    writeAhead.trigger({ user: retryU, enrollment: er, grade });
    await writeAhead.idle();
    check('a failed write is recorded', planOf(retryU.id, 40).status === 'failed' && writeAhead.status().failures.some((f) => f.key.endsWith(':40')));
    writeAhead.trigger({ user: retryU, enrollment: er, grade });
    await writeAhead.idle();
    check('and not hammered: the next trigger waits its pause', layouts.filter((l) => l === 40).length === 1, layouts);
    failFill = null;
    process.env.WRITE_AHEAD_RETRY_MS = '0';
    writeAhead.trigger({ user: retryU, enrollment: er, grade });
    await writeAhead.idle();
    check('after the pause it is written again, and served', planOf(retryU.id, 40).status === 'ready' && blockLevels.servable(planOf(retryU.id, 40)), planOf(retryU.id, 40).status);
    delete process.env.WRITE_AHEAD_RETRY_MS;
    delete process.env.WRITE_AHEAD_LEVELS;

    console.log('\na "writing" plan never stays stuck');
    reset();
    // A row left at "writing" by a server that stopped mid-write (the live row 109).
    const stuckU = tailoredUser('stuck');
    enroll(stuckU, 48);
    db.insert('block_plans', { user_id: stuckU.id, track_id: TRACK, grade_id: GRADE, level: 48, attempt: 1, kind: 'retention', status: 'writing', started_at: '2026-10-25T12:36:22.727Z', reason: 'the fill-out call returned nothing' });
    const recovered = await blockLevels.forLevel({ user: stuckU, trackId: TRACK, gradeId: GRADE, level: 48 });
    check('a stuck "writing" row is written again on read, and served', recovered.plan && recovered.plan.status === 'ready' && recovered.plan.level === 48, recovered);
    // A write whose provider call never returns: let go after BLOCK_WRITE_TIMEOUT_MS.
    process.env.BLOCK_WRITE_TIMEOUT_MS = '300';
    let release;
    hang = { level: 49, promise: new Promise((r) => { release = r; }) };
    const timed = await blockLevels.ensure({ userId: stuckU.id, trackId: TRACK, gradeId: GRADE, level: 49, tailored: true });
    const afterTimeout = planOf(stuckU.id, 49);
    check('a hung write times out: nothing served, the row is marked failed, the slot is free', timed === null && afterTimeout.status === 'failed'
      && /timed out/.test(afterTimeout.reason) && !blockLevels.isWriting({ userId: stuckU.id, trackId: TRACK, gradeId: GRADE, level: 49, tailored: true }), afterTimeout.reason);
    hang = null;
    delete process.env.BLOCK_WRITE_TIMEOUT_MS;
    const retried = await blockLevels.ensure({ userId: stuckU.id, trackId: TRACK, gradeId: GRADE, level: 49, tailored: true });
    check('the next visit writes it again', retried && retried.status === 'ready');
    release(null); // the hung call finally answers: its write must not touch the row
    await new Promise((r) => setTimeout(r, 50));
    check('the timed-out write, finishing late, leaves the new plan alone', planOf(stuckU.id, 49).status === 'ready' && planOf(stuckU.id, 49).id === retried.id);

    console.log('\na lesson level never shows its checks alone');
    {
      const mathGrade = curriculum.getGrade('math', 'numbers_to_20_and_teen_numbers');
      const lessonU = makeUser('lesson', { subscription: 'standard' });
      const em = enroll(lessonU, 10, 'math', 'numbers_to_20_and_teen_numbers');
      // A model-written lesson is allowed (key set, AI on) but slow: past LESSON_WAIT_MS the bank's is served.
      const realEnabled = ai.isEnabled;
      ai.isEnabled = () => true;
      const slowDetail = ai.structuredDetail;
      ai.structuredDetail = async (args) => (args.role === 'blocks' ? slowDetail(args) : new Promise((r) => setTimeout(() => r(null), 3500)));
      const built = await sessions.createSession({ userId: lessonU.id, enrollment: db.byId('enrollments', em.id), grade: mathGrade });
      check('the sitting has its lesson stored (lesson_id), with teaching and a worked example', built.session.lesson_id && built.lesson
        && (built.lesson.sections || []).length > 0 && !!built.lesson.worked_example, { lesson_id: built.session.lesson_id, sections: built.lesson && built.lesson.sections && built.lesson.sections.length });
      check('then its checks', built.items.length > 0 && built.items.every((i) => i.role === 'check' || i.role === 'retention'));
      // A sitting saved before this fix: no lesson_id (the owner's session 5887).
      db.update('sessions', built.session.id, { lesson_id: null });
      const resumed = await sessions.createSession({ userId: lessonU.id, enrollment: db.byId('enrollments', em.id), grade: mathGrade });
      check('reopening a sitting with no stored lesson brings the lesson back, not the checks alone',
        resumed.resumed && resumed.lesson && (resumed.lesson.sections || []).length > 0 && !!resumed.lesson.worked_example && db.byId('sessions', built.session.id).lesson_id, { resumed: resumed.resumed, lesson: !!resumed.lesson });
      // The route's resume path reads lessons.forSitting.
      db.update('sessions', built.session.id, { lesson_id: null });
      const viaRoute = lessons.forSitting(db.byId('sessions', built.session.id));
      check('lessons.forSitting finds the stored lesson for a sitting that lost it', viaRoute && (viaRoute.sections || []).length > 0);
      // The owner: a stored lesson written with their profile before the base rule
      // (no base_written) is not shown to them; the bank's base lesson is.
      const ownerU = db.findOne('users', (u) => u.email === process.env.OWNER_EMAIL);
      const eom = enroll(ownerU, 10, 'math', 'numbers_to_20_and_teen_numbers');
      const tailoredRow = db.insert('lessons', { user_id: ownerU.id, track_id: 'math', grade_id: 'numbers_to_20_and_teen_numbers', level: 10, title: 'Written for the owner', intro: 'x', sections: [{ heading: 'h', body: 'b' }], source: 'ai', completed_at: null });
      const sitting = db.insert('sessions', { user_id: ownerU.id, enrollment_id: eom.id, track_id: 'math', grade_id: 'numbers_to_20_and_teen_numbers', level: 10, kind: 'teach', blocks: [{ index: 0, level: 10, kind: 'lesson' }], lesson_id: null, ended_at: null });
      const ownerSees = lessons.forSitting(sitting);
      check('the owner\'s sitting gets the base lesson, never one written with their profile', ownerSees && ownerSees.base_written && ownerSees.source === 'bank'
        && ownerSees.title !== 'Written for the owner' && (ownerSees.sections || []).length > 0 && !!ownerSees.worked_example, ownerSees && { id: ownerSees.id, t: ownerSees.title, rowId: tailoredRow.id });
      ai.structuredDetail = slowDetail;
      ai.isEnabled = realEnabled;
    }

    console.log('\nthe routes call the write-ahead');
    {
      const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      const learn = read('routes/learn.js');
      check('path page, level finished, session finished, skip-level, jump, skip-grade, owner/go',
        /reason: 'path'/.test(learn) && /'level finished'/.test(learn) && /'session finished'/.test(learn) && /'skip-level'/.test(learn)
        && (learn.match(/'jump'/g) || []).length >= 2 && /'skip-grade'/.test(learn) && /'owner\/go'/.test(learn) && /blockLevels\.prefetchAhead\(\{ user: req\.user, enrollment, grade \}\)/.test(learn));
      check('dashboard', /writeAhead\.triggerForUser\(\{ user: req\.user, reason: 'dashboard' \}\)/.test(read('routes/profile.js')));
      check('placement (a new enrollment\'s first levels)', (read('routes/placement.js').match(/writeAhead\.trigger\(/g) || []).length >= 3);
      check('a lesson level whose block plan is not ready goes to the standard session (lesson, then checks)', /ordinary: true, level, block_kind: blockKind/.test(read('routes/base-lessons.js'))
        && /lesson\.ordinary && lesson\.url/.test(read('public/js/base-lesson.js')) && /fallbackUrl && Date\.now\(\) - startedAt >= 60000/.test(read('public/js/block-level.js')));
    }

    console.log('\nWRITE_AHEAD=off restores the behaviour before it');
    reset();
    process.env.WRITE_AHEAD = 'off';
    const offU = tailoredUser('off');
    const eoff = enroll(offU, 50);
    check('trigger does nothing', writeAhead.trigger({ user: offU, enrollment: eoff, grade }).length === 0);
    check('no free tier: every write is the key\'s check', blockLevels.tierFor('free') === null && blockLevels.tierFor('open') === null);
    check('a plan on its free check alone is not served (held for Sonnet, as before)', !blockLevels.servable(free) && !blockLevels.sonnetPending(free));
    blockLevels.prefetchAhead({ user: offU, enrollment: eoff, grade });
    // prefetchAhead's old reach: the level stood on and the next 3 path positions (50 lesson, 51 checkpoint, 52 lesson, 53 practice).
    for (let i = 0; i < 100 && [50, 52].some((l) => blockLevels.isWriting({ userId: offU.id, trackId: TRACK, gradeId: GRADE, level: l, tailored: true })); i++) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 20));
    }
    const o50 = planOf(offU.id, 50);
    const o52 = planOf(offU.id, 52);
    check('prefetchAhead writes 4 path positions with the key\'s full check, as before', o50 && o52 && o50.check_tier === 'sonnet' && o52.check_tier === 'sonnet'
      && !o50.self_check && sonnetFor(50).map((s) => s.what).join() === 'submit_fact_sheet,submit_verification' && !planOf(offU.id, 60), { s50: sonnetFor(50) });
    check('nothing was queued by the write-ahead', writeAhead.status().queued.length === 0 && writeAhead.status().running.length === 0);
    delete process.env.WRITE_AHEAD;
  } finally {
    ai.structuredDetail = realDetail;
    providers.current = realCurrent;
    factReader.ask = realAsk;
    keyGate.blindResolve = realResolve;
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nall write-ahead checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
