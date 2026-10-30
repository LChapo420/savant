/* /spanish/catch-up — the Spanish skill catch-up (services/spanish/catch-up.js).
 *
 * One page for all of it: the skill check (multiple choice, one question at a
 * time, right or wrong said at once), the route ("Catch-up k of N", one short block
 * per skill the check found missing, each played in /spanish/learn), the review
 * each finished skill now has in its boxes, and the final mixed check before the
 * recommended grade opens.
 */
(async function () {
  const ES = window.ES;
  const { h, esc } = ES;
  const root = document.getElementById('app');
  const page = (html) => { root.innerHTML = ''; const w = h('main', { class: 'cu' }, html); root.append(w); return w; };
  const top = '<div class="cu__top"><a href="/dashboard">← Dashboard</a><span class="es-muted es-small">Spanish catch-up</span></div>';
  const fail = (msg) => page(`${top}<h1 class="es-h2">${esc(msg)}</h1><div class="cu__actions"><a class="es-btn es-btn--primary" href="/dashboard">Back to the dashboard</a></div>`);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const when = (iso) => {
    if (!iso) return '';
    const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
    if (mins <= 1) return 'now';
    if (mins < 90) return `in ${mins} minutes`;
    if (mins < 36 * 60) return `in ${Math.round(mins / 60)} hours`;
    return `in ${Math.round(mins / 1440)} days`;
  };

  async function load() {
    try { return await ES.api.get('/api/es/catch-up'); } catch (err) {
      if (err.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return null; }
      fail(err.message || 'Could not load the catch-up.');
      return null;
    }
  }

  function render(v) {
    if (!v) return;
    if (!v.available) return fail(v.error || 'There is nothing to catch up on.');
    if (v.phase === 'not_started') return intro(v);
    // A check not begun yet (a migrated learner lands here first): say what it is, then begin.
    if (v.phase === 'check' && !v.question) return intro(v, !!v.migrated_from);
    if (v.phase === 'check') return question(v, v.question, 'check');
    if (v.phase === 'recheck') return question(v, v.recheck && v.recheck.question, 'recheck');
    return route(v);
  }

  function intro(v, migrated = false) {
    const grades = v.grades.map((g) => `<li>${esc(g.label)}: ${plural(g.skills, 'skill')}</li>`).join('');
    const w = page(`${top}
      <h1 class="es-h2">${migrated ? 'Your catch-up now checks each skill' : 'Catch up before ' + esc(v.recommended.label.split(':')[0])}</h1>
      ${migrated && v.migrated_from ? `<p class="cu__lead" data-migrated>Your earlier catch-up gave you whole grades (about ${Math.round((v.migrated_from.total_minutes || 0) / 60)} hours). This check looks at each skill of each grade instead, so you only learn the ones you are missing. Everything you have done is kept.</p>` : ''}
      <p class="cu__lead">A short check of each skill below ${esc(v.recommended.label.split(':')[0])}: up to 3 questions a skill, stopping as soon as it is clear. Then you get a short block for each skill you are missing, played like the rest of your Spanish, and a final mixed check.</p>
      <ul>${grades}</ul>
      <div class="cu__actions"><button class="es-btn es-btn--primary" id="go">${migrated ? 'Start the skill check' : 'Start the check'}</button></div>`);
    w.querySelector('#go').addEventListener('click', async () => {
      try { render(await ES.api.post('/api/es/catch-up/start', {})); } catch (err) { fail(err.message); }
    });
  }

  function question(v, q, kind) {
    if (!q) return route(v);
    const head = kind === 'check' ? `Skill check · question ${q.index}` : `Final check · ${q.index} of ${q.total}`;
    const progress = Math.round(((q.index - 1) / Math.max(1, q.total)) * 100);
    const w = page(`${top}
      <div class="es-progress es-progress--accent" aria-hidden="true"><div class="es-progress__fill" style="width:${progress}%"></div></div>
      <div class="cu__q" data-kind="${kind}">
        <p class="cu__meta">${esc(head)}${kind === 'check' ? ` of at most ${q.total}` : ''} · ${esc(q.grade.split(':')[0])}, ${esc(q.unit)}</p>
        <p class="cu__prompt">${esc(q.prompt)}</p>
        <div class="cu__choices" role="group" aria-label="Answers">${q.choices.map((c, i) => `<button class="es-choice" data-i="${i}"><span class="es-choice__key">${i + 1}</span><span class="es-choice__text">${esc(c)}</span></button>`).join('')}</div>
        <p class="cu__feedback" aria-live="polite"></p>
      </div>
      ${kind === 'check' ? `<p class="cu__note">${v.counts.known + v.counts.worked} known · ${v.counts.learn} to learn · ${v.counts.open} still being checked</p>` : `<p class="cu__note">Mixed questions from every skill you caught up, and a few you already knew. The bar is 75% for each skill.</p>`}`);
    let sent = false;
    const choose = async (i) => {
      if (sent) return;
      sent = true;
      const btns = [...w.querySelectorAll('.es-choice')];
      btns.forEach((b) => { b.disabled = true; });
      let out;
      try { out = await ES.api.post('/api/es/catch-up/answer', { key: q.key, qid: q.qid, answer: q.choices[i] }); } catch (err) {
        if (err.payload && err.payload.view) return render(err.payload.view);
        return fail(err.message);
      }
      // Right or wrong, said at once (retrieval with feedback); the right option is not revealed in the check.
      btns[i].dataset.result = out.correct ? 'correct' : 'wrong';
      const fb = w.querySelector('.cu__feedback');
      fb.dataset.ok = String(!!out.correct);
      fb.textContent = out.correct ? 'Right!' : 'Not quite.';
      try { ES.sfx && ES.sfx[out.correct ? 'correct' : 'wrong'] && ES.sfx[out.correct ? 'correct' : 'wrong'](); } catch { /* sound off */ }
      await ES.wait(650);
      render(out.view);
    };
    w.querySelectorAll('.es-choice').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.i))));
    const onKey = (e) => { const n = Number(e.key); if (n >= 1 && n <= q.choices.length) { document.removeEventListener('keydown', onKey); choose(n - 1); } };
    document.addEventListener('keydown', onKey);
  }

  function gradeChips(v) {
    const by = new Map();
    for (const s of v.skills) { if (!by.has(s.grade_id)) by.set(s.grade_id, []); by.get(s.grade_id).push(s); }
    return v.grades.map((g) => `<div class="cu__grade"><b>${esc(g.label.split(':')[0])}</b>${(by.get(g.grade_id) || []).map((s) => `<span class="cu__dot" data-s="${esc(s.status)}" title="${esc(`${s.unit}: ${s.title} (${s.status})`)}">${esc(s.unit.replace('Unit ', ''))}</span>`).join('')}</div>`).join('');
  }

  function route(v) {
    const r = v.route;
    const done = v.phase === 'done';
    const last = v.rechecks && v.rechecks.length ? v.rechecks[v.rechecks.length - 1] : null;
    const sentBack = !done && last && !last.passed ? last.failed : [];
    const headline = done ? `Caught up. ${esc(v.next.label)}.`
      : v.phase === 'recheck' ? `${r.n ? `All ${r.n} blocks done. ` : ''}Final check`
      : r.n ?`Catch-up ${r.k} of ${r.n}` : 'Nothing to catch up';
    const blocks = r.blocks.map((b) => {
      const cur = r.current && r.current.key === b.key;
      const review = b.review ? `<p class="cu__review" data-review>In review: ${b.review.in_review} of ${b.review.phrases} words${b.review.due_now ? `, ${b.review.due_now} due now` : ''}${b.review.next_due_at ? `, next ${when(b.review.next_due_at)}` : ''}.</p>` : '';
      return `<li class="cu__block" data-status="${esc(b.status)}" data-current="${cur}" data-key="${esc(b.key)}">
        <span class="cu__meta">Catch-up ${b.k} of ${r.n} · ${esc(b.grade.split(':')[0])} · ${esc(b.unit)} · about ${b.minutes} min${b.reopened ? ' · sent back by the final check' : ''}</span>
        <h3>${esc(b.title)}</h3>
        <p class="cu__note">${esc(b.goal)}</p>
        <ol class="cu__steps">${b.levels.map((l) => `<li data-done="${l.done}">${esc(l.slot)}: ${esc(l.title)} (${l.minutes} min)</li>`).join('')}</ol>
        ${b.status === 'done' ? `<p class="cu__review">Done.</p>${review}` : ''}
      </li>`;
    }).join('');
    const counts = `<div class="cu__counts">
      <div class="cu__count"><b>${v.counts.known + v.counts.worked}</b><span>skills known</span></div>
      <div class="cu__count"><b>${r.n}</b><span>to catch up</span></div>
      <div class="cu__count"><b>${r.minutes_left}</b><span>minutes left</span></div></div>`;
    const action = done ? `<a class="es-btn es-btn--primary" href="${esc(v.next.url)}" id="main">${esc(v.next.label)}</a>`
      : v.phase === 'recheck' ? '<button class="es-btn es-btn--primary" id="recheck">Take the final check</button>'
        : r.current ? `<button class="es-btn es-btn--primary" id="play">${r.blocks.some((b) => b.levels.some((l) => l.done)) ? 'Continue' : 'Start'} catch-up ${r.k} of ${r.n}</button>` : '';
    const w = page(`${top}
      <h1 class="es-h2" data-headline>${headline}</h1>
      <p class="cu__lead">${done ? `You passed the final check${last ? ` (${last.score}%)` : ''}. Every skill you caught up keeps coming back for review.`
        : `${r.n ? `${plural(r.n, 'short block')}, about ${r.total_minutes} minutes in all` : ''}${r.old_minutes ? ` (your old catch-up was about ${r.old_minutes} minutes)` : ''}. Then a short mixed check, and ${esc(v.recommended.label.split(':')[0])} opens.`}</p>
      ${sentBack.length ? `<p class="cu__note" data-sent-back>The final check sent you back to: ${sentBack.map((f) => esc(`${f.unit}: ${f.title}`)).join(', ')}.</p>` : ''}
      ${counts}
      <div class="cu__actions">${action}</div>
      <ul class="cu__blocks">${blocks}</ul>
      <section class="cu__grades" aria-label="What the check found">${gradeChips(v)}</section>`);
    const play = w.querySelector('#play');
    if (play) play.addEventListener('click', async () => {
      try { const out = await ES.api.post('/api/es/catch-up/next', {}); location.href = out.url; } catch (err) { fail(err.message); }
    });
    const re = w.querySelector('#recheck');
    if (re) re.addEventListener('click', () => question(v, v.recheck && v.recheck.question, 'recheck'));
    return undefined;
  }

  const v = await load();
  // The final check is a step the learner takes on purpose: the route shows it first.
  if (v && v.phase === 'recheck' && v.recheck && v.recheck.answered === 0) return route(v);
  render(v);
  return undefined;
}());
