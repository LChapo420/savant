/* The test lab: every curriculum level type, grouped by how it compares with Duolingo. */
(async function () {
  const ES = window.ES;
  const { h, esc, icon } = ES;

  // How often each Level Type / Activity appears in the 10,169-level curriculum.
  const COUNTS = {
    'Lesson/Topic': 1503, 'Preview/Unit Intro': 721, 'Game/Quick Game': 721, 'Story Episode/Input Session': 721,
    'Speaking/Conversation Lab': 721, 'Quiz/Unit Check': 721, 'Story/Story': 635, 'Listening/Listening Lab': 627,
    'Dictation/Dictation': 506, 'Speaking/Topic': 382, 'Reading/Topic': 380, 'Speaking Game/Fluency Sprint': 378,
    'Test/Checkpoint': 242, 'Essay/Writing Lab': 229, 'Reading/Reading Block': 219, 'Listening/Topic': 184,
    'Pronunciation/Sound Refresh': 173, 'Live Speaking/Live Conversation': 170, 'Writing/Topic': 159,
    'Translating/Topic': 140, 'Translating/Mediation Task': 139, 'Pronunciation/Topic': 124, 'Writing/Writing Lab': 88,
    'Review Game/Topic': 63, 'Placement Test/Entry Check': 57, 'Project/Grade Project': 57, 'Final Test/Final': 57,
    'Game/Topic': 44, 'Real-World Mission/Mission': 8,
  };

  const MISSING = [
    ['Legendary challenge', 'Replay a finished node as a harder test (no hints, limited mistakes) to turn it gold.', 'Could reuse the lesson engine with hints off and a 3-mistake cap.'],
    ['Treasure chest node', 'A reward stop on the path that pays out gems or XP boosts.', 'A path feature rather than a level; belongs with the gems/shop work.'],
    ['Personalized practice (Practice Hub)', 'On-demand sessions from your mistakes, your words, speaking or listening.', 'Unit Checks and Sound Refresh cover scheduled review; on-demand practice would reuse the same engines.'],
    ['Adventures', 'Walk a character around a scene to complete a real-world task.', 'Needs a 2D scene engine; Conversation Lab covers the speaking goal.'],
    ['Video Call with Lily (Max)', 'Free-flowing live voice call with an AI character who remembers you.', 'Conversation Lab is the scripted-goal version; a free call could reuse its chat with streaming voice.'],
    ['Timed challenges & events (XP Ramp Up, Rapid Review)', 'Limited-time bonus rounds for extra XP.', 'The quick-game shell could host them.'],
    ['Duolingo Podcast / long-form audio', 'Long intermediate episodes with a narrator and transcript.', 'Listening Labs are short; longer episodes would reuse the same player.'],
    ['Jump here / test out of a unit', 'Skip ahead any time by passing a unit test.', 'Your Entry Check places by grade; per-unit test-out would reuse the exam engine.'],
  ];

  // theme
  const rootEl = document.documentElement;
  const setTheme = (m) => { if (m === 'system') rootEl.removeAttribute('data-theme'); else rootEl.setAttribute('data-theme', m); try { localStorage.setItem('es-theme', m); } catch { /* ignore */ } ES.$$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === m))); };
  ES.$$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  try { setTheme(localStorage.getItem('es-theme') || 'system'); } catch { setTheme('system'); }
  ES.$('#brand-char').innerHTML = ES.character('axo');

  // status
  ES.api.get('/api/es/status').then((s) => {
    ES.$('#status').innerHTML = [
      `<span class="lab-pill" data-on="${s.ai}">${icon(s.ai ? 'check' : 'x')} AI tutor ${s.ai ? 'on' : 'off (built-in checker)'}</span>`,
      `<span class="lab-pill" data-on="${s.voice}">${icon(s.voice ? 'check' : 'x')} Character voices ${s.voice ? 'on (Gemini, browser voice if over quota)' : 'off (browser voice)'}</span>`,
      `<span class="lab-pill" data-on="${s.asr}">${icon(s.asr ? 'check' : 'x')} Speech recognition ${s.asr ? 'on (MiMo)' : 'off (type instead)'}</span>`,
    ].join('');
  }).catch(() => { ES.$('#status').textContent = 'Server status unknown'; });

  let done = {};
  try { done = JSON.parse(localStorage.getItem('es-lab-done') || '{}'); } catch { done = {}; }

  const { levels } = await ES.api.get('/api/es/lab/levels');
  const groups = [
    ['yes', 'Duolingo has these', 'Rebuilt to match Duolingo\'s format and behaviour.'],
    ['partial', 'Duolingo has something close', 'Built from Duolingo\'s nearest equivalent, adapted to what your curriculum asks for.'],
    ['no', "Duolingo doesn't have these", 'New level types, designed to look and feel like the rest of the app.'],
  ];
  const holder = ES.$('#groups');
  for (const [has, title, sub] of groups) {
    const list = levels.filter((l) => l.duolingo.has === has);
    const sec = h('section', { class: 'lab-sec' }, `<h2 class="es-h3">${esc(title)} <span class="es-muted">(${list.length})</span></h2><p class="es-muted">${esc(sub)}</p>`);
    const grid = h('div', { class: 'lab-grid' });
    list.forEach((l) => {
      const key = `${l.csv.type}/${l.csv.activity}`;
      const card = h('article', { class: 'lab-card', 'data-has': has });
      card.innerHTML = `
        <div class="lab-card__top">
          <span class="lab-type">${esc(l.csv.type)} <span class="es-muted">/ ${esc(l.csv.activity)}</span></span>
          ${done[l.id] ? `<span class="lab-done" title="Played">${icon('check')}</span>` : ''}
        </div>
        <h3 class="lab-card__title">${esc(l.title)}</h3>
        <div class="lab-meta">Grade ${l.csv.grade} · Level ${l.csv.level} · ${esc(l.csv.unit)} · ${l.csv.minutes} min · ${esc(l.csv.skillFocus)}${COUNTS[key] ? ` · <b>${COUNTS[key].toLocaleString()}</b> in the CSV` : ''}</div>
        <p class="lab-what">${esc(l.csv.whatHappens)}</p>
        <div class="lab-duo"><span class="lab-pill" data-has="${has}">Duolingo</span> ${esc(l.duolingo.equivalent)}</div>
        <p class="es-muted es-small">${esc(l.duolingo.notes)}</p>`;
      const actions = h('div', { class: 'lab-actions' });
      const play = h('a', { class: 'es-btn es-btn--primary es-btn--sm', href: `/spanish/play?level=${encodeURIComponent(l.id)}` }, `${icon('star')} Play`);
      actions.append(play);
      if (l.engine === 'quick_game') {
        const quick = h('a', { class: 'es-btn es-btn--ghost es-btn--sm', href: `/spanish/play?level=${encodeURIComponent(l.id)}&t=60` }, '1-minute test');
        actions.append(quick);
      }
      actions.append(h('span', { class: 'lab-engine' }, `engine: ${esc(l.engine)}${l.game ? ` · ${esc(l.game)}` : ''}`));
      card.append(actions);
      grid.append(card);
    });
    sec.append(grid);
    holder.append(sec);
  }
  ES.$('#progress-note').textContent = `${Object.keys(done).filter((k) => levels.some((l) => l.id === k)).length} of ${levels.length} levels played in this browser.`;

  ES.$('#missing').innerHTML = MISSING.map(([t, d, n]) => `<div class="lab-card lab-card--flat"><h3 class="lab-card__title">${esc(t)}</h3><p>${esc(d)}</p><p class="es-muted es-small">${esc(n)}</p></div>`).join('');

  const byKey = {};
  levels.forEach((l) => { const k = `${l.csv.type}/${l.csv.activity}`; (byKey[k] = byKey[k] || []).push(l); });
  ES.$('#coverage').innerHTML = `<thead><tr><th>Level Type / Activity</th><th>In CSV</th><th>Duolingo</th><th>Playable demo</th></tr></thead><tbody>${
    Object.entries(COUNTS).map(([k, n]) => {
      const ls = byKey[k] || [];
      return `<tr><td>${esc(k.replace('/', ' / '))}</td><td>${n.toLocaleString()}</td><td>${ls[0] ? `<span class="lab-pill" data-has="${ls[0].duolingo.has}">${ls[0].duolingo.has}</span>` : ''}</td><td>${ls.map((l) => `<a href="/spanish/play?level=${encodeURIComponent(l.id)}">${esc(l.title)}</a>`).join('<br>') || '<b style="color:var(--es-danger-text)">missing</b>'}</td></tr>`;
    }).join('')
  }<tr class="lab-total"><td>Total</td><td>${Object.values(COUNTS).reduce((a, b) => a + b, 0).toLocaleString()}</td><td></td><td>${levels.length} demo levels</td></tr></tbody>`;
})();
