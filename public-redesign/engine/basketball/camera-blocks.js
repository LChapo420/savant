/* The camera blocks: basketball tools that watch through the phone's camera,
 * each with a way to do the same thing by hand when there is no camera.
 *
 *   Basketball_ShotTracker { prompt, shots?, cameraTip? }
 *     The phone, propped up, watches the rim. The learner taps the rim's two
 *     edges and 2-4 court landmarks, then shoots. Each shot is judged made or
 *     missed from the ball coming down through the rim, placed on the court
 *     from where the shooter's feet were, and counted in the same numbers as
 *     the shot log (FG%, eFG%, zones), marked estimated. The learner can fix
 *     any shot: made or missed, its spot, or remove it. Without a camera, shots
 *     are logged by tapping the court.
 *   Basketball_HandleDrill { prompt, rounds?, seconds?, pace?, dribble?, cue? }
 *     Behind the court session's health check. Targets light up; the player
 *     touches each with a hand while dribbling, seen by the front camera as
 *     movement inside the target, or taps them on the screen without a camera.
 *     Timed rounds with hits, misses, reaction times and a score.
 *
 * Every frame is read on this device and dropped: nothing is uploaded or kept.
 * Needs court.js, tracking.js and basketball-blocks.js loaded first. On the
 * testbed page only, window.PolymathBallSim supplies drawn scenes in place of a
 * camera, so the tools can be tried without one.
 */
(function (global) {
  var Court = global.PolymathCourt;
  var Track = global.PolymathTracking;
  var K = global.PolymathBball;
  var el = K.el;
  var button = K.button;
  var TAG = K.TAG;

  var PRIVACY = 'Everything the camera sees stays on this device: no picture or clip is uploaded or saved. If you are under 13, ask a parent before using the camera, and never film other people without asking them.';
  var HONEST_SHOTS = 'How good is the tracking? It looks for an orange ball moving near the rim and calls a make when the ball comes down through the rim. It works best with the phone held still, the whole rim in view, good light and one ball. It can miss a shot, call a shot that rolls round the rim wrongly, or be fooled by a ball passing just in front of the rim. Shot spots come from where your feet were and are often a few feet off; with only two or three landmarks, more. Everything it records is marked estimated: check the list and fix what it got wrong.';
  var HONEST_DRILL = 'The camera sees something new inside the middle of each circle, not your hand itself. Keep the background still (nobody walking behind you), keep the ball low and away from the circles, and hold still while the picture settles.';

  function camStyles() {
    if (document.getElementById(TAG + '__camstyles')) return;
    var t = TAG;
    var st = document.createElement('style');
    st.id = t + '__camstyles';
    st.textContent = [
      '.' + t + '__view{position:relative;width:100%;max-width:460px;margin:8px auto;border-radius:10px;overflow:hidden;background:#000;}',
      '.' + t + '__view canvas{width:100%;display:block;touch-action:manipulation;cursor:crosshair;}',
      '.' + t + '__mini{max-width:200px;margin:4px auto;}',
      '.' + t + '__list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;}',
      '.' + t + '__shot{display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#090d16;border:1px solid #1f293d;border-radius:10px;padding:6px 8px;font-size:14px;}',
      '.' + t + '__shot span{flex:1 1 150px;}',
      '.' + t + '__shot .' + t + '__btn{min-height:36px;padding:0 10px;font-size:13px;}',
      '.' + t + '__pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:380px;margin:10px auto;}',
      '.' + t + '__target{aspect-ratio:1;border-radius:50%;border:2px solid #334155;background:#090d16;color:#94a3b8;font:inherit;font-weight:800;font-size:16px;cursor:pointer;touch-action:manipulation;}',
      '.' + t + '__target.is-live{background:#fbbf24;border-color:#fbbf24;color:#090d16;}',
      '.' + t + '__target.is-hit{background:#34d399;border-color:#34d399;color:#090d16;}',
      '.' + t + '__honest{margin-top:10px;font-size:13px;line-height:1.5;color:#94a3b8;}',
    ].join('');
    document.head.appendChild(st);
  }

  /** Why the camera did not open, in our words: the browser's own message is not for learners. */
  function cameraTrouble(err) {
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was not given.';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found.';
    if (name === 'NotReadableError') return 'The camera is busy in another app.';
    return err && /cannot open the camera/.test(String(err.message)) ? err.message : 'The camera could not be opened.';
  }

  /** Run tick(now) about 30 times a second; a timer stands in when a hidden tab runs no animation frames. */
  function runLoop(tick) {
    var on = true;
    var last = -1e9;
    function schedule() {
      if (!on) return;
      var ran = false;
      var go = function () {
        if (ran || !on) return;
        ran = true;
        var now = performance.now();
        if (now - last >= 30) { last = now; tick(now); }
        schedule();
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
      setTimeout(go, 34);
    }
    schedule();
    return { stop: function () { on = false; } };
  }

  /**
   * Frames from the phone camera ('environment' faces away, 'user' faces the
   * player, shown mirrored), drawn 320 pixels wide: enough to see a ball, cheap
   * enough to read every frame. Or, on the testbed, a drawn scene.
   * Resolves to { width, height, draw(ctx, now, state), stop() }.
   */
  function openSource(kind, facing, simulated) {
    if (simulated) return Promise.resolve(global.PolymathBallSim[kind]());
    if (!global.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('This browser cannot open the camera here.'));
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }).then(function (stream) {
      var video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.srcObject = stream;
      return new Promise(function (resolve) {
        video.onloadedmetadata = function () {
          video.play();
          var w = 320;
          var h = Math.round((w * (video.videoHeight || 480)) / (video.videoWidth || 640));
          var mirror = facing === 'user';
          resolve({
            width: w,
            height: h,
            draw: function (ctx) {
              if (mirror) { ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); }
              ctx.drawImage(video, 0, 0, w, h);
              if (mirror) ctx.restore();
            },
            stop: function () { stream.getTracks().forEach(function (tr) { tr.stop(); }); video.srcObject = null; },
          });
        };
      });
    });
  }

  /** A canvas to read frames from and one to show them on, with taps reported in frame pixels. */
  function makeView(host, source, onTap) {
    var view = el('div', 'view');
    var shown = document.createElement('canvas');
    shown.width = source.width;
    shown.height = source.height;
    shown.setAttribute('aria-label', 'Camera view');
    view.appendChild(shown);
    host.appendChild(view);
    var work = document.createElement('canvas');
    work.width = source.width;
    work.height = source.height;
    var wctx = work.getContext('2d', { willReadFrequently: true });
    var sctx = shown.getContext('2d');
    if (onTap) {
      shown.addEventListener('click', function (e) {
        var r = shown.getBoundingClientRect();
        onTap(((e.clientX - r.left) / r.width) * source.width, ((e.clientY - r.top) / r.height) * source.height);
      });
    }
    return {
      grab: function (now, state) {
        source.draw(wctx, now, state);
        return wctx.getImageData(0, 0, source.width, source.height);
      },
      show: function (frame) { sctx.putImageData(frame, 0, 0); return sctx; },
      ctx: sctx,
      canvas: shown,
    };
  }

  function dot(ctx, x, y, r, colour, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = colour; ctx.fill(); } else { ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.stroke(); }
  }

  // ── Basketball_ShotTracker ─────────────────────────────────────────────────
  var LANDMARK_ORDER = ['ft_left', 'ft_right', 'lane_right', 'lane_left', 'corner_left', 'corner_right', 'ft_middle', 'arc_top'];

  function renderShotTracker(container, data) {
    if (!container) return;
    K.styles();
    camStyles();
    container.innerHTML = '';
    var d = data || {};
    var target = Math.max(0, Math.min(100, Number(d.shots) || 0));
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Shot tracker'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Shoot a set while the phone watches the rim: it counts makes and misses and where you shot from.'));
    card.appendChild(el('p', 'note', PRIVACY));
    var body = el('div');
    card.appendChild(body);
    var status = el('p', 'note', '');
    status.setAttribute('role', 'status');
    card.appendChild(status);
    var chartHost = el('div');
    card.appendChild(chartHost);
    var hand = el('div', 'row');
    var madeBtn = button('Made it');
    var missBtn = button('Missed');
    madeBtn.disabled = true;
    missBtn.disabled = true;
    hand.appendChild(madeBtn);
    hand.appendChild(missBtn);
    card.appendChild(hand);
    var handHint = el('p', 'note', 'Logging by hand: tap the court where a shot was taken, then Made it or Missed.');
    card.appendChild(handHint);
    var stats = el('div', 'stats');
    card.appendChild(stats);
    var summary = el('p', 'note', '');
    card.appendChild(summary);
    var list = el('ul', 'list');
    card.appendChild(list);
    card.appendChild(el('p', 'honest', HONEST_SHOTS));
    container.appendChild(card);

    var shots = [];
    var pending = null;
    var placing = -1;
    var source = null;
    var loop = null;
    // The floor: image pixels to court feet, fixed by the setup's taps.
    var floor = null;

    var chart = Court.create(chartHost, { frames: [], label: 'Shot chart', onTapSpot: function (x, y) {
      if (placing >= 0 && shots[placing]) {
        var s = shots[placing];
        s.x = x;
        s.y = y;
        s.zone = Track.zoneOf(x, y);
        s.fixed = true;
        status.textContent = 'Shot ' + (placing + 1) + ' placed: ' + s.zone + '.';
        placing = -1;
        draw();
        return;
      }
      pending = { x: x, y: y };
      madeBtn.disabled = false;
      missBtn.disabled = false;
      handHint.textContent = 'Shot from here (' + Track.zoneOf(x, y) + '): did it go in?';
    } });

    function logByHand(isMade) {
      if (!pending) return;
      shots.push({ made: isMade, x: pending.x, y: pending.y, zone: Track.zoneOf(pending.x, pending.y), estimated: false, fixed: true });
      pending = null;
      madeBtn.disabled = true;
      missBtn.disabled = true;
      handHint.textContent = 'Tap the court for the next shot.';
      draw();
    }
    madeBtn.addEventListener('click', function () { logByHand(true); });
    missBtn.addEventListener('click', function () { logByHand(false); });

    function draw() {
      chart.clearMarks();
      shots.forEach(function (s) { if (typeof s.x === 'number' && s.made != null) chart.mark(s.x, s.y, s.made ? 'make' : 'miss'); });
      var st = Track.shotStats(shots);
      K.statTiles(stats, st);
      var guessed = shots.filter(function (s) { return s.estimated && !s.fixed; }).length;
      summary.textContent = shots.length
        ? shots.length + ' shot' + (shots.length === 1 ? '' : 's') + (guessed ? ': ' + guessed + ' estimated by the camera and not checked yet' : ': all checked') + (st.undecided ? ', ' + st.undecided + ' not sure (made or missed?)' : '') + (st.unplaced ? ', ' + st.unplaced + ' without a spot' : '') + '. eFG% counts a made three as one and a half makes.'
        : '';
      list.innerHTML = '';
      shots.forEach(function (s, i) {
        var li = el('li', 'shot');
        li.setAttribute('data-shot', String(i));
        var what = s.made === true ? 'Made' : s.made === false ? 'Missed' : 'Not sure';
        li.appendChild(el('span', null, '#' + (i + 1) + ' ' + what + ' · ' + (s.zone || 'no spot yet') + (s.estimated && !s.fixed ? ' · estimated' : s.estimated ? ' · checked' : '')));
        [['Made', function () { s.made = true; s.fixed = true; }], ['Missed', function () { s.made = false; s.fixed = true; }], ['Place', function () { placing = i; status.textContent = 'Tap the court where shot ' + (i + 1) + ' was taken.'; }], ['Remove', function () { shots.splice(i, 1); placing = -1; }]].forEach(function (a) {
          var b = button(a[0]);
          b.addEventListener('click', function () { a[1](); draw(); });
          li.appendChild(b);
        });
        list.appendChild(li);
      });
      if (target && shots.length >= target) status.textContent = 'Set done: ' + shots.length + ' shots. Check the list and fix any shot the camera got wrong.';
    }

    // The start: the camera, or by hand.
    function start() {
      body.innerHTML = '';
      var row = el('div', 'row');
      var cam = button('Use the camera', 'is-primary');
      row.appendChild(cam);
      cam.addEventListener('click', function () { open(false); });
      if (global.PolymathBallSim) {
        var sim = button('Use the simulated camera (testbed)');
        sim.addEventListener('click', function () { open(true); });
        row.appendChild(sim);
      }
      body.appendChild(row);
      body.appendChild(el('p', 'note', 'No camera, or rather not? Log each shot by hand on the court below.'));
    }

    function open(simulated) {
      status.textContent = 'Opening the camera...';
      openSource('shot', 'environment', simulated).then(function (s) {
        source = s;
        setup();
      }).catch(function (err) {
        status.textContent = cameraTrouble(err) + ' Log your shots by hand on the court below.';
      });
    }

    function stopAll() {
      if (loop) loop.stop();
      loop = null;
      if (source) source.stop();
      source = null;
    }

    // Setup: the rim's edges, then the court landmarks.
    function setup() {
      body.innerHTML = '';
      body.appendChild(el('p', 'note', 'Camera: ' + (d.cameraTip || 'prop the phone up so it stays still, behind or beside the shooter, with the whole rim and the floor from the baseline to the free-throw line in view.')));
      var step = el('p', 'prompt', '');
      var taps = { rim: [], img: [], court: [], names: [] };
      var li = 0;
      var view = makeView(body, source, onTap);
      body.appendChild(step);
      var miniHost = el('div', 'mini');
      body.appendChild(miniHost);
      var mini = Court.create(miniHost, { frames: [], label: 'Which landmark to tap' });
      var row = el('div', 'row');
      var skip = button('I cannot see that one');
      var enough = button('That is all I can see');
      var again = button('Start the setup again');
      var go = button('Start tracking', 'is-primary');
      var stop = button('Stop the camera');
      row.appendChild(skip);
      row.appendChild(enough);
      row.appendChild(again);
      row.appendChild(go);
      row.appendChild(stop);
      body.appendChild(row);
      go.style.display = 'none';
      var bg = Track.createBackground(0.03, 0.1);
      var lastFrame = null;

      var tracking = null;

      function landmark() { return LANDMARK_ORDER[li]; }
      function say() {
        mini.clearMarks();
        skip.style.display = 'none';
        enough.style.display = 'none';
        if (taps.rim.length < 2) {
          step.textContent = taps.rim.length ? 'Now tap the right edge of the rim.' : 'Tap the left edge of the rim on the picture.';
          return;
        }
        if (floor) return;
        if (li >= LANDMARK_ORDER.length || taps.img.length >= 4) { finish(); return; }
        var m = Track.LANDMARKS[landmark()];
        mini.mark(m.at[0], m.at[1], 'spot');
        step.textContent = 'Landmark ' + (taps.img.length + 1) + ': tap ' + m.name + ' (the blue dot on the small court).';
        skip.style.display = '';
        if (taps.img.length >= 2) enough.style.display = '';
      }
      function finish() {
        var f = Track.homography(taps.img, taps.court);
        if (f.error) {
          step.textContent = 'That did not work: ' + f.error + '. Tap the landmarks again.';
          taps.img = [];
          taps.court = [];
          taps.names = [];
          li = 0;
          setTimeout(say, 1800);
          return;
        }
        floor = f;
        skip.style.display = 'none';
        enough.style.display = 'none';
        step.textContent = 'Set: the floor is fixed from ' + taps.img.length + ' landmarks' + (f.kind === 'homography' ? '' : ' (rough: four landmarks place shots better)') + '. Press Start tracking, then shoot.';
        go.style.display = '';
      }
      function onTap(x, y) {
        if (tracking) return;
        if (taps.rim.length < 2) { taps.rim.push([x, y]); say(); return; }
        if (floor || li >= LANDMARK_ORDER.length) return;
        taps.img.push([x, y]);
        taps.court.push(Track.LANDMARKS[landmark()].at);
        taps.names.push(landmark());
        li++;
        say();
      }
      skip.addEventListener('click', function () { li++; say(); });
      enough.addEventListener('click', finish);
      again.addEventListener('click', function () {
        if (tracking) { tracking = null; }
        taps = { rim: [], img: [], court: [], names: [] };
        li = 0;
        floor = null;
        go.style.display = 'none';
        go.textContent = 'Start tracking';
        say();
      });
      stop.addEventListener('click', function () { stopAll(); start(); status.textContent = 'Camera off. Your shots are kept below.'; });
      go.addEventListener('click', function () {
        if (tracking) { tracking = null; go.textContent = 'Start tracking'; step.textContent = 'Paused. Press Start tracking to go on.'; return; }
        var a = taps.rim[0];
        var b = taps.rim[1];
        var rim = { left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]), y: (a[1] + b[1]) / 2 };
        tracking = { judge: Track.createRimJudge(rim), rim: rim, feet: [], last: null, lastSeen: -1e9, flash: '', flashUntil: 0 };
        go.textContent = 'Pause tracking';
        step.textContent = 'Tracking: shoot. Each shot appears in the list below.';
      });

      say();
      loop = runLoop(function (now) {
        if (!source) return;
        var frame = view.grab(now, { tracking: !!tracking });
        var ref = bg.frame;
        var ctx = view.show(frame);
        if (tracking && ref) {
          var tr = tracking;
          var ball = Track.findBall(frame, ref, { step: 1, prev: lastFrame, near: tr.last && now - tr.lastSeen < 500 ? [tr.last.x, tr.last.y] : null });
          var mover = Track.findMover(frame, ref, { prev: lastFrame, cell: 4, minCells: 4 });
          if (mover) {
            tr.feet.push({ t: now, feet: mover.feet });
            while (tr.feet.length && now - tr.feet[0].t > 4000) tr.feet.shift();
          }
          if (ball) { tr.last = ball; tr.lastSeen = now; }
          var shot = tr.judge.push(now, ball);
          if (shot) onShot(shot, tr, now);
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(tr.rim.left, tr.rim.y);
          ctx.lineTo(tr.rim.right, tr.rim.y);
          ctx.stroke();
          if (ball) dot(ctx, ball.x, ball.y, Math.max(4, ball.r + 2), '#fbbf24');
          if (mover) dot(ctx, mover.feet[0], mover.feet[1], 3, '#38bdf8', true);
          if (now < tr.flashUntil) {
            ctx.fillStyle = 'rgba(9,13,22,.75)';
            ctx.fillRect(0, 0, source.width, 22);
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(tr.flash, 8, 16);
          }
        } else {
          taps.rim.forEach(function (p) { dot(ctx, p[0], p[1], 4, '#f97316', true); });
          taps.img.forEach(function (p) { dot(ctx, p[0], p[1], 4, '#38bdf8', true); });
        }
        bg.update(frame, lastFrame);
        lastFrame = frame;
      });
    }

    function onShot(shot, tr, now) {
      // Where the shooter stood: the lowest the feet were in the moment before the release.
      var from = (shot.release != null ? shot.release : shot.start) - 900;
      var to = (shot.release != null ? shot.release : shot.start) + 100;
      var lowest = null;
      tr.feet.forEach(function (f) { if (f.t >= from && f.t <= to && (!lowest || f.feet[1] > lowest.feet[1])) lowest = f; });
      var spot = lowest && floor ? Track.toCourt(floor.H, lowest.feet) : null;
      var s = { made: shot.made, estimated: true, fixed: false };
      if (spot) { s.x = spot[0]; s.y = spot[1]; s.zone = Track.zoneOf(spot[0], spot[1]); }
      shots.push(s);
      tr.flash = 'Shot ' + shots.length + ': ' + (shot.made === true ? 'made' : shot.made === false ? 'missed' : 'not sure') + (s.zone ? ', ' + s.zone : '');
      tr.flashUntil = now + 1500;
      status.textContent = tr.flash + ' (estimated).';
      draw();
    }
    start();
    draw();
  }

  // ── Basketball_HandleDrill ─────────────────────────────────────────────────
  // Where the camera targets sit, as shares of the picture: high and to the
  // sides, where hands reach and a dribbled ball does not.
  var CAMERA_SLOTS = [[0.14, 0.22], [0.86, 0.22], [0.1, 0.5], [0.9, 0.5], [0.5, 0.1]];
  var DRIBBLE = {
    right: 'Dribble with your right hand the whole round; touch the targets with your left.',
    left: 'Dribble with your left hand the whole round; touch the targets with your right.',
    alternate: 'Switch your dribbling hand each round; touch the targets with the free hand.',
    crossover: 'Cross the ball over between touches, and touch with whichever hand is free.',
  };

  function renderHandleDrill(container, data) {
    if (!container) return;
    K.styles();
    camStyles();
    container.innerHTML = '';
    var d = data || {};
    var rounds = Math.max(1, Math.min(5, Number(d.rounds) || 3));
    var seconds = Math.max(15, Math.min(60, Number(d.seconds) || 30));
    var quick = d.pace === 'quick';
    var life = quick ? 1800 : 3000;
    var gap = quick ? 350 : 600;
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Handle and react'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Keep the ball alive and touch each target as it lights up.'));
    if (d.cue) card.appendChild(el('p', 'note', 'Cue: ' + d.cue));
    var body = el('div');
    card.appendChild(body);
    container.appendChild(card);
    var results = [];
    var source = null;
    var loop = null;

    function stopAll() {
      if (loop) loop.stop();
      loop = null;
      if (source) source.stop();
      source = null;
    }
    function hurt() {
      var b = button('Stop: something hurts');
      b.addEventListener('click', function () { stopAll(); K.stopFor(body, K.HURT_STOP); });
      return b;
    }

    K.healthGate(body, function () {
      body.innerHTML = '';
      body.appendChild(el('p', 'note', 'Warm up first: two minutes of easy jogging and side shuffles, then dribble in place with each hand, low and high. Clear a space with nothing to trip on.'));
      var r = el('div', 'row');
      var ready = button('I am warmed up', 'is-primary');
      r.appendChild(ready);
      body.appendChild(r);
      ready.addEventListener('click', choose);
    });

    function choose() {
      body.innerHTML = '';
      body.appendChild(el('p', 'note', DRIBBLE[d.dribble] || 'Keep dribbling the whole round with one hand and touch the targets with the other. Eyes up: find the target, not the ball.'));
      body.appendChild(el('p', 'note', rounds + ' round' + (rounds === 1 ? '' : 's') + ' of ' + seconds + ' seconds, with a rest between. ' + PRIVACY));
      var r = el('div', 'row');
      var cam = button('Use the camera', 'is-primary');
      var tap = button('Tap the screen instead');
      r.appendChild(cam);
      r.appendChild(tap);
      if (global.PolymathBallSim) {
        var sim = button('Use the simulated camera (testbed)');
        sim.addEventListener('click', function () { camera(true); });
        r.appendChild(sim);
      }
      body.appendChild(r);
      cam.addEventListener('click', function () { camera(false); });
      tap.addEventListener('click', function () { taps(); });
    }

    function header(roundNo) {
      body.innerHTML = '';
      body.appendChild(el('p', 'kicker', 'Round ' + roundNo + ' of ' + rounds));
      var clock = el('p', 'clock', '');
      body.appendChild(clock);
      return clock;
    }
    function showClock(clock, startAt, now) {
      var left = Math.max(0, Math.ceil(seconds - (now - startAt) / 1000));
      clock.textContent = '0:' + String(left).padStart(2, '0');
    }

    function afterRound(res, next) {
      results.push(res);
      stopAll();
      body.innerHTML = '';
      var line = 'Round ' + results.length + ': ' + res.hits + ' hit' + (res.hits === 1 ? '' : 's') + ', ' + res.misses + ' missed' + (res.averageMs != null ? ', average reaction ' + (res.averageMs / 1000).toFixed(2) + ' s, best ' + (res.bestMs / 1000).toFixed(2) + ' s' : '') + '. Score ' + res.score + '.';
      var box = el('div', 'result is-right', line);
      box.setAttribute('role', 'status');
      body.appendChild(box);
      var r = el('div', 'row');
      if (results.length < rounds) {
        body.appendChild(el('p', 'note', 'Rest for 30 to 60 seconds: breathe, shake out your arms.'));
        var again = button('Start round ' + (results.length + 1), 'is-primary');
        again.addEventListener('click', next);
        r.appendChild(again);
      } else {
        var best = results.reduce(function (m, x) { return !m || x.score > m.score ? x : m; }, null);
        var all = results.reduce(function (n, x) { return n + x.hits; }, 0);
        var fin = el('div', 'result is-right', 'Drill done: ' + all + ' hits in ' + rounds + ' round' + (rounds === 1 ? '' : 's') + '. Best round: score ' + best.score + (best.averageMs != null ? ', average reaction ' + (best.averageMs / 1000).toFixed(2) + ' s' : '') + '. Compare with your own last time, not anyone else.');
        fin.setAttribute('data-done', '1');
        body.appendChild(fin);
      }
      body.appendChild(r);
    }

    // Without a camera: targets on the screen, tapped with the free hand.
    function taps() {
      var clock = header(results.length + 1);
      body.appendChild(el('p', 'note', 'Tap the lit target with your free hand while you keep dribbling. A tap on the wrong one does not count.'));
      var pad = el('div', 'pad');
      var cells = [];
      for (var i = 0; i < 9; i++) {
        (function (k) {
          var b = el('button', 'target', String(k + 1));
          b.type = 'button';
          b.setAttribute('data-slot', String(k));
          b.addEventListener('click', function () {
            if (round.hit(performance.now(), k)) { b.classList.add('is-hit'); setTimeout(function () { b.classList.remove('is-hit'); }, 200); }
          });
          pad.appendChild(b);
          cells.push(b);
        })(i);
      }
      body.appendChild(pad);
      var r = el('div', 'row');
      r.appendChild(hurt());
      body.appendChild(r);
      var round = Track.createRound({ slots: [0, 1, 2, 3, 4, 5, 6, 7, 8], seconds: seconds, life: life, gap: gap });
      var startAt = performance.now();
      loop = runLoop(function (now) {
        var t = round.tick(now);
        showClock(clock, startAt, now);
        cells.forEach(function (c, k) { c.classList.toggle('is-live', !!t && t.slot === k); });
        if (round.over) afterRound(round.result(), taps);
      });
    }

    // With the camera: targets drawn on the picture, touched with a hand.
    function camera(simulated) {
      body.innerHTML = '';
      body.appendChild(el('p', 'note', 'Opening the camera...'));
      openSource('handle', 'user', simulated).then(function (s) {
        source = s;
        cameraRound(simulated);
      }).catch(function (err) {
        body.innerHTML = '';
        body.appendChild(el('p', 'note', cameraTrouble(err) + ' You can tap the screen instead.'));
        var r = el('div', 'row');
        var tap = button('Tap the screen instead', 'is-primary');
        tap.addEventListener('click', taps);
        r.appendChild(tap);
        body.appendChild(r);
      });
    }

    function cameraRound(simulated) {
      if (!source) { camera(simulated); return; }
      var clock = header(results.length + 1);
      var step = el('p', 'note', 'Stand 2 to 3 metres from the phone so your arms reach the circles. Hold still while the picture settles...');
      var view = makeView(body, source, null);
      body.appendChild(step);
      body.appendChild(el('p', 'honest', HONEST_DRILL));
      var r = el('div', 'row');
      r.appendChild(hurt());
      body.appendChild(r);
      var R = Math.round(source.width * 0.09);
      var slots = CAMERA_SLOTS.map(function (p) { return [Math.round(p[0] * source.width), Math.round(p[1] * source.height)]; });
      var round = Track.createRound({ slots: slots.map(function (_, k) { return k; }), seconds: seconds, life: life, gap: gap });
      var prev = null;
      // The scene without a hand in the circles, learned while the player gets set.
      var bg = Track.createBackground(0.05, 0.1);
      var settleUntil = performance.now() + 2000;
      var startAt = null;
      var streak = 0;
      var flashUntil = 0;
      loop = runLoop(function (now) {
        var cur = startAt != null ? round.current : null;
        var frame = view.grab(now, { target: cur ? slots[cur.slot] : null, radius: R });
        var ctx = view.show(frame);
        if (now < settleUntil) {
          clock.textContent = 'Get set: ' + Math.ceil((settleUntil - now) / 1000);
        } else {
          if (startAt == null) { startAt = now; step.textContent = 'Go: touch each lit circle, keep the ball alive.'; }
          var t = round.tick(now);
          showClock(clock, startAt, now);
          if (t && bg.frame) {
            var c = slots[t.slot];
            // Something new (not the ball's orange) filling the middle of the lit circle: a hand.
            var filled = Track.motionIn(frame, bg.frame, c[0], c[1], R * 0.6, 2);
            streak = filled > 0.25 ? streak + 1 : 0;
            // Two frames in a row, so a flicker of light is not a touch.
            if (streak >= 2 && round.hit(now, t.slot)) { streak = 0; flashUntil = now + 250; }
          }
          var live = round.current;
          slots.forEach(function (c, k) {
            var on = live && live.slot === k;
            ctx.globalAlpha = on ? 0.9 : 0.35;
            dot(ctx, c[0], c[1], R, on ? '#fbbf24' : '#94a3b8', false);
            if (on) dot(ctx, c[0], c[1], R * 0.5, '#fbbf24', true);
            ctx.globalAlpha = 1;
          });
          if (now < flashUntil) { ctx.fillStyle = 'rgba(52,211,153,.35)'; ctx.fillRect(0, 0, source.width, source.height); }
          if (round.over) { afterRound(round.result(), function () { openSource('handle', 'user', simulated).then(function (s) { source = s; cameraRound(simulated); }); }); return; }
        }
        bg.update(frame, prev);
        prev = frame;
      });
    }
  }

  var reg = K.registry();
  reg.register('Basketball_ShotTracker', { tag: 'Basketball_ShotTracker', render: renderShotTracker, renderBlock: renderShotTracker, schema: null });
  reg.register('Basketball_HandleDrill', { tag: 'Basketball_HandleDrill', render: renderHandleDrill, renderBlock: renderHandleDrill, schema: null });
})(typeof window !== 'undefined' ? window : globalThis);
