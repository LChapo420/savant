/* The daily Spanish listening test (account-gated; spanish-check-lc/PROTOCOL.md).
 * The learner hears a native recording and picks its English meaning. No Spanish text is ever shown.
 * The server serves one item at a time, owns the clock and keeps the log. This file only draws what the
 * server sends, counts down the time the server says is left, and reports tab switches. It never
 * receives an answer key, and it does not show whether an answer was right. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const root = document.getElementById('root');
  const API = '/api/spanish-check-lc';
  const FORCE = App.query('force') === '1';
  const esc = App.escapeHtml;
  const sgn = (x) => (x < 0 ? '−' : '');
  const pct = (x) => `${sgn(x)}${Math.abs(Math.round(x * 100))}%`;
  const pts = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}`;
  const ciText = (ci) => `${pct(ci[0])} to ${pct(ci[1])}`;
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const STATEMENT = 'n=1, independent public sentence pool (Tatoeba), not an official level.';
  const LETTERS = ['A', 'B', 'C', 'D'];

  function unavailable() {
    root.innerHTML = '<h1>This page isn\'t available</h1><p class="muted">There is nothing here for this account.</p>';
  }

  async function call(method, path, body) {
    try {
      return await App.api.request(method, API + path, body);
    } catch (err) {
      if (err.status === 404 && path === '/status') { unavailable(); throw Object.assign(err, { handled: true }); }
      throw err;
    }
  }

  // ---- home: next sitting + progress ------------------------------------------------------------

  async function home() {
    let status; let report;
    try {
      status = await call('GET', '/status');
      report = await call('GET', '/report');
    } catch (err) { if (err.handled) return; throw err; }

    let startBlock = '';
    if (status.state === 'complete') {
      startBlock = '<div class="card"><h2 style="margin-top:0">All five sittings are done</h2><p class="muted" style="margin-bottom:0">The progress below is final. The log can be checked by anyone with <code>node spanish-check-lc/verify.js</code>.</p></div>';
    } else if (status.state === 'open') {
      startBlock = `<div class="card"><h2 style="margin-top:0">${esc(status.name)} is in progress</h2>
        <p class="muted">${status.answered} of ${status.items} clips answered. The clock on the open clip kept running while you were away.</p>
        <button class="btn btn-primary" id="resume">Continue the sitting</button>
        <button class="btn btn-ghost" id="abandon">Abandon this sitting</button></div>`;
    } else if (status.state === 'wait') {
      const b = status.blocked || {};
      const when = b.retry_after_ms ? ` Next one opens in about ${Math.ceil(b.retry_after_ms / 3600000)} hour(s).` : '';
      startBlock = `<div class="card"><h2 style="margin-top:0">${b.code === 'same_day' ? 'Done for today' : 'Not yet'}</h2>
        <p class="muted">${esc(b.message || '')}${b.code === 'same_day' ? ' The next sitting (' + esc(status.next_name || '') + ') is available tomorrow.' : when}</p>
        ${FORCE && status.can_force ? '<button class="btn" id="force">Start anyway (this is logged and shown in the report)</button>' : ''}</div>`;
    } else {
      startBlock = `<div class="card"><h2 style="margin-top:0">${esc(status.next_name || 'Next sitting')}</h2>${rules(status)}
        <button class="btn btn-primary btn-lg" id="start">Start the sitting</button></div>`;
    }

    window.scrollTo(0, 0);
    root.innerHTML = `
      <h1>Spanish listening test</h1>
      <p class="muted">${esc(STATEMENT)}</p>
      ${status.seal_ok ? '' : '<div class="notice notice-error"><strong>The test files do not match SEAL.txt.</strong> No sitting can start until that is fixed.</div>'}
      ${status.pending_anchor ? '<p class="tiny muted">The last sitting’s log entry has not been time-stamped by the outside service yet; it will retry on its own.</p>' : ''}
      ${startBlock}
      <section id="progress">${progress(report)}</section>
      <p class="tiny muted" style="margin-top:24px">Sentences and audio: Tatoeba (tatoeba.org), sentences CC BY 2.0 FR, audio by the named contributors under the licence shown beside each clip. Used for personal, non-commercial testing.</p>
      ${credits(report)}
      <p class="tiny muted">Log: ${report.chain.events} events, head <code style="word-break:break-all">${esc(report.chain.head)}</code>. Copying this line somewhere outside this computer after each sitting makes it harder to dispute later.</p>`;

    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    on('start', () => begin(false));
    on('force', () => begin(true));
    on('resume', () => runSitting());
    on('abandon', async () => {
      if (!window.confirm('Abandon this sitting? It is voided and logged, its questions are never reused, and the next sitting uses fresh ones.')) return;
      await call('POST', '/abandon', { reason: 'abandoned from the start screen' });
      home();
    });
  }

  function credits(report) {
    const c = report.audio_credits || [];
    if (!c.length) return '';
    return `<details class="tiny muted"><summary>Audio credits (${c.length} clips used so far)</summary><p style="margin:6px 0">${c.map((a) => `<a href="https://tatoeba.org/en/audio/index/${a.audio_id}" target="_blank" rel="noopener noreferrer">${esc(a.user)}</a> (${esc(a.license)})`).join(', ')}</p></details>`;
  }

  function rules(status) {
    const L = status.limits;
    return `<p>About 16 minutes at most. ${status.total - status.finished} of ${status.total} sittings left.</p>
      <ul class="small" style="padding-left:18px">
        <li>${status.n_items} short clips of native Spanish. Tap Play, listen, then pick the English meaning. No Spanish text is shown.</li>
        <li>You can play each clip ${L.max_plays} times in total. ${L.item_s} seconds per clip, replays included.</li>
        <li>Not sure? Tap <strong>I don't know</strong>. It scores 0. A wrong answer costs a third of a point, so guessing blindly does not help.</li>
        <li>The clock is on the server. It keeps running if you reload the page; a late answer scores 0.</li>
        <li>No translator, no notes, no help. You will not be told whether an answer was right.</li>
        <li>Switching tabs or apps is logged and shown in the report.</li>
        <li><strong>Please screen-record this sitting with the front camera on, and turn the sound up.</strong> Software cannot see who is holding the phone or whether a second device is nearby; a recording can.</li>
      </ul>`;
  }

  async function begin(force) {
    const btn = document.getElementById(force ? 'force' : 'start');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching public randomness…'; }
    try {
      await call('POST', '/start', force ? { force: true } : {});
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
      let submitting = false; let plays = 0; let choice = null; // choice: 0..3, 'dk' or null
      const total = item.limit_s * 1000;
      const MAX = item.max_plays;

      root.innerHTML = `
        <div class="row-between" style="margin-bottom:6px">
          <span class="small muted">Clip ${item.n + 1} of ${item.total}</span>
          <span class="small" id="clock" style="font-variant-numeric:tabular-nums;font-weight:700" role="timer" aria-live="off"></span>
        </div>
        <div class="meter meter-lg" aria-hidden="true"><span id="tbar" style="width:100%"></span></div>
        <div class="card" style="margin-top:14px">
          <p class="muted" style="margin-top:0">Listen, then choose what it means in English.</p>
          <audio id="aud" preload="auto" src="${API}/audio/${item.n}"></audio>
          <button class="btn btn-primary btn-lg" id="play" type="button" style="width:100%;min-height:72px;font-size:1.25rem">Play</button>
          <p class="small muted" id="playinfo" style="margin:6px 0 16px;text-align:center" aria-live="polite"></p>
          <div id="opts" role="group" aria-label="Answers" style="display:grid;gap:10px">
            ${item.options.map((o, i) => `<button class="btn" type="button" data-i="${i}" aria-pressed="false" style="justify-content:flex-start;text-align:left;white-space:normal;min-height:48px"><strong style="margin-right:8px">${LETTERS[i]}</strong>${esc(o)}</button>`).join('')}
            <button class="btn btn-ghost" type="button" data-i="dk" aria-pressed="false" style="min-height:48px">I don't know</button>
          </div>
          <div style="margin-top:16px"><button class="btn btn-primary" id="submit" type="button" disabled>Next</button></div>
          <p class="tiny muted" style="margin-bottom:0">Audio: ${esc(item.audio.user)}, ${esc(item.audio.license)}, <a href="${esc(item.audio.attribution_url)}" target="_blank" rel="noopener noreferrer">Tatoeba</a>.</p>
        </div>`;

      const clock = document.getElementById('clock');
      const tbar = document.getElementById('tbar');
      const submitBtn = document.getElementById('submit');
      const aud = document.getElementById('aud');
      const play = document.getElementById('play');
      const info = document.getElementById('playinfo');
      const opts = document.getElementById('opts');

      async function send(timedOut) {
        if (submitting) return;
        submitting = true; clearInterval(timer);
        submitBtn.disabled = true;
        aud.pause();
        const body = { n: item.n, client_ms: Math.round(performance.now() - t0), timed_out: !!timedOut, plays };
        if (choice === 'dk') body.dk = true; else if (choice !== null) body.choice = choice;
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

      const label = () => {
        const left = MAX - plays;
        play.textContent = plays === 0 ? 'Play' : 'Play again';
        info.textContent = left > 0 ? `${left} play${left === 1 ? '' : 's'} left` : 'No plays left';
        play.disabled = left <= 0;
      };
      label();
      play.addEventListener('click', () => {
        if (plays >= MAX) return;
        plays += 1; aud.currentTime = 0; play.disabled = true;
        info.textContent = `Playing… ${MAX - plays} play${MAX - plays === 1 ? '' : 's'} left after this`;
        aud.play().catch(() => { plays -= 1; label(); info.textContent = 'The audio did not play. Tap again.'; });
      });
      aud.addEventListener('ended', label);
      aud.addEventListener('error', () => { info.textContent = 'The audio did not load. Reload the page; the clock keeps running.'; });

      opts.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-i]');
        if (!b) return;
        choice = b.dataset.i === 'dk' ? 'dk' : Number(b.dataset.i);
        opts.querySelectorAll('button').forEach((x) => { const on = x === b; x.setAttribute('aria-pressed', String(on)); x.classList.toggle('btn-primary', on); });
        submitBtn.disabled = false;
      });
      submitBtn.addEventListener('click', () => send(false));
    });
  }

  async function finishScreen() {
    const report = await call('GET', '/report');
    const last = report.sittings[report.sittings.length - 1];
    root.innerHTML = `
      <h1>Done</h1>
      ${last ? sittingSummary(last) : ''}
      <p><a class="btn btn-primary" href="/spanish-listening">Back to the progress page</a></p>
      <section>${progress(report)}</section>`;
  }

  // ---- reporting --------------------------------------------------------------------------------

  function sittingSummary(s) {
    const c = s.counts;
    return `<div class="card">
      <h2 style="margin-top:0">${esc(s.name)} · ${esc(fmtDay(s.started))}</h2>
      <p style="margin:6px 0"><strong>Comprehension score ${pct(s.score.est)}</strong> <span class="muted">(95% CI ${ciText(s.score.ci)}; 0% is what blind guessing gives)</span></p>
      <p style="margin:6px 0">Right ${pct(s.raw.est)} <span class="muted">(${c.right} of ${c.n}; ${c.wrong} wrong; I don't know ${c.dont_know}; timed out ${c.timeout + c.unanswered}; late ${c.late})</span></p>
      <p class="small muted" style="margin-bottom:0">${timingLine(s)}</p>
      ${s.flags.length ? `<p class="small" style="margin-bottom:0">Flags: ${s.flags.map(esc).join('; ')}.</p>` : ''}
    </div>`;
  }

  function timingLine(s) {
    const t = s.timing;
    return `Started ${fmtTime(s.started)}, finished ${fmtTime(s.finished)} (${Math.round(s.duration_s / 60)} min). Median ${t.median_s_per_item === null ? '–' : Math.round(t.median_s_per_item)} s per clip. Timeouts: ${t.timeouts}. Left the page ${t.page_leaves} time${t.page_leaves === 1 ? '' : 's'}${t.items_open_when_left ? ` (${t.items_open_when_left} clip${t.items_open_when_left === 1 ? ' was' : 's were'} open at the time)` : ''}.${s.forced ? ' Started with the override.' : ''}`;
  }

  function progress(report) {
    const rows = report.sittings;
    if (!rows.length) {
      return '<div class="card"><h2 style="margin-top:0">No finished sittings yet</h2><p class="muted" style="margin-bottom:0">The chart and table appear after the first one.</p></div>';
    }
    return `
      <h2>Comprehension score by day</h2>
      ${chart(rows)}
      <p class="tiny muted">Score = (right − wrong/3) / 24, weighted by difficulty band. A blind guesser scores 0%; “I don't know” scores 0. The raw share right is printed above each bar. Whiskers are 95% confidence intervals. ${esc(STATEMENT)}</p>
      <div class="card"><div class="table-scroll"><table class="data" style="width:100%;font-size:.9rem">
        <thead><tr><th>Day</th><th>Score</th><th>Right</th><th class="n">Right / wrong / don't know</th></tr></thead>
        <tbody>${rows.map((s) => `<tr><td>${esc(s.name)}<br><span class="tiny muted">${esc(fmtDay(s.started))}</span></td>
          <td>${pct(s.score.est)}<br><span class="tiny muted">${ciText(s.score.ci)}</span></td>
          <td>${pct(s.raw.est)}<br><span class="tiny muted">${ciText(s.raw.ci)}</span></td>
          <td class="n">${s.counts.right} / ${s.counts.wrong} / ${s.counts.dont_know}</td></tr>`).join('')}</tbody>
      </table></div></div>
      ${rows.length > 1 ? changeBlock(rows) : ''}
      <h3>How each sitting went</h3>
      <div class="card"><div class="table-scroll"><table class="data" style="width:100%;font-size:.9rem">
        <thead><tr><th>Day</th><th>Started</th><th>Finished</th><th class="n">Median s per clip</th><th class="n">Timeouts</th><th class="n">I don't know</th><th class="n">Page leaves</th><th>Flags</th></tr></thead>
        <tbody>${rows.map((s) => `<tr><td>${esc(s.name)}${s.forced ? ' <span class="tiny muted">(override)</span>' : ''}<br><span class="tiny muted">${esc(fmtDay(s.started))}</span></td>
          <td>${esc(fmtTime(s.started))}</td><td>${esc(fmtTime(s.finished))}<br><span class="tiny muted">${Math.round(s.duration_s / 60)} min</span></td>
          <td class="n">${s.timing.median_s_per_item === null ? '–' : Math.round(s.timing.median_s_per_item)}</td><td class="n">${s.timing.timeouts}</td><td class="n">${s.counts.dont_know}</td>
          <td class="n">${s.timing.page_leaves}${s.timing.items_open_when_left ? `<br><span class="tiny muted">${s.timing.items_open_when_left} clip(s) open</span>` : ''}</td>
          <td class="small">${s.flags.length ? s.flags.map(esc).join('; ') : 'none'}</td></tr>`).join('')}</tbody>
      </table></div></div>
      ${report.voided.length ? `<p class="small muted">${report.voided.length} sitting(s) abandoned and voided; their questions are not reused.</p>` : ''}
      ${report.violations && report.violations.length ? `<div class="notice notice-error"><strong>The log breaks a rule:</strong> ${report.violations.slice(0, 3).map(esc).join('; ')}</div>` : ''}`;
  }

  function changeBlock(rows) {
    const last = rows[rows.length - 1];
    const c = last.change_from_first;
    if (!c) return '';
    const d = c.score;
    return `<h3>Change from ${esc(rows[0].name)} to ${esc(last.name)}</h3>
      <p class="small">Comprehension score: <strong>${pts(d.diff)} points</strong> <span class="muted">(95% CI ${pts(d.lo)} to ${pts(d.hi)})${d.lo > 0 ? ', the interval is above zero' : d.hi < 0 ? ', the interval is below zero' : ', the interval includes zero'}</span></p>
      <p class="tiny muted">With 24 clips per sitting, small changes are within the noise; the interval says how much.</p>`;
  }

  function chart(rows) {
    const W = 480; const H = 330; const L = 52; const R = 8; const T = 26; const B = 56;
    const yMin = -0.4; const yMax = 1;
    const y = (v) => T + ((yMax - Math.max(yMin, Math.min(yMax, v))) / (yMax - yMin)) * (H - T - B);
    const gw = (W - L - R) / rows.length; const bw = Math.min(56, gw * 0.5);
    const grid = [-0.25, 0, 0.25, 0.5, 0.75, 1].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" style="stroke:${v === 0 ? 'var(--ink-2)' : 'var(--line)'}" stroke-width="${v === 0 ? 1.5 : 1}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="17" style="fill:var(--ink-3)">${Math.round(v * 100)}%</text>`).join('');
    const groups = rows.map((s, i) => {
      const cx = L + gw * (i + 0.5);
      const x = cx - bw / 2; const y0 = y(0); const y1 = y(s.score.est);
      const ci = s.score.ci;
      const flag = s.flags.length ? `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="15" style="fill:var(--warn)">flagged</text>` : '';
      return `<rect x="${x}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1, Math.abs(y0 - y1))}" rx="2" style="fill:var(--subj)"/>
        <line x1="${cx}" x2="${cx}" y1="${y(ci[0])}" y2="${y(ci[1])}" style="stroke:var(--ink)" stroke-width="1.6"/>
        <line x1="${cx - 6}" x2="${cx + 6}" y1="${y(ci[0])}" y2="${y(ci[0])}" style="stroke:var(--ink)" stroke-width="1.6"/>
        <line x1="${cx - 6}" x2="${cx + 6}" y1="${y(ci[1])}" y2="${y(ci[1])}" style="stroke:var(--ink)" stroke-width="1.6"/>
        <text x="${cx}" y="${y(ci[1]) - 18}" text-anchor="middle" font-size="18" font-weight="700" style="fill:var(--ink)">${pct(s.score.est)}</text>
        <text x="${cx}" y="${y(ci[1]) - 3}" text-anchor="middle" font-size="15" style="fill:var(--ink-2)">right ${pct(s.raw.est)}</text>
        <text x="${cx}" y="${H - B + 18}" text-anchor="middle" font-size="18" style="fill:var(--ink)">${esc(s.name)}</text><text x="${cx}" y="${H - B + 36}" text-anchor="middle" font-size="15" style="fill:var(--ink-3)">${esc(fmtDay(s.started))}</text>${flag}`;
    }).join('');
    const label = `Bar chart of the comprehension score for each sitting: ${rows.map((s) => `${s.name}, ${pct(s.score.est)}, 95% interval ${ciText(s.score.ci)}`).join('; ')}. Zero means guessing.`;
    return `<figure style="margin:0"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="width:100%;height:auto;max-width:720px">
      ${grid}${groups}
      <rect x="${L}" y="4" width="11" height="11" rx="2" style="fill:var(--subj)"/><text x="${L + 16}" y="15" font-size="16" style="fill:var(--ink-2)">Comprehension score (0% = guessing)</text>
    </svg></figure>`;
  }

  await home();
});
