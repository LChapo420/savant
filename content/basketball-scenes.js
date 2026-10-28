/**
 * Basketball decision scenes for the stage checks: drawn plays on the app's
 * SVG half court (public/engine/basketball/court.js, the same frames the
 * Basketball_Play block uses), paused at the moment of decision, with one right
 * read. They stand in for decision clips until clips are licensed or filmed
 * with consent (SKILL-CURRICULA.md; basketball progression
 * decision_clip_test_design).
 *
 * The right answer is not authored by hand: every scene is drawn for an
 * intended read and kept only when `read(scene)` — a rule that looks at the
 * players' positions alone (who is open, who helped, who is in the lane, how
 * many defenders are back, what shape the defence makes, the shot clock) —
 * gives that read with clear margins. So the picture decides the key, and the
 * test re-derives every key from the positions.
 *
 *   2v1          BB1   pass, shoot or dribble
 *   3v3          BB2   the open teammate, drive, hold; off the ball: cut, fill, stay
 *   4v4          BB3   pass left/right, outside/inside, or drive (each scene twice, Rösch-style blocks)
 *   ball_screen  BB4-5 use it, reject it, hit the roller, pull up
 *   kick         BB4-5 drive and kick: the man whose defender helped, or finish
 *   transition   BB4-5, BB6-7  3v2 and numbers back
 *   zone         BB6-7 man-to-man, 2-3, 3-2 or 1-3-1
 *   late_clock   BB6-7 shoot, drive, pass or reset by the shot clock
 *
 * Coordinates are court.js's: feet, x 0-50 across, y 0-47 from the baseline, the rim at (25, 5.25).
 * Defence and live decisions are never machine-graded: every scene is an attacking read.
 */
'use strict';

const RIM = { x: 25, y: 5.25 };
const P = (x, y) => ({ x: Math.max(1, Math.min(49, x)), y: Math.max(1, Math.min(46, y)) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const add = (a, dx, dy) => P(a.x + dx, a.y + dy);
const toward = (a, b, d) => { const L = dist(a, b) || 1; return P(a.x + ((b.x - a.x) / L) * d, a.y + ((b.y - a.y) / L) * d); };
/** Distance from p to the segment a-b. */
function segDist(p, a, b) {
  const vx = b.x - a.x; const vy = b.y - a.y;
  const L2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
const U = (rnd, lo, hi) => lo + rnd() * (hi - lo);
const pick = (xs, rnd) => xs[Math.floor(rnd() * xs.length)];
const round = (p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];

/** court.js frames from named positions: {o1: You, o2.., d1..}. */
function frame(pos, ball, labels) {
  const players = {};
  for (const id of Object.keys(pos)) players[id] = round(pos[id]);
  return { players, ball, labels };
}

const CHOICES = {
  '2v1': ['Pass', 'Shoot', 'Dribble'],
  '3v3_ball': ['Pass to A', 'Pass to B', 'Drive to the basket', 'Hold the ball and reset'],
  '3v3_off': ['Cut to the basket', 'Fill the open spot', 'Stay and space'],
  '4v4': ['Pass left, outside', 'Pass right, outside', 'Pass inside to the post', 'Drive inside yourself'],
  ball_screen: ['Use the screen and drive', 'Reject the screen', 'Pass to the roller', 'Pull-up jumper'],
  kick: ['Kick to A', 'Kick to B', 'Kick to C', 'Finish at the rim'],
  transition: ['Pass to A', 'Pass to B', 'Attack the rim', 'Pull it out and set up'],
  zone: ['Man-to-man', '2-3 zone', '3-2 zone', '1-3-1 zone'],
  late_clock: ['Shoot now', 'Drive', 'Pass to the open teammate', 'Reset the offence'],
};

const nearestD = (scene, p) => Math.min(...scene.d.map((d) => dist(d, p)));

// ── the reads: the key from the positions alone ─────────────────────────────

/**
 * The right read of a scene from where the players stand (frame 1), or null
 * when the picture is not clear enough to have one right answer.
 * `scene` = { kind, you, mates: {A, B, ...}, d: [defenders], ball_with, before: {mates}, clock }
 */
function read(sc) {
  const you = sc.you;
  // A lane: the path from just past the ball (4.5 ft along, beyond the man guarding it) to the target.
  const laneTo = (p) => { const from = toward(you, p, Math.min(4.5, dist(you, p) / 2)); return Math.min(...sc.d.map((d) => segDist(d, from, p))); };
  // A passing lane: help defenders only (the man on the ball, within 4.5 ft, cannot cut off a pass that is not straight past him).
  const passLane = (p) => Math.min(99, ...sc.d.filter((d) => dist(d, you) > 4.5).map((d) => segDist(d, you, p)));
  const open = (p) => nearestD(sc, p) >= 7 && passLane(p) >= 3;
  const covered = (p) => nearestD(sc, p) <= 3.6;
  const mates = Object.entries(sc.mates);
  if (sc.kind === '2v1') {
    const d = sc.d[0];
    const inFront = dist(d, you) <= 4 && segDist(d, you, RIM) <= 2;
    if (inFront && open(sc.mates.A)) return 'Pass';
    if (inFront) return null;
    if (dist(you, RIM) <= 9.5 && segDist(d, you, RIM) >= 4.5) return 'Shoot';
    if (dist(you, RIM) >= 14 && segDist(d, you, RIM) >= 5 && !open(sc.mates.A)) return 'Dribble';
    return null;
  }
  if (sc.kind === '3v3_ball' || sc.kind === '4v4') {
    const opens = mates.filter(([, p]) => open(p));
    const tight = mates.filter(([, p]) => covered(p));
    const laneOpen = laneTo(RIM) >= 3.2;
    if (opens.length === 1 && tight.length === mates.length - 1 && !laneOpen) {
      const name = opens[0][0];
      if (sc.kind === '3v3_ball') return `Pass to ${name}`;
      return { A: 'Pass left, outside', B: 'Pass right, outside', C: 'Pass inside to the post' }[name];
    }
    if (!opens.length && tight.length === mates.length) return laneOpen ? (sc.kind === '4v4' ? 'Drive inside yourself' : 'Drive to the basket') : (sc.kind === '3v3_ball' ? 'Hold the ball and reset' : null);
    return null;
  }
  if (sc.kind === '3v3_off') {
    const handler = sc.mates[sc.ball_with];
    const cutter = Object.keys(sc.mates).find((k) => sc.before && sc.before[k] && dist(sc.before[k], RIM) - dist(sc.mates[k], RIM) >= 10);
    const myD = sc.d[0];
    const denied = dist(myD, you) <= 3.5 && segDist(myD, you, handler) <= 1.5;
    const sagged = dist(myD, you) >= 8;
    if (cutter && !denied && !sagged) return 'Fill the open spot';
    if (!cutter && denied) return 'Cut to the basket';
    if (!cutter && sagged) return 'Stay and space';
    return null;
  }
  if (sc.kind === 'ball_screen') {
    const S = sc.mates.S;
    const d1 = sc.d[0];
    const side = Math.sign(S.x - you.x) || 1;
    const onBall = sc.d.filter((d) => dist(d, you) <= 4.2).length;
    if (onBall >= 2) return open(S) ? 'Pass to the roller' : null;
    // under: the on-ball defender went below the screen and nobody is near the ball
    if (d1.y < you.y - 4 && nearestD(sc, you) >= 5.5) return 'Pull-up jumper';
    // top lock: the on-ball defender sits between the ball and the screen, the other side open
    const between = Math.sign(d1.x - you.x) === side && Math.abs(d1.y - you.y) <= 1.5 && dist(d1, you) <= 3.5;
    const away = add(you, -side * 9, -7);
    if (between) return nearestD(sc, away) >= 6 ? 'Reject the screen' : null;
    // trailing: the on-ball defender is behind the ball, the screener's defender stays home, the lane past the screen is clear
    const lane = [add(S, side * 1.5, -3), P(25 + side * 6, 10)];
    const home = sc.d.slice(1).some((d) => dist(d, S) <= 3.2);
    if (d1.y > you.y + 0.8 && home && Math.min(...sc.d.map((d) => segDist(d, lane[0], lane[1]))) >= 3) return 'Use the screen and drive';
    return null;
  }
  if (sc.kind === 'kick') {
    const helpers = sc.d.slice(1).filter((d) => segDist(d, you, RIM) <= 3 || dist(d, you) <= 3.5);
    const opens = mates.filter(([, p]) => nearestD(sc, p) >= 8);
    if (!helpers.length && laneTo(RIM) >= 3 && mates.every(([, p]) => covered(p))) return 'Finish at the rim';
    if (helpers.length === 1 && opens.length === 1) return `Kick to ${opens[0][0]}`;
    return null;
  }
  if (sc.kind === 'transition') {
    if (sc.d.length >= 3) return mates.every(([, p]) => covered(p)) && laneTo(RIM) < 3 ? 'Pull it out and set up' : null;
    const opens = mates.filter(([, p]) => nearestD(sc, p) >= 8);
    if (opens.length === 1 && sc.d.some((d) => dist(d, you) <= 4)) return `Pass to ${opens[0][0]}`;
    if (!opens.length && mates.every(([, p]) => covered(p)) && laneTo(RIM) >= 4) return 'Attack the rim';
    return null;
  }
  if (sc.kind === 'zone') {
    const offence = [you, ...mates.map(([, p]) => p)];
    const used = new Set();
    const manned = sc.d.every((d) => { const i = offence.findIndex((o, k) => !used.has(k) && dist(o, d) <= 3.6); if (i < 0) return false; used.add(i); return true; });
    if (manned) return 'Man-to-man';
    const high = sc.d.filter((d) => d.y >= 16).length;
    const top = sc.d.filter((d) => d.y >= 21).length;
    const low = sc.d.filter((d) => d.y <= 6.5).length;
    const middle = sc.d.filter((d) => d.y > 10 && d.y < 19).length;
    if (top === 1 && low === 1 && middle === 3) return '1-3-1 zone';
    if (high === 2 && sc.d.filter((d) => d.y <= 10).length === 3) return '2-3 zone';
    if (high === 3 && sc.d.filter((d) => d.y <= 10).length === 2) return '3-2 zone';
    return null;
  }
  if (sc.kind === 'late_clock') {
    const opens = mates.filter(([, p]) => open(p));
    const myD = nearestD(sc, you);
    if (sc.clock <= 4) {
      if (myD >= 5.5) return 'Shoot now';
      if (myD <= 3 && laneTo(RIM) >= 3.2) return 'Drive';
      return null;
    }
    if (sc.clock >= 9 && opens.length === 1) return 'Pass to the open teammate';
    if (sc.clock >= 14 && !opens.length && mates.every(([, p]) => covered(p)) && laneTo(RIM) < 3) return 'Reset the offence';
    return null;
  }
  return null;
}

// ── drawing a scene for an intended read ────────────────────────────────────

const deny = (man, ball, d = 2.6) => toward(man, ball, d); // between his man and the ball
const goalSide = (man, d = 3) => toward(man, RIM, d); //    between his man and the rim
const helpFrom = (man, rnd) => toward(man, P(25, 12), U(rnd, 9.5, 12));

function draw(kind, answer, rnd) {
  const sc = { kind, mates: {}, d: [], clock: null };
  const side = rnd() < 0.5 ? -1 : 1;
  if (kind === '2v1') {
    if (answer === 'Pass') {
      sc.you = P(25 + U(rnd, -5, 5), U(rnd, 12, 18));
      sc.mates.A = P(sc.you.x + side * U(rnd, 10, 14), U(rnd, 6, 12));
      sc.d = [add(toward(sc.you, RIM, 3), U(rnd, -0.6, 0.6), 0)];
    } else if (answer === 'Shoot') {
      sc.you = P(25 + U(rnd, -4, 4), U(rnd, 8, 11));
      sc.mates.A = P(sc.you.x + side * U(rnd, 11, 15), U(rnd, 6, 14));
      sc.d = [toward(sc.mates.A, RIM, 2)];
    } else {
      sc.you = P(25 + U(rnd, -6, 6), U(rnd, 20, 26));
      sc.mates.A = P(sc.you.x + side * U(rnd, 10, 14), U(rnd, 10, 16));
      const t = U(rnd, 0.65, 0.8);
      sc.d = [P(sc.you.x + (sc.mates.A.x - sc.you.x) * t, sc.you.y + (sc.mates.A.y - sc.you.y) * t)];
    }
    sc.before = { A: add(sc.mates.A, 0, 8) };
    sc.youBefore = add(sc.you, 0, 8);
    sc.dBefore = [P(25, 10)];
  } else if (kind === '3v3_ball') {
    sc.you = P(25 + U(rnd, -3, 3), U(rnd, 24, 27));
    sc.mates.A = P(8 + U(rnd, -2, 2), U(rnd, 15, 19));
    sc.mates.B = P(42 + U(rnd, -2, 2), U(rnd, 15, 19));
    const front = toward(sc.you, RIM, 3);
    if (answer === 'Pass to A') sc.d = [front, helpFrom(sc.mates.A, rnd), deny(sc.mates.B, sc.you)];
    else if (answer === 'Pass to B') sc.d = [front, deny(sc.mates.A, sc.you), helpFrom(sc.mates.B, rnd)];
    else if (answer === 'Drive to the basket') sc.d = [add(sc.you, side * 3.8, 1.2), deny(sc.mates.A, sc.you), deny(sc.mates.B, sc.you)];
    else sc.d = [front, deny(sc.mates.A, sc.you), deny(sc.mates.B, sc.you)];
  } else if (kind === '3v3_off') {
    sc.ball_with = 'A';
    sc.mates.A = P(25 + side * U(rnd, 2, 5), U(rnd, 24, 27));
    if (answer === 'Fill the open spot') {
      sc.you = P(46 - U(rnd, 0, 2), U(rnd, 2.5, 4.5));
      sc.mates.B = P(27 + U(rnd, -2, 2), U(rnd, 6, 8));
      sc.before = { A: sc.mates.A, B: P(37 + U(rnd, -2, 2), U(rnd, 20, 23)) };
      sc.d = [goalSide(sc.you, 4.5), goalSide(sc.mates.A, 3), toward(sc.mates.B, RIM, 1.5)];
    } else {
      sc.you = P(42 + U(rnd, -2, 2), U(rnd, 15, 19));
      sc.mates.B = P(8 + U(rnd, -2, 2), U(rnd, 15, 19));
      sc.before = { A: sc.mates.A, B: sc.mates.B };
      const myD = answer === 'Cut to the basket' ? deny(sc.you, sc.mates.A, 2.6) : toward(sc.you, P(25, 12), U(rnd, 9, 11));
      sc.d = [myD, goalSide(sc.mates.A, 3), deny(sc.mates.B, sc.mates.A)];
    }
  } else if (kind === '4v4') {
    sc.you = P(25 + U(rnd, -2, 2), U(rnd, 24, 27));
    sc.mates.A = P(9 + U(rnd, -2, 2), U(rnd, 15, 19));
    sc.mates.B = P(41 + U(rnd, -2, 2), U(rnd, 15, 19));
    sc.mates.C = P(25 + side * 6 + U(rnd, -1, 1), U(rnd, 7, 9.5));
    const front = toward(sc.you, RIM, 3);
    const dA = answer === 'Pass left, outside' ? helpFrom(sc.mates.A, rnd) : deny(sc.mates.A, sc.you);
    const dB = answer === 'Pass right, outside' ? helpFrom(sc.mates.B, rnd) : deny(sc.mates.B, sc.you);
    const dC = answer === 'Pass inside to the post' ? toward(sc.mates.C, P(25 - side * 12, 9), U(rnd, 9, 11)) : deny(sc.mates.C, sc.you, 2.2);
    const d1 = answer === 'Drive inside yourself' ? add(sc.you, side * 3.8, 1.2) : front;
    sc.d = [d1, dA, dB, dC];
  } else if (kind === 'ball_screen') {
    sc.you = P(25 + side * 1, U(rnd, 24.5, 26));
    sc.mates.S = add(sc.you, side * 3, -0.5);
    sc.mates.A = P(25 - side * 17 + U(rnd, -1.5, 1.5), U(rnd, 15, 19));
    sc.mates.B = P(25 + side * 21 + U(rnd, -1, 1), U(rnd, 2.5, 5));
    const tightA = deny(sc.mates.A, sc.you);
    const tightB = deny(sc.mates.B, sc.you, 2.4);
    if (answer === 'Pull-up jumper') sc.d = [add(sc.mates.S, U(rnd, -1, 1), -U(rnd, 5.5, 7)), P(25 + side * 2, U(rnd, 12, 14)), tightA, tightB];
    else if (answer === 'Pass to the roller') {
      sc.mates.S = P(25 + side * 2.5, U(rnd, 11, 13.5));
      sc.d = [add(sc.you, -side * 2, 0.6), add(sc.you, side * 2.2, -1), tightA, tightB];
    } else if (answer === 'Reject the screen') sc.d = [add(sc.you, side * 2.4, 0), add(sc.mates.S, 0, -U(rnd, 5, 7)), tightA, tightB];
    else sc.d = [add(sc.you, -side * 0.8, 2.3), add(sc.mates.S, side * 1.5, 1.2), tightA, tightB];
    sc.before = { S: add(sc.you, side * 3, -0.5), A: sc.mates.A, B: sc.mates.B };
    sc.youBefore = add(sc.you, -side * 3, 2);
  } else if (kind === 'kick') {
    sc.you = P(25 + U(rnd, -4, 4), U(rnd, 10, 12));
    sc.mates.A = P(7 + U(rnd, -1.5, 1.5), U(rnd, 16, 19));
    sc.mates.B = P(43 + U(rnd, -1.5, 1.5), U(rnd, 16, 19));
    sc.mates.C = P(side < 0 ? 3 : 47, U(rnd, 2.5, 4.5));
    const d1 = add(sc.you, U(rnd, -1, 1), 3);
    const helper = answer === 'Finish at the rim' ? null : ({ 'Kick to A': 'A', 'Kick to B': 'B', 'Kick to C': 'C' })[answer];
    const dOf = (k) => (k === helper ? add(toward(sc.you, RIM, 2.4), U(rnd, -0.8, 0.8), 0) : goalSide(sc.mates[k], 2.6));
    sc.d = [d1, dOf('A'), dOf('B'), dOf('C')];
    sc.youBefore = P(sc.you.x, 25);
  } else if (kind === 'transition') {
    sc.you = P(25 + U(rnd, -2, 2), U(rnd, 21, 24));
    sc.mates.A = P(10 + U(rnd, -2, 2), U(rnd, 14, 18));
    sc.mates.B = P(40 + U(rnd, -2, 2), U(rnd, 14, 18));
    const top = toward(sc.you, RIM, 3);
    if (answer === 'Pass to A') sc.d = [top, goalSide(sc.mates.B, 2.5)];
    else if (answer === 'Pass to B') sc.d = [top, goalSide(sc.mates.A, 2.5)];
    else if (answer === 'Attack the rim') sc.d = [goalSide(sc.mates.A, 2.5), goalSide(sc.mates.B, 2.5)];
    else sc.d = [top, goalSide(sc.mates.A, 2.5), goalSide(sc.mates.B, 2.5)];
    sc.youBefore = add(sc.you, 0, 16);
  } else if (kind === 'zone') {
    sc.you = P(25 + U(rnd, -2, 2), U(rnd, 25, 27));
    sc.mates.A = P(8 + U(rnd, -1.5, 1.5), U(rnd, 17, 19));
    sc.mates.B = P(42 + U(rnd, -1.5, 1.5), U(rnd, 17, 19));
    sc.mates.C = P(U(rnd, 2.5, 4.5), U(rnd, 2.5, 5));
    sc.mates.D = P(U(rnd, 45.5, 47.5), U(rnd, 2.5, 5));
    const j = (x, y) => P(x + U(rnd, -1.2, 1.2), y + U(rnd, -1, 1));
    if (answer === 'Man-to-man') sc.d = [sc.you, sc.mates.A, sc.mates.B, sc.mates.C, sc.mates.D].map((m) => goalSide(m, U(rnd, 2.4, 3)));
    else if (answer === '2-3 zone') sc.d = [j(18, 20.5), j(32, 20.5), j(11, 8), j(25, 6.5), j(39, 8)];
    else if (answer === '3-2 zone') sc.d = [j(25, 22.5), j(12, 17.5), j(38, 17.5), j(18, 8), j(32, 8)];
    else sc.d = [j(25, 23), j(10, 14.5), j(25, 14), j(40, 14.5), P(25 + U(rnd, -1.5, 1.5), U(rnd, 3.5, 5))];
  } else if (kind === 'late_clock') {
    sc.you = P(25 + side * U(rnd, 4, 9), U(rnd, 21, 25));
    sc.mates.A = P(25 - side * 17, U(rnd, 15, 19));
    sc.mates.B = P(25 + side * 21, U(rnd, 2.5, 5));
    const tightA = deny(sc.mates.A, sc.you);
    const tightB = deny(sc.mates.B, sc.you, 2.4);
    if (answer === 'Shoot now') { sc.clock = pick([2, 3, 4], rnd); sc.d = [toward(sc.you, RIM, U(rnd, 6, 8)), tightA, tightB]; }
    else if (answer === 'Drive') { sc.clock = pick([2, 3, 4], rnd); sc.d = [add(sc.you, side * 2.6, 0.8), tightA, tightB]; }
    else if (answer === 'Pass to the open teammate') { sc.clock = pick([9, 11, 13, 15], rnd); sc.d = [toward(sc.you, RIM, 3), helpFrom(sc.mates.A, rnd), tightB]; }
    else { sc.clock = pick([15, 17, 19, 21], rnd); sc.d = [toward(sc.you, RIM, 2.8), tightA, tightB]; }
  }
  return sc;
}

/** The scene as court.js frames and a page item; `answer` and `why` stay in the key. */
function toItem(sc, answer, kind) {
  const labels = { o1: 'You' };
  const pos = { o1: sc.you };
  const posBefore = { o1: sc.youBefore || sc.you };
  const names = Object.keys(sc.mates);
  names.forEach((k, i) => { pos[`o${i + 2}`] = sc.mates[k]; posBefore[`o${i + 2}`] = (sc.before && sc.before[k]) || sc.mates[k]; labels[`o${i + 2}`] = k; });
  sc.d.forEach((d, i) => { pos[`d${i + 1}`] = d; posBefore[`d${i + 1}`] = (sc.dBefore && sc.dBefore[i]) || d; });
  const ball = sc.ball_with ? `o${names.indexOf(sc.ball_with) + 2}` : 'o1';
  const prompt = {
    '2v1': 'Two of you against one defender. You have the ball. What now?',
    '3v3_ball': 'You have the ball at the top. Where does it go?',
    '3v3_off': 'You do not have the ball: A does. What do you do?',
    '4v4': 'You have the ball. Pick the pass, or drive.',
    ball_screen: 'S comes to set a ball screen for you. Read the defence.',
    kick: 'You have driven into the lane. What now?',
    transition: 'You lead the fast break with the ball. What now?',
    zone: 'You bring the ball up. What defence are they in?',
    late_clock: `Shot clock: ${sc.clock}. You have the ball. What now?`,
  }[kind];
  return {
    kind: 'scene',
    scene: kind,
    prompt,
    frames: [frame(posBefore, ball, labels), frame(pos, ball, labels)],
    clock: sc.clock,
    choices: CHOICES[kind].slice(),
    key: { type: 'choice', answer, why: WHY[kind] ? WHY[kind](answer) : null },
  };
}

const WHY = {
  '2v1': (a) => ({ Pass: 'The defender stepped up to stop you, so your teammate is free.', Shoot: 'You are close to the rim and the defender stayed with your teammate.', Dribble: 'The defender sits in the passing lane and the way to the rim is open.' })[a],
  '3v3_ball': (a) => (/Pass/.test(a) ? `${a.slice(-1)}'s defender has left to help in the middle.` : /Drive/.test(a) ? 'Your defender is beside you, not in front, and nobody can help.' : 'Everyone is covered and your defender is in front: keep it and reset.'),
  '3v3_off': (a) => ({ 'Cut to the basket': 'Your defender is overplaying the pass, so the space behind him is open.', 'Fill the open spot': 'B cut to the rim and left a gap above you: move up and fill it.', 'Stay and space': 'Your defender sagged off to help, so you are open where you are.' })[a],
  '4v4': (a) => (/Drive/.test(a) ? 'Your defender is beside you and everyone else is covered.' : 'That teammate\'s defender has left him to help.'),
  ball_screen: (a) => ({ 'Pull-up jumper': 'Your defender went under the screen: there is space to shoot above it.', 'Pass to the roller': 'Two defenders came to the ball, so the screener rolling to the rim is free.', 'Reject the screen': 'Your defender is sitting on the screen side: go the other way.', 'Use the screen and drive': 'Your defender is caught behind the screen and the screener\'s defender stayed back on the other side.' })[a],
  kick: (a) => (/Kick/.test(a) ? `${a.slice(-1)}'s defender stepped in front of you: he is open.` : 'Nobody came to help: finish.'),
  transition: (a) => (/Pass/.test(a) ? `The second defender went to the other wing, so ${a.slice(-1)} is open.` : /Attack/.test(a) ? 'Both defenders are on the wings: the middle is open.' : 'Three defenders are back and everyone is covered: set up the offence.'),
  zone: (a) => (a === 'Man-to-man' ? 'Every defender stands next to one attacker.' : `The defenders stand in a ${a.replace(' zone', '')} shape, guarding areas, not players.`),
  late_clock: (a) => ({ 'Shoot now': 'The clock is almost out and your defender is off you.', Drive: 'The clock is almost out and your defender is tight: go past him.', 'Pass to the open teammate': 'There is time, and one teammate is open.', 'Reset the offence': 'There is plenty of time and nothing is open.' })[a],
};

/** One scene for an intended read, redrawn until read() agrees; null if it cannot. */
function scene(kind, answer, rnd) {
  for (let tries = 0; tries < 80; tries++) {
    const sc = draw(kind, answer, rnd);
    if (read(sc) !== answer) continue;
    const item = toItem(sc, answer, kind);
    // the key must hold on the positions the page draws (rounded to 0.1 ft)
    if (read(fromItem(item)) === answer) return item;
  }
  return null;
}

/** The scene back from a page item (frame 1), for read(): what the test uses to re-derive keys. */
function fromItem(item) {
  const f = item.frames[1];
  const f0 = item.frames[0];
  const pt = (a) => ({ x: a[0], y: a[1] });
  const sc = { kind: item.scene, mates: {}, before: {}, d: [], clock: item.clock };
  for (const id of Object.keys(f.players)) {
    if (id === 'o1') sc.you = pt(f.players[id]);
    else if (/^o/.test(id)) { sc.mates[f.labels[id]] = pt(f.players[id]); sc.before[f.labels[id]] = pt(f0.players[id]); } else sc.d.push(pt(f.players[id]));
  }
  if (f.ball !== 'o1') sc.ball_with = f.labels[f.ball];
  return sc;
}

/**
 * A set of scenes: `mix` is [[kind, count], ...]; the right answers are spread
 * evenly over each kind's options, then shuffled. `twice` shows every scene
 * twice, in two random blocks (Rösch, Schultz & Höner 2021).
 */
function sceneSet(mix, rnd, { twice = false } = {}) {
  const items = [];
  for (const [kind, count] of mix) {
    const opts = CHOICES[kind];
    const answers = [];
    for (let i = 0; i < count; i++) answers.push(opts[i % opts.length]);
    for (const a of answers) {
      const it = scene(kind, a, rnd);
      if (it) items.push(it);
    }
  }
  const shuffle = (xs) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (!twice) return shuffle(items);
  return [...shuffle(items), ...shuffle(items)].map((it) => JSON.parse(JSON.stringify(it)));
}

module.exports = { CHOICES, RIM, read, draw, scene, sceneSet, fromItem, segDist, dist };
