/* The remaining challenges.
 *   match_pairs     "Tap the matching pairs" — instant feedback, a wrong pair costs a heart
 *   speak           "Speak this sentence" — mic, recognised and scored, 2 tries
 *   record_compare  record yourself, then play yours against the model
 *   fix_sentence    "Find and fix the mistake" — tap the wrong word, then pick the fix
 *   sound_tip       a teaching card (no grading)
 */
(function () {
  const ES = window.ES;
  const { h, esc, icon, sfx } = ES;
  const ex = (ES.ex = ES.ex || {});

  ex.match_pairs = (item, ctx) => {
    const left = ES.shuffle(item.pairs.map((p, i) => ({ text: p[0], key: i })));
    const right = ES.shuffle(item.pairs.map((p, i) => ({ text: p[1], key: i })));
    const grid = h('div', { class: 'es-pairs' });
    const cells = [];
    left.forEach((l, i) => {
      const a = h('button', { class: 'es-choice', 'aria-pressed': 'false', lang: 'es', 'data-key': String(l.key), 'data-side': '0' }, `<span class="es-choice__key">${i + 1}</span><span class="es-choice__text">${esc(l.text)}</span>`);
      const b = h('button', { class: 'es-choice', 'aria-pressed': 'false', 'data-key': String(right[i].key), 'data-side': '1' }, `<span class="es-choice__key">${(i + 6) % 10}</span><span class="es-choice__text">${esc(right[i].text)}</span>`);
      grid.append(a, b); cells.push(a, b);
    });
    let sel = null; let matched = 0; let mistakes = 0;
    function tap(c) {
      if (c.dataset.result === 'done' || c.dataset.result) return;
      if (c.dataset.side === '0') ES.audio.say(c.textContent.replace(/^\d/, ''), { voice: 'narrator' });
      if (!sel || sel.dataset.side === c.dataset.side) {
        if (sel) sel.setAttribute('aria-pressed', 'false');
        sel = c; c.setAttribute('aria-pressed', 'true'); sfx.play('select'); return;
      }
      const a = sel; sel = null; a.setAttribute('aria-pressed', 'false');
      if (a.dataset.key === c.dataset.key) {
        [a, c].forEach((x) => { x.dataset.result = 'correct'; });
        sfx.play('pair');
        setTimeout(() => [a, c].forEach((x) => { x.dataset.result = 'done'; x.disabled = true; }), 300);
        matched++;
        if (matched === item.pairs.length) setTimeout(() => ctx.selfResult({ correct: true, mistakes }), 420);
      } else {
        [a, c].forEach((x) => { x.dataset.result = 'wrong'; });
        sfx.play('wrong'); mistakes++;
        ctx.mistake();
        setTimeout(() => [a, c].forEach((x) => x.removeAttribute('data-result')), 550);
      }
    }
    cells.forEach((c) => c.addEventListener('click', () => tap(c)));
    const order = []; for (let i = 0; i < left.length; i++) order[i] = cells[i * 2];
    const rightCells = []; for (let i = 0; i < left.length; i++) rightCells[i] = cells[i * 2 + 1];
    return {
      header: 'Tap the matching pairs', el: grid, self: true, noSkip: true,
      keys: (e) => {
        if (!/^[0-9]$/.test(e.key)) return;
        const n = Number(e.key);
        if (n >= 1 && n <= 5) { if (order[n - 1]) tap(order[n - 1]); return; }
        const r = n === 0 ? 4 : n - 6;
        if (rightCells[r]) tap(rightCells[r]);
      },
    };
  };

  // Speaking switched off for an hour after "Can't speak now", like the app.
  ES.speakingOff = () => { try { return Number(localStorage.getItem('es-nospeak-until') || 0) > Date.now(); } catch { return false; } };
  ES.setSpeakingOff = () => { try { localStorage.setItem('es-nospeak-until', String(Date.now() + 3600 * 1000)); } catch { /* ignore */ } };
  ES.listeningOff = () => { try { return Number(localStorage.getItem('es-nolisten-until') || 0) > Date.now(); } catch { return false; } };
  ES.setListeningOff = () => { try { localStorage.setItem('es-nolisten-until', String(Date.now() + 3600 * 1000)); } catch { /* ignore */ } };

  ex.speak = (item, ctx) => {
    const el = h('div', { class: 'es-ex' });
    const sp = ES.ui.speaker({ char: item.speaker || 'mara', text: item.es });
    el.append(sp);
    if (item.en) el.append(h('p', { class: 'es-muted es-speak__en' }, esc(item.en)));
    const said = h('div', { class: 'es-said', 'aria-live': 'polite' });
    let tries = 0;
    const mic = ES.ui.mic({
      onResult: async ({ transcript }) => {
        tries++;
        const res = await ES.api.post('/api/es/check', { levelId: ctx.levelId, itemId: item.id, response: { transcript } }).catch(() => null);
        if (!res) { said.innerHTML = '<span class="es-muted">Could not check that. Try again.</span>'; return; }
        const youSaid = `<div class="es-said__label">You said</div><div class="es-said__text" lang="es">${esc(transcript || '…')}</div>`;
        if (res.correct || tries >= 2) {
          ctx.selfResult({ ...res, solution: item.es, extraHtml: `<div class="es-verdict__said">${res.correct ? `${res.score}% match` : `You said: “${esc(transcript || '…')}”`}</div>` });
        } else {
          said.innerHTML = `${youSaid}<div class="es-said__hint">Not quite (${res.score}%). ${res.missing && res.missing.length ? `Listen for: <b lang="es">${esc(res.missing.join(', '))}</b>. ` : ''}Try once more.</div>`;
          sfx.play('wrong');
        }
      },
    });
    el.append(mic, said);
    return { header: item.prompt || 'Speak this sentence', el, self: true, skip: { label: "Can't speak now", kind: 'speak' } };
  };

  ex.record_compare = (item, ctx) => {
    const el = h('div', { class: 'es-ex' });
    el.append(h('div', { class: 'es-tag es-tag--mistake' }, `${icon('target')}Focus: ${esc(item.focus)}`));
    const sp = ES.ui.speaker({ char: item.voice || 'mara', text: item.es });
    el.append(sp);
    const compare = h('div', { class: 'es-compare' });
    let transcript = null;
    const mic = ES.ui.mic({
      label: 'Record yourself',
      onResult: ({ transcript: t, wav }) => {
        transcript = t || '';
        const mine = wav && wav.size > 44 ? URL.createObjectURL(wav) : null;
        compare.innerHTML = '';
        const model = h('button', { class: 'es-btn es-btn--secondary es-btn--sm' }, `${icon('speaker')} Model`);
        model.addEventListener('click', () => sp.say());
        compare.append(model);
        if (mine) {
          const you = h('button', { class: 'es-btn es-btn--ghost es-btn--sm' }, `${icon('mic')} You`);
          you.addEventListener('click', () => new Audio(mine).play());
          compare.append(you);
        }
        compare.append(h('div', { class: 'es-said' }, `<div class="es-said__label">Recognised</div><div class="es-said__text" lang="es">${esc(transcript || '…')}</div><div class="es-said__hint">Play both, then check. Record again if you want another try.</div>`));
        ctx.ready(true);
      },
    });
    el.append(mic, compare);
    return {
      header: 'Record and compare', el,
      ready: () => transcript !== null,
      response: () => ({ transcript }),
      showResult: (res) => { if (res.score != null) res.extraHtml = `<div class="es-verdict__said">${res.score}% match</div>`; },
      skip: { label: "Can't speak now", kind: 'speak' },
    };
  };

  ex.fix_sentence = (item, ctx) => {
    const el = h('div', { class: 'es-ex' });
    if (item.en) el.append(h('p', { class: 'es-muted' }, `Meaning: ${esc(item.en)}`));
    const line = h('div', { class: 'es-fixline', lang: 'es' });
    let wrong = -1; let fix = -1;
    const chips = item.tokens.map((t, i) => {
      const c = h('button', { class: 'es-tile es-fix-word', 'aria-pressed': 'false' }, esc(t));
      c.addEventListener('click', () => {
        if (el.dataset.locked) return;
        wrong = i; fix = -1;
        chips.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
        sfx.play('select');
        renderFixes();
        ctx.ready(false);
      });
      line.append(c); return c;
    });
    const fixes = h('div', { class: 'es-stack es-fixes' });
    function renderFixes() {
      fixes.innerHTML = '';
      fixes.append(h('div', { class: 'es-label es-muted' }, `Replace “${esc(item.tokens[wrong])}” with:`));
      item.choices.forEach((ch, k) => {
        const b = h('button', { class: 'es-choice', role: 'radio', 'aria-checked': 'false', lang: 'es' }, `<span class="es-choice__key">${k + 1}</span><span class="es-choice__text">${esc(ch)}</span>`);
        b.addEventListener('click', () => { if (el.dataset.locked) return; fix = k; ES.$$('.es-choice', fixes).forEach((x, j) => x.setAttribute('aria-checked', String(j === k))); sfx.play('select'); ctx.ready(true); });
        fixes.append(b);
      });
    }
    el.append(line, fixes);
    return {
      header: 'Find and fix the mistake', el,
      ready: () => wrong >= 0 && fix >= 0,
      response: () => ({ wrong, fix }),
      showResult: (res) => {
        el.dataset.locked = '1';
        if (chips[wrong]) chips[wrong].dataset.result = res.correct ? 'correct' : 'wrong';
        if (!res.correct && res.wrongIndex >= 0 && chips[res.wrongIndex]) chips[res.wrongIndex].dataset.result = 'correct';
      },
      keys: (e) => { const n = Number(e.key); const b = ES.$$('.es-choice', fixes)[n - 1]; if (b) b.click(); },
    };
  };

  ex.sound_tip = (item) => {
    const el = h('div', { class: 'es-ex es-tip' });
    el.append(ES.ui.speaker({ char: 'axo', text: '', html: esc(item.body), autoplay: false }));
    el.querySelector('.es-bubble__play').remove();
    const ex2 = h('div', { class: 'es-tip__examples' });
    item.examples.forEach((w) => {
      const b = h('button', { class: 'es-tile', lang: 'es' }, `${icon('speaker')} ${esc(w)}`);
      b.addEventListener('click', () => ES.audio.say(w, { voice: 'mara' }));
      ex2.append(b);
    });
    el.append(ex2);
    return { header: item.title, el, info: true };
  };
})();
