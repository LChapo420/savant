/* The speed-proof question (services/speed-proof.js, docs/SPEED-PROOF.md): shown once, after placement, to a beta account that may be asked.
 * The wording comes from the server (GET /api/speed-proof). "No thanks" is as big as "Yes" and changes nothing; the answer is kept and the
 * card never comes back. An under-13 account only sees it when a parent has already agreed to the optional measurement.
 *   SpeedOffer.mount(hostElement) */
(function () {
  window.SpeedOffer = {
    async mount(host) {
      if (!host) return;
      let st = null;
      try { st = await App.api.get('/api/speed-proof'); } catch { /* none */ }
      if (!st || !st.offer) { host.innerHTML = ''; return; }
      const esc = App.escapeHtml;
      const c = st.consent_text;
      host.innerHTML = `
        <section class="card rc-offer" id="speed-offer-card" aria-labelledby="sp-offer-h">
          <h2 id="sp-offer-h">${esc(c.title)}</h2>
          ${c.body.map((p) => `<p class="small">${esc(p)}</p>`).join('')}
          ${st.needs_parent ? '<p class="small"><b>A parent has already agreed to the optional measurement for this account.</b></p>' : ''}
          <div class="row-wrap">
            <button class="btn btn-primary" type="button" data-sp="yes">Yes, include me</button>
            <button class="btn" type="button" data-sp="no">No thanks, nothing changes</button>
          </div>
          <p class="tiny" role="status" aria-live="polite" data-sp-msg></p>
        </section>`;
      host.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', async () => {
        const yes = b.dataset.sp === 'yes';
        host.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        try {
          await App.api.post('/api/speed-proof/consent', { normal_arm: yes });
          host.innerHTML = `<section class="card rc-offer"><p class="small" role="status">${yes ? 'Thank you. Now and then one lesson will be taught the plain way. You can switch it to the Savant way whenever you like.' : 'No problem. Nothing changes: you keep the full Savant way for every skill.'}</p></section>`;
          setTimeout(() => { host.innerHTML = ''; }, 6000);
        } catch (err) {
          host.querySelectorAll('button').forEach((x) => { x.disabled = false; });
          const m = host.querySelector('[data-sp-msg]'); if (m) m.textContent = err.message || 'It could not be saved. Try again.';
        }
      }));
    },
  };
}());
