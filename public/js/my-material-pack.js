/* A study pack built from your own material: summary, flashcards, a quiz and a practice test.
 * The server holds the answer keys and marks the quiz and test; this page shows what it sends. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const id = new URLSearchParams(window.location.search).get('id');
  const base = `/api/materials/${encodeURIComponent(id)}/pack`;
  const TABS = [['summary', 'Summary'], ['cards', 'Flashcards'], ['quiz', 'Quiz'], ['test', 'Practice test']];
  let pack = null;
  let tab = 'summary';
  const flipped = new Set();
  const marked = {}; // section -> graded result
  let mine = false;  // only what I still need (quiz and test)
  let skipped = 0;
  let shown = null;

  const fail = (err) => { root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div><p><a href="/my-material">Back to my material</a></p>`; };

  async function load() {
    let out;
    try { out = await App.api.get(mine ? `${base}?adapt=1` : base); } catch (err) { return fail(err); }
    pack = out.pack;
    shown = out.shown || null; skipped = out.skipped_known || 0;
    if (!pack || pack.status === 'building') {
      root.innerHTML = `<p class="small"><a href="/my-material">&larr; My material</a></p><h1>Study pack</h1><div class="loading"><span class="spinner"></span>${pack ? 'Building your study pack. You can leave this page.' : 'No pack yet.'}</div>`;
      if (pack) setTimeout(load, 4000);
      return null;
    }
    if (pack.status === 'failed') { root.innerHTML = `<p class="small"><a href="/my-material">&larr; My material</a></p><div class="notice notice-error">The study pack could not be built from this text. Try a clearer or longer one.</div>`; return null; }
    return render();
  }

  function questionHtml(section, q, i) {
    const r = marked[section] && marked[section].results.find((x) => x.id === q.id);
    let input;
    if (q.type === 'multiple_choice') {
      input = `<div role="radiogroup">${q.choices.map((c, k) => `<label class="field" style="display:flex;gap:8px;align-items:center"><input type="radio" name="${esc(q.id)}" value="${k}"${r ? ' disabled' : ''}> <span>${esc(c)}</span></label>`).join('')}</div>`;
    } else if (q.type === 'written') {
      input = `<textarea rows="4" name="${esc(q.id)}" aria-label="Your answer"${r ? ' disabled' : ''}></textarea>`;
    } else {
      input = `<input type="text" name="${esc(q.id)}" aria-label="Your answer" autocomplete="off"${r ? ' disabled' : ''}>`;
    }
    let verdict = '';
    if (r && r.type === 'written') {
      verdict = `<p class="small"><strong>Model answer:</strong> ${esc(r.model_answer)}</p><p class="small">A good answer covers: ${r.key_points.map(esc).join('; ')}.</p><p class="tiny muted">From your material: “${esc(r.quote)}”. Check your own answer against this.</p>`;
    } else if (r) {
      verdict = `<p class="small"><strong>${r.correct ? 'Right.' : `Not quite. The answer is: ${esc(r.correct_answer)}.`}</strong> ${esc(r.explanation || '')}</p><p class="tiny muted">From your material: “${esc(r.quote)}”</p>`;
    }
    return `<li style="padding:10px 0"><p><strong>${i + 1}.</strong> ${esc(q.prompt)}</p>${input}${verdict}</li>`;
  }

  function section(name) {
    const items = pack[name];
    const pick = `<p class="small"><label><input type="checkbox" id="mine"${mine ? ' checked' : ''}> Only what I still need${mine && skipped ? ` (${skipped} on skills you already know left out)` : ''}</label></p>`;
    if (!items.length) return `${pick}<p class="muted">${mine ? 'Nothing left here: you already know the skills these questions cover. Untick the box to see them all.' : 'Nothing in this part passed the checks for this material.'}</p>`;
    const res = marked[name];
    return `${pick}<form id="sec-form" class="card"><ol style="padding-left:18px;margin:0">${items.map((q, i) => questionHtml(name, q, i)).join('')}</ol>
      ${res ? `<p><strong>${res.right} of ${res.marked} marked answers right.</strong> Written answers are for you to check.</p><button class="btn" type="button" id="again">Try again</button>`
    : `<button class="btn btn-primary" type="submit">Check my answers</button>`}</form>`;
  }

  function body() {
    if (tab === 'summary') {
      return `<div class="card">${pack.summary.length ? pack.summary.map((p) => `<p>${esc(p)}</p>`).join('') : '<p class="muted">No summary was written for this material.</p>'}</div>`;
    }
    if (tab === 'cards') {
      if (!pack.cards.length) return '<p class="muted">No flashcards passed the checks for this material.</p>';
      return `<p class="small muted">${pack.cards.length} cards. Tap a card to flip it. <a href="/my-material-cards?id=${encodeURIComponent(id)}">Review, edit and add cards (spaced)</a></p><div>${pack.cards.map((c) => {
        const open = flipped.has(c.id);
        return `<button type="button" class="card" data-card="${esc(c.id)}" aria-expanded="${open}" style="display:block;width:100%;text-align:left;margin-bottom:10px"><strong>${esc(c.front)}</strong>${open ? `<p style="margin:8px 0 0">${esc(c.back)}</p><p class="tiny muted" style="margin:6px 0 0">From your material: “${esc(c.quote)}”</p>` : ''}</button>`;
      }).join('')}</div>`;
    }
    return section(tab);
  }

  function render() {
    root.innerHTML = `
      <p class="small"><a href="/my-material">&larr; My material</a></p>
      <h1>${esc(pack.title)}</h1>
      <p class="muted">A study pack: quick aids made only from your text. ${pack.status === 'partial' ? 'It is partial: some parts could not be built. ' : ''}Want the full course with lessons and spaced review? Make a learning path from My material.</p>
      <div class="row-wrap" role="tablist" style="gap:8px;margin:12px 0">${TABS.map(([k, label]) => `<button type="button" class="btn btn-sm${k === tab ? ' btn-primary' : ''}" role="tab" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join('')}</div>
      <div id="tab-body">${body()}</div>`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    root.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.card; if (flipped.has(k)) flipped.delete(k); else flipped.add(k); render(); }));
    const mineBox = document.getElementById('mine');
    if (mineBox) mineBox.addEventListener('change', () => { mine = mineBox.checked; delete marked.quiz; delete marked.test; load(); });
    const form = document.getElementById('sec-form');
    if (form) {
      const again = document.getElementById('again');
      if (again) again.addEventListener('click', () => { delete marked[tab]; render(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const answers = {};
        pack[tab].forEach((q) => {
          if (q.type === 'multiple_choice') { const c = form.querySelector(`input[name="${q.id}"]:checked`); if (c) answers[q.id] = Number(c.value); }
          else { const f = form.querySelector(`[name="${q.id}"]`); if (f && f.value.trim()) answers[q.id] = f.value; }
        });
        try { marked[tab] = await App.api.post(`${base}/grade`, { section: tab, answers, only: shown || undefined }); render(); } catch (err) { App.toast(err.message, 'error'); }
      });
    }
    return null;
  }

  load();
});
