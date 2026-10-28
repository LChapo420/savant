/* Engines built on the lesson session: lesson, unit_check, exam
 * (checkpoint + final), entry_check (adaptive placement). */
(function () {
  const ES = window.ES;
  const { h, esc, icon, ui } = ES;
  const engines = (ES.engines = ES.engines || {});

  // Pre-render every spoken line of a set of items in the background.
  ES.warmItems = (items) => {
    const lines = [];
    const add = (text, voice) => text && lines.push({ text, voice });
    (items || []).forEach((it) => {
      if (!it) return;
      if (['select_meaning', 'speak', 'listen_choose', 'listen_meaning', 'listen_image', 'type_heard', 'tap_heard', 'record_compare'].includes(it.kind)) add(it.es, it.speaker || it.voice || 'narrator');
      if (it.kind === 'translate' && it.from === 'es') add(it.text, it.speaker || 'mara');
      if (it.kind === 'complete_chat') it.lines.forEach((l) => add(l.es, l.who));
    });
    ES.audio.warm(lines);
  };

  // The closing screen every engine ends on. A page that hosts the engines
  // (the main path's player, public/spanish/js/learn.js) sets ES.flow.host to
  // take over leaving and finishing; the test lab leaves it unset.
  ES.flow = {
    host: null,
    exit() {
      if (ES.flow.host && ES.flow.host.exit) return ES.flow.host.exit();
      location.href = '/spanish/lab';
      return undefined;
    },
    back(root, { title = 'Level finished', html = '', level }) {
      if (ES.flow.host && ES.flow.host.back) return ES.flow.host.back(root, { title, html, level });
      root.innerHTML = '';
      const page = h('div', { class: 'es-endscreen es-endscreen--summary' }, `<div class="es-endscreen__char">${ES.character('axo')}</div><h1 class="es-h2">${esc(title)}</h1><div class="es-endscreen__extra">${html}</div>`);
      const footer = h('footer', { class: 'es-footer' });
      const wrap = h('div', { class: 'es-lesson' }); wrap.append(h('div'), page, footer); root.append(wrap);
      const again = h('button', { class: 'es-btn es-btn--ghost' }, 'Play again');
      again.addEventListener('click', () => location.reload());
      ui.footer(footer).continueOnly({ label: 'Back to the test lab', onClick: () => { location.href = '/spanish/lab'; }, left: again });
      try {
        const done = JSON.parse(localStorage.getItem('es-lab-done') || '{}');
        done[level.id] = Date.now(); localStorage.setItem('es-lab-done', JSON.stringify(done));
      } catch { /* ignore */ }
    },
    intro(root, { title, kicker, body = '', char = 'axo', start = 'Start', bullets = [] }) {
      return new Promise((resolve) => {
        root.innerHTML = '';
        const page = h('div', { class: 'es-endscreen es-intro' }, `
          ${char ? `<div class="es-endscreen__char">${ES.character(char)}</div>` : ''}
          ${kicker ? `<div class="es-label es-muted">${esc(kicker)}</div>` : ''}
          <h1 class="es-h2">${esc(title)}</h1>
          ${body ? `<p class="es-intro__body">${body}</p>` : ''}
          ${bullets.length ? `<ul class="es-intro__list">${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>` : ''}`);
        const footer = h('footer', { class: 'es-footer' });
        const wrap = h('div', { class: 'es-lesson' }); wrap.append(h('div'), page, footer); root.append(wrap);
        ui.footer(footer).continueOnly({ label: start, onClick: resolve, tone: 'es-btn--primary' });
      });
    },
    streakDays() {
      try {
        const today = new Date().toDateString();
        const s = JSON.parse(localStorage.getItem('es-lab-streak') || '{"days":0,"last":""}');
        if (s.last !== today) { const y = new Date(Date.now() - 864e5).toDateString(); s.days = s.last === y ? s.days + 1 : 1; s.last = today; localStorage.setItem('es-lab-streak', JSON.stringify(s)); }
        return s.days;
      } catch { return 1; }
    },
  };

  const quit = () => ES.flow.exit();

  // ── lesson (and practice / review game) ─────────────────────────────
  engines.lesson = async (level, root) => {
    ES.warmItems(level.items);
    const frame = ui.frame(root, { hearts: level.practice ? null : 5, onQuit: quit });
    if (level.intro) await ui.interstitial(frame, { char: level.intro.speaker, text: level.intro.es, voice: level.intro.speaker, label: "Let's go" });
    const r = await ES.session.run(frame, { levelId: level.id, items: level.items, practice: !!level.practice });
    if (r.quit) return quit();
    await ui.complete(root, { title: level.practice ? 'Practice complete!' : 'Lesson complete!', xp: r.xp, accuracy: r.accuracy, timeMs: r.timeMs });
    // A hosting page shows the account's real streak once the server has counted the day.
    if (!ES.flow.host) await ui.streak(root, { days: ES.flow.streakDays() });
    ES.flow.back(root, { level, title: 'Level finished', html: `<p>${r.results.length} challenges · ${r.accuracy}% first-try accuracy · ${r.xp} XP</p>` });
  };

  // ── unit check: ungated, assembled from due reviews + weak spots ────
  engines.unit_check = async (level, root) => {
    ES.warmItems(level.items);
    await ES.flow.intro(root, {
      title: level.title, kicker: 'Unit Check · never blocks progress',
      body: 'A quick check built for you from your spaced-review queue: items that are due today and items from your weak spots.',
      bullets: [`${level.items.filter((i) => i.why === 'due').length} due reviews`, `${level.items.filter((i) => i.why === 'weak').length} weak-spot items (${esc(level.learner.weak.join(', '))})`, `${level.items.length} items in total, no hearts lost`],
    });
    const frame = ui.frame(root, { hearts: null, onQuit: quit });
    const r = await ES.session.run(frame, { levelId: level.id, items: level.items, practice: true, retryMistakes: false, encourage: false });
    if (r.quit) return quit();
    const tags = {};
    r.results.forEach((x) => (x.item.tags || []).forEach((t) => { tags[t] = tags[t] || { right: 0, wrong: 0 }; tags[t][x.correct ? 'right' : 'wrong']++; }));
    const weakNow = Object.entries(tags).filter(([, v]) => v.wrong > 0).map(([t]) => t);
    const fixed = level.learner.weak.filter((t) => tags[t] && tags[t].wrong === 0);
    await ui.complete(root, { title: 'Unit check done!', xp: r.xp, accuracy: r.accuracy, timeMs: r.timeMs });
    ES.flow.back(root, {
      level, title: 'Your weak-spot list',
      html: `<div class="es-card es-left">
        <p><b>Still weak:</b> ${weakNow.length ? weakNow.map((t) => `<span class="es-chip es-chip--bad">${esc(t)}</span>`).join(' ') : '<span class="es-muted">nothing — nice!</span>'}</p>
        <p><b>Cleared today:</b> ${fixed.length ? fixed.map((t) => `<span class="es-chip es-chip--good">${esc(t)}</span>`).join(' ') : '<span class="es-muted">none yet</span>'}</p>
        <p class="es-muted">Missed items go back into spaced review; this check never blocks your path.</p></div>`,
    });
  };

  // ── exams: checkpoint + final ───────────────────────────────────────
  async function speakSample(root, level, task) {
    return new Promise((resolve) => {
      const frame = ui.frame(root, { onQuit: quit });
      frame.progress(0);
      const body = h('div', { class: 'es-ex' });
      body.append(ui.header(task.brief), h('p', { class: 'es-muted' }, `Speak for about ${task.seconds} seconds. Include: ${task.mustSay.map((m) => `<b lang="es">${esc(m)}</b>`).join(', ')}.`));
      const out = h('div', { class: 'es-sample-out', 'aria-live': 'polite' });
      const mic = ui.mic({
        label: 'Tap to record', maxMs: task.seconds * 1000 + 8000, autoStopMs: 3500,
        onResult: async ({ transcript, durationMs, pauseMs }) => {
          out.innerHTML = '<p class="es-muted">Scoring…</p>';
          const rubric = await ES.api.post('/api/es/recording/score', { levelId: level.id, taskId: task.id, transcript, durationMs, pauseMs }).catch(() => null);
          out.innerHTML = `<div class="es-said"><div class="es-said__label">Transcript</div><div class="es-said__text" lang="es">${esc(transcript || '…')}</div><div class="es-said__hint">${rubric ? `${rubric.wpm} words per minute · ${Math.round(pauseMs / 1000)} s of long pauses` : ''}</div></div>`;
          frame.footer.continueOnly({ label: 'Submit sample', onClick: () => resolve({ score: rubric ? rubric.overall : 0, rubric, transcript }) });
        },
      });
      body.append(mic, out);
      frame.setBody(body);
      frame.footer.continueOnly({ label: "Can't speak now (scores 0)", tone: 'es-btn--ghost', onClick: () => resolve({ score: 0, skipped: true }) });
    });
  }

  async function writeSample(root, level, task) {
    return new Promise((resolve) => {
      const frame = ui.frame(root, { onQuit: quit });
      frame.progress(0);
      const w = task.writing;
      const body = h('div', { class: 'es-ex' });
      body.append(ui.header('Writing sample'), h('p', {}, `${esc(w.task)} <span class="es-muted">(${w.minWords}–${w.maxWords} words, for ${esc(w.reader)})</span>`));
      const box = ES.textBox({ lang: 'es', placeholder: 'Escribe aquí…', onChange: () => { count.textContent = `${wc()} words`; frame.footer.ready(wc() > 0); } });
      const count = h('div', { class: 'es-muted es-wordcount' }, '0 words');
      const wc = () => box.text().trim().split(/\s+/).filter(Boolean).length;
      body.append(box, count);
      frame.setBody(body);
      frame.footer.idle({
        checkLabel: 'Submit', canCheck: false,
        onCheck: async () => {
          frame.footer.busy(true);
          const r = await ES.api.post('/api/es/writing/score', { levelId: level.id, taskId: task.id, text: box.text() }).catch(() => null);
          resolve({ score: r ? r.rubric.overall : 0, rubric: r && r.rubric, text: box.text() });
        },
      });
    });
  }

  engines.exam = async (level, root) => {
    const sections = level.sections;
    ES.warmItems(sections.flatMap((s) => s.items || []));
    await ES.flow.intro(root, {
      title: level.title, kicker: `${level.csv.type} · pass mark ${level.passPct}%`,
      body: 'No hints and no feedback until the end. Below the pass mark you get targeted repair on what you missed, then a free retake.',
      bullets: sections.map((s) => `${esc(s.title)} — ${s.weight}%`),
      start: 'Start test',
    });
    const report = [];
    for (const sec of sections) {
      if (sec.items) {
        const frame = ui.frame(root, { onQuit: quit });
        const r = await ES.session.run(frame, { levelId: level.id, items: sec.items, exam: true });
        if (r.quit) return quit();
        report.push({ sec, score: r.accuracy, results: r.results });
      } else if (sec.task.kind === 'speak_sample') {
        report.push({ sec, ...(await speakSample(root, level, sec.task)) });
      } else {
        report.push({ sec, ...(await writeSample(root, level, sec.task)) });
      }
    }
    const totalW = report.reduce((n, r) => n + r.sec.weight, 0);
    const total = Math.round(report.reduce((n, r) => n + r.score * r.sec.weight, 0) / totalW);
    const passed = total >= level.passPct;
    const missed = report.flatMap((r) => (r.results || []).filter((x) => !x.correct).map((x) => x.item));
    ES.sfx.play(passed ? 'complete' : 'wrong');
    root.innerHTML = '';
    const page = h('div', { class: 'es-endscreen es-exam-result' });
    page.innerHTML = `
      <div class="es-endscreen__char">${ES.character(passed ? 'axo' : 'mara')}</div>
      <h1 class="es-h2">${passed ? '¡Aprobado! You passed.' : 'Not yet — let\'s repair and retake'}</h1>
      <div class="es-gauge" data-pass="${passed}"><span class="es-display">${total}%</span><span class="es-muted">pass mark ${level.passPct}%</span></div>
      <div class="es-card es-left">${report.map((r) => `<div class="es-rubric__row"><span>${esc(r.sec.title)} <span class="es-muted">(${r.sec.weight}%)</span></span><span class="es-progress es-progress--mini"><span class="es-progress__fill" style="--p:${r.score}%"></span></span><b>${r.score}%</b></div>`).join('')}</div>
      ${passed && level.unlocks ? `<p class="es-unlock">${icon('lock')} Unlocked: <b>${esc(level.unlocks)}</b></p>` : ''}
      ${!passed && missed.length ? `<p>Repair covers ${missed.length} missed item${missed.length > 1 ? 's' : ''}${report.some((r) => r.rubric && r.rubric.fixes && r.rubric.fixes.length) ? ' plus the fixes from your speaking and writing' : ''}.</p>` : ''}
      ${report.filter((r) => r.rubric).map((r) => `<details class="es-details"><summary>${esc(r.sec.title)} feedback</summary>${ui.rubric(r.rubric)}</details>`).join('')}`;
    const footer = h('footer', { class: 'es-footer' });
    const wrap = h('div', { class: 'es-lesson' }); wrap.append(h('div'), page, footer); root.append(wrap);
    const f = ui.footer(footer);
    if (passed) {
      f.continueOnly({ label: 'Continue', onClick: () => ES.flow.back(root, { level, title: 'Test passed', html: `<p>Score ${total}% (pass mark ${level.passPct}%).</p>` }) });
    } else {
      const retake = h('button', { class: 'es-btn es-btn--ghost' }, 'Retake now');
      retake.addEventListener('click', () => location.reload());
      f.continueOnly({
        label: missed.length ? 'Start targeted repair' : 'Retake',
        left: missed.length ? retake : null,
        onClick: async () => {
          if (!missed.length) return location.reload();
          const frame = ui.frame(root, { hearts: null, onQuit: quit });
          await ui.interstitial(frame, { char: 'mara', text: 'Vamos a repasar lo que falló. Después, otra vez el examen.', voice: 'mara', label: 'Start repair' });
          await ES.session.run(frame, { levelId: level.id, items: missed, practice: true });
          ES.flow.back(root, { level, title: 'Repair done', html: '<p>Your retake is free. Press <b>Play again</b> to take a freshly assembled test.</p>' });
        },
      });
    }
  };

  // ── entry check: adaptive, unit by unit ─────────────────────────────
  engines.entry_check = async (level, root) => {
    await ES.flow.intro(root, {
      title: level.title, kicker: 'Placement · adaptive',
      body: `A few questions per unit, at least one spoken. It stops early once it knows where you are, and never runs past ${level.capMinutes} minutes.`,
      bullets: level.units.map((u) => `${esc(u.unit)} — ${esc(u.title)}`),
      start: "Let's find my level",
    });
    ES.warmItems(level.units.flatMap((u) => u.items));
    const frame = ui.frame(root, { onQuit: quit, timer: level.capMinutes * 60 });
    const t0 = Date.now();
    const cap = level.capMinutes * 60000;
    const tick = setInterval(() => frame.timer(cap - (Date.now() - t0)), 1000);
    let u = 0; let i = 0; let right = 0; let asked = 0;
    const placedOut = []; let startAt = null;
    const totalItems = level.units.length * 3;
    const r = await ES.session.run(frame, {
      levelId: level.id, exam: true, total: totalItems,
      next: (last) => {
        // A skipped speaking item tells us nothing about the unit, so it is not counted.
        if (last && !last.res.skipped) { asked++; if (last.res.correct) right++; }
        if (Date.now() - t0 > cap) { startAt = startAt || level.units[u].unit; return null; }
        const unit = level.units[u];
        if (!unit) return null;
        // Mastery decided: 3 of 3 right, or 3 of 4 with the spoken one.
        const decided = (asked >= 3 && right === asked) || asked >= 4 || (asked >= 2 && right === 0) || (asked >= 3 && asked - right >= 2);
        if (decided) {
          if (right >= 3) placedOut.push(unit.unit);
          else { startAt = unit.unit; return null; }
          u++; i = 0; right = 0; asked = 0;
          if (!level.units[u]) return null;
        }
        const it = level.units[u].items[i++];
        return it || null;
      },
    });
    clearInterval(tick);
    if (r.quit) return quit();
    const nextUnit = startAt || (level.units[placedOut.length] ? level.units[placedOut.length].unit : 'Grade 2');
    ES.flow.back(root, {
      level, title: placedOut.length ? `You can skip ${placedOut.length} unit${placedOut.length > 1 ? 's' : ''}!` : "Let's start from the beginning",
      html: `<div class="es-card es-left">
        ${level.units.map((un) => `<div class="es-rubric__row"><span>${esc(un.unit)} · ${esc(un.title)}</span><b>${placedOut.includes(un.unit) ? `<span class="es-chip es-chip--good">${icon('check')} placed out</span>` : un.unit === nextUnit ? '<span class="es-chip">start here</span>' : '<span class="es-muted">ahead</span>'}</b></div>`).join('')}
        <p class="es-muted">Placed-out units still get a 3-minute Unit Check the first time you reach them, and their items enter spaced review. Time used: ${ES.fmtTime(Date.now() - t0)}.</p></div>`,
    });
  };
})();
