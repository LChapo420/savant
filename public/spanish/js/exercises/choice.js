/* Choice challenges: one tap picks an answer, CHECK grades it on the server.
 *   select_image        "Which one of these is "water"?"   picture cards, 1-4 keys
 *   select_meaning      character says Spanish -> pick the English
 *   select_translation  English prompt -> pick the Spanish
 *   listen_choose       "What do you hear?" audio -> pick the Spanish
 *   listen_meaning      audio only -> pick the English
 *   listen_meaning_clip question about a clip already heard
 *   fill_choice         "Choose the missing word"
 *   complete_chat       "Complete the chat"
 *   read_respond        passage or sign -> question
 *   minimal_pair        "Which word do you hear?" two near-identical words
 */
(function () {
  const ES = window.ES;
  const { h, esc, icon, sfx } = ES;
  const ex = (ES.ex = ES.ex || {});

  // A column / grid of choice cards with number-key shortcuts.
  function choices(items, { image = false, onPick, speakOnPick = null, lang = null } = {}) {
    const grid = h('div', { class: image ? 'es-grid-3 es-choices' : 'es-stack es-choices', role: 'radiogroup' });
    let picked = -1;
    const cards = items.map((c, i) => {
      const b = h('button', { class: `es-choice${image ? ' es-choice--image' : ''}`, role: 'radio', 'aria-checked': 'false' });
      if (image) b.innerHTML = `<span class="es-choice__art">${ES.art(c.art) || ''}</span><span class="es-choice__row"><span ${lang ? `lang="${lang}"` : ''}>${esc(c.label)}</span><span class="es-choice__key">${i + 1}</span></span>`;
      else b.innerHTML = `<span class="es-choice__key">${i + 1}</span><span class="es-choice__text" ${lang ? `lang="${lang}"` : ''}>${esc(c.label)}</span>`;
      b.addEventListener('click', () => pick(i));
      grid.append(b);
      return b;
    });
    function pick(i) {
      if (grid.dataset.locked) return;
      picked = i;
      cards.forEach((c, j) => c.setAttribute('aria-checked', String(j === i)));
      sfx.play('select');
      if (speakOnPick) speakOnPick(i);
      onPick && onPick(i);
    }
    grid.keys = (e) => { const n = Number(e.key); if (n >= 1 && n <= cards.length) pick(n - 1); };
    grid.picked = () => picked;
    grid.mark = (res) => {
      grid.dataset.locked = '1';
      cards.forEach((c) => c.setAttribute('aria-disabled', 'true'));
      if (picked >= 0) cards[picked].dataset.result = res.correct ? 'correct' : 'wrong';
    };
    return grid;
  }

  const base = (ctx, grid, extra = {}) => ({
    ready: () => grid.picked() >= 0,
    response: () => ({ index: grid.picked() }),
    showResult: (res) => grid.mark(res),
    keys: grid.keys,
    ...extra,
  });

  ex.select_image = (item, ctx) => {
    const grid = choices(item.choices.map((c) => ({ label: c.es, art: c.art })), {
      image: true, lang: 'es', onPick: () => ctx.ready(true),
      speakOnPick: (i) => ES.audio.say(item.choices[i].es, { voice: 'narrator' }),
    });
    return base(ctx, grid, { header: item.prompt || `Which one of these is “${item.en}”?`, el: grid });
  };

  ex.select_meaning = (item, ctx) => {
    const sp = ES.ui.speaker({ char: item.speaker || 'mara', text: item.es });
    const grid = choices(item.choices.map((label) => ({ label })), { onPick: () => ctx.ready(true) });
    const el = h('div', { class: 'es-ex' }); el.append(sp, grid);
    return base(ctx, grid, { header: 'Select the correct meaning', el });
  };

  ex.select_translation = (item, ctx) => {
    const prompt = h('div', { class: 'es-prompt-card' }, `<span class="es-muted es-label">Translate</span><div class="es-h3">${esc(item.en)}</div>`);
    const grid = choices(item.choices.map((label) => ({ label })), {
      lang: 'es', onPick: () => ctx.ready(true),
      speakOnPick: (i) => ES.audio.say(item.choices[i], { voice: 'narrator' }),
    });
    const el = h('div', { class: 'es-ex' }); el.append(prompt, grid);
    return base(ctx, grid, { header: 'Select the correct translation', el });
  };

  ex.listen_choose = (item, ctx) => {
    const btns = ES.ui.audioButtons(item.es, item.voice || 'narrator');
    const grid = choices(item.choices.map((label) => ({ label })), { lang: 'es', onPick: () => ctx.ready(true) });
    const el = h('div', { class: 'es-ex' }); el.append(btns, grid);
    return base(ctx, grid, { header: 'What do you hear?', el, skip: { label: "Can't listen now", kind: 'listen' } });
  };

  ex.listen_image = (item, ctx) => {
    const btns = ES.ui.audioButtons(item.es, item.voice || 'narrator');
    const grid = h('div', { class: 'es-grid-3 es-choices', role: 'radiogroup' });
    let picked = -1;
    const cards = item.choices.map((c, i) => {
      const b = h('button', { class: 'es-choice es-choice--image es-choice--piconly', role: 'radio', 'aria-checked': 'false', 'aria-label': `Picture ${i + 1}` },
        `<span class="es-choice__art">${ES.art(c.art) || ''}</span><span class="es-choice__row"><span></span><span class="es-choice__key">${i + 1}</span></span>`);
      b.addEventListener('click', () => { if (grid.dataset.locked) return; picked = i; cards.forEach((x, j) => x.setAttribute('aria-checked', String(j === i))); sfx.play('select'); ctx.ready(true); });
      grid.append(b); return b;
    });
    const el = h('div', { class: 'es-ex' }); el.append(btns, grid);
    return {
      header: 'Tap the picture you hear', el,
      ready: () => picked >= 0,
      response: () => ({ index: picked }),
      showResult: (res) => { grid.dataset.locked = '1'; if (picked >= 0) cards[picked].dataset.result = res.correct ? 'correct' : 'wrong'; },
      keys: (e) => { const n = Number(e.key); if (n >= 1 && n <= cards.length) cards[n - 1].click(); },
      skip: { label: "Can't listen now", kind: 'listen' },
    };
  };

  ex.listen_meaning = (item, ctx) => {
    const btns = ES.ui.audioButtons(item.es, item.voice || 'narrator');
    const grid = choices(item.choices.map((label) => ({ label })), { onPick: () => ctx.ready(true) });
    const el = h('div', { class: 'es-ex' }); el.append(btns, grid);
    return base(ctx, grid, { header: 'What does this mean?', el, skip: { label: "Can't listen now", kind: 'listen' } });
  };

  ex.listen_meaning_clip = (item, ctx) => {
    const grid = choices(item.choices.map((label) => ({ label })), { onPick: () => ctx.ready(true) });
    return base(ctx, grid, { header: item.question, el: grid });
  };

  ex.fill_choice = (item, ctx) => {
    const sentence = h('div', { class: 'es-fill', lang: 'es' });
    const blank = h('span', { class: 'es-blank' }, '&nbsp;');
    if (item.before) sentence.append(document.createTextNode(`${item.before} `));
    sentence.append(blank);
    if (item.after) sentence.append(document.createTextNode(` ${item.after}`));
    const grid = choices(item.choices.map((label) => ({ label })), {
      lang: 'es',
      onPick: (i) => { blank.textContent = item.choices[i]; blank.dataset.filled = '1'; ctx.ready(true); },
    });
    const el = h('div', { class: 'es-ex' });
    if (item.en) el.append(h('p', { class: 'es-muted es-fill__en' }, esc(item.en)));
    el.append(sentence, grid);
    return base(ctx, grid, {
      header: 'Choose the missing word', el,
      showResult: (res) => { grid.mark(res); blank.dataset.result = res.correct ? 'correct' : 'wrong'; },
    });
  };

  ex.complete_chat = (item, ctx) => {
    const chat = h('div', { class: 'es-chat' });
    item.lines.forEach((l, i) => {
      const row = h('div', { class: 'es-chat__row' });
      row.append(h('div', { class: 'es-chat__avatar' }, ES.character(l.who)));
      const b = h('div', { class: 'es-bubble es-chat__bubble' }, `<button class="es-iconbtn es-bubble__play" aria-label="Play">${icon('speaker')}</button><span lang="es">${esc(l.es)}</span>`);
      const charEl = row.querySelector('.es-char');
      b.querySelector('button').addEventListener('click', () => ES.audio.say(l.es, { voice: l.who, char: charEl }));
      row.append(b); chat.append(row);
      if (i === item.lines.length - 1) setTimeout(() => ES.audio.say(l.es, { voice: l.who, char: charEl }), 250);
    });
    const me = h('div', { class: 'es-chat__row es-chat__row--me' }, '<div class="es-bubble es-chat__bubble es-chat__pending" lang="es">…</div>');
    chat.append(me);
    const grid = choices(item.choices.map((label) => ({ label })), {
      lang: 'es',
      onPick: (i) => { me.querySelector('.es-chat__pending').textContent = item.choices[i]; ctx.ready(true); },
    });
    const el = h('div', { class: 'es-ex' }); el.append(chat, grid);
    return base(ctx, grid, { header: 'Complete the chat', el });
  };

  ex.read_respond = (item, ctx) => {
    const el = h('div', { class: 'es-ex' });
    if (item.sign) el.append(h('div', { class: 'es-sign', lang: 'es' }, esc(item.sign)));
    if (item.passage) {
      const p = h('div', { class: 'es-passage', lang: 'es' });
      const play = h('button', { class: 'es-iconbtn es-bubble__play', 'aria-label': 'Read aloud' }, icon('speaker'));
      play.addEventListener('click', () => ES.audio.say(item.passage, { voice: 'narrator' }));
      p.append(play, document.createTextNode(item.passage));
      el.append(p);
    }
    const grid = choices(item.choices.map((label) => ({ label })), { lang: item.signPick ? 'es' : null, onPick: () => ctx.ready(true) });
    el.append(grid);
    return base(ctx, grid, { header: item.question, el });
  };

  ex.minimal_pair = (item, ctx) => {
    const word = item.pair[item.answer != null ? item.answer : 0];
    // The server keeps the answer; the browser asks it which word to play.
    const btns = h('div', { class: 'es-audio-row' });
    const play = h('button', { class: 'es-audio', 'aria-label': 'Play' }, icon('speaker'));
    const slow = h('button', { class: 'es-audio es-audio--slow', 'aria-label': 'Play slowly' }, icon('turtle'));
    btns.append(play, slow);
    let target = null;
    const fetchTarget = () => (target ? Promise.resolve(target) : ES.api.post('/api/es/lab/say', { levelId: ctx.levelId, itemId: item.id }).then((r) => { target = r.text; return target; }).catch(() => word));
    const say = async (btn, s) => { btn.dataset.playing = 'true'; await ES.audio.say(await fetchTarget(), { voice: item.voice || 'narrator', slow: s }); btn.dataset.playing = 'false'; };
    play.addEventListener('click', () => say(play, false));
    slow.addEventListener('click', () => say(slow, true));
    setTimeout(() => say(play, false), 250);
    const grid = choices(item.pair.map((label) => ({ label })), { lang: 'es', onPick: () => ctx.ready(true) });
    grid.classList.add('es-pair-choices');
    const el = h('div', { class: 'es-ex' }); el.append(btns, grid);
    return base(ctx, grid, { header: 'Which word do you hear?', el, skip: { label: "Can't listen now", kind: 'listen' } });
  };
})();
