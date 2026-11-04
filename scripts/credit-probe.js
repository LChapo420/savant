#!/usr/bin/env node
/**
 * One tiny chat call and one tiny structured (JSON) call per chat model of a credit provider, through its ledger: prints
 * latency, cost, tokens and whether the JSON validated. Live calls; not part of npm test.
 *
 *   node scripts/credit-probe.js gonka|grokified|lyceum [model ...]
 *
 * Needs the key in the owner's .env (C:/coding/claudecommittdIq/folderThing/.env, loaded here, never printed). The ledger defaults to
 * the LIVE one in folderThing's data/ so probe spend counts against the real cap; set <PROVIDER>_LEDGER_FILE to use another.
 */
const fs = require('fs');
require('../services/run-cap').defaultCap(5); // hard per-process spend cap across every paid ledger; --run-cap N or RUN_CAP_USD overrides
const path = require('path');

const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV }); } catch { /* rely on the environment */ } }
const which = process.argv[2];
const MODULES = { gonka: { ledger: 'gonka-ledger', file: 'GONKA_LEDGER_FILE', skip: /bge-m3/, pre: 'GONKA' }, lyceum: { ledger: 'lyceum-ledger', file: 'LYCEUM_LEDGER_FILE', skip: /^$/, pre: 'LYCEUM' }, grokified: { ledger: 'grokified-ledger', file: 'GROKIFIED_LEDGER_FILE', skip: /^$/, pre: 'GROKIFIED' } };
if (!MODULES[which]) { console.error('usage: node scripts/credit-probe.js gonka|grokified|lyceum [model ...]'); process.exit(2); }
const m = MODULES[which];
if (!process.env[m.file]) process.env[m.file] = path.join('C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq', 'data', `${which}-ledger.json`);
process.env[`${m.pre}_PIPELINE`] = '1';

const ledger = require(`../services/${m.ledger}`);
const prov = require(`../services/providers/${which}`)[which];
const schema = { type: 'object', properties: { capital: { type: 'string' }, population_millions: { type: 'number' } }, required: ['capital', 'population_millions'] };

async function main() {
  if (!prov.isConfigured()) { console.log(`${m.pre}_API_KEY is not set: nothing probed.`); return; }
  const models = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(ledger.PRICES).filter((x) => !m.skip.test(x));
  const before = ledger.status();
  console.log(`ledger ${before.file}: spent $${before.spent_usd} of $${before.cap_usd}`);
  let total = 0;
  for (const model of models) {
    const row = { model };
    let t0 = Date.now();
    try {
      const r = await prov.chat({ task: `${which}_probe`, model, system: 'Answer in one word.', messages: [{ role: 'user', content: 'Say OK.' }], maxTokens: 300, timeoutMs: 90000 });
      row.chat = `${Date.now() - t0} ms $${r.usage.cost_usd.toFixed(6)} in ${r.usage.input_tokens} out ${r.usage.output_tokens} ${JSON.stringify(r.text.slice(0, 20))}`;
      total += r.usage.cost_usd;
    } catch (err) { row.chat = `FAILED ${Date.now() - t0} ms ${prov.describeError(err).slice(0, 140)}`; }
    t0 = Date.now();
    try {
      const r = await prov.structured({ task: `${which}_probe`, model, system: 'Give facts about the country.', user: 'Country: France.', schema, schemaName: 'country', maxTokens: 400, timeoutMs: 90000 });
      row.json = `valid ${Date.now() - t0} ms $${r.usage.cost_usd.toFixed(6)} ${JSON.stringify(r.data)}`;
      total += r.usage.cost_usd;
    } catch (err) { row.json = `${err.unusable ? 'INVALID' : 'FAILED'} ${Date.now() - t0} ms ${prov.describeError(err).slice(0, 140)}`; }
    console.log(`${model}\n   chat: ${row.chat}\n   json: ${row.json}`);
  }
  const after = ledger.status();
  console.log(`probe cost about $${total.toFixed(6)}; ledger spent $${after.spent_usd} (committed $${after.committed_usd}) of $${after.cap_usd}`);
}
main().catch((err) => { console.error(err.message); process.exit(1); });
