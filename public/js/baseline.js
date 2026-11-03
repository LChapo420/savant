/* The baseline: pick Quick, Balanced or Accurate, then short tasks and choices until the time is up. The server (services/onboarding) chooses each next step
 * after every answer; this file only draws a step, times it and sends the response. Progress is minutes left, never a count of questions. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const next = App.query('next');
  const nextHref = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const esc = App.escapeHtml;
  const info = await App.api.get('/api/onboarding/modes');
  if (!info.allowed) {
    const old = App.query('old');
    window.location.href = old && old.startsWith('/') && !old.startsWith('//') ? old : `/style-quiz?next=${encodeURIComponent(nextHref)}`;
    return;
  }
  document.body.classList.add('ob-focus');
  const survey = {};
  let session = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shell = (progress, body) => {
    const pct = progress ? Math.min(100, Math.round((progress.elapsed_minutes / progress.budget_minutes) * 100)) : 0;
    root.innerHTML = `<div class="ob-head">${progress ? `<div class="meter meter-lg" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <p class="small muted" role="status">About ${progress.minutes_left} min left. <a href="#" id="stop">Stop here and save what I have</a></p>` : ''}</div><div id="step">${body}</div>`;
    const stop = document.getElementById('stop');
    if (stop) stop.addEventListener('click', async (e) => { e.preventDefault(); finish(await App.api.post('/api/onboarding/stop', {})); });
  };
  const ask = (html, buttons) => new Promise((resolve) => {
    const host = document.getElementById('step');
    host.innerHTML = `${html}<div class="ob-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">${buttons.map(([k, label]) => `<button class="btn btn-lg" data-k="${esc(k)}">${esc(label)}</button>`).join('')}</div>`;
    host.querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.k)));
  });
  const askText = (html, label) => new Promise((resolve) => {
    const host = document.getElementById('step');
    host.innerHTML = `${html}<textarea id="t" rows="4" style="width:100%;margin-top:12px" aria-label="${esc(label)}"></textarea><div style="margin-top:12px"><button class="btn btn-primary btn-lg" id="go">Continue</button> <button class="btn btn-ghost" id="skipt">Skip</button></div>`;
    document.getElementById('go').addEventListener('click', () => resolve(document.getElementById('t').value));
    document.getElementById('skipt').addEventListener('click', () => resolve(''));
  });
  const mcq = (q, options, withConf) => new Promise((resolve) => {
    const host = document.getElementById('step');
    let choice = null;
    host.innerHTML = `<h2>${esc(q)}</h2><div class="sq-scale" style="flex-direction:column;gap:8px">${options.map((o, i) => `<button class="sq-opt btn" data-i="${i}" aria-pressed="false">${esc(o)}</button>`).join('')}</div>
      ${withConf ? `<p class="small muted" style="margin-top:12px">How sure are you?</p><div class="ob-actions" id="conf">${[1, 2, 3, 4, 5].map((n) => `<button class="btn" data-c="${n}" disabled aria-label="Confidence ${n} of 5">${['Guess', 'Unsure', 'Maybe', 'Fairly sure', 'Certain'][n - 1]}</button>`).join(' ')}</div>` : ''}`;
    host.querySelectorAll('.sq-opt').forEach((b) => b.addEventListener('click', () => {
      choice = Number(b.dataset.i);
      host.querySelectorAll('.sq-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (!withConf) return resolve({ choice });
      host.querySelectorAll('#conf button').forEach((c) => { c.disabled = false; });
    }));
    host.querySelectorAll('#conf button').forEach((c) => c.addEventListener('click', () => resolve({ choice, confidence: Number(c.dataset.c) })));
  });
  const readThenAnswer = async (text, buttonLabel = 'I have read it') => {
    const t = Date.now();
    await ask(`<div class="card" style="padding:16px;line-height:1.6">${esc(text).replace(/\n/g, '<br>')}</div>`, [['x', buttonLabel]]);
    return Date.now() - t;
  };

  // ── the task renderers: each returns the response the server scores ─────────
  const R = {
    forced: async (s) => {
      const k = await ask(`<h2>${esc(s.prompt)}</h2>`, s.options.map((o) => [o.k, o.text]));
      return { choice: k };
    },
    survey: async (s) => {
      const labels = { interests: 'What are you interested in?', studying: 'What are you studying, or trying to get better at?', hobbies: 'What do you do for fun?', sports: 'Do you play or follow any sports?', notes: 'Anything else that would help? How you like to be taught, what has not worked before.', why: 'Why do you want to learn? What would it mean to you?' };
      const text = await askText(`<h2>${esc(labels[s.field])}</h2><p class="muted small">Skip any you like.</p>`, labels[s.field]);
      if (s.field !== 'why' && text.trim()) survey[s.field] = text.trim();
      return { text };
    },
    reason: async (s) => mcq(s.q, s.options, true),
    read: async (s) => {
      const readMs = await readThenAnswer(s.passage, 'I have finished reading');
      const answers = [];
      for (const q of s.questions) answers.push((await mcq(q.q, q.options, false)).choice);
      return { answers, readMs, words: s.words };
    },
    span: async (s) => {
      const run = async (backward) => {
        let best = 0;
        for (let len = backward ? 2 : 3, fails = 0; fails < 2 && len < 10;) {
          const digits = Array.from({ length: len }, () => 1 + Math.floor(Math.random() * 9));
          for (const d of digits) { document.getElementById('step').innerHTML = `<p class="muted small">${backward ? 'Remember these, then type them BACKWARDS' : 'Remember these digits in order'}</p><h1 style="text-align:center;font-size:64px">${d}</h1>`; await sleep(800); document.getElementById('step').innerHTML = '<h1 style="text-align:center;font-size:64px">&nbsp;</h1>'; await sleep(250); }
          const typed = await askText(`<h2>${backward ? 'Type them backwards' : 'Type them in order'}</h2>`, 'digits');
          const want = (backward ? [...digits].reverse() : digits).join('');
          if (typed.replace(/\D/g, '') === want) { best = len; len += 1; fails = 0; } else fails += 1;
        }
        return best;
      };
      const fwd = await run(false);
      if (s.forwardOnly) return { maxSpan: fwd };   // the short version of the task: forward span only
      const bwd = await run(true);
      return { maxSpan: (fwd + bwd + 1.5) / 2 };   // backward runs a digit or two shorter: +1.5 puts the average on forward-span terms
    },
    speed: async (s) => {
      let correct = 0; let wrong = 0; let firstMs = null; const end = Date.now() + (s.dur || 60) * 1000; const t0 = Date.now();
      const rnd = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 10)).join('');
      while (Date.now() < end) {
        const a = rnd(); const same = Math.random() < 0.5;
        let b = a; if (!same) { const i = Math.floor(Math.random() * 5); b = a.slice(0, i) + ((Number(a[i]) + 1 + Math.floor(Math.random() * 8)) % 10) + a.slice(i + 1); }
        const k = await ask(`<p class="muted small">Same or different? (${Math.max(0, Math.ceil((end - Date.now()) / 1000))} s)</p><h1 style="text-align:center;letter-spacing:6px">${a} &nbsp; ${b}</h1>`, [['s', 'Same'], ['d', 'Different']]);
        if (firstMs === null) firstMs = Date.now() - t0;
        if ((k === 's') === same) correct += 1; else wrong += 1;
      }
      return { correct, wrong, firstMs };
    },
    switch: async (s) => {
      const rules = s.config === 't:switch_a'
        ? { blue: ['Odd', 'Even', (n) => n % 2 === 1], orange: ['More than 5', '5 or less', (n) => n > 5] }
        : { blue: ['Small (1 to 4)', 'Large (6 to 9)', (n) => n < 5], orange: ['Divisible by 3', 'Not', (n) => n % 3 === 0] };
      const times = { switch: [], repeat: [] }; let errors = 0; let prev = null; const N = 20;
      // per condition, every trial after the first (errors too): for the rate-residual score (services/onboarding/tasks.js)
      const cond = { repeat: { n: 0, ok: 0, ms: 0 }, switch: { n: 0, ok: 0, ms: 0 } };
      for (let i = 0; i < N; i++) {
        const color = i === 0 ? 'blue' : (Math.random() < 0.5 ? prev : (prev === 'blue' ? 'orange' : 'blue'));
        let n = 1 + Math.floor(Math.random() * 9); if (s.config === 't:switch_b' && n === 5) n = 4; if (s.config === 't:switch_a' && n === 5) n = 6;
        const [l1, l2, f] = rules[color]; const t = Date.now();
        const k = await ask(`<p class="muted small">Blue box: ${esc(rules.blue[0])} or ${esc(rules.blue[1])}. Orange box: ${esc(rules.orange[0])} or ${esc(rules.orange[1])}.</p><div style="text-align:center;padding:24px;border-radius:12px;background:${color === 'blue' ? '#3b82f6' : '#f59e0b'};color:#fff"><h1 style="margin:0;font-size:64px">${n}</h1></div>`, [['1', l1], ['2', l2]]);
        const ok = (k === '1') === f(n); const ms = Date.now() - t;
        if (!ok) errors += 1; else if (i > 0) times[color === prev ? 'repeat' : 'switch'].push(ms);
        if (i > 0) { const c = cond[color === prev ? 'repeat' : 'switch']; c.n += 1; c.ms += ms; if (ok) c.ok += 1; }
        prev = color;
      }
      const m = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      return { costMs: m(times.switch) - m(times.repeat), errorRate: errors / N, repeat: cond.repeat, switch: cond.switch };
    },
    minilesson: async (s) => {
      const t0 = Date.now(); const c = {}; let answer = null; let feel = 3; let mine = 3; const T = s.text;
      if (s.part === 1) {
        document.getElementById('step').innerHTML = `<h2>${esc(T.title)}</h2><p>${esc(T.intro)}</p>`;
        c.first = await ask(`<h2>${esc(T.title)}</h2><p>${esc(T.intro)}</p><p><b>What first?</b></p>`, [['why', 'Why it works'], ['steps', 'The steps']]);
        await ask(`<p>${esc(c.first === 'why' ? T.why : T.steps.join('  ·  '))}</p>`, [['x', 'Continue']]);
        c.plan = await ask('<h2>Next is a question.</h2><p>Want a moment to plan, or start now?</p>', [['plan', 'Plan for a moment'], ['dive', 'Start now']]);
        if (c.plan === 'plan') await sleep(1500);
        c.hint = await ask(`<h2>${esc(s.problem.q)}</h2>`, [['hint', 'Show a hint first'], ['try', 'Let me try first']]);
        if (c.hint === 'hint') await ask(`<p><b>Hint.</b> ${esc(T.hint)}</p>`, [['x', 'Got it']]);
        answer = (await mcq(s.problem.q, s.problem.options, false)).choice;
      } else if (s.part === 2) {
        await ask(`<h2>${esc(T.title)}</h2><p>${esc(T.intro)}</p><p>${esc(T.why)}</p>`, [['x', 'Continue']]);
        c.deeper = await ask('<p>There is an extra, deeper paragraph on this.</p>', [['deeper', 'Read the deeper paragraph'], ['move', 'Move on']]);
        if (c.deeper === 'deeper') await ask(`<p>${esc(T.extra)}</p>`, [['x', 'Continue']]);
        c.mode = await ask('<h2>Next question</h2><p>Do it as a timed challenge against other learners, or at your own pace?</p>', [['challenge', 'Timed challenge'], ['solo', 'My own pace']]);
        answer = (await mcq(s.problem.q, s.problem.options, false)).choice;
        c.bonus = await ask('<p>There is a bonus fact, not needed for anything.</p>', [['bonus', 'Show me'], ['skip', 'Skip it']]);
        if (c.bonus === 'bonus') await ask(`<p>${esc(T.extra)}</p>`, [['x', 'Continue']]);
        c.order = 'own';
      } else {
        await ask(`<h2>${esc(T.title)}</h2><p>${esc(T.intro)}</p>`, [['x', 'Continue']]);
        answer = (await mcq(s.problem.q, s.problem.options, false)).choice;
        const link = await askText(`<h2>Optional</h2><p>${esc(T.connect)}</p>`, 'Connect it');
        c.connect = link.trim().split(/\s+/).filter(Boolean).length >= 4 ? 'wrote' : 'skip';
        feel = Number(await ask('<h2>How did that part feel?</h2>', [['1', 'Dull'], ['2', 'Meh'], ['3', 'Fine'], ['4', 'Good'], ['5', 'Great']]));
        mine = Number(await ask('<h2>Is this something you would do on your own?</h2>', [['1', 'No'], ['2', 'Not really'], ['3', 'Maybe'], ['4', 'Probably'], ['5', 'Yes']]));
        const unclear = await askText('<h2>Optional</h2><p>What is still unclear, if anything?</p>', 'Unclear');
        c.unclear = unclear.trim().split(/\s+/).filter(Boolean).length >= 4 ? 'wrote' : 'skip';
        c.more = await ask('<p>One more question, if you like.</p>', [['more', 'Yes, one more'], ['done', 'I am done']]);
      }
      return { answer, choices: c, feel, mine, readMs: Date.now() - t0 };
    },
    taste: async (s) => {
      const recall = async (qs) => { const a = []; for (const q of qs) a.push((await mcq(q.q, q.options, false)).choice); return a; };
      await readThenAnswer(s.first); const recallFirst = await recall(s.questions);
      await readThenAnswer(s.second); const recallSecond = await recall(s.questions);
      const prefer = await ask('<h2>Which did you prefer to learn from?</h2>', [['first', 'The first'], ['second', 'The second'], ['same', 'No difference']]);
      return { recallFirst, recallSecond, prefer };
    },
  };

  async function loop(out) {
    while (out && !out.done) {
      shell(out.progress, '');
      const t = Date.now();
      const response = await R[out.step.kind](out.step);
      shell(out.progress, '<div class="loading"><span class="spinner"></span></div>');
      out = await App.api.post('/api/onboarding/answer', { session, id: out.step.id, response, ms: Date.now() - t });
    }
    finish(out);
  }
  async function finish(out) {
    if (Object.keys(survey).length) {
      try { const p = await App.api.get('/api/profile'); await App.api.post('/api/profile/survey', { ...(p.survey || {}), ...survey }); } catch { /* the survey is kept next time */ }
    }
    const s = out.summary || {};
    root.innerHTML = `<div class="ob-head"><h1>Done: your starting picture is set</h1><p class="lede">${s.minutes || 0} minutes, ${s.known || 0} things measured. Everything you do from here sharpens it, and you can go deeper any time from your profile.</p></div>
      <a class="btn btn-primary btn-lg" href="${esc(nextHref)}">Continue</a>`;
  }

  // ── the mode picker ─────────────────────────────────────────────────────────
  root.innerHTML = `<div class="ob-head"><h1>How do you learn best?</h1>
    <p class="lede">Before Savant writes anything, it learns how you take things in and what helps you. The longer you give it, the better the picture. It never grades you, and you can go deeper later.</p></div>
    <div class="sq-item">${info.modes.map((m) => `<div class="card" style="padding:16px;margin-bottom:12px"><h2>${esc(m.label)} <span class="muted small">${m.id === 'quick' ? 'under 5' : m.id === 'balanced' ? 'about 15 to 20' : 'under 60'} minutes</span></h2><p>${esc(m.blurb)}</p><button class="btn btn-primary" data-mode="${m.id}">Start ${esc(m.label)}</button></div>`).join('')}</div>
    <p class="small muted">${info.done ? 'You have done this before: a longer mode builds on what is already known. ' : ''}<a href="${esc(nextHref)}">Skip for now</a></p>`;
  root.querySelectorAll('button[data-mode]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const out = await App.api.post('/api/onboarding/start', { mode: b.dataset.mode });
    session = out.session;
    loop(out);
  }));
});
