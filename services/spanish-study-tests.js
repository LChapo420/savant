/**
 * Sealed pre and post tests for the Savant vs Duolingo study (docs/yc/DUOLINGO-STUDY-PROTOCOL.md).
 *
 * One engine and one hash-chained log per participant (data/spanish-study-tests/u<id>/log.jsonl), built from the
 * copied engine in spanish-study-tests/ (never from the founder's spanish-check/, which this file does not touch).
 * Sitting 1 is the pre-test (study day 0 or 1), sitting 2 the post-test (the last study day or later). A finished
 * sitting is written to the study with `recordTest`: the listening dictation as a score out of 100 (chance 0) and the
 * everyday-sentence reading test as correct out of its items (chance 0.25).
 * Nothing here calls a model or spends money.
 */
const fs = require('fs');
const path = require('path');
const { Engine, HttpError } = require('../spanish-study-tests/engine');
const study = require('./spanish-study');

const DIR = process.env.SPANISH_STUDY_TESTS_DIR || path.join(__dirname, '..', 'data', 'spanish-study-tests');
const PRE_LAST_STUDY_DAY = 1;   // the pre-test must come on day 0 or day 1, before the arms have studied much
const PHASE_BY_SLOT = ['pre', 'post'];

let engineOpts = {};
const engines = new Map();
/** Test hook: options for new engines (resultsDir root, pool, beacon, clock). Clears the cache. */
function configure(opts) { engineOpts = opts || {}; engines.clear(); }

function engineFor(userId) {
  let e = engines.get(userId);
  if (!e) {
    const dir = path.join(engineOpts.dir || DIR, `u${Number(userId)}`);
    e = new Engine({ anchorEnabled: false, ...engineOpts.engine, resultsDir: dir }).init();
    engines.set(userId, e);
  }
  return e;
}

const nowOf = () => (engineOpts.now ? engineOpts.now() : Date.now());

function entryOrThrow(userId) {
  const entry = study.getEntry(userId);
  if (!entry) throw new HttpError(404, 'You are not in the study.');
  return entry;
}

/** What the participant may do today: 'pre', 'post', or null with the reason. */
function phaseWindow(entry, finished, now) {
  const w = study.windowOf(entry);
  const today = study.isoDay(now);
  if (finished >= PHASE_BY_SLOT.length) return { phase: null, why: 'Both tests are done. Thank you.' };
  if (finished === 0) {
    const last = study.isoDay(w.start + PRE_LAST_STUDY_DAY * 86400000);
    if (today < w.from) return { phase: null, why: `The pre-test opens on ${w.from}.` };
    if (today > last) return { phase: null, why: `The pre-test had to be taken on ${w.from} or ${last}. It cannot be taken later, because by then you have studied.` };
    return { phase: 'pre' };
  }
  if (today < w.to) return { phase: null, why: `The post-test opens on ${w.to}, the last study day.` };
  return { phase: 'post' };
}

/** Copy every finished sitting's scores into the study (idempotent: recordTest keeps the first). */
function sync(userId, engine) {
  const st = engine.state();
  for (const s of st.sittings) {
    if (s.status !== 'finished' || !s.scored) continue;
    const phase = PHASE_BY_SLOT[s.slot];
    if (!phase) continue;                       // a forced extra sitting is logged but never scored into the study
    const taken_at = new Date(s.end_t).toISOString();
    study.recordTest(userId, { test: 'listening', phase, correct: Math.round(s.scored.listening.est * 100), n: 100, chance: 0, taken_at });
    study.recordTest(userId, { test: 'daily', phase, correct: s.scored.reading.correct, n: s.scored.reading.n, chance: 0.25, taken_at });
  }
}

async function status(userId) {
  const entry = entryOrThrow(userId);
  const e = engineFor(userId);
  const st = await e.status();
  sync(userId, e);
  const win = phaseWindow(entry, st.finished, nowOf());
  const out = { seal_ok: st.seal_ok, finished: st.finished, state: st.state, phase: win.phase, why: win.why || null, statement: st.statement, limits: st.limits };
  if (st.state === 'open') Object.assign(out, { sitting_id: st.sitting_id, answered: st.answered, items: st.items });
  if (st.blocked) out.blocked = st.blocked;
  return out;
}

async function start(userId) {
  const entry = entryOrThrow(userId);
  const e = engineFor(userId);
  const st = e.state();
  if (!st.open) {
    const win = phaseWindow(entry, st.finished, nowOf());
    if (!win.phase) throw new HttpError(409, win.why);
  }
  return e.start({ force: false });          // participants can never force: the gap and one-a-day rules always apply
}

function next(userId) {
  entryOrThrow(userId);
  const e = engineFor(userId);
  const out = e.next();
  if (out.done) sync(userId, e);
  return out;
}

function answer(userId, body) {
  entryOrThrow(userId);
  const e = engineFor(userId);
  const out = e.answer(body || {});
  if (out.done) sync(userId, e);
  return out;
}

function visibility(userId, body) { entryOrThrow(userId); return engineFor(userId).visibility(body || {}); }
function abandon(userId, reason) { entryOrThrow(userId); return engineFor(userId).abandon(reason); }
function audioFor(userId, n) { entryOrThrow(userId); return engineFor(userId).audioFor(n); }
function audioInfo(userId, n) { entryOrThrow(userId); return engineFor(userId).audioInfo(n); }

/** Remove a participant's log when their account is deleted (the study rows go with the account elsewhere). */
function removeForUser(userId) {
  engines.delete(userId);
  try { fs.rmSync(path.join(engineOpts.dir || DIR, `u${Number(userId)}`), { recursive: true, force: true }); } catch (err) { /* nothing to remove */ }
}

/** Test hook: the participant's engine, to read what was drawn. */
const _engineForTest = (userId) => engineFor(userId);

module.exports = { _engineForTest, configure, status, start, next, answer, visibility, abandon, audioFor, audioInfo, phaseWindow, sync, removeForUser, HttpError, PRE_LAST_STUDY_DAY };
