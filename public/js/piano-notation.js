/* Piano notation, drawn as SVG on the page: the excerpts and passages the piano
 * stage checks generate on the server (content/piano-sight-reading.js) —
 * treble, bass or grand staff, key signatures, simple and compound metres,
 * whole to eighth notes, dots, rests, ties, beams, triplets, two-note chords,
 * accidentals, ledger lines, p/f, hairpins and pedal changes.
 *
 *   PianoNotation.render(container, score, { width }) -> svg element
 *
 * Drawing only: no network, no sound, no input. Strokes use currentColor, so
 * the score follows the page's light or dark theme.
 */
(function (global) {
  const NS = 'http://www.w3.org/2000/svg';
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const BOTTOM = { treble: 30, bass: 18 }; // diatonic index of each staff's bottom line (E4, G2)
  const SHARP_POS = [38, 35, 39, 36, 33, 37, 34]; // F5 C5 G5 D5 A4 E5 B4 on the treble staff
  const FLAT_POS = [34, 37, 33, 36, 32, 35, 31]; //  B4 E5 A4 D5 G4 C5 F4
  const SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const FLATS = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

  const parse = (name) => {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(String(name));
    if (!m) return null;
    return { letter: m[1], alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, octave: Number(m[3]), idx: LETTERS.indexOf(m[1]) + 7 * Number(m[3]) };
  };
  const keyAlter = (fifths, letter) => (fifths > 0 && SHARPS.indexOf(letter) < fifths ? 1 : fifths < 0 && FLATS.indexOf(letter) < -fifths ? -1 : 0);
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k of Object.keys(attrs || {})) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function render(container, score, opts) {
    opts = opts || {};
    const width = Math.max(240, Math.min(960, opts.width || container.clientWidth || 640));
    const s = width < 420 ? 6.5 : width < 620 ? 7 : 8; // one staff space
    const staves = score.staves && score.staves.length ? score.staves : ['treble'];
    const grand = staves.length === 2;
    const [num, den] = score.metre || [4, 4];
    const barLen = (num * 4) / den;
    const fifths = (score.key && score.key.fifths) || 0;
    const nKey = Math.abs(fifths);

    // ── horizontal layout: each bar's onsets, spaced by time with a minimum ──
    const bars = score.bars.map((bar) => {
      const onsets = new Set();
      const acc = new Set();
      for (const st of staves) {
        let t = 0;
        for (const ev of bar[st] || []) {
          onsets.add(Math.round(t * 1000) / 1000);
          if (!ev.rest && (ev.notes || []).some((n) => { const p = parse(n); return p && p.alter !== keyAlter(fifths, p.letter); })) acc.add(Math.round(t * 1000) / 1000);
          t += ev.dur;
        }
      }
      const times = [...onsets].sort((a, b) => a - b);
      const xs = {};
      let x = s * 1.6;
      times.forEach((t, i) => {
        if (acc.has(t)) x += s * 1.2;
        xs[t] = x;
        const next = i + 1 < times.length ? times[i + 1] : barLen;
        x += s * (2.2 + 2.4 * Math.sqrt(Math.max(0.2, next - t)));
      });
      return { bar, times, xs, natural: x + s * 0.8 };
    });
    const prefix = (first) => s * 3.4 + nKey * s * 1.05 + s * 0.8 + (first ? s * 2.6 : 0);
    const margin = s * 1.2;
    const systems = [];
    let cur = null;
    bars.forEach((b, i) => {
      const room = width - 2 * margin - prefix(!systems.length);
      if (!cur || cur.used + b.natural > room) {
        cur = { bars: [], used: 0, first: !systems.length, room: width - 2 * margin - prefix(!systems.length) };
        systems.push(cur);
      }
      cur.bars.push({ ...b, index: i });
      cur.used += b.natural;
    });

    // ── vertical layout ──
    const staffGap = grand ? s * 7.5 : 0;
    const above = s * 5;
    const below = s * (score.pedal ? 7 : 5.5);
    const sysHeight = above + 4 * s + (grand ? staffGap + 4 * s : 0) + below;
    const head = s * 3.2;
    const height = head + systems.length * sysHeight;

    const svg = el('svg', { viewBox: `0 0 ${width} ${height.toFixed(1)}`, width: '100%', role: 'img', class: 'piano-score',
      'aria-label': `Score: ${score.key && score.key.label ? score.key.label : ''}, ${num}/${den}, ${score.bars.length} bars${grand ? ', both hands' : ''}` });
    svg.style.color = 'inherit';
    svg.style.display = 'block';
    svg.style.maxWidth = '100%';
    const g = el('g', { fill: 'currentColor', stroke: 'currentColor', 'stroke-linecap': 'round' }, svg);
    const text = (x, y, str, size, extra) => { const t = el('text', { x, y, 'font-size': size, stroke: 'none', 'font-family': 'Georgia, "Times New Roman", serif', ...(extra || {}) }, g); t.textContent = str; return t; };
    const line = (x1, y1, x2, y2, w) => el('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), 'stroke-width': w || 1 }, g);
    const path = (d, w, fill) => el('path', { d, 'stroke-width': w || 1, fill: fill || 'none' }, g);

    if (score.tempo) text(margin, head - s * 0.9, `♩ = ${score.tempo}`, s * 1.6, { 'font-weight': '700' });

    const ties = {}; // pending ties per staff: {x, y, dir}
    systems.forEach((sys, si) => {
      const top0 = head + si * sysHeight + above;
      const topOf = (st) => (st === 'bass' && grand ? top0 + 4 * s + staffGap : top0);
      const yOf = (st, idx) => topOf(st) + 4 * s - (idx - BOTTOM[st]) * (s / 2);
      const stretch = !(si === systems.length - 1 && sys.used < sys.room * 0.6);
      const scale = stretch ? sys.room / sys.used : Math.min(1, sys.room / sys.used);
      const x0 = margin;
      const xEnd = stretch ? width - margin : x0 + prefix(sys.first) + sys.used * scale;
      // staff lines
      for (const st of staves) for (let k = 0; k < 5; k++) line(x0, topOf(st) + k * s, xEnd, topOf(st) + k * s, 0.9);
      const yTop = topOf(staves[0]);
      const yBot = topOf(staves[staves.length - 1]) + 4 * s;
      line(x0, yTop, x0, yBot, 1.2);
      if (grand) path(`M ${x0 - s * 0.5} ${yTop} C ${x0 - s * 1.4} ${yTop + s * 2} ${x0 - s * 0.2} ${(yTop + yBot) / 2 - s} ${x0 - s * 1.1} ${(yTop + yBot) / 2} C ${x0 - s * 0.2} ${(yTop + yBot) / 2 + s} ${x0 - s * 1.4} ${yBot - s * 2} ${x0 - s * 0.5} ${yBot}`, 1.4);
      // clefs, key signature, time signature
      for (const st of staves) {
        const cx = x0 + s * 1.5;
        if (st === 'treble') {
          const gy = yOf(st, 32);
          const u = s;
          path(`M ${cx + 0.35 * u} ${gy + 3.1 * u} c -0.4 0.7 -1.4 0.3 -1.0 -0.4 M ${cx + 0.35 * u} ${gy + 3.1 * u} L ${cx + 0.05 * u} ${gy - 4.3 * u} c 1.0 0.7 1.1 2.0 -0.3 3.0 c -1.3 1.0 -1.7 2.3 -1.0 3.2 c 0.7 1.1 2.5 0.9 2.4 -0.25 c -0.1 -1.0 -1.5 -1.15 -1.75 -0.1`.replace(/c (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/g, (m0, a, b, c, d, e, f) => `c ${a * u} ${b * u} ${c * u} ${d * u} ${e * u} ${f * u}`), s * 0.22);
        } else {
          const fy = yOf(st, 24);
          el('circle', { cx: cx - s * 0.6, cy: fy, r: s * 0.38, stroke: 'none' }, g);
          path(`M ${cx - s * 0.6} ${fy} c ${s * 0.2} ${-s * 1.3} ${s * 2.3} ${-s * 1.4} ${s * 2.4} ${s * 0.2} c ${s * 0.1} ${s * 1.5} ${-s * 1.2} ${s * 2.7} ${-s * 2.6} ${s * 3.3}`, s * 0.28);
          el('circle', { cx: cx + s * 2.3, cy: fy - s * 0.5, r: s * 0.18, stroke: 'none' }, g);
          el('circle', { cx: cx + s * 2.3, cy: fy + s * 0.5, r: s * 0.18, stroke: 'none' }, g);
        }
        for (let k = 0; k < nKey; k++) {
          const pos = (fifths > 0 ? SHARP_POS : FLAT_POS)[k] - (st === 'bass' ? 14 : 0);
          drawAcc(x0 + s * 3.6 + k * s * 1.05, yOf(st, pos), fifths > 0 ? 1 : -1);
        }
        if (sys.first) {
          const tx = x0 + s * 3.6 + nKey * s * 1.05 + s * 1.2;
          text(tx, topOf(st) + s * 1.75, String(num), s * 2.2, { 'font-weight': '700', 'text-anchor': 'middle' });
          text(tx, topOf(st) + s * 3.75, String(den), s * 2.2, { 'font-weight': '700', 'text-anchor': 'middle' });
        }
      }
      text(x0, yTop - s * 1.2, String(sys.bars[0].index + 1), s * 1.1, { opacity: '0.6' });

      let bx = x0 + prefix(sys.first);
      sys.bars.forEach((b, bi) => {
        const w = b.natural * scale;
        const xAt = (t) => bx + (b.xs[Math.round(t * 1000) / 1000] || s * 1.6) * scale;
        for (const st of staves) drawStaff(st, b, xAt, bx, w);
        // dynamics, hairpins, pedal
        const dynY = grand ? topOf('treble') + 4 * s + staffGap / 2 + s * 0.6 : yBot + s * 4.4;
        if (b.bar.dynamic && (b.index === 0 || score.bars[b.index - 1].dynamic !== b.bar.dynamic)) text(bx + s * 0.6, dynY, b.bar.dynamic, s * 1.9, { 'font-style': 'italic', 'font-weight': '700' });
        if (b.bar.hairpin) {
          const xa = bx + s * 2.5; const xb = bx + w - s * 1.2; const h = s * 0.6; const yy = dynY - s * 0.5;
          if (b.bar.hairpin === 'cresc') { line(xa, yy, xb, yy - h); line(xa, yy, xb, yy + h); } else { line(xa, yy - h, xb, yy); line(xa, yy + h, xb, yy); }
        }
        if (score.pedal) {
          const py = yBot + s * 4.2;
          if (b.index === 0) text(bx - s * 0.2, py + s * 0.2, 'Ped.', s * 1.5, { 'font-style': 'italic', 'font-weight': '700' });
          const xa = bx + (b.index === 0 ? s * 3.2 : 0); const xb = bx + w;
          line(xa, py, xb - s * 0.9, py, 1.2);
          if (b.index < score.bars.length - 1 && bi < sys.bars.length - 1) path(`M ${xb - s * 0.9} ${py} L ${xb + s * 0.3} ${py - s * 1.2} L ${xb + s * 1.3} ${py}`, 1.2); else { line(xb - s * 0.9, py, xb, py, 1.2); if (b.index === score.bars.length - 1) line(xb, py, xb, py - s * 1.2, 1.2); }
        }
        bx += w;
        const last = b.index === score.bars.length - 1;
        if (last) { line(bx - s * 0.6, yTop, bx - s * 0.6, yBot, 1); line(bx - s * 0.15, yTop, bx - s * 0.15, yBot, s * 0.45); } else line(bx, yTop, bx, yBot, 1);
      });
      // a tie still open at the end of the system runs to the edge
      for (const st of Object.keys(ties)) if (ties[st]) { const t = ties[st]; tieArc(t.x, xEnd - s * 0.2, t.y, t.dir); ties[st] = { ...t, x: x0 + prefix(false) - s, carried: true }; }

      function drawStaff(st, b, xAt, bx0, w) {
        const events = b.bar[st] || [];
        let t = 0;
        const placed = events.map((ev) => { const at = t; t += ev.dur; return { ev, at, x: xAt(at) }; });
        const bottom = BOTTOM[st];
        const mid = bottom + 4;
        const alters = {}; // accidentals already shown in this bar
        // stem directions: one per beam group, else per note
        const groups = {};
        placed.forEach((p) => { if (p.ev.beam && !p.ev.rest) (groups[p.ev.beam] = groups[p.ev.beam] || []).push(p); });
        const dirOf = (ps) => { const idxs = ps.flatMap((p) => p.ev.notes.map((n) => parse(n).idx)); return idxs.reduce((a, v) => a + v, 0) / idxs.length >= mid ? 'down' : 'up'; };
        for (const id of Object.keys(groups)) { const d = dirOf(groups[id]); groups[id].forEach((p) => { p.dir = d; }); }
        placed.forEach((p) => {
          const ev = p.ev;
          if (ev.rest) { drawRest(st, ev, ev.whole_bar ? bx0 + w / 2 : p.x); return; }
          const notes = ev.notes.map(parse).filter(Boolean).sort((a, c) => a.idx - c.idx);
          if (!p.dir) p.dir = dirOf([p]);
          const hollow = ev.dur >= 2 - 1e-6;
          const whole = ev.dur >= 4 - 1e-6;
          const dotted = near(ev.dur, 3) || near(ev.dur, 1.5) || near(ev.dur, 0.75);
          const rx = whole ? s * 0.75 : s * 0.62;
          notes.forEach((n, k) => {
            const y = yOf(st, n.idx);
            // ledger lines
            for (let q = bottom - 2; q >= n.idx; q -= 2) line(p.x - rx - s * 0.45, yOf(st, q), p.x + rx + s * 0.45, yOf(st, q), 1);
            for (let q = bottom + 10; q <= n.idx; q += 2) line(p.x - rx - s * 0.45, yOf(st, q), p.x + rx + s * 0.45, yOf(st, q), 1);
            const keyA = `${n.letter}${n.octave}`;
            const shown = keyA in alters ? alters[keyA] : keyAlter(fifths, n.letter);
            if (n.alter !== shown) { drawAcc(p.x - s * (1.6 + (k % 2) * 0.9), y, n.alter === 0 ? 0 : n.alter); alters[keyA] = n.alter; }
            if (whole) el('ellipse', { cx: p.x, cy: y, rx, ry: s * 0.45, fill: 'none', 'stroke-width': s * 0.2 }, g);
            else el('ellipse', { cx: p.x, cy: y, rx, ry: s * 0.43, transform: `rotate(-20 ${p.x} ${y})`, fill: hollow ? 'none' : 'currentColor', 'stroke-width': hollow ? s * 0.17 : 0.5 }, g);
            if (dotted) el('circle', { cx: p.x + rx + s * 0.55, cy: (n.idx - bottom) % 2 === 0 ? y - s / 2 : y, r: s * 0.17, stroke: 'none' }, g);
          });
          const yLow = yOf(st, notes[0].idx);
          const yHigh = yOf(st, notes[notes.length - 1].idx);
          p.stemX = p.dir === 'up' ? p.x + rx - 0.6 : p.x - rx + 0.6;
          p.yNear = p.dir === 'up' ? yLow : yHigh;
          p.yFar = p.dir === 'up' ? yHigh - s * 3.4 : yLow + s * 3.4;
          if (ties[st]) { const tt = ties[st]; tieArc(tt.x, p.x - rx, tt.carried ? yOf(st, notes[0].idx) : tt.y, tt.dir); ties[st] = null; }
          if (ev.tie) ties[st] = { x: p.x + rx, y: (p.dir === 'up' ? yLow : yHigh), dir: p.dir === 'up' ? 1 : -1 };
        });
        // stems, beams, flags
        const done = new Set();
        placed.forEach((p) => {
          if (p.ev.rest || p.ev.dur >= 4 - 1e-6) return;
          if (p.ev.beam && groups[p.ev.beam].length > 1) {
            if (done.has(p.ev.beam)) return;
            done.add(p.ev.beam);
            const ps = groups[p.ev.beam];
            const up = ps[0].dir === 'up';
            const by = up ? Math.min(...ps.map((q) => q.yFar)) : Math.max(...ps.map((q) => q.yFar));
            ps.forEach((q) => line(q.stemX, q.yNear, q.stemX, by, 1.1));
            line(ps[0].stemX, by, ps[ps.length - 1].stemX, by, s * 0.5);
            if (ps.some((q) => q.ev.dur < 0.5 - 1e-6 && !q.ev.tuplet)) line(ps[0].stemX, by + (up ? s * 0.75 : -s * 0.75), ps[ps.length - 1].stemX, by + (up ? s * 0.75 : -s * 0.75), s * 0.5);
            if (ps[0].ev.tuplet) text((ps[0].stemX + ps[ps.length - 1].stemX) / 2, up ? by - s * 0.7 : by + s * 1.6, '3', s * 1.3, { 'text-anchor': 'middle', 'font-style': 'italic', 'font-weight': '700' });
            return;
          }
          line(p.stemX, p.yNear, p.stemX, p.yFar, 1.1);
          if (p.ev.dur < 1 - 1e-6 && !near(p.ev.dur, 0.75)) {
            const d = p.dir === 'up' ? 1 : -1;
            path(`M ${p.stemX} ${p.yFar} c ${s * 0.2} ${d * s * 1.1} ${s * 1.4} ${d * s * 1.4} ${s * 1.0} ${d * s * 3.0}`, s * 0.22);
          } else if (near(p.ev.dur, 0.75)) {
            const d = p.dir === 'up' ? 1 : -1;
            path(`M ${p.stemX} ${p.yFar} c ${s * 0.2} ${d * s * 1.1} ${s * 1.4} ${d * s * 1.4} ${s * 1.0} ${d * s * 3.0}`, s * 0.22);
          }
        });
      }

      function drawRest(st, ev, x) {
        const top = topOf(st);
        if (ev.whole_bar || ev.dur >= 4 - 1e-6) { el('rect', { x: x - s * 0.6, y: top + s, width: s * 1.2, height: s * 0.5, stroke: 'none' }, g); return; }
        if (ev.dur >= 2 - 1e-6) { el('rect', { x: x - s * 0.6, y: top + 2 * s - s * 0.5, width: s * 1.2, height: s * 0.5, stroke: 'none' }, g); if (near(ev.dur, 3)) el('circle', { cx: x + s * 1.0, cy: top + 1.5 * s, r: s * 0.17, stroke: 'none' }, g); return; }
        if (ev.dur >= 1 - 1e-6) { path(`M ${x - s * 0.3} ${top + s * 0.8} L ${x + s * 0.4} ${top + s * 1.7} L ${x - s * 0.3} ${top + s * 2.4} L ${x + s * 0.4} ${top + s * 3.1} C ${x - s * 0.4} ${top + s * 2.8} ${x - s * 0.5} ${top + s * 3.5} ${x} ${top + s * 3.7}`, s * 0.28); return; }
        el('circle', { cx: x - s * 0.3, cy: top + s * 1.6, r: s * 0.25, stroke: 'none' }, g);
        path(`M ${x - s * 0.3} ${top + s * 1.6} Q ${x + s * 0.2} ${top + s * 1.9} ${x + s * 0.5} ${top + s * 1.4} L ${x - s * 0.1} ${top + s * 3.2}`, s * 0.18);
      }
    });

    function tieArc(xa, xb, y, dir) {
      const yy = y + dir * s * 0.7;
      path(`M ${xa} ${yy} Q ${(xa + xb) / 2} ${yy + dir * s * 1.2} ${xb} ${yy}`, s * 0.18);
    }
    function drawAcc(x, y, alter) {
      if (alter > 0) {
        line(x - s * 0.25, y - s * 1.1, x - s * 0.25, y + s * 1.3, 1);
        line(x + s * 0.25, y - s * 1.3, x + s * 0.25, y + s * 1.1, 1);
        line(x - s * 0.55, y - s * 0.25, x + s * 0.55, y - s * 0.55, s * 0.28);
        line(x - s * 0.55, y + s * 0.55, x + s * 0.55, y + s * 0.25, s * 0.28);
      } else if (alter < 0) {
        line(x - s * 0.35, y - s * 2.0, x - s * 0.35, y + s * 0.55, 1.1);
        path(`M ${x - s * 0.35} ${y + s * 0.55} C ${x + s * 0.9} ${y - s * 0.1} ${x + s * 0.6} ${y - s * 1.0} ${x - s * 0.35} ${y - s * 0.3}`, s * 0.24);
      } else {
        line(x - s * 0.3, y - s * 1.3, x - s * 0.3, y + s * 0.6, 1);
        line(x + s * 0.3, y - s * 0.6, x + s * 0.3, y + s * 1.3, 1);
        line(x - s * 0.3, y - s * 0.15, x + s * 0.3, y - s * 0.45, s * 0.28);
        line(x - s * 0.3, y + s * 0.45, x + s * 0.3, y + s * 0.15, s * 0.28);
      }
    }

    container.appendChild(svg);
    return svg;
  }

  global.PianoNotation = { render };
})(typeof window !== 'undefined' ? window : globalThis);
