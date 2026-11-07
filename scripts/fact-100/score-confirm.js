#!/usr/bin/env node
/**
 * The trade-off curve: for each reader stack and confirm policy, planted errors still caught and clean levels still flagged. Ranges are Wilson 95%.
 *   node scripts/fact-100/score-confirm.js <dev2|heldout> [stack stack ...]   stack: readers joined by +
 * A plant is caught when a flag that catches it (scoring.catches, on a reader in the stack, not on that reader's clean read) survives the policy. A clean level counts when any flag survives.
 * Prints what survives on clean levels, for reading by hand: some are real errors in stored text, not false alarms.
 */
const C = require('./common');
const { L } = C;
const CF = require('../../services/fact-confirm');

const [, , SPLIT = 'dev2', ...STACKS] = process.argv;
const set = C.loadSet('heldout');
const rows = L.readJsonl(L.path.join(C.RAW, `confirm.${SPLIT}.jsonl`));
const byId = new Map(rows.map((r) => [r.id, r]));
const plants = set.plants.filter((p) => p.split === SPLIT && byId.has(p.id));
const cleanIds = set.clean.filter((c) => c.split === SPLIT && byId.has(`clean:${c.level}`)).map((c) => `clean:${c.level}`);
const flagBase = (reader, level) => { const raw = C.readRaw(reader, 'heldout').find((r) => r.read && r.id === `clean:${level}`); return new Set(((raw && raw.flags) || []).map(C.flagKey)); };
const baseCache = new Map();
const baseOf = (reader, level) => { const k = `${reader}|${level}`; if (!baseCache.has(k)) baseCache.set(k, flagBase(reader, level)); return baseCache.get(k); };
const stacks = STACKS.length ? STACKS : ['kimi31+grok43+ds41_coral+compute_ds41_coral+code', 'grok43+ds41_coral+compute_ds41_coral+code', 'kimi31+grok43', 'kimi31', 'ds41_coral+grok43'];
const out = { split: SPLIT, plants: plants.length, cleanLevels: cleanIds.length, curves: {} };
for (const stack of stacks) {
  const members = stack.split('+');
  console.log(`\n${stack}`);
  out.curves[stack] = {};
  for (const policy of Object.keys(CF.POLICIES)) {
    const view = (f) => ({ ...f, raisers: f.raisers.filter((r) => members.includes(r)) });
    const survives = (f) => { const v = view(f); return v.raisers.length > 0 && CF.decide(v, policy).act; };
    let caught = 0; const seen = [];
    for (const p of plants) {
      const r = byId.get(p.id);
      const hit = r.flags.some((f) => survives(f) && f.sources.some((s) => members.includes(s.r) && !baseOf(s.r, p.level).has(C.flagKey(s)) && C.catches(s, p)));
      if (hit) { caught++; seen.push(p); }
    }
    const fl = cleanIds.filter((id) => byId.get(id).flags.some(survives));
    const nFlags = cleanIds.reduce((a, id) => a + byId.get(id).flags.filter(survives).length, 0);
    const [lo, hi] = L.wilson(caught, plants.length); const [flo, fhi] = L.wilson(fl.length, cleanIds.length);
    out.curves[stack][policy] = { caught, n: plants.length, low: +lo.toFixed(3), high: +hi.toFixed(3), cleanLevels: fl.length, cleanN: cleanIds.length, faLow: +flo.toFixed(3), faHigh: +fhi.toFixed(3), flags: nFlags, kinds: seen.reduce((m, p) => { m[p.kind] = (m[p.kind] || 0) + 1; return m; }, {}) };
    console.log(policy.padEnd(24), `caught ${L.fmtRate(caught, plants.length).padEnd(22)} clean levels flagged ${L.fmtRate(fl.length, cleanIds.length).padEnd(20)} flags ${nFlags}`);
  }
}
const totals = {}; for (const p of plants) totals[p.kind] = (totals[p.kind] || 0) + 1; out.kindTotals = totals;
console.log('\nkinds', JSON.stringify(totals));
L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', `confirm-${SPLIT}.json`), out);
if (process.env.SHOW) {
  const policy = process.env.SHOW; const members = stacks[0].split('+');
  for (const id of cleanIds) for (const f of byId.get(id).flags) { const v = { ...f, raisers: f.raisers.filter((r) => members.includes(r)) }; if (v.raisers.length && CF.decide(v, policy).act) console.log(id.split('/').slice(-2).join('/'), f.where, `[${v.raisers.join(',')}|${Object.entries(f.rulings).map(([k, x]) => `${k.slice(0, 2)}${x ? '+' : '-'}`).join('')}|src ${f.source}|rc ${f.recompute}]`, f.claim.slice(0, 110), '::', f.why.slice(0, 120)); }
}
process.exit(0);
