#!/usr/bin/env node
/**
 * What would the fact guard have cost on real use? Reads the cost tracker's events (counts and tokens only, nothing is written, no learner text exists there),
 * and prices one check per writer call of each inline task, at the measured size of a check and the ledger price of the first checker.
 *
 *   node scripts/fact-guard-cost.js [--dir <data dir>/cost-tracker] [--days 7]
 *
 * A check reads about SYSTEM_TOKENS of rules, the source (capped at 6000 characters, about SOURCE_TOKENS at most) and the writer's text; it answers in about OUT_TOKENS
 * (measured in scripts/fact-guard-eval.js). The price is ZeroGPU GLM-5.3 Flash: $0.10 in, $0.35 out per Mtok (config/model-lineup.json).
 */
const fs = require('fs');
const path = require('path');
const registry = require('../services/fact-registry');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const DIR = arg('dir', 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/cost-tracker');
const DAYS = Number(arg('days', 7));
const SYSTEM_TOKENS = 230; const SOURCE_TOKENS = { live: 450, material: 1500, other: 300 }; const OUT_TOKENS = 90;
const PRICE_IN = 0.1 / 1e6; const PRICE_OUT = 0.35 / 1e6;

const files = fs.readdirSync(DIR).filter((f) => /^events-.*\.jsonl$/.test(f)).sort().slice(-DAYS);
const days = new Map(); // user|day -> { calls, usd, tasks }
const byTask = new Map();
for (const f of files) {
  const day = f.slice(7, 17);
  for (const line of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.t !== 'ai' || !e.ok || e.src === 'test' || e.src === 'scripts') continue;
    const { task } = e;
    const userId = e.u;
    if (!userId || !task) continue;
    const row = registry.lookup(task);
    if (!row || row.kind !== 'inline') continue;
    const written = Number(e.out) || 150;
    const src = row.live ? SOURCE_TOKENS.live : row.mode === 'material' ? SOURCE_TOKENS.material : SOURCE_TOKENS.other;
    const calls = Math.max(1, Math.ceil(written / 2300)); // MAX_CALL 9000 characters is about 2300 tokens
    const usd = calls * (SYSTEM_TOKENS + src) * PRICE_IN + written * PRICE_IN + calls * OUT_TOKENS * PRICE_OUT;
    const key = `${userId}|${day}`;
    const d = days.get(key) || { calls: 0, usd: 0 };
    d.calls += calls; d.usd += usd; days.set(key, d);
    const t = byTask.get(task) || { calls: 0, usd: 0 };
    t.calls += calls; t.usd += usd; byTask.set(task, t);
  }
}
const list = [...days.values()].sort((a, b) => a.usd - b.usd);
const at = (p) => (list.length ? list[Math.min(list.length - 1, Math.floor(list.length * p))] : { calls: 0, usd: 0 });
const mean = list.reduce((n, d) => n + d.usd, 0) / (list.length || 1);
console.log(`${files.length} days of events, ${list.length} learner-days`);
console.log(`checks a learner-day: median ${at(0.5).calls}, p95 ${at(0.95).calls}, most ${at(1).calls}`);
console.log(`added cost a learner-day: mean $${mean.toFixed(5)}, median $${at(0.5).usd.toFixed(5)}, p95 $${at(0.95).usd.toFixed(5)}, most $${at(1).usd.toFixed(5)}`);
console.log([...byTask.entries()].sort((a, b) => b[1].usd - a[1].usd).slice(0, 12).map(([k, v]) => `${k} ${v.calls} calls $${v.usd.toFixed(4)}`).join('\n'));
