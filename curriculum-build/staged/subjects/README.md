# Staged: subjects audit (2026-10-24)

From `curriculum-build/SUBJECTS-FUNCTIONAL-AUDIT.md`. Nothing here is live.

## 01-grade-bands.patch (`GRADE_BANDS=on`, default off)

**The problem.** The bank's difficulty scale is subject-wide: 1 is a first lesson in the subject and 10 the hardest material it has. But `config/curriculum.js` `difficultyForLevel` runs every grade over the whole 1-10 scale. So every grade's bank questions climb from the easiest to the hardest the subject has:

| grade | first practice level | Graduation exam (today) |
|---|---|---|
| math `sense_of_quantity` (preschool) | "15 + 6 =" | difficulty 10: a balance-scale algebra problem |
| math `numbers_to_10` (Kindergarten) | "4 - 7 =" | difficulty 10; practice levels 99-196 focus on linear equations at 3.3-5.5 ("Solve for x: 7x - 14 = 2x - 49") |
| math `senior_scholar` (doctoral) | "2.2 - 2.8 =" | "Solve for x: (5x)/3 + 10 = 15" |
| english `basics` (preschool) | letter sets | "The passage is primarily concerned with" (ACT style) |
| iq `concrete_thinking_foundations` | turning directions | difficulty-10 letter series |

**The patch.** With `GRADE_BANDS=on`, a grade's levels climb across its own slice of the scale, placed by the grade's position in its track: centred on that position, at least `GRADE_BAND_WIDTH` (2) wide, so a grade still gets harder from its first level to its Final. Off, nothing changes. Placement keeps its own scale (`services/placement.js` inverts the unbanded one), so a placed level means the same as before.

**Measured** (`scratchpad/.../subj/sweep-band.json`, every grade of every track): math Kindergarten Final moves from difficulty 10 to 3; doctoral math opens at 8 instead of 1; English preschool's Final is no longer an ACT passage question; IQ foundations' Final letter series becomes "C, D, E, F, G, ___". Coverage, adaptation and the proof/retention path are unchanged on all 219 grades (the sweep's checks pass with the band on).

**What it does not fix.** A grade's *skills* still come from the track defaults where its sheet names none: every math grade draws on the same 7 generic skills, so Kindergarten still meets `linear_eq` (at difficulty 1-3: "Solve for x: 7x + 3 = 10"), and doctoral reading's Final can ask about syllable types. The real fix is grade-appropriate questions per objective: the objective items the content factory is writing (night item 1), served first by the review and recall rounds. The bank generators also have nothing at doctoral level, whatever the band.

**Apply:** `git apply --check -p1 curriculum-build/staged/subjects/01-grade-bands.patch`, then `git apply -p1 ...`, set `GRADE_BANDS=on`, restart. Undo: `git apply -R -p1 ...`. Only `config/curriculum.js` changes (a `grade` argument on `difficultyForLevel`, the new `gradeBand`, and `levelPlan` passing the grade).
