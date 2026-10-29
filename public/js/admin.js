/* The admin area: every learner, and for each one their learning-style summary,
 * all hundred scorecard stats, what they told us about themselves, the exact
 * brief their levels are written from, progress, and the evidence behind it.
 * Read-only.
 *
 * The server decides who is an admin; this page only renders what it is given. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'admin');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;

  if (!user.is_admin) {
    root.innerHTML = '<div class="notice notice-error">Page not found. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  const when = (iso) => (iso ? App.timeAgo(iso) : '—');
  const pctOr = (v) => (v === null || v === undefined ? '—' : App.pct(v));

  let list;
  try {
    list = await App.api.get('/api/admin/users');
  } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }

  function renderList(filter = '') {
    const q = filter.trim().toLowerCase();
    const rows = list.users.filter((u) => !q
      || `${u.display_name} ${u.email} ${u.interests} ${u.plan} ${u.subjects.map((s) => `${s.track} ${s.grade}`).join(' ')}`
        .toLowerCase().includes(q));
    const t = list.totals;
    root.innerHTML = `
      <div class="row-between" style="margin-bottom:12px; flex-wrap:wrap; gap:8px">
        <h1 style="margin:0">Admin</h1>
        <div class="row" style="gap:8px; flex-wrap:wrap">
          <a class="btn btn-sm" href="#metrics">${window.icon('trending-up')}Real-user metrics</a>
          <a class="btn btn-sm" href="/api/admin/export.csv" download>${window.icon('chart')}Export every scorecard (CSV)</a>
        </div>
      </div>
      <p class="tiny muted" style="margin:0 0 10px">These totals include every account (test, demo and your own). For counts of real users only, open Real-user metrics.</p>
      <div class="grid grid-3">
        <div class="card card-tight stat-block"><span class="value">${t.users}</span><span class="label">Users</span></div>
        <div class="card card-tight stat-block"><span class="value">${t.active_7d}</span><span class="label">Active in 7 days</span></div>
        <div class="card card-tight stat-block"><span class="value">${t.answers}</span><span class="label">Answers</span></div>
        <div class="card card-tight stat-block"><span class="value">${t.tailored_pages}</span><span class="label">Levels written for a learner</span></div>
        <div class="card card-tight stat-block"><span class="value">${t.rejected_pages}</span><span class="label">Rewrites refused by the checks</span></div>
        <div class="card card-tight stat-block"><span class="value">${t.lesson_pages_finished} / ${t.holdout_pages_finished}</span><span class="label">Lesson pages finished / holdout</span></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="answer-row" style="margin-bottom:10px">
          <input type="text" id="search" placeholder="Search by name, email, interest, plan or subject" value="${esc(filter)}">
        </div>
        <div class="table-scroll">
          <table class="data admin-table"><thead><tr>
            <th>Learner</th><th>Plan</th><th>Subjects</th><th>Last active</th><th>Accuracy</th>
            <th>Known</th><th>Interests</th><th>Strongest tendencies</th>
          </tr></thead><tbody>
            ${rows.map((u) => `
              <tr data-id="${u.id}">
                <td><a href="#user=${esc(u.id)}"><strong>${esc(u.display_name)}</strong></a>${u.is_admin ? ' <span class="chip">admin</span>' : ''}<div class="tiny muted">${esc(u.email)}</div></td>
                <td class="small">${esc(u.plan)}${u.tailored_pages ? `<div class="tiny muted">${u.tailored_pages} pages written</div>` : ''}</td>
                <td class="small">${u.subjects.map((s) => `${esc(s.track)} · ${esc(s.grade)} <span class="tiny muted">L${s.level}</span>`).join('<br>') || '—'}</td>
                <td class="small nowrap">${esc(when(u.last_active))}</td>
                <td class="small">${pctOr(u.accuracy)} <span class="tiny muted">(${u.answered})</span></td>
                <td class="small">${u.scorecard_confidence}%</td>
                <td class="tiny">${esc(u.interests.slice(0, 120)) || '—'}</td>
                <td class="tiny">${u.top_traits.map(esc).join('; ') || '<span class="muted">not enough evidence yet</span>'}</td>
              </tr>`).join('') || '<tr><td colspan="8" class="small muted">No matching users.</td></tr>'}
          </tbody></table>
        </div>
      </div>`;
    const search = document.getElementById('search');
    search.addEventListener('input', () => {
      const pos = search.selectionStart;
      renderList(search.value);
      const again = document.getElementById('search');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    root.querySelector('tbody').addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-id]');
      if (row) window.location.hash = `user=${row.dataset.id}`;
    });
  }

  const table = (rows) => (rows ? `<div class="table-scroll"><table class="data"><tbody>${rows}</tbody></table></div>` : '');

  async function renderUser(id, track = '') {
    root.innerHTML = '<div class="loading"><span class="spinner"></span>Loading learner</div>';
    let d;
    try {
      d = await App.api.get(`/api/admin/users/${encodeURIComponent(id)}${track ? `?track=${encodeURIComponent(track)}` : ''}`);
    } catch (err) {
      root.innerHTML = `<div class="notice notice-error">${esc(err.message)} <a href="#">Back</a></div>`;
      return;
    }
    const u = d.user;
    const s = d.summary;
    const said = Object.entries(d.survey).filter(([, v]) => String(v || '').trim());

    root.innerHTML = `
      <div class="row-between" style="margin-bottom:12px; flex-wrap:wrap; gap:8px">
        <div>
          <h1 style="margin-bottom:2px">${esc(u.display_name)}</h1>
          <div class="small muted">${esc(u.email)} · joined ${new Date(u.created_at).toLocaleDateString()} · last active ${esc(when(u.last_active))}
            · plan ${esc(d.plan)}${d.levels_written_for_them ? ' (levels are written for them)' : ''}</div>
        </div>
        <a class="btn btn-ghost btn-sm" href="#">${window.icon('arrow-left')}All users</a>
      </div>

      <div class="grid grid-3">
        <div class="card card-tight stat-block"><span class="value">${d.scorecard.overall_confidence}%</span><span class="label">How well we know them</span></div>
        <div class="card card-tight stat-block"><span class="value">${pctOr(u.accuracy)}</span><span class="label">Accuracy (${u.answered} answers)</span></div>
        <div class="card card-tight stat-block"><span class="value">${u.xp} · ${u.streak}d</span><span class="label">XP · streak</span></div>
      </div>

      <h2 class="section-title">${window.icon('brain')}Learning style summary</h2>
      <div class="card">
        <p style="margin-top:0"><strong>${esc(s.headline)}</strong></p>
        ${s.paragraphs.map((p) => `<p class="small" style="margin:6px 0">${esc(p)}</p>`).join('')}
      </div>

      <h2 class="section-title">${window.icon('user')}What they told us</h2>
      <div class="card">
        ${said.length
          ? said.map(([k, v]) => `<div class="small" style="font-weight:600; margin-top:6px">${esc(d.survey_fields[k] || k)}</div><div class="small" style="white-space:pre-wrap">${esc(v)}</div>`).join('')
          : '<p class="small muted" style="margin:0">They have not filled in the About you survey.</p>'}
        ${d.conclusions.length ? `<div class="small" style="font-weight:600; margin-top:12px">Concluded from their feedback</div>
          <ul class="small" style="margin:4px 0 0; padding-left:18px">${d.conclusions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      </div>

      <h2 class="section-title">${window.icon('settings')}How their levels are written right now</h2>
      <div class="card">
        ${d.applied.length
          ? `<ol class="small" style="margin:0; padding-left:20px">${d.applied.map((a) => `<li>${a.strong ? '<strong>(strong)</strong> ' : ''}${esc(a.text)} <span class="tiny muted">${esc(a.name)}, ${a.confidence}% sure</span></li>`).join('')}</ol>`
          : '<p class="small muted" style="margin:0">No confident stats yet: their levels use a balanced default.</p>'}
        ${d.next_arm ? `<p class="tiny muted" style="margin:10px 0 0">Their current level is ${d.next_arm.arm === 'holdout'
    ? 'a <strong>holdout</strong>: it is served unchanged, for comparison.'
    : d.next_arm.experiment ? `trying <strong>${esc(d.next_arm.experiment.label)}</strong> (${d.next_arm.experiment.arm === 'high' ? 'with' : 'without'}).` : 'written with the instructions above.'}</p>` : ''}
        ${d.brief ? `<details style="margin-top:12px">
          <summary class="small" style="cursor:pointer; font-weight:600">The exact brief sent with their next level (${esc(d.brief_for)})</summary>
          <pre class="prompt-block" style="margin-top:8px">${esc(d.brief)}</pre>
        </details>` : ''}
      </div>

      <div class="row-between" style="margin-top:22px; flex-wrap:wrap; gap:8px">
        <h2 class="section-title" style="margin:0">${window.icon('chart')}All 100 learning stats</h2>
        <div class="row" style="gap:8px">
          <button class="btn btn-sm" type="button" id="expand">Expand all</button>
          <label class="small">Subject
            <select id="track">
              <option value="">overall</option>
              ${d.scorecard.tracks.map((t) => `<option value="${esc(t)}" ${t === track ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      <div>
        ${d.scorecard.categories.map((cat) => {
          const sure = cat.stats.filter((st) => st.confidence >= 30).length;
          return `<details class="sc-category">
            <summary><span>${esc(cat.name)}</span><span class="tiny muted">${sure} of ${cat.stats.length} measured</span></summary>
            <div>${cat.stats.map((st) => `
              <div class="sc-stat">
                <div class="small" style="font-weight:600">${esc(st.name)}<div class="tiny muted">${st.observations} observations</div></div>
                <div>
                  <div class="meter"><span style="width:${st.score}%; opacity:${(0.25 + 0.75 * st.confidence / 100).toFixed(2)}"></span></div>
                  <div class="ends"><span>${esc(st.low)}</span><span style="text-align:right">${esc(st.high)}</span></div>
                </div>
                <div class="num"><strong>${st.score}</strong> <span class="tiny muted">${st.confidence}% sure</span></div>
              </div>`).join('')}
            </div>
          </details>`;
        }).join('')}
      </div>

      <h2 class="section-title">${window.icon('book-open')}Subjects and mastery</h2>
      <div class="grid grid-2">
        ${d.enrollments.map((e) => `
          <div class="card">
            <div class="card-head"><div class="card-title">${esc(e.track)} <span class="tiny muted">${esc(e.grade)}</span></div>
              <span class="chip chip-accent">level ${e.level}${e.path_length ? ` / ${e.path_length}` : ''}</span></div>
            <div class="tiny muted" style="margin-bottom:6px">${esc(e.status)}${e.placed_at ? ` · placed ${new Date(e.placed_at).toLocaleDateString()}` : ''}</div>
            ${e.skills.length ? table(e.skills.map((sk) => `
              <tr><td class="small">${esc(sk.name)}${sk.error_tags.length ? `<div class="tiny muted">${esc(sk.error_tags.join(', ').replace(/_/g, ' '))}</div>` : ''}</td>
                <td style="width:35%"><div class="meter ${sk.mastery >= 0.8 ? 'meter-success' : sk.mastery < 0.6 ? 'meter-warn' : ''}"><span style="width:${sk.mastery * 100}%"></span></div></td>
                <td class="tiny nowrap">${App.pct(sk.mastery)} · ${sk.correct}/${sk.attempts}</td></tr>`).join(''))
              : '<p class="small muted" style="margin:0">No answers on this subject yet.</p>'}
          </div>`).join('') || '<p class="small muted">Not enrolled in anything.</p>'}
      </div>

      <h2 class="section-title">${window.icon('edit')}Levels written for them</h2>
      <div class="card">
        ${d.tailored_pages.length ? table(`<tr><th>Level</th><th>Topic</th><th>From</th><th>Experiment</th><th>Model</th><th>Result</th></tr>`
          + d.tailored_pages.map((p) => `<tr>
            <td class="small nowrap">${esc(p.track_id)} ${p.level}</td>
            <td class="small">${esc(p.topic || '—')}</td>
            <td class="small">${esc(p.basis)}</td>
            <td class="small">${esc(p.experiment || '—')}</td>
            <td class="tiny">${esc(p.model || '')}${p.seconds ? ` · ${p.seconds}s` : ''}</td>
            <td class="tiny">${p.problem ? `<span class="chip chip-danger">refused</span> ${esc(p.problem)}` : 'served'}</td></tr>`).join(''))
          : `<p class="small muted" style="margin:0">${d.levels_written_for_them ? 'None yet — they are written one level ahead as the learner moves.' : 'Their plan does not have levels written for them.'}</p>`}
      </div>

      <h2 class="section-title">${window.icon('refresh')}How their levels went</h2>
      <div class="card">
        ${d.levels.length ? table(d.levels.map((l) => `<tr>
            <td class="small">${esc(l.conclusion || `Level ${l.level}`)}${l.arm ? ` <span class="chip">${esc(l.arm)}</span>` : ''}</td>
            <td class="tiny">${l.said ? esc(Object.entries(l.said).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')) : ''}</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">Nothing yet.</p>'}
      </div>

      <h2 class="section-title">${window.icon('brain')}Their record</h2>
      <div class="card">
        <p class="small muted" style="margin-top:0">Built by the after-level read of every level. Solid facts are supported by at
          least three levels with three in four agreeing; only solid facts and repeated struggles reach the writer of their next level.</p>
        ${d.record.facts.length ? table(`<tr><th>Fact</th><th>Kind</th><th>Status</th><th>Support</th></tr>` + d.record.facts.map((f) => `<tr>
            <td class="small">${f.topic ? `<strong>${esc(f.topic)}:</strong> ` : ''}${esc(f.text)}
              ${f.shape ? `<div class="tiny muted">question shape: ${esc(f.shape)}</div>` : ''}
              ${f.hint ? `<div class="tiny muted">hint idea: ${esc(f.hint)}</div>` : ''}</td>
            <td class="small">${esc(f.kind)}</td>
            <td class="small">${f.status === 'solid' ? '<span class="chip chip-success">solid</span>' : '<span class="chip">tentative</span>'}</td>
            <td class="tiny nowrap">${f.support} for · ${f.contradict} against</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">Nothing yet — it fills in as levels are read.</p>'}
        ${d.record.big.length ? `<p class="tiny muted" style="margin:10px 0 0">Big moves building up (applied after ${d.big_after} levels):
          ${d.record.big.map((b) => `${esc(b.name)} ${b.dir > 0 ? 'up' : 'down'} ${b.count}/${d.big_after}`).join(' · ')}</p>` : ''}
      </div>

      <h2 class="section-title">${window.icon('help')}Possible recommendations</h2>
      <div class="card">
        <p class="small muted" style="margin-top:0">Things a read said that disagreed with something solid. They change nothing until
          enough later levels support them and a review against everything known about the learner agrees.</p>
        ${d.record.recommendations.length ? table(d.record.recommendations.map((r) => `<tr>
            <td class="small">${esc(r.claim)}
              ${(r.reasons || []).length ? `<div class="tiny muted">${(r.reasons || []).map(esc).join(' · ')}</div>` : ''}
              ${(r.reviews || []).length ? `<div class="tiny"><strong>Reviewed:</strong> ${esc(r.reviews[r.reviews.length - 1].decision)} — ${esc(r.reviews[r.reviews.length - 1].reasoning)}</div>` : ''}</td>
            <td class="small">${r.status === 'applied' ? '<span class="chip chip-success">applied</span>' : r.status === 'rejected' ? '<span class="chip chip-danger">rejected</span>' : '<span class="chip">open</span>'}</td>
            <td class="tiny nowrap">${r.support} for · ${r.oppose} against</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">None.</p>'}
      </div>

      <h2 class="section-title">${window.icon('layers')}Block levels written for them</h2>
      <div class="card">
        ${(d.block_levels || []).length ? table(d.block_levels.map((x) => `<tr>
            <td class="small nowrap">${esc(x.track_id)} ${x.level}${x.attempt > 1 ? ` #${x.attempt}` : ''}<div class="tiny muted">${esc(x.kind)}${x.arm ? ` · ${esc(x.arm)}` : ''}</div></td>
            <td class="small">${x.status === 'ready'
    ? `${esc(x.layout || '')}${x.approach ? `<div class="tiny muted">${esc(x.approach)}</div>` : ''}`
      + `${x.experiment ? `<div class="tiny muted">trying ${esc(x.experiment)}</div>` : ''}`
      + `${x.dropped.length ? `<div class="tiny muted">dropped after checks: ${esc(x.dropped.join(', '))}</div>` : ''}`
    : `<span class="muted">${esc(x.status)}${x.reason ? ` — ${esc(x.reason)}` : ''}</span>`}</td>
            <td class="tiny nowrap">${x.answered !== null && x.checks ? `${x.right}/${x.answered} of ${x.checks} right` : x.checks ? `${x.checks} questions` : ''}</td>
            <td class="tiny muted nowrap">${esc(x.model || '')}${x.usage ? `<br>${(x.usage.input_tokens || 0) + (x.usage.cache_read_input_tokens || 0)} in / ${x.usage.output_tokens || 0} out` : ''}${x.seconds ? `<br>${x.seconds}s` : ''}</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">None yet.</p>'}
      </div>

      <h2 class="section-title">${window.icon('refresh')}After-level reads</h2>
      <div class="card">
        ${d.reads.length ? table(d.reads.map((x) => `<tr>
            <td class="small nowrap">${esc(x.track_id)} ${x.level}<div class="tiny muted">${esc(x.kind)}</div></td>
            <td class="small">${x.status === 'done'
    ? `${esc(x.conclusion || '')}<div class="tiny muted">${x.mode === 'feedback' ? 'from their feedback' : 'from their answers'}`
      + `${x.report ? ` · ${x.report.applied.length} stats moved, ${x.report.held.length} held as recommendations, ${x.report.facts.length} facts` : ''}`
      + `${x.reviews.length ? ` · reviewed ${x.reviews.map((rv) => `${rv.id} (${rv.decision})`).join(', ')}` : ''}</div>`
    : `<span class="muted">${esc(x.status)}${x.reason ? ` — ${esc(x.reason)}` : ''}</span>`}</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">None yet.</p>'}
      </div>

      <h2 class="section-title">${window.icon('edit')}What they said about levels</h2>
      <div class="card">
        ${d.feedback.length ? table(d.feedback.map((f) => `<tr>
            <td class="small nowrap">${esc(f.track_id)} ${f.level}</td>
            <td class="small">${f.liked ? `<div><strong>Liked:</strong> ${esc(f.liked)}</div>` : ''}${f.disliked ? `<div><strong>Did not like:</strong> ${esc(f.disliked)}</div>` : ''}${f.comments ? `<div><strong>Also said:</strong> ${esc(f.comments)}</div>` : ''}</td>
            <td class="tiny">${[f.pace && `pace ${f.pace}`, f.length && `length ${f.length}`, f.difficulty && `difficulty ${f.difficulty}`].filter(Boolean).map(esc).join(' · ')}</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">Nothing yet.</p>'}
      </div>

      <h2 class="section-title">${window.icon('trending-up')}Recent sessions</h2>
      <div class="card">
        ${d.sessions.length ? table(d.sessions.map((x) => `<tr>
            <td class="small nowrap">${new Date(x.started_at).toLocaleString()}</td>
            <td class="small">${esc(x.kind)} · ${esc(x.track_id || '')} ${x.levels.length > 1 ? `levels ${x.levels[0]}–${x.levels[x.levels.length - 1]}` : `level ${x.levels[0]}`}</td>
            <td class="small">${x.score === null || x.score === undefined ? (x.ended_at ? '—' : 'in progress') : App.pct(x.score)}</td>
            <td class="tiny muted">${esc(x.summary || '')}</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">No sessions yet.</p>'}
      </div>

      <h2 class="section-title">${window.icon('list')}Questionnaire</h2>
      <div class="card">
        ${d.questionnaire.taken
          ? table(Object.entries(d.questionnaire.stated).map(([k, v]) => `<tr><td class="small">${esc(k.replace(/_/g, ' '))}</td><td class="small">said ${Math.round(v * 100)}</td><td class="small muted">${d.questionnaire.observed[k] !== undefined ? `observed ${Math.round(d.questionnaire.observed[k] * 100)}` : ''}</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">Not taken.</p>'}
        ${d.questionnaire.traits.length ? `<div class="small" style="font-weight:600; margin-top:10px">Tutor notes</div><ul class="small">${d.questionnaire.traits.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      </div>

      <h2 class="section-title">${window.icon('chart')}Latest evidence</h2>
      <div class="card">
        ${d.evidence.length ? table(d.evidence.map((ev) => `<tr>
            <td class="tiny nowrap">${new Date(ev.at).toLocaleString()}</td>
            <td class="small">${esc(ev.name)}</td>
            <td class="tiny nowrap">${ev.from} &rarr; ${ev.to}</td>
            <td class="tiny muted">${esc(ev.source)}${ev.note ? ` · ${esc(ev.note)}` : ''}</td></tr>`).join(''))
          : '<p class="small muted" style="margin:0">No evidence yet.</p>'}
        <p class="tiny muted" style="margin:10px 0 0">AI calls today: ${d.ai_usage_today.calls || 0}</p>
      </div>`;

    document.getElementById('expand').addEventListener('click', (event) => {
      const all = [...root.querySelectorAll('.sc-category')];
      const open = !all.every((x) => x.open);
      all.forEach((x) => { x.open = open; });
      event.target.textContent = open ? 'Collapse all' : 'Expand all';
    });
    document.getElementById('track').addEventListener('change', (event) => {
      window.location.hash = `user=${id}${event.target.value ? `&track=${encodeURIComponent(event.target.value)}` : ''}`;
    });
    window.scrollTo({ top: 0 });
  }

  /* Real-user metrics: test, demo and founder accounts counted apart (docs/METRICS.md). */
  async function renderMetrics(days = 30) {
    root.innerHTML = '<div class="loading"><span class="spinner"></span>Loading metrics</div>';
    let m;
    try {
      m = await App.api.get(`/api/admin/metrics?days=${days}`);
    } catch (err) {
      root.innerHTML = `<div class="notice notice-error">${esc(err.message)} <a href="#">Back</a></div>`;
      return;
    }
    const h = m.headline;
    const l30 = h.last_30_days;
    const rate = (r) => (r.rate === null ? '—' : App.pct(r.rate));
    const num = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);
    const usd = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(v && v < 1 ? 4 : 2)}`);
    const csv = (table) => `/api/admin/metrics.csv?table=${table}&days=${days}`;
    const stat = (value, label) => `<div class="card card-tight stat-block"><span class="value">${value}</span><span class="label">${label}</span></div>`;
    const a = m.accounts;
    const f = m.funnel;
    const maxActive = Math.max(1, ...m.daily.map((d) => d.active_learners));

    root.innerHTML = `
      <div class="row-between" style="margin-bottom:12px; flex-wrap:wrap; gap:8px">
        <div>
          <h1 style="margin-bottom:2px">Real-user metrics</h1>
          <div class="small muted">As of ${esc(new Date(m.generated_at).toLocaleString())} · days are ${esc(m.timezone)} calendar days</div>
        </div>
        <a class="btn btn-ghost btn-sm" href="#">${window.icon('arrow-left')}All users</a>
      </div>

      <div class="notice" style="margin-bottom:14px">
        <strong>${a.real} real users.</strong> ${a.excluded} account${a.excluded === 1 ? '' : 's'} left out:
        ${a.founder} founder/team, ${a.test} test, ${a.demo} demo (rules below; every excluded account is listed at the bottom).
      </div>

      <div class="grid grid-3">
        ${stat(h.real_users, 'Real users (signed up)')}
        ${stat(h.ever_active, 'Did anything at all')}
        ${stat(h.active_2plus_days, 'Active on 2+ distinct days')}
        ${stat(rate(h.day1_return), `Day-1 return <span class="tiny muted">(${h.day1_return.returned}/${h.day1_return.eligible_users})</span>`)}
        ${stat(rate(h.day7_return), `Day-7 return <span class="tiny muted">(${h.day7_return.returned}/${h.day7_return.eligible_users})</span>`)}
        ${stat(rate(h.week1_return), `Back within days 1–7 <span class="tiny muted">(${h.week1_return.returned}/${h.week1_return.eligible_users})</span>`)}
      </div>

      <h2 class="section-title">${window.icon('trending-up')}Last 30 days, per active learner</h2>
      <div class="grid grid-3">
        ${stat(l30.active_learners, 'Active learners')}
        ${stat(num(l30.sittings_per_active), `Sittings each <span class="tiny muted">(${l30.sittings} in all)</span>`)}
        ${stat(num(l30.study_minutes_per_active, ' min'), 'Measured study minutes each')}
        ${stat(num(l30.sitting_minutes_per_active, ' min'), 'Sitting minutes each <span class="tiny muted">(upper estimate)</span>')}
        ${stat(usd(l30.ai_cost_per_active_usd_estimate), 'AI cost each <span class="tiny muted">(estimate)</span>')}
        ${stat(l30.ai_calls, 'AI calls for real users')}
      </div>

      <h2 class="section-title">${window.icon('layers')}Activation funnel (real users)</h2>
      <div class="card">
        <div class="table-scroll"><table class="data"><thead><tr><th>Step</th><th>Users</th><th>Out of</th><th>Rate</th><th>Of all sign-ups</th></tr></thead><tbody>
          ${f.steps.map((x) => `<tr>
            <td class="small">${esc(x.label)}</td>
            <td class="small">${x.users}</td>
            <td class="small">${x.of}</td>
            <td class="small">${rate({ rate: x.rate })}</td>
            <td class="small">${rate({ rate: x.of_signed_up })}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="tiny muted" style="margin:10px 0 0">Per active day: ${num(f.minutes_per_active_day.measured_study, ' min')} measured study, ${num(f.minutes_per_active_day.sitting_upper, ' min')} sitting (upper), over ${f.active_days_total} active days.</p>
      </div>

      <h2 class="section-title">${window.icon('user')}Invites</h2>
      <div class="grid grid-3">
        ${stat(f.referrals.signed_up, 'Real sign-ups from an invite link')}
        ${stat(f.referrals.started_learning, 'Of those, answered a first question')}
        ${stat(f.referrals.inviters, 'Learners who brought someone')}
      </div>
      <p class="tiny muted" style="margin:6px 0 0">${rate({ rate: f.referrals.share_of_signups })} of all real sign-ups came from an invite.</p>

      <div class="row-between" style="margin-top:22px; flex-wrap:wrap; gap:8px">
        <h2 class="section-title" style="margin:0">${window.icon('chart')}Sign-ups and active learners per day</h2>
        <label class="small">Days
          <select id="days">${[14, 30, 60, 90, 180, 365].map((n) => `<option value="${n}" ${n === days ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
      </div>
      <div class="card">
        <div class="table-scroll"><table class="data"><thead><tr><th>Day</th><th>Sign-ups</th><th>Active learners</th><th></th><th>Excluded sign-ups</th><th>Founder active</th></tr></thead><tbody>
          ${m.daily.slice().reverse().map((d) => `<tr>
            <td class="small nowrap">${esc(d.day)}</td>
            <td class="small">${d.signups}</td>
            <td class="small">${d.active_learners}</td>
            <td style="width:30%"><div class="meter"><span style="width:${(100 * d.active_learners) / maxActive}%"></span></div></td>
            <td class="tiny muted">${d.signups_excluded || ''}</td>
            <td class="tiny muted">${d.founder_active ? 'yes' : ''}</td></tr>`).join('')}
        </tbody></table></div>
      </div>

      <h2 class="section-title">${window.icon('refresh')}Return rates by sign-up day</h2>
      <div class="card">
        ${m.cohorts.length ? `<div class="table-scroll"><table class="data"><thead><tr><th>Signed up</th><th>Users</th><th>Day 1</th><th>Day 7</th><th>Days 1–7</th></tr></thead><tbody>
          ${m.cohorts.slice().reverse().map((c) => `<tr>
            <td class="small nowrap">${esc(c.day)}</td>
            <td class="small">${c.size}</td>
            <td class="small">${c.day1_complete ? `${c.day1_returned} · ${App.pct(c.day1_rate)}` : '<span class="muted">not yet</span>'}</td>
            <td class="small">${c.day7_complete ? `${c.day7_returned} · ${App.pct(c.day7_rate)}` : '<span class="muted">not yet</span>'}</td>
            <td class="small">${c.day7_complete ? `${c.week1_returned} · ${App.pct(c.week1_rate)}` : '<span class="muted">not yet</span>'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="small muted" style="margin:0">No real sign-ups yet.</p>'}
      </div>

      <h2 class="section-title">${window.icon('layers')}By month</h2>
      <div class="card">
        <div class="table-scroll"><table class="data"><thead><tr>
          <th>Month</th><th>Sign-ups</th><th>Active</th><th>2+ days</th><th>Sittings each</th><th>Study min each</th><th>Sitting min each</th>
          <th>AI cost each (est.)</th><th>Ledger ÷ active (upper bound)</th><th>Founder</th>
        </tr></thead><tbody>
          ${m.months.slice().reverse().map((x) => `<tr>
            <td class="small nowrap">${esc(x.month)}${x.month_complete ? '' : ' <span class="chip">so far</span>'}</td>
            <td class="small">${x.signups}</td>
            <td class="small">${x.active_learners}</td>
            <td class="small">${x.active_2plus_days}</td>
            <td class="small">${num(x.sittings_per_active)}</td>
            <td class="small">${num(x.study_minutes_per_active)}</td>
            <td class="small">${num(x.sitting_minutes_per_active)}</td>
            <td class="small">${usd(x.ai_cost_per_active_usd_estimate)} <span class="tiny muted">of ${usd(x.ai_cost_usd_estimate)}</span></td>
            <td class="small">${usd(x.ledger_usd_per_active_upper_bound)} <span class="tiny muted">of ${usd(x.ledger_usd)}${x.ledger_partial ? ', partial' : ''}</span></td>
            <td class="tiny muted">${x.founder.active ? `${x.founder.sittings} sittings · ${usd(x.founder.ai_cost_usd_estimate)}` : ''}</td></tr>`).join('')}
        </tbody></table></div>
      </div>

      <h2 class="section-title">${window.icon('chart')}Export (CSV)</h2>
      <div class="row" style="gap:8px; flex-wrap:wrap">
        <a class="btn btn-sm" href="${csv('daily')}" download>Per day</a>
        <a class="btn btn-sm" href="${csv('cohorts')}" download>Return cohorts</a>
        <a class="btn btn-sm" href="${csv('monthly')}" download>Per month</a>
        <a class="btn btn-sm" href="${csv('funnel')}" download>Funnel and invites</a>
        <a class="btn btn-sm" href="${csv('excluded')}" download>Excluded accounts</a>
      </div>

      <h2 class="section-title">${window.icon('user')}Founder (counted apart)</h2>
      <div class="card">
        ${m.founder.length ? `<div class="table-scroll"><table class="data"><tbody>${m.founder.map((f) => `<tr>
            <td class="small">${esc(f.name || '')}<div class="tiny muted">${esc(f.email || '')}</div></td>
            <td class="small">${f.active_days} active days${f.last_active ? ` · last ${esc(f.last_active)}` : ''}</td>
            <td class="small">${f.sittings} sittings · ${num(f.study_minutes)} study min</td>
            <td class="small">${usd(f.ai_cost_usd_estimate)} AI (est.)</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="small muted" style="margin:0">No founder or team account in this data file.</p>'}
      </div>

      <h2 class="section-title">${window.icon('help')}How these are counted</h2>
      <div class="card">
        <p class="small" style="margin-top:0"><strong>Left out of every number above</strong>, first matching rule wins:</p>
        <ol class="small" style="margin:0; padding-left:20px">
          <li><strong>demo</strong>: accounts flagged demo (the reviewer demo account is).</li>
          <li><strong>test</strong>: accounts flagged test; addresses in METRICS_EXCLUDE_EMAILS${m.rules.exclude_emails.length ? ` (${m.rules.exclude_emails.length} listed)` : ' (none set)'};
            addresses at ${esc(m.rules.reserved_tlds.join(', '))} or ${esc(m.rules.reserved_domains.join(', '))} (no real person has one; a child account is judged by its parent's address).</li>
          <li><strong>founder</strong>: ${esc(m.rules.founder_emails.join(', '))}${m.rules.team_domains.length ? `, and any address at ${esc(m.rules.team_domains.join(', '))}` : ''}.</li>
        </ol>
        <ul class="small" style="margin:10px 0 0; padding-left:20px">${m.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        ${m.ledgers.length ? `<p class="tiny muted" style="margin:10px 0 0">Ledgers read: ${m.ledgers.map((l) => `${esc(l.file)}${l.error ? ` (${esc(l.error)})` : ` ($${l.lifetime_usd} recorded in all, ${l.log_entries} log entries${l.oldest_log_day ? ` from ${esc(l.oldest_log_day)}` : ''})`}`).join('; ')}</p>`
          : '<p class="tiny muted" style="margin:10px 0 0">No spend ledgers found on this machine.</p>'}
      </div>

      <h2 class="section-title">${window.icon('list')}Excluded accounts (${m.excluded.length})</h2>
      <div class="card">
        ${m.excluded.length ? `<div class="table-scroll"><table class="data"><thead><tr><th>Account</th><th>Group</th><th>Rule</th><th>Joined</th></tr></thead><tbody>
          ${m.excluded.map((e) => `<tr>
            <td class="small">${esc(e.name || '')}<div class="tiny muted">${esc(e.email || e.username || `#${e.id}`)}</div></td>
            <td class="small"><span class="chip">${esc(e.group)}</span></td>
            <td class="tiny">${esc(e.rule)}</td>
            <td class="tiny nowrap">${esc(e.joined || '')}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="small muted" style="margin:0">None.</p>'}
      </div>`;

    document.getElementById('days').addEventListener('change', (event) => {
      window.location.hash = `metrics&days=${event.target.value}`;
    });
    window.scrollTo({ top: 0 });
  }

  function route() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.has('metrics')) renderMetrics(Number(params.get('days')) || 30);
    else if (params.get('user')) renderUser(params.get('user'), params.get('track') || '');
    else renderList();
  }
  window.addEventListener('hashchange', route);
  route();
});
