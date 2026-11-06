#!/usr/bin/env bash
# The 4x measure (docs/SPEED-4X.md; SIMULATED). usage: speed-4x-run.sh OUTDIR [design|held|variants]
# The speed arms were frozen on the design seed before the held-out seed was ever run. No model calls, no spend.
OUT="$1"; WHAT="${2:-all}"; mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SIM="$ROOT/scripts/faster-by-goal-sim.js"
ARMS=page_tracker,testout,testout_short,plus_stop,review_only_through,review_only_end,safe,end
SELF=1.1,1.15,1.2,1.25,1.3,1.4,1.5,1.75,2
HELD=20261106; DESIGN=777002
if [ "$WHAT" = design ] || [ "$WHAT" = all ]; then
  node "$SIM" --seed=$DESIGN --n-extreme=60 --n-ordinary=20 --speed-arms=$ARMS --self-r=$SELF --out="$OUT/design.json"
fi
if [ "$WHAT" = held ] || [ "$WHAT" = all ]; then
  node "$SIM" --seed=$HELD --speed-arms=$ARMS --self-r=$SELF --out="$OUT/held.json" &
  node "$SIM" --seed=$HELD --quick=1 --finish=1 --jit=1 --final=1 --out="$OUT/rule.json" &
  wait
fi
run() { # name flags...
  name="$1"; shift
  node "$SIM" --seed=$HELD --speed-arms=safe,end,safe_implicit,end_implicit --self-r=$SELF "$@" --out="$OUT/v-$name.json"
  node "$SIM" --seed=$HELD --quick=1 --finish=1 --jit=1 --final=1 "$@" --out="$OUT/vr-$name.json"
}
if [ "$WHAT" = variants ] || [ "$WHAT" = all ]; then
  # reading speed; whether a skipped page was known; check validity; the tracker wrong; forgetting; deep lapses
  run lesson0.5 --lesson=0.5 &
  run lesson1.5 --lesson=1.5 &
  run skip0.2 --skip-loss=0.2 &
  run skip0.4 --skip-loss=0.4 &
  run cold0.5 --cold-gain=0.5 &
  run guess0.5 --guess=0.5 &
  wait
  run est1.5 --est-gain=1.5 &
  run est0.7 --est-gain=0.7 &
  run kloss0.5 --kloss=0.5 &
  run kloss1 --kloss=1 &
  run forget0.5 --forget=0.5 &
  run forget2 --forget=2 &
  wait
  # extensions, each shown both ways against the runs above: prerequisites reviewed by later items; a shorter review answer, for Savant only and for everyone
  run implicit0.5 --implicit=0.5 &
  run implicit0.25 --implicit=0.25 &
  run reviewS15 --review-s=15 &
  run reviewS15all --review-s=15 --review-s-all=1 &
  # what you would have to believe (never a headline): Savant's pages and answers teach this many times what the audited model says
  run gain1.3 --speed-gain=1.3 &
  run gain1.8 --speed-gain=1.8 &
  wait
  run gain3 --speed-gain=3 &
  run gain3s15 --speed-gain=3 --review-s=15 &
  run gain5s15 --speed-gain=5 --review-s=15 &
  wait
fi
