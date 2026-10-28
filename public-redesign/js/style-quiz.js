/* The learning-style questionnaire: twenty forced choices between two concrete
 * behaviors. People are better at recognizing what they do than at rating what
 * they are, which is why there are no 1-to-5 self-ratings here. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');

  const root = document.getElementById('root');
  const { questions, scale } = await App.api.get('/api/style-quiz');
  const answers = {};
  const next = App.query('next');
  const nextHref = next && next.startsWith('/') ? next : '/dashboard';

  root.innerHTML = `
    <h1>How do you learn?</h1>
    <p class="muted">
      Twenty choices, about two minutes. There are no right answers: this only sets how
      your sessions are built. What you actually do in sessions carries more weight over
      time, so a rough answer here is fine.
    </p>
    <div class="player-bar" style="margin: 18px 0">
      <div class="meter meter-lg"><span id="bar" style="width:0%"></span></div>
      <span class="small muted" id="count">0 of ${questions.length}</span>
    </div>
    <div id="items"></div>
    <div class="card" style="position:sticky; bottom:16px; margin-top:18px">
      <div class="row-between">
        <span class="small muted" id="status">Answer what you can — unanswered questions are simply left out.</span>
        <div class="row">
          <a class="btn btn-ghost" href="${nextHref}">Skip</a>
          <button class="btn btn-primary" id="submit" disabled>Save profile</button>
        </div>
      </div>
    </div>`;

  const itemsHost = document.getElementById('items');
  itemsHost.innerHTML = questions.map((q) => `
    <div class="sq-item" data-id="${q.id}">
      <div class="sq-prompt">${App.escapeHtml(q.prompt)}</div>
      <div class="sq-ends">
        <span>${App.escapeHtml(q.low)}</span>
        <span style="text-align:right">${App.escapeHtml(q.high)}</span>
      </div>
      <div class="sq-scale">
        ${scale.map((s) => `<button class="sq-opt" type="button" data-value="${s.value}">${App.escapeHtml(s.label)}</button>`).join('')}
      </div>
    </div>`).join('');

  const bar = document.getElementById('bar');
  const count = document.getElementById('count');
  const submit = document.getElementById('submit');

  itemsHost.addEventListener('click', (event) => {
    const btn = event.target.closest('.sq-opt');
    if (!btn) return;
    const item = btn.closest('.sq-item');
    [...item.querySelectorAll('.sq-opt')].forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    answers[item.dataset.id] = Number(btn.dataset.value);

    const done = Object.keys(answers).length;
    bar.style.width = `${(done / questions.length) * 100}%`;
    count.textContent = `${done} of ${questions.length}`;
    submit.disabled = done === 0;

    // Move the next unanswered question into view so the list keeps flowing.
    const following = item.nextElementSibling;
    if (following && !answers[following.dataset.id]) {
      following.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  submit.addEventListener('click', async () => {
    submit.disabled = true;
    try {
      const result = await App.api.post('/api/profile/style-quiz', { answers });
      const applied = result.applied;
      root.innerHTML = `
        <div class="card">
          <h1>${window.icon('check-circle')} Profile saved</h1>
          <p class="muted">Here is what changes in your sessions from now on.</p>
          <table class="data"><tbody>
            <tr><td>Session length</td><td>${applied.itemCount} questions</td></tr>
            <tr><td>Share above your level</td><td>${App.pct(applied.stretchShare)}</td></tr>
            <tr><td>Answer format</td><td>${applied.preferTypeIn ? 'type-in preferred over multiple choice' : 'mixed, multiple choice included'}</td></tr>
            <tr><td>Feedback</td><td>${applied.immediateFeedback ? 'after each question' : 'held until the end of the session'}</td></tr>
            <tr><td>Explanations</td><td>${App.escapeHtml(applied.explanationDepth)}</td></tr>
            <tr><td>After a wrong answer</td><td>${applied.nameTheError ? 'name the specific mistake' : 'reteach the method'}</td></tr>
          </tbody></table>
          <p class="small muted" style="margin-top:14px">
            These are a starting point. What you actually do in sessions gradually outweighs
            the questionnaire, which is what the profile page shows as observed behavior.
          </p>
          <a class="btn btn-primary" href="${nextHref}">Continue</a>
        </div>`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      App.toast(err.message, 'error');
      submit.disabled = false;
    }
  });
});
