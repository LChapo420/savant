/* The daily check, offered as one small card in the normal flow (services/daily-check.js): on the home page and when a sitting or lesson ends.
 * It never blocks or delays anything: the card is drawn after the page and only when the server says there is an offer (a cheap read), and one tap
 * on "Not today" hides it until tomorrow. Nothing is shown to an account the extras are not open to, when it is off, or on any error.
 *   DailyOffer.mount(hostElement, { next }) */
(function () {
  window.DailyOffer = {
    async mount(host, { next = '/dashboard' } = {}) {
      if (!host) return;
      let o = null;
      try { o = await App.api.get('/api/daily-check'); } catch { /* none */ }
      if (!o || !o.offer) { host.innerHTML = ''; return; }
      host.innerHTML = `<section class="card rc-offer" aria-labelledby="dc-offer-h">
        <h2 id="dc-offer-h">Daily check</h2>
        <p class="small"><strong>Recommended.</strong> About ${o.minutes} minute${o.minutes === 1 ? "" : "s"} of quick tasks and taps that help Savant fit your lessons to you. It is optional: stop or skip any time.</p>
        <div class="row-wrap"><a class="btn btn-sm btn-primary" href="/daily-check?next=${encodeURIComponent(next)}">Start</a>
        <button class="btn btn-sm btn-ghost" type="button" data-dc-skip>Not today</button></div></section>`;
      const b = host.querySelector('[data-dc-skip]');
      if (b) b.addEventListener('click', async () => { try { await App.api.post('/api/daily-check/skip', {}); } catch { /* it simply stays */ } host.innerHTML = ''; });
    },
  };
}());
