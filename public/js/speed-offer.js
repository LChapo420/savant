/* The speed-proof question (services/speed-proof.js, docs/SPEED-PROOF.md): shown once, after placement, to a beta account that may be asked.
 * The wording comes from the server (GET /api/speed-proof). "No thanks" is as big as "Yes" and changes nothing; the answer is kept and the
 * card never comes back. An under-13 account only sees it when a parent has already agreed to the optional measurement.
 *   SpeedOffer.mount(hostElement) */
(function () {
  /** The memory check on its own card, about 30 seconds, one tap per question. Reached only through the daily check before, so a skipped daily check lost the point. Skipping is free: an unanswered point closes as missed. */
  async function memoryCheck(host) {
    let v = null;
    try { v = await App.api.post('/api/speed-proof/check/start', {}); } catch { host.innerHTML = ''; return; }
    if (!v || !v.questions || !v.questions.length) { host.innerHTML = ''; return; }
    const esc = App.escapeHtml;
    const answers = {};
    let i = 0;
    const done = async () => {
      try { await App.api.post('/api/speed-proof/check/answer', { check_id: v.check_id, answers }); } catch { /* it stays due */ }
      host.innerHTML = '<section class="card rc-offer"><p class="small" role="status">Thank you. That is all for today.</p></section>';
      setTimeout(() => { host.innerHTML = ''; }, 4000);
    };
    const draw = () => {
      const q = v.questions[i];
      if (!q) { done(); return; }
      host.innerHTML = `<section class="card rc-offer" aria-labelledby="sp-check-h">
        <h2 id="sp-check-h">A 30-second memory check</h2>
        <p class="small">Something you learned earlier, question ${i + 1} of ${v.questions.length}. No score, and nothing here changes your path.</p>
        <p><b>${esc(q.prompt)}</b></p>
        <div class="stack">${q.choices.map((c, k) => `<button class="btn btn-block" type="button" data-k="${k}">${esc(String(c))}</button>`).join('')}</div>
        <p class="tiny"><button class="btn" type="button" data-skip>Not now</button></p>
      </section>`;
      host.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { answers[q.n] = Number(b.dataset.k); i++; draw(); }));
      host.querySelector('[data-skip]').addEventListener('click', () => { host.innerHTML = ''; });
    };
    draw();
  }
  window.SpeedOffer = {
    async mount(host) {
      if (!host) return;
      let st = null;
      try { st = await App.api.get('/api/speed-proof'); } catch { /* none */ }
      if (st && !st.offer && st.check_due) { memoryCheck(host); return; }
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
