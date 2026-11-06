#!/usr/bin/env bash
# Round 2 of the 4x measure (docs/SPEED-4X.md; SIMULATED). usage: speed-4x-run2.sh OUTDIR [design|held|variants]
# The arms were frozen on the design seed before held-out seed 20261107 was ever run. The model's rate per practice is not touched except in runs named gain or mem, which are what-ifs. No model calls.
OUT="$1"; WHAT="${2:-all}"; mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SIM="$ROOT/scripts/faster-by-goal-sim.js"
ARMS=safe,safe_place,safe_implied,safe_edge,safe_composite,safe_fast,safe3,safe2,floor_first,floor_first2
SELF=1.1,1.15,1.2,1.25,1.3,1.4,1.5,1.75,2
HELD=20261107; DESIGN=777002
if [ "$WHAT" = design ] || [ "$WHAT" = all ]; then
  node "$SIM" --seed=$DESIGN --n-extreme=60 --n-ordinary=20 --speed-arms=$ARMS --self-r=$SELF --out="$OUT/design.json"
fi
if [ "$WHAT" = held ] || [ "$WHAT" = all ]; then
  node "$SIM" --seed=$HELD --speed-arms=$ARMS --self-r=$SELF --out="$OUT/held.json" &
  node "$SIM" --seed=$HELD --quick=1 --finish=1 --jit=1 --final=1 --out="$OUT/rule.json" &
  wait
fi
run() { name="$1"; shift
  node "$SIM" --seed=$HELD --speed-arms=$ARMS --self-r=$SELF "$@" --out="$OUT/v-$name.json"
  node "$SIM" --seed=$HELD --quick=1 --finish=1 --jit=1 --final=1 "$@" --out="$OUT/vr-$name.json"
}
if [ "$WHAT" = variants ] || [ "$WHAT" = all ]; then
  # how much learners already know, every arm; hierarchy in what they know, every arm
  run prior-none --prior-none=1 &
  run prior-1 --prior-add=-1 &
  run prior+1 --prior-add=1 &
  run prior+2 --prior-add=2 &
  run prior+3 --prior-add=3 &
  run hier0.5 --hier=0.5 &
  wait
  run hier1 --hier=1 &
  run hier1prior+1 --hier=1 --prior-add=1 &
  # seconds per item: every arm. 12 s is near the one real learner's logged answers (8 s median, feedback not included)
  run item12 --item-s=12 --wrong-s=12 --retry-s=12 &
  run item20 --item-s=20 --wrong-s=15 --retry-s=20 &
  # a two-skill item saves nothing, or a quarter
  run compC1 --composite-c=1 &
  run compC0.75 --composite-c=0.75 &
  wait
  # what you would have to believe (never a headline): Savant's rate per practice, and memory growth per spaced right answer
  run gain2 --speed-gain=2 &
  run gain3 --speed-gain=3 &
  run gain5 --speed-gain=5 &
  run gain10 --speed-gain=10 &
  run mem1.5 --mem-gain=1.5 &
  run mem2 --mem-gain=2 &
  wait
  run gain3mem2 --speed-gain=3 --mem-gain=2 &
  run gain5mem2 --speed-gain=5 --mem-gain=2 &
  run gain5mem3 --speed-gain=5 --mem-gain=3 &
  run gain10mem3 --speed-gain=10 --mem-gain=3 &
  run item12gain3mem2 --item-s=12 --wrong-s=12 --retry-s=12 --speed-gain=3 --mem-gain=2 &
  run item12gain2 --item-s=12 --wrong-s=12 --retry-s=12 --speed-gain=2 &
  wait
fi
