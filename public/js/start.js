/* The new onboarding (docs/ONBOARDING-V2.md). One page, one question per screen.
 *
 * Steps are named in the address (#why), so reload and the back button work. Answers live on this device until the level check needs the
 * server; then a guest row holds them (services/onboarding-v2.js), and saving adds credentials to that same row. The server keeps the age
 * answer and picks the route: this file knows no age threshold.
 *
 * The shell (tutor, bubble, ruler, Continue) stays on screen between steps; only the panel changes, so it reads as one conversation.
 */
(function () {
  const C = window.ObContent;
  const I = C.ICONS;
  const KEY = 'savant.ob2';
  const root = document.getElementById('ob-root');

  /** Who the flow is about. `a` is what goes to the server; nothing else leaves this page. */
  let S = { a: { tracks: [], notes: false, why: null, horizon: null, test_date: null, interest: null, interest_text: '' }, claimed: false };
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
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* the server holds it from the level check on */ } };
  const forget = () => { try { localStorage.removeItem(KEY); } catch (e) { /* nothing to do */ } };

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
  const notesOnly = () => S.a.notes && !S.a.tracks.length;
  const gradeParts = (name) => String(name || '').split(/\s+[—–]\s+/);

  /* ── the shell ──────────────────────────────────────────── */
  const ORDER = ['welcome', 'hello', 'age', 'learn', 'why', 'when', 'into', 'moment', 'parent', 'intro', 'level', 'result', 'building', 'ready', 'save', 'remind', 'done'];
  const RULED = ORDER.filter((s) => s !== 'welcome');

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
          <div class="ruler" id="ruler" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="How far through the setup you are">
            <div class="ruler-line"></div>
            ${RULED.filter((_, i) => i % 3 === 0).map((_, i, all) => `<i class="ruler-tick" style="left:${(i / (all.length)) * 100}%"></i>`).join('')}
            <div class="ruler-fill" id="ruler-fill"></div>
            <div class="ruler-marker" id="ruler-marker"></div>
          </div>
        </header>
        <form class="ob-panel" id="panel" novalidate></form>
        <div class="ob-foot" id="foot">
          <button class="btn" id="next" type="submit" form="panel">Continue</button>
          <button class="link-btn" id="alt" type="button" hidden></button>
        </div>
      </div>`;
    Tutor.mount($('#tutor'));
    $('#back').addEventListener('click', goBack);
    $('#panel').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    $('#alt').addEventListener('click', () => { if (view && view.alt && !busy) view.alt.run(); });
  }

  function setRuler(step, within) {
    const i = RULED.indexOf(step);
    const pct = Math.max(2, Math.min(100, Math.round(((Math.max(i, 0) + (within || 0)) / (RULED.length - 1)) * 100)));
    $('#ruler').setAttribute('aria-valuenow', String(pct));
    $('#ruler-fill').style.width = `${pct}%`;
    $('#ruler-marker').style.left = `${pct}%`;
    $$('.ruler-tick').forEach((t) => t.classList.toggle('is-on', parseFloat(t.style.left) <= pct));
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
    if (busy || !view || $('#next').disabled) return;
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

  /** A step that needs something earlier goes there instead. */
  function guard(step) {
    if (S.claimed) return ['remind', 'done'].includes(step) ? step : 'remind';
    const at = ORDER.indexOf(step);
    if (at < 0) return 'welcome';
    if (at > ORDER.indexOf('age') && !server.route) return 'age';
    if (at > ORDER.indexOf('learn') && !S.a.tracks.length && !S.a.notes) return 'learn';
    if (at > ORDER.indexOf('moment') && !S.a.interest) return 'into';
    if (step === 'parent' && (!isChild() || server.guest)) return 'intro';
    if (step === 'level' || step === 'intro' || step === 'result' || step === 'building') {
      if (isChild() && !server.guest) return 'parent';
      if (notesOnly()) return 'save';
    }
    if (step === 'ready' && !(server.enrollment || S.enrollment)) return server.guest ? 'intro' : 'moment';
    if (step === 'save' && !server.guest && !notesOnly()) return 'intro';
    if (step === 'remind' || step === 'done') return 'save';
    return step;
  }

  function render(step, dir) {
    const safe = guard(step);
    if (safe !== step) { history.replaceState(null, '', `#${safe}`); step = safe; }
    current = step;
    S.step = step;
    keep();
    view = STEPS[step]();
    const ob = $('#ob');
    ob.dataset.screen = step;
    ob.dataset.layout = view.hero ? 'hero' : 'question';
    $('#back').style.visibility = view.back === null ? 'hidden' : 'visible';
    $('#wordmark').hidden = step !== 'welcome';
    setRuler(step, view.within);
    say(view.bubble || '', view.mood || 'idle');
    const panel = $('#panel');
    panel.innerHTML = `<div class="ob-view" data-dir="${dir}">${view.html}<p class="ob-error" id="err" role="alert" hidden></p></div>`;
    const next = $('#next');
    next.textContent = view.cta || 'Continue';
    $('#foot').hidden = view.noFoot === true;
    next.hidden = view.noNext === true;
    next.disabled = view.ok ? !view.ok() : false;
    const alt = $('#alt');
    alt.hidden = !view.alt;
    if (view.alt) alt.textContent = view.alt.label;
    if (view.bind) view.bind();
    window.scrollTo(0, 0);
    const h = $('h1', panel);
    if (h && dir !== 'none') { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  /* ── pieces of markup ───────────────────────────────────── */
  const TICK = '<svg class="opt-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
  function opt({ type, name, value, checked, icon, title, sub, cls = '', leading }) {
    return `<label class="opt ${cls}">
      <input type="${type}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>
      ${leading || (icon ? `<span class="opt-icon">${icon}</span>` : '')}
      <span class="opt-text"><span class="opt-title">${esc(title)}</span>${sub ? `<span class="opt-sub">${esc(sub)}</span>` : ''}</span>
      ${TICK}
    </label>`;
  }
  const head = (q, sub) => `<h1 class="ob-q">${esc(q)}</h1>${sub ? `<p class="ob-sub">${marked(sub)}</p>` : ''}`;
  const checkedVal = (name) => { const n = $(`input[name="${name}"]:checked`); return n ? n.value : null; };

  /* ── the steps ──────────────────────────────────────────── */
  const STEPS = {
    welcome: () => ({
      hero: true,
      back: null,
      mood: 'idle',
      bubble: '',
      cta: 'Get started',
      alt: { label: 'I already have an account', run: () => { location.href = '/login'; } },
      html: '<div class="ob-welcome"><h1>From zero to Savant, with lessons built around you.</h1></div>',
      next: () => go('hello'),
    }),

    hello: () => ({
      hero: true,
      back: 'welcome',
      mood: 'wave',
      bubble: `${Tutor.greeting()} A few questions, then your first lesson is **built around you.**`,
      cta: 'Sounds good',
      html: '<h1 class="hello-h">Let\'s get you set up.</h1><p class="hello-sub">It takes a few minutes. Nothing to install, nothing to pay.</p>',
      next: () => go('age'),
    }),

    age: () => {
      const done = !!server.route;
      if (done) {
        return {
          back: 'hello',
          bubble: 'You already answered this one, so **we\'ll keep that answer.**',
          html: `${head('When were you born?')}<p class="ob-sub">Your first answer stands. <a href="/privacy">Privacy policy</a></p>`,
          next: () => go('learn'),
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
            <select class="select" id="c" name="country" required style="margin-top:10px"><option value="">Choose a country</option></select>
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
          go('learn');
        },
      };
    },

    learn: () => ({
      back: 'hello',
      bubble: S.a.tracks.length ? (C.TRACK_REPLY[S.a.tracks[S.a.tracks.length - 1]] || 'Good pick.') : 'Thanks. **Now the good part.**',
      ok: () => S.a.tracks.length > 0 || S.a.notes,
      html: `${head('What do you want to learn?', 'Pick one or a few. You start with the first, and the rest wait for you.')}
        <fieldset class="opts two ob-body"><legend class="sr">Subjects</legend>
          ${catalog.map((t) => opt({ type: 'checkbox', name: 'track', value: t.id, checked: S.a.tracks.includes(t.id), icon: I[t.id] || I.other, title: t.name, sub: C.TRACK_LINES[t.id] })).join('')}
          ${isChild() ? '' : opt({ type: 'checkbox', name: 'notes', value: 'notes', checked: S.a.notes, icon: I.notes, title: 'My own notes', sub: 'Turn your files into lessons' })}
        </fieldset>`,
      bind: () => {
        $$('input[name="track"]').forEach((box) => box.addEventListener('change', () => {
          S.a.tracks = S.a.tracks.filter((t) => t !== box.value);
          if (box.checked) { S.a.tracks.push(box.value); say(C.TRACK_REPLY[box.value] || `**${trackOf(box.value).name}.** Good pick.`, 'happy'); }
          keep();
          ready(S.a.tracks.length > 0 || S.a.notes);
        }));
        const notes = $('input[name="notes"]');
        if (notes) notes.addEventListener('change', () => {
          S.a.notes = notes.checked;
          if (notes.checked) say(C.TRACK_REPLY.notes, 'happy');
          keep();
          ready(S.a.tracks.length > 0 || S.a.notes);
        });
      },
      next: () => go('why'),
    }),

    why: () => {
      const had = C.WHY.find((w) => w.id === S.a.why);
      return {
        back: 'learn',
        bubble: had ? had.reply : 'Knowing why helps me **get the plan right.**',
        ok: () => !!S.a.why,
        html: `${head("What's this for?")}
          <fieldset class="opts ob-body"><legend class="sr">Why you are learning this</legend>
            ${C.WHY.map((w) => opt({ type: 'radio', name: 'why', value: w.id, checked: S.a.why === w.id, icon: I[w.icon], title: w.title })).join('')}
          </fieldset>`,
        bind: () => $$('input[name="why"]').forEach((r) => r.addEventListener('change', () => {
          S.a.why = r.value;
          keep();
          say(C.WHY.find((w) => w.id === r.value).reply, 'happy');
          ready(true);
        })),
        next: () => go('when'),
      };
    },

    when: () => {
      const list = S.a.why === 'test' ? C.HORIZONS : [...C.HORIZONS.slice(1), C.HORIZONS[0]];
      const had = C.HORIZONS.find((h) => h.id === S.a.horizon);
      const today = new Date();
      const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const max = new Date(today.getTime() + 1095 * 86400000);
      const okNow = () => !!S.a.horizon && (S.a.horizon !== 'date' || (!!S.a.test_date && S.a.test_date > iso(today) && S.a.test_date <= iso(max)));
      return {
        back: 'why',
        bubble: had ? had.reply : 'This one **changes your whole review schedule,** and you can change it later.',
        ok: okNow,
        html: `${head('How long do you want to remember it?')}
          <fieldset class="opts ob-body"><legend class="sr">How long to remember it</legend>
            ${list.map((h) => opt({
              type: 'radio', name: 'horizon', value: h.id, checked: S.a.horizon === h.id, title: h.title, sub: h.sub,
              leading: h.id === 'date' ? `<span class="opt-icon">${I.calendar}</span>` : `<span class="len"><i></i><b style="width:${Math.round(h.len * 0.28)}px"></b></span>`,
            })).join('')}
          </fieldset>
          <label class="field" id="date-field"${S.a.horizon === 'date' ? '' : ' hidden'}><span class="field-label">The test date</span>
            <input class="input" type="date" id="test-date" name="test_date" min="${iso(new Date(today.getTime() + 86400000))}" max="${iso(max)}" value="${esc(S.a.test_date || '')}"></label>`,
        bind: () => {
          $$('input[name="horizon"]').forEach((r) => r.addEventListener('change', () => {
            S.a.horizon = r.value;
            keep();
            say(C.HORIZONS.find((h) => h.id === r.value).reply, 'happy');
            $('#date-field').hidden = r.value !== 'date';
            ready(okNow());
            if (r.value === 'date') $('#test-date').focus();
          }));
          $('#test-date').addEventListener('input', (e) => { S.a.test_date = e.target.value; keep(); ready(okNow()); });
        },
        next: () => go('into'),
      };
    },

    into: () => {
      const had = C.INTERESTS.find((i) => i.id === S.a.interest);
      const askText = () => S.a.interest === 'other' && !isChild();
      const okNow = () => !!S.a.interest && (!askText() || S.a.interest_text.trim().length >= 2);
      return {
        back: 'when',
        bubble: had ? had.reply : 'Last one before **I show you something.**',
        cta: 'Show me',
        ok: okNow,
        html: `${head('What are you into?', 'Pick the one you could talk about for an hour.')}
          <fieldset class="opts tiles ob-body"><legend class="sr">Your interests</legend>
            ${C.INTERESTS.map((i) => opt({ type: 'radio', name: 'interest', value: i.id, checked: S.a.interest === i.id, icon: I[i.icon], title: i.title, cls: 'tile' })).join('')}
            ${opt({ type: 'radio', name: 'interest', value: 'other', checked: S.a.interest === 'other', icon: I.other, title: 'Something else', cls: 'tile' })}
          </fieldset>
          ${isChild() ? '' : `<label class="field ob-other" id="other-field"${askText() ? '' : ' hidden'}><span class="field-label">What is it?</span>
            <input class="input" id="other" name="interest_text" maxlength="80" autocomplete="off" value="${esc(S.a.interest_text)}" placeholder="Rock climbing, K-pop, baking bread"></label>`}`,
        bind: () => {
          $$('input[name="interest"]').forEach((r) => r.addEventListener('change', () => {
            S.a.interest = r.value;
            keep();
            const pick = C.INTERESTS.find((i) => i.id === r.value);
            say(pick ? pick.reply : (isChild() ? 'Fair enough. **I\'ll show you what I can.**' : 'Tell me. **I\'m listening.**'), 'happy');
            const f = $('#other-field');
            if (f) { f.hidden = r.value !== 'other'; if (r.value === 'other') $('#other').focus(); }
            ready(okNow());
          }));
          const other = $('#other');
          if (other) other.addEventListener('input', () => { S.a.interest_text = other.value; keep(); ready(okNow()); });
        },
        next: () => go('moment'),
      };
    },

    moment: () => {
      const idea = C.ideaFor(firstTrack());
      const known = C.INTERESTS.find((i) => i.id === S.a.interest);
      const shownId = S.shown && C.INTERESTS.find((i) => i.id === S.shown) ? S.shown : (known ? known.id : 'soccer');
      const said = S.a.interest === 'other' ? (S.a.interest_text || '').trim() : '';
      const fallbackLine = said
        ? `I don't have one written for ${said} yet, and I won't fake it. **Here's the idea with soccer,** so you can see what I mean.`
        : "I don't have one written for that yet, and I won't fake it. **Here's the idea with soccer,** so you can see what I mean.";
      const others = C.INTERESTS.filter((i) => i.id !== shownId).slice(0, 3);
      return {
        back: 'into',
        bubble: known ? 'Same idea. **Written for you.** Tap another one to see it change.' : fallbackLine,
        mood: 'happy',
        cta: notesOnly() ? 'Save my progress' : 'Find my level',
        html: `${head('Same idea. Your version.')}
          <div class="ex" id="ex"></div>
          <div class="ex-try"><span class="ex-try-label">See it with something else:</span>
            ${[...C.INTERESTS.filter((i) => i.id === shownId), ...others].map((i) => `<button type="button" class="pill" data-id="${i.id}" aria-pressed="${i.id === shownId}">${I[i.icon]}${esc(i.title)}</button>`).join('')}
          </div>
          <p class="ob-fine">I wrote this one ahead of time, for this screen. ${isChild()
            ? 'Once a parent allows it, your lessons can use what you\'re into too.'
            : 'Nothing you\'ve told me has gone to an outside AI. Once you save your progress, your lessons can use what you\'re into too.'}</p>`,
        bind: () => {
          const show = (id) => {
            const pick = C.INTERESTS.find((i) => i.id === id);
            $('#ex').innerHTML = `
              <div class="ex-plain"><span class="ex-tag">${esc(idea.topic)}</span>${esc(idea.plain)}</div>
              <span class="ex-link" aria-hidden="true"></span>
              <div class="ex-yours swept" aria-live="polite">
                <span class="ex-tag"><span>${I[pick.icon]}</span>With ${esc(pick.title.toLowerCase())}</span>
                <p class="ex-text">${marked(idea.examples[id])}</p>
                ${idea.viz === 'tokens' ? '<div class="ex-viz" aria-hidden="true"><i></i><i></i><i></i><i></i><b>3/4</b></div>' : ''}
              </div>`;
            S.shown = id;
            keep();
            $$('.pill').forEach((p) => p.setAttribute('aria-pressed', String(p.dataset.id === id)));
          };
          show(shownId);
          $$('.pill').forEach((p) => p.addEventListener('click', () => { show(p.dataset.id); Tutor.mood($('#tutor'), 'happy', 1400); }));
        },
        next: async () => {
          if (notesOnly()) {
            await begin();
            return go('save');
          }
          return go(isChild() && !server.guest ? 'parent' : 'intro');
        },
      };
    },

    /* An under-consent-age learner: the first thing stored about them is the level check, so a parent hears first (docs section 2). */
    parent: () => ({
      back: 'moment',
      bubble: 'You can **keep going while you wait** for them.',
      cta: 'Email my parent',
      ok: () => false,
      html: `${head('Time to tell a grown-up.', `A parent or guardian needs to agree before everything in your account opens. We'll send them one email. If nobody answers in ${esc(S.pendingDays || 14)} days, this account is deleted.`)}
        <div class="ob-body">
          <label class="field"><span class="field-label">Your first name or a nickname</span>
            <input class="input" name="nickname" autocomplete="nickname" minlength="2" maxlength="32" value="${esc(S.nickname || '')}"></label>
          <label class="field"><span class="field-label">Your parent's or guardian's email</span>
            <input class="input" type="email" name="parent_email" autocomplete="off" inputmode="email"></label>
        </div>
        <p class="ob-fine">Until they agree, the camera, the microphone and AI chat stay off. Everything with taps and buttons works. <a href="/privacy#children">How we look after children's data</a></p>`,
      bind: () => {
        const n = $('input[name="nickname"]');
        const p = $('input[name="parent_email"]');
        const check = () => ready(n.value.trim().length >= 2 && /.+@.+\..+/.test(p.value.trim()));
        [n, p].forEach((x) => x.addEventListener('input', check));
        check();
      },
      next: async () => {
        const nickname = $('input[name="nickname"]').value.trim();
        S.nickname = nickname;
        keep();
        const out = await begin({ nickname, parent_email: $('input[name="parent_email"]').value.trim() });
        if (out.user && out.user.consent && out.user.consent.locked) { location.href = '/parent-needed'; return; }
        S.emailFailed = out.consent_email_sent === false;
        keep();
        go('intro');
      },
    }),

    intro: () => ({
      back: 'moment',
      bubble: S.emailFailed
        ? 'The email to your parent **didn\'t send.** You can try again when you save. Let\'s keep going.'
        : (isChild() ? 'Email sent. **Now let\'s see what you know.**' : '"I don\'t know" is **a really useful answer.** Use it whenever it\'s true.'),
      cta: 'Start',
      alt: { label: 'I\'d rather pick my own starting point', run: () => go('pick') },
      html: `${head(`Let's find your level in ${trackName()}.`, 'Short questions that change as you answer. About 5 minutes, and you can stop any time.')}
        <p class="ob-fine">Nobody sees this but you. A wrong answer costs you nothing.</p>`,
      next: async () => {
        await begin();
        go('level');
      },
    }),

    pick: () => {
      const t = trackOf(firstTrack());
      return {
        back: 'intro',
        bubble: 'Sure. **You can change it later.**',
        cta: 'Start here',
        ok: () => !!S.pick,
        html: `${head('Where do you want to start?')}
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
        back: 'intro',
        within: 0,
        bubble: 'Take your time.',
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
        bubble: 'Your first lessons **check this too,** so it doesn\'t have to be perfect.',
        mood: 'happy',
        cta: 'That works',
        html: `<span class="ob-eyebrow">${esc(trackName())}</span>${head(`Start at ${name || 'the beginning'}.`, band || '')}
          ${grades.length > 1 ? `<div class="scale" role="img" aria-label="Grade ${at + 1} of ${grades.length}">
            <div class="scale-line"></div>
            ${grades.map((_, i) => `<i class="scale-tick" style="left:${(i / (grades.length - 1)) * 100}%"></i>`).join('')}
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
      const horizon = C.HORIZONS.find((h) => h.id === S.a.horizon);
      return {
        back: null,
        noNext: true,
        bubble: 'Putting it together.',
        mood: 'think',
        html: `${head('Building your path')}
          <ol class="steps" id="steps">
            <li class="step" data-s="grade"><span class="step-dot"><svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></span>Setting your starting point</li>
            <li class="step" data-s="goal"><span class="step-dot"><svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></span>Fitting reviews to "${esc((horizon ? horizon.title : 'For good').toLowerCase())}"</li>
            <li class="step" data-s="lesson"><span class="step-dot"><svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></span>Finding your first lesson</li>
          </ol>`,
      };
    },

    ready: () => {
      const e = server.enrollment || S.enrollment || {};
      const [name, band] = gradeParts(e.grade_name);
      return {
        back: null,
        bubble: 'Ready when you are. Your answers are **safe here** while you do it.',
        mood: 'happy',
        cta: 'Open my first lesson',
        html: `${head('Your first lesson is ready.')}
          <div class="lesson-card">
            <div class="lc-tag"><span>${I[e.track_id] || I.other}</span>${esc((trackOf(e.track_id) || {}).name || '')}</div>
            <h2>${esc(name)}</h2>
            ${band ? `<p>${esc(band)}</p>` : ''}
            ${S.goalSummary ? `<p>${esc(S.goalSummary)}</p>` : ''}
          </div>
          <p class="ob-fine">This browser keeps your progress for ${isChild() ? 'as long as your account waits for a parent' : '30 days'}. Save it after the lesson so it's yours for good.</p>`,
        next: async () => {
          await api('POST', '/api/ob2/lesson-opened', {}).catch(() => {});
          location.href = e.href;
          return new Promise(() => {}); // stays busy until the page goes, so a double tap does nothing
        },
      };
    },

    save: () => (isChild() ? saveChild() : saveSelf()),

    remind: () => {
      const days = [{ d: 1, t: 'Tomorrow' }, { d: 2, t: 'In 2 days' }, { d: 3, t: 'In 3 days' }];
      return {
        back: null,
        bubble: 'A set time means **one less decision.** Your next step will be waiting.',
        mood: 'happy',
        cta: 'Set it',
        ok: () => !!S.remindDay,
        alt: { label: 'Not now', run: () => go('done') },
        html: `${head('When will you come back?')}
          <fieldset class="opts ob-body"><legend class="sr">Your next session</legend>
            ${days.map((x) => opt({ type: 'radio', name: 'day', value: String(x.d), checked: Number(S.remindDay) === x.d, icon: I.calendar, title: x.t })).join('')}
          </fieldset>
          <label class="field"><span class="field-label">About what time?</span>
            <select class="select" name="time">${['07:00', '12:00', '16:00', '18:00', '20:00'].map((t) => `<option value="${t}"${(S.remindTime || '16:00') === t ? ' selected' : ''}>${timeWords(t)}</option>`).join('')}</select></label>
          <p class="ob-fine">I can't send emails or notifications yet. I'll keep this on your home page, and on the next screen you can add it to your calendar so your phone reminds you.</p>`,
        bind: () => {
          $$('input[name="day"]').forEach((r) => r.addEventListener('change', () => { S.remindDay = r.value; keep(); ready(true); }));
          $('select[name="time"]').addEventListener('change', (e) => { S.remindTime = e.target.value; keep(); });
        },
        next: async () => {
          const d = new Date(Date.now() + Number(S.remindDay) * 86400000);
          S.remindDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          S.remindTime = $('select[name="time"]').value;
          keep();
          await api('POST', '/api/prefs', { next_study: { date: S.remindDate, time: S.remindTime }, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
          go('done');
        },
      };
    },

    done: () => {
      const extra = [];
      const rest = S.a.tracks.slice(1);
      const e = S.enrollment || {};
      if (S.remindDate) extra.push(`<button type="button" class="opt" id="ics"><span class="opt-icon">${I.calendar}</span><span class="opt-text"><span class="opt-title">Add to my calendar</span><span class="opt-sub">${esc(S.remindDate)}, ${esc(timeWords(S.remindTime))}</span></span></button>`);
      if (S.a.notes && !isChild()) extra.push(link('/materials', I.notes, 'Upload your notes', 'Turn your files into lessons'));
      rest.forEach((id) => { const t = trackOf(id); if (t) extra.push(link(`/subject-placement?track=${encodeURIComponent(id)}`, I[id] || I.other, `Find your level in ${t.name}`, 'The subject you also picked')); });
      if (e.id) extra.push(link(`/placement?enrollment=${e.id}&retake=1`, I.arrow, 'Skip what you already know', 'A short check inside this grade'));
      extra.push(link('/baseline?next=/dashboard&old=' + encodeURIComponent('/style-quiz?next=/dashboard'), I.iq, 'Help me fit lessons to you sooner', 'A few short tasks. Optional.'));
      extra.push(link('/reading-check', I.reading, 'Check your reading level', 'So the words fit you. Optional.'));
      if (!isChild()) extra.push(link('/survey?next=/dashboard', I.love, 'Tell me more about you', 'What you do for fun, what hasn\'t worked before. Optional.'));
      return {
        back: null,
        bubble: 'Nice work. **See you soon.**',
        mood: 'happy',
        cta: 'Go to my home',
        html: `${head('You\'re all set.')}<div class="done-list">${extra.join('')}</div>`,
        bind: () => {
          const ics = $('#ics');
          if (ics) ics.addEventListener('click', downloadIcs);
        },
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
  function timeWords(t) {
    const h = Number(String(t || '16:00').slice(0, 2));
    return `${h % 12 || 12}${h < 12 ? ' am' : ' pm'}`;
  }

  /** A calendar file made here, on the device: the only reminder that really reaches a phone today. */
  function downloadIcs() {
    const stamp = `${S.remindDate.replace(/-/g, '')}T${S.remindTime.replace(':', '')}00`;
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Savant//Onboarding//EN', 'BEGIN:VEVENT',
      `UID:${Date.now()}@savantedu.com`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`, `DTSTART:${stamp}`, 'DURATION:PT20M',
      'SUMMARY:Savant: your next lesson', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Time for your next Savant lesson', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'savant-next-lesson.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say('Added. **Your calendar will do the reminding.**', 'happy');
  }

  /* ── steps 9: saving ────────────────────────────────────── */
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
  function afterClaim(next) {
    S.claimed = true;
    S.a.interest_text = '';
    keep();
    Tutor.mood($('#tutor'), 'happy', 1800);
    const nextUrl = new URLSearchParams(location.search).get('next');
    if (nextUrl && nextUrl.startsWith('/') && !nextUrl.startsWith('//')) { forget(); location.href = nextUrl; return; }
    go(next);
  }
  function saveSelf() {
    const hasLesson = !!(server.enrollment || S.enrollment);
    const e = server.enrollment || S.enrollment;
    return {
      back: hasLesson ? null : 'moment',
      bubble: hasLesson ? 'Good work. Let\'s make sure it\'s **still here tomorrow.**' : 'Your notes go through an outside AI to become lessons, so **I need you to save first.**',
      cta: 'Save my progress',
      ok: () => false,
      alt: { label: hasLesson ? 'Not yet, keep learning' : 'I already have an account', run: () => { location.href = hasLesson ? `/path?enrollment=${e.id}` : '/login?next=/start'; } },
      html: `${head(hasLesson ? 'Keep what you\'ve done.' : 'Save, then upload.', hasLesson ? 'Everything so far comes with you.' : '')}
        <div class="ob-body">
          <label class="field"><span class="field-label">Your name</span><input class="input" name="display_name" autocomplete="name" minlength="2" maxlength="32"></label>
          <label class="field"><span class="field-label">Email</span><input class="input" type="email" name="email" autocomplete="email" inputmode="email"></label>
          ${passwordField()}
        </div>
        <p class="ob-fine">By saving you agree to how Savant uses your data, set out in the <a href="/privacy">privacy policy</a>.</p>
        ${hasLesson ? '<p class="ob-fine">Already have an account? <a href="/login?next=/start">Sign in</a>. Your level check comes with you, but this lesson\'s answers stay here and aren\'t added.</p>' : ''}`,
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
        afterClaim(notesOnly() ? 'done' : 'remind');
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
          ? `We emailed your parent or guardian${c.parent_email ? ` at ${esc(c.parent_email)}` : ''}. Ask them to check their inbox and spam folder. <button type="button" class="link-btn" id="resend" style="display:inline;width:auto;margin:0;padding:0;min-height:0">Send it again</button>`
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
        afterClaim('remind');
      },
    };
  }

  /** Make the guest row if there isn't one, and bring it up to date. */
  async function begin(extra) {
    const out = await api('POST', '/api/ob2/begin', { answers: S.a, ...(extra || {}) });
    server.guest = true;
    return out;
  }

  /* ── step 7: the adaptive walk, through the same API as the old page ───── */
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
          <button class="mini" type="button" id="to-pick" style="margin-top:14px">Pick my starting point</button>`;
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
    setRuler('level', Math.min(0.95, (n - 1) / 12));
    const walk = $('#walk');
    const choices = q.choices || null;
    const name = `q${n}`;
    walk.innerHTML = `<div class="ob-view" data-dir="next">
      <span class="ob-eyebrow">Question ${n}</span>
      <h2 class="q-prompt" id="q-prompt" tabindex="-1">${esc(q.prompt)}</h2>
      ${choices
        ? `<fieldset class="opts ob-body"><legend class="sr">Answer</legend>${choices.map((c) => opt({ type: 'radio', name, value: c, title: c, cls: 'choice' })).join('')}</fieldset>`
        : '<label class="field ob-body"><span class="field-label">Your answer</span><input class="input" id="typed" name="typed" autocomplete="off"></label>'}
      <button class="link-btn" type="button" id="stop-walk" style="text-align:left;padding-left:0;margin-top:14px;font-weight:500;font-size:.9375rem">Stop here and see my level</button>
    </div>`;
    ready(false);
    $$(`input[name="${name}"]`).forEach((r) => r.addEventListener('change', () => { W.pending = r.value; ready(true); }));
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
    const breath = () => new Promise((r) => setTimeout(r, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450));
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
      mark('goal', 'is-now');
      await breath();
      mark('goal', 'is-done');
      mark('lesson', 'is-now');
      await fetch(`/api/path/${out.enrollment.id}`, { credentials: 'same-origin' }).catch(() => {});
      await breath();
      mark('lesson', 'is-done');
      await breath();
      if (current === 'building') go('ready', { replace: true });
    } catch (err) {
      showError(err.message);
      $('#next').hidden = false;
      $('#next').textContent = 'Try again';
      view.next = () => { $('#next').hidden = true; return buildPath(); };
    }
  }

  /* ── start ──────────────────────────────────────────────── */
  function firstStep() {
    if (S.claimed) return 'remind';
    if (server.guest) {
      if (server.lesson_opened) return 'save';
      if (server.enrollment) return 'ready';
      if (notesOnly()) return 'save';
      return 'intro';
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
    // A stored flag from a finished run must not outlive the account it belonged to.
    if (S.claimed && !server.account) S.claimed = false;
    // An existing account is never sent through this again.
    if (server.account && !S.claimed) { forget(); location.replace(server.go); return; }
    if (server.guest) {
      // The server's copy wins where this device has lost its own.
      const a = server.answers || {};
      if (!S.a.tracks.length && !S.a.notes) S.a = { ...S.a, ...a };
      S.route = server.route;
    } else if (!server.route) {
      S.route = null; // the age answer has gone (a new session): the steps past it ask again
    }
    if (q.get('ref') && /^[a-z0-9]{8}$/.test(q.get('ref'))) { S.ref = q.get('ref'); S.a.ref = S.ref; }
    const wanted = q.get('track');
    if (wanted && trackOf(wanted) && !S.a.tracks.includes(wanted)) S.a.tracks.unshift(wanted);
    keep();
    shell();
    ORDER.splice(ORDER.indexOf('level'), 0, 'pick');
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
