#!/usr/bin/env node
/**
 * Does stage 2 of the local checkers (Granite Guardian, HalluGuard) earn its place? On a seeded sample of dev twins against the bank. CPU only, 8 threads: a stand-in for the beta server.
 *   FACT_CHECKERS_URL=http://127.0.0.1:6791 node scripts/fact-100/stage2-sample.js [n=12]
 */
const C = require('./common');
const { L } = C;
const S = require('../../services/fact-source');

const N = Number(process.argv[2] || 12);
const OUT = L.path.join(C.RAW, 'stage2.dev.jsonl');
const claimRows = new Map(L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl')).map((r) => [r.level, r]));
(async () => {
  const tb = new Map(C.loadSet('dev').plants.map((p) => [p.id, p]));
  const pairs = L.readJsonl(L.path.join(C.RAW, 'pairs.bank.dev.jsonl')).sort((a, b) => (L.hash(a.id) < L.hash(b.id) ? -1 : 1)).slice(0, N);
  const done = new Set(L.readJsonl(OUT).map((r) => r.id));
  for (const p of pairs.filter((x) => !done.has(x.id))) {
    const facts = (claimRows.get(tb.get(p.id).level) || { claims: [] }).claims.filter((c) => !['illustration', 'pedagogy'].includes(c.type)).map((c) => c.text);
    const doc = (s) => S.fromBank(s, facts, 5).map((x) => x.text).join(' ') || 'none';
    const t0 = Date.now();
    const r = await S.post(`${process.env.FACT_CHECKERS_URL}/stage2`, { pairs: [{ doc: doc(p.clean), claim: p.clean }, { doc: doc(p.bad), claim: p.bad }] }); // eslint-disable-line no-await-in-loop
    L.appendJsonl(OUT, { id: p.id, kind: p.kind, t: r.results[0], w: r.results[1], ms: Date.now() - t0 });
  }
  const rows = L.readJsonl(OUT);
  const flag = (x) => x.granite === 'ungrounded' || /HALLUC/.test(x.halluguard);
  console.log(`pairs ${rows.length}, s a claim ${(rows.reduce((a, r) => a + r.ms, 0) / rows.length / 2000).toFixed(1)}; wrong flagged ${rows.filter((r) => flag(r.w)).length}, true flagged ${rows.filter((r) => flag(r.t)).length}; granite alone: wrong ${rows.filter((r) => r.w.granite === 'ungrounded').length}, true ${rows.filter((r) => r.t.granite === 'ungrounded').length}`);
  process.exit(0);
})();
