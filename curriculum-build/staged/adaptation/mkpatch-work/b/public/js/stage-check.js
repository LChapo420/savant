/* The stage check (staged skills round 3, patch 02; SKILL_STAGE_TESTS): each
 * skill a chess, piano or basketball stage asks for, how it is measured, how
 * far its proof has got, and the way to sit it. A check counts when it is cold
 * (the first sitting of that skill today, 20+ hours after practising it); a
 * skill is proven by cold passes on two different days.
 *
 * Network: GET and POST to /api/skills/checks only. Piano notes leave as key
 * numbers and times; basketball as counts. No sound, picture or clip is sent.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');
  const host = document.getElementById('stage-check');
  const enrollmentId = Number(App.query('enrollment'));
  const esc = App.escapeHtml;
  if (!enrollmentId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }
  const pathHref = `/path?enrollment=${enrollmentId}`;
  const api = `/api/skills/checks/${enrollmentId}`;
  let data;

  const when = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today.getTime() + 864e5).toDateString() === d.toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return sameDay ? `today at ${time}` : tomorrow ? `tomorrow at ${time}` : d.toLocaleDateString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  };

  function head(title, sub) {
    const [gradeMain] = App.gradeParts(data.grade.name);
    return `
      <div class="path-top skill-top" data-subject="${esc(data.track.id)}">
        <div>
          <a class="back-link" href="${pathHref}">${window.icon('arrow-left')}Your path</a>
          <div class="track-heading">
            ${App.symbol(data.track, { size: 'lg' })}
            <div>
              <h1>${esc(title)}</h1>
              <span class="tiny">${esc(data.track.name)}, ${esc(gradeMain)}. ${esc(sub || '')}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  const STATUS = {
    unproven: 'Not proven yet',
    lapsed: 'Slipped: prove it again',
    proven: 'Proven; waiting on its retention check',
    retained: 'Proven and kept',
    attest: 'Recorded, not machine-checked',
  };

  function progressLine(c) {
    if (!c.provable) return '';
    if (c.status === 'retained') return c.stale ? 'The last pass is over a week old: one more cold pass keeps it standing.' : '';
    if (c.status === 'proven') return c.retention_due_at ? `The retention check is ready ${when(c.retention_due_at)}.` : '';
    return `Cold passes so far: <span class="num">${c.proof_days}</span> of <span class="num">2</span> days.`;
  }

  function lastLine(c) {
    if (!c.last) return '';
    const res = c.last.pass ? 'passed' : 'below the bar';
    const counted = c.last.counts ? 'counted' : `did not count${c.last.why_not ? `: ${c.last.why_not}` : ''}`;
    return `Last sitting ${when(c.last.at)}: ${res}, ${counted}.`;
  }

  function row(c, primary) {
    const mark = c.status === 'retained' ? window.mark('tick', 'mark-plain') : c.status === 'proven' ? window.mark('circle') : '';
    let action = '';
    if (!c.provable) action = '<span class="skill-kind">Attested</span>';
    else if (!c.wired) action = '<span class="skill-kind">Not checkable here yet</span>';
    else if (c.open) action = `<button class="btn btn-sm${primary ? ' btn-primary' : ''}" type="button" data-sit="${esc(c.id)}">Carry on</button>`;
    else if (c.needs_sitting || c.status === 'retained') {
      action = c.cold_now
        ? `<button class="btn btn-sm${primary ? ' btn-primary' : ''}" type="button" data-sit="${esc(c.id)}">${c.how === 'count' ? 'Log it' : 'Sit it'}<span class="visually-hidden">: ${esc(c.title)}</span></button>`
        : `<span class="skill-kind">Cold ${esc(when(c.cold_at))}</span><button class="btn btn-sm btn-ghost" type="button" data-sit="${esc(c.id)}">Sit warm</button>`;
    }
    return `
      <li class="skill-row${c.due ? ' is-due' : ''}">
        <span class="skill-mark">${mark}</span>
        <span class="skill-main">
          <span class="skill-title">${esc(c.title)}</span>
          <span class="skill-why">${esc(c.says || c.test)}</span>
          <span class="skill-meta">${STATUS[c.status] || ''}. ${progressLine(c)} ${esc(lastLine(c))}</span>
          ${c.needs_build ? `<span class="skill-meta">Needs: ${esc(c.needs_build)}.</span>` : ''}
          ${c.gap ? `<span class="skill-meta">${esc(c.gap)}</span>` : ''}
        </span>
        <span class="skill-act">${action}</span>
      </li>`;
  }

  async function load() {
    try {
      data = await App.api.get(api);
    } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${esc(err.status === 404 ? 'There is no stage check on this subject.' : err.message)}
        <div style="margin-top:10px"><a class="btn btn-sm" href="${pathHref}">Back to your path</a></div></div>`;
      return;
    }
    overview();
  }

  function overview() {
    const o = data.checks;
    const provable = o.checks.filter((c) => c.provable);
    const proven = provable.filter((c) => c.status === 'proven' || c.status === 'retained').length;
    const wired = provable.filter((c) => c.wired).length;
    const due = o.checks.filter((c) => c.due);
    const firstDue = due[0] ? due[0].id : null;
    const knowledge = (o.knowledge || []).find((k) => k.id === data.grade.id);
    const lede = due.length
      ? `<span class="num">${due.length}</span> check${due.length === 1 ? ' is' : 's are'} ready now, cold. About <span class="num">${due.reduce((a, c) => a + (c.minutes || 0), 0)}</span> minutes.`
      : o.battery_open ? 'Nothing is ready cold right now.' : `This stage's checks open at the Final (level <span class="num">${data.enrollment.final_level}</span>). You can sit any of them sooner.`;
    host.innerHTML = `
      ${head('Stage check', `Stage ${o.stage.id}: ${o.stage.name}.`)}
      <div class="skill-now">
        <div>
          <p class="skill-lede">${lede}</p>
          <p class="small muted skill-note">A check counts when it is cold: your first sitting of that skill today, at least 20 hours after you last practised it. A skill is proven by cold passes on two different days, and one lucky pass cannot do it.</p>
        </div>
        <div class="tmeters">
          ${App.tmeter({ label: 'Measured skills proven', value: proven, target: provable.length, max: provable.length || 1, unit: 'count' })}
          ${knowledge && knowledge.total ? App.tmeter({ label: 'Lesson objectives proven and kept', value: knowledge.total - knowledge.blocking, target: knowledge.total, max: knowledge.total, unit: 'count' }) : ''}
          ${wired < provable.length ? `<p class="tiny muted">${provable.length - wired} of these ${provable.length} skills cannot be checked in the app yet.</p>` : ''}
        </div>
      </div>
      <section class="skill-section" aria-labelledby="checks-h">
        <h2 class="section-title" id="checks-h">The checks</h2>
        <ol class="skill-list">${o.checks.filter((c) => c.provable).map((c) => row(c, c.id === firstDue)).join('')}</ol>
      </section>
      ${o.checks.some((c) => !c.provable) ? `
        <section class="skill-section" aria-labelledby="attest-h">
          <h2 class="section-title" id="attest-h">Recorded, not machine-checked</h2>
          <p class="small muted skill-note">A person's review, a film or your own rating never proves a skill here. These are listed and do not hold the stage.</p>
          <ol class="skill-list">${o.checks.filter((c) => !c.provable).map((c) => row(c, false)).join('')}</ol>
        </section>` : ''}`;
    host.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => sit(b.getAttribute('data-sit'), b)));
  }

  function sittingFrame(c, warm) {
    host.innerHTML = `
      <div class="player skill-player" data-subject="${esc(data.track.id)}">
        <div class="player-head">
          <a class="icon-btn player-close" href="#" data-leave title="Back to the checks" aria-label="Back to the checks">${window.icon('x')}</a>
          <div class="player-titles">
            <h1 id="title">${esc(c.title)}</h1>
            <div id="subtitle">${esc(c.says || c.test)}</div>
          </div>
        </div>
        ${warm ? `<p class="notice notice-warn">This sitting is warm: it is recorded, and it will not count. It counts cold ${esc(when(c.cold_at))}.</p>` : ''}
        <div class="card" id="runner"></div>
      </div>`;
    host.querySelector('[data-leave]').addEventListener('click', (e) => { e.preventDefault(); load(); });
    return host.querySelector('#runner');
  }

  async function sit(id, button) {
    const c = data.checks.checks.find((x) => x.id === id);
    if (!c) return;
    if (c.how === 'count') {
      const runner = sittingFrame(c, !c.cold_now);
      runner.insertAdjacentHTML('beforebegin', c.baseline != null ? `<p class="small">Your baseline: <b class="num">${c.baseline}</b>.</p>` : '');
      SkillKit.count(runner, {
        fields: c.fields, hands: c.hands, cameraOk: c.camera_ok,
        onSubmit: async (body, form) => {
          form.querySelector('[type=submit]').disabled = true;
          try {
            const out = await App.api.post(`${api}/${encodeURIComponent(id)}/count`, body);
            result(c, out.result);
          } catch (err) { App.toast(err.message, 'error'); form.querySelector('[type=submit]').disabled = false; }
        },
      });
      return;
    }
    if (button) { button.disabled = true; button.innerHTML = '<span class="spinner"></span>Setting up'; }
    let out;
    try { out = await App.api.post(`${api}/${encodeURIComponent(id)}/start`, {}); } catch (err) { App.toast(err.message, 'error'); load(); return; }
    const s = out.sitting;
    const runner = sittingFrame(c, !s.cold);
    const finish = async () => {
      runner.innerHTML = '<div class="loading"><span class="spinner"></span>Marking</div>';
      try {
        const r = await App.api.post(`${api}/${encodeURIComponent(id)}/finish`, {});
        result(c, r.result);
      } catch (err) {
        runner.innerHTML = `<div class="notice notice-warn">${esc(err.message)}</div><div class="path-actions"><button class="btn btn-primary" type="button" data-retry>Check again</button><button class="btn" type="button" data-back>Back to the checks</button></div>`;
        runner.querySelector('[data-retry]').addEventListener('click', finish);
        runner.querySelector('[data-back]').addEventListener('click', load);
      }
    };
    if (s.how === 'items') {
      SkillKit.items(runner, {
        items: s.items, answered: s.answered, subject: data.track.id, feedback: false,
        onAnswer: (index, answer, source) => App.api.post(`${api}/${encodeURIComponent(id)}/answer`, { index, answer, source }),
        onDone: finish,
      });
    } else if (s.how === 'take') {
      SkillKit.takes(runner, {
        parts: s.parts,
        onTake: (part, played, origin) => App.api.post(`${api}/${encodeURIComponent(id)}/take`, { part, played, origin }),
        onDone: finish,
      });
    } else if (s.how === 'puzzles') {
      runner.innerHTML = `
        <p class="skill-stem">Solve at least <span class="num">${s.min}</span> rated puzzles in the puzzle trainer, then come back.</p>
        <p class="small muted">Your rating has to reach <span class="num">${s.cut}</span>, with a deviation of <span class="num">${s.rd}</span> or less, so it is a settled rating rather than a lucky run.</p>
        <div class="path-actions"><a class="btn" href="/engine/chess/puzzles.html" target="_blank" rel="noopener">Open the puzzle trainer</a><button class="btn btn-primary" type="button" data-done>I have done them</button></div>`;
      runner.querySelector('[data-done]').addEventListener('click', finish);
    }
  }

  function result(c, r) {
    const runner = host.querySelector('#runner') || host;
    if (r.baseline != null && r.pass === null) {
      runner.innerHTML = `<p class="skill-verdict">${window.mark('dot')}<span>Baseline recorded: <b class="num">${r.baseline}</b>.</span></p>
        <p class="small muted">${esc(r.why)}. From your next cold count on, it is measured against this.</p>
        <div class="path-actions"><button class="btn btn-primary" type="button" data-back>Back to the checks</button></div>`;
      runner.querySelector('[data-back]').addEventListener('click', load);
      return;
    }
    const status = { unproven: 'Not proven yet.', lapsed: 'Slipped: prove it again.', proven: 'Proven.', retained: 'Proven and kept.' }[r.status] || '';
    const counted = r.counted ? 'It counted: a cold sitting.' : `It did not count${r.why ? `: ${r.why}` : ''}.`;
    const review = (r.review || []).filter((x) => !x.correct);
    runner.innerHTML = `
      <p class="skill-verdict ${r.pass ? 'is-right' : 'is-wrong'}">${window.mark(r.pass ? 'tick' : 'cross')}<span>${r.pass ? 'At the bar.' : 'Below the bar.'}${r.right != null ? ` <span class="num">${r.right}</span> of <span class="num">${r.n}</span> right.` : c.how === 'count' && r.score != null && r.score <= 1 && /rate/.test(c.says || '') ? ` Chance your true rate is at the bar: <span class="num">${Math.floor(r.score * 100)}%</span>.` : c.how === 'take' && r.score != null ? ` Notes right: <span class="num">${Math.round(r.score * 100)}%</span>.` : c.how === 'puzzles' && r.detail ? ` Rating <span class="num">${r.detail.rating}</span>.` : ''}</span></p>
      <p class="small">${esc(counted)} ${r.proved ? '<b>This proves it.</b>' : esc(status)}</p>
      ${r.note ? `<p class="small muted">${esc(r.note)}</p>` : ''}
      ${review.length ? `<details class="skill-review"><summary>The ones you missed (${review.length})</summary><ol>${review.map((x) => `<li><span class="skill-why">${esc(x.prompt).replace(/\n/g, '<br>')}</span> You: <b>${esc(typeof x.given === 'object' ? JSON.stringify(x.given) : x.given || 'nothing')}</b>. Answer: <b>${esc(x.answer || '')}</b>.</li>`).join('')}</ol></details>` : ''}
      <div class="path-actions"><button class="btn btn-primary" type="button" data-back>Back to the checks</button></div>`;
    runner.querySelector('[data-back]').addEventListener('click', load);
    runner.querySelector('[data-back]').focus();
  }

  load();
});
