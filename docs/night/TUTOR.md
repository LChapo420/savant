# Night build: the site-wide tutor that remembers and understands each learner

Branch: `tutor-memory` (created from `main`). Owner's ask (30 Oct): the tutor on every page must remember
everything about the learner and understand how they learn, so it can help with any problem without giving the
answer away, backed by evidence.

Read first: `services/tutor.js`, `services/tutor-context.js`, `services/tutor-screen.js`, `services/learner-record.js`,
`services/learner.js`, `services/scorecard*.js`, `routes/tutor.js`, `public/js/tutor-dock.js`,
`curriculum-build/evidence-article/06-always-on-tutor.md` (its mechanisms are the spec), and
`03-scorecard-adaptation.md`.

## How a run works (every night builder)

1. `git fetch origin`, check out this file's branch, `git pull --rebase`. Then `npm ci` (or `npm install`).
2. Read this whole file. Take the first item under **Queue** that is not `[claimed …]`, `[done]` or `[local only]`.
   Mark it `[claimed <UTC time>]`, commit and push that one line first, so two runs never take the same item.
3. Read every file the item names before changing anything. Build it fully, with tests. Add each new test to
   `scripts/test-steps.json`.
4. Run `npm test`. It must pass before you push. If an unrelated test breaks, fix it only if the fix is small and
   obviously right; otherwise write it under **Blocked** and stop.
5. Mark the item `[done <commit>]` with one line on how it was checked. Put leftovers back in the Queue as their
   own item. Add anything you discovered, with a reason. Commit and push this branch only.
6. If an item is too big for one run, finish a working, tested first slice and split the rest.

## Rules that never bend

- Push only to this file's branch. Never push to, merge into, or open a PR against `main`, `yc-next` or another
  branch. The owner's local agent verifies with real models and a browser, then merges.
- The rules in `git show origin/yc-next:docs/yc/BACKLOG.md` ("Rules that never bend") apply in full: sealed
  Spanish test files are never edited; no secrets, `.env` or `data/`; no paid provider outside the existing
  ledgers and never OpenRouter; honesty (no invented numbers, users or quotes).
- Model calls only through `services/ai.js` / `services/pool.js`, learner-class providers for anything that
  carries learner data. You have no keys: tests use the existing mocks. No new outside AI or speech vendor.
  Local open-source libraries that run on the owner's machine are fine.
- Evidence: every design choice that claims to help learning cites a mechanism id from
  `curriculum-build/evidence-article/*.md` (for example `06-M3`). A claim with no mechanism there goes to
  `docs/yc/SOURCES-TO-VERIFY.md` marked **UNVERIFIED**, with the search terms to check it. The owner's local agent
  verifies those with the article pipeline.
- Learner data is per learner, private, exported and deleted for real (`routes/profile.js` export and delete
  paths). Update `public/privacy.html` for any new data flow.
- Match the code around you (Node/Express, vanilla JS, existing CSS variables). Every page works at 375 px.
- "Proven" means a test or simulation in `scripts/` that fails if the claim stops being true, not prose.

## Queue

T1. [done eda97b6] **Memory map.** Write `docs/TUTOR-MEMORY.md`: everything the tutor is given today per learner (running summary,
    turns, learner record, scorecard, goals, mastery), where each comes from, what is lost (for example: turns cut
    off, facts never extracted), and the gap list against the 06 mechanisms, by id. No code beyond small fixes.
T2. [done 668b952] **Long-term learner memory.** A per-learner store of durable facts:
    - goals and deadlines; misconceptions (with the skill, the wrong answer and how often); what explanation worked
      (the style the learner got right right after); what they find hard; interests and context they chose to share.
    - Extracted after a tutor turn by a learner-class model through `services/ai.js` (mocked in tests). Deduplicated,
      capped, each fact with its source turn and date; facts not confirmed for a long time fade.
    - The learner can see and delete each fact on the Profile ("What your tutor remembers"). Export and account
      deletion include it. Update the privacy page.
T3. [done 73c4862] **Use it in every reply.** In `tutor-context.js`, pick the facts relevant to this page and question (skill
    match, recency, strength) within a fixed token budget, plus current mastery on the page's skill. Test: a
    misconception recorded on day 1 shapes the hint on day 5 on a related skill; an unrelated fact is not sent.
T3b. [done 2fe3f6a] **Read the learner record.** Feed `services/learner-record.js` solid facts (struggles, hint ideas) into the same relevance choice as `tutor-facts` for the page's skill, so the biggest unused source reaches the tutor (06-M6, 06-M8).
T4. [done 6b631e1] **Understands how they learn.** Choose the explanation strategy (worked example, analogy, step questions,
    visual description, short vs long) from what has worked for this learner (T2 facts and scorecard signals), with
    a fallback order from the 06 mechanisms. Test with two simulated learners with opposite histories: they get
    different strategies, and each strategy that fails is tried less.
T5. [claimed 07:30Z] **Never gives the answer away.** An eval of 40 attempts to extract answers (just tell me, role-play, "my teacher
    said", partial-answer fishing, multi-turn wearing down) on graded, test and lesson pages. Script runs against
    the mock and checks the guard logic (`saysAnswer` and the mode rules). Mark a follow-up `[local only]` item to
    run it against the real model.
T6. [claimed 07:37Z] **Fast.** Context building stays under 30 ms for a learner with 5,000 events (test with a generated history);
    the reply path makes one model call.
T7. `[local only]` Real-model run of T5 and a 20-turn memory conversation on NVIDIA; the owner's agent does this.

## Blocked

## Done

- T3b `2fe3f6a`: `learner-record.tutorFacts` (solid facts, struggles seen on 2+ levels with their hint idea) feed `tutor-facts.relevant` beside the tutor's own facts; preferences/dislikes that are solid apply anywhere, the rest only on a match. Conclusions, stats and recommendations are not sent. Checked by a new case in `scripts/tutor-relevance-test.js` and full `npm test` (all steps passed). Privacy page and `docs/TUTOR-MEMORY.md` updated.
- T4 `6b631e1`: `services/tutor-strategy.js` (6 styles, per-learner tried/worked counts in `tutor_strategies`, score (worked+2*prior)/(tried+2), fallback order and a mastery nudge), wired into `tutor.contextText` as a "HOW TO HELP THEM" block; `tutor-facts` extraction credits `worked` facts with a style and counts the model's worked/failed judgement of the previous turn's style. Exported and deleted with the account; privacy page updated. Checked by `scripts/tutor-strategy-test.js` (9 checks incl. two opposite-history learners and a 30-turn simulation where failing styles fall to <=2 uses) and full `npm test` (all steps passed). Fallback order and thresholds listed UNVERIFIED. Not done: scorecard pace/accuracy signals are not used; whether the real model judges outcomes reliably is for T7.
- T3 `73c4862`: `tutor-facts.relevant` picks facts by skill match (3), skill-name or question-word overlap (1.5-2), with goals and "what has worked" always eligible, inside a 600-character budget, plus `masteryLine` for the page's skill; wired into `tutor.contextText` for the dock (skill inferred from page text when not given), home chat and the question coach (`ai.js`). Checked by `scripts/tutor-relevance-test.js` (9 checks: day-1 mix-up reaches a day-5 related question, unrelated fact stays out, budget, mastery line, hostile skill id) and full `npm test` (all steps passed). The learner record (`learner-record.js`) is still not read by the tutor; split to T3b. Relatedness is by shared words, not a skill graph: a related skill with no shared wording is missed.
- T2 `668b952`: `services/tutor-facts.js` (kinds goal/misconception/worked/hard/interest; extracted after a tutor turn via `ai.talk`, off the reply path; deduplicated into confirmations; 60-day half-life fade; caps 12 per kind, 40 total), routes `GET/DELETE /api/tutor/facts[/:id]`, Profile section "What your tutor remembers", export + account deletion (`tutor_facts`, and `tutor_modes` now exported too), privacy page paragraph. Checked by `scripts/tutor-facts-test.js` (10 checks) and the full `npm test` (all steps passed). Four existing tests that count model calls now ignore the note-taking call. Half-life and extraction accuracy listed UNVERIFIED in `docs/yc/SOURCES-TO-VERIFY.md`. Not done: the learner record is still not read by the tutor (T3); a browser check of the Profile section is for the owner's agent.

- T1 `eda97b6`: `docs/TUTOR-MEMORY.md` written from the code (no code changes). Checked by reading every cited file and `npm test` (all steps passed). Discovery: the learner record (`services/learner-record.js` facts) is never read by the tutor; folded into T2/T3 scope. `tutor_modes` is deleted on account deletion but not exported (mode word only).
