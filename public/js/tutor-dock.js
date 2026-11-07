/* The tutor, on every page: the same tutor that can speak and be spoken to.
 *
 *   loaded by js/app.js on every page; shows only for a signed-in learner.
 *
 * The server decides what the tutor may do on this page (GET /api/tutor/dock?path=): full help,
 * hints about method only (placement, mastery and stage checks, retrieval sittings), or off. It is
 * never created on the sealed Spanish tests, checked here by path as well; those files are not edited.
 *
 * How a learner reaches it (owner, 7 Nov 2026), and which file does what:
 *   js/tutor-giraffe.js  the small giraffe in the top bar. Tap: chat. Press and hold: a voice call. In a call, tap ends it and hold switches to chat.
 *   js/tutor-split.js    the chat beside the page, never over it: top or bottom on a phone (remembered on the account), a side panel on desktop.
 *   js/tutor-call.js     the voice call itself, loaded on the first call.
 * Everything said in a call goes through ask() below and POST /api/tutor/dock like a typed message: same safety, same fact check, same memory.
 * Dictation in the chat box (the Speak button) is the browser's recognizer, or /api/tutor/transcribe for an account on the gateway list. Text always works.
 */
(function () {
  const path = location.pathname.toLowerCase();
  if (/^\/spanish-(check|listening)/.test(path) || window.__tutorDock) return;
  window.__tutorDock = true;

  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/css/tutor-dock.css';
  document.head.appendChild(css);

  const Snap = window.TutorSnapshot;
  let fullOn = false; // set from the server's dock status (TUTOR_FULL for this learner)
  // Where the learner is stuck (sent with every message; the server clamps it): quiet time, wrong tries in a row, whether they already asked.
  let lastActive = Date.now();
  let wrongStreak = 0;
  let askedHere = false;
  let lastFeedback = '';
  const touch = (e) => { if (!(e.target && e.target.closest && e.target.closest('.tdock-panel, .tdock-g'))) lastActive = Date.now(); };
  ['pointerdown', 'keydown', 'input'].forEach((ev) => document.addEventListener(ev, touch, true));
  setInterval(() => {
    const fb = [...document.querySelectorAll('[role=status], .feedback, .es-feedback, .correct, .incorrect, .wrong')].find((n) => !n.closest('.tdock-panel, .tdock-g') && n.innerText);
    const t = fb ? fb.innerText.slice(0, 200) : '';
    if (t && t !== lastFeedback) { wrongStreak = /incorrect|not quite|wrong|try again|not right|missed/i.test(t) && !/^correct|^right|nice|well done/i.test(t) ? wrongStreak + 1 : 0; lastActive = Date.now(); }
    lastFeedback = t;
  }, 2000);
  // Top or bottom on a phone: the server's memory, the local copy for an instant first paint.
  const SIDE_KEY = 'savant.tutor.side';
  const storedSide = () => { try { const m = localStorage.getItem(SIDE_KEY); return m === 'top' || m === 'bottom' ? m : null; } catch { return null; } };
  const keepSide = (m) => { try { localStorage.setItem(SIDE_KEY, m); } catch { /* private mode */ } };

  // What the tutor sees: this page only, as structured text (js/tutor-snapshot.js); a picture only when the server asks for one.
  function pageInfo() {
    const h = document.querySelector('main h1, h1');
    const main = document.querySelector('main') || document.body;
    // The giraffe's own words are not page text (it sits in the page's top bar on a question).
    const own = document.querySelector('.tdock-g');
    const mainText = String(main.innerText || '').replace(own && main.contains(own) ? own.innerText : '\u0000', '');
    const info = { path: location.pathname, query: location.search.slice(1, 81), title: document.title, heading: h ? h.textContent : '', text: mainText.slice(0, 500) };
    // What the learner has picked or typed, and any feedback shown (the server drops these on method-only pages).
    const outside = (sel) => [...document.querySelectorAll(sel)].find((n) => !n.closest('.tdock-panel, .tdock-g'));
    const picked = outside('[aria-checked="true"], [aria-pressed="true"], .selected, .is-selected, input[type=radio]:checked');
    if (picked) info.selected = (picked.innerText || picked.value || '').slice(0, 120);
    const field = outside('textarea, input[type=text]');
    if (field && field.value) info.typed = field.value.slice(0, 160);
    const fb = outside('[role=status], .feedback, .es-feedback, .correct, .incorrect, .wrong');
    if (fb && fb.innerText) info.feedback = fb.innerText.slice(0, 200);
    // A page can describe itself better than the generic reading (a game, a board, a passage on screen).
    try {
      if (typeof window.tutorPageInfo === 'function') Object.assign(info, window.tutorPageInfo() || {});
      else if (window.Player && typeof window.Player.shown === 'function') Object.assign(info, window.Player.shown());
    } catch { /* keep the generic reading */ }
    try { info.snapshot = Snap ? Snap.build(main) : null; } catch { /* the generic reading still goes */ }
    if (fullOn) info.stuck = { idle_s: Math.round((Date.now() - lastActive) / 1000), wrong: wrongStreak, asked: askedHere };
    return info;
  }

  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve) => {
      const sc = document.createElement('script');
      sc.src = src;
      sc.onload = resolve;
      sc.onerror = resolve;
      document.head.appendChild(sc);
    });
  }

  async function start() {
    await loadScript('/js/tutor-snapshot.js', () => !!window.TutorSnapshot);
    let status;
    try {
      // Signed out: no dock, and no 401 in the console (/api/auth/me answers 200 either way).
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!me.ok || !(await me.json()).user) return;
      const r = await fetch(`/api/tutor/dock?path=${encodeURIComponent(location.pathname)}`, { credentials: 'same-origin' });
      if (!r.ok) return;
      status = await r.json();
    } catch { return; }
    if (status.mode === 'off') return;
    // Everything added for the always-there tutor (chips, the stuck nudge, restarting on a new question, the slow-reply ladder) is for the learners the server says TUTOR_FULL covers; all others see the dock as before.
    fullOn = !!status.full;
    await Promise.all([
      loadScript('/js/start-tutor.js', () => !!window.Tutor),
      loadScript('/js/tutor-giraffe.js', () => !!window.TutorGiraffe),
      loadScript('/js/tutor-split.js', () => !!window.TutorSplit),
    ]);
    if (!window.TutorGiraffe || !window.TutorSplit) return;
    // The microphone: never offered to an account the server says may not use it (the browser refuses it anyway, by Permissions-Policy).
    const micOk = status.mic !== false;
    // Better listening only for accounts the server put on the gateway list; everyone else keeps the browser recognizer.
    const canRecord = micOk && !!status.stt && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && 'MediaRecorder' in window;
    const lang = status.speech_lang === 'es' ? 'es-ES' : (document.documentElement.lang || 'en-US');
    const ICON = {
      up: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="5" width="10" height="4.5" rx="1.2" fill="currentColor"/></svg>',
      down: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="10.5" width="10" height="4.5" rx="1.2" fill="currentColor"/></svg>',
      call: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6.2 3.2 4.3 4.4c-.8.5-1.100 1.500-.8 2.400 1.700 4.500 5.100 8 9.700 9.700.9.300 1.900 0 2.400-.8l1.200-1.900c.3-.5.2-1.100-.3-1.400l-2.700-1.700c-.4-.3-1-.2-1.300.2l-.8.9c-1.900-.9-3.300-2.300-4.200-4.200l.9-.8c.4-.3.5-.9.2-1.300L7.600 3.500c-.3-.5-.9-.6-1.400-.3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
      close: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    };

    const panel = document.createElement('section');
    panel.className = 'tdock-panel';
    panel.setAttribute('aria-label', 'Your tutor');
    panel.dataset.open = 'false';
    panel.innerHTML = `
      <div class="tdock-head">
        <span class="tdock-title">Your tutor</span>
        <span class="tdock-sides" role="group" aria-label="Where the chat sits on this screen">
          <button type="button" class="tdock-icon s-top" aria-pressed="false" aria-label="Chat at the top" title="Chat at the top">${ICON.up}</button>
          <button type="button" class="tdock-icon s-bottom" aria-pressed="false" aria-label="Chat at the bottom" title="Chat at the bottom">${ICON.down}</button>
        </span>
        <button type="button" class="tdock-icon tdock-call-btn" aria-label="Start a voice call" title="Start a voice call">${ICON.call}</button>
        <button type="button" class="tdock-icon tdock-close" aria-label="Close the chat" title="Close the chat">${ICON.close}</button>
      </div>
      <div class="tdock-note tdock-sees">The tutor can see this page. Hold the giraffe to talk out loud.</div>
      ${status.mode === 'method' ? '<div class="tdock-note">Hints about method only on this page, so your result is honest.</div>' : ''}
      <div class="tdock-log" aria-live="polite"></div>
      <div class="tdock-chips" role="group" aria-label="Quick questions"${fullOn ? '' : ' hidden'}><button type="button">I'm stuck</button><button type="button">How does this page work?</button><button type="button">What should I do next?</button></div>
      <form class="tdock-form">
        <input type="text" maxlength="600" placeholder="Ask anything" aria-label="Your message">
        ${micOk && (Recog || canRecord) ? '<button type="button" class="mic" aria-pressed="false" title="Tap to speak, tap Send when you are done" aria-label="Speak: tap to start, tap again to send">Speak</button>' : ''}
        <button class="go" type="submit">Send</button>
      </form>`;
    document.body.appendChild(panel);
    const split = window.TutorSplit.create(panel, { side: storedSide() || status.side || 'bottom' });

    const log = panel.querySelector('.tdock-log');
    const input = panel.querySelector('input');
    const mic = panel.querySelector('.mic');
    const sTop = panel.querySelector('.s-top');
    const sBottom = panel.querySelector('.s-bottom');
    const messages = [];
    let busy = false;
    let askedQuestion = '';
    let call = null; // a voice call in progress (js/tutor-call.js)

    function line(cls, text) {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d;
    }

    /** One turn, typed or spoken. Resolves with the reply, or null when there is none to say. */
    async function ask(text, via) {
      if (busy || !text) return null;
      busy = true;
      // A new question on screen is a new conversation: what was said about the last one must not leak into this one.
      const info0 = pageInfo();
      if (fullOn && info0.question && askedQuestion && info0.question !== askedQuestion) { messages.length = 0; toldAt = 0; line('bot', 'New question: starting fresh.').className = 'tdock-note'; }
      askedQuestion = info0.question || askedQuestion;
      messages.push({ role: 'user', content: text });
      line('me', text);
      askedHere = true;
      const chips = panel.querySelector('.tdock-chips');
      if (chips) chips.hidden = true;
      const pending = line('bot', fullOn ? 'Thinking…' : '…');
      // Say what is happening instead of a dead spinner: a slow tutor says so, and the server answers from its notes at its own deadline.
      const t1 = !fullOn ? 0 : setTimeout(() => { if (!pending.dataset.done) pending.textContent = 'Still thinking, a little slower than usual…'; }, 4000);
      const t2 = !fullOn ? 0 : setTimeout(() => { if (!pending.dataset.done) pending.textContent = 'Still on it. If it takes much longer I will answer from my notes.'; }, 10000);
      const ctl = fullOn && typeof AbortController === 'function' ? new AbortController() : null;
      const t3 = setTimeout(() => { if (ctl) ctl.abort(); }, 26000);
      try {
        const r = await fetch('/api/tutor/dock', {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages, page: pageInfo(), input_mode: via || 'text' }), signal: ctl ? ctl.signal : undefined,
        });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error || 'That did not go through.');
        // The chat shows plain text: markdown emphasis the model sometimes adds (**estar**, *ser*) is dropped.
        const reply = String(out.reply || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1$2');
        pending.textContent = reply || 'No reply just now. Try again in a moment.';
        if (reply) messages.push({ role: 'assistant', content: reply });
        return reply || null;
      } catch (err) {
        pending.textContent = err && err.name === 'AbortError' ? 'That is taking too long. Tap Send to try again; your message is still here.' : (!navigator.onLine ? 'You look offline. Reconnect and tap Send to try again.' : (err.message || 'That did not go through. Try again.'));
        if (fullOn) { messages.pop(); if (via !== 'voice') input.value = text; } // the failed message is not part of the conversation; retry resends it
        return null;
      } finally { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); pending.dataset.done = '1'; busy = false; }
    }

    // Tell the server the conversation paused, so it can read what the tutor should remember (off the reply path).
    let toldAt = 0;
    function closed() {
      if (messages.length <= toldAt) return;
      toldAt = messages.length;
      try { fetch('/api/tutor/dock/closed', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {}); } catch (e) { /* best effort */ }
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') closed(); });
    // ── Chat: open, close, top or bottom ───────────────────────────────────
    function showSide(side) {
      sTop.setAttribute('aria-pressed', String(side === 'top'));
      sBottom.setAttribute('aria-pressed', String(side === 'bottom'));
    }
    showSide(split.side());
    split.setSide(split.side());
    function chooseSide(side) {
      split.setSide(side);
      showSide(side);
      keepSide(side);
      fetch('/api/tutor/dock/side', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ side }) }).catch(() => {});
    }
    sTop.addEventListener('click', () => chooseSide('top'));
    sBottom.addEventListener('click', () => chooseSide('bottom'));
    // A touch screen: no keyboard popping up on open, which would take the page away; the learner taps the box when they want to type.
    const coarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    function openChat({ focus = true } = {}) {
      split.open();
      giraffe.setOpen(true);
      log.scrollTop = log.scrollHeight;
      if (focus && (!coarse() || giraffe.viaKeyboard())) input.focus({ preventScroll: true });
    }
    function closeChat({ refocus = true } = {}) {
      split.close();
      giraffe.setOpen(false);
      closed();
      if (refocus) giraffe.focus();
    }

    // ── The voice call: everything it says and hears goes through ask() ─────
    const callInfo = status.call || { allowed: false, why: 'Voice is not available here.' };
    /** Couldn't start or had to stop: say why in plain words, and the chat is right there. */
    function fallBackToChat(why) {
      giraffe.setVoice(null);
      labelsIdle();
      giraffe.say('');
      if (why) line('tdock-note', why);
      openChat();
    }
    function labelsIdle() { giraffe.setLabels(split.isOpen() ? 'Close the tutor chat' : 'Open the tutor chat', 'Start a voice call with the tutor'); }
    let unlock = null;
    async function startCall() {
      if (call) return;
      if (!callInfo.allowed) { fallBackToChat(callInfo.why); return; }
      if (split.isOpen()) closeChat({ refocus: false });
      giraffe.say('Connecting');
      giraffe.setVoice('thinking');
      await loadScript('/js/tutor-call.js', () => !!window.TutorCall);
      if (!window.TutorCall) { fallBackToChat('The voice call did not load. You can type here instead.'); return; }
      const c = window.TutorCall.create({
        info: callInfo, lang, giraffe, line,
        ask: (text) => ask(text, 'voice'),
        onEnded: (why, { toChat }) => {
          call = null;
          unlock = null;
          giraffe.setVoice(null);
          labelsIdle();
          closed();
          if (why) line('tdock-note', why);
          giraffe.say(toChat ? '' : why, toChat ? 0 : 7000);
          if (toChat) openChat();
        },
        onRefused: (why) => { call = null; unlock = null; fallBackToChat(why); },
      });
      call = c;
      unlock = () => c.unlock();
      c.start();
    }
    const giraffe = window.TutorGiraffe.create({
      onTap() {
        if (call) { call.end('The call ended.'); return; }
        if (split.isOpen()) closeChat(); else openChat();
      },
      onHold() { if (call) call.toChat(); else startCall(); },
      onRelease() { if (unlock) unlock(); },
      onAlt() { if (call) call.toChat(); else startCall(); },
    });
    labelsIdle();
    // Ready before the first hold: a phone wants sound unlocked in the gesture that started the call.
    if (callInfo.allowed) loadScript('/js/tutor-call.js', () => !!window.TutorCall);
    panel.querySelector('.tdock-call-btn').addEventListener('click', () => { startCall(); });
    panel.querySelector('.tdock-close').addEventListener('click', () => closeChat());
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChat(); });
    panel.querySelectorAll('.tdock-chips button').forEach((b) => b.addEventListener('click', () => ask(b.textContent, 'text')));
    // After a long quiet spell on a page, the giraffe offers help once. The chat never opens by itself.
    let nudged = false;
    setInterval(() => {
      if (!fullOn || nudged || call || split.isOpen() || !document.hasFocus() || (Date.now() - lastActive) < 75000) return;
      if (/^[/](dashboard|profile|boosters|curriculum|my-stats|calendar)?$/i.test(location.pathname) && wrongStreak < 2) return;
      nudged = true;
      giraffe.say('Stuck? Tap me', 12000);
      giraffe.wave();
    }, 5000);
    panel.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); input.value = ''; ask(t, 'text'); });

    if (mic) {
      // Tap to start, tap again to send. Nothing is sent while the learner is still talking: a pause is not the
      // end (owner, 29 Oct 2026: the old hold-to-talk sent the words at the first pause, or when a finger slid off).
      let rec = null;
      let recorder = null;
      let listening = false; // the learner's choice; the browser recognizer may stop on its own and is restarted
      let heard = '';
      let sttOff = !canRecord; // set when the better listening answers no once; the browser recognizer takes over
      const show = (on) => {
        mic.setAttribute('aria-pressed', String(on));
        mic.textContent = on ? 'Send' : 'Speak';
        input.placeholder = on ? 'Listening… tap Send when you are done' : 'Ask anything';
      };
      const send = (text) => { input.value = ''; if (text) ask(text.trim(), 'voice'); };
      // The better listening through /api/tutor/transcribe: the whole clip is sent once, after the second tap.
      const record = async () => {
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
          sttOff = true;
          if (Recog && listening) { recognize(); return; } // the browser's recognizer, without a second tap
          listening = false; show(false); return;
        }
        const chunks = [];
        const r = new MediaRecorder(stream);
        recorder = r;
        r.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        r.onstop = async () => {
          recorder = null;
          show(false);
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
          if (blob.size < 1500) return; // nothing said
          if (blob.size > 1024 * 1024) { line('bot', 'That was too long for one message. Try a shorter one.'); return; }
          try {
            const res = await fetch(`/api/tutor/transcribe?lang=${lang.slice(0, 2)}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/octet-stream' }, body: blob });
            if (!res.ok) { sttOff = true; throw new Error('browser listening'); }
            const out = await res.json();
            send(out.text);
          } catch { line('bot', Recog ? 'I could not hear that. Tap Speak and try once more.' : 'I could not hear that. Type it instead.'); }
        };
        r.start();
      };
      // The browser's recognizer: continuous, with the words shown in the box as they are heard. It can end by
      // itself after a silence; while the learner has not tapped Send it is started again and the text kept.
      const recognize = () => {
        rec = new Recog();
        rec.lang = lang;
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (ev) => {
          let live = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            if (res.isFinal) heard += `${res[0].transcript} `; else live += res[0].transcript;
          }
          input.value = `${heard}${live}`.trim();
        };
        rec.onerror = (ev) => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { listening = false; line('bot', 'The microphone is blocked. Type instead, or allow it in the browser.'); } };
        rec.onend = () => {
          rec = null;
          if (listening) { try { recognize(); } catch { listening = false; } return; } // stopped on its own: keep listening
          show(false);
          send(input.value || heard);
          heard = '';
        };
        try { rec.start(); } catch { rec = null; listening = false; show(false); }
      };
      const begin = () => {
        listening = true;
        heard = '';
        input.value = '';
        show(true);
        if (!sttOff) { record(); return; }
        if (!Recog) { listening = false; show(false); return; }
        recognize();
      };
      const finish = () => {
        listening = false;
        if (recorder) { try { recorder.stop(); } catch { /* already stopped */ } return; }
        if (rec) { try { rec.stop(); } catch { /* already stopped */ } return; } // onend sends
        show(false);
        send(input.value || heard);
        heard = '';
      };
      mic.addEventListener('click', () => { if (listening || rec || recorder) finish(); else begin(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}());
