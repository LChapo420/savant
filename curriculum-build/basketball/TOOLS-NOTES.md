# Basketball tools: working notes (basketball agent, 2026-10-21)

Rules: `curriculum-build/PARALLEL-AGENTS.md`. Database `data/parallel/basketball.db.json`, port 6803.
The subject's README (how the curriculum was made) is outside the app, in
`C:\coding\claudecommittdIq\folderThing\curriculum-build\basketball\README.md`.

## Part A: level 696, "Drive and Kick to the Open Spot" (basketball_junior_club_player, ages 10-12)

Generations used: 3 of 5 (runs 1-3: 627 s, 582 s, 491 s). Saved copies of each run's plan row are in the session
scratchpad (`bb/run0.json` = the first run from before today's fixes, `bb/run1.json`, ...).

### Run 1 (fixes from the lead live: choices as objects, check repair, "they" note, shot-log note)
- Worked: no JSON choices, no gendered pronouns, both "play" checks kept, shot-log prompt in scope.
- Code-catchable errors found (now caught by `services/basketball-checks.js`):
  - every "wing" and "corner" shooter drawn inside the arc (o3 at (6, 6), o4 at (13, 15), o5 at (37, 15));
  - block 7 and check c2: "attack the gap to the left" while o1 moves right; "weak-side help" from d5 on the ball's side;
  - warm-up 270 s with no clear landing practice; shot log without `shots` although the prompt says 10.
- Judgment-only errors (no code can see them):
  - check c2 is the same play as Basketball_Play block 7 (answer already revealed); check c3 is the
    block 6 question reworded. Needs a pipeline check (recommendation in the report).
  - Concept_FlowDiagram start node says "Pick your dribble up at the edge of the paint": wrong advice for a drive.
  - check c4 ("how many metres apart", 4) is a coaching convention filed under bb_rules, and its answer is in block 2's text.
  - The age band reaches the prompt as "[Insert Target Age Range ...]" (shared `ageRangeForBand` reads no age from
    basketball grade names). Worked around in the BASKETBALL fill note with an ages-by-grade line.

### Run 0 (first run, before the lead's fixes): judged
- Basketball_Play: o3 "in the corner" at (6, 6) is inside the arc (corner threes are x <= 3). Caught now.
- Travelling check: key says lifting the pivot foot before a pass is travelling. False under FIBA Art. 25 and
  NBA Rule 10: lifting to pass or shoot is legal; it is a travel if lifted before the dribble starts or if it
  comes back down before the release; sliding/dragging it is a travel. Caught now (false-claim list + slide/lift mismatch).
- Trap_CommonError keyed choice 0 ("pick up the dribble in the lane") which is the error itself. Judgment only.
- Interact_MultipleChoice asked two questions with options for one; "low defender on your side" is not the
  usual first helper on a baseline drive (that is the weak-side low man). Judgment only.

### Code added
- `services/basketball-checks.js`: `playProblems` (named players exist, moves <= 22 ft per frame, ball with the
  offence at the pause, "You are oN" has the ball, corner/wing/three spots vs the drawing, drive left/right vs
  movement, weak/strong side vs the ball, the outcome passes to the answer's player, the answer's player is not
  covered while another option's is free), `ruleProblems` (short list of known-false rules claims),
  `pronounProblem`, `shotLogProblems`, `sessionProblems`, duplicate option labels refused, frames/options as
  JSON strings read. `blockProblems` runs the rules list on every block's text (the patterns only match
  basketball rules wording) and the rest on Basketball_* blocks.
- `services/block-levels.js` (shared; my parts only): BASKETBALL_FILL_NOTE (ages, spots, sides, rules facts,
  session warm-up, shot-log count); `cleanCheck` passes the skill to `cleanPlayCheck` and refuses a `bb_*`
  check whose words fail; `whyRefused` play branch lists every play problem, and `bb_*` word problems.
- Tests: `scripts/basketball-items-test.js` section "what GLM wrote for level 696, caught".

### Run 2 (582 s): judged
- Good: shooters behind the arc, warm-up 330 s with landing, block 4 play right. One play check dropped by MY
  false positive ("driving from the left wing" read as a direction): fixed, with a test.
- Check c1: "a low defender steps up" but no defender moves to the driver: now caught (helper rule).
- Judgment only: Basketball_Film protocol has cones that "step up"; FlowDiagram has an orphan "finish" node;
  check c4 is a vague phrase type_in ("best shot result of a kick-out"); c3 repeats the Trap block.

### Run 3 (491 s): judged, kept as the final version (plan id 108)
- Blocks: Session (warm-up 315 s incl. jump-and-land, 5 drills 18 min, both hands), Hook_Dilemma,
  Theory_RuleCard, Concept_FlowDiagram, Basketball_Play (help from the right corner, kick to o2 in the
  corner: key right), Basketball_ShotLog (10 shots), Theory_ContrastSplit, Trap_CommonError, Memory_CheatSheet.
- Checks: c1 play (drive left, d5 helps off the left wing, kick to o5: key right), c2 MC (firm low pass off
  the live dribble: right, but restates block 6), c3 type_in (70% - 40% = 30 points: right).
- Judgment-only errors left: FlowDiagram yes/no labels do not match its questions ("Is the gap open? no ->
  the rim is open"); RuleCard "looking at the floor" (means up the floor); CheatSheet "cold shooter" (slang
  for a shooter who is missing); Trap distractor "pass back to your own defender"; Trap standardTag shows
  the skill id "bb_tactics"; ShotLog's "4 of 10 you would expect on contested drives" is an invented benchmark.

### In the app (port 6803, my DB)
- Test learners 6676 and 6677 (local accounts made through /register; credentials only in the session
  scratchpad). 6676 enrolled through /api/enrollments, then status and current_level 696 set in my DB.
- All 12 sections render; court.js and tracking.js load first; no console errors.
- Session: health gate, warm-up timer counts down, 5 warm-ups, 5 drills with cue and "something hurts",
  effort and enjoyment logged. Play: animates to the pause, "Right read." plus explanation, plays to the end
  in a hidden pane. ShotLog: corner make + paint miss -> 1/2, FG 50%, eFG 75%, zones right.
- Check_Play through the server: 6676 picked "Kick to o2 on the right wing" -> wrong, key shown; 6677 picked
  "Kick to o5 on the left wing" -> right (that click was scripted: the hidden pane refused pointer input).
  Typed (30) and choice right. Finish: "2 of 3 checks right, now on level 697".

## Part B: camera tools (built and tested)

Files (all mine): `public/engine/basketball/tracking.js` (pure maths, UMD), `camera-blocks.js` (the two
blocks), `demo-sim.js` (testbed-only simulated camera), `demo.html`/`demo.js` (both blocks added, plus a
"simulator truth" panel), `basketball-blocks.js` (health gate, stop messages and stat tiles shared through
`window.PolymathBball`; the shot log now uses `shotStats`), `scripts/basketball-tracking-test.js` (46 checks).

- tracking.js: `homography` (4+ taps: normalised DLT, least squares above 4; 3 taps affine; 2 similarity;
  refuses taps on one spot or in a line), `toCourt`, `LANDMARKS`, `createBackground` (slow average; still
  pixels absorbed fast), `findBall` (orange + changed from the learned scene + changed since the previous
  frame; static orange floor and rim set aside), `findMover` (largest changed body that also moved; feet =
  middle of its lowest cell row), `createRimJudge` (above the rim near it, then down through the rim's height:
  inside the edges = make, outside = miss, lost = "not sure"; cooldown against double counts), `zoneOf`,
  `shotStats` (FG%, eFG%, zones, unplaced, undecided), `motionIn`, `createRound` (timed targets, reactions, score).
- Basketball_ShotTracker: privacy and under-13 note; "Use the camera" or log by hand on the court; setup taps
  the rim's edges then 2-4 landmarks shown on a small court ("I cannot see that one", "That is all I can see");
  live view with rim line, ball ring, feet dot; every shot listed "estimated" with Made / Missed / Place /
  Remove; stats as the shot log; an honest accuracy paragraph.
- Basketball_HandleDrill: health gate, warm-up, privacy note; front camera (mirrored) with 5 high targets,
  hit = the middle 60% of the lit circle 25% filled by something new (not orange) for 2 frames; or tap mode on
  a 3x3 pad; rounds, rest prompt, per-round and final results, "Stop: something hurts" stops the loop.
- Registered in BASKETBALL_BLOCKS with schemas; publicPlan loads court.js, tracking.js, and camera-blocks.js
  after basketball-blocks.js; layout and fill notes say when to use them; `blockProblems` checks both.

Bugs found by testing in the browser and fixed, each with a test: a still patch of floor a player walked off
taken for the ball (findBall now needs frame-to-frame change); shot spots taken from the shooter's previous
spot (same fix in findMover); drill never scoring (hand too small for the 0.3 motion share of the whole
circle: now presence in the inner circle against the learned scene); feet a cell too low (+1.5-2 ft).
Also: my own tap coordinates were wrong at first (the pane's screenshot scale is 1.917, not 2), which looked
like a tracker bug until logged.

Measured on the simulated camera (320 px picture, whole half court in view, exact taps): make/miss 12 of 12
twice; spots 0.2-0.6 ft off for the 10 of 12 shots placed; the far corner shooter (7 px wide) is never placed
(the learner places it); free-throw-line shots can fall either side of the paint line. Drill: 13 hits, 1
miss per 20 s round, reaction 0.81 s (the simulator's own pause); tap mode exact. Real phone video has not
been tried: lighting, blur, net and other people will make it worse. The UI says so.

Detectors not added (no weights on npm): `@tensorflow-models/coco-ssd` 2.2.3 (Apache-2.0, 268 KB, loads
https://storage.googleapis.com/tfjs-models/savedmodel/... at run time), `@tensorflow-models/pose-detection`
2.1.3 (Apache-2.0, 1.5 MB; MoveNet from https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4,
Apache-2.0, a few MB, not downloaded so not measured), `@mediapipe/tasks-vision` 1.1.1 (Apache-2.0, 42 MB of
wasm; .task models from storage.googleapis.com).

## Recommendations for shared code (not made: they touch every subject)
- Pass the track to `blockProblems` in `write()` so basketball can hold generic blocks (Hook_Dilemma,
  Theory_RuleCard ...) to "they": `basketballChecks.blockProblems(b.block, data)` ->
  `basketballChecks.blockProblems(b.block, data, trackId)` at both call sites.
- Refuse a check that restates a block of the same plan (same prompt words, or a Check_Play with the same
  frames as a Basketball_Play): needs the blocks in the check step of `write()`.
- `levelContext` sends "[Insert Target Age Range ...]" for grades whose names carry no age (all of basketball):
  an `age` field per grade in config would fix it for every subject (worked around in my note).
- `whyRefused` multiple-choice branch reads choice objects as "[object Object]": run choices through
  `choiceObject`/`choiceText` first, as `cleanCheck` does.
- A generic Concept_FlowDiagram check: every node reached, and a condition's yes/no edges labelled yes/no.
- `data/base-levels-report.json` is written by every agent's generation run; per-DB_FILE report names would stop the overwrites.

## Left to do / open
- Try both camera tools on a real phone and hoop; tune CHANGE (60), the background rates and the drill share.
- Two generations of the budget are unused.

## Part C: body tracking and a first real-video check (2026-10-23)

- `public/engine/basketball/pose.js`: MediaPipe Pose Landmarker lite (Apache-2.0), self-hosted in
  `public/vendor/mediapipe/` (tasks-vision 0.10.21 + `pose_landmarker_lite.task`, 25 MB; NOTICE.txt there).
  Loaded only when a camera block is on the page; runs on the device; no outside host.
- `tracking.js` (pure, tested): `poseFeet`, `poseWrists`, `poseHeight`, `poseHips`, `pickShooter`,
  `createShooterTracker` (the body holding the ball stays the shooter), `shooterFeetAt` (the body with a hand up
  at the release), `releaseFromArm` (the moment the shooter's hand is highest), `releaseFromPose` (last moment the
  ball was in reach of a wrist), `jointAngle`, `wristIn`. 8 new checks in `scripts/basketball-tracking-test.js`.
- `camera-blocks.js`: ShotTracker uses the body for the release and the feet when pose runs, falls back to
  motion; the ball is looked for near the shooter's hands when it has not been seen lately; the body model runs
  at most every 60 ms and less often on a slow device. HandleDrill: a hit is a wrist in the inner circle.
- **Blocked by the page policy (not changed here):** `script-src 'self'` has no `'wasm-unsafe-eval'`, so Chrome
  refuses to compile MediaPipe's WebAssembly on every page; on `/engine/basketball/*` `connect-src` (/api/ only)
  also blocks fetching the model. Verified on a local server: pose.js reports "off" and the tools use motion.
  Turning it on needs `'wasm-unsafe-eval'` in script-src and `/vendor/mediapipe/` in connect-src for the camera
  pages (`middleware/security.js`, the consent agent's file): an owner decision.
- Real video: `scripts/basketball-video-eval.js` (+ `scripts/basketball-pose-dump.js`, headless Chrome) on 11 shots
  from openly licensed Commons clips, labelled by hand in `curriculum-build/skill-apps-bench/basketball-labels.json`.
  None was filmed the way the app asks (camera follows the player; rims tiny or out of the picture).
  - Shot finding (unchanged by pose): 3 of 11 found, 0 false; the one labelled make (a game free throw, rim 28 px) not found.
  - Feet at the shot, median error: motion 20.6 px (3/11 within 10 px) -> body 4.9 px (8/11). Bodies 46-107 px tall.
  - Release time, median error: ball rise 547 ms (1/11 within 100 ms) -> highest hand 67 ms (8/11).
  - Pose cost on this laptop with the CPU at 100% from other jobs: 174-183 ms a frame (CPU), 67 ms (GPU) in
    headless Chrome. Phones still to be measured (plan B2).
