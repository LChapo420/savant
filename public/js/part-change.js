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
    if (s.material && ref && ref.material_id !== undefined) return; // an upload's parts have their own row (wire, below)
    const row = App.el('div', { class: 'row-wrap', style: 'margin-top:10px; gap:6px; align-items:center', 'data-part-change': '1' });
    row.innerHTML = `
      <span class="tiny muted">Change this:</span>
      ${CHOICES.map(([k, label]) => `<button class="btn btn-sm" type="button" data-change="${k}">${label}</button>`).join('')}
      <button class="btn btn-sm" type="button" data-revert style="display:none">Put back</button>
      <span class="tiny muted" data-note aria-live="polite" style="flex-basis:100%"></span>`;
    slot.appendChild(row);
    const note = row.querySelector('[data-note]');
    const revert = row.querySelector('[data-revert]');
    // The page's buttons set their own display, so the hidden attribute does not hide them.
    const showRevert = (on) => { revert.style.display = on ? '' : 'none'; };
    showRevert(changed);
    const busy = (b) => row.querySelectorAll('button').forEach((x) => { x.disabled = b; });
    const send = async (url, body, done) => {
      busy(true);
      note.textContent = 'Rewriting. This takes a few seconds.';
      try {
        const r = await App.api.post(url, { ...ref, ...body });
        onResult(r);
        note.textContent = r.message || done(r);
        showRevert(r.changed || !!revert.dataset.kept);
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
  // Every part built from an upload (services/material-parts.js): a page writes <div data-part="lesson:s1" data-changed="0"></div> where the row belongs and calls wire(root, materialId, onResult).
  const TEXT_CHOICES = [...CHOICES, ['fuller', 'More detail'], ['custom', 'Say how']];
  const TEST_CHOICES = [['shorter', 'Shorter'], ['longer', 'Longer'], ['easier', 'Easier'], ['harder', 'Harder']];
  async function wire(root, materialId, onResult) {
    const s = await load();
    if (!s.on || !s.material || !root) return;
    root.querySelectorAll('[data-part]:not([data-wired])').forEach((slot) => {
      slot.dataset.wired = '1';
      const part = slot.dataset.part;
      const choices = part === 'test' ? TEST_CHOICES : TEXT_CHOICES;
      const row = App.el('div', { class: 'row-wrap', style: 'margin-top:8px; gap:6px; align-items:center', 'data-part-change': '1' });
      row.innerHTML = `<span class="tiny muted">Change this:</span>${choices.map(([k, label]) => `<button class="btn btn-sm" type="button" data-change="${k}">${label}</button>`).join('')}
        <button class="btn btn-sm" type="button" data-revert style="display:none">Put back</button><span class="tiny muted" data-note aria-live="polite" style="flex-basis:100%"></span>`;
      slot.appendChild(row);
      const note = row.querySelector('[data-note]');
      const revert = row.querySelector('[data-revert]');
      const showRevert = (on) => { revert.style.display = on ? '' : 'none'; };
      showRevert(slot.dataset.changed === '1');
      // On a phone a row under every card or question would be most of the page: small parts start closed behind one small button.
      if (!/^(lesson:|test$)/.test(part) && slot.dataset.changed !== '1') {
        row.style.display = 'none';
        const open = App.el('button', { class: 'btn btn-sm', type: 'button', 'data-part-toggle': '1', style: 'margin-top:8px' });
        open.textContent = 'Change this';
        open.addEventListener('click', () => { row.style.display = ''; open.remove(); });
        slot.insertBefore(open, row);
      }
      const busy = (b) => row.querySelectorAll('button').forEach((x) => { x.disabled = b; });
      const send = async (url, body, done) => {
        busy(true);
        note.textContent = 'Working on it. This can take a few seconds.';
        try {
          const r = await App.api.post(url, { material_id: materialId, part, ...body });
          note.textContent = r.message || done(r);
          showRevert(!!(r.part && r.part.changed));
          busy(false);
          onResult(r, part, slot, note);
        } catch (err) { note.textContent = err.message || 'That did not work. The text is unchanged.'; busy(false); }
      };
      row.querySelectorAll('[data-change]').forEach((btn) => btn.addEventListener('click', async () => {
        const change = btn.dataset.change;
        const extra = {};
        if (change === 'topic') { extra.topic = await App.askText({ title: 'Which topic?', label: 'Examples from what would help? For example: football, cooking, trains.', required: true, maxLength: 40, opener: btn }); if (!extra.topic) return; }
        if (change === 'custom') { extra.custom = await App.askText({ title: 'How should it change?', label: 'Say it your way. For example: explain it as steps. The facts stay the ones in your material.', required: true, maxLength: 160, opener: btn }); if (!extra.custom) return; }
        send('/api/parts/change', { change, ...extra }, () => (part === 'test' ? 'Done. Your next test follows this.' : 'Done. It stays checked against your material, and you can put it back.'));
      }));
      revert.addEventListener('click', () => send('/api/parts/revert', {}, () => 'Back to the original.'));
    });
  }
  window.PartChange = { attach, wire };
}());
