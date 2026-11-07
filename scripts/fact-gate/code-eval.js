#!/usr/bin/env node
/**
 * Step 3: what the code pass catches for free. dev while tuning (`node code-eval.js dev`), held-out once (`heldout`), `all` for both.
 * Prints catch by kind (certain, and certain + suspect), flags on clean levels. Long lists go to a file in the temp folder.
 */
const L = require('./lib');
const { catches } = require('./scoring');
const code = require('../../services/fact-code-checks');

const SPLIT = process.argv[2] || 'dev';
const tb = L.readJson(L.path.join(L.DOCS, 'testbed.json'));
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const run = (lv) => code.checkLevel({ trackId: lv.track, gradeId: lv.grade, blocks: lv.blocks, checks: lv.checks });
const inSplit = (x) => SPLIT === 'all' || x.split === SPLIT;

const cleanFlags = new Map();
for (const c of tb.clean) cleanFlags.set(c.level, run(levels.get(c.level)));
const sig = (f) => `${f.where}|${f.rule}|${f.claim}`;
const rows = [];
for (const p of tb.plants.filter(inSplit)) {
  const lv = L.applyEdits(levels.get(p.level), p.edits);
  const base = new Set((cleanFlags.get(p.level) || []).map(sig));
  const fresh = run(lv).filter((f) => !base.has(sig(f))); // a flag the clean level had too is not about the plant
  const cert = fresh.filter((f) => f.certain);
  rows.push({ id: p.id, src: p.src, kind: p.kind, level: p.level, caught: cert.length > 0, caughtAny: fresh.length > 0, strict: fresh.some((f) => catches(f, p)), rules: [...new Set(fresh.map((f) => f.rule))] });
}
const kinds = [...new Set(tb.plants.map((p) => p.kind))].sort();
const line = (name, rs) => `${name.padEnd(28)} n=${String(rs.length).padStart(3)} certain ${L.fmtRate(rs.filter((r) => r.caught).length, rs.length).padEnd(24)} +suspect ${L.fmtRate(rs.filter((r) => r.caughtAny).length, rs.length)}`;
console.log(line('ALL', rows));
for (const k of kinds) console.log(line(k, rows.filter((r) => r.kind === k)));
const cl = tb.clean.filter(inSplit);
const fa = cl.map((c) => ({ level: c.level, flags: cleanFlags.get(c.level) }));
const certLv = fa.filter((x) => x.flags.some((f) => f.certain)); const anyLv = fa.filter((x) => x.flags.length);
console.log(`clean levels ${cl.length}: with a certain flag ${certLv.length}, with any flag ${anyLv.length}; certain flags ${fa.reduce((n, x) => n + x.flags.filter((f) => f.certain).length, 0)}, suspect ${fa.reduce((n, x) => n + x.flags.filter((f) => !f.certain).length, 0)}`);
const out = L.path.join(L.TMP, `code-eval-${SPLIT}.json`);
L.writeJson(out, { rows, clean: fa.filter((x) => x.flags.length) });
console.log(out);
