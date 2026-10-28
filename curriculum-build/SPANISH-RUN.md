# The Spanish run (Oct 27–31, 2026)

One learner (the founder, account 6689, `landon@savantedu.com`), a subject they don't know, four days of
30–45 minutes in the normal Savant app, measured on questions the app never showed them. This is the
plan, the daily routine, how the scores are taken, and how to report them without overclaiming.

**The product is the normal product.** The only code that exists for this run is a per-learner "held-back
question" filter (`content/holdout.js`, called from `content/bank.js` and `middleware/auth.js`). It does
nothing for any other account. The account has no tailoring and no special levels.

## What was built

| Piece | Where |
|---|---|
| 40 held-back questions (bank questions, answers in `data/spanish-run/items.json`) | `node scripts/spanish-run.js pick` (done) |
| Filter: the bank will not serve these to account 6689 | `content/holdout.js`, `data/holdout.json` |
| Test (also covers the Express path): `node scripts/holdout-test.js` | passes |
| Test runner: day 0, final, retention; records score + timestamp | `scripts/spanish-run.js`, results in `data/spanish-run/results.json` |

**The 40 questions** are spread over the grades a beginner reaches: 14 from Grades 1–2 (greetings,
vocabulary, numbers, gender, `-ar` verbs, question words), 16 from Grades 3–5 (more vocabulary, numbers
to 99, `-ar/-er/-ir` verbs, articles, adjective agreement, ser/estar), 10 from Grades 6–7 (the stretch:
harder forms, object pronouns, negatives). About 28 are multiple choice (a pure guess averages about
7 of 40 overall) and 12 are typed answers.

**"Held back" means:** the exact question (same prompt and answer, whatever the answer options) is never
drawn for this account. For vocabulary, numbers and verb forms, any question in that skill with the same
answer word is also never drawn. It does **not** mean the words and rules are never taught: the lessons
are meant to teach them. The test measures whether the teaching transfers to questions never practised.
The same word asked in the other direction (Spanish to English vs English to Spanish) can still appear,
and lesson text written by the model can mention a tested word.

## One-time setup (before the founder starts)

1. **Restart the app server once.** It was started before `content/holdout.js` existed, so until it is
   restarted the filter is not in force. After a restart no further action is needed: the filter reads
   `data/holdout.json` every couple of seconds.
2. `data/holdout.json` already lists the 40 questions for account 6689 (done).
3. `data/db.json` was backed up first: `data/db.backup-20261027T210905Z.json`.

## Day 1 · Tue Oct 27 (about 45 min)

Order matters: the baseline comes **before** any Spanish in the app, so nothing in the app can hint at the
test answers.

1. **Day-0 test (about 15 min).** Open a terminal in the repo folder and run:
   ```
   cd C:\coding\claudecommittdIq\folderThing\iq-max-repo-2-claude-adoring-mayer-woc9sq
   node scripts/spanish-run.js quiz day0
   ```
   40 questions, no feedback, no looking anything up, no translator. Press Enter if you do not know: do
   not guess to be clever, answer as you would if you were really being tested. It prints the score and
   saves it with a timestamp.
2. **Sign in as the new account, choose Spanish, take the placement honestly** (you know none; answer what
   you know, leave the rest). Finishing placement is what starts the app's write-ahead: the next levels are
   written and fact-checked in the background while you go on.
3. **Lessons (about 20 min).** Start where the app puts you and do the levels in order. Do not use skip
   tools, other apps, videos or a translator. Learn only with Savant.
4. **End of the day, before Day 2:** freeze the retention sample (it takes the Spanish questions you got
   right during the day, not the placement ones, up to 40, picked by a fixed shuffle):
   ```
   node scripts/spanish-run.js snapshot-day1 6689
   ```
   Those questions are then also held back from the app, so the app cannot review them for you before the
   recheck. (That is the one place the run differs from normal use, and it is why the recheck is "no
   review". Say so when reporting.)

## Days 2–4 · Wed Oct 28, Thu Oct 29, Fri Oct 30 (30–45 min each)

Open the app and do what it offers first (any review or practice it puts at the top), then continue the
levels in order. Same rules: only Savant, no skipping, normal pace. After each session write down in
`curriculum-build/SPANISH-RUN-LOG.md` (or on paper): date, minutes actually spent, the level you reached,
anything that broke or was held. The app's own session records back the minutes up. Do not study on Oct 31
before the tests.

## Day 5 · Sat Oct 31 (about 25 min, first thing, before any study)

```
node scripts/spanish-run.js leakcheck 6689
node scripts/spanish-run.js quiz final
node scripts/spanish-run.js quiz retention
node scripts/spanish-run.js report
```

* `leakcheck` must report 0 matches. If it does not, report that too and say which questions leaked.
* `quiz final` is the same 40 questions in the same order as day 0.
* `quiz retention` re-asks up to 20 of the questions you got right on Day 1, with no review in between
  (about three and a half days).
* `report` prints both scores with a 95% interval, the change per skill, and the retention score.

## How the scores are taken

* Same 40 questions, same order, same grading (the app's own answer checking, which ignores missing accents),
  on day 0 and Oct 31. Each sitting is stored with start and finish time and every answer.
* A blank answer counts as wrong. The score is out of 40, never "percent fluent".
* The expected score from pure guessing is shown next to each result (about 7 of 40).
* Retention is the share of Day-1-correct questions answered correctly again on Oct 31. Some Day-1 hits
  were lucky guesses on multiple choice, so compare against about 25% on those, not zero.

## How to report it

**Say:** "n=1, my own test. I took a 40-question Spanish test the app never showed me, before starting
and again four days later. I scored X/40, then Y/40 (guessing gives about 7). I spent about N hours
in the app. Three and a half days later I re-answered Z of the W questions I'd got right on day 1,
without any review."

**Always include:** one learner (the founder, who built the product and knew it was being measured); no
control group, so the result does not show Savant beats anything else; a short test (40 questions, a
95% interval of roughly ±15 points); questions come from the product's own question bank, not an
external exam (no CEFR or ILR claim); the baseline was measured, not assumed.

**Don't say:** "learned Spanish in 4 days", "fluent", any level (A1/B1…) from this test, "Nx faster than…",
or anything about other learners. If the baseline was not near guessing, report the real baseline and
say what prior exposure you had.

**If it goes badly or flat, report it the same way.** An honest small result is stronger than a number
that falls apart under a question.

## Known gaps

* **Spanish voice for this account (after the restart):** spoken lines use ElevenLabs `eleven-v3` through LLM Gateway
  (language always `es`, a named voice per character, each clip made when it is first played and cached by
  voice + text in `data/spanish-media`), and the learner's speech goes to `grok-stt-1-0` there, in the Spanish lab
  only (`/spanish/play?level=…`). Only accounts in `data/spanish-gateway-users.json` (6689) use it. If the call
  fails the browser's own Spanish voice speaks and typing replaces speaking. The realtime `gpt-transcribe`
  relay is not built. This is not part of the main-app levels.

* **First-lesson wait (measured 2026-10-27, throwaway account on a copy of the database):** after placement
  the first two lessons were still "writing" after 25 minutes and then timed out. The authoring model
  (`deepseek-ai/deepseek-v4.1-flash` on NVIDIA) failed 15 of 16 calls that afternoon. The app falls back
  to an ordinary question session while a lesson is being written, so there is always something to do,
  but a lesson-first Day 1 is not guaranteed. Note any wait in the log.
* **Browser cookies are shared across ports on `localhost`.** A second app server on `localhost` signs the
  founder out of the first. Use `127.0.0.1` for anything else you run next to it.

* The first Spanish levels have never been written for anyone yet (no Spanish plans exist in the data).
  They are written by the server's write-ahead after placement. The check is whether the lesson is
  fact-verified and served, or held for verification; read-only status can be taken from `data/db.json`
  (`block_plans`, track `spanish`). If the first lesson is slow or held, note it in the log.
* The filter covers bank questions. Model-written lesson and check text is not filtered.
* `data/spanish-run/items.json` contains the answers: do not open it before Oct 31.
