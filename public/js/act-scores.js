/* ACT scores: the test date, the target, and the score from each practice test, charted.
 *
 * The learner types every number. Nothing here predicts a score. The chart is drawn as
 * inline SVG so it needs no library and scales to a 375 px screen. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const COLORS = { composite: 'var(--ink)', english: '#2f6fdb', math: '#c2410c', reading: '#15803d', science: '#7c3aed' };
  const LABELS = { composite: 'Composite', english: 'English', math: 'Math', reading: 'Reading', science: 'Science' };

  let data;
  try { data = await App.api.get('/api/act/scores'); } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }

  function chart(scores) {
    const pts = scores.filter((s) => s.composite !== null);
    if (!pts.length) return '<p class="muted">Add a practice-test score and your chart appears here.</p>';
    const W = 340, H = 200, L = 28, R = 10, T = 12, B = 34;
    const target = data.profile.target;
    const vals = pts.flatMap((s) => [s.composite, s.english, s.math, s.reading, s.science]).filter((v) => v !== null);
    if (target) vals.push(target);
    const lo = Math.max(1, Math.floor((Math.min(...vals) - 2) / 2) * 2);
    const hi = Math.min(36, Math.ceil((Math.max(...vals) + 2) / 2) * 2);
    const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
    const y = (v) => T + ((hi - v) * (H - T - B)) / Math.max(1, hi - lo);
    let g = '';
    for (let v = lo; v <= hi; v += Math.max(2, Math.ceil((hi - lo) / 4 / 2) * 2)) {
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity=".15"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="currentColor">${v}</text>`;
    }
    if (target) g += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" stroke="currentColor" stroke-dasharray="4 3"/><text x="${W - R}" y="${y(target) - 3}" text-anchor="end" font-size="10" fill="currentColor">Target ${target}</text>`;
    for (const key of ['science', 'reading', 'math', 'english', 'composite']) {
      const line = pts.map((s, i) => (s[key] === null ? null : [x(i), y(s[key])])).filter(Boolean);
      if (!line.length) continue;
      const main = key === 'composite';
      g += `<polyline fill="none" stroke="${COLORS[key]}" stroke-width="${main ? 3 : 1.5}" opacity="${main ? 1 : 0.75}" points="${line.map((p) => p.join(',')).join(' ')}"/>`;
      g += line.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${main ? 4 : 2.5}" fill="${COLORS[key]}"/>`).join('');
    }
    g += pts.map((s, i) => `<text x="${x(i)}" y="${H - 14}" text-anchor="middle" font-size="9" fill="currentColor">${esc(s.taken_on.slice(5))}</text>`).join('');
    const legend = Object.keys(COLORS).map((k) => `<span class="tiny" style="margin-right:10px"><span style="display:inline-block;width:10px;height:10px;background:${COLORS[k]};margin-right:4px"></span>${LABELS[k]}</span>`).join('');
    const label = `ACT scores over time: ${pts.map((s) => `${s.taken_on} composite ${s.composite}`).join('; ')}`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}" style="color:var(--ink-2);max-width:560px">${g}</svg><div>${legend}</div>`;
  }

  function render() {
    const p = data.profile;
    const days = data.days_to_test;
    const countdown = days === null ? '' : days > 0 ? `${days} day${days === 1 ? '' : 's'} to your test.` : days === 0 ? 'Your test is today.' : 'Your test date has passed. Add your real score below.';
    const gap = data.points_to_target === null ? '' : data.points_to_target > 0 ? `Your latest composite is ${data.latest_composite}, ${data.points_to_target} below your target.` : `Your latest composite is ${data.latest_composite}, at or above your target.`;
    root.innerHTML = `
      <h1>ACT scores</h1>
      <p class="muted"><a href="/act-study">Taking part in the ACT study?</a></p>
      <p class="muted">Type in the scores from your official practice tests, and later your real ACT. Only you and your parent can see them. The composite shown is the average of English, Math and Reading.</p>
      <div class="card">
        <h2>Your test</h2>
        <label class="field"><span>Test date</span><input type="text" id="test-date" inputmode="numeric" placeholder="YYYY-MM-DD" maxlength="10" value="${esc(p.test_date || '')}"></label>
        <label class="field"><span>Target composite (1 to 36)</span><input type="number" id="target" min="1" max="36" value="${esc(p.target || '')}"></label>
        <button class="btn btn-primary" type="button" id="save-profile">Save</button>
        <p class="small muted" id="profile-note">${esc([countdown, gap].filter(Boolean).join(' '))}</p>
      </div>
      <div class="card" style="margin-top:18px"><h2>Your scores</h2>${chart(data.scores)}</div>
      <div class="card" style="margin-top:18px">
        <h2>Add a test</h2>
        <label class="field"><span>Kind</span><select id="kind"><option value="practice">Practice test</option><option value="official">Real ACT</option></select></label>
        <label class="field"><span>Date taken</span><input type="text" id="taken-on" inputmode="numeric" placeholder="YYYY-MM-DD" maxlength="10"></label>
        <label class="field"><span>Form (optional, like "A")</span><input type="text" id="form" maxlength="40"></label>
        ${['english', 'math', 'reading', 'science'].map((s) => `<label class="field"><span>${LABELS[s]}${s === 'science' ? ' (optional)' : ''}</span><input type="number" id="s-${s}" min="1" max="36"></label>`).join('')}
        <button class="btn btn-primary" type="button" id="add-score">Add this test</button>
        <p class="small" id="add-note" role="status"></p>
      </div>
      <div class="card" style="margin-top:18px"><h2>History</h2>${data.scores.length ? `<ul style="list-style:none;padding:0;margin:0">${data.scores.slice().reverse().map((s) => `
        <li class="row-between row-wrap" style="padding:6px 0"><span>${esc(s.taken_on)} · ${s.kind === 'official' ? 'Real ACT' : 'Practice'}${s.form ? ` ${esc(s.form)}` : ''}: E ${s.english} · M ${s.math} · R ${s.reading}${s.science === null ? '' : ` · S ${s.science}`}${s.composite === null ? '' : ` · <strong>${s.composite}</strong>`}</span>
        <button class="btn btn-sm" type="button" data-del="${s.id}" aria-label="Delete the ${esc(s.taken_on)} score">Delete</button></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}</div>`;

    const num = (id) => { const v = document.getElementById(id).value.trim(); return v === '' ? null : Number(v); };
    document.getElementById('save-profile').addEventListener('click', async () => {
      try {
        data = await App.api.post('/api/act/profile', { test_date: document.getElementById('test-date').value.trim() || null, target: num('target') });
        render();
        App.toast('Saved.', 'ok');
      } catch (err) { App.toast(err.message, 'error'); }
    });
    document.getElementById('add-score').addEventListener('click', async () => {
      const body = { kind: document.getElementById('kind').value, taken_on: document.getElementById('taken-on').value.trim(), form: document.getElementById('form').value.trim(),
        english: num('s-english'), math: num('s-math'), reading: num('s-reading'), science: num('s-science') };
      try {
        data = await App.api.post('/api/act/scores', body);
        render();
        App.toast('Added.', 'ok');
      } catch (err) { document.getElementById('add-note').textContent = err.message; }
    });
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Delete this score?')) return;
      try { data = await App.api.del(`/api/act/scores/${b.dataset.del}`); render(); } catch (err) { App.toast(err.message, 'error'); }
    }));
  }
  render();
});
