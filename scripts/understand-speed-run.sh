#!/bin/bash
# usage: run.sh NAME SEED NLEARN SHARDSIZE flags...
NAME=$1; SEED=$2; N=$3; SZ=$4; shift 4
cd C:/coding/savant-wt/understand-speed
i=0
while [ $i -lt $N ]; do
  ids=$(seq -s, $i $((i+SZ-1 < N-1 ? i+SZ-1 : N-1)))
  node scripts/scorecard-recovery-sim.js --modes=off --learning=v2 --levels=100 --population=30 --truth-factors=1 --extreme=1 --extreme-share=$XS --learners=$N --seed=$SEED --only=$ids --write --out=_us/$NAME --name=s$i "$@" > _us/$NAME-s$i.log 2>&1 &
  i=$((i+SZ))
done
wait
echo finished $NAME > _us/$NAME.done
