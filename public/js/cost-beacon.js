/* Level-open timing for the cost and performance tracker (services/cost-tracker.js, docs/COST-TRACKER.md).
 *
 * Measures click-to-content for a level: from the learner's last click (or the page load, when the page was opened by a link)
 * to the first paint after the level's data arrived, and whether the server had to say "still writing" (202) first.
 * Sends one tiny POST: { kind, ms, waited, track }. No text, no answers, no ids beyond the subject name; times only.
 * The content security policy allows this: same-origin script, same-origin POST. It never throws into the page.
 */
(function () {
  if (window.__ctBeacon) return;
  window.__ctBeacon = 1;
  try {
    const LEVEL = /^\/api\/lessons\/([^/?#]+)\/([^/?#]+)\/(\d+)(?:[?#].*)?$/;
    let click = 0;
    try { click = Number(sessionStorage.getItem('ct_click')) || 0; } catch (e) { /* storage blocked */ }
    const mark = () => { click = Date.now(); try { sessionStorage.setItem('ct_click', String(click)); } catch (e) { /* storage blocked */ } };
    addEventListener('pointerdown', mark, true);
    addEventListener('keydown', (e) => { if (e.key === 'Enter') mark(); }, true);

    const original = window.fetch;
    const first = {};
    const waited = {};
    const sent = {};
    const pageStart = Date.now() - Math.round(performance.now());

    window.fetch = function ctFetch(input, init) {
      let m = null;
      try {
        const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        const url = String(typeof input === 'string' ? input : (input && input.url) || '').replace(location.origin, '');
        m = method === 'GET' ? LEVEL.exec(url) : null;
      } catch (e) { m = null; }
      if (!m) return original.apply(this, arguments);
      const key = `${m[1]}/${m[2]}/${m[3]}`;
      const started = Date.now();
      if (!first[key]) first[key] = started;
      return original.apply(this, arguments).then((res) => {
        try {
          if (res.status === 202) waited[key] = 1;
          else if (res.ok && !sent[key]) {
            sent[key] = 1;
            // The click that opened the level, if it was just now; else the page load, if this is its first ask; else this ask.
            let from = first[key];
            if (click && first[key] - click >= 0 && first[key] - click < 20000) from = click;
            else if (first[key] - pageStart < 5000) from = pageStart;
            res.clone().text().then(() => {
              requestAnimationFrame(() => requestAnimationFrame(() => {
                const body = JSON.stringify({ kind: 'level_open', ms: Date.now() - from, waited: !!waited[key], track: m[1] });
                original.call(window, '/api/cost-beacon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
              }));
            }).catch(() => {});
          }
        } catch (e) { /* never in the page's way */ }
        return res;
      });
    };
  } catch (e) { /* the page works without it */ }
})();
