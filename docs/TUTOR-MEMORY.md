# What the tutor remembers today (memory map, 30 Oct 2026)

Scope: the one tutor on every page (the dock, `services/tutor-context.js`), the home/subject chat
(`services/tutor.js` `chat`), and the question coach and help chat that share its context
(`services/ai.js` `coachSystemFor`, `services/assist.js`). Read from the code on branch `tutor-memory`; nothing
here was measured with a real model. Mechanism ids are from
`curriculum-build/evidence-article/06-always-on-tutor.md` (06-M*) and `03-scorecard-adaptation.md`.

## 1. What the tutor is given, per learner

Sizes are character caps in the code, not tokens.

| What | Where it comes from | Cap | Reaches |
|---|---|---|---|
| **Goals** (track, grade, label, their own words, up to 4) | `learner_goals` via `goals.listFor` | within pack | dock, chat, coach, help |
| **Interests** (survey `interests`, `hobbies`, `sports`) | learner profile survey, `learner.getProfile` | 240 | all |
| **How they learn** (scorecard "strongest" reads, up to 5, "probably" if confidence < 50) | `scorecard.get` then `scorecard/summary.summarize` | within pack | all |
| **Skills still weak** (≥ 3 attempts, mastery < 70 %, 4 lowest) | `skill_states` | within pack | all |
| **Recent lessons** (last 3 titles) and **Coming up** (next 3 levels of up to 3 enrollments) | `lessons`, `enrollments`, `curriculum.levelPlan`, `content/topics` | within pack | all |
| **Recent mistakes** (last 4 wrong items: skill, prompt, what they answered, error tag; never the key) | `items` where `correct === false`, not placement | within pack | all (dropped on method-only pages) |
| **Running summary** of older talks | `tutor_memory.summary`, model-written on a fold | 900 | all |
| **Last turns** (4 shown, 400 chars each; the live conversation's own turns are skipped) | `tutor_memory.turns` | 4 × 430 | all |
| **Page** (path, title, heading, visible text, question, choices, what they picked or typed) | browser, sanitised in `tutor-context.pageLine` | 500 for text | dock only |
| **Screen snapshot / picture** | `tutor-screen`, `tutor-vision` | – | dock only |
| **ACT** (test date, days left, target, latest composite) | `act-scores.summary` | – | dock only |
| **Plan** (level per enrollment, reviews due, own-material reviews due) | `review-session.planFor`, `material-study` | – | dock only |
| **Mastery count** ("N skills at the 75 % mark, M in progress") | `skill_states` (≥ 2 attempts) | – | dock only |
| **Misconceptions** (top 3 `error_tag`s with counts) | `items.error_tag` | – | dock only |
| **Own courses** (title, skills mastered, due) | `material_courses`, `material-study` | – | dock only |

The dock block is cut at `DOCK_MAX` 3,600 characters in priority order (page, screen, picture, goals, ACT, plan,
mastery, mistakes, misconceptions, coming up, style and interests, own courses); later sections shrink or drop first
(06-M6). `tutor.contextText` adds the pack again plus the summary and turns, capped at `PACK_MAX` 2,200 + 900 + turns.

Also stored per learner: `tutor_modes` (voice or text; only the word).

## 2. Who writes what

- Written by the tutor: `tutor_memory` (`note` after each reply; `fold` when turns pass 14, keeping 6).
- Written elsewhere and only read here: goals, survey, scorecard, `skill_states`, `items`, lessons, enrollments,
  ACT, materials.
- The **learner record** (`services/learner-record.js`: solid and tentative facts about what they struggle with, like,
  dislike and feel, with hint ideas; conclusions; conflicts) is **not read by the tutor**. Only the scorecard it
  updates reaches the tutor. This is the largest unused source.

## 3. What is lost

1. **Turns past the window.** Only the last 14 turns are stored verbatim and 4 are shown to the model. Older talk
   exists only as a summary of at most 900 characters, rewritten on each fold, so early detail is overwritten.
   Each turn is clipped to 400 characters, so a long message or reply loses its tail.
2. **The fold fallback is crude.** With no model, `plainFold` keeps one 110-character line per learner turn, drops
   all tutor turns, then keeps the *last* 900 characters, so the oldest lines go first.
3. **No structured facts.** Nothing is extracted into goal and deadline, misconception (skill, wrong answer, how
   often), explanation that worked, or what they find hard. If the learner says "my exam is on 12 Dec", it survives
   only while it stays in the summary.
4. **Misconceptions are counted, not remembered.** The dock counts `error_tag`s; the skill, the wrong answer and the
   date are lost. `skill_states.error_tags` keeps 8 per skill but the tutor does not read it. Recent mistakes are 4.
5. **Nothing records what helped.** No note of which explanation the learner got right right after. The only "how
   they learn" input is the scorecard, updated per level, not per tutor turn.
6. **No relevance choice.** The pack is the same on every page and question. The dock gives a mastery count but never
   the mastery of the skill on screen.
7. **No ageing.** Nothing fades for going unconfirmed; the summary is simply overwritten.
8. **The learner cannot edit it.** `GET /api/tutor/memory` shows the pack, summary and 6 turns; `DELETE` removes the
   conversations. There is no per-fact view or delete, because there are no facts yet.
9. **Some exchanges are not noted.** Coach and help chats write memory only when the learner said something
   (`noteQuestion`, `assist`); openers the learner did not type are skipped.
10. **Export and deletion.** `tutor_memory` is in the export list (`routes/profile.js` `EXPORT_MORE`) and the
    account-deletion list (`routes/consent.js`). `tutor_modes` is deleted but not exported. Any new store must be
    added to both. `public/privacy.html` has no tutor-specific paragraph today (it names only the speech vendor).

## 4. Gap list against the 06 mechanisms

| Id | Mechanism | State today | Gap (queue item) |
|---|---|---|---|
| 06-M6 | Context is a learner model, budgeted | built, fixed sections | Not chosen by page or question; no mastery on the page's skill; learner record unused (T3) |
| 06-M8 | How they learn from measured behaviour, not learning styles | scorecard reads only | No record of which explanation worked; no strategy choice or fallback order (T2, T4) |
| 06-M11 | Memory across sessions | summary + turns (design choice) | No durable facts, no ageing, no learner control; early detail overwritten (T2) |
| 06-M7 | Interests in their own words | survey only | Interests shared in talk are not captured (T2) |
| 06-M4 | Hints, not answers | prompt ladder; 7 probes measured (06-P2) | No eval of many extraction attempts against the guard logic (T5) |
| 06-M12 | Page and learner text are content | prompt rule | Role-play and wear-down not tested (T5) |
| 06-M3 | Integrity by page | path rules in `modeFor` | Covered; T5 asserts all three modes |
| 06-M2, 06-P1 | Help offered after repeated errors | proposed | Outside this workstream |
| 06-M13, 06-P3 | Trial of this tutor | proposed | No trial exists; nothing here claims an effect |

Not a mechanism but required: speed. Building the context runs several `db.find` scans per reply (`skill_states`,
`items`, `enrollments`, `lessons`, scorecard, ACT, materials). The 30 ms budget with 5,000 events has not been
measured (T6).

## 5. Fixes made with this map

None. This is analysis only; the gaps are queued as T2 to T6 in `docs/night/TUTOR.md`.
