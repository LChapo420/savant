/* Retention goals: how long do you want to remember each subject and each course of your own material?
 *
 *   RetentionGoal.list(host)   every subject and uploaded course with its goal, easy to change, for the profile
 *
 * The choices are a test on a date, a few months, a year, years, or forever (the default). Everything is then
 * scheduled for that goal, so no time goes on remembering longer than you need. After a test date has passed
 * you are asked whether to keep the subject. (services/retention-goal.js, docs/RETENTION-GOALS.md)
 */
(function () {
  const esc = (t) => (window.App ? App.escapeHtml(t) : String(t));
  const api = () => App.api;

  function dateBox(today, max) {
    const d = (n) => { const x = new Date(Date.now() + n * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    return { min: today || d(0), max: d(max || 1095) };
  }

  function row(item, state) {
    const g = item.goal;
    const id = `rg-${item.kind}-${item.id}`;
    const box = dateBox(state.today, state.max_ahead);
    const current = g.status === 'date' ? 'date' : (item.stored && item.stored.horizon) || 'forever';
    const after = item.ask_after_test ? `
      <div class="notice" role="group" aria-label="Keep ${esc(item.title)} after the test" style="margin-top:8px">
        <p class="small" style="margin:0 0 6px">Your test on ${esc(g.test_date)} has passed. Do you want to keep remembering this?</p>
        ${[['forever', 'Yes, forever'], ['years', 'Years'], ['year', 'A year'], ['months', 'A few months'], ['stop', 'No, stop reviews']].map(([v, l]) => `<button type="button" class="btn btn-sm rg-after" data-after="${v}">${esc(l)}</button>`).join(' ')}
      </div>` : '';
    return `
      <div class="rg-item" data-kind="${esc(item.kind)}" data-id="${item.id}" style="padding:10px 0;border-top:1px solid var(--border, #e5e5e5)">
        <div style="font-weight:600">${esc(item.title)}</div>
        <p class="small muted" style="margin:4px 0" id="${id}-sum">${esc(item.summary)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label class="visually-hidden" for="${id}-h">How long to remember ${esc(item.title)}</label>
          <select id="${id}-h" class="input rg-h">
            ${state.choices.map((c) => `<option value="${esc(c.id)}"${c.id === current ? ' selected' : ''}>${esc(c.label)}${c.id === 'forever' && item.default_shown && !item.stored ? ' (default)' : ''}</option>`).join('')}
          </select>
          <label class="visually-hidden" for="${id}-d">Test date</label>
          <input id="${id}-d" type="date" class="input rg-d" min="${box.min}" max="${box.max}" value="${esc(g.status === 'date' ? g.test_date : '')}" style="${current === 'date' ? '' : 'display:none'}">
          <button type="button" class="btn btn-sm rg-save">Save</button>
          <span class="small muted rg-msg" role="status"></span>
        </div>
        ${after}
      </div>`;
  }

  async function list(host) {
    if (!host) return;
    let state;
    try { state = await api().get('/api/retention-goals'); } catch { return; }
    const items = [...state.enrollments, ...state.materials];
    if (!items.length) return;
    const head = state.headline ? `<p class="small" style="margin:0 0 6px"><strong>Next test:</strong> ${esc(state.headline.title)}, ${esc(state.headline.test_date)} (${state.headline.days_left === 0 ? 'today' : `${state.headline.days_left} day${state.headline.days_left === 1 ? '' : 's'}`})</p>` : '';
    host.innerHTML = `${head}<p class="small muted" style="margin-top:0">How long do you want to remember each one? A test on a date, a few months, a year, years or forever. Savant spends your review time only on what that goal needs. Forever is the default and keeps the full long-term schedule; you can change it any time.</p>${items.map((i) => row(i, state)).join('')}`;
    const send = async (node, body) => {
      const msg = node.querySelector('.rg-msg');
      msg.textContent = 'Saving...';
      try {
        const out = await api().request('PUT', '/api/retention-goals', { kind: node.dataset.kind, id: Number(node.dataset.id), ...body });
        node.querySelector('.rg-after') && node.querySelectorAll('.rg-after').forEach((b) => b.remove());
        node.querySelector('[id$="-sum"]').textContent = out.item.summary;
        msg.textContent = 'Saved.';
      } catch (err) { msg.textContent = err.message || 'Could not save.'; }
    };
    host.querySelectorAll('.rg-item').forEach((node) => {
      const h = node.querySelector('.rg-h');
      const d = node.querySelector('.rg-d');
      h.addEventListener('change', () => { d.style.display = h.value === 'date' ? '' : 'none'; });
      node.querySelector('.rg-save').addEventListener('click', () => send(node, { horizon: h.value, test_date: h.value === 'date' ? d.value : undefined }));
      node.querySelectorAll('.rg-after').forEach((b) => b.addEventListener('click', () => send(node, { keep_after: b.dataset.after })));
    });
  }

  window.RetentionGoal = { list };
})();
