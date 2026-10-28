/* The study session strip (RETENTION_ENFORCERS; curriculum-build/RETENTION-ENFORCERS.md).
 *
 * One line under the header on every signed-in page: "Start session" when none
 * is running; the active time, Pause or Resume, and End while one is. End
 * offers "End session" or "End day session", then the retention enforcer
 * page, where the learner picks quick, medium, full or no enforcer. Whatever
 * was left waiting (an enforcer not chosen, one half done, a scheduled one
 * due) is offered here before the next session starts.
 *
 * The page keeps the clock honest: a heartbeat every 30 seconds, only while
 * the page is visible and the learner has done something in the last few
 * minutes (or is working inside a lesson frame). Loaded by App.header.
 *
 * Break line (BREAK_NUDGE, on by default, off for the owner's account and per
 * learner on the profile page): after about 25 active minutes in a row without a
 * pause, one quiet, dismissible line offers a break. It never blocks anything,
 * never makes a sound, is not announced, shows once per stretch, and does not
 * touch the streak or XP. Short breaks lift vigor and cut fatigue but the effect
 * on scores is not proven (Albulescu et al. 2022; Biwer et al. 2023; Sievertsen
 * et al. 2016; Blasche et al. 2018), so the wording promises only feeling fresher. */
(function () {
  if (window.Study) return;
  const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  const BEAT_MS = 30000;
  const IDLE_MS = 4 * 60000;
  let state = null;
  let off = false;
  let host = null;
  let ending = false;
  let busy = false;
  let lastInput = Date.now();
  let shownAt = Date.now();
  const esc = (t) => App.escapeHtml(t);

  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove', 'wheel']) {
    window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  }
  const interacting = () => Date.now() - lastInput < IDLE_MS
    || (document.activeElement && document.activeElement.tagName === 'IFRAME');
  const onEnforcerPage = () => /^\/enforcer/.test(window.location.pathname);
  // Where the idle "Start a session" prompt belongs: the home page and the path.
  // A running or waiting session still shows on the other pages, but never inside
  // a question player (a lesson, a quiz, a placement, a stage check).
  const onIdleHome = () => /^\/(dashboard|path)(\.html)?\/?$/.test(window.location.pathname);
  const inPlayer = () => !!document.querySelector('.player');
  // The strip's own small stylesheet, so a page that does not load study.css gets the compact look too.
  (function loadStripCss() {
    if (document.querySelector('link[data-study-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/screens/study-strip.css';
    link.setAttribute('data-study-css', '');
    document.head.appendChild(link);
  }());

  function minutes(ms) {
    const m = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  /** Active time now: the server's count, plus the running stretch since it was read (capped like the server). */
  function activeNow() {
    const s = state && state.study;
    if (!s) return 0;
    const extra = s.status === 'running' && interacting() ? Math.min(Date.now() - shownAt, BEAT_MS * 2) : 0;
    return s.active_ms + extra;
  }

  /* The break line. The stretch is the active time since the last pause, kept per
   * session in sessionStorage (this tab only; a missing store just means it counts
   * from the start of the session). Dismissing it ends it for that stretch. */
  const BREAK_KEY = 'polymath.break';
  function loadBreak(id) {
    try {
      const rec = JSON.parse(window.sessionStorage.getItem(BREAK_KEY) || 'null');
      if (rec && rec.id === id) return rec;
    } catch { /* no store: count from the start */ }
    return { id, base: 0, dismissed: false };
  }
  function saveBreak(rec) {
    try { window.sessionStorage.setItem(BREAK_KEY, JSON.stringify(rec)); } catch { /* the line still works for this page */ }
  }
  function breakOn() {
    const ux = (window.App && App.ux) || {};
    return ux.break_nudge === true && !App.breakOff;
  }
  /** Minutes of unbroken study to show the break line for, or 0 when it should not show. */
  function breakMinutes(s) {
    if (!breakOn() || !s) return 0;
    const rec = loadBreak(s.id);
    if (s.status === 'paused') {
      // A pause is the break: the next stretch counts from here.
      if (rec.base !== s.active_ms || rec.dismissed) saveBreak({ id: s.id, base: s.active_ms, dismissed: false });
      return 0;
    }
    if (rec.dismissed || s.status !== 'running') return 0;
    const stretch = activeNow() - rec.base;
    const limit = ((App.ux && App.ux.break_after_min) || 25) * 60000;
    return stretch >= limit ? Math.floor(stretch / 60000) : 0;
  }

  function place() {
    if (host && document.body.contains(host)) return host;
    const header = document.getElementById('header');
    if (!header) return null;
    host = document.createElement('div');
    host.id = 'study-strip';
    host.className = 'study-strip';
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Study session');
    const consent = document.getElementById('consent-line');
    (consent || header).after(host);
    return host;
  }

  function offerLine(o) {
    const what = o.status === 'running'
      ? `Your ${o.label.toLowerCase()} retention enforcer is half done (${o.answered} of ${o.planned || o.answered}).`
      : `A ${o.label.toLowerCase()} retention enforcer is waiting${o.late ? ' from an earlier day' : ''}.`;
    return `<span class="study-what">${esc(what)}</span>`;
  }

  /** The end prompt; on a scheduled day, End day session is that day's scheduled enforcer (it absorbs the end-of-day one). */
  function endLine() {
    const t = state && state.scheduled_today;
    if (t && !t.done) {
      const plus = (t.absorbs || []).map((a) => a.label.toLowerCase());
      return `End here? Today End day session is your ${t.label.toLowerCase()} retention enforcer${plus.length ? ` (with the ${plus.join(' and ')})` : ''}: one enforcer for it and today together.`;
    }
    return 'End here? Next you choose a retention enforcer to lock in what you did.';
  }

  function breakLine(mins) {
    if (!mins) return '';
    return `
        <div class="study-break-band"><div class="wrap study-row study-break" role="group" aria-label="Break suggestion">
          <span class="study-what">About ${mins} minute${mins === 1 ? '' : 's'} in a row. A short break helps you feel fresher.</span>
          <span class="study-actions">
            <button class="btn btn-sm" type="button" data-study="break-pause">Pause for a break</button>
            <button class="btn-text" type="button" data-study="break-dismiss">Not now</button>
          </span>
        </div></div>`;
  }

  function draw() {
    const s = state && state.study;
    const o = state && state.offer;
    // The idle prompt only where it belongs; nothing at all inside a question player.
    const hide = off || onEnforcerPage() || inPlayer() || (!s && !o && !onIdleHome());
    if (hide) { if (host) host.remove(); host = null; return; }
    const el = place();
    if (!el) return;
    let html = '';
    el.classList.remove('study-strip-idle');
    if (s && ending) {
      html = `
        <div class="wrap study-row">
          <span class="study-what">${esc(endLine())}</span>
          <span class="study-actions">
            <button class="btn btn-sm" type="button" data-study="end-session">End session</button>
            <button class="btn btn-sm" type="button" data-study="end-day">End day session</button>
            <button class="btn-text" type="button" data-study="cancel">Keep going</button>
          </span>
        </div>`;
    } else if (s) {
      const paused = s.status === 'paused';
      html = `
        <div class="wrap study-row">
          <span class="study-what"><span class="study-dot${paused ? ' is-paused' : ''}" aria-hidden="true"></span>${paused ? 'Session paused' : 'Session'}<span class="study-clock num" aria-live="off"> ${esc(minutes(activeNow()))}</span><span class="visually-hidden"> active</span></span>
          <span class="study-actions">
            <button class="btn-text" type="button" data-study="${paused ? 'resume' : 'pause'}">${paused ? 'Resume' : 'Pause'}</button>
            <button class="btn btn-sm" type="button" data-study="end">End</button>
          </span>
        </div>${breakLine(breakMinutes(s))}`;
    } else if (o) {
      html = `
        <div class="wrap study-row">
          ${offerLine(o)}
          <span class="study-actions">
            <a class="btn btn-sm" href="/enforcer?id=${o.id}&then=start">${o.status === 'running' ? 'Finish it' : 'Choose'}</a>
            <a class="btn-text" href="/calendar">Calendar</a>
          </span>
        </div>`;
    } else {
      el.classList.add('study-strip-idle');
      html = `
        <div class="wrap study-row study-idle">
          <span class="study-what"><strong>Time your study.</strong><span class="study-note"> A short retention enforcer locks it in at the end.</span></span>
          <span class="study-actions">
            <button class="btn btn-sm" type="button" data-study="start">Start session</button>
            <a class="btn-text" href="/calendar">Calendar</a>
          </span>
        </div>`;
    }
    // The strip is redrawn on every beat: keep keyboard focus on the same control.
    const focused = el.contains(document.activeElement) && document.activeElement.getAttribute
      ? document.activeElement.getAttribute('data-study') : null;
    el.innerHTML = html;
    if (focused) {
      const again = el.querySelector('[data-study="' + focused + '"]');
      if (again) again.focus({ preventScroll: true });
    }
  }

  async function refresh() {
    try {
      state = await App.api.get(`/api/retention/state?tz=${encodeURIComponent(TZ)}`);
      shownAt = Date.now();
    } catch (err) {
      if (err && err.status === 404) off = true;
      state = null;
    }
    draw();
  }

  async function act(what) {
    if (busy) return;
    busy = true;
    try {
      if (what === 'start') {
        try {
          await App.api.post('/api/retention/study/start', { tz: TZ });
          App.announce('Session started.');
        } catch (err) {
          if (err.status === 409 && err.payload && err.payload.offer) {
            window.location.href = `/enforcer?id=${err.payload.offer.id}&then=start`;
            return;
          }
          throw err;
        }
      } else if (what === 'break-dismiss') {
        const s = state && state.study;
        if (s) saveBreak({ ...loadBreak(s.id), id: s.id, dismissed: true });
        draw();
        const pause = host && host.querySelector('[data-study="pause"]');
        if (pause) pause.focus();
        return;
      } else if (what === 'break-pause' || what === 'pause') {
        await App.api.post('/api/retention/study/pause', {});
        App.announce('Session paused.');
      } else if (what === 'resume') {
        await App.api.post('/api/retention/study/resume', {});
        App.announce('Session resumed.');
      } else if (what === 'end') {
        ending = true; draw();
        const first = host && host.querySelector('[data-study="end-session"]');
        if (first) first.focus();
        return;
      } else if (what === 'cancel') {
        ending = false;
      } else if (what === 'end-session' || what === 'end-day') {
        ending = false;
        const out = await App.api.post('/api/retention/study/end', { kind: what === 'end-day' ? 'day' : 'session', tz: TZ });
        const enf = out.enforcer;
        if (enf && enf.status === 'choosing') { window.location.href = `/enforcer?id=${enf.id}`; return; }
        App.toast(enf && enf.reason === 'too_short'
          ? 'Session ended. It was too short for an enforcer to fit in a tenth of it.'
          : enf && enf.reason === 'no_questions'
            ? 'Session ended. There are no fresh questions on this work yet, so there is nothing to lock in now. What you answered still counts.'
            : 'Session ended. No questions were answered, so there is nothing to lock in.', 'info');
      }
      await refresh();
    } catch (err) {
      App.toast(err.message || 'That did not work.', 'error');
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-study]');
    if (!b || !host || !host.contains(b)) return;
    e.preventDefault();
    act(b.getAttribute('data-study'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ending) { ending = false; draw(); }
  });

  setInterval(async () => {
    const s = state && state.study;
    // Time in an enforcer, the daily review or a placement is not study time (the params' covered time).
    const notStudy = /^\/(enforcer|review|placement|subject-placement)/.test(window.location.pathname);
    if (!s || s.status !== 'running' || notStudy || document.visibilityState !== 'visible' || !interacting()) { draw(); return; }
    try {
      const out = await App.api.post('/api/retention/study/beat', {});
      if (!out.study) { await refresh(); return; }
      state.study = out.study;
      shownAt = Date.now();
    } catch { /* the next beat tries again */ }
    if (!ending) draw();
  }, BEAT_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

  window.Study = { refresh, tz: TZ, state: () => state };
  refresh();
})();
