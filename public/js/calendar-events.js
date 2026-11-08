/* The learner's own dates on the calendar page (services/tutor-events.js, routes/events.js; docs/TUTOR-EVENTS.md): tests, quizzes,
 * exams, due dates and anything else, put there by the tutor (after a tap on Add) or by hand. Separate from js/calendar.js on purpose:
 * it reads its own API (/api/events), lays a small pill on each day of the month the page shows (the month is the page's ?month=, else this
 * month) and keeps a list below the grid to add, change and delete. Off (404) when TUTOR_EVENTS is off: the page is then as it was. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  const grid = document.getElementById('calendar');
  if (!grid) return;
  const esc = App.escapeHtml;
  let state = null;
  let editing = null; // an event id, 'new', or null

  const host = document.createElement('section');
  host.className = 'wrap cal-section uev';
  host.id = 'my-events';
  host.setAttribute('aria-labelledby', 'uev-h');
  grid.parentNode.insertBefore(host, grid.nextSibling);

  const parse = (d) => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)); };
  const fmt = (d, o) => parse(d).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
  const KIND = { test: 'Test', quiz: 'Quiz', exam: 'Exam', due: 'Due', other: 'Other' };
  const monthShown = () => App.query('month') || (state ? state.today.slice(0, 7) : null);

  async function load() {
    try {
      state = await App.api.request('GET', '/api/events');
    } catch (err) {
      host.hidden = true; // off or signed out: the calendar is as it was
      state = null;
      return false;
    }
    return true;
  }

  function pills() {
    for (const old of grid.querySelectorAll('.uev-pill')) old.remove();
    const ym = monthShown();
    if (!state || !ym) return;
    for (const td of grid.querySelectorAll('td.cal-day')) {
      const n = td.querySelector('.cal-n');
      if (!n) continue;
      const date = `${ym}-${String(Number(n.textContent)).padStart(2, '0')}`;
      const todays = state.events.filter((e) => e.date === date);
      if (!todays.length) continue;
      const wrap = document.createElement('span');
      wrap.className = 'uev-pill';
      wrap.innerHTML = todays.slice(0, 2).map((e) => `<button type="button" class="cal-tag uev-tag is-${esc(e.kind)}" data-id="${e.id}" title="${esc(`${e.title}${e.time ? ` at ${e.time}` : ''}`)}"><span class="visually-hidden">${esc(`${KIND[e.kind]}: `)}</span>${esc(e.title)}</button>`).join('')
        + (todays.length > 2 ? `<span class="uev-more">+${todays.length - 2}</span>` : '');
      td.appendChild(wrap);
    }
  }

  function form(e) {
    const f = e || { title: '', date: state.today, time: '', kind: 'test', enrollment_id: null };
    return `
      <form class="uev-form" id="uev-form" novalidate>
        <label>Title<input type="text" name="title" maxlength="80" value="${esc(f.title)}" required></label>
        <label>Date<input type="date" name="date" value="${esc(f.date)}" required></label>
        <label>Time (optional)<input type="time" name="time" value="${esc(f.time || '')}"></label>
        <label>Kind<select name="kind">${state.kinds.map((k) => `<option value="${k}"${k === f.kind ? ' selected' : ''}>${KIND[k]}</option>`).join('')}</select></label>
        ${state.enrollments.length ? `<label>Subject (optional)<select name="enrollment_id"><option value="">None</option>${state.enrollments.map((s) => `<option value="${s.id}"${s.id === f.enrollment_id ? ' selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>` : ''}
        <p class="uev-error notice notice-error" role="alert" hidden></p>
        <div class="uev-actions"><button class="btn btn-primary" type="submit">${e ? 'Save' : 'Add'}</button><button class="btn" type="button" id="uev-cancel">Cancel</button></div>
      </form>`;
  }

  function draw() {
    if (!state) return;
    host.hidden = false;
    const rows = state.events.map((e) => `
      <li class="review-row uev-row" data-id="${e.id}">
        <span>
          <span class="review-title">${esc(e.title)}</span>
          <span class="review-why">${esc(KIND[e.kind])}${e.time ? `, ${esc(e.time)}` : ''}${e.source === 'tutor' ? ', added by your tutor' : ''}</span>
        </span>
        <span class="review-kind num">${esc(fmt(e.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
        <span class="uev-row-actions"><button class="btn btn-sm" type="button" data-edit="${e.id}">Edit<span class="visually-hidden"> ${esc(e.title)}</span></button><button class="btn btn-sm" type="button" data-del="${e.id}">Delete<span class="visually-hidden"> ${esc(e.title)}</span></button></span>
        ${editing === e.id ? form(e) : ''}
      </li>`).join('');
    host.innerHTML = `
      <h2 class="section-title" id="uev-h">Your dates</h2>
      <p class="review-why">Tests, quizzes, due dates and anything else. Tell your tutor, or add them here.</p>
      ${rows ? `<ol class="review-list">${rows}</ol>` : '<p class="review-why">Nothing yet.</p>'}
      ${editing === 'new' ? form(null) : '<p><button class="btn btn-sm" type="button" id="uev-new">Add a date</button></p>'}`;
    pills();
  }

  async function submit(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = { title: fd.get('title'), date: fd.get('date'), time: fd.get('time') || null, kind: fd.get('kind'), enrollment_id: fd.get('enrollment_id') || null };
    const err = host.querySelector('.uev-error');
    try {
      if (editing === 'new') await App.api.request('POST', '/api/events', body);
      else await App.api.request('PUT', `/api/events/${editing}`, body);
      editing = null;
      await load();
      draw();
    } catch (e) { err.textContent = e.message || 'That did not save.'; err.hidden = false; }
  }

  host.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'uev-new') { editing = 'new'; draw(); host.querySelector('input[name=title]').focus(); }
    else if (t.id === 'uev-cancel') { editing = null; draw(); }
    else if (t.dataset.edit) { editing = Number(t.dataset.edit); draw(); host.querySelector('input[name=title]').focus(); }
    else if (t.dataset.del) {
      try { await App.api.del(`/api/events/${t.dataset.del}`); await load(); draw(); } catch (err) { /* stays listed */ }
    }
  });
  host.addEventListener('submit', (e) => { if (e.target.id === 'uev-form') submit(e); });
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.uev-tag');
    if (!t) return;
    editing = Number(t.dataset.id);
    draw();
    host.scrollIntoView({ block: 'start' });
  });

  // js/calendar.js draws the month into #calendar again at every page change: lay the pills back on after each (its URL update lands in the same task).
  let timer = 0;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(pills, 0); }).observe(grid, { childList: true });

  if (await load()) { draw(); }
});
