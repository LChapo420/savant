# Goal fit: how the main Spanish path uses the learner's goal

Code: `services/spanish/goal-fit.js` (the rules), `services/spanish/path.js` (building a level),
`services/learner-path.js` `nextLevelAfter` (stepping over levels). Test: `scripts/spanish-path-test.js`,
which checks this page's Grade 1 table and that every profile and slot below is named here.

Everything is a fixed rule. No model is asked, so each decision can be traced to a line of this page.

## 1. Input: the goal the learner picked

The goal picker (`services/goals.js`, shown before placement, on the path page and on the profile)
already had five choices. Spanish adds a sixth, shown on Spanish only:

> **Speak and understand everyday Spanish, fast** (`conversation`)

| goal the learner set | profile |
| --- | --- |
| Speak and understand everyday Spanish, fast | `conversation` |
| Just the essentials, fast | `conversation` (for Spanish, the essentials are the most-used spoken phrases) |
| Something specific, with text containing one of: convers, speak, talk, chat, fluent, travel, trip, vacation, holiday, everyday, survive, survival, impress, progress, fast, quick, days, week, listen, understand, hablar, conversación | `conversation` |
| Prepare for a test or exam | `test` |
| Learn it as deeply as possible, Enough for the next grade, anything else, or no goal | `standard` |

So "Conversational in 4 days" and "the most impressive progress possible", typed into "Something
specific", both give `conversation`.

**The owner's account.** `services/goals.js` gives the owner the unmodified base product
(`OWNER_BASE`). The Spanish goal fit is different: it is a choice the learner makes, can see and can
clear on the path page, so it applies to every account by default, the owner included. Two switches:
`SPANISH_GOAL_FIT=respect-owner-base` follows the owner rule (no goal fit for the owner), and
`SPANISH_GOAL_FIT=off` turns goal fit off for everyone.

## 2. Which levels come next

The `standard` and `test` profiles walk every level in the course order.

The `conversation` profile **puts aside** these levels. The path steps over them, the path page marks
them "Saved for later by your goal", and once the learner has passed them they can still open them:

| rule (checked in this order) | reason shown |
| --- | --- |
| Never put aside: Entry Check, Unit Intro, Unit Check, Checkpoint, Final, or the grade's last level | (kept) |
| Path column is `Enrichment` | Enrichment (culture and extras) |
| Path column is `Optional unit` | Optional in the course |
| Path column starts with `Domain` | A specialist domain |
| Writing Lab, Essay Writing Lab, Mediation Task, Grade Project, Live Conversation, Mission, Reading Block, Sound Refresh | (activity) (long-form practice) |
| A Pronunciation / Topic level that is not the first pronunciation level of its unit | Extra pronunciation detail |

Grade 1 (Sounds and Survival Words) with a `conversation` goal puts aside 14 of 94 levels: **3, 20, 36, 37, 45, 46, 57, 58, 69, 75, 76, 77, 84, 93**
(the welcome/culture lesson, the second and third pronunciation levels of a unit, the reading blocks,
sound refreshes, the writing lab, "Spanish around you in the US" and the grade project). Grade 2 puts
aside 38 of 135, most of them the curriculum's own "Optional unit" levels (units 2.3, 2.5 and 2.10).

A learner already standing on a level that is put aside (placement lands a beginner on level 3, the
culture lesson) is moved on to the next kept level (level 4, cognates) the next time they open the path
or start a session.

Units are not reordered: each unit builds on the one before, and the Unit Checks and Checkpoints
measure them in order.

## 3. What each level holds

Each playable level type is a **slot**, and each slot has a fixed **recipe**: an ordered list of
Duolingo-style activities (the lab's own exercise components). The profile picks the recipe.

| Level Type / Activity | slot |
| --- | --- |
| Lesson / Topic (vocabulary) | vocabulary |
| Lesson / Topic (grammar, "sentence x-ray") | grammar |
| Lesson / Topic (culture) and Reading / Topic | reading |
| Listening / Topic | listening |
| Speaking / Topic | speaking |
| Pronunciation / Topic and Sound Refresh | pronunciation |
| Writing / Topic and Translating / Topic | writing |
| Quiz / Unit Check, Review Game, Game / Topic | review |
| Test / Checkpoint | review, twice over, pass mark 80% |
| Preview / Unit Intro, Story, Input Session, Listening Lab, Dictation, Conversation Lab, Fluency Sprint | the lab engine of the same name |

Recipe length, and how many of the activities are listening and speaking, per slot and profile:

| slot | `standard` | `conversation` | `test` |
| --- | --- | --- | --- |
| vocabulary | 14 (3 listen, 1 speak) | 14 (4 listen, 3 speak) | 14 (2 listen, 0 speak) |
| grammar | 12 (0 listen, 1 speak) | 12 (4 listen, 3 speak) | 11 (1 listen, 0 speak) |
| listening | 11 (11 listen, 0 speak) | 12 (11 listen, 1 speak) | 10 (10 listen, 0 speak) |
| speaking | 10 (2 listen, 6 speak) | 11 (4 listen, 5 speak) | 9 (2 listen, 4 speak) |
| pronunciation | 9 (4 listen, 4 speak) | 7 (3 listen, 3 speak) | 7 (4 listen, 2 speak) |
| reading | 10 (0 listen, 0 speak) | 9 (2 listen, 2 speak) | 10 (0 listen, 0 speak) |
| writing | 8 (2 listen, 0 speak) | 7 (3 listen, 2 speak) | 8 (2 listen, 0 speak) |
| review | 12 (5 listen, 1 speak) | 12 (6 listen, 3 speak) | 12 (4 listen, 0 speak) |

("Listen" counts what do you hear, what does this mean (audio), tap the picture you hear, tap what you
hear, type what you hear and which word do you hear. A "Can't speak now" or "Can't listen now" tap
switches those off for an hour, as in the lab.)

The vocabulary recipe, as an example:

- `standard`: new word ×3, select the meaning, match pairs, what do you hear, select the translation (review), translate to English, translate to Spanish, fill the blank, tap what you hear, speak this sentence, type what you hear (review), translate to Spanish (review).
- `conversation`: new word ×3, what do you hear, select the meaning, speak this sentence, match pairs, tap what you hear, what does this mean (review), speak this sentence (review), complete the chat, type what you hear, translate to English, speak this sentence.
- `test`: new word ×3, select the meaning, select the translation, translate to English, translate to Spanish, match pairs, fill the blank, type what you hear, complete the translation (review), translate to Spanish (review), what does this mean, translate to English (review).

The full lists are `RECIPES` in `services/spanish/goal-fit.js`.

## 4. Which words, and recycling

Every phrase in `content/spanish-path/units-g1.js` and `units-g2.js` has a frequency tier:
1 = among the most frequent and most useful spoken words and chunks (hola, gracias, quiero, ¿dónde
está…?, no entiendo), 2 = common, 3 = topical or rare (socorro, catorce, posiblemente).

- **New words.** A level introduces up to 4 phrases (3 on listening and pronunciation levels, none on
  review levels) that the learner has not met: first the ones matching the level's own title in the
  curriculum (level 26 "Numbers 0 to 10" introduces numbers), then the rest of the unit. The
  `conversation` profile takes them **tier 1 first, then 2, then 3**; the others keep the unit's order.
- **New word first.** Each new phrase appears first as a NEW WORD card (a picture card when there is
  art, else a "select the meaning" card) before any other activity asks it.
- **Recycling.** The other activities draw on phrases met before, in this order: phrases **due** in
  the learner's review queue, then **weak** phrases (missed at least as often as got right), then the
  unit's phrases already met, then the most recently met phrases of the grade. A recycled phrase is
  tagged "Due for review" or "Weak spot" on screen. Within a level the same phrase is not asked twice by
  the same activity, so a new word comes back in different activities (hear it, say it, build it).
- **Review queue.** Item level, per learner (`es_review`). A run moves each phrase one box at most,
  however often it was asked (spacing comes from coming back later): right goes up a box, wrong goes
  back to box 1. Boxes are due after 0, 10 minutes, 4 hours, 1 day, 3 days, 7 days and 16 days.
- **Hand-written items** (fill the blank, complete the chat) are only used when their answer uses words
  the learner has met in this level or before; signs and short passages may be read for gist.

## 5. Passing a level

A level counts as done when the learner finishes it and their first-try answers reach the pass mark:
60% for ordinary levels, 80% for Checkpoints and Input Sessions (the curriculum's marks), none for Unit Checks (they never block, as the curriculum
says). A Conversation Lab needs half of the role-play's goals reached. A Fluency Sprint counts on
completion (its score is shown and kept), because a timed game scored by a speech recogniser should not
hold the path. Below the mark the level is offered again, freshly built, with the missed phrases
due first. Missed exercises are re-asked at the end of every lesson, as in the lab.

Every first-try answer is also mastery evidence for its curriculum skill (`mastery.recordAttempt`), so
the scorecard, the path's skill table and the dashboard see the work.

## 6. The one line the learner sees

On the start card of every level and on the path page, one line says why the path is ordered this way:

- `conversation`: "Your goal is to talk soon, so the most-used words and phrases come first, with more
  listening and speaking. Culture, long writing and extra pronunciation levels are saved for later."
- `test`: "Your goal is a test, so every level stays in order, with more reading, typing and listening
  checks."
- `standard`: "Levels follow the course order with a balanced mix of activities. Set a goal to tune it."

The path page adds how many levels were saved for later and the state of the review queue.

## 7. Why these rules, for a learner with four days

A learner with a few days gets the largest real gain from the words they will hear and say most, met
again and again in different activities, with plenty of listening. The daily Spanish check
(`spanish-check/PROTOCOL.md`, sealed) measures exactly two things: understanding spoken sentences
(typing what you hear) and understanding written sentences (picking the meaning), on sentences
stratified by word frequency. The `conversation` recipes therefore lean on **type what you hear**, **tap
what you hear**, **what does this mean** and frequency-ordered vocabulary, which are general Spanish
skills. Nothing here reads the check's pool or its items, and the content is written for this app (no
Tatoeba sentences), so practice cannot copy a test item.

## 8. What goal fit does not do

- It does not skip units the learner has not shown they know (that is placement and the unit plan).
- It does not change grading, pass marks or what counts as correct.
- It does not reorder units, and it never puts aside a check, a checkpoint or the Final.
- Levels with no written content yet (grades 3 and up, Quick Games, Writing Labs, Reading Blocks, the
  Project and the Final) are played by the ordinary session, as before.
