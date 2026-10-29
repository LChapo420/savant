/* Study a course built from your own material: map, lesson, practice, mastery quiz (75%), review.
 * The server holds the answers; this page only shows what the server sends and sends answers back. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const id = new URLSearchParams(window.location.search).get('id');
  const base = `/api/materials/${encodeURIComponent(id)}/study`;
  const STATUS = { new: 'Not started', learning: 'Learning', mastered: 'Mastered' };

  const fail = (err) => { root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div><p><a href="/my-material">Back to my material</a></p>`; };

  async function map() {
    let s;
    try { s = await App.api.get(base); } catch (err) { return fail(err); }
    const due = s.due_count;
    root.innerHTML = `
      <p class="small"><a href="/my-material">&larr; My material</a></p>
      <h1>${esc(s.course.title)}</h1>
      <p class="muted">${s.mastered} of ${s.total} skills mastered. You master a skill by scoring 75% or more on its check.</p>
      ${due ? `<div class="card"><h2>${due} to review</h2><p class="small">These are due so you do not forget them.</p><button class="btn btn-primary" id="review" type="button">Start review</button></div>` : (s.next_due ? `<p class="small muted">Next review: ${esc(String(s.next_due).slice(0, 10))}.</p>` : '')}
      ${s.placed || s.mastered ? '' : '<div class="card" style="margin-top:18px"><h2>Skip what you know</h2><p class="small">One question per skill. Skills you get right are marked known and come back for review tomorrow.</p><button class="btn" id="place" type="button">Start the quick check</button></div>'}
      <div class="card" style="margin-top:18px"><h2>Skills</h2>
        <ul style="list-style:none;padding:0;margin:0">${s.skills.map((k) => `
          <li style="padding:8px 0"><div class="row-between row-wrap">
            <span><strong>${esc(k.title)}</strong> <span class="tiny muted">${STATUS[k.status]}${k.via === 'placement' ? ' (known from the quick check)' : ''}${k.is_due ? ' · due for review' : ''}</span>
            ${k.summary ? `<br><span class="tiny muted">${esc(k.summary)}</span>` : ''}</span>
            ${k.open ? `<button class="btn btn-sm" type="button" data-skill="${esc(k.id)}">${k.status === 'mastered' ? 'Revisit' : 'Study'}</button>` : '<span class="tiny muted">Locked: master the earlier skills</span>'}
          </div></li>`).join('')}</ul></div>`;
    root.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => lesson(b.dataset.skill)));
    const r = document.getElementById('review'); if (r) r.addEventListener('click', () => quiz('review'));
    const p = document.getElementById('place'); if (p) p.addEventListener('click', () => quiz('placement'));
  }

  function qHtml(q, i, name) {
    const body = q.type === 'multiple_choice'
      ? q.choices.map((c, n) => `<label class="field" style="display:block"><input type="radio" name="${name}${i}" value="${n}"> ${esc(c)}</label>`).join('')
      : `<input type="text" name="${name}${i}" maxlength="200" autocomplete="off">`;
    return `<div class="card" style="margin-top:12px" data-q="${esc(q.id)}"><p><strong>${i + 1}.</strong> ${esc(q.prompt)}</p>${body}<div class="small" data-fb></div></div>`;
  }
  const readAnswer = (card, q, i, name) => {
    if (q.type === 'multiple_choice') { const c = card.querySelector(`input[name="${name}${i}"]:checked`); return c ? Number(c.value) : null; }
    return card.querySelector(`input[name="${name}${i}"]`).value;
  };

  async function lesson(skillId) {
    let out;
    try { out = await App.api.get(`${base}/lesson/${encodeURIComponent(skillId)}`); } catch (err) { return App.toast(err.message, 'error'); }
    const s = out.skill;
    root.innerHTML = `
      <p class="small"><a href="#" id="back">&larr; Skills</a></p>
      <h1>${esc(s.title)}</h1>
      <div class="card">${s.lesson.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
        ${s.lesson.key_points && s.lesson.key_points.length ? `<h2>Key points</h2><ul>${s.lesson.key_points.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}</div>
      <h2 style="margin-top:18px">Practice</h2><p class="small muted">Answer one at a time. This does not count toward mastery.</p>
      ${s.practice.map((q, i) => qHtml(q, i, 'p')).join('')}
      <div class="card" style="margin-top:18px"><h2>Ready?</h2><p class="small">The check has up to 5 questions with no feedback until the end. 75% masters the skill.</p><button class="btn btn-primary" id="mastery" type="button">Take the check</button></div>`;
    document.getElementById('back').addEventListener('click', (e) => { e.preventDefault(); map(); });
    document.getElementById('mastery').addEventListener('click', () => quiz('mastery', skillId));
    s.practice.forEach((q, i) => {
      const card = root.querySelector(`[data-q="${q.id}"]`);
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm'; btn.type = 'button'; btn.textContent = 'Check';
      card.insertBefore(btn, card.querySelector('[data-fb]'));
      btn.addEventListener('click', async () => {
        const answer = readAnswer(card, q, i, 'p');
        if (answer === null || answer === '') return;
        try {
          const fb = await App.api.post(`${base}/practice`, { skill: skillId, question: q.id, answer });
          card.querySelector('[data-fb]').innerHTML = `<strong>${fb.correct ? 'Correct.' : `Not quite. The answer: ${esc(fb.answer)}.`}</strong> ${esc(fb.explanation)}<br><em>From your material: &ldquo;${esc(fb.quote)}&rdquo;</em>`;
        } catch (err) { App.toast(err.message, 'error'); }
      });
    });
  }

  async function quiz(mode, skillId) {
    let q;
    try { q = await App.api.post(`${base}/quiz`, { mode, skill: skillId }); } catch (err) { return App.toast(err.message, 'error'); }
    const title = { placement: 'Quick check', mastery: 'Skill check', review: 'Review' }[mode];
    root.innerHTML = `<h1>${title}</h1><p class="small muted">${mode === 'mastery' ? '75% masters the skill. ' : ''}No feedback until you finish.</p>
      ${q.questions.map((x, i) => qHtml(x, i, 'q')).join('')}
      <p style="margin-top:12px"><button class="btn btn-primary" id="submit" type="button">Finish</button></p>`;
    document.getElementById('submit').addEventListener('click', async () => {
      const answers = {};
      q.questions.forEach((x, i) => { const a = readAnswer(root.querySelector(`[data-q="${x.id}"]`), x, i, 'q'); if (a !== null && a !== '') answers[x.id] = a; });
      try { result(await App.api.post(`${base}/submit`, { quiz_id: q.quiz_id, answers })); } catch (err) { App.toast(err.message, 'error'); }
    });
  }

  function result(r) {
    const lines = r.report.map((k) => `<li><strong>${esc(k.title)}</strong>: ${k.right} of ${k.total}${k.passed === true ? (r.mode === 'review' ? ` · back in ${k.next_in_days} days` : ' · mastered') : (k.passed === false ? (r.mode === 'review' ? ' · back tomorrow' : ' · not yet, study it again') : (k.known ? ' · known' : ' · to learn'))}</li>`).join('');
    const rem = (r.remediation || []).map((x) => `<div class="card" style="margin-top:12px"><p><strong>${esc(x.prompt)}</strong></p><p class="small">${x.your_answer ? `You said: ${esc(x.your_answer)}. ` : ''}The answer: ${esc(x.correct_answer)}.</p><p class="small">${esc(x.explanation)}</p><p class="small"><em>From your material: &ldquo;${esc(x.from_your_material)}&rdquo;</em></p></div>`).join('');
    root.innerHTML = `<h1>${r.overall.right} of ${r.overall.total}</h1><ul>${lines}</ul>${rem ? `<h2>What to look at again</h2>${rem}` : ''}<p style="margin-top:18px"><button class="btn btn-primary" id="done" type="button">Back to the skills</button></p>`;
    document.getElementById('done').addEventListener('click', map);
  }

  if (!id) return fail(new Error('No material chosen.'));
  map();
});
