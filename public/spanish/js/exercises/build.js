/* Build-a-sentence challenges.
 *   translate             "Write this in English / Spanish" — word bank, or keyboard
 *                         (the "Use keyboard" toggle switches, like Duolingo's)
 *   tap_heard             "Tap what you hear" — audio + Spanish word bank
 *   type_heard            "Type what you hear" — audio + text box
 *   complete_translation  "Complete the translation" — type the missing word
 */
(function () {
  const ES = window.ES;
  const { h, esc, icon, sfx } = ES;
  const ex = (ES.ex = ES.ex || {});

  // Word bank: tap a tile to move it to the answer line (a grey slot stays
  // behind); tap it in the answer to send it back. FLIP animation between.
  function wordBank(tiles, { lang = null, onChange } = {}) {
    const wrap = h('div', { class: 'es-wordbank' });
    const answer = h('div', { class: 'es-answer', role: 'list', 'aria-label': 'Your answer' });
    const bank = h('div', { class: 'es-bank', role: 'list', 'aria-label': 'Word bank' });
    wrap.append(answer, bank);
    const order = [];
    const slots = ES.shuffle(tiles).map((t, i) => {
      const b = h('button', { class: 'es-tile', role: 'listitem', 'data-i': String(i) }, esc(t));
      if (lang) b.setAttribute('lang', lang);
      b.addEventListener('click', () => place(b));
      bank.append(b);
      return b;
    });
    function fly(from, to) {
      const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect();
      to.style.transition = 'none';
      to.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
      requestAnimationFrame(() => { to.style.transition = ''; to.style.transform = ''; });
    }
    function place(slot) {
      if (slot.dataset.state === 'ghost' || wrap.dataset.locked) return;
      const placed = h('button', { class: 'es-tile', role: 'listitem', 'data-from': slot.dataset.i }, esc(slot.textContent));
      if (lang) placed.setAttribute('lang', lang);
      placed.addEventListener('click', () => back(placed));
      answer.append(placed); fly(slot, placed);
      slot.dataset.state = 'ghost'; slot.setAttribute('aria-hidden', 'true'); slot.tabIndex = -1;
      order.push(placed);
      sfx.play('tap');
      if (lang === 'es') ES.audio.say(slot.textContent, { voice: 'narrator' });
      onChange && onChange();
    }
    function back(placed) {
      if (wrap.dataset.locked) return;
      const slot = slots.find((s) => s.dataset.i === placed.dataset.from);
      slot.removeAttribute('data-state'); slot.removeAttribute('aria-hidden'); slot.tabIndex = 0;
      fly(placed, slot);
      order.splice(order.indexOf(placed), 1); placed.remove();
      sfx.play('tap');
      onChange && onChange();
    }
    wrap.text = () => order.map((b) => b.textContent).join(' ');
    wrap.count = () => order.length;
    wrap.lock = (res) => { wrap.dataset.locked = '1'; order.forEach((b) => { b.dataset.result = res.correct ? 'correct' : 'wrong'; }); };
    // Backspace removes the last tile, like the app.
    wrap.keys = (e) => { if (e.key === 'Backspace' && order.length) back(order[order.length - 1]); };
    return wrap;
  }

  // Text box with an accent bar for Spanish.
  function textBox({ lang, placeholder, onChange, multiline = true }) {
    const wrap = h('div', { class: 'es-typebox' });
    const input = h(multiline ? 'textarea' : 'input', { class: 'es-input', lang, placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', rows: multiline ? '3' : null });
    input.addEventListener('input', () => onChange && onChange());
    wrap.append(input);
    if (lang === 'es') {
      const bar = h('div', { class: 'es-accents', 'aria-label': 'Spanish characters' });
      ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'].forEach((ch) => {
        const b = h('button', { class: 'es-btn es-btn--ghost', type: 'button', 'aria-label': `Insert ${ch}` }, ch);
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => {
          const s = input.selectionStart ?? input.value.length;
          input.setRangeText(ch, s, input.selectionEnd ?? s, 'end'); input.focus();
          onChange && onChange();
        });
        bar.append(b);
      });
      wrap.append(bar);
    }
    wrap.input = input;
    wrap.text = () => input.value;
    wrap.lock = (res) => { input.readOnly = true; input.setAttribute('aria-invalid', String(!res.correct)); input.dataset.result = res.correct ? 'correct' : 'wrong'; };
    setTimeout(() => input.focus({ preventScroll: true }), 60);
    return wrap;
  }

  ex.translate = (item, ctx) => {
    const toLang = item.from === 'es' ? 'en' : 'es';
    const el = h('div', { class: 'es-ex' });
    if (item.from === 'es') {
      el.append(ES.ui.speaker({ char: item.speaker || 'mara', text: item.text, glosses: item.glosses || null }));
    } else {
      el.append(ES.ui.speaker({ char: item.speaker || 'axo', text: item.text, html: esc(item.text), autoplay: false }));
      el.querySelector('.es-bubble__play').remove();
    }
    const slot = h('div', { class: 'es-ex__input' }); el.append(slot);
    const hasBank = Array.isArray(item.tiles) && item.tiles.length;
    let mode = item.mode === 'type' || !hasBank ? 'type' : 'bank';
    let widget = null;
    const toggle = hasBank ? h('button', { class: 'es-btn es-btn--ghost es-btn--sm es-kbd-toggle' }) : null;
    function render() {
      slot.innerHTML = '';
      widget = mode === 'bank'
        ? wordBank(item.tiles, { lang: toLang === 'es' ? 'es' : null, onChange: () => ctx.ready(widget.count() > 0) })
        : textBox({ lang: toLang, placeholder: toLang === 'es' ? 'Escribe en español' : 'Type in English', onChange: () => ctx.ready(widget.text().trim().length > 0) });
      slot.append(widget);
      if (toggle) toggle.textContent = mode === 'bank' ? 'Use keyboard' : 'Use word bank';
      ctx.ready(false);
    }
    if (toggle) toggle.addEventListener('click', () => { mode = mode === 'bank' ? 'type' : 'bank'; render(); });
    render();
    return {
      header: toLang === 'en' ? 'Write this in English' : 'Write this in Spanish',
      el,
      footerExtra: toggle,
      ready: () => (mode === 'bank' ? widget.count() > 0 : widget.text().trim().length > 0),
      response: () => ({ text: widget.text() }),
      showResult: (res) => widget.lock(res),
      keys: (e) => widget.keys && widget.keys(e),
    };
  };

  ex.tap_heard = (item, ctx) => {
    const el = h('div', { class: 'es-ex' });
    el.append(ES.ui.audioButtons(item.es, item.voice || 'narrator'));
    const bank = wordBank(item.tiles, { lang: 'es', onChange: () => ctx.ready(bank.count() > 0) });
    el.append(bank);
    return {
      header: item.prompt || 'Tap what you hear', el,
      ready: () => bank.count() > 0,
      response: () => ({ text: bank.text() }),
      showResult: (res) => bank.lock(res),
      keys: bank.keys,
      skip: { label: "Can't listen now", kind: 'listen' },
    };
  };

  ex.type_heard = (item, ctx) => {
    const el = h('div', { class: 'es-ex' });
    el.append(ES.ui.audioButtons(item.es, item.voice || 'narrator'));
    const box = textBox({ lang: 'es', placeholder: 'Escribe en español', onChange: () => ctx.ready(box.text().trim().length > 0) });
    el.append(box);
    return {
      header: 'Type what you hear', el,
      ready: () => box.text().trim().length > 0,
      response: () => ({ text: box.text() }),
      showResult: (res) => box.lock(res),
      skip: { label: "Can't listen now", kind: 'listen' },
    };
  };

  ex.complete_translation = (item, ctx) => {
    const el = h('div', { class: 'es-ex' });
    el.append(ES.ui.speaker({ char: item.speaker || 'axo', text: item.en, html: esc(item.en), autoplay: false }));
    el.querySelector('.es-bubble__play').remove();
    const line = h('div', { class: 'es-fill es-fill--type', lang: 'es' });
    const input = h('input', { class: 'es-inline-input', lang: 'es', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Missing word' });
    input.addEventListener('input', () => { input.style.width = `${Math.max(4, input.value.length + 1)}ch`; ctx.ready(input.value.trim().length > 0); });
    if (item.before) line.append(document.createTextNode(`${item.before} `));
    line.append(input);
    if (item.after) line.append(document.createTextNode(` ${item.after}`));
    el.append(line);
    setTimeout(() => input.focus({ preventScroll: true }), 60);
    return {
      header: 'Complete the translation', el,
      ready: () => input.value.trim().length > 0,
      response: () => ({ text: input.value }),
      showResult: (res) => { input.readOnly = true; input.dataset.result = res.correct ? 'correct' : 'wrong'; },
    };
  };

  ES.wordBank = wordBank;
  ES.textBox = textBox;
})();
