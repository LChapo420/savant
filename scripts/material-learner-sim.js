/**
 * Simulated learners on a built own-material course, through the app's own study code (services/material-study.js and
 * services/material-path.js, unmodified), against a fixed linear walk through the same material.
 *
 *   node scripts/material-learner-sim.js --course <x.course.json> [--seeds 20] [--days 30] [--steps 40] [--out <file>]
 *
 * A throwaway db (DB_FILE in the temp folder); the course is served from the file, so nothing touches a real db.
 *
 * The simulated learner (the "truth" the app never sees):
 *   knows a skill or not; answers right with 1 - slip if it knows it (a little less at higher tiers), by guessing if not
 *   (one over the choices; 3% typed); forgets on a half-life (each successful recall makes it last longer); learns from a
 *   lesson (50% if its prerequisites are known, else 15%), from a practice question with feedback (25%) and from
 *   remediation after a failed check or review (30% per missed skill).
 * Profiles: novice (knows nothing), first_half (knows the first half of the levels), scattered (knows a random 70%, gaps
 *   anywhere), careless (knows 80% but slips 20% of the time), fast_forgetter (knows the first third; half-life 2 days).
 * Each simulated day the learner does up to --steps steps (a lesson opened or a question answered) following the app's
 * one recommended next step; then the clock moves a day. The linear walk reads every lesson in order, answers its 3
 * practice questions, takes a 5-question check (75%), repeats lesson + practice + check until it passes, and reviews each
 * skill on a fixed 1, 3, 7, 14, 30-day ladder (2 questions; 0 of 2 sends it back through the lesson and check).
 * Reported per profile (mean over seeds): steps until every skill is mastered, the share of skills the learner truly
 * knows at that moment and at the last day, placement numbers, tier moves, remediations and reviews.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), `material-learner-sim-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
const db = require('../config/db');
const courses = require('../services/course-builder');
const study = require('../services/material-study');
const { rng } = require('../services/material-path');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DAY = 86400000;
const T0 = Date.parse('2026-11-02T15:00:00Z');

const course = JSON.parse(fs.readFileSync(arg('course'), 'utf8'));
course.status = 'ready';
courses.get = () => course; // serve the file's course to every simulated learner (read-only)
const SKILLS = course.skills;
const N = SKILLS.length;
const idx = new Map(SKILLS.map((s, i) => [s.id, i]));
const qById = new Map(SKILLS.flatMap((s) => s.questions.map((q) => [q.id, { q, s }])));

const PROFILES = {
  novice: { known: () => false, slip: 0.05, h0: 12 },
  first_half: { known: (i) => i < Math.floor(N / 2), slip: 0.05, h0: 12 },
  scattered: { known: (i, r) => r() < 0.7, slip: 0.05, h0: 12 },
  careless: { known: (i) => i < Math.ceil(N * 0.8), slip: 0.2, h0: 12 },
  fast_forgetter: { known: (i) => i < Math.floor(N / 3), slip: 0.05, h0: 2 },
};

class Learner {
  constructor(profile, seed) {
    this.p = PROFILES[profile];
    this.r = rng(seed);
    this.known = SKILLS.map((_, i) => !!this.p.known(i, this.r));
    this.initial = this.known.slice();
    this.h = SKILLS.map(() => this.p.h0 * (this.p === PROFILES.fast_forgetter ? 1 : 1.5));
    this.last = SKILLS.map(() => T0);
  }
  decay(i, now) {
    if (this.known[i] && this.r() > 2 ** (-(now - this.last[i]) / DAY / this.h[i])) this.known[i] = false;
  }
  learnt(i, now) { this.known[i] = true; this.last[i] = now; this.h[i] = this.p.h0; }
  prereqsKnown(i) { return SKILLS[i].prerequisites.every((p) => this.known[idx.get(p)]); }
  answer(qid, now) {
    const { q, s } = qById.get(qid);
    const i = idx.get(s.id);
    this.decay(i, now);
    let right;
    if (this.known[i]) right = this.r() >= this.p.slip + 0.03 * ((q.tier || 2) - 1);
    else right = q.type === 'multiple_choice' ? this.r() < 1 / q.choices.length : this.r() < 0.03;
    if (this.known[i] && right) { this.h[i] *= this.p === PROFILES.fast_forgetter ? 1.4 : 1.8; this.last[i] = now; }
    if (q.type === 'multiple_choice') {
      if (right) return q.answer_index;
      const wrong = q.choices.map((_, k) => k).filter((k) => k !== q.answer_index);
      return wrong[Math.floor(this.r() * wrong.length)];
    }
    return right ? q.answer : 'no idea';
  }
  feedback(i, now, p) { if (!this.known[i] && this.r() < p) this.learnt(i, now); }
  lesson(i, now) { this.decay(i, now); if (!this.known[i] && this.r() < (this.prereqsKnown(i) ? 0.5 : 0.15)) this.learnt(i, now); }
  share(now) { SKILLS.forEach((_, i) => this.decay(i, now)); return this.known.filter(Boolean).length / N; }
}

/** The app's path: follow study.state().next each day. */
function runAdaptive(profile, seed, days, perDay) {
  const L = new Learner(profile, seed);
  const user = db.insert('users', { email: `sim-${profile}-${seed}@test.invalid`, role: 'learner' });
  const mid = 1000 + seed;
  const rnd = rng(seed * 31 + 7);
  const out = { steps: 0, steps_to_mastery: null, day_mastered: null, true_at_mastery: null, placement_q: 0, skipped: 0, skipped_truly_known: 0, unknown_studied: 0, studied: [], tier_ups: 0, tier_downs: 0, remediations: 0, misconception_shown: 0, reviews: 0, review_steps: 0, intervals: [], interleaved: 0 };
  const initiallyUnknown = new Set(SKILLS.filter((_, i) => !L.initial[i]).map((s) => s.id));
  for (let d = 0; d < days; d++) {
    const now = T0 + d * DAY;
    let used = 0;
    while (used < perDay) {
      const st = study.state(user.id, mid, now);
      const n = st.next;
      if (out.steps_to_mastery === null && st.mastered === N) {
        out.steps_to_mastery = out.steps; out.day_mastered = d; out.true_at_mastery = L.share(now);
      }
      if (n.kind === 'done' || n.kind === 'wait') break;
      if (n.kind === 'placement') {
        let pl = study.placementNext(user.id, mid, { now, random: rnd });
        while (!pl.done) { pl = study.placementAnswer(user.id, mid, pl.question.id, L.answer(pl.question.id, now), { now, random: rnd }); out.steps++; used++; out.placement_q++; }
        out.skipped = pl.known.length;
        out.skipped_truly_known = pl.known.filter((k) => L.initial[idx.get(k.id)]).length;
      } else if (n.kind === 'lesson') {
        const les = study.lesson(user.id, mid, n.skill, { random: rnd });
        const i = idx.get(n.skill);
        out.steps++; used++;
        if (!out.studied.includes(n.skill)) { out.studied.push(n.skill); if (initiallyUnknown.has(n.skill)) out.unknown_studied++; }
        if (les.skill.remediation) { out.remediations++; if (les.skill.remediation.misconceptions.length) out.misconception_shown++; }
        L.lesson(i, now);
        for (const q of les.skill.practice) { study.practice(user.id, mid, n.skill, q.id, L.answer(q.id, now)); L.feedback(i, now, 0.25); out.steps++; used++; }
      } else {
        const quiz = study.startQuiz(user.id, mid, n.kind === 'review' ? 'review' : 'mastery', n.skill, { now, random: rnd });
        const answers = {};
        for (const q of quiz.questions) answers[q.id] = L.answer(q.id, now);
        const res = study.submit(user.id, mid, quiz.quiz_id, answers, { now });
        out.steps += quiz.questions.length; used += quiz.questions.length;
        if (n.kind === 'review') { out.reviews++; out.review_steps += quiz.questions.length; }
        out.interleaved += res.results.filter((x) => x.interleaved).length;
        for (const k of res.report) {
          if (k.passed === false) L.feedback(idx.get(k.skill), now, 0.3);
          if (k.next_in_days) out.intervals.push(k.next_in_days);
          if (n.kind === 'mastery' && k.tier != null) { if (k.score >= 1 && k.tier > (quiz.tier || 1)) out.tier_ups++; if (k.score < 0.75 && k.tier < (quiz.tier || 1)) out.tier_downs++; }
        }
      }
    }
  }
  out.true_at_end = L.share(T0 + (days - 1) * DAY);
  out.forget_m = db.findOne('material_progress', (r) => r.user_id === user.id).forget_m;
  out.initially_unknown = initiallyUnknown.size;
  out.initially_known = N - initiallyUnknown.size;
  return out;
}

/** The fixed linear walk through the same material, same learner model, same day budget. */
function runLinear(profile, seed, days, perDay) {
  const L = new Learner(profile, seed);
  const rnd = rng(seed * 31 + 7);
  const LADDER = [1, 3, 7, 14, 30];
  const st = SKILLS.map(() => ({ mastered: false, step: 0, due: null }));
  const out = { steps: 0, steps_to_mastery: null, day_mastered: null, true_at_mastery: null, reviews: 0 };
  const pick = (s, n) => s.questions.map((q) => ({ q, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, n).map((x) => x.q);
  const grade = (q, a) => (q.type === 'multiple_choice' ? a === q.answer_index : a === q.answer);
  let cursor = 0;
  for (let d = 0; d < days; d++) {
    const now = T0 + d * DAY;
    let used = 0;
    // reviews first, on the fixed ladder
    for (let i = 0; i < N && used < perDay; i++) {
      if (!st[i].mastered || !st[i].due || st[i].due > now) continue;
      const qs = pick(SKILLS[i], 2);
      const right = qs.filter((q) => grade(q, L.answer(q.id, now))).length;
      out.steps += qs.length; used += qs.length; out.reviews++;
      if (right === 0) { st[i].mastered = false; st[i].due = null; cursor = Math.min(cursor, i); L.feedback(i, now, 0.3); } else { st[i].step = Math.min(st[i].step + 1, LADDER.length - 1); st[i].due = now + LADDER[st[i].step] * DAY; }
    }
    while (used < perDay) {
      while (cursor < N && st[cursor].mastered) cursor++;
      if (cursor >= N) {
        if (out.steps_to_mastery === null) { out.steps_to_mastery = out.steps; out.day_mastered = d; out.true_at_mastery = L.share(now); }
        break;
      }
      const s = SKILLS[cursor];
      L.lesson(cursor, now); out.steps++; used++;
      for (const q of pick(s, 3)) { L.answer(q.id, now); L.feedback(cursor, now, 0.25); out.steps++; used++; }
      const qs = pick(s, 5);
      const right = qs.filter((q) => grade(q, L.answer(q.id, now))).length;
      out.steps += qs.length; used += qs.length;
      if (right / qs.length >= 0.75) { st[cursor].mastered = true; st[cursor].step = 0; st[cursor].due = now + LADDER[0] * DAY; } else L.feedback(cursor, now, 0.3);
    }
  }
  out.true_at_end = L.share(T0 + (days - 1) * DAY);
  return out;
}

const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100);

const seeds = Number(arg('seeds', 20));
const days = Number(arg('days', 30));
const perDay = Number(arg('steps', 40));
const report = { course: course.title, skills: N, questions: SKILLS.reduce((n, s) => n + s.questions.length, 0), seeds, days, steps_per_day: perDay, profiles: {} };
const pathsByProfile = {};
for (const profile of Object.keys(PROFILES)) {
  const a = []; const l = [];
  for (let s = 1; s <= seeds; s++) { a.push(runAdaptive(profile, s, days, perDay)); l.push(runLinear(profile, s, days, perDay)); }
  pathsByProfile[profile] = a.map((x) => x.studied);
  const fin = (xs) => xs.filter((x) => x.steps_to_mastery !== null).length;
  report.profiles[profile] = {
    adaptive: {
      reached_mastery: `${fin(a)}/${seeds}`, steps_to_mastery: r2(mean(a.map((x) => x.steps_to_mastery))), day_mastered: r2(mean(a.map((x) => x.day_mastered))),
      true_known_at_mastery: r2(mean(a.map((x) => x.true_at_mastery))), true_known_at_end: r2(mean(a.map((x) => x.true_at_end))),
      placement_questions: r2(mean(a.map((x) => x.placement_q))), skipped_by_placement: r2(mean(a.map((x) => x.skipped))),
      skipped_truly_known_share: r2(mean(a.filter((x) => x.skipped).map((x) => x.skipped_truly_known / x.skipped))),
      initially_known: r2(mean(a.map((x) => x.initially_known))),
      lessons_opened: r2(mean(a.map((x) => x.studied.length))), lessons_on_initially_unknown_share: r2(mean(a.filter((x) => x.studied.length).map((x) => x.unknown_studied / x.studied.length))),
      initially_unknown_covered_share: r2(mean(a.filter((x) => x.initially_unknown).map((x) => x.unknown_studied / x.initially_unknown))),
      tier_ups: r2(mean(a.map((x) => x.tier_ups))), tier_downs: r2(mean(a.map((x) => x.tier_downs))), remediations: r2(mean(a.map((x) => x.remediations))),
      remediations_naming_a_misconception: r2(mean(a.map((x) => x.misconception_shown))), interleaved_questions: r2(mean(a.map((x) => x.interleaved))),
      reviews: r2(mean(a.map((x) => x.reviews))), review_steps: r2(mean(a.map((x) => x.review_steps))), mean_interval_days: r2(mean(a.flatMap((x) => x.intervals))),
      forget_multiplier: r2(mean(a.map((x) => x.forget_m))), total_steps: r2(mean(a.map((x) => x.steps))),
    },
    linear: {
      reached_mastery: `${fin(l)}/${seeds}`, steps_to_mastery: r2(mean(l.map((x) => x.steps_to_mastery))), day_mastered: r2(mean(l.map((x) => x.day_mastered))),
      true_known_at_mastery: r2(mean(l.map((x) => x.true_at_mastery))), true_known_at_end: r2(mean(l.map((x) => x.true_at_end))), reviews: r2(mean(l.map((x) => x.reviews))), total_steps: r2(mean(l.map((x) => x.steps))),
    },
    paired: {
      adaptive_fewer_steps: `${a.filter((x, i) => x.steps_to_mastery !== null && (l[i].steps_to_mastery === null || x.steps_to_mastery < l[i].steps_to_mastery)).length}/${seeds}`,
      step_ratio: r2(mean(a.map((x, i) => (x.steps_to_mastery !== null && l[i].steps_to_mastery ? x.steps_to_mastery / l[i].steps_to_mastery : null)))),
    },
  };
}
// How different the paths are: the share of lessons two profiles' learners (same seed) do not share.
const names = Object.keys(PROFILES);
report.path_difference = {};
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const d = pathsByProfile[names[i]].map((p, k) => {
      const A = new Set(p); const B = new Set(pathsByProfile[names[j]][k]);
      const uni = new Set([...A, ...B]).size;
      return uni ? 1 - [...A].filter((x) => B.has(x)).length / uni : 0;
    });
    report.path_difference[`${names[i]} vs ${names[j]}`] = r2(mean(d));
  }
}
const outFile = arg('out');
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
process.exit(0);
