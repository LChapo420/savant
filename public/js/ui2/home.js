/* Home and Everything (docs/UI-V2.md, structure A, "One next thing"). Loaded before js/dashboard.js when UI_V2 is on.
 *
 * js/dashboard.js runs untouched and draws today's page into #root, with every decision it always made: placement, checkpoints, a held Final, catch-ups, retake, the planner, the offers.
 * This file then shows that work two ways, on the one page:
 *
 *   Home        one task and one strong button, the day as a queue of dots. Read from GET /api/plan/today, the same reply and the same first step as today's "Start" button;
 *               with no step (nothing due, the plan unavailable) it falls back to the lead card js/dashboard.js drew, with that card's own wording and link.
 *   Everything  /dashboard#everything: the real subject cards, planner, recent sessions, offers and the rest, moved into one list. Moved, not copied, so their listeners keep working.
 *               Other pages link here rather than keep a second copy of any of it.
 *
 * What it writes: PUT /api/plan/minutes from the minutes picker, the same call as today's. Nothing else.
 */
(function () {
  if (!window.App || !App.ui2) return;
  const { ic, gets } = App.ui2;
  const esc = App.escapeHtml;
  const PRESETS = [30, 45, 60, 90, 120];
  const root = document.getElementById('root');
  if (!root) return;

  let plan = null;
  let progress = null;
  let built = false;
  let focusReq = 0;
  let cameFromHome = false;

  // ── small pieces ─────────────────────────────────────────────────────────
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const stepName = (b) => {
    if (b.kind === 'break') return 'Take a break';
    if (b.enforcer) return b.scheduledEnforcer ? 'End day session' : 'Finish your retention enforcer';
    const what = b.kind === 'review' ? 'Review' : b.placement ? 'Placement quiz' : `${b.kind === 'catchup' ? 'Catch-up level' : 'Level'} ${b.level}`;
    // The subject's short name when this is one of the learner's enrollments; the plan's own title (it can carry the whole grade) otherwise.
    const e = ((progress && progress.enrollments) || []).find((x) => x.id === b.enrollmentId);
    const subject = e ? e.track.name : App.noDash(b.subject || '');
    return subject ? `${what}: ${subject}` : what;
  };
  const mins = (m) => `${Math.round(Number(m) * 10) / 10} min`;
  const textOf = (node) => {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('.visually-hidden').forEach((n) => n.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };
  const row = (href, icon, title, sub, extra = '') => `
    <a class="u2-row" href="${href}" ${extra}>
      <span class="u2-tile">${ic(icon)}</span>
      <span class="u2-row-t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      ${ic('chev-r', 'u2-mute')}
    </a>`;
  const fold = (id, icon, title, sub) => `
    <details class="u2-fold" id="${id}">
      <summary class="u2-row"><span class="u2-tile">${ic(icon)}</span><span class="u2-row-t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${ic('chev-d', 'u2-mute')}</summary>
      <div class="u2-fold-body"></div>
    </details>`;
  const picker = () => `
    <div class="u2-picker" role="group" aria-label="Minutes you have today">
      <span>I have</span>
      ${PRESETS.map((m) => `<button type="button" class="u2-chip${plan && m === plan.minutes ? ' on' : ''}" data-minutes="${m}" aria-pressed="${!!(plan && m === plan.minutes)}" aria-label="${m} minutes">${m}</button>`).join('')}
      <span>min</span>
    </div>`;

  // ── what the one task is ─────────────────────────────────────────────────
  const leadCard = () => {
    const card = root.querySelector('.plan-next');
    if (!card) return null;
    const button = card.querySelector('a.btn');
    const whole = card.querySelector('.next-links a[href^="/path"]');
    const m = whole ? /enrollment=(\d+)/.exec(whole.getAttribute('href')) : null;
    return {
      card,
      id: m ? Number(m[1]) : null,
      heading: textOf(card.querySelector('h2')).replace(/^Next:\s*/, ''),
      detail: textOf(card.querySelector('.next-detail')),
      label: textOf(button),
      href: button ? button.getAttribute('href') : null,
      strong: !!(button && button.classList.contains('btn-primary')),
      symbol: card.querySelector('.symbol') ? card.querySelector('.symbol').outerHTML : '',
      path: whole ? whole.getAttribute('href') : null,
    };
  };
  const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  async function focusOf() {
    const lead = leadCard();
    const blocks = (plan && plan.blocks) || [];
    const first = blocks.find((b) => b.kind !== 'break' && b.href);
    if (!first) {
      if (!lead) return null;
      return { icon: lead.symbol, eyebrow: 'Up next', title: capital(lead.heading), detail: lead.detail, href: lead.href, label: lead.label, strong: lead.strong, path: lead.path };
    }
    const about = `about ${Math.round(first.estMinutes)} ${Math.round(first.estMinutes) === 1 ? 'minute' : 'minutes'}`;
    if (first.enforcer) return { icon: `<span class="u2-tile u2-lg">${ic('target')}</span>`, eyebrow: 'Up next', title: stepName(first), detail: first.why || capital(about), href: first.href, label: 'Start', strong: true, path: lead && lead.path, block: first };
    if (first.kind === 'review') {
      return { icon: `<span class="u2-tile u2-lg">${ic('loop')}</span>`, eyebrow: 'Up next', title: stepName(first), detail: first.why ? `${first.why}. ${capital(about)}.`.replace(/\.\./g, '.') : capital(about), href: first.href, label: 'Start the review', strong: true, path: first.enrollmentId ? `/path?enrollment=${first.enrollmentId}` : (lead && lead.path), block: first };
    }
    const e = ((progress && progress.enrollments) || []).find((x) => x.id === first.enrollmentId);
    const symbol = e ? App.symbol(e.track, { size: 'lg' }) : (lead ? lead.symbol : '');
    const path = first.enrollmentId ? `/path?enrollment=${first.enrollmentId}` : (lead && lead.path);
    const grade = e ? App.gradeParts(e.grade.name)[0] : '';
    const where = e ? `${e.track.name}, ${grade}.` : '';
    if (first.placement) {
      return { icon: symbol, eyebrow: 'Up next', title: e ? `Find your level in ${e.track.name}` : stepName(first), detail: `${where} A placement quiz of about ${Math.round(first.estMinutes)} minutes finds where you start.`.trim(), href: first.href, label: 'Take the placement quiz', strong: true, path: null, block: first };
    }
    // The level's own title, from the path the lead card already asked for, or this subject's own.
    let title = stepName(first);
    let kind = null;
    if (e && first.level) {
      const url = `/api/path/${e.id}?view=ticks`;
      try {
        const reply = await (gets.get(url) || App.api.get(url));
        const node = (reply.nodes || []).find((n) => n.level === first.level);
        if (node) {
          kind = node.kind || node.type || null;
          const parts = App.levelParts(node);
          if (parts && parts.title) title = parts.title;
        }
      } catch { /* the plain name stands */ }
    }
    const sameAsLead = lead && lead.id === first.enrollmentId && e && e.current_level === first.level;
    const label = sameAsLead && lead.label ? lead.label : first.checkpoint && kind ? `Take the ${App.levelName(kind)}` : kind === 'lesson' ? `Start lesson ${first.level}` : `Start level ${first.level}`;
    const total = e ? e.grade.pathLength : 0;
    const kindWord = first.checkpoint ? 'A checkpoint' : kind === 'lesson' ? 'A lesson' : 'A level';
    const note = sameAsLead && lead.detail && !/^0 of /.test(lead.detail) ? ` ${lead.detail}` : '';
    return {
      icon: symbol,
      eyebrow: `Up next, ${first.kind === 'catchup' ? 'catch-up ' : ''}level ${first.level}${total ? ` of ${total}` : ''}`,
      title,
      detail: `${where} ${kindWord} of ${about}.${note}`.trim(),
      href: first.href,
      label,
      strong: true,
      path,
      block: first,
    };
  }

  // ── today's sittings: what the queue has behind it ───────────────────────
  function doneToday() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return ((progress && progress.week) || []).filter((w) => new Date(w.ended_at) >= start).length;
  }
  function weekNumbers() {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 6);
    const days = new Set();
    let answered = 0;
    for (const w of (progress && progress.week) || []) {
      const t = new Date(w.ended_at);
      if (t >= since) { days.add(t.toDateString()); answered += Number(w.answered) || 0; }
    }
    return { days: days.size, answered };
  }

  // ── Home ─────────────────────────────────────────────────────────────────
  async function drawHome() {
    const host = document.getElementById('u2-home');
    if (!host) return;
    const req = ++focusReq;
    const focus = await focusOf();
    if (req !== focusReq) return;
    const user = App.ui2.user || {};
    const first = String(user.display_name || '').trim().split(/\s+/)[0];
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const blocks = (plan && plan.blocks) || [];
    const done = doneToday();
    const at = focus && focus.block ? blocks.indexOf(focus.block) : -1;
    const all = done + blocks.length;
    const after = at >= 0 ? blocks.slice(at + 1) : [];
    const before = at > 0 ? blocks.slice(0, at) : [];
    const week = weekNumbers();
    const subjects = ((progress && progress.enrollments) || []).filter((e) => e.status !== 'graduated');

    const day = blocks.length ? `
      <div class="u2-segs" aria-hidden="true">${Array.from({ length: all }, (_, i) => `<i class="${i < done ? 'on' : i === done ? 'now' : ''}"></i>`).join('')}</div>
      <div class="u2-sb u2-m">
        <span>${done} of ${all} done, about ${Math.round(plan.minutes_used)} min left</span>
        <button type="button" class="u2-link-q" id="u2-minutes" aria-haspopup="dialog" aria-label="${plan.minutes} minutes today. Change">${plan.minutes} min ${ic('chev-d')}</button>
      </div>` : (plan ? `
      <div class="u2-sb u2-m"><span>Nothing is due today.</span><button type="button" class="u2-link-q" id="u2-minutes" aria-haspopup="dialog" aria-label="${plan.minutes} minutes today. Change">${plan.minutes} min ${ic('chev-d')}</button></div>` : '');

    const nextUp = after[0] || null;
    host.innerHTML = `
      <div class="u2-day">
        <div class="u2-m">${first ? `Hi, ${esc(first)}. ` : ''}${esc(today)}.</div>
        ${day}
      </div>
      <div class="u2-focus">
        ${focus ? `
          ${focus.icon || ''}
          <div class="u2-m u2-eyebrow-line">${esc(focus.eyebrow)}</div>
          <h1 class="u2-t1" tabindex="-1" id="u2-title">${esc(focus.title)}</h1>
          ${focus.detail ? `<p class="u2-m u2-detail">${esc(focus.detail)}</p>` : ''}` : ''}
        <div class="u2-go">
          ${focus && focus.href ? `<a class="u2-btn${focus.strong ? '' : ' u2-btn-2'}" id="u2-start" href="${esc(focus.href)}">${esc(focus.label)}</a>` : ''}
          ${focus && focus.path ? `<a class="u2-link" href="${esc(focus.path)}">See the whole path</a>` : ''}
        </div>
      </div>
      ${blocks.length ? `
      <button type="button" class="u2-peek" id="u2-peek" aria-haspopup="dialog">
        <span class="u2-m">${nextUp ? `<b>Then</b> ${esc(stepName(nextUp))}, ${mins(nextUp.estMinutes)}` : '<b>Today</b> Nothing else planned'}</span>
        ${ic('chev-u', 'u2-mute')}
      </button>` : ''}
      <aside class="u2-side" aria-label="More about today">
        <div><h2 class="u2-eyebrow">Then</h2><ul>${(after.length ? after : []).slice(0, 5).map((b) => `<li>${esc(stepName(b))}, ${mins(b.estMinutes)}</li>`).join('') || '<li>Nothing else today</li>'}</ul></div>
        <div><h2 class="u2-eyebrow">This week</h2><ul><li>${week.days ? `${plural(week.days, 'day')} studied in the last 7` : 'No sessions in the last 7 days yet'}</li>${week.answered ? `<li>${plural(week.answered, 'question')} answered</li>` : ''}</ul></div>
        <div><h2 class="u2-eyebrow">Your subjects</h2><ul>${subjects.slice(0, 5).map((e) => `<li><a href="/path?enrollment=${e.id}">${esc(e.track.name)}${e.status === 'placement_pending' ? ', not placed yet' : `, level ${e.current_level}`}</a></li>`).join('')}</ul></div>
      </aside>`;
    void before;
  }

  // ── sheets: the day's steps, and the minutes ─────────────────────────────
  function openSheet(title, body, opener) {
    const dlg = document.createElement('dialog');
    dlg.className = 'u2-dialog';
    dlg.setAttribute('aria-label', title);
    dlg.innerHTML = `
      <div class="u2-dialog-head"><b class="u2-t3">${esc(title)}</b><button type="button" class="u2-ib" data-close aria-label="Close">${ic('x')}</button></div>
      <div class="u2-dialog-body">${body}</div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.close(); };
    dlg.addEventListener('close', () => { dlg.remove(); if (opener && opener.isConnected) opener.focus(); else { const again = opener && opener.id && document.getElementById(opener.id); if (again) again.focus(); } });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) close(); });
    dlg.showModal();
    return dlg;
  }
  function stepsBody() {
    const blocks = (plan && plan.blocks) || [];
    const first = blocks.find((b) => b.kind !== 'break' && b.href);
    return `
      ${picker()}
      <ol class="u2-steps">${blocks.map((b) => `
        <li class="${b === first ? 'now' : ''}">
          <span class="u2-sb"><b>${esc(stepName(b))}</b><span class="u2-num">${mins(b.estMinutes)}</span></span>
          ${b.why ? `<small>${esc(b.why)}</small>` : ''}
        </li>`).join('')}</ol>
      <p class="u2-s">About ${Math.round(plan.minutes_used)} of your ${plan.minutes} minutes${plan.break_minutes ? `, ${plan.break_minutes} of them breaks` : ''}. Estimates use your own pace once Savant has seen enough of it.</p>`;
  }

  async function setMinutes(minutes, holder) {
    try {
      await App.api.request('PUT', '/api/plan/minutes', { minutes });
      plan = await App.api.get(`/api/plan/today?minutes=${minutes}`);
      await drawHome();
      drawAllPicker();
      if (holder) {
        const body = holder.querySelector('.u2-dialog-body');
        if (body && holder.dataset.kind === 'steps') body.innerHTML = stepsBody();
        else if (body) body.innerHTML = picker();
        const again = holder.querySelector(`[data-minutes="${minutes}"]`);
        if (again) again.focus();
      } else {
        const again = document.querySelector(`#u2-all [data-minutes="${minutes}"]`);
        if (again) again.focus();
      }
      App.announce(`${minutes} minutes today.`);
    } catch (err) { App.toast(err.message, 'error'); }
  }
  document.addEventListener('click', (ev) => {
    const pick = ev.target.closest('[data-minutes]');
    if (pick) { setMinutes(Number(pick.getAttribute('data-minutes')), pick.closest('dialog')); return; }
    const minutes = ev.target.closest('#u2-minutes');
    if (minutes) { const d = openSheet('Minutes you have today', picker(), minutes); d.dataset.kind = 'minutes'; return; }
    const peek = ev.target.closest('#u2-peek');
    if (peek) { const d = openSheet('Today\'s plan', stepsBody(), peek); d.dataset.kind = 'steps'; }
  });

  // ── Everything ───────────────────────────────────────────────────────────
  function drawAllPicker() {
    const slot = document.getElementById('u2-all-picker');
    if (slot) slot.innerHTML = plan ? picker() : '';
  }
  function buildAll() {
    const user = App.ui2.user || {};
    const home = root.querySelector('.home');
    const all = document.createElement('div');
    all.id = 'u2-all';
    const leadHref = (name) => { const lead = leadCard(); return lead && lead.id ? `/${name}?enrollment=${lead.id}` : null; };
    const due = (progress && progress.due) || [];
    const reviewHref = leadHref('review') || (user.retention ? '/calendar' : null);
    const dark = document.documentElement.dataset.mode === 'dark';
    all.innerHTML = `
      <h1 class="u2-vh" tabindex="-1" id="u2-all-title">Everything</h1>
      <section id="u2-all-plan" ${plan ? '' : 'hidden'}><h2 class="u2-eyebrow">Today's plan</h2><div id="u2-all-picker"></div></section>
      <section id="u2-all-subjects"><h2 class="u2-eyebrow">Your subjects</h2><div id="u2-subject-slot"></div>${row('/onboarding', 'plus', 'Add a subject', '')}</section>
      <section id="u2-all-else">
        <h2 class="u2-eyebrow">Everything else</h2>
        ${reviewHref ? row(reviewHref, 'loop', 'Review', due.length ? `${plural(due.length, 'skill')} due` : '') : ''}
        ${row('/my-material', 'note', 'My material', '', 'id="u2-row-material"')}
        ${fold('u2-fold-calendar', 'calendar', user.retention ? 'Calendar and next study time' : 'Next study time', '')}
        ${(progress && progress.recent && progress.recent.length) ? fold('u2-fold-recent', 'history', 'Recent sessions', '') : ''}
        ${row('/profile', 'user', 'Profile and scorecard', '')}
        ${user.can_browse ? row('/curriculum', 'book', 'Curriculum', 'Every subject, grade and level') : ''}
        ${user.is_admin ? row('/game-lab', 'target', 'Game lab', '') + row('/admin', 'settings', 'Admin', '') : ''}
        ${home ? fold('u2-fold-extras', 'chat', 'Your tutor and optional extras', 'What your tutor knows, and quick ways to fit lessons to you') : ''}
      </section>
      <section id="u2-all-account">
        <button type="button" class="u2-row" id="u2-theme"><span class="u2-tile">${ic(dark ? 'sun' : 'moon')}</span><span class="u2-row-t"><b>${dark ? 'Light theme' : 'Dark theme'}</b></span></button>
        <button type="button" class="u2-row" id="u2-signout"><span class="u2-tile">${ic('out')}</span><span class="u2-row-t"><b>Sign out</b></span></button>
      </section>`;
    root.appendChild(all);
    drawAllPicker();

    if (home) {
      // The real parts, moved: their listeners are on these nodes and go with them.
      const cards = home.querySelector('.subject-cards');
      if (cards) {
        document.getElementById('u2-subject-slot').appendChild(cards);
        cards.querySelectorAll('.subject-card').forEach((c) => { c.insertAdjacentHTML('beforeend', ic('chev-r', 'u2-mute u2-card-chev')); });
      }
      const calendarBody = all.querySelector('#u2-fold-calendar .u2-fold-body');
      if (calendarBody) {
        const planner = home.querySelector('#planner');
        if (planner) calendarBody.appendChild(planner);
        if (user.retention) calendarBody.insertAdjacentHTML('beforeend', '<a class="u2-link u2-left" href="/calendar">Open the calendar</a>');
      }
      const recentBody = all.querySelector('#u2-fold-recent .u2-fold-body');
      if (recentBody) { const recent = home.querySelector('.recent-card'); if (recent) recentBody.appendChild(recent); }
      const extras = all.querySelector('#u2-fold-extras .u2-fold-body');
      const aside = home.querySelector('.home-aside');
      const tutorHost = home.querySelector('#tutor-host');
      if (aside) { while (aside.firstChild) extras.appendChild(aside.firstChild); }
      if (tutorHost) extras.appendChild(tutorHost);
    } else {
      document.getElementById('u2-all-subjects').querySelector('h2').hidden = true;
    }

    // What the old header did, in the one list.
    document.getElementById('u2-signout').addEventListener('click', () => { const b = document.getElementById('logout'); if (b) b.click(); });
    const theme = document.getElementById('u2-theme');
    if (!document.getElementById('theme-toggle')) theme.hidden = true;
    theme.addEventListener('click', () => {
      const b = document.getElementById('theme-toggle');
      if (b) b.click();
      const nowDark = document.documentElement.dataset.mode === 'dark';
      theme.querySelector('.u2-tile').innerHTML = ic(nowDark ? 'sun' : 'moon');
      theme.querySelector('b').textContent = nowDark ? 'Light theme' : 'Dark theme';
    });

    // Own material due: quiet if none or on any error.
    App.api.get('/api/materials/review-due').then((d) => {
      if (!d || !(d.total || d.cards_total)) return;
      const line = [d.total ? plural(d.total, 'skill') : '', d.cards_total ? plural(d.cards_total, 'flashcard') : ''].filter(Boolean).join(' and ');
      const t = document.querySelector('#u2-row-material .u2-row-t');
      if (t) t.insertAdjacentHTML('beforeend', `<small>${esc(line)} due</small>`);
    }).catch(() => {});
  }

  // ── which view ───────────────────────────────────────────────────────────
  function applyView(moveFocus) {
    const everything = location.hash === '#everything';
    document.documentElement.dataset.u2View = everything ? 'everything' : 'home';
    const menu = document.getElementById('u2-menu');
    const title = document.getElementById('u2-tb-t');
    if (menu) {
      menu.innerHTML = ic(everything ? 'x' : 'menu');
      menu.setAttribute('aria-label', everything ? 'Close everything' : 'Open everything');
      menu.setAttribute('href', everything ? '/dashboard' : '/dashboard#everything');
    }
    if (title) title.hidden = !everything;
    document.title = everything ? 'Everything | Savant' : 'Home | Savant';
    if (moveFocus) {
      window.scrollTo(0, 0);
      const target = document.getElementById(everything ? 'u2-all-title' : 'u2-title');
      if (target) target.focus({ preventScroll: true });
    }
  }
  App.ui2.onBar = () => {
    applyView(false);
    const menu = document.getElementById('u2-menu');
    if (menu) {
      menu.addEventListener('click', (ev) => {
        if (location.hash === '#everything') {
          ev.preventDefault();
          if (cameFromHome) history.back();
          else location.hash = '';
        } else {
          ev.preventDefault();
          cameFromHome = true;
          location.hash = 'everything';
        }
      });
    }
  };
  window.addEventListener('hashchange', () => { applyView(true); });

  // ── when js/dashboard.js has drawn ───────────────────────────────────────
  async function build() {
    if (built) return;
    built = true;
    document.documentElement.classList.add('u2-home-page');
    const progressReply = gets.get('/api/progress');
    try { progress = progressReply ? await progressReply : null; } catch { progress = null; }
    const planReply = gets.get('/api/plan/today');
    try { plan = planReply ? await planReply : null; } catch { plan = null; }
    const empty = root.querySelector('.empty-state');
    if (!empty) {
      const host = document.createElement('div');
      host.id = 'u2-home';
      root.insertBefore(host, root.firstChild);
      await drawHome();
    }
    buildAll();
    applyView(false);
    document.documentElement.classList.add('u2-ready');
  }
  const check = () => { if (root.querySelector('.home, .empty-state')) build(); };
  if (window.MutationObserver) new MutationObserver(check).observe(root, { childList: true });
}());
