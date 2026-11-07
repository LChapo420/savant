#!/usr/bin/env node
/**
 * Scores checkers and unions on the new set. dev2 while choosing; heldout once, then no change.
 *   node scripts/fact-100/evaluate.js <dev2|heldout> <spec> <spec> ...   spec: checker names joined by +
 * A false alarm here is a raw flag on a clean level, before any ruling; clean levels are those the 6 Nov audit found no confirmed error in, so some flags are real errors. Rulings are scored by run-rulings.js.
 * Also: overlap (both-miss seen vs if independent) for each pair among the first spec's members. Writes docs/fact-100/eval-<split>.json.
 */
const C = require('./common');
const { L } = C;

const [, , SPLIT = 'dev2', ...SPECS] = process.argv;
const set = C.loadSet('heldout');
const split = new Map([...set.plants.map((p) => [p.level, p.split]), ...set.clean.map((c) => [c.level, c.split])]);
const plants = set.plants.filter((p) => p.split === SPLIT);
const cleanIds = set.clean.filter((c) => c.split === SPLIT).map((c) => `clean:${c.level}`);
const cache = new Map();
function load(ch) {
  if (cache.has(ch)) return cache.get(ch);
  const raw = C.readRaw(ch, 'heldout').filter((r) => r.read);
  const out = { scored: C.scorePlants(raw, 'heldout'), byId: new Map(raw.map((r) => [r.id, r])) };
  cache.set(ch, out);
  return out;
}
const MATH_ONLY = (ch) => ch.startsWith('compute_');
const out = { split: SPLIT, plants: plants.length, cleanLevels: cleanIds.length, rows: [] };
for (const spec of SPECS) {
  const members = spec.split('+');
  const hit = (p) => members.some((m) => load(m).scored.get(p.id));
  const readAll = (p) => members.every((m) => load(m).scored.has(p.id) || (MATH_ONLY(m) && p.track !== 'math'));
  const ps = plants.filter(readAll);
  const caught = ps.filter(hit).length;
  const cleans = cleanIds.filter((id) => members.every((m) => load(m).byId.has(id) || (MATH_ONLY(m) && !id.startsWith('clean:math'))));
  const flagged = cleans.filter((id) => members.some((m) => { const r = load(m).byId.get(id); return r && r.flags.length; })).length;
  const costs = members.map((m) => { const rs = [...load(m).byId.values()].filter((r) => r.cost && !r.reused); return rs.length ? rs.reduce((a, r) => a + r.cost, 0) / rs.length : 0; });
  const [lo, hi] = L.wilson(caught, ps.length); const [flo, fhi] = L.wilson(flagged, cleans.length);
  const row = { spec, caught, n: ps.length, low: +lo.toFixed(3), high: +hi.toFixed(3), cleanFlagged: flagged, cleanN: cleans.length, faLow: +flo.toFixed(3), faHigh: +fhi.toFixed(3), costPerLevel: +costs.reduce((a, b) => a + b, 0).toFixed(5), byKind: {} };
  for (const k of [...new Set(ps.map((p) => p.kind))]) { const q = ps.filter((p) => p.kind === k); row.byKind[k] = `${q.filter(hit).length}/${q.length}`; }
  out.rows.push(row);
  console.log(spec.padEnd(58), `caught ${L.fmtRate(caught, ps.length).padEnd(22)} clean flagged ${L.fmtRate(flagged, cleans.length).padEnd(20)} $${row.costPerLevel.toFixed(4)}  ${Object.entries(row.byKind).map(([k, v]) => `${k.slice(0, 5)} ${v}`).join(' ')}`);
}
if (SPECS[0]) {
  const members = SPECS[0].split('+');
  for (let a = 0; a < members.length; a++) {
    for (let b = a + 1; b < members.length; b++) {
      const A = load(members[a]).scored; const B = load(members[b]).scored;
      const ids = plants.map((p) => p.id).filter((id) => A.has(id) && B.has(id));
      if (ids.length < 15) continue;
      const ma = ids.filter((id) => !A.get(id)).length; const mb = ids.filter((id) => !B.get(id)).length; const both = ids.filter((id) => !A.get(id) && !B.get(id)).length; const exp = (ma * mb) / ids.length;
      console.log(`  overlap ${members[a]} + ${members[b]}: n=${ids.length} miss ${ma}, ${mb}; both ${both}, independent ${exp.toFixed(1)}, lift ${exp ? (both / exp).toFixed(2) : '-'}`);
    }
  }
}
L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', `eval-${SPLIT}.json`), out);
process.exit(0);
void split;
