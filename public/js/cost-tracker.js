/* The cost and performance tracker page (owner/admin only; services/cost-tracker.js, docs/COST-TRACKER.md).
 * Plain tables, readable on a phone. The server decides who may see the data: everyone else gets a 404. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'admin');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  if (!user.is_admin) { root.innerHTML = '<div class="notice notice-error">Page not found.</div>'; return; }

  const q = new URLSearchParams(location.search);
  const days = Math.max(1, Math.min(90, Number(q.get('days')) || 7));
  const only = q.get('user') || '';
  const SCOPES = [['all', 'Everything'], ['product', 'Product use'], ['me', 'My account'], ['learners', 'Other learners'], ['internal', 'Team / test'], ['shared', 'Shared'], ['scripts', 'Scripts / tests']];
  const scope = SCOPES.some(([k]) => k === q.get('scope')) ? q.get('scope') : 'all';
  const link = (o) => { const p = new URLSearchParams({ days: o.days || days }); if (o.scope && o.scope !== 'all') p.set('scope', o.scope); if (o.user) p.set('user', o.user); return `?${p}`; };

  const usd = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(Number(v) !== 0 && Math.abs(v) < 0.1 ? 4 : 2)}`);
  const n = (v, d = 0) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));
  const ms = (v) => (v === null || v === undefined ? '—' : (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`));
  const table = (head, rows) => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">No data yet.</td></tr>`}</tbody></table></div>`;

  let d;
  try {
    d = await App.api.get(`/api/admin/cost-tracker?days=${days}&scope=${scope}${only ? `&user=${encodeURIComponent(only)}` : ''}`);
  } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }

  const t = d.today;
  const w = d.window;
  const L = d.loads;
  const P = d.projection;
  const tiles = [
    ['Today (actual)', usd(t.actual_usd)], ['Today (list price)', usd(t.list_usd)], ['Today AI calls', `${t.ai_calls}${t.ai_failed ? ` (${t.ai_failed} failed)` : ''}`],
    [`Last ${d.days} d (actual)`, usd(w.actual_usd)], [`Last ${d.days} d (list)`, usd(w.list_usd)], ['Sessions today', t.sessions],
  ].map(([k, v]) => `<div class="tile"><span class="note">${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('');

  root.innerHTML = `
    <h1>Cost and performance</h1>
    <p class="note">Times are UTC. "Actual" is what was paid or metered (free providers are $0${w.estimated_actual_usd ? `; ${usd(w.estimated_actual_usd)} of it is estimated for routes that report no cost` : ''}).
      "List" is what the same tokens would cost on a paid route, for planning after the free tiers run out. Definitions: docs/COST-TRACKER.md.</p>
    <div class="controls">
      Window: ${[1, 7, 30].map((x) => `<a class="btn btn-small${x === d.days ? ' btn-primary' : ''}" href="${esc(link({ days: x, scope, user: only }))}">${x === 1 ? 'today' : `${x} days`}</a>`).join(' ')}
      ${only ? `<a class="btn btn-small" href="${esc(link({ scope }))}">all users</a>` : '<span class="note">Add ?user=ID to see one account.</span>'}
      <a class="btn btn-small" href="/my-stats">My stats, day by day</a>
    </div>
    <div class="controls">Whose use: ${SCOPES.map(([k, label]) => `<a class="btn btn-small${k === scope ? ' btn-primary' : ''}" href="${esc(link({ scope: k, user: only }))}">${esc(label)}</a>`).join(' ')}</div>
    <div class="tiles">${tiles}</div>
    <p class="note">Kept apart in these ${d.days} days: ${d.buckets.map((b) => `${esc((SCOPES.find(([k]) => k === b.bucket) || [0, b.bucket])[1])} ${usd(b.list_usd)} list / ${b.ai_calls} AI calls`).join(' · ')}.
      The projection below uses product use only (your learner account and real learners), never team, test or script days.</p>

    <h2>Cost projection per user-month (tiers)</h2>
    <p class="note">Measured from ${P.basis_user_days} user-day(s) with at least ${P.min_active_min} active minutes. Cost per active hour: list p50 ${usd(P.cost_per_active_hour.list_p50)}, p95 ${usd(P.cost_per_active_hour.list_p95)}; actual p50 ${usd(P.cost_per_active_hour.actual_p50)}, p95 ${usd(P.cost_per_active_hour.actual_p95)}.
      A month is ${P.days_per_month} days. ${P.fixed_set ? `Fixed monthly cost ${usd(P.fixed_monthly_usd)} is shared across users.` : 'Fixed monthly cost is not set (config/cost-tracker.json), so the fixed share is $0.'}</p>
    ${table(['Study time', 'List p50', 'List p95', 'Actual p50', 'Actual p95'], P.tiers.map((r) => [`${r.hours_per_day} h/day`, usd(r.list_p50), usd(r.list_p95), usd(r.actual_p50), usd(r.actual_p95)]))}
    <p class="note">With the fixed share per user added (list-price total per user-month):</p>
    ${table(['Study time', 'Users', 'Fixed share', 'List p50', 'List p95'], P.tiers.flatMap((r) => r.by_users.map((u) => [`${r.hours_per_day} h/day`, u.users, usd(u.fixed_share), usd(u.list_p50), usd(u.list_p95)])))}

    <h2>Per day</h2>
    ${table(['Day', 'AI calls', 'Requests', 'Actual', 'List'], d.daily.map((r) => [r.day, r.ai_calls, r.requests, usd(r.actual_usd), usd(r.list_usd)]))}

    <h2>Sessions (latest 40)</h2>
    ${table(['User', 'Start (UTC)', 'Min', 'Active', 'Levels', 'Subjects', 'Uploads', 'AI', 'Actual', 'List', 'List/active h'],
      d.sessions.map((s) => [s.user, s.start.replace('T', ' ').slice(0, 16), n(s.minutes, 1), n(s.active_min, 1), s.levels, s.subjects.join(','), s.uploads, s.ai_calls, usd(s.actual_usd), usd(s.list_usd), usd(s.list_usd_per_active_hr)]))}

    <h2>Most expensive: features</h2>
    ${table(['Feature', 'Calls', 'Failed', 'p50', 'p95', 'Tokens in', 'Tokens out', 'Waiting / background', 'Actual', 'List'],
      d.features.map((r) => [r.key, r.calls, r.fails, ms(r.p50_ms), ms(r.p95_ms), r.tokens_in, r.tokens_out, `${r.foreground} / ${r.background}`, usd(r.actual_usd), usd(r.list_usd)]))}
    <h2>Most expensive: models</h2>
    ${table(['Provider / model', 'Calls', 'Failed', 'p50', 'p95', 'Tokens in', 'Tokens out', 'Actual', 'List'],
      d.models.map((r) => [r.key, r.calls, r.fails, ms(r.p50_ms), ms(r.p95_ms), r.tokens_in, r.tokens_out, usd(r.actual_usd), usd(r.list_usd)]))}
    <h2>Most expensive: users</h2>
    <p class="note">Under-13 accounts are never listed; they only add to the totals above.</p>
    ${table(['User', 'AI calls', 'Active min', 'Actual', 'List'], d.users.map((r) => [r.user, r.ai_calls, n(r.active_min, 1), usd(r.actual_usd), usd(r.list_usd)]))}

    <h2>How it performs</h2>
    ${table(['Measure', 'Count', 'p50', 'p95'], [
      ['Level open, click to content (page)', L.level_open_client.n, ms(L.level_open_client.p50_ms), ms(L.level_open_client.p95_ms)],
      ['  came ready (write-ahead)', L.level_open_client.ready_n, ms(L.level_open_client.ready_p50_ms), ''],
      ['  waited for writing', L.level_open_client.waited_n, ms(L.level_open_client.waited_p50_ms), ''],
      ['Level open, server side', L.level_open_server.n, ms(L.level_open_server.p50_ms), ms(L.level_open_server.p95_ms)],
      [`  ready ${L.level_open_server.ready_n} / waited ${L.level_open_server.waited_n}`, '', '', ''],
      ['Tutor time to first token', L.tutor_first_token.n, ms(L.tutor_first_token.p50_ms), ms(L.tutor_first_token.p95_ms)],
    ])}
    <h2>Slowest routes (by p95)</h2>
    ${table(['Route', 'Requests', 'p50', 'p95', '5xx'], d.routes.map((r) => [r.route, r.n, ms(r.p50_ms), ms(r.p95_ms), r.errors]))}

    <h2>Server</h2>
    ${table(['Measure', 'Value'], [
      ['Snapshots in window', d.server.snapshots], ['CPU p50 / p95', `${n(d.server.cpu_p50_pct, 1)}% / ${n(d.server.cpu_p95_pct, 1)}%`],
      ['Memory (RSS) max', d.server.rss_max_mb === null ? '—' : `${d.server.rss_max_mb} MB`], ['Event-loop delay p99 max', d.server.loop_p99_max_ms === null ? '—' : `${d.server.loop_p99_max_ms} ms`],
      ['Data file (db.json)', d.server.db_mb === null ? '—' : `${d.server.db_mb} MB`],
      ['Tracker overhead (this process)', `${n(d.overhead.mean_ms, 4)} ms per request or call (${d.overhead.calls} so far)`],
    ])}`;
});
