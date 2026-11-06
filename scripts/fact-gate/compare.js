#!/usr/bin/env node
/**
 * Scores raw judge reads. Catch: strict (scoring.catches), not counting a flag that the same judge raised on the clean text of that level for the same part and words.
 *   node scripts/fact-gate/compare.js <dev|heldout|all> judge1 judge2 ...
 * With no judges: all raw files. Combination specs: "a+b" (union), "a&b" (both must flag the plant / same part on clean), "a+b>d" (union, then decider d keeps a flag).
 */
const L = require('./lib');
const { catches, placeOf, words } = require('./scoring');
const code = require('../../services/fact-code-checks');

const [, , SPLIT = 'dev', ...SPECS] = process.argv;
const tb = L.readJson(L.path.join(L.DOCS, 'testbed.json'));
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const inSplit = (x) => SPLIT === 'all' || x.split === SPLIT;
const plants = tb.plants.filter(inSplit); const clean = tb.clean.filter(inSplit);
const RAW = L.path.join(L.TMP, 'raw');
const safe = (j) => j.replace(/[:/]/g, '_');
const load = (j) => { const m = new Map(); for (const r of L.readJsonl(L.path.join(RAW, `${safe(j)}.jsonl`))) if (r.read) m.set(r.id, r); return m; };
const cache = new Map();
const get = (j) => { if (!cache.has(j)) cache.set(j, load(j)); return cache.get(j); };

// The code pass as a judge.
const codeRun = (lv) => code.checkLevel({ trackId: lv.track, gradeId: lv.grade, blocks: lv.blocks, checks: lv.checks }).map((f) => ({ ...f, why: f.rule }));
const codeCache = new Map();
function codeFlags(id, level, edits, certainOnly) {
  const key = id;
  if (!codeCache.has(key)) codeCache.set(key, codeRun(edits.length ? L.applyEdits(levels.get(level), edits) : levels.get(level)));
  return codeCache.get(key).filter((f) => !certainOnly || f.certain);
}
const flagKey = (f) => `${placeOf(f.where) ? `${placeOf(f.where).word}${placeOf(f.where).index}` : '?'}|${words(f.claim).slice(0, 8).join(' ')}`;

/** Decider rulings: file <decider>.decisions.jsonl with { key: level|flagKey, real: bool }. */
const decisions = new Map();
function ruling(d, fixture, f) {
  if (!decisions.has(d)) { const m = new Map(); for (const r of L.readJsonl(L.path.join(RAW, `${safe(d)}.decisions.jsonl`))) m.set(r.key, r); decisions.set(d, m); }
  return decisions.get(d).get(`${fixture}|${flagKey(f)}`);
}

function flagsFor(judge, id, level, edits) {
  if (judge === 'code') return codeFlags(id, level, edits, true);
  if (judge === 'codeall') return codeFlags(id, level, edits, false);
  const r = get(judge).get(id);
  return r ? r.flags : null;
}
function costFor(judge, id) { if (judge === 'code' || judge === 'codeall') return { cost: 0, ms: 0 }; const r = get(judge).get(id); return r ? { cost: r.cost || 0, ms: r.ms || 0 } : { cost: 0, ms: 0 }; }

function freshFlags(judge, p) {
  const f = flagsFor(judge, p.id, p.level, p.edits);
  if (!f) return null;
  const base = flagsFor(judge, `clean:${p.level}`, p.level, []) || [];
  const baseKeys = new Set(base.map(flagKey));
  return f.filter((x) => !baseKeys.has(flagKey(x)));
}

/** A spec reduced to: caught(plant), flags on clean(level), cost. */
function evaluate(spec) {
  const [left, decider] = spec.split('>');
  const judges = left.split(/[+&]/);
  const need = left.includes('&') ? judges.length : 1;
  const rows = []; let read = 0;
  for (const p of plants) {
    const fs = judges.map((j) => freshFlags(j, p));
    if (fs.some((x) => x === null)) continue;
    read++;
    const hit = fs.map((list) => list.filter((f) => {
      if (!catches(f, p)) return false;
      if (!decider) return true;
      const r = ruling(decider, p.id, f);
      return r ? r.real : f.certain === true;
    }).length > 0);
    rows.push({ id: p.id, kind: p.kind, track: p.track, consistent: p.consistent, caught: hit.filter(Boolean).length >= need });
  }
  const cl = []; let cost = 0; let ms = 0; let readsCost = 0;
  for (const c of clean) {
    const id = `clean:${c.level}`;
    const fs = judges.map((j) => flagsFor(j, id, c.level, []));
    if (fs.some((x) => x === null)) continue;
    for (const j of judges) { const k = costFor(j, id); cost += k.cost; ms = Math.max(ms, 0) + k.ms; }
    readsCost++;
    let flags;
    if (need > 1) {
      const parts = fs.map((list) => new Set(list.map((f) => { const q = placeOf(f.where); return q ? `${q.word}${q.index}` : '?'; })));
      flags = fs[0].filter((f) => { const q = placeOf(f.where); const k = q ? `${q.word}${q.index}` : '?'; return parts.every((s) => s.has(k)); });
    } else flags = fs.flat();
    if (decider) flags = flags.filter((f) => { const r = ruling(decider, id, f); return r ? r.real : f.certain === true; });
    const uniq = new Map(); flags.forEach((f) => uniq.set(flagKey(f), f));
    cl.push({ level: c.level, flags: [...uniq.values()] });
  }
  return { spec, rows, read, cl, cost: readsCost ? cost / readsCost : 0, ms: readsCost ? ms / readsCost : 0 };
}

const adjudicated = (() => { const m = new Map(); for (const r of L.readJsonl(L.path.join(RAW, 'truth.decisions.jsonl'))) m.set(r.key, r.real); return m; })();
function line(e) {
  const k = e.rows.filter((r) => r.caught).length; const n = e.rows.length;
  const fa = e.cl.filter((c) => c.flags.length).length;
  let falseLv = 0; let trueFlags = 0; let falseFlags = 0; let unknown = 0;
  for (const c of e.cl) {
    let anyFalse = false;
    for (const f of c.flags) {
      const t = adjudicated.get(`clean:${c.level}|${flagKey(f)}`);
      if (t === true) trueFlags++; else if (t === false) { falseFlags++; anyFalse = true; } else { unknown++; anyFalse = true; }
    }
    if (anyFalse) falseLv++;
  }
  return `${e.spec.padEnd(34)} ${L.fmtRate(k, n).padEnd(24)} clean lv flagged ${String(fa).padStart(2)}/${e.cl.length}, false-alarm lv ${falseLv} (${e.cl.length ? L.pct(falseLv / e.cl.length) : '-'}) flags t/f/? ${trueFlags}/${falseFlags}/${unknown}  $${e.cost.toFixed(4)}/lv ${(e.ms / 1000).toFixed(0)}s`;
}

const specs = SPECS.length ? SPECS : L.fs.readdirSync(RAW).filter((f) => f.endsWith('.jsonl') && !f.includes('decisions')).map((f) => f.replace('.jsonl', '').replace(/_(hunt|claims|blind|lens)$/, ':$1'));
const allRows = [];
for (const s of specs) {
  const e = evaluate(s);
  allRows.push(e);
  console.log(line(e));
}
if (process.env.BY_KIND) {
  const kinds = [...new Set(tb.plants.map((p) => p.kind))].sort();
  for (const e of allRows) {
    console.log(`-- ${e.spec}`);
    for (const k of kinds) { const r = e.rows.filter((x) => x.kind === k); console.log(`   ${k.padEnd(26)} ${L.fmtRate(r.filter((x) => x.caught).length, r.length)}`); }
    for (const t of ['math', 'english', 'spanish']) { const r = e.rows.filter((x) => x.track === t); console.log(`   [${t}] ${L.fmtRate(r.filter((x) => x.caught).length, r.length)}`); }
    const c = e.rows.filter((x) => x.consistent); console.log(`   [self-consistent plants] ${L.fmtRate(c.filter((x) => x.caught).length, c.length)}`);
  }
}
if (process.env.MISSES) {
  const e = allRows[0];
  for (const r of e.rows.filter((x) => !x.caught)) { const p = tb.plants.find((x) => x.id === r.id); const ed = p.edits[0]; console.log(r.id, r.kind.slice(0, 8), p.level.slice(0, 20), ed.word[0] + ed.index, String(ed.wrong || (ed.set && ed.set.answer) || ed.value).slice(0, 80)); }
}
module.exports = { flagKey };
