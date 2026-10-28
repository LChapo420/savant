/* The about-you survey: five text boxes, all optional.
 *
 * One page with two jobs, which is why it reads its fields from the server rather
 * than declaring them here. At signup it is the second step, after the style
 * questionnaire, and it exists so the tutor starts with something about the person
 * rather than only measurements of them. Later it is what the profile links to when
 * a learner wants to change their answers.
 *
 * Everything else in this app infers — from answers, timings, hints. This asks, and
 * the only thing a person can supply is the thing nothing else can reach: what they
 * actually care about, which is what makes an example land instead of being
 * skipped.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');

  const root = document.getElementById('root');

  // The answers and the questions come from the same request. The field list is the
  // server's, so a field added there appears here with its label, hint and cap
  // already applied — and there is no second copy of the questions to drift.
  let data;
  try {
    data = await App.api.get('/api/profile');
  } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
    return;
  }

  const fields = data.survey_fields || {};
  const answers = data.survey || {};

  // Where to go when this is done. `?next=` is how the signup flow chains into the
  // subject picker; without one the learner came here from their profile and should
  // go back to it.
  const rawNext = App.query('next');
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/profile';
  const fromSignup = !!rawNext;

  root.innerHTML = `
    <h1>${fromSignup ? 'A bit about you' : 'About you'}</h1>
    <p class="muted">
      ${fromSignup
    ? 'Two minutes, and all of it is optional. This is what your lessons are '
      + 'written around — the tutor already knows how you answer questions, and '
      + 'this is the part it cannot work out on its own.'
    : 'What your lessons are written around. Change anything, or leave it as it is — '
      + 'none of it is required.'}
    </p>

    <div class="card">
      ${Object.entries(fields).map(([key, spec]) => `
        <label class="field">
          <span>${App.escapeHtml(spec.label)}</span>
          <span class="tiny muted" style="display:block; font-weight:400; margin-bottom:6px">
            ${App.escapeHtml(spec.hint || '')}
          </span>
          <textarea data-field="${App.escapeHtml(key)}" rows="3"
            maxlength="${Number(spec.max) || 2000}"
            placeholder="${App.escapeHtml(spec.placeholder || '')}">${App.escapeHtml(answers[key] || '')}</textarea>
        </label>`).join('')}
    </div>

    <div class="card" style="position:sticky; bottom:16px; margin-top:18px">
      <div class="row-between row-wrap">
        <span class="small muted" id="status">
          ${fromSignup ? 'Answer any of them, or none.' : ''}
        </span>
        <div class="row">
          ${fromSignup ? `<a class="btn btn-ghost" href="${next}">Skip</a>` : ''}
          <button class="btn btn-primary" id="save">${fromSignup ? 'Save and continue' : 'Save'}</button>
        </div>
      </div>
    </div>`;

  const save = document.getElementById('save');
  const status = document.getElementById('status');

  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = 'Saving…';

    const body = {};
    for (const box of root.querySelectorAll('textarea[data-field]')) {
      body[box.dataset.field] = box.value;
    }

    try {
      const saved = await App.api.post('/api/profile/survey', body);
      if (saved.answered) App.toast('Saved.');
      window.location.href = next;
    } catch (err) {
      status.textContent = '';
      App.toast(err.message, 'error');
      save.disabled = false;
    }
  });
});
