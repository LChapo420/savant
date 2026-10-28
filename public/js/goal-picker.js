/* The goal picker: what do you want out of this subject or grade?
 *
 *   GoalPicker.ask(host, { trackId, gradeId, title })   a full step before a placement;
 *                                                        resolves when saved or skipped
 *   GoalPicker.card(host, { trackId, gradeId })          a small "Your goal" card with Change,
 *                                                        for the path and subject pages
 *   GoalPicker.list(host)                                every goal, editable, for the profile
 *
 * Always optional. The goal sets a starting point for how long the placement is and how
 * lessons and practice are shaped; results as you go keep adjusting it.
 */
(function () {
  const esc = (t) => (window.App ? App.escapeHtml(t) : String(t));
  const api = () => App.api;

  function qs(trackId, gradeId) {
    return `track_id=${encodeURIComponent(trackId)}${gradeId ? `&grade_id=${encodeURIComponent(gradeId)}` : ''}`;
  }

  async function load(trackId, gradeId) {
    return api().get(`/api/goals?${qs(trackId, gradeId)}`);
  }

  function save(trackId, gradeId, body) {
    return api().request('PUT', '/api/goals', { track_id: trackId, grade_id: gradeId || null, ...body });
  }

  /** The choices and the free-text box, drawn into `node`. onSave(choice, text), onSkip? */
  function form(node, state, { onSave, onSkip, saveLabel = 'Save goal', skipLabel = 'Skip for now' }) {
    const current = state.goal && !state.goal.inherited ? state.goal : (state.goal || {});
    const uid = `goal-${Math.random().toString(36).slice(2, 8)}`;
    node.innerHTML = `
      <fieldset style="border:0;padding:0;margin:0;display:grid;gap:8px">
        <legend class="visually-hidden">Your goal</legend>
        ${state.choices.map((c) => `
          <label class="card card-tight" style="display:flex;gap:10px;align-items:center;cursor:pointer">
            <input type="radio" name="${uid}" value="${esc(c.id)}"${current.choice === c.id ? ' checked' : ''}>
            <span>${esc(c.label)}</span>
          </label>`).join('')}
      </fieldset>
      <div class="goal-text" style="margin-top:10px;display:none">
        <label class="small" for="${uid}-t">In your own words (a few words is enough)</label>
        <input id="${uid}-t" type="text" class="input" style="width:100%;margin-top:4px" maxlength="${state.text_max}"
          placeholder="For example: finish fractions before my exam on 12 Nov" value="${esc(current.text || '')}">
      </div>
      <p class="small muted goal-error" role="alert" style="color:var(--danger,#b91c1c);min-height:1.2em;margin:8px 0 0"></p>
      <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-primary goal-save">${esc(saveLabel)}</button>
        ${onSkip ? `<button type="button" class="btn btn-ghost goal-skip">${esc(skipLabel)}</button>` : ''}
      </div>`;
    const textBox = node.querySelector('.goal-text');
    const input = node.querySelector(`#${uid}-t`);
    const error = node.querySelector('.goal-error');
    const radios = [...node.querySelectorAll('input[type=radio]')];
    const picked = () => (radios.find((r) => r.checked) || {}).value || null;
    const sync = () => {
      // The free-text box is part of every choice (it refines it); "something specific" needs it.
      textBox.style.display = picked() ? 'block' : 'none';
      input.required = picked() === 'specific';
    };
    radios.forEach((r) => r.addEventListener('change', sync));
    sync();
    const run = async (fn, button) => {
      error.textContent = '';
      button.disabled = true;
      try { await fn(); } catch (err) { error.textContent = err.message || 'That did not save. Try again.'; } finally { button.disabled = false; }
    };
    const saveButton = node.querySelector('.goal-save');
    saveButton.addEventListener('click', () => {
      const choice = picked();
      if (!choice) { error.textContent = 'Pick one, or skip for now.'; return; }
      run(() => onSave(choice, input.value.trim()), saveButton);
    });
    const skipButton = node.querySelector('.goal-skip');
    if (skipButton) skipButton.addEventListener('click', () => run(onSkip, skipButton));
  }

  /** The step before a placement. Resolves with the saved goal, or null if skipped or already answered. */
  async function ask(host, { trackId, gradeId = null, title = '' }) {
    let state;
    try { state = await load(trackId, gradeId); } catch { return null; }
    if (state.asked) return state.goal || null;
    return new Promise((resolve) => {
      host.innerHTML = `
        <div class="card" style="text-align:center">
          ${title ? `<span class="chip chip-accent">${esc(title)}</span>` : ''}
          <h1 style="margin:12px 0 4px">What do you want out of this?</h1>
          <p class="muted">Optional. It sets how long the check is and how your lessons and practice are shaped. As you work, how you actually do keeps adjusting it, and you can change it any time.</p>
        </div>
        <div class="card" style="margin-top:12px" id="goal-form"></div>`;
      form(host.querySelector('#goal-form'), state, {
        saveLabel: 'Continue',
        onSave: async (choice, text) => { const out = await save(trackId, gradeId, { choice, text }); resolve(out.goal); },
        onSkip: async () => { await save(trackId, gradeId, { choice: null, skipped: true }); resolve(null); },
      });
    });
  }

  /** "Your goal: X. Change" on a subject or grade page. */
  async function card(host, { trackId, gradeId = null }) {
    let state;
    try { state = await load(trackId, gradeId); } catch { return; }
    const wrap = document.createElement('div');
    wrap.className = 'card card-tight';
    wrap.id = 'goal-card';
    host.appendChild(wrap);
    const draw = () => {
      const g = state.goal;
      wrap.innerHTML = `
        <div class="row-between" style="gap:10px;flex-wrap:wrap">
          <div><span class="small muted">Your goal</span><br>
            <strong>${g ? esc(g.label) : 'Not set'}</strong>${g && g.text ? `<span class="small muted"> — ${esc(g.text)}</span>` : ''}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="goal-change">${g ? 'Change' : 'Set a goal'}</button>
        </div>
        <div id="goal-edit" style="display:none;margin-top:10px"></div>`;
      wrap.querySelector('#goal-change').addEventListener('click', () => {
        const edit = wrap.querySelector('#goal-edit');
        edit.style.display = 'block';
        form(edit, state, {
          onSave: async (choice, text) => { const out = await save(trackId, gradeId, { choice, text }); state.goal = out.goal; draw(); },
          onSkip: state.goal ? async () => { await save(trackId, gradeId, { choice: null }); state.goal = null; draw(); } : null,
          skipLabel: 'Clear goal',
          saveLabel: 'Save',
        });
      });
    };
    draw();
  }

  /** Every goal the learner has set, each editable, for the profile page. */
  async function list(host) {
    let data;
    try { data = await api().get('/api/goals/all'); } catch { return; }
    const wrap = document.createElement('div');
    wrap.id = 'goal-list';
    host.appendChild(wrap);
    const draw = () => {
      wrap.innerHTML = data.goals.length ? data.goals.map((g, i) => `
        <div class="card card-tight" style="margin-top:8px" data-i="${i}">
          <div class="row-between" style="gap:10px;flex-wrap:wrap">
            <div><strong>${esc(g.track_name)}${g.grade_name ? ` · ${esc(g.grade_name)}` : ''}</strong><br>
              <span class="small">${esc(g.label)}</span>${g.text ? `<span class="small muted"> — ${esc(g.text)}</span>` : ''}</div>
            <button type="button" class="btn btn-ghost btn-sm goal-edit-btn">Change</button>
          </div>
          <div class="goal-edit" style="display:none;margin-top:10px"></div>
        </div>`).join('')
        : '<p class="small muted">No goals yet. You are asked when you start a subject or a grade, and can set one from its page.</p>';
      wrap.querySelectorAll('.goal-edit-btn').forEach((button) => button.addEventListener('click', () => {
        const row = button.closest('[data-i]');
        const g = data.goals[Number(row.dataset.i)];
        const edit = row.querySelector('.goal-edit');
        edit.style.display = 'block';
        const forTrack = data.choices.filter((c) => !c.tracks || c.tracks.includes(g.track_id));
        form(edit, { goal: g, choices: forTrack, text_max: data.text_max }, {
          onSave: async (choice, text) => {
            const out = await save(g.track_id, g.grade_id, { choice, text });
            Object.assign(g, out.goal);
            draw();
          },
          onSkip: async () => { await save(g.track_id, g.grade_id, { choice: null }); data.goals.splice(Number(row.dataset.i), 1); draw(); },
          skipLabel: 'Clear goal',
          saveLabel: 'Save',
        });
      }));
    };
    draw();
  }

  window.GoalPicker = { ask, card, list };
}());
