# 04. Skill tracks (chess, piano, basketball) and learning games: the evidence for each mechanism

Part of the evidence article (`curriculum-build/evidence-article/BRIEF.md`). This section covers:
- the skill curricula: `curriculum-build/SKILL-CURRICULA.md` and the subjects' research files in `../curriculum-build/<subject>/research`;
- stage checks and the stage gate: `content/skill-stage-checks.js`, `services/skill-coverage.js`, `services/skill-record.js`, `services/skill-gate.js`, `SKILL_STAGE_GATE` and "two cold days";
- the practice dose: `services/skill-adaptation.js`, `services/skill-dose.js`;
- the chess sittings: `content/skill-chess-sittings.js`, `services/skill-chess-sittings.js`, `content/chess-trainer.js`;
- the piano and basketball sittings: `services/skill-piano-bb-sittings.js` and `content/skill-piano-bb-sittings.js`. These cover sight-reading, scale evenness, memory restarts, decision scenes, shooting by zone and box scores;
- piano score-following: `public/engine/piano/*`;
- basketball body tracking: `public/engine/basketball/*`, including `pose.js`;
- deliberate practice, the "film it, rate it" loop, cold first attempts and two-day lessons;
- learning games: `services/game-lab.js`, `services/game-payloads.js`, `GAME_HOLDS` and the game payloads.

**Totals.**
- **58 mechanisms.** All 58 have 3 or more distinct sources with a verbatim quote. Title-level-only sources are extras and are never counted toward the 3.
- **Verdicts:** strong 11, moderate 19, mixed 7, design choice 21.
- **159 distinct sources** cited:
  - **140 new** (itc2015security added in the fix-up pass, for M17), each DOI-verified on Crossref (title, first author and year matched), listed in `04-skill-tracks-games-sources.json`;
  - **2 official standards** by URL: AERA/APA/NCME *Standards for Educational and Psychological Testing* (2014) and FIBA *Official Basketball Rules 2026 v1.1*. They are also in the JSON (`aera2014`, `fiba2026rules`, with `doi: null`), so it holds 142 entries;
  - **17 reused** from `scorecard-sources.json` and `retention-sources.json` (ids prefixed `R:` below). For each reused source used for a new claim, the quote was re-taken from its abstract today.
- **Quotes.** Every quote was checked by script against the abstract text fetched from Crossref, OpenAlex, PubMed or Semantic Scholar (a session scratch script; 140 quoted passages in this file were re-checked against the same abstracts, with 0 mismatches). Each is under 25 words. 19 sources had no retrievable abstract and are marked "title-level only"; none of them carries a mechanism alone.
- **FACT-REVERIFY.** `curriculum-build/FACT-REVERIFY-2026-10-25.md` is present and is cited here for:
  - the FIBA free-throw line (5.80 m, Art. 2.5.3);
  - the Tran & Silverberg aim cue, corrected to "toward the back of the ring";
  - the scale-spelling display bug: 59 of 102 battery items showed flats as sharps. The fix needs an app restart on 6767, which is the coordinator's job.

**Code version read:** the working tree on 2026-10-25. Line numbers are as of that read.

**Notation.**
- [R] marks a number the code itself calls provisional.
- "Pop." gives the population or setting each source studied.

## Mechanisms at a glance

| # | Mechanism | Where | Verdict |
|---|---|---|---|
| M01 | Cold-only sittings (first of the day, 20+ h after practice) | skill-coverage.js:66, 242-246 | strong |
| M02 | Proof needs cold passes on two different days | skill-coverage.js:67, 270-280 | mixed |
| M03 | Bayes belief against lucky passes (0.5 / 0.85 / 0.15 / 0.95) | skill-coverage.js:68-71, 261-268 | design choice |
| M04 | Microphone and camera results count only when confirmed | skill-coverage.js:256-258; skill-checks.js:713-721 | strong |
| M05 | Self-report, film and imports never prove ("attest") | skill-coverage.js:33-36; skill-gate.js:17-22 | moderate |
| M06 | Retention ("kept") sitting 7+ days after proof | skill-coverage.js:288-293 | strong |
| M07 | Lapse after two cold misses in a row | skill-coverage.js:69, 294-305 | design choice |
| M08 | A proof older than 7 days needs a fresh cold pass at exit | skill-coverage.js:75, 319-338 | design choice |
| M09 | Stage gate is on per stage only when every check is wired; default shadow list | skill-gate.js:39-69, 160-178 | design choice |
| M10 | Decision-scene sets need split-half ≥ 0.8 before they gate | skill-gate.js:49-50; content/skill-piano-bb-sittings.js:24-25 | moderate |
| M11 | Dose shared by distance from target; every unproven metric gets a set | skill-adaptation.js:183-194 | moderate |
| M12 | Cold test called at 3 of 3 warm sets on target, or every 5 days | skill-adaptation.js:45-46, 130-137 | design choice |
| M13 | Maintenance share: over-learning dose of 2× the sets to proof (min 4) | skill-adaptation.js:50-60, 102-107, 157-170 | mixed |
| M14 | Carry-over across stages is off by default | skill-adaptation.js:61-66 | mixed |
| M15 | 30% of the session goes to lessons while knowledge is open | skill-adaptation.js:118, 153; skill-dose.js:103 | design choice |
| M16 | Session = midpoint of the stage's minutes; 4-minute sets; 5 items a set | skill-dose.js:36, 63-67; skill-adaptation.js:47-48 | design choice |
| M17 | Answers held on the server; fixed-form sittings | skill-stage-checks.js:7-12; chess-trainer.js:6-12 | design choice |
| M18 | Mastery cuts of 80-95% on item sittings | skill-stage-checks.js:38-117 | moderate |
| M19 | Unannounced chess items: "no mate" foils, motifs not named | skill-stage-checks.js:44-55; skill-checks.js:189-210 | moderate |
| M20 | Moves are played or typed, never picked from a menu | skill-stage-checks.js:34 | strong |
| M21 | Puzzle trainer: Glicko-2 rating, puzzle chosen near the rating | chess-trainer.js:33, 57-66, 89; chess-rating.js:13, 16 | mixed |
| M22 | Puzzle-rating stage cut needs RD ≤ 80 after ≥ 10 puzzles | skill-stage-checks.js:60-65 | design choice |
| M23 | Play-outs against perfect defence (tablebases, Stockfish) | content/skill-chess-sittings.js:33-50 | design choice |
| M24 | 12 recorded rapid games against measured bot bands, Stockfish analysis | content/skill-chess-sittings.js:26, 35-52; skill-chess-sittings.js:17-23 | moderate |
| M25 | CH0: star mazes at par, board set-up from memory | content/skill-chess-sittings.js:29-32 | design choice |
| M26 | Calculation: type the whole line, every reply too | content/skill-chess-sittings.js:45-46 | design choice |
| M27 | Score-informed take scoring and the timing window | piano-core.js:186-215 | design choice |
| M28 | Scale evenness as the CV of inter-onset gaps; cuts 0.12 / 0.09 / 0.06 [R] | piano-core.js:217-229 | moderate |
| M29 | Scales drawn at random in the technique sittings | skill-stage-checks.js:91-97 | moderate |
| M30 | Sight-reading staircase SR1-SR7 with never-seen excerpts | piano-sight-reading.js:29-38; skill-piano-bb-sittings.js:59-62, 104-108 | moderate |
| M31 | Memory restarts from 3 random bars | skill-piano-bb-sittings.js:147-162 | moderate |
| M32 | Dynamics from MIDI velocity only (f at least 15 above p) | piano-core.js:231-237; content/skill-piano-bb-sittings.js:50-51 | design choice |
| M33 | Legato pedal timing from MIDI CC64 (within 150 ms) | content/skill-piano-bb-sittings.js:54-55; piano-core.js:1044 | design choice |
| M34 | Musicality is never machine-graded | piano-core.js:250; skill-gate.js:17-22 | moderate |
| M35 | Microphone pipeline: YIN, chord verifier, latency check, one hand | piano-core.js:45-108, 472-500; piano-song.js:18-22, 96-99 | strong |
| M36 | Learn mode waits, play mode runs at tempo; stars capped at 2 when slowed | piano-song.js:11-13, 190; piano-core.js:396-430 | moderate |
| M37 | Self-rate the take before seeing the measurement | piano-blocks.js:158-191; block-levels.js:450 | mixed |
| M38 | Ear items: echo patterns, a tune by ear in 3 tries | skill-stage-checks.js:74-83; block-levels.js:465 | moderate |
| M39 | Steady-beat check: 16 taps at 80 bpm, 75% on the beat | skill-stage-checks.js:72-73 | design choice |
| M40 | A new 16-bar piece learned alone, played cold within 14 days | content/skill-piano-bb-sittings.js:56-57 | design choice |
| M41 | Two-day lessons: the day-2 cold take is the learning score | SKILL-CURRICULA.md:187, 225-227 | mixed |
| M42 | The nine-activity lesson ladder | basketball-grades.js:43-51; piano-grades.js:43; chess-grades.js:43 | strong |
| M43 | Make-rate gates by Beta posterior P(rate ≥ bar) ≥ confidence, with minimum attempts | skill-checks.js:94-104; skill-stage-checks.js:111-124 | strong |
| M44 | Shooting by zone: 5 zones, min 17 or 25 shots each, intervals shown | skill-piano-bb-sittings.js:288-316; content/skill-piano-bb-sittings.js:71-76 | design choice |
| M45 | Athletic numbers are judged against the learner's own baseline, never a ranking | skill-checks.js:774-806; skill-stage-checks.js:105-106, 125-126 | moderate |
| M46 | Decision scenes: drawn plays paused at the decision, 80% bar | content/skill-piano-bb-sittings.js:60-70; basketball-scenes.js:26, 161-170 | moderate |
| M47 | Applied tasks: box-score computations and rules calls | skill-piano-bb-sittings.js:240-258; content/skill-piano-bb-sittings.js:73-79 | design choice |
| M48 | Camera tracking stays on the device; counts are estimates the learner confirms | pose.js:1-26; tracking.js:100-130, 404-449; camera-blocks.js:5-11 | moderate |
| M49 | Film it, rate it: film, watch twice, rate on a rubric, one focus for 3 sessions | basketball-blocks.js:212-323; block-levels.js:342-355 | moderate |
| M50 | One external cue per drill | block-levels.js:377, 409; basketball-grades.js:6171 | strong |
| M51 | Court session: health check, warm-up first, pain and enjoyment logged | block-levels.js:368-380; skill-stage-checks.js:109-110 | strong |
| M52 | Handle-and-react drill; dribbling with eyes up | block-levels.js:397-410; skill-stage-checks.js:113-114 | design choice |
| M53 | Game serving holds (70 levels held) | game-payloads.js:43-83; content/game-holds.json | moderate |
| M54 | Game payload inspection, including the explanation on every question | game-payloads.js:160-198; game-lab.js:14-19 | strong |
| M55 | Explanation-key gate: blind re-key, one rewrite | game-payloads.js:509-519 | design choice |
| M56 | evenOrder: difficulty spread evenly through the set | game-payloads.js:202-244 | mixed |
| M57 | Games practise what the last lesson taught | game-payloads.js:543-558 | strong |
| M58 | Tailored games with a holdout arm; games as practice | game-payloads.js:651-676 | moderate |

---

## A. How a stage is proven (skill-coverage, skill-record, skill-gate)

### M01. Cold-only sittings
- **Where:** `services/skill-coverage.js:66` (`COLD_HOURS: 20`), `:242-246` (`isCold`), `:256-258`; `services/skill-record.js:8-9, 198-210` (`coldAt`); `services/skill-dose.js:19-20`.
- **What it does:**
  - A sitting counts only when it is cold: the metric's first sitting that day, and at least 20 hours after the metric was last practised or sat.
  - Warm practice sets never prove anything. Each one makes the next sitting warm for 20 hours.
- **Evidence:**
  - soderstrom2015 (10.1177/1745691615569000): "people often mistakenly interpret their performance during acquisition as a reliable guide to long-term learning". Pop.: review of motor and verbal learning.
  - kantak2012 (10.1016/j.bbr.2011.11.028): "challenging practice conditions may impair practice performance, but enhance long-term retention of motor skills". Pop.: focused review of motor learning studies.
  - schmidt1992 (10.1111/j.1467-9280.1992.tb00029.x): "Manipulations that maximize performance during training can be detrimental in the long term". Pop.: motor and verbal training paradigms.
  - lee1988 (10.1080/02701367.1988.10609373): "there is strong evidence that massed practice depresses performance and learning (when learning is assessed by absolute retention measures)". Pop.: review and meta-analysis of motor practice distribution.
  - adams1961 (10.1037/h0044798): title-level only (warm-up decrement review).
- **Verdict:** **strong** for the principle that a cold, delayed sitting measures learning better than in-session performance. The 20-hour window is a design choice.
- **Code vs evidence:** Matches. The rule cannot be bypassed by repeated retakes: `sit()` marks every non-first sitting of a day as warm, so it never counts.

### M02. Two different days
- **Where:** `services/skill-coverage.js:67` (`PROOF_DAYS: 2`), `:270-280`; the "two cold days" text in `services/skill-gate.js:208`.
- **What it does:** A metric is proven only by cold passes on at least two different UTC days, with the belief at or above 0.95 (M03).
- **Evidence:**
  - walker2002 (10.1016/S0896-6273(02)00746-8): "a night of sleep results in a 20% increase in motor speed without loss of accuracy". Pop.: adults, finger-tapping sequence.
  - simmons2006 (10.1177/002242940605400308): "We found significant sleep-dependent improvements in performance accuracy in the retests that followed intervals of sleep". Pop.: adults learning a 12-note keyboard melody.
  - abushanab2013 (10.3758/s13421-013-0311-z): "on a retention test 2 days later, participants were faster with melodies from the random-order condition". Pop.: 25 trained pianists. This shows that a day-later test reverses the in-session ranking.
  - R:mazza2016 (10.1177/0956797616659930): "interleaving sleep between learning sessions not only reduced the amount of practice needed by half but also ensured much better long-term retention". Pop.: 40 adults, vocabulary.
  - rickard2008 (10.1037/0278-7393.34.4.834): "Whereas sleep may play a role in protection from forgetting of motor skills, it does not result in performance enhancement." Pop.: adults, motor sequence, with confounds controlled.
  - R:wilhelm2008 (10.1101/lm.803708): "children showed smaller improvement in finger-tapping skill across retention sleep than wakefulness". Pop.: 15 children aged 6-8 and 15 adults.
  - brashers1996 (10.1038/382252a0): "consolidation of a motor skill was disrupted when a second motor task was learned immediately after the first". Pop.: adults, reaching task.
- **Verdict:** **mixed**:
  - A delayed, second-day test is well supported as a better index of learning (soderstrom2015, abushanab2013).
  - Whether sleep *improves* a motor skill is contested (walker2002 and simmons2006 against rickard2008).
  - For children, the procedural sleep benefit may be absent (wilhelm2008).
- **Code vs evidence:** The rule is sound as a delayed-retention and anti-luck rule, and that is what the code implements. It makes no sleep-gain claim. Any learner-facing text that promises improvement "after a night's sleep" would overstate the evidence for under-12s; see proposal P9.

### M03. A belief that cannot be gamed by lucky passes
- **Where:** `services/skill-coverage.js:68-71` (`PRIOR 0.5`, `PASS_IF_AT 0.85`, `LUCK 0.15`, `PROVEN_AT 0.95`), `:261-268`.
- **What it does:**
  - Each counting sitting updates P(at threshold) by Bayes' rule. A pass has likelihood 0.85 if the learner is at the bar and 0.15 if below it.
  - Two passes from the even prior reach 0.97. Each miss in between needs another pass.
  - So retaking until two lucky passes come cannot prove a metric (sequential testing).
- **Evidence:**
  - gelman2013 (10.1201/b16018): "Bayesian Data Analysis describes how to conceptualize, perform, and critique statistical analyses from a Bayesian perspective." Textbook (CRC).
  - brown2001 (10.1214/ss/1009213286): "we recommend the Wilson interval or the equal-tailed Jeffreys prior interval for small n". Pop.: statistical analysis of binomial intervals. Small-n single tests are unreliable.
  - hopkins2000 (10.2165/00007256-200030010-00001): "Better reliability implies better precision of single measurements and better tracking of changes in measurements in research or practical settings." Pop.: sports-science measurement review.
  - wald1945 (10.1214/aoms/1177731118): title-level only (sequential tests).
- **Verdict:** **design choice.** The method follows standard sequential Bayesian updating. The 0.85 and 0.15 likelihoods come from the staged gates' simulated error rates, not from learner data.
- **Code vs evidence:** Matches in form. Gap: the likelihoods should be re-estimated from real sittings once enough are recorded. A fixed 0.85 / 0.15 may be wrong for noisy metrics such as shooting.

### M04. Estimates (microphone, camera) count only when confirmed
- **Where:**
  - `services/skill-coverage.js:29-32, 256-258`;
  - `services/skill-checks.js:713-721`: a microphone take counts as confirmed only if every part has two passing takes;
  - `content/skill-stage-checks.js:17-23`;
  - `services/skill-record.js:11-14`.
- **What it does:**
  - Exact sources count directly: board, MIDI, on-screen keys, taps and screen answers.
  - Microphone and camera results are estimates. They count only with a confirmation: a second passing take, or the learner confirming the count.
  - A source the metric does not list never counts.
- **Evidence:**
  - decheveigne2002 (10.1121/1.1458024): "Error rates are about three times lower than the best competing methods". Pop.: YIN F0 estimation on speech and music. Even the best single-pitch method has errors.
  - emiya2010 (10.1109/TASL.2009.2038819): "It addresses the issue of overlapping overtones by modeling the spectral envelope of the overtones of each note". Pop.: multipitch piano recordings (MAPS). Chords are a known hard case.
  - kong2021 (10.1109/TASLP.2021.3121991): "Our system achieves a pedal onset F1 score of 91.86%, which is the first benchmark result on the MAESTRO dataset." Pop.: piano transcription benchmark. Even state-of-the-art audio is below MIDI's exactness.
  - washabaugh2022 (10.1016/j.gaitpost.2022.08.008): "Pose estimation methods differed in their ability to measure kinematics." Pop.: healthy gait, open-source pose methods against motion capture.
  - stenum2021 (10.1371/journal.pcbi.1008935): "Mean absolute error of sagittal plane hip, knee and ankle angles between motion capture and OpenPose were 4.0°, 5.6° and 7.4°." Pop.: adults walking, 2D video.
  - benetos2013 (10.1007/s10844-013-0258-3): title-level only (automatic music transcription challenges).
- **Verdict:** **strong.** Audio and video estimates carry known errors, so treating them as estimates is well supported.
- **Code vs evidence:** Matches.

### M05. Self-report, film and imported ratings never prove
- **Where:** `services/skill-coverage.js:33-36`; `services/skill-gate.js:17-22`; `attest` list at `:146`.
- **What it does:** Metrics whose only sources are self-report, film for a person to review, or imported stats are "attest". They are recorded and shown, and never hold or prove a stage. Whether a person's sign-off should hold a stage is left to the owner.
- **Evidence:**
  - R:kruger1999 (10.1037/0022-3514.77.6.1121): "participants scoring in the bottom quartile on tests of humor, grammar, and logic grossly overestimated their test performance and ability". Pop.: US undergraduates.
  - bergee1997 (10.2307/3345425): "self-evaluation correlated poorly with both faculty and peer evaluation". Pop.: college applied-music performers.
  - hewitt2001 (10.2307/3345614): "participants who listened to a model during self-evaluation improved more than those not listening to a model". Pop.: 82 junior-high instrumentalists. Self-evaluation helps learning when it is anchored, but that is not the same as proof.
  - andrade2019 (10.3389/feduc.2019.00087): "An argument is made for less research on consistency and summative self-assessment, and more on the cognitive and affective mechanisms of formative self-assessment." Pop.: review of 76 studies.
- **Verdict:** **moderate.** Self-assessment is useful formatively and unreliable as a summative measure.
- **Code vs evidence:** Matches. Self-ratings are used formatively (M37, M49) and never as proof.

### M06. The retention ("kept") sitting
- **Where:** `services/skill-coverage.js:18, 288-293`; `services/skill-record.js:245`. Stage `retention_days` comes from the progression ("again after 7+ days").
- **What it does:** A stage that names a retention test needs a cold pass at least that many days after the proof. Only then does the metric move from `proven` to `retained`.
- **Evidence:**
  - arthur1998 (10.1207/s15327043hup1101_3): "there is substantial skill loss with nonpractice or nonuse". Pop.: meta-analysis of 53 articles on skill decay.
  - R:roediger2006 (10.1111/j.1467-9280.2006.01693.x): "on the delayed tests, prior testing produced substantially greater retention than studying". Pop.: college students, prose.
  - R:cepeda2008 (10.1111/j.1467-9280.2008.02209.x): "The optimal gap increased as test delay increased." Pop.: 1,350+ adults, facts, delays up to a year.
  - soderstrom2015 (as M01).
- **Verdict:** **strong.**
- **Code vs evidence:** Matches. The 7-day figure is the progression's own number.

### M07. Lapse after two cold misses
- **Where:** `services/skill-coverage.js:69` (`LAPSE_MISSES: 2`), `:294-305`.
- **What it does:** After proof, two cold misses in a row, or a belief below 0.5, lapse the metric. Its proof days are cleared and it must be proven again.
- **Evidence:**
  - arthur1998 (as M06).
  - hopkins2000 (as M03). One miss is within normal trial-to-trial noise.
  - rawson2011 (10.1037/a0023956): "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals". Pop.: 533 college students. Relearning after decay is efficient.
- **Verdict:** **design choice.** Two misses is a reasoned noise allowance.
- **Code vs evidence:** Consistent with the evidence. No study fixes "two".

### M08. Stale proofs need a fresh cold pass at exit
- **Where:** `services/skill-coverage.js:75` (`STALE_DAYS: 7`), `:319-338`; `services/skill-record.js:246`; `services/skill-gate.js:7-9`.
- **What it does:** When a stage is left, any proven metric whose last counting pass is more than 7 days old is `stale`. It holds the stage until a fresh cold sitting passes, so the battery stands at exit.
- **Evidence:**
  - arthur1998 (as M06).
  - kim2013 (10.1080/1464536X.2011.573008): "we discuss how we might improve training by better spacing the iterations between training sessions to support proceduralisaion to improve skill retention". Pop.: theory of skill retention, with training implications.
  - R:cepeda2008 (as M06).
  - rawson2013 (10.1007/s10648-013-9240-4): title-level only (successive relearning).
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent. The 7-day cutoff has no study behind the exact number.

### M09. The stage gate, per stage, with a default shadow list
- **Where:** `services/skill-gate.js:39-42` (`mode`, default `on`), `:54` (`DEFAULT_SHADOW`), `:56-69` (`stageMode`), `:160-178` (`atGraduation`), `:194-213` (path node).
- **What it does:**
  - A passed Final does not graduate a stage while a provable metric is unproven, but only on stages where every provable metric has a working check.
  - The stages listed below stay in shadow. In shadow, the gate's verdict is only written to the enrollment.
  - Stages in shadow and why:
    - CH2-CH5: games need an owner call; Maia-2.
    - PI5-10: library pieces and [R] tempos.
    - BB1-BB7: decision-scene reliability is not yet measured.
    - BB8-12: a person is needed.
- **Evidence:**
  - AERA/APA/NCME *Standards for Educational and Psychological Testing* (2014), https://www.testingstandards.net/open-access-files.html (official, open access). This is the standard requiring validity and reliability evidence for an intended score use.
  - downing1997 (10.1207/s15324818ame1001_4): "A primary type of validity evidence derives from the item development process and item responses." Pop.: high-stakes exam item development.
  - hopkins2000 (as M03).
  - kohavi2009 (10.1007/s10618-008-0114-1): "Controlled experiments embody the best scientific design for establishing a causal relationship between changes and their influence on user-observable behavior." Pop.: online controlled experiments. Shadow mode lets a gate's effect be measured before it is enforced.
- **Verdict:** **design choice.** It is a conservative rollout: no learner is held on a test without evidence it measures the skill.
- **Code vs evidence:** Matches.

### M10. Decision-scene sets need split-half ≥ 0.8 before they gate
- **Where:** `services/skill-gate.js:49-50`; `content/skill-piano-bb-sittings.js:24-25` ("a set used as a gate needs split-half >= 0.8 after 100 learners").
- **What it does:** It keeps BB1-BB7 in shadow until the drawn-scene sets show adequate reliability.
- **Evidence:**
  - rosch2021 (10.3390/ijerph18052331): "the diagnostic results discriminate between performance levels". Pop.: 17 German U16 national-team players and 17 sports-class students, video 4v4 test (the study reports split-half 0.92 in its full text).
  - cortina1993 (10.1037/0021-9010.78.1.98): "a demonstration of the effects of test length and dimensionality on alpha". Pop.: psychometric methods. Reliability depends on set length, which matters for 10-30 scene sets.
  - hopkins2000 (as M03).
  - AERA Standards 2014 (as M09).
- **Verdict:** **moderate.** A reliability bar before high-stakes use is standard practice. 0.8 is a common convention.
- **Code vs evidence:** Gap. No code computes split-half yet: it appears only in comments. The bar is enforced by hand through the shadow list. See P5.

## B. How much and when to practise (skill-adaptation, skill-dose)

### M11. Dose by distance from target, every unproven metric kept
- **Where:** `services/skill-adaptation.js:8-15, 183-194`; `checkPlan` (header lines 4-6).
- **What it does:**
  - The session's practice sets go to the stage's unproven metrics in proportion to how far each is from its target on the learner's recent warm sets.
  - Each unproven metric gets at least one set, so none is dropped.
- **Evidence:**
  - duke2009 (10.1177/0022429408328851): "the strategies employed during practice were more determinative of performance quality at retention than was how much or how long the pianists practiced". Pop.: 17 advanced piano students, next-day retention.
  - R:ericsson1993 (10.1037/0033-295x.100.3.363): "Individual differences, even among elite performers, are closely related to assessed amounts of deliberate practice." Pop.: musicians.
  - guadagnoli2004 (10.3200/JMBR.36.2.212-224): "motor tasks represent different challenges for performers of different abilities". Theory paper (challenge point).
  - platz2014 (10.3389/fpsyg.2014.00646): "Our results corroborate the central role of long-term (deliberate) practice for explaining expert performance in music." Pop.: meta-analysis, 13 studies, N = 788.
- **Verdict:** **moderate.** Targeting weaknesses is the core of deliberate practice. Proportional allocation is a reasoned rule.
- **Code vs evidence:** Matches.

### M12. When to call a cold sitting
- **Where:** `services/skill-adaptation.js:45-46` (`READY 3`, `CHECK_DAYS 5`), `:130-137`.
- **What it does:** A cold stage test is scheduled when the last 3 warm sets were all at target, or at least every 5 days. The second rule means a learner whose warm sets under-state them is not held.
- **Evidence:**
  - soderstrom2015 (as M01). Warm performance is an unreliable guide, so it only *times* the test and never decides it.
  - abushanab2013 (as M02). The ranking of practice conditions flipped by the 2-day test.
  - rawson2011 (as M07). Criterion-then-relearn scheduling.
  - R:kornell2009 (10.1037/a0015729): "Unsuccessful retrieval attempts enhanced learning with both types of materials." Pop.: adults, verbal materials. A failed early test is not wasted, which supports the 5-day forced check.
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent.

### M13. Maintenance share and the over-learning dose
- **Where:** `services/skill-adaptation.js:50-60` (`MAINT_SHARE -1`, i.e. "even"; `OVERLEARN 2`; `OVERLEARN_MIN 4`), `:96-107` (`overlearnDeficit`), `:157-170`.
- **What it does:**
  - While other metrics are unproven, a proven metric keeps the share of sets that even practice would give it.
  - It keeps that share until it has had twice the sets it took to prove it, with a minimum of 4.
- **Evidence:**
  - driskell1992 (10.1037/0021-9010.77.5.615): "overlearning produces a significant effect on retention of moderate overall magnitude". Pop.: meta-analysis, cognitive and physical tasks.
  - shibata2017 (10.1038/nn.4490): "overlearning in humans abruptly changes neurochemical processing, to hyperstabilize and protect trained perceptual learning from subsequent new learning". Pop.: adults, visual perceptual learning.
  - R:rohrer2005over (10.1002/acp.1083): "overlearning (and its concomitant demand for additional study time) is an inefficient strategy for learning material for meaningfully long periods of time". Pop.: 218 college students, facts and definitions.
  - arthur1998 (as M06).
- **Verdict:** **mixed.** Over-learning helps retention in the medium term (driskell1992) but its advantage fades over weeks (rohrer2005over). It may also block new learning immediately afterwards (shibata2017).
- **Code vs evidence:** Reasonable. The retention sitting (M06) and the stale rule (M08) catch the fade that rohrer2005over describes. The 2× factor is a design choice.

### M14. Carry-over across stages is off by default
- **Where:** `services/skill-adaptation.js:61-66` (`CARRY_DAYS 0`, `CARRY_MAX 2`).
- **What it does:** Once a stage is left, its metrics get no further maintenance sets. The comment explains that "the audit's truth model has no spacing benefit".
- **Evidence:**
  - lee1988 (as M01). Massed practice depresses motor learning.
  - R:donovan1999 (10.1037/0021-9010.84.5.795): "individuals in spaced practice conditions performed significantly higher than those in massed practice conditions". Pop.: meta-analysis, 63 studies.
  - wiseheart2017 (10.1371/journal.pone.0182986): "No spacing effect was found, suggesting that the effect may not always be demonstrable for complex motor skills". Pop.: adult novices, 17-note piano sequence, lags of 0-15 minutes.
  - R:cepeda2008 (as M06).
- **Verdict:** **mixed.** Spacing works for motor tasks across sessions and days (lee1988, donovan1999). The piano null result used minute-scale lags and a 5-minute test (wiseheart2017).
- **Code vs evidence:** Gap. The default rests on a simulation whose truth model has no spacing benefit. The day-scale motor literature points the other way. See P8: measure it rather than assume it.

### M15. Lesson share while knowledge is open
- **Where:** `services/skill-adaptation.js:118, 153` (`lessonShare = 0.3`); `services/skill-dose.js:103`.
- **What it does:** While the stage's knowledge gate is open, 30% of the session goes to its lessons. The rest is practice.
- **Evidence:**
  - charness2005 (10.1002/acp.1106): "serious study alone was the strongest predictor of chess skill in both samples". Pop.: two large samples of rated chess players.
  - macnamara2014ps (10.1177/0956797614535810): "deliberate practice explained 26% of the variance in performance for games, 21% for music, 18% for sports". Pop.: meta-analysis across domains.
  - macnamara2016 (10.1177/1745691616635591): "deliberate practice accounted for only 1% of the variance in performance among elite-level performers". Pop.: meta-analysis, sports.
  - R:renkl2003 (10.1207/s15326985ep3801_3): "we propose a fading procedure in which problem-solving elements are successively integrated into example study". Review of example-based learning.
- **Verdict:** **design choice.** Study and practice both matter, and no study fixes the split.
- **Code vs evidence:** Consistent.

### M16. Session length, set length and items per set
- **Where:** `services/skill-dose.js:36` (`ITEMS_PER_SET 5`), `:63-67` (session = midpoint of the stage's `session_minutes`, else 30); `services/skill-adaptation.js:47-48` (`SET_MIN 4`, `SIT_MIN 4`).
- **What it does:** It sets a short, age-banded session made of 4-minute sets.
- **Evidence:**
  - bergeron2015 (10.1136/bjsports-2015-094962): "presented recommendations for developing healthy, resilient and capable youth athletes". IOC consensus.
  - difiori2018 (10.1007/s40279-018-0950-0): "an overemphasis on competitive success in youth sports may limit the benefits of participation, and could increase the risk of injury, burnout, and disengagement". NBA/USA Basketball expert review.
  - lee1988 (as M01).
  - R:donovan1999 (as M14).
- **Verdict:** **design choice.** Short distributed blocks are supported, and the numbers are reasoned.
- **Code vs evidence:** Consistent. Age load caps are documented but not enforced in code (P7).

## C. The stage checks: items, takes and counts (content/skill-stage-checks.js, skill-checks.js)

### M17. Answers held on the server; fixed-form sittings
- **Where:** `content/skill-stage-checks.js:7-12`; `content/chess-trainer.js:6-12` ("The page never sees a solution before the puzzle is over").
- **What it does:** Item sittings are served and graded on the server, and keys never reach the page before the sitting ends. Chess positions are computed or taken from Stockfish-verified pools.
- **Evidence:**
  - AERA Standards 2014 (as M09), on test security and score validity.
  - downing1997 (as M09).
  - haladyna2002 (10.1207/S15324818AME1503_5): "A taxonomy of 31 multiple-choice item-writing guidelines was validated through a logical process". Classroom-assessment item writing.
  - itc2015security (10.1080/15305058.2015.1111221): "The amount and severity of security threats have increased considerably over the past two decades, calling into question the validity of assessments". International Test Commission guidelines; they cover security while tests are developed and administered, including online delivery.
- **Verdict:** **design choice.** It follows assessment standards.
- **Code vs evidence:** Matches.

### M18. Mastery cuts of 80-95%
- **Where:** `content/skill-stage-checks.js:38-117`. Examples: CH0 95% of squares; CH1 18/20 and 13/15; PI0 9/10; PI2 aural 9/10; CH2-3 tactics 80%; BB1 rules 8/10 [R].
- **What it does:** A stage's items must be mastered at a high bar, not just passed.
- **Evidence:**
  - kulik1990 (10.3102/00346543060002265): "mastery learning programs have positive effects on the examination performance of students in colleges, high schools, and the upper grades in elementary schools". Meta-analysis of 108 evaluations.
  - bloom1984 (10.3102/0013189X013006004): "Formative tests (the same tests used with the conventional group) are given for feedback followed by corrective procedures and parallel formative tests". Mastery learning against tutoring.
  - guskey2007 (10.4219/jaa-2007-704): "Students for whom the instructional methods and amount of time are appropriate learn well". Review of Bloom's mastery learning.
  - gobet2007 (10.1037/0012-1649.43.1.159): "The slower player needed 8 times as much practice to reach master level than the faster player." Pop.: 104 Argentinian chess players. This is why pace must follow measured mastery rather than time.
- **Verdict:** **moderate.** Mastery learning is supported. The exact cut points are design choices.
- **Code vs evidence:** Matches.

### M19. Unannounced chess items
- **Where:**
  - `content/skill-stage-checks.js:44-55`: 10 of 15 positions mate in one and 5 do not; tactics have motifs not named;
  - `services/skill-checks.js:189-210`: the "no mate" option;
  - gaps noted in the code at `:50` and `:55`.
- **What it does:** The learner must decide whether a tactic exists, as in a game, rather than being told one does.
- **Evidence:**
  - rohrer2015 (10.1037/edu0000001): "Interleaved practice requires students to choose a strategy on the basis of the problem itself". Pop.: 126 seventh graders.
  - bilalic2008 (10.1016/j.cognition.2008.05.005): "the first idea that comes to mind, triggered by familiar features of a problem, prevents a better solution being found". Pop.: expert chess players, eye tracking.
  - vandermaas2005 (10.2307/30039042): "Incorporating response latencies in test scores is shown to lead to an increase in criterion validity, particularly for easy items." Pop.: active chess players, Amsterdam Chess Test.
  - burns2004 (10.1111/j.0956-7976.2004.00699.x): "up to 81% of variance in chess skill (measured by rating) was accounted for by how players performed". Pop.: blitz tournament archives. Recognising when a pattern applies drives skill.
- **Verdict:** **moderate.**
- **Code vs evidence:**
  - The mate-or-no-mate sitting is fully unannounced.
  - Partial gap: the CH2 and CH3 tactics sets still contain no "nothing to find" positions. The code says so at `:50` and `:55`, and every position in them has a winning move. See P12.
  - vandermaas2005 also supports using response times, which are not used for chess (P12 note).

### M20. Moves are played or typed, not picked from a menu
- **Where:** `content/skill-stage-checks.js:34` (`MOVE_PROMPT`); the item kind `move` in `services/skill-checks.js`.
- **What it does:** Chess answers are produced on the board (recall), not recognised in a list.
- **Evidence:**
  - R:rowland2014 (10.1037/a0037559): "initial recall tests yielding larger testing benefits than recognition tests". Meta-analysis.
  - vandermaas2005 (as M19). Choose-a-move tasks are a validated measure of chess skill.
  - R:roediger2006 (as M06).
- **Verdict:** **strong.**
- **Code vs evidence:** Matches.

### M21. The puzzle trainer: Glicko-2 rating and puzzle choice
- **Where:**
  - `content/chess-trainer.js:33` (`PUZZLE_RD 80`), `:46` (provisional when RD > 110), `:57-66` (`choose`: nearest to the target rating plus up to 120 points of random jitter, excluding the last 30 puzzles seen), `:89` (target = the learner's rating);
  - `content/chess-rating.js:13` (`TAU 0.5`), `:16` (start 1000 / 350 / 0.06).
- **What it does:** It rates the learner and serves puzzles near their own rating, so the expected success is about 50%.
- **Evidence:**
  - glickman1999 (10.1111/1467-9876.00159): "improves over the commonly used algorithm of Elo by incorporating the variability in parameter estimates". Pop.: chess and tennis ratings.
  - glickman2001 (10.1080/02664760120059219): "cognitive ability not only changes over time, but also can change abruptly". Glicko-2 volatility.
  - eggen2006 (10.1177/0146621606288890): "results in each individual answering about 50% of the items correctly". Pop.: computerised adaptive testing simulations. This is optimal for *measurement*, not necessarily for practice.
  - guadagnoli2004 (as M11).
  - pelanek2016 (10.1016/j.compedu.2016.03.017): title-level only (Elo in adaptive educational systems).
  - klinkenberg2011 (10.1016/j.compedu.2011.02.003): title-level only (Math Garden adaptive practice).
- **Verdict:** **mixed.** The rating model is well founded. The success target is contested: about 50% maximises information (eggen2006), while practice systems often aim higher for motivation (the challenge-point framework).
- **Code vs evidence:** Gap. `SKILL-CURRICULA.md:246` says the chess target is "expected score 0.75 (0.6 for calculation)". The code serves nearest-rating puzzles, which gives about 0.5. See P1.

### M22. The puzzle-rating stage cut
- **Where:** `content/skill-stage-checks.js:60-65` (CH4 1590, CH5 1790, RD ≤ 80, ≥ 10 rated puzzles [R]).
- **What it does:** It passes a stage on a rating that is high enough and certain enough.
- **Evidence:**
  - glickman1999 (as M21). RD is the rating's uncertainty.
  - vandermaas2005 (as M19). Puzzle-type tasks measure chess skill reliably.
  - burns2004 (as M19).
- **Verdict:** **design choice.** The cuts are [R].
- **Code vs evidence:** Consistent. The doc notes that puzzle ratings run above game ratings, which is why games are a separate metric (M24).

### M23. Play-outs against perfect defence
- **Where:** `content/skill-chess-sittings.js:33-50`. KQK: 5 positions, mate within 6 moves of the fastest. KRK: within 8, inside the 50-move rule. KPK: win 4 and hold 2. Lucena and Philidor are played against Stockfish. `services/skill-chess-sittings.js:9-16`.
- **What it does:** It proves technique against the strongest possible defence, not against a lenient bot.
- **Evidence:**
  - ash1990 (10.1177/001872089003200202): "the advantages of segmentation methods in part-task training". Pop.: adults, keyboard task. Endgames are taught as isolated part-tasks (the chess grades' "Backward Chaining" and "Play Against Perfect Defence" activities).
  - pinder2011 (10.1123/jsep.33.1.146): "to ensure functionality and action fidelity in training and learning environments". Representative learning design.
  - R:kornell2009 (as M12).
  - thompson1986 (10.3233/ICG-1986-9302) and bourzutschky2005 (10.1016/j.tcs.2005.09.043): title-level only (endgame tablebases).
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent. The slack values are [R].

### M24. Recorded rapid games against measured bots
- **Where:** `content/skill-chess-sittings.js:26` (15+10), `:35-52` (12 games per band; median hung pieces ≤ 1; score 0.4 or 0.5; performance rating 1250 or 1450). `services/skill-chess-sittings.js:17-23`: a blunder is a move that loses 20% or more of the winning chances.
- **What it does:** It measures play in real games, scored by the engine.
- **Evidence:**
  - regan2011 (10.1609/aaai.v25i1.7951): "formulas for representing playing strength at chess by the quality of moves played, rather than by the results of games". Pop.: large sets of human tournament games.
  - mcilroy2020 (10.1145/3394486.3403219): "predicts human moves at a much higher accuracy than existing engines". Maia, human-like bots.
  - charness2005 (as M15). Tournament play is a weaker *practice* predictor than study. That is a training finding; here games are used as a *measure*.
  - burns2004 (as M19).
  - guid2006 (10.3233/ICG-2006-29203): title-level only.
- **Verdict:** **moderate.**
- **Code vs evidence:** Consistent. Twelve games carry a large standard error, as SKILL-CURRICULA §1.4 notes. That is why the stages stay in shadow (M09).

### M25. CH0 foundations: star mazes at par, set-up from memory
- **Where:** `content/skill-chess-sittings.js:29-32`. 4 mazes, one per piece, 3 of 4 at the breadth-first-search par. All 32 pieces placed correctly.
- **What it does:** It proves that the beginner knows how each piece moves and what the board looks like.
- **Evidence:**
  - gobet1996 (10.1006/cogp.1996.0011): "chess players, like experts in other recall tasks, use long-term memory retrieval structures". Pop.: class A players to grandmasters.
  - gobet2007 (as M18).
  - guadagnoli2004 (as M11).
  - chase1973 (10.1016/0010-0285(73)90004-2): title-level only.
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent.

### M26. Calculation: type the whole line
- **Where:** `content/skill-chess-sittings.js:45-46` (CH4, 7 of 10).
- **What it does:** The learner types their moves and every reply without moving the pieces.
- **Evidence:**
  - burns2004 (as M19). Search explains the variance that recognition does not.
  - vandermaas2005 (as M19). Includes a predict-a-move task.
  - gobet1996 (as M25).
  - debruin2007 (10.1016/j.cedpsych.2006.01.001): title-level only (prediction plus self-explanation in chess endgames).
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent.

## D. Piano: score-following and the sittings (public/engine/piano, skill-piano-bb-sittings)

### M27. Score-informed scoring and the timing window
- **Where:** `public/engine/piano/piano-core.js:186-215` (alignment; tolerance `max(80 ms, 15% of a beat)`; rushing and dragging flags).
- **What it does:**
  - Played notes are aligned to the target.
  - Note accuracy and the share of on-beat notes are scored separately.
  - At 80 bpm the window is about ±112 ms.
- **Evidence:**
  - repp2005 (10.3758/BF03206433): "SMS is controlled jointly by two error correction processes (phase correction and period correction)". Review of tapping.
  - repp2013 (10.3758/s13423-012-0371-2): "Sensorimotor synchronization (SMS) is the coordination of rhythmic movement with an external rhythm". Review.
  - friberg1995 (10.1121/1.413218): "the relative jnd constant at 2.5% of the tone interonsets above 240 ms". Pop.: 30 listeners. Listeners hear far finer deviations than the window allows.
  - dannenberg2006 (10.1145/1145287.1145311): "By relating musical sound to musical notation, these systems generate tireless, expressive musical accompaniment to follow". Score following.
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent. The window is deliberately lenient for learners, and the evenness CV (M28) measures fine timing.

### M28. Scale evenness as a CV
- **Where:** `public/engine/piano/piano-core.js:217-229`: SD over mean of beat-normalised inter-onset gaps, needing at least 3 gaps. The cuts are PI3/PI4 0.12 (`content/skill-stage-checks.js:91-97`), PI5-7 0.09 and PI8-10 0.06 (`content/skill-piano-bb-sittings.js:46, 52`), all [R].
- **What it does:** It measures scale evenness with a number.
- **Evidence:**
  - jabusch2004 (10.1002/mds.10671): "Scale Analysis is an effective and precise tool for quantification of focal dystonia in pianists and provides fine resolution". Pop.: 16 professional pianists, MIDI scale analysis.
  - vanvugt2013 (10.3389/fpsyg.2013.00134): "even non-expressive playing of scales reveals consistent, partially effector-unspecific, but inaudible inter-individual differences". Pop.: professional pianists.
  - jabusch2009 (10.1016/j.humov.2008.08.001): "Expert pianists with an average daily practice time of 3.75h or more showed an improvement of performance in this selected motor skill." Pop.: 19 pianists over 27 months.
  - simmons2006 (as M02): "temporal evenness improved in the absence of practice 24 hours after training" (same abstract).
- **Verdict:** **moderate.** The measure is validated. The cut points are not normed.
- **Code vs evidence:** Consistent. The cuts need norms from learners.

### M29. Scales drawn at random
- **Where:** `content/skill-stage-checks.js:91-97`: PI3 and PI4 "Two of this grade's scales, chosen at random". The same holds for PI5-10 (`content/skill-piano-bb-sittings.js:46, 52`).
- **What it does:** The test samples the battery randomly, so learners cannot over-practise one scale.
- **Evidence:**
  - shea1979 (10.1037/0278-7393.5.2.179): "retention was greater following high interference (random) acquisition than after low interference (blocked) acquisition". Pop.: adults, three motor tasks.
  - brady2004 (10.2466/pms.99.1.116-126): "Significant differences were also obtained between the effect sizes for adults (.50) and those for younger learners (.10)." Meta-analysis, 61 studies.
  - abushanab2013 (as M02).
  - wulf2002 (10.3758/BF03196276): "situations with low processing demands benefit from practice conditions that increase the load and challenge the performer". Review, complex skills.
  - magill1990 (10.1016/0167-9457(90)90005-X): title-level only.
- **Verdict:** **moderate.** Random practice is robust in adults and weaker in children (brady2004).
- **Code vs evidence:** Matches for testing. Practice order for young children should ramp from blocked to random, as documented in SKILL-CURRICULA §5. The skill dose does not show that ramp, but it is low priority.

### M30. Sight-reading staircase with never-seen excerpts
- **Where:**
  - `content/piano-sight-reading.js:29-38`: SR1-SR7 levels, `STAGE_MINIMUM`, and a note that SR8-10 are listed but not generated;
  - `services/skill-piano-bb-sittings.js:59-62`: the excerpt hash;
  - `:104-108`: up to 30 tries for an unseen excerpt;
  - `content/skill-piano-bb-sittings.js:38-45`: 2 excerpts, each played once, 80% of the notes and 80% on the beat.
- **What it does:** Each sight-reading sitting is a new excerpt at the stage's level, drawn in notation.
- **Evidence:**
  - mishra2014a (10.1177/0305735612463770): "treatments categorized as “Aural Training,” “Controlled Reading,” “Creative Activities,” and “Singing/Solfege” significantly and positively affecting sightreading". Meta-analysis of 92 studies.
  - mishra2014b (10.1177/0022429413508585): "improvisational skills, ear-training ability, technical ability, and music knowledge correlating most closely with sight-reading". Meta-analysis.
  - kopiez2006 (10.1080/14613800600570785): "when sight reading stimuli is easy, general pianistic expertise is sufficient to be able to excel". Pop.: 52 piano students, 5 difficulty levels.
  - mcpherson1997 (10.2307/3345469): "Performing a repertoire of rehearsed music was found to be influenced most by an ability to sight-read". Pop.: 101 high-school wind players.
  - lehmann1996 (10.1037/h0094082): title-level only.
- **Verdict:** **moderate.**
- **Code vs evidence:** Matches for PI2-PI7. Gap: SR8-SR10 are not generated (`piano-sight-reading.js:23`), so PI8-10 have no sight-reading sitting.

### M31. Memory restarts from random bars
- **Where:** `services/skill-piano-bb-sittings.js:147-162`; `content/skill-piano-bb-sittings.js:48-49` (3 restarts of 2 bars each, nothing shown).
- **What it does:** It proves a memorised piece can be restarted anywhere, not just played from the top.
- **Evidence:**
  - chaffin2002 (10.1111/1467-9280.00462): "the pianist used the formal structure as a retrieval scheme and performance cues as retrieval cues". Concert pianist case study.
  - williamon2002 (10.1006/cogp.2001.0759): "This article explores the use of structure in the encoding and retrieval of music and its relation to level of skill." Pop.: 22 pianists at four skill levels.
  - chaffin2010 (10.1177/0305735608100377): "The cellist organized her practice around the musical structure, developed interpretation before working on technique and practised memory retrieval at each stage." Cellist case study.
- **Verdict:** **moderate.** Converging expert studies, mostly case studies.
- **Code vs evidence:** Partial. The bars are random, but the expert work points to *structural* cue points: section starts and performance cues. Restarting at phrase or section boundaries would match the evidence more closely. This is a minor point, not a proposal.

### M32. Dynamics from MIDI velocity
- **Where:** `public/engine/piano/piano-core.js:231-237` (MIDI only); `content/skill-piano-bb-sittings.js:50-51` (median f velocity at least 15 above median p, out of 127, plus 90% of the notes).
- **What it does:** It checks soft and loud contrast only where the input can measure it.
- **Evidence:**
  - jabusch2004 (as M28). Its method analysed "Key velocities and timing parameters" from MIDI.
  - goebl2001 (10.1121/1.1376133): "an emphasized voice (the melody) tends to be played not only louder than the other voices, but also about 30 ms earlier". Pop.: 22 skilled pianists on a computer-monitored grand.
  - lerch2020 (10.5334/tismir.53): "Different performances of the same composition may vary in terms of performance parameters such as timing or dynamics". Review of music performance analysis.
- **Verdict:** **design choice.** The 15-velocity margin has no study behind it.
- **Code vs evidence:** Consistent.

### M33. Legato pedalling from CC64
- **Where:** `content/skill-piano-bb-sittings.js:54-55` (90% of chord changes lifted within 0.15 s, 80% of chords right); `public/engine/piano/piano-core.js:1044`.
- **What it does:** It grades pedal changes against chord onsets, on MIDI only.
- **Evidence:**
  - repp1996 (10.1177/0305735696242011): "Pedal timing emerges as having a complex pattern that is sensitive to local and global tempo changes in varying degrees". Pop.: two pianists.
  - kong2021 (as M04). Pedal events can be detected, but audio remains imperfect, so MIDI only is right.
  - lerch2020 (as M32).
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent. Repp's tempo dependence suggests the 150 ms window may need to scale with tempo.

### M34. Musicality is never machine-graded
- **Where:** `public/engine/piano/piano-core.js:250` (`notMeasured: ['phrasing', 'tone', 'character', ...]`); `services/skill-gate.js:17-22` (recitals are attest-only).
- **What it does:** The app reports what it cannot measure and never scores interpretation.
- **Evidence:**
  - lerch2020 (as M32). Performance assessment is still a research field.
  - bergee1997 (10.2307/3345425): "Ranging from .23 to .93, total score faculty interjudge reliability was mixed." Even expert judges disagree.
  - vanvugt2013 (as M28). Timing signatures can be inaudible, so measurable is not the same as musical.
- **Verdict:** **moderate.**
- **Code vs evidence:** Matches.

### M35. The microphone pipeline
- **Where:**
  - `public/engine/piano/piano-core.js:45-108`: YIN with minHz 55, threshold 0.12 and minRms 0.01;
  - `:472-500`: the chord-ghost check and spectrum verifier;
  - `public/engine/piano/piano-song.js:18-22, 96-99`: the per-device latency measurement and "told which notes are due";
  - `content/skill-stage-checks.js:84-95`: lower mic note bars (0.93 or 0.95), and one hand at a time on a microphone.
- **What it does:** It hears single lines reliably. Chords are checked against the expected notes. Mic results are always labelled as estimates.
- **Evidence:**
  - decheveigne2002 (as M04).
  - emiya2010 (as M04).
  - kong2021 (as M04).
  - benetos2013: title-level only.
- **Verdict:** **strong.** Polyphonic audio is hard, and the design respects that.
- **Code vs evidence:** Matches. The YIN chord bug is documented in `SKILL-APPS-MECHANICS.md` §2.4.

### M36. Learn mode waits; play mode runs at tempo
- **Where:** `public/engine/piano/piano-song.js:11-13` (learn waits at each note; play has a count-in, and the app plays the other hand at full, ¾ or ½ speed), `:190`; `piano-core.js:396-430` (stars: 60% notes and 40% timing; 3 stars from 0.9; capped at 2 in learn mode or below 0.75 speed).
- **What it does:** First meetings with a piece are guided and nearly errorless. Full credit needs independent play in time.
- **Evidence:**
  - maxwell2001 (10.1080/713756014): "the reduction of errors during learning encourages the use of implicit, unselective learning processes, which confer insusceptibility to performance breakdown under distraction". Pop.: adults, golf putting.
  - duke2009 (as M11). The share of correct trials predicted next-day quality.
  - ash1990 (as M23).
  - fitts1954 (10.1037/h0055392): title-level only (speed-accuracy).
- **Verdict:** **moderate.**
- **Code vs evidence:** Matches. The tempo ladder and hotspot loop documented in `SKILL-CURRICULA.md` §4 are not built (P3).

### M37. Self-rate before the measurement
- **Where:** `public/engine/piano/piano-blocks.js:158-191` (`selfRate`; the report says whether the learner's rating matched the measurement); `services/block-levels.js:450`.
- **What it does:** The learner rates the take first, then sees notes, timing and evenness, and is told whether their own judgement matched.
- **Evidence:**
  - hewitt2001 (as M05). Self-evaluation helped *with* a model.
  - R:kruger1999 (as M05).
  - bergee1997 (as M05): "self-evaluation correlated poorly with both faculty and peer evaluation".
  - andrade2019 (as M05).
  - potdevin2018 (10.1080/17408989.2018.1485138): "This study highlights the potential relevance of using VFB in fostering motor learning, motivation and self-assessment during a PE programme with young children." Pop.: novice children, gymnastics.
- **Verdict:** **mixed.** Calibration practice is useful, but self-evaluation alone is poorly accurate. The gain in hewitt2001 came with a model to compare against.
- **Code vs evidence:** Partial. There is no model performance to listen to before rating. See P4, which covers piano too.

### M38. Ear items
- **Where:** `content/skill-stage-checks.js:74-75` (PI0 echo: 5 patterns, 4 of 5), `:82-83` (PI1: a 5-note tune within 3 tries), `:89-90` (PI2: major or minor, 9 of 10); `services/block-levels.js:465` (`Piano_EarEcho`).
- **What it does:** Playing by ear is a proved skill, not an optional extra.
- **Evidence:**
  - mcpherson2005 (10.1177/0305735605048012): "the importance of helping students to develop a repertoire of task-appropriate strategies". Pop.: 157 children aged 7-9, tested on five skills including playing by ear.
  - mcpherson1997 (10.2307/3345469): "an ability to improvise was most markedly influenced by an ability to play by ear" (same abstract as M30's quote).
  - woody2010 (10.1177/0022429410370785): "vernacular musicians required fewer trials than formal musicians". Pop.: 24 musicians, listen-then-perform cycles.
  - mishra2014b (as M30). Ear training correlates with sight-reading.
- **Verdict:** **moderate.**
- **Code vs evidence:** Matches.

### M39. Steady beat
- **Where:** `content/skill-stage-checks.js:72-73` (16 beats at 80 bpm, 75% on the beat).
- **What it does:** It is the first rhythm gate for ages 3-6.
- **Evidence:**
  - drake2000 (10.1016/S0010-0277(00)00106-2): "ability to synchronize tapping and discriminate tempo (improved attunement)". Developmental study.
  - provasi2003 (10.1080/01650250244000290): "children could slow down their tap rhythm when the auditory stimulation became slower". Pop.: children aged 2½-4.
  - repp2005 (as M27).
- **Verdict:** **design choice.** 75% is a lenient, age-appropriate bar.
- **Code vs evidence:** Consistent. Young children synchronise less precisely, and the wide window (M27) allows for that.

### M40. A piece learned alone
- **Where:** `content/skill-piano-bb-sittings.js:56-57` (a new 16-bar SR7 piece, kept 14 days, played cold).
- **What it does:** It proves independent learning: the strategy, not just the piece.
- **Evidence:**
  - mcpherson2005 (as M38).
  - hallam2012 (10.1177/0305735612443868): "use of recordings for listening and feedback and use of the metronome". Pop.: 3,325 young instrumentalists. Practice strategies develop with expertise.
  - duke2009 (as M11).
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent.

### M41. Two-day lessons
- **Where:**
  - `curriculum-build/SKILL-CURRICULA.md:187` (piano: "The day-2 cold take is the learning score"), `:225-227` (basketball day A and day B);
  - in code, the cold-sitting rule (M01, M02) for stage metrics;
  - FACT-REVERIFY §2 (B05:99 "Judge Shooting by the Next-Day Cold Set", confirmed against Shamshiri et al. 2025).
- **What it does:** The lesson's own score comes from a cold attempt on the next day, not from the end of the practice session.
- **Evidence:**
  - walker2002 (as M02).
  - simmons2006 (as M02).
  - abushanab2013 (as M02).
  - R:mazza2016 (as M02).
  - rickard2008 (as M02).
- **Verdict:** **mixed**, for the same reason as M02. The day-2 test is right; the sleep-gain rationale is contested and weaker for children.
- **Code vs evidence:** Partial. Stage metrics are enforced this way. The per-lesson day-2 cold take is in the lesson design (the "Spaced Recall" activity, M42), but no code makes the lesson's score the day-2 take. This is noted, not proposed: it belongs to the lesson engine, which is outside this section.

### M42. The nine-activity lesson ladder
- **Where:**
  - `content/basketball-grades.js:43-51`: Watch and Copy, then Play It Slowly, Game With Help, Game on Your Own, New Way to Play, Play With a Friend, Oops Fix It, Free Recall and Mixed Review, Spaced Recall;
  - `content/piano-grades.js:43`: for example Hands Separately, Hands Together Slowly, Section at Target Tempo, Join the Seams, Critique Your Take;
  - `content/chess-grades.js:43`: for example Solve With Hints, Solve on Your Own, Backward Chaining, Play Against Perfect Defence.
- **What it does:** Each lesson moves through:
  1. a model;
  2. guided practice;
  3. independent practice;
  4. variation;
  5. a peer;
  6. an error-fixing task;
  7. two retrieval activities.
- **Evidence:**
  - R:renkl2003 (as M15). Fading from examples to problems.
  - R:kalyuga2003 (10.1207/s15326985ep3801_4): "Instructional techniques that are highly effective with inexperienced learners can lose their effectiveness and even have negative consequences when used with more experienced learners." Review.
  - stemarie2012 (10.1080/1750984X.2012.665076): "practitioners should first assess the observer's characteristics and the task characteristics for which any observation intervention is being created". Review of observation in sport.
  - wulf2010 (10.1111/j.1365-2923.2009.03421.x): "Observation of others, particularly when it is combined with physical practice, can make important contributions to learning." Review.
  - R:kornell2009 (as M12). Errors and retrieval attempts.
  - R:rowland2014 (as M20).
  - R:cepeda2008 (as M06).
- **Verdict:** **strong** for each component.
- **Code vs evidence:** Matches. The ladder is fixed for every learner. Expertise reversal (kalyuga2003) argues for skipping the early rungs for learners who show mastery, which the general adaptation layer handles (section 03).

## E. Basketball: counts, scenes, tracking and the court (skill-checks, skill-piano-bb-sittings, public/engine/basketball)

### M43. Beta-posterior make-rate gates
- **Where:** `services/skill-checks.js:94-104` (`rateAtLeast`: exact P(p ≥ bar) under a uniform Beta(1,1) prior); `content/skill-stage-checks.js:111-124`. Examples:
  - BB1 lay-ups: P(rate ≥ 0.5) ≥ 0.9 with n ≥ 10 per hand;
  - BB2 form shots: ≥ 0.6 at confidence 0.8 with n ≥ 20;
  - BB3 free throws: ≥ 0.5 at 0.8 with n ≥ 20;
  - BB4-5 free throws: ≥ 0.65 at 0.8 with n ≥ 50 (`content/skill-piano-bb-sittings.js:73-74`).
- **What it does:** A shooting gate passes on the probability that the learner's true rate clears the bar, not on one lucky set.
- **Evidence:**
  - brown2001 (as M03).
  - agresti1998 (10.1080/00031305.1998.10480550): "yields coverage probabilities close to nominal confidence levels, even for very small sample sizes". Binomial intervals.
  - gelman2013 (as M03).
  - hopkins2000 (as M03).
- **Verdict:** **strong**, as a method.
- **Code vs evidence:** Matches. The bars are [R]. FACT-REVERIFY §3.2 confirms the FIBA free-throw line: "It shall have its furthest edge 5.80 m from the inner edge of the endline" (FIBA *Official Basketball Rules 2026 v1.1*, Art. 2.5.3, https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-1.pdf). Brown recommends the Jeffreys prior for small n; the uniform prior used here differs very little at n ≥ 10.

### M44. Shooting by zone
- **Where:** `services/skill-piano-bb-sittings.js:288-316`: per-zone Beta rule, an 80% interval shown, every zone needing `min_n` shots. `content/skill-piano-bb-sittings.js:71-76`:
  - BB4-5: 5 zones, ≥ 17 shots each, mid-range 45% or three 33% [R];
  - BB6-7: ≥ 25 each, 50% or 36% [R].
- **What it does:** It builds a shooting profile with honest uncertainty for each zone.
- **Evidence:**
  - brown2001 (as M03).
  - kubatko2007 (10.2202/1559-0410.1070): "The possession concept, in particular the concept of equal possessions for opponents in a game, is central to basketball analysis." Basketball analytics.
  - hopkins2000 (as M03).
  - R:gilovich1985 (10.1016/0010-0285(85)90010-6): title-level only (people misread random shooting streaks).
- **Verdict:** **design choice.** The method is sound and the marks are [R].
- **Code vs evidence:** Consistent. At n = 17 a zone's 80% interval is still wide (about ±15 points), so the gate is deliberately cautious. The code shows the interval, as the evidence suggests it should.

### M45. Own baseline, never a ranking
- **Where:**
  - `services/skill-checks.js:774-806`: baseline and growth rules; the first count sets the baseline;
  - `content/skill-stage-checks.js:105-106`: BB0 catch and bounce, against the learner's own baseline;
  - `:125-126`: Mikan drill, 20% growth;
  - `SKILL-CURRICULA.md` §2 rule 7.
- **What it does:** Children's athletic numbers are compared only with their own past numbers.
- **Evidence:**
  - cobley2009 (10.2165/00007256-200939030-00005): "Annual age-grouping is a common organizational strategy in sport. However, such a strategy appears to promote relative age effects (RAEs)." Meta-analysis of 38 studies.
  - lloyd2012 (10.1519/SSC.0b013e31825760ea): "PREVIOUS LONG-TERM ATHLETE DEVELOPMENT MODELS HAVE CLASSIFIED YOUTH-BASED TRAINING METHODOLOGIES IN RELATION TO CHRONOLOGIC AGE GROUPS, AN APPROACH THAT HAS DISTINCT LIMITATIONS". Youth physical development model.
  - difiori2018 (as M16).
  - crane2015 (10.1177/1356336X14555294): "five major areas emerged: lack of enjoyment, perceptions of competence, social pressures, competing priorities and physical factors (maturation and injuries)". Systematic review of 43 studies on youth sport dropout.
- **Verdict:** **moderate.**
- **Code vs evidence:** Matches.

### M46. Decision scenes
- **Where:**
  - `content/skill-piano-bb-sittings.js:60-70`: BB1 2v1, 8 of 10; BB2 3v3, 12 of 15; BB3 4v4, each shown twice, 15 of 18, response times recorded but not gated; BB4-7 at 80%;
  - `content/basketball-scenes.js:26`: "Defence and live decisions are never machine-graded";
  - `:161-170`: the key is re-derived from the players' positions, for example the shot-clock rules in late-clock scenes.
- **What it does:** It trains and tests reads, meaning which option is right, on drawn plays paused at the moment of decision.
- **Evidence:**
  - rosch2021 (as M10): "response time discriminated within the elite athletes’ performance data but not between performance levels" (same abstract).
  - mann2007 (10.1123/jsep.29.4.457): "experts are better than nonexperts in picking up perceptual cues, as revealed by measures of response accuracy and response time". Meta-analysis, 42 studies.
  - zhu2024 (10.3390/bs14100919): "its transfer effect on real-game performance improvement (ES = 0.65) was inferior to laboratory performance improvement (ES = 1.51)". Meta-analysis, 22 studies, team sports.
  - broadbent2015 (10.1080/17461391.2014.957727): "The main aim of any training intervention should be the efficacy of retention and transfer of learning from training to field situations". Review.
  - hadlow2018 (10.1016/j.jsams.2018.01.011): "Modified perceptual training (MPT) collectively describes on- or off-field sports training tasks that are specifically designed to develop visual and perceptual-cognitive skill." Framework.
  - abadrobles2020 (10.3390/ijerph17020505): "they did not show significant improvements in skill execution". Meta-analysis of game-based teaching, which did improve decision making.
  - harvey2014 (10.1080/17408989.2012.754005): "development of decision-making skills and effective decision-makers". Review of game-centred approaches.
- **Verdict:** **moderate.** Decision training transfers, but at about half the lab effect. Drawn top-down scenes are less representative than first-person video.
- **Code vs evidence:** Partial:
  - The scenes are drawn from above, not first-person (the code admits this gap at `:65`).
  - Response time is recorded and not used.
  - Reliability is not yet measured (M10).
  - See P5 and P10.

### M47. Applied tasks: box scores and rules
- **Where:** `services/skill-piano-bb-sittings.js:240-258` (number keys with a tolerance of 0.051); `content/skill-piano-bb-sittings.js:77-79` (BB8-12: 8 stats items and 2 rules items, 8 of 10); `public/engine/basketball/tracking.js:489-490` (eFG% in the shot log); `content/skill-stage-checks.js:116-117` (BB1 rules).
- **What it does:** It checks the parts of advanced basketball knowledge that a machine can verify.
- **Evidence:**
  - kubatko2007 (as M44). eFG%, TS%, possessions and ratings come from its framework.
  - FIBA *Official Basketball Rules 2026 v1.1* (official URL as M43). FACT-REVERIFY §2 confirmed the B06 rules items: the 14-second reset (Art. 29), the 1.25 m no-charge semicircle (Art. 2.5.7) and the injury allowance of about 15 seconds (Art. 5.3).
  - rohrer2015 (as M19). Mixed problem types.
  - bangert1991 (10.3102/00346543061002213): "Feedback effects were found to vary with control for presearch availability, type of feedback, use of pretests, and type of instruction". Meta-analysis of 58 effect sizes.
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent. The scouting report and game plan are honestly left to a person (`:78`).

### M48. Camera tracking on the device; the learner confirms
- **Where:**
  - `public/engine/basketball/pose.js:1-26`: MediaPipe Pose Landmarker lite, served locally, up to 2 bodies, detection confidence 0.5, GPU with a CPU fallback;
  - `tracking.js:100-130`: homography from the learner's floor taps, which refuses collinear taps;
  - `tracking.js:404-449`: the rim-crossing make or miss;
  - `camera-blocks.js:5-11, 33`: results are marked estimated, the learner fixes them, and there is a manual tap fallback;
  - `content/skill-stage-checks.js:20-23`: a camera count counts only once confirmed.
- **What it does:** The phone counts shots and places them on the court. The count is an estimate the learner checks, and no picture leaves the device.
- **Evidence:**
  - cao2021 (10.1109/TPAMI.2019.2929257): "the first open-source realtime system for multi-person 2D pose detection, including body, foot, hand, and facial keypoints". OpenPose.
  - stenum2021 (as M04). Joint-angle errors of 4-7°.
  - washabaugh2022 (as M04).
  - hartley2004 (10.1017/CBO9780511811685): "Techniques for solving this problem are taken from projective geometry and photogrammetry." Textbook (Cambridge UP), the basis of the floor homography.
- **Verdict:** **moderate.** Pose accuracy is known for gait. Make/miss from a phone is unvalidated, as `SKILL-CURRICULA.md` §1.3 notes.
- **Code vs evidence:** Matches the honesty rule. Validation is missing (P6).

### M49. Film it, rate it
- **Where:** `public/engine/basketball/basketball-blocks.js:212-323`:
  - the clip stays on the device;
  - "Watch your clip at least twice: once for the whole, once for one detail";
  - a Good / OK / Needs work rubric;
  - "Your one focus for the next three sessions ... close in first, then from your normal spots, then with a defender; film again after".
- `services/block-levels.js:342-355`: the rubric has 2-4 criteria "in external-cue words".
- **What it does:** It runs a closed loop of film, review, rating, a single focus, practice, and filming again.
- **Evidence:**
  - potdevin2018 (as M37).
  - modinger2022 (10.1007/s12662-021-00782-y): "Video-based visual feedback seems to be effective to enhance motor learning in physical education and seems to be more effective than solely verbal feedback." Systematic review of 11 studies.
  - stemarie2012 (as M42).
  - hewitt2001 (as M05).
  - wulf2010 (as M42).
- **Verdict:** **moderate.**
- **Code vs evidence:** Partial. The reviews' strongest effects come with expert models or anchors next to self-modelling (modinger2022, hewitt2001). There is no model or anchor clip yet. BB3's "rated against anchor clips" in `SKILL-CURRICULA.md` §5 is not built. See P4. The progression from close-in to defender matches the constraints literature (M52).

### M50. One external cue per drill
- **Where:**
  - `services/block-levels.js:377`: each drill requires a `cue`;
  - `:409`: "One external cue";
  - `:351`: the rubric "in external-cue words";
  - `content/basketball-grades.js:6171`: the lesson "External Focus Cues: Aim at the Target";
  - FACT-REVERIFY §2: B07 corrected to "the back of the ring, not your elbow".
- **What it does:** Every drill names one cue about the movement's effect, never the body.
- **Evidence:**
  - chua2021 (10.1037/bul0000335): "an external focus is superior to an internal focus whether considering tests of motor performance or learning". Meta-analysis, 73 and 40 studies.
  - wulf2013 (10.1080/1750984X.2012.723728): "an external focus (i.e., on the movement effect) enhances motor performance and learning relative to an internal focus (i.e., on body movements)". Review of 15 years.
  - wulf2016 (10.3758/s13423-015-0999-9): "We speculate that enhanced expectancies and an external focus propel performers' cognitive and motor systems in productive "forward" directions". OPTIMAL theory.
  - tran2008 (10.1080/02640410802004948): "should aim the ball towards the back of the ring, and should launch the ball at 52 degrees". Simulated free throws.
- **Verdict:** **strong.**
- **Code vs evidence:** Matches. FACT-REVERIFY fixed the two lines that had the aim point wrong.

### M51. Court session: health check, warm-up first, pain and enjoyment logged
- **Where:** `services/block-levels.js:368-380` ("a health check, the warm-up always first, timed drills with one cue each, then effort, pain and enjoyment, logged"); `content/skill-stage-checks.js:109-110` (BB0 safety: 4 of 4).
- **What it does:** It puts safety and enjoyment into every court session.
- **Evidence:**
  - soligard2008 (10.1136/bmj.a2469): "This indicates that a structured warm-up programme can prevent injuries in young female football players." Cluster RCT with 1,892 players aged 13-17.
  - longo2012 (10.1177/0363546512438761): "The FIFA 11+ warm-up program is effective in reducing the rates of injuries in elite male basketball players." RCT.
  - emery2015 (10.1136/bjsports-2015-094639): "There is evidence for the effectiveness of neuromuscular training strategies in the reduction of injury in numerous team sports." Meta-analysis, youth.
  - difiori2014 (10.1097/JSM.0000000000000060): "Such an excessive focus on early intensive training and competition at young ages rather than skill development can lead to overuse injury and burnout." AMSSM position statement.
  - crane2015 (as M45). Lack of enjoyment drives dropout.
  - bergeron2015 (as M16).
- **Verdict:** **strong.**
- **Code vs evidence:** Partial. The warm-up content is free text, up to 6 items of 20-300 s each. The trials used *structured neuromuscular* programmes such as the 11+. See P11.

### M52. Handle and react; eyes-up dribbling
- **Where:** `services/block-levels.js:397-410` (a health check first; targets wait 3 s at the steady pace and 1.8 s at the quick pace; touch them with the free hand while dribbling); `content/skill-stage-checks.js:113-114` (call out a held-up number while dribbling; weak hand at least 70% of the strong hand).
- **What it does:** It practises ball handling under a perceptual load, as in games.
- **Evidence:**
  - mann2007 (as M46).
  - renshaw2010 (10.1080/17408980902791586): "physical educators could use task, performer and environmental constraints to channel acquisition of movement skills and decision-making behaviours in learners". Constraints-led approach.
  - pinder2011 (as M23).
  - broadbent2015 (as M46).
- **Verdict:** **design choice.** The principle is supported. The timings and the 0.7 ratio are reasoned values.
- **Code vs evidence:** Consistent.

## F. Learning games (game-lab, game-payloads, GAME_HOLDS)

### M53. Serving holds
- **Where:** `services/game-payloads.js:43-83`; `content/game-holds.json` (70 levels, the English Proficient sets the 2026-10-23 audit found wrong). A held level is not served, not regenerated and not answered, and opens as an ordinary session. It is released only by a `verified_replacement` that two blind judges kept. `GAME_HOLDS=off` lifts the holds.
- **What it does:** It keeps questions known to be faulty away from learners.
- **Evidence:**
  - downing2005 (10.1007/s10459-004-4019-5): "flawed multiple-choice test items, which violate well established and evidence-based principles of effective item writing, disadvantage some medical students". Pop.: medical students, 4 exams.
  - tarrant2008 (10.1111/j.1365-2923.2007.02957.x): "47.3% of all items were flawed." Pop.: nursing exams, 10 papers.
  - haladyna2002 (as M17).
  - downing1997 (as M09).
- **Verdict:** **moderate.**
- **Code vs evidence:** Matches.

### M54. Payload inspection, including the explanation on every question
- **Where:** `services/game-payloads.js:160-198`. Each question must have:
  - a prompt and an explanation;
  - exactly the expected number of choices, with no duplicates;
  - an answer index in range;
  - no markup;
  - a difficulty from 1 to 10;
  - no answer identifiable by its length.
- Across the set, no answer slot may hold more than 75% of keys once 6 or more are answered. `services/game-lab.js:14-19` rotates answer slots.
- **What it does:** It rejects sets with item-writing flaws and makes every answer carry a one-sentence why.
- **Evidence:**
  - haladyna2002 (as M17).
  - haladyna1989 (10.1207/s15324818ame0201_4): "for nearly one half the rules, no research was found". This is a caution that some item rules are convention.
  - attali2003 (10.1111/j.1745-3984.2003.tb01099.x): "questions with middle correct answers are easier and less discriminating than questions with extreme correct answers". Pop.: test takers and test makers.
  - millman1965 (10.1177/001316446502500304): title-level only (test-wiseness, length cues).
  - hattie2007 (10.3102/003465430298487): "the type of feedback and the way it is given can be differentially effective". Review.
  - wisniewski2020 (10.3389/fpsyg.2019.03087): "feedback has higher impact on cognitive and motor skills outcomes than on motivational and behavioral outcomes". Meta-analysis, 435 studies.
  - shute2008 (10.3102/0034654307313795): "formative feedback should be nonevaluative, supportive, timely, and specific". Review.
  - bangert1991 (as M47).
- **Verdict:** **strong.** Item-writing guidance and feedback both rest on reviews and meta-analyses.
- **Code vs evidence:** Matches.

### M55. The explanation-key gate
- **Where:** `services/game-payloads.js:509-519` (`KEY_GATE=on`). A question whose explanation describes another option is re-keyed blind. If the blind check does not confirm it, it is rewritten once and checked again. If it still fails, the set is not stored as clean.
- **What it does:** It catches mismatches between key and explanation.
- **Evidence:**
  - downing1997 (as M09). Quality-assurance review of items.
  - haladyna2002 (as M17).
  - tarrant2008 (as M53).
- **Verdict:** **design choice.**
- **Code vs evidence:** Consistent.

### M56. evenOrder
- **Where:** `services/game-payloads.js:202-244`: questions are grouped by difficulty, each group is shuffled, and groups are dealt in proportion with a seeded order. Tailored plans may instead set a "confidence first then climb" curve (`:607`).
- **What it does:** It makes every stretch of a game mix the set's difficulties, so no sitting is all easy or all hard.
- **Evidence:**
  - leary1985 (10.3102/00346543055003387): "The literature has produced evidence of context effects, but has not demonstrated that the effects are so strong as to invalidate test theory". Review of item order.
  - brunmair2019 (10.1037/bul0000209): "interleaving can effectively foster inductive learning but that the setting and the type of learning material must be considered". Meta-analysis.
  - eggen2006 (as M21).
  - R:hamari2016 (10.1016/j.chb.2015.07.045) and engeser2008 (10.1007/s11031-008-9102-4): title-level only (challenge and flow).
- **Verdict:** **mixed.** Order effects are small but real. Evidence on rising versus mixed difficulty for motivation is not settled.
- **Code vs evidence:** Consistent. It is a reasonable default with a tailored override.

### M57. Games practise what the last lesson taught
- **Where:** `services/game-payloads.js:543-558` (`taughtFor`: "the questions practise these points, spread across all of them").
- **What it does:** A level's game is retrieval practice on the lesson it follows.
- **Evidence:**
  - R:roediger2006 (as M06).
  - R:agarwal2021 (10.1007/s10648-021-09595-9): "the majority of which (57%) revealed medium or large benefits from retrieval practice". Review of 50 classroom experiments.
  - R:rowland2014 (as M20).
  - biggs1996 (10.1007/BF00138871): title-level only (constructive alignment).
- **Verdict:** **strong.**
- **Code vs evidence:** Matches.

### M58. Tailored games with a holdout arm; games as practice
- **Where:** `services/game-payloads.js:651-676`. The tailored set is planned from the profile, and `armFor` returns `holdout` for a control group, which gets the shared set. `services/game-lab.js` serves the preview lab.
- **What it does:** It personalises games and measures whether personalising helps.
- **Evidence:**
  - wouters2013 (10.1037/a0031311): "serious games were found to be more effective in terms of learning (d= 0.29, p <.01) and retention (d = 0.36, p <.01)". Meta-analysis, k = 77.
  - clark2016 (10.3102/0034654315582065): "the results highlight the affordances of games for learning as well as the key role of design beyond medium". Meta-analysis, K-16.
  - R:sailer2020 (10.1007/s10648-019-09498-w): "the effect of gamification on cognitive learning outcomes was stable in a subsplit analysis of studies employing high methodological rigor". Meta-analysis.
  - kohavi2009 (as M09).
- **Verdict:** **moderate.** Games help modestly. Whether tailoring helps is exactly what the holdout tests.
- **Code vs evidence:** Matches.

---

## Proposals (each has 3+ quoted sources)

The proposals below don't change any stage rule. They are listed in priority order. **Status 2026-10-25 (implementer E):** the "Status" column and each proposal's first bullet. Flags, tests and rollback: `curriculum-build/LIVE-CHANGES-2026-10-24.md`, section "Skill tracks: P1, P2, P3, P5, P7, P9, P12 (implementer E)".

| # | Proposal | Priority | Status |
|---|---|---|---|
| P1 | Serve puzzles at the documented 0.75 expected score in practice | high | BUILT (flag `CHESS_PRACTICE_TARGET`) |
| P2 | Reduced, bandwidth and on-request feedback on piano takes | medium | BUILT (flag `PIANO_FEEDBACK_FADE`) |
| P3 | Build the tempo ladder and the hotspot loop | medium | BUILT (flags `PIANO_TEMPO_LADDER`, `PIANO_HOTSPOT_LOOP`) |
| P4 | Model and anchor clips for film-it and self-rating | high | SKIPPED: needs media |
| P5 | Compute split-half reliability of scene sets and gate on it automatically | high | BUILT (flag `SCENE_RELIABILITY_GATE`); BB1-BB7 stay in shadow until real data meets 0.8 |
| P6 | Validate camera make/miss and pose per device before trusting counts | medium | SKIPPED: needs data |
| P7 | Enforce youth load caps and rest days in the dose | high | BUILT (flag `SKILL_LOAD_CAPS`) |
| P8 | Run carry-over maintenance as an experiment instead of leaving it off | medium | SKIPPED: needs data |
| P9 | Describe the two-day rule as a delayed test, not a sleep gain, for children | low (text) | BUILT (flag `SKILL_TWO_DAY_TEXT`) |
| P10 | First-person decision scenes and response-time bands | low (cost) | SKIPPED: needs media and data |
| P11 | A structured neuromuscular warm-up template | medium | SKIPPED: exercise content not sourced |
| P12 | Add "nothing to find" positions to the CH2/CH3 tactics sets | medium | BUILT (flag `CHESS_NOTHING_TO_FIND`) |

### P1. Serve practice puzzles at the 0.75 expected score the curriculum names
- **Status: BUILT (flag `CHESS_PRACTICE_TARGET`, default on; `=0.6` or any 0.5-0.95 sets another score).** `content/chess-trainer.js` `practiceTarget`: rated puzzles aim 400·log10(E/(1-E)) points below the learner (191 for 0.75), by the Elo expectation. The rating update is unchanged. While a stage check's rated-puzzle sitting is open (CH4/CH5 `tactics_rating`), and for the owner, the target stays at the rating. Tests: `scripts/chess-trainer-test.js` (8 checks). The 0.6 calculation score has no puzzle set to apply to yet (CH4 calculation is `not_wired`).
- **Gap:** M21. `SKILL-CURRICULA.md:246` says 0.75, but `content/chess-trainer.js:89` targets the learner's own rating, which gives about 0.5.
- **Sources:**
  - eggen2006: "results in each individual answering about 50% of the items correctly". 50% is the *measurement* optimum, and the paper shows how to shift the target easier.
  - guadagnoli2004 (as M11).
  - wulf2016 (as M50). Expectancy of success.
  - klinkenberg2011 and pelanek2016: title-level only.
- **Expected effect:** More successful practice and better persistence for weaker learners. The rated mode keeps its information.
- **Risk:** The rating converges more slowly, because easier items carry less information. Mitigation: shift only in practice mode, and keep stage-check sittings at the nearest rating.
- **Files:** `content/chess-trainer.js` (`choose`, line 89: target = rating − offset from `chess-rating.solveChance`), `content/chess-rating.js` (inverse of `solveChance`).

### P2. Reduced, bandwidth and on-request feedback on piano takes
- **Status: BUILT (flag `PIANO_FEEDBACK_FADE`, default on), on warm practice takes.** After 2 clean warm takes in a row on a metric (`practice_streak`), a take's result flags only what is outside the bar (`piano-core.outsideBar`); "Show all the numbers" shows the rest on request (`public/js/skill-kit.js`). A miss resets the streak, so full feedback returns. Cold stage takes always get the full result. Not built: the fade inside lesson blocks (`piano-blocks.js` has no server flag to read, and its schema is in `services/block-levels.js`). Tests: `scripts/piano-items-test.js`, `scripts/skills-r3-piano-bb-test.js`.
- **Gap:** M36 and M37. `SKILL-CURRICULA.md` §4 documents fading (real-time, then end-of-take, then bandwidth, then self-rate first). The piano engine always shows full real-time highlights in learn mode and a full report after play.
- **Sources:**
  - sherwood1988 (10.2466/pms.1988.66.2.535): "giving KR about a relatively large bandwidth enhances movement consistency". Pop.: adults, timed elbow flexion.
  - wulf2010: "including feedback and model demonstrations controlled by the learner, has been found to be more effective than externally controlled practice conditions".
  - wulf2002 (as M29). Complex skills may need more support at first, so fade rather than remove.
  - salmoni1984 and winstein1990: title-level only (the guidance hypothesis; reduced feedback frequency).
- **Expected effect:** Better retention on day-2 takes. Less dependence on the falling-note display.
- **Risk:** Beginners get frustrated. Mitigation: fade only after 2 clean takes, and keep it learner-requestable.
- **Files:** `public/engine/piano/piano-song.js` (highlight modes), `public/engine/piano/piano-blocks.js` (`report`: a bandwidth filter on `offBeatNotes` and `wrong`), `services/block-levels.js` (`Piano_PlayAlong` schema: a `feedback` field).

### P3. Build the tempo ladder and the hotspot loop
- **Status: BUILT (flags `PIANO_TEMPO_LADDER` and `PIANO_HOTSPOT_LOOP`, default on), on warm practice sets.** `piano-core.js` has the pure rules: `tempoLadder` (start at 65%, +10% after 2 clean takes, -10% after 2 misses, between 60% and 100%), `barErrors`, `hotspot` (the worst bar plus its worse neighbour), `sliceBars`. `services/skill-dose.js` applies them. A warm set below the target tempo, or a loop set, never counts as "at target", so warm sets only call a cold test at full speed. A library piece that misses gets its worst 1-2 bars looped at 65% in the next set, and the set after rejoins the whole piece. Cold stage takes stay at the target tempo. Tests: `scripts/piano-items-test.js` (13 checks), `scripts/skills-r3-piano-bb-test.js` (13 checks).
- **Gap:** M36. Documented in `SKILL-CURRICULA.md` §4 ("Start at 60-70% of target. Step up 10% after 2 clean takes"; "The worst 1-2 bars loop at 65%") but not in code. The speed control is a fixed set: ½, ¾ or full.
- **Sources:**
  - duke2009 (as M11). Error handling and the share of correct trials predict retention.
  - ash1990 (as M23). Segmentation beats whole-task practice.
  - chaffin2010 (as M31): "The cellist repeatedly took the piece apart section-by-section and then re-integrated the sections".
  - williamon2002 (as M31).
  - fitts1954: title-level only.
- **Expected effect:** More correct trials per minute on the hard bars, and a better next-day take.
- **Risk:** Learners stay at low tempo. Mitigation: the ladder only steps up, and the cold take stays at target.
- **Files:** `public/engine/piano/piano-song.js` (speed state, a loop of the bars with the most `offBeatNotes`/`wrong`), `public/engine/piano/piano-core.js` (per-bar error summary), `services/skill-dose.js` (warm-set tempo).

### P4. Model and anchor clips for film-it and for piano self-rating
- **Status: SKIPPED: needs media.** No model or anchor clips exist, and making them needs licensing and consent, or drawn animations. Revisit when clips are produced.
- **Gap:** M37 and M49. Self-rating has no reference. BB3's "rated against anchor clips" is not built.
- **Sources:**
  - hewitt2001 (as M05). Self-evaluation helped only with a model.
  - modinger2022 (as M49). Covers expert modelling and self-modelling.
  - stemarie2012 (as M42).
  - bergee1997 (as M05). Unanchored self-ratings correlate poorly.
- **Expected effect:** Better calibrated self-ratings and larger technique gains from the film loop.
- **Risk:**
  - Licensing and consent for basketball clips. Drawn or animated anchors would avoid this.
  - Storage, since clips stay on the device.
- **Files:** `public/engine/basketball/basketball-blocks.js` (`renderFilm`: an anchor pane before rating), `services/block-levels.js` (the `Basketball_Film` and `Piano_PlayAlong` schemas: `anchor` and `model` fields), `public/engine/piano/piano-blocks.js` (`selfRate`: play the model first).

### P5. Compute split-half reliability of scene sets and gate on it automatically
- **Status: BUILT (flag `SCENE_RELIABILITY_GATE`, default on).** `services/skill-checks.js` now keeps each scene item's mark on the sitting (`detail.marks`). `services/skill-scene-reliability.js` computes the odd/even split-half from each learner's first scene sitting, steps it up with Spearman-Brown, and asks for at least 0.8 on at least 100 learners. In `services/skill-gate.js`, BB1-BB3 leave the hand-kept shadow list. Any stage with scene sets stays in shadow until every set meets the bar, so **BB1-BB7 stay in shadow today** (BB4-5 and BB6-7 also stay listed for their [R] zone marks). Report: `node services/skill-scene-reliability.js`. Tests: `scripts/skills-r3-piano-bb-test.js` (8 checks).
- **Gap:** M10. The 0.8 bar exists only in comments, and BB1-BB7 are held in shadow by a hand-kept list.
- **Sources:**
  - cortina1993 (as M10).
  - hopkins2000 (as M03).
  - rosch2021 (as M10).
  - AERA Standards 2014.
- **Expected effect:** The basketball stages leave shadow when, and only when, their sets prove reliable.
- **Risk:** Before 100 learners the estimates are noisy. Require the 100 learners the progression names.
- **Files:** new `scripts/scene-reliability.js` (split-half with the Spearman-Brown correction over `skill_records` sittings), `services/skill-gate.js` (`forcedShadow` reads the computed result), `content/basketball-scenes.js` (scene ids stable across sittings).

### P6. Validate camera make/miss and pose against hand logs, per device
- **Status: SKIPPED: needs data.** It needs paired hand-tapped and camera counts from real learners on each device.
- **Gap:** M48. Make/miss is unvalidated. Every camera count needs the learner to confirm it.
- **Sources:**
  - washabaugh2022 (as M04).
  - stenum2021 (as M04).
  - cao2021 (as M48).
  - hopkins2000 (as M03): agreement and typical error.
- **Expected effect:** A measured error rate for each device and set-up. With good agreement, confirmation becomes a light check rather than a recount.
- **Risk:** Privacy. Only counts are compared, never frames, which keeps the current rule.
- **Files:** `public/engine/basketball/camera-blocks.js` (paired hand-tap and camera log), `public/engine/basketball/tracking.js` (agreement statistics), `services/skill-checks.js` (store agreement with the count).

### P7. Enforce youth load caps and rest days in the dose
- **Status: BUILT (flag `SKILL_LOAD_CAPS`, default on), basketball only.** `services/skill-dose.js` applies the NBA and USA Basketball caps by age, taken from the age screen's month and year of birth: 3/5/10/14 hours a week and 2/2/1/1 rest days for ages 7-8 (and younger), 9-11, 12-14 and high school. Adults, and accounts with no age answer, get no cap. The week is the 7 UTC days ending today. Court minutes are the logged sets plus the cold sittings; screen sets (scenes, rules) do not count. Over the week's limit, court work is cut: spare sets first, then practice down to one set each, then sittings. On a rest day there is no court work. Court sets (`/log`) and court counts (`skill-checks.count`) are refused on a rest day or once the week is used. The plan page and the path say why. **Hook for the lesson engine:** court sessions in `services/sessions.js` can add their minutes with `skillDose.logLoad(userId, 'basketball', minutes)`. Tests: `scripts/skills-r3-dose-test.js` (11 checks).
- **Gap:** M16 and M51. `SKILL-CURRICULA.md` §5 lists caps by age: 3 / 5 / 10 / 14 hours a week and 2 / 2 / 1 / 1 rest days. No service enforces them. `skill-dose.js` sizes a session but does not cap the week.
- **Sources:**
  - difiori2014 (as M51).
  - difiori2018 (as M16).
  - bergeron2015 (as M16).
  - lloyd2012 (as M45).
- **Expected effect:** Lower risk of overuse injury and burnout.
- **Risk:** Some motivated learners are held back. That is intended. A parent can see the cap.
- **Files:** `services/skill-dose.js` (weekly minutes from `skill_records` and court logs), `services/skill-adaptation.js` (`planSession` takes `weekLeft`), `content/skill-progressions/basketball.json` (caps by age band).

### P8. Run carry-over maintenance as an experiment
- **Status: SKIPPED: needs data.** An arm only means something with real learners' retention sittings. The arm assignment would also go in `services/personalize.js`, which is outside this section's files.
- **Gap:** M14. `CARRY_DAYS 0` rests on a simulation without spacing. The motor-spacing literature points the other way.
- **Sources:**
  - lee1988 (as M01).
  - R:donovan1999 (as M14).
  - arthur1998 (as M06).
  - kim2013 (as M08).
  - kohavi2009 (as M09).
- **Expected effect:** If spacing helps here, better retention of earlier stages' skills when retested.
- **Risk:** Spends session minutes, as the round-3 README warns. A small arm of `CARRY_DAYS 7`, `CARRY_MAX 1` keeps the cost small.
- **Files:** `services/skill-adaptation.js` (knobs per arm), `services/personalize.js` (`armFor` experiment), `services/skill-dose.js`.

### P9. Describe the two-day rule as a delayed test, not a sleep gain, for children
- **Status: BUILT (flag `SKILL_TWO_DAY_TEXT`, default on).** A scan found no learner-facing skill text that promises a sleep gain. `content/skill-learner-text.js` `TWO_DAY_RULE` ("A check on a later day ... is a later test, not a promise that you get better overnight") is served by `skill-gate.left` and `skill-checks.overview`, and shown on the stage-check and stage-left pages. `SKILL-CURRICULA.md` §1.2 now gives the delayed-test reason. A guard test fails if any skill learner text promises a sleep gain: `scripts/skills-r3-gate-test.js` (5 checks).
- **Gap:** M02 and M41. The rule is right. Any wording that promises sleep improvement overstates the evidence for children.
- **Sources:**
  - R:wilhelm2008 (as M02).
  - rickard2008 (as M02).
  - soderstrom2015 (as M01).
- **Expected effect:** Honest learner and parent text. No change to behaviour.
- **Risk:** None.
- **Files:** `content/skill-learner-text.js`, `curriculum-build/SKILL-CURRICULA.md` §1.2.

### P10. First-person decision scenes and response-time bands
- **Status: SKIPPED: needs media and data.** First-person scenes need a renderer or clips. Response-time bands need each learner's own band, which needs real sittings. Response times are already recorded (BB3).
- **Gap:** M46. The scenes are top-down, and response time is recorded but not used.
- **Sources:**
  - rosch2021 (as M10). A first-person video test.
  - zhu2024 (as M46). Transfer is limited, and representative stimuli help.
  - broadbent2015 (as M46).
  - hadlow2018 (as M46).
- **Expected effect:** Better transfer of reads to games. RT adds diagnostic information.
- **Risk:** Production cost. Clips need consent or licensing. Rendered first-person scenes avoid both.
- **Files:** `content/basketball-scenes.js` (a camera-view renderer), `public/engine/basketball/basketball-blocks.js` (`Basketball_Play`), `content/skill-piano-bb-sittings.js` (an RT rule once the learner's band is known).

### P11. A structured neuromuscular warm-up template
- **Status: SKIPPED: the exercise content is not sourced.** The three sources show that structured programmes such as the 11+ prevent injuries. They do not give the exercises themselves (the FIFA 11+ manual's parts 1-3), or a version for under-10s (11+ Kids). Neither is among the verified sources. A template a child follows needs that content checked first. The `Basketball_Session` schema is also in `services/block-levels.js`, which is outside this section's files.
- **Gap:** M51. The warm-up is free text. The trials used structured programmes.
- **Sources:**
  - soligard2008 (as M51).
  - longo2012 (as M51). In basketball.
  - emery2015 (as M51).
- **Expected effect:** Fewer injuries, especially lower-limb and overuse injuries.
- **Risk:** Session time, about 10-15 minutes. It needs an age-appropriate version for under-10s.
- **Files:** `services/block-levels.js` (`Basketball_Session`: a `warmup_template` id), `public/engine/basketball/basketball-blocks.js`, and the basketball lesson content.

### P12. Add "nothing to find" positions to the CH2/CH3 tactics sets
- **Status: BUILT (flag `CHESS_NOTHING_TO_FIND`, default on).** Stockfish 19 is installed next to the repo (`local-tools/chess-engines`, used by `services/chess-engine.js`). `scripts/chess-quiet-pool-build.js` wrote `content/chess-quiet-pool.js`. Each position uses a real tactics-pool position's pieces on random squares, so piece counts give nothing away. White is to move with a capture to consider. A position is kept only when Stockfish (1M nodes, MultiPV 3) finds no mate and no move ending more than 80 cp better than the material. CH2 has 5 of 30 quiet, CH3 has 6 of 30. Every position offers "Nothing wins", which is right only on a quiet one. The owner's sittings have none. Tests: `scripts/skills-r3-checks-test.js` (8 checks). Response times are not used yet.
- **Gap:** M19. The code's own `gap` notes at `content/skill-stage-checks.js:50, 55`.
- **Sources:**
  - rohrer2015 (as M19).
  - bilalic2008 (as M19).
  - vandermaas2005 (as M19). Its quote on response latency also supports recording solve times.
- **Expected effect:** Tactics sittings measure *spotting* as well as *executing*, closer to game play.
- **Risk:** Quiet positions need Stockfish checks that the best move wins nothing, which is a build job.
- **Files:** `content/chess-tactics-pool.js` (quiet positions), `services/skill-checks.js` (`buildChessTactics`: mix in a "no tactic" option as in `buildChessMateOrNot`), `content/skill-stage-checks.js`.

---

## Reused sources (already verified; quotes re-taken from their abstracts today)

| id | DOI | used for |
|---|---|---|
| R:ericsson1993 | 10.1037/0033-295x.100.3.363 | M11 |
| R:kruger1999 | 10.1037/0022-3514.77.6.1121 | M05, M37 |
| R:rohrer2005over | 10.1002/acp.1083 | M13 |
| R:rowland2014 | 10.1037/a0037559 | M20, M42, M57 |
| R:cepeda2008 | 10.1111/j.1467-9280.2008.02209.x | M06, M08, M14, M42 |
| R:kornell2009 | 10.1037/a0015729 | M12, M23, M42 |
| R:donovan1999 | 10.1037/0021-9010.84.5.795 | M14, M16, P8 |
| R:mazza2016 | 10.1177/0956797616659930 | M02, M41 |
| R:wilhelm2008 | 10.1101/lm.803708 | M02, P9 |
| R:roediger2006 | 10.1111/j.1467-9280.2006.01693.x | M06, M20, M57 |
| R:kalyuga2003 | 10.1207/s15326985ep3801_4 | M42 |
| R:renkl2003 | 10.1207/s15326985ep3801_3 | M15, M42 |
| R:agarwal2021 | 10.1007/s10648-021-09595-9 | M57 |
| R:sailer2020 | 10.1007/s10648-019-09498-w | M58 |
| R:hamari2016 | 10.1016/j.chb.2015.07.045 | M56 (title-level) |
| R:gilovich1985 | 10.1016/0010-0285(85)90010-6 | M44 (title-level) |
| R:kalyuga2005 | 10.1007/bf02504800 | background: the probe-first lever in SKILL-CURRICULA §6, not reviewed here (title-level) |

## Official standards

- AERA, APA and NCME (2014). *Standards for Educational and Psychological Testing.* https://www.testingstandards.net/open-access-files.html (HTTP 200 on 2026-10-25). Used for M09, M10, M17 and P5.
- FIBA (2026). *Official Basketball Rules 2026 v1.1.* https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-1.pdf. Its quotes were verified in `curriculum-build/FACT-REVERIFY-2026-10-25.md` §2 and §3.2; the FIBA site returns 403 to scripted fetches from here. Used for M43 and M47.
