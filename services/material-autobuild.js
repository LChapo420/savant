/**
 * Uploads start building when they are added (owner, 3 Nov 2026: nothing a learner waits on is slow; write about twice what makes
 * it instant, no further).
 *
 * When a material is added (paste, link, YouTube, transcript, file) its notes and its study pack (summary, flashcards, quiz and the
 * practice test) start in the background straight away, so they are ready when the learner opens them. Not started here:
 *   - the learning path (course): it is the biggest build, so it waits until the learner opens it or asks for it;
 *   - anything for an account that may not cause an outside model call (no consent), or when no model is ready;
 *   - more than UPLOAD_AUTOBUILD_PER_DAY (6) materials a learner a day (the rest build when opened, as before).
 *
 * Limits kept: the learner's one-build-at-a-time line (services/build-gate.js, the same labels the routes use, so the page shows
 * "queued"), the pack's own token budget and retries. The builds run as background work in the pool (services/pool.js): they leave
 * a free permit for a learner who is waiting and never pay for speed. UPLOAD_AUTOBUILD=off turns this off (the tests do).
 */
const gate = require('./build-gate');
const pool = require('./pool');

const on = () => String(process.env.UPLOAD_AUTOBUILD || '').toLowerCase() !== 'off';
const perDay = () => Math.max(0, Math.floor(Number(process.env.UPLOAD_AUTOBUILD_PER_DAY || 6)));
// The pool lane store of each build started here (account:label), so a learner who opens the page while it is still building turns it
// from background work (free slots only, never pays for speed) into work a learner waits on (the 8 s overflow to a paid slot).
// Found by the 4 Nov walk: notes and the pack took 160 s each on busy free models even though the learner was already looking at them.
const lanes = new Map();
const laneKey = (userId, label) => `${userId}:${label}`;
// A just-uploaded material is something its learner is about to wait on (6 Nov bug sweep: notes took 261 s and the pack 135 s as background
// work on saturated free slots). So by default the build runs in the WAITING lane on the fast lane: a cleared learner's calls go to the paid
// fast slots first, any other call overflows to the cheapest paid slot after 8 s, and free slots are used when they answer. The existing
// consent rule decides who is cleared (req.coral). UPLOAD_BUILD_LANE=background restores the old behaviour (free slots only, never pays).
const waiting = () => String(process.env.UPLOAD_BUILD_LANE || 'waiting').toLowerCase() !== 'background';
const runLane = (fn) => (waiting() ? pool.runForeground(fn, { fast: true }) : pool.runBackground(fn));
const inLane = (userId, label, fn) => runLane(() => {
  const key = laneKey(userId, label);
  lanes.set(key, pool.laneStore());
  return Promise.resolve().then(fn).finally(() => { if (lanes.get(key) === pool.laneStore()) lanes.delete(key); });
});
/** A learner opened the notes or the pack of this material: any build of it still running is now waited on. Returns how many it promoted. */
function promote(userId, materialId, kinds = ['notes', 'pack']) {
  let n = 0;
  for (const kind of kinds) {
    const st = lanes.get(laneKey(userId, `${kind}:${Number(materialId)}`));
    if (st && st.background) { pool.promote(st); n += 1; }
  }
  return n;
}
const today = new Map(); // `${account id}:${day}` -> materials auto-built today
const dayKey = (id) => `${id}:${new Date().toISOString().slice(0, 10)}`;

/**
 * Start the notes and the pack of one material. Never throws, never awaited. Returns what it started (for tests).
 * deps: { ai, notes, packs, outside } for tests.
 */
function start(userId, materialId, deps = {}) {
  const out = { started: [], skipped: null };
  try {
    if (!on()) { out.skipped = 'off'; return out; }
    // eslint-disable-next-line global-require
    const ai = deps.ai || require('./ai');
    if (!ai.isEnabled()) { out.skipped = 'no model'; return out; }
    // eslint-disable-next-line global-require
    const outside = deps.outside || require('./typed-grading').outsideAllowed;
    if (!outside(userId)) { out.skipped = 'no consent'; return out; }
    const k = dayKey(userId);
    if ((today.get(k) || 0) >= perDay()) { out.skipped = 'daily cap'; return out; }
    today.set(k, (today.get(k) || 0) + 1);
    if (today.size > 5000) for (const key of [...today.keys()].slice(0, 2500)) today.delete(key);

    // eslint-disable-next-line global-require
    const notes = deps.notes || require('./material-notes');
    // eslint-disable-next-line global-require
    const packs = deps.packs || require('./material-pack');
    const id = Number(materialId);
    const warn = (what) => (err) => console.warn(`material-autobuild ${what}: ${err.message}`);

    const nLabel = `notes:${id}`;
    if (!gate.queuedFor(userId, nLabel)) {
      out.started.push('notes');
      // The builds run inside the gate's line, and each is background work in its own right (the gate may start it from
      // another build's call chain, so the lane is set around the build itself).
      gate.run(userId, nLabel, () => inLane(userId, nLabel, () => notes.build(userId, id, {}))).catch(warn('notes'));
    }
    const pLabel = `pack:${id}`;
    if (!gate.queuedFor(userId, pLabel)) {
      out.started.push('pack');
      packs.buildWithRetry(userId, id, { between: (fn) => gate.run(userId, pLabel, () => inLane(userId, pLabel, fn)) }).catch(warn('pack'));
    }
  } catch (err) {
    console.warn(`material-autobuild: ${err.message}`);
  }
  return out;
}

function reset() { today.clear(); }

module.exports = { start, reset, on, promote };
