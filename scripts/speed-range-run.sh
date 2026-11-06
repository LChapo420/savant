#!/usr/bin/env bash
# Round 3 of the 4x measure (docs/SPEED-4X.md; SIMULATED, no model calls): every new lever across its published range, on seed 20261111, against every baseline, at two cost sets.
#   audited: 7-minute page, 35 s item (the model as audited).
#   logged:  2.5-minute page (median 420 words at 150 to 238 words a minute, from a database copy), 15 s item, 12 s feedback, 15 s retry (one real account's median is about 8 s; 15 s is a cautious guess, not a measurement).
# usage: speed-range-run.sh OUT
OUT="$1"; mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SIM="$ROOT/scripts/faster-by-goal-sim.js"
HELD=20261111; DESIGN=777002; COMMON="--finish=1 --jit=1 --final=1"
SELF=1.1,1.15,1.2,1.25,1.3,1.4,1.5,1.75,2
AUDITED=""; LOGGED="--lesson=0.36 --item-s=15 --wrong-s=12 --retry-s=15"
R='review=through:margin=0.15:endMargin=0.05'
NONE="testout=0:appN=1"; F="fast=1:appN=1"; M="stop=1:fast=1:appN=1"; W="worked=1:fast=1:appN=1"; Q="quick=1:fast=1:appN=1"; WQ="worked=1:quick=1:fast=1:appN=1"; MWQ="stop=1:worked=1:quick=1:fast=1:appN=1"
ALL="testout=1:short=1:stop=1:$R:worked=1:quick=1:fast=1:appN=1"
ARMS="$NONE,$F,$M,$W,$Q,$WQ,$MWQ,$ALL"
base() { node "$SIM" --seed=$1 --n-extreme=$2 --n-ordinary=$3 $COMMON --students=1 --self-r=$SELF $5 $6 $7 $8 --out="$OUT/$4.json"; }
# baselines: each cost set, plus the reading half-life at both ends
base $DESIGN 60 20 base-design $AUDITED & base $HELD 120 40 base-h1 $AUDITED &
base $DESIGN 60 20 cost-design $LOGGED & base $HELD 120 40 cost-h1 $LOGGED &
base $DESIGN 60 20 readhi-design --read-h=7 & base $HELD 120 40 readhi-h1 --read-h=7 &
base $DESIGN 60 20 readlo-design --read-h=1.6 & base $HELD 120 40 readlo-h1 --read-h=1.6 &
base $DESIGN 60 20 costhi-design --read-h=7 $LOGGED & base $HELD 120 40 costhi-h1 --read-h=7 $LOGGED &
wait
# arms: low (the levers hardly work, no credit for pretesting or interleaving), mid, high, each from the published ranges and scripts/speed-calibrate.js
arm() { mkdir -p "$OUT/$1"; node "$SIM" --seed=$HELD $COMMON --quick=1 --speed-arms="$ARMS" $2 $3 $4 $5 $6 $7 $8 $9 ${10} --out="$OUT/$1/arms.json"; }
LOW="--we-s=35 --we-gain=0.5 --quick-s=25"; MID="--we-s=26 --we-gain=0.75 --quick-s=15 --pre-gain=1.2 --ilv-h=1.1"; HIGH="--we-s=20 --we-gain=1 --quick-s=10 --pre-gain=1.35 --ilv-h=1.2"
arm audited-low $LOW & arm audited-mid $MID & arm audited-high $HIGH &
wait
# at logged costs an item is 15 s, so the new levers' seconds scale with it: an example 15, 11, 8 s; a one-tap review 15, 9, 6 s
LLOW="--we-s=15 --we-gain=0.5 --quick-s=15"; LMID="--we-s=11 --we-gain=0.75 --quick-s=9 --pre-gain=1.2 --ilv-h=1.1"; LHIGH="--we-s=8 --we-gain=1 --quick-s=6 --pre-gain=1.35 --ilv-h=1.2"
arm logged-low $LLOW $LOGGED & arm logged-mid $LMID $LOGGED & arm logged-high $LHIGH $LOGGED &
wait
