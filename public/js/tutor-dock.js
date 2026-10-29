/* The tutor dock: the same tutor, on every page, that can speak and be spoken to.
 *
 *   loaded by js/app.js on every page; shows only for a signed-in learner.
 *
 * The server decides what the tutor may do on this page (GET /api/tutor/dock?path=): full help,
 * hints about method only (placement, mastery and stage checks, retrieval sittings), or off. It is
 * never created on the sealed Spanish tests, checked here by path as well; those files are not edited.
 * Voice is the browser's own: speech out with speechSynthesis, push-to-talk with the browser's
 * recognizer where it has one. Nothing is sent to a paid speech service from here. Text always works.
 */
(function () {
  const path = location.pathname.toLowerCase();
  if (/^\/spanish-(check|listening)/.test(path) || window.__tutorDock) return;
  window.__tutorDock = true;

  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/css/tutor-dock.css';
  document.head.appendChild(css);

  const Snap = window.TutorSnapshot;
  const MODE_KEY = 'savant.tutor.mode';
  const storedMode = () => { try { const m = localStorage.getItem(MODE_KEY); return m === 'voice' || m === 'text' ? m : null; } catch { return null; } };
  const keepMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ } };

  // What the tutor sees: this page only, as structured text (js/tutor-snapshot.js); a picture only when the server asks for one.
  function pageInfo() {
    const h = document.querySelector('main h1, h1');
    const main = document.querySelector('main') || document.body;
    const info = { path: location.pathname, query: location.search.slice(1, 81), title: document.title, heading: h ? h.textContent : '', text: (main.innerText || '').slice(0, 500) };
    // What the learner has picked or typed, and any feedback shown (the server drops these on method-only pages).
    const outside = (sel) => [...document.querySelectorAll(sel)].find((n) => !n.closest('.tdock-panel'));
    const picked = outside('[aria-checked="true"], [aria-pressed="true"], .selected, .is-selected, input[type=radio]:checked');
    if (picked) info.selected = (picked.innerText || picked.value || '').slice(0, 120);
    const field = outside('textarea, input[type=text]');
    if (field && field.value) info.typed = field.value.slice(0, 160);
    const fb = outside('[role=status], .feedback, .es-feedback, .correct, .incorrect, .wrong');
    if (fb && fb.innerText) info.feedback = fb.innerText.slice(0, 200);
    // A page can describe itself better than the generic reading (a game, a board, a passage on screen).
    try { if (typeof window.tutorPageInfo === 'function') Object.assign(info, window.tutorPageInfo() || {}); } catch { /* keep the generic reading */ }
    try { info.snapshot = Snap ? Snap.build(main) : null; } catch { /* the generic reading still goes */ }
    return info;
  }

  function loadSnapshotScript() {
    if (window.TutorSnapshot) return Promise.resolve();
    return new Promise((resolve) => {
      const sc = document.createElement('script');
      sc.src = '/js/tutor-snapshot.js';
      sc.onload = resolve;
      sc.onerror = resolve;
      document.head.appendChild(sc);
    });
  }

  async function start() {
    await loadSnapshotScript();
    let status;
    try {
      const r = await fetch(`/api/tutor/dock?path=${encodeURIComponent(location.pathname)}`, { credentials: 'same-origin' });
      if (!r.ok) return;
      status = await r.json();
    } catch { return; }
    if (status.mode === 'off') return;
    const canTalk = !!Recog && canSpeak;
    // The default mode is the one used for the last message: the server's memory, the local copy for an instant paint.
    let inputMode = canTalk ? (storedMode() || (status.input_mode === 'voice' ? 'voice' : 'text')) : 'text';
    const lang = status.speech_lang === 'es' ? 'es-ES' : (document.documentElement.lang || 'en-US');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tdock-btn';
    btn.textContent = 'Ask tutor';
    btn.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('section');
    panel.className = 'tdock-panel';
    panel.setAttribute('aria-label', 'Your tutor');
    panel.innerHTML = `
      <div class="tdock-head"><span>Your tutor</span>${canTalk ? '<span class="tdock-modes" role="group" aria-label="How to talk to your tutor"><button type="button" class="m-text" aria-pressed="true">Type</button><button type="button" class="m-voice" aria-pressed="false">Talk</button></span>' : (canSpeak ? '<button type="button" class="speak" aria-pressed="false" title="Read replies aloud">Voice</button>' : '')}</div>
      <div class="tdock-note tdock-sees">The tutor can see this page.</div>
      ${status.mode === 'method' ? '<div class="tdock-note">Hints about method only on this page, so your result is honest.</div>' : ''}
      <div class="tdock-log" aria-live="polite"></div>
      <form class="tdock-form">
        <input type="text" maxlength="600" placeholder="Ask anything" aria-label="Your message">
        ${Recog ? '<button type="button" class="mic" aria-pressed="false" title="Hold to talk" aria-label="Push to talk">Hold to talk</button>' : ''}
        <button class="go" type="submit">Send</button>
      </form>`;
    document.body.append(panel, btn);

    const log = panel.querySelector('.tdock-log');
    const input = panel.querySelector('input');
    const speakBtn = panel.querySelector('.speak');
    const mic = panel.querySelector('.mic');
    const mText = panel.querySelector('.m-text');
    const mVoice = panel.querySelector('.m-voice');
    const messages = [];
    let speakOn = false;
    let busy = false;

    function line(cls, text) {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d;
    }

    function setMode(m, remember) {
      inputMode = m;
      panel.dataset.mode = m;
      speakOn = m === 'voice' || (!canTalk && speakOn);
      if (mText) { mText.setAttribute('aria-pressed', String(m === 'text')); mVoice.setAttribute('aria-pressed', String(m === 'voice')); }
      if (m === 'text' && canSpeak) speechSynthesis.cancel();
      keepMode(m);
      if (remember) fetch('/api/tutor/dock/mode', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: m }) }).catch(() => {});
    }
    setMode(inputMode, false);

    function say(text) {
      if (!speakOn || !canSpeak || !text) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      speechSynthesis.speak(u);
    }

    async function ask(text, via) {
      if (busy || !text) return;
      busy = true;
      // A message typed or spoken sets the mode for next time; the transcript is always shown.
      if (canTalk && via && via !== inputMode) setMode(via, false);
      messages.push({ role: 'user', content: text });
      line('me', text);
      const pending = line('bot', '…');
      try {
        const r = await fetch('/api/tutor/dock', {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages, page: pageInfo(), input_mode: via || inputMode }),
        });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error || 'That did not go through.');
        pending.textContent = out.reply || 'No reply just now. Try again in a moment.';
        if (out.reply) { messages.push({ role: 'assistant', content: out.reply }); say(out.reply); }
      } catch (err) {
        pending.textContent = err.message || 'That did not go through. Try again.';
      } finally { busy = false; }
    }

    btn.addEventListener('click', () => {
      const open = panel.dataset.open !== 'true';
      panel.dataset.open = String(open);
      btn.setAttribute('aria-expanded', String(open));
      if (open) input.focus(); else if (canSpeak) speechSynthesis.cancel();
    });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { panel.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
    panel.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); input.value = ''; ask(t, 'text'); });
    if (mText) { mText.addEventListener('click', () => setMode('text', true)); mVoice.addEventListener('click', () => setMode('voice', true)); }
    if (speakBtn) speakBtn.addEventListener('click', () => { speakOn = !speakOn; speakBtn.setAttribute('aria-pressed', String(speakOn)); if (!speakOn) speechSynthesis.cancel(); });

    if (mic) {
      let rec = null;
      const stop = () => { if (rec) { try { rec.stop(); } catch { /* already stopped */ } } };
      const begin = () => {
        if (rec) return;
        rec = new Recog();
        rec.lang = lang;
        rec.interimResults = false;
        rec.onresult = (ev) => { const t = ev.results[0][0].transcript; if (t) ask(t.trim(), 'voice'); };
        rec.onend = () => { rec = null; mic.setAttribute('aria-pressed', 'false'); };
        rec.onerror = () => { rec = null; mic.setAttribute('aria-pressed', 'false'); };
        mic.setAttribute('aria-pressed', 'true');
        try { rec.start(); } catch { rec = null; }
      };
      mic.addEventListener('pointerdown', begin);
      mic.addEventListener('pointerup', stop);
      mic.addEventListener('pointerleave', stop);
      mic.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); begin(); } });
      mic.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}());
