# Scorecard round 8: measuring what was unmeasured

Branch `scorecard-measured`. The goal: every scorecard measure as close to the learner's true value as the data allows within a month of use,
judged by the accuracy gate of `scripts/scorecard-recovery-sim.js` (`scripts/lib/sim-gate.js`): each measure's error at weeks 1 to 4 against
the best a read-out of the same data achieves. Before this round, at week 4 with every extra on: 29 pass, 15 fail, 56 "no signal"; the 11
experiment stats had confidence near 0, and the 40 llm-only stats had no measurement at all.

All numbers here are **simulated**. The sim's truth models and validities are assumptions (see "Limits").

## What changed

### 1. Experiments with power (`services/personalize.js`)

- **Allocator** (`PERSONALIZE_ALLOCATOR=info`, the default; `=weighted` is the old hash-weighted pick, kept as the rollback). Whether a page is a
  holdout or an experiment is still the hash. Which stat and arm: the one where one more experiment cuts the posterior variance of the learner's
  standing most (`scorecard.experimentState`: the information held on each arm, the pairwise choices, and the stat's standing when it has one),
  times importance `(1 + impact) / 2 x focus^0.25` (impact from `stats.js`, focus = the research's interest/length focus). The arm is the
  thinner one. A stat with neither arm tested is valued over the two experiments it takes to fill both, so the rule completes a stat before
  opening another rather than leaving twenty stats with one arm each. The pick is stored the first time it is asked (`experiment_arms`), so a
  level's arm never changes (the level editor, the finish route and the admin view all ask).
- **Outcome read**: already a residual against the ability model (`signals.residuals`) for the next level and for delayed recall on reviews;
  kept. Now also combined, in one posterior (`scorecard/index.js experimentPosterior`), with the pairwise choices below.
- **Within-level paired designs**: not built. A page teaches one focus skill and the next level's items are not mapped to page sections, so
  there is no way to give both arms comparable items in one level. The allocator's alternating (thinner) arm is the crossover that is
  possible. The sim has no level or day effects, so a paired design could not show a gain there anyway.
- **Time, quits and the page's feedback taps** were considered as extra outcomes and not added: nothing establishes that they measure the
  arm's benefit (the sim gives them no link either, so adding them would only add noise the gate cannot see).
- **Eleven new experiment dimensions** (`NEW_EXPERIMENTS`; `PERSONALIZE_DIMENSIONS=base` keeps the first eleven): see the decision table.
  Every instruction is plain, works on any subject, never pushes competition, points, fear or harshness. `PERSONALIZE_SKIP_STATS` (env) and a
  learner's `profile.lesson_prefs.off` switch dimensions off; interest-based examples are never tried on a learner with no stated interests.

### 2. "Which is clearer?" pairwise choice (a seventh measurement channel)

- `services/boosters.js choice`, `routes/boosters.js` (`GET /api/boosters/choice`, `POST /api/boosters/choice`, `POST .../choice/setting`),
  `public/js/boosters-choice.js` (on the lesson-finished card of `public/js/base-lesson.js`), a switch on the Extras page.
- Same rules as the other channels: `allowed()` (no one under the consent age without a parent's `measurement_extras` agreement, no one who has
  not answered the age screen). On by default for an allowed account, always skippable, switch-off on Extras.
- At most one per lesson and `BOOSTER_CHOICE_PER_DAY` (3) a day; only from the lesson-finished screen (never a quiz, checkpoint, practice or
  exam: `prepare` refuses any kind but `lesson`).
- The two versions (60-120 words each, the experiment's high and low instruction, otherwise identical) are written by
  `level-editor.writeChoicePair` on the `personalize` route, background lane, only for accounts whose levels are written for them. It is
  started, not awaited, when the lesson page is opened (`routes/base-lessons.js`); if it is not ready when the lesson ends, nothing is asked.
  `BOOSTER_CHOICE=off` stops it.
- Which dimension: `personalize.choiceDimension` (the same expected-information rule, with the Fisher information of one choice).
- The shown order is drawn per offer; a/b are mapped back to high/low on the server. "No difference" is evidence; a skip is not.
- **Scoring** (`scorecard/index.js`): an ordered probit on the learner's standing z: felt difference `u = v z + sqrt(1 - v^2) e`, high if
  `u > 0.4`, low if `u < -0.4`, else no difference. **Validity v = 0.3** (`SCORECARD_CHOICE_VALIDITY`), set conservatively: what people say
  helped them is a weak guide to what does (fluency is mistaken for learning; stated preferences rarely predict benefit). One choice carries
  about 0.08 units of information about z (an arm outcome of a 10-item level carries about 0.03). `SCORECARD_CHOICES=off` ignores choices.
  Directives from choices need 4 of them (`translate.js MIN_EVIDENCE.choice`). Kept rows (`choice_pairs`, `experiment_arms`) are covered by
  account deletion and the data download.
- **Sim**: `--channels=choice` (in `all`); validity `--choice-r` (0.3, equal to the scorecard's: the rule's best case), 25% skipped.

### 3. llm-only stats turned into measured ones

- **(a) experiment dimensions** (11): see table.
- **(b) item tags** (8): `services/scorecard/item-tags.js` (the tag reader; a table keyed by skill + prompt with numbers masked, an item's own
  `skill_tags`, notation read from the text) and a SHIFTS rule per tag in `signals.js`: each level's answers on questions tagged with the
  skill against those known not to need it, each against the ability model's expectation; needs a population; validity 0.8 (the tags are a
  model's labels). `SCORECARD_ITEM_TAGS=off`. The tagger `scripts/tag-question-skills.js` sends only question text, choices, subject and skill
  name to xKiro's **free** models (checked $0 before use) and writes `content/item-skill-tags.json`. Run on a 60-question sample of the
  verified bank: 60 tagged by `qwen/qwen3.8-max:free`, 7,511 tokens, $0; it is strict (11 of 60 questions carry a tag), which matters for
  how fast these stats can be read in real use. Sim: each item carries each tag with chance 0.25, a tagged item's logit moves by
  `0.6 x (truth - 50) / 50` (the size used for text load), the app sees the tags with 10% flipped (`--item-tags=0` turns the channel off).
- **(c) left as LLM read / questionnaire** (21), with reasons in the table.

### 4. The weak behavioural rules

| stat | rule read the sim's evidence? | change |
|---|---|---|
| instruction_adherence | no: its rule read AI-lesson telemetry and only ever pushed down | **fixed**: a rate of lesson pages finished in under a fifth of their time (validity 0.8, it leaks general hurry); `SCORECARD_ADHERENCE=off` |
| reentry_cost | partly: raw accuracy of the sitting's first block (a practice sitting has no blocks, so the whole sitting) vs earlier scores, two values | **fixed**: a shift of the first level of a sitting against expectation, after 3+ days away vs after shorter gaps (needs a population); `SCORECARD_REENTRY=off`. Still no signal: few learners have enough 3-day breaks in a month |
| depth_breadth | one-sided: only "too short" taps | **fixed**: "too long" read too (`SCORECARD_DEPTH_TAPS=off`). The sim ties length taps mostly to brevity (0.8) and only weakly to depth (0.3), so it stays near no signal |
| text_density_tolerance | yes (scroll-backs), but the sim drives scroll-backs mostly by consolidation need through the same channel | none: not separable in this data |
| warmup_latency | yes (first three answers against expectation), but the first three are mostly due reviews, which are memory tests and left out | none: the log read-out finds no signal either |
| fatigue_curve | yes | none (it passes in some runs) |
| momentum_dependence | yes | none: two opening misses are rare, too few chances |
| mastery_velocity | yes (slope of ability), needs hundreds of fresh answers | none: physically too few answers in a month |

The 15 "biased rule" failures were left alone.

## Decision table: the 40 llm-only stats

| stat | decision | how / why |
|---|---|---|
| example_density_need | (a) experiment | one vs two or three varied examples per idea |
| jargon_absorption | (a) experiment | proper terms from the start vs everyday words, terms defined twice |
| global_framing_need | (a) experiment | big-picture opening vs straight in |
| mnemonic_receptivity | (a) experiment | a memory aid vs none |
| tone_formality | (a) experiment | formal register vs friendly, respectful casual |
| relevance_demand | (a) experiment | real-world use early vs the idea for its own sake |
| novelty_hunger | (a) experiment | varied format vs one predictable structure |
| feedback_tone_sensitivity | (a) experiment | gently framed vs plain, brief (never harsh) corrections in the page's checks |
| praise_sensitivity | (a) experiment | specific acknowledgement vs none |
| social_framing | (a) experiment | named characters vs objects and numbers |
| emotional_engagement | (a) experiment | real stakes (never frightening or upsetting) vs neutral |
| pattern_detection | (b) item tag | answers on pattern questions vs own level |
| logical_rigor | (b) item tag | answers on questions needing exact conditions/cases (an ability proxy for a preference stat) |
| causal_chain_depth | (b) item tag | questions with 2+ causal steps |
| systems_thinking | (b) item tag | questions on interacting parts |
| contradiction_sensitivity | (b) item tag | questions needing noticing what does not fit, near-miss distractors |
| near_transfer | (b) item tag | taught method on a different-looking problem |
| far_transfer | (b) item tag | the idea in an unfamiliar context or field |
| notation_comfort | (b) item tag | symbolic-notation questions (also detected from the text) |
| working_memory_span | (c) keep | already measured by the memory-span game channel |
| structure_need, planning_tendency, evaluation_anxiety, creative_extension | (c) keep | read by the IPIP questionnaire channel (the first three pass with it) |
| cognitive_flexibility | (c) keep | a clean experiment candidate (one framing vs two angles), held back: each added dimension takes from the same ~15 experiments and ~16 choices a month |
| enactive_encoding | (c) keep | page interactivity is structural (like cycle_architecture): two short versions cannot show it; held back like the above |
| conceptual_bias | (c) keep | procedure-first vs why-first overlaps the inductive/deductive and abstraction experiments |
| application_orientation | (c) keep | its arm is the same text as relevance_demand's |
| boredom_susceptibility | (c) keep | overlaps novelty_hunger's experiment; quits and rushing are confounded with other traits |
| interference_susceptibility | (c) keep | an item tag would duplicate contradiction_sensitivity's (near-miss distractors) |
| stimulus_envelope | (c) keep | only a "calm" directive; the other arm would push stimulation on a learner who may be sensitive |
| competitive_drive | (c) keep | its arm pushes competition: not safe to try on everyone |
| gamification_response | (c) keep | no directive at all, and its arm would push points/competition |
| extrinsic_reward_sensitivity | (c) keep | no directive at all |
| intrinsic_motivation | (c) keep | a motivation trait; its framing arm overlaps relevance_demand |
| strategy_awareness | (c) keep | a metacognitive trait with no behaviour in the answers |
| autonomy_preference | (c) keep | needs a choice structure in the page the app does not log |
| question_generation | (c) keep | needs the learner's own questions (tutor chat): model read |
| identity_alignment | (c) keep | needs the learner's goals in their words: model read |
| integration_tendency | (c) keep | one-sided, about cross-lesson connections the app does not test |

## Before and after

Two measuring sticks, because the sim had to change:

1. **The old stick** (HEAD's sim, plus the new truth models: item tags in every run, choices with `--channels=all`). Here the new allocator
   changes which experiments run, which re-drew every later random number of each simulated learner, so before/after compared different
   simulated histories, not only different rules.
2. **The decoupled stick** (round 8, the default now): each answer draws from its own random stream (learner, level, position;
   `--item-rng=0` restores the old one). A change in one answer no longer re-draws the rest. "Before" is the old app reproduced by its switches
   (`PERSONALIZE_ALLOCATOR=weighted PERSONALIZE_DIMENSIONS=base SCORECARD_ITEM_TAGS=off SCORECARD_ADHERENCE=off SCORECARD_REENTRY=off
   SCORECARD_DEPTH_TAPS=off SCORECARD_CHOICES=off`) in the same simulated world. (Check that the switches reproduce the old app: with them,
   and with only the reading changes on, every trajectory is identical; the reading changes never alter a learner's history.)

200 learners, seed 20261022, model read off. Cells: pass / fail / no signal, before → **after**. Groups are the research split of 2026-10-22
(the converted stats stay in llm-only, so each is compared with itself).

### Decoupled stick, every extra on (`--channels=all`)

| group (pass / fail / no signal) | week 1 | week 2 | week 3 | week 4 |
|---|---|---|---|---|
| behavioural | 14 / 8 / 20 → **14 / 8 / 20** | 19 / 12 / 11 → **21 / 12 / 9** | 20 / 12 / 10 → **22 / 12 / 8** | 19 / 13 / 10 → **21 / 13 / 8** |
| experiment | 2 / 0 / 9 → **3 / 0 / 8** | 1 / 1 / 9 → **3 / 1 / 7** | 1 / 1 / 9 → **4 / 1 / 6** | 0 / 1 / 10 → **3 / 1 / 7** |
| questionnaire | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** |
| llm-only | 4 / 0 / 36 → **4 / 0 / 36** | 4 / 0 / 36 → **5 / 0 / 35** | 4 / 0 / 36 → **5 / 0 / 35** | 4 / 0 / 36 → **8 / 0 / 32** |
| all | 26 / 8 / 66 → **27 / 8 / 65** | 30 / 13 / 57 → **35 / 13 / 52** | 31 / 13 / 56 → **37 / 13 / 50** | 29 / 14 / 57 → **38 / 14 / 48** |
| of which: the 11 new experiment stats | 0 / 0 / 11 → **0 / 0 / 11** | same | same | 0 / 0 / 11 → **0 / 0 / 11** |
| of which: the 8 item-tag stats | 0 / 0 / 8 → **0 / 0 / 8** | 0 / 0 / 8 → **1 / 0 / 7** | 0 / 0 / 8 → **1 / 0 / 7** | 0 / 0 / 8 → **4 / 0 / 4** |
| of which: the 8 behavioural ones checked | 0 / 0 / 8 → **0 / 0 / 8** | 1 / 0 / 7 → **1 / 0 / 7** | 0 / 0 / 8 → **2 / 0 / 6** | 1 / 0 / 7 → **2 / 0 / 6** |

Passing before, failing after: **none**. Mean 90% interval coverage 0.94/0.92/0.90/0.89 → 0.94/0.92/0.91/0.90. False directives at 100 levels
1.2% → 1.5% (4 → 5 of about 320; none from a new measure).

### Decoupled stick, no extras (the defaults; most learners skip extras)

| group (pass / fail / no signal) | week 1 | week 2 | week 3 | week 4 |
|---|---|---|---|---|
| behavioural | 11 / 9 / 22 → **9 / 9 / 24** | 17 / 11 / 14 → **19 / 12 / 11** | 22 / 12 / 8 → **23 / 12 / 7** | 18 / 13 / 11 → **20 / 13 / 9** |
| experiment | 1 / 0 / 10 → **2 / 0 / 9** | 0 / 1 / 10 → **1 / 1 / 9** | 0 / 1 / 10 → **1 / 1 / 9** | 0 / 1 / 10 → **1 / 1 / 9** |
| questionnaire | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** |
| llm-only | 0 / 0 / 40 → **0 / 0 / 40** | 0 / 0 / 40 → **0 / 0 / 40** | 0 / 0 / 40 → **0 / 0 / 40** | 0 / 0 / 40 → **3 / 0 / 37** |
| all | 18 / 9 / 73 → **17 / 9 / 74** | 23 / 12 / 65 → **26 / 13 / 61** | 28 / 13 / 59 → **30 / 13 / 57** | 24 / 14 / 62 → **30 / 14 / 56** |
| of which: the 8 item-tag stats | 0 / 0 / 8 → **0 / 0 / 8** | same | same | 0 / 0 / 8 → **3 / 0 / 5** |
| of which: the 8 behavioural ones checked | 0 / 0 / 8 → **0 / 0 / 8** | same | 2 / 0 / 6 → **3 / 0 / 5** | 0 / 0 / 8 → **2 / 0 / 6** |

Passing before, failing after: **week 2 rush_tendency (ratio 1.099 → 1.107), week 4 help_seeking (1.086 → 1.105)**. Neither rule was
touched; both sit on the 1.10 line, and the allocator changes which experiments the simulated learners get (so their next-level answers
differ). A second seed (7) gives week 2 rush_tendency 1.096 → 1.102 again and week 4 hint_dependency 1.055 → 1.108, help_seeking passing; all
pass at seed 7 week 4 rise from 19 to 27. These are reported as regressions, not explained away: small, near the threshold, in measures the
round did not change. False directives at 100 levels 2.5% → 3.0% (none from a new measure).

### Per stat, week 4, decoupled stick, every extra on: status, MAE / prior / achievable

| stat | before | after | after: confidence, coverage |
|---|---|---|---|
| inductive_trajectory | no_signal, 13.72 / 13.9 / 13.59 | **pass, 12.57 / 13.9 / 12.48** | 11, 0.975 |
| interest_transfer | no_signal, 13.15 / 13.18 / 13.12 | **pass, 11.7 / 13.18 / 11.7** | 22, 0.965 |
| worked_example_dependence | no_signal, 14.63 / 14.62 / 14.62 | **pass, 13.3 / 14.62 / 13.3** | 11, 0.965 |
| abstraction_tolerance | no_signal, 12.82 / 13.3 / 12.79 | no_signal, 12.8 / 13.3 / 12.8 | 11, 0.955 |
| cycle_architecture | no_signal, 15.25 / 14.48 / 14.48 | no_signal, 14.2 / 14.48 / 14.2 | 8, 0.965 |
| brevity_preference (biased-rule fail) | fail, 10.82 / 14.03 / 8.73 | fail, 11 / 14.03 / 8.48 | 38, 0.925 |
| analogical_transfer, narrative_pull, curiosity_hook, dialogic_preference, humor_receptivity | no_signal | no_signal (0-1 choices each) | 0-1 |
| the 11 new experiment stats | no_signal (no measurement) | no_signal: 0-1 choices each in a month | 0-1 |
| pattern_detection | no_signal, 12.99 / 13.03 / 12.99 | no_signal, 12.87 / 13.03 / 12.74 | 28, 0.945 |
| logical_rigor | no_signal, 14.81 / 14.91 / 14.81 | **pass, 13.95 / 14.91 / 13.88** | 28, 0.95 |
| causal_chain_depth | no_signal, 13.98 / 14.04 / 13.98 | no_signal, 13.51 / 14.04 / 13.45 | 28, 0.935 |
| systems_thinking | no_signal, 14.39 / 14.46 / 14.39 | **pass, 13.56 / 14.46 / 13.56** | 28, 0.955 |
| contradiction_sensitivity | no_signal, 12.77 / 12.84 / 12.69 | no_signal, 12.41 / 12.84 / 12.41 | 28, 0.98 |
| near_transfer | no_signal, 13.14 / 13.21 / 13.14 | no_signal, 12.75 / 13.21 / 12.75 | 28, 0.95 |
| far_transfer | no_signal, 12.83 / 12.74 / 12.74 | **pass, 12.69 / 12.74 / 11.96** | 28, 0.965 |
| notation_comfort | no_signal, 13.12 / 13.2 / 13.12 | **pass, 12.46 / 13.2 / 12.46** | 28, 0.97 |
| instruction_adherence | no_signal, 13.47 / 13.4 / 13.4 | **pass, 12 / 13.4 / 11.9** | 43, 0.96 |
| reentry_cost | no_signal, 13.79 / 13.46 / 13.46 | no_signal, 13.38 / 13.46 / 13.38 | 5, 0.985 |
| depth_breadth | no_signal, 12.51 / 12.95 / 12.51 | no_signal, 12.33 / 12.95 / 12.33 | 11, 0.96 |
| fatigue_curve | pass, 12.61 / 13.11 / 12.38 | pass, 12.45 / 13.11 / 12.31 | 34, 0.93 |
| text_density, warmup, momentum, mastery_velocity | no_signal | no_signal (no change, see section 4) | |

At 100 levels (the sim's end, about ten weeks) the experiment stats' recovery r with every extra on: inductive 0.03 → 0.50, interest
-0.17 → 0.56, worked examples 0.03 → 0.44, abstraction 0.14 → 0.50, cycle 0.05 → 0.30; the new dimensions that got choices reach r 0.14-0.32
(example density, jargon, framing, relevance, novelty), and the six impact-1 ones (mnemonics, tone, feedback tone, praise, social, emotional
stakes) still get none: the importance tilt sends the month's few measurements to the stats that change a lesson most. Item tags at 100
levels: r 0.34-0.51 for all eight. Instruction adherence r 0.56.

### The old stick (HEAD's sim)

Week 4, all: with every extra 29 / 15 / 56 → **40 / 14 / 46**; no extras 24 / 15 / 61 → **25 / 21 / 54**. With extras, three measures went from
pass to fail (week 1 rush_tendency 1.097 → 1.142, week 2 reflection_depth 1.098 → 1.162, week 4 help_seeking 1.092 → 1.129); without, eight
(week 4: the memory trio decay_rate/retention_index/retrieval_strength 1.034 → 1.117, hint_dependency, help_seeking, misconception_persistence;
week 1 rush_tendency; week 3 hint_dependency). Attribution runs on that stick: the old app in the new world (tags on) already flips
hint_dependency, help_seeking, and week 1 rush_tendency and brevity_preference; the new app in the old world (no tags) flips only challenge_appetite (week 3) and help_seeking; the memory
trio flips in the new app with tags at both seeds tried there, but improves at 55 levels (12.91 → 11.85 MAE). That instability is what the
decoupled stick removes. Files: `curriculum-build/scorecard-sim/gate-r8-*.json`.

## The quick gate check and the stored baseline

`npm test` runs the 30-learner check against `curriculum-build/scorecard-sim/gate-baseline.json`. Because the stick changed, the stored baseline
was rewritten from the **old app** on the new stick (the "before" reference, written with the switches above). Against it the new app fails on
two measures: week 2 challenge_appetite and week 4 planning_tendency (planning_tendency has no evidence path at all in a no-extras run, so its
status moves only with the ideal observer's read of the changed answers). Under the rule "update the baseline with the after numbers only if no
previously passing stat regresses", the after numbers were **not** written, so that one step of `npm test` fails; every other step passes. If the
owner accepts the regressions above, `node scripts/scorecard-recovery-sim.js --quick --modes=off --levels=60 --learners=30 --gate-write` makes it
green (verified: with that baseline the whole suite passes).

## Limits

- Every gain here is simulated. The truth models are assumptions: that an experiment arm moves next-level answers by `0.4 x z` logits
  (unchanged), that item tags exist in the content and move answers by `0.6 x z` on tagged items, that a choice reflects the stat at validity 0.3
  and nothing else. If choices say nothing (`--choice-r=0`, not run in this round), the scorecard would still trust them at 0.3 and its
  choice-based estimates would be noise read as signal; the beta must check choices against the same learners' arm outcomes before relying on them (and re-estimate the validity
  and the "no difference" cut from real answers).
- The real content is sparsely tagged: the strict tagger put a tag on 11 of 60 sampled questions (mostly early-grade items), so in real use the
  tag stats will be read more slowly than the sim's 25% per tag. Only 60 questions are tagged so far.
- A month holds about 15 experiments and 16 choices for a learner who studies like the sim's (about 12 levels a week). That is enough for a few
  stats, not twenty-two: the allocator measures the high-impact ones first, the impact-1 dimensions not at all in the first month.
- The "achievable" benchmark is a linear read-out of 16 log features; it does not see choices or tags, so for those stats "pass" means "no
  better linear read of the same log was found".
- Paired within-level designs, and crediting time, quits or taps to an arm, were not built (see section 1).
- The UI (the choice card, the Extras switch) is tested by its wiring and the service tests; it was not clicked through in a browser.
