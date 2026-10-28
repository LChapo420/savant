/**
 * Effort monitoring on scored sittings (curriculum-build/ADAPTIVE-COVERAGE.md
 * section 7, decision 8; staged patch round3/03-too-fast).
 *
 * On a checkpoint or the Final, an answer faster than OBJ_RAPID_MS (1.2 s) was
 * not read, so it is not scored: the learner is told it was too fast to count
 * and gets a parallel question (the same skill and difficulty, and the same
 * objective when the question has one) in its place. At most ADAPT_MAX_RESERVE
 * (2) times per question; after that the answer stands as given. The pass mark
 * and the number of scored questions never change, so the bar is the same:
 * only answers someone actually read can pass or fail it.
 * (adaptation.sittingRule; effort monitoring with warnings, Wise, Bhola & Yang
 * 2006.) In the simulation this took rushers from 54% to 100% passing the Final.
 *
 * Anywhere else, a rapid answer from a learner whose own record says they rush
 * (adaptation.effort: more than 5% rapid answers, 95% sure, 30+ answers) gets
 * a one-line slow-down note. It is never a penalty and changes no score.
 *
 * The set-aside answer is kept on its item (`reserved`, with its time), never
 * graded, and read by the coverage record as a rapid answer: evidence of
 * rushing, never of knowing.
 *
 * Off unless ADAPT_EFFORT=on.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const bank = require('../content/bank');
const adaptation = require('./adaptation');
const coverage = require('./coverage');

const TOO_FAST = 'That answer came in too fast to count, so it is not scored. Here is another question on the same thing. Take your time: only answers you have read can pass or fail.';
const SLOW_DOWN = 'That was very quick. Read each question to the end before you answer; answers that fast do not count toward what you have shown.';

function enabled() {
  // Default on since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); ADAPT_EFFORT=off turns it off.
  return String(process.env.ADAPT_EFFORT || 'on').toLowerCase() === 'on';
}

/**
 * The owner's account may skip anything (config/capabilities.js canSkip), so the
 * too-fast rule never sets its answers aside (config/owner.js isOwner).
 */
function ownerExempt(userId) {
  // eslint-disable-next-line global-require
  const owner = require('../config/owner');
  return owner.isOwner(owner.userOf(userId));
}

function maxReserve() {
  const n = Number(process.env.ADAPT_MAX_RESERVE);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

/**
 * P8 (evidence article 03, mechanism 39; RAPID_ITEM_RELATIVE, default on): the
 * item-relative rapid line. A fixed 1.2 s misses skimming on a long item, so
 * once an item (bank.itemKey) has OBJ_RAPID_MIN_N (30) timed answers across all
 * learners, an answer is rapid below max(OBJ_RAPID_MS, OBJ_RAPID_REL (0.10) x
 * that item's median time). Until then, and with the switch off, the line is
 * OBJ_RAPID_MS. Response-time thresholds relative to the item: kong2007,
 * soland2021, wise2009, wise2017. Read by coverage (answersFor -> fold), the
 * scored-sitting rule (screen) and the slow-down note.
 */
function relativeOn() {
  return String(process.env.RAPID_ITEM_RELATIVE || 'on').toLowerCase() !== 'off';
}

function relKnobs() {
  const num = (name, fallback) => {
    const v = Number(process.env[name]);
    return process.env[name] !== undefined && process.env[name] !== '' && Number.isFinite(v) ? v : fallback;
  };
  return { REL: num('OBJ_RAPID_REL', 0.1), MIN_N: num('OBJ_RAPID_MIN_N', 30), TTL_MS: num('OBJ_RAPID_CACHE_MS', 10 * 60 * 1000) };
}

let typicalCache = null;
let typicalBuilds = 0; // how many times the map was built (tests: once per TTL, never per answer)
/** itemKey -> median ms over every learner's timed answers (answered, not set aside); rebuilt every TTL. */
function typicalTimes() {
  // No environment read on a hit: process.env is slow on Windows, and this runs once per answer read.
  if (typicalCache && Date.now() - typicalCache.at < typicalCache.ttl) return typicalCache.map;
  const { TTL_MS } = relKnobs();
  typicalBuilds++;
  const rows = typeof db.all === 'function' ? db.all('items') : db.find('items', () => true);
  const lists = new Map();
  for (const i of rows) {
    const ms = Number(i.ms);
    if (!(ms > 0) || i.reserved || i.correct === null || i.correct === undefined) continue;
    const key = bank.itemKey(i);
    if (!key) continue;
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key).push(ms);
  }
  // Only items with enough timed answers are kept: the rest use the fixed line,
  // and an empty map lets rapidLine() skip the item key entirely.
  const { MIN_N } = relKnobs();
  const map = new Map();
  for (const [key, list] of lists) {
    if (list.length < MIN_N) continue;
    list.sort((a, b) => a - b);
    const m = list.length;
    map.set(key, { n: m, median: m % 2 ? list[(m - 1) / 2] : (list[m / 2 - 1] + list[m / 2]) / 2 });
  }
  typicalCache = { at: Date.now(), ttl: TTL_MS, map };
  return map;
}

/**
 * The item's own line in ms, or 0 when it has none (too few timed answers, the
 * switch off, the owner). coverage.answersFor calls this once per answer.
 */
function itemLine(item) {
  if (!item) return 0;
  const map = typicalTimes();
  if (!map.size) return 0;
  const t = map.get(bank.itemKey(item));
  if (!t || !relativeOn()) return 0;
  // The owner gets the base app (config/owner.js ownerBase): the fixed line.
  // eslint-disable-next-line global-require
  if (item.user_id && require('../config/owner').ownerBase(item.user_id)) return 0;
  return Math.round(relKnobs().REL * t.median);
}

/** The rapid line for this item, in ms: never below OBJ_RAPID_MS. */
function rapidLine(item) {
  return Math.max(coverage.knobs().RAPID_MS, itemLine(item));
}

function resetTypicalTimes() {
  typicalCache = null;
}

/** A scored sitting: a checkpoint or the Final, worked on the learner's own level. */
function scored(session) {
  return curriculum.isCheckpoint(session.kind) && !session.preview;
}

/**
 * A parallel question for a set-aside one: the same skill, difficulty, format
 * where the skill allows it, level, block and place; never one this learner
 * has already been asked.
 */
function parallel({ userId, session, item }) {
  const avoid = new Set(db.find('items', (i) => i.user_id === userId && i.skill_id === item.skill_id)
    .slice(-600).map((i) => bank.itemKey(i)));
  avoid.add(bank.itemKey(item));
  let any = null;
  let fresh = null;
  // The same school grade as the set-aside question (config/grade-skills.js).
  const grade = session && session.track_id && session.grade_id ? curriculum.getGrade(session.track_id, session.grade_id) : null;
  const school = grade ? require('../config/grade-skills').schoolGrade(grade) : null;
  for (let attempt = 0; attempt < 10 && !fresh; attempt++) {
    const q = bank.generate({
      skillId: item.skill_id,
      difficulty: item.difficulty || 5,
      seed: `${item.skill_id}:${item.difficulty}:parallel:${item.id}:${attempt}:${Math.random()}`,
      avoid,
      school: school === null ? undefined : school,
    });
    if (!any) any = q;
    if (!avoid.has(bank.itemKey(q)) && (!item.format || q.format === item.format || attempt >= 5)) fresh = q;
  }
  const q = fresh || any;
  return db.insert('items', {
    ...q,
    session_id: session.id,
    user_id: userId,
    role: item.role || 'exam',
    level: item.level,
    block: item.block === undefined ? 0 : item.block,
    // Its place in the sitting is the set-aside question's place.
    index: item.index,
    ...(item.objective_id ? { objective_id: item.objective_id } : {}),
    ...(item.band !== undefined ? { band: item.band, band_level: item.band_level } : {}),
    parallel_of: item.parallel_of || item.id,
    reserve_count: (Number(item.reserve_count) || 0) + 1,
    user_answer: null,
    correct: null,
    ms: null,
    coach_used: false,
  });
}

/**
 * Before an answer on a scored sitting is graded. Returns null to grade it as
 * usual, or {replacement} when it was too fast to count: the answer is kept on
 * the item as set aside (`reserved`), and the replacement takes its place.
 */
function screen({ userId, session, item, userAnswer, ms }) {
  if (!enabled() || !scored(session) || item.role === 'retention' || ownerExempt(userId)) return null;
  if (item.user_answer !== null && item.user_answer !== undefined) return null;
  const rule = adaptation.sittingRule({ ms: Number(ms) || 0, rapidMs: rapidLine(item) }, Number(item.reserve_count) || 0, { maxReserve: maxReserve() });
  if (rule !== 'reserve') return null;
  db.update('items', item.id, {
    user_answer: String(userAnswer == null ? '' : userAnswer),
    ms: Number(ms) || 0,
    reserved: true,
    reserved_at: new Date().toISOString(),
    correct: null,
  });
  return { replacement: parallel({ userId, session, item: db.byId('items', item.id) }) };
}

/**
 * After an answer is recorded: a slow-down note when it was rapid and this
 * learner's own record flags rushing. The flag is read once per sitting, on
 * the first rapid answer, and kept on the session row.
 */
function slowDown({ userId, session, ms, item = null }) {
  if (!enabled() || ownerExempt(userId)) return null;
  const t = Number(ms) || 0;
  if (!(t > 0 && t < (item ? rapidLine(item) : coverage.knobs().RAPID_MS))) return null;
  let flag = session.effort_flag || null;
  if (!flag) {
    const enrollment = session.enrollment_id ? db.byId('enrollments', session.enrollment_id) : null;
    const e = enrollment ? adaptation.effortFor({ userId, enrollment }) : null;
    flag = { flagged: !!(e && e.flagged), share: e ? Number(e.share.toFixed(3)) : 0, answers: e ? e.answers : 0, at: new Date().toISOString() };
    db.update('sessions', session.id, { effort_flag: flag });
  }
  return flag.flagged ? { message: SLOW_DOWN, share: flag.share } : null;
}

module.exports = {
  TOO_FAST,
  SLOW_DOWN,
  enabled,
  maxReserve,
  scored,
  parallel,
  screen,
  slowDown,
  rapidLine,
  itemLine,
  typicalBuildCount: () => typicalBuilds,
  relativeOn,
  resetTypicalTimes,
};
