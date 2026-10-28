/* A retention enforcer (services/enforcers.js; RETENTION-ENFORCERS.md).
 *
 *   choosing   what it covers, and the tiers: quick, medium, full (each its
 *              number of questions and minutes; full stays under a tenth of
 *              the covered active time), or no enforcer.
 *   running    the questions, one at a time, each marked as it is answered; a
 *              miss can come back once later. Opened again after leaving
 *              halfway: finish it, pick another tier, or stop here.
 *   closed     what held, and the way on (Start session when the learner came
 *              here on their way to one).
 *
 * The owner's account (base version) can skip any enforcer at any point. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const host = document.getElementById('enforcer');
  const esc = App.escapeHtml;
  const id = Number(App.query('id'));
  const thenStart = App.query('then') === 'start';
  const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  if (!id) {
    host.innerHTML = '<div class="notice notice-error">No enforcer selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  let enf = null;
  async function load() {
    enf = (await App.api.get(`/api/retention/enforcers/${id}`)).enforcer;
  }
  try { await load(); } catch (err) {
    host.innerHTML = `<div class="notice notice-error">${esc(err.status === 404 ? 'There is no such enforcer.' : err.message)} <a href="/dashboard">Back to dashboard</a>.</div>`;
    return;
  }

  const TIER = { quick: 'Quick', medium: 'Medium', full: 'Full' };
  const date = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  };
  const span = (a, b) => (!a ? '' : a === b ? date(a) : `${date(a)} to ${date(b)}`);

  function title() {
    if (enf.scope === 'session') return 'Lock in this session';
    if (enf.scope === 'day') return 'Lock in today';
    return `${enf.label} retention enforcer`;
  }

  function covers() {
    const n = enf.answered_in_window;
    const work = `${n} question${n === 1 ? '' : 's'} answered, <span class="num">${esc(String(Math.round(enf.active_minutes)))}</span> min active`;
    if (enf.scope === 'session') return `Covers the session you just ended: ${work}.`;
    if (enf.scope === 'day') return `Covers everything you did today: ${work}.`;
    const sameDay = enf.covers.length > 1 && enf.covers.every((c) => c.date === enf.covers[0].date);
    const merged = enf.covers.length > 1 && !sameDay ? ` It stands for ${enf.covers.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((c) => `the ${c.label.toLowerCase()} due ${date(c.date)}`).join(', ')}.` : '';
    const took = (enf.absorbs || []).map((a) => (a.type === 'day' ? `the end of ${enf.day_date ? date(enf.day_date) : 'its day'}` : `the ${a.label.toLowerCase()}`));
    const absorbed = took.length ? ` It takes in ${took.join(' and ')}: one plan for all of it, not one per enforcer.` : '';
    return `Covers ${esc(span(enf.window.from_date, enf.window.to_date))}: ${work}.${merged}${esc(absorbed)}`;
  }

  function head(sub) {
    return `
      <div class="enf-head">
        <a class="back-link" href="/dashboard">${window.icon('arrow-left')}Dashboard</a>
        <h1>${esc(title())}</h1>
        ${sub ? `<p class="enf-lede">${sub}</p>` : ''}
      </div>`;
  }

  function skipButton() {
    return enf.can_skip ? '<button class="btn-text" type="button" id="skip">Skip (owner)</button>' : '';
  }

  // ── choosing ────────────────────────────────────────────────────────────
  function chooser({ again = false } = {}) {
    const avail = enf.options.filter((o) => o.available);
    const pick = (avail.find((o) => o.tier === (enf.tier || enf.default_tier)) || avail[avail.length - 1] || {}).tier || 'none';
    const sub = again
      ? `You answered <span class="num">${enf.answered}</span> of <span class="num">${enf.planned}</span> before you left. Finish it, pick a different size, or stop here; what you answered already counts.`
      : `${covers()}${enf.late ? ' It came due on an earlier day.' : ''}${enf.left_without_choosing ? ' The session ended before you chose.' : ''}`;
    host.innerHTML = `
      ${head(sub)}
      <form class="enf-choose" id="choose">
        <fieldset>
          <legend>${again ? 'How do you want to carry on?' : 'How much do you want to lock in?'}</legend>
          ${again ? `
            <label class="enf-option">
              <input type="radio" name="tier" value="resume" checked>
              <span><span class="enf-name">Finish it</span><span class="enf-meta"><span class="num">${enf.planned - enf.answered}</span> question${enf.planned - enf.answered === 1 ? '' : 's'} left (${esc(TIER[enf.tier] || '')})</span></span>
            </label>` : ''}
          ${enf.options.map((o) => `
            <label class="enf-option${o.available ? '' : ' is-off'}">
              <input type="radio" name="tier" value="${o.tier}"${o.available ? '' : ' disabled'}${!again && o.tier === pick ? ' checked' : ''}${again && o.tier === enf.tier ? ' disabled' : ''}>
              <span>
                <span class="enf-name">${TIER[o.tier]}</span>
                <span class="enf-meta">${o.available
    ? `<span class="num">${o.items}</span> question${o.items === 1 ? '' : 's'}, about <span class="num">${Math.max(1, Math.round(o.minutes))}</span> min`
    : 'Not enough active time for this one'}${o.retries && o.available ? '. A miss gets another try' : ''}${o.tier === 'full' ? '. Under a tenth of your active time' : ''}</span>
              </span>
            </label>`).join('')}
          <label class="enf-option">
            <input type="radio" name="tier" value="none"${!avail.length && !again ? ' checked' : ''}>
            <span><span class="enf-name">${again ? 'Stop here' : 'No enforcer'}</span><span class="enf-meta">${again ? 'Keep what you answered and close it' : 'Nothing now. The scheduled enforcers still come round.'}</span></span>
          </label>
        </fieldset>
        <div class="path-actions">
          <button class="btn btn-primary btn-lg" type="submit" id="go">Continue</button>
          ${skipButton()}
          <span class="small">Each answer is marked straight away. Nothing here changes your level.</span>
        </div>
      </form>`;
    const form = document.getElementById('choose');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (form.querySelector('input[name="tier"]:checked') || {}).value;
      if (!v) { App.toast('Choose one first.', 'error'); return; }
      // "No enforcer" (or "Stop here") settles it: an error from an earlier try no longer applies.
      if (v === 'none') clearErrors();
      if (v === 'resume') { play(); return; }
      if (v === 'none' && again) stoppedHere = true;
      const go = document.getElementById('go');
      go.disabled = true;
      go.innerHTML = '<span class="spinner"></span>Setting up';
      try {
        const out = await App.api.post(`/api/retention/enforcers/${id}/choose`, { tier: v });
        enf = out.enforcer;
      } catch (err) {
        App.toast(err.message, 'error');
        go.disabled = false;
        go.textContent = 'Continue';
        return;
      }
      if (enf.status === 'running') play(); else closed();
    });
    bindSkip();
    const first = form.querySelector('input:checked') || form.querySelector('input:not([disabled])');
    if (first) first.focus();
  }

  /** Error toasts stay until dismissed (UX_TOAST_STAY); once the learner has settled the enforcer they are stale. */
  function clearErrors() {
    document.querySelectorAll('.toast-host .toast-error').forEach((n) => n.remove());
  }

  function bindSkip() {
    const b = document.getElementById('skip');
    if (!b) return;
    b.addEventListener('click', async () => {
      try { enf = (await App.api.post(`/api/retention/enforcers/${id}/skip`, {})).enforcer; } catch (err) { App.toast(err.message, 'error'); return; }
      closed();
    });
  }

  // ── the questions ───────────────────────────────────────────────────────
  let items = [];
  let index = 0;
  let askedAt = Date.now();
  let timeUp = false;
  // The learner pressed "Stop here" (not the tier's time running out).
  let stoppedHere = false;

  function play() {
    items = enf.items.filter((i) => i);
    index = items.findIndex((i) => !i.answered);
    if (index === -1) { finish(); return; }
    host.innerHTML = `
      <div class="player">
        <div class="player-head">
          <a class="icon-btn player-close" href="/dashboard" title="Leave; you can finish it next time" aria-label="Leave; you can finish it next time">${window.icon('x')}</a>
          <div class="player-titles">
            <h1 id="title">${esc(title())}</h1>
            <div id="subtitle">${esc(TIER[enf.tier] || '')} retention enforcer. Questions on what you worked on.</div>
          </div>
          <div class="player-chips"><span class="chip counter" id="counter"></span></div>
          <div class="player-meter">
            <div class="segments" id="segments" aria-hidden="true"></div>
            <span class="visually-hidden" id="pct"></span>
          </div>
        </div>
        <div class="card" id="item"></div>
        <div class="enf-foot">
          <button class="btn-text" type="button" id="stop">Stop here</button>
          ${skipButton()}
        </div>
      </div>`;
    document.getElementById('stop').addEventListener('click', async () => {
      try { enf = (await App.api.post(`/api/retention/enforcers/${id}/choose`, { tier: 'none' })).enforcer; } catch (err) { App.toast(err.message, 'error'); return; }
      stoppedHere = true;
      clearErrors();
      closed();
    });
    bindSkip();
    show();
  }

  function progress() {
    const answered = items.filter((i) => i.answered).length;
    document.getElementById('counter').textContent = `${Math.min(index + 1, items.length)} / ${items.length}`;
    document.getElementById('pct').textContent = `${answered} of ${items.length} answered`;
    document.getElementById('segments').innerHTML = items.map((it, i) => `<i class="${it.answered
      ? (it.correct === true ? 'is-correct' : it.correct === false ? 'is-wrong' : 'is-answered')
      : i === index ? 'is-now' : ''}"></i>`).join('');
  }

  function show() {
    const item = items[index];
    const itemHost = document.getElementById('item');
    progress();
    askedAt = Date.now();
    Player.render(itemHost, item, {
      label: item.again ? 'One more try' : null,
      coach: false,
      onSubmit: async (answer, meta = {}) => {
        let result;
        try {
          result = await App.api.post(`/api/sessions/${item.session_id}/answer`, {
            item_id: item.id, answer, ms: Date.now() - askedAt, confidence: meta.confidence || null, changes: meta.changes || 0,
          });
        } catch (err) {
          App.toast(err.message, 'error');
          return;
        }
        item.answered = true;
        item.correct = result.correct === undefined ? null : result.correct;
        const note = result.enforcer || {};
        if (note.order) {
          // The server's order: a retry slotted in a few questions on, and anything past the budget dropped.
          const byId = new Map(items.map((i) => [i.id, i]));
          if (note.added) byId.set(note.added.id, note.added);
          items = note.order.map((x) => byId.get(x)).filter(Boolean);
          index = items.indexOf(item);
        }
        if (note.time_up) timeUp = true;
        progress();
        const last = index + 1 >= items.length;
        Player.reveal(itemHost, item, result, {
          nextLabel: last ? 'Finish' : 'Next question',
          onNext: () => { index += 1; if (index >= items.length) finish(); else show(); },
        });
      },
    });
  }

  async function finish() {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Saving</div>';
    try {
      enf = (await App.api.post(`/api/retention/enforcers/${id}/finish`, {})).enforcer;
    } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
      return;
    }
    closed();
  }

  // ── closed ──────────────────────────────────────────────────────────────
  /** A second look at what was missed (the params' end-of-enforcer recap). */
  function missed() {
    const list = (enf.items || []).filter((i) => i.correct === false);
    if (!list.length) return '';
    return `
      <section class="review-section" aria-labelledby="missed-h">
        <h2 class="section-title" id="missed-h">A second look</h2>
        <ol class="review-list">
          ${list.map((i) => `
            <li class="review-row"><span>
              <span class="review-title">${esc(i.prompt)}</span>
              <span class="review-why">The answer: <strong>${esc(String(i.answer == null ? '' : i.answer))}</strong>. ${esc(i.rationale || '')}</span>
            </span></li>`).join('')}
        </ol>
      </section>`;
  }

  function closed() {
    const r = enf.results || {};
    const STATUS = {
      done: r.answered ? `${r.right} of ${r.answered} right.` : 'Done.',
      stopped: r.answered ? `Stopped. ${r.right} of ${r.answered} right, and those count.` : 'Stopped before any question.',
      declined: 'No enforcer this time.',
      skipped: 'Skipped.',
      empty: enf.reason === 'too_short' ? 'Too short for an enforcer: none of them fits in a tenth of the active time.'
        : enf.reason === 'no_questions' ? 'Nothing to lock in this time: there are no fresh questions on this work yet. What you answered still counts, and it comes round in the scheduled enforcers.'
          : 'Nothing to lock in: no questions were answered in this window.',
      expired: 'This one has expired.',
      merged: 'This one was folded into a wider one.',
    };
    const line = STATUS[enf.status] || 'Closed.';
    const all = r.answered && r.right === r.answered;
    host.innerHTML = `
      ${head('')}
      <div class="enf-done">
        <p class="path-done-line">${enf.status === 'done' && all ? window.mark('tick') : ''}${esc(line)}</p>
        ${enf.status === 'done' || (enf.status === 'stopped' && r.answered) ? `
          <dl class="facts">
            <div><dt>Right</dt><dd>${App.pct(r.accuracy)}</dd></div>
            <div><dt>Time</dt><dd>${Math.max(1, Math.round((r.elapsed_ms || 0) / 60000))} min</dd></div>
            ${r.xp ? `<div><dt>XP</dt><dd>+${r.xp}</dd></div>` : ''}
          </dl>
          ${missed()}
          <p class="small">${all ? 'Every one held. A right answer after a gap makes it last longer.' : 'What you missed is marked for review and comes back in the next enforcers.'}${stoppedHere || enf.status === 'stopped'
    ? ' You stopped here; the rest is kept for next time.'
    : timeUp ? ' The time for this tier ran out, so the rest was left for next time.' : ''}</p>` : ''}
        <div class="path-actions">
          ${thenStart ? '<button class="btn btn-primary" type="button" id="start">Start session</button>' : '<a class="btn btn-primary" href="/dashboard">Back to dashboard</a>'}
          <a class="btn-text" href="/calendar">Retention calendar</a>
        </div>
      </div>`;
    App.announce(line);
    const start = document.getElementById('start');
    if (start) {
      start.addEventListener('click', async () => {
        try {
          await App.api.post('/api/retention/study/start', { tz: TZ });
          window.location.href = '/dashboard';
        } catch (err) {
          if (err.status === 409 && err.payload && err.payload.offer) { window.location.href = `/enforcer?id=${err.payload.offer.id}&then=start`; return; }
          App.toast(err.message, 'error');
        }
      });
      start.focus();
    }
  }

  if (enf.status === 'choosing') chooser();
  else if (enf.status === 'running') {
    if (enf.answered > 0) chooser({ again: true }); else play();
  } else closed();
});
