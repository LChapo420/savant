/**
 * Tests for the calibrated read-out and its refit path (services/scorecard/readout.js, readout-refit.js; docs/SCORECARD-95.md). SYNTHETIC data only; no database.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../services/scorecard/readout');
const RF = require('../services/scorecard/readout-refit');

let seed = 12345;
const u = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 1) / 4294967297; };
const normal = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const MEASURES = ['m1', 'm2', 'm3', 'm4'];

/** A synthetic learner: truth, the card's read (a weak, biased view of it), an anchor (truth plus noise), and two halves of one source. */
function learner(userId, { slope = 0.4, bias = 6, anchorNoise = 8 } = {}) {
  const reads = {}; const anchor = {}; const halves = { tap: {} };
  for (const id of MEASURES) {
    const t = Math.max(2, Math.min(98, 50 + 17 * normal()));
    const conf = Math.round(20 + 60 * u());
    reads[id] = { m: Math.max(2, Math.min(98, 50 + bias + slope * (t - 50) + 15 * normal())), conf };
    anchor[id] = t + anchorNoise * normal();
    const rel = 0.5; // each half reads the truth with correlation sqrt(rel)
    halves.tap[id] = [t + 17 * Math.sqrt((1 - rel) / rel) * normal(), t + 17 * Math.sqrt((1 - rel) / rel) * normal()];
  }
  return { userId, shareable: true, reads, anchor, halves };
}
const crowd = (n, base, opts) => Array.from({ length: n }, (_, i) => learner(base + i, opts));

// 1. a first fit on 300 synthetic learners removes the card's bias on fresh learners
{
  const recs = crowd(300, 1000);
  const { art, used } = RF.refit(recs, null);
  assert.strictEqual(used, 300);
  const fresh = crowd(200, 5000);
  const err = (f) => fresh.reduce((s, r) => s + MEASURES.reduce((a, id) => a + Math.abs(f(r, id) - r.anchor[id]), 0) / MEASURES.length, 0) / fresh.length;
  const asIs = err((r, id) => r.reads[id].m); const fitted = err((r, id) => R.readS1(art, id, r.reads[id]));
  assert(fitted < asIs - 1, `fitted ${fitted.toFixed(2)} should beat as-is ${asIs.toFixed(2)} by more than a point`);
  console.log(`ok  first fit: error against the anchor ${asIs.toFixed(2)} as is -> ${fitted.toFixed(2)} recalibrated`);
}

// 2. account 6689 and non-shareable records never enter: the artifact is byte-identical with or without them
{
  const recs = crowd(120, 2000);
  const base = RF.refit(recs, null).art;
  const poison = [...crowd(60, 6689, { slope: -2, bias: 40 }).map((r) => ({ ...r, userId: 6689 })), ...crowd(60, 7000, { slope: -2, bias: 40 }).map((r) => ({ ...r, shareable: false })), ...crowd(10, 7100).map((r) => ({ ...r, shareable: undefined }))];
  const withPoison = RF.refit([...recs, ...poison], null);
  assert.deepStrictEqual(withPoison.art.models, base.models, 'excluded learners changed the fit');
  assert.strictEqual(withPoison.dropped, poison.length);
  assert(RF.validity(RF.eligible([...recs, ...poison])).every((v) => v.n <= 120), 'validity counted an excluded record');
  console.log('ok  account 6689, unshared and unflagged records are left out');
}

// 3. a refit on a world that has moved never moves any learner abruptly, and keeps the old model inside the new artifact
{
  const first = RF.refit(crowd(300, 3000), null).art;
  const moved = crowd(300, 4000, { slope: 0.9, bias: -10 }); // the card turns out to be far better than first thought
  const second = RF.refit(moved, first);
  let worst = 0; let p = [];
  for (const r of moved) for (const id of MEASURES) { const d = Math.abs(R.readS1(second.art, id, r.reads[id]) - R.readS1(first, id, r.reads[id])); p.push(d); worst = Math.max(worst, d); }
  p.sort((a, b) => a - b);
  assert(worst <= RF.MAX_ANY + 1e-9, `a learner moved ${worst.toFixed(1)} points`);
  assert(p[Math.floor(p.length * 0.99)] <= RF.MAX_P99 + 1e-9, 'the 99th percentile move is too large');
  assert(MEASURES.some((id) => second.art.models[id].kind === 'mix' && second.art.models[id].alpha > 0), 'the refit should move at least part of the way');
  // repeated refits keep moving toward the new world, each step bounded
  const third = RF.refit(moved, second.art);
  const err = (art) => moved.reduce((s, r) => s + MEASURES.reduce((a, id) => a + Math.abs(R.readS1(art, id, r.reads[id]) - r.anchor[id]), 0), 0) / (moved.length * MEASURES.length);
  assert(err(third.art) <= err(second.art) + 0.05 && err(second.art) <= err(first) + 0.05, 'refits should not make the fit worse');
  console.log(`ok  moved world: largest single change ${worst.toFixed(1)} points (cap ${RF.MAX_ANY}), p99 ${p[Math.floor(p.length * 0.99)].toFixed(1)} (cap ${RF.MAX_P99}); error ${err(first).toFixed(2)} -> ${err(second.art).toFixed(2)} -> ${err(third.art).toFixed(2)}`);
}

// 4. too few learners: nothing moves
{
  const first = RF.refit(crowd(200, 8000), null).art;
  const few = RF.refit(crowd(RF.MIN_N - 1, 9000, { slope: 2 }), first);
  assert.deepStrictEqual(few.art.models, first.models);
  console.log('ok  below the minimum number of learners nothing changes');
}

// 5. the validity report recovers the planted validity and reliability (each half reads the truth with r = sqrt(.5), so the pair has reliability .67 and validity about .83)
{
  const recs = crowd(600, 10000);
  const v = RF.validity(recs, { tap: 0.67 }).filter((x) => x.status === 'measured');
  assert.strictEqual(v.length, MEASURES.length);
  for (const x of v) {
    assert(Math.abs(x.split_half - 0.67) < 0.12, `split-half ${x.split_half}`);
    assert(Math.abs(x.validity - 0.9) < 0.2 && x.validity <= 1, `validity ${x.validity}`);
  }
  const md = RF.reportMarkdown(RF.refit(recs, null), v);
  assert(md.includes('assumed ceiling') && md.includes('measured validity') && md.includes('left out 0'));
  console.log(`ok  validity report: split-half ${v.map((x) => x.split_half).join(', ')}; validity ${v.map((x) => x.validity).join(', ')}`);
}

// 6. the switches: nothing changes without the artifact and the switch; with both, the card's number is re-read and the raw one kept
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'readout-'));
  const scorecard = require('../services/scorecard');
  const { STATS } = require('../services/scorecard/stats');
  const id = STATS[0].id; const card = { stats: {}, subjects: {} };
  const off = scorecard.read(card, id);
  process.env.READOUT_FILE = path.join(tmp, 'a.json'); process.env.SCORECARD_RECAL = '1';
  assert.deepStrictEqual(scorecard.read(card, id), off, 'switch on without an artifact must change nothing');
  fs.writeFileSync(process.env.READOUT_FILE, JSON.stringify({ version: 1, ids: [id], featNames: [], models: { [id]: { kind: 'prior', mean: 61 } } }));
  const on = scorecard.read(card, id);
  assert.strictEqual(on.score, 61); assert.strictEqual(on.raw_score, off.score);
  delete process.env.SCORECARD_RECAL;
  assert.deepStrictEqual(scorecard.read(card, id), off, 'switch off must change nothing');
  delete process.env.READOUT_FILE;
  console.log('ok  switches: off and missing-artifact leave the card alone; on re-reads it and keeps the raw score');
}
console.log('scorecard-95 tests passed');
