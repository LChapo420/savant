# Skill curricula: chess, piano and basketball, from first touch to elite

Goal 4 of `NIGHT-2026-10-23.md`, done 2026-10-23 by the skill-curricula agent. Everything here is **staged, not live**: the files are in `curriculum-build/staged/skills/`, and the verification report is `curriculum-build/staged/skills/VERIFICATION.md`.

The owner asked for this:

> "make the chess, basketball, and piano as optimal for learning from not knowing anything to being the best at that skill, while still being able to be modified to each user so they learn with the most understanding and retention, and ability in that specific skill in the most efficient way possible."

## 0. The short version

- **The lesson lists are already good.** The three curricula (1,250, 1,568 and 1,297 lessons) were built from deep research. The weakness is around them: how the app proves a skill, how it builds practice, and how it adapts.
- **Order check, by code.** I built a prerequisite graph per subject: 62 concept nodes for chess, 46 for piano and 36 for basketball. A script then checked every edge against the live lesson order.
  - Chess: 54/54 edges hold.
  - Basketball: 25/25 edges hold.
  - Piano: 35/36 edges hold. The one exception is an optional swap of two adjacent lessons.
- **The real gap is that motor and board skills are never proved.** Today a grade is "done" when its levels are done. The staged plan adds three things:
  - A **competence model** per subject: what is measured, from which sensor, and how sure the app can be.
  - **Exit batteries** per stage, with statistical pass rules.
  - **Adaptation levers** that change how much and how the learner practises, never what must be proved.
- **Lesson edits (7, all checked by code and by the subject's own validator):**
  - 3 new lessons:
    - basketball: why ten shots tell you little;
    - basketball: why the next-day cold set is the real score;
    - piano: why mixed practice feels worse but works.
  - 3 description fixes in basketball:
    - 2 aim cues contradicted the free-throw optimisation evidence;
    - 1 FIBA measurement now matches the 2026 rulebook wording.
  - 1 optional piano swap.
- **New drills, every answer computed:**
  - Chess:
    - 10 play-outs against perfect defence, with par set from distance to mate.
    - 20 K+P v K judgements.
    - 6 K+P v K play-outs.
    - 6 square-rule items.
    - 15 unannounced mate-or-not items.
  - Piano: 102 technique-battery items, a 10-level sight-reading staircase and ear batteries.
  - Basketball:
    - 8 combine gates, each with its error rates simulated.
    - 5 decision-clip set specs.
    - A miss-pattern fix map.
    - Access swaps.
- **Facts checked by code against primary text:**
  - Chess: our own retrograde endgame tables confirm KQK's longest mate (10) and KRK's (16), and re-derive the key-square and square rules.
  - Piano: every spelling is re-derived from key signatures and cross-checked with the app's theory engine.
  - Basketball: 27 rule and guideline facts are matched against the FIBA 2026 rulebook, the NBA 2025-26 rule pages and the NBA youth guidelines.
- **Totals:** 84 code checks; see VERIFICATION.md for the current count.
- **Free models:**
  - The new lesson lines were drafted by GLM 5.3 Flash on NVIDIA's free tier.
  - Two independent free judges reviewed the lines and the claims that code cannot check: Nemotron 3 Ultra and DeepSeek V4.1 Flash, with GLM 5.3 @max standing in when DeepSeek is rate limited.
  - No Anthropic key, paid OpenRouter or Jev was used.

## 1. Research: what builds expertise in each skill

Evidence tags:
- **[V]**: opened and read.
- **[S]**: search summary only.
- **[P]**: from the subject's research files (`curriculum-build/<subject>/research/`), which carry their own sources.
- **[L]**: computed by code here.
- **[R]**: our design inference.

### 1.1 Chess

- **Skill is mostly a large pattern library plus checking.** The library is location-specific, and checking means calculation and blunder-checking. [P]
  - Gobet & Simon 1996: templates.
  - Burns 2004: blitz performance tracks rating.
  - Bilalić 2008: the Einstellung effect costs experts about 3 SD.
- **Serious solo study predicts strength; tournament play adds almost nothing beyond it.** [P]
  - Charness et al. 2005.
  - Burgoyne et al. 2019: R² .006 for play.
  - Learners differ about 8x in the practice they need (Gobet & Campitelli 2007). Pacing must therefore follow measured mastery, not the calendar.
- **Predict, then self-explain.** This beat predicting alone, and observing, in a chess endgame RCT (de Bruin et al. 2007). [P]
  - Recall beats recognition (Rowland 2014, 0.61 v 0.29). The answer is a move on the board, not a menu choice.
- **Assessment:**
  - The Amsterdam Chess Test (van der Maas & Wagenmakers 2005) measures skill reliably with choose-a-move, predict-a-move, recall and knowledge tasks. Response times add validity on easy items. [S]
  - Intrinsic Performance Ratings estimate strength from move quality over many moves (Regan 2011). [P]
  - Puzzle ratings run above game ratings, because a puzzle announces that a tactic exists. [P]
- **On-device sensing.** The board is exact. Engines run server-side (Stockfish/Leorik, `services/chess-engine.js`), and Maia-2 provides human-like opponents from 1100 to 2000.

### 1.2 Piano

- **How you practise beats how much.** [P]
  - Next-day performance followed the share of correct trials and how errors were handled, not time spent (Duke, Simmons & Cash 2009).
  - Beginners default to playing straight through (Hallam 2012), so practice strategy has to be taught.
- **Contextual interference.**
  - Random-order practice of short melodies is retained better, while learners believe the opposite (Abushanab & Bishara 2013).
  - The benefit holds only for short units early in learning (Verwey 2021).
- **Spacing works in days, not minutes** (Wiseheart 2017).
- **A later test is the better guide to learning** (Soderstrom & Bjork 2015). Sleep may protect motor memories (Rickard 2008), but a sleep *gain* is contested, and children aged 6-8 improved less across sleep than across waking (Wilhelm 2008). Hence the day-2 cold take, which learner text calls a delayed test, never a sleep gain (evidence article 04, P9; `content/skill-learner-text.js` TWO_DAY_RULE).
- **Sight-reading** depends on volume of easy new material, inner hearing and rhythm training (Kopiez & Lee 2008; Mishra 2014). [P]
- **Feedback** should fade (guidance hypothesis) and cue the sound, not the body. [P]
- **Assessment and sensing.**
  - MIDI gives exact notes, timing, velocity and pedal.
  - The microphone is reliable for single lines only. The live YIN path reads a C-major triad as a phantom C2 [L, mechanics doc]; the chord verifier is being built tonight.
  - Automatic musicality scoring is not classroom-ready (2022 review). [P]
  - Scale evenness can be quantified from MIDI inter-onset intervals: Jabusch et al. 2004 and Van Vugt et al. 2012-13 [S].

### 1.3 Basketball

- **External focus beats internal focus** for retention and transfer (Chua et al. 2021, g ≈ 0.58). [P]
- **Practice schedule.**
  - Blocked practice wins during practice; varied and random practice wins at retention and transfer.
  - An increasing schedule (blocked, then serial, then random) suits novices (Shamshiri 2025; a 9-week RCT). [P]
- **Challenge point.** The best difficulty depends on the learner's skill (Guadagnoli & Lee 2004). [S]
- **Game-based teaching** improves decisions (ES 0.89) but not execution (Abad Robles 2020). [P]
- **Screen decision training transfers about half as well to games** as it scores in the lab (Zhu 2024). [P]
- **A validated decision test exists.** In a first-person 4v4 passing test, split-half reliability was 0.92. German U16 national-team players scored 84% against 57% for a school sports class (Rösch, Schultz & Höner 2021, IJERPH 18(5):2331). [V]
- **Shooting.** Simulated optimal free throws: launch about 52°, up to 3 Hz backspin, **aim toward the back of the ring** (Tran & Silverberg 2008). [V]
- **What tech can judge.**
  - Phone pose angles carry errors of about 6-7° and depend on the view.
  - Make/miss from the camera is not independently validated.
  - Defence and live decisions cannot be machine-graded. [P]
- **Safety and fairness.**
  - The NBA/USA Basketball youth caps were checked by code [L].
  - The relative-age effect means children must never be ranked on athletic numbers. [P]

### 1.4 Across all three

- **Expertise reversal.** Novices need worked examples; advanced learners need problems (meta-analysis of 60 experiments, as used by the scorecard's "reach").
- **Rapid first-step diagnosis** can find what a learner already knows (Kalyuga & Sweller 2005). [S]
- **Measurement noise is the hidden enemy of tailoring.** One game, one take or ten shots says very little. Every gate below is sized with that in mind [L].

## 2. Design principles used in every stage

1. **Prove, don't presume.** A stage, unit or lesson is skipped or passed only on measured evidence.
   - Self-report, time spent and the after-level model read never prove anything. This is the same rule as GAP-PATHS-SPEC.
2. **Count cold attempts only.** A gate counts the first attempt of a day, at least 20 hours after that skill was last practised. Warm-up performance overstates learning.
3. **Two different days for every performance gate.**
4. **Statistical pass rules.** Ratings need a small RD. Make-rates use a Beta posterior. Game performance carries its standard error.
5. **Honesty about the source.**
   - Exact sources: MIDI, the board, confirmed counts.
   - Estimated sources: mic chords, camera.
   - An estimate is never the only proof.
6. **Never machine-grade** musicality, defence or live decisions.
7. **The learner's own baseline** is the only comparison for athletic numbers.
8. **The elite grades say "do what such players do", measured by tasks.** The app never certifies titles, ratings above its calibrated range, diplomas or careers.

## 3. Chess progression (staged: `staged/skills/chess/progression.json`)

| Stage | Grades | Band | Proved by (exit battery) |
|---|---|---|---|
| CH0 | C01 | none | Legal-move taps ≥95%; star mazes at par; set-up from memory |
| CH1 | C02 | 100-400 | Check/mate/stalemate ID ≥18/20; unannounced mate-or-not ≥13/15; K+Q v K mate against perfect defence in DTM+6; 2 legal games |
| CH2 | C03 | 400-800 | Unannounced tactics ≥80% (30 items, 5 with nothing); K+R v K in DTM+8; median ≤1 hung piece over 12 rapid games |
| CH3 | C04 | 800-1100 | Tactics ≥80%; K+P v K judgement ≥18/20 (table-proved); 4 wins and 2 holds against perfect play; 12 games ≥50% |
| CH4 | C05 | 1100-1400 | Tactics rating at the cut with RD ≤80; full-line calculation ≥7/10; 12 games, performance ≥1250 |
| CH5 | C06 | 1400-1600 | Rating cut; Lucena win and Philidor hold on two days; performance ≥1450 |
| CH6 | C07 | 1600-1800 | Rating cut; repertoire SRS ≥90% first-try for 2 weeks; performance ≥1650 |
| CH7 | C08 | 1800-2000 | ACT-style choose-a-move set; conversions ≥4/5 and holds ≥2/3; performance ≥1850 |
| CH8 | C09 | 2000-2199 | ACT-style set; calibrated top bot or an external rating as a discounted prior |
| CH9-12 | C10-C13 | 2200+ | Capstone tasks graded by engine and rubric; external rating shown, never required |

Tracks C14-C19 (coaching, arbiting, problems, history, engines, frontier) are open at any playing level and are gated by `unitBelief` plus applied tasks.

**Practice engine:**
- **Puzzle selection.** Puzzles are chosen so the learner's expected score is 0.75, which means the puzzle rating sits 191 points below the learner's [L]. For calculation sets from CH4 on the expected score is 0.6 (70 points below).
- **Interleaving and variety.** Motifs are practised blocked inside their lesson, then mixed and unannounced afterwards. Every motif appears in 3+ locations, both colours and mirrored.
- **One spaced-repetition queue** (`content/chess-srs.js`) holds mating patterns, endgames, own-game mistakes and, from CH6, the learner's repertoire. Every opening move carries its "why".
- **Own games.** From CH2, the learner annotates first; each mistake then becomes a card.
- **Anti-volume.** Learning games are 15+10 or slower; blitz is a labelled fun mode.

**Feedback:**
- Puzzles get immediate feedback, and the refutation is played on the board.
- Games get delayed feedback: the learner annotates first, then the coach names the pattern.

**Efficiency, computed with the live `learnerPath.unitBelief`.** A board answer has a guess rate of about 1 in 30, so it proves a unit faster than multiple choice:
- "past" units: 2 board answers v 3 multiple-choice;
- "island" units: 2 v 4.

Board-answer unit banks therefore shorten placement and test-outs at the same safety [L].

## 4. Piano progression (staged: `staged/skills/piano/progression.json`)

| Stage | Grades | About | Proved by |
|---|---|---|---|
| PI0 | P01 | Day one, age 4+ | Landmark keys 9/10; steady beat; echoes; a rote song cold |
| PI1 | P02 | Pre-reader | C five-finger patterns each hand; 2 pieces cold; a tune found by ear |
| PI2 | P03 | First reader | C scale one octave; 3 pieces cold (≥0.95 MIDI); sight-reading ≥SR2; chord quality by ear 9/10 |
| PI3 | P04 | ABRSM Gr 1 / RCM 1 | Grade scales, random order, evenness CV ≤0.12; 3 pieces cold on two days (≥0.97 MIDI, on-beat ≥0.9, no stops); ≥SR3; recorded self-assessment |
| PI4 | P05 | Gr 2 | Scales and arpeggios; I-IV-V7-I (needs MIDI, on-screen keys, or the verifier plus confirmation); pieces; ≥SR4 |
| PI5-7 | P06-P08 | Gr 3-5 | Technique at CV ≤0.09; a memorised piece restarted from 3 random cues; ≥SR5-SR7; MIDI dynamics contrast; recital (rubric, human review) |
| PI8-10 | P09-P11 | Gr 6-8 | Technique at CV ≤0.06; programme performance; MIDI legato-pedal timing; a new piece learned independently |
| PI11-16 | P12-P17 | Diploma to master | Recitals and applied tasks, with human review |

Frontier grades P18-P19 are a knowledge track open at any level.

**Practice engine:**
- **Two-day lessons.** The day-2 cold take is the learning score.
- **Tempo ladder.** Start at 60-70% of target. Step up 10% after 2 clean takes; step back after 2 failures.
- **Hotspot loop.** The worst 1-2 bars loop at 65%, then rejoin.
- **Interleaving.** Short units are interleaved only after one correct run each; long pieces stay in sections.
- **Spacing in days.**
- **Interference.** Two similar new passages are never taught back to back.
- **Away-from-piano work** (score study, inner hearing) always ends in playing.
- **Safety.** Session caps, break prompts, and pain means stop.

**Feedback fades within each lesson:**
1. real-time highlights;
2. end-of-take summary;
3. bandwidth (only clear errors flagged);
4. self-rate first, then the score.

Cues name the sound, not the body. Mic results are labelled "estimated", and the app asks for the bar again rather than marking a mistake.

**Not verified tonight.** Exam-board tempo tables were not verified (search found only retailer pages). Tempo targets therefore stay per lesson and need a teacher check. Evenness CV cuts are provisional until normed.

## 5. Basketball progression (staged: `staged/skills/basketball/progression.json`)

| Stage | Grades | Ages | Proved by |
|---|---|---|---|
| BB0 | B01 | 3-6 | Safety rule shown on two days; everything else logged against own baseline (no gates) |
| BB1 | B02 | 6-8 | Lay-ups each hand at a low ring (P(rate ≥0.5) ≥0.9, n ≥20 per hand); weak/strong dribble ratio ≥0.7; 2v1 choices 8/10; rules units |
| BB2 | B03 | 8-10 | Form shots from 1 m (≥0.6, n ≥40); lay-ups off a dribble each hand; 3v3 reads ≥80% |
| BB3 | B04 | 10-12 | Free throws (≥0.5, n ≥60); full-speed lay-ups; Rösch-style 4v4 clips ≥80%; filmed set rated against anchor clips |
| BB4-5 | B05-B06 | 12-16 | Spot shooting by zone (n ≥50 per zone, age-normed); FIBA-line free throws (≥0.65, n ≥100); ball-screen and help reads ≥80%; game showcase with film review |
| BB6-7 | B07-B08 | Varsity, elite junior | Zone profile with intervals; 30-clip test; own-film reads tagged |
| BB8-12 | B09-B13 | College to Olympic | Applied tasks (scouting, game plan, officiating clips, analytics); imported stats shown, never required |

**Gate statistics [L].** A make-rate gate passes when P(true rate ≥ threshold) reaches the gate's confidence. Confidence is 0.9 for 20-attempt gates and 0.8 for longer ones, re-checked after every cold set of 10. Simulated with checks after every set (cap 200 attempts):
- a shooter 10 points below the threshold passes by luck in ≤3% of runs;
- a shooter 10 points above passes in 97-99%.

The 95% margin of a 70% shooter is about ±13 points at 50 attempts. That is why one test day is never enough.

**Practice engine:**
- **Two-day lessons:**
  - Day A: a screen part of at most 8 minutes with one external cue, then the warm-up, then the court session.
  - Day B: warm-up, then the cold set.
- **Increasing contextual interference.**
- **Challenge point.** Practice success is held near 50-70%; in-practice percentages never gate.
- **Constraints.** Every technique ends under a defender, a decision or fatigue.
- **Small-sided games** (1v1 to 3v3) are the default transfer activity.
- **Aim cue** follows Tran & Silverberg.
- **Load caps by age:** 3/5/10/14 hours a week and 2/2/1/1 rest days (code-checked against youthguidelines.nba.com). Streaks count rest days.

**Ruleset.** FIBA 2026 is the default. A learner who sets their league (NBA/WNBA, NCAA, NFHS) gets that body's items.

## 6. How each learner's path adapts (all three subjects)

Every lever changes **how and how much** the learner practises. None removes an objective that has not been proved.

| Lever | Rule | Signals |
|---|---|---|
| Entry | Subject and in-grade placement, plus skill baselines (tactics set and a play-out; a scale, a piece and a staircase run; clip checks and court baselines). Skipped units still need `unitBelief` proof or a cold performance pass. | placement, unit plan |
| Probe-first | Each lesson opens with an independent item and a transfer item (a cold set or take for motor skills). Clean and cold makes the lesson provisional; it becomes known after a cold check 1+ day later. Otherwise the full ladder runs. | first attempt, spaced check (Kalyuga 2005) |
| Dose | Worked and faded examples shrink when the scorecard's per-subject reach is high and grow when it is low. Practice stops early after clean independent work plus a transfer item. | scorecard reach (expertise reversal) |
| Difficulty | Chess: expected score 0.75 (0.6 for calculation). Piano: tempo start and step from the learner's own history. Basketball: distance, defender and clock stepped to 50-70% success. Frustration directives soften it further. | Glicko, takes, sets, scorecard |
| Weak spots | Chess themes 150+ points below overall rating get double share (capped at half a set). Piano hotspot bars loop. Basketball miss direction routes to its fix drill; a weak hand gets 2:1 reps. | per-theme ratings, align() errors, miss taps |
| Feedback fade | Faster fade for learners whose accuracy holds without guidance; slower for hint-dependent learners. | scorecard hint dependency |
| Review timing | SRS intervals, then the forgetting model once fitted (review when predicted recall drops below 85%; SCORECARD.md measured about 43% more skills retained per hour). | forgetting model |
| Preferences | Openings, pieces, bot personality, role electives and session length are chosen from equivalent sets; gate content never changes. | survey, choices, feedback taps |
| Access and device | MIDI v mic routing. No hoop, partner or space means equivalent drills, with hoop-only objectives queued and flagged. | device and setup |
| Age and safety | Overrides every other lever: session caps, load caps, rest days, pain and head-knock stops. | age, logs |

**How this connects to existing machinery:**
- Knowledge state is the existing unit plan and `unitBelief`.
- Skill state is new: per-node performance metrics with uncertainty. The skill graphs give the per-node lesson index (`verification.json` → `graphs`).
- Preferences come from the scorecard and the record.

**Coordination.** The goal-5 adaptation agent owns the general levers. This plan only adds the skill-specific state and gates, so the two plans should be merged at review.

## 7. What is staged (all under `curriculum-build/staged/skills/`)

| File | What |
|---|---|
| `chess/progression.json`, `piano/progression.json`, `basketball/progression.json` | Stages, objectives, exit batteries, practice, feedback, sensing, adaptation, and what each needs from the other builds |
| `*/skill-graph.json` | Prerequisite graphs mapped onto live lesson titles |
| `chess/drills.json` (+ `build-drills.js`) | 57 computed drills (play-outs, KPK judgement and play-outs, square rule, mate-or-not) plus specs for coordinates, the visualisation ladder, blunder-check and unannounced sets |
| `piano/drills.json` (+ builder) | 102 technique items with spellings and MIDI, the SR1-SR10 staircase, ear batteries, the tempo ladder |
| `basketball/drills.json` (+ builder), `basketball/rules-facts.json` | Combine gates with error rates, baselines, the miss-pattern map, decision-clip sets, access swaps; 27 rulebook-checked facts plus 5 listed as not verifiable here |
| `lesson-changes.json`, `lesson-specs.json` | 7 proposed lesson edits with evidence, and the drafting specs |
| `lib/endgame-tables.js`, `lib/stats.js`, `lib/graph-check.js` | Our own KQK/KRK/KPK retrograde tables, the gate statistics and the order checker |
| `free-models.js`, `free-model-runs.json`, `judge-items.json` | Free drafting and the two free judges, cached |
| `verify-skill-curricula.js` → `VERIFICATION.md`, `verification.json` | Every code check |

**Sources.** Rulebook sources live outside the repo in `offline-sources/basketball/` (FIBA 2026 PDF and text, NBA rule pages, youth guidelines), with SHA-256 hashes.

**Files not touched:**
- `public/engine/*`, `content/chess-*`, `services/*-checks.js`;
- every live content file and data/db.json.

## 8. Verification summary

- **Code:** see `VERIFICATION.md`. Highlights:
  - KQK max DTM 10 and KRK 16. Every white-to-move position is won.
  - The key-square rule holds in 15,354 of 15,358 qualifying K+P v K positions. The 4 exceptions are stalemates with a b- or g-pawn on the 6th rank and the defending king in the corner (for example Kc7, Pb6 against Ka8, Black to move). The lesson should name this trap.
  - The square rule matches the table once it is stated correctly for Black to move ("inside the square or can step into it"). My first formulation was wrong and was caught by the table.
  - All drill answers were recomputed.
  - Piano spellings were re-derived two ways and agree with the app engine.
  - Basketball rule facts were found in the rulebook text.
  - The gates were simulated.
  - The lesson changes pass each subject's own `validate.js`.
- **Live-content finding.** Lesson B06:66 says the FIBA no-charge semicircle is 1.25 m. The 2026 rules measure 1.30 m to the outer edge; the old 1.25 m was to the inner edge.
- **Free judges:** see the judges section of VERIFICATION.md.
  - Free models scored only 0.575 on claim checking (MODEL-LINEUP.md), so a judge "correct" is support, not proof.
  - Any "wrong" is listed for a person to read.
- **Not verified here, so judges and then a human must check:**
  - NCAA's 10-second backcourt rule;
  - the NFHS quarters, arc and shot clock;
  - the NBA transition take-foul penalty;
  - the ring height, which sits in FIBA's separate equipment document.

## 9. What the owner must approve or decide

1. **Apply the lesson changes** in `lesson-changes.json`: 3 new lessons, 3 description fixes, 1 optional swap. Then rebuild each subject's CSV and the app's grade files.
2. **Adopt the stage exit batteries as gates.** Recommended rollout:
   - First as shown-only "skill checks".
   - Then as gates once 200 learners per stage have norms.
   - Thresholds marked [R] are provisional.
3. **Build the skill-state store** (per-node performance with uncertainty) and the probe-first lesson opening. This is code, and the goal-5 agent's plan overlaps it.
4. **Chess:**
   - Use our endgame tables for play-outs against perfect defence. They take about 1 minute to generate; precompute and ship them as a compact file.
   - Add per-theme puzzle ratings and the unannounced mode (needs the chess agent).
5. **Piano:**
   - Have a teacher set per-lesson tempo targets.
   - Confirm chord gates use MIDI, on-screen keys, or the verifier plus a confirmation.
6. **Basketball:**
   - Decision clips: license them, or film our own with consent. Until then, use SVG scenes.
   - Keep camera outputs advisory.
   - Default ruleset: FIBA 2026.
7. **Human checks:**
   - a basketball referee or coach: the 5 unverified rule facts and the aim-cue wording;
   - a piano teacher: tempo targets and the evenness cuts;
   - a chess coach: the stage cuts.

## 10. Sources (new this session; the subjects' research files hold the rest)

- FIBA Official Basketball Rules 2026 v1.0: https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-0.pdf [L]
- NBA Official Rulebook 2025-26 rule pages: https://official.nba.com/rulebook [L]
- NBA & USA Basketball Youth Guidelines: https://youthguidelines.nba.com/ [L]
- Rösch, Schultz & Höner 2021, IJERPH 18(5):2331: https://pmc.ncbi.nlm.nih.gov/articles/PMC7967709 [V]
- Tran & Silverberg 2008, J Sports Sci 26(11):1147-1155: https://www.sponet.de/sponet/Record/4014972 [V]
- Guadagnoli & Lee 2004, J Motor Behav 36(2):212-224 (challenge point): https://en.wikipedia.org/wiki/Challenge_point_framework [S]
- Kalyuga & Sweller 2005, ETR&D 53:83-93: https://doi.org/10.1007/bf02504800 [S]
- van der Maas & Wagenmakers 2005, A psychometric analysis of chess expertise (Amsterdam Chess Test): https://dare.uva.nl/id/44227bd6-730b-4f8d-885d-6c7d08d1eebf [S]
- Van Vugt, Jabusch & Altenmüller 2013 (MIDI scale timing; cites Jabusch et al. 2004): https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00134/full [S]
- Field-goal and free-throw noise context: https://arxiv.org/pdf/1609.09830 [S]
- ABRSM mark bands (secondary only; tempo tables not found): https://www.piano-composer-teacher-london.co.uk/abrsm-exam-results/ [S]
