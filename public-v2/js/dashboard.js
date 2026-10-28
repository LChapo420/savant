/* The dashboard: what to do next, in priority order — finish a placement, clear a
 * checkpoint, or continue the track that is due.
 *
 * Laid out as "Measured and marked": the page opens on the one next action
 * (with its scale and the only primary button), then each subject is a row
 * with its own scale. See V2-NOTES.md. */
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
      </div>`;
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

  const ordered = [...data.enrollments].sort((a, b) => {
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
  const lead = ordered[0];
  let leadPath = null;
  if (lead.status !== 'placement_pending') {
    try { leadPath = await App.api.get(`/api/path/${lead.id}`); } catch { leadPath = null; }
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

  function leadBlock(e) {
    const step = nextStep(e);
    const [grade, gradeSub] = App.gradeParts(e.grade.name);
    const node = leadPath && (leadPath.nodes || []).find((n) => n.level === e.current_level);
    const parts = node ? App.levelParts(node) : null;
    const progress = e.progress;
    let heading;
    let detail = '';
    if (step.pending) {
      heading = `Next: find your level in ${esc(e.track.name)}`;
      detail = `${esc(App.gradeLabel(e.grade.name))}. A placement quiz of about ten minutes finds where you start.`;
    } else if (step.graduated) {
      heading = `You graduated ${esc(e.track.name)}, ${esc(grade)}`;
    } else if (step.checkpoint) {
      heading = `Next: the ${esc(App.levelName(step.checkpoint))} at level ${e.current_level}`;
      detail = 'It covers everything up to here. Pass it to go on.';
    } else {
      const title = parts && parts.title ? `, ${esc(parts.title)}` : '';
      heading = `Next: ${step.kind === 'lesson' ? 'lesson' : 'level'} ${e.current_level}${title}`;
      if (progress) detail = `${progress.items} of ${progress.required.minItems} questions answered at this level.`;
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
        </div>
      </section>`;
  }

  // One subject, as a row with its own scale (kept under its old name).
  function enrollmentCard(e) {
    const step = nextStep(e);
    const [grade, gradeSub] = App.gradeParts(e.grade.name);
    const note = step.checkpoint && !step.cooling
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
        </div>
        ${note ? `<div class="row-note">${note}</div>` : ''}
        ${step.graduated ? '' : `<div class="small plan-line row-note" data-plan="${e.id}" hidden></div>`}
      </div>`;
  }

  // Track names for the recent-sessions table, from the learner's own subjects.
  const trackName = (id) => {
    const own = data.enrollments.find((e) => e.track.id === id);
    return own ? own.track.name : String(id || '').replace(/_/g, ' ');
  };
  const KIND_NAME = { placement: 'Placement', session: 'Session', checkpoint: 'Checkpoint', skip: 'Challenge exam', lesson: 'Lesson' };
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

  const streak = Number(user.streak) || 0;

  root.innerHTML = `
    <div class="dash">
      ${leadBlock(lead)}

      <div class="dash-main">
        <h2>Your subjects</h2>
        <div class="subject-rows">${ordered.map((e, i) => enrollmentCard(e, i)).join('')}</div>
        <a class="btn btn-text add-subject" href="/onboarding">Add a subject</a>

        ${data.recent.length ? `
          <h2 class="section-title">Recent sessions</h2>
          <div class="table-scroll"><table class="data recent-table">
            <thead><tr><th>When</th><th>Subject</th><th>Type</th><th class="n">Score</th><th class="n">XP</th></tr></thead>
            <tbody>
              ${data.recent.map((s) => `
                <tr>
                  <td class="nowrap">${when(s.ended_at)}</td>
                  <td>${esc(trackName(s.track_id))}${s.kind === 'placement' ? '' : recentLevels(s)}</td>
                  <td>${esc(KIND_NAME[s.kind] || String(s.kind || '').replace(/^./, (c) => c.toUpperCase()))}</td>
                  <td class="n nowrap">${score(s)}</td>
                  <td class="n">${s.xp || 0}</td>
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

        ${!data.profile.took_style_quiz ? `
          <section>
            <h2>How you learn</h2>
            <p>Twenty quick choices, about two minutes. It sets your session length, the mix of question formats, and how much explanation you get.</p>
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

        ${user.is_admin ? `
          <section>
            <p class="ai-status">${data.ai_enabled
              ? `Admin note: the AI tutor is on${data.ai_provider ? ` (${esc(data.ai_provider)})` : ''}.`
              : 'Admin note: running on the built-in question bank; the AI coach and analysis are off.'}</p>
          </section>` : ''}
      </aside>
    </div>`;

  // What each placed subject's path skips, filled in after the page is drawn so a
  // slow or missing plan never holds up the dashboard. A subject without a plan
  // keeps its line hidden.
  root.querySelectorAll('[data-plan]').forEach(async (slot) => {
    let plan;
    try {
      const reply = await App.api.get(`/api/placement/path/${slot.dataset.plan}`);
      plan = reply && (reply.summary || reply);
    } catch (err) {
      return;
    }
    const line = planLine(plan);
    if (!line) return;
    slot.innerHTML = line;
    slot.hidden = false;
  });

  // The catch-up grade's name, from the learner's own enrollment in it (the
  // offer itself carries only the grade's id).
  function gradeNameOf(c) {
    const own = data.enrollments.find((e) => e.id === c.enrollment_id);
    return App.gradeLabel(c.grade_name || (own && own.grade.name) || String(c.grade_id || '').replace(/_/g, ' '));
  }

  /** "Skipping 9 of 16 units, 7 to learn", plus a catch-up the learner took. */
  function planLine(plan) {
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
    for (const c of plan.catch_up || []) {
      if (!c || c.status !== 'accepted' || !c.enrollment_id) continue;
      const n = (c.unit_keys || []).length;
      parts.push(`<a href="/path?enrollment=${c.enrollment_id}">Catch-up first: ${n ? `${n} unit${n === 1 ? '' : 's'} of ` : ''}${esc(gradeNameOf(c))}</a>`);
    }
    // An offer not yet answered is left to the path page, and a declined one is
    // never mentioned again: the dashboard is not the place to keep asking.
    return parts.map((p) => `<span class="plan-item">${p}</span>`).join('');
  }
});
