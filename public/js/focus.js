/* Focus history and subject focus on the profile page (owner's request, 30 Oct 2026).
 * Calendar heat map by month or year: white for no study, then five greens by hours.
 * Subject pie for a day, week, month or year, with hours per subject beside it.
 * Data: GET /api/profile/focus ({ sample, subjects, days: { date: { subject: minutes } } }). */
(function () {
  const BANDS = [
    { max: 0, cls: 'f0', label: 'None' },
    { max: 59.99, cls: 'f1', label: 'Under 1 h' },
    { max: 179.99, cls: 'f2', label: '1-2 h' },
    { max: 299.99, cls: 'f3', label: '3-4 h' },
    { max: 419.99, cls: 'f4', label: '5-6 h' },
    { max: Infinity, cls: 'f5', label: '7 h or more' },
  ];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hours = (min) => {
    const h = min / 60;
    return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1).replace(/\.0$/, '')} h`;
  };
  const band = (min) => BANDS.find((b) => min <= b.max) || BANDS[BANDS.length - 1];

  function mount(host, data) {
    const total = (d) => Object.values(data.days[d] || {}).reduce((a, b) => a + b, 0);
    const today = new Date();
    let calView = 'month';
    let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    let pieView = 'week';
    const sampleChip = data.sample ? ' <span class="focus-chip">Sample data</span>' : '';

    host.innerHTML = `
      <div class="grid grid-2 focus-grid">
        <div class="card">
          <div class="row-between focus-head"><div class="card-title" style="margin:0">Focus history${sampleChip}</div>
            <div class="seg" role="group" aria-label="Calendar view"><button type="button" data-cal="month">Month</button><button type="button" data-cal="year">Year</button></div></div>
          <div class="row-between focus-nav"><button type="button" class="btn btn-ghost btn-sm" data-step="-1" aria-label="Earlier">&lsaquo;</button><strong class="focus-period"></strong><button type="button" class="btn btn-ghost btn-sm" data-step="1" aria-label="Later">&rsaquo;</button></div>
          <div class="focus-cal"></div>
          <div class="focus-sum small muted"></div>
          <div class="focus-legend">${BANDS.map((b) => `<span><i class="fcell ${b.cls}"></i>${b.label}</span>`).join('')}</div>
        </div>
        <div class="card">
          <div class="row-between focus-head"><div class="card-title" style="margin:0">Subject focus${sampleChip}</div>
            <div class="seg" role="group" aria-label="Pie period"><button type="button" data-pie="day">Day</button><button type="button" data-pie="week">Week</button><button type="button" data-pie="month">Month</button><button type="button" data-pie="year">Year</button></div></div>
          <div class="focus-pie-wrap"><svg class="focus-pie" viewBox="0 0 120 120" role="img"></svg><ul class="focus-keys"></ul></div>
          <div class="focus-pie-sum small muted"></div>
        </div>
      </div>`;
    const $ = (s) => host.querySelector(s);

    function cell(d, small) {
      const key = iso(d);
      const min = total(key);
      const future = d > today;
      return `<div class="fcell ${future ? 'fx' : band(min).cls}${small ? ' sm' : ''}" title="${key}: ${future ? '' : hours(min)}">${small ? '' : d.getDate()}</div>`;
    }
    function monthGrid(y, m, small) {
      const first = new Date(y, m, 1);
      const pad = (first.getDay() + 6) % 7; // weeks start on Monday
      const n = new Date(y, m + 1, 0).getDate();
      let html = small ? '' : '<div class="fwd">M</div><div class="fwd">T</div><div class="fwd">W</div><div class="fwd">T</div><div class="fwd">F</div><div class="fwd">S</div><div class="fwd">S</div>';
      html += '<div class="fpad"></div>'.repeat(pad);
      for (let i = 1; i <= n; i++) html += cell(new Date(y, m, i), small);
      return `<div class="fmonth${small ? ' sm' : ''}">${html}</div>`;
    }
    function drawCal() {
      host.querySelectorAll('[data-cal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cal === calView)));
      let from;
      let to;
      if (calView === 'month') {
        $('.focus-period').textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
        $('.focus-cal').innerHTML = monthGrid(cursor.getFullYear(), cursor.getMonth(), false);
        from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      } else {
        const y = cursor.getFullYear();
        $('.focus-period').textContent = String(y);
        $('.focus-cal').innerHTML = `<div class="fyear">${MONTHS.map((name, m) => `<div><div class="tiny muted">${name.slice(0, 3)}</div>${monthGrid(y, m, true)}</div>`).join('')}</div>`;
        from = new Date(y, 0, 1);
        to = new Date(y, 11, 31);
      }
      let sum = 0;
      let active = 0;
      for (let d = new Date(from); d <= to && d <= today; d.setDate(d.getDate() + 1)) { const t = total(iso(d)); sum += t; if (t > 0) active++; }
      $('.focus-sum').textContent = `${hours(sum)} in total, on ${active} day${active === 1 ? '' : 's'}`;
    }
    function range(view) {
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const start = new Date(end);
      if (view === 'week') start.setDate(end.getDate() - 6);
      if (view === 'month') start.setDate(end.getDate() - 29);
      if (view === 'year') start.setDate(end.getDate() - 364);
      return [start, end];
    }
    function drawPie() {
      host.querySelectorAll('[data-pie]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pie === pieView)));
      const [start, end] = range(pieView);
      const by = {};
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) for (const [s, m] of Object.entries(data.days[iso(d)] || {})) by[s] = (by[s] || 0) + m;
      const subs = data.subjects.filter((s) => by[s.id] > 0).sort((a, b) => by[b.id] - by[a.id]);
      const sum = subs.reduce((a, s) => a + by[s.id], 0);
      const svg = $('.focus-pie');
      if (!sum) {
        svg.innerHTML = '<circle cx="60" cy="60" r="50" fill="var(--surface-2)"></circle>';
        $('.focus-keys').innerHTML = '<li class="small muted">No study time in this period yet.</li>';
        $('.focus-pie-sum').textContent = '';
        return;
      }
      let angle = -Math.PI / 2;
      svg.innerHTML = subs.map((s) => {
        const frac = by[s.id] / sum;
        if (frac >= 0.9999) return `<circle cx="60" cy="60" r="50" fill="${s.color}"></circle>`;
        const a2 = angle + frac * 2 * Math.PI;
        const p = (a) => `${(60 + 50 * Math.cos(a)).toFixed(2)} ${(60 + 50 * Math.sin(a)).toFixed(2)}`;
        const path = `<path d="M60 60 L${p(angle)} A50 50 0 ${frac > 0.5 ? 1 : 0} 1 ${p(a2)} Z" fill="${s.color}" stroke="var(--surface)" stroke-width="1"><title>${s.name}: ${hours(by[s.id])}</title></path>`;
        angle = a2;
        return path;
      }).join('');
      svg.setAttribute('aria-label', subs.map((s) => `${s.name} ${hours(by[s.id])}`).join(', '));
      $('.focus-keys').innerHTML = subs.map((s) => `<li><i style="background:${s.color}"></i><span>${App.escapeHtml(s.name)}</span><strong>${hours(by[s.id])}</strong><span class="tiny muted">${Math.round(100 * by[s.id] / sum)}%</span></li>`).join('');
      const label = { day: 'today', week: 'in the last 7 days', month: 'in the last 30 days', year: 'in the last 12 months' }[pieView];
      $('.focus-pie-sum').textContent = `${hours(sum)} ${label}`;
    }
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.cal) { calView = b.dataset.cal; drawCal(); }
      if (b.dataset.pie) { pieView = b.dataset.pie; drawPie(); }
      if (b.dataset.step) {
        const s = Number(b.dataset.step);
        cursor = calView === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth() + s, 1) : new Date(cursor.getFullYear() + s, cursor.getMonth(), 1);
        drawCal();
      }
    });
    drawCal();
    drawPie();
  }

  window.FocusHistory = {
    async mount(host) {
      try { mount(host, await App.api.get('/api/profile/focus')); } catch { host.innerHTML = '<p class="small muted">Focus history is not available right now.</p>'; }
    },
  };
}());
