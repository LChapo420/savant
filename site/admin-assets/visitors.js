/* The admin page's Visitors tab. Served only to a signed-in session at
 * /donteventry/assets/visitors.js. The tab works without it (every number is in
 * the HTML); this adds clickable visitor rows and the globe.
 *
 * The globe: an orthographic projection drawn on a <canvas>, with Natural Earth
 * land (simplified, /donteventry/assets/land.json), a 30-degree graticule and a
 * dot per place (area ~ visitors). Drag or use the arrow keys to turn it; it
 * turns slowly by itself until the first interaction, and not at all with
 * prefers-reduced-motion. Colours come from the site's theme tokens. */
'use strict';
(function () {
  // Whole rows open that visitor's history; the IP link stays the keyboard route.
  document.querySelectorAll('[data-row-links] tr[data-href]').forEach(function (tr) {
    tr.classList.add('is-link');
    tr.addEventListener('click', function (e) {
      if (e.target.closest('a, button, summary, input, details')) return;
      window.location.href = tr.getAttribute('data-href');
    });
  });

  var host = document.querySelector('[data-globe]');
  if (!host) return;
  var canvas = host.querySelector('canvas');
  var tip = host.querySelector('[data-globe-tip]');
  var nojs = host.querySelector('[data-globe-nojs]');
  if (!canvas || !canvas.getContext) return;
  if (nojs) nojs.hidden = true;
  var ctx = canvas.getContext('2d');
  var D = Math.PI / 180;
  var pts = [];
  try { pts = JSON.parse(host.getAttribute('data-points') || '[]'); } catch (e) { pts = []; }
  var maxN = pts.reduce(function (m, p) { return Math.max(m, p[2]); }, 1);
  var land = [];
  var borders = []; // country borders, polylines of integer coordinates
  var states = []; // state and province lines
  // Each file says how its integers map to degrees (100 = 0.01 degree steps).
  var landScale = 10;
  var bordersScale = 10;
  var statesScale = 10;
  var rot = { lon: pts.length ? pts[0][1] : 0, lat: pts.length ? Math.max(-35, Math.min(35, pts[0][0])) : 20 };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var spinning = !reduce;
  var size = 0;
  var dpr = 1;
  var colors = {};
  var drawn = []; // [sx, sy, r, point] in CSS px, in draw order

  function readColors() {
    var b = window.getComputedStyle(document.body);
    var v = function (name, fallback) { return (b.getPropertyValue(name) || '').trim() || fallback; };
    colors = { ocean: v('--well', '#f4f5f7'), land: v('--line-strong', '#c8ccd3'), grid: v('--line', '#e3e5e9'), rim: v('--control', '#868c96'), dot: v('--subj', '#4b5fc0'), ring: v('--page', '#ffffff') };
  }

  function project(lon, lat) {
    var l = (lon - rot.lon) * D;
    var p = lat * D;
    var p0 = rot.lat * D;
    var cp = Math.cos(p);
    return {
      x: cp * Math.sin(l),
      y: Math.cos(p0) * Math.sin(p) - Math.sin(p0) * cp * Math.cos(l),
      z: Math.sin(p0) * Math.sin(p) + Math.cos(p0) * cp * Math.cos(l),
    };
  }
  // Where the edge a-b crosses the horizon, pushed onto the circle.
  function horizon(a, b) {
    var t = a.z / (a.z - b.z);
    var x = a.x + t * (b.x - a.x);
    var y = a.y + t * (b.y - a.y);
    var n = Math.sqrt(x * x + y * y) || 1;
    return { x: x / n, y: y / n, z: 0 };
  }

  function drawRing(ring, R, c, k) {
    var n = ring.length / 2;
    var P = new Array(n);
    var anyVis = false;
    var allVis = true;
    var start = -1;
    for (var i = 0; i < n; i++) {
      P[i] = project(ring[2 * i] / k, ring[2 * i + 1] / k);
      if (P[i].z >= 0) anyVis = true; else { allVis = false; if (start < 0) start = i; }
    }
    if (!anyVis) return;
    var sx = function (p) { return c + R * p.x; };
    var sy = function (p) { return c - R * p.y; };
    if (allVis) {
      ctx.moveTo(sx(P[0]), sy(P[0]));
      for (var k = 1; k < n; k++) ctx.lineTo(sx(P[k]), sy(P[k]));
      ctx.closePath();
      return;
    }
    // Split the ring into the runs on the visible side, each from where it comes
    // over the horizon to where it goes back; join the runs along the horizon.
    var arcs = [];
    var cur = null;
    for (var s = 0; s < n; s++) {
      var a = P[(start + s) % n];
      var b = P[(start + s + 1) % n];
      if (a.z < 0 && b.z >= 0) cur = [horizon(a, b), b];
      else if (a.z >= 0 && b.z >= 0) { if (cur) cur.push(b); }
      else if (a.z >= 0 && b.z < 0) { if (cur) { cur.push(horizon(a, b)); arcs.push(cur); cur = null; } }
    }
    if (!arcs.length) return;
    var ang = function (p) { return Math.atan2(-p.y, p.x); };
    ctx.moveTo(sx(arcs[0][0]), sy(arcs[0][0]));
    for (var j = 0; j < arcs.length; j++) {
      var arc = arcs[j];
      for (var m = 1; m < arc.length; m++) ctx.lineTo(sx(arc[m]), sy(arc[m]));
      var next = arcs[(j + 1) % arcs.length][0];
      var a1 = ang(arc[arc.length - 1]);
      var a2 = ang(next);
      var d = a2 - a1;
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      ctx.arc(c, c, R, a1, a1 + d, d < 0);
    }
    ctx.closePath();
  }

  // A boundary line, broken wherever it passes behind the globe.
  function drawLine(line, R, c, k) {
    var n = line.length / 2;
    var on = false;
    for (var i = 0; i < n; i++) {
      var p = project(line[2 * i] / k, line[2 * i + 1] / k);
      if (p.z < 0) { on = false; continue; }
      var x = c + R * p.x;
      var y = c - R * p.y;
      if (on) ctx.lineTo(x, y); else { ctx.moveTo(x, y); on = true; }
    }
  }

  // Absolute, not relative to the busiest place: one visitor is a small dot
  // (about 3.5 px) and a dot grows with the square root of its count up to 10 px.
  // Scaling to the busiest place made every dot full size when there were few visitors.
  function radius(n) { return Math.min(10, 2.3 + 1.2 * Math.sqrt(n)); }

  // Zoom: 1 is the whole globe; up to 8x. The globe grows past the canvas and the
  // view stays centred on the rotation point, so dragging pans around the surface.
  var zoom = 1;
  var ZOOM_MIN = 1;
  var ZOOM_MAX = 8;
  function setZoom(z) {
    var next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if (next === zoom) return;
    zoom = next;
    stopSpin();
    showTip(null);
    if (zoomLabel) zoomLabel.textContent = zoom.toFixed(zoom < 2 ? 1 : 0) + '×';
    draw();
  }

  function draw() {
    if (!size) return;
    var c = size / 2;
    var R = (c - 3) * zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // Rounded joins and ends, so borders and coastlines don't spike at sharp corners.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // sphere
    ctx.beginPath();
    ctx.arc(c, c, R, 0, 2 * Math.PI);
    ctx.fillStyle = colors.ocean;
    ctx.fill();
    // graticule
    ctx.beginPath();
    var seg = function (lon1, lat1, lon2, lat2) {
      var a = project(lon1, lat1);
      var b = project(lon2, lat2);
      if (a.z < 0 || b.z < 0) return;
      ctx.moveTo(c + R * a.x, c - R * a.y);
      ctx.lineTo(c + R * b.x, c - R * b.y);
    };
    for (var lon = -180; lon < 180; lon += 30) for (var la = -90; la < 90; la += 3) seg(lon, la, lon, la + 3);
    for (var lat = -60; lat <= 60; lat += 30) for (var lo = -180; lo < 180; lo += 3) seg(lo, lat, lo + 3, lat);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.stroke();
    // land
    ctx.beginPath();
    for (var i = 0; i < land.length; i++) drawRing(land[i], R, c, landScale);
    ctx.fillStyle = colors.land;
    ctx.fill('nonzero');
    // state and province lines: faint on the whole globe, clearer as you zoom in
    if (states.length) {
      ctx.beginPath();
      for (var si = 0; si < states.length; si++) drawLine(states[si], R, c, statesScale);
      ctx.globalAlpha = Math.min(0.9, 0.35 + 0.3 * (zoom - 1));
      ctx.strokeStyle = colors.ocean;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // country borders
    if (borders.length) {
      ctx.beginPath();
      for (var bi = 0; bi < borders.length; bi++) drawLine(borders[bi], R, c, bordersScale);
      ctx.strokeStyle = colors.ocean;
      ctx.lineWidth = zoom > 2 ? 1.4 : 1;
      ctx.stroke();
    }
    // rim
    ctx.beginPath();
    ctx.arc(c, c, R, 0, 2 * Math.PI);
    ctx.strokeStyle = colors.rim;
    ctx.lineWidth = 1;
    ctx.stroke();
    // dots: biggest first, so small places stay on top and reachable
    drawn = [];
    var order = pts.slice().sort(function (a, b) { return b[2] - a[2]; });
    for (var k = 0; k < order.length; k++) {
      var p = order[k];
      var q = project(p[1], p[0]);
      if (q.z <= 0.02) continue;
      var x = c + R * q.x;
      var y = c - R * q.y;
      var r = radius(p[2]);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = colors.dot;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = colors.ring;
      ctx.stroke();
      drawn.push([x, y, r, p]);
    }
  }

  function resize() {
    var w = Math.round(canvas.getBoundingClientRect().width) || 320;
    dpr = window.devicePixelRatio || 1;
    size = w;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    draw();
  }

  /* hover and tap: "City, Country: N visitors" */
  function hit(x, y) {
    for (var i = drawn.length - 1; i >= 0; i--) {
      var d = drawn[i];
      var dx = x - d[0];
      var dy = y - d[1];
      if (dx * dx + dy * dy <= (d[2] + 4) * (d[2] + 4)) return d;
    }
    return null;
  }
  function showTip(d) {
    if (!tip) return;
    if (!d) { tip.hidden = true; canvas.style.cursor = dragging ? 'grabbing' : 'grab'; return; }
    var n = d[3][2];
    tip.textContent = (d[3][3] || 'Unknown') + ': ' + n.toLocaleString('en') + ' visitor' + (n === 1 ? '' : 's');
    tip.hidden = false;
    var left = Math.max(4, Math.min(size - tip.offsetWidth - 4, d[0] - tip.offsetWidth / 2));
    var top = d[1] - d[2] - tip.offsetHeight - 8;
    if (top < 4) top = d[1] + d[2] + 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    canvas.style.cursor = 'pointer';
  }
  function local(e) {
    var b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  var dragging = false;
  var moved = 0;
  var last = null;
  var pointers = {}; // active pointers, for a two-finger pinch
  var pinch = null; // { d: starting distance, z: starting zoom }
  function dist(a, b) { var x = a.x - b.x; var y = a.y - b.y; return Math.sqrt(x * x + y * y); }
  function stopSpin() { spinning = false; }
  canvas.addEventListener('pointerdown', function (e) {
    stopSpin();
    pointers[e.pointerId] = local(e);
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      // A second finger turns the drag into a pinch.
      dragging = false;
      pinch = { d: dist(pointers[ids[0]], pointers[ids[1]]), z: zoom };
      showTip(null);
    } else {
      dragging = true;
      moved = 0;
      last = local(e);
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  });
  var dropPointer = function (e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
  };
  canvas.addEventListener('pointerup', dropPointer);
  canvas.addEventListener('pointercancel', dropPointer);
  canvas.addEventListener('pointermove', function (e) {
    var p = local(e);
    if (pinch && pointers[e.pointerId]) {
      pointers[e.pointerId] = p;
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var d = dist(pointers[ids[0]], pointers[ids[1]]);
        if (pinch.d > 0) setZoom(pinch.z * d / pinch.d);
      }
      return;
    }
    if (dragging && last) {
      // Slower when zoomed in, so a drag moves the surface about as far as the pointer.
      var k = 180 / (Math.PI * (size / 2) * zoom);
      rot.lon -= (p.x - last.x) * k;
      rot.lat = Math.max(-80, Math.min(80, rot.lat + (p.y - last.y) * k));
      moved += Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
      last = p;
      draw();
      if (moved > 4) showTip(null);
      return;
    }
    if (e.pointerType === 'mouse') showTip(hit(p.x, p.y));
  });
  var endDrag = function (e) {
    if (!dragging) return;
    dragging = false;
    if (moved <= 4) { var p = local(e); showTip(hit(p.x, p.y)); }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', function () { dragging = false; });
  // The spin pauses while a mouse is over the globe, so a hovered dot stays under its label.
  canvas.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hovering = true; });
  canvas.addEventListener('pointerleave', function (e) {
    hovering = false;
    if (!dragging && e.pointerType === 'mouse') showTip(null);
  });
  canvas.addEventListener('keydown', function (e) {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom * 1.5); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoom / 1.5); return; }
    if (e.key === '0') { e.preventDefault(); setZoom(1); return; }
    var step = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
    if (!step) return;
    e.preventDefault();
    stopSpin();
    rot.lon -= step[0] / zoom;
    rot.lat = Math.max(-80, Math.min(80, rot.lat - step[1] / zoom));
    showTip(null);
    draw();
  });
  // The wheel zooms the globe (and not the page) while the pointer is over it.
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    setZoom(zoom * Math.pow(1.0015, -e.deltaY));
  }, { passive: false });

  // + / - / reset buttons, added next to the canvas.
  var zoomLabel = null;
  (function addZoomButtons() {
    var host = canvas.parentNode;
    if (!host) return;
    var bar = document.createElement('div');
    bar.className = 'globe-zoom';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Zoom the globe');
    var mk = function (label, title, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'globe-zoom-btn';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    mk('+', 'Zoom in', function () { setZoom(zoom * 1.5); });
    mk('−', 'Zoom out', function () { setZoom(zoom / 1.5); });
    zoomLabel = document.createElement('span');
    zoomLabel.className = 'globe-zoom-level';
    zoomLabel.textContent = '1.0×';
    bar.appendChild(zoomLabel);
    mk('Reset', 'Reset zoom', function () { setZoom(1); });
    host.insertBefore(bar, canvas.nextSibling);
  })();

  var prev = null;
  var hovering = false;
  function frame(t) {
    if (!spinning) return;
    if (prev !== null && !hovering) {
      rot.lon -= Math.min(t - prev, 100) * 0.004; // about 4 degrees a second
      draw();
    }
    prev = t;
    window.requestAnimationFrame(frame);
  }

  readColors();
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  // Follow the light/dark theme, whether it comes from the system or the toggle.
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  var recolor = function () { readColors(); draw(); };
  if (mq && mq.addEventListener) mq.addEventListener('change', recolor);
  if (window.MutationObserver) new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) {
    var rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rm.addEventListener) rm.addEventListener('change', function () { if (rm.matches) spinning = false; });
  }

  fetch(host.getAttribute('data-land'), { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : { rings: [] }; })
    .then(function (j) { land = Array.isArray(j.rings) ? j.rings : []; landScale = Number(j.scale) || 10; draw(); })
    .catch(function () { /* the sphere, graticule and dots still show */ });
  var loadLines = function (attr, set) {
    var url = host.getAttribute(attr);
    if (!url) return;
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { lines: [] }; })
      .then(function (j) { set(Array.isArray(j.lines) ? j.lines : [], Number(j.scale) || 10); draw(); })
      .catch(function () { /* the globe works without them */ });
  };
  loadLines('data-borders', function (v, k) { borders = v; bordersScale = k; });
  loadLines('data-states', function (v, k) { states = v; statesScale = k; });
  if (spinning) window.requestAnimationFrame(frame);
})();
