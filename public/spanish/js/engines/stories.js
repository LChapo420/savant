/* Story-like engines: story (Stories + input sessions), listening_lab
 * (DuoRadio-style), unit_intro (preview), dictation. */
(function () {
  const ES = window.ES;
  const { h, esc, icon, ui, sfx } = ES;
  const engines = (ES.engines = ES.engines || {});
  const quit = () => ES.flow.exit();

  // Render one question inline and resolve with its graded result.
  function askInline(frame, holder, item, levelId, { exam = false } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const ctx = {
        levelId,
        ready: (on) => frame.footer.ready(on),
        selfResult: (res) => finish(res),
        mistake: () => {},
      };
      const ex = ES.ex[item.kind](item, ctx);
      const box = h('div', { class: 'es-story__q' });
      box.append(h('div', { class: 'es-story__qhead' }, esc(ex.header)), ex.el);
      holder.append(box);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ui.onKeys(ex.keys || null);
      function finish(res) {
        if (done) return; done = true;
        ui.onKeys(null);
        ex.showResult && ex.showResult(res);
        box.dataset.done = 'true';  // an answered question stays visible but inert
        if (exam) { resolve(res); return; }
        frame.footer.result({ correct: res.correct, note: res.note, solution: res.correct && !res.note ? '' : res.solution, extraHtml: res.extraHtml || '', onContinue: () => resolve(res), report: false });
      }
      frame.footer.idle({
        canCheck: false,
        skip: ex.skip ? { label: ex.skip.label, onClick: () => { if (ex.skip.kind === 'speak') ES.setSpeakingOff(); done = true; box.dataset.done = 'true'; resolve({ correct: true, skipped: ex.skip.kind }); } } : null,
        onCheck: async () => {
          if (done || !ex.ready()) return;
          frame.footer.busy(true);
          const res = await ES.session.check(levelId, item, ex.response());
          frame.footer.busy(false);
          finish(res);
        },
      });
      if (ex.self) ES.$('.es-footer__inner .es-btn--success', frame.root).style.visibility = 'hidden';
    });
  }
  ES.askInline = askInline;

  // A line in the story transcript: avatar + bubble, tap the bubble for its meaning.
  function storyLine(line, slow) {
    const narrator = line.who === 'narrator';
    const row = h('div', { class: `es-story__line${narrator ? ' es-story__line--narr' : ''}` });
    if (line.art) row.append(h('div', { class: 'es-story__art' }, ES.art(line.art)));
    if (!narrator) row.append(h('div', { class: 'es-story__avatar' }, ES.character(line.who)));
    const b = h('div', { class: narrator ? 'es-story__narr' : 'es-bubble es-story__bubble' });
    const play = h('button', { class: 'es-iconbtn es-bubble__play', 'aria-label': 'Play line' }, icon('speaker'));
    const text = h('span', { lang: 'es', class: 'es-story__text', tabindex: '0', role: 'button', 'aria-label': `${line.es}. Tap for the meaning.` }, esc(line.es));
    const en = h('div', { class: 'es-story__en', hidden: true }, esc(line.en || ''));
    text.addEventListener('click', () => { en.hidden = !en.hidden; });
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') en.hidden = !en.hidden; });
    b.append(play, text, en);
    row.append(b);
    const charEl = row.querySelector('.es-story__avatar .es-char');
    const say = () => ES.audio.say(line.es, { voice: narrator ? 'narrator' : line.who, char: charEl, slow });
    play.addEventListener('click', say);
    row.say = say;
    return row;
  }

  engines.story = async (level, root) => {
    const s = level.story;
    ES.audio.warm(s.lines.filter((l) => l.es).map((l) => ({ text: l.es, voice: l.who === 'narrator' ? 'narrator' : l.who })));
    await ES.flow.intro(root, {
      title: s.title, kicker: level.csv.activity === 'Input Session' ? `Input session · pass ${level.passPct}% on the picture checks` : 'Story',
      body: `<span class="es-story__cover">${ES.art(s.art)}</span>`, char: null, start: 'Start story',
    });
    const frame = ui.frame(root, { onQuit: quit });
    const t0 = Date.now();
    const stage = h('div', { class: 'es-story' });
    stage.append(h('h1', { class: 'es-h3 es-story__title' }, esc(s.title)));
    frame.setBody(stage);
    const steps = s.lines.length + (s.sayAloud ? s.sayAloud.length : 0);
    let step = 0; let right = 0; let asked = 0;
    for (const line of s.lines) {
      step++; frame.progress(step / steps);
      if (line.q) {
        const res = await askInline(frame, stage, line.q, level.id);
        asked++; if (res.correct) right++;
        continue;
      }
      const row = storyLine(line, !!level.slow);
      stage.append(row);
      row.scrollIntoView({ behavior: 'smooth', block: 'end' });
      row.classList.add('es-story__line--in');
      await new Promise((resolve) => {
        frame.footer.continueOnly({ label: 'Continue', onClick: () => { ES.audio.stop(); resolve(); }, tone: 'es-btn--secondary' });
        row.say();
      });
    }
    let said = 0;
    if (s.sayAloud) {
      stage.append(h('div', { class: 'es-story__divider' }, 'Now say two captions aloud'));
      for (const it of s.sayAloud) {
        step++; frame.progress(step / steps);
        if (ES.speakingOff()) continue;
        const res = await askInline(frame, stage, it, level.id);
        if (res.correct && !res.skipped) said++;
      }
    }
    const pct = asked ? Math.round((right / asked) * 100) : 100;
    const pass = !level.passPct || pct >= level.passPct;
    await ui.complete(root, {
      title: pass ? 'Story complete!' : 'Almost there!', xp: pass ? 14 : 5, accuracy: pct, timeMs: Date.now() - t0,
      accuracyLabel: level.passPct ? (pass ? 'Passed' : `Need ${level.passPct}%`) : undefined,
      extraHtml: level.passPct ? `<p>${right} of ${asked} picture checks right — ${pass ? 'this episode counts as understood.' : `the episode needs ${level.passPct}%. Listen again and retry.`}</p>` : (s.sayAloud ? `<p>You said ${said} of ${s.sayAloud.length} captions aloud.</p>` : ''),
    });
    ES.flow.back(root, { level, title: !level.passPct ? 'Story finished' : pass ? 'Episode understood' : 'Try the episode again', html: `<p>Comprehension ${pct}%${level.passPct ? ` (pass ${level.passPct}%)` : ''}.</p>` });
  };

  // ── DuoRadio-style listening lab ────────────────────────────────────
  engines.listening_lab = async (level, root) => {
    ES.audio.warm(level.clips.flatMap((c) => c.lines.map((l) => ({ text: l.es, voice: l.who }))));
    await ES.flow.intro(root, {
      title: level.showTitle, kicker: `Listening Lab · hosted by ${ES.cast[level.host].name}`,
      body: 'Short clips, audio first. Listen, answer, then repeat after the speakers. The transcript stays hidden unless you ask for it.',
      char: level.host, start: 'Tune in',
    });
    const frame = ui.frame(root, { onQuit: quit });
    const t0 = Date.now();
    const steps = level.clips.length * 2 + level.repeat.length;
    let step = 0; let right = 0;
    for (const [n, clip] of level.clips.entries()) {
      step++; frame.progress(step / steps);
      const box = h('div', { class: 'es-radio' });
      box.append(h('div', { class: 'es-label es-muted' }, `Clip ${n + 1} of ${level.clips.length}`));
      box.append(h('div', { class: 'es-radio__scene' }, `<div class="es-radio__art">${ES.art(clip.art)}</div>`));
      const cast = h('div', { class: 'es-radio__cast' });
      const who = [...new Set(clip.lines.map((l) => l.who))];
      const avatars = Object.fromEntries(who.map((w) => { const a = h('div', { class: 'es-radio__who' }, `${ES.character(w)}<span>${esc(ES.cast[w].name)}</span>`); cast.append(a); return [w, a]; }));
      box.append(cast);
      const transcript = h('div', { class: 'es-radio__transcript', hidden: true }, clip.lines.map((l) => `<p><b>${esc(ES.cast[l.who].name)}:</b> <span lang="es">${esc(l.es)}</span></p>`).join(''));
      const tbtn = h('button', { class: 'es-btn es-btn--plain es-btn--sm' }, 'Show transcript');
      tbtn.addEventListener('click', () => { transcript.hidden = !transcript.hidden; tbtn.textContent = transcript.hidden ? 'Show transcript' : 'Hide transcript'; });
      const replay = h('button', { class: 'es-btn es-btn--ghost es-btn--sm' }, `${icon('redo')} Replay`);
      box.append(h('div', { class: 'es-row es-row--center' }), transcript);
      box.querySelector('.es-row').append(replay, tbtn);
      frame.setBody(box);
      const playClip = async () => {
        replay.disabled = true;
        for (const l of clip.lines) {
          Object.values(avatars).forEach((a) => a.removeAttribute('data-on'));
          avatars[l.who].dataset.on = 'true';
          await ES.audio.say(l.es, { voice: l.who, char: avatars[l.who].querySelector('.es-char'), slow: !!level.slow });
          await ES.wait(250);
        }
        Object.values(avatars).forEach((a) => a.removeAttribute('data-on'));
        replay.disabled = false;
      };
      replay.addEventListener('click', playClip);
      frame.footer.continueOnly({ label: 'Answer the question', tone: 'es-btn--secondary', onClick: () => {} }).disabled = true;
      await playClip();
      await new Promise((resolve) => { frame.footer.continueOnly({ label: 'Answer the question', tone: 'es-btn--secondary', onClick: resolve }); });
      step++; frame.progress(step / steps);
      const qbox = h('div', { class: 'es-ex' }); box.append(qbox);
      const res = await askInline(frame, qbox, clip.q, level.id);
      if (res.correct) right++;
    }
    let said = 0;
    if (!ES.speakingOff()) {
      const holder = h('div', { class: 'es-ex' }, '<h2 class="es-h3">Repeat after the speakers</h2>');
      frame.setBody(holder);
      for (const it of level.repeat) {
        step++; frame.progress(step / steps);
        const res = await askInline(frame, holder, it, level.id);
        if (res.correct && !res.skipped) said++;
      }
    }
    const pct = Math.round((right / level.clips.length) * 100);
    await ui.complete(root, { title: 'Episode complete!', xp: 12, accuracy: pct, timeMs: Date.now() - t0, extraHtml: `<p>${right} of ${level.clips.length} questions · repeated ${said} of ${level.repeat.length} lines</p>` });
    ES.flow.back(root, { level, title: 'Listening lab finished', html: `<p>Listening ${pct}%.</p>` });
  };

  // ── unit intro (preview) ────────────────────────────────────────────
  engines.unit_intro = async (level, root) => {
    ES.audio.warm([...level.phrases.map((p) => ({ text: p.es, voice: 'mara' })), ...level.clip.map((l) => ({ text: l.es, voice: l.who }))]);
    await ES.flow.intro(root, {
      title: level.csv.unit, kicker: 'Unit preview · 2 minutes', char: 'axo',
      body: `<b>Goal:</b> ${esc(level.goal)}`,
      bullets: level.phrases.map((p) => `<span lang="es"><b>${esc(p.es)}</b></span>`),
      start: 'Watch the clip',
    });
    const frame = ui.frame(root, { onQuit: quit });
    const steps = 2 + level.phrases.length + level.guesses.length;
    let step = 1; frame.progress(step / steps);
    // 1. the 30-second clip: two characters on stage, bubbles as they speak
    const stage = h('div', { class: 'es-stage' });
    const who = [...new Set(level.clip.map((l) => l.who))];
    const actors = Object.fromEntries(who.map((w, i) => { const a = h('div', { class: `es-stage__actor es-stage__actor--${i ? 'r' : 'l'}` }, `<div class="es-stage__bubble" hidden></div>${ES.character(w)}`); stage.append(a); return [w, a]; }));
    frame.setBody(ui.header('Watch: guess what they mean'), stage);
    let clipRun = 0;  // bumping this stops a clip that is playing
    const playClip = async () => {
      const run = ++clipRun;
      for (const l of level.clip) {
        if (run !== clipRun) return;
        Object.values(actors).forEach((a) => { a.querySelector('.es-stage__bubble').hidden = true; });
        const a = actors[l.who]; const bub = a.querySelector('.es-stage__bubble');
        bub.textContent = l.es; bub.hidden = false;
        await ES.audio.say(l.es, { voice: l.who, char: a.querySelector('.es-char'), slow: true });
        await ES.wait(300);
      }
    };
    const replay = h('button', { class: 'es-btn es-btn--ghost' }, `${icon('redo')} Replay`);
    replay.addEventListener('click', playClip);
    // While the clip plays the main button waits; "Skip clip" stops it early.
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; clipRun++; ES.audio.stop(); resolve(); };
      const skipClip = h('button', { class: 'es-btn es-btn--ghost' }, 'Skip clip');
      skipClip.addEventListener('click', finish);
      frame.footer.continueOnly({ label: 'Repeat the phrases', onClick: () => {}, left: skipClip }).disabled = true;
      playClip().then(finish);
    });
    await new Promise((resolve) => frame.footer.continueOnly({ label: 'Repeat the phrases', onClick: resolve, left: replay }));
    // 2. repeat each key phrase
    for (const p of level.phrases) {
      step++; frame.progress(step / steps);
      if (ES.speakingOff()) continue;
      const holder = h('div', { class: 'es-ex' });
      frame.setBody(ui.header('Repeat after Mara'), holder);
      await askInline(frame, holder, { id: `rep-${p.es}`, kind: 'speak_local', es: p.es, en: p.en, speaker: 'mara' }, level.id);
    }
    // 3. guess the meaning
    const r = await ES.session.run(frame, { levelId: level.id, items: level.guesses, practice: true, total: steps, encourage: false });
    if (r.quit) return quit();
    await ui.complete(root, { title: 'Preview done!', xp: 5, accuracy: r.accuracy, extraHtml: '<p>You are ready for the lessons in this unit.</p>' });
    ES.flow.back(root, { level, title: 'Unit preview finished', html: `<p>Guesses ${r.accuracy}% right. The unit's lessons teach these properly next.</p>` });
  };

  // A speak challenge graded in the browser (phrases with no server item).
  ES.ex.speak_local = (item, ctx) => {
    const el = h('div', { class: 'es-ex' });
    el.append(ui.speaker({ char: item.speaker || 'mara', text: item.es }));
    if (item.en) el.append(h('p', { class: 'es-muted es-speak__en' }, esc(item.en)));
    const mic = ui.mic({
      onResult: ({ transcript }) => {
        const s = ES.grade.speech(transcript, item.es);
        ctx.selfResult({ correct: s.pass, score: s.score, solution: item.es, extraHtml: `<div class="es-verdict__said">You said: “${esc(transcript || '…')}” · ${s.score}%</div>` });
      },
    });
    el.append(mic);
    return { header: 'Say it', el, self: true, skip: { label: "Can't speak now", kind: 'speak' } };
  };

  // ── dictation ───────────────────────────────────────────────────────
  engines.dictation = async (level, root) => {
    ES.audio.warm(level.lines.map((l) => ({ text: l.es, voice: l.who })));
    const frame = ui.frame(root, { onQuit: quit });
    const t0 = Date.now();
    const log = { sound: [], spelling: [], accent: [], missing: [] };
    let perfect = 0;
    for (const [n, line] of level.lines.entries()) {
      frame.progress(n / level.lines.length);
      const body = h('div', { class: 'es-ex' });
      body.append(h('div', { class: 'es-label es-muted' }, `Sentence ${n + 1} of ${level.lines.length}`));
      body.append(h('div', { class: 'es-dict__who' }, `${ES.character(line.who)}<span>${esc(ES.cast[line.who].name)}</span>`));
      body.append(ui.audioButtons(line.es, line.who));
      const box = ES.textBox({ lang: 'es', placeholder: 'Escribe lo que oyes…', onChange: () => frame.footer.ready(box.text().trim().length > 0) });
      const out = h('div', { class: 'es-dict__out' });
      body.append(box, out);
      frame.setBody(ui.header('Write what you hear'), body);
      await new Promise((resolve) => {
        frame.footer.idle({
          canCheck: false,
          onCheck: async () => {
            frame.footer.busy(true);
            const res = await ES.api.post('/api/es/dictation/check', { levelId: level.id, lineId: line.id, text: box.text() });
            box.lock(res);
            out.innerHTML = ui.diff(res.tokens);
            res.tokens.forEach((t) => { if (log[t.tag]) log[t.tag].push(t.word); });
            if (res.correct) perfect++;
            const tags = ['sound', 'spelling', 'accent', 'missing'].map((k) => [k, res.tokens.filter((t) => t.tag === k).length]).filter(([, c]) => c);
            frame.footer.result({
              correct: res.correct, solution: res.solution,
              title: res.correct ? (res.tokens.some((t) => t.tag === 'accent') ? 'Pay attention to the accents.' : ui.praise()) : `${res.score}% — correct sentence:`,
              extraHtml: tags.length ? `<div class="es-verdict__tags">${tags.map(([k, c]) => `<span class="es-chip" data-tag="${k}">${c} ${k}</span>`).join(' ')}</div>` : '',
              onContinue: resolve,
            });
          },
        });
      });
    }
    const rows = Object.entries(log).filter(([, v]) => v.length);
    await ui.complete(root, { title: 'Dictation complete!', xp: 8, accuracy: Math.round((perfect / level.lines.length) * 100), timeMs: Date.now() - t0 });
    ES.flow.back(root, {
      level, title: 'Added to your error log',
      html: rows.length ? `<div class="es-card es-left">${rows.map(([k, v]) => `<div class="es-rubric__row"><span class="es-chip" data-tag="${k}">${k}</span><span lang="es">${esc(v.join(', '))}</span></div>`).join('')}<p class="es-muted">Sound errors feed Sound Refresh; spelling and accent errors feed the review queue.</p></div>` : '<p>No errors to log — perfect dictation!</p>',
    });
  };
})();
