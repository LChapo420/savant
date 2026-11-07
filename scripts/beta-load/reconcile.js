#!/usr/bin/env node
/**
 * Do the per-learner daily caps see what is really spent? Compares, for one load run, what ai_usage charged to its learners with what the
 * run's ledgers paid since the run began. The gap is spend no cap counts: shared writes with no learner on them, hedges that lost, failed calls.
 *   node scripts/beta-load/reconcile.js <run folder>
 */
const fs = require('fs');
const path = require('path');
const { LEDGERS, ROOT } = require('./harness');

const dir = process.argv[2];
const t0 = Number(path.basename(dir).split('-').pop());
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
const maxUser = Math.max(...base.users.map((u) => u.id));
const d = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
const rows = d.ai_usage.filter((u) => u.user_id > maxUser);
const cents = rows.reduce((a, u) => a + (u.cents || 0), 0);
const calls = rows.reduce((a, u) => a + (u.calls || 0), 0);
let usd = 0; const by = {}; const unknown = {};
for (const n of LEDGERS) {
  const f = path.join(dir, `${n}-ledger.json`);
  if (!fs.existsSync(f)) continue;
  const log = (JSON.parse(fs.readFileSync(f, 'utf8')).log || []).filter((l) => Date.parse(l.at) >= t0);
  const u = log.reduce((a, l) => a + (Number(l.usd) || 0), 0);
  usd += u; if (u) by[n] = Number(u.toFixed(4));
  const un = log.filter((l) => l.outcome === 'unknown').reduce((a, l) => a + (Number(l.usd) || 0), 0);
  if (un) unknown[n] = Number(un.toFixed(4));
}
console.log(JSON.stringify({ learners_charged: rows.length, charged_usd: Number((cents / 100).toFixed(4)), charged_calls: calls, ledgers_paid_usd: Number(usd.toFixed(4)), share_seen_by_caps: usd ? Number(((cents / 100) / usd).toFixed(2)) : null, by_ledger: by, of_which_unsettled_aborts: unknown, top_learner_cents: Math.max(0, ...rows.map((u) => u.cents || 0)), top_learner_calls: Math.max(0, ...rows.map((u) => u.calls || 0)) }));
