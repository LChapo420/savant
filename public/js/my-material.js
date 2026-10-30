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

  const KIND = { pdf: 'PDF', docx: 'Word', text: 'Text', paste: 'Pasted', pptx: 'Slides', link: 'Web page', transcript: 'Transcript', audio: 'Recording', odt: 'OpenDocument', epub: 'Book', xlsx: 'Spreadsheet', rtf: 'RTF', html: 'HTML' };
  const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;

  function render() {
    const lim = data.limits;
    root.innerHTML = `
      <h1>My material</h1>
      <p class="muted">Add notes, a chapter or a handout, then choose: a <strong>study pack</strong> (a summary, flashcards, a quiz and a practice test, made in a few minutes) or a <strong>learning path</strong> (a course that turns it into lessons and practice, checks you before moving on, and brings things back for review when you are about to forget them).</p>
      <div class="card">
        <h2>Where it goes</h2>
        <p class="small">We read the text out of your file and keep only that text, on Savant's server, tied to your account. The file itself is not kept. Nobody else can see it and it is never shared with other learners. When a course, study pack or podcast script is built from it, the text is sent to the AI services Savant uses for learners. When you ask the tutor about it, the few matching passages go along with your question; on graded or timed pages the tutor is not given your text. A podcast is only a script: your browser reads it aloud with its own voice, and no audio is made or kept. Delete it here and it is removed for real, right away, with its script. If you add a recording, our own server turns it into text with an open speech model and then throws the audio away; no outside speech service hears it. If you add a web link, our server opens that page once, keeps only its article text, and does not keep the page. If you add a video file, the audio is pulled out and turned into text on Savant's own server, and the video and audio are deleted when that finishes; only the text is kept. If you add a YouTube link, our server reads that video's caption text from YouTube (never the video itself) and keeps only the text. Only upload material you may use for your own study.</p>
      </div>
      <div class="card" style="margin-top:18px">
        <h2>Upload a file</h2>
        <label class="field"><span>PDF, Word (.docx), PowerPoint (.pptx), .txt or .md. For Google Slides, use File, Download, PowerPoint. Up to ${lim.max_mb} MB and about ${lim.max_pages} pages.</span>
          <input type="file" id="file" accept=".pdf,.docx,.pptx,.xlsx,.odt,.epub,.rtf,.html,.htm,.csv,.tex,.txt,.md,.markdown,.mp4,.mov,.webm,.mkv,application/pdf,text/plain,text/markdown,video/mp4,video/quicktime,video/webm,video/x-matroska"></label>
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
      <div class="card" style="margin-top:18px">
        <h2>Or add a web page</h2>
        <label class="field"><span>A public web address (https://…). Pages that need a sign-in will not work: paste the text instead.</span><input type="url" id="link-url" maxlength="2000" placeholder="https://"></label>
        <button class="btn btn-primary" type="button" id="link-add">Read this page</button>
        <p class="small" id="link-note" role="status"></p>
      </div>
      <div class="card" style="margin-top:18px">
        <h2>Or add a YouTube video</h2>
        <p class="small">Savant reads the video's captions (the ones the uploader wrote, else the automatic ones). It does not download the video. If a video has no captions, upload the video file or paste its transcript below.</p>
        <label class="field"><span>YouTube link</span><input type="url" id="yt-url" maxlength="300" placeholder="https://www.youtube.com/watch?v=…"></label>
        <button class="btn btn-primary" type="button" id="yt-add">Read the captions</button>
        <p class="small" id="yt-note" role="status"></p>
      </div>
      <div class="card" style="margin-top:18px">
        <h2>Or paste a video transcript</h2>
        <p class="small">Open the video, choose "Show transcript", copy it and paste it here. The timestamps are removed.</p>
        <label class="field"><span>Title (optional)</span><input type="text" id="tr-title" maxlength="120"></label>
        <label class="field"><span>Video link (optional, kept only as a label)</span><input type="url" id="tr-link" maxlength="200" placeholder="https://www.youtube.com/watch?v=…"></label>
        <label class="field"><span>Transcript</span><textarea id="tr-text" rows="6"></textarea></label>
        <button class="btn btn-primary" type="button" id="tr-add">Save transcript</button>
        <p class="small" id="tr-note" role="status"></p>
      </div>
      <div class="card" style="margin-top:18px">
        <h2>Or add a recording</h2>
        <p class="small">A lecture, a voice memo, a meeting: mp3, m4a, wav, webm or ogg, up to ${lim.max_mb} MB. It is turned into text on Savant's own server with an open speech model (no outside speech service), a few minutes for every ten minutes of audio. The recording is not kept, only the text with its time marks.</p>
        <p class="small" id="audio-avail" role="status"></p>
        <input type="file" id="audio-file" accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg" aria-label="Audio file">
        <div class="row-wrap" style="margin-top:8px">
          <button class="btn btn-primary" type="button" id="audio-upload">Transcribe this file</button>
          <button class="btn" type="button" id="audio-rec">Record</button>
        </div>
        <p class="small" id="audio-note" role="status"></p>
        <ul style="list-style:none;padding:0;margin:8px 0 0" id="audio-jobs"></ul>
      </div>
      <div class="card" style="margin-top:18px"><h2>Your material (${data.materials.length} of ${lim.max_items})</h2>
        ${data.materials.length ? `<ul style="list-style:none;padding:0;margin:0">${data.materials.map((m) => `
          <li style="padding:8px 0">
            <div class="row-between row-wrap"><span><strong>${esc(m.title)}</strong> <span class="tiny muted">${KIND[m.kind] || ''} · ${m.words.toLocaleString()} words${m.pages ? ` · ${m.pages} pages` : ''} · ${esc(String(m.added_at).slice(0, 10))}</span></span>
            <span><button class="btn btn-sm" type="button" data-pack="${m.id}" id="pack-${m.id}">Study pack</button>
            <a class="btn btn-sm" href="/my-material-podcast?id=${m.id}">Podcast</a>
            <button class="btn btn-sm btn-primary" type="button" data-course="${m.id}" id="course-${m.id}">Learning path</button>
            <button class="btn btn-sm" type="button" data-del="${m.id}" aria-label="Delete ${esc(m.title)}">Delete</button></span></div>
            <p class="tiny muted" id="course-note-${m.id}" role="status" style="margin:4px 0 0"></p>
            <div class="row-wrap" id="extend-${m.id}" style="margin:4px 0 0" hidden></div>
            <p class="tiny muted" id="pack-note-${m.id}" role="status" style="margin:4px 0 0"></p>
            <p class="tiny muted" style="margin:4px 0 0">${esc(m.preview)}…</p>
          </li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}
      </div>`;

    const note = (id, text) => { document.getElementById(id).textContent = text; };
    document.getElementById('upload').addEventListener('click', async () => {
      const f = document.getElementById('file').files[0];
      if (!f) return note('upload-note', 'Choose a file first.');
      const video = VIDEO_EXT.test(f.name);
      if (!video && f.size > lim.max_mb * 1024 * 1024) return note('upload-note', `That file is over ${lim.max_mb} MB.`);
      if (video && f.size > 200 * 1024 * 1024) return note('upload-note', 'That video is over 200 MB. Upload just the audio or a shorter part.');
      note('upload-note', video ? 'Uploading the video and pulling out its sound…' : 'Uploading and reading it…');
      try {
        const res = await fetch(`/api/materials${video ? '/video' : ''}?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' } });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) return note('upload-note', payload.error || `Upload failed (${res.status}).`);
        if (video) { note('upload-note', 'Uploaded. The sound is being turned into text; you can leave this page and it will be in your list when it is done.'); return audioPoll(0); }
        data.materials = payload.materials;
        render();
        App.toast('Saved.', 'ok');
      } catch (err) { note('upload-note', 'The upload did not go through. Check your connection and try again.'); }
    });
    const addVia = (btnId, noteId, path, body, busy) => document.getElementById(btnId).addEventListener('click', async () => {
      note(noteId, busy);
      try {
        const out = await App.api.post(path, body());
        data.materials = out.materials;
        render();
        App.toast('Saved.', 'ok');
      } catch (err) { note(noteId, err.message); }
    });
    // Recordings: upload or record, then follow the background transcription.
    const audioUi = (state) => {
      const av = document.getElementById('audio-avail');
      const ul = document.getElementById('audio-jobs');
      if (!av || !ul) return;
      av.textContent = state.available.ready ? '' : state.available.reason;
      ul.innerHTML = state.jobs.map((j) => `<li class="small" style="padding:4px 0"><strong>${esc(j.title)}</strong>: ${
        j.status === 'done' ? 'done, it is in your list' : j.status === 'failed' ? esc(j.error || 'failed') : j.chunks ? `transcribing, ${j.percent}%` : 'getting ready…'
      } ${j.status === 'running' || j.status === 'queued' ? '' : `<button class="btn btn-sm" type="button" data-audio-del="${j.id}">Dismiss</button>`}</li>`).join('');
      ul.querySelectorAll('[data-audio-del]').forEach((b) => b.addEventListener('click', async () => {
        const out = await App.api.del(`/api/materials/audio/${b.dataset.audioDel}`).catch(() => null);
        if (out) audioUi({ available: state.available, jobs: out.jobs });
      }));
    };
    const audioPoll = async (tries) => {
      let st;
      try { st = await App.api.get('/api/materials/audio'); } catch { return; }
      audioUi(st);
      const active = st.jobs.some((j) => j.status === 'running' || j.status === 'queued');
      if (active && tries < 900) return setTimeout(() => audioPoll(tries + 1), 4000);
      if (!active && st.jobs.some((j) => j.status === 'done') && !data.materials.some((m) => m.kind === 'audio' && st.jobs.some((j) => j.material_id === m.id))) {
        try { data = await App.api.get('/api/materials'); render(); } catch { /* the list refreshes on reload */ }
      }
      return undefined;
    };
    const sendAudio = async (blob, name) => {
      note('audio-note', 'Uploading…');
      try {
        const res = await fetch(`/api/materials/audio?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' } });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) return note('audio-note', payload.error || `Upload failed (${res.status}).`);
        note('audio-note', 'Uploaded. You can leave this page; the text will be in your list when it is done.');
        return audioPoll(0);
      } catch { return note('audio-note', 'The upload did not go through. Check your connection and try again.'); }
    };
    document.getElementById('audio-upload').addEventListener('click', () => {
      const f = document.getElementById('audio-file').files[0];
      if (!f) return note('audio-note', 'Choose an audio file first.');
      if (f.size > lim.max_mb * 1024 * 1024) return note('audio-note', `That file is over ${lim.max_mb} MB.`);
      return sendAudio(f, f.name);
    });
    let recorder = null;
    document.getElementById('audio-rec').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (recorder) { recorder.stop(); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) return note('audio-note', 'This browser cannot record. Upload a file instead.');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return note('audio-note', 'The microphone is not available or was not allowed.'); }
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (e) => { if (e.data.size) chunks.push(e.data); });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder = null; btn.textContent = 'Record';
        const blob = new Blob(chunks, { type: 'application/octet-stream' });
        if (blob.size > lim.max_mb * 1024 * 1024) return note('audio-note', `That recording is over ${lim.max_mb} MB. Record a shorter part.`);
        return sendAudio(blob, `Recording ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.webm`);
      });
      recorder.start();
      btn.textContent = 'Stop and transcribe';
      note('audio-note', 'Recording…');
    });
    audioPoll(0);
    addVia('link-add', 'link-note', '/api/materials/link', () => ({ url: document.getElementById('link-url').value }), 'Opening the page…');
    addVia('yt-add', 'yt-note', '/api/materials/youtube', () => ({ url: document.getElementById('yt-url').value }), 'Reading the captions…');
    addVia('tr-add', 'tr-note', '/api/materials/transcript', () => ({ title: document.getElementById('tr-title').value, link: document.getElementById('tr-link').value, text: document.getElementById('tr-text').value }), 'Saving…');
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
      if (!c) { btn.textContent = 'Learning path'; return; }
      if (c.status === 'building') { btn.disabled = true; btn.textContent = 'Building…'; n.textContent = c.planned ? `Building your course: ${c.skills.length} of ${c.planned} skills ready. You can leave this page.` : 'Planning your course from the text. This can take a few minutes; you can leave this page.'; return; }
      btn.disabled = false;
      if (c.status === 'ready' || c.status === 'partial') {
        btn.textContent = 'Study';
        btn.dataset.study = '1';
        n.textContent = `${c.skills.length} skills in ${(c.units || []).length || 1} unit${(c.units || []).length > 1 ? 's' : ''}${c.status === 'partial' ? ' so far (the rest can be built later; press Learning path again)' : ''}.`;
        const gone = (c.missed || []).filter((m) => m.note);
        if (gone.length) {
          n.textContent += ` ${c.coverage ? `${c.coverage.covered}% of the text is in this course. ` : ''}${gone.map((m) => m.note).join(' ')}`;
          if (gone.some((m) => m.retryable)) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = 'Try these parts again';
            b.addEventListener('click', async () => {
              b.disabled = true;
              try { await App.api.post(`/api/materials/${id}/course/retry`, {}); courseUi(id, { ...c, status: 'building', skills: c.skills, planned: c.skills.length }); poll(id, 0, true); } catch (err) { b.disabled = false; App.toast(err.message, 'error'); }
            });
            n.appendChild(document.createTextNode(' '));
            n.appendChild(b);
          }
        }
        if (c.last_retry && !c.last_retry.ok && !c.extending) n.appendChild(document.createTextNode(' The last try did not work; try again later.'));
      } else { btn.textContent = 'Try again'; n.textContent = 'The course could not be built from this text. Try a clearer or longer one.'; }
    };
    // Extend a path: more practice on the same skills, or join another of your materials onto it.
    const extendUi = (id, c) => {
      const box = document.getElementById(`extend-${id}`);
      if (!box) return;
      const ready = c && (c.status === 'ready' || c.status === 'partial');
      box.hidden = !ready;
      if (!ready) return;
      const others = data.materials.filter((m) => String(m.id) !== String(id) && !(c.added || []).some((a) => a.material_id === m.id));
      const busy = !!c.extending;
      box.innerHTML = `<button class="btn btn-sm" type="button" data-more="${id}"${busy ? ' disabled' : ''}>More practice</button>
        ${others.length && (c.added || []).length < 4 ? `<select data-addsel="${id}" aria-label="Material to add to this path"${busy ? ' disabled' : ''}>${others.map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('')}</select> <button class="btn btn-sm" type="button" data-add="${id}"${busy ? ' disabled' : ''}>Add to this path</button>` : ''}
        <span class="tiny muted" role="status">${busy ? 'Working on it. You can leave this page.' : extendNote(c)}</span>`;
      box.querySelector('[data-more]').addEventListener('click', () => startExtend(id, 'more', {}));
      const add = box.querySelector('[data-add]');
      if (add) add.addEventListener('click', () => startExtend(id, 'add', { material_id: Number(box.querySelector('[data-addsel]').value) }));
    };
    const extendNote = (c) => {
      const l = c.last_extend;
      const parts = [];
      if ((c.added || []).length) parts.push(`Added: ${c.added.map((a) => esc(a.title)).join(', ')}.`);
      if (!l) return parts.join(' ');
      if (!l.ok) parts.push(esc(l.error || 'That did not work.'));
      else if (l.kind === 'more') parts.push(`Last round: ${l.added} new questions on ${l.skills} skills.`);
      else parts.push(`Last add: ${l.added} new skills${l.duplicates ? ` (${l.duplicates} you already had were left out)` : ''}.`);
      return parts.join(' ');
    };
    const startExtend = async (id, kind, body) => {
      try {
        await App.api.post(`/api/materials/${id}/course/${kind === 'add' ? 'add' : 'more'}`, body);
        poll(id, 0, true);
      } catch (err) { App.toast(err.message, 'error'); }
    };
    const poll = async (id, tries, extending) => {
      try {
        const out = await App.api.get(`/api/materials/${id}/course`);
        courseUi(id, out.course);
        const c = out.course;
        // Right after a start the server may not have flagged it yet: show it busy for the first looks.
        if (extending && c && tries < 2 && !c.extending) c.extending = true;
        extendUi(id, c);
        if (c && (c.status === 'building' || c.extending) && tries < 200) setTimeout(() => poll(id, tries + 1, extending), 4000);
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
    // Study pack: start the build, poll its status, then open the pack page.
    const packUi = (id, p) => {
      const btn = document.getElementById(`pack-${id}`);
      const n = document.getElementById(`pack-note-${id}`);
      if (!btn || !n) return;
      if (!p) { btn.textContent = 'Study pack'; return; }
      if (p.status === 'building') { btn.disabled = true; btn.textContent = 'Building…'; n.textContent = 'Building your study pack. You can leave this page.'; return; }
      btn.disabled = false;
      if (p.status === 'ready' || p.status === 'partial') { btn.textContent = 'Open pack'; btn.dataset.open = '1'; n.textContent = `${p.cards.length} flashcards, ${p.quiz.length} quiz questions, ${p.test.length} test questions.`; }
      else { btn.textContent = 'Try again'; n.textContent = 'The pack could not be built from this text. Try a clearer or longer one.'; }
    };
    const pollPack = async (id, tries) => {
      try {
        const out = await App.api.get(`/api/materials/${id}/pack`);
        packUi(id, out.pack);
        if (out.pack && out.pack.status === 'building' && tries < 200) setTimeout(() => pollPack(id, tries + 1), 4000);
      } catch (err) { /* leave the note as it is */ }
    };
    root.querySelectorAll('[data-pack]').forEach((b) => {
      pollPack(b.dataset.pack, 0);
      b.addEventListener('click', async () => {
        if (b.dataset.open) { window.location.href = `/my-material-pack?id=${b.dataset.pack}`; return; }
        try {
          const out = await App.api.post(`/api/materials/${b.dataset.pack}/pack`, {});
          if (out.pack) packUi(b.dataset.pack, out.pack); else { packUi(b.dataset.pack, { status: 'building' }); pollPack(b.dataset.pack, 0); }
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
