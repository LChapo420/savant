/**
 * Password hashing away from the main thread. bcryptjs is plain JavaScript, so a hash takes about 100 ms of the one thread every learner
 * shares: at 100 learners arriving in a minute it was an eighth of the server's time (beta load test, Nov 2026). The same library, the same
 * hashes, in PASSWORD_WORKERS (2) worker threads; 0, or a worker that cannot run, does it on the main thread as before.
 */
const path = require('path');
const bcrypt = require('bcryptjs');

const waiting = new Map();
let seq = 0;
let workers = null;
let next = 0;
// A timer holds the process open while answers are due, or a script awaiting only this would end early; the workers themselves never do.
let keepAlive = null;
function settle() { if (!waiting.size && keepAlive) { clearInterval(keepAlive); keepAlive = null; } }

function start() {
  if (workers) return workers;
  const n = process.env.PASSWORD_WORKERS === undefined ? 2 : Number(process.env.PASSWORD_WORKERS);
  workers = [];
  if (!(n > 0)) return workers;
  try {
    const { Worker } = require('worker_threads'); // eslint-disable-line global-require
    for (let i = 0; i < n; i++) {
      const w = new Worker(path.join(__dirname, 'passwords-worker.js'));
      w.on('message', ({ id, value, error }) => {
        const job = waiting.get(id);
        if (!job) return;
        waiting.delete(id);
        settle();
        if (error) job.inline(); else job.resolve(value);
      });
      w.on('error', () => { workers = workers.filter((x) => x !== w); for (const job of waiting.values()) if (job.w === w) { waiting.delete(job.id); job.inline(); } settle(); });
      w.unref(); // after the listeners: adding one takes a hold on the process again
      workers.push(w);
    }
  } catch { workers = []; }
  return workers;
}

function run(op, a, b) {
  const inline = () => (op === 'hash' ? bcrypt.hash(a, b) : bcrypt.compare(a, b));
  const pool = start();
  if (!pool.length) return inline();
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const w = pool[next++ % pool.length];
    waiting.set(id, { id, w, resolve, inline: () => inline().then(resolve, reject) });
    if (!keepAlive) keepAlive = setInterval(() => {}, 1000);
    w.postMessage({ id, op, a, b });
  });
}

module.exports = {
  hash: (password, rounds) => run('hash', password, rounds),
  compare: (password, hash) => run('compare', password, hash),
};
