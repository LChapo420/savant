/**
 * Runs PDF and Word text extraction in a child process, so a hostile or pathological file can hang or
 * exhaust memory in the child only. The child is killed after a time limit and runs with a heap cap;
 * either way the learner gets a plain message and the server carries on.
 */
const { fork } = require('child_process');
const path = require('path');
const { fail } = require('./material-parsers');

const TIMEOUT_MS = 60 * 1000;   // generous for 300 pages; a looping file is cut off here
const HEAP_MB = 1024;           // old-space cap for the child

const FAILED = 'That file took too long or too much memory to read, so it was stopped. Try a smaller or simpler file.';

function parseInChild(kind, buf, opts = {}) {
  const timeoutMs = opts.timeoutMs || TIMEOUT_MS;
  const heapMb = opts.heapMb || HEAP_MB;
  const worker = opts.worker || path.join(__dirname, 'material-worker.js');
  return new Promise((resolve) => {
    let done = false;
    let child;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child && child.kill('SIGKILL'); } catch { /* already gone */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish(fail(FAILED, 'timeout')), timeoutMs);
    try {
      child = fork(worker, [], {
        execArgv: [`--max-old-space-size=${heapMb}`],
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { PATH: process.env.PATH },
      });
    } catch {
      return finish(fail('That file could not be read right now.', 'unreadable'));
    }
    child.once('message', (out) => finish(out && typeof out === 'object' ? out : fail(FAILED, 'unreadable')));
    child.once('error', () => finish(fail('That file could not be read right now.', 'unreadable')));
    child.once('exit', () => finish(fail(FAILED, 'crashed')));
    child.send({ kind, data: buf }, (err) => { if (err) finish(fail('That file could not be read right now.', 'unreadable')); });
  });
}

module.exports = { parseInChild, TIMEOUT_MS, HEAP_MB };
