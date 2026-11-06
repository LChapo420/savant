/**
 * Today's builder against the new default path, exam and invented facts, per document and overall. AI-JUDGED, SIMULATED.
 *   node scripts/uploads-factcheck-compare.js
 * Today: rows tag v1 (raw arm, the builder as it was on h1-h6) and tag base (n1-n4, all switches off). New: rows tag final (checked arm).
 */
const fs = require('fs');
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const v1 = load('docs/uploads-factcheck-proof-v1.json');
const base = load('docs/uploads-factcheck-proof-base.json');
const fin = load(process.env.FACT_OUT || 'docs/uploads-factcheck-proof-final.json');
const today = [...v1.rows.filter((r) => r.tag === 'v1'), ...base.rows.filter((r) => r.tag === 'base')];
const now = fin.rows.filter((r) => r.tag === (process.env.FACT_TAG || 'final'));
const exams = { ...v1.exam, ...base.exam, ...fin.exam };
const share = (a) => { const v = a.filter((x) => x !== null && x !== undefined); return v.length ? v.filter(Boolean).length / v.length : null; };
const pct = (x) => (x == null ? ' n/a' : `${String(Math.round(x * 100)).padStart(3)}%`);
const part = (r, arm, f, kind) => (exams[r.doc] || []).map((q, i) => (q.kind === kind ? ((r.exam[arm] || {})[f] || [])[i] : undefined));
const docs = [...new Set(now.map((r) => r.doc))].sort();
const JUDGES = ['Z', 'C'];
for (const d of docs) {
  const t = today.filter((r) => r.doc === d); const n = now.filter((r) => r.doc === d);
  const cell = (rows, arm, f, k) => pct(share(rows.flatMap((r) => part(r, arm, f, k))));
  const inv = (rows, spec) => (rows.length ? (rows.reduce((s, r) => s + (((r.invented.checked || {})[spec]) || []).length, 0) / rows.length).toFixed(1) : '-');
  console.log(`${d} words ${t[0] ? t[0].raw_words : '?'}->${n[0].checked_words} (src ${n[0].source_words}) ${n[0].status} | ${JUDGES.map((f) => `${f} e ${cell(t, 'raw', f, 'emphasised')}->${cell(n, 'checked', f, 'emphasised')} p ${cell(t, 'raw', f, 'plain')}->${cell(n, 'checked', f, 'plain')}`).join(' | ')} | inv Z ${inv(n, 'Z:sent')} K ${inv(n, 'K:sent')} C ${inv(n, 'C:sent')}`);
}
const heldOut = (rows) => rows.filter((r) => docs.includes(r.doc));
for (const f of JUDGES) for (const k of ['emphasised', 'plain']) {
  const a = share(heldOut(today).flatMap((r) => part(r, 'raw', f, k))); const b = share(now.flatMap((r) => part(r, 'checked', f, k)));
  const same = share(now.flatMap((r) => part(r, 'raw2', f, k))); const raw = share(now.flatMap((r) => part(r, 'raw', f, k)));
  console.log(`${f} ${k}: today ${pct(a)} new ${pct(b)} (same text twice: ${pct(raw)} vs ${pct(same)})`);
}
for (const spec of ['Z:sent', 'K:sent', 'C:sent']) {
  const v = now.map((r) => ((r.invented.checked || {})[spec] || []).length);
  console.log(`invented per course ${spec}: ${(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(2)}; courses with none ${v.filter((x) => !x).length}/${v.length}`);
}
const lastSpend = now.map((r) => r.spend).filter(Boolean).slice(-1)[0];
if (lastSpend) console.log(`spend so far in the run: ${JSON.stringify(lastSpend)}`);
