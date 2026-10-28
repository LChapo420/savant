// The camera tools' maths, on frames drawn here: no camera, no video files.
// public/engine/basketball/tracking.js — homography, the ball finder, the
// rim-crossing rule, the shooter's feet, zones and numbers, and the drill round.
const T = require('../public/engine/basketball/tracking');

let failures = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};
const near = (a, b, tol) => !!a && !!b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;

// ── frames drawn in code ────────────────────────────────────────────────────
const W = 320;
const H = 240;
const WALL = [90, 100, 120];
const FLOOR = [194, 129, 74]; // a wooden floor is orange-brown too
const BOARD = [235, 235, 235];
const RIM_COLOUR = [220, 90, 30];
const BALL = [215, 100, 35];
const BODY = [40, 50, 90];
const RIM = { left: 145, right: 175, y: 85 };

function blank() {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = y >= 150 ? FLOOR : WALL;
      const i = (y * W + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}
function rect(f, x0, y0, x1, y1, c) {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x++) {
      const i = (y * W + x) * 4;
      f.data[i] = c[0]; f.data[i + 1] = c[1]; f.data[i + 2] = c[2];
    }
  }
}
function disc(f, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * W + x) * 4;
      f.data[i] = c[0]; f.data[i + 1] = c[1]; f.data[i + 2] = c[2];
    }
  }
}
/** The gym: a wall, a wooden floor, the backboard and the orange rim, a shooter, and the ball. */
function scene(ball, shooter) {
  const f = blank();
  rect(f, 130, 30, 190, 80, BOARD);
  rect(f, RIM.left, RIM.y - 1, RIM.right, RIM.y + 2, RIM_COLOUR);
  if (shooter) rect(f, shooter[0] - 10, shooter[1] - 50, shooter[0] + 10, shooter[1], BODY);
  if (ball) disc(f, ball[0], ball[1], 6, BALL);
  return f;
}
/** A shot's flight: a parabola from the hands, apex at (ax, ay), through rim height at crossX. */
function flight(ax, ay, crossX, frames) {
  const a = (RIM.y - ay) / ((crossX - ax) ** 2);
  const startX = ax - Math.sqrt((190 - ay) / a);
  const endX = crossX + (crossX - ax) * 0.6;
  const out = [];
  for (let k = 0; k < frames; k++) {
    const x = startX + ((endX - startX) * k) / (frames - 1);
    out.push([x, a * (x - ax) ** 2 + ay]);
  }
  return out;
}
/** Run frames through the finder and the judge, the way the page does. */
function track(points, shooterAt, { lift = 0, movedFrom = null } = {}) {
  const judge = T.createRimJudge(RIM);
  const bg = T.createBackground();
  const shots = [];
  const feet = [];
  let last = null;
  let prev = null;
  // The empty gym while the phone is set up; with `movedFrom`, two seconds of
  // the shooter standing still somewhere else first (taken into the scene), then
  // half a second at the new spot getting set, the flight, a second of nothing.
  for (let k = 0; k < 10; k++) bg.update(scene(null));
  const before = movedFrom ? 60 : 0;
  const all = [...Array(before + 15).fill(null), ...points, ...Array(30).fill(null)];
  all.forEach((p, k) => {
    const t = k * 33;
    const j = k - before;
    const jumping = p && j >= 15 && j < 22 ? lift : 0;
    const at = j < 0 ? movedFrom : shooterAt;
    const f = scene(p, at && [at[0] + (j < 0 ? 0 : k % 2), at[1] - jumping]);
    // Compared with the empty scene as learned so far, then learned from.
    const ref = bg.frame;
    const ball = T.findBall(f, ref, { prev, near: last ? [last.x, last.y] : null });
    const mover = T.findMover(f, ref, { prev });
    if (mover) feet.push({ t, feet: mover.feet });
    if (ball) last = ball;
    const shot = judge.push(t, ball);
    if (shot) shots.push(shot);
    bg.update(f, prev);
    prev = f;
  });
  return { shots, feet };
}

// ── the floor: image to court ───────────────────────────────────────────────
console.log('homography');
// A made-up phone camera behind the shooter: court feet to image pixels, with perspective.
const G = [[5.2, 0.6, 30], [0.1, -2.6, 168], [0.0004, -0.0065, 1]];
const project = (p) => T.apply(G, p);
const marks = ['ft_left', 'ft_right', 'lane_left', 'lane_right'].map((k) => T.LANDMARKS[k].at);
const fit = T.homography(marks.map(project), marks);
ok(fit.kind === 'homography', 'four landmarks give a full homography');
const spots = [[25, 5.25], [3, 3], [47, 10], [10, 25], [25, 29], [40, 35]];
ok(spots.every((s) => near(T.toCourt(fit.H, project(s)), s, 0.15)), 'it maps any floor spot back within 0.15 ft, even far from the taps');
const noisy = T.homography(marks.map(project).map(([x, y], i) => [x + (i % 2 ? 1 : -1), y + (i > 1 ? 1 : -1)]), marks);
ok(near(T.toCourt(noisy.H, project([25, 15])), [25, 15], 1.5), 'one pixel of tapping error moves a mid-range spot by under 1.5 ft');
const fiveMarks = [...marks, T.LANDMARKS.corner_left.at];
const five = T.homography(fiveMarks.map(project), fiveMarks);
ok(five.kind === 'homography' && near(T.toCourt(five.H, project([30, 22])), [30, 22], 0.15), 'more than four taps are fitted by least squares');
const A = [[4, 1, 20], [-0.5, -3, 170], [0, 0, 1]];
const three = T.homography(marks.slice(0, 3).map((p) => T.apply(A, p)), marks.slice(0, 3));
ok(three.kind === 'affine' && near(T.toCourt(three.H, T.apply(A, [30, 30])), [30, 30], 0.01), 'three taps give an affine map, exact for a camera looking straight down');
const S = [[3, -1, 50], [1, 3, 20], [0, 0, 1]];
const two = T.homography(marks.slice(0, 2).map((p) => T.apply(S, p)), marks.slice(0, 2));
ok(two.kind === 'similarity' && near(T.toCourt(two.H, T.apply(S, [10, 40])), [10, 40], 0.01), 'two taps give a similarity');
ok(!!T.homography([[10, 10], [10, 11]], marks.slice(0, 2)).error, 'two taps on the same spot are refused');
ok(!!T.homography([[10, 10], [50, 10], [90, 10], [130, 80]], marks).error, 'three taps in a line are refused');
ok(T.toCourt(fit.H, project([25, 80])) === null, 'a spot past the half court is not placed');

// ── the ball ────────────────────────────────────────────────────────────────
console.log('the ball finder');
ok(T.isOrange(...BALL) && T.isOrange(...FLOOR) && !T.isOrange(...WALL) && !T.isOrange(...BOARD) && !T.isOrange(...BODY), 'ball and wooden floor read as orange; wall, board and body do not');
const still = scene([60, 60]);
ok(near(T.findBall(still, null) && [T.findBall(still, null).x, T.findBall(still, null).y], [60, 60], 2), 'a lone ball is found without a previous frame');
ok(T.findBall(still, scene([60, 60])) === null, 'a ball that has not moved is not taken for a shot');
const overFloor = T.findBall(scene([200, 180]), scene(null));
ok(near(overFloor && [overFloor.x, overFloor.y], [200, 180], 2.5), 'a moving ball over the orange wooden floor is found (the floor itself is set aside)');
const onRim = T.findBall(scene([160, 84]), scene(null));
ok(near(onRim && [onRim.x, onRim.y], [160, 84], 3), 'a ball touching the orange rim is found');

// A bag on the floor, picked up: the floor under it differs from the learned
// scene (a round-enough orange patch) but does not move from frame to frame.
const withBag = scene(null);
rect(withBag, 222, 192, 238, 208, BODY);
const ghostFrame = scene([100, 60]);
const ghostPrev = scene([94, 66]);
const fooled = T.findBall(ghostFrame, withBag, { near: [230, 200] });
ok(!!fooled && Math.abs(fooled.x - 230) < 4, 'without the previous frame, a still patch of uncovered floor can pass for the ball');
const notFooled = T.findBall(ghostFrame, withBag, { prev: ghostPrev, near: [230, 200] });
ok(!!notFooled && near([notFooled.x, notFooled.y], [100, 60], 2), 'with it, the still patch is passed over and the moving ball is found');

// Seen in the testbed: shots placed at the shooter's previous spot. The learned
// scene still holds the shooter there; the feet finder must pick the one moving now.
const sceneWithOld = scene(null);
rect(sceneWithOld, 200, 50, 240, 140, BODY); // a nearer shooter, against the wall, now gone
const nowFrame = scene(null, [90, 205]);
const nowPrev = scene(null, [90, 207]);
const lured = T.findMover(nowFrame, sceneWithOld, { cell: 4 });
const moverNow = T.findMover(nowFrame, sceneWithOld, { cell: 4, prev: nowPrev });
ok(!!lured && Math.abs(lured.feet[0] - 220) <= 6, 'without the previous frame, the still patch where a shooter stood wins');
ok(!!moverNow && Math.abs(moverNow.feet[0] - 90) <= 6 && Math.abs(moverNow.feet[1] - 205) <= 6, 'with it, the feet are those of the shooter moving now');

// ── make or miss ────────────────────────────────────────────────────────────
console.log('the rim-crossing rule');
const judgeOf = (pts) => {
  const j = T.createRimJudge(RIM);
  const out = [];
  pts.forEach((p, k) => { const s = j.push(k * 33, p && { x: p[0], y: p[1] }); if (s) out.push(s); });
  return out;
};
const mk = judgeOf(flight(140, 40, 160, 24));
ok(mk.length === 1 && mk[0].made === true && Math.abs(mk[0].crossX - 160) < 3, 'down through the rim between its edges is a make');
const short = judgeOf(flight(125, 40, 138, 24));
ok(short.length === 1 && short[0].made === false, 'coming down in front of the rim is a miss');
const long = judgeOf(flight(170, 40, 186, 24));
ok(long.length === 1 && long[0].made === false, 'coming down past the rim is a miss');
const lost = judgeOf([...flight(140, 40, 160, 24).slice(0, 10), ...Array(50).fill(null)]);
ok(lost.length === 1 && lost[0].made === null, 'a ball lost above the rim is "not sure", for the learner to settle');
ok(judgeOf(Array.from({ length: 60 }, (_, k) => [100 + (k % 10), 180 - (k % 5)])).length === 0, 'dribbling below the rim is never a shot');
ok(judgeOf(Array.from({ length: 30 }, (_, k) => [20 + k, 30])).length === 0, 'a ball high but far from the rim is not a shot');
const bounce = [...flight(140, 40, 152, 18).slice(0, 12), [150, 80], [149, 70], [151, 62], [155, 70], [159, 80], [161, 90], [162, 100]];
const b = judgeOf(bounce);
ok(b.length === 1 && b[0].made === true, 'a ball that bounces on the rim and drops in counts once, as a make');
const twice = judgeOf([...flight(140, 40, 160, 24), ...Array(10).fill(null), ...flight(140, 40, 160, 24)]);
ok(twice.length === 2 && twice.every((s) => s.made), 'two shots in a row count as two');

console.log('the pipeline on drawn frames');
const made = track(flight(140, 40, 160, 24), [90, 200], { lift: 6 });
ok(made.shots.length === 1 && made.shots[0].made === true, 'a disc drawn through the rim box is found and judged a make');
const missed = track(flight(125, 40, 138, 24), [90, 200], { lift: 6 });
ok(missed.shots.length === 1 && missed.shots[0].made === false, 'a disc drawn short of the rim is judged a miss');
// Seen in the testbed: the floor a shooter just walked off differs from the
// learned scene; the finder took that still patch for the ball and missed the shot.
const moved = track(flight(140, 40, 160, 24), [90, 200], { lift: 6, movedFrom: [230, 205] });
ok(moved.shots.length === 1 && moved.shots[0].made === true, 'after the shooter changes spot, the floor they uncovered is not taken for the ball');
const airball = track(flight(110, 50, 120, 24), [90, 200]);
ok(airball.shots.length === 0 || airball.shots.every((s) => s.made === false), 'an airball well short of the rim is never a make');
// Where the shooter stood: the lowest feet point before the release, mapped to the court.
const release = made.shots[0] && made.shots[0].release;
const before = made.feet.filter((f) => release != null && f.t <= release && f.t >= release - 800);
const lowest = before.reduce((m, f) => (!m || f.feet[1] > m.feet[1] ? f : m), null);
ok(!!lowest && Math.abs(lowest.feet[1] - 200) <= 8 && Math.abs(lowest.feet[0] - 90) <= 8, 'the shooter\'s feet are found at their spot before the release');
// With the floor fixed by four taps, those feet land on the court.
const gymFloor = T.homography([[100, 150], [220, 150], [120, 95], [200, 95]], marks);
const spot = lowest && T.toCourt(gymFloor.H, lowest.feet);
ok(!!spot && spot[1] > 19, `the shot is placed on the court, beyond the free-throw line here (${spot && spot.join(', ')})`);

// ── zones and numbers ───────────────────────────────────────────────────────
console.log('zones and stats');
ok(T.zoneOf(25, 6) === 'paint' && T.zoneOf(2, 3) === 'three' && T.zoneOf(6, 6) === 'mid-range' && T.zoneOf(25, 30) === 'three' && T.zoneOf(25, 25) === 'mid-range', 'paint, corner three, a long two, top three and the free-throw area are zoned right');
const st = T.shotStats([
  { made: true, x: 25, y: 6 }, { made: false, x: 25, y: 7 }, { made: true, x: 2, y: 3 }, { made: false, x: 10, y: 20 }, { made: true, x: 30, y: 15 },
  { made: true }, { made: null, x: 25, y: 6 },
]);
ok(st.fga === 6 && st.fgm === 4 && st.tpa === 1 && st.tpm === 1, 'attempts and makes; an unplaced shot counts, an unsettled one does not');
ok(st.fg === 66.7 && st.efg === 75, 'FG% 4/6 = 66.7 and eFG% (4 + 0.5) / 6 = 75');
ok(st.points === 9 && st.zones.paint.attempts === 3 && st.zones.three.makes === 1 && st.unplaced === 1 && st.undecided === 1, 'points, zones and what is still to settle');
ok(T.shotStats([]).fg === null, 'no shots, no percentage');

// ── the drill ───────────────────────────────────────────────────────────────
console.log('the handling drill');
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const round = T.createRound({ slots: [0, 1, 2, 3], seconds: 10, life: 2000, gap: 300, rand });
let t = 0;
let touches = 0;
let lastSlot = null;
let repeats = 0;
while (!round.over && t < 20000) {
  const tg = round.tick(t);
  if (tg && t - tg.shownAt >= 450 && touches < 6) {
    if (tg.slot === lastSlot) repeats++;
    lastSlot = tg.slot;
    if (round.hit(t, tg.slot)) touches++;
  }
  t += 50;
}
const res = round.result();
ok(round.over && res.hits === 6, 'a round ends on time, with the hits made');
ok(res.reactions.every((ms) => ms >= 450 && ms < 600) && res.averageMs >= 450 && res.bestMs >= 450, 'reaction times are the time from the target showing to the touch');
ok(res.misses >= 1, 'targets left untouched are counted as misses');
ok(repeats === 0, 'the same slot never shows twice in a row');
ok(!round.hit(t, 0), 'no hits after the round ends');
const wrong = T.createRound({ slots: [0, 1], seconds: 5, rand: () => 0 });
const shown = wrong.tick(0) || wrong.tick(500);
ok(!!shown && !wrong.hit(600, 1 - shown.slot) && wrong.hit(650, shown.slot), 'touching the wrong target is not a hit');
// A hand (not orange) reaching a target moves most of it; the ball passing through does not count.
const empty = blank();
const hand = blank();
disc(hand, 60, 60, 14, [210, 170, 150]);
const ballThere = blank();
disc(ballThere, 60, 60, 14, BALL);
ok(T.motionIn(hand, empty, 60, 60, 12) > 0.8, 'a hand at the target moves it');
ok(T.motionIn(ballThere, empty, 60, 60, 12) < 0.1, 'the ball at the target does not count as a touch');
ok(T.motionIn(empty, empty, 60, 60, 12) === 0, 'a still target has no motion');

// ── the body (pose landmarks, as MediaPipe gives them) ─────────────────────
console.log('body tracking maths');
// A standing body in a 320 x 180 picture: feet at (cx, feetY) pixels, `tall` pixels
// from nose to ankles, hands at the chest or (armsUp 0-1) raised up to above the head.
function body(cx, feetY, tall, armsUp) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.9 }));
  const at = (i, x, y) => { lm[i] = { x: x / W, y: y / H, visibility: 0.9 }; };
  const top = feetY - tall;
  at(0, cx, top);
  at(11, cx - 6, top + tall * 0.18); at(12, cx + 6, top + tall * 0.18);
  const handY = top + tall * 0.45 - armsUp * tall * 0.65;
  at(13, cx - 7, top + tall * 0.3 - armsUp * tall * 0.3); at(14, cx + 7, top + tall * 0.3 - armsUp * tall * 0.3);
  at(15, cx - 4, handY); at(16, cx + 4, handY);
  at(23, cx - 4, top + tall * 0.55); at(24, cx + 4, top + tall * 0.55);
  at(25, cx - 4, top + tall * 0.78); at(26, cx + 4, top + tall * 0.78);
  at(27, cx - 4, feetY - 2); at(28, cx + 4, feetY - 2);
  at(29, cx - 5, feetY); at(30, cx + 5, feetY);
  at(31, cx - 1, feetY - 1); at(32, cx + 9, feetY - 1);
  return lm;
}
const shooterBody = body(150, 160, 60, 0);
ok(near(T.poseFeet(shooterBody, W, H), [150, 160], 0.5), 'the feet are the lowest of heel, toe and ankle, between the two feet');
const hidden = shooterBody.map((p, i) => (i === 29 || i === 31 || i === 27 ? { ...p, visibility: 0.1 } : p));
ok(near(T.poseFeet(hidden, W, H), [155, 160], 0.5), 'a foot the model cannot see is left out');
ok(T.wristIn(body(150, 160, 60, 1), W, H, 146, 100 + 60 * 0.45 - 60 * 0.65, 4) && !T.wristIn(shooterBody, W, H, 60, 40, 10), 'a wrist inside a drill target is a touch; one elsewhere is not');
// A game free throw: the shooter far away and small; a teammate nearer and taller does not shoot.
const frames = [];
for (let k = 0; k <= 30; k++) {
  const t = k * 33;
  const up = k < 15 ? k / 15 : Math.max(0, 1 - (k - 15) / 10); // the hand is highest at frame 15 (495 ms)
  frames.push({ t, bodies: [body(220, 168, 50, up), body(60, 184, 110, 0)], ball: k <= 15 ? { x: 220, y: 168 - 50 + 50 * 0.45 - up * 50 * 0.65, r: 3 } : { x: 220 - (k - 15) * 6, y: 60 - (k - 15) * 4, r: 3 } });
}
const sf = T.shooterFeetAt(frames, 495, W, H);
ok(!!sf && near(sf.feet, [220, 168], 1), `the shooter is the body with a hand up at the release, not the taller player nearer the camera (${sf && sf.feet.map(Math.round)})`);
ok(T.releaseFromArm(frames, 900, W, H) === 495, 'the release from the body alone: the moment the shooter\'s hand was highest');
ok(Math.abs(T.releaseFromPose(frames.map((f) => ({ t: f.t, ball: f.ball, wrists: T.poseWrists(f.bodies[0], W, H), height: 50 })), 900) - 495) <= 33, 'or the last moment the ball was in reach of a wrist');
const follow = T.createShooterTracker();
const first = follow.update(frames[3].bodies, frames[3].ball, W, H);
const later = follow.update(frames[20].bodies, null, W, H);
ok(first === frames[3].bodies[0] && later === frames[20].bodies[0], 'the body holding the ball stays the shooter after the ball leaves, frame to frame');
ok(T.jointAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }) === 90, 'joint angles in degrees (a right angle at the knee)');

console.log(failures ? `\n${failures} failure(s)` : '\nall tracking checks pass');
process.exit(failures ? 1 : 0);
