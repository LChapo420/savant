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

  // The age question for an account from before it existed, and the parent's
  // email for a child account that has none on file. Nothing else on this page
  // loads until both are settled (routes/consent.js decides; this only asks).
  if (await ageStep(user)) return;

  const [{ tracks }, { enrollments }, { placement }] = await Promise.all([
    App.api.get('/api/catalog?view=grades'),
    App.api.get('/api/enrollments'),
    App.api.get('/api/subject-placement/percent/mine').catch(() => ({ placement: {} })),
  ]);
  const percentFor = placement || {};

  // A new account arrives here from the sign-up steps; the quiz and survey leave
  // the length of that chain in sessionStorage so this screen can say where it is.
  const flowTotal = ObSteps.total();
  if (flowTotal >= 3 && !enrollments.length) {
    const step = flowTotal - 1;
    document.body.classList.add('ob-focus');
    const bar = document.getElementById('ob-progress');
    bar.innerHTML = ObSteps.html(step, flowTotal);
    bar.setAttribute('aria-valuenow', String(step));
    bar.setAttribute('aria-valuemax', String(flowTotal));
    bar.setAttribute('aria-label', `Step ${step} of ${flowTotal}`);
    bar.classList.remove('hidden');
    document.getElementById('ob-step').textContent = `Step ${step} of ${flowTotal}`;
    document.getElementById('ob-step').classList.remove('hidden');
  }

  const enrolled = new Set(enrollments.map((e) => `${e.track.id}:${e.grade.id}`));
  const selected = new Map(); // "track:grade" -> { track_id, grade_id, name, placement }

  if (enrollments.length) {
    const box = document.getElementById('already');
    box.classList.remove('hidden');
    // Past three grades the list became a paragraph of names; each one is already
    // ticked and marked "enrolled" below, so give the count instead.
    box.innerHTML = enrollments.length <= 3
      ? `You are already enrolled in
      ${enrollments.map((e) => `<strong>${App.escapeHtml(e.track.name)}, ${App.escapeHtml(App.gradeLabel(e.grade.name))}</strong>`).join(', ')}.
      Add more below, or <a href="/dashboard">go to your dashboard</a>.`
      : `You are already enrolled in <strong>${enrollments.length} grades</strong>; they are ticked below.
      Add more, or <a href="/dashboard">go to your dashboard</a>.`;
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
    <div class="track-card" data-subject="${App.escapeHtml(track.id)}">
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
            ? `We suggested <strong>${App.escapeHtml(App.gradeLabel(recName || ''))}</strong> from your last quiz. Take it again to change it.`
            : `Answer a short adaptive quiz (about 20 to 90 minutes, your choice) and we will tell you which of the ${track.grades.length} grades fits you.`}</div>
        </div>
        <a class="btn btn-sm" href="/subject-placement?track=${encodeURIComponent(track.id)}${rec ? '&again=1' : ''}">${rec ? 'Take it again' : 'Find my grade'}</a>
      </div>

      <details class="grade-pick"${rec || track.grades.some((g) => enrolled.has(`${track.id}:${g.id}`)) ? ' open' : ''}>
      <summary><span>Pick a grade yourself</span><span class="tiny muted" data-picked>${track.grades.length} grades</span></summary>
      <div class="grade-list">
        ${track.grades.map((grade) => {
          const key = `${track.id}:${grade.id}`;
          const done = enrolled.has(key);
          const pct = percentOf(track.id, grade.id);
          const pick = rec && rec.recommended_grade_id === grade.id;
          return `
            <label class="grade-option option-card${done ? ' selected' : ''}${pick ? ' recommended' : ''}" data-key="${key}">
              <input type="checkbox" data-track="${track.id}" data-grade="${grade.id}"
                     data-name="${App.escapeHtml(`${track.name}, ${App.gradeLabel(grade.name)}`)}"
                     data-placement="${grade.placementLength}"
                     ${done ? 'checked disabled' : ''}>
              <span class="opt-body">
                <span class="opt-title name">${App.escapeHtml(App.gradeLabel(grade.name))}</span>
                <span class="opt-sub">
                  ${pick ? '<span class="chip chip-accent">we suggest this</span> ' : ''}${pct !== null ? `<span class="chip${pct >= 40 ? ' chip-accent' : ''}" title="How strongly this grade fits what you showed in the placement quiz">${pct}% fit</span> ` : ''}<span class="chip">${done ? 'enrolled' : `${grade.placementLength} placement questions`}</span>
                </span>
                <span class="opt-sub">${App.escapeHtml(grade.blurb)}</span>
              </span>
              <span class="opt-radio" aria-hidden="true"></span>
            </label>`;
        }).join('')}
      </div>
      </details>
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
    // A folded list still says what was ticked in it.
    const pick = input.closest('.grade-pick');
    const ticked = pick.querySelectorAll('input:checked:not(:disabled)').length;
    pick.querySelector('[data-picked]').textContent = ticked
      ? `${ticked} selected`
      : `${pick.querySelectorAll('input').length} grades`;
    refresh();
  });

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
      ObSteps.clear();
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
      input.closest('.grade-pick').open = true;
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.closest('.track-card').scrollIntoView({ block: 'center' });
    }
  }

  // A landing page (/act) sends a learner here with only the subject: bring that
  // subject's card into view and put the cursor on its "Find my grade" button.
  if (wantedTrack && !wantedGrade) {
    const card = [...host.querySelectorAll('.track-card')].find((c) => c.querySelector(`a[href^="/subject-placement?track=${CSS.escape(wantedTrack)}"]`));
    if (card) {
      card.classList.add('wanted');
      card.scrollIntoView({ block: 'start' });
      const go = card.querySelector('.not-sure a');
      if (go) go.focus({ preventScroll: true });
    }
  }

  refresh();
});

/**
 * Show the one-time age question, or the parent-email step, when the account
 * needs it. Resolves true when it took over the page.
 */
async function ageStep(user) {
  const consent = user.consent || {};
  const needsParentEmail = consent.state === 'pending' && !consent.has_request;
  if (!user.age_needed && !needsParentEmail) return false;

  const box = document.getElementById('age-step');
  const ask = document.getElementById('age-ask');
  const parent = document.getElementById('age-parent');
  const errorBox = document.getElementById('age-error');
  document.getElementById('subjects-step').classList.add('hidden');
  box.classList.remove('hidden');
  const fail = (message, button, focus) => {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    if (button) button.disabled = false;
    if (focus) focus.focus();
  };
  const showParent = () => {
    ask.classList.add('hidden');
    parent.classList.remove('hidden');
    errorBox.classList.add('hidden');
    document.getElementById('age-title').textContent = 'Ask a parent or guardian';
    document.getElementById('parent_email').focus();
  };

  const selects = {
    month: document.getElementById('birth_month'),
    year: document.getElementById('birth_year'),
    country: document.getElementById('country'),
  };
  const { pendingDays } = await AgeScreen.fill(selects);
  document.getElementById('age-days').textContent = String(pendingDays || 14);
  if (!user.age_needed) showParent();

  const ageSubmit = document.getElementById('age-submit');
  document.getElementById('age-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    const read = AgeScreen.read(selects);
    if (read.error) return fail(read.error, null, read.focus);
    ageSubmit.disabled = true;
    try {
      const { route } = await AgeScreen.submit(read.body);
      if (route === 'parent') showParent();
      else window.location.reload();
    } catch (err) {
      fail(err.message, ageSubmit);
    }
  });

  const parentSubmit = document.getElementById('parent-submit');
  document.getElementById('parent-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    parentSubmit.disabled = true;
    try {
      await App.api.post('/api/consent/child/request', { parent_email: document.getElementById('parent_email').value.trim() });
      window.location.href = '/parent-needed?sent=1';
    } catch (err) {
      fail(err.message, parentSubmit);
    }
  });
  return true;
}
