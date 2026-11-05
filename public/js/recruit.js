/* /recruit: the owner's numbers from /api/recruit/stats (admin only). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function cell(tr, text) { var td = document.createElement('td'); td.textContent = text; tr.appendChild(td); }
  function rows(table, list, cols) {
    var body = $(table).querySelector('tbody');
    body.textContent = '';
    list.forEach(function (r) { var tr = document.createElement('tr'); cols.forEach(function (c) { cell(tr, r[c] == null ? '-' : r[c]); }); body.appendChild(tr); });
  }
  fetch('/api/recruit/stats', { credentials: 'same-origin' }).then(function (r) {
    if (!r.ok) { document.body.textContent = 'Not found.'; return null; }
    return r.json();
  }).then(function (s) {
    if (!s) return;
    $('def').textContent = s.definition;
    $('q').textContent = s.totals.qualified;
    $('goal').textContent = s.goal;
    $('meter').style.width = Math.min(100, Math.round((s.totals.qualified / s.goal) * 100)) + '%';
    $('pace').textContent = s.days_left + ' day' + (s.days_left === 1 ? '' : 's') + ' to ' + s.goal_date + '. Need about ' + s.needed_per_day + ' qualified a day from here.';
    var t = $('totals');
    t.textContent = '';
    [['Visits', s.totals.visit], ['Started', s.totals.started], ['Finished', s.totals.finished], ['Applied', s.totals.applicants], ['Qualified', s.totals.qualified]].forEach(function (p) {
      var d = document.createElement('div'); d.className = 'ac-card';
      var n = document.createElement('p'); n.className = 'rc-big'; n.textContent = p[1];
      var l = document.createElement('p'); l.className = 'ac-small'; l.textContent = p[0];
      d.appendChild(n); d.appendChild(l); t.appendChild(d);
    });
    rows('refs', s.refs.map(function (r) { return { ref: r.ref || '(none)', channel: r.channel, visit: r.visit, started: r.started, finished: r.finished, applied: r.applied, qualified: r.qualified, referrals: r.referrals }; }), ['ref', 'channel', 'visit', 'started', 'finished', 'applied', 'qualified', 'referrals']);
    rows('daily', s.daily.slice().reverse().map(function (d) { return { day: d.day, blank: '', visit: d.visit, started: d.started, finished: d.finished, applied: d.applied, qualified: d.qualified, cumulative_qualified: d.cumulative_qualified }; }), ['day', 'blank', 'visit', 'started', 'finished', 'applied', 'qualified', 'cumulative_qualified']);
  });
})();
