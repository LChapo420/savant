/* The onboarding at /start in the approved look, under UI_V2 (docs/UI-V2.md, docs/ONBOARDING-V2.md). Loaded in <head>; js/start.js calls ObLook.install() just before it boots.
 *
 * js/start.js still runs the whole flow: the steps, their order, the server calls, the consent gates. services/ui-v2.js serves it with three small hooks when the flag is on. This file only:
 *   - puts each step's question in the giraffe's bubble, shows the giraffe the mockup's way, and swaps icons and a few words to the mockup's
 *   - adds the step "How do you want to learn?" before the subjects, stored with the onboarding answers as `how`. Under the consent age there is no such step: child accounts can't upload (routes/consent.js)
 *   - takes "My own notes" off the subjects. `notes` stays the answer it always was: true for "own" and "both"
 * Own material: upload, then home, with no subject or grade. Both: subject and grade, then upload. On the public flow a guest can't upload until the account is saved, so saving comes first.
 */
(function () {
  const root = document.documentElement;
  // js/start-boot.js set data-theme from the sun/moon choice; tokens.css reads data-mode, as on the app's pages.
  function mode() {
    const forced = root.getAttribute('data-theme');
    const dark = forced ? forced === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.mode = dark ? 'dark' : 'light';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = dark ? '#14161a' : '#ffffff'; });
  }
  mode();
  document.addEventListener('DOMContentLoaded', mode);

  // The mockup's icons: one thin line weight, on a 24 grid.
  const PATHS = {
    book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM8.5 7.5h7',
    upload: 'M6 3h8l4 4v14H6zM14 3v4h4M12 17.5v-6M9.5 14 12 11.5l2.500 2.500',
    layers: 'M12 3 3 8l9 5 9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
    math: 'M18 5H6l6.5 7L6 19h12',
    english: 'M5 20 11 4.5h2L19 20M7.5 14.5h9',
    reading: 'M12 6.5C10 5 7 4.5 3 4.5V19c4 0 7 .5 9 2 2-1.500 5-2 9-2V4.5c-4 0-7 .5-9 2zM12 6.5V21',
    iq: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.500 1 2.500h6c0-1 .2-1.700 1-2.500A6 6 0 0 0 12 3z',
    act: 'M4 20l1-4.5L16 4.5 19.5 8 8.5 19zM14 6.5 17.5 10',
    spanish: 'M4 5h16v11H10.5L6.5 20v-4H4z',
    chess: 'M12 3a3 3 0 0 0-2 5.200L8.500 10.500h7L14 8.200A3 3 0 0 0 12 3zM10.200 10.500c0 2.800-.9 4.800-2.400 6.500h8.400c-1.500-1.700-2.400-3.700-2.400-6.500M6 21h12l-1-4H7z',
    piano: 'M4 4h16v16H4zM9.300 4v9.500M14.700 4v9.500M9.300 13.500V20M14.700 13.500V20',
    basketball: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3v18M5.700 5.700c3 3.200 3 9.400 0 12.600M18.300 5.700c-3 3.200-3 9.400 0 12.600',
    x: 'M6.500 6.500l11 11M17.500 6.500l-11 11',
    back: 'M15 5l-7 7 7 7',
  };
  const icon = (n, s = 24, w = 1.75) => `<svg viewBox="0 0 24 24" style="width:${s}px;height:${s}px" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[n]}"/></svg>`;

  /** Short enough to stand in the bubble. */
  const ASK_MAX = 110;
  const AFTER_STEPS = ['learn', 'grade', 'pick', 'level', 'result', 'building'];
  const UPLOAD = '/my-material?from=start';

  let X = null; // js/start.js's internals

  const tutorEl = () => X.$('#tutor');
  const hasHow = () => !!(X.S.a.how || (X.server.answers && X.server.answers.how));
  const howNow = () => { if (!X.S.a.how && X.server.answers && X.server.answers.how) X.S.a.how = X.server.answers.how; return X.S.a.how; };

  /** The step order, on top of js/start.js's own guard, which runs first and decides everything about age and consent. */
  function guard(step, base) {
    const out = base(step);
    howNow();
    if (X.isChild()) return out === 'how' ? 'learn' : out;
    if (out === 'how' && X.server.enrollment) return 'ready';
    if (X.server.enrollment) return out;
    if (AFTER_STEPS.includes(out) && (!hasHow() || X.S.a.how === 'own')) return 'how';
    return out;
  }

  async function toUpload() {
    await X.api('POST', '/api/ob2/lesson-opened', {}).catch(() => {});
    X.forget();
    window.location.href = UPLOAD;
    return new Promise(() => {}); // stays busy until the page goes
  }

  /** Change one step's view, keeping everything js/start.js gave it. */
  function wrap(name, fn) {
    const orig = X.STEPS[name];
    X.STEPS[name] = (...a) => fn(orig(...a));
  }

  function install(internals) {
    X = internals;
    const { STEPS, ORDER, FILL, opt, head } = X;

    ORDER.splice(ORDER.indexOf('learn'), 0, 'how');
    FILL.how = 60;

    STEPS.how = () => ({
      back: 'into',
      ok: () => !!X.S.a.how,
      html: `${head('How do you want to learn?')}
        <fieldset class="opts ob-body how"><legend class="sr">How you want to learn</legend>
          ${[['curriculum', 'book', "Savant's curriculum", 'Our lessons, step by step.'], ['own', 'upload', 'My own material', 'Notes, books or videos.'], ['both', 'layers', 'Both', 'Our lessons, plus yours.']]
            .map(([value, ic, title, sub]) => opt({ type: 'radio', name: 'how', value, checked: X.S.a.how === value, icon: icon(ic, 26), title, sub })).join('')}
        </fieldset>`,
      bind: () => X.$$('input[name="how"]').forEach((r) => r.addEventListener('change', () => {
        X.S.a.how = r.value;
        X.keep();
        X.ready(true);
        window.Tutor.mood(tutorEl(), 'happy', 1400);
      })),
      next: async () => {
        const how = X.S.a.how;
        X.S.a.notes = how !== 'curriculum';
        if (how === 'own') { X.S.a.tracks = []; }
        X.keep();
        await X.saveAnswers();
        if (how !== 'own') return X.go('learn');
        if (X.signedIn()) return toUpload();
        return X.go('save');
      },
    });

    wrap('welcome', (v) => ({
      ...v,
      html: '<div class="ob-welcome"><h1>From zero to Savant.</h1><p class="ob-lead">Lessons built around you.</p></div>',
      alt: v.alt ? { ...v.alt, label: 'I have an account' } : v.alt,
    }));
    wrap('hello', (v) => ({
      ...v,
      bubble: "**Hi! I'm your guide.** Stuck? Press and hold me.",
      cta: 'Continue',
      html: '<h1 class="sr">Hello</h1>',
    }));
    wrap('learn', (v) => {
      const okNow = () => X.S.a.tracks.length > 0;
      const bind = v.bind;
      return {
        ...v,
        back: X.isChild() ? 'into' : 'how',
        ok: okNow,
        html: v.html
          .replace(/<label class="opt subject">\s*<input type="checkbox" name="notes"[\s\S]*?<\/label>/, '')
          .replace('Pick one or a few. You start with number 1.', 'Pick one or more.'),
        bind: () => {
          bind();
          const many = () => { const f = X.$('.subjects'); if (f) f.classList.toggle('u2-many', X.S.a.tracks.length > 1); };
          many();
          X.$$('input[name="track"]').forEach((b) => b.addEventListener('change', () => { many(); X.ready(okNow()); }));
        },
      };
    });
    wrap('ready', (v) => {
      if (X.S.a.how === 'both' && X.signedIn()) {
        return { ...v, cta: 'Upload my material', next: toUpload };
      }
      return { ...v, cta: 'Start lesson' };
    });
    wrap('done', (v) => {
      if (X.isChild() || !['own', 'both'].includes(X.S.a.how)) return v;
      return {
        ...v,
        cta: 'Upload my material',
        html: v.html.replace(/<a class="opt" href="\/my-material">[\s\S]*?<\/a>/, ''),
        next: () => { X.forget(); window.location.href = UPLOAD; return new Promise(() => {}); },
      };
    });
  }

  /* ── what each render adds ─────────────────────────────────── */
  let dressed = false;
  function dressShell() {
    if (dressed) return;
    dressed = true;
    const bubble = X.$('#bubble');
    bubble.classList.add('u2-bubble');
    const q = document.createElement('b');
    q.id = 'bubble-q';
    q.setAttribute('aria-hidden', 'true');
    bubble.insertBefore(q, bubble.firstChild);
    const count = document.createElement('span');
    count.id = 'ob-count';
    X.$('.ob-top').appendChild(count);
    X.$('#wordmark').innerHTML = window.U2Look.wordmark(30);
    X.$('#wordmark').setAttribute('aria-label', 'Savant');
    // Its own clip id: the tutor dock adds a second copy of the giraffe higher up the page, and the first id on a page is the one that counts.
    window.U2Look.giraffe(tutorEl());
    window.U2Look.bind(tutorEl(), {
      noTutor: () => {
        // No tutor for this learner yet (a guest, or the server says off). Say so, once, rather than do nothing.
        const box = X.$('#bubble-text');
        window.Tutor.mood(tutorEl(), 'wave', 1600);
        if (box) { X.$('#ob').dataset.talk = '1'; box.textContent = 'Your tutor opens once your account is set up.'; box.dataset.src = ''; }
      },
    });
    new MutationObserver(syncTask).observe(X.$('#panel'), { childList: true, subtree: true });
    window.addEventListener('resize', cropNow);
    loadTutor();
  }

  /** The tutor dock, the same one every app page has. It asks the server first and draws nothing for an account it isn't open to (js/tutor-dock.js). */
  function loadTutor() {
    const sc = document.createElement('script');
    sc.src = '/js/tutor-dock.js';
    document.body.appendChild(sc);
    window.U2Look.watchTutor();
  }

  function cropNow() {
    const ob = X.$('#ob');
    if (!ob) return;
    const whole = ob.dataset.layout === 'hero' || window.matchMedia('(min-width: 768px)').matches;
    window.U2Look.crop(tutorEl(), whole ? 'full' : 'bust');
  }

  /** While a step draws its own question (the short test, the placement), the question goes to the bubble if it is short, and the count to the top bar. */
  function syncTask() {
    const ob = X.$('#ob');
    if (!ob || !X.$('#bubble-q')) return;
    const q = X.$('#bubble-q');
    const own = X.$('#panel h1.ob-q');
    const prompt = X.$('#panel .q-prompt');
    let text = own ? own.textContent : '';
    if (!own && prompt && !ob.dataset.focus) {
      const t = prompt.textContent.trim();
      const fits = t.length <= ASK_MAX && !t.includes('\n') && !X.$('#panel .t-read');
      prompt.classList.toggle('u2-moved', fits);
      if (fits) text = t;
    }
    if (q.textContent !== text) q.textContent = text;
    if (text) ob.dataset.q = '1'; else delete ob.dataset.q;
    q.classList.toggle('u2-long', text.length > 60);

    const left = X.$('#t-left');
    const eyebrow = X.$('#walk .ob-eyebrow');
    const words = (left && left.textContent) || (eyebrow && eyebrow.textContent) || '';
    const count = X.$('#ob-count');
    if (count.textContent !== words) count.textContent = words;

    // Short answers: the mockup's big tiles.
    const answers = X.$('#walk .opts');
    if (answers && !answers.dataset.u2) {
      answers.dataset.u2 = '1';
      const titles = X.$$('.opt-title', answers).map((n) => n.textContent);
      if (titles.length >= 2 && titles.every((t) => t.length <= 14)) answers.classList.add('u2-tiles');
    }
  }

  const SUBJECT_ICONS = ['math', 'english', 'reading', 'iq', 'act', 'spanish', 'chess', 'piano', 'basketball'];
  function rendered(step) {
    dressShell();
    const ob = X.$('#ob');
    cropNow();
    delete ob.dataset.talk;
    // Words that aren't in the question and must be seen: the bubble keeps them under it.
    if ((step === 'test' && X.S.emailFailed) || (step === 'result' && X.S.result && X.S.result.from_age)) ob.dataset.talk = '1';
    ob.dataset.foot = step === 'level' ? 'two' : '';
    X.$('#back').innerHTML = icon(step === 'testing' || step === 'level' ? 'x' : 'back', 24, 2);
    if (step === 'learn') {
      X.$$('input[name="track"]').forEach((b) => {
        if (!SUBJECT_ICONS.includes(b.value)) return;
        const slot = b.closest('label').querySelector('.opt-icon');
        if (slot) { slot.innerHTML = icon(b.value, 22); slot.style.setProperty('--subject', `var(--s-${b.value})`); }
        const title = b.closest('label').querySelector('.opt-title');
        if (title && title.textContent === 'Mathematics') title.textContent = 'Math'; // the mockup's word; the pill has no room for the long one
      });
    }
    syncTask();
  }

  window.ObLook = { install, guard, rendered };
}());
