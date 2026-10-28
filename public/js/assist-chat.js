/* Chat assist: an "Ask for help" control that opens a short conversation.
 *
 * One component for every place a learner can ask for help outside a test —
 * a block in a lesson or retention level, a graded check, the question on
 * screen in a game. The caller says how to send: `send(messages)` returns the
 * reply text. The conversation lives here; the server keeps its own copy for
 * the learner's record.
 */
(function () {
  function attach(host, { label = 'Ask for help', placeholder = 'What are you stuck on?', send, opener = '' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'assist-chat';
    wrap.style.margin = '6px 0 0';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-ghost btn-sm';
    toggle.innerHTML = `${window.icon ? window.icon('help-circle') : ''}${label}`;
    const panel = document.createElement('div');
    panel.className = 'card card-tight';
    panel.style.cssText = 'display:none;margin-top:6px';
    panel.innerHTML = `
      <div class="assist-log small" style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto" aria-live="polite"></div>
      <form class="row" style="gap:6px;margin-top:8px">
        <input type="text" class="input" style="flex:1 1 auto;min-width:0" maxlength="600" placeholder="${placeholder.replace(/"/g, '&quot;')}" aria-label="Your question">
        <button class="btn btn-primary btn-sm" type="submit">Send</button>
      </form>`;
    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    host.appendChild(wrap);

    const log = panel.querySelector('.assist-log');
    const form = panel.querySelector('form');
    const input = form.querySelector('input');
    const messages = [];
    let busy = false;

    function line(role, text) {
      const p = document.createElement('div');
      p.style.cssText = role === 'user'
        ? 'align-self:flex-end;max-width:85%;padding:6px 10px;border-radius:10px;background:var(--accent-soft, #e0f2fe)'
        : 'align-self:flex-start;max-width:92%;white-space:pre-wrap';
      p.textContent = text;
      log.appendChild(p);
      log.scrollTop = log.scrollHeight;
      return p;
    }

    async function ask(text) {
      if (busy) return;
      busy = true;
      if (text) {
        messages.push({ role: 'user', content: text });
        line('user', text);
      }
      const pending = line('assistant', '…');
      try {
        const reply = await send(messages.slice());
        pending.textContent = reply || 'No reply just now — try again in a moment.';
        if (reply) messages.push({ role: 'assistant', content: reply });
      } catch (err) {
        pending.textContent = err.message || 'That did not go through. Try again.';
      } finally {
        busy = false;
      }
    }

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      toggle.setAttribute('aria-expanded', String(open));
      if (open && !messages.length) ask(opener);
      if (open) input.focus();
    });
    // Escape inside the open panel closes it and hands focus back to its button.
    panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      panel.style.display = 'none';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      ask(text);
    });
    return { element: wrap, messages };
  }

  window.AssistChat = { attach };
}());
