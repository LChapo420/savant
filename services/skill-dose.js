/**
 * The practice-dose plan for chess, piano and basketball (staged patch
 * skills-round3/04-practice-dose; SKILL_DOSE=on, needs SKILL_RECORD=on and
 * patch 01; its drills are patch 02's checks played warm, so it needs 02 for
 * anything but logged sets).
 *
 * Each day's practice comes from services/skill-adaptation.js planSession on
 * the learner's own skill record. It decides HOW MUCH and WHEN, never WHAT:
 *   - the session's sets go to the stage's unproven metrics by their distance
 *     from target on the learner's recent warm sets; every unproven metric
 *     gets at least one (checkPlan proves none is dropped);
 *   - the maintenance share (round 3): proven metrics that have not had their
 *     over-learning dose (twice the sets it took to prove them) keep the share
 *     even practice would give them, so a proven skill is not left to fade
 *     while the others catch up (round 2 kept less at 30 days without it);
 *   - a cold stage test is called when the last three warm sets were at the
 *     target, or every 5 days (patch 02 shows it on the stage check);
 *   - retention and re-sit tests when due.
 * Warm sets never prove anything: they make the next sitting warm for 20
 * hours and tell the plan when a cold test is worth sitting.
 *
 * A set is the metric's own check played warm with feedback: 5 questions, one
 * piano part, or one logged basketball set, judged against the same bar. A
 * metric whose check is not built yet (games, play-outs) is practised where
 * the app has it and logged by the learner: a self-report, so it only times
 * the next cold test.
 */
'use strict';

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const record = require('./skill-record');
const sa = require('./skill-adaptation');
const sc = require('./skill-coverage');

const ITEMS_PER_SET = 5;
const DAY = sc.DAY;

function enabled() {
  // Default on since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); SKILL_DOSE=off turns it off.
  return record.enabled() && String(process.env.SKILL_DOSE || 'on').toLowerCase() === 'on';
}

/**
 * On for this account: every learner but the owner, who gets the base path with
 * no dosing from the record (config/owner.js ownerBase; OWNER_BASE=off lifts it).
 */
function onFor(userOrId) {
  // eslint-disable-next-line global-require
  return enabled() && !require('../config/owner').ownerBase(userOrId);
}

function checksPart() {
  try {
    // eslint-disable-next-line global-require
    return { checks: require('./skill-checks'), content: require('../content/skill-stage-checks') };
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

/** Minutes of a session: the stage's own range, its middle. */
function sessionMinutes(stage) {
  const m = /(\d+)\s*-\s*(\d+)/.exec(String(stage.session_minutes || ''));
  return m ? Math.round((Number(m[1]) + Number(m[2])) / 2) : 30;
}

function atFinal(enrollment) {
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const final = grade && (grade.levels.find((l) => l.kind === 'graduation') || {}).level;
  return !!final && enrollment.current_level >= final;
}

const dayOf = (t) => Math.floor(t / DAY);

// ── youth weekly load caps and rest days (evidence article 04, P7) ──────────
/**
 * The NBA & USA Basketball Youth Guidelines' weekly maxima of organised
 * basketball and minimum rest days by age (content/skill-progressions/
 * basketball.json `nbayouth`, checked against the guideline text,
 * curriculum-build/NIGHT-2026-10-23.md): 3/5/10/14 hours and 2/2/1/1 rest days
 * for 7-8 / 9-11 / 12-14 / high school. A child under 7 gets the 7-8 band (the
 * most cautious). Adults (19+) and accounts with no age answer have no cap.
 * The week is the 7 UTC days ending today; a rest day is a day with no sets.
 * SKILL_LOAD_CAPS=off turns it off. The owner gets the base plan (planFor).
 */
const LOAD_CAPS = [
  { upTo: 8, hours: 3, rest: 2, band: 'ages 7-8' },
  { upTo: 11, hours: 5, rest: 2, band: 'ages 9-11' },
  { upTo: 14, hours: 10, rest: 1, band: 'ages 12-14' },
  { upTo: 18, hours: 14, rest: 1, band: 'high school' },
];
const LOAD_SUBJECTS = ['basketball'];
const loadCapsOn = () => String(process.env.SKILL_LOAD_CAPS || 'on').toLowerCase() !== 'off';

/** The youngest the learner can be now, from the age screen's month and year of birth (null when unknown). */
function ageOf(user, now = Date.now()) {
  const ym = user && user.age_check && /^(\d{4})-(\d{2})$/.exec(String(user.age_check.birth_ym || ''));
  if (!ym) return null;
  const d = new Date(now);
  const y = d.getUTCFullYear() - Number(ym[1]);
  return d.getUTCMonth() + 1 <= Number(ym[2]) ? y - 1 : y;
}

function capFor(age) {
  if (age === null || age === undefined || age > 18) return null;
  return LOAD_CAPS.find((c) => age <= c.upTo) || null;
}

/** Court minutes by UTC day over the 7 days ending today: the larger of the logged minutes and the sets and sittings on the record. */
function minutesByDay(userId, subject, now = Date.now()) {
  const k = sa.knobs();
  const today = dayOf(now);
  const days = new Map();
  for (let d = today - 6; d <= today; d++) days.set(d, { logged: 0, derived: 0, sat: 0 });
  for (const e of db.find('enrollments', (x) => x.user_id === userId && x.track_id === subject)) {
    for (const [d, m] of Object.entries(e.skill_load || {})) if (days.has(Number(d))) days.get(Number(d)).logged += Number(m) || 0;
  }
  const isCourt = courtTest(checksPart(), subject);
  for (const row of db.find(record.COLLECTION, (r) => r.user_id === userId && r.subject === subject)) {
    if (!isCourt(row.metric_id)) continue;
    for (const w of row.warm || []) if (days.has(dayOf(w.at))) days.get(dayOf(w.at)).derived += k.SET_MIN;
    for (const s of row.sittings || []) if (days.has(dayOf(s.at))) days.get(dayOf(s.at)).sat += k.SIT_MIN;
  }
  // Logged minutes are the sets (logged as they finish) plus any court session
  // logged by other parts of the app; the record's own sets stand in for days
  // before logging began. Sittings are never logged, so they are added.
  const out = new Map();
  for (const [d, v] of days) out.set(d, Math.max(v.logged, v.derived) + v.sat);
  return out;
}

/**
 * Court time against the age's cap, kept on the learner's enrollment as
 * {utcDay: minutes} for the last 14 days (`skill_load`). Exported so other
 * parts of the app (the lesson engine's court sessions) can add their minutes.
 */
function logLoad(userId, subject, minutes, now = Date.now()) {
  if (!LOAD_SUBJECTS.includes(subject) || !(minutes > 0)) return null;
  const list = db.find('enrollments', (x) => x.user_id === userId && x.track_id === subject);
  const e = list.find((x) => x.status === 'active') || list[list.length - 1];
  if (!e) return null;
  const day = dayOf(now);
  const kept = {};
  for (const [d, m] of Object.entries(e.skill_load || {})) if (Number(d) > day - 14) kept[d] = m;
  kept[day] = (Number(kept[day]) || 0) + minutes;
  return db.update('enrollments', e.id, { skill_load: kept });
}

/** This week's load for a learner on a subject, or null when no cap applies. */
function loadFor(userId, subject, now = Date.now()) {
  if (!loadCapsOn() || !LOAD_SUBJECTS.includes(subject)) return null;
  const cap = capFor(ageOf(db.byId('users', userId), now));
  if (!cap) return null;
  const k = sa.knobs();
  const today = dayOf(now);
  const byDay = minutesByDay(userId, subject, now);
  const used = [...byDay.values()].reduce((a, b) => a + b, 0);
  const todayMin = byDay.get(today) || 0;
  const activeBefore = [...byDay.entries()].filter(([d, m]) => d < today && m > 0).length;
  const restDay = todayMin === 0 && activeBefore >= 7 - cap.rest;
  const weekLeft = Math.max(0, cap.hours * 60 - used);
  return {
    band: cap.band, cap_hours: cap.hours, rest_days: cap.rest,
    used_minutes: used, week_left: weekLeft, today_minutes: todayMin,
    active_days: activeBefore + (todayMin > 0 ? 1 : 0),
    rest_day: restDay,
    full: !restDay && weekLeft < k.SET_MIN,
  };
}

function loadNote(load) {
  if (!load) return null;
  const why = `the NBA and USA Basketball youth guidelines give ${load.band} at most ${load.cap_hours} hours of basketball a week and at least ${load.rest_days} rest day${load.rest_days === 1 ? '' : 's'}`;
  if (load.rest_day) return `Rest day today: you have practised on ${load.active_days} of the last 6 days, and ${why}.`;
  if (load.full) return `This week's basketball time is used up (${Math.round(load.used_minutes / 6) / 10} of ${load.cap_hours} hours): ${why}.`;
  if (load.cut) return `Today's court sets are cut to fit the week (${Math.round(load.used_minutes / 6) / 10} of ${load.cap_hours} hours used): ${why}.`;
  return null;
}

/** A court set refused on a rest day or when the week's time is used up (null when it may go ahead). */
function loadBlock(userId, enrollment, metricId, now = Date.now()) {
  if (!courtTest(checksPart(), enrollment.track_id)(metricId)) return null;
  const load = loadFor(userId, enrollment.track_id, now);
  if (!load || !(load.rest_day || load.week_left < sa.knobs().SET_MIN)) return null;
  return { status: 409, error: loadNote({ ...load, full: !load.rest_day }), load };
}

/**
 * Cut a plan's court time to `allow` minutes. Only court work counts and is
 * cut (`isCourt`: a metric not sat on the screen); screen sets (decision
 * scenes, rules) are not basketball load. Spare sets go first (consolidation,
 * maintenance, over-learning, carry-over), then practice sets down to one
 * each, then whole practice entries, then sittings. Returns the minutes cut.
 */
function trimToLoad(plan, allow, isCourt, k = sa.knobs()) {
  const court = () => plan.sittings.filter((s) => isCourt(s.metric)).length * k.SIT_MIN
    + plan.practice.filter((p) => isCourt(p.metric)).reduce((a, p) => a + p.sets, 0) * k.SET_MIN;
  const before = court();
  const drop = (pred) => { for (let i = plan.practice.length - 1; i >= 0 && court() > allow; i--) if (pred(plan.practice[i])) plan.practice.splice(i, 1); };
  for (const kind of ['consolidation', 'maintenance', 'overlearn', 'carry']) {
    for (const p of plan.practice.filter((x) => x.kind === kind && isCourt(x.metric)).sort((a, b) => b.sets - a.sets)) {
      while (court() > allow && p.sets > 1) p.sets -= 1;
    }
    drop((p) => p.kind === kind && isCourt(p.metric));
  }
  for (const p of plan.practice.filter((x) => x.kind === 'practice' && isCourt(x.metric)).sort((a, b) => b.sets - a.sets)) {
    while (court() > allow && p.sets > 1) p.sets -= 1;
  }
  drop((p) => p.kind === 'practice' && isCourt(p.metric));
  for (let i = plan.sittings.length - 1; i >= 0 && court() > allow; i--) if (isCourt(plan.sittings[i].metric)) plan.sittings.splice(i, 1);
  return before - court();
}

/** Is this metric's work on the court? Not when it is sat on the screen (items, or a screen/items/tap source). */
function courtTest(part, subject = 'basketball') {
  return (metricId) => {
    const def = part ? part.content.checkFor(metricId) : { how: 'not_wired' };
    if (def.how === 'items') return false;
    const m = record.metricDef(subject, metricId);
    return !(m && /^(screen|items|tap)$/.test(String(m.metric.source.raw || '').trim()));
  };
}

/** Where a metric is practised and how a set is judged. */
function drillFor(metricId, part) {
  const def = part ? part.content.checkFor(metricId) : { how: 'not_wired' };
  if (def.how === 'items') return { how: 'items', says: def.says, set: `${ITEMS_PER_SET} questions with the answer after each` };
  if (def.how === 'take') return { how: 'take', says: def.says, set: 'one part, played warm' };
  if (def.how === 'count') return { how: 'count', says: def.says, set: 'one logged set, judged against the bar', fields: def.fields.map(([name, label, min, max]) => ({ name, label, min, max })), hands: !!def.hands };
  if (def.how === 'puzzles') return { how: 'log', says: def.says, set: 'rated puzzles in the trainer, then log the set', href: '/engine/chess/puzzles.html' };
  const chess = /^CH/.test(metricId);
  return { how: 'log', says: def.needs ? 'Not checkable in the app yet.' : null, needs: def.needs || null, set: 'practise it, then log the set', href: chess ? (/game|hung/.test(metricId) ? '/engine/chess/spar.html' : '/engine/chess/drills.html') : null };
}

/**
 * Today's plan for an enrollment's stage. Fixed for the day once made (kept on
 * the enrollment), so the sets done today count down against it.
 */
function planFor(userId, enrollment, now = Date.now()) {
  // eslint-disable-next-line global-require
  if (require('../config/owner').ownerBase(userId)) return null;
  const stage = record.stageFor(enrollment.track_id, enrollment.grade_id);
  if (!stage) return null;
  const today = dayOf(now);
  let cached = enrollment.skill_practice_plan;
  if (!cached || cached.day !== today || cached.stage !== stage.id) {
    const rec = record.recordFor(userId, enrollment.track_id);
    const minutes = sessionMinutes(stage);
    const knowledgeOpen = !atFinal(enrollment);
    const plan = sa.planSession({ stage, rec, now, minutes, knowledgeOpen, lessonShare: 0.3 });
    let problems = sa.checkPlan(stage, rec, plan);
    // Youth load caps (P7): age caps and rest days override every other lever
    // (SKILL-CURRICULA.md §6 "Age and safety"); court work is cut to what the week has left.
    const load = loadFor(userId, enrollment.track_id, now);
    if (load) {
      const cut = trimToLoad(plan, load.rest_day ? 0 : load.week_left, courtTest(checksPart(), enrollment.track_id));
      load.cut = cut;
      if (cut) {
        plan.reasons.push(`load cap (${load.band}: ${load.cap_hours} h a week, ${load.rest_days} rest day(s)): ${cut} court minutes cut${load.rest_day ? ', rest day' : ''}`);
        problems = problems.filter((p) => !/given no practice or sitting/.test(p));
      }
    }
    cached = { day: today, stage: stage.id, made_at: new Date(now).toISOString(), minutes, knowledge_open: knowledgeOpen, plan, problems, load };
    db.update('enrollments', enrollment.id, { skill_practice_plan: cached });
  }
  const part = checksPart();
  const rows = db.find(record.COLLECTION, (r) => r.user_id === userId && r.subject === enrollment.track_id);
  const doneToday = (id) => {
    const r = rows.find((x) => x.metric_id === id);
    return r ? (r.warm || []).filter((w) => dayOf(w.at) === today).length : 0;
  };
  const metric = (id) => stage.metrics.find((m) => m.id === id);
  const title = (name) => (part && part.content.titleOf ? part.content.titleOf(name) : name.replace(/_/g, ' '));
  const practice = cached.plan.practice.map((p) => {
    const done = doneToday(p.metric);
    return { ...p, name: metric(p.metric).metric, title: title(metric(p.metric).metric), test: metric(p.metric).test, plain: metric(p.metric).plain || null, done: Math.min(done, p.sets), left: Math.max(0, p.sets - done), drill: drillFor(p.metric, part), open: !!((rows.find((x) => x.metric_id === p.metric) || {}).practice_open) };
  });
  return {
    stage: { id: stage.id, name: stage.name },
    minutes: cached.minutes,
    knowledge_open: cached.knowledge_open,
    lesson_minutes: cached.plan.lesson_minutes,
    set_minutes: sa.knobs().SET_MIN,
    sittings: cached.plan.sittings.map((s) => ({ ...s, name: metric(s.metric).metric, title: title(metric(s.metric).metric) })),
    practice,
    reasons: cached.plan.reasons,
    why: [loadNote(cached.load)].filter(Boolean).concat(whyPlain(cached.plan, practice, (id) => title(metric(id).metric))),
    problems: cached.problems,
    load: cached.load ? { ...cached.load, note: loadNote(cached.load) } : null,
    sets: practice.reduce((a, p) => a + p.sets, 0),
    left: practice.reduce((a, p) => a + p.left, 0),
    checks_applied: !!part,
  };
}

/**
 * "Why this plan" in the learner's words (learner follow-ups 2026-10-24). The
 * planner's reasons name metrics by their build ids ("five_finger: cold stage
 * test"); the page shows these lines, built from the same plan.
 */
function whyPlain(plan, practice, titleFor) {
  const out = [];
  for (const s of plan.sittings || []) {
    const t = titleFor(s.metric);
    if (s.kind === 'stage_test') out.push(`${t}: ready for a cold check today.`);
    else if (s.kind === 'retention_test') out.push(`${t}: due its retention check, to show it has lasted.`);
    else if (s.kind === 'stands_test') out.push(`${t}: its last cold pass is getting old, so one more keeps it standing.`);
  }
  const sum = (kind) => practice.filter((p) => p.kind === kind).reduce((a, p) => a + p.sets, 0);
  const n = { practice: sum('practice'), overlearn: sum('overlearn'), consolidation: sum('consolidation') };
  const sets = (k) => `${k} set${k === 1 ? ' goes' : 's go'}`;
  if (n.practice) out.push(`${sets(n.practice)} to skills not proven yet, more to the ones furthest from passing.`);
  if (n.overlearn) out.push(`${sets(n.overlearn)} to skills you have proven, so they last.`);
  for (const p of practice.filter((x) => x.kind === 'maintenance')) out.push(`${p.title}: proven and practised enough, so one set keeps it going.`);
  if (n.consolidation) out.push(`Everything is proven: the other ${sets(n.consolidation)} to keeping it all standing.`);
  return out;
}

/** The cold tests today's plan calls (read by patch 02 for the stage check). */
function scheduledTests(userId, enrollment, now = Date.now()) {
  const p = planFor(userId, db.byId('enrollments', enrollment.id) || enrollment, now);
  return p ? p.sittings.map((s) => s.metric) : [];
}

function planned(userId, enrollment, metricId, now) {
  const p = planFor(userId, enrollment, now);
  return p && p.practice.find((x) => x.metric === metricId);
}

/** Start a warm set of a metric's own check (items or one piano part). */
function startSet(userId, enrollment, metricId, now = Date.now()) {
  const part = checksPart();
  const entry = planned(userId, enrollment, metricId, now);
  if (!entry) return { status: 404, error: 'That is not in today\'s practice.' };
  if (!part) return { status: 409, error: 'The practice drills come with the stage checks (patch 02); log the set instead.' };
  const blocked = loadBlock(userId, enrollment, metricId, now);
  if (blocked) return { status: blocked.status, error: blocked.error };
  const def = part.content.checkFor(metricId);
  const row = record.ensureRow(userId, enrollment.track_id, metricId);
  if (row.practice_open && now - row.practice_open.started_at < 3 * 3600 * 1000) return { set: forPage(row.practice_open), resumed: true };
  const seed = (userId * 104729 + now) >>> 0;
  let a = seed;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let open;
  if (def.how === 'items') {
    const small = { ...def, count: Math.min(ITEMS_PER_SET, def.count), mates: def.mates ? Math.min(3, def.mates) : def.mates };
    const items = part.checks.BUILDERS[def.build](small, rnd, `p:${userId}:${metricId}:${now}`).slice(0, ITEMS_PER_SET);
    open = { how: 'items', metric_id: metricId, started_at: now, items, answers: items.map(() => null) };
  } else if (def.how === 'take') {
    const drawn = row.hotspot_part && flagOn('PIANO_HOTSPOT_LOOP') ? [] : part.checks.takeParts(def, rnd, userId, { gradeId: enrollment.grade_id, row, now }).slice(0, 1);
    const pp = practiceParts(drawn, row);
    if (!pp.parts.length) return { status: 409, error: 'Nothing to play for this one yet.' };
    open = { how: 'take', metric_id: metricId, started_at: now, parts: pp.parts, takes: [[]], hotspot: pp.hotspot };
  } else {
    return { status: 400, error: 'This one is logged, not played here.' };
  }
  db.update(record.COLLECTION, row.id, { practice_open: open });
  return { set: forPage(open), resumed: false };
}

function forPage(open) {
  const part = checksPart();
  if (open.how === 'items') return { metric: open.metric_id, how: 'items', items: part.checks.itemsForPage(open.items), answered: open.answers.map((x) => x !== null) };
  if (part.checks.takePartsForPage) return { metric: open.metric_id, how: 'take', parts: part.checks.takePartsForPage(open.parts) };
  return { metric: open.metric_id, how: 'take', parts: open.parts.map((p, i) => ({ index: i, label: p.label, tempo: p.tempo, hands: p.hands || null, names: p.names || null, chords: p.chords || null, any_key: !!p.any_key, count_in: p.count_in || 4, target: p.chords ? null : (p.target || []).map((t) => ({ midi: t.midi, beat: t.beat })) })) };
}

/** One answer in a warm items set: marked straight away, with the answer. */
function answerSet(userId, enrollment, metricId, { index, answer, source }) {
  const part = checksPart();
  const row = record.rowFor(userId, enrollment.track_id, metricId);
  if (!part || !row || !row.practice_open || row.practice_open.how !== 'items') return { status: 404, error: 'No practice set is open.' };
  const open = row.practice_open;
  const i = Number(index);
  if (!Number.isInteger(i) || !open.items[i]) return { status: 400, error: 'No such question.' };
  if (open.answers[i] !== null) return { status: 409, error: 'Already answered.' };
  const graded = part.checks.gradeItem(open.items[i], answer);
  const key = open.items[i].key;
  const shown = key.answer || (key.accepts && key.accepts[0]) || (key.set && key.set.join(' ')) || (key.type === 'mate_or_none' ? (key.mate ? 'a mate exists' : 'no mate') : null) || (key.type === 'move_or_none' ? 'nothing wins' : null) || (key.notes ? key.notes.map((m) => require('../public/engine/piano/piano-core').midiToName(m)).join(' ') : null) || (key.type === 'midi' ? 'middle C' : key.type === 'pc' ? `any ${['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][key.pc]}` : null);
  const answers = open.answers.map((x, k) => (k === i ? { ...graded, source: source || null } : x));
  db.update(record.COLLECTION, row.id, { practice_open: { ...open, answers } });
  return { correct: graded.correct, answer: shown, key_midi: key.type === 'midi' ? key.midi : null, key_pc: key.type === 'pc' ? key.pc : null };
}

// ── the piano practice engine (evidence article 04, P2 and P3) ───────────────
// Warm practice takes only; a cold stage take is always at the target tempo
// with the full result. piano-core holds the pure rules (tempoLadder, hotspot,
// sliceBars, outsideBar) and the tests prove them.
const PC = () => require('../public/engine/piano/piano-core'); // eslint-disable-line global-require
const flagOn = (name) => String(process.env[name] || 'on').toLowerCase() !== 'off';
/** PIANO_TEMPO_LADDER: a part at a set tempo (not a beat to tap or a cadence) climbs from 65% to the target. */
const ladderFits = (p) => flagOn('PIANO_TEMPO_LADDER') && p && p.tempo && !p.any_key && !p.target_chords && !p.pedal;
/** PIANO_HOTSPOT_LOOP: a piece of 2+ bars whose notes are shown by name (not a sight-reading score, memory or chords). */
const hotspotFits = (p) => flagOn('PIANO_HOTSPOT_LOOP') && p && p.song && p.beats_per_bar && !p.score && !p.memory && !p.target_chords && !p.pedal && !p.dynamics && !p.any_key;
const HOTSPOT_PCT = 0.65;

/** The parts of a warm piano set: the pending hotspot loop, else one part at the ladder's tempo. */
function practiceParts(parts, row) {
  if (row.hotspot_part && flagOn('PIANO_HOTSPOT_LOOP')) return { parts: [row.hotspot_part], hotspot: true };
  return {
    hotspot: false,
    parts: parts.map((p) => {
      if (!ladderFits(p)) return p;
      const st = PC().tempoLadder(row.tempo_ladder || null);
      if (st.pct >= 1) return { ...p, target_tempo: p.tempo, ladder_pct: 1 };
      return { ...p, label: `${p.label}, at ${Math.round(st.pct * 100)}% speed`, target_tempo: p.tempo, tempo: Math.max(30, Math.round(p.tempo * st.pct)), ladder_pct: st.pct };
    }),
  };
}

/** The bars to loop after a take with errors: the worst 1-2 bars, at 65% of the target tempo. */
function hotspotPart(p, played, part) {
  const clean = part.checks.cleanPlayed(played);
  if (clean.error || !clean.notes.length) return null;
  const mic = clean.notes.some((n) => n.source === 'mic');
  const score = PC().scorePerformance(p.target, clean.notes, { tempo: p.tempo, octaveFree: mic });
  const h = PC().hotspot(p.target, score, p.beats_per_bar);
  if (!h) return null;
  const target = PC().sliceBars(p.target, h.from, h.to, p.beats_per_bar);
  if (target.length < 2) return null;
  const base = String(p.label).replace(/, at \d+% speed$/, '');
  const bars = h.from === h.to ? `bar ${h.from + 1}` : `bars ${h.from + 1}-${h.to + 1}`;
  const tempo = Math.max(30, Math.round((p.target_tempo || p.tempo) * HOTSPOT_PCT));
  return { label: `${base}: ${bars}, looped slowly`, tempo, hands: p.hands, mic_hands: p.mic_hands, names: target.map((t) => PC().midiToName(t.midi)), target, beats_per_bar: p.beats_per_bar, hotspot_of: p.song, bars: [h.from + 1, h.to + 1], target_tempo: p.target_tempo || p.tempo };
}

/**
 * Bandwidth and on-request feedback (P2, PIANO_FEEDBACK_FADE): after 2 clean
 * warm takes in a row on a metric, a take's result flags only what is outside
 * the bar; the full numbers stay in the answer for the page to show on request.
 */
function feedbackFor(def, row, scored) {
  if (!flagOn('PIANO_FEEDBACK_FADE')) return {};
  const streak = row.practice_streak || 0;
  if (streak < 2) return { feedback: 'full' };
  const rule = { ...(def.rule || {}) };
  if (scored.source === 'mic' && rule.notes_mic !== undefined) rule.notes = rule.notes_mic;
  return { feedback: 'bandwidth', off: PC().outsideBar(scored, rule) };
}

function takeSet(userId, enrollment, metricId, { part: idx, played, origin, pedal }) {
  const part = checksPart();
  const row = record.rowFor(userId, enrollment.track_id, metricId);
  if (!part || !row || !row.practice_open || row.practice_open.how !== 'take') return { status: 404, error: 'No practice set is open.' };
  const open = row.practice_open;
  const p = open.parts[Number(idx) || 0];
  const def = part.content.checkFor(metricId);
  const scored = part.checks.scoreTake(def, p, played, origin === undefined ? null : origin, { pedal });
  if (scored.error) return { status: 400, error: scored.error };
  const fb = feedbackFor(def, row, scored);
  const next = !scored.pass && !open.hotspot && hotspotFits(p) ? hotspotPart(p, played, part) : null;
  db.update(record.COLLECTION, row.id, {
    practice_open: { ...open, takes: [[...open.takes[0], scored]], hotspot_next: next || open.hotspot_next || null },
    practice_streak: scored.pass ? (row.practice_streak || 0) + 1 : 0,
  });
  const extra = {};
  if (p.ladder_pct) extra.tempo = { at: p.tempo, target: p.target_tempo, pct: p.ladder_pct };
  if (open.hotspot) extra.hotspot = { bars: p.bars, then: 'rejoin the whole piece next set', tempo: p.tempo, target: p.target_tempo || p.tempo };
  if (next) extra.next_loop = { bars: next.bars, tempo: next.tempo };
  return { ...scored, ...fb, ...extra, verdict: takeVerdict(scored, extra) };
}

const bars = (b) => (!b ? '' : b[0] === b[1] ? `bar ${b[0]}` : `bars ${b[0]}-${b[1]}`);

/**
 * The verdict line for one warm piano take, said the same way the set summary
 * will say it: a clean take below the target tempo is "Clean at 68 bpm (target
 * 104)", not "At the bar", because the set it belongs to is not at the target.
 */
function takeVerdict(scored, extra) {
  if (extra.hotspot) {
    const where = bars(extra.hotspot.bars);
    return scored.pass ? `Clean on the slow loop${where ? ` (${where})` : ''}, at ${extra.hotspot.tempo} bpm.` : `Not clean yet on the slow loop${where ? ` (${where})` : ''}.`;
  }
  if (extra.tempo && extra.tempo.pct < 1) {
    return scored.pass ? `Clean at ${extra.tempo.at} bpm (target ${extra.tempo.target}).` : `Below the bar at ${extra.tempo.at} bpm (target ${extra.tempo.target}).`;
  }
  return scored.pass ? 'At the bar.' : 'Below the bar.';
}

/**
 * What a finished warm set says: { line, next, clean }. At the target: "at the
 * bar". Clean at a practice tempo: that, and what the next set does (steps up,
 * or stays until one more clean set). A clean slow loop: that, and the next set
 * rejoins the piece. Otherwise: below the bar, and what comes next.
 */
function setSummary(atTarget, pr) {
  if (atTarget) return { line: 'That set was at the bar.', next: null, clean: true };
  if (pr && pr.kind === 'tempo') {
    const next = pr.step === 'up'
      ? (pr.next_tempo >= pr.target_tempo ? `The next set is at the full ${pr.target_tempo} bpm.` : `The next set steps up to ${pr.next_tempo} bpm.`)
      : pr.step === 'down' ? `The next set slows to ${pr.next_tempo} bpm.`
        : pr.clean ? `The next set stays at ${pr.tempo} bpm; one more clean set steps it up.` : `The next set stays at ${pr.tempo} bpm.`;
    const loop = pr.next_loop ? ` First, ${bars(pr.next_loop)} looped slowly.` : '';
    return pr.clean
      ? { line: `Clean at ${pr.tempo} bpm, a practice tempo (target ${pr.target_tempo}). It counts as at the target once it is clean at ${pr.target_tempo}.`, next: `${next}${loop}`, clean: true }
      : { line: `That set was below the bar, at ${pr.tempo} bpm (target ${pr.target_tempo}).`, next: `${next}${loop}`, clean: false };
  }
  if (pr && pr.kind === 'loop') {
    const where = bars(pr.bars);
    return pr.clean
      ? { line: `The slow loop${where ? ` (${where})` : ''} was clean at ${pr.tempo} bpm. A loop is practice, not the whole piece.`, next: 'The next set rejoins the whole piece.', clean: true }
      : { line: `The slow loop${where ? ` (${where})` : ''} was not clean yet.`, next: 'The next set rejoins the whole piece.', clean: false };
  }
  return { line: 'That set was below the bar.', next: null, clean: false };
}

/** Close a warm set: at the target or not, by the check's own bar; recorded as practice. */
function finishSet(userId, enrollment, metricId, now = Date.now()) {
  const part = checksPart();
  const row = record.rowFor(userId, enrollment.track_id, metricId);
  if (!part || !row || !row.practice_open) return { status: 404, error: 'No practice set is open.' };
  const open = row.practice_open;
  const def = part.content.checkFor(metricId);
  let atTarget;
  let score;
  if (open.how === 'items') {
    const graded = open.answers.map((x) => x || { correct: false });
    const r = part.checks.itemsResult({ ...def, rule: def.rule.right !== undefined ? { share: def.rule.right / def.count } : def.rule }, graded);
    atTarget = r.pass;
    score = r.score;
  } else {
    const t = open.takes[0][open.takes[0].length - 1];
    if (!t) return { status: 409, error: 'Play it first.' };
    atTarget = !!t.pass;
    score = t.notes;
  }
  const patch = { practice_open: null };
  // What a set below the target means, so the page can say it the way the take did
  // ("Clean at 68 bpm (target 104)", not "below the bar" after a clean take).
  let practice = null;
  if (open.how === 'take') {
    const p = open.parts[0] || {};
    const t = open.takes[0][open.takes[0].length - 1];
    if (open.hotspot) {
      // A hotspot loop is a few bars slowly: it never says the skill is at its target; the next set rejoins the piece.
      atTarget = false;
      patch.hotspot_part = null;
      practice = { kind: 'loop', clean: !!t.pass, bars: p.bars || null, tempo: p.tempo, target_tempo: p.target_tempo || p.tempo };
    } else {
      if (p.ladder_pct) {
        patch.tempo_ladder = PC().tempoLadder(row.tempo_ladder || null, !!t.pass);
        // Below the target tempo a clean take is a step on the ladder, not a take at the target.
        if (p.ladder_pct < 1) {
          atTarget = false;
          const nextTempo = patch.tempo_ladder.pct >= 1 ? p.target_tempo : Math.max(30, Math.round(p.target_tempo * patch.tempo_ladder.pct));
          practice = {
            kind: 'tempo', clean: !!t.pass, tempo: p.tempo, target_tempo: p.target_tempo, next_tempo: nextTempo,
            step: nextTempo > p.tempo ? 'up' : nextTempo < p.tempo ? 'down' : 'same',
          };
        }
      }
      if (!t.pass && open.hotspot_next) {
        patch.hotspot_part = open.hotspot_next;
        if (practice) practice.next_loop = open.hotspot_next.bars || null;
      }
    }
  }
  db.update(record.COLLECTION, row.id, patch);
  record.practise(userId, { subject: enrollment.track_id, metricId, atTarget, at: now });
  return { at_target: atTarget, score, practice, summary: setSummary(atTarget, practice), plan: planFor(userId, db.byId('enrollments', enrollment.id), now) };
}

/**
 * A logged set: a basketball set judged by the check's rule, or, for a metric
 * not checkable in the app, the learner's own word (it only times the next
 * cold test; warm sets never prove).
 */
function logSet(userId, enrollment, metricId, body, now = Date.now()) {
  const entry = planned(userId, enrollment, metricId, now);
  if (!entry) return { status: 404, error: 'That is not in today\'s practice.' };
  const part = checksPart();
  const blocked = loadBlock(userId, enrollment, metricId, now);
  if (blocked) return { status: blocked.status, error: blocked.error };
  const def = part ? part.content.checkFor(metricId) : { how: 'not_wired' };
  let atTarget;
  let note = null;
  if (def.how === 'count') {
    const row = record.ensureRow(userId, enrollment.track_id, metricId);
    const r = part.checks.countResult(def, body, row.baseline);
    if (r.error) return { status: 400, error: r.error };
    atTarget = r.pass === true;
    note = r.note || null;
  } else if (def.how === 'items' || def.how === 'take') {
    return { status: 400, error: 'This one is played here: start the set.' };
  } else {
    atTarget = !!(body && body.at_target === true);
    note = 'your own word: it only times the next cold test';
  }
  record.practise(userId, { subject: enrollment.track_id, metricId, atTarget, at: now });
  if (courtTest(part, enrollment.track_id)(metricId)) logLoad(userId, enrollment.track_id, sa.knobs().SET_MIN, now);
  return { at_target: atTarget, note, plan: planFor(userId, db.byId('enrollments', enrollment.id), now) };
}

/** The path's "Today's practice" row. */
function pathNode(userId, enrollment) {
  if (!onFor(userId) || enrollment.status !== 'active') return null;
  const p = planFor(userId, enrollment);
  if (!p) return null;
  const href = `/skill-practice?enrollment=${enrollment.id}`;
  if (p.load && p.load.note && (p.load.rest_day || p.load.full) && !p.left) return { kind: 'practice', badge: 'Rest', title: p.load.rest_day ? 'Rest day' : 'This week\'s court time is used', kind_label: 'Practice', detail: p.load.note, href, action: 'See it', done: true };
  if (!p.sets) return null;
  if (!p.left) return { kind: 'practice', badge: 'Today', title: "Today's practice is done", kind_label: 'Practice', detail: `${p.sets} set${p.sets === 1 ? '' : 's'} done.`, href, action: 'See it', done: true };
  const names = [...new Set(p.practice.filter((x) => x.left).map((x) => x.title || x.name.replace(/_/g, ' ')))];
  return { kind: 'practice', badge: 'Today', title: "Today's practice", kind_label: 'Practice', detail: `${p.left} set${p.left === 1 ? '' : 's'} of about ${p.set_minutes} min: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ', and more' : ''}.`, href, action: p.left < p.sets ? 'Carry on' : 'Practise', next: true };
}

module.exports = {
  enabled, onFor, sessionMinutes, planFor, scheduledTests, startSet, answerSet, takeSet, finishSet, logSet, pathNode, drillFor,
  LOAD_CAPS, ageOf, capFor, loadFor, logLoad, loadBlock, trimToLoad, setSummary, takeVerdict,
};
