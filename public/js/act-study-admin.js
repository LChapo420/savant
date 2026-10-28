/* The ACT study results: every participant's before and after, for the admin only.
 * The server decides who is an admin; the numbers are descriptive and say so. */
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
  try { rep = await App.api.get('/api/act-study/admin/report'); } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }
  const t = rep.totals;
  const n = (v) => (v === null || v === undefined ? '—' : (v > 0 ? `+${v}` : String(v)));
  const sc = (s) => (s ? `${s.composite === null ? '—' : s.composite} <span class="tiny muted">${esc(s.taken_on)}</span>` : '—');
  const rows = rep.participants.map((r) => `<tr>
    <td>${esc(r.name || r.email)}</td><td>${r.arm}${r.group === 'wait' ? ' · wait' : ''}</td><td>${esc(r.status.replace(/_/g, ' '))}</td>
    <td>${esc(r.before_form)}: ${sc(r.before)}</td><td>${esc(r.after_form)}: ${sc(r.after)}</td>
    <td><strong>${n(r.change.composite)}</strong></td><td>${r.minutes} min / ${r.sessions}${r.used_savant_while_waiting ? ' <span class="tiny">(used while waiting)</span>' : ''}</td></tr>`).join('');
  root.innerHTML = `
    <div class="row-between" style="flex-wrap:wrap;gap:8px"><h1 style="margin:0">ACT study</h1>
      <a class="btn btn-sm" href="/api/act-study/admin/report.csv">Download CSV</a></div>
    <p>Joined ${t.joined} · left ${t.left} · in the study ${t.active} · finished both tests ${t.complete} · excluded for having seen the forms ${t.excluded_seen_forms}</p>
    <p>Mean composite change (finished only): <strong>${n(t.mean_composite_change)}</strong> (range ${n(t.min_composite_change)} to ${n(t.max_composite_change)}). A then B: ${n(rep.by_arm.AB.mean_composite_change)} (${rep.by_arm.AB.complete} of ${rep.by_arm.AB.joined}). B then A: ${n(rep.by_arm.BA.mean_composite_change)} (${rep.by_arm.BA.complete} of ${rep.by_arm.BA.joined}).</p>
    <p>Start now: ${n(rep.by_group.now.mean_composite_change)} (${rep.by_group.now.complete} of ${rep.by_group.now.joined}). Wait list: ${n(rep.by_group.wait.mean_composite_change)} (${rep.by_group.wait.complete} of ${rep.by_group.wait.joined}; ${rep.by_group.wait.used_savant_while_waiting} used Savant while waiting).</p>
    <p class="muted">${esc(rep.note)}</p>
    <div style="overflow-x:auto"><table class="table"><thead><tr><th>Student</th><th>Order</th><th>Status</th><th>Before</th><th>After</th><th>Change</th><th>Savant use</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">No participants yet.</td></tr>'}</tbody></table></div>`;
});
