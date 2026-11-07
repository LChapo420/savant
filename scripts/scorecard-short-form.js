/**
 * The short form of the daily check's IPIP items (docs/SCORECARD-REAL.md part 3). Writes content/daily-check/short-form.json.
 *   node scripts/scorecard-short-form.js [--print]
 * Greedy: at each step the item that removes the most posterior sd over the 100 measures, for a learner whose card already holds a month of behaviour (active-measure.js), with each self-report
 * counted only as much as a self-report is worth for that kind of measure (ceilings.js). Within a scale, agree-keyed and reverse-keyed items take turns where the scale has both, so a learner who
 * agrees with everything cancels out. The items are the IPIP's own; the mapping to measures and every validity are OURS and ASSUMED (content/daily-check/scale-items.js): this picks by what the model
 * believes, so a real refit must check it. Also lists the same curve for three response-worth settings, so the choice can be seen to be stable or not.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const model = require('../services/onboarding/model');
const { pool } = require('../services/onboarding/pool');
const { STATS } = require('../services/scorecard/stats');
const { INDEX, SELF_REPORT_WORTH } = require('../services/scorecard/ceilings');
const M = require('../services/scorecard/active-measure');
const { ITEMS } = require('../content/daily-check/scale-items');

const TASKS = ['t:span_verbal', 't:symbol_match', 't:switch_a'];
const byIdScale = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const reads = Object.fromEntries(STATS.map((s) => [s.id, { mass: M.FULL_MASS }]));

function totalSd(state) { return STATS.reduce((a, s) => a + model.posterior(state, s.id).sd * model.POP_SD, 0); }

function pick(worthScale = 1, K = 99) {
  const worth = (stat) => Math.min(1, (SELF_REPORT_WORTH[INDEX[stat]] === undefined ? 1 : SELF_REPORT_WORTH[INDEX[stat]]) * worthScale);
  const scale = pool.filter((it) => it.family === 'scale').map((it) => ({ ...it, informs: it.informs.map((i) => ({ ...i, r: i.r * worth(i.stat) })) }));
  const { sel } = M.selectionFor(model.emptyState(), reads);
  const lastKey = {}; const used = new Set(); const out = []; let sd = totalSd(sel);
  const hasBoth = (sc) => { const ks = new Set(ITEMS.filter((i) => i.scale === sc).map((i) => i.key)); return ks.size === 2; };
  for (let k = 0; k < K && used.size < scale.length; k++) {
    let best = null;
    for (const it of scale) {
      if (used.has(it.id)) continue;
      const src = byIdScale[it.id];
      const left = ITEMS.filter((i) => i.scale === src.scale && i.key !== lastKey[src.scale] && !used.has(i.id)).length;
      if (lastKey[src.scale] !== undefined && hasBoth(src.scale) && src.key === lastKey[src.scale] && left > 0) continue; // take turns while the other key has items left
      const g = model.gainOf(sel, it, null);
      if (!best || g > best.g) best = { it, g };
    }
    if (!best) break;
    used.add(best.it.id);
    const src = byIdScale[best.it.id]; lastKey[src.scale] = src.key;
    for (const i of best.it.informs) model.bump(sel, i.stat, 'scale', model.eff('scale', i.r), 0);
    const now = totalSd(sel);
    out.push({ id: best.it.id, text: src.text, scale: src.scale, key: src.key, gain: +(sd - now).toFixed(3), cum: 0 });
    sd = now;
  }
  let c = 0; for (const x of out) { c += x.gain; x.cum = +c.toFixed(2); }
  return out;
}

const main = pick(1);
const low = pick(0.5).map((x) => x.id); const high = pick(1.5).map((x) => x.id);
const overlap = (a, b, k) => a.slice(0, k).filter((x) => b.slice(0, k).includes(x)).length;
const res = { note: 'Items are the IPIP\'s own (public domain). The mapping to scorecard measures and every validity are ours and ASSUMED; the order is what our model believes. Not a validated instrument. Written by scripts/scorecard-short-form.js.', tasks: TASKS, items: main };
fs.writeFileSync(path.join(__dirname, '..', 'content', 'daily-check', 'short-form.json'), `${JSON.stringify(res, null, 1)}\n`);
if (process.argv.includes('--print')) {
  for (const k of [6, 12, 18, 24, 36, 48, 99]) console.log(`K=${k} seconds ${k * 9} total sd removed ${main[Math.min(k, main.length) - 1].cum} (share of the 99's ${Math.round((100 * main[Math.min(k, main.length) - 1].cum) / main[main.length - 1].cum)}%) | same picks as worth x0.5: ${overlap(main.map((x) => x.id), low, k)}, x1.5: ${overlap(main.map((x) => x.id), high, k)}`);
  const sc = {}; for (const x of main.slice(0, 24)) sc[x.scale] = (sc[x.scale] || []).concat(x.key); console.log(JSON.stringify(sc));
  console.log(main.slice(0, 12).map((x) => `${x.text} [${x.scale}${x.key < 0 ? ', reversed' : ''}]`).join('\n'));
}
