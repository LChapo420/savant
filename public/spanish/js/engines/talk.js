/* Speaking + reading engines: conversation_lab, fluency_sprint,
 * sound_refresh, reading_block. Also exports ES.conversation for projects and
 * the live-conversation AI stand-in. */
(function () {
  const ES = window.ES;
  const { h, esc, icon, ui, sfx } = ES;
  const engines = (ES.engines = ES.engines || {});
  const quit = () => ES.flow.exit();

  // ── the role-play chat (Max-style Roleplay) ─────────────────────────
  // Resolves with { history, goalsMet, rubric }.
  ES.conversation = function conversation(root, level, { part = null, flagged = false } = {}) {
    const sc = part === 'exchange' ? level.exchange : part === 'standIn' ? level.standIn : level.scenario;
    return new Promise((resolve) => {
      const frame = ui.frame(root, { onQuit: quit });
      frame.progress(0);
      const history = [];
      const met = new Set();
      let turns = 0; let lastHint = ''; let ended = false; let busy = false;

      const wrap = h('div', { class: 'es-convo' });
      if (flagged) wrap.append(h('div', { class: 'es-flag' }, `${icon('flag')} AI stand-in — practice only, it does not count as real-person practice.`));
      const head = h('div', { class: 'es-convo__head' }, `<div class="es-convo__partner">${ES.character(sc.partner)}</div><div><div class="es-h3">${esc(sc.partnerName)}</div><div class="es-muted es-small">${esc(sc.setting)}</div></div>`);
      const card = h('details', { class: 'es-convo__card', open: true }, `<summary>Your card</summary><p>${esc(sc.learnerCard)}</p><p class="es-muted" lang="es">${esc(sc.learnerCardEs || '')}</p>`);
      const goals = h('ul', { class: 'es-goals', 'aria-label': 'Goals' }, sc.goals.map((g) => `<li data-id="${esc(g.id)}">${icon('check')}<span>${esc(g.text)}</span></li>`).join(''));
      const log = h('div', { class: 'es-convo__log', 'aria-live': 'polite' });
      wrap.append(head, card, goals, log);
      frame.setBody(wrap);
      const partnerChar = () => head.querySelector('.es-char');

      function bubble(who, text, extra = '') {
        const row = h('div', { class: `es-chat__row${who === 'learner' ? ' es-chat__row--me' : ''}` });
        if (who !== 'learner') row.append(h('div', { class: 'es-chat__avatar' }, ES.character(sc.partner)));
        const b = h('div', { class: 'es-bubble es-chat__bubble' }, `${who !== 'learner' ? `<button class="es-iconbtn es-bubble__play" aria-label="Play">${icon('speaker')}</button>` : ''}<span lang="es">${esc(text)}</span>${extra}`);
        row.append(b); log.append(row);
        const p = b.querySelector('.es-bubble__play');
        if (p) p.addEventListener('click', () => ES.audio.say(text, { voice: sc.partner, char: row.querySelector('.es-char') }));
        row.scrollIntoView({ behavior: 'smooth', block: 'end' });
        return row;
      }
      function markGoals(ids) {
        ids.forEach((id) => { if (!met.has(id)) { met.add(id); sfx.play('pair'); } });
        ES.$$('li', goals).forEach((li) => { li.dataset.done = String(met.has(li.dataset.id)); });
        frame.progress(met.size / sc.goals.length);
      }

      // Input: mic or keyboard, plus hint and end.
      const input = h('input', { class: 'es-input', lang: 'es', placeholder: 'Escribe en español…', autocomplete: 'off', 'aria-label': 'Your message' });
      const send = h('button', { class: 'es-btn es-btn--secondary', 'aria-label': 'Send' }, 'Send');
      const mic = ui.mic({ label: 'Speak', autoStopMs: 1600, onResult: ({ transcript }) => { if (transcript) { input.value = transcript; say(); } } });
      mic.classList.add('es-convo__mic');
      const hint = h('button', { class: 'es-btn es-btn--plain es-btn--sm' }, `${icon('sparkle')} Hint`);
      const end = h('button', { class: 'es-btn es-btn--ghost es-btn--sm' }, 'End conversation');
      const bar = h('div', { class: 'es-convo__bar' });
      const row = h('div', { class: 'es-row' }); row.append(input, send);
      bar.append(mic, row, h('div', { class: 'es-row es-row--between' }));
      bar.lastChild.append(hint, end);
      wrap.append(bar);
      frame.footer.hide();
      hint.addEventListener('click', () => ui.toast(lastHint || 'Look at your card and the goals above.'));
      end.addEventListener('click', () => finish());
      send.addEventListener('click', () => say());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); say(); } });

      async function partnerSays(text) {
        bubble('partner', text);
        history.push({ who: 'partner', text });
        await ES.audio.say(text, { voice: sc.partner, char: partnerChar() });
      }
      async function say() {
        const text = input.value.trim();
        if (!text || busy || ended) return;
        busy = true; send.setAttribute('aria-busy', 'true'); input.value = '';
        bubble('learner', text);
        const res = await ES.api.post('/api/es/conversation/turn', { levelId: level.id, part, history, text }).catch(() => null);
        history.push({ who: 'learner', text });
        turns++;
        send.removeAttribute('aria-busy'); busy = false;
        if (!res) { ui.toast('The partner did not answer. Try again.'); return; }
        lastHint = res.hint || '';
        markGoals(res.goals_met || []);
        await partnerSays(res.reply);
        if (res.finished || met.size === sc.goals.length || turns >= (sc.maxTurns || 10)) finish();
        else input.focus();
      }
      async function finish() {
        if (ended) return; ended = true;
        bar.remove();
        const wait = h('p', { class: 'es-muted' }, 'Scoring your conversation…'); wrap.append(wait);
        const rubric = await ES.api.post('/api/es/conversation/end', { levelId: level.id, part, history, goalsMet: [...met] }).catch(() => null);
        wait.remove();
        resolve({ history, goalsMet: [...met], rubric, turns });
      }
      setTimeout(() => partnerSays(sc.opening), 300);
    });
  };

  engines.conversation_lab = async (level, root) => {
    const sc = level.scenario;
    ES.audio.warm([{ text: sc.opening, voice: sc.partner }]);
    await ES.flow.intro(root, {
      title: level.title, kicker: 'Conversation Lab · information gap', char: sc.partner,
      body: `<b>Setting:</b> ${esc(sc.setting)}<br><b>Your card:</b> ${esc(sc.learnerCard)}`,
      bullets: sc.goals.map((g) => esc(g.text)), start: 'Start conversation',
    });
    const t0 = Date.now();
    const r = await ES.conversation(root, level);
    await ui.complete(root, { title: 'Conversation complete!', xp: 15, accuracy: r.rubric ? r.rubric.overall : null, accuracyLabel: 'Score', timeMs: Date.now() - t0, char: sc.partner, extraHtml: `<p>${r.goalsMet.length} of ${sc.goals.length} goals reached in ${r.turns} turns.</p>` });
    ES.flow.back(root, { level, title: 'How it went', html: `${ui.rubric(r.rubric)}<details class="es-details"><summary>Transcript</summary>${r.history.map((x) => `<p><b>${x.who === 'learner' ? 'You' : esc(sc.partnerName)}:</b> <span lang="es">${esc(x.text)}</span></p>`).join('')}</details>` });
  };

  // ── fluency sprint: timed speaking rounds ───────────────────────────
  engines.fluency_sprint = async (level, root) => {
    ES.audio.warm(level.rounds.flatMap((r) => r.prompts.filter((p) => p.mode === 'repeat').map((p) => ({ text: p.es, voice: 'mara' }))));
    await ES.flow.intro(root, {
      title: level.title, kicker: 'Speaking game · 3 rounds', char: 'axo',
      body: 'Say each chunk before the time runs out. Every round is faster.',
      bullets: level.rounds.map((r, i) => `Round ${i + 1}: ${r.seconds} seconds per chunk`), start: 'Go!',
    });
    const frame = ui.frame(root, { onQuit: quit });
    const total = level.rounds.reduce((n, r) => n + r.prompts.length, 0);
    let n = 0; let score = 0; let hits = 0; const misses = [];
    let selfCheck = ES.speakingOff();
    for (const [ri, round] of level.rounds.entries()) {
      await ui.interstitial(frame, { char: 'axo', text: ri === 0 ? '¡Ronda uno!' : ri === 1 ? '¡Ronda dos! Más rápido.' : '¡Última ronda! ¡Rapidísimo!', label: 'Ready' });
      for (const p of round.prompts) {
        frame.progress(n / total);
        const card = h('div', { class: 'es-sprint' });
        if (p.mode === 'repeat') card.append(h('div', { class: 'es-label es-muted' }, 'Repeat'), h('div', { class: 'es-sprint__big', lang: 'es' }, esc(p.es)));
        if (p.mode === 'say') card.append(h('div', { class: 'es-label es-muted' }, 'Say it in Spanish'), h('div', { class: 'es-sprint__big' }, esc(p.en)));
        if (p.mode === 'picture') card.append(h('div', { class: 'es-label es-muted' }, 'Name it in Spanish'), h('div', { class: 'es-sprint__art' }, ES.art(p.art)));
        const bar = h('div', { class: 'es-progress es-sprint__time' }, '<div class="es-progress__fill" style="--p:100%"></div>');
        const status = h('div', { class: 'es-sprint__status', 'aria-live': 'polite' }, '');
        card.append(bar, status);
        frame.setBody(card);
        frame.footer.hide();
        if (p.mode === 'repeat') await ES.audio.say(p.es, { voice: 'mara' });
        const ms = round.seconds * 1000; const t0 = performance.now();
        const fill = bar.querySelector('.es-progress__fill');
        let raf; const anim = () => { const left = Math.max(0, 1 - (performance.now() - t0) / ms); fill.style.setProperty('--p', `${left * 100}%`); fill.style.transition = 'none'; if (left > 0) raf = requestAnimationFrame(anim); };
        anim();
        let ok = false; let heard = '';
        // No transcription on the server: the browser's recogniser, or a self-check.
        if (!selfCheck && ES.asr && ES.asr.server === false) {
          if (!ES.asr.browser) selfCheck = true;
          else {
            try {
              status.innerHTML = `${icon('mic')} Listening…`;
              let recog = null;
              const timer = setTimeout(() => { if (recog) { try { recog.stop(); } catch (e) { /* stopped */ } } }, ms);
              const out = await ES.asr.recognise({ onStart: (r) => { recog = r; } });
              clearTimeout(timer);
              heard = out.transcript || '';
              ok = ES.grade.speech(heard, p.es, p.accepted).pass;
            } catch (err) {
              selfCheck = true;
            }
          }
        } else if (!selfCheck) {
          try {
            status.innerHTML = `${icon('mic')} Listening…`;
            // Stop when the time is up, or as soon as the learner has spoken and gone quiet.
            let stopNow = null; let spoke = false; let lastLoud = performance.now();
            const rec = await ES.recorder.start({
              maxMs: ms + 500,
              onLevel: (lvl) => {
                const now = performance.now();
                if (lvl > 0.12) { spoke = true; lastLoud = now; }
                if (spoke && now - lastLoud > 900 && stopNow) stopNow();
              },
            });
            await new Promise((resolve) => { stopNow = resolve; setTimeout(resolve, Math.max(0, ms - (performance.now() - t0))); });
            const out = await rec.stop();
            status.textContent = 'Checking…';
            heard = out.heard ? await ES.recorder.transcribe(out.wav) : '';
            const s = ES.grade.speech(heard, p.es, p.accepted);
            ok = s.pass;
          } catch (err) {
            selfCheck = true;
          }
        }
        if (selfCheck) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms - (performance.now() - t0))));
          cancelAnimationFrame(raf);
          status.innerHTML = `<span lang="es"><b>${esc(p.es)}</b></span> — did you say it in time?`;
          ok = await new Promise((resolve) => {
            const yes = h('button', { class: 'es-btn es-btn--success' }, 'I said it');
            const no = h('button', { class: 'es-btn es-btn--ghost' }, "I didn't");
            yes.addEventListener('click', () => resolve(true)); no.addEventListener('click', () => resolve(false));
            const r = h('div', { class: 'es-row es-row--center' }); r.append(no, yes); card.append(r);
          });
        }
        cancelAnimationFrame(raf);
        const elapsed = performance.now() - t0;
        if (ok) { const pts = 10 + Math.max(0, Math.round(((ms - elapsed) / ms) * 10)); score += pts; hits++; sfx.play('correct'); status.innerHTML = `<b style="color:var(--es-success-text)">+${pts}</b> ${heard ? `· “${esc(heard)}”` : ''}`; }
        else { misses.push(p.es); sfx.play('wrong'); status.innerHTML = `<b style="color:var(--es-danger-text)">Missed</b> — <span lang="es">${esc(p.es)}</span>${heard ? ` · heard “${esc(heard)}”` : ''}`; }
        n++; frame.progress(n / total);
        await ES.wait(1100);
      }
    }
    ES.flow.result = { hits, total };
    await ui.complete(root, { title: 'Sprint finished!', xp: Math.round(score / 10), accuracy: Math.round((hits / total) * 100), extraHtml: `<p>Score <b>${score}</b> · ${hits} of ${total} chunks in time</p>` });
    ES.flow.back(root, { level, title: 'Fluency sprint', html: misses.length ? `<p>Back into review: <span lang="es">${esc(misses.join(', '))}</span></p>` : '<p>Every chunk in time!</p>' });
  };

  // ── sound refresh: from the error log ───────────────────────────────
  engines.sound_refresh = async (level, root) => {
    await ES.flow.intro(root, {
      title: level.title, kicker: 'From your error log', char: 'mara',
      body: 'Your weakest sound contrasts, heard in different voices, then recorded and compared.',
      bullets: level.errorLog.map((e) => `<b>${esc(e.contrast)}</b> — ${e.count} errors (${esc(e.examples.join('; '))})`),
      start: 'Start drills',
    });
    const frame = ui.frame(root, { hearts: null, onQuit: quit });
    const r = await ES.session.run(frame, { levelId: level.id, items: [...level.drills, ...level.record], practice: true, encourage: false });
    if (r.quit) return quit();
    await ui.complete(root, { title: 'Sounds refreshed!', xp: 6, accuracy: r.accuracy, timeMs: r.timeMs });
    ES.flow.back(root, { level, title: 'Sound Refresh finished', html: `<p>Perception ${r.accuracy}%. Contrasts you still miss stay at the top of your error log.</p>` });
  };

  // ── reading block: graded reader ────────────────────────────────────
  engines.reading_block = async (level, root) => {
    root.innerHTML = '';
    const pick = await new Promise((resolve) => {
      const page = h('div', { class: 'es-endscreen es-intro' }, `<div class="es-label es-muted">Reading Block · read for pleasure</div><h1 class="es-h2">What do you feel like reading?</h1>`);
      const grid = h('div', { class: 'es-grid-3 es-pickgrid' });
      level.texts.forEach((t) => {
        const b = h('button', { class: 'es-choice es-choice--image' }, `<span class="es-choice__art">${ES.art(t.art)}</span><span class="es-choice__row"><span><b lang="es">${esc(t.title)}</b><br><span class="es-muted es-small">${esc(t.interest)}</span></span></span>`);
        b.addEventListener('click', () => resolve(t));
        grid.append(b);
      });
      page.append(grid);
      const wrap = h('div', { class: 'es-lesson' }); wrap.append(h('div'), page, h('footer', { class: 'es-footer' })); root.append(wrap);
    });
    const frame = ui.frame(root, { onQuit: quit });
    const t0 = Date.now();
    const saved = new Set();
    const reader = h('article', { class: 'es-reader', lang: 'es' });
    reader.append(h('div', { class: 'es-reader__art' }, ES.art(pick.art)), h('h1', { class: 'es-h2' }, esc(pick.title)));
    const listen = h('button', { class: 'es-btn es-btn--secondary es-btn--sm' }, `${icon('speaker')} Listen to the text`);
    reader.append(listen);
    const paras = pick.body.map((p) => {
      const el = h('p', { class: 'es-reader__p' });
      p.split(/(\s+)/).forEach((tok) => {
        if (!tok.trim()) { el.append(document.createTextNode(tok)); return; }
        const bare = tok.replace(/[¿?¡!.,;:"“”]/g, '');
        const key = bare.toLowerCase();
        const gloss = level.glossary[key];
        const w = h('span', { class: 'es-rword', tabindex: '0', role: 'button' }, esc(tok));
        const open = () => {
          ES.$$('.es-rpop').forEach((x) => x.remove());
          ES.audio.say(bare, { voice: 'narrator' });
          const pop = h('div', { class: 'es-gloss es-rpop', role: 'dialog' }, `<b>${esc(bare)}</b> — ${esc(gloss || 'no hint')}<br>`);
          const save = h('button', { class: 'es-btn es-btn--plain es-btn--sm' }, saved.has(key) ? 'Saved ✓' : '+ Save word');
          save.addEventListener('click', (e) => { e.stopPropagation(); saved.add(key); w.dataset.saved = 'true'; save.textContent = 'Saved ✓'; count.textContent = `${saved.size} new word${saved.size === 1 ? '' : 's'} saved`; });
          pop.append(save); document.body.append(pop);
          const r = w.getBoundingClientRect();
          pop.style.left = `${Math.max(8, r.left + window.scrollX)}px`; pop.style.top = `${r.bottom + window.scrollY + 8}px`;
        };
        w.addEventListener('click', (e) => { e.stopPropagation(); open(); });
        w.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
        el.append(w);
      });
      reader.append(el);
      return { el, text: p };
    });
    document.addEventListener('click', () => ES.$$('.es-rpop').forEach((x) => x.remove()));
    const count = h('p', { class: 'es-muted' }, 'Tap any word for its meaning and audio; save the new ones.');
    reader.append(count);
    listen.addEventListener('click', async () => {
      for (const p of paras) { p.el.dataset.reading = 'true'; await ES.audio.say(p.text, { voice: 'mara' }); p.el.removeAttribute('data-reading'); }
    });
    frame.setBody(reader);
    frame.progress(0.5);
    await new Promise((resolve) => frame.footer.continueOnly({ label: "I've finished reading", onClick: resolve }));
    // one-sentence reaction
    frame.progress(0.8);
    const body = h('div', { class: 'es-ex' });
    body.append(ui.header('React in one sentence, in Spanish'), h('p', { class: 'es-muted' }, 'For example: Me gusta el café de Rosa. / El perro es muy simpático.'));
    const box = ES.textBox({ lang: 'es', placeholder: 'Escribe una frase…', onChange: () => frame.footer.ready(box.text().trim().length > 2) });
    const out = h('div', { class: 'es-said', hidden: true });
    body.append(box, out);
    frame.setBody(body);
    let reaction = null;
    await new Promise((resolve) => frame.footer.idle({
      checkLabel: 'Send', canCheck: false,
      onCheck: async () => {
        frame.footer.busy(true);
        reaction = await ES.api.post('/api/es/reaction', { levelId: level.id, title: pick.title, text: box.text() }).catch(() => null);
        out.hidden = false;
        out.innerHTML = reaction ? `<div class="es-said__label">${ES.character('mara')}</div><div class="es-said__text" lang="es">${esc(reaction.reply)}</div>${reaction.better && reaction.better.trim() !== box.text().trim() ? `<div class="es-said__hint">Polished: <b lang="es">${esc(reaction.better)}</b></div>` : ''}` : '';
        frame.footer.result({ correct: reaction ? reaction.ok : true, title: reaction && reaction.ok ? '¡Gracias por tu opinión!' : 'Try writing it in Spanish', onContinue: resolve, report: false });
      },
    }));
    await ui.complete(root, { title: 'Reading done!', xp: 10, timeMs: Date.now() - t0, extraHtml: `<p>${saved.size} new word${saved.size === 1 ? '' : 's'} logged${saved.size ? `: <span lang="es">${esc([...saved].join(', '))}</span>` : ''}.</p>` });
    ES.flow.back(root, { level, title: 'Reading Block finished', html: '<p>Saved words go into your review queue.</p>' });
  };
})();
