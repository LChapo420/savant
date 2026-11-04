#!/usr/bin/env node
/**
 * One tiny chat call per Munito chat model, through services/munito-ledger.js: prints model, latency and cost.
 * Needs MUNITO_API_KEY (the owner's .env at C:/coding/claudecommittdIq/folderThing/.env, loaded here, never printed).
 * Without a key it prints that and exits 0 without calling anything. Spend: about $0.0001 in all, inside the $100 cap.
 *
 *   node scripts/munito-probe.js [model ...]     (default: every chat model in the ledger's price list except pplx-decider, which is not a chat model: it answers 400)
 *
 * The ledger defaults to the live one (folderThing's data/munito-ledger.json) so probe spend counts against the real cap;
 * set MUNITO_LEDGER_FILE to use another. Not part of npm test (it is a live call).
 */
const fs = require('fs');
const path = require('path');

const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { // dotenv never overrides a variable that is already set
  try { require('dotenv').config({ path: ENV }); } catch { /* dotenv missing: rely on the environment */ }
}
if (!process.env.MUNITO_LEDGER_FILE) process.env.MUNITO_LEDGER_FILE = path.join('C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq', 'data', 'munito-ledger.json');
process.env.MUNITO_PIPELINE = '1';

const ledger = require('../services/munito-ledger');
const { munito } = require('../services/providers/munito');

async function main() {
  if (!munito.isConfigured()) { console.log('MUNITO_API_KEY is not set: nothing probed.'); return; }
  const models = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ledger.PRICES).filter((m) => !/pplx-decider/.test(m));
  const before = ledger.status();
  console.log(`ledger ${before.file}: spent $${before.spent_usd} of $${before.cap_usd}`);
  let total = 0;
  for (const model of models) {
    const t0 = Date.now();
    try {
      const r = await munito.chat({ task: 'munito_probe', model, system: 'Answer in one word.', messages: [{ role: 'user', content: 'Say OK.' }], maxTokens: 200, timeoutMs: 60000 });
      const usd = (r.usage && r.usage.cost_usd) || 0;
      total += usd;
      console.log(`${model}  ${Date.now() - t0} ms  $${usd.toFixed(6)}  in ${r.usage.input_tokens} out ${r.usage.output_tokens}  reply: ${JSON.stringify(r.text.slice(0, 40))}`);
    } catch (err) {
      console.log(`${model}  ${Date.now() - t0} ms  FAILED  ${munito.describeError(err).slice(0, 160)}`);
    }
  }
  const after = ledger.status();
  console.log(`probe cost $${total.toFixed(6)}; ledger now spent $${after.spent_usd} (committed $${after.committed_usd}) of $${after.cap_usd}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
