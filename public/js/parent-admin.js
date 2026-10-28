/* The operator's check of signed consent forms (admins only; the server asks again). */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'admin');
  const esc = App.escapeHtml;
  const list = document.getElementById('list');
  const errorBox = document.getElementById('error');
  const NAME = { third_party_ai: 'Outside AI', ai_training: 'AI training' };

  async function load() {
    let out;
    try { out = await App.api.get('/api/consent/admin/forms'); } catch (err) {
      list.innerHTML = '';
      errorBox.textContent = err.status === 404 ? 'This page is for admins.' : err.message;
      errorBox.classList.remove('hidden');
      return;
    }
    list.innerHTML = out.waiting.length ? out.waiting.map((w) => `
      <article class="child-block" data-id="${w.id}">
        <h2>${esc(w.child || 'Child')}</h2>
        <p class="muted small">Parent ${esc(w.parent_email)}; consent given ${esc(new Date(w.granted_at).toLocaleString())}</p>
        ${w.requested.map((scope) => `
          <div class="row-wrap">
            <label class="check-row"><input type="checkbox" data-checked="${scope}"><span>Signed form checked for ${esc(NAME[scope] || scope)}</span></label>
            <button class="btn btn-sm" data-verify="${scope}" type="button">Switch on</button>
          </div>`).join('')}
      </article>`).join('') : '<p class="muted">No forms are waiting.</p>';
  }

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-verify]');
    if (!button) return;
    const block = button.closest('.child-block');
    const scope = button.dataset.verify;
    const checked = block.querySelector(`[data-checked="${scope}"]`).checked;
    errorBox.classList.add('hidden');
    try {
      await App.api.post(`/api/consent/admin/forms/${block.dataset.id}/verify`, { scope, checked });
      App.toast('Switched on.');
      await load();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    }
  });
  await load();
});
