#!/usr/bin/env node
/** Summarise a cost-tracker directory (COST_TRACKER_DIR of one test server): ai calls by task and model, tries per call, failed calls, spend. node scripts/ct-summary.js <dir> */
const fs = require('fs'); const path = require('path');
const dir = process.argv[2]; const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => /^events-.*\.jsonl$/.test(x))) for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { if (!l.includes('"t":"ai"')) continue; try { rows.push(JSON.parse(l)); } catch { /* skip */ } }
const by = {}; let usd = 0; let fails = 0; let tries = 0;
for (const r of rows) { const k = `${r.task || r.role}|${r.prov}:${r.model || ''}`; const b = (by[k] = by[k] || { calls: 0, usd: 0, tries: 0, fail: 0 }); b.calls++; b.usd += r.usd || 0; b.tries += r.tries || 1; if (!r.ok) { b.fail++; fails++; } usd += r.usd || 0; tries += r.tries || 1; }
console.log(JSON.stringify({ calls: rows.length, failedCalls: fails, usd: Number(usd.toFixed(4)), triesTotal: tries, multiTry: rows.filter((r) => (r.tries || 1) > 1).length, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { ...v, usd: Number(v.usd.toFixed(4)) }])) }, null, 1));
