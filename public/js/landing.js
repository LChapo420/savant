/* Landing page: header state, the marked example and its scale, the first
 * week drawn on the scale, and the live subject catalogue, read from the same
 * catalogue the product uses so the page cannot drift from reality. */
App.mount(async () => {
  const user = await App.currentUser();
  App.header(user, 'how');

  // The example: the right answer gets the hand-drawn tick, and the scale shows
  // where a placement like this one puts you.
  const markSlot = document.getElementById('demo-mark');
  if (markSlot) markSlot.outerHTML = window.mark('tick');
  const demoScale = document.getElementById('demo-scale');
  if (demoScale) {
    demoScale.innerHTML = App.scale({
      from: 1, to: 393, you: 10, subject: 'math',
      ticks: [{ at: 31, kind: 'master' }, { at: 97, kind: 'grand' }, { at: 392, kind: 'grad' }],
      caption: 'Placed at level 10 of 393 in Mathematics. The next Master quiz is at level 31.',
    });
  }
  const week = document.getElementById('week-scale');
  if (week) {
    week.innerHTML = App.scale({
      from: 0, to: 35, you: 0, youLabel: 'day 0',
      ticks: [1, 3, 8, 21, 35].map((d) => ({ at: d, kind: 'plain' })),
      caption: 'Days after your first session. Each tick is a day when one skill comes back for review.',
    });
  }

  const host = document.getElementById('tracks');
  const { tracks } = await App.api.get('/api/catalog?view=summary');
  host.innerHTML = tracks.map((track) => `
    <tr data-subject="${App.escapeHtml(track.id)}">
      <td>${App.symbol(track)}</td>
      <td><span class="cat-name">${App.escapeHtml(track.name)}</span><span class="cat-range">${App.escapeHtml(track.blurb)}</span></td>
      <td class="cat-strip"><span class="grade-strip" aria-hidden="true">${'<i></i>'.repeat(track.grade_count)}</span></td>
      <td class="count"><span class="num">${track.grade_count}</span> grade${track.grade_count === 1 ? '' : 's'}</td>
    </tr>`).join('');
});
