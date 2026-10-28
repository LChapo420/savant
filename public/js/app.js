/* Shared client helpers: the API wrapper, the header, toasts, and formatting.
 *
 * The content security policy forbids inline script, so every page loads its own
 * module file and wires events with addEventListener — never an on* attribute.
 */
(function () {
  const api = {
    async request(method, path, body) {
      const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
      });
      let payload = null;
      try { payload = await res.json(); } catch { payload = null; }
      if (!res.ok) {
        const err = new Error((payload && payload.error) || `Request failed (${res.status})`);
        err.status = res.status;
        err.payload = payload;
        throw err;
      }
      return payload;
    },
    get(path) { return api.request('GET', path); },
    post(path, body) { return api.request('POST', path, body); },
    del(path) { return api.request('DELETE', path); },
  };

  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v);
    }
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Toasts are read out by screen readers: the host is a polite live region,
  // and an error toast is an alert. A live region has to be in the page before
  // text lands in it, so the first toast waits a beat after creating the host.
  //
  // An error toast stays until the learner dismisses it (UX_TOAST_STAY, on by
  // default; WCAG 2.2.1 and 4.1.3, and Ceaparu et al. 2004 on error messages as a
  // leading frustration): a sighted learner who looks away for five seconds would
  // otherwise never see what went wrong. At most three stay at once; the same
  // message is not stacked twice. An info toast still fades after 3.2 s.
  let toastHost = null;
  const MAX_STAYING_TOASTS = 3;
  function toast(message, kind) {
    let fresh = false;
    if (!toastHost) {
      toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastHost);
      fresh = true;
    }
    const stays = kind === 'error' && !(window.App && window.App.ux && window.App.ux.toast_stay === false);
    const text = String(message == null ? '' : message);
    const node = el('div', {
      class: `toast${kind === 'error' ? ' toast-error' : ''}${stays ? ' toast-stay' : ''}`,
      role: kind === 'error' ? 'alert' : null,
      dataset: stays ? { text } : null,
    }, stays
      ? `<span class="toast-text">${escapeHtml(text)}</span><button class="toast-close" type="button" aria-label="Dismiss this message">${window.icon ? window.icon('x') : '&times;'}</button>`
      : escapeHtml(text));
    if (stays) node.querySelector('.toast-close').addEventListener('click', () => node.remove());
    const add = () => {
      // The same message is not stacked twice (checked here: the first toast waits a beat for the live region).
      if (stays && [...toastHost.querySelectorAll('.toast-stay')].some((n) => n.dataset.text === text)) return;
      toastHost.appendChild(node);
      if (stays) {
        const staying = toastHost.querySelectorAll('.toast-stay');
        for (let i = 0; i < staying.length - MAX_STAYING_TOASTS; i += 1) staying[i].remove();
      } else {
        setTimeout(() => node.remove(), kind === 'error' ? 5200 : 3200);
      }
    };
    if (fresh) setTimeout(add, 60); else add();
  }

  /**
   * Say something to a screen reader without showing it: answer verdicts and
   * the like. One polite region for the page, made on first use; the text is
   * cleared and set on the next tick so the same words twice are read twice.
   */
  let liveRegion = null;
  function announce(text) {
    if (!liveRegion) {
      liveRegion = el('div', { class: 'visually-hidden', id: 'a11y-live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
      document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = '';
    setTimeout(() => { liveRegion.textContent = String(text || ''); }, 60);
  }

  // A "Skip to content" link as the first thing a keyboard reaches on every
  // page, pointing at the page's <main> (given an id and made focusable).
  function addSkipLink() {
    const main = document.querySelector('main');
    if (!main || document.querySelector('.skip-link')) return;
    if (!main.id) main.id = 'main';
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    const link = el('a', { class: 'skip-link', href: `#${main.id}` }, 'Skip to content');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      main.focus();
      main.scrollIntoView();
    });
    document.body.prepend(link);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSkipLink);
  else addSkipLink();

  /*
   * Keep keyboard focus when a page redraws itself. The players and result
   * screens replace their markup with innerHTML, so the button just pressed
   * vanishes and focus falls to <body>: the next Tab starts again at the top of
   * the page. When that happens, focus moves to the first heading the redraw
   * brought in (made focusable with tabindex="-1"), which is also what a
   * screen reader then reads. It waits a moment so a page that places focus
   * itself (the question player does) wins, and it does nothing on page load or
   * when focus was never inside the page.
   */
  let lastFocused = null;
  let focusLost = false;
  document.addEventListener('focusin', (event) => { lastFocused = event.target; focusLost = false; });
  function focusIsLost() {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return false;
    return !!lastFocused && (!lastFocused.isConnected || lastFocused.disabled);
  }
  function watchRedraws() {
    const main = document.querySelector('main');
    if (!main || !window.MutationObserver) return;
    const observer = new MutationObserver((records) => {
      if (!focusLost && !focusIsLost()) return;
      focusLost = true;
      let heading = null;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          heading = node.matches('h1, h2, h3') ? node : node.querySelector('h1, h2, h3');
          if (heading) break;
        }
        if (heading) break;
      }
      if (!heading) return;
      setTimeout(() => {
        if (!focusLost || !heading.isConnected) return;
        const active = document.activeElement;
        if (active && active !== document.body && active !== document.documentElement) { focusLost = false; return; }
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }, 80);
    });
    observer.observe(main, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchRedraws);
  else watchRedraws();

  const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;

  function timeAgo(iso) {
    if (!iso) return 'never';
    const secs = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (secs < 90) return 'just now';
    const mins = secs / 60;
    if (mins < 60) return `${Math.round(mins)} min ago`;
    const hours = mins / 60;
    if (hours < 24) return `${Math.round(hours)}h ago`;
    const days = hours / 24;
    if (days < 30) return `${Math.round(days)}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  /**
   * What a checkpoint is called.
   *
   * A copy of `config/curriculum.js`'s table, and the server sends a label on
   * every level it names, so this is only the fallback for something the server
   * did not label. It is written as a lookup with a real default rather than a
   * closed table, because a grade that states its own layout may name a kind this
   * page has never heard of — and an unknown kind must read as itself, not as
   * `undefined` in a heading.
   */
  const CHECKPOINT_LABEL = {
    master: 'Master quiz',
    grand: 'Grand Master quiz',
    graduation: 'Graduation exam',
    essay: 'Essay',
    grand_essay: 'Grand Master essay',
  };

  /** What a level is, for every kind the curriculum defines. */
  const LEVEL_LABEL = {
    practice: 'Practice',
    lesson: 'Lesson',
    master: 'Master quiz',
    grand: 'Grand Master quiz',
    graduation: 'Graduation exam',
    essay: 'Essay',
  };

  const LEVEL_ICON = {
    practice: 'target',
    lesson: 'book-open',
    master: 'flag',
    grand: 'award',
    graduation: 'graduation',
    essay: 'edit',
  };

  /** A level's name, falling back to the kind's own name rather than to nothing. */
  const levelName = (kind) => LEVEL_LABEL[kind]
    || CHECKPOINT_LABEL[kind]
    || (kind ? String(kind).replace(/_/g, ' ') : 'Level');

  /** A level's icon, falling back to the generic one. */
  const levelIcon = (kind) => LEVEL_ICON[kind] || 'target';

  /**
   * Is this kind one that can fail?
   *
   * There were five copies of this list in the browser, and two of them — the
   * dashboard's — left out `essay`. So an English learner standing on a written
   * Master had their dashboard card render as a plain lesson, with no warning and
   * no button to take it, while every other page called it an essay. Each copy
   * was correct about the kinds it knew and silent about the one it did not.
   *
   * The server decides, on every level it sends, and the decision is a boolean
   * rather than a list: `node.checkpoint` is already set. So this reads that
   * where there is a node, and for a bare kind falls back to the label tables,
   * which now tolerate a kind neither list has heard of.
   *
   * @param {object} node a level from the API, with `checkpoint` set
   * @returns {boolean}
   */
  const isCheckpointLevel = (node) => (node && typeof node === 'object'
    ? !!node.checkpoint
    : !!(node && (CHECKPOINT_LABEL[node] || node === 'master' || node === 'grand'
      || node === 'graduation' || node === 'essay')));

  /**
   * One sentence describing how a path is laid out.
   *
   * It used to be built from the spacing — "every 10th level is a lesson, every
   * 25th a Master quiz" — and there were two copies of it, one per page, each
   * with a branch for a grade that states its own levels. Both sentences were
   * arithmetic dressed as fact, and neither could be true of a layout that is
   * stated rather than regular: a grade with a lesson on 7, a quiz on 8 and a
   * review on 21 fits no sentence either version could write.
   *
   * So the sentence now says only what is true of any layout — that the levels
   * are set out, that quizzes sit where the course put them, and what the last
   * level is — and the table beneath it carries the specifics, as levels from the
   * server.
   *
   * @param {object} checkpoints the `checkpoints` block from the API
   * @returns {string} a sentence
   */
  const layoutSentence = (checkpoints) => {
    const next = (checkpoints && checkpoints.next) || {};
    const end = next.end;
    const tail = end == null ? '' : ` The last, level ${end}, is the Graduation exam.`;
    if (checkpoints && checkpoints.stated_lessons) {
      return `This course sets out its own levels: each lesson is taught on the level it is written for, and each quiz sits where the course put it. The next few are below.${tail}`;
    }
    return 'Each level of this path is a lesson, a quiz, or practice at the level\'s difficulty, in that order. The next few are below.' + tail;
  };

  /**
   * Render the site header. `active` matches a nav key; when `user` is null the
   * header shows the visitor links instead.
   */
  // ── theme hooks ─────────────────────────────────────────────────────────
  // <html data-theme> forces light or dark (otherwise the system decides), and
  // <html data-audience="kids"> switches on the playful variant of the design.
  // There is no age field on an account yet, so the audience comes from
  // `user.audience` when the server starts sending one, or from `?audience=kids`
  // (remembered on this device) so the variant can be previewed. Both are read
  // with try/catch: private browsing can refuse localStorage.
  const THEME_KEY = 'polymath.theme';
  const AUDIENCE_KEY = 'polymath.audience';
  function store(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch { /* not kept; the page still works */ }
  }
  function stored(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  // js/style-boot.js (loaded in every page's <head>) already resolved the style
  // and the mode before first paint; window.SavantStyle is its API. A page that
  // does not load it (the sealed Spanish evidence pages) keeps the older
  // behaviour: data-theme forced from localStorage, otherwise the system's.
  const Style = window.SavantStyle || null;
  function applyTheme(theme) {
    if (Style) return;
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }
  function currentTheme() {
    if (Style) return Style.state().mode;
    const forced = document.documentElement.dataset.theme;
    if (forced) return forced;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  // The toggle's name says what pressing it does.
  function themeLabel() {
    return currentTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
  function applyAudience(user) {
    const asked = new URLSearchParams(window.location.search).get('audience');
    if (asked === 'kids' || asked === 'adult') store(AUDIENCE_KEY, asked === 'kids' ? 'kids' : null);
    const audience = (user && user.audience) || stored(AUDIENCE_KEY);
    if (audience === 'kids') document.documentElement.dataset.audience = 'kids';
    else delete document.documentElement.dataset.audience;
  }
  applyTheme(stored(THEME_KEY));
  applyAudience(null);

  // The phone's tab bar, and the icon each nav entry gets there.
  const TAB_ICON = {
    dashboard: 'home', learn: 'book-open', review: 'cards', profile: 'user',
    subjects: 'compass', calendar: 'calendar', curriculum: 'list', games: 'target', admin: 'settings',
  };

  /*
   * The signed-in navigation: four core destinations (the phone's tab bar and
   * the top of the desktop sidebar) and a few extras (the sidebar only).
   * Learn and Review need an enrollment; the dashboard remembers the subject it
   * is leading with (localStorage "savant.lead") and these follow it, falling
   * back to the subject chooser and the retention calendar.
   */
  const LEAD_KEY = 'savant.lead';
  function setLead(enrollmentId) { store(LEAD_KEY, enrollmentId ? String(enrollmentId) : null); }
  function navFor(user) {
    const lead = Number(stored(LEAD_KEY)) || 0;
    return {
      core: [
        ['dashboard', 'Home', '/dashboard'],
        ['learn', 'Learn', lead ? `/path?enrollment=${lead}` : '/onboarding'],
        ['review', 'Review', lead ? `/review?enrollment=${lead}` : (user.retention ? '/calendar' : '/dashboard')],
        ['profile', 'Profile', '/profile'],
      ],
      extra: [
        ['subjects', 'Add a subject', '/onboarding'],
        ...(user.retention ? [['calendar', 'Calendar', '/calendar']] : []),
        // Read-only: every subject, every grade, every level. Offered only to an
        // account that can browse, and the route asks again, so hiding the link
        // here is a courtesy rather than the thing that holds.
        ...(user.can_browse ? [['curriculum', 'Curriculum', '/curriculum']] : []),
        ...(user.is_admin ? [['games', 'Game lab', '/game-lab']] : []),
        ...(user.is_admin ? [['admin', 'Admin', '/admin']] : []),
      ],
    };
  }
  /** Which core tab a page belongs to; most pages say 'dashboard', so the path decides. */
  function coreKey(active) {
    const path = window.location.pathname;
    if (active === 'subjects') return 'learn';
    if (active === 'calendar') return 'review';
    if (active === 'dashboard' || active == null) {
      if (/^\/(path|session|base-lesson|placement|skip|skill-practice|stage-|help|subject-placement)/.test(path)) return 'learn';
      if (/^\/(review|enforcer|held)/.test(path)) return 'review';
    }
    return active;
  }

  /*
   * Engagement and UX settings from the server (config/ux.js, `user.ux`), kept on
   * App.ux, plus whether this learner (or their parent) hid the streak and XP.
   * Hiding only changes what is drawn; the numbers are still counted. The data
   * attributes let the CSS follow: 44 px targets stay on unless the switch is off.
   */
  const TZ_NAME = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
  let tzSent = false;
  const STAT_LABELS = /^(XP|Total XP|Days in a row|Day streak|Streak)$/i;
  let statsObserver = null;
  // Rows of a "facts" list that show XP or the streak (the outcome cards of a
  // sitting, a review, an enforcer, the profile) are taken out of view when hidden.
  function sweepStats(root) {
    (root || document).querySelectorAll('dl.facts > div').forEach((row) => {
      const dt = row.querySelector('dt');
      if (dt && STAT_LABELS.test(dt.textContent.trim())) row.classList.add('hidden');
    });
  }
  function applyUx(user) {
    const ux = (user && user.ux) || {};
    window.App.ux = ux;
    const hide = !!(user && user.hide_stats);
    window.App.hideStats = hide;
    window.App.breakOff = !!(user && user.break_nudge_off);
    // The style saved to the account wins over this device's copy (js/style-boot.js).
    if (user && user.style_pref && Style) Style.adopt(user.style_pref);
    const root = document.documentElement;
    if (ux.touch44 === false) root.dataset.touch44 = 'off'; else delete root.dataset.touch44;
    if (hide) root.dataset.hideStats = 'on'; else delete root.dataset.hideStats;
    if (hide && !statsObserver && window.MutationObserver) {
      statsObserver = new MutationObserver(() => sweepStats(document));
      statsObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (!hide && statsObserver) { statsObserver.disconnect(); statsObserver = null; }
    if (hide) sweepStats(document);
    // The browser's time zone, kept so the streak counts the learner's own day.
    if (user && user.id && TZ_NAME && !tzSent && user.client_tz !== TZ_NAME) {
      tzSent = true;
      api.post('/api/prefs', { tz: TZ_NAME }).catch(() => {});
    }
  }

  function header(user, active) {
    const host = document.getElementById('header');
    if (!host) return;
    applyAudience(user);
    applyUx(user);
    consentLine(user);
    const navs = user ? navFor(user) : null;
    const guestNav = [['how', 'How it works', '/#how'], ['subjects', 'Subjects', '/#subjects']];
    const tabKey = coreKey(active);

    // A streak or XP of zero is not an achievement, so it is not shown.
    // Nothing is drawn at all when the learner (or their parent) hid them.
    const streak = user && user.hide_stats ? 0 : (Number(user && user.streak) || 0);
    const xp = user && user.hide_stats ? 0 : (Number(user && user.xp) || 0);
    const streakTip = user && user.ux && user.ux.streak_local_grace
      ? 'Day streak. Your own calendar day counts, and one missed day a week is forgiven.' : 'Day streak';
    // The sun/moon button flips light and dark, which is "Auto" (chunky by day,
    // night by dark). A style picked in Profile is a whole look, so the button
    // steps aside until Auto is chosen again.
    const autoStyle = !Style || Style.state().pref === 'auto';
    const toggleBtn = autoStyle
      ? `<button class="icon-btn" id="theme-toggle" type="button" title="${themeLabel()}" aria-label="${themeLabel()}">${window.icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>`
      : '';
    const link = ([key, label, href], current, cls) =>
      `<a href="${href}" class="${cls || ''}${key === current ? ' active' : ''}"${key === current ? ' aria-current="page"' : ''}>`
      + `<span class="nav-ic">${window.icon(TAB_ICON[key] || 'chevron-right')}</span><span class="nav-label">${label}</span></a>`;
    host.innerHTML = `
      <div class="wrap">
        <a class="brand" href="${user ? '/dashboard' : '/'}">${brandMark()}<span class="brand-name">${escapeHtml(BRAND.name)}</span></a>
        <nav class="nav${user ? ' has-tabbar' : ''}" aria-label="Main">
          ${user
            ? navs.core.map((n) => link(n, tabKey)).join('')
              + (navs.extra.length ? `<span class="nav-group-label" aria-hidden="true">More</span>` + navs.extra.map((n) => link(n, active, 'is-extra')).join('') : '')
            : guestNav.map(([key, label, href]) =>
              `<a href="${href}" class="${key === active ? 'active' : ''}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
        </nav>
        <span class="spacer"></span>
        ${user ? `
          <div class="header-stats">
            ${streak ? `<span class="stat-pill is-streak" title="${streakTip}">${window.icon('flame')}<span class="num">${streak}</span><span class="unit">day${streak === 1 ? '' : 's'} in a row</span></span>` : ''}
            ${xp ? `<span class="stat-pill is-xp" title="Total XP">${xp}<span class="unit"> XP</span></span>` : ''}
          </div>
          <div class="header-actions">
            ${toggleBtn}
            <button class="btn btn-ghost btn-sm keep-icon" id="logout" type="button" aria-label="Sign out">${window.icon('log-out')}<span class="btn-label">Sign out</span></button>
          </div>
        ` : `
          <div class="header-actions">
            ${toggleBtn}
            <a class="btn btn-ghost btn-sm" href="/login">Sign in</a>
            <a class="btn btn-primary btn-sm" href="/register">Find your level</a>
          </div>
        `}
      </div>`;

    // The tab bar lives outside the header so it can sit at the bottom of the
    // screen; it is drawn on every page that has a signed-in header and shown
    // only at 1024px and below (and never inside a question player; see the CSS).
    let tabbar = document.getElementById('tabbar');
    if (user) {
      if (!tabbar) {
        tabbar = el('nav', { id: 'tabbar', class: 'tabbar', 'aria-label': 'Main' });
        document.body.appendChild(tabbar);
      }
      tabbar.innerHTML = navs.core.map(([key, label, href]) => `
        <a href="${href}" class="${key === tabKey ? 'active' : ''}"${key === tabKey ? ' aria-current="page"' : ''}>
          <span class="tab-ic">${window.icon(TAB_ICON[key] || 'chevron-right')}</span>${label}
        </a>`).join('');
      document.body.classList.add('has-tabbar');
    } else if (tabbar) {
      tabbar.remove();
      document.body.classList.remove('has-tabbar');
    }

    // The study session strip and its heartbeat (public/js/study.js), on every signed-in page.
    if (user && user.retention && !window.Study && !document.getElementById('study-js')) {
      const script = el('script', { id: 'study-js', src: '/js/study.js', defer: '' });
      document.body.appendChild(script);
    }

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        if (Style) Style.setTheme(next); else { applyTheme(next); store(THEME_KEY, next); }
        toggle.innerHTML = window.icon(next === 'dark' ? 'sun' : 'moon');
        toggle.setAttribute('aria-label', themeLabel());
        toggle.title = themeLabel();
        announce(`${next === 'dark' ? 'Dark' : 'Light'} theme on`);
      });
    }

    const logout = document.getElementById('logout');
    if (logout) {
      logout.addEventListener('click', async () => {
        try { await api.post('/api/auth/logout', {}); } catch { /* signing out locally regardless */ }
        window.location.href = '/';
      });
    }
  }

  /** Current user or null. Pages that require an account pass { require: true }. */
  async function currentUser(opts) {
    let user = null;
    try {
      const data = await api.get('/api/auth/me');
      user = data.user;
    } catch { user = null; }
    if (!user && opts && opts.require) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return null;
    }
    if (user && consentDetour(user)) return null;
    if (user) applyUx(user);
    return user;
  }

  /* ── age and parental consent (routes/consent.js) ────────────────────────
   * An account from before the age screen is asked once, on the subjects page;
   * a child account a parent turned off (or one waiting, when the server is set
   * to lock until consent) goes to the page that explains it. The server
   * enforces both; this only saves a page of refused requests. */
  const CONSENT_FREE = /^\/(onboarding|parent[a-z-]*|privacy)(\.html)?$/;
  function consentDetour(user) {
    if (CONSENT_FREE.test(window.location.pathname)) return false;
    if (user.consent && user.consent.locked) { window.location.href = '/parent-needed'; return true; }
    if (user.age_needed) { window.location.href = '/onboarding'; return true; }
    return false;
  }

  /** One line under the header while a child account waits for a parent. */
  function consentLine(user) {
    const old = document.getElementById('consent-line');
    if (old) old.remove();
    const c = user && user.consent;
    if (!c || c.state !== 'pending' || /^\/parent-needed/.test(window.location.pathname)) return;
    const host = document.getElementById('header');
    if (!host) return;
    const line = el('div', { id: 'consent-line', class: 'consent-line', role: 'status' },
      `<div class="wrap">Waiting for a parent or guardian to agree. Camera, microphone and AI chat stay off until then. <a href="/parent-needed">What this means</a></div>`);
    host.after(line);
  }

  function query(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /** Run after the DOM is ready, and surface a thrown error instead of a blank page. */
  function mount(fn) {
    const run = () => Promise.resolve().then(fn).catch((err) => {
      console.error(err);
      const main = document.querySelector('main') || document.body;
      main.prepend(el('div', { class: 'notice notice-error' },
        `${escapeHtml(err.message || 'Something went wrong.')}`));
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  /* ── the brand, in one place ─────────────────────────────────────────────
   * The product's name is not final (docs/PRODUCT-DECISIONS.md), so the name
   * and the mark live here and nowhere else in the chrome. The mark is three
   * ruler ticks of rising height on a baseline, in ink. */
  const BRAND = { name: 'Savant' };
  function brandMark() {
    // The Savant logo, the same in every style: the profile picture's three white
    // bars on a baseline, on its blue tile (site/brand/savant-logo-blue.svg, scaled to 32).
    return '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false">'
      + '<rect class="sv-tile" width="32" height="32" rx="7"/>'
      + '<g class="sv-bars"><rect x="8.69" y="22.91" width="14.63" height="1.22"/>'
      + '<rect x="9.5" y="17.63" width="1.95" height="5.69"/><rect x="15.03" y="13.56" width="1.95" height="9.75"/>'
      + '<rect x="20.55" y="8.69" width="1.95" height="14.63"/></g>'
      + '</svg></span>';
  }

  /* ── subjects ────────────────────────────────────────────────────────────
   * Each subject has a two-letter symbol, set like an element in a periodic
   * table, and a colour that comes from `data-subject` in the CSS. */
  const SYMBOL = {
    math: 'Ma', english: 'En', reading: 'Rd', iq: 'Iq', act: 'Ac', spanish: 'Es', chess: 'Ch', piano: 'Pi', basketball: 'Bb',
  };
  const subjectId = (track) => String((track && typeof track === 'object' ? track.id : track) || '');
  function symbol(track, opts = {}) {
    const id = subjectId(track);
    const sym = SYMBOL[id] || (id.charAt(0).toUpperCase() + id.charAt(1)) || '?';
    return `<span class="symbol${opts.size ? ` symbol-${opts.size}` : ''}" data-subject="${escapeHtml(id)}" aria-hidden="true">${escapeHtml(sym)}${
      opts.count != null ? `<small>${escapeHtml(opts.count)}</small>` : ''}</span>`;
  }

  /** "Numbers to 10 — Kindergarten, first half" as [main, rest], for display without the dash. */
  function gradeParts(name) {
    const parts = String(name || '').split(/\s+[—–]\s+/);
    return [parts[0] || '', parts.slice(1).join(', ')];
  }
  const gradeLabel = (name) => gradeParts(name).filter(Boolean).join(', ');
  /** A sentence the server wrote with " — " between a grade's name and its band, read without the dash. */
  const noDash = (text) => String(text == null ? '' : text).replace(/\s+[—–]\s+/g, ', ');

  /*
   * Titles, cleaned for display. The stored titles follow the content
   * convention ("Activity 3 of 9 (quiz/game): Match Objects - Counting to 10",
   * "lesson-(Counting Collections)"); a learner reads only the part that names
   * the level, with its kind as a quiet word beside it. Nothing is changed on
   * the server.
   */
  function cleanTitle(text) {
    let t = String(text == null ? '' : text).trim();
    const slug = t.match(/^lesson-\((.*)\)$/i);
    if (slug) t = slug[1].trim();
    // Stored titles join a name and its band with " — " ("Final: Grade 2 — Rules
    // Learner"); shown with a comma, like gradeLabel.
    return noDash(t);
  }
  function levelParts(node, lessonTitles) {
    const raw = cleanTitle(node.level_title || node.topic || '');
    const type = String(node.type || '');
    let title = raw;
    let kind = '';
    const m = title.match(/^(Activity|Tester|Lesson|Practice|Game|Quiz)\s+\d+\s+of\s+\d+(?:\s*\(([^)]*)\))?\s*:\s*/i);
    if (m) {
      title = title.slice(m[0].length);
      const word = m[1].toLowerCase();
      const tag = String(m[2] || '').toLowerCase();
      kind = word === 'tester' ? 'Check' : tag.includes('retention') ? 'Review' : word === 'lesson' ? 'Lesson' : 'Practice';
    }
    const summary = title.match(/^Summary\s*:\s*/i);
    if (summary) { title = title.slice(summary[0].length).replace(/\s+\+\s+/g, ', '); kind = 'Summary'; }
    // " - <the lesson this activity belongs to>" repeats the unit heading.
    const dash = title.lastIndexOf(' - ');
    if (dash > 0) {
      const tail = title.slice(dash + 3).trim();
      if (!lessonTitles || lessonTitles.has(tail) || m) title = title.slice(0, dash).trim();
    }
    title = title.replace(/^Entry Check, Part (\d+) of (\d+)$/i, 'Entry check, part $1 of $2');
    if (!kind) {
      if (node.checkpoint) kind = '';
      else if (node.kind === 'lesson' || /^lesson$/i.test(type)) kind = 'Lesson';
      else if (/tester/i.test(type)) kind = 'Check';
      else if (type && !/activity/i.test(type)) kind = type;
      else kind = 'Practice';
    }
    if (!title) {
      title = node.checkpoint ? levelName(node.delivered || node.checkpoint) : (kind || levelName(node.kind));
      if (title === kind) kind = '';
    }
    return { title, kind };
  }

  /*
   * The scale: a ruler from the first level to the last, with checkpoints as
   * shapes on it and a "You" marker in the subject's colour. The one device the
   * app repeats, on the dashboard, the path, the placement result and the
   * player.
   *
   * @param {object} o
   *   from, to       the ends (levels)
   *   you            where the learner is (omit for none)
   *   ticks          [{ at, kind: 'master'|'grand'|'grad'|'plain', label, done }]
   *   subject        track id, for the colour
   *   caption        a sentence under it (also what a screen reader hears)
   *   compact        the small version, for a row
   *   arriving       the You marker slides in from the start, once
   */
  function scale(o) {
    const from = o.from != null && Number.isFinite(Number(o.from)) ? Number(o.from) : 1;
    const to = Math.max(Number(o.to) || from + 1, from + 1);
    const clamp = (x) => Math.min(to, Math.max(from, Number(x)));
    const pctOf = (at) => ((clamp(at) - from) / (to - from)) * 100;
    // The rule is a percentage of a narrow phone column, so labels need a wider gap there
    // or three-digit numbers run together.
    const narrow = typeof window !== 'undefined' && window.innerWidth < 600;
    const gap = o.compact ? 14 : narrow ? 11 : 6;
    let ticks = (o.ticks || []).filter((t) => t && Number.isFinite(Number(t.at)) && t.at >= from && t.at <= to)
      .map((t) => ({ ...t, at: Number(t.at) }))
      .sort((a, b) => a.at - b.at);
    if (!ticks.some((t) => t.at === to)) ticks.push({ at: to, kind: 'plain', label: String(to) });
    // Labels that would collide are left off; the shapes stay.
    const end = ticks[ticks.length - 1];
    let lastShown = -100;
    ticks = ticks.map((t) => {
      const p = pctOf(t.at);
      const show = t === end || (p - lastShown >= gap && pctOf(end.at) - p >= gap && p >= gap * 0.7);
      if (show) lastShown = p;
      return { ...t, p, show };
    });
    const firstShown = ticks.find((t) => t.show);
    const showStart = !firstShown || firstShown.p >= gap;
    const edge = (p) => (p < 3 ? ' is-edge-l' : p > 97 ? ' is-edge-r' : '');
    const hasYou = o.you != null && Number.isFinite(Number(o.you));
    const youP = hasYou ? pctOf(o.you) : 0;
    const youEdge = youP < 6 ? ' is-edge-l' : youP > 94 ? ' is-edge-r' : '';
    const caption = o.caption || '';
    return `
      <figure class="scale${o.compact ? ' scale-compact' : ''}${o.arriving ? ' is-arriving' : ''}"${o.subject ? ` data-subject="${escapeHtml(subjectId(o.subject))}"` : ''} style="--from:${from};--to:${to}">
        <div class="scale-rule" aria-hidden="true">
          ${hasYou ? `<span class="scale-done" style="--at:${clamp(o.you)}"></span>` : ''}
          ${showStart ? `<span class="scale-start"><span class="scale-num">${from}</span></span>` : ''}
          ${ticks.map((t) => `<span class="scale-tick is-${t.kind || 'plain'}${t.done ? ' is-done' : ''}${edge(t.p)}" style="--at:${t.at}"><span class="scale-glyph"></span>${
            t.show ? `<span class="scale-num">${escapeHtml(t.label != null ? t.label : t.at)}</span>` : ''}</span>`).join('')}
          ${hasYou ? `<span class="scale-you${youEdge}" style="--at:${clamp(o.you)}"><span class="scale-you-label"><span>You</span><b>${escapeHtml(o.youLabel != null ? o.youLabel : o.you)}</b></span></span>` : ''}
        </div>
        ${caption ? `<figcaption>${caption}</figcaption>` : ''}
      </figure>`;
  }

  /** Ticks for a scale from the path's levels: every checkpoint, and the end. */
  function checkpointTicks(nodes, end, current) {
    const ticks = [];
    for (const n of nodes || []) {
      if (!n || !n.checkpoint) continue;
      const k = n.delivered || n.checkpoint || n.kind;
      ticks.push({ at: n.level, kind: k === 'grand' ? 'grand' : k === 'graduation' ? 'grad' : 'master', done: current != null && n.level < current });
    }
    if (end != null && !ticks.some((t) => t.at === Number(end))) ticks.push({ at: Number(end), kind: 'grad' });
    return ticks;
  }

  /**
   * A threshold meter: a value against the mark it has to reach.
   * @param {object} o  label, value, target, max (default 1), unit ('pct' | 'count')
   */
  function tmeter(o) {
    const max = Number(o.max) || 1;
    const value = Math.max(0, Number(o.value) || 0);
    const target = Number(o.target) || 0;
    const met = value >= target && target > 0;
    const asPct = o.unit !== 'count';
    // "40% / 80%", read aloud as "40% of 80%" (a bare "0 / 90%" did not say what the 0 was).
    const of = '<span aria-hidden="true"> / </span><span class="visually-hidden"> of </span>';
    const shown = asPct ? `<b>${Math.round(value * 100)}%</b>${of}${Math.round(target * 100)}%` : `<b>${value}</b>${of}${target}`;
    return `
      <div class="tmeter${met ? ' is-met' : ''}">
        <div class="tmeter-head">
          <span class="tmeter-label">${met ? window.mark('tick') : ''}${escapeHtml(o.label)}${met ? '<span class="visually-hidden"> (reached)</span>' : ''}</span>
          <span class="num">${shown}</span>
        </div>
        <div class="tmeter-bar" aria-hidden="true">
          <span class="tmeter-fill" style="--v:${Math.min(100, (value / max) * 100)}%"></span>
          <span class="tmeter-mark" style="--m:${Math.min(100, (target / max) * 100)}%"></span>
        </div>
      </div>`;
  }

  /**
   * The unit strip: one cell per unit of a grade. Known units are circled,
   * done ones ticked, units not checked yet drawn dashed, and the unit the
   * learner is in carries "You".
   * @param {Array} units   [{ unit, title, status, start, end }]
   * @param {object} o      level (current level), subject, caption
   */
  function unitStrip(units, o = {}) {
    const list = (units || []).filter((u) => u && u.unit != null);
    if (!list.length) return '';
    const n = list.length;
    const level = Number(o.level) || null;
    const placed = Number(o.placedUnit) || 0;
    const stateOf = (u) => {
      if (level && level >= u.start && level <= u.end) return 'current';
      if (u.status === 'known') return 'known';
      if (u.status === 'done') return 'done';
      if (u.status === 'unchecked') return 'unchecked';
      if (u.status === 'unseen' && placed && u.unit < placed) return 'unchecked';
      return 'learn';
    };
    const states = list.map(stateOf);
    const numbered = (i) => n <= 12 || i === 0 || i === n - 1 || states[i] === 'current' || (i + 1) % 5 === 0;
    const has = (s) => states.includes(s);
    const keys = [
      has('known') ? '<span class="key"><i class="k-known"></i>Already yours</span>' : '',
      has('done') ? '<span class="key"><i class="k-done"></i>Done</span>' : '',
      has('current') ? '<span class="key"><i class="k-current"></i>You are here</span>' : '',
      has('unchecked') ? '<span class="key"><i class="k-unchecked"></i>Not checked yet</span>' : '',
      has('learn') ? '<span class="key"><i></i>To learn</span>' : '',
    ].join('');
    return `
      <figure class="unit-strip"${o.subject ? ` data-subject="${escapeHtml(subjectId(o.subject))}"` : ''}>
        <div class="unit-cells" style="--n:${n}" aria-hidden="true">
          ${list.map((u, i) => `<span class="unit-cell is-${states[i]}" title="Unit ${u.unit}${u.title ? `: ${escapeHtml(u.title)}` : ''}">${
            states[i] === 'known' ? window.mark('circle') : states[i] === 'done' ? window.mark('tick', 'mark-plain') : ''}${
            numbered(i) ? `<span class="unit-cell-num">${u.unit}</span>` : ''}</span>`).join('')}
        </div>
        <figcaption>${o.caption ? `<span class="visually-hidden">${o.caption}</span>` : ''}${keys}</figcaption>
      </figure>`;
  }

  /* ── retaking an in-grade placement ──────────────────────────────────────
   * Offered on the same control as the first placement (the dashboard and the
   * path page), always behind a confirmation: a retake rebuilds the plan from
   * the new answers, so it is never one click. Units finished stay finished.
   * The dialog is a native <dialog> (focus held inside, Esc closes), with a
   * plain confirm() where the browser has none. */
  // What the in-grade placement takes in each mode (services/unit-placement.js
  // MODES). Only wording: the server owns the real clock.
  const RETAKE_MINUTES = { quick: 6, balanced: 13, accurate: 25 };

  async function retakeMinutes(trackId) {
    let mode = 'balanced';
    try {
      const s = await api.get(`/api/subject-placement/${encodeURIComponent(trackId)}`);
      if (s && s.placement && RETAKE_MINUTES[s.placement.mode]) mode = s.placement.mode;
    } catch { /* the default stands */ }
    return RETAKE_MINUTES[mode];
  }

  /**
   * @param {object} o  enrollmentId, trackId, gradeName, opener (the button, to return focus to)
   */
  async function retakePlacement(o) {
    const minutes = await retakeMinutes(o.trackId);
    const grade = gradeLabel(o.gradeName);
    const text = `Units you've finished stay finished, and units you tested out of stay skipped unless you miss them now. It takes about ${minutes} minutes.`;
    const go = () => { window.location.href = `/placement?enrollment=${encodeURIComponent(o.enrollmentId)}&retake=1`; };
    const probe = document.createElement('dialog');
    if (typeof probe.showModal !== 'function') {
      if (window.confirm(`Retake the placement for ${grade}?\n\n${text}`)) go();
      return;
    }
    const dlg = el('dialog', { class: 'modal', 'aria-labelledby': 'retake-h', 'aria-describedby': 'retake-p' }, `
      <div class="modal-inner">
        <h2 id="retake-h">Retake the placement for ${escapeHtml(grade)}?</h2>
        <p id="retake-p">${escapeHtml(text)}</p>
        <div class="modal-actions">
          <button class="btn" type="button" data-act="cancel">Cancel</button>
          <button class="btn btn-primary" type="button" data-act="retake">Retake</button>
        </div>
      </div>`);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      dlg.remove();
      if (o.opener && o.opener.isConnected) o.opener.focus();
    });
    // A click on the dimmed page behind it is a cancel.
    dlg.addEventListener('click', (event) => { if (event.target === dlg) dlg.close(); });
    dlg.querySelector('[data-act="cancel"]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-act="retake"]').addEventListener('click', () => {
      dlg.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      go();
    });
    dlg.showModal();
  }

  /** Wire every [data-retake] button under `root`: data-retake is the enrollment id, data-track and data-grade-name say which. */
  function bindRetake(root) {
    (root || document).addEventListener('click', (event) => {
      const button = event.target.closest('[data-retake]');
      if (!button) return;
      retakePlacement({
        enrollmentId: button.dataset.retake,
        trackId: button.dataset.track,
        gradeName: button.dataset.gradeName,
        opener: button,
      });
    });
  }

  /**
   * Ask for a line or two of text in a modal dialog, in place of window.prompt
   * (UX_REPORT_DIALOG, on by default; Ceaparu et al. 2004, WCAG 4.1.3 and 2.4.7).
   * A native <dialog>: the browser traps focus, Escape and a tap on the backdrop
   * cancel, the field has a real label, and focus goes back to `opener` after.
   * Resolves to the trimmed text, or null when cancelled. Falls back to
   * window.prompt where <dialog> is missing or the switch is off.
   *
   * @param {{title: string, label?: string, submit?: string, maxLength?: number, required?: boolean, opener?: Element}} o
   * @returns {Promise<string|null>}
   */
  function askText(o) {
    const opts = o || {};
    const probe = document.createElement('dialog');
    if (typeof probe.showModal !== 'function' || (window.App && window.App.ux && window.App.ux.report_dialog === false)) {
      const answer = window.prompt(opts.label || opts.title || '');
      return Promise.resolve(answer === null ? null : String(answer).trim());
    }
    const max = opts.maxLength || 500;
    return new Promise((resolve) => {
      const dlg = el('dialog', { class: 'modal', 'aria-labelledby': 'ask-h', 'aria-describedby': 'ask-hint' }, `
        <form class="modal-inner" method="dialog" novalidate>
          <h2 id="ask-h">${escapeHtml(opts.title || '')}</h2>
          <label class="field" for="ask-text">
            <span>${escapeHtml(opts.label || '')}</span>
            <textarea id="ask-text" rows="4" maxlength="${max}" aria-describedby="ask-hint ask-err" autocomplete="off"></textarea>
          </label>
          <p id="ask-hint" class="tiny muted">${opts.required ? 'Required. ' : 'Optional. '}Up to ${max} characters.</p>
          <p id="ask-err" class="tiny ask-err" role="alert"></p>
          <div class="modal-actions">
            <button class="btn" type="button" data-act="cancel">Cancel</button>
            <button class="btn btn-primary" type="submit" data-act="submit">${escapeHtml(opts.submit || 'Send')}</button>
          </div>
        </form>`);
      let answer = null;
      document.body.appendChild(dlg);
      dlg.addEventListener('close', () => {
        dlg.remove();
        if (opts.opener && opts.opener.isConnected) opts.opener.focus();
        resolve(answer);
      });
      dlg.addEventListener('click', (event) => { if (event.target === dlg) dlg.close(); });
      dlg.querySelector('[data-act="cancel"]').addEventListener('click', () => dlg.close());
      dlg.querySelector('form').addEventListener('submit', (event) => {
        event.preventDefault();
        const text = dlg.querySelector('#ask-text').value.trim();
        if (opts.required && !text) {
          dlg.querySelector('#ask-err').textContent = 'Please write a few words first.';
          dlg.querySelector('#ask-text').focus();
          return;
        }
        answer = text;
        dlg.close();
      });
      dlg.showModal();
      dlg.querySelector('#ask-text').focus();
    });
  }

  window.App = {
    ux: {}, hideStats: false, breakOff: false, askText,
    api, el, escapeHtml, toast, announce, pct, timeAgo, header, currentUser, query, mount, setLead,
    /** Pick a style ('auto' or an id) now, on this device, and save it to the account. */
    async setStyle(pref) {
      if (Style) Style.set(pref);
      try { await api.post('/api/prefs', { style: pref }); } catch { /* kept on this device */ }
    },
    CHECKPOINT_LABEL, LEVEL_LABEL, LEVEL_ICON,
    levelName, levelIcon, layoutSentence, isCheckpointLevel,
    BRAND, brandMark, symbol, subjectId, gradeParts, gradeLabel, cleanTitle, levelParts,
    scale, checkpointTicks, tmeter, unitStrip, retakePlacement, bindRetake, noDash,
  };
})();
