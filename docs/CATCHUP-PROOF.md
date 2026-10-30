# Catch-up proof

## Evidence map (C4)

Every design choice that claims to help learning, with the mechanism it rests on in `curriculum-build/evidence-article/`
(ids are `<article number>-M<mechanism>`; article 02 numbers its mechanisms in the "at a glance" table).
`scripts/catchup-evidence-test.js` fails if a cited id stops existing.

| Design choice | Where | Mechanism | Verdict there |
|---|---|---|---|
| Diagnostic first: the learner is checked before anything is taught | `services/catchup-engine.js` `nextCheck` | 01-M7 (Bayesian belief with guess floor and slip ceiling), 01-M11 (in-grade unit placement) | see article |
| Skip mastered skills, only on the unit's own evidence; never on a guess | `decideSkill` (`unitBelief`), an undecided skill after 3 questions is taught | 01-M13, 01-M14 | see article |
| Earlier-grade scan below the target, offered not forced | `services/catchup-units.js` lookback | 01-M15 | see article |
| Prerequisite order: lowest grade first | `newState` sorts by grade | **UNVERIFIED**: no mechanism covers ordering across grades (01-M32 is ordering inside one lesson). Listed in `docs/yc/SOURCES-TO-VERIFY.md` | none |
| Retrieval practice: the re-check asks fresh questions, never ones already asked | `startRecheck`, `askedSet` | 02-M1 (retrieval with feedback), 02-M27 (a new question instance each time) | strong, moderate |
| Interleaving in the re-check: caught-up and known skills mixed | `startRecheck` sort | 01-M43 | see article |
| Spacing: reviews after 1, 3, 7, 21 days | `REVIEW_DAYS` | 01-M51 (expanding intervals; its own steps are 1, 3, 7, 16, 35, so the 21 is a design choice) and 02-M30 (daily review queue) | moderate |
| Final re-check; a miss sends only that skill back | `scoreRecheck` | 01-M12 (a unit missed twice is reopened) | see article |

<!-- sim:start -->
## Simulation (scripts/catchup-sim.js, seed 20261030, 12 learners per row, lookback 3)

| Subject | Slip | Scenario | Skills | Gaps found | Known skills taught | Work (catch-up) | Work (linear) |
|---|---|---|---|---|---|---|---|
| math | 0.0% | none | 52 | n/a (0/0) | 0.0% | 156 | 1231 |
| math | 0.0% | few | 52 | 100.0% (58/58) | 0.0% | 265 | 1231 |
| math | 0.0% | many | 52 | 98.1% (303/309) | 0.0% | 719 | 1231 |
| math | 0.0% | all | 52 | 98.4% (614/624) | n/a | 1288 | 1231 |
| math | 3.0% | none | 52 | n/a (0/0) | 6.9% | 238 | 1231 |
| math | 3.0% | few | 52 | 98.3% (58/59) | 8.5% | 355 | 1231 |
| math | 3.0% | many | 52 | 98.4% (302/307) | 9.5% | 769 | 1231 |
| math | 3.0% | all | 52 | 97.8% (610/624) | n/a | 1284 | 1231 |
| english | 0.0% | none | 60 | n/a (0/0) | 0.0% | 180 | 1777 |
| english | 0.0% | few | 60 | 98.7% (78/79) | 0.0% | 362 | 1777 |
| english | 0.0% | many | 60 | 97.5% (348/357) | 0.0% | 993 | 1777 |
| english | 0.0% | all | 60 | 98.5% (709/720) | n/a | 1840 | 1777 |
| english | 3.0% | none | 60 | n/a (0/0) | 8.5% | 330 | 1777 |
| english | 3.0% | few | 60 | 100.0% (73/73) | 7.9% | 468 | 1777 |
| english | 3.0% | many | 60 | 99.0% (380/384) | 7.7% | 1138 | 1777 |
| english | 3.0% | all | 60 | 98.5% (709/720) | n/a | 1842 | 1777 |
| reading | 0.0% | none | 36 | n/a (0/0) | 0.0% | 108 | 1089 |
| reading | 0.0% | few | 36 | 100.0% (45/45) | 0.0% | 213 | 1089 |
| reading | 0.0% | many | 36 | 97.2% (209/215) | 0.0% | 603 | 1089 |
| reading | 0.0% | all | 36 | 99.3% (429/432) | n/a | 1136 | 1089 |
| reading | 3.0% | none | 36 | n/a (0/0) | 9.0% | 204 | 1089 |
| reading | 3.0% | few | 36 | 95.2% (40/42) | 7.4% | 275 | 1089 |
| reading | 3.0% | many | 36 | 99.0% (207/209) | 13.9% | 676 | 1089 |
| reading | 3.0% | all | 36 | 97.5% (421/432) | n/a | 1115 | 1089 |

Work = check questions + levels taught; linear = every level below the target. A check question counts as a whole level (overstates catch-up cost). In the "all" scenario the check is pure overhead, so no saving is claimed there.

**Open, measured, not hidden:** at slip 3% about 9% of the skills a learner knew are still taught. The shared belief (services/learner-path.js unitBelief, SLIP 0.15) sends a skill to learn after one miss, and every unit bank has exactly 5 questions (2 kept for the re-check), so the check cannot ask a second chance question. The 5% bar is enforced in the suite at slip 0 only. Fixing the 3% row needs more questions per unit in the banks (queue item C3b). Cost of the extra teaching is time, not a skipped gap: gaps found stay at or above 95%.
<!-- sim:end -->
