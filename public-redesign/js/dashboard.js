/* The dashboard: what to do next, in priority order — finish a placement, clear a
 * checkpoint, or continue the track that is due. */
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
      <div class="card empty-state">
        <div class="empty-ic">${window.icon('compass')}</div>
        <h1>Pick your first subject</h1>
        <p>Choose what you want to learn and the level you are aiming at. A placement quiz sets your starting point.</p>
        <a class="btn btn-primary btn-lg" href="/onboarding">Choose subjects</a>
      </div>`;
    return;
  }

  function enrollmentCard(e, i) {
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
    const progress = e.progress;
    const share = progress ? Math.min(1, progress.average) : 0;

    let action;
    if (pending) {
      action = `<a class="btn btn-primary" href="/placement?enrollment=${e.id}">${window.icon('target')}Take the placement quiz</a>`;
    } else if (graduated) {
      action = `<a class="btn" href="/path?enrollment=${e.id}">${window.icon('award')}View track</a>`;
    } else if (checkpoint) {
      action = cooling
        ? `<a class="btn" href="/path?enrollment=${e.id}">${window.icon('clock')}Retry available ${App.timeAgo(e.checkpoint_retry_at).replace(' ago', '')} from now</a>`
        : `<a class="btn btn-primary" href="/session?enrollment=${e.id}">${window.icon(App.levelIcon(checkpoint))}Take the ${App.levelName(checkpoint)}</a>`;
    } else if (kind === 'lesson') {
      // A lesson with a generated page opens on that page. The dashboard was the
      // last place still sending this to the adaptive session, so the obvious
      // button on the first screen after signing in served an ordinary lesson
      // while a generated one sat there unused — the same fault the path page had,
      // in a second place, which is what happens when one decision is made in two.
      action = hasBaseLesson(e, e.current_level)
        ? `<a class="btn btn-primary" href="${baseHref(e, e.current_level)}">${window.icon('book')}Start the level ${e.current_level} lesson</a>`
        : `<a class="btn btn-primary" href="/session?enrollment=${e.id}">${window.icon('book-open')}Start the level ${e.current_level} lesson</a>`;
    } else {
      action = `<a class="btn btn-primary" href="/session?enrollment=${e.id}">${window.icon('arrow-right')}Continue level ${e.current_level}</a>`;
    }

    // The first card is the thing to do next, so it gets the room; the order is
    // the one decided below (placement, then checkpoint, then the rest).
    const lead = i === 0;
    return `
      <div class="card enroll-card${lead ? ' is-next' : ''}">
        ${lead ? '<span class="eyebrow">Up next</span>' : ''}
        <div class="card-head">
          <div class="card-title">
            <span class="track-icon" style="background:${e.track.color}1f;color:${e.track.color}">${window.icon(e.track.icon)}</span>
            <span>
              <span class="track-name">${App.escapeHtml(e.track.name)}</span>
              <span class="grade-name">${App.escapeHtml(e.grade.name)}</span>
            </span>
          </div>
          ${pending
            ? '<span class="chip chip-warn">placement due</span>'
            : graduated
              ? '<span class="chip chip-success">graduated</span>'
              : `<span class="chip ${checkpoint ? 'chip-checkpoint' : 'chip-accent'}">${App.escapeHtml(App.levelName(kind) || "Level")} ${e.current_level} of ${e.grade.pathLength}</span>`}
        </div>

        ${progress ? `
          <div class="enroll-progress">
            <span class="ring${progress.ready ? ' ring-success' : ''}" style="--p:${Math.round(share * 100)}"><span class="ring-value">${App.pct(progress.average)}</span></span>
            <div>
              <div class="small" style="font-weight:700">Mastery at level ${e.current_level}</div>
              <div class="small muted">${progress.items} of ${progress.required.minItems} questions answered</div>
              ${progress.blockers.length && !checkpoint
                ? `<div class="tiny muted" style="margin-top:4px">To advance: ${App.escapeHtml(progress.blockers.join('; '))}</div>`
                : ''}
            </div>
          </div>
        ` : '<div class="small muted">Your level is set by the placement quiz.</div>'}

        ${checkpoint ? `<div class="notice notice-warn small">
          Level ${e.current_level} is the ${App.escapeHtml(App.levelName(checkpoint))} — pass it to continue.
        </div>` : ''}

        <div class="enroll-actions">
          ${action}
          <a class="btn btn-ghost" href="/path?enrollment=${e.id}">${window.icon('layers')}View path</a>
        </div>
      </div>`;
  }

  const ordered = [...data.enrollments].sort((a, b) => {
    // A checkpoint a learner is standing on sorts first, because it is the thing
    // they have to do; the flag is the server's, for the same reason as the card
    // above.
    const rank = (e) => (e.status === 'placement_pending' ? 0
      : e.is_checkpoint ? 1
        : e.status === 'graduated' ? 3 : 2);
    return rank(a) - rank(b);
  });

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  root.innerHTML = `
    <div class="dash-head">
      <div>
        <span class="eyebrow">${App.escapeHtml(today)}</span>
        <h1>Welcome back, ${App.escapeHtml(user.display_name)}</h1>
        <p class="ai-status${data.ai_enabled ? ' is-on' : ''}">${data.ai_enabled
          ? `The AI tutor is on${data.ai_provider ? ` (${App.escapeHtml(data.ai_provider)})` : ''}: your questions, analysis, session plan, and the step-by-step coach are live.`
          : 'Running on the built-in question bank. Everything works; the AI coach and AI analysis are off.'}</p>
      </div>
      <a class="btn btn-sm" href="/onboarding">${window.icon('plus')}Add a subject</a>
    </div>

    <div class="stat-strip">
      <div class="stat-block"><span class="stat-ic is-streak">${window.icon('streak')}</span><span class="stat-text"><span class="value">${user.streak || 0}</span><span class="label">Day streak</span></span></div>
      <div class="stat-block"><span class="stat-ic is-xp">${window.icon('zap')}</span><span class="stat-text"><span class="value">${user.xp || 0}</span><span class="label">Total XP</span></span></div>
      <div class="stat-block"><span class="stat-ic">${window.icon('layers')}</span><span class="stat-text"><span class="value">${data.enrollments.length}</span><span class="label">Subjects</span></span></div>
    </div>

    <h2 class="section-title">${window.icon('layers')}Your subjects</h2>
    <div class="grid grid-2">${ordered.map((e, i) => enrollmentCard(e, i)).join('')}</div>

    ${data.due.length ? `
      <h2 class="section-title">${window.icon('clock')}Due for review</h2>
      <div class="card">
        <p class="small muted">These are scheduled to come back now, weakest first. They are mixed into your next session automatically.</p>
        <div class="row-wrap">
          ${data.due.map((d) => `<span class="chip ${d.mastery < 0.5 ? 'chip-danger' : 'chip-review'}">${App.escapeHtml(d.name)} &middot; ${App.pct(d.mastery)}</span>`).join('')}
        </div>
      </div>` : ''}

    ${!data.profile.took_style_quiz ? `
      <h2 class="section-title">${window.icon('brain')}Tune how you are taught</h2>
      <div class="card">
        <p class="small muted">Twenty forced choices, about two minutes. It sets your session length, the mix of question formats, and how much explanation you get.</p>
        <a class="btn btn-primary" href="/style-quiz?next=/dashboard">Take the learning-style quiz</a>
      </div>` : ''}

    ${data.recent.length ? `
      <h2 class="section-title">${window.icon('list')}Recent sessions</h2>
      <div class="card">
        <table class="data">
          <thead><tr><th>When</th><th>Subject</th><th>Type</th><th>Score</th><th>XP</th></tr></thead>
          <tbody>
            ${data.recent.map((s) => `
              <tr>
                <td class="nowrap">${App.timeAgo(s.ended_at)}</td>
                <td>${App.escapeHtml(s.track_id || '')}${s.level ? ` &middot; level ${s.level}` : ''}</td>
                <td>${App.escapeHtml(s.kind)}</td>
                <td>${s.score === null ? '—' : App.pct(s.score)}</td>
                <td>${s.xp || 0}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

    ${data.profile.traits.length ? `
      <h2 class="section-title">${window.icon('user')}What the tutor has noticed</h2>
      <div class="card">
        <ul class="small" style="margin:0; padding-left:18px">
          ${data.profile.traits.map((t) => `<li>${App.escapeHtml(t)}</li>`).join('')}
        </ul>
        <p class="tiny muted" style="margin:10px 0 0">From ${data.profile.evidence_count} analyzed session${data.profile.evidence_count === 1 ? '' : 's'}. <a href="/profile">See your full profile</a>.</p>
      </div>` : ''}`;
});
