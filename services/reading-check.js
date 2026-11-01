/**
 * The reading check: a few minutes of vocabulary in context and short passages, adaptive across reading levels, that measures
 * the learner's language level (the scorecard's vocabulary_ceiling) directly. Nothing else in the app measures it: the
 * scorecard otherwise reads it off the answers (wordier questions against plainer ones), which the recovery simulation
 * recovers only weakly. A designed test of about ten points' error moves it to r 0.85 with one check and 0.95 with four per 100
 * levels (curriculum-build/SCORECARD-RESEARCH-2026-10-22.md 7.5).
 *
 *   content/reading-check-bank.json   the items, each with a level on a reading-grade scale calibrated by two blind judges
 *                                     (scripts/reading-bank-build.js)
 *   reading_checks                    one row per offer taken, declined or open, per learner
 *
 * How a check runs. The learner's ability is a belief over reading grades 0.5 to 14 (a grid), starting from what their age
 * leads us to expect. Each item is the unused one nearest the current estimate (alternating vocabulary and passages, and
 * picked among the nearest few by a seeded draw so two checks do not repeat), answered by its key, and the belief is
 * updated with a four-choice model: P(right) = 0.25 + 0.75 x logistic((ability - level) / 1.1). The check stops after 10
 * items when the estimate is tight (a standard error of 1.3 grades or less), else after 12. "I don't know" counts as a miss.
 *
 * What it writes. One observation on vocabulary_ceiling through the scorecard's existing evidence path
 * (scorecard/hooks.js onReadingCheck -> scorecard.observe, a designed test: weight 4, test true, the same standing as a
 * placement), never a value written into the card. The score is relative to age: the reading grade the learner reaches
 * against the grade their age leads us to expect, 12.5 points a grade, 50 when level. A check answered in a rush (four items
 * under two seconds) is kept but not fed.
 *
 * When it is offered. Once at onboarding (skippable), then at most one more each 25 levels finished (four in 100, the
 * sim's --reading-test=4): a slot is used up by a check taken or declined. READING_CHECK=off hides it everywhere.
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const BANK_FILE = path.join(__dirname, '..', 'content', 'reading-check-bank.json');
const ITEMS_MIN = 10;
const ITEMS_MAX = 12;
const SE_STOP = 1.3;
const GUESS = 0.25;
const SLOPE = 1.1;              // grades per logit
const PRIOR_SD = 3;
const LEVELS_PER_CHECK = 25;
const RUSH_MS = 2000;
const RUSH_LIMIT = 4;
const POINTS_PER_GRADE = 12.5;
const GRID = Array.from({ length: 136 }, (_, i) => 0.5 + i * 0.1); // 0.5 .. 14.0

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const enabled = () => String(process.env.READING_CHECK || 'on').toLowerCase() !== 'off';

let bankCache = null;
function bank() {
  if (!bankCache) bankCache = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
  return bankCache;
}
const byId = () => new Map(bank().items.map((i) => [i.id, i]));

/** What the learner sees: no key, no calibration. */
function publicItem(item, position) {
  return {
    id: item.id, position, type: item.type,
    ...(item.type === 'vocab' ? { passage: item.context } : { passage: item.passage }),
    prompt: item.prompt, choices: item.choices,
  };
}

// ── age and the reading grade it leads us to expect ──────────────────────────
function ageOf(user, now = new Date()) {
  const ym = user && user.age_check && /^(\d{4})-(\d{2})$/.exec(String(user.age_check.birth_ym || ''));
  if (!ym) return null;
  const y = now.getUTCFullYear() - Number(ym[1]);
  return now.getUTCMonth() + 1 <= Number(ym[2]) ? y - 1 : y;
}
/** The reading grade an age leads us to expect (learning-spec's base: age less five, 1 to 12; 9 when the age is unknown). */
function expectedGrade(age) {
  return age === null || age === undefined ? 9 : clamp(age - 5, 2, 12);
}

// ── the ability model ───────────────────────────────────────────────────────
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const pRight = (theta, level) => GUESS + (1 - GUESS) * sigmoid((theta - level) / SLOPE);

function priorFor(expected) {
  const w = GRID.map((t) => Math.exp(-0.5 * ((t - expected) / PRIOR_SD) ** 2));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

function posterior(expected, answers, items) {
  let post = priorFor(expected);
  for (const a of answers) {
    const item = items.get(a.item_id);
    if (!item) continue;
    post = post.map((p, i) => p * (a.correct ? pRight(GRID[i], item.level) : 1 - pRight(GRID[i], item.level)));
    const s = post.reduce((x, y) => x + y, 0) || 1;
    post = post.map((p) => p / s);
  }
  return post;
}

function estimate(post) {
  const mean = post.reduce((a, p, i) => a + p * GRID[i], 0);
  const sd = Math.sqrt(post.reduce((a, p, i) => a + p * (GRID[i] - mean) ** 2, 0));
  return { grade: Number(mean.toFixed(2)), se: Number(sd.toFixed(2)) };
}

/** A repeatable draw in [0, 1) from a string. */
function draw(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

/** The next item: unused, nearest the estimate, the other type from the last when it is nearly as close, a seeded pick among the best three. */
function pickNext(row, theta) {
  const used = new Set(row.answers.map((a) => a.item_id));
  const last = row.answers.length ? byId().get(row.answers[row.answers.length - 1].item_id) : null;
  const ranked = bank().items.filter((i) => !used.has(i.id))
    .map((i) => ({ i, d: Math.abs(i.level - theta) + (last && last.type === i.type ? 0.35 : 0) }))
    .sort((a, b) => a.d - b.d || a.i.id.localeCompare(b.i.id))
    .slice(0, 3);
  if (!ranked.length) return null;
  return ranked[Math.floor(draw(`${row.id}:${row.answers.length}`) * ranked.length)].i;
}

// ── the slots: when a check is offered ───────────────────────────────────────
function levelsDone(userId) {
  return db.find('enrollments', (e) => e.user_id === userId).reduce((n, e) => n + (e.levels_completed || 0), 0);
}
const rowsOf = (userId) => db.find('reading_checks', (r) => r.user_id === userId);
const usedSlots = (userId) => rowsOf(userId).filter((r) => r.status === 'done' || r.status === 'declined').length;

/** { offer: 'onboarding' | 'periodic' | null, taken, last } for the screens that offer it. */
function status(userId) {
  // A learner under their consent age gets no new data collection unless a parent agreed to it (services/boosters.js allowed).
  const who = db.byId('users', userId);
  if (who && !require('./boosters').allowed(who)) return { enabled: enabled(), offer: null, open: null, taken: 0, levels: 0, items: `${ITEMS_MIN} to ${ITEMS_MAX}`, minutes: 4, last: null, not_allowed: true }; // eslint-disable-line global-require
  const rows = rowsOf(userId);
  const done = rows.filter((r) => r.status === 'done');
  const last = done.length ? done[done.length - 1] : null;
  const open = rows.find((r) => r.status === 'open') || null;
  const slots = usedSlots(userId);
  const levels = levelsDone(userId);
  const allowed = 1 + Math.floor(levels / LEVELS_PER_CHECK);
  let offer = null;
  if (enabled() && !open) {
    if (slots === 0) offer = 'onboarding';
    else if (slots < allowed) offer = 'periodic';
  }
  return {
    enabled: enabled(), offer, open: open ? open.id : null, taken: done.length, levels,
    items: `${ITEMS_MIN} to ${ITEMS_MAX}`, minutes: 4,
    last: last ? { grade: last.result.grade, score: last.result.score, at: last.finished_at, fed: last.result.fed } : null,
  };
}

// ── running a check ──────────────────────────────────────────────────────────
function start(user, { kind = 'onboarding' } = {}) {
  if (!enabled()) return { error: 'The reading check is switched off.', code: 'off' };
  if (!require('./boosters').allowed(user)) return { error: 'Not available for this account.', code: 'off' }; // eslint-disable-line global-require
  const open = rowsOf(user.id).find((r) => r.status === 'open');
  const age = ageOf(user);
  let row = open;
  if (!row) {
    row = db.insert('reading_checks', {
      user_id: user.id, kind: kind === 'periodic' ? 'periodic' : 'onboarding', status: 'open', started_at: new Date().toISOString(),
      expected_grade: expectedGrade(age), age, levels_at_start: levelsDone(user.id), answers: [], result: null, finished_at: null,
    });
  }
  return next(row);
}

/** The next item for an open check, or the finished result. */
function next(row) {
  const items = byId();
  const post = posterior(row.expected_grade, row.answers, items);
  const est = estimate(post);
  const n = row.answers.length;
  if (n >= ITEMS_MAX || (n >= ITEMS_MIN && est.se <= SE_STOP)) return { done: true, ...finish(row, est) };
  const item = pickNext(row, n === 0 ? Math.max(1, row.expected_grade - 1) : est.grade);
  if (!item) return { done: true, ...finish(row, est) };
  return { done: false, session_id: row.id, position: n + 1, min: ITEMS_MIN, max: ITEMS_MAX, item: publicItem(item, n + 1) };
}

/** choice: 0 to 3, or null for "I don't know". Graded here against the key. */
function answer(user, sessionId, itemId, choice, ms = 0) {
  const row = db.findOne('reading_checks', (r) => r.id === Number(sessionId) && r.user_id === user.id);
  if (!row) return { error: 'That check was not found.', code: 'not_found' };
  if (row.status !== 'open') return { error: 'That check is finished.', code: 'closed' };
  const item = byId().get(String(itemId || ''));
  if (!item) return { error: 'No such question.', code: 'bad_item' };
  if (row.answers.some((a) => a.item_id === item.id)) return { error: 'That question was already answered.', code: 'repeat' };
  const given = Number.isInteger(choice) && choice >= 0 && choice < item.choices.length ? choice : null;
  const answers = [...row.answers, { item_id: item.id, level: item.level, type: item.type, choice: given, correct: given === item.answer, ms: clamp(Number(ms) || 0, 0, 600000) }];
  const saved = db.update('reading_checks', row.id, { answers });
  return next(saved);
}

function finish(row, est) {
  const rushed = row.answers.filter((a) => a.ms > 0 && a.ms < RUSH_MS && a.choice !== null).length;
  const effort = rushed < RUSH_LIMIT;
  const age = row.age;
  const expected = row.expected_grade;
  const score = Math.round(clamp(50 + POINTS_PER_GRADE * (est.grade - expected), 0, 100));
  const right = row.answers.filter((a) => a.correct).length;
  const result = {
    grade: est.grade, se: est.se, score, expected_grade: expected, age, right, asked: row.answers.length, rushed,
    fed: false, band: bandOf(est.grade - expected),
  };
  // Feed the scorecard through its evidence path: a rushed check is kept for the record and not counted.
  if (effort && row.status === 'open') {
    try {
      // eslint-disable-next-line global-require
      const hooks = require('./scorecard/hooks');
      hooks.onReadingCheck(row.user_id, result);
      result.fed = true;
    } catch (err) { console.warn(`reading-check: scorecard not updated: ${err.message}`); }
  }
  if (row.status === 'open') db.update('reading_checks', row.id, { status: 'done', result, finished_at: new Date().toISOString() });
  db.flush();
  const stored = db.byId('reading_checks', row.id);
  return { result: stored.result };
}

function bandOf(diff) {
  if (diff >= 2) return 'well above what is usual for your age';
  if (diff >= 0.75) return 'above what is usual for your age';
  if (diff > -0.75) return 'about what is usual for your age';
  if (diff > -2) return 'a little below what is usual for your age';
  return 'below what is usual for your age';
}

/** "Not now": the offer is used up (the next one waits for another 25 levels). */
function decline(user, kind = 'onboarding') {
  const open = rowsOf(user.id).find((r) => r.status === 'open');
  if (open) db.update('reading_checks', open.id, { status: 'declined', finished_at: new Date().toISOString() });
  else db.insert('reading_checks', { user_id: user.id, kind: kind === 'periodic' ? 'periodic' : 'onboarding', status: 'declined', started_at: new Date().toISOString(), finished_at: new Date().toISOString(), answers: [], result: null });
  return status(user.id);
}

/** Checks the bank can be trusted: used by the tests and the build script. Returns a list of problems. */
function validateBank(b = bank()) {
  const problems = [];
  const ids = new Set();
  const prompts = new Set();
  const pos = [0, 0, 0, 0];
  for (const i of b.items || []) {
    if (ids.has(i.id)) problems.push(`${i.id}: duplicate id`);
    ids.add(i.id);
    if (!['vocab', 'passage'].includes(i.type)) problems.push(`${i.id}: type`);
    if (!Array.isArray(i.choices) || i.choices.length !== 4 || new Set(i.choices.map((c) => String(c).toLowerCase())).size !== 4) problems.push(`${i.id}: four distinct choices`);
    if (!(Number.isInteger(i.answer) && i.answer >= 0 && i.answer < 4)) problems.push(`${i.id}: answer index`); else pos[i.answer]++;
    if (!(i.level >= 1 && i.level <= 13)) problems.push(`${i.id}: level`);
    const text = i.type === 'vocab' ? i.context : i.passage;
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    if (i.type === 'vocab' && (words < 5 || words > 60 || !i.target || !new RegExp(i.target.replace(/[^\w]/g, ''), 'i').test(i.context))) problems.push(`${i.id}: vocabulary context`);
    if (i.type === 'passage' && (words < 25 || words > 220)) problems.push(`${i.id}: passage length ${words}`);
    if (!String(i.prompt || '').trim()) problems.push(`${i.id}: prompt`);
    const key = `${String(text).slice(0, 60)}|${i.prompt}`;
    if (prompts.has(key)) problems.push(`${i.id}: duplicate question`);
    prompts.add(key);
    if (!i.judged || Object.keys(i.judged).length < 2) problems.push(`${i.id}: calibration by two judges`);
    else { const v = Object.values(i.judged); if (Math.abs(v[0] - v[1]) > 1.0001) problems.push(`${i.id}: judges more than one grade apart`); }
  }
  return { problems, positions: pos };
}

module.exports = {
  ITEMS_MIN, ITEMS_MAX, SE_STOP, LEVELS_PER_CHECK, GRID,
  bank, publicItem, ageOf, expectedGrade, pRight, posterior, estimate, pickNext,
  status, start, answer, decline, validateBank, enabled,
};
