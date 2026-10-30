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
  let promptSeq = 0;

  /** A short visually hidden note on a choice: "your answer", "correct answer". */
  function markChoice(node, text) {
    let note = node.querySelector('.choice-sr');
    if (!note) {
      note = App.el('span', { class: 'visually-hidden choice-sr' });
      node.appendChild(note);
    }
    note.textContent = text ? ` (${text})` : '';
  }

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
  // The question last drawn, for the tutor dock (js/tutor-dock.js) on pages that do not define window.tutorPageInfo
  // themselves. It is the learner's copy of the item, so it carries no answer key; only text fields are read.
  let lastShown = null;
  function shown() {
    const it = lastShown;
    if (!it) return {};
    const text = (c) => (typeof c === 'string' ? c : (c && (c.text || c.label)) || '');
    return {
      question: String(it.prompt || it.question || ''),
      passage: Array.isArray(it.passage_segments) ? it.passage_segments.map((g) => g.text).join('') : String(it.passage || ''),
      choices: Array.isArray(it.choices) ? it.choices.map(text) : [],
    };
  }

  function render(host, item, opts) {
    const { onSubmit } = opts;
    lastShown = item;
    // Where focus was before the redraw: on the answer just given (now gone),
    // or nowhere. Either way it is put back on the new question below, so a
    // keyboard is not thrown back to the top of the page after every answer.
    const hadFocus = !document.activeElement || document.activeElement === document.body
      || host.contains(document.activeElement);
    host.innerHTML = '';
    let confidence = null;
    const promptId = `q-prompt-${++promptSeq}`;

    // A small line above the question when the page asks for one ("Recall 1 of
    // 3"). The item's skill, difficulty and level are for checking content, not
    // for the learner, and show only with ?debug=1.
    if (opts.label) {
      const debug = !!App.query('debug');
      host.appendChild(App.el('p', { class: 'item-label' },
        `${App.escapeHtml(opts.label)}${debug ? ` <span class="chip">${App.escapeHtml(item.skill_name || '')}</span>
         <span class="chip">difficulty ${item.difficulty}</span>
         ${item.level ? `<span class="chip">level ${item.level}</span>` : ''}` : ''}`));
    }

    // An ACT-format passage (services/act-english-passage.js): numbered underlined portions, the one in focus marked.
    if (Array.isArray(item.passage_segments)) {
      const box = App.el('div', { class: 'passage act-passage' }, '');
      item.passage_segments.forEach((seg) => {
        if (!seg.n) { box.appendChild(document.createTextNode(seg.text)); return; }
        const u = document.createElement('u');
        u.textContent = seg.text;
        if (seg.n === item.focus) u.style.cssText = 'background:var(--accent-soft, rgba(255,200,0,.25));font-weight:700';
        const num = document.createElement('sup');
        num.textContent = String(seg.n);
        num.style.cssText = 'margin-left:2px;font-weight:700';
        box.appendChild(u);
        box.appendChild(num);
      });
      host.appendChild(box);
    } else if (item.passage) {
      host.appendChild(App.el('div', { class: 'passage' }, App.escapeHtml(item.passage)));
    }

    // ACT-format Science figures (services/act-science-passage.js): every figure is drawn as a table of its values
    // (readable on a phone and by a screen reader); a chart's series become columns.
    if (Array.isArray(item.figures)) {
      item.figures.forEach((fig) => {
        const wrap = document.createElement('figure');
        wrap.className = 'act-figure';
        wrap.style.cssText = 'margin:12px 0;overflow-x:auto' + (fig.id === item.focus_figure ? ';outline:2px solid var(--accent, #888);padding:4px' : '');
        const cap = document.createElement('figcaption');
        cap.textContent = fig.title + (fig.type === 'table' ? '' : ` (${fig.type} chart: ${fig.y_label} by ${fig.x_label})`);
        cap.style.fontWeight = '700';
        const table = document.createElement('table');
        table.style.cssText = 'border-collapse:collapse;width:100%';
        let head; let rows;
        if (fig.type === 'table') { head = fig.columns; rows = fig.rows; } else {
          const xs = [];
          fig.series.forEach((s) => s.points.forEach((p) => { if (!xs.includes(String(p.x))) xs.push(String(p.x)); }));
          head = [fig.x_label].concat(fig.series.map((s) => s.name));
          rows = xs.map((x) => [x].concat(fig.series.map((s) => { const p = s.points.find((q) => String(q.x) === x); return p ? p.y : '\u2013'; })));
        }
        const tr = (cells, tag) => { const r = document.createElement('tr'); cells.forEach((c) => { const d = document.createElement(tag); d.textContent = String(c); d.style.cssText = 'border:1px solid var(--border, #ccc);padding:4px 8px;text-align:left'; r.appendChild(d); }); table.appendChild(r); };
        tr(head, 'th'); rows.forEach((r) => tr(r, 'td'));
        wrap.appendChild(cap); wrap.appendChild(table);
        if (fig.caption) { const n = document.createElement('p'); n.textContent = fig.caption; wrap.appendChild(n); }
        host.appendChild(wrap);
      });
    }

    const promptNode = App.el('div', { class: 'prompt', id: promptId, tabindex: '-1' }, App.escapeHtml(item.prompt));
    host.appendChild(promptNode);

    // A question set on a chess position shows the board. On a typed question a
    // move made there fills the answer box, so the learner can answer either way.
    let boardSlot = null;
    if (item.fen) {
      boardSlot = App.el('div', { class: 'chess-slot', style: 'margin:12px 0' });
      host.appendChild(boardSlot);
    }

    if (opts.askConfidence) {
      const row = App.el('div', { class: 'confidence-row', role: 'group', 'aria-labelledby': `${promptId}-sure` },
        `<span class="tiny muted" id="${promptId}-sure">How sure are you? (optional)</span>
         <button type="button" class="chip-btn" data-confidence="sure" aria-pressed="false">Sure</button>
         <button type="button" class="chip-btn" data-confidence="think" aria-pressed="false">Think so</button>
         <button type="button" class="chip-btn" data-confidence="guess" aria-pressed="false">Guessing</button>`);
      row.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-confidence]');
        if (!btn) return;
        confidence = confidence === btn.dataset.confidence ? null : btn.dataset.confidence;
        [...row.querySelectorAll('[data-confidence]')].forEach((b) => {
          b.classList.toggle('selected', b.dataset.confidence === confidence);
          b.setAttribute('aria-pressed', String(b.dataset.confidence === confidence));
        });
      });
      host.appendChild(row);
    }

    let handles;
    if (item.format === 'multiple_choice' && item.choices) {
      // A group named by the question, so a screen reader hears what the
      // options answer; each option is a button that submits at once.
      const choices = App.el('div', { class: 'choices', role: 'group', 'aria-labelledby': promptId });
      item.choices.forEach((choice, i) => {
        const btn = App.el('button', { class: 'choice', type: 'button', 'data-choice': choice },
          `<span class="key">${KEYS[i] || i + 1}</span><span>${App.escapeHtml(choice)}</span>`);
        // An answer already given is shown but not locked: this question is being
        // looked at again, and clicking any option is how it gets changed.
        if (opts.savedAnswer != null && String(opts.savedAnswer) === choice) {
          btn.classList.add('selected');
          markChoice(btn, 'your answer so far');
        }
        btn.addEventListener('click', () => {
          [...choices.children].forEach((c) => { c.disabled = true; markChoice(c, ''); });
          btn.classList.add('selected');
          markChoice(btn, 'your answer');
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
        'aria-label': 'Your answer',
        'aria-describedby': promptId,
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

    // A multiple-choice question has nothing to type into, so focus goes to
    // the question itself: a screen reader reads it, and Tab reaches option A.
    if (handles.choices && hadFocus) {
      setTimeout(() => { if (promptNode.isConnected) promptNode.focus({ preventScroll: true }); }, 30);
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
  /** Coach text as plain words: markdown emphasis the model sometimes adds (**es**, *ser*) is dropped. */
  function coachPlain(t) {
    return String(t || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1$2');
  }

  function mountCoach(host, item) {
    const bar = App.el('div', { class: 'coach-bar' });
    const trigger = App.el('button', { class: 'btn btn-sm', type: 'button', 'data-act': 'coach' },
      'Help me work it out');
    const note = App.el('span', { class: 'tiny muted' }, 'The coach asks questions, it will not give you the answer.');
    bar.appendChild(trigger);
    bar.appendChild(note);
    host.appendChild(bar);

    trigger.addEventListener('click', () => {
      if (host.querySelector('.coach-panel')) return;
      trigger.disabled = true;
      const panel = App.el('div', { class: 'coach-panel' });
      panel.innerHTML = `
        <div class="coach-head"><span>Working it out together</span></div>
        <div class="coach-log" data-slot="log"></div>
        <div class="answer-row">
          <input type="text" placeholder="Say what you are thinking" maxlength="500" aria-label="Say what you are thinking">
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
          node.textContent = coachPlain(text);
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
            node.textContent = coachPlain(text);
          } catch (err) {
            node.textContent = err.message;
          }
        }

        if (text) history.push({ role: 'assistant', content: text });
        // Read the finished reply once, rather than every streamed piece of it.
        if (text) App.announce(`Coach: ${text}`);
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
    // A typed answer the grader is still checking (it accepts an answer only when its
    // judges agree): a neutral holding state, never "right" or "wrong", and the verdict
    // replaces it when the check finishes. The learner can move on meanwhile.
    if (result && result.checking) {
      const hold = App.el('div', { class: 'verdict verdict-checking', role: 'status' });
      hold.innerHTML = `
        <h4 tabindex="-1"><span class="verdict-word">Checking your answer…</span></h4>
        <div class="small">Your answer isn't one of the expected ones, so it's being checked carefully. You can keep going; the result will show here.</div>
        <div class="verdict-actions"><span class="spacer"></span>
          ${opts && opts.nextLabel ? `<button class="btn btn-primary btn-sm" type="button" data-act="next">${App.escapeHtml(opts.nextLabel)}</button>` : ''}
        </div>`;
      host.appendChild(hold);
      App.announce('Checking your answer.');
      const next = hold.querySelector('[data-act="next"]');
      if (next) {
        next.addEventListener('click', () => { if (opts && opts.onNext) opts.onNext(); });
        setTimeout(() => { if (next.isConnected) next.focus({ preventScroll: true }); }, 30);
      }
      const started = Date.now();
      const poll = async () => {
        if (!hold.isConnected) return; // the learner moved on: the recap shows it
        let status = null;
        try { status = await App.api.get(`/api/items/${item.id}/grading`); } catch { status = null; }
        if (status && !status.checking) {
          if (!hold.isConnected) return;
          hold.remove();
          if (status.reveal === false) return;
          reveal(host, item, status, opts);
          return;
        }
        if (Date.now() - started < 4 * 60 * 1000) setTimeout(poll, 3000);
      };
      setTimeout(poll, 3000);
      return;
    }
    const correct = !!result.correct;
    const box = App.el('div', { class: `verdict ${correct ? 'verdict-correct' : 'verdict-wrong'}` });
    // Colour on the first words only; the answer is said in the same line.
    const answerText = result.answer == null ? '' : String(result.answer);
    box.innerHTML = `
      <h4 tabindex="-1"><span class="verdict-word">${correct ? 'Right.' : 'Not quite.'}</span>${correct || !answerText ? '' : ` The answer is <strong>${App.escapeHtml(answerText)}</strong>.`}</h4>
      ${result.feedback ? `<div class="small" style="margin-bottom:6px">${App.escapeHtml(result.feedback)}</div>` : ''}
      <div class="rationale">${App.escapeHtml(result.rationale || '')}</div>
      <div class="verdict-actions">
        <button class="btn btn-sm" type="button" data-act="ask">Ask about this</button>
        <button class="btn btn-sm" type="button" data-act="report">Report a problem</button>
        <span class="spacer"></span>
        ${opts && opts.nextLabel ? `<button class="btn btn-primary btn-sm" type="button" data-act="next">${App.escapeHtml(opts.nextLabel)}</button>` : ''}
      </div>
      <div data-slot="extra"></div>`;

    if (item.choices) {
      // Mark the choices so the learner sees which one was right without rereading.
      const container = host.querySelector('.choices');
      if (container) {
        [...container.children].forEach((node) => {
          const value = node.dataset.choice;
          const mine = node.classList.contains('selected');
          // The mark is drawn in the margin where the letter was: a tick on
          // the right answer, a cross on a wrong one you chose.
          const key = node.querySelector('.key');
          if (value === result.answer) {
            node.classList.add('correct', 'is-drawn');
            markChoice(node, mine ? 'your answer, correct' : 'correct answer');
            if (key) key.insertAdjacentHTML('beforeend', window.mark('tick'));
          } else if (mine) {
            node.classList.add('wrong', 'is-drawn');
            markChoice(node, 'your answer, incorrect');
            if (key) key.insertAdjacentHTML('beforeend', window.mark('cross'));
          }
        });
      }
    }

    // A typed answer gets its mark at the end of the box.
    const typed = [...host.children].find((c) => c.classList && c.classList.contains('answer-row'));
    if (typed && !item.choices) {
      typed.appendChild(App.el('span', { class: 'answer-mark is-drawn', 'aria-hidden': 'true' }, window.mark(correct ? 'tick' : 'cross')));
    }

    host.appendChild(box);
    // On a phone the verdict lands below the fold; bring it, and the Next
    // button in it, into view. Instant when the learner asked for less motion.
    if (box.scrollIntoView) {
      const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      box.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
    }
    // Say the verdict, then put focus where the learner goes next: the Next
    // button when there is one, otherwise the verdict itself (the answer they
    // pressed is disabled now and cannot hold focus).
    App.announce(correct ? 'Correct.' : `Not quite. The answer is ${result.answer == null ? '' : result.answer}.`);
    const focusTarget = box.querySelector('[data-act="next"]') || box.querySelector('h4');
    if (focusTarget) setTimeout(() => { if (focusTarget.isConnected) focusTarget.focus({ preventScroll: true }); }, 30);
    const extra = box.querySelector('[data-slot="extra"]');

    box.querySelector('[data-act="ask"]').addEventListener('click', () => {
      if (extra.querySelector('.ask-box')) return;
      const wrap = App.el('div', { class: 'ask-box', style: 'margin-top:12px' });
      wrap.innerHTML = `
        <div class="answer-row">
          <input type="text" placeholder="What part is unclear?" maxlength="500" aria-label="What part is unclear?">
          <button class="btn btn-primary" type="button">Ask</button>
        </div>
        <div class="small" data-slot="reply" style="margin-top:8px" aria-live="polite"></div>`;
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
      const button = event.target.closest('button');
      // An accessible dialog in place of window.prompt (App.askText; UX_REPORT_DIALOG).
      const reason = await App.askText({
        title: 'Report a problem with this question',
        label: 'What is wrong with this question?',
        submit: 'Send report',
        maxLength: 500,
        opener: button,
      });
      if (reason === null) return;
      try {
        await App.api.post(`/api/items/${item.id}/report`, { reason });
        button.disabled = true;
        App.toast('Reported. It will not be served again while we check it.');
        const nextButton = box.querySelector('[data-act="next"]');
        if (nextButton) nextButton.focus(); // the Report button is now disabled; keep focus in the verdict
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });

    const next = box.querySelector('[data-act="next"]');
    if (next && opts && opts.onNext) next.addEventListener('click', () => opts.onNext());
    return box;
  }

  window.Player = { render, reveal, shown };
})();
