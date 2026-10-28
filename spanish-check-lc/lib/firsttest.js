'use strict';
/**
 * What the first sealed test (spanish-check/) has already shown the learner, read READ-ONLY from its log.
 * Used to keep every sentence and every English option the learner met there out of this test.
 * The exclusion is a pure function of (first test's sealed pool, a prefix of its log), so verify.js can re-derive it
 * from the snapshot (seq, head) recorded in each sitting_start. PROTOCOL.md section 5.
 */
const fs = require('fs');
const path = require('path');
const { sha256, normalize } = require('../../spanish-check/lib/common');
const { loadPool } = require('../../spanish-check/lib/draw');
const { replay } = require('../../spanish-check/lib/replay');

const FIRST_DIR = path.join(__dirname, '..', '..', 'spanish-check');
let poolCache = null; let genesisCache = null;

function firstPool(dir = FIRST_DIR) {
  if (!poolCache) poolCache = loadPool(path.join(dir, 'pool.json'));
  return poolCache;
}
function firstGenesis(dir = FIRST_DIR) {
  if (!genesisCache) genesisCache = sha256(fs.readFileSync(path.join(dir, 'SEAL.txt')));
  return genesisCache;
}

function readFirstLog(resultsDir) {
  const p = path.join(resultsDir, 'log.jsonl');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean) : [];
}

/** Snapshot of the first test's log: last line index and the SHA-256 of that line (null when there is no log). */
function snapshot(lines) {
  const seq = lines.length - 1;
  return { seq, head: seq >= 0 ? sha256(lines[seq]) : null };
}

/** The exclusion sets from lines[0..seq] of the first log. */
function exclusionsFrom(lines, seq, dir = FIRST_DIR) {
  const keys = new Set(); const ids = new Set(); const en = new Set();
  if (seq >= 0) {
    const rp = replay(lines.slice(0, seq + 1), firstPool(dir), firstGenesis(dir));
    for (const s of rp.sittings) {
      for (const n of s.served.keys()) {
        const it = s.items[n];
        if (!it) continue;
        keys.add(it.key); ids.add(it.item_id);
        if (it.options) for (const o of it.options) en.add(normalize(o));
      }
    }
  }
  const out = { keys: [...keys].sort(), ids: [...ids].sort((a, b) => a - b), en: [...en].sort() };
  out.sha256 = sha256(JSON.stringify({ keys: out.keys, ids: out.ids, en: out.en }));
  return out;
}

/** Ready-to-use Sets for the draw. */
const toSets = (ex) => ({ keys: new Set(ex.keys), ids: new Set(ex.ids), en: new Set(ex.en) });

module.exports = { FIRST_DIR, readFirstLog, snapshot, exclusionsFrom, toSets };
