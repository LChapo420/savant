#!/usr/bin/env node
/**
 * Layer overlap on the fact-gate planted set, from reads already paid for (raw files of 6 Nov), so this costs nothing. Checkers multiply only if their misses don't overlap.
 *   node scripts/fact-100/overlap.js [dev|heldout|all]
 * Prints each checker's miss rate, and for each pair: both-miss seen against both-miss if independent (lift > 1: the misses overlap). Writes docs/fact-100/overlap.json.
 * NOTE: this set was seen by the fact-gate brief and is now DEV for this work: a stack picked here must be scored on the new held-out set before any claim.
 */
const L = require('../fact-gate/lib');
const { catches, placeOf, words } = require('../fact-gate/scoring');
const code = require('../../services/fact-code-checks');

const SPLIT = process.argv[2] || 'all';
const tb = L.readJson(L.path.join(L.DOCS, 'testbed.json'));
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const plants = tb.plants.filter((p) => SPLIT === 'all' || p.split === SPLIT);
const RAW = L.path.join(L.TMP, 'raw');
const JUDGES = ['kimi31', 'glm53', 'haiku', 'glm_flash_zgpu', 'ds41_coral', 'grok43', 'glm_flash_zgpu_lens', 'ds41_coral_blind', 'code'];
const load = (j) => { const m = new Map(); for (const r of L.readJsonl(L.path.join(RAW, `${j}.jsonl`))) if (r.read) m.set(r.id, r); return m; };
const flagKey = (f) => `${placeOf(f.where) ? `${placeOf(f.where).word}${placeOf(f.where).index}` : '?'}|${words(f.claim).slice(0, 8).join(' ')}`;
const codeRun = (lv) => code.checkLevel({ trackId: lv.track, gradeId: lv.grade, blocks: lv.blocks, checks: lv.checks }).filter((f) => f.certain).map((f) => ({ ...f, why: f.rule }));
const data = {};
for (const j of JUDGES) {
  const m = j === 'code' ? null : load(j);
  const res = new Map();
  for (const p of plants) {
    let flags; let base;
    if (j === 'code') { flags = codeRun(L.applyEdits(levels.get(p.level), p.edits)); base = codeRun(levels.get(p.level)); } else {
      const r = m.get(p.id); if (!r) continue;
      flags = r.flags; base = (m.get(`clean:${p.level}`) || { flags: [] }).flags;
    }
    const baseKeys = new Set(base.map(flagKey));
    res.set(p.id, flags.filter((x) => !baseKeys.has(flagKey(x))).some((f) => catches(f, p)));
  }
  data[j] = res;
}
const out = { split: SPLIT, plants: plants.length, single: {}, pairs: [], byKind: {}, missedByAll: [] };
for (const j of JUDGES) { const v = [...data[j].values()]; out.single[j] = { n: v.length, caught: v.filter(Boolean).length }; console.log(j.padEnd(22), L.fmtRate(v.filter(Boolean).length, v.length)); }
console.log('\npair, both read: both-miss seen vs if independent, lift (1 = independent, higher = shared blind spots)');
for (let a = 0; a < JUDGES.length; a++) {
  for (let b = a + 1; b < JUDGES.length; b++) {
    const ids = plants.map((p) => p.id).filter((id) => data[JUDGES[a]].has(id) && data[JUDGES[b]].has(id));
    if (ids.length < 20) continue;
    const ma = ids.filter((id) => !data[JUDGES[a]].get(id)).length; const mb = ids.filter((id) => !data[JUDGES[b]].get(id)).length;
    const both = ids.filter((id) => !data[JUDGES[a]].get(id) && !data[JUDGES[b]].get(id)).length;
    const exp = (ma * mb) / ids.length;
    const row = { a: JUDGES[a], b: JUDGES[b], n: ids.length, missA: ma, missB: mb, bothMiss: both, expected: +exp.toFixed(2), lift: exp ? +(both / exp).toFixed(2) : null };
    out.pairs.push(row);
    console.log(`${row.a}+${row.b}`.padEnd(40), `n=${row.n} miss ${ma}, ${mb}; both ${both}, indep ${row.expected}, lift ${row.lift}`);
  }
}
// What no reader catches, the reason layers stop multiplying.
const all = ['kimi31', 'haiku', 'glm_flash_zgpu', 'ds41_coral', 'grok43'];
for (const p of plants) {
  const hit = all.filter((j) => data[j].get(p.id)).length;
  (out.byKind[p.kind] = out.byKind[p.kind] || { n: 0, caughtBy: [0, 0, 0, 0, 0, 0] }); out.byKind[p.kind].n++; out.byKind[p.kind].caughtBy[hit]++;
  if (hit <= 1) out.missedByAll.push({ id: p.id, kind: p.kind, hit, track: p.track, soft: !!p.soft, wrong: (p.edits[0].wrong || p.edits[0].marker || '').slice(0, 120), truth: (p.truth || '').slice(0, 120) });
}
console.log('\nby kind: how many of 5 readers caught each plant');
for (const [k, v] of Object.entries(out.byKind)) console.log(k.padEnd(28), `n=${v.n}`, v.caughtBy.join(' '));
L.fs.mkdirSync(L.path.join(L.DOCS, '..', 'fact-100'), { recursive: true });
L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'overlap.json'), out);
console.log(`hard for all (0-1 of 5 caught): ${out.missedByAll.length}`);
for (const m of out.missedByAll.slice(0, 14)) console.log(`  ${m.id} ${m.kind} hit=${m.hit}: ${m.wrong.slice(0, 90)}`);
process.exit(0);
