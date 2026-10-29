/* My material: upload or paste study material, see what is kept, delete it.
 *
 * Slice (a) only stores the text. Building a course from it comes in a later slice.
 * The file is sent as raw bytes; the server decides its type from the bytes. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;

  let data;
  try { data = await App.api.get('/api/materials'); } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }

  const KIND = { pdf: 'PDF', docx: 'Word', text: 'Text', paste: 'Pasted' };

  function render() {
    const lim = data.limits;
    root.innerHTML = `
      <h1>My material</h1>
      <p class="muted">Add notes, a chapter or a handout, then press Make a course: Savant turns it into lessons and practice, checks you before moving on, and brings things back for review when you are about to forget them.</p>
      <div class="card">
        <h2>Where it goes</h2>
        <p class="small">We read the text out of your file and keep only that text, on Savant's server, tied to your account. The file itself is not kept. Nobody else can see it and it is never shared with other learners. When a course is built from it, the text is sent to the AI services Savant uses for learners. Delete it here and it is removed for real, right away. Only upload material you may use for your own study.</p>
      </div>
      <div class="card" style="margin-top:18px">
        <h2>Upload a file</h2>
        <label class="field"><span>PDF, Word (.docx), .txt or .md. Up to ${lim.max_mb} MB and about ${lim.max_pages} pages.</span>
          <input type="file" id="file" accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"></label>
        <button class="btn btn-primary" type="button" id="upload">Upload</button>
        <p class="small" id="upload-note" role="status"></p>
      </div>
      <div class="card" style="margin-top:18px">
        <h2>Or paste text</h2>
        <label class="field"><span>Title (optional)</span><input type="text" id="paste-title" maxlength="120"></label>
        <label class="field"><span>Text</span><textarea id="paste-text" rows="8"></textarea></label>
        <button class="btn btn-primary" type="button" id="paste">Save pasted text</button>
        <p class="small" id="paste-note" role="status"></p>
      </div>
      <div class="card" style="margin-top:18px"><h2>Your material (${data.materials.length} of ${lim.max_items})</h2>
        ${data.materials.length ? `<ul style="list-style:none;padding:0;margin:0">${data.materials.map((m) => `
          <li style="padding:8px 0">
            <div class="row-between row-wrap"><span><strong>${esc(m.title)}</strong> <span class="tiny muted">${KIND[m.kind] || ''} · ${m.words.toLocaleString()} words${m.pages ? ` · ${m.pages} pages` : ''} · ${esc(String(m.added_at).slice(0, 10))}</span></span>
            <span><button class="btn btn-sm btn-primary" type="button" data-course="${m.id}" id="course-${m.id}">Make a course</button>
            <button class="btn btn-sm" type="button" data-del="${m.id}" aria-label="Delete ${esc(m.title)}">Delete</button></span></div>
            <p class="tiny muted" id="course-note-${m.id}" role="status" style="margin:4px 0 0"></p>
            <p class="tiny muted" style="margin:4px 0 0">${esc(m.preview)}…</p>
          </li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}
      </div>`;

    const note = (id, text) => { document.getElementById(id).textContent = text; };
    document.getElementById('upload').addEventListener('click', async () => {
      const f = document.getElementById('file').files[0];
      if (!f) return note('upload-note', 'Choose a file first.');
      if (f.size > lim.max_mb * 1024 * 1024) return note('upload-note', `That file is over ${lim.max_mb} MB.`);
      note('upload-note', 'Uploading and reading it…');
      try {
        const res = await fetch(`/api/materials?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' } });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) return note('upload-note', payload.error || `Upload failed (${res.status}).`);
        data.materials = payload.materials;
        render();
        App.toast('Saved.', 'ok');
      } catch (err) { note('upload-note', 'The upload did not go through. Check your connection and try again.'); }
    });
    document.getElementById('paste').addEventListener('click', async () => {
      try {
        const out = await App.api.post('/api/materials/paste', { title: document.getElementById('paste-title').value, text: document.getElementById('paste-text').value });
        data.materials = out.materials;
        render();
        App.toast('Saved.', 'ok');
      } catch (err) { note('paste-note', err.message); }
    });
    // Course: start the build, poll its status, then link to the study page.
    const courseUi = (id, c) => {
      const btn = document.getElementById(`course-${id}`);
      const n = document.getElementById(`course-note-${id}`);
      if (!btn || !n) return;
      if (!c) { btn.textContent = 'Make a course'; return; }
      if (c.status === 'building') { btn.disabled = true; btn.textContent = 'Building…'; n.textContent = c.planned ? `Building your course: ${c.skills.length} of ${c.planned} skills ready. You can leave this page.` : 'Planning your course from the text. This can take a few minutes; you can leave this page.'; return; }
      btn.disabled = false;
      if (c.status === 'ready' || c.status === 'partial') {
        btn.textContent = 'Study';
        btn.dataset.study = '1';
        n.textContent = `${c.skills.length} skills in ${(c.units || []).length || 1} unit${(c.units || []).length > 1 ? 's' : ''}${c.status === 'partial' ? ' so far (the rest can be built later; press Make a course again)' : ''}.`;
      } else { btn.textContent = 'Try again'; n.textContent = 'The course could not be built from this text. Try a clearer or longer one.'; }
    };
    const poll = async (id, tries) => {
      try {
        const out = await App.api.get(`/api/materials/${id}/course`);
        courseUi(id, out.course);
        if (out.course && out.course.status === 'building' && tries < 200) setTimeout(() => poll(id, tries + 1), 4000);
      } catch (err) { /* leave the note as it is */ }
    };
    root.querySelectorAll('[data-course]').forEach((b) => {
      poll(b.dataset.course, 0);
      b.addEventListener('click', async () => {
        if (b.dataset.study) { window.location.href = `/my-material-study?id=${b.dataset.course}`; return; }
        try {
          const out = await App.api.post(`/api/materials/${b.dataset.course}/course`, {});
          if (out.course) courseUi(b.dataset.course, out.course); else { courseUi(b.dataset.course, { status: 'building' }); poll(b.dataset.course, 0); }
        } catch (err) { App.toast(err.message, 'error'); }
      });
    });
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Delete this material? It is removed for good.')) return;
      try { const out = await App.api.del(`/api/materials/${b.dataset.del}`); data.materials = out.materials; render(); } catch (err) { App.toast(err.message, 'error'); }
    }));
  }
  render();
});
