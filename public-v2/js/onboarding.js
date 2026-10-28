/* Subject picker. Multiple subjects at multiple levels in one pass, then straight
 * into the first placement quiz.
 *
 * Every subject also offers the other way in: a learner who does not know which
 * grade to pick can take the subject placement, and the percentages it produces
 * are shown beside each grade here afterwards — which is the whole point of it.
 * Picking a grade yourself always stays available; the percentages are a
 * suggestion, and the learner who wants to ignore them can.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'subjects');

  const [{ tracks }, { enrollments }, { placement }] = await Promise.all([
    App.api.get('/api/catalog'),
    App.api.get('/api/enrollments'),
    App.api.get('/api/subject-placement/percent/mine').catch(() => ({ placement: {} })),
  ]);
  const percentFor = placement || {};

  const enrolled = new Set(enrollments.map((e) => `${e.track.id}:${e.grade.id}`));
  const selected = new Map(); // "track:grade" -> { track_id, grade_id, name, placement }

  if (enrollments.length) {
    const box = document.getElementById('already');
    box.classList.remove('hidden');
    box.innerHTML = `You are already enrolled in
      ${enrollments.map((e) => `<strong>${App.escapeHtml(e.track.name)}, ${App.escapeHtml(App.gradeLabel(e.grade.name))}</strong>`).join(', ')}.
      Add more below, or <a href="/dashboard">go to your dashboard</a>.`;
  }

  function percentOf(trackId, gradeId) {
    const row = percentFor[trackId];
    if (!row || !Array.isArray(row.percent)) return null;
    const hit = row.percent.find((p) => p.grade_id === gradeId);
    return hit ? hit.percent : null;
  }

  const host = document.getElementById('tracks');
  host.innerHTML = tracks.map((track) => {
    const rec = percentFor[track.id];
    const recName = rec ? (track.grades.find((g) => g.id === rec.recommended_grade_id) || {}).name : null;
    return `
    <div class="track-card">
      <div class="track-head">
        ${App.symbol(track)}
        <div>
          <div style="font-weight:700">${App.escapeHtml(track.name)}</div>
          <div class="tiny muted">${App.escapeHtml(track.blurb)}</div>
        </div>
      </div>

      <div class="not-sure">
        <div>
          <div class="small" style="font-weight:600">Not sure which grade to start at?</div>
          <div class="tiny muted">${rec
            ? `We suggested <strong>${App.escapeHtml(recName || '')}</strong> from your last quiz. Take it again to change it.`
            : `Answer ${track.grades.length} grades' worth of questions, seven each, and we will tell you what percentage of each grade fits you.`}</div>
        </div>
        <a class="btn btn-sm" href="/subject-placement?track=${encodeURIComponent(track.id)}${rec ? '&again=1' : ''}">${rec ? 'Take it again' : 'Find my grade'}</a>
      </div>

      <div class="grade-list">
        ${track.grades.map((grade) => {
          const key = `${track.id}:${grade.id}`;
          const done = enrolled.has(key);
          const pct = percentOf(track.id, grade.id);
          const pick = rec && rec.recommended_grade_id === grade.id;
          return `
            <label class="grade-option${done ? ' selected' : ''}${pick ? ' recommended' : ''}" data-key="${key}">
              <input type="checkbox" data-track="${track.id}" data-grade="${grade.id}"
                     data-name="${App.escapeHtml(`${track.name}, ${App.gradeLabel(grade.name)}`)}"
                     data-placement="${grade.placementLength}"
                     ${done ? 'checked disabled' : ''}>
              <span>
                <span class="name">${App.escapeHtml(grade.name)}</span>
                ${pick ? '<span class="chip chip-accent" style="margin-left:6px">we suggest this</span>' : ''}
                ${pct !== null ? `<span class="chip${pct >= 40 ? ' chip-accent' : ''}" style="margin-left:6px" title="How strongly this grade fits what you showed in the placement quiz">${pct}% fit</span>` : ''}
                <span class="chip" style="margin-left:6px">${done ? 'enrolled' : `${grade.placementLength} placement questions`}</span>
                <span class="tiny muted" style="display:block">${App.escapeHtml(grade.blurb)}</span>
              </span>
            </label>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const summary = document.getElementById('summary');
  const detail = document.getElementById('summary-detail');
  const startBtn = document.getElementById('start');

  function refresh() {
    const list = [...selected.values()];
    startBtn.disabled = list.length === 0;
    if (!list.length) {
      summary.textContent = 'Nothing selected yet';
      detail.textContent = 'Choose at least one subject and level.';
      return;
    }
    const questions = list.reduce((sum, s) => sum + s.placement, 0);
    summary.textContent = `${list.length} subject${list.length === 1 ? '' : 's'} selected`;
    detail.textContent = `${list.map((s) => s.name).join('; ')}. ${questions} placement questions in total, about ${Math.max(5, Math.round(questions * 0.5))} minutes.`;
  }

  host.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.disabled) return;
    const key = `${input.dataset.track}:${input.dataset.grade}`;
    const label = input.closest('.grade-option');
    if (input.checked) {
      selected.set(key, {
        track_id: input.dataset.track,
        grade_id: input.dataset.grade,
        name: input.dataset.name,
        placement: Number(input.dataset.placement),
      });
      label.classList.add('selected');
    } else {
      selected.delete(key);
      label.classList.remove('selected');
    }
    refresh();
  });

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
      const body = { selections: [...selected.values()].map(({ track_id, grade_id }) => ({ track_id, grade_id })) };
      const { created } = await App.api.post('/api/enrollments', body);
      const first = created[0];
      window.location.href = first ? `/placement?enrollment=${first.id}` : '/dashboard';
    } catch (err) {
      App.toast(err.message, 'error');
      startBtn.disabled = false;
    }
  });

  // A grade chosen on the placement result screen arrives here pre-ticked, so
  // "Choose this grade" is one click and not a hunt through the list.
  const wantedTrack = App.query('track');
  const wantedGrade = App.query('grade');
  if (wantedTrack && wantedGrade) {
    const input = host.querySelector(`input[data-track="${wantedTrack}"][data-grade="${wantedGrade}"]`);
    if (input && !input.disabled) {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.closest('.track-card').scrollIntoView({ block: 'center' });
    }
  }

  refresh();
});
