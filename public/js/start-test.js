/* The short test inside the new onboarding (docs/ONBOARDING-V2.md section 3).
 *
 * The same test as /baseline and /style-quiz, drawn in this flow's look. The server (services/onboarding) still chooses every next step and scores it; this
 * file only draws a step, times it and returns the response, in the same shape public/js/baseline.js sends. If a response's shape changes there, change it here.
 * The only additions are "Go" screens in front of the timed tasks: each task's time on the pool already includes its instruction, and the clock a task
 * reads (firstMs, readMs) starts after them, as it does on the old page.
 *
 *   ObTest.present(step, ctx)  -> the response for one baseline step
 *   ObTest.choice(q, scale, ctx) -> the value for one style-quiz question
 *   ObTest.cancel()            stops whatever is on screen (the learner left the screen, or stopped)
 *
 * ctx: { host() the element to draw in, focus(on) hide the tutor while a task needs the eyes, say(text, mood), label(text) the line over the task }
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const never = new Promise(() => {});
  let runId = 0;

  function make(ctx) {
    const run = (runId += 1);
    const live = () => run === runId;
    const sleep = async (ms) => { await new Promise((r) => setTimeout(r, ms)); if (!live()) await never; };
    const host = () => ctx.host();

    function draw(html) {
      const h = host();
      if (!live() || !h) return null;
      h.innerHTML = `<div class="task">${html}</div>`;
      return h;
    }
    const lookAt = (h) => { const t = h.querySelector('[data-look]'); if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } };

    /**
     * Big answer buttons. `flash` lets the pressed look land before moving on. `keys`: number keys press them (for the timed tasks, where a finger on the
     * keyboard is faster than Tab). `hold` keeps the focus on the first button between trials instead of moving it to the heading.
     */
    function ask(html, buttons, { flash = false, keys = false, hold = false, cls = '' } = {}) {
      return new Promise((resolve) => {
        const h = draw(`${html}<div class="t-btns ${cls}">${buttons.map(([k, label], i) => `<button type="button" class="t-opt" data-k="${esc(k)}">${keys ? `<span class="t-key" aria-hidden="true">${i + 1}</span>` : ''}<span>${esc(label)}</span></button>`).join('')}</div>`);
        if (!h) return;
        let done = false;
        const pick = (b) => {
          if (done) return;
          done = true;
          document.removeEventListener('keydown', onKey);
          b.classList.add('is-picked');
          if (flash && !calm()) setTimeout(() => resolve(b.dataset.k), 170);
          else resolve(b.dataset.k);
        };
        const all = [...h.querySelectorAll('.t-opt')];
        const onKey = (e) => {
          if (!live()) { document.removeEventListener('keydown', onKey); return; }
          if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
          const b = all[Number(e.key) - 1];
          if (b) { e.preventDefault(); pick(b); }
        };
        if (keys) document.addEventListener('keydown', onKey);
        all.forEach((b) => b.addEventListener('click', () => pick(b)));
        if (hold && all[0]) all[0].focus({ preventScroll: true });
        else lookAt(h);
      });
    }

    /** One typed answer. Enter sends it. `skip` is the quiet way past, returning an empty answer. */
    function askText(html, label, { numeric = false, skip = 'Skip', long = false } = {}) {
      return new Promise((resolve) => {
        const box = long
          ? `<textarea class="input t-area" id="t-in" rows="4" aria-label="${esc(label)}"></textarea>`
          : `<input class="input t-in" id="t-in" aria-label="${esc(label)}" autocomplete="off"${numeric ? ' inputmode="numeric" pattern="[0-9]*"' : ''}>`;
        const h = draw(`${html}${box}
          <button type="button" class="btn t-go" id="t-go">Continue</button>
          <button type="button" class="link-btn" id="t-skip">${esc(skip)}</button>`);
        if (!h) return;
        const input = h.querySelector('#t-in');
        const send = (v) => resolve(v);
        h.querySelector('#t-go').addEventListener('click', () => send(input.value));
        h.querySelector('#t-skip').addEventListener('click', () => send(''));
        if (!long) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(input.value); } });
        input.focus({ preventScroll: true });
      });
    }

    function mcq(q, options, withConf) {
      return new Promise((resolve) => {
        const h = draw(`<h2 class="q-prompt" data-look>${esc(q)}</h2><div class="t-btns">${options.map((o, i) => `<button type="button" class="t-opt" data-i="${i}" aria-pressed="false"><span>${esc(o)}</span></button>`).join('')}</div>
          ${withConf ? '<div class="t-conf" id="t-conf" hidden><p class="t-conf-q" id="t-conf-q">How sure are you?</p><div class="t-chips" role="group" aria-labelledby="t-conf-q">'
          + ['Guess', 'Unsure', 'Maybe', 'Fairly sure', 'Certain'].map((label, n) => `<button type="button" class="t-chip" data-c="${n + 1}">${label}</button>`).join('')
          + '</div></div>' : ''}`);
        if (!h) return;
        lookAt(h);
        let choice = null;
        h.querySelectorAll('.t-opt').forEach((b) => b.addEventListener('click', () => {
          choice = Number(b.dataset.i);
          h.querySelectorAll('.t-opt').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.classList.toggle('is-picked', x === b); });
          if (!withConf) { setTimeout(() => resolve({ choice }), calm() ? 0 : 170); return; }
          const box = h.querySelector('#t-conf');
          box.hidden = false;
          box.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
        }));
        h.querySelectorAll('.t-chip').forEach((c) => c.addEventListener('click', () => resolve({ choice, confidence: Number(c.dataset.c) })));
      });
    }

    const readThenAnswer = async (text, button = 'I\'ve finished reading') => {
      const t = Date.now();
      await ask(`<div class="t-read" data-look>${esc(text).replace(/\n/g, '<br>')}</div>`, [['x', button]], { cls: 'one' });
      return Date.now() - t;
    };

    /** The screen in front of a timed task. Time starts after "Go". */
    const ready = (title, text, button = 'Go') => ask(`<h2 class="q-prompt" data-look>${esc(title)}</h2><p class="t-how">${esc(text)}</p>`, [['go', button]], { cls: 'one go' });

    const R = {
      forced: async (s) => ({ choice: await ask(`<h2 class="q-prompt" data-look>${esc(s.prompt)}</h2>`, s.options.map((o) => [o.k, o.text]), { flash: true }) }),
      survey: async (s) => {
        const labels = { interests: 'What are you interested in?', studying: 'What are you studying, or trying to get better at?', hobbies: 'What do you do for fun?', sports: 'Do you play or follow any sports?', notes: 'Anything else that would help? How you like to be taught, what has not worked before.', why: 'Why do you want to learn? What would it mean to you?' };
        return { text: await askText(`<h2 class="q-prompt" data-look>${esc(labels[s.field])}</h2>`, labels[s.field], { long: true }) };
      },
      reason: async (s) => mcq(s.q, s.options, true),
      read: async (s) => {
        const readMs = await readThenAnswer(s.passage);
        const answers = [];
        for (const q of s.questions) answers.push((await mcq(q.q, q.options, false)).choice);
        return { answers, readMs, words: s.words };
      },
      span: async (s) => {
        const big = (d, line) => draw(`<p class="t-how">${esc(line)}</p><div class="t-digit" role="status">${d}</div>`);
        const runDigits = async (backward) => {
          let best = 0;
          for (let len = backward ? 2 : 3, fails = 0; fails < 2 && len < 10;) {
            const digits = Array.from({ length: len }, () => 1 + Math.floor(Math.random() * 9));
            ctx.focus(true);
            for (const d of digits) {
              big(d, backward ? 'Remember them, then type them backwards' : 'Remember them in order');
              await sleep(800);
              big('&nbsp;', ' ');
              await sleep(250);
            }
            const typed = await askText(`<h2 class="q-prompt" data-look>${backward ? 'Type them backwards' : 'Type them in order'}</h2>`, 'The digits', { numeric: true, skip: 'I don\'t remember' });
            const want = (backward ? [...digits].reverse() : digits).join('');
            if (typed.replace(/\D/g, '') === want) { best = len; len += 1; fails = 0; } else fails += 1;
          }
          return best;
        };
        ctx.focus(false);
        await ready('Remember the numbers', 'Numbers appear one at a time. When they stop, type them in order. They get longer until you miss two in a row, and that happens to everyone.', 'I\'m ready');
        const fwd = await runDigits(false);
        if (s.forwardOnly) { ctx.focus(false); return { maxSpan: fwd }; }
        ctx.focus(false);
        await ready('Now backwards', 'Same again, but type them in reverse order.', 'I\'m ready');
        const bwd = await runDigits(true);
        ctx.focus(false);
        return { maxSpan: (fwd + bwd + 1.5) / 2 };
      },
      speed: async (s) => {
        const dur = s.dur || 60;
        ctx.focus(false);
        await ready('Same or different?', `Two numbers will appear. Say if they match. Answer as many as you can in ${dur} seconds, and don't worry about a few wrong ones.`);
        ctx.focus(true);
        let correct = 0; let wrong = 0; let firstMs = null;
        const t0 = Date.now(); const end = t0 + dur * 1000;
        const rnd = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 10)).join('');
        const left = () => Math.max(0, Math.ceil((end - Date.now()) / 1000));
        const tick = setInterval(() => {
          if (!live()) { clearInterval(tick); return; }
          const n = host() && host().querySelector('#t-time');
          if (n) n.textContent = `${left()} s`;
          const bar = host() && host().querySelector('.t-time-fill');
          if (bar) bar.style.width = `${(Math.max(0, end - Date.now()) / (dur * 1000)) * 100}%`;
        }, 250);
        while (Date.now() < end) {
          const a = rnd(); const same = Math.random() < 0.5;
          let b = a;
          if (!same) { const i = Math.floor(Math.random() * 5); b = a.slice(0, i) + ((Number(a[i]) + 1 + Math.floor(Math.random() * 8)) % 10) + a.slice(i + 1); }
          const k = await ask(`<div class="t-time"><div class="t-time-track"><div class="t-time-fill" style="width:${(Math.max(0, end - Date.now()) / (dur * 1000)) * 100}%"></div></div><span id="t-time">${left()} s</span></div>
            <div class="t-pair" role="group" aria-label="Two numbers"><span>${a}</span><span>${b}</span></div>`, [['s', 'Same'], ['d', 'Different']], { keys: true, hold: true, cls: 'two big' });
          if (firstMs === null) firstMs = Date.now() - t0;
          if ((k === 's') === same) correct += 1; else wrong += 1;
        }
        clearInterval(tick);
        ctx.focus(false);
        return { correct, wrong, firstMs };
      },
      switch: async (s) => {
        const rules = s.config === 't:switch_a'
          ? { blue: ['Odd', 'Even', (n) => n % 2 === 1], orange: ['More than 5', '5 or less', (n) => n > 5] }
          : { blue: ['Small (1 to 4)', 'Large (6 to 9)', (n) => n < 5], orange: ['Divisible by 3', 'Not', (n) => n % 3 === 0] };
        ctx.focus(false);
        await ready('Follow the colour', `Blue box: ${rules.blue[0]} or ${rules.blue[1]}. Orange box: ${rules.orange[0]} or ${rules.orange[1]}. Answer quickly, 20 times.`);
        ctx.focus(true);
        const times = { switch: [], repeat: [] }; let errors = 0; let prev = null; const N = 20;
        const cond = { repeat: { n: 0, ok: 0, ms: 0 }, switch: { n: 0, ok: 0, ms: 0 } };
        for (let i = 0; i < N; i += 1) {
          const color = i === 0 ? 'blue' : (Math.random() < 0.5 ? prev : (prev === 'blue' ? 'orange' : 'blue'));
          let n = 1 + Math.floor(Math.random() * 9);
          if (s.config === 't:switch_b' && n === 5) n = 4;
          if (s.config === 't:switch_a' && n === 5) n = 6;
          const [l1, l2, f] = rules[color]; const t = Date.now();
          const k = await ask(`<p class="t-how">${color === 'blue' ? 'Blue' : 'Orange'} box: ${esc(l1)} or ${esc(l2)}</p>
            <div class="t-box is-${color}"><small>${color === 'blue' ? 'Blue' : 'Orange'}</small><b>${n}</b></div>`, [['1', l1], ['2', l2]], { keys: true, hold: true, cls: 'two big' });
          const ok = (k === '1') === f(n); const ms = Date.now() - t;
          if (!ok) errors += 1; else if (i > 0) times[color === prev ? 'repeat' : 'switch'].push(ms);
          if (i > 0) { const c = cond[color === prev ? 'repeat' : 'switch']; c.n += 1; c.ms += ms; if (ok) c.ok += 1; }
          prev = color;
        }
        ctx.focus(false);
        const m = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
        return { costMs: m(times.switch) - m(times.repeat), errorRate: errors / N, repeat: cond.repeat, switch: cond.switch };
      },
      minilesson: async (s) => {
        const t0 = Date.now(); const c = {}; let answer = null; let feel = 3; let mine = 3; const T = s.text;
        const says = (html) => `<div class="t-read" data-look>${html}</div>`;
        if (s.part === 1) {
          c.first = await ask(says(`<h2>${esc(T.title)}</h2><p>${esc(T.intro)}</p><p><b>What first?</b></p>`), [['why', 'Why it works'], ['steps', 'The steps']], { flash: true });
          await ask(says(`<p>${esc(c.first === 'why' ? T.why : T.steps.join('  ·  '))}</p>`), [['x', 'Continue']], { cls: 'one' });
          c.plan = await ask(says('<h2>Next is a question.</h2><p>Want a moment to plan, or start now?</p>'), [['plan', 'Plan for a moment'], ['dive', 'Start now']], { flash: true });
          if (c.plan === 'plan') await sleep(1500);
          c.hint = await ask(says(`<h2>${esc(s.problem.q)}</h2>`), [['hint', 'Show a hint first'], ['try', 'Let me try first']], { flash: true });
          if (c.hint === 'hint') await ask(says(`<p><b>Hint.</b> ${esc(T.hint)}</p>`), [['x', 'Got it']], { cls: 'one' });
          answer = (await mcq(s.problem.q, s.problem.options, false)).choice;
        } else if (s.part === 2) {
          await ask(says(`<h2>${esc(T.title)}</h2><p>${esc(T.intro)}</p><p>${esc(T.why)}</p>`), [['x', 'Continue']], { cls: 'one' });
          c.deeper = await ask(says('<p>There is an extra, deeper paragraph on this.</p>'), [['deeper', 'Read the deeper paragraph'], ['move', 'Move on']], { flash: true });
          if (c.deeper === 'deeper') await ask(says(`<p>${esc(T.extra)}</p>`), [['x', 'Continue']], { cls: 'one' });
          c.mode = await ask(says('<h2>Next question</h2><p>Do it as a timed challenge against other learners, or at your own pace?</p>'), [['challenge', 'Timed challenge'], ['solo', 'My own pace']], { flash: true });
          answer = (await mcq(s.problem.q, s.problem.options, false)).choice;
          c.bonus = await ask(says('<p>There is a bonus fact, not needed for anything.</p>'), [['bonus', 'Show me'], ['skip', 'Skip it']], { flash: true });
          if (c.bonus === 'bonus') await ask(says(`<p>${esc(T.extra)}</p>`), [['x', 'Continue']], { cls: 'one' });
          c.order = 'own';
        } else {
          await ask(says(`<h2>${esc(T.title)}</h2><p>${esc(T.intro)}</p>`), [['x', 'Continue']], { cls: 'one' });
          answer = (await mcq(s.problem.q, s.problem.options, false)).choice;
          const link = await askText(says(`<h2>Optional</h2><p>${esc(T.connect)}</p>`), 'Connect it', { long: true });
          c.connect = link.trim().split(/\s+/).filter(Boolean).length >= 4 ? 'wrote' : 'skip';
          feel = Number(await ask('<h2 class="q-prompt" data-look>How did that part feel?</h2>', [['1', 'Dull'], ['2', 'Meh'], ['3', 'Fine'], ['4', 'Good'], ['5', 'Great']], { flash: true }));
          mine = Number(await ask('<h2 class="q-prompt" data-look>Is this something you would do on your own?</h2>', [['1', 'No'], ['2', 'Not really'], ['3', 'Maybe'], ['4', 'Probably'], ['5', 'Yes']], { flash: true }));
          const unclear = await askText(says('<h2>Optional</h2><p>What is still unclear, if anything?</p>'), 'Unclear', { long: true });
          c.unclear = unclear.trim().split(/\s+/).filter(Boolean).length >= 4 ? 'wrote' : 'skip';
          c.more = await ask(says('<p>One more question, if you like.</p>'), [['more', 'Yes, one more'], ['done', 'I am done']], { flash: true });
        }
        return { answer, choices: c, feel, mine, readMs: Date.now() - t0 };
      },
      taste: async (s) => {
        const recall = async (qs) => { const a = []; for (const q of qs) a.push((await mcq(q.q, q.options, false)).choice); return a; };
        await readThenAnswer(s.first);
        const recallFirst = await recall(s.questions);
        await readThenAnswer(s.second);
        const recallSecond = await recall(s.questions);
        const prefer = await ask('<h2 class="q-prompt" data-look>Which did you prefer to learn from?</h2>', [['first', 'The first'], ['second', 'The second'], ['same', 'No difference']], { flash: true });
        return { recallFirst, recallSecond, prefer };
      },
    };

    return { R, ask };
  }

  window.ObTest = {
    /** Draw one baseline step and return what the learner did, for POST /api/onboarding/answer. */
    present(step, ctx) {
      const { R } = make(ctx);
      if (!R[step.kind]) return Promise.resolve(null); // a kind this page can't draw is skipped, as the API allows: it reads nothing
      return R[step.kind](step);
    },
    /** One style-quiz question: two ways of doing something, then how strongly. */
    choice(q, scale, ctx) {
      const { ask } = make(ctx);
      return ask(`<h2 class="q-prompt" data-look>${esc(q.prompt)}</h2>
        <div class="t-pairs"><div class="t-side"><b>First</b>${esc(q.low)}</div><div class="t-side"><b>Second</b>${esc(q.high)}</div></div>`,
      scale.map((s) => [String(s.value), s.label]), { flash: true, cls: 'grid' });
    },
    cancel() { runId += 1; },
  };
}());
