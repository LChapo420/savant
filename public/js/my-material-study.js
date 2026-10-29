/* Study a course built from your own material: the path (units and levels), the one recommended next step, the
 * starting check one question at a time, lessons with practice, checks (75% masters a skill) and reviews.
 * The server holds the answers and decides the path; this page shows what it sends and sends answers back. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const id = new URLSearchParams(window.location.search).get('id');
  const base = `/api/materials/${encodeURIComponent(id)}/study`;
  const STATUS = { new: 'Not started', learning: 'Learning', mastered: 'Mastered' };
  const TIER = { 1: 'recall', 2: 'use', 3: 'stretch' };
  const GENERAL = '<span class="tiny muted">(general knowledge: your file names this topic but does not explain it)</span>';

  const fail = (err) => { root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div><p><a href="/my-material">Back to my material</a></p>`; };

  function nextCard(s) {
    const n = s.next || {};
    const label = {
      placement: ['Find your starting point', 'A few questions, one at a time, so you skip what you already know.', 'Start the starting check'],
      review: [`${s.due_count} to review`, 'Due now, so you keep what you learned.', 'Start review'],
      lesson: [n.remediation ? `Fix: ${n.title || ''}` : `Next: ${n.title || ''}`, n.remediation ? 'Go over what tripped you up, then try the check again.' : 'Read the lesson and try a few questions.', n.remediation ? 'Go over it again' : 'Start the lesson'],
      quiz: [`Check: ${n.title || ''}`, 'Score 75% or more to master it.', 'Take the check'],
      done: ['Every skill mastered', s.next_due ? `Next review: ${String(s.next_due).slice(0, 10)}.` : 'Nice work.', ''],
      wait: ['Nothing open right now', 'Come back when a review is due.', ''],
    }[n.kind] || ['', '', ''];
    return `<div class="card" id="next-card"><h2>${esc(label[0])}</h2><p class="small">${esc(label[1])}</p>${label[2] ? `<button class="btn btn-primary" id="go" type="button">${esc(label[2])}</button>` : ''}</div>`;
  }

  async function map() {
    let s;
    try { s = await App.api.get(base); } catch (err) { return fail(err); }
    const byId = new Map(s.skills.map((k) => [k.id, k]));
    const units = s.units.map((u) => `
      <div class="card" style="margin-top:18px"><h2>${esc(u.title)}</h2>
        <ul style="list-style:none;padding:0;margin:0">${u.skills.map((sid) => byId.get(sid)).filter(Boolean).map((k) => `
          <li style="padding:8px 0" data-row="${esc(k.id)}"><div class="row-between row-wrap">
            <span><span class="tiny muted">Level ${k.level}</span> <strong>${esc(k.title)}</strong>
              <span class="tiny muted">${STATUS[k.status]}${k.via === 'placement' ? ' (known from the starting check)' : ''}${k.is_due ? ' · due for review' : ''}${k.remediate ? ' · to go over again' : ''}${k.status !== 'new' ? ` · tier ${k.tier} of 3 (${TIER[k.tier]})` : ''}</span>
              ${k.source === 'general' ? `<br>${GENERAL}` : ''}
              ${k.summary ? `<br><span class="tiny muted">${esc(k.summary)}</span>` : ''}</span>
            ${k.open ? `<button class="btn btn-sm" type="button" data-skill="${esc(k.id)}">${k.status === 'mastered' ? 'Revisit' : 'Study'}</button>` : '<span class="tiny muted">Locked: master the earlier levels</span>'}
          </div></li>`).join('')}</ul></div>`).join('');
    root.innerHTML = `
      <p class="small"><a href="/my-material">&larr; My material</a></p>
      <h1>${esc(s.course.title)}</h1>
      <p class="muted">${s.mastered} of ${s.total} skills mastered. Your path skips what you know and comes back to things just before you would forget them.</p>
      ${nextCard(s)}${units}`;
    root.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => lesson(b.dataset.skill)));
    const go = document.getElementById('go');
    if (go) {
      go.addEventListener('click', () => {
        const n = s.next;
        if (n.kind === 'placement') return placement();
        if (n.kind === 'review') return quiz('review');
        if (n.kind === 'lesson') return lesson(n.skill);
        if (n.kind === 'quiz') return quiz('mastery', n.skill);
        return null;
      });
    }
    return null;
  }

  function qHtml(q, i, name) {
    const body = q.type === 'multiple_choice'
      ? q.choices.map((c, n) => `<label class="field" style="display:block"><input type="radio" name="${name}${i}" value="${n}"> ${esc(c)}</label>`).join('')
      : `<input type="text" name="${name}${i}" maxlength="200" autocomplete="off" aria-label="Your answer">`;
    return `<div class="card" style="margin-top:12px" data-q="${esc(q.id)}"><p><strong>${i + 1}.</strong> ${esc(q.prompt)}</p>${q.source === 'general' ? `<p>${GENERAL}</p>` : ''}${body}<div class="small" data-fb></div></div>`;
  }
  const readAnswer = (card, q, i, name) => {
    if (q.type === 'multiple_choice') { const c = card.querySelector(`input[name="${name}${i}"]:checked`); return c ? Number(c.value) : null; }
    return card.querySelector(`input[name="${name}${i}"]`).value;
  };

  async function placement(prev) {
    let out = prev;
    if (!out) { try { out = await App.api.get(`${base}/placement`); } catch (err) { return App.toast(err.message, 'error'); } }
    if (out.done) {
      const list = (xs) => xs.map((x) => `<li>${esc(x.title)}</li>`).join('');
      root.innerHTML = `<h1>Your starting point</h1><p class="muted">${out.asked} questions.</p>
        ${out.known.length ? `<div class="card"><h2>You already know (${out.known.length})</h2><ul>${list(out.known)}</ul><p class="small">Skipped. They come back for a short review before you would forget them.</p></div>` : ''}
        ${out.unsure.length ? `<div class="card" style="margin-top:12px"><h2>Partly known (${out.unsure.length})</h2><ul>${list(out.unsure)}</ul><p class="small">You start these a step up, with less practice.</p></div>` : ''}
        ${out.to_learn.length ? `<div class="card" style="margin-top:12px"><h2>To learn (${out.to_learn.length})</h2><ul>${list(out.to_learn)}</ul></div>` : ''}
        <p style="margin-top:18px"><button class="btn btn-primary" id="done" type="button">See your path</button></p>`;
      document.getElementById('done').addEventListener('click', map);
      return null;
    }
    const q = out.question;
    root.innerHTML = `<h1>Starting check</h1><p class="small muted">Question ${out.asked + 1}. No feedback here: this only decides where you start. If you do not know, say so.</p>
      ${qHtml(q, 0, 'pl')}
      <p style="margin-top:12px"><button class="btn btn-primary" id="next" type="button">Next</button> <button class="btn" id="idk" type="button">I don't know</button></p>`;
    const send = async (answer) => {
      try { placement(await App.api.post(`${base}/placement`, { question: q.id, answer })); } catch (err) { App.toast(err.message, 'error'); }
    };
    document.getElementById('next').addEventListener('click', () => {
      const a = readAnswer(root.querySelector(`[data-q="${q.id}"]`), q, 0, 'pl');
      if (a === null || a === '') return App.toast('Pick an answer, or press "I don\'t know".', 'error');
      return send(a);
    });
    document.getElementById('idk').addEventListener('click', () => send(null));
    return null;
  }

  async function lesson(skillId) {
    let out;
    try { out = await App.api.get(`${base}/lesson/${encodeURIComponent(skillId)}`); } catch (err) { return App.toast(err.message, 'error'); }
    const s = out.skill;
    const fix = s.remediation && s.remediation.misconceptions.length
      ? `<div class="notice" style="margin-bottom:12px"><strong>Watch for this:</strong><ul>${s.remediation.misconceptions.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : '';
    root.innerHTML = `
      <p class="small"><a href="#" id="back">&larr; Your path</a></p>
      <h1>${esc(s.title)}</h1>
      ${s.source === 'general' ? `<p>${GENERAL}</p>` : ''}
      ${fix}
      <div class="card">${s.lesson.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
        ${s.lesson.key_points && s.lesson.key_points.length ? `<h2>Key points</h2><ul>${s.lesson.key_points.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}</div>
      <h2 style="margin-top:18px">Practice</h2><p class="small muted">Answer one at a time. This does not count toward mastery.</p>
      ${s.practice.map((q, i) => qHtml(q, i, 'p')).join('')}
      <div class="card" style="margin-top:18px"><h2>Ready?</h2><p class="small">The check has about 5 questions at tier ${s.tier} of 3, with no feedback until the end. 75% masters the skill.</p><button class="btn btn-primary" id="mastery" type="button">Take the check</button></div>`;
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
          card.querySelector('[data-fb]').innerHTML = `<strong>${fb.correct ? 'Correct.' : `Not quite. The answer: ${esc(fb.answer)}.`}</strong>${fb.misconception ? ` <span>That choice usually comes from this mix-up: ${esc(fb.misconception)}.</span>` : ''} ${esc(fb.explanation)}<br><em>${fb.source === 'general' ? 'Where your file names it' : 'From your material'}: &ldquo;${esc(fb.quote)}&rdquo;</em>`;
        } catch (err) { App.toast(err.message, 'error'); }
      });
    });
    return null;
  }

  async function quiz(mode, skillId) {
    let q;
    try { q = await App.api.post(`${base}/quiz`, { mode, skill: skillId }); } catch (err) { return App.toast(err.message, 'error'); }
    const title = { mastery: 'Skill check', review: 'Review' }[mode];
    root.innerHTML = `<h1>${title}</h1><p class="small muted">${mode === 'mastery' ? `Tier ${q.tier} of 3. 75% masters the skill; one question may come from an earlier skill. ` : 'Mixed from the skills that are due. '}No feedback until you finish.</p>
      ${q.questions.map((x, i) => qHtml(x, i, 'q')).join('')}
      <p style="margin-top:12px"><button class="btn btn-primary" id="submit" type="button">Finish</button></p>`;
    document.getElementById('submit').addEventListener('click', async () => {
      const answers = {};
      q.questions.forEach((x, i) => { const a = readAnswer(root.querySelector(`[data-q="${x.id}"]`), x, i, 'q'); if (a !== null && a !== '') answers[x.id] = a; });
      try { result(await App.api.post(`${base}/submit`, { quiz_id: q.quiz_id, answers })); } catch (err) { App.toast(err.message, 'error'); }
    });
    return null;
  }

  function result(r) {
    const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
  const verdict = (k) => {
      if (r.mode === 'review') return k.passed ? ` · back in ${days(k.next_in_days)}` : (k.shaky ? ' · back tomorrow' : ' · to go over again');
      return k.passed ? ` · mastered, next review in ${days(k.next_in_days)}` : ' · not yet: go over it again';
    };
    const lines = r.report.map((k) => `<li><strong>${esc(k.title)}</strong>: ${k.right} of ${k.total}${verdict(k)}</li>`).join('');
    const rem = (r.remediation || []).map((x) => `<div class="card" style="margin-top:12px"><p><strong>${esc(x.prompt)}</strong></p><p class="small">${x.your_answer ? `You said: ${esc(x.your_answer)}. ` : ''}The answer: ${esc(x.correct_answer)}.</p>${x.misconception ? `<p class="small">The mix-up behind your answer: ${esc(x.misconception)}.</p>` : ''}<p class="small">${esc(x.explanation)}</p><p class="small"><em>${x.source === 'general' ? 'Where your file names it' : 'From your material'}: &ldquo;${esc(x.from_your_material)}&rdquo;</em></p></div>`).join('');
    root.innerHTML = `<h1>${r.overall.right} of ${r.overall.total}</h1><ul>${lines}</ul>${rem ? `<h2>What to look at again</h2>${rem}` : ''}<p style="margin-top:18px"><button class="btn btn-primary" id="done" type="button">Back to your path</button></p>`;
    document.getElementById('done').addEventListener('click', map);
  }

  if (!id) return fail(new Error('No material chosen.'));
  return map();
});
