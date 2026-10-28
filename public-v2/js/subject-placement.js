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

  function renderResult(result) {
    const byId = new Map((result.grades || []).map((g) => [g.grade_id, g]));
    const rows = (result.percent || []).map((p) => {
      const grade = byId.get(p.grade_id) || {};
      const isPick = p.grade_id === result.recommended_grade_id;
      return `
        <div class="row-between grade-percent${isPick ? ' picked' : ''}" data-grade="${App.escapeHtml(p.grade_id)}">
          <span>
            <span class="name">${App.escapeHtml(App.gradeLabel(grade.name || p.grade_id))}</span>
            ${isPick ? '<span class="chip" style="margin-left:6px">start here</span>' : ''}
            ${p.why ? `<span class="tiny muted" style="display:block">${App.escapeHtml(p.why)}</span>` : ''}
          </span>
          <span class="pct-cell">
            <span class="meter" style="width:90px;display:inline-block;vertical-align:middle"><span style="width:${p.percent}%"></span></span>
            <strong>${p.percent}%</strong>
          </span>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div class="card" style="text-align:center">
        <p class="lesson-meta">${App.escapeHtml(state.trackName || '')}, ${result.grades.length} grades</p>
        <h1 style="margin:12px 0 4px">Start at ${App.escapeHtml(App.gradeLabel(result.recommended_grade_name))}</h1>
        <p class="muted">${App.escapeHtml(String(result.headline || '').replace(/\s+[—–]\s+/g, ', '))}</p>
        ${gradeScale(result)}
        <button class="btn btn-primary btn-lg" id="pick">Choose ${App.escapeHtml(App.gradeParts(result.recommended_grade_name)[0])}</button>
        <p class="tiny muted" style="margin-top:10px">Or pick any grade yourself. The percentages below are a suggestion, not a lock.</p>
      </div>

      <div id="gap-slot"></div>

      <section class="section" style="max-width:var(--readw)">
        <h2 style="font-size:1.125rem">Every grade, and how strongly it fits you</h2>
        <p class="small muted">A high number means start here. A low number on a grade you aced is not a bad result:
          it means you already have it and should not spend your time there.</p>
        <div class="grade-percents">${rows}</div>
      </section>

      <div class="row-wrap" style="margin-top:16px">
        <a class="btn btn-ghost" href="/subject-placement?track=${encodeURIComponent(trackId)}&again=1">Take it again</a>
        <a class="btn btn-ghost" href="/onboarding">Pick a different grade</a>
        <a class="btn btn-ghost" href="/dashboard">Back to dashboard</a>
      </div>`;

    document.getElementById('pick').addEventListener('click', () => {
      window.location.href = `/onboarding?track=${encodeURIComponent(trackId)}&grade=${encodeURIComponent(result.recommended_grade_id)}`;
    });
    offerGapScan(result);
  }

  /* ── earlier-grade gaps ──────────────────────────────────────────────────
   *
   * After the recommendation, an optional short check of the grades below it:
   * one question per unit worth asking about, a second only after a miss. What
   * it finds is offered as a catch-up the learner can take or leave. It is never
   * forced and never asked twice: a "no thanks" is stored by the server and this
   * page does not bring it up again.
   */

  /** The grade's name, from the result's list of grades. */
  function gradeNameOf(result, gradeId) {
    const row = (result.grades || []).find((g) => g.grade_id === gradeId);
    return (row && row.name) || gradeId;
  }

  async function offerGapScan(result) {
    const slot = document.getElementById('gap-slot');
    if (!slot) return;
    const ids = (result.grades || []).map((g) => g.grade_id);
    // Nothing below the first grade to look at.
    if (ids.indexOf(result.recommended_grade_id) <= 0) return;
    // A scan already finished for this grade is not offered again. If it found
    // something the learner has not answered yet, that offer is shown once
    // more; anything already taken or turned down is left alone.
    let known = null;
    try {
      known = await App.api.get(`/api/gap-scan/state/${encodeURIComponent(trackId)}`);
    } catch (err) {
      known = null;
    }
    const scan = known && known.scan;
    const same = scan && scan.grade_id === result.recommended_grade_id;
    if (same && scan.done) {
      const offers = known.offers || [];
      const open = known.enrollment_id
        ? (scan.gaps || []).filter((g) => offers.some((o) => o.grade_id === g.grade_id && o.status === 'offered'))
        : scan.gaps || [];
      if (open.length) showOpenOffers(slot, result, open);
      return;
    }
    const resuming = same && !scan.done;
    slot.innerHTML = `
      <div class="card" style="margin-top:24px; max-width:var(--readw)">
        <div class="card-title">One more short step (optional)</div>
        <p class="small muted">A few questions from the grades before ${App.escapeHtml(result.recommended_grade_name)}, so
          anything you missed there can be picked up first. A few minutes, and you can skip it.</p>
        <div class="row-wrap">
          <button class="btn btn-primary" id="gapgo">${resuming ? 'Finish checking earlier grades' : 'Check earlier grades'}</button>
          <button class="btn btn-ghost" id="gapno">Skip this</button>
        </div>
      </div>`;
    document.getElementById('gapgo').addEventListener('click', () => runGapScan(result));
    document.getElementById('gapno').addEventListener('click', () => { slot.innerHTML = ''; });
  }

  /** A finished scan's catch-up the learner has not answered yet: one quiet card, not a prompt. */
  function showOpenOffers(slot, result, gaps) {
    slot.innerHTML = `
      <div class="card" style="margin-top:16px">
        <div class="card-title">${window.icon('layers')}Your optional catch-up</div>
        <p class="small muted">Your check of earlier grades found a few things worth a quick look before
          ${App.escapeHtml(result.recommended_grade_name)}. Take it or leave it.</p>
        <button class="btn" id="gapsee">See the catch-up</button>
      </div>`;
    document.getElementById('gapsee').addEventListener('click', () => gapOffer(result, gaps));
  }

  async function runGapScan(result) {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Picking the questions</div>';
    const running = opening && opening.placement;
    let reply;
    try {
      reply = await App.api.post('/api/gap-scan/start', {
        track_id: trackId,
        mode: state.mode || (running && running.mode) || 'quick',
        recommended_grade_id: result.recommended_grade_id,
      });
    } catch (err) {
      App.toast(err.message, 'error');
      return renderResult(result);
    }
    const scan = {
      deadline: clockOf(reply),
      asked: 0,
      total: Number(reply.clock && reply.clock.max_questions) || 0,
    };
    gapStep(result, scan, reply);
  }

  /** The scan's deadline, from whichever form of clock the server sends. */
  function clockOf(reply) {
    const clock = reply.clock || reply;
    if (clock.deadline_at) return clock.deadline_at;
    const minutes = Number(clock.minutes_left != null ? clock.minutes_left : clock.minutes);
    return Number.isFinite(minutes) && minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null;
  }

  function gapStep(result, scan, reply) {
    if (reply.clock || reply.deadline_at) scan.deadline = clockOf(reply) || scan.deadline;
    if (reply.done || !reply.question) return gapOffer(result, reply.gaps || []);
    const question = reply.question;
    scan.asked = reply.clock && Number.isFinite(reply.clock.asked) ? reply.clock.asked + 1 : scan.asked + 1;
    const left = scan.deadline ? Math.max(0, Math.ceil((Date.parse(scan.deadline) - Date.now()) / 60000)) : null;
    const gradeName = question.grade_name || (question.grade_id ? gradeNameOf(result, question.grade_id) : '');
    // "Keep checking" has no clock, only a cap on how many questions it asks.
    const more = !!scan.extended;
    host.innerHTML = `
      <div class="player-head">
        <a class="icon-btn player-close" href="/onboarding" title="Leave" aria-label="Leave the check">${window.icon('x')}</a>
        <div class="player-titles">
          <h1 class="player-title">${more ? `Keep checking ${App.escapeHtml(App.gradeLabel(gradeName || 'an earlier grade'))}` : 'Checking earlier grades'}</h1>
          <div class="player-sub">${App.escapeHtml(state.trackName || '')}${gradeName && !more ? `, ${App.escapeHtml(App.gradeLabel(gradeName))}` : ''}. Optional${more ? ', no time limit' : ''}; no feedback until the end.</div>
        </div>
        <div class="player-chips">
          <span class="chip counter">Question ${scan.asked}</span>
          <span class="timer clock-note">${more ? (scan.total ? `up to ${scan.total}` : '') : left != null ? `${left} min left` : ''}</span>
        </div>
      </div>
      <div class="card" id="item"></div>
      <div class="row player-foot">
        <button class="btn btn-ghost btn-sm" id="gapskipq">I don't know</button>
        <span class="small muted">Answer as well as you can. A miss here only means a short catch-up is offered, and "I don't know" counts as a miss.</span>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="gapstop">Stop checking</button>
      </div>`;
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
    document.getElementById('gapstop').addEventListener('click', () => (more ? backToOffer(result) : renderResult(result)));
  }

  /** After stopping a keep-checking walk: the offer as the scan stands now. */
  async function backToOffer(result) {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>One moment</div>';
    let known = null;
    try {
      known = await App.api.get(`/api/gap-scan/state/${encodeURIComponent(trackId)}`);
    } catch (err) {
      return renderResult(result);
    }
    gapOffer(result, (known && known.scan && known.scan.gaps) || []);
  }

  /**
   * "Keep checking <grade>": the same questions over the units of one earlier
   * grade the scan did not settle, with no clock. What it finds goes back into
   * the scan, and the offer is drawn again from the gaps it sends.
   */
  async function runKeepChecking(result, gradeId) {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Picking the questions</div>';
    let reply;
    try {
      reply = await App.api.post('/api/gap-scan/start', { track_id: trackId, extended: true, grade_id: gradeId });
    } catch (err) {
      App.toast(err.message, 'error');
      return backToOffer(result);
    }
    const scan = {
      extended: true,
      deadline: null,
      asked: 0,
      total: Number(reply.clock && reply.clock.max_questions) || 0,
    };
    gapStep(result, scan, reply);
  }

  /**
   * What the scan found, as a choice. "Catch up on these 3 units of Grade 4
   * first, about 25 min" — with the units named, so the learner can judge it,
   * and "No thanks" given the same weight on the page as the yes.
   */
  function gapOffer(result, gaps) {
    const found = (gaps || []).filter((g) => g && (g.unit_keys || g.titles || []).length);
    const target = result.recommended_grade_name;
    if (!found.length) {
      host.innerHTML = `
        <div class="card" style="text-align:center">
          <span class="chip chip-success">Earlier grades checked</span>
          <h1 style="margin:12px 0 4px">Nothing to catch up on</h1>
          <p class="muted">You're ready for ${App.escapeHtml(target)}.</p>
          <button class="btn btn-primary btn-lg" id="gapdone">Start ${App.escapeHtml(target)}</button>
        </div>
        <div id="keep-more"></div>`;
      document.getElementById('gapdone').addEventListener('click', () => startMain(result));
      addKeepChecking(result);
      return;
    }
    host.innerHTML = `
      <div class="card" style="text-align:center">
        <span class="chip chip-accent">Earlier grades checked</span>
        <h1 style="margin:12px 0 4px">A catch-up, if you want it</h1>
        <p class="muted">A few things from earlier grades came up. Catching up first can make ${App.escapeHtml(target)} easier.
          It's your call: you can start ${App.escapeHtml(target)} either way.</p>
      </div>
      ${found.map((g, i) => {
        const n = (g.unit_keys || g.titles).length;
        const name = g.grade_name || gradeNameOf(result, g.grade_id);
        const minutes = Number(g.minutes) || 0;
        // What else the check found out about the grade, where the server says.
        const proved = Number(g.known_count) || 0;
        const unchecked = Number(g.unchecked_count) || 0;
        const counts = [
          proved ? `${proved} proved` : '',
          unchecked ? `${unchecked} more unit${unchecked === 1 ? '' : 's'} not checked yet` : '',
        ].filter(Boolean).join(', ');
        return `
          <div class="card catch-offer" style="margin-top:12px" data-index="${i}" data-grade="${App.escapeHtml(g.grade_id)}">
            <div class="card-title">${window.icon('layers')}Catch up on ${n === 1 ? 'this unit' : `these ${n} units`} of ${App.escapeHtml(name)} first${minutes ? `, about ${aboutTime(minutes)}` : ''}</div>
            ${(g.titles || []).length ? `<div class="row-wrap plan-chips" style="margin:6px 0 12px">${g.titles.map((t) => `<span class="chip">${App.escapeHtml(t)}</span>`).join('')}</div>` : ''}
            ${counts ? `<p class="small muted catch-counts">${counts}${unchecked ? '. Those stay on your path, and you can test out any time.' : ''}</p>` : ''}
            <div class="row-wrap">
              <button class="btn btn-primary" type="button" data-accept="1">Catch up first</button>
              <button class="btn" type="button" data-accept="0">No thanks</button>
            </div>
          </div>`;
      }).join('')}
      <div id="keep-more"></div>
      <div id="gap-after" style="margin-top:12px"></div>`;

    const decided = [];
    host.querySelectorAll('.catch-offer').forEach((card) => {
      card.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-accept]');
        if (!button) return;
        const gap = found[Number(card.dataset.index)];
        const accept = button.dataset.accept === '1';
        card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        let reply;
        try {
          const main = await mainEnrollment(result);
          reply = await App.api.post('/api/gap-scan/decide', { enrollment_id: main.id, grade_id: gap.grade_id, accept });
        } catch (err) {
          App.toast(err.message, 'error');
          card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
          return;
        }
        const catchUpId = reply && reply.catch_up_enrollment ? reply.catch_up_enrollment.id : null;
        decided.push({ accept, catchUpId, name: gap.grade_name || gradeNameOf(result, gap.grade_id) });
        card.innerHTML = accept
          ? `<div class="small catch-offer-done">${window.icon('check-circle')}<span>Catch-up added: <strong>${App.escapeHtml(decided[decided.length - 1].name)}</strong>.</span></div>`
          : `<div class="small muted">No problem: no catch-up on ${App.escapeHtml(decided[decided.length - 1].name)}. We won't ask again.</div>`;
        if (decided.length === found.length) afterDecisions(result, decided);
      });
    });
    addKeepChecking(result);
  }

  /**
   * A "Keep checking <grade>" button for each earlier grade the server says can
   * be checked further (`can_keep_checking`): on that grade's catch-up card
   * while it is still open, and in a card of its own for any grade with none.
   * Asked of the server after the offer is drawn, so a slow answer never holds
   * the offer up.
   */
  async function addKeepChecking(result) {
    let known = null;
    try {
      known = await App.api.get(`/api/gap-scan/state/${encodeURIComponent(trackId)}`);
    } catch (err) {
      return;
    }
    const ids = (known && known.can_keep_checking) || [];
    if (!ids.length) return;
    const label = (id) => `Keep checking ${App.escapeHtml(gradeNameOf(result, id))}`;
    const button = (id) => `<button class="btn btn-ghost" type="button" data-keep="${App.escapeHtml(id)}">${label(id)}</button>`;
    const alone = [];
    for (const id of ids) {
      const card = host.querySelector(`.catch-offer[data-grade="${CSS.escape(id)}"]`);
      if (card && card.querySelector('[data-accept]')) {
        card.insertAdjacentHTML('beforeend', `<div class="row-wrap keep-row">${button(id)}<span class="tiny muted">Optional. No time limit.</span></div>`);
      } else if (!card) {
        alone.push(id);
      }
    }
    const more = document.getElementById('keep-more');
    if (more && alone.length) {
      more.innerHTML = `
        <div class="card" style="margin-top:12px">
          <div class="card-title">${window.icon('search')}Check more of an earlier grade</div>
          <p class="small muted">Optional. A few more questions on the units we have not checked yet, with no time limit.</p>
          <div class="row-wrap">${alone.map(button).join('')}</div>
        </div>`;
    }
    host.querySelectorAll('[data-keep]').forEach((b) => {
      b.addEventListener('click', () => runKeepChecking(result, b.dataset.keep));
    });
  }

  /** "25 min", or "4 hours" once it runs past an hour and a half. */
  function aboutTime(minutes) {
    if (minutes < 90) return `${minutes} min`;
    return `${Math.round(minutes / 30) / 2} hours`;
  }

  /** Where to go once every offer has an answer. */
  async function afterDecisions(result, decided) {
    const main = await mainEnrollment(result).catch(() => null);
    const firstCatchUp = decided.find((d) => d.accept && d.catchUpId);
    const slot = document.getElementById('gap-after');
    const placementHref = main ? `/placement?enrollment=${main.id}` : '/dashboard';
    slot.innerHTML = `
      <div class="card" style="text-align:center">
        ${firstCatchUp
          ? `<a class="btn btn-primary btn-lg" href="/path?enrollment=${firstCatchUp.catchUpId}">Start the catch-up</a>
             <p class="tiny muted" style="margin-top:10px">Your ${App.escapeHtml(result.recommended_grade_name)} placement is waiting on your dashboard.
               <a href="${placementHref}">Take it now instead</a>.</p>`
          : `<a class="btn btn-primary btn-lg" href="${placementHref}">Start ${App.escapeHtml(result.recommended_grade_name)}</a>
             <p class="tiny muted" style="margin-top:10px">A short placement first finds where you start inside it.</p>`}
      </div>`;
  }

  /**
   * The learner's enrollment in the recommended grade, which a catch-up is
   * attached to. Reused when it exists; made when it does not, the same way
   * choosing the grade on onboarding makes it, since answering the offer is
   * choosing to start this grade.
   */
  let mainCache = null;
  async function mainEnrollment(result) {
    if (mainCache) return mainCache;
    const { enrollments } = await App.api.get('/api/enrollments');
    const found = enrollments.find((e) => e.track && e.grade && e.track.id === trackId && e.grade.id === result.recommended_grade_id);
    if (found) {
      mainCache = found;
      return found;
    }
    const { created } = await App.api.post('/api/enrollments', {
      selections: [{ track_id: trackId, grade_id: result.recommended_grade_id }],
    });
    if (!created || !created[0]) throw new Error('Could not start that grade. Try again from your dashboard.');
    mainCache = created[0];
    return mainCache;
  }

  async function startMain(result) {
    try {
      const main = await mainEnrollment(result);
      window.location.href = main.status === 'placement_pending' ? `/placement?enrollment=${main.id}` : `/path?enrollment=${main.id}`;
    } catch (err) {
      App.toast(err.message, 'error');
    }
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
            <span class="chip">${modes[key] ? `up to ${modes[key].total_minutes || modes[key].minutes} min` : ''}</span></span>
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
