/**
 * Tests for docs/SCORECARD-REAL.md: the switches are off by default and change nothing; active measurement; anchors; the refit's gates. Synthetic rows only, temp files only.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const M = require('../services/scorecard/active-measure');
const RR = require('../services/scorecard/refit-records');
const A = require('../services/scorecard/refit-auto');
const model = require('../services/onboarding/model');
const { Planner } = require('../services/onboarding/plan');
const { byId } = require('../services/onboarding/pool');
const { STATS } = require('../services/scorecard/stats');
const { ceilings, INDEX, vNeeded } = require('../services/scorecard/ceilings');

const clearSwitches = () => { for (const k of ['SCORECARD_ACTIVE', 'SCORECARD_SELF_WORTH', 'DAILY_SHORT_FORM', 'SCORECARD_ANCHOR', 'SCORECARD_ACTIVE_MINGAIN']) delete process.env[k]; };
clearSwitches();
const rngOf = (seed) => { let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; u.normal = () => Math.sqrt(-2 * Math.log(u() || 1e-9)) * Math.cos(2 * Math.PI * u()); return u; };
const daily = (p) => { p.mode = { ...p.mode, id: 'daily', budgetSec: 300, minGainPerMin: 0.05, margin: 1.1, required: [] }; p.queue = []; p.elapsed = 0; p.available = (it) => ['forced', 'scale', 'span', 'speed'].includes(it.kind); return p; };

// 1. every measure has a class; 95 needs a correlation near .96 on the simulated mix
{
  assert.strictEqual(Object.keys(INDEX).length, STATS.length);
  for (const s of STATS) assert(ceilings()[s.id], s.id);
  assert(Math.abs(vNeeded(95, 18.4) - 0.963) < 0.002, 'v needed');
  console.log('ok  ceilings cover every measure');
}

// 2. off by default: a planner with no switches picks exactly what it would have
{
  const seq = () => { const p = daily(new Planner('quick', {})); const ids = []; for (let i = 0; i < 12; i++) { const it = p.next(); if (!it) break; ids.push(it.id); p.record(it, Object.fromEntries(it.informs.map((x) => [x.stat, 0.3])), it.sec); } return ids; };
  const a = seq(); const b = seq();
  assert.deepStrictEqual(a, b);
  assert(!M.enabled() && !M.shortFormK() && !M.anchorShare() && !M.selfWorthOn());
  const p = new Planner('quick', {}); M.attach(p, 1, {});
  assert(!p.selectionState && !p.anchorFor && !p.readValidity, 'attach does nothing with the switches off');
  console.log('ok  switches off: unchanged');
}

// 3. active: a measure behaviour has read well stops being asked about; what is fed to the card is untouched
{
  process.env.SCORECARD_ACTIVE = '1';
  const reads = Object.fromEntries(STATS.map((s) => [s.id, { mass: 8, value: 50 }]));
  const p = daily(new Planner('quick', {})); M.attach(p, 7, reads);
  assert(p.selectionState && p.selectionState !== p.state, 'a separate selection state');
  assert(p.selectionState.fam.processing_velocity.__card, 'behaviour precision in the selection state');
  assert(!p.state.fam.processing_velocity, 'never in the real state');
  const s = M.selectionFor(model.emptyState(), reads);
  assert(s.behaviour.processing_velocity > s.behaviour.humor_receptivity * 5, 'a performance measure holds far more than a taste');
  const it = p.next();
  assert(it && it.id === byId[it.id].id, 'the pick is the real pool item');
  const before = JSON.stringify(p.state.fam);
  p.record(it, Object.fromEntries(it.informs.map((x) => [x.stat, 1])), it.sec);
  assert(JSON.stringify(p.state.fam) !== before, 'an answer reaches the state');
  assert(!Object.keys(p.state.fam).some((k) => p.state.fam[k].__card), 'pseudo family stays out of the state');
  // answers change the picks: a disagreement cuts the behaviour precision
  const st = model.emptyState(); for (let i = 0; i < 6; i++) model.bump(st, 'rush_tendency', 'scale', 0.5, 1.2);
  const hi = M.selectionFor(st, { ...reads, rush_tendency: { mass: 8, value: 10 } });
  const same = M.selectionFor(st, { ...reads, rush_tendency: { mass: 8, value: 80 } });
  assert(hi.behaviour.rush_tendency < same.behaviour.rush_tendency, 'a conflict lowers trust in the card');
  // the stop rule ends a run for a learner it knows
  process.env.SCORECARD_ACTIVE_MINGAIN = '50';
  const q = daily(new Planner('quick', {})); M.attach(q, 7, reads);
  assert.strictEqual(q.next(), null, 'nothing is worth asking at a high threshold');
  clearSwitches();
  console.log('ok  active measurement');
}

// 4. self-report worth: a behaviour measure's self-report item counts less in what is read
{
  process.env.SCORECARD_SELF_WORTH = '1';
  const p = daily(new Planner('quick', {})); M.attach(p, 8, {});
  assert(p.readValidity('rush_tendency', 'self', 0.25) < 0.25 && p.readValidity('evaluation_anxiety', 'scale', 0.25) === 0.25 && p.readValidity('rush_tendency', 'speed', 0.25) === 0.25);
  clearSwitches();
  console.log('ok  self-report worth');
}

// 5. anchors: a stable share is held back, never reaches the state, and is kept with its halves
{
  process.env.SCORECARD_ANCHOR = '0.25';
  let held = 0; for (let i = 0; i < 2000; i++) if (M.isAnchor(5, `x${i}`)) held += 1;
  assert(Math.abs(held / 2000 - 0.25) < 0.04, `share ${held}`);
  assert.strictEqual(M.isAnchor(5, 'abc'), M.isAnchor(5, 'abc'));
  const p = daily(new Planner('quick', {})); M.attach(p, 5, {}, { dayKey: '2026-11-15' });
  const it = byId['sc:0']; p.anchorFor = () => true;
  p.record(it, Object.fromEntries(it.informs.map((x) => [x.stat, 1])), 9);
  assert(!Object.keys(p.state.fam).length, 'a held-back answer stays out of the state');
  assert(p.anchors.length === it.informs.length);
  const kept = M.mergeAnchors({}, p.anchors);
  assert.strictEqual(kept[it.informs[0].stat].scale.n, 1);
  const again = Planner.from(JSON.parse(JSON.stringify({ ...p.toJSON(), mode: 'quick' })), {});
  assert.strictEqual(again.anchors.length, p.anchors.length, 'anchors survive a saved run');
  clearSwitches();
  console.log('ok  anchors');
}

// 6. who counts; cleaning a messy log; the shared-device check
const helpers = { isAdmin: (u) => !!u.admin, isTester: () => false, allowed: (u) => !u.noConsent };
{
  assert.strictEqual(RR.excluded({ id: 6689, beta_tester: {} }, helpers), 'owner account');
  assert.strictEqual(RR.excluded({ id: 1, admin: true, beta_tester: {} }, helpers), 'admin');
  assert.strictEqual(RR.excluded({ id: 1 }, helpers), 'not a tester');
  assert.strictEqual(RR.excluded({ id: 1, beta_tester: {}, noConsent: true }, helpers), 'consent rule');
  assert.strictEqual(RR.excluded({ id: 1, beta_tester: {} }, helpers), null);
  const dirty = RR.cleanItems([{ id: 1, correct: true, ms: 1000, created_at: '2026-11-15T10:00:00Z' }, { id: 1, correct: true, ms: 1000, created_at: '2026-11-15T10:00:00Z' }, { id: 2, correct: null, created_at: '2026-11-15T10:00:00Z' }, { id: 3, correct: true, ms: null, created_at: 'nope' }, { id: 4, correct: false, ms: 'x', created_at: '2026-11-15T10:01:00Z' }, { id: 5, correct: true, preview: true, created_at: '2026-11-15T10:01:00Z' }]);
  assert.deepStrictEqual(dirty.map((r) => r.id), [1, 4]);
  assert.strictEqual(dirty[1].ms, 0);
  const log = (rng, sits, fn) => { const rows = []; let id = 0; for (let s = 0; s < sits; s++) { const [m, p] = fn(s); for (let i = 0; i < 12; i++) rows.push({ id: ++id, session_id: s, correct: rng() < p, ms: Math.exp(m + 0.25 * rng.normal()), created_at: new Date(Date.UTC(2026, 0, 1 + s, 10, i)).toISOString() }); } return rows; };
  const r = rngOf(1); let fp = 0; let tp = 0; const N = 200;
  for (let k = 0; k < N; k++) {
    const m = 9 + 0.5 * r.normal(); const p = 0.5 + 0.3 * r();
    if (RR.sharedDevice(log(r, 20, () => [m + 0.15 * r.normal(), p])).flagged) fp += 1;
    if (RR.sharedDevice(log(r, 20, (s) => (s % 2 ? [m, p] : [m + 1.2, Math.max(0.2, p - 0.3)]))).flagged) tp += 1;
  }
  assert(fp / N < 0.05, `false positives ${fp / N}`);
  assert(tp / N > 0.8, `true positives ${tp / N}`);
  assert(!RR.sharedDevice(log(r, 3, () => [9, 0.7])).flagged, 'too few sittings are never flagged');
  console.log(`ok  who counts, cleaning; shared device on a synthetic pair: caught ${(100 * tp / N).toFixed(0)}%, false alarms ${(100 * fp / N).toFixed(1)}%`);
}

// 7. the refit on crowds whose card has a known fault: spread too wide. It must fit on the fit group, pass on the held-out group, refuse a useless card change, and never name a learner.
const IDS = STATS.map((s) => s.id).filter((id) => ['scale', 'preference'].includes(INDEX[id])).slice(0, 12);
function crowd(n, { slope = 1.8, itemsPerHalf = 6, r = 0.5, seed = 3 } = {}) {
  const rng = rngOf(seed); const out = [];
  for (let u = 0; u < n; u++) {
    const reads = {}; const rawAnchor = {};
    for (const id of IDS) {
      const z = rng.normal(); const card = z * 0.6 + 0.8 * rng.normal(); // the card's signal, before the fault
      const half = () => { let s = 0; for (let i = 0; i < itemsPerHalf; i++) s += r * z + Math.sqrt(1 - r * r) * rng.normal(); return s / itemsPerHalf; };
      const a = half(); const b = half();
      reads[id] = { m: Math.max(2, Math.min(98, 50 + 17 * slope * card)), conf: 50 };
      rawAnchor[id] = { c: (a + b) / 2, a, b, n: itemsPerHalf * 2 };
    }
    out.push({ userId: 1000 + u, reads, rawAnchor, feat: {}, rows: [] });
  }
  return out;
}
{
  const ev = A.evaluate(crowd(240), null);
  assert(ev.result, 'a result');
  assert(ev.heldN > 40 && ev.heldN < 110, `held ${ev.heldN}`);
  assert(ev.result.pass, `should pass: lo ${ev.result.gainLo}`);
  assert(ev.result.overall.candidate > ev.result.overall.current, 'the candidate should beat a too-wide card');
  const b = Object.values(ev.betas)[0].beta;
  assert(b < 0.8, `a too-wide card needs a slope well below 1: ${b}`);
  // the estimate of accuracy after removing anchor noise is near what the crowd's true error implies (card r .6 with spread fixed: rmse about 17 x sqrt(1 - .36))
  const fair = A.evaluate(crowd(400, { slope: 1, seed: 11 }), null);
  const trueBest = 100 - 0.8 * 17 * Math.sqrt(1 - 0.36);
  assert(Math.abs(fair.result.overall.candidate - trueBest) < 3, `estimate ${fair.result.overall.candidate.toFixed(1)} against ${trueBest.toFixed(1)}`);
  assert(Math.abs(fair.result.overall.guess - (100 - 0.8 * 17)) < 2.5, `guess ${fair.result.overall.guess.toFixed(1)}`);
  // an anchor that is pure noise: no usable anchors, nothing fitted
  const noiseRng = rngOf(41); const none = crowd(240); for (const rec of none) for (const id of IDS) { rec.rawAnchor[id].a = noiseRng(); rec.rawAnchor[id].b = noiseRng(); rec.rawAnchor[id].c = noiseRng(); }
  const sc = RR.anchorScale(none.filter((x) => !A.isHeld(x.userId)));
  assert(Object.values(sc).filter((x) => x.usable).length <= 2, 'noise anchors are refused');
  console.log(`ok  refit on a crowd: gain interval ${ev.result.gainLo.toFixed(0)} to ${ev.result.gainHi.toFixed(0)}, beta ${b.toFixed(2)}, estimate ${fair.result.overall.candidate.toFixed(1)} against ${trueBest.toFixed(1)}`);
}

// 8. run() and promote(): a waiting run writes no candidate; a passing one writes, reports the owner's way, names no one; a failing one is refused
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-real-'));
  const save = { REFIT_DIR: process.env.REFIT_DIR, READOUT_FILE: process.env.READOUT_FILE };
  process.env.REFIT_DIR = dir; process.env.READOUT_FILE = path.join(dir, 'readout.json');
  const source = (recs) => {
    const rows = (u) => { const out = []; for (let s = 0; s < 8; s++) for (let i = 0; i < 15; i++) out.push({ id: u * 1000 + s * 20 + i, session_id: s, correct: (u * 7 + i) % 3 > 0, ms: 4000 + ((u + s) % 5) * 300 + i, created_at: new Date(Date.UTC(2026, 10, 1 + s * 2, 10, i)).toISOString(), skill_id: 'a', difficulty: 5 }); return out; };
    return { users: recs.map((r) => ({ id: r.userId, beta_tester: {} })), itemsOf: rows, anchorsKept: (id) => { const r = recs.find((x) => x.userId === id); return Object.fromEntries(Object.entries(r.rawAnchor).map(([s, a]) => [s, { scale: { n: a.n, sx: a.c * a.n, sr: 0, a: [a.a * a.n / 2, a.n / 2], b: [a.b * a.n / 2, a.n / 2] } }])); }, cardReads: (id) => recs.find((x) => x.userId === id).reads, featuresOf: () => ({}), helpers };
  };
  const now = Date.UTC(2026, 11, 20);
  const w = A.run(source(crowd(10)), { now });
  assert(/waiting/.test(w.status)); assert(!fs.existsSync(A.files({}).candidate));
  assert(!A.promote().ok, 'nothing to promote');
  const big = crowd(240);
  const res = A.run(source(big), { now });
  assert(/passed/.test(res.status), res.status);
  const rep = fs.readFileSync(A.files({}).report, 'utf8');
  for (const needle of ['guess', 'error removed', 'held-out', 'REAL testers']) assert(rep.toLowerCase().includes(needle.toLowerCase()), `report lacks ${needle}`);
  assert(!rep.includes('1001') && !JSON.stringify(JSON.parse(fs.readFileSync(A.files({}).candidate, 'utf8'))).includes('userId'), 'no learner in report or artifact');
  assert(A.promote().ok, 'promote');
  assert(fs.existsSync(process.env.READOUT_FILE));
  // a candidate that failed is refused
  fs.writeFileSync(A.files({}).candidate, JSON.stringify({ models: {}, check: { pass: false } }));
  assert(!A.promote().ok, 'a failed candidate is refused');
  for (const k of Object.keys(save)) { if (save[k] === undefined) delete process.env[k]; else process.env[k] = save[k]; }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('ok  run and promote');
}
console.log('scorecard-real-test: all passed');
