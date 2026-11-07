#!/usr/bin/env node
/**
 * What is left on each prepaid ledger on this PC (read only), and what the last 24 hours spent.
 *   node scripts/beta-load/ledgers-now.js [--dir <data folder>] [--json]
 * The server keeps its own copies: what it has spent since the 4 Nov cutover is NOT in these files, so true balances are lower.
 * The log in each ledger keeps the last 1000 calls, so a day with more calls than that reads low and is marked "at least".
 */
const fs = require('fs');
const path = require('path');
const { LIVE_DATA } = require('./harness');

const args = process.argv.slice(2);
const i = args.indexOf('--dir');
const dir = i >= 0 ? args[i + 1] : LIVE_DATA;
const NAMES = { coral: 100, gonka: 50, grokified: 135, lyceum: 250, munito: 100, zerogpu: 245, gladia: 50, 'standard-compute': 39.5, anthropic: 60.5 };
const rows = [];
for (const [n, capDefault] of Object.entries(NAMES)) {
  const f = path.join(dir, `${n}-ledger.json`);
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const cap = Number(capDefault); // the code's cap: a ledger file's own note of it can be older
  const spent = Number(j.seed_usd || 0) + Number(j.settled_usd || 0);
  const since = Date.now() - 86400000;
  const day = (j.log || []).filter((l) => Date.parse(l.at) > since);
  const usd24 = day.reduce((a, l) => a + (Number(l.usd) || 0), 0);
  const logFull = (j.log || []).length >= 1000 && day.length >= (j.log || []).length;
  const tasks = {};
  for (const [t, v] of Object.entries(j.by_task || {})) tasks[t] = { calls: v.calls, usd: Number(v.usd || 0) };
  rows.push({ name: n, cap, spent: Number(spent.toFixed(2)), left: Number((cap - spent).toFixed(2)), calls: j.calls, failed: j.failed_calls, last24h: Number(usd24.toFixed(2)), last24h_is_floor: logFull, tasks });
}
if (args.includes('--json')) console.log(JSON.stringify(rows));
else {
  for (const r of rows) console.log(`${r.name.padEnd(17)} cap ${String(r.cap).padEnd(6)} spent ${String(r.spent).padEnd(7)} left ${String(r.left).padEnd(7)} last 24h ${r.last24h_is_floor ? '>=' : ''}${r.last24h}`);
  console.log(`total left, excluding Anthropic and what the server has spent: $${rows.filter((r) => r.name !== 'anthropic').reduce((a, r) => a + r.left, 0).toFixed(2)}`);
}
