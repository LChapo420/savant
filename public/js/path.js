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

  // The unit plan is asked for beside the path, not after it: a grade without a
  // plan (no unit bank, or placed before plans existed) answers with nothing and
  // the page is drawn exactly as it always was.
  const [data, planReply] = await Promise.all([
    App.api.get(`/api/path/${enrollmentId}?view=page`),
    App.api.get(`/api/placement/path/${enrollmentId}`).catch(() => null),
  ]);
  // Today's review (staged round 3, ADAPT_REVIEW_SESSION), asked for beside the
  // path: while it is off the route answers 404 and the path is drawn as before.
  const reviewReply = App.api.get(`/api/review/${enrollmentId}`).catch(() => null);
  const plan = (planReply && (planReply.summary || planReply)) || null;
  // The same reply also says how the catch-up stands (the ordered route this
  // grade is the end of) and whether this grade's placement can be retaken.
  const catchRoute = (planReply && planReply.catch_up_route) || null;
  const placementInfo = (planReply && planReply.placement) || null;
  // Chess, piano and basketball: this stage's rows (staged skills round 3,
  // SKILL_RECORD and its parts), asked for beside the path. While it is off the
  // route answers 404 and the path is drawn as before.
  const skillReply = App.api.get(`/api/skills/path/${enrollmentId}`).catch(() => null);
  const { enrollment, track, grade, progress, nodes, skills, params, checkpoints } = data;
  const units = planUnits(plan, nodes);
  // The lessons' own titles, so an activity's " - <lesson>" tail can be
  // recognised and left off its row (it repeats the unit heading).
  const lessonTitles = new Set(nodes.filter((n) => n.kind === 'lesson').map((n) => App.cleanTitle(n.level_title || n.topic)));
  // What this level is *for this learner*, which the server decides: level 25 of
  // English is an Essay and level 25 of arithmetic is a Master quiz, and the two
  // should not be described with the same words.
  const delivered = enrollment.delivered || enrollment.level_kind;
  const kindLabel = enrollment.spoken ? 'Say-it-aloud check' : enrollment.kind_label || App.levelName(delivered) || '';
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
  // The row the learner stands on (Spanish: whether it plays as Duolingo-style activities).
  const hereNode = nodes.find((n) => n.level === enrollment.current_level) || null;
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
    // A level in a unit the learner proved they know. The path skips it, but it
    // is still theirs to open: reviewing something you know is never locked.
    const skipped = isSkipped(node);
    const isCheckpoint = !!node.checkpoint;
    const isLesson = node.kind === 'lesson';
    // The heading is the level's own title, whatever kind it is. A course that
    // names its levels has an entry per level and the title is the only thing
    // that distinguishes "Activity 3 of 9: Echo Together" from "Activity 4 of 9:
    // Say It in Chunks" — they are the same kind of level doing different work,
    // and the app's word for that kind says nothing about which. The kind's name is
    // kept as a prefix so a reader still knows what sort of level it is.
    //
    // Shown cleaned (App.levelParts): the level number sits on the rail, the
    // kind is a quiet word after the title, and the " - <lesson>" tail that
    // repeats the unit heading is dropped. The stored title is unchanged.
    const parts = App.levelParts(node, lessonTitles);
    const label = `${App.escapeHtml(parts.title)}${parts.kind ? `<span class="kind">${App.escapeHtml(parts.kind)}</span>` : ''}`;
    // The rail: the level number, with a drawn tick once it is done. The
    // current level's "You" and a checkpoint's diamond come from the CSS.
    // Spanish: a level the learner's goal put aside (services/spanish/goal-fit.js).
    // Behind them it is not done, it is saved for later, and still theirs to open.
    const setAside = !!node.deferred && !skipped && node.state !== 'current';
    const badge = `${String(node.level)}${!skipped && !setAside && node.state === 'done' ? window.mark('tick', 'mark-plain') : ''}`;
    // The line under the heading is what the level covers, in the words the course's
    // own author wrote. A learner reading their path is asking "what will this
    // teach me", and the skill it is filed under does not answer that where "reading
    // and spelling long a words such as rain, play, and day" does. Every level
    // carries it, not only the lessons — an Activity's coverage is what says which
    // one it is.
    const passMark = isCheckpoint ? App.pct(checkpoints.pass_marks[node.delivered] || checkpoints.pass_marks[node.checkpoint]) : '';
    const detail = isCheckpoint
      ? `Covers everything up to here. Pass mark <span class="num">${passMark}</span>.`
      : App.escapeHtml(node.covers || node.focus_name || '');
    // A level this account may open is marked incomplete rather than locked, and
    // the line says which it is — "Open" on a button is a command, not a state.
    const state = skipped
      ? ''
      : setAside
        ? `Saved for later by your goal (${App.escapeHtml(node.deferred)})${node.state === 'done' ? '; open it any time' : ''}`
      : node.reachable
        ? 'Not done yet; you can open it'
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
    const openHref = openHrefOf(node);

    const which = `<span class="visually-hidden"> level ${node.level}</span>`;
    const actions = [];
    if (skipped) {
      actions.push(`<a class="btn btn-sm" href="${openHref}">Review${which}</a>`);
    } else if (setAside && node.state === 'done') {
      actions.push(`<a class="btn btn-sm" href="${openHref}">Open${which}</a>`);
    } else if (node.state === 'current') {
      // Not a primary button: the one primary on this page is in the header.
      actions.push(opensBase
        ? `<a class="btn btn-sm" href="${openHref}">Learn${which}</a>`
        : `<a class="btn btn-sm" href="/session?enrollment=${enrollment.id}">${isLesson ? 'Learn' : isCheckpoint ? (failed ? 'Retry' : 'Take it') : 'Start'}${which}</a>`);
    } else if (node.state === 'done') {
      // A level behind the learner, which they have already worked through.
      //
      // This used to fall through to the `locked` chip below, which was wrong
      // twice over: it said "locked" about something already done, and it hid
      // the only sensible thing to do with it. Going back over material you have
      // already met is ordinary — it is how you check something, and how a lesson
      // is re-read before a quiz covers it. The badge above already says so with a
      // tick, and this says it again in words and offers the way in.
      // (The drawn tick on the rail says "done"; the word "complete" is gone.)
      actions.push(`<a class="btn btn-sm" href="${openHref}">Revisit${which}</a>`);
    } else if (node.reachable) {
      // A level past where they stand, which this account is allowed to open.
      // It is not locked and it is not done either — it is incomplete, and the
      // difference is the whole point of the word.
      actions.push(`<a class="btn btn-sm" href="${openHref}">Open${which}</a>`);
      // The one control on this page that discards work rather than doing it, so
      // it says what it will do and asks first. It is only offered on levels
      // ahead: there is nothing to jump over behind or on the current one.
      actions.push(`<button class="btn btn-sm btn-danger" type="button" data-jump="${node.level}">Skip to here</button>`);
    }
    // A locked level has no action and no "locked" label: its number is quiet
    // on the rail, and the unit's heading says what is ahead.

    // There used to be a second, ghost-styled "Base lesson" link here, pointing at
    // the same page the button above now opens. It rendered exactly when the row
    // had a generated page, which is exactly when the button above already goes
    // there — so it was two links to one URL, with different labels, on the same
    // line. The row's own button carries the action now, and one control per thing
    // is the point of deciding `opensBase` once.
    const isNext = !skipped && node.level === enrollment.current_level + 1;
    return `
      <div class="node ${skipped ? 'node-skipped' : setAside && node.state === 'done' ? 'node-locked node-open' : `node-${node.state}`}${isCheckpoint ? ' node-checkpoint' : ''}${isLesson ? ' node-lesson' : ''}${node.reachable && !skipped ? ' node-open' : ''}${isNext ? ' is-next' : ''}">
        <span class="badge"><span class="visually-hidden">Level </span>${badge}${node.state === 'current' && !skipped ? '<span class="visually-hidden">, you are here</span>' : ''}</span>
        <span>
          <span class="title">${label}</span>
          ${detail || state ? `<span class="tiny muted detail">${detail}${state ? `${detail ? '. ' : ''}${state}.` : ''}</span>` : ''}
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
  // Where a level opens: its generated page when it is a lesson that has one, the
  // adaptive session otherwise. One function, so a row and the unit heading over
  // it cannot disagree.
  function openHrefOf(node) {
    return node.kind === 'lesson' && hasBaseLesson(node.level)
      ? baseHref(node.level)
      : `/session?enrollment=${enrollment.id}&level=${node.level}`;
  }

  /*
   * Units the learner proved they know, from the plan. The path skips them, so
   * they are drawn folded into one line each — "Unit 3: Fractions, skipped" —
   * with a way in for anyone who wants to look anyway. Units still to learn, and
   * units nobody has asked about yet, are drawn as ordinary levels.
   */
  /**
   * A skill subject's stage (staged skills round 3): the rows its parts send,
   * such as the stage check when its exit battery is due, what is left before
   * the stage can be left, and today's practice. Nothing when there are none.
   */
  function skillStage(reply) {
    const rows = (reply && reply.nodes) || [];
    if (!rows.length) return '';
    const esc = App.escapeHtml;
    return `
    <h2 class="section-title">${esc(reply.stage ? `This stage: ${reply.stage.name}` : 'This stage')}</h2>
    <div class="path skill-stage">
      ${rows.map((n) => `
      <div class="node node-skill${n.next ? ' is-next' : ''}${n.done ? ' node-done' : ''}${n.held ? ' node-skill-held' : ''}" data-subject="${esc(track.id)}">
        <span class="badge">${n.done ? window.mark('tick', 'mark-plain') : esc(n.badge || '')}</span>
        <span>
          <span class="title">${esc(n.title)}${n.kind_label ? `<span class="kind">${esc(n.kind_label)}</span>` : ''}</span>
          ${n.detail ? `<span class="skill-detail">${esc(n.detail)}</span>` : ''}
        </span>
        <span class="spacer"></span>
        <span class="row-wrap">${n.href ? `<a class="btn btn-sm" href="${esc(n.href)}">${esc(n.action || 'Open')}<span class="visually-hidden">: ${esc(n.title)}</span></a>` : ''}</span>
      </div>`).join('')}
    </div>`;
  }

  function planUnits(summary, rows) {
    const list = [];
    const fromPlan = Array.isArray(summary && summary.units) ? summary.units : [];
    for (const u of fromPlan) {
      if (!u || !Number.isFinite(Number(u.start)) || !Number.isFinite(Number(u.end))) continue;
      list.push({
        unit: u.unit || u.number || null,
        key: u.key || String(u.unit || ''),
        title: u.title || (u.titles || [])[0] || '',
        status: u.status,
        source: u.source || null,
        test_out: u.test_out || null,
        // Whether a test-out is open on it now, from the server (a unit not
        // checked yet offers one right where it is drawn).
        can_test_out: !!u.can_test_out,
        start: Number(u.start),
        end: Number(u.end),
      });
    }
    if (list.length) return list;
    // The path rows may carry their unit themselves.
    const byKey = new Map();
    for (const node of rows || []) {
      const status = node.unit_status || (node.unit && node.unit.status);
      if (!status) continue;
      const key = String((node.unit && node.unit.key) || node.unit_key || node.unit_number || node.unit || '');
      const row = byKey.get(key) || {
        unit: Number(node.unit_number || (node.unit && node.unit.unit) || node.unit) || null,
        key,
        title: node.unit_title || (node.unit && node.unit.title) || '',
        status,
        can_test_out: !!node.unit_can_test_out,
        start: node.level,
        end: node.level,
      };
      row.start = Math.min(row.start, node.level);
      row.end = Math.max(row.end, node.level);
      byKey.set(key, row);
    }
    return [...byKey.values()];
  }

  const unitOfLevel = (level) => units.find((u) => level >= u.start && level <= u.end) || null;

  // The path steps over a unit it has proved known, and over a unit before the
  // placed one that no check has put back on the path (services/learner-path.js
  // `stepsOver`). Both are drawn folded; the line under each says which it is.
  const placedUnit = Number(plan && plan.placed_unit) || 0;
  function skipReason(unit) {
    if (!unit) return null;
    if (unit.status === 'known') return 'known';
    if (unit.status === 'unseen' && placedUnit && unit.unit && unit.unit < placedUnit) return 'placed';
    return null;
  }

  function isSkipped(node) {
    if (node.state === 'current') return false;
    const unit = unitOfLevel(node.level);
    if (unit) return !!skipReason(unit);
    return node.unit_status === 'known';
  }

  // Why a folded unit is skipped, said truthfully: a catch-up grade marks every
  // unit outside the gaps as skipped without having asked about each one.
  function skipLine(unit) {
    if (skipReason(unit) === 'placed') return 'Your placement started you past this';
    if (unit.source === 'gap_scan') return 'Not part of your catch-up';
    return 'You showed you know this';
  }

  const unitName = (unit) => `${unit.unit ? `Unit ${unit.unit}` : 'Unit'}${unit.title ? `: ${App.escapeHtml(unit.title)}` : ''}`;
  const rangeOf = (a, b) => (a === b ? `${a}` : `${a}&ndash;${b}`);
  const plainText = (html) => html.replace(/<[^>]*>/g, '').replace(/&ndash;/g, '-').replace(/"/g, '&quot;');

  /*
   * The path, grouped. A grade with a unit plan is grouped by its units; one
   * without is grouped by lesson (a lesson and the levels that practise it).
   * Each group is one heading line with its level range and a row of tiny
   * marks, and only the group the learner is in is open: a path of a few
   * hundred levels reads as a few dozen lines.
   */
  /**
   * Today's review as the first row of the path: what is due from the
   * learner's own record (memory checks, fading, not yet lasting; lessons to
   * learn again) and the way in. Nothing when the review is off, the grade has
   * no objective record, or the track is finished.
   */
  function reviewNode(reply) {
    const r = reply && reply.review;
    if (!r || enrollment.status !== 'active') return '';
    const n = r.retrieve.length;
    const relearn = r.reteach.length;
    // Folded into the retention enforcers (ENFORCER_FOLD_REVIEW): only older work
    // no enforcer will reach, and lessons to learn again, are left here.
    const name = r.folded ? 'Older work to keep' : "Today's review";
    if (!n && !relearn) {
      if (r.folded) return '';
      return r.done_today ? `
      <div class="node node-review node-done">
        <span class="badge">${window.mark('tick', 'mark-plain')}</span>
        <span><span class="title">Today's review is done<span class="kind">Review</span></span></span>
        <span class="spacer"></span><span class="row-wrap"></span>
      </div>` : '';
    }
    const counts = r.counts || {};
    const what = [
      counts.memory_check ? `${counts.memory_check} memory check${counts.memory_check === 1 ? '' : 's'}` : '',
      counts.fading ? `${counts.fading} fading` : '',
      counts.durability ? `${counts.durability} to make last` : '',
    ].filter(Boolean);
    const detail = [
      n ? `${n} question${n === 1 ? '' : 's'}, about ${Math.max(1, Math.round(r.minutes))} min${what.length ? `: ${what.join(', ')}` : ''}` : '',
      relearn ? `${relearn} to learn again` : '',
    ].filter(Boolean).join('. ');
    return `
      <div class="node node-review is-next" data-subject="${App.escapeHtml(track.id)}">
        <span class="badge">Today</span>
        <span>
          <span class="title">${App.escapeHtml(name)}<span class="kind">Review</span></span>
          <span class="tiny muted detail">${App.escapeHtml(detail)}.</span>
        </span>
        <span class="spacer"></span>
        <span class="row-wrap"><a class="btn btn-sm" href="/review?enrollment=${enrollment.id}">${r.open_session ? 'Carry on' : 'Review'}<span class="visually-hidden">: ${App.escapeHtml(name)}</span></a></span>
      </div>`;
  }

  function pathGroups() {
    const groups = [];
    let current = null;
    for (const node of nodes) {
      const unit = units.length ? unitOfLevel(node.level) : null;
      if (unit) {
        if (!current || current.unit !== unit) { current = { unit, nodes: [] }; groups.push(current); }
      } else if (!current || (node.kind === 'lesson' && App.levelParts(node, lessonTitles).kind !== 'Summary')) {
        // A level outside every unit (a quiz between two units, a summary)
        // closes the group before it; a new lesson starts a new one.
        const parts = App.levelParts(node, lessonTitles);
        current = { unit: null, title: node.kind === 'lesson' ? parts.title : parts.kind === 'Check' ? 'Entry check' : parts.title, nodes: [] };
        groups.push(current);
      }
      current.nodes.push(node);
    }
    return groups;
  }

  /** The path rows, grouped, with each run of skipped levels folded under its unit. */
  function pathRows() {
    return pathGroups().map((group) => {
      const run = group.nodes;
      if (group.unit && run.every(isSkipped)) return `<div class="unit-group is-skipped">${skippedUnit(group.unit, run)}</div>`;
      // Inside an open group, a stretch the path skips still folds.
      const rows = [];
      for (let i = 0; i < run.length;) {
        const unit = isSkipped(run[i]) ? unitOfLevel(run[i].level) : null;
        if (!unit) { rows.push(nodeRow(run[i])); i++; continue; }
        const skippedRun = [];
        while (i < run.length && isSkipped(run[i]) && unitOfLevel(run[i].level) === unit) skippedRun.push(run[i++]);
        rows.push(skippedUnit(unit, skippedRun));
      }
      return groupHtml(group, rows.join(''));
    }).join('');
  }

  function groupHtml(group, body) {
    const run = group.nodes;
    const first = run[0];
    const last = run[run.length - 1];
    const here = run.some((n) => n.state === 'current');
    const done = run.filter((n) => n.state === 'done' || isSkipped(n)).length;
    const name = group.unit ? unitName(group.unit) : App.escapeHtml(group.title || `Levels ${first.level} to ${last.level}`);
    const unchecked = !!group.unit && group.unit.status === 'unchecked';
    const sub = unchecked ? uncheckedHead(group.unit)
      : here ? `You are on level ${enrollment.current_level}`
        : done === run.length ? 'Done'
          : done ? `${done} of ${run.length} done`
            : `${run.length} level${run.length === 1 ? '' : 's'} ahead`;
    const ticks = run.map((n) => `<i class="${n.state === 'current' ? 'c' : isSkipped(n) ? 'k' : n.state === 'done' ? 'd' : ''}"></i>`).join('');
    const bodyId = `unit-body-${first.level}`;
    const testOut = unchecked && group.unit.can_test_out
      ? `<button class="btn btn-sm" type="button" data-testout="${group.unit.unit}">Test out<span class="visually-hidden"> of ${plainText(name)}</span></button>` : '';
    return `
      <section class="unit-group${here ? ' is-current' : ''}${unchecked ? ' is-unchecked' : ''}" aria-label="${plainText(name)}">
        <div class="unit-head">
          <span class="unit-head-range">${rangeOf(first.level, last.level)}</span>
          <span class="unit-head-title">${name}<span class="unit-head-sub">${sub}</span></span>
          <span class="unit-head-side">
            <span class="unit-ticks" aria-hidden="true">${ticks}</span>
            ${testOut}
            <button class="icon-btn unit-toggle" type="button" aria-expanded="${here}" aria-controls="${bodyId}"
              aria-label="${here ? 'Hide' : 'Show'} the ${run.length === 1 ? 'level' : `${run.length} levels`} in ${plainText(name)}"></button>
          </span>
        </div>
        ${testOut ? `<div class="unit-actions">${testOut}</div>` : ''}
        <div class="unit-body" id="${bodyId}"${here ? '' : ' hidden'}>${body}</div>
      </section>`;
  }

  /*
   * A unit that no check has settled. It is worked like a unit to learn and
   * never stepped over, so it can never be a wrong skip; its heading says so,
   * and offers a short test-out on that unit alone (the server says when one
   * is open). Returns the heading's line.
   */
  function uncheckedHead(unit) {
    const tried = unit.test_out === 'failed';
    return tried ? 'Not proved yet. It stays on your path.'
      : `Not checked yet. ${unit.can_test_out ? 'Test out?' : 'It stays on your path.'}`;
  }

  function skippedUnit(unit, run) {
    const first = run[0];
    const last = run[run.length - 1];
    const name = unitName(unit);
    const span = first.level === last.level ? `level ${first.level}` : `levels ${first.level}&ndash;${last.level}`;
    const known = skipReason(unit) === 'known' && unit.source !== 'gap_scan';
    // Folded with a real toggle button rather than <details>: the row also holds
    // the "Review anyway" link, and a link inside a <summary> (itself a button)
    // is unreachable to a screen reader. A click anywhere else on the row still
    // opens it (see the listener at the bottom).
    const foldId = `unit-skip-${unit.key}-${first.level}`.replace(/[^\w-]/g, '-');
    return `
      <div class="unit-skip">
        <div class="node node-skipped unit-skip-head">
          <span class="badge">${window.mark('circle')}</span>
          <span>
            <span class="title">${name}<span class="kind">${known ? 'Already yours' : 'Skipped'}</span></span>
            <span class="tiny muted detail">${skipLine(unit)}. The path skips ${span}.</span>
          </span>
          <span class="spacer"></span>
          <span class="row-wrap">
            <a class="btn btn-sm" href="${openHrefOf(first)}">Review anyway<span class="visually-hidden">: ${plainText(name)}</span></a>
            <button class="icon-btn unit-skip-toggle" type="button" aria-expanded="false" aria-controls="${foldId}"
              aria-label="Show the ${run.length === 1 ? 'level' : `${run.length} levels`} in ${plainText(name)}"></button>
          </span>
        </div>
        <div class="path" id="${foldId}" hidden>${run.map(nodeRow).join('')}</div>
      </div>`;
  }

  /*
   * A catch-up grade: the units outside the gaps were never worked or proved
   * here, so the scan set them (as skipped, or as not checked yet). Every unit
   * that is known was set by the scan.
   */
  function isCatchUpGrade() {
    const scanned = units.filter((u) => u.source === 'gap_scan');
    return scanned.length > 0 && units.filter((u) => u.status === 'known').every((u) => u.source === 'gap_scan');
  }

  /** "You skip 9 of 16 units; 7 to learn, 2 not checked yet." — and any catch-up on an earlier grade. */
  function planCard() {
    if (!plan) return '';
    const count = (status) => {
      const v = plan[status];
      if (Array.isArray(v)) return v.length;
      if (v && typeof v === 'object') return Number(v.count) || (v.units || v.titles || []).length;
      if (Number.isFinite(Number(v)) && v !== null) return Number(v);
      return units.filter((u) => u.status === status).length;
    };
    const proved = count('known');
    // Units before the start still waiting on the quick check are behind the
    // learner and not on the path ahead, so they are not counted as to learn.
    const placed = Number(plan.placed_unit) || 0;
    const checking = units.filter((u) => u.status === 'unseen' && placed && u.unit && u.unit < placed).length;
    const left = count('learn') + count('unseen') - checking;
    const done = count('done');
    // Units no check has settled are counted on their own: they are worked like
    // units to learn, but nothing says yet that they need it.
    const unchecked = count('unchecked');
    const total = proved + left + done + checking + unchecked;
    // The path steps over both, so both count as skipped.
    const known = proved + checking;
    const catchUpGrade = isCatchUpGrade();
    // A catch-up the learner took is the banner's business (catchBanner); an
    // offer they have not answered is a card here.
    const catchUp = (plan.catch_up || []).filter((c) => c && c.status === 'offered');
    // Before the grade's own placement there is nothing measured to count yet.
    const counted = total && enrollment.status !== 'placement_pending';
    if (!counted && !catchUp.length) return '';
    const noun = (n) => `${n} unit${n === 1 ? '' : 's'}`;
    const tail = `${done ? `, ${done} done` : ''}${unchecked ? `, ${unchecked} not checked yet` : ''}`;
    const notes = [];
    if (known) notes.push(catchUpGrade ? `${proved} proved, so skipped.` : 'Skipped units are folded into the path below. Open one to review it.');
    if (unchecked) notes.push('Units not checked yet stay on your path. Test out of one any time.');
    return `
      ${counted ? `
        <div class="card plan-card">
          <div class="plan-card-head">
            <div>
              <div class="plan-card-title">
                ${catchUpGrade
                  ? (left
                    ? `<strong>Catch-up: just the ${noun(left)} your check found</strong>${tail}.`
                    : `<strong>Catch-up: the gaps your check found are worked</strong>${tail}.`)
                  : known
                    ? `<strong>You skip ${known} of ${total} unit${total === 1 ? '' : 's'}</strong>; ${left} to learn${tail}.`
                    : `<strong>${noun(left)} to learn</strong>${tail}.`}
              </div>
              ${notes.length ? `<div class="tiny muted">${notes.join(' ')}</div>` : ''}
            </div>
          </div>
          ${App.unitStrip(units, { level: enrollment.current_level, placedUnit: placed, subject: track.id })}
          <div class="meter meter-success"><span style="width:${total ? ((known + done) / total) * 100 : 0}%"></span></div>
        </div>` : ''}
      ${catchUp.map(catchUpCard).join('')}`;
  }

  /*
   * A catch-up on an earlier grade. An offer the learner has not answered yet is
   * shown once here, quietly, with both answers side by side; one they said no
   * to is never shown again. One they took is a link to it.
   */
  function catchUpCard(c) {
    const n = (c.unit_keys || c.units || []).length;
    // The offer carries the grade's id; its slug reads well enough as a name.
    const gradeName = App.gradeLabel(c.grade_name || String(c.grade_id || 'an earlier grade').replace(/_/g, ' '));
    const minutes = Number(c.minutes) || 0;
    return `
      <div class="card plan-card catch-up" data-grade="${App.escapeHtml(c.grade_id)}">
        <div class="plan-card-head">
          <div>
            <div class="plan-card-title"><strong>Catch up on ${n ? `${n} unit${n === 1 ? '' : 's'}` : 'a few units'} of ${App.escapeHtml(gradeName)} first?</strong></div>
            <div class="small muted">${minutes ? `About ${minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 30) / 2} hours`}. ` : ''}Your placement found a few things from an earlier grade worth a quick look. Up to you: you can start here either way.</div>
          </div>
          <span class="catch-up-actions">
            <button class="btn btn-primary btn-sm" type="button" data-catchup="yes">Catch up</button>
            <button class="btn btn-sm" type="button" data-catchup="no">No thanks</button>
          </span>
        </div>
      </div>`;
  }

  /*
   * The catch-up banner. On the grade the catch-up leads to: the route's
   * headline and the way on to the next step. On a catch-up grade: where it
   * sits in the route ("Catch-up 2 of 3: Grade 3. Then Grade 4."). Once the
   * route is done: "Caught up. Start Grade 4". Drawn from the route the server
   * sends (GET /api/placement/path, and GET /api/gap-scan/state for a catch-up
   * grade, which does not hold the route itself).
   */
  async function catchBanner() {
    const esc = App.escapeHtml;
    const nameOf = (s) => App.gradeLabel(s.grade_name || s.grade_id);
    // Spanish: the skill catch-up (services/spanish/catch-up.js) has its own page.
    if (track.id === 'spanish') {
      const s = await App.api.get('/api/es/catch-up/summary').catch(() => null);
      const r = s && s.available && s.route;
      if (r) {
        const onMain = r.grade_id === grade.id;
        if (r.phase === 'done') return onMain ? `<section class="catch-banner" aria-label="Catch-up"><div class="catch-text">${window.mark('tick', 'mark-plain')}<p><b>Caught up on ${r.steps.length} skill${r.steps.length === 1 ? '' : 's'}.</b></p></div></section>` : '';
        const lead = r.phase === 'check' ? 'Finish your Spanish skill check.'
          : r.phase === 'recheck' ? 'Catch-up: take the final check.'
            : `Catch-up ${r.k} of ${r.n}: ${r.steps[r.k - 1] ? r.steps[r.k - 1].grade_name : ''}.`;
        const sub = r.phase === 'route' ? `About ${r.total_minutes} minutes left, then a short final check${onMain ? '' : ` and ${App.gradeLabel(r.grade_name)}`}.` : '';
        return `
          <section class="catch-banner" aria-label="Catch-up">
            <div class="catch-text"><p><b>${esc(App.noDash(lead))}</b>${sub ? `<span class="catch-sub">${esc(sub)}</span>` : ''}</p></div>
            <a class="btn" href="${esc(r.url)}">Continue catch-up</a>
          </section>`;
      }
    }
    // The grade this one leads to.
    if (catchRoute && catchRoute.grade_id === grade.id && (catchRoute.status === 'accepted' || catchRoute.status === 'done')) {
      const route = catchRoute;
      if (route.status === 'done') {
        const total = (route.steps || []).reduce((n, s) => n + (s.unit_count || 0), 0);
        return `<section class="catch-banner" aria-label="Catch-up"><div class="catch-text">${window.mark('tick', 'mark-plain')}<p><b>Caught up${total ? ` on ${total} unit${total === 1 ? '' : 's'}` : ''}.</b></p></div></section>`;
      }
      const step = (route.steps || []).find((s) => s.status !== 'done' && s.enrollment_id);
      return `
        <section class="catch-banner" aria-label="Catch-up">
          <div class="catch-text"><p><b>${esc(App.noDash(route.headline))}</b>${step ? `<span class="catch-sub">Next: ${esc(nameOf(step))}.</span>` : ''}</p></div>
          ${step ? `<a class="btn" href="/path?enrollment=${step.enrollment_id}">Continue catch-up<span class="visually-hidden">: ${esc(nameOf(step))}</span></a>` : ''}
        </section>`;
    }
    let state;
    try {
      state = await App.api.get(`/api/gap-scan/state/${encodeURIComponent(track.id)}`);
    } catch (err) {
      return '';
    }
    // The grade the placement recommended, with its catch-up check not taken or not finished
    // (owner, 2026-10-29: the check was only on the placement result page, and could not be found).
    const quiz = state && state.catch_up_quiz;
    // Shown on any grade of the subject: a learner who placed at Grade 5 and chose to start lower still wants it.
    if (!isCatchUpGrade() && quiz && quiz.available && !(state.route && state.route.status)) {
      const num = String(quiz.grade_id || '').match(/grade_0*(\d+)/);
      const short = quiz.grade_id === grade.id ? esc(App.gradeParts(grade.name)[0] || App.gradeLabel(grade.name))
        : num ? `Grade ${num[1]}` : 'your placement grade';
      const below = Number(quiz.grades_below) || 0;
      const grades = below ? `the ${below} grade${below === 1 ? '' : 's'} below ${short}` : `the grades below ${short}`;
      const href = `/subject-placement?track=${encodeURIComponent(track.id)}${quiz.status === 'running' ? '&step=catchup' : ''}`;
      if (quiz.status === 'not_started' || quiz.status === 'running') {
        return `
          <section class="catch-banner" aria-label="Catch-up">
            <div class="catch-text"><p><b>${quiz.status === 'running' ? 'Finish your catch-up check.' : 'Catch up first?'}</b><span class="catch-sub">A ${quiz.minutes ? `${Number(quiz.minutes)}-minute ` : 'short '}check of ${grades} finds what you missed or forgot, then gives you just those pieces to learn.</span></p></div>
            <a class="btn" href="${href}">${quiz.status === 'running' ? 'Continue catch-up' : 'Start catch-up'}</a>
          </section>`;
      }
      if (quiz.status === 'declined') {
        return `
          <section class="catch-banner" aria-label="Catch-up">
            <div class="catch-text"><p><span class="catch-sub">You started without the catch-up. You can still check ${grades}.</span></p></div>
            <a class="btn btn-text" href="${href}">Check them</a>
          </section>`;
      }
    }
    // A catch-up grade: find this enrollment among its subject's steps.
    if (!isCatchUpGrade()) return '';
    const route = state && state.route;
    const steps = (route && route.steps) || [];
    const at = steps.findIndex((s) => s.enrollment_id === enrollment.id);
    if (at < 0) return '';
    const here = steps[at];
    const later = steps.slice(at + 1).find((s) => s.status !== 'done');
    const mainName = App.gradeLabel(route.grade_name);
    const mainId = (route.next && route.next.kind === 'main' && route.next.enrollment_id) || state.enrollment_id;
    if (here.status === 'done' || route.status === 'done') {
      const allDone = route.status === 'done';
      return `
        <section class="catch-banner" aria-label="Catch-up">
          <div class="catch-text">${window.mark('tick', 'mark-plain')}<p><b>Caught up${allDone ? '' : ` on ${esc(nameOf(here))}`}.</b><span class="catch-sub">${allDone ? `Start ${esc(mainName)}.` : `Then ${esc(later ? nameOf(later) : mainName)}.`}</span></p></div>
          ${allDone && mainId ? `<a class="btn" href="/path?enrollment=${mainId}">Start ${esc(App.gradeParts(route.grade_name)[0] || mainName)}</a>` : later && later.enrollment_id ? `<a class="btn" href="/path?enrollment=${later.enrollment_id}">Continue catch-up<span class="visually-hidden">: ${esc(nameOf(later))}</span></a>` : ''}
        </section>`;
    }
    return `
      <section class="catch-banner" aria-label="Catch-up">
        <div class="catch-text"><p><b>Catch-up ${at + 1} of ${steps.length}: ${esc(nameOf(here))}.</b><span class="catch-sub">Then ${esc(later ? nameOf(later) : mainName)}.</span></p></div>
      </section>`;
  }

  // Consolidation before the Final (staged round 3, ADAPT_CONSOLIDATE): short
  // daily reviews until the grade will last, for at most 21 days, with the next
  // grade open meanwhile. Asked only on the Final's level; null while it is off.
  const consolidation = checkpoint === 'graduation' && enrollment.status === 'active' && !failed
    ? await App.api.get(`/api/consolidation/${enrollment.id}`).then((x) => (x && x.consolidation) || null).catch(() => null)
    : null;
  const consolidationAction = (c) => {
    // The server's label (services/consolidation.js opensBy): the same date, in the learner's zone, as the session page and the dashboard.
    const ends = c.opens_label || new Date(c.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
    const r = c.review || {};
    const next = c.next_grade;
    const nextName = next ? App.escapeHtml(App.gradeParts(next.name)[0]) : '';
    const nextBtn = !next ? ''
      : next.enrollment_id
        ? `<a class="btn btn-text" href="/path?enrollment=${next.enrollment_id}">Go on with ${nextName}</a>`
        : `<button class="btn btn-text" type="button" id="start-next-grade" data-grade="${App.escapeHtml(next.id)}">Start ${nextName} now</button>`;
    return `${r.due
      ? `<a class="btn btn-primary btn-lg" href="/review?enrollment=${enrollment.id}">Today's review</a>`
      : `<p class="path-done-line">${window.mark('tick')}Today's review is done.</p>`}
      ${nextBtn}
      <span class="small">Before the Final: about <span class="num">${c.minutes}</span> minutes of review a day until this grade will last. Day <span class="num">${c.day}</span> of at most <span class="num">${c.days}</span>; the Final opens by ${App.escapeHtml(ends)}, or sooner.${next ? ` You can start ${nextName} meanwhile.` : ''}</span>
      <div class="consolidate-meter">${App.tmeter({ label: 'Likely to last a month', value: c.share, target: c.at })}</div>`;
  };
  if (consolidation && consolidation.active) {
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('#start-next-grade');
      if (!button) return;
      button.disabled = true;
      try {
        const out = await App.api.post('/api/enrollments', { selections: [{ track_id: track.id, grade_id: button.dataset.grade }] });
        const made = (out.created || [])[0];
        window.location.href = made ? `/placement?enrollment=${made.id}` : '/dashboard';
      } catch (err) {
        App.toast(err.message, 'error');
        button.disabled = false;
      }
    });
  }
  const action0 = consolidation && consolidation.active ? consolidationAction(consolidation) : enrollment.status === 'graduated'
    ? `<p class="path-done-line">${window.mark('tick')}You graduated this track.</p> <a class="btn btn-primary" href="/onboarding">Pick the next one</a>`
    : checkpoint
      ? (failed
        ? `<a class="btn btn-primary btn-lg" href="/session?enrollment=${enrollment.id}">Retry the ${App.escapeHtml(kindLabel)}</a>
           <a class="btn btn-text" href="/help?enrollment=${enrollment.id}">Work on what went wrong first</a>
           <span class="small">Attempt ${failed.attempt} scored <span class="num">${App.pct(failed.accuracy)}</span> against <span class="num">${App.pct(failed.required)}</span>. The retry is written fresh${failed.areas.length ? `; weakest was ${App.escapeHtml(failed.areas[0].skill_name)}` : ''}.</span>`
        : `<a class="btn btn-primary btn-lg" href="/session?enrollment=${enrollment.id}">Take the ${App.escapeHtml(kindLabel)}</a>
           <span class="small">Pass mark <span class="num">${App.pct(checkpoints.pass_marks[delivered] || checkpoints.pass_marks[checkpoint])}</span>.${delivered === 'essay' ? (enrollment.spoken ? ' A few questions to tap, then say it aloud to a grown-up.' : ' A short quiz, then one piece of writing marked against a rubric.') : ''}</span>`)
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
          ? `<a class="btn btn-primary btn-lg" href="${baseHref(enrollment.current_level)}">Start lesson ${enrollment.current_level}</a>
             <a class="btn btn-text" href="/session?enrollment=${enrollment.id}">Adaptive session instead</a>
             <span class="small">The full lesson for this level, the same for everyone on this course.</span>`
          : `<a class="btn btn-primary btn-lg" href="/session?enrollment=${enrollment.id}">Start lesson ${enrollment.current_level}</a>
             ${hereNode && hereNode.activities ? '' : `<span class="small">${enrollment.lesson_ready ? 'Written for you and ready.' : 'Written for you when you open it.'}</span>`}`)
        : `<a class="btn btn-primary btn-lg" href="/session?enrollment=${enrollment.id}">Start level ${enrollment.current_level}</a>
         <span class="small"><span class="num">${params.itemCount}</span> questions, about <span class="num">${Math.max(3, Math.round(params.itemCount * 0.8))}</span>&nbsp;minutes.</span>`;

  // Retake placement, beside the first button: only where the server says the
  // grade is placed (and never for a graduated track).
  const retakeBtn = placementInfo && placementInfo.retake_available && enrollment.status !== 'graduated'
    ? `<button class="btn btn-text" type="button" data-retake="${enrollment.id}" data-track="${App.escapeHtml(track.id)}" data-grade-name="${App.escapeHtml(grade.name)}">Retake placement<span class="visually-hidden"> for ${App.escapeHtml(App.gradeLabel(grade.name))}</span></button>`
    : '';
  const action1 = retakeBtn ? action0.replace('</a>', () => `</a>${retakeBtn}`) : action0;
  // A Final passed while the record still has objectives to prove and keep
  // (COVERAGE_GATE=enforce): graduation is held, and the way on is to prove
  // them, not to sit the Final again. Asked only on the Final's level.
  const held = checkpoint === 'graduation' && enrollment.status === 'active'
    ? await App.api.get(`/api/coverage/${enrollment.id}/held`).then((x) => (x && x.held ? x : null)).catch(() => null)
    : null;
  const heldLeft = held && held.plan ? held.plan.total - held.plan.kept : 0;
  const action = !held ? action1 : held.plan && held.plan.complete
    ? `<a class="btn btn-primary btn-lg" href="/held?enrollment=${enrollment.id}">Graduate</a>
       <span class="small">You passed the Final, and your record now shows every objective proven and kept.</span>`
    : `<a class="btn btn-primary btn-lg" href="/held?enrollment=${enrollment.id}">See what graduation waits on</a>
       <span class="small">You passed the Final. Graduation waits on <span class="num">${heldLeft}</span> objective${heldLeft === 1 ? '' : 's'} your record has not yet seen proven and kept.</span>`;
  const bannerHtml = await catchBanner();

  // The level the learner stands on, named the way the path names it.
  const here = nodes.find((n) => n.level === enrollment.current_level) || null;
  const hereParts = here ? App.levelParts(here, lessonTitles) : { title: App.levelName(delivered), kind: '' };
  const hereKind = checkpoint ? App.levelName(delivered) : hereParts.kind || App.levelName(delivered);
  const req = progress.required || {};
  const [gradeMain, gradeSub] = App.gradeParts(grade.name);
  const planHtml = planCard();
  const scaleEnd = Math.max(Number(pathEnd) || 0, enrollment.path_length);

  root.innerHTML = `
    <div class="path-top" data-subject="${App.escapeHtml(track.id)}">
      <div>
        <a class="back-link" href="/dashboard">${window.icon('arrow-left')}Dashboard</a>
        <div class="track-heading">
          ${App.symbol(track, { size: 'lg' })}
          <div>
            <h1>${App.escapeHtml(track.name)}</h1>
            <span class="tiny">${App.escapeHtml(gradeMain)}${gradeSub ? `, ${App.escapeHtml(gradeSub)}` : ''}. <span class="num">${enrollment.path_length}</span> levels.</span>
          </div>
        </div>
      </div>

      ${bannerHtml}

      ${['math', 'english', 'reading'].includes(track.id) ? `<p class="tiny" data-catchup-link><a href="/catchup?track=${encodeURIComponent(track.id)}&grade=${encodeURIComponent(grade.id)}">Catch me up to this grade</a>: find what you are missing just below it and learn only that.</p>` : ''}

      ${track.id === 'chess' ? `<nav class="row-wrap tiny" aria-label="Chess practice" style="gap:var(--s-3)">
        <a href="/engine/chess/puzzles.html">Rated puzzles</a>
        <a href="/engine/chess/drills.html">Move trainer</a>
        <a href="/engine/chess/spar.html">Play a human-like opponent</a>
      </nav>` : ''}

      ${App.scale({
        from: 1, to: scaleEnd, you: enrollment.current_level, subject: track.id,
        ticks: App.checkpointTicks(nodes, Number(pathEnd) || scaleEnd, enrollment.current_level),
        caption: `Level ${enrollment.current_level} of ${enrollment.path_length}.${nextFrom.master != null && nextFrom.master > enrollment.current_level ? ` Next Master quiz at level ${nextFrom.master}` : ''}${nextFrom.grand != null && nextFrom.grand > enrollment.current_level ? `, next Grand Master at ${nextFrom.grand}` : ''}${nextFrom.master != null || nextFrom.grand != null ? '.' : ''} Diamonds are checkpoints; the flag is the Graduation exam.`,
      })}

      <div class="path-now path-hero">
        <div>
          <p class="now-kind">Level <span class="num">${enrollment.current_level}</span>, ${App.escapeHtml(hereKind.toLowerCase())}</p>
          <h2>${App.escapeHtml(hereParts.title)}</h2>
          ${here && here.covers && !checkpoint ? `<p class="now-detail">${App.escapeHtml(here.covers)}</p>` : ''}
          ${checkpoint ? '<p class="now-detail">Covers everything up to here.</p>' : ''}
          <div class="path-actions hero-actions">${action}</div>
          ${enrollment.can_skip_level && enrollment.status === 'active' ? `
            <div class="row-wrap" style="margin-top:10px">
              <button class="btn btn-sm btn-ghost" id="skip-level" type="button">Skip this level</button>
              <span class="tiny muted">Moves you on without counting as cleared.</span>
            </div>` : ''}
          ${enrollment.can_skip_level && enrollment.status !== 'graduated' ? `
            <form class="row-wrap owner-skips" id="owner-jump" style="margin-top:8px; gap:8px; align-items:center" aria-label="Owner: move anywhere on this grade">
              <span class="tiny muted">Owner:</span>
              <label class="tiny muted" for="owner-jump-level">Go to level</label>
              <input class="input" id="owner-jump-level" type="number" inputmode="numeric" min="1" max="${enrollment.path_length}" value="${enrollment.current_level}" style="width:6.5em" required>
              <button class="btn btn-sm btn-ghost" type="submit">Go</button>
              <button class="btn btn-sm btn-ghost" id="owner-skip-grade" type="button">Skip this grade</button>
              <a class="btn btn-sm btn-ghost" href="/curriculum?track=${encodeURIComponent(track.id)}">Any grade</a>
            </form>` : ''}
        </div>
        <div class="hero-body">
          ${hereNode && hereNode.activities && enrollment.status !== 'graduated'
            ? `<p class="small" style="margin:0">Duolingo-style activities with audio. ${/Unit Check|Chunk Speed Drill/.test(hereNode.level_title || '')
              ? 'Finish it to move on.'
              : /Conversation Lab/.test(hereNode.level_title || '') ? 'Reach at least half of the role-play\'s goals to move on.'
              : `Get <span class="num">${/Checkpoint/.test(hereNode.level_title || '') ? 80 : 60}%</span> of first tries right to move to level ${enrollment.current_level + 1}.`} Missed words come back for review.</p>`
            : progress.blockers.length && !checkpoint && enrollment.status !== 'graduated'
            ? `<h3 class="tiny" style="font-size:var(--t-meta);color:var(--ink-2);font-weight:600;margin:0 0 var(--s-3)">To move to level ${enrollment.current_level + 1}</h3>
               <div class="tmeters">
                 ${App.tmeter({ label: 'Average mastery', value: Math.min(1, progress.average || 0), target: req.averageMastery || 0.8 })}
                 ${App.tmeter({ label: 'Weakest skill', value: Math.min(1, progress.weakest || 0), target: req.weakestMastery || 0.6 })}
                 ${App.tmeter({ label: 'Questions at this level', value: progress.items || 0, target: req.minItems || 12, max: req.minItems || 12, unit: 'count' })}
               </div>`
            : !progress.blockers.length ? `<p class="path-done-line">${window.mark('tick')}This level is complete${checkpoint ? `; the ${App.escapeHtml(kindLabel)} is next.` : '.'}</p>` : ''}
        </div>
      </div>
    </div>

    ${planHtml.trim() ? `<div class="section">${planHtml}</div>` : ''}

    ${skillStage(await skillReply)}

    ${skip.offered ? `
      <div class="card" style="margin-top:24px">
        <div class="row-between" style="align-items:flex-start; gap:14px; flex-wrap:wrap">
          <div>
            <div class="card-title">Challenge Exam unlocked</div>
            <p class="small muted" style="margin:4px 0 0">
              ${skip.run} levels in a row at ${App.pct(skip.mark)} or better.
              ${(skip.bands || [])[0] && skip.bands[0].rule === 'sprt' ? `The exam is ${skip.bands.length} bands` : 'The exam is five bands of seven'}, taken at level ${skip.from_level} and pitched at
              ${(skip.bands || []).map((b) => b.level).join(', ')}, all above where you stand.
              ${(skip.bands || [])[0] && skip.bands[0].rule === 'sprt'
    ? `The first band has ${skip.bands[0].count} questions and holds at ${skip.bands[0].needed} right; each band above it has ${(skip.bands[1] || skip.bands[0]).count} and holds with at most one miss. You skip as far as an unbroken run of held bands reaches.`
    : 'You skip as far as an unbroken run of perfect bands reaches.'}
            </p>
          </div>
          <a class="btn btn-lg" href="/skip?enrollment=${enrollment.id}">Take the Challenge Exam</a>
        </div>
      </div>` : enrollment.status === 'active' && skip.run > 0 ? `
      <div style="margin-top:24px; max-width:420px">
        ${App.tmeter({ label: `Levels in a row at ${App.pct(skip.mark)} or better${skip.best > skip.run ? ` (best ${skip.best})` : ''}`, value: skip.run, target: skip.needed, max: skip.needed, unit: 'count' })}
        <p class="tiny muted" style="margin:6px 0 0">A Challenge Exam opens at ${skip.needed}.</p>
      </div>` : ''}

    <h2 class="section-title">The path</h2>
    <div class="path path-units">${reviewNode(await reviewReply)}${pathRows()}</div>

    <h2 class="section-title">Skills at this level</h2>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Skills at this level">
      <table class="data">
        <thead><tr><th>Skill</th><th>Mastery</th><th class="n">Seen</th><th>Next review</th></tr></thead>
        <tbody>
          ${skills.map((s) => `
            <tr>
              <td>${App.escapeHtml(s.name)}
                ${s.error_tags.length ? `<span class="tiny muted" style="display:block">${App.escapeHtml(s.error_tags.join(', ').replace(/_/g, ' '))}</span>` : ''}
              </td>
              <td style="width:32%">
                <div class="tmeter${s.mastery >= 0.8 ? ' is-met' : ''}" style="min-width:120px">
                  <div class="tmeter-head"><span class="num">${App.pct(s.mastery)}</span></div>
                  <div class="tmeter-bar" aria-hidden="true"><span class="tmeter-fill" style="--v:${s.mastery * 100}%"></span><span class="tmeter-mark" style="--m:80%"></span></div>
                </div>
              </td>
              <td class="n">${s.attempts}</td>
              <td class="tiny muted nowrap">${s.due_at ? App.timeAgo(s.due_at).replace(' ago', ' ago (due)') : 'not yet'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="tiny muted" style="margin:12px 0 0; max-width:70ch">${App.escapeHtml(grade.blurb || '')} ${App.escapeHtml(App.layoutSentence(checkpoints))}</p>`;

  // Spanish: one line on why the path is ordered this way (services/spanish/goal-fit.js).
  if (data.spanish_fit) {
    const fit = data.spanish_fit;
    const line = document.createElement('p');
    line.className = 'small es-fit-line';
    line.style.cssText = 'margin:16px 0 0;max-width:640px';
    line.innerHTML = `<strong>${App.escapeHtml(fit.label)}.</strong> ${App.escapeHtml(fit.why)}`
      + `${fit.deferred_count ? ` <span class="muted">${fit.deferred_count} level${fit.deferred_count === 1 ? '' : 's'} saved for later.</span>` : ''}`
      + `${fit.queue && fit.queue.seen ? ` <span class="muted">Review queue: ${fit.queue.due.length} due, ${fit.queue.learned} of ${fit.queue.seen} words solid.</span>` : ''}`;
    const pathTitle = [...root.querySelectorAll('h2.section-title')].find((h) => h.textContent.trim() === 'The path');
    if (pathTitle) pathTitle.parentNode.insertBefore(line, pathTitle);
    else root.appendChild(line);
  }

  // Your goal for this grade (services/goals.js): shown and editable here.
  if (window.GoalPicker) {
    const goalHost = document.createElement('div');
    goalHost.style.cssText = 'margin:20px 0 4px;max-width:640px';
    const pathTitle = [...root.querySelectorAll('h2.section-title')].find((h) => h.textContent.trim() === 'The path');
    if (pathTitle) pathTitle.parentNode.insertBefore(goalHost, pathTitle);
    else root.appendChild(goalHost);
    await window.GoalPicker.card(goalHost, { trackId: track.id, gradeId: grade.id });
    // And the tutor, which knows that goal (services/tutor.js).
    if (window.TutorChat) window.TutorChat.mount(goalHost, { where: 'subject' });
  }

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

  // The owner's controls (services/owner-skips.js; the server refuses them for
  // every other account): stand on any level of this grade, ahead or behind, or
  // skip the whole grade.
  const ownerJump = document.getElementById('owner-jump');
  if (ownerJump) {
    ownerJump.addEventListener('submit', async (event) => {
      event.preventDefault();
      const level = Number(document.getElementById('owner-jump-level').value);
      if (!Number.isFinite(level) || level < 1) return;
      if (level === enrollment.current_level) return;
      if (level > enrollment.current_level && !window.confirm(`Go to level ${level}? Levels ${enrollment.current_level}-${level - 1} are marked done at 100%.`)) return;
      try {
        const result = await App.api.post(`/api/enrollments/${enrollment.id}/jump-to`, { level });
        App.toast(`Level ${result.level}.`);
        window.location.reload();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }
  const ownerSkipGrade = document.getElementById('owner-skip-grade');
  if (ownerSkipGrade) {
    ownerSkipGrade.addEventListener('click', async () => {
      if (!window.confirm('Skip this whole grade? It is marked graduated without the Final, and the next grade opens at level 1.')) return;
      ownerSkipGrade.disabled = true;
      try {
        const result = await App.api.post(`/api/enrollments/${enrollment.id}/skip-grade`, {});
        App.toast('Grade skipped.');
        window.location.href = result.next_enrollment ? `/path?enrollment=${result.next_enrollment}` : '/dashboard';
      } catch (err) {
        App.toast(err.message, 'error');
        ownerSkipGrade.disabled = false;
      }
    });
  }

  // One listener for every jump button on the page, found by delegation: the
  // path is a long list and re-binding each on render would be both slower and
  // easier to get wrong. A skill track renders more than one .path (its stage
  // block, then the units list), so every one gets the listener: binding only the
  // first left "Skip to here" dead on piano, chess and basketball.
  document.querySelectorAll('.path').forEach((path) => {
    path.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-jump]');
      if (!button) return;
      const level = Number(button.dataset.jump);
      const from = enrollment.current_level;
      const count = level - from;
      // Named in full before it happens. This discards everything below the
      // target and writes a hundred and thirty-nine perfect attempts for it, and
      // "are you sure" is not enough of a warning for that.
      const yes = window.confirm(level < from
        ? `Go back to level ${level}?\n\nYou will continue from level ${level}.`
        : `Skip to level ${level}?\n\n`
          + `That marks levels ${from}–${level - 1} as done at 100%, passes every checkpoint `
          + 'in between, and cannot be undone.');
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
  });

  // The catch-up offer's two answers. Either one is final: a "no" is remembered
  // by the server and the card is not shown again, and a "yes" opens the
  // catch-up.
  root.querySelectorAll('.catch-up').forEach((card) => {
    card.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-catchup]');
      if (!button) return;
      const accept = button.dataset.catchup === 'yes';
      card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      let reply;
      try {
        reply = await App.api.post('/api/gap-scan/decide', { enrollment_id: enrollment.id, grade_id: card.dataset.grade, accept });
      } catch (err) {
        App.toast(err.message, 'error');
        card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        return;
      }
      const target = reply && reply.catch_up_enrollment ? reply.catch_up_enrollment.id : null;
      if (accept && target) {
        window.location.href = `/path?enrollment=${target}`;
        return;
      }
      card.remove();
      App.toast(accept ? 'Catch-up added.' : 'No problem. You start here.');
    });
  });

  // Retake placement: a confirmation first (App.retakePlacement), then the placement page.
  App.bindRetake(root);

  /* ── test out of one unit that is not checked yet ────────────────────────
   *
   * The same player and the same server rules as the test-out on the placement
   * result (js/placement.js), cut down to one unit: fresh questions until the
   * unit is proved, usually one to three, and a miss keeps it on the path. It
   * runs outside any placement, with no clock. Nothing is said about right or
   * wrong until the end, then the path is drawn again with the new plan.
   */
  function loadPlayer() {
    if (window.Player) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = '/js/player.js';
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('The question player did not load. Try again.'));
      document.head.appendChild(tag);
    });
  }

  async function testOutUnit(unitNumber, button) {
    const unit = units.find((u) => u.unit === unitNumber) || { unit: unitNumber, title: '' };
    let state;
    button.disabled = true;
    try {
      await loadPlayer();
      state = await App.api.get(`/api/placement/test-out/${enrollment.id}?unit=${unitNumber}`);
    } catch (err) {
      App.toast(err.message, 'error');
      button.disabled = false;
      return;
    }
    if (state.done || !state.question) {
      App.toast('There are no fresh questions left for that unit. It stays on your path.');
      window.location.reload();
      return;
    }
    let n = 0;
    const ask = (question) => {
      if (state.done || !question) return finished();
      n++;
      window.scrollTo(0, 0);
      root.innerHTML = `
        <div class="player" data-subject="${App.escapeHtml(track.id)}">
          <div class="player-head">
            <button class="icon-btn player-close" id="testout-stop" type="button" title="Back to the path" aria-label="Stop and go back to the path">${window.icon('x')}</button>
            <div class="player-titles">
              <h1 class="player-title">Test out of unit ${unitNumber}${unit.title ? `: ${App.escapeHtml(unit.title)}` : ''}</h1>
              <div class="player-sub">${App.escapeHtml(track.name)}, ${App.escapeHtml(App.gradeLabel(grade.name))}</div>
            </div>
            <div class="player-chips"><span class="chip">Question ${n}</span></div>
          </div>
          <div class="card" id="item"></div>
          <div class="row player-foot">
            <span class="small muted">Fresh questions until the unit is proved, usually 1&ndash;3. A miss keeps it on your path. No feedback until the end.</span>
          </div>
        </div>`;
      document.getElementById('testout-stop').addEventListener('click', () => window.location.reload());
      Player.render(document.getElementById('item'), question, {
        coach: false,
        onSubmit: async (answer) => {
          try {
            state = await App.api.post('/api/placement/test-out', {
              enrollment_id: enrollment.id, unit: unitNumber, slot: question.slot, answer, only_unit: true,
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

    function finished() {
      const s = state.summary || {};
      const passed = (s.passed || []).map(Number).includes(unitNumber);
      const learn = (s.to_learn || []).map(Number).includes(unitNumber);
      window.scrollTo(0, 0);
      root.innerHTML = `
        <div class="card" style="text-align:center">
          <h1 style="margin:12px 0 4px">${passed ? `You tested out of unit ${unitNumber}` : `Unit ${unitNumber} stays on your path`}</h1>
          <p class="muted">${passed
            ? 'Your path skips it now.'
            : learn ? 'A miss showed it is worth learning, so it is on your path to learn.'
              : 'It could not be proved this time. You will learn it when you get there.'}</p>
          <button class="btn btn-primary btn-lg" id="testout-back" type="button">Back to your path</button>
        </div>`;
      document.getElementById('testout-back').addEventListener('click', () => window.location.reload());
    }

    ask(state.question);
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-testout]');
    if (button) testOutUnit(Number(button.dataset.testout), button);
  });

  // A folded (skipped) unit opens and closes from its toggle button, or from a
  // click anywhere on its row that is not the "Review anyway" link.
  root.addEventListener('click', (event) => {
    const head = event.target.closest('.unit-skip-head');
    if (!head) return;
    const toggle = head.querySelector('.unit-skip-toggle');
    if (!toggle) return;
    if (event.target.closest('a, button') && event.target.closest('a, button') !== toggle) return;
    const fold = document.getElementById(toggle.getAttribute('aria-controls'));
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', toggle.getAttribute('aria-label').replace(open ? /^Show/ : /^Hide/, open ? 'Hide' : 'Show'));
    head.parentElement.classList.toggle('is-open', open);
    if (fold) fold.hidden = !open;
  });

  // A unit's heading opens and closes its levels the same way: from its toggle
  // button, or a click anywhere on the heading that is not another control.
  root.addEventListener('click', (event) => {
    const head = event.target.closest('.unit-head');
    if (!head) return;
    const toggle = head.querySelector('.unit-toggle');
    if (!toggle) return;
    const control = event.target.closest('a, button');
    if (control && control !== toggle) return;
    const body = document.getElementById(toggle.getAttribute('aria-controls'));
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', toggle.getAttribute('aria-label').replace(open ? /^Show/ : /^Hide/, open ? 'Hide' : 'Show'));
    if (body) body.hidden = !open;
  });
});
