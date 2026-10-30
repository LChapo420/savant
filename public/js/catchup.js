/* "Catch me up to grade N" for math, english and reading (services/catchup-units.js):
 * the target, what the check found missing, progress, and when the next review is due. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const track = App.query('track');
  const grade = App.query('grade');
  const base = `/api/catchup/${encodeURIComponent(track || '')}/${encodeURIComponent(grade || '')}`;
  const page = (html) => { root.innerHTML = `<div class="cu">${html}</div>`; return root.firstChild; };
  const fail = (msg) => page(`<h1>${esc(msg)}</h1><a class="btn btn-primary" href="/dashboard">Back to the dashboard</a>`);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const when = (iso) => {
    if (!iso) return '';
    const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
    if (mins <= 1) return 'now';
    if (mins < 90) return `in ${mins} minutes`;
    if (mins < 36 * 60) return `in ${Math.round(mins / 60)} hours`;
    return `in ${Math.round(mins / 1440)} days`;
  };
  if (!track || !grade) return fail('Pick a subject and a grade to catch up to.');

  function intro(v) {
    const w = page(`<h1>Catch me up to ${esc(v.target.label)}</h1>
      <p class="muted">A short check of the skills just below this grade: up to 3 questions a skill, stopping as soon as it is clear. You then learn only the skills you are missing, each in a short block, with reviews that come back later and a final mixed check.</p>
      <p class="cu__meta">${plural(v.estimate.skills, 'skill')} to check, at most ${v.estimate.max_questions} questions.</p>
      ${v.ready ? '<button class="btn btn-primary btn-lg" id="go">Start the check</button>' : `<p class="notice notice-error">Not ready for this subject yet: ${esc((v.missing || [])[0] || '')}</p>`}`);
    const go = w.querySelector('#go');
    if (go) go.addEventListener('click', async () => { try { render(await App.api.post(`${base}/start`, {})); } catch (e) { fail(e.message); } });
  }

  function question(v, q, kind) {
    if (!q) return summary(v);
    const head = kind === 'check' ? `Skill check · question ${q.index}` : `Final check · ${q.index} of ${q.total}`;
    const w = page(`<p class="cu__meta">${esc(head)} · ${esc(q.skill)}</p>
      <p class="cu__prompt">${esc(q.prompt)}</p>
      <div class="cu__choices" role="group" aria-label="Answers">${q.choices.map((c, i) => `<button class="btn" data-i="${i}">${esc(c)}</button>`).join('')}</div>
      <p class="cu__fb" aria-live="polite"></p>
      <p class="cu__meta">${kind === 'check' ? `${v.counts.known} known · ${v.counts.missing} to learn · ${v.counts.open} still being checked` : 'Mixed questions from the skills you caught up, and a few you already knew. The bar is 75% for each skill.'}</p>`);
    let sent = false;
    w.querySelectorAll('.btn[data-i]').forEach((b) => b.addEventListener('click', async () => {
      if (sent) return; sent = true;
      w.querySelectorAll('.btn[data-i]').forEach((x) => { x.disabled = true; });
      let out;
      try { out = await App.api.post(`${base}/answer`, { key: q.key, qid: q.qid, answer: q.choices[Number(b.dataset.i)] }); } catch (e) { return e.payload && e.payload.view ? render(e.payload.view) : fail(e.message); }
      const fb = w.querySelector('.cu__fb');
      fb.dataset.ok = String(!!out.correct); fb.textContent = out.correct ? 'Right!' : 'Not quite.';
      setTimeout(() => render(out.view), 650);
    }));
  }

  function summary(v) {
    const r = v.route; const done = v.phase === 'done';
    const last = v.rechecks && v.rechecks.length ? v.rechecks[v.rechecks.length - 1] : null;
    const w = page(`<h1 data-headline>${done ? `Caught up to ${esc(v.target.label)}` : v.phase === 'recheck' ? 'Final check' : `Catch-up ${r.k} of ${r.n}`}</h1>
      <p class="muted">${done ? `You passed the final check${last ? ` (${last.score}%)` : ''}. The skills you caught up come back for review.` : `Target: ${esc(v.target.label)}. The check found ${plural(v.counts.missing, 'skill')} to learn${r.minutes_left ? `, about ${r.minutes_left} minutes left` : ''}.`}</p>
      <div class="cu__counts">
        <div class="cu__count"><b>${v.counts.known}</b><span>known</span></div>
        <div class="cu__count"><b>${v.counts.missing}</b><span>found missing</span></div>
        <div class="cu__count"><b>${r.blocks.filter((b) => b.status === 'done').length}/${r.n}</b><span>blocks done</span></div></div>
      ${v.next_review_due_at ? `<p class="cu__meta" data-review>Next review ${esc(when(v.next_review_due_at))}.</p>` : ''}
      ${done ? '' : v.phase === 'recheck' ? '<button class="btn btn-primary btn-lg" id="recheck">Take the final check</button>' : '<button class="btn btn-primary btn-lg" id="play">Continue</button>'}
      <ul class="cu__blocks">${r.blocks.map((b) => `<li class="cu__block" data-status="${esc(b.status)}" data-current="${r.k === b.k && !done}"><span class="cu__meta">Catch-up ${b.k} of ${r.n} · about ${b.minutes} min · ${b.levels_done}/${b.levels} lessons</span><h3>${esc(b.title)}</h3></li>`).join('')}</ul>`);
    const play = w.querySelector('#play');
    if (play) play.addEventListener('click', async () => {
      try { const out = await App.api.post(`${base}/next`, {}); location.href = `/session?enrollment=${out.enrollment_id}&level=${out.level}`; } catch (e) { fail(e.message); }
    });
    const re = w.querySelector('#recheck');
    if (re) re.addEventListener('click', () => question(v, v.recheck && v.recheck.question, 'recheck'));
  }

  function render(v) {
    if (v.phase === 'not_started') return intro(v);
    if (v.phase === 'check') return question(v, v.question, 'check');
    return summary(v);
  }

  try { render(await App.api.get(base)); } catch (e) { fail(e.message || 'Could not load the catch-up.'); }
});
