# Every skills round 3 screen at 1280 and 375 px, in order (the flows change server state).
# bash shoot-all.sh <chess> <piano> <basketball> <held>
S=/c/Users/admin/AppData/Local/Temp/claude/C--coding-claudecommittdIq-folderThing/b8206e34-7709-469e-8326-7a732d82d175/scratchpad
cd $S
E1=$1; E2=$2; E3=$3; E4=$4
node shot.js "/login" - login who=sk3 2>&1 | tail -1
for w in 1280 375; do
  node shot.js "/path?enrollment=$E1" sk3-shots/01-path-stage-rows-$w.png w=$w wait=3500 eval="document.querySelector('.skill-stage').scrollIntoView({block:'center'})" | tail -1
  node shot.js "/stage-check?enrollment=$E1" sk3-shots/02-stage-check-overview-$w.png w=$w full wait=3000 | tail -1
  node shot.js "/skill-practice?enrollment=$E2" sk3-shots/05-practice-plan-$w.png w=$w full wait=3000 | tail -1
  node shot.js "/stage-check?enrollment=$E2" sk3-shots/08-piano-check-before-final-$w.png w=$w full wait=3000 | tail -1
  node shot.js "/stage-left?enrollment=$E4" sk3-shots/11-stage-left-held-$w.png w=$w full wait=3000 | tail -1
  node shot.js "/path?enrollment=$E4" sk3-shots/12-path-held-$w.png w=$w wait=3500 eval="document.querySelector('.skill-stage').scrollIntoView({block:'center'})" | tail -1
done
node shot.js "/stage-check?enrollment=$E1" - wait=3000 pre=sk3/tools/snap2.js eval="$(cat sk3/tools/ev-sit.js)" after=1000 | tail -2
node shot.js "/skill-practice?enrollment=$E2" - wait=3000 pre=sk3/tools/snap2.js eval="$(cat sk3/tools/ev-practice.js)" after=800 | tail -2
node shot.js "/stage-check?enrollment=$E3" - wait=3000 pre=sk3/tools/snap2.js eval="$(cat sk3/tools/ev-count.js)" after=800 | tail -2
