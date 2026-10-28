/* Finding your grade: one walk up a whole subject.
 *
 * Seven questions at a time, grade by grade, until the questions stop being
 * answerable — and then what percentage of each grade to sit at.
 *
 * Quiet, like the per-grade placement: no right/wrong while it runs, and no
 * difficulty shown per question. The seventh question of every grade is the one
 * that separates having met a grade from having finished it, and labelling it as
 * such would tell a learner to stop trying on exactly the question that is worth
 * the most.
 *
 * The first learner to open a subject waits while the model writes it. Everyone
 * after that gets it instantly, so the wait is worth explaining rather than
 * hiding.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'subjects');

  const host = document.getElementById('player');
  const trackId = String(App.query('track') || '');
  let state = { questions: [], index: 0, answers: [], grade: null, walked: 0, gradeCount: 0 };

  function fail(message, backTo) {
    host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(message)}
      <a href="${backTo || '/onboarding'}">Back to subjects</a>.</div>`;
  }

  function shell(head) {
    host.innerHTML = `
      <div class="row-between" style="margin-bottom:14px">
        <div>
          <h1 style="margin-bottom:2px">${App.escapeHtml(head.title)}</h1>
          <div class="small muted">${head.sub}</div>
        </div>
        <span class="chip chip-accent" id="counter">${head.counter || ''}</span>
      </div>
      <div class="player-bar">
        <div class="meter meter-lg"><span id="bar" style="width:${head.share || 0}%"></span></div>
        <span class="small muted" id="pct">${head.shareLabel || ''}</span>
      </div>
      <div class="card" id="item"></div>
      <div class="row" style="margin-top:12px">
        <span class="small muted">Answer as well as you can. Nobody sees this but you, and a wrong answer costs you nothing.</span>
        <span class="tiny muted" id="saved"></span>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="prevq">Previous question</button>
        <button class="btn btn-ghost btn-sm" id="skipq">Skip this question</button>
        <button class="btn btn-ghost btn-sm" id="quitq">Quit and see recommendation</button>
      </div>`;
    document.getElementById('skipq').addEventListener('click', () => submit(''));
    document.getElementById('prevq').addEventListener('click', () => goBack());
    document.getElementById('quitq').addEventListener('click', () => quitQuiz());
  }

  /** A question's index in its grade: on an adaptive walk the screen shows only part of one. */
  function indexOf(position) {
    const q = state.questions[position];
    return q && Number.isInteger(q.index) ? q.index : position;
  }

  /** Minutes left on the mode's clock, or null on the full walk. */
  function minutesLeft() {
    if (!state.deadline) return null;
    return Math.max(0, Math.ceil((Date.parse(state.deadline) - Date.now()) / 60000));
  }

  function progress() {
    // The count comes from the grade rather than from a constant: a grade is
    // meant to have seven, and the page should not break if one ever has six.
    const total = state.questions.length;
    const within = state.index;
    const counter = document.getElementById('counter');
    if (counter) counter.textContent = `${within + 1} of ${total}`;
    const bar = document.getElementById('bar');
    if (bar) bar.style.width = `${(within / total) * 100}%`;
    const pct = document.getElementById('pct');
    if (pct) {
      const left = minutesLeft();
      pct.textContent = state.mode && state.mode !== 'full'
        ? `Question ${state.askedBefore + within + 1}${left != null ? ` · ${left} min left at most` : ''}`
        : `${state.grade.names} · question ${within + 1} of ${total}`;
    }
  }

  function show() {
    if (state.index >= state.questions.length) return finishGrade();
    const question = state.questions[state.index];
    progress();
    // Hidden at the first question of the grade rather than dimmed: there is
    // nothing behind it to go to. Going back a whole *grade* is deliberately not
    // possible — those answers were scored when the grade was handed in and the
    // walk has moved on — so the button ends exactly where the grade does.
    const prev = document.getElementById('prevq');
    if (prev) prev.style.display = state.index > 0 ? '' : 'none';
    Player.render(document.getElementById('item'), question, {
      onSubmit: (answer) => submit(answer),
      // Coming back to a question shows the answer already given, ready to keep
      // or change.
      savedAnswer: state.answers[state.index],
      // No coach on a placement: it would talk a learner into answers they do not
      // have, and the point is to find the ceiling, not to get past it.
      coach: false,
    });
  }

  /** One question back, inside the grade being taken. */
  function goBack() {
    if (state.index <= 0) return;
    state.index--;
    show();
  }

  function beginGrade(grade, draft) {
    state.grade = {
      id: grade.grade_id,
      name: grade.grade_name,
      number: grade.grade_number,
      names: `${grade.grade_name} — grade ${grade.grade_number} of ${grade.grade_count}`,
    };
    state.questions = grade.questions;
    state.answers = [];
    state.index = 0;
    // A grade interrupted part-way comes back exactly as it was left: the answers
    // saved while it was being taken are restored, and the page opens on the
    // first question still without one.
    const saved = draft && draft.grade_id === grade.grade_id ? draft.answers || {} : {};
    Object.keys(saved).forEach((key) => {
      const at = state.questions.findIndex((q, i) => (Number.isInteger(q.index) ? q.index : i) === Number(key));
      if (at >= 0) state.answers[at] = saved[key];
    });
    while (state.index < state.questions.length && state.answers[state.index] != null) state.index++;
    state.walked = (grade.grade_number || 1) - 1;
    state.gradeCount = grade.grade_count || 0;
    if (grade.mode) state.mode = grade.mode;
    if (grade.deadline_at !== undefined) state.deadline = grade.deadline_at;
    state.askedBefore = grade.asked_so_far || 0;
    const total = state.questions.length;
    const adaptive = state.mode && state.mode !== 'full';
    shell({
      title: 'Find your grade',
      sub: adaptive
        ? `${App.escapeHtml(state.trackName || '')} · ${App.escapeHtml(MODE_NAMES[state.mode] || '')} · each set of questions is picked from your answers so far`
        : `${App.escapeHtml(state.trackName || '')} · starts at the first grade and climbs until the questions stop being answerable`,
      counter: `1 of ${total}`,
      share: 0,
      shareLabel: `${state.grade.name} · question 1 of ${total}`,
    });
    show();
  }

  async function submit(answer) {
    state.answers[state.index] = answer == null ? '' : answer;
    save(state.index, state.answers[state.index]);
    state.index++;
    if (state.index >= state.questions.length) return finishGrade();
    show();
  }

  /**
   * Keep the answer the moment it is given.
   *
   * Not awaited: the question has already moved on and a slow connection should
   * not hold the quiz up. It is not the only copy either — every answer is sent
   * again when the grade is handed in — so a save that fails loses nothing.
   */
  function save(index, answer) {
    const note = document.getElementById('saved');
    if (note) note.textContent = 'Saving…';
    App.api.post(`/api/subject-placement/${trackId}/answer`, {
      grade_id: state.grade.id,
      index: indexOf(index),
      answer,
    }).then(() => {
      const n = document.getElementById('saved');
      if (n) n.textContent = 'Saved';
    }).catch(() => {
      const n = document.getElementById('saved');
      if (n) n.textContent = '';
    });
  }

  async function finishGrade() {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Reading that grade</div>';
    let outcome;
    try {
      outcome = await App.api.post(`/api/subject-placement/${trackId}/grade`, {
        grade_id: state.grade.id,
        // Built from the questions rather than sent as the array itself: an
        // answer skipped in the middle leaves a hole, and a hole in a sparse
        // array arrives as null rather than as the empty answer it was.
        answers: state.questions.map((q, i) => ({
          index: indexOf(i),
          answer: state.answers[i] == null ? '' : state.answers[i],
        })),
      });
    } catch (err) {
      return fail(err.message);
    }

    if (outcome.skip) return offerSkip(outcome);
    if (outcome.stopped) return finish();
    // An adaptive walk has no grade-by-grade climb to report between screens: the
    // next set of questions follows straight on.
    if (outcome.mode && outcome.mode !== 'full') {
      return beginGrade({
        grade_id: outcome.next_grade_id,
        grade_name: outcome.next_grade_name,
        grade_number: outcome.next_grade_number,
        grade_count: outcome.grade_count,
        questions: outcome.questions,
        mode: outcome.mode,
        deadline_at: outcome.deadline_at,
        asked_so_far: outcome.asked_so_far,
      });
    }

    state.walked = outcome.grades_walked;
    state.gradeCount = outcome.grade_count;
    return carryOn(outcome);
  }

  /** Between grades: what happened, and whether to keep going. */
  function carryOn(outcome) {
    const left = outcome.grade_count - outcome.grades_walked;
    host.innerHTML = `
      <div class="card" style="text-align:center">
        <span class="chip">${outcome.grades_walked} of ${outcome.grade_count} grades done</span>
        <h1 style="margin:12px 0 4px">${App.escapeHtml(outcome.grade_name)}</h1>
        <p class="muted">You answered ${outcome.correct} of ${outcome.asked} there.</p>
        <p class="small muted">Next up: <strong>${App.escapeHtml(outcome.next_grade_name || 'the end')}</strong>.
          ${left ? `${left} grades left in this subject if the questions keep being answerable.` : ''}</p>
        <button class="btn btn-primary btn-lg" id="go">Continue</button>
        <p class="tiny muted" style="margin-top:10px">Stop whenever you like — the recommendation uses what you have answered so far.</p>
        <button class="btn btn-ghost btn-sm" id="stop">Stop here and see my recommendation</button>
      </div>`;
    document.getElementById('go').addEventListener('click', () => {
      beginGrade({
        grade_id: outcome.next_grade_id,
        grade_name: outcome.next_grade_name,
        grade_number: outcome.next_grade_number,
        grade_count: outcome.grade_count,
        questions: outcome.questions,
      });
    });
    document.getElementById('stop').addEventListener('click', () => finish());
  }

  /**
   * The skip offer. Said plainly, including the cost: the four grades stepped
   * over are four grades of evidence the recommendation will not have, and the
   * point of saying so is that the learner gets to choose which they would
   * rather spend — time or certainty.
   */
  function offerSkip(outcome) {
    const count = outcome.skip.count;
    host.innerHTML = `
      <div class="card" style="text-align:center">
        <span class="chip chip-success">${outcome.grades_walked} in a row, all correct</span>
        <h1 style="margin:12px 0 4px">You have this well past where you started</h1>
        <p class="muted">You have answered every question of the last four grades correctly.
          The next ${count} grades are very likely to be more of the same.</p>
        <div class="notice" style="text-align:left">
          Skipping makes the recommendation slightly less accurate: those ${count} grades are
          ${count} grades of evidence it will not have, so where you land will be a little
          less certain. Answering them takes about ${count * 3} more minutes.
        </div>
        <div class="row-wrap" style="justify-content:center">
          <button class="btn" id="skipon">Skip the next ${count}</button>
          <button class="btn btn-primary" id="skipoff">No, keep going</button>
        </div>
      </div>`;
    document.getElementById('skipon').addEventListener('click', async () => {
      host.innerHTML = '<div class="loading"><span class="spinner"></span>Moving on</div>';
      let next;
      try {
        next = await App.api.post(`/api/subject-placement/${trackId}/skip`, { count });
      } catch (err) {
        return fail(err.message);
      }
      if (!next.questions.length) return finish();
      return beginGrade({
        grade_id: next.next_grade_id,
        grade_name: next.next_grade_name,
        grade_number: next.next_grade_number,
        grade_count: next.grade_count,
        questions: next.questions,
      });
    });
    document.getElementById('skipoff').addEventListener('click', () => carryOn(outcome));
  }

  async function finish() {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Working out where you belong — this takes a few seconds</div>';
    let result;
    try {
      result = await App.api.post(`/api/subject-placement/${trackId}/finish`, {});
    } catch (err) {
      return fail(err.message);
    }
    renderResult(result);
  }

  async function quitQuiz() {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Saving your result</div>';
    try {
      const result = await App.api.post(`/api/subject-placement/${trackId}/quit`, {
        grade_id: state.grade && state.grade.id,
        answers: state.questions.map((q, i) => ({
          index: indexOf(i),
          answer: state.answers[i] == null ? '' : state.answers[i],
        })),
      });
      renderResult(result);
    } catch (err) {
      fail(err.message);
    }
  }

  function renderResult(result) {
    const byId = new Map((result.grades || []).map((g) => [g.grade_id, g]));
    const rows = (result.percent || []).map((p) => {
      const grade = byId.get(p.grade_id) || {};
      const isPick = p.grade_id === result.recommended_grade_id;
      return `
        <div class="row-between grade-percent${isPick ? ' picked' : ''}" data-grade="${App.escapeHtml(p.grade_id)}">
          <span>
            <span class="name">${App.escapeHtml(grade.name || p.grade_id)}</span>
            ${isPick ? '<span class="chip chip-accent" style="margin-left:6px">start here</span>' : ''}
            ${p.why ? `<span class="tiny muted" style="display:block">${App.escapeHtml(p.why)}</span>` : ''}
          </span>
          <span class="pct-cell">
            <span class="meter" style="width:90px;display:inline-block;vertical-align:middle"><span style="width:${p.percent}%"></span></span>
            <strong style="margin-left:8px">${p.percent}%</strong>
          </span>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div class="card" style="text-align:center">
        <span class="chip chip-accent">${App.escapeHtml(state.trackName || '')} · ${result.grades.length} grades</span>
        <h1 style="margin:12px 0 4px">Start at ${App.escapeHtml(result.recommended_grade_name)}</h1>
        <p class="muted">${App.escapeHtml(result.headline || '')}</p>
        <button class="btn btn-primary btn-lg" id="pick">Choose ${App.escapeHtml(result.recommended_grade_name)}</button>
        <p class="tiny muted" style="margin-top:10px">Or pick any grade yourself — the percentages below are a suggestion, not a lock.</p>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-title">${window.icon('target')}Every grade, and how strongly it fits you</div>
        <p class="small muted">A high number means <em>start here</em>. A low number on a grade you aced is not a bad result —
          it means you already have it and should not spend your time there.</p>
        <div class="grade-percents">${rows}</div>
      </div>

      <div class="row-wrap" style="margin-top:16px">
        <a class="btn btn-ghost" href="/subject-placement?track=${encodeURIComponent(trackId)}&again=1">Take it again</a>
        <a class="btn btn-ghost" href="/onboarding">Pick a different grade</a>
        <a class="btn btn-ghost" href="/dashboard">Back to dashboard</a>
      </div>`;

    document.getElementById('pick').addEventListener('click', () => {
      window.location.href = `/onboarding?track=${encodeURIComponent(trackId)}&grade=${encodeURIComponent(result.recommended_grade_id)}`;
    });
  }

  const MODE_NAMES = { quick: 'Quick', balanced: 'Balanced', accurate: 'Accurate' };

  /**
   * Before anything is asked: how long to spend, and where to start looking.
   * All of it is optional. A learner who knows where they are can skip the quiz
   * and pick a grade, and one who has a rough idea can say so and the search
   * starts there instead of a third of the way into the subject.
   */
  function chooseMode(opening) {
    return new Promise((resolve) => {
      const modes = opening.modes || {};
      const card = (key, title, blurb) => `
        <button class="card mode-card" data-mode="${key}" style="text-align:left;cursor:pointer;width:100%">
          <div class="row-between"><strong>${title}</strong>
            <span class="chip">${modes[key] ? `up to ${modes[key].total_minutes || modes[key].minutes} min` : ''}</span></div>
          <div class="small muted" style="margin-top:4px">${blurb}</div>
        </button>`;
      const options = (opening.grades || []).map((g) => `<option value="${App.escapeHtml(g.grade_id)}">${App.escapeHtml(g.name)}</option>`).join('');
      host.innerHTML = `
        <div class="card" style="text-align:center">
          <span class="chip chip-accent">${App.escapeHtml(opening.track_name || '')}</span>
          <h1 style="margin:12px 0 4px">Find your grade</h1>
          <p class="muted">Optional. Pick how long to spend: the longer modes ask more, and land closer.</p>
        </div>
        <div style="display:grid;gap:10px;margin-top:12px">
          ${card('quick', 'Quick', 'A short check that lands within about a grade.')}
          ${card('balanced', 'Balanced', 'More questions near where you are, so it lands closer.')}
          ${card('accurate', 'Accurate', 'The most questions, for the closest placement.')}
        </div>
        <div class="card" style="margin-top:12px">
          <label class="small" for="hint">Have a rough idea where you are? The search starts there. (Optional)</label>
          <select id="hint" style="width:100%;margin-top:6px"><option value="">Not sure</option>${options}</select>
        </div>
        <p class="small muted" style="margin-top:12px">Already know where you belong?
          <a href="/onboarding?track=${encodeURIComponent(trackId)}">Skip the quiz and pick a grade</a>.</p>`;
      host.querySelectorAll('.mode-card').forEach((button) => button.addEventListener('click', () => {
        resolve({ mode: button.dataset.mode, start_grade_id: document.getElementById('hint').value || null });
      }));
    });
  }

  /** The first learner to open a subject waits for it to be written. */
  async function waitForQuestions() {
    for (;;) {
      const now = await App.api.get(`/api/subject-placement/${trackId}`);
      if (now.ready) return true;
      if (!now.writing && !now.available) return false;
      host.innerHTML = `
        <div class="card" style="text-align:center">
          <span class="chip chip-accent">${App.escapeHtml(now.track_name || '')}</span>
          <h1 style="margin:12px 0 4px">Writing your questions</h1>
          <p class="muted">Nobody has taken the ${App.escapeHtml(now.track_name || '')} placement before, so all
            ${now.grade_count} grades of questions are being written now.</p>
          <p class="small muted">This takes a few minutes and only ever happens once for the whole subject —
            everyone after you gets it instantly.</p>
          <div class="loading"><span class="spinner"></span>Still writing…</div>
        </div>`;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  if (!trackId) return fail('No subject chosen.');

  const again = String(App.query('again') || '') === '1';
  const opening = await App.api.get(`/api/subject-placement/${trackId}`);
  state.trackName = opening.track_name;
  if (!opening.available) {
    return fail('The placement quiz needs the model, and no provider is configured right now.');
  }

  const running = opening.placement;
  const walked = !!running && (running.scores || []).length > 0;
  const atEnd = !!running && (running.position || 0) >= (running.grade_ids || []).length;
  // A finished walk already has its answer. Showing it again costs nothing;
  // asking the model for the same percentages a second time would.
  if (running && running.recommendation && !again) return finish();
  if (walked && atEnd && !again) return finish();

  if (!opening.ready) {
    await App.api.post(`/api/subject-placement/${trackId}/start`, {});
    if (!(await waitForQuestions())) return fail('The questions could not be written right now.');
  }

  // A walk already under way picks up where it was; a new one asks how to run.
  const resuming = !again && running && !running.finished_at && ((running.scores || []).length || running.draft);
  const choice = resuming ? {} : await chooseMode(opening);
  const started = await App.api.post(`/api/subject-placement/${trackId}/start`, { restart: again || !resuming, ...choice });
  if (!started.questions.length) {
    return fail('The questions for this subject are not ready yet.');
  }
  if (started.grade_number > 1) App.toast('Picking up where you left off.', 'info');
  const draft = started.placement && started.placement.draft;
  if (draft && Object.keys(draft.answers || {}).length) App.toast('Back at the question you left.', 'info');
  beginGrade({
    grade_id: started.grade_id,
    grade_name: started.grade_name,
    grade_number: started.grade_number,
    grade_count: started.grade_count,
    questions: started.questions,
    mode: started.mode,
    deadline_at: started.deadline_at,
    asked_so_far: started.asked_so_far,
  }, draft);
});
