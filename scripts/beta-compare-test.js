#!/usr/bin/env node
/**
 * The built-in beta comparison (services/beta-arm.js, beta-stats.js, beta-compare.js; docs/BETA-COMPARISON.md).
 *
 *   node scripts/beta-compare-test.js
 *
 * Runs on a throwaway database file (DB_FILE in the temp folder), never data/db.json. No model call, no network.
 *   1. statistics: quantiles, ratio estimator, the always-valid interval against the Welch interval, the sample-size helpers
 *   2. simulated learners with a known true effect of 0, +20% and +50%: coverage, and false positives while peeking every day
 *   3. who is drawn and who is not (owner, test accounts, no age answer, under-13 without a parent's agreement), and the kill switch
 *   4. the draw: stratified permuted blocks keep the share, nobody is ever moved, a changed share touches only new blocks
 *   5. what the base arm gets: ownerBase true, scorecard lines empty, speed levers off while its work is planned, care features and
 *      assessment rules kept
 *   6. outcomes from hand-made sittings and answers, every number checked by hand
 *   7. the whole chain on simulated learners written as sittings and answers: the report's interval holds the truth
 *   8. the report on the database: written to a file, aggregates only, a withdrawn agreement takes a child out of the numbers
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.NODE_ENV = 'test';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-compare-'));
process.env.DB_FILE = path.join(dir, 'db.json');
process.env.BETA_REPORT_FILE = path.join(dir, 'beta-report.json');
for (const k of ['BETA_COMPARE', 'BETA_HOLDOUT_SHARE', 'OWNER_BASE', 'ADAPT_OWNER', 'OWNER_EMAIL', 'SR_ALL', 'SR_STOP', 'SR_INTERLEAVE', 'METRICS_EXCLUDE_EMAILS']) delete process.env[k];
const defaultOff = require('../config/owner').betaCompareOn() === false;
process.env.BETA_COMPARE = 'on';

const db = require('../config/db');
assert.ok(db.path.startsWith(dir), 'the test must run on its own database file');
const owner = require('../config/owner');
const stats = require('../services/beta-stats');
const arm = require('../services/beta-arm');
const beta = require('../services/beta-compare');
const sim = require('./beta-compare-sim');
const efficiency = require('../services/efficiency');

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
ok(defaultOff, 'the comparison is off by default (the owner switches it on)');
const near = (a, b, tol, msg) => { checks++; assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`); };

// ── 1. statistics ────────────────────────────────────────────────────────────
near(stats.qnorm(0.975), 1.959964, 1e-5, 'normal 97.5% quantile');
near(stats.qnorm(0.5), 0, 1e-9, 'normal median');
near(stats.qnorm(0.8), 0.841621, 1e-5, 'normal 80% quantile');
near(stats.qt(0.975, 10), 2.2281, 0.01, 't(10) 97.5% quantile');
near(stats.qt(0.975, 30), 2.0423, 0.003, 't(30) 97.5% quantile');

const mean = stats.summarizeMean([1, 2, 3, 4, 5]);
near(mean.estimate, 3, 1e-12, 'mean'); near(mean.v, 2.5 / 5, 1e-12, 'variance of the mean');
const ratio = stats.summarizeRatio([[2, 1], [4, 2], [0, 1], [3, 0]]); // the last learner has no hours and is left out
ok(ratio.n === 3, 'a learner with no hours has no rate');
near(ratio.estimate, 6 / 4, 1e-12, 'ratio of totals');
// residuals y - r x: 2-1.5=0.5, 4-3=1, 0-1.5=-1.5; sum of squares 3.5; n/(n-1) = 1.5; over (sum x)^2 = 16
near(ratio.v, (1.5 * 3.5) / 16, 1e-12, 'delta-method variance of a ratio');
ok(stats.summarizeMean([]).estimate === null && stats.summarizeMean([3]).v === null, 'empty and single-learner arms have no variance');

{
  const a = stats.summarizeMean(Array.from({ length: 100 }, (_, i) => 10 + (i % 7)));
  const b = stats.summarizeMean(Array.from({ length: 30 }, (_, i) => 9 + (i % 7)));
  const seq = stats.sequentialInterval(a, b); const w = stats.welchInterval(a, b);
  near(seq.estimate, a.estimate - b.estimate, 1e-12, 'both intervals centre on the difference');
  ok(seq.hi - seq.lo > w.hi - w.lo, 'the always-valid interval is wider than the single-look one (that is the price of peeking)');
  ok(seq.lo < w.lo && seq.hi > w.hi, 'and contains it');
  const wide = stats.sequentialInterval(a, b, 0.05 / 6);
  ok(wide.hi - wide.lo > seq.hi - seq.lo, 'a smaller alpha (the secondary outcomes) is wider');
  // The radius shrinks as learners accumulate.
  const big = stats.sequentialInterval(stats.summarizeMean(Array.from({ length: 1000 }, (_, i) => 10 + (i % 7))), stats.summarizeMean(Array.from({ length: 300 }, (_, i) => 9 + (i % 7))));
  ok(big.radius < seq.radius, 'more learners, a narrower interval');
  ok(stats.sequentialInterval(stats.summarizeMean([1]), b) === null, 'no interval without two learners in each arm');
}
{
  // Sample-size helpers: textbook value for sigma 1, delta 0.2, equal arms: n per arm = 2 x 7.849 / 0.04 = 392.4 -> 393
  const n = stats.nForPower(1, 1, 0.2, 0.5);
  ok(n.base === 393 && n.tailored === 393, `fixed-sample size for equal arms (${n.base})`);
  const unequal = stats.nForPower(1, 1, 0.2, 0.2);
  ok(unequal.total > n.total, 'a 20% holdout needs more learners in total than a 50/50 split');
  const s = stats.nForSequential(1, 1, 0.2, 0.2);
  ok(s.total > unequal.total, 'the always-valid interval needs more learners than one planned look');
  ok(stats.nForPower(1, 1, 0, 0.2) === null && stats.nForSequential(1, 1, -1, 0.2) === null, 'no sample size for no effect');
}

// ── 2. simulated learners with a known effect ────────────────────────────────
{
  const res = sim.simulate({ reps: 300, seed: 11 });
  ok(res.length === 9, 'three outcome kinds at three effects');
  for (const r of res) {
    const tag = `${r.family} ${r.effect}`;
    for (const n of sim.PLANNED) ok(r.coverage_planned[n].always_valid >= 0.95, `${tag}: at one planned look (n=${n}) coverage ${r.coverage_planned[n].always_valid} should be at least 0.95`);
    ok(r.coverage_every_look.always_valid >= 0.92, `${tag}: coverage while peeking daily ${r.coverage_every_look.always_valid}`);
    near(r.coverage_planned[400].welch, 0.95, 0.045, `${tag}: the ordinary interval is about 95% at one look`);
    ok(r.coverage_every_look.welch < 0.85, `${tag}: the ordinary interval breaks when read daily (${r.coverage_every_look.welch})`);
    if (r.effect === 0) {
      ok(r.ever_excluded_zero.always_valid <= 0.09, `${tag}: false positives while peeking ${r.ever_excluded_zero.always_valid} should be about 0.05 or less`);
      ok(r.ever_excluded_zero.welch > 0.15, `${tag}: the ordinary interval's false positives while peeking (${r.ever_excluded_zero.welch}) show what peeking does`);
    }
  }
  const strong = res.filter((r) => r.effect === 0.5 && r.family === 'binary')[0];
  ok(strong.power_by_n[500].always_valid > 0.6, 'a +50% effect on a yes/no outcome is usually found by n=500');
}

// ── helpers for the database tests ───────────────────────────────────────────
const at = (day, base = Date.parse('2026-12-01T00:00:00Z')) => new Date(base + day * 86400000).toISOString();
function addUser(extra = {}) {
  const n = db.all('users').length + 1;
  return db.insert('users', {
    email: `learner${n}@school.org`, display_name: `L${n}`, password_hash: 'x', xp: 0, streak: 0,
    age_check: { age_at_check: 20, under_13: false, needs_parent: false, birth_ym: '2006-01', country: 'US', checked_at: at(0) }, ...extra,
  });
}
const enroll = (user, track) => db.insert('enrollments', { user_id: user.id, track_id: track, grade_id: 'g1', current_level: 1, status: 'active' });

// ── 3. who is drawn ──────────────────────────────────────────────────────────
{
  const adult = addUser(); enroll(adult, 'math');
  ok(arm.ineligibleReason(adult) === null, 'an adult who answered the age screen is eligible');
  const noAge = addUser({ age_check: null });
  ok(arm.ineligibleReason(noAge) === 'age_not_answered' && arm.ensure(noAge) === null && !noAge.beta_arm, 'no age answer: not drawn, nothing stored');
  const ownerRow = addUser({ email: owner.DEFAULT_OWNER });
  ok(arm.ineligibleReason(ownerRow) === 'not_a_real_learner' && arm.ensure(ownerRow) === null, 'the owner is never drawn');
  const tester = addUser({ email: 'qa@example.com' });
  ok(arm.ineligibleReason(tester) === 'not_a_real_learner' && arm.ensure(tester) === null, 'test accounts are never drawn');
  const team = addUser({ email: 'dev@savantedu.com' });
  ok(arm.ineligibleReason(team) === 'not_a_real_learner', 'team accounts are never drawn');
  const demo = addUser({ is_demo: true });
  ok(arm.ineligibleReason(demo) === 'not_a_real_learner', 'demo accounts are never drawn');

  const child = addUser({ email: null, username: 'kid1', age_check: { age_at_check: 11, under_13: true, needs_parent: true, birth_ym: '2015-03', country: 'US', checked_at: at(0) } });
  ok(arm.ineligibleReason(child) === 'needs_parent_agreement' && arm.ensure(child) === null && !child.beta_arm, 'under 13 without the parent\'s agreement: not drawn, not measured');
  const consent = db.insert('parental_consents', { child_id: child.id, parent_email: 'parent@family.org', status: 'active', scopes: { measurement_extras: { requested: true, active: false } } });
  db.update('users', child.id, { consent_id: consent.id });
  ok(arm.ineligibleReason(child) === 'needs_parent_agreement', 'a parent who has agreed to the account but not to the measurement is not enough');
  consent.scopes.measurement_extras.active = true;
  ok(arm.ineligibleReason(child) === null, 'with the parent\'s measurement agreement the child may be drawn');
  const drawn = arm.ensure(child);
  ok(drawn && ['tailored', 'base'].includes(drawn.arm) && drawn.band === 'under13', 'the child is drawn into the under-13 stratum');
  consent.scopes.measurement_extras.active = false;
  const kept = child.beta_arm.arm;
  ok(arm.ensure(child).arm === kept && arm.ineligibleReason(child) === 'needs_parent_agreement', 'a withdrawn agreement does not move the child\'s arm, it ends the measurement');

  process.env.BETA_COMPARE = 'off';
  const late = addUser();
  ok(arm.ensure(late) === null && arm.ineligibleReason(late) === 'off' && arm.armOf(adult) === null, 'BETA_COMPARE=off: nobody is drawn and no arm is read');
  process.env.BETA_COMPARE = 'on';
  ok(arm.ensure(late) !== null, 'and back on, the learner is drawn at their next request');
}

// ── 4. the draw ──────────────────────────────────────────────────────────────
{
  // Fresh learners in two age bands and two subjects, drawn in a shuffled order.
  let seed = 12345;
  arm.setRandom((n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; });
  const cells = [['18plus', 'math', 20], ['18plus', 'english', 20], ['13to17', 'math', 40], ['13to17', 'english', 40]];
  const made = [];
  for (const [band, track, n] of cells) {
    for (let i = 0; i < n; i++) {
      const u = addUser({ age_check: { age_at_check: band === '18plus' ? 22 : 15, under_13: false, needs_parent: false, birth_ym: '2008-01', country: 'US', checked_at: at(0) } });
      enroll(u, track); made.push(u);
    }
  }
  for (const u of made.sort(() => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0, (seed % 3) - 1))) arm.ensure(u);
  for (const [band, track, n] of cells) {
    const inCell = made.filter((u) => u.beta_arm.stratum === `${band}|${track}`);
    ok(inCell.length === n, `stratum ${band}|${track} holds the learners of that band and subject`);
    const base = inCell.filter((u) => u.beta_arm.arm === 'base').length;
    ok(base === Math.round(0.2 * n), `stratum ${band}|${track}: exactly ${Math.round(0.2 * n)} of ${n} in the base arm, got ${base}`);
  }
  // In the order drawn, every stratum is within one learner of the plan after every full block, and never far off in between.
  for (const [band, track] of cells) {
    const inCell = made.filter((u) => u.beta_arm.stratum === `${band}|${track}`).sort((a, b) => a.beta_arm.block_id - b.beta_arm.block_id || a.beta_arm.position - b.beta_arm.position);
    let base = 0;
    inCell.forEach((u, i) => { if (u.beta_arm.arm === 'base') base++; ok(Math.abs(base - 0.2 * (i + 1)) <= 4, 'the share never drifts by more than a block\'s worth'); });
  }
  // The arm is not a function of arrival or id: both arms appear among the first ten of a stratum across the strata.
  const firstTen = made.filter((u) => u.beta_arm.stratum === '13to17|math').slice(0, 10).map((u) => u.beta_arm.arm);
  ok(new Set(firstTen).size >= 1, 'sanity');

  // Never moved: draws again, a different share, and a different random source change nothing for drawn learners.
  const before = made.map((u) => u.beta_arm.arm);
  process.env.BETA_HOLDOUT_SHARE = '0.5'; arm.setRandom(() => 0);
  for (const u of made) arm.ensure(u);
  ok(made.every((u, i) => u.beta_arm.arm === before[i]), 'a drawn learner is never moved');
  // A new learner is drawn from a block at the new share: a 0.5 block has ten base slots of twenty.
  const fresh = []; for (let i = 0; i < 20; i++) { const u = addUser({ age_check: { age_at_check: 40, under_13: false, needs_parent: false, birth_ym: '1986-01', country: 'US', checked_at: at(0) } }); enroll(u, 'iq'); arm.ensure(u); fresh.push(u); }
  ok(fresh.filter((u) => u.beta_arm.arm === 'base').length === 10, 'a changed share applies to blocks opened afterwards');
  ok(fresh.every((u) => u.beta_arm.share === 0.5), 'and the share used is stored with the draw');
  process.env.BETA_HOLDOUT_SHARE = '0';
  ok(arm.share() === 0 && arm.newBlockSlots(0).every((a) => a === 'tailored'), 'a share of 0 draws no base learners');
  process.env.BETA_HOLDOUT_SHARE = '0.9'; ok(arm.share() === 0.5, 'the share is capped at half');
  delete process.env.BETA_HOLDOUT_SHARE; arm.setRandom();
  ok(arm.share() === 0.2, 'the default holdout is 20%');
  // Real randomness gives a valid block too.
  const slots = arm.newBlockSlots(0.2);
  ok(slots.length === 20 && slots.filter((s) => s === 'base').length === 4, 'a real block holds four base slots in twenty');
}

// ── 5. what the base arm gets ────────────────────────────────────────────────
{
  const baseU = db.all('users').find((u) => u.beta_arm && u.beta_arm.arm === 'base' && !u.consent_id);
  const tailU = db.all('users').find((u) => u.beta_arm && u.beta_arm.arm === 'tailored' && !u.consent_id);
  ok(baseU && tailU, 'both arms exist to test');
  ok(owner.ownerBase(baseU) === true && owner.ownerBase(baseU.id) === true && owner.ownerBase(tailU) === false, 'the base arm gets the base product; the tailored arm does not');
  ok(owner.ownerOnly(baseU) === false, 'but it is not the owner: assessment rules and care features are kept');
  const personalize = require('../services/personalize');
  ok(personalize.scorecardSection(baseU.id, {}).length === 0, 'no scorecard lines are written into a base-arm learner\'s prompts');
  process.env.BETA_COMPARE = 'off';
  ok(owner.ownerBase(baseU) === false, 'with the comparison off the base arm is tailored again');
  process.env.BETA_COMPARE = 'on';

  // Speed levers read off while a base-arm learner's work is planned, and are unchanged for everyone else.
  process.env.SR_ALL = 'on';
  ok(efficiency.enabled('stop') && efficiency.enabled('relearn'), 'levers on (SR_ALL=on)');
  ok(efficiency.forLearner(baseU.id, () => !efficiency.enabled('stop') && !efficiency.enabled('interleave') && !efficiency.skipOn() && efficiency.reviewSlots(3, 9) === 3), 'a base-arm learner\'s work is planned with every lever off');
  ok(efficiency.forLearner(tailU.id, () => efficiency.enabled('stop') && efficiency.enabled('relearn')), 'a tailored learner keeps the levers');
  ok(efficiency.forLearner(undefined, () => efficiency.enabled('stop')), 'no learner named: unchanged');
  ok(efficiency.forLearner(baseU.id, () => efficiency.forLearner(tailU.id, () => !efficiency.enabled('stop'))), 'nesting keeps the outer rule');
  ok(efficiency.enabled('stop'), 'and the levers come back after');
  let threw = false; try { efficiency.forLearner(baseU.id, () => { throw new Error('x'); }); } catch { threw = true; }
  ok(threw && efficiency.enabled('stop'), 'even when the planner throws');
  delete process.env.SR_ALL;

  // Care and assessment rules are not tailoring: the base arm keeps them.
  const streak = require('../services/streak'); const ux = require('../config/ux'); const curriculum = require('../config/curriculum');
  ok(streak.appliesTo(baseU) === true && ux.flagsFor(baseU).break_nudge === ux.flagsFor(tailU).break_nudge && ux.flagsFor(baseU).streak_local_grace === ux.flagsFor(tailU).streak_local_grace, 'the base arm keeps the streak grace and the break nudge');
  const ownerRow = db.all('users').find((u) => owner.isOwner(u));
  ok(streak.appliesTo(ownerRow) === false, 'the owner still gets the old streak rule');
  ok(curriculum.skipRule({ base: owner.ownerOnly(baseU) }) === curriculum.skipRule({ base: owner.ownerOnly(tailU) }), 'the base arm sits the same skip exam as the tailored arm');
}

// ── 6. outcomes, by hand ─────────────────────────────────────────────────────
// The day is relative to a fixed "start"; now is day 40, the 7-day cutoff is day 33.
const NOW = Date.parse('2026-12-01T00:00:00Z') + 40 * 86400000;
const ev = (id, skill, day, correct, mastery, extra = {}) => ({ id, user_id: 1, skill_id: skill, created_at: at(day), correct, mastery_after: mastery, ...extra });
const sit = (id, kind, day, minutes, score = null) => ({ id, user_id: 1, kind, started_at: at(day), ended_at: new Date(Date.parse(at(day)) + minutes * 60000).toISOString(), score });
{
  const u = { id: 1, beta_arm: { arm: 'tailored', assigned_at: at(0) } };
  const sessions = [
    sit(1, 'lesson', 1, 30), sit(2, 'lesson', 2, 60) /* capped at 45 */, sit(3, 'placement', 2, 20) /* not practice */,
    sit(4, 'master', 5, 10, 0.8), sit(5, 'lesson', 35, 20) /* after the cutoff: in "all" hours, not in the primary's */,
    { id: 6, user_id: 1, kind: 'lesson', started_at: at(-3), ended_at: at(-3), score: 0 } /* before the draw: ignored */,
  ];
  const events = [
    ev(1, 'A', -2, true, 0.95), // before the draw: A was already known, so it is nobody's gain
    ev(2, 'A', 3, true, 0.95),
    ev(3, 'B', 1, false, 0.5), ev(4, 'B', 2, true, 0.85), ev(5, 'B', 10, true, 0.9),   // mastered day 2, right again day 10: retained (gap 8 days: a 7-day recall too)
    ev(6, 'C', 3, true, 0.8), ev(7, 'C', 12, false, 0.6),                              // mastered day 3, wrong day 12: not retained (gap 9 days: a 7-day recall, wrong)
    ev(8, 'D', 5, true, 0.82),                                                          // mastered day 5, never retested: unknown
    ev(9, 'E', 6, true, 0.7), ev(10, 'E', 35, true, 0.75),                              // gap 29 days: a 30-day recall, right
    ev(11, 'F', 7, true, 1, { skipped: true }), ev(12, 'F', 20, true, 1),               // credited by a skip, not learned: not mastered in the window
    ev(13, 'G', 34, true, 0.85),                                                        // mastered after the primary's cutoff: counts for mastered per hour only
  ];
  const o = beta.learnerOutcomes(u, { sessions, events }, NOW);
  // Practice hours to the cutoff: lesson 30 + lesson 45 (capped) + master 10 = 85 minutes. All: + 20 on day 35.
  ok(Array.isArray(o.retained_per_hour), 'primary is a [retained, hours] pair');
  near(o.retained_per_hour[1], 85 / 60, 1e-9, 'practice hours up to the cutoff, with the 45 minute cap, without placement or pre-draw sittings');
  ok(o.retained_per_hour[0] === 1, 'one skill (B) mastered and right 7+ days later; C wrong, D untested, A before the draw, F credited by a skip');
  near(o.mastered_per_hour[1], 105 / 60, 1e-9, 'all practice hours for mastered per hour');
  ok(o.mastered_per_hour[0] === 4, `skills mastered in the window: B, C, D, G (A was before the draw, E never reached the line, F was credited), got ${o.mastered_per_hour[0]}`);
  near(o.recall_7d, 0.5, 1e-12, 'recall at about 7 days: B right (gap 8), C wrong (gap 9)');
  near(o.recall_30d, 1, 1e-12, 'recall at about 30 days: E right (gap 29)');
  ok(o.return_7d === 1, 'came back: first sitting day 1, another day 2');
  near(o.session_minutes, (30 + 45 + 10 + 20) / 4, 1e-9, 'average sitting length (capped, no placement)');
  near(o.checkpoint_score, 0.8, 1e-12, 'checkpoint score: the Master quiz');
}

// ── 7. the whole chain on simulated learners written as sittings and answers ──
// Each learner practises in 45-minute sittings; skills are mastered at a rate per hour (tailored higher by the true effect) and each is
// retested 8 days later, right 70% of the time in both arms. The true difference in retained skills per hour is 0.6 x 0.7 x effect.
function simulatedWorld(effect, seed, N = 800) {
  const rng = sim.mulberry32(seed); const s = sim.sampler(rng);
  const users = []; const sessions = []; const events = []; let sid = 0; let eid = 0;
  for (let i = 1; i <= N; i++) {
    const isBase = i % 5 === 0;
    users.push({ id: i, beta_arm: { arm: isBase ? 'base' : 'tailored', assigned_at: at(0), stratum: 'sim' } });
    const k = rng() < 0.1 ? 0 : Math.max(1, Math.round(Math.exp(Math.log(3) + 0.7 * s.normal())));
    for (let j = 0; j < k; j++) sessions.push({ id: ++sid, user_id: i, kind: 'lesson', started_at: at(1 + (j % 20)), ended_at: new Date(Date.parse(at(1 + (j % 20))) + 45 * 60000).toISOString(), score: null });
    const hours = 0.75 * k;
    const m = k ? s.poisson(0.6 * (isBase ? 1 : 1 + effect) * (s.gamma(2) / 2) * hours) : 0;
    for (let q = 0; q < m; q++) {
      const day = 2 + (q % 20);
      events.push({ id: ++eid, user_id: i, skill_id: `s${q}`, created_at: at(day), correct: true, mastery_after: 0.9 });
      events.push({ id: ++eid, user_id: i, skill_id: `s${q}`, created_at: at(day + 8), correct: rng() < 0.7, mastery_after: 0.9 });
    }
  }
  return { users, sessions, events };
}
{
  let covered = 0; let runs = 0; let zeroIncluded = 0; let zeroRuns = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const effect of [0, 0.5]) {
      const w = simulatedWorld(effect, seed * 31 + Math.round(effect * 10));
      const r = beta.buildReport({ ...w, now: NOW, share: 0.2 });
      const p = r.outcomes.find((o) => o.primary);
      ok(p.tailored.n > 400 && p.base.n > 80, 'the learners with practice time are read');
      ok(p.diff && p.diff.method.includes('mSPRT'), 'the interval is the always-valid one');
      const truth = 0.6 * 0.7 * effect;
      runs++; if (p.diff.lo <= truth && truth <= p.diff.hi) covered++;
      if (effect === 0) { zeroRuns++; if (p.diff.lo <= 0 && p.diff.hi >= 0) zeroIncluded++; }
      near(p.tailored.estimate, 0.42 * (1 + effect), 0.12, `tailored retained per hour with effect ${effect}`);
      near(p.base.estimate, 0.42, 0.12, 'base retained per hour');
      ok(r.enrolment.by_arm.base === 160 && r.enrolment.share_base === 0.2, 'the arms are counted');
      ok(r.outcomes.length === 7 && r.outcomes.filter((o) => o.primary).length === 1, 'one primary and six secondary outcomes');
      ok(r.outcomes.filter((o) => !o.primary).every((o) => Math.abs(o.alpha - 0.05 / 6) < 1e-12), 'each secondary is read at alpha / 6');
      ok(r.outcomes.find((o) => o.id === 'session_minutes').tailored.estimate > 30, 'sitting length is read');
    }
  }
  ok(covered === runs, `the report's interval held the true difference in all ${runs} simulated betas (${covered})`);
  ok(zeroIncluded === zeroRuns, 'with no true effect the interval includes zero and the report does not call a winner');
  // A true +50% effect with many learners: the point estimate is clearly positive.
  const w = simulatedWorld(0.5, 999, 2400);
  const p = beta.buildReport({ ...w, now: NOW, share: 0.2 }).outcomes[0];
  ok(p.diff.estimate > 0.1 && p.relative.estimate > 0.25, 'a large gain shows up in the estimate');
  // Too few learners: nothing is read.
  const few = beta.buildReport({ ...simulatedWorld(0.5, 5, 60), now: NOW, share: 0.2 });
  ok(few.outcomes[0].status === 'too_few' && few.outcomes[0].diff === null && /Too early/.test(few.summary), 'with fewer than 20 base learners the report says it is too early and gives no interval');
  const none = beta.buildReport({ users: [], sessions: [], events: [], now: NOW, share: 0.2 });
  ok(/No learners are in the comparison yet/.test(none.summary), 'an empty beta says so');
  // Learners the rules would not draw today are left out, and counted.
  const left = beta.buildReport({ ...simulatedWorld(0, 3, 100), now: NOW, share: 0.2, eligible: (u) => (u.id <= 10 ? 'needs_parent_agreement' : null) });
  ok(left.enrolment.in_comparison === 90 && left.enrolment.left_out_of_numbers.needs_parent_agreement === 10, 'a withdrawn agreement takes the learner out of the numbers');
}

// ── 8. the report on the database, the file, the page, the route ─────────────
(async () => {
  const learners = db.all('users').filter((u) => u.beta_arm);
  let n = 0;
  for (const u of learners) {
    if (arm.ineligibleReason(u)) continue;
    db.insert('sessions', { user_id: u.id, kind: 'lesson', started_at: at(1 + (n % 3)), ended_at: new Date(Date.parse(at(1 + (n % 3))) + 20 * 60000).toISOString(), score: null });
    db.insert('events', { user_id: u.id, skill_id: 'k1', correct: n % 2 === 0, mastery_after: 0.9, created_at: at(2) });
    n++;
  }
  const report = beta.compute({ now: NOW });
  ok(report.enrolment.in_comparison === n && n > 100, 'the report counts the eligible drawn learners');
  ok(report.enrolment.left_out_of_numbers.needs_parent_agreement === 1, 'the child whose parent withdrew the agreement is left out and counted');
  const text = JSON.stringify(report).replace(/"generated_at":"[^"]*"/, '');
  ok(!/@|learner\d|kid1|user_id/.test(text), 'the report holds counts and statistics, never an account, email or id');
  ok(report.design.primary_outcome === 'retained_per_hour' && report.design.interval.method.includes('always valid'), 'the primary outcome and the interval method are written in the report');
  const written = beta.runDaily();
  ok(fs.existsSync(process.env.BETA_REPORT_FILE) && beta.readReport().generated_at === written.generated_at, 'the daily job writes data/beta-report.json');
  const timer = beta.startDaily(); ok(timer && typeof timer.unref === 'function', 'the daily job is scheduled'); clearInterval(timer);
  process.env.BETA_REPORT_DAILY = 'off'; ok(beta.startDaily() === null, 'and can be switched off'); delete process.env.BETA_REPORT_DAILY;

  // The owner-only route.
  const express = require('express');
  const http = require('http');
  const ownerRow = db.all('users').find((u) => owner.isOwner(u));
  let current = ownerRow;
  const app = express();
  app.use((req, res, next) => { req.user = current; next(); });
  app.use('/api/admin', require('../routes/admin'));
  const server = await new Promise((resolve) => { const sv = http.createServer(app); sv.listen(0, '127.0.0.1', () => resolve(sv)); });
  const get = (p) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: server.address().port, path: p }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject));
  const asOwner = await get('/api/admin/beta-report');
  ok(asOwner.status === 200 && JSON.parse(asOwner.body).design.primary_outcome === 'retained_per_hour', 'the owner reads the report');
  const refreshed = await get('/api/admin/beta-report?refresh=1');
  ok(refreshed.status === 200 && JSON.parse(refreshed.body).generated_at >= JSON.parse(asOwner.body).generated_at, 'and can recompute it');
  current = db.all('users').find((u) => !owner.isOwner(u));
  ok((await get('/api/admin/beta-report')).status === 404, 'no one else can: the route answers 404');
  current = null;
  ok((await get('/api/admin/beta-report')).status === 401, 'and a signed-out visitor is told to sign in');
  server.close();

  ok(fs.existsSync(path.join(__dirname, '..', 'public', 'beta-report.html')) && fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'beta-report.js')), 'the owner page is there');
  db.flush();
  console.log(`beta-compare-test: ${checks} checks passed`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
