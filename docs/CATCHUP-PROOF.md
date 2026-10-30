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
| math | 0.0% | few | 52 | 98.6% (70/71) | 0.0% | 293 | 1231 |
| math | 0.0% | many | 52 | 98.0% (300/306) | 0.0% | 745 | 1231 |
| math | 0.0% | all | 52 | 98.2% (613/624) | n/a | 1350 | 1231 |
| math | 3.0% | none | 52 | n/a (0/0) | 0.8% | 173 | 1231 |
| math | 3.0% | few | 52 | 98.0% (49/50) | 1.0% | 273 | 1231 |
| math | 3.0% | many | 52 | 98.1% (317/323) | 1.7% | 781 | 1231 |
| math | 3.0% | all | 52 | 98.1% (612/624) | n/a | 1346 | 1231 |
| english | 0.0% | none | 60 | n/a (0/0) | 0.0% | 180 | 1777 |
| english | 0.0% | few | 60 | 97.6% (83/85) | 0.0% | 386 | 1777 |
| english | 0.0% | many | 60 | 98.0% (345/352) | 0.0% | 1029 | 1777 |
| english | 0.0% | all | 60 | 98.2% (707/720) | n/a | 1912 | 1777 |
| english | 3.0% | none | 60 | n/a (0/0) | 0.7% | 204 | 1777 |
| english | 3.0% | few | 60 | 100.0% (81/81) | 0.2% | 388 | 1777 |
| english | 3.0% | many | 60 | 97.9% (372/380) | 1.2% | 1104 | 1777 |
| english | 3.0% | all | 60 | 96.9% (698/720) | n/a | 1886 | 1777 |
| reading | 0.0% | none | 36 | n/a (0/0) | 0.0% | 108 | 1089 |
| reading | 0.0% | few | 36 | 100.0% (50/50) | 0.0% | 233 | 1089 |
| reading | 0.0% | many | 36 | 97.9% (228/233) | 0.0% | 681 | 1089 |
| reading | 0.0% | all | 36 | 97.9% (423/432) | n/a | 1163 | 1089 |
| reading | 3.0% | none | 36 | n/a (0/0) | 0.5% | 119 | 1089 |
| reading | 3.0% | few | 36 | 95.6% (43/45) | 0.3% | 227 | 1089 |
| reading | 3.0% | many | 36 | 98.2% (216/220) | 1.9% | 660 | 1089 |
| reading | 3.0% | all | 36 | 98.4% (425/432) | n/a | 1167 | 1089 |

Work = check questions + levels taught; linear = every level below the target. A check question counts as a whole level (overstates catch-up cost). In the "all" scenario the check is pure overhead, so no saving is claimed there.

**Slip-tolerant check (C3b):** before it, at a 3% slip about 9% of the skills a learner knew were still taught (the shared belief sends a skill to learn after one miss). A skill whose unit bank has 7 or more questions is now checked slip-tolerantly (services/catchup-units.js tolerant): a first miss never sends it to learn, it is asked again (up to 5 questions for the check, 2 kept fresh for the re-check). Banks were extended from 5 to 7 questions a unit for math grades 1-12 and english and reading grades 1-8 (all three subjects' skills in this sim's lookback window; counts and the second-model checks in curriculum-build/content-gap/catchup-*-report.json); a skill with a shorter bank keeps the plain check, so the tolerant share grows with the content and never ahead of it. The suite holds the 5% bar at both slips (GATED_SLIPS), and scripts/catchup-units-test.js fails if a covered unit loses its seventh question. Gaps found stay at 95% or above. The cost is a few more check questions for a learner who slips once.
<!-- sim:end -->
