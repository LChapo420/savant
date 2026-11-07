#!/usr/bin/env node
// What this build spent, from its own raw files (reads, deciders, repairs). Planter and rubric reads are added from the logs in the report.
const L = require('./lib');

const raw = L.path.join(L.TMP, 'raw');
const FAM = { kimi31: 'lyceum', glm53: 'lyceum', glm_flash_zgpu: 'zerogpu', grok43: 'grokified', grok47: 'grokified', ds41_coral: 'coral', ds_flash_gonka: 'gonka', haiku: 'anthropic', sonnet: 'anthropic', crouton: 'free' };
const by = {};
for (const f of L.fs.readdirSync(raw).filter((x) => x.endsWith('.jsonl'))) {
  const name = f.replace('.jsonl', '').replace('.decisions', '').replace(/^repair-/, '').replace(/_(claims|lens|blind)$/, '');
  const usd = L.readJsonl(L.path.join(raw, f)).reduce((s, r) => s + (r.cost || 0), 0);
  const k = FAM[name] || name;
  by[k] = (by[k] || 0) + usd;
}
const dir = L.path.join(L.TMP, 'base-ready');
for (const f of L.fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) { const k = FAM[f.replace('rubric-', '').replace('.jsonl', '')]; by[k] = (by[k] || 0) + L.readJsonl(L.path.join(dir, f)).reduce((s, r) => s + (r.cost || 0), 0); }
console.log(Object.entries(by).map(([k, v]) => `${k} $${v.toFixed(2)}`).join(', '));
console.log('total', Object.values(by).reduce((a, b) => a + b, 0).toFixed(2));
