/* The placement quiz runner.
 *
 * Deliberately quiet: no right/wrong feedback while it runs, and no score until
 * the end. The questions climb, so a learner should feel the ceiling arrive
 * rather than be told about it question by question.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const host = document.getElementById('player');
  const enrollmentId = Number(App.query('enrollment'));
  if (!enrollmentId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  const { enrollments } = await App.api.get('/api/enrollments');
  const enrollment = enrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) {
    host.innerHTML = '<div class="notice notice-error">That subject is not on your account. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  const start = await App.api.post('/api/placement/start', { enrollment_id: enrollmentId });
  const items = start.items;
  // A grade with a unit bank is placed adaptively: the questions arrive one at a
  // time, each picked from the answers so far, and the walk says when it is done.
  const adaptive = !!start.adaptive;
  const answered = items.filter((i) => i.answered).length;
  let index = answered < items.length ? answered : 0;
  let startedAt = Date.now();

  function shell() {
    host.innerHTML = `
      <div class="row-between" style="margin-bottom:14px">
        <div>
          <h1 style="margin-bottom:2px">${App.escapeHtml(enrollment.track.name)} placement</h1>
          <div class="small muted">${App.escapeHtml(enrollment.grade.name)} &middot; ${adaptive ? 'each question is picked from your answers so far' : 'questions get harder as you go'} &middot; no feedback until the end</div>
        </div>
        <span class="chip chip-accent" id="counter"></span>
      </div>
      <div class="player-bar">
        <div class="meter meter-lg"><span id="bar" style="width:0%"></span></div>
        <span class="small muted" id="pct">0%</span>
      </div>
      <div class="card" id="item"></div>
      <div class="row" style="margin-top:12px">
        <span class="small muted">Answer as well as you can. A wrong answer above your level costs you nothing.</span>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="skip">Skip this question</button>
      </div>`;
    document.getElementById('skip').addEventListener('click', () => submit(''));
  }

  function progress() {
    const done = index;
    if (adaptive) {
      document.getElementById('counter').textContent = `Question ${done + 1}`;
      document.getElementById('bar').style.width = `${Math.min(100, (done / start.total) * 100)}%`;
      const left = start.deadline_at ? Math.max(0, Math.ceil((Date.parse(start.deadline_at) - Date.now()) / 60000)) : null;
      document.getElementById('pct').textContent = left != null ? `${left} min left at most` : '';
      return;
    }
    document.getElementById('counter').textContent = `${Math.min(done + 1, items.length)} of ${items.length}`;
    const share = done / items.length;
    document.getElementById('bar').style.width = `${share * 100}%`;
    document.getElementById('pct').textContent = App.pct(share);
  }

  async function submit(answer) {
    const item = items[index];
    let reply;
    try {
      reply = await App.api.post('/api/placement/answer', {
        session_id: start.session_id,
        item_id: item.id,
        answer,
        ms: Date.now() - startedAt,
      });
    } catch (err) {
      App.toast(err.message, 'error');
      return;
    }
    index++;
    if (adaptive && reply && reply.next_item) items.push(reply.next_item);
    if (index >= items.length) return finish();
    startedAt = Date.now();
    progress();
    show();
  }

  function show() {
    const item = items[index];
    // The placement by unit shows no difficulty chip (its questions are pitched by
    // unit, not on the 1-10 scale) and no coach, for the reason the subject
    // placement gives: a coach would talk a learner into answers they do not have.
    Player.render(document.getElementById('item'), item, adaptive
      ? { onSubmit: (answer) => submit(answer), coach: false }
      : { label: `Question ${index + 1}`, onSubmit: (answer) => submit(answer) });
  }

  async function finish() {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Scoring your quiz</div>';
    let result;
    try {
      ({ result } = await App.api.post('/api/placement/finish', { session_id: start.session_id }));
    } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
      return;
    }
    renderResult(result);
  }

  function renderResult(result) {
    if (result.adaptive) return renderUnitResult(result);
    const bandRows = result.bands
      .filter((b) => b.accuracy !== null)
      .map((b) => `
        <tr>
          <td>difficulty ${b.name}</td>
          <td>${b.correct} of ${b.asked}</td>
          <td style="width:40%"><div class="meter"><span style="width:${b.accuracy * 100}%"></span></div></td>
          <td class="nowrap">${App.pct(b.accuracy)}</td>
        </tr>`).join('');

    host.innerHTML = `
      <div class="card" style="text-align:center">
        <span class="chip chip-accent">${App.escapeHtml(result.track_name)} &middot; ${App.escapeHtml(result.grade_name)}</span>
        <h1 style="margin:12px 0 4px">You start at level ${result.placedLevel}</h1>
        <p class="muted">of ${result.path_length} in this track. You answered ${result.correct} of ${result.asked}
          (${App.pct(result.overall)}), and held up through difficulty ${result.heldDifficulty} of 10.</p>
        <a class="btn btn-primary btn-lg" href="/path?enrollment=${enrollmentId}">Start learning at level ${result.placedLevel}</a>
      </div>

      <div class="grid grid-2" style="margin-top:16px">
        <div class="card">
          <div class="card-title">${window.icon('chart')}How you did by difficulty</div>
          <table class="data"><tbody>${bandRows}</tbody></table>
          <p class="tiny muted" style="margin:10px 0 0">Your level is the top of the hardest band you held at 70%.</p>
        </div>
        <div class="card">
          <div class="card-title">${window.icon('target')}What to work on first</div>
          ${result.gaps.length
            ? `<p class="small muted">These came out under 60%, so your first sessions start here.</p>
               <div class="row-wrap">${result.gaps.map((g) => `<span class="chip chip-warn">${App.escapeHtml(g.name)}</span>`).join('')}</div>`
            : '<p class="small muted">Nothing came out weak enough to single out. Your sessions will keep probing upward.</p>'}
          ${result.strengths.length
            ? `<p class="small muted" style="margin-top:14px">Already solid, so these move to spaced review instead of drilling:</p>
               <div class="row-wrap">${result.strengths.map((g) => `<span class="chip chip-success">${App.escapeHtml(g.name)}</span>`).join('')}</div>`
            : ''}
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-title">${window.icon('brain')}One more optional step</div>
        <p class="small muted">
          The learning-style questionnaire takes about two minutes and changes how your
          sessions are built: their length, the mix of formats, and how much explanation
          you get. You can skip it and go straight in.
        </p>
        <div class="row-wrap">
          <a class="btn" href="/style-quiz?next=${encodeURIComponent(`/path?enrollment=${enrollmentId}`)}">Take the learning-style quiz</a>
          <a class="btn btn-ghost" href="/dashboard">Back to dashboard</a>
        </div>
      </div>`;
  }

  /**
   * The result of a placement by unit, and the quick check of what it skipped.
   * The check is offered straight away rather than left for later: it is a
   * minute or two, and it is what makes the skip safe to take.
   */
  function renderUnitResult(result) {
    const checks = (result.checks || []).length;
    host.innerHTML = `
      <div class="card" style="text-align:center">
        <span class="chip chip-accent">${App.escapeHtml(result.track_name)} &middot; ${App.escapeHtml(result.grade_name)}</span>
        <h1 style="margin:12px 0 4px">You start at unit ${result.unit} of ${result.units}</h1>
        <p class="muted">${result.title ? `${App.escapeHtml(result.title)} &middot; ` : ''}level ${result.placedLevel} of ${result.path_length}.
          ${result.skipped ? `The ${result.skipped} unit${result.skipped === 1 ? '' : 's'} before it ${result.skipped === 1 ? 'is' : 'are'} already yours.` : 'This is the start of the grade.'}</p>
        <div id="check-slot"></div>
        <a class="btn ${checks ? 'btn-ghost' : 'btn-primary btn-lg'}" id="go" href="/path?enrollment=${enrollmentId}">Start learning at level ${result.placedLevel}</a>
      </div>`;
    if (checks) offerCheck(result);
  }

  function offerCheck(result) {
    const slot = document.getElementById('check-slot');
    const count = result.checks.length;
    slot.innerHTML = `
      <div class="notice" style="text-align:left;margin:12px 0">
        <strong>Quick check of what you skipped.</strong> One question from each of the ${count} skipped
        unit${count === 1 ? '' : 's'} you were not already asked about, about ${Math.max(1, Math.round(count / 3))} minute${count > 3 ? 's' : ''}.
        Anything you miss twice moves your start back to it, so nothing you skip is something you need.
      </div>
      <button class="btn btn-primary btn-lg" id="check">Take the quick check</button>`;
    document.getElementById('check').addEventListener('click', () => runCheck());
  }

  async function runCheck() {
    let state;
    try {
      state = await App.api.get(`/api/placement/quick-check/${enrollmentId}`);
    } catch (err) {
      App.toast(err.message, 'error');
      return;
    }
    const total = state.summary.total;
    let n = 0;
    const ask = (question) => {
      if (!question) return checkDone(state.summary);
      n++;
      host.innerHTML = `
        <div class="row-between" style="margin-bottom:14px">
          <h1 style="margin-bottom:2px">Quick check</h1>
          <span class="chip chip-accent">${n}</span>
        </div>
        <div class="card" id="item"></div>
        <p class="small muted" style="margin-top:12px">One question from each unit you skipped. No feedback until the end.</p>`;
      Player.render(document.getElementById('item'), question, {
        coach: false,
        onSubmit: async (answer) => {
          try {
            state = await App.api.post('/api/placement/quick-check', {
              enrollment_id: enrollmentId, unit: question.unit, slot: question.slot, answer,
            });
          } catch (err) {
            App.toast(err.message, 'error');
            return;
          }
          ask(state.question);
        },
      });
    };
    if (!total) return checkDone(state.summary);
    ask(state.question);
  }

  function checkDone(summary) {
    const reopened = summary.reopened || [];
    host.innerHTML = `
      <div class="card" style="text-align:center">
        <h1 style="margin:12px 0 4px">${reopened.length ? 'One more thing to cover first' : 'Confirmed'}</h1>
        <p class="muted">${reopened.length
          ? `Unit${reopened.length === 1 ? '' : 's'} ${reopened.join(', ')} ${reopened.length === 1 ? 'needs' : 'need'} a proper look, so your start has moved back to level ${summary.current_level}.`
          : `All ${summary.passed} skipped unit${summary.passed === 1 ? '' : 's'} checked out. You start where the placement put you.`}</p>
        <a class="btn btn-primary btn-lg" href="/path?enrollment=${enrollmentId}">Start learning at level ${summary.current_level}</a>
      </div>`;
  }


  if (index >= items.length) {
    await finish();
  } else {
    shell();
    progress();
    show();
  }
});
