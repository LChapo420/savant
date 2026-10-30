/**
 * One material build at a time per learner. A study pack, a learning path, a podcast and a path change for
 * the same learner all use the same free models; started together they starved each other (a real-model run,
 * 30 Oct: the pack failed after 300 s while lesson calls took 60-150 s each). So the second waits its turn here
 * and the page shows "queued" until it starts.
 *
 *   run(userId, label, fn, { onStart })  waits for this learner's earlier builds, then runs fn; resolves with fn's value
 *   queuedFor(userId, label)             true while that build is waiting (not yet running)
 *   state(userId)                        { running, waiting: [labels] } for the page
 */
const lanes = new Map(); // userId -> { running: label|null, waiting: [{ label, go }] }

const lane = (userId) => {
  if (!lanes.has(userId)) lanes.set(userId, { running: null, waiting: [] });
  return lanes.get(userId);
};

function next(userId) {
  const l = lane(userId);
  if (l.running) return;
  const n = l.waiting.shift();
  if (!n) { lanes.delete(userId); return; }
  l.running = n.label;
  n.go();
}

function run(userId, label, fn, { onStart } = {}) {
  return new Promise((resolve, reject) => {
    const l = lane(userId);
    const go = async () => {
      try { if (onStart) onStart(); } catch { /* a status write must not stop the build */ }
      try { resolve(await fn()); } catch (err) { reject(err); } finally {
        const cur = lanes.get(userId);
        if (cur) cur.running = null;
        next(userId);
      }
    };
    l.waiting.push({ label, go });
    next(userId);
  });
}

const queuedFor = (userId, label) => !!(lanes.get(userId) && lanes.get(userId).waiting.some((w) => w.label === label));

function state(userId) {
  const l = lanes.get(userId);
  return l ? { running: l.running, waiting: l.waiting.map((w) => w.label) } : { running: null, waiting: [] };
}

/** Would a new build for this learner have to wait? */
const busy = (userId) => { const l = lanes.get(userId); return !!(l && (l.running || l.waiting.length)); };

module.exports = { run, queuedFor, state, busy };
