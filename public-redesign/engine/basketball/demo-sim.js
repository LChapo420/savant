/* Drawn scenes that stand in for the camera on the testbed page (demo.html)
 * only: no lesson page loads this file.
 *
 *   PolymathBallSim.shot()   a gym seen by a phone propped behind the shooter:
 *                            floor lines, backboard, rim, a shooter moving
 *                            between spots, shots alternating made and missed
 *   PolymathBallSim.handle() a player seen by the front camera, dribbling, one
 *                            hand reaching for whichever target is lit
 *
 * Each returns a frame source like the camera's: { width, height, draw(ctx, now, state), stop() }.
 * The shot scene also keeps `truth` (each finished shot: where from, made or not)
 * and `hints` (where the rim's edges and the landmarks are in the picture), so
 * a tester can check what the tracker reports.
 */
(function (global) {
  var W = 320;
  var H = 240;

  // A pinhole camera near half court, 7 ft up, looking at the rim: the whole
  // half court in view, so the ball is only a few pixels across, as on a phone.
  // Court axes: x across (left is low x as the shooter faces the rim), y from
  // the baseline, z up.
  var CAM = { x: 25, y: 46, z: 7 };
  var LOOK = { x: 25, y: 6, z: 4 };
  var F = 230;
  var fwd = norm(sub(LOOK, CAM));
  var right = { x: 1, y: 0, z: 0 };
  var up = norm(sub({ x: 0, y: 0, z: 1 }, scale(fwd, fwd.z)));

  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function scale(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
  function dotp(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function norm(a) { var l = Math.sqrt(dotp(a, a)); return scale(a, 1 / l); }
  /** Court feet (and height) to picture pixels, with the depth for sizing. */
  function project(x, y, z) {
    var p = sub({ x: x, y: y, z: z || 0 }, CAM);
    var depth = dotp(p, fwd);
    return { x: W / 2 + (F * dotp(p, right)) / depth, y: H / 2 - (F * dotp(p, up)) / depth, depth: depth };
  }
  function line(ctx, pts, colour, width) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(function (q, i) { var s = project(q[0], q[1], q[2]); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    ctx.stroke();
  }

  function gym(ctx) {
    ctx.fillStyle = 'rgb(90,100,120)';
    ctx.fillRect(0, 0, W, H);
    // The floor, from the baseline to the camera.
    var corners = [[-5, 0], [55, 0], [55, 44], [-5, 44]].map(function (c) { return project(c[0], c[1], 0); });
    ctx.fillStyle = 'rgb(194,129,74)';
    ctx.beginPath();
    corners.forEach(function (s, i) { if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    ctx.fill();
    var white = 'rgb(240,240,240)';
    line(ctx, [[0, 0], [50, 0]], white, 1.5);
    line(ctx, [[17, 0], [17, 19], [33, 19], [33, 0]], white, 1.5);
    line(ctx, [[3, 0], [3, 14]], white, 1.5);
    line(ctx, [[47, 0], [47, 14]], white, 1.5);
    var arc = [];
    for (var a = -1; a <= 1.0001; a += 0.05) {
      var ang = Math.asin(Math.max(-1, Math.min(1, a * 22 / 23.75)));
      arc.push([25 + 23.75 * Math.sin(ang), 5.25 + 23.75 * Math.cos(ang), 0]);
    }
    line(ctx, arc, white, 1.5);
    // The backboard, then the rim in front of it.
    var b = [[22, 4, 9], [28, 4, 9], [28, 4, 12.5], [22, 4, 12.5]].map(function (c) { return project(c[0], c[1], c[2]); });
    ctx.fillStyle = 'rgb(235,235,235)';
    ctx.beginPath();
    b.forEach(function (s, i) { if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    ctx.fill();
    var ring = [];
    for (var k = 0; k <= 24; k++) ring.push([25 + 0.75 * Math.cos((k / 24) * Math.PI * 2), 5.25 + 0.75 * Math.sin((k / 24) * Math.PI * 2), 10]);
    line(ctx, ring, 'rgb(220,90,30)', 2);
  }

  function shooter(ctx, x, y, lift) {
    var feet = project(x, y, lift);
    var head = project(x, y, lift + 6);
    var w = (F * 1.6) / feet.depth;
    ctx.fillStyle = 'rgb(40,50,90)';
    ctx.fillRect(feet.x - w / 2, head.y, w, feet.y - head.y);
    ctx.beginPath();
    ctx.arc(head.x, head.y, w / 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function ball(ctx, x, y, z) {
    var s = project(x, y, z);
    ctx.fillStyle = 'rgb(215,100,35)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(2, (F * 0.39) / s.depth), 0, Math.PI * 2);
    ctx.fill();
  }

  var SPOTS = [[25, 19], [17, 12], [33, 12], [2, 3], [12, 22], [25, 30], [38, 21]];
  var MADE = [true, false, true, true, false, true, false];
  var MISS = [[-1.6, 0.4], [1.7, -0.2]];
  var CYCLE = 3400;
  var GATHER = 600;
  var FLIGHT = 1300;

  function shot() {
    var t0 = null;
    var truth = [];
    var src = {
      width: W,
      height: H,
      truth: truth,
      hints: {
        rimLeft: [project(24.25, 5.25, 10).x, project(24.25, 5.25, 10).y],
        rimRight: [project(25.75, 5.25, 10).x, project(25.75, 5.25, 10).y],
        landmarks: {},
      },
      draw: function (ctx, now) {
        if (t0 === null) t0 = now;
        gym(ctx);
        var e = now - t0 - 1500; // a second and a half of empty gym while the phone is set up
        if (e < 0) return;
        var n = Math.floor(e / CYCLE);
        var t = e - n * CYCLE;
        var spot = SPOTS[n % SPOTS.length];
        var made = MADE[n % MADE.length];
        var lift = t > GATHER - 250 && t < GATHER + 250 ? 0.4 * Math.sin(((t - GATHER + 250) / 500) * Math.PI) : 0;
        shooter(ctx, spot[0], spot[1], lift);
        if (t < GATHER) {
          ball(ctx, spot[0] + 0.3, spot[1] - 0.4, 3.5 + (3.5 * t) / GATHER);
        } else if (t < GATHER + FLIGHT * 1.5) {
          var s = (t - GATHER) / FLIGHT;
          var off = made ? [0, 0] : MISS[Math.floor(n / 2) % 2];
          var tx = 25 + off[0];
          var ty = 5.25 + off[1];
          var z = 7 + 3 * s + 4 * 5 * s * (1 - s);
          if (z > 0.4) ball(ctx, spot[0] + (tx - spot[0]) * s, spot[1] + (ty - spot[1]) * s, z);
        }
        if (t >= GATHER + FLIGHT * 1.5 && truth.length <= n) truth.push({ spot: spot.slice(), made: made });
      },
      stop: function () {},
    };
    ['ft_left', 'ft_right', 'lane_right', 'lane_left', 'corner_left', 'corner_right', 'ft_middle', 'arc_top'].forEach(function (k) {
      var at = global.PolymathTracking.LANDMARKS[k].at;
      var s = project(at[0], at[1], 0);
      src.hints.landmarks[k] = [s.x, s.y];
    });
    return src;
  }

  function handle() {
    var started = null;
    var reach = null;
    var src = {
      width: W,
      height: H,
      draw: function (ctx, now, state) {
        if (started === null) started = now;
        ctx.fillStyle = 'rgb(120,130,140)';
        ctx.fillRect(0, 0, W, H);
        // The player, facing the phone.
        ctx.fillStyle = 'rgb(30,40,70)';
        ctx.fillRect(130, 70, 60, 110);
        ctx.fillRect(135, 180, 20, 60);
        ctx.fillRect(165, 180, 20, 60);
        ctx.fillStyle = 'rgb(180,140,120)';
        ctx.beginPath();
        ctx.arc(160, 50, 18, 0, Math.PI * 2);
        ctx.fill();
        // The dribble: the ball bouncing low on the right.
        var b = Math.abs(Math.sin((now - started) / 180));
        ctx.fillStyle = 'rgb(215,100,35)';
        ctx.beginPath();
        ctx.arc(215, 230 - 50 * b, 11, 0, Math.PI * 2);
        ctx.fill();
        // The free hand: rests by the hip, reaches a lit target after a human pause.
        var target = state && state.target;
        var key = target ? target.join(',') : null;
        if (key && (!reach || reach.key !== key)) reach = { key: key, at: now };
        if (!key) reach = null;
        var rest = [115, 150];
        var hand = rest;
        if (reach) {
          var dt = now - reach.at - 550;
          var k = Math.max(0, Math.min(1, dt / 180));
          hand = [rest[0] + (target[0] - rest[0]) * k, rest[1] + (target[1] - rest[1]) * k];
        }
        ctx.strokeStyle = 'rgb(180,140,120)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(135, 85);
        ctx.lineTo(hand[0], hand[1]);
        ctx.stroke();
        ctx.fillStyle = 'rgb(180,140,120)';
        ctx.beginPath();
        ctx.arc(hand[0], hand[1], 14, 0, Math.PI * 2);
        ctx.fill();
      },
      stop: function () {},
    };
    return src;
  }

  global.PolymathBallSim = { shot: shot, handle: handle, project: project };
})(window);
