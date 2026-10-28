/* What is left in this stage (staged skills round 3, patch 03;
 * SKILL_STAGE_GATE): before a chess, piano or basketball stage can be left,
 * every machine-checkable skill it asks for must be proven on cold passes on
 * two different days, and a proof older than a week passed again. The page
 * lists what is still missing, what waits on its retention check, and what
 * only a person or the learner can record (never a gate).
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');
  const host = document.getElementById('stage-left');
  const enrollmentId = Number(App.query('enrollment'));
  const esc = App.escapeHtml;
  if (!enrollmentId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }
  const pathHref = `/path?enrollment=${enrollmentId}`;
  const checkHref = `/stage-check?enrollment=${enrollmentId}`;
  const title = (m) => m.title || String(m.metric || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const when = (iso) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString() ? `today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : d.toLocaleDateString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  };

  let data;
  async function load() {
    try { data = await App.api.get(`/api/skills/left/${enrollmentId}`); } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${esc(err.status === 404 ? 'There is no stage gate on this subject.' : err.message)}
        <div style="margin-top:10px"><a class="btn btn-sm" href="${pathHref}">Back to your path</a></div></div>`;
      return;
    }
    draw();
  }

  function list(id, heading, note, rows, line) {
    if (!rows.length) return '';
    return `
      <section class="skill-section" aria-labelledby="${id}">
        <h2 class="section-title" id="${id}">${esc(heading)}</h2>
        ${note ? `<p class="small muted skill-note">${note}</p>` : ''}
        <ol class="skill-list">${rows.map((m) => `
          <li class="skill-row">
            <span class="skill-mark"></span>
            <span class="skill-main">
              <span class="skill-title">${esc(title(m))}</span>
              <span class="skill-why">${esc(m.plain || m.test)}</span>
              <span class="skill-meta">${line(m)}</span>
            </span>
            <span class="skill-act">${m.wired === false ? '<span class="skill-kind">Not checkable here yet</span>' : m.cold_now ? '<span class="skill-kind">Ready now, cold</span>' : m.cold_at ? `<span class="skill-kind">Cold ${esc(when(m.cold_at))}</span>` : ''}</span>
          </li>`).join('')}</ol>
      </section>`;
  }

  function draw() {
    const l = data.left;
    const [gradeMain] = App.gradeParts(data.grade.name);
    const n = l.missing.length + l.unkept.length + l.stale.length;
    const held = !!data.enrollment.held_at && data.enrollment.status !== 'graduated';
    const lede = l.complete
      ? `Every measured skill of this stage is proven${held ? '. Graduation can go ahead.' : '.'}`
      : `<span class="num">${n}</span> measured skill${n === 1 ? '' : 's'} still to prove before you leave this stage.${held ? ' You passed the Final; graduation waits on these. You will not sit the Final again.' : ''}`;
    host.innerHTML = `
      <div class="path-top skill-top" data-subject="${esc(data.track.id)}">
        <div>
          <a class="back-link" href="${pathHref}">${window.icon('arrow-left')}Your path</a>
          <div class="track-heading">
            ${App.symbol(data.track, { size: 'lg' })}
            <div>
              <h1>What is left in this stage</h1>
              <span class="tiny">${esc(data.track.name)}, ${esc(gradeMain)}. Stage: ${esc(l.stage.name)}.</span>
            </div>
          </div>
        </div>
      </div>
      <div class="skill-now">
        <div>
          <p class="skill-lede">${lede}</p>
          <p class="small muted skill-note">A skill is proven by cold passes on two different days, re-checked from every sitting you have done. A proof more than a week old needs one more cold pass, so the stage is left with every skill standing.${l.two_day_rule ? ` ${esc(l.two_day_rule)}` : ''}${l.mode === 'shadow' ? ' For now this list is for information only: it does not hold you back yet.' : ''}</p>
          <div class="path-actions">
            ${held && l.complete ? '<button class="btn btn-primary btn-lg" type="button" id="graduate">Graduate</button>' : l.checks_applied ? `<a class="btn btn-primary btn-lg" href="${checkHref}">Go to the stage check</a>` : ''}
          </div>
        </div>
        <div class="tmeters">
          ${App.tmeter({ label: 'Measured skills proven', value: l.proven, target: l.provable, max: l.provable || 1, unit: 'count' })}
        </div>
      </div>
      ${list('missing-h', 'Not proven yet', 'Each needs cold passes on two different days.', l.missing, (m) => `Cold passes so far: <span class="num">${m.proof_days}</span> of <span class="num">2</span> days.${m.last ? ` Last sitting ${esc(when(m.last.at))}: ${m.last.pass ? 'passed' : 'below the bar'}${m.last.counts ? '' : ', did not count'}.` : ''}`)}
      ${list('unkept-h', 'Proven, waiting on the retention check', 'Proven, and asked once more after the stage\'s retention gap.', l.unkept, (m) => (m.retention_due_at ? `Retention check ready ${esc(when(m.retention_due_at))}.` : ''))}
      ${list('stale-h', 'Proven over a week ago', 'One more cold pass keeps it standing.', l.stale, () => '')}
      ${l.attest.length ? `
        <section class="skill-section" aria-labelledby="attest-h">
          <h2 class="section-title" id="attest-h">Recorded, not machine-checked</h2>
          <p class="small muted skill-note">These are kept on your record. They never hold the stage.</p>
          <ol class="skill-list">${l.attest.map((m) => `<li class="skill-row"><span class="skill-mark"></span><span class="skill-main"><span class="skill-title">${esc(title(m))}</span><span class="skill-why">${esc(m.plain || m.test)}</span></span><span class="skill-act"><span class="skill-kind">Recorded, not marked</span></span></li>`).join('')}</ol>
        </section>` : ''}
      ${(l.knowledge || []).length ? `
        <section class="skill-section" aria-labelledby="know-h">
          <h2 class="section-title" id="know-h">The stage's lessons</h2>
          <p class="small muted skill-note">The lessons' objectives are checked separately, before graduation.</p>
          <ol class="skill-list">${l.knowledge.map((k) => `<li class="skill-row"><span class="skill-mark">${k.complete ? window.mark('tick', 'mark-plain') : ''}</span><span class="skill-main"><span class="skill-title">${esc(k.name || k.id)}</span><span class="skill-why">${esc(k.why || '')}</span></span><span class="skill-act"></span></li>`).join('')}</ol>
        </section>` : ''}`;
    const g = document.getElementById('graduate');
    if (g) g.addEventListener('click', async () => {
      g.disabled = true;
      try {
        const r = await App.api.post(`/api/skills/left/${enrollmentId}/graduate`, {});
        if (r.graduated) { App.toast('Graduated.', 'success'); window.location.href = pathHref; return; }
        App.toast(r.coverage_held ? 'Graduation still waits on lesson objectives.' : 'Not yet.', 'error');
        load();
      } catch (err) { App.toast(err.message, 'error'); g.disabled = false; }
    });
  }

  load();
});
