# Restoring Savant, and where the backups are

Written 7 Nov 2026 after the first real restore on the server. Every time here is **measured** on the Onidel server (EPYC 7713, 12 vCPU, 48 GB, Node 22.23) with today's store: 10.9 MB, 9,904 rows, 108 accounts. A bigger store takes longer: see `docs/SQLITE-SWITCH.md` for sizes.

## What was found first

| Finding | Why it matters | State now |
|---|---|---|
| **The daily backup has never run.** `/etc/cron.d/savant-backup` exists, but cron is not installed on this server. | The only copies of the store were the ones a deploy leaves (`db-predeploy-*`). With no deploy, no backup. | Each PC pull now makes a set. See "Off the server". |
| **Most ledgers had no copy.** `data/ledger-backups/` held 2 of 9, because a copy was only taken when a ledger was written. `backup-db.js` named 5 ledgers and missed the rest. | A ledger with no file **starts again at $0 spent, with no error**, so a restore from those copies would have forgotten $13.13 on Anthropic and $3.60 on Munito and let both spend past their caps. | Fixed on the branch. A set holds every ledger. |
| `/healthz` answers 404 on the live app: `routes/ops.js` is not mounted in this deployment. | An uptime check must use `/api/health`. `/api/ops/status` is not there either. | Not changed. The steps below use `/api/health`. |
| `data/db.json` and the `db-predeploy-*` copies are readable by every account on the server (mode 644), `.env` is not. | The server has few accounts, but the file holds learner data. | Not changed: it is under `/srv/savant`. New sets are mode 600 in a mode 700 folder. Worth `chmod 700 /srv/savant/data` at the next deploy. |

## What a backup set holds, and what it doesn't

A set is `db-<stamp>.json.gz` (or `.sqlite.gz`), `db-<stamp>.extra.<name>.gz` for each small file beside the store (every ledger, the usage counters, invites, `holdout.json`), and a manifest with SHA-256 checksums and row counts. The manifest is written last, so a set with a manifest is whole.

Not in a set, and needed on a new server:
- **`.env`.** All 78 variable names on the server also exist in the PC's `.env`; the values were not compared. A lost `SESSION_SECRET` only signs people out.
- **`data/*.csv`, `.xlsx`, `data/models/`.** Not in git. The 11 CSV, xlsx and holdout files match the PC's live folder by checksum (measured). `data/models` was not compared.
- **`/etc/systemd/system/savant.service.d/onboarding.conf`:** `ONBOARDING_V2=on`, `COLD_FIRST_BLOCK=on`. They aren't in `.env`.
- **The code** (git), `/srv/wiki` (rebuildable, 111 GB), `data/cost-tracker/` (logs).
- **`data/sessions.sqlite`.** Without it learners sign in again. Nothing else is lost.

## If the store is damaged, on this server

Not run on the live service. The same steps ran on a copy, below. Service down: about 5 s at today's size.

```bash
systemctl stop savant
cd /srv/savant
# Newest first. Run as savant, always: a file root leaves behind can't be read by the app.
runuser -u savant -- node scripts/backup-db.js --dir /srv/savant-backups/sets --list | tail -3
runuser -u savant -- node scripts/backup-db.js --restore /srv/savant-backups/sets/db-<stamp>.json.gz --to data/db.json --force --extras-to data
runuser -u savant -- node scripts/ledger-restore.js --dir data     # must end "all ledgers present are ok", exit 0
systemctl start savant
curl -s http://127.0.0.1:6767/api/health                           # {"ok":true}
```

- `--extras-to` needs this branch's `backup-db.js`. On today's deployed one, unzip the ledgers by hand: `gunzip -c db-<stamp>.extra.munito-ledger.json.gz > data/munito-ledger.json`, as savant.
- A ledger that is still good is kept, as it may be newer than the backup. One that is missing or damaged comes from the set, with an estimate added for the hours since (its log's rate at the time of the backup, per hour). The file says so in `restored_note`. **Check the balance against the provider afterwards**, as spend after the backup is a guess.
- On SQLite: `--to data/db.sqlite`, and the tool moves any old `-wal` and `-shm` aside. Replaying an old WAL over a restored file damages it.
- Ledgers only, store fine: `runuser -u savant -- node scripts/ledger-restore.js --dir data --write`. It uses `data/ledger-backups/`.

## If the disk or the server is gone

1. New server: Node 22 or newer, `git clone`, `npm ci --omit=dev`, user `savant`, the unit file and `onboarding.conf`, Caddy, ufw. `deploy/beta/README.md` has the longer form. Not timed.
2. Put `.env` back. Copy `data/*.csv`, `*.xlsx`, `data/models` from the PC's live folder.
3. Copy the newest set from `C:\coding\savant-backups\sets\` to the server, into a folder savant can read. It took 2 s, measured.
4. As savant: the `--restore ... --extras-to data` line above.
5. Start. Point DNS at it. Check balances against each provider.

What is lost: everything since the newest set the PC holds. At most about 6 hours if the PC is on, and however long the PC has been off if not.

## The drill

Run as root on the server: `deploy/onidel/restore-drill.sh`. It builds a second instance in `/srv/savant-drill`, as user savant, on `127.0.0.1:7901`, with its own `DB_FILE` and ledger paths, no `.env`, no keys, the network cut off and `/srv/savant` out of its reach, and deletes it all at the end.

```bash
TOOLS=<folder holding this branch> deploy/onidel/restore-drill.sh --set /srv/savant-backups/sets/db-<stamp>.manifest.json
TOOLS=<folder holding this branch> deploy/onidel/restore-drill.sh --json /srv/savant-backups/db-predeploy-<stamp>.json --ledgers /srv/savant/data/ledger-backups
```

Steps: copy the code and static files; restore the store and ledgers; compare the store with its backup by row hash, plus 500 rows by full text; check the ledgers; start; serve the home page and catalog; sign up a synthetic account, refuse a wrong password, sign in, confirm the session, refuse a stranger; stop; compare again; try a garbage, empty, root-owned and missing ledger on a copy.

| Run, 7 Nov | Restore start to `/api/health` 200 | Rows backup / copy after the synthetic sign-up | Ledgers restored |
|---|---|---|---|
| Deploy copy + `ledger-backups/` | **4.0 s** | 9,904 / 9,905: added 1, removed 0, changed 0 | **2 of 9** (the rest would have started at $0) |
| Backup set on the server | **5.1 s** | 9,904 / 9,905: added 1, removed 0, changed 0 | 9 of 9, each balance equal to live |
| The same kind of set, pulled to the PC and sent back | 2 s to send, **6.9 s** | 9,904 / 9,905: added 1, removed 0, changed 0 | 9 of 9 |

Copying the code took 2.3 to 2.9 s more. The whole drill took under 12 s. The live app stayed at 200, 4 to 6 ms, and its store's file did not change.

All 8 serve and sign-in checks passed in each run. The synthetic account got id 6691, which shows the restored counter of 6690 was loaded, so no id is reused. No real learner's account was signed in to: passwords aren't known, and the drill makes its own.

**What a ledger does, on a copy (measured):**
| Ledger file | A paid call |
|---|---|
| Good | Goes ahead, with the right spend |
| Garbage or empty | **Refused:** "ledger corrupt ... refusing every call until a person fixes" |
| Restored by root, mode 600 | **Refused:** "unreadable (EACCES)". This is the trap: restore as savant |
| **Missing** | **Goes ahead at $0 spent.** No error. So a restore without its ledgers is the dangerous one, and it looks fine |

The branch now also puts a missing ledger back at boot, from `data/ledger-backups/` if it has a copy, and says `LEDGER MISSING` in the log.

## Off the server

**This folder holds learner data:** accounts, emails, password hashes, answers, notes, and possibly children's. It is on the owner's PC, it is not encrypted by this setup, and it is not in git (`C:\coding` is not a repository, and the installer refuses one).

| | |
|---|---|
| Where | `C:\coding\savant-backups\sets\<set>\`, log in `pull-log.txt` (names and sizes only) |
| Access | Only Windows user `admin`: inheritance off, every other entry removed, checked again on each run. An administrator can still take ownership. Disk encryption (BitLocker) was not checked |
| How | `pull-backups.ps1` asks the server for a fresh set, over ssh as savant, at nice 15: one run, nothing stays running there. It pulls every set rotation would keep, checks both checksums of the store and of every extra, and only then moves the set into `sets\` |
| Rotation | Every set for 48 h, then the newest of each UTC day, nothing past 28 days; the newest 3 always stay. The privacy policy promises deletion of a closed account within 30 days, so older copies must go |
| Test, measured | 2 sets pulled in 22 s, 4 MB, checksums matched. Rotation dropped a 37-day-old set and the older of two on one day, and kept a 30-hour-old one. Then a set went back to the server and passed the drill |

**The schedule is not on yet.** The tool permissions here refused creating a scheduled task on this PC and installing a timer on the server, so those two are the owner's or the caller's call. Today the pull runs only when someone runs it. To turn it on, once, in PowerShell on the PC:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\coding\savant-backups\pull-backups.ps1 -Schedule     # every 6 h and at sign-in; a missed run happens when the PC is next on
powershell -NoProfile -ExecutionPolicy Bypass -File C:\coding\savant-backups\pull-backups.ps1               # or by hand, any time
```

**What the owner must keep running:** this PC, on and online at some point each day, signed in to the `admin` user (the task runs only while signed in), and able to use `~\.ssh\onidel`.

**If the PC is off:** no new sets are made, on the server either. When it comes back, the next run makes a set and catches up. If the server's disk dies meanwhile, everything since the last pull is gone. `/srv/savant-backups/sets/last-offsite-pull` shows when that was, and `pull-log.txt` shows `WARNING` and exit 1 if the newest set is over 13 hours old or the server's run failed. Nothing tells anyone by itself.

**If the PC dies:** the server still has its sets, so nothing is lost unless both go at once. Both are single disks in the same owner's hands, with no third copy.

**Better later, in order:**
1. **The server's own timer, today, free:** `deploy/onidel/savant-backup.service` and `.timer`. Then sets are made whether or not the PC is on, and rotation with them:
   ```bash
   install -m 755 deploy/onidel/savant-backup.sh /usr/local/sbin/savant-backup
   cp deploy/onidel/savant-backup.service deploy/onidel/savant-backup.timer /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now savant-backup.timer
   ```
   Then remove the dead `/etc/cron.d/savant-backup`, and add `-NoFreshSet` to the PC's task.
2. **A key that can only read the backups,** instead of the root key the PC holds today.
3. **Encrypted copies on object storage,** with a learner-data agreement, once there is money: restic or age to Backblaze B2 costs about $0.30 a month at this size (price from memory, not checked). That removes the PC from the path, and the privacy policy may need to say where backups are held either way.

## The disk on the server

315 GB, 181 GB free at the last check, `/srv/wiki` 111 GB (`wikipedia.sqlite` is 57 GB, and its indexer was still running at 28% CPU during this work), `/srv/savant-backups` 383 MB.

Rotation was **not working at all**: the same dead cron line was the only thing that deleted anything. There are 27 full deploy copies from 4 days, uncompressed. That is nothing at 11 to 15 MB each, but at a 1.9 GB store (simulated: 250 learners, 30 days) and the same 7 deploys a day it would be about 186 GB in 14 days: **more than the disk has free**.

`deploy/onidel/savant-backup.sh`, on every run:
- Deploy copies (`db-*.json`): deleted after 14 days. Past 10 GB in total, only the newest 5 stay. Nothing is deleted today.
- Sets: thinned by `backup-db.js` (on the branch) to the same rule as the PC. The deployed version only applies the 28 days until this branch goes out.
- A new set is refused if it would leave under 20 GB free, and the run fails rather than fill the disk.

Still open: this rotation only runs when a pull runs, so with the PC off the deploy copies pile up until the timer above is installed. On SQLite, deploy copies of `db.json` are small and frozen, so they stop being a risk, but they also stop being a backup: `docs/SQLITE-SWITCH.md` covers it. Nothing here limits `/srv/wiki` itself.

**A really full disk, measured** on a 24 MB tmpfs with the real ENOSPC (`scripts/beta-load/full-disk.js`): SQLite and JSON both reported the failure, kept serving, saved everything within 3 s of room coming back, and lost 0 of 12 rows after a SIGKILL, with `integrity_check` ok on SQLite. The old SQLite driver reported nothing while it failed, and lost rows: see "bugs" in `docs/SQLITE-SWITCH.md`.

## Not verified

- The steps on the live service itself: only copies were used.
- A restore with the real `.env`, real keys and real mail.
- A new server built from nothing: only steps 3 to 5, on this server.
- Sign-in for a real learner on a restored copy (their password isn't known). Their password hashes are in the row hashes compared.
- A real power cut.
- The scheduled task running on its own, and how it behaves with the PC asleep.
