#!/usr/bin/env node
/**
 * ZeroGPU GLM latency on REAL level-size fact_verify prompts (5 Nov 2026, brief fact-queue). Whole levels from a DB copy (block_plans:
 * all blocks + checks, as production's verifyLevel sends them), straight to the provider through its ledger. Pipeline text only.
 *   DB_FILE=copy.json node scripts/fact-zerogpu-latency.js [levels=8] [maxTokens=16000,5000] [parallel=4]
 */
const fs = require('fs');
const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
try { require('dotenv').config({ path: ENV }); } catch { /* env */ }
require('../services/run-cap').defaultCap(2);
process.env.ZEROGPU_PIPELINE = '1';
if (!process.env.ZEROGPU_LEDGER_FILE) process.env.ZEROGPU_LEDGER_FILE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/zerogpu-ledger.json';
const bl = require('../services/block-levels');
const { zerogpu } = require('../services/providers/zerogpu');
const N = Number(process.argv[2] || 8);
const TOKS = String(process.argv[3] || '16000,5000').split(',').map(Number);
const PAR = Number(process.argv[4] || 4);
const db = JSON.parse(fs.readFileSync(process.env.DB_FILE, 'utf8'));
const plans = db.block_plans.filter((p) => p.blocks && p.blocks.length >= 5 && p.checks && p.checks.length).sort((a, b) => JSON.stringify(b.blocks).length - JSON.stringify(a.blocks).length);
const pick = []; const seen = new Set();
for (const p of plans) { const k = p.track_id; if (seen.has(k) && pick.length < plans.length / 2) { /* spread tracks first */ } if (!seen.has(k)) { seen.add(k); pick.push(p); } if (pick.length >= N) break; }
for (const p of plans) { if (pick.length >= N) break; if (!pick.includes(p)) pick.push(p); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const jobs = [];
  for (const p of pick) for (const mt of TOKS) jobs.push({ p, mt });
  const out = []; let next = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (next < jobs.length) {
    const { p, mt } = jobs[next++];
    const blocks = p.blocks.map((b, i) => ({ index: b.index ?? i, block: b.block, data: b.data }));
    const checks = p.checks.map((c, i) => ({ index: i, format: c.format, prompt: c.prompt, options: c.options, choices: c.choices, answer: c.answer, rationale: c.rationale }));
    const req = bl.verifyRequest({ context: { text: `Subject: ${p.track_id}, grade ${p.grade_id}, level ${p.level}.`, trackId: p.track_id }, blocks, checks });
    const t = Date.now(); let r = null; let err = null;
    try { r = await zerogpu.structured({ system: req.system, user: req.user, schema: bl.VERIFY_SCHEMA, schemaName: 'submit_verification', maxTokens: mt, timeoutMs: 240000, model: 'z-ai/glm-5.3-flash' }); } catch (e) { err = String(e.message).slice(0, 80); }
    out.push({ track: p.track_id, level: p.level, chars: req.user.length, mt, ms: Date.now() - t, ok: !!(r && r.data), claims: r && r.data ? bl.readVerification(r.data).claims.length : null, outTok: r && r.usage ? (r.usage.output_tokens || r.usage.completion_tokens) : null, err });
    console.log(JSON.stringify(out[out.length - 1]));
  } }));
  for (const mt of TOKS) {
    const rows = out.filter((o) => o.mt === mt); const ms = rows.filter((o) => o.ok).map((o) => o.ms).sort((a, b) => a - b);
    console.log(`maxTokens ${mt}: ok ${ms.length}/${rows.length}, p50 ${ms[Math.floor(ms.length / 2)]} ms, p90 ${ms[Math.floor(ms.length * 0.9)]} ms, max ${ms[ms.length - 1]} ms; avg prompt chars ${Math.round(rows.reduce((s, o) => s + o.chars, 0) / rows.length)}`);
  }
})();
