/* The owner's own learner account, day by day (services/my-stats.js, docs/MY-STATS.md).
 * For an admin or that account itself; everyone else gets a 404 from the server. Plain tables, readable on a phone. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, user.is_admin ? 'admin' : 'dashboard');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;

  const days = Math.max(1, Math.min(90, Number(new URLSearchParams(location.search).get('days')) || 30));
  const usd = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(Number(v) !== 0 && Math.abs(v) < 0.1 ? 4 : 2)}`);
  const n = (v, d = 0) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));
  const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`);
  const ms = (v) => (v === null || v === undefined ? '—' : (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`));
  const table = (head, rows) => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">No data yet.</td></tr>`}</tbody></table></div>`;

  let d;
  try {
    d = await App.api.get(`/api/admin/my-stats?days=${days}`);
  } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.status === 404 ? 'Page not found.' : err.message)}</div>`;
    return;
  }

  const T = d.totals;
  const A = d.averages;
  const tiles = [
    ['Days studied', T.active_days], ['Study time', `${n(T.study_min / 60, 1)} h`], ['Questions', `${T.questions} (${pct(A.accuracy_pct)} right)`],
    ['Levels finished', T.levels], ['Cost (actual)', usd(T.actual_usd)], ['Cost (list price)', usd(T.list_usd)],
  ].map(([k, v]) => `<div class="tile"><span class="note">${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('');
  const shown = d.daily.filter((r) => r.study_min || r.app_active_min || r.questions || r.levels || r.ai_calls || r.placement_questions);
  const names = { me: 'This account', learners: 'Other learners', internal: 'Team, test and demo accounts', shared: 'Shared work (base levels, signed out)', scripts: 'Scripts, build jobs and tests' };

  root.innerHTML = `
    <h1>My stats</h1>
    <p class="note">${d.accounts.length ? `Only ${esc(d.accounts.map((a) => a.email).join(', '))}: nobody else's use, and nothing from a script, build job or test, even one that names this account.` : 'No owner learner account found (OWNER_LEARNER_EMAILS).'}
      Days are UTC. "Actual" is what was paid or metered (free providers are $0); "list" is what the same use would cost on a paid route.</p>
    <div class="controls">Window: ${[7, 30, 90].map((x) => `<a class="btn btn-small${x === d.days ? ' btn-primary' : ''}" href="?days=${x}">${x} days</a>`).join(' ')}</div>
    <div class="tiles">${tiles}</div>

    <h2>Averages (over the ${A.basis_days} day${A.basis_days === 1 ? '' : 's'} with any study)</h2>
    ${table(['Measure', 'Value'], [
      ['Study time per day (study timer)', `${n(A.study_min_per_day, 1)} min`],
      ['Active time in the app per day', `${n(A.app_active_min_per_day, 1)} min`],
      ['Questions per day', n(A.questions_per_day, 1)], ['Accuracy (placement questions apart)', pct(A.accuracy_pct)],
      ['Levels per day', n(A.levels_per_day, 2)],
      ['Cost per day (actual / list)', `${usd(A.actual_usd_per_day)} / ${usd(A.list_usd_per_day)}`],
      [`Cost per hour, by ${A.hours_basis} (actual / list)`, `${usd(A.actual_usd_per_hour)} / ${usd(A.list_usd_per_hour)}`],
      ['List cost per level', usd(A.list_usd_per_level)], ['Level opens that waited for writing', pct(A.waited_share_pct)],
    ])}

    <h2>Day by day</h2>
    ${table(['Day', 'Study min', 'App min', 'Levels', 'Questions', 'Right', 'Sec / q', 'Placement q', 'Opens (waited)', 'Open p50', 'AI calls', 'Actual', 'List'],
      shown.map((r) => [r.day, n(r.study_min, 1), n(r.app_active_min, 1), r.levels, r.questions, pct(r.accuracy_pct), n(r.median_sec_per_question, 1), r.placement_questions,
        `${r.level_opens} (${r.level_waits})`, ms(r.level_open_p50_ms), r.ai_calls, usd(r.actual_usd), usd(r.list_usd)]))}

    <h2>Kept apart (same window)</h2>
    <p class="note">Everything else the cost tracker saw in these ${d.days} days, so you can see none of it is in your numbers.</p>
    ${table(['Whose', 'Accounts', 'Requests', 'AI calls', 'Actual', 'List'], d.kept_apart.map((b) => [names[b.bucket] || b.bucket, b.accounts, b.requests, b.ai_calls, usd(b.actual_usd), usd(b.list_usd)]))}`;
});
