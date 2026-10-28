#!/usr/bin/env sh
# Run the app on http://localhost:6767 (macOS / Linux).
# Installs dependencies on first run and creates .env from .env.example.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required: https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies, first run only..."
  npm install --no-audit --no-fund || exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Put your OPENROUTER_API_KEY and MIMO_API_KEY in it to turn the AI on."
fi

# Pinned to development on 6767 so a machine-wide NODE_ENV=production does not
# make the server demand a production SESSION_SECRET.
NODE_ENV=development PORT=6767 exec node server.js
