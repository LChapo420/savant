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
  let tookStyleQuiz = false;
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
  // Already placed: this page would start the whole placement again (a reload of
  // the result screen, or the back button from the path). The path has the plan,
  // the units not checked yet and their test-outs, so go there instead. The one
  // exception is a retake the learner asked for (?retake=1, from the dashboard or
  // the path page, after confirming).
  const retaking = App.query('retake') === '1';
  if (enrollment.status !== 'placement_pending' && !retaking) {
    window.location.replace(`/path?enrollment=${enrollmentId}`);
    return;
  }

  // The owner's account may skip the placement quiz (POST /api/placement/skip;
  // the server refuses it for every other account). One listener, on the host,
  // because the player's head is drawn again as the quiz runs.
  host.addEventListener('click', async (event) => {
    const button = event.target.closest('#owner-skip-placement');
    if (!button) return;
    button.disabled = true;
    try {
      await App.api.post('/api/placement/skip', { enrollment_id: enrollmentId });
      window.location.replace(`/path?enrollment=${enrollmentId}`);
    } catch (err) {
      App.toast(err.message, 'error');
      button.disabled = false;
    }
  });

  // The optional goal step, once per grade (skipped when answered already, or for
  // a placement already under way): it sets how long this check is.
  if (window.GoalPicker && !retaking) {
    try {
      const open = enrollment.status === 'placement_pending' && !App.query('resume');
      if (open) await window.GoalPicker.ask(host, { trackId: enrollment.track.id, gradeId: enrollment.grade.id, title: `${enrollment.track.name} · ${enrollment.grade.name}` });
    } catch { /* the goal is optional: never block the placement on it */ }
  }

  let start;
  try {
    start = await App.api.post('/api/placement/start', { enrollment_id: enrollmentId, ...(retaking ? { retake: true } : {}) });
  } catch (err) {
    // The server says this grade is placed and a retake is the way to take it
    // again: the path is where the learner belongs, and it is not an error.
    if (err.status === 409 && err.payload && err.payload.retake_available) {
      window.location.replace(`/path?enrollment=${enrollmentId}`);
      return;
    }
    throw err;
  }
  // True only when the server really started (or resumed) a retake.
  const isRetake = !!start.retake;
  const items = start.items;
  // A grade with a unit bank is placed adaptively: the questions arrive one at a
  // time, each picked from the answers so far, and the walk says when it is done.
  const adaptive = !!start.adaptive;
  const answered = items.filter((i) => i.answered).length;
  // Every question already answered means the quiz is over and only the scoring
  // is left (a tab closed between the last answer and the result): go straight
  // to it, rather than back to the first question.
  let index = Math.min(answered, items.length);
  let startedAt = Date.now();

  function shell() {
    // The player's top bar: the way out, the subject, the question number and
    // the time. An adaptive test has no progress bar: it cannot know how many
    // questions it will ask, so a bar would only pretend.
    host.setAttribute('data-subject', enrollment.track.id);
    host.innerHTML = `
      <div class="player-head">
        <a class="icon-btn player-close" href="${isRetake ? `/path?enrollment=${enrollmentId}` : '/dashboard'}" title="${isRetake ? 'Leave the retake' : 'Leave the placement quiz'}" aria-label="${isRetake ? 'Leave the retake; your path stays as it is and you can pick the retake up later' : 'Leave the placement quiz; your answers so far are kept'}">${window.icon('x')}</a>
        <div class="player-titles">
          <h1 class="player-title">${App.escapeHtml(enrollment.track.name)} placement</h1>
          <div class="player-sub">${App.escapeHtml(App.gradeLabel(enrollment.grade.name))}</div>
        </div>
        <div class="player-chips">
          ${isRetake ? '<span class="chip is-retake">Retake</span>' : ''}
          ${user.can_skip ? '<button class="btn btn-sm btn-ghost" id="owner-skip-placement" type="button" title="Owner only">Skip placement</button>' : ''}
          <span class="chip counter" id="counter"></span>
          <span class="timer" id="pct"></span>
        </div>
        ${adaptive ? '<div class="meter is-segmented"><span id="bar" style="width:0%"></span></div>' : `<div class="player-meter"><div class="meter"><span id="bar" style="width:0%"></span></div></div>`}
      </div>
      <div class="card" id="item"></div>
      <div class="row player-foot">
        <span class="small muted">${adaptive ? 'Each question is picked from your answers so far.' : 'The questions get harder as you go.'} No feedback until the end, and a wrong answer above your level costs you nothing.</span>
        <button class="btn btn-ghost btn-sm" id="skip">I don't know</button>
        ${isRetake ? '<button class="btn btn-text btn-sm" id="stop-retake" type="button">Stop retake</button>' : ''}
      </div>`;
    document.getElementById('skip').addEventListener('click', () => submit(''));
    // Stopping a retake changes nothing: the plan, the level and the finished
    // units stay as they were. It is not a quit.
    const stopRetake = document.getElementById('stop-retake');
    if (stopRetake) {
      stopRetake.addEventListener('click', async () => {
        stopRetake.disabled = true;
        try {
          await App.api.post('/api/placement/retake/cancel', { enrollment_id: enrollmentId });
        } catch (err) { /* nothing open to cancel; the path is still where it goes */ }
        window.location.href = `/path?enrollment=${enrollmentId}`;
      });
    }
  }

  function progress() {
    const done = index;
    if (adaptive) {
      document.getElementById('counter').textContent = `Question ${done + 1}`;
      document.getElementById('bar').style.width = `${Math.min(100, (done / start.total) * 100)}%`;
      const left = start.deadline_at ? Math.max(0, Math.ceil((Date.parse(start.deadline_at) - Date.now()) / 60000)) : null;
      const timer = document.getElementById('pct');
      timer.textContent = left != null ? `${left} min left` : '';
      // Under two minutes the time is the one thing worth a colour.
      timer.classList.toggle('is-low', left != null && left < 2);
      return;
    }
    document.getElementById('counter').textContent = `${Math.min(done + 1, items.length)} / ${items.length}`;
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
      : { onSubmit: (answer) => submit(answer) });
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
    // The questionnaire is offered below the result only if it has not been taken.
    try { tookStyleQuiz = !!(await App.api.get('/api/profile')).took_style_quiz; } catch { tookStyleQuiz = false; }
    renderResult(result);
  }

  function renderResult(result) {
    if (result.adaptive) return renderUnitResult(result);
    const bands = result.bands.filter((b) => b.accuracy !== null);
    // "How you did by difficulty" as a dot matrix: one column per band, one
    // square per question, the right ones ticked and stacked at the bottom.
    const dots = bands.map((b) => {
      const cells = Array.from({ length: b.asked }, (_, i) => (i >= b.asked - b.correct
        ? `<span class="cell is-right">${window.mark('tick')}</span>`
        : '<span class="cell"></span>')).join('');
      return `<div class="dots-col"><span class="pct">${App.pct(b.accuracy)}</span><span class="cells">${cells}</span><span class="lbl">${App.escapeHtml(b.name)}</span></div>`;
    }).join('');
    const said = bands.map((b) => `difficulty ${b.name}: ${b.correct} of ${b.asked}`).join('; ');
    const marked = (list, name) => list.map((g) => `<li><span class="marked-word">${App.escapeHtml(g.name)}${window.mark(name)}</span></li>`).join('');

    host.setAttribute('data-subject', enrollment.track.id);
    host.innerHTML = `
      <div class="result">
        <p class="lesson-meta">${App.escapeHtml(result.track_name)}, ${App.escapeHtml(App.gradeLabel(result.grade_name))}</p>
        <h1>You start at level ${result.placedLevel} of ${result.path_length}.</h1>
        ${App.scale({
          from: 1, to: result.path_length, you: result.placedLevel, subject: enrollment.track.id, arriving: true,
          caption: `You answered ${result.correct} of ${result.asked} (${App.pct(result.overall)}), and held up through difficulty ${result.heldDifficulty} of 10.`,
        })}
        ${keptLine(result)}
        <div class="result-actions">
          <a class="btn btn-primary btn-lg" href="/path?enrollment=${enrollmentId}">${result.retake ? 'Go to your path' : `Start learning at level ${result.placedLevel}`}</a>
        </div>

        <section>
          <h2>How you did by difficulty</h2>
          <div class="dots" aria-hidden="true">${dots}</div>
          <p class="visually-hidden">${App.escapeHtml(said)}.</p>
          <p class="tiny muted" style="margin:12px 0 0">Columns are difficulty bands; a ticked square is a right answer. Your level is the top of the hardest band you held at 70%.</p>
        </section>

        <section>
          <h2>What to work on first</h2>
          ${result.gaps.length
            ? `<p class="small muted">These came out under 60%, so your first sessions start here.</p>
               <ul class="mark-list">${marked(result.gaps, 'underline')}</ul>`
            : '<p class="small muted">Nothing came out weak enough to single out. Your sessions will keep probing upward.</p>'}
          ${result.strengths.length
            ? `<p class="small muted" style="margin-top:20px">Already solid, so these move to spaced review instead of drilling:</p>
               <ul class="mark-list is-circled">${marked(result.strengths, 'circle')}</ul>`
            : ''}
        </section>

        ${tookStyleQuiz ? `<section><div class="row-wrap"><a class="btn btn-text" href="/dashboard">Back to dashboard</a></div></section>` : `<section>
          <h2>One more optional step</h2>
          <p class="small muted">
            ${App.ux.style_copy === false
    ? 'The learning-style questionnaire takes about two minutes and changes how your sessions are built: their length, the mix of formats, and how much explanation you get. You can skip it and go straight in.'
    : 'The preferences quiz takes about two minutes. It sets a starting session length and how much explanation you get. It does not change what you are taught, because research does not find that teaching to a learning style raises scores. You can skip it and go straight in.'}
          </p>
          <div class="row-wrap">
            <a class="btn btn-text" href="/style-quiz?next=${encodeURIComponent(`/path?enrollment=${enrollmentId}`)}">Take the learning-style quiz</a>
            <a class="btn btn-text" href="/dashboard">Back to dashboard</a>
          </div>
        </section>`}
      </div>`;
  }

  /**
   * The result of a placement by unit: where the learner starts, the units it
   * proved they know (which their path now skips), and the two optional steps
   * that follow — the quick check of what was skipped without being proved, and
   * the test-out for units not checked yet or later ones the placement saw
   * answered right. Both are offered straight away rather than left for later:
   * each is a minute or two, and each is what makes a skip safe to take.
   *
   * The learner starts where the server says (`start_level`), which is earlier
   * than the placed unit when a gap turned up on the way.
   */
  function renderUnitResult(result) {
    const checks = (result.checks || []).length;
    const startLevel = Number(result.start_level) || result.placedLevel;
    const back = startLevel < result.placedLevel;
    // The placed unit is always on the to-learn list; the gaps are the others.
    const gaps = (result.to_learn || []).filter((u) => u !== result.unit);
    const unchecked = result.unchecked || [];
    const lead = !result.skipped ? 'This is the start of the grade.'
      : gaps.length || unchecked.length ? ''
        : checks ? `You skip the ${result.skipped === 1 ? 'unit' : `${result.skipped} units`} before it, after a quick check.`
          : `The ${result.skipped === 1 ? 'unit' : `${result.skipped} units`} before it ${result.skipped === 1 ? 'is' : 'are'} already yours.`;
    host.innerHTML = `
      <div class="card result" style="text-align:center">
        <p class="lesson-meta">${App.escapeHtml(result.track_name)}, ${App.escapeHtml(App.gradeLabel(result.grade_name))}</p>
        <h1 style="margin:12px 0 4px">${back ? `Your placed unit is ${result.unit} of ${result.units}` : `You start at unit ${result.unit} of ${result.units}`}</h1>
        <p class="muted">${result.title ? `${App.escapeHtml(result.title)}. ` : ''}Level ${result.placedLevel} of ${result.path_length}. ${lead}</p>
        ${App.scale({ from: 1, to: result.path_length, you: startLevel, subject: enrollment.track.id, arriving: true,
          caption: `You start at level ${startLevel} of ${result.path_length}.` })}
        ${back ? `<p class="muted">You start with ${unitsText(gaps)} first, where a gap showed up, and then move on to unit ${result.unit}.</p>` : ''}
        ${unchecked.length ? `<p class="small muted">Not checked yet: ${unitsText(unchecked)}. ${checks
          ? `The quick check below can settle ${unchecked.length === 1 ? 'it' : 'them'}; until then ${unchecked.length === 1 ? 'it stays' : 'they stay'} on your path.`
          : `${unchecked.length === 1 ? 'It stays' : 'They stay'} on your path, and you can test out any time.`}</p>` : ''}
        ${keptLine(result)}
        <div id="plan-slot"></div>
        <div id="check-slot"></div>
        <a class="btn ${checks ? 'btn-ghost' : 'btn-primary btn-lg'}" id="go" href="/path?enrollment=${enrollmentId}">${result.retake ? 'Go to your path' : `Start learning at level ${startLevel}`}</a>
      </div>`;
    showPlan(document.getElementById('plan-slot'));
    if (checks) offerCheck(result);
    else offerTestOut(document.getElementById('check-slot'), document.getElementById('go'));
  }

  /** After a retake: the units it left finished. Nothing for a first placement. */
  function keptLine(result) {
    const kept = (result && result.kept_done) || [];
    return kept.length ? `<p class="small retake-kept">Kept as finished: ${unitsText(kept)}.</p>` : '';
  }

  /** "unit 4", "units 2 and 4", "units 2, 4 and 6". */
  function unitsText(list) {
    const nums = (list || []).map((u) => (u && typeof u === 'object' ? u.unit : u)).filter((u) => u != null);
    if (nums.length <= 1) return `unit ${nums.length ? nums[0] : ''}`.trim();
    return `units ${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;
  }

  /**
   * The units this enrollment's path skips and the ones still to learn, from the
   * server's plan. Asked of the server rather than worked out here, so this
   * screen, the path page and the dashboard all say the same thing. A grade with
   * no plan simply shows nothing extra.
   */
  async function loadPlan() {
    try {
      const reply = await App.api.get(`/api/placement/path/${enrollmentId}`);
      return reply && (reply.summary || reply);
    } catch (err) {
      return null;
    }
  }

  async function showPlan(slot) {
    const summary = await loadPlan();
    if (!slot || !summary) return;
    slot.innerHTML = planHtml(summary);
  }

  function planHtml(summary) {
    const known = unitGroup(summary, 'known');
    const learn = unitGroup(summary, 'learn');
    const unseen = unitGroup(summary, 'unseen');
    const done = unitGroup(summary, 'done');
    const unchecked = unitGroup(summary, 'unchecked');
    const total = known.count + learn.count + unseen.count + done.count + unchecked.count;
    if (!total) return '';
    // Units before the start that the quick check has not settled yet are not
    // "to learn": a right answer there skips them too, so they are counted apart.
    const placed = Number(summary.placed_unit) || 0;
    const checking = unseen.items.filter((u) => placed && u.unit && u.unit < placed).length;
    const left = learn.count + unseen.count - checking;
    // Units no check has settled stay on the path, but they are not "to learn" yet either.
    const notChecked = unchecked.count ? `, ${unchecked.count} not checked yet` : '';
    // The grade as a strip of units: circled where they are yours, dashed where
    // nothing has checked them, "You" where you start. The names follow, in
    // lists marked the same way.
    const strip = App.unitStrip(summary.units || [], {
      level: Number(summary.current_level) || Number(summary.first_level) || null,
      placedUnit: placed,
      subject: enrollment.track.id,
    });
    const list = (group, markName) => group.items.map((u) => `<li><span class="marked-word">${App.escapeHtml(unitName(u))}${markName ? window.mark(markName) : ''}</span></li>`).join('');
    return `
      <div class="plan-box">
        <p style="margin:0 0 8px"><strong>${known.count
          ? `You skip ${known.count} of ${total} unit${total === 1 ? '' : 's'}; ${left} to learn${notChecked}.`
          : `${left} unit${left === 1 ? '' : 's'} to learn${notChecked}.`}</strong>
          ${checking ? `<span class="small muted">${checking} more ${checking === 1 ? 'is' : 'are'} skipped once the quick check confirms ${checking === 1 ? 'it' : 'them'}.</span>` : ''}</p>
        ${strip}
        <div class="plan-groups">
          ${known.items.length ? `<div><h3>Already yours, so your path skips ${known.count === 1 ? 'it' : 'them'}</h3>
            <ul class="mark-list is-circled">${list(known, 'circle')}</ul></div>` : ''}
          ${learn.items.length ? `<div><h3>To learn first</h3>
            <ul class="mark-list">${list(learn, 'underline')}</ul></div>` : ''}
          ${unchecked.items.length ? `<div><h3>Not checked yet</h3>
            <p class="tiny muted" style="margin:0 0 6px">These stay on your path, and you can test out any time.</p>
            <ul class="mark-list">${list(unchecked, null)}</ul></div>` : ''}
        </div>
      </div>`;
  }

  async function offerCheck(result) {
    const slot = document.getElementById('check-slot');
    // The clock is the server's: asked for here so the intro can say how long is left.
    let first = null;
    try {
      first = await App.api.get(`/api/placement/quick-check/${enrollmentId}`);
    } catch (err) {
      first = null;
    }
    if (first && first.done) {
      // No time (or no questions) left to check with: nothing to start, so the
      // way on is the start button, and the units left stay on the path.
      const go = document.getElementById('go');
      if (go) go.className = 'btn btn-primary btn-lg';
      return offerTestOut(slot, go);
    }
    const count = result.checks.length;
    const secs = first && first.summary ? first.summary.seconds_left : null;
    slot.innerHTML = `
      <p class="lead" style="margin:24px 0 12px">
        <strong>Quick check of what you skipped.</strong> A few questions from each of the ${count} skipped
        unit${count === 1 ? '' : 's'}, until it is settled. One miss adds the unit to your path, and a unit
        we cannot settle stays on your path as "not checked yet".
        The check is time-limited${secs != null ? `: you have about ${minutesOf(secs / 60)} left` : ''}.
      </p>
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
      if (state.done || !question) return checkDone(state.summary);
      n++;
      // Units settled so far, not questions asked: a unit takes as many questions
      // as it needs, so only units can be counted up front.
      const s = state.summary;
      const settled = Math.min(total, (s.passed || 0) + (s.reopened || []).length + (s.unchecked || []).length);
      const left = s.seconds_left != null ? Math.max(1, Math.ceil(s.seconds_left / 60)) : null;
      host.innerHTML = `
        <div class="player-head">
          <a class="icon-btn player-close" href="/path?enrollment=${enrollmentId}" title="Stop and go to your path" aria-label="Stop the quick check and go to your path">${window.icon('x')}</a>
          <div class="player-titles">
            <h1 class="player-title">Quick check</h1>
            <div class="player-sub">${App.escapeHtml(enrollment.track.name)}, checking the units you skipped</div>
          </div>
          <div class="player-chips">
            <span class="chip counter">Question ${n}</span>
            <span class="timer clock-note">${left != null ? `${left} min left` : `${settled} of ${total} units`}</span>
          </div>
          <div class="player-meter"><div class="meter"><span style="width:${total ? Math.min(100, (settled / total) * 100) : 0}%"></span></div><span class="tiny muted">${settled} of ${total} units settled</span></div>
        </div>
        <div class="card" id="item"></div>
        <p class="small muted" style="margin-top:16px">A few questions from each unit you skipped, until it is settled. No feedback until the end.</p>`;
      Player.render(document.getElementById('item'), question, {
        coach: false,
        onSubmit: async (answer) => {
          try {
            state = await App.api.post('/api/placement/quick-check', {
              enrollment_id: enrollmentId, unit: question.unit, slot: question.slot, answer,
            });
          } catch (err) {
            // A stale answer comes back with the question actually being asked.
            if (err.payload && (err.payload.question || err.payload.done)) {
              state = err.payload;
              return ask(state.question);
            }
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

  /**
   * The end of the quick check. A unit missed is added to the path to be
   * learned, and a unit the check could not settle stays on it as "not checked
   * yet"; nothing else moves, so a learner who proved the rest keeps every skip
   * they earned rather than being sent back to redo the grade from there.
   */
  function checkDone(summary) {
    const reopened = summary.reopened || [];
    const unchecked = summary.unchecked || [];
    const passed = summary.passed || 0;
    const allPassed = !reopened.length && !unchecked.length;
    const lines = [];
    if (passed) {
      lines.push(allPassed
        ? `${passed === 1 ? 'The skipped unit' : passed === 2 ? 'Both skipped units' : `All ${passed} skipped units`} checked out. You keep every skip.`
        : `${passed === 1 ? 'One skipped unit checked out and stays' : `${passed} skipped units checked out and stay`} skipped.`);
    }
    if (reopened.length) lines.push(`You'll learn ${unitsText(reopened)} on your path.`);
    if (unchecked.length) {
      lines.push(`Not checked yet: ${unitsText(unchecked)}. ${unchecked.length === 1 ? 'It stays' : 'They stay'} on your path; test out any time.`);
    }
    const title = reopened.length ? `Added ${reopened.length === 1 ? 'one unit' : `${reopened.length} units`} to your path`
      : unchecked.length ? (passed ? 'Checked what there was time for' : 'Not checked yet')
        : 'Confirmed';
    host.innerHTML = `
      <div class="card" style="text-align:center">
        <h1 style="margin:12px 0 4px">${title}</h1>
        <p class="muted">${lines.join(' ')}</p>
        <div id="plan-slot"></div>
        <div id="check-slot"></div>
        <a class="btn btn-primary btn-lg" id="go" href="/path?enrollment=${enrollmentId}">Start learning at level ${summary.current_level}</a>
      </div>`;
    showPlan(document.getElementById('plan-slot'));
    offerTestOut(document.getElementById('check-slot'), document.getElementById('go'));
  }

  /**
   * The test-out offer, for units not checked yet and for later units the
   * placement already saw answered right. Fresh questions on a unit until its
   * answers prove it, usually one to three, and then the path skips it; a miss
   * keeps it on the path. Optional: the start button stays where it is, and
   * declining costs nothing — the unit is simply learned when the path reaches it.
   */
  async function offerTestOut(slot, go) {
    let state;
    try {
      state = await App.api.get(`/api/placement/test-out/${enrollmentId}`);
    } catch (err) {
      return; // No test-out on this grade (or not available yet): nothing to offer.
    }
    if (!state || state.done || !state.question || !slot) return;
    const count = testOutCount(state);
    const notChecked = (state.candidates || []).filter((c) => c.status === 'unchecked').length;
    const what = !count ? 'some units'
      : notChecked === count ? `${count} unit${count === 1 ? '' : 's'} that ${count === 1 ? 'is' : 'are'} not checked yet`
        : `${count} unit${count === 1 ? '' : 's'}${notChecked ? `, ${notChecked} of them not checked yet` : ''}`;
    slot.innerHTML = `
      <p class="lead" style="margin:24px 0 12px">
        <strong>Want to skip more?</strong> You can test out of ${what}.
        You get fresh questions on ${count === 1 ? 'it' : 'each'} until it's proved, usually 1&ndash;3, and then your path skips it.
        A miss keeps it on your path. ${count ? `About ${minutesOf((count * 2) / 3)}.` : ''} Optional.
      </p>
      <button class="btn btn-primary btn-lg" id="testout">Test out</button>`;
    if (go) go.className = 'btn btn-ghost';
    document.getElementById('testout').addEventListener('click', () => runTestOut(state));
  }

  /** How many units the test-out covers, from whichever count the server sends. */
  function testOutCount(state) {
    const s = state.summary || {};
    if (Array.isArray(state.candidates)) return state.candidates.length;
    if (Array.isArray(s.candidates)) return s.candidates.length;
    return Number(s.total || s.units || 0) || 0;
  }

  function runTestOut(first) {
    let state = first;
    let n = 0;
    // Units, not questions, are what can be counted up front: each takes as many
    // fresh questions as it needs.
    const units = testOutCount(first);
    const ask = (question) => {
      if (state.done || !question) return testOutDone(state, first);
      n++;
      const title = question.title || question.unit_title || '';
      const settled = units ? Math.max(0, units - testOutCount(state)) : 0;
      host.innerHTML = `
        <div class="player-head">
          <a class="icon-btn player-close" href="/path?enrollment=${enrollmentId}" title="Stop and go to your path" aria-label="Stop the test-out and go to your path">${window.icon('x')}</a>
          <div class="player-titles">
            <h1 class="player-title">Test out of unit ${question.unit}${title ? `: ${App.escapeHtml(title)}` : ''}</h1>
            <div class="player-sub">No feedback until the end</div>
          </div>
          <div class="player-chips"><span class="chip counter">Question ${n}</span></div>
          ${units ? `<div class="player-meter"><div class="meter"><span style="width:${Math.min(100, (settled / units) * 100)}%"></span></div><span class="tiny muted">${settled} of ${units} unit${units === 1 ? '' : 's'} done</span></div>` : ''}
        </div>`;
      host.insertAdjacentHTML('beforeend', `
        <div class="card" id="item"></div>
        <p class="small muted" style="margin-top:16px">Fresh questions until the unit is proved, usually 1&ndash;3. A miss keeps it on your path.</p>`);
      Player.render(document.getElementById('item'), question, {
        coach: false,
        onSubmit: async (answer) => {
          try {
            state = await App.api.post('/api/placement/test-out', {
              enrollment_id: enrollmentId, unit: question.unit, slot: question.slot, answer,
            });
          } catch (err) {
            // A stale answer comes back with the question actually being asked.
            if (err.payload && (err.payload.question || err.payload.done)) {
              state = err.payload;
              return ask(state.question);
            }
            App.toast(err.message, 'error');
            return;
          }
          ask(state.question);
        },
      });
    };
    ask(state.question);
  }

  async function testOutDone(state, first) {
    const s = (state && state.summary) || {};
    // The server lists every unit ever tested out of; this run's are the new ones.
    const before = new Set(((first && first.summary && first.summary.passed) || []).map(Number));
    const passed = (Array.isArray(s.passed) ? s.passed : []).filter((u) => !before.has(Number(u)));
    const passedCount = passed.length;
    const toLearn = Array.isArray(s.to_learn) ? s.to_learn : [];
    const plan = await loadPlan();
    const level = s.current_level || (plan && (plan.current_level || plan.first_level));
    host.innerHTML = `
      <div class="card" style="text-align:center">
        <h1 style="margin:12px 0 4px">${passedCount
          ? `You tested out of ${passedCount === 1 ? 'one more unit' : `${passedCount} more units`}`
          : 'Good to know'}</h1>
        <p class="muted">${passedCount
          ? `${capital(unitsText(passed))}: your path skips ${passedCount === 1 ? 'it' : 'them'} now.`
          : 'Those units stay on your path, and you will learn them when you get there.'}
          ${passedCount && toLearn.length ? `${capital(unitsText(toLearn))} stay${toLearn.length === 1 ? 's' : ''} on your path.` : ''}</p>
        <div id="plan-slot">${plan ? planHtml(plan) : ''}</div>
        <a class="btn btn-primary btn-lg" href="/path?enrollment=${enrollmentId}">Start learning${level ? ` at level ${level}` : ''}</a>
      </div>`;
  }

  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  /*
   * The plan's units by status, in whatever shape the summary sends them: a
   * count with a separate list of units, a list, or a count with titles.
   */
  function unitGroup(summary, status) {
    const value = summary ? summary[status] : null;
    const all = Array.isArray(summary && summary.units) ? summary.units : [];
    const listed = all.filter((u) => u && u.status === status);
    if (Array.isArray(value)) return { count: value.length, items: value.map(unitOf) };
    if (value && typeof value === 'object') {
      const items = (value.units || value.items || value.titles || []).map(unitOf);
      return { count: Number.isFinite(Number(value.count)) ? Number(value.count) : items.length, items };
    }
    if (Number.isFinite(Number(value)) && value !== null) {
      return { count: Number(value), items: listed.map(unitOf) };
    }
    return { count: listed.length, items: listed.map(unitOf) };
  }

  function unitOf(u) {
    if (u == null) return {};
    if (typeof u !== 'object') return { title: String(u) };
    return { unit: Number(u.unit || u.number) || null, key: u.key || '', title: u.title || (u.titles || [])[0] || '' };
  }

  /** "1 minute", "3 minutes": the plural follows the number shown. */
  function minutesOf(raw) {
    const m = Math.max(1, Math.round(raw));
    return `${m} minute${m === 1 ? '' : 's'}`;
  }

  const unitName = (u) => (u.unit ? `Unit ${u.unit}${u.title ? `: ${u.title}` : ''}` : u.title || u.key || '');

  if (index >= items.length) {
    await finish();
  } else {
    shell();
    progress();
    show();
  }
});
