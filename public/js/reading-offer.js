/* The quick optional extras, offered as one small card in the normal flow: the reading check (once at onboarding, then now and then), the
 * study-habits questionnaire (once), and a memory check when one is due; with a link to all of them at /boosters. Every one is skippable and
 * "Not now" uses its offer up. Nothing is shown to an account the extras are not open to, or when nothing is on offer (and on any error).
 *   ReadingOffer.mount(hostElement, { next })
 * (The name is from when the reading check was the only extra; services/reading-check.js, services/boosters.js.) */
(function () {
  window.ReadingOffer = {
    async mount(host, { next = '/dashboard' } = {}) {
      if (!host) return;
      let rc = null; let bo = null;
      try { rc = await App.api.get('/api/reading-check'); } catch { /* none */ }
      try { bo = await App.api.get('/api/boosters'); } catch { /* none */ }
      const readingOffer = rc && rc.offer ? rc.offer : null;
      const questionnaire = bo && bo.allowed && bo.questionnaire && !bo.questionnaire.done;
      const delayed = bo && bo.allowed && bo.delayed && bo.delayed.due;
      if (!readingOffer && !questionnaire && !delayed) { host.innerHTML = ''; return; }
      const row = (id, title, text, href, label, skip) => `<li class="boost-row"><div><b>${title}</b><br><span class="small">${text}</span></div><div class="row-wrap"><a class="btn btn-sm btn-primary" href="${href}">${label}</a>${skip ? `<button class="btn btn-sm btn-ghost" type="button" data-skip="${id}">Not now</button>` : ''}</div></li>`;
      host.innerHTML = `
        <section class="card rc-offer" aria-labelledby="rc-offer-h">
          <h2 id="rc-offer-h">Optional extras</h2>
          <p class="small">Quick ways to help Savant fit your lessons to you. Skip any of them.</p>
          <ul class="boost-list">
            ${readingOffer ? row('reading', 'Reading check', 'About 4 minutes, ten to twelve questions, so lessons use words that fit you.', `/reading-check?next=${encodeURIComponent(next)}`, 'Take it', true) : ''}
            ${questionnaire ? row('questionnaire', 'Study-habits questionnaire', 'Sixteen short statements, about 3 minutes.', '/boosters#questionnaire', 'Answer', true) : ''}
            ${delayed ? row('delayed', 'Memory check', 'Three quick questions on something you practised a while ago (30 seconds).', '/boosters', 'Start', false) : ''}
          </ul>
          <p class="tiny"><a href="/boosters">More extras: games, past results, quiet signals</a></p>
        </section>`;
      host.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', async () => {
        try {
          if (b.dataset.skip === 'reading') await App.api.post('/api/reading-check/decline', { kind: readingOffer });
          else await App.api.post('/api/boosters/questionnaire/skip', {});
        } catch { /* it simply stays */ }
        window.ReadingOffer.mount(host, { next });
      }));
    },
  };
}());
