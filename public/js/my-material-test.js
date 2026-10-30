/* A practice test on demand from your own material: pick skills and a length, timed or not.
 * The server draws the questions, keeps the keys, enforces the time and marks the answers;
 * this page shows what it sends and sends your answers back. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const id = new URLSearchParams(window.location.search).get('id');
  const base = `/api/materials/${encodeURIComponent(id)}/test`;
  const back = `<p class="small"><a href="/my-material-study?id=${encodeURIComponent(id)}">&larr; Back to the course</a></p>`;
  let timer = null;

  const fail = (err) => { root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div><p><a href="/my-material">Back to my material</a></p>`; };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  async function setup() {
    stop();
    let o;
    try { o = await App.api.get(base); } catch (err) { return fail(err); }
    const usable = o.skills.filter((s) => s.questions > 0);
    const hist = o.history.length
      ? `<div class="card" style="margin-top:16px"><h2>Your last tests</h2><ul style="list-style:none;padding:0;margin:0">${o.history.map((h) => `<li class="small" style="padding:4px 0">${esc(String(h.at).slice(0, 10))}: ${h.right} of ${h.total} right${h.timed ? (h.late ? ' (timed, handed in late)' : ' (timed)') : ''}</li>`).join('')}</ul></div>` : '';
    root.innerHTML = `${back}<h1>Practice test</h1>
      <p class="muted">Choose what to be tested on. The questions come from your own material. A test never changes which skills you have mastered, but it does update what Savant knows about you: a skill you had mastered comes back for review sooner if you miss it.</p>
      <form id="setup" class="card">
        <fieldset style="border:0;padding:0;margin:0"><legend><strong>Skills</strong></legend>
          ${usable.map((s) => `<label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="skill" value="${esc(s.id)}" checked> <span>${esc(s.title)} <span class="tiny muted">${s.questions} questions</span></span></label>`).join('')}
        </fieldset>
        <label class="field"><strong>Length</strong> <input type="number" name="length" min="${o.min}" max="${o.max}" value="${o.default}" inputmode="numeric" style="width:5em"> questions</label>
        <label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="timed"> <span>Timed (about ${o.seconds_per_question} seconds a question)</span></label>
        <button class="btn btn-primary" type="submit">${o.open ? 'Start a new test' : 'Start the test'}</button>
      </form>${hist}`;
    document.getElementById('setup').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const skills = [...f.querySelectorAll('input[name="skill"]:checked')].map((c) => c.value);
      if (!skills.length) { App.toast('Pick at least one skill.', 'error'); return; }
      try {
        const t = await App.api.post(base, { skills, length: Number(f.length.value), timed: f.timed.checked });
        run(t);
      } catch (err) { App.toast(err.message, 'error'); }
    });
    return null;
  }

  function qHtml(q, i) {
    const body = q.type === 'multiple_choice'
      ? q.choices.map((c, n) => `<label class="field" style="display:flex;gap:8px;align-items:center"><input type="radio" name="q${i}" value="${n}"> <span>${esc(c)}</span></label>`).join('')
      : `<input type="text" name="q${i}" maxlength="300" autocomplete="off" aria-label="Your answer">`;
    return `<div class="card" style="margin-top:12px"><p><strong>${i + 1}.</strong> ${esc(q.prompt)}</p>${body}</div>`;
  }

  function run(t) {
    stop();
    root.innerHTML = `${back}<h1>Practice test</h1>
      ${t.timed ? '<p class="card" id="clock" role="timer" aria-live="off"><strong></strong></p>' : ''}
      <form id="take">${t.questions.map(qHtml).join('')}<button class="btn btn-primary" type="submit" style="margin-top:12px">Hand in</button></form>`;
    const form = document.getElementById('take');
    let sent = false;
    const send = async () => {
      if (sent) return;
      sent = true;
      stop();
      const answers = {};
      t.questions.forEach((q, i) => {
        if (q.type === 'multiple_choice') { const c = form.querySelector(`input[name="q${i}"]:checked`); if (c) answers[q.id] = Number(c.value); }
        else { const v = form.querySelector(`input[name="q${i}"]`).value; if (v.trim()) answers[q.id] = v; }
      });
      form.querySelectorAll('input,button').forEach((x) => { x.disabled = true; });
      try { result(await App.api.post(`${base}/submit`, { test_id: t.test_id, answers })); } catch (err) { fail(err); }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
    if (t.timed) {
      const end = Date.parse(t.ends_at);
      const clock = document.querySelector('#clock strong');
      const tick = () => {
        const left = Math.max(0, Math.round((end - Date.now()) / 1000));
        clock.textContent = `Time left: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (!left) send();
      };
      tick();
      timer = setInterval(tick, 1000);
    }
  }

  function result(r) {
    const weak = r.weak.length ? `<p class="small">Worth another look: ${r.weak.map((w) => esc(w.title)).join(', ')}.</p>` : '<p class="small">Every skill in this test came out at 75% or better.</p>';
    root.innerHTML = `${back}<h1>Your result</h1>
      <div class="card"><p><strong>${r.score.right} of ${r.score.total} right (${r.score.percent}%).</strong></p>
        ${r.timed ? `<p class="small">${r.late ? 'Handed in after the time was up. ' : ''}You took ${Math.floor(r.seconds_used / 60)}m ${r.seconds_used % 60}s of ${Math.round(r.seconds_allowed / 60)} minutes.</p>` : ''}
        ${r.score.answered < r.score.total ? `<p class="small">${r.score.total - r.score.answered} left blank, scored as wrong.</p>` : ''}
        <ul style="list-style:none;padding:0;margin:8px 0 0">${r.report.map((e) => `<li class="small">${esc(e.title)}: ${e.right} of ${e.total}${e.review_now ? ' (it will come up for review now)' : ''}</li>`).join('')}</ul>${weak}</div>
      ${r.remediation.map((x) => `<div class="card" style="margin-top:12px"><p>${esc(x.prompt)}</p>
        <p class="small">${x.your_answer ? `You said: ${esc(x.your_answer)}. ` : 'No answer. '}<strong>Answer: ${esc(x.correct_answer)}</strong></p>
        <p class="small">${esc(x.explanation || '')}${x.misconception ? ` You may have thought: ${esc(x.misconception)}.` : ''}</p>
        ${x.feedback ? `<p class="small">${esc(x.feedback)}</p>` : ''}
        <p class="tiny muted">From your material: “${esc(x.from_your_material)}”</p></div>`).join('')}
      <p style="margin-top:16px"><button class="btn btn-primary" type="button" id="again">Take another test</button></p>`;
    document.getElementById('again').addEventListener('click', setup);
  }

  setup();
});
