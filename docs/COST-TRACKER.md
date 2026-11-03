# Cost and performance tracker

Built 2026-11-02 for the owner's goal: see what running Savant costs and how it performs, so pricing tiers, their limits and their
running costs can be set before the beta goes public. Code: `services/cost-tracker.js`, `routes/cost-tracker.js`,
`public/cost-tracker.html` + `public/js/cost-tracker.js`, `public/js/cost-beacon.js`, settings in `config/cost-tracker.json`.
Test: `node scripts/cost-tracker-test.js` (part of `npm test`).

**Where to look:** sign in as the admin and open `/cost-tracker` (`?days=1|7|30`, `?user=<id>` for one account). Everyone else gets a 404,
for the page and for `GET /api/admin/cost-tracker`. It is plain tables and works on a phone.

## What is measured

Events are written as one JSON line each to `data/cost-tracker/events-YYYY-MM-DD.jsonl` (next to the db file; `COST_TRACKER_DIR` moves it;
files older than 90 days are deleted at start). Nothing is written to `db.json`. `COST_TRACKER=off` stops all of it.

| Event | When | Fields (sizes, times and costs only) |
| --- | --- | --- |
| `ai` | after every model call in `services/ai.js` (success or failure) | user id, role, task, provider, model, tokens in/out, latency ms, ok, tries (1 = first provider, 2 = a retry on the next), hedged, actual USD, list USD, basis, foreground flag |
| `req` | end of every `/api` request | user id, method, route pattern, status, server ms, time to first write for streams (the tutor's `ttft`), subject (from lesson URLs), `lvl` ready/waited for a level GET |
| `lv` | the page, when a level's content is first shown | ms from click to content, whether the server first said "still writing", subject name |
| `srv` | every minute | process CPU %, RSS, heap, event-loop delay p99, db file size, load average |

Never logged: prompts, answers, typed text, upload contents, emails, titles.

## Definitions

- **Actual cost** = what was paid or metered. Taken from the provider's own cost for the call (`costCents`, the pool's ledger cost, or
  `usage.cost_usd`) when it is above zero (`basis: metered`). Free providers (NVIDIA, xKiro, UnoRouter, OpenRouter `:free`, Gemini free tier,
  local Ollama) are `$0` (`free`). Modelflare reports no cost per call, so its actual is the list price of its tokens (`estimated`, listed
  separately on the page). Calls that lose a hedge race or are aborted are not recorded (their tokens are unknown); a failed attempt in the
  plain chain is recorded as `ok:0` with no cost.
- **List cost** = the same tokens at what a paid route charges, for planning after the free tiers run out: a free-tier model is priced as
  DeepSeek V4.1 Flash, the cheap paid route already in the repo.
- **Task and feature** = the task name the call site gives (`config/model-lineup.json` tasks) grouped into: lesson write, fact check (free) vs
  (Sonnet), tutor, judge / grading, upload / my material, placement, session analysis. Lesson write is split into *on demand* and *write-ahead /
  background*.
- **Foreground / background** = a call is foreground if it finished while the request that started it was still open (the learner was
  waiting). Anything that outlives its request (write-ahead, scripts, background reads) is background. It is approximate: a fast write-ahead call
  that finishes before the request that kicked it off counts as foreground.
- **Session** = one learner's `/api` requests with no gap of 20 minutes or more (`session_gap_min`). **Active minutes** = the sum of the
  gaps between requests, each gap counted up to 5 minutes (`idle_cap_min`), so reading a page counts but walking away does not.
  **Levels done** = successful `finish`, `block-finish`, `game-finish` posts. **Uploads** = successful posts to `/api/materials` (file, paste,
  link, youtube, video, audio, transcript). **Subjects** = the subject ids in the lesson URLs. **Session cost** = that user's AI calls from the
  session start to 5 minutes after its last request; **per active hour** = that over active hours.
- **User-day** = one learner's sessions and all of their AI calls that UTC day. All times are UTC.
- **Level open** = (a) *page*: from the learner's last click (or the page load, when the page was opened by a link) to the second animation frame
  after the level's data arrived (`public/js/cost-beacon.js`); (b) *server*: the level GET's own time. **Came ready / waited**: the server
  answered the first ask with the level, in under 1.5 s (`wait_ms`), vs. answered "still writing" (202) or took longer. This is the "came from
  write-ahead" flag. It reads the level route's status and time from outside; no write-ahead, block-level or details file was touched.
- **Tutor time to first token** = server time from the request to the first write of a streamed (`text/event-stream`) reply. Replies that are
  not streamed show up as ordinary route times.
- **Route times** = p50 / p95 of server ms per method and route pattern; the page lists the 15 slowest by p95.
- **Server** = the snapshots above. The monthly fixed cost (VM, domain, other) is in `config/cost-tracker.json` `fixed_monthly_usd`, or
  `COST_FIXED_MONTHLY_USD` for one total. It is **not set yet**: the fixed share reads $0 until it is.

## Tier projection

From the user-days with at least 5 active minutes (`projection_min_active_min`): cost per active hour at p50 and p95, for list and for
actual. Cost per user-month at 30 min, 1 h and 2 h a day = cost per active hour x hours x 30 days. Then the fixed monthly cost divided by
10 / 100 / 1,000 users is added to show a total per user-month. With only one learner's days, p50 and p95 sit close together: they spread out as
more accounts study. The owner's own study account (landon@savantedu.com, id 6689) is the first real data; open `?user=6689`.

## Under-13 accounts

An under-13 account (`age_check.under_13`) is logged with no user id, so it has no session, no user-day and no row on the users table. It adds
to the totals, the feature, model and route tables and the level-open numbers only. Nothing new is kept per child. The log holds user ids for
everyone else, so the data export and deletion that go live before investors must include `data/cost-tracker/` (or drop old files).

## List prices and where they come from

| Model | USD per Mtok in / out | Source |
| --- | --- | --- |
| Claude (Fable, Opus, Sonnet, Haiku) | as in the table | `services/anthropic-ledger.js` `PRICES`, "Anthropic first-party list prices, 2026-10" |
| Standard Compute models | as in the table | `services/standard-compute-ledger.js` `PRICES` (list-price upper bounds, owner 2026-11-01) |
| Free-tier models (NVIDIA, xKiro, UnoRouter, OpenRouter `:free`, Gemini free, Ollama) | 0.30 / 1.20 | DeepSeek V4.1 Flash on Standard Compute, same file; `config/cost-tracker.json` `free_equivalent` (2026-11-02) |
| Modelflare `gpt-6.1-sol` | 1.00 / 4.00 | **Assumption** (2026-11-02): the repo has no published price. Confirm against Modelflare's price page and edit `config/cost-tracker.json` |

Edit `config/cost-tracker.json` `models` to add or correct a price; anything unknown falls back to the free-tier equivalent.

## Cost of the tracker

Measured by the test: about 25 microseconds added per request (0.025 ms) in a tight loop, about 0.3 ms or less end to end on a real server (inside
the noise). Events go to an in-memory buffer and are appended to disk asynchronously, every 2 s or 500 events, off the request path.

## Not covered yet

- Voice (TTS/STT) and upload extraction that do not go through `services/ai.js` are timed as routes but have no token cost.
- Hedged calls that lose the race are not costed.
- Learner-side time on screen with no requests longer than 5 minutes is not counted as active.
