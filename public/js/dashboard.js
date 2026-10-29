/* The dashboard: what to do next, in priority order — finish a placement, clear a
 * checkpoint, or continue the track that is due.
 *
 * Laid out as "Measured and marked": the page opens on the one next action
 * (with its scale and the only primary button), then each subject is a row
 * with its own scale. See V2-NOTES.md.
 *
 * A catch-up (the earlier grades a learner took on before the grade they were
 * placed at) is listed under the grade it leads to, in route order, instead of
 * as unrelated courses; and a placed grade offers "Retake placement" beside its
 * Continue button. Both come from GET /api/placement/paths (one reply per enrollment). */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const root = document.getElementById('root');
  const data = await App.api.get('/api/progress');

  // Which levels of which courses have a generated base lesson, so a lesson button
  // can open the page rather than the adaptive session.
  //
  // This came from the server's list rather than from a guess, and the same route
  // that lists the enrollments sends it — so the dashboard and the path page
  // cannot disagree about whether a page exists for a level. Asking the list also
  // handles the account that may not see generated lessons at all: the field comes
  // back empty, which is the same answer as "none exist" and needs no branch.
  //
  // The ids are nested on an enrollment as `track.id` and `grade.id`, not flat,
  // because the view groups them that way. Reading `e.track_id` here would be
  // `undefined` for every card and the lookup would quietly find nothing.
  const baseLessons = data.base_lessons || {};
  const hasBaseLesson = (e, at) => !!(baseLessons[e.track.id]
    && baseLessons[e.track.id][e.grade.id]
    && baseLessons[e.track.id][e.grade.id].includes(at));
  const baseHref = (e, at) => `/base-lesson?track=${encodeURIComponent(e.track.id)}`
    + `&grade=${encodeURIComponent(e.grade.id)}&level=${at}&enrollment=${e.id}`;

  if (!data.enrollments.length) {
    root.innerHTML = `
      <div class="empty-state">
        <h1>Pick your first subject</h1>
        <p>Choose what you want to learn and the level you are aiming at. A placement quiz sets your starting point.</p>
        <a class="btn btn-primary btn-lg" href="/onboarding">Choose subjects</a>
        ${data.profile && !data.profile.took_style_quiz
          ? '<p style="margin-top:14px"><a class="btn btn-text" href="/style-quiz?next=/survey%3Fnext=/onboarding">First, take the learning-style and interests quiz</a></p>'
          : '<p style="margin-top:14px" id="survey-step" hidden><a class="btn btn-text" href="/survey?next=/onboarding">First, tell us your interests</a></p>'}
        ${user.id === 6689 ? '<p style="margin-top:14px"><a class="btn btn-text" href="/spanish-check">Open Spanish progress (take the daily test before any Spanish)</a> <a class="btn btn-text" href="/spanish-listening">Spanish listening test</a></p>' : ''}
      </div>`;
    // The interests survey is the step after the quiz; the dashboard data does not
    // say whether it was filled in, the profile does.
    const surveyStep = document.getElementById('survey-step');
    if (surveyStep) {
      App.api.get('/api/profile')
        .then((p) => { if (!p.survey_answered) surveyStep.hidden = false; })
        .catch(() => {});
    }
    return;
  }

  // The level(s) a past session was worked at, as the server counted them from
  // the answers — not the level the learner was moved on to when it closed.
  function recentLevels(s) {
    const levels = (s.levels && s.levels.length ? s.levels : [s.level]).filter((l) => l);
    if (!levels.length) return '';
    return levels.length > 1
      ? `, levels ${levels[0]}&ndash;${levels[levels.length - 1]}`
      : `, level ${levels[0]}`;
  }

  const esc = App.escapeHtml;
  const forName = (e) => `<span class="visually-hidden"> for ${esc(e.track.name)}, ${esc(App.gradeLabel(e.grade.name))}</span>`;

  /**
   * What an enrollment's next step is: where it goes and what it is called.
   * The decisions are the ones the dashboard always made (placement, then a
   * checkpoint, then a lesson's generated page or the adaptive session).
   */
  function nextStep(e) {
    const pending = e.status === 'placement_pending';
    const graduated = e.status === 'graduated';
    const kind = e.level_kind;
    // The server decides whether this level can fail, and says so on the
    // enrollment as `is_checkpoint`. This list used to be written here and left
    // out `essay`, so an English learner standing on a written Master saw a plain
    // lesson card with no button to take it — a bug the dashboard had and no
    // other page shared.
    const checkpoint = e.is_checkpoint ? kind : null;
    const cooling = checkpoint && e.checkpoint_retry_at && Date.parse(e.checkpoint_retry_at) > Date.now();
    if (pending) return { href: `/placement?enrollment=${e.id}`, label: 'Take the placement quiz', short: 'Take placement', pending, kind };
    if (graduated) return { href: `/path?enrollment=${e.id}`, label: 'View track', short: 'View track', graduated, kind };
    // A Final held for consolidation: the session route would refuse it, so the
    // card offers the day's review (or says it is done), as the path does.
    const held = stretches.get(e.id);
    if (held) {
      return held.review && held.review.due
        ? { href: `/review?enrollment=${e.id}`, label: 'Today\'s review', short: 'Today\'s review', held, kind }
        : { href: `/path?enrollment=${e.id}`, label: 'View path', short: 'View path', held, reviewDone: true, kind };
    }
    if (checkpoint) {
      return cooling
        ? { href: `/path?enrollment=${e.id}`, label: `Retry available ${App.timeAgo(e.checkpoint_retry_at).replace(' ago', '')} from now`, short: 'View path', checkpoint, cooling, kind }
        : { href: `/session?enrollment=${e.id}`, label: `Take the ${App.levelName(checkpoint)}`, short: `Take the ${App.levelName(checkpoint)}`, checkpoint, kind };
    }
    if (kind === 'lesson') {
      // A lesson with a generated page opens on that page. The dashboard was the
      // last place still sending this to the adaptive session, so the obvious
      // button on the first screen after signing in served an ordinary lesson
      // while a generated one sat there unused — the same fault the path page had,
      // in a second place, which is what happens when one decision is made in two.
      return {
        href: hasBaseLesson(e, e.current_level) ? baseHref(e, e.current_level) : `/session?enrollment=${e.id}`,
        label: `Start lesson ${e.current_level}`, short: 'Continue', kind,
      };
    }
    return { href: `/session?enrollment=${e.id}`, label: `Start level ${e.current_level}`, short: 'Continue', kind };
  }

  // How each grade's placement and catch-up stand.
  // One batched call for every enrollment (GET /api/placement/paths); if it
  // fails, each grade simply draws without its reply, as before.
  const planReplies = new Map();
  try {
    const all = await App.api.get('/api/placement/paths');
    for (const e of data.enrollments) if (all && all[e.id]) planReplies.set(e.id, all[e.id]);
  } catch { /* drawn without them */ }
  const routeOf = (e) => {
    const r = (planReplies.get(e.id) || {}).catch_up_route;
    return r && r.grade_id === e.grade.id ? r : null;
  };
  // A Final waiting behind consolidation (ADAPT_CONSOLIDATE; /api/consolidation
  // answers 404 while it is off, and null for the owner's account): asked only
  // for an enrollment standing on its Graduation exam.
  const stretches = new Map();
  await Promise.all(data.enrollments
    .filter((e) => e.status === 'active' && e.is_checkpoint && e.level_kind === 'graduation')
    .map(async (e) => {
      try {
        const r = await App.api.get(`/api/consolidation/${e.id}`);
        if (r && r.consolidation && r.consolidation.active) stretches.set(e.id, r.consolidation);
      } catch { /* drawn as before */ }
    }));
  /** The held Final's line: its day, and the date it opens by (the server's label, the same one the path and the session page show). */
  const heldLine = (c, { doneNote = true } = {}) => `Before the Final: a short review each day until this grade will last. Day <span class="num">${c.day}</span> of at most <span class="num">${c.days}</span>; the Final opens by ${esc(c.opens_label || '')}, or sooner.${doneNote && c.review && !c.review.due ? ' Today\'s review is done.' : ''}`;
  const canRetake = (e) => {
    const p = (planReplies.get(e.id) || {}).placement;
    return !!(p && p.retake_available) && e.status !== 'graduated' && e.status !== 'placement_pending';
  };
  // Catch-up enrollments, by the grade they lead to: each is listed under that
  // grade, in the route's order, not among the subjects.
  const childOf = new Map();
  for (const e of data.enrollments) {
    const route = routeOf(e);
    if (!route) continue;
    (route.steps || []).forEach((step, i, all) => {
      const own = step.enrollment_id && step.enrollment_id !== e.id
        ? data.enrollments.find((x) => x.id === step.enrollment_id) : null;
      if (own && !childOf.has(own.id)) childOf.set(own.id, { main: e, step, index: i + 1, total: all.length, e: own });
    });
  }
  const childrenOf = (main) => [...childOf.values()].filter((c) => c.main.id === main.id)
    .sort((a, b) => a.index - b.index);

  const ordered = [...data.enrollments].filter((e) => !childOf.has(e.id)).sort((a, b) => {
    // A checkpoint a learner is standing on sorts first, because it is the thing
    // they have to do; the flag is the server's, for the same reason as the card
    // above.
    const rank = (e) => (e.status === 'placement_pending' ? 0
      : e.is_checkpoint ? 1
        : e.status === 'graduated' ? 3 : 2);
    return rank(a) - rank(b);
  });

  // The thing to do next is the top of that order. Its level's own title and the
  // checkpoints on its scale come from the path, asked for this one subject only.
  // The route says where to go: while a catch-up is under way, its first step
  // not yet done is the next thing, ahead of the grade it leads to.
  let lead = ordered[0];
  const leadRoute = routeOf(lead);
  const firstStep = leadRoute && leadRoute.status === 'accepted'
    ? (leadRoute.steps || []).find((st) => st.status !== 'done' && st.enrollment_id && childOf.has(st.enrollment_id)) : null;
  if (firstStep) lead = childOf.get(firstStep.enrollment_id).e;
  let leadPath = null;
  if (lead.status !== 'placement_pending') {
    try { leadPath = await App.api.get(`/api/path/${lead.id}?view=ticks`); } catch { leadPath = null; }
  }

  function rowScale(e, compact) {
    const total = e.grade.pathLength;
    const ticks = compact ? [{ at: total, kind: 'grad' }] : App.checkpointTicks(leadPath && leadPath.nodes, total, e.current_level);
    return App.scale({
      from: 1, to: total, you: e.current_level, subject: e.track, compact, ticks,
      caption: compact ? '' : scaleCaption(e),
    }) + (compact ? `<span class="visually-hidden">Level ${e.current_level} of ${total}.</span>` : '');
  }

  function scaleCaption(e) {
    const next = leadPath && leadPath.checkpoints && leadPath.checkpoints.next;
    const master = next && next.master;
    return `Level ${e.current_level} of ${e.grade.pathLength}.${master && master > e.current_level ? ` Next Master quiz at level ${master}.` : ''}`;
  }

  /** "Retake placement", beside Continue; the dialog is App.retakePlacement. */
  function retakeBtn(e) {
    return canRetake(e)
      ? `<button class="btn btn-text" type="button" data-retake="${e.id}" data-track="${esc(e.track.id)}" data-grade-name="${esc(e.grade.name)}">Retake placement${forName(e)}</button>`
      : '';
  }

  function leadBlock(e) {
    const step = nextStep(e);
    const [grade, gradeSub] = App.gradeParts(e.grade.name);
    const node = leadPath && (leadPath.nodes || []).find((n) => n.level === e.current_level);
    const parts = node ? App.levelParts(node) : null;
    const progress = e.progress;
    const child = childOf.get(e.id);
    let heading;
    let detail = '';
    if (step.pending) {
      heading = `Next: find your level in ${esc(e.track.name)}`;
      detail = `${esc(App.gradeLabel(e.grade.name))}. A placement quiz of about ten minutes finds where you start.`;
    } else if (step.graduated) {
      heading = `You graduated ${esc(e.track.name)}, ${esc(grade)}`;
    } else if (step.held) {
      heading = step.reviewDone ? 'Today\'s review is done' : 'Next: today\'s review, before the Final';
      detail = heldLine(step.held, { doneNote: false });
    } else if (step.checkpoint) {
      heading = `Next: the ${esc(App.levelName(step.checkpoint))} at level ${e.current_level}`;
      detail = 'It covers everything up to here. Pass it to go on.';
    } else {
      const title = parts && parts.title ? `, ${esc(parts.title)}` : '';
      heading = `Next: ${step.kind === 'lesson' ? 'lesson' : 'level'} ${e.current_level}${title}`;
      // Spanish Grades 1-2 play as Duolingo-style activities (/spanish/learn,
      // services/spanish/path.js), so a question count says nothing there.
      if (e.track.id === 'spanish' && ['entry', 'intermediate'].includes(e.grade.id)) detail = 'Listening, speaking and word activities with audio.';
      else if (progress) detail = `${progress.items} of ${progress.required.minItems} questions answered at this level.`;
    }
    // A catch-up grade says where it sits in the route.
    if (child) {
      const where = `Catch-up ${child.index} of ${child.total}, then ${esc(App.gradeParts(child.main.grade.name)[0])}.`;
      detail = detail ? `${where} ${detail}` : where;
    }
    return `
      <section class="dash-next" data-subject="${esc(e.track.id)}" aria-labelledby="next-heading">
        <div class="next-meta">${App.symbol(e.track)}<span><b>${esc(e.track.name)}</b>, ${esc(grade)}${gradeSub ? `, ${esc(gradeSub)}` : ''}</span></div>
        <h1 id="next-heading">${heading}</h1>
        ${detail ? `<p class="next-detail">${detail}</p>` : ''}
        ${step.pending ? '' : rowScale(e, false)}
        <div class="next-actions">
          <a class="btn ${step.cooling || step.graduated ? '' : 'btn-primary '}btn-lg" href="${step.href}">${esc(step.label)}${forName(e)}</a>
          <a class="btn btn-text" href="/path?enrollment=${e.id}">See the whole path${forName(e)}</a>
          ${retakeBtn(e)}
        </div>
      </section>`;
  }

  // One subject, as a row with its own scale (kept under its old name).
  function enrollmentCard(e) {
    const step = nextStep(e);
    const [grade, gradeSub] = App.gradeParts(e.grade.name);
    const note = step.held ? heldLine(step.held)
      : step.checkpoint && !step.cooling
        ? `Level ${e.current_level} is the ${esc(App.levelName(step.checkpoint))}. Pass it to continue.`
        : '';
    return `
      <div class="subject-row${step.pending ? ' is-pending' : ''}" data-subject="${esc(e.track.id)}">
        ${App.symbol(e.track)}
        <div class="who">
          <b><a href="/path?enrollment=${e.id}">${esc(e.track.name)}</a></b>
          <span>${esc(grade)}${gradeSub ? `, ${esc(gradeSub)}` : ''}</span>
        </div>
        ${step.pending
          ? '<span class="scale-placeholder">Not placed yet</span>'
          : rowScale(e, true)}
        <div class="row-act">
          <a class="btn btn-text" href="${step.href}">${esc(step.short)}${forName(e)}</a>
          ${retakeBtn(e)}
        </div>
        ${note ? `<div class="row-note">${note}</div>` : ''}
        ${step.graduated ? '' : planSlot(e)}
      </div>`;
  }

  /** What the plan skips and the catch-up under way, from the reply already fetched. */
  function planSlot(e) {
    const reply = planReplies.get(e.id);
    const line = reply ? planLine(reply.summary || reply, routeOf(e)) : '';
    return `<div class="small plan-line row-note" data-plan="${e.id}"${line ? '' : ' hidden'}>${line}</div>`;
  }

  /** A catch-up grade, one line under the grade it leads to. */
  function catchUpRow(c) {
    const e = c.e;
    const step = nextStep(e);
    const [grade] = App.gradeParts(e.grade.name);
    const done = c.step.status === 'done';
    const meta = `${c.step.unit_count} unit${c.step.unit_count === 1 ? '' : 's'}${c.step.minutes ? `, about ${c.step.minutes < 90 ? `${c.step.minutes} min` : `${Math.round(c.step.minutes / 30) / 2} hours`}` : ''}`;
    return `
      <div class="subject-row is-catchup" data-subject="${esc(e.track.id)}">
        <div class="who">
          <span class="step-no">Catch-up ${c.index} of ${c.total}</span>
          <b><a href="/path?enrollment=${e.id}">${esc(grade)}</a></b>
          <span>${done ? 'Done' : esc(meta)}</span>
        </div>
        ${step.pending ? '<span class="scale-placeholder">Not placed yet</span>' : rowScale(e, true)}
        <div class="row-act">
          <a class="btn btn-text" href="${done ? `/path?enrollment=${e.id}` : step.href}">${done ? 'Review' : esc(step.short)}${forName(e)}</a>
        </div>
      </div>`;
  }

  /** A subject's row, with its catch-up grades listed beneath it in route order. */
  function subjectGroup(e) {
    const kids = childrenOf(e);
    if (!kids.length) return enrollmentCard(e);
    const [main] = App.gradeParts(e.grade.name);
    return `
      <div class="subject-group has-catchup" data-subject="${esc(e.track.id)}">
        ${enrollmentCard(e)}
        <div class="catchup-rows" role="group" aria-label="Catch-up before ${esc(main)}, in order">${kids.map(catchUpRow).join('')}</div>
      </div>`;
  }

  // Track names for the recent-sessions table, from the learner's own subjects.
  const trackName = (id) => {
    const own = data.enrollments.find((e) => e.track.id === id);
    return own ? own.track.name : String(id || '').replace(/_/g, ' ');
  };
  const KIND_NAME = { placement: 'Placement', session: 'Session', checkpoint: 'Checkpoint', skip: 'Challenge exam', lesson: 'Lesson', spanish: 'Activities' };
  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((day - then) / 86400000);
    if (days === 0) return `Today ${time}`;
    if (days === 1) return `Yesterday ${time}`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function score(s) {
    if (s.score === null || s.score === undefined) return '<span class="muted">not scored</span>';
    if (s.answered) return `${Math.round(s.score * s.answered)} / ${s.answered}`;
    return App.pct(s.score);
  }

  // The streak and XP can be hidden by the learner or a parent (user.hide_stats; UX_HIDE_STATS).
  const hideStats = !!user.hide_stats;
  const streak = hideStats ? 0 : (Number(user.streak) || 0);

  /** What the preferences quiz does, said without promising that teaching to a style works (UX_STYLE_COPY). */
  function styleCopy() {
    if (App.ux.style_copy === false) {
      return 'Twenty quick choices, about two minutes. It sets your session length, the mix of question formats, and how much explanation you get.';
    }
    return 'Twenty quick choices, about two minutes. They set a starting session length, when feedback shows and how much explanation you get. '
      + 'They do not decide how you are taught: research finds that matching teaching to a learning style does not raise scores, so what you do in sessions counts for more.';
  }

  /* "When will you study next?" (UX_NEXT_STUDY_PLANNER). Planning a specific day and time
   * makes people more likely to follow through (Milkman et al. 2011; Lally et al. 2010).
   * It is the learner's own note, kept in the app. It sends no email, push or message to
   * anyone, whatever the age; the calendar file is something the learner chooses to
   * download for their own calendar, and it is not offered on a child account. */
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  let plan = user.next_study || null;
  const planAt = (p) => { const [y, m, d] = p.date.split('-').map(Number); const [h, mi] = p.time.split(':').map(Number); return new Date(y, m - 1, d, h, mi); };
  function plannerBody() {
    const future = plan && planAt(plan).getTime() > Date.now() ? plan : null;
    const label = future ? planAt(future).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);
    const isChild = user.under_13 || user.audience === 'kids' || user.account_type === 'child';
    return `
      ${future ? `<p class="planner-set"><strong>${esc(label)}</strong></p>` : `<p>${plan ? 'The time you planned has passed. ' : ''}Pick a day and time. Choosing a specific time makes you more likely to come back. It stays in this app: nothing is sent to anyone.</p>`}
      <form class="planner-form" data-planner-form novalidate>
        <label class="field"><span>Day</span><input type="date" name="date" required min="${ymd(today)}" max="${ymd(last)}" value="${future ? future.date : ymd(today)}"></label>
        <label class="field"><span>Time</span><input type="time" name="time" required value="${future ? future.time : '17:00'}"></label>
        <div class="planner-actions">
          <button class="btn btn-sm" type="submit">${future ? 'Change' : 'Save plan'}</button>
          ${future ? '<button class="btn-text" type="button" data-planner-clear>Clear</button>' : ''}
          ${future && !isChild ? '<button class="btn-text" type="button" data-planner-ics>Add to my calendar</button>' : ''}
        </div>
      </form>`;
  }
  function plannerSection() {
    if (!App.ux.next_study_planner) return '';
    return `<section id="planner"><h2>When will you study next?</h2><div data-planner-body>${plannerBody()}</div></section>`;
  }
  function icsFile(p) {
    const start = planAt(p);
    const stamp = (d) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;
    const end = new Date(start.getTime() + 20 * 60000);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Savant//Study plan//EN', 'BEGIN:VEVENT',
      `UID:study-${stamp(start)}@savant`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      'SUMMARY:Study session', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  root.innerHTML = `
    <div class="dash">
      ${leadBlock(lead)}

      <div class="dash-main">
        <h2>Your subjects</h2>
        <div class="subject-rows">${ordered.map((e) => subjectGroup(e)).join('')}</div>
        <a class="btn btn-text add-subject" href="/onboarding">Add a subject</a>
        <div id="tutor-host"></div>

        ${data.recent.length ? `
          <h2 class="section-title">Recent sessions</h2>
          <div class="table-scroll" tabindex="0" role="region" aria-label="Recent sessions"><table class="data recent-table">
            <thead><tr><th>When</th><th>Subject</th><th>Type</th><th class="n">Score</th>${hideStats ? '' : '<th class="n">XP</th>'}</tr></thead>
            <tbody>
              ${data.recent.map((s) => `
                <tr>
                  <td class="nowrap">${when(s.ended_at)}</td>
                  <td>${esc(trackName(s.track_id))}${s.kind === 'placement' ? '' : recentLevels(s)}</td>
                  <td>${esc(KIND_NAME[s.kind] || String(s.kind || '').replace(/^./, (c) => c.toUpperCase()))}</td>
                  <td class="n nowrap">${score(s)}</td>
                  ${hideStats ? '' : `<td class="n">${s.xp || 0}</td>`}
                </tr>`).join('')}
            </tbody>
          </table></div>` : ''}
      </div>

      <aside class="dash-aside" aria-label="More">
        ${data.due.length ? `
          <section>
            <h2>Due for review</h2>
            <p>Weakest first. They are mixed into your next session.</p>
            <ul class="due-list">
              ${data.due.map((d) => `<li><span>${esc(d.name)}</span><span class="num">${App.pct(d.mastery)}</span></li>`).join('')}
            </ul>
          </section>` : ''}

        ${streak ? `
          <section>
            <h2>${streak} day${streak === 1 ? '' : 's'} in a row</h2>
            <div class="streak-marks" aria-hidden="true">${Array.from({ length: Math.min(7, streak) }, () => window.mark('tick', 'mark-plain')).join('')}</div>
          </section>` : ''}

        ${plannerSection()}

        ${!data.profile.took_style_quiz ? `
          <section>
            <h2>Your preferences</h2>
            <p>${styleCopy()}</p>
            <a class="btn btn-text" href="/style-quiz?next=/dashboard">Take the learning-style quiz</a>
          </section>` : ''}

        ${data.profile.traits.length ? `
          <section>
            <h2>What the tutor has noticed</h2>
            <ul class="small" style="margin:0; padding-left:18px">
              ${data.profile.traits.map((t) => `<li>${esc(t)}</li>`).join('')}
            </ul>
            <p class="tiny muted" style="margin:10px 0 0">From ${data.profile.evidence_count} analyzed session${data.profile.evidence_count === 1 ? '' : 's'}. <a href="/profile">See your full profile</a>.</p>
          </section>` : ''}

        ${user.id === 6689 ? `
          <section>
            <h2>Spanish progress</h2>
            <p class="small muted">The daily, timed Spanish check and its progress chart.</p>
            <a class="btn btn-text" href="/spanish-check">Open Spanish progress</a>
            <a class="btn btn-text" href="/spanish-listening">Spanish listening test</a>
          </section>` : ''}

        ${user.is_admin ? `
          <section>
            <p class="ai-status">${data.ai_enabled
              ? `Admin note: the AI tutor is on${data.ai_provider ? ` (${esc(data.ai_provider)})` : ''}.`
              : 'Admin note: running on the built-in question bank; the AI coach and analysis are off.'}</p>
          </section>` : ''}
      </aside>
    </div>`;

  // Retake placement asks first (App.retakePlacement), then opens the placement page.
  App.bindRetake(root);

  // The planner's form, clear and calendar-file buttons.
  // The persistent tutor (services/tutor.js): the same one that helps inside a question.
  if (window.TutorChat) window.TutorChat.mount(root.querySelector('#tutor-host'), { where: 'home' });

  // Reviews due in the learner's own courses (services/material-study.js). Quiet if none or on any error.
  fetch('/api/materials/review-due', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    const aside = root.querySelector('.dash-aside');
    if (!aside || !d || !d.total) return;
    const sec = document.createElement('section');
    sec.setAttribute('data-material-due', '');
    sec.innerHTML = `<h2>Your own material</h2>
      <p><span class="num">${d.total}</span> skill${d.total === 1 ? ' is' : 's are'} due for review.</p>
      <ul class="due-list">${d.materials.map((m) => `<li><a href="/my-material-study?id=${encodeURIComponent(m.material_id)}">${esc(m.title)}</a><span class="num">${m.due_count}</span></li>`).join('')}</ul>`;
    aside.insertBefore(sec, aside.firstChild);
  }).catch(() => {});

  const plannerHost = root.querySelector('[data-planner-body]');
  if (plannerHost) {
    const redraw = () => { plannerHost.innerHTML = plannerBody(); };
    plannerHost.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const date = form.elements.date.value;
      const time = form.elements.time.value;
      if (!date || !time) { App.toast('Pick a day and a time first.', 'error'); return; }
      try {
        const out = await App.api.post('/api/prefs', { next_study: { date, time } });
        plan = out.user.next_study;
        redraw();
        App.announce('Planned.');
        const first = plannerHost.querySelector('.planner-set');
        if (first) { first.setAttribute('tabindex', '-1'); first.focus(); }
      } catch (err) { App.toast(err.message, 'error'); }
    });
    plannerHost.addEventListener('click', async (event) => {
      if (event.target.closest('[data-planner-clear]')) {
        try { await App.api.post('/api/prefs', { next_study: null }); plan = null; redraw(); App.announce('Plan cleared.'); } catch (err) { App.toast(err.message, 'error'); }
      } else if (event.target.closest('[data-planner-ics]') && plan) {
        const url = URL.createObjectURL(new Blob([icsFile(plan)], { type: 'text/calendar' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'study-session.ics';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
  }

  /** "Skipping 9 of 16 units, 7 to learn", plus a catch-up the learner took. */
  function planLine(plan, route) {
    if (!plan) return '';
    const count = (status) => {
      const v = plan[status];
      if (Array.isArray(v)) return v.length;
      if (v && typeof v === 'object') return Number(v.count) || (v.units || v.titles || []).length;
      if (Number.isFinite(Number(v)) && v !== null) return Number(v);
      return (plan.units || []).filter((u) => u && u.status === status).length;
    };
    const proved = count('known');
    // Units before the start still waiting on the quick check are not ahead of
    // the learner, so they are not counted as to learn.
    const placed = Number(plan.placed_unit) || 0;
    const checking = (plan.units || []).filter((u) => u && u.status === 'unseen' && placed && u.unit < placed).length;
    const left = count('learn') + count('unseen') - checking;
    const done = count('done');
    // Units no check has settled stay on the path but are not "to learn" yet.
    const unchecked = count('unchecked');
    const total = proved + left + done + checking + unchecked;
    // The path steps over both, so both count as skipped.
    const known = proved + checking;
    const parts = [];
    const notChecked = unchecked ? `, ${unchecked} not checked yet` : '';
    if (total && known) {
      parts.push(`Skipping ${known} of ${total} unit${total === 1 ? '' : 's'}, ${left} to learn${notChecked}`);
    } else if (unchecked) {
      parts.push(`${left} unit${left === 1 ? '' : 's'} to learn${notChecked}`);
    }
    // The catch-up under way is listed beneath this row; this says what it is.
    if (route && route.status === 'accepted') parts.push(esc(App.noDash(route.headline)));
    else if (route && route.status === 'done') parts.push('Caught up. Start here.');
    // An offer not yet answered is left to the path page, and a declined one is
    // never mentioned again: the dashboard is not the place to keep asking.
    return parts.map((p) => `<span class="plan-item">${p}</span>`).join('');
  }
});
