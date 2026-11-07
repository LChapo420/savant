#!/bin/bash
# The restore drill on the Onidel server: a second instance from a real backup, away from the live app. Run as root, from anywhere.
#
#   restore-drill.sh --json <db backup .json> --ledgers <folder with *-ledger*.json copies>      a plain copy of db.json (db-predeploy-*)
#   restore-drill.sh --set <db-<stamp>.manifest.json>                                            a set made by scripts/backup-db.js
#
# Nothing is changed under /srv/savant. Everything lives in /srv/savant-drill, is run as user savant on 127.0.0.1:$PORT with the network
# cut off (IPAddressDeny), no .env and no keys, and is deleted at the end unless KEEP=1. Prints each step's time. docs/RESTORE.md explains it.
set -euo pipefail

DRILL=${DRILL:-/srv/savant-drill}
PORT=${PORT:-7901}
LIVE=/srv/savant
TOOLS=${TOOLS:-$(cd "$(dirname "$0")/../.." && pwd)}   # where store-compare.js and the newer ledger-restore.js come from
UNIT=savant-drill
JSON_SRC=""; LEDGERS=""; SET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON_SRC=$2; shift 2 ;;
    --ledgers) LEDGERS=$2; shift 2 ;;
    --set) SET=$2; shift 2 ;;
    *) echo "unknown: $1" >&2; exit 2 ;;
  esac
done

now() { date +%s.%N; }
step() { printf '%-46s %7.1f s
' "$1" "$(python3 -c "import time;print(time.time()-$2)")"; }
as_savant() { runuser -u savant -- "$@"; }

cleanup() {
  systemctl stop "$UNIT" 2>/dev/null || true
  systemctl reset-failed "$UNIT" 2>/dev/null || true
  if [ "${KEEP:-0}" != 1 ]; then rm -rf "$DRILL"; fi
}
trap cleanup EXIT

T_ALL=$(now)
[ -e "$DRILL" ] && { echo "$DRILL exists; remove it first" >&2; trap - EXIT; exit 1; }
install -d -o savant -g savant -m 700 "$DRILL" "$DRILL/app" "$DRILL/tmp"

# --- the code and the files that are not learner state. A restore on the same box skips this; on a new box it is the git checkout + npm ci.
T=$(now)
tar -C "$LIVE" --exclude=./.env --exclude=./data --exclude=./logs --exclude=./.git -cf - . | as_savant tar -C "$DRILL/app" -xf -
as_savant mkdir -p "$DRILL/app/data"
( cd "$LIVE/data" && find . -maxdepth 1 -type f \( -name '*.csv' -o -name '*.xlsx' -o -name holdout.json -o -name base-levels-report.json -o -name spanish-gateway-users.json \) -print0 | tar --null -T - -cf - models spanish-media spanish-run ) | as_savant tar -C "$DRILL/app/data" -xf -
step "copy code and static data (not part of a restore)" "$T"
# The tools of this branch, until it is deployed.
for f in scripts/store-compare.js scripts/ledger-restore.js scripts/backup-db.js services/durable-file.js; do install -o savant -g savant -m 644 "$TOOLS/$f" "$DRILL/app/$f"; done

# --- the restore itself starts here.
T_RESTORE=$(now)
T=$T_RESTORE
DB="$DRILL/app/data/db.json"
if [ -n "$SET" ]; then
  as_savant bash -c "cd '$DRILL/app' && node scripts/backup-db.js --restore '${SET%.manifest.json}.json.gz' --to '$DB' --extras-to '$DRILL/app/data'"
else
  as_savant cp "$JSON_SRC" "$DB"
  if [ -n "$LEDGERS" ]; then
    # Newest copy of each ledger, under its own name, as the app will look for it.
    for base in $(ls "$LEDGERS" | sed -E 's/\.[0-9T]+\.json$//' | sort -u); do
      newest=$(ls "$LEDGERS" | grep -E "^$base\.[0-9T]+\.json$" | sort | tail -1)
      as_savant cp "$LEDGERS/$newest" "$DRILL/app/data/$base.json"
    done
  fi
fi
[ -n "$SET" ] && { as_savant cp "$DB" "$DRILL/tmp/before.json"; JSON_SRC="$DRILL/tmp/before.json"; }
step "restore the store and ledgers" "$T"

T=$(now)
as_savant bash -c "cd '$DRILL/app' && node scripts/store-compare.js '${JSON_SRC:-$DB}' '$DB' --sample 500 --json" > "$DRILL/tmp/compare-before.json" || { echo "store does not match its backup" >&2; exit 1; }
python3 - "$DRILL/tmp/compare-before.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1])); print(f"store vs backup: ok={r['ok']} collections={r['collections']} rows={r['b_rows']} sampled={r['sampled']} differ={r['sample_differ']}")
PY
step "check the restored store" "$T"

T=$(now)
as_savant bash -c "cd '$DRILL/app' && node scripts/ledger-restore.js --dir data" 
step "check the ledgers" "$T"

# --- the second instance. An environment built from nothing: no .env in this folder, so no key can reach it.
SECRET=$(openssl rand -hex 32)
PROPS=(-p WorkingDirectory="$DRILL/app" -p User=savant -p Group=savant -p Nice=10 -p MemoryMax=6G -p InaccessiblePaths="$LIVE" -p IPAddressDeny=any -p IPAddressAllow=localhost
  --setenv=NODE_ENV=production --setenv=PORT="$PORT" --setenv=TRUST_PROXY=1 --setenv=SESSION_SECRET="$SECRET" --setenv=DB_FILE="$DB"
  --setenv=ADMIN_EMAILS=drill-admin@example.test --setenv=OWNER_EMAIL=drill-owner@example.test --setenv=OWNER_LEARNER_EMAILS=drill-owner-learner@example.test
  --setenv=COST_TRACKER_DIR="$DRILL/app/data/cost-tracker" --setenv=NVIDIA_USAGE_FILE="$DRILL/app/data/nvidia-usage.json" --setenv=FREE_TIER_EVIDENCE_FILE="$DRILL/app/data/free-evidence.json"
  --setenv=MAIL_OUTBOX_DIR="$DRILL/tmp/outbox" --setenv=MAIL_STATE_DIR="$DRILL/tmp" --setenv=LOG_DIR="$DRILL/tmp/logs" --setenv=OLLAMA_ENABLED=0 --setenv=BETA_REPORT_DAILY=off --setenv=WRITE_AHEAD=off
  --setenv=TMPDIR="$DRILL/tmp" --setenv=HOME="$DRILL/tmp")
for l in anthropic coral gladia gonka grokified lyceum munito standard-compute zerogpu llmgateway; do
  v=$(echo "$l" | tr 'a-z-' 'A-Z_'); PROPS+=(--setenv="${v}_LEDGER_FILE=$DRILL/app/data/$l-ledger.json")
done
T=$(now)
systemd-run --quiet --unit="$UNIT" --collect "${PROPS[@]}" /usr/bin/node server.js
for _ in $(seq 1 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/api/health" || true)" = 200 ] && break
  sleep 0.5
done
[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/api/health" || true)" = 200 ] || { echo "second instance did not answer /api/health" >&2; journalctl -u "$UNIT" -n 15 --no-pager | cut -c1-200 >&2; exit 1; }
step "boot the second instance until /api/health is 200" "$T"
T_READY=$(now)

# --- does it serve, does sign-in work (a synthetic account made on this copy), do counts match.
T=$(now)
as_savant node - "$PORT" "$DRILL" <<'NODE'
const [port, drill] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}`;
const stamp = Date.now();
const call = async (jar, method, url, body) => {
  const res = await fetch(`${base}${url}`, { method, redirect: 'manual', headers: { 'X-Forwarded-For': '10.9.9.9', 'X-Forwarded-Proto': 'https', Origin: base, ...(jar.c ? { Cookie: jar.c } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0];
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* a page */ }
  return { status: res.status, json, bytes: text.length };
};
(async () => {
  const out = [];
  const pass = (name, ok, detail = '') => { out.push(ok); console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); };
  const email = 'drill-admin@example.test';
  const password = `drill-only-${stamp}-Aa1!`;
  const page = await call({}, 'GET', '/');
  pass('home page serves', page.status === 200, `${page.status}, ${page.bytes} bytes`);
  const cat = await call({}, 'GET', '/api/catalog');
  pass('catalog serves', cat.status === 200);
  const a = {};
  await call(a, 'POST', '/api/consent/age', { birth_year: 1990, birth_month: 1, country: 'US' });
  const reg = await call(a, 'POST', '/api/auth/register', { email, password, display_name: 'Drill Test' });
  pass('synthetic account can sign up', reg.status === 201, String(reg.status));
  const b = {};
  const bad = await call(b, 'POST', '/api/auth/login', { email, password: `${password}x` });
  pass('wrong password is refused', bad.status === 401 || bad.status === 400, String(bad.status));
  const c = {};
  const login = await call(c, 'POST', '/api/auth/login', { email, password });
  pass('right password signs in', login.status === 200, String(login.status));
  const me = await call(c, 'GET', '/api/auth/me');
  pass('session knows the account', me.status === 200 && me.json && me.json.user && me.json.user.email === email);
  const none = await call({}, 'GET', '/api/auth/me');
  pass('a stranger is nobody', !(none.json && none.json.user));
  const newId = reg.json && reg.json.user && reg.json.user.id;
  pass('the running app read the restored store', Number.isInteger(newId), `the synthetic account got id ${newId}, so ${newId - 1} is the counter it loaded`);
  require('fs').writeFileSync(`${drill}/tmp/users-in-app.txt`, String(newId));
  process.exit(out.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
NODE
step "serve and sign-in checks" "$T"

# --- counts. The app flushes on stop, then the copy must hold everything in the backup, plus only what the synthetic account added.
T=$(now)
systemctl stop "$UNIT"
as_savant bash -c "cd '$DRILL/app' && node scripts/store-compare.js '${JSON_SRC:-$DRILL/tmp/before.json}' '$DB' --subset --json" > "$DRILL/tmp/compare-after.json" || true
python3 - "$DRILL/tmp/compare-after.json" "$DRILL/tmp/users-in-app.txt" <<'PY'
import json,sys
r=json.load(open(sys.argv[1])); users=open(sys.argv[2]).read().strip()
u=[c for c in r['by_collection'] if c['collection']=='users'][0]
print(f"after a stop: backup rows={r['a_rows']} copy rows={r['b_rows']} added={r['added']} removed={r['removed']} changed={r['changed']}")
print(f"users: backup rows {u['a_rows']} counter {u['a_counter']}; copy rows {u['b_rows']} counter {u['b_counter']}; synthetic id {users}")
print("added by collection:", {c['collection']:c['added'] for c in r['by_collection'] if c['added']})
print("changed by collection:", {c['collection']:c['changed'] for c in r['by_collection'] if c['changed']})
print("problems:", r['problems'])
PY
step "compare counts after the instance stopped" "$T"

# --- what a damaged, wrong-owner or missing ledger does. All on the copy, nothing is called: only the ledger's own check.
ledger_check() { as_savant bash -c "cd '$DRILL/app' && MUNITO_LEDGER_FILE='$1' node --no-warnings -e \"
  const l=require('./services/munito-ledger');
  try { const id=l.reserve({usd:0.01,task:'drill',model:'x'}); console.log('  a call would go ahead; settled so far '+JSON.stringify(l.status()).slice(0,60)); } catch (e) { console.log('  refused: '+e.message.slice(0,110)); }\""; }
if [ -f "$DRILL/app/data/munito-ledger.json" ]; then
  echo "ledger failure modes (munito, on the copy):"
  L="$DRILL/app/data/munito-ledger.json"; P="$DRILL/tmp/probe-ledger.json"
  as_savant cp "$L" "$P"; echo " good:"; ledger_check "$P"
  as_savant bash -c "echo not-json > '$P'"; echo " garbage:"; ledger_check "$P"
  as_savant bash -c ": > '$P'"; echo " empty:"; ledger_check "$P"
  cp "$L" "$P"; chown root:root "$P"; chmod 600 "$P"; echo " restored by root, mode 600:"; ledger_check "$P"; rm -f "$P"
  echo " missing (no file at all):"; ledger_check "$P"; rm -f "$P"
fi

printf '%-46s %7.1f s\n' "RESTORE, first step to a checked instance" "$(python3 -c "print($T_READY-$T_RESTORE)")"
printf '%-46s %7.1f s\n' "whole drill so far" "$(python3 -c "import time;print(time.time()-$T_ALL)")"
