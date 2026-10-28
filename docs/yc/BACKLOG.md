# YC backlog: the standing work queue

The owner's standing order (2026-10-28): keep improving whatever raises the chance of getting into YC W27
(deadline Nov 2, 2026, 8 pm PT; interviews and decisions by Dec 11) and a16z speedrun SR008 (closes Nov 1,
11:59 pm PT). Keep going until accepted. Every cloud run takes the **top unclaimed item**, finishes it, and
updates this file.

## How a run works

1. Work on branch `yc-next`. Pull it first (`git pull --rebase origin yc-next`).
2. Take the first item under **Queue** that isn't marked `[claimed …]` or `[local only]`. Mark it
   `[claimed <UTC time>]`, commit and push that one line straight away, so two runs never take the same item.
3. Build it fully, with tests. Read the files the item names before changing anything.
4. Run `npm test`. It must pass. If an existing test breaks for a reason outside your item, fix it only if the
   fix is small and obviously right; otherwise note it under **Blocked** and stop.
5. Move the item to **Done** with the date, the commit, and one line on how it was checked. Add any new item
   you discovered to the right place in **Queue**, with a reason.
6. Commit with a clear message and push to `yc-next`. **Never push to `main`, never merge into `main`, never
   open or merge a PR into `main`.** The owner approves every merge.
7. If an item is too big for one run, split it: finish a working, tested first slice, and put the rest back in
   the Queue as its own item.

## Rules that never bend

- Never edit the sealed Spanish tests: `spanish-check/`, `spanish-check-lc/`, `routes/spanish-check*.js`,
  `public/spanish-check*`, `public/spanish-listening*`, `public/js/spanish-check*`, `public/js/spanish-listening*`.
- Never commit secrets, `.env` or anything under `data/` (it's gitignored: learner data lives only on the
  owner's machine).
- No spending: never add code that calls a paid AI provider outside the existing ledgers
  (`services/anthropic-ledger.js` $24 stop, `services/standard-compute-ledger.js` $20 cap, the LLM Gateway
  ledger $5 for speech only). Never call OpenRouter.
- Honesty: never write a claim, number or quote you can't point to. Outside facts you couldn't open are marked
  **UNVERIFIED** and added to `docs/yc/SOURCES-TO-VERIFY.md`. Never invent users, traction or scores. The
  founder's pre-ACT score is never quoted.
- The founder is 16. Anything that touches minors' data follows `docs/yc/PRIVACY.md`.
- Don't draft the YC or speedrun application answers: the owner said the product will change too much first.
  Fact banks, evidence and interview prep are fine.
- Match the code around you: plain Node/Express, vanilla JS in `public/js/`, the existing CSS. Mobile first:
  check every page at 375 px wide.

## Queue (highest value first)

The wedge is **ACT prep**. What moves YC most is real outside users and honest evidence that the app raises
scores, so items that unblock those come first. Plan source: `docs/yc/ACT-READINESS.md` section 4.

1. **`npm test` passes on a clean clone.** Ship or skip the ACT coverage-map check when the file is missing,
   with a message (`ACT-READINESS.md` item 12). Done when `npm ci && npm test` passes on a fresh clone.
2. **ACT score entry and test date** (item 2): a small ACT profile with test date, target score, and section
   scores from each official practice test (date, form, English, Math, Reading, optional Science), later the
   real ACT. Show the history as a bar or line chart on an ACT page. Store per user in the existing db layer.
   Done when a learner can record a practice-test score and see it charted, with tests.
3. **The measurement kit** (item 3 and section 5): an instruction page for students and parents, links to the
   official free practice tests, the counterbalanced A/B protocol, and an admin view listing every
   participant's before and after scores. Pre-registration is sealed with the same tooling as
   `spanish-check/` (SHA-256 seal, RFC 3161 stamp, OpenTimestamps). Done when the protocol can be run with
   5 students.
4. **An ACT landing page** at `/act` for students and parents: what it does today (truthfully), how it adapts,
   privacy in plain words, and one clear "Start free" button into onboarding with ACT preselected. Done when it
   loads fast on a phone and every claim on it is true of the code.
5. **Activation funnel numbers.** Extend the real-user metrics (`scripts/real-user-metrics*.js`) with the
   funnel YC asks about: signed up, finished onboarding, first lesson, came back day 2, came back week 1,
   minutes per active day. Excludes test and demo accounts. Done when one command prints it, with tests.
6. **Test-date plan** (item 4): from the test date and section scores, choose the skills with the most points
   available in the weakest sections and lay out a fixed number of sessions that fits the weeks left, with
   review timed to peak at the test date. Reuse placement, mastery and the retention scheduler.
7. **Real section timer** (item 5) for Timed Tasks and Finals, with pacing feedback. Section lengths are
   UNVERIFIED until checked on act.org: make them one config object and flag them.
8. **ACT-format English player** (item 6): passages with numbered underlined portions and "NO CHANGE"
   choices, the schema, and a validator. Content is written later by the owner's local pipeline.
9. **Fix the skill tagging** (item 7): the `act_rhetoric` fallback at `scripts/build-act-grades.js` should tag
   no levels.
10. **Invite a friend.** A share link with a referral code, counted in the metrics. No incentives that cost
    money.
11. **Interview prep, deepened.** For each of the 40 questions in `docs/yc/INTERVIEW.md`, a short answer built
    only from facts in the repo and `docs/yc/`, plus the one number or demo moment that backs it. Mark what
    the founder must fill in from his own experience.
12. **Demo script.** A 60-second and a 3-minute walkthrough of the app for the application video and the
    interview, using the demo account (`scripts/seed-demo-account.js`), with the exact clicks.
13. **Privacy gaps** from `docs/yc/PRIVACY.md` that code can close (deletion, export, parental notice, what
    goes to which provider), one gap per run.
14. **ACT Science passages with figures** (item 8): the player and schema for passage sets with a table or
    chart.
15. **ACT Reading passage sets** (item 9), the player and schema.
16. **ACT Writing** (item 10), reusing the English track's essay marking.

### Local only (a cloud run can't do these: they need `data/`, `.env` or the live server)

- [local only] Make the ACT level copy true (item 1): the workbook is `data/ACT_Grades_Topics.xlsx`.
- [local only] Write and fact-check ACT English passages through the pipeline once item 8 exists.
- [local only] Verify the outside facts in `docs/yc/SOURCES-TO-VERIFY.md` (cloud runs can't open web pages).
- [local only] Put the app online at beta.savantedu.com with the beta kit.

## Blocked

(none yet)

## Done

- 2026-10-28: the overnight review combined the Duolingo-style Spanish activities, 53 pre-written lessons,
  real-user metrics, the demo account, the beta kit, the YC research pack and the LLM Gateway budget into
  `integration-2026-10-28`; `yc-next` starts from it.
