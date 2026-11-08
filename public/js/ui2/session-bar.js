/* The study session control under UI_V2 (docs/SESSION-BAR.md): the round clock in the top bar, and a bar that slides out of it.
 *
 *   no session   "Start session"
 *   running      the stopwatch (active time, H:MM:SS, the count js/study.js keeps), "Pause", "End"
 *   paused       the stopwatch stopped, "Resume", "End"
 *   End          "End session", "End day", "Cancel" (Cancel goes back to the running or paused bar), then the retention enforcer
 *
 * A green dot on the clock's corner pulses slowly while a session runs; paused it stays, still and grey. Tapping outside, Escape or the clock closes the bar and the
 * session keeps running. It decides nothing: js/study.js does every call (heartbeat honesty, idle rule, resume offers, break line), this only draws and presses its buttons.
 * The bar is a disclosure (aria-expanded on the clock); the stopwatch is a timer that is not announced. */
(function () {
  if (!window.App || !document.documentElement.hasAttribute('data-ui2') || window.U2SessionBar) return;
  const CLOCK = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.500V12l3 2';
  let root = null;
  let open = false;
  let ending = false;
  let shownKey = '';
  const study = () => window.Study;
  const sess = () => { const st = study() && study().state(); return st && st.study; };

  function hms(ms) {
    const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const s = String(t % 60).padStart(2, '0');
    const m = String(Math.floor(t / 60) % 60).padStart(2, '0');
    return `${Math.floor(t / 3600)}:${m}:${s}`;
  }
  const visible = () => !!study() && !study().off() && !!(study().state() || sess())
    && !/^\/enforcer/.test(window.location.pathname) && !document.documentElement.classList.contains('u2-in-sitting') && !document.querySelector('.player, .session-player');

  function build() {
    const el = document.createElement('div');
    el.className = 'u2-sb';
    el.id = 'u2-sb';
    el.innerHTML = `<div class="u2-sb-bar" id="u2-sb-bar" role="group" aria-label="Study session controls" inert></div>
      <button type="button" class="u2-sb-clock" id="u2-sb-clock" aria-expanded="false" aria-controls="u2-sb-bar" aria-label="Study session">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${CLOCK}"/></svg><span class="u2-sb-dot" aria-hidden="true"></span>
      </button>`;
    el.querySelector('.u2-sb-clock').addEventListener('click', () => toggle());
    el.querySelector('.u2-sb-bar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sb]');
      if (b && !b.disabled) press(b.getAttribute('data-sb'));
    });
    return el;
  }

  function place() {
    const wrap = document.querySelector('#header .wrap');
    if (!wrap) return false;
    if (!root) root = build();
    if (root.parentElement !== wrap) {
      const before = wrap.querySelector('.tdock-g');
      if (before) wrap.insertBefore(root, before); else wrap.appendChild(root);
    }
    return true;
  }

  function content(s) {
    const clock = `<span class="u2-sb-time num" role="timer" aria-live="off" id="u2-sb-time">${hms(study().activeNow())}</span>`;
    if (s && ending) return '<button type="button" class="u2-sb-b u2-sb-main" data-sb="end-session">End session</button><button type="button" class="u2-sb-b" data-sb="end-day">End day</button><button type="button" class="u2-sb-b u2-sb-quiet" data-sb="cancel">Cancel</button>';
    if (s && s.status === 'paused') return `${clock}<button type="button" class="u2-sb-b u2-sb-main" data-sb="resume">Resume</button><button type="button" class="u2-sb-b" data-sb="end">End</button>`;
    if (s) return `${clock}<button type="button" class="u2-sb-b" data-sb="pause">Pause</button><button type="button" class="u2-sb-b u2-sb-main" data-sb="end">End</button>`;
    return '<button type="button" class="u2-sb-b u2-sb-main" data-sb="start">Start session</button>';
  }

  function time() {
    const t = root && root.querySelector('#u2-sb-time');
    const v = hms(study().activeNow());
    if (t && t.textContent !== v) t.textContent = v;
  }

  function draw() {
    if (!visible() || !place()) { if (root && root.parentElement) root.remove(); return; }
    const s = sess();
    if (!s) ending = false;
    const paused = !!s && s.status === 'paused';
    root.dataset.state = s ? (paused ? 'paused' : 'running') : 'idle';
    root.classList.toggle('is-open', open);
    const clockBtn = root.querySelector('.u2-sb-clock');
    clockBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = !s ? 'Study session, none running' : paused ? 'Study session, paused' : 'Study session, running';
    if (clockBtn.getAttribute('aria-label') !== label) clockBtn.setAttribute('aria-label', label);
    const bar = root.querySelector('.u2-sb-bar');
    bar.inert = !open;
    // The buttons are rebuilt only when the state changes, so focus and the stopwatch's text are not disturbed every second.
    const key = `${root.dataset.state}|${ending}`;
    if (key !== shownKey) {
      const focused = bar.contains(document.activeElement) ? document.activeElement.getAttribute('data-sb') : null;
      bar.innerHTML = content(s);
      shownKey = key;
      const again = focused && bar.querySelector(`[data-sb="${focused}"]`);
      const first = bar.querySelector('.u2-sb-main');
      if (open && (again || first)) (again || first).focus({ preventScroll: true });
    }
    time();
  }

  /* What the enforcer page needs, fetched quietly while a session runs, so End opens it without a download wait. */
  let warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    for (const [href, as] of [['/js/player.js', 'script'], ['/js/enforcer.js', 'script'], ['/css/screens/study.css', 'style']]) {
      const l = document.createElement('link');
      l.rel = 'prefetch'; l.href = href; l.as = as;
      document.head.appendChild(l);
    }
  }

  function toggle(force) {
    open = force === undefined ? !open : force;
    if (open && sess()) warm();
    if (!open) ending = false;
    draw();
    if (open) { const f = root.querySelector('.u2-sb-main'); if (f) f.focus({ preventScroll: true }); } else if (root.contains(document.activeElement)) root.querySelector('.u2-sb-clock').focus();
  }

  async function press(what) {
    if (what === 'end') { ending = true; draw(); return; }
    if (what === 'cancel') { ending = false; draw(); return; }
    const btns = root.querySelectorAll('.u2-sb-b');
    btns.forEach((b) => { b.disabled = true; });
    try { await study().act(what); } finally { btns.forEach((b) => { b.disabled = false; }); }
    if (what === 'end-session' || what === 'end-day') { open = false; ending = false; }
    draw();
  }

  document.addEventListener('study:draw', draw);
  document.addEventListener('pointerdown', (e) => { if (open && root && !root.contains(e.target)) toggle(false); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });
  window.addEventListener('resize', draw);
  setInterval(() => { if (root && root.parentElement && sess() && sess().status === 'running') time(); }, 1000);
  let queued = false;
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } };
  const start = () => { if (window.MutationObserver) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true }); queue(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.U2SessionBar = { draw, toggle, state: () => ({ open, ending }) };
}());
