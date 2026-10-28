# Staged: chess, piano and basketball in the coverage model (round 2)

Nothing here is live and nothing in the app imports it. The design and the numbers are in `../../../ADAPTIVE-COVERAGE.md` section 6; the stages, batteries and rules come from `../../skills/*/progression.json` and `../../../SKILL-CURRICULA.md`.

| file | what it is |
|---|---|
| `skill-coverage.js` | WHAT a stage must cover: its grades' knowledge objectives (`services/coverage.js`, unchanged) plus its exit-battery metrics. The per-learner skill record, one entry per metric, with every sitting. Rules as code: proof only, cold only (first sitting of the day, 20+ hours after practice), two different days, a Bayes belief so retaking until two lucky passes cannot prove a metric, source honesty (an estimate counts only when confirmed; self-report, film and imports never prove), the stage's retention test, and a "battery must stand at exit" rule (a proof older than 7 days needs a fresh cold pass). `stageGate()` decides both completion and a placement skip. `proofHolds()` re-derives a proof from its sittings. |
| `skill-adaptation.js` | HOW MUCH and WHEN: a session plan per learner per stage. Practice is shared among unproven metrics by distance from target, ends on proof (proven metrics keep one maintenance set a session), cold stage tests when the last three warm sets are at target or every 5 days, retention and re-sit tests when due. `checkPlan()` proves no unproven metric is dropped. |
| `skill-audit.js` | Part 1: every stage of the three subjects checked. Part 2: 8 learner profiles walk chess CH0-CH5, piano PI0-PI4 and basketball BB0-BB3 under `today`, `gate` and `adaptive`, and every stage completed or skipped is re-checked from its sittings. |
| `skill-audit.txt` / `.json` | Output of the run reported in ADAPTIVE-COVERAGE.md. |

Run: `node curriculum-build/staged/adaptation/skills/skill-audit.js --learners=6 --json=curriculum-build/staged/adaptation/skills/skill-audit.json`. Tests: `scripts/coverage-test.js` ("round 2: skill subjects").

To go live this needs (owner's call): a store for the skill record (one row per learner per metric with its sittings), the drills to report each sitting's pass/fail and source, and a stage screen that shows the battery, which metrics are proven, and the attested-only ones.

Round 3 (`../skills-round3/`): the store, stage tests, the gate and the practice plan as one-step patches. `skill-adaptation.js` gained the maintenance share (proven metrics keep the share even practice would give them until they have had twice the sets it took to prove them; `SKILL_MAINT_SHARE=0` is round 2's plan) and an off-by-default carry-over knob; `skill-audit.js` runs round 2's plan as `adaptive_r2` beside it and measures owner decision 10c with `SKILL_EXIT_DOSE`. Output: `../skills-round3/skill-audit.txt`.
