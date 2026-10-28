#!/bin/sh
# Make a new release from an uploaded copy of the app and switch to it, with an
# automatic switch back if /healthz does not answer. (BETA-LAUNCH-KIT.md 1.5 and 5.)
#
#   sudo -u savant sh release.sh /srv/savant/upload
#
# Layout:
#   /srv/savant/releases/<UTC stamp>/   one per release (code only)
#   /srv/savant/app -> releases/<id>    what systemd runs
#   /srv/savant/shared/data, shared/logs  kept across releases; linked into each release
#   /srv/savant/backups                 scripts/backup-db.js output
set -eu
SRC="${1:?usage: release.sh <uploaded app folder>}"
BASE=/srv/savant
ID=$(date -u +%Y%m%dT%H%M%SZ)
NEW="$BASE/releases/$ID"
PREV=$(readlink -f "$BASE/app" 2>/dev/null || true)

mkdir -p "$BASE/releases" "$BASE/shared/data" "$BASE/shared/logs" "$BASE/backups"
cp -a "$SRC" "$NEW"
rm -rf "$NEW/data" "$NEW/logs"
ln -s "$BASE/shared/data" "$NEW/data"
ln -s "$BASE/shared/logs" "$NEW/logs"
cd "$NEW"
npm ci --omit=dev --no-audit --no-fund
# The content bank must load (server.js refuses to start without every generator).
node -e "const b=require('./content/bank'); const m=b.missingSkills(); if (m.length) { console.error('missing generators: '+m.join(', ')); process.exit(1) }"

# A backup before every switch, so a bad release can be rolled back with its data.
(cd "$BASE/app" 2>/dev/null && node scripts/backup-db.js) || echo "no previous release to back up from"

ln -sfn "$NEW" "$BASE/app.next" && mv -Tf "$BASE/app.next" "$BASE/app"
sudo systemctl restart savant

ok=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:6767/healthz >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ "$ok" = 1 ]; then
  echo "release $ID is live"
  # Keep the last 5 releases.
  ls -1d "$BASE"/releases/* | sort | head -n -5 | xargs -r rm -rf
else
  echo "release $ID did not pass /healthz; switching back to $PREV" >&2
  if [ -n "$PREV" ]; then ln -sfn "$PREV" "$BASE/app.next" && mv -Tf "$BASE/app.next" "$BASE/app"; sudo systemctl restart savant; fi
  exit 1
fi
