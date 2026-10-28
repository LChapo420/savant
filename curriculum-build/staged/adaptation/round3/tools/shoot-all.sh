# Every round-3 screen at 1280 and 375 px, in order (the flows change server state).
S=/c/Users/admin/AppData/Local/Temp/claude/C--coding-claudecommittdIq-folderThing/b8206e34-7709-469e-8326-7a732d82d175/scratchpad
cd $S
E1=$1; E2=$2; E3=$3; E4=$4; E5=$5
node shot.js "/login" - login who=r3 | tail -1
for w in 1280 375; do
  node shot.js "/path?enrollment=$E1" r3-shots/01-path-review-node-$w.png w=$w wait=3000 eval="document.querySelector('.node-review').scrollIntoView({block:'center'})" | tail -1
  node shot.js "/review?enrollment=$E1" r3-shots/02-review-overview-$w.png w=$w full wait=2500 | tail -1
done
node shot.js "/review?enrollment=$E1" - wait=2500 pre=r3tools/snap2.js eval="$(cat r3tools/ev-review.js)" after=1000 | tail -2
for w in 1280 375; do
  node shot.js "/path?enrollment=$E2" r3-shots/06-consolidation-path-$w.png w=$w h=1100 wait=3000 | tail -1
  node shot.js "/session?enrollment=$E2" r3-shots/07-consolidation-final-waits-$w.png w=$w wait=3000 | tail -1
  node shot.js "/help?enrollment=$E3" r3-shots/08-remediation-help-$w.png w=$w full wait=3000 | tail -1
done
node shot.js "/session?enrollment=$E4" - wait=500 pre=r3tools/snap2.js eval="$(cat r3tools/ev-held.js)" after=500 | tail -1
for w in 1280 375; do
  node shot.js "/held?enrollment=$E4" r3-shots/10-held-page-$w.png w=$w full wait=3000 | tail -1
  node shot.js "/path?enrollment=$E4" r3-shots/10b-held-path-$w.png w=$w h=1000 wait=3000 | tail -1
done
node shot.js "/session?enrollment=$E5" - wait=300 pre=r3tools/snap2.js eval="$(cat r3tools/ev-fast.js)" after=500 | tail -1
