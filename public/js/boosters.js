/* Extras: optional ways to give your lessons more to go on (services/boosters.js). Every one is skippable and none changes what you are
 * taught: each adds to what Savant knows about how you learn, which you can read on your Profile. Quick ones are also offered in the normal
 * flow (sign-up, the dashboard); longer or less fun ones live only here. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const hash = () => (window.location.hash || '').replace('#', '');

  async function hub() {
    document.body.classList.remove('sq-open');
    let s;
    try { s = await App.api.get('/api/boosters'); } catch (err) { root.innerHTML = `<div class="notice notice-error" role="alert">${esc(err.message)}</div>`; return; }
    if (!s.allowed) {
      root.innerHTML = `<div class="card"><h1>Extras</h1><p class="muted">These optional extras are not available for this account. A parent or guardian can agree to them in the parent area.</p><a class="btn btn-primary" href="/dashboard">Back to the dashboard</a></div>`;
      return;
    }
    const gameRow = (g) => `<li class="boost-row"><div><b>${esc(g.title)}</b><span class="small muted"> · ${g.minutes} min</span><br><span class="small">${esc(g.what)}</span>${g.last ? `<br><span class="tiny muted">Last played ${new Date(g.last.at).toLocaleDateString()}</span>` : ''}</div><button class="btn btn-sm" data-game="${esc(g.id)}" type="button">Play</button></li>`;
    root.innerHTML = `
      <div class="ob-head">
        <h1>Extras</h1>
        <p class="lede">Optional ways to help Savant fit your lessons to you more closely, sooner. Each one is skippable, and what you do in lessons still counts most.</p>
      </div>

      <section class="card boost" aria-labelledby="b-q">
        <h2 id="b-q">Study habits questionnaire <span class="chip">${s.questionnaire.minutes} min</span></h2>
        <p class="small">Sixteen short statements about how you study and feel about tests, from a public-domain research questionnaire. A starting point, not a test.</p>
        ${s.questionnaire.done ? `<p class="small muted">${s.questionnaire.skipped ? 'You skipped this.' : 'Done. Thank you.'}</p>` : '<div class="row-wrap"><button class="btn btn-primary" data-act="questionnaire" type="button">Answer the statements</button></div>'}
      </section>

      <section class="card boost" aria-labelledby="b-r">
        <h2 id="b-r">Reading check <span class="chip">4 min</span></h2>
        <p class="small">Ten to twelve questions that measure your reading level so lessons use words that fit.</p>
        <div class="row-wrap"><a class="btn" href="/reading-check?next=/boosters">${s.reading.taken ? 'Take it again' : 'Take the check'}</a></div>
        ${s.reading.last ? `<p class="tiny muted">Last result: about grade ${Number(s.reading.last.grade).toFixed(1)}.</p>` : ''}
      </section>

      <section class="card boost" aria-labelledby="b-d">
        <h2 id="b-d">Memory check <span class="chip">30 seconds</span></h2>
        <p class="small">A week or a month after you practise something, three quick questions show how well it stuck. That is the best way to time your reviews.</p>
        ${s.delayed.due ? `<div class="row-wrap"><button class="btn btn-primary" data-act="delayed" type="button">Start (${s.delayed.questions} question${s.delayed.questions === 1 ? '' : 's'})</button></div>` : '<p class="small muted">Nothing is due yet. It will show here a week after you have practised something.</p>'}
      </section>

      <section class="card boost" aria-labelledby="b-g">
        <h2 id="b-g">Brain games <span class="chip">2 min each</span></h2>
        <p class="small">Three short games: how many things you can hold in mind, how fast you react, how long you stay focused. Each counts once a week.</p>
        <ul class="boost-list">${s.games.map(gameRow).join('')}</ul>
      </section>

      <section class="card boost" aria-labelledby="b-i">
        <h2 id="b-i">Past results <span class="chip">optional</span></h2>
        <p class="small">Type in an ACT, SAT or PSAT score or a grade average, or choose a flashcard review-history file, and Savant starts from what you already know. ${s.imports ? `<span class="muted">You added: ${esc(s.imports.kinds.join(', ').replace(/_/g, ' '))}.</span>` : ''}</p>
        <div class="row-wrap"><button class="btn" data-act="import" type="button">Add past results</button></div>
      </section>

      <section class="card boost" aria-labelledby="b-s">
        <h2 id="b-s">Quiet signals <span class="chip">off until you switch it on</span></h2>
        <p class="small">While you answer questions, Savant can note how long you wait before your first move, how fast you type (the gaps between key presses, never which keys or what you write) and how often you press backspace. Only these numbers are kept. <a href="/privacy#collect">Read exactly what is collected</a>.</p>
        <label class="check-row"><input type="checkbox" id="silent-on" ${s.silent.on ? 'checked' : ''}> <span>Collect these quiet signals</span></label>
      </section>

      <section class="card boost" aria-labelledby="b-m">
        <h2 id="b-m">Maximum accuracy <span class="chip">optional</span></h2>
        <p class="small">A “how sure are you?” tap on every question, and a small teaching experiment on every tailored lesson. It learns how you learn sooner, and asks a little more of you.</p>
        <label class="check-row"><input type="checkbox" id="max-on" ${s.max_accuracy.on ? 'checked' : ''}> <span>Use maximum accuracy mode</span></label>
      </section>

      <p><a class="btn btn-text" href="/dashboard">Back to the dashboard</a></p>`;

    root.querySelectorAll('[data-game]').forEach((b) => b.addEventListener('click', () => playGame(b.dataset.game)));
    root.querySelector('[data-act="questionnaire"]')?.addEventListener('click', questionnaire);
    root.querySelector('[data-act="delayed"]')?.addEventListener('click', delayedCheck);
    root.querySelector('[data-act="import"]')?.addEventListener('click', importForm);
    document.getElementById('silent-on').addEventListener('change', async (e) => {
      try { await App.api.post('/api/boosters/silent', { on: e.target.checked }); App.toast(e.target.checked ? 'Quiet signals are on.' : 'Quiet signals are off.'); } catch (err) { App.toast(err.message, 'error'); e.target.checked = !e.target.checked; }
    });
    document.getElementById('max-on').addEventListener('change', async (e) => {
      try { await App.api.post('/api/boosters/max-accuracy', { on: e.target.checked }); App.toast(e.target.checked ? 'Maximum accuracy mode is on.' : 'Maximum accuracy mode is off.'); } catch (err) { App.toast(err.message, 'error'); e.target.checked = !e.target.checked; }
    });
    if (hash() === 'questionnaire' && !s.questionnaire.done) questionnaire();
  }

  // ── the questionnaire ──
  async function questionnaire() {
    document.body.classList.add('sq-open'); // the tutor button would sit on the Save button on a phone
    const q = await App.api.get('/api/boosters/questionnaire');
    const answers = {};
    root.innerHTML = `
      <div class="ob-head">
        <h1>How do you study?</h1>
        <p class="lede">Choose how well each statement describes you. There are no right answers. Leave any blank, or skip the whole thing.</p>
      </div>
      <div class="sq-top"><div class="sq-progress"><div class="meter meter-lg"><span id="bar" style="width:0%"></span></div><span class="small muted" id="count" aria-live="polite">0 of ${q.items.length}</span></div></div>
      <div id="items">${q.items.map((it) => `
        <div class="sq-item" data-id="${esc(it.id)}">
          <div class="sq-prompt" id="p-${esc(it.id)}">${esc(it.text)}</div>
          <div class="sq-scale" role="group" aria-labelledby="p-${esc(it.id)}">
            ${q.scale.map((s) => `<button class="sq-opt" type="button" aria-pressed="false" aria-label="${esc(s.label)}" data-value="${s.value}"><span class="sq-long">${esc(s.label)}</span><span class="sq-short" aria-hidden="true">${s.value}</span></button>`).join('')}
          </div>
        </div>`).join('')}</div>
      <p class="tiny muted">${esc(q.source)}.</p>
      <div class="ob-foot sq-bar"><div class="ob-foot-row"><span class="ob-foot-text" id="status">Answer what you like. At least four statements are needed to save.</span>
        <div class="ob-actions"><button class="btn btn-ghost" id="q-skip" type="button">Skip</button><button class="btn btn-primary btn-lg" id="q-save" type="button" disabled>Save</button></div></div></div>`;
    const bar = document.getElementById('bar'); const count = document.getElementById('count'); const save = document.getElementById('q-save');
    document.getElementById('items').addEventListener('click', (e) => {
      const btn = e.target.closest('.sq-opt');
      if (!btn) return;
      const item = btn.closest('.sq-item');
      [...item.querySelectorAll('.sq-opt')].forEach((b) => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('selected'); btn.setAttribute('aria-pressed', 'true');
      answers[item.dataset.id] = Number(btn.dataset.value);
      const n = Object.keys(answers).length;
      bar.style.width = `${(n / q.items.length) * 100}%`; count.textContent = `${n} of ${q.items.length}`; save.disabled = n < 4;
    });
    document.getElementById('q-skip').addEventListener('click', async () => { try { await App.api.post('/api/boosters/questionnaire/skip', {}); } catch { /* skipping never fails the page */ } hub(); });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try { await App.api.post('/api/boosters/questionnaire', { answers }); App.toast('Saved. Thank you.'); hub(); } catch (err) { App.toast(err.message, 'error'); save.disabled = false; }
    });
    window.scrollTo(0, 0);
  }

  // ── the 30-second memory check ──
  async function delayedCheck() {
    let c;
    try { c = await App.api.post('/api/boosters/delayed/start', {}); } catch (err) { App.toast(err.message, 'error'); return; }
    const answers = {};
    let i = 0;
    const showQ = () => {
      const q = c.questions[i];
      root.innerHTML = `
        <div class="card"><p class="lesson-meta">Memory check · question ${i + 1} of ${c.questions.length}</p>
          <h1 class="player-title" id="dq-prompt" tabindex="-1">${esc(q.prompt)}</h1>
          <div class="choices" role="group" aria-labelledby="dq-prompt">${q.choices.map((ch, k) => `<button class="choice" type="button" data-k="${k}"><span class="key">${'ABCDE'[k]}</span><span>${esc(ch)}</span></button>`).join('')}</div>
          <div class="row-wrap"><button class="btn btn-ghost" data-skip type="button">I don’t remember</button></div></div>`;
      const next = () => { i += 1; if (i < c.questions.length) showQ(); else finish(); };
      root.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => { answers[q.n] = Number(b.dataset.k); next(); }));
      root.querySelector('[data-skip]').addEventListener('click', next);
      document.getElementById('dq-prompt').focus();
    };
    const finish = async () => {
      try { await App.api.post('/api/boosters/delayed/answer', { check_id: c.check_id, answers }); } catch (err) { App.toast(err.message, 'error'); }
      root.innerHTML = '<div class="card"><h1>Done</h1><p class="lede">Thank you. That tells Savant when to bring this back for review.</p><a class="btn btn-primary" href="/boosters">Back to Extras</a></div>';
    };
    showQ();
  }

  // ── a game ──
  function playGame(id) {
    root.innerHTML = '<div id="game-host"></div>';
    const host = document.getElementById('game-host');
    window.BoosterGames[id](host, async (result) => {
      let out = null;
      try { out = await App.api.post(`/api/boosters/games/${id}`, { result }); } catch (err) { App.toast(err.message, 'error'); }
      root.innerHTML = `<div class="card"><h1>${out && out.fed ? 'Counted' : 'Thanks for playing'}</h1><p class="lede">${out && out.fed ? 'Your result was added to what Savant knows about you.' : esc((out && out.reason) || 'This play was too short to count.')}</p><a class="btn btn-primary" href="/boosters">Back to Extras</a></div>`;
    });
  }

  // ── past results ──
  function importForm() {
    root.innerHTML = `
      <div class="ob-head"><h1>Past results</h1><p class="lede">Add whatever you have. Everything here is optional, and you can leave any box empty.</p></div>
      <form class="card" id="imp" novalidate>
        <div class="field"><label for="act">ACT composite (1 to 36)</label><input id="act" type="text" inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="sat">SAT total (400 to 1600)</label><input id="sat" type="text" inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="psat">PSAT total (320 to 1520)</label><input id="psat" type="text" inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="gpa">Grade average (0 to 4 scale)</label><input id="gpa" type="text" inputmode="decimal" autocomplete="off"></div>
        <div class="field"><label for="hist">Flashcard review history (a .csv or .tsv file)</label><input id="hist" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain">
          <p class="tiny muted">One review per row, with a header naming <code>interval_days</code> and <code>correct</code> (or <code>ease</code>), and optionally <code>card</code>. The file is read in your browser; only its text is sent, processed once and not kept.</p></div>
        <div id="imp-msg" class="notice hidden" role="alert"></div>
        <div class="row-wrap"><button class="btn btn-primary" type="submit">Add</button><a class="btn btn-ghost" href="/boosters">Cancel</a></div>
      </form>`;
    document.getElementById('imp').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { act_composite: val('act'), sat_total: val('sat'), psat_total: val('psat'), gpa: val('gpa') };
      const f = document.getElementById('hist').files[0];
      if (f) { if (f.size > 400 * 1024) { msg('That file is over 400 KB. Export a shorter history.'); return; } body.history_csv = await f.text(); }
      try { const out = await App.api.post('/api/boosters/import', body); App.toast(`Added${out.memory_tests ? `, including ${out.memory_tests} reviews` : ''}.`); hub(); } catch (err) { msg(err.message); }
    });
    const val = (id) => document.getElementById(id).value.trim();
    const msg = (t) => { const m = document.getElementById('imp-msg'); m.textContent = t; m.classList.remove('hidden'); m.className = 'notice notice-error'; };
  }

  hub();
});
