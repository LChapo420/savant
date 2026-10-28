# Recon map: Duolingo (web + iOS + Android)

Scope: everything public on the language-learning side. That covers onboarding, the
learning path, the lesson player and its exercise types, practice, streaks, XP, hearts
(or energy), gems and the shop, quests, leagues, friends, profile, settings, and the
Super and Max subscriptions. Chess, math, music and the English Test are excluded.
For: the user's existing education app, which is adding a "Learn languages" section
that should feel just like Duolingo. This is a section inside a host app, not a
standalone product. Account, auth and possibly payments already exist in the host
app and should be reused, not rebuilt.
Date: 2026-10-13

> Terms check (duolingo.com/terms, revised 2025-09-08): no non-compete clause. The
> terms do forbid copying, scraping or reproducing any "Service Content" (designs,
> text, graphics, audio, course sentences) and forbid reverse-engineering the apps.
> So the clone rebuilds mechanics and UX patterns only. **All course content
> (sentences, translations, audio, illustrations, characters, mascot) must be written
> or commissioned by you.** The recon used public pages and a guest session. No
> account was logged into, and nothing was scraped or decompiled.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | live web app, guest session | https://www.duolingo.com | Clicked through by hand: course picker, 8-step onboarding, full first lesson, learn path, sections, guidebook, quests, shop, leaderboard, settings. 31 screenshots in `screens/` |
| 2 | help center | https://www.duolingo.com/help | FAQ: streak, leagues, courses, account, Super, Max, family plan |
| 3 | help: leagues | https://www.duolingo.com/help/leaderboards-and-league | 10 league names, weekly reset Sunday, promotion and demotion, private profile opts out, under-13 users have no social features |
| 4 | terms | https://www.duolingo.com/terms | see the terms check above. Gems are a "virtual currency" and subscriptions auto-renew |
| 5 | blog: Duolingo 101 | https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo | path node types, exercise types, XP, hearts, gems, streak, Score, settings |
| 6 | blog: Practice Hub | https://blog.duolingo.com/guide-to-duolingo-practice-hub/ | Mistakes, Words, Speak, Listen, Stories/Radio/Adventures replays |
| 7 | blog: leagues | https://blog.duolingo.com/duolingo-leagues-leaderboards/ | matchmaking by study habits and time zone, Diamond Tournament |
| 8 | blog: friends | https://blog.duolingo.com/friends-social-features/ | Friend Streak (up to 5), Friends Quests |
| 9 | blog: Max | https://blog.duolingo.com/duolingo-max | Video Call, Roleplay, Explain My Answer |
| 10 | blog: Adventures | https://blog.duolingo.com/adventures | game-like scenario node on the path |
| 11 | blog: achievements | https://blog.duolingo.com/achievement-badges | tiered achievement redesign |
| 12 | blog: streak | https://blog.duolingo.com/how-duolingo-streak-builds-habit | up to 2 Streak Freezes equipped |
| 13 | blog: home screen | https://blog.duolingo.com/new-duolingo-home-screen-design | path replaced the skill tree. Legendary levels |
| 14 | App Store listing | https://apps.apple.com/us/app/duolingo-language-lessons/id570060128 | IAP list: Super $9.99–$119.99, gem packs $0.99–$19.99. 4.7★ from 5.5M ratings. Super includes "unlimited energy" and "monthly streak repair" |
| 15 | energy system reports | https://www.androidauthority.com/quitting-duolingo-energy-system-3599842/ | free users moved from Hearts to Energy in 2025 (Q2 2025 shareholder letter). The web guest session still showed 5 hearts |
| 16 | Max pricing review | https://storylearning.com/duolingo-max-review | Max at ~$29.99/mo. Explain My Answer reported free for all from 2026 |
| 17 | fan wiki (unverified) | https://duolingo.fandom.com/wiki/Exercise | exercise-type names. Treat as hints only |

## Core loop

Do a 3–5 minute lesson on the path each day. Every finished lesson earns XP, keeps the
streak alive, advances quests and the weekly league, and moves you one node down the
path. Free users are paced by hearts or energy. Super removes the pacing and the ads.

## Host app (Polymath) and how the Spanish section sits in it

Codebase: `C:\coding\claudecommittdIqolderThing\iq-max-repo-2-claude-adoring-mayer-woc9sq`
(not a git repository).

- **Stack:** Node 18 + Express 4. `express-session` + bcrypt auth. Static HTML +
  vanilla JS modules in `public/` (no build step, strict CSP, no inline script). JSON
  document store in `config/db.js` (one `data/db.json`, already **129 MB** and held
  in memory, with Postgres planned). AI goes through `services/ai.js` and
  `services/providers/*` (MiMo, OpenRouter, Gemini, Anthropic, Modelflare), with a
  per-user daily budget in `ai_usage`.
- **Spanish today** is one more generic track: `scripts/build-spanish-grades.js` turns
  the same CSV into `content/spanish-grades.js` (14 MB) and it runs through the shared
  path, player and per-learner lesson generation. `docs/NEXT-FEATURES.md` §4 already
  plans "Spanish as a language app" and confirms **MiMo TTS (`mimo-v2.5-tts`) and ASR
  (`mimo-v2.5-asr`)** on the same chat-completions endpoint.
- **Mobile:** `docs/ROADMAP.md` Phase 9 plans to wrap the web client in **Capacitor**.
  The Spanish section should follow that plan: a mobile-first web UI now, wrapped later.
- **Billing:** none yet. The tier is a field on the profile (`config/subscriptions.js`).

**Decision (user, 2026-10-13):** the Spanish section must *not* work like the rest
of the app. It should be exactly like Duolingo (word blocks, characters who talk,
speaking into the mic) with the user's own characters, sounds and content.

| reuse from the host app | build new for the Spanish section |
| --- | --- |
| accounts, sessions, `requireAuth`, admin emails | its own pages under `/spanish/*`, its own CSS and design tokens, its own path, lesson player and games |
| `services/ai` + providers (MiMo TTS/ASR, LLM for conversation and grading), `ai_usage` budgets | pre-generated, validated course content shipped as **static JSON per unit** (like `content/base-levels/`), **not** inside `db.json` |
| security middleware, rate limiting | learner state in new `es_*` collections (progress, review queue, error log, XP, streak, hearts, quests) |
| the CSV parser in `scripts/build-sheet-track.js` | the generation → validation → publish pipeline for the 10,169 levels |

The generic `spanish` track keeps working until the new section replaces it, then it is
hidden.

## Host app content model (Spanish from English)

Source of truth: `replica/curriculum/Spanish_Fluency_Path.csv` (the user's curriculum,
copied from Downloads on 2026-10-13). This is how the user's app builds courses. The
clone keeps it, and it replaces Duolingo's hand-authored content.

**Layout of the file:** wide format. Row 1 holds 57 grade titles, each at the head of
a 9-column block. Row 2 holds the column names: `Level # | Level Type | Activity |
Unit | Node | Skill Focus | Path | What Happens | Est. Min`. Rows 3–257 hold one level
each. The importer must unpivot it to one row per level, with id = (grade, level #).
Titles repeat for Quick Games, so they can't be used as keys.

**What's in it:**

| | |
| --- | --- |
| Grades | 57. Pre-A1 → C2 in grades 1–42, then 15 elective track grades (43–57: Culture & History, Literature, Translation & Interpreting, Linguistics, Teaching & Research) |
| Levels | **10,169** (94–255 per grade) |
| Units | **721** (`Unit g.n`, 11–19 levels each, median 13), plus `Entry` and `Level wrap-up` per grade. Unit grouping already exists, so no extra grouping layer is needed |
| Learner time | sum of Est. Min ≈ **2,160 hours** |
| Grade titles carry | CEFR band (e.g. "A1.2") and a vocabulary target ("target known lemmas about 550", rising to ~12,000) |
| Path | Core 7,139 · Optional unit 1,458 · Track 807 · Enrichment 290 · Core vocab 123 · Core listening 21 · **Domain electives ~330** across 30 domains (work, health, arts-media… and regional varieties: Spain, Mexico, Rioplatense, Caribbean, Andes…) |
| Distinct "What Happens" | 6,302 of 10,169. The rest are templated descriptions (games, labs, checks) |

**Every unit follows the same pattern** (seen in grade 1, and the counts match across
all 721 units):
`Preview (Unit Intro, goal + 5 key phrases) → 2–6 Topic levels (lesson / speaking /
listening / pronunciation / reading / writing / translating) → Quick Game → Input Session
(story episode) → Listening Lab → Story → Dictation → Conversation Lab (AI partner) →
Fluency Sprint → Unit Check`. Every ~3 units add a **Checkpoint** (gated at 80%) and a
**Live Conversation** (from grade 4). Each grade opens with an **Entry Check** (adaptive
placement) and closes with a **Grade Project** and a **Final** (80% gate that unlocks the
next grade). The A1, A2, B1, B2, C1 and C2 milestone grades end with a **Real-World Mission**.

**Level types → what the clone must build:**

| Level type / activity | count | Duolingo analogue | engine in the clone | content: shared or per-user |
| --- | --- | --- | --- | --- |
| Lesson / Topic | 1,503 | lesson node | **Lesson player** with E-type exercises | shared, pre-generated |
| Speaking / Topic, Pronunciation | 382 + 297 | speak exercises | lesson player + **speech scoring** | shared items, runtime scoring |
| Listening / Topic, Listening Lab | 184 + 627 | listen exercises, DuoRadio | **audio player + questions** | shared |
| Reading / Topic | 380 | stories | **reader** (tap a word for audio/gloss) | shared |
| Reading / Reading Block | 219 | none | reader, with the text picked from a pool by learner interest | **shared pool**, per-user pick (the spec says "AI-generated graded readers": pre-generate a pool per interest tag) |
| Writing, Essay / Writing Lab | 247 + 229 | none | **writing editor + AI feedback** (plan → draft → feedback → revise → model answer) | shared prompt + model answer, **runtime AI feedback** |
| Translating / Topic, Mediation Task | 140 + 139 | translate exercises | lesson player, plus writing editor for mediation | shared prompt, runtime AI feedback |
| Preview / Unit Intro | 721 | unit header + guidebook | **unit intro card**: goal, 5 key phrases, 30-sec clip, repeat | shared |
| Game / Quick Game | 721 | match pairs, timed challenge | **6 game engines**: Listen and Tap, Word Race, Sentence Builder, Fix the Sentence, Memory Pairs, Speed Match. 3 min, scored on speed + accuracy | items from the unit bank + **due review items (per-user)** |
| Speaking Game / Fluency Sprint, Chunk Speed Drill | 378 | none | timed speaking drill engine | shared items, runtime scoring |
| Story Episode / Input Session | 721 | Stories | **serialized story player** (same characters across units, pictures, slow audio, comprehension questions) | shared |
| Story / Story | 635 | Stories | picture story: captions, read-along, tap answers, say 2 captions | shared |
| Dictation | 506 | type what you hear | dictation engine; errors **auto-tagged sound vs spelling** in the error log | shared |
| Speaking / Conversation Lab | 721 | Max Roleplay / Video Call | **AI partner role-play** (information gap, goal, outcome) | shared scenario, **runtime AI conversation** |
| Quiz / Unit Check | 721 | unit review (ungated) | quiz assembled from the **spaced-review queue**. Feeds the weak-spot list and never blocks progress | **per-user assembly** from the shared item bank |
| Test / Checkpoint | 242 | jump test | cumulative test: listening, reading, recorded speaking (also scored for speech rate and pausing), short writing. **80% gate** → targeted repair → retake | per-user assembly + runtime scoring |
| Final Test / Final | 57 | none | grade exam weighted to weak spots. **80% pass unlocks the next grade** | per-user assembly + runtime scoring |
| Placement Test / Entry Check | 57 | placement test | adaptive: 3–4 items per unit, stops early, 15-min cap, skips known units | per-user adaptive |
| Project / Grade Project | 57 | none | record audio/video + AI partner exchange, rubric scored, one revision | shared brief, runtime scoring |
| Live Speaking / Live Conversation | 170 | none | talk with a real person (tutor, exchange partner, in-app peer match), upload a 2-min excerpt, rubric scored. AI stand-in after two misses (flagged) | runtime |
| Review Game / Topic | 63 | practice | lesson player in review mode | shared |
| Real-World Mission | 8 | none | done outside the app: upload a recording or log + self-assessment | per-user |

**What this means for "generate once, everyone gets the same content"** (the user's
plan, and still the right call):

- **Shared and pre-generated:** every lesson's exercises, the stories and input
  sessions, listening clips, dictation sentences, unit intros, Conversation Lab
  scenarios, writing prompts with model answers, project briefs, the reading-block
  pool, and each unit's **item bank** that the games, checks and tests draw from.
  After that, about 60% of levels need individual generation and the rest are
  templated engines fed by the unit bank.
- **Per-user, but with no AI at runtime:** Unit Checks, Quick Games, Checkpoints and
  Finals are *assembled* per learner from the shared bank (due review items, weak
  spots, chosen domains). The content is identical for everyone. Only the selection
  differs.
- **Per-user AI at runtime (unavoidable with this curriculum):** Conversation Lab
  (721), Writing/Essay/Mediation feedback (~615), speech scoring (speaking,
  pronunciation, sprints, projects, checkpoint samples), Live Conversation scoring.
  These are a running cost per active learner and need budgets and rate limits. They
  are the Duolingo **Max** feature set, and here they're core.
- **Learner-model systems the spec names directly:** a **spaced-review queue**, a
  **weak-spot list**, and an **error log** with tags (sound, spelling, …). They're
  must-haves because Unit Checks, Quick Games, Checkpoints and Finals depend on them.

**What the generator must output for each level:**
1. **Typed exercises** with prompt, choices or distractors, pairs or tiles, and the
   answer, in the E-type format the player renders.
2. **Accepted answers** for every translate or type item (word order, tú/usted,
   dropped subject pronouns). The validator checks coverage.
3. **Ledger entries.** Each grade title has a lemma target (100 → ~12,000), so track
   which lemmas and grammar points each level introduces and reviews, and have the
   validator check that every grade hits its target and never uses unintroduced
   structures in Core levels.
4. **A media manifest:** deduplicated TTS strings (with a voice per recurring story
   character) and image prompts in one house style.
5. **Versions.** Progress is keyed to (grade, level #), not to a version.

Stable ID: `es-en/g{grade}/l{level#}`. Units: `es-en/u{g}.{n}`.

## Screens

States observed live are marked ✔. The others come from docs or reviews.

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Landing | `/` | pitch, start or sign in | hero mascot, primary + secondary CTA, store badges | ✔ default |
| S02 | Course picker | `/register` (Get started) | pick language to learn | course grid: flag, name, learner count | ✔ filled |
| S03 | Onboarding questionnaire | `/welcome?welcomeStep=…` | personalise and commit | mascot + speech bubble, option list (single select), progress bar, back arrow, Continue (disabled until chosen) | ✔ steps: intro, hdyhau (8 sources), learningReason (7), proficiency (5 levels), courseOverview, dailyGoal (5/10/15/20 min), choosePath (scratch / find my level), 2 motivation slides. Mobile adds notification permission |
| S04 | Placement test | "Find my level" in S03, or jump-here | adaptive test that places you on the path | lesson player variant, adaptive difficulty | doc only |
| S05 | Create profile / sign up | soft prompt after the first lesson, `/learn?sign-up` | save guest progress | age, name, email, password, Google/Apple/Facebook | ✔ prompt (Create profile / Later) |
| S06 | Sign in / forgot password | "I already have an account" | auth | email/username, password, SSO | doc only |
| S07 | Home: learning path | `/learn` | the core screen | **top stat bar** (course flag + Score, streak, gems, hearts), **left nav** (Learn, Leagues, Quests, Shop, Profile, More), **unit header** (section/unit, title, guidebook button), **path** (zig-zag nodes: lesson★, chest, practice, unit review trophy, story, radio, video call, character standing beside path), **right rail** (league card or "unlock leagues", daily quests, profile CTA, footer) | ✔ guest, after 1 lesson, locked nodes, current node with progress ring, "JUMP HERE?" on later units |
| S08 | Node popover | click a node | start the lesson | title, "Lesson n of m", START +10 XP, (Legendary, Practice again, locked text) | ✔ current. Locked, completed and legendary states from docs |
| S09 | Sections overview | `/sections` (back arrow on unit header) | course map | section cards: CEFR level (A1–B2) + "see details", progress %, unit count, sample phrase, Continue / Jump to section, "Daily Refresh" final section locked | ✔ |
| S10 | Unit guidebook | `/guidebook/:lang/:unit` | grammar tips and key phrases | key-phrase cards with audio button, tip blocks, comparison tables | ✔ |
| S11 | Course switcher | course flag in stat bar | switch or add a course | course list, "add a new course" | doc only |
| S12 | Lesson player | `/lesson` | answer exercises | close X, progress bar (green, gold during combo), hearts counter, combo label ("7 IN A ROW"), instruction header + tag (NEW WORD / PREVIOUS MISTAKE), exercise body, Skip, Check, keyboard number hints 1–0 | ✔ select-image, match-pairs, select-meaning (character + speech bubble), previous-mistake re-ask, combo |
| S13 | Answer feedback sheet | after Check | grade and teach | bottom sheet: green ✔ praise / red ✖ "Correct solution: …", Too easy, Too difficult, Report, Continue. (Explain My Answer button in big courses) | ✔ correct, incorrect, skipped |
| S14 | Mid-lesson interstitials | inside a lesson | pacing and encouragement | mascot + bubble ("Super impressive!", "Let's review the exercises you missed!") | ✔ both |
| S15 | Out of hearts / energy | 0 hearts mid-lesson | monetise or practise | refill with gems, practise to earn, try Super, watch ad (mobile) | doc only |
| S16 | Quit lesson confirm | X in lesson | prevent accidental loss | modal: keep learning / end session | doc only |
| S17 | Lesson complete | end of lesson | results | celebration art, tiles: Total XP, accuracy % ("GREAT!"), time (some variants), Review lesson, Continue | ✔ 14 XP, 92% |
| S18 | Post-lesson reward sequence | after S17 | habit hooks | chained full-screen cards: Score unlocked/increased, streak extended (flame + week strip + warning), Streak Goal picker (7/14/30/50), quests complete, chest/gems earned, league promo, profile prompt | ✔ all six |
| S19 | Review lesson | "Review lesson" on S17 | re-read answers | list of exercises with your answer vs. correct | doc only |
| S20 | Legendary challenge | completed node → Legendary | harder, no hints, limited mistakes | lesson player variant, gold node after | doc only |
| S21 | Stories player | story node / Practice | read and listen to dialogue | dialogue lines with speakers, tap words for hints, comprehension questions | doc only |
| S22 | DuoRadio player | radio node | listening episodes | audio player, character hosts, questions | doc only |
| S23 | Adventures | adventure node (mobile) | game-like scenario | 2D scene, walk to a goal, dialogue choices | doc only |
| S24 | Characters / alphabet | nav tab for non-Latin scripts | learn the script | character grid with sounds, strength bars, trace practice | doc only |
| S25 | Practice hub | barbell nav (mobile), More menu | targeted review | cards: Mistakes, Words, Speak, Listen, Stories, Radio, Video Call (Max) | doc only |
| S26 | Words list | Practice → Words | vocabulary bank | list of learned words + audio + practise button | doc only |
| S27 | Leaderboard | `/leaderboard` | weekly competition | league badge row, countdown, ranked list (avatar, name, XP), promotion zone / demotion zone separators | ✔ locked state ("complete 2 more lessons"), skeleton rows |
| S28 | League results | start of new week | promoted / stayed / demoted | full-screen badge + rank | doc only |
| S29 | Quests | `/quests` | daily and monthly goals | welcome banner, daily quests (timer, progress bars, chest reward), Friends Quest, Monthly Challenge badge card | ✔ daily (1 of 3 unlocked), monthly locked |
| S30 | Shop | `/shop` | spend gems | sections: Hearts (refill 350 gems, unlimited via Super), Power-ups (Streak Freeze 2/2 equipped, XP Boost, Double-or-nothing), Super upsell | ✔ guest (blocked behind create-profile overlay) |
| S31 | Profile (own) | Profile nav | identity and stats | avatar, name, username, joined date, following/followers, courses, statistics (streak, total XP, league, top-3 finishes), friend streaks, achievements preview, add friends | doc only |
| S32 | Other user's profile | tap a name in league/friends | social | follow/unfollow, block, report, stats | doc only |
| S33 | Avatar builder | Profile → edit avatar | customise avatar | part pickers, colours | doc only |
| S34 | Achievements | Profile → view all | long-term goals | badges with tiers and progress | doc only |
| S35 | Find friends | Profile → add friends | grow graph | search by name/username, contacts, invite link | doc only |
| S36 | Streak detail | tap streak flame | streak status | calendar month view, freezes used, streak society, friend streaks | doc only |
| S37 | Feed / notifications | bell icon (mobile) | social updates | friend milestones, "celebrate" reactions, announcements | doc only |
| S38 | Settings: Account | `/settings/account` | profile data | name, username, email, password, delete account, export data | ✔ nav seen |
| S39 | Settings: Preferences | `/settings/preferences` | lesson experience | toggles: sound effects, animations, motivational messages, listening exercises (speaking on mobile). Dark mode: system / on / off | ✔ |
| S40 | Settings: Notifications | `/settings/notifications` | reminders | practice reminder + time, smart scheduling, streak saver, leaderboard, friend activity, email/push per type | doc only |
| S41 | Settings: Privacy | `/settings/privacy` | visibility | "make my profile public" (off disables leagues + friends), personalised ads | doc only |
| S42 | Settings: Courses | settings | manage courses | list, remove/reset course | doc only |
| S43 | Settings: Subscription | settings | manage Super | plan, renewal, cancel, family members | doc only |
| S44 | Super paywall | Super badge, out-of-hearts, shop | convert | plan cards (monthly / annual / family), free trial, feature list | doc only |
| S45 | Family plan management | subscription settings | share Super | invite up to 5 more, member list, remove | doc only |
| S46 | Max features | Max subscription | AI practice | Video Call (live voice with transcript), Roleplay (chat with feedback), Explain My Answer | doc only |
| S47 | Ad interstitial | after a lesson (free, mobile) | revenue | full-screen ad + close | doc only |
| S48 | Help center | More → Help | support | FAQ accordion, article pages, send feedback | ✔ |
| S49 | Unit intro card | first level of each unit (Preview) | set the goal | goal "I can…", 5 key phrases with audio, 30-sec clip, repeat-after-me | curriculum |
| S50 | Input session / story player | Story Episode, Story levels | comprehensible input | scene art, character speech bubbles + audio, tap-a-word gloss, picture questions | curriculum |
| S51 | Listening lab | Listening Lab levels | listening with support | clip player (normal + slow), questions, repeat-after-me | curriculum |
| S52 | Dictation | Dictation levels | listen and write | play / slow buttons, text input, per-word diff, sound vs spelling tags | curriculum |
| S53 | Conversation lab | Conversation Lab levels | AI partner role-play | scenario card (your half of the info gap, goal), mic + type fallback, chat bubbles with audio, outcome check, transcript + rubric | curriculum |
| S54 | Quick game / fluency sprint shell | Quick Game, Fluency Sprint levels | timed recall | 3-min timer, score, combo, one of 6 games or a speaking sprint | curriculum |
| S55 | Writing lab | Writing, Essay, Mediation levels | plan → draft → feedback → revise | prompt + reader, word counter, feedback on 2–3 priorities, revision, model answer | curriculum |
| S56 | Checkpoint / final + gate result + repair | Test, Final Test levels | gated assessment | sections (listen, read, speak, write), score vs 80%, repair list, retake | curriculum |
| S57 | Grade project | Project levels | capstone | brief, recorder (audio/video), AI exchange, rubric, one revision | curriculum |
| S58 | Live conversation / mission upload | Live Speaking, Real-World Mission levels | real-person practice | partner type, upload excerpt or log, self-assessment, rubric | curriculum |
| S59 | Domain + interests picker | onboarding and settings | choose electives | domain chips (work, health, regional varieties…), interest tags | curriculum |
| S60 | Content review admin | `/spanish/admin` (ADMIN_EMAILS) | run the pipeline | level list by grade/status, version diff, validation report, regenerate, publish, learner reports | new |

## Flows

```
F01 Guest starts and finishes the first lesson
    S01 -> S02 -> S03 (9 steps) -> S12 -> S13 (x~13) -> S17 -> S18 (6 cards) -> S05 prompt -> S07
    happy path clicks to the first exercise: 17 (number to beat)
    edge: wrong answer (heart lost, item re-asked at end), skip, quit mid-lesson,
          match-pairs mis-tap costs a heart, choose "find my level" -> S04

F02 Guest saves progress (create profile)
    S18 profile card / S07 right rail -> S05 -> S07 (progress carried over)
    happy path clicks: 2 + form
    edge: under-13 (no social features), email taken, SSO cancelled, abandoned -> progress lost

F03 Returning learner does today's lesson
    S07 -> S08 -> S12 -> S13 ... -> S17 -> S18 -> S07
    happy path clicks: 2 to first exercise
    edge: streak at risk late in the day, streak already broken (repair offer),
          new league week results (S28) shown on open, unit finished -> unit review node

F04 Runs out of hearts / energy
    S12 -> S15 -> (gems refill | practice lesson | S44 Super | ad) -> S12
    edge: not enough gems, practice also fails, Super trial already used

F05 Placement / jump ahead
    S03 "find my level" -> S04 -> S07 at the placed unit
    S07 "JUMP HERE?" / S09 "Jump to section" -> test-out lesson -> unlock or fail
    edge: fail the jump test (no progress change), jump back is not allowed after placement

F06 Legendary on a finished node
    S08 (completed) -> Legendary -> S20 -> gold node
    edge: too many mistakes -> fail, gem cost for free users

F07 Practice mistakes / words
    S25 -> Mistakes | Words | Speak | Listen -> S12 variant -> S17
    edge: no mistakes yet (empty state), microphone denied (speaking off)

F08 Weekly league
    first 3 lessons unlock -> S27 placed in a 30-person cohort -> earn XP all week ->
    Sunday reset -> S28 promoted/stayed/demoted
    edge: private profile (no leagues), under-13, irregular XP flagged and removed,
          Diamond top 10 -> Tournament (quarter / semi / final)

F09 Daily quests and chest
    any lesson -> quest progress -> S18 quests complete -> chest -> gems
    edge: quest expires at local midnight, monthly challenge badge at month end

F10 Protect the streak
    S30 buy Streak Freeze (max 2 equipped) -> miss a day -> freeze consumed -> S36
    edge: no freeze -> streak lost -> repair offer (gems or Super monthly repair),
          time-zone change, practice right before midnight

F11 Subscribe to Super
    S44 -> plan -> free trial -> store / Stripe checkout -> unlimited hearts, no ads
    edge: trial already used, payment failed, restore purchase (mobile),
          cancel keeps access to period end, refunds handled by Apple/Google on mobile

F12 Family plan
    S43 -> S45 invite link -> member accepts -> member gets Super
    edge: member already subscribed, 6-seat cap, owner cancels

F13 Friends
    S35 find -> follow -> S32 -> Friend Streak invite / Friends Quest pairing (S29)
    edge: block/report, friend streak broken by the other person, max 5 friend streaks

F14 Switch or add course
    S11 -> pick course -> S03 short version -> S07 for that course
    edge: reset/remove course in S42 (destructive, confirm)

F15 Story / Radio
    S07 story node -> S21 -> questions -> S17

F16 Change daily goal, reminders, preferences
    S38–S41 toggles -> saved immediately

F17 Delete account / export data
    S38 -> confirm -> soft-delete grace period
    edge: active subscription must be cancelled in the store first

F18 Max conversation practice
    S25 / path video-call node -> S46 video call or roleplay -> transcript + feedback
    edge: not Max (paywall), unsupported course, mic denied
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button (3D, chunky, bottom border) | primary green, secondary blue, outline/ghost, danger red, super (gradient), disabled | default, hover, pressed (drops down), focus, disabled, loading | all |
| Stat chip | course flag + Score, streak flame, gems, hearts/energy, Super badge | normal, zero/greyed, animated increment | S07 top bar, S12 |
| Side nav (web) / tab bar (mobile) | icon + label, collapsed icon-only | active, hover, badge dot | all main screens |
| Path node | lesson, practice, chest, story, radio, video call, adventure, unit review (trophy), legendary (gold) | locked, current (progress ring + "START" tooltip), completed, legendary, jump-here | S07 |
| Unit header banner | section/unit label, title, guidebook button, back to sections | per-unit colour | S07 |
| Popover card | node start, locked hint | open/closed | S08 |
| Progress bar | lesson (green → gold on combo), quest (with chest end-cap), section %, score bar | empty, partial, full | S12, S29, S09, S18 |
| Option card | image card with number key, text option row, pair tile | default, hover, selected (blue), correct (green), wrong (red flash), disabled/matched (faded) | S12, S03 |
| Word bank + answer line | tile tray, placed tiles | idle, dragging/tapped, placed | S12 (translate/arrange) |
| Text input | single line, multi-line translate | empty, typing, accent keyboard, graded | S12 |
| Audio button | normal speed, slow (turtle) | idle, playing | S12, S10, S21 |
| Mic button | speak exercise | idle, listening, processing, permission denied, "can't speak now" | S12 |
| Feedback sheet | correct, incorrect, skipped | with or without explanation, report menu | S13 |
| Mascot + speech bubble | full-screen, side peek, in-exercise character | static, animated | S03, S12, S14, S18 |
| Celebration card | XP tile, accuracy tile, time tile | count-up animation | S17 |
| Full-screen reward card | streak, score, quest, chest, league result, achievement | animated entry | S18, S28 |
| Week strip | Mon–Sun circles | done, today, missed, frozen | S18, S36 |
| Modal / sheet | confirm, paywall, out-of-hearts, profile prompt | open, closing | S15, S16, S44 |
| Leaderboard row | rank, avatar, name, XP | normal, me (highlight), promotion zone, demotion zone | S27 |
| League badge | 10 tiers | locked, current, achieved | S27, S28 |
| Quest card | daily, friends, monthly | in progress, complete, claimed, expired | S29 |
| Shop item row | consumable, equippable, Super | affordable, too expensive, equipped (n/max), owned | S30 |
| Avatar | photo, built avatar, initials | sizes xs–xl, Super ring | S27, S31, S32 |
| Toggle / radio list | settings | on, off, disabled | S38–S42 |
| Section card | CEFR tag, progress, sample phrase, CTA | current, locked, completed | S09 |
| Key-phrase card | phrase + translation + audio | — | S10 |
| Toast / banner | info, success, error | — | global |
| Skeleton loader | list rows, path | loading | S27, S07 |
| Countdown chip | hours left, days left | — | S27, S29 |

## Exercise types (the lesson player's core)

| # | type | input | grading | seen |
| --- | --- | --- | --- | --- |
| E01 | Select the image ("Which one of these is X?") | tap / number key | exact choice | ✔ |
| E02 | Match pairs (5 pairs, 10 tiles) | tap two tiles | per pair, wrong pair costs a heart | ✔ |
| E03 | Select the correct meaning (character says a word) | tap / number key | exact choice | ✔ |
| E04 | Translate with word bank | tap tiles to build a sentence | accepted-answers list | doc |
| E05 | Translate by typing | keyboard | fuzzy match against accepted answers (typos allowed, accents warned) | doc |
| E06 | Tap what you hear | listen, word bank | accepted answers | doc |
| E07 | Type what you hear | listen, keyboard (slow audio button) | fuzzy | doc |
| E08 | Speak this sentence | microphone | speech recognition score ≥ threshold | doc |
| E09 | Complete the sentence / fill the blank | choice or type | exact or fuzzy | doc |
| E10 | Complete the chat / dialogue | choose a reply | exact | doc |
| E11 | Mark the correct meaning (sentence) | choice | exact | doc |
| E12 | Arrange words | drag/tap tiles | exact order | doc |
| E13 | Listen and choose / what do you hear | listen, choice | exact | doc |
| E14 | Character → sound, build character, trace stroke (non-Latin scripts) | tap / draw | exact / stroke match | doc |

Lesson rules seen live: about 13 exercises per lesson. A new word is introduced with a
"NEW WORD" tag. A wrong item is re-asked at the end under a "Let's review the exercises
you missed!" interstitial and tagged "PREVIOUS MISTAKE". The bar turns gold and shows "N IN A ROW" during a correct-answer
combo. A skip counts as wrong. The first lesson awarded 14 XP at 92% accuracy.

## Inferred data model

```
User            (host app's existing user) + learning_profile: daily_goal_minutes,
                motivation, referral_source, public_profile bool, under_13 bool, timezone,
                reminder_time, prefs json (sfx, animations, motivational, listening, speaking, dark_mode)
                evidence: S03 steps, S39, S41, help "leaderboards"   confidence: high

-- content: host app's grade/level model (see "Host app content model"), shared by all learners
Course          id, learning_lang (es), from_lang (en), title, flag, status
                evidence: S02 grid, S11, user's spec                 confidence: high
Grade           id, course_id, order (1..57), title, cefr_band ("A1.2"), lemma_target,
                track (null | culture-history | literature | translation | linguistics | teaching)
                evidence: curriculum row 1 titles; S09                confidence: high
Unit            id ("u{g}.{n}" | entry | wrap-up), grade_id, order, goal ("I can …"),
                key_phrases[5], optional bool, colour, guidebook json
                evidence: curriculum Unit + Preview rows; S07 header, S10   confidence: high
Level           id ("g{g}/l{n}"), grade_id, unit_id, order, level_type (22 values), activity,
                title (Node), skill_focus, path (core|optional|track|enrichment|domain:*),
                what_happens, est_min, gate_pct (80 for Checkpoint/Final, else null),
                xp_reward, current_version_id
                evidence: curriculum columns; S07 nodes, S08         confidence: high
LearnerDomain   user_id, domain (work-business | health | variety-Mexico | …), chosen_at
                evidence: Path "Domain: *", Checkpoint "Domain lessons this learner took"
                confidence: high
ItemBank        unit_id, item_id, exercise json, skill, lexeme_ids[], grammar_point
                (games, Unit Checks, Checkpoints and Finals draw from this)   confidence: proposal
ReadingText     id, grade_id, interest_tag, text, known_word_ratio, word_count (Reading Block pool)
                confidence: proposal
LevelVersion    id, level_id, version, status (draft|validated|published|retired),
                content json (exercises[]), generated_by (model), validation_report_id, created_at
                evidence: user's generate -> validate -> publish     confidence: proposal
Exercise        id (stable), level_version_id, order, type (E01..E14), prompt, payload json
                (choices, pairs, tiles, image_ref, audio_ref), accepted_answers[], tags (new_word)
                evidence: S12 variants                               confidence: high
Lexeme / Word   id, course_id, text, translation, audio_ref, image_ref, part_of_speech
LedgerEntry     course_id, lexeme_id | grammar_point, introduced_in_level_id, reviewed_in_level_ids[]
                evidence: S26, NEW WORD tag; needed for generation context and validator
                confidence: proposal
MediaAsset      id, kind (audio|image), source_text_or_prompt, hash (dedupe), url, voice
GenerationRun   id, scope (course|grade|level), model, tokens_in, tokens_out, cost, started_at, status
ValidationReport id, level_version_id, scores json (quality, fit_with_grade, answer_coverage,
                 difficulty), issues[], verdict (pass|regenerate|human_review)
ExerciseReport  user_id, exercise_id, reason (wrong answer accepted|my answer should be accepted|
                audio|other), created_at, resolved_at   evidence: S13 Report
                confidence: proposal

Enrollment      user_id, course_id, current_level_id, score (progress score),
                placed_at, started_at
                evidence: S07, S08, S18 score                        confidence: high
LevelCompletion user_id, level_id, level_version_id, best_accuracy, legendary bool, completed_at
                evidence: S07 states, F06                            confidence: high
LessonSession   id, user_id, level_id, level_version_id, kind (lesson|practice|legendary|placement|jump|story),
                started_at, ended_at, xp_earned, accuracy, mistakes, combo_max, status
                evidence: S17                                        confidence: high
Answer          session_id, exercise_id, response json, correct bool, skipped bool, ms
                evidence: S13, review list S19                       confidence: medium
UserWordStrength user_id, lexeme_id, strength 0..1, last_seen, next_due (spaced repetition)
                evidence: practice "targets content due for review"   confidence: medium (guess at shape)
Mistake         user_id, exercise_id, created_at, resolved_at
                evidence: Practice → Mistakes, PREVIOUS MISTAKE      confidence: high
ReviewQueueItem user_id, item_id, due_at, interval, ease, lapses   (the "spaced-review queue")
WeakSpot        user_id, lexeme_id | grammar_point | sound, score, updated_at
ErrorLogEntry   user_id, source_level_id, item_id, tag (sound|spelling|grammar|vocab|…),
                learner_text, correct_text, created_at
                evidence: curriculum Quick Game, Unit Check, Dictation, Checkpoint text  confidence: high
GateAttempt     user_id, level_id (Checkpoint|Final), score, passed, repair_items[], attempt_no
                evidence: "Gate at 80% … targeted repair … retake"   confidence: high
ConversationSession user_id, level_id, scenario_id, transcript json, audio_ref, rubric json,
                tokens, cost        evidence: Conversation Lab, Grade Project   confidence: high
WritingSubmission user_id, level_id, draft, feedback json (2–3 priorities), revision,
                rubric json         evidence: Writing Lab / Essay / Mediation   confidence: high
SpeechAttempt   user_id, item_id | level_id, audio_ref, transcript, pronunciation json,
                speech_rate, pause_stats, rubric json   evidence: Speaking, Checkpoint, Project
LiveSessionLog  user_id, level_id, partner_kind (tutor|exchange|peer|ai_standin), excerpt_audio_ref,
                rubric json, counts_as_real bool    evidence: Live Conversation   confidence: high
MissionLog      user_id, level_id, upload_ref, self_assessment json   evidence: Real-World Mission

XpEvent         user_id, amount, source (lesson|bonus|quest|boost|story), created_at
                evidence: XP totals, leagues weekly sum              confidence: high
Streak          user_id, current, longest, last_active_date (local), freezes_equipped (0..2),
                goal (7|14|30|50), history (date, status: done|frozen|missed|repaired)
                evidence: S18 week strip, S30 freeze 2/2, S36        confidence: high
Wallet          user_id, gems                                         evidence: stat bar 505   confidence: high
Hearts          user_id, hearts (0..5), refill_at  -- or Energy: energy (0..25), regen rule
                evidence: S12 counter, energy reports                confidence: high (make it configurable)
ShopItem        id, kind (heart_refill|streak_freeze|xp_boost|double_or_nothing|...), price_gems, max_owned
Purchase        user_id, item_id, gems_spent, created_at
                evidence: S30                                        confidence: high

QuestDef        id, period (daily|monthly|friends), metric (xp|lessons|accuracy|minutes|...),
                target, reward (gems|chest|badge)
UserQuest       user_id, quest_def_id, period_start, progress, completed_at, claimed_at
                evidence: S29, S18 "Earn 10 XP 10/10"                confidence: high
Achievement     id, tier_thresholds[], metric;  UserAchievement user_id, achievement_id, tier, progress
                evidence: blog achievements, S34                     confidence: medium

League          tier 1..10 (Bronze..Diamond)
LeagueCohort    id, tier, week_start, size (~30), timezone_bucket
LeagueMember    cohort_id, user_id, xp, final_rank, outcome (promoted|stayed|demoted)
                evidence: help article, blog, S27                    confidence: high (size is a guess)

Follow          follower_id, followee_id, created_at;  Block blocker_id, blocked_id
FriendStreak    user_a, user_b, current, last_both_active_date      (max 5 per user)
FriendsQuest    week_start, user_a, user_b, target, progress
                evidence: help "find, follow, block", blog friends   confidence: high

Subscription    user_id, plan (super|max), period (month|year), family_owner_id,
                provider (stripe|app_store|play), status, trial_ends_at, renews_at
FamilyMember    owner_id, member_id (max 6 incl. owner)
                evidence: S43–S45, App Store IAP, terms              confidence: high
NotificationPref user_id, channel (push|email), type, enabled, time
                evidence: S40                                        confidence: high
```

Relationships: Course 1-n Grade 1-n Unit 1-n Level 1-n LevelVersion 1-n Exercise.
LevelVersion 1-1 ValidationReport. Exercise n-n Lexeme (via payload refs). User 1-n Enrollment
n-1 Course. User 1-n LessonSession 1-n Answer. User 1-1 Streak / Wallet / Hearts. User
n-n User via Follow / FriendStreak. LeagueCohort 1-n LeagueMember n-1 User.

## Feature matrix

See `features.csv` (149 rows). Must: 68, should: 45, could: 25, skip: 11.

## Out of scope (cannot or should not be cloned)

- **Duolingo's course content**: every sentence, translation, audio clip, illustration
  and character (Duo, Lily, Junior, Bea…). It is Service Content under their terms. Your
  content comes from your own generation pipeline. Never give the generator Duolingo
  sentences or guidebook text as examples or context.
- **Brand**: the name, the owl, the "feather" green palette, the Feather Bold
  typeface, and sound effects. replica-brand gives you your own.
- **The learner network**: Duolingo's leagues work because millions are online.
  Your leagues need cohort-size fallbacks (bots are a dark pattern, so use smaller
  cohorts or friends-only leagues) until you have users.
- **Duolingo Score's calibration** to CEFR/real-world proficiency is their research.
  Build a simple progress score and do not claim CEFR equivalence without testing.
- **Duolingo English Test, Podcast, Chess, Math, Music**: separate products.
- **Their AI tutors' personas** (Lily). Your curriculum makes AI conversation core
  (721 Conversation Labs), so build it with your own LLM (Claude) and your own characters.
- **Their ad network deals.** Ads are optional and off by default.
- **Diamond Tournament and limited-time events**: need scale and live-ops.

## Size

Screens 60: 48 from Duolingo plus S49–S60 that your curriculum adds.
Flows 18 (+ gate/repair, domain choice, live session), entities ~45, exercise types 14,
game engines 6. Content: 57 grades, 721 units, 10,169 levels, ~2,160 learner-hours.

Hard parts:
1. **The Spanish generation pipeline.** Generating 10,169 levels (about 6,300 with unique
   specs, the rest fed by each unit's item bank), validating them, and publishing them. The generator must output typed exercises with full
   accepted-answer lists, keep the vocabulary/grammar ledger consistent across 57
   grades, and produce a media manifest for TTS and images. You also need a small
   admin view to browse levels, read validation reports, regenerate, and resolve
   learner reports. Generate one grade end to end first and tune the prompts before
   running all 57.
2. **Grading at runtime.** Fuzzy typed-answer matching (typos, accents, multiple valid
   translations); speech recognition **plus pronunciation and fluency scoring** (speech
   rate, pausing) on web and mobile; rubric scoring of writing, projects and
   conversations by an LLM. This is a per-learner running cost, so budget it.
2b. **The learner model.** Spaced-review queue, weak-spot list, tagged error log, 80% gates
   with targeted repair, and per-user assembly of Unit Checks, games, Checkpoints and Finals.
2c. **AI Conversation Lab** in every unit. It needs realtime voice or turn-based voice,
   a scenario with an information gap, an outcome check, and a transcript.
2d. **Live Conversation** with real people (170 levels). Tutor or peer matching is a
   marketplace-sized feature. Start with "upload an excerpt + rubric" and the flagged AI
   stand-in. Peer matching comes later.
3. **Time-zone-correct streaks and resets.** Streak days, freezes, daily quests at local
   midnight, and league weeks ending Sunday local time.
4. **Leagues at scale.** Weekly cohort matchmaking, promotion and demotion jobs, anti-cheat.
5. **Payments on three platforms.** Stripe on web plus Apple/Google IAP on mobile, with
   one entitlement, family plans and trials. Use RevenueCat or similar.
6. **Polish.** Animations, sounds and haptics are a big part of why it "feels like
   Duolingo".
7. **Offline lessons** on mobile (Super perk) means syncing sessions back later.

Size: **XL. Rescope into phases.** Web first, mobile-first layout, wrapped with Capacitor (the host roadmap's plan) so "both platforms" doesn't double the work. Suggested order:
- **Phase 1 (M–L, ~6–8 weeks): grade 1 playable end to end.** Importer for the CSV;
  generation → validation → publish for grade 1's 94 levels; path with units; lesson
  player with 8 core exercise types; unit intro, story, input session, listening lab,
  dictation; 2 of the 6 quick games; Unit Check from a basic review queue; XP, streak,
  hearts, daily goal, lesson-complete sequence; inside the host app's auth.
- **Phase 2 (L): the AI and learner-model layer.** Speech scoring, Conversation Lab,
  writing lab feedback, error log + weak spots, Checkpoint/Final with 80% gate + repair,
  Entry Check placement, remaining 4 games + fluency sprints, grade project. Then
  generate grades 2–15 (A1–A2).
- **Phase 3 (M): Duolingo habit loop.** Gems + shop, quests, streak freeze, practice hub,
  settings, notifications, optional units + domain picker. Generate grades 16–42.
- **Phase 4 (M–L): social + money.** Leagues, friends, profile, achievements;
  subscriptions across web and stores; live conversation upload + AI stand-in;
  real-world missions; tracks 43–57.

No promise of a pixel-perfect clone. The target is the same mechanics and feel, with
your own content and brand.
