#!/usr/bin/env node
/**
 * Write the shared (base) lesson of the most likely start levels ahead, gates on (first-lesson, 6 Nov 2026). The instant layer opens a level's
 * shared lesson at once, so every level a learner can land on needs one. This writes the levels `scripts/base-coverage.js --plan` ranks
 * (or the keys given), the usual way (`blockLevels.write`, userId null, tailored false: layout, fill-out, fact gate with repair, blind key
 * check, all as shipped), a few at a time, and reports seconds, outcome and the paid ledgers' spend per level.
 *
 *   DB_FILE=<copy of the db> node scripts/prewrite-base.js --plan plan.json [--top 20] [--keys math/algebra_1_part_a/465,...]
 *       [--concurrency 3] [--out report.json]
 *
 * ALWAYS a copy of the database (DB_FILE): the live server owns data/db.json. Ledgers are the live ones (same env as the app; RUN_CAP_USD applies).
 * Pipeline-class write (no learner data): cheapest capable paid slots, free first. ZeroGPU's limit of about 5 calls at once is kept by the pool.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.join(__dirname, '..', '..', '.env') });
if (!process.env.DB_FILE) { console.error('DB_FILE must point at a COPY of the database'); process.exit(2); }
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const blockLevels = require('../services/block-levels');
const curriculum = require('../config/curriculum');

const ledgerDir = process.env.LEDGER_DIR || 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
const spent = () => { let t = 0; const by = {}; for (const l of ['coral', 'gonka', 'lyceum', 'grokified', 'munito', 'zerogpu', 'standard-compute']) { try { const v = JSON.parse(fs.readFileSync(path.join(ledgerDir, `${l}-ledger.json`), 'utf8')).settled_usd || 0; by[l] = v; t += v; } catch { /* no ledger */ } } return { t, by }; };

let keys = arg('keys', null) ? String(arg('keys')).split(',') : null;
if (!keys) {
  const plan = JSON.parse(fs.readFileSync(arg('plan'), 'utf8')).plan;
  keys = plan.slice(0, Number(arg('top', 20))).map((p) => p.key);
}
const CONC = Number(arg('concurrency', 3));
const before = spent();
const rows = [];
let next = 0;
async function worker() {
  while (next < keys.length) {
    const key = keys[next++];
    const [trackId, gradeId, lv] = key.split('/'); const level = Number(lv);
    const grade = curriculum.getGrade(trackId, gradeId);
    const t0 = Date.now();
    const row = { key, kind: grade ? blockLevels.kindFor(grade, level) : null };
    try {
      if (blockLevels.findPlan({ userId: null, trackId, gradeId, level })) { row.ok = true; row.note = 'already written'; rows.push(row); continue; }
      const plan = await blockLevels.write({ userId: null, trackId, gradeId, level, tailored: false });
      row.ok = !!(plan && blockLevels.servable(plan));
      row.status = plan && plan.status; row.model = plan && (plan.model || plan.layout_model); row.attempt = plan && plan.attempt;
      row.checks = plan && (plan.checks || []).length; row.blocks = plan && (plan.blocks || []).length;
    } catch (err) { row.ok = false; row.error = String(err && err.message).slice(0, 120); }
    row.sec = Math.round((Date.now() - t0) / 100) / 10;
    rows.push(row);
    console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${key} ${row.sec}s ${row.error || row.note || ''}`);
  }
}
(async () => {
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONC }, worker));
  const after = spent();
  const written = rows.filter((r) => r.ok && !r.note).length;
  const out = { levels: keys.length, written, failed: rows.filter((r) => !r.ok).length, wallSec: Math.round((Date.now() - t0) / 1000), spendUsd: Number((after.t - before.t).toFixed(4)), perWrittenLevelUsd: written ? Number(((after.t - before.t) / written).toFixed(4)) : null, secPerLevelMedian: rows.map((r) => r.sec).filter(Boolean).sort((a, b) => a - b)[Math.floor(rows.length / 2)], rows };
  console.log(JSON.stringify({ ...out, rows: undefined }));
  if (arg('out', null)) fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1));
  process.exit(0);
})();
