#!/bin/bash
# Run one command in the live beta release, as the app's user, with the app's settings
# (deploy/beta/README.md). Examples:
#
#   sudo /srv/savant-beta/bin/run node scripts/beta-invites.js approve you@example.com
#   sudo /srv/savant-beta/bin/run node scripts/backup-db.js --list
#   sudo /srv/savant-beta/bin/run node scripts/metrics-report.js --data /srv/savant-beta/shared/data/db.json
set -euo pipefail
BASE="${SAVANT_BASE:-/srv/savant-beta}"
RUN_AS="${SAVANT_USER:-savantbeta}"
ENV_FILE="${SAVANT_ENV_FILE:-$BASE/savant-beta.env}"
[ "$#" -gt 0 ] || { echo "usage: run <command> [args...]" >&2; exit 2; }
CMD=(bash -c 'set -a; . "$0"; set +a; cd "$1"; shift; exec "$@"' "$ENV_FILE" "$BASE/app" "$@")
if [ "$(id -un)" = "$RUN_AS" ]; then exec "${CMD[@]}"; else exec sudo -u "$RUN_AS" -H "${CMD[@]}"; fi
