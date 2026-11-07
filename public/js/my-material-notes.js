/* Whole-material notes: sections of bullets, each with the line of your own text it came from. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const id = new URLSearchParams(window.location.search).get('id');
  const base = `/api/materials/${encodeURIComponent(id)}/notes`;
  const back = '<p class="small"><a href="/my-material">&larr; My material</a></p>';

  let pressed = false;
  async function load(start) {
    if (start) pressed = true;
    let out;
    try { out = start ? await App.api.post(base, {}) : await App.api.get(base); } catch (err) { root.innerHTML = `${back}<div class="notice notice-error">${esc(err.message)}</div>`; return; }
    const n = out.notes;
    if (!n && !out.started) {
      root.innerHTML = `${back}<h1>Notes</h1>${pressed ? '<div class="notice notice-error">That could not start: no model is free right now. Try again in a minute.</div>' : ''}<p class="muted">Notes follow your material in order and keep its own terms, numbers and definitions. Each point shows the line of your text it came from.</p><button class="btn btn-primary" type="button" id="make">Make my notes</button>`;
      document.getElementById('make').addEventListener('click', () => load(true));
      return;
    }
    if (!n || n.status === 'building') {
      // While the notes are written, what the material stresses is already known: no model, no wait.
      let top = [];
      try { const list = await App.api.get('/api/materials'); const me = (list.materials || []).find((x) => String(x.id) === String(id)); top = (me && me.top_points) || []; } catch { /* the spinner is enough */ }
      root.innerHTML = `${back}<h1>Notes</h1><div class="loading"><span class="spinner"></span>Making your notes. You can leave this page.</div>${top.length ? `<section class="card" style="margin-top:12px"><h2>What your material stresses</h2><ul style="padding-left:18px">${top.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}`;
      setTimeout(() => load(false), 4000);
      return;
    }
    if (n.status === 'failed') { root.innerHTML = `${back}<div class="notice notice-error">${n.failure === 'busy' ? 'The AI models did not answer, which is not your file\'s fault. Try again in a minute.' : n.failure === 'interrupted' ? 'The notes stopped when the server restarted. Try again.' : 'Notes could not be made or checked just now. Try again in a minute. If it keeps happening, use a clearer or longer text.'}</div><button class="btn" type="button" id="make">Try again</button>`; document.getElementById('make').addEventListener('click', () => load(true)); return; }
    root.innerHTML = `${back}<h1>${esc(n.title)}</h1>
      <p class="small muted">${n.status === 'partial' ? 'Some parts of the material could not be turned into notes. ' : ''}These notes touch about ${n.coverage}% of your material's sections.</p>
      ${n.sections.map((s) => `<section class="card" style="margin-top:12px"><h2>${esc(s.heading)}</h2><ul style="padding-left:18px">${s.bullets.map((b) => `<li>${esc(b.text)}<details><summary class="tiny muted">Show where</summary><p class="tiny muted">“${esc(b.quote)}”</p></details></li>`).join('')}</ul></section>`).join('')}`;
  }
  load(false);
});
