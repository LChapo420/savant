#!/usr/bin/env node
/**
 * The bridge to the old number: the same 12 planted and 8 clean levels as docs/FIRST-LESSON.md round 3 (scripts/fact-parts-eval.js fixtures, same scorer), read by the new checkers.
 * Today's pool gate on these: 8/12 caught, 1/8 false alarms; Sonnet 9/12, 3/8.
 *   DB_FILE=copy node scripts/fact-gate/bridge.js judge1 judge2 ...
 */
const L = require('./lib');
const J = require('./judges');

const set = require('../../docs/fact-verifier-set.json');
const dbCopy = L.readJson(L.DB);
const plans = dbCopy.block_plans.filter((p) => (p.blocks || []).length && (p.checks || []).length);
const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
function distinctive(pl) { const orig = new Set(words(pl.original)); const w = words(pl.wrong).filter((t) => !orig.has(t)); return w.length ? w : words(pl.wrong); }
function caughtBy(failed, pl) {
  const dist = distinctive(pl); const orig = words(pl.original).filter((t) => !new Set(words(pl.wrong)).has(t));
  return failed.some((c) => { const claim = new Set(words(c.claim)); const truth = new Set(words(`${c.truth} ${c.why}`)); return dist.some((t) => claim.has(t)) || (orig.length && orig.some((t) => truth.has(t)) && dist.some((t) => claim.has(t) || truth.has(t))); });
}
const toChecks = (p) => p.checks.map((x, i) => ({ index: i, format: x.format, prompt: x.prompt, options: x.options, choices: x.choices, answer: x.answer, rationale: x.rationale, accepts: x.accepts, hint: x.hint }));
function fixture(c) {
  const pl = c.planted;
  for (const p of plans) {
    if (c.kind === 'block') {
      const orig = pl ? JSON.stringify(c.data).replace(pl.wrong, pl.original) : JSON.stringify(c.data);
      const i = p.blocks.findIndex((b) => b && b.block === c.block && JSON.stringify(b.data) === orig);
      if (i < 0) continue;
      const blocks = p.blocks.map((b, k) => ({ index: b.index ?? k, block: b.block, data: k === i ? c.data : b.data }));
      return { plan: p, blocks, checks: toChecks(p), target: { word: 'block', index: blocks[i].index } };
    }
    const i = p.checks.findIndex((x) => x && x.format === c.check.format && x.choices && JSON.stringify(x.choices) === JSON.stringify(c.check.choices) && (pl ? x.prompt !== c.check.prompt || x.rationale !== c.check.rationale : true) && (x.prompt === c.check.prompt || x.rationale === c.check.rationale));
    if (i < 0) continue;
    const checks = toChecks(p); checks[i] = { ...checks[i], prompt: c.check.prompt, rationale: c.check.rationale };
    return { plan: p, blocks: p.blocks.map((b, k) => ({ index: b.index ?? k, block: b.block, data: b.data })), checks, target: { word: 'check', index: i } };
  }
  return null;
}
const placeOf = (where) => { const m = /(block|check)\s*(\d+)/i.exec(where || ''); return m ? { word: m[1].toLowerCase(), index: Number(m[2]) } : null; };
(async () => {
  const cases = [];
  for (const c of [...set.fact.filter((x) => x.planted), ...set.fact.filter((x) => !x.planted)]) { const f = fixture(c); if (f) cases.push({ c, f }); }
  const pick = [...cases.filter((x) => x.c.planted).slice(0, 12), ...cases.filter((x) => !x.c.planted).slice(0, 8)];
  const allPl = cases.filter((x) => x.c.planted); const allCl = cases.filter((x) => !x.c.planted);
  console.log(`fixtures: ${allPl.length} planted, ${allCl.length} clean; first 12/8 as in round 3`);
  const results = {};
  for (const judge of process.argv.slice(2)) {
    const rows = [];
    // eslint-disable-next-line no-await-in-loop
    await L.runPool(process.env.BRIDGE_ROUND3 ? pick : [...allPl, ...allCl], 3, async ({ c, f }) => {
      const lv = { track: f.plan.track_id, grade: f.plan.grade_id, level: f.plan.level, blocks: f.blocks, checks: f.checks };
      let v = null;
      for (let a = 0; a < 3 && !v; a++) { try { v = await J.read(judge, lv); } catch (e) { await L.sleep(3000); } } // eslint-disable-line no-await-in-loop
      if (!v) { rows.push({ id: c.id, read: false }); return; }
      const on = v.flags.filter((x) => { const p = placeOf(x.where); return p && p.word === f.target.word && p.index === f.target.index; });
      rows.push({ id: c.id, read: true, planted: !!c.planted, caught: c.planted ? caughtBy(on, c.planted) : null, fa: c.planted ? null : on.length > 0, other: v.flags.length - on.length, cost: v.cost });
    });
    results[judge] = rows;
    const first = new Set(pick.map((x) => x.c.id));
    const s = (rs) => { const pl = rs.filter((r) => r.planted); const cl = rs.filter((r) => r.read && !r.planted); return `caught ${pl.filter((r) => r.caught).length}/${pl.length}, false alarms ${cl.filter((r) => r.fa).length}/${cl.length}, others flagged/read ${(rs.reduce((n, r) => n + (r.other || 0), 0) / Math.max(1, rs.filter((r) => r.read).length)).toFixed(1)}, $${(rs.reduce((n, r) => n + (r.cost || 0), 0) / Math.max(1, rs.filter((r) => r.read).length)).toFixed(4)}/read`; };
    console.log(`RESULT ${judge}: round-3 set ${s(rows.filter((r) => first.has(r.id)))} || whole set ${s(rows)}`);
  }
  L.writeJson(L.path.join(L.TMP, 'bridge.json'), results);
  process.exit(0);
})();
