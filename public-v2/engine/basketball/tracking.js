/**
 * The maths behind the camera tools, with no camera and no page: everything here
 * is a pure function of numbers and pixel arrays, so the tests can run it on
 * frames they draw themselves.
 *
 *   homography(imagePoints, courtPoints)  -> 3x3 matrix (or affine/similarity for 3/2 points)
 *   toCourt(H, [x, y])                    -> [feet across, feet from baseline]
 *   createBackground() .update(frame)     -> the empty scene, learned slowly: what "moved" is measured against
 *   findBall(frame, ref, opts)            -> { x, y, r, area } | null   (orange, round, changed from ref)
 *   findMover(frame, ref, opts)           -> { feet: [x, y], box } | null (the largest changed body, its lowest point)
 *   createRimJudge({ left, right, y })    -> push(t, ball|null) -> a shot { made, crossX, ... } or null
 *   zoneOf(x, y), shotStats(shots)        -> the same zones and numbers as the shot log
 *
 * A frame is { width, height, data } with RGBA bytes, as ImageData is. Image
 * coordinates are pixels from the top left. Court coordinates are court.js's:
 * feet on a half court, x 0-50 across, y 0-47 from the baseline, rim at (25, 5.25).
 *
 * Nothing here sends anything anywhere: the camera tools keep frames on the device.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./court'));
  else root.PolymathTracking = factory(root.PolymathCourt);
})(typeof self !== 'undefined' ? self : this, function (Court) {
  // ── the floor: image to court ─────────────────────────────────────────────

  /** Solve A x = b by Gaussian elimination with partial pivoting; null if singular. */
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-10) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  /** Move points to their centroid and scale them to an average distance of sqrt(2): it keeps the solve well conditioned. */
  function normaliser(pts) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1;
    const k = Math.SQRT2 / d;
    return { T: [[k, 0, -k * cx], [0, k, -k * cy], [0, 0, 1]], inv: [[1 / k, 0, cx], [0, 1 / k, cy], [0, 0, 1]] };
  }

  function mul(A, B) {
    return A.map((row, i) => B[0].map((_, j) => row.reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)));
  }

  /** Twice the area of a triangle: zero when the three points are in a line. */
  const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

  /**
   * The mapping from image pixels to court feet, from 2 to 8 matching points:
   * 4 or more give a full homography (perspective), 3 an affine map, 2 a
   * similarity (rotation, scale, shift). Fewer points, rougher spots. Returns
   * { H, kind } or { error } when the points cannot fix a mapping.
   */
  function homography(img, court) {
    const n = Math.min(img.length, court.length);
    if (n < 2) return { error: 'tap at least two court landmarks' };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.hypot(img[i][0] - img[j][0], img[i][1] - img[j][1]) < 8) return { error: 'two taps are on the same spot: tap landmarks spread around the floor' };
      }
    }
    if (n === 2) {
      // u = a x - b y + c, v = b x + a y + d
      const [p, q] = [img[0], img[1]];
      const [P, Q] = [court[0], court[1]];
      const s = solve([
        [p[0], -p[1], 1, 0], [p[1], p[0], 0, 1], [q[0], -q[1], 1, 0], [q[1], q[0], 0, 1],
      ], [P[0], P[1], Q[0], Q[1]]);
      if (!s) return { error: 'those two taps cannot fix the floor' };
      return { kind: 'similarity', H: [[s[0], -s[1], s[2]], [s[1], s[0], s[3]], [0, 0, 1]] };
    }
    if (Math.abs(area2(img[0], img[1], img[2])) < 50) return { error: 'the taps are in a line: tap landmarks spread around the floor' };
    if (n === 3) {
      const rows = [];
      const rhs = [];
      for (let i = 0; i < 3; i++) {
        rows.push([img[i][0], img[i][1], 1, 0, 0, 0]);
        rhs.push(court[i][0]);
        rows.push([0, 0, 0, img[i][0], img[i][1], 1]);
        rhs.push(court[i][1]);
      }
      const s = solve(rows, rhs);
      if (!s) return { error: 'those three taps cannot fix the floor' };
      return { kind: 'affine', H: [[s[0], s[1], s[2]], [s[3], s[4], s[5]], [0, 0, 1]] };
    }
    // Four or more: the direct linear transform on normalised points, least
    // squares when there are more than four.
    const a = normaliser(img.slice(0, n));
    const b = normaliser(court.slice(0, n));
    const ap = img.slice(0, n).map((p) => apply(a.T, p));
    const bp = court.slice(0, n).map((p) => apply(b.T, p));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) if (Math.abs(area2(img[i], img[j], img[k])) < 50 && n === 4) return { error: 'three of the taps are in a line: choose landmarks that make a box' };
      }
    }
    const rows = [];
    const rhs = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = ap[i];
      const [u, v] = bp[i];
      rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      rhs.push(u);
      rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      rhs.push(v);
    }
    let h;
    if (n === 4) h = solve(rows, rhs);
    else {
      const At = rows[0].map((_, j) => rows.map((r) => r[j]));
      h = solve(At.map((r) => At.map((c) => r.reduce((s, v, k) => s + v * c[k], 0))), At.map((r) => r.reduce((s, v, k) => s + v * rhs[k], 0)));
    }
    if (!h) return { error: 'those taps cannot fix the floor: choose landmarks that make a box' };
    const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
    const H = mul(mul(b.inv, Hn), a.T);
    const k = H[2][2] || 1;
    return { kind: 'homography', H: H.map((r) => r.map((v) => v / k)) };
  }

  /** A 3x3 matrix applied to a point; null for a point on or past the horizon. */
  function apply(H, p) {
    const w = H[2][0] * p[0] + H[2][1] * p[1] + H[2][2];
    if (!(Math.abs(w) > 1e-12)) return null;
    return [(H[0][0] * p[0] + H[0][1] * p[1] + H[0][2]) / w, (H[1][0] * p[0] + H[1][1] * p[1] + H[1][2]) / w];
  }

  /** Image pixels to court feet, or null when the spot is off the half court (with 2 ft of give). */
  function toCourt(H, p) {
    const q = apply(H, p);
    if (!q || !isFinite(q[0]) || !isFinite(q[1])) return null;
    if (q[0] < -2 || q[0] > Court.W + 2 || q[1] < -2 || q[1] > Court.H + 2) return null;
    return [Math.max(0, Math.min(Court.W, Math.round(q[0] * 10) / 10)), Math.max(0, Math.min(Court.H, Math.round(q[1] * 10) / 10))];
  }

  /** Landmarks a learner can tap, in court feet, as they look from behind the shooter facing the rim. */
  const LANDMARKS = {
    ft_left: { name: 'the left end of the free-throw line', at: [17, 19] },
    ft_right: { name: 'the right end of the free-throw line', at: [33, 19] },
    lane_left: { name: 'where the left side of the lane meets the baseline', at: [17, 0] },
    lane_right: { name: 'where the right side of the lane meets the baseline', at: [33, 0] },
    corner_left: { name: 'where the left corner three-point line meets the baseline', at: [3, 0] },
    corner_right: { name: 'where the right corner three-point line meets the baseline', at: [47, 0] },
    ft_middle: { name: 'the middle of the free-throw line', at: [25, 19] },
    arc_top: { name: 'the top of the three-point arc', at: [25, 29] },
  };

  // ── the ball: orange, round and moving ────────────────────────────────────

  /** Is this colour a basketball's orange? Hue 5-40 degrees, saturated, not dark. */
  function isOrange(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max !== r || max < 70) return false;
    const c = max - min;
    if (c / max < 0.42) return false;
    const h = 60 * ((g - b) / c);
    return h >= 5 && h <= 40;
  }

  /**
   * How far a pixel's colour is from the reference: red, green and blue
   * differences added. Colour, not brightness: a ball and a wooden floor can be
   * equally bright, never the same colour. Camera noise stays well under CHANGE.
   */
  const change = (d, pd, i) => Math.abs(d[i] - pd[i]) + Math.abs(d[i + 1] - pd[i + 1]) + Math.abs(d[i + 2] - pd[i + 2]);
  const CHANGE = 60;

  /**
   * The empty scene, learned slowly from the frames: what "moved" is measured
   * against. A slow average forgets a ball in flight at once but keeps the
   * floor, the rim and the wall; something that stays put fades in within a
   * second when the previous frame is given. `update(frame, prev)` returns the
   * model as a frame.
   */
  function createBackground(alpha, fastAlpha) {
    const a = alpha || 0.03;
    const fast = fastAlpha || 0.1;
    let sum = null;
    let out = null;
    return {
      update(frame, prev) {
        const d = frame.data;
        if (!sum || sum.length !== d.length) {
          sum = Float32Array.from(d);
          out = { width: frame.width, height: frame.height, data: new Uint8ClampedArray(d) };
          return out;
        }
        // A pixel that has stopped changing (frame to frame) is taken in fast:
        // floor uncovered when a player walks away stops looking like a moving thing.
        const pd = prev && prev.data && prev.data.length === d.length ? prev.data : null;
        for (let i = 0; i < d.length; i += 4) {
          const k = pd && change(d, pd, i) < 20 ? fast : a;
          for (let j = i; j < i + 4; j++) {
            sum[j] += (d[j] - sum[j]) * k;
            out.data[j] = sum[j];
          }
        }
        return out;
      },
      get frame() { return out; },
      reset() { sum = null; out = null; },
    };
  }

  /**
   * Connected groups of marked cells in a w x h grid (4-neighbour), each with
   * its count, sums and box. `mark(i)` says whether cell i is in.
   */
  function components(w, h, mark) {
    const label = new Int32Array(w * h).fill(-1);
    const out = [];
    const stack = [];
    for (let i = 0; i < w * h; i++) {
      if (label[i] !== -1 || !mark(i)) continue;
      const c = { id: out.length, count: 0, sx: 0, sy: 0, minx: w, maxx: -1, miny: h, maxy: -1 };
      label[i] = c.id;
      stack.push(i);
      while (stack.length) {
        const j = stack.pop();
        const x = j % w;
        const y = (j - x) / w;
        c.count++;
        c.sx += x;
        c.sy += y;
        if (x < c.minx) c.minx = x;
        if (x > c.maxx) c.maxx = x;
        if (y < c.miny) c.miny = y;
        if (y > c.maxy) c.maxy = y;
        const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1];
        for (const k of nb) {
          if (k >= 0 && label[k] === -1 && mark(k)) { label[k] = c.id; stack.push(k); }
        }
      }
      out.push(c);
    }
    return { list: out, label };
  }

  /**
   * The ball in a frame: the roundest orange blob that differs from `ref` (the
   * empty scene, or the previous frame), nearest `near` when given. With
   * `opts.prev` (the previous frame) it must also have changed since then: a
   * patch of floor a player just uncovered differs from the scene but does not
   * move. Looks at every `step`-th pixel. Returns { x, y, r, area } in image
   * pixels, or null.
   */
  function findBall(frame, ref, opts) {
    opts = opts || {};
    const step = opts.step || 2;
    const W = frame.width;
    const w = Math.floor(W / step);
    const h = Math.floor(frame.height / step);
    const d = frame.data;
    const pd = ref && ref.data;
    const qd = opts.prev && opts.prev.data && opts.prev.data.length === d.length ? opts.prev.data : null;
    const orange = new Uint8Array(w * h);
    const moved = new Uint8Array(w * h);
    const live = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((y * step) * W + x * step) * 4;
        if (!isOrange(d[i], d[i + 1], d[i + 2])) continue;
        orange[y * w + x] = 1;
        if (!pd || change(d, pd, i) > CHANGE) moved[y * w + x] = 1;
        if (qd && change(d, qd, i) > CHANGE) live[y * w + x] = 1;
      }
    }
    const maxArea = opts.maxArea || (w * h) * 0.04;
    const minArea = opts.minArea || 4;
    let { list, label } = components(w, h, (i) => orange[i] === 1);
    // A ball over an orange wooden floor, or touching the orange rim, joins it
    // into one big or long shape. Those shapes keep only their moving part.
    if (pd) {
      const merged = new Set(list.filter((c) => {
        const bw = c.maxx - c.minx + 1;
        const bh = c.maxy - c.miny + 1;
        return c.count > maxArea || bw / bh > 2 || bh / bw > 2;
      }).map((c) => c.id));
      if (merged.size) {
        const first = label;
        ({ list, label } = components(w, h, (i) => orange[i] === 1 && (!merged.has(first[i]) || moved[i] === 1)));
      }
    }
    let best = null;
    let bestScore = -Infinity;
    for (const c of list) {
      if (c.count < minArea || c.count > maxArea) continue;
      const bw = c.maxx - c.minx + 1;
      const bh = c.maxy - c.miny + 1;
      const aspect = bw / bh;
      const fill = c.count / (bw * bh);
      if (aspect < 0.5 || aspect > 2 || fill < 0.45) continue;
      let moving = 0;
      let changing = 0;
      for (let y = c.miny; y <= c.maxy; y++) {
        for (let x = c.minx; x <= c.maxx; x++) {
          if (label[y * w + x] !== c.id) continue;
          if (moved[y * w + x]) moving++;
          if (live[y * w + x]) changing++;
        }
      }
      if (pd && moving < Math.max(2, c.count * 0.12)) continue;
      if (qd && changing < Math.max(1, c.count * 0.06)) continue;
      const cx = (c.sx / c.count + 0.5) * step;
      const cy = (c.sy / c.count + 0.5) * step;
      const score = opts.near ? -Math.hypot(cx - opts.near[0], cy - opts.near[1]) : c.count;
      if (score > bestScore) {
        bestScore = score;
        best = { x: cx, y: cy, r: Math.sqrt(c.count / Math.PI) * step, area: c.count * step * step };
      }
    }
    return best;
  }

  /**
   * The largest body that differs from `ref` (the empty scene) and is not the
   * ball, on a grid of `cell`-pixel cells, and its lowest point: where its feet
   * are. With `opts.prev` (the previous frame) some of it must also have moved
   * since then: the patch a player just walked off is still, the player is not.
   * Returns { feet: [x, y], box: [x0, y0, x1, y1] } in image pixels, or null.
   */
  function findMover(frame, ref, opts) {
    if (!ref) return null;
    opts = opts || {};
    const cell = opts.cell || 8;
    const W = frame.width;
    const gw = Math.floor(W / cell);
    const gh = Math.floor(frame.height / cell);
    const d = frame.data;
    const pd = ref.data;
    const qd = opts.prev && opts.prev.data && opts.prev.data.length === d.length ? opts.prev.data : null;
    const share = new Float32Array(gw * gh);
    const stirred = new Uint8Array(gw * gh);
    // Two samples per cell side: enough to see a body, cheap enough for every frame.
    const s = Math.max(1, Math.floor(cell / 2));
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let n = 0;
        let m = 0;
        let q = 0;
        for (let y = gy * cell; y < (gy + 1) * cell; y += s) {
          for (let x = gx * cell; x < (gx + 1) * cell; x += s) {
            const i = (y * W + x) * 4;
            n++;
            if (isOrange(d[i], d[i + 1], d[i + 2]) && !isOrange(pd[i], pd[i + 1], pd[i + 2])) continue;
            if (change(d, pd, i) > CHANGE) m++;
            if (qd && change(d, qd, i) > CHANGE) q++;
          }
        }
        share[gy * gw + gx] = m / n;
        if (q) stirred[gy * gw + gx] = 1;
      }
    }
    const { list, label } = components(gw, gh, (i) => share[i] >= 0.25);
    let best = null;
    for (const c of list) {
      if (c.count < (opts.minCells || 3) || (best && c.count <= best.count)) continue;
      if (qd) {
        let moving = false;
        for (let y = c.miny; y <= c.maxy && !moving; y++) for (let x = c.minx; x <= c.maxx; x++) if (label[y * gw + x] === c.id && stirred[y * gw + x]) { moving = true; break; }
        if (!moving) continue;
      }
      best = c;
    }
    if (!best) return null;
    let sx = 0;
    let n = 0;
    for (let gx = best.minx; gx <= best.maxx; gx++) if (label[best.maxy * gw + gx] === best.id) { sx += gx; n++; }
    return {
      // The middle of the lowest row of cells: the feet are somewhere in it.
      feet: [(sx / n + 0.5) * cell, (best.maxy + 0.5) * cell],
      box: [best.minx * cell, best.miny * cell, (best.maxx + 1) * cell, (best.maxy + 1) * cell],
    };
  }

  // ── make or miss: the rim-crossing rule ───────────────────────────────────

  /**
   * Judges shots from the ball's positions over time. The rim is its left and
   * right edges and its height in the image. A shot starts when the ball is
   * seen above the rim near it; it is a make when the ball next comes down
   * through the rim's height between its edges, a miss when it comes down
   * outside them, and unsure when the ball is lost before it comes down.
   *
   *   const judge = createRimJudge({ left, right, y });
   *   const shot = judge.push(ms, ball || null);  // a shot when one is decided
   *
   * A shot is { made: true|false|null, t, start, crossX, release } where
   * `release` is the time the ball started its last rise (about when it left
   * the hands).
   */
  function createRimJudge(rim, opts) {
    opts = opts || {};
    const width = Math.max(4, rim.right - rim.left);
    const centre = (rim.left + rim.right) / 2;
    const margin = opts.margin != null ? opts.margin : Math.max(2, width * 0.12);
    const reach = opts.reach != null ? opts.reach : width * 3;
    const lostMs = opts.lostMs || 1200;
    const cooldownMs = opts.cooldownMs || 700;
    let track = [];
    let shot = null;
    let quietUntil = -Infinity;

    function releaseTime() {
      // Back from the newest point while the ball was still rising (image y falling).
      let k = track.length - 1;
      while (k > 0 && track[k - 1].y >= track[k].y - 0.5 && track[k].t - track[k - 1].t < 400) k--;
      return track[k] ? track[k].t : null;
    }

    function decide(t, made, crossX) {
      const out = { made, t, start: shot.start, crossX: crossX == null ? null : Math.round(crossX * 10) / 10, release: shot.release };
      shot = null;
      quietUntil = t + cooldownMs;
      return out;
    }

    function push(t, ball) {
      if (ball) {
        track.push({ t, x: ball.x, y: ball.y });
        while (track.length && t - track[0].t > 3000) track.shift();
      }
      if (shot) {
        if (!ball) return t - shot.lastSeen > lostMs ? decide(t, null, null) : null;
        shot.lastSeen = t;
        if (ball.y > rim.y + margin) {
          // Down through the rim's height: where did it cross?
          let above = null;
          for (let k = track.length - 2; k >= 0; k--) if (track[k].y < rim.y) { above = track[k]; break; }
          let crossX = ball.x;
          if (above && ball.y !== above.y) crossX = above.x + (ball.x - above.x) * ((rim.y - above.y) / (ball.y - above.y));
          const inside = crossX >= rim.left && crossX <= rim.right;
          return decide(t, inside, crossX);
        }
        return null;
      }
      if (ball && t >= quietUntil && ball.y < rim.y - margin && Math.abs(ball.x - centre) <= reach) {
        shot = { start: t, lastSeen: t, release: releaseTime() };
      }
      return null;
    }

    return { push, reset: () => { track = []; shot = null; }, get pending() { return !!shot; } };
  }

  // ── zones and numbers: the same as the shot log ───────────────────────────

  /** 'three', 'paint' or 'mid-range' for a spot in court feet. */
  function zoneOf(x, y) {
    if (Court.isThree(x, y)) return 'three';
    if (x >= 17 && x <= 33 && y <= 19) return 'paint';
    return 'mid-range';
  }

  /**
   * FG%, eFG% and zones for a list of shots { made, x?, y? }. A shot with no
   * spot counts for FG% only; a shot not yet decided (made null) counts for nothing.
   */
  function shotStats(shots) {
    const done = (shots || []).filter((s) => s && typeof s.made === 'boolean');
    const placed = done.filter((s) => typeof s.x === 'number' && typeof s.y === 'number');
    const zone = (s) => s.zone || zoneOf(s.x, s.y);
    const fga = done.length;
    const fgm = done.filter((s) => s.made).length;
    const threes = placed.filter((s) => zone(s) === 'three');
    const tpa = threes.length;
    const tpm = threes.filter((s) => s.made).length;
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
    const zones = {};
    ['paint', 'mid-range', 'three'].forEach((z) => {
      const all = placed.filter((s) => zone(s) === z);
      zones[z] = { attempts: all.length, makes: all.filter((s) => s.made).length, pct: pct(all.filter((s) => s.made).length, all.length) };
    });
    return {
      fga, fgm, tpa, tpm,
      fg: pct(fgm, fga),
      // eFG% counts a made three as one and a half makes.
      efg: pct(fgm + 0.5 * tpm, fga),
      points: 2 * (fgm - tpm) + 3 * tpm,
      zones,
      unplaced: done.length - placed.length,
      undecided: (shots || []).filter((s) => s && s.made == null).length,
    };
  }

  // ── reaching targets: the handling drill ──────────────────────────────────

  /**
   * How much of a circle in the image differs from `prev` (the previous frame,
   * or the learned empty scene), not counting the ball's orange: 0 to 1. A hand
   * reaching the middle of a target fills most of it.
   */
  function motionIn(frame, prev, cx, cy, r, step) {
    if (!prev) return 0;
    step = step || 2;
    const W = frame.width;
    const d = frame.data;
    const pd = prev.data;
    let n = 0;
    let m = 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(frame.height, Math.ceil(cy + r)); y += step) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, Math.ceil(cx + r)); x += step) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
        const i = (y * W + x) * 4;
        n++;
        if (isOrange(d[i], d[i + 1], d[i + 2])) continue;
        if (change(d, pd, i) > CHANGE) m++;
      }
    }
    return n ? m / n : 0;
  }

  /**
   * A timed round of targets: each target waits `life` ms for a touch, and the
   * next one appears `gap` ms after a hit or a timeout. `rand` picks the slot (a
   * seeded generator in tests). Times are passed in, so a test can run a round
   * without waiting for it.
   *
   *   const round = createRound({ slots, seconds: 30, life: 2500, gap: 400, rand });
   *   round.tick(now) -> the target showing { slot, shownAt } or null; round.hit(now, slot) -> true on a hit
   *   round.result() -> { hits, misses, reactions: [ms...], averageMs, bestMs, score }
   */
  function createRound(o) {
    const slots = o.slots;
    const life = o.life || 2500;
    const gap = o.gap || 400;
    const rand = o.rand || Math.random;
    let start = null;
    let current = null;
    let nextAt = 0;
    let last = -1;
    const reactions = [];
    let misses = 0;
    let over = false;

    function pick() {
      let i = Math.floor(rand() * slots.length);
      if (slots.length > 1 && i === last) i = (i + 1) % slots.length;
      last = i;
      return i;
    }
    function tick(now) {
      if (over) return null;
      if (start === null) { start = now; nextAt = now + gap; }
      if (now - start >= (o.seconds || 30) * 1000) {
        if (current) misses++;
        current = null;
        over = true;
        return null;
      }
      if (current && now - current.shownAt > life) { misses++; current = null; nextAt = now + gap; }
      if (!current && now >= nextAt) current = { slot: pick(), shownAt: now };
      return current;
    }
    function hit(now, slot) {
      if (!current || over || slot !== current.slot) return false;
      reactions.push(Math.round(now - current.shownAt));
      current = null;
      nextAt = now + gap;
      return true;
    }
    function result() {
      const hits = reactions.length;
      const avg = hits ? Math.round(reactions.reduce((a, b) => a + b, 0) / hits) : null;
      // 10 points a hit, and up to 5 more for a quick one.
      const score = Math.round(hits * 10 + reactions.reduce((s, ms) => s + Math.max(0, 5 * (1 - ms / life)), 0));
      return { hits, misses, reactions: reactions.slice(), averageMs: avg, bestMs: hits ? Math.min(...reactions) : null, score };
    }
    return { tick, hit, result, get over() { return over; }, get current() { return current; } };
  }

  return {
    homography, apply, toCourt, LANDMARKS, isOrange, createBackground, findBall, findMover, components,
    createRimJudge, zoneOf, shotStats, motionIn, createRound,
  };
});
