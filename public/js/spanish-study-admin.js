/* The Savant vs Duolingo study results, for the admin only. The server decides who is an admin.
 * Shows gain per hour for each arm as a bar chart with its 95% interval, the difference, and every participant. */
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
  let rep;
  try { rep = await App.api.get('/api/spanish-study/admin/report'); } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }
  const f = (v, d = 3) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d));
  const ci = (c) => (c ? `${f(c[0])} to ${f(c[1])}` : 'not enough people yet');

  // Bars share one scale that includes zero, so a negative gain or an interval across zero is visible.
  const names = { savant: 'Savant', duolingo: 'Duolingo' };
  const arms = Object.keys(rep.arms);
  const vals = [0];
  arms.forEach((a) => { const g = rep.arms[a].gain_per_hour; if (g.mean !== null) vals.push(g.mean); if (g.ci95) vals.push(g.ci95[0], g.ci95[1]); });
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const W = 320;
  const x = (v) => Math.round(((v - lo) / span) * (W - 100) + 90);
  const rowsSvg = arms.map((a, i) => {
    const g = rep.arms[a].gain_per_hour;
    const y = 18 + i * 44;
    if (g.mean === null) return `<text x="0" y="${y + 14}" fill="currentColor" font-size="13">${names[a] || esc(a)}: no finished participants</text>`;
    const x0 = x(0);
    const x1 = x(g.mean);
    const bar = `<rect x="${Math.min(x0, x1)}" y="${y}" width="${Math.max(1, Math.abs(x1 - x0))}" height="20" fill="currentColor" opacity="0.35"/>`;
    const whisk = g.ci95 ? `<line x1="${x(g.ci95[0])}" x2="${x(g.ci95[1])}" y1="${y + 10}" y2="${y + 10}" stroke="currentColor" stroke-width="2"/><line x1="${x(g.ci95[0])}" x2="${x(g.ci95[0])}" y1="${y + 4}" y2="${y + 16}" stroke="currentColor" stroke-width="2"/><line x1="${x(g.ci95[1])}" x2="${x(g.ci95[1])}" y1="${y + 4}" y2="${y + 16}" stroke="currentColor" stroke-width="2"/>` : '';
    return `<text x="0" y="${y + 14}" fill="currentColor" font-size="13">${names[a] || esc(a)}</text>${bar}${whisk}`;
  }).join('');
  const chart = `<svg viewBox="0 0 ${W} ${18 + arms.length * 44}" width="100%" role="img" aria-label="Mean chance-corrected gain per hour studied, by arm, with 95% interval" style="max-width:480px">
    <line x1="${x(0)}" x2="${x(0)}" y1="6" y2="${18 + arms.length * 44 - 8}" stroke="currentColor" stroke-dasharray="3 3" opacity="0.6"/>${rowsSvg}</svg>`;

  const armRows = arms.map((a) => { const r = rep.arms[a]; return `<tr><td>${names[a] || esc(a)}</td><td>${r.joined}</td><td>${r.complete}</td><td>${r.left_study}</td><td>${r.mean_hours ?? '—'}</td><td>${f(r.gain.mean)}</td><td>${f(r.gain_per_hour.mean)} (${ci(r.gain_per_hour.ci95)})</td></tr>`; }).join('');
  const d = rep.difference_gain_per_hour.savant_minus_duolingo;
  const dg = rep.difference_gain.savant_minus_duolingo;
  const ms = rep.minimum_sample;
  const people = rep.participants.map((r) => `<tr><td>${esc(r.name || r.user_id)}</td><td>${names[r.arm] || esc(r.arm)}</td><td>${esc(String(r.status).replace(/_/g, ' '))}</td><td>${r.hours ?? '—'}</td><td>${r.missing_days ?? '—'}</td><td>${f(r.gain)}</td><td>${f(r.gain_per_hour)}</td></tr>`).join('');

  root.innerHTML = `
    <div class="row-between" style="flex-wrap:wrap;gap:8px"><h1 style="margin:0">Spanish study</h1>
      <a class="btn btn-sm" href="/api/spanish-study/admin/report.csv">Download CSV</a></div>
    <p>Joined ${rep.totals.joined} · left ${rep.totals.left} · in the study ${rep.totals.active} · finished both tests ${rep.totals.complete}</p>
    <h2>Gain per hour studied</h2>
    ${chart}
    <p class="tiny muted">Bar = mean, line = 95% interval, dashed line = zero. Chance-corrected, 0 to 1 scale.</p>
    <p>Savant minus Duolingo, per hour: <strong>${f(d.diff)}</strong> (95% interval: ${ci(d.ci95)}). Same fixed time in both arms: <strong>${f(dg.diff)}</strong> (${ci(dg.ci95)}).</p>
    <p>Spread so far: ${ms.observed_sd_of_gain ?? '—'}. People needed per arm to detect a 0.10 difference: ${ms.per_arm_to_detect_0_10 ?? '—'}; 0.20: ${ms.per_arm_to_detect_0_20 ?? '—'}.</p>
    <p class="muted">${esc(rep.note)}</p>
    <div style="overflow-x:auto"><table class="table"><thead><tr><th>Arm</th><th>Joined</th><th>Finished</th><th>Left</th><th>Mean hours</th><th>Mean gain</th><th>Gain per hour</th></tr></thead><tbody>${armRows}</tbody></table></div>
    <h2>Every participant</h2>
    <div style="overflow-x:auto"><table class="table"><thead><tr><th>Name</th><th>Arm</th><th>Status</th><th>Hours</th><th>Missing days</th><th>Gain</th><th>Per hour</th></tr></thead><tbody>${people || '<tr><td colspan="7" class="muted">No participants yet.</td></tr>'}</tbody></table></div>`;
});
