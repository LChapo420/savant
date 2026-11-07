#!/bin/bash
# SQLite on a COPY of the live data on the Onidel server: migrate and verify, rehearse the switch-over and the rollback, run the load test. Run as root.
# Everything is in /srv/savant-sqlite-test, run as user savant at low priority, with the network cut off (only localhost), /srv/savant out of reach, no .env.
# Nothing under /srv/savant changes and the savant service is not touched. docs/SQLITE-SWITCH.md has the results.
#
#   sqlite-drill.sh prepare <worktree tar on stdin>     copy code, data and ledgers; the branch's changed files on top
#   sqlite-drill.sh proof                               migrate a copy of the live data, compare, rehearse switch and rollback
#   sqlite-drill.sh load <learners> <minutes> json|sqlite [tag]
#   sqlite-drill.sh grow <learners> <days> <out.sqlite>|<out.json>
#   sqlite-drill.sh ladder <args for size-ladder.js>
#   sqlite-drill.sh clean                               delete everything
#
# Account 6689 is removed from the copy every instance boots on (base.json), so nothing can write its rows or sign in as it. Only migrate-and-compare reads
# the full copy, and it prints counts and hashes. Sign-ins are synthetic (@example.test only).
set -uo pipefail

DIR=/srv/savant-sqlite-test
APP=$DIR/app
RUNS=$DIR/runs
LIVE=/srv/savant
OUT=$DIR/out
ABORT=$DIR/ABORT
as_savant() { runuser -u savant -- "$@"; }
now() { date +%s.%N; }
since() { python3 -c "import time;print(round(time.time()-$1,1))"; }

prepare() {
  [ -e "$DIR" ] && { echo "$DIR exists" >&2; exit 1; }
  install -d -o savant -g savant -m 700 "$DIR" "$APP" "$RUNS" "$OUT" "$DIR/ledgers" "$DIR/tmp"
  tar -C "$LIVE" --exclude=./.env --exclude=./data --exclude=./logs --exclude=./.git -cf - . | as_savant tar -C "$APP" -xf -
  as_savant mkdir -p "$APP/data"
  ( cd "$LIVE/data" && find . -maxdepth 1 -type f \( -name '*.csv' -o -name '*.xlsx' -o -name holdout.json -o -name base-levels-report.json -o -name spanish-gateway-users.json \) -print0 | tar --null -T - -cf - models spanish-media spanish-run ) | as_savant tar -C "$APP/data" -xf -
  as_savant tar -C "$APP" -xf -   # the branch's changed files, from stdin
  cp "$LIVE"/data/*-ledger.json "$DIR/ledgers/"; chown savant:savant "$DIR"/ledgers/*
  as_savant cp "$LIVE/data/db.json" "$DIR/live-copy.json"
  # The copy instances boot on: the owner's account and its rows left out.
  as_savant node --no-warnings -e "
    const fs=require('fs');const d=JSON.parse(fs.readFileSync('$DIR/live-copy.json','utf8'));let gone=0;
    for(const[k,v]of Object.entries(d)){if(!Array.isArray(v))continue;d[k]=v.filter(r=>{const mine=(k==='users'&&r.id===6689)||r.user_id===6689;if(mine)gone++;return !mine;});}
    fs.writeFileSync('$DIR/base.json',JSON.stringify(d));console.log('base.json: left out',gone,'rows of the owner account');"
  ls -la "$DIR" | cut -c1-90
}

# The live app's health while anything heavy runs. Three bad answers in a row stop the test.
watcher() {
  local bad=0
  while true; do
    r=$(curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time 5 http://127.0.0.1:6767/api/health)
    echo "$(date -u +%T) $r load $(cut -d' ' -f1 /proc/loadavg) memavail_mb $(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)" >> "$OUT/live-watch.log"
    code=${r%% *}; t=${r##* }
    if [ "$code" != 200 ] || python3 -c "import sys;sys.exit(0 if $t>1.0 else 1)"; then bad=$((bad+1)); else bad=0; fi
    if [ "$bad" -ge 3 ]; then
      echo "$(date -u +%T) live app unhealthy three times: stopping the test" | tee -a "$OUT/live-watch.log" > "$ABORT"
      systemctl stop savant-load 2>/dev/null
      return
    fi
    sleep 5
  done
}

summ_watch() { # from a line number to the end of the watch log
  tail -n +"$1" "$OUT/live-watch.log" | awk '{n++; if($3>m)m=$3; s+=$3; if($2!=200)b++} END {printf "live app during this: %d checks, %d not 200, slowest %.3f s, mean %.4f s\n", n, b, m, n?s/n:0}'
}

guarded() { # run a low-priority job under the watcher
  [ -e "$ABORT" ] && { echo "aborted earlier: $(cat "$ABORT")"; return 1; }
  local from; from=$(( $(wc -l < "$OUT/live-watch.log" 2>/dev/null || echo 0) + 1 ))
  watcher & local w=$!
  systemd-run --quiet --unit=savant-load --wait --pipe --collect -p User=savant -p Group=savant -p Nice=19 -p IOSchedulingClass=idle -p MemoryMax="${MEM:-16G}" \
    -p InaccessiblePaths="$LIVE" -p IPAddressDeny=any -p IPAddressAllow=localhost -p WorkingDirectory="$APP" \
    --setenv=TMPDIR="$RUNS" --setenv=BETA_LOAD_LEDGER_SOURCE="$DIR/ledgers" --setenv=MEASURED_ON='Onidel server, EPYC 7713, 12 vCPU, nice 19, offline wiki indexer also running' \
    "$@"
  local code=$?
  kill "$w" 2>/dev/null; wait "$w" 2>/dev/null
  summ_watch "$from"
  return $code
}

ENVS=(--setenv=NODE_ENV=production --setenv=TRUST_PROXY=1 --setenv=SESSION_SECRET=sqlite-drill-only-secret-sqlite-drill-only-secret-012345
  --setenv=ADMIN_EMAILS=drill-admin@example.test --setenv=OWNER_EMAIL=drill-owner@example.test --setenv=OWNER_LEARNER_EMAILS=drill-owner-learner@example.test
  --setenv=OLLAMA_ENABLED=0 --setenv=BETA_REPORT_DAILY=off --setenv=WRITE_AHEAD=off)

start_instance() { # unit port folder node-args-or-empty extra --setenv...
  local unit=$1 port=$2 folder=$3; shift 3
  local v; local L=()
  for v in anthropic coral gladia gonka grokified lyceum munito standard-compute zerogpu llmgateway; do L+=(--setenv="$(echo "$v" | tr 'a-z-' 'A-Z_')_LEDGER_FILE=$folder/$v-ledger.json"); done
  systemd-run --quiet --unit="$unit" --collect -p User=savant -p Group=savant -p Nice=10 -p MemoryMax=6G -p InaccessiblePaths="$LIVE" -p IPAddressDeny=any -p IPAddressAllow=localhost -p WorkingDirectory="$APP" \
    "${ENVS[@]}" "${L[@]}" --setenv=PORT="$port" --setenv=DB_FILE="$folder/db.json" --setenv=COST_TRACKER_DIR="$folder/cost-tracker" --setenv=NVIDIA_USAGE_FILE="$folder/nvidia-usage.json" \
    --setenv=FREE_TIER_EVIDENCE_FILE="$folder/free-evidence.json" --setenv=MAIL_OUTBOX_DIR="$folder/outbox" --setenv=MAIL_STATE_DIR="$folder" --setenv=LOG_DIR="$folder/logs" --setenv=TMPDIR="$DIR/tmp" --setenv=HOME="$DIR/tmp" \
    "$@" /usr/bin/node server.js
}

wait_up() { for _ in $(seq 1 600); do [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "http://127.0.0.1:$1/api/health")" = 200 ] && return 0; sleep 0.1; done; return 1; }

proof() {
  local c="node --no-warnings scripts"
  cd "$APP" || exit 1
  echo "== 1. migrate a copy of the live data (full copy: counts and hashes only)"
  local T; T=$(now)
  as_savant bash -c "$c/migrate-json-to-sqlite.js --from '$DIR/live-copy.json' --to '$DIR/live-copy.sqlite' --report '$OUT/migrate.json'" | python3 -c "import json,sys; r=json.load(sys.stdin); print({k:r[k] for k in ['ok','json_bytes','sqlite_bytes','collections','rows','dropped_keys','timings_ms']})"
  echo "migrate, measured: $(since "$T") s"
  T=$(now)
  as_savant bash -c "$c/migrate-json-to-sqlite.js --verify --from '$DIR/live-copy.json' --to '$DIR/live-copy.sqlite'" | python3 -c "import json,sys; r=json.load(sys.stdin); print('verify:',{k:r.get(k) for k in ['ok','rows','problems','timings_ms']})"
  as_savant bash -c "$c/store-compare.js '$DIR/live-copy.json' '$DIR/live-copy.sqlite' --sample 2000 --json" > "$OUT/compare-full.json"; echo "store-compare exit $?"
  python3 -c "import json; r=json.load(open('$OUT/compare-full.json')); print('compare:',{k:r[k] for k in ['ok','collections','a_rows','b_rows','added','removed','changed','sampled','sample_differ','problems']}); print('largest:',sorted(((c['a_rows'],c['collection']) for c in r['by_collection']),reverse=True)[:6])"

  echo "== 2. rehearse the switch: JSON running, stop, migrate, verify, SQLite running"
  local F=$DIR/rehearse; local P=7902; local B=http://127.0.0.1:$P; local J=$DIR/tmp/jar
  as_savant mkdir -p "$F"; as_savant cp "$DIR/base.json" "$F/db.json"; as_savant bash -c "cp '$DIR'/ledgers/*-ledger.json '$F/'"
  start_instance rehearse $P "$F"; wait_up $P || { echo "no boot"; journalctl -u rehearse -n 8 --no-pager | cut -c1-160; return 1; }
  local CL="node --no-warnings scripts/beta-load/synthetic-client.js"
  as_savant bash -c "$CL $B signup before-switch@example.test $J"
  sleep 1
  as_savant bash -c "$c/store-compare.js '$F/db.json' '$F/db.json' --json" > /dev/null
  # What a visitor sees: the time from the last good answer to the next.
  ( last=""; down=""; while true; do code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "$B/api/health"); t=$(now); if [ "$code" = 200 ]; then if [ -n "$down" ]; then python3 -c "print('service was down, measured from outside: %.1f s' % ($t-$last))"; down=""; fi; last=$t; else down=1; fi; sleep 0.1; done ) > "$OUT/down-1.txt" & local poll=$!
  sleep 1
  local T0; T0=$(now)
  systemctl stop rehearse; echo "stop (the store flushes on SIGTERM): $(since "$T0") s"
  as_savant cp "$F/db.json" "$F/db.json.before-switch"
  T=$(now)
  as_savant bash -c "$c/migrate-json-to-sqlite.js --from '$F/db.json' --to '$F/db.sqlite'" > /dev/null || { echo "migrate failed"; return 1; }
  echo "migrate with its own verify: $(since "$T") s"
  T=$(now)
  start_instance rehearse $P "$F" --setenv=DB_DRIVER=sqlite --setenv=DB_SQLITE_FILE="$F/db.sqlite"; wait_up $P || { echo "no SQLite boot"; journalctl -u rehearse -n 8 --no-pager | cut -c1-160; return 1; }
  echo "boot on SQLite to /api/health 200: $(since "$T") s; total from stop: $(since "$T0") s"
  sleep 0.6; kill "$poll" 2>/dev/null; wait "$poll" 2>/dev/null; cat "$OUT/down-1.txt"
  as_savant bash -c "$CL $B me before-switch@example.test $J; $CL $B login before-switch@example.test $J; $CL $B signup made-on-sqlite@example.test $DIR/tmp/jar2; $CL $B login made-on-sqlite@example.test $DIR/tmp/jar2"
  sleep 1

  echo "== 3. the copy on SQLite holds everything JSON had"
  as_savant bash -c "$c/store-compare.js '$F/db.json.before-switch' '$F/db.sqlite' --subset --json" | python3 -c "import json,sys; r=json.load(sys.stdin); print({k:r[k] for k in ['ok','a_rows','b_rows','added','removed','changed','problems']})"

  echo "== 4. roll back: stop, SQLite to JSON, JSON running, nothing made on SQLite lost"
  ( last=$(now); down=""; while true; do code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "$B/api/health"); t=$(now); if [ "$code" = 200 ]; then if [ -n "$down" ]; then python3 -c "print('service was down, measured from outside: %.1f s' % ($t-$last))"; down=""; fi; last=$t; else down=1; fi; sleep 0.1; done ) > "$OUT/down-2.txt" & poll=$!
  sleep 1
  T0=$(now)
  systemctl stop rehearse
  as_savant mv "$F/db.json" "$F/db.json.old-frozen"
  T=$(now)
  as_savant bash -c "$c/migrate-json-to-sqlite.js --reverse --from '$F/db.sqlite' --to '$F/db.json'" > /dev/null || { echo "reverse failed"; return 1; }
  echo "reverse with its own verify: $(since "$T") s"
  start_instance rehearse $P "$F"; wait_up $P || { echo "no JSON boot"; return 1; }
  echo "total from stop: $(since "$T0") s"
  sleep 0.6; kill "$poll" 2>/dev/null; wait "$poll" 2>/dev/null; cat "$OUT/down-2.txt"
  as_savant bash -c "$CL $B me made-on-sqlite@example.test $DIR/tmp/jar2; $CL $B login made-on-sqlite@example.test $DIR/tmp/jar2; $CL $B login before-switch@example.test $J; $CL $B signup after-rollback@example.test $DIR/tmp/jar3"
  sleep 1; systemctl stop rehearse
  as_savant bash -c "$c/store-compare.js '$F/db.sqlite' '$F/db.json' --subset --json" | python3 -c "import json,sys; r=json.load(sys.stdin); print('SQLite vs rolled-back JSON:',{k:r[k] for k in ['ok','a_rows','b_rows','added','removed','changed','problems']}); print(' added:',{c['collection']:c['added'] for c in r['by_collection'] if c['added']})"
  echo "== 5. a backup set of a store on SQLite, restored"
  local S=$F/sets
  T=$(now)
  as_savant bash -c "DB_DRIVER=sqlite DB_SQLITE_FILE='$F/db.sqlite' BACKUP_DIR='$S' BACKUP_EXTRA='$F/munito-ledger.json' BACKUP_MIN_FREE_MB=1024 $c/backup-db.js"
  as_savant bash -c "DB_DRIVER=sqlite DB_SQLITE_FILE='$F/db.sqlite' BACKUP_DIR='$S' $c/backup-db.js --restore-test"
  local gz; gz=$(ls "$S"/db-*.sqlite.gz | tail -1)
  as_savant bash -c "$c/backup-db.js --restore '$gz' --to '$F/restored.sqlite'"
  as_savant bash -c "$c/store-compare.js '$F/db.sqlite' '$F/restored.sqlite' --json" | python3 -c "import json,sys; r=json.load(sys.stdin); print('SQLite vs its restored backup:',{k:r[k] for k in ['ok','a_rows','b_rows','problems']})"
  echo "backup, test and restore: $(since "$T") s"
  rm -rf "$F"
}

load() {
  local n=$1 min=$2 driver=$3
  local tag=${4:-$driver}
  local args=(--no-warnings scripts/beta-load/load-run.js --learners "$n" --minutes "$min" --think 8000 --ramp 60 --db "$DIR/base.json" --tag "$tag" --driver "$driver" --port 7810)
  guarded /usr/bin/node "${args[@]}" > "$OUT/load-$n-$tag.txt" 2>&1
  local code=$?
  tail -40 "$OUT/load-$n-$tag.txt" | cut -c1-200
  latest=$(ls -td "$RUNS"/beta-load/load-"$n"-"$tag"-* | head -1)
  [ -f "$latest/report.json" ] && cp "$latest/report.json" "$OUT/report-$n-$tag.json"
  # Keep a run's data only while it is needed.
  [ "${KEEP_RUN:-0}" = 1 ] && echo "kept $latest" || rm -rf "$latest"
  return $code
}

case "${1:-}" in
  prepare) prepare ;;
  proof) proof 2>&1 | tee "$OUT/proof.txt" ;;
  load) shift; load "$@" ;;
  grow)
    shift
    r=$(ls -td "$RUNS"/beta-load/load-*/ 2>/dev/null | head -1)
    [ -n "${RUN_FOR_GROW:-}" ] && r=$RUN_FOR_GROW
    n=$1; d=$2; o=$3
    if [[ "$o" == *.sqlite ]]; then a=(--sqlite "$o"); else a=(--out "$o"); fi
    MEM=30G guarded /usr/bin/node --no-warnings --max-old-space-size=24000 scripts/beta-load/grow-db.js --run "$r" --base "$DIR/base.json" --learners "$n" --days "$d" --minutes-in-run "${MINUTES_IN_RUN:-5}" "${a[@]}" ;;
  ladder) shift; guarded /usr/bin/node --no-warnings scripts/beta-load/size-ladder.js "$@" ;;
  clean)
    systemctl stop savant-load rehearse 2>/dev/null
    rm -rf "$DIR"; echo "removed $DIR" ;;
  *) echo "usage: see the top of this file" >&2; exit 2 ;;
esac
