/* Tailored vs base: the beta comparison's daily report, for the admin only.
 * The server decides who is an admin and writes the numbers (services/beta-compare.js); this page only draws them. */
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
  try { rep = await App.api.get('/api/admin/beta-report'); } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }
  const num = (v, unit) => {
    if (v === null || v === undefined) return '—';
    if (unit === 'share right' || unit === 'share of learners') return `${(v * 100).toFixed(0)}%`;
    if (unit === 'minutes') return `${v.toFixed(1)} min`;
    return v.toFixed(2);
  };
  const signed = (v, unit) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${num(v, unit)}`);
  const badge = {
    tailored_ahead: 'Tailored ahead', tailored_behind: 'Tailored behind', no_gain_that_large: 'No gain as big as 20%', too_early: 'Too early to tell', too_few: 'Not enough learners yet',
  };
  const row = (o) => `<tr${o.primary ? ' style="font-weight:600"' : ''}>
      <td>${esc(o.label)}${o.primary ? ' <span class="tiny">(primary)</span>' : ''}<div class="tiny muted">${esc(o.note)}</div></td>
      <td>${o.tailored.n}<br>${num(o.tailored.estimate, o.unit)}</td>
      <td>${o.base.n}<br>${num(o.base.estimate, o.unit)}</td>
      <td>${o.diff ? `${signed(o.diff.estimate, o.unit)}<div class="tiny muted">${esc(o.alpha_label)} interval ${signed(o.diff.lo, o.unit)} to ${signed(o.diff.hi, o.unit)}</div>` : '—'}</td>
      <td>${o.relative ? `${o.relative.estimate > 0 ? '+' : ''}${(o.relative.estimate * 100).toFixed(0)}%<div class="tiny muted">${(o.relative.lo * 100).toFixed(0)}% to ${(o.relative.hi * 100).toFixed(0)}%</div>` : '—'}</td>
      <td>${esc(badge[o.status] || o.status)}${o.power && o.power.more_learners_for_sequential !== null ? `<div class="tiny muted">${o.power.more_learners_for_sequential} more learners to settle a 20% gain</div>` : ''}</td></tr>`;
  const e = rep.enrolment;
  root.innerHTML = `
    <div class="row-between" style="flex-wrap:wrap;gap:8px"><h1 style="margin:0">Tailored vs base</h1>
      <button class="btn btn-sm" id="recompute" type="button">Recompute now</button></div>
    <p class="muted">Written ${esc(new Date(rep.generated_at).toLocaleString())}. Real learners in the beta, drawn at random into two groups; nothing here is simulated.</p>
    <div class="notice"><strong>${esc(rep.summary)}</strong></div>
    <p>In the comparison: <strong>${e.in_comparison}</strong> learners (${e.by_arm.tailored} tailored, ${e.by_arm.base} base${e.share_base !== null ? `, ${(e.share_base * 100).toFixed(0)}% base` : ''}; planned ${(rep.design.holdout_share_planned * 100).toFixed(0)}%).
      ${Object.keys(e.left_out_of_numbers).length ? `Left out of the numbers: ${esc(Object.entries(e.left_out_of_numbers).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', '))}.` : ''}</p>
    <div style="overflow-x:auto"><table class="table"><thead><tr><th>Outcome</th><th>Tailored<br><span class="tiny">n, estimate</span></th><th>Base<br><span class="tiny">n, estimate</span></th><th>Difference (tailored minus base)</th><th>Relative to base</th><th>Reading</th></tr></thead><tbody>${rep.outcomes.map(row).join('')}</tbody></table></div>
    <h2>In plain words</h2>
    <ul>${rep.outcomes.map((o) => `<li>${esc(o.reading)}</li>`).join('')}</ul>
    <h2>How to read this</h2>
    <p>${esc(rep.design.interval.method)}. Secondary outcomes: ${esc(rep.design.correction)}, so each uses a ${(100 - rep.design.alpha_each_secondary * 100).toFixed(2)}% interval; the primary (${esc(rep.outcomes[0].label.toLowerCase())}) uses 95%.
      An outcome is not read until each group has ${rep.design.interval.min_learners_per_arm} learners with a value.</p>
    <ul class="muted">${rep.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
  const btn = document.getElementById('recompute');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Recomputing';
    try { await App.api.get('/api/admin/beta-report?refresh=1'); } catch (err) { /* the reload below shows the old report */ }
    window.location.reload();
  });
});
