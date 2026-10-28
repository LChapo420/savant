// The shot tracker on real video: public/engine/basketball/tracking.js run frame by
// frame on clips, the way camera-blocks.js runs it on the camera (320 pixels wide,
// 30 frames a second, the learned background, findBall, findMover, the rim judge),
// with or without body tracking (landmarks from basketball-pose-dump.js), against
// hand labels.
//
//   node scripts/basketball-video-eval.js --clips <dir> --labels <labels.json> [--poses <poses.json>] [--json <out>]
//
// labels.json: { clips: [{ file, source, licence, rim: { left, right, y } (pixels at 320 wide),
//   shots: [{ release: seconds, made: true|false|null, feet: [x, y] | null, note }] }] }
// The rim is given, as the learner's two taps give it in the app.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const T = require('../public/engine/basketball/tracking');

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const labels = JSON.parse(fs.readFileSync(arg('--labels'), 'utf8'));
const poses = arg('--poses') ? JSON.parse(fs.readFileSync(arg('--poses'), 'utf8')) : null;
const W = 320;
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

function frames(file) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
  const H = Math.round((W * probe[1]) / probe[0] / 2) * 2;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H},fps=30`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 2 ** 31 });
  const size = W * H * 4;
  const out = [];
  for (let k = 0; k < raw.length / size; k++) out.push({ width: W, height: H, data: new Uint8ClampedArray(raw.buffer, raw.byteOffset + k * size, size) });
  return { H, list: out };
}

/** One clip through the tracker, as the page runs it. */
function run(clip, usePose) {
  const { H, list } = frames(path.join(arg('--clips'), clip.file));
  const judge = T.createRimJudge(clip.rim);
  const bg = T.createBackground(0.03, 0.1);
  let prev = null;
  let last = null;
  let lastSeen = -1e9;
  const feet = [];
  const samples = [];
  const shots = [];
  let ballFrames = 0;
  const lms = usePose && poses && poses.clips[clip.file] ? poses.clips[clip.file].frames : null;
  const shooter = T.createShooterTracker();
  const toLm = (b) => b.map((p) => ({ x: p[0], y: p[1], visibility: p[2] }));
  list.forEach((f, k) => {
    const t = (k * 1000) / 30;
    const ref = bg.frame;
    if (ref) {
      // With body tracking, a ball not seen lately is looked for near the shooter's hands.
      const hands = lms && samples.length ? samples[samples.length - 1].wrists : [];
      const near = last && t - lastSeen < 500 ? [last.x, last.y] : hands.length ? [hands.reduce((a, p) => a + p[0], 0) / hands.length, hands.reduce((a, p) => a + p[1], 0) / hands.length] : null;
      const ball = T.findBall(f, ref, { step: 1, prev, near });
      if (ball) { ballFrames++; last = ball; lastSeen = t; }
      const mover = T.findMover(f, ref, { prev, cell: 4, minCells: 4 });
      if (mover) feet.push({ t, feet: mover.feet });
      // Body tracking every other frame (the page runs it at most every 60 ms).
      let lm = null;
      const bodies = lms && k % 2 === 0 ? (lms[k] || []).map(toLm) : null;
      if (bodies) lm = shooter.update(bodies, ball, W, H);
      samples.push({ t, ball: ball ? { x: ball.x, y: ball.y, r: ball.r } : null, wrists: lm ? T.poseWrists(lm, W, H) : (samples.length ? samples[samples.length - 1].wrists : []), height: lm ? T.poseHeight(lm, H) : 0, feet: lm ? T.poseFeet(lm, W, H) : null, bodies });
      const shot = judge.push(t, ball);
      if (shot) {
        let poseRelease = lms ? T.releaseFromArm(samples, shot.start, W, H) : null;
        if (lms && poseRelease == null) poseRelease = T.releaseFromPose(samples, shot.start);
        const release = poseRelease != null ? poseRelease : shot.release;
        const at = release != null ? release : shot.start;
        let low = null;
        if (lms) { const sf = T.shooterFeetAt(samples, at, W, H); if (sf) low = sf.feet; }
        const byPose = !!low;
        if (!low) feet.forEach((x) => { if (x.t >= at - 900 && x.t <= at + 100 && (!low || x.feet[1] > low[1])) low = x.feet; });
        shots.push({ t: t / 1000, made: shot.made, release: release != null ? release / 1000 : null, releaseBy: poseRelease != null ? 'pose' : 'ball', feet: low, feetBy: byPose ? 'pose' : 'motion', bodyHeight: median(samples.filter((s) => s.height).map((s) => s.height)) });
      }
    }
    bg.update(f, prev);
    prev = f;
  });
  // Each part on its own, at the labelled shot (the tracker's shot finding aside):
  // where were the feet, and when did the ball leave the hands?
  const parts = clip.shots.map((want) => {
    const R = want.release * 1000;
    let motion = null;
    feet.forEach((x) => { if (x.t >= R - 900 && x.t <= R + 100 && (!motion || x.feet[1] > motion[1])) motion = x.feet; });
    const sf = lms ? T.shooterFeetAt(samples, R, W, H) : null;
    const body = sf ? sf.feet : null;
    // Ball rise: back from the first ball sighting above the shooter after R to where it started rising.
    const track = samples.filter((x) => x.ball && x.t <= R + 600);
    let k = track.length - 1;
    while (k > 0 && track[k - 1].ball.y >= track[k].ball.y - 0.5 && track[k].t - track[k - 1].t < 400) k--;
    const rise = track.length ? track[k].t : null;
    // As the page does: up to the moment the ball is first seen above the rim near it.
    const above = samples.find((x) => x.ball && x.t >= R - 200 && x.ball.y < clip.rim.y && Math.abs(x.ball.x - (clip.rim.left + clip.rim.right) / 2) <= 3 * (clip.rim.right - clip.rim.left));
    const byPose = lms ? T.releaseFromPose(samples, above ? above.t : R + 600) : null;
    const byArm = lms ? T.releaseFromArm(samples, above ? above.t : R + 600, W, H) : null;
    if (process.env.DEBUG && lms) samples.filter((x) => Math.abs(x.t - R) < 700).forEach((x) => console.log('      ', Math.round(x.t), x.ball ? [Math.round(x.ball.x), Math.round(x.ball.y)] : '-', x.wrists.map((w) => w.map(Math.round)), x.feet && x.feet.map(Math.round)));
    const err = (p) => (p && want.feet ? Math.round(Math.hypot(p[0] - want.feet[0], p[1] - want.feet[1]) * 10) / 10 : null);
    const h = median(samples.filter((x) => x.height).map((x) => x.height));
    return { feetMotionErrPx: err(motion), feetPoseErrPx: err(body), bodyHeightPx: h, releaseBallErrMs: rise != null ? Math.round(rise - R) : null, releasePoseErrMs: byPose != null ? Math.round(byPose - R) : null, releaseArmErrMs: byArm != null ? Math.round(byArm - R) : null };
  });
  return { shots, frames: list.length, ballFrames, H, parts };
}

function score(clip, got) {
  const used = new Set();
  return clip.shots.map((want) => {
    let best = null;
    got.shots.forEach((s, i) => {
      if (used.has(i)) return;
      const ref = s.release != null ? s.release : s.t - 0.6;
      const d = Math.abs(ref - want.release);
      if (d <= 2 && (!best || d < best.d)) best = { s, i, d };
    });
    if (!best) return { want, found: false };
    used.add(best.i);
    const s = best.s;
    return {
      want, found: true, made: s.made,
      madeRight: want.made == null ? null : s.made === want.made,
      releaseErrMs: s.release != null ? Math.round((s.release - want.release) * 1000) : null,
      releaseBy: s.releaseBy,
      feetErrPx: want.feet && s.feet ? Math.round(Math.hypot(s.feet[0] - want.feet[0], s.feet[1] - want.feet[1]) * 10) / 10 : null,
      feetBy: s.feetBy,
      bodyHeight: s.bodyHeight,
    };
  }).concat(got.shots.filter((_, i) => !used.has(i)).map((s) => ({ extra: true, s })));
}

function summary(name, rows) {
  const labelled = rows.filter((r) => r.want);
  const found = labelled.filter((r) => r.found);
  const judged = found.filter((r) => r.madeRight !== null);
  const rel = found.filter((r) => r.releaseErrMs != null).map((r) => Math.abs(r.releaseErrMs));
  const feet = found.filter((r) => r.feetErrPx != null);
  const out = {
    name,
    shotsLabelled: labelled.length,
    shotsFound: found.length,
    falseShots: rows.filter((r) => r.extra).length,
    makeMissRight: `${judged.filter((r) => r.madeRight).length}/${judged.length}`,
    makeMissNotSure: found.filter((r) => r.made == null).length,
    releaseMedianAbsMs: median(rel),
    feetMedianErrPx: median(feet.map((r) => r.feetErrPx)),
    feetPlaced: `${feet.length}/${found.length}`,
  };
  console.log(JSON.stringify(out));
  return out;
}

const report = { withoutPose: [], withPose: [] };
for (const usePose of poses ? [false, true] : [false]) {
  const all = [];
  const parts = [];
  labels.clips.forEach((clip) => {
    const got = run(clip, usePose);
    const rows = score(clip, got);
    all.push(...rows);
    got.parts.forEach((p) => { parts.push(p); console.log(`    parts: feet ${usePose ? `body ${p.feetPoseErrPx} px` : `motion ${p.feetMotionErrPx} px`}, release ${usePose ? `wrists-near-ball ${p.releasePoseErrMs} ms, highest hand ${p.releaseArmErrMs} ms` : `ball rise ${p.releaseBallErrMs} ms`}${p.bodyHeightPx ? `, body ${Math.round(p.bodyHeightPx)} px tall` : ''}`); });
    console.log(`${usePose ? 'pose  ' : 'motion'} ${clip.file}: ${got.frames} frames, ball seen in ${got.ballFrames}; shots ${got.shots.map((s) => `${s.t.toFixed(2)}s ${s.made === true ? 'make' : s.made === false ? 'miss' : '?'}`).join(', ') || 'none'}`);
    rows.forEach((r) => { if (r.want) console.log(`    label ${r.want.release}s ${r.want.made ? 'make' : r.want.made === false ? 'miss' : '?'} -> ${r.found ? `found (${r.made === true ? 'make' : r.made === false ? 'miss' : 'not sure'}), release ${r.releaseErrMs} ms by ${r.releaseBy}, feet ${r.feetErrPx} px by ${r.feetBy}` : 'not found'}`); });
  });
  const sum = summary(usePose ? 'with body tracking' : 'motion only (before)', all);
  const vals = (k) => parts.map((p) => p[k]).filter((v) => v != null);
  const feetK = usePose ? 'feetPoseErrPx' : 'feetMotionErrPx';
  const relK = usePose ? 'releasePoseErrMs' : 'releaseBallErrMs';
  sum.atLabelledShot = {
    feetFound: `${vals(feetK).length}/${parts.length}`,
    feetMedianErrPx: median(vals(feetK)),
    feetWithin10px: `${vals(feetK).filter((v) => v <= 10).length}/${parts.length}`,
    releaseFound: `${vals(relK).length}/${parts.length}`,
    releaseMedianAbsMs: median(vals(relK).map(Math.abs)),
    releaseWithin100ms: `${vals(relK).filter((v) => Math.abs(v) <= 100).length}/${parts.length}`,
  };
  if (usePose) Object.assign(sum.atLabelledShot, {
    releaseArmFound: `${vals('releaseArmErrMs').length}/${parts.length}`,
    releaseArmMedianAbsMs: median(vals('releaseArmErrMs').map(Math.abs)),
    releaseArmWithin100ms: `${vals('releaseArmErrMs').filter((v) => Math.abs(v) <= 100).length}/${parts.length}`,
  });
  console.log('  at the labelled shot:', JSON.stringify(sum.atLabelledShot));
  report[usePose ? 'withPose' : 'withoutPose'] = sum;
}
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(report, null, 1));
