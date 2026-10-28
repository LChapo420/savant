/* Graduation held (staged round 3; COVERAGE_GATE=enforce).
 *
 * The learner passed the Final, and the app's own record still has objectives
 * of the grade it has not seen proven and then kept a day later. This page
 * says which, and what each one needs next: its lesson again, its lesson for
 * the first time, or one memory check once a day has passed. When the record
 * is complete the learner graduates from here, through the same gate.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const host = document.getElementById('held');
  const enrollmentId = Number(App.query('enrollment'));
  const esc = App.escapeHtml;
  if (!enrollmentId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }
  const pathHref = `/path?enrollment=${enrollmentId}`;

  let data;
  try {
    data = await App.api.get(`/api/coverage/${enrollmentId}/held`);
  } catch (err) {
    host.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }

  const when = (iso) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? `later today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : d.toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  };
  const lessonHref = (o) => `/session?enrollment=${enrollmentId}&level=${o.lesson_level}`;

  function head(title, sub) {
    const [gradeMain] = App.gradeParts((data.grade && data.grade.name) || '');
    return `
      <div class="path-top" data-subject="${esc(data.track ? data.track.id : '')}">
        <div>
          <a class="back-link" href="${pathHref}">${window.icon('arrow-left')}Your path</a>
          <div class="track-heading">
            ${data.track ? App.symbol(data.track, { size: 'lg' }) : ''}
            <div>
              <h1>${esc(title)}</h1>
              <span class="tiny">${data.track ? `${esc(data.track.name)}, ${esc(gradeMain)}.` : ''}${sub ? ` ${sub}` : ''}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  function section(id, title, note, rows, action) {
    if (!rows.length) return '';
    return `
      <section class="gate-section" aria-labelledby="${id}">
        <h2 class="section-title" id="${id}">${esc(title)} <span class="num gate-count">${rows.length}</span></h2>
        <p class="small muted gate-note">${note}</p>
        <ol class="gate-list">
          ${rows.map((o) => `
            <li class="gate-row">
              <span>
                <span class="gate-title">${esc(App.cleanTitle(o.title))}</span>
                <span class="gate-why">${esc(o.covers)}</span>
              </span>
              ${action(o)}
            </li>`).join('')}
        </ol>
      </section>`;
  }

  function graduatedView() {
    host.innerHTML = `
      ${head('You graduated')}
      <div class="gate-now">
        <p class="path-done-line">${window.mark('tick')}Every objective of this grade is proven and kept.</p>
        <div class="path-actions">
          <a class="btn btn-primary" href="/onboarding">Pick the next one</a>
          <a class="btn btn-text" href="${pathHref}">Your path</a>
        </div>
      </div>`;
  }

  function render() {
    if (data.status === 'graduated') { graduatedView(); return; }
    if (!data.held || !data.plan) {
      host.innerHTML = `${head('Graduation')}
        <div class="notice" style="margin-top:20px">Nothing is holding your graduation on this subject.
          <div style="margin-top:10px"><a class="btn btn-sm" href="${pathHref}">Back to your path</a></div></div>`;
      return;
    }
    const p = data.plan;
    const left = p.total - p.kept;
    const relearn = p.objectives.filter((o) => o.needs === 'relearn');
    const learn = p.objectives.filter((o) => o.needs === 'learn');
    const checks = p.objectives.filter((o) => o.needs === 'memory_check');
    const dueNow = checks.filter((o) => o.due_now);
    const exam = data.exam || {};

    const primary = p.complete
      ? '<button class="btn btn-primary btn-lg" type="button" id="graduate">Graduate</button>'
      : dueNow.length && data.review_available
        ? `<a class="btn btn-primary btn-lg" href="/review?enrollment=${enrollmentId}">Do the memory checks now</a>`
        : (relearn[0] || learn[0])
          ? `<a class="btn btn-primary btn-lg" href="${lessonHref(relearn[0] || learn[0])}">Start with ${esc(App.cleanTitle((relearn[0] || learn[0]).title))}</a>`
          : '';
    const nextCheck = checks.filter((o) => !o.due_now).map((o) => o.due_at).sort()[0] || null;

    host.innerHTML = `
      ${head(p.complete ? 'Ready to graduate' : 'You passed the Final')}
      <div class="gate-now">
        <div>
          <p class="gate-lede">${p.complete
    ? 'Your record now shows every objective of this grade proven and kept. Graduate whenever you are ready.'
    : `Graduation waits on <span class="num">${left}</span> of <span class="num">${p.total}</span> objectives. The Final showed what you could do on the day; graduating also needs each objective proven by your own answers and then remembered a day later, so it is still yours next month.`}</p>
          <div class="path-actions">
            ${primary}
            <a class="btn btn-text" href="${pathHref}">Your path</a>
            ${!p.complete && nextCheck && !dueNow.length ? `<span class="small">The next memory check is ready ${esc(when(nextCheck))}.</span>` : ''}
          </div>
        </div>
        <div class="hero-body">
          <div class="tmeters">
            ${App.tmeter({ label: 'Proven and kept', value: p.kept, target: p.total, max: p.total, unit: 'count' })}
          </div>
          ${exam.at ? `<p class="tiny muted" style="margin:8px 0 0">Final passed ${esc(App.timeAgo(exam.at))}. You will not sit it again.</p>` : ''}
        </div>
      </div>
      ${section('relearn-h', 'Learn again', 'Proven once, and slipped since. The lesson again, then its questions.', relearn,
    (o) => `<a class="btn btn-sm" href="${lessonHref(o)}">Open the lesson<span class="visually-hidden">: ${esc(App.cleanTitle(o.title))}</span></a>`)}
      ${section('learn-h', 'Not proven yet', 'Your answers so far do not show this yet. Its lesson and questions are what prove it.', learn,
    (o) => `<a class="btn btn-sm" href="${lessonHref(o)}">Open the lesson<span class="visually-hidden">: ${esc(App.cleanTitle(o.title))}</span></a>`)}
      ${section('check-h', 'Memory checks', 'Proven, and waiting for one more right answer a day or more later. That answer is what counts it as kept.', checks,
    (o) => (o.due_now
      ? (data.review_available
        ? `<span class="gate-when">Ready now; in today's review</span>`
        : `<a class="btn btn-sm" href="${lessonHref(o)}">Check it<span class="visually-hidden">: ${esc(App.cleanTitle(o.title))}</span></a>`)
      : `<span class="gate-when">Ready ${esc(when(o.due_at))}</span>`))}
      <p class="tiny muted gate-foot">Proven means enough right answers of your own, two of them on questions written for that objective. Kept means one more right answer at least a day later. Answers reached with the coach count for less.</p>`;

    const graduate = document.getElementById('graduate');
    if (graduate) {
      graduate.addEventListener('click', async () => {
        graduate.disabled = true;
        graduate.innerHTML = '<span class="spinner"></span>Checking your record';
        try {
          const out = await App.api.post(`/api/coverage/${enrollmentId}/graduate`, {});
          data = out;
          if (out.graduated) { graduatedView(); App.announce('You graduated.'); return; }
          App.toast('Not yet: your record changed. Here is what is left.');
          render();
        } catch (err) {
          App.toast(err.message, 'error');
          graduate.disabled = false;
          graduate.textContent = 'Graduate';
        }
      });
    }
  }

  render();
});
