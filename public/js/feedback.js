/* "Give Input" — what the learner thought of the level they just finished.
 *
 * One renderer, used by both lesson surfaces: the adaptive session at /session and
 * a generated base lesson at /base-lesson. Both end a level with a control that
 * moves on, and this sits beside it on each.
 *
 * It is deliberately small and deliberately optional. Nothing about finishing a
 * level waits on it, no answer is required, and closing the page without using it
 * costs the learner nothing — a feedback box that gates progress is a box that
 * gets filled with whatever gets past it fastest.
 *
 * The markup follows the "ask about this item" box in player.js: a card revealed in
 * place, a textarea, a button, and a slot for the acknowledgement. It reuses the
 * stylesheet's component classes rather than adding any.
 */
(function () {
  /**
   * Render the form into `host`, if it is not already there.
   *
   * @param {HTMLElement} host where the button was, now emptied
   * @param {{track: string, grade: string, level: number, kind?: string}} where
   *   the level being commented on. All three ids are required by the route.
   */
  function mount(host, where) {
    if (!host || !where || !where.track || !where.grade || !Number.isInteger(Number(where.level))) return;

    // Only ever one form on screen: a second press of the button re-renders rather
    // than stacking another copy, which is what a learner pressing it twice would
    // otherwise get.
    const existing = host.querySelector('.feedback-form');
    if (existing) existing.remove();

    const card = App.el('div', { class: 'card card-tight feedback-form', style: 'margin-top:12px' });
    card.innerHTML = `
      <div class="card-title">${window.icon('edit')}How was this level?</div>
      <p class="small muted" style="margin:0 0 10px">
        What worked and what did not. Your own version of later levels is written
        from this, so specifics help.
      </p>
      <div data-slot="taps">
        ${[
    ['pace', 'Pace', [['slow', 'Too slow'], ['right', 'Just right'], ['fast', 'Too fast']]],
    ['length', 'Length', [['short', 'Too short'], ['right', 'Just right'], ['long', 'Too long']]],
    ['difficulty', 'Difficulty', [['easy', 'Too easy'], ['right', 'Just right'], ['hard', 'Too hard']]],
  ].map(([key, label, options]) => `
          <div class="feedback-row" data-key="${key}">
            <span class="label">${label}</span>
            ${options.map(([value, text]) => `<button type="button" class="chip-btn" data-value="${value}">${text}</button>`).join('')}
          </div>`).join('')}
      </div>
      <label class="field" style="margin-top:10px">
        <span>What you liked</span>
        <textarea data-slot="liked" rows="2" maxlength="1000"
          placeholder="The part that worked for you"></textarea>
      </label>
      <label class="field">
        <span>What you did not like</span>
        <textarea data-slot="disliked" rows="2" maxlength="1000"
          placeholder="Too easy, too fast, a confusing example — anything"></textarea>
      </label>
      <label class="field">
        <span>Anything else?</span>
        <textarea data-slot="comments" rows="2" maxlength="1000"
          placeholder="How it felt, what you would change, what you want more of"></textarea>
      </label>
      <div class="answer-row">
        <button class="btn btn-primary" type="button" data-act="send">Send</button>
        <button class="btn btn-ghost" type="button" data-act="cancel">Cancel</button>
      </div>
      <div data-slot="reply" style="margin-top:8px"></div>`;

    const liked = card.querySelector('[data-slot="liked"]');
    const disliked = card.querySelector('[data-slot="disliked"]');
    const comments = card.querySelector('[data-slot="comments"]');
    const send = card.querySelector('[data-act="send"]');
    const reply = card.querySelector('[data-slot="reply"]');

    card.querySelector('[data-act="cancel"]').addEventListener('click', () => card.remove());

    // Quick taps: one press each, and a second press on the same one clears it.
    const taps = {};
    card.querySelector('[data-slot="taps"]').addEventListener('click', (event) => {
      const chip = event.target.closest('.chip-btn');
      if (!chip) return;
      const row = chip.closest('.feedback-row');
      taps[row.dataset.key] = taps[row.dataset.key] === chip.dataset.value ? undefined : chip.dataset.value;
      [...row.querySelectorAll('.chip-btn')].forEach((b) => b.classList.toggle('selected', b.dataset.value === taps[row.dataset.key]));
    });

    send.addEventListener('click', async () => {
      const body = {
        liked: liked.value.trim(), disliked: disliked.value.trim(), comments: comments.value.trim(), ...taps,
      };
      if (!body.liked && !body.disliked && !body.comments && !taps.pace && !taps.length && !taps.difficulty) {
        reply.innerHTML = '<div class="notice notice-warn">Tap one of the options, or say '
          + 'something you liked or did not.</div>';
        liked.focus();
        return;
      }

      send.disabled = true;
      reply.innerHTML = '<div class="small muted">Sending…</div>';
      try {
        await App.api.post(
          `/api/levels/${encodeURIComponent(where.track)}/${encodeURIComponent(where.grade)}`
          + `/${Number(where.level)}/feedback`,
          body,
        );
        reply.innerHTML = '<div class="notice notice-success">Thank you — your next levels '
          + 'are written with that in mind.</div>';
        send.remove();
        card.querySelector('[data-act="cancel"]').textContent = 'Close';
      } catch (err) {
        send.disabled = false;
        reply.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
      }
    });

    host.appendChild(card);
  }

  /**
   * A button that opens the form beside itself.
   *
   * @param {HTMLElement} host the row the button belongs in
   * @param {object} where as `mount`
   * @param {{label?: string, ghost?: boolean}} [opts]
   * @returns {HTMLElement} the button, so the caller can place it
   */
  function button(host, where, opts = {}) {
    const btn = App.el('button', {
      class: `btn${opts.ghost ? ' btn-ghost' : ''}`,
      type: 'button',
    }, `${window.icon('edit')}${opts.label || 'Give feedback'}`);

    // The form goes directly under the row the button lives in, not inside it —
    // a card sharing a flex row with buttons would be laid out as a third button.
    const slot = App.el('div', { class: 'feedback-slot' });
    const anchor = host.parentElement || host;
    anchor.appendChild(slot);

    btn.addEventListener('click', () => {
      mount(slot, where);
      btn.classList.add('hidden');
      // Closing the form brings the button back, so the learner can say something
      // else or change their mind without reloading the level.
      const observer = new MutationObserver(() => {
        if (!slot.querySelector('.feedback-form')) {
          btn.classList.remove('hidden');
          observer.disconnect();
        }
      });
      observer.observe(slot, { childList: true });
    });

    return btn;
  }

  window.Feedback = { mount, button };
})();
