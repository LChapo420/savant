#!/usr/bin/env node
/**
 * One save of the JSON store at a given size: read, parse, stringify (indented and one line), write, fsync, rename. Measured on this PC.
 *   node --max-old-space-size=9000 scripts/beta-load/save-bench.js <file> [<file> ...]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = (fn) => { const t = performance.now(); const v = fn(); return [Math.round(performance.now() - t), v]; };
function boxCpu() { const c = os.cpus(); return c.reduce((a, x) => a + (x.times.user + x.times.sys), 0) / c.reduce((a, x) => a + (x.times.user + x.times.sys + x.times.idle), 0); }
for (const f of process.argv.slice(2)) {
  const out = { file_mb: Math.round(fs.statSync(f).size / 1048576) };
  try {
    const [readMs, text] = ms(() => fs.readFileSync(f, 'utf8'));
    const [parseMs, store] = ms(() => JSON.parse(text));
    out.read_ms = readMs; out.parse_ms = parseMs;
    let line;
    try { const [p] = ms(() => JSON.stringify(store, null, 2)); out.stringify_indented_ms = p; } catch (e) { out.stringify_indented = e.message; }
    try { [out.stringify_one_line_ms, line] = ms(() => JSON.stringify(store)); } catch (e) { out.stringify_one_line = e.message; }
    if (line) {
      const tmp = path.join(os.tmpdir(), `save-bench-${process.pid}.tmp`);
      [out.write_ms] = ms(() => fs.writeFileSync(tmp, line));
      [out.fsync_ms] = ms(() => { const fd = fs.openSync(tmp, 'r+'); fs.fsyncSync(fd); fs.closeSync(fd); });
      fs.unlinkSync(tmp);
    }
    out.heap_mb = Math.round(process.memoryUsage().heapUsed / 1048576);
    out.rss_mb = Math.round(process.memoryUsage().rss / 1048576);
  } catch (e) { out.failed = e.code || e.message.slice(0, 80); }
  out.box_cpu_since_boot = Number(boxCpu().toFixed(2));
  console.log(JSON.stringify(out));
}
