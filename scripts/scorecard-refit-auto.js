/**
 * The real-tester refit from the command line, or from the server's daily timer (services/scorecard/refit-auto.js; docs/SCORECARD-REAL.md part 4).
 *   node scripts/scorecard-refit-auto.js              one run on DB_FILE (default data/db.json), read only; writes candidate, report and state to REFIT_DIR (default data/)
 *   node scripts/scorecard-refit-auto.js --promote    copy a candidate that passed its check to the read-out file. Refuses one that did not.
 * Never edits the database (DB_READONLY=1). Never turns the switch on.
 */
'use strict';
process.env.DB_READONLY = '1';
const A = require('../services/scorecard/refit-auto');

if (process.argv.includes('--promote')) {
  const p = A.promote();
  console.log(p.ok ? `promoted to ${p.file}; set SCORECARD_RECAL=1 to use it` : `not promoted: ${p.why}`);
  process.exit(p.ok ? 0 : 1);
}
const res = A.run(A.dbSource(), { label: process.env.REFIT_LABEL || undefined });
console.log(`refit: ${res.status}; usable ${res.usable}; left out ${JSON.stringify(res.counts)}; report ${res.files.report}`);
