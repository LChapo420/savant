/** Worker started by probe.js: when the main thread stops answering, record where it is (Debugger.pause through the inspector). */
const inspector = require('inspector');
const fs = require('fs');
const { workerData, parentPort } = require('worker_threads');

let beat = Date.now();
parentPort.on('message', () => { beat = Date.now(); });
const s = new inspector.Session();
s.connectToMainThread();
s.post('Debugger.enable');
const seen = {};
s.on('Debugger.paused', (m) => {
  const frames = (m.params.callFrames || []).slice(0, 8).map((f) => `${f.functionName || '(anon)'} ${String(f.url).replace(/^.*beta-load[\/]/, '')}:${f.location.lineNumber + 1}`);
  const k = frames.join(' < ');
  seen[k] = (seen[k] || 0) + 1;
  fs.appendFileSync(workerData.file, `${JSON.stringify({ t: Date.now(), stale_ms: Date.now() - beat, frames })}\n`);
  s.post('Debugger.resume');
});
setInterval(() => { if (Date.now() - beat > workerData.staleMs) s.post('Debugger.pause'); }, workerData.staleMs);
