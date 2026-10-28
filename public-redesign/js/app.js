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

  let toastHost = null;
  function toast(message, kind) {
    if (!toastHost) {
      toastHost = el('div', { class: 'toast-host' });
      document.body.appendChild(toastHost);
    }
    const node = el('div', { class: `toast${kind === 'error' ? ' toast-error' : ''}` }, escapeHtml(message));
    toastHost.appendChild(node);
    setTimeout(() => node.remove(), kind === 'error' ? 5200 : 3200);
  }

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
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }
  function currentTheme() {
    const forced = document.documentElement.dataset.theme;
    if (forced) return forced;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
    dashboard: 'home', subjects: 'compass', curriculum: 'list', profile: 'user', games: 'target', admin: 'settings',
  };
  const TAB_LABEL = { dashboard: 'Home' };

  function header(user, active) {
    const host = document.getElementById('header');
    if (!host) return;
    applyAudience(user);
    const nav = user
      ? [
        ['dashboard', 'Dashboard', '/dashboard'],
        ['subjects', 'Subjects', '/onboarding'],
        // Read-only: every subject, every grade, every level. Offered only to an
        // account that can browse, and the route asks again, so hiding the link
        // here is a courtesy rather than the thing that holds.
        ...(user.can_browse ? [['curriculum', 'Curriculum', '/curriculum']] : []),
        ['profile', 'Profile', '/profile'],
        ...(user.is_admin ? [['games', 'Game lab', '/game-lab']] : []),
        ...(user.is_admin ? [['admin', 'Admin', '/admin']] : []),
      ]
      : [['how', 'How it works', '/#how'], ['subjects', 'Subjects', '/#subjects']];

    host.innerHTML = `
      <div class="wrap">
        <a class="brand" href="${user ? '/dashboard' : '/'}">
          <span class="mark">${window.icon('logo')}</span>Polymath
        </a>
        <nav class="nav${user ? ' has-tabbar' : ''}" aria-label="Main">
          ${nav.map(([key, label, href]) =>
            `<a href="${href}" class="${key === active ? 'active' : ''}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
        </nav>
        <span class="spacer"></span>
        ${user ? `
          <div class="header-stats">
            <span class="stat-pill is-streak" title="Day streak">${window.icon('streak')}${user.streak || 0}<span class="visually-hidden"> day streak</span></span>
            <span class="stat-pill is-xp" title="Total XP">${window.icon('zap')}${user.xp || 0}<span class="visually-hidden"> XP</span></span>
          </div>
          <div class="header-actions">
            <button class="icon-btn" id="theme-toggle" type="button" title="Switch light or dark" aria-label="Switch light or dark">${window.icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>
            <button class="btn btn-ghost btn-sm" id="logout" type="button" aria-label="Sign out">${window.icon('log-out')}<span class="btn-label">Sign out</span></button>
          </div>
        ` : `
          <div class="header-actions">
            <button class="icon-btn" id="theme-toggle" type="button" title="Switch light or dark" aria-label="Switch light or dark">${window.icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>
            <a class="btn btn-ghost btn-sm" href="/login">Sign in</a>
            <a class="btn btn-primary btn-sm" href="/register">Get started</a>
          </div>
        `}
      </div>`;

    // The tab bar lives outside the header so it can sit at the bottom of the
    // screen; it is drawn on every page that has a signed-in header and shown
    // only on narrow screens (and never inside a question player — see the CSS).
    let tabbar = document.getElementById('tabbar');
    if (user) {
      if (!tabbar) {
        tabbar = el('nav', { id: 'tabbar', class: 'tabbar', 'aria-label': 'Main' });
        document.body.appendChild(tabbar);
      }
      tabbar.innerHTML = nav.slice(0, 5).map(([key, label, href]) => `
        <a href="${href}" class="${key === active ? 'active' : ''}"${key === active ? ' aria-current="page"' : ''}>
          <span class="tab-ic">${window.icon(TAB_ICON[key] || 'chevron-right')}</span>${TAB_LABEL[key] || label}
        </a>`).join('');
      document.body.classList.add('has-tabbar');
    } else if (tabbar) {
      tabbar.remove();
      document.body.classList.remove('has-tabbar');
    }

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        store(THEME_KEY, next);
        toggle.innerHTML = window.icon(next === 'dark' ? 'sun' : 'moon');
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
    return user;
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

  window.App = {
    api, el, escapeHtml, toast, pct, timeAgo, header, currentUser, query, mount,
    CHECKPOINT_LABEL, LEVEL_LABEL, LEVEL_ICON,
    levelName, levelIcon, layoutSentence, isCheckpointLevel,
  };
})();
