# Architecture: Polymath Spanish (a Duolingo-style section rebuilt inside Polymath)

Inputs: `replica/recon.md`, `replica/features.csv`, the curriculum
`replica/curriculum/Spanish_Fluency_Path.csv`, and the host codebase at
`C:\coding\claudecommittdIq\folderThing\iq-max-repo-2-claude-adoring-mayer-woc9sq`.
Date: 2026-10-13.

The Spanish section is a **separate app inside the host**. It has its own pages, look,
player, games, content pipeline and learner state. It shares the host's accounts,
AI providers, security and admin list. Nothing in the host's generic path, player,
block levels or per-learner lesson generation is used by it.

## Stack

The host's stack, kept on purpose. The user already knows it and it runs with no
build step.

| layer | choice | why |
| --- | --- | --- |
| server | Node 24 + Express 4, the existing `server.js` | Already running; the Spanish routes mount as one more router (`routes/spanish/*`) |
| web client | static HTML + vanilla JS modules under `public/spanish/`, its own CSS tokens | Matches the host (strict CSP, no inline script, no bundler). The Duolingo feel comes from CSS, sound and animation, not a framework |
| mobile | Capacitor wrap of the same pages (host roadmap Phase 9) | One codebase for web, iOS and Android. Mic and audio work in the WebView. Native push and IAP plugins come later |
| content store | **SQLite** via built-in `node:sqlite`, file `data/spanish.sqlite` (schema: `replica/schema.sql`) | 10k levels, ~150k items and per-answer writes don't belong in the 129 MB `db.json` that is rewritten whole every 250 ms. Zero new dependencies. Maps 1:1 to the host's planned Postgres |
| learner state | same SQLite file, `es_*` learner tables | Transactions for hearts, gems and streaks. One file to back up |
| accounts | host `express-session` + bcrypt (`/api/auth/*`, `requireAuth`, `req.user`) | Reuse. The Spanish section never has its own login |
| AI: content | host `services/ai.js` `structured()` with the `deep` role | Existing provider chain, fallbacks and cost recording |
| AI: runtime | `ai.talk()` / `structured()` with the `fast` role, budget-guarded by `ai.withinBudget(userId)` | Conversation lab, writing feedback, rubric scoring |
| voice | **Gemini TTS** (`gemini-2.5-flash-preview-tts`, one voice per character) for speaking; MiMo `mimo-v2.5-asr` for recognition. Both live in `services/spanish/voice.js` | Tested 2026-10-13: MiMo's TTS voices do not pronounce Spanish intelligibly, while Gemini's came back word-perfect through MiMo ASR. TTS is rendered once and cached. Over quota, the browser's Spanish voice takes over. See `level-types.md` |
| audio files | `data/spanish-media/{hash}.mp3`, served at `/spanish-media/:hash` with immutable caching | Pre-rendered once and shared. Move to object storage (R2/S3) before launch, since ~150k clips is ~3 GB |
| payments | none yet: gems are earn-only. Super-like tier = host `profile.subscription` field | The host has no billing. Stripe + store IAP (RevenueCat) is milestone 7 |
| email / push | none at first. Capacitor push later (streak and practice reminders) | The host has no email provider |
| jobs | in-process timers started from `app.listen` (same pattern as `learner-record.start()`) plus CLI scripts for the pipeline | Single box. League rollover is the only scheduled job. Streaks and quests roll over lazily on read |
| hosting | the host's (Railway per ROADMAP) with a persistent volume for `data/` | SQLite and media need a disk that survives deploys |

**Before any code: put the host repo under git.** It isn't a repository today, so
there is no undo for a bad edit across 30+ new files.

### Where it lives in the host repo

```
routes/spanish/            index.js (mounts all below), learn.js, sessions.js, voice.js,
                           ai-activities.js, habit.js, admin.js, social.js
services/spanish/          store.js (node:sqlite, the only file that knows the engine),
                           content.js, assemble.js (per-user queues), grade.js (answer
                           checking), srs.js, streaks.js, quests.js, hearts.js, gates.js,
                           voice.js (TTS/ASR), speech-score.js, conversation.js,
                           writing.js, rubric.js
scripts/spanish/           import-curriculum.js, generate.js, validate.js, media.js,
                           publish.js, report.js
config/spanish/            engines.js (level type -> engine), quests.js, shop.js,
                           characters.json, prompts/*.md (generator + validator prompts)
public/spanish.html        app shell for every /spanish/* route
public/spanish/css/        tokens.css, components.css, player.css, games.css
public/spanish/js/         router.js, api.js, audio.js, recorder.js, path.js, player.js,
                           exercises/*.js (one per item kind), games/*.js (6 games),
                           activities/*.js (intro, story, listening, dictation,
                           conversation, writing, gate, project, upload), habit/*.js
public/spanish/sounds/     your own SFX (correct, wrong, complete, streak, chest)
public/spanish-content/    published unit bundles: {unitId}.{hash}.json (immutable)
data/spanish.sqlite        content + learner state
data/spanish-media/        rendered audio and images
```

## Schema

Tables: **35** (13 content, 13 learner and runtime AI, 5 habit loop, 4 social).
Engine: SQLite now, with Postgres-shaped columns. Full DDL in `replica/schema.sql`
(loaded and constraint-tested on Node 24).

Access rules: **data-layer checks.** Every learner query in `services/spanish/*`
takes `userId` from `req.user.id` and filters on it, and there's no route that
accepts a user id from the client. Admin routes reuse the host's `ADMIN_EMAILS`
check. `user_id` can't be a foreign key because users live in `db.json`, so:

- the account-deletion path deletes every `es_*` row for the user in one transaction,
- `/api/account/export` adds the user's `es_*` rows.

| group | tables |
| --- | --- |
| content (shared) | `es_characters`, `es_grades`, `es_units`, `es_levels`, `es_level_versions`, `es_items`, `es_lexemes`, `es_grammar_points`, `es_ledger`, `es_media`, `es_reading_texts`, `es_generation_runs`, `es_validation_reports` |
| learner model | `es_learners`, `es_grade_progress`, `es_level_progress`, `es_sessions`, `es_answers`, `es_review_queue`, `es_weak_spots`, `es_error_log`, `es_gate_attempts` |
| runtime AI | `es_speech_attempts`, `es_conversations`, `es_submissions`, `es_item_reports` |
| habit loop | `es_xp_events`, `es_streaks`, `es_streak_days`, `es_quests`, `es_purchases` |
| social | `es_league_cohorts`, `es_league_members`, `es_follows`, `es_blocks` |

Hard constraints enforced by the database, not the UI:

- **One published version per level:** partial unique index `es_versions_one_published`.
- **Learner sessions pin a version** (`es_sessions.version_id`), so publishing never changes a lesson someone is in.
- **Idempotent writes:** `UNIQUE(user_id, client_session_id)`, `UNIQUE(session_id, client_answer_id)`, `UNIQUE(user_id, client_purchase_id)`, `UNIQUE(session_id, source)` on XP.
- **No negative gems, hearts within 0–5, at most 2 freezes:** CHECK constraints.
- **Gate attempts numbered per learner per level:** `UNIQUE(user_id, level_id, attempt_no)`.

### Level type → engine (from the curriculum's 22 types)

| CSV Level Type / Activity | engine | content at build time | at runtime |
| --- | --- | --- | --- |
| Lesson/Topic, Speaking/Topic, Listening/Topic, Reading/Topic, Pronunciation/*, Translating/Topic, Writing/Topic, Review Game | `lesson` (Reading/Topic → `reading`) | 10–15 typed items + new-word flags | answer checking; ASR for `speak` items |
| Preview/Unit Intro | `unit_intro` | goal, key phrases, clip script | — |
| Story Episode/Input Session, Story/Story | `input_session`, `story` | scenes, lines, speakers, questions | — |
| Listening/Listening Lab | `listening_lab` | clips + questions | — |
| Reading/Reading Block | `reading_block` | pool of texts per interest per grade | pick by interest |
| Dictation | `dictation` | 3–5 lines | sound vs spelling tagging |
| Game/Quick Game | `quick_game` + `game` | none: draws from the unit's item bank | assemble: unit items + due reviews |
| Speaking Game/* | `fluency_sprint` | chunk list | ASR per chunk |
| Speaking/Conversation Lab | `conversation_lab` | scenario: roles, info-gap halves, goal, outcome check | LLM partner + TTS + ASR, rubric |
| Writing, Essay/Writing Lab | `writing_lab` | prompt, reader, criteria, model answer | LLM feedback + rubric |
| Translating/Mediation Task | `mediation` | source text, reader, model | LLM feedback + rubric |
| Quiz/Unit Check | `unit_check` | none: bank | assemble from review queue + weak spots |
| Test/Checkpoint | `checkpoint` (gate 80) | speaking + writing prompts | assemble + score + repair |
| Final Test/Final | `final` (gate 80) | prompts | assemble weighted to weak spots |
| Placement Test/Entry Check | `entry_check` | none | adaptive, 3–4 items per unit |
| Project/Grade Project | `project` | brief + rubric | upload + LLM rubric, 1 revision |
| Live Speaking/Live Conversation | `live_conversation` | brief | upload excerpt + rubric; AI stand-in flagged |
| Real-World Mission | `mission` | brief + can-do list | upload + self-assessment |

About 6,300 levels get their own generated content. The engines that draw from the
bank (games, checks, tests, placement) need no per-level generation beyond their
prompts.

### The content pipeline (CLI, run by you, not by learners)

```
import-curriculum  CSV -> es_grades / es_units / es_levels (+ engine, game, gate_pct, domain)
generate --unit u01.1      for each level: spec + grade + unit goal + prev/next level specs
                           + ledger so far -> typed JSON (schema-validated) -> es_level_versions
                           (draft) + es_items + ledger rows
validate --unit u01.1      deterministic checks (schema, every item has accepted answers,
                           no unintroduced lexemes in Core, audio text present) then an LLM
                           review: quality, fit with the grade, answer coverage, difficulty
                           -> es_validation_reports; verdict pass | regenerate | human_review
media --unit u01.1         every audio string / image prompt -> es_media (dedupe by hash) -> render
publish --unit u01.1       validated + media ready -> status=published, pointer set,
                           bundle written to public/spanish-content/{unit}.{hash}.json
report --grade g01         tokens, cost, verdicts, lemma target vs ledger
```

Order: unit 1.1 by hand-checked prompts → grade 1 → tune → grades 2–15 → 16–42 → tracks.
The client never sees `accepted` answers: bundles strip them and grading happens on the server.

## API

All under `/api/es/*` behind `requireAuth` unless marked. The host forces
`Cache-Control: no-store` on `/api`, so cacheable things (bundles, audio) are served
**outside** `/api`.

**F01/F02 onboarding** (S02, S03, S59)

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| GET /api/es/me | stat bar + learner state; 404 if not onboarded | learner | — | xp, streak, gems, hearts (regen applied), current level, prefs |
| POST /api/es/onboarding | create `es_learners`, grade 1 active | learner | goal, motivation, proficiency, start (scratch\|placement), timezone, interests | learner, next level id |
| PUT /api/es/domains | set domain electives + interests | learner | domains[], interests[] | ok |

**F03 learn path** (S07–S11, S49)

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| GET /api/es/grades | grades overview with status | learner | — | grades[] (cefr, % done, locked) |
| GET /api/es/path/:gradeId | units + level nodes with per-user state | learner | — | units[{goal, levels[{id, engine, title, state, optional}]}] |
| GET /api/es/units/:unitId | bundle URL + guidebook | learner | — | bundle_url, guidebook |
| GET /spanish-content/:file | published unit bundle (immutable, long cache) | public | — | JSON (no accepted answers) |
| GET /spanish-media/:hash | audio or image (immutable) | public | — | mp3 / webp |

**F03/F04 sessions** (S12–S19, S50–S52, S54)

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| POST /api/es/sessions | start or resume (idempotent); pins version; assembles queue for bank engines | learner | levelId or kind (practice_*), clientSessionId | session id, item ids, hearts |
| POST /api/es/sessions/:id/answers | check one answer on the server; hearts, SRS, error log, weak spots | owner | clientAnswerId, itemId, response, ms | correct, note (accent\|typo), expected, errorTag, hearts |
| POST /api/es/sessions/:id/finish | close; XP, accuracy, streak, quests, gems, unlocks, gate verdict (idempotent: replays `result`) | owner | — | xp, accuracy, streak, quests[], gems, gate?, next level |
| POST /api/es/sessions/:id/abandon | mark abandoned; no XP | owner | — | ok |
| POST /api/es/hearts/refill | refill with gems or start a hearts practice | learner | method (gems\|practice), clientPurchaseId | hearts, gems |
| POST /api/es/reports | report an item | learner | itemId, reason, response, note | ok |

**Voice and runtime AI** (S12 speak items, S53, S55, S57, S58)

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| POST /api/es/speech | ASR + lenient score + rate/pause; raw body ≤ 1 MB / 20 s | learner | audio (raw), itemId, sessionId, pauseMs | transcript, score, accepted, tips |
| POST /api/es/conversations | open a conversation lab | learner | levelId | id, scenario (learner half), partner opening line + audio |
| POST /api/es/conversations/:id/turns | one turn (cap 16) | owner | text or audio | partner text, audio hash, goal progress |
| POST /api/es/conversations/:id/end | outcome check + rubric | owner | — | outcome_met, rubric, transcript |
| POST /api/es/writing/:levelId/feedback | 2–3 priorities on a draft | learner | draft | feedback |
| POST /api/es/writing/:levelId/submit | rubric + model answer | learner | revision | rubric, model |
| POST /api/es/uploads | project / live excerpt / mission file (≤ 10 MB) | learner | levelId, kind, file, partner, selfAssessment | submission id, rubric (async for project/live) |

**F05 placement, gates, practice** (S04, S25, S26, S56)

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| POST /api/es/placement | start an entry check for a grade (adaptive) | learner | gradeId, clientSessionId | session (kind placement) |
| GET /api/es/practice | counts: due reviews, mistakes, words, speak, listen | learner | — | counts |
| GET /api/es/words | learned lexemes, paged | learner | page | words[] |
| POST /api/es/gates/:levelId/repair | build a repair session from the last failed attempt | learner | clientSessionId | session (kind repair) |

**Habit loop** (S18, S29, S30, S36, S38–S42)

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| GET /api/es/quests | today's + this month's quests (lazily created) | learner | — | quests[] |
| GET /api/es/streak | calendar month + freezes | learner | month | days[], freezes |
| PUT /api/es/streak/goal | set streak goal | learner | goal | ok |
| GET /api/es/shop | items + prices | learner | — | items[] |
| POST /api/es/shop/buy | spend gems (atomic) | learner | itemCode, clientPurchaseId | gems, inventory |
| PATCH /api/es/settings | daily goal, prefs, timezone | learner | fields | learner |

**Admin** (S60, ADMIN_EMAILS only)

| method path | does |
| --- | --- |
| GET /api/es/admin/levels?grade&status | level list with version and verdict |
| GET /api/es/admin/levels/:id | versions, content, validation report, items, reports |
| POST /api/es/admin/levels/:id/regenerate | queue a regenerate with an optional note |
| POST /api/es/admin/levels/:id/publish | publish a validated version |
| GET /api/es/admin/reports?status=open | learner item reports |
| POST /api/es/admin/reports/:id | fix (edit accepted answers) or dismiss |
| GET /api/es/admin/runs | generation runs, tokens, cost |

**Social** (milestone 6): `GET /api/es/league`, `GET /api/es/profile/:userId`,
`POST/DELETE /api/es/follows/:userId`, `POST /api/es/blocks/:userId`.

Routes: **43** (36 API + 2 static + the `/spanish/*` page shell + 4 social).

Webhooks in: none yet (Stripe and store webhooks arrive with billing in milestone 7).
Webhooks out: none.
Jobs:
- `league-rollover`, hourly check, closes cohorts whose week ended in their time-zone bucket, writes outcomes (milestone 6)
- `media-render`, CLI, renders pending `es_media`
- `ai-scoring-queue`, in-process, scores project and live uploads one at a time (like `learner-record`)
- streaks, quests and hearts **have no job**: they're computed on read from the learner's local date

Only official APIs with your own keys: MiMo, OpenRouter, Gemini or Anthropic through
the host's providers. Duolingo's endpoints and assets are never used.

## The parts that bite

- **Microphone is blocked today.** `middleware/security.js` sends `Permissions-Policy: microphone=()`. Change it to `microphone=(self)`, or set it per route for `/spanish`. Add `media-src 'self' blob:` to the CSP for recorded-audio playback.
- **Body size.** The host parses JSON at 64 KB. `/api/es/speech` and `/api/es/uploads` mount `express.raw` with their own limits (1 MB, 10 MB), the same way `/api/essays` does.
- **Caching vs `/api` no-store.** Bundles and audio live outside `/api` with hashed names and `immutable`. Learner state stays no-store.
- **Time zones.** Streak days, daily quests and the league week use the learner's IANA zone (`Intl.DateTimeFormat`), never the server clock. A time-zone change is allowed once a day. A day missed across a DST change is still one day.
- **Idempotency.** Every start, answer, finish and purchase carries a client id with a unique index. A retried `finish` replays the stored result, so XP and gems never double. Mobile networks retry.
- **Races.** Two tabs on one account: hearts, gems and streak updates run in `BEGIN IMMEDIATE` transactions. Gem spend is `UPDATE … SET gems = gems - ? WHERE gems >= ?`, which checks the change count.
- **Server-side grading.** Accepted answers never ship to the client. Accents and a missing `ñ` count as correct with a nudge, except listed minimal pairs (año/ano). Reuse `services/grading.js` `normalize`/`stripAccents` and extend them for Spanish punctuation (¿ ¡) and dropped subject pronouns.
- **Lenient speech scoring.** Beginner ASR transcripts are rough. Score on token overlap with the target plus the accepted variants, pass at about 70%, and always allow "can't speak now". Measure speech rate and pauses on the client (Web Audio energy), not from ASR.
- **AI cost per learner.** Conversation labs (721) and writing labs (476+) run per learner. Cap turns, cap daily calls through `ai.withinBudget`, and cache TTS of partner replies by hash.
- **Rate limits.** Reuse `utils/rate-limit.js` on speech (e.g. 60/10 min), conversation turns and uploads.
- **Content versions.** Never edit a published version: regenerate means a new version. Item ids are stable, so the review queue survives a republish. Retired items drop out of queues.
- **Media volume.** About 150k clips is around 3 GB. Render once, dedupe by hash, use `playbackRate` for slow audio instead of a second clip, and move to object storage before launch.
- **Touch input.** Word blocks use tap-to-place (Duolingo's default) with pointer-event drag as a bonus. No HTML5 drag-and-drop, which doesn't work on touch.
- **Offline (mobile, later).** Unit bundles and hashed audio are already offline-friendly. Answers would queue with client ids and sync, which the idempotency above already supports.
- **Deletion and export.** Purge and export `es_*` by `user_id` from the host's account routes.
- **Under-13.** Social features (leagues, follows, live conversation peer matching) stay off for under-13 accounts. Check what age data the host collects.
- **Brand.** Use your own characters, voices, sounds and colours. No owl, no Feather font, no Duolingo green. replica-brand will check.

## Build order

Each milestone ends with something you can click through.

1. **Vertical slice: Unit 1.1 playable end to end.**
   Screens S03 (short), S07, S08, S49, S12, S13, S14, S16, S17, S18 (streak + XP cards).
   Tables: `es_grades`, `es_units`, `es_levels`, `es_level_versions`, `es_items`, `es_media`,
   `es_characters`, `es_learners`, `es_level_progress`, `es_sessions`, `es_answers`,
   `es_xp_events`, `es_streaks`, `es_streak_days`.
   Routes: me, onboarding, path, units, bundle + media static, sessions start / answers / finish / abandon.
   Pipeline: import-curriculum, generate + validate + media + publish for **unit 1.1 only**.
   Exercises: select_image, match_pairs, select_meaning, word_bank, tap_heard.
   Proves the generator output, the player, server grading, TTS and the path inside the host's login.
2. **Must-haves, grade 1 complete.** All lesson item kinds (type_translation, type_heard, fill_blank, arrange, listen_choose, speak with ASR); hearts; review queue + error log + weak spots; unit check; story + input session (S50); listening lab (S51); dictation (S52); quick games Listen and Tap, Word Race, Sentence Builder (S54); fluency sprint; conversation lab (S53); writing lab (S55); checkpoint + final with gate + repair (S56); entry check (S04); grade project (S57); admin review (S60). Generate all 94 levels of grade 1, then tune prompts.
3. **Must-haves, scale content.** Run the pipeline for grades 2–15 (A1–A2) with the ledger and lemma-target checks; reports → regenerate loop; cost report.
4. **Should-haves, habit loop.** Daily quests + chest (S29), gems + shop (S30), streak freeze + calendar (S36), practice hub + words (S25, S26), settings (S38–S42), domains + interests (S59), optional units, reading blocks, remaining 3 games, guidebook (S10), grades overview (S09). Generate grades 16–42.
5. **Should-haves, mobile.** Capacitor wrap, mic permission on iOS/Android, audio session handling, push reminders (practice and streak at risk).
6. **Could-haves, social.** Leagues (S27, S28), profile (S31, S32), follows/blocks, achievements, friend streaks; live conversation upload + AI stand-in (S58); missions; tracks 43–57.
7. **Money.** Super-like tier (unlimited hearts, more AI practice), Stripe on web + RevenueCat for store IAP, family plan.
8. **Fixes from replica-entrepreneur:** run it on Duolingo's public reviews and fold its top complaints in (the hearts/energy backlash, repetitive sentences, little real speaking practice). Your curriculum already answers several of these.
