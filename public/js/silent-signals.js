/* Silent behaviour signals (an optional extra, switched on by the learner at /boosters; services/boosters.js silent). On the question screens it notes,
 * per answered question, how long the learner waited before their first move, how fast they typed (the gaps between key presses) and how often they
 * pressed backspace. It never records which key was pressed or what was written: only the timing numbers below leave the page, in small batches. It does
 * nothing at all unless the server says the learner has switched it on and may. */
(function () {
  if (window.__silentSignals) return;
  window.__silentSignals = true;
  fetch('/api/boosters', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((s) => { if (s && s.allowed && s.silent && s.silent.on) start(); }).catch(() => {});

  function start() {
    const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
    let batch = [];
    let current = null;
    let shownAt = 0; let firstAt = 0; let last = 0; let gaps = []; let keys = 0; let back = 0;
    const reset = () => { shownAt = performance.now(); firstAt = 0; last = 0; gaps = []; keys = 0; back = 0; };
    function flushItem() {
      if (!current || !firstAt) return;
      batch.push({ hesitation_ms: Math.round(firstAt - shownAt), keys, key_median_ms: gaps.length ? Math.round(median(gaps)) : null, backspaces: back });
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
      if (!(t && t.matches && t.matches('input[type=text], input:not([type]), textarea'))) return;
      const now = performance.now();
      if (!firstAt) firstAt = now;
      if (e.key === 'Backspace' || e.key === 'Delete') back += 1;
      else if (e.key && e.key.length === 1) { keys += 1; if (last) gaps.push(now - last); last = now; }
    }, true);
    document.addEventListener('click', (e) => { if (!firstAt && e.target.closest && e.target.closest('.choice')) firstAt = performance.now(); }, true);
    window.addEventListener('pagehide', () => { flushItem(); send(true); });
  }
}());
