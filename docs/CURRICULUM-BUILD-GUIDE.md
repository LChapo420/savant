# How the Curriculum Spreadsheets Were Made

A complete record of how every subject spreadsheet for the AI education app was designed, researched, ordered, checked and built. It is written so that another Claude (or a developer) can understand exactly how the grades, levels, lessons and activities are made, and can build a new subject the same way.

Subjects covered: English, Reading, Math, Spanish (original plus four redesigns ending in the Spanish Fluency Path), IQ-tier Reasoning, and ACT Preparation.

---

## 1. Vocabulary used in the spreadsheets

- **Grade** (called "Level" in the older files): one big column block on the main sheet, such as "Grade 3: Core Skills I" or "Level 21: Algebra 1, Part A". Each grade is a stage of the subject, defined by skills, not by age.
- **Level** (column "App Level #" in older files, "Level #" in the ACT and Spanish Fluency files): one row inside a grade. Every row is one screen or step in the app, numbered 1, 2, 3 ... from the top of each grade.
- **Lesson / Topic**: one teachable idea (15-60 minutes depending on the subject). Topic lists are the core content. Each topic is one line in a data file: `Title | one-sentence description`.
- **Activity**: a practice step that follows a lesson.
- **Cycle**: a group of four quizzes and the lessons before them.

The user later asked (for Spanish and ACT) that the big column blocks be labeled **Grade** and the row-number column be labeled **Level #**. English, Reading, Math, the original Spanish and IQ files still use "Level N" for the big blocks and "App Level #" for rows; they mean the same things.

---

## 2. The standard layout (English, Reading, Math, original Spanish, IQ, ACT)

Every one of these workbooks uses the same machine-built layout. The rules below are exact.

### 2.1 Order of rows inside every grade

1. **9 entry Testers** (levels 1-9). The grade's lessons are split into nine equal ninths; Tester k checks the k-th ninth with about 3 items. A score of 90% or better (all 3 right on the first try) lets the student skip those lessons; skipped lessons stay in spaced review.
2. **Lesson, then its 9 activities**, then the next lesson, and so on. The first lesson is therefore level 10.
3. After each **group of lessons** comes a **recall-first Summary lesson**, then a quiz (or task), then the next lesson. The level right before every quiz or task is always a Summary; the level right after a quiz is always the next lesson (or the Grade Summary at the end).
4. Quizzes come in **cycles of 4**:
   - Quiz 1 = **Master Quiz**.
   - Quiz 2 = a **production task instead of a quiz** (the name depends on the subject: Essay, Written Task, Speaking/Writing Task, Reasoning Task, Timed Task), followed immediately by **one Revision** of that task after feedback.
   - Quiz 3 = **Master Quiz**.
   - Quiz 4 = **Grand Master Quiz** (cumulative and interleaved), preceded by a Summary of the whole cycle.
   - Every grade ends on a **completed cycle** (the number of quizzes is always a multiple of 4).
5. End of grade: **Grade Summary lesson** (recall-first review of the whole grade), **9 Grade Review activities** (7 quiz/game activities, each covering one seventh of the grade, then "Weak Spots" and "Final Prep" retention activities), then the **Final** (cumulative exam; one free retake after review).

### 2.2 The 9 activities after every lesson

- **Activities 1-7: quiz/game activities**, chosen by the lesson's *kind* (see each subject). They move from supported to independent: worked example, then faded example, then hints, then independent work, then transfer and error-finding. At least 60% require producing an answer (typing, saying, solving), not just recognizing it. Activities 3 and 4 add "Some items require typing or saying the answer."
- **Activity 8: Free Recall and Mixed Review (retention)**. Recall this lesson from memory with no hints, then mixed questions on the lessons 1 and 3 back.
- **Activity 9: Spaced Recall (retention)**. A delayed check on this lesson together with the lessons 5 and 9 back; anything missed earlier comes back here.

Result: each concept is revisited about 9-10 times. It appears in its own lesson, in activity 8 of the next lesson (after a night's sleep), and at lessons +3, +5 and +9. It also returns in the Summary lesson, the next Master Quiz, the Grand Master Quiz, the Grade Review and the Final.

### 2.3 How many lessons per quiz (the plan() algorithm)

Each grade has a target "lessons per quiz" that grows with the learner's stage, so younger learners get quizzed more often:

| Subject | Lessons per quiz by stage |
|---|---|
| English and Reading | about 2 in levels 1-2, about 3 in levels 4-6, about 4 in levels 7-16 |
| Math | about 2 (levels 1-4), 2.5 (5-8), 3 (9-13), 3.5 (14-20), 4 (21+) |
| Original Spanish | about 3 (levels 1-14), 3.5 (15-22), 4 (23+) |
| IQ | 3 (levels 1-2), 3.5 (3-4), 4 (5+) |
| ACT | 3 (grades 1-4), 3.5 (5-8), 4 (9+) |

Algorithm: for N lessons in a grade, try every quiz count Q that is a multiple of 4 (4, 8, 12 ...). Pick the Q whose N/Q is closest to the target. Split the N lessons into Q groups as evenly as possible, spreading the extra lessons evenly through the grade. Topics never move; only the group sizes change.

### 2.4 Level numbering

Numbers run 1, 2, 3 ... inside each grade. They cover the testers (1-9), each lesson and its 9 activities (10 consecutive numbers), each Summary, each quiz, each task and its revision (one number each), the Grade Summary, the 9 review activities and the Final.

### 2.5 Estimated minutes per row

Each subject has a small table of minutes per stage (band): BLOCK (a lesson plus its 9 activities), SUMM (Summary), MQ_MIN, task minutes, GM_MIN, FIN_MIN, minutes per week and PLACE (all 9 testers). Row minutes:

- Lesson = 0.30 × BLOCK.
- Each of activities 1-7 = 0.55 × BLOCK / 7.
- Each of activities 8-9 = 0.15 × BLOCK / 2.
- Each Tester = PLACE / 9.
- Task revision = half of the task.
- Everything else comes straight from the table.

These minutes are design estimates (stated as such in the sheets). The research supports short sessions several times a week, not the exact numbers.

### 2.6 Sheets in every standard workbook

- **Topics by Level / Topics by Grade**: one block of 5 columns per grade (Level #, Type, Topic / Activity, What It Covers, Est. Min). Header row 1 is merged with the grade name and real-world equivalent. Colors: testers blue, Summaries pale yellow, Master Quiz orange, task green, Grand Master Quiz red, Grade Review yellow, Final purple.
- **Summary**: one row per grade with live COUNTIF formulas (counts of each row type), total levels, estimated hours (=SUM of minutes/60), suggested minutes per week, weeks to finish, and the real-world equivalent. It also holds the minutes-by-stage table and plain-language notes explaining the layout.
- **Design Rules**: Area | Rule | Why (evidence) | Confidence.
- **Evidence**: Source | What it supports | Link | Status ("Verified" = opened this session; "From memory" = recalled, check before quoting).
- **Coverage** (Math, Spanish, IQ, ACT): reference items per area, covered/partial/missing before the fill, lessons added, re-check sample results, and estimated coverage after the fill, with caveats.
- A **CSV** copy of the main sheet, plus a **Coverage Map CSV** (every reference item, its C/P/X status and the lesson that covers it).
- All workbooks are recalculated with LibreOffice (recalc script) and must show **0 formula errors** before delivery.

### 2.7 Data file format (the input to every build)

One text file per grade (for example `M07.txt`, `S12.txt`, `Q03.txt`, `A05.txt`), one topic per line, in learning order:

`Title | description`

- Title: 3-12 words, unique within the grade, no numbering. Some subjects add a tag in brackets: track tags at the top grades of English, Reading and Math; section tags `[Math] [English] [Reading] [Science] [Writing] [Strategy]` in ACT.
- Description: exactly one sentence, 10-25 words, saying what the student learns to do, with a concrete example.
- No " | " inside descriptions, no "&", no blank lines.

---

## 3. The standard research-to-build pipeline

Every subject after English went through the same steps; the depth grew with each subject.

1. **Clarify**: ask the user only what changes the design (for example what "IQ levels" means, which ACT sections to include).
2. **Research first** (parallel research agents using web search and fetch). Each agent writes a markdown file with every fact tagged **[V]** (verified on a page actually opened, with URL) or **[M]** (from memory), plus a **master checklist** of atomic teachable items for its area. Topics researched every time:
   - the official standards and content of the subject;
   - learning-science evidence (retrieval practice, spacing, interleaving, worked examples, feedback, mastery learning);
   - the usual order of acquisition and sequencing;
   - assessment and timing;
   - what top programs do.
3. **Design the grades**: name, real-world equivalent and target lesson count per grade. This is written into a shared `INSTRUCTIONS.md` with the file format, the content shares, the ordering rules and the exclusions.
4. **Draft the topics**: several drafting agents, each drafting a few grades in optimal learning order. The ordering rules are:
   - prerequisites first;
   - concept, then procedure, then fluency, then transfer;
   - easily confused ideas taught apart, then contrasted;
   - each big idea returns later at greater difficulty under a new title (spiral);
   - error-analysis and mixed-synthesis lessons about one in every eight.

   Each agent validates its own format.
5. **Order and quality audit**: agents reread each grade and fix prerequisite order, duplicates, level-pitch and description quality, logging changes.
6. **Independent coverage audit** (the user's standing bar: do not call a subject done until it covers at least 90%):
   - Separate auditor agents build fresh reference lists of atomic items per area. Sources include standards documents, syllabi, test specifications, inventories and checklists.
   - They map every item strictly: **C** = a lesson clearly teaches it at a suitable grade; **P** = only partly; **X** = missing.
   - They then write one gap lesson per P/X item, in the format `<GradeFile>@<exact existing title to insert after> :: Title | description`.
7. **Apply gaps** with a script that checks format, word counts and duplicate titles, inserts each lesson after its anchor (or at the end of the grade if the anchor is missing), and reports counts.
8. **Spot-check re-audit** with a fixed random seed (seed 7). For each area, sample items that were P/X and some that were C, re-judge them against the new lists, write any remaining gap lessons and apply them. The final coverage estimate is: (covered before + (partial + missing) × re-check success rate) / items.
9. **Classify each lesson's kind** (which 7-activity template it gets): by language-model agents writing a `level<TAB>title<TAB>kind` file, or by tag rules (ACT).
10. **Build**: a Python/openpyxl builder generates the sheets with assertions. Every grade must start with 9 testers, have N lessons and 9N activities, put a Summary before every quiz, put a lesson after every quiz, end on a complete cycle, and have one task per cycle. Then recalc (0 errors), add the Coverage sheet and map CSV, recalc again, spot-check rows, and deliver.

Honesty rules used throughout:

- Coverage numbers are labeled as estimates when based on samples.
- Reference lists that came partly from memory are disclosed.
- No claims beyond the evidence (for example IQ lessons "build skills", never "raise IQ"; ACT "designed to make 36 likely", never "guaranteed").

---

## 4. English (16 levels)

- **Request**: levels, topics and app level numbers in optimal learning order, research-based for retention, understanding and time efficiency.
- **Levels**:
  - 1-9 run from Foundations (preschool-kindergarten) through Advanced (11th-12th grade, honors/AP).
  - 10-12 are College Composition, Language and Writing Studies, and Advanced Undergraduate/Honors.
  - 13-16 are Master's, Doctoral, Postdoctoral/Professional and Field Authority.
- **Size**: 755 lessons, 6,795 activities, 58 essay cycles. The quiz-2 task is an **Essay Draft** followed by an **Essay Revision**; level 1 uses an oral retell with no revision.
- **How it was made**:
  - The topics for levels 1-16 were drafted in three batches.
  - The topics were researched against Common Core Writing, Language, and Speaking and Listening standards and university catalogs. Gaps were added in learning order.
  - Reading-focused topics were then **set aside** and moved to the separate Reading subject; they are listed on a "Reading - Set Aside" sheet and in Reading_Topics_Set_Aside.csv. Test-prep topics were skipped.
  - The research-based layout (testers, summaries, quiz cycles, 9 activities, timing table) was designed from learning-science research and applied to the sheets.
  - Levels 13-16 carry track tags such as [Linguistics] and [Creative Writing].
- **Sheets**: Topics by Level, Summary, Design Rules (42 rules), Evidence (about 43 sources), Reading - Set Aside.

## 5. Reading (16 levels)

- **Request**: build Reading from the set-aside topics, then check it matched the app's reading data (the user supplied a JSON dump of the app's Reading content to confirm the spreadsheet was consistent with it).
- **Levels**: same 16 stages as English (Foundations through Field Authority), named for reading (Early Decoder, Developing Reader ... Literary Studies ...).
- **Size**: 584 lessons. All 266 reading topics set aside from English were placed here, and the 4 test-prep topics were skipped. Essay Draft and Revision, as in English.
- **How it was made**: levels 1-9 and 10-16 were drafted with the set-aside topics placed in order, gaps audited against real standards and catalogs, then built. Levels 13-16 carry track tags ([Literature], [Textual Scholarship], [Digital Humanities], [Reading Science], [All Tracks]).
- **Sheets**: same as English.

## 6. Math (49 levels)

- **Request**: cover at least 90% of all the math in the US, from preschool to the most accomplished mathematician.
- **Levels**:
  - 1-28 run from Sense of Quantity (preschool) through K-12: half-grade steps where prerequisites are dense, one level per course from high school (Algebra 1 A/B, Geometry A/B, Algebra 2 A/B, Precalculus, Statistics).
  - 29-43 are undergraduate: Calculus I-II, Multivariable, Linear Algebra, Discrete Math and Proof, Differential Equations, Probability, Mathematical Statistics, Real Analysis I-II, Abstract Algebra I-II, Topology, Complex Analysis, Electives/Honors Capstone.
  - 44-49 are Graduate Core I-II, Master's Thesis, Doctoral, Postdoctoral and Senior Scholar.
- **Size**: 2,617 lessons and 23,553 activities.
- **Quiz-2 task**: a **Written Task** (explain a solution, critique an incorrect solution or pose a problem; from grade 9 up, justify or prove a claim, critique a flawed argument, or write up a model) with a **Written Task Revision**. Levels 1-4 use an oral explanation with no revision.
- **Activity kinds**: play with objects (levels 1-4), skill/procedure with worked and faded examples, concepts with models, word problems and modeling, geometry and measurement, fact fluency, proof and rigor, tool use, and research/professional practice.
- **Coverage**:
  - **Reference list**: about 1,800 atomic items. Sources were CCSS-M, Virginia SOL, Texas TEKS, AP/IB, CA/NY/FL items, MAA CUPM 2015 and top-department syllabi, qualifying exams, MSC2020 areas, and research and professional skills.
  - **Before the fill**: 78% (partial counted as half).
  - **Gaps added**: about 445 lessons, taking the sheet from 2,173 to 2,617 lessons.
  - **Re-check**: 94.8% of 153 sampled former gaps were now covered.
  - **Estimated coverage**: about 95%.
- **Other**:
  - K-12 follows Common Core, adding state items that go beyond it. Test prep is excluded.
  - Levels 43-49 carry track tags ([Pure Math], [Applied Math], [Statistics/Data Science], [Logic/Foundations], [Math Education], [All Tracks]).
  - Two missing anchors and three badly formatted gap lines were fixed by hand.
- **Files**: Math_Levels_Topics.xlsx/.csv, Math_Coverage_Map.csv.

## 7. Spanish, original (48 levels, standard layout)

- **Request**: Spanish for native English speakers, with even deeper research. It had to cover at least 90%, from knowing nothing to knowing more than anyone else in the USA.
- **Research**: six streams, saved as research files:
  - CEFR, ACTFL and PCIC frameworks;
  - contrastive analysis of English-speaker hurdles and acquisition order;
  - advanced literature, linguistics, translation and professional Spanish;
  - US context and dialects;
  - assessment and pacing;
  - retention.
- **Levels**:
  - 1-7 are Pre-A1 to A1 (sounds, survival words, identity, numbers, food, home, routines).
  - 8-15 are A2: reflexives, present perfect, preterite I-II and imperfect, storytelling, commands and pronouns, future and conditional, A2 consolidation.
  - 16-22 are B1: subjunctive I-II, past system, si-clauses, indirect speech, imperfect subjunctive.
  - 23-30 are B2: argumentation, cohesion, media, advanced subjunctive, se constructions, register and dialects.
  - 31-37 are C1: academic, rhetoric, Literature I-II, Latin American and US Latino literature, professional Spanish.
  - 38-48 are C2 and specialist: irony and humor, translation, interpreting, dialect mastery, Linguistics I-II, history and cinema, rhetoric, teaching, research, Distinguished capstone.
- **Size**: 2,837 lessons.
- **Quiz-2 task**: a **Speaking/Writing Task** rotating through spoken, written and mediation tasks, with a Task Revision.
- **Activity kinds** (15): vocabulary, grammar, pronunciation, speaking, listening, reading, writing, culture, translation, linguistics, literature, scholarship, mixed, dialect, error clinic. Kinds were assigned per lesson by language-model agents because keyword rules gave poor results.
- **Variety policy**:
  - The base is neutral Latin American Spanish.
  - Spain forms are taught for recognition at A2 and for production at B1.
  - Voseo is taught for recognition at B1 and for production at C2.
  - US Spanish appears from A2.
- **Coverage**:
  - Seven independent areas with fresh reference lists, about 3,000 items in all.
  - Strict coverage before the fill was about 69%. About 625 lessons were added.
  - Re-check samples were 70 former gaps plus 30 covered items per area.
  - Estimated strict coverage is about 95-97%; a separate standards audit measured 95.7%.
- **Files**: Spanish_Levels_Topics.xlsx/.csv, Spanish_Coverage_Map.csv.

## 8. IQ-tier Reasoning (12 levels)

- **Request**: the same depth for "IQ increasing", with each grade a 10-point step of IQ from 70 to 180.
- **Clarified**:
  - It is a reasoning-skills curriculum.
  - Each level is a difficulty tier pitched at IQ 70, 80 ... 180 (SD 15).
  - Tiers 170 and 180 are kept and labeled "aspirational".
- **Honesty**:
  - Lessons build skills and task performance. Research shows no reliable permanent IQ gains from training.
  - The app never asks for or shows an IQ.
  - Wording is respectful (no "low IQ" or "genius").
- **Research**:
  - IQ science: CHC theory, percentiles (70 ≈ 2nd percentile ... 180 ≈ 1 in 20 million).
  - Training-transfer evidence.
  - CHC item types.
  - Reasoning and rationality content.
  - Cognitive skills content.
  - Calibration and pacing.
- **Levels**: 1 Concrete Thinking Foundations (IQ 70) through 12 Mastery Frontier (IQ 180).
- **Size**: 2,567 lessons, after about 480 gap lessons were added.
- **Quiz-2 task**: a **Reasoning Task** rotating through three types (explain your reasoning, critique a flawed argument, design and defend your own problem), with a revision.
- **Activity kinds** (17): fluid patterns, logic, verbal, quantitative, spatial, memory, problem solving, critical thinking, decisions and probability, creativity, metacognition, executive function, general knowledge, systems, formal/original, communication, mixed.
- **Coverage**:
  - Seven areas, about 1,800 items.
  - Strict coverage before the fill was 70.5%.
  - The re-check sample found 168 of 171 former gaps now covered.
  - Estimated strict coverage is about 99%. Tiers 170-180 cannot be measured, so no coverage claim is made for them.
- **Usage note**: the user asked to save usage. The large parallel audit was stopped and the remaining audits were done with fewer, smaller agents.
- **Files**: IQ_Levels_Topics.xlsx/.csv, IQ_Coverage_Map.csv.

## 9. ACT Preparation (16 grades)

- **Request**: take a student who averages 5 on the ACT to scoring 36 on every one of several ACTs taken months apart. Use the same format and rules as English, Math and Reading.
- **Clarified**: cover all five sections (English, Math, Reading, plus optional Science and Writing). The early grades teach only the foundations the ACT actually needs.
- **Research** (enhanced ACT, 2025 onward):
  - English is 50 questions in 35 minutes, Math 45 in 50 (calculator allowed), Reading 36 in 40, optional Science 40 in 40, optional Writing 40 minutes.
  - The composite is English + Math + Reading. Some items are unscored field tests.
  - The official reporting categories and weights are used.
  - Master checklists were built for each section.
  - Prep evidence: practice testing, spacing, error logs, coaching effects (small), and anxiety and sleep.
  - About 0.2% of test takers (3,041 students in the class of 2024) scored 36.
- **Grades** (named by target composite band):
  - 1-4 are foundations (5 to about 17).
  - 5-6 reach the benchmarks (17-21).
  - 7-12 are intermediate to high scorer (21-33). Every checklist item is taught by the end of grade 12.
  - 13-14 are speed with accuracy and eliminating the last errors (33-35).
  - 15 is Perfect Score Mastery.
  - 16 is Consistency: 36 on every sitting (retention between test dates, test-day routines, sleep, anxiety, recovering from a bad section, checking systems).
- **Topic rules**:
  - Every title starts with a section tag.
  - Sections are interleaved, never more than about 3 in a row.
  - Shares are roughly Math 33-38%, English 20-24%, Reading 17-20%, Science 11-14%, Writing 5-7% and Strategy 4-15%.
- **Size**: 892 lessons.
- **Quiz-2 task**: a **Timed Task** rotating through timed section practice, an ACT Writing task, and an error-log re-solve, with a revision. The task grows from a 10-12 question mini-set to a full section at 90% of real time.
- **Finals**: shortened practice tests in grades 1-3, half-length in 4-6, and full-length timed ACTs with Science and the essay from grade 7. Timing is 90% of real time in grades 13-16.
- **Activity kinds** (10): math, English conventions, English rhetoric, reading, science, writing, strategy, timed drill/test review, error analysis, mixed. They are assigned by tag and keyword rules.
- **Coverage**:
  - Three areas, 669 items.
  - Strict coverage before the fill was 79.2%; 100 lessons were added.
  - The re-check sample found 70 of 75 former gaps covered, and the last 5 were filled.
  - Estimated strict coverage is about 98.6%.
- **Honest limit**: no course can guarantee repeated 36s. A 36 allows about 0-2 misses per section, and scores vary about a point between sittings. Superscoring helps.
- **Labels**: Grade 1-16 and Level #.
- **Files**: ACT_Grades_Topics.xlsx/.csv, ACT_Coverage_Map.csv.

---

## 10. Spanish redesigns (from the standard layout to the Spanish Fluency Path)

The user then asked for Spanish to work "like Duolingo, but better", and finally to be the most optimal path to native-like fluency, ignoring the earlier rules such as the fixed 9 activities. This produced four successive workbooks.

1. **Spanish_Path_Layout**:
   - Units (one per quiz cycle) and a Story and Conversation node after each cycle.
   - A Level Project per level (48 written plus 4 half-level projects).
   - Tasks labeled Speaking / Essay / Mediation, and a Skill Focus column.
   - Four oversized levels (22, 33, 35, 44) split in two, giving 52 levels.
2. **Spanish_Personalized_Path**:
   - Added a "Tailor With" column for each row, plus Learner Profile, Personalization Rules, Daily Session and Fluency Milestones sheets.
   - It explicitly does not match "learning styles"; it personalizes by interests, goals and what each learner actually finishes and gets right.
3. **Spanish_Master_Path**:
   - Rebuilt without the 9-activity block: each lesson became one adaptive session with a type-specific flow.
   - A unit loop of about 4 lessons with a Story or Listening Lab, Conversation Lab, Fluency Sprint, Writing Lab, Mediation, Reading Block, Unit Check and Checkpoint.
   - Sheets for spaced review, input and immersion, and milestones.
4. **Spanish_Fluency_Path (current)**: built from verified research and an expert audit, then three rounds of independent expert review (scores 6.5, then 7.5, then 8.5 out of 10, with the five must-fix items from the final round then fixed). Key decisions:
   - **Main path plus tracks**:
     - The main path is 42 grades to native-like everyday fluency.
     - Optional tracks (15 grades) unlock after C1: Culture and History, Literature, Translation and Interpreting, Linguistics, Teaching and Research.
     - Three new native-fluency grades were added: listening and colloquial speech, pragmatics and sounding native, and everyday adult life.
   - **Order fixes**:
     - Grade 1 mixes sounds with survival phrases.
     - Core verbs are taught as phrases from day one.
     - Object pronouns move to grades 7-8.
     - Preterite comes before present perfect.
     - Fast connected speech is spiraled in at grades 12, 18 and 24.
     - Exam prep was removed, and duplicate lessons were merged or deleted.
   - **Unit loop**, in order:
     - Unit Intro: a can-do goal plus key phrases.
     - Two topics, then a 3-minute **Quick Game** (Speed Match, Sentence Builder, Listen and Tap, Word Race, Fix the Sentence or Memory Pairs).
     - A serialized personalized **Input Session** ("Story Episode").
     - The remaining topics.
     - A Story or Listening Lab (both every unit from B1), then Dictation.
     - A Conversation Lab: an information-gap role-play with a stated outcome.
     - A Fluency Sprint (4/3/2 repetition of the same story) on odd units, or a Writing Lab on even units.
     - A Mediation Task every 4th unit, a Reading Block every 3rd unit, and Sound Refresh nodes driven by the learner's error log.
     - An ungated 3-minute Unit Check.
     - Every 3 units: a gated Checkpoint (80%) and, from grade 4, a **Live Conversation** with a real person (it does not block progress).
     - Each grade opens with an adaptive Entry Check (skips whole known units) and ends with a Grade Project, a Final and, at CEFR milestones, a Real-World Mission.
   - **Columns**: Level #, Level Type, Activity, Unit, Node, Skill Focus, Path, What Happens, Est. Min.
   - **Level Type**:
     - "Lesson" means a mainly-reading screen: text blocks, data tables, an interactive sentence x-ray and multiple choice.
     - Topics whose real job is speaking, listening, pronunciation, reading, writing or translating carry that type instead.
     - Mixed review topics are "Review Game"; error-clinic topics are "Game".
     - The other node types are Placement Test, Preview, Game, Story Episode, Story, Listening, Dictation, Speaking, Speaking Game, Pronunciation, Writing/Essay, Translating, Reading, Quiz, Test, Live Speaking, Project, Final Test and Real-World Mission.
     - Lessons appear at most two in a row (three only in the few five-lesson units).
   - **Path column**:
     - Core, Core vocab, and Core listening (other dialects: listening for everyone, speaking only for the learner's target variety).
     - Domain: tag (Core only if it matches the learner's goals or target variety).
     - Enrichment, and Optional unit (units that are mostly Domain or Enrichment lessons; practice folds into the neighboring unit).
   - **Spaced review**:
     - Adaptive scheduling (FSRS or half-life style) with productive cards for the top 3,000-4,000 lemmas and receptive cards for lemmas up to about 8,000.
     - Input Sessions seed due words, so review overhead is 20% through B1, then 15%, then 12%.
     - Feedback prompts self-correction on practiced forms and gives the correct form on new ones.
   - **Hours (Core path)**: about 107 to A1, 522 to B1, 824 to B2 and 1,000 to C1. Milestones also show total learning time including the extra outside listening needed to reach input benchmarks.
   - **Honesty**: no app can guarantee "as if it were their first language"; adult nativelikeness across every test is rare.
   - **Sheets**: Path, Summary, What Changed and Why, Milestones, Lesson Flows, Spaced Review Engine, Input and Immersion, Vocab and Sound Plan, Level Types, Learner Profile, Personalization Rules, Principles and Evidence (with verified links).

---

## 11. Standing preferences from the user

- Do not say a subject is done until it covers **at least 90%** of the target, measured strictly, with caveats stated.
- Do full-depth research first, then design and build.
- The layout must optimize **understanding, retention and time efficiency**, and (from the Spanish redesign on) **engagement**.
- Test prep is excluded from academic subjects (it is the whole point of the ACT subject).
- The daily, weekly and monthly retention checks will be coded by the user in the app for all subjects. The spreadsheets describe them but do not need to schedule them row by row.
- Lessons will be tailored to each user's profile (interests, goals, preferences) by the AI at runtime.
- Use usage efficiently: prefer fewer, well-scoped agents; time taken does not matter.
- Labels: big column blocks are **Grades**; rows are **Levels** (Level #). A "Lesson" in the app is mainly reading (text and data blocks, a sentence x-ray, multiple choice).

## 12. Recipe for a new subject in the standard layout

1. Ask only the questions that change the design.
2. Run 2-6 research agents. Save their output as markdown files with [V]/[M] tags and master checklists.
3. Write `INSTRUCTIONS.md`:
   - the grade list with real-world equivalents and target counts;
   - the file format from section 2.7;
   - the content shares and ordering rules;
   - the exclusions and honesty rules.
4. Draft the grades in parallel (3-4 grades per agent) and validate the format.
5. Run independent strict coverage audits (C/P/X) per area, writing gap lines in `<File>@<anchor> :: Title | desc` format. Apply them with the checking script.
6. Re-check a seed-7 sample of 25-70 former gaps plus 10-30 covered items per area, fill whatever is still missing, and repeat until coverage is estimated at 90% or more.
7. Define the activity kinds (7 activity names and descriptions each, plus a retention tail). Classify every lesson.
8. Copy the most recent standard builder (the ACT builder is the newest) and set:
   - the grade names and equivalents, and the bands;
   - the lessons-per-quiz targets;
   - the minutes table;
   - the quiz-2 task name and formats;
   - the Final descriptions;
   - the notes.
   Write the Design Rules and Evidence content.
9. Build: the assertions must pass. Recalc to 0 errors, add the Coverage sheet and map CSV, recalc again, check sample rows, and deliver the xlsx, csv and coverage csv.

---

## 13. Delivered files (outputs folder)

| Subject | Files |
|---|---|
| English | English_Levels_Topics.xlsx and .csv |
| Reading | Reading_Levels_Topics.xlsx and .csv; Reading_Topics_Set_Aside.csv |
| Math | Math_Levels_Topics.xlsx and .csv; Math_Coverage_Map.csv |
| Spanish (original) | Spanish_Levels_Topics.xlsx and .csv; Spanish_Coverage_Map.csv |
| Spanish (redesigns) | Spanish_Path_Layout, Spanish_Personalized_Path, Spanish_Master_Path, Spanish_Fluency_Path (current), each as .xlsx and .csv |
| IQ | IQ_Levels_Topics.xlsx and .csv; IQ_Coverage_Map.csv |
| ACT | ACT_Grades_Topics.xlsx and .csv; ACT_Coverage_Map.csv |
