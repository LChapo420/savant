# Beta load test: what breaks when real testers arrive

Worktree `beta-load`, Nov 2026. The owner's page is `docs/BETA-GO-NO-GO.md`. Raw reports: `docs/beta-load-results/`. Tools: `scripts/beta-load/` (`node scripts/beta-load/<tool>.js`; each file's header says how).

**Everything here was measured on the build PC, not the server.** 16 logical cores, Node 24, Windows, with other agents' jobs holding the PC's CPU at 100% for nearly all of it (each table gives "box CPU"). The app runs on one core, so what matters is that core's share and speed. Windows makes file status checks and environment reads slower than Linux, so a few hot spots here will be smaller on the server. The server's specs aren't in the notes and it was not touched.

**Models are stand-ins** (`stub-models.js`): an OpenAI-shaped local server answering with schema-shaped text after 1.5 to 4 s. The app's real pool, rate limits, hedging and ledgers ran on copies. Lessons written by the stand-in fail the app's own checks, so nothing here says how long a real level takes or how often a real model fails.

**Learners are scripted** (`learner.js`), through HTTP as the pages do: sign up, enrol, placement, dashboard, study session with heartbeats, lessons and games, tutor, uploads. The mix holds 15% at the tails (very fast, very slow, always wrong, quitting midway) and 10% child accounts. Think time is 8 s, so about 0.15 requests a second per learner, more than a person reading a page would send. "N online" means all N at once. With 30 minutes a day, N testers would rarely all be online.

## 1. Load

See the tables at the end of this page.

**Before the fixes, at 100 online** (`before-100`): 9 requests a second, p50 3.3 s, p95 39 s, 284 failed. The main thread was busy all the time. Top of the profile: saving the store 23%, a `stat` of `model-lineup.json` per slot, per waiting call, per queued job 13%, password hashing 12%, one learner's rows read by scanning everyone's 8%, reading and parsing 250 KB ledgers to ask "is there room?" 6%. 250 and 1000 were not run on the old code: 100 already saturated it.

**After** (`final-100`, `final-250`): 100 online: p50 0.15 s, p95 0.95 s, no errors. 250 online: p50 1.0 s, p95 2.6 s, no errors, main thread at its limit at 35 requests a second.

**What breaks first, and when (on this PC):**
| Order | What | When |
|---|---|---|
| 1 | Model capacity: NVIDIA's 36 calls a minute | 1 or 2 new learners a minute. Then foreground calls pay and background writes fail and retry 10 minutes later |
| 2 | First lessons queue | 100+ arriving in a minute: most levels were still being written when the page's 8 s ran out (`public/js/block-level.js`), which sends the learner to the plain standard session. Depends on real models; not proven either way. `INSTANT_LAYER=on` did not change this here: the copy has few shared levels for it to open on |
| 3 | The JSON store's save | Day 2 or 3 at 100 learners (about 60 MB: 2 to 3 s per save here). 180 MB: p95 11 s with 100 online; 428 MB: stops up to 9.5 s and 59% of the time saving |
| 4 | One core's CPU | About 35 requests a second, or about 250 online at 8 s think time |
| 5 | The 512 MB string limit | Day 20 at 100 learners, day 8 at 250, day 2 at 1000: JSON can't save or load at all |
| 6 | Memory | 1.2 GB at 428 MB of data, so about twice the data plus 0.3 GB; 100 learners for 30 days about 2 GB, 250 about 5 GB, 1000 about 15 to 20 GB. Everything is held in memory on SQLite too |
| 7 | Money | See section 4 |

**Size after 30 days.** Measured at about 250 KB per active learner-day (the owner's real account ran 83 KB a day over 10 days, and two heavy days ran 295 KB; 4 tailored plans of 16 KB a day are in the 250 KB). If every tester is active every day: 100 learners 0.75 GB, 250 learners 1.9 GB, 1000 learners 7.5 GB, plus 15 MB today. Cost tracker logs add 230 bytes a request.

**Save time as the store grows** (`save-bench.js`, this PC under load):
| Store | Read | Parse | Stringify | Write | fsync | Heap |
|---|---|---|---|---|---|---|
| 14 MB | 0.18 s | 0.21 s | 0.19 s | 0.11 s | 0.03 s | 98 MB |
| 174 MB | 10.6 s | 2.9 s | 3.2 s | 4.2 s | 0.06 s | 1.5 GB |
| 706 MB | fails: `ERR_STRING_TOO_LONG` | | | | | |

**JSON or SQLite, 30 learners online on a grown store** (`size-ladder.js`):
__LADDER__

## 2. Durability
__DURABILITY__

**Restore drill** (`restore-drill.js`, on a copy): backup, test the backup, wreck the live file (the app refuses to start on it), restore, boot, compare rows. 15 MB: 10 s in all. 174 MB: 35 s. Rows matched both times.

**Still open:** the server's daily backup is on the same disk (`onidel-server` note), so losing that disk loses the backups: copy them off. Nothing here cut the power: fsync before the rename is what protects against that, and it was added, but it wasn't tested.

## 3. Slow steps fixed
All keep behaviour the same; tests in `scripts/beta-load-fixes-test.js`, which is now a step of the suite.

| Step | Fix |
|---|---|
| Whole store written every 250 ms | One line instead of indented; the wait is 9x the last save's time, 250 ms to 5 s; 10 services stopped forcing saves on requests (`db.saveSoon`) |
| `stat` per slot per waiting call | Once per 5 s in production (`POOL_CONFIG_CHECK_MS`) |
| `globalCap()` per queued job in the write-ahead pump | Once per pump |
| Ledger read and parse on each "is there room?" | Reused until the file changes (`services/ledger-peek.js`). Reservations still read under the lock, so a stale peek can't pass a cap |
| Password hashing on the main thread | Two worker threads (`services/passwords.js`). Sign-up flood: longest stall 258 ms |
| "This learner's rows" scanning all rows | `db.forUser` index; 218 call sites changed by `codemod-for-user.js` (same rows, same order) |
| `db.byId` scanning | Binary search, with a scan on a miss |
| `typicalTimes` rebuilding over all items | Past 200,000 rows it rebuilds in slices and serves the last map meanwhile |
| Referral card and focus history reading all items and sessions | Their own rows only |
| SQLite re-serialising every row of a touched collection, keeping a text copy of each | Writes the rows changed, keeps a hash, sweeps in slices |

Left alone, since nothing stands out in the profile now: `services/scorecard` reads, `coverage.forEnrollment`, learner-path planning. Admin pages and the daily beta report still scan everything; that only costs when they run.

## 4. Money
`money.js`, `ledgers-now.js`, `reconcile.js`. Modelled from real cost per call in the ledgers, split by the app's real routing with stand-in models. Numbers on the owner's page. Day each runs out, build agents stopped, starting from today's PC ledgers (the server's own spend since Nov 4 isn't counted, so these are the long side):

| Learners | Scenario | $ a day | Gonka | Coral | Grokified | Munito | ZeroGPU |
|---|---|---|---|---|---|---|---|
| 100 | All extended, spread over the day | 0.89 | 197 | 277 | 288 | later | later |
| 100 | All extended, same hours | 7.13 | 25 | 35 | 37 | 74 | 78 |
| 100 | Nothing extended, same hours | 7.13 | stopped | 12 | stopped | 24 | stopped |
| 250 | All extended, spread | 2.23 | 79 | 111 | 116 | 233 | 247 |
| 250 | All extended, same hours | 17.81 | 10 | 14 | 15 | 30 | 32 |
| 250 | Nothing extended, same hours | 17.81 | stopped | 5 | stopped | 10 | stopped |
| 1000 | All extended, spread | 40.62 | 5 | 7 | 7 | 14 | 15 |
| 1000 | All extended, same hours | 71.25 | 3 | 4 | 4 | 8 | 9 |
| 1000 | Nothing extended, same hours | 71.25 | stopped | 2 | stopped | 4 | stopped |

The model hands each provider's share to the ones left when one runs out, as the pool would, and it treats ZeroGPU as able to pay for anything; in fact it only does fact checks, so writing stops at Munito's day. Anthropic's $23 pays for a stronger check on the next level until $0.50 is left, then the free check takes over: about 230 levels, so about a day at 100 learners. A level's real count of calls comes from the ledgers, mixed with build-pipeline use. Levels a day (5) and share active (70%) are guesses.

- **One tailored level costs about $0.021**: layout $0.0024, fills $0.0116, fact checks $0.0067, repairs $0.0004. A learner-day is about $0.13 if all of it is paid.
- **The caps:** `AI_DAILY_CENTS_PER_USER` 25 and `AI_DAILY_CALLS_PER_USER` 120. They see 94% of what ledgers paid at 100 online, and 50% at 250, where half of ledger spend was aborted calls counted at their worst-case reservation (`unknown` outcome). So ledgers can run out faster than the caps suggest, and real provider bills may be lower than the ledger says.
- **The call cap may bite.** The busiest scripted learner made 23 model calls in 5 minutes, which reaches 120 in about 26 minutes of a 30-minute day. A real rate isn't known. Past it the tutor falls to its canned reply and levels to shared ones. Worth raising to 300 if real data agrees (the 25 cents still holds).
- **Under load the free key gets about 20% of calls.** The rest go to paid slots.

**Learner sees** (`stops.js`, forced on a copy; adult unless said):
| Case | Tutor | Question coach | Lesson | Upload |
|---|---|---|---|---|
| Normal | Model, 0.8 s | Model | __NORMAL__ | |
| Every prepaid ledger at its stop | NVIDIA, 1.1 s; canned reply once its minute is used | NVIDIA | As normal | As normal |
| NVIDIA down | Paid slot, 1.2 s | Bank hint | Standard session | Still queued after 90 s |
| Every provider down | Canned reply, 0.4 s | Bank hint | Standard session, 0.9 s | __UPLOAD_DOWN__ |
| Every provider hangs | Canned reply after 34 s | Bank hint | "Still writing"; the page moves to the standard session after 8 s | Still queued |
| Nov 14 passed | NVIDIA | NVIDIA | As normal | Uses Munito, Coral |
| Nov 14 passed, NVIDIA, Munito, Coral off | Own notes, 0.2 s | Bank hint | Standard session | Can't be built |
| Daily cap reached | Canned reply | | Shared or standard | |
| Child with no parent's OK, any case | Own notes only | "Off until a parent allows it" (403) | Standard session | Not offered |

## 5. Abuse
`abuse.js`.
| Attack | Before | Now |
|---|---|---|
| A class of 30 on one address | 10 sign-ups an hour, 20 sign-ins per 15 minutes, and every other limit shared by the whole class | All 30 sign up and sign in 3 times; 240 tutor messages, 240 plans, 60 uploads without a 429. Limits count per account |
| Guessing one account's password | 20 tries per 15 minutes per address | 15 per 15 minutes per account, from any address |
| Sign-up flood | 40 from one address went through after raising the limit; 200 from 200 addresses in 15 s | Still open until `BETA_GATE=invite`. The gate is now mounted, off by default. Longest stall 258 ms |
| 25 MB file, 3.5 MB paste, 18 MB of text | 413, with a plain message | Same |
| Six 180 MB videos at once | All read into memory: 882 MB resident, past the kit's 800 MB service limit | At most 300 MB being read at once; the rest are told to try in a minute |
| Tutor spam: one learner, as fast as it can | 150 messages an hour, 120 model calls a day; past NVIDIA's minute a canned reply | __TUTORSPAM__ |
| One learner's cost | At most 25 cents a day as counted, see section 4 for what isn't counted | Same |

Not limited: the total spend per day across all learners. A ledger's cap is the only stop.

## 6. Account safety
`isolation.js`: 40 learners each with a marker in their name, notes and tutor messages, all working at once. Every reply is searched for anyone else's marker or email: __ISOLATION__. Each learner then asks for another's ids on 32 routes, reads and writes, plus 6 admin routes.

- **Found and fixed:** sign-ups racing for one email made 8 accounts. Hash first, then check and insert with nothing in between.
- **Found and fixed:** deleting an account left that learner's typed answers and per-block times on shared level rows. Both delete paths now clear them.
- **Found and fixed:** `/api/health` showed visitors each provider's spend and file paths. Now `{"ok":true}` unless an admin asks.
- **Closed before it opened:** sessions now outlive a crash, and a crash can lose the last seconds of the store, so a session's id could come to belong to a newer account. A session now carries its account's creation time, and a mismatch is signed out.
- **Worth knowing:** shared level rows hold every learner's answers, so they grow with learners and each opening reads them all. Small now, watch it at 1000.

## Tables
