#!/usr/bin/env node
/**
 * Availability probe (5 Nov 2026): one tiny structured call per target every --every seconds for --rounds rounds, one attempt each
 * (no retry), recording ok / HTTP status / latency. Measures how often a verifier is reachable RIGHT NOW, not quality.
 *   node scripts/availability-probe.js [--rounds 14] [--every 180] [--out docs/availability-probe.json]
 * Paid targets go through their ledgers (RUN_CAP_USD default 0.30 here). Pipeline text only.
 */
const fs = require('fs');
try { require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' }); } catch { /* env */ }
require('../services/run-cap').defaultCap(0.3);
const LIVE_DIR = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['GONKA', 'GROKIFIED', 'LYCEUM']) { process.env[`${n}_LEDGER_FILE`] = `${LIVE_DIR}/${n.toLowerCase()}-ledger.json`; process.env[`${n}_PIPELINE`] = '1'; }
process.env.XKIRO_PIPELINE = '1';
process.env.XKIRO_GRANTS = process.env.XKIRO_GRANTS || JSON.stringify({ 'minimax/minimax-m3.1-flash': 6000000 });
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const ROUNDS = Number(arg('rounds', 14)); const EVERY = Number(arg('every', 180)) * 1000; const OUT = arg('out', 'docs/availability-probe.json');
const T = {
  'grokified grok-4.3': { p: () => require('../services/providers/grokified').grokified, model: 'grok-4.3' },
  'grokified grok-4.7': { p: () => require('../services/providers/grokified').grokified, model: 'grok-4.7' },
  'lyceum minimax-m3': { p: () => require('../services/providers/lyceum').lyceum, model: 'minimax/minimax-m3' },
  'lyceum glm-5.3-flash': { p: () => require('../services/providers/lyceum').lyceum, model: 'z-ai/glm-5.3-flash' },
  'gonka glm-5.3-flash': { p: () => require('../services/providers/gonka').gonka, model: 'zai-org/GLM-5.3-Flash' },
  'xkiro minimax-m3.1-flash': { p: () => require('../services/providers/xkiro').xkiro, model: 'minimax/minimax-m3.1-flash', x: (m) => ({ models: [m] }) },
};
const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
const rows = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify({ started: rows[0] && rows[0].at, updated: new Date().toISOString(), every_s: EVERY / 1000, rows }, null, 1));
(async () => {
  for (let r = 0; r < ROUNDS; r++) {
    await Promise.all(Object.entries(T).map(async ([name, t]) => {
      const at = new Date().toISOString(); const s = Date.now();
      try {
        const res = await (t.p().structuredOnce || t.p().structured).call(t.p(), { model: t.model, ...(t.x ? t.x(t.model) : {}), system: 'Answer with JSON.', user: 'Return {"ok":true}.', schema, schemaName: 'submit', maxTokens: 300, timeoutMs: 60000 });
        rows.push({ at, name, ok: !!(res && res.data), ms: Date.now() - s, status: null });
      } catch (e) { rows.push({ at, name, ok: false, ms: Date.now() - s, status: e.status || null, error: String(e.message).slice(0, 100) }); }
    }));
    save();
    if (r < ROUNDS - 1) await new Promise((x) => setTimeout(x, EVERY));
  }
  process.exit(0);
})();
