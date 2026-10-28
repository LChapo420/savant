#!/usr/bin/env sh
# Run the app on http://localhost:6767 WITH three demo learners (macOS / Linux).
# They fill the scorecard and the profile pages. The admin panel is limited to
# ADMIN_EMAILS and is not one of them; sign in as that account to see it.
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules ]; then npm install --no-audit --no-fund || exit 1; fi
NODE_ENV=development node scripts/seed-demo.js || exit 1
exec ./start.sh
