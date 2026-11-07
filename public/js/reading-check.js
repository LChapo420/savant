/* The reading check: ten to twelve questions, each picked from the answers so far, that measure how wordy a lesson can be for
 * this learner (services/reading-check.js). It is optional, quiet while it runs (no right or wrong shown), and reuses the
 * placement quiz's shell and the shared question player. `?next=` says where Continue and Not now go. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const host = document.getElementById('player');
  const next = App.query('next');
  const nextHref = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const status = await App.api.get('/api/reading-check');

  if (!status.enabled) {
    host.innerHTML = `<div class="card"><h1>The reading check is not available</h1><a class="btn btn-primary" href="${App.escapeHtml(nextHref)}">Continue</a></div>`;
    return;
  }

  const kind = status.offer === 'periodic' ? 'periodic' : 'onboarding';
  let sessionId = null;
  let startedAt = Date.now();
  let maxItems = 12;
  let current = null;

  function intro() {
    host.innerHTML = `
      <div class="card rc-intro">
        <p class="lesson-meta">Optional · about 4 minutes</p>
        <h1>A short reading check</h1>
        <p class="lede">Ten to twelve questions about words and short passages. It shows us how much reading and which
          words suit you, so your lessons are written at the right level. It is not a grade: nothing is marked wrong
          in front of you, and you can stop at any time.</p>
        <ul class="small rc-points">
          <li>Each question is picked from your answers so far, so it gets harder or easier as you go.</li>
          <li>If you do not know, choose “I don’t know”. A guess is fine too.</li>
          <li>You can do it again later; we only ask now and then.</li>
        </ul>
        <div class="row-wrap rc-actions">
          <button class="btn btn-primary btn-lg" id="rc-start" type="button">Start the check</button>
          <button class="btn btn-ghost" id="rc-skip" type="button">Not now</button>
        </div>
      </div>`;
    document.getElementById('rc-start').addEventListener('click', begin);
    document.getElementById('rc-skip').addEventListener('click', async () => {
      try { await App.api.post('/api/reading-check/decline', { kind }); } catch { /* the offer simply comes back */ }
      window.location.href = nextHref;
    });
  }

  async function begin() {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Choosing the first question</div>';
    let reply;
    try {
      reply = await App.api.post('/api/reading-check/start', { kind });
    } catch (err) {
      host.innerHTML = `<div class="notice notice-error" role="alert">${App.escapeHtml(err.message)} <a href="${App.escapeHtml(nextHref)}">Continue</a></div>`;
      return;
    }
    sessionId = reply.session_id || sessionId;
    handle(reply);
  }

  function shell() {
    host.setAttribute('data-subject', 'english');
    host.innerHTML = `
      <div class="player-head">
        <a class="icon-btn player-close" href="${App.escapeHtml(nextHref)}" title="Leave the reading check" aria-label="Leave the reading check; you can take it later">${window.icon('x')}</a>
        <div class="player-titles">
          <h1 class="player-title">Reading check</h1>
          <div class="player-sub">Words and short passages</div>
        </div>
        <div class="player-chips"><span class="chip counter" id="counter" aria-live="polite"></span></div>
        <div class="player-meter"><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${maxItems}" aria-label="Reading check progress"><span id="bar" style="width:0%"></span></div></div>
      </div>
      <div class="card" id="item"></div>
      <div class="row player-foot">
        <span class="small muted">Each question is picked from your answers so far. No feedback until the end.</span>
        <button class="btn btn-ghost btn-sm" id="rc-dont" type="button">I don’t know</button>
      </div>`;
  }

  function show(reply) {
    if (!document.getElementById('item')) shell();
    current = reply.item;
    maxItems = reply.max || maxItems;
    document.getElementById('counter').textContent = `Question ${reply.position}`;
    const bar = document.getElementById('bar');
    bar.style.width = `${Math.min(100, ((reply.position - 1) / maxItems) * 100)}%`;
    bar.parentElement.setAttribute('aria-valuenow', String(reply.position - 1));
    startedAt = Date.now();
    const dont = document.getElementById('rc-dont');
    dont.disabled = false;
    window.Player.render(document.getElementById('item'), { id: current.id, format: 'multiple_choice', passage: current.passage, prompt: current.prompt, choices: current.choices },
      { coach: false, check: 'Next', onSubmit: (text) => submit(current.choices.indexOf(text)) });
    dont.onclick = () => submit(null);
    // The question player moves focus to the prompt; the passage above it must still start on screen.
    window.scrollTo(0, 0);
  }

  async function submit(choice) {
    const item = current;
    const dont = document.getElementById('rc-dont');
    if (dont) dont.disabled = true;
    let reply;
    try {
      reply = await App.api.post('/api/reading-check/answer', { session_id: sessionId, item_id: item.id, choice, ms: Date.now() - startedAt });
    } catch (err) {
      window.Player.unlock(document.getElementById('item'));
      App.toast(err.message, 'error');
      if (dont) dont.disabled = false;
      return;
    }
    handle(reply);
  }

  function handle(reply) {
    if (reply.done) result(reply.result);
    else show(reply);
  }

  function result(r) {
    const level = Number(r.grade);
    const gradeText = level >= 12.5 ? 'above grade 12' : level < 1.5 ? 'about grade 1' : `about grade ${Math.round(level * 2) / 2}`;
    host.innerHTML = `
      <div class="card result rc-result">
        <p class="lesson-meta">Reading check · ${r.asked} questions</p>
        <h1 id="rc-title" tabindex="-1">You read ${gradeText}.</h1>
        <p class="lede">That is ${App.escapeHtml(r.band)}. ${r.fed
    ? 'Your lessons will now use words and sentences that fit this level.'
    : 'You answered some questions very quickly, so we did not use this one to change your lessons. You can take it again later.'}</p>
        <p class="small muted">This is a rough measure from a short check, not a grade. Your lessons keep adjusting to how you actually do.</p>
        <div class="result-actions"><a class="btn btn-primary btn-lg" href="${App.escapeHtml(nextHref)}">Continue</a></div>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('rc-title').focus();
  }

  // An open check is picked up where it was left; otherwise the intro.
  if (status.open) begin(); else intro();
});
