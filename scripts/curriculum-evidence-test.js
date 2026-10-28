/**
 * Tests for the curriculum evidence proposals built on 2026-10-25
 * (curriculum-build/evidence-article/01-curriculum-levels-placement.md P1, P3, P6;
 * 02-retention-review.md P4):
 *
 *   P1  INTERLEAVE_SESSIONS   the practice body interleaved, review first
 *   P3  CHECKPOINT_SPRT       checkpoints decided by a likelihood ratio
 *       CHALLENGE_SPRT        the Challenge Exam's bands decided the same way
 *   P4  CURVE_REVIEWS         lesson reviews from adaptation.reviewQueue
 *   P6  PLACEMENT_SKILL_BELIEF placement gaps and strengths on a belief
 *
 *   node scripts/curriculum-evidence-test.js
 *
 * Its own throwaway copy of the data file, every model key blanked: no model
 * call, no network. (P10 is in block-levels-test.js and key-gate-test.js, P5 in
 * coverage-test.js, P11 in objective-items-test.js.)
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|_TOKEN$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
for (const k of ['INTERLEAVE_SESSIONS', 'CHECKPOINT_SPRT', 'CHALLENGE_SPRT', 'CURVE_REVIEWS', 'PLACEMENT_SKILL_BELIEF', 'OWNER_BASE', 'ADAPT_OWNER', 'OWNER_EMAIL']) delete process.env[k];
const tmp = path.join(os.tmpdir(), `curriculum-evidence-test-${process.pid}.json`);
fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), tmp);
process.env.DB_FILE = tmp;
const db = require('../config/db');
process.on('exit', () => { try { fs.unlinkSync(tmp); } catch { /* gone */ } });

const curriculum = require('../config/curriculum');
const sessions = require('../services/sessions');
const placement = require('../services/placement');
const adaptation = require('../services/adaptation');

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
function C(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
function atLeast(n, k, p) { let s = 0; for (let j = k; j <= n; j++) s += C(n, j) * p ** j * (1 - p) ** (n - j); return s; }
let seq = 0;
function user(email) { seq++; return db.insert('users', { email: email || `cev-${process.pid}-${seq}@example.test`, display_name: 'x', password_hash: 'x', xp: 0 }); }
function enroll(u, trackId, gradeId, level) {
  return db.insert('enrollments', { user_id: u.id, track_id: trackId, grade_id: gradeId, target_level: curriculum.getGrade(trackId, gradeId).pathLength, current_level: level, level_items: 0, levels_completed: 0, xp: 0, status: 'active', pending_checkpoint: null, checkpoint_attempts: 0 });
}

(async () => {
  console.log('P3: checkpoints, by likelihood ratio (CHECKPOINT_SPRT)');
  {
    check('on by default, off for the owner (base) and with CHECKPOINT_SPRT=off', curriculum.checkpointSprtOn() && !curriculum.checkpointSprtOn({ base: true })
      && ((process.env.CHECKPOINT_SPRT = 'off'), !curriculum.checkpointSprtOn()));
    delete process.env.CHECKPOINT_SPRT;
    const need = { master: curriculum.neededToPass('master', 15), grand: curriculum.neededToPass('grand', 25), graduation: curriculum.neededToPass('graduation', 40) };
    check('needed at full length: Master 12/15, Grand 19/25 (as before), Final 34/40 (was 36)', need.master === 12 && need.grand === 19 && need.graduation === 34, need);
    const final = (p) => atLeast(40, need.graduation, p);
    check('the Final passes a true-90% learner about 90% of the time (was 63%)', final(0.9) > 0.89 && final(0.9) < 0.91 && atLeast(40, 36, 0.9) < 0.64, { now: final(0.9), was: atLeast(40, 36, 0.9) });
    check('and a 70% learner under 3%, a 75% learner under 10%', final(0.7) < 0.03 && final(0.75) < 0.1, { p70: final(0.7), p75: final(0.75) });
    check('a Master passes a 90% learner 94% of the time, a 65% one 17%', atLeast(15, 12, 0.9) > 0.94 && atLeast(15, 12, 0.65) < 0.18);
    const d = (kind, correct, answered, planned, skipped = 0) => curriculum.passDecision(kind, { correct, answered, planned, skipped });
    check('at full length the decision is "correct >= needed"', d('graduation', 34, 40, 40).passed && !d('graduation', 33, 40, 40).passed
      && d('master', 12, 15, 15).passed && !d('master', 11, 15, 15).passed);
    check('an exam ended after 3 of 3 right no longer passes (too few)', !d('master', 3, 3, 15).passed && d('master', 3, 3, 15).decided === 'too_few');
    check('ended early on decisive evidence still passes (11 straight on a Master)', d('master', 11, 11, 15).passed && d('master', 11, 11, 15).decided === 'clear');
    check('ended early after clear failure fails', !d('master', 1, 5, 15).passed && d('master', 1, 5, 15).decided === 'clear');
    check('a skipped question leaves the quiz complete', d('master', 12, 14, 15, 1).decided !== 'too_few' && d('master', 12, 14, 15, 1).passed);
    check('what the learner is told is needed is the decision\'s share', Math.abs(d('graduation', 30, 40, 40).required - 34 / 40) < 1e-12);
  }

  console.log('P3: the Challenge Exam (CHALLENGE_SPRT)');
  {
    const arith = curriculum.getGrade('math', 'sense_of_quantity');
    const bands = curriculum.skipExamBands(92, arith.pathLength);
    check('a gate of 16, then four bands of 6 (40 in all)', bands.map((b) => b.count).join() === '16,6,6,6,6' && curriculum.skipExamLength(92, arith.pathLength) === 40, bands.map((b) => b.count));
    check('the owner keeps five bands of seven', curriculum.skipExamBands(92, arith.pathLength, { rule: curriculum.skipRule({ base: true }) }).every((b) => b.count === 7));
    check('the gate needs 14 of 16, a band above it 5 of 6', bands[0].needed === 14 && bands[1].needed === 5, bands.map((b) => b.needed));
    check('gate: a 90% learner holds it 79% of the time (was 48%), a 70% learner 10% (was 8%)',
      Math.abs(atLeast(16, 14, 0.9) - 0.789) < 0.001 && atLeast(16, 14, 0.7) < 0.1 && Math.abs(atLeast(7, 7, 0.9) - 0.478) < 0.001, { p90: atLeast(16, 14, 0.9), p70: atLeast(16, 14, 0.7) });
    const v = (rows) => curriculum.skipVerdicts(rows.map(([correct, total], i) => ({ index: i, level: 100 + 10 * i, correct, total })));
    check('all held: skip to the top band', v([[16, 16], [6, 6], [6, 6], [6, 6], [6, 6]]).target === 140);
    check('one miss in a band above the gate is allowed', v([[15, 16], [5, 6], [6, 6], [6, 6], [6, 6]]).target === 140);
    check('two misses in band four land on band four', v([[16, 16], [6, 6], [6, 6], [4, 6], [6, 6]]).target === 130);
    check('13 of 16 at the gate skips nothing', v([[13, 16], [6, 6], [6, 6], [6, 6], [6, 6]]).target === null);
    check('the gate at 14 of 16 with one miss in every band above it still skips to the top', v([[14, 16], [5, 6], [5, 6], [5, 6], [5, 6]]).target === 140);
    check('two misses in band two land on band two, whatever came after', v([[16, 16], [4, 6], [6, 6], [6, 6], [6, 6]]).target === 110);
    check('a band that breaks stops the run: nothing above it is held', v([[16, 16], [6, 6], [4, 6], [6, 6], [6, 6]]).held.join() === 'true,true,false,false,false');
    check('the "perfect" rule is unchanged when asked for', curriculum.skipTargetFromBands([{ level: 100, total: 7, correct: 7 }, { level: 110, total: 7, correct: 6 }]) === 110);
    // An exam sat end to end: the rule is kept on the session and scored by it.
    const u = user();
    const e = enroll(u, 'math', 'sense_of_quantity', 92);
    const built = await sessions.createSkipExamSession({ userId: u.id, enrollment: e, grade: arith });
    check('the exam is built with the rule it will be scored by', built.session.pass_rule === 'sprt' && built.items.length === 40, { rule: built.session.pass_rule, n: built.items.length });
    let missedInGate = 0;
    for (const item of built.items) {
      const wrong = item.band === 0 && missedInGate < 2;
      if (wrong) missedInGate++;
      // eslint-disable-next-line no-await-in-loop
      await sessions.answer({ userId: u.id, session: built.session, itemId: item.id, userAnswer: wrong ? 'not this one' : db.byId('items', item.id).answer, ms: 4000 });
    }
    const score = sessions.scoreSkipExam(built.session.id);
    check('two misses in the gate (14 of 16) still skip to the top', score.target_level === 140 && score.bands[0].held && score.bands[0].needed === 14, { target: score.target_level, bands: score.bands.map((b) => [b.correct, b.total, b.held]) });
    process.env.CHALLENGE_SPRT = 'off';
    const u2 = user();
    const e2 = enroll(u2, 'math', 'sense_of_quantity', 92);
    const old = await sessions.createSkipExamSession({ userId: u2.id, enrollment: e2, grade: arith });
    check('CHALLENGE_SPRT=off: five bands of seven, scored "perfect"', old.session.pass_rule === 'perfect' && old.items.length === 35);
    delete process.env.CHALLENGE_SPRT;
  }

  console.log('P3: a checkpoint resolved by the decision');
  {
    const g = curriculum.getGrade('math', 'sense_of_quantity');
    let master = null;
    for (let l = 2; l < g.pathLength; l++) if (curriculum.levelKind(l, g.pathLength, g) === 'master') { master = l; break; }
    const sit = async (u, correctCount, total) => {
      const e = enroll(u, 'math', 'sense_of_quantity', master);
      const session = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, track_id: 'math', grade_id: 'sense_of_quantity', kind: 'master', level: master, blocks: [{ index: 0, level: master, kind: 'master', resolved: false }], started_at: new Date().toISOString() });
      for (let i = 0; i < 15; i++) {
        db.insert('items', { session_id: session.id, user_id: u.id, role: 'exam', level: master, block: 0, index: i, skill_id: g.skills[0], difficulty: 3, format: 'type_in', prompt: `q${i}`, answer: 'a',
          correct: i < total ? i < correctCount : null, user_answer: i < total ? 'x' : null, ms: i < total ? 5000 : null });
      }
      const accuracy = total ? correctCount / total : 0;
      return sessions.resolveCheckpoint({ userId: u.id, session: db.byId('sessions', session.id), enrollment: db.byId('enrollments', e.id), grade: g, accuracy });
    };
    const early = await sit(user(), 3, 3);
    check('ending a Master quiz at 3 of 3 does not pass it (it used to)', early && !early.passed && early.decided_by === 'too_few', early && { passed: early.passed, by: early.decided_by });
    const full = await sit(user(), 12, 15);
    check('12 of 15 passes, told 80% was needed', full.passed && Math.abs(full.required - 0.8) < 1e-12 && full.decided_by === 'at_length', { passed: full.passed, required: full.required });
    const owner = user('the.landon.d@gmail.com');
    const ownerEarly = await sit(owner, 3, 3);
    check('the owner keeps the old rule (3 of 3 passes, 75% needed)', ownerEarly.passed && ownerEarly.required === 0.75);
  }

  console.log('P1: the practice body, interleaved (INTERLEAVE_SESSIONS)');
  {
    const g = curriculum.getGrade('math', 'algebra_2_part_a') || curriculum.getGrade('math', 'sense_of_quantity');
    const trackGrade = g.id || 'algebra_2_part_a';
    let lesson = null;
    for (let l = 30; l < g.pathLength - 4; l++) {
      if (curriculum.levelKind(l, g.pathLength, g) === 'lesson' && [1, 2, 3].every((n) => curriculum.levelKind(l + n, g.pathLength, g) === 'practice')) { lesson = l; break; }
    }
    check('found a lesson followed by three practice levels', lesson !== null, lesson);
    const u = user();
    const params = { itemCount: 12, stretchShare: 0.15, supportShare: 0.2, preferTypeIn: false };
    const planAt = (uid, n, trackId = 'math', gradeId = trackGrade, grade = g) => {
      const e = enroll({ id: uid }, trackId, gradeId, lesson + n);
      return { mode: sessions.interleaveMode(uid, e, grade), plan: sessions.planLesson(uid, e, grade, params) };
    };
    const first = planAt(u.id, 1);
    check('the first practice level after a lesson stays blocked', first.mode && first.mode.since === 1
      && first.plan.map((e) => e.role).join() === [...first.plan.map((e) => e.role)].sort((a, b) => ['review', 'support', 'focus', 'stretch'].indexOf(a) - ['review', 'support', 'focus', 'stretch'].indexOf(b)).join(), first.plan.map((e) => e.role));
    const third = planAt(u.id, 3);
    const skills = third.plan.filter((e) => e.role !== 'review').map((e) => e.skillId);
    const runs = skills.reduce((m, s, i) => (i && s === skills[i - 1] ? m : m + 1), 0);
    const focus = curriculum.levelPlan(g, lesson + 3).focus;
    const earlier = third.plan.filter((e) => e.role === 'focus' && e.skillId !== focus).length;
    const focusCount = third.plan.filter((e) => e.role === 'focus').length;
    check('from the third, one focus item in two is on an earlier topic', curriculum.levelPlan(g, lesson + 3).introduced.length < 2 || earlier === Math.floor(focusCount / 2), { earlier, focusCount });
    check('and the body is spread across skills, not in runs', curriculum.levelPlan(g, lesson + 3).introduced.length < 2 || runs >= Math.min(skills.length, 2 * new Set(skills).size - 1), skills);
    check('review still comes first', third.plan.findIndex((e) => e.role !== 'review') >= third.plan.filter((e) => e.role === 'review').length);
    const spread = sessions.spreadBySkill([{ skillId: 'a', n: 1 }, { skillId: 'a', n: 2 }, { skillId: 'a', n: 3 }, { skillId: 'a', n: 4 }, { skillId: 'b', n: 5 }, { skillId: 'b', n: 6 }]);
    check('spreadBySkill weaves evenly and keeps each skill\'s order', spread.map((x) => x.skillId).join('') === 'abaaba' && spread.filter((x) => x.skillId === 'a').map((x) => x.n).join() === '1,2,3,4', spread.map((x) => `${x.skillId}${x.n}`));
    // A brand-new focus topic: the earlier skills have some mastery, the focus
    // none, so the focus is also the weakest skill. The earlier topic must still
    // be an earlier topic (it used to be weak[0], the focus itself).
    {
      // A lesson that brings in a new topic (the last introduced skill) with
      // earlier skills before it, followed by three practice levels on it.
      let nl = null;
      for (let l = 2; l < g.pathLength - 4 && nl === null; l++) {
        if (curriculum.levelKind(l, g.pathLength, g) !== 'lesson' || ![1, 2, 3].every((n) => curriculum.levelKind(l + n, g.pathLength, g) === 'practice')) continue;
        const p3 = curriculum.levelPlan(g, l + 3);
        if (p3.introduced.length >= 3 && p3.focus === p3.introduced[p3.introduced.length - 1] && curriculum.levelPlan(g, l + 2).focus === p3.focus) nl = l;
      }
      check('found a lesson on a new topic with earlier topics before it', nl !== null);
      const planAt = (uid, n) => sessions.planLesson(uid, enroll({ id: uid }, 'math', trackGrade, nl + n), g, params);
      const fresh = user();
      const lp2 = curriculum.levelPlan(g, nl + 2);
      const lp3 = curriculum.levelPlan(g, nl + 3);
      const priors = lp3.introduced.filter((s) => s !== lp3.focus);
      check('the interleave mode counts the levels since that lesson', sessions.interleaveMode(fresh.id, { track_id: 'math', grade_id: trackGrade, current_level: nl + 3 }, g).since === 3);
      const future = new Date(Date.now() + 30 * 86400000).toISOString();
      priors.forEach((s, k) => db.insert('skill_states', { user_id: fresh.id, skill_id: s, mastery: k === 1 ? 0.3 : 0.45, attempts: 6, correct: 4, streak: 1, ease: 2.5, error_tags: [], last_seen_at: new Date().toISOString(), next_due_at: future }));
      const count = (p, focusId) => ({ alt: p.filter((e) => e.role === 'focus' && e.skillId !== focusId).length, n: p.filter((e) => e.role === 'focus').length, skills: p.filter((e) => e.role === 'focus').map((e) => e.skillId) });
      const s2 = count(planAt(fresh.id, 2), lp2.focus);
      const s3p = planAt(fresh.id, 3);
      const s3 = count(s3p, lp3.focus);
      check('a brand-new topic, 2nd practice level: one focus item in three is on an earlier topic', priors.length < 1 || (s2.alt === Math.floor(s2.n / 3) && s2.alt > 0), s2);
      check('a brand-new topic, 3rd practice level: one focus item in two is on an earlier topic', priors.length < 1 || (s3.alt === Math.floor(s3.n / 2) && s3.alt > 0), s3);
      const weakest = priors.length > 1 ? priors[1] : priors[0];
      check('the first earlier topic is the weakest earlier skill, never the focus', priors.length < 1 || s3.skills.find((s) => s !== lp3.focus) === weakest, { want: weakest, skills: s3.skills });
      check('every earlier-topic item is on an introduced skill other than the focus', s3p.filter((e) => e.role === 'focus' && e.skillId !== lp3.focus).every((e) => lp3.introduced.includes(e.skillId)));
      // Nothing weak but the new topic: fall back to the earliest introduced.
      const strong = user();
      priors.forEach((s) => db.insert('skill_states', { user_id: strong.id, skill_id: s, mastery: 0.9, attempts: 9, correct: 9, streak: 5, ease: 2.5, error_tags: [], last_seen_at: new Date().toISOString(), next_due_at: future }));
      const st = count(planAt(strong.id, 3), lp3.focus);
      const earliest = lp3.introduced.find((s) => s !== lp3.focus);
      check('nothing earlier is weak: the earlier topic falls back to the earliest introduced', priors.length < 1 || (st.alt === Math.floor(st.n / 2) && st.skills.find((s) => s !== lp3.focus) === earliest), { earliest, st });
    }
    const owner = db.findOne('users', (x) => x.email === 'the.landon.d@gmail.com') || user('the.landon.d@gmail.com');
    check('the owner is not interleaved', planAt(owner.id, 3).mode === null);
    const es = curriculum.getGrade('spanish', 'entry');
    check('Spanish stays as it was', sessions.interleaveMode(u.id, { track_id: 'spanish', grade_id: 'entry', current_level: 13 }, es) === null);
    process.env.INTERLEAVE_SESSIONS = 'off';
    check('INTERLEAVE_SESSIONS=off: as before', planAt(u.id, 3).mode === null);
    delete process.env.INTERLEAVE_SESSIONS;
  }

  console.log('P4: lesson reviews from the forgetting curve (CURVE_REVIEWS)');
  {
    const realRecord = adaptation.recordFor;
    const realQueue = adaptation.reviewQueue;
    const model = { objectives: [{ id: 'o1', skill: 's1' }, { id: 'o2', skill: 's2' }, { id: 'o3', skill: 's1' }, { id: 'o4', skill: 's1' }, { id: 'o5', skill: 'zz' }] };
    adaptation.recordFor = () => ({ report: { model, states: [] }, curve: null });
    adaptation.reviewQueue = () => [
      { id: 'o1', skill: 's1', reason: 'memory_check' }, { id: 'o5', skill: 'zz', reason: 'fading' }, { id: 'o2', skill: 's2', reason: 'fading' },
      { id: 'o3', skill: 's1', reason: 'durability' }, { id: 'o4', skill: 's1', reason: 'fading' }, { id: 'oX', skill: 's2', reason: 'reteach' },
    ];
    const u = user();
    const got = sessions.curveReviews(u.id, { track_id: 'math', grade_id: 'x' }, ['s1', 's2'], 5);
    check('the queue picks the reviews: introduced skills only, at most two per skill, no re-teaching', got.map((r) => r.objective).join() === 'o1,o2,o3', got);
    check('each carries its objective, so the answer is that objective\'s memory check', got.every((r) => r.objective && r.reason));
    adaptation.reviewQueue = () => [];
    check('an empty queue means nothing is due (not the SM-2 ladder)', Array.isArray(sessions.curveReviews(u.id, { track_id: 'math', grade_id: 'x' }, ['s1'], 3)) && sessions.curveReviews(u.id, { track_id: 'math', grade_id: 'x' }, ['s1'], 3).length === 0);
    adaptation.recordFor = () => null;
    check('no objective model: the SM-2 ladder decides (null)', sessions.curveReviews(u.id, { track_id: 'math', grade_id: 'x' }, ['s1'], 3) === null);
    adaptation.recordFor = () => ({ report: { model, states: [] }, curve: null });
    const owner = db.findOne('users', (x) => x.email === 'the.landon.d@gmail.com');
    check('the owner keeps the SM-2 ladder', sessions.curveReviews(owner.id, { track_id: 'math', grade_id: 'x' }, ['s1'], 3) === null);
    process.env.CURVE_REVIEWS = 'off';
    check('CURVE_REVIEWS=off: the SM-2 ladder', sessions.curveReviews(u.id, { track_id: 'math', grade_id: 'x' }, ['s1'], 3) === null);
    delete process.env.CURVE_REVIEWS;
    adaptation.recordFor = realRecord;
    adaptation.reviewQueue = realQueue;
    // A real lesson plan on a real model: whatever is due, the reviews are tagged.
    const g = curriculum.getGrade('math', 'sense_of_quantity');
    const e = enroll(u, 'math', 'sense_of_quantity', 23);
    const plan = sessions.planLesson(u.id, e, g, { itemCount: 10, stretchShare: 0.1, supportShare: 0.2 });
    check('a plan is still made on a real grade', plan.length >= 5 && plan.every((x) => x.role !== 'review' || x.objective || x.skillId));
  }

  console.log('P6: placement gaps and strengths on a belief (PLACEMENT_SKILL_BELIEF)');
  {
    const g = curriculum.getGrade('math', 'sense_of_quantity');
    const [a, b, c, d] = Object.keys(curriculum.SKILLS).slice(0, 4);
    const u = user();
    const it = (skill, correct, extra = {}) => ({ user_id: u.id, skill_id: skill, correct, difficulty: 3, choices: ['1', '2', '3', '4'], ...extra });
    const items = [it(a, false), it(b, true), it(b, true), it(c, true), it(c, true), it(c, true), it(d, false), it(d, false)];
    const r = placement.score(items, g);
    check('one miss is "unsure", not a gap (it used to be)', r.unsure.includes(a) && !r.gaps.includes(a), r);
    check('two rights are "unsure", not a strength (they used to be)', r.unsure.includes(b) && !r.strengths.includes(b));
    check('three rights are a strength, two misses a gap', r.strengths.includes(c) && r.gaps.includes(d));
    const owner = db.findOne('users', (x) => x.email === 'the.landon.d@gmail.com');
    const ro = placement.score(items.map((x) => ({ ...x, user_id: owner.id })), g);
    check('the owner keeps the percentage rule', !ro.unsure && ro.gaps.includes(a) && ro.strengths.includes(b));
    process.env.PLACEMENT_SKILL_BELIEF = 'off';
    check('PLACEMENT_SKILL_BELIEF=off: the percentage rule', !placement.score(items, g).unsure);
    delete process.env.PLACEMENT_SKILL_BELIEF;
  }

  console.log('a basketball sitting counts toward the weekly load (implementer E\'s SKILL_LOAD_CAPS hook)');
  {
    const track = curriculum.TRACKS.find((t) => t.id === 'basketball');
    const gradeId = track && (track.grades || [])[0] && (track.grades[0].id || track.grades[0]);
    const u = user();
    const e = enroll(u, 'basketball', gradeId, 2);
    const session = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, track_id: 'basketball', grade_id: gradeId, kind: 'practice', level: 2, levels: [2], blocks: [{ index: 0, level: 2, kind: 'practice', resolved: true }], preview: true, started_at: new Date(Date.now() - 25 * 60000).toISOString() });
    await sessions.finish({ userId: u.id, session });
    check('a preview logs no load', !Object.keys(db.byId('enrollments', e.id).skill_load || {}).length);
    const real = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, track_id: 'basketball', grade_id: gradeId, kind: 'practice', level: 2, levels: [2], blocks: [{ index: 0, level: 2, kind: 'practice', resolved: true }], started_at: new Date(Date.now() - 25 * 60000).toISOString() });
    await sessions.finish({ userId: u.id, session: real });
    const load = Object.values(db.byId('enrollments', e.id).skill_load || {}).reduce((a, b) => a + Number(b), 0);
    check('a 25-minute court sitting logs 25 minutes', load === 25, db.byId('enrollments', e.id).skill_load);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall curriculum evidence checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
