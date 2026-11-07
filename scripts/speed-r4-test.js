#!/usr/bin/env node
/**
 * Round 4's changes on a throwaway database (docs/speed-real/ROUND4.md).
 *   node scripts/speed-r4-test.js
 * Plain bug fixes: a practice level's focus follows the sheet's skill for its lesson; the level gate reads skills the learner has met. Each has a switch back.
 * Levers, off by default, off is today's behaviour: spaced retention, proof passes the level, recheck, one prompt, tight page.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.NODE_ENV = 'test';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-r4-test-'));
process.env.DB_FILE = path.join(dir, 'db.json');
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } });
for (const k of Object.keys(process.env)) if (/_API_KEY$/.test(k)) delete process.env[k];
for (const k of ['SPEED_SPACE_RETENTION', 'SPEED_PROOF_PASSES', 'SPEED_RECHECK', 'SPEED_ONE_PROMPT', 'SPEED_TIGHT_PAGE', 'PRACTICE_FOLLOWS_LESSON', 'LEVEL_GATE_MET', 'SPEED_ALL']) delete process.env[k];

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const mastery = require('../services/mastery');
const learnerPath = require('../services/learner-path');
const coverage = require('../services/coverage');
const speed = require('../services/speed-levers');
const sessions = require('../services/sessions');
const blockLevels = require('../services/block-levels');

let passed = 0; let failed = 0;
async function check(name, fn) { try { await fn(); passed++; console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 5).join('\n     ')}`); } }
async function withEnv(env, fn) { const old = {}; for (const [k, v] of Object.entries(env)) { old[k] = process.env[k]; process.env[k] = v; } try { return await fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } }
let n = 0;
const user = () => db.insert('users', { email: `r4-${++n}@savant-local-sim.org`, display_name: `r4${n}`, password_hash: 'x', onboarded: true, account_type: 'standard', age_check: { age_at_check: 30, under_13: false } });
const enroll = (u, track, gradeId, level) => { const g = curriculum.getGrade(track, gradeId); return db.insert('enrollments', { user_id: u.id, track_id: track, grade_id: gradeId, target_level: g.pathLength, current_level: level, level_items: 0, levels_completed: level - 1, xp: 0, status: 'active', placed_at: new Date().toISOString() }); };
const skillState = (u, skill, mastery_, attempts = 10) => { const old = db.findOne('skill_states', (s) => s.user_id === u.id && s.skill_id === skill); if (old) db.update('skill_states', old.id, { mastery: mastery_, attempts }); else db.insert('skill_states', { user_id: u.id, skill_id: skill, mastery: mastery_, attempts, ease: 2.5, interval_days: 1, last_seen: new Date().toISOString(), due_at: new Date().toISOString() }); };
/** Answers that prove an objective, for real: right lesson checks and right practice answers, through the coverage fold. */
function prove(u, enr, o) {
  const at = new Date().toISOString();
  for (let i = 0; i < 4; i++) db.insert('items', { user_id: u.id, session_id: null, track_id: enr.track_id, grade_id: enr.grade_id, skill_id: o.skill, level: o.lesson_level, role: 'check', format: 'multiple_choice', choices: ['a', 'b', 'c', 'd'], prompt: `check ${o.id} ${i}`, answer: 'a', user_answer: 'a', correct: true, ms: 9000, answered_at: at, source: 'test' });
}
const GRADE = ['math', 'algebra_2_part_a'];

(async () => {
  const grade = curriculum.getGrade(...GRADE);
  const model = coverage.modelFor(...GRADE);
  const o = model.objectives.find((x) => x.retention.length === 2 && x.practice.length > 3);
  const firstPlain = o.practice.find((l) => !o.retention.includes(l));

  await check('switches: all five new levers off by default, on when asked', async () => {
    for (const l of ['space', 'proofPasses', 'recheck', 'onePrompt', 'tight']) assert.strictEqual(speed.enabled(l), false, l);
    await withEnv({ SPEED_SPACE_RETENTION: 'on', SPEED_PROOF_PASSES: 'on', SPEED_RECHECK: 'on', SPEED_ONE_PROMPT: 'on', SPEED_TIGHT_PAGE: 'on' }, () => { for (const l of ['space', 'proofPasses', 'recheck', 'onePrompt', 'tight']) assert.strictEqual(speed.enabled(l), true, l); });
    await withEnv({ SPEED_SPACE_RETENTION: 'on', SPEED_ALL: 'off' }, () => assert.strictEqual(speed.enabled('space'), false));
  });

  await check('plain fix: a practice level practises its lesson\'s skill in every row that names one, and PRACTICE_FOLLOWS_LESSON=off restores the bands', async () => {
    let total = 0; let moved = 0;
    for (const g of [curriculum.getGrade('math', 'sense_of_quantity'), grade]) {
      const m = coverage.modelFor('math', g.id);
      for (const ob of m.objectives) for (const l of ob.practice) {
        total++;
        const row = require('../config/level-layout').entryFor(g, l); // eslint-disable-line global-require
        const on = curriculum.levelPlan(g, l);
        if (row && row.skill && g.skills.includes(row.skill)) assert.strictEqual(on.focus, row.skill, `${g.id} ${l}`);
        assert.ok(on.introduced.includes(on.focus), `${g.id} ${l}: the focus is in what the level measures`);
        const off = await withEnv({ PRACTICE_FOLLOWS_LESSON: 'off' }, () => curriculum.levelPlan(g, l));
        if (off.focus !== on.focus) moved++;
      }
    }
    assert.ok(total > 100); assert.ok(moved > 0, 'the fix changes something');
  });

  await check('plain fix: a practice answer on the skill its own row names counts for the objective of that row, even when a re-tag gave the lesson another skill', async () => {
    const m = coverage.modelFor('act', 'act_grade_2'); const o2 = m.objectives.find((x) => x.lesson_level === 20); const lv = o2.practice[0];
    assert.notStrictEqual(m.levelMap[lv].skill, o2.skill, 'the mismatch this fixes still exists in the sheet');
    const a = { level: lv, skill: m.levelMap[lv].skill, role: 'focus', correct: true };
    assert.deepStrictEqual(coverage.attribute(m, a).map((x) => [x.i, x.direct]), [[m.objectives.indexOf(o2), true]]);
    const old = await withEnv({ PRACTICE_FOLLOWS_LESSON: 'off' }, () => coverage.attribute(m, a));
    assert.ok(!old.some((x) => x.i === m.objectives.indexOf(o2) && x.direct));
  });

  await check('plain fix: support and interleaved slots draw on skills the learner has met, never a skill no lesson has reached', async () => {
    const g = curriculum.getGrade('act', 'act_grade_2'); const u = user(); const e = enroll(u, 'act', 'act_grade_2', 21);
    const plan = curriculum.levelPlan(g, 21);
    const out = await sessions.createSession({ userId: u.id, enrollment: e, grade: g });
    const skills = new Set(out.items.map((i) => db.byId('items', i.id).skill_id));
    assert.deepStrictEqual([...skills], [plan.focus], 'a new learner gets only the focus');
    const old = await withEnv({ PRACTICE_FOLLOWS_LESSON: 'off' }, async () => { const u2 = user(); const e2 = enroll(u2, 'act', 'act_grade_2', 21); const o2 = await sessions.createSession({ userId: u2.id, enrollment: e2, grade: g }); return new Set(o2.items.map((i) => db.byId('items', i.id).skill_id)); });
    assert.ok(old.size > 1, 'the old reading mixed in others');
  });

  await check('objective practice: off, the bank; on, questions written for the objective where a grade has them, tagged, and a grade without them is unchanged', async () => {
    const objectiveItems = require('../services/objective-items'); // eslint-disable-line global-require
    let track = null; let gid = null; let ob = null;
    for (const [t, id] of [['math', 'counting_and_comparing'], ['english', 'grammar'], ['reading', 'foundations'], ['math', 'sense_of_quantity']]) {
      const m = coverage.modelFor(t, id); const by = objectiveItems.forGrade(t, id);
      const g = curriculum.getGrade(t, id);
      ob = m.objectives.find((x) => (by.get(x.id) || []).length >= 3 && x.practice.some((l) => !x.retention.includes(l) && curriculum.levelPlan(g, l).focus === x.skill));
      if (ob) { track = t; gid = id; break; }
    }
    assert.ok(ob, 'a grade with objective items');
    const g = curriculum.getGrade(track, gid); const lv = ob.practice.find((l) => !ob.retention.includes(l) && curriculum.levelPlan(g, l).focus === ob.skill);
    const u = user(); const e = enroll(u, track, gid, lv);
    const off = await sessions.createSession({ userId: u.id, enrollment: e, grade: g });
    assert.strictEqual(off.items.filter((i) => db.byId('items', i.id).objective_id === ob.id).length, 0);
    await withEnv({ SPEED_OBJECTIVE_PRACTICE: 'on' }, async () => {
      const u2 = user(); const e2 = enroll(u2, track, gid, lv);
      const on = await sessions.createSession({ userId: u2.id, enrollment: e2, grade: g });
      assert.ok(on.items.filter((i) => db.byId('items', i.id).objective_id === ob.id).length >= 1);
      const u3 = user(); const gOther = curriculum.getGrade('math', 'algebra_2_part_a'); const e3 = enroll(u3, 'math', 'algebra_2_part_a', firstPlain);
      const other = await sessions.createSession({ userId: u3.id, enrollment: e3, grade: gOther });
      assert.strictEqual(other.items.filter((i) => db.byId('items', i.id).objective_id).length, 0);
    });
  });

  await check('plain fix: a skill the learner never met does not hold the level; LEVEL_GATE_MET=off restores the old gate', async () => {
    const g = curriculum.getGrade('act', 'act_grade_1'); const u = user(); const e = enroll(u, 'act', 'act_grade_1', 21);
    const plan = curriculum.levelPlan(g, 21); assert.ok(plan.introduced.length > 3);
    skillState(u, plan.focus, 0.95);
    db.update('enrollments', e.id, { level_items: 15 });
    const fresh = db.byId('enrollments', e.id);
    assert.strictEqual(mastery.levelProgress(u.id, fresh, g).ready, true);
    const old = await withEnv({ LEVEL_GATE_MET: 'off' }, () => mastery.levelProgress(u.id, fresh, g));
    assert.strictEqual(old.ready, false);
    skillState(u, plan.introduced.find((s) => s !== plan.focus), 0.1);
    assert.strictEqual(mastery.levelProgress(u.id, fresh, g).ready, false, 'a skill they have met and are weak on still holds it');
  });

  await check('spaced retention: off the path walks the retention levels; on, a proven objective steps over them, an unproven one does not', async () => {
    const lastPlain = Math.min(...o.retention) - 1;
    const uU = user(); const eU = enroll(uU, ...GRADE, lastPlain);
    const uP = user(); const eP = enroll(uP, ...GRADE, lastPlain); prove(uP, eP, o);
    assert.ok(['proven', 'retained'].includes(coverage.forEnrollment(uP.id, eP).states[model.objectives.indexOf(o)].status), 'the test really proved it');
    const offAt = learnerPath.nextLevelAfter(eP, grade, lastPlain);
    assert.strictEqual(offAt, o.retention[0], 'off: straight into the first retention level');
    await withEnv({ SPEED_SPACE_RETENTION: 'on' }, () => {
      const on = learnerPath.nextLevelAfter(eP, grade, lastPlain);
      assert.ok(on > Math.max(...o.retention), `on: past both retention levels, got ${on}`);
      assert.strictEqual(learnerPath.nextLevelAfter(eU, grade, lastPlain), o.retention[0], 'unproven keeps them');
    });
    // Never past a checkpoint: stepping stops at anything that is not a retention level of a proven objective.
    await withEnv({ SPEED_SPACE_RETENTION: 'on' }, () => { const on = learnerPath.nextLevelAfter(eP, grade, lastPlain); const k = curriculum.levelKind(on, grade.pathLength, grade); assert.ok(k === 'lesson' || curriculum.isCheckpoint(k) || k === 'practice', k); });
  });

  await check('spaced retention: the owner\'s account follows the sheet', async () => {
    const adaptation = require('../services/adaptation'); // eslint-disable-line global-require
    const orig = adaptation.ownerSkips; adaptation.ownerSkips = () => true;
    const u = user(); const lastPlain = Math.min(...o.retention) - 1; const e = enroll(u, ...GRADE, lastPlain); prove(u, e, o);
    try { await withEnv({ SPEED_SPACE_RETENTION: 'on' }, () => assert.strictEqual(learnerPath.nextLevelAfter(e, grade, lastPlain), o.retention[0])); } finally { adaptation.ownerSkips = orig; }
  });

  await check('spaced retention: the level close says so, only when a retention level was really stepped over', async () => {
    const u = user(); const lastPlain = Math.min(...o.retention) - 1; const e = enroll(u, ...GRADE, lastPlain); prove(u, e, o);
    skillState(u, curriculum.levelPlan(grade, lastPlain).focus, 0.95);
    const off = await sessions.createSession({ userId: u.id, enrollment: e, grade });
    await withEnv({ SPEED_SPACE_RETENTION: 'on' }, async () => {
      db.update('enrollments', e.id, { level_items: 15 });
      const r = sessions.resolveBlock({ userId: u.id, session: db.byId('sessions', off.session.id), enrollment: db.byId('enrollments', e.id), grade, blockIndex: 0 });
      assert.strictEqual(r.level_complete, true); assert.strictEqual(r.spaced_retention, true);
    });
  });

  await check('proof passes the level: off the coarse average holds it; on, a proven objective with its answers passes; an unproven one stays', async () => {
    const u = user(); const e = enroll(u, ...GRADE, firstPlain); prove(u, e, o); db.update('enrollments', e.id, { level_items: 15 });
    skillState(u, curriculum.levelPlan(grade, firstPlain).focus, 0.3);
    const fresh = db.byId('enrollments', e.id);
    assert.strictEqual(mastery.levelProgress(u.id, fresh, grade).ready, false);
    await withEnv({ SPEED_PROOF_PASSES: 'on' }, () => {
      assert.strictEqual(mastery.levelProgress(u.id, fresh, grade).ready, true);
      const u2 = user(); const e2 = enroll(u2, ...GRADE, firstPlain); db.update('enrollments', e2.id, { level_items: 15 }); skillState(u2, curriculum.levelPlan(grade, firstPlain).focus, 0.3);
      assert.strictEqual(mastery.levelProgress(u2.id, db.byId('enrollments', e2.id), grade).ready, false);
      db.update('enrollments', e.id, { level_items: 3 });
      assert.strictEqual(mastery.levelProgress(u.id, db.byId('enrollments', e.id), grade).ready, false, 'still needs its answers');
    });
  });

  await check('recheck: only with the switch, only after practice, only a missed check, at most two, level size unchanged', async () => {
    const u = user(); const e = enroll(u, ...GRADE, firstPlain); const at = new Date().toISOString();
    const row = (extra) => db.insert('items', { user_id: u.id, session_id: null, track_id: GRADE[0], grade_id: GRADE[1], skill_id: o.skill, format: 'multiple_choice', choices: ['a', 'b'], answer: 'a', ms: 9000, answered_at: at, correct: true, level: o.lesson_level, role: 'check', ...extra });
    row({ prompt: 'missed one', correct: false }); row({ prompt: 'missed two', correct: false }); row({ prompt: 'missed three', correct: false }); row({ prompt: 'right one' });
    assert.deepStrictEqual(speed.recheckItems(u.id, e, grade, firstPlain), [], 'off');
    await withEnv({ SPEED_RECHECK: 'on' }, async () => {
      assert.deepStrictEqual(speed.recheckItems(u.id, e, grade, firstPlain), [], 'no practice yet');
      for (let i = 0; i < 5; i++) row({ prompt: `practice ${i}`, role: 'focus', level: firstPlain });
      const got = speed.recheckItems(u.id, e, grade, firstPlain);
      assert.strictEqual(got.length, 2); assert.ok(got.every((x) => x.role === 'check' && x.recheck && /^missed/.test(x.prompt)));
      const baseSize = (await withEnv({ SPEED_RECHECK: 'off' }, async () => { const u3 = user(); const e3 = enroll(u3, ...GRADE, firstPlain); const s = await sessions.createSession({ userId: u3.id, enrollment: e3, grade }); return s.items.length; }));
      const s = await sessions.createSession({ userId: u.id, enrollment: db.byId('enrollments', e.id), grade });
      assert.strictEqual(s.items.filter((i) => db.byId('items', i.id).recheck).length, 2);
      assert.ok(Math.abs(s.items.length - baseSize) <= 3, `size ${s.items.length} against ${baseSize}`);
    });
  });

  await check('client flags: one prompt and tight page reach the session only when on; a preview keeps today\'s flow', async () => {
    assert.strictEqual(speed.clientFlags(1, {}).one_prompt, false); assert.strictEqual(speed.clientFlags(1, {}).tight, false);
    await withEnv({ SPEED_ONE_PROMPT: 'on', SPEED_TIGHT_PAGE: 'on' }, () => { assert.strictEqual(speed.clientFlags(1, {}).one_prompt, true); assert.strictEqual(speed.clientFlags(1, {}).tight, true); assert.strictEqual(speed.clientFlags(1, { preview: true }).tight, false); });
  });

  await check('tight page: a block plan folds its warm-up and recap blocks on a lesson only, and every check stays', async () => {
    const plan = { id: 1, kind: 'lesson', track_id: 'math', grade_id: 'x', level: 10, blocks: [{ index: 0, block: 'Hook_Dilemma', data: {} }, { index: 1, block: 'Theory_RuleCard', data: {} }, { index: 2, block: 'Memory_CheatSheet', data: {} }, { index: 3, block: 'Concept_TakeawayBadge', data: {} }], checks: [{ id: 'c1', after: 0, format: 'multiple_choice', prompt: 'p', choices: ['a', 'b'] }] };
    const shape = (p) => blockLevels.publicPlan(p, 1).entries;
    assert.strictEqual(shape(plan).filter((e) => e.aside).length, 0, 'off');
    await withEnv({ SPEED_TIGHT_PAGE: 'on' }, () => {
      const on = shape(plan);
      assert.deepStrictEqual(on.filter((e) => e.aside).map((e) => e.block), ['Hook_Dilemma', 'Memory_CheatSheet', 'Concept_TakeawayBadge']);
      assert.strictEqual(on.filter((e) => /^Check_/.test(e.block)).length, 1);
      assert.strictEqual(shape({ ...plan, kind: 'retention' }).filter((e) => e.aside).length, 0, 'retention keeps everything');
    });
  });

  await check('the session page and the block page carry the switches and stay valid', async () => {
    const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'session.js'), 'utf8');
    assert.ok(s.includes('session.speed.tight')); assert.ok(s.includes('session.speed.one_prompt')); assert.ok(s.includes('outcome.spaced_retention'));
    assert.ok(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'block-level.js'), 'utf8').includes('See the whole page'));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
