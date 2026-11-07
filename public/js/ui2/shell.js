/* The new app shell (docs/UI-V2.md), on every signed-in app page when UI_V2 is on. Loaded right after js/app.js by services/ui-v2.js.
 *
 * It rearranges what the existing code draws; it decides nothing. App.header still runs in full (consent line, stats settings, the study strip, sign-out), then this:
 *   - takes out the tab bar, the nav list and the streak and XP (they live on the profile now, and stay hideable there)
 *   - puts a menu or back button at the left of the top bar, and on a wide screen the "Everything" link
 *   - leaves the giraffe to js/tutor-giraffe.js, which finds its own place in .site-header .wrap, before .header-actions
 *   - moves the idle "Start session" of js/study.js up into the top bar; a running session stays in its own line under it
 * and on a question it puts the guide under the player's top bar: the original giraffe, cropped at the shoulders on a phone, with the question in its speech bubble. When the answer comes, the
 * words of js/player.js's .verdict show in that bubble, tinted, and the giraffe reacts; the box itself stays where the player put it and keeps the buttons. Nothing of the player's is moved:
 * the bubble holds copies and the originals stay in place for screen readers, focus and every listener.
 */
(function () {
  if (!window.App || !document.documentElement.hasAttribute('data-ui2')) return;

  const PATHS = {
    menu: 'M4 7h16M4 12h16M4 17h10',
    back: 'M15 5l-7 7 7 7',
    x: 'M6 6l12 12M18 6 6 18',
    'chev-r': 'M9 5l7 7-7 7',
    'chev-d': 'M5 9l7 7 7-7',
    'chev-u': 'M5 15l7-7 7 7',
    check: 'M5 12.5 9.5 17 19 7.5',
    flag: 'M6 21V4h11l-2.5 4 2.5 4H6',
    loop: 'M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.500c1.200-4 4-6 7.500-6s6.300 2 7.500 6',
    plus: 'M12 5v14M5 12h14',
    calendar: 'M5.500 5h13A1.500 1.500 0 0 1 20 6.500v12a1.500 1.500 0 0 1-1.500 1.500h-13A1.500 1.500 0 0 1 4 18.500v-12A1.500 1.500 0 0 1 5.500 5zM4 10h16M8.500 3v4M15.500 3v4',
    history: 'M4 12a8 8 0 1 0 2.500-5.800L4 8.500M4 4v4.500h4.500M12 8v4l2.500 1.500',
    note: 'M7 3.500h7.500L19 8v11a1.500 1.500 0 0 1-1.500 1.500h-10.500A1.500 1.500 0 0 1 5.500 19V5A1.500 1.500 0 0 1 7 3.500zM14 3.500V8.500h5M9 13h6M9 16.500h6',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.500a4.500 4.500 0 1 0 0-9 4.500 4.500 0 0 0 0 9zM12 12h.01',
    cup: 'M5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10.500h1.500a2.500 2.500 0 0 1 0 5H17M8 3.500v2M12 3.500v2',
    book: 'M12 6.500C10.500 5 8 4.500 4 4.500v14c4 0 6.500.5 8 2 1.500-1.500 4-2 8-2v-14c-4 0-6.500.5-8 2zM12 6.500v14',
    sun: 'M12 16.500a4.500 4.500 0 1 0 0-9 4.500 4.500 0 0 0 0 9zM12 2.500v2M12 19.500v2M4.500 12h-2M21.500 12h-2M6.700 6.700 5.300 5.300M18.700 18.700l-1.400-1.400M17.300 6.700l1.400-1.400M5.300 18.700l1.400-1.400',
    moon: 'M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500Z',
    out: 'M9.500 4.500H6A1.500 1.500 0 0 0 4.500 6v12A1.500 1.500 0 0 0 6 19.500h3.500M15 8l4 4-4 4M19 12H9.500',
    sigma: 'M17.5 5H7l6.5 7L7 19h10.5',
    pawn: 'M12 3.5a3.2 3.2 0 0 1 2.2 5.5c.5 2.6 1.5 4.6 3 6.5H6.8c1.5-1.9 2.5-3.9 3-6.5A3.2 3.2 0 0 1 12 3.5zM5.5 20h13M7 15.5l-1.5 4.5M17 15.5l1.5 4.5',
    keys: 'M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5zM9 19.5V14M15 19.5V14M7.5 4.5V14h3V4.5M13.5 4.5V14h3V4.5',
    ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3v18M5.8 5.5c2.5 2 3.8 4 3.8 6.5s-1.3 4.5-3.8 6.5M18.2 5.5c-2.5 2-3.8 4-3.8 6.5s1.3 4.5 3.8 6.5',
    pencil: 'M4 20l1-4.5L16.500 4a2 2 0 0 1 3 0l.5.5a2 2 0 0 1 0 3L8.500 19zM14.500 6l3.500 3.500',
    chat: 'M5.500 4.500h13A2 2 0 0 1 20.500 6.500v9a2 2 0 0 1-2 2H11l-4.500 3.500V17.500h-1a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
    clock: 'M12 3.500a8.500 8.500 0 1 0 0 17 8.500 8.500 0 0 0 0-17zM12 7.500V12l3 2',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.200l2-1.500-2-3.400-2.300 1a7 7 0 0 0-2.100-1.200L14 3.500h-4l-.4 2.200a7 7 0 0 0-2.100 1.200l-2.300-1-2 3.400 2 1.500a7 7 0 0 0 0 2.400l-2 1.500 2 3.400 2.300-1a7 7 0 0 0 2.100 1.200l.4 2.200h4l.4-2.200a7 7 0 0 0 2.100-1.200l2.300 1 2-3.400-2-1.500c.1-.4.1-.8.1-1.200z',
  };
  const ic = (name, cls) => `<svg class="u2-ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${PATHS[name]}"/></svg>`;

  // Every GET a page makes is kept for the page's life, so js/ui2/home.js can read the replies js/dashboard.js already asked for instead of asking twice.
  const gets = new Map();
  const realGet = App.api.get;
  App.api.get = function get(url, ...rest) {
    const reply = realGet.call(App.api, url, ...rest);
    gets.set(url, reply);
    return reply;
  };

  // The subject tiles get the mockup's icons; the word stays where one reads better. Only the look changes: same call, same element, same data-subject.
  const SUBJECT_ICON = { math: 'sigma', reading: 'book', iq: 'target', act: 'pencil', spanish: 'chat', chess: 'pawn', piano: 'keys', basketball: 'ball' };
  const SUBJECT_WORD = { english: 'Aa' };
  const realSymbol = App.symbol;
  App.symbol = function symbol(track, opts) {
    const html = realSymbol(track, opts);
    const id = String((track && typeof track === 'object' ? track.id : track) || '');
    const inner = SUBJECT_ICON[id] ? ic(SUBJECT_ICON[id]) : SUBJECT_WORD[id];
    return inner ? html.replace(/(<span class="symbol[^>]*>)[^<]*/, (m, open) => open + inner) : html;
  };

  const HOME = /^\/dashboard(\.html)?$/.test(location.pathname);
  const Look = window.U2Look;

  /** Where back goes: the page before it if that was ours and not a sitting left behind, otherwise up. */
  function upFrom(path) {
    if (/^\/my-material-/.test(path)) return `/my-material${location.search}`.replace(/\?.*$/, '');
    return '/dashboard';
  }
  function goBack(event) {
    let prev = null;
    try { prev = document.referrer ? new URL(document.referrer) : null; } catch { prev = null; }
    if (prev && prev.origin === location.origin && !/^\/(session|review|enforcer|placement|base-lesson|login|register|start)/.test(prev.pathname) && history.length > 1) {
      event.preventDefault();
      history.back();
    }
  }

  const titleOf = () => String(document.title || '').replace(/\s*\|\s*Savant\s*$/, '');

  function drawBar(user) {
    const wrap = document.querySelector('#header .wrap');
    if (!wrap) return;
    wrap.querySelectorAll('.nav, .header-stats').forEach((n) => n.remove());
    const tabbar = document.getElementById('tabbar');
    if (tabbar) tabbar.remove();
    document.body.classList.remove('has-tabbar');
    document.documentElement.classList.add('u2-bar');
    const brand = wrap.querySelector('.brand');
    const left = document.createElement('div');
    left.className = 'u2-left';
    left.innerHTML = HOME
      ? `<a class="u2-ib" id="u2-menu" href="/dashboard#everything" aria-label="Open everything">${ic('menu')}</a><a class="u2-tb-wm" href="/dashboard" aria-label="Savant, home">${Look.wordmark(22)}</a>`
      : `<a class="u2-ib" id="u2-back" href="${upFrom(location.pathname)}" aria-label="Back">${ic('back')}</a><b class="u2-tb-t" id="u2-tb-t">${App.escapeHtml(titleOf())}</b>`;
    wrap.insertBefore(left, brand ? brand.nextSibling : wrap.firstChild);
    const backBtn = left.querySelector('#u2-back');
    if (backBtn) backBtn.addEventListener('click', goBack);
    App.ui2.user = user;
    if (App.ui2.onBar) App.ui2.onBar();
  }

  // ── Start session in the top bar ─────────────────────────────────────────
  function placeStudy() {
    const strip = document.getElementById('study-strip');
    const wrap = document.querySelector('#header .wrap');
    if (!strip || !wrap) return;
    const idle = strip.classList.contains('study-strip-idle') && !!strip.querySelector('[data-study="start"]');
    if (idle) {
      const before = wrap.querySelector('.tdock-g') || wrap.querySelector('.header-actions');
      if (strip.parentElement !== wrap || strip.nextElementSibling !== before) wrap.insertBefore(strip, before);
    } else if (strip.parentElement === wrap) {
      const consent = document.getElementById('consent-line');
      (consent || document.getElementById('header')).after(strip);
    }
  }

  // ── The answer box ───────────────────────────────────────────────────────
  let sheetSeen = null;
  let sheetWatch = null;
  function dressVerdict(box) {
    if (box.dataset.u2) return;
    box.dataset.u2 = '1';
    const head = box.querySelector('h4');
    const good = box.classList.contains('verdict-correct');
    const bad = box.classList.contains('verdict-wrong');
    if (head) {
      // The words in one span, so the mark sits beside them as one block however they wrap (a screen with no guide shows them here).
      const words = document.createElement('span');
      words.className = 'u2-vt';
      while (head.firstChild) words.appendChild(head.firstChild);
      head.appendChild(words);
      if (good || bad) head.insertAdjacentHTML('afterbegin', `<span class="u2-mk ${good ? 'u2-mk-good' : 'u2-mk-bad'}" aria-hidden="true">${ic(good ? 'check' : 'x')}</span>`);
    }
    const ask = box.querySelector('[data-act="ask"]');
    if (ask) ask.textContent = 'Why?';
    const go = box.querySelector('[data-act="next"]');
    if (go && go.textContent.trim() === 'Next question') go.textContent = 'Next';
    const report = box.querySelector('[data-act="report"]');
    if (report) {
      report.setAttribute('aria-label', 'Report a problem');
      report.setAttribute('title', 'Report a problem');
      report.innerHTML = ic('flag');
    }
  }

  // ── The guide on a question ──────────────────────────────────────────────
  const LONG_ASK = 170; // more than this stays in the page; the bubble can't hold it comfortably on a phone
  let guide = null;
  let reacted = null;
  const wholeGiraffe = () => window.matchMedia('(min-width: 768px)').matches;
  function buildGuide() {
    const g = document.createElement('div');
    g.className = 'u2-guide';
    g.id = 'u2-qguide';
    g.innerHTML = `<button type="button" class="u2-gh"></button>
      <div class="u2-tailwrap"><div class="u2-bubble" id="u2-qb"></div><button type="button" id="u2-bflag" aria-label="Report a problem" title="Report a problem" hidden>${ic('flag')}</button></div>`;
    const btn = g.querySelector('.u2-gh');
    const host = document.createElement('span');
    btn.appendChild(host);
    Look.giraffe(host, { crop: wholeGiraffe() ? 'full' : 'bust' });
    Look.bind(btn);
    g.querySelector('#u2-bflag').addEventListener('click', () => {
      const r = document.querySelector('.verdict [data-act="report"]');
      if (r) r.click();
    });
    return g;
  }
  const mathText = (t) => App.escapeHtml(t).replace(/(^|[^a-zA-Z])([a-zA-Z])(?![a-zA-Z])/g, '$1<i>$2</i>');
  /** "Simplify: 3x + 2x" is an instruction and an expression: the instruction in the bubble, the expression large on the page, as in the mockup. Anything else stays one piece. */
  function splitAsk(text) {
    const m = /^([^:]{2,60}):\s*([0-9a-zA-Z()+\-−×÷*/=^².\s]{3,28})$/.exec(text);
    if (!m || !/\d/.test(m[2]) || /[a-zA-Z]{2,}/.test(m[2])) return null;
    return { ask: `${m[1]}.`, sum: m[2].trim() };
  }
  function dressQuestion() {
    const head = document.querySelector('.player-head');
    const prompt = document.querySelector('.player .prompt, .session-player .prompt');
    const answering = prompt && prompt.parentElement && prompt.parentElement.querySelector('.choices, .answer-row, .check-bar, .verdict');
    const root = document.documentElement;
    if (!head || !answering) {
      if (guide && guide.isConnected) guide.remove();
      root.classList.remove('u2-guided');
      if (!HOME) root.classList.remove('u2-has-guide');
      return;
    }
    if (!guide) guide = buildGuide();
    if (head.nextElementSibling !== guide) head.after(guide);
    root.classList.add('u2-guided', 'u2-has-guide');
    Look.crop(guide.querySelector('.tutor'), wholeGiraffe() ? 'full' : 'bust');
    const wrap = guide.querySelector('.u2-tailwrap');
    const bubble = guide.querySelector('#u2-qb');
    const flag = guide.querySelector('#u2-bflag');
    const tutor = guide.querySelector('.tutor');
    const box = document.querySelector('.player .verdict, .session-player .verdict');
    const text = prompt.textContent.trim();
    const hasPassage = !!prompt.parentElement.querySelector('.passage');
    const short = text.length <= LONG_ASK && !hasPassage;
    const parts = short ? splitAsk(text) : null;
    prompt.classList.toggle('u2-asked', short);
    // The big sum, between the giraffe and the answers.
    let sum = prompt.parentElement.querySelector(':scope > .u2-sum');
    if (parts && !sum) {
      sum = document.createElement('div');
      sum.className = 'u2-sum';
      sum.setAttribute('aria-hidden', 'true');
      prompt.after(sum);
    }
    if (sum) { if (parts) sum.innerHTML = mathText(parts.sum); else sum.remove(); }
    let html;
    let tone = '';
    if (box && box.querySelector('.verdict-actions, h4')) {
      const good = box.classList.contains('verdict-correct');
      const bad = box.classList.contains('verdict-wrong');
      tone = good ? 'u2-ok' : bad ? 'u2-no' : '';
      const headText = box.querySelector('h4 .u2-vt') || box.querySelector('h4');
      const more = [...box.querySelectorAll(':scope > .small, :scope > .rationale')].map((n) => n.textContent.trim()).filter(Boolean);
      html = `<b>${headText ? App.escapeHtml(headText.textContent.trim()) : ''}</b>${more.map((t) => `<span>${App.escapeHtml(t)}</span>`).join('')}`;
      const report = box.querySelector('[data-act="report"]');
      flag.hidden = !report;
      if (report) flag.disabled = report.disabled;
      if (reacted !== box) {
        reacted = box;
        if (window.Tutor && (good || bad)) window.Tutor.mood(tutor, good ? 'happy' : 'think', good ? 1800 : 0);
        else if (window.Tutor) window.Tutor.mood(tutor, 'think');
        if (guide.getBoundingClientRect().top < 0 && guide.scrollIntoView) guide.scrollIntoView({ block: 'center' });
      }
    } else {
      flag.hidden = true;
      if (reacted && window.Tutor) window.Tutor.mood(tutor, 'idle');
      reacted = null;
      html = short ? App.escapeHtml(parts ? parts.ask : text) : 'Your turn.';
    }
    bubble.setAttribute('aria-hidden', box || short ? 'true' : 'false');
    bubble.classList.toggle('u2-small', !box && (parts ? parts.ask : text).length > 60);
    wrap.classList.toggle('u2-ok', tone === 'u2-ok');
    wrap.classList.toggle('u2-no', tone === 'u2-no');
    if (bubble.dataset.src !== html) { bubble.dataset.src = html; bubble.innerHTML = html; bubble.scrollTop = 0; }
  }

  function dressPartChange() {
    document.querySelectorAll('.verdict [data-part-change]:not([data-u2])').forEach((row) => {
      row.dataset.u2 = '1';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'u2-link-q u2-pc-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = `Change this ${ic('chev-d')}`;
      toggle.addEventListener('click', () => {
        const open = row.classList.toggle('u2-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      row.insertBefore(toggle, row.firstChild);
    });
  }
  function watchSheet() {
    document.querySelectorAll('.verdict').forEach((b) => { if (b.querySelector('.verdict-actions')) dressVerdict(b); });
    const box = document.querySelector('.verdict [data-act="next"]') ? document.querySelector('.verdict [data-act="next"]').closest('.verdict') : null;
    if (box === sheetSeen) return;
    sheetSeen = box;
    if (sheetWatch) { sheetWatch.disconnect(); sheetWatch = null; }
    const root = document.documentElement;
    if (!box) { root.style.removeProperty('--u2-sheet-h'); root.classList.remove('u2-sheet'); return; }
    root.classList.add('u2-sheet');
    const size = () => root.style.setProperty('--u2-sheet-h', `${Math.ceil(box.getBoundingClientRect().height)}px`);
    size();
    if (window.ResizeObserver) { sheetWatch = new ResizeObserver(size); sheetWatch.observe(box); }
  }

  // A learner who came to upload from the onboarding gets one way on to Home.
  function afterUpload() {
    if (!/^\/my-material$/.test(location.pathname) || !/[?&]from=start\b/.test(location.search) || document.getElementById('u2-after-upload')) return;
    const main = document.querySelector('main.page');
    if (!main) return;
    main.insertAdjacentHTML('beforeend', '<div id="u2-after-upload"><a class="u2-btn" href="/dashboard">Go to home</a></div>');
  }

  let queued = false;
  function tick() {
    queued = false;
    placeStudy();
    watchSheet();
    dressQuestion();
    dressPartChange();
    afterUpload();
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(tick); } }

  App.ui2 = { ic, gets, look: Look, home: HOME, user: null, onBar: null };

  const realHeader = App.header;
  App.header = function header(user, active) {
    realHeader(user, active);
    if (!user) return;
    drawBar(user);
    queue();
  };

  function start() {
    if (window.MutationObserver) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', queue);
    queue();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}());
