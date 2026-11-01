/* Silent behaviour signals (an optional extra, switched on by the learner at /boosters; services/boosters.js silent). On the question screens it notes,
 * per answered question, how long the learner waited before their first move, how fast they typed (the gaps between key presses) and how often they
 * pressed backspace; and (round 9, docs/SCORECARD-EVERYTHING.md) how many times they left the tab and for how long, whether they switched to a
 * different choice before checking, how many pauses of two seconds or more they made while typing, and how many stretches of thirty seconds or
 * more passed with no input while the tab was open. It never records which key was pressed, what was written or what was chosen: only the counts
 * and timings below leave the page, in small batches. It does nothing at all unless the server says the learner has switched it on and may. */
(function () {
  if (window.__silentSignals) return;
  window.__silentSignals = true;
  fetch('/api/boosters', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((s) => { if (s && s.allowed && s.silent && s.silent.on) start(); }).catch(() => {});

  function start() {
    const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const PAUSE_MS = 2000;
    const IDLE_MS = 30000;
    let batch = [];
    let current = null;
    let shownAt = 0; let firstAt = 0; let last = 0; let gaps = []; let keys = 0; let back = 0;
    let tabAways = 0; let awayMs = 0; let hiddenAt = 0; let pick = null; let mcChanges = 0; let isMc = false; let pauses = 0;
    let lastInput = 0; let idle = 0; let idleCounted = false;
    const reset = () => {
      shownAt = performance.now(); firstAt = 0; last = 0; gaps = []; keys = 0; back = 0;
      tabAways = 0; awayMs = 0; hiddenAt = document.visibilityState === 'hidden' ? shownAt : 0; pick = null; mcChanges = 0; isMc = false; pauses = 0;
      lastInput = shownAt; idle = 0; idleCounted = false;
    };
    const touched = () => { lastInput = performance.now(); idleCounted = false; };
    function flushItem() {
      if (!current || !firstAt) return;
      const now = performance.now();
      if (hiddenAt) { awayMs += now - hiddenAt; hiddenAt = now; }
      batch.push({
        hesitation_ms: Math.round(firstAt - shownAt), keys, key_median_ms: gaps.length ? Math.round(median(gaps)) : null, backspaces: back,
        shown_ms: Math.round(now - shownAt), tab_aways: tabAways, away_ms: Math.round(awayMs), mc: isMc, mc_changes: mcChanges, pauses: keys >= 3 ? pauses : null, idle,
      });
      if (batch.length >= 5) send();
    }
    function send(final) {
      if (!batch.length) return;
      const body = JSON.stringify({ batch });
      batch = [];
      try { fetch('/api/boosters/silent/batch', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body, keepalive: !!final }).catch(() => {}); } catch { /* nothing to send with */ }
    }
    new MutationObserver(() => {
      const p = document.querySelector('.prompt');
      if (p && p !== current) { flushItem(); current = p; reset(); }
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      touched();
      if (!(t && t.matches && t.matches('input[type=text], input:not([type]), textarea'))) return;
      const now = performance.now();
      if (!firstAt) firstAt = now;
      if (e.key === 'Backspace' || e.key === 'Delete') back += 1;
      else if (e.key && e.key.length === 1) { keys += 1; if (last) { gaps.push(now - last); if (now - last >= PAUSE_MS) pauses += 1; } last = now; }
    }, true);
    document.addEventListener('click', (e) => {
      touched();
      const c = e.target.closest && e.target.closest('.choice');
      if (!c) return;
      isMc = true;
      if (!firstAt) firstAt = performance.now();
      if (pick && pick !== c) mcChanges += 1;
      pick = c;
    }, true);
    document.addEventListener('pointermove', touched, { passive: true, capture: true });
    document.addEventListener('scroll', touched, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!current) return;
      const now = performance.now();
      if (document.visibilityState === 'hidden') { if (!hiddenAt) { hiddenAt = now; tabAways += 1; } } else if (hiddenAt) { awayMs += now - hiddenAt; hiddenAt = 0; touched(); }
    });
    setInterval(() => {
      if (!current || document.visibilityState === 'hidden' || idleCounted) return;
      if (performance.now() - lastInput >= IDLE_MS) { idle += 1; idleCounted = true; }
    }, 5000);
    window.addEventListener('pagehide', () => { flushItem(); send(true); });
  }
}());
