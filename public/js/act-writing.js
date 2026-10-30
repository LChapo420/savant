/* ACT Writing practice: one prompt, a countdown, a box to write in, and the mark by domain.
 *
 * The clock never blocks writing: when it reaches zero it says so and the learner can still hand in. Drafts are
 * saved to the server a few seconds after typing stops. The mark comes from the same route as every essay and is
 * an estimate by Savant, not an ACT score. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;

  let essay;
  try { ({ essay } = await App.api.post('/api/essays/act-writing', {})); } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }

  const rubric = essay.criteria.map((c) => `<li><strong>${esc(c.name)}</strong></li>`).join('');
  root.innerHTML = `<h1>ACT Writing practice</h1>
    <div class="card"><p>${esc(essay.prompt)}</p><p class="muted">${esc(essay.guidance)}</p>
      <p class="tiny muted">Marked on: </p><ul class="tiny">${rubric}</ul></div>
    <div class="row-between" style="margin:12px 0"><span id="clock" class="tiny" aria-live="off">${essay.minutes}:00</span><span id="count" class="tiny muted"></span></div>
    <textarea id="box" rows="14" style="width:100%;font:inherit" aria-label="Your essay"></textarea>
    <p><button class="btn btn-primary" id="submit" type="button">Hand in for marking</button> <span id="status" class="tiny muted"></span></p>
    <div id="result"></div>`;
  const box = document.getElementById('box');
  const status = document.getElementById('status');
  // The server keeps the essay as paragraphs of escaped text; the box holds plain text.
  const toHtml = (text) => text.split(/\n+/).filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join('');
  const toText = (html) => { const d = document.createElement('div'); d.innerHTML = html.replace(/<\/p>/gi, '\n'); return d.textContent.trim(); };
  box.value = essay.draft ? toText(essay.draft) : '';

  const count = () => { document.getElementById('count').textContent = `${(box.value.match(/\S+/g) || []).length} words`; };
  count();

  // The countdown starts at the first keystroke, so reading the prompt is not on the clock.
  let end = null;
  let timer = null;
  function tick() {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    document.getElementById('clock').textContent = left > 0
      ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      : 'Time is up. You can still hand in.';
    if (left <= 0) clearInterval(timer);
  }

  let saveTimer = null;
  box.addEventListener('input', () => {
    count();
    if (!end) { end = Date.now() + essay.minutes * 60000; timer = setInterval(tick, 1000); tick(); }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      App.api.post(`/api/essays/${essay.id}/draft`, { text: toHtml(box.value) }).then(() => { status.textContent = 'Draft saved.'; })
        .catch(() => { status.textContent = 'Not saved yet. Your words are still here.'; });
    }, 3000);
  });

  function show(result) {
    const rep = result.essay && result.essay.domain_report;
    if (!rep || rep.estimate === null) {
      document.getElementById('result').innerHTML = `<div class="notice">${esc(result.focus || 'This could not be marked right now. Try again later.')}</div>`;
      return;
    }
    const rows = rep.domains.map((d) => `<li style="padding:6px 0"><strong>${esc(d.name)}: ${d.score === null ? 'not marked' : `${d.score} of ${rep.scale.split(' to ')[1]}`}</strong>${d.evidence ? `<br><span class="tiny">${esc(d.evidence)}</span>` : ''}${d.next_step ? `<br><span class="tiny muted">Next: ${esc(d.next_step)}</span>` : ''}</li>`).join('');
    document.getElementById('result').innerHTML = `<div class="card"><h2>Your marks</h2>
      <p>Estimate ${rep.estimate} on the ${esc(rep.scale)} scale.</p><ul style="list-style:none;padding:0;margin:0">${rows}</ul>
      <p class="tiny muted">${esc(rep.note)}</p>
      <p><button class="btn" id="again" type="button">Write another</button></p></div>`;
    document.getElementById('again').addEventListener('click', () => window.location.reload());
  }

  document.getElementById('submit').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    status.textContent = 'Marking…';
    try {
      show(await App.api.post(`/api/essays/${essay.id}/submit`, { text: toHtml(box.value) }));
      status.textContent = '';
    } catch (err) {
      status.textContent = err.message;
      ev.target.disabled = false;
    }
  });
});
