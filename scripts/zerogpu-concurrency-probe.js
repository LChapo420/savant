#!/usr/bin/env node
/**
 * ZeroGPU GLM single-block verify latency against how many calls run at once (6 Nov 2026, brief fact-queue). Real block prompts from
 * docs/fact-verifier-set.json, straight to the provider through its ledger. Pipeline text only.
 *   node scripts/zerogpu-concurrency-probe.js [levels=1,5,10,20] [maxTokens=6000]
 */
try { require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' }); } catch { /* env */ }
require('../services/run-cap').defaultCap(1);
process.env.ZEROGPU_PIPELINE = '1';
if (!process.env.ZEROGPU_LEDGER_FILE) process.env.ZEROGPU_LEDGER_FILE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/zerogpu-ledger.json';
const bl = require('../services/block-levels');
const { zerogpu } = require('../services/providers/zerogpu');
const set = require('../docs/fact-verifier-set.json').fact.filter((c) => c.kind === 'block');
const LEVELS = String(process.argv[2] || '1,5,10,20').split(',').map(Number);
const MT = Number(process.argv[3] || 6000);
(async () => {
  for (const c of LEVELS) {
    const jobs = Array.from({ length: c }, (_, i) => set[i % set.length]);
    const t0 = Date.now();
    const res = await Promise.all(jobs.map(async (s) => {
      const req = bl.verifyRequest({ context: { text: s.context, trackId: s.track }, blocks: [{ index: 0, block: s.block, data: s.data }], checks: [] });
      const t = Date.now();
      try { const r = await zerogpu.structured({ system: req.system, user: req.user, schema: bl.VERIFY_SCHEMA, schemaName: 'submit_verification', maxTokens: MT, timeoutMs: 180000, model: 'z-ai/glm-5.3-flash' }); return { ms: Date.now() - t, ok: !!(r && r.data) }; } catch (e) { return { ms: Date.now() - t, ok: false, err: String(e.message).slice(0, 50) }; }
    }));
    const ms = res.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
    console.log(`at once ${c}: ok ${ms.length}/${c}, p50 ${ms[Math.floor(ms.length / 2)]} ms, p90 ${ms[Math.floor(ms.length * 0.9)]} ms, max ${ms[ms.length - 1]} ms, wall ${Date.now() - t0} ms; errors ${[...new Set(res.filter((r) => r.err).map((r) => r.err))].join('|')}`);
  }
  process.exit(0);
})();
