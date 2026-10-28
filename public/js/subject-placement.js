/* Finding your grade: one walk up a whole subject.
 *
 * Seven questions at a time, grade by grade, until the questions stop being
 * answerable — and then how likely each grade is to be the right place to start,
 * three ways on (the recommended grade with a catch-up check of the grades below
 * it, the recommended grade, or any other grade), the catch-up check itself, and
 * the catch-up plan it makes.
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
    // The player's top bar (focus mode): the way out, the subject, the count
    // and the time. A bar only where the count is known (the full walk).
    host.setAttribute('data-subject', trackId);
    host.innerHTML = `
      <div class="player-head">
        <a class="icon-btn player-close" href="/onboarding" title="Leave; your answers are kept" aria-label="Leave the placement; your answers are kept">${window.icon('x')}</a>
        <div class="player-titles">
          <h1 class="player-title">${App.escapeHtml(head.title)}</h1>
          <div class="player-sub">${head.sub}</div>
        </div>
        <div class="player-chips">
          <span class="chip counter" id="counter">${head.counter || ''}</span>
          <span class="timer" id="pct">${head.shareLabel || ''}</span>
        </div>
        <div class="player-meter"${head.adaptive ? ' hidden' : ''}><div class="meter"><span id="bar" style="width:${head.share || 0}%"></span></div></div>
      </div>
      <div class="card" id="item"></div>
      <div class="row player-foot">
        <button class="btn btn-ghost btn-sm" id="skipq">I don't know</button>
        <span class="small muted">Answer as well as you can. Nobody sees this but you, and a wrong answer costs you nothing.</span>
        <span class="tiny muted" id="saved"></span>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="prevq">Previous question</button>
        <button class="btn btn-ghost btn-sm" id="quitq">Stop and see my grade</button>
        ${user.can_skip ? `<a class="btn btn-ghost btn-sm" href="/curriculum?track=${encodeURIComponent(trackId)}" title="Owner only">Skip: pick any grade and level</a>` : ''}
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
    // An adaptive walk hands the questions over a few (often one) at a time, so
    // "1 of 1" says nothing: the running count is what the learner can follow.
    const adaptive = state.mode && state.mode !== 'full';
    if (counter) counter.textContent = adaptive ? `Question ${state.askedBefore + within + 1}` : `${within + 1} / ${total}`;
    const bar = document.getElementById('bar');
    if (bar) bar.style.width = `${(within / total) * 100}%`;
    const pct = document.getElementById('pct');
    if (pct) {
      const left = minutesLeft();
      pct.textContent = state.mode && state.mode !== 'full'
        ? (left != null ? `${left} min left` : '')
        : '';
      pct.classList.toggle('is-low', left != null && left < 2);
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
      names: `${App.gradeLabel(grade.grade_name)}, grade ${grade.grade_number} of ${grade.grade_count}`,
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
      title: `Find your grade in ${state.trackName || 'this subject'}`,
      sub: adaptive
        ? `${App.escapeHtml(MODE_NAMES[state.mode] || '')}. Each set of questions is picked from your answers so far.`
        : `${App.escapeHtml(state.grade.names)}`,
      counter: `1 / ${total}`,
      share: 0,
      shareLabel: '',
      adaptive,
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
        <p class="tiny muted" style="margin-top:10px">Stop whenever you like. The recommendation uses what you have answered so far.</p>
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
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Working out where you belong. This takes a few seconds</div>';
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

  /** The subject's grades as a scale, with You at the recommended grade. */
  function gradeScale(result) {
    const grades = result.grades || [];
    const at = grades.findIndex((g) => g.grade_id === result.recommended_grade_id);
    if (grades.length < 2 || at < 0) return '';
    return App.scale({
      from: 1, to: grades.length, you: at + 1, subject: trackId, arriving: true,
      youLabel: `grade ${at + 1}`,
      ticks: grades.map((g, i) => ({ at: i + 1, kind: 'plain', label: String(i + 1) })),
      caption: `Grade ${at + 1} of ${grades.length} in ${App.escapeHtml(state.trackName || 'this subject')}.`,
    });
  }

  /* ── the result: a probability for every grade, and three ways on ─────────
   *
   * The recommended grade is the most probable one. The list shows how likely
   * each grade is to be the right place to start (they add up to 100), the
   * learner can start at any of them, or start at the recommended grade with a
   * catch-up check of the grades below it. See curriculum-build/PLACEMENT-CHOICE-SPEC.md.
   */

  let booted = false;

  /** The address says which step this is, so a reload picks up where it was. */
  function setStep(name) {
    try {
      const url = new URL(window.location.href);
      if (name) url.searchParams.set('step', name); else url.searchParams.delete('step');
      window.history.replaceState(null, '', url);
    } catch (err) { /* the page works without it */ }
  }

  /** Where the catch-up stands (quiz, route, offers); null when the server cannot say. */
  async function loadCatchUp() {
    try {
      return await App.api.get(`/api/gap-scan/state/${encodeURIComponent(trackId)}`);
    } catch (err) {
      return null;
    }
  }

  /** "25 min", or "4 hours" once it runs past an hour and a half. */
  function aboutTime(minutes) {
    if (minutes < 90) return `${minutes} min`;
    return `${Math.round(minutes / 30) / 2} hours`;
  }

  const gradeNameOf = (result, gradeId) => {
    const row = (result.grades || []).find((g) => g.grade_id === gradeId);
    return (row && row.name) || String(gradeId || '').replace(/_/g, ' ');
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /**
   * One row per grade for the list: the probability when the server has one,
   * the older percent (and no "likely" wording) when it does not. A row is
   * shown when it has a chance, or sits on or next to the recommended grade.
   */
  function oddsOf(result) {
    const probs = result.probabilities || [];
    const likely = probs.length > 0 && probs.some((p) => p.probability != null);
    const source = likely
      ? probs.map((p) => ({ id: p.grade_id, name: p.name || gradeNameOf(result, p.grade_id), value: Number(p.probability) || 0, why: '' }))
      : (result.percent || []).map((p) => ({ id: p.grade_id, name: gradeNameOf(result, p.grade_id), value: Number(p.percent) || 0, why: p.why || '' }));
    const at = source.findIndex((r) => r.id === result.recommended_grade_id);
    return {
      likely,
      rows: source.map((r, i) => ({ ...r, rec: r.id === result.recommended_grade_id, core: r.value > 0 || (at >= 0 && Math.abs(i - at) <= 1) })),
    };
  }

  function oddsRow(r, likely) {
    const label = App.gradeLabel(r.name);
    return `
      <li class="odds-row${r.rec ? ' is-rec' : ''}" data-grade="${App.escapeHtml(r.id)}"${r.core ? '' : ' hidden'}>
        <label class="odds-label">
          <input class="odds-input" type="radio" name="grade" value="${App.escapeHtml(r.id)}">
          <span class="odds-name">${App.escapeHtml(label)}
            ${r.rec ? '<span class="chip">Recommended</span>' : ''}<span class="chip odds-pick">Your pick</span>
            ${r.why ? `<span class="tiny muted" style="display:block">${App.escapeHtml(r.why)}</span>` : ''}
          </span>
          <span class="odds-bar" aria-hidden="true"><span style="--v:${Math.max(0, Math.min(100, r.value))}%"></span></span>
          <span class="odds-pct num">${r.rec ? `<span class="marked-word">${r.value}%${window.mark('circle')}</span>` : `${r.value}%`}<span class="visually-hidden">${likely ? ' likely' : ' fit'}</span></span>
        </label>
      </li>`;
  }

  async function renderResult(result) {
    state.result = result;
    host.setAttribute('data-subject', trackId);
    // On a reload the address says which step to come back to; after that, never.
    const want = booted ? '' : String(App.query('step') || '');
    booted = true;
    setStep('');
    const known = await loadCatchUp();
    state.known = known;
    const quiz = known && known.catch_up_quiz ? known.catch_up_quiz : null;
    const route = known && known.route ? known.route : null;
    if (want === 'catchup' && quiz && quiz.status === 'running') return startCatchUp(result);
    if (want === 'plan' && route) return showPlan(result, route, known);

    const rec = result.recommended_grade_id;
    const recName = App.gradeLabel(result.recommended_grade_name);
    const recShort = App.gradeParts(result.recommended_grade_name)[0] || recName;
    const odds = oddsOf(result);
    const hasHidden = odds.rows.some((r) => !r.core);
    const below = (result.grades || []).findIndex((g) => g.grade_id === rec);

    // Where the catch-up stands. A plan from the earlier, shorter grade check counts as done.
    let status = !quiz || !quiz.available ? 'none' : quiz.status;
    const openSteps = route && Array.isArray(route.steps) ? route.steps.filter((s) => s.status !== 'done') : [];
    if (status === 'not_started' && route && (openSteps.length || route.status === 'accepted')) status = 'done';
    const minutes = quiz && Number(quiz.minutes) ? Number(quiz.minutes) : 0;

    const lead = status === 'running' ? 'Continue the catch-up check'
      : status === 'done' ? 'See your catch-up plan'
        : `Start at ${recShort} and catch up first`;
    const sub = status === 'not_started'
      ? `A ${minutes ? `${minutes}-minute` : 'short'} check of the grades below ${recShort} finds anything you missed or forgot.`
      : status === 'running' ? 'Pick up where you left off.'
        : status === 'done' ? `What the check found in the grades below ${recShort}, in the order to take it.`
          : '';
    const withCatchUp = status === 'not_started' || status === 'running' || status === 'done';

    const mismatch = odds.likely && result.most_likely_grade_id && result.most_likely_grade_id !== rec;

    host.innerHTML = `
      <div class="result sp-result">
        <p class="lesson-meta">${App.escapeHtml(state.trackName || '')}, ${plural((result.grades || []).length, 'grade')}</p>
        <h1>Start at ${App.escapeHtml(recName)}</h1>
        <p class="lead">${App.escapeHtml(String(result.headline || '').replace(/\s+[—–]\s+/g, ', '))}</p>
        ${gradeScale(result)}

        <section class="odds" aria-labelledby="odds-h">
          <h2 id="odds-h">${odds.likely ? 'How likely each grade is the right place to start' : 'How strongly each grade fits you'}</h2>
          <p class="small muted">${odds.likely ? 'The percentages add up to 100. ' : ''}Select a grade to start there instead. It is a suggestion, not a lock.${
            mismatch ? ' The recommendation also weighs the whole climb, so it may not sit on the tallest bar.' : ''}</p>
          <div role="radiogroup" aria-labelledby="odds-h">
            <ul class="odds-list" id="odds-list">${odds.rows.map((r) => oddsRow(r, odds.likely)).join('')}</ul>
          </div>
          ${hasHidden ? '<button class="btn btn-text" type="button" id="odds-more" aria-expanded="false" aria-controls="odds-list">Show all grades</button>' : ''}
          <div class="odds-pickslot" id="pick-slot" aria-live="polite"></div>
        </section>

        <div class="choose-actions" id="choose-actions">
          ${withCatchUp ? `
            <div class="choose-main">
              <button class="btn btn-primary btn-lg" type="button" id="act-catchup">${App.escapeHtml(lead)}</button>
              ${sub ? `<p class="small muted">${App.escapeHtml(sub)}</p>` : ''}
            </div>
            ${status === 'done' ? '' : `<button class="btn" type="button" id="act-start">Start at ${App.escapeHtml(recShort)}</button>`}`
    : `<button class="btn btn-primary btn-lg" type="button" id="act-start">Start at ${App.escapeHtml(recShort)}</button>`}
          <button class="btn btn-text" type="button" id="act-other">Choose a different grade</button>
          ${status === 'declined' ? `<p class="small muted choose-again">You started without the catch-up. <button class="btn btn-text" type="button" id="act-anyway">Check the grades below anyway</button></p>` : ''}
        </div>

        <div class="row-wrap result-links">
          <a class="btn btn-text" href="/subject-placement?track=${encodeURIComponent(trackId)}&again=1">Take it again</a>
          <a class="btn btn-text" href="/dashboard">Back to dashboard</a>
        </div>
      </div>`;

    wireResult(result, status, below);
  }

  function wireResult(result, status, belowIndex) {
    const rec = result.recommended_grade_id;
    const recShort = App.gradeParts(result.recommended_grade_name)[0] || App.gradeLabel(result.recommended_grade_name);
    let busy = false;
    const lock = (on) => {
      busy = on;
      host.querySelectorAll('#choose-actions button, .odds-input, #pick-start').forEach((b) => { b.disabled = on; });
    };
    /** Do one thing; on a failure say so and give the buttons back. */
    const attempt = async (work) => {
      if (busy) return;
      lock(true);
      try {
        await work();
      } catch (err) {
        App.toast(err.message, 'error');
        lock(false);
      }
    };

    const list = document.getElementById('odds-list');
    const more = document.getElementById('odds-more');
    if (more) {
      more.addEventListener('click', () => {
        const open = more.getAttribute('aria-expanded') !== 'true';
        more.setAttribute('aria-expanded', String(open));
        more.textContent = open ? 'Show fewer grades' : 'Show all grades';
        const core = (oddsOf(result).rows.filter((r) => r.core)).map((r) => r.id);
        list.querySelectorAll('.odds-row').forEach((row) => { row.hidden = open ? false : !core.includes(row.dataset.grade); });
      });
    }

    // A row picked: the "Start at" button appears under the list.
    const slot = document.getElementById('pick-slot');
    list.addEventListener('change', (event) => {
      const input = event.target.closest('.odds-input');
      if (!input) return;
      const id = input.value;
      const name = App.gradeParts(gradeNameOf(result, id))[0] || id;
      if (id === rec) {
        slot.innerHTML = `<p class="small muted">${App.escapeHtml(name)} is the recommended grade. Use the buttons below.</p>`;
        return;
      }
      const idx = (result.grades || []).findIndex((g) => g.grade_id === id);
      slot.innerHTML = `
        <button class="btn" type="button" id="pick-start">Start at ${App.escapeHtml(name)}</button>
        ${idx >= 0 && idx < belowIndex ? '<p class="tiny muted">You can always move up: lessons you already know can be tested out of.</p>' : ''}`;
      document.getElementById('pick-start').addEventListener('click', () => attempt(async () => {
        const reply = await App.api.post(`/api/subject-placement/${encodeURIComponent(trackId)}/choose`, { grade_id: id });
        goTo(reply);
      }));
    });

    const other = document.getElementById('act-other');
    if (other) {
      other.addEventListener('click', () => {
        const first = list.querySelector('.odds-row.is-rec .odds-input') || list.querySelector('.odds-input');
        if (first) { first.scrollIntoView({ block: 'center' }); first.focus(); }
        App.announce('Choose a grade from the list. Use the arrow keys to move between grades.');
      });
    }

    const start = document.getElementById('act-start');
    if (start) {
      start.addEventListener('click', () => attempt(async () => {
        // Starting without the catch-up is remembered, so it is not offered again for this walk.
        if (status === 'not_started') {
          try {
            await App.api.post('/api/gap-scan/catch-up/decline', { track_id: trackId, grade_id: rec });
          } catch (err) { /* choosing the grade still works */ }
        }
        const reply = await App.api.post(`/api/subject-placement/${encodeURIComponent(trackId)}/choose`, { grade_id: rec });
        goTo(reply);
      }));
    }

    const lead = document.getElementById('act-catchup');
    if (lead) {
      lead.addEventListener('click', () => attempt(async () => {
        if (status === 'done') return showPlan(result, (state.known && state.known.route) || null, state.known);
        return startCatchUp(result);
      }));
    }
    const anyway = document.getElementById('act-anyway');
    if (anyway) anyway.addEventListener('click', () => attempt(() => startCatchUp(result)));
  }

  /** Where `choose` says to go next: the in-grade placement, or the path. */
  function goTo(reply) {
    const e = reply.enrollment;
    window.location.href = reply.next === 'placement' ? `/placement?enrollment=${e.id}` : `/path?enrollment=${e.id}`;
  }

  /** The learner's enrollment in the recommended grade (made if they have none), which the catch-up hangs from. */
  async function chooseMain(result) {
    if (state.main) return state.main;
    const reply = await App.api.post(`/api/subject-placement/${encodeURIComponent(trackId)}/choose`, { grade_id: result.recommended_grade_id });
    state.main = reply.enrollment;
    return state.main;
  }

  const mainHref = (e) => (e.status === 'placement_pending' ? `/placement?enrollment=${e.id}` : `/path?enrollment=${e.id}`);

  /* ── the catch-up check ──────────────────────────────────────────────────
   *
   * Starts at the recommended grade (the learner is enrolled in it first), then
   * asks about the units of every grade below it, a round at a time, on its own
   * clock. The question screen is the earlier-grade check's.
   */

  async function startCatchUp(result) {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Picking the questions</div>';
    let reply;
    try {
      await chooseMain(result);
      reply = await App.api.post('/api/gap-scan/start', {
        track_id: trackId,
        catch_up: true,
        recommended_grade_id: result.recommended_grade_id,
      });
    } catch (err) {
      App.toast(err.message, 'error');
      return renderResult(result);
    }
    setStep('catchup');
    const scan = { kind: 'catch_up', deadline: clockOf(reply), asked: 0, total: Number(reply.clock && reply.clock.max_questions) || 0 };
    gapStep(result, scan, reply);
  }

  /** The check's deadline, from whichever form of clock the server sends. */
  function clockOf(reply) {
    const clock = reply.clock || reply;
    if (Number.isFinite(clock.seconds_left)) return new Date(Date.now() + clock.seconds_left * 1000).toISOString();
    if (clock.deadline_at) return clock.deadline_at;
    const minutes = Number(clock.minutes_left != null ? clock.minutes_left : clock.minutes);
    return Number.isFinite(minutes) && minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null;
  }

  let clockTimer = null;

  /** "12 min left", or "under 1 min left" in the last minute. */
  function timeLeftText(seconds) {
    if (seconds <= 0) return 'time is up';
    if (seconds < 60) return 'under 1 min left';
    return `${Math.ceil(seconds / 60)} min left`;
  }

  function gapStep(result, scan, reply) {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (reply.clock || reply.deadline_at) scan.deadline = clockOf(reply) || scan.deadline;
    if (reply.kind === 'catch_up' && !reply.extended) scan.kind = 'catch_up';
    if (reply.done || !reply.question) return gapDone(result, reply);
    const question = reply.question;
    scan.asked = reply.clock && Number.isFinite(reply.clock.asked) ? reply.clock.asked + 1 : scan.asked + 1;
    const catchUp = scan.kind === 'catch_up' && !scan.extended;
    const gradeName = question.grade_name || (question.grade_id ? gradeNameOf(result, question.grade_id) : '');
    const recShort = App.gradeParts(result.recommended_grade_name)[0] || App.gradeLabel(result.recommended_grade_name);
    // "Keep checking" has no clock, only a cap on how many questions it asks.
    const more = !!scan.extended;
    const secondsNow = () => (scan.deadline ? Math.max(0, Math.round((Date.parse(scan.deadline) - Date.now()) / 1000)) : null);
    const totalSeconds = reply.clock && Number(reply.clock.minutes) ? Number(reply.clock.minutes) * 60 : scan.totalSeconds || null;
    if (totalSeconds) scan.totalSeconds = totalSeconds;
    const left = secondsNow();
    const share = left != null && scan.totalSeconds ? Math.max(0, Math.min(100, (left / scan.totalSeconds) * 100)) : null;
    const timeText = more ? (scan.total ? `up to ${scan.total}` : '') : left != null ? timeLeftText(left) : '';
    const leaveHref = `/subject-placement?track=${encodeURIComponent(trackId)}`;
    host.innerHTML = `
      <div class="player-head">
        <a class="icon-btn player-close" href="${leaveHref}" title="Leave; your answers are kept" aria-label="Leave the ${catchUp ? 'catch-up check' : 'check'}; your answers are kept">${window.icon('x')}</a>
        <div class="player-titles">
          <h1 class="player-title${catchUp ? ' is-wrap' : ''}">${more ? `Keep checking ${App.escapeHtml(App.gradeLabel(gradeName || 'an earlier grade'))}` : catchUp ? `Catch-up check: grades below ${App.escapeHtml(recShort)}` : 'Checking earlier grades'}</h1>
          <div class="player-sub">${catchUp
    ? 'Nothing is marked as you go. Answer what you can; &ldquo;I don&rsquo;t know&rdquo; is fine.'
    : `${App.escapeHtml(state.trackName || '')}${gradeName && !more ? `, ${App.escapeHtml(App.gradeLabel(gradeName))}` : ''}. Optional${more ? ', no time limit' : ''}; no feedback until the end.`}</div>
        </div>
        <div class="player-chips">
          <span class="chip counter">Question ${scan.asked}</span>
          <span class="timer clock-note${left != null && left < 120 && !more ? ' is-low' : ''}" id="gap-time">${App.escapeHtml(timeText)}</span>
        </div>
        ${share != null && !more ? `<div class="player-meter"><div class="meter${left < 120 ? ' is-low' : ''}" id="gap-meter"><span id="gap-bar" style="width:${share}%"></span></div></div>` : ''}
      </div>
      ${gradeName ? `<p class="q-grade" id="q-grade"><span class="chip">${App.escapeHtml(App.gradeLabel(gradeName))}</span></p>` : ''}
      <div class="card" id="item"></div>
      <div class="row player-foot">
        <button class="btn btn-ghost btn-sm" id="gapskipq">I don't know</button>
        <span class="small muted">Answer as well as you can. A miss here only means a short catch-up is offered, and "I don't know" counts as a miss.</span>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="gapstop">${catchUp ? 'Stop for now' : 'Stop checking'}</button>
      </div>`;

    // The clock moves between questions too, so the bar and the words follow it.
    if (!more && scan.deadline) {
      clockTimer = setInterval(() => {
        const timeEl = document.getElementById('gap-time');
        if (!timeEl) { clearInterval(clockTimer); clockTimer = null; return; }
        const s = secondsNow();
        timeEl.textContent = timeLeftText(s);
        timeEl.classList.toggle('is-low', s < 120);
        const bar = document.getElementById('gap-bar');
        if (bar && scan.totalSeconds) bar.style.width = `${Math.max(0, Math.min(100, (s / scan.totalSeconds) * 100))}%`;
        const meter = document.getElementById('gap-meter');
        if (meter) meter.classList.toggle('is-low', s < 120);
      }, 15000);
    }

    let busy = false;
    const answer = async (value) => {
      // One answer per question: a double click must not send it twice.
      if (busy) return;
      busy = true;
      let next;
      try {
        next = await App.api.post('/api/gap-scan/answer', {
          track_id: trackId,
          grade_id: question.grade_id,
          unit: question.unit,
          slot: question.slot,
          answer: value == null ? '' : value,
          ...(more ? { extended: true } : {}),
        });
      } catch (err) {
        // A stale answer (a second tab, a double click) comes back with the
        // question actually being asked, so the page redraws on that instead.
        if (err.payload && (err.payload.question || err.payload.done)) return gapStep(result, scan, err.payload);
        App.toast(err.message, 'error');
        busy = false;
        return;
      }
      gapStep(result, scan, next);
    };
    Player.render(document.getElementById('item'), question, { coach: false, onSubmit: (value) => answer(value) });
    document.getElementById('gapskipq').addEventListener('click', () => answer(''));
    document.getElementById('gapstop').addEventListener('click', () => {
      if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
      return more ? backToPlan(result) : renderResult(result);
    });
  }

  /** A check that ran out of questions or time: the plan it made. */
  async function gapDone(result, reply) {
    setStep('plan');
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Making your catch-up plan</div>';
    let route = reply.route || null;
    const known = await loadCatchUp();
    state.known = known;
    if (!route) route = known && known.route ? known.route : null;
    if (!route) return renderResult(result);
    return showPlan(result, route, known);
  }

  /** After stopping a keep-checking walk: the plan as it stands now. */
  async function backToPlan(result) {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>One moment</div>';
    const known = await loadCatchUp();
    state.known = known;
    if (!known || !known.route) return renderResult(result);
    return showPlan(result, known.route, known);
  }

  /**
   * "Keep checking <grade>": the same questions over the units of one earlier
   * grade the check did not settle, with no clock. What it finds goes back into
   * the plan.
   */
  async function runKeepChecking(result, gradeId) {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Picking the questions</div>';
    let reply;
    try {
      reply = await App.api.post('/api/gap-scan/start', { track_id: trackId, extended: true, grade_id: gradeId });
    } catch (err) {
      App.toast(err.message, 'error');
      return backToPlan(result);
    }
    const scan = { extended: true, deadline: null, asked: 0, total: Number(reply.clock && reply.clock.max_questions) || 0 };
    gapStep(result, scan, reply);
  }

  /* ── the catch-up plan ───────────────────────────────────────────────────
   *
   * The route as one ordered list, lowest grade first, ending at the recommended
   * grade. Taking it enrols the learner in each earlier grade with only the gap
   * units to learn; skipping it is remembered and not asked again.
   */

  async function showPlan(result, route0, known0) {
    setStep('plan');
    host.setAttribute('data-subject', trackId);
    let route = route0;
    if (!route) {
      try {
        route = (await App.api.get(`/api/gap-scan/route/${encodeURIComponent(trackId)}`)).route;
      } catch (err) { route = null; }
    }
    if (!route) return renderResult(result);
    const known = known0 || await loadCatchUp();
    state.known = known;
    const keepable = new Set((known && known.can_keep_checking) || []);
    const mainName = App.gradeLabel(route.grade_name || result.recommended_grade_name);
    const mainShort = App.gradeParts(route.grade_name || result.recommended_grade_name)[0] || mainName;
    const steps = route.steps || [];
    const nameOf = (id) => App.gradeLabel(gradeNameOf(result, id));

    // Whether the main grade still has its own placement to take first.
    let pending = !(known && known.enrollment_id);
    if (known && known.enrollment_id) {
      try {
        const { enrollments } = await App.api.get('/api/enrollments');
        const e = enrollments.find((x) => x.id === known.enrollment_id);
        pending = !!e && e.status === 'placement_pending';
      } catch (err) { pending = false; }
    }

    const empty = route.status === 'none';
    const skipped = (route.declined || []).map(nameOf);
    const heading = empty ? `You're ready for ${mainName}`
      : route.status === 'declined' ? `Start ${mainName}`
        : App.noDash(route.headline);

    const stepHtml = steps.map((s, i) => {
      const done = s.status === 'done';
      const titles = s.titles || [];
      const nums = Array.isArray(s.units) && s.units.length === titles.length ? s.units : [];
      const meta = [plural(s.unit_count, 'unit'), s.minutes ? `about ${aboutTime(s.minutes)}` : ''].filter(Boolean).join(', ');
      return `
        <li class="route-step${done ? ' is-done' : ''}" data-grade="${App.escapeHtml(s.grade_id)}">
          <span class="route-rail" aria-hidden="true">${done ? window.mark('tick', 'mark-plain') : `<span class="num">${i + 1}</span>`}</span>
          <div class="route-body">
            <h2>${App.escapeHtml(App.gradeLabel(s.grade_name))}${done ? ' <span class="chip">Done</span>' : s.status === 'accepted' ? ' <span class="chip">Started</span>' : ''}</h2>
            <p class="route-meta"><span class="num">${s.unit_count}</span> ${s.unit_count === 1 ? 'unit' : 'units'}${s.minutes ? `, about <span class="num">${App.escapeHtml(aboutTime(s.minutes))}</span>` : ''}<span class="visually-hidden">. ${App.escapeHtml(meta)}</span></p>
            ${titles.length ? `<ul class="mark-list route-titles">${titles.map((t, k) => `<li><span class="marked-word">${nums[k] ? `<span class="num route-unit">${nums[k]}</span> ` : ''}${App.escapeHtml(t)}${window.mark('underline')}</span></li>`).join('')}</ul>` : ''}
            ${s.unchecked_count > 0 ? `<p class="tiny muted">${plural(s.unchecked_count, 'more unit')} here weren't checked; you can test out of them on that grade's path.</p>` : ''}
            ${keepable.has(s.grade_id) ? `<button class="btn btn-text" type="button" data-keep="${App.escapeHtml(s.grade_id)}">Check more of ${App.escapeHtml(App.gradeLabel(s.grade_name))}</button>` : ''}
          </div>
        </li>`;
    }).join('');

    const thenHtml = `
      <li class="route-step is-main">
        <span class="route-rail" aria-hidden="true"><span class="route-you"></span></span>
        <div class="route-body">
          <h2>Then: ${App.escapeHtml(mainName)}</h2>
          ${pending ? '<p class="small muted">Its placement comes first, so it starts where you are in that grade.</p>' : ''}
        </div>
      </li>`;

    const lead = route.status === 'offered' ? 'Start the catch-up'
      : route.status === 'accepted' ? 'Continue the catch-up'
        : `Start ${mainShort}`;
    host.innerHTML = `
      <div class="result catchup-plan">
        <p class="lesson-meta">${App.escapeHtml(state.trackName || '')}, grades below ${App.escapeHtml(mainShort)}</p>
        <h1>${App.escapeHtml(heading)}</h1>
        ${empty ? '<p class="lead">Nothing to catch up on in the grades we checked.</p>' : ''}
        ${route.status === 'declined' ? '<p class="lead">You skipped the catch-up, so you start here.</p>' : ''}
        ${steps.length ? `<ol class="route" aria-label="Catch-up steps, lowest grade first">${stepHtml}${thenHtml}</ol>` : ''}
        ${skipped.length && !empty ? `<p class="small muted">Skipped: ${App.escapeHtml(skipped.join(', '))}.</p>` : ''}
        <div class="result-actions">
          <button class="btn btn-primary btn-lg" type="button" id="plan-go">${App.escapeHtml(lead)}</button>
          ${route.status === 'offered' ? `<button class="btn" type="button" id="plan-skip">Skip it and start ${App.escapeHtml(mainShort)}</button>` : ''}
        </div>
        <div class="row-wrap result-links">
          <button class="btn btn-text" type="button" id="plan-back">Back to your result</button>
        </div>
      </div>`;

    const buttons = () => host.querySelectorAll('#plan-go, #plan-skip, [data-keep]');
    const run = async (work) => {
      buttons().forEach((b) => { b.disabled = true; });
      try {
        await work();
      } catch (err) {
        App.toast(err.message, 'error');
        buttons().forEach((b) => { b.disabled = false; });
      }
    };
    const decideAll = async (accept) => {
      const main = known && known.enrollment_id ? { id: known.enrollment_id } : await chooseMain(result);
      const reply = await App.api.post('/api/gap-scan/decide', { enrollment_id: main.id, all: true, accept });
      const failed = (reply.results || []).filter((r) => !r.ok);
      if (failed.length && failed.length === (reply.results || []).length) throw new Error(failed[0].error || 'That did not work. Try again.');
      return { reply, main };
    };

    document.getElementById('plan-go').addEventListener('click', () => run(async () => {
      if (route.status === 'offered') {
        const { reply, main } = await decideAll(true);
        const next = reply.route && reply.route.next;
        window.location.href = next && next.enrollment_id ? `/path?enrollment=${next.enrollment_id}` : mainHref(state.main || { id: main.id, status: 'active' });
        return;
      }
      if (route.status === 'accepted' && route.next && route.next.enrollment_id) {
        window.location.href = `/path?enrollment=${route.next.enrollment_id}`;
        return;
      }
      const reply = await App.api.post(`/api/subject-placement/${encodeURIComponent(trackId)}/choose`, { grade_id: result.recommended_grade_id });
      goTo(reply);
    }));
    const skip = document.getElementById('plan-skip');
    if (skip) {
      skip.addEventListener('click', () => run(async () => {
        await decideAll(false);
        const reply = await App.api.post(`/api/subject-placement/${encodeURIComponent(trackId)}/choose`, { grade_id: result.recommended_grade_id });
        goTo(reply);
      }));
    }
    document.getElementById('plan-back').addEventListener('click', () => renderResult(result));
    host.querySelectorAll('[data-keep]').forEach((b) => {
      b.addEventListener('click', () => runKeepChecking(result, b.dataset.keep));
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
        <button class="card mode-card" type="button" data-mode="${key}" style="text-align:left;cursor:pointer;width:100%">
          <span class="row-between"><strong>${title}</strong>
            <span class="chip">${opening.suggested_mode === key ? 'Suggested for your goal · ' : ''}${modes[key] ? `up to ${modes[key].total_minutes || modes[key].minutes} min` : ''}</span></span>
          <span class="small muted" style="display:block;margin-top:4px">${blurb}</span>
        </button>`;
      const options = (opening.grades || []).map((g) => `<option value="${App.escapeHtml(g.grade_id)}">${App.escapeHtml(g.name)}</option>`).join('');
      host.innerHTML = `
        <div class="card" style="text-align:center">
          <span class="chip chip-accent">${App.escapeHtml(opening.track_name || '')}</span>
          <h1 style="margin:12px 0 4px">Find your grade</h1>
          <p class="muted">Optional. Pick how long to spend: the longer modes ask more, and land closer.</p>
        </div>
        <div class="card" style="margin-top:12px">
          <label class="small" for="hint">Have a rough idea where you are? The search starts there. (Optional)</label>
          <select id="hint" style="width:100%;margin-top:6px"><option value="">Not sure</option>${options}</select>
        </div>
        <h2 class="visually-hidden" id="mode-heading">Pick how long to spend</h2>
        <div role="group" aria-labelledby="mode-heading" style="display:grid;gap:10px;margin-top:12px">
          ${card('quick', 'Quick', 'A short check that lands within about a grade.')}
          ${card('balanced', 'Balanced', 'More questions near where you are, so it lands closer.')}
          ${card('accurate', 'Accurate', 'The most questions, for the closest placement.')}
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
    return fail('Find my grade is not available for this subject right now. You can still pick a grade and take its placement quiz.');
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
  // The optional goal step for the whole subject (once); the mode picker then marks the
  // length the goal suggests.
  if (!resuming && window.GoalPicker) {
    try {
      const saved = await window.GoalPicker.ask(host, { trackId, title: opening.track_name || '' });
      if (saved) opening.suggested_mode = (await App.api.get(`/api/subject-placement/${trackId}`)).suggested_mode;
    } catch { /* optional: never block the placement on it */ }
  }
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
