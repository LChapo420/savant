/**
 * Tests for the practice-dose plan (staged skills round 3, patch
 * 04-practice-dose): services/skill-adaptation.js (with the maintenance share),
 * services/skill-dose.js and routes/skill-dose.js. Needs patch 01; the played
 * drills need patch 02.
 *
 *   node scripts/skills-r3-dose-test.js
 *
 * Throwaway data file, keys blanked, no model call, no network.
 */
const F = require('./lib/skills-r3-fixture');

const { db, check, learner, serve, fresh, HOUR, DAY, at, later, now } = F;
const record = require('../services/skill-record');
const sa = require('../services/skill-adaptation');
const sc = require('../services/skill-coverage');

let checksApplied = true;
try { require.resolve('../services/skill-checks'); } catch { checksApplied = false; }

(async () => {
  console.log('skills round 3, patch 04: the practice-dose plan');

  // ── the plan itself (skill-adaptation), on records built by hand ──
  const stage = sc.stagesFor('chess')[3]; // CH3: four metrics, all provable
  const t0 = Date.UTC(2026, 9, 1, 9);
  let rec = sc.blankRecord('chess');
  let plan = sa.planSession({ stage, rec, now: t0, minutes: 30, knowledgeOpen: true });
  check('a blank record: every metric gets practice, none is dropped (checkPlan)', sa.checkPlan(stage, rec, plan).length === 0 && plan.practice.filter((p) => p.kind === 'practice').length === 4, plan.practice);
  check('...no cold test yet (no warm sets say any is ready)', plan.sittings.length === 0);
  // One metric proven quickly (3 sets), one far from target, two in between.
  const [m0, m1, m2, m3] = stage.metrics.map((m) => m.id);
  for (let i = 0; i < 3; i++) sa.practiseSet(rec, m0, t0 - (5 - i) * DAY, true);
  rec.metrics[m0].status = 'proven'; rec.metrics[m0].proven_at = t0 - DAY; rec.metrics[m0].sittings.push({ at: t0 - DAY, pass: true, cold: true, counts: true, source: 'exact' });
  for (let i = 0; i < 3; i++) { sa.practiseSet(rec, m1, t0 - (4 - i) * DAY, false); sa.practiseSet(rec, m2, t0 - (4 - i) * DAY, i > 0); sa.practiseSet(rec, m3, t0 - (4 - i) * DAY, i === 2); }
  plan = sa.planSession({ stage, rec, now: t0, minutes: 40, knowledgeOpen: false });
  const setsOf = (id, kind) => plan.practice.filter((p) => p.metric === id && (!kind || p.kind === kind)).reduce((a, p) => a + p.sets, 0);
  check('dose: the metric furthest from target gets the most sets', setsOf(m1) >= setsOf(m2) && setsOf(m1) >= setsOf(m3) && setsOf(m1) > 1, plan.practice);
  check('the maintenance share: the proven metric short of its over-learning dose keeps sets ("overlearn")', setsOf(m0, 'overlearn') >= 1 && sa.overlearnDeficit(rec.metrics[m0]) > 0, { plan: plan.practice, deficit: sa.overlearnDeficit(rec.metrics[m0]) });
  check('...and every unproven metric still has practice (checkPlan)', sa.checkPlan(stage, rec, plan).length === 0);
  process.env.SKILL_MAINT_SHARE = '0';
  const r2 = sa.planSession({ stage, rec, now: t0, minutes: 40, knowledgeOpen: false });
  check("SKILL_MAINT_SHARE=0 is round 2's plan: the proven metric gets one maintenance set", r2.practice.filter((p) => p.metric === m0).every((p) => p.kind === 'maintenance' && p.sets === 1), r2.practice);
  delete process.env.SKILL_MAINT_SHARE;
  // Dose done: once a proven metric has had twice its proof's sets, it drops to maintenance.
  for (let i = 0; i < 8; i++) sa.practiseSet(rec, m0, t0 - DAY + (i + 1) * 60000, true);
  check('after twice the sets it took to prove it, its over-learning dose is done', sa.overlearnDeficit(rec.metrics[m0]) === 0, { sets: rec.metrics[m0].sets, at: rec.metrics[m0].sets_at_proof });
  plan = sa.planSession({ stage, rec, now: t0 + DAY, minutes: 40, knowledgeOpen: false });
  check('...and it gets only its maintenance set', plan.practice.filter((p) => p.metric === m0).every((p) => p.kind === 'maintenance'), plan.practice);
  // A cold test when the warm sets say it is ready.
  for (let i = 0; i < 3; i++) sa.practiseSet(rec, m2, t0 - 3 * DAY + i * 60000, true);
  plan = sa.planSession({ stage, rec, now: t0 + DAY, minutes: 40, knowledgeOpen: false });
  check('three warm sets at target in a row call a cold stage test', plan.sittings.some((s) => s.metric === m2 && s.kind === 'stage_test'), plan.sittings);

  // ── the app: routes, the day's plan, sets ──
  const routes = fresh('routes/skills');
  const app = await serve([routes]);
  const bb = learner('basketball', 'basketball_mini_starter');
  const base = `/api/skills/practice/${bb.enrollment.id}`;
  let r = await app.get(base, bb.user.id);
  check('off: the practice plan answers 404', r.status === 404);
  process.env.SKILL_RECORD = 'on';
  process.env.SKILL_DOSE = 'on';
  if (checksApplied) process.env.SKILL_STAGE_TESTS = 'on';
  at(Date.UTC(2026, 9, 10, 9));
  r = await app.get(base, bb.user.id);
  const p = r.json.practice;
  check('on: today\'s plan for BB1 gives every provable skill sets, from the stage\'s session length', r.status === 200 && p.stage.id === 'BB1' && p.practice.length === 4 && p.sets >= 4 && !p.problems.length, p);
  check('...and says why', p.reasons.some((x) => /dose/.test(x)));
  r = await app.get(`/api/skills/path/${bb.enrollment.id}`, bb.user.id);
  check("the path shows Today's practice", r.json.nodes.some((n) => n.kind === 'practice' && n.next), r.json.nodes);
  const lay = 'BB1:layup_both_hands';
  if (checksApplied) {
    r = await app.post(`${base}/${lay}/log`, { left: { makes: 9, attempts: 10 }, right: { makes: 10, attempts: 10 } }, bb.user.id);
    check('a logged lay-up set is judged by the check\'s own rule (at the bar)', r.json.at_target === true, r.json);
  } else {
    r = await app.post(`${base}/${lay}/log`, { at_target: true }, bb.user.id);
    check('without patch 02 a set is logged on the learner\'s word', r.json.at_target === true && /own word/.test(r.json.note), r.json);
  }
  const row = db.findOne('skill_records', (x) => x.user_id === bb.user.id && x.metric_id === lay);
  check('the set is recorded as warm practice, not a sitting', row.warm.length === 1 && row.sittings.length === 0 && row.last_practice_at === now());
  check('...so a sitting of that skill today would be warm', !sc.isCold(row, now() + HOUR));
  r = await app.get(base, bb.user.id);
  check('the day\'s plan counts the set down', r.json.practice.practice.find((x) => x.metric === lay).done === 1);

  if (checksApplied) {
    // A warm items set: answers marked straight away.
    const rules = 'BB1:rules_basics';
    r = await app.post(`${base}/${rules}/start`, {}, bb.user.id);
    check('a warm set of the rules check: 5 questions, no key sent', r.json.set && r.json.set.items.length === 5 && !JSON.stringify(r.json).includes('"key"'), r.json);
    const items = db.findOne('skill_records', (x) => x.user_id === bb.user.id && x.metric_id === rules).practice_open.items;
    r = await app.post(`${base}/${rules}/answer`, { index: 0, answer: 'not this' }, bb.user.id);
    check('a wrong answer is marked at once, with the answer shown', r.json.correct === false && r.json.answer === items[0].key.answer, r.json);
    for (let i = 1; i < 5; i++) await app.post(`${base}/${rules}/answer`, { index: i, answer: items[i].key.answer }, bb.user.id);
    r = await app.post(`${base}/${rules}/finish`, {}, bb.user.id);
    check('4 of 5 is at the check\'s bar (8 of 10), recorded as practice', r.json.at_target === true && db.findOne('skill_records', (x) => x.user_id === bb.user.id && x.metric_id === rules).warm.length === 1, r.json);
    // The plan calls a cold test early, and the stage check shows it before the Final.
    const pi = learner('piano', 'piano_keyboard_explorer');
    at(Date.UTC(2026, 9, 11, 9));
    for (let i = 0; i < 3; i++) record.practise(pi.user.id, { subject: 'piano', metricId: 'PI0:find_keys', atTarget: true, at: now() - 2 * DAY + i * 60000 });
    r = await app.get(`/api/skills/checks/${pi.enrollment.id}`, pi.user.id);
    check('with the plan on, a skill whose warm sets are ready is due on the stage check before the Final', r.json.checks.due.includes('PI0:find_keys') && !r.json.checks.battery_open, r.json.checks.due);
    r = await app.get(`/api/skills/practice/${pi.enrollment.id}`, pi.user.id);
    check("...and today's practice says to sit it first, cold", r.json.practice.sittings.some((s) => s.metric === 'PI0:find_keys'));
  }
  const ch = learner('chess', 'chess_novice_club_player');
  r = await app.post(`/api/skills/practice/${ch.enrollment.id}/CH3:games/log`, { at_target: true }, ch.user.id);
  check('a skill not checkable in the app (games) is logged on the learner\'s word, which only times the next test', r.json.at_target === true && /own word/.test(r.json.note), r.json);
  r = await app.post(`/api/skills/practice/${ch.enrollment.id}/CH9:tasks/log`, { at_target: true }, ch.user.id);
  check("a skill outside today's plan is refused", r.status === 404);

  // ── youth weekly load caps and rest days (evidence article 04 P7, SKILL_LOAD_CAPS) ──
  const dose = require('../services/skill-dose');
  const capOf = (age) => { const c = dose.capFor(age); return c ? `${c.hours}/${c.rest}` : 'none'; };
  check('the caps by age: 3 h and 2 rest days (7-8, and younger), 5/2 (9-11), 10/1 (12-14), 14/1 (high school), none for adults',
    capOf(5) === '3/2' && capOf(8) === '3/2' && capOf(9) === '5/2' && capOf(11) === '5/2' && capOf(12) === '10/1' && capOf(14) === '10/1' && capOf(17) === '14/1' && capOf(19) === 'none' && capOf(null) === 'none');
  at(Date.UTC(2026, 9, 20, 9));
  check('the age is the youngest the month and year of birth allow', dose.ageOf({ age_check: { birth_ym: '2017-10' } }, now()) === 8 && dose.ageOf({ age_check: { birth_ym: '2017-09' } }, now()) === 9 && dose.ageOf({}, now()) === null);
  const kid = learner('basketball', 'basketball_mini_starter');
  const adult0 = learner('basketball', 'basketball_mini_starter');
  for (let d = 1; d <= 6; d++) dose.logLoad(adult0.user.id, 'basketball', 60, now() - d * DAY);
  db.update('users', kid.user.id, { age_check: { birth_ym: '2017-01' } }); // 9: 5 h a week, 2 rest days
  for (let d = 1; d <= 5; d++) dose.logLoad(kid.user.id, 'basketball', 20, now() - d * DAY);
  const kload = dose.loadFor(kid.user.id, 'basketball', now());
  check('five active days in the last six: today is a rest day (2 rest days a week for 9-11)', kload && kload.rest_day && kload.used_minutes === 100 && kload.band === 'ages 9-11', kload);
  const kbase = `/api/skills/practice/${kid.enrollment.id}`;
  r = await app.get(kbase, kid.user.id);
  const kp = r.json.practice;
  const isCourt = (id) => !/decisions|rules|safety/.test(id);
  check('...the plan has no court sets or court sittings, only screen work, and says why', kp.practice.every((x) => !isCourt(x.metric)) && kp.sittings.every((s) => !isCourt(s.metric)) && kp.load.rest_day && /Rest day/.test(kp.why[0]) && !kp.problems.length, { practice: kp.practice.map((x) => x.metric), why: kp.why, problems: kp.problems });
  r = await app.post(`${kbase}/${lay}/log`, { left: { makes: 9, attempts: 10 }, right: { makes: 10, attempts: 10 } }, kid.user.id);
  check('...a court set is refused on a rest day', r.status === 404 || (r.status === 409 && /Rest day/.test(r.json.error)), r);
  check('...and the stage check refuses a court count on a rest day', !checksApplied || require('../services/skill-checks').count(kid.user.id, kid.enrollment, lay, { left: { makes: 9, attempts: 10 }, right: { makes: 10, attempts: 10 } }, now()).status === 409);
  if (checksApplied) {
    // Bug fix 2026-10-25: the stage-check page opened the "Log it" form on a rest day and only refused after "Record it".
    const ov = require('../services/skill-checks').overview(kid.user.id, kid.enrollment, now());
    const courtCounts = ov.checks.filter((c) => c.wired && c.how === 'count' && isCourt(c.id));
    check('...the stage-check page knows before any form: a rest-day note, and every court count marked blocked', ov.load && ov.load.rest_day && /Rest day/.test(ov.load.note) && courtCounts.length > 0 && courtCounts.every((c) => c.court_block && c.court_block.rest_day && /Rest day/.test(c.court_block.note)), { load: ov.load, counts: courtCounts.map((c) => [c.id, c.court_block]) });
    check('...a blocked court count is not "ready now", and screen checks are not blocked', courtCounts.every((c) => !c.due && !ov.due.includes(c.id)) && ov.checks.filter((c) => !isCourt(c.id)).every((c) => !c.court_block), ov.due);
    const ovAdult = require('../services/skill-checks').overview(adult0.user.id, adult0.enrollment, now());
    check('...no cap (no age answer): nothing blocked, no note', !ovAdult.load && ovAdult.checks.every((c) => !c.court_block));
  }
  const teen = learner('basketball', 'basketball_mini_starter');
  db.update('users', teen.user.id, { age_check: { birth_ym: '2017-01' } });
  for (const d of [1, 2, 3]) dose.logLoad(teen.user.id, 'basketball', 92, now() - d * DAY); // 276 of 300 minutes: 24 left
  r = await app.get(`/api/skills/practice/${teen.enrollment.id}`, teen.user.id);
  const tp = r.json.practice;
  const courtMin = tp.practice.filter((x) => isCourt(x.metric)).reduce((a, x) => a + x.sets, 0) * sa.knobs().SET_MIN + tp.sittings.filter((s) => isCourt(s.metric)).length * sa.knobs().SIT_MIN;
  check('24 minutes left this week: today\'s court sets fit in them (6 sets of 4 minutes at most)', tp.load && tp.load.week_left === 24 && courtMin > 0 && courtMin <= 24, { load: tp.load, courtMin });
  dose.logLoad(teen.user.id, 'basketball', 24, now());
  r = await app.post(`/api/skills/practice/${teen.enrollment.id}/${lay}/log`, { left: { makes: 9, attempts: 10 }, right: { makes: 10, attempts: 10 } }, teen.user.id);
  check('...once the 5 hours are used, the next court set is refused', r.status === 409 && /used up/.test(r.json.error), r);
  const adult = learner('basketball', 'basketball_mini_starter');
  for (let d = 1; d <= 6; d++) dose.logLoad(adult.user.id, 'basketball', 120, now() - d * DAY);
  check('no age answer (or an adult): no cap', dose.loadFor(adult.user.id, 'basketball', now()) === null);
  process.env.SKILL_LOAD_CAPS = 'off';
  check('SKILL_LOAD_CAPS=off lifts the caps', dose.loadFor(kid.user.id, 'basketball', now()) === null);
  delete process.env.SKILL_LOAD_CAPS;
  check('only basketball is capped (the guidelines are basketball\'s)', dose.loadFor(kid.user.id, 'piano', now()) === null);
  const trial = { sittings: [{ metric: 'a' }], practice: [{ metric: 'a', sets: 3, kind: 'practice' }, { metric: 'b', sets: 2, kind: 'overlearn' }, { metric: 's', sets: 4, kind: 'practice' }] };
  dose.trimToLoad(trial, 12, (id) => id !== 's');
  check('trimming cuts spare sets first, keeps one set per unproven skill as long as it can, and never touches screen sets', trial.practice.find((x) => x.metric === 's').sets === 4 && trial.practice.find((x) => x.metric === 'a').sets >= 1 && !trial.practice.some((x) => x.metric === 'b'), trial);

  app.close();
  F.done();
})().catch((err) => { console.error(err); process.exit(1); });
