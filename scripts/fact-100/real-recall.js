#!/usr/bin/env node
/**
 * Planted errors are not real errors. This scores readers on the real ones: the errors the 6 Nov audit confirmed in stored lessons (two rulers), by whether a reader's read of that stored level flags the same part with overlapping words.
 * Readers that made the audit (kimi31, grok43, glm_flash_zgpu) score on errors partly found by themselves; a new reader (ds41_coral, a lens) is a fresh list, so its recall is the fair one.
 *   node scripts/fact-100/real-recall.js                prints recall for each reader with a read
 *   node scripts/fact-100/real-recall.js --write-set    writes the set of levels holding confirmed errors, so a new reader can read them (docs/fact-100/real-set.json)
 */
const C = require('./common');
const { L } = C;

const audit = L.readJson(L.path.join(L.DOCS, 'audit-live.json'));
const conf = audit.findings.filter((f) => f.status === 'confirmed' && !f.level.includes('algebra_1_part_a'));
const words = (s) => new Set((String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2));
const overlap = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, Math.min(a.size, b.size)); };
const part = (w) => { const m = /(block|check)\s*#?\s*(\d+)/i.exec(w || ''); return m ? `${m[1].toLowerCase()}${m[2]}` : '?'; };
const clusters = [];
for (const f of conf) {
  const w = words(`${f.quote} ${f.why}`);
  const hit = clusters.find((c) => c.level === f.level && c.part === part(f.where) && overlap(c.w, w) >= 0.4);
  if (hit) { for (const b of f.by || []) hit.by.add(b); for (const x of w) hit.w.add(x); } else clusters.push({ level: f.level, part: part(f.where), by: new Set(f.by || []), w, quote: f.quote });
}
if (process.argv[2] === '--write-set') {
  const levels = [...new Set(clusters.map((c) => c.level))];
  L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'real-set.json'), { built: '2026-11-07', note: 'levels holding confirmed errors; no plants', plants: [], clean: levels.map((level) => ({ level, split: 'real' })) });
  console.log(levels.length, 'levels,', clusters.length, 'errors');
  process.exit(0);
}
const loadOld = (j) => new Map(L.readJsonl(L.path.join(L.TMP, 'raw', `${j}.jsonl`)).filter((r) => r.read).map((r) => [r.id, r]));
const loadNew = (j) => new Map(C.readRaw(j, 'real').filter((r) => r.read).map((r) => [r.id, r]));
const out = { errors: clusters.length, levels: new Set(clusters.map((c) => c.level)).size, readers: {} };
function recall(name, m, fresh) {
  const seen = clusters.filter((c) => m.has(`clean:${c.level}`));
  const hit = seen.filter((c) => (m.get(`clean:${c.level}`).flags || []).some((f) => part(f.where) === c.part && overlap(words(`${f.claim || ''} ${f.why || ''}`), c.w) >= 0.25));
  const flags = [...m.entries()].filter(([id]) => clusters.some((c) => `clean:${c.level}` === id)).reduce((a, [, r]) => a + (r.flags || []).length, 0);
  out.readers[name] = { n: seen.length, hit: hit.length, fresh, flagsOnTheseLevels: flags };
  console.log(name.padEnd(28), L.fmtRate(hit.length, seen.length).padEnd(24), fresh ? 'fresh list' : 'helped make the list', `flags on these levels ${flags}`);
  return new Set(hit);
}
const hits = {};
for (const j of ['kimi31', 'grok43', 'glm_flash_zgpu', 'ds41_coral', 'glm_flash_zgpu_lens', 'haiku']) hits[j] = recall(j, loadOld(j), !['kimi31', 'grok43', 'glm_flash_zgpu'].includes(j));
for (const j of process.argv.slice(2)) hits[`${j}(real)`] = recall(`${j}(real)`, loadNew(j), true);
const set = new Set(); for (const k of Object.keys(hits)) if (!k.startsWith('kimi')) for (const c of hits[k]) set.add(c);
console.log(`all readers but Kimi: ${set.size} of ${clusters.length}`);
L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'real-recall.json'), out);
process.exit(0);
