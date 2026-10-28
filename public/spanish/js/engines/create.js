/* Production engines: writing_lab (writing labs, essays, mediation),
 * project, live_conversation, mission. */
(function () {
  const ES = window.ES;
  const { h, esc, icon, ui, sfx } = ES;
  const engines = (ES.engines = ES.engines || {});
  const quit = () => { location.href = '/spanish/lab'; };
  const wc = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

  function stepper(steps, at) {
    return h('ol', { class: 'es-stepper', 'aria-label': 'Steps' }, steps.map((s, i) => `<li data-state="${i < at ? 'done' : i === at ? 'now' : ''}">${i < at ? icon('check') : `<b>${i + 1}</b>`}<span>${esc(s)}</span></li>`).join(''));
  }

  // ── writing lab ─────────────────────────────────────────────────────
  engines.writing_lab = async (level, root) => {
    const w = level.writing;
    const STEPS = ['Plan', 'Draft', 'Feedback', 'Revise', 'Compare'];
    const frame = ui.frame(root, { onQuit: quit });
    const t0 = Date.now();
    const sourceCard = level.source ? h('div', { class: 'es-source' }, `<div class="es-label es-muted">Source (${esc(level.source.lang === 'en' ? 'English' : 'Spanish')})</div><div class="es-source__title">${esc(level.source.title)}</div><p>${esc(level.source.text)}</p>`) : null;
    const taskCard = () => h('div', { class: 'es-task' }, `<div class="es-label es-muted">Task · for ${esc(w.reader)} · ${w.minWords}–${w.maxWords} words</div><p>${esc(w.task)}</p>`);

    // 1. plan
    frame.progress(0.1);
    const plan = h('div', { class: 'es-ex' });
    plan.append(stepper(STEPS, 0), ui.header(level.csv.activity === 'Mediation Task' ? 'Plan your message' : 'Plan your writing'), taskCard());
    if (sourceCard) plan.append(sourceCard);
    const notes = w.plan.map((q) => { const inp = h('input', { class: 'es-input es-input--sm', placeholder: 'Notes (any language)', 'aria-label': q }); plan.append(h('label', { class: 'es-plan__q' }, esc(q)), inp); return inp; });
    frame.setBody(plan);
    await new Promise((resolve) => frame.footer.continueOnly({ label: 'Start writing', onClick: resolve }));
    const planNotes = notes.map((n) => n.value).filter(Boolean);

    // 2. draft, with a live checklist of the must-use forms
    function editor(stepIdx, title, initial, cardsHtml = '') {
      const body = h('div', { class: 'es-ex es-writer' });
      body.append(stepper(STEPS, stepIdx), ui.header(title), taskCard());
      if (sourceCard) body.append(sourceCard.cloneNode(true));
      if (planNotes.length) body.append(h('div', { class: 'es-muted es-small' }, `Your plan: ${esc(planNotes.join(' · '))}`));
      if (cardsHtml) body.append(h('div', { class: 'es-fbcards' }, cardsHtml));
      const box = ES.textBox({ lang: 'es', placeholder: 'Escribe aquí…', onChange: () => update() });
      box.input.rows = Math.max(5, Math.min(14, Math.ceil(w.maxWords / 12)));
      box.input.value = initial || '';
      const meter = h('div', { class: 'es-wordmeter' });
      const checks = h('ul', { class: 'es-goals es-goals--small' }, (w.mustUse || []).map((m, i) => `<li data-i="${i}">${icon('check')}<span>${esc(m.title)}</span></li>`).join(''));
      body.append(box, meter, checks);
      function update() {
        const n = wc(box.text());
        meter.innerHTML = `<b>${n}</b> words <span class="es-muted">(target ${w.minWords}–${w.maxWords})</span>`;
        meter.dataset.state = n < w.minWords ? 'low' : n > w.maxWords ? 'high' : 'ok';
        (w.mustUse || []).forEach((m, i) => { checks.querySelector(`[data-i="${i}"]`).dataset.done = String(new RegExp(m.pattern, 'i').test(ES.grade.stripAccents(box.text()))); });
        frame.footer.ready(n > 0);
      }
      update();
      return { body, box };
    }

    frame.progress(0.3);
    const d = editor(1, 'Write your draft', '');
    frame.setBody(d.body);
    const draft = await new Promise((resolve) => frame.footer.idle({ checkLabel: 'Get feedback', canCheck: false, onCheck: () => resolve(d.box.text()) }));
    frame.footer.busy(true);
    const fb = await ES.api.post('/api/es/writing/feedback', { levelId: level.id, draft }).catch(() => ({ priorities: [], source: 'error' }));

    // 3. feedback on two or three priorities
    frame.progress(0.55);
    const cards = (fb.priorities || []).map((p, i) => `<div class="es-fbcard"><div class="es-fbcard__n">${i + 1}</div><div><b>${esc(p.title)}</b><p>${esc(p.detail)}</p>${p.example ? `<p class="es-fbcard__ex" lang="es">${esc(p.example)}</p>` : ''}</div></div>`).join('');
    const fbBody = h('div', { class: 'es-ex' });
    fbBody.append(stepper(STEPS, 2), ui.header(fb.priorities && fb.priorities.length ? `${fb.priorities.length} things to work on` : 'Looks good!'),
      h('div', { class: 'es-fbcards' }, cards || '<p>Nothing major to fix. You can still polish it before you submit.</p>'),
      h('p', { class: 'es-muted es-small' }, fb.source === 'ai' ? 'Feedback from the AI tutor.' : 'Feedback from the built-in checker (AI unavailable).'));
    frame.setBody(fbBody);
    await new Promise((resolve) => frame.footer.continueOnly({ label: 'Revise', onClick: resolve }));

    // 4. revise
    frame.progress(0.75);
    const r = editor(3, 'Revise your text', draft, cards);
    frame.setBody(r.body);
    const final = await new Promise((resolve) => frame.footer.idle({ checkLabel: 'Submit final', canCheck: true, onCheck: () => resolve(r.box.text()) }));
    frame.footer.busy(true);
    const scored = await ES.api.post('/api/es/writing/score', { levelId: level.id, text: final }).catch(() => null);

    // 5. compare with a model
    frame.progress(1);
    const cmp = h('div', { class: 'es-ex' });
    cmp.append(stepper(STEPS, 4), ui.header('Compare with a model'));
    const two = h('div', { class: 'es-compare2' }, `<div><div class="es-label es-muted">Yours (${wc(final)} words)</div><div class="es-compare2__text" lang="es">${esc(final)}</div></div><div><div class="es-label es-muted">Model</div><div class="es-compare2__text" lang="es">${esc(scored ? scored.model : '')}</div></div>`);
    cmp.append(two);
    frame.setBody(cmp);
    await new Promise((resolve) => frame.footer.continueOnly({ label: 'See my score', onClick: resolve }));
    await ui.complete(root, { title: level.csv.type === 'Essay' ? 'Essay submitted!' : 'Writing done!', xp: 15, accuracy: scored ? scored.rubric.overall : null, accuracyLabel: 'Score', timeMs: Date.now() - t0 });
    ES.flow.back(root, { level, title: 'Your writing rubric', html: scored ? ui.rubric(scored.rubric) : '<p>Could not score this time.</p>' });
  };

  // ── recording helper (audio, optionally with video for playback) ────
  function recordPanel(frame, { seconds, video = false, brief, mustSay = [] }) {
    return new Promise((resolve) => {
      const body = h('div', { class: 'es-ex es-recorder' });
      body.append(ui.header('Record'), h('p', {}, esc(brief)));
      if (mustSay.length) body.append(h('p', { class: 'es-muted' }, `Include: ${mustSay.map((m) => `<b lang="es">${esc(m)}</b>`).join(', ')}`));
      const preview = h('video', { class: 'es-cam', muted: true, playsinline: true, hidden: true });
      const clock = h('div', { class: 'es-display es-rec__clock' }, ES.fmtTime(seconds * 1000));
      const level = h('div', { class: 'es-mic__level es-rec__level', 'aria-hidden': 'true' }, '<i></i><i></i><i></i><i></i><i></i>');
      const camToggle = video ? h('label', { class: 'es-toggle es-toggle--inline' }, '<span>Record video too</span><input type="checkbox" role="switch" class="es-switch">') : null;
      const start = h('button', { class: 'es-btn es-btn--danger es-btn--lg' }, `${icon('mic')} Start recording`);
      body.append(preview, clock, level);
      if (camToggle) body.append(camToggle);
      body.append(start);
      frame.setBody(body);
      frame.footer.hide();
      start.addEventListener('click', async () => {
        start.disabled = true;
        let stream = null; let mediaRec = null; const vchunks = [];
        try {
          const wantVideo = camToggle && camToggle.querySelector('input').checked;
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo ? { width: 640, height: 480 } : false });
          if (wantVideo) {
            preview.hidden = false; preview.srcObject = stream; preview.play();
            mediaRec = new MediaRecorder(stream);
            mediaRec.ondataavailable = (e) => e.data.size && vchunks.push(e.data);
            mediaRec.start();
          }
        } catch (err) {
          start.disabled = false;
          ui.toast('The microphone (or camera) is blocked.');
          return;
        }
        const rec = await ES.recorder.start({ stream, maxMs: seconds * 1000 + 30000, onLevel: (l) => ES.$$('i', level).forEach((b, i) => b.style.setProperty('--lvl', String(Math.max(0, l - Math.abs(i - 2) * 0.15)))) });
        const t0 = Date.now();
        start.innerHTML = `${icon('x')} Stop`; start.disabled = false;
        const tick = setInterval(() => { const left = seconds * 1000 - (Date.now() - t0); clock.textContent = ES.fmtTime(Math.abs(left)); clock.dataset.over = String(left < 0); }, 250);
        const stop = async () => {
          start.disabled = true; clearInterval(tick);
          const out = await rec.stop();
          if (mediaRec) await new Promise((r) => { mediaRec.onstop = r; mediaRec.stop(); });
          stream.getTracks().forEach((t) => t.stop());
          preview.srcObject = null;
          const media = vchunks.length ? new Blob(vchunks, { type: vchunks[0].type || 'video/webm' }) : out.wav;
          body.innerHTML = '<p class="es-muted">Transcribing…</p>';
          let transcript = '';
          try { transcript = out.heard ? await ES.recorder.transcribe(out.wav) : ''; } catch { transcript = ''; }
          resolve({ ...out, media, isVideo: !!vchunks.length, transcript });
        };
        start.onclick = stop;
      });
    });
  }
  ES.recordPanel = recordPanel;

  function playback(media, isVideo) {
    const url = URL.createObjectURL(media);
    return isVideo ? h('video', { class: 'es-cam', src: url, controls: true, playsinline: true }) : h('audio', { src: url, controls: true, class: 'es-audioplayer' });
  }

  // ── grade project ───────────────────────────────────────────────────
  engines.project = async (level, root) => {
    await ES.flow.intro(root, {
      title: level.title, kicker: 'Grade project · one revision allowed', char: 'axo',
      body: esc(level.csv.whatHappens),
      bullets: ['Part 1: record your 30-second introduction', 'Get a rubric score and feedback, then one revision', `Part 2: order breakfast from ${esc(level.exchange.partnerName)} (AI partner)`],
      start: 'Start part 1',
    });
    const frame = ui.frame(root, { onQuit: quit });
    const attempts = [];
    for (let i = 0; i < 2; i++) {
      frame.progress(i ? 0.4 : 0.1);
      const rec = await recordPanel(frame, level.record);
      const rubric = await ES.api.post('/api/es/recording/score', { levelId: level.id, transcript: rec.transcript, durationMs: rec.durationMs, pauseMs: rec.pauseMs }).catch(() => null);
      attempts.push({ rec, rubric });
      const body = h('div', { class: 'es-ex' });
      body.append(ui.header(i ? 'Revision scored' : 'Your recording'), playback(rec.media, rec.isVideo),
        h('div', { class: 'es-said' }, `<div class="es-said__label">Transcript</div><div class="es-said__text" lang="es">${esc(rec.transcript || '…')}</div>`),
        h('div', {}, ui.rubric(rubric)));
      frame.setBody(body);
      const again = await new Promise((resolve) => {
        if (i === 0) {
          const rev = h('button', { class: 'es-btn es-btn--ghost' }, 'Revise (1 left)');
          rev.addEventListener('click', () => resolve(true));
          frame.footer.continueOnly({ label: 'Keep it and continue', onClick: () => resolve(false), left: rev });
        } else frame.footer.continueOnly({ label: 'Continue to part 2', onClick: () => resolve(false) });
      });
      if (!again) break;
    }
    const best = attempts.reduce((a, b) => ((b.rubric && b.rubric.overall) > (a.rubric && a.rubric.overall) ? b : a));
    await ui.interstitial(frame, { char: level.exchange.partner, text: '¡Hola, cariño! Vamos al café.', label: 'Start part 2' });
    const convo = await ES.conversation(root, level, { part: 'exchange' });
    const p1 = best.rubric ? best.rubric.overall : 0; const p2 = convo.rubric ? convo.rubric.overall : 0;
    const total = Math.round(p1 * 0.6 + p2 * 0.4);
    await ui.complete(root, { title: 'Project submitted!', xp: 30, accuracy: total, accuracyLabel: 'Score' });
    ES.flow.back(root, { level, title: `Project score ${total}/100`, html: `<details class="es-details" open><summary>Part 1 · introduction (${p1}/100, 60%)</summary>${ui.rubric(best.rubric)}</details><details class="es-details"><summary>Part 2 · ordering exchange (${p2}/100, 40%)</summary>${ui.rubric(convo.rubric)}</details>` });
  };

  // ── live conversation ───────────────────────────────────────────────
  engines.live_conversation = async (level, root) => {
    root.innerHTML = '';
    const choice = await new Promise((resolve) => {
      const page = h('div', { class: 'es-endscreen es-intro' }, `<div class="es-label es-muted">Live Conversation · 15 minutes · not a gate</div><h1 class="es-h2">${esc(level.title)}</h1><p>Talk with a real person about this block's topics:</p><ul class="es-intro__list">${level.topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><h2 class="es-h3">Who are you talking with?</h2>`);
      const opts = [
        ['tutor', 'A tutor', 'Your own tutor, in person or online.'],
        ['exchange', 'A language-exchange partner', 'Swap: half in Spanish, half in English.'],
        ['peer', 'In-app peer match', 'Matching connects you with another learner at your level. (Not available in the test lab.)'],
        ['ai_standin', 'AI stand-in', 'Practice with Mara instead. Flagged: it does not count as real-person practice.'],
      ];
      const grid = h('div', { class: 'es-stack' });
      opts.forEach(([v, t, d]) => {
        const b = h('button', { class: 'es-choice', disabled: v === 'peer' }, `<span class="es-choice__text es-left"><b>${esc(t)}</b><br><span class="es-muted es-small">${esc(d)}</span></span>`);
        b.addEventListener('click', () => resolve(v));
        grid.append(b);
      });
      page.append(grid);
      const wrap = h('div', { class: 'es-lesson' }); wrap.append(h('div'), page, h('footer', { class: 'es-footer' })); root.append(wrap);
    });
    if (choice === 'ai_standin') {
      const convo = await ES.conversation(root, level, { part: 'standIn', flagged: true });
      await ui.complete(root, { title: 'Practice complete', xp: 10, accuracy: convo.rubric ? convo.rubric.overall : null, accuracyLabel: 'Score', char: 'mara' });
      ES.flow.back(root, { level, title: 'AI stand-in (flagged)', html: `<p class="es-flag">${icon('flag')} Logged as AI practice. It does not count as a real-person session.</p>${ui.rubric(convo.rubric)}` });
      return;
    }
    const frame = ui.frame(root, { onQuit: quit });
    frame.progress(0.2);
    // Upload a file from the session, or record an excerpt here.
    const body = h('div', { class: 'es-ex' });
    body.append(ui.header('Add a 2-minute excerpt'), h('p', {}, 'Have your conversation first. Then upload a recording of about two minutes (mp3, m4a, wav or ogg), or record an excerpt here.'));
    const file = h('input', { type: 'file', accept: 'audio/*', class: 'es-file', 'aria-label': 'Choose a recording' });
    const recBtn = h('button', { class: 'es-btn es-btn--secondary' }, `${icon('mic')} Record an excerpt here`);
    const status = h('p', { class: 'es-muted', 'aria-live': 'polite' });
    body.append(h('div', { class: 'es-upload' }), recBtn, status);
    body.querySelector('.es-upload').append(file);
    frame.setBody(body);
    frame.footer.hide();
    const evidence = await new Promise((resolve) => {
      file.addEventListener('change', async () => {
        const f = file.files[0]; if (!f) return;
        if (f.size > 24 * 1024 * 1024) { status.textContent = 'That file is over 24 MB. Trim it to about two minutes.'; return; }
        const ext = (f.name.split('.').pop() || 'bin').toLowerCase();
        status.textContent = 'Uploading and transcribing…';
        const dur = await new Promise((r) => { const a = new Audio(URL.createObjectURL(f)); a.onloadedmetadata = () => r(Math.round(a.duration * 1000) || 0); a.onerror = () => r(0); });
        const up = await ES.api.raw(`/api/es/upload?ext=${encodeURIComponent(ext)}`, f, f.type || 'application/octet-stream').catch((err) => ({ note: err.message }));
        resolve({ transcript: up.transcript || '', note: up.note, durationMs: dur, pauseMs: 0, media: f, isVideo: false });
      });
      recBtn.addEventListener('click', async () => resolve(await recordPanel(frame, level.record)));
    });
    frame.progress(0.7);
    const rubric = await ES.api.post('/api/es/recording/score', { levelId: level.id, transcript: evidence.transcript, durationMs: evidence.durationMs, pauseMs: evidence.pauseMs }).catch(() => null);
    const result = h('div', { class: 'es-ex' });
    result.append(ui.header('Your excerpt'), playback(evidence.media, evidence.isVideo),
      h('div', { class: 'es-said' }, `<div class="es-said__label">Transcript</div><div class="es-said__text" lang="es">${esc(evidence.transcript || evidence.note || '…')}</div>`),
      h('div', {}, ui.rubric(rubric)));
    frame.setBody(result);
    await new Promise((resolve) => frame.footer.continueOnly({ label: 'Finish', onClick: resolve }));
    await ui.complete(root, { title: 'Real-person practice logged!', xp: 20, accuracy: rubric ? rubric.overall : null, accuracyLabel: 'Score' });
    ES.flow.back(root, { level, title: 'Live conversation', html: `<p>${icon('check')} Counts as real-person practice (${esc(choice === 'tutor' ? 'tutor' : 'exchange partner')}). Its errors go into your error log.</p>` });
  };

  // ── real-world mission ──────────────────────────────────────────────
  engines.mission = async (level, root) => {
    root.innerHTML = '';
    const frame = ui.frame(root, { onQuit: quit });
    frame.progress(0.1);
    const brief = h('div', { class: 'es-ex' });
    brief.append(ui.header('Your mission'), h('p', {}, 'Do one of these in Spanish, with a real person, outside the app:'));
    const opts = h('div', { class: 'es-stack', role: 'radiogroup' });
    let picked = -1;
    level.options.forEach((o, i) => {
      const b = h('button', { class: 'es-choice', role: 'radio', 'aria-checked': 'false' }, `<span class="es-choice__key">${i + 1}</span><span class="es-choice__text es-left">${esc(o)}</span>`);
      b.addEventListener('click', () => { picked = i; ES.$$('.es-choice', opts).forEach((x, j) => x.setAttribute('aria-checked', String(j === i))); frame.footer.ready(true); });
      opts.append(b);
    });
    brief.append(opts);
    frame.setBody(brief);
    await new Promise((resolve) => frame.footer.idle({ checkLabel: "I've done it", canCheck: false, onCheck: resolve }));
    // evidence
    frame.progress(0.45);
    const ev = h('div', { class: 'es-ex' });
    ev.append(ui.header('Add your evidence'), h('p', { class: 'es-muted' }, 'Upload a recording, or write a short log of what happened (what you said, what they said, what was hard).'));
    const file = h('input', { type: 'file', accept: 'audio/*,video/*', class: 'es-file', 'aria-label': 'Upload a recording' });
    const log = ES.textBox({ lang: 'en', placeholder: 'My log: I went to… I said… They answered…', onChange: () => frame.footer.ready(!!(file.files[0] || log.text().trim().length > 10)) });
    file.addEventListener('change', () => frame.footer.ready(true));
    ev.append(h('div', { class: 'es-upload' }), h('div', { class: 'es-label es-muted' }, 'or write a log'), log);
    ev.querySelector('.es-upload').append(file);
    frame.setBody(ev);
    let upload = null;
    await new Promise((resolve) => frame.footer.idle({
      checkLabel: 'Continue', canCheck: false,
      onCheck: async () => {
        const f = file.files[0];
        if (f) { frame.footer.busy(true); const ext = (f.name.split('.').pop() || 'bin').toLowerCase(); upload = await ES.api.raw(`/api/es/upload?ext=${encodeURIComponent(ext)}`, f, f.type || 'application/octet-stream').catch(() => null); }
        resolve();
      },
    }));
    // can-do self-assessment
    frame.progress(0.8);
    const sa = h('div', { class: 'es-ex' });
    sa.append(ui.header('How did it go? Rate yourself'));
    const answers = level.canDo.map((c, i) => {
      const row = h('div', { class: 'es-cando' }, `<p>${esc(c)}</p>`);
      const seg = h('div', { class: 'es-seg', role: 'radiogroup', 'aria-label': c });
      ['Not yet', 'With help', 'Yes!'].forEach((lab, v) => {
        const b = h('button', { class: 'es-seg__b', role: 'radio', 'aria-checked': 'false', 'data-v': String(v) }, esc(lab));
        b.addEventListener('click', () => { ES.$$('.es-seg__b', seg).forEach((x) => x.setAttribute('aria-checked', String(x === b))); row.dataset.v = String(v); frame.footer.ready(ES.$$('.es-cando', sa).every((r) => r.dataset.v !== undefined)); });
        seg.append(b);
      });
      row.append(seg); sa.append(row);
      return row;
    });
    frame.setBody(sa);
    await new Promise((resolve) => frame.footer.idle({ checkLabel: 'Submit', canCheck: false, onCheck: resolve }));
    const score = answers.reduce((n, r) => n + Number(r.dataset.v), 0);
    const max = answers.length * 2;
    sfx.play('chest');
    await ui.complete(root, { title: 'Mission complete!', xp: 40, accuracy: Math.round((score / max) * 100), accuracyLabel: 'Can-do', char: 'axo', extraHtml: `<div class="es-badge">${icon('trophy')}<span>A1 milestone</span></div>` });
    ES.flow.back(root, { level, title: 'Mission logged', html: `<p>Mission: ${esc(level.options[picked] || '')}</p><p>${upload ? `Recording saved${upload.transcript ? ' and transcribed' : ''}.` : 'Log saved.'} Can-do: ${score}/${max}. Anything you marked "Not yet" goes into your next review.</p>` });
  };
})();
