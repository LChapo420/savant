# Scorecard round 9: everything the learner does and says

Branch `signals-everything` (from main c63f7d3, round 8). Goal: every observable thing a learner does, says or types, and how, becomes
calibrated evidence for the measures it bears on, so each measure gets as close to the learner's true value as the data allows within a
month. Judged by the same accuracy gate as round 8 (`scripts/scorecard-recovery-sim.js`, `scripts/lib/sim-gate.js`).

**Every accuracy number here is simulated.** The sim's truth models and validities are assumptions (section 7). The one real-model check
(section 3.3) is a model's judgement of three made-up transcripts, not accuracy on learners.

## 1. What was built

| piece | file | what it does |
|---|---|---|
| indicator table and posterior | `services/scorecard/indicators.js` | 76 indicators (31 text features, 35 model reads, 5 browser-capture counts, 5 usage reads), each mapped to the measures it bears on with a sign and a stated validity; per-learner faded moments; population figures by empirical Bayes; a generalised-least-squares posterior for each measure |
| text features | `services/scorecard/text-features.js` | deterministic features of one message, computed locally with no model: length, questions, why/how questions, hedges, certainty, long-word share, reading grade, common misspellings, register, humour, emoji, exclamation, politeness, frustration / enjoyment / worry / boredom words, asking for the answer, talk about their own understanding, links to other things, real-life use, planning, variations, wanting to do it alone, competition, rewards, asking for examples / something simpler / the big picture, drift from the tutor's last message, reply latency |
| model read of chats | `services/scorecard/transcript-read.js` | batched (at most once a day, 40+ new words), on the tutor's own provider path (`ai.talk`, role `fast`, background lane), structured JSON (measure, direction, strength, a verbatim quote); a quote not found in what the learner wrote is dropped; unmentioned measures are read as 0 |
| scorecard integration | `services/scorecard/index.js` | `observe` keeps `{ indicator, x, n }` units on the card (`scorecards.ind`); `read()` and `standing()` add the indicators' likelihood on top of each measure's own posterior; `SCORECARD_INDICATORS=off` ignores them |
| hooks | `services/scorecard/hooks.js` | `onLearnerText`, `onIndicators`, `onTutorObservation` (for the tutor), `onTutorActivity`, `textSweep` (tutor_archive since a cursor), `usageSweep` (weekly), typed answers of 4+ words read when a sitting ends |
| browser capture | `public/js/silent-signals.js`, `services/boosters.js` | the opt-in silent-signals extra now also counts tab-aways and time away, a changed multiple-choice pick before checking, pauses of 2 s+ while typing, 30 s+ idle stretches; counts only |
| factorial pages (opt-in) | `services/personalize.js`, `services/scorecard/signals.js` | `PERSONALIZE_FACTORIAL=2` crosses two experiment dimensions that do not touch the same part of a page; both are credited with the outcome (and delayed recall). Default stays 1 (section 4) |
| sim | `scripts/scorecard-recovery-sim.js`, `scripts/lib/sim-gate.js` | every new source modelled at the scorecard's own validity (`--signal-v=1`) or half (`--signal-v=0.5`); the ideal observer also sees each learner's indicator means for the measure |
| tools | `scripts/scorecard-coverage.js`, `scripts/scorecard-gate-compare.js`, `scripts/transcript-read-check.js` | the coverage matrix from the code; before/after gate tables; the live prompt check on synthetic transcripts (free models only) |
| tests | `scripts/scorecard-everything-test.js` (in `npm test`) | features, posterior information and calibration, no-op without indicators, sweeps and cursors, consent rules, transcript parsing and quote checks, capture ingest, factorial pages |

Also: the privacy page and the Extras notice say what is now counted (`public/privacy.html`, `public/js/boosters.js`), and the flaky
"reading twice changes nothing" check in `scripts/sim-gate-test.js` (it failed on main now and then: the real clock moves between reads)
compares to 1e-6.

## 2. Inventory: what the app records, and what it now reads

| behaviour | recorded before | now | read as |
|---|---|---|---|
| answers, right/wrong, item difficulty | yes | same | ability, rates, shifts, contrasts (round 1-8) |
| answer latency | yes (`ms`) | same | pace, rush, deliberation |
| answer changes (typed: edits) | yes (`answer_changes`) | + changed multiple-choice pick before checking (`cap.mcchange`, opt-in) | perfectionism; deliberation, self-monitoring |
| hints / coach | yes | same | hint dependency, help seeking |
| skips, quits, leaving a level, abandoned sittings | yes | same | persistence, attention runway |
| revisits of a lesson page | rows existed, unread | `use.reread` (weekly) | consolidation need |
| session start / end times and gaps | yes | + spread of the starting hour (`use.hour`, weekly) | session rhythm, re-entry cost; planning |
| scroll-backs, read time on lesson pages | yes | same | consolidation, text density, adherence, rush |
| tab-away, time away, idle | no | `cap.tabaway`, `cap.away`, `cap.idle` (opt-in, question screens) | attention runway, boredom, fatigue |
| typing speed, hesitation, backspace | yes (opt-in) | + pauses of 2 s+ (`cap.pause`) | processing velocity, deliberation, perfectionism; working memory |
| tutor-chat text | kept (archive), unread for measurement | 31 deterministic features per message (`txt.*`), all accounts | see the coverage matrix |
| tutor-chat meaning | unread | model read, once a day (`llm.*`), allowed accounts only | 35 measures text can show |
| tutor's own observations | no hook | `hooks.onTutorObservation` (same `llm.*` units) | same 35 |
| open typed answers (4+ words) | kept, unread for measurement | text features | as chat text |
| written level feedback | yes | same (its own rules; not double-counted as text) | reflection depth, brevity, pace |
| feedback taps | yes | same | challenge appetite, brevity, pace |
| uploads (own material) | rows existed, unread | `use.uploads` (weekly) | intrinsic motivation, application, autonomy, identity |
| which extras they use | rows existed, unread | `use.extras` (weekly) | strategy awareness, motivation, autonomy |
| amount of tutor chat | rows existed, unread | `use.chat` (weekly) | dialogic preference, help seeking, question generation |
| settings changes | **no log exists** | not read | (would need a settings-change log in routes the scorecard does not own) |
| spelling | — | only common misspellings and dropped apostrophes (`txt.nonstd`): no dictionary is shipped | vocabulary, weakly |

Not built: tab-away on lesson pages (silent-signals watches question screens only), keystroke content of any kind (never), a
settings-change log, eye tracking and wearables (owner: not now).

## 3. Calibrated, not over-credited

### 3.1 The model

For indicator k, a learner's long-run mean standardised against the population (centre and true between-learner spread estimated by
empirical Bayes once 20 learners have 3+ units, as every other standing) is `x_k = a_k z + e_k`, `a_k` = sign x validity, z the learner's
standing on the measure. `Var(e_k) = 1 - v_k^2 + within_k / (n_k tau_k^2)`: the validity is a ceiling (a verbose learner writes long
messages whatever their reflection depth, so more messages never make message length more valid than v), the second term is the sampling
noise of n_k units, with the within-learner variance pooled across learners from the spread of batch means. Indicators of one family
(text: deterministic features and model reads of the same words; capture; usage) share nuisance at correlation 0.3, signed the way of each
indicator's loading: the conservative case, where two indicators of opposite sign never cancel each other's nuisance by assumption. The
posterior is GLS under a N(0, 1) prior; the measure's own posterior is its prior (one claiming to be wider than the population keeps its
centre at the population's width: a questionnaire nudge has a measured score but no measured mass, and taking its 25-point width at its
word let weak indicators pull good self-report estimates to the middle). Directives keep their own evidence minimums: indicators alone
never change a lesson; they move the numbers (which the material and tutor read) and, with a measure's own evidence, its standing.

### 3.2 Validities, and why

All at or below the best case the research reports. The sim uses the same numbers and, in the robustness run, half of them.

| source | validity used | basis |
|---|---|---|
| a model's read of chat text (`llm.*`) | 0.25 | zero-shot LLM inference of Big Five from social-media posts reached r about 0.29 on average (Peters & Matz 2024, *PNAS Nexus* 3(6)); open-vocabulary language models about 0.38 from far more text (Park et al. 2015, *JPSP* 108(6)). A tutor chat is shorter and most measures are narrower than a trait |
| question asking (`txt.question`, `txt.deepq`) | 0.4, 0.3 | near-definitional for question generation; deep-question rate tracks comprehension in tutoring dialogue (Graesser & Person 1994, *AERJ* 31(1)) |
| lexical categories: hedges, certainty, emotion, worry, boredom, planning, competition, reward... | 0.1-0.3 | word-category use is stable within a person and correlates about 0.1-0.3 with traits (Pennebaker & King 1999, *JPSP* 77(6); Yarkoni 2010, *J Res Pers* 44; review: Tausczik & Pennebaker 2010, *J Lang Soc Psych* 29(1)); affect words in tutoring dialogue track confusion, frustration and boredom (D'Mello & Graesser 2012, *Learning and Instruction* 22) |
| vocabulary and reading grade of what they write (`txt.vocab`, `txt.grade`) | 0.3, 0.25 | lexical sophistication indices predict learners' proficiency (Crossley, Salsbury & McNamara 2012, *Language Testing* 29(2)); Flesch-Kincaid grade (Kincaid et al. 1975) |
| register (`txt.formal`, `txt.emoji`, `txt.polite`) for tone preference | 0.3, 0.2, 0.15 | people converge on their partner's style and tend to prefer their own register (Niederhoffer & Pennebaker 2002, *J Lang Soc Psych* 21(4)) |
| asking for the answer (`txt.answerseek`) | 0.25 | help abuse and bottom-out hint seeking as a stable help-seeking style (Aleven et al. 2006, *IJAIED* 16) |
| tab-away, idle (`cap.*`) | 0.15-0.25 | off-task behaviour in tutoring systems is detectable from logs and relates to disengagement (Baker 2007, CHI) |
| changed pick before checking | 0.1-0.2 | changes are more often wrong-to-right and reflect monitoring (Kruger, Wirtz & Miller 2005, *JPSP* 88(5)) |
| pauses while typing | 0.1-0.15 | keystroke pauses carry state and load (Epp, Lippold & Mandryk 2011, CHI) |
| starting-hour regularity (`use.hour`) | 0.3 | habits form with a consistent context and time (Lally et al. 2010, *EJSP* 40(6)) |
| extras, uploads, chat volume | 0.1-0.2 | choice and self-initiated use as autonomy and interest (Ryan & Deci 2000); weak on purpose |

### 3.3 The live check of the chat read (a model's judgement, not learner accuracy)

`node scripts/transcript-read-check.js`, xKiro's free `qwen/qwen3.8-max:free` (checked $0), three made-up learners written to be clearly one
way on three measures each: 8 of 9 designed directions read the designed way, 0 the opposite way, 1 not read (the formal learner's tone);
20 of 20 quotes found verbatim in what the learner wrote. The JSON parsed every time. In the app the read goes through the tutor's own
provider path, not xKiro.

## 4. More experiments per month

- **Factorial pages** (`PERSONALIZE_FACTORIAL=2`): built and tested; NOT the default. Results in section 5.6.
- **Experiments on practice and test items**: not built. An item's wording and feedback come from the material generators and the item
  bank, which other agents own tonight; there is no per-item teaching choice for the scorecard to vary. The next level's items already
  are the outcome measure of every page experiment.
- **Old pages' arms against delayed recall**: already in place since round 5 (`signals.delayedExperimentOutcome`: reviews within 30 days
  of a page are credited to its arm, against the forgetting model's expectation); it now also credits a factorial page's second dimension.
- What the month's experiments buy is still the bottleneck for the 22 experiment measures; the indicators are what moved them this round
  (section 5).

## 5. Proof

### 5.1 How it was measured

- The sim's world now produces every new source (text features after a third of sittings for the 65% of learners who chat, a model read
  at most daily, weekly usage reads, question-screen capture with `--channels` silent or all), each at the scorecard's own validity
  (`--signal-v=1`) or half. The ideal observer (the gate's "achievable") also sees every learner's indicator means for each measure, so
  "achievable" got stricter, never easier, wherever an indicator exists.
- "Before" is the round-8 app in that same world: `SCORECARD_INDICATORS=off PERSONALIZE_FACTORIAL=1`. "After" is this branch's default
  (indicators on, one dimension per page). 200 learners, 100 levels, model read off, seed 20261022, and seed 7 for the check.
- Outputs: `curriculum-build/scorecard-sim/gate-r9-*.json`; tables by `node scripts/scorecard-gate-compare.js before.json after.json`.

### 5.2 Every extra on (`--channels=all`), seed 20261022

| group (pass / fail / no signal) | week 1 | week 2 | week 3 | week 4 |
|---|---|---|---|---|
| behavioural | 14 / 8 / 20 → **14 / 8 / 20** | 21 / 12 / 9 → **19 / 9 / 14** | 22 / 12 / 8 → **22 / 12 / 8** | 21 / 13 / 8 → **21 / 12 / 9** |
| experiment | 3 / 0 / 8 → **4 / 0 / 7** | 3 / 1 / 7 → **5 / 0 / 6** | 4 / 1 / 6 → **2 / 1 / 8** | 3 / 1 / 7 → **5 / 1 / 5** |
| questionnaire | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** |
| llm-only | 4 / 0 / 36 → **4 / 0 / 36** | 5 / 0 / 35 → **5 / 0 / 35** | 5 / 0 / 35 → **7 / 0 / 33** | 9 / 0 / 31 → **12 / 0 / 28** |
| all | 27 / 8 / 65 → **28 / 8 / 64** | 35 / 13 / 52 → **35 / 9 / 56** | 37 / 13 / 50 → **37 / 13 / 50** | 39 / 14 / 47 → **44 / 13 / 43** |
| mean 90% coverage (with signal) | 0.94 → **0.93** | 0.92 → **0.91** | 0.91 → **0.9** | 0.9 → **0.9** |

Passing before, failing after: **none**.

### 5.3 No extras (the defaults), seed 20261022

| group (pass / fail / no signal) | week 1 | week 2 | week 3 | week 4 |
|---|---|---|---|---|
| behavioural | 9 / 9 / 24 → **9 / 8 / 25** | 19 / 12 / 11 → **16 / 12 / 14** | 23 / 12 / 7 → **23 / 12 / 7** | 20 / 13 / 9 → **22 / 12 / 8** |
| experiment | 2 / 0 / 9 → **2 / 0 / 9** | 1 / 1 / 9 → **0 / 1 / 10** | 1 / 1 / 9 → **1 / 1 / 9** | 1 / 1 / 9 → **1 / 1 / 9** |
| questionnaire | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** | 6 / 0 / 1 → **6 / 0 / 1** |
| llm-only | 0 / 0 / 40 → **0 / 0 / 40** | 1 / 0 / 39 → **2 / 0 / 38** | 0 / 0 / 40 → **1 / 0 / 39** | 3 / 0 / 37 → **3 / 0 / 37** |
| all | 17 / 9 / 74 → **17 / 8 / 75** | 27 / 13 / 60 → **24 / 13 / 63** | 30 / 13 / 57 → **31 / 13 / 56** | 30 / 14 / 56 → **32 / 13 / 55** |
| mean 90% coverage (with signal) | 0.94 → **0.93** | 0.91 → **0.9** | 0.9 → **0.89** | 0.89 → **0.89** |

Passing before, failing after: **none**.

Week 2 has fewer passes without extras (27 → 24) and fewer behavioural passes with them (21 → 19): measures that moved from pass to
"no signal" at the 5% line (their error and the achievable both sit within 5% of the prior), none to fail; the week-2 error is lower in
both runs. Seed 7, week 4, pass / fail / no signal: every extra 31 / 16 / 53 → 31 / 18 / 51 (the memory trio, below), no extras
28 / 16 / 56 → 31 / 16 / 53.

### 5.4 Summary over the 58 measures an indicator reaches, and the checks

| run (week 4) | mean error before → after (prior 13.62) | mean 90% coverage before → after | false directives at 100 levels |
|---|---|---|---|
| every extra, seed 20261022 | 12.54 → **12.37** | 0.942 → **0.905** | 1.5% → **0.9%** |
| no extras, seed 20261022 | 12.88 → **12.71** | 0.943 → **0.905** | 3.0% → **1.5%** |
| every extra, seed 7 | 12.44 → **12.23** | 0.948 → **0.905** | 0.9% → **0.6%** |
| no extras, seed 7 | 12.83 → **12.61** | 0.950 → **0.906** | 0.7% → **1.4%** |
| **robustness: true validity half the assumed**, every extra | 12.54 → 12.57 | 0.942 → 0.899 | 1.5% → 1.8% |
| robustness, no extras | 12.88 → 12.91 | 0.943 → 0.899 | 3.0% → 1.5% |

- The error falls at every week of every run at the assumed validity (all 100 measures: 13.02/12.84/12.71/12.60 → 12.94/12.73/12.61/12.50
  with every extra; 13.25/13.09/12.95/12.84 → 13.20/13.02/12.86/12.74 with none). Of the 58 measures reached, 37 got better by more than
  0.1 points at week 4, 6 worse.
- Coverage moves from too wide (0.94) to 0.90: the intervals now claim what they hold.
- **When the real validities are half of what the scorecard assumes**, the indicators buy nothing (mean error +0.03, 18 measures better,
  20 worse, the worst dialogic preference +0.53) and the intervals stay honest (0.899): over-trusting by two costs about nothing in
  accuracy and nothing in coverage, but it gains nothing either. So the gains above are exactly as real as the validities: they must be
  re-estimated on beta data.
- Passing before, failing after: **none** at seed 20261022 (either extras setting). At seed 7: with every extra, the memory trio
  (decay_rate, retention_index, retrieval_strength, one model) at week 4, ratio 1.061 → 1.128; with none, challenge_appetite at week 4,
  1.089 → 1.108. No indicator reaches either. They move because the indicators change the experiment allocator's view of each stat
  (`personalize.stateOf` reads the standing), so different experiments run, and their arms are in the review answers the forgetting
  model reads; the memory trio flipped the same way in round 8 for the same reason. Reported as regressions, not explained away.
- `--gate-check` (the 30-learner quick check in `npm test`): the stored baseline was written by round 8 in the old world, where the gate's
  ideal observer had no indicator columns; the round-8 app itself fails it in the new world (week 2 frustration_threshold and
  autonomy_preference). So, as round 8 did when its stick changed, the baseline was rewritten from the **old app in the new world**
  (week 2 32 / 11, week 4 39 / 16), the new app checked against it (passes: week 4 41 / 16, nothing that passed fails), and only then the
  baseline updated with the new app's numbers (week 2 33 / 11, week 4 41 / 16).

### 5.5 Per measure, week 4, every extra on: error / prior / achievable (measures that moved 0.3 points or more)

| measure | week 4 before: status, error / prior / achievable | week 4 after | after, coverage |
|---|---|---|---|
| jargon_absorption | no_signal, 13.34 / 13.38 / 13.34 | **no_signal, 12.97 / 13.38 / 12.97** | 0.925 |
| analogical_transfer | no_signal, 13.07 / 13.28 / 13.07 | **pass, 12.53 / 13.28 / 12.42** | 0.96 |
| causal_chain_depth | no_signal, 13.51 / 14.04 / 13.45 | **no_signal, 13.96 / 14.04 / 13.96** | 0.905 |
| attention_runway | fail, 12.55 / 13.52 / 9.68 | **fail, 12.02 / 13.52 / 9.77** | 0.81 |
| relevance_demand | no_signal, 13.45 / 13.7 / 13.45 | **pass, 13.04 / 13.7 / 13** | 0.94 |
| tone_formality | no_signal, 12.99 / 13.05 / 12.99 | **no_signal, 12.51 / 13.05 / 12.51** | 0.97 |
| productive_struggle | no_signal, 16.14 / 15.76 / 15.25 | **no_signal, 15.77 / 15.76 / 15.33** | 0.89 |
| reflection_depth | fail, 10.72 / 14.01 / 8.62 | **fail, 10.42 / 14.01 / 8.64** | 0.98 |
| question_generation | no_signal, 13.85 / 13.86 / 13.85 | **no_signal, 13.24 / 13.86 / 13.24** | 0.855 |
| worked_example_dependence | pass, 13.3 / 14.62 / 13.3 | **pass, 12.94 / 14.62 / 12.94** | 0.93 |
| intrinsic_motivation | no_signal, 14.58 / 14.65 / 14.47 | **pass, 13.85 / 14.65 / 13.85** | 0.865 |
| competitive_drive | no_signal, 14.45 / 14.36 / 14.12 | **pass, 13.73 / 14.36 / 13.56** | 0.97 |
| persistence | pass, 11.6 / 13.12 / 11.49 | **pass, 12.11 / 13.12 / 11.82** | 0.86 |
| social_framing | no_signal, 14.21 / 14.27 / 14.21 | **no_signal, 13.79 / 14.27 / 13.76** | 0.93 |
| identity_alignment | no_signal, 12.22 / 12.13 / 12.13 | **no_signal, 11.78 / 12.13 / 11.77** | 0.94 |

The same for no extras:

| measure | week 4 before: status, error / prior / achievable | week 4 after | after, coverage |
|---|---|---|---|
| vocabulary_ceiling | pass, 9.97 / 12.53 / 9.97 | **pass, 9.65 / 12.53 / 9.65** | 0.985 |
| global_framing_need | no_signal, 14.33 / 14.28 / 14.12 | **no_signal, 13.84 / 14.28 / 13.63** | 0.92 |
| stimulus_envelope | no_signal, 13.78 / 13.85 / 13.78 | **no_signal, 13.43 / 13.85 / 13.43** | 0.955 |
| gamification_response | no_signal, 14.12 / 14.05 / 14.05 | **no_signal, 13.73 / 14.05 / 13.69** | 0.93 |
| relevance_demand | no_signal, 13.67 / 13.7 / 13.67 | **no_signal, 13.37 / 13.7 / 13.37** | 0.94 |
| tone_formality | no_signal, 12.99 / 13.05 / 12.99 | **no_signal, 12.54 / 13.05 / 12.54** | 0.97 |
| frustration_threshold | pass, 9.11 / 15.22 / 9.03 | **pass, 8.7 / 15.22 / 8.59** | 0.895 |
| productive_struggle | no_signal, 16.14 / 15.76 / 15.44 | **no_signal, 15.67 / 15.76 / 15.38** | 0.88 |
| mastery_orientation | no_signal, 13.42 / 13.49 / 13.42 | **no_signal, 13.1 / 13.49 / 13.1** | 0.9 |
| question_generation | no_signal, 13.85 / 13.86 / 13.85 | **pass, 13.2 / 13.86 / 13.13** | 0.865 |
| worked_example_dependence | no_signal, 14.69 / 14.62 / 14.62 | **no_signal, 14.2 / 14.62 / 14.06** | 0.915 |
| scaffolding_fade | fail, 12.25 / 13.45 / 9.23 | **fail, 11.81 / 13.43 / 9.44** | 0.695 |
| intrinsic_motivation | no_signal, 14.58 / 14.65 / 14.58 | **no_signal, 13.93 / 14.65 / 13.93** | 0.88 |
| competitive_drive | no_signal, 14.45 / 14.36 / 14.36 | **no_signal, 14.06 / 14.36 / 14.06** | 0.96 |
| evaluation_anxiety | no_signal, 11.62 / 11.69 / 11.62 | **no_signal, 11.25 / 11.69 / 11.25** | 0.95 |
| persistence | pass, 11.69 / 13.12 / 11.58 | **pass, 12.22 / 13.12 / 12.05** | 0.84 |
| social_framing | no_signal, 14.21 / 14.27 / 14.21 | **no_signal, 13.9 / 14.27 / 13.9** | 0.91 |
| application_orientation | no_signal, 13.44 / 13.51 / 13.01 | **no_signal, 12.96 / 13.51 / 12.96** | 0.9 |
| integration_tendency | no_signal, 12.86 / 12.83 / 12.83 | **no_signal, 12.53 / 12.83 / 12.53** | 0.945 |

### 5.6 Experiments: indicators vs factorial pages

| run | experiments' recovery r at 100 levels (base 11 / new 11) | week-4 error, 22 experiment measures | dimensions per learner | false directives at 100 | week-4 pass / fail (all) |
|---|---|---|---|---|---|
| before, every extra | 0.38 / 0.11 | 13.38 | 30.4 | 1.5% | 39 / 14 |
| after (indicators), every extra | **0.42 / 0.21** | **13.24** | 30.4 | **0.9%** | **44 / 13** |
| after + factorial (2 per page), every extra | 0.42 / 0.22 | 13.23 | 60.8 | 1.9% | 41 / 13 |
| before, no extras | 0.12 / 0.00 | 13.69 | 10.4 | 3.0% | 30 / 14 |
| after (indicators), no extras | **0.24 / 0.16** | **13.54** | 10.4 | **1.5%** | **32 / 13** |
| after + factorial, no extras | 0.24 / 0.18 | 13.50 | 20.8 | 2.3% | 30 / 14 (week 4 repetition_tolerance 1.089 → 1.124) |

(The factorial rows ran with the first version of the combination rule, before the fix in 3.1; the other rows with the final one. On
the iteration runs at 60 levels without indicators, two per page moved the 22 measures' r from 0.189 to 0.199, three per page to 0.217.)

Two per page doubles the dimensions run but adds almost nothing to their recovery, and raises false directives: the second dimension can
only be one that touches a different part of the page, which leaves mostly the register, feedback and memory-aid dimensions, whose
effects are smallest; and each page's outcome now carries a second arm's effect as noise for the first. **So factorial pages are built,
tested and off by default** (`PERSONALIZE_FACTORIAL=2` turns them on). What lifted the experiment measures this month was the text: the
new eleven's r doubled (0.11 → 0.21) because most of them are also visible in what learners write.

### 5.7 What stays out of reach in a month, and why

Most measures reached only by indicators stay "no signal": even the ideal observer, which sees the same indicator means, cannot beat
the population mean by 5% (question generation: app 13.24, achievable 13.24, prior 13.86, a 4.5% gain). With validities of 0.1-0.4 the
information an indicator can carry is capped at v^2 / (1 - v^2) of the population's spread however many messages there are (0.19 for 0.4,
0.07 for 0.25), and indicators read off the same words share their nuisance. That ceiling, not the amount of chat, is the wall: more
messages only shrink the noise term. The way over it is a better-validated source per measure (a designed task, an experiment, a
validated scale item), not more text.

## 6. The coverage matrix

From `node scripts/scorecard-coverage.js` (read from the code). "Before" is everything up to round 8; the third column is what round 9
adds. 58 measures now get at least one indicator; of the 16 that had no source but the after-level model read, 14 now do; 2
(interference susceptibility, enactive encoding) still have none.

| measure | evidence before round 9 | round-9 indicators (sign, validity) |
|---|---|---|
| intake_baseline | behaviour | — |
| working_memory_span | game | cap.pause -0.1 |
| processing_velocity | answer pace, questionnaire, game | txt.latency -0.15 |
| chunk_granularity | style quiz | — |
| abstraction_tolerance | experiment + choice, questionnaire | txt.grade +0.1, txt.simplerreq -0.15 |
| example_density_need | experiment + choice | txt.examplereq +0.25 |
| text_density_tolerance | rate | txt.vocab +0.1, use.reread -0.1 |
| vocabulary_ceiling | shift, reading check, questionnaire | txt.vocab +0.3, txt.grade +0.25, txt.nonstd -0.15, llm read +0.25 |
| jargon_absorption | experiment + choice | txt.vocab +0.15, txt.simplerreq -0.2 |
| spatial_anchoring | style quiz | — |
| deductive_trajectory | style quiz | — |
| inductive_trajectory | experiment + choice, style quiz | — |
| cognitive_flexibility | none (model read only) | txt.creative +0.1, llm read +0.25 |
| analogical_transfer | experiment + choice | txt.connect +0.2 |
| causal_chain_depth | item tags | txt.deepq +0.15 |
| systems_thinking | item tags | — |
| pattern_detection | item tags | — |
| logical_rigor | item tags | — |
| contradiction_sensitivity | item tags | — |
| global_framing_need | experiment + choice | txt.bigpicture +0.25, llm read +0.25 |
| cycle_architecture | experiment + choice, style quiz | — |
| attention_runway | behaviour, style quiz, game | txt.drift -0.1, cap.tabaway -0.25, cap.away -0.2, cap.idle -0.15 |
| warmup_latency | shift | — |
| fatigue_curve | shift | cap.idle +0.1 |
| momentum_dependence | shift | — |
| interleaving_tolerance | behaviour | — |
| rush_tendency | rate | — |
| deliberation_depth | rate | txt.latency +0.1, cap.mcchange +0.2, cap.pause +0.15 |
| session_rhythm | behaviour, questionnaire | use.hour -0.3 |
| reentry_cost | shift | — |
| stimulus_envelope | none (model read only) | txt.exclaim +0.1, txt.boredom +0.1, llm read +0.25 |
| novelty_hunger | experiment + choice | txt.boredom +0.15 |
| humor_receptivity | experiment + choice | txt.humour +0.3, llm read +0.25 |
| narrative_pull | experiment + choice | llm read +0.25 |
| gamification_response | none (model read only) | txt.emoji +0.1, txt.compete +0.15, txt.reward +0.2, llm read +0.25 |
| challenge_appetite | taps, style quiz | — |
| curiosity_hook | experiment + choice, questionnaire | txt.question +0.15, txt.deepq +0.2, llm read +0.25 |
| interest_transfer | experiment + choice | — |
| relevance_demand | experiment + choice | txt.relevance +0.25, txt.bigpicture +0.15, llm read +0.25 |
| tone_formality | experiment + choice | txt.formal +0.3, txt.emoji -0.2, txt.polite +0.15, llm read +0.25 |
| retrieval_strength | memory tests | — |
| recognition_recall_gap | behaviour | — |
| decay_rate | memory tests | — |
| elaboration_benefit | style quiz | txt.len +0.1 |
| mnemonic_receptivity | experiment + choice | — |
| consolidation_need | rate | use.reread +0.2 |
| interference_susceptibility | none (model read only) | — |
| enactive_encoding | none (model read only) | — |
| generation_effect | style quiz | — |
| retention_index | memory tests | — |
| failure_response | shift | — |
| error_recovery_speed | shift | — |
| frustration_threshold | contrast, questionnaire | txt.negemo -0.25, llm read +0.25 |
| hint_dependency | rate | txt.answerseek +0.25 |
| help_seeking | rate | txt.question +0.2, use.chat +0.15 |
| guessing_propensity | contrast | — |
| perfectionism | rate, questionnaire | cap.mcchange +0.1 |
| productive_struggle | style quiz | txt.answerseek -0.25, txt.autonomy +0.15, llm read +0.25 |
| confidence_calibration | contrast | — |
| error_driven_learning | rate | — |
| self_monitoring | contrast | txt.metacog +0.15, cap.mcchange +0.15 |
| strategy_awareness | none (model read only) | txt.metacog +0.25, use.extras +0.15, llm read +0.25 |
| mastery_orientation | behaviour | txt.answerseek -0.2, llm read +0.25 |
| autonomy_preference | none (model read only) | txt.autonomy +0.3, use.extras +0.1, use.uploads +0.15, llm read +0.25 |
| structure_need | questionnaire | txt.planning +0.15, llm read +0.25 |
| instruction_adherence | rate | — |
| reflection_depth | behaviour, questionnaire | txt.len +0.25, txt.metacog +0.2, llm read +0.25 |
| question_generation | none (model read only) | txt.question +0.4, txt.deepq +0.3, use.chat +0.1, llm read +0.25 |
| self_efficacy | rate, questionnaire | txt.hedge -0.25, txt.certain +0.2, txt.anxiety -0.1, llm read +0.25 |
| planning_tendency | questionnaire | txt.planning +0.3, use.hour -0.15, llm read +0.25 |
| step_explicitness | behaviour, style quiz | txt.simplerreq +0.2 |
| worked_example_dependence | experiment + choice | txt.examplereq +0.2 |
| scaffolding_fade | reach vs the course | — |
| notation_comfort | item tags | — |
| brevity_preference | behaviour, experiment + choice, style quiz | txt.len -0.15 |
| repetition_tolerance | behaviour | — |
| feedback_granularity | style quiz | — |
| feedback_tone_sensitivity | experiment + choice | — |
| open_response_performance | behaviour | — |
| dialogic_preference | experiment + choice | txt.len +0.15, txt.question +0.2, use.chat +0.2, llm read +0.25 |
| intrinsic_motivation | none (model read only) | txt.deepq +0.15, txt.posemo +0.2, use.extras +0.1, use.uploads +0.2, llm read +0.25 |
| extrinsic_reward_sensitivity | none (model read only) | txt.reward +0.3, llm read +0.25 |
| competitive_drive | none (model read only) | txt.compete +0.3, llm read +0.25 |
| praise_sensitivity | experiment + choice | llm read +0.25 |
| evaluation_anxiety | questionnaire | txt.hedge +0.15, txt.negemo +0.1, txt.anxiety +0.3, llm read +0.25 |
| boredom_susceptibility | none (model read only) | txt.boredom +0.3, txt.drift +0.15, cap.tabaway +0.15, llm read +0.25 |
| persistence | rate, questionnaire | txt.negemo -0.1, llm read +0.25 |
| social_framing | experiment + choice | llm read +0.25 |
| identity_alignment | none (model read only) | txt.relevance +0.15, use.uploads +0.15, llm read +0.25 |
| emotional_engagement | experiment + choice | txt.emoji +0.1, txt.exclaim +0.1, txt.posemo +0.15, llm read +0.25 |
| near_transfer | item tags | — |
| far_transfer | item tags | txt.connect +0.1 |
| application_orientation | none (model read only) | txt.relevance +0.25, use.uploads +0.15, llm read +0.25 |
| conceptual_bias | none (model read only) | txt.deepq +0.15, llm read +0.25 |
| prior_knowledge | placement | — |
| misconception_persistence | rate | — |
| integration_tendency | none (model read only) | txt.connect +0.3, llm read +0.25 |
| depth_breadth | behaviour | — |
| creative_extension | questionnaire | txt.creative +0.3, llm read +0.25 |
| mastery_velocity | ability slope | — |

## 7. Limits and honesty

- Every gain is simulated. The truth model gives each indicator exactly the validity the scorecard assumes (or half). If the real
  validities are lower still, the intervals over-claim; the robustness run measures by how much.
- How much learners chat is unknown: the sim assumes 65% ever do, about 3 messages after a third of their sittings.
- The lexicons are English. A message in another language reads as "no marker" on the word lists.
- The model read costs provider tokens on the tutor's path (one call of about 1-2k tokens a learner a day at most, only on days with 40+
  new words). Nothing was spent on it here.
- Validities and the nuisance correlation must be re-estimated on beta data (each indicator's correlation with the same learners'
  measured standings) before relying on them; until then they are stated priors, conservative by design.
- The UI changes (capture counts, privacy text) were checked by tests and syntax, not clicked through in a browser.

## 8. For the tutor agent: the observation hook

`require('./scorecard/hooks').onTutorObservation(userId, [{ measure, direction: -1 | 0 | 1, strength: 0-3 }])` with measures from
`indicators.LLM_STATS`. Send 0 for a measure looked for and not seen. Refused for an under-13 account without a parent's
`measurement_extras` agreement. `hooks.onTutorActivity(userId)` after a chat sweeps its new messages at once (otherwise the next finished
sitting does).
