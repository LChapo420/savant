#!/usr/bin/env node
/**
 * The real-user metrics (the admin page's #metrics view) from a data file, without
 * running the server. Read-only: the file is never written.
 *
 *   node scripts/metrics-report.js --data data/db.json
 *   node scripts/metrics-report.js --data data/db.json --csv-dir <folder> [--days 60] [--ledgers data] [--json]
 *
 * --csv-dir writes metrics-daily.csv, metrics-cohorts.csv, metrics-monthly.csv,
 * metrics-funnel.csv and metrics-excluded.csv there. --ledgers is the folder holding the *ledger*.json
 * files (default: the data file's folder). The rules are in docs/METRICS.md.
 */
const fs = require('fs');
const path = require('path');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

const dataFile = arg('--data');
if (!dataFile) {
  console.error('usage: node scripts/metrics-report.js --data <db.json> [--csv-dir <folder>] [--days N] [--ledgers <folder>] [--json]');
  process.exit(2);
}
if (!fs.existsSync(dataFile)) {
  console.error(`no such data file: ${dataFile}`);
  process.exit(2);
}
// config/db.js moves an unreadable file aside on load; a report must never do that.
try { JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch (err) {
  console.error(`the data file is not readable JSON (${err.message}); nothing was changed`);
  process.exit(2);
}
// The app's own loader reads the file; DB_READONLY keeps it from ever writing back.
process.env.DB_FILE = path.resolve(dataFile);
process.env.DB_READONLY = '1';
require('dotenv').config();

const db = require('../config/db');
const metrics = require('../services/real-user-metrics');

const m = metrics.compute(db, {
  days: Number(arg('--days', 30)),
  ledgerDir: path.resolve(arg('--ledgers', path.dirname(path.resolve(dataFile)))),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(m, null, 2));
} else {
  const h = m.headline;
  const pct = (r) => (r.rate === null ? 'n/a (no cohort old enough)' : `${(r.rate * 100).toFixed(1)}% (${r.returned} of ${r.eligible_users})`);
  const l = h.last_30_days;
  console.log(`Real-user metrics, ${m.today} (UTC days)`);
  console.log(`  accounts: ${m.accounts.total} in all; ${m.accounts.real} real; excluded ${m.accounts.excluded} (founder ${m.accounts.founder}, test ${m.accounts.test}, demo ${m.accounts.demo})`);
  console.log(`  real users who did anything: ${h.ever_active}; active on 2+ distinct days: ${h.active_2plus_days}`);
  console.log('  activation funnel (real users):');
  for (const f of m.funnel.steps) console.log(`    ${f.label}: ${f.users} of ${f.of}${f.rate === null ? '' : ` (${(f.rate * 100).toFixed(1)}%)`}`);
  const mpd = m.funnel.minutes_per_active_day;
  console.log(`    minutes per active day: ${mpd.measured_study ?? '-'} measured, ${mpd.sitting_upper ?? '-'} sitting (upper), over ${m.funnel.active_days_total} active days`);
  console.log(`  day-1 return: ${pct(h.day1_return)}`);
  console.log(`  day-7 return: ${pct(h.day7_return)}`);
  console.log(`  back within days 1-7: ${pct(h.week1_return)}`);
  console.log(`  last 30 days: ${l.active_learners} active learners; ${l.sittings_per_active ?? '-'} sittings, ${l.study_minutes_per_active ?? '-'} measured study min, ${l.sitting_minutes_per_active ?? '-'} sitting min (upper) each`);
  console.log(`  AI cost per active learner, last 30 days: $${l.ai_cost_per_active_usd_estimate ?? '-'} (estimate from token counts x list prices; free tiers $0)`);
  for (const x of m.months) {
    console.log(`  ${x.month}${x.month_complete ? '' : ' (so far)'}: ${x.signups} sign-ups, ${x.active_learners} active, AI est. $${x.ai_cost_per_active_usd_estimate ?? '-'} each; ledgers $${x.ledger_usd} machine-wide${x.ledger_partial ? ' (partial)' : ''}`);
  }
  for (const f of m.founder) console.log(`  founder ${f.email}: ${f.active_days} active days, ${f.sittings} sittings (not counted above)`);
}

const csvDir = arg('--csv-dir');
if (csvDir) {
  fs.mkdirSync(csvDir, { recursive: true });
  for (const t of metrics.TABLES) {
    const file = path.join(csvDir, `metrics-${t}.csv`);
    fs.writeFileSync(file, metrics.toCsv(m, t));
    console.error(`wrote ${file}`);
  }
}
