#!/bin/bash
# One backup of Savant's data on the Onidel server, its restore test, and the rotation that keeps the disk from filling. One run, then it is gone: nothing
# stays running or scheduled on the server. Run as user savant. Reads /srv/savant, writes only under /srv/savant-backups. Exit 1 on any failure.
#
# Today the PC's pull-backups.ps1 sends this over ssh at each pull, every 6 hours, so with the PC off no new set is made. savant-backup.service and .timer
# beside this file would run it on the server itself, whatever the PC is doing. They are NOT installed: docs/RESTORE.md has the commands, for the owner to decide.
#
#   /srv/savant-backups/sets/        db-<stamp>.json.gz (or .sqlite.gz), its ledgers and small files, a manifest: scripts/backup-db.js thins these to
#                                    every set for 48 h, then one a day, none past 28 days (the privacy promise is 30)
#   /srv/savant-backups/db-*.json    full copies a deploy leaves: deleted after 14 days, and past PREDEPLOY_MAX_GB total only the newest PREDEPLOY_KEEP stay
#
# /etc/cron.d/savant-backup never ran: cron is not installed on this server.
# After the store moves to SQLite, DB_DRIVER and DB_SQLITE_FILE must reach this script (docs/SQLITE-SWITCH.md), or it fails on purpose rather than save a frozen file.
set -euo pipefail
umask 077

APP=${APP:-/srv/savant}
ROOT=${BACKUP_ROOT:-/srv/savant-backups}
export BACKUP_DIR=${BACKUP_DIR:-$ROOT/sets}
export BACKUP_MIN_FREE_MB=${BACKUP_MIN_FREE_MB:-20480}   # leave 20 GB: the app needs room to save, and the offline wiki beside it is large
export BACKUP_MAX_AGE_DAYS=${BACKUP_MAX_AGE_DAYS:-28}
PREDEPLOY_DAYS=${PREDEPLOY_DAYS:-14}
PREDEPLOY_MAX_GB=${PREDEPLOY_MAX_GB:-10}
PREDEPLOY_KEEP=${PREDEPLOY_KEEP:-5}

cd "$APP"
mkdir -p "$BACKUP_DIR"
# The switch-over leaves this file on the server when the store is on SQLite, so this script needs no edit then. A line like: DB_DRIVER=sqlite
[ -r "$ROOT/driver.env" ] && { set -a; . "$ROOT/driver.env"; set +a; }

# Every ledger, the invites and the counters, by name: this works with the backup-db.js deployed today, which on its own takes only five of them.
extras=$(find "$APP/data" -maxdepth 1 -type f -name '*.json' ! -name 'db.json' -size -256M -print | sort | paste -sd, -)
export BACKUP_EXTRA=$extras

status=0
/usr/bin/node --no-warnings scripts/backup-db.js || status=$?
if [ "$status" = 0 ]; then
  /usr/bin/node --no-warnings scripts/backup-db.js --restore-test || status=$?
fi

# The copies a deploy leaves are full size and uncompressed. At a 2 GB store, 9 deploys a day for 14 days would be about 250 GB.
find "$ROOT" -maxdepth 1 -type f -name 'db-*.json' -mtime +"$PREDEPLOY_DAYS" -delete
total_kb=$(find "$ROOT" -maxdepth 1 -type f -name 'db-*.json' -printf '%s\n' | awk '{s+=$1} END {print int(s/1024)}')
if [ "${total_kb:-0}" -gt $((PREDEPLOY_MAX_GB * 1024 * 1024)) ]; then
  find "$ROOT" -maxdepth 1 -type f -name 'db-*.json' -printf '%T@ %p\n' | sort -rn | tail -n +$((PREDEPLOY_KEEP + 1)) | cut -d' ' -f2- | while read -r f; do
    rm -f "$f"
    echo "removed $(basename "$f"): deploy copies passed ${PREDEPLOY_MAX_GB} GB"
  done
fi

free_gb=$(df --output=avail -BG "$ROOT" | tail -1 | tr -dc 0-9)
sets=$(find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.manifest.json' | wc -l)
printf '{"at":"%s","ok":%s,"sets":%s,"sets_mb":%s,"deploy_copies_mb":%s,"disk_free_gb":%s}\n' "$(date -u +%FT%TZ)" "$([ "$status" = 0 ] && echo true || echo false)" "$sets" "$(du -sm "$BACKUP_DIR" | cut -f1)" "$((${total_kb:-0} / 1024))" "$free_gb" | tee "$BACKUP_DIR/last-run.json"
exit "$status"
