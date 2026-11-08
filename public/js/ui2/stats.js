/* "Leaderboard and stats", the phone's third tab under UI_V2 (docs/UI-V2.md; design-refs/home-clean, the Stats tab). Its own page, /stats, listed in services/ui-v2.js.
 *
 * Only the learner's real numbers, each from where the app already keeps it:
 *   streak and XP   the signed-in user (GET /api/auth/me through App.currentUser), not shown when the learner or a parent hid them (the old header's rule)
 *   minutes         GET /api/ui2/stats: the last seven days, counted as Home's "Done for today" counts a day (services/ui-v2-stats.js)
 *   levels done     what each subject's path marks done (GET /api/path/:id?view=ticks), as Past counts them: placed or skipped past isn't finished, set-aside levels aren't counted
 *   subjects        GET /api/progress: where each one is, out of its path's length
 *   scorecard       GET /api/scorecard: how well Savant knows the learner, and its one-line summary; the whole of it stays on the profile
 * Leaderboards are not built: the page says they are coming and shows no ranking, real or made up. It reads only; it writes nothing.
 * With the flag off the page is never linked; opened by address it goes to the profile, which has the same numbers.
 */
(function () {
  if (!document.documentElement.hasAttribute('data-ui2')) { location.replace('/profile'); return; }
  const esc = (s) => App.escapeHtml(String(s == null ? '' : s));
  const ic = (name) => (App.ui2 ? App.ui2.ic(name) : '');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const num = (n) => Number(n || 0).toLocaleString();

  App.mount(async () => {
    const user = await App.currentUser({ require: true });
    if (!user) return;
    App.header(user, 'profile');
    const root = document.getElementById('root');
    const get = (url) => App.api.get(url).catch(() => null);
    const [week, progress, card] = await Promise.all([get('/api/ui2/stats'), get('/api/progress'), get('/api/scorecard')]);
    const subjects = ((progress && progress.enrollments) || []).filter((e) => e.status !== 'graduated');
    const doneBy = new Map();
    await Promise.all(subjects.filter((e) => e.status !== 'placement_pending').map(async (e) => {
      const reply = await get(`/api/path/${e.id}?view=ticks`);
      if (reply) doneBy.set(e.id, (reply.nodes || []).filter((n) => n.state === 'done' && !['known', 'unseen'].includes(n.unit_status) && !n.deferred).length);
    }));
    const levelsDone = [...doneBy.values()].reduce((a, b) => a + b, 0);
    const hidden = !!user.hide_stats;

    const cells = [
      ...(hidden ? [] : [[num(user.streak), `day streak`], [num(user.xp), 'XP']]),
      [week ? num(week.week_minutes) : '?', 'minutes this week'],
      [num(levelsDone), levelsDone === 1 ? 'level done' : 'levels done'],
    ];
    const days = (week && week.days) || [];
    const top = Math.max(1, ...days.map((d) => d.minutes));
    const dayName = (iso, how) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: how });
    const total = days.reduce((a, d) => a + d.minutes, 0);
    const chart = days.length ? `
      <div class="u2-week" role="img" aria-label="Minutes studied each day, the last 7 days: ${esc(days.map((d) => `${dayName(d.date, 'long')} ${d.minutes}`).join(', '))}">
        ${days.map((d) => `<span class="${d.date === week.today ? 'today' : ''}${d.minutes ? '' : ' none'}"><i style="height:${d.minutes ? Math.max(6, Math.round((d.minutes / top) * 64)) : 3}px"></i><em>${esc(dayName(d.date, 'narrow'))}</em></span>`).join('')}
      </div>
      ${total ? '' : '<p class="u2-s u2-week-none">Nothing yet this week. Your week fills in as you study.</p>'}` : '<p class="u2-s">Your week could not be loaded just now.</p>';
    const subjectRow = (e) => {
      const of = Number(e.grade && e.grade.pathLength) || 0;
      const where = e.status === 'placement_pending' ? 'Not placed yet' : `Level ${e.current_level}${of ? ` of ${of}` : ''}`;
      const done = doneBy.get(e.id);
      return `<a class="u2-li" href="/path?enrollment=${e.id}">${App.symbol(e.track)}<span class="u2-o-t"><b>${esc(e.track.name)}</b><small>${esc(where)}</small></span>${done != null ? `<span class="u2-v">${num(done)}<small>done</small></span>` : ''}${ic('chev-r')}</a>`;
    };
    const known = card && Number.isFinite(Number(card.overall_confidence)) ? Number(card.overall_confidence) : null;
    const headline = card && card.summary && card.summary.headline ? card.summary.headline : '';
    root.innerHTML = `
      <div class="u2-stats">
        <h1 class="u2-vh" tabindex="-1" id="u2-stats-title">Your stats</h1>
        <div class="u2-nums">${cells.map(([n, l]) => `<div><b class="u2-num-big">${esc(n)}</b><small>${esc(l)}</small></div>`).join('')}</div>
        ${hidden ? '<p class="u2-s u2-stats-note">Your streak and XP are hidden. You can show them again on <a href="/profile">your profile</a>.</p>' : ''}
        <h2 class="u2-label">This week</h2>
        ${chart}
        <h2 class="u2-label">Subjects</h2>
        ${subjects.length ? `<div class="u2-list">${subjects.map(subjectRow).join('')}</div>` : '<div class="u2-list"><a class="u2-li" href="/onboarding">' + ic('plus') + '<b class="u2-li-t">Add a subject</b></a></div>'}
        ${known != null ? `<h2 class="u2-label">Scorecard</h2>
        <a class="u2-list u2-li u2-score-row" href="/profile"><span class="u2-score-n">${known}%</span><span class="u2-o-t"><b>How well Savant knows you</b>${headline ? `<small>${esc(headline)}</small>` : ''}</span>${ic('chev-r')}</a>` : ''}
        <div class="u2-soon">${ic('people')}<span><b>Leaderboards are coming</b><small>With friends and study groups. Nothing to compare yet.</small></span></div>
      </div>`;
    root.querySelectorAll('.u2-li > .u2-ic:last-child').forEach((n) => n.classList.add('u2-mute'));
    App.announce(`Your stats. ${plural(levelsDone, 'level')} done.`);
  });
}());
