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
      gate.run(userId, nLabel, () => pool.runBackground(() => notes.build(userId, id, {}))).catch(warn('notes'));
    }
    const pLabel = `pack:${id}`;
    if (!gate.queuedFor(userId, pLabel)) {
      out.started.push('pack');
      packs.buildWithRetry(userId, id, { between: (fn) => gate.run(userId, pLabel, () => pool.runBackground(fn)) }).catch(warn('pack'));
    }
  } catch (err) {
    console.warn(`material-autobuild: ${err.message}`);
  }
  return out;
}

function reset() { today.clear(); }

module.exports = { start, reset, on };
