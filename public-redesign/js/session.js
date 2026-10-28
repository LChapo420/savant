/* The session player.
 *
 * A session is a sitting, not a level. Each level is one block of questions;
 * when a block is done the level is re-checked, a single recall question about
 * that level is asked, and the learner chooses: another level, or finish.
 *
 * Finishing analyzes the whole sitting — every level it covered — and the
 * retention questions at the end span all of it, not just the last level.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const host = document.getElementById('player');
  const enrollmentId = Number(App.query('enrollment'));
  if (!enrollmentId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  // `?level=` opens a level the learner is not standing on. Only an account with
  // the capability gets this far — the server refuses anyone else — and the
  // sitting it builds does not move them, so this is a look, not a jump.
  const wantLevel = Number(App.query('level')) || null;

  let session;
  try {
    // The level decides what this is — a lesson, a checkpoint, or practice.
    session = await App.api.post('/api/sessions', {
      enrollment_id: enrollmentId,
      level: wantLevel || undefined,
      // `?ordinary=1` is the way back from a block level that could not be
      // written: the adaptive session teaches the level instead.
      ordinary: App.query('ordinary') === '1' || undefined,
    });
    // A game level is a game, and the server knows which levels are. The page
    // goes straight there rather than building a sitting nobody would sit —
    // this is the door every button on the site opens, so it is where the game
    // has to be reached from.
    if (session.game) {
      window.location.replace(session.game.url);
      return;
    }
  } catch (err) {
    host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}
      <div style="margin-top:10px"><a class="btn btn-sm" href="/path?enrollment=${enrollmentId}">Back to your path</a></div></div>`;
    return;
  }

  const lastBlock = session.blocks.length ? session.blocks[session.blocks.length - 1] : { index: 0, kind: 'practice' };
  let block = lastBlock.index;
  let blockKind = lastBlock.kind || 'practice';
  let lesson = session.lesson || null;
  let essay = session.essay || null;
  // The editor handle, kept so the caret can be restored across the re-render
  // that grading triggers. A writer told what to fix should still be looking at
  // the sentence they were editing.
  let lastEditor = null;
  let items = session.items.filter((i) => i.block === block && i.role !== 'retention');
  let index = Math.max(0, items.findIndex((i) => !i.answered));
  if (index === -1) index = items.length;
  let startedAt = Date.now();
  let levelsCovered = [...(session.levels || [session.level])];
  let currentLevel = session.level;
  // The quick check that goes with a written checkpoint, and the writing itself.
  // The block holds the questions; the essay is a separate surface reached from
  // here, so the two are tracked apart.
  const isEssay = () => blockKind === 'essay' || session.kind === 'essay';
  // A block is an exam when the server says so. The list of kinds that can fail
  // was written here and in four other files, and the dashboard's copy of it left
  // out `essay`; the block already carries `checkpoint` from the server, so this
  // reads that instead of keeping a sixth list.
  const isExam = () => !!block.checkpoint
    || block.kind === 'master' || block.kind === 'grand'
    || block.kind === 'graduation' || block.kind === 'essay';
  // What this checkpoint is called, which the server decides — a Master quiz on an
  // English track is delivered as an Essay, and level 25 of arithmetic is not.
  const labelFor = (kind) => session.kind_label || App.levelName(kind);
  const titleFor = () => (isExam()
    ? `Level ${currentLevel} — ${labelFor(blockKind)}`
    : blockKind === 'lesson'
      // The topic named in the heading, not only on the lesson's own title below.
      // A learner who lands on a lesson from the path is looking at this line
      // first, and "Level 40 — Lesson" does not say what forty is.
      // Escaped by the caller, not here: `titleFor()` goes into the h1 through
      // `App.escapeHtml` and into `textContent` on a re-render, so escaping it
      // twice would show the learner a literal &amp; in their lesson's title.
      ? `Level ${currentLevel} — Lesson${lesson && lesson.topic ? `: ${lesson.topic}` : ''}`
      : `Level ${currentLevel}`);

  function shell() {
    // Whether this session is a step back or a look ahead decides the wording.
    // Both are previews — neither moves the learner — but "you are on level 40
    // looking at level 92" is a warning, and "you are on level 40 going back to
    // level 25" is reassurance about a level they have already done. Saying the
    // same thing about both made going back read like a warning.
    const behind = !!session.preview && session.your_level > session.level;
    const previewNote = session.preview ? `
      <div class="notice ${behind ? '' : 'notice-warn'}" style="margin-bottom:14px">
        <strong>${behind
    ? `Back at level ${session.level}, which you have already worked through.`
    : `Looking at level ${session.level}.`}</strong>
        ${behind
    ? `You are on level ${session.your_level}. Read it, practise it, and nothing here moves you — not forwards, and not back either.`
    : `You are on level ${session.your_level}, and this does not move you — it is
        the work at ${session.level} so you can see what is there.`}
      </div>` : '';
    host.innerHTML = `
      ${previewNote}
      <div class="row-between player-head" style="margin-bottom:14px">
        <a class="icon-btn player-close" href="/path?enrollment=${enrollmentId}" title="Leave and go back to your path" aria-label="Leave and go back to your path">${window.icon('x')}</a>
        <div class="player-titles">
          <h1 style="margin-bottom:2px" id="title">${App.escapeHtml(titleFor())}</h1>
          <div class="small muted" id="subtitle"></div>
        </div>
        <div class="row player-chips">
          <span class="chip" id="covered"></span>
          <span class="chip chip-accent" id="counter"></span>
        </div>
      </div>
      <div class="player-bar">
        <div class="meter meter-lg"><span id="bar" style="width:0%"></span></div>
        <span class="small muted" id="pct">0%</span>
      </div>
      <div class="card" id="item"></div>
      <div class="row" style="margin-top:12px">
        <span class="small muted" id="hint-line"></span>
        <span class="spacer"></span>
        <span id="level-actions-inline"></span>
      </div>`;
    refreshHeader();
  }

  function refreshHeader() {
    document.getElementById('title').textContent = titleFor();
    document.getElementById('subtitle').textContent = isEssay()
      ? `${items.length} quick questions, then one piece of writing. Pass mark ${Math.round((session.pass_mark || 0.75) * 100)}% on the writing.`
      : isExam()
        ? `${items.length} questions, no feedback until the end. Pass mark ${Math.round((session.pass_mark || 0.8) * 100)}%.`
        : blockKind === 'lesson'
          ? `Read the lesson, then ${items.length} question${items.length === 1 ? '' : 's'} to check it stuck.`
          : `${items.length} questions at this level: review of what is due, work at your level, and a stretch above it.`;
    document.getElementById('hint-line').textContent = isExam()
      ? 'Answer everything you can. Unanswered questions count as wrong.'
      : 'Finish whenever you like — you can also carry on into the next level.';
    const covered = document.getElementById('covered');
    if (levelsCovered.length > 1) {
      covered.classList.remove('hidden');
      covered.textContent = `this session: levels ${levelsCovered[0]}–${levelsCovered[levelsCovered.length - 1]}`;
    } else {
      covered.classList.add('hidden');
    }
  }

  function progress() {
    const answered = items.filter((i) => i.answered).length;
    document.getElementById('counter').textContent = `${Math.min(index + 1, items.length)} of ${items.length}`;
    // A block can be the writing on its own, with no questions at all, and a
    // progress bar reading NaN% is worse than no bar.
    const share = items.length ? answered / items.length : 0;
    document.getElementById('bar').style.width = `${share * 100}%`;
    document.getElementById('pct').textContent = items.length ? App.pct(share) : 'writing';
  }

  function advance() {
    index++;
    startedAt = Date.now();
    if (index >= items.length) return closeBlock();
    progress();
    show();
    return undefined;
  }

  /**
   * A lesson level: the part of the product that teaches. The page is written
   * for this learner — depth, whether rules or examples come first, and the
   * shape of the check questions all come from their profile.
   */
  function renderLesson() {
    const itemHost = document.getElementById('item');
    const sections = (lesson.sections || []).map((s) => `
      <section class="lesson-section">
        <h3>${App.escapeHtml(s.heading)}</h3>
        <p>${App.escapeHtml(s.body)}</p>
        ${s.example ? `<pre class="lesson-example">${App.escapeHtml(s.example)}</pre>` : ''}
      </section>`).join('');

    const worked = lesson.worked_example ? `
      <section class="lesson-section">
        <h3>${window.icon('edit')}Worked example</h3>
        <pre class="lesson-example">${App.escapeHtml(lesson.worked_example.problem)}</pre>
        <ol class="lesson-steps">
          ${lesson.worked_example.steps.map((step) => `<li>${App.escapeHtml(step)}</li>`).join('')}
        </ol>
        <p class="small"><strong>Answer:</strong> ${App.escapeHtml(lesson.worked_example.answer)}</p>
      </section>` : '';

    const mistakes = (lesson.common_mistakes || []).length ? `
      <section class="lesson-section">
        <h3>${window.icon('x-circle')}Where this usually goes wrong</h3>
        <ul class="small">${lesson.common_mistakes.map((m) => `<li>${App.escapeHtml(m)}</li>`).join('')}</ul>
      </section>` : '';

    itemHost.innerHTML = `
      <article class="lesson">
        <div class="row" style="margin-bottom:8px">
          <span class="chip chip-accent">${window.icon('book-open')}Lesson</span>
          <span class="chip">${App.escapeHtml(lesson.skill_name || '')}</span>
          ${lesson.source === 'ai' ? '<span class="chip">written for you</span>' : ''}
        </div>
        <h2>${App.escapeHtml(lesson.title)}</h2>
        <p class="lesson-intro">${App.escapeHtml(lesson.intro)}</p>
        ${sections}
        ${worked}
        ${mistakes}
        <section class="lesson-section lesson-summary">
          <h3>${window.icon('check')}In short</h3>
          <p>${App.escapeHtml(lesson.summary)}</p>
        </section>
        <button class="btn btn-primary btn-lg" id="start-checks" type="button">
          ${window.icon('arrow-right')}Check what stuck (${items.length} question${items.length === 1 ? '' : 's'})
        </button>
      </article>`;

    document.getElementById('start-checks').addEventListener('click', () => {
      startedAt = Date.now();
      show();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── the written checkpoint ───────────────────────────────────────────────
  /**
   * The writing surface.
   *
   * Built rather than borrowed from the player, because it is the one place in
   * the product where what the learner produces is prose rather than an answer,
   * and a question widget that hands back a string has nothing useful to say
   * about a paragraph. So: the rubric up front, because a mark they cannot see
   * the shape of teaches nothing; a word count, because "long enough" is
   * otherwise a guess; and a draft saved as they type, because losing four
   * hundred words to a stray click is the kind of thing that stops anyone
   * writing a second one.
   *
   * The rubric is shown in full. It is the specification of the task, not the
   * answer to it.
   */
  function renderEssay() {
    const itemHost = document.getElementById('item');
    if (!essay) {
      itemHost.innerHTML = '<div class="notice notice-warn">This essay is still being written. Try again in a moment.</div>';
      return;
    }

    // A draft saved while the network was down is newer than the server's copy,
    // and the server cannot know that. Preferring the local one is what makes a
    // draft survive a closed lid, not just a closed tab.
    const local = readLocalDraft(essay.id);
    const seeded = local && local.html ? local.html : (essay.draft || '');

    const criteria = essay.criteria || [];
    itemHost.innerHTML = `
      <article class="essay">
        <div class="row" style="margin-bottom:10px">
          <span class="chip chip-accent">${window.icon('edit')}Writing</span>
          ${essay.source === 'ai' ? '<span class="chip">a topic for you</span>' : ''}
          ${essay.source === 'revision' ? '<span class="chip">revising your piece</span>' : ''}
          ${essay.attempts > 1 ? `<span class="chip">attempt ${essay.attempts}</span>` : ''}
        </div>
        <h2 class="essay-prompt">${App.escapeHtml(essay.prompt)}</h2>
        ${essay.guidance ? `<p class="lesson-intro">${App.escapeHtml(essay.guidance)}</p>` : ''}
        ${renderRevising(essay.revising)}

        ${renderRubric(criteria)}

        <div id="editor-host" style="margin-top:16px"></div>
        <div class="row-between" style="margin-top:8px">
          <span class="small muted" id="essay-count">counting</span>
          <span class="tiny muted" id="essay-saved"></span>
        </div>

        ${renderRubricResult(essay.result)}

        <div class="row-wrap" style="margin-top:14px">
          <button class="btn btn-primary btn-lg" id="essay-submit" type="button">
            ${window.icon('check')}Hand it in
          </button>
          <span class="small muted" id="essay-note"></span>
          <span class="spacer"></span>
          <button class="btn" id="essay-finish" type="button">
            ${window.icon('check')}Finish and score
          </button>
        </div>
      </article>`;

    document.getElementById('essay-finish').addEventListener('click', () => {
      // The writing is the gate, so this is only offered once there is something
      // to score. Unanswered quick-check questions still count against the
      // quiz part of the level the same way they would on an exam.
      if (!essay.attempts && !essay.draft) {
        App.toast('Hand in your writing first — there is nothing to score otherwise.');
        return;
      }
      finish();
    });
    mountEssay(seeded);
  }

  /**
   * The rubric, as a grid: aspects down, the four grades across.
   *
   * A table rather than a list because that is the shape of the thing. The reader
   * is looking for "what does a 3 look like for *this* row", and a column per
   * grade is what makes that a lookup instead of a hunt. Each cell is the writer's
   * own words for that level, kept whole — a descriptor trimmed to fit a column
   * would stop being the descriptor.
   */
  function renderRubric(criteria) {
    return `
      <section class="rubric">
        <h3>${window.icon('list')}What you are marked on</h3>
        <p class="small muted" style="margin:0 0 12px">Each part is marked 1 to 4.
          The columns are what each mark looks like in your own writing.</p>
        <div class="rubric-scroll">
          <table class="rubric-grid">
            <thead>
              <tr>
                <th scope="col" class="rubric-corner">Part</th>
                <th scope="col">1</th>
                <th scope="col">2</th>
                <th scope="col">3</th>
                <th scope="col">4</th>
              </tr>
            </thead>
            <tbody>
              ${criteria.map((c) => `
                <tr>
                  <th scope="row">${App.escapeHtml(c.name)}</th>
                  ${c.levels.map((l) => `<td>${App.escapeHtml(l)}</td>`).join('')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  /** The mark from the last attempt, or nothing when there has not been one. */
  /**
 * What a revision is being revised against: the last mark, the one thing that
 * would raise it most, and each criterion's next step. Shown above the rubric,
 * because fixing those is the whole job of a revision.
 */
function renderRevising(rev) {
  if (!rev) return '';
  const steps = (rev.criteria || []).filter((c) => c.next_step && c.score < 4);
  return `
    <div class="notice" style="margin:10px 0">
      <strong>Revise this piece.</strong> Your last version scored ${App.pct(rev.overall || 0)}.
      ${rev.focus ? `<div style="margin-top:6px">${App.escapeHtml(rev.focus)}</div>` : ''}
      ${steps.length ? `<ul style="margin:8px 0 0 18px">${steps.map((c) => `<li><strong>${App.escapeHtml(c.name)}</strong> (${c.score}/4): ${App.escapeHtml(c.next_step)}</li>`).join('')}</ul>` : ''}
      <div class="small muted" style="margin-top:6px">Your last draft is in the editor below. Fix it and hand it in again.</div>
    </div>`;
}

function renderRubricResult(result) {
    if (!result) return '';
    const criteria = (result.criteria || []);
    const verdict = result.passed
      ? `<div class="notice notice-success"><strong>${App.pct(result.overall)} — that passes.</strong>
         This level is done.</div>`
      : `<div class="notice notice-warn"><strong>${App.pct(result.overall)} — ${App.pct(essay.required)} needed.</strong>
         Read what came back, change the writing, and hand it in again. The topic stays the same.</div>`;

    return `
      <section class="rubric-result">
        <h3>Where it landed</h3>
        ${verdict}
        <div class="rubric-scroll">
          <table class="rubric-grid rubric-marked-grid">
            <thead>
              <tr>
                <th scope="col" class="rubric-corner">Part</th>
                <th scope="col">1</th>
                <th scope="col">2</th>
                <th scope="col">3</th>
                <th scope="col">4</th>
              </tr>
            </thead>
            <tbody>
              ${criteria.map((c) => {
    const name = (essay.criteria[c.index] || {}).name || `Part ${c.index + 1}`;
    return `
                <tr>
                  <th scope="row">${App.escapeHtml(name)}</th>
                  ${[1, 2, 3, 4].map((n) => `<td class="${c.score === n ? 'is-marked' : ''}">${
      c.score === n ? `<span class="rubric-given">${n}</span>` : n
    }</td>`).join('')}
                </tr>`;
  }).join('')}
            </tbody>
          </table>
        </div>
        ${criteria.filter((c) => c.evidence || c.next_step).map((c) => {
    const name = (essay.criteria[c.index] || {}).name || `Part ${c.index + 1}`;
    return `
          <div class="rubric-marked">
            <div class="rubric-marked-head">
              <span class="rubric-name">${App.escapeHtml(name)}</span>
              ${c.score === null ? '<span class="chip">not marked</span>'
    : `<span class="chip ${c.score >= 3 ? 'chip-success' : c.score === 2 ? 'chip-warn' : 'chip-danger'}">${c.score} of 4</span>`}
            </div>
            ${c.evidence ? `<p class="rubric-quote">&ldquo;${App.escapeHtml(c.evidence)}&rdquo;</p>` : ''}
            ${c.next_step ? `<p class="rubric-next">${App.escapeHtml(c.next_step)}</p>` : ''}
          </div>`;
  }).join('')}
        ${(result.strengths || []).length ? `
          <div class="rubric-strengths">
            <div class="rubric-name">What worked</div>
            <ul class="small">${result.strengths.map((s) => `<li>${App.escapeHtml(s)}</li>`).join('')}</ul>
          </div>` : ''}
        ${result.focus ? `<p class="rubric-focus">${window.icon('target')}<span>${App.escapeHtml(result.focus)}</span></p>` : ''}
      </section>`;
  }

  // ── keeping the draft ────────────────────────────────────────────────────
  /**
   * The local copy, which is what closes the one gap a debounce cannot: a closed
   * laptop lid. The server has no idea a draft exists if the network was down, so
   * the words are written here first and sent when the network answers. It is
   * cleared as soon as the server has confirmed them, so the two do not drift.
   */
  const localKey = (id) => `polymath.essay.${id}`;

  function readLocalDraft(id) {
    if (!id) return null;
    try {
      const raw = window.localStorage.getItem(localKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch {
      // Private browsing, a full quota, or a corrupt value. None of those should
      // stop someone writing.
      return null;
    }
  }

  function writeLocalDraft(id, html, at) {
    if (!id) return;
    try {
      window.localStorage.setItem(localKey(id), JSON.stringify({ html, at }));
    } catch {
      // A full quota is not worth interrupting a sentence over.
    }
  }

  function clearLocalDraft(id) {
    if (!id) return;
    try { window.localStorage.removeItem(localKey(id)); } catch { /* nothing to do */ }
  }

  /**
   * Wire the editor, the autosave, and the submit.
   *
   * Four ways a draft leaves this page — the debounce, the blur, the tab being
   * hidden, and the tab being closed — and all four are covered, because the
   * first two are the ones people remember and the last two are the ones that
   * actually lose work. Signing out is a fifth, and is handled further down.
   */
  function mountEssay(seeded) {
    const host = document.getElementById('editor-host');
    const submit = document.getElementById('essay-submit');
    const count = document.getElementById('essay-count');
    const savedNote = document.getElementById('essay-saved');
    const note = document.getElementById('essay-note');
    if (!host || !submit || !window.Editor) return;

    const min = essay.min_words || 80;
    const editor = window.Editor.create(host, { value: seeded || '' });
    // Held at module scope so the submit handler can put the caret back after
    // the re-render. A `window` global would work and would be worse.
    lastEditor = editor;
    let timer = null;
    let inFlight = false;

    const words = () => (editor.getText() || '').trim().split(/\s+/).filter(Boolean).length;

    function status(kind, text) {
      if (!savedNote) return;
      savedNote.textContent = text;
      savedNote.className = `tiny ${kind === 'bad' ? '' : 'muted'}`;
      if (kind === 'bad') savedNote.style.color = 'var(--warn)';
      else savedNote.style.color = '';
    }

    function updateCount() {
      const n = words();
      if (count) count.textContent = `${n} word${n === 1 ? '' : 's'} · at least ${min}`;
      if (n >= min) {
        submit.disabled = false;
        if (note) note.textContent = '';
      } else {
        submit.disabled = true;
        if (note) note.textContent = `${min - n} more word${min - n === 1 ? '' : 's'}`;
      }
    }

    /** Put the words somewhere durable, then try the server. */
    function save() {
      clearTimeout(timer);
      if (!essay || !essay.id || inFlight) return;
      const html = editor.getHtml();
      dirty = true;
      writeLocalDraft(essay.id, html, new Date().toISOString());
      inFlight = true;
      status('', 'Saving…');
      App.api.post(`/api/essays/${essay.id}/draft`, { text: html })
        .then((r) => {
          inFlight = false;
          dirty = false;
          clearLocalDraft(essay.id);
          status('', r.truncated
            ? 'Saved — the end was cut off, it is at the length limit'
            : `Saved ${App.timeAgo(r.saved_at)}`);
        })
        .catch((err) => {
          inFlight = false;
          // The local copy is already written, so this is a delay rather than a
          // loss — and saying so is the difference between "not saved" and a
          // writer who assumes their work is gone.
          status('bad', err.status === 429
            ? 'Not on the server yet — kept here, trying again'
            : 'Not saved — kept here, trying again');
          if (!timer) timer = setTimeout(save, 6000);
        });
    }

    function schedule() {
      updateCount();
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 2000);
    }

    editor.surface.addEventListener('input', schedule);

    // Blur, the tab being hidden, and the tab being closed are the three exits
    // a debounce misses. `pagehide` is the one that fires on a real close;
    // `visibilitychange` catches a tab switch on a phone.
    editor.surface.addEventListener('blur', save);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', () => {
      if (!essay || !essay.id) return;
      // A last write straight into local storage, because a fetch started here
      // will not survive the unload.
      writeLocalDraft(essay.id, editor.getHtml(), new Date().toISOString());
    });

    // Signing out navigates immediately, which would kill a save in flight.
    const signOut = document.getElementById('logout');
    if (signOut) {
      signOut.addEventListener('click', () => {
        if (essay && essay.id) {
          writeLocalDraft(essay.id, editor.getHtml(), new Date().toISOString());
          App.api.post(`/api/essays/${essay.id}/draft`, { text: editor.getHtml() }).catch(() => { /* local copy stands */ });
        }
      }, true);
    }

    updateCount();
    const restored = readLocalDraft(essay.id);
    if (restored && restored.html && restored.html !== essay.draft) {
      status('bad', 'A newer draft on this device was restored');
    } else if (essay.saved_at) {
      status('', `Saved ${App.timeAgo(essay.saved_at)}`);
    }

    submit.addEventListener('click', async () => {
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner"></span>Reading it';
      if (note) note.textContent = '';
      editor.saveCaret();
      const html = editor.getHtml();
      try {
        await App.api.post(`/api/essays/${essay.id}/draft`, { text: html });
        const result = await App.api.post(`/api/essays/${essay.id}/submit`, { text: html });
        essay = result.essay;
        clearLocalDraft(essay.id);
        // Re-render so the mark lands in place, then put the caret back where
        // it was — a writer told to fix a sentence should still be looking at it.
        renderEssay();
        if (lastEditor) lastEditor.restoreCaret();
        if (result.passed) App.toast('That passes. Finish the session to move on.');
        else App.toast('Not there yet — the notes are below.', 'error');
      } catch (err) {
        if (note) note.textContent = err.message;
        App.toast(err.message, 'error');
        submit.disabled = false;
        submit.innerHTML = `${window.icon('check')}Hand it in`;
      }
    });
  }

  function show() {
    const item = items[index];
    const itemHost = document.getElementById('item');
    const roleLabel = { review: 'Review', stretch: 'Stretch', support: 'Foundation', focus: 'Focus', exam: 'Exam', check: 'Check' }[item.role] || 'Question';

    Player.render(itemHost, item, {
      label: roleLabel,
      coach: !isExam(),
      // Asked on about one question in three, so it stays a quick tap rather than
      // a chore — enough for the learning scorecard to learn how well this learner
      // knows what they know.
      askConfidence: !isExam() && index % 3 === 1,
      onSubmit: async (answer, meta = {}) => {
        let result;
        try {
          result = await App.api.post(`/api/sessions/${session.session_id}/answer`, {
            item_id: item.id,
            answer,
            ms: Date.now() - startedAt,
            confidence: meta.confidence || null,
            changes: meta.changes || 0,
          });
        } catch (err) {
          App.toast(err.message, 'error');
          return;
        }
        item.answered = true;
        item.correct = result.correct === undefined ? null : result.correct;
        progress();
        if (!result.reveal) {
          advance();
          return;
        }
        const last = index + 1 >= items.length;
        Player.reveal(itemHost, item, result, {
          nextLabel: last ? (isEssay() ? 'Write it' : isExam() ? 'Finish and score' : `Finish level ${currentLevel}`) : 'Next question',
          onNext: () => advance(),
        });
      },
    });

    mountControls(itemHost, item);
  }

  /**
   * The skip controls, and the way out of an exam.
   *
   * Both are drawn only when the account has the capability or the block is a
   * graded one, and neither is a security boundary — the server decides. What
   * they are is an honest description of what is possible: a learner should not
   * discover they can skip by guessing an endpoint, and a learner who has
   * opened a forty-question exam by accident should not be unable to leave it.
   */
  function mountControls(itemHost, item) {
    const bar = App.el('div', { class: 'row-wrap session-controls' });
    let added = false;

    if (user && user.can_skip && item && !item.answered) {
      const skip = App.el('button', { class: 'btn btn-sm btn-ghost', type: 'button' },
        `${window.icon('arrow-right')}Skip this question`);
      skip.addEventListener('click', async () => {
        skip.disabled = true;
        try {
          // The server leaves the verdict unwritten, so the question leaves the
          // score rather than counting as wrong. That is the whole promise.
          await App.api.post(`/api/items/${item.id}/skip`, {});
          App.toast('Skipped. It does not count against you.');
          advance();
        } catch (err) {
          App.toast(err.message, 'error');
          skip.disabled = false;
        }
      });
      bar.appendChild(skip);
      added = true;
    }

    // An exam has no level-complete screen to leave from, so this is the only
    // way out of one part-finished — and it scores what has been answered
    // rather than discarding the sitting.
    if (isExam() && !isEssay() && session.kind !== 'skip' && items.some((i) => i.answered)) {
      const leave = App.el('button', { class: 'btn btn-sm', type: 'button' },
        `${window.icon('check')}End this exam here`);
      leave.addEventListener('click', () => {
        App.toast('Scored what you have answered.');
        finish();
      });
      bar.appendChild(leave);
      added = true;
    }

    if (added) itemHost.appendChild(bar);
  }

  /** Every question in this level is answered: close it out and offer the choice. */
  async function closeBlock() {
    // A written checkpoint is two things in a row: the quick check, then the
    // writing. So when the questions run out it does not finish the sitting —
    // it opens the essay, and the sitting is finished from there, once the
    // writing is in. An exam, by contrast, is scored when it ends.
    if (isEssay()) return openEssay();
    if (isExam()) return finish();
    const itemHost = document.getElementById('item');
    itemHost.innerHTML = '<div class="loading"><span class="spinner"></span>Checking where that leaves you</div>';

    let outcome;
    try {
      outcome = await App.api.post(`/api/sessions/${session.session_id}/block-finish`, { block });
    } catch (err) {
      App.toast(err.message, 'error');
      return finish();
    }
    levelsCovered = [...new Set([...levelsCovered, outcome.next_level])].sort((a, b) => a - b);
    renderLevelClose(outcome);
    return undefined;
  }

  /**
   * Open the writing, or go back to it.
   *
   * The essay page doubles as the thing you come back to, which is why it is a
   * branch out of `closeBlock` rather than a separate screen: a learner who
   * wants to reread the rubric, or keep editing, needs somewhere to land, and
   * making that a detour would mean the draft is somewhere other than where they
   * left it.
   */
  function openEssay() {
    const slot = document.getElementById('item');
    slot.innerHTML = '';
    if (essay) {
      renderEssay();
      return;
    }
    // The essay is fetched by id, and the id is on the row the block was built
    // with. Nothing here is null in the normal path, so this is a guard rather
    // than a route.
    slot.innerHTML = '<div class="notice notice-warn">This essay could not be found. Finish the session and try again.</div>';
  }

  function renderLevelClose(outcome) {
    const itemHost = document.getElementById('item');
    const advanced = !!outcome.level_up;
    const wasLesson = outcome.kind === 'lesson';
    const nextKind = outcome.next_kind;
    const nextIsCheckpoint = checkpointKinds.includes(nextKind);
    const p = outcome.progress || {};

    // On a preview, `advanced` is always false by design, so the wording has to
    // come from somewhere else — otherwise every preview ends on "not settled
    // yet", which reads as a failure rather than as a level you were only
    // looking at. And a revisit is not a look: it is a level already done, so
    // saying "a look, not a step" about something you finished once is as
    // misleading as calling it locked.
    const behind = !!session.preview && session.your_level > session.level;
    const headline = session.preview
      ? (behind
        ? `Level ${outcome.level}, revisited`
        : `Level ${outcome.level} — a look, not a step`)
      : advanced
        ? wasLesson ? `Lesson ${outcome.level} done` : `Level ${outcome.level} complete`
        : `Level ${outcome.level} — not settled yet`;

    const detail = session.preview
      ? (behind
        ? `You are still on level ${session.your_level}, and that is where you will carry on from.`
        : `You are still on level ${session.your_level}. Nothing here moved you, and finishing will not either.`)
      : advanced
        ? nextIsCheckpoint
          ? `Level ${outcome.next_level} is the ${App.escapeHtml(App.levelName(nextKind))}, covering everything up to here.`
          : nextKind === 'lesson'
            ? `Level ${outcome.next_level} is a lesson, and it is already written for you.`
          : wasLesson
            ? `Level ${outcome.next_level} puts what you just read into practice.`
            : `Mastery here is ${App.pct(p.average || 0)}. Level ${outcome.next_level} is open.`
      : `To move on: ${App.escapeHtml((p.blockers || []).join('; '))}.`;

    itemHost.innerHTML = `
      <div class="level-close">
        <div class="row" style="margin-bottom:6px">
          ${window.icon(session.preview ? 'book-open' : advanced ? 'check-circle' : 'refresh')}
          <h2 style="margin:0">${headline}</h2>
        </div>
        <p class="small muted" style="margin-bottom:10px">${detail}</p>
        ${session.preview ? '' : `
        <div class="meter meter-lg ${advanced ? 'meter-success' : ''}"><span style="width:${Math.min(1, p.average || 0) * 100}%"></span></div>`}
        <div id="level-retention" style="margin-top:16px"></div>
        <div class="row-wrap" id="level-actions" style="margin-top:16px"></div>
      </div>`;

    const actions = document.getElementById('level-actions');
    // A preview has nowhere to continue to — the level ahead is the one that was
    // just looked at, and the level below is a different one. So the only way
    // out is back to the path, which is what the finish button does.
    if (outcome.can_continue && !session.preview) {
      const label = !advanced
        ? `Keep working at level ${outcome.level}`
        : nextIsCheckpoint
          ? `Take the ${App.levelName(nextKind)}`
          : nextKind === 'lesson'
            ? `Continue to the level ${outcome.next_level} lesson`
            : `Continue to level ${outcome.next_level}`;
      const icon = advanced && nextKind ? App.levelIcon(nextKind) : 'arrow-right';
      const next = App.el('button', { class: 'btn btn-primary', type: 'button' },
        `${window.icon(icon)}${label}`);
      next.addEventListener('click', () => nextBlock(next));
      actions.appendChild(next);
    }
    const stop = App.el('button', { class: `btn ${outcome.can_continue ? '' : 'btn-primary'}`, type: 'button' },
      `${window.icon('check')}Finish session`);
    stop.addEventListener('click', () => finish());
    actions.appendChild(stop);

    // "Give Input", beside the buttons that move the learner on. It goes on this
    // screen because this is the only moment the level they just finished is the
    // subject in front of them — ask later, on the recap, and it has become a
    // question about the session rather than about the level.
    if (session.track_id && session.grade_id) {
      actions.appendChild(window.Feedback.button(actions, {
        track: session.track_id,
        grade: session.grade_id,
        level: outcome.level,
        kind: outcome.kind,
      }));
    }

    // The single recall question for the level just finished. Answering it is
    // optional — the buttons above stay live.
    if (outcome.retention) {
      const slot = document.getElementById('level-retention');
      const card = App.el('div', { class: 'card card-tight' });
      slot.appendChild(App.el('div', { class: 'small', style: 'font-weight:600; margin-bottom:6px' },
        `${window.icon('refresh')}One quick recall from level ${outcome.level}`));
      slot.appendChild(card);
      let askedAt = Date.now();
      Player.render(card, outcome.retention, {
        label: 'Recall',
        coach: false,
        onSubmit: async (answer) => {
          try {
            const result = await App.api.post(`/api/sessions/${session.session_id}/answer`, {
              item_id: outcome.retention.id, answer, ms: Date.now() - askedAt,
            });
            Player.reveal(card, outcome.retention, result, {});
          } catch (err) {
            App.toast(err.message, 'error');
          }
        },
      });
      askedAt = Date.now();
    }
  }

  async function nextBlock(button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>Building the next level';
    let next;
    try {
      next = await App.api.post(`/api/sessions/${session.session_id}/next-block`, {});
    } catch (err) {
      App.toast(err.message, 'error');
      button.disabled = false;
      return;
    }
    block = next.block;
    currentLevel = next.level;
    blockKind = next.kind || 'practice';
    lesson = next.lesson || null;
    essay = next.essay || null;
    session.kind_label = next.kind_label || null;
    items = next.items;
    session.pass_mark = next.pass_mark || session.pass_mark;
    levelsCovered = [...new Set([...levelsCovered, next.level])].sort((a, b) => a - b);
    index = 0;
    startedAt = Date.now();
    refreshHeader();
    progress();
    // A lesson level opens on the lesson, a written checkpoint opens on its
    // quick check, and everything else opens on a question.
    if (blockKind === 'lesson' && lesson) renderLesson();
    else if (isEssay() && !items.some((i) => !i.answered)) openEssay();
    else show();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function finish() {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Analyzing your session</div>';
    let outcome;
    try {
      outcome = await App.api.post(`/api/sessions/${session.session_id}/finish`, {});
    } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
      return;
    }
    renderRecap(outcome);
  }

  function list(title, values, chipClass) {
    if (!values || !values.length) return '';
    return `<div style="margin-top:10px">
      <div class="small" style="font-weight:600; margin-bottom:5px">${App.escapeHtml(title)}</div>
      <div class="row-wrap">${values.map((v) => `<span class="chip ${chipClass}">${App.escapeHtml(v)}</span>`).join('')}</div>
    </div>`;
  }

  function renderRecap(outcome) {
    const a = outcome.analysis || {};
    const checkpoint = outcome.checkpoint;
    const levels = outcome.levels || levelsCovered;
    const span = levels.length > 1 ? `levels ${levels[0]} to ${levels[levels.length - 1]}` : `level ${levels[0]}`;

    const failedCheckpoint = !!checkpoint && !checkpoint.passed;

    let banner = '';
    // A preview resolves no checkpoint and advances nothing, so its recap says
    // so first — before the ordinary banners, which would otherwise claim a
    // level up that did not happen.
    if (session.preview) {
      const behind = session.your_level > (outcome.levels ? outcome.levels[0] : session.level);
      banner = behind ? `<div class="notice">
        <strong>That was level ${outcome.levels ? outcome.levels[0] : session.level}, revisited.</strong>
        You are still on level ${session.your_level}. Nothing was cleared and nothing is waiting on you.
      </div>` : `<div class="notice notice-warn">
        <strong>That was level ${outcome.levels ? outcome.levels[0] : session.level}, looked at.</strong>
        You are still on level ${session.your_level}. Nothing was cleared and nothing is waiting on you.
      </div>`;
    } else if (checkpoint) {
      banner = checkpoint.passed
        ? `<div class="notice notice-success">
             <strong>${App.escapeHtml(App.levelName(checkpoint.kind))} passed</strong> at ${App.pct(checkpoint.accuracy)}
             (${App.pct(checkpoint.required)} needed).
             ${checkpoint.graduated ? ' You have graduated this track.' : ` You are now at level ${checkpoint.level}.`}
           </div>`
        : `<div class="notice notice-warn">
             <strong>${App.escapeHtml(App.levelName(checkpoint.kind))} not passed</strong> — ${App.pct(checkpoint.accuracy)} against ${App.pct(checkpoint.required)}.
             There is no waiting: retake it now on questions you have not seen, or work through what went
             wrong first — the retry stays available while you do.
             ${(checkpoint.weak_areas || []).length
    ? `Weakest here: ${checkpoint.weak_areas.slice(0, 3).map((a) => App.escapeHtml(a.skill_name)).join(', ')}.`
    : ''}
           </div>`;
    } else if (levels.length > 1) {
      banner = `<div class="notice notice-success"><strong>${levels.length} levels this session.</strong>
        You went from level ${levels[0]} to level ${levels[levels.length - 1]}.</div>`;
    } else if (outcome.level_up) {
      banner = `<div class="notice notice-success"><strong>Level up.</strong> You are now at level ${outcome.level_up}.</div>`;
    } else if (outcome.checkpoint_required) {
      banner = `<div class="notice notice-warn"><strong>${App.escapeHtml(App.levelName(outcome.checkpoint_required))} unlocked.</strong>
        This level is finished — clear the checkpoint to continue.</div>`;
    }

    host.innerHTML = `
      ${banner}
      ${outcome.skip && outcome.skip.offered ? `
      <div class="card" style="border-color:var(--accent)">
        <div class="row-between" style="align-items:flex-start; gap:14px">
          <div>
            <div class="card-title">${window.icon('award')}Challenge Exam unlocked</div>
            <p class="small muted" style="margin:4px 0 0">
              ${outcome.skip.run} levels in a row at ${App.pct(outcome.skip.mark)} or better.
              ${(outcome.skip.bands || [])[0] && outcome.skip.bands[0].rule === 'sprt' ? `${outcome.skip.bands.length} bands` : 'Five bands of seven'}, taken at level ${outcome.skip.from_level} and pitched at
              ${(outcome.skip.bands || []).map((b) => b.level).join(', ')} — you skip as far as an
              unbroken run of ${(outcome.skip.bands || [])[0] && outcome.skip.bands[0].rule === 'sprt' ? `held bands reaches: the first holds at ${outcome.skip.bands[0].needed} of ${outcome.skip.bands[0].count}, each above it with at most one miss` : 'perfect bands reaches'}.
            </p>
          </div>
          <a class="btn btn-primary" href="/skip?enrollment=${enrollmentId}">
            ${window.icon('zap')}Take it
          </a>
        </div>
      </div>` : ''}
      <div class="card" style="margin-top:16px">
        <div class="row-between" style="align-items:flex-start">
          <div class="stat-block"><span class="value">${App.pct(outcome.accuracy)}</span><span class="label">Accuracy</span></div>
          <div class="stat-block"><span class="value">+${outcome.xp}</span><span class="label">XP earned</span></div>
          <div class="stat-block"><span class="value">${outcome.streak}</span><span class="label">Day streak</span></div>
          <div class="stat-block"><span class="value">${levels.length}</span><span class="label">Level${levels.length === 1 ? '' : 's'} covered</span></div>
        </div>
        <p style="margin:16px 0 0" data-slot="summary">${App.escapeHtml(a.summary || '')}</p>
        <div data-slot="lists">${list('Solid', a.learned, 'chip-success')}${list('Fragile', a.fragile, 'chip-warn')}${list('Needs work', a.gaps, 'chip-danger')}</div>
        ${a.next_session && a.next_session.note ? `<p class="small muted" style="margin-top:12px">Next session: ${App.escapeHtml(a.next_session.note)}</p>` : ''}
        <p class="tiny muted" style="margin-top:12px">Covering ${App.escapeHtml(span)}. <span data-slot="analysis-note">${outcome.ai
          ? `Analyzed by the AI tutor${outcome.provider ? ` (${App.escapeHtml(outcome.provider)})` : ''}.`
          : 'Analyzed by the built-in rules (the AI tutor is off).'}</span></p>
      </div>

      ${outcome.retention && outcome.retention.length ? `
        <div class="card" style="margin-top:16px">
          <div class="card-title">${window.icon('refresh')}Retention check</div>
          <p class="small muted">Questions from across this whole session, not just the last level. Recalling them now is what moves them into next week; they do not affect your level.</p>
          <div id="retention"></div>
        </div>` : ''}

      <div class="row-wrap" style="margin-top:16px">
        ${session.preview ? `
          <a class="btn btn-primary" href="/path?enrollment=${enrollmentId}">
            ${window.icon('arrow-left')}Back to your path
          </a>
          <span class="small muted">Your own level is level ${session.your_level}.</span>
        ` : failedCheckpoint ? `
          <a class="btn btn-primary" href="/session?enrollment=${enrollmentId}">
            ${window.icon('refresh')}Retry the ${App.escapeHtml(App.levelName(checkpoint.kind))}
          </a>
          <a class="btn" href="/help?enrollment=${enrollmentId}">
            ${window.icon('book-open')}Help me learn this first
          </a>
          <a class="btn" href="/path?enrollment=${enrollmentId}">View your path</a>
        ` : `
          <a class="btn btn-primary" href="/session?enrollment=${enrollmentId}${outcome.checkpoint_required ? `&kind=${outcome.checkpoint_required}` : ''}">
            ${window.icon('arrow-right')}${outcome.checkpoint_required ? `Take the ${App.levelName(outcome.checkpoint_required)}` : 'Another session'}
          </a>
          <a class="btn" href="/path?enrollment=${enrollmentId}">View your path</a>
        `}
        <a class="btn btn-ghost" href="/dashboard">Dashboard</a>
      </div>

      <!-- The level-close screen already offered this, but a learner who ends the
           session without closing the last level never saw it. Filed against the
           last level of the sitting, which is the one they are looking at. -->
      <div id="recap-feedback" style="margin-top:12px"></div>`;

    const feedbackHost = document.getElementById('recap-feedback');
    if (feedbackHost && session.track_id && session.grade_id && !session.preview) {
      const at = session.end_level || session.level;
      feedbackHost.appendChild(window.Feedback.button(feedbackHost, {
        track: session.track_id,
        grade: session.grade_id,
        level: at,
        kind: null,
      }, { ghost: true }));
    }

    if (outcome.retention && outcome.retention.length) startRetention(outcome.retention);
    if (outcome.analysis_pending) awaitDeeperAnalysis();
  }

  /**
   * The rule-based recap is on screen already. The deeper read — the one that
   * also updates how the tutor teaches this learner — takes a while on the big
   * model, so it swaps in when it arrives rather than holding up the page.
   */
  async function awaitDeeperAnalysis() {
    const note = document.querySelector('[data-slot="analysis-note"]');
    if (note) note.textContent = 'Reading your session in more depth…';
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((r) => setTimeout(r, 8000));
      let data;
      try {
        data = await App.api.get(`/api/sessions/${session.session_id}`);
      } catch {
        return;
      }
      const a = data.session && data.session.analysis;
      if (a && a.source === 'ai') {
        const summary = document.querySelector('[data-slot="summary"]');
        if (summary) summary.textContent = a.summary || '';
        if (note) note.textContent = 'Analyzed by the AI tutor.';
        const lists = document.querySelector('[data-slot="lists"]');
        if (lists) {
          lists.innerHTML = list('Solid', a.learned, 'chip-success')
            + list('Fragile', a.fragile, 'chip-warn')
            + list('Needs work', a.gaps, 'chip-danger');
        }
        return;
      }
    }
    if (note) note.textContent = 'Analyzed by the built-in rules.';
  }

  function startRetention(retention) {
    const slot = document.getElementById('retention');
    let at = 0;
    const step = () => {
      if (at >= retention.length) {
        slot.innerHTML = '<div class="notice notice-success small">Retention check done. That is the part that sticks.</div>';
        return;
      }
      const item = retention[at];
      const box = App.el('div', { class: 'card card-tight', style: 'margin-top:10px' });
      slot.innerHTML = '';
      slot.appendChild(box);
      let askedAt = Date.now();
      Player.render(box, item, {
        label: `Recall ${at + 1} of ${retention.length}${item.level ? ` — level ${item.level}` : ''}`,
        coach: false,
        onSubmit: async (answer) => {
          let result;
          try {
            result = await App.api.post(`/api/sessions/${session.session_id}/answer`, {
              item_id: item.id,
              answer,
              ms: Date.now() - askedAt,
            });
          } catch (err) {
            App.toast(err.message, 'error');
            return;
          }
          Player.reveal(box, item, result, {
            nextLabel: at + 1 >= retention.length ? 'Done' : 'Next',
            onNext: () => { at++; step(); },
          });
        },
      });
      askedAt = Date.now();
    };
    step();
  }

  shell();
  progress();
  if (isEssay() && essay && !essay.passed) {
    // A written checkpoint is two things in one sitting: a short quick check,
    // then the writing. Once the check is done, the writing is where the
    // unfinished business is, and that is where a learner who closed the tab
    // halfway through a Master quiz expects to land.
    //
    // The condition used to be `!items.length`, which is true only before the
    // quick check has been served at all. An essay block has five check
    // questions, so the condition was false the moment they were answered and
    // a reload dropped the learner back onto the first unanswered question —
    // the one thing they had already done. The draft was on the response the
    // whole time; nothing was reading it to decide where to open.
    if (items.every((i) => i.answered)) openEssay();
    else show();
  } else if (items.length && index >= items.length && items.every((i) => i.answered)) {
    // A reload on a finished block goes back to the recap, because there is
    // nothing left to answer and the summary is what the sitting was for.
    await closeBlock();
  } else if (blockKind === 'lesson' && lesson && !items.some((i) => i.answered)) {
    // A lesson level opens on the lesson itself; the check questions come after.
    renderLesson();
  } else {
    show();
  }
});
