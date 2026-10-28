/**
 * The basketball court: a half court drawn in SVG, players and the ball on it, and
 * plays animated between key moments.
 *
 * Coordinates are feet on a half court: x 0-50 across, y 0-47 from the baseline,
 * with the rim at (25, 5.25). A play is a list of frames, each the players'
 * positions and who has the ball, which the court moves between smoothly. These
 * drawn plays stand in for game video: they cost no licence and can show any
 * situation the lesson needs.
 *
 *   var court = PolymathCourt.create(container, { frames, onTapPlayer, onTapSpot });
 *   court.play(fromFrame, toFrame) -> Promise; court.show(frameIndex); court.mark(x, y, kind)
 *
 * Shared by the browser blocks and the server checks (validate), so the page and
 * the grader read a play the same way.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PolymathCourt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 50;
  const H = 47;
  const RIM = { x: 25, y: 5.25 };

  /** Why a play cannot be shown, or '' when it can. */
  function validate(frames) {
    if (!Array.isArray(frames) || frames.length < 1 || frames.length > 8) return 'a play needs 1 to 8 frames';
    const ids = Object.keys((frames[0] && frames[0].players) || {});
    if (ids.length < 2 || ids.length > 10) return 'a play needs 2 to 10 players';
    for (const f of frames) {
      const ps = f && f.players;
      if (!ps || typeof ps !== 'object') return 'a frame has no players';
      for (const id of ids) {
        const p = ps[id];
        if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number')) return `player ${id} is missing from a frame`;
        if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return `player ${id} is off the half court`;
      }
      if (f.ball && !ids.includes(f.ball)) return `the ball is with "${f.ball}", who is not on the court`;
    }
    if (!ids.some((id) => /^o/.test(id)) || !ids.some((id) => /^d/.test(id))) return 'player ids start with o (offence) or d (defence)';
    return '';
  }

  /** The half court lines, as SVG markup in court feet. */
  function courtMarkup() {
    const line = 'stroke="#e2e8f0" stroke-width="0.25" fill="none"';
    const arc = (r) => {
      // The arc of radius r around the rim, from the corner straight lines up.
      const xL = 3;
      const xR = 47;
      const yCorner = RIM.y + Math.sqrt(Math.max(0, r * r - (25 - xL) * (25 - xL)));
      return `<line x1="${xL}" y1="0" x2="${xL}" y2="${yCorner.toFixed(2)}" ${line}/>`
        + `<line x1="${xR}" y1="0" x2="${xR}" y2="${yCorner.toFixed(2)}" ${line}/>`
        + `<path d="M ${xL} ${yCorner.toFixed(2)} A ${r} ${r} 0 0 0 ${xR} ${yCorner.toFixed(2)}" ${line}/>`;
    };
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="#c2814a"/>`
      + `<rect x="0" y="0" width="${W}" height="${H}" ${line}/>`
      + `<rect x="17" y="0" width="16" height="19" fill="rgba(30,64,175,.35)" ${line}/>`
      + `<circle cx="25" cy="19" r="6" ${line}/>`
      + arc(23.75)
      + `<path d="M 21 5.25 A 4 4 0 0 0 29 5.25" ${line}/>`
      + `<line x1="22" y1="4" x2="28" y2="4" stroke="#e2e8f0" stroke-width="0.4"/>`
      + `<circle cx="${RIM.x}" cy="${RIM.y}" r="0.75" stroke="#f97316" stroke-width="0.3" fill="none"/>`
      + `<path d="M 19 47 A 6 6 0 0 1 31 47" ${line}/>`;
  }

  function create(container, opts) {
    opts = opts || {};
    const frames = opts.frames || [];
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    // The baseline is at the top of the picture, as coaches draw a half court.
    svg.setAttribute('viewBox', `-1 -1 ${W + 2} ${H + 2}`);
    svg.setAttribute('style', 'width:100%;max-width:460px;display:block;margin:0 auto;border-radius:8px;touch-action:manipulation;');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label || 'Basketball half court');
    svg.innerHTML = courtMarkup();
    const marks = document.createElementNS(ns, 'g');
    svg.appendChild(marks);
    const layer = document.createElementNS(ns, 'g');
    svg.appendChild(layer);
    container.appendChild(svg);

    const ids = Object.keys((frames[0] && frames[0].players) || {});
    const tokens = {};
    ids.forEach((id) => {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('data-player', id);
      g.style.cursor = opts.onTapPlayer ? 'pointer' : 'default';
      const offence = /^o/.test(id);
      if (offence) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('r', '1.6');
        c.setAttribute('fill', '#1d4ed8');
        c.setAttribute('stroke', '#f8fafc');
        c.setAttribute('stroke-width', '0.3');
        g.appendChild(c);
      } else {
        const x = document.createElementNS(ns, 'path');
        x.setAttribute('d', 'M -1.3 -1.3 L 1.3 1.3 M 1.3 -1.3 L -1.3 1.3');
        x.setAttribute('stroke', '#111827');
        x.setAttribute('stroke-width', '0.55');
        g.appendChild(x);
      }
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dy', offence ? '0.55' : '-1.7');
      t.setAttribute('font-size', '1.6');
      t.setAttribute('font-weight', '700');
      t.setAttribute('fill', offence ? '#f8fafc' : '#111827');
      t.textContent = String((frames[0].labels && frames[0].labels[id]) || id.slice(1));
      g.appendChild(t);
      if (opts.onTapPlayer) g.addEventListener('click', () => opts.onTapPlayer(id));
      layer.appendChild(g);
      tokens[id] = g;
    });
    const ball = document.createElementNS(ns, 'circle');
    ball.setAttribute('r', '0.8');
    ball.setAttribute('fill', '#f97316');
    ball.setAttribute('stroke', '#111827');
    ball.setAttribute('stroke-width', '0.15');
    ball.style.display = 'none';
    layer.appendChild(ball);

    if (opts.onTapSpot) {
      svg.style.cursor = 'crosshair';
      svg.addEventListener('click', (e) => {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        if (p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) opts.onTapSpot(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
      });
    }

    function place(positions, holder) {
      ids.forEach((id) => {
        const p = positions[id];
        tokens[id].setAttribute('transform', `translate(${p[0]} ${p[1]})`);
      });
      const h = holder && positions[holder];
      ball.style.display = h ? '' : 'none';
      if (h) { ball.setAttribute('cx', h[0] + 1.3); ball.setAttribute('cy', h[1] + 1.3); }
    }

    function show(i) {
      const f = frames[Math.max(0, Math.min(frames.length - 1, i))];
      if (f) place(f.players, f.ball);
    }

    /** Move smoothly from frame a to frame b; resolves when it arrives. */
    function play(a, b, ms) {
      return new Promise((resolve) => {
        if (!frames[a] || !frames[b] || typeof requestAnimationFrame !== 'function') { show(b); resolve(); return; }
        const steps = [];
        for (let k = a; k < b; k++) steps.push([k, k + 1]);
        const per = ms || 900;
        let s = 0;
        let start = null;
        // A hidden tab may never run animation frames, so a timer stands in for a
        // frame that does not come; the play still reaches its end.
        const next = (fn) => {
          let ran = false;
          const go = (now) => { if (!ran) { ran = true; fn(now); } };
          requestAnimationFrame(go);
          setTimeout(() => go(performance.now()), 50);
        };
        const tick = (now) => {
          if (start === null) start = now;
          const [from, to] = steps[s];
          const t = Math.min(1, (now - start) / per);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const pos = {};
          ids.forEach((id) => {
            const p = frames[from].players[id];
            const q = frames[to].players[id];
            pos[id] = [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e];
          });
          place(pos, t < 0.5 ? frames[from].ball : frames[to].ball);
          if (t >= 1) {
            s++;
            start = null;
            if (s >= steps.length) { resolve(); return; }
          }
          next(tick);
        };
        next(tick);
      });
    }

    /** A dot on the court: kind 'make' (green), 'miss' (red) or 'spot' (blue). */
    function mark(x, y, kind) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
      c.setAttribute('r', '0.9');
      c.setAttribute('fill', kind === 'make' ? '#22c55e' : kind === 'miss' ? '#ef4444' : '#38bdf8');
      c.setAttribute('stroke', '#111827');
      c.setAttribute('stroke-width', '0.15');
      marks.appendChild(c);
    }

    function highlight(id, color) {
      if (tokens[id]) tokens[id].querySelector('circle,path').setAttribute('stroke', color || '#22c55e');
      if (tokens[id] && color) tokens[id].querySelector('circle,path').setAttribute('stroke-width', '0.6');
    }

    if (frames.length) show(0);
    return { show, play, mark, highlight, element: svg, clearMarks: () => { marks.innerHTML = ''; } };
  }

  /** Is a spot beyond the three-point line (NBA distances, 22 ft in the corners)? */
  function isThree(x, y) {
    if (x <= 3 || x >= 47) return y <= 14;
    return Math.hypot(x - RIM.x, y - RIM.y) > 23.75;
  }

  return { create, validate, isThree, RIM, W, H };
});
