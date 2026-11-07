# The scorecard against 95%: where the error is, and what real data can do

Branch `score-real`, 6 November 2026. **Every accuracy number here is SIMULATED, on simulated learners. No real learner has been measured.** The research figures are from the sources named at the end; the ceilings built from them are our estimate.

Ruler: accuracy = 100 minus a learner's mean absolute error over the 100 measures against the simulated truth (`docs/SCORECARD-LIVE.md` section 3). Guess = the calibration group's mean per measure. Removed = share of the guess's error taken away. On this ruler a guess already scores about 81, so read the share removed, not the accuracy.

Held-out seed 71107: 80 learners, day 30, including tails, contradictory mixes, uniform random traits, ages 8 to 70 and English learners. It was not used to choose anything. Default world: 60 minutes of study every day and a daily check taken every day. Rows: S0 the card as it is, S1f the read-out with log features (fitted on 360 simulated learners unless noted). Worst rows are the lowest-scoring 1%, 5% and 10% of learners.

## The plain answer

- **95% in a month is not reachable, for any measure, on this ruler.** On this mix of learners it means removing 73% of the guess's error, which needs a correlation of 0.96 with the truth, or a test-retest reliability of about 0.93. Most psychological measures don't reach that even with long instruments. Survey measures retest at a median of .674 and behavioural tasks at .311 over 2-4 months (Enkavi 2019).
- **Research ceiling for the whole card at a month: 86.7 (29% removed), range 84.4 to 88.9 (17% to 41%).** At the central estimate that is 83.0 for uniform-random learners, about 87 for contradictory and tail learners, and 89.3 for ordinary ones. None of the 100 measures reaches 95 even at its high ceiling. The closest top out near 93.7 (recognition vs recall, open response, working memory, calibration).
- **The simulation flatters by about half or more.** Of the 5.0 points the best read-out has above guess, 69% survive a generator built differently from the reader, 49% survive one held to research strengths, and about 28% survive that plus realistic use. So the honest expectation today is **about 82.6 to 83.7 (8% to 13% removed)**, not 86.6.
- **The simulated fit must not be switched on for real learners.** Under realistic use it takes the card from 82.6 down to 81.4, close to the guess at 81.2, with the worst 1% at 73.5. `SCORECARD_RECAL` stays off until a real refit passes.
- **Real-tester refit is not the route to 95.** It corrects calibration, and it moved a planted fault by only 0.2 points. Its real value is measuring which sources work at all. The missing piece is information per learner, and the ceiling limits that.

## 1. Where the remaining error is

Per-measure table for all 100: `docs/scorecard-real-gaps.md`. Summary on the held-out seed. "Behaviour" is the read-out with no daily check. "Harsher world" is the research-strength generator below. Ceilings are research low to high at a month. Classes are in `services/scorecard/ceilings.js`.

| how a trait can be read | n | guess | card | read-out | behaviour | harsher world | ceiling (central) | removed at ceiling | why this ceiling |
|---|---|---|---|---|---|---|---|---|---|
| Direct performance (speed, knowledge, span, vocabulary) | 10 | 80.7 | 85.5 | 89.3 | 87.7 | 87.5 | 90.8 | 53% | Many trials. Span retest .83 means correlation .91. Higher needs long batteries |
| Logged habits (rushing, hints, persistence) | 15 | 80.9 | 85.4 | 89.5 | 88.6 | 86.5 | 88.0 | 37% | A rate is reliable, but only describes in-app habit |
| Memory over time | 7 | 79.9 | 83.3 | 85.9 | 85.6 | 82.6 | 85.7 | 29% | Few long delays per skill in a month, tangled with how well it was learned. ASSUMED |
| Specific reasoning or transfer skill | 12 | 81.0 | 83.3 | 84.8 | 83.4 | 82.2 | 86.1 | 27% | Most of what such items read is general ability |
| Within-person contrast (warm-up, fatigue, re-entry) | 11 | 81.6 | 85.3 | 87.0 | 85.6 | 84.2 | 85.1 | 19% | Difference scores retest 0 to .82, mostly low (Hedge 2018), task median .311 |
| Attitude with a validated scale | 16 | 81.0 | 85.8 | 86.3 | 82.4 | 82.4 | 88.1 | 37% | Survey retest .674 gives .82. This reads the self-view |
| Stated taste (tone, humour, story) | 12 | 80.6 | 82.3 | 82.6 | 80.9 | 81.0 | 85.8 | 27% | Asking reads it, but our items aren't validated |
| Inner state with no direct behaviour | 5 | 83.0 | 83.6 | 83.6 | 83.1 | 82.9 | 84.8 | 11% | Only through related traits or chat |
| Whether a kind of teaching helps this learner | 12 | 82.5 | 83.9 | 84.7 | 81.4 | 83.1 | 83.8 | 8% | Needs paired versions, about 1 to 2 per dimension a month |

What this shows:

- **Too little signal: 49 measures** gain under a point from behaviour alone. Those are the attitude, taste, inner-state and teaching-benefit classes, plus some others. Behaviour can't reveal these in a month.
- **Misread: 30 measures** have a third or more of the card's squared error in bias or wrong spread, or do worse than guessing. The read-out repairs 27 of them in the simulation, but that repair comes from a simulated fit. The two to check first on real data:
  - `session_rhythm`: the card is 3.4 points below the guess.
  - `attention_runway`: card r = .24 against .95 from sitting length. Its rule only fires on rare events, while sitting length is sitting in the log.
  I did not change either rule, because their numbers depend on how the simulator builds a day.
- **Too good to be true: on 23 measures the simulated read beats even the high research ceiling** (`processing_velocity` r = .99, `self_efficacy` r = .96). The simulator lets a trait drive behaviour almost directly, which is the flattery tested in part 5.
- **Kinds of learner:** read-out from 83.1 (random) to 88.8 (ordinary). Random learners have 37% of their measures more than 20 points off. Everyone else has 16% to 25%. The read-out already sits at about the central ceiling for most kinds, so more calibration won't help them.

| kind | n | guess | card | read-out | removed | ceiling | correlation 95 needs |
|---|---|---|---|---|---|---|---|
| random | 15 | 76.1 | 80.8 | 83.1 | 30% | 83.0 | .98 |
| contradictory | 15 | 81.4 | 85.0 | 86.6 | 28% | 86.9 | .96 |
| tails, both ways | 6 | 81.3 | 84.4 | 86.3 | 26% | 86.6 | .96 |
| tails, high | 8 | 82.7 | 84.9 | 86.8 | 24% | 87.8 | .96 |
| tails, low | 7 | 83.0 | 85.0 | 86.9 | 23% | 87.9 | .96 |
| young | 7 | 81.9 | 84.8 | 86.9 | 28% | 87.2 | .96 |
| old | 8 | 81.8 | 84.6 | 86.3 | 25% | 87.1 | .96 |
| English learner | 7 | 82.7 | 86.0 | 87.1 | 25% | 87.8 | .96 |
| ordinary | 7 | 85.0 | 87.8 | 88.8 | 25% | 89.3 | .94 |

**What would reach 95:** only redefining the truth or the ruler. A habit defined as exactly what the log shows could reach it by definition. Teaching benefit shows the scale of the problem: at about .03 units of information per paired level (`docs/SCORECARD-MEASURED.md`), correlation .6 needs about 19 paired levels per measure and .96 needs about 400. At today's 28 experiment pages a month over 22 dimensions that is over a year for .6 and about 25 years for .96.

**Tailoring decisions, for the owner to consider.** A second way to read accuracy is whether a lesson is tailored the right way (card at 70+ or 30-). The card is rarely wrong-way (1% default, 2% harsher, 5% realistic), but it is right only 61% to 72% of the time it gives a direction, and it catches only 5% to 14% of a learner's clearly high or low traits. I changed no gate. If the owner wants a target the product can act on, "catches more clear traits, wrong-way under 5%" is measurable. That is the owner's call.

## 2. Active measurement (`SCORECARD_ACTIVE=1`, OFF)

Built: `services/scorecard/active-measure.js`. The planner already picked by information, but it ignored what behaviour had told it and its picks didn't react to answers. Now it knows per measure what behaviour holds for this learner, trusts behaviour less when the check disagrees with the card, weighs tail readings more, and stops when an item is worth under 0.6 points of total posterior sd per minute (chosen on the calibration seed). What is fed to the card is unchanged, and the allowance is never exceeded. Experiment pages already choose by information (`PERSONALIZE_ALLOCATOR=info`), so they are unchanged. **Not built:** choosing the next practice item or the next memory check for what it would measure. That needs changes to the practice planner in both the app and the simulator, and I ranked it below the rest. It is the part of this brief still open.

| held-out, change in card accuracy vs today, paired | minutes in the month | S0 | change | learners losing over 0.5 | worst change |
|---|---|---|---|---|---|
| today | 150 | 84.43 | | | |
| active, stop 0.6 | 76 | 84.49 | +0.06 ± 0.06 | 11 of 80 | -1.05 |
| active, no earlier stop | 151 | 84.56 | +0.13 ± 0.06 | 12 of 80 | -0.98 |
| active, stop 1.5 | 41 | 84.24 | -0.19 ± 0.07 | 23 of 80 | -1.31 |
| active, stop 3 | 14 | 83.86 | -0.56 ± 0.08 | 42 of 80 | -2.28 |
| no daily check | 0 | 83.46 | -0.97 ± 0.09 | 62 of 80 | -3.31 |
| harsher world: today | 150 | 82.87 | | | |
| harsher world: active, stop 0.6 | 76 | 82.71 | -0.16 ± 0.06 | 23 of 80 | -1.83 |

With the stop rule the read-out's worst 1/5/10% moved from 80.70 / 81.36 / 81.76 to 81.49 / 81.62 / 81.96 (fit on 120, same world).

- **The saving is time, not accuracy.** Half the minutes for the same accuracy in the default world, and a small loss in the harsher one.
- **Smarter picks barely help.** +0.13 at equal minutes. A learner skipping 80% of days gets 84.20 in 44 minutes with today's planner, and active picks do no better there (-0.04 ± 0.06). At day 7: +0.08 ± 0.06.
- **Most of the daily check's value comes early.** About three quarters of its gain comes in the first 41 minutes.

It stays off. It meets "no extra time" but raises no accuracy, and the harsher world shows a small significant loss, so turning it on is a trade-off for the owner: 74 learner-minutes a month against up to 0.16 points.

## 3. Traits behaviour can't reveal: fewest items, and what a self-report is worth

Built: `content/daily-check/short-form.json`, ordered by `scripts/scorecard-short-form.js`: 99 public-domain IPIP items, picked for what they add beyond a month of behaviour, agree-keyed and reverse-keyed in turn so a learner who agrees with everything cancels out. `DAILY_SHORT_FORM=K` (OFF) asks K items plus three short tasks, once, at most 2 minutes a day. Optional and "Recommended", as the page already says. The first picks: "I need the approval of others", "I find the world a very interesting place", "I like to tidy up", "I am thrilled when I learn something new". The order is stable: 23 of the first 24 are the same if self-report is worth 1.5x, and 17 of 24 if worth 0.5x.

**The items are validated; our mapping from them to scorecard measures is not.** Every item validity is ASSUMED, so this isn't a validated instrument.

| held-out, card accuracy | minutes | default world | harsher world |
|---|---|---|---|
| no daily check | 0 | 83.46 | 82.56 |
| short form, 24 items + tasks | 6 | 83.60 | 82.64 (+0.08 ± 0.04) |
| short form, 48 items + tasks | 10 | 83.65 | not run |
| today's daily check | 150 | 84.43 | 82.87 (+0.31 ± 0.08) |

Attitude measures gain most: 83.0 with no check, 84.0 with 24 items, 84.3 with 48, 85.8 with today's check. Everything else barely moves.

**What a self-report is worth.** For a self-view it is close to the construct (retest .674, correlation about .82). For anything that's really behaviour, self-report and behaviour correlate about 0 to .2 (Dang 2020), and surveys predict real-world outcomes only modestly (Eisenberg 2019). Discounting self-report by kind of measure (`SCORECARD_SELF_WORTH=1`, OFF) changed nothing measurable: -0.04 ± 0.07 in the harsher world, where it should have helped most. It stays off. The whole 150-minute daily check is worth **0.3 points** in the harsher world against about 1 in the default one. The 88 taps remain unvalidated.

## 4. The real-tester route, ready for day one

Built: `services/scorecard/refit-records.js`, `refit-auto.js`, `scripts/scorecard-refit-auto.js`, a daily timer behind `SCORECARD_REFIT_AUTO=1`, tests in `scripts/scorecard-real-test.js` (in `npm test`), and the end-to-end check `scripts/scorecard-refit-e2e.js`.

**Independent checks.** `SCORECARD_ANCHOR=0.25` holds a quarter of designed items back from the card. They are kept in the learner's profile row, which account deletion and the data download already cover, and the consent gate is unchanged. It costs -0.10 ± 0.07 points. **Without it the refit has nothing to check against**, so it must be on from the first tester to be any use.

**What runs by itself:**
1. Daily it counts usable testers. Under 40 it writes a "waiting" report and nothing else.
2. A fixed 30% of learners are held out for good.
3. It fits each measure's spread, pooled by class, so 40 testers give a class value and several hundred give the measure's own. Log features enter only from 500.
4. It checks against held-out learners, where the anchor's noise cancels. It passes only if the 90% lower bound is above zero and no class is significantly worse.
5. It writes a candidate and a report the owner's way: guess baseline, error removed by class, next to the ceiling.

It never turns itself on. `--promote` refuses a candidate that failed, and `SCORECARD_RECAL` stays the owner's switch.

**End-to-end test, synthetic logs from the research-strength generator**, 120 learners at 30 minutes a day with 20% of days off, 20% of checks skipped and 10% of accounts shared, plus planted mess. The test passed.

- Correctly left out: account 6689, an admin, a non-tester, an under-13 without consent, and a learner with few answers. A learner with null times, bad dates and duplicate rows was cleaned and kept. Under 40 testers it waited. With no anchors it said so and wrote nothing. No learner id appears in the report or the artifact.
- The candidate failed its check, and rightly: it had nothing to fix. Against the truth, removal was 4.6% before and 4.7% after. 17 of 34 held-out learners were better, 2 lost over 0.5, and promotion was refused.
- **The report's share removed is roughly right: 8% reported against 4.6% true.** It reads high. **Its absolute accuracy is not reliable:** the guess reads 86.9 against a true 81.4, because the anchor can't tell the real spread and assumes 17 points. The report says so and leads with the share.
- Planted fault (card spread 1.8x too wide): caught in 0 of 12 draws at 40 testers, 5 of 12 at 60, 10 of 12 at 80. Fixing it gained only 0.2 to 0.3 points on the checked measures. No fault: 0 false passes in 36.
- **Coverage is partial.** 21 measures had usable anchors, in four classes (attitude, taste, inner state, reasoning). Performance had none usable here. Habit, contrast, memory and benefit have none by design, because self-report can't stand in for them. For the log contrasts it reports real split-half instead, the first real evidence on which ones exist.
- **Shared accounts are mostly missed.** The check catches a very different pair (97% with 0.5% false alarms on synthetic logs). On simulator pairs it caught 0 of 17, with 0 false alarms in 23. A shared account cost 1.5 points of card accuracy (82.05 against 83.57). Only one was flagged in the end-to-end run. Treat shared accounts as a known source of error.

## 5. How much survives when the generator differs from the reader

`scripts/lib/sim-world.js`, `--world`. In the default simulation the generator and reader share their assumptions. Here only the generator changes, and no reader is told:

- behaviour follows a mix of the trait, other traits and a personal quirk
- responses are curved
- state moves day to day
- each item's true validity differs from what the reader believes
- self-report has response styles and careless answering
- ages 8-12 read weaker

**Alt** keeps strengths near the default (trait expression .85). **Research** caps expression at each class's ceiling, halves indicator validity and shrinks teaching effects from 0.8 to 0.3 logits. **Realistic** is research plus 20 minutes a day, 30% of days off and half the checks skipped. Response-style sizes are illustrative and ASSUMED.

| world, held-out, read-out fitted on the default world | guess | card | read-out | removed | worst 1 / 5 / 10% | of the 5.0 points above guess, surviving |
|---|---|---|---|---|---|---|
| default | 81.18 | 84.43 | 86.19 | 27% | 81.95 / 82.36 / 82.68 | all |
| alt | 81.17 | 83.41 | 84.63 | 18% | 79.34 / 80.31 / 80.92 | 69% |
| research | 81.18 | 82.87 | 83.66 | 13% | 78.35 / 78.85 / 79.48 | 49% |
| realistic | 81.18 | 82.60 | **81.41** | 1% | 73.47 / 75.62 / 76.54 | card alone: 28% |

Refitting on 120 learners of each world, with the simulated truth, which real life won't have: alt 83.80, research 83.09, realistic 82.69. Refit worst 1 / 5 / 10% in realistic: 76.67 / 77.14 / 77.87. Refitting rescues realistic use from the harm but not beyond the card's level, and 120 learners is too few: research with the 360-learner mismatched fit (83.66) beats research with a 120-learner matched fit (83.09).

By kind in the research world (guess to read-out): random 76.1 to 80.4, contradictory 81.4 to 83.9, ordinary 84.9 to 87.2. In realistic use the mismatched read-out is about level with or below guess for most kinds: ordinary 84.9 to 84.0, tails 83.0 to 82.5.

This run used the default read-out on one new seed. The earlier 86.6 was seed 61106, and 86.19 reproduces it within seed noise.

## Public real-learner datasets, for the owner to decide (nothing downloaded)

| dataset | what it would settle | size | licence | source |
|---|---|---|---|---|
| Self-Regulation Ontology (Eisenberg, Enkavi, Poldrack) | **Best first.** Same people did tasks and surveys, with retest. Directly measures what a self-report is worth for behaviour, and task reliability | 522 people, 37 tasks, 23 surveys, 150 retested. Repository size not stated | CC-BY 4.0 per its README, the clearest here | github.com/IanEisenberg/Self_Regulation_Ontology |
| Johnson's IPIP-NEO | Real item correlations for the NEO-facet scales the short form uses, so the order can be checked | 307,313 for IPIP-NEO-300; nearly a million across the repository | A published study calls it public domain; no licence confirmed on the page, which would not load | osf.io/tbmh5 |
| Open Psychometrics raw data | Larger real IPIP Big Five responses | 1,015,342 (IPIP-FFM) | No formal licence stated; anonymous, consented for research | openpsychometrics.org/_rawdata |
| Eedi, NeurIPS 2020 | Real answers with confidence and student data, for the log contrasts and calibration | 118,971 students, 15.9M answers; a second set of 4,918 students, 1.4M answers | CC BY-NC-ND 4.0: non-commercial, no derivatives | eedi.com/projects/neurips-education-challenge |
| EdNet (Riiid) | Real tutoring logs at scale, including actions: are the contrasts stable? | 784,309 students; KT1 95M answers, 131M in the full set | CC BY-NC 4.0 | arxiv.org/abs/1912.03072 |
| Anki revlogs 10k | Real forgetting per person: is a forgetting rate stable? | About 10,000 collections, 15.7 GB | Own licence, login and agreement needed; terms not read | huggingface.co/datasets/open-spaced-repetition/anki-revlogs-10k |
| Duolingo half-life regression | Real spaced recall | 13M traces, 361 MB | Code MIT; data licence unconfirmed (a mirror says CC BY-NC 4.0) | github.com/duolingo/halflife-regression |

Savant is a company, so non-commercial licences may not cover it even for internal validation. That needs the owner's judgement, and legal advice if it matters. Junyi and ASSISTments are also common, but I couldn't confirm their terms (ASSISTments 2009-10 is reported at 4,217 students and 346,860 interactions).

## Switches, all OFF by default

`SCORECARD_ACTIVE`, `SCORECARD_ACTIVE_MINGAIN`, `SCORECARD_SELF_WORTH`, `DAILY_SHORT_FORM`, `SCORECARD_ANCHOR`, `SCORECARD_REFIT_AUTO`. `SCORECARD_RECAL`, `SCORECARD_LOGFEAT` and `DAILY_PASSIVE` also stay off.

## Not done or not verified

- Nothing is real-learner evidence. Ceilings are our reading of the sources. Class assignments and `BEHAVIOUR_V` are judgement.
- Mabe & West, Fleeson & Gallagher, Unsworth, Bilker and Pashler are cited from `services/onboarding/model.js` and not re-read this round.
- Not run: day 180 (the earlier 24-learner run showed no gain from time alone), active and short form under realistic use, short form 48 in the research world.
- Calibration sets are 120 learners per configuration except the default world (360), so S1f comparisons between configurations are noisy. Paired comparisons use S0.
- The memory check and games aren't modelled in the simulator's daily run.
- Browser check at phone width (375 px), by script with the pane hidden, on a temp database with the short form, active and anchors on: the offer says 2 minutes, a scale item and a speed task render with no sideways scroll, and stop returns to the dashboard. I did not see it rendered as an image. The learner page is unchanged, with no restyle.
- `session_rhythm` and `attention_runway` are not fixed.
- With `DAILY_SHORT_FORM` on, one test in `scripts/daily-check-test.js` fails by design, because the short form drops the spread-out sign-up questionnaire. The test passes with the switch off, which is the default. Decide this before turning the short form on.

## How to reproduce

Dumps and queues are in `C:/coding/savant-wt/_sim-real/` (outside the repo; seeds 71107 held-out, 71108 calibration, 71109 end-to-end, 71110 shared). Scoring: `scripts/scorecard-real-compare.js`, breakdown: `scripts/scorecard-real-gaps.js`.

## Sources

- Enkavi et al. 2019, PNAS, 10.1073/pnas.1818430116, pmc.ncbi.nlm.nih.gov/articles/PMC6431228. Checked: survey median ICC .674, task .311, delay 111 days on average.
- Hedge, Powell & Sumner 2018, Behavior Research Methods, 10.3758/s13428-017-0935-1. Abstract level: 0 to .82.
- Dang, King & Inzlicht 2020, Trends in Cognitive Sciences, michaelinzlicht.com. Abstract level: 0 to .20.
- Eisenberg et al. 2019, Nature Communications, 10.1038/s41467-019-10301-1.
- Zerr et al. 2018, Psychological Science, 10.1177/0956797618772540. No separate reliability for forgetting rate found.
- Donnellan et al. 2006, Psychological Assessment, 10.1037/1040-3590.18.2.192. Mini-IPIP: a 20-item short form holds up, exact retest figures not read.
