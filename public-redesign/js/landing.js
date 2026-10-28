/* Landing page: header state plus the live subject list, which is read from the
 * same catalogue the product uses, so marketing copy cannot drift from reality. */
App.mount(async () => {
  const user = await App.currentUser();
  App.header(user, 'how');

  const host = document.getElementById('tracks');
  const { tracks } = await App.api.get('/api/catalog');

  // A subject can have fifty grades; the card names the first few and counts the
  // rest, so the grid stays a grid rather than a wall of chips.
  const SHOWN = 5;
  host.innerHTML = tracks.map((track) => `
    <div class="track-card">
      <div class="track-head">
        <span class="track-icon" style="background:${track.color}1f; color:${track.color}">${window.icon(track.icon)}</span>
        <div>
          <div style="font-weight:650">${App.escapeHtml(track.name)}</div>
          <div class="tiny muted">${track.grades.length} grade${track.grades.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="track-body">
        <p class="small muted">${App.escapeHtml(track.blurb)}</p>
        <div class="row-wrap">
          ${track.grades.slice(0, SHOWN).map((g) => `<span class="chip">${App.escapeHtml(g.name)}</span>`).join('')}
          ${track.grades.length > SHOWN ? `<span class="chip chip-accent">+${track.grades.length - SHOWN} more</span>` : ''}
        </div>
      </div>
    </div>`).join('');
});
