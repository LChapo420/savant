#!/usr/bin/env node
/**
 * Replay of a level fill that Coral Fast got wrong (6 Nov 2026, the strong-learner delay): the user prompts kept by CORAL_DEBUG_DIR (bad-*.json)
 * are sent to the Coral provider directly, `n` times each, with the warm retry (CORAL_WARM_RETRY, default on) or without (=off), and every outcome
 * is counted: ok, unusable (and why), cut off, seconds, output tokens. Paid (Coral ledger, RUN_CAP_USD); not part of npm test.
 *
 *   CORAL_WARM_RETRY=on|off node scripts/coral-fill-replay.js <debug dir> [n=4] [track=math]
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
require('../services/run-cap').defaultCap(2);
process.env.CORAL_PIPELINE = '1';
process.env.CORAL_LEDGER_FILE = process.env.CORAL_LEDGER_FILE || 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/coral-ledger.json';
const [, , DIR, N = '4', TRACK = 'math'] = process.argv;
const bl = require('../services/block-levels');
const { coral } = require('../services/providers/coral');
const MODEL = process.env.CORAL_REPLAY_MODEL || 'deepseek-v4.1-flash-fast';
(async () => {
  const files = fs.readdirSync(DIR).filter((f) => /^bad-.*block_fill/.test(f));
  const system = bl.FILL_SYSTEM + bl.subjectNote(TRACK, 'fill');
  const rows = [];
  const jobs = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    for (let k = 0; k < Number(N); k++) jobs.push(async () => {
      const t = Date.now();
      let o = { file: f, k, warm: process.env.CORAL_WARM_RETRY || 'on' };
      try {
        const r = await coral.structured({ task: 'block_fill', system: j.system || system, user: j.user, schema: bl.fillSchema(), schemaName: 'submit_block_content', maxTokens: 32000, model: MODEL, timeoutMs: 180000 });
        o.ok = !!r; o.out = r && r.usage && r.usage.output_tokens; o.blocks = r && r.data && r.data.blocks && r.data.blocks.length; o.checks = r && r.data && r.data.checks && r.data.checks.length;
      } catch (e) { o.ok = false; o.err = String(e.message).slice(0, 110); o.cut = !!e.truncated; }
      o.sec = Math.round((Date.now() - t) / 100) / 10; rows.push(o); console.log(JSON.stringify(o));
    });
  }
  let i = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (i < jobs.length) await jobs[i++](); }));
  const ok = rows.filter((r) => r.ok); const s = rows.map((r) => r.sec).sort((a, b) => a - b);
  console.log('SUMMARY', JSON.stringify({ warm: process.env.CORAL_WARM_RETRY || 'on', calls: rows.length, ok: ok.length, failed: rows.length - ok.length, cut: rows.filter((r) => r.cut).length, secMedian: s[Math.floor(s.length / 2)], secMax: s[s.length - 1] }));
  process.exit(0);
})();
