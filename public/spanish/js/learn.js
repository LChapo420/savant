/* /spanish/learn?enrollment=<id>[&level=<n>] — a level of the main Spanish path,
 * played with the lab's Duolingo-style engines.
 *
 * The server (GET /api/es/path/level) builds the level from its curriculum row,
 * the learner's goal and their review queue, and keeps the answers; this page
 * shows a start card (what the level is, and the one line saying why the path is
 * ordered the way it is), hands the level to its engine, and on the engine's
 * last screen asks the server to close the run (POST /api/es/path/finish), which
 * records the evidence, the review queue, XP and the streak, and moves the
 * learner on. A level the player cannot build comes back as { fallback } and the
 * ordinary session takes it.
 */
(async function () {
  const ES = window.ES;
  const { h, esc, icon } = ES;
  const root = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const enrollmentId = params.get('enrollment');
  const wantLevel = params.get('level');
  const pathUrl = `/path?enrollment=${encodeURIComponent(enrollmentId || '')}`;

  const page = (html) => {
    root.innerHTML = '';
    const wrap = h('main', { class: 'es-learn' }, html);
    root.append(wrap);
    return wrap;
  };
  const fail = (msg, link = pathUrl, label = 'Back to your path') => {
    page(`<div class="es-learn__char">${ES.character('mara')}</div><h1 class="es-h2 es-learn__title">${esc(msg)}</h1>
      <div class="es-learn__actions"><a class="es-btn es-btn--primary" href="${esc(link)}">${esc(label)}</a></div>`);
  };
  if (!enrollmentId) return fail('No subject chosen.', '/dashboard', 'Back to the dashboard');

  try {
    const prefs = JSON.parse(localStorage.getItem('es-prefs') || '{}');
    if (prefs.sfx === false) ES.sfx.enabled = false;
  } catch { /* storage blocked */ }

  let data;
  try {
    data = await ES.api.get(`/api/es/path/level?enrollment=${encodeURIComponent(enrollmentId)}${wantLevel ? `&level=${encodeURIComponent(wantLevel)}` : ''}`);
  } catch (err) {
    if (err.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return undefined; }
    if (err.payload && err.payload.placement) return fail(err.message, err.payload.placement, 'Take the placement');
    return fail(err.message || 'Could not load this level.');
  }
  if (data.fallback) { location.replace(data.fallback); return undefined; }

  // Voice and recognition as the server has them for this account.
  if (data.voice && !data.voice.server) ES.audio.setServer(false);
  ES.asr.server = data.voice ? !!data.voice.asr : null;

  const level = data.level;
  const row = data.row;
  document.title = `${row.title} · Spanish | Savant`;

  // ── the start card ───────────────────────────────────────────────────
  await new Promise((resolve) => {
    const kick = [`<span class="es-chip">Level ${row.level} of ${data.grade.path_length}</span>`, `<span class="es-chip es-chip--good">${esc(data.slot_label)}</span>`];
    if (row.minutes) kick.push(`<span class="es-chip">${icon('clock')} ${row.minutes} min</span>`);
    const wrap = page(`
      <div class="es-learn__top"><a class="es-learn__back" href="${esc(pathUrl)}">${icon('x')} Path</a><span class="es-muted es-small">${esc(data.grade.name)}</span></div>
      <div class="es-learn__char">${ES.character('axo')}</div>
      <div class="es-learn__kicker">${kick.join('')}</div>
      <h1 class="es-h2 es-learn__title">${esc(row.title)}</h1>
      <p class="es-muted es-learn__unit">${esc(row.unit)}${data.preview ? ' · practice (your place on the path does not move)' : ''}</p>
      ${data.fit ? `<div class="es-learn__why" data-profile="${esc(data.fit.profile)}">${icon('target')}<p><b>${esc(data.fit.label)}.</b> ${esc(data.fit.why)}</p></div>` : ''}
      <div class="es-learn__actions"><button class="es-btn es-btn--primary" id="start">Start</button></div>
      <p class="es-small es-learn__small"><a href="${esc(data.classic)}">Use the plain question version of this level</a></p>`);
    const start = wrap.querySelector('#start');
    start.addEventListener('click', () => { ES.audio.unlock(); resolve(); });
    ES.ui.onEnter(() => { ES.audio.unlock(); resolve(); });
    start.focus({ preventScroll: true });
  });

  // ── the engine, hosted ───────────────────────────────────────────────
  let finished = false;
  ES.flow.result = null;
  ES.flow.host = {
    exit: () => { location.href = pathUrl; },
    back: (r, summary) => { if (!finished) { finished = true; closeRun(summary); } },
  };

  async function closeRun(summary) {
    ES.ui.onEnter(null); ES.ui.onKeys(null); ES.audio.stop();
    page(`<div class="es-learn__char">${ES.character('axo')}</div><p class="es-muted es-learn__note">Saving your progress…</p>`);
    let out;
    try {
      out = await ES.api.post('/api/es/path/finish', { run: data.run, ...(ES.flow.result || {}) });
    } catch (err) {
      return fail(`Your answers could not be saved (${err.message}). Your place on the path has not moved.`);
    }
    if (out.passed && !out.preview && out.streak) await ES.ui.streak(root, { days: out.streak });
    const nextUrl = `/session?enrollment=${encodeURIComponent(enrollmentId)}`;
    const head = out.preview ? 'Practice saved'
      : out.passed ? (out.advanced ? `Level ${out.level} done!` : 'Level done!')
        : 'Almost — try this level again';
    const sub = out.passed
      ? (out.next && out.advanced ? `Next up: level ${out.next.level} · ${esc(out.next.label)} — <b>${esc(out.next.title)}</b>` : '')
      : `This level needs ${Math.round(out.pass_mark * 100)}% first-try; you got ${out.accuracy}%. A fresh round puts the ones you missed first.`;
    const stats = [
      out.accuracy !== null ? `<div class="es-learn__stat"><b>${out.accuracy}%</b><span>first try</span></div>` : '',
      `<div class="es-learn__stat"><b>${out.xp}</b><span>XP</span></div>`,
      `<div class="es-learn__stat"><b>${out.queue.learned}</b><span>words solid</span></div>`,
      `<div class="es-learn__stat"><b>${out.queue.due.length}</b><span>due for review</span></div>`,
    ].join('');
    const wrap = page(`
      <div class="es-learn__char">${ES.character(out.passed ? 'axo' : 'mara')}</div>
      <h1 class="es-h2 es-learn__title">${esc(head)}</h1>
      ${sub ? `<p class="es-learn__note">${sub}</p>` : ''}
      <div class="es-learn__stats">${stats}</div>
      <div class="es-learn__extra">${summary && summary.html && level.engine !== 'lesson' ? summary.html : ''}</div>
      <div class="es-learn__actions"></div>
      <p class="es-small es-learn__small es-muted">Words you meet come back for review when they are due, in every activity type.</p>`);
    const acts = wrap.querySelector('.es-learn__actions');
    const primary = h('a', { class: 'es-btn es-btn--primary' });
    if (!out.passed) { primary.textContent = 'Try again'; primary.href = location.pathname + location.search; }
    else if (out.preview) { primary.textContent = 'Back to your path'; primary.href = pathUrl; }
    else { primary.textContent = out.next ? 'Continue' : 'Back to your path'; primary.href = out.next ? nextUrl : pathUrl; }
    acts.append(primary);
    if (primary.href !== new URL(pathUrl, location.href).href) acts.append(h('a', { class: 'es-btn es-btn--ghost', href: pathUrl }, 'Back to your path'));
    ES.ui.onEnter(() => { location.href = primary.href; });
    primary.focus({ preventScroll: true });
    return undefined;
  }

  const engine = ES.engines[level.engine];
  if (!engine) { location.replace(data.classic); return undefined; }
  try {
    await engine(level, root);
  } catch (err) {
    console.error(err);
    fail('Something went wrong in this level.');
  }
  return undefined;
}());
