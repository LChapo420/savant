/* The question renderer, shared by the placement quiz, lessons, checkpoints, and
 * the retention questions. One renderer means a format only has to be understood
 * once.
 *
 * It renders and collects; it does not decide anything. Whether an answer is
 * revealed, what happens next, and how progress is shown belong to the page.
 *
 * Two kinds of help hang off an item, and the difference matters:
 *   the coach  runs BEFORE the answer and never states it — it asks questions
 *              until the learner gets there themselves
 *   ask        runs AFTER the answer, when the answer is already on screen, and
 *              explains directly
 */
(function () {
  const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /**
   * @param {HTMLElement} host
   * @param {object} item     sanitized item from the API
   * @param {object} opts
   * @param {function} opts.onSubmit  called with the answer string
   * @param {string}  [opts.label]    small line above the prompt
   * @param {boolean} [opts.coach]    offer the coach (default true)
   * @param {boolean} [opts.askConfidence]  show the optional "how sure are you?" row
   * @param {string}  [opts.savedAnswer]    an answer already given, shown on the question
   *
   * onSubmit receives (answer, meta) where meta carries the learner's stated
   * confidence ('sure' | 'think' | 'guess' | null) and, for typed answers, how
   * many times they revised it — both feed the learning scorecard.
   */
  function render(host, item, opts) {
    const { onSubmit } = opts;
    host.innerHTML = '';
    let confidence = null;

    if (opts.label) {
      host.appendChild(App.el('div', { class: 'row', style: 'margin-bottom:10px' },
        `<span class="role-tag">${App.escapeHtml(opts.label)}</span>
         <span class="chip">${App.escapeHtml(item.skill_name || '')}</span>
         <span class="chip">difficulty ${item.difficulty}</span>
         ${item.level ? `<span class="chip">level ${item.level}</span>` : ''}`));
    }

    if (item.passage) {
      host.appendChild(App.el('div', { class: 'passage' }, App.escapeHtml(item.passage)));
    }

    host.appendChild(App.el('div', { class: 'prompt' }, App.escapeHtml(item.prompt)));

    // A question set on a chess position shows the board. On a typed question a
    // move made there fills the answer box, so the learner can answer either way.
    let boardSlot = null;
    if (item.fen) {
      boardSlot = App.el('div', { class: 'chess-slot', style: 'margin:12px 0' });
      host.appendChild(boardSlot);
    }

    if (opts.askConfidence) {
      const row = App.el('div', { class: 'confidence-row' },
        `<span class="tiny muted">Before you answer — how sure are you? (optional)</span>
         <button type="button" class="chip-btn" data-confidence="sure">Sure</button>
         <button type="button" class="chip-btn" data-confidence="think">I think so</button>
         <button type="button" class="chip-btn" data-confidence="guess">Guessing</button>`);
      row.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-confidence]');
        if (!btn) return;
        confidence = confidence === btn.dataset.confidence ? null : btn.dataset.confidence;
        [...row.querySelectorAll('[data-confidence]')].forEach((b) => b.classList.toggle('selected', b.dataset.confidence === confidence));
      });
      host.appendChild(row);
    }

    let handles;
    if (item.format === 'multiple_choice' && item.choices) {
      const choices = App.el('div', { class: 'choices' });
      item.choices.forEach((choice, i) => {
        const btn = App.el('button', { class: 'choice', type: 'button', 'data-choice': choice },
          `<span class="key">${KEYS[i] || i + 1}</span><span>${App.escapeHtml(choice)}</span>`);
        // An answer already given is shown but not locked: this question is being
        // looked at again, and clicking any option is how it gets changed.
        if (opts.savedAnswer != null && String(opts.savedAnswer) === choice) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          [...choices.children].forEach((c) => { c.disabled = true; });
          btn.classList.add('selected');
          closeCoach(host);
          onSubmit(choice, { node: btn, container: choices, confidence, changes: 0 });
        });
        choices.appendChild(btn);
      });
      host.appendChild(choices);
      handles = { container: host, choices };
    } else {
      // type_in and short_answer differ only in the size of the box.
      const long = item.format === 'short_answer';
      const input = App.el(long ? 'textarea' : 'input', {
        id: 'answer-input',
        type: long ? null : 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        placeholder: long ? 'Write your answer' : 'Type your answer',
      });
      // Coming back to a question shows what was typed there before, ready to
      // be kept or changed.
      if (opts.savedAnswer != null) input.value = String(opts.savedAnswer);
      const button = App.el('button', { class: 'btn btn-primary', type: 'button' }, 'Submit');
      const row = App.el('div', { class: 'answer-row' });
      row.appendChild(input);
      row.appendChild(button);
      host.appendChild(row);

      // A revision is a run of edits that removes text: typing on is not a change
      // of mind, and holding backspace through one word is one revision, not ten.
      let changes = 0;
      let lastLength = 0;
      let deleting = false;
      input.addEventListener('input', () => {
        const shorter = input.value.length < lastLength;
        if (shorter && !deleting) changes++;
        deleting = shorter;
        lastLength = input.value.length;
      });

      const submit = () => {
        const value = input.value.trim();
        if (!value) { input.focus(); return; }
        input.disabled = true;
        button.disabled = true;
        closeCoach(host);
        onSubmit(value, { input, button, confidence, changes });
      };
      button.addEventListener('click', submit);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (!long || (event.ctrlKey || event.metaKey))) {
          event.preventDefault();
          submit();
        }
      });
      setTimeout(() => input.focus(), 30);
      handles = { container: host, input, button };
    }

    if (boardSlot) mountBoard(boardSlot, item, handles);

    if (opts.coach !== false && item.id) {
      mountCoach(host, item);
      schedulePrime(host, item);
    }
    return handles;
  }

  /** Load a same-origin script once; resolves when it has run. */
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`could not load ${src}`));
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }

  /**
   * Draw the question's position. On a typed question the board is live: the move
   * made on it is written into the answer box (in algebraic notation), and "Reset
   * board" puts the pieces back. On a multiple-choice question it is only shown.
   */
  function mountBoard(slot, item, handles) {
    loadScript('/engine/chess/chess-core.js')
      .then(() => loadScript('/engine/chess/board.js'))
      .then(() => {
        const input = handles && handles.input;
        const pos = window.PolymathChess.parseFen(item.fen);
        let board = null;
        const reset = App.el('button', { class: 'btn btn-sm', type: 'button', style: 'margin-top:8px' }, 'Reset board');
        board = window.PolymathBoard.create(slot, {
          fen: item.fen,
          orientation: pos.side === 'b' ? 'black' : 'white',
          interactive: !!input,
          onMove: (m, san) => {
            if (!input || input.disabled) return;
            input.value = san;
            input.dispatchEvent(new Event('input'));
            board.setInteractive(false);
          },
        });
        if (input) {
          reset.addEventListener('click', () => {
            if (input.disabled) return;
            board.setPosition(item.fen);
            board.setInteractive(true);
            input.value = '';
            input.focus();
          });
          slot.appendChild(reset);
        }
      })
      .catch(() => { slot.textContent = ''; });
  }

  /**
   * Ask the server to write the coach's opening question in the background.
   *
   * Fired after a few seconds on the same question, which is the point at which
   * a learner is either working or stuck. If they then reach for help, the
   * opener is already written and the coach opens with no wait at all. If they
   * answer instead, one cheap call was spent and nothing was lost.
   */
  const PRIME_AFTER_MS = 3500;
  function schedulePrime(host, item) {
    const timer = setTimeout(() => {
      if (!host.isConnected) return;
      App.api.post(`/api/items/${item.id}/coach/prime`, {}).catch(() => { /* best effort */ });
    }, PRIME_AFTER_MS);
    // Answering or leaving the question cancels it.
    host.addEventListener('click', function cancel(event) {
      if (event.target.closest('.choice') || event.target.closest('.answer-row button')) {
        clearTimeout(timer);
        host.removeEventListener('click', cancel);
      }
    });
  }

  function closeCoach(host) {
    const panel = host.querySelector('.coach-panel');
    if (panel) panel.classList.add('coach-panel-done');
    const trigger = host.querySelector('[data-act="coach"]');
    if (trigger) trigger.disabled = true;
  }

  /**
   * The coach button and its conversation. The history lives on the client and
   * is sent with each turn; the server holds the question and the answer and is
   * under instruction never to give the answer away.
   */
  function mountCoach(host, item) {
    const bar = App.el('div', { class: 'coach-bar' });
    const trigger = App.el('button', { class: 'btn btn-sm', type: 'button', 'data-act': 'coach' },
      `${window.icon('help')}Help me work it out`);
    const note = App.el('span', { class: 'tiny muted' }, 'The coach asks questions, it will not give you the answer.');
    bar.appendChild(trigger);
    bar.appendChild(note);
    host.appendChild(bar);

    trigger.addEventListener('click', () => {
      if (host.querySelector('.coach-panel')) return;
      trigger.disabled = true;
      const panel = App.el('div', { class: 'coach-panel' });
      panel.innerHTML = `
        <div class="coach-head">${window.icon('brain')}<span>Working it out together</span></div>
        <div class="coach-log" data-slot="log"></div>
        <div class="answer-row">
          <input type="text" placeholder="Say what you are thinking" maxlength="500">
          <button class="btn btn-primary" type="button">Send</button>
        </div>`;
      host.appendChild(panel);

      const log = panel.querySelector('[data-slot="log"]');
      const input = panel.querySelector('input');
      const send = panel.querySelector('button');
      const history = [];

      function bubble(role, text) {
        log.appendChild(App.el('div', { class: `coach-msg coach-${role}` }, App.escapeHtml(text)));
        log.scrollTop = log.scrollHeight;
      }

      /**
       * One coaching turn. The reply is streamed, so the bubble fills in as the
       * tutor writes instead of the learner watching a spinner; if the stream is
       * unavailable the plain endpoint is used and the whole reply lands at once.
       */
      async function turn(userText) {
        if (userText) {
          history.push({ role: 'user', content: userText });
          bubble('learner', userText);
        }
        input.disabled = true;
        send.disabled = true;

        const node = App.el('div', { class: 'coach-msg coach-tutor' }, '<span class="spinner"></span>');
        log.appendChild(node);
        log.scrollTop = log.scrollHeight;

        let text = '';
        const write = (chunk) => {
          text += chunk;
          node.textContent = text;
          log.scrollTop = log.scrollHeight;
        };

        try {
          const res = await fetch(`/api/items/${item.id}/coach/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: history }),
            credentials: 'same-origin',
          });
          if (!res.ok || !res.body) throw new Error('stream unavailable');

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
            const frames = buffer.split('\n\n');
            buffer = frames.pop() || '';
            for (const frame of frames) {
              const line = frame.split('\n').find((l) => l.startsWith('data:'));
              if (!line) continue;
              let payload;
              try { payload = JSON.parse(line.slice(5).trim()); } catch { continue; }
              if (payload.delta) write(payload.delta);
              // The server pulled the reply: drop what is on screen and show
              // what it sent instead.
              if (payload.replace) { text = ''; node.textContent = ''; write(payload.replace); }
            }
          }
          if (!text) throw new Error('empty stream');
        } catch {
          // Fall back to the non-streaming endpoint.
          try {
            const data = await App.api.post(`/api/items/${item.id}/coach`, { messages: history });
            text = data.reply;
            node.textContent = text;
          } catch (err) {
            node.textContent = err.message;
          }
        }

        if (text) history.push({ role: 'assistant', content: text });
        input.disabled = false;
        send.disabled = false;
        input.focus();
      }

      send.addEventListener('click', () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        turn(text);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); send.click(); }
      });

      turn(null); // the coach opens with a question of its own
    });
  }

  /**
   * Show the verdict under an answered item, including the follow-up question
   * box and the report link — the two things a learner needs when a question
   * feels wrong rather than hard.
   */
  function reveal(host, item, result, opts) {
    const correct = !!result.correct;
    const box = App.el('div', { class: `verdict ${correct ? 'verdict-correct' : 'verdict-wrong'}` });
    box.innerHTML = `
      <h4>${window.icon(correct ? 'check-circle' : 'x-circle')}${correct ? 'Correct' : 'Not quite'}</h4>
      ${correct ? '' : `<div class="small" style="margin-bottom:6px">Answer: <strong>${App.escapeHtml(result.answer)}</strong></div>`}
      ${result.feedback ? `<div class="small" style="margin-bottom:6px">${App.escapeHtml(result.feedback)}</div>` : ''}
      <div class="rationale">${App.escapeHtml(result.rationale || '')}</div>
      <div class="verdict-actions">
        <button class="btn btn-sm" data-act="ask">${window.icon('help')}Ask about this</button>
        <button class="btn btn-sm btn-danger" data-act="report">${window.icon('flag')}Report a problem</button>
        <span class="spacer"></span>
        ${opts && opts.nextLabel ? `<button class="btn btn-primary btn-sm" data-act="next">${App.escapeHtml(opts.nextLabel)}${window.icon('arrow-right')}</button>` : ''}
      </div>
      <div data-slot="extra"></div>`;

    if (item.choices) {
      // Mark the choices so the learner sees which one was right without rereading.
      const container = host.querySelector('.choices');
      if (container) {
        [...container.children].forEach((node) => {
          const value = node.dataset.choice;
          if (value === result.answer) node.classList.add('correct');
          else if (node.classList.contains('selected')) node.classList.add('wrong');
        });
      }
    }

    host.appendChild(box);
    // On a phone the verdict lands below the fold; bring it, and the Next
    // button in it, into view. Instant when the learner asked for less motion.
    if (box.scrollIntoView) {
      const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      box.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
    }
    const extra = box.querySelector('[data-slot="extra"]');

    box.querySelector('[data-act="ask"]').addEventListener('click', () => {
      if (extra.querySelector('.ask-box')) return;
      const wrap = App.el('div', { class: 'ask-box', style: 'margin-top:12px' });
      wrap.innerHTML = `
        <div class="answer-row">
          <input type="text" placeholder="What part is unclear?" maxlength="500">
          <button class="btn btn-primary" type="button">Ask</button>
        </div>
        <div class="small" data-slot="reply" style="margin-top:8px"></div>`;
      extra.appendChild(wrap);
      const input = wrap.querySelector('input');
      const send = wrap.querySelector('button');
      const replySlot = wrap.querySelector('[data-slot="reply"]');
      const ask = async () => {
        const question = input.value.trim();
        if (question.length < 3) return;
        send.disabled = true;
        replySlot.innerHTML = '<span class="loading"><span class="spinner"></span>Thinking</span>';
        try {
          const data = await App.api.post(`/api/items/${item.id}/ask`, { question });
          replySlot.innerHTML = `<div class="notice">${App.escapeHtml(data.reply)}</div>`;
        } catch (err) {
          replySlot.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
        }
        send.disabled = false;
        input.value = '';
        input.focus();
      };
      send.addEventListener('click', ask);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
      input.focus();
    });

    box.querySelector('[data-act="report"]').addEventListener('click', async (event) => {
      const reason = window.prompt('What is wrong with this question?');
      if (reason === null) return;
      try {
        await App.api.post(`/api/items/${item.id}/report`, { reason });
        event.target.closest('button').disabled = true;
        App.toast('Reported. It will not be served again while we check it.');
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });

    const next = box.querySelector('[data-act="next"]');
    if (next && opts && opts.onNext) next.addEventListener('click', () => opts.onNext());
    return box;
  }

  window.Player = { render, reveal };
})();
