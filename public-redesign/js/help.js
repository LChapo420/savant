/* Help me learn: the other door out of a failed Master or Grand Master quiz.
 *
 * The page is four numbered steps for one weak area at a time — what went wrong,
 * how it works, talk it through, practise it — with the areas listed across the
 * top and the retry button pinned where it cannot be missed. Only the step you are
 * on is expanded, so the page opens on one thing to read rather than on everything
 * at once.
 *
 * It renders from a single request and never waits on a model: the tutor's reading
 * of the failure is written while the quiz is still being taken, and when it has
 * not landed yet the rule-based reading is shown and replaced in place.
 *
 * Nothing here is a prerequisite for retaking the quiz. That is the point of
 * offering a choice instead of a penalty.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const host = document.getElementById('help');
  const enrollmentId = Number(App.query('enrollment'));
  if (!enrollmentId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  let data;
  try {
    data = await App.api.get(`/api/remediation/${enrollmentId}`);
  } catch (err) {
    host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
    return;
  }

  if (!data.remediation) {
    host.innerHTML = `<div class="notice notice-success">
        <strong>Nothing to work on.</strong> You have no unpassed checkpoint on this subject.
      </div>
      <div class="row-wrap" style="margin-top:14px">
        <a class="btn btn-primary" href="/session?enrollment=${enrollmentId}">${window.icon('arrow-right')}Carry on</a>
        <a class="btn" href="/path?enrollment=${enrollmentId}">View your path</a>
      </div>`;
    return;
  }

  let r = data.remediation;
  let label = data.kind_label;
  let selected = Math.max(0, r.areas.findIndex((a) => !a.held));
  let step = 1;
  let drillRound = null;

  const retryHref = () => `/session?enrollment=${enrollmentId}`;
  const area = () => r.areas[selected] || null;
  const heldCount = () => r.areas.filter((a) => a.held).length;

  // ── the frame ────────────────────────────────────────────────────────────
  function shell() {
    host.innerHTML = `
      <div class="help-top">
        <div>
          <h1 class="help-title">Work on what went wrong</h1>
          <p class="help-sub">
            ${App.escapeHtml(label)}, level ${r.level} — you scored ${App.pct(r.accuracy)} against
            ${App.pct(r.required)}.${r.attempt > 1 ? ` Attempt ${r.attempt}.` : ''}
            You can retake it whenever you like; the questions will be new.
          </p>
        </div>
        <div class="help-retry">
          <a class="btn btn-primary btn-lg" href="${retryHref()}">
            ${window.icon('refresh')}Retry the ${App.escapeHtml(label)}
          </a>
          <span class="tiny muted" id="ready-note"></span>
        </div>
      </div>

      <nav class="help-areas" id="areas" aria-label="Weak areas"></nav>
      <div id="panel"></div>`;
    renderAreas();
    renderPanel();
  }

  function renderAreas() {
    const slot = document.getElementById('areas');
    slot.innerHTML = '';
    slot.appendChild(App.el('div', { class: 'help-areas-label small muted' },
      r.areas.length === 1
        ? 'One area to work on'
        : `${heldCount()} of ${r.areas.length} areas back up`));

    const list = App.el('div', { class: 'help-area-list' });
    r.areas.forEach((a, i) => {
      const chip = App.el('button', {
        class: `help-area${i === selected ? ' is-current' : ''}${a.held ? ' is-held' : ''}`,
        type: 'button',
      }, `${a.held ? window.icon('check-circle') : window.icon('target')}
          <span class="help-area-name">${App.escapeHtml(a.skill_name)}</span>
          <span class="help-area-score">${a.held ? 'back up' : `${App.pct(a.accuracy)} on the quiz`}</span>`);
      chip.addEventListener('click', () => { selected = i; step = 1; drillRound = null; renderAreas(); renderPanel(); });
      list.appendChild(chip);
    });
    slot.appendChild(list);

    const note = document.getElementById('ready-note');
    if (note) {
      note.textContent = r.diagnosis_source === 'ai' ? 'Read by your tutor.'
        : r.diagnosis_source === 'ai_partial' ? 'Read by your tutor; still reading the other areas.'
          : data.ai ? 'Reading your answers now — this will sharpen in a moment.'
            : 'Read from your answers by the built-in rules.';
    }
  }

  // ── the four steps ───────────────────────────────────────────────────────
  const STEPS = [
    { n: 1, title: 'What went wrong', icon: 'search' },
    { n: 2, title: 'How this works', icon: 'book-open' },
    { n: 3, title: 'Talk it through', icon: 'help' },
    { n: 4, title: 'Practise it', icon: 'target' },
  ];

  function renderPanel() {
    const a = area();
    const slot = document.getElementById('panel');
    if (!a) { slot.innerHTML = ''; return; }

    slot.innerHTML = `
      <article class="card help-panel">
        <header class="help-panel-head">
          <div>
            <span class="chip chip-accent">${App.escapeHtml(a.skill_name)}</span>
            ${a.held ? '<span class="chip chip-success">back up</span>' : ''}
            <h2 class="help-headline">${App.escapeHtml(a.headline || a.skill_name)}</h2>
          </div>
        </header>
        <ol class="help-steps" id="steps"></ol>
      </article>

      <div class="row-wrap help-footer">
        <a class="btn btn-primary" href="${retryHref()}">${window.icon('refresh')}Retry the ${App.escapeHtml(label)}</a>
        <button class="btn" id="next-area" type="button">${window.icon('arrow-right')}Next area</button>
        <a class="btn btn-ghost" href="/path?enrollment=${enrollmentId}">Your path</a>
      </div>`;

    const steps = document.getElementById('steps');
    for (const s of STEPS) steps.appendChild(stepNode(s, a));

    const next = document.getElementById('next-area');
    const another = r.areas.findIndex((x, i) => !x.held && i !== selected);
    if (another === -1) next.remove();
    else {
      next.innerHTML = `${window.icon('arrow-right')}Next: ${App.escapeHtml(r.areas[another].skill_name)}`;
      next.addEventListener('click', () => {
        selected = another;
        step = 1;
        drillRound = null;
        renderAreas();
        renderPanel();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    mountStep(a);
  }

  function stepNode(s, a) {
    const open = s.n === step;
    const li = App.el('li', { class: `help-step${open ? ' is-open' : ''}`, 'data-step': String(s.n) });
    const head = App.el('button', { class: 'help-step-head', type: 'button' },
      `<span class="help-step-n">${s.n}</span>
       <span class="help-step-title">${window.icon(s.icon)}${App.escapeHtml(s.title)}</span>
       <span class="help-step-hint small muted">${stepHint(s.n, a)}</span>`);
    head.addEventListener('click', () => {
      step = step === s.n ? 0 : s.n;
      renderPanel();
    });
    li.appendChild(head);
    const body = App.el('div', { class: 'help-step-body', 'data-body': String(s.n) });
    if (open) body.innerHTML = stepBody(s.n, a);
    li.appendChild(body);
    return li;
  }

  function stepHint(n, a) {
    if (n === 1) return `${a.correct} of ${a.asked} right on the quiz`;
    if (n === 2) return a.teach ? 'the rule, a worked example, and the trap' : 'being written';
    if (n === 3) return (a.messages || []).length ? `${a.messages.length} messages` : 'ask anything';
    const rounds = (a.drills || []).length;
    return rounds ? `${rounds} round${rounds === 1 ? '' : 's'} done` : `${App.pct(r.required)} to clear it`;
  }

  function stepBody(n, a) {
    if (n === 1) {
      return `
        ${a.diagnosis ? `<p class="help-diagnosis">${App.escapeHtml(a.diagnosis)}</p>` : ''}
        ${a.misconception ? `<p class="help-misconception">${window.icon('x-circle')}
          <span>${App.escapeHtml(a.misconception)}</span></p>` : ''}
        ${a.missed.length ? `
          <div class="help-missed">
            <div class="small" style="font-weight:600; margin-bottom:6px">From your attempt</div>
            ${a.missed.map((m) => `
              <div class="help-miss">
                <div class="help-miss-q">${App.escapeHtml(m.prompt)}</div>
                <div class="tiny muted">You put <strong>${App.escapeHtml(m.user_answer || '(blank)')}</strong>
                  &middot; answer was <strong>${App.escapeHtml(m.answer)}</strong></div>
              </div>`).join('')}
          </div>` : ''}`;
    }
    if (n === 2) {
      if (!a.teach) {
        return `<p class="small muted">Your tutor is still writing this one. The practice and the
          conversation below work now, and this will fill in.</p>`;
      }
      return `
        <p>${App.escapeHtml(a.teach.explanation)}</p>
        ${(a.teach.steps || []).length ? `<ol class="lesson-steps">${a.teach.steps
    .map((x) => `<li>${App.escapeHtml(x)}</li>`).join('')}</ol>` : ''}
        ${a.teach.worked_problem ? `
          <div class="help-worked">
            <div class="small" style="font-weight:600">Worked through</div>
            <pre class="lesson-example">${App.escapeHtml(a.teach.worked_problem)}</pre>
            <p class="small"><strong>Answer:</strong> ${App.escapeHtml(a.teach.worked_answer || '')}</p>
          </div>` : ''}
        ${a.teach.watch_for ? `<p class="help-watch">${window.icon('flag')}
          <span><strong>Watch for:</strong> ${App.escapeHtml(a.teach.watch_for)}</span></p>` : ''}`;
    }
    if (n === 3) {
      return `
        <div class="coach-panel">
          <div class="coach-head">${window.icon('brain')}<span>One step at a time</span></div>
          <div class="coach-log" id="log"></div>
          <div class="answer-row">
            <input id="say" type="text" maxlength="500" autocomplete="off"
                   placeholder="Answer, or say what is confusing">
            <button class="btn btn-primary" id="send" type="button">Send</button>
          </div>
        </div>`;
    }
    return `
      <p class="small muted">Five questions on this skill at the level you are on, none of them from
        the quiz. Get ${App.pct(r.required)} of them right and this area counts as back up.</p>
      <div id="drill"></div>
      <button class="btn btn-primary" id="start-drill" type="button">
        ${window.icon('target')}Start five questions
      </button>`;
  }

  /** Wire up whichever step is open. */
  function mountStep(a) {
    if (step === 3) mountChat(a);
    if (step === 4) {
      const start = document.getElementById('start-drill');
      if (drillRound) {
        start.remove();
        runDrill(drillRound, a);
      } else if (start) {
        start.addEventListener('click', (e) => startDrill(e.currentTarget));
      }
    }
  }

  // ── the conversation ─────────────────────────────────────────────────────
  function drawLog(messages) {
    const log = document.getElementById('log');
    if (!log) return;
    log.innerHTML = messages.map((m) => `
      <div class="coach-msg ${m.role === 'assistant' ? 'coach-tutor' : 'coach-learner'}">${App.escapeHtml(m.content)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }

  async function mountChat(a) {
    let messages = [...(a.messages || [])];
    drawLog(messages);
    const input = document.getElementById('say');
    const send = document.getElementById('send');
    if (!input || !send) return;

    async function turn(message) {
      send.disabled = true;
      if (message) {
        messages = [...messages, { role: 'user', content: message }];
        drawLog(messages);
      }
      const log = document.getElementById('log');
      const pending = App.el('div', { class: 'coach-msg coach-tutor' }, '<span class="spinner"></span>');
      if (log) { log.appendChild(pending); log.scrollTop = log.scrollHeight; }
      try {
        const res = await App.api.post(`/api/remediation/${r.id}/teach`, {
          area_index: a.index,
          message: message || '',
        });
        messages = res.messages || messages;
        a.messages = messages;
        drawLog(messages);
      } catch (err) {
        pending.remove();
        App.toast(err.message, 'error');
      }
      send.disabled = false;
      input.focus();
    }

    // The tutor speaks first, and its opening question was written with the
    // diagnosis, so the first turn costs nothing.
    if (!messages.length) await turn('');

    send.addEventListener('click', () => {
      const said = input.value.trim();
      if (!said) return;
      input.value = '';
      turn(said);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); send.click(); }
    });
  }

  // ── the drill ────────────────────────────────────────────────────────────
  async function startDrill(button) {
    const a = area();
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>Setting up five questions';
    try {
      drillRound = await App.api.post(`/api/remediation/${r.id}/drill`, { area_index: a.index });
    } catch (err) {
      App.toast(err.message, 'error');
      button.disabled = false;
      button.innerHTML = `${window.icon('target')}Start five questions`;
      return;
    }
    button.remove();
    runDrill(drillRound, a);
  }

  function runDrill(round, a) {
    const slot = document.getElementById('drill');
    if (!slot) return;
    const items = round.items;
    let at = items.findIndex((i) => !i.answered);
    if (at === -1) at = items.length;

    const stepThrough = () => {
      if (at >= items.length) return finishDrill(round, a);
      const item = items[at];
      const box = App.el('div', { class: 'card card-tight', style: 'margin-top:10px' });
      slot.innerHTML = '';
      slot.appendChild(App.el('div', { class: 'small muted', style: 'margin-bottom:6px' },
        `Question ${at + 1} of ${items.length}`));
      slot.appendChild(box);
      let askedAt = Date.now();
      Player.render(box, item, {
        label: 'Practice',
        // The coach is available here like anywhere else: this is practice, not a test.
        coach: true,
        onSubmit: async (answer) => {
          let result;
          try {
            result = await App.api.post(`/api/sessions/${round.session_id}/answer`, {
              item_id: item.id, answer, ms: Date.now() - askedAt,
            });
          } catch (err) {
            App.toast(err.message, 'error');
            return;
          }
          item.answered = true;
          Player.reveal(box, item, result, {
            nextLabel: at + 1 >= items.length ? 'See how that went' : 'Next question',
            onNext: () => { at++; stepThrough(); },
          });
        },
      });
      askedAt = Date.now();
      return undefined;
    };
    stepThrough();
  }

  async function finishDrill(round, a) {
    const slot = document.getElementById('drill');
    slot.innerHTML = '<div class="loading"><span class="spinner"></span>Scoring the round</div>';
    let result;
    try {
      result = await App.api.post(`/api/remediation/${r.id}/drill/finish`, {
        area_index: a.index,
        session_id: round.session_id,
      });
    } catch (err) {
      slot.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
      return;
    }

    // Keep the conversations already had; the server does not send them back on
    // every shape of response.
    const talkSoFar = new Map(r.areas.map((x) => [x.skill_id, x.messages]));
    r = {
      ...result.remediation,
      areas: result.remediation.areas.map((x) => ({
        ...x,
        messages: (x.messages && x.messages.length ? x.messages : talkSoFar.get(x.skill_id)) || [],
      })),
    };
    label = result.kind_label;
    drillRound = null;

    const nextArea = result.next_area;
    slot.innerHTML = `
      <div class="notice ${result.held ? 'notice-success' : 'notice-warn'}">
        <strong>${result.correct} of ${result.asked} right</strong> — ${App.pct(result.accuracy)}.
        ${result.held
    ? `That clears ${App.pct(result.required)}, so this area is back up.`
    : `Still under ${App.pct(result.required)}. Another round, or talk it through in step 3.`}
        +${result.xp} XP.
      </div>
      ${result.all_held ? `<div class="notice notice-success" style="margin-top:10px">
        <strong>Every area is back up.</strong> Now is the moment to retake it.</div>` : ''}
      <div class="row-wrap" style="margin-top:10px">
        <button class="btn" id="again" type="button">${window.icon('refresh')}Another five</button>
        ${nextArea !== null && nextArea !== undefined
    ? `<button class="btn" id="go-next" type="button">${window.icon('arrow-right')}Work on
         ${App.escapeHtml(r.areas[nextArea].skill_name)}</button>` : ''}
        <a class="btn btn-primary" href="${retryHref()}">${window.icon('refresh')}Retry the ${App.escapeHtml(label)}</a>
      </div>`;

    renderAreas();
    document.getElementById('again').addEventListener('click', (e) => startDrill(e.currentTarget));
    const go = document.getElementById('go-next');
    if (go) {
      go.addEventListener('click', () => {
        selected = nextArea;
        step = 1;
        renderAreas();
        renderPanel();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  shell();

  /**
   * The tutor's reading of the failure is written while the quiz is still being
   * taken, so it is usually already here. When it is not — a learner who failed
   * fast and clicked immediately — the page is fully usable on the rule-based
   * reading and this swaps the real one in without disturbing what they are doing.
   */
  async function awaitTutor() {
    for (let attempt = 0; attempt < 24; attempt++) {
      if (r.diagnosis_source === 'ai') return;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 4000));
      let fresh;
      try {
        // eslint-disable-next-line no-await-in-loop
        fresh = await App.api.get(`/api/remediation/${enrollmentId}`);
      } catch {
        return;
      }
      if (!fresh.remediation) return;
      const better = fresh.remediation.diagnosis_source !== 'rules';
      if (!better) continue;

      const talkSoFar = new Map(r.areas.map((a) => [a.skill_id, a.messages]));
      const wasOn = area() && area().skill_id;
      r = {
        ...fresh.remediation,
        areas: fresh.remediation.areas.map((a) => ({
          ...a,
          messages: (a.messages && a.messages.length ? a.messages : talkSoFar.get(a.skill_id)) || [],
        })),
      };
      // The tutor reorders the areas worst-first; stay on the one being read.
      const moved = r.areas.findIndex((a) => a.skill_id === wasOn);
      if (moved !== -1) selected = moved;
      renderAreas();
      // Do not yank the page out from under someone mid-conversation or mid-drill.
      if (step !== 3 && step !== 4) renderPanel();
      if (r.diagnosis_source === 'ai') return;
    }
  }

  if (data.ai && r.diagnosis_source !== 'ai') awaitTutor();
});
