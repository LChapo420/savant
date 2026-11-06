/**
 * SIMULATED check of the daily plan (services/daily-plan.js allocate, the real planner on simulated subjects).
 * 14 days of simulated learners: fast, slow, a test date soon, a subject far behind, low minutes (30), high minutes (120).
 * Each follows its plan in order until its minutes run out; the plan's estimates come from what it has seen of the learner's
 * own pace (two studied days in the last seven), else the grade defaults, so the estimate error is part of the result.
 *
 *   node scripts/daily-plan-sim.js            the table
 *   node scripts/daily-plan-sim.js --gate     also exit 1 when a gate below fails
 *   node scripts/daily-plan-sim.js --json     the numbers as JSON
 *
 * These numbers are SIMULATED learners following a rule-based model of time and forgetting. They say the planner keeps its
 * own rules (time used, no subject starved, reviews on time, written-ahead levels first); they are NOT evidence that real
 * learners learn faster. Compared with a baseline of the dashboard as it was (one "Up next" subject for the whole day, no reviews).
 */
const os = require('os');
const path = require('path');

// Pure planner only: no database is read; a throwaway file keeps config/db off the real one.
process.env.DB_FILE = path.join(os.tmpdir(), `daily-plan-sim-${process.pid}.json`);
// Windows reuses process ids: an old run's file under this name would add its rows to this run's.
try { require('fs').unlinkSync(process.env.DB_FILE); } catch { /* none there */ }
const dp = require('../services/daily-plan');

const DAYS = 14;
const SESSION = { minutes: 20, breakEveryMinutes: 15, breakMinutes: 3 };
const ITEM_MIN = 0.75;
const REVIEW_CAP_ITEMS = Math.floor(10 / ITEM_MIN); // the review page serves at most REVIEW_MINUTES (10)
const PATH = 120;
const SUBJECTS = ['math', 'english', 'reading', 'science'];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The sheet's kind of a level (a master quiz every tenth level; lessons, practice and retention between). */
const kindAt = (level) => (level % 10 === 0 ? 'master' : level % 4 === 1 ? 'lesson' : level % 4 === 3 ? 'retention' : 'practice');
const written = (kind) => kind === 'lesson' || kind === 'retention';

const ARCHETYPES = [
  { id: 'fast', minutes: 60, speed: 0.7 },
  { id: 'slow', minutes: 60, speed: 1.5 },
  { id: 'test-soon', minutes: 60, speed: 1, testDay: 8, testSubject: 0 },
  { id: 'far-behind', minutes: 60, speed: 1, start: [60, 60, 10, 60] },
  { id: 'low-30', minutes: 30, speed: 1 },
  { id: 'high-120', minutes: 120, speed: 1 },
];

function run(arch, policy) {
  // The subject the archetype is about: the one with the test date, or the one far behind (the lowest start).
  const focus = arch.testSubject !== undefined ? arch.testSubject : arch.start ? arch.start.indexOf(Math.min(...arch.start)) : null;
  const focusDays = (day) => (arch.testDay === undefined ? true : day <= arch.testDay);
  const through = policy === 'baseline'; // the old dashboard re-offers the next level again and again: no stop at a checkpoint
  const rand = rng(0xC0FFEE + arch.id.length * 7919);
  const subs = SUBJECTS.map((trackId, i) => ({
    enrollmentId: i + 1, trackId, title: trackId, level: (arch.start ? arch.start[i] : 30), due: [], lastTouched: -1, history: [], touchedDays: new Set(),
    levelsDone: [], // { day, minutes }
  }));
  const stat = { planned: 0, given: 0, clock: 0, levelMinPlanned: 0, levelMinReady: 0, dueItems: 0, onTime: 0, within1: 0, lateOrMissed: 0, estErr: [], testMinutes: 0, testLevelMinutes: 0, focusPlanMinutes: 0, allLevelMinutes: 0, totalPlanMinutes: 0, blocksPerDay: [] };
  const doneAt = new Map(); // item id -> day done
  let nextItem = 1;
  const items = []; // { id, sub, dueDay }

  for (let day = 0; day < DAYS; day++) {
    // the learner's pace from the last seven days: two studied days needed
    const state = subs.map((s) => {
      const recent = s.levelsDone.filter((x) => day - x.day <= 7);
      const days = new Set(recent.map((x) => x.day)).size;
      const pace = days >= 2 ? { levelsPerHour: recent.length / (recent.reduce((n, x) => n + x.minutes, 0) / 60), sessions: days } : { levelsPerHour: 0, sessions: days };
      const ahead = Math.max(3, Math.ceil(2 * pace.levelsPerHour * 4 / 60) + 1); // the write-ahead is caught up at the start of each day (WRITE_AHEAD_LEVELS 3, raised by pace)
      const levels = [];
      let w = 0;
      for (let l = s.level; l < s.level + (through ? 40 : 14) && l <= PATH; l++) {
        const kind = kindAt(l);
        let ready = true;
        if (written(kind)) { ready = w <= ahead; w += 1; }
        const est = dp.levelMinutes(kind, pace, SESSION);
        levels.push({ level: l, kind, estMinutes: est.minutes, paceBased: est.paceBased, ready, checkpoint: kind === 'master' && !through });
        if (kind === 'master' && !through) break;
      }
      const dueNow = items.filter((x) => x.sub === s && x.dueDay <= day && !doneAt.has(x.id)).sort((a, b) => a.dueDay - b.dueDay);
      const n = Math.min(dueNow.length, REVIEW_CAP_ITEMS);
      const overdue = dueNow.length ? day - dueNow[0].dueDay : 0;
      const goal = arch.testDay !== undefined && s.enrollmentId - 1 === arch.testSubject && day <= arch.testDay ? { status: 'date', days_left: arch.testDay - day } : { status: 'forever' };
      return {
        enrollmentId: s.enrollmentId, trackId: s.trackId, title: s.title, role: 'main', graduated: false, goal, progress: (s.level - 1) / PATH,
        gapDays: Math.max(0, day - s.lastTouched - 1), momentum: pace.levelsPerHour > 0 ? 1 : 0, blocked: null, placement: null, levels,
        review: n ? { estMinutes: Math.round(n * ITEM_MIN * 10) / 10, items: n, reteach: 0, memoryChecks: 0, minRecall: Math.max(0.3, 0.85 - 0.12 * overdue), risk: Math.min(1, 0.4 + 0.12 * overdue) } : null,
        _ids: dueNow.slice(0, n).map((x) => x.id),
      };
    });
    let input = { minutes: arch.minutes, session: SESSION, subjects: state, materials: [], enforcers: {} };
    if (policy === 'baseline') {
      // The dashboard as it was: one lead subject (the first), levels only, the whole day; no reviews, no spread.
      const lead = { ...state[0], review: null };
      input = { ...input, subjects: [lead], };
    }
    const plan = dp.allocate(input);
    stat.planned += plan.minutes_used;
    stat.given += arch.minutes;
    stat.blocksPerDay.push(plan.blocks.filter((b) => b.kind !== 'break').length);
    for (const b of plan.blocks) if (b.kind === 'level') { if (focus === null || focusDays(day)) stat.allLevelMinutes += b.estMinutes; if (focus !== null && b.enrollmentId === focus + 1 && focusDays(day)) stat.testLevelMinutes += b.estMinutes; stat.levelMinPlanned += b.estMinutes; if (b.ready) stat.levelMinReady += b.estMinutes; }
    for (const b of plan.blocks) if (b.kind !== 'break') { stat.totalPlanMinutes += b.estMinutes; if (focus !== null && b.enrollmentId === focus + 1 && focusDays(day)) stat.testMinutes += b.estMinutes; if (focus === null || focusDays(day)) stat.focusPlanMinutes += b.estMinutes; }

    // the learner follows the plan in order until their minutes run out
    let clock = 0;
    for (const b of plan.blocks) {
      if (b.kind === 'break') { clock += b.estMinutes; continue; }
      const s = subs[b.enrollmentId - 1];
      if (b.kind === 'review') {
        const st = state[b.enrollmentId - 1];
        const actual = st.review.items * ITEM_MIN * arch.speed;
        if (clock + actual > arch.minutes + 0.5) break;
        clock += actual;
        for (const id of st._ids) doneAt.set(id, day);
        s.touchedDays.add(day); s.lastTouched = day;
      } else {
        const kind = kindAt(b.level);
        const actual = dp.LEVEL_DEFAULT_MIN[kind] * arch.speed * (0.85 + 0.3 * rand());
        if (clock + actual > arch.minutes + 0.5) break;
        if (b.level !== s.level) continue;
        clock += actual;
        stat.estErr.push(Math.abs(b.estMinutes - actual) / actual);
        s.levelsDone.push({ day, minutes: actual });
        s.level += 1; s.touchedDays.add(day); s.lastTouched = day;
        // two review items come due after each level at each of +1, +4 and +10 days
        for (const d of [1, 4, 10]) for (let k = 0; k < 2; k++) { items.push({ id: nextItem++, sub: s, dueDay: day + d }); }
      }
    }
    stat.clock += Math.min(clock, arch.minutes);
  }
  // review timeliness over the items that came due within the 14 days
  for (const it of items) {
    if (it.dueDay >= DAYS) continue;
    stat.dueItems += 1;
    const d = doneAt.get(it.id);
    if (d === undefined) stat.lateOrMissed += 1;
    else { if (d <= it.dueDay) stat.onTime += 1; if (d <= it.dueDay + 1) stat.within1 += 1; }
  }
  let maxGap = 0;
  const perSubjectGap = subs.map((s) => {
    let run = 0; let best = 0;
    for (let d = 0; d < DAYS; d++) { if (s.touchedDays.has(d)) run = 0; else { run += 1; best = Math.max(best, run); } }
    maxGap = Math.max(maxGap, best);
    return best;
  });
  return {
    archetype: arch.id, policy,
    minutes_given: arch.minutes,
    planned_used_pct: Math.round((stat.planned / stat.given) * 100),
    actual_used_pct: Math.round((stat.clock / stat.given) * 100),
    est_error_pct: stat.estErr.length ? Math.round((stat.estErr.reduce((a, b) => a + b, 0) / stat.estErr.length) * 100) : null,
    reviews_on_time_pct: policy === 'baseline' ? null : stat.dueItems ? Math.round((stat.onTime / stat.dueItems) * 100) : null,
    reviews_within_1_day_pct: policy === 'baseline' ? null : stat.dueItems ? Math.round((stat.within1 / stat.dueItems) * 100) : null,
    max_days_untouched: maxGap,
    per_subject_max_untouched: perSubjectGap,
    ready_share_pct: stat.levelMinPlanned ? Math.round((stat.levelMinReady / stat.levelMinPlanned) * 100) : null,
    levels_done: subs.reduce((n, s) => n + s.levelsDone.length, 0),
    focus_share_pct: focus !== null && stat.focusPlanMinutes ? Math.round((stat.testMinutes / stat.focusPlanMinutes) * 100) : null,
    focus_new_material_pct: focus !== null && stat.allLevelMinutes ? Math.round((stat.testLevelMinutes / stat.allLevelMinutes) * 100) : null,
    blocks_per_day: Math.round((stat.blocksPerDay.reduce((a, b) => a + b, 0) / DAYS) * 10) / 10,
  };
}

function main() {
  const results = [];
  for (const a of ARCHETYPES) { results.push(run(a, 'plan')); results.push(run(a, 'baseline')); }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(results, null, 2)); return results; }
  console.log('SIMULATED: 14 days x 4 subjects, seeded; the planner is the real services/daily-plan.js allocate().');
  const cols = ['archetype', 'policy', 'minutes_given', 'planned_used_pct', 'actual_used_pct', 'est_error_pct', 'reviews_on_time_pct', 'reviews_within_1_day_pct', 'max_days_untouched', 'ready_share_pct', 'levels_done', 'focus_share_pct', 'focus_new_material_pct'];
  console.log(cols.join('\t'));
  for (const r of results) console.log(cols.map((c) => (r[c] === null || r[c] === undefined ? '-' : r[c])).join('\t'));
  return results;
}

const results = main();
if (process.argv.includes('--gate')) {
  let bad = 0;
  const gate = (label, ok) => { if (!ok) { bad += 1; console.log(`  FAIL gate: ${label}`); } };
  for (const r of results.filter((x) => x.policy === 'plan')) {
    gate(`${r.archetype}: no subject untouched more than ${dp.MAX_GAP_DAYS} days (got ${r.max_days_untouched})`, r.max_days_untouched <= dp.MAX_GAP_DAYS);
    gate(`${r.archetype}: at least 80% of the minutes used (got ${r.actual_used_pct}%)`, r.actual_used_pct >= 80);
    gate(`${r.archetype}: the plan never plans more than the minutes given (got ${r.planned_used_pct}%)`, r.planned_used_pct <= 100);
  }
  const t = results.find((x) => x.archetype === 'test-soon' && x.policy === 'plan');
  gate('the test-date subject gets well over an equal quarter of the new material before its test', t.focus_new_material_pct >= 40);
  const fb = results.find((x) => x.archetype === 'far-behind' && x.policy === 'plan');
  gate('the far-behind subject gets more than an equal quarter of the new material (it catches up, then the share falls back)', fb.focus_new_material_pct >= 28);
  const base = results.filter((x) => x.policy === 'baseline');
  gate('the baseline (one Up next subject) starves a subject for more than the limit', base.every((r) => r.max_days_untouched > dp.MAX_GAP_DAYS));
  console.log(bad ? `${bad} gate(s) failed` : 'daily-plan-sim gates passed');
  process.exit(bad ? 1 : 0);
}
