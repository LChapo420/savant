/* A lesson or retention level built from blocks.
 *
 * The server sends a plan — `entries` of { block, data } in order, and the
 * script files those blocks live in — and this page loads only those files,
 * lays the plan out with the engine's compiler, and connects the graded checks
 * to the server. A check never carries its answer; `PolymathChecks.submit`
 * sends what the learner chose and shows what the server says.
 *
 * It also records, per block, how long it was on screen, what the learner did
 * there and what the block marked right or wrong (public/js/level-capture.js).
 * That is sent with the finish — and as they leave, if they leave without
 * finishing — and read by the after-level read: what this learner actually did
 * with each block is evidence about how they learn.
 */
(function () {
  function loadScripts(files) {
    return files.reduce((chain, src) => chain.then(() => new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => resolve(); // a missing block renders as a placeholder, not a broken page
      document.head.appendChild(s);
    })), Promise.resolve());
  }

  async function mount({ root, lesson, track, grade, level, enrollmentId, back }) {
    // Chat assist under every part of the level. A graded check uses the
    // question coach on its own item — guiding before it is answered, explaining
    // after; every other block gets help on that block's content. Every turn is
    // kept for the learner's record on the server.
    function attachAssist(section, entry) {
      const slot = document.createElement('div');
      slot.style.margin = '-10px 0 18px';
      section.insertAdjacentElement('afterend', slot);
      const isCheck = /^Check_/.test(entry.block);
      window.AssistChat.attach(slot, {
        label: isCheck ? 'Ask for help with this question' : 'Ask for help with this',
        send: async (messages) => {
          if (isCheck) {
            if (!entry.item_id) return 'Help is not available on this question.';
            if (!answered[entry.data.id]) {
              const r = await App.api.post(`/api/items/${entry.item_id}/coach`, { messages });
              return r.reply;
            }
            const question = [...messages].reverse().find((m) => m.role === 'user');
            if (!question) return 'You have answered this one. Ask me anything about it — why the answer is right, or why yours was not.';
            const r = await App.api.post(`/api/items/${entry.item_id}/ask`, { question: question.content });
            return r.reply;
          }
          const r = await App.api.post(`/api/lessons/${track}/${grade}/${level}/assist`, {
            target: { type: 'block', index: entry.ref }, messages,
          });
          return r.reply;
        },
      });
    }

    const plan = lesson.plan;
    const m = lesson.meta || {};
    const retention = m.block_kind === 'retention';
    const checkCount = plan.entries.filter((e) => /^Check_/.test(e.block)).length;
    const answered = { ...(plan.answered || {}) };
    let openedAt = Date.now();
    let readScrollBacks = () => null;

    root.innerHTML = `
      <div class="row-between" style="margin-bottom:14px; align-items:flex-start; flex-wrap:wrap">
        <div>
          <h1 style="margin:0 0 2px">${App.escapeHtml(m.topic || (retention ? 'Retention check' : 'Lesson'))}</h1>
          <div class="tiny muted">Level ${level} &middot; ${retention ? 'Retention check' : 'Lesson'}</div>
        </div>
        ${back}
      </div>
      <div class="card card-tight" style="margin-bottom:14px">
        <div class="small muted">
          <strong>${plan.tailored ? (retention ? 'Your retention check' : 'Your lesson') : (retention ? 'Retention check' : 'Lesson')}</strong>
          ${plan.tailored ? ' — laid out and written for you from how you\'ve been doing, what you have said, and what you found hard.' : ' — the same for everyone on this course.'}
          ${m.model ? `<br><span class="tiny">Written by ${App.escapeHtml(m.model)}${m.generated_at ? ` on ${App.escapeHtml(new Date(m.generated_at).toLocaleDateString())}` : ''}.</span>` : ''}
        </div>
      </div>
      <div id="block-level-host"></div>
      <div id="block-level-progress" class="small muted" style="margin-top:16px"></div>
      <div id="block-level-finish" style="margin-top:16px"></div>`;

    const host = document.getElementById('block-level-host');
    const progress = document.getElementById('block-level-progress');
    const finishHost = document.getElementById('block-level-finish');

    window.PolymathChecks = {
      answered,
      async submit(id, answer) {
        const started = window.PolymathChecks.shownAt[id] || openedAt;
        const result = await App.api.post(`/api/lessons/${track}/${grade}/${level}/check`, {
          check_id: id, answer, ms: Date.now() - started,
        });
        answered[id] = { ...result, choice: answer };
        renderFinish();
        return result;
      },
      shownAt: {},
    };

    host.innerHTML = '<div class="loading"><span class="spinner"></span>Laying out the level</div>';
    await loadScripts(['/engine/compiler.js', ...plan.files]);
    if (!window.LessonCompiler) {
      host.innerHTML = '<div class="notice notice-error">The block library could not be loaded. Reload the page to try again.</div>';
      return;
    }
    openedAt = Date.now();
    // How often the learner scrolls back up over what they have read, for the
    // learning scorecard; sent with the finish.
    let furthest = window.scrollY;
    let scrolledBack = false;
    let scrollBacks = 0;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y > furthest) furthest = y;
      const gap = Math.max(300, window.innerHeight / 3);
      if (!scrolledBack && furthest - y > gap) { scrolledBack = true; scrollBacks += 1; } else if (scrolledBack && furthest - y < 80) scrolledBack = false;
    }, { passive: true });
    readScrollBacks = () => scrollBacks;
    window.LessonCompiler.compile(host, plan.entries);
    const sections = Array.from(host.querySelectorAll('section[data-block]'));
    sections.forEach((section, i) => {
      section.setAttribute('data-index', String(i));
      const entry = plan.entries[i];
      if (entry && /^Check_/.test(entry.block)) window.PolymathChecks.shownAt[entry.data.id] = Date.now();
      if (entry && window.AssistChat) attachAssist(section, entry);
    });
    const report = window.LevelCapture.watch(sections, {
      // Checks are graded on the server already; their answers are items.
      skip: (section) => /^Check_/.test(section.getAttribute('data-block') || ''),
    });
    const leaving = window.LevelCapture.sendOnLeave(`/api/lessons/${track}/${grade}/${level}/log`,
      () => ({ source: 'blocks', blocks: report() }));

    function renderFinish() {
      const done = Object.keys(answered).length;
      const left = Math.max(0, checkCount - done);
      progress.textContent = checkCount
        ? `${done} of ${checkCount} checks answered${left ? ' — answer them all to finish.' : '.'}`
        : '';
      if (finishHost.getAttribute('data-finished')) return;
      finishHost.innerHTML = `
        <button class="btn btn-primary btn-lg" id="block-level-finish-btn" ${left ? 'disabled' : ''}>
          ${window.icon('check-circle')}Finish ${retention ? 'the retention check' : 'the lesson'}</button>`;
      const btn = document.getElementById('block-level-finish-btn');
      if (btn) btn.addEventListener('click', finish);
    }

    async function finish() {
      if (!enrollmentId) {
        finishHost.innerHTML = '<div class="notice notice-warn">This level is not on a course you are enrolled in, so there is nothing to finish.</div>';
        return;
      }
      finishHost.innerHTML = '<div class="small muted">Finishing…</div>';
      try {
        const done = await App.api.post(`/api/lessons/${track}/${grade}/${level}/block-finish`, {
          read_ms: Date.now() - openedAt,
          scroll_backs: readScrollBacks(),
          blocks: report(),
        });
        finishHost.setAttribute('data-finished', '1');
        leaving.cancel();
        const moved = done.advanced;
        const blockers = (done.progress && done.progress.blockers) || [];
        finishHost.innerHTML = `
          <div class="card">
            <div class="card-title">${window.icon('check-circle')}${retention ? 'Retention check finished' : 'Lesson finished'}</div>
            <p class="small muted" style="margin:0 0 10px">
              You got ${done.correct} of ${done.asked} checks right.
              ${!done.settled ? 'This was review: it does not change where you are on the path.'
    : moved ? `You are now on level ${done.level}.`
      : `You are still on level ${done.level}${blockers.length ? ` — ${App.escapeHtml(blockers[0])}` : ' — this level needs a little more work before it settles'}.`}
            </p>
            <div class="row-wrap">
              <a class="btn btn-primary" href="/session?enrollment=${enrollmentId}">
                ${window.icon('arrow-right')}${moved ? `Continue to level ${done.level}` : `Work at level ${done.level}`}</a>
              <a class="btn" href="/path?enrollment=${enrollmentId}">${window.icon('layers')}Your path</a>
            </div>
            <div id="block-level-feedback" style="margin-top:12px"></div>
          </div>`;
        const feedbackHost = document.getElementById('block-level-feedback');
        if (feedbackHost && window.Feedback) {
          feedbackHost.appendChild(window.Feedback.button(feedbackHost, { track, grade, level }, { ghost: true }));
        }
      } catch (err) {
        finishHost.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
        setTimeout(renderFinish, 2500);
      }
    }

    renderFinish();
  }

  /** The level is still being written: say so, and ask again until it is ready. */
  function waiting({ root, retention, back, onReady, enrollmentId, fallbackUrl }) {
    let tries = 0;
    const startedAt = Date.now();
    root.innerHTML = `
      <div class="row-between" style="margin-bottom:14px">
        <h1 style="margin:0">${retention ? 'Your retention check' : 'Your lesson'}</h1>${back}
      </div>
      <div class="card">
        <div class="loading"><span class="spinner"></span>Laying out and writing this level for you. This usually takes under a minute.</div>
        ${enrollmentId ? `<p class="small muted" style="margin:12px 0 0">Rather not wait? <a href="${fallbackUrl || `/session?enrollment=${enrollmentId}&ordinary=1`}">Do the standard session for this level instead</a>.</p>` : ''}
      </div>`;
    const tick = async () => {
      tries += 1;
      const ready = await onReady().catch(() => null);
      if (ready) return;
      // Still writing after about a minute: the learner is not kept waiting. The
      // standard session teaches the level (its lesson first, then the checks);
      // this level keeps being written for next time.
      if (fallbackUrl && Date.now() - startedAt >= 60000) { window.location.replace(fallbackUrl); return; }
      if (tries < 60) setTimeout(tick, 4000);
    };
    setTimeout(tick, 4000);
  }

  window.BlockLevel = { mount, waiting };
}());
