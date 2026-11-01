/* The three two-minute games of the Extras page (services/boosters.js games): memory span, reaction speed, sustained attention.
 * Each runs entirely in the browser and hands its summary to onDone({ ... }); the server scores it against age norms. They are
 * plain buttons and live text, usable by keyboard (arrow keys, digits, space) and at phone width. `T` holds every timing so a test can speed them up. */
(function () {
  const T = { digitMs: 800, digitGapMs: 250, speedTrials: 24, speedMinWait: 600, speedMaxWait: 1400, attentionItems: 90, attentionMs: 1000, attentionWindow: 900, ...(window.BOOSTER_TIMING || {}) };
  const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Shared frame: title, live status for a screen reader, a stop button. */
  function frame(host, title, hint) {
    host.innerHTML = `
      <div class="card game-card" data-game>
        <p class="lesson-meta">Optional · about 2 minutes</p>
        <h2 class="game-title">${esc(title)}</h2>
        <p class="small muted" id="game-hint">${esc(hint)}</p>
        <div id="game-stage" class="game-stage" aria-live="polite" tabindex="-1"></div>
        <div class="row-wrap"><button class="btn btn-ghost" id="game-stop" type="button">Stop</button></div>
      </div>`;
    const state = { stopped: false };
    document.getElementById('game-stop').addEventListener('click', () => { state.stopped = true; });
    return { stage: document.getElementById('game-stage'), state };
  }

  /** Digit span: strings of growing length, shown one digit at a time; two misses in a row at one length end it. */
  async function span(host, onDone) {
    const { stage, state } = frame(host, 'Memory span', 'Watch the digits, then type them back in the same order.');
    let len = 3; let best = 0; let trials = 0; let right = 0; let misses = 0;
    while (!state.stopped && len <= 12 && trials < 14) {
      const digits = Array.from({ length: len }, () => rnd(0, 9));
      stage.innerHTML = '<div class="game-big" aria-hidden="true">Get ready</div>';
      await wait(700);
      for (const d of digits) {
        stage.innerHTML = `<div class="game-big" role="img" aria-label="digit ${d}">${d}</div>`;
        await wait(T.digitMs);
        stage.innerHTML = '<div class="game-big" aria-hidden="true">&nbsp;</div>';
        await wait(T.digitGapMs);
        if (state.stopped) break;
      }
      if (state.stopped) break;
      const typed = await new Promise((resolve) => {
        stage.innerHTML = `<form class="game-answer"><label for="span-in">Type the ${len} digits</label><input id="span-in" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxlength="${len + 2}"><button class="btn btn-primary" type="submit">Check</button></form>`;
        const input = document.getElementById('span-in');
        input.focus();
        stage.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); resolve(input.value.replace(/\D/g, '')); });
        document.getElementById('game-stop').addEventListener('click', () => resolve(null), { once: true });
      });
      if (typed === null) break;
      trials += 1;
      if (typed === digits.join('')) { right += 1; best = Math.max(best, len); len += 1; misses = 0; } else { misses += 1; if (misses >= 2) break; }
    }
    onDone({ max_span: best || 2, trials: Math.max(trials, 1), correct: right });
  }

  /** Reaction speed: an arrow appears after a random wait; tap the side it points to. */
  async function speed(host, onDone) {
    const { stage, state } = frame(host, 'Reaction speed', 'When the arrow appears, tap the side it points to (or press the left or right arrow key) as fast as you can.');
    const times = []; let ok = 0; let trials = 0;
    stage.innerHTML = `<div class="game-big" id="arrow" aria-live="assertive">&nbsp;</div>
      <div class="game-pad"><button class="btn btn-lg" data-side="left" type="button" aria-label="Left">&larr; Left</button><button class="btn btn-lg" data-side="right" type="button" aria-label="Right">Right &rarr;</button></div>`;
    const arrow = document.getElementById('arrow');
    while (!state.stopped && trials < T.speedTrials) {
      arrow.textContent = ' ';
      await wait(rnd(T.speedMinWait, T.speedMaxWait));
      if (state.stopped) break;
      const side = Math.random() < 0.5 ? 'left' : 'right';
      arrow.textContent = side === 'left' ? '←' : '→';
      arrow.setAttribute('aria-label', `arrow pointing ${side}`);
      const shown = performance.now();
      const got = await new Promise((resolve) => {
        const done = (v) => { stage.removeEventListener('click', click); window.removeEventListener('keydown', key); resolve(v); };
        const click = (e) => { const b = e.target.closest('[data-side]'); if (b) done(b.dataset.side); };
        const key = (e) => { if (e.key === 'ArrowLeft') done('left'); else if (e.key === 'ArrowRight') done('right'); };
        stage.addEventListener('click', click); window.addEventListener('keydown', key);
        document.getElementById('game-stop').addEventListener('click', () => done(null), { once: true });
      });
      if (got === null) break;
      trials += 1;
      if (got === side) { ok += 1; times.push(performance.now() - shown); }
    }
    onDone({ median_rt_ms: Math.round(median(times)), accuracy: trials ? ok / trials : 0, trials });
  }

  /** Sustained attention: a stream of digits, one a second; tap only for the rare 0. */
  async function attention(host, onDone) {
    const { stage, state } = frame(host, 'Sustained attention', 'Digits appear one at a time. Tap the big button (or press the space bar) only when you see a 0. Ignore every other digit.');
    stage.innerHTML = '<div class="game-big" id="sym" role="img" aria-label="waiting">&nbsp;</div><div class="game-pad"><button class="btn btn-primary btn-lg btn-block" id="hit" type="button">It is a 0</button></div>';
    const sym = document.getElementById('sym');
    let current = null; let hitThis = false;
    const res = { targets: 0, nontargets: 0, hits: 0, false_alarms: 0, first_half_hits: 0, second_half_hits: 0 };
    const press = () => { if (current) hitThis = true; };
    document.getElementById('hit').addEventListener('click', press);
    const key = (e) => { if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); press(); } };
    window.addEventListener('keydown', key);
    const plan = Array.from({ length: T.attentionItems }, () => (Math.random() < 0.12 ? 0 : rnd(1, 9)));
    for (let i = 0; i < plan.length && !state.stopped; i++) {
      current = { digit: plan[i], i };
      hitThis = false;
      sym.textContent = String(plan[i]);
      sym.setAttribute('aria-label', `digit ${plan[i]}`);
      await wait(T.attentionMs);
      if (plan[i] === 0) { res.targets += 1; if (hitThis) { res.hits += 1; (i < plan.length / 2 ? res.first_half_hits++ : res.second_half_hits++); } } else { res.nontargets += 1; if (hitThis) res.false_alarms += 1; }
    }
    window.removeEventListener('keydown', key);
    onDone(res);
  }

  window.BoosterGames = { span, speed, attention, T };
}());
