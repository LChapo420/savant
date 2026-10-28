/* Savant public site: the visit-statistics event recorder used by site.js.
 *
 * It keeps a small queue of interaction events and hands it to site.js to send,
 * every few seconds and when the page is hidden or left. It only ever records
 * that something happened and where: scroll depth, sections seen, time on the
 * page, which button or link was clicked (its id or visible label), which form
 * fields were focused (their names) and whether a form was sent. It never reads
 * what anyone types: no input, textarea or select value is ever touched here.
 *
 * Works in the browser (window.SavantTrack) and in Node (require) for the tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SavantTrack = api;
})(this, function () {
  'use strict';

  var MILESTONES = [25, 50, 75, 90, 100];
  var IDLE_MS = 30000;
  var RAGE_COUNT = 3;
  var RAGE_MS = 1000;
  var RAGE_PX = 30;
  var MAX_QUEUE = 200;
  var MAX_ERRORS = 5;
  var FORM_NAMES = { updates: 'updates', beta: 'beta', investors: 'investors', forget: 'remove' };

  function squash(s, max) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }

  /** Scroll depth, %, from the bottom of the viewport. A page that fits counts as 100. */
  function scrollPercent(scrollY, viewportH, docH) {
    if (!(docH > 0) || docH <= viewportH) return 100;
    var p = Math.round(((scrollY + viewportH) / docH) * 100);
    return Math.max(0, Math.min(100, p));
  }

  /** The text codes for the site's own validation messages (never a value). */
  function errorCode(message) {
    var m = String(message || '');
    if (/does not look like/.test(m)) return 'invalid';
    if (/at least|a little more/.test(m)) return 'too-short';
    if (/under [\d,]+ characters/.test(m)) return 'too-long';
    if (/^Tick this|confirm this/.test(m)) return 'unticked';
    if (/^Choose/.test(m)) return 'not-chosen';
    if (/^(Enter|Tell us why|Write a short)/.test(m)) return 'required';
    return 'other';
  }

  /* ── reading elements: ids, labels and link targets only ──────────── */

  var INTERACTIVE = 'a[href], button, [role="button"], [role="link"], summary, label, input, select, textarea, [data-track]';
  var FIELD_TAGS = { INPUT: 1, SELECT: 1, TEXTAREA: 1 };

  /** A stable id for a clicked element: its id, data-track, or visible label (60 characters). */
  function stableId(el) {
    if (!el || !el.getAttribute) return '';
    if (el.id) return squash(el.id);
    var t = el.getAttribute('data-track');
    if (t) return squash(t);
    // A form control's own text would be its value: use its name or label instead.
    if (FIELD_TAGS[el.tagName]) return squash(el.getAttribute('name') || el.getAttribute('aria-label') || el.tagName.toLowerCase());
    return squash(el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || el.tagName.toLowerCase());
  }

  /** Where a link points: an internal path (with its #section), "mailto", or the other site's host. */
  function linkTarget(href, origin) {
    if (!href) return '';
    if (/^mailto:/i.test(href)) return 'mailto';
    if (/^tel:/i.test(href)) return 'tel';
    var u;
    try { u = new URL(href, origin + '/'); } catch (e) { return ''; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (u.origin === origin) return (u.pathname + (u.hash || '')).slice(0, 120);
    return u.hostname.toLowerCase();
  }

  var SOCIAL = /(^|\.)(instagram\.com|tiktok\.com|x\.com|twitter\.com|youtube\.com|facebook\.com|linkedin\.com)$/;

  /** The section a click happened in: the nearest section id, or header / footer / main. */
  function sectionOf(el) {
    if (!el || !el.closest) return '';
    var s = el.closest('section[id], [data-track-section]');
    if (s) return squash(s.getAttribute('data-track-section') || s.id, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (el.closest('header')) return 'header';
    if (el.closest('footer')) return 'footer';
    return 'main';
  }

  /**
   * What a click was on. ctx: { origin, path, style(el) -> computed style }.
   * Returns { kind: 'click' | 'dead' | null, i, to, s, c }.
   */
  function describeClick(target, ctx) {
    if (!target || !target.closest) return { kind: null };
    var el = target.closest(INTERACTIVE);
    var s = sectionOf(target);
    if (!el) {
      var st = ctx.style ? ctx.style(target) : null;
      var cls = String(target.className && target.className.baseVal !== undefined ? target.className.baseVal : target.className || '');
      var looks = (st && (st.cursor === 'pointer' || /underline/.test(st.textDecorationLine || st.textDecoration || ''))) || /\b(btn|button|card|chip|link|tab)\b/.test(cls);
      return looks ? { kind: 'dead', i: stableId(target), s: s } : { kind: null, i: stableId(target), s: s };
    }
    if (FIELD_TAGS[el.tagName] || el.tagName === 'LABEL') return { kind: null }; // focusing a field is recorded as a field, not a click
    var href = el.tagName === 'A' ? el.getAttribute('href') : '';
    var to = linkTarget(href, ctx.origin);
    var c = 'btn';
    if (el.closest('[data-theme-toggle]')) c = 'theme';
    else if (to === 'mailto') c = 'mail';
    else if (el.closest('[data-socials]') || (to && to.charAt(0) !== '/' && SOCIAL.test(to))) c = 'social';
    else if (el.closest('nav')) c = 'nav';
    else if (to && to.charAt(0) !== '/' && to !== 'tel') c = 'out';
    else if (/^\/evidence/.test(ctx.path || '') || /^\/evidence/.test(to)) c = 'ev';
    else if (href) c = 'link';
    return { kind: 'click', i: stableId(el), to: to, s: s, c: c };
  }

  /** The form and field name for a focused control (never its value). */
  function fieldInfo(el) {
    if (!el || !FIELD_TAGS[el.tagName] || !el.form || !el.form.getAttribute) return null;
    var f = FORM_NAMES[el.form.getAttribute('data-form')];
    var n = el.getAttribute('name');
    if (!f || !n || n === 'website') return null; // the honeypot is not a field anyone fills in
    return { f: f, n: squash(n, 40) };
  }
  function formName(formEl) {
    return formEl && formEl.getAttribute ? FORM_NAMES[formEl.getAttribute('data-form')] || '' : '';
  }

  /* ── the recorder ─────────────────────────────────────────────────── */

  /**
   * opts: { send(json, final) -> sends one batch, now() -> ms since the page loaded, path }.
   * Mode: 'wait' until the server answers the page view, then 'id' (events tied to
   * the page view), 'anon' (only what the anonymous counters need) or 'off'.
   */
  function Tracker(opts) {
    this.send = opts.send;
    this.now = opts.now;
    this.path = opts.path || '/';
    this.mode = 'wait';
    this.token = null;
    this.queue = [];
    this.dev = null;
    this.cs = null;
    this.maxScroll = 0;
    this.sentScroll = -1;
    this.hit = {};
    this.sections = {};
    this.forms = {};
    this.clicks = [];
    this.rageAt = -1e9;
    this.errors = 0;
    this.vitals = {};
    this.active = 0;
    this.total = 0;
    this.lastTick = null;
    this.lastInput = 0;
    this.left = false;
  }
  var P = Tracker.prototype;

  P.setMode = function (res) {
    if (!res || res.off || (!res.v && !res.a)) { this.mode = 'off'; this.queue = []; return; }
    this.mode = res.v ? 'id' : 'anon';
    this.token = res.v || null;
    this.flush(false);
  };
  P.push = function (ev) {
    if (this.mode === 'off') return;
    ev.o = Math.max(0, Math.round(this.now()));
    if (this.queue.length < MAX_QUEUE) this.queue.push(ev);
  };
  /** What an anonymous visitor's event keeps: the type and coarse detail, nothing per element or field. */
  function anonView(e) {
    var keep = { sc: 1, si: 1, cl: 1, rc: 1, dc: 1, fv: 1, ff: 1, ve: 1, fs: 1, fd: 1, fa: 1, er: 1 };
    if (!keep[e.k]) return null;
    var o = { k: e.k, o: e.o };
    if (e.k === 'sc') o.m = e.m;
    if (e.k === 'si') o.s = e.s;
    if (e.k === 'cl') o.c = e.c;
    if (e.f) o.f = e.f;
    if (e.k === 'ff') { if (!e.first) return null; o.first = true; }
    return o;
  }
  /** Sends what is queued (and the time since the last batch). final: the page is being left. */
  P.flush = function (final) {
    if (this.mode === 'wait' || this.mode === 'off') return false;
    var id = this.mode === 'id';
    if (id) {
      if (this.active >= 500 || this.total >= 500) {
        this.push({ k: 'tm', a: Math.round(this.active), t: Math.round(this.total) });
        this.active = 0;
        this.total = 0;
      }
      for (var s in this.sections) {
        var x = this.sections[s];
        if (x.since !== null) { x.ms += this.now() - x.since; x.since = this.now(); }
        if (x.ms >= 500) { this.push({ k: 'st', s: s, ms: Math.round(x.ms) }); x.ms = 0; }
      }
      if (this.maxScroll > this.sentScroll) { this.push({ k: 'sd', d: this.maxScroll }); this.sentScroll = this.maxScroll; }
    }
    if (!this.queue.length && !this.cs && !(id && this.dev) && !final) return false;
    var body = {};
    if (id) body.v = this.token; else body.p = this.path;
    var list = [];
    for (var i = 0; i < this.queue.length; i++) {
      var e = id ? this.queue[i] : anonView(this.queue[i]);
      if (e) list.push(e);
    }
    body.e = list;
    if (id && this.dev) { body.dev = this.dev; this.dev = null; }
    if (this.cs) { body.cs = this.cs; this.cs = null; }
    if (final) body.end = true;
    this.queue = [];
    if (!list.length && !body.dev && !body.cs && !final) return false;
    this.send(JSON.stringify(body), !!final);
    return true;
  };
  P.setDevice = function (dev) { this.dev = dev; if (this.mode === 'id') this.flush(false); };
  P.consent = function (choice) { this.cs = choice; this.flush(false); };

  /* time: called about once a second, and before each batch */
  P.activity = function () { this.lastInput = this.now(); };
  P.tick = function (visible, focused) {
    var t = this.now();
    if (this.lastTick === null) { this.lastTick = t; return; }
    var dt = Math.max(0, Math.min(t - this.lastTick, 5000));
    this.lastTick = t;
    this.total += dt;
    // Active: visible, focused (a key press or tap in the last 2 s also shows focus,
    // where the browser does not report it), and some input in the last 30 s.
    var since = t - this.lastInput;
    if (visible && (focused !== false || since < 2000) && since < IDLE_MS) this.active += dt;
  };

  /* scroll */
  P.scroll = function (pct) {
    if (pct > this.maxScroll) this.maxScroll = pct;
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (pct >= m && !this.hit[m]) { this.hit[m] = true; this.push({ k: 'sc', m: m }); }
    }
  };
  /* sections: first time in view, and how long in view */
  P.section = function (id, visible) {
    var x = this.sections[id];
    if (!x) { x = this.sections[id] = { ms: 0, since: null }; }
    if (visible && x.since === null) {
      if (!x.seen) { x.seen = true; this.push({ k: 'si', s: id }); }
      x.since = this.now();
    } else if (!visible && x.since !== null) {
      x.ms += this.now() - x.since;
      x.since = null;
    }
  };

  /* clicks; three or more within a second on the same spot are a rage click */
  P.click = function (d, x, y) {
    var t = this.now();
    if (d.kind === 'click') this.push({ k: 'cl', i: d.i, to: d.to, s: d.s, c: d.c });
    else if (d.kind === 'dead') this.push({ k: 'dc', i: d.i, s: d.s });
    this.clicks.push({ x: x, y: y, t: t });
    while (this.clicks.length && t - this.clicks[0].t > RAGE_MS) this.clicks.shift();
    var near = 0;
    for (var i = 0; i < this.clicks.length; i++) {
      var c = this.clicks[i];
      if (Math.abs(c.x - x) <= RAGE_PX && Math.abs(c.y - y) <= RAGE_PX) near++;
    }
    if (near >= RAGE_COUNT && t - this.rageAt > RAGE_MS) {
      this.rageAt = t;
      this.push({ k: 'rc', i: d.i || '', s: d.s || '' });
      return true;
    }
    return false;
  };

  /* forms */
  P.form = function (f) { return this.forms[f] || (this.forms[f] = { seen: false, start: null, fields: {}, last: '', sent: false, left: false }); };
  P.formSeen = function (f) { var s = this.form(f); if (!s.seen) { s.seen = true; this.push({ k: 'fv', f: f }); } };
  P.fieldFocus = function (f, n) {
    var s = this.form(f);
    var first = s.start === null;
    if (first) s.start = this.now();
    s.last = n;
    if (!s.fields[n]) { s.fields[n] = true; this.push({ k: 'ff', f: f, n: n, first: first }); }
  };
  P.fieldTouch = function (f, n) { this.form(f).last = n; };
  P.formError = function (f, n, code) { this.push({ k: 've', f: f, n: n, e: code }); };
  P.formSubmit = function (f) { this.push({ k: 'fs', f: f }); };
  P.formDone = function (f) {
    var s = this.form(f);
    s.sent = true;
    this.push({ k: 'fd', f: f, ms: s.start === null ? null : Math.round(this.now() - s.start) });
  };

  /* speed and errors */
  P.perf = function (b, d, l) { this.push({ k: 'pf', b: Math.round(b), d: Math.round(d), l: Math.round(l) }); };
  P.vital = function (name, v) { if (typeof v === 'number' && isFinite(v)) this.vitals[name] = v; };
  P.error = function (message, at) {
    if (this.errors >= MAX_ERRORS) return;
    this.errors++;
    this.push({ k: 'er', m: squash(message, 120), at: String(at || '').slice(0, 100) });
  };

  /** The page is being left: forms started and not sent, the deepest scroll, the vitals, then send. */
  P.pagehide = function () {
    if (!this.left) {
      this.left = true;
      for (var f in this.forms) {
        var s = this.forms[f];
        if (s.start !== null && !s.sent && !s.left) { s.left = true; this.push({ k: 'fa', f: f, n: s.last }); }
      }
      var v = this.vitals;
      if (v.lcp !== undefined || v.cls !== undefined || v.inp !== undefined) {
        this.push({ k: 'wv', lcp: v.lcp === undefined ? null : Math.round(v.lcp), cls: v.cls === undefined ? null : Math.round(v.cls * 1000), inp: v.inp === undefined ? null : Math.round(v.inp) });
      }
    }
    return this.flush(true);
  };
  /** Back from the back/forward cache: the same page view carries on. */
  P.pageshow = function () { this.left = false; };

  return {
    Tracker: Tracker,
    scrollPercent: scrollPercent,
    errorCode: errorCode,
    stableId: stableId,
    linkTarget: linkTarget,
    describeClick: describeClick,
    fieldInfo: fieldInfo,
    formName: formName,
    sectionOf: sectionOf,
    MILESTONES: MILESTONES,
  };
});
