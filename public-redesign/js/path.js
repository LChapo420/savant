/* The level path for one track: where you are, what is holding you at this level,
 * per-skill mastery, and the checkpoints ahead. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const root = document.getElementById('root');
  const enrollmentId = Number(App.query('enrollment'));
  if (!enrollmentId) {
    root.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  const data = await App.api.get(`/api/path/${enrollmentId}`);
  const { enrollment, track, grade, progress, nodes, skills, params, checkpoints } = data;
  // What this level is *for this learner*, which the server decides: level 25 of
  // English is an Essay and level 25 of arithmetic is a Master quiz, and the two
  // should not be described with the same words.
  const delivered = enrollment.delivered || enrollment.level_kind;
  const kindLabel = enrollment.kind_label || App.levelName(delivered) || '';
  const kind = delivered;
  // `delivered` is the kind's *name* — 'lesson', 'practice', 'master', 'essay' —
  // so it is passed as a string. It used to be passed as `{ checkpoint: delivered }`,
  // which takes the object branch of `isCheckpointLevel` and returns
  // `!!delivered` — truthy for any non-empty name. Every level was therefore read
  // as a checkpoint, and the two branches below it were unreachable: a lesson
  // offered "Take the Level" with a pass mark of 0% instead of starting the
  // lesson, and a practice level offered the same instead of starting a session.
  // A generated base lesson could not be reached from here at all, because the
  // branch that links to one never ran.
  const checkpoint = App.isCheckpointLevel(delivered) ? delivered : null;
  // A checkpoint that was taken and not passed. There is no waiting period: the
  // learner picks between retaking it on fresh questions and working on the weak
  // areas first.
  const failed = checkpoint ? data.remediation : null;
  // The Challenge Exam, once a run of clean levels has earned it. Offered here
  // rather than only on its own page, because an offer nobody sees is not an
  // offer — and the run counter is worth showing before it arrives.
  const skip = data.skip || { offered: false, run: 0, needed: 25, mark: 0.9 };

  // The next level of each kind comes from the server, as levels.
  //
  // This used to be worked out here, as `master_every * Math.ceil(current /
  // master_every)` — rounding up to a multiple of twenty-five. That is correct for
  // a grade whose layout is arithmetic and wrong for every grade that states its
  // own: for each English grade it named a level that held a lesson, so the table
  // said "Next Master quiz — level 50" about a level the learner was being taught
  // on. The page cannot disagree with the server about this any more, because it
  // no longer has an opinion.
  const nextFrom = checkpoints.next || {};
  const sayLevel = (level) => (level == null ? '—' : `level ${level}`);
  const nextMaster = nextFrom.master == null ? '—' : nextFrom.master;
  const nextGrand = nextFrom.grand == null ? '—' : nextFrom.grand;
  const nextLesson = nextFrom.lesson == null ? '—' : nextFrom.lesson;
  const pathEnd = nextFrom.end == null ? enrollment.path_length : nextFrom.end;

  // The same grades the path knows about, read once so a lesson link can be
  // offered only where one actually exists. The route answers this rather than
  // the browser guessing from a file listing: a lesson that has been generated is
  // a fact about the server, and a link that 404s is worse than no link.
  const baseLessons = data.base_lessons || {};

  function nodeRow(node) {
    const isCheckpoint = !!node.checkpoint;
    const isLesson = node.kind === 'lesson';
    // The heading is the level's own title, whatever kind it is. A course that
    // names its levels has an entry per level and the title is the only thing
    // that distinguishes "Activity 3 of 9: Echo Together" from "Activity 4 of 9:
    // Say It in Chunks" — they are the same kind of level doing different work,
    // and the app's word for that kind says nothing about which. The kind's name is
    // kept as a prefix so a reader still knows what sort of level it is.
    const named = node.level_title || node.topic;
    const kindName = node.type
      || (isLesson ? 'Lesson' : isCheckpoint ? App.levelName(node.delivered) : 'Practice');
    const label = named
      ? `Level ${node.level} — ${App.escapeHtml(kindName)}: ${App.escapeHtml(named)}`
      : `Level ${node.level} — ${App.escapeHtml(kindName)}`;
    const badge = node.state === 'done'
      ? window.icon('check')
      : node.state === 'current'
        ? window.icon('arrow-right')
        : node.reachable
          // Open to this account, not yet worked. The badge says so rather than
          // claiming the level is theirs.
          ? window.icon('book-open')
          : isCheckpoint || isLesson ? window.icon(App.levelIcon(node.delivered) || App.levelIcon(node.kind)) : String(node.level);
    // The line under the heading is what the level covers, in the words the course's
    // own author wrote. A learner reading their path is asking "what will this
    // teach me", and the skill it is filed under does not answer that where "reading
    // and spelling long a words such as rain, play, and day" does. Every level
    // carries it, not only the lessons — an Activity's coverage is what says which
    // one it is.
    const detail = node.covers
      || (isCheckpoint
        ? `Everything up to here &middot; ${App.pct(checkpoints.pass_marks[node.delivered] || checkpoints.pass_marks[node.checkpoint])} to pass`
        : `${App.escapeHtml(node.focus_name)} &middot; difficulty ${node.difficulty}`);
    // A level this account may open is marked incomplete rather than locked, and
    // the line says which it is — "Open" on a button is a command, not a state.
    const state = node.reachable
      ? '<span class="tiny" style="color:var(--warn)">incomplete</span> &middot; you can open this one'
      : '';
    // Where this level opens, decided once for the whole row.
    //
    // Every button below asks the same question — the generated page or the
    // adaptive session — and it has been answered separately in four places, which
    // is why each fix left the next one wrong: the card above, the "Learn" button,
    // the dashboard, and now "Open" and "Revisit" on a level you are not standing
    // on. A generated page existed for level 115 and "Open" still went to the
    // session, so the lesson was generated, imported, correct and unreachable from
    // the one control offered on it.
    //
    // Computed once here, so the row cannot disagree with itself.
    const opensBase = isLesson && hasBaseLesson(node.level);
    const openHref = opensBase
      ? baseHref(node.level)
      : `/session?enrollment=${enrollment.id}&level=${node.level}`;

    const actions = [];
    if (node.state === 'current') {
      actions.push(opensBase
        ? `<a class="btn btn-primary btn-sm" href="${openHref}">Learn</a>`
        : `<a class="btn btn-primary btn-sm" href="/session?enrollment=${enrollment.id}">${isLesson ? 'Learn' : isCheckpoint ? (failed ? 'Retry' : 'Take it') : 'Start'}</a>`);
    } else if (node.state === 'done') {
      // A level behind the learner, which they have already worked through.
      //
      // This used to fall through to the `locked` chip below, which was wrong
      // twice over: it said "locked" about something already done, and it hid
      // the only sensible thing to do with it. Going back over material you have
      // already met is ordinary — it is how you check something, and how a lesson
      // is re-read before a quiz covers it. The badge above already says so with a
      // tick, and this says it again in words and offers the way in.
      actions.push(`<a class="btn btn-sm" href="${openHref}">Revisit</a>`);
      actions.push(`<span class="chip">${window.icon('check')}complete</span>`);
    } else if (node.reachable) {
      // A level past where they stand, which this account is allowed to open.
      // It is not locked and it is not done either — it is incomplete, and the
      // difference is the whole point of the word.
      actions.push(`<a class="btn btn-sm" href="${openHref}">Open</a>`);
      // The one control on this page that discards work rather than doing it, so
      // it says what it will do and asks first. It is only offered on levels
      // ahead: there is nothing to jump over behind or on the current one.
      actions.push(`<button class="btn btn-sm btn-danger" type="button" data-jump="${node.level}">Skip to here</button>`);
    } else {
      actions.push(`<span class="chip">${window.icon('lock')}locked</span>`);
    }

    // There used to be a second, ghost-styled "Base lesson" link here, pointing at
    // the same page the button above now opens. It rendered exactly when the row
    // had a generated page, which is exactly when the button above already goes
    // there — so it was two links to one URL, with different labels, on the same
    // line. The row's own button carries the action now, and one control per thing
    // is the point of deciding `opensBase` once.
    return `
      <div class="node node-${node.state}${isCheckpoint ? ' node-checkpoint' : ''}${isLesson ? ' node-lesson' : ''}${node.reachable ? ' node-open' : ''}">
        <span class="badge">${badge}</span>
        <span>
          <span class="title">${label}</span>
          <span class="tiny muted detail">${detail}${state ? ` &middot; ${state}` : ''}</span>
        </span>
        <span class="spacer"></span>
        <span class="row-wrap">${actions.join('')}</span>
      </div>`;
  }

  // Whether a generated base lesson exists for a level of this course, and where
  // it lives. Asked of the server's list rather than guessed from the file system,
  // because a link that 404s is worse than no link — the route answers 404 for a
  // page that is not there, and for an account that may not see them either.
  const hasBaseLesson = (at) => !!(baseLessons[track.id]
    && baseLessons[track.id][grade.id]
    && baseLessons[track.id][grade.id].includes(at));
  const baseHref = (at) => `/base-lesson?track=${encodeURIComponent(track.id)}`
    + `&grade=${encodeURIComponent(grade.id)}&level=${at}&enrollment=${enrollment.id}`;

  const action = enrollment.status === 'graduated'
    ? `<div class="notice notice-success">You graduated this track. <a href="/onboarding">Pick the next one.</a></div>`
    : checkpoint
      ? (failed
        ? `<a class="btn btn-primary btn-lg" href="/session?enrollment=${enrollment.id}">${window.icon('refresh')}Retry the ${App.escapeHtml(kindLabel)}</a>
           <a class="btn btn-lg" href="/help?enrollment=${enrollment.id}">${window.icon('book-open')}Work on what went wrong</a>
           <span class="small muted">Attempt ${failed.attempt} scored ${App.pct(failed.accuracy)} against ${App.pct(failed.required)}. The retry is written fresh${failed.areas.length ? `; weakest was ${App.escapeHtml(failed.areas[0].skill_name)}` : ''}.</span>`
        : `<a class="btn btn-primary btn-lg" href="/session?enrollment=${enrollment.id}">${window.icon(App.levelIcon(delivered))}Take the ${App.escapeHtml(kindLabel)}</a>
           <span class="small muted">Pass mark ${App.pct(checkpoints.pass_marks[delivered] || checkpoints.pass_marks[checkpoint])}.${delivered === 'essay' ? ' A short quiz, then one piece of writing marked against a rubric.' : ''}</span>`)
      : kind === 'lesson'
        // A lesson with a generated page opens on that page, and the adaptive
        // session is offered beside it.
        //
        // The other way round — the session as the main action and the generated
        // page as a small link at the end of the row — is how this worked first,
        // and it meant the page was effectively invisible: the obvious button said
        // "Start the level 105 lesson" and served the adaptive session, so a
        // generated lesson could exist, be correct and be reachable, and a reader
        // would still report seeing no sign of it. The base page is the whole
        // lesson for this level; the session is the alternative, and it is labelled
        // as one.
        ? (hasBaseLesson(enrollment.current_level)
          ? `<a class="btn btn-primary btn-lg" href="${baseHref(enrollment.current_level)}">${window.icon('book')}Start the level ${enrollment.current_level} lesson</a>
             <a class="btn btn-lg" href="/session?enrollment=${enrollment.id}">${window.icon('layers')}Adaptive session instead</a>
             <span class="small muted">The full lesson for this level, the same for everyone on this course.</span>`
          : `<a class="btn btn-primary btn-lg" href="/session?enrollment=${enrollment.id}">${window.icon('book-open')}Start the level ${enrollment.current_level} lesson</a>
             <span class="small muted">${enrollment.lesson_ready ? 'Written for you and ready.' : 'Written for you when you open it.'}</span>`)
        : `<a class="btn btn-primary btn-lg" href="/session?enrollment=${enrollment.id}">${window.icon('arrow-right')}Start a session at level ${enrollment.current_level}</a>
         <span class="small muted">${params.itemCount} questions, about ${Math.max(3, Math.round(params.itemCount * 0.8))} minutes.</span>`;

  root.innerHTML = `
    <div class="row-between" style="margin-bottom:20px; align-items:center">
      <div class="track-heading">
        <span class="track-icon" style="background:${track.color}1f;color:${track.color}">${window.icon(track.icon)}</span>
        <div>
          <h1>${App.escapeHtml(track.name)}</h1>
          <span class="tiny">${App.escapeHtml(grade.name)} &middot; ${enrollment.path_length} levels</span>
        </div>
      </div>
      <a class="btn btn-ghost btn-sm" href="/dashboard">${window.icon('arrow-left')}<span class="btn-label">Dashboard</span></a>
    </div>

    <div class="card path-hero">
      <span class="ring ring-lg${progress.ready ? ' ring-success' : ''}" style="--p:${Math.round(Math.min(1, progress.average) * 100)}"><span class="ring-value">${App.pct(progress.average)}</span></span>
      <div>
        <span class="eyebrow">You are on</span>
        <div class="hero-title">Level ${enrollment.current_level} &middot; ${App.escapeHtml(App.levelName(delivered))}</div>
        <div class="hero-meta">
          <span><b>${App.pct(progress.average)}</b> mastery here</span>
          <span><b>${enrollment.xp}</b> track XP</span>
          <span><b>${Math.max(0, Number(pathEnd) - enrollment.current_level)}</b> levels to graduation</span>
        </div>
      </div>
      <div class="hero-body">
        ${progress.blockers.length
          ? `<div class="small muted">To move to level ${enrollment.current_level + 1}: ${App.escapeHtml(progress.blockers.join('; '))}.</div>`
          : `<div class="small" style="color:var(--success); font-weight:650">This level is complete${checkpoint ? ` — the ${App.escapeHtml(kindLabel)} is next.` : '.'}</div>`}
        <div class="hero-actions">${action}</div>
        ${enrollment.can_skip_level && enrollment.status === 'active' ? `
          <div class="row-wrap" style="margin-top:10px">
            <button class="btn btn-sm btn-ghost" id="skip-level" type="button">
              ${window.icon('arrow-right')}Skip this level
            </button>
            <span class="tiny muted">Moves you on without counting as cleared.</span>
          </div>` : ''}
      </div>
    </div>

    ${skip.offered ? `
      <div class="card" style="margin-top:14px; border-color:var(--accent)">
        <div class="row-between" style="align-items:flex-start; gap:14px">
          <div>
            <div class="card-title">${window.icon('award')}Challenge Exam unlocked</div>
            <p class="small muted" style="margin:4px 0 0">
              ${skip.run} levels in a row at ${App.pct(skip.mark)} or better.
              ${(skip.bands || [])[0] && skip.bands[0].rule === 'sprt' ? `The exam is ${skip.bands.length} bands` : 'The exam is five bands of seven'}, taken at level ${skip.from_level} and pitched at
              ${(skip.bands || []).map((b) => b.level).join(', ')} — all above where you stand.
              ${(skip.bands || [])[0] && skip.bands[0].rule === 'sprt'
    ? `The first band has ${skip.bands[0].count} questions and holds at ${skip.bands[0].needed} right; each band above it has ${(skip.bands[1] || skip.bands[0]).count} and holds with at most one miss. You skip as far as an unbroken run of held bands reaches.`
    : 'You skip as far as an unbroken run of perfect bands reaches.'}
            </p>
          </div>
          <a class="btn btn-primary btn-lg" href="/skip?enrollment=${enrollment.id}">
            ${window.icon('zap')}Take the Challenge Exam
          </a>
        </div>
      </div>` : enrollment.status === 'active' && skip.run > 0 ? `
      <div class="card card-tight" style="margin-top:14px">
        <div class="row-between">
          <span class="small">
            ${window.icon('layers')}
            <strong>${skip.run}</strong> of ${skip.needed} levels in a row at ${App.pct(skip.mark)} or better
            ${skip.best > skip.run ? `<span class="muted"> &middot; best run ${skip.best}</span>` : ''}
          </span>
          <span class="tiny muted">A Challenge Exam opens at ${skip.needed}</span>
        </div>
        <div class="meter" style="margin-top:8px"><span style="width:${Math.min(1, skip.run / skip.needed) * 100}%"></span></div>
      </div>` : ''}

    <div class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <div class="card-title">${window.icon('chart')}Skills at this level</div>
        <table class="data">
          <thead><tr><th>Skill</th><th>Mastery</th><th class="nowrap">Seen</th><th>Next review</th></tr></thead>
          <tbody>
            ${skills.map((s) => `
              <tr>
                <td>${App.escapeHtml(s.name)}
                  ${s.error_tags.length ? `<span class="tiny muted" style="display:block">${App.escapeHtml(s.error_tags.join(', ').replace(/_/g, ' '))}</span>` : ''}
                </td>
                <td style="width:32%">
                  <div class="meter ${s.mastery >= 0.8 ? 'meter-success' : s.mastery < 0.6 ? 'meter-warn' : ''}"><span style="width:${s.mastery * 100}%"></span></div>
                  <span class="tiny muted">${App.pct(s.mastery)}</span>
                </td>
                <td>${s.attempts}</td>
                <td class="tiny muted nowrap">${s.due_at ? App.timeAgo(s.due_at).replace(' ago', ' ago (due)') : 'not yet'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">${window.icon('flag')}How the path is laid out</div>
        <p class="small muted">${App.layoutSentence(checkpoints)}</p>
        <table class="data"><tbody>
          <tr><td>Next lesson</td><td class="nowrap">${sayLevel(nextFrom.lesson)}</td><td>written for you</td></tr>
          <tr><td>Next Master quiz</td><td class="nowrap">${sayLevel(nextFrom.master)}</td><td>${App.pct(checkpoints.pass_marks.master)} to pass</td></tr>
          <tr><td>Next Grand Master</td><td class="nowrap">${sayLevel(nextFrom.grand)}</td><td>${App.pct(checkpoints.pass_marks.grand)} to pass</td></tr>
          <tr><td>Graduation exam</td><td class="nowrap">${sayLevel(pathEnd)}</td><td>${App.pct(checkpoints.pass_marks.graduation)} to pass</td></tr>
        </tbody></table>
        <p class="tiny muted" style="margin:10px 0 0">${App.escapeHtml(grade.blurb)}</p>
      </div>
    </div>

    <h2 class="section-title">${window.icon('layers')}The path from here</h2>
    <div class="path">${nodes.map(nodeRow).join('')}</div>`;

  const skipLevel = document.getElementById('skip-level');
  if (skipLevel) {
    skipLevel.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>';
      try {
        const result = await App.api.post(`/api/enrollments/${enrollment.id}/skip-level`, {});
        App.toast(`Moved to level ${result.level}.`);
        window.location.reload();
      } catch (err) {
        App.toast(err.message, 'error');
        button.disabled = false;
        button.innerHTML = `${window.icon('arrow-right')}Skip this level`;
      }
    });
  }

  // One listener for every jump button on the page, found by delegation: the
  // path is a long list and re-binding each on render would be both slower and
  // easier to get wrong.
  const path = document.querySelector('.path');
  if (path) {
    path.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-jump]');
      if (!button) return;
      const level = Number(button.dataset.jump);
      const from = enrollment.current_level;
      const count = level - from;
      // Named in full before it happens. This discards everything below the
      // target and writes a hundred and thirty-nine perfect attempts for it, and
      // "are you sure" is not enough of a warning for that.
      const yes = window.confirm(
        `Skip to level ${level}?\n\n`
        + `That marks levels ${from}–${level - 1} as done at 100%, passes every checkpoint `
        + 'in between, and cannot be undone.',
      );
      if (!yes) return;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>';
      try {
        const result = await App.api.post(`/api/enrollments/${enrollment.id}/jump-to`, { level });
        App.toast(`Level ${result.level}. ${result.cleared} levels marked done, ${result.skills} skills.`);
        window.location.reload();
      } catch (err) {
        App.toast(err.message, 'error');
        button.disabled = false;
        button.textContent = 'Skip to here';
      }
    });
  }
});
