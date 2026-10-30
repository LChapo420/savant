/* "Ask your tutor": the persistent tutor outside a question.
 *
 *   TutorChat.mount(host, { where: 'home' | 'subject' })
 *
 * The same tutor answers inside a question (the help and coach buttons there); it knows
 * your goals, interests, what you find hard and what you have asked before. This adds a
 * button for it on the home and subject pages, and a plain view of what it knows with a
 * way to clear the memory of past chats.
 */
(function () {
  const esc = (t) => (window.App ? App.escapeHtml(t) : String(t));

  function mount(host, { where = 'home' } = {}) {
    if (!window.AssistChat || !host) return;
    const wrap = document.createElement('section');
    wrap.className = 'tutor-chat';
    wrap.style.cssText = 'margin:16px 0';
    wrap.innerHTML = '<div class="tutor-slot"></div><div class="tutor-know" style="margin-top:6px"></div>';
    host.appendChild(wrap);

    window.AssistChat.attach(wrap.querySelector('.tutor-slot'), {
      label: 'Ask your tutor',
      placeholder: 'Ask what to work on, or anything you are learning',
      send: async (messages) => {
        const out = await App.api.post('/api/tutor/chat', { messages, where });
        return out.reply;
      },
    });

    // On a page of its own this is a main action, not a small help link.
    const ask = wrap.querySelector('.assist-chat > button');
    if (ask) ask.className = 'btn btn-sm';

    const know = wrap.querySelector('.tutor-know');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-text btn-sm';
    toggle.textContent = 'What does my tutor know?';
    toggle.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('div');
    panel.className = 'card card-tight small';
    panel.style.display = 'none';
    know.appendChild(toggle);
    know.appendChild(panel);

    async function draw() {
      panel.innerHTML = '<span class="muted">Loading…</span>';
      try {
        const m = await App.api.get('/api/tutor/memory');
        panel.innerHTML = `
          <p class="muted" style="margin:0 0 6px">Early impressions from your goals, answers and chats. They keep changing as you learn.</p>
          ${m.know.length ? `<ul style="margin:0;padding-left:18px">${m.know.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p style="margin:0">Not much yet. It fills in as you work.</p>'}
          ${m.summary ? `<p style="margin:8px 0 0"><strong>From earlier chats:</strong> ${esc(m.summary)}</p>` : ''}
          ${m.archive && m.archive.exchanges ? `<p class="muted" style="margin:8px 0 0">I keep all ${m.archive.exchanges} of our earlier exchanges and can look back through them when you mention something from a while ago.</p>` : ''}
          ${m.turn_count || (m.archive && m.archive.exchanges) ? `<p style="margin:8px 0 0"><button type="button" class="btn btn-ghost btn-sm tutor-forget">Forget our past chats</button></p>` : ''}`;
        const forget = panel.querySelector('.tutor-forget');
        if (forget) forget.addEventListener('click', async () => {
          forget.disabled = true;
          try { await App.api.del('/api/tutor/memory'); App.toast('Past chats forgotten.', 'info'); } catch (err) { App.toast(err.message, 'error'); }
          draw();
        });
      } catch (err) {
        panel.textContent = err.message || 'That did not load.';
      }
    }

    toggle.addEventListener('click', () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      toggle.setAttribute('aria-expanded', String(open));
      if (open) draw();
    });
  }

  window.TutorChat = { mount };
}());
