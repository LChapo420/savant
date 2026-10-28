#!/bin/sh
# Encrypt the newest backup and copy it off the box (curriculum-build/BETA-LAUNCH-KIT.md 2.4).
# Needs: age (https://age-encryption.org) with the PUBLIC key of a key pair whose private
# half stays off the server (the laptop), and rclone with a remote named "offsite"
# (for example a Cloudflare R2 bucket: 10 GB-month free, egress free; checked 2026-10-24).
set -eu
DIR="${BACKUP_DIR:-/srv/savant/backups}"
RECIPIENT_FILE="${BACKUP_AGE_RECIPIENT_FILE:-/srv/savant/backup-recipient.txt}"
REMOTE="${BACKUP_REMOTE:-offsite:savant-backups}"
NEWEST=$(ls -1 "$DIR"/db-*.manifest.json | sort | tail -n 1)
ID=$(basename "$NEWEST" .manifest.json)
OUT="/tmp/$ID.tar.age"
tar -C "$DIR" -cf - $(cd "$DIR" && ls -1 "$ID".*) | age -R "$RECIPIENT_FILE" -o "$OUT"
rclone copy "$OUT" "$REMOTE/"
rm -f "$OUT"
# Same 28-day rule off the box, so a deleted account is gone everywhere within 30 days.
rclone delete --min-age 28d "$REMOTE/"
echo "offsite: $ID copied"
