/* The new onboarding (docs/ONBOARDING-V2.md). One page, one question per screen.
 *
 * The order: welcome, hello, age, then the agreement (or, under the consent age, the parent's email), then just the four things it asks: the short test, interests,
 * subjects, grade. Then building, first lesson ready, the lesson, saving the account.
 *
 * In the private beta the state says `onboarding`: this learner already has an account, from the application. There is no agreement screen, no guest and nothing to save:
 * welcome, hello, age only if the account has none on record, the same four things, the first lesson. The server decides this (services/onboarding-v2.js inFlow).
 *
 * Steps are named in the address (#into), so reload and the back button work. From the agreement on, a guest row on the server holds the answers
 * (services/onboarding-v2.js), and saving adds credentials to that same row. The server keeps the age answer and picks the route: this file knows no age threshold.
 *
 * The shell (tutor, bubble, progress bar, Continue) stays on screen between steps; only the panel changes, so it reads as one conversation.
 */
(function () {
  const C = window.ObContent;
  const I = C.ICONS;
  const KEY = 'savant.ob2';
  const root = document.getElementById('ob-root');

  /** Who the flow is about. `a` is what goes to the server; nothing else leaves this page. */
  let S = { a: { tracks: [], notes: false, interests: [], interest: null, interest_text: '', test_skipped: false }, claimed: false };
  let server = {}; // the last /api/ob2/state
  let catalog = [];
  let view = null; // the current step's definition
  let current = null;
  let busy = false;

  /* ── small helpers ──────────────────────────────────────── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Text with **marked** parts, safe for innerHTML. */
  const marked = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="m">$1</span>');
  const $ = (sel, from) => (from || root).querySelector(sel);
  const $$ = (sel, from) => [...(from || root).querySelectorAll(sel)];
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.a) S = { ...S, ...v, a: { ...S.a, ...v.a } }; } catch (e) { /* a fresh start */ } };
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* the server holds it from the agreement on */ } };
  const forget = () => { try { localStorage.removeItem(KEY); } catch (e) { /* nothing to do */ } };
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function api(method, path, body) {
    const res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || 'That did not work. Try again.'); err.status = res.status; err.field = data.field; err.code = data.code; throw err; }
    return data;
  }
  const trackOf = (id) => catalog.find((t) => t.id === id);
  const firstTrack = () => S.a.tracks[0] || null;
  const trackName = () => { const t = trackOf(firstTrack()); return t ? t.name : 'this subject'; };
  const isChild = () => server.route === 'parent' || S.route === 'parent';
  /** Beta: signed in, from the application. */
  const signedIn = () => !!server.onboarding;
  /** There is a row on the server to keep answers on. */
  const hasRow = () => !!(server.guest || server.onboarding);
  /** Under the consent age with no parent told yet: the parent's email comes next. */
  const parentToAsk = () => isChild() && (signedIn() ? ((server.consent || {}).state === 'pending' && !(server.consent || {}).has_request) : !server.guest);
  const notesOnly = () => S.a.notes && !S.a.tracks.length;
  const gradeParts = (name) => String(name || '').split(/\s+[—–]\s+/);
  /** Math, English and reading have school grades; the others have levels with their own names. */
  const gradeWord = () => { const t = trackOf(firstTrack()); return t && t.grades.some((g) => /\bgrade\b/i.test(g.name)) ? 'grade' : 'level'; };

  /* ── the shell ──────────────────────────────────────────── */
  const ORDER = ['welcome', 'hello', 'age', 'agree', 'declined', 'parent', 'test', 'testing', 'into', 'learn', 'grade', 'pick', 'level', 'result', 'building', 'ready', 'save', 'done'];
  /** How full the bar is on arrival at each step, by rough share of the time. `testing` and `level` fill as they go, up to the next value. */
  const FILL = { welcome: 0, hello: 3, age: 7, agree: 11, declined: 11, parent: 11, test: 14, testing: 15, into: 58, learn: 64, grade: 70, pick: 74, level: 74, result: 88, building: 92, ready: 96, save: 98, done: 100 };
  const SPAN = { testing: 43, level: 14 };

  function shell() {
    root.innerHTML = `
      <div class="ob" id="ob">
        <div class="ob-side" id="ob-side">
          <a class="ob-brand" href="/">Savant</a>
          <div id="tutor"></div>
          <div class="bubble" id="bubble"><span class="sr">Your tutor says: </span><span class="bubble-text" id="bubble-text" aria-live="polite"></span></div>
        </div>
        <header class="ob-top">
          <button class="ob-back" id="back" type="button" aria-label="Back">${I.back}</button>
          <span class="ob-wordmark" id="wordmark" hidden>Savant</span>
          <div class="bar" id="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="How far through the setup you are">
            <div class="bar-fill" id="bar-fill"></div>
          </div>
        </header>
        <form class="ob-panel" id="panel" novalidate></form>
        <div class="ob-foot" id="foot">
          <p class="ob-error" id="err" role="alert" hidden></p>
          <div id="foot-extra"></div>
          <button class="btn" id="next" type="submit" form="panel">Continue</button>
          <button class="link-btn" id="alt" type="button" hidden></button>
        </div>
      </div>`;
    Tutor.mount($('#tutor'));
    $('#back').addEventListener('click', goBack);
    $('#panel').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    root.addEventListener('change', syncOn);
    $('#alt').addEventListener('click', () => { if (view && view.alt && !busy) view.alt.run(); });
  }

  function setBar(step, within) {
    const pct = Math.max(2, Math.min(100, Math.round((FILL[step] || 0) + (within || 0) * (SPAN[step] || 0))));
    $('#bar').setAttribute('aria-valuenow', String(pct));
    $('#bar-fill').style.width = `${pct}%`;
  }

  /** The tutor says something. A repeat of the same line does nothing, so a double tap doesn't flicker. */
  function say(text, mood) {
    const box = $('#bubble-text');
    const html = marked(text || '');
    if (box.dataset.src !== text) {
      box.dataset.src = text;
      box.innerHTML = html;
      const b = $('#bubble');
      b.classList.remove('is-new');
      void b.offsetWidth; // eslint-disable-line no-void
      b.classList.add('is-new');
    }
    if (mood) Tutor.mood($('#tutor'), mood, mood === 'happy' ? 1800 : 0);
  }

  function ready(ok) { $('#next').disabled = !ok; }
  function showError(msg, field) {
    const box = $('#err');
    if (box) { box.textContent = msg; box.hidden = !msg; }
    $$('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
    if (field) { const n = $(`[name="${field}"]`); if (n) { n.setAttribute('aria-invalid', 'true'); n.focus(); } }
  }

  /* ── moving between steps ───────────────────────────────── */
  function go(step, opts = {}) {
    if (location.hash !== `#${step}`) {
      if (opts.replace) history.replaceState(null, '', `#${step}`);
      else history.pushState(null, '', `#${step}`);
    }
    render(step, opts.dir || 'next');
  }
  function goBack() {
    if (busy) return;
    const prev = view && view.back;
    if (prev) return go(prev, { dir: 'back' });
    return history.back();
  }
  async function submit() {
    if (busy || !view || $('#next').disabled || $('#next').hidden) return;
    busy = true;
    const btn = $('#next');
    btn.setAttribute('aria-busy', 'true');
    showError('');
    try {
      await view.next();
    } catch (err) {
      showError(err.message, err.field);
      if (view.onError) view.onError(err);
      Tutor.mood($('#tutor'), 'idle');
    } finally {
      busy = false;
      if ($('#next')) $('#next').removeAttribute('aria-busy');
    }
  }

  /** The test has been dealt with: done, skipped, or only its last question (interests) is waiting. */
  const testClear = () => !!(server.test && (server.test.done || server.test.pending)) || S.a.test_skipped;

  /** A step that needs something earlier goes there instead. */
  function guard(step) {
    if (S.claimed) return 'done';
    const at = ORDER.indexOf(step);
    const past = (name) => at > ORDER.indexOf(name);
    if (at < 0) return 'welcome';
    if (past('age') && !server.route) return 'age';
    if (step === 'age' && signedIn() && server.route) return parentToAsk() ? 'parent' : 'test';
    if (step === 'agree' || step === 'declined') {
      if (isChild()) return parentToAsk() ? 'parent' : 'test';
      if (server.agreed) return 'test';
      return step;
    }
    if (past('declined') && !isChild() && !server.agreed) return 'agree';
    if (step === 'parent') return parentToAsk() ? step : 'test';
    if (past('parent') && parentToAsk()) return 'parent';
    if (signedIn() && (step === 'save' || step === 'done')) return server.enrollment ? 'ready' : 'grade'; // nothing to save: the account exists
    // Someone past the questions (out on a lesson, coming back to save) isn't sent round them again.
    if (!server.enrollment) {
      if (past('testing') && !testClear()) return 'test';
      if (past('into') && !S.a.interests.length) return 'into';
      if (past('learn') && !S.a.tracks.length && !S.a.notes) return 'learn';
    }
    if (['grade', 'pick', 'level', 'result', 'building'].includes(step) && notesOnly()) return signedIn() ? 'learn' : 'save';
    if (step === 'result' && !S.result) return 'grade';
    if (step === 'ready' && !(server.enrollment || S.enrollment)) return 'grade';
    if (step === 'done') return 'save';
    return step;
  }

  function render(step, dir) {
    const safe = guard(step);
    if (safe !== step) { history.replaceState(null, '', `#${safe}`); step = safe; }
    if (current === 'testing' && step !== 'testing') ObTest.cancel();
    current = step;
    S.step = step;
    keep();
    view = STEPS[step]();
    const ob = $('#ob');
    ob.dataset.screen = step;
    ob.dataset.layout = view.hero ? 'hero' : 'question';
    delete ob.dataset.focus;
    $('#back').style.visibility = view.back === null ? 'hidden' : 'visible';
    $('#wordmark').hidden = step !== 'welcome';
    setBar(step, view.within);
    say(view.bubble || '', view.mood || 'idle');
    const panel = $('#panel');
    panel.innerHTML = `<div class="ob-view" data-dir="${dir}">${view.html}</div>`;
    $('#foot-extra').innerHTML = view.footHtml || '';
    showError('');
    const next = $('#next');
    next.textContent = view.cta || 'Continue';
    $('#foot').hidden = view.noFoot === true;
    next.hidden = view.noNext === true;
    next.disabled = view.ok ? !view.ok() : false;
    const alt = $('#alt');
    alt.hidden = !view.alt;
    if (view.alt) alt.textContent = view.alt.label;
    if (view.bind) view.bind();
    syncOn();
    window.scrollTo(0, 0);
    const h = $('h1', panel);
    if (h && dir !== 'none') { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  /** The selected look, for a browser without CSS :has(). */
  function syncOn() { $$('label.opt').forEach((l) => { const i = l.querySelector('input'); l.classList.toggle('is-on', !!(i && i.checked)); }); }

  /* ── pieces of markup ───────────────────────────────────── */
  const TICK = '<span class="opt-tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5.500 12.500l4.500 4.500L18.500 8"/></svg></span>';
  function opt({ type, name, value, checked, icon, title, sub, cls = '', leading }) {
    return `<label class="opt ${cls}">
      <input type="${type}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>
      ${leading || (icon ? `<span class="opt-icon">${icon}</span>` : '')}
      <span class="opt-text"><span class="opt-title">${esc(title)}</span>${sub ? `<span class="opt-sub">${esc(sub)}</span>` : ''}</span>
      ${TICK}
    </label>`;
  }
  const head = (q, sub) => `<h1 class="ob-q">${esc(q)}</h1>${sub ? `<p class="ob-sub">${marked(sub)}</p>` : ''}`;
  const STEP_DOT = '<span class="step-dot"><svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></span>';

  /**
   * A little burst of giraffe spots when the lesson is ready. Decorative; reduced motion shows none.
   * It goes off in the empty space between the words and the button and stays inside it, because a dot flying across the heading or the card is hard to read through (owner, 7 Nov). No room on this screen: no burst.
   */
  function spots() {
    if (calm()) return;
    const view = $('#panel .ob-view');
    const foot = $('#foot');
    if (!view || !foot) return;
    const box = view.getBoundingClientRect();
    const gap = foot.getBoundingClientRect().top - box.bottom;
    if (gap < 96) return;
    const dots = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      const d = 0.6 + (i % 3) * 0.2; // of the room each way, leaving the biggest dot's width clear
      const x = Math.cos(a) * d * (Math.min(box.width, 320) / 2 - 18);
      const y = Math.sin(a) * d * (gap / 2 - 18);
      return `<i style="--x:${Math.round(x)}px;--y:${Math.round(y)}px;--s:${8 + (i % 4) * 3}px;animation-delay:${(i % 4) * 40}ms"></i>`;
    }).join('');
    const host = document.createElement('div');
    host.className = 'spots';
    host.setAttribute('aria-hidden', 'true');
    host.style.top = `${box.height + gap / 2}px`;
    host.innerHTML = dots;
    view.appendChild(host);
  }

  /* ── the steps ──────────────────────────────────────────── */
  const STEPS = {
    welcome: () => ({
      hero: true,
      back: null,
      mood: 'idle',
      bubble: '',
      cta: 'Get started',
      alt: signedIn() ? null : { label: 'I already have an account', run: () => { location.href = '/login'; } },
      html: '<div class="ob-welcome"><h1>From zero to Savant, with lessons built around you.</h1></div>',
      next: () => go('hello'),
    }),

    hello: () => ({
      hero: true,
      back: 'welcome',
      mood: 'wave',
      bubble: `${Tutor.greeting()} A short test, a few questions, then your first lesson, **built around you.**`,
      cta: 'Sounds good',
      html: '<h1 class="hello-h">Let\'s get you set up.</h1><p class="hello-sub">About 10 minutes. You can stop any time.</p>',
      next: () => go('age'),
    }),

    age: () => {
      const done = !!server.route;
      const after = () => { if (isChild()) return parentToAsk() ? 'parent' : 'test'; return server.agreed ? 'test' : 'agree'; };
      if (done) {
        return {
          back: 'hello',
          bubble: 'You already answered this one, so **we\'ll keep that answer.**',
          html: `${head('When were you born?')}<p class="ob-sub">Your first answer stands. <a href="/privacy">Privacy policy</a></p>`,
          next: () => go(after()),
        };
      }
      return {
        back: 'hello',
        bubble: 'First question. **We ask everyone.**',
        ok: () => false,
        html: `${head('When were you born?')}
          <div class="ob-body">
            <div class="dob">
              <label><span class="sr">Month</span><select class="select" id="m" name="birth_month" required><option value="">Month</option></select></label>
              <label><span class="sr">Year</span><select class="select" id="y" name="birth_year" required><option value="">Year</option></select></label>
            </div>
            <h2 class="ob-q2"><label for="c">Where do you live?</label></h2>
            <select class="select" id="c" name="country" required><option value="">Choose a country</option></select>
          </div>
          <p class="ob-fine">We keep the month and year with your account. It decides how your account is set up. <a href="/privacy">Privacy policy</a></p>`,
        bind: async () => {
          const [m, y, c] = [$('#m'), $('#y'), $('#c')];
          ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
            .forEach((name, i) => m.add(new Option(name, String(i + 1))));
          const now = new Date().getFullYear();
          for (let yr = now; yr >= now - 100; yr--) y.add(new Option(String(yr), String(yr)));
          const check = () => ready(!!(m.value && y.value && c.value));
          [m, y, c].forEach((n) => n.addEventListener('change', check));
          try {
            const cfg = await api('GET', '/api/consent/config');
            S.pendingDays = cfg.pending_days;
            cfg.countries.forEach((x) => c.add(new Option(x.name, x.code)));
          } catch (err) { showError('That did not load. Check your connection and reload.'); }
        },
        next: async () => {
          const out = await api('POST', '/api/consent/age', { birth_month: Number($('#m').value), birth_year: Number($('#y').value), country: $('#c').value });
          server.route = out.route;
          S.route = out.route;
          keep();
          if (signedIn()) server = await api('GET', '/api/ob2/state');
          go(after());
        },
      };
    },

    /* A real choice: neither answer is picked, and either one is one tap. The answers sit in the footer, so both show without scrolling on any phone. A child never sees this; their parent decides (routes/consent.js). */
    agree: () => {
      let pick = null;
      return {
        back: 'hello',
        bubble: 'Before anything else, **this is your call.**',
        ok: () => false,
        html: `${head('Do you agree to these?')}
          <div class="terms ob-body">
            ${C.AGREEMENT.items.map((t) => `<div class="term"><span class="opt-icon">${I[t.icon]}</span><div><h2>${esc(t.title)}</h2><p>${esc(t.text)}${t.link ? ` <a href="${esc(t.link.href)}">${esc(t.link.label)}</a>` : ''}</p></div></div>`).join('')}
          </div>`,
        footHtml: `<fieldset class="opts agree-opts"><legend class="sr">Your answer</legend>
            ${['agree', 'decline'].map((v) => `<label class="opt choice"><input type="radio" form="panel" name="agree" value="${v}"><span class="opt-text"><span class="opt-title">${v === 'agree' ? 'I agree to all three' : 'I don\'t agree'}</span></span>${TICK}</label>`).join('')}
          </fieldset>`,
        bind: () => $$('input[name="agree"]').forEach((r) => r.addEventListener('change', () => {
          pick = r.value;
          ready(true);
          Tutor.mood($('#tutor'), pick === 'agree' ? 'happy' : 'idle', 1400);
        })),
        next: async () => {
          if (pick !== 'agree') return go('declined');
          const out = await api('POST', '/api/ob2/agree', { decision: 'agree', version: C.AGREEMENT.version });
          S.user = out.user && out.user.id;
          keep();
          server = await api('GET', '/api/ob2/state');
          return go('test');
        },
      };
    },

    declined: () => ({
      back: 'agree',
      bubble: 'That\'s okay. **It\'s your choice.**',
      cta: 'Leave',
      alt: { label: 'I\'d like to choose again', run: () => go('agree') },
      html: `${head('You can\'t use the beta without this.')}
        <p class="ob-sub">Savant writes lessons with outside AI services, so it can't teach you without your agreement. Nothing about you has been saved to an account. <a href="/privacy">Read the privacy policy</a></p>`,
      next: () => { forget(); location.href = '/'; return new Promise(() => {}); },
    }),

    /* Under the consent age: the parent is told before anything is stored about the child, so this comes before the test, where the agreement would be. */
    parent: () => ({
      back: signedIn() ? null : 'hello',
      bubble: 'You can **keep going while you wait** for them.',
      cta: 'Email my parent',
      ok: () => false,
      html: `${head('Time to tell a grown-up.', `A parent or guardian needs to agree before everything in your account opens. We'll send them one email. If nobody answers in ${esc(S.pendingDays || 14)} days, this account is deleted.`)}
        <div class="ob-body">
          ${signedIn() ? '' : `<label class="field"><span class="field-label">Your first name or a nickname</span>
            <input class="input" name="nickname" autocomplete="nickname" minlength="2" maxlength="32" value="${esc(S.nickname || '')}"></label>`}
          <label class="field"><span class="field-label">Your parent's or guardian's email</span>
            <input class="input" type="email" name="parent_email" autocomplete="off" inputmode="email"></label>
        </div>
        <p class="ob-fine">Until they agree, the camera, the microphone and AI chat stay off. Everything with taps and buttons works. <a href="/privacy#children">How we look after children's data</a></p>`,
      bind: () => {
        const n = $('input[name="nickname"]');
        const p = $('input[name="parent_email"]');
        const check = () => ready((!n || n.value.trim().length >= 2) && /.+@.+\..+/.test(p.value.trim()));
        [n, p].filter(Boolean).forEach((x) => x.addEventListener('input', check));
        check();
      },
      next: async () => {
        const n = $('input[name="nickname"]');
        const nickname = n ? n.value.trim() : undefined;
        S.nickname = nickname;
        keep();
        const out = await begin({ ...(n ? { nickname } : {}), parent_email: $('input[name="parent_email"]').value.trim() });
        if (out.user && out.user.consent && out.user.consent.locked) { location.href = '/parent-needed'; return; }
        S.emailFailed = out.consent_email_sent === false;
        keep();
        server = await api('GET', '/api/ob2/state');
        go('test');
      },
    }),

    /* The short test: the baseline's Quick tasks, or the style quiz where the baseline is closed to this learner. It says plainly what it is. */
    test: () => {
      const t = server.test || {};
      if (t.done || t.pending) {
        return {
          back: 'hello',
          bubble: 'You\'ve done this one. **Next.**',
          mood: 'happy',
          html: head('Test done.', 'Your answers are kept, and your lessons start from them.'),
          next: () => go('into'),
        };
      }
      const skip = { label: 'Skip for now', run: async () => { S.a.test_skipped = true; keep(); await saveAnswers(); go('into'); } };
      if (!t.allowed) {
        return {
          back: 'hello',
          bubble: S.emailFailed
            ? 'The email to your parent **didn\'t send.** You can try again when you save. Let\'s keep going.'
            : 'Email sent. **Now, a quick quiz.**',
          mood: 'idle',
          cta: 'Start the quiz',
          alt: skip,
          html: `${head('First, a short quiz.', '20 quick choices. **About 2 minutes.**')}
            <div class="facts ob-body">
              <div class="fact"><span class="opt-icon">${I.tap}</span><p>Tap the one that sounds more like you.</p></div>
              <div class="fact"><span class="opt-icon">${I.curious}</span><p>There are no right answers. It helps set how your sessions run: how long they are, when you see feedback, how much gets explained.</p></div>
            </div>`,
          next: () => go('testing'),
        };
      }
      return {
        back: 'hello',
        bubble: 'Just do your best. **This isn\'t a grade.**',
        mood: 'idle',
        cta: 'Start the test',
        alt: skip,
        html: `${head('First, a short test.', '**About 5 minutes.** You can stop early, and what you\'ve done still counts.')}
          <div class="facts ob-body">
            <div class="fact"><span class="opt-icon">${I.memory}</span><p>Remember some numbers.</p></div>
            <div class="fact"><span class="opt-icon">${I.spot}</span><p>Spot which numbers match, fast.</p></div>
            <div class="fact"><span class="opt-icon">${I.tap}</span><p>Tap what sounds more like you when you learn.</p></div>
          </div>
          <p class="ob-fine">It gives a rough first picture, not a score or a diagnosis. Your lessons start from it, and what you do in them keeps correcting it.</p>`,
        next: () => go('testing'),
      };
    },

    testing: () => {
      const t = server.test || {};
      const adult = !!t.allowed;
      setTimeout(adult ? testRun : quizRun, 0);
      return {
        back: 'test',
        within: 0,
        noNext: true,
        bubble: adult ? 'Go with your first thought.' : 'No right answers here.',
        mood: 'think',
        alt: { label: 'Stop here and keep what I\'ve done', run: adult ? testStop : quizStop },
        html: '<h1 class="sr">The short test</h1><p class="t-left" id="t-left"></p><div id="task"><p class="ob-sub">Getting the first one.</p></div>',
        next: () => {},
      };
    },

    into: () => {
      const count = () => S.a.interests.length;
      const askText = () => S.a.interests.includes('other') && !isChild();
      const okNow = () => count() > 0 && (!askText() || S.a.interest_text.trim().length >= 2);
      const lastPick = C.INTERESTS.find((i) => i.id === S.a.interests[S.a.interests.length - 1]);
      T.interestsShown = Date.now();
      return {
        back: 'test',
        bubble: lastPick ? lastPick.reply : (testClear() && !S.a.test_skipped ? 'That\'s the test done. **Nice work.**' : 'Tell me **what you like.**'),
        mood: lastPick ? 'idle' : 'happy',
        ok: okNow,
        html: `${head('What are you into?', 'Pick as many as you like. Your lessons will use them.')}
          <fieldset class="opts tiles ob-body"><legend class="sr">Your interests</legend>
            ${C.INTERESTS.map((i) => opt({ type: 'checkbox', name: 'interest', value: i.id, checked: S.a.interests.includes(i.id), icon: I[i.icon], title: i.title, cls: 'tile' })).join('')}
            ${opt({ type: 'checkbox', name: 'interest', value: 'other', checked: S.a.interests.includes('other'), icon: I.other, title: 'Something else', cls: 'tile' })}
          </fieldset>
          ${isChild() ? '' : `<label class="field ob-other" id="other-field"${askText() ? '' : ' hidden'}><span class="field-label">What is it?</span>
            <input class="input" id="other" name="interest_text" maxlength="80" autocomplete="off" value="${esc(S.a.interest_text)}" placeholder="Rock climbing, K-pop, baking bread"></label>`}`,
        bind: () => {
          $$('input[name="interest"]').forEach((r) => r.addEventListener('change', () => {
            S.a.interests = S.a.interests.filter((i) => i !== r.value);
            if (r.checked) S.a.interests.push(r.value);
            S.a.interest = S.a.interests[0] || null;
            keep();
            if (r.checked) {
              const pick = C.INTERESTS.find((i) => i.id === r.value);
              say(pick ? pick.reply : (isChild() ? 'Fair enough. **I\'ll show you what I can.**' : 'Tell me. **I\'m listening.**'), 'happy');
            }
            const f = $('#other-field');
            if (f) { f.hidden = !askText(); if (r.value === 'other' && r.checked) $('#other').focus(); }
            ready(okNow());
          }));
          const other = $('#other');
          if (other) other.addEventListener('input', () => { S.a.interest_text = other.value; keep(); ready(okNow()); });
        },
        next: async () => {
          await saveAnswers();
          await handInInterests();
          go('learn');
        },
      };
    },

    learn: () => {
      const okNow = () => S.a.tracks.length > 0 || S.a.notes;
      const lastTrack = S.a.tracks[S.a.tracks.length - 1];
      const order = () => {
        $$('input[name="track"]').forEach((b) => {
          const at = S.a.tracks.indexOf(b.value);
          const label = b.closest('label');
          if (at >= 0) label.dataset.order = String(at + 1); else delete label.dataset.order;
        });
      };
      return {
        back: 'into',
        bubble: lastTrack ? (C.TRACK_REPLY[lastTrack] || 'Good pick.') : 'Thanks. **Now the good part.**',
        ok: okNow,
        html: `${head('What do you want to learn?', 'Pick one or a few. You start with number 1.')}
          <fieldset class="opts subjects ob-body"><legend class="sr">Subjects</legend>
            ${catalog.map((t) => opt({ type: 'checkbox', name: 'track', value: t.id, checked: S.a.tracks.includes(t.id), icon: I[t.id] || I.other, title: t.name, sub: C.TRACK_LINES[t.id], cls: 'subject' })).join('')}
            ${isChild() ? '' : opt({ type: 'checkbox', name: 'notes', value: 'notes', checked: S.a.notes, icon: I.notes, title: 'My own notes', sub: 'Turn your files into lessons', cls: 'subject' })}
          </fieldset>`,
        bind: () => {
          order();
          $$('input[name="track"]').forEach((box) => box.addEventListener('change', () => {
            S.a.tracks = S.a.tracks.filter((t) => t !== box.value);
            if (box.checked) { S.a.tracks.push(box.value); say(C.TRACK_REPLY[box.value] || `**${trackOf(box.value).name}.** Good pick.`, 'happy'); }
            keep();
            order();
            ready(okNow());
          }));
          const notes = $('input[name="notes"]');
          if (notes) notes.addEventListener('change', () => {
            S.a.notes = notes.checked;
            if (notes.checked) say(C.TRACK_REPLY.notes, 'happy');
            keep();
            ready(okNow());
          });
        },
        next: async () => {
          await saveAnswers();
          if (notesOnly() && signedIn()) {
            // Only their own notes, and the account already exists: straight to uploading.
            await api('POST', '/api/ob2/lesson-opened', {}).catch(() => {});
            forget();
            location.href = '/my-material';
            return new Promise(() => {});
          }
          return go(notesOnly() ? 'save' : 'grade');
        },
      };
    },

    /* The clear choice: pick it, or take the placement. Neither is picked for them. */
    grade: () => {
      const word = gradeWord();
      const okNow = () => !!S.gradeWay;
      return {
        back: 'learn',
        bubble: S.gradeWay === 'walk' ? 'Good call. **"I don\'t know" is a fine answer in there.**' : 'Where should **we start?**',
        ok: okNow,
        html: `${head(`Your ${word} in ${trackName()}?`)}
          <fieldset class="opts ob-body way"><legend class="sr">How to choose your starting ${word}</legend>
            ${opt({ type: 'radio', name: 'way', value: 'know', checked: S.gradeWay === 'know', icon: I.school, title: `I know my ${word}`, sub: 'Pick it from a list.' })}
            ${opt({ type: 'radio', name: 'way', value: 'walk', checked: S.gradeWay === 'walk', icon: I.spot, title: 'Take the placement', sub: 'Short questions that change as you answer. About 5 minutes.' })}
          </fieldset>`,
        bind: () => $$('input[name="way"]').forEach((r) => r.addEventListener('change', () => {
          S.gradeWay = r.value;
          keep();
          ready(true);
          say(r.value === 'walk' ? 'Good call. **"I don\'t know" is a fine answer in there.**' : 'Easy. **You can change it later.**', 'happy');
        })),
        next: async () => {
          await begin();
          go(S.gradeWay === 'know' ? 'pick' : 'level');
        },
      };
    },

    pick: () => {
      const t = trackOf(firstTrack());
      return {
        back: 'grade',
        bubble: 'Sure. **You can change it later.**',
        cta: 'Start here',
        ok: () => !!S.pick,
        html: `${head(`Which ${gradeWord()}?`)}
          <fieldset class="opts ob-body"><legend class="sr">Starting grade in ${esc(t ? t.name : '')}</legend>
            ${(t ? t.grades : []).map((g) => { const [a, b] = gradeParts(g.name); return opt({ type: 'radio', name: 'grade', value: g.id, checked: S.pick === g.id, title: a, sub: b, cls: 'choice' }); }).join('')}
          </fieldset>`,
        bind: () => $$('input[name="grade"]').forEach((r) => r.addEventListener('change', () => { S.pick = r.value; keep(); ready(true); })),
        next: async () => {
          await begin();
          S.chosen = S.pick;
          keep();
          go('building');
        },
      };
    },

    level: () => {
      setTimeout(walkBoot, 0);
      return {
        back: 'grade',
        within: 0,
        bubble: '"I don\'t know" is **a really useful answer.** Use it whenever it\'s true.',
        mood: 'think',
        ok: () => false,
        alt: { label: "I don't know", run: () => walkAnswer('') },
        html: '<h1 class="sr">Finding your level</h1><div id="walk"><p class="ob-sub">Getting your first question.</p></div>',
        next: () => walkAnswer(W.pending),
      };
    },

    result: () => {
      const r = S.result || {};
      const grades = r.grades || [];
      const at = Math.max(0, grades.findIndex((g) => g.grade_id === r.recommended_grade_id));
      const [name, band] = gradeParts(r.recommended_grade_name);
      const pct = grades.length > 1 ? (at / (grades.length - 1)) * 100 : 50;
      return {
        back: null,
        bubble: r.from_age
          ? 'I didn\'t get enough answers to place you, so this is **based on your age.** Your first lessons check it.'
          : 'Your first lessons **check this too,** so it doesn\'t have to be perfect.',
        mood: 'happy',
        cta: 'That works',
        html: `<span class="ob-eyebrow">${esc(trackName())}</span>${head(`Start at ${name || 'the beginning'}.`, band || '')}
          ${grades.length > 1 ? `<div class="scale" role="img" aria-label="Grade ${at + 1} of ${grades.length}">
            <div class="scale-line"><div class="scale-fill" style="width:${pct}%"></div></div>
            <div class="scale-you" style="left:clamp(24px, ${pct}%, calc(100% - 24px))"><b>You</b><i></i></div>
          </div>
          <div class="scale-ends"><span>Grade 1</span><span>Grade ${grades.length}</span></div>` : ''}
          <div class="mini-row"><button class="mini" type="button" data-adjust="too_easy">Too easy</button><button class="mini" type="button" data-adjust="too_hard">Too hard</button></div>
          <p class="ob-fine"><a href="#pick" id="pick-other">Pick a different starting point</a>, or take <a href="/subject-placement?track=${encodeURIComponent(firstTrack() || '')}&again=1">a longer, more accurate check</a>.</p>`,
        bind: () => {
          $$('[data-adjust]').forEach((b) => b.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            try {
              const out = await api('POST', `/api/subject-placement/${encodeURIComponent(firstTrack())}/adjust`, { said: b.dataset.adjust });
              S.result = out;
              keep();
              render('result', 'none');
              say(out.moved === false ? 'That\'s already **the end of the scale.**' : (b.dataset.adjust === 'too_easy' ? 'Moved **one grade up.**' : 'Moved **one grade down.**'), 'happy');
            } catch (err) { showError(err.message); } finally { busy = false; }
          }));
        },
        next: () => go('building'),
      };
    },

    /* True to what is happening: each line ticks when the server has actually done it. */
    building: () => {
      setTimeout(buildPath, 0);
      return {
        back: null,
        noNext: true,
        bubble: 'Putting it together.',
        mood: 'think',
        html: `${head('Building your path')}
          <ol class="steps" id="steps">
            <li class="step" data-s="grade">${STEP_DOT}<span class="step-text">Setting your starting point</span></li>
            <li class="step" data-s="lesson">${STEP_DOT}<span class="step-text">${esc(buildLessonLine())}</span></li>
          </ol>`,
      };
    },

    ready: () => {
      const e = server.enrollment || S.enrollment || {};
      const [name, band] = gradeParts(e.grade_name);
      return {
        back: null,
        bubble: signedIn() ? 'Ready when you are. **Let\'s go.**' : 'Ready when you are. Your answers are **safe here** while you do it.',
        mood: 'cheer',
        cta: 'Open my first lesson',
        bind: spots,
        html: `${head('Your first lesson is ready.')}
          <div class="lesson-card">
            <div class="lc-tag"><span>${I[e.track_id] || I.other}</span>${esc((trackOf(e.track_id) || {}).name || '')}</div>
            <h2>${esc(name)}</h2>
            ${band ? `<p>${esc(band)}</p>` : ''}
            ${S.goalSummary ? `<p>${esc(S.goalSummary)} You can change this any time on your profile.</p>` : ''}
          </div>
          ${signedIn()
            ? S.a.tracks.slice(1).map((id) => { const t = trackOf(id); return t ? `<p class="ob-fine">After this, <a href="/subject-placement?track=${encodeURIComponent(id)}">start ${esc(t.name)}</a>.</p>` : ''; }).join('')
            : `<p class="ob-fine">${isChild() ? 'This browser keeps your progress while your account waits for a parent.' : 'This browser keeps your progress for 30 days.'} Save it after the lesson so it's yours for good.</p>`}`,
        next: async () => {
          await api('POST', '/api/ob2/lesson-opened', {}).catch(() => {});
          if (signedIn()) forget();
          location.href = e.href;
          return new Promise(() => {}); // stays busy until the page goes, so a double tap does nothing
        },
      };
    },

    save: () => (isChild() ? saveChild() : saveSelf()),

    done: () => {
      const extra = [];
      const rest = S.a.tracks.slice(1);
      const e = S.enrollment || {};
      if (S.a.notes && !isChild()) extra.push(link('/my-material', I.notes, 'Upload your notes', 'Turn your files into lessons'));
      rest.forEach((id) => { const t = trackOf(id); if (t) extra.push(link(`/subject-placement?track=${encodeURIComponent(id)}`, I[id] || I.other, `Start ${t.name}`, 'The subject you also picked')); });
      if (e.id) extra.push(link(`/placement?enrollment=${e.id}&retake=1`, I.arrow, 'Skip what you already know', 'A short check inside this grade'));
      if (e.id) extra.push(link('/profile#retention-goals-card', I.calendar, 'How long do you want to remember it?', 'Set to for good. Change it any time.'));
      if (S.a.test_skipped) extra.push(link(`/baseline?next=/dashboard&old=${encodeURIComponent('/style-quiz?next=/dashboard')}`, I.iq, 'Take the short test', 'You skipped it. About 5 minutes.'));
      extra.push(link('/reading-check', I.reading, 'Check your reading level', 'So the words fit you. Optional.'));
      return {
        back: null,
        bubble: 'Nice work. **See you soon.**',
        mood: 'cheer',
        cta: 'Go to my home',
        html: `${head('You\'re all set.')}<div class="done-list">${extra.join('')}</div>`,
        next: () => {
          forget();
          location.href = '/dashboard';
          return new Promise(() => {});
        },
      };
    },
  };

  function link(href, icon, title, sub) {
    return `<a class="opt" href="${esc(href)}"><span class="opt-icon">${icon}</span><span class="opt-text"><span class="opt-title">${esc(title)}</span><span class="opt-sub">${esc(sub)}</span></span></a>`;
  }

  /* ── the short test: same API and same scoring as /baseline ──────────── */
  const T = { run: 0, interestsShown: 0, seen: 0 };
  const LINES = ['Got it.', 'Nice.', 'Good.', 'Okay.', 'Thanks.', 'Next one.'];
  const taskCtx = {
    host: () => (current === 'testing' ? $('#task') : null),
    focus: (on) => { if (on) $('#ob').dataset.focus = '1'; else delete $('#ob').dataset.focus; },
  };
  function testShows(progress) {
    const within = progress && progress.budget_minutes ? Math.min(0.98, progress.elapsed_minutes / progress.budget_minutes) : 0;
    setBar('testing', within);
    const left = $('#t-left');
    if (left && progress) left.textContent = progress.minutes_left >= 1 ? `About ${Math.ceil(progress.minutes_left)} min left` : 'Nearly done';
  }
  function testResult(out) {
    if (out && out.done) { server.test = { ...server.test, done: true, pending: false, open: false }; return; }
    if (out && out.step && out.step.id === 'sv:interests') server.test = { ...server.test, pending: true };
  }
  async function testRun() {
    if (current !== 'testing') return;
    const run = (T.run += 1);
    const alive = () => run === T.run && current === 'testing';
    try {
      let out = await api('POST', '/api/onboarding/start', { mode: 'quick', resume: true, interests_last: true });
      const session = out.session;
      while (out && !out.done && alive()) {
        // The test's last question is the next screen's: same answer, same scoring.
        if (out.step.id === 'sv:interests') break;
        testShows(out.progress);
        const t = Date.now();
        const response = await ObTest.present(out.step, taskCtx);
        if (!alive()) return;
        T.seen += 1;
        if (out.step.kind === 'forced') say(LINES[T.seen % LINES.length], 'happy');
        else say('Nice. **On to the next one.**', 'happy');
        const task = $('#task');
        if (task) task.setAttribute('aria-busy', 'true');
        out = await api('POST', '/api/onboarding/answer', { session, id: out.step.id, response, ms: Date.now() - t, skip: response === null ? true : undefined });
        if (task) task.removeAttribute('aria-busy');
      }
      if (!alive()) return;
      testResult(out);
      go('into', { replace: true });
    } catch (err) {
      if (!alive()) return;
      if (err.status === 409) { render('testing', 'none'); return; } // the session moved on elsewhere: pick up from where the server says
      const task = $('#task');
      if (task) task.innerHTML = '';
      showError(err.message);
    }
  }
  async function testStop() {
    busy = true;
    T.run += 1;
    ObTest.cancel();
    try {
      const out = await api('POST', '/api/onboarding/stop', { interests_last: true });
      testResult(out);
    } catch (err) {
      if (err.status !== 409) { showError(err.message); return; }
      S.a.test_skipped = true; // nothing was open, so nothing was answered
      keep();
      await saveAnswers();
    } finally { busy = false; }
    go('into', { replace: true });
  }
  /** The last question of the test is the interests screen. A tile is a tap, not a short answer, so only what they typed under "Something else" is read (services/onboarding/tasks.js). */
  async function handInInterests() {
    if (!server.test || !server.test.pending) return;
    const words = S.a.interests.map((id) => {
      if (id === 'other') return S.a.interest_text.trim();
      const known = C.INTERESTS.find((i) => i.id === id);
      return known ? known.title : '';
    }).filter(Boolean).join(', ');
    try {
      const open = await api('POST', '/api/onboarding/start', { mode: 'quick', resume: true, interests_last: true });
      if (open.step && open.step.id === 'sv:interests') {
        const typed = S.a.interests.includes('other') && !isChild() ? S.a.interest_text.trim() : '';
        const out = await api('POST', '/api/onboarding/answer', { session: open.session, id: 'sv:interests', response: { text: words, tapped: true, typed }, ms: Date.now() - T.interestsShown });
        testResult(out);
      }
    } catch (err) {
      if (err.status !== 409) throw err;
    }
    server.test = { ...server.test, pending: false, done: true };
  }

  /* The fallback: the style quiz, one question at a time, for an account the baseline is closed to. Same questions, same scale, same endpoint as /style-quiz. */
  const Q = { questions: null, scale: null };
  async function quizRun() {
    if (current !== 'testing') return;
    const run = (T.run += 1);
    const alive = () => run === T.run && current === 'testing';
    try {
      if (!Q.questions) Object.assign(Q, await api('GET', '/api/style-quiz'));
      S.quiz = S.quiz || {};
      for (let i = 0; i < Q.questions.length; i += 1) {
        const q = Q.questions[i];
        if (S.quiz[q.id] == null) {
          if (!alive()) return;
          setBar('testing', i / Q.questions.length);
          const left = $('#t-left');
          if (left) left.textContent = `${i + 1} of ${Q.questions.length}`;
          const value = await ObTest.choice(q, Q.scale, taskCtx);
          if (!alive()) return;
          S.quiz[q.id] = Number(value);
          keep();
          say(LINES[i % LINES.length], 'happy');
        }
      }
      if (alive()) await quizHandIn();
    } catch (err) {
      if (alive()) showError(err.message);
    }
  }
  async function quizHandIn() {
    if (S.quiz && Object.keys(S.quiz).length) await api('POST', '/api/profile/style-quiz', { answers: S.quiz });
    else { S.a.test_skipped = true; await saveAnswers(); }
    S.quiz = null;
    server.test = { ...server.test, done: true };
    keep();
    go('into', { replace: true });
  }
  async function quizStop() {
    busy = true;
    T.run += 1;
    ObTest.cancel();
    try { await quizHandIn(); } catch (err) { showError(err.message); } finally { busy = false; }
  }

  /* ── saving ─────────────────────────────────────────────── */
  function passwordField() {
    return `<label class="field"><span class="field-label">Password</span>
      <span class="pw"><input class="input" type="password" name="password" autocomplete="new-password" minlength="8">
      <button type="button" class="pw-toggle" id="pw-toggle" aria-pressed="false" aria-label="Show password">${I.eye}</button></span>
      <span class="field-hint">At least 8 characters.</span></label>`;
  }
  function bindPassword() {
    const t = $('#pw-toggle');
    t.addEventListener('click', () => {
      const p = $('input[name="password"]');
      const show = p.type === 'password';
      p.type = show ? 'text' : 'password';
      t.setAttribute('aria-pressed', String(show));
      t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }
  function afterClaim() {
    S.claimed = true;
    S.a.interest_text = '';
    keep();
    Tutor.mood($('#tutor'), 'cheer', 1800);
    const nextUrl = new URLSearchParams(location.search).get('next');
    if (nextUrl && nextUrl.startsWith('/') && !nextUrl.startsWith('//')) { forget(); location.href = nextUrl; return; }
    go('done');
  }
  function saveSelf() {
    const hasLesson = !!(server.enrollment || S.enrollment);
    const e = server.enrollment || S.enrollment;
    return {
      back: hasLesson ? null : 'learn',
      bubble: hasLesson ? 'Good work. Let\'s make sure it\'s **still here tomorrow.**' : 'Your notes stay with your account, so **save first,** then upload.',
      cta: 'Save my progress',
      ok: () => false,
      alt: { label: hasLesson ? 'Not yet, keep learning' : 'I already have an account', run: () => { location.href = hasLesson ? `/path?enrollment=${e.id}` : '/login?next=/start'; } },
      html: `${head(hasLesson ? 'Keep what you\'ve done.' : 'Save, then upload.', hasLesson ? 'Everything so far comes with you.' : '')}
        <div class="ob-body">
          <label class="field"><span class="field-label">Your name</span><input class="input" name="display_name" autocomplete="name" minlength="2" maxlength="32"></label>
          <label class="field"><span class="field-label">Email</span><input class="input" type="email" name="email" autocomplete="email" inputmode="email"></label>
          ${passwordField()}
        </div>
        <p class="ob-fine">What you agreed to stays the same. <a href="/privacy">Privacy policy</a></p>
        ${hasLesson ? '<p class="ob-fine">Already have an account? <a href="/login?next=/start">Sign in</a>. Your test and level check come with you, but this lesson\'s answers stay here and aren\'t added.</p>' : ''}`,
      bind: () => {
        bindPassword();
        const check = () => ready($('input[name="display_name"]').value.trim().length >= 2 && /.+@.+\..+/.test($('input[name="email"]').value.trim()) && $('input[name="password"]').value.length >= 8);
        $$('.input').forEach((n) => n.addEventListener('input', check));
      },
      onError: (err) => {
        if (err.code === 'email_taken') say('That email already has an account. **You can sign in instead;** nothing here is lost.', 'idle');
      },
      next: async () => {
        await api('POST', '/api/ob2/claim', {
          display_name: $('input[name="display_name"]').value.trim(),
          email: $('input[name="email"]').value.trim(),
          password: $('input[name="password"]').value,
          ref: S.ref,
        });
        afterClaim();
      },
    };
  }
  function saveChild() {
    const c = server.consent || {};
    const e = server.enrollment || S.enrollment;
    return {
      back: null,
      bubble: `Well done${server.nickname ? `, ${server.nickname}` : ''}. **Now make your login** so you can get back in.`,
      cta: 'Save my progress',
      ok: () => false,
      alt: e ? { label: 'Not yet, keep learning', run: () => { location.href = `/path?enrollment=${e.id}`; } } : null,
      html: `${head('Make your login.')}
        <div class="ob-body">
          <label class="field"><span class="field-label">Username</span>
            <input class="input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="24">
            <span class="field-hint">You sign in with this. Not your real name or an email.</span></label>
          ${passwordField()}
        </div>
        <div class="parent-note" id="parent-note">${c.has_request
          ? `We emailed your parent or guardian${c.parent_email ? ` at ${esc(c.parent_email)}` : ''}. Ask them to check their inbox and spam folder. <button type="button" class="link-btn inline" id="resend">Send it again</button>`
          : (c.state === 'active' ? 'Your parent or guardian has agreed.' : '')}</div>`,
      bind: () => {
        bindPassword();
        const check = () => ready($('input[name="username"]').value.trim().length >= 3 && $('input[name="password"]').value.length >= 8);
        $$('.input').forEach((n) => n.addEventListener('input', check));
        const r = $('#resend');
        if (r) r.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          try { await api('POST', '/api/consent/child/request', {}); say('Sent again. **Ask them to check their spam folder too.**', 'happy'); } catch (err) { showError(err.message); } finally { busy = false; }
        });
      },
      next: async () => {
        await api('POST', '/api/ob2/claim', { username: $('input[name="username"]').value.trim(), password: $('input[name="password"]').value });
        afterClaim();
      },
    };
  }

  /** Make the guest row if there isn't one (under the consent age), and bring it up to date. */
  async function begin(extra) {
    const out = await api('POST', '/api/ob2/begin', { answers: S.a, ...(extra || {}) });
    if (!signedIn()) server.guest = true;
    return out;
  }
  /** Keep the answers on the guest row. */
  async function saveAnswers() {
    if (hasRow()) await api('POST', '/api/ob2/answers', S.a);
  }

  /* ── the placement: the adaptive walk, through the same API as the old page ───── */
  const W = { questions: [], answers: [], i: 0, asked: 0, grade: null, pending: null };
  const walkPath = (rest) => `/api/subject-placement/${encodeURIComponent(firstTrack())}/${rest}`;

  function loadBlock(out) {
    W.grade = out.next_grade_id || out.grade_id;
    W.questions = out.questions || [];
    W.answers = [];
    W.i = 0;
    W.asked = out.asked_so_far || 0;
    const draft = out.placement && out.placement.draft && out.placement.draft.grade_id === W.grade ? out.placement.draft.answers || {} : {};
    W.questions.forEach((q, i) => { const k = Number.isInteger(q.index) ? q.index : i; if (draft[k] != null) W.answers[i] = draft[k]; });
    while (W.i < W.questions.length && W.answers[W.i] != null) W.i++;
  }

  async function walkBoot() {
    if (current !== 'level') return;
    try {
      const out = await api('POST', walkPath('start'), { mode: 'quick' });
      if (current !== 'level') return;
      if (out.writing || (!out.ready && !out.questions.length)) {
        $('#walk').innerHTML = `<p class="ob-sub">The questions for this subject are being written for the first time. That can take a few minutes, so you can start at a grade you pick instead.</p>
          <button class="mini solo" type="button" id="to-pick">Pick my starting point</button>`;
        $('#to-pick').addEventListener('click', () => go('pick'));
        setTimeout(walkBoot, 6000);
        return;
      }
      if (out.placement && (out.placement.finished_at || out.placement.recommendation) && !out.questions.length) return await walkFinish();
      if (!out.questions.length) return await walkFinish();
      loadBlock(out);
      if (W.i >= W.questions.length) return await walkHandIn();
      walkShow();
    } catch (err) {
      $('#walk').innerHTML = '';
      showError(err.message);
    }
  }

  function walkShow() {
    const q = W.questions[W.i];
    const n = W.asked + W.i + 1;
    W.pending = null;
    setBar('level', Math.min(0.95, (n - 1) / 12));
    const walk = $('#walk');
    const choices = q.choices || null;
    const name = `q${n}`;
    walk.innerHTML = `<div class="ob-view" data-dir="next">
      <span class="ob-eyebrow">Question ${n}</span>
      <h2 class="q-prompt" id="q-prompt" tabindex="-1">${esc(q.prompt)}</h2>
      ${choices
        ? `<fieldset class="opts ob-body"><legend class="sr">Answer</legend>${choices.map((c) => opt({ type: 'radio', name, value: c, title: c, cls: 'choice' })).join('')}</fieldset>`
        : '<label class="field ob-body"><span class="field-label">Your answer</span><input class="input" id="typed" name="typed" autocomplete="off"></label>'}
      <button class="link-btn quiet" type="button" id="stop-walk">Stop here and see my level</button>
    </div>`;
    ready(false);
    $$(`input[name="${name}"]`).forEach((r) => r.addEventListener('change', () => { W.pending = r.value; ready(true); Tutor.mood($('#tutor'), 'think'); }));
    const typed = $('#typed');
    if (typed) typed.addEventListener('input', () => { W.pending = typed.value; ready(!!typed.value.trim()); });
    $('#stop-walk').addEventListener('click', () => { if (!busy) walkQuit(); });
    window.scrollTo(0, 0);
    $('#q-prompt').focus({ preventScroll: true });
  }

  const REPLIES = ['Got it.', 'Thanks.', 'Noted.', 'Okay.', 'Next one.', 'Good, that helps.'];
  async function walkAnswer(answer) {
    if (current !== 'level' || !W.questions.length || W._going) return;
    W._going = true;
    try {
      const value = answer == null ? '' : answer;
      W.answers[W.i] = value;
      const q = W.questions[W.i];
      api('POST', walkPath('answer'), { grade_id: W.grade, index: Number.isInteger(q.index) ? q.index : W.i, answer: value }).catch(() => {}); // sent again when handed in
      say(REPLIES[(W.asked + W.i) % REPLIES.length], 'think');
      W.i++;
      if (W.i >= W.questions.length) await walkHandIn();
      else walkShow();
    } catch (err) {
      W.i = Math.max(0, W.i - 1);
      showError(err.message);
    } finally {
      W._going = false;
    }
  }

  const handIn = () => W.questions.map((q, i) => ({ index: Number.isInteger(q.index) ? q.index : i, answer: W.answers[i] == null ? '' : W.answers[i] }));

  async function walkHandIn() {
    ready(false);
    const out = await api('POST', walkPath('grade'), { grade_id: W.grade, answers: handIn() });
    if (out.stopped || !out.next_grade_id || !(out.questions || []).length) return walkFinish();
    loadBlock(out);
    return walkShow();
  }
  async function walkFinish() {
    S.result = await api('POST', walkPath('finish'), {});
    keep();
    go('result', { replace: true });
  }
  async function walkQuit() {
    busy = true;
    try {
      if (!W.asked && !W.answers.length) { go('pick'); return; }
      S.result = await api('POST', walkPath('quit'), { grade_id: W.grade, answers: handIn() });
      keep();
      go('result', { replace: true });
    } catch (err) { showError(err.message); } finally { busy = false; }
  }

  /* ── the "building your path" moment: real calls, real ticks ─────────── */
  async function buildPath() {
    if (current !== 'building') return;
    const mark = (name, state) => { const li = $(`.step[data-s="${name}"]`); if (li) { li.classList.remove('is-now', 'is-done'); li.classList.add(state); } };
    const line = (name, text) => { const n = $(`.step[data-s="${name}"] .step-text`); if (n) n.textContent = text; };
    const breath = () => new Promise((r) => setTimeout(r, calm() ? 0 : 450));
    try {
      await begin();
      mark('grade', 'is-now');
      const body = { track: firstTrack() };
      const picked = S.chosen || (S.result && S.result.recommended_grade_id);
      if (picked) body.grade_id = picked;
      const out = await api('POST', '/api/ob2/first-lesson', body);
      S.enrollment = out.enrollment;
      server.enrollment = out.enrollment;
      S.goalSummary = out.goal && out.goal.summary;
      keep();
      await breath();
      mark('grade', 'is-done');
      mark('lesson', 'is-now');
      // The learner's own lesson: this really waits for its first part to be written and checked. A long wait hands over to the standard one, and says so.
      const own = out.enrollment.own;
      if (!own) line('lesson', 'Finding your first lesson');
      if (own) {
        say('Writing it for you now. **This can take a minute or two.**', 'think');
        const started = Date.now();
        let open = false;
        while (!open && Date.now() - started < 150000 && current === 'building') {
          const got = await api('GET', own.api).catch(() => null);
          open = !!(got && !got.writing);
          if (!open) await new Promise((r) => setTimeout(r, 3000));
        }
        if (!open) S.goalSummary = 'Your own version is still being written, so this starts with the standard lesson.';
        S.ownReady = open;
        keep();
      }
      await breath();
      mark('lesson', 'is-done');
      Tutor.mood($('#tutor'), 'happy', 1200);
      await breath();
      if (current === 'building') go('ready', { replace: true });
    } catch (err) {
      showError(err.message);
      $('#next').hidden = false;
      $('#next').textContent = 'Try again';
      view.next = () => { $('#next').hidden = true; return buildPath(); };
    }
  }

  function buildLessonLine() {
    if (isChild()) return 'Finding your first lesson';
    const first = S.a.interests[0];
    const known = C.INTERESTS.find((i) => i.id === first);
    const about = known ? known.title.toLowerCase() : (S.a.interest_text || '').trim();
    return about ? `Writing your first lesson around ${about}` : 'Writing your first lesson';
  }

  /* ── start ──────────────────────────────────────────────── */
  function firstStep() {
    if (S.claimed) return 'done';
    if (signedIn()) {
      if (server.enrollment) return 'ready';
      return S.step && ORDER.includes(S.step) ? S.step : 'welcome';
    }
    if (server.guest) {
      if (server.lesson_opened) return 'save';
      if (server.enrollment) return 'ready';
      return S.step && ORDER.includes(S.step) ? S.step : 'test';
    }
    return S.step && ORDER.includes(S.step) ? S.step : 'welcome';
  }

  async function boot() {
    load();
    const q = new URLSearchParams(location.search);
    try {
      [server, { tracks: catalog }] = await Promise.all([api('GET', '/api/ob2/state'), api('GET', '/api/catalog?view=grades')]);
    } catch (err) {
      root.innerHTML = '<div class="ob-loading">That did not load. Check your connection and reload.</div>';
      return;
    }
    // The private beta, signed out: this flow is for accounts.
    if (server.signed_out) { forget(); location.replace(server.go); return; }
    // A stored flag from a finished run must not outlive the account it belonged to.
    if (S.claimed && !server.account) S.claimed = false;
    // An existing account is never sent through this again, unless it has no subject yet in the private beta.
    if (server.account && !server.onboarding && !S.claimed) { forget(); location.replace(server.go); return; }
    // This device's answers belong to one account.
    if (signedIn() && S.who !== server.id) { forget(); S = { a: { tracks: [], notes: false, interests: [], interest: null, interest_text: '', test_skipped: false }, claimed: false, who: server.id }; }
    if (server.guest || signedIn()) {
      // The server's copy wins where this device has lost its own.
      const a = server.answers || {};
      if (!S.a.tracks.length && !S.a.notes) { S.a.tracks = a.tracks || []; S.a.notes = !!a.notes; }
      if (!S.a.interests.length) { S.a.interests = a.interests || []; S.a.interest = a.interest || null; S.a.interest_text = a.interest_text || ''; }
      if (a.test_skipped) S.a.test_skipped = true;
      S.route = server.route;
      if (signedIn() && server.enrollment) S.enrollment = server.enrollment;
    } else if (!server.route) {
      S.route = null; // the age answer has gone (a new session): the steps past it ask again
    }
    if (q.get('ref') && /^[a-z0-9]{8}$/.test(q.get('ref'))) { S.ref = q.get('ref'); S.a.ref = S.ref; }
    const wanted = q.get('track');
    if (wanted && trackOf(wanted) && !S.a.tracks.includes(wanted)) S.a.tracks.unshift(wanted);
    keep();
    shell();
    window.addEventListener('popstate', () => { const s = location.hash.slice(1); if (s && s !== current) render(s, 'back'); });
    window.addEventListener('hashchange', () => { const s = location.hash.slice(1); if (s && s !== current) render(s, 'next'); });
    const hash = location.hash.slice(1);
    const step = hash && STEPS[hash] ? hash : firstStep();
    history.replaceState(null, '', `${location.pathname}${location.search}#${step}`);
    render(step, 'none');
    root.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('#pick-other');
      if (a) { e.preventDefault(); go('pick'); }
    });
  }
  boot();
}());
