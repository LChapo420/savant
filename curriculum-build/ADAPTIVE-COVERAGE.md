# Adaptive teaching with a coverage guarantee (goal 5, night of 2026-10-23)

The owner's goal, in his words: "make all the other subjects curriculum and levels be modified to perfectly educate each separate user with the most retention and understanding in the most efficient way while still covering and making sure they actually learned everything they need to learn in that grade level of that subject."

The design splits that goal in two, and the code keeps the two parts apart:

- **WHAT a grade must cover** is fixed. It lives in `services/coverage.js`: every grade's objectives, a record per objective per learner, and a gate that holds graduation until every objective is proven and then kept.
- **HOW a level teaches** is per learner. It lives in `services/adaptation.js` and covers guidance, length, how much practice, item counts, ordering and review timing. Its decisions come from the learner's own record on each objective, plus confident scorecard directives. A code check (`checkWhat`) proves that no plan changes what is covered.

Subjects covered: math, english, reading, iq, act and spanish. Chess, piano and basketball pass the same machine checks (4,115 more objectives); round 2 adds their per-learner skill record, stage gates and dose adaptation (section 6, staged).

**Round 2 in one paragraph (sections 5-7).** A new policy, adaptive2, completes 100% of simulated learners (linear 92.8%, round 1 91.1%) with 95.7% recall 30 days after the grade and no further study (linear 93.8%, round 1 87.6%), in 49% of linear's active study time. It re-teaches lapsed objectives at once, uses the scorecard's fitted forgetting curve, aims reviews at 30-day durability, consolidates before the Final, monitors effort on scored sittings and remediates from the record after a missed Final. Spanish grade 6's extra time was double teaching in a unit-built grade plus over-reviewing; it is fixed. Chess, piano and basketball now use the same coverage model, staged, and no stage is completed or skipped unproven. Everything stays shadow, off or staged.

## 1. The coverage model (`services/coverage.js`)

**Objectives, from the sheets, machine-checked.**
- There is one objective per `Lesson` row of a grade. It keeps the sheet's own title, its `covers` sentence word for word, its skill, its lesson level, its practice levels (the "Activity k of 9 - <lesson>" rows) and its retention levels (Activities 8 and 9).
- Three late Spanish grades have no lessons. They use their unit goals ("Goal: I can ...").
- `levelMap` says whose evidence an answer at each level is:
  - one objective's own: its lesson, checks, activities and games;
  - several objectives together, split 1/k and narrowed to the answer's skill: entry checks (each Tester's "(A through B)" span), summaries, checkpoints, the grade review and the Graduation exam.
- `coverage.validate()` checks every grade. Each objective must state what it covers, have a skill the grade teaches, be practised, and be assessed by some checkpoint or review. Every activity must belong to an objective.
- **Result: 8,955 objectives across the 6 subjects (290 grades), 0 problems.**

| track | grades | objectives | levels mapped to an objective |
|---|---|---|---|
| math | 49 | 2,617 | 100% |
| english | 16 | 755 | 100% |
| reading | 16 | 584 | 100% |
| iq | 12 | 2,567 | 100% |
| act | 16 | 892 | 100% |
| spanish | 57 | 1,540 | 92.2% (placement tests and stray rows) |

**The record per objective per learner.** It is read from the learner's answered items. Nothing new is written while they learn. It is folded in time order:

- **Knowledge.** Bayesian knowledge tracing (BKT): a belief L, updated by each answer, plus a chance of learning from each practice answer.
  - Rapid guesses (under 1.2 s) are not evidence.
  - An answer reached with the coach counts a quarter.
  - Placement and Challenge Exam sittings are left out. The unit plan covers placement instead: every objective in a unit the plan holds as `known` counts as proven by that unit.
- **Proven.** Three conditions:
  - L ≥ 0.95;
  - at least 3 unaided right answers;
  - at least 2 right answers to questions written *for this objective*: its lesson checks, its games, or an item tagged `objective_id`.
  - The last condition was added after the simulation showed that skill-level bank practice on its own proved 7-15% of objectives too early. The bank's practice questions are written per skill, not per objective.
- **Test-out.** An objective proven before any of its own teaching (a probe, an entry check, a known unit) counts as prior knowledge. It is taken as kept.
- **Retained.** After a proof, any unaided answer at least `RETAIN_DAYS` (1) later is a memory check. A second Bayes belief R over those checks decides the result:
  - retained at R ≥ 0.9 (two right multiple-choice checks, or one right typed check);
  - `lapsed` at R ≤ 0.4. A lapsed objective must be proven again and then checked again.
- **The guarantee.** `coverage.gate()` says a grade is complete only when every objective is retained. With `COVERAGE_RULE=proven`, proven is enough.

**Live wiring (no visible change).** `services/mastery.js` `clearCheckpoint('graduation')` calls `coverage.atGraduation()`, which behaves according to `COVERAGE_GATE`:

| setting | what happens |
|---|---|
| `shadow` (default) | The learner graduates exactly as before. What the gate would have said is recorded on the enrollment (`coverage_graduation`). |
| `enforce` | Graduation is held while objectives are unproven or unchecked. `clearCheckpoint` returns `{graduated: false, coverage_held: true, coverage}`. The owner's account is exempt, because its jumps leave no evidence. |
| `off` | Nothing. |

`atGraduation()` never throws. **Enforcing the gate is the owner's call**, and the client needs a screen for "held" (see section 4).

## 2. Per-learner adaptation (`services/adaptation.js`): how, never what

| knob | decided by |
|---|---|
| guidance: worked examples / faded / problems first | The objective's own record: no evidence or L < 0.5 gives worked examples; proven gives problems first; a lapse brings worked examples back. Confident `prior_knowledge` / `scaffolding_fade` directives can shift it, but cannot remove worked examples from an objective with no evidence. Basis: expertise reversal (Kalyuga 2007; Tetzlaff et al. 2025). |
| length | Confident `brevity_preference`, `processing_velocity` and `attention_runway` directives. A problems-first level is short. |
| practice | Compress once proven: the objective's remaining practice levels are skipped, but never its retention levels. Extend when its own practice is used up and it is not proven. Run a proof check (2-3 written questions) when the record is sure but rests on skill-level practice. |
| items, stretch and support | `processing_velocity`, `persistence`, `attention_runway`, `challenge_appetite` and `frustration_threshold` directives, within fixed bounds (4-18 items). |
| order | Blocked while an objective is new and novice; interleaved once proven. The review list is interleaved across skills. |
| review timing | `reviewQueue`: memory checks due one day after a proof, then objectives whose predicted recall is below 0.9, lowest first. `examReview` runs a retrieval round before an exam. |

**"Only confident scorecard evidence".** A scorecard stat moves a knob only if `scorecard/translate.directives()` returns it, which is the same calibrated gate (P ≥ 0.98, top or bottom fifth) used for lesson text.
- The forgetting stats never steer. Review timing reads the population forgetting curve.
- The curve is read with the objective's own spaced successes (memory checks), not same-day practice. Counting same-day drill made a freshly drilled objective look good for 10 days, and true recall at the Final was 0.81.
- A learner's own memory-check failure rate shifts the curve by one doubling only when a Beta posterior is 95% sure that it differs from the expected rate (`memoryAdjust`).

**The WHAT invariant.** Each plan carries the objective's id, `covers` text, skill and retention levels copied from the coverage model. `checkWhat()` returns problems if:
- any of those differ from the model;
- an unproven objective is compressed;
- a retention level is compressed.

**Live wiring (no visible change).** `services/sessions.js` `createSession` calls `adaptation.planForLevel` only when `ADAPTIVE_TEACHING` is set:

| setting | what happens |
|---|---|
| `off` (default) | Nothing. |
| `shadow` | The plan is recorded on the sitting (`adaptation_plan`). The learner gets the same block. Tested. |
| `on` | The bounded knobs are applied to the block (item count, stretch and support shares, typed answers). |

The owner's account is never adapted unless `ADAPT_OWNER=1`, per PRODUCT-DECISIONS.

## 3. The coverage audit (`scripts/coverage-audit.js`, `npm run coverage:audit`)

**What it simulates.**
- Learners: 8 profiles (novice, typical, strong, holes, slow, forgetful, rusher, coached) × 8 learners × 3 policies.
- Grades: 12 real grades, 2 per subject.
- Policy `linear`: today's layout walked in order, with no gate.
- Policy `gate`: linear plus the gate in enforce mode.
- Policy `adaptive`: the gate plus `adaptation.decide`, probes, proof checks, the review queue and `examReview`.
- Every answer goes through `coverage.attribute` and `coverage.fold`, and every plan through `checkWhat`.

**The truth model.**
- Half-life memory, with spacing gains on retrievals after a gap.
- Expertise reversal in how well a lesson teaches.
- Slips, guessing, rapid guesses and coach use.
- Bank practice items test the level's own objective only 70% of the time.

Seed 20261023. The full output is in `staged/adaptation/coverage-audit.txt` and `.json`. The run took 293 s.

| policy | done | study minutes | min/objective | days | app: proven / retained | truly known | recall now | 7 d | 30 d | 30 d with review queue | false proofs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| linear (today) | 94.4% | 4,088 | 62.1 | 102 | **60.6% / 33.6%** | 99.9% | 99.6% | 98.6% | 93.7% | 96.6% | 1.0% |
| gate | 92.4% | 4,476 | 68.5 | 112 | 100% / 100% | 100% | 99.9% | 99.8% | 94.7% | 99.4% | 0.6% |
| **adaptive** | 90.5% | **1,875** | **30.5** | **47** | **100% / 100%** | **100%** | 99.9% | 99.7% | 88.3% | **98.6%** | 1.4% |

- **The guarantee holds.** Every learner who completed under `gate` or `adaptive` had 100% of objectives proven and retained by the app's own record. No plan changed WHAT. No learner who passed the Graduation exam was left stuck at the gate. At completion, 0.0% of objectives were marked proven while the learner truly did not know them.
- **Today's app cannot tell whether everything was learned.** It marks 60.6% of objectives proven and 33.6% retained at graduation. The simulated learners do know nearly everything, but only because the linear path overpractises: about 62 minutes per objective.
- **Efficiency.**
  - Adaptive uses 46% of linear's study time (0.35-0.53 by profile) and 46% of the calendar days.
  - It gets 1.88 objectives still recalled 30 days later per study hour, against 0.94 for linear.
- **Retention.**
  - Recall at 30 days with no study at all is lower than linear (88.3% vs 93.7%), because linear spends twice the time drilling.
  - With the review queue carrying on after the grade (about 5 minutes a day, which the next grade would do anyway), it is 98.6% against linear's 96.6%.
- **Completion.**
  - The sim caps the Graduation exam at 8 attempts (90% pass mark). The ~10% of adaptive learners who did not complete never passed it.
  - Most were rushers: about 12% of their answers are rapid random guesses, so 90% is out of reach. The rest were forgetful or slow learners on the two 170-objective IQ grades (adaptive 78% / 72% done there, linear 95%).
  - None of these is a coverage failure, but they are real costs.
  - Remedies to consider: a `rush_tendency` directive switches to typed answers (built, needs a confident scorecard); a stronger pre-exam review for big grades; the population forgetting curve fitted from real data. The default curve is optimistic for fast forgetters.
- **Spanish grade 6** is the one grade where adaptive takes longer than linear (1,171 vs 831 minutes). It also completes far more often (98% vs 80%), with recall at 30 days of 81% vs 62%. The sheet's linear walk under-practises it.

## 4. Staged for approval (`curriculum-build/staged/adaptation/`)

**`adaptive-teaching-on.patch`** (verified by `verify-patch.js` on a patched copy; 4 of 4 checks pass). All of it is learner-visible, and all of it applies only with `ADAPTIVE_TEACHING=on`:
- `services/learner-path.js`: practice ends on proof. The path steps over the remaining practice levels of a proven objective. Retention levels are walked and nothing is marked cleared.
- `services/mastery.js` `advance`: the no-plan branch asks `learnerPath.nextLevelAfter`, so that applies on linear paths too.
- `services/level-editor.js` and `services/block-levels.js` (tailored learners): the plan's instruction lines go into the writer's prompt. The first line restates the covers text word for word.

**Pilot objective items** (`build-objective-items.js`, `objective-items.*.json`, `objective-items.report.json`). These are questions written for one objective each, for probes, proof checks and memory checks. Proofs and memory checks depend on them, as measured above.
- Writer: DeepSeek V4.1 Flash, through `services/providers/nvidia.js` only. Explicit models, no chain, so no paid provider can be reached.
- Checks: code checks first, then two independent judges from other model families (Nemotron Ultra and GLM 5.3). Each judge answers blind. A question is kept only if both pick the key and both say it tests the objective, has one right answer and suits the grade.
- Grades: math 5th grade (41 objectives) and english 4th grade (57).
- **Status at 06:40 UTC.**
  - A 2-objective smoke run kept 5 of 6 written questions (`objective-items.smoke-2-objectives.json`, `objective-items.smoke-report.json`). The one rejection was a code check's false "needs a picture", since fixed.
  - The full 98-objective run is resumable (`objective-items.cache.jsonl`) and retries with backoff of 1 to 8 minutes.
  - Since 05:55 every call has been refused with NVIDIA 429s: the shared key is saturated by the other agents' evals. The run was left going in the background.
  - Re-run the same command to finish. Finished objectives are skipped.
- Not served anywhere. Serving them needs an `objective_id` on items (the coverage model already reads it) and a route that asks probe and memory-check questions.

**Still needed, owner's call:**
1. Set `COVERAGE_GATE=enforce`, and add a client screen for a held graduation that lists the objectives to prove and offers memory checks.
2. Set `ADAPTIVE_TEACHING=shadow` first, compare against the holdout, then `on` with the patch.
3. Generate objective items for every grade (8,955 objectives × 3 questions) with the pilot pipeline.
4. Schedule the spaced-recall level (Activity 9) from `reviewQueue` instead of in sequence: a path and UI change.
5. For other agents: the scorecard owner could expose the fitted population forgetting curve (`populationCache.memory.curve`) so `adaptation.predictedRecall` can use it instead of `DEFAULT_CURVE`.

## 5. Round 2 (2026-10-23 afternoon): retention, completion, Spanish grade 6

New audit policy `adaptive2` = round-1 `adaptive` plus the fixes below. The other three policies are unchanged. Full run: `staged/adaptation/coverage-audit.txt` / `.json` (seed 20261023, 12 grades, 8 profiles × 8 learners, 413 s). Round 1's output is kept as `coverage-audit.round1.*`. "Active minutes" is time actually studied; the old "minutes" column also counts the unused rest of a study day.

| policy | done | active min | days | 30-day recall, no study | 30 d with queue | false proofs |
|---|---|---|---|---|---|---|
| linear (today) | 92.8% | 4,028 | 99 | 93.8% | 96.7% | 1.0% |
| gate | 93.0% | 4,334 | 109 | 95.1% | 99.4% | 0.6% |
| adaptive (round 1) | 91.1% | 1,850 | 47 | 87.6% | 98.4% | 1.4% |
| **adaptive2 (round 2)** | **100%** | **1,976 (49% of linear)** | 65 | **95.7%** | 99.0% | 1.2% |

The guarantee still holds for every policy: every completed learner had 100% of objectives proven and kept by the app's own record, and no plan changed WHAT.

By profile (linear → adaptive2):

| profile | done | 30-day recall | active minutes, share of linear |
|---|---|---|---|
| forgetful | 96.9% → 100% | 89.6% → 92.2% | 0.56 |
| rusher | 54.2% → 100% | 96.0% → 96.1% | 0.53 |
| slow | 92.7% → 100% | 94.7% → 96.4% | 0.57 |
| every other profile | — | 95.5-97.0% | 0.35-0.53 |

### 5.1 Gap 1: retention. Adaptive now beats linear at 30 days with no study (95.7% vs 93.8%)

**What was wrong.** Diagnosis by where the minutes and the forgetting went (new `time_by` and `recall_30_by_tenth` fields):
- The loss was spread across the whole grade, not only the last objectives taught.
- The biggest single cause was lapsed objectives. When a memory check failed, the objective sat `lapsed` until the gate at the very end; in one Spanish run 8 of 13 objectives waited 20 days that way.
- Second, nothing aimed at a horizon. Reviews only kept recall above 0.9 until the next check, and with the fitted curve they come less often than with the old pessimistic default curve.

**The fixes**, all in `services/adaptation.js` and all opt-in, so round 1 is unchanged:

| fix | what it does |
|---|---|
| Fitted curve | `curveFor()` reads `scorecard.forgettingCurve` (round 5), falling back to `DEFAULT_CURVE`. `predictedRecall` reads it with the objective's `nc`/`nw` plus new spaced counts `ns`/`nsw`, which `coverage.fold` now keeps, on the fitted power-law shape. `scheduleM` uses a learner's own multiplier as it stands when it says they forget faster, and only by its 95%-sure part when it says slower. The audit fits the population curve with `forgetting.population` (the scorecard's own code) on a separate calibration cohort (192 learners, seed+1). |
| Re-teach lapsed objectives at once | `reviewQueue({reteach: 3})` puts lapsed objectives first, and the daily session teaches them again (probe, lesson, practice). |
| Durability | `reviewQueue({durable})` gives a kept objective one spaced retrieval a day while its predicted memory 30 days on (`durableRecall`) is below `ADAPT_DURABLE_AT` (0.9). On the HLR curve each spaced success adds the same doublings of half-life whenever it comes, so one short retrieval on more days beats more items on one day. |
| Consolidation before the Final | Short review-only days until 90% of objectives are durable, at most 21 days (`adaptation.durability`). It costs calendar days, not much study time: about 190 active minutes a grade. |

**Ablation** (3 learners/profile, each fix removed in turn; 30-day recall / active minutes; the full set gives 95.6% / 1,966):

| fix removed | 30-day recall | active minutes | what it shows |
|---|---|---|---|
| consolidation | 80.0% | 1,780 | essential |
| durability | 84.9% | 1,725 | essential |
| re-teach | 91.4% | 2,042 | worth +4 points |
| fitted curve (round-1 default curve) | 97.3% | 2,179 | the default curve keeps more, but costs +11% minutes; the fitted curve buys more recall per hour |
| remediation | 95.1% | 1,935 | small gain |
| `unit` | 95.6% | 1,973 | Spanish only, below |

**Not closed.** On the two 170-objective IQ grades adaptive2 is at 93.1-93.2% vs linear's 95.7%, for 50% of the time. The review cap (24 a day) binds there. Raising it, or a longer consolidation for big grades, is a tuning choice.

### 5.2 Gap 2: completion. 100% of adaptive2 learners pass the 90% Final within 8 attempts (round 1: 91.1%; linear: 92.8%)

The bar is never lowered: the same 40 questions, the same 90%, the same gate.

- **Effort monitoring on scored sittings** (`adaptation.sittingRule`):
  - An answer faster than `OBJ_RAPID_MS` is not scored. The learner is told it was too fast to count and gets a parallel question on the same objective, at most twice per question; the third answer stands.
  - Simulated with no change in behaviour at all (`--warn=0`): rushers go from 54% (linear) and 44% (round 1) to 100%.
  - Without this fix rushers complete 58% (ablation). Basis: effort monitoring with warnings, Wise, Bhola & Yang 2006.
- **`adaptation.effort()`.** It flags a learner whose own record shows rapid guessing on more than 5% of answers, 95% sure on at least 30 answers. `coverage.fold` now counts rapid answers per objective, still never as evidence. The flag turns on `knobs.effort_feedback` (slow-down feedback); WHAT is unchanged.
- **Remediation after a missed Final** (`adaptation.remediation`): what is unproven or lapsed is taught again, and what has faded on the missed skills is retrieved with feedback, then a new day. This replaces "re-teach the 3 lowest beliefs".
- **Big IQ grades:** adaptive2 completes 100% and 100% (round 1: 81% / 78%). The pre-Final consolidation and re-teaching keep true recall above the ~0.95 a 90% pass needs.
- **A split Final is not needed** and was not adopted.

### 5.3 Gap 3: Spanish grade 6. Why it was slow, and the fix

**Why.** Spanish grades are built in units: 30 of this grade's 32 objectives have no practice level of their own. Their practice is the unit's shared levels (games, stories, dictation, labs).
- Round 1 extended each such objective straight after its lesson: a second worked-example lesson plus practice, before the unit's own practice had run, and the unit's practice then ran anyway.
- Its review queue on the pessimistic default curve spent 265 minutes on reviews.

**The fix.**
- `decide()` now marks such objectives `practice: 'unit'`. The audit (`unit`) waits for the unit's last shared level before extending, and never re-teaches the lesson just taught.
- Together with the fitted curve, this cut adaptive time from 1,069 to 978 active minutes.

| policy | done | active min | 30-day recall |
|---|---|---|---|
| linear | 75% | 833 | 62.6% |
| linear + gate | 75% | 955 | 70.3% |
| adaptive (round 1) | 92% | 1,069 | 91.7% |
| adaptive2 | **100%** | **978** | **96.1%** |

- Linear's 833 minutes is not a like-for-like baseline. A quarter of its learners never pass the Final, and it forgets a third of the grade in a month.
- Covering the grade costs about 955-980 minutes whichever way it is done. adaptive2 is the only policy that finishes everyone, at about the cost of linear + gate.
- Measured and dropped: skipping the unit's receptive practice levels once all their objectives are kept saved nothing, because objectives are rarely kept that early.

### 5.4 What round 2 changed in the code

All opt-in; the round-1 behaviour is the default for every caller that does not pass the new options.

**`services/coverage.js`:**
- `rapid`, `ns`, `nsw` on the record. `fold` counts rapid answers (never as evidence) and spaced answers.

**`services/adaptation.js`:**
- New: `curveFor`, `scheduleM`, `durableRecall`, `durability`, `remediation`, `effort`, `sittingRule`.
- `reviewQueue` takes `curve`, `durable` and `reteach`.
- `decide` takes `curve` and `durable`, and adds `knobs.effort_feedback` and `practice: 'unit'`.
- `planForLevel` (shadow and on only) passes the fitted curve and the round-2 options; `ADAPT_DURABLE=0` gives round 1.
- New knobs: `ADAPT_DURABLE_AT`, `ADAPT_DURABLE_DAYS`, `ADAPT_RUSH_RATE`, `ADAPT_RUSH_MIN`, `ADAPT_RETEACH`.

**`scripts/coverage-audit.js`:**
- Policy `adaptive2`, and `--r2=<fixes>` for ablation.
- `--curve=fit|default`, `--pop=file` (caches the fitted curve), `--consolidate-at`, `--consolidate-days`, `--warn`.
- New fields: active and idle minutes, time by phase, recall by tenth of the grade.

**`scripts/coverage-test.js`:** 81 checks (was 48), including the skill model.

**`adaptive-teaching-on.patch`:** regenerated so each file keeps its own line endings. The round-1 file did not apply with `git apply` on the two CRLF files. It now checks clean, and `verify-patch.js` passes 4 of 4 on a patched copy.

**Not in the patch.** The round-2 fixes are a daily review session, a consolidation stretch, a "too fast to count" response on scored sittings, and post-Final remediation. They are path and UI changes, listed as owner decisions below.

## 6. Chess, piano and basketball in the same model (staged: `staged/adaptation/skills/`)

**WHAT a stage covers.** Its grades' lesson objectives, through `services/coverage.js` exactly as for every subject (862 / 1,443 / 1,185 objectives), plus its exit battery from `progression.json`: 84 metrics, of which 74 a machine can prove.

- Self-report, film, a person's sign-off and imported ratings never prove a metric.
- The other 10 metrics are attested only: recorded and listed, never gating.
- Piano PI11-16 has no machine-provable metric at all.

**The per-learner skill record** (`skill-coverage.js`) keeps every sitting of every metric. The rules of SKILL-CURRICULA.md section 2 as code:

| rule | as code |
|---|---|
| cold only | The first sitting of the day, 20+ hours after the metric was last practised. |
| two days | Passes on two different days. |
| no proof by retaking | A Bayes belief over all counting sittings: pass 0.85 likely at the bar, 0.15 below it. Two clean passes prove a metric; each miss needs another pass. |
| source honesty | A microphone or camera result counts only when confirmed. |
| retention | The stage's own retention sitting ("again after 7+ days"). |
| the battery must stand at exit | A proof older than 7 days needs a fresh cold pass before the stage completes. |

`stageGate()` decides both completion and a placement skip. `proofHolds()` re-derives every proof from its sittings.

**Adaptation** (`skill-adaptation.js`) changes how much and when, never what. Per session:
- Minutes go to unproven metrics by their distance from target.
- Every unproven metric gets at least one set.
- Practice ends on proof. Proven metrics keep a maintenance set each session, and spare minutes consolidate them.
- Cold stage tests come when the last three warm sets are at target, or every 5 days.
- Retention and re-sit tests come when due.
- `checkPlan()` proves no unproven metric is dropped.

**The audit** (`skill-audit.js`; `skill-audit.txt`):
- 8 profiles × 6 learners walk chess CH0-CH5, piano PI0-PI4 and basketball BB0-BB3.
- The truth model has practice curves, sag after a day without practice, a warm-up decrement and noisy sittings.
- The knowledge side is held equal across policies; the coverage audit measures it.

| | today | gate | adaptive |
|---|---|---|---|
| stages left with metrics unproven | 100% | 0 | 0 |
| metrics truly at the bar when a stage is left: chess / piano / basketball | 34% / 45% / 37% | 100% / 100% / 100% | 98% / 97% / 99% |
| practice minutes per stage: chess / piano / basketball | 960 / 1,100 / 840 (too little) | 3,210 / 3,047 / 2,682 | 2,810 / 2,985 / 2,398 (-12% / -2% / -11%) |
| stages skipped by placement (all re-proven) | — | 0 | 13 |
| false proofs (proved while ≥ 5 points below the bar) | — | ≤ 0.1% | 0% |

**Guarantee: 0 violations.** No stage was completed or skipped without every machine-provable metric proven on two cold days (re-derived from its sittings) and its knowledge gate complete, and no plan dropped an unproven metric.

**The honest finding.**
- Today's app leaves about two thirds of each stage's skills below the stage's own bar, because a stage ends when its lessons end.
- The stage gate is what fixes that.
- Dose adaptation saves 2-12% of practice on top. It keeps less 30 days later than the gate's even practice (chess 0.71 vs 0.84), because it stops drilling proven metrics.

**Not simulated:** the elite stages (chess CH6+, piano PI5+, basketball BB4+).

## 7. Owner decisions (round 2), in addition to section 4

| # | decision | what it needs |
|---|---|---|
| 6 | A daily review session | A path and UI change. It serves `reviewQueue` with the fitted curve, durability and re-teaching. |
| 7 | A consolidation stretch before the Final | Up to 21 review-only days, about 10 minutes a day. Recommended alongside: let the learner start the next grade during it, so calendar time is not lost. Adaptive2 takes 65 days on average against round 1's 47 and linear's 99. |
| 8 | Effort monitoring on checkpoints and the Final | A "too fast to count" response and a parallel question. A sessions.js and client change. |
| 9 | Remediation after a missed Final | From `adaptation.remediation`. |
| 10 | Skills: build the skill record store and adopt the stage gate | Drills report each sitting's pass, source and confirmation. |
| 10b | Skills: whether attested-only metrics need a person's sign-off to complete a stage | Recitals, film reviews, capstones. |
| 10c | Skills: whether to require a margin above the bar at exit | Adaptive's exit competence is 97-99% against the gate's ~100%. |
| 11 | Scorecard owner: keep `ns`/`nsw` in `forgettingCurve` rows | Coverage now records them per objective. Also consider fitting the curve on objective-level memory checks. |
| 12 | The `ollama-provider-test` / `OLLAMA_ENABLED` conflict | The test is mocked and checks `OLLAMA_ENABLED=0` itself, so it fails when the whole chain runs with `OLLAMA_ENABLED=0`. Run it without that variable. |

## Files

| status | files |
|---|---|
| New | `services/coverage.js`, `services/adaptation.js`, `scripts/coverage-audit.js`, `scripts/coverage-test.js` (48 checks, added to `npm test`; also `npm run test:coverage`) |
| Round 2, edited (backups in `scratchpad/before-adaptation-r2/`) | `services/coverage.js`, `services/adaptation.js`, `scripts/coverage-audit.js`, `scripts/coverage-test.js` (81 checks), `staged/adaptation/adaptive-teaching-on.patch` (line endings), `staged/adaptation/README.md` |
| Round 2, new (staged) | `staged/adaptation/skills/`: `skill-coverage.js`, `skill-adaptation.js`, `skill-audit.js`, `skill-audit.txt/.json`, `README.md`; `staged/adaptation/coverage-audit.round1.*` |
| Edited (backups in `scratchpad/before-adaptation/`) | `services/mastery.js` (graduation hook), `services/sessions.js` (shadow/on hook), `package.json` (test chain plus two scripts) |

Knobs, all read from the environment on each call:

| module | knobs |
|---|---|
| coverage | `OBJ_PRIOR`, `OBJ_LEARN`, `OBJ_SLIP`, `OBJ_LUCK`, `OBJ_PROVEN_AT`, `OBJ_MIN_RIGHT`, `OBJ_MIN_ALIGNED`, `RETAIN_DAYS`, `RETAIN_SPAN_DAYS`, `RETAIN_AT`, `LAPSE_AT`, `COVERAGE_GATE`, `COVERAGE_RULE` |
| adaptation | `ADAPTIVE_TEACHING`, `ADAPT_REVIEW_AT`, `ADAPT_EXAM_REVIEW_AT`, `ADAPT_MEMORY_MIN_CHECKS`, `ADAPT_OWNER`; round 2: `ADAPT_DURABLE` (0 = round 1), `ADAPT_DURABLE_AT`, `ADAPT_DURABLE_DAYS`, `ADAPT_RETEACH`, `ADAPT_RUSH_RATE`, `ADAPT_RUSH_MIN` |
| skills (staged) | `SKILL_COLD_HOURS`, `SKILL_PROOF_DAYS`, `SKILL_PRIOR`, `SKILL_PASS_IF_AT`, `SKILL_LUCK`, `SKILL_PROVEN_AT`, `SKILL_STALE_DAYS`, `SKILL_DEFAULT_RETAIN_DAYS`, `SKILL_READY`, `SKILL_CHECK_DAYS`, `SKILL_MAINT_DAYS`, `SKILL_FILL` |
