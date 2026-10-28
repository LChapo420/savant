/* The retention calendar (services/enforcers.js calendar; RETENTION-ENFORCERS.md):
 * which day each scheduled retention enforcer falls on, for every learner.
 * Past days say done, none, skipped, stopped, missed or nothing to cover;
 * today says due; later days are upcoming. End-of-session and end-of-day
 * enforcers show as a small mark on their day.
 *
 * A month is a table (one row a week, Monday first): each cell's full
 * sentence is in the cell for screen readers, and the short tag and mark are
 * what the eye reads. Under it, the next few in a plain list. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'calendar');

  const host = document.getElementById('calendar');
  const esc = App.escapeHtml;
  const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  const SHORT = { semiweekly: 'S', weekly: 'W', biweekly: 'B', monthly: 'M' };
  const STATUS = {
    done: 'done', none: 'no enforcer chosen', skipped: 'skipped', stopped: 'stopped partway', missed: 'missed',
    empty: 'nothing to cover', due: 'due', upcoming: 'coming up', today: 'today, at End day session',
  };
  const TIER = { quick: 'quick', medium: 'medium', full: 'full' };

  const parse = (d) => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)); };
  const fmt = (d, o) => parse(d).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
  const monthOf = (d) => d.slice(0, 7);
  const shift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return t.toISOString().slice(0, 7); };

  let month = App.query('month') || null;
  let data = null;

  function mark(status) {
    if (status === 'done') return window.mark('tick');
    if (status === 'missed') return window.mark('slash', 'mark-plain');
    if (status === 'stopped') return window.mark('underline', 'mark-plain');
    return '';
  }

  function sentence(day) {
    const parts = [];
    const ev = day.scheduled;
    if (ev) parts.push(`${ev.label} enforcer${(ev.absorbs || []).length ? ` with the ${ev.absorbs.map((a) => a.label.toLowerCase()).join(' and ')} and the end of day, as one` : ', with the end of day'}, ${STATUS[ev.status] || ev.status}${ev.tier && ev.status === 'done' ? ` (${TIER[ev.tier] || ev.tier})` : ''}${ev.done_on && ev.done_on !== day.date ? `, done on ${fmt(ev.done_on, { day: 'numeric', month: 'long' })}` : ''}. Covers ${fmt(ev.window.from_date, { day: 'numeric', month: 'short' })} to ${fmt(ev.window.to_date, { day: 'numeric', month: 'short' })}.`);
    for (const e of day.ends) parts.push(`${e.label} enforcer, ${e.status === 'due' ? 'waiting' : STATUS[e.status] || e.status}.`);
    return parts.join(' ');
  }

  function cell(day) {
    if (!day) return '<td class="cal-pad" aria-hidden="true"></td>';
    const ev = day.scheduled;
    const n = Number(day.date.slice(8));
    return `
      <td class="cal-day${day.today ? ' is-today' : ''}${day.past ? ' is-past' : ''}"${day.today ? ' aria-current="date"' : ''}>
        <span class="cal-n num" aria-hidden="true">${n}</span>
        ${ev ? `<span class="cal-ev is-${esc(ev.status)}" aria-hidden="true" title="${esc(`${[ev.label, ...(ev.absorbs || []).map((a) => a.label.toLowerCase())].join(' + ')}: ${STATUS[ev.status] || ev.status}`)}"><span class="cal-tag"><span class="cal-short">${SHORT[ev.type]}${(ev.absorbs || []).map((a) => `+${SHORT[a.type]}`).join('')}</span><span class="cal-long">${esc([ev.label, ...(ev.absorbs || []).map((a) => a.label.toLowerCase())].join(' + '))}</span></span>${mark(ev.status)}</span>` : ''}
        ${day.ends.length ? `<span class="cal-ends" aria-hidden="true" title="End-of-session enforcers">${day.ends.map((e) => `<i class="${e.status === 'done' ? 'is-done' : ''}"></i>`).join('')}</span>` : ''}
        <span class="visually-hidden">${esc(fmt(day.date, { weekday: 'long', day: 'numeric', month: 'long' }))}${day.today ? ', today' : ''}. ${esc(sentence(day) || 'No enforcer.')}</span>
      </td>`;
  }

  function grid() {
    const days = data.days;
    // Monday first: 0 = Monday.
    const lead = (parse(days[0].date).getUTCDay() + 6) % 7;
    const cells = [...Array(lead).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).map(cell).join('')}</tr>`);
    const names = [0, 1, 2, 3, 4, 5, 6].map((k) => {
      const d = new Date(Date.UTC(2024, 0, 1 + k)); // 1 January 2024 was a Monday
      return `<th scope="col"><span aria-hidden="true">${esc(d.toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }))}</span><span class="visually-hidden">${esc(d.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' }))}</span></th>`;
    }).join('');
    return `
      <table class="cal-grid">
        <caption class="visually-hidden">Retention enforcers in ${esc(fmt(data.first, { month: 'long', year: 'numeric' }))}</caption>
        <thead><tr>${names}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
  }

  function legend() {
    return `
      <dl class="cal-legend">
        <div><dt><span class="cal-tag">S</span></dt><dd>Semi-weekly: every 3 then 4 days from your first day, covers the days since the last one</dd></div>
        <div><dt><span class="cal-tag">W</span></dt><dd>Weekly: every 7 days, covers the week up to and including its day</dd></div>
        <div><dt><span class="cal-tag">B</span></dt><dd>Bi-weekly: every 14 days, covers the two weeks up to and including its day</dd></div>
        <div><dt><span class="cal-tag">M</span></dt><dd>Monthly: about every 30 days on a free day, covers the month since the last one</dd></div>
        <div><dt><span class="cal-tag">W+S</span></dt><dd>Two on one day: the wider one takes in the other as one enforcer. Every scheduled enforcer also covers its own day: take it with End day session</dd></div>
        <div><dt>${window.mark('tick')}</dt><dd>Done</dd></div>
        <div><dt>${window.mark('slash', 'mark-plain')}</dt><dd>Missed</dd></div>
        <div><dt><span class="cal-tag is-dashed">&nbsp;</span></dt><dd>Coming up</dd></div>
        <div><dt><span class="cal-ends"><i class="is-done"></i></span></dt><dd>An end-of-session or end-of-day enforcer</dd></div>
      </dl>`;
  }

  function upcoming() {
    if (!data.upcoming.length) return '';
    return `
      <section class="cal-section" aria-labelledby="next-h">
        <h2 class="section-title" id="next-h">Coming up</h2>
        <ol class="review-list">
          ${data.upcoming.map((u) => `
            <li class="review-row">
              <span>
                <span class="review-title">${esc([u.label, ...(u.absorbs || []).map((a) => a.label.toLowerCase())].join(' + '))}</span>
                <span class="review-why">Covers ${esc(fmt(u.window.from_date, { day: 'numeric', month: 'short' }))} to ${esc(fmt(u.window.to_date, { day: 'numeric', month: 'short' }))}.</span>
              </span>
              <span class="review-kind num">${esc(fmt(u.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
            </li>`).join('')}
        </ol>
      </section>`;
  }

  function draw() {
    const ym = data.month;
    host.innerHTML = `
      <div class="enf-head">
        <h1>Retention calendar</h1>
        <p class="enf-lede">${data.preview
    ? 'Your schedule starts on the day of your first study session. This is how it would run from today.'
    : `Counted from your first study session, ${esc(fmt(data.anchor, { day: 'numeric', month: 'long', year: 'numeric' }))}, in your own time zone. On its day an enforcer is your End day session and covers that day too; if the day ends without it, it is offered before your next session.`}</p>
      </div>
      <div class="cal-bar">
        <button class="btn btn-sm" type="button" id="prev"><span aria-hidden="true">${window.icon('arrow-left')}</span><span class="visually-hidden">Previous month</span></button>
        <h2 class="cal-month" id="month-h" aria-live="polite">${esc(fmt(data.first, { month: 'long', year: 'numeric' }))}</h2>
        <button class="btn btn-sm" type="button" id="next"><span aria-hidden="true">${window.icon('arrow-right')}</span><span class="visually-hidden">Next month</span></button>
        ${ym !== monthOf(data.today) ? '<button class="btn-text" type="button" id="now">This month</button>' : ''}
      </div>
      ${grid()}
      ${legend()}
      ${upcoming()}`;
    document.getElementById('prev').addEventListener('click', () => go(shift(ym, -1), 'prev'));
    document.getElementById('next').addEventListener('click', () => go(shift(ym, 1), 'next'));
    const now = document.getElementById('now');
    if (now) now.addEventListener('click', () => go(monthOf(data.today), 'next'));
  }

  async function go(ym, focus) {
    month = ym;
    try {
      data = await App.api.get(`/api/retention/calendar?tz=${encodeURIComponent(TZ)}${month ? `&month=${month}` : ''}`);
    } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${esc(err.status === 404 ? 'The retention calendar is switched off.' : err.message)}</div>`;
      return;
    }
    draw();
    if (focus) { const b = document.getElementById(focus); if (b) b.focus(); }
    try { history.replaceState(null, '', month ? `/calendar?month=${month}` : '/calendar'); } catch { /* fine */ }
  }

  await go(month, null);
});
