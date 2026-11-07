# Moving the store to SQLite: the numbers, the steps, the way back

Written 7 Nov 2026. **Nothing live was switched.** All of this ran on copies on the Onidel server (EPYC 7713, 12 vCPU, 48 GB, Node 22.23), with `nice 19` and `ionice idle`, cut off from the network, away from `/srv/savant`. The live app answered all 1,131 health checks during the tests with 200, the slowest in 10 ms, so it was not disturbed. Models are stand-ins and learners are scripted, as in `docs/BETA-LOAD.md`: **no real learner and no real model.**

## Recommendation: yes, before the first tester, after this branch is deployed

- **It costs about 6 seconds today, and the way back stays open for weeks.** The cost grows with the store: 33 s at 337 MB.
- **It changes nothing you would notice at the start.** On today's store the two are level, at 100 and at 250.
- **It is what survives growth.** At 337 MB JSON stalls everyone: 34 stalls over 1 s in 5 minutes, against 0. JSON stops altogether near 512 MB, **about day 18 at 100 active learners and day 7 at 250** (simulated from 281.5 KB per learner-day, measured with scripted learners), and after that the data can't be moved at all.
- **Not before this branch.** The SQLite driver now live in the code lost rows on a full disk and told `/api/health` all was well (bug 1 below).

## The numbers

Every number in these tables is **measured** on the server. The stores in the second and third tables are **simulated**: scripted learners' rows cloned to the size named.

**Today's real store (10.9 MB, the owner's account left out), 5 minutes, think time 8 s, arriving over 60 s, disk quiet.** Requests other than the planned lesson wait, in ms:

| | JSON 100 | SQLite 100 | JSON 250 | SQLite 250 |
|---|---|---|---|---|
| p50 / p95 | 16 / 147 | 16 / 104 | 29 / 302 | 27 / 228 |
| p99 | 14,014 | 13,147 | 6,178 | 6,512 |
| Requests a second | 17.1 | 17.0 | 37.7 | 37.6 |
| Failed or dropped | 0 | 0 | 0 | 0 |
| App busy | 36% | 29% | 58% | 54% |
| CPU per request | 18 ms | 16 ms | 13 ms | 13 ms |
| Seconds with a stall over 1 s | 1 | 1 | 0 | 2 |
| Longest stall | 3.3 s | 3.4 s | 0.9 s | 6.0 s |
| Time spent saving | 5.3% | 0 | 5.9% | 0 |
| Peak memory | 759 MB | 680 MB | 1003 MB | 806 MB |
| Store at the end | 20 MB | 24 MB | 30 MB | 37 MB |

The p99 is the tutor's reply waiting for the stand-in model's queue on both drivers (about 14 s in the one run whose route table was read). SQLite 250's 6.0 s stall was not explained: the raw run was deleted before it was looked at. Two seconds in five minutes is not a pattern, but it is a real difference from JSON's zero here. **This server did about 37 requests a second at 54% busy, which suggests 60 to 70 at its limit (worked out, not run),** the first real figure for the server.

**The same SQLite runs while the offline wiki indexer was writing hard (two processes near 100% CPU):**
| | SQLite 100 | SQLite 250 |
|---|---|---|
| p50 / p95 / p99 | 21 / 3,035 / 14,018 ms | 58 / 5,689 / 17,480 ms |
| Stalls over 1 s, longest | 11, 6.1 s | 12, 4.9 s |
| Failed or dropped | 0 | 10 |

A full disk flush at `ionice idle` then took 36 ms at p95 against 7 ms at normal priority (measured). These runs were at `idle`, so the live app at normal priority would suffer less. How much less was not measured, and JSON was not measured during indexing, as it had finished by then. **Don't index the wiki while testers are on, or give it `ionice -c3`.**

**A grown store: 353 MB of JSON (as if 100 learners, 18 days), 30 online, 5 minutes:**
| | JSON | SQLite (441 MB) |
|---|---|---|
| p50 / p95 / p99 | 861 / 7,142 / 16,394 ms | **32 / 1,038 / 7,231 ms** |
| Stalls over 1 s, longest | 34, 6.1 s | **0, 0.4 s** |
| Time spent saving | 27% | 0 |
| Peak memory | 2,433 MB | 1,576 MB |
| Boot | 5.9 s | 9.2 s |

**As if 250 learners, 30 days: 1.78 GB on SQLite, 1.33 million rows.** JSON can't hold this.
| Online at once | p50 / p95 / p99 | Failed or dropped | Stalls over 1 s, longest | Peak memory |
|---|---|---|---|---|
| 60 | 90 / 4,799 / 9,785 ms | 0 | 1, 1.4 s | 4,351 MB |
| 100 | 143 / 9,524 / 14,065 ms | 0 | 1, 1.3 s | 4,349 MB |
| 250, Node's default heap (4,144 MB) | 631 / 32,347 / 55,299 ms | 118 | 12, 3.6 s | 3,378 MB |
| 250, 8 GB heap | 465 / 28,527 / 62,156 ms | 163 | 9, 4.2 s | 4,368 MB |

Boot at this size: 38 to 41 s, so **every restart or deploy at day 30 is 40 s offline.**

**250 all online at once on a 30-day store does not hold.** The app is at its limit at about 27 requests a second, half what it does on a small store, and requests queue. It is not the store's saving (1 to 2% of the time). A profile of 240 s, boot included, shows no single cause: flushing ledgers to disk 13% (inflated by `ionice idle`), loading at boot 11%, garbage collection 11%, `db.find` scans 6%, `asTimestamp` in `services/write-ahead.js` 5%, the save's sweep 3%. Testers at 30 minutes a day would rarely all be on: 60 at once held, though its p95 of 4.8 s is slow, partly because those 60 all sign in at the same instant. That's the case for waves, and for speeding these scans up before day 20 if 250 do come.

**Backups of a store on SQLite, at 1.78 GB, 250 learners writing:** 26.4 s and 29.6 s, restore test 15.0 s and 17.4 s, 79 MB (cloned rows compress unusually well; today's real store shrinks to 18%, which would be about 320 MB). The old tool took 346 s and 350 s under the same load, but 40 s with nothing writing: each save restarted its copy.

**Past 2 GiB (2.34 GB):** new tool 60.2 s, restore test 26.8 s. Old tool: **fails**, "File size is greater than 2 GiB". Backups would have stopped around the time the store got big.

## Migration of a copy of the live data: verified

| Check, on a copy of `data/db.json` | Result |
|---|---|
| Collections, rows | 82, 9,904 in both |
| Rows added, removed, changed (SHA-256 of each row) | 0, 0, 0 |
| 2,000 rows at random, full text | 2,000 same |
| Every row in order, counters, whole-store SHA-256, `integrity_check` (`--verify`) | ok, 0 problems |
| Size | 10.9 MB of JSON, 13.5 MB of SQLite |

Nothing was printed but counts and hashes. Instances booted only on a copy with the owner's account and its 3 rows left out, so nothing could write them or sign in as it.

## Switching over

**What's down:** measured from outside, polling `/api/health` every 0.1 s on a rehearsal:

| Store | Stop | Migrate with its check | Boot on SQLite | Down |
|---|---|---|---|---|
| Today, 10.9 MB | 0.1 s | 3.1 s (1.0 s on a second run) | 2.4 s | **5.6 s** (rehearsed) |
| 353 MB, simulated | | 23.8 s | 9.2 s | about 33 s (parts added, not rehearsed) |

Signed-in learners stayed signed in: a session made on JSON answered on SQLite straight away.

**Before you start:**
1. **Deploy this branch.** `grep -c _connection config/db-sqlite.js` should say 1.
2. **Change your deploy's backup step.** It copies `data/db.json` to `db-predeploy-*`. After this, that file is gone on purpose, so the copy fails rather than saving a frozen file every time and looking healthy. Use `runuser -u savant -- bash deploy/onidel/savant-backup.sh`.

**The steps,** as root, not yet run on the live service:
```bash
cd /srv/savant
runuser -u savant -- bash deploy/onidel/savant-backup.sh     # a set made just now
systemctl stop savant
runuser -u savant -- node --no-warnings scripts/migrate-json-to-sqlite.js --from data/db.json --to data/db.sqlite --report /srv/savant-backups/migrate-report.json
#   On any failure it stops and leaves db.json alone: `systemctl start savant` and you are back as you were.
runuser -u savant -- mv data/db.json data/db.json.before-sqlite
cat > /etc/systemd/system/savant.service.d/sqlite.conf <<'EOF'
[Service]
Environment=DB_DRIVER=sqlite
Environment=DB_SQLITE_FILE=/srv/savant/data/db.sqlite
ExecStart=
ExecStart=/usr/bin/node --max-old-space-size=8192 server.js
EOF
systemctl daemon-reload && systemctl start savant
curl -s http://127.0.0.1:6767/api/health                     # {"ok":true}
printf 'DB_DRIVER=sqlite\nDB_SQLITE_FILE=/srv/savant/data/db.sqlite\n' > /srv/savant-backups/driver.env   # the backups now take SQLite
runuser -u savant -- bash deploy/onidel/savant-backup.sh     # the first set of the new store, and its restore test
```

`.env` isn't touched. The heap setting matters later: the default 4,144 MB was enough at 1.78 GB, with 2.3 GB of it used, but leaves little margin past that.

**Also changes:** any script that reads `data/db.json` directly (about 150 under `scripts/`, none in the running app) now fails loudly until pointed at a copy. To get one: `node scripts/migrate-json-to-sqlite.js --reverse --from data/db.sqlite --to /tmp/copy.json`.

**Don't delete** `data/db.sqlite-wal` while the app runs or after a crash: it holds the last saves.

## Going back to JSON

**Rehearsed: 3.5 s down at today's size. Nothing lost.** An account made on SQLite signed in on the rolled-back JSON store, a session on it stayed signed in, and a row-by-row compare found 0 removed and 0 changed. At 353 MB the reverse took 27.6 s, so about 34 s down (parts added).

```bash
cd /srv/savant
systemctl stop savant
runuser -u savant -- node --no-warnings scripts/migrate-json-to-sqlite.js --reverse --from data/db.sqlite --to data/db.json
#   On "too big for the JSON driver", stop and read below.
runuser -u savant -- mv data/db.sqlite data/db.sqlite.rolled-back
rm /etc/systemd/system/savant.service.d/sqlite.conf /srv/savant-backups/driver.env
systemctl daemon-reload && systemctl start savant
curl -s http://127.0.0.1:6767/api/health
```

**The way back closes.** Past about 512 MB of JSON, roughly day 18 at 100 active learners and day 7 at 250 (simulated), it can't be done: the JSON driver couldn't load it anyway. Tried on the 1.78 GB store: it refused in 35.5 s with a plain message and wrote nothing (measured). From then on the only way back is an earlier SQLite backup, which loses what came after it:
```bash
systemctl stop savant
runuser -u savant -- node scripts/backup-db.js --restore /srv/savant-backups/sets/db-<stamp>.sqlite.gz --to data/db.sqlite --force
systemctl start savant
```
`data/db.json.before-sqlite` is **not** a way back once anyone has used the app: it is frozen at the switch.

## Bugs found and fixed on the branch

Each has a test in `scripts/beta-durable-test.js`, or a run named here.

| # | Bug | What it would have done | Proof |
|---|---|---|---|
| 1 | **SQLite driver:** a failed save marked rows as written before the commit, and a rollback that SQLite had already done threw and skipped the retry bookkeeping | On a full disk: rows lost at the next restart, a counter behind so ids reissued, and `/api/health` saying all is well | The test fails on the old driver, passes now. On a real full disk (24 MB tmpfs, real ENOSPC): the old driver never reported failure; the new one reported it, kept serving, recovered in 2.8 s, lost 0 of 12 rows, `integrity_check` ok |
| 2 | `backup-db.js` named 5 ledgers | A restore starts the rest at $0 and they pass their caps | Test; 15 extras in a real set |
| 3 | A ledger got a copy only when written, and only the first write of an interval | 7 of 9 ledgers had none on the server; the rest missed the last write ($0.0006 and $0.0039 behind) | Test |
| 4 | A missing ledger starts at $0 with no error, and `ledger-restore.js` didn't see it | Silent overspend after a partial restore | Test; put back at boot from its copies, loudly |
| 5 | `ledger-restore.js` crashed on a file it couldn't read, always exited 0, and added an estimate even for a ledger idle for days | A wrong-owner file looked like a code bug; a failed check looked fine; an idle provider could be stopped for nothing | Test |
| 6 | SQLite backup in default steps restarted at each save | 346 s against 26 s at 1.78 GB, and could get worse without limit | Measured above |
| 7 | Backup read the whole store with `readFileSync`, and put it in `/tmp`, which is RAM on this server | Backups stop past 2 GiB, about when 250 learners reach day 30 | Measured above |
| 8 | Restoring over a database left its old WAL beside it | The old log replays over the restored file | Test |
| 9 | One unreadable manifest stopped every later backup. A set could have a manifest before its files reached the disk | A power cut ends all backups, quietly | Test |
| 10 | A JSON backup kept running after a move to SQLite | A frozen file saved every day, looking healthy | Test |
| 11 | A backup could fill the disk; `--restore` as root left files the app can't read | Disk full; a ledger refusing every paid call | Test, and the refusal also run as root on the server |
| 12 | `--reverse` wrote the indented form, with no flush | Fails sooner at the size limit, and a power cut could lose it | Test for one line; the refusal measured above |
| 13 | JSON gave no warning before the 512 MB wall | Found out only when saves fail, too late to move | Test |

Also found, **not fixed**, and worth a look:
- `scripts/beta-launch-test.js` fails one check on main as well as this branch: `apply.js`'s anchors for `health` and `error handler` no longer match `server.js`. That also means `deploy/beta/release.sh` would stop at that step, and it's probably why `/healthz` isn't mounted on the server.
- `/srv/wiki/bin/wiki_search.py` held 21 to 27 GB of the server's 48 GB during these tests, with no limit. 21 GB or more stayed available throughout, but with the app at 4+ GB it deserves a `MemoryMax`, so an out-of-memory kill can't take the app.

## Not verified

- The switch and rollback on the live service, with its real `.env`, keys and traffic.
- Real learners and real models. Levels written by the stand-in fail the app's checks, so tailored writing is barely in these numbers.
- Stores above 353 MB on JSON, and whether a live deploy keeps `db.sqlite` as it keeps `db.json`: your deploy step isn't in the repo. It must leave `data/` alone.
- A real power cut.
- Whether the p95 at 60 online on a 30-day store is sign-ins alone or stays that way.

The raw run reports were lost: the cleanup deleted them before a failed download was noticed. The numbers here were read from those reports first, and no learner data was in them.
