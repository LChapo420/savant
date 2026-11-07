#!/usr/bin/env node
/**
 * Frozen facts, step 1: how much of the stored lessons could a bank cover? Free: it only reads the claims already extracted.
 * Tokens (numbers, years, names, formulas, Spanish words with their marks) of each level's real text, against:
 *   own     the facts extracted from this very level (what a rewrite of a verified level is checked against)
 *   sibling the facts of the OTHER levels of the same grade (what a NEW level would meet: leave-one-out)
 * Also the claim types by subject: how much of a lesson is checkable claim at all. Writes docs/fact-100/bank-coverage.json.
 */
const C = require('./common');
const { L } = C;
const B = require('../../services/fact-bank');

const rows = L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl'));
const levels = C.levelMap();
const FACT_TYPES = new Set(['fact', 'rule', 'formula', 'definition', 'vocab', 'procedure', 'computation', 'key']);
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!/^(id|block|color|colour|icon|timing|format|fen|emoji|type|kind)$/i.test(k)) strings(v, out); return out; };
const textOf = (lv) => [...lv.blocks.map((b) => strings(b.data).join('. ')), ...lv.checks.map((c) => strings({ p: c.prompt, r: c.rationale, h: c.hint }).join('. '))].join('\n');
const out = { levels: rows.length, byTrack: {}, types: {}, examplesMissing: [] };
const byGrade = new Map();
for (const r of rows) { const k = `${r.track}/${r.grade}`; if (!byGrade.has(k)) byGrade.set(k, []); byGrade.get(k).push(r); }
for (const r of rows) {
  const lv = levels.get(r.level); if (!lv) continue;
  const t = out.byTrack[r.track] = out.byTrack[r.track] || { levels: 0, tokens: 0, own: 0, sibling: 0, ownIll: 0, byType: {} };
  t.levels++;
  const facts = r.claims.filter((c) => FACT_TYPES.has(c.type)).map((c) => c.text);
  const ill = r.claims.filter((c) => c.type === 'illustration').map((c) => c.text);
  const sib = byGrade.get(`${r.track}/${r.grade}`).filter((x) => x !== r).flatMap((x) => x.claims.filter((c) => FACT_TYPES.has(c.type)).map((c) => c.text));
  const own = B.allowedFrom(facts, r.track); const ownIll = B.allowedFrom([...facts, ...ill], r.track); const sibA = B.allowedFrom(sib, r.track);
  const tokens = B.tokensOf(textOf(lv), r.track);
  for (const tk of tokens) {
    const k = `${tk.type}:${tk.value}`; const isIn = (S) => S.has(k) || (tk.type === 'number' && S.has(`year:${tk.value}`));
    t.tokens++; if (isIn(own)) t.own++; if (isIn(ownIll)) t.ownIll++; if (isIn(sibA)) t.sibling++;
    const y = t.byType[tk.type] = t.byType[tk.type] || { n: 0, own: 0, sibling: 0 }; y.n++; if (isIn(own)) y.own++; if (isIn(sibA)) y.sibling++;
    if (!isIn(ownIll) && out.examplesMissing.length < 400 && parseInt(L.hash(r.level + k), 16) % 9 === 0) out.examplesMissing.push(`${r.level} ${tk.type} ${tk.raw}`);
  }
  for (const c of r.claims) { const y = out.types[r.track] = out.types[r.track] || {}; y[c.type] = (y[c.type] || 0) + 1; }
}
const pc = (a, b) => (b ? `${Math.round(100 * a / b)}%` : '-');
for (const [k, t] of Object.entries(out.byTrack)) {
  console.log(k.padEnd(11), `levels ${t.levels}, tokens ${t.tokens}: in own-level facts ${pc(t.own, t.tokens)}, plus its illustrations ${pc(t.ownIll, t.tokens)}, in sibling levels ${pc(t.sibling, t.tokens)}`);
  for (const [y, v] of Object.entries(t.byType)) console.log('   ', y.padEnd(8), `n=${v.n} own ${pc(v.own, v.n)} sibling ${pc(v.sibling, v.n)}`);
  const ty = out.types[k]; const tot = Object.values(ty).reduce((a, b) => a + b, 0);
  console.log('    claims', tot, Object.entries(ty).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${pc(v, tot)}`).join(', '));
}
L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'bank-coverage.json'), out);
console.log('missing sample:', out.examplesMissing.slice(0, 24).map((s) => s.split('/').pop()).join(' | ').slice(0, 900));
process.exit(0);
