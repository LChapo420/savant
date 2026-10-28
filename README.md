# Polymath

An adaptive AI tutor. A placement quiz measures what you actually know, a level
path teaches you from there, and after every session the tutor analyzes what
happened and rebuilds the next one around it. Master quizzes every 25 levels,
Grand Master every 100, a Graduation exam at the end of a track.

A session is a sitting, not a level: finish a level and you choose between the
next level and ending the session, so one sitting can run from level 125 to 130.
Each level ends with one quick recall question; the end of the session asks a
wider set covering everything the sitting touched. On any question you have not
answered yet, the coach will work through it with you — it asks questions until
you get there, and it will not tell you the answer.

## The shape of a path

Every level is one of four things, decided by its number:

| Level | What it is |
| --- | --- |
| Every 10th (10, 20, 30, 40, 60 …) | **Lesson** — the product teaches, then checks |
| Every 25th (25, 50, 75, 150 …) | **Master quiz** — 75% to pass |
| Every 100th (100, 200 …) | **Grand Master quiz** — 75% to pass |
| The last level (250) | **Graduation exam** |
| Everything else | **Practice** — questions at that level's difficulty |

A checkpoint is never replaced by a lesson: level 50 is a Master quiz, and the
lesson it displaced moves to level 51, so new material always follows a test
rather than being skipped. Levels 26, 51, 76 and 101 are lessons for that reason.

**In English, a Master or Grand Master is written rather than answered.** A short
quiz on the level's skills, then a topic and a rubric written for you at that
level: you write in the app, it is marked part by part against the rubric with
the evidence quoted from your own text and one specific thing to fix, and below
75% you rewrite until it passes. The Graduation exam stays a written quiz —
a course should still end on a test covering everything in it. The level numbers
mean exactly what the table says in every track; only the delivery changes.

The writing surface is a real one: a formatting toolbar, the usual shortcuts,
undo, and autosave on a two-second debounce, on blur, on hiding or closing the
tab, and before signing out. A draft is kept on the device as well as the server,
so closing the lid with the network down does not lose a paragraph.

Placement lands you on a multiple of ten, so the first thing a new learner sees
is a lesson — never a quiz on material this track has not taught yet.

### Not passing a checkpoint

A Master or Grand Master quiz passes at 75%. Under that, nothing is taken away
and there is no waiting period — two doors open, and both stay open:

- **Retry the quiz.** Same level, same topics, questions written fresh by the
  `regen` model. They are written while you are still reading why you failed, so
  the retry opens immediately rather than under a spinner. A retry that reused the
  questions you just failed would be testing recognition, not the skill, which is
  also why the old cooldown is gone: regenerating every attempt removes the thing
  a cooldown was guarding against.
- **Work on what went wrong.** The tutor reads your actual wrong answers, works
  out the misunderstanding behind them — not the topic, the mistake — and teaches
  those areas one at a time, as four steps: what went wrong, how it works, talk it
  through, practise it. An area counts as worked back up when its drill questions
  come in at 75% or better. **The retry button is on that page the whole time**,
  and nothing there is a prerequisite for taking the quiz again.

  That reading is written **while the quiz is still being taken**. The moment the
  best possible score drops below the pass mark the outcome is settled, so the
  first weak area goes to MiMo pro immediately and is normally finished before the
  learner has stopped answering. The page renders from one request and never waits
  on a model: if the reading has not landed — someone who failed fast and clicked
  straight away — all four steps work on the rule-based version and the tutor's
  reading replaces it in place about fifteen seconds later.

Working the areas back up does not move the level. Only passing the quiz does.

Lessons are written for one learner: the profile sets their depth, whether the
rule or the example comes first, and what the check questions look like. They
are also written **one level early** — when you start the level before a lesson,
that lesson is generated in the background while you work, so it is waiting when
you arrive.

This repository is **Phase 1–3 of [docs/ROADMAP.md](docs/ROADMAP.md)**: the whole
learning loop, working end to end, on six subjects.

## Run it

On Windows, double-click **`start.bat`**; on macOS or Linux, run `./start.sh`.
Either installs dependencies the first time, creates `.env` from `.env.example`
if there is none, and starts the app on **http://localhost:6767**.

To try it with example data, use **`start-demo.bat`** (or `./start-demo.sh`):
it first creates three demo learners who learn very differently — real sittings
played through the app, the level 105 lesson page finished, feedback given — so
the learning scorecard, the profile page and the admin panel have something to
show. Each signs in with the password `demo-password`: `demo-maya@example.com`,
`demo-jordan@example.com` (both on the proficient English grade) and
`demo-sam@example.com` (Algebra 1 part A). All three are on the `pro` plan, so
with an AI key set their levels are written for them.

By hand, the same thing is:

```bash
npm install
npm start
```

Then open http://localhost:6767.

No API key is needed. Without one the site runs entirely on the deterministic
content bank: every screen works, questions are generated procedurally, and
sessions are analyzed by the rule-based analyst. The coach still replies, but
with a fixed nudge rather than a conversation.

### Connecting a model

Copy `.env.example` to `.env` and set a key. Five providers are supported —
`mimo`, `openrouter`, `gemini`, `anthropic`, and `modelflare` — and work is routed
independently, with pinned providers for workflows that require one consistent model:

| Route | What runs there | Provider | Backup |
| --- | --- | --- | --- |
| `fast` | chat: the coach, question help, clarification | Qwen 27B | Gemini flash-lite |
| `deep` | lessons and lesson modification, session analysis, essay and project ideation | MiMo pro | Qwen |
| `diagnose` | reading a failed quiz | MiMo pro | **none, on purpose** |
| `regen` | remaking a failed checkpoint's questions | MiMo flash | Qwen |
| `placement` | writing a subject's full placement quiz | GPT Sol via Modelflare | **none, on purpose** |

```bash
AI_PROVIDER_PLACEMENT=modelflare
MODELFLARE_API_KEY=...
MODELFLARE_BASE_URL=https://modelflare.dev/v1
MODELFLARE_MODEL_PLACEMENT=gpt-6.1-sol

AI_PROVIDER_FAST=openrouter                   # https://openrouter.ai/keys
AI_PROVIDER_FAST_FALLBACK=gemini,mimo
OPENROUTER_API_KEY=...
OPENROUTER_MODEL_FAST=qwen/qwen3.8-27b:free

AI_PROVIDER_DEEP=mimo                         # https://mimo.mi.com
AI_PROVIDER_DEEP_FALLBACK=openrouter,gemini
MIMO_API_KEY=...
MIMO_MODEL_DEEP=mimo-v2.6-pro
MIMO_MODEL_REGEN=mimo-v2.6-flash
```

The chat backup is chosen for latency rather than quality: a coaching turn that
lands two seconds late is not a conversation, whatever it says.

Qwen is reached through two routes, and it matters which. `qwen/qwen3.8-27b:free`
is served by a single upstream provider whose shared pool is saturated most of the
time, so on its own the chat lane spends its life on the Gemini backup. The paid
route for the identical model has eight providers and OpenRouter can route around
a busy one. So the chain is free first, paid second — about 0.002 cents a coaching
turn, bounded by `AI_DAILY_CENTS_PER_USER` — and measured at 0.4–1.6s a turn.
After three saturated replies the free route is set aside for a few minutes,
because probing a busy pool before every turn costs the conversation 100ms for
nothing.

`diagnose` is pinned with no vendor fallback. It decides what a learner is told to
practise, and the rule-based reading of their own wrong answers is a better floor
than a weaker model guessing.

Model slugs move around, so do not guess one:

```bash
npm run ai:models   # prints every model the key in use can actually reach
npm run ai:models -- --placement   # lists the placement key's available models
```

Paste the id you want into that provider's model variable. With a key set, the model authors
questions, grades free responses, writes the session analysis, and runs the
coach — and every one of those paths falls back to the bank if the model is
unavailable, rate limited, over budget, or returns something that fails
validation.

### Why it feels fast

Four decisions, all of them measured rather than assumed:

- **The coach's opening question is written before it is asked for.** After a
  few seconds on the same question — long enough to mean stuck, short enough to
  be ready — the server writes the opener in the background. Clicking for help
  then costs **0ms**, because the answer is already there. Follow-up turns run
  0.4–1.2s.
- **Chat and deep work run on different vendors.** `AI_PROVIDER_FAST` and
  `AI_PROVIDER_DEEP` are set independently, because latency and quality pull in
  opposite directions: writing a lesson can afford two minutes, a conversation
  cannot afford two seconds.
- **The chat lane runs a small model.** `OPENROUTER_MODEL_FAST` is a free
  27B Qwen route, because one coaching turn is roughly a second there against
  ~30s on a large model. Authoring can afford the big model; a conversation
  cannot — and the lane a learner talks to on every turn costs nothing.
- **The coach streams.** First words appear in roughly 400ms instead of the
  learner watching a spinner for the whole reply.
- **Thinking is off for chat**, and the rejection is remembered per model. Worth
  about 3x on the models that accept the switch.
- **Authoring never blocks a session.** Questions are served from the shared
  cache and the model tops it up in the background, so a session opens in
  milliseconds and the model's work is waiting for the next one. Lessons work
  the same way, written a level ahead of where the learner is standing.
- **A daily quota is not waited out.** A per-minute 429 backs off and retries; a
  per-day one sets that model aside until it resets and switches to
  `GEMINI_MODEL_DAILY_FALLBACK`, so hitting the free tier's daily cap costs a
  model, not the feature.

Two lanes keep those apart: background calls are spaced for the free tier's
per-minute limit, chat gets its own lane and never queues behind them.

```bash
npm run check    # generate 16,750 items across every skill and validate them
npm test          # in-process test of placement, mastery, levels, checkpoints, coach
npm run smoke     # end-to-end HTTP walk-through against a running server
npm run check:page  # open the path page in a real browser and read what it renders
npm run repeats   # how often a learner is asked the same question twice
```

### Why questions do not repeat

Most of the content is procedural, so the space is effectively unbounded: the math
generators compute their own answers, and the grammar, reasoning and Spanish banks
are **families** — one rule, with the sentence built from word banks, so eight
authored items become thousands of questions without changing what is tested.

Two things make that work in practice. A question's identity is its prompt, its
answer *and* its options: whole families share one prompt ("Which sentence is
punctuated correctly?") and differ entirely in the four sentences offered, so
keying on the prompt alone made the session dedupe throw away good questions and
then serve a real repeat. And `avoid` spans the learner's recent history, not just
the current sitting, because levels 21 to 23 of a track are the same skill at
almost the same difficulty.

`npm run repeats` measures it two ways and fails if any skill is over target:
climbing a path, which is what a learner meets, and stuck at one difficulty, which
is the strict case. Currently **0.46%** and **1.85%** — against a target of fewer
than 1 repeat in 20.

## What is here

| Subject | Levels available |
| --- | --- |
| Mathematics | Arithmetic Basics, Pre-Algebra, Algebra 1, Algebra 2 |
| English | English Basics, Grammar and Mechanics, Reading Comprehension |
| IQ Training | Reasoning Foundations, Advanced Reasoning |
| ACT Prep | English, Math, Reading, Science |
| Spanish | Entry, Intermediate, Advanced |

Each grade is a 250-level path built from its skills, with difficulty climbing
from 1 to 10 across the path.

## Layout

```
config/
  curriculum.js   tracks, grades, skills, level planning, checkpoint rules — data, not code
  db.js           the only file that knows how data is stored (JSON now, Postgres in Phase 5)
  capabilities.js who may do what beyond the ordinary path
  path-length.js  how long a path has to be, from the topics it has to teach
content/
  bank.js         the generator registry, item identity, and the invariants every item must satisfy
  pool.js         authored items and the family engine: one rule, thousands of questions
  syllabus.js     every skill's topics, in the order a class teaches them
  english-grades.js  the sixteen English grades, generated from the spreadsheet
  reading-grades.js  the sixteen Reading grades, from the second spreadsheet
  math-grades.js     the forty-nine Math grades, from the third spreadsheet
  topics.js       which topic a level teaches, and which family backs it
  phonics-shapes.js  reading and spelling questions for the early grades
  *-shapes.js     the same rules asked a different way — english, math, iq, spanish
  vocab.js        the word banks families draw their sentences from
  *-families.js   english, iq, spanish and generated reading passages
  passages.js     the first reading bank, and passages-2.js the second
  math-items.js   procedural math: the answer is computed, so it is always right
  english-items.js, iq-items.js, spanish-items.js, passages.js, pool.js
services/
  placement.js    building and scoring the placement quiz
  lessons.js      the taught levels: written per learner, one level in advance
  essays.js       the written checkpoint: topic, rubric, draft, and every attempt
  mastery.js      per-skill mastery, spaced review, level progression, checkpoints
  learner.js      the learner profile: stated preference blended with observed behavior
  sessions.js     composing a session from level blocks, grading it, analyzing it
  grading.js      answer comparison, markup filtering, and what a piece of text means
  ai.js           what the tutor asks a model for, and the leak guard on the coach
  remediation.js  a failed checkpoint: what went wrong, and the teaching for it
  providers/      mimo.js, openrouter.js, gemini.js, anthropic.js — the only files that know a vendor exists
routes/           auth, catalog, placement, learn, essays, profile — every page is a thin client over these
public/
  static pages, one JS module per page, shared player and design system
  editor.js    the writing surface: toolbar, shortcuts, undo, caret restore
  curriculum.js  the whole-curriculum view, for the account that may read it
scripts/          content check, self test, smoke test
                  repeats = per-skill worst case, sitting = what a learner meets
                  syllabus = every lesson of every grade, in order
                  check:page = open the path page in a real browser and read it
                  build = regenerate all three sheets' grades
                  build:english / build:reading / build:math = one sheet each
                  lesson:generate = write the base-lesson page for one level
```

## How often a learner sees the same question

`npm run repeats` measures two different things, because they fail differently.

**Same string** is the same question with the same answer. That is a bug, and it
is rare — the avoid set exists to prevent it.

**Same question** is a different string asking the same thing: the same sentence
with a noun swapped, the same four options around a different number. This is the
one learners report, and the exact-string count cannot see it at all.

A family renders hundreds of strings from one idea. `word_choice` produced 1,405
distinct strings testing six confusable words, which is a correct bank and a
boring one. So the bank now also carries **shapes** — a different *task* on the
same material, not a different noun. `add_sub` asks for a plain sum, then for a
missing addend, then for an error to find, then for a rounded estimate, then a
word problem, then a rearrangement. Same arithmetic, six questions.

Two rules make that work:

- **A family declares its `frame`**, the constant part of its question. The
  generator will not offer a family whose frame the learner has just met, so
  reaching for a different question is forced rather than hoped for.
- **The frame is also what the metric counts**, so "is this a new question" is
  something the code can answer instead of something you have to notice.

### Two numbers, and they do not agree

`npm run repeats` puts 120 questions of a *single* skill in front of a learner.
`npm run sitting` builds the blocks a learner actually meets — a dozen questions
drawn from a level plan, usually spread over one or two skills.

They are very different numbers, and the per-skill one is pessimistic by
construction. With `S` shapes available, no generator can beat `(N − S) / N`
repeats in `N` questions, because every shape has to be used twice before any is
used a third time. A skill with seven shapes asked 120 questions **cannot** get
below 93%, however well it rotates. `npm run repeats` now prints that floor
beside each measurement and says which of the two situations it is:

```
add_sub       94.2%  (7 shapes, floor 94.2%)  at its shape limit — needs more shapes
```

Every one of the sixty-seven skills reports "at its shape limit". That is the
point: rotation is working everywhere, and the remaining gap is content volume,
not a bug. Getting under 5% per-skill would need 114 shapes per skill, which is
not a real target — repeating the basic arithmetic *is* the lesson.

So the number to watch is the one a person would recognise. `npm run sitting`
builds the blocks a learner actually meets and reports the mean of seven
independent samples, because a single run is one draw and the spread is wide:

```
over 7 samples of 210 questions each:
  mean 15.9%, median 15.2%, range 14.3% to 18.1%
```

That is down from about 89% before the rotation was fixed. The remaining 16% is
a skill with too few shapes for a twelve-question block, and it is closed by
writing more shapes — not by changing code.

### The three bugs this section exists to document

These are the failures that let repetition ship, twice over. All three passed
every check that existed at the time.

**The shapes never ran.** The wrapper decided whether to serve a shape by
testing for the literal strings `"<skill>||arithmetic"` and `"<skill>||shape"` —
but nothing writes those into the shape set. `generateMany` records the real
frame of whatever it just built, like `"add_sub||# - # ="`, so the test could
never pass and every skill served its base generator forever. `withShapes` in
`content/pool.js` is the fix; the guard is three assertions in `self-test.js`.

**`shapeKey` counted answer variants as separate questions.** A family that
accepts `"1 1/4"` and `"1-1/4"` is one question, and counting them separately
made `systems` report 105 distinct shapes in 120 questions — arithmetically
impossible for a question asked twenty ways.

**No family had a frame, and then every frame was the same.** 231 families
across five files, none of them declaring one, so the shape filter had nothing
to filter on. The frames were then written by hand, and a separate bug in
`onStructure` had every passage family framed `"comparison: undefined"` — the
builder read `.name` and `.frame` off two *functions*, and a function has no
`.frame`. A skill with nine questions reported three shapes and nothing failed.

The frames are hand-written for a reason. Deriving them — rendering each family
twice and keeping the words that agree — collapses all nine punctuation families
onto one frame, which is exactly the pair the picker exists to separate, and
produces fragments like `In "The _ surprised which word is an adjective?"` with
a hole where the sentence was. `self-test.js` now checks that every family has a
frame, that no two in a skill share one, and that none contains `undefined`.

## What a lesson teaches

A skill is not a topic. `parts_of_speech` owns a band of levels, and every one
of those levels used to serve a lesson titled with the skill's name and a level
number — the same lesson, five times, teaching nothing new on the second. So a
skill is an ordered list of topics, in `content/syllabus.js`, and a level takes
the one its position in the grade calls for.

- **English grammar, pronouns** — *Pronouns: personal* → *Subject and object
  pronouns* → *Pronouns: possessive and reflexive* → *Reflexive pronouns* →
  *Relative pronouns* → *Possessive pronouns* → *Which noun a pronoun replaces* →
  *After a preposition* → *Who and whom* → *Unclear references* → *Each other and
  one another*.
- **The first lesson on a skill is the first topic. The last is the last.** A
  learner who finishes the grade has been taught the whole list, in the order it
  should be taught, and has not been told about anything past the end of the
  path.
- **Nothing depends on something later in the list.** Identifying a noun comes
  before choosing between a gerund and a participle, because the second is a
  question about what a word is doing in a sentence and you cannot answer that
  without the first. Nouns and verbs come before agreeing them, agreeing before
  punctuating, punctuating before joining them into longer sentences, and only
  then choosing between words that are all individually correct.

The sequences are real curricula rather than invention: Common Core for the
English and maths grades, Big Ideas Math for the algebra sequence, ACTFL-aligned
district Spanish scope-and-sequences with AP Central's six thematic units for the
advanced Spanish, and College Board and CogAT content families for the IQ tracks.
Every list is 40 to 103 topics, ordered so prerequisites come first.

### A path is as long as its syllabus

`pathLength: 250` was hand-written on all sixteen grades, and it was a lie about
what the grade contains. English basics lists 74 topics; a 250-level path with a
lesson every tenth level holds 25 of them. **Three topics in four were never
taught by any lesson in any grade**, and nothing failed. The path is now derived
from the syllabus in `config/path-length.js`, so adding a topic to a grade cannot
leave it too short to teach it:

| | topics | path | lessons |
|---|---|---|---|
| `math/arithmetic` | 68 | 1200 | 143 |
| `english/basics` | 74 | 1500 | 179 |
| `act/act_math` | 103 | 1600 | 191 |
| `act/act_science` | 40 | 600 | 71 |

The rule is that the *largest* topic list on a grade sets the band size, not the
grade's total. Sizing on the total is what left parts of speech with fourteen
lessons for seventeen topics while the grade as a whole had surplus.

### The questions follow the lesson

A topic that maps to a family — a distinct rule with its own question format —
pins the worked example and the first check to that family, so a lesson titled
"Subject and object pronouns" is not followed by a question about a dangling
participle. The remaining checks come from the rest of the skill, because a family
is one question: three checks all pinned to it are three renderings of the same
sentence frame, which is the repetition the whole layer exists to remove.

The ACT tracks read the syllabus of the subject that owns the material rather
than keeping their own copies. The ACT is not a body of knowledge of its own —
its reading section teaches reading — and a second copy of every rule would drift
within a release.

`self-test.js` checks all of this for every grade: that every lesson has a topic,
that every topic on a syllabus is reached by a lesson, that no grade is too short
to teach its own, that the first lesson of a skill is its first topic and the
last is its last, and that a topic never moves backwards within a skill.

The other four subjects are banded by skill, because there each skill holds its
own list of topics. The English track is not: its grades carry a syllabus, so a
grade is one course and the skills decide what a level is *about* rather than how
long the path is. Banding those lessons per skill would replay the whole list in
every band — English basics has thirty-three topics and seven skills, so each
band would restart at topic one and the last lesson would teach topic five.

## The English track comes from a spreadsheet

Sixteen grades and **8,388 levels**, written by hand in
`creator_files/English_Levels_Topics.csv` and generated into
`content/english-grades.js` by `npm run build:english`. The sheet is the source
of truth; change the sheet and regenerate, because the file and the sheet cannot
both be right if they disagree.

The sheet is a **layout**, not a syllabus. It names every level of every grade —
`App Level #`, `Type`, `Topic / Activity`, `What It Covers`, and an `Est. Min` that
is read and discarded — and levels run 1 to N with nothing missing and nothing
named twice. A grade's path is its highest level plus the graduation exam.

Every level shows **its own title**, with **its own "what it covers"** under it, on
the path, the curriculum page and the session page. Not a lesson per topic walked
by position: level 25 of the second grade is the Summary lesson the sheet puts on
level 25, and so is the text under it.

| | levels | taught lessons | path |
|---|---|---|---|
| Foundations (Preschool–K) | 382 | 50 | 383 |
| Early Reader (1st) | 524 | 70 | 525 |
| Beginning Reader/Writer (2nd) | 555 | 70 | 556 |
| Developing (3rd) | 635 | 78 | 636 |
| Intermediate (4th) | 635 | 78 | 636 |
| Upper Intermediate (5th–6th) | 546 | 66 | 547 |
| Advanced Intermediate (7th–8th) | 527 | 61 | 528 |
| Proficient (9th–10th) | 527 | 61 | 528 |
| Advanced (11th–12th) | 547 | 63 | 548 |
| College Composition (Year 1) | 666 | 78 | 667 |
| Language & Writing Studies (Y2–3) | 348 | 40 | 349 |
| Advanced Undergraduate / Honors | 547 | 63 | 548 |
| Master's | 766 | 88 | 767 |
| Doctoral | 467 | 55 | 468 |
| Postdoctoral / Professional | 398 | 45 | 399 |
| Field Authority | 318 | 37 | 319 |

Only **1,003 of the 8,388 are lessons**. The rest are Testers, Activities,
Summaries, Master and Grand Master quizzes, Essay Drafts and Revisions, and the
exam. Each of the sheet's eleven types is mapped to one of three behaviours — a
teaching block, a sitting with a pass mark, or practice — and the sheet's own word
is kept on the level, so the page says "Activity" where the app means practice.

An `Essay Draft` is written work and is served as a piece of writing; a `Master
Quiz` beside it is multiple choice. Getting that backwards would hand a learner a
quiz they cannot pass where the course asked them to write, so the sheet's word is
the one that decides.

`npm run syllabus` reports both kinds of grade and checks each by its own rule: for
a sheet-backed grade, that every level it names is on the path with its own title
and coverage; for a rule-shaped one, the one-lesson-per-topic checks.

## The Reading track comes from a second spreadsheet

Sixteen grades and **6,578 levels**, written in
`creator_files/Reading_Levels_Topics.csv` and generated into
`content/reading-grades.js` by `npm run build:reading`. The sheet has the same shape
as the English one — five columns per grade, the same eleven types, levels 1 to N
with nothing missing — so the same generator reads both.

Reading is a **track of its own**, not more English grades. English asks about the
craft of writing and about language; Reading asks what a text says, why it says it,
and how a reader gets there. So the two have separate sheets, separate grades and
separate questions, and they sit side by side on the dashboard.

| | levels | taught lessons | path |
|---|---|---|---|
| Reading Foundations (Preschool–K) | 460 | 61 | 461 |
| Early Decoder (1st) | 475 | 62 | 476 |
| Beginning Reader (2nd) | 367 | 45 | 368 |
| Developing Reader (3rd) | 357 | 44 | 358 |
| Intermediate Reader (4th) | 407 | 49 | 408 |
| Upper Intermediate Reader (5th–6th) | 397 | 48 | 398 |
| Advanced Intermediate Reader (7th–8th) | 457 | 54 | 458 |
| Proficient Reader (9th–10th) | 537 | 62 | 538 |
| Advanced Reader (11th–12th) | 507 | 59 | 508 |
| College Academic Reading (Year 1) | 298 | 35 | 299 |
| Literary Studies (Y2–3) | 646 | 76 | 647 |
| Advanced Undergraduate / Honors | 557 | 64 | 558 |
| Master's | 557 | 64 | 558 |
| Doctoral | 268 | 32 | 269 |
| Postdoctoral / Professional | 149 | 17 | 150 |
| Field Authority | 139 | 16 | 140 |

The two sheets are read by one piece of code, `scripts/build-sheet-track.js`. That is
deliberate. The English generator used to carry its own copy of the CSV reader, the
type map and the level rule, and it had already drifted from a second copy of that
rule twice — which is what `config/level-layout.js` exists to stop. A third copy,
written for a second subject, is the same mistake with more places to make it.

Each generator keeps only what is its own sheet's: the grade names a learner sees,
and the skill a level's questions come from. The English sheet's skill rules are
about grammar and composition; the Reading ones are about decoding, main idea,
evidence, purpose and literary reading. A level the rules miss is served from the
whole skill its grade is built from, which is a broader question rather than a
wrong one — and for Reading that is 103 of 6,578 levels, all of them structural
ones like "Grade Review Activity 8 of 9 (retention): Weak Spots", which are not
about any particular rule.

A drill takes its skill from the lesson it names, so "Activity 3 of 9 (quiz/game):
Blend and Read Words - Silent Letters" is asked from phonics. That inheritance is
why a rule worded too loosely does real damage: an early draft matched the bare
word "book" and put "The Second **Book** Project" and "Choosing and Enjoying
**Books** on Your Own" on `phonics`, which put college and postdoctoral Reading
levels on questions about letter sounds. Tightening it took the track's repeat rate
from 21.9% to 17.7%.

### The opening levels were on the wire and not on the page

Levels 1 to 9 went missing from the Reading path three times, and each time the
checks that existed agreed. Both halves of that sentence are worth keeping.

**The checks agreed because they counted.** One line said "all 6578 levels of the
sixteen Reading grades are served". That is true if fifteen grades are perfect and
the sixteenth has no opening levels — and a total cannot be read to find out which
grade, so the number was never going to catch it. The checks are now per grade and
name the one that is wrong.

**The levels were being lost between the route and the page.** The route sends
every node from level 1, and `public/js/path.js` draws every node it is handed.
The fault was one layer out: `/api` responses carried **no `Cache-Control` at
all**, so the browser was free to apply a heuristic freshness lifetime and re-serve
a stored `/api/path/…` on the next click. The static scripts already said
`no-store`, so the JavaScript was always current and the data was not — which is
why re-reading the path code proved nothing. Every `/api` response is now
`no-store`, and a response with no cache header is a response that may be cached.

The lesson is that "the data is right" and "the page shows the data" are separate
claims, and only the second one is what a person sees.

**The checks were also tested against the bug.** A check that has never gone red
is not known to work, so a grade is broken on purpose in four shapes — levels 1-9
removed, a hole in the middle at level 200, levels present but with their titles
stripped, and the tail trimmed — and each is required to fail the check *and name
the grade*. Two of those four passed silently the first time. A grade with a
`levels` array is treated by the layout as fully stated, so removing nine levels
from it does not make them vanish: they come back as bare `practice` with no title,
which is exactly what an empty opening looks like on screen. Checking presence was
not enough; the check now looks at the title and the type too.

The same walk covers every grade of every subject, not only the sheet-backed ones,
so a Math sheet landing tomorrow is verified by the same code with nothing to add.

**And the page itself is now checked, in a browser.** `npm run check:page` drives a
real Chrome through `agent-browser`, signs in, opens the same
`/path?enrollment=…` URL the dashboard's "View path" link points at, and reads the
rendered DOM for all sixteen Reading grades. It reports 16 of 16 levels 1 to 9
rendered as Testers, with the lesson at level 10.

That check exists because everything else reads the *data* — the layout, the route,
the node list — and none of them can read the page. That gap is where a fault
survived three reports: the data was right, the route was right, the scripts were
fresh, and the page still did not show the opening levels. Three different kinds of
evidence have now been asked, and the browser is the one that can actually see it.

Two things had to be got right for the browser walk to mean anything, and both
failed first:

- **A real navigation, not `pushState`.** This is a multi-page app: every route
  serves its own `<script>` tags. Pushing a new path leaves the previous page's
  script loaded and the new route never mounts, so all sixteen grades reported zero
  rows. That is a true result about a client-side router and a false one here.
- **An account that already holds the grades.** The route *skips* a duplicate
  enrollment rather than returning the existing one, so a second run finds nothing
  created and reports sixteen missing grades. The walk now reads the account's own
  enrollments back.

One more trap worth naming, because it produced a convincing wrong answer: the
enrollment route takes ten selections at a time and silently drops the rest. Asking
for sixteen grades in one request returns ten, and the six that were never asked for
look exactly like six broken grades.

**And then the same fault turned up a third time, on the curriculum page.** There
are three separate code paths for "what does the opening of a grade look like" — the
layout, the `/path` route, and the curriculum page's own click handler — and each in
turn was right while the others were wrong. On `/curriculum` a *track* click reset
the level slice to 1 and a *grade* click two lines below it anchored to "the account's
current level, or the first lesson". On a sheet-backed course the first lesson is
level 10, because the sheet puts nine entry checks ahead of it — so clicking a grade
showed a list starting at level 10, and clicking the subject above it showed level 1.

That anchor is now gone. A grade opens at level 1, because this is a table of
contents and a table of contents that starts in the middle of chapter two is not
one. An account's own position belongs to the path, which draws from level 1 too and
marks where the learner stands. A level can still be linked to directly — `from` is
in the URL, so `/curriculum?grade=foundations&from=200` opens on level 201.

The page check now walks that too, clicking all sixteen grades on `/curriculum` and
reading where each list starts. It reports 16 of 16. It clicks rather than following
a `?grade=` URL on purpose: a URL takes a different route through the code and would
have passed the whole time the bug was live.

## The Math track comes from a third spreadsheet

Forty-nine grades and **28,780 levels**, from `creator_files/Math_Levels_Topics.csv`
into `content/math-grades.js` by `npm run build:math`. That is more levels than
English and Reading together, and it takes the app to 43,746 sheet-named levels
across three tracks.

It replaces the four rule-shaped grades the track had — `arithmetic`,
`prealgebra`, `algebra1`, `algebra2` — which had no sheet behind them. Two things
follow from replacing them, and both are worth stating because neither is obvious:

**The 1,728 enrollments on those four grades were moved, not kept.** A grade id is
referenced by stored rows, so keeping `algebra1` and changing what it points at
would leave every one of those learners on a course whose level numbers mean
something different. `scripts/migrate-math-enrollments.js` maps each old grade to
the sheet grade covering the same ground and puts the learner back in front of the
placement quiz on the new one — their level, their XP, their mastery and their
sessions all stay, because those are facts about the learner rather than about the
grade. The level does not, because a level is a position on a course. It reports
before it acts, refuses to act without `--apply`, and is safe to run twice.

**A "Written Task" is the Math sheet's word for an Essay.** The English and
Reading sheets call it an Essay Draft and the Math sheet calls it a Written Task,
and both are a checkpoint the learner answers in writing: a short quiz to check it
and a piece of writing marked against a rubric. The sheet's own word is still what
the page prints, so a learner sees whichever their course uses. Adding two types to
the generator's table was the whole of the app change; the behaviour was already
there and already tested.

### Three things that went wrong quietly

All three were in the generator, all three were invisible in the output, and each
is now checked or stated in the code:

**The tiers collapsed.** A grade's tier decides how long its placement quiz is, and
the first version read the grade number out of the band with `[1-8]` — so "9th
Grade, first half" and everything after it fell through to the preschool branch.
Twenty-three of the forty-nine grades were filed as tier 1, which is a
twenty-question placement quiz in a doctoral course. Nothing said so: a grade filed
a band too low still renders, still has all 28,780 levels, and still has a title.
The generator now separates "names a school year" from "names a college year"
rather than relying on a zero that means both, and prints the tier counts.

**Drills on labelled lessons found no lesson.** The electives grade labels each
lesson with its field — "[Pure Math] …" — but a drill names the lesson *without*
the label. Matching the drill's name against the lesson's title found nothing, and
268 levels were left with no skill: every lesson in that grade was fine and every
drill on them was not. A lesson is now indexed under both its title and its title
with the label stripped.

**Rules that match too much.** The first pass at the skill rules left 2,491 of the
28,780 levels with no skill, and 2,265 of those were drills on just 48 lessons the
rules missed. Because a drill inherits its lesson's skill, the rules have to be
written against the *lessons*; against the drills they look fine and change
nothing. It is now 4, and all four are structural rows — "Grade Review Activity 5
of 9 (quiz/game): Part 5 of 7" — which name no rule and are served from the whole
skill.

### What the tests had to stop assuming

Replacing those four grades broke a set of tests that had been asserting things
about *them* rather than about the machinery. The checkpoint tests put the learner
on level 25 because that was where the arithmetic rule's first quiz was; the jump
tests asserted that levels 25, 50, 75, 100 and 125 had been passed; the placement
test expected 35 questions at tier 3 and a level 80% up a 250-level path. All of
those numbers belonged to grades that no longer exist, and the levels a sheet puts
its quizzes on are wherever the sheet puts them — 51 on `algebra_1_part_a`, 31 on
`sense_of_quantity`.

So those tests now ask the layout where the level is rather than naming it, and the
one that needed a rule-shaped grade builds one instead of borrowing it: the
arithmetic rule is still the fallback for the nine grades that are on it, and it
needed a grade on the rule to be tested at all.

## Base lessons: one prompt, one page, one button

A **base lesson** is the lesson as the course teaches it, before any tailoring to a
learner — one page per level, the same for everybody allowed to see it. It is
worth generating because it is the thing later tailoring adapts: a version to
remember is not the same as a version to start from.

Everything in the prompt is read from the curriculum, never typed:

| field | from |
|---|---|
| subject | the track |
| topic name | the level's title, from the sheet |
| topic generalization | the level's "what it covers", the same text |
| grade band, age range | the grade's band, and its average age − 2 and + 2 |
| level number | the level on the path |
| lesson sequence number | its chronological position among the grade's lessons |
| previous, future lessons | the lessons either side of it |

The **age rule is the creator's** and is checked against his own worked example: a
3rd grader averages 8 and is taught to ages 6–10, and the rule reproduces that
exactly. A band naming no school year gets no invented age — the prompt says so
rather than guessing, because a default age would be a number stated as fact.

The **sequence number is a count, not a level number.** A grade's lessons are ten or
twenty-five levels apart, so lesson 12 of 61 can sit on level 105. Confusing the
two is the easy mistake and it picks the wrong game engine, since the engine is
`((sequence − 1) % 20) + 1`.

### Who sees a generated page

The owner's account, and anything on `BASE_LESSON_ACCOUNTS` — a list in `.env`, the
same shape as every other list there. The app has no subscription table and no
billing, so this answers from what there is rather than inventing a model. An
account that may not see them is told of no generated lessons, which the client
reads as "none exist" and shows no link; the API answers 404 rather than 403,
because a 403 would confirm a page exists where a 404 does not.

### The page is not trusted to do anything

The HTML is model-written, so it is trusted to *display* and not to *act*. Its
Finish button calls `window.polymathFinishLesson()`, which the shell defines, with
the enrollment id from the URL and the level from the layout — never anything the
page says about itself. Finishing goes through `mastery.completeLesson`, the same
call the session path makes, so a generated lesson and a written one advance by
the same rule.

That call was `tryLevelUp` at first, which is the whole of a bug worth recording:
`tryLevelUp` decides *practice* levels by mastery and reports a lesson as
`requires: 'lesson'` without moving anybody. The button recorded the mastery, the
gate said the level was ready, and the learner sat where they were with a button
that appeared to do nothing.

### This model needs the page in pieces

`stealth/space-bunny-alpha` **returns nothing for a whole page.** Zero characters of
content, 100,000-odd of reasoning, `finish: length` — at 24,000 tokens, at 12,000,
at 8,000. The obvious explanations are all wrong, and each was measured:

- **Not the budget.** Three budgets, three empties.
- **Not reasoning.** Reasoning is *mandatory* on this endpoint — `enabled: false`
  is a 400 — and omitting the field answers a short ask perfectly.
- **Not markup.** Asked for the same lesson as HTML it returned 26,268 characters.
- **Not the prompt's length.** Trimmed to a third of it, still empty.
- **Not one section.** A single section on its own: empty, 55,863 of reasoning.

What is left is the *shape*. Every request that came back asked for content and a
shape together — prose, or markup with no palette. Every request that came back
empty asked for content and a shape together **and** rules for how the shape
behaves. A model reasoning about a page it must invent whole spends its budget
designing the page instead of writing it, and it never finishes designing.

The two halves are separable, and each lands:

| asked for | came back |
|---|---|
| the teaching, as HTML, no palette, no contract | 2,184 characters, `finish: stop` |
| the page's CSS, with no content at all | 16,167 characters, `finish: stop` |

So the page is written that way. Nine calls: one for the page's CSS, one per
section for the teaching, one for the behaviour and the button. The class names are
fixed in `lib/lesson-sections.js` rather than left to the style call, because the
sections need them and a style call that invents its own would leave the page's CSS
and its markup agreeing on nothing.

That is not only a workaround. The page's CSS is now **one decision made once**,
instead of eight sections each restyling themselves — which is what the creator's
"every button border and card must match" asks for anyway.

The parts are assembled into one page and then **checked** rather than trusted: one
root, one style block, one script block, no external load, a visible Finish button,
width handling, and no CSS rule that could reach the app's own header. That last one
is judged by what a rule *reaches*, not by whether it names the root — the page's own
classes exist nowhere else, so a rule on `.base-section` is harmless, while a rule on
`body` or `.btn` would restyle every page.

### An empty answer is a refusal, and the model does not say so

This is the finding that cost the most and is the least guessable.

The pinned upstream refuses in two ways. One is obvious: `429` when it is saturated.
The other is not — it answers **`200`**, streams sixty-odd thousand characters of
reasoning, and returns **no content at all**, ending `finish: length`. The same
request, unchanged, gave zero characters and then 2,174 on the next attempt, while a
control that has always answered kept answering throughout.

So an empty answer is not a result to be inspected. It is a refusal, and it is
retried the same as a 429. The first version of the generator treated it as fatal
and abandoned an hour of patience on calls that would have landed on the second try
— and, worse, invited the reading that the *prompt* was at fault, which sent a
round of prompt rewriting after a problem that had nothing to do with prompts.

That is the general shape of it: a model that can fail in a way indistinguishable
from a model that has an opinion about your question will send you rewriting the
question. **Keep a control request** — one that has always answered — and run it
whenever something comes back empty. It is the only thing that tells the two apart.

**A grade is one course, not several run end to end.** This is the part that took
the most finding. The obvious design — cut the path into one band per skill, and
let each skill's topics fill its band — is arithmetically impossible to satisfy.
Requiring a path of N lessons *and* requiring every skill's band to hold that
skill's topics cannot both hold: N lessons split S ways is N/S each, so any skill
with more than N/S topics can never be given a lesson for every one of them, and
the surplus of lessons that would fix it is exactly the repetition being removed.
Arithmetic has sixty-eight topics over six skills with a fractions skill needing
seventeen — more than 68/6 — and no path satisfies both. Banded, it also reported
sixty-eight lessons while never once reaching "GCF and LCM", because every band
restarted at topic one.

So a grade carries **one list of topics**, and a level's position in the path is
its position in that list. The skills are the order the material is taught in, and
the skill a lesson is about follows from its topic rather than partitioning
anything. `npm run syllabus` reports it, and checks it.

## The learning scorecard

Every learner has a scorecard of **100 stats, each scored 0–100 with its own
confidence**, across ten categories — intake and processing, reasoning
architecture (deductive and inductive trajectory, cognitive flexibility),
pacing and cycle architecture, stimulus envelope and engagement, memory,
failure response, metacognition, representation, motivation, and transfer. Each
is scored from what the learner does, not what they say: answer timing against
what the question deserves, an optional "how sure are you?" tap, revisions of a
typed answer, coach use, recovery after a miss, delayed review, time on a lesson
page, how the level after a lesson page went, placement, the pace / length /
difficulty taps on the feedback form, and DeepSeek's read of each finished
session. The full design is in [docs/SCORECARD.md](docs/SCORECARD.md).

**It reaches the single prompt through the details brief.** The level editor
already rewrites the creator's page for a learner on a plan that writes levels;
the brief it sends (`services/details.js`) now carries the scorecard as a short
ranked list of plain instructions — never raw numbers — alongside the survey in
the learner's own words and their feedback. The editor now runs on **DeepSeek
V4.1 Flash, backed by MiMo V2.6 Pro** (the `personalize` route), and a rewrite
must keep every element id from the creator's page and every script compiling,
on top of the existing page contract.

**After every level, one read.** With their feedback (liked, did not like,
anything else) or, without it, their wrong answers, timings and what they said
to the AI coach — next to the level's full content and the whole scorecard — one
prompt writes a conclusion to their record and suggests changes. Each read moves
a stat by at most 1 point; a big move needs big suggestions from 11 different
levels. Anything that disagrees with solid data becomes a recommendation, which
is reviewed against everything known about the learner before it can change
anything. Struggles they keep having — down to a question shape — reach the
next level's brief with a hint to add at that point
(`services/learner-record.js`).

**It is measured.** One level in ten (`PERSONALIZE_HOLDOUT`) is served as the
shared page on purpose; a third of the rest try one way of teaching the
scorecard is not yet sure about. `npm run scorecard:report` compares tailored
pages with the holdout on the level after them.

```bash
npm run scorecard:report                                   # is it working?
npm run scorecard:prompt -- someone@example.com english/proficient/105   # the exact prompt
```

**The admin panel** is at `/admin` for the accounts in `ADMIN_EMAILS` (the owner
by default): every learner with their plan, subjects, accuracy, survey answers,
how well the scorecard knows them and their strongest tendencies; for each one a
learning-style summary, all 100 stats overall or per subject, the exact brief
their next level is written from, the levels written for them, how their levels
went, and the evidence behind it; and a CSV export of every learner's 100 stats.
Every admin route answers 404 to anyone else.

## The layout lives in one place

`config/level-layout.js` is the only thing that answers "what is level N of this
grade". That question used to be worked out in **five** places — `levelKind` in
the curriculum, an independent `isLessonLevel` in `content/topics.js`, two
modulus tests in `mastery.js`, and `master_every * Math.ceil(level /
master_every)` in the browser — and two of them had already drifted. The
`topics.js` copy had no grade argument, so it said level 25 was not a lesson
while the curriculum said it was; the browser's copy rounded up to a multiple of
twenty-five, so on every English grade the path page named a level that held a
lesson. Nothing failed, because each copy agreed with itself.

A level is now **stated or derived**, never worked out twice:

- A grade with `levels` — a list of `{ level, kind, title, covers }` — is
  answered from it. This is where a CSV lands, and the rule is not consulted for
  that grade at all.
- A grade with none is answered by the arithmetic rule, which lives in
  `level-layout.js` once. It is the fallback for a grade not yet given a layout.

`kind` is **open**, not an enum. A kind the app has no behaviour for is still a
level: it is served, named, shown in the path and counted, and it gets the default
behaviour of a practice level. A new kind can never become a dead level that
silently refuses to render — which the browser's five copies of the
"which kinds can fail" list were already risking, and the dashboard's two got
wrong by leaving out `essay`.

What a stated layout already handles: a path length that is not a multiple of
anything, a kind the app has never heard of, gaps between levels, a streak that
counts consecutive levels across those gaps, a placement that never lands on a
quiz, and the next checkpoint, which the server now sends as a **level** rather
than as spacing for the page to round up. `npm test` exercises all of it against
a deliberately irregular layout — a lesson at 7, a quiz at 8, a lesson at 20, a
`review` at 21, the exam at 35 — so a CSV is not the first thing to discover any
of it.

| | topics | lessons | path |
|---|---|---|---|
| math/arithmetic | 68 | 68 | 571 |
| math/algebra2 | 77 | 77 | 641 |
| english/basics | 33 | 33 | 277 |
| english/college_composition | 61 | 61 | 511 |
| act/act_grade_1 | 85 | 85 | 706 |
| act/act_grade_6 | 93 | 93 | 786 |
| act/act_grade_16 | 46 | 46 | 409 |
| spanish/intermediate | 60 | 60 | 502 |
| ... 30 grades in all | | | |

The three English grades that already existed keep their ids (`basics`, `grammar`,
`reading`) so old enrollments still resolve. The ACT workbook contributes sixteen
authored grades, from `act_grade_1` through `act_grade_16`; the four former section
ids (`act_english`, `act_math`, `act_reading`, `act_science`) resolve to the
benchmark-ready `act_grade_6` for existing enrollments.

**What a topic is.** Not a heading over a generic lesson. `content/topics.js`
maps a level to its topic, the topic to the skill whose questions can test it,
and the lesson carries three things: the topic's own name, the creator's
description of what it covers, and where the sequence goes next.

```
level 10  Letters A-E
          "Recognizing, naming, and tracing the uppercase and lowercase forms
           of A through E."
          This is topic 6 of 45 in this subject. Levels 11 to 20 practise it,
          and the next lesson is "Short E Words".
```

709 of the 755 topics name a skill that can ask about them. The other 46 are the
ones no multiple-choice question can test — listening to a read-aloud, taking a
turn in a conversation, drawing a story — so their lessons are taught from
phonics, the nearest material the bank has. They are still taught, under their
own names; dropping a topic that was written by hand would be worse than asking a
broader question about it.

## Who may skip

One account, listed in `config/capabilities.js`, can skip a question, skip a
level, and skip to any level on the path. Skipping a question leaves the score
entirely — not counted wrong, dropped from the denominator. Skipping a level
moves on without counting as cleared. Skipping to a level records everything
below it as cleared at 100%, which is a fabricated record and is marked as one:
every event it writes carries `skipped: true`, so a trained model built on that
log later can be kept from learning those levels were genuinely mastered. The
decision to exclude them, though, is one somebody has to remember to make.

The check is server-side on every one of those routes, and `publicUser` only
tells the browser it may draw the buttons — which decides what is offered,
never what is allowed.

### Reading the whole curriculum

The same account can also **read the whole curriculum** — every subject, every
grade, every level, joined or not — at `/curriculum`. `canBrowse` answers this
separately from `canSkip`, because it answers a different question: skipping is
*how far can I get*, browsing is *what does this product teach*. Reading marks
nothing, advances nothing and grants nothing. Every other account gets a `403`.

Two things this fixed. The path route needs an enrollment, because a path is a
thing a learner is standing on — which left the other fifteen grades
unreachable, and a path of up to 1,600 levels was drawn as a window of 130
around the present. And a lesson level on the path now names its **topic** rather
than its skill, because "Nouns and the words that name them" tells a reader what
is on level 10 and "Parts of speech" does not.

A path is too long to draw as rows, so levels appear a hundred at a time with
jumps by lesson — a path is mostly practice levels, so stepping by ten is rarely
a lesson. `?track=` and `?grade=` narrow the view, and `?lessons=1` drops the
practice levels and leaves the syllabus itself.

## How a session is built

A session is a list of **blocks**; one block is one level's worth of work.
`POST /api/sessions` creates the first block, `block-finish` closes a level and
re-checks it, `next-block` opens the next one, and `finish` analyzes the whole
sitting.


1. `services/learner.js` turns the profile into parameters: how many items, how
   much stretch, type-in versus multiple choice, feedback now or at the end.
2. `services/sessions.js` plans the mix — review of what is due, support below
   the level, focus at it, stretch above it.
3. `services/ai.js` authors the focus and stretch items when it can, serving a
   shared cache first so one authoring call covers many learners.
4. `content/bank.js` fills everything else, and everything at all when the model
   is off.
5. On finish, the analyst writes the summary, the retention questions, and the
   observed signals that go back into the profile.

### Coming back to a sitting

Closing the tab and pressing **Continue** must return the learner to the exact
question they left, with their answers intact, or to the essay they were writing.
Two separate bugs broke that, and neither lost any data — both *displayed* the
wrong thing.

**The answers were orphaned.** A question is only shown if the block that holds
it is rebuilt, and re-planning a level hands out fresh questions. The old
answers were still on the old items, which nothing displayed. The guard belongs
in `sessions.createSession`, which now returns an unfinished sitting as it
stands. It used to live only in the route that calls it, so every other caller
got the version that loses your place — the app worked by luck.

**A written checkpoint resumed onto its own quick check.** Level 25 of English is
two things in one sitting: a five-question check, then the writing. The client
opened the writing only when there were *no* questions at all, which is true for
about a second after the block opens and never again. A learner who closed the
tab halfway through the essay came back to question one, with the draft sitting
unused on the response. The essay is also looked up across every block now, not
just the first, so a checkpoint reached two levels into a sitting is reachable.

## Notes on the design

- **Nothing unverified is graded.** Bank items compute their own answers; model
  items pass structural validation before a learner sees them; a reported item is
  pulled from the shared cache immediately.
- **The answer key never leaves the server.** The client receives prompts and
  choices; grading happens in `services/grading.js`.
- **Every AI path degrades rather than fails.** That is what makes the API key
  optional rather than required.
- **The app's chrome is SVG, not emoji.** Icons come from the SVG sprite in
  `public/js/icons.js`; styling uses component classes in `public/css/style.css`.
  Generated lesson pages are model-written and do use emoji in their controls,
  which is allowed — the sprite rule is about the surrounding product, not about
  model output.

## What is next

Phases 4 onward in [docs/ROADMAP.md](docs/ROADMAP.md): the content QA pipeline,
email review reminders, admin tooling, Postgres, Stripe, and the metrics pack
that a funding round is argued from.
