/* Flashcards from your own material: review what is due (spaced on your forgetting curve), edit cards, add your own.
 * The server picks the cards and the next due time; this page shows them. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const id = new URLSearchParams(window.location.search).get('id');
  const base = `/api/materials/${encodeURIComponent(id)}/cards`;
  const SOURCE = { pack: 'Study pack', mistake: 'A question you missed', own: 'Yours' };
  let deck = null;
  let mode = 'review';      // review | deck
  let queue = [];           // card ids still to show this session
  let shown = false;        // is the back showing
  let editing = null;       // card id being edited, or 'new'
  let reviewed = 0;

  const fail = (err) => { root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div><p><a href="/my-material">Back to my material</a></p>`; };
  const byId = (k) => deck.cards.find((c) => c.id === k);
  const when = (iso) => { const d = Math.round((Date.parse(iso) - Date.now()) / 86400000); return d <= 0 ? 'later today' : d === 1 ? 'tomorrow' : `in ${d} days`; };

  async function load(keepQueue) {
    try { deck = await App.api.get(base); } catch (err) { return fail(err); }
    if (!keepQueue) { queue = deck.cards.filter((c) => c.due).map((c) => c.id); shown = false; }
    return render();
  }

  function cardForm(c) {
    return `<form id="card-form" class="card"><label class="field"><span>Front</span><textarea name="front" rows="2" maxlength="300" required>${esc(c ? c.front : '')}</textarea></label>
      <label class="field"><span>Back</span><textarea name="back" rows="3" maxlength="600" required>${esc(c ? c.back : '')}</textarea></label>
      <button class="btn btn-primary" type="submit">Save card</button> <button class="btn" type="button" id="cancel-edit">Cancel</button></form>`;
  }

  function reviewHtml() {
    if (!deck.total) return '<p class="muted">No cards yet. Build a study pack from this material, miss a question in the learning path, or add a card of your own.</p>';
    if (!queue.length) {
      return `<div class="card"><p><strong>${reviewed ? `Done: ${reviewed} reviewed.` : 'Nothing is due right now.'}</strong></p>
        <p class="small muted">${deck.next_due_at ? `The next card is due ${when(deck.next_due_at)}.` : 'Every card has been reviewed.'} Cards come back just before you are likely to forget them.</p></div>`;
    }
    const c = byId(queue[0]);
    return `<p class="small muted">${queue.length} to go</p>
      <div class="card" role="group" aria-label="Flashcard">
        <p class="tiny muted" style="margin:0 0 6px">${esc(SOURCE[c.source] || '')}${c.skill_title ? ` · ${esc(c.skill_title)}` : ''}</p>
        <p style="font-size:1.1em"><strong>${esc(c.front)}</strong></p>
        ${shown ? `<p>${esc(c.back)}</p>${c.misconception ? `<p class="small">Watch out: ${esc(c.misconception)}</p>` : ''}${c.quote ? `<p class="tiny muted">From your material: “${esc(c.quote)}”</p>` : ''}` : ''}
      </div>
      ${shown
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap" role="group" aria-label="How well did you know it?">${[['again', 'Again'], ['hard', 'Hard'], ['good', 'Good'], ['easy', 'Easy']].map(([k, l]) => `<button class="btn" type="button" data-rate="${k}" style="flex:1;min-width:70px">${l}</button>`).join('')}</div>`
    : '<button class="btn btn-primary" type="button" id="show">Show the answer</button>'}`;
  }

  function deckHtml() {
    const rows = deck.cards.map((c) => `<li class="card" style="list-style:none;margin-bottom:8px">
      <p style="margin:0"><strong>${esc(c.front)}</strong></p><p class="small" style="margin:4px 0">${esc(c.back)}</p>
      <p class="tiny muted" style="margin:0 0 6px">${esc(SOURCE[c.source] || '')}${c.edited ? ' · edited' : ''}${c.skill_title ? ` · ${esc(c.skill_title)}` : ''} · ${c.due ? 'due now' : `due ${when(c.due_at)}`}</p>
      <button class="btn btn-sm" type="button" data-edit="${esc(c.id)}">Edit</button> <button class="btn btn-sm" type="button" data-del="${esc(c.id)}">Delete</button></li>`).join('');
    return `<ul style="padding:0;margin:0">${rows || '<li class="muted" style="list-style:none">No cards yet.</li>'}</ul>`;
  }

  function render() {
    root.innerHTML = `<p class="small"><a href="/my-material">&larr; My material</a> · <a href="/my-material-pack?id=${encodeURIComponent(id)}">Study pack</a></p>
      <h1>Flashcards</h1>
      <p class="small muted">${deck.total} cards, ${deck.due_count} due. Cards are timed to your forgetting curve, the same way the learning path schedules its skills. Cards and edits stay private to you and are deleted with the material.</p>
      <div role="tablist" style="display:flex;gap:8px;margin:12px 0">
        <button class="btn btn-sm${mode === 'review' ? ' btn-primary' : ''}" type="button" data-mode="review">Review</button>
        <button class="btn btn-sm${mode === 'deck' ? ' btn-primary' : ''}" type="button" data-mode="deck">All cards</button>
        <button class="btn btn-sm" type="button" data-edit="new">Add a card</button></div>
      ${editing ? cardForm(editing === 'new' ? null : byId(editing)) : (mode === 'review' ? reviewHtml() : deckHtml())}`;
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; editing = null; render(); }));
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { editing = b.dataset.edit; render(); }));
    const cancel = document.getElementById('cancel-edit');
    if (cancel) cancel.addEventListener('click', () => { editing = null; render(); });
    const show = document.getElementById('show');
    if (show) show.addEventListener('click', () => { shown = true; render(); });
    root.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', async () => {
      const cid = queue[0];
      try {
        const out = await App.api.post(`${base}/review`, { card: cid, rating: b.dataset.rate });
        queue.shift(); reviewed++; shown = false;
        if (b.dataset.rate === 'again') queue.push(cid); // a miss comes round again in this sitting
        if (out.next_in_days) { const c = byId(cid); if (c) c.due = false; }
        render();
      } catch (err) { App.toast(err.message, 'error'); }
    }));
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Delete this card?')) return;
      try { await App.api.del(`${base}/${encodeURIComponent(b.dataset.del)}`); load(false); } catch (err) { App.toast(err.message, 'error'); }
    }));
    const form = document.getElementById('card-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { front: form.front.value, back: form.back.value };
        try {
          if (editing === 'new') await App.api.post(base, body); else await App.api.request('PATCH', `${base}/${encodeURIComponent(editing)}`, body);
          editing = null; load(true);
        } catch (err) { App.toast(err.message, 'error'); }
      });
    }
  }

  load(false);
});
