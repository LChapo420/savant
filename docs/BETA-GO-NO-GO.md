# Beta go or no-go: 100, 250, 1000 learners

Measured on the build PC, not the server, 6 Nov 2026, with scripted learners and stand-in models. No real learner and no real model were in these tests. The PC's CPU was at 100% from other work throughout, so times are pessimistic; the server's speed is unknown (the memory note does not list its specs). Detail: `docs/BETA-LOAD.md`.

| Learners | Verdict | Why |
|---|---|---|
| **100** | **Go**, once steps 1 to 5 are deployed | All 100 online at once: no errors, half of requests in 0.15 s, 95% under 1 s. Money lasts weeks to months. |
| **250** | **Go, in waves, on SQLite** | All 250 online at once: no errors, 95% under 2.6 s, CPU at its limit. Without SQLite the store fails around day 8. Money: 30 days if learners crowd the same hours and every provider is extended; 8 to 10 if none is. |
| **1000** | **No-go for now** | All 1000 online at once: half of requests wait 5 s, 28% dropped; even arriving over 5 minutes at a slower pace: 3.3 s, 3% dropped. The store grows 250 MB a day and would need about 20 GB of memory by day 30. Money: 8 to 14 days at best, 2 to 5 if nothing is extended. Fine as a waiting list: let them in as money and measurements allow. |

## What broke first, in order
1. **At 100 learners on today's code: the server itself.** 9 requests a second, half taking over 3 s, 284 failures. Now fixed in this branch: 35 requests a second on the same PC, 0 failures.
2. **The free NVIDIA key, at 1 or 2 learners.** It allows 36 calls a minute for the whole app, and one new learner's first couple of minutes, with an upload, used 35. Everything past that waits or pays.
3. **Tailored lessons at 100+ arriving together.** Writing queues up, and the page moves a learner to the plain standard session after 8 s. So in a rush most see no tailoring on their first lessons, which also weakens the comparison. Stand-in models can't show how long the queue really is: test with a real wave of 25.
4. **The store around day 3 to 8.** Each active learner adds about 250 KB a day. A save at 180 MB stops everyone for several seconds. At 512 MB the store can't be saved or read at all, and today's code would then **start empty at the next restart**, as if every account had vanished. Fixed: it now refuses to start and says how to restore. SQLite at 428 MB: no stall over 1 s (JSON: 18, the longest 9.5 s).

## What to change first
1. **Deploy this branch.** It holds the fixes, including sign-ins that survive a restart, limits per account rather than per address (a class of 30 on one address now works), and the racing sign-up bug.
2. **Move the store to SQLite before the first tester:** stop the app, `node scripts/migrate-json-to-sqlite.js --from <db.json> --to <db.sqlite>`, set `DB_DRIVER=sqlite`, start. It can't be moved later than 512 MB.
3. **Set `BETA_GATE=invite`.** Today anyone can sign up: 200 accounts in 15 s worked, and each may spend up to 25 cents a day of your credit. Check `scripts/beta-invites.js` sends mail first.
4. **Memory:** give the service at least 2 GB for 100 learners and 5 GB for 250 over 30 days, with `--max-old-space-size` to match. The kit's limit of 800 MB is passed at 250 online.
5. **Copy backups off the server.** A daily backup on the same disk doesn't survive that disk. A restore takes about 10 s now, 35 s at 180 MB.
6. **Stop build agents spending credit by Nov 10.** They spend about $42 a day on the five ledgers below, and Lyceum another $65. At that pace about $360 of the $550 is gone by Nov 15, and Lyceum in two days.
7. **Let testers in by waves** (say 25, then 50 an hour), watching `/cost-tracker`.

## Money
Left on this PC's ledgers: **$706**. Learners barely use Lyceum ($105) or Gladia ($50), so **$550** in practice, of which ZeroGPU's $233 only pays for fact checks. The server has its own ledgers since Nov 4, not readable from here, so true balances are lower. Modelled from real cost per call ($0.021 a level, $0.13 per active learner-day if all paid), 5 levels a day, 70% active. No learner has confirmed this.

| Learners | $ a day | Days until writing stops, all extended | Days, nothing extended ($168) | Days, nothing extended and NVIDIA off |
|---|---|---|---|---|
| 100 | 0.89 to 7.13 | 74 to 400+ | 24 to 189 | 20 |
| 250 | 2.23 to 17.81 | 30 to 233 | 10 to 76 | 8 |
| 1000 | 40.62 to 71.25 | 8 to 14 | 4 to 5 | 2 |

Low end: learners spread over the day, NVIDIA does most of it. High end: the same hours, 80% of calls paid, as in the test. Provider by provider, in `docs/BETA-LOAD.md`. **When money or models stop nobody is left stuck:** forced in a local copy, the tutor gives a plain "live tutor isn't connected" reply plus the learner's own notes, the question coach gives a hint from the bank, a lesson falls to the standard session (within about 1 s, or 8 s if a provider hangs), and an upload's course stays queued or says it couldn't be built. When a provider hangs, the tutor takes about 34 s to give that plain reply. An upload that fails blames the text ("try a clearer or longer text") when the real cause is no model: a small wrong message. Nobody tells you when a ledger stops: watch `/cost-tracker`.

## The question for Nov 10: which providers keep learner data after Nov 14?
Your OK for added providers ends Nov 14 06:00 UTC. The code doesn't treat them alike, so doing nothing is itself a choice:

| Provider | Left (PC) | What it does for learners | Code after Nov 14 if you do nothing | Your call |
|---|---|---|---|---|
| Gonka | $38 | Writes levels, uploads, session reads; cheapest | **Stops** for everyone | Extend? |
| Grokified | $111 | Fact checks, repairs, last writer | **Stops** for everyone | Extend? |
| ZeroGPU | $233 | First fact checker (its only job so far) | **Stops** for everyone | Extend? |
| Lyceum | $105 | Backup fact checker | **Stops** for everyone | Extend? |
| Munito | $93 | Writes levels, uploads | **Carries on** for 13+, stops for under-13 | Confirm or switch off |
| Coral | $75 | Writes levels, first lesson, tutor's paid fallback, fact checks | **Carries on** for 13+, stops for under-13 | Confirm or switch off |
| Gladia | $50 | Transcribes uploaded audio and video | **Carries on** under the consent rule | Confirm or switch off |
| NVIDIA free | free, 36 calls a minute | First choice for all learner calls | **Carries on**, though the build rules call it pipeline-only and the Nov 2 policy says keep only non-tracking models | **Decide this one first** |
| Anthropic | $23 | Stronger check on the next level | Carries on; runs out in about a day at 100 learners, then the free check | Confirm |
| Standard Compute | $1.34 | Tutor fallback | Carries on | Effectively gone |

Forced in a local copy:
- **Nothing extended:** 13+ keep the tutor, lessons and uploads on NVIDIA, Munito and Coral, with $168 instead of $550.
- **Also NVIDIA, Munito and Coral off:** nothing outside sees learner data. Tutor: its own notes only. Coach: bank hints. Lessons: the standard session, or shared levels already written. Uploads: can't be built. No tailoring at all, so the 4x comparison means little.
- **Under-13s:** a child account without a parent's OK gets none of it either way. With a parent's OK, after Nov 14 it is NVIDIA only (not forced in a test: read from the code).

If you extend only some, Gonka writes levels most cheaply and ZeroGPU checks facts most cheaply. ZeroGPU's $233 can't write levels until it is routed to do so.

## Not proven
Real model speed and failure rates; how many levels a day real learners do; a real full disk (simulated); a power cut; a test from a real phone; the server's real speed and memory.
