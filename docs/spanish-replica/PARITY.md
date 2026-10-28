# Parity: Duolingo-style features in the lab and in the main Spanish path

Audit date: 2026-10-28. Method: the app was run locally on a fresh data directory (no real learner
data), a test learner was registered, placed as a beginner in Spanish Grade 1, given a conversational
goal, and walked from the dashboard into the path; every row below was checked against the running app
and the code it names. The lab is `/spanish/lab` (34 demo levels, `config/spanish/lab/`, played by
`public/spanish/js/`). The main path is what a learner reaches from the dashboard after placement
(`/dashboard` → `/session` → now `/spanish/learn` for Spanish).

## Summary

**Before this change** the main Spanish path had none of the Duolingo-style lesson features. A Spanish
level was a text lesson (written by the AI on demand, or a template from the question bank when no key is
set) followed by multiple-choice and short typed questions, with no audio, no speaking, no listening,
no word bank, no new-word cards, no hearts, no mistake review and no item-level review queue. All of
those existed only in the lab.

**After this change** every Spanish level in Grades 1 and 2 whose type is a lesson, listening,
speaking, pronunciation, reading, writing, review, checkpoint, unit intro, story, input session,
listening lab, dictation, conversation lab or fluency sprint plays in the lab's own engines and
exercise components, inside the main path:

- `/session` sends the level to `/spanish/learn` (`routes/learn.js`), the same way game levels are sent to their pages.
- The level is built on the server from the curriculum row, the unit's written content
  (`content/spanish-path/units-g1.js`, `units-g2.js`, 231 phrases, 17 units), the learner's goal
  (`services/spanish/goal-fit.js`, see `GOAL-FIT.md`) and the learner's review queue
  (`services/spanish/path.js`).
- Answers are graded on the server by the lab's checker. First answers become mastery evidence and
  review-queue updates, and passing moves the learner along the path.

Grades 1–2: 81 of 94 and 114 of 135 levels play this way. The rest are the Entry Check, Quick Games (they
keep the existing game engines), Writing Labs, Reading Blocks, the Grade Project and the Final. Those,
and every level from Grade 3 on (no written content yet), stay on the ordinary session. A learner can
always pick "Use the plain question version of this level" from the start card.

`clone` column in `features.csv`, rewritten from this audit (it said "no" everywhere before):

| value | meaning | rows |
| --- | --- | --- |
| `yes` | in the main path now | 44 |
| `partial` | in the main path, missing part of what the row describes | 40 |
| `lab` | only in the lab (`/spanish/lab`), not in the main path | 13 |
| `no` | in neither | 40 |
| `skip` | out of scope, as the row already said | 11 |
| `n/a` | does not apply (under-13 mode for social features: there are none) | 1 |

Of the 68 `must` rows: 32 yes, 26 partial, 5 lab only (three Quick Games, the Writing Lab and the
Grade Project), 4 no (the AI validation pass, level versioning, the lemma-target ledger check and the
daily goal) and 1 n/a.

## The features this task named

| feature | lab | main path before | main path now |
| --- | --- | --- | --- |
| Tap / select the meaning | `ex.select_meaning` (exercises/choice.js) | MC text only | yes, with the speaking character and audio |
| Match pairs | `ex.match_pairs` (exercises/other.js) | no | yes |
| Select the image | `ex.select_image` | no | yes (new-word picture cards) |
| Translate with a word bank (tap to place) | `ex.translate` + `wordBank` (exercises/build.js) | no | yes, both directions; tiles move by tap |
| Translate by typing, fuzzy grading | "Use keyboard" + accent bar + `shared/grade.js` | some typed items | yes (accent and one-typo nudges, several accepted answers) |
| Fill the blank | `ex.fill_choice`, `ex.complete_translation` | some MC | yes (hand-written per unit) |
| Arrange words | the word bank sentence builders | no | yes |
| Tap what you hear | `ex.tap_heard` | no | yes |
| Type what you hear, slow audio | `ex.type_heard` + turtle | no | yes |
| Listen and choose | `ex.listen_choose`, `listen_meaning`, `listen_image` | no | yes |
| Speak this sentence | `ex.speak` + `/api/es/asr` | no | yes: server transcription (LLM Gateway for its accounts, else MiMo) when configured, the browser's Web Speech API (es-ES) as fallback, typing as the last resort |
| Listening lab (clips + questions + repeat) | `engines.listening_lab` | no | yes, from each unit's scene |
| Stories | `engines.story` | no | yes: Story and Input Session levels |
| Conversation lab (AI role-play) | `engines.conversation_lab` + `ai-activities.js` | no | yes: one role-play card per unit; AI partner with a key, scripted partner without |
| New-word introduction | NEW WORD tag | no | yes: each new phrase is met as a NEW WORD card before anything asks it |
| Feedback sheet with the correct solution | `footer.result` | right/wrong with rationale | yes |
| Missed exercises re-asked at the end | `session.run` review phase | no | yes |
| Unit review | `engines.unit_check` (fixed list) | no | yes: Unit Checks drawn from the learner's own queue (due, then weak), never blocking |
| Item-level spaced-review queue | localStorage / fixed list only | skill level only (`skill_states`) | yes: `es_review`, one row per learner per phrase, boxes and due times, feeding every level |
| Audio for every prompt | `core/audio.js` + `/api/es/tts` | none | yes: eleven-v3 through LLM Gateway for the listed account, else Gemini, else the browser's Spanish voice |

## Pre-written levels

`content/spanish-prewritten/` (written by another session; read here, never written) is read at start-up.
A file there takes over its level when it is a level in the **lab's own format**
(`config/spanish/lab/*.js`: `engine` plus `items`, or a story/listening-lab/dictation/conversation body)
and names its place with `grade` + `level`, or with `csv: { grade, level }`. The grade can be the
1–57 number or the grade id. A `.json` or `.js` file can hold one level, a list of levels, or `{ levels: [...] }`.
Anything else is skipped with a warning, and the level is built from the unit content as usual
(`services/spanish/path.js` `prewritten()`, tested in `scripts/spanish-path-test.js`).

## Every row of features.csv

Columns: the row as written; the lab; the main path before this change; the main path now; the new
`clone` value. Paths are relative to `public/spanish/js/` for the lab's browser code unless they say otherwise.

| # | feature | area | priority | lab | main path before | main path now | clone |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Reuse host app accounts and auth for the language section | auth | must | yes — /api/es uses req.user (routes/spanish/index.js) | yes | yes — same accounts; /spanish/learn needs sign-in (routes/spanish/path.js) | **yes** |
| 2 | Guest mode: start learning before creating a profile | onboarding | should | no | no | no | **no** |
| 3 | Course picker grid with flag and name | onboarding | must | no | yes — subject grid (public/js/onboarding.js) | yes — unchanged (onboarding.js) | **partial** |
| 4 | Onboarding questionnaire (reason / proficiency / daily goal) with mascot bubble and progress bar | onboarding | must | no | partial — goal step + style quiz (public/js/goal-picker.js, style-quiz.js) | partial — goal step adds a Spanish-only 'Speak and understand everyday Spanish, fast' choice (services/goals.js); no daily-goal step, no mascot questionnaire | **partial** |
| 5 | Choose start: from scratch or find my level | onboarding | must | no | yes — placement or 'find my grade' (placement.html, subject-placement.html) | yes — unchanged | **yes** |
| 6 | Entry Check: adaptive placement at the start of every grade | onboarding | must | yes — entry_check engine (engines/lessons.js, config/spanish/lab/assessments.js) | partial — placement quiz (MC, no spoken item); level 1 'Entry Check' is an ordinary session | partial — unchanged: the Entry Check level stays on the ordinary session | **partial** |
| 7 | Notification permission prompt during onboarding (mobile) | onboarding | should | no | no | no | **no** |
| 8 | Spanish level pipeline: generate every level once from its spec + grade + prev/next level context | content | must | no | partial — lessons written on demand by AI per learner (services/lessons.js) | partial — Grades 1-2 levels are built from written phrase banks (content/spanish-path/units-g1.js, units-g2.js); no generation pipeline | **partial** |
| 9 | Generator outputs typed exercise JSON per E-type (prompt / choices / pairs / tiles / answer) | content | must | yes — hand-written typed items (config/spanish/lab/*.js) | no — text lessons + bank questions | yes for Grades 1-2 — typed items per kind built by services/spanish/path.js buildItem | **partial** |
| 10 | Accepted-answer lists for every translate / type exercise | content | must | yes — accepted[] on every translate/type item | no | yes for Grades 1-2 — en[]/alt[] per phrase (units-g1/g2.js); graded by shared/grade.js | **partial** |
| 11 | AI validation pass: quality + fit with the grade + answer coverage + difficulty | content | must | no | no | no — content is hand-written and checked by scripts/spanish-path-test.js instead | **no** |
| 12 | Vocabulary and grammar ledger across all 57 grades | content | must | no | no | partial — frequency tier per phrase; no cross-grade ledger | **partial** |
| 13 | Level versioning (draft / validated / published / retired) | content | must | no | no | no | **no** |
| 14 | Media manifest: deduplicated TTS audio + image prompts | content | must | partial — TTS cached per line (services/spanish/voice.js) | no | partial — every spoken line rendered once and cached; no image prompts | **partial** |
| 15 | Admin view: browse levels / read validation reports / regenerate / resolve reports | content | should | no | partial — admin panel for learners, not Spanish levels (public/admin.html) | no | **no** |
| 16 | Generation cost and token tracking per run | content | should | no | partial — per-user AI spend (ai_usage) | partial — unchanged | **partial** |
| 17 | Map level types (lesson / quiz / test / dictation / game) to node style and exercise mix | content | must | yes — one level type per engine (lab) | no | yes — slotOf() + RECIPES (services/spanish/path.js, goal-fit.js; GOAL-FIT.md) | **yes** |
| 18 | Units with goal + key phrases from the curriculum (721 units) | learn | must | no | yes — units and goals from the sheet (content/spanish-grades.js) | yes — unit preview shows the goal + key phrases | **yes** |
| 19 | Text-to-speech or recorded audio for every prompt | content | must | yes — ES.audio (core/audio.js) + /api/es/tts | no — Spanish main path had no audio | yes — every Spanish prompt spoken: eleven-v3 via LLM Gateway for listed accounts, else Gemini, else the browser's Spanish voice (core/audio.js) | **yes** |
| 20 | Learning path with zig-zag nodes grouped by unit | learn | must | no | partial — vertical level list grouped by unit (public/js/path.js) | partial — unchanged layout; Spanish rows marked 'saved for later' when the goal puts them aside | **partial** |
| 21 | Node states: locked / current with progress ring / completed | learn | must | no | partial — done / current / locked rows, no progress ring | partial — unchanged | **partial** |
| 22 | Node popover with Lesson n of m and START +XP | learn | must | no | no — row with a Start button | partial — /spanish/learn start card: level n of m, type, minutes, Start | **partial** |
| 23 | Node types: lesson / practice / chest / unit review | learn | must | no | partial — lesson / practice / checkpoint kinds | partial — plus unit review (Unit Check); no chest | **partial** |
| 24 | Node types: story / radio / video call / adventure | learn | could | yes — story, listening_lab, conversation_lab engines | no | yes — Story, Input Session, Listening Lab and Conversation Lab levels play their lab engines; no adventures | **partial** |
| 25 | Unit header banner with guidebook button | learn | must | no | partial — unit headings on the path | partial — unchanged; no guidebook button | **partial** |
| 26 | Unit guidebook (key phrases with audio + grammar tips) | learn | should | partial — unit_intro engine (goal + key phrases + clip) | no | partial — each Unit Intro level plays the preview; no standalone guidebook page | **partial** |
| 27 | Grades overview (57 grades) with CEFR tag and progress | learn | should | partial — lab cards show grade + CEFR | partial — grade list in onboarding and /curriculum | partial — unchanged | **partial** |
| 28 | Jump here / jump to grade via test-out | learn | should | no | yes — unit test-out (routes/placement.js test-out), subject placement | yes — unchanged | **yes** |
| 29 | Unit Check: ungated quiz assembled from the review queue | learn | must | yes — unit_check engine (static due/weak list) | no | yes — Unit Check levels: practice mode from the learner's es_review queue, due then weak then unit, tagged; never blocks (path.js, PASS.review = 0) | **yes** |
| 30 | Top stat bar: course + score / streak / gems / hearts | learn | must | no | partial — header streak / XP | partial — player shows hearts; streak/XP on result card; no gems | **partial** |
| 31 | Course switcher and add a second course | learn | should | no | yes — dashboard subjects + Add a subject | yes — unchanged | **yes** |
| 32 | Lesson player shell: progress bar / hearts / close / skip / check | lesson | must | yes — ui.frame + session.run | no — generic question player | yes — Spanish levels use the lab shell (/spanish/learn) | **yes** |
| 33 | Keyboard shortcuts in lessons (number keys / Enter) | lesson | should | yes — number keys / Enter / Backspace | not checked | yes | **yes** |
| 34 | Exercise: select the image | lesson | must | yes — ex.select_image (exercises/choice.js) | no | yes — new-word picture cards (select_image) | **yes** |
| 35 | Exercise: match pairs | lesson | must | yes — ex.match_pairs (exercises/other.js) | no | yes | **yes** |
| 36 | Exercise: select the correct meaning (character speech bubble) | lesson | must | yes — ex.select_meaning | partial — MC 'What does X mean?' without audio | yes — speaking character bubble with audio | **yes** |
| 37 | Exercise: translate with word bank | lesson | must | yes — ex.translate word bank (exercises/build.js) | no | yes — tap-to-place tiles, both directions | **yes** |
| 38 | Exercise: translate by typing with fuzzy grading | lesson | must | yes — 'Use keyboard' + accent bar + grade.check (typo/accent nudges) | partial — typed answers in some bank items | yes | **yes** |
| 39 | Exercise: tap what you hear | lesson | must | yes — ex.tap_heard | no | yes | **yes** |
| 40 | Exercise: type what you hear with slow-audio button | lesson | must | yes — ex.type_heard + turtle button | no | yes — slow = 0.7x clip or 0.65 browser rate | **yes** |
| 41 | Exercise: speak this sentence (speech recognition) | lesson | must | yes — ex.speak + /api/es/asr (MiMo / Gateway) | no | yes — server transcription when configured, browser Web Speech API (es-ES) as fallback, typing as last resort; 'Can't speak now' | **yes** |
| 42 | Exercise: fill the blank / complete the sentence | lesson | should | yes — ex.fill_choice, ex.complete_translation | partial — MC fill in some bank items | yes — hand-written fills + complete-the-translation | **yes** |
| 43 | Exercise: complete the chat | lesson | could | yes — ex.complete_chat | no | yes — hand-written per unit | **yes** |
| 44 | Exercise: arrange words | lesson | should | yes — word-bank sentence building (translate, tap_heard) | no | yes — same components | **yes** |
| 45 | Exercise: listen and choose | lesson | should | yes — ex.listen_choose, listen_meaning, listen_image | no | yes | **yes** |
| 46 | Exercise: non-Latin script (character to sound / build / trace) | lesson | skip | n/a | n/a | n/a | **skip** |
| 47 | New word tag and introduction | lesson | must | yes — 'New word' tag (ui.header) | no | yes — every new phrase is met first as a NEW WORD card (tested) | **yes** |
| 48 | Answer feedback sheet: correct / incorrect with correct solution | lesson | must | yes — footer.result | partial — right/wrong with rationale | yes — green/red sheet with the correct solution | **yes** |
| 49 | Report an exercise / too easy / too difficult | lesson | should | partial — Report modal, not stored (ui.report) | yes — /items/:id/report for bank items | partial — Report modal in the player is not stored yet | **partial** |
| 50 | Explain my answer (AI explanation of a mistake) | lesson | could | no | partial — coach on bank items (routes/learn.js /items/:id/coach) | no — not in the Spanish player | **no** |
| 51 | Missed exercises re-asked at end of lesson | lesson | must | yes — session.run review phase | no | yes — 'Let's review the exercises you missed' with PREVIOUS MISTAKE tag | **yes** |
| 52 | Combo counter (N IN A ROW) and gold progress bar | lesson | should | yes | no | yes | **yes** |
| 53 | Mid-lesson encouragement interstitials | lesson | should | yes | no | yes | **yes** |
| 54 | Quit lesson confirmation | lesson | must | yes — ui.confirmQuit | no | yes — quitting returns to the path | **yes** |
| 55 | Sound effects and haptics for correct / wrong / complete | lesson | must | yes — sfx.js (no haptics) | no | partial — sounds yes, haptics no | **partial** |
| 56 | Lesson complete screen (XP / accuracy / time) | lesson | must | yes — ui.complete | partial — session recap | yes — lab screen, then a result card with first-try %, XP and review queue (learn.js) | **yes** |
| 57 | Review lesson (see your answers) | lesson | could | no | partial — held-feedback review in sessions | no — not in the Spanish player | **no** |
| 58 | Post-lesson reward sequence (streak / quests / gems / score) | lesson | must | partial — streak screen (local only) | partial — XP + streak | partial — real streak screen and XP; no quests or gems | **partial** |
| 59 | Legendary challenge on completed nodes | lesson | could | no | no | no | **no** |
| 60 | Stories player | content | must | yes — story engine | no | yes — Story levels (scene + questions + say two captions aloud) | **yes** |
| 61 | Listening Lab: short clips + questions + repeat-after-me | content | must | yes — listening_lab engine | no | yes — Listening Lab levels (two clips from the unit scene, questions, repeat-after-me) | **yes** |
| 62 | Adventures (game-like scenes) | content | skip | no | no | no | **skip** |
| 63 | XP awarded per lesson with bonuses | gamification | must | partial — local XP | yes — mastery.xpForItems + streak.record | yes — 10 per level (+5 at 95%+), 5 for a failed try | **yes** |
| 64 | Daily goal (5/10/15/20 min or XP) | gamification | must | no | no | no | **no** |
| 65 | Streak counting with local-midnight cutoff | gamification | must | no | yes — local day, grace day (services/streak.js) | yes — Spanish levels count toward it | **yes** |
| 66 | Streak extended screen with week strip | gamification | must | yes — ui.streak | no | yes — shown after a passed level with the account's real streak | **yes** |
| 67 | Streak goal commitment (7/14/30/50) | gamification | could | no | no | no | **no** |
| 68 | Streak freeze (buy with gems / max 2 equipped) | gamification | should | no | partial — one grace day per 7 (streak.js) | partial — unchanged | **partial** |
| 69 | Streak repair after a break | gamification | could | no | no | no | **no** |
| 70 | Streak calendar detail | gamification | should | no | partial — study calendar (calendar.html) | partial — unchanged | **partial** |
| 71 | Hearts: lose on mistake / refill over time / refill with gems | gamification | must | yes — hearts, lab refills free | no | partial — lose a heart per mistake; refill is free (no timer, no gems) | **partial** |
| 72 | Energy system alternative to hearts | gamification | could | no | no | no | **no** |
| 73 | Practice lesson to earn hearts back | gamification | should | no | no | no | **no** |
| 74 | Gems wallet and earning (quests / chests / goals) | gamification | should | no | no | no | **no** |
| 75 | Shop: heart refill / streak freeze / XP boost | gamification | should | no | no | no | **no** |
| 76 | Daily quests (3 per day with timer and chest) | gamification | should | no | no | no | **no** |
| 77 | Monthly challenge badge | gamification | could | no | no | no | **no** |
| 78 | Achievements with tiers | gamification | could | no | no | no | **no** |
| 79 | Progress score per course (Duolingo Score-like) | gamification | could | no | partial — learning scorecard (services/scorecard) | partial — Spanish answers feed mastery; no Duolingo-style score | **partial** |
| 80 | Practice hub: mistakes review | practice | should | partial — unit_check from a static list | partial — daily review (services/review-session.js) | partial — missed phrases come back first in the next level and in Unit Checks; no separate mistakes page | **partial** |
| 81 | Practice hub: words list and words practice | practice | should | no | no | partial — the path page shows the review queue counts; no words list page | **partial** |
| 82 | Practice hub: speak / listen focused sessions | practice | could | no | no | no | **no** |
| 83 | Spaced-review queue (per learner, item-level) | practice | must | partial — lab unit check uses a fixed due/weak list | no — skill-level schedule only (skill_states) | yes — es_review: per learner per phrase, boxes 0-6, due times, right/wrong; feeds every level and Unit Checks (path.js) | **yes** |
| 84 | Weekly leagues with 10 tiers and promotion / demotion | social | should | no | no | no | **no** |
| 85 | Leaderboard locked until N lessons | social | could | no | no | no | **no** |
| 86 | League results screen | social | should | no | no | no | **no** |
| 87 | Diamond tournament | social | skip | no | no | no | **skip** |
| 88 | Follow users / followers list | social | could | no | no | no | **no** |
| 89 | Find friends (search / invite link) | social | could | no | no | no | **no** |
| 90 | Block and report users | social | should | no | no | no | **no** |
| 91 | Friend streaks (up to 5) | social | could | no | no | no | **no** |
| 92 | Friends quests (weekly pair goal) | social | could | no | no | no | **no** |
| 93 | Activity feed | social | skip | no | no | no | **skip** |
| 94 | Under-13 mode disables social features | social | must | n/a | n/a — no social features; child accounts and consent exist (routes/consent.js) | n/a | **n/a** |
| 95 | Private profile toggle disables leagues and friends | social | should | no | no | no | **no** |
| 96 | Profile page with stats and achievements | profile | should | no | partial — /profile with stats | partial — unchanged | **partial** |
| 97 | Avatar builder | profile | could | no | no | no | **no** |
| 98 | Settings: preferences (sfx / animations / listening / speaking / dark mode) | settings | must | partial — es-prefs sfx in localStorage, theme buttons in the lab | partial — profile preferences (hide stats, break nudge) | partial — 'Can't speak/listen now' switches; no settings page for them | **partial** |
| 99 | Settings: notifications and practice reminder time | settings | should | no | partial — next-study plan (dashboard) | partial — unchanged | **partial** |
| 100 | Push reminders (practice / streak at risk) | notifications | should | no | no | no | **no** |
| 101 | Email reminders and weekly progress | notifications | could | no | no | no | **no** |
| 102 | Settings: remove or reset a course | settings | should | no | yes — DELETE /api/enrollments/:id, retake placement | yes — unchanged | **yes** |
| 103 | Dark mode | settings | should | yes — tokens.css dark theme | yes | yes — the player follows the system theme | **yes** |
| 104 | Subscription tier removing hearts limit and ads | monetisation | should | no | partial — subscription field on the profile | partial — unchanged | **partial** |
| 105 | Web payments (Stripe) for subscription | monetisation | should | no | no | no | **no** |
| 106 | In-app purchase on iOS / Android with shared entitlement | monetisation | should | no | no | no | **no** |
| 107 | Free trial | monetisation | could | no | no | no | **no** |
| 108 | Family plan (up to 6) | monetisation | could | no | no | no | **no** |
| 109 | Gem packs bought with real money | monetisation | skip | no | no | no | **skip** |
| 110 | Ads after lessons | monetisation | skip | no | no | no | **skip** |
| 111 | Conversation Lab: AI partner role-play with information gap and outcome check | ai | must | yes — conversation_lab + ai-activities.js (scripted partner without AI) | no | yes — one per unit for Grades 1-2 (units-*.js convo); AI partner when a key is set, scripted partner otherwise; counts goals reached | **yes** |
| 112 | Offline lessons (mobile) | platform | could | no | no | no | **no** |
| 113 | Home-screen streak widget (iOS / Android) | platform | skip | no | no | no | **skip** |
| 114 | Duolingo course content (sentences / audio / art / characters) | content | skip | no | no | no | **skip** |
| 115 | Duo owl mascot and Duolingo brand | brand | skip | no | no | no | **skip** |
| 116 | Duolingo English Test / Chess / Math / Music | scope | skip | no | no | no | **skip** |
| 117 | Duolingo Score CEFR calibration | scope | skip | no | no | no | **skip** |
| 118 | Curriculum importer: unpivot the wide CSV into grades / units / levels | content | must | n/a | yes — scripts/build-spanish-grades.js | yes — unchanged | **yes** |
| 119 | Lemma target per grade checked against the ledger | content | must | no | no | no | **no** |
| 120 | Unit intro card: goal + 5 key phrases + 30-second clip + repeat | learn | must | yes — unit_intro | no | yes — Unit Intro levels: goal, key phrases from the sheet, scene clip, repeat, guess | **yes** |
| 121 | Input Session: serialized story with recurring characters / pictures / slow audio | learn | must | yes — story engine with passPct 80 | no | yes — one episode per unit with the recurring cast, slow audio, picture/meaning checks, 80% pass | **yes** |
| 122 | Recurring story characters with consistent voices and art | content | should | yes — cast + voices.json | no | yes — Mara, Tomás, Rosa, Diego with one voice each | **yes** |
| 123 | Reader: tap any word for audio and gloss | learn | must | yes — reading_block engine, glosses in translate items | no | partial — tap-a-word hints on translate items, tap a story line for its meaning; no reader page | **partial** |
| 124 | Reading Block: graded reader picked from a pre-generated pool by learner interest | learn | should | yes — reading_block engine | no | no — Reading Block levels stay on the ordinary session (put aside for a conversation goal) | **lab** |
| 125 | Learner interests profile | onboarding | should | partial — interest picked per reading block | no | no | **lab** |
| 126 | Dictation with errors auto-tagged as sound or spelling | lesson | must | yes — dictation engine + grade.diff tags | no | partial — Dictation levels with sound/spelling/accent tags shown; tags are not stored in an error log | **partial** |
| 127 | Quick Game: Listen and Tap | game | must | yes — quick_game listen_tap | partial — Quick Game levels open the generic game engines (config/game-assignments.js) | lab — unchanged in the main path | **lab** |
| 128 | Quick Game: Word Race | game | must | yes — quick_game word_race | partial — generic game engine | lab — unchanged | **lab** |
| 129 | Quick Game: Sentence Builder | game | must | yes — quick_game sentence_builder | partial — generic game engine | lab — unchanged | **lab** |
| 130 | Quick Game: Fix the Sentence | game | should | yes — quick_game fix_sentence | partial — generic game engine | lab — unchanged | **lab** |
| 131 | Quick Game: Memory Pairs | game | should | yes — quick_game memory_pairs | partial — generic game engine | lab — unchanged | **lab** |
| 132 | Quick Game: Speed Match | game | should | yes — quick_game speed_match | partial — generic game engine | lab — unchanged | **lab** |
| 133 | Fluency Sprint / Chunk Speed Drill (timed speaking rounds) | game | must | yes — fluency_sprint engine | no | yes — Chunk Speed Drill levels from the unit's most frequent phrases (self-check when no microphone) | **yes** |
| 134 | Pronunciation scoring incl. speech rate and pausing | lesson | must | yes — recorder.js speech rate / pauses in exam samples | no | partial — speak items are scored on words recognised, not on rate or pausing | **partial** |
| 135 | Writing Lab: plan / draft / AI feedback on 2-3 priorities / revise / model answer | lesson | must | yes — writing_lab engine | no | no — Writing Lab levels stay on the ordinary session (put aside for a conversation goal) | **lab** |
| 136 | Mediation task: summarize a source for a reader in the other language | lesson | should | yes — writing_lab (mediation) | no | no | **lab** |
| 137 | Error log with tags (sound / spelling / grammar / vocab) | learner model | must | partial — dictation tags, sound refresh demo log | partial — error tags on skill states | partial — wrong counts per phrase in es_review; no tagged error log | **partial** |
| 138 | Weak-spot list driving checks / games / finals | learner model | must | partial — fixed weak list in the lab | partial — weak skills (mastery.weakSkills) | partial — weak phrases come back first in levels and Unit Checks; Finals and games do not read them | **partial** |
| 139 | Checkpoint every ~3 units: 80% gate / targeted repair / retake | assessment | must | yes — exam engine with repair + retake | partial — checkpoints in the ordinary session | partial — Checkpoint levels: two review rounds over the covered units, 80% to pass, retake rebuilt with misses first; no recorded speaking or writing sample | **partial** |
| 140 | Final exam per grade: 80% pass unlocks the next grade | assessment | must | yes — exam engine | partial — the grade's Final in the ordinary session (pass mark from config) | partial — unchanged (ordinary session) | **partial** |
| 141 | Grade Project: record audio or video + AI exchange + rubric + one revision | assessment | must | yes — project engine | no | no — the Grade Project stays on the ordinary session (put aside for a conversation goal) | **lab** |
| 142 | Rubric scoring by LLM (task completion / accuracy / range / pronunciation or fluency) | assessment | must | yes — ai-activities.js rubrics | partial — essays rubric for English | partial — conversation rubric in the Conversation Lab; no writing or project rubric in the main path | **partial** |
| 143 | Optional units (skippable blocks on the path) | learn | should | no | partial — rows marked Optional unit | partial — a conversation goal steps over Optional unit levels; others walk them | **partial** |
| 144 | Domain electives picker (30 domains incl. regional varieties) | learn | should | no | no | no | **no** |
| 145 | Elective tracks after grade 42 (culture / literature / translation / linguistics / teaching) | learn | could | no | partial — the grades exist; no picker | no | **no** |
| 146 | Live Conversation: upload a 2-minute excerpt + rubric + flagged AI stand-in | social | should | yes — live_conversation engine | no | no | **lab** |
| 147 | Peer / tutor matching for live conversation | social | could | no | no | no | **no** |
| 148 | Real-World Mission: upload recording or log + self-assessment | assessment | could | yes — mission engine | no | no | **lab** |
| 149 | Per-learner AI cost budgets and rate limits | platform | must | yes — ai.withinBudget + rate limits on /api/es | yes — ai budgets | yes — unchanged; voice limited per account (SPANISH_GATEWAY_DAILY_CHARS) | **yes** |
