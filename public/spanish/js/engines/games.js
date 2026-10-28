/* Quick Games: a 3-minute timed shell (countdown, clock, score, combo
 * multiplier, misses back to review) around six games. Answers are checked in
 * the browser so every tap is instant. */
(function () {
  const ES = window.ES;
  const { h, esc, icon, ui, sfx } = ES;
  const engines = (ES.engines = ES.engines || {});
  const quit = () => ES.flow.exit();

  const RULES = {
    listen_tap: 'Listen, then tap the matching picture. Fast answers score more.',
    word_race: 'Type (or say) the Spanish before the word timer runs out.',
    sentence_builder: 'Listen, then build the sentence from the tiles.',
    fix_sentence: 'Tap the word that is wrong, then pick the fix. Some sentences are already right!',
    memory_pairs: 'Flip two cards at a time to find Spanish–English pairs.',
    speed_match: 'Tap a sound, then its picture or meaning. New pairs keep coming.',
  };

  engines.quick_game = async (level, root) => {
    const params = new URLSearchParams(location.search);
    const seconds = Number(params.get('t')) || level.seconds || 180;
    await ES.flow.intro(root, {
      title: level.title, kicker: `Quick game · ${ES.fmtTime(seconds * 1000)} · speed + accuracy`, char: 'axo',
      body: esc(RULES[level.game]),
      bullets: ['5 in a row doubles your points', 'Misses go back into spaced review'],
      start: 'Play',
    });
    if (level.game === 'listen_tap' || level.game === 'sentence_builder') ES.audio.warm(level.items.map((i) => ({ text: i.es })));
    if (level.game === 'speed_match') ES.audio.warm(level.pairs.map((p) => ({ text: p.es })));

    const frame = ui.frame(root, { onQuit: quit, timer: seconds });
    const scoreEl = h('span', { class: 'es-stat es-score' }, `${icon('bolt')}<b>0</b>`);
    frame.top.querySelector('.es-lesson__right').prepend(scoreEl);
    // 3-2-1
    for (const n of ['3', '2', '1']) { frame.setBody(h('div', { class: 'es-countdown' }, n)); sfx.play('tick'); await ES.wait(650); }

    const g = { score: 0, combo: 0, right: 0, wrong: 0, misses: [], times: [], over: false, frame };
    const mult = () => (g.combo >= 5 ? 2 : 1);
    g.hit = (ms = 3000) => {
      g.combo++; g.right++; g.times.push(ms);
      const pts = 10 * mult() + Math.max(0, Math.round((4000 - ms) / 800));
      g.score += pts; scoreEl.querySelector('b').textContent = g.score;
      scoreEl.dataset.bump = 'false'; void scoreEl.offsetWidth; scoreEl.dataset.bump = 'true';
      frame.progress(Math.min(1, g.right / 20), g.combo);
      sfx.play(g.combo === 5 ? 'combo' : 'correct');
      return pts;
    };
    g.miss = (label) => { g.combo = 0; g.wrong++; if (label && !g.misses.includes(label)) g.misses.push(label); frame.progress(Math.min(1, g.right / 20), 0); sfx.play('wrong'); };

    const t0 = Date.now(); const endAt = t0 + seconds * 1000;
    const timeUp = new Promise((resolve) => {
      const tick = setInterval(() => {
        const left = endAt - Date.now();
        frame.timer(left);
        if (left <= 10000 && left > 0 && Math.round(left / 1000) !== g.lastTick) { g.lastTick = Math.round(left / 1000); sfx.play('tick'); }
        if (left <= 0) { clearInterval(tick); g.over = true; resolve(); }
      }, 200);
    });
    frame.footer.hide();
    await Promise.race([GAMES[level.game](level, g), timeUp]);
    g.over = true; ES.audio.stop(); ui.onKeys(null);
    const total = g.right + g.wrong;
    const avg = g.times.length ? Math.round(g.times.reduce((a, b) => a + b, 0) / g.times.length / 100) / 10 : 0;
    await ui.complete(root, { title: "Time's up!", xp: Math.min(40, Math.round(g.score / 25)), accuracy: total ? Math.round((g.right / total) * 100) : 0, timeMs: Date.now() - t0, extraHtml: `<p>Score <b>${g.score}</b> · ${g.right} right · avg ${avg}s per answer</p>` });
    ES.flow.back(root, { level, title: `Score: ${g.score}`, html: g.misses.length ? `<p>Back into spaced review: <span lang="es">${esc(g.misses.join(', '))}</span></p>` : '<p>No misses — nothing added to review.</p>' });
  };

  // Each game runs until the clock (g.over) stops it, recycling its items.
  const cycle = (arr) => { let pool = []; return () => { if (!pool.length) pool = ES.shuffle(arr); return pool.pop(); }; };

  const GAMES = {
    async listen_tap(level, g) {
      const next = cycle(level.items);
      while (!g.over) {
        const it = next();
        const opts = ES.shuffle(it.choices);
        const answer = it.choices[0];
        const box = h('div', { class: 'es-game' });
        const replay = h('button', { class: 'es-audio', 'aria-label': 'Play again' }, icon('speaker'));
        const grid = h('div', { class: 'es-grid-2 es-game__pics' });
        box.append(h('div', { class: 'es-row es-row--center' }), grid);
        box.firstChild.append(replay);
        g.frame.setBody(box);
        const t = performance.now();
        replay.addEventListener('click', () => ES.audio.say(it.es));
        ES.audio.say(it.es);
        await new Promise((resolve) => {
          opts.forEach((art, i) => {
            const b = h('button', { class: 'es-choice es-choice--pic', 'aria-label': `Picture ${i + 1}`, 'data-art': art }, `${ES.art(art)}<span class="es-choice__key">${i + 1}</span>`);
            b.addEventListener('click', async () => {
              if (grid.dataset.locked) return; grid.dataset.locked = '1';
              if (art === answer) { b.dataset.result = 'correct'; g.hit(performance.now() - t); }
              else { b.dataset.result = 'wrong'; ES.$$('button', grid)[opts.indexOf(answer)].dataset.result = 'correct'; g.miss(it.es); }
              await ES.wait(art === answer ? 350 : 900); resolve();
            });
            grid.append(b);
          });
          ui.onKeys((e) => { const n = Number(e.key); const b = ES.$$('button', grid)[n - 1]; if (b) b.click(); });
        });
      }
    },

    async word_race(level, g) {
      const next = cycle(level.items);
      const per = (level.perItem || 7) * 1000;
      while (!g.over) {
        const it = next();
        const box = h('div', { class: 'es-game es-race' });
        const bar = h('div', { class: 'es-progress es-sprint__time' }, '<div class="es-progress__fill" style="--p:100%"></div>');
        const input = h('input', { class: 'es-input es-race__input', lang: 'es', autocomplete: 'off', spellcheck: 'false', placeholder: 'en español…', 'aria-label': 'Answer in Spanish' });
        const mic = h('button', { class: 'es-iconbtn', 'aria-label': 'Say it' }, icon('mic'));
        const fb = h('div', { class: 'es-race__fb', 'aria-live': 'polite' });
        const row = h('div', { class: 'es-row' }); row.append(input, mic);
        box.append(h('div', { class: 'es-label es-muted' }, 'Say or type in Spanish'), h('div', { class: 'es-sprint__big' }, esc(it.en)), bar, row, fb);
        g.frame.setBody(box);
        input.focus();
        const t = performance.now();
        const fill = bar.querySelector('.es-progress__fill'); fill.style.transition = 'none';
        await new Promise((resolve) => {
          let done = false; let raf;
          const end = async (ok, said) => {
            if (done) return; done = true; cancelAnimationFrame(raf);
            if (ok) { g.hit(performance.now() - t); fb.innerHTML = `<b style="color:var(--es-success-text)">${esc(it.accepted[0])}</b>`; }
            else { g.miss(it.accepted[0]); fb.innerHTML = `${said ? `<s>${esc(said)}</s> → ` : ''}<b lang="es">${esc(it.accepted[0])}</b>`; }
            await ES.wait(ok ? 400 : 1100); resolve();
          };
          const anim = () => { const left = 1 - (performance.now() - t) / per; fill.style.setProperty('--p', `${Math.max(0, left) * 100}%`); if (left <= 0) end(false, input.value); else if (!g.over) raf = requestAnimationFrame(anim); };
          anim();
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) { const r = ES.grade.check(input.value, it.accepted); end(r.correct, input.value); } });
          mic.addEventListener('click', async () => {
            try {
              mic.disabled = true;
              const rec = await ES.recorder.start({ maxMs: 3500 });
              await ES.wait(2200);
              const out = await rec.stop();
              const said = out.heard ? await ES.recorder.transcribe(out.wav) : '';
              input.value = said;
              end(ES.grade.speech(said, it.accepted[0], it.accepted).pass, said);
            } catch { mic.disabled = false; ui.toast('Microphone unavailable — type instead.'); }
          });
        });
      }
    },

    async sentence_builder(level, g) {
      const next = cycle(level.items);
      while (!g.over) {
        const it = next();
        const words = it.es.replace(/[¿?¡!.,]/g, '').split(/\s+/).filter(Boolean);
        const box = h('div', { class: 'es-game' });
        const play = h('button', { class: 'es-audio', 'aria-label': 'Play' }, icon('speaker'));
        play.addEventListener('click', () => ES.audio.say(it.es));
        const bank = ES.wordBank([...words, ...it.extra], { lang: 'es', onChange: () => {} });
        const check = h('button', { class: 'es-btn es-btn--success es-btn--block' }, 'Check');
        box.append(h('div', { class: 'es-row es-row--center' }), bank, check);
        box.firstChild.append(play);
        g.frame.setBody(box);
        ES.audio.say(it.es);
        const t = performance.now();
        ui.onKeys(bank.keys);
        await new Promise((resolve) => {
          const go = async () => {
            if (!bank.count()) return;
            const ok = ES.grade.check(bank.text(), [it.es]).correct;
            bank.lock({ correct: ok });
            if (ok) g.hit(performance.now() - t); else { g.miss(it.es); box.append(h('p', { class: 'es-race__fb', lang: 'es' }, `<b>${esc(it.es)}</b>`)); }
            check.disabled = true; ui.onEnter(null);
            await ES.wait(ok ? 450 : 1300); resolve();
          };
          check.addEventListener('click', go);
          ui.onEnter(go);
        });
      }
    },

    async fix_sentence(level, g) {
      const next = cycle(level.items);
      while (!g.over) {
        const it = next();
        const box = h('div', { class: 'es-game' });
        const line = h('div', { class: 'es-fixline', lang: 'es' });
        const fixes = h('div', { class: 'es-stack es-fixes' });
        const ok = h('button', { class: 'es-btn es-btn--ghost' }, 'No mistake');
        box.append(h('div', { class: 'es-label es-muted' }, 'Tap the wrong word'), line, fixes, ok);
        g.frame.setBody(box);
        const t = performance.now();
        await new Promise((resolve) => {
          let done = false;
          const finish = async (right, label) => { if (done) return; done = true; if (right) g.hit(performance.now() - t); else g.miss(label); await ES.wait(right ? 450 : 1300); resolve(); };
          const fixed = it.correctAsIs ? it.tokens.join(' ') : it.tokens.map((w, i) => (i === it.wrong ? it.choices[it.answer] : w)).join(' ');
          ok.addEventListener('click', () => { ok.dataset.result = it.correctAsIs ? 'correct' : 'wrong'; if (!it.correctAsIs) line.after(h('p', { class: 'es-race__fb', lang: 'es' }, `<b>${esc(fixed)}</b>`)); finish(!!it.correctAsIs, fixed); });
          it.tokens.forEach((w, i) => {
            const c = h('button', { class: 'es-tile' }, esc(w));
            c.addEventListener('click', () => {
              if (done || fixes.childElementCount) return;
              if (i !== it.wrong) { c.dataset.result = 'wrong'; line.after(h('p', { class: 'es-race__fb', lang: 'es' }, `<b>${esc(fixed)}</b>`)); finish(false, fixed); return; }
              c.dataset.result = 'correct'; sfx.play('select');
              ES.shuffle(it.choices.map((ch, k) => ({ ch, k }))).forEach(({ ch, k }) => {
                const b = h('button', { class: 'es-choice', lang: 'es' }, `<span class="es-choice__text">${esc(ch)}</span>`);
                b.addEventListener('click', () => { b.dataset.result = k === it.answer ? 'correct' : 'wrong'; c.textContent = ch; if (k !== it.answer) line.after(h('p', { class: 'es-race__fb', lang: 'es' }, `<b>${esc(fixed)}</b>`)); finish(k === it.answer, fixed); });
                fixes.append(b);
              });
            });
            line.append(c);
          });
        });
      }
    },

    async memory_pairs(level, g) {
      let b = 0;
      while (!g.over) {
        const pairs = level.boards[b++ % level.boards.length];
        const cards = ES.shuffle(pairs.flatMap((p, i) => [{ text: p[0], key: i, es: true }, { text: p[1], key: i }]));
        const grid = h('div', { class: 'es-memory' });
        g.frame.setBody(grid);
        let open = []; let matched = 0; let t = performance.now();
        await new Promise((resolve) => {
          cards.forEach((c) => {
            const el = h('button', { class: 'es-mcard', 'aria-label': 'Hidden card' }, `<span class="es-mcard__back">${icon('star')}</span><span class="es-mcard__face" ${c.es ? 'lang="es"' : ''}>${esc(c.text)}</span>`);
            el.addEventListener('click', async () => {
              if (el.dataset.state || open.length === 2 || g.over) return;
              el.dataset.state = 'open'; el.setAttribute('aria-label', c.text); sfx.play('tap');
              if (c.es) ES.audio.say(c.text);
              open.push({ el, c });
              if (open.length < 2) return;
              const [a, z] = open;
              if (a.c.key === z.c.key && a.c.es !== z.c.es) {
                a.el.dataset.state = z.el.dataset.state = 'done'; g.hit(performance.now() - t); t = performance.now();
                open = []; matched++;
                if (matched === pairs.length) { await ES.wait(500); resolve(); }
              } else {
                await ES.wait(750);
                a.el.removeAttribute('data-state'); z.el.removeAttribute('data-state');
                a.el.setAttribute('aria-label', 'Hidden card'); z.el.setAttribute('aria-label', 'Hidden card');
                g.miss(pairs[a.c.key][0]); open = [];
              }
            });
            grid.append(el);
          });
        });
      }
    },

    async speed_match(level, g) {
      const next = cycle(level.pairs);
      const board = h('div', { class: 'es-pairs es-speedmatch' });
      g.frame.setBody(h('div', { class: 'es-game' }, '<div class="es-label es-muted es-center">Tap a sound, then its picture or meaning</div>'), board);
      const L = []; const R = [];
      for (let i = 0; i < 5; i++) { L.push(h('button', { class: 'es-choice es-sm-left' })); R.push(h('button', { class: 'es-choice es-sm-right' })); board.append(L[i], R[i]); }
      const live = new Set();
      function fill(slotL, slotR) {
        let p; let guard = 0;
        do { p = next(); guard++; } while (live.has(p.es) && guard < 40);
        live.add(p.es);
        slotL.dataset.key = p.es; slotL.innerHTML = `${icon('speaker')}`; slotL.setAttribute('aria-label', 'Play a word');
        slotR.dataset.key = p.es; slotR.innerHTML = p.art ? ES.art(p.art) : `<span class="es-choice__text">${esc(p.en)}</span>`;
        slotR.setAttribute('aria-label', p.en || p.art);
        [slotL, slotR].forEach((x) => { x.removeAttribute('data-result'); x.disabled = false; });
      }
      // Right column shuffled independently of the left.
      const order = ES.shuffle([0, 1, 2, 3, 4]);
      for (let i = 0; i < 5; i++) fill(L[i], R[order[i]]);
      let sel = null; let t = performance.now();
      await new Promise((resolve) => {
        const check = (a, b) => {
          const left = a.classList.contains('es-sm-left') ? a : b; const right = left === a ? b : a;
          if (left.dataset.key === right.dataset.key) {
            left.dataset.result = right.dataset.result = 'correct'; g.hit(performance.now() - t); t = performance.now();
            live.delete(left.dataset.key);
            setTimeout(() => {
              const emptyR = right; fill(left, emptyR);
            }, 260);
          } else {
            left.dataset.result = right.dataset.result = 'wrong'; g.miss(left.dataset.key);
            setTimeout(() => { left.removeAttribute('data-result'); right.removeAttribute('data-result'); }, 450);
          }
        };
        [...L, ...R].forEach((btn) => btn.addEventListener('click', () => {
          if (g.over) return resolve();
          if (btn.classList.contains('es-sm-left')) ES.audio.say(btn.dataset.key);
          if (!sel) { sel = btn; btn.setAttribute('aria-pressed', 'true'); sfx.play('select'); return; }
          if (sel === btn) { btn.setAttribute('aria-pressed', 'false'); sel = null; return; }
          if (sel.classList.contains('es-sm-left') === btn.classList.contains('es-sm-left')) { sel.setAttribute('aria-pressed', 'false'); sel = btn; btn.setAttribute('aria-pressed', 'true'); return; }
          sel.setAttribute('aria-pressed', 'false');
          check(sel, btn); sel = null;
        }));
      });
    },
  };
})();
