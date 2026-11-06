#!/usr/bin/env node
/**
 * Daily burn and run-out day per provider at 100, 250 and 1000 learners, against what is left on the ledgers.
 *
 *   node scripts/beta-load/money.js --run <folder of a load run> [--levels 5] [--active 0.7] [--pipeline-per-day 25] [--start 2026-11-15] [--json]
 *
 * Two parts, kept apart so each can be argued with:
 *   HOW MUCH per learner-day: real average cost per call by task from the real ledgers (what those calls actually cost) x calls per level
 *     as the ledgers show them, x levels written a day (an assumption, --levels). Modelled, not measured on learners: no tester has used it.
 *   WHO PAYS: the split between providers, from a load run with stubbed models (the app's real routing under real RPM limits; the stub only
 *     stands in for the answers). A stub cannot show how often a real model refuses or fails.
 * Free share falls with load: NVIDIA's one key allows 36 calls a minute for the whole app.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const RUN = flag('run');
const LEVELS = Number(flag('levels', 5));
const ACTIVE = Number(flag('active', 0.7));
const PIPELINE = Number(flag('pipeline-per-day', 25)); // what build agents are spending per day on these ledgers until the 15th
const START = new Date(`${flag('start', '2026-11-15')}T00:00:00Z`);
const TODAY = new Date();

const ledgers = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'ledgers-now.js'), '--json']).toString());
const agg = {};
for (const r of ledgers) for (const [t, v] of Object.entries(r.tasks)) { const a = agg[t] || (agg[t] = { c: 0, u: 0 }); a.c += v.calls; a.u += v.usd; }
const per = (t) => (agg[t] && agg[t].c ? agg[t].u / agg[t].c : 0);
const ratio = (t) => (agg.block_layout && agg[t] ? agg[t].c / agg.block_layout.c : 0);

// One tailored level, as the ledgers show it: one layout, then fills, fact checks and repairs in the proportion they really ran.
const level = {
  block_layout: per('block_layout'),
  block_fill: ratio('block_fill') * per('block_fill'),
  fact_verify: ratio('fact_verify') * per('fact_verify'),
  fact_repair: ratio('fact_repair') * per('fact_repair'),
};
const levelUsd = Object.values(level).reduce((a, b) => a + b, 0);
const tutorUsd = 20 * per('dock_help') + 2 * per('tutor_memory_fold');
const uploadUsd = 0.15 * (per('material_outline') + 12 * per('material_lesson') + 3 * per('material_verify') + per('material_notes') + per('material_pack'));
const perLearnerDay = LEVELS * levelUsd + tutorUsd + uploadUsd;

// Who pays: calls and dollars per provider in the run, from each run ledger's log, since the run began.
const t0 = Number(String(path.basename(RUN)).split('-').pop());
const share = {};
let nvidia = 0;
try { const s = JSON.parse(fs.readFileSync(path.join(RUN, 'report.json'), 'utf8')); nvidia = (s.stub.byProvider.nvidia || { calls: 0 }).calls; share.nvidia_calls = nvidia; } catch { /* */ }
const paidCalls = {};
for (const r of ledgers) {
  const f = path.join(RUN, `${r.name}-ledger.json`);
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const log = (j.log || []).filter((l) => Date.parse(l.at) >= t0 && l.outcome !== 'not_billed');
  paidCalls[r.name] = log.length;
}
const paidTotal = Object.values(paidCalls).reduce((a, b) => a + b, 0);
const freeShare = nvidia + paidTotal ? nvidia / (nvidia + paidTotal) : 0;
const split = Object.fromEntries(Object.entries(paidCalls).filter(([, v]) => v).map(([k, v]) => [k, v / paidTotal]));

function simulate(learners, { free: freeWanted = null, providers = null, label = '' } = {}) {
  const callsPerDay = learners * ACTIVE * LEVELS * (1 + ratio('block_fill') + ratio('fact_verify') + ratio('fact_repair'));
  // Best case for the free key: 36 calls a minute over 8 busy hours, 60% of that usable (429s and failures), and calls evenly spread. The run
  // shows the other end: learners at once, and most calls went to paid slots. No NVIDIA means free = 0.
  const freeCap = 36 * 60 * 8 * 0.6;
  const free = freeWanted !== null ? freeWanted : Math.min(0.9, freeCap / Math.max(1, callsPerDay));
  const dailyTotal = learners * ACTIVE * perLearnerDay * (1 - free);
  const left = {};
  const weights = {};
  for (const r of ledgers) if (split[r.name] && (!providers || providers.includes(r.name))) { left[r.name] = Math.max(0, r.left); weights[r.name] = split[r.name]; }
  const until = Math.max(0, (START - TODAY) / 86400000);
  // The build pipeline spends from every balance until the start, at its recent pace, shared the same way.
  for (const r of ledgers) if (split[r.name] && left[r.name] !== undefined) left[r.name] = Math.max(0, left[r.name] - PIPELINE * until * split[r.name]);
  const out = {}; let day = 0; const startLeft = { ...left };
  while (Object.values(left).some((v) => v > 0) && day < 400) {
    day++;
    const live = Object.keys(left).filter((k) => left[k] > 0);
    const weight = live.reduce((x, k) => x + weights[k], 0);
    for (const k of live) {
      left[k] -= (dailyTotal * weights[k]) / weight;
      if (left[k] <= 0) { left[k] = 0; out[k] = day; }
    }
  }
  return { scenario: label, learners, free_share: Number(free.toFixed(2)), usd_per_day: Number(dailyTotal.toFixed(2)), left_at_start_usd: Math.round(Object.values(startLeft).reduce((x, v) => x + v, 0)), by_provider_at_start: Object.fromEntries(Object.entries(startLeft).map(([k, v]) => [k, Math.round(v)])), ran_out_day: out, all_gone_day: day };
}

const AFTER14 = ['munito', 'coral'];
const results = [];
for (const n of [100, 250, 1000]) {
  results.push(simulate(n, { label: 'all providers extended, free key spread evenly' }));
  results.push(simulate(n, { label: 'all providers extended, learners at the same hours', free: freeShare }));
  results.push(simulate(n, { label: 'nothing extended (code default after Nov 14), free key spread evenly', providers: AFTER14 }));
  results.push(simulate(n, { label: 'nothing extended, same hours', providers: AFTER14, free: freeShare }));
  results.push(simulate(n, { label: 'nothing extended and NVIDIA off for learners', providers: AFTER14, free: 0 }));
}
const report = {
  note: 'Modelled. Per-call costs are real ledger averages; levels a day and how much the tutor is used are assumptions; no real learner has used this at scale. The server keeps its own ledgers since 4 Nov and they are not counted here, so real balances are lower.',
  per_level_usd: Number(levelUsd.toFixed(4)), level_parts: Object.fromEntries(Object.entries(level).map(([k, v]) => [k, Number(v.toFixed(4))])), tutor_per_day: Number(tutorUsd.toFixed(4)), upload_per_day: Number(uploadUsd.toFixed(4)), per_learner_day_if_all_paid: Number(perLearnerDay.toFixed(3)),
  levels_a_day: LEVELS, active_share: ACTIVE, pipeline_per_day_until_start: PIPELINE, measured_free_share_of_calls_in_run: Number(freeShare.toFixed(2)), paid_split_in_run: Object.fromEntries(Object.entries(split).map(([k, v]) => [k, Number(v.toFixed(2))])), results,
};
if (args.includes('--json')) console.log(JSON.stringify(report));
else {
  console.log(`one level $${report.per_level_usd}, learner-day if all paid $${report.per_learner_day_if_all_paid}; free share in run ${report.measured_free_share_of_calls_in_run}; split ${JSON.stringify(report.paid_split_in_run)}`);
  for (const r of results) console.log(`${String(r.learners).padEnd(5)} free ${String(r.free_share).padEnd(4)} ${String(r.usd_per_day).padEnd(7)}/day start ${String(r.left_at_start_usd).padEnd(4)} gone day ${String(r.all_gone_day).padEnd(4)} ${r.scenario}`);
}
