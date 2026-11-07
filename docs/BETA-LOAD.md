# Beta load test: what breaks when real testers arrive

Worktree `beta-load`, Nov 2026. The owner's page is `docs/BETA-GO-NO-GO.md`. Raw reports: `docs/beta-load-results/`. Tools: `scripts/beta-load/` (`node scripts/beta-load/<tool>.js`; each file's header says how).

**Everything here was measured on the build PC, not the server.** Ryzen 9 6900HS, 16 logical cores, Node 24, Windows. Most runs had other agents' jobs holding the PC's CPU at 100% ("busy PC" runs); the "quiet" runs came later, with it at 20 to 30% (each table gives "box CPU"). The app runs on one core, so what matters is that core's share and speed. Windows makes file status checks and environment reads slower than Linux, so a few hot spots here will be smaller on the server. The server's specs aren't in the notes and it was not touched. A rented core is often 1.5 to 3 times slower than this one: not measured, so read capacity numbers with that in mind.

**These runs may have contributed to the 6 Nov freeze.** The 1000-learner runs were among the heavy work on the PC that evening, and one watchdog test briefly used 16 GB through a bug of mine (fixed the same hour). They ran above normal priority until the crash; they no longer do, and from then on heavy runs went one at a time.

**Models are stand-ins** (`stub-models.js`): an OpenAI-shaped local server answering with schema-shaped text after 1.5 to 4 s. The app's real pool, rate limits, hedging and ledgers ran on copies. Lessons written by the stand-in fail the app's own checks, so nothing here says how long a real level takes or how often a real model fails.

**Learners are scripted** (`learner.js`), through HTTP as the pages do: sign up, enrol, placement, dashboard, study session with heartbeats, lessons and games, tutor, uploads. The mix holds 15% at the tails (very fast, very slow, always wrong, quitting midway) and 10% child accounts. Think time is 8 s, so about 0.15 requests a second per learner, more than a person reading a page would send. "N online" means all N at once. With 30 minutes a day, N testers would rarely all be online.

## 1. Load

See the tables at the end of this page.

**Before the fixes, at 100 online** (`before-100`): 9 requests a second, p50 3.3 s, p95 39 s, 284 failed. The main thread was busy all the time. Top of the profile: saving the store 23%, a `stat` of `model-lineup.json` per slot, per waiting call, per queued job 13%, password hashing 12%, one learner's rows read by scanning everyone's 8%, reading and parsing 250 KB ledgers to ask "is there room?" 6%. 250 and 1000 were not run on the old code: 100 already saturated it.

**After** (requests other than the planned lesson wait):
| Online | PC | p50 | p95 | p99 | Errors | App busy |
|---|---|---|---|---|---|---|
| 100 | quiet | 23 ms | 110 ms | 2.2 s | 0 | 31% |
| 250 | quiet | 39 ms | 242 ms | 7.9 s | 0 | 53% |
| 100 | busy | 145 ms | 953 ms | 2.9 s | 0 | 56% |
| 250 | busy | 1.0 s | 2.6 s | 4.2 s | 0 | 92% |
| 1000 | busy | 5.1 s | 19 s | 41 s | 28% dropped | 100% |
| 1000 arriving over 5 min, think time 30 s | busy | 3.3 s | 12 s | 30 s | 3% dropped | 100% |

CPU per request is the number to carry to the server: 17 to 19 ms when quiet, so about 50 to 60 requests a second on this core. A scripted learner sends about 0.15 to 0.18 a second, a real person probably less. So on this core about 300 online at most; on a core 2 times slower about 150. 1000 testers at 30 minutes a day would peak at perhaps 100 to 250 online: not measured, and the store and the money stop them first. Part of the 1000-learner drops may be the test client itself on the same PC.

**What breaks first, and when (on this PC):**
| Order | What | When |
|---|---|---|
| 1 | Model capacity: NVIDIA's 36 calls a minute | 1 or 2 new learners a minute. Then foreground calls pay and background writes fail and retry 10 minutes later |
| 2 | First lessons queue | 100+ arriving in a minute: most levels were still being written when the page's 8 s ran out (`public/js/block-level.js`), which sends the learner to the plain standard session. Depends on real models; not proven either way. `INSTANT_LAYER=on` did not change this here: the copy has few shared levels for it to open on |
| 3 | The JSON store's save | Day 2 or 3 at 100 learners (about 60 MB). 174 MB: 23 stalls over 1 s in 3 minutes on a quiet PC; 428 MB: stops up to 9.5 s, 59% of the time saving (busy PC) |
| 4 | One core's CPU | About 35 requests a second with the PC busy, 50 to 60 quiet |
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
| Store (as if) | Driver | PC | Boot | Memory | Longest stall | Stalls over 1 s | Saving | p50 / p95 |
|---|---|---|---|---|---|---|---|---|
| 174 MB (100 learners, 7 days) | JSON | quiet | 3 s | 1529 MB | 2.2 s | 23 in 167 s | 17% | 35 ms / 1.5 s |
| 174 MB | SQLite | quiet | 7 s | 780 MB | 0.3 s | 0 in 126 s | 0% | 45 ms / 1.4 s |
| 428 MB (100 learners, 18 days) | JSON | busy | 13 s | 1107 MB | 9.5 s | 18 in 239 s | 59% | 2.0 s / 9.1 s |
| 428 MB | SQLite | busy | 42 s | 1230 MB | 0.9 s | 0 in 126 s | 0% | 150 ms / 2.2 s |
| 706 MB (100 learners, 30 days) | JSON | | won't start | | | | | |
| 706 MB | SQLite | | can't be moved from a JSON file this size; a store on SQLite from the start doesn't hit this | | | | | |

Moving the data took 33 s at 174 MB and 157 s at 428 MB. The grown stores are clones of scripted learners, not real data.

## 2. Durability
`durability.js`, on copies, with learners answering. "Lost" counts answers the server had said were saved. This PC's real disk was not filled: the disk-full rounds fail writes in the store's path with ENOSPC after half the bytes.

| Test | Result |
|---|---|
| Killed at a random moment, 15 MB, 6 rounds | File sound every time. Lost at most 40 answers, the oldest 2.4 s old |
| Killed with the temp file half written, 3 rounds | **The half-written file never became the live one.** Lost up to 60 answers, 3.2 s |
| Killed before the rename, 2 rounds | Same: 2.9 s |
| Killed at random, 174 MB, 3 rounds | Sound. Lost up to 8.4 s: the wait grows with the save |
| Killed, SQLite, 4 rounds | Sound. Lost at most 20 answers, 0.3 s |
| Disk full, then clears | The app stays up, keeps answering, retries; the live file stays good; all saved when it clears. Nothing lost |
| Disk full, then killed | **Everything since the last good save goes** (80 answers, 10 s in a short test; no limit in a long one). `/api/health` now answers 503 after 30 s of failed saves, so an uptime check can catch it |
| Live file cut short, then a start | Old code: moved it aside and **started empty**. Now, in production: refuses to start, leaves the file alone, says how to restore (`DB_ALLOW_FRESH=1` for the old way) |
| Sign-in after a crash | Old code: everyone signed out at every restart (sessions in memory). Now on disk: still signed in. If the crash lost the account itself, the session is signed out, never handed to whoever gets that id next |

No ids repeated and no counters behind in any round.

**The 6 Nov power-off on this PC.** A hard restart left five ledgers, git indexes and other recent files as zero bytes. No writer flushed to disk before renaming, so "temp file then rename" protected against a crash of the program but not of the machine. Now: `services/durable-file.js` flushes the temp file before the rename and the folder after it (Linux), for the JSON store, every ledger and the invite list. The SQLite store runs `synchronous=FULL`. Cost on this PC: 1.8 ms instead of 1.0 ms for a 250 KB ledger write, so nothing to notice at 10 writes a second; a slower server disk will cost more. The order is tested; a real power cut was not repeated.

**Ledgers now have copies**, which they did not: every 10 minutes in `ledger-backups/` beside them, the last 12 plus one a day for 14 days, on the same disk (the nightly backup also takes them if `BACKUP_EXTRA` is left at its default: copy that off the box). A zero-byte or unreadable ledger still refuses every call, as it should. `node scripts/ledger-restore.js --dir data` says which are damaged, and `--write` puts back the newest good copy and adds an estimate of what was spent since, from the copy's last hour, so it errs toward stopping early.

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
| 100 | All extended, spread over the day | 0.90 | 151 | 229 | 272 | later | later |
| 100 | All extended, same hours | 7.19 | 19 | 29 | 35 | 69 | 72 |
| 100 | Nothing extended, same hours | 7.19 | stopped | 10 | stopped | 22 | stopped |
| 250 | All extended, spread | 2.25 | 61 | 92 | 109 | 217 | 228 |
| 250 | All extended, same hours | 17.97 | 8 | 12 | 14 | 28 | 29 |
| 250 | Nothing extended, same hours | 17.97 | stopped | 4 | stopped | 9 | stopped |
| 1000 | All extended, spread | 40.77 | 4 | 6 | 7 | 13 | 14 |
| 1000 | All extended, same hours | 71.87 | 2 | 3 | 4 | 8 | 8 |
| 1000 | Nothing extended, same hours | 71.87 | stopped | 1 | stopped | 3 | stopped |

The model hands each provider's share to the ones left when one runs out, as the pool would, and it treats ZeroGPU as able to pay for anything; in fact it only does fact checks, so writing stops at Munito's day. Anthropic's $23 pays for a stronger check on the next level until $0.50 is left, then the free check takes over: about 230 levels, so about a day at 100 learners. Five ledgers were rebuilt from estimates after the crash, so balances are approximate; the per-task costs are from before it. A level's real count of calls comes from the ledgers, mixed with build-pipeline use. Levels a day (5) and share active (70%) are guesses.

- **One tailored level costs about $0.021**: layout $0.0024, fills $0.0116, fact checks $0.0067, repairs $0.0004. A learner-day is about $0.13 if all of it is paid.
- **The caps:** `AI_DAILY_CENTS_PER_USER` 25 and `AI_DAILY_CALLS_PER_USER` 120. They see 94% of what ledgers paid at 100 online, and 50% at 250, where half of ledger spend was aborted calls counted at their worst-case reservation (`unknown` outcome). So ledgers can run out faster than the caps suggest, and real provider bills may be lower than the ledger says.
- **The call cap may bite.** The busiest scripted learner made 23 model calls in 5 minutes, which reaches 120 in about 26 minutes of a 30-minute day. A real rate isn't known. Past it the tutor falls to its canned reply and levels to shared ones. Worth raising to 300 if real data agrees (the 25 cents still holds).
- **Under load the free key gets about 20% of calls.** The rest go to paid slots.

**Learner sees** (`stops.js`, forced on a copy; adult unless said):
| Case | Tutor | Question coach | Lesson | Upload |
|---|---|---|---|---|
| Normal | Model, 0.8 s | Model | Bank session or tailored, as written | |
| Every prepaid ledger at its stop | NVIDIA, 1.1 s; canned reply once its minute is used | NVIDIA | As normal | As normal |
| NVIDIA down | Paid slot, 1.2 s | Bank hint | Standard session | Still queued after 90 s |
| Every provider down | Canned reply, 0.4 s | Bank hint | Standard session, 0.9 s | Says the builder isn't available and the material is saved (it said nothing before; checked in a browser at phone width) |
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
| Tutor spam: one learner, as fast as it can | 150 messages an hour, 120 model calls a day; past NVIDIA's minute a canned reply | 150 messages an hour; a learner past NVIDIA's minute now gets Coral (the fix in `services/pool.js`): 84 model replies, 66 canned, 60 paid calls, 2.2 cents as stubbed. Bounded by 120 calls and 25 cents a day |
| One learner's cost | At most 25 cents a day as counted, see section 4 for what isn't counted | Same |

Not limited: the total spend per day across all learners. A ledger's cap is the only stop.

## 6. Account safety
`isolation.js`: 40 learners each with a marker in their name, notes and tutor messages, all working at once. Every reply is searched for anyone else's marker or email: no one else's data in 11,080 replies with 40 learners on JSON, and none in 5,540 with 20 learners on each of JSON and SQLite after the fixes. No other learner's id answered 2xx, no admin route answered a learner, a deleted account's cookie gets nobody, and new accounts never take a deleted id. Each learner then asks for another's ids on 32 routes, reads and writes, plus 6 admin routes.

- **Found and fixed:** sign-ups racing for one email made 8 accounts. Hash first, then check and insert with nothing in between.
- **Found and fixed:** deleting an account left that learner's typed answers and per-block times on shared level rows. Both delete paths now clear them.
- **Found and fixed:** `/api/health` showed visitors each provider's spend and file paths. Now `{"ok":true}` unless an admin asks.
- **Closed before it opened:** sessions now outlive a crash, and a crash can lose the last seconds of the store, so a session's id could come to belong to a newer account. A session now carries its account's creation time, and a mismatch is signed out.
- **Worth knowing:** shared level rows hold every learner's answers, so they grow with learners and each opening reads them all. Small now, watch it at 1000.

## Tables
All measured on this PC. `before-100` is today's code; `quiet` and `final` are this branch on a quiet and a busy PC; `grown-174mb-100` is before SQLite, on a store as if 7 days old. p50, p95 and p99 are in ms and include the planned lesson wait unless the column says otherwise.

| Run | Requests/s | p50 ms | p95 ms | p99 ms | Without the lesson wait: p50 / p95 / p99 ms | 5xx or dropped | Loop stalls over 1 s | Longest stall ms | Server CPU s / wall s | ms CPU per request | Save share of time | Peak memory MB | Store MB at end | Box CPU |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before-100 | 9 | 3290 | 39417 | 150142 | n/a | 284 | 10 | 3081 | 385 / 387 | 110 | 0.48 | 652 | 21 | 1 |
| quiet-100 | 18.1 | 32 | 11893 | 91635 | 23 / 110 / 2239 | 0 | 1 | 4496 | 123 / 348 | 19 | 0.081 | 694 | 19 | 0.214 |
| quiet-250 | 36.1 | 61 | 10623 | 94446 | 39 / 242 / 7910 | 0 | 0 | 913 | 274 / 455 | 17 | 0.087 | 727 | 31 | 0.285 |
| final-100 | 16.6 | 313 | 9302 | 89335 | 145 / 953 / 2927 | 0 | 3 | 2045 | 282 / 454 | 37 | 0.085 | 695 | 15 | 1 |
| final-250 | 35 | 1385 | 11357 | 99389 | 1017 / 2555 / 4240 | 0 | 26 | 1720 | 433 / 497 | 25 | 0.082 | 836 | 22 | 1 |
| final-1000 | 73.3 | 5333 | 32558 | 60913 | 5063 / 19224 / 40839 | 10648 | 43 | 2347 | 536 / 523 | 14 | 0.08 | 844 | 27 | 1 |
| final-1000-slow | 64.2 | 3775 | 15977 | 107986 | 3287 / 12079 / 30222 | 820 | 49 | 2189 | 567 / 480 | 18 | 0.082 | 734 | 37 | 0.986 |
| grown-174mb-100 | 10 | 4754 | 20145 | 125229 | 2027 / 10623 / 13468 | 38 | 31 | 6111 | 263 / 316 | 82 | 0.415 | 1225 | 178 | 1 |

**before-100**

| Route | n | p50 | p95 | p99 | max | Statuses |
|---|---|---|---|---|---|---|
| POST /api/placement/answer | 537 | 5284 | 31576 | 42893 | 43543 | 200: 479, -1: 58 |
| GET /api/lessons/:t/:g/:l | 310 | 28767 | 49784 | 57390 | 62157 | 200: 15, 202: 255, -1: 40 |
| GET /api/placement/paths | 182 | 2724 | 32232 | 42903 | 43546 | 200: 175, -1: 7 |
| GET /api/materials/review-due | 182 | 2724 | 32232 | 42903 | 43546 | 200: 174, -1: 8 |
| GET /api/retention/state | 182 | 2724 | 32232 | 42904 | 43546 | 200: 174, -1: 8 |
| GET /api/tutor/dock | 182 | 2724 | 32232 | 43547 | 47700 | 200: 176, -1: 6 |
| GET /api/plan/today | 182 | 2710 | 32140 | 42903 | 43440 | 200: 175, -1: 7 |
| GET /api/progress | 182 | 2710 | 32060 | 42903 | 43440 | 200: 174, -1: 8 |
| GET /api/catalog | 125 | 1202 | 3137 | 9604 | 10654 | 200: 123, -1: 2 |
| POST /api/auth/register | 100 | 9242 | 14204 | 18616 | 18616 | 201: 100 |
| GET / (page) | 100 | 4655 | 12892 | 14106 | 14106 | 200: 99, -1: 1 |
| POST /api/enrollments | 100 | 2393 | 9136 | 17705 | 17705 | 201: 97, -1: 3 |

**quiet-100**

| Route | n | p50 | p95 | p99 | max | Statuses |
|---|---|---|---|---|---|---|
| GET /api/lessons/:t/:g/:l | 1445 | 8037 | 12494 | 15476 | 16115 | 200: 26, 202: 1419 |
| POST /api/placement/answer | 560 | 15 | 42 | 140 | 211 | 200: 560 |
| GET /api/tutor/dock | 321 | 29 | 96 | 148 | 170 | 200: 321 |
| GET /api/retention/state | 321 | 28 | 93 | 146 | 165 | 200: 321 |
| GET /api/materials/review-due | 321 | 26 | 90 | 145 | 162 | 200: 321 |
| GET /api/placement/paths | 321 | 26 | 89 | 144 | 162 | 200: 321 |
| GET /api/plan/today | 321 | 24 | 87 | 144 | 161 | 200: 321 |
| GET /api/progress | 321 | 18 | 84 | 136 | 159 | 200: 321 |
| POST /api/sessions | 221 | 24 | 116 | 185 | 228 | 200: 220, 409: 1 |
| GET /api/review/:id | 221 | 40 | 99 | 176 | 193 | 200: 221 |
| GET /api/placement/path/:id | 221 | 36 | 95 | 172 | 189 | 200: 221 |
| GET /api/path/:id | 221 | 35 | 86 | 171 | 188 | 200: 221 |

**quiet-250**

| Route | n | p50 | p95 | p99 | max | Statuses |
|---|---|---|---|---|---|---|
| GET /api/lessons/:t/:g/:l | 3143 | 8121 | 15184 | 17786 | 24995 | 200: 33, 202: 3110 |
| POST /api/placement/answer | 1402 | 32 | 185 | 271 | 416 | 200: 1402 |
| POST /api/sessions/:id/answer | 960 | 21 | 259 | 8057 | 9977 | 200: 960 |
| GET /api/tutor/dock | 775 | 50 | 225 | 6719 | 9934 | 200: 775 |
| GET /api/retention/state | 775 | 49 | 224 | 6719 | 9934 | 200: 775 |
| GET /api/materials/review-due | 775 | 46 | 223 | 6717 | 9932 | 200: 775 |
| GET /api/placement/paths | 775 | 46 | 222 | 6717 | 9931 | 200: 775 |
| GET /api/plan/today | 775 | 44 | 220 | 6715 | 9931 | 200: 775 |
| GET /api/progress | 775 | 36 | 213 | 6702 | 9921 | 200: 775 |
| GET /api/review/:id | 525 | 54 | 276 | 8533 | 10370 | 200: 525 |
| GET /api/path/:id | 525 | 49 | 271 | 8529 | 10366 | 200: 525 |
| GET /api/placement/path/:id | 525 | 50 | 271 | 8529 | 10366 | 200: 525 |

**final-100**

| Route | n | p50 | p95 | p99 | max | Statuses |
|---|---|---|---|---|---|---|
| GET /api/lessons/:t/:g/:l | 1954 | 8135 | 9097 | 14764 | 16226 | 200: 1, 202: 1953 |
| POST /api/placement/answer | 560 | 237 | 859 | 1347 | 1567 | 200: 560 |
| GET /api/tutor/dock | 381 | 147 | 831 | 1301 | 1486 | 200: 381 |
| GET /api/retention/state | 381 | 145 | 830 | 1299 | 1484 | 200: 381 |
| GET /api/materials/review-due | 381 | 138 | 826 | 1294 | 1480 | 200: 381 |
| GET /api/placement/paths | 381 | 136 | 786 | 1291 | 1478 | 200: 381 |
| GET /api/plan/today | 381 | 131 | 764 | 1290 | 1476 | 200: 381 |
| GET /api/progress | 381 | 111 | 735 | 1015 | 1451 | 200: 381 |
| GET /api/review/:id | 281 | 147 | 777 | 1201 | 1503 | 200: 281 |
| GET /api/placement/path/:id | 281 | 136 | 765 | 1150 | 1495 | 200: 281 |
| GET /api/path/:id | 281 | 125 | 737 | 1149 | 1494 | 200: 281 |
| POST /api/sessions | 281 | 83 | 614 | 1475 | 1509 | 200: 280, 409: 1 |

**final-250**

| Route | n | p50 | p95 | p99 | max | Statuses |
|---|---|---|---|---|---|---|
| GET /api/lessons/:t/:g/:l | 3559 | 9396 | 11617 | 13160 | 19134 | 200: 1, 202: 3558 |
| POST /api/placement/answer | 1402 | 1278 | 2599 | 2798 | 3937 | 200: 1402 |
| POST /api/sessions/:id/answer | 960 | 236 | 2099 | 2639 | 4229 | 200: 960 |
| GET /api/tutor/dock | 822 | 1147 | 2373 | 3198 | 4147 | 200: 822 |
| GET /api/retention/state | 822 | 1139 | 2340 | 2783 | 4147 | 200: 822 |
| GET /api/materials/review-due | 822 | 1125 | 2332 | 2780 | 4134 | 200: 822 |
| GET /api/placement/paths | 822 | 1124 | 2307 | 2765 | 4132 | 200: 822 |
| GET /api/plan/today | 822 | 1115 | 2297 | 2742 | 4804 | 200: 822 |
| GET /api/progress | 822 | 1089 | 2239 | 2691 | 4778 | 200: 822 |
| GET /api/review/:id | 572 | 1152 | 2541 | 2830 | 3466 | 200: 572 |
| POST /api/sessions | 572 | 1076 | 2502 | 3175 | 4784 | 200: 509, 201: 60, 409: 3 |
| GET /api/placement/path/:id | 572 | 1136 | 2491 | 2821 | 3457 | 200: 572 |

**final-1000**

| Route | n | p50 | p95 | p99 | max | Statuses |
|---|---|---|---|---|---|---|
| GET /api/lessons/:t/:g/:l | 3173 | 11167 | 15924 | 45963 | 54761 | 202: 2759, -1: 414 |
| POST /api/placement/answer | 2497 | 5327 | 6734 | 38872 | 43327 | 200: 1985, -1: 512 |
| GET /api/tutor/dock | 2435 | 4549 | 35704 | 40967 | 45041 | 200: 1414, -1: 1021 |
| GET /api/retention/state | 2435 | 4879 | 35167 | 40952 | 44334 | 200: 1480, -1: 955 |
| GET /api/materials/review-due | 2435 | 5065 | 34722 | 40835 | 44356 | 200: 1558, -1: 877 |
| GET /api/placement/paths | 2435 | 5212 | 26640 | 40350 | 44329 | 200: 1615, -1: 820 |
| GET /api/plan/today | 2435 | 5313 | 7914 | 40177 | 44327 | 200: 1684, -1: 751 |
| GET /api/progress | 2435 | 5434 | 6803 | 39141 | 44309 | 200: 1843, -1: 592 |
| GET /api/review/:id | 1767 | 5555 | 35234 | 41145 | 43166 | 200: 1219, -1: 548 |
| GET /api/placement/path/:id | 1767 | 5591 | 28910 | 40837 | 43202 | 200: 1270, -1: 497 |
| GET /api/path/:id | 1767 | 5646 | 6874 | 39964 | 44225 | 200: 1368, -1: 399 |
| POST /api/sessions | 1767 | 5624 | 6822 | 39121 | 43083 | 200: 704, 201: 45, 409: 610, -1: 408 |

**final-1000-slow**

| Route | n | p50 | p95 | p99 | max | Statuses |
|---|---|---|---|---|---|---|
| POST /api/placement/answer | 5392 | 2248 | 5746 | 8863 | 36145 | 200: 5332, -1: 60 |
| GET /api/lessons/:t/:g/:l | 2727 | 13092 | 21134 | 39977 | 44273 | 202: 2660, -1: 67 |
| GET /api/tutor/dock | 1464 | 2890 | 18967 | 32708 | 35782 | 200: 1404, -1: 60 |
| GET /api/retention/state | 1464 | 2889 | 17798 | 32480 | 35781 | 200: 1400, -1: 64 |
| GET /api/materials/review-due | 1464 | 3090 | 14216 | 32034 | 35460 | 200: 1406, -1: 58 |
| GET /api/placement/paths | 1464 | 3089 | 13960 | 32134 | 35774 | 200: 1412, -1: 52 |
| GET /api/plan/today | 1464 | 3091 | 13049 | 31432 | 35773 | 200: 1417, -1: 47 |
| GET /api/progress | 1464 | 3125 | 6248 | 23780 | 35779 | 200: 1428, -1: 36 |
| GET /api/catalog | 1244 | 2797 | 6410 | 32848 | 36039 | 200: 1215, -1: 29 |
| GET / (page) | 1000 | 6891 | 21876 | 39402 | 48729 | 200: 976, -1: 24 |
| POST /api/auth/register | 1000 | 4590 | 11696 | 12520 | 26687 | 201: 972, 400: 1, -1: 27 |
| POST /api/consent/age | 1000 | 2784 | 6313 | 22938 | 35576 | 200: 981, -1: 19 |

**grown-174mb-100**

| Route | n | p50 | p95 | p99 | max | Statuses |
|---|---|---|---|---|---|---|
| GET /api/lessons/:t/:g/:l | 1027 | 12737 | 16425 | 18127 | 27748 | 202: 1015, -1: 12 |
| GET /api/tutor/dock | 160 | 1399 | 10763 | 12502 | 12505 | 200: 160 |
| GET /api/retention/state | 160 | 1443 | 10705 | 12500 | 12503 | 200: 160 |
| GET /api/materials/review-due | 160 | 1386 | 10699 | 12495 | 12497 | 200: 160 |
| GET /api/placement/paths | 160 | 1382 | 10656 | 12494 | 12496 | 200: 160 |
| GET /api/plan/today | 160 | 1379 | 9900 | 12433 | 12494 | 200: 160 |
| GET /api/progress | 160 | 1201 | 9734 | 12392 | 12450 | 200: 160 |
| GET /api/review/:id | 160 | 3618 | 7014 | 10596 | 11745 | 200: 157, -1: 3 |
| GET /api/placement/path/:id | 160 | 3593 | 6994 | 10582 | 11724 | 200: 157, -1: 3 |
| GET /api/path/:id | 160 | 3520 | 6913 | 7689 | 11722 | 200: 157, -1: 3 |
| POST /api/sessions | 160 | 3226 | 6269 | 11354 | 11683 | 200: 155, -1: 5 |
| (wait) lesson ready | 155 | 116353 | 130539 | 133972 | 136334 | 202: 143, -1: 12 |
