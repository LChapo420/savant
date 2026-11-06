/* Study goals: what do you want out of each subject and each course of your own material?
 *
 *   StudyGoal.list(host)    every subject and uploaded course with its goal, easy to change, for the profile
 *   StudyGoal.one(host, id) one uploaded course's control, for the My material page
 *
 * Full depth is the default. "Core parts, fast" gives shorter lessons and sets extra practice aside: the list of what is set
 * aside is always shown, and every item can be brought back. (services/study-goal.js, docs/MODIFICATION-AUDIT.md)
 */
(function () {
  const esc = (t) => (window.App ? App.escapeHtml(t) : String(t));
  const api = () => App.api;

  const PHRASE = { core: 'the core parts fast', full: 'the full depth', test: 'ready for a test' };
  function sentence(choices) {
    const w = choices.map((c) => PHRASE[c.id] || c.label.toLowerCase());
    const list = w.length > 1 ? `${w.slice(0, -1).join(', ')}, or ${w[w.length - 1]}` : w[0];
    return list.charAt(0).toUpperCase() + list.slice(1);
  }

  function row(item, state) {
    const id = `sg-${item.kind}-${item.id}`;
    const aside = item.set_aside || [];
    const list = item.goal === 'core' && aside.length ? `
      <details style="margin-top:6px"><summary class="small">${aside.length} set aside (still open). Show them</summary>
        <ul class="small" style="margin:6px 0 0 18px">${aside.map((a) => `<li>${esc(a.title)} <button type="button" class="btn btn-sm sg-back" data-key="${esc(a.level !== undefined ? a.level : a.id)}">Bring back</button></li>`).join('')}</ul>
        <button type="button" class="btn btn-sm sg-all" style="margin-top:6px">Bring all back</button>
      </details>` : '';
    return `
      <div class="sg-item" data-kind="${esc(item.kind)}" data-id="${item.id}" style="padding:10px 0;border-top:1px solid var(--border, #e5e5e5)">
        <div style="font-weight:600">${esc(item.title)}</div>
        <p class="small muted" style="margin:4px 0" id="${id}-sum">${esc(item.summary)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label class="visually-hidden" for="${id}-g">What you want from ${esc(item.title)}</label>
          <select id="${id}-g" class="input sg-g">
            ${state.choices.map((c) => `<option value="${esc(c.id)}"${c.id === item.goal ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-sm sg-save">Save</button>
          <span class="small muted sg-msg" role="status"></span>
        </div>
        ${list}
      </div>`;
  }

  async function paint(host, only) {
    let state;
    try { state = await api().get('/api/study-goals'); } catch { return; }
    // With only Full depth available there is nothing to choose: no picker at all.
    if (!state.enabled || !Array.isArray(state.choices) || state.choices.length < 2) { host.innerHTML = ''; const card = host.closest('#study-goals-card'); if (card) card.style.display = 'none'; return; }
    const items = [...state.enrollments, ...state.materials].filter((x) => !only || (x.kind === 'material' && x.id === only));
    if (!items.length) return;
    const shown = host.closest('#study-goals-card'); if (shown) shown.style.display = '';
    host.innerHTML = `${only ? '' : `<p class="small muted" style="margin-top:0">What do you want from each one? ${esc(sentence(state.choices))}.${state.choices.some((c) => c.id === 'core') ? ' Anything set aside is listed and can be brought back.' : ''}</p>`}${items.map((i) => row(i, state)).join('')}`;
    wire(host, only);
  }

  function wire(host, only) {
    const send = async (node, body) => {
      const msg = node.querySelector('.sg-msg');
      msg.textContent = 'Saving...';
      try {
        await api().request('PUT', '/api/study-goals', { kind: node.dataset.kind, id: Number(node.dataset.id), ...body });
        await paint(host, only);
      } catch (err) { msg.textContent = err.message || 'Could not save.'; }
    };
    host.querySelectorAll('.sg-item').forEach((node) => {
      node.querySelector('.sg-save').addEventListener('click', () => send(node, { goal: node.querySelector('.sg-g').value }));
      node.querySelectorAll('.sg-back').forEach((b) => b.addEventListener('click', () => send(node, { goal: 'core', restore: [/^\d+$/.test(b.dataset.key) ? Number(b.dataset.key) : b.dataset.key] })));
      const all = node.querySelector('.sg-all');
      if (all) all.addEventListener('click', () => send(node, { goal: 'core', restore: 'all' }));
    });
  }

  const list = (host) => host && paint(host, null);
  const one = (host, materialId) => host && paint(host, Number(materialId));

  window.StudyGoal = { list, one };
})();
