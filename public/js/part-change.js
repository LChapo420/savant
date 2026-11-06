/* The row of small buttons under a part: Shorter, Simpler, More examples, Another topic, and Put back once it has changed (services/part-change.js).
 *
 *   PartChange.attach(slot, { ref: { item_id } | { material_id, skill_id } | { track, grade, level, ref }, onResult(reply) })
 *
 * It draws nothing while the server's switch is off (GET /api/parts/prefs answers on: false). Uses the page's own buttons and notices; no new look.
 */
(function () {
  let state = null;
  const load = () => { state = state || App.api.get('/api/parts/prefs').catch(() => ({ on: false })); return state; };
  const CHOICES = [['shorter', 'Shorter'], ['simpler', 'Simpler'], ['examples', 'More examples'], ['topic', 'Another topic']];

  async function attach(slot, { ref, onResult, changed = false }) {
    const s = await load();
    if (!s.on || !slot.isConnected) return;
    const row = App.el('div', { class: 'row-wrap', style: 'margin-top:10px; gap:6px; align-items:center', 'data-part-change': '1' });
    row.innerHTML = `
      <span class="tiny muted">Change this:</span>
      ${CHOICES.map(([k, label]) => `<button class="btn btn-sm" type="button" data-change="${k}">${label}</button>`).join('')}
      <button class="btn btn-sm" type="button" data-revert hidden>Put back</button>
      <span class="tiny muted" data-note aria-live="polite" style="flex-basis:100%"></span>`;
    slot.appendChild(row);
    const note = row.querySelector('[data-note]');
    const revert = row.querySelector('[data-revert]');
    revert.hidden = !changed;
    const busy = (b) => row.querySelectorAll('button').forEach((x) => { x.disabled = b; });
    const send = async (url, body, done) => {
      busy(true);
      note.textContent = 'Rewriting. This takes a few seconds.';
      try {
        const r = await App.api.post(url, { ...ref, ...body });
        onResult(r);
        note.textContent = r.message || done(r);
        revert.hidden = !r.changed && !revert.dataset.kept;
        if (r.changed) revert.dataset.kept = '1';
      } catch (err) { note.textContent = err.message || 'That did not work. The text is unchanged.'; }
      busy(false);
    };
    row.querySelectorAll('[data-change]').forEach((btn) => btn.addEventListener('click', async () => {
      const change = btn.dataset.change;
      let topic = null;
      if (change === 'topic') {
        topic = await App.askText({ title: 'Which topic?', label: 'Examples from what would help? For example: football, cooking, trains.', required: true, maxLength: 40, opener: btn });
        if (!topic) return;
      }
      send('/api/parts/change', { change, topic }, () => 'Done. Later lessons will follow this too; you can undo that on your profile.');
    }));
    revert.addEventListener('click', () => { delete revert.dataset.kept; send('/api/parts/revert', {}, () => 'Back to the original.'); });
  }
  window.PartChange = { attach };
}());
