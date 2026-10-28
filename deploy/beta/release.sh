#!/bin/bash
# Put a version of the app live at beta.savantedu.com without touching anyone's data
# (deploy/beta/README.md, "Updating").
#
#   sudo /srv/savant-beta/bin/release.sh                 # the newest main
#   sudo /srv/savant-beta/bin/release.sh origin/<branch> # or any branch, tag or commit
#
# What it does, stopping at the first thing that fails (the live app keeps running):
#   1. fetches the repo and unpacks that commit into releases/<UTC stamp>/ (code only);
#   2. links the release's data/, logs/ and public/base-lesson-scripts/ to shared/,
#      which no release ever replaces;
#   3. installs the packages (npm ci), applies the staged beta wiring
#      (curriculum-build/staged/beta-launch/apply.js: /healthz, the invite gate, mail,
#      SQLite sessions) to this copy only, and checks the content bank loads;
#   4. takes a backup of the data;
#   5. switches app -> the new release and restarts the service;
#   6. switches BACK by itself if /healthz does not answer within 90 seconds.
# It keeps the newest 3 releases.
#
# The settings below are for the VM; the tests point them at a scratch folder.
set -euo pipefail

REF="${1:-origin/main}"
BASE="${SAVANT_BASE:-/srv/savant-beta}"
RUN_AS="${SAVANT_USER:-savantbeta}"
SERVICE="${SAVANT_SERVICE:-savant-beta}"
PORT="${SAVANT_PORT:-6767}"
KEEP="${SAVANT_KEEP_RELEASES:-3}"
ENV_FILE="${SAVANT_ENV_FILE:-$BASE/savant-beta.env}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
HEALTH_TRIES="${SAVANT_HEALTH_TRIES:-45}"

as_app() { if [ "$(id -un)" = "$RUN_AS" ]; then "$@"; else sudo -u "$RUN_AS" -H "$@"; fi; }
in_release() { as_app bash -c "cd \"\$1\" && shift && \"\$@\"" _ "$NEW" "$@"; }

REPO="$BASE/repo"
SHARED="$BASE/shared"
ID=$(date -u +%Y%m%dT%H%M%SZ)
NEW="$BASE/releases/$ID"
PREV=$(readlink -f "$BASE/app" 2>/dev/null || true)

echo "== fetching $REF"
as_app git -C "$REPO" fetch --quiet --prune origin
COMMIT=$(as_app git -C "$REPO" rev-parse --verify "$REF^{commit}")
echo "== release $ID from $COMMIT"
as_app mkdir -p "$NEW" "$SHARED/data" "$SHARED/logs" "$SHARED/base-lesson-scripts" "$BASE/backups"
as_app bash -c 'git -C "$1" archive "$2" | tar -x -C "$3"' _ "$REPO" "$COMMIT" "$NEW"
echo "$COMMIT" | as_app tee "$NEW/.release-commit" >/dev/null
# Build-only folders the app never reads; the beta wiring script is the one kept.
in_release bash -c 'find curriculum-build -mindepth 1 -maxdepth 1 ! -name staged -exec rm -rf {} + ;
  find curriculum-build/staged -mindepth 1 -maxdepth 1 ! -name beta-launch -exec rm -rf {} + ;
  rm -rf public-redesign public-v2'

echo "== linking the shared data"
# Lesson scripts the app writes while it runs live in shared/; the ones shipped in
# git are copied over them first, so a release can update a shipped script.
if [ -d "$NEW/public/base-lesson-scripts" ]; then as_app cp -a "$NEW/public/base-lesson-scripts/." "$SHARED/base-lesson-scripts/"; fi
as_app rm -rf "$NEW/data" "$NEW/logs" "$NEW/public/base-lesson-scripts"
as_app ln -s "$SHARED/data" "$NEW/data"
as_app ln -s "$SHARED/logs" "$NEW/logs"
as_app ln -s "$SHARED/base-lesson-scripts" "$NEW/public/base-lesson-scripts"

echo "== installing packages"
in_release npm ci --omit=dev --no-audit --no-fund ${SAVANT_NPM_FLAGS:-}

echo "== applying the staged beta wiring to this release"
in_release node curriculum-build/staged/beta-launch/apply.js --write --backup "$NEW/.before-beta-wiring"
in_release node -e "const b=require('./content/bank'); const m=b.missingSkills(); if (m.length) { console.error('missing generators: '+m.join(', ')); process.exit(1) }"
in_release grep -q "require('./routes/ops')" server.js

if [ -f "$SHARED/data/db.json" ]; then
  echo "== backup before the switch"
  as_app bash -c 'set -a; . "$1"; set +a; cd "$2" && node scripts/backup-db.js' _ "$ENV_FILE" "$NEW"
fi

echo "== switching to $ID"
as_app ln -sfn "$NEW" "$BASE/app.next"
as_app mv -Tf "$BASE/app.next" "$BASE/app"
$SYSTEMCTL restart "$SERVICE"

ok=0
for _ in $(seq 1 "$HEALTH_TRIES"); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ "$ok" = 1 ]; then
  echo "== release $ID ($COMMIT) is live"
  ls -1d "$BASE"/releases/* | sort | head -n -"$KEEP" | while read -r old; do
    [ "$(readlink -f "$old")" = "$(readlink -f "$BASE/app")" ] || as_app rm -rf "$old"
  done
  exit 0
fi

echo "!! release $ID did not answer /healthz; switching back to ${PREV:-nothing}" >&2
if [ -n "$PREV" ]; then
  as_app ln -sfn "$PREV" "$BASE/app.next"
  as_app mv -Tf "$BASE/app.next" "$BASE/app"
  $SYSTEMCTL restart "$SERVICE"
fi
as_app rm -rf "$NEW"
echo "!! see: sudo journalctl -u $SERVICE -n 80" >&2
exit 1
