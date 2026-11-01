/* The offer to take the reading check, as a small card: once at onboarding, then now and then (services/reading-check.js status).
 *   ReadingOffer.mount(hostElement, { next })   fills the host if an offer is open; leaves it empty otherwise, and on any error.
 * "Not now" uses up the offer; the check itself is /reading-check. */
(function () {
  window.ReadingOffer = {
    async mount(host, { next = '/dashboard' } = {}) {
      if (!host) return;
      let s;
      try { s = await App.api.get('/api/reading-check'); } catch { return; }
      if (!s || !s.offer) { host.innerHTML = ''; return; }
      const again = s.offer === 'periodic';
      host.innerHTML = `
        <section class="card rc-offer" aria-labelledby="rc-offer-h">
          <h2 id="rc-offer-h">${again ? 'A quick reading check?' : 'Optional: a short reading check'}</h2>
          <p class="small">${again
    ? 'It has been a while. A 4-minute check keeps your lessons at the right reading level.'
    : 'About 4 minutes, ten to twelve questions. It lets your lessons use words and sentences that fit you.'}</p>
          <div class="row-wrap">
            <a class="btn btn-primary" href="/reading-check?next=${encodeURIComponent(next)}">Take the check</a>
            <button class="btn btn-ghost" type="button" data-rc-skip>Not now</button>
          </div>
        </section>`;
      host.querySelector('[data-rc-skip]').addEventListener('click', async () => {
        try { await App.api.post('/api/reading-check/decline', { kind: s.offer }); } catch { /* it simply stays */ }
        host.innerHTML = '';
      });
    },
  };
}());
