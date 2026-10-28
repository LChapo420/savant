/* Shared lesson UI: the frame (quit / progress / hearts), the footer with its
 * feedback sheet, modals, interstitials, the complete + streak screens, the
 * talking-character bubble and the mic. Engines and exercises build on these.
 */
(function () {
  const ES = window.ES;
  const { h, esc, icon, sfx } = ES;
  const ui = (ES.ui = {});

  const PRAISE = ['¡Muy bien!', '¡Excelente!', '¡Perfecto!', '¡Genial!', '¡Bien hecho!', '¡Fantástico!'];
  ui.praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

  // ── global Enter / number keys ───────────────────────────────────────
  let enterAction = null; let keyHandler = null;
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.es-scrim')) return;
    const typing = e.target.matches('input, textarea');
    if (e.key === 'Enter' && !e.shiftKey && enterAction && !(typing && e.target.tagName === 'TEXTAREA')) {
      e.preventDefault(); enterAction(); return;
    }
    if (!typing && keyHandler) keyHandler(e);
  });
  ui.onEnter = (fn) => { enterAction = fn; };
  ui.onKeys = (fn) => { keyHandler = fn; };

  // ── lesson frame ─────────────────────────────────────────────────────
  ui.frame = function frame(root, { hearts = null, onQuit, timer = null } = {}) {
    root.innerHTML = '';
    const wrap = h('div', { class: 'es-lesson' });
    const top = h('div', { class: 'es-lesson__top' });
    const quit = h('button', { class: 'es-iconbtn', 'aria-label': 'Quit' }, icon('x'));
    const prog = h('div', { class: 'es-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, '<div class="es-progress__fill" style="--p:0%"></div>');
    const right = h('div', { class: 'es-lesson__right' });
    top.append(quit, prog, right);
    const body = h('main', { class: 'es-lesson__body', id: 'lesson-body' });
    const footer = h('footer', { class: 'es-footer', 'aria-live': 'polite' });
    wrap.append(top, body, footer);
    root.append(wrap);
    quit.addEventListener('click', () => ui.confirmQuit().then((yes) => { if (yes && onQuit) onQuit(); }));

    let heartsEl = null; let timerEl = null;
    if (hearts !== null) { heartsEl = h('span', { class: 'es-stat es-stat--hearts', 'aria-label': `${hearts} hearts` }, `${icon('heart')}<b>${hearts}</b>`); right.append(heartsEl); }
    if (timer !== null) { timerEl = h('span', { class: 'es-stat es-timer', 'aria-live': 'off' }, `${icon('clock')}<b>${ES.fmtTime(timer * 1000)}</b>`); right.append(timerEl); }

    const api = {
      root: wrap, body, footer: ui.footer(footer), top,
      progress(p, combo = 0) {
        prog.querySelector('.es-progress__fill').style.setProperty('--p', `${Math.round(Math.min(1, p) * 100)}%`);
        prog.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        prog.dataset.combo = String(combo >= 5);
        const old = prog.querySelector('.es-combo'); if (old) old.remove();
        if (combo >= 5) prog.append(h('span', { class: 'es-combo' }, `${combo} in a row`));
      },
      hearts(n) {
        if (!heartsEl) return;
        heartsEl.querySelector('b').textContent = n;
        heartsEl.setAttribute('aria-label', `${n} hearts`);
        heartsEl.dataset.bump = 'false'; void heartsEl.offsetWidth; heartsEl.dataset.bump = 'true';
      },
      timer(msLeft) {
        if (!timerEl) return;
        timerEl.querySelector('b').textContent = ES.fmtTime(msLeft);
        timerEl.dataset.low = String(msLeft < 15000);
      },
      setBody(...nodes) { body.innerHTML = ''; body.append(...nodes); body.scrollTop = 0; window.scrollTo(0, 0); },
    };
    return api;
  };

  // The challenge header: optional tag, then the instruction.
  ui.header = function header(text, tag) {
    const wrap = h('div', { class: 'es-challenge-head' });
    if (tag === 'new') wrap.append(h('div', { class: 'es-tag' }, `${icon('sparkle')}New word`));
    if (tag === 'mistake') wrap.append(h('div', { class: 'es-tag es-tag--mistake' }, `${icon('redo')}Previous mistake`));
    if (tag === 'due') wrap.append(h('div', { class: 'es-tag es-tag--due' }, `${icon('clock')}Due for review`));
    if (tag === 'weak') wrap.append(h('div', { class: 'es-tag es-tag--mistake' }, `${icon('target')}Weak spot`));
    wrap.append(h('h1', { class: 'es-h1 es-prompt' }, esc(text)));
    return wrap;
  };

  // ── footer + feedback sheet ──────────────────────────────────────────
  ui.footer = function footer(el) {
    const f = {
      idle({ onCheck, canCheck = false, skip = null, checkLabel = 'Check', extra = null } = {}) {
        el.removeAttribute('data-result');
        el.innerHTML = '';
        const inner = h('div', { class: 'es-footer__inner' });
        const left = h('div', { class: 'es-footer__left' });
        if (skip) left.append(h('button', { class: 'es-btn es-btn--ghost', onclick: skip.onClick }, esc(skip.label || 'Skip')));
        if (extra) left.append(extra);
        const check = h('button', { class: 'es-btn es-btn--success', disabled: !canCheck }, esc(checkLabel));
        check.addEventListener('click', () => { if (!check.disabled) onCheck && onCheck(); });
        inner.append(left, check); el.append(inner);
        f.check = check;
        ui.onEnter(() => { if (!check.disabled) onCheck && onCheck(); });
        return f;
      },
      ready(on) { if (f.check) f.check.disabled = !on; },
      busy(on) { if (f.check) { f.check.setAttribute('aria-busy', String(!!on)); f.check.disabled = !!on || f.check.disabled; } },
      result({ correct, title, solutionLabel, solution, note, extraHtml = '', onContinue, report = true, continueLabel = 'Continue', tone }) {
        el.dataset.result = correct ? 'correct' : 'wrong';
        let headline = title || (correct ? ui.praise() : 'Correct solution:');
        let sub = '';
        if (correct && note === 'accent') { headline = 'Pay attention to the accents.'; sub = `<div class="es-verdict__sol">${esc(solution)}</div>`; }
        else if (correct && note === 'typo') { headline = 'You have a typo.'; sub = `<div class="es-verdict__sol">${esc(solution)}</div>`; }
        else if (!correct && solution) sub = `${solutionLabel ? `<div class="es-verdict__label">${esc(solutionLabel)}</div>` : ''}<div class="es-verdict__sol">${esc(solution)}</div>`;
        el.innerHTML = '';
        const inner = h('div', { class: 'es-footer__inner' });
        const v = h('div', { class: 'es-verdict' }, `<span class="es-verdict__badge">${icon(correct ? 'check' : 'x')}</span><div><div class="es-verdict__title">${esc(headline)}</div>${sub}${extraHtml}<div class="es-verdict__links"></div></div>`);
        if (report) {
          const rep = h('button', { class: 'es-btn es-btn--plain' }, `${icon('flag')} Report`);
          rep.addEventListener('click', () => ui.report());
          v.querySelector('.es-verdict__links').append(rep);
        }
        const cont = h('button', { class: `es-btn ${tone || (correct ? 'es-btn--success' : 'es-btn--danger')}` }, esc(continueLabel));
        cont.addEventListener('click', () => onContinue && onContinue());
        inner.append(v, cont); el.append(inner);
        ui.onEnter(() => onContinue && onContinue());
        setTimeout(() => cont.focus({ preventScroll: true }), 30);
        sfx.play(correct ? 'correct' : 'wrong');
      },
      continueOnly({ label = 'Continue', onClick, tone = 'es-btn--primary', left = null }) {
        el.removeAttribute('data-result');
        el.innerHTML = '';
        const inner = h('div', { class: 'es-footer__inner' });
        const l = h('div', { class: 'es-footer__left' }); if (left) l.append(left);
        const b = h('button', { class: `es-btn ${tone}` }, esc(label));
        b.addEventListener('click', () => onClick && onClick());
        inner.append(l, b); el.append(inner);
        ui.onEnter(() => onClick && onClick());
        f.check = b;
        return b;
      },
      hide() { el.innerHTML = ''; el.removeAttribute('data-result'); ui.onEnter(null); },
    };
    return f;
  };

  // ── modals ───────────────────────────────────────────────────────────
  ui.modal = function modal({ char = 'axo', title, body = '', actions }) {
    return new Promise((resolve) => {
      const scrim = h('div', { class: 'es-scrim' });
      const m = h('div', { class: 'es-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
      m.innerHTML = `${char ? `<div class="es-modal__char">${ES.character(char)}</div>` : ''}<h2 class="es-h2">${esc(title)}</h2>${body ? `<p class="es-muted">${body}</p>` : ''}`;
      const acts = h('div', { class: 'es-modal__actions' });
      actions.forEach((a, i) => {
        const b = h('button', { class: `es-btn es-btn--block ${a.tone || (i === 0 ? 'es-btn--secondary' : 'es-btn--plain')}` }, esc(a.label));
        b.addEventListener('click', () => { scrim.remove(); resolve(a.value); });
        acts.append(b);
      });
      m.append(acts); scrim.append(m); document.body.append(scrim);
      scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') { scrim.remove(); resolve(actions[0].value); } });
      acts.querySelector('button').focus();
    });
  };
  ui.confirmQuit = () => ui.modal({
    title: "Wait, don't go! You'll lose your progress if you quit now",
    actions: [{ label: 'Keep learning', value: false, tone: 'es-btn--secondary' }, { label: 'End session', value: true, tone: 'es-btn--plain es-btn--danger-text' }],
  });
  ui.outOfHearts = () => (ES.flow && ES.flow.host ? ui.modal({
    char: 'axo', title: 'You ran out of hearts!',
    body: 'Mistakes cost hearts. They refill now so you can keep practising, and the exercises you missed come back at the end.',
    actions: [{ label: 'Refill and keep going', value: 'refill', tone: 'es-btn--danger' }, { label: 'End for now', value: 'quit' }],
  }) : ui.modal({
    char: 'axo', title: 'You ran out of hearts!',
    body: 'Mistakes cost hearts. In the real app you refill with gems, a practice lesson, or a subscription. This test lab refills for free.',
    actions: [{ label: 'Refill hearts (test)', value: 'refill', tone: 'es-btn--danger' }, { label: 'No thanks', value: 'quit' }],
  }));
  ui.report = () => ui.modal({
    char: null, title: 'Report a problem',
    body: 'What went wrong with this exercise?',
    actions: [
      { label: 'My answer should be accepted', value: 'accept', tone: 'es-btn--ghost' },
      { label: 'The audio does not sound right', value: 'audio', tone: 'es-btn--ghost' },
      { label: 'Something else is wrong', value: 'other', tone: 'es-btn--ghost' },
      { label: 'Cancel', value: null },
    ],
  }).then((v) => { if (v) ui.toast('Thanks! We\'ll take a look.'); });

  ui.toast = (text) => {
    const t = h('div', { class: 'es-toast', role: 'status' }, esc(text));
    document.body.append(t); setTimeout(() => t.remove(), 2200);
  };

  // ── talking character with a speech bubble ───────────────────────────
  // words: plain text, or tappable words when glosses are given.
  ui.speaker = function speaker({ char = 'axo', text, voice, glosses = null, slow = false, html = null, autoplay = true, compact = false }) {
    const wrap = h('div', { class: `es-speaker${compact ? ' es-speaker--compact' : ''}` });
    const c = h('div', { class: 'es-speaker__char' }, ES.character(char));
    const bubble = h('div', { class: 'es-bubble' });
    const play = h('button', { class: 'es-iconbtn es-bubble__play', 'aria-label': 'Play audio' }, icon('speaker'));
    bubble.append(play);
    const words = h('span', { class: 'es-bubble__text', lang: 'es' });
    if (html) words.innerHTML = html;
    else if (glosses) words.append(...ui.glossWords(text, glosses, voice));
    else words.textContent = text;
    bubble.append(words);
    wrap.append(c, bubble);
    const charEl = c.querySelector('.es-char');
    const say = (s) => ES.audio.say(text, { voice: voice || char, char: charEl, slow: s || slow });
    play.addEventListener('click', () => say());
    if (autoplay && text) setTimeout(() => say(), 250);
    wrap.say = say;
    return wrap;
  };

  // Split a Spanish sentence into tappable words with hints (Duolingo-style).
  let openGloss = null;
  document.addEventListener('click', (e) => { if (openGloss && !e.target.closest('.es-word')) { openGloss.remove(); openGloss = null; } });
  ui.glossWords = function glossWords(text, glosses, voice) {
    const parts = String(text).split(/(\s+)/);
    return parts.map((p) => {
      if (/^\s+$/.test(p) || !p) return document.createTextNode(p);
      const bare = p.replace(/[¿?¡!.,;:]/g, '');
      const g = glosses[p] || glosses[bare] || glosses[bare.toLowerCase()];
      if (!g) return document.createTextNode(p);
      const w = h('span', { class: 'es-word', tabindex: '0', role: 'button', 'aria-label': `${bare}: ${g}` }, esc(p));
      const show = (e) => {
        e && e.stopPropagation();
        if (openGloss) openGloss.remove();
        openGloss = h('div', { class: 'es-gloss', role: 'tooltip' }, esc(g));
        document.body.append(openGloss);
        const r = w.getBoundingClientRect();
        openGloss.style.left = `${Math.max(8, r.left + window.scrollX)}px`;
        openGloss.style.top = `${r.bottom + window.scrollY + 8}px`;
        ES.audio.say(bare, { voice: voice || 'narrator' });
      };
      w.addEventListener('click', show);
      w.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
      return w;
    });
  };

  // Play buttons: big normal speed + small slow.
  ui.audioButtons = function audioButtons(text, voice = 'narrator', { autoplay = true } = {}) {
    const wrap = h('div', { class: 'es-audio-row' });
    const normal = h('button', { class: 'es-audio', 'aria-label': 'Play' }, icon('speaker'));
    const slow = h('button', { class: 'es-audio es-audio--slow', 'aria-label': 'Play slowly' }, icon('turtle'));
    const play = async (btn, s) => { btn.dataset.playing = 'true'; await ES.audio.say(text, { voice, slow: s }); btn.dataset.playing = 'false'; };
    normal.addEventListener('click', () => play(normal, false));
    slow.addEventListener('click', () => play(slow, true));
    wrap.append(normal, slow);
    if (autoplay) setTimeout(() => play(normal, false), 250);
    wrap.play = () => play(normal, false);
    return wrap;
  };

  // ── microphone ───────────────────────────────────────────────────────
  // Speech recognition, in order: the app's transcription route (/api/es/asr:
  // the LLM Gateway for its accounts, else MiMo) when the server has it; the
  // browser's own Web Speech API (Spanish) when it does not, or once the route
  // has failed; typing what you said when neither is there.
  // ES.asr.server: true / false once a page knows (the main path's player sets
  // it from the server), null = unknown, try the server first.
  const BrowserSR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  ES.asr = ES.asr || { server: null };
  ES.asr.browser = !!BrowserSR;
  ES.asr.recognise = (opts) => browserRecognise(opts);

  /** One utterance through the browser's recogniser. Resolves { transcript } or rejects. */
  function browserRecognise({ onStart } = {}) {
    return new Promise((resolve, reject) => {
      const r = new BrowserSR();
      r.lang = 'es-ES';
      r.interimResults = false;
      r.maxAlternatives = 3;
      r.continuous = false;
      let done = false;
      const t0 = performance.now();
      r.onresult = (e) => {
        if (done) return; done = true;
        const alts = e.results && e.results[0] ? [...e.results[0]] : [];
        resolve({ transcript: alts.length ? String(alts[0].transcript || '').trim() : '', alternatives: alts.map((a) => a.transcript), durationMs: Math.round(performance.now() - t0) });
      };
      r.onerror = (e) => { if (done) return; done = true; reject(Object.assign(new Error(e.error || 'recognition failed'), { code: e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error })); };
      r.onend = () => { if (!done) { done = true; resolve({ transcript: '', durationMs: Math.round(performance.now() - t0) }); } };
      try { r.start(); if (onStart) onStart(r); } catch (err) { done = true; reject(err); }
    });
  }

  // onResult({ transcript, durationMs, pauseMs, typed }) after the learner stops.
  ui.mic = function mic({ onResult, maxMs = 12000, label = 'Tap to speak', autoStopMs = 1400 } = {}) {
    const btn = h('button', { class: 'es-mic', 'data-state': 'idle' }, `<span class="es-mic__icon">${icon('mic')}</span><span class="es-mic__label">${esc(label)}</span><span class="es-mic__level" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`);
    const note = h('p', { class: 'es-muted es-mic__note' });
    const wrap = h('div', { class: 'es-mic-wrap' }, '');
    wrap.append(btn, note);
    let rec = null; let busy = false; let silenceTimer = null;
    const setLabel = (t) => { btn.querySelector('.es-mic__label').textContent = t; };
    const bars = () => ES.$$('.es-mic__level i', btn);
    async function finish() {
      if (!rec) return;
      const r = rec; rec = null; clearTimeout(silenceTimer);
      btn.dataset.state = 'processing'; btn.setAttribute('aria-busy', 'true'); setLabel('Checking…');
      const out = await r.stop();
      let transcript = '';
      try { transcript = out.heard ? await ES.recorder.transcribe(out.wav) : ''; }
      catch (err) {
        // The server could not transcribe: from now on use the browser's recogniser if there is one.
        if (BrowserSR) {
          ES.asr.server = false;
          btn.removeAttribute('aria-busy'); btn.dataset.state = 'idle'; setLabel('Tap to speak again'); busy = false;
          note.textContent = "Switched to your browser's speech recognition. Tap the mic and say it again.";
          return undefined;
        }
        return typedFallback(out, 'Speech recognition is unavailable right now.');
      }
      btn.removeAttribute('aria-busy');
      btn.dataset.state = 'idle'; setLabel('Tap to try again');
      busy = false;
      onResult({ transcript, durationMs: out.durationMs, pauseMs: out.pauseMs, wav: out.wav });
    }
    function typedFallback(out, why) {
      btn.dataset.state = 'denied'; btn.querySelector('.es-mic__icon').innerHTML = icon('micOff'); setLabel("Can't use speech recognition");
      note.innerHTML = `${esc(why)} Type what you said instead:`;
      const input = h('input', { class: 'es-input', lang: 'es', placeholder: 'Escribe lo que dijiste', autocomplete: 'off' });
      const go = h('button', { class: 'es-btn es-btn--secondary es-btn--sm' }, 'Use this');
      go.addEventListener('click', () => { if (input.value.trim()) onResult({ transcript: input.value.trim(), durationMs: out ? out.durationMs : 0, pauseMs: out ? out.pauseMs : 0, typed: true }); });
      note.after(h('div', { class: 'es-row' }, ''));
      note.nextSibling.append(input, go);
      busy = false;
    }
    let sr = null;
    async function viaBrowser() {
      busy = true;
      btn.dataset.state = 'listening'; setLabel('Listening… tap when done');
      sfx.play('tick');
      try {
        const out = await browserRecognise({ onStart: (r) => { sr = r; } });
        sr = null;
        btn.dataset.state = 'idle'; setLabel('Tap to try again'); busy = false;
        if (!out.transcript) { note.textContent = "I didn't catch that. Tap and speak a little louder."; return; }
        note.textContent = '';
        onResult({ transcript: out.transcript, durationMs: out.durationMs, pauseMs: 0, browser: true });
      } catch (err) {
        sr = null;
        typedFallback(null, err.code === 'denied' ? 'The microphone is blocked.' : "Your browser's speech recognition is not available.");
      }
    }
    btn.addEventListener('click', async () => {
      if (sr) { try { sr.stop(); } catch (e) { /* already stopped */ } return undefined; }
      if (rec) return finish();
      if (busy) return undefined;
      if (ES.asr.server === false && BrowserSR) return viaBrowser();
      if (ES.asr.server === false) { typedFallback(null, 'Speech recognition is not available in this browser.'); return undefined; }
      busy = true;
      try {
        btn.dataset.state = 'listening'; setLabel('Listening… tap when done');
        let lastLoud = performance.now(); let spoke = false;
        rec = await ES.recorder.start({
          maxMs,
          onLevel: (lvl) => {
            bars().forEach((b, i) => b.style.setProperty('--lvl', String(Math.max(0, lvl - Math.abs(i - 2) * 0.15))));
            const now = performance.now();
            if (lvl > 0.12) { lastLoud = now; spoke = true; }
            // Stop by itself after a short silence once the learner has spoken.
            if (spoke && autoStopMs && now - lastLoud > autoStopMs && rec) finish();
          },
        });
        sfx.play('tick');
      } catch (err) {
        rec = null;
        typedFallback(null, err.code === 'denied' ? 'The microphone is blocked.' : 'No microphone is available.');
      }
    });
    wrap.stop = () => { if (rec) finish(); };
    return wrap;
  };

  // ── interstitial, complete, streak ───────────────────────────────────
  ui.interstitial = function interstitial(frame, { char = 'axo', text, voice, label = 'Continue' }) {
    return new Promise((resolve) => {
      const s = ui.speaker({ char, text, voice: voice || char, autoplay: true });
      s.classList.add('es-interstitial');
      frame.setBody(s);
      frame.footer.continueOnly({ label, onClick: () => { ES.audio.stop(); resolve(); }, tone: 'es-btn--primary' });
    });
  };

  ui.complete = function complete(root, { title = 'Lesson complete!', xp, accuracy, timeMs, char = 'axo', extraHtml = '', accuracyLabel }) {
    return new Promise((resolve) => {
      root.innerHTML = '';
      const page = h('div', { class: 'es-endscreen' });
      const accLabel = accuracyLabel || (accuracy >= 95 ? 'Amazing' : accuracy >= 80 ? 'Great' : 'Good');
      page.innerHTML = `
        <div class="es-endscreen__char">${ES.character(char)}</div>
        <h1 class="es-h2 es-endscreen__title">${esc(title)}</h1>
        <div class="es-tiles">
          ${xp != null ? `<div class="es-tilestat es-tilestat--xp"><div class="es-tilestat__head">Total XP</div><div class="es-tilestat__body">${icon('bolt')}${xp}</div></div>` : ''}
          ${accuracy != null ? `<div class="es-tilestat es-tilestat--acc"><div class="es-tilestat__head">${esc(accLabel)}</div><div class="es-tilestat__body">${icon('target')}${accuracy}%</div></div>` : ''}
          ${timeMs != null ? `<div class="es-tilestat es-tilestat--time"><div class="es-tilestat__head">${timeMs < 180000 ? 'Speedy' : 'Committed'}</div><div class="es-tilestat__body">${icon('clock')}${ES.fmtTime(timeMs)}</div></div>` : ''}
        </div>
        <div class="es-endscreen__extra">${extraHtml}</div>`;
      const footer = h('footer', { class: 'es-footer' });
      const wrap = h('div', { class: 'es-lesson' });
      wrap.append(h('div'), page, footer);
      root.append(wrap);
      const c = page.querySelector('.es-char'); if (c) c.dataset.mood = 'happy';
      sfx.play('complete');
      ui.footer(footer).continueOnly({ label: 'Continue', onClick: resolve, tone: 'es-btn--primary' });
    });
  };

  ui.streak = function streak(root, { days }) {
    return new Promise((resolve) => {
      root.innerHTML = '';
      const names = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      const today = (new Date().getDay() + 6) % 7;
      const page = h('div', { class: 'es-endscreen' });
      page.innerHTML = `
        <div class="es-endscreen__flame">${icon('flame')}</div>
        <div class="es-display" style="color: var(--es-gold-text)">${days}</div>
        <div class="es-h3" style="color: var(--es-gold-text)">day streak</div>
        <div class="es-week" style="max-width:360px;margin:24px auto 0">${names.map((d, i) => `<span class="es-day" data-state="${i <= today && i > today - days ? 'done' : ''}">${d}<i>${i <= today && i > today - days ? icon('check') : ''}</i></span>`).join('')}</div>
        <p class="es-muted">Practice each day so your streak doesn't reset.</p>`;
      const footer = h('footer', { class: 'es-footer' });
      const wrap = h('div', { class: 'es-lesson' });
      wrap.append(h('div'), page, footer);
      root.append(wrap);
      sfx.play('streak');
      ui.footer(footer).continueOnly({ label: 'Continue', onClick: resolve, tone: 'es-btn--primary' });
    });
  };

  // Rubric card (conversation, writing, recordings).
  ui.rubric = function rubric(r) {
    if (!r) return '';
    const row = (label, v) => `<div class="es-rubric__row"><span>${esc(label)}</span><span class="es-rubric__dots">${[0, 1, 2, 3].map((i) => `<i data-on="${i < v}"></i>`).join('')}</span><b>${v}/4</b></div>`;
    return `<div class="es-rubric">
      <div class="es-rubric__score"><span class="es-display">${r.overall}</span><span class="es-muted">/ 100</span></div>
      ${row('Task completion', r.task)}${row('Accuracy', r.accuracy)}${row('Range', r.range)}${row('Fluency', r.fluency)}
      ${r.summary ? `<p>${esc(r.summary)}</p>` : ''}
      ${(r.strengths || []).length ? `<div class="es-rubric__list es-rubric__list--good"><b>What worked</b><ul>${r.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      ${(r.fixes || []).length ? `<div class="es-rubric__list"><b>Fix next time</b><ul>${r.fixes.map((f) => `<li>${f.said ? `<s>${esc(f.said)}</s> → ` : ''}<b lang="es">${esc(f.better)}</b>${f.why ? ` <span class="es-muted">— ${esc(f.why)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      <p class="es-muted es-small">${r.source === 'ai' ? 'Scored by the AI tutor.' : 'Scored by the built-in checker (AI unavailable).'}</p>
    </div>`;
  };

  // Word-by-word diff (dictation, speaking).
  ui.diff = function diff(tokens) {
    return `<div class="es-diff">${tokens.map((t) => {
      if (t.tag === 'extra') return `<span class="es-diff__w" data-tag="extra" title="extra word"><s>${esc(t.got)}</s></span>`;
      const title = { ok: '', accent: 'accent', spelling: 'spelling', sound: 'sound (misheard)', missing: 'missing' }[t.tag];
      return `<span class="es-diff__w" data-tag="${t.tag}" ${title ? `title="${title}"` : ''}>${esc(t.word)}${t.tag !== 'ok' && t.tag !== 'missing' && t.got ? `<small>${esc(t.got)}</small>` : ''}</span>`;
    }).join(' ')}</div>`;
  };
})();
