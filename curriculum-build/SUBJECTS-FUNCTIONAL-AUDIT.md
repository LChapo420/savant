# Subjects functional audit (night of 2026-10-24, item 9)

**Summary.** Every subject's learner journey now runs end to end with no breaks, at both 375 and 1280 px, on the live code with every patch the apply-live agent landed tonight. That journey is: sign-up, placement, path, lessons, practice, coach, tutor, the Master checkpoint (failed, remediated, retried), today's review, a missed Final (record-based remediation and recall), consolidation, and the passed Final (held by the coverage gate).

- **Per-user optimisation covers every subject.** All 219 grades and all 13,070 objectives have machine-checkable objectives, a working proof and retention path, and the adaptation hooks. The round-3 patches work in all nine subjects, not only math and English.
- **Tokens per learner-hour fell 28% overall** (175,519 to 126,238; up to 60% in coach-heavy subjects), with no change to anything a learner reads.
- **Five live bug fixes.** The largest: priming wrote a coach opener for nearly every question, and the streamed coach never served it. There were also two answer-key leaks, a dead end for tailored learners, and two scorecard contract bypasses.
- **One staged patch:** grade difficulty bands.
- **The biggest open problem is content, not code.** Bank questions are not pitched to the grade. A Kindergarten math Final asks algebra; a doctoral math grade opens on "2.2 - 2.8".

## How it was tested

- **Where it ran.**
  - A test copy of the app: the placement-uitest data (`db.uitest.json`, copied into the scratchpad).
  - Every real key blanked and `OLLAMA_ENABLED=0`.
  - NVIDIA was replaced at the HTTP layer by a mock that counts the tokens of every request the app actually sends: messages, tool schema and output.
  - Nothing left the machine and no model was called. The live server and `data/db.json` were never touched.
  - Port 6799 was in use by the polish agent's server, so the copies ran on 6801-6803 and 6811-6813.
- **The scripted walk** (`scratchpad/34e6f487.../subj/walk.js`) runs one new learner per subject. The answer key is read from the in-process store, never sent to the client. The steps, in order:
  1. register, the age screen, the style quiz;
  2. "Find my grade" (subject placement), then the grade placement, the path and progress;
  3. three learning sittings, plus a lesson and a retention level;
  4. the coach, opened on every 8th question the way the page opens it (streamed, falling back to the plain route on an empty stream), with the page's 3.5 s prime on the other questions;
  5. the tutor on a missed question;
  6. a Master checkpoint failed (with integrity probes), remediation (teach, drill), then the retry passed;
  7. today's review;
  8. the Final: consolidation's hold, missed (record plan, recall), then passed;
  9. the held page and "Graduate" asked early;
  10. mastery, scorecard and export.
- **Grades walked:**

  | subject | grade |
  |---|---|
  | math | numbers_to_10 |
  | english | reading |
  | english | basics (phonics) |
  | reading | beginning_reader |
  | reading | foundations (phonics) |
  | iq | building_flexible_reasoning |
  | act | act_grade_3 |
  | spanish | advanced |
  | spanish | grade 6 |
  | chess | beginner_tactician |
  | piano | first_reader |
  | basketball | mini_player |

- **Sweeps and passes:**
  - **Every grade** of every track, in process (`sweep.js`): the coverage model, `validate()`, a synthetic proven→retained→lapsed record, the adaptation hooks, bank generators per objective skill, and sample questions at level 11, the middle and the Final.
  - **Browser pass** (`pages.js`, headless Chrome): each learner signed in, 8 pages at 375 and 1280 px, 192 page loads. It recorded console errors, failed requests, horizontal overflow, stuck spinners and load time.
  - **Three days on** (`review-check.js`): the walk's answers moved 3 days into the past, then today's review sat for each subject.
  - **Written checkpoints** (`essay-check.js`).
- **"Before"** is the same walk on a copy of the live tree as the apply-live agent left it, with this agent's two edited files restored (`app-before`). **"After"** is the live tree.

## Fixed live (bug fixes; backups in `scratchpad/34e6f487.../before-subjects/edits/`)

| # | what was wrong | fix | file |
|---|---|---|---|
| 1 | **Wasted coach openers.** The page asks `/coach/prime` after 3.5 s on any unanswered question (nearly all), and each prime is a full coach turn. The page then opens the coach on `/coach/stream`, which never read the primed opener. Every prime was wasted: 35% of all tokens before (61k of 176k a learner-hour), up to 61% in chess. | The stream serves a primed opener with no second call. `/coach/prime` spends a call only for a learner who opened the coach on at least 25% of their last 30 answers. Everyone else gets the coach written when they open it, streamed, as before. Knobs: `COACH_PRIME=all\|off`, `COACH_PRIME_RATE`, `COACH_PRIME_WINDOW`. | `routes/learn.js` |
| 2 | **Answer key leak.** `POST /items/:id/ask` answered about any item, never asked whether it had been answered: "The answer is X" without a model, an explanation of the answer with one. That included a running checkpoint, placement or skip exam. The coach routes also served checkpoint items, which the page never offers. Confirmed: the probes returned 200 in every subject before. | The tutor needs an answered item, and a held sitting must be finished. The coach refuses checkpoint, skip and placement items (409; a prime is a no-op). | `routes/learn.js` |
| 3 | **Stream close listener.** The coach stream marked itself closed on the request's `'close'`. Since Node 16 that can fire once the body is read, before the reply streams. With a plain HTTP client the stream came back empty and the page's fallback paid a second call; with the browser's keep-alive fetch the walk did see it stream. | It now listens on the response's `'close'`: correct either way, and a real client disconnect still stops the stream. | `routes/learn.js` |
| 4 | **Dead end for tailored learners.** A learner on a tailoring plan whose block page or game could not be written got an error with only "Back to dashboard", whose button returns to the same page. The `ordinary` escape did not apply to games. | The page offers "Do the standard session for this level instead", as its waiting screen already did. `POST /sessions` honours `ordinary` for a game whose questions are not ready; a ready game still plays. | `public/js/base-lesson.js`, `routes/learn.js` |
| 5 | **Scorecard contract bypasses** (scorecard agent's request). `learner.sessionParams` read attention runway and frustration from the raw score at 40% confidence, outside the calibrated gate: an ungated raw runway of 0.17 cut 11 items to 9. `adaptation.planForLevel` built its own sides without `hasInterests`. With `ADAPTIVE_TEACHING=on`, a confident side was also applied twice: once in the base, once in `decide()`. | `sessionParams` moves only by `contract.forSession`; `{ scorecard: false }` gives the base. `sessions.js` plans adaptation from that base, so each side applies once. Adaptation reads its sides from the contract (`adaptation.sidesFor`). | `services/learner.js`, `services/adaptation.js`, `services/sessions.js`, `scripts/scorecard-contract-test.js` |

**Tests.**
- New: `scripts/coach-guards-test.js` (21 checks), added to `npm test` and as `npm run test:coach`.
- Updated: `scripts/scorecard-contract-test.js` (146 checks become 174).
- Full chain on a DB copy, keys blanked, `OLLAMA_ENABLED=0` (except `ollama-provider-test`): **48/48 pass**, the 47 in `npm test` plus `learner-path-test`.
- After the scorecard fixes, a re-walk of math and piano on the final tree: 0 breaks.
- One earlier run caught `game-lab-integration-test` failing while another agent was mid-edit. It passed on rerun and in the final chain.

## Staged (learner-visible): `curriculum-build/staged/subjects/01-grade-bands.patch`

- **Flag:** `GRADE_BANDS=on`, default off. See that folder's README.
- **What it does:** each grade's bank difficulty climbs across its own slice of the subject's 1-10 scale, instead of every grade running the whole scale.
- **Measured over all 219 grades** (`sweep-band.json`):
  - math Kindergarten's Final goes from difficulty 10 to 3;
  - doctoral math opens at 8 instead of 1;
  - English preschool's Final is no longer an ACT passage question.
- **Unchanged:** coverage and adaptation checks.
- **What it does not fix:** the skill choice.

## Per subject

Tokens are per learner-hour on the scripted walk: before, then after.

| subject | journey | fixed tonight | staged | open | tokens per learner-hour (before → after) |
|---|---|---|---|---|---|
| **Math** (49 grades, 2,617 objectives) | works | 1-5 | grade bands | content not pitched to the grade (all 49 grades use the same 7 bank skills; K practice levels 99-196 are linear equations); K "Explain Aloud" checkpoints are delivered as written essays | 243,509 → 96,454 (-60%) |
| **English** (16 / 755) | works | 1-5 | grade bands | preschool "Oral Retell" checkpoints delivered as written essays; preschool Final draws ACT-style passage questions | reading: 182,489 → 135,050 (-26%); basics: 147,492 → 156,854 (+6%, noise) |
| **Reading** (16 / 584) | works | 1-5 | grade bands | doctoral Final can ask "Which type of syllable is 'rain'?" (phonics skill at difficulty 10) | beginning_reader: 135,880 → 123,916 (-9%); foundations: 140,816 → 137,783 (-2%) |
| **Phonics** (inside English basics and Reading foundations; not a track) | works | as above | — | some phonics bank items are odd for preschool ("Which letters are in the set named by 'F-J'?") | see English basics, Reading foundations |
| **IQ** (12 / 2,567) | works | 1-5 | grade bands | the IQ "Find my grade" set in `data/db.json` is a test fixture (placement agent's finding, being replaced) | 217,768 → 107,930 (-50%) |
| **ACT** (16 / 892) | works | 1-5 | grade bands | no "Find my grade" set (placement agent writing one) | 170,195 → 111,572 (-34%) |
| **Spanish** (57 / 1,540) | works; grades without Master levels go straight to the Final | 1-5 | grade bands | no "Find my grade" set (placement agent); typed-answer judging is the biggest cost here (40-60 judge calls an hour) | advanced: 135,413 → 125,075 (-8%); grade 6: 157,573 → 167,180 (+6%, more typed answers judged in that run) |
| **Chess** (19 / 1,250) | works; skills record and stage-check path rows serve (stage CH2) | 1-5 | grade bands | no "Find my grade" set; every chess stage gate stays in shadow until the chess agent wires its checks | 230,353 → 113,387 (-51%) |
| **Piano** (19 / 1,568) | works; stage PI2 path rows serve | 1-5 | grade bands | no "Find my grade" set | 183,203 → 122,604 (-33%) |
| **Basketball** (15 / 1,297) | works; stage BB2 path rows serve | 1-5 | grade bands | no "Find my grade" set | 133,457 → 128,191 (-4%) |

**Breaks recorded.**
- **Before:** 8 per subject, 4 in Spanish, which has no Master. All were the answer-key probes answering 200.
- **After:** 0 in every subject.
- **"Find my grade"** answers 202 "not available" for ACT, Spanish, chess, piano and basketball on the test copy (no question set). The page hides it when `available` is false, so it is not a dead end. The placement agent is writing verified sets.

**Browser pass** (192 loads; pages: dashboard, path, session, placement, find my grade, help, profile, subjects):
- No console errors, failed requests or horizontal overflow at 375 or 1280 px.
- Five loads of about 3 s, plus one dashboard still on "Loading your progress" after 2.5 s at 375 px (ACT; it rendered at 1280 a moment earlier). All coincide with the store writing the 140 MB test copy to disk (sequential walks saw no request over 1.2 s).
- The live data file is 12 MB, so the stall is far shorter there. It is still the JSON store's whole-file write, which the beta-launch kit's SQLite store addresses.

## Per-user optimisation coverage (all subjects)

- **Coverage model** (`services/coverage.js`):
  - all 219 grades build a model, 13,070 objectives in all; `validate()` reports no problems on any grade;
  - every objective has a bank generator for its skill;
  - a synthetic record goes proven → retained on every grade, and a failed delayed check makes it lapsed (on the 217 grades with two or more objectives; the other 2 grades have one).
- **Adaptation** (`services/adaptation.js`): `decide`/`checkWhat` (no WHAT change), `dailyReview`, `remediationPlanFor`, `heldPlanFor` and `effortFor` all return a plan on every grade of every track.
- **Round-3 patches, live, in all nine subjects.**
  - **Today's review:**
    - three days on, every learner with a proven objective got memory checks: math, English, reading, IQ, ACT, Spanish, piano and basketball (1-2 each), in type-in and multiple-choice formats, each tagged with its objective;
    - each was sat and scored (right counted, XP, streak) through the ordinary answer route;
    - Reading foundations and chess had nothing proven yet in the walk, so nothing was due, which is correct.
  - **Consolidation** held the Final with its note in all 12 walks.
  - **Record-based remediation after a missed Final:** "learn again" (6) plus recall (0-2) everywhere; recall rounds were sat and scored.
  - **Coverage gate (enforce):** a passed Final is held in every subject; the held page lists objectives; "Graduate" asked early returns `graduated: false`.
  - **Effort:** wired. The walk answers at 6-26 s, so nothing was "too fast to count".
  - **Skills round 3** (chess, piano, basketball): `/api/skills/path` serves the stage rows with checks ready (CH2, PI2, BB2).
- **Open: proof by objective, not by skill.** No objective items are imported yet (`content/objective-items/` does not exist). Every memory check and recall question is the bank's question on the objective's skill, which tests the objective less closely. The content factory is writing them (152/8,955 objectives at 05:53).

## Token efficiency

### Method

Same walk before and after, with mocked providers counting the tokens of every request: input is the messages plus the tool schema; output is the mock's answer. The calls (and so the savings) are measured exactly. Absolute output tokens are estimates: real lessons run longer, and reasoning tokens are not counted.

### Totals over about 16 learner-hours each

| | calls per learner-hour | tokens per learner-hour | coach tokens per learner-hour |
|---|---|---|---|
| before | 111 | 175,519 | 61,227 |
| after | 70 | 126,238 | 14,137 |
| change | -37% | **-28%** | **-77%** |

### Where the after-tokens go, per learner-hour

- **Shared item authoring** (`author_items`, about 55-80k): cached per skill and difficulty and shared by every learner, so this falls as the cache fills.
- **Session analyses and after-level reads** (about 25-60k).
- **Typed-answer judges:** 10-15k, but 25-55k in Spanish and piano.
- **Per-learner lessons:** about 15k.
- **Remediation diagnosis:** about 13k.
- **Coach:** about 10-25k.

### Kept

The coach fixes, 1-3 above. Quality: the coach's words are unchanged. A frequent coach user gets the same opener instantly; everyone else gets it streamed, as before.

### Looked at, not changed (no measured win without a quality or visibility risk)

- **Sharing per-learner lessons across learners.** The prompt carries the learner's own brief and the lessons they were taught, so sharing would change what they read.
- **Skipping the deep session analysis on short sittings.** It feeds the profile.
- **A "copied a word from the question" grading rule.** The walk's own wrong answers are of exactly that type, so any saving it showed would be inflated.
- **Prefetching fewer block levels.** It already looks only three levels ahead, and writes only lesson and retention levels.

### Tailored learners (pro plan)

About 1.1-1.25M tokens per learner-hour in the mock (English, math), dominated by per-learner block layouts, fills and checkpoint quizzes. This is an upper bound: the mock's content fails the app's semantic checks, so repairs and rewrites are counted that real models mostly avoid.

## Open (for the owner or other agents)

1. **Grade-appropriate questions** (all subjects; worst in math, English and reading). The bank is subject-wide, and grades borrow the track's default skills.
   - Staged: grade bands.
   - The real fix: the objective items the content factory is writing, served first by the review and recall rounds.
2. **Oral tasks become written essays.** Preschool and Kindergarten written checkpoints ("Explain Aloud", "Oral Retell") are delivered as typed opinion essays (math K, English basics, Reading foundations). Learner-visible: an owner decision.
3. **"Find my grade"** missing or placeholder for six subjects. The placement agent is on it.
4. **The JSON store writes the whole file on change.** It is a page stall on large data. The SQLite store is in the beta-launch kit.

## Files

- **Live (backups in `scratchpad/34e6f487.../before-subjects/`):**
  - `routes/learn.js`, `public/js/base-lesson.js`
  - `services/learner.js`, `services/adaptation.js`, `services/sessions.js`
  - `scripts/coach-guards-test.js` (new), `scripts/scorecard-contract-test.js`, `package.json` (test chain)
- **Staged:** `curriculum-build/staged/subjects/` (patch and README).
- **Harness and evidence** (`scratchpad/34e6f487.../subj/`):
  - scripts: `boot.js`, `walk.js`, `sweep.js`, `pages.js`, `review-check.js`, `essay-check.js`, `compare.js`, `chain.js`
  - results: `out-B-*.json` (before), `out-A-*.json` (after), `compare-B-A.txt`, `sweep-before.json`, `sweep-band.json`, `pages-*.txt`, `shots/`, `review-check-*.json`, `essay-check-*.json`, `chain-live-2.txt`
