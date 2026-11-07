#!/usr/bin/env node
/**
 * How many real errors are left in stored lessons? Capture-recapture across checkers, calibrated on errors hidden at a known rate. AI-judged throughout.
 *
 * Real findings: the 6 Nov audit (docs/fact-gate/audit-live.json), three readers, confirmed by two rulers. Flags at the same part with overlapping words are one error.
 * Two lists: Kimi, and the union of the cheaper two. Chapman's estimate assumes the lists miss independently; docs/FACT-100.md shows they do not (misses overlap 3 to 14 times over chance), which makes it too low.
 * So the same estimate is first run on the planted sets, where the truth is known, and the ratio truth / estimate corrects it. A second estimate divides what was found by the catch rate measured on plants.
 * Ranges: bootstrap over errors and plants (seeded). They do not include the chance that real errors are harder than planted ones; the held-out calibration is harder than dev, and shows how much that moves it.
 * Rulers and readers are all models: an error every model believes is invisible here. That is the floor of what this can see.
 */
const C = require('./common');
const { L } = C;

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const words = (s) => new Set((String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2));
const overlap = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, Math.min(a.size, b.size)); };

const audit = L.readJson(L.path.join(L.DOCS, 'audit-live.json'));
function clusters(findings) {
  const out = [];
  for (const f of findings) {
    const w = words(`${f.quote} ${f.why}`);
    const hit = out.find((c) => c.level === f.level && c.where === f.where && overlap(c.w, w) >= 0.4);
    if (hit) { for (const b of f.by || []) hit.by.add(b); for (const x of w) hit.w.add(x); } else out.push({ level: f.level, where: f.where, by: new Set(f.by || []), w });
  }
  return out;
}
const chapman = (a, b, ab) => ((a + 1) * (b + 1)) / (ab + 1) - 1;
/** rows: [{a: bool, b: bool}] of things caught by at least one list. */
function est(rows) {
  const a = rows.filter((r) => r.a).length; const b = rows.filter((r) => r.b).length; const ab = rows.filter((r) => r.a && r.b).length;
  return { a, b, ab, found: rows.length, n: chapman(a, b, ab) };
}
const quant = (arr, q) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(q * (s.length - 1))]; };

/** A planted set as capture histories, using saved reads. Kimi as list A, the union of the cheap two as list B. */
function plantedRows(set, readers) {
  const tb = C.loadSet(set);
  const get = (j) => (set === 'dev' ? C.scorePlants(L.readJsonl(L.path.join(L.TMP, 'raw', `${j}.jsonl`)), 'dev') : C.scorePlants(C.readRaw(j, set), set));
  const [A, B1, B2] = readers.map(get);
  const plants = tb.plants.filter((p) => (set === 'dev' || p.split === 'heldout') && A.has(p.id) && B1.has(p.id) && B2.has(p.id));
  return plants.map((p) => ({ id: p.id, kind: p.kind, a: !!A.get(p.id), b: !!(B1.get(p.id) || B2.get(p.id)) }));
}

const conf = audit.findings.filter((f) => f.status === 'confirmed');
const groups = {
  'english (no fact check before)': { filter: (l) => l.startsWith('english/'), levels: 29 },
  'others (passed a check)': { filter: (l) => !l.startsWith('english/') && !l.includes('algebra_1_part_a'), levels: 64 },
  all: { filter: (l) => !l.includes('algebra_1_part_a'), levels: 93 },
};
const toRow = (c) => ({ a: c.by.has('kimi31'), b: c.by.has('grok43') || c.by.has('glm_flash_zgpu') });
const rand = seeded(20261107);
const res = { calibration: {}, groups: {} };

const sets = [['dev', ['kimi31', 'grok43', 'glm_flash_zgpu']]];
if (process.argv[2] !== 'dev') sets.push(['heldout', ['kimi31', 'grok43', 'ds41_coral']]);
for (const [set, readers] of sets) {
  const rows = plantedRows(set, readers);
  const seen = rows.filter((r) => r.a || r.b);
  const e = est(seen);
  res.calibration[set] = { truth: rows.length, ...e, ratio: +(rows.length / e.n).toFixed(3), catchUnion: +(seen.length / rows.length).toFixed(3), catchA: +(rows.filter((r) => r.a).length / rows.length).toFixed(3) };
  console.log(set, 'plants', rows.length, 'found', seen.length, `A ${e.a} B ${e.b} both ${e.ab}`, 'Chapman', e.n.toFixed(1), 'truth/Chapman', res.calibration[set].ratio, 'union catch', res.calibration[set].catchUnion);
  res.calibration[set].rows = rows;
}
for (const [name, g] of Object.entries(groups)) {
  const cl = clusters(conf.filter((f) => g.filter(f.level)));
  const rows = cl.map(toRow);
  const e = est(rows);
  const out = { levels: g.levels, confirmedRows: conf.filter((f) => g.filter(f.level)).length, clusters: rows.length, a: e.a, b: e.b, both: e.ab, chapman: +e.n.toFixed(1), estimates: {} };
  for (const set of Object.keys(res.calibration)) {
    const cal = res.calibration[set];
    const B = 2000; const byRatio = []; const byCatch = [];
    for (let i = 0; i < B; i++) {
      const re = rows.map(() => rows[Math.floor(rand() * rows.length)]);
      const pl = cal.rows.map(() => cal.rows[Math.floor(rand() * cal.rows.length)]);
      const seenP = pl.filter((r) => r.a || r.b);
      const eP = est(seenP); const ratio = pl.length / eP.n; const catchU = seenP.length / pl.length;
      const eR = est(re);
      byRatio.push(eR.n * ratio); byCatch.push(re.length / catchU);
    }
    const mid = (a) => quant(a, 0.5);
    out.estimates[set] = {
      chapmanCorrected: [+quant(byRatio, 0.025).toFixed(1), +mid(byRatio).toFixed(1), +quant(byRatio, 0.975).toFixed(1)],
      foundOverCatch: [+quant(byCatch, 0.025).toFixed(1), +mid(byCatch).toFixed(1), +quant(byCatch, 0.975).toFixed(1)],
      remainingPerLevelBeforeRepair: [+((quant(byCatch, 0.025) - rows.length) / g.levels).toFixed(3), +((mid(byRatio) - rows.length) / g.levels).toFixed(3), +((quant(byRatio, 0.975) - rows.length) / g.levels).toFixed(3)],
    };
  }
  res.groups[name] = out;
  console.log(name, JSON.stringify({ levels: out.levels, clusters: out.clusters, a: e.a, b: e.b, both: e.ab, chapman: out.chapman }));
  for (const [s, v] of Object.entries(out.estimates)) console.log(' ', s, JSON.stringify(v));
}
for (const s of Object.keys(res.calibration)) delete res.calibration[s].rows;
L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'capture-recapture.json'), res);
process.exit(0);
