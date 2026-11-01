/* "Which is clearer?" (services/boosters.js choice): now and then, after a lesson, two short versions of one explanation of what was just
 * read, which differ in one way of teaching. The learner says which helped more, that there was no difference, or skips; nothing changes
 * either way except what Savant knows about how they learn. Mounted by the lesson-finished card (public/js/base-lesson.js). Never shown
 * in a test, and only when both versions were written ahead of time: asking never waits on a model. */
(function choiceCard() {
  const esc = (s) => (window.App && App.escapeHtml ? App.escapeHtml(s) : String(s));

  async function mount(host, { track, grade, level }) {
    if (!host || !window.App) return;
    let out;
    try { out = await App.api.get(`/api/boosters/choice?track=${encodeURIComponent(track)}&grade=${encodeURIComponent(grade)}&level=${encodeURIComponent(level)}`); } catch { return; }
    const offer = out && out.offer;
    if (!offer) return;
    host.innerHTML = `
      <section class="card choice-card" aria-labelledby="choice-q" style="margin-top:12px">
        <h2 id="choice-q" class="card-title" style="margin:0 0 4px">${esc(offer.question)}</h2>
        <p class="small muted" style="margin:0 0 10px">Two ways of explaining one idea from this lesson. Optional: it only helps Savant fit your lessons to you.</p>
        <div class="choice-versions" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px">
          ${offer.versions.map((v) => `<div class="choice-version" style="border:1px solid var(--line, #ccc);border-radius:10px;padding:12px">
            <p class="tiny muted" style="margin:0 0 6px">Version ${v.key.toUpperCase()}</p>
            <p class="small" style="margin:0 0 10px;white-space:pre-line">${esc(v.text)}</p>
            <button class="btn btn-sm" type="button" data-pick="${esc(v.key)}">Version ${v.key.toUpperCase()} helped more</button></div>`).join('')}
        </div>
        <div class="row-wrap" style="margin-top:10px">
          <button class="btn btn-ghost btn-sm" type="button" data-pick="same">No difference</button>
          <button class="btn btn-text btn-sm" type="button" data-pick="skip">Skip</button>
        </div>
      </section>`;
    host.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
      host.querySelectorAll('[data-pick]').forEach((x) => { x.disabled = true; });
      try { await App.api.post('/api/boosters/choice', { offer_id: offer.offer_id, pick: b.dataset.pick }); } catch { /* a lost answer is not worth an error on this screen */ }
      host.innerHTML = b.dataset.pick === 'skip' ? '' : '<p class="small muted" style="margin-top:12px">Thanks. That helps fit your lessons to you. (You can switch these questions off in Extras.)</p>';
    }));
  }

  window.ChoiceCard = { mount };
}());
