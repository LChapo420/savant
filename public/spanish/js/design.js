/* The design-system page: every primitive, in every state, wired to behave the
 * way it will in a real lesson. Nothing here talks to the server.
 */
(function () {
  const { icon, sfx, character, art } = window.ES;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const h = (tag, attrs = {}, html = '') => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v; else el.setAttribute(k, v);
    }
    if (html) el.innerHTML = html;
    return el;
  };

  // ── theme ──────────────────────────────────────────────────────────
  const root = document.documentElement;
  function setTheme(mode) {
    if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === mode)));
    try { localStorage.setItem('es-theme', mode); } catch { /* private mode */ }
  }
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  let saved = 'system';
  try { saved = localStorage.getItem('es-theme') || 'system'; } catch { /* ignore */ }
  setTheme(new URLSearchParams(location.search).get('theme') || saved);

  // ── stats ──────────────────────────────────────────────────────────
  $('#flag').innerHTML = icon('flag');
  $('#stat-streak').innerHTML = `${icon('flame')}12`;
  $('#stat-gems').innerHTML = `${icon('gem')}480`;
  $$('.es-stat').forEach((b) => b.addEventListener('click', () => {
    b.dataset.bump = 'false'; void b.offsetWidth; b.dataset.bump = 'true'; sfx.play('tap');
  }));

  // ── path ───────────────────────────────────────────────────────────
  $('#guide-btn').innerHTML = icon('book');
  const nodes = [
    { state: 'done', kind: 'lesson', ico: 'check', x: 0 },
    { state: 'done', kind: 'lesson', ico: 'check', x: -44 },
    { state: 'current', kind: 'lesson', ico: 'star', x: -70, title: 'Cognates you already know', sub: 'Lesson 3 of 11' },
    { state: 'locked', kind: 'story', ico: 'book', x: -44 },
    { state: 'locked', kind: 'chest', ico: 'gift', x: 0 },
    { state: 'locked', kind: 'listen', ico: 'headphones', x: 44 },
    { state: 'locked', kind: 'talk', ico: 'chat', x: 70 },
    { state: 'locked', kind: 'review', ico: 'trophy', x: 44 },
  ];
  const path = $('#path');
  nodes.forEach((n, i) => {
    const wrap = h('div', { class: 'es-node-wrap', style: `--x:${n.x}px` });
    const btn = h('button', {
      class: 'es-node', 'data-state': n.state, 'data-kind': n.kind,
      'aria-label': `${n.kind} ${n.state === 'locked' ? '(locked)' : ''}`.trim(),
      'aria-expanded': 'false',
    }, n.kind === 'chest' ? `<span style="color: var(--es-gold); display:grid">${icon('gift')}</span>` : icon(n.ico));
    if (n.kind === 'chest') btn.querySelector('svg').style.cssText = 'width:56px;height:56px';
    wrap.append(btn);
    if (n.state === 'current') {
      const r = 50; const c = 2 * Math.PI * r;
      wrap.insertAdjacentHTML('afterbegin', `<svg class="es-node__ring" viewBox="0 0 110 110" aria-hidden="true"><circle class="track" cx="55" cy="55" r="${r}"/><circle class="fill" cx="55" cy="55" r="${r}" stroke-dasharray="${c * 0.27} ${c}"/></svg>`);
      wrap.append(h('div', { class: 'es-node__start' }, 'Start'));
    }
    btn.addEventListener('click', () => {
      sfx.play('tap');
      const open = wrap.querySelector('.es-pop');
      $$('.es-pop', path).forEach((p) => p.remove());
      $$('.es-node', path).forEach((x) => x.setAttribute('aria-expanded', 'false'));
      if (open) return;
      btn.setAttribute('aria-expanded', 'true');
      const pop = n.state === 'locked'
        ? h('div', { class: 'es-pop', 'data-state': 'locked', role: 'dialog', 'aria-label': 'Locked' },
          '<div class="es-h3">Not yet</div><p class="es-muted" style="margin:6px 0 0">Finish the levels above to unlock this.</p>')
        : h('div', { class: 'es-pop', role: 'dialog', 'aria-label': n.title || 'Level' },
          `<div class="es-h3">${n.title || 'Practice again'}</div><p style="margin:4px 0 14px;opacity:.9">${n.sub || 'Completed'}</p>
           <button class="es-btn es-btn--block">${n.state === 'current' ? 'Start +10 XP' : 'Review +5 XP'}</button>`);
      wrap.append(pop);
    });
    path.append(wrap);
    void i;
  });

  // ── lesson top ─────────────────────────────────────────────────────
  $('#quit').innerHTML = icon('x');
  const prog = $('#prog');
  $('#combo-toggle').addEventListener('click', () => {
    const on = prog.dataset.combo !== 'true';
    prog.dataset.combo = String(on);
    $('.es-combo', prog)?.remove();
    if (on) { prog.append(h('span', { class: 'es-combo' }, '5 in a row')); sfx.play('combo'); }
  });
  $('#tag-new').innerHTML = `${icon('sparkle')}New word`;
  $('#tag-mistake').innerHTML = `${icon('redo')}Previous mistake`;

  // ── image choices (1-3 keys) ───────────────────────────────────────
  const imgs = [['agua', 'el agua'], ['gato', 'el gato'], ['cafe', 'el café']];
  const grid = $('#img-choices');
  imgs.forEach(([k, word], i) => {
    const b = h('button', { class: 'es-choice es-choice--image', 'aria-pressed': 'false' },
      `<span class="es-choice__art">${art(k)}</span><span class="es-choice__row"><span lang="es">${word}</span><span class="es-choice__key">${i + 1}</span></span>`);
    b.addEventListener('click', () => pick(b));
    grid.append(b);
  });
  function pick(b) {
    $$('.es-choice', grid).forEach((x) => { x.setAttribute('aria-pressed', 'false'); x.removeAttribute('data-result'); });
    b.setAttribute('aria-pressed', 'true'); sfx.play('select');
  }
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 3) pick($$('.es-choice', grid)[n - 1]);
  });

  // ── speaker + glosses ──────────────────────────────────────────────
  const speaker = $('#speaker-char');
  speaker.innerHTML = character('mara', { label: 'Mara' });
  $('#say').innerHTML = icon('speaker');
  function speak(text, rate = 1, who = speaker.querySelector('.es-char')) {
    // Placeholder voice: the browser's own Spanish voice. Real lessons play the
    // pre-rendered MiMo clip for this character instead.
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; u.rate = rate;
    if (who) { who.dataset.talking = 'true'; u.onend = u.onerror = () => { who.dataset.talking = 'false'; }; }
    speechSynthesis.speak(u);
  }
  $('#say').addEventListener('click', () => speak('Quiero un café, por favor.'));
  let gloss = null;
  $$('.es-word').forEach((w) => {
    const show = () => {
      gloss?.remove();
      gloss = h('div', { class: 'es-gloss', role: 'tooltip' }, w.dataset.gloss);
      document.body.append(gloss);
      const r = w.getBoundingClientRect();
      gloss.style.left = `${r.left + window.scrollX}px`;
      gloss.style.top = `${r.bottom + window.scrollY + 8}px`;
      speak(w.textContent, 0.9);
    };
    w.addEventListener('click', show);
    w.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
  });
  document.addEventListener('click', (e) => { if (gloss && !e.target.closest('.es-word')) { gloss.remove(); gloss = null; } });

  // ── word bank: tap to move, with a FLIP animation ──────────────────
  const words = ['coffee', 'I', 'please', 'want', 'a', 'tea', 'the'];
  const bank = $('#bank'); const answer = $('#answer');
  words.forEach((w, i) => {
    const t = h('button', { class: 'es-tile', 'data-i': String(i), role: 'listitem' }, w);
    t.addEventListener('click', () => moveToAnswer(t));
    bank.append(t);
  });
  function fly(from, to, label) {
    const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect();
    to.style.transition = 'none';
    to.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    requestAnimationFrame(() => {
      to.style.transition = '';
      to.style.transform = '';
    });
    void label;
  }
  function moveToAnswer(slot) {
    if (slot.dataset.state === 'ghost') return;
    const placed = h('button', { class: 'es-tile', 'data-from': slot.dataset.i, role: 'listitem' }, slot.textContent);
    placed.addEventListener('click', () => back(placed));
    answer.append(placed);
    fly(slot, placed);
    slot.dataset.state = 'ghost'; slot.setAttribute('aria-hidden', 'true'); slot.tabIndex = -1;
    sfx.play('tap');
  }
  function back(placed) {
    const slot = bank.querySelector(`[data-i="${placed.dataset.from}"]`);
    const ghost = h('span', { class: 'es-tile', style: 'visibility:hidden' }, placed.textContent);
    slot.removeAttribute('data-state'); slot.removeAttribute('aria-hidden'); slot.tabIndex = 0;
    fly(placed, slot);
    placed.remove(); void ghost;
    sfx.play('tap');
  }

  // ── match pairs ────────────────────────────────────────────────────
  const pairs = [['hola', 'hello'], ['gracias', 'thank you'], ['agua', 'water'], ['adiós', 'goodbye'], ['sí', 'yes']];
  const right = [...pairs].sort(() => 0.5 - Math.random());
  const pairBox = $('#pairs');
  let sel = null;
  pairs.forEach(([es], i) => {
    const l = h('button', { class: 'es-choice', 'data-key': es, 'aria-pressed': 'false', lang: 'es' }, `<span class="es-choice__key">${i + 1}</span><span class="es-choice__text">${es}</span>`);
    const r = h('button', { class: 'es-choice', 'data-key': right[i][0], 'aria-pressed': 'false' }, `<span class="es-choice__key">${(i + 6) % 10}</span><span class="es-choice__text">${right[i][1]}</span>`);
    pairBox.append(l, r);
  });
  $$('.es-choice', pairBox).forEach((b, idx) => b.addEventListener('click', () => {
    if (b.dataset.result === 'done') return;
    const side = idx % 2;
    if (!sel || sel.side === side) {
      if (sel) sel.el.setAttribute('aria-pressed', 'false');
      sel = { el: b, side }; b.setAttribute('aria-pressed', 'true'); sfx.play('select'); return;
    }
    const a = sel.el; sel = null;
    a.setAttribute('aria-pressed', 'false');
    if (a.dataset.key === b.dataset.key) {
      [a, b].forEach((x) => { x.dataset.result = 'correct'; });
      sfx.play('pair');
      setTimeout(() => [a, b].forEach((x) => { x.dataset.result = 'done'; }), 350);
    } else {
      [a, b].forEach((x) => { x.dataset.result = 'wrong'; });
      sfx.play('wrong');
      setTimeout(() => [a, b].forEach((x) => x.removeAttribute('data-result')), 600);
    }
  }));

  // ── listen + type + accents ────────────────────────────────────────
  $('#audio-normal').innerHTML = icon('speaker');
  $('#audio-slow').innerHTML = icon('turtle');
  const play = (btn, rate) => { btn.dataset.playing = 'true'; speak('¿Dónde está el baño?', rate, null); setTimeout(() => { btn.dataset.playing = 'false'; }, 1600 / rate); };
  $('#audio-normal').addEventListener('click', (e) => play(e.currentTarget, 1));
  $('#audio-slow').addEventListener('click', (e) => play(e.currentTarget, 0.6));
  const typed = $('#typed');
  ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'].forEach((ch) => {
    const b = h('button', { class: 'es-btn es-btn--ghost', type: 'button', 'aria-label': `Insert ${ch}` }, ch);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the input
    b.addEventListener('click', () => {
      const s = typed.selectionStart ?? typed.value.length;
      typed.setRangeText(ch, s, typed.selectionEnd ?? s, 'end'); typed.focus();
    });
    $('#accents').append(b);
  });

  // ── mic with a live level meter ────────────────────────────────────
  const mic = $('#mic');
  $('#mic-icon').innerHTML = icon('mic');
  let stream = null;
  mic.addEventListener('click', async () => {
    if (stream) return stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      mic.dataset.state = 'denied';
      $('#mic-icon').innerHTML = icon('micOff');
      $('#mic-label').textContent = "Can't use the mic";
      $('#mic-note').textContent = 'Microphone blocked. Speaking exercises offer "Can\'t speak now" in this state.';
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC(); const an = ac.createAnalyser(); an.fftSize = 512;
    ac.createMediaStreamSource(stream).connect(an);
    const data = new Uint8Array(an.fftSize); const bars = $$('.es-mic__level i', mic);
    mic.dataset.state = 'listening'; $('#mic-label').textContent = 'Listening… tap to stop';
    const tick = () => {
      if (!stream) return ac.close();
      an.getByteTimeDomainData(data);
      let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      const lvl = Math.min(1, peak / 64);
      bars.forEach((b, i) => b.style.setProperty('--lvl', String(Math.max(0, lvl - Math.abs(i - 2) * 0.15))));
      requestAnimationFrame(tick);
    };
    tick();
    setTimeout(() => { if (stream) stop(); }, 6000);
  });
  function stop() {
    stream.getTracks().forEach((t) => t.stop()); stream = null;
    mic.dataset.state = 'idle'; $('#mic-label').textContent = 'Tap to speak';
  }

  // ── feedback footer ────────────────────────────────────────────────
  const footer = $('#footer');
  function showFooter(result) {
    footer.removeAttribute('data-result');
    if (!result) {
      footer.innerHTML = `<div class="es-footer__inner"><button class="es-btn es-btn--ghost">Skip</button><button class="es-btn es-btn--success" disabled>Check</button></div>`;
      return;
    }
    footer.dataset.result = result;
    const ok = result === 'correct';
    footer.innerHTML = `<div class="es-footer__inner">
      <div class="es-verdict">
        <span class="es-verdict__badge">${icon(ok ? 'check' : 'x')}</span>
        <div>
          <div class="es-verdict__title">${ok ? '¡Muy bien!' : 'Correct answer:'}</div>
          ${ok ? '' : '<div lang="en">I want a coffee, please.</div>'}
          <div class="es-verdict__links"><button class="es-btn es-btn--plain">${icon('flag')} Report</button></div>
        </div>
      </div>
      <button class="es-btn ${ok ? 'es-btn--success' : 'es-btn--danger'}">Continue</button>
    </div>`;
    sfx.play(ok ? 'correct' : 'wrong');
  }
  $$('[data-footer]').forEach((b) => b.addEventListener('click', () => showFooter(b.dataset.footer)));
  showFooter('');

  // ── celebrations ───────────────────────────────────────────────────
  $('#hero-char').innerHTML = character('axo', { label: 'Axo' });
  function tiles() {
    $('#tiles').innerHTML = `
      <div class="es-tilestat es-tilestat--xp"><div class="es-tilestat__head">Total XP</div><div class="es-tilestat__body">${icon('bolt')}16</div></div>
      <div class="es-tilestat es-tilestat--acc"><div class="es-tilestat__head">Great</div><div class="es-tilestat__body">${icon('target')}94%</div></div>
      <div class="es-tilestat es-tilestat--time"><div class="es-tilestat__head">Speedy</div><div class="es-tilestat__body">${icon('clock')}2:48</div></div>`;
    const c = $('#hero-char .es-char'); c.dataset.mood = ''; void c.getBoundingClientRect(); c.dataset.mood = 'happy';
  }
  tiles();
  $('#replay-tiles').addEventListener('click', () => { tiles(); sfx.play('complete'); });
  const days = [['M', 'done'], ['T', 'done'], ['W', 'frozen'], ['T', 'done'], ['F', 'done'], ['S', ''], ['S', '']];
  $('#week').innerHTML = days.map(([d, s]) => `<span class="es-day" data-state="${s}">${d}<i>${s === 'done' ? icon('check') : s === 'frozen' ? icon('snow') : ''}</i></span>`).join('');

  // ── quests + league ────────────────────────────────────────────────
  const quests = [['bolt', 'Earn 20 XP', 14, 20], ['target', 'Score 90% in 2 lessons', 1, 2], ['headphones', 'Finish a listening lab', 1, 1]];
  $('#quests').innerHTML = quests.map(([ic, t, n, of]) => `
    <div class="es-quest"><span class="es-quest__icon">${icon(ic)}</span><div><div style="font-weight:700">${t}</div>
      <div class="es-quest__bar"><div class="es-progress"><div class="es-progress__fill" style="--p:${(n / of) * 100}%"></div><span class="es-quest__count">${n} / ${of}</span></div><span style="color: var(--es-gold)">${icon('gift')}</span></div></div></div>`).join('');
  const people = [['Lucía', 412], ['Sam', 388], ['You', 351, true], ['Ari', 290], ['Noor', 41], ['Beto', 12]];
  $('#league').innerHTML = people.map(([n, xp, me], i) => {
    const zone = i < 3 ? 'up' : i >= 4 ? 'down' : '';
    const divider = i === 3 ? '<div class="es-zone es-zone--up">Promotion zone</div>' : i === 4 ? '<div class="es-zone es-zone--down">Demotion zone</div>' : '';
    return `${divider}<div class="es-rank" data-zone="${zone}" data-me="${!!me}"><span class="es-rank__n">${i + 1}</span><span class="es-avatar">${n[0]}</span><span style="font-weight:700">${n}</span><span class="es-muted">${xp} XP</span></div>`;
  }).join('');

  // ── toggles, modal, toast ──────────────────────────────────────────
  [['Sound effects', true, 'sfx'], ['Animations', true], ['Motivational messages', true], ['Listening exercises', true], ['Speaking exercises', false]].forEach(([label, on, key]) => {
    const id = `t-${label.replace(/\W+/g, '-').toLowerCase()}`;
    const row = h('div', { class: 'es-toggle' }, `<label for="${id}" style="font-weight:700">${label}</label><input type="checkbox" role="switch" class="es-switch" id="${id}" ${on ? 'checked' : ''}>`);
    if (key === 'sfx') row.querySelector('input').addEventListener('change', (e) => { sfx.enabled = e.target.checked; });
    $('#toggles').append(row);
  });
  $('#open-modal').addEventListener('click', () => {
    const scrim = h('div', { class: 'es-scrim' });
    scrim.innerHTML = `<div class="es-modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
      <div style="width:110px;height:128px;margin:0 auto">${character('axo')}</div>
      <h2 class="es-h2" id="m-title">Wait, don't go!</h2>
      <p class="es-muted">You'll lose your progress in this lesson if you quit now.</p>
      <div class="es-modal__actions"><button class="es-btn es-btn--secondary es-btn--block" data-close>Keep learning</button><button class="es-btn es-btn--plain es-btn--block" data-close style="color: var(--es-danger-text)">End lesson</button></div></div>`;
    document.body.append(scrim);
    const first = scrim.querySelector('[data-close]'); first.focus();
    const close = () => scrim.remove();
    scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
    scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  });
  $('#open-toast').addEventListener('click', () => {
    const t = h('div', { class: 'es-toast', role: 'status' }, 'Streak freeze equipped');
    document.body.append(t); setTimeout(() => t.remove(), 2200);
  });

  // ── cast, sounds, icons ────────────────────────────────────────────
  const lines = { axo: '¡Hola! Soy Axo.', mara: 'Buenos días, clase.', tomas: '¿Qué tal, amigo?', rosa: 'Ven, mijo, a comer.', diego: '¡Vamos a jugar!' };
  Object.values(window.ES.cast).forEach((c) => {
    const b = h('button', { type: 'button' }, `${character(c.id)}<span>${c.name}</span><span class="es-muted ds-small">${c.role}</span>`);
    b.addEventListener('click', () => speak(lines[c.id], 1, b.querySelector('.es-char')));
    $('#cast').append(b);
  });
  sfx.names.forEach((n) => {
    const b = h('button', { class: 'es-btn es-btn--sm es-btn--ghost' }, n);
    b.addEventListener('click', () => sfx.play(n));
    $('#sounds').append(b);
  });
  $('#icons').innerHTML = window.ES.iconNames.map((n) => `<div>${icon(n)}<span>${n}</span></div>`).join('');
})();
