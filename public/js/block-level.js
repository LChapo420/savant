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
    // A lesson arriving part by part (services/first-block.js): what has passed its check so far; the rest come below it (m.partial).
    let checkCount = m.partial ? m.partial.total_checks : plan.entries.filter((e) => /^Check_/.test(e.block)).length;
    let stillComing = !!m.partial;
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
    const report = window.LevelCapture.watch(sections.slice(), {
      // Checks are graded on the server already; their answers are items.
      skip: (section) => /^Check_/.test(section.getAttribute('data-block') || ''),
    });
    const leaving = window.LevelCapture.sendOnLeave(`/api/lessons/${track}/${grade}/${level}/log`,
      () => ({ source: 'blocks', blocks: report() }));

    function renderFinish() {
      const done = Object.keys(answered).length;
      const left = Math.max(0, checkCount - done);
      progress.textContent = checkCount
        ? `${done} of ${checkCount} checks answered${left ? ' — answer them all to finish.' : '.'}${stillComing ? ' The next part appears below once its facts are checked.' : ''}`
        : '';
      if (finishHost.getAttribute('data-finished')) return;
      finishHost.innerHTML = `
        <button class="btn btn-primary btn-lg" id="block-level-finish-btn" ${left || stillComing ? 'disabled' : ''}>
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

    // Later parts arrive below what is on the page, once their own check has passed: nothing above them changes, so the reader does not move wherever they are.
    if (m.partial) {
      const keyOf = (e) => (/^Check_/.test(e.block) ? `check:${e.data.id}` : `block:${e.ref}`);
      const shown = new Set(plan.entries.map(keyOf));
      const loaded = new Set(plan.files);
      let version = m.partial.version;
      let lastNew = Date.now();
      // Waiting a long time for the next part: say so, and offer the standard session. It sits under the lesson, so it moves nothing the learner is reading.
      const slowNote = () => {
        const at = document.getElementById('block-level-slow');
        if (stillComing && enrollmentId && Date.now() - lastNew > 45000) {
          if (!at) { const d = document.createElement('p'); d.id = 'block-level-slow'; d.className = 'small muted'; d.style.margin = '8px 0 0'; d.innerHTML = `The next part is taking longer than usual to check. Rather not wait? <a href="/session?enrollment=${enrollmentId}&ordinary=1">Do the standard session for this level instead</a>.`; progress.insertAdjacentElement('afterend', d); }
        } else if (at) at.remove();
      };
      const addEntry = (entry) => {
        const section = document.createElement('section');
        section.setAttribute('data-block', entry.block || '');
        section.style.margin = '0 0 18px';
        host.appendChild(section);
        window.LessonCompiler.renderBlock(section, entry);
        section.setAttribute('data-index', String(sections.length));
        sections.push(section);
        plan.entries.push(entry);
        if (/^Check_/.test(entry.block)) window.PolymathChecks.shownAt[entry.data.id] = Date.now();
        if (window.AssistChat) attachAssist(section, entry);
        if (report.add) report.add(section);
      };
      const tick = async () => {
        let r = null;
        try { r = await App.api.get(`/api/lessons/${track}/${grade}/${level}/parts?v=${version}`); } catch (e) { r = null; }
        if (r && r.state === 'failed') {
          stillComing = false;
          renderFinish();
          finishHost.innerHTML = `<div class="notice notice-warn">The rest of this lesson could not be checked, so it is not shown.${enrollmentId ? ` <a class="notice-link" href="/session?enrollment=${enrollmentId}&ordinary=1">Do the standard session for this level</a>.` : ''}</div>`;
          return;
        }
        if (r && r.plan) {
          const fresh = r.plan.files.filter((f) => !loaded.has(f));
          fresh.forEach((f) => loaded.add(f));
          if (fresh.length) await loadScripts(fresh);
          r.plan.entries.filter((e) => !shown.has(keyOf(e))).forEach((e) => { shown.add(keyOf(e)); addEntry(e); lastNew = Date.now(); });
          Object.assign(answered, r.plan.answered || {});
          if (r.version) version = r.version;
          if (r.total_checks) checkCount = r.total_checks;
          if (r.state === 'ready') { stillComing = false; checkCount = plan.entries.filter((e) => /^Check_/.test(e.block)).length; }
          renderFinish();
          window.__partsShown = plan.entries.length;
        }
        slowNote();
        if (stillComing) setTimeout(tick, 1500);
      };
      setTimeout(tick, 1000);
    }

    // The personal layer (services/lesson-layer.js): the shared lesson is already open; the learner's own hook, why and analogies fill the
    // slot reserved for them as soon as they are written, without moving what is being read (the slot keeps its height; any growth is
    // taken up by the scroll position). Late or never: the plain lesson stays as it is.
    if (m.layer) {
      // The slot sits after the FIRST block (and its help slot), not above the lesson: a learner reading the top of the page (scroll 0, where the
      // browser does not hold the position when something grows above) is not moved when the layer arrives, since nothing above or inside what they
      // read changes. Its height is reserved at once (a skeleton the size a layer usually takes), so even the content below does not jump; the
      // reserve stays after the fill. A slot above the viewport that grows is made up by the scroll position.
      const slot = document.createElement('div');
      slot.id = 'block-level-layer';
      slot.className = 'card card-tight';
      slot.style.cssText = `margin:0 0 14px; min-height:${window.innerWidth < 600 ? 430 : 290}px; overflow-anchor:none`;
      slot.innerHTML = '<div class="small muted">Making this lesson yours&hellip;</div>';
      const first = sections[0];
      const after = first && first.nextElementSibling && first.nextElementSibling.tagName === 'DIV' && first.nextElementSibling.id !== 'block-level-layer' ? first.nextElementSibling : first;
      if (after) after.insertAdjacentElement('afterend', slot); else host.appendChild(slot);
      const esc = App.escapeHtml;
      // A reader past the slot must not move when it changes size. Chrome's scroll anchoring may already hold them and Safari's does not, so measure
      // what really moved and correct only that, before the next paint (adding the size change on top moved a phone reader 167 px, and 430 px on a drop).
      const hold = (change) => {
        const anchor = slot.nextElementSibling;
        const past = !!anchor && slot.getBoundingClientRect().top < 0;
        const y0 = past ? anchor.getBoundingClientRect().top : 0;
        change();
        if (!past) return;
        const settle = () => { const moved = anchor.getBoundingClientRect().top - y0; if (Math.abs(moved) >= 1) window.scrollBy({ top: moved, behavior: 'instant' }); };
        settle();
        requestAnimationFrame(settle);
      };
      const fill = (layer) => hold(() => {
        slot.style.minHeight = '0'; // the reserve was for the wait; a short layer doesn't keep an empty card
        slot.innerHTML = `
          <div class="tiny muted" style="margin-bottom:6px">For you</div>
          ${layer.hook ? `<p style="margin:0 0 8px"><strong>${esc(layer.hook)}</strong></p>` : ''}
          ${layer.why ? `<p class="small" style="margin:0 0 8px">${esc(layer.why)}</p>` : ''}
          ${(layer.analogies || []).map((a) => `<p class="small" style="margin:0 0 6px"><span class="muted">${esc(a.point)}:</span> ${esc(a.text)}</p>`).join('')}`;
        slot.setAttribute('data-layer', 'shown');
        window.__layerShownAt = Date.now();
      });
      const drop = () => hold(() => slot.remove());
      let tries = 0;
      const tick = async () => {
        tries += 1;
        try {
          const r = await App.api.get(`/api/lessons/${track}/${grade}/${level}/layer`);
          if (r.state === 'ready' && r.layer) { fill(r.layer); return; }
          if (r.state === 'none') { drop(); return; }
        } catch (e) { /* ask again */ }
        if (tries < 45) setTimeout(tick, tries < 12 ? 600 : 2000); else drop();
      };
      setTimeout(tick, 400);
    }
  }

  /** What the write is doing now, in words: said only because it is what the server reports. */
  function stageText(stage) {
    if (stage === 'checking' || stage === 'reading') return 'The first part is written. Its facts are being checked; it opens as soon as they pass.';
    return 'Writing the first part of this lesson for you. It opens as soon as its facts are checked.';
  }

  /** The level is still being written: say so, and ask again until it is ready. */
  function waiting({ root, retention, back, onReady, enrollmentId, fallbackUrl, preview = null, waitMs = 8000 }) {
    let tries = 0;
    const startedAt = Date.now();
    root.innerHTML = `
      <div class="row-between" style="margin-bottom:14px">
        <h1 style="margin:0">${retention ? 'Your retention check' : 'Your lesson'}</h1>${back}
      </div>
      <div class="card">
        ${preview ? `<p style="margin:0 0 8px"><strong>${App.escapeHtml(preview.topic)}</strong></p>
        ${preview.covers ? `<p class="small" style="margin:0 0 8px">${App.escapeHtml(preview.covers)}</p>` : ''}
        ${(preview.skills || []).length ? `<p class="small muted" style="margin:0 0 12px">You will work on: ${preview.skills.map(App.escapeHtml).join(', ')}.</p>` : ''}
        <div class="loading"><span class="spinner"></span><span id="block-level-stage">${stageText(preview.stage)}</span></div>` : '<div class="loading"><span class="spinner"></span>Laying out and writing this level for you. This usually takes under a minute.</div>'}
        ${enrollmentId ? `<p class="small muted" style="margin:12px 0 0">Rather not wait? <a href="${fallbackUrl || `/session?enrollment=${enrollmentId}&ordinary=1`}">Do the standard session for this level instead</a>.</p>` : ''}
      </div>`;
    // Owner, 2026-11-04: nothing a learner reaches should keep them waiting. Still writing after about 8 s: open the standard
    // session for this level (its lesson first, then the checks); the personalised level keeps being written for next time.
    const fallback = fallbackUrl || (enrollmentId ? `/session?enrollment=${enrollmentId}&ordinary=1` : null);
    const tick = async () => {
      tries += 1;
      const ready = await onReady((again) => {
        const at = document.getElementById('block-level-stage');
        if (at && again && again.preview) at.textContent = stageText(again.preview.stage);
      }).catch(() => null);
      if (ready) return;
      if (fallback && Date.now() - startedAt >= waitMs) { window.location.replace(fallback); return; }
      if (tries < 90) setTimeout(tick, preview ? 1000 : fallback ? 2000 : 4000);
    };
    setTimeout(tick, preview ? 800 : 2000);
  }

  window.BlockLevel = { mount, waiting };
}());
