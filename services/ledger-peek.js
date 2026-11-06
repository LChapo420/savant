/**
 * A cheap read of a spend ledger for the "is there room?" question, which the model pool asks of every paid slot, for every waiting
 * call, several times a second. Each ledger is a 250 KB JSON file, so reading and parsing it each time took the event loop away from
 * learners (beta load test, Nov 2026). The parsed file is reused until the file changes (mtime or size, one stat per peek).
 *
 * Only for that question. A reservation still reads the file under its lock, so a stale peek can never spend past a cap. The returned
 * object is shared: do not change it.
 */
const fs = require('fs');

const kept = new Map(); // file -> { mtimeMs, size, data }

/**
 * @param {string} file
 * @param {Function} readFresh  the ledger's own read(): keeps its checks and its errors. Its result is what is kept.
 */
function peek(file, readFresh) {
  let st = null;
  try { st = fs.statSync(file); } catch { st = null; }
  const hit = kept.get(file);
  if (hit && st && st.mtimeMs === hit.mtimeMs && st.size === hit.size) return hit.data;
  const data = readFresh(); // throws as the ledger's read does: never kept
  if (st) kept.set(file, { mtimeMs: st.mtimeMs, size: st.size, data });
  else kept.delete(file);
  return data;
}

/** Tests: forget everything. */
function clear() { kept.clear(); }

module.exports = { peek, clear };
