/* Home and Everything (docs/UI-V2.md, structure A, "One next thing"). Loaded before js/dashboard.js when UI_V2 is on.
 *
 * js/dashboard.js runs untouched and draws today's page into #root, with every decision it always made: placement, checkpoints, a held Final, catch-ups, retake, the planner, the offers.
 * This file then shows that work two ways, on the one page:
 *
 *   Home        one task and one strong button, the giraffe beside it. Read from GET /api/plan/today, the same reply and the same first step as today's "Start" button;
 *               with no step (nothing due, the plan unavailable) it falls back to the lead card js/dashboard.js drew, with that card's own wording and link.
 *   Everything  /dashboard#everything: the real subject cards, planner, recent sessions, offers and the rest, moved into one menu. Moved, not copied, so their listeners keep working.
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
  const tile = (href, icon, title, extra = '', attrs = '') => `<a class="u2-opt" href="${href}" ${attrs}>${ic(icon)}<b>${esc(title)}</b>${extra}</a>`;
  const tileBtn = (id, icon, title, attrs = '') => `<button type="button" class="u2-opt" id="${id}" ${attrs}>${ic(icon)}<b>${esc(title)}</b></button>`;
  const opens = (panel) => `aria-expanded="false" aria-controls="${panel}" data-u2-panel="${panel}"`;
  const picker = () => `
    <div class="u2-picker" role="group" aria-label="Minutes you have today">
      <span class="u2-vh">I have</span>
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
  const shortName = (name) => (name === 'Mathematics' ? 'Math' : name);
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
    const note = sameAsLead && lead.detail && !/^0 of /.test(lead.detail) ? ` ${lead.detail}` : '';
    return {
      icon: symbol,
      eyebrow: `${e ? `${shortName(e.track.name)}, ` : ''}${first.kind === 'catchup' ? 'catch-up ' : ''}level ${first.level}`,
      title,
      detail: note.trim(),
      href: first.href,
      label: label.replace(/^Start lesson \d+$/, 'Start lesson'),
      strong: true,
      path,
      block: first,
    };
  }

  // ── Home ─────────────────────────────────────────────────────────────────
  /** The line under the button: what comes after, in the mockup's few words. */
  const nextWords = (b) => {
    const e = ((progress && progress.enrollments) || []).find((x) => x.id === b.enrollmentId);
    return b.kind !== 'break' && b.kind !== 'review' && !b.enforcer && !b.placement && e ? shortName(e.track.name) : stepName(b);
  };
  let homeGiraffe = null;
  function giraffeInto(slot) {
    if (!slot) return;
    if (!homeGiraffe) {
      homeGiraffe = document.createElement('button');
      homeGiraffe.type = 'button';
      homeGiraffe.id = 'u2-giraffe';
      const host = document.createElement('span');
      homeGiraffe.appendChild(host);
      App.ui2.look.giraffe(host, { crop: 'full', mood: 'idle' });
      App.ui2.look.bind(homeGiraffe);
    }
    slot.appendChild(homeGiraffe);
    document.documentElement.classList.add('u2-has-guide');
  }
  async function drawHome() {
    const host = document.getElementById('u2-home');
    if (!host) return;
    const req = ++focusReq;
    const focus = await focusOf();
    if (req !== focusReq) return;
    const blocks = (plan && plan.blocks) || [];
    const at = focus && focus.block ? blocks.indexOf(focus.block) : -1;
    const after = at >= 0 ? blocks.slice(at + 1) : [];
    const nextUp = after[0] || null;
    const say = focus ? 'Ready when you are.' : 'Nothing is due today.';
    host.innerHTML = `
      <div class="u2-focus">
        <div class="u2-big" id="u2-big"></div>
        <div class="u2-tx">
          <div class="u2-bubble u2-down"><b>${esc(say)}</b></div>
          ${focus ? `
            <p class="u2-meta">${esc(focus.eyebrow)}</p>
            <h1 class="u2-t1" tabindex="-1" id="u2-title">${esc(focus.title)}</h1>
            ${focus.detail ? `<p class="u2-m u2-detail">${esc(focus.detail)}</p>` : ''}` : ''}
          ${plan ? `<button type="button" class="u2-chip-t" id="u2-minutes" aria-haspopup="dialog" aria-label="${plan.minutes} minutes today. Change">${ic('clock')}${plan.minutes} min${ic('chev-d')}</button>` : ''}
          <div class="u2-go">
            ${focus && focus.href ? `<a class="${focus.strong ? 'u2-btn' : 'u2-btn2'}" id="u2-start" href="${esc(focus.href)}">${esc(focus.label)}</a>` : ''}
            ${blocks.length ? `<button type="button" class="u2-next" id="u2-peek" aria-haspopup="dialog">${nextUp ? `Next: ${esc(nextWords(nextUp))}, ${mins(nextUp.estMinutes)}` : 'Nothing else planned today'}</button>` : ''}
          </div>
        </div>
      </div>`;
    giraffeInto(document.getElementById('u2-big'));
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
    const recent = !!(progress && progress.recent && progress.recent.length);
    all.innerHTML = `
      <h1 class="u2-vh" tabindex="-1" id="u2-all-title">Everything</h1>
      <div class="u2-guide" id="u2-all-guide"><span id="u2-all-g"></span><div class="u2-tailwrap"><div class="u2-bubble">Where to next?</div></div></div>
      <div class="u2-all-body">
        <section id="u2-all-subjects"><h2 class="u2-vh">Your subjects</h2><div id="u2-subject-slot"></div><a class="u2-opt u2-all-add" href="/onboarding">${ic('plus')}<b>Add a subject</b></a></section>
        <section id="u2-all-plan" ${plan ? '' : 'hidden'}><h2 class="u2-time-h">Time today</h2><div id="u2-all-picker"></div></section>
        <section id="u2-all-else">
          <h2 class="u2-vh">Everything else</h2>
          <div class="u2-grid">
            ${reviewHref ? tile(reviewHref, 'loop', 'Review', due.length ? `<span class="u2-count" aria-label="${plural(due.length, 'skill')} due">${due.length}</span>` : '') : ''}
            ${tile('/my-material', 'note', 'My material', '', 'id="u2-row-material"')}
            ${tileBtn('u2-t-calendar', 'calendar', 'Calendar', opens('u2-panel-calendar'))}
            ${recent ? tileBtn('u2-t-recent', 'history', 'Sessions', opens('u2-panel-recent')) : ''}
            ${tile('/profile', 'user', 'Profile')}
            ${home ? tileBtn('u2-t-extras', 'chat', 'Tutor', opens('u2-panel-extras')) : ''}
            ${user.can_browse ? tile('/curriculum', 'book', 'Curriculum') : ''}
            ${user.is_admin ? tile('/game-lab', 'target', 'Game lab') + tile('/admin', 'settings', 'Admin') : ''}
            <button type="button" class="u2-opt" id="u2-theme">${ic(dark ? 'sun' : 'moon')}<b>${dark ? 'Light theme' : 'Dark theme'}</b></button>
            <button type="button" class="u2-opt" id="u2-signout">${ic('out')}<b>Sign out</b></button>
          </div>
          <div class="u2-panel" id="u2-panel-calendar" hidden></div>
          ${recent ? '<div class="u2-panel" id="u2-panel-recent" hidden></div>' : ''}
          ${home ? '<div class="u2-panel" id="u2-panel-extras" hidden></div>' : ''}
        </section>
      </div>`;
    root.appendChild(all);
    drawAllPicker();

    if (home) {
      // The real parts, moved: their listeners are on these nodes and go with them.
      const cards = home.querySelector('.subject-cards');
      if (cards) {
        document.getElementById('u2-subject-slot').appendChild(cards);
        cards.querySelectorAll('.subject-card').forEach((c) => { c.insertAdjacentHTML('beforeend', ic('chev-r', 'u2-mute u2-card-chev')); });
      }
      const calendarBody = all.querySelector('#u2-panel-calendar');
      if (calendarBody) {
        const planner = home.querySelector('#planner');
        if (planner) calendarBody.appendChild(planner);
        if (user.retention) calendarBody.insertAdjacentHTML('beforeend', '<a class="u2-a" href="/calendar">Open the calendar</a>');
      }
      const recentBody = all.querySelector('#u2-panel-recent');
      if (recentBody) { const recent = home.querySelector('.recent-card'); if (recent) recentBody.appendChild(recent); }
      const extras = all.querySelector('#u2-panel-extras');
      extras.insertAdjacentHTML('afterbegin', '<button type="button" class="u2-a" id="u2-talk" style="background:none;border:0;cursor:pointer">Talk to your tutor</button>');
      extras.querySelector('#u2-talk').addEventListener('click', () => { const d = document.querySelector('.tdock-g-btn'); if (d) d.click(); });
      const aside = home.querySelector('.home-aside');
      const tutorHost = home.querySelector('#tutor-host');
      if (aside) { while (aside.firstChild) extras.appendChild(aside.firstChild); }
      if (tutorHost) extras.appendChild(tutorHost);
    }

    // The menu's own giraffe. Tiles that hold more open a panel under the grid.
    const gSlot = document.getElementById('u2-all-g');
    const gBtn = document.createElement('button');
    gBtn.type = 'button';
    const gHost = document.createElement('span');
    gBtn.appendChild(gHost);
    gSlot.replaceWith(gBtn);
    App.ui2.look.giraffe(gHost, { crop: window.matchMedia('(min-width: 768px) and (max-width: 1024px)').matches ? 'full' : 'bust' });
    App.ui2.look.bind(gBtn);
    all.querySelectorAll('[data-u2-panel]').forEach((t) => t.addEventListener('click', () => {
      const open = t.getAttribute('aria-expanded') !== 'true';
      all.querySelectorAll('[data-u2-panel]').forEach((o) => {
        o.setAttribute('aria-expanded', String(o === t && open));
        const p = document.getElementById(o.dataset.u2Panel);
        if (p) p.hidden = !(o === t && open);
      });
    }));

    // What the old header did, in the one list.
    document.getElementById('u2-signout').addEventListener('click', () => { const b = document.getElementById('logout'); if (b) b.click(); });
    const theme = document.getElementById('u2-theme');
    if (!document.getElementById('theme-toggle')) theme.hidden = true;
    theme.addEventListener('click', () => {
      const b = document.getElementById('theme-toggle');
      if (b) b.click();
      const nowDark = document.documentElement.dataset.mode === 'dark';
      theme.querySelector('svg').outerHTML = ic(nowDark ? 'sun' : 'moon');
      theme.querySelector('b').textContent = nowDark ? 'Light theme' : 'Dark theme';
    });

    // Own material due: quiet if none or on any error.
    App.api.get('/api/materials/review-due').then((d) => {
      if (!d || !(d.total || d.cards_total)) return;
      const line = [d.total ? plural(d.total, 'skill') : '', d.cards_total ? plural(d.cards_total, 'flashcard') : ''].filter(Boolean).join(' and ');
      const t = document.querySelector('#u2-row-material');
      if (t) { t.insertAdjacentHTML('beforeend', `<span class="u2-count" aria-hidden="true">${(d.total || 0) + (d.cards_total || 0)}</span>`); t.setAttribute('aria-label', `My material, ${line} due`); }
    }).catch(() => {});
  }

  // ── which view ───────────────────────────────────────────────────────────
  function applyView(moveFocus) {
    const everything = location.hash === '#everything';
    document.documentElement.dataset.u2View = everything ? 'everything' : 'home';
    const menu = document.getElementById('u2-menu');
    if (menu) {
      menu.innerHTML = ic(everything ? 'x' : 'menu');
      menu.setAttribute('aria-label', everything ? 'Close everything' : 'Open everything');
      menu.setAttribute('href', everything ? '/dashboard' : '/dashboard#everything');
    }
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
    } else {
      const big = document.createElement('div');
      big.className = 'u2-big';
      empty.insertBefore(big, empty.firstChild);
      giraffeInto(big);
      const main = empty.querySelector('.btn-primary');
      if (main) main.insertAdjacentHTML('afterend', '<a class="u2-btn2" href="/my-material">My material</a>');
    }
    buildAll();
    applyView(false);
    document.documentElement.classList.add('u2-ready');
  }
  const check = () => { if (root.querySelector('.home, .empty-state')) build(); };
  if (window.MutationObserver) new MutationObserver(check).observe(root, { childList: true });
}());
