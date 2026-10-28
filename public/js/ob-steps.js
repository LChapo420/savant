/* The step bar on the sign-up screens (style quiz, about you, subjects).
 *
 *   ObSteps.html(step, total)   the inside of a .ob-progress element
 *   ObSteps.flow(total)         remember how long the sign-up chain is (sessionStorage),
 *                               so the next screen can say "Step 3 of 4"
 *   ObSteps.total()             that remembered length, or 0 when not in a chain
 *
 * One markup, three looks: css/screens/onboarding.css shows the continuous bar in
 * chunky and the separate segments in night and bento.
 */
(function () {
  const KEY = 'savant.flow';
  window.ObSteps = {
    html(step, total) {
      const segs = Array.from({ length: total }, (_, i) => `<i${i < step ? ' class="on"' : ''}></i>`).join('');
      return `<div class="meter"><span style="width:${Math.round((step / total) * 100)}%"></span></div>
        <div class="segments" aria-hidden="true">${segs}</div>
        <span class="ob-count" aria-hidden="true">${step} / ${total}</span>`;
    },
    flow(total) { try { window.sessionStorage.setItem(KEY, String(total)); } catch { /* no storage: no progress bar */ } },
    total() { try { return Number(window.sessionStorage.getItem(KEY)) || 0; } catch { return 0; } },
    clear() { try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ } },
  };
}());
