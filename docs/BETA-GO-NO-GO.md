# Beta go or no-go: 100, 250, 1000 learners

Measured on the build PC (Ryzen 9 6900HS), not the server, 6 Nov 2026, with scripted learners and stand-in models. No real learner and no real model were in these tests. The server's specs aren't in the notes. Nothing is known about its speed; a rented core is often 1.5 to 3 times slower than this one. Detail: `docs/BETA-LOAD.md`.

| Learners | Verdict | Why |
|---|---|---|
| **100** | **Go**, once steps 1 to 5 are deployed | All 100 online at once, on a quiet PC: no errors, half of requests in 23 ms, 95% in 110 ms, app 31% busy. Money lasts weeks to months. |
| **250** | **Go, in waves, on SQLite** | All 250 online at once: no errors, 95% in 242 ms, app 53% busy. With other work holding the PC at 100%: 95% in 2.6 s, app at its limit. Without SQLite the store fails around day 8. Money: 28 days if learners crowd the same hours and every provider is extended; 8 or 9 if none is. |
| **1000** | **No-go for now** | All 1000 online at once on a busy PC: half of requests wait 5 s, 28% dropped. Arriving over 5 minutes at a slower pace: 3.3 s, 3% dropped. The store grows 250 MB a day and would need 15 to 20 GB of memory by day 30. Money: 8 to 13 days at best, 2 to 4 if nothing is extended. Keep them on a waiting list and let them in as money and measurements allow. |

**Update, 7 Nov, on the server itself (EPYC 7713, 12 vCPU, 48 GB).** At 100 and 250 online on today's store, JSON and SQLite were level: no errors, 95% within 104 to 302 ms. At a store as if 100 learners and 18 days (simulated), SQLite had no stalls and JSON had 34. At a store as if 250 learners and 30 days (simulated), 60 and 100 online held but 250 at once did not (95% over 28 s, 118 to 298 dropped). So: **waves stay necessary, and 250 at once on a 30-day store is a no-go.** Restore and backup: `docs/RESTORE.md`. Switching the store: `docs/SQLITE-SWITCH.md`. These replace steps 2 and 5 below.

## What broke first, in order
1. **At 100 learners on today's code: the server itself.** 9 requests a second, half of them over 3 s, 284 failures. Fixed in this branch.
2. **The free NVIDIA key, at 1 or 2 learners.** It allows 36 calls a minute for the whole app, and one new learner's first couple of minutes, with an upload, used 35. Past that, calls wait or pay.
3. **Tailored lessons at 100+ arriving together.** Writing queues up, and the page moves a learner to the plain standard session after 8 s. So in a rush most see no tailoring on their first lessons, which also weakens the comparison. Stand-in models can't show how long the queue really is: test with a real wave of 25.
4. **The store around day 3 to 8.** Each active learner adds about 250 KB a day. On the old JSON store a save at 180 MB stops everyone for seconds. At 512 MB it can't be saved or read at all, and today's code would then **start empty at the next restart**, as if every account had vanished. Fixed: it now refuses to start and says how to restore. SQLite at 428 MB: no stall over 1 s (JSON: 18, the longest 9.5 s).
5. **A power cut.** The 6 Nov crash zeroed five ledgers on this PC because nothing flushed to disk before renaming. The server's writers were the same. Fixed: store, ledgers and invites are now flushed first, and ledgers now have copies.

## What to change first
1. **Deploy this branch.** It holds the fixes, including sign-ins that survive a restart, limits per account rather than per address (a class of 30 on one address now works), and the racing sign-up bug.
2. **Move the store to SQLite before the first tester:** stop the app, `node scripts/migrate-json-to-sqlite.js --from <db.json> --to <db.sqlite>`, set `DB_DRIVER=sqlite`, start. A crash then loses about 0.3 s, not several. It can't be moved once the file passes 512 MB.
3. **Set `BETA_GATE=invite`.** Today anyone can sign up: 200 accounts in 15 s worked, and each may spend up to 25 cents a day of your credit. Check that `scripts/beta-invites.js` sends mail first.
4. **Memory:** give the service at least 2 GB for 100 learners and 5 GB for 250 over 30 days, with `--max-old-space-size` to match. The kit's limit of 800 MB is passed at 250 online.
5. **Copy backups off the server,** ledgers included. A copy on the same disk doesn't survive that disk. A restore takes about 10 s now, 35 s at 180 MB.
6. **Stop build agents spending credit by Nov 10.** Before the crash they spent about $42 a day on the five ledgers below, and Lyceum another $65. At that pace about $340 of the $510 is gone by Nov 15.
7. **Let testers in by waves** (say 25, then 50 an hour), watching `/cost-tracker`.

## Money
Left on this PC's ledgers: **$643**, of which five were rebuilt from estimates after the crash. Learners barely use Lyceum ($82) or Gladia ($50), so **$510** in practice, of which ZeroGPU's $213 only pays for fact checks. The server has its own ledgers since Nov 4, not readable from here, so true balances are lower. Modelled from real cost per call ($0.021 a level, $0.13 per active learner-day if all paid), 5 levels a day, 70% active. No learner has confirmed this.

| Learners | $ a day | Days until writing stops, all extended | Days, nothing extended ($151) | Days, nothing extended and NVIDIA off |
|---|---|---|---|---|
| 100 | 0.90 to 7.19 | 69 to 400+ | 22 to 169 | 17 |
| 250 | 2.25 to 17.97 | 28 to 217 | 9 to 68 | 8 |
| 1000 | 40.77 to 71.87 | 8 to 13 | 3 to 4 | 2 |

Low end: learners spread over the day, NVIDIA does most of it. High end: the same hours, 80% of calls paid, as in the test. Provider by provider, in `docs/BETA-LOAD.md`.

**When money or models stop, nobody is left stuck.** Forced in a local copy: the tutor gives a plain "live tutor isn't connected" reply plus the learner's own notes (at once, or after about 34 s if a provider hangs), the question coach gives a hint from the bank, a lesson falls to the standard session (within about 1 s, or 8 s if a provider hangs), and an upload says the course builder isn't available, your material is saved, try later (it said nothing before; fixed). One wrong message remains: when a model fails partway, an upload blames the text ("try a clearer or longer text"). Nobody tells you when a ledger stops: watch `/cost-tracker`.

## The question for Nov 10: which providers keep learner data after Nov 14?
Your OK for added providers ends Nov 14 06:00 UTC. The code doesn't treat them alike, so doing nothing is itself a choice:

| Provider | Left (PC) | What it does for learners | Code after Nov 14 if you do nothing | Your call |
|---|---|---|---|---|
| Gonka | $29 | Writes levels, uploads, session reads; cheapest | **Stops** for everyone | Extend? |
| Grokified | $116 | Fact checks, repairs, last writer | **Stops** for everyone | Extend? |
| ZeroGPU | $213 | First fact checker (its only job so far) | **Stops** for everyone | Extend? |
| Lyceum | $82 | Backup fact checker | **Stops** for everyone | Extend? |
| Munito | $88 | Writes levels, uploads | **Carries on** for 13+, stops for under-13 | Confirm or switch off |
| Coral | $63 | Writes levels, first lesson, tutor's paid fallback, fact checks | **Carries on** for 13+, stops for under-13 | Confirm or switch off |
| Gladia | $50 | Transcribes uploaded audio and video | **Carries on** under the consent rule | Confirm or switch off |
| NVIDIA free | free, 36 calls a minute | First choice for all learner calls | **Carries on**, though the build rules call it pipeline-only and the Nov 2 policy says keep only non-tracking models | **Decide this one first** |
| Anthropic | $22 | Stronger check on the next level | Carries on; runs out in about a day at 100 learners, then the free check | Confirm |
| Standard Compute | $1.34 | Tutor fallback | Carries on | Effectively gone |

Forced in a local copy:
- **Nothing extended:** 13+ keep the tutor, lessons and uploads on NVIDIA, Munito and Coral, with $151 instead of $510.
- **Also NVIDIA, Munito and Coral off:** nothing outside sees learner data. Tutor: its own notes only. Coach: bank hints. Lessons: the standard session, or shared levels already written. Uploads: can't be built. No tailoring at all, so the 4x comparison means little.
- **Under-13s:** a child account without a parent's OK gets none of it either way. With a parent's OK, after Nov 14 it is NVIDIA only (read from the code, not forced in a test).

If you extend only some, Gonka writes levels most cheaply and ZeroGPU checks facts most cheaply. ZeroGPU's $213 can't write levels until it is routed to do so.

## Not proven
Real model speed and failure rates; how many levels a day real learners do; a real full disk (simulated); a repeat of a real power cut; a test from a real phone beyond one page check; the server's real speed and memory.
