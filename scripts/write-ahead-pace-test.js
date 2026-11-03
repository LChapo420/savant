/**
 * Write-ahead pace and re-tailoring checks: spec signatures and drift,
 * measured learner pace, the adaptive horizon, due re-tailoring, and the
 * re-tailoring job in the write-ahead queue.
 *
 *   node scripts/write-ahead-pace-test.js
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO|UNOROUTER)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ownCopy = path.join(os.tmpdir(), `write-ahead-pace-test-${process.pid}.json`);
fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
process.env.DB_FILE = ownCopy;

const ledgerCopy = path.join(os.tmpdir(), `write-ahead-pace-ledger-${process.pid}.json`);
try { fs.copyFileSync(path.join(__dirname, '..', 'data', 'anthropic-ledger.json'), ledgerCopy); } catch { /* a fresh one is made */ }
process.env.ANTHROPIC_LEDGER_FILE = ledgerCopy;

require('../config/db');
process.on('exit', () => {
  for (const file of [ownCopy, ledgerCopy]) {
    try { fs.unlinkSync(file); } catch { /* gone */ }
  }
});

for (const name of [
  'BLOCK_RETAILOR_BIG',
  'BLOCK_RETAILOR_SMALL',
  'BLOCK_RETAILOR_DRIFT',
  'WRITE_AHEAD',
  'WRITE_AHEAD_LEVELS',
  'WRITE_AHEAD_MAX',
]) delete process.env[name];
process.env.WRITE_AHEAD = 'on';
process.env.WRITE_AHEAD_LEVELS = '3';
process.env.WRITE_AHEAD_MAX = '10';

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const blockAdapt = require('../services/block-adapt');
const blockLevels = require('../services/block-levels');
const writeAhead = require('../services/write-ahead');
const { specSig, specDrift, driftedEnough } = require('../services/spec-sig');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  }
}

const TRACK = 'english';
const GRADE = 'proficient';
const grade = curriculum.getGrade(TRACK, GRADE);

function addSession(enrollment, startedAt, endedAt, levels) {
  return db.insert('sessions', {
    user_id: enrollment.user_id,
    enrollment_id: enrollment.id,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    levels,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
  });
}

(async () => {
  console.log('\nspec signatures and drift');
  const signature = specSig({
    ratio: 0.123456,
    nested: { count: 1234 },
    list: [{ value: 1.23456 }],
  });
  check('specSig rounds numeric leaves to three significant figures',
    signature.ratio === 0.123 && signature['nested.count'] === 1230 && signature['list.0.value'] === 1.23,
    signature);
  check('specSig keys numeric leaves by dotted path',
    Object.prototype.hasOwnProperty.call(signature, 'nested.count')
    && Object.prototype.hasOwnProperty.call(signature, 'list.0.value'),
    signature);
  check('a 0.12 to 0.3 change is big', specDrift({ x: 0.12 }, { x: 0.3 }) === 1);
  check('an 880 to 900 change is ignored', specDrift({ x: 880 }, { x: 900 }) === 0);
  check('a 2 to 3 change is big', specDrift({ x: 2 }, { x: 3 }) === 1);

  const oldSmall = { a: 100, b: 200, c: 300, d: 400, e: 500 };
  const newSmall = { a: 112, b: 224, c: 336, d: 448, e: 560 };
  check('five small 12 percent changes count as one drift point',
    specDrift(oldSmall, newSmall) === 1,
    specDrift(oldSmall, newSmall));
  check('one big change does not meet the default threshold of two',
    !driftedEnough({ x: 0.12 }, { x: 0.3 }));
  check('two big changes meet the default threshold of two',
    driftedEnough({ x: 0.12, y: 2 }, { x: 0.3, y: 3 }));

  const user = db.insert('users', {
    email: `write-ahead-pace-${process.pid}-${Date.now()}@example.test`,
    display_name: 'Write Ahead Pace',
    password_hash: 'x',
    xp: 0,
    streak: 0,
    onboarded: true,
  });
  const enrollment = db.insert('enrollments', {
    user_id: user.id,
    track_id: TRACK,
    grade_id: GRADE,
    target_level: grade.pathLength,
    current_level: 10,
    status: 'active',
    xp: 0,
    level_items: 0,
  });

  console.log('\nlearner pace');
  const noSessions = writeAhead.paceFor(enrollment);
  check('no sessions means no measured pace',
    noSessions.levelsPerHour === 0 && noSessions.sessions === 0,
    noSessions);

  const now = Date.now();
  const oldEndedAt = now - 8 * 24 * 60 * 60 * 1000;
  addSession(enrollment, oldEndedAt - 30 * 60 * 1000, oldEndedAt, 15);
  const oldOnly = writeAhead.paceFor(enrollment);
  check('a session older than seven days is ignored',
    oldOnly.levelsPerHour === 0 && oldOnly.sessions === 0,
    oldOnly);

  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;
  addSession(enrollment, twoHoursAgo - 30 * 60 * 1000, twoHoursAgo, 15);
  addSession(enrollment, oneHourAgo - 30 * 60 * 1000, oneHourAgo, 15);
  const measured = writeAhead.paceFor(enrollment);
  check('two thirty-minute sessions with fifteen levels each measure thirty levels per hour',
    measured.levelsPerHour === 30 && measured.sessions === 2,
    measured);

  console.log('\nadaptive horizon');
  writeAhead.reset();
  for (let i = 0; i < 5; i++) writeAhead.events.push({ type: 'done', ok: true, ms: 4 * 60 * 1000 });
  check('the measured write time is four minutes', writeAhead.writeMinutes() === 4, writeAhead.writeMinutes());
  check('no pace keeps the three-level baseline',
    writeAhead.aheadFor(enrollment, { levelsPerHour: 0 }) === 3,
    writeAhead.aheadFor(enrollment, { levelsPerHour: 0 }));
  check('a thirty-levels-per-hour pace needs five levels ahead',
    writeAhead.aheadFor(enrollment, { levelsPerHour: 30 }) === 5,
    writeAhead.aheadFor(enrollment, { levelsPerHour: 30 }));
  check('a three-hundred-levels-per-hour pace is capped at ten levels ahead',
    writeAhead.aheadFor(enrollment, { levelsPerHour: 300 }) === 10,
    writeAhead.aheadFor(enrollment, { levelsPerHour: 300 }));

  console.log('\ndue re-tailoring');
  const realSpecFor = blockAdapt.specFor;
  const oldSpec = { values: { a: 0.12, b: 2 } };
  const newSpec = { values: { a: 0.3, b: 3 } };
  const specs = {};
  blockAdapt.specFor = (_userId, where) => specs[where.level];
  try {
    const readyPlan = (level, signatureValue, extra = {}) => db.insert('block_plans', {
      user_id: user.id,
      track_id: TRACK,
      grade_id: GRADE,
      level,
      attempt: 1,
      kind: 'lesson',
      status: 'ready',
      arm: 'tailored',
      tailored: true,
      brief_hash: 'test-profile',
      check_tier: 'free',
      verification: { status: 'verified', model: 'stub' },
      self_check: { status: 'passed' },
      spec_sig: signatureValue,
      ...extra,
    });

    const movedPlan = readyPlan(48, specSig(oldSpec));
    const unmovedPlan = readyPlan(49, specSig(newSpec));
    const recentlyRetailoredPlan = readyPlan(50, specSig(oldSpec), {
      retailored_at: new Date(now - 60 * 60 * 1000).toISOString(),
    });
    specs[movedPlan.level] = newSpec;
    specs[unmovedPlan.level] = newSpec;
    specs[recentlyRetailoredPlan.level] = newSpec;

    const movedDue = blockLevels.retailorDue({
      userId: user.id, trackId: TRACK, gradeId: GRADE, level: movedPlan.level,
    });
    check('a ready plan whose spec moved a lot on two values is due',
      movedDue && movedDue.id === movedPlan.id,
      movedDue);

    const unmovedDue = blockLevels.retailorDue({
      userId: user.id, trackId: TRACK, gradeId: GRADE, level: unmovedPlan.level,
    });
    check('an unmoved plan is not due', unmovedDue === null, unmovedDue);

    const recentlyRetailoredDue = blockLevels.retailorDue({
      userId: user.id, trackId: TRACK, gradeId: GRADE, level: recentlyRetailoredPlan.level,
    });
    check('a plan retailored one hour ago is not due', recentlyRetailoredDue === null, recentlyRetailoredDue);
  } finally {
    blockAdapt.specFor = realSpecFor;
  }

  console.log('\nre-tailoring in the write-ahead queue');
  writeAhead.reset();
  const originals = {
    aiReady: blockLevels.aiReady,
    mayGenerate: blockLevels.mayGenerate,
    tailorsFor: blockLevels.tailorsFor,
    levelsAhead: blockLevels.levelsAhead,
    kindFor: blockLevels.kindFor,
    visibleTo: blockLevels.visibleTo,
    findPlan: blockLevels.findPlan,
    sonnetPending: blockLevels.sonnetPending,
    ensure: blockLevels.ensure,
    retailorDue: blockLevels.retailorDue,
    retailor: blockLevels.retailor,
  };
  const realAiPool = process.env.AI_POOL;
  const dueCalls = [];
  const retailorCalls = [];
  try {
    process.env.AI_POOL = '0';
    blockLevels.aiReady = () => true;
    blockLevels.mayGenerate = () => true;
    blockLevels.tailorsFor = () => true;
    blockLevels.levelsAhead = () => [10];
    blockLevels.kindFor = () => 'lesson';
    blockLevels.visibleTo = () => true;
    blockLevels.findPlan = () => null;
    blockLevels.sonnetPending = () => false;
    blockLevels.ensure = async () => ({ id: 'written-plan', check_tier: 'free' });
    blockLevels.retailorDue = (args) => {
      dueCalls.push(args);
      return { id: 'old-plan' };
    };
    blockLevels.retailor = async (args) => {
      retailorCalls.push(args);
      return { id: 'retailored-plan' };
    };

    writeAhead.trigger({ user, enrollment, grade, reason: 'test' });
    writeAhead.trigger({ user, enrollment, grade, reason: 'test' });
    await writeAhead.idle();

    const retailorKey = `${blockLevels.planKey(user.id, TRACK, GRADE, 10)}:retailor`;
    const queued = writeAhead.events.filter((event) => event.type === 'queued' && event.kind === 'retailor');
    const done = writeAhead.events.filter((event) => event.type === 'done' && event.kind === 'retailor');
    check('a due tailored level queues one re-tailoring job',
      queued.length === 1 && queued[0].key === retailorKey && queued[0].level === 10,
      queued);
    check('the queue does not duplicate the re-tailoring job',
      retailorCalls.length === 1,
      retailorCalls);
    check('the re-tailoring job uses the requested learner and level',
      retailorCalls[0] && retailorCalls[0].userId === user.id && retailorCalls[0].trackId === TRACK
      && retailorCalls[0].gradeId === GRADE && retailorCalls[0].level === 10,
      retailorCalls[0]);
    check('the re-tailoring job is recorded as done',
      done.length === 1 && done[0].ok === true && Number.isFinite(done[0].ms),
      done);
    check('the due check receives the tailored learner and level',
      dueCalls.length >= 1 && dueCalls[0].userId === user.id && dueCalls[0].trackId === TRACK
      && dueCalls[0].gradeId === GRADE && dueCalls[0].level === 10,
      dueCalls);
  } finally {
    for (const [name, value] of Object.entries(originals)) blockLevels[name] = value;
    if (realAiPool === undefined) delete process.env.AI_POOL;
    else process.env.AI_POOL = realAiPool;
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nall write-ahead pace checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
