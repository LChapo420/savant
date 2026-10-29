// Child-process extraction limits: a worker that loops, one that eats memory, one that crashes, and the real path.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseInChild } = require('../services/material-runner');
const materials = require('../services/materials');

let failed = 0;
function ok(cond, name) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failed++; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mat-runner-'));
function worker(name, body) { const p = path.join(dir, name); fs.writeFileSync(p, body); return p; }

(async () => {
  const hang = worker('hang.js', "process.once('message', () => { for (;;) {} });");
  const t0 = Date.now();
  let r = await parseInChild('pdf', Buffer.from('x'), { worker: hang, timeoutMs: 800 });
  ok(r.code === 'timeout' && /too long/.test(r.error), 'a worker that loops forever is stopped at the time limit');
  ok(Date.now() - t0 < 5000, 'and the server is back within seconds');

  const hog = worker('hog.js', "process.once('message', () => { const a = []; for (;;) a.push(new Array(1e6).fill(1)); });");
  r = await parseInChild('pdf', Buffer.from('x'), { worker: hog, timeoutMs: 20000, heapMb: 64 });
  ok(r.error && (r.code === 'crashed' || r.code === 'timeout'), 'a worker that eats memory dies at the heap cap');
  ok(r.code === 'crashed', 'and is reported as a crash, not a timeout');

  const crash = worker('crash.js', "process.once('message', () => process.exit(3));");
  r = await parseInChild('docx', Buffer.from('x'), { worker: crash });
  ok(r.code === 'crashed', 'a worker that exits without an answer is reported, not hung');

  const alive = await new Promise((res) => setImmediate(() => res(true)));
  ok(alive, 'the parent process is still running');

  r = await parseInChild('pdf', Buffer.from('not a pdf at all'));
  ok(r.error && r.code === 'unreadable', 'the real worker refuses a damaged PDF');

  r = await materials.extract(Buffer.from('%PDF-1.4\nthis is not really a pdf'));
  ok(r.error && r.code === 'unreadable', 'extract() goes through the worker and returns the plain error');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed ? `${failed} FAILED` : 'All material runner checks passed');
  process.exit(failed ? 1 : 0);
})();
