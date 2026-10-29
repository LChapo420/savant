/* The study participant's pre/post test (services/spanish-study-tests.js, spanish-study-tests/).
 * Same flow and integrity rules as the founder's daily check, drawn here from its own sealed copy.
 * The server serves one item at a time and owns the clock; this file draws what it sends, counts down the
 * time the server says is left, and reports tab switches. It never receives an answer key and never shows
 * whether an answer was right or what the score is: results are reported only as study averages. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');

  const root = document.getElementById('root');
  const API = '/api/spanish-study-test';
  const esc = App.escapeHtml;

  async function call(method, path, body) {
    try {
      return await App.api.request(method, API + path, body);
    } catch (err) {
      if (err.status === 404 && path === '/status') {
        root.innerHTML = '<h1>This page is for study participants</h1><p class="muted">Join first on <a href="/spanish-study">the study page</a>.</p>';
        throw Object.assign(err, { handled: true });
      }
      throw err;
    }
  }

  async function home() {
    let status;
    try { status = await call('GET', '/status'); } catch (err) { if (err.handled) return; throw err; }
    window.scrollTo(0, 0);
    const back = '<p><a href="/spanish-study">Back to the study page</a></p>';
    let block;
    if (status.state === 'open') {
      block = `<div class="card"><h2 style="margin-top:0">Your test is in progress</h2>
        <p class="muted">${status.answered} of ${status.items} items answered. The clock on the open item kept running while you were away.</p>
        <button class="btn btn-primary" id="resume">Continue the test</button>
        <button class="btn btn-ghost" id="abandon">Abandon this sitting</button></div>`;
    } else if (!status.phase) {
      block = `<div class="card"><h2 style="margin-top:0">Not now</h2><p class="muted" style="margin-bottom:0">${esc(status.why || (status.blocked && status.blocked.message) || '')}</p></div>`;
    } else if (status.state === 'wait') {
      block = `<div class="card"><h2 style="margin-top:0">Not yet</h2><p class="muted" style="margin-bottom:0">${esc((status.blocked && status.blocked.message) || '')}</p></div>`;
    } else {
      block = `<div class="card"><h2 style="margin-top:0">${status.phase === 'pre' ? 'Pre-test' : 'Post-test'}</h2>${rules(status)}
        <button class="btn btn-primary" id="start">Start the test</button></div>`;
    }
    root.innerHTML = `<h1>Spanish study test</h1>
      ${status.seal_ok ? '' : '<div class="notice notice-error"><strong>The test files do not match their seal.</strong> No test can start until that is fixed.</div>'}
      ${block}${back}
      <p class="tiny muted">Sentences and audio: Tatoeba (tatoeba.org), sentences CC BY 2.0 FR, audio by the named contributors under the licence shown beside each clip. Used for non-commercial testing.</p>`;
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    on('start', () => begin());
    on('resume', () => runSitting());
    on('abandon', async () => {
      if (!window.confirm('Abandon this sitting? It is voided and logged, and its questions are never reused.')) return;
      await call('POST', '/abandon', { reason: 'abandoned from the start screen' });
      home();
    });
  }

  function rules(status) {
    const L = status.limits;
    return `<p>About 15 minutes, at most 17.5. Do it in one go, somewhere quiet.</p>
      <ul class="small" style="padding-left:18px">
        <li>10 listening items: play the clip (up to 3 replays) and type what you hear. ${L.listening_s} seconds each.</li>
        <li>15 reading items: pick the English meaning. ${L.reading_s} seconds each.</li>
        <li>The clock is on the server. It keeps running if you reload the page; a late answer scores 0.</li>
        <li>No translator, no notes, no help. You will not be told whether an answer was right.</li>
        <li>Switching tabs or apps is logged and shown in the report.</li>
        <li>Only one result per test is kept: a repeat never replaces the first.</li>
      </ul>`;
  }

  async function begin() {
    const btn = document.getElementById('start');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching public randomness…'; }
    try {
      await call('POST', '/start', {});
      await runSitting();
    } catch (err) {
      App.toast(err.message, 'error');
      home();
    }
  }

  // ---- the sitting -----------------------------------------------------------------------------

  let watching = false;
  function watchVisibility() {
    if (watching) return;
    watching = true;
    const send = (state) => {
      try {
        fetch(`${API}/visibility`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true,
          body: JSON.stringify({ state, client_t: Date.now() }),
        }).catch(() => {});
      } catch { /* the server notices a missing event as nothing, which is honest */ }
    };
    document.addEventListener('visibilitychange', () => send(document.visibilityState === 'hidden' ? 'hidden' : 'visible'));
    window.addEventListener('blur', () => send('blur'));
    window.addEventListener('focus', () => send('focus'));
  }

  async function runSitting() {
    watchVisibility();
    for (;;) {
      let item;
      try { item = await call('GET', '/next'); } catch (err) { App.toast(err.message, 'error'); return home(); }
      if (item.done) break;
      const r = await showItem(item);
      if (r && r.done) break;
    }
    finishScreen();
  }

  function showItem(item) {
    return new Promise((resolve) => {
      window.scrollTo(0, 0);
      const t0 = performance.now();
      const deadline = t0 + item.remaining_ms;
      let submitting = false; let plays = 0; let pastes = 0; let choice = null;
      const isL = item.section === 'listening';
      const secIndex = isL ? item.n + 1 : item.n - 9;
      const secTotal = isL ? 10 : 15;

      root.innerHTML = `
        <div class="row-between" style="margin-bottom:6px">
          <span class="small muted">${isL ? 'Listening' : 'Reading'} ${secIndex} of ${secTotal} · item ${item.n + 1} of ${item.total}</span>
          <span class="small" id="clock" style="font-variant-numeric:tabular-nums;font-weight:700" role="timer" aria-live="off"></span>
        </div>
        <div class="meter meter-lg" aria-hidden="true"><span id="tbar" style="width:100%"></span></div>
        <div class="card" style="margin-top:14px">
          ${isL ? `
            <p class="muted" style="margin-top:0">Listen, then type what you hear in Spanish. Accents and punctuation do not matter.</p>
            <audio id="aud" preload="auto" src="${API}/audio/${item.n}"></audio>
            <button class="btn btn-primary" id="play" type="button">Play</button>
            <span class="small muted" id="playinfo" style="margin-left:8px"></span>
            <label class="field" style="margin-top:16px"><span>What you hear</span>
              <textarea id="ans" rows="3" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" lang="es"></textarea></label>
            <button class="btn btn-primary" id="submit" type="button">Next</button>
            <p class="tiny muted" style="margin-bottom:0">Audio: ${esc(item.audio.user)}, ${esc(item.audio.license)}, <a href="${esc(item.audio.attribution_url)}" target="_blank" rel="noopener noreferrer">Tatoeba</a>. Pasting is switched off.</p>
          ` : `
            <p class="muted" style="margin-top:0">What does this mean in English?</p>
            <p style="font-size:1.35rem;font-weight:700;margin:6px 0 16px" lang="es">${esc(item.stem)}</p>
            <div id="opts" role="group" aria-label="Answers" style="display:grid;gap:10px">
              ${item.options.map((o, i) => `<button class="btn" type="button" data-i="${i}" aria-pressed="false" style="justify-content:flex-start;text-align:left;white-space:normal;min-height:48px">${esc(o)}</button>`).join('')}
            </div>
            <div style="margin-top:16px"><button class="btn btn-primary" id="submit" type="button" disabled>Next</button></div>
          `}
        </div>`;

      const clock = document.getElementById('clock');
      const tbar = document.getElementById('tbar');
      const submitBtn = document.getElementById('submit');
      const ans = document.getElementById('ans');
      const total = item.limit_s * 1000;

      async function send(timedOut) {
        if (submitting) return;
        submitting = true; clearInterval(timer);
        submitBtn.disabled = true;
        const aud = document.getElementById('aud'); if (aud) aud.pause();
        const body = {
          n: item.n, client_ms: Math.round(performance.now() - t0), timed_out: !!timedOut,
          replays: Math.max(0, plays - 1), pastes,
        };
        if (isL) body.answer = ans.value; else body.choice = choice;
        let resp = null;
        try { resp = await App.api.post(`${API}/answer`, body); } catch (err) { /* 409: already recorded; the next call sorts it out */ }
        resolve(resp);
      }

      function tick() {
        const left = Math.max(0, deadline - performance.now());
        const s = Math.ceil(left / 1000);
        clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        tbar.style.width = `${(left / total) * 100}%`;
        tbar.parentElement.classList.toggle('is-low', left <= 10000);
        clock.style.color = left <= 10000 ? 'var(--warn)' : '';
        if (left <= 0) send(true);
      }
      const timer = setInterval(tick, 200);
      tick();

      submitBtn.addEventListener('click', () => send(false));
      if (isL) {
        const aud = document.getElementById('aud');
        const play = document.getElementById('play');
        const info = document.getElementById('playinfo');
        const MAX = item.max_plays;
        const label = () => { play.textContent = plays === 0 ? 'Play' : 'Replay'; info.textContent = `${MAX - plays} play${MAX - plays === 1 ? '' : 's'} left`; play.disabled = plays >= MAX; };
        label();
        play.addEventListener('click', () => {
          if (plays >= MAX) return;
          plays += 1; aud.currentTime = 0; play.disabled = true; info.textContent = `playing… ${MAX - plays} play${MAX - plays === 1 ? '' : 's'} left after this`; aud.play().catch(() => { info.textContent = 'The audio did not play. Tap again.'; plays -= 1; play.disabled = false; });
        });
        aud.addEventListener('ended', label);
        aud.addEventListener('error', () => { info.textContent = 'The audio did not load. Reload the page; the clock keeps running.'; });
        ans.addEventListener('paste', (e) => { e.preventDefault(); pastes += 1; });
        ans.addEventListener('drop', (e) => { e.preventDefault(); pastes += 1; });
        ans.focus();
      } else {
        const opts = document.getElementById('opts');
        opts.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-i]');
          if (!b) return;
          choice = Number(b.dataset.i);
          opts.querySelectorAll('button').forEach((x) => { const on = x === b; x.setAttribute('aria-pressed', String(on)); x.classList.toggle('btn-primary', on); });
          submitBtn.disabled = false;
        });
      }
    });
  }

  function finishScreen() {
    window.scrollTo(0, 0);
    root.innerHTML = `<h1>Done</h1>
      <p>Thank you. You are not shown a score: your result counts toward the study average, which is reported once everyone has finished.</p>
      <p><a class="btn btn-primary" href="/spanish-study">Back to the study page</a></p>`;
  }

  await home();
});
