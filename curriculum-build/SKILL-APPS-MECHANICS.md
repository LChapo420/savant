# Skill-app mechanics: basketball, piano, chess

> **Web references re-checked 2026-10-25:** 54 links: 52 verified, 1 changed (Ultralytics /request-license now redirects to /license), 1 dead and replaced (ShotTracker, now shottracker.com/faq). Quotes and URLs: `FACT-REVERIFY-2026-10-25.md`.

Research and planning only, done 2026-10-22 by agent 2 of `NEXT-AGENTS-AFTER-RESET.md`. No app code was changed.

**What this covers**
- The mechanics of the leading apps, studied from public sources only.
- How each mechanic maps onto what Savant already has.
- Original local implementations built on open, free tech, with their licences.
- Accuracy and latency evidence for those implementations.
- A prioritised build plan per subject, and how to verify each piece.
- The decisions the owner needs to make.

**Rules followed**
- Nothing was decompiled, downloaded, extracted or copied from any app.
- Sources were limited to app-store listings, official help pages and blogs, papers, patents (read to understand the method, not to copy it), press and reviews.
- No model, dataset or engine was downloaded. Every measurement below was run on code already in the repo, using synthetic inputs.

**Evidence tags**

| Tag | Meaning |
|---|---|
| **[V]** | Page opened this session; URL given. |
| **[S]** | Search-result summary only; the page was not opened (or returned 403). |
| **[P]** | From Savant's own earlier research files in `../curriculum-build/<subject>/research/03-apps-sequencing-pacing.md`, which carry their own sources. |
| **[L]** | Measured locally this session. Scripts are in `curriculum-build/skill-apps-bench/`. |
| **[R]** | Our recommendation or inference. |

---

## 0. The short version

| Subject | What the market does well | What Savant already matches | Biggest missing pieces, in build order |
|---|---|---|---|
| Basketball | Phone-camera make/miss and shot location (HomeCourt), body metrics (HomeCourt Shot Science), arc and depth (Noah / Hoops), decision film (HooperIQ) | Court homography from taps; colour-and-motion ball finder; rim make/miss judge; shot chart with FG%/eFG%; play-reading quizzes; hand-target drill. All validated **only on a simulator**. | (1) A real-video test set, plus tuning of the existing tracker. (2) MediaPipe Pose (Apache-2.0) for feet, release and form. (3) A learned ball detector (Apache-2.0 model, our own labels). (4) Arc and release angle. (5) Dribble counting by sound and pose. |
| Piano | Wait mode, then tempo mode, loop and slow-down (Flowkey, Piano Marvel, Synthesia); microphone recognition with chords (Simply Piano); MIDI exactness | MIDI in (velocity and pedal captured); single-note microphone input (YIN); learn/play modes, speed, hands, count-in, stars; falling notes plus staff; jam over a band; ear echo | (1) **Chords from the microphone are wrong today** (see 2.4). Fix it with a score-informed "expected notes" verifier. (2) Sample-accurate onsets in an AudioWorklet. (3) Auto-loop of hotspots. (4) Dynamics and pedal grading over MIDI, which no app does. (5) Hand posture with MediaPipe Hands. |
| Chess | Spaced-repetition move training (Chessable), huge rated puzzle pools (Lichess, CC0), game review with Retry (Chess.com), stars within a move par (Lichess Learn), human-like bots (Maia) | Board, rules (perft-tested), bot with strength 1-10, exhaustive mate solver, Glicko-2 rated puzzles and rush, guided lessons with a hint ladder, game review with Retry | (1) A MoveTrainer-style SRS for lines and patterns. (2) The Lichess CC0 puzzle import (plan already written). (3) A stronger analysis engine (owner decision: GPL). (4) Endgame tablebases (our own KPK/KRK/KQK). (5) Coordinates and visualisation drills. (6) Puzzles generated from the learner's own games. |

Three findings from this session matter more than the rest:

1. **The piano microphone path turns a C major triad into a phantom C2** (clarity 0.89, above the 0.7 acceptance threshold) [L]. A chord played into the microphone is therefore graded wrong or mis-reported. A 0.5-1 ms/frame verifier prototype accepted 50/50 right triads and rejected 50/50 one-semitone slips on synthetic piano tones [L]. Details are in 2.4.
2. **Spotify Basic Pitch is not the right model for grading piano.** Its own paper reports a MAESTRO note F-measure of 70.9%, against 95.2% for the piano-specific Onsets and Frames [V]. Use a score-informed verifier for live grading, and a piano-specific transcriber (ByteDance, Apache-2.0, 96.72% onset F1 [S]) only for offline "what did I play" analysis.
3. **Licences and patents.** Ultralytics YOLO is AGPL-3.0, including the weights you train yourself [S]. Maia-3 and Viridithas 21+ are AGPL [V]. Stockfish is GPL-3.0 [S]. NEX Team (HomeCourt) holds US patents on phone-camera ball-game analytics, priority 2017, expiring about 2038 [V]. JoyTunes/Simply holds US11893898 on adaptive instrument teaching [V]. Section 5 lists the owner's decisions.

---

## 1. Basketball

### 1.1 Mechanics and feature matrix

The first table covers the camera apps. Y = has it; – = does not; ? = not found in public sources.

| Mechanic | HomeCourt (NEX Team) | ShotTracker | Hoops (Pillar Vision) / Noah | HoopCoach AI | DribbleUp | Sources |
|---|---|---|---|---|---|---|
| Hardware needed | Phone/tablet on a tripod only | Gym install: ceiling anchors, a player sensor, a sensor ball | Phone app (Hoops); Noah uses a fixed sensor about 13 ft above the rim | Phone, with uploaded clips | Sensor-free "smart" ball plus a phone stand | [V] HomeCourt App Store; [S] shottracker.com/faq; [S] Hoops App Store; [P] |
| Camera setup | Tripod about 3-5 ft high at the sideline near half court; the shooter, backboard and full 3-point line in view; good light, a net, one shooter | n/a | ? | Upload a clip of a jumper, free throw or layup | Phone on a stand facing the player | [S] help.homecourt.ai setup article; [V] homecourt.ai/in-app/gettingstarted (via search) |
| Makes and misses, live | Y (real time), with a shot-by-shot video afterwards | Y (sensors) | Y (verbal) | – | – | [V] App Store; [S] |
| Shot location / chart | Y; can count 3-point tries with no painted line if the rim and free-throw line are visible | Y (3D position, about 120 calculations/s) | Y | – | – | [S] homecourt.ai/faq-old; [P] |
| Method (from the NEX patent) | Find the hoop (neural net, weighted to frame centre) → region of interest → detect the ball and link a 2D trajectory → attempt = the ball moving downward in the shot region → make/miss from net-area pixel change plus the ball path → backtrack about 2 s to find the shooter → feet projected to the court via a fitted camera model | Radio location | Optical ball flight | Pose on the clip | Ball-pattern tracking | [V] US10489656B2 (Google Patents) |
| Body / form metrics | "Shot Science": release time, release angle (arc), leg angle while loading, speed before the shot, vertical jump | – | – | Elbow alignment, follow-through, release angle | – | [S] SportsBusinessDaily 2018-10-18; [S] HoopCoach App Store |
| Ball-flight metrics | Release angle | – | Entry angle, depth, left/right; Noah targets 45° entry and 11 in deep; instant voice | – | – | [P] noahbasketball.com |
| Dribble tracking | Dribble speed and height; real-time audio alerts when dribbles are too high, low or wide; AR targets to tap while dribbling | – | – | – | Counts dribbles, checks the drill pattern | [V] App Store; [S] press; [P] |
| Gamification | AR targets, points, badges, Battle Mode (time-shifted head-to-head), virtual teams, leaderboards, NBA challenges | Team stats | Splash Meter (facilities) | ? | Class streaks | [V] App Store |
| Programs | 100+ free drills; HomeCourt+ adds a training programme and skill ratings | Coach assigns | Coach-led | Weekly plans, chat coach | Class library | [V] App Store; [S] |
| Human feedback | Pro trainer feedback requests, discontinued in v3.34 (Jan 2022) | – | – | – | – | [V] App Store |
| Top complaints | Miscounts without a tripod; heat and battery; ~1.3 GB per 30-min session; moving paywall; leaderboard cheating | Install cost | Hardware cost | New, few reviews | Auto-renewal | [P] |

The decision and coaching apps sit outside the camera matrix:
- **HooperIQ:** NBA clips pause, the learner predicts the read, and the reads come back on spaced repetition; XP and streaks [P].
- **Onform / CoachNow:** coach voice-over on uploaded clips, side-by-side, slow motion, and a pose skeleton [P].

### 1.2 Mapping to Savant

Code: `public/engine/basketball/*`, `content/basketball-items.js`; notes in `curriculum-build/basketball/TOOLS-NOTES.md`.

| Mechanic | Savant today | Gap |
|---|---|---|
| Court calibration | `tracking.homography`: 4+ taps (normalised DLT), 3 affine, 2 similarity; landmark picker | No automatic rim or court-line finding (HomeCourt detects them). Taps work, but take about 30 s of setup [R]. |
| Ball detection | `findBall`: orange hue + change from a learned background + change since the previous frame | Colour heuristics break with orange clothing, dusk, outdoor light and motion blur. Never tried on real video. |
| Shooter / feet | `findMover`: largest changed body that also moved; feet = middle of its lowest cell row | Two players, or a parent near the shooter, break it. Pose would give real ankles. |
| Make/miss | `createRimJudge`: above the rim near it, then down through the rim height; inside the edges = make; cooldown | No net-motion cue (the patent uses one). Simulator only: 12/12 makes and misses [P TOOLS-NOTES]. |
| Shot location → zones → FG%, eFG% | `zoneOf`, `shotStats`; learner can edit each shot | Done. The far corner shooter (7 px) is never placed [P]. |
| Form metrics (release time, knee bend, elbow, follow-through, vertical) | – | Missing; needs pose. |
| Arc / entry angle / depth | – | Missing; needs a side-on view plus a trajectory fit. |
| Dribble count / height / speed | – (`Basketball_HandleDrill` scores hand hits on targets with the front camera) | Missing. |
| AR target drill | `Basketball_HandleDrill`: 5 targets, hits by presence in the inner circle; tap mode | Done, with a heuristic. Pose wrists would be more robust. |
| Decision training | `Basketball_Play` / `Check_Play` on the SVG court, server-graded; `services/basketball-checks.js` | Done. Missing: spaced re-serving of missed reads (HooperIQ), and "read, then perform it" links to drills. |
| Session / programme | `Basketball_Session`: health gate, warm-up, timed drills, effort/pain/enjoyment | Done. |
| Film and self-review | `Basketball_Film`: protocol, rubric, clip stays on the device | No pose overlay or side-by-side with a model. |
| Competition | – | Bracketed challenges later (social is "later" in PRODUCT-DECISIONS). |
| Privacy | On-device only, under-13 note | Keep it: every proposal below runs in the browser. |

### 1.3 Proposed local implementations

All of these run in the browser on the learner's device: no API, no upload. The owner said "photo/video upload with AI critique" is allowed, but on-device keeps minors' video off our servers [R].

| Component | Proposal | Licence | Accuracy / latency evidence | Notes |
|---|---|---|---|---|
| Pose (feet, wrists, elbows, knees) | **MediaPipe Tasks Vision Pose Landmarker**, lite or full; 33 landmarks plus world coordinates; detector input 224², landmarker input 256² | Library Apache-2.0 [P]. Google's BlazePose/GHUM model card says "Apache License, Version 2.0" [S] | Per frame: lite 20 ms, full 25 ms, heavy 53 ms on a Pixel 3 GPU; on a 2017 MacBook Pro 25 / 27 / 38 ms (older MediaPipe docs, secondary copy) [S]. Sizes: lite 10.6 MB, full 14 MB, heavy 34.9 MB (TF.js blog) [S]. PCK@0.2 on Google's AR set: Full 84.1, Lite 79.6, OpenPose 87.8 (third-party leaderboard) [S] | `@mediapipe/tasks-vision` is about 42 MB of WASM in total [P]. Self-host the `.task` files rather than loading them from storage.googleapis.com, for offline use and privacy [R]. The alternative, MoveNet Lightning (Apache-2.0), claims "30+ FPS on most modern desktops, laptops and phones" [S]; it has 17 keypoints and no hands. |
| Ball detector | **Phase A:** keep the heuristic `findBall`, gated by pose (a ball near the wrists at release; ignore orange on bodies). **Phase B:** a small detector fine-tuned on our own labelled frames: YOLOX-nano/tiny, RTMDet-tiny, RT-DETR or D-FINE (all reported Apache-2.0), or MediaPipe EfficientDet-Lite0 (COCO has "sports ball"), exported to ONNX and run with ONNX Runtime Web (MIT) on WebGPU, falling back to WASM | YOLOX/RT-DETR/D-FINE Apache-2.0 (secondary sources; check the LICENSE files) [S]. **Not Ultralytics YOLOv5/8/11:** AGPL-3.0, and Ultralytics says this "applies even if you train your own model from scratch" [S] | No trustworthy browser benchmark was found. One project reports about 15 FPS for YOLOv8 in mobile Chrome [S]; first-run warm-up is about 300 ms [S]. **Must be measured on our target phones** [R]. | Train data: our own recordings (section 1.5). Roboflow Universe datasets have mixed licences, so check each one [R]. |
| Make/miss | Keep `createRimJudge`, and add (a) a net-motion check in a small region under the rim and (b) the detector's ball track. When the cues disagree, mark the shot "not sure" and ask the learner (already supported). | Our own code | Target ≥95% agreement with hand labels on tripod clips [R] | **Patent caution:** the NEX patent family claims a similar pipeline (5) |
| Shot location | Pose ankles at the frame where the ball leaves the hands → homography → court | Our own code | Target median error ≤2 ft [R] (the simulator gave 0.2-0.6 ft [P]) | |
| Release time, knee bend, elbow, follow-through, jump height | From the pose: release frame = ball-to-wrist distance jumps; load = minimum knee angle; time = load → release; elbow alignment = shoulder-elbow-wrist vertical plane (needs a front view); vertical = hip rise (needs height calibration) | Our own code | 2D angles from one camera are view-dependent. Report "estimated", and compare only with the learner's own earlier takes from the same camera spot [R]. | HomeCourt's Shot Science measures the same family of metrics [S] |
| Arc / release angle | Parabola fit to the ball track in court-aligned coordinates (side view) → launch angle; entry angle from the descending branch | Our own code | Needs validation against hand-measured frames. Noah's 45° / 11 in are a target only, from a different sensor [P]. | Phone at the sideline, perpendicular to the shot line |
| Dribble counting | **Audio onset detection** of bounces (a dribble is a sharp transient), cross-checked with the pose wrist's vertical velocity changing sign; height = wrist peak vs hip | Our own code | Untested idea [R]. Works in poor light, and audio is cheap (sub-ms per frame). | The mic is already wired for piano (`piano-io`) |
| Hand-target drill | Replace "presence in the circle" with the pose wrist (or a MediaPipe Hand Landmarker point) inside the target | Apache-2.0 | – | Fixes the "hand too small" issue already seen [P] |
| Decision training plus SRS | Re-serve missed `Check_Play` reads on the existing spaced-review queue (`services/sessions.js` already schedules due skills) | Our own code | – | HooperIQ mechanic [P] |

### 1.4 Prioritised build plan: basketball

The order reflects learning value per unit of effort and risk [R].

1. **B0. Real-video test set and harness (prerequisite for everything else).**
   - Record about 60 short clips: 3 phone spots × 2 lights (indoor, outdoor dusk) × makes and misses from 6 zones, 1-2 players, a net and a chain net.
   - Hand-label each shot (frame of release, make/miss, x/y on the court).
   - Script `scripts/basketball-video-eval.js` to run `tracking.js` on decoded frames (ffmpeg is installed) and print agreement.
   - Learners' clips are never used without consent [R].
2. **B1. Tune the existing heuristics on B0.** Thresholds (`CHANGE` 60, background rates, drill share); net-motion cue; disagree → "not sure". *Done when:* make/miss ≥90% on tripod clips, and every miss is either flagged or editable.
3. **B2. Pose Landmarker (lite) in a Worker.** Feet for shot location, release frame, and wrist targets for the HandleDrill. *Done when:* median spot error ≤2 ft on B0; ≥15 FPS on a mid-range Android phone and an iPhone 12-class device; battery and heat checked over 20 minutes.
4. **B3. Form feedback block (`Basketball_FormCheck`).** Release time, load depth and follow-through hold, compared with the learner's own baseline. One cue at a time, linked to a fix drill. This joins "body → outcome → fix", which is gap #3 in [P].
5. **B4. Learned ball detector** (Apache model, our labels, ONNX Runtime Web). Only if B1-B2 leave make/miss below 95%.
6. **B5. Arc and entry angle** from a side view, gated behind B4.
7. **B6. Dribble counter** by audio and pose; hook it to `Basketball_HandleDrill` rounds.
8. **B7. Decision SRS:** re-serve missed reads, then a "do it" drill card.

**Verification:** run the B0 clip suite in CI-style scripts with thresholds, and keep the simulator tests (`scripts/basketball-tracking-test.js`, 46 checks). Measure frame rate and latency with `performance.now()` around each worker call on three named devices. The UI keeps saying "estimated" until B0 numbers pass.

---

## 2. Piano

### 2.1 Mechanics and feature matrix

| Mechanic | Simply Piano (JoyTunes/Simply) | Yousician | Flowkey | Skoove | Synthesia | Sources |
|---|---|---|---|---|---|---|
| Input | Mic ("MusicSense", polyphonic) or MIDI; recognition assumes A = 440 Hz; headphones advised so the app's own music is not heard | Mic; a calibration screen checks each key; a latency check (user report) | Mic or MIDI; Bluetooth MIDI on iOS only; Chrome advised on the web | Mic or MIDI | MIDI only; lit-key keyboards | [V] piano-help.hellosimply.com/…/6210583; [S] Weizmann article; [S] support.yousician.com; [S] help.flowkey.com; [V via search] Synthesia App Store |
| Recognition honesty | ? | Single notes about 85-90% on an acoustic piano; chords worse in noise [P] | Developer: mic "can sometimes be a challenge" on advanced pieces; MIDI "100% precise" [S] | MIDI more accurate [P] | n/a | |
| Notation | Scrolling notation with a guide | Colour bars → coloured sheet → plain sheet; play-head with a timing ball | Video of a pianist's hands plus scrolling notation | Sheet music from lesson 1 | Falling notes, sheet, or both | [P]; [S] Synthesia listing |
| Wait mode | ? (5-minute workouts) | **Never stops** (criticised) | Wait Mode ("waits for you to hit the right notes and chords") | Waits when you slow down | "Melody Practice" pauses until the right note | [S] flowkey; [S] Synthesia; [P] |
| Tempo / assess mode | Y | Y, with stars | Y | Listen → Learn → Play | Y | [P] |
| Loop, slow-down, hands separately | Y | Y | Loop, Slow Motion (50/75%), Select a Hand | RH → LH → HT | Loops, bookmarks, metronome, each hand | [S]; [P] |
| Finger hints | Y | Y | Video hands | Y | Finger hints with every song | [S] Synthesia |
| Paths | Soloist and Chords paths; Lead Sheet needs both; 28 courses | Basics → Level 9 | Short courses, then a song library with no path | 19 courses, 500+ lessons | None | [P] |
| Ear / theory games | ? | Timed ear games | – | Minimal | – | [P] |
| Gamification | Points, streaks | Stars, challenges, leaderboards | None | Minimal | Score | [P] |
| Adaptive content | Patent US11893898 ("adaptive and interactive teaching"; JoyTunes → Simply Ltd; priority 2020-12-02); a 2024 grant on comparing captured audio with the presented piece | ? | – | – | – | [V] Google Patents; [S] Justia snippet |
| Top complaints | Ceiling at about 1-2 years; can't see posture; scrolling hurts reading; billing | "Fails me on notes I am clearly playing right"; no look-ahead | Mic accepts wrong notes; no path | Small library | Teaches no reading | [P] |

Others worth taking from [P]:
- **Piano Marvel:** Prepare (wait) → Assess (tempo, 0-100%); Learn mode in Minced → Chopped → Whole; SASR, an adaptive sight-reading test (≥80% → harder, 3 strikes).
- **Piano Maestro:** teacher and parent dashboard.
- **ROLI Airwave:** infrared camera hand tracking, 27 joints at 90 fps; the only shipping posture feedback.

### 2.2 Mapping to Savant

Code: `public/engine/piano/*`, `content/piano-items.js`, `piano-theory.js`, `piano-songs.js`; notes in `../curriculum-build/piano/TOOLS-NOTES.md`.

| Mechanic | Savant today | Gap |
|---|---|---|
| MIDI input | `piano-io.midi`: note-on, velocity, pedal (CC64) state; exact | Done. Pedal is captured but never graded. |
| Mic, single notes | `piano-io.mic`: AnalyserNode with 4096 samples, YIN (`detectPitch`) polled every 45 ms; a note is reported after 2 equal frames, time-stamped "now - 90 ms"; re-attack by an RMS jump | Works for one note at a time. Onset timing is coarse (see 2.4). A0-G#1 is never detected (`minHz` 55) [L]. |
| Mic, chords | Not supported: YIN returns one pitch | **Wrong today** (see 2.4) |
| Latency calibration | `piano-song.js` one-time "delay check" for the mic, stored per device, subtracted in play mode | Done. Extend to output latency (`AudioContext.outputLatency`) for the count-in and backing [R]. |
| Wait mode / tempo mode | `Piano_PlayAlong` mode wait/tempo; `Piano_Song` learn/play, speed, hands, count-in, stars (learn mode and half speed earn at most 2) | Done, matching the Prepare → Assess model. |
| Falling notes → staff | `Piano_Song` falling notes or a scrolling grand staff | Missing: a planned *fade* from falling notes to staff, with metrics (gap #5 in [P]). |
| Loop and hotspot practice | – | Missing: auto-detect error hotspots → loop at 60-70% → ramp up (Piano Marvel "Minced/Chopped") [P]. |
| Ear echo | `Piano_EarEcho` | Done. |
| Jam / improvisation | `Piano_Jam` (every black key, or every white key, fits) | Done; unique among the apps [P]. |
| Timing and evenness | `scorePerformance`: timing, evenness CV, played tempo | Done. |
| Dynamics | `scorePerformance` reports velocity min/max/range (MIDI only) | Not graded against markings. No voicing (top-note balance) [R]. |
| Pedalling | Not measured | Missing: CC64 timing against harmony changes [P]. |
| Sight-reading test | – | Missing: an SASR-like adaptive test (≥80% → harder, 3 strikes; pitch and rhythm sub-scores) [P]. |
| Posture / hands | – | Missing (only ROLI has it, on its own hardware). |
| Theory items | `piano-theory.js` (spelled notes, every key) and an item bank | Done. |
| Song library | 21 public-domain songs with RH, LH and chords, checked by `piano-songs-check.js` | Grow it with the same checks. |

### 2.3 Proposed local implementations

| Component | Proposal | Licence | Accuracy / latency evidence |
|---|---|---|---|
| **Expected-notes verifier (mic, chords and melodies)** | **Score-informed**: the app knows what should be played, so it never transcribes blind. Per frame: FFT → salience per candidate MIDI note = sum of the peak magnitudes near k·f0 (k = 1-6, ±35/+45 cents for piano inharmonicity, weighted 1/√k) → a note is "present" if its salience beats both neighbouring semitones by a ratio and clears a floor relative to the frame maximum → compare with the expected set at that score position. Same idea as Benetos, Klapuri & Dixon's score-informed tutoring transcription and Klapuri's harmonic-sum salience. | Our own code | **[L]** Prototype on synthetic piano tones (inharmonic partials, decay, hammer noise, white noise up to 0.03), 4096-sample frames at 48 kHz, major and minor triads C3-C5. Ratio 1.1, floor 0.1: right chord accepted 50/50, one-semitone slip rejected 50/50 at every noise level; 0.5-0.75 ms/frame in Node. Ratio 1.3, floor 0.25: 38-41/50 accepted. Literature: score-informed tutoring transcription reached weighted F = 93% on real Disklavier recordings [S, EUSIPCO 2012]. **Real pianos and phone mics will be worse.** Section 2.5 says how to measure. |
| Single-note pitch | Keep YIN (`detectPitch`). Run it in an **AudioWorklet** with a 2048-sample hop, with time stamps from the audio clock, not `setInterval` | Our own code | **[L]** 76/76 in-range notes (A1-C8) right on synthetic tones, noise 0-0.01; at noise 0.03, 68 right, 2 octave errors (A7, C8), 6 not detected; 2.5-2.7 ms per 4096 frame in Node. |
| Onset timing | Spectral-flux onset detector in the worklet (sample-accurate audio-clock time), minus the calibrated input latency. The note is decided by the verifier or YIN; *when* it started comes from the onset. | Our own code | Today the onset error is up to about 45 ms of polling + an 85 ms window + a fixed 90 ms subtraction [L, from code]. Target ±20 ms after calibration [R]. Chrome AudioWorklet round trips of 124 ms (vs 15 ms native) were measured in 2020; `latencyHint: 0` and disabling echo cancellation lower it [S jefftk.com]. Grade timing from corrected timestamps, never from when the UI saw the note [R]. |
| Offline "what did I play?" transcription | For free play, recordings and the advanced "listening partner": the **ByteDance high-resolution piano transcription** model (onset F1 96.72% on MAESTRO vs 94.80% for Onsets and Frames; pedal onset F1 91.86%), run locally (Python on the owner's machine or a worker server), or Magenta.js Onsets and Frames in the browser (TF.js, file-based, main thread only) | ByteDance repo: Apache-2.0 per README mirrors [S]; magenta.js: Apache-2.0 [S] | Not for live grading: these are file or window models. **Basic Pitch is not recommended for piano grading**: MAESTRO note F (no offset) 70.9% vs 95.2% for Onsets and Frames; frame accuracy 37.5% vs 42.8%; only 16,782 parameters (about 11 ms hop, 22.05 kHz) [V arXiv 2203.09893]. It is fine for "hum or sing a melody" ear games (instrument-agnostic, Apache-2.0, `@spotify/basic-pitch` on npm [V]). |
| Dynamics and voicing (MIDI) | Grade the velocity contour against the score's dynamics (p < mf < f by rank, not absolute values); voicing = melody velocity minus accompaniment velocity in chords | Our own code | MIDI velocity is exact. **No reviewed app grades this** [P]. |
| Pedalling (MIDI) | CC64 down/up times against chord changes (legato pedal: up at the change, down just after it) | Our own code | Exact over MIDI [P]. |
| Hotspot loop | From `align()` errors per bar → the worst 1-2 bars → loop at 65% tempo → +10% after each clean pass → rejoin the whole piece | Our own code | Piano Marvel / Flowkey mechanic [P]. |
| Notation fade | Falling notes landing on a staff → staff with ghost notes → static staff; fade level per learner by reading accuracy | Our own code | Gap #5 [P]. |
| Adaptive sight-reading test | Generated excerpts per level (`piano-theory.js` can spell them); 20 s preview; ≥80% → harder, 3 strikes; separate pitch and rhythm sub-scores | Our own code | SASR mechanic; its norms come from about 40 readers × 1,500 pieces, which we cannot copy. We must norm our own [P]. |
| Hand posture | **MediaPipe Hand Landmarker** (21 landmarks per hand), phone beside the keyboard. A few high-value checks: wrist below the keys, flat fingers (finger-joint angles), raised shoulders (pose); flag, don't nag | Apache-2.0 [S] | Latency similar to pose-lite [S]; accuracy for piano angles unknown, so test on B0-style clips [R]. |

### 2.4 The chord bug, in detail

`piano-io.mic` accepts any YIN frame with clarity ≥ 0.7. For a C major triad (C4-E4-G4) on synthetic tones, `detectPitch` returned `{ midi: 36 (C2), cents: 11, clarity: 0.89 }` [L].
- That is the common period of the three notes (their subharmonic), a note nobody played.
- So `Check_Piano` mode "chord" and the chords in `Piano_Song` cannot pass from the microphone. Worse, the C2 is reported as if it were played.
- **Recommendation [R]:** until the verifier ships, label chord checks "MIDI or on-screen keys only" when the source is the mic, and drop YIN frames whose period matches a chord's subharmonic. A follow-up agent should reproduce this on a real piano before the fix is designed.

### 2.5 Prioritised build plan: piano

1. **P0. Test recordings and harness.**
   - Record about 300 short takes on 2-3 real pianos (an acoustic upright, a digital piano through its speakers), each with a phone and a laptop mic: single notes across the range, the 24 triads, the 21 library songs played right, and the same with planted slips (wrong note, missed note, early or late).
   - Ground truth: the digital piano's MIDI out recorded at the same time; for the acoustic, hand labels.
   - MAESTRO is CC BY-NC-SA 4.0 (non-commercial) [S], so do not use it to tune a commercial product without the owner's decision [R].
   - Script: `scripts/piano-mic-eval.js` (decode with ffmpeg → run the same worklet code in Node).
2. **P1. Expected-notes verifier plus AudioWorklet onsets** (fixes the chord bug; better timing). *Done when:* on P0, right chords accepted ≥95%, slips rejected ≥95%, onset error ≤25 ms median after calibration, on 2 phones and 1 laptop.
3. **P2. Hotspot loop and the Prepare → Assess ladder** inside `Piano_Song`. This is the practice coaching gap #8 in [P].
4. **P3. MIDI dynamics, voicing and pedal grading.** No competitor does it [P]. It is cheap, because the data is already captured.
5. **P4. Notation fade and the adaptive sight-reading test** (SASR-like), normed on our own learners.
6. **P5. Hand-posture checks** (MediaPipe Hands), opt-in, on-device.
7. **P6. Offline transcription** (ByteDance model, local Python) for free-play review and the advanced "listening partner". Lowest priority.

**Verification:** P0 recordings with MIDI ground truth; synthetic regression (`curriculum-build/skill-apps-bench/piano-mic-bench.js`); the existing `scripts/piano-items-test.js` and `piano-songs-check.js`. Latency per device is recorded by the delay check and logged anonymously (opt-in) to see the real spread [R].

---

## 3. Chess

### 3.1 Mechanics and feature matrix

| Mechanic | Chess.com (lessons, puzzles, review, bots) | Lichess | ChessKid | Chessable | Sources |
|---|---|---|---|---|---|
| Lesson format | Learn Path, 4 levels (New → Advanced), courses → lessons = explanation + interactive challenges; tiles unlock in order; 1 non-basic lesson/day free | Learn: one piece per stage, collect "stars" within a move par, arrows only on the first levels; Practice: mates → tactics → endgames | Levels Pawn → SuperKing; intro video, test questions, stars through puzzles or fast chess; a guardian sets the start level | Courses: read the comment, play the move, then the whole line | [P] support.chess.com/…/8609703; lila `ui/learn` stage list; chesskid.com lessons guide |
| Puzzles | Rated puzzles; Puzzle Rush (timed, 3 strikes) | Glicko-2: every attempt is a game against the puzzle; themed puzzles give fewer points; new puzzles volatile; themes by phase, motif, goal and length; Storm/Streak | Puzzles inside levels | Puzzles inside courses | [S] lichess forum quoting the blog; [P] |
| Puzzle supply | Proprietary | 6,157,341 puzzles, **CC0**, updated 2026-10-05; columns PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags | Proprietary | Course content | [V] database.lichess.org |
| How puzzles are made | ? | Generator: Stockfish over the Lichess game DB (python-chess) → a validator with human review (lichess-puzzler, AGPL-3.0) | ? | Authored | [V] github.com/ornicar/lichess-puzzler |
| Game review | Every move classified (Brilliant … Blunder), accuracy 0-100, coach comments, key moments, **Retry** a key position; free daily cap | Server analysis plus "learn from your mistakes" | ? | Bot play-out from any course position (250-3200) | [P] |
| Spaced repetition | – | – | – | **MoveTrainer**: 8 levels, 4 h → 1 d → 3 d → 1 wk → 2 wk → 1 mo → 3 mo → 6 mo; a mistake resets to a shorter interval; a late review can reset to level 1; **each move has its own timer** | [V] support.chess.com/…/10319322 |
| Bots | 4 tiers 250-2450, engine 250-3200, adaptive bots, 3-crown score lowered by hints and undos | Stockfish levels; Maia bots (human-like) | Kid bots | Chess.com bots | [P] |
| Engine | Komodo Dragon [P]; stockfish.js in the browser [S] | Stockfish WASM in the browser plus server analysis | ? | Chess.com | [S] |
| Opening data | Explorer | Explorer; **chess-openings** TSV (about 3,500 named lines, ECO, CC0) | – | Courses | [S] github.com/lichess-org/chess-openings |
| Evaluations | – | **lichess_db_eval**: 416,442,401 positions with Stockfish evaluations, CC0 | – | – | [V] database.lichess.org |
| Visualisation | Coordinates | Coordinate trainer, blindfold | – | – | [P] |
| Top complaints | Paywalls (20%), ads, cheating; "Show Best Move" on by default spoils Retry | Few guided lessons; no tutor | Kids outgrow it; Gold paywall | Crashes, lost progress, review debt; memorising without the *why* | [P] |

Others from [P]:
- **Aimchess:** 6-skill diagnosis vs peers; Blunder Preventer; adaptive tactics from your mistakes.
- **Dr. Wolf:** a talking coach whose hints lack the *why*.
- **Noctie:** human-like bots; puzzles from your own games.
- **CT-ART:** refutation of wrong tries.
- **Woodpecker:** repeated cycles of the same set.

### 3.2 Mapping to Savant

Code: `public/engine/chess/*`, `content/chess-*.js`, `routes/chess.js`; notes in `../curriculum-build/chess/TOOLS-NOTES.md`.

| Mechanic | Savant today | Gap |
|---|---|---|
| Board UI | `board.js`: click or drag, legal-move dots, promotion picker, keyboard and screen-reader squares, arrows, highlights | No touch test on a phone yet [P]. |
| Rules | `chess-core.js`, shared by server and browser; perft-tested (`scripts/chess-items-test.js`) | Done. |
| Guided lessons with a hint ladder | `Chess_Guided` + `teach.js` (reasons for wrong moves, "good move too") | Done; it is the CT-ART refutation mechanic. Could also *play* the refutation on the board [R]. |
| Stars within a move par (pre-readers) | `Chess_PlayOut` goals (win/mate/capture/promote/survive, `maxMoves`) | Missing: a stars-per-par score and collect-the-targets mini-games for ages 4-7. |
| Puzzles, rated | `content/chess-trainer.js`: Glicko-2 (matches Glickman's example), rated and retry, rush (3 min, 3 strikes), server-graded, no solution on the page | Done. **Pool is only 53 puzzles**. |
| Puzzle verification | `chess-solver.js`: exhaustive mate-in-n uniqueness; material puzzles best by ≥150 cp at depth 4 | Depth 4 in our engine is weak for non-mate puzzles (see 3.3). |
| Game review | `teach.reviewPly` (depth 3, +1 ply before calling an error), classes best → blunder, eval bar, "a better move was", **retry from here**, in a Web Worker | Done, but shallow: tactical misses deeper than about 3 ply go unseen. |
| Bot | `bot.js` alpha-beta + PST + quiescence, strength 1-10 by depth and slips | Fine for beginners. Strength 10 takes 5-6 s per middlegame move in Node [L]. |
| Spaced repetition of lines and patterns | Skill-level review queue (`services/sessions.js`) only | Missing: a **per-move SRS** (MoveTrainer) for openings, mating patterns and endgame technique. |
| Opening knowledge | Item-bank facts (`chess_opening` pool) | Missing: CC0 opening names/ECO by position, and "your repertoire" lines. |
| Endgame play-outs vs perfect defence | Bot only | Missing: tablebase or retrograde solver for KPK/KRK/KQK (perfect defence and "hold the draw" drills). |
| Puzzles from own games | Review finds blunders | Missing: turn them into retry puzzles on the SRS (Aimchess/Noctie). |
| Coordinates and visualisation | – | Missing (cheap). |
| Human-like opponent | – | Missing (Maia-2 is MIT; see 3.3). |

### 3.3 Proposed local implementations

| Component | Proposal | Licence | Evidence |
|---|---|---|---|
| **Per-move SRS (MoveTrainer-style)** | Card = (position, the learner's side, the expected move, the *why* text). Schedule on the existing review machinery (FSRS-style if agent 3's proposal is adopted; else Leitner 4 h/1 d/3 d/1 w/2 w/1 mo/3 mo/6 mo). A mistake → shorter interval and the *why* shown; a late review = not reset to level 1 (our choice: avoid "review debt", a known complaint [P]). A "why" prompt before the move for every opening card, to fight memorising without understanding [P zwischenzug]. | Our own code | Intervals as published [V]. Our learning-science docs favour retrieval with explanation [P]. |
| Puzzle volume | Run the plan already written in the chess TOOLS-NOTES: stream-decompress the CC0 puzzle CSV; keep Popularity ≥85, NbPlays ≥500, RD ≤80; about 4,000 across 400-2400 in 100-point bands across theme families; apply the first move; re-verify with `chess-core` and the solver | CC0 [V] | The file is 307 MB [P]; download needs owner approval (it was flagged as an owner decision on 2026-10-21) |
| Opening names / ECO | lichess-org/chess-openings TSV (about 3,500 lines) → a FEN-keyed lookup in `content/` | CC0 [S] | – |
| Stronger analysis (review, puzzle checks, "is this the only move?") | **Recommended: an engine on our side, never shipped to browsers.** Stockfish (GPL-3.0) run at build time (puzzle and lesson verification) and/or on our server for game review. Under GPL-3 the source obligation is triggered by *distributing* the program; running it on our own machine or server is not distribution (that gap is why the AGPL exists) [R, not legal advice; Stockfish states "whenever you distribute Stockfish … you MUST always include the license and the full source code" [S]]. **Permissive alternative:** Leorik (MIT, C#, NNUE; 3496 CCRL Blitz / 3400 CCRL 40/15) on the server [V]. **Browser option:** stockfish.js/WASM (GPL-3.0; Chess.com uses it [S]): ship it as a separate Web Worker program talking UCI text, with its licence and a source link; whether our app code then counts as a "combined work" is a legal question, so it is an owner decision. A permissive in-browser fallback is Garbochess-JS (BSD-3, about 2000-2400 estimated) [V talkchess]. | Stockfish GPL-3; Leorik MIT; Garbochess BSD-3 | **[L]** our bot: 23-70k nodes/s in Node; depth-3 analysis 1.5-2.2 s and depth-4 9-11 s on two middlegames; strength-10 `chooseMove` 5.4-6.3 s. Multithreaded Stockfish WASM needs COOP/COEP headers (SharedArrayBuffer) [S]. Its node rate was not measured, so benchmark it before choosing [R]. |
| Evaluations without an engine | lichess_db_eval (CC0, 416M positions) as a lookup for common positions in review | CC0 [V] | The file size was not read: check before any download [R]. |
| Endgame perfect play | Our own retrograde solver for KPK, KRK, KQK and KBNK (each small enough to generate in seconds and ship as a compact table), so the bot defends perfectly in "mate with K+R" / "hold the draw" drills. Syzygy 6-man server-side later, if wanted. | Our own code | KPK has about 24k positions with White to move [R, standard figure; verify when building]. |
| Human-like sparring bot | **Maia-2** (MIT code and model [V github.com/CSSLab/maia2]; rapid and blitz models; Elo-conditioned) on our server (Python/torch), or exported to ONNX for the browser if small enough. **Avoid Maia-3** (AGPL-3.0 code [V github]; AGPL reaches network use) and **Maia-1** (GPL-3, lc0 weights [S]). | MIT | Maia-3 reports 57.1% move-matching vs 52.0% for Maia-2 [S lichess blog snippet], so Maia-2 is a few points weaker but permissive. |
| Puzzles from own games | After a `Chess_PlayOut` review, each Mistake/Blunder → "find the better move" card on the SRS; verify with the analysis engine | Our own code | Aimchess/Noctie/Chess.com Retry mechanic [P] |
| Stars-per-par mini-games | `Chess_PlayOut` goal `collect` with targets on squares and `par` moves → 1-3 stars | Our own code | Lichess Learn pattern; good for pre-readers [P] |
| Coordinates / visualisation | Timed square-naming (timer off by default for kids), square colour without looking, 1-2 move blindfold puzzles | Our own code | [P] |
| Do not use | lila code, chessground and chessops (GPL-3) and lichess-puzzler (AGPL): studying how they work is fine, but copying their code is not; Viridithas ≥21 (AGPL) [V] | – | – |

### 3.4 Prioritised build plan: chess

**Build status (2026-10-23):** C1 done (3,726 Lichess puzzles, CC0, each re-checked by Stockfish), C2 done (move trainer, 94 move cards), C4 done (bake-off in `skill-apps-bench/CHESS-ENGINE-BAKEOFF.md`: Stockfish on the server for review and checks, Maia-2 after the CC0 opening book for sparring), C7 done (`spar.html`). Details: `../curriculum-build/chess/TOOLS-NOTES.md` Part C.

1. **C1. Lichess puzzle import** (owner OK to download 307 MB, CC0). Biggest content gain for the least work; the plan already exists.
2. **C2. Per-move SRS block (`Chess_Drill`)** for mating patterns, then endgame technique, then openings for learners rated about 1600+ (principles before lines [P]).
3. **C3. Own-game mistakes → SRS puzzles.**
4. **C4. Analysis engine decision and integration** (5). Then deepen review and puzzle verification.
5. **C5. Retrograde tablebases** (KPK/KRK/KQK) → perfect-defence drills.
6. **C6. Stars-per-par mini-games and the coordinate trainer** for ages 4-7.
7. **C7. Maia-2 human-like bot** (server) if bots prove a weak spot in user testing.

**Verification:**
- Move generator: perft (existing).
- Puzzles: unique-mate proof (existing), plus a ≥150 cp gap at a stronger depth once C4 lands.
- Review classes: compare with stronger-engine labels on 200 positions.
- Bot strength: calibrate against Maia-2 at fixed Elo, or engine levels, over 100-game matches.
- SRS: retention measured on the learner data the scorecard already logs.

---

## 4. Cross-cutting design

- **On-device first.** Camera and mic data stay in the browser. Models are self-hosted static files (allowed by Apache-2.0 when the notice is kept), cached for offline use. Nothing calls a paid API for tracking, sound or chess [R].
- **Honesty layer, as the code already does:** every camera or mic result says "estimated", shows confidence, and lets the learner correct it. When the system is unsure, it asks ("play that bar again") rather than marking the learner wrong. Detection is the #1 piano complaint (28% of low-star reviews) [P].
- **One event shape per subject.** Piano already has `{midi, velocity, time, source, confidence}`. Basketball should gain `{t, kind: shot|dribble|hit, x, y, made?, confidence, source: camera|tap}`, so new detectors slot in without changing the blocks [R].
- **Workers.** Pose, detector and verifier code go in Web Workers / AudioWorklets, so the UI stays at 60 fps. The pattern already exists for the chess review (`review-worker.js`).
- **Device budget.** Target mid-range phones from 2021. Check heat and battery over 20 minutes (HomeCourt's top hardware complaints) [P].
- **Accessibility.** Every camera or mic block keeps its tap/keys fallback, which already exists in every block.

---

## 5. Owner decisions needed

1. **Stockfish (GPL-3.0).**
   - **(a) Recommended:** build-time and server-side only. No copy goes to users, so there is no source obligation under GPL-3 [R].
   - **(b)** Also ship stockfish.js in the browser: include its licence and a source link, and keep it a separate worker program. Get a lawyer's view on whether our app code then counts as a "combined work".
   - **(c)** No Stockfish: use Leorik (MIT) on the server.
2. **AGPL components are excluded** unless the owner wants to open-source Savant: Ultralytics YOLO (including our own trained weights), Maia-3, Viridithas ≥21, any Lichess code. Confirm.
3. **Patents (freedom to operate).** None of this is a legal opinion; a short patent-counsel review is recommended before *marketing* automatic make/miss or adaptive mic grading.
   - NEX Team (HomeCourt) US10489656 claims phone-camera ball analytics (goal ROI → ball trajectory → shooter); priority 2017-09-21, anticipated expiry 2038 [V]. Related: US11380100, US11594029, US11157742 [S].
   - Simply/JoyTunes US11893898 claims adaptive interactive instrument teaching; priority 2020 [V]. Simply also holds other grants [S].
   - Savant's designs are original. Patents, unlike copyright, cover methods, so independent invention is no defence.
4. **Downloads** (each needs approval):
   - Lichess puzzle CSV: 307 MB, CC0.
   - lichess_db_eval: CC0; size not checked.
   - chess-openings TSV: small, CC0.
   - MediaPipe `.task` models: about 10-35 MB, Apache-2.0.
   - An Apache detector checkpoint, about 5-20 MB.
5. **Test data.**
   - May we record our own basketball and piano test clips (adults or consenting families)?
   - MAESTRO is CC BY-NC-SA, so it is not usable for tuning a commercial product. Approve internal-evaluation-only use, or skip it.
6. **Camera and mic policy for under-13s.** Process on the device only, never upload, and require a parent toggle? Product decisions say parent-linked accounts for under-13s, so the toggle fits.

---

## 6. Measurements made this session

Scripts are copied to `curriculum-build/skill-apps-bench/` and run in Node on the repo's own code.

| What | Result |
|---|---|
| YIN `detectPitch`, 88 keys, synthetic piano tones, 4096 @ 48 kHz | 76/76 in-range notes right (noise 0 and 0.01); noise 0.03: 68 right, 2 octave-down (A7, C8), the rest silent; the 12 keys below A1 are never detected (by design); 2.5-2.7 ms per frame. |
| YIN on a C major triad | C2 (midi 36), clarity 0.89: a phantom subharmonic accepted by the 0.7 threshold. |
| Expected-notes verifier prototype, 50 triads (C3-C5, major and minor) | Ratio 1.1 / floor 0.1: 50/50 right chords accepted, 50/50 semitone slips rejected, at noise 0-0.03; 0.5-0.75 ms per frame. Stricter settings reject 9-12 right chords. |
| Chess bot `analyse` | Italian middlegame: depth 3 = 48.5k nodes / 1.5 s, depth 4 = 331k / 10.7 s. Kiwipete: depth 3 = 2.2 s, depth 4 = 9.2 s. 23-70k nodes/s. Strength-10 move = 5.4-6.3 s. |

All audio results use synthetic tones. They prove the logic and the cost, not real-room accuracy; P0 recordings are required before any claim reaches learners.

---

## 7. Sources

**Basketball**
- HomeCourt App Store listing [V] https://apps.apple.com/us/app/homecourt-basketball-training/id1258520424
- HomeCourt setup help [S] https://help.homecourt.ai/hc/en-us/articles/9344374524179-How-should-I-set-up-my-device · https://www.homecourt.ai/in-app/gettingstarted · https://www.homecourt.ai/faq-old
- Shot Science metrics [S] https://www.sportsbusinessdaily.com/Daily/Issues/2018/10/18/Technology/homecourt-apple-shot-science-steve-nash.aspx
- NEX Team patent US10489656B2 [V] https://patents.google.com/patent/US10489656B2/en ; related [S] US11380100, US11594029, US11157742 (image-ppubs.uspto.gov)
- ShotTracker how it works [S] https://shottracker.com/faq/ (the old https://support.shottracker.com/howitworks answers 404 since at least 2026-10-25; the FAQ says "ShotTracker is made up of three components: anchors in the rafters, a ShotTracker-enabled ball and player sensors.")
- Hoops (Pillar Vision) [S] https://apps.apple.com/us/app/id1563442235 ; HoopCoach AI [S] https://apps.apple.com/app/id6775835405
- Earlier Savant research (Noah, DribbleUp, HooperIQ, Onform, complaints) [P] `../curriculum-build/basketball/research/03-apps-sequencing-pacing.md`
- MediaPipe Pose Landmarker [V] https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- BlazePose sizes and variants [S] https://blog.tensorflow.org/2021/05/high-fidelity-pose-tracking-with-mediapipe-blazepose-and-tfjs.html ; legacy latency table [S] https://cdn.jsdelivr.net/npm/@subhajit-gorai/react-native-mediapipe-llm@1.0.3/mediapipe/docs/solutions/pose.md ; GHUM Holistic paper [S] https://arxiv.org/abs/2206.11678 ; model card licence [S] https://developers.google.cn/static/ml-kit/images/vision/pose-detection/pose_model_card.pdf
- MoveNet [S] https://blog.tensorflow.org/2021/05/next-generation-pose-detection-with-movenet-and-tensorflowjs.html
- MediaPipe Object Detector [S] https://developers.google.com/edge/mediapipe/solutions/vision/object_detector
- Ultralytics licence [S] https://ultralytics.com/license · https://www.ultralytics.com/request-license
- YOLOX / RT-DETR / D-FINE licences [S] https://playground.roboflow.com/models/compare/rt-detr-vs-yolox · https://arxiv.org/pdf/2410.13842
- ONNX Runtime Web WebGPU [S] https://onnxruntime.ai/blogs/ort-1-17-release

**Piano**
- Simply Piano note-recognition help [V] https://piano-help.hellosimply.com/en/articles/6210583-ways-to-improve-note-recognition-in-simply-piano-for-ios-acoustic-piano
- MusicSense description [S] https://www.weizmann.ac.il/WeizmannCompass/node/1756
- Simply/JoyTunes patent US11893898B2 [V] https://patents.google.com/patent/US11893898B2/en
- Yousician piano recognition help [S] https://support.yousician.com/hc/en-us/articles/46277319890449-Piano-sound-recognition-issues
- Flowkey help and listing [S] https://help.flowkey.com/en/articles/412925-connect-your-instrument-with-your-pc-mac · https://apps.apple.com/app/id1020357408
- Synthesia listing [S] https://apps.apple.com/us/app/synthesia/id579518445
- Earlier Savant research (Skoove, Piano Marvel, ROLI, complaint shares) [P] `../curriculum-build/piano/research/03-apps-sequencing-pacing.md`
- Basic Pitch paper [V] https://arxiv.org/html/2203.09893v2 ; basic-pitch-ts [V] https://github.com/spotify/basic-pitch-ts
- High-resolution piano transcription (ByteDance) [S] https://arxiv.org/abs/2010.01815 · https://github.com/bytedance/piano_transcription
- Onsets and Frames in Magenta.js [S] https://magenta.tensorflow.org/oaf-js
- Score-informed transcription for piano tutoring (EUSIPCO 2012) [S] https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2012/Benetos-Klapuri-Dixon-EUSIPCO2012a.pdf
- Klapuri harmonic-sum multiple-F0 estimation (ISMIR 2006) [S] https://archives.ismir.net/ismir2006/paper/000125.pdf
- AudioWorklet latency measurements [S] https://jefftk.com/p/audioworklet-latency-firefox-vs-chrome ; output latency [S] https://web.dev/articles/audio-output-latency
- MAESTRO licence [S] https://magenta.tensorflow.org/datasets/maestro

**Chess**
- Chessable spaced repetition [V] https://support.chess.com/en/articles/10319322-how-does-the-spaced-repetition-scheduling-work
- Lichess database (puzzles, evaluations, CC0) [V] https://database.lichess.org/
- lichess-puzzler [V] https://github.com/ornicar/lichess-puzzler
- Lichess puzzle rating [S] https://lichess.org/forum/general-chess-discussion/puzzle-rating-question
- chess-openings [S] https://github.com/lichess-org/chess-openings/blob/master/README.md
- Stockfish licence and settlement [S] https://github.com/official-stockfish/Stockfish · https://Stockfishchess.org/files/settlement_english.pdf ; stockfish.js [S] https://npmjs.com/package/stockfish ; WASM threading [S] https://github.com/lichess-org/stockfish.wasm
- Leorik [V] https://github.com/lithander/Leorik ; Viridithas [V] https://github.com/cosmobobak/viridithas ; permissive JS engines thread [V] https://talkchess.com/viewtopic.php?p=841253
- Maia-2 [V] https://github.com/CSSLab/maia2 ; Maia-3 [V] https://github.com/CSSLab/maia3 ; Maia-3 announcement [S] https://lichess.org/@/ashtonanderson/blog/introducing-maia-3-free-and-open-source/vCPPRtX3
- GPL vs network use (why the AGPL exists) [R] https://www.gnu.org/licenses/why-affero-gpl.html
- Earlier Savant research (Chess.com, ChessKid, Lichess Learn/Practice, Aimchess, Dr. Wolf, complaints) [P] `../curriculum-build/chess/research/03-apps-sequencing-pacing.md`

---

## 8. Build log, 2026-10-23 (piano P1 + P3, basketball B0 + B2)

All on-device; no model or API calls. Numbers from `scripts/piano-mic-eval.js` and `scripts/basketball-video-eval.js`.

**Piano.** The chord bug is fixed: `piano-core.js` `hearNotes` (score-informed: harmonic-sum salience on true spectral
peaks, each expected note must beat both neighbouring semitones and have some partials no other expected note
shares) and `pitchIsReal` (refuses YIN's chord ghost). Onsets: `createOnsetDetector` / `createMicTap` /
`createNoteListener` run in an AudioWorklet (`mic-worklet.js`), timed from the audio clock. Graded chord checks
(`Check_Piano` mode chord) stay "MIDI or on-screen keys only": a graded check keeps its answer off the page, so the
microphone has nothing to verify against. MIDI: velocity graded loud-against-soft by rank (`scoreDynamics`,
`dynamic` on Piano_PlayAlong notes) and legato pedal (`scorePedal`, `pedal: "legato"` on Piano_PlayAlong and
Piano_Song).

| Test (public data) | Before | After |
|---|---|---|
| 50 triads, real Steinway notes (Univ. of Iowa MIS) mixed, old YIN path | 21 phantom notes, 3 one right note, 26 nothing | right chord accepted 48-49/50, slips (third, fifth, root a semitone off; a note left out) rejected 197-198/200 |
| Real chord recordings (Commons, CC0/PD), 7 chords | - | 7/7 accepted, 42/42 semitone-off chords rejected |
| Onset error, 1,280 real-note melodies (Iowa), quiet / noisy | old: median 29 ms, 7/20 within 20 ms | median 0.7 ms; within 20 ms 606/626 and 574/629; pitch 100% of notes found |
| Real pedalled performance (Ishizaka BWV 846, CC0, first 45 s) vs ByteDance offline transcription | - | 112/163 starts found, 6 extra; median 6-7 ms from the model's onsets; pitch class right for 98/119 notes reported |

Weak spots: a soft chord tone under loud ones (one note pp, two ff) is accepted only 35/50; legato with the pedal
down misses about a third of starts; phone microphones and rooms are untested (P0 recordings still needed).

**Follow-up, 2026-10-24 (the two weak spots).** Same data, same script (`scripts/piano-mic-eval.js`), run before and after on this machine.

- **The soft chord tone: mostly a test error, not an engine one.** Five of the Iowa pp files (C3, G3, C4, E4, C5) have room noise above 5% of their peak, so the script's "first sample over 5% of the peak" rule put their start 0.4-0.5 s too early. In the uneven-loudness test those pp notes therefore sounded 0.4-0.5 s after the two ff notes: not a chord at all. The script now also requires 10 times the room noise (it changes no mf or ff start by more than 20 ms). With the start fixed, the unchanged engine accepts **43/50** in the full run (47/50 when the three notes are mixed with no random spread). The 7 left are a pp note under two ff notes at the same instant; its own partials sit 0-6 dB over the ff notes' spread, below what one 85 ms frame can tell from a missing note. Relaxing the "own partials" test to catch them (tried: share 0.05 to 0.001, floor 0.05 to 0.03, frames of 8,192 and 16,384) lets 28-103 of 150 missing-note slips through, so it was not done.
- **Starts under the pedal: improved in `piano-core.js` (live).** A softer rise in the hammer channel (4.5 dB instead of 7) is now a "weak start". It waits 10 ms in case the rise reaches the full bar, never holds back a normal start, and the note listener keeps it only when a note's own salience grew across it by half or more (blind: the note that grew; with a score: one of the expected notes), never a key reported in the last 300 ms, and never while a chord is expected. `mic-worklet.js` needed no change (the flag rides on the onset message).

| Test (public data) | Before | After |
|---|---|---|
| BWV 846 (Ishizaka, CC0, pedalled, first 45 s) vs the ByteDance transcription, 163 starts: notes found, no score | 118 (15 extra) | **144** (20 extra) |
| same, score-informed (each start's notes expected, as a lesson listens) | 120 (15 extra) | **150** (17 extra) |
| same, pitch class right among notes reported at a start | 101/118 | 133/144 |
| Iowa chords, right accepted (quiet / noisy+spread / noisier) | 49 / 49 / 50 of 50 | 49 / 49 / 50 |
| Iowa chord slips rejected | 198 / 197 / 197 of 200 | 198 / 197 / 197 |
| Real chord recordings: right accepted, semitone-off rejected, notes outside a chord start | 7/7, 42/42, 0 | 7/7, 42/42, 0 |
| Iowa melodies (192 notes): found, extra, within 20 ms (quiet / noisy) | 186, 7, 179 / 187, 2, 168 | 186, 7, 182 / 187, 2, 176 |
| Uneven loudness, pp under two ff (start fixed) | 43/50 | 43/50 |

"Before" is the live engine on the fixed script; the old script's numbers were 48/49/50, 198/197/196 and 34/50 (the random mix order shifts by the changed starts). Missed starts under the pedal fell from 28% (blind) and 26% (score-informed) to 12% and 8%, for 5 and 2 more extra notes in 45 s; some of the extras may be notes the offline transcription missed. Backups: scratchpad `34e6f487.../before-skills-night/`. Raw output: scratchpad `piano-base-fixed.json`, `piano-new2.json`.

**Basketball.** B0 labelled set: 11 shots from openly licensed Commons clips
(`skill-apps-bench/basketball-labels.json`), none filmed the way the app asks. B2: MediaPipe Pose lite, self-hosted.
Feet at the shot: median 20.6 px (motion) -> 4.9 px (body); release time: 547 ms (ball rise) -> 67 ms (highest hand).
Shot finding and make/miss are unchanged by pose and could not be measured fairly here (3/11 shots found; the
one labelled make was missed). Pose cannot run in the app until the page policy allows WebAssembly
(`'wasm-unsafe-eval'`) and, on the camera pages, fetching `/vendor/mediapipe/`: an owner decision.
