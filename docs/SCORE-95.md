# Scorecard toward 95%: what turns tester data into accuracy, and where 95% is not reached

Everything below is SIMULATED (labelled per table). No real learner is in any number. Real testers start 15 Nov; the first refit on their data is what can replace these.

## The plain answer

- 95% average trait accuracy is **not reached and not reachable on current evidence**: held-out 30-day pipeline runs give 85.1 (default world) and 82.7 (realistic world) against a guess of 81.2; the stylised 12-month model plateaus at 88.2 (research-ceiling world) and 82.7-84.1 (realistic). What limits it is that traits are inferred from noisy behaviour, with a context-bound persistent error that more days do not average out (docs/SCORECARD-REAL.md, `services/scorecard/ceilings.js`). A trait needs a correlation of about 0.96 with its true value to reach 95; no class in the research table has that.
- **Decision accuracy does not reach 95 sooner**, contrary to the hope: at the app's own 30/70 edge it is 65.7% (guess/never-lean 59.6%) at day 30 and about 72% at month 12 in the model. The edges sit where many true values are, so small errors flip decisions. What does reach 95+ is the precision of confident leans: when the card acts only if its own posterior puts at least 0.95 on the true value being past the edge, 93-96% of those leans are right in the research-ceiling world (model, held-out), but they cover only 3-8% of the clearly high/low traits; in the realistic world almost none qualify (under 1%). Wrong-way decisions (lean low when true is high) are rare: 0.0-0.4%.
- Both numbers are reported side by side everywhere; neither replaces the other.

## 1. What was built

| piece | where | default |
|---|---|---|
| Decision layer: every measure's two sides and what the writer does (`drivers`), `decide` at hard 30/70 and soft 40/60, `pWrong`, `expectedGain` (preposterior value of one more reading), `decisionScore` (accuracy, wrong-way, caught, lean precision) | `services/scorecard/decisions.js` | pure, nothing calls it unless the switch is on |
| Decision-aware probe choice: the planner's per-measure importance is multiplied by how likely that measure's content decision is wrong now (up to x3, impact-weighted) | `active-measure.js` `selectionFor`, switch `SCORECARD_DECISION_VOI=1` (needs `SCORECARD_ACTIVE=1`) | OFF |
| Per-trait report on a held-out dump: guess baseline, card, fitted read-out, share of error removed, n, by class and learner kind, trait AND decision accuracy | `scripts/score-95-report.js`, table of all 100: `docs/score-95-traits.md` | script |
| Stylised long-horizon extreme-learner model: 8 kinds, 12 months, 4 ways to spend the probe budget, calibration seed vs held-out seed | `scripts/score-95-sim.js` | script |
| Test | `scripts/score-95-decisions-test.js` (in `scripts/test-steps.json`) | |

Already in place from earlier rounds and used unchanged: active measurement by sd reduction (`SCORECARD_ACTIVE`), anchors held back from the card with the beyond-chance check (`SCORECARD_ANCHOR`, `anchorScale`), the refit with held-out gates (`refit-records.js`, `refit-auto.js`, `SCORECARD_REFIT_AUTO`). **No gate was touched or lowered.** Time budget for extra measurement: at most 5% of study time (`BUDGET_SHARE`, 20 s per probe, tested).

## 2. Measured on the pipeline: 30 days, held out (SIMULATED learners, the app's real update path)

Calibration seed 71108 (120 learners), held-out seed 71107 (80 learners); the read-out is fitted on the first only. Accuracy = 100 - mean absolute error; guess = calibration mean. `score-95-report.js`.

#### 30-day pipeline, today world (SIMULATED: 80 held-out learners, calibrated on 120; no real learners)

All 100 measures: guess 81.2, card 84.4 (17.3% of error removed), read-out 85.1 (20.8% removed).
Decision accuracy at the hard edge (30/70): never lean 59.6, guess 59.6, card 63.3, read-out 65.7; wrong-way 0.4%; clear traits caught 34.8%. Of the leans actually made (18.2 per measure): 64.1% right, 82.0% on the right side of the soft edge. Soft edge (40/60): read-out 54.1 (guess 32.3). Impact-weighted hard: 66.1.
Measures reaching 95: trait accuracy 1/100, hard decision 0/100, soft decision 0/100.
Per learner (read-out): trait accuracy mean 85.1, worst 10% 81.8, worst 1% 80.7; decision accuracy mean 65.7, worst 10% 53.0, worst 49.0.

| trait class | measures | guess | card | read-out | removed | decision: never lean | decision: read-out | wrong-way % | decision soft |
|---|---|---|---|---|---|---|---|---|---|
| performance | 10 | 80.7 | 85.5 | 89.2 | 44.1% | 57.1 | 73.4 | 0.0 | 65.8 |
| benefit | 12 | 82.4 | 83.9 | 84.1 | 9.6% | 64.0 | 63.6 | 0.4 | 43.4 |
| reasoning | 12 | 80.9 | 83.3 | 84.4 | 18.6% | 58.5 | 61.3 | 0.2 | 52.1 |
| contrast | 11 | 81.7 | 85.3 | 85.8 | 22.8% | 60.7 | 69.3 | 0.2 | 56.0 |
| preference | 12 | 80.6 | 82.3 | 80.6 | -0.3% | 57.7 | 54.7 | 0.9 | 40.2 |
| habit | 15 | 80.8 | 85.4 | 88.8 | 41.9% | 59.3 | 75.6 | 0.0 | 65.2 |
| scale | 16 | 81.1 | 85.8 | 84.2 | 16.6% | 59.4 | 63.4 | 0.6 | 57.0 |
| memory | 7 | 80.2 | 83.3 | 85.8 | 28.2% | 57.7 | 68.6 | 0.0 | 57.5 |
| hidden | 5 | 83.0 | 83.6 | 80.5 | -14.2% | 63.8 | 58.3 | 1.5 | 43.3 |

| learner kind | n | guess | read-out | removed | decision: guess | decision: read-out |
|---|---|---|---|---|---|---|
| tail_hi | 8 | 82.6 | 85.6 | 17.1% | 63.3 | 64.0 |
| tail_lo | 7 | 83.0 | 85.6 | 15.3% | 66.3 | 68.3 |
| contradict | 15 | 81.4 | 85.5 | 22.0% | 60.7 | 67.4 |
| random | 15 | 76.1 | 82.5 | 27.1% | 42.1 | 56.6 |
| ordinary | 7 | 85.0 | 87.0 | 13.3% | 72.0 | 72.6 |
| age_young | 7 | 81.9 | 86.0 | 22.6% | 61.7 | 71.0 |
| age_old | 8 | 81.7 | 84.8 | 16.9% | 63.1 | 67.3 |
| tail_both | 6 | 81.4 | 85.5 | 22.1% | 61.3 | 68.0 |
| ell | 7 | 82.8 | 85.7 | 17.1% | 64.3 | 65.0 |

#### 30-day pipeline, real world (SIMULATED: 80 held-out learners, calibrated on 120; no real learners)

All 100 measures: guess 81.2, card 82.6 (7.6% of error removed), read-out 82.7 (8.1% removed).
Decision accuracy at the hard edge (30/70): never lean 59.6, guess 59.6, card 60.6, read-out 61.1; wrong-way 0.2%; clear traits caught 10.9%. Of the leans actually made (6.3 per measure): 55.0% right, 69.9% on the right side of the soft edge. Soft edge (40/60): read-out 41.7 (guess 32.3). Impact-weighted hard: 60.9.
Measures reaching 95: trait accuracy 0/100, hard decision 0/100, soft decision 0/100.
Per learner (read-out): trait accuracy mean 82.7, worst 10% 77.9, worst 1% 76.7; decision accuracy mean 61.1, worst 10% 43.5, worst 43.0.

| trait class | measures | guess | card | read-out | removed | decision: never lean | decision: read-out | wrong-way % | decision soft |

Realistic world, by learner kind:

| learner kind | n | guess | read-out | removed | decision: guess | decision: read-out |
|---|---|---|---|---|---|---|
| tail_hi | 8 | 82.7 | 83.6 | 5.5% | 63.3 | 62.8 |
| tail_lo | 7 | 83.0 | 84.3 | 7.4% | 66.4 | 67.6 |
| contradict | 15 | 81.4 | 82.9 | 8.3% | 60.8 | 63.0 |
| random | 15 | 76.1 | 78.9 | 11.7% | 42.1 | 46.4 |
| ordinary | 7 | 84.9 | 86.0 | 7.0% | 71.7 | 70.9 |
| age_young | 7 | 81.9 | 83.0 | 6.4% | 61.7 | 64.9 |
| age_old | 8 | 81.7 | 83.1 | 7.7% | 63.1 | 63.6 |
| tail_both | 6 | 81.2 | 82.0 | 4.2% | 60.8 | 59.7 |
| ell | 7 | 82.8 | 84.0 | 7.1% | 64.6 | 65.0 |
## 3. Active measurement, anchors and the 5% budget: what they are worth (model, held-out seed 95777)

Learners: ordinary, fast, slow, noisy, inconsistent (true value drifts), adversarial (games 30% of measures), child (half the sittings, noisier, weaker self-view), sparse (a quarter of the sittings); 80 each. Methods spend the SAME budget (about 15 probes a week for an ordinary learner, 20 s each, 5% of study time): `card` = behaviour only (today); `anchors` = scheduled single-item probes round-robin over self-readable measures; `activeSd` = next probe by largest sd reduction (today's planner rule); `activeDecision` = next probe by expected drop in wrong content decisions x impact (the new switch). Probe correlations and the 40% persistent share are ASSUMED (research-based, not measured); the world=real shrink (0.45) was fitted on the calibration seed so month 1 matches the 30-day pipeline (82.7), which is a calibration, not a proof.

### Realistic world (month 1 matched to the dumped realistic pipeline run)

| method | when | trait acc | guess | error removed | decision acc | decision soft | wrong-way % | confident leans (tau .95): precision | coverage of clear traits |
|---|---|---|---|---|---|---|---|---|---|
| card | month 1 | 82.9 | 82.2 | 3.8% | 62.4 | 37.3 | 0.0 | n/a | 0.0% |
| card | month 6 | 82.9 | 81.9 | 5.9% | 61.5 | 39.1 | 0.0 | n/a | 0.0% |
| card | month 12 | 82.7 | 81.5 | 6.5% | 60.7 | 38.8 | 0.1 | n/a | 0.0% |
| anchors | month 1 | 83.5 | 82.2 | 7.2% | 63.0 | 40.9 | 0.1 | n/a | 0.0% |
| anchors | month 6 | 84.1 | 81.9 | 12.5% | 63.2 | 44.9 | 0.1 | 100.0 | 0.1% |
| anchors | month 12 | 84.0 | 81.5 | 13.5% | 62.7 | 45.3 | 0.1 | 98.1 | 0.1% |
| activeSd | month 1 | 83.5 | 82.2 | 7.4% | 63.0 | 41.1 | 0.1 | 100.0 | 0.0% |
| activeSd | month 6 | 84.3 | 81.9 | 13.3% | 63.1 | 45.7 | 0.1 | 95.1 | 0.1% |
| activeSd | month 12 | 84.2 | 81.5 | 14.8% | 62.8 | 46.9 | 0.1 | 100.0 | 0.1% |
| activeDecision | month 1 | 83.4 | 82.2 | 6.8% | 63.1 | 40.4 | 0.1 | 100.0 | 0.0% |
| activeDecision | month 6 | 84.1 | 81.9 | 12.4% | 63.4 | 45.6 | 0.1 | 100.0 | 0.0% |
| activeDecision | month 12 | 84.1 | 81.5 | 13.9% | 63.0 | 46.5 | 0.1 | 100.0 | 0.0% |

| learner kind | method | when | trait acc | guess | removed | decision acc | worst-10% decision | worst learner decision | worst learner trait acc |
|---|---|---|---|---|---|---|---|---|---|
| ordinary | activeDecision | month 1 | 84.0 | 82.2 | 10.1% | 64.0 | 56.6 | 55.0 | 81.4 |
| ordinary | activeDecision | month 12 | 85.2 | 82.1 | 17.4% | 65.8 | 57.9 | 55.0 | 81.4 |
| fast | activeDecision | month 1 | 84.4 | 82.4 | 11.5% | 64.3 | 57.9 | 56.0 | 82.7 |
| fast | activeDecision | month 12 | 85.5 | 82.2 | 18.4% | 64.5 | 56.0 | 51.0 | 82.7 |
| slow | activeDecision | month 1 | 83.4 | 82.1 | 7.5% | 63.0 | 51.4 | 49.0 | 79.4 |
| slow | activeDecision | month 12 | 85.0 | 82.0 | 16.7% | 64.8 | 55.9 | 52.0 | 82.2 |
| noisy | activeDecision | month 1 | 83.3 | 82.3 | 6.0% | 63.1 | 56.4 | 55.0 | 81.1 |
| noisy | activeDecision | month 12 | 84.4 | 82.2 | 12.4% | 64.3 | 57.3 | 54.0 | 81.8 |
| inconsistent | activeDecision | month 1 | 83.0 | 82.1 | 5.5% | 62.1 | 54.3 | 50.0 | 79.1 |
| inconsistent | activeDecision | month 12 | 80.6 | 77.9 | 12.4% | 55.0 | 47.6 | 45.0 | 78.2 |
| adversarial | activeDecision | month 1 | 83.5 | 82.4 | 6.4% | 63.3 | 54.1 | 47.0 | 80.6 |
| adversarial | activeDecision | month 12 | 84.2 | 82.2 | 11.0% | 63.7 | 56.3 | 54.0 | 80.7 |
| child | activeDecision | month 1 | 82.9 | 82.2 | 3.9% | 62.2 | 54.0 | 51.0 | 79.7 |
| child | activeDecision | month 12 | 83.4 | 81.5 | 10.3% | 61.8 | 51.9 | 45.0 | 80.7 |
| sparse | activeDecision | month 1 | 82.9 | 82.3 | 3.2% | 63.0 | 55.3 | 53.0 | 79.3 |
| sparse | activeDecision | month 12 | 84.4 | 82.1 | 12.9% | 64.2 | 58.1 | 57.0 | 82.3 |
### Research-ceiling world (the best case the literature allows)

| method | when | trait acc | guess | error removed | decision acc | decision soft | wrong-way % | confident leans (tau .95): precision | coverage of clear traits |
|---|---|---|---|---|---|---|---|---|---|
| card | month 1 | 86.0 | 82.2 | 21.1% | 66.4 | 53.2 | 0.2 | 93.2 | 2.7% |
| card | month 6 | 88.0 | 81.9 | 33.9% | 71.0 | 61.1 | 0.1 | 94.6 | 7.3% |
| card | month 12 | 88.2 | 81.5 | 36.5% | 71.5 | 62.2 | 0.1 | 95.3 | 8.1% |
| anchors | month 1 | 86.1 | 82.2 | 21.9% | 67.1 | 53.6 | 0.2 | 93.4 | 2.7% |
| anchors | month 6 | 88.2 | 81.9 | 35.2% | 71.7 | 61.5 | 0.1 | 95.5 | 7.2% |
| anchors | month 12 | 88.4 | 81.5 | 37.1% | 71.9 | 62.4 | 0.1 | 96.2 | 8.1% |
| activeSd | month 1 | 86.1 | 82.2 | 22.0% | 67.2 | 53.6 | 0.2 | 93.0 | 3.0% |
| activeSd | month 6 | 88.3 | 81.9 | 35.4% | 71.8 | 61.6 | 0.1 | 95.2 | 7.2% |
| activeSd | month 12 | 88.4 | 81.5 | 37.2% | 71.9 | 62.2 | 0.1 | 95.6 | 8.2% |
| activeDecision | month 1 | 86.0 | 82.2 | 21.5% | 67.3 | 53.2 | 0.2 | 93.4 | 2.9% |
| activeDecision | month 6 | 88.2 | 81.9 | 34.7% | 71.8 | 61.0 | 0.1 | 95.4 | 7.3% |
| activeDecision | month 12 | 88.3 | 81.5 | 36.8% | 72.1 | 62.1 | 0.0 | 95.3 | 8.0% |

| learner kind | method | when | trait acc | guess | removed | decision acc | worst-10% decision | worst learner decision | worst learner trait acc |
|---|---|---|---|---|---|---|---|---|---|
| ordinary | activeDecision | month 1 | 87.2 | 82.2 | 28.2% | 70.0 | 62.8 | 62.0 | 84.7 |
| ordinary | activeDecision | month 12 | 89.2 | 82.1 | 39.6% | 75.1 | 68.0 | 66.0 | 86.9 |
| fast | activeDecision | month 1 | 88.1 | 82.4 | 32.2% | 72.0 | 65.6 | 64.0 | 84.9 |
| fast | activeDecision | month 12 | 89.3 | 82.2 | 39.9% | 73.8 | 65.9 | 62.0 | 86.4 |
| slow | activeDecision | month 1 | 86.1 | 82.1 | 22.3% | 67.8 | 58.6 | 56.0 | 83.1 |
| slow | activeDecision | month 12 | 88.9 | 82.0 | 38.5% | 73.4 | 64.9 | 63.0 | 86.9 |
| noisy | activeDecision | month 1 | 85.3 | 82.3 | 16.9% | 65.1 | 55.5 | 51.0 | 82.6 |
| noisy | activeDecision | month 12 | 88.3 | 82.2 | 34.2% | 71.5 | 64.8 | 63.0 | 85.5 |
| inconsistent | activeDecision | month 1 | 86.0 | 82.1 | 21.8% | 66.8 | 58.9 | 55.0 | 82.3 |
| inconsistent | activeDecision | month 12 | 86.6 | 77.9 | 39.4% | 68.9 | 59.8 | 57.0 | 84.3 |
| adversarial | activeDecision | month 1 | 86.6 | 82.4 | 24.1% | 68.3 | 60.8 | 57.0 | 84.0 |
| adversarial | activeDecision | month 12 | 88.1 | 82.2 | 33.1% | 71.0 | 63.5 | 61.0 | 86.1 |
| child | activeDecision | month 1 | 84.8 | 82.2 | 14.9% | 64.7 | 57.4 | 55.0 | 81.8 |
| child | activeDecision | month 12 | 88.0 | 81.5 | 35.1% | 71.4 | 64.6 | 59.0 | 85.3 |
| sparse | activeDecision | month 1 | 84.3 | 82.3 | 11.3% | 64.0 | 56.1 | 54.0 | 81.0 |
| sparse | activeDecision | month 12 | 88.3 | 82.1 | 34.3% | 71.7 | 64.1 | 62.0 | 85.8 |
## 4. What the numbers say

1. **Anchors/probes are the lever that matters, and mostly in the realistic world** (month 12: 6.5% -> 13-15% of error removed; trait accuracy 82.7 -> 84.0-84.2). In the research-ceiling world they add only about +0.2, because behaviour already carries most of what a few single items could. Their value is independence: a self-view or task bias is not the same bias as behaviour's, so two views average the persistent error that more days never remove.
2. **Decision-aware choice is not better than sd-reduction choice** in this model: month-12 decision accuracy 63.0 vs 62.8 (realistic), 72.1 vs 71.9 (research), within noise (80 per kind). It stays OFF and is not recommended over `SCORECARD_ACTIVE` alone until real data say otherwise. It was built because the owner asked for the decision metric to steer measurement; the honest finding is that it does not.
3. **More months help for about 6 months, then stop.** Month 6 to 12 adds 0 to 0.2 for ordinary learners: the evidence cap (6 months) and the persistent error. The earlier full-pipeline note (no gain from time alone at day 180) agrees.
4. **Worst cases.** Inconsistent learners get WORSE with time in the model (month 12 below month 1, decision accuracy 55.0 vs the 62-64 of others): old evidence describes a different person. The existing drift check (`services/scorecard/drift.js`) is the thing to point at; shortening the evidence window for drifting learners was not built here. Children and sparse learners start lowest (month 1 error removed 3-4%) and reach the pack by month 12 only in trait accuracy. Worst single learners sit at 45-50% decision accuracy, near or below never-lean. Random learners (answer without signal) are the hard floor in the dumps: 78.9 read-out vs 76.1 guess at 30 days (realistic).
5. **A read-out gap to fix on real data:** on the held-out 30-day run the fitted read-out is worse than the guess for `preference` (-0.3% removed) and `hidden` (-14.2%), and worse than the card for `scale`: with 120 calibration learners it over-fits those classes. The refit's gates exist to refuse exactly this on real data; no gate was changed. Per-trait rows are in `docs/score-95-traits.md`.
6. **Decision accuracy by class (30-day, default world):** habit 75.6, performance 73.4, contrast 69.3, memory 68.6 beat never-lean (57-61) clearly; benefit (63.6), preference (54.7) and hidden (58.3) do not beat never-lean (64.0, 57.7, 63.8). Those three classes should not steer content on behaviour alone; the app's confident-directive rule already withholds weak ones.

## 5. Which content decisions each trait drives

`decisions.js` `drivers(id)` returns, for each of the 100 measures, its category, class, impact (0-3), the low and high side labels and the directive text the lesson writer receives (from `stats.js`). Decision accuracy is measured against the same 30/70 edge the card's confident-directive rule uses, so "right" means the writer was told the right side or told nothing when nothing was due. For the 100 per-measure rows (trait accuracy, guess, share removed, never-lean, decision accuracy, wrong-way) see `docs/score-95-traits.md`.

## 6. Not done or not verified

- No real learner. Probe v's, the persistent share, class assignments and the 0.45 shrink are assumptions or fitted to simulated runs.
- The long-horizon model is not the app: it does not run the planner, signals or the LLM read. Month 6 and 12 of the real pipeline were not run (about 30 minutes per 120 learners at day 30, so a year is not practical here).
- `SCORECARD_DECISION_VOI` was exercised only in unit tests (weights up, never down, bounded x3) and in the model; not in the full pipeline.
- Read-out over-fit for preference/hidden/scale is diagnosed, not fixed.
- Drifting learners: no shorter evidence window was built.
- Full `npm test` result: see the final report of this round.

## 7. Switches (all default OFF)

`SCORECARD_ACTIVE=1` (already built, recommended with anchors), `SCORECARD_ANCHOR=0.25`, `SCORECARD_DECISION_VOI=1` (new; not recommended), `SCORECARD_REFIT_AUTO` (existing). Tell the owner: turn on ACTIVE + ANCHOR for testers; leave DECISION_VOI off.

## Reproduce

```
node scripts/score-95-report.js --cal=C:/coding/savant-wt/_sim-real/c-today-0.json,... --held=.../h-today-0.json,... --md=out.md --traits=traits.md
node scripts/score-95-sim.js --seed=95777 --n=80 --world=real --md=out.md      (held-out; calibration seed is 95001)
node scripts/score-95-decisions-test.js
```
