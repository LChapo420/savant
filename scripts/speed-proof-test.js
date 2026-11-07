#!/usr/bin/env node
/**
 * The speed proof (services/speed-proof.js, docs/SPEED-PROOF.md). No model call, no network, a throwaway database (DB_FILE in the temp folder).
 *
 *   node scripts/speed-proof-test.js
 *
 * Everything below is SYNTHETIC: learners written by this script. None of it says anything about real learners.
 *   1. who is measured: switch, beta default, owner, 6689-style id, admin, test accounts, no age answer, under 13 without a parent
 *   2. the plain-way draw: needs the learner's yes, balanced blocks, one open at a time, never changed, owner-base switch
 *   3. minutes to understanding from hand-made study sessions, answers and events (every number checked by hand)
 *   4. the delayed checks: 1, 7, 30 days and the chosen horizon, windows, missed points, the check itself
 *   5. the statistics on synthetic learners with a known truth: held-out seeds, extreme and few learners, "not enough data"
 *   6. the guards: wrong run and time cap switch a plain skill back; the report on the database leaves out excluded accounts
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.NODE_ENV = 'test';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-proof-'));
process.env.DB_FILE = path.join(dir, 'db.json');
for (const k of ['SPEED_PROOF', 'SPEED_PROOF_NORMAL_SHARE', 'SPEED_PROOF_MIN_LEARNERS', 'OWNER_BASE', 'ADAPT_OWNER', 'OWNER_EMAIL', 'METRICS_EXCLUDE_EMAILS', 'BETA_COMPARE']) delete process.env[k];
process.env.ADMIN_EMAILS = 'boss@school.org';
process.env.OWNER_LEARNER_EMAILS = 'me@school.org';

const db = require('../config/db');
const owner = require('../config/owner');
const sp = require('../services/speed-proof');

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const near = (a, b, tol, m) => { checks++; assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b} (tol ${tol})`); };
const DAY = 86400000;
const T0 = Date.parse('2026-11-15T10:00:00Z');
const at = (ms) => new Date(T0 + ms).toISOString();
const kidCheck = { age_at_check: 11, under_13: true, needs_parent: true, birth_ym: '2015-01', country: 'US' };

let seq = 0;
function addUser(extra = {}) {
  seq++;
  return db.insert('users', {
    email: `learner${seq}@school.org`, display_name: `L${seq}`, password_hash: 'x', xp: 0, streak: 0, in_beta: true,
    age_check: { age_at_check: 20, under_13: false, needs_parent: false, birth_ym: '2006-01', country: 'US', checked_at: at(0) }, ...extra,
  });
}
const fresh = (u) => db.byId('users', u.id);

// ── 1. who is measured ───────────────────────────────────────────────────────
{
  const u = addUser();
  ok(sp.ineligibleReason(u) === null, 'an adult beta learner is measured');
  ok(sp.ineligibleReason(addUser({ in_beta: false })) === 'not_in_beta', 'by default only accounts in the beta');
  ok(sp.ineligibleReason(addUser({ in_beta: false, beta_arm: { arm: 'tailored' } })) === null, 'a beta arm counts as in the beta');
  ok(sp.ineligibleReason(addUser({ email: 'me@school.org' })) === 'owner', "the owner's learner account is left out");
  ok(sp.ineligibleReason(addUser({ email: 'boss@school.org' })) === 'admin', 'admins are left out');
  ok(sp.ineligibleReason(addUser({ email: 'x@example.com' })) === 'not_a_real_learner', 'test addresses are left out');
  ok(sp.ineligibleReason(addUser({ is_test: true })) === 'not_a_real_learner', 'flagged test accounts are left out');
  ok(sp.ineligibleReason(addUser({ is_demo: true })) === 'not_a_real_learner', 'demo accounts are left out');
  ok(sp.ineligibleReason(addUser({ age_check: null })) === 'age_not_answered', 'no age answer, no measurement');
  ok(sp.ineligibleReason(addUser({ age_check: kidCheck })) === 'needs_parent_agreement', 'under 13 without a parent is not measured');
  const kid = addUser({ age_check: kidCheck });
  const consent = db.insert('parental_consents', { child_user_id: kid.id, status: 'active', scopes: { measurement_extras: { active: true } } });
  db.update('users', kid.id, { consent_id: consent.id });
  ok(sp.ineligibleReason(fresh(kid)) === null, "under 13 with the parent's agreement to the optional measurement is measured");
  ok(sp.ageBand(fresh(kid)) === 'under13', 'age band under 13');
  const idUser = addUser();
  process.env.SPEED_PROOF_EXCLUDE_IDS = String(idUser.id);
  ok(sp.ineligibleReason(idUser) === 'owner', 'an excluded id (6689 is built in) is left out');
  delete process.env.SPEED_PROOF_EXCLUDE_IDS;
  process.env.SPEED_PROOF = 'off';
  ok(sp.ineligibleReason(u) === 'off' && !sp.enabled(), 'the switch turns it all off');
  ok(sp.assign(u.id, 'sk', {}) === null, 'off: nothing is recorded');
  process.env.SPEED_PROOF = 'on';
  ok(sp.ineligibleReason(addUser({ in_beta: false })) === null, 'on: beta membership is not asked');
  delete process.env.SPEED_PROOF;
  ok(sp.mode() === 'beta', 'default mode is beta');
}

// ── 2. the plain-way draw ────────────────────────────────────────────────────
{
  const u = addUser();
  const a = sp.assign(u.id, 'sk1', { trackId: 'math', gradeId: 'g1' });
  ok(a.arm === 'savant' && a.held_back === null, "without the learner's yes every skill is the Savant way");
  ok(sp.normalFor(u.id, 'sk1') === false && owner.ownerBase(u.id, 'sk1') === false, 'no consent, no plain skill, ownerBase unchanged');
  ok(sp.setConsent(fresh(u), true).ok && sp.consentedNormal(fresh(u)), 'the learner says yes');
  ok(sp.setConsent(addUser({ in_beta: false }), true).error, 'a non-beta account cannot opt in');
  let seed = 7;
  sp.setRandom((n) => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return (seed >> 8) % n; });
  const u2 = addUser();
  sp.setConsent(fresh(u2), true);
  const arms = [];
  for (let i = 0; i < 64; i++) {
    const r = sp.assign(u2.id, `s${i}`, { trackId: 'math', gradeId: 'g1' });
    arms.push(r.arm);
    if (r.arm === 'normal') db.update('speed_proof', r.id, { understood_at: at(i) }); // done, so the next may be drawn
  }
  ok(arms.filter((x) => x === 'normal').length === 8, 'exactly 1 in 8 over full blocks');
  for (let b = 0; b < 8; b++) ok(arms.slice(b * 8, b * 8 + 8).filter((x) => x === 'normal').length === 1, `block ${b} holds one plain skill`);
  const positions = new Set(arms.map((x, i) => (x === 'normal' ? i % 8 : -1)).filter((x) => x >= 0));
  ok(positions.size >= 3, 'the plain skill moves around inside the blocks (random, not every 8th)');
  const first = db.find('speed_proof', (r) => r.user_id === u2.id && r.skill_id === 's0');
  ok(sp.assign(u2.id, 's0', { trackId: 'math', gradeId: 'g1' }).id === first[0].id && first.length === 1, 'a skill is drawn once and never changed');
  sp.setRandom(null);
  // one open at a time, and ownerBase with the skill
  process.env.SPEED_PROOF_NORMAL_SHARE = '0.5';
  sp.setRandom(() => 0);
  const u3 = addUser();
  sp.setConsent(fresh(u3), true);
  const p1 = sp.assign(u3.id, 'a', { trackId: 'math', gradeId: 'g2' });
  const p2 = sp.assign(u3.id, 'b', { trackId: 'math', gradeId: 'g2' });
  ok([p1.arm, p2.arm].filter((x) => x === 'normal').length === 1 && p2.held_back === 'one_plain_skill_open', 'never two plain skills open at once');
  ok(p1.arm === 'normal' && owner.ownerBase(u3.id, 'a') === true, 'a plain skill is taught as the base product (ownerBase with the skill)');
  ok(owner.ownerBase(u3.id) === false && owner.ownerBase(u3.id, 'b') === false, "the learner's other skills are not base");
  sp.setRandom(null);
  delete process.env.SPEED_PROOF_NORMAL_SHARE;
  ok(sp.switchToSavant(u3.id, 'a').ok && sp.normalFor(u3.id, 'a') === false && owner.ownerBase(u3.id, 'a') === false, 'the learner can switch a plain skill to Savant at any time');
  ok(db.find('speed_proof', (r) => r.user_id === u3.id && r.skill_id === 'a')[0].arm === 'normal', 'the row keeps its assigned arm (intention to treat)');
  ok(sp.switchToSavant(u3.id, 'b').error, 'a Savant skill cannot be "switched"');
}

{
  // the real curriculum: a level's skill, and withSkill fixing the plain way for everything built inside it
  const grade = require('../config/curriculum').getGrade('math', 'algebra_1_part_a');
  const skill = sp.unitFor(grade, 1).key; // the arm is drawn per lesson stretch since 6 Nov, not per coarse skill
  ok(typeof skill === 'string' && skill.length > 0, `a real level has a skill (${skill})`);
  process.env.SPEED_PROOF_NORMAL_SHARE = '0.5';
  sp.setRandom(() => 0);
  const u = addUser();
  sp.setConsent(fresh(u), true);
  const enr = { track_id: 'math', grade_id: 'algebra_1_part_a', current_level: 1 };
  const inside = sp.withSkill(u.id, grade, enr, 1, () => ({ base: owner.ownerBase(u.id), draw: sp.normalFor(u.id, skill) }));
  ok(inside.base === true && inside.draw === true, 'building a plain-way skill runs as the base product');
  ok(owner.ownerBase(u.id) === false, 'and only inside it');
  ok(sp.plainAtLevel(u.id, enr, grade) === true, 'the test-out offer is held back at that level');
  sp.setRandom(null);
  delete process.env.SPEED_PROOF_NORMAL_SHARE;
}

// ── 3. minutes to understanding ──────────────────────────────────────────────
{
  const u = addUser();
  const row = sp.assign(u.id, 'frac', { trackId: 'math', gradeId: 'g1' });
  db.update('speed_proof', row.id, { assigned_at: at(0) });
  // session: 10 active minutes over 12 minutes, five answers at minutes 1, 3, 6, 10, 11 -> gaps 1,2,3,4,1 (weights of 11)
  db.insert('study_sessions', { user_id: u.id, status: 'ended', started_at: at(0), ended_at: at(12 * 60000), active_ms: 10 * 60000 });
  const mk = (i, min, correct, mastery, role = 'focus') => {
    const item = db.insert('items', { user_id: u.id, skill_id: 'frac', role, prompt: `p${i}`, answer: 'a', choices: ['a', 'b', 'c'], user_answer: correct ? 'a' : 'b', correct, difficulty: 2, created_at: at(min * 60000), updated_at: at(min * 60000), ms: 1000 });
    db.insert('events', { user_id: u.id, item_id: item.id, skill_id: 'frac', correct, mastery_after: mastery, created_at: at(min * 60000) });
  };
  mk(1, 1, false, 0.1); mk(2, 3, true, 0.4); mk(3, 6, true, 0.7); mk(4, 10, true, 0.85); mk(5, 11, true, 0.95);
  const r = sp.measure(u.id, T0 + DAY)[0];
  ok(r.understood_at === at(10 * 60000), 'understood at the first answer after which mastery is 0.8 or more');
  ok(r.answers === 4, 'answers up to understanding');
  near(r.minutes, 10 * (10 / 11), 0.01, 'session time shared by the gaps between activity; the fifth answer comes after understanding');
  // placement and test-out answers are not learning time
  const u2 = addUser();
  const row2 = sp.assign(u2.id, 'g', {});
  db.update('speed_proof', row2.id, { assigned_at: at(0) });
  for (let i = 0; i < 4; i++) { const it = db.insert('items', { user_id: u2.id, skill_id: 'g', role: 'skip', user_answer: 'a', correct: true, difficulty: 1, updated_at: at(i * 1000), ms: 5000 }); db.insert('events', { user_id: u2.id, item_id: it.id, correct: true, mastery_after: 0.99 }); }
  const rr = sp.measure(u2.id)[0];
  ok(rr.understood_at === null && rr.minutes === null, 'a skill credited by a test-out is not "understood by learning"');
  // fewer than 3 answers can not be understanding; answers outside a session use their own time
  const u3 = addUser();
  const row3 = sp.assign(u3.id, 'h', {});
  db.update('speed_proof', row3.id, { assigned_at: at(0) });
  for (let i = 0; i < 2; i++) { const it = db.insert('items', { user_id: u3.id, skill_id: 'h', role: 'focus', user_answer: 'a', correct: true, difficulty: 1, updated_at: at(i * 60000), ms: 30000 }); db.insert('events', { user_id: u3.id, item_id: it.id, correct: true, mastery_after: 0.95 }); }
  const r3 = sp.measure(u3.id)[0];
  ok(r3.understood_at === null && r3.answers === 2, 'two answers are not enough to call it understood');
  near(r3.minutes, 1, 0.01, 'answers outside any session count their own recorded time (2 x 30 s)');
  ok(sp.measure(999999).length === 0, 'no rows, nothing to measure');
}

// ── 4. delayed checks ────────────────────────────────────────────────────────
{
  const u = addUser();
  db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: 'g1', current_level: 1, status: 'active', retention_goal: { horizon: 'months', set_on: '2026-11-15' } });
  const row = sp.assign(u.id, 'chk', { trackId: 'math', gradeId: 'g1' });
  db.update('speed_proof', row.id, { understood_at: at(0), minutes: 5, answers: 4 });
  for (let i = 0; i < 3; i++) db.insert('items', { user_id: u.id, skill_id: 'chk', role: 'focus', prompt: `q${i}`, answer: 'right', choices: ['right', 'w1', 'w2', 'w3'], correct: true, user_answer: 'right' });
  ok(sp.due(u.id, T0 + 3600000).due === false, 'nothing is due an hour after understanding');
  ok(sp.due(u.id, T0 + 1.5 * DAY).due === true, 'the 1-day check is due');
  ok(db.byId('speed_proof', row.id).checks.map((c) => c.point).join() === 'd1,d7,d30,goal', 'schedule: 1, 7, 30 days and the chosen horizon');
  ok(db.byId('speed_proof', row.id).checks.find((c) => c.point === 'goal').due_at === at(90 * DAY), 'the chosen horizon (a few months = 90 days)');
  const v = sp.start(fresh(u), T0 + 1.5 * DAY);
  ok(v.check_id && v.questions.length === 1 && v.questions[0].choices.length === 4, 'one question for one due point, multiple choice');
  const open = fresh(u).speed_proof.open;
  const res = sp.answer(fresh(u), v.check_id, { 1: open.questions[0].key }, T0 + 1.5 * DAY);
  ok(res.ok && res.right === 1, 'a right answer is recorded');
  const c0 = db.byId('speed_proof', row.id).checks[0];
  ok(c0.done_at && c0.right === 1, 'the point is marked done');
  ok(sp.answer(fresh(u), v.check_id, {}).error, 'a check can not be answered twice');
  ok(sp.start(fresh(u), T0 + 1.6 * DAY).error, 'nothing more due that day');
  ok(sp.dueChecks(u.id, T0 + 12 * DAY).length === 0, 'the 7-day window (7 to 11 days) has closed unanswered by day 12');
  ok(db.byId('speed_proof', row.id).checks.find((c) => c.point === 'd7').missed === true, 'and the point is counted as missed');
  ok(sp.dueChecks(u.id, T0 + 31 * DAY).map((d) => d.point).join() === 'd30', 'the 30-day check is due at day 31');
  ok(sp.start(addUser({ in_beta: false }), T0).error, 'an ineligible account gets no check');
  const uf = addUser();
  const rf = sp.assign(uf.id, 'f', { trackId: 'none' });
  db.update('speed_proof', rf.id, { understood_at: at(0), minutes: 5 });
  sp.dueChecks(uf.id, T0 + DAY);
  ok(db.byId('speed_proof', rf.id).checks.length === 3, 'forever: only the 3 fixed points');
}

// ── 5. the statistics ────────────────────────────────────────────────────────
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function normal(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
let rid = 0;
function skillRow(arm, minutes, band, checksSpec) {
  return { id: ++rid, arm, understood_at: minutes === null ? null : 'x', minutes, difficulty: 2, switched_at: null, band, checks: checksSpec || [] };
}
const chk = (right, missed = false) => (missed ? { point: 'd7', done_at: null, missed: true, asked: 0, right: 0 } : { point: 'd7', done_at: 'x', asked: 1, right: right ? 1 : 0, missed: false });
/** Synthetic learners with a true speed-up and true retention gap; between-learner spread; a share of extreme ones. */
function synth(n, seed, { speedup = 5, retGap = 0, extremeShare = 0.1, band = '13to17' } = {}) {
  const r = lcg(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const extreme = r() < extremeShare;
    const base = Math.exp(Math.log(8) + 0.6 * normal(r));
    const lsp = extreme ? (r() < 0.5 ? 0.2 : 40) : speedup * Math.exp(0.35 * normal(r));
    const nS = 3 + Math.floor(r() * 6); const nN = 1 + Math.floor(r() * 2);
    const p0 = Math.min(0.97, Math.max(0.3, 0.8 + 0.1 * normal(r)));
    const rows = [];
    for (let k = 0; k < nS; k++) rows.push(skillRow('savant', base * Math.exp(0.3 * normal(r)), band, Array.from({ length: 3 }, () => chk(r() < Math.min(1, Math.max(0, p0 + retGap))))));
    for (let k = 0; k < nN; k++) rows.push(skillRow('normal', base * lsp * Math.exp(0.3 * normal(r)), band, Array.from({ length: 3 }, () => chk(r() < p0))));
    out.push({ user_id: i + 1, band, rows });
  }
  return out;
}
{
  const label = { label: 'SIMULATED' };
  const none = sp.buildReport([], label);
  ok(none.overall.verdict.status === 'not_enough_data' && none.overall.verdict.four_x_shown === false, 'no learners: not enough data');
  ok(/Not enough data/.test(none.overall.verdict.statement) && /NOT been shown/.test(none.overall.verdict.statement), 'the words say so plainly');
  ok(none.label === 'SIMULATED', 'a simulated report is labelled so');
  for (const n of [1, 2, 3, 5, 10, 19]) {
    const rep = sp.buildReport(synth(n, 100 + n, { speedup: 8 }), label);
    ok(rep.overall.verdict.status === 'not_enough_data', `${n} learners (true 8x): not enough data, no claim`);
    ok(!/Shown/.test(rep.overall.verdict.statement), `${n} learners: never says shown`);
  }
  ok(sp.buildReport(synth(1, 5), label).overall.time.speedup_ci95[0] === null, 'one learner has no interval');
  const oneArm = sp.buildReport([{ user_id: 1, band: '18plus', rows: [skillRow('savant', 3), skillRow('savant', 4)] }, { user_id: 2, band: '18plus', rows: [skillRow('normal', 9)] }], label);
  ok(oneArm.overall.time.learners_with_both_arms === 0 && oneArm.overall.verdict.status === 'not_enough_data', 'learners with only one way are counted but not compared');

  const seeds = Array.from({ length: 40 }, (_, i) => 9000 + i); // held out: nothing was tuned on these
  const run = (truth, retGap, n, extremeShare = 0.1) => seeds.map((s) => sp.buildReport(synth(n, s, { speedup: truth, retGap, extremeShare }), label));
  const shown = (reps) => reps.filter((x) => x.overall.verdict.status === 'shown').length / reps.length;
  const rep6 = run(6, 0, 120);
  const rep6clean = run(6, 0, 120, 0);
  const rep6clean250 = run(6, 0, 250, 0);
  const rep6x250 = run(6, 0, 250);
  const rep4 = run(4, 0, 120);
  const rep3 = run(3, 0, 120);
  const rep6bad = run(6, -0.2, 120);
  const power6 = shown(rep6);
  const falseAt4 = shown(rep4);
  const falseAt3 = shown(rep3);
  const power6clean = shown(rep6clean);
  console.log(`  retention is the slow gate (3 checks per arm per learner): 250 learners: P(shown | true 6x) = ${shown(rep6clean250).toFixed(2)} ordinary, ${shown(rep6x250).toFixed(2)} with 10% extreme`);
  console.log(`  synthetic, 40 held-out seeds, 120 learners, 10% extreme: P(shown | true 6x, equal retention) = ${power6.toFixed(2)} with 10% extreme learners (half 0.2x, half 40x) and ${power6clean.toFixed(2)} with none, | true 4x = ${falseAt4.toFixed(2)}, | true 3x = ${falseAt3.toFixed(2)}, | 6x but retention -20 pts = ${shown(rep6bad).toFixed(2)}`);
  ok(shown(rep6clean250) >= 0.8, `true 6x with ordinary learners and 250 learners is usually shown (${shown(rep6clean250)})`);
  ok(shown(rep6x250) >= 0.3, `with 10% extreme learners the gate clears more slowly, by design (${shown(rep6x250)})`);
  ok(power6clean >= 0.5, `at 120 learners the 5-point retention margin is what limits power (${power6clean})`);
  ok(falseAt4 <= 0.1, `true 4x is almost never "shown" because the lower end must clear 4 (${falseAt4})`);
  ok(falseAt3 === 0, `true 3x is never shown (${falseAt3})`);
  ok(shown(rep6bad) === 0, 'a big retention loss is never "shown"');
  ok(rep6bad.some((x) => x.overall.verdict.status === 'speed_shown_retention_worse'), 'and it is called out as speed without retention');
  ok(run(1.5, 0, 200).every((x) => x.overall.verdict.status === 'not_shown'), 'a true 1.5x is ruled out as not 4x');
  // what 50, 100 and 250 learners can show (printed for docs/SPEED-PROOF.md); ordinary learners, then 10% extreme
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  const table = {};
  for (const n of [50, 100, 250]) {
    for (const truth of [3, 4, 5, 6, 8]) {
      const reps = run(truth, 0, n, 0.05);
      const lows = reps.map((x) => x.overall.time.speedup_ci95[0]);
      table[`${n}:${truth}`] = { shown: shown(reps), point: med(reps.map((x) => x.overall.time.speedup_geomean)), lo: med(lows), hi: med(reps.map((x) => x.overall.time.speedup_ci95[1])), retLo: med(reps.map((x) => x.overall.retention.diff_ci95[0])) };
      console.log(`  n=${n} true ${truth}x (5% extreme): shown ${(shown(reps) * 100).toFixed(0)}%, median estimate ${table[`${n}:${truth}`].point}x, median 95% interval ${table[`${n}:${truth}`].lo}x to ${table[`${n}:${truth}`].hi}x, median retention lower end ${(table[`${n}:${truth}`].retLo * 100).toFixed(1)} pts`);
    }
  }
  ok(table['250:6'].shown > table['100:6'].shown && table['100:6'].shown >= table['50:6'].shown, 'more learners, more often shown');
  ok(table['50:3'].shown === 0 && table['100:3'].shown === 0 && table['250:3'].shown === 0, 'a true 3x is never shown at any size');
  ok(table['250:3'].hi - table['250:3'].lo < table['50:3'].hi - table['50:3'].lo, 'the interval narrows with more learners');
  const e50 = sp.buildReport(synth(50, 4242, { speedup: 5 }), label).overall;
  ok(!e50.estimate.early && /at least \d/.test(e50.estimate.statement) && /95% interval/.test(e50.estimate.statement), 'the estimate shows the point and its interval and an "at least" claim');
  ok(e50.estimate.at_least_x <= e50.estimate.point && e50.estimate.at_least_x <= e50.estimate.ci95[0], 'the "at least" figure is the lower end, rounded down');
  const early = sp.buildReport(synth(8, 4243, { speedup: 5 }), label).overall;
  ok(early.estimate.early && /^Early estimate, not a verdict/.test(early.estimate.statement) && early.verdict.status === 'not_enough_data', 'with few learners the estimate is shown but labelled early, and the verdict stays "not enough data"');
  ok(/we cannot say it is 4x/.test(e50.estimate.statement), 'it says plainly that 4x is not claimed until the lower end reaches 4');
  ok(e50.detectability && e50.detectability.learners_for_retention_gate_80pct > 20, `the retention gate needs ${e50.detectability && e50.detectability.learners_for_retention_gate_80pct} learners, reported from the observed spread`);
  const g = rep6[0].overall;
  ok(g.time.speedup_p10 < g.time.speedup_median && g.time.speedup_worst10_mean <= g.time.speedup_p10 + 1e-9, 'the worst 10% is below the median');
  ok(g.time.learners_below_1x >= 1, 'the extreme learners who are slower with Savant are counted, not hidden');
  console.log(`  worst 10% of learners (true 6x, 10% extreme): 10th percentile ${g.time.speedup_p10}x, mean of the worst tenth ${g.time.speedup_worst10_mean}x, median ${g.time.speedup_median}x, ${g.time.learners_below_1x} below 1x`);

  const wild = [
    { user_id: 1, band: '18plus', rows: [skillRow('savant', 0), skillRow('normal', 1e9)] },
    { user_id: 2, band: '18plus', rows: [skillRow('savant', 1e-9), skillRow('normal', 1e-9)] },
    { user_id: 3, band: 'under13', rows: [skillRow('savant', 5, 'under13', [chk(true, true), chk(true, true)]), skillRow('normal', 9, 'under13', [chk(true, true)])] },
    { user_id: 4, band: 'weird', rows: [] },
    { user_id: 5, band: '13to17', rows: [skillRow('savant', null), skillRow('normal', 5)] },
  ];
  const wildRep = sp.buildReport(wild, { label: 'SIMULATED', minLearners: 2 });
  const wildText = JSON.stringify(wildRep);
  ok(wildText.indexOf('NaN') < 0 && wildText.indexOf('Infinity') < 0, 'extreme input never produces NaN or Infinity in the report');
  ok(wildRep.learners[2].retention_diff === null && wildRep.overall.samples.savant_checks_missed === 2, 'all-missed checks give no retention figure and are counted as missed');

  const mixed = [...synth(30, 1, { band: 'under13', speedup: 6 }), ...synth(30, 2, { band: '13to17', speedup: 6 }).map((l) => ({ ...l, user_id: l.user_id + 100 })), ...synth(4, 3, { band: '18plus', speedup: 6 }).map((l) => ({ ...l, user_id: l.user_id + 200 }))];
  const m = sp.buildReport(mixed, { label: 'SIMULATED', minLearners: 20 });
  ok(m.by_age.under13.learners === 30 && m.by_age['13to17'].learners === 30 && m.by_age['18plus'].learners === 4, 'by age group');
  ok(m.by_age['18plus'].verdict.status === 'not_enough_data', 'a thin age group says not enough data');
  ok(m.by_age.under13.verdict.status !== 'not_enough_data', 'a full age group gets a verdict');
  const s6 = rep6.find((x) => x.overall.verdict.status === 'shown');
  ok(s6 && /Shown, on real learners/.test(s6.overall.verdict.statement), 'the shown statement is explicit (in real use only real rows reach it)');
}

// ── 6. guards and the report on the database ─────────────────────────────────
{
  process.env.SPEED_PROOF_NORMAL_SHARE = '0.5';
  sp.setRandom(() => 0);
  const u = addUser();
  sp.setConsent(fresh(u), true);
  const row = sp.assign(u.id, 'stuck', { trackId: 'math', gradeId: 'g9' });
  ok(row.arm === 'normal', 'drawn plain');
  db.update('speed_proof', row.id, { assigned_at: at(0) });
  for (let i = 0; i < 5; i++) { const it = db.insert('items', { user_id: u.id, skill_id: 'stuck', role: 'focus', user_answer: 'b', correct: false, difficulty: 2, updated_at: at(i * 60000), ms: 20000 }); db.insert('events', { user_id: u.id, item_id: it.id, correct: false, mastery_after: 0.1 }); }
  sp.measure(u.id, T0 + DAY);
  ok(db.byId('speed_proof', row.id).switch_reason === 'wrong_run', '5 wrong in a row: switched to the Savant way');
  ok(sp.normalFor(u.id, 'stuck') === false, 'and taught the Savant way from then on');
  const u2 = addUser();
  sp.setConsent(fresh(u2), true);
  const row2 = sp.assign(u2.id, 'slow', { trackId: 'math', gradeId: 'g9' });
  db.update('speed_proof', row2.id, { assigned_at: at(0) });
  db.insert('study_sessions', { user_id: u2.id, status: 'ended', started_at: at(0), ended_at: at(3 * 3600000), active_ms: 45 * 60000 });
  for (let i = 0; i < 4; i++) { const it = db.insert('items', { user_id: u2.id, skill_id: 'slow', role: 'focus', user_answer: i % 2 ? 'a' : 'b', correct: i % 2 === 1, difficulty: 2, updated_at: at((i + 1) * 10 * 60000), ms: 20000 }); db.insert('events', { user_id: u2.id, item_id: it.id, correct: i % 2 === 1, mastery_after: 0.3 }); }
  sp.measure(u2.id, T0 + DAY);
  ok(db.byId('speed_proof', row2.id).switch_reason === 'time_cap', 'past the time cap (30 minutes at least): switched');
  ok(sp.timeCapMinutes(u2.id) >= 30, 'the cap is never under 30 minutes');
  sp.setRandom(null);
  delete process.env.SPEED_PROOF_NORMAL_SHARE;

  db.remove('speed_proof', () => true); // the report below starts from rows written for it only
  const good = [];
  for (let i = 0; i < 4; i++) good.push(addUser());
  const bad = [addUser({ email: 'me@school.org' }), addUser({ email: 'boss@school.org' }), addUser({ email: 'z@example.com' }), addUser({ is_test: true })];
  for (const x of [...good, ...bad]) {
    for (const [arm, mins] of [['savant', 4], ['normal', 20]]) {
      db.insert('speed_proof', { user_id: x.id, skill_id: `${arm}1`, track_id: 'math', arm, assigned_at: at(0), switched_at: null, understood_at: at(1), minutes: mins, answers: 4, difficulty: 2, band: '18plus', checks: [{ point: 'd7', due_at: at(7 * DAY), closes_at: at(11 * DAY), done_at: at(8 * DAY), asked: 1, right: 1, missed: false }], v: 1 });
    }
  }
  const rep = sp.report({ now: T0 + 40 * DAY });
  ok(rep.left_out_accounts === 4, 'owner, admin, test and flagged accounts are left out of the live report');
  ok(rep.overall.time.learners_with_both_arms === 4, 'only the four eligible learners with both ways are compared');
  ok(rep.label === 'REAL_LEARNERS', 'the live report is labelled real learners');
  near(rep.overall.time.speedup_geomean, 5, 0.01, 'speed-up 20 / 4 minutes = 5x');
  ok(rep.overall.verdict.status === 'not_enough_data', 'four learners is not enough data by default (needs 20)');
  ok(/6689/.test(rep.notes[0]), 'the notes say who is excluded');
  process.env.SPEED_PROOF_MIN_LEARNERS = '3';
  ok(sp.report({ now: T0 + 40 * DAY }).overall.verdict.status !== 'not_enough_data', 'the learner minimum is a setting');
  delete process.env.SPEED_PROOF_MIN_LEARNERS;

  const kid = addUser({ age_check: kidCheck });
  const cons = db.insert('parental_consents', { child_user_id: kid.id, status: 'active', scopes: { measurement_extras: { active: true } } });
  db.update('users', kid.id, { consent_id: cons.id });
  db.insert('speed_proof', { user_id: kid.id, skill_id: 'k', arm: 'savant', assigned_at: at(0), understood_at: at(1), minutes: 4, band: 'under13', checks: [], v: 1 });
  const before = sp.report({ now: T0 + 40 * DAY }).learners.length;
  ok(sp.report({ now: T0 + 40 * DAY }).learners.some((l) => l.user_id === kid.id), "a child with the parent's agreement is in");
  db.update('parental_consents', cons.id, { scopes: { measurement_extras: { active: false } } });
  const afterReport = sp.report({ now: T0 + 40 * DAY });
  ok(!afterReport.learners.some((l) => l.user_id === kid.id) && afterReport.learners.length === before - 1, 'withdrawn agreement takes the child out');

  const st = sp.status(fresh(good[0]));
  const words = st.consent_text.body.join(' ');
  ok(st.available && /optional/i.test(words) && /plain way/.test(words) && /switch/.test(words), 'the consent wording says what the plain way is, that it is optional, and that they can switch');
  ok(sp.status(fresh(bad[0])).available === false, 'status is closed for excluded accounts');
}

console.log(`speed-proof-test: ${checks} checks passed (all data synthetic)`);
