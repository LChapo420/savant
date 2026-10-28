# Polymath — Product & Build Roadmap

An adaptive AI tutor that teaches any subject, from the first step to the deepest
level, as a gamified path. Placement first, then a learning-style profile, then a
level path with Master quizzes every 25 levels, Grand Master quizzes every 100,
and a Graduation exam that certifies a whole track.

This document is the plan of record: what gets built, in what order, what "done"
means at each stage, and what has to be true for the next stage to start. It runs
from the empty folder to the post-Series-A product.

---

## 0. Product definition

### The promise
One place to learn anything, where the system knows exactly what you know, what
you almost know, and how you personally learn — and re-plans every session
around that.

### Why it can win
Duolingo owns habit but only teaches language. Khan Academy owns breadth but the
path is static and identical for everyone. Human tutoring owns personalization
at $40–$80/hour. The wedge: **breadth plus real adaptivity at software margins.**

The defensible asset is not the model — it is the **learner model**: a per-user,
per-skill graph of mastery, error signatures, forgetting curves, and instruction
preferences that gets more valuable every session and cannot be copied or
exported.

### The four loops
1. **Placement loop** — an ascending-difficulty quiz (20–50 questions depending
   on target level) ending slightly above the level the user claimed, producing a
   level estimate plus a per-skill gap map.
2. **Session loop** — short lessons in a subject-appropriate format, then
   "Finish session", then AI analysis of what happened, then 2–4 retention
   questions that both consolidate memory and probe how the user learns.
3. **Checkpoint loop** — Master quiz every 25 levels, Grand Master every 100,
   Graduation exam at the end of a track (level 250 / 500 / 1000 by subject).
4. **Meta loop** — the accumulating learner model progressively takes control of
   pacing, format, difficulty, review timing, and explanation style.

### Non-negotiables
- Every question has a verifiable answer and a stored rationale. No unchecked
  model output is ever graded as truth.
- Every AI response is schema-validated before it reaches a learner.
- Every AI-dependent feature has a deterministic fallback, so the product never
  dies when the model API does.
- No emoji in the app's own chrome — icons come from an SVG sprite. Generated
  lesson pages are model-written and do use emoji in their controls, which is
  allowed; the sprite rule is about the surrounding product, not model output.

---

## 1. Architecture

### Stack (MVP)
| Layer | Choice | Why |
| --- | --- | --- |
| Server | Node 18+ / Express | Same house stack as the existing forum app; zero ramp-up |
| Client | Static HTML + vanilla JS modules | No build step; fastest path to a working site |
| Store | JSON document store behind a repository layer (`config/db.js`) | Zero setup now, one file to swap for Postgres in Phase 5 |
| Auth | `express-session` + bcrypt | Proven in-house |
| AI | Anthropic Messages API with strict JSON output | Best instruction-following for structured tutoring content |
| Hosting | Railway | Already understood, cheap, instant deploys |

### Swap points designed in from day one
- `config/db.js` is the only file that knows the storage engine → Postgres in Phase 5.
- `services/ai.js` is the only file that knows the model vendor → model routing in Phase 12.
- `config/curriculum.js` is data, not code → a content team edits it without a deploy in Phase 10.
- Every page is a thin client over `/api/*` → the mobile app in Phase 9 reuses the whole backend.

### Core data model
```
user             id, email, password_hash, display_name, created_at, flags
enrollment       id, user_id, track_id, target_level, current_level, xp, streak,
                 placed_at, status(active|paused|graduated)
skill_state      user_id, skill_id, mastery(0..1), attempts, correct, ease,
                 last_seen_at, next_due_at, error_tags[]
learner_profile  user_id, style_vector{}, pacing, preferred_formats[],
                 observed_traits[], evidence_count, updated_at
session          id, user_id, enrollment_id, level, kind(lesson|master|grand|
                 graduation|placement), started_at, ended_at, score, analysis{}, xp
item             id, session_id, skill_id, difficulty(1..10), format, prompt,
                 choices[], answer, rationale, user_answer, correct, ms, source(bank|ai)
attempt_event    user_id, item_id, ts, correct, latency_ms, hint_used, revisions
content_cache    key(skill+difficulty+format+profile bucket), payload, uses, created_at
```

### Mastery math (v1 — intentionally simple and inspectable)
- `mastery' = mastery + rate * (outcome - mastery)`, with `rate = 0.35` for the
  first three attempts on a skill and `0.15` after, so early evidence moves fast
  and later evidence is stable.
- Difficulty-weighted credit: a correct answer `d` bands above the current level
  counts `1 + 0.15d`; a miss `d` bands below costs `1 + 0.15d`.
- Level-up requires average mastery of the level's skills ≥ 0.80, no skill below
  0.60, and at least 12 answered items at that level.
- Review scheduling: SM-2-style intervals (1d, 3d, 7d, 16d, 35d …) scaled by
  `ease`, which each miss reduces by 0.15 and each clean streak raises by 0.05.
- Placement level = the highest level band where the running weighted score held
  ≥ 0.70 before two consecutive bands fell under 0.50.

### AI architecture
Four prompt roles, each with a strict output schema, a validator, and a fallback:
1. **Item writer** — generates items for (skill, difficulty, format, profile
   bucket). Cached and reused across users; regenerated only when the bucket
   differs, so one generation serves thousands of learners.
2. **Grader/explainer** — grades free responses, names the misconception using an
   error tag from a closed list, writes the correction.
3. **Session analyst** — reads the session event stream and returns what was
   learned, what is fragile, error tags, 2–4 retention questions, and proposed
   parameters for the next session.
4. **Path planner** — once `evidence_count ≥ 5` sessions, sets format mix,
   difficulty band, session length, and review load.

Cost control from day one: shared item cache, a small model for grading and
analysis, a large model only for authoring and planning, and a per-user daily
token ceiling.

---

## 2. Phases

Each phase lists its goal, what ships, and the exit gate. Durations assume one
developer working with AI assistance; double them for part-time work.

### Phase 1 — Barely working site (week 1)
**Goal:** a site you can sign up on that walks the whole flow with hand-written content.
- Express server, security headers, sessions, rate limits.
- Signup / login / logout.
- Curriculum data for five tracks — Mathematics, English, IQ Training, ACT Prep,
  Spanish — each with a limited grade list.
- Onboarding: pick tracks, pick a target level per track.
- Placement quiz driven entirely by the static bank, ascending difficulty, scored
  on the server.
- Dashboard listing enrollments and placed levels.
- Design system: tokens, components, SVG sprite.

**Exit gate:** one account can sign up, place into three tracks, and see results. No AI yet.

### Phase 2 — Working site (week 2–3)
**Goal:** the complete learning loop on deterministic content.
- Level path view: 250-level path per track with lesson / Master (every 25) /
  Grand Master (every 100) / Graduation nodes.
- Session player with item formats: multiple choice, type-in, ordering, cloze,
  matching, short answer, plus a per-subject format (translation for Spanish,
  passage sets for English and ACT, step entry for math, pattern matrices for IQ).
- XP, streaks, session summary, level-up.
- Learning-style quiz (24 items) writing the first `learner_profile`.
- Master / Grand Master / Graduation mechanics with pass thresholds and retry cooldowns.
- Spaced review queue mixed into every session.

**Exit gate:** a user can go from level 1 to level 26 through a Master quiz with
no human intervention, and mastery rises and decays correctly.

### Phase 3 — AI on the site (week 4–5)
**Goal:** the model becomes the primary content source and the analysis engine.
- `services/ai.js`: Anthropic client, strict schemas, validators, retries, cache,
  budget guard, full fallback to the bank.
- Item generation for every (skill, difficulty, format) triple.
- Free-response grading with error tags.
- Post-session analysis and retention questions written back into `skill_state`
  and `learner_profile`.
- Adaptive next-session planning after five sessions.
- Explain-this-answer and ask-the-tutor on any item.

**Exit gate:** with the API key removed the site still works end to end; with it
on, two users at the same level get measurably different sessions.

### Phase 4 — Halfway to MVP (week 6–8)
**Goal:** something a stranger would use twice.
- Content QA pipeline: every generated item auto-checked (answer verifiability,
  exactly one correct choice, no answer leakage, reading level) plus 5% human
  spot-check.
- Gamification depth: daily goal, streak freeze, certificates on Graduation — no
  dark patterns.
- Email review reminders timed to the forgetting curve.
- Account completeness: password reset, email verification, data export, delete.
- Admin: content review queue, user inspector, cost dashboard.
- Instrumentation: an event record for every answer, session, and drop-off.

**Exit gate:** 20 recruited testers, ≥ 40% day-2 return, ≥ 15% day-7, zero open
wrong-answer reports.

### Phase 5 — First MVP, public (week 9–12)
**Goal:** a launchable product with a business model.
- Postgres migration behind the same repository layer; daily backups.
- Stripe: free tier (1 track, 3 sessions/day); Pro at $14.99/mo or $99/yr
  (unlimited tracks and sessions, certificates).
- Legal: terms, privacy, COPPA-safe under-13 gate, WCAG 2.1 AA pass, explicit
  educational-use-only notice on any professional track.
- Performance: sub-1.5s first paint, sub-300ms item transitions, offline-tolerant
  session player.
- Landing page with real learner outcomes and SEO structure for the "learn X" long tail.

**Exit gate:** 500 signups, 100 weekly actives, ≥ 3% free-to-paid, ≤ $0.12 AI
cost per active learner per day, monthly churn under 12%.

### Phase 6 — First round of funding (month 4–5)
**Goal:** $750k–$1.5M pre-seed.
- Metrics pack: cohort retention curves, **learning-gain evidence** (pre/post
  placement delta against a static-path control group — the single most
  investable number available to you), CAC by channel, unit economics, cost curve
  per learner.
- Deck: problem, wedge, learner-model moat, gain data, retention, market, plan,
  team, ask, use of funds (content breadth, two engineers, one learning scientist).
- Data room: cap table, Delaware C-corp, IP assignment, model-cost model,
  security review.
- Targets: education-focused pre-seed funds and angels who operated at Duolingo,
  Khan, Coursera, or Quizlet. Roughly 60 warm intros → 30 first meetings → 2–4
  term sheets.

**Exit gate:** money in the bank, 18+ months runway, advisors in place.

### Phase 7 — Advertising and marketing (month 5–8)
**Goal:** repeatable acquisition with payback under six months.
- Organic core: one programmatic landing page per skill ("Learn Algebra 2 — free
  placement test"), free placement tests as the top-of-funnel hook, and a public
  "what level am I?" tool.
- Content: short-form video of the placement-to-mastery arc, a teacher and parent
  newsletter, subject-creator partnerships with revenue share.
- Paid: TikTok / Reels / YouTube tested at $150/day per channel, killing any
  creative over target CAC after three days; Google search on exam-prep intent,
  where intent is highest and CAC most predictable.
- School and tutor channel: free class dashboards — teachers are the lowest-CAC
  bulk-signup wedge in education.
- Referral: a free month of Pro on both sides.

**Exit gate:** blended CAC ≤ one-third of 12-month LTV, ≥ 35% of signups
organic, 5k weekly actives.

### Phase 8 — Site optimization (month 8–11)
**Goal:** raise learning gain and margin at the same time.
- Experiment infrastructure with sequential testing; every experiment scored on
  day-7 retention **and** measured learning gain, never on session count alone.
- Funnel targets: signup → placement completion ≥ 70%, placement → first session
  ≥ 85%, first session → day-2 return ≥ 50%.
- Model cost: route each role to the smallest model that holds quality, expand
  the cache, batch analysis; cut cost per active learner by ≥ 50%.
- Difficulty tuning from real item statistics (p-value and discrimination per
  item); retire items that do not discriminate.
- Accessibility, i18n scaffolding, complete keyboard path.

**Exit gate:** day-30 retention ≥ 25%, gross margin ≥ 75%, documented learning
gain ≥ 1.5x a static-path control.

### Phase 9 — Convert to an app (month 11–14)
**Goal:** iOS and Android, because habit products live on the home screen.
- Wrap the existing client with Capacitor first (weeks, not months, reusing every
  API), then move the session player to native views only where the wrapper
  measurably hurts.
- Native must-haves: push notifications driven by the review scheduler, offline
  session download and sync, a today's-goal widget, store IAP alongside Stripe.
- Store optimization: title, screenshots of the placement result, review prompt
  after the first Master quiz pass.

**Exit gate:** 4.5+ rating with 100+ reviews, mobile day-7 retention above web,
≥ 40% of sessions on mobile.

### Phase 10 — Topic expansion (month 12–20)
**Goal:** from five tracks to the full promise without breaking accuracy.
- Content pipeline: track blueprint → skill graph → level bands → item
  generation → automated checks → expert review → live. Every track ships with
  its own graduation standard.
- Expansion order by demand and safety: Sciences (Physics, Chemistry, Biology) →
  History and Geography → Test prep (SAT, GRE, MCAT, LSAT) → Finance and
  Economics → Philosophy and Logic → five more languages → Professional (Law,
  Medical, Dentistry, Anatomy, Nursing) → deep IQ and EQ tracks.
- High-stakes tracks (medical, dentistry, law) require a credentialed reviewer
  per track, a visible reviewer byline, and an explicit educational-use-only
  gate. This is a legal requirement, not a nice-to-have.
- Cross-track prerequisites, so Chemistry can require Algebra 1.

**Exit gate:** 30+ tracks live, every high-stakes track expert-reviewed, accuracy
complaints under 0.1% of items served.

### Phase 11 — Second round (month 18–24)
**Goal:** $8M–$20M Series A.
- What it takes: $3M+ ARR or a very steep curve, day-30 retention ≥ 30%, a
  published learning-gain study, two or more channels under target CAC, net
  revenue retention above 100% from track expansion.
- Use of funds: content at scale, a learning-science team, school and district
  sales, international.
- Optional: institutional licensing, which shifts the revenue mix from
  consumer churn to contract renewal.

**Exit gate:** term sheet signed, hires signed, 24+ months runway.

### Phase 12 — Final-state optimization (month 24+)
**Goal:** the compounding version of the product.
- Per-learner policy optimization: a bandit over instructional decisions
  (format, difficulty step, review timing, hint depth) trained on the full event
  history. The learner model stops being a heuristic and becomes a trained policy.
- Distilled or fine-tuned models for grading and analysis, cutting cost per
  learner by another order of magnitude.
- A full diagnostic graph: knowledge tracing across tracks, so a Spanish session
  can repair an English grammar gap.
- Credentials that count: proctored graduation exams, continuing-education
  partnerships, employer-verifiable certificates.
- Platform: authoring tools so outside experts can build tracks against the same
  pipeline, with revenue share.

**Exit gate:** the product plans a learner's month better than a human tutor
would, and margin improves as usage grows.

---

## 3. Risks and how each is handled
| Risk | Handling |
| --- | --- |
| The model states something false | Every item carries a verifiable answer and rationale; automated checks; expert review on high-stakes tracks; one-tap report that pulls an item from rotation immediately |
| AI cost per learner | Shared item cache, model routing per role, per-user daily ceilings, cost dashboard from Phase 4 |
| Breadth reads as shallow | Graduation exams and published rubrics per track; depth demonstrated, not claimed |
| Retention, education's hardest problem | Placement hook, short sessions, review timed to real forgetting curves, no dark patterns |
| An incumbent adds breadth | The learner model and event history are the moat, not the content |
| Minors and privacy | Under-13 gate, COPPA/FERPA posture before any school channel, export and delete from Phase 4 |
| Solo-founder capacity | Keep phases 1–5 narrow; hire content and learning science with the pre-seed, not before |

## 4. What is being built right now
Phase 1, in this repository. See `README.md` to run it and `config/curriculum.js`
for the five MVP tracks and their levels.
