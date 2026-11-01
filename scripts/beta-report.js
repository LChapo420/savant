#!/usr/bin/env node
/**
 * Print (and optionally write) the beta comparison report: tailored vs base (services/beta-compare.js, docs/BETA-COMPARISON.md).
 *
 *   DB_FILE=<path to a copy of db.json> node scripts/beta-report.js [--write] [--assign-eligible] [--json]
 *
 * It refuses to run without DB_FILE, so it can never open the live data file by accident. The learner database is read only
 * (DB_READONLY) unless --assign-eligible is given, which draws arms for every learner who would be drawn at first use and is meant for
 * a COPY of the data. --aa gives every real learner in the copy a pretend arm IN MEMORY ONLY (seeded 20% base, drawn from the account's
 * own sign-up date, age screen ignored) so the whole pipeline can be run on history (--include-test also counts the test and demo accounts, which are most of a development copy). Everyone in that history had the same product, so it is an
 * A/A test: a sound method finds no difference. --write also writes data/beta-report.json (or BETA_REPORT_FILE). No model is called.
 */
if (!process.env.DB_FILE) {
  console.error('Set DB_FILE to a copy of the database (this script never opens data/db.json itself).');
  process.exit(2);
}
if (!process.argv.includes('--assign-eligible')) process.env.DB_READONLY = '1';
const AA = process.argv.includes('--aa');
const INCLUDE_TEST = process.argv.includes('--include-test'); // with --aa: count test and demo accounts too (the copy is mostly scripted test learners)
if (AA && process.argv.includes('--assign-eligible')) { console.error('--aa and --assign-eligible do not mix.'); process.exit(2); }

const db = require('../config/db');
const arm = require('../services/beta-arm');
const beta = require('../services/beta-compare');

if (process.argv.includes('--assign-eligible')) {
  let drawn = 0;
  for (const u of db.all('users').slice()) if (!u.beta_arm && arm.ensure(u)) drawn++;
  db.flush();
  console.error(`Drew arms for ${drawn} learners on ${db.path}`);
}
let report;
if (AA) {
  const { mulberry32 } = require('./beta-compare-sim');
  const rnd = mulberry32(7);
  const m = require('../services/real-user-metrics');
  const rules = m.rules();
  const users = db.all('users').filter((u) => INCLUDE_TEST || m.classify(u, rules).group === 'real').map((u) => ({ ...u, beta_arm: { arm: rnd() < 0.2 ? 'base' : 'tailored', assigned_at: u.created_at, stratum: 'aa' } }));
  report = beta.buildReport({ users, sessions: db.all('sessions'), events: db.all('events'), now: Date.now(), share: 0.2 });
} else report = beta.compute();
if (process.argv.includes('--write')) console.error(`Wrote ${beta.writeReport(report)}`);
if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const e = report.enrolment;
console.log(`Beta comparison, ${report.generated_at}`);
console.log(`In the comparison: ${e.in_comparison} (tailored ${e.by_arm.tailored}, base ${e.by_arm.base}); left out of the numbers: ${JSON.stringify(e.left_out_of_numbers)}`);
console.log(`Summary: ${report.summary}\n`);
for (const o of report.outcomes) {
  console.log(`${o.primary ? '[PRIMARY] ' : ''}${o.label}: tailored n=${o.tailored.n} ${o.tailored.estimate}, base n=${o.base.n} ${o.base.estimate}`
    + (o.diff ? `, difference ${o.diff.estimate} [${o.diff.lo}, ${o.diff.hi}]` : '') + ` -> ${o.status}`);
}
process.exit(0);
