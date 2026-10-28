# Grade fit against the published standards (standards check, 2026-10-24 night)

This is an independent check of the "grade-appropriate skills" work (`config/grade-skills.js`, task 4 of `AWAY-2026-10-24.md`). It covers math from preschool through university, English and Reading, and Spanish. Each skill's grade range was checked against its published standard:

- Common Core State Standards for Mathematics (CCSS-M);
- CCSS English Language Arts, including the Reading Foundational Skills;
- the CEFR Companion Volume (Council of Europe, 2020), with ACTFL.

Then generated items for every grade were sampled through the real planner and held to their grade's standard.

Rollback and the list of live files are in `LIVE-CHANGES-2026-10-24.md`, section "Grade fit against the standards".

## Summary

- **Ranges checked: 90.** That is 37 math, 22 English, 14 Reading and 17 Spanish skill ranges (`FIT`).
  - **80 confirmed.**
  - **10 changed:**
    - math: `slope_lines`, `calculus`, `linear_algebra`, `act_data`;
    - English: `word_choice`, `modifiers`;
    - Spanish: `es_subjunctive`, `es_preterite`, `es_greetings`, `es_numbers`.
- **Ranges and tiers inside a grade:**
  - `DIFFICULTY_RANGE` now covers 9 math-only skills: `place_value` (re-split), plus `counting`, `shapes`, `facts_within_20`, `measurement`, `data_stats`, `probability`, `calculus` and `integers`.
  - 12 shared math skills get a **school tier** per grade.
  - 14 English and Reading pools now carry, on each of their 293 entries, the US grade whose standard first teaches that rule.
- **Items sampled:** 102,400 before the fixes and 102,400 after.
  - They cover 138 grades (all of math, English, Reading and Spanish): 30 levels spread across each path plus the Final.
  - They go through `curriculum.levelPlan`, then `sessions.planLesson` or `planCheckpoint`, which apply `capDifficulty` and now the school grade, then `bank.generate`, with 2 renders per entry.
- **Misfits found, all fixed (0 in the after sample):**

  | Area | Items above grade, before |
  |---|---|
  | Math preschool to grade 8 | 1,038 of 14,930 |
  | English and Reading grades 1–3, graded pools | 267 of 3,734 |
  | Kindergarten phonics above RF.K | 355 of 400 |
  | Spanish A1–A2 subjunctive drills | 120 |
  | AP-level Statistics drawing calculus or linear algebra | 162 |
  | 7th-grade slope | 72 |
  | Precalculus derivatives | 27 |
  | 7th-grade counting rules | 28 |
  | 7th-grade signed products over 10,000 | 11 |
  | 8th-grade fractional exponents | 2 |

## How the check was done

1. **Every `FIT` range** was read against the standard for its first and last grade (table below). A range was changed only where the skill's own generator or pool had no question at its first grade, or where the standard puts the skill later.
2. **Sampling.** For every grade, 30 levels spread across the path plus the Final went through the real planner. Each entry was rendered twice (`scratchpad/…/gfs/sample.js`).
   - Each item was held to its grade: the largest number in it, and whether it uses negatives, ×/÷ before grade 2, fractions before grade 3, decimals before grade 4, exponents before grade 5, percents, equations in x, circles or cylinders before their grade, unlike denominators before grade 5, standard deviation before high school, conversions before grade 4, or rounding before grade 3 (`gfs/score.js`).
   - For English, each item was checked against the rules a grade 1–3 standard does not teach yet: verbals, nonessential clauses, colons and semicolons, indirect questions, dangling modifiers, perfect tenses, conditionals, affect/effect, lay/lie and whom.
   - The upper grades were read by hand: high school, the university math grades and Spanish B1–C2.
3. **The same checks are now permanent** in `scripts/grade-skills-test.js`, under "each school grade gets its own standard", and run every math grade's levels (every third one) through the planners.

### Why a "school grade" travels with each entry

The shared bank skills (`add_sub`, `fractions`, the grammar pools…) also serve the ACT and the upper grades, and their difficulty scale was set for those. So a school grade could not be reached by difficulty alone without changing what the ACT gets:

- the early math grades all sit in the 1–3 band;
- the English grammar families had difficulty ranges starting at 1 for rules like "an indirect question" or "a comma after an opening clause", so a first-grader was asked them.

`config/grade-skills.js` now has `schoolGrade(grade)` (−1 preschool, 0 Kindergarten … 12) and `fitEntry(grade, entry)`, which holds the difficulty to the grade's range and attaches `school`.

- **Who passes it:**
  - the planners: `sessions.planLesson`, `planCheckpoint` and `blockRetentionItem`, plus the lesson fallback;
  - reviews, drills, enforcers, the session-end retention set and the effort monitor's parallel question.
- **How the bank uses it** (`bank.generate({ school })`):
  - math serves the tier for that grade's standard (`content/math-grade-items.js` `SCHOOL`);
  - the English pools serve only entries with `g` ≤ the grade (`content/pool.js` `forSchool`). Once those are all seen, a learner gets a repeat rather than a later grade's rule.
- **Anything without `school` is byte-for-byte as before.** That covers the ACT, college grades, IQ, chess, piano and basketball. The test checks that ACT plans carry none.

## Table: grade → skill → range → standard → URL

Grade names follow each track's ladder. "Range in grade" is the `DIFFICULTY_RANGE` slice or the school tier. Every CCSS URL below returned 200 on 2026-10-24.

**Base URLs:**
- CCSS-M: `https://www.thecorestandards.org/Math/Content/<grade>/<domain>/`
- CCSS-ELA: `https://www.thecorestandards.org/ELA-Literacy/<strand>/<grade>/`

### Math

| Skill | Grades it fits (FIT) | Range in grade | Standard | URL | Result |
|---|---|---|---|---|---|
| counting | Preschool (3-4) → Grade 1 first half | ages 3-4: difficulty 1–2.3 (within 10); Pre-K and K: to 20 | Head Start ELOF P-MATH 1 (number words to 10 at 36-48 mo; count to 20 at 60 mo); K.CC.1-5; 1.NBT.1 | https://headstart.gov/school-readiness/article/math-preschool ; …/Math/Content/K/CC/ ; …/1/NBT/ | confirmed; new range for ages 3-4 (was up to 20) |
| shapes | Preschool → Grade 3 first half | Pre-K–K 1–2.1 (triangle, square, hexagon; no partitioning); G1 1.7–2.4 (halves, fourths) | K.G.1-4, K.MD.2; 1.G.1-3; 2.G.1-3; 3.G.1 | …/K/G/ ; …/1/G/ ; …/2/G/ ; …/3/G/ | confirmed; new ranges, generator tiers |
| facts_within_20 | K first half → Grade 2 second half | K 1–2.1 (within 10, no compare problems) | K.OA.1-5; 1.OA.1-8; 2.OA.2 | …/K/OA/ ; …/1/OA/ ; …/2/OA/ | confirmed; new range, 2 new K frames |
| place_value | K second half → Grade 5 first half | K 1–1.6 teens; G1 1–1.9 and 1.7–1.9; **G2 2–2.3 (no rounding)**; G3 2.4–2.7; G4 2.8–3.8; G5 3.4+ | K.NBT.1; 1.NBT.1-6; 2.NBT.1-4, 8; 3.NBT.1; 4.NBT.1-3; 5.NBT.1-4 | …/K/NBT/ ; …/1/NBT/ ; …/2/NBT/ ; …/3/NBT/ ; …/4/NBT/ ; …/5/NBT/ | confirmed; G2/G3 split (rounding was in G2) |
| measurement | Grade 1 → Grade 4 | G1 1–1.6 (clock to hour and half hour, same-size units, order three lengths); G2 1.7–2.2 (coins, 5-minute clock, inches/cm); G3 2.3–2.7 (elapsed time, mass, volume); G4 2.8+ (conversions) | 1.MD.1-3; 2.MD.1-8; 3.MD.1-2; 4.MD.1-2 | …/1/MD/ ; …/2/MD/ ; …/3/MD/ ; …/4/MD/ | confirmed; new ranges, 4 tiers, 6 new frames |
| add_sub | Grade 1 second half → Grade 6 first third | school tiers: G1 within 100 by ones and tens; G2 within 100, then 1,000, four addends, 1-2 step stories; G3 within 1,000, rounding estimates; G4–5 to 1,000,000; G6 adds decimals; never below 0 | 1.NBT.4-6, 1.OA.1, 8; 2.NBT.5-7, 2.OA.1; 3.NBT.1-2, 3.OA.8; 4.NBT.4; 6.NS.3; negatives are 7.NS.1 | …/1/NBT/ ; …/2/NBT/ ; …/3/NBT/ ; …/4/NBT/ ; …/6/NS/ ; …/7/NS/ | confirmed; school tiers |
| word_problems | Grade 1 second half → Grade 8 | tiers: G1 within 20, three addends; G2 1-2 steps within 100, length, coins; G3 equal groups, sharing, two steps; G4–5 remainders, "times as long", speed, money; G6+ own generator (ratio mixtures) | 1.OA.1-2; 2.OA.1, 2.MD.5, 8; 3.OA.3, 8; 4.OA.2-3, 4.MD.2; 6.RP.3 | …/1/OA/ ; …/2/OA/ ; …/3/OA/ ; …/4/OA/ ; …/6/RP/ | confirmed; school tiers |
| data_stats | Grade 2 second half → College junior | G2–G5 1–2.9 (tallies, picture and bar graphs); G6–G8 3–5.9 (mean, median, mode, range) | 2.MD.10; 3.MD.3; 4.MD.4; 5.MD.2; 6.SP.4-5; HSS-ID.A.2-4 | …/2/MD/ ; …/6/SP/ ; …/HSS/ID/ | confirmed; new ranges (z-scores were in grade 5) |
| mul_div | Grade 2 second half → Grade 7 first half | tiers: G2 arrays to 5×5, equal addends, skip counting, odd/even; G3 facts within 100, ×10s, equal groups; G4 4-digit × 1, 2-digit × 2, remainders, factors, "times as many"; G5+ own generator | 2.OA.3-4, 2.NBT.2; 3.OA.1-7, 3.NBT.3; 4.NBT.5-6, 4.OA.1-4; 5.NBT.5-6 | …/2/OA/ ; …/3/OA/ ; …/4/NBT/ ; …/5/NBT/ | confirmed; school tiers |
| fractions | Grade 3 second half → Grade 8 | tiers: G3 unit fractions, number line, simple equivalents, same numerator or denominator (2, 3, 4, 6, 8); G4 equivalents, compare, like denominators, mixed numbers, whole × fraction, tenths/hundredths; G5 unlike denominators, ×, unit-fraction division; G6 fraction ÷ fraction; positive results; G7+ own | 3.NF.1-3; 4.NF.1-5; 5.NF.1, 3, 4, 7; 6.NS.1; 7.NS.1 | …/3/NF/ ; …/4/NF/ ; …/5/NF/ ; …/6/NS/ | confirmed; school tiers |
| geometry_area | Grade 3 second half → Grade 10 first half | tiers: G3 unit squares, area, perimeter, missing side; G4 formulas, angles; G5 volume (cubes, boxes, two boxes); G6 triangles, parallelograms, surface area; G7 own generator held to difficulty ≤6 (circles yes, cylinders no); G8+ own | 3.MD.5-8; 4.MD.3, 5-7; 5.MD.3-5; 6.G.1-4; 7.G.4-6; 8.G.9 | …/3/MD/ ; …/4/MD/ ; …/5/MD/ ; …/6/G/ ; …/7/G/ ; …/8/G/ | confirmed; school tiers |
| decimals | Grade 4 → Grade 7 | tiers: G4 tenths/hundredths, compare; G5 add, subtract and multiply to hundredths, ×÷10 and 100, rounding; G6 four operations; never below 0; G7 own | 4.NF.5-7; 5.NBT.2, 4, 7; 6.NS.3; 7.NS.1 | …/4/NF/ ; …/5/NBT/ ; …/6/NS/ | confirmed; school tiers |
| order_ops | Grade 5 second half → Grade 8 | tier: G5 parentheses, × before +, no exponents; G6+ own | 5.OA.1; 6.EE.2c | …/5/OA/ ; …/6/EE/ | confirmed; school tier |
| exponents | Grade 5 second half → Grade 11 | tiers: G5 powers of ten (plus squares, for the sheet's "Perfect Squares" lesson); G6–7 whole-number exponents; G8 own generator held to ≤5 (no fractional exponents); HS own | 5.NBT.2; 6.EE.1-2; 8.EE.1-2; HSN-RN.A.1 | …/5/NBT/ ; …/6/EE/ ; …/8/EE/ ; …/HSN/RN/ | confirmed; school tiers |
| act_data | **Grade 6** → Grade 9 (was Grade 5 second half) | (unit rates, tables, averages) | 6.RP.2-3; 6.SP.5 | …/6/RP/ ; …/6/SP/ | **changed** (no grade used it at 5) |
| percents | Grade 6 → Grade 9 | tier: G6 percent of, find the whole, rate per 100; no percent change; G7+ own | 6.RP.3c; 7.RP.3 | …/6/RP/ ; …/7/RP/ | confirmed; school tier |
| ratios | Grade 6 → Grade 10 first half | — | 6.RP.1-3; 7.RP.2 | …/6/RP/ ; …/7/RP/ | confirmed |
| integers | Grade 6 middle → Grade 9 | tier: G6 order, opposites, absolute value, temperature, grid distance; G7 own generator held to ≤4 (factors within 61); HS own | 6.NS.5-8; 7.NS.1-3 | …/6/NS/ ; …/7/NS/ | confirmed; school tier, new G7 range |
| linear_eq | Grade 6 last third → Grade 12 | tiers: G6 one-step (6.EE.7) and "which value makes it true" (6.EE.5); G7 px + q = r and p(x + q) = r; G8+ own | 6.EE.5, 7; 7.EE.4a; 8.EE.7 | …/6/EE/ ; …/7/EE/ ; …/8/EE/ | confirmed; school tiers |
| inequalities | Grade 6 last third → Grade 12 | tier: G6 which value is true, writing x > c, counting whole solutions; G7+ own | 6.EE.5, 8; 7.EE.4b | …/6/EE/ ; …/7/EE/ | confirmed; school tier |
| probability | Grade 7 second half → Senior scholar | G7 1–4.9 (die, bag, two draws); counting rules from high school | 7.SP.5-8; HSS-CP.B.9 (+) | …/7/SP/ ; …/HSS/CP/ | confirmed; new range |
| slope_lines | **Grade 8** → Grade 12 (was Grade 7 second half) | — | 8.EE.5-6, 8.F.3-4 (7.RP.2 is proportional relationships, not slope) | …/8/EE/ ; …/8/F/ | **changed** |
| systems | Grade 8 → Grade 12 | — | 8.EE.8; HSA-REI.C.5-6 | …/8/EE/ ; …/HSA/REI/ | confirmed |
| functions | Grade 8 → College sophomore s1 | — | 8.F.1-5; HSF-IF | …/8/F/ ; …/HSF/IF/ | confirmed |
| quadratics | Algebra 1 Part B → Grade 12 | — | HSA-REI.B.4; HSF-IF.C.8 | …/HSA/REI/ | confirmed |
| polynomials | Algebra 1 Part B → Grade 12 | — | HSA-APR.A.1 | …/HSA/APR/ | confirmed |
| sequences | Algebra 1 Part B → College sophomore s1 | — | HSF-BF.A.2; HSF-LE.A.2 | …/HSF/BF/ ; …/HSF/LE/ | confirmed |
| trig_basics | Geometry Part B → College sophomore s1 | — | HSG-SRT.C.6-8; HSF-TF | …/HSG/SRT/ ; …/HSF/TF/ | confirmed |
| rational_expr | Algebra 2 Part A → Grade 12 | — | HSA-APR.D.6 | …/HSA/APR/ | confirmed |
| complex_nums | Algebra 2 Part A → College freshman s2 | — | HSN-CN.A.1-3 | …/HSN/CN/ | confirmed |
| logs | Algebra 2 Part B → College freshman s2 | — | HSF-LE.A.4; HSF-BF.B.5 (+) | …/HSF/LE/ ; …/HSF/BF/ | confirmed (see "not fixed") |
| calculus | **Precalculus, then Calculus I** → College junior-senior (Statistics skipped) | Precalculus 1–4.9: limits only (new generator tier) | no CCSS (calculus is past grade 12); AP Calculus AB/BC Course and Exam Description, Unit 1 limits, for the boundary | https://apcentral.collegeboard.org/courses/ap-calculus-ab | **changed** (AP Statistics had "Correlation and Its Limits" as calculus) |
| linear_algebra | **Precalculus, then Calculus I** → Senior scholar (Statistics skipped) | — | HSN-VM.C.6-12 (+) for Precalculus matrices; college: CUPM course structure | …/HSN/VM/ ; https://maa.org/resource/cupm-guide/ | **changed** ("Rank Correlation" was linear algebra) |
| discrete_math | Multivariable Calculus → Senior scholar | — | college: MAA CUPM 2015 guide (course sequence only; not grade-coded) | https://maa.org/resource/cupm-guide/ | confirmed |
| analysis | Probability (junior) → Senior scholar | — | as above | as above | confirmed |
| abstract_algebra | Real Analysis I → Senior scholar | — | as above | as above | confirmed |
| topology | Real Analysis II → Senior scholar | — | as above | as above | confirmed |

### English (Reading has the same ladder and the rows marked R)

| Skill | Grades it fits | What a school grade is served (entry `g` ≤ grade) | Standard | URL | Result |
|---|---|---|---|---|---|
| early_literacy (E, R) | Preschool–K → Grade 1 | — | RF.K.1-2; RF.1.1-2 | …/ELA-Literacy/RF/K/ ; …/RF/1/ | confirmed |
| phonics (E, R) | Preschool–K → Grade 4 | K: 4 new families (middle vowel, same middle sound, blending, changing the first sound) plus letter sets; G1 digraphs, vowel teams, final e (plus 1 new family), endings; G2 r-controlled, syllable types; G3 silent letters, prefixes; G4 roots | RF.K.1d, 2d-e, 3b; RF.1.3a, c, f; RF.2.3; RF.3.3a, d; L.4.4b | …/RF/K/ ; …/RF/1/ ; …/RF/2/ ; …/RF/3/ ; …/L/4/ | confirmed; K had no RF.K question (355 of 400 above grade) |
| early_comprehension (E, R) | Preschool–K → Grade 4 | — | RL/RI.K-4.1-3 | …/RL/K/ | confirmed |
| parts_of_speech | Grade 1 → College years 2-3 | G1 adjectives, conjunctions, prepositions, verbs; G2 adverbs, subject; G3 what an adverb modifies; G5 objects; G6 whom, nonessential clauses; G8 gerunds, infinitives | L.1.1e-i; L.2.1e; L.3.1a; L.6.1a, L.6.2a; L.8.1a | …/L/1/ ; …/L/2/ ; …/L/3/ ; …/L/6/ ; …/L/8/ | confirmed; tagged |
| sentence_struct | Grade 1 → College years 2-3 | G1 complete sentences; G4 fragments, run-ons, comma splices, joining with "that"; G5 combining; G7 dangling participles | L.1.1j; L.4.1a, f; L.7.1c | …/L/1/ ; …/L/4/ ; …/L/7/ | confirmed; tagged |
| punctuation_basic | Grade 1 → Grade 11-12 | G1 end marks, capitals for names; G2 days and cities, possessives; G4 quotation commas; G5 indirect questions; G6 comma before a trailing phrase; G9 colons, semicolons | L.1.2a-b; L.2.2a, c; L.4.2b; L.6.2a; L.9-10.2a-b | …/L/1/ ; …/L/2/ ; …/L/4/ ; …/L/9-10/ | confirmed; tagged (two family labels say the wrong thing, see findings) |
| subject_verb | Grade 2 → College year 1 | G1 plural subjects; G3 compound subjects and simple agreement; G5 neither/nor; G6 each of, collectives, "there are", intervening phrases; G9 "along with" | L.1.1c; L.3.1f; L.5.1e | …/L/1/ ; …/L/3/ ; …/L/5/ | confirmed; tagged |
| pronoun_case | Grade 2 → College year 1 | G1 subject and object pronouns; G2 reflexive; G3 antecedent agreement; G4 its; G6 case after "and", whom, indefinite antecedents, clear reference; G9 "It was he" | L.1.1d; L.2.1c; L.3.1f; L.4.1g; L.6.1a, c, d | …/L/2/ ; …/L/6/ | confirmed; tagged |
| verb_tense | Grade 2 → College year 1 | G1 past, present, future; G2 negation; G4 modals; G5 perfect tenses and tense shifts; G8 conditionals and the passive; G9 reported speech | L.1.1e; L.4.1b-c; L.5.1b-d; L.8.1b-c | …/L/1/ ; …/L/4/ ; …/L/5/ ; …/L/8/ | confirmed; tagged |
| comma_use | Grade 2 → College years 2-3 | G1 commas in a series; G4 before a conjunction; G5 introductory elements; G6 appositives and nonrestrictive clauses; G7 coordinate adjectives | L.1.2c; L.4.2c; L.5.2a-b; L.6.2a; L.7.2a | …/L/1/ ; …/L/4/ ; …/L/5/ ; …/L/6/ ; …/L/7/ | confirmed; tagged |
| apostrophes | Grade 2 → College year 1 | G2 singular possessives; G3 plural possessives; G4 its/it's, whose/who's; G9 joint possession | L.2.2c; L.3.2d; L.4.1g | …/L/2/ ; …/L/3/ ; …/L/4/ | confirmed; tagged |
| word_choice | **Grade 4** → College years 2-3 (was Grade 2) | G4 there/their, than/then, its/it's, whose; G5 fewer/less; G6 affect/effect; G8 lay/lie | L.4.1g ("frequently confused words") | …/L/4/ | **changed**: the pool's earliest rule is L.4.1g, so grades 2-3 had only affect/effect, lay/lie and fewer/less |
| modifiers | **Grade 7-8** → College years 2-3 (was Grade 3) | G7 misplaced and dangling modifiers, "only"; G9 parallelism | L.7.1c; L.9-10.1a | …/L/7/ ; …/L/9-10/ | **changed**: nothing in the pool is grade 3-6. Comparatives (L.3.1g) re-tag to parts of speech |
| transitions | Grade 3 → College years 2-3 | G3 result, example, sequence; G5 contrast; G7 concession | W.3.1c; W.5.1c; W.7.1c | …/W/3/ ; …/W/5/ ; …/W/7/ | confirmed; tagged |
| literary_analysis (E, R) | Grade 4 → Senior scholar | G4 simile, alliteration, point of view, onomatopoeia, theme, rhyme, setting; G5 personification, hyperbole; G6 conflict; G7 foreshadowing; G8 irony; G9+ by difficulty | L.4.5a; RL.4.2, 4.5, 4.6; L.5.5a; RL.8.6 | …/RL/4/ ; …/L/5/ ; …/RL/8/ | confirmed; tagged |
| academic_writing (E, R) | Grade 4 → Senior scholar | G4 fact and opinion, firsthand accounts, listing sources (3 new items); G6 thesis, credible sources; G7 plagiarism, counterclaims; G9 fallacies, citation styles; G10 ethos | RI.4.6; W.4.1, W.4.8; W.6.1a, W.6.8; W.7.1a, W.7.8; RI.9-10.6, 8; W.9-10.8 | …/RI/4/ ; …/W/6/ ; …/W/7/ ; …/RI/9-10/ | confirmed; tagged, 3 grade-4 items added (grade 4 had 2) |
| vocab_context, main_idea, detail_support (E, R) | Grade 5-6 → College years 2-3 | — | L.4.4a / L.5.4a context clues; RI.5.2 | …/L/5/ ; …/RI/4/ | confirmed for the skill (see "not fixed": passage complexity) |
| inference, author_purpose (E, R) | Grade 5-6 → College year 4 | — | RI.5.1, RI.6.6 | …/RI/4/ | confirmed (same passage note) |
| act_rhetoric | E: Grade 5-6 / R: Grade 7-8 → College | — | W.5.5, W.6.5, L.6.3 (revise for relevance, concision, emphasis) | …/W/5/ ; …/W/6/ | confirmed |
| act_science, act_data (R) | Grade 7-8 → College year 1 | — | RST.6-8.7, 6-8.9 | …/RST/6-8/ | confirmed |
| linguistics | E: College year 1 / R: College year 4 → Senior scholar | — | college (no K-12 standard) | — | confirmed |

### Spanish (CEFR levels by grade: 0-7 A1, 8-14 A2, 15-22 B1, 23-30 B2, 31-41 C1, 42-56 C2 and specialist)

The CEFR Companion Volume (CV) is at https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4. It was downloaded and read this session; page numbers are the CV's own.

ACTFL Proficiency Guidelines 2024: https://www.actfl.org/educator-resources/actfl-proficiency-guidelines.

| Skill | Grades it fits | Standard (CEFR CV descriptor; ACTFL) | Result |
|---|---|---|---|
| es_greetings | A1 → **end of A2 (14)** (was B1, 18) | CV sociolinguistic appropriateness: A1 "establish basic social contact … greetings and farewells" (pp. 136-137) | **changed**: B1 rows re-tag to es_vocab_core |
| es_numbers | A1 → **end of A2 (14)** (was 18) | CV vocabulary range A1-A2 (p. 131) | **changed** |
| es_gender, es_vocab_core, es_present_ar/erir, es_questions, es_adjectives | A1 → B1 | CV grammatical accuracy: A1 "limited control of a few simple grammatical structures" to B1 "reasonably accurately a repertoire of frequently used routines" (p. 132) | confirmed |
| es_ser_estar, es_translate | A1/A1+ → B2 | CV p. 132; mediation scales (translation) A2-B2 | confirmed |
| es_object_pron | A1 consolidation (6) → B2 | CV p. 132 (learnt repertoire: me/te/le with gustar at A1) | confirmed |
| es_preterite | **A2 (8)** → B2 (was the last A1 grade, 7) | CV A2: "describe past activities and personal experiences" (p. 173; also the A2 spoken-production scale, p. 62); ACTFL Intermediate to Advanced narrates in past time frames | **changed** (no A1 grade used it) |
| es_imperfect | A2 → B2 | as es_preterite | confirmed |
| es_subjunctive | **B1 (15)** → C1 (was A1, 7) | CV B1: "give or seek personal views and opinions", "describe dreams, hopes and ambitions" (pp. 62, 173); B2 "speculate about causes, consequences, hypothetical situations" (p. 174); Instituto Cervantes PCIC places the present subjunctive at B1 (site unreachable from here, 404, so a secondary source was used) | **changed**: A1 "Wishes as Chunks: Ojalá…" and A2 "Cuando llegues" were conjugation drills (120 items); they are now vocabulary |
| es_adv_grammar | end of B1 → C2 | CV B2-C2 grammatical accuracy (p. 132) | confirmed |
| es_idioms_register | B2 (26) → C2 | CV B2 "formal or informal register", C1 "idiomatic expressions and colloquialisms" (pp. 136-137) | confirmed |
| es_literature | C2 (42) → specialist | CV reading as a leisure activity: C1 "contemporary literary texts", C2 "classical or colloquial literary … texts" (p. 58) | confirmed |

## Findings and fixes

1. **Negative answers below grade 7 (507 items).** The shared `add_sub` generator subtracts a larger number from a smaller one at every difficulty. Grade 1, for example, drew "6 − 8 = −2".
   - Fix: school tiers (`add_sub`, `fractions`, `decimals`) keep every result at 0 or above until grade 7 (7.NS.1).
2. **Concepts from later grades in grades 1-2:**
   - multiplication in `add_sub`'s "Which is larger: 21 + 12, 21 − 12 or 21 × 12?" and its boxes word problem;
   - rounding;
   - in grade 1 `word_problems`: rate × time, change from $8.75 × 5, remainders and ratio mixtures.
   - Fix: school tiers per grade for `add_sub`, `word_problems` and `mul_div`.
3. **Unit conversions in grade 1 (116 items, "How many grams are in 8 kilograms?").** Conversions are 4.MD.1.
   - Fix: `measurement` now has four tiers with per-grade ranges, and 6 new frames (same-size units, ordering three lengths, the 5-minute clock, inches/cm, mass, liquid volume).
4. **Unlike denominators in grades 3-4 (84 items)** and fraction-by-fraction division in grade 5.
   - Fix: fraction tiers by grade (3.NF, 4.NF, 5.NF, 6.NS.1).
5. **Circles in grade 3 (64 items) and cylinders in grade 7 (6).**
   - Fix: geometry tiers (3.MD → 6.G), and grade 7 is held to difficulty ≤6.
6. **Decimals before grade 4 (97)**, z-scores in grade 5 (15), rounding in grade 2 (58), and counting to 20 at ages 3-4.
   - Fix: the ranges above.
7. **Above-grade English rules in grades 1-3 (267 items).** Examples: "Devon asked whether the office was open." (an indirect question), "what part of speech is 'practicing'?" (a gerund), "fix the comma splice", "will have worked", affect/effect, whom and the colon list.
   - Cause: the families' difficulty ranges started at 1.
   - Fix: each entry is tagged with the grade its CCSS rule is first taught, and school grades are filtered to those entries.
   - Two family labels in `content/english-families.js` do not match what they render:
     - "(capitalization of a name and a city)" renders a comma before a trailing phrase;
     - "(a possessive apostrophe)" renders a colon before a list.
   - They were tagged by what they render. The labels were left alone, because they are shape keys.
8. **Kindergarten phonics was grade 1-3 content (355 of 400 items):** digraphs, vowel teams, r-controlled vowels, silent letters and syllable types.
   - Fix: 5 RF.K-RF.1 families, each with a verifier.
9. **Spanish:**
   - the subjunctive was drilled in A1 and A2 (CEFR B1);
   - greetings and numbers were drilled at B1, far below the level.
10. **AP Statistics drew calculus and linear algebra (162 items)** through "Correlation and Its *Limits*" and "*Rank* Correlation". Grade 7 drew slope (72).
    - Fix: `FIT` can now hold two ranges, and slope starts at grade 8.
11. **Precalculus drew derivatives (27).**
    - Fix: a limits-only tier below difficulty 5, with precalculus held to it.
12. **Reviews and drills skipped `capDifficulty` entirely.** These are `review-session.questionFor`, the remediation drill, enforcer questions, the end-of-session retention set and the effort monitor's parallel question. So the 22:55 Kindergarten place-value fix did not reach a review: a review at difficulty 2.5 could still ask "ones digit in 402".
    - Fix: all of them now go through `fitEntry`, with a test.

## Not fixed (for the owner)

- **Reading passages are above the grade for Grades 5-8.** The bank's passages are ACT-level prose (for example "accessions", "the label rested on a stability the comparison has now…"). CCSS sets text-complexity bands of grades 4-5 and 6-8 (RL/RI.5.10, 8.10; Appendix A: https://www.thecorestandards.org/assets/Appendix_A.pdf). Fixing this needs grade-band passages written for those grades. The skills themselves fit.
- **Vocabulary in the grammar sentences** ("crowbar", "kiln", "contract", "bookkeeper") is adult. The rule tested now fits the grade, but the words are hard for a first-grader to decode.
- **logs (Algebra 2 B) uses very large arguments**, for example "Solve for x: 7^x = 40353607". The concept fits F-LE.4 and the number size is not set by the standard. It was left as is because the ACT shares the generator.
- **Grade 5's sheet teaches "Perfect Squares and Square Roots - A First Look"** (squares are 6.EE.1; roots 8.EE.2). Its questions stay on powers of ten and small squares, and the lesson itself is the sheet's.
- **A grade's in-standard pool can be small.**
  - Examples: grade 2 comma use (series commas only), grade 4 academic writing (5 items), grades 2-3 sentence structure (complete sentences only).
  - These repeat sooner instead of reaching a later grade's rule. More grade-level items would help.
- **Spanish PCIC level assignments** could not be re-read: cvc.cervantes.es returned 404 from here.
- **ACTFL descriptors** were not re-read: the guidelines page loads only its terms.

## Verification

All of it ran on the test copy `scratchpad/…/app-gfs`:
- a copy of the repo and of `data/db.json` (md5 `9d9105c7…`, unchanged);
- no `.env`, every key unset, `OLLAMA_ENABLED=0` except for `ollama-provider-test`.

The results:
- **`scripts/math-reading-template-audit.js`: clean.** 603 families, 215,410 renderings. That includes:
  - 84,000 school-tier renderings (12 skills × 14 school grades × 10 difficulties);
  - 19,500 tenth-step renderings of the grade-fit generators;
  - 15 phonics families.
- **`scripts/grade-skills-test.js`: passes.** Its new section, "each school grade gets its own standard", has 10 checks:
  - 32,590 math planner items from preschool to grade 8;
  - 5,490 English and Reading planner items, preschool to grade 3;
  - every graded English entry is tagged, and no grade falls back to a whole pool;
  - the ACT gets no school grade;
  - reviews are fitted;
  - Spanish has no A1-A2 subjunctive and no A1 preterite;
  - Statistics draws no calculus;
  - grade 7 draws no slope.
- **`npm run check`:** 31,500 items across 126 skills, no problems.
- **The sitting repeat rate is unchanged** (`npm run sitting` median 21.5%).
- **Two `self-test` checks fail sometimes, before and after the fix.**
  - **"a real sitting repeats less than 1 question in 4":**
    - Over 30-40 draws of its 11 blocks, the code from before this check averaged 29.7 repeats out of 132, with 10% of draws at or over the 33 limit.
    - After the fix the average is 29.4, with 5% of draws over the limit.
    - Two Kindergarten fact frames and two phonics families were added to keep it from rising.
  - **"its questions are not the worked example above them":** fails about 3% of the time on both builds, 6 of 150 before and 5 of 200 after.
  - Neither check changed with this work.
- **`self-test`:** 3 of 3 runs pass after the final change.
- **Full `npm test` chain: 55/55 pass.**
- **Also pass with `GRADE_SKILLS=off`:** `self-test`, `objective-items-test`, `spanish-csv-test`, `coverage-test` and `act-curriculum-test`.
- **Not touched:** `data/db.json` md5 is unchanged (`9d9105c7c43f765dd9ac20b787766466`).
