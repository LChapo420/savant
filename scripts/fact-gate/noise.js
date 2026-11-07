#!/usr/bin/env node
// Same text, same judge, read twice: how much does a catch or a clean verdict move? A same-versus-same noise control for the comparison.
const L = require('./lib');
const { catches, placeOf, words } = require('./scoring');

const tb = L.readJson(L.path.join(L.DOCS, 'testbed.json'));
const flagKey = (f) => `${placeOf(f.where) ? `${placeOf(f.where).word}${placeOf(f.where).index}` : '?'}|${words(f.claim).slice(0, 8).join(' ')}`;
const load = (n) => new Map(L.readJsonl(L.path.join(L.TMP, 'raw', `${n}.jsonl`)).filter((r) => r.read).map((r) => [r.id, r]));
for (const j of ['kimi31', 'glm_flash_zgpu']) {
  const a = load(j); const b = load(`${j}-r1`);
  let both = 0; let first = 0; let second = 0; let neither = 0; let cleanA = 0; let cleanB = 0; let cleanN = 0;
  for (const [id, r] of b) {
    if (id.startsWith('clean:')) { const x = a.get(id); if (x) { cleanN++; if (x.flags.length) cleanA++; if (r.flags.length) cleanB++; } continue; }
    const p = tb.plants.find((q) => q.id === id); const x = a.get(id); if (!p || !x) continue;
    const base = new Set(((a.get(`clean:${p.level}`) || { flags: [] }).flags).map(flagKey));
    const c1 = x.flags.some((f) => !base.has(flagKey(f)) && catches(f, p)); const c2 = r.flags.some((f) => !base.has(flagKey(f)) && catches(f, p));
    if (c1 && c2) both++; else if (c1) first++; else if (c2) second++; else neither++;
  }
  const n = both + first + second + neither;
  console.log(`${j}: ${n} plants read twice: both ${both}, first only ${first}, second only ${second}, neither ${neither}; agreement ${n ? L.pct((both + neither) / n) : '-'}; clean levels flagged ${cleanA} then ${cleanB} of ${cleanN}`);
}
