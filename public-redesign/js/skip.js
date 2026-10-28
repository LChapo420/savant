/* The Challenge Exam: a way past levels you have already proved you can do.
 *
 * Thirty-five questions in five bands of seven, each band pitched at a level ten
 * marks above the one before it. The bands have to be perfect in order, so the
 * exam only moves you as far as an unbroken run of clean bands reaches — and
 * nothing at all if the first band is not clean, because that first band is the
 * gate. Since 2026-10-25 (evidence P3, CHALLENGE_SPRT) a new exam is a gate of
 * sixteen that holds at fourteen right, then bands of six that allow one miss;
 * the page reads which rule from the bands (`rule`, `needed`, `held`).
 *
 * Answers are held back the whole way through, the same as a checkpoint, and more
 * strictly: where a checkpoint is fifteen questions scored as one whole, this is
 * five bands that each have to stand alone, so showing the running result would
 * hand over the band boundaries and let someone protect a run they have not
 * earned. The result lands all at once at the end, band by band, so a jump of
 * five levels always comes with the reason for it.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const host = document.getElementById('skip');
  const enrollmentId = Number(App.query('enrollment'));
  const resumeId = Number(App.query('session'));

  if (!enrollmentId && !resumeId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  let exam = null;
  let items = [];
  let index = 0;
  let startedAt = Date.now();

  // ── opening ──────────────────────────────────────────────────────────────
  async function open() {
    if (resumeId) {
      // A reload mid-exam: the sitting is still there, so pick it up rather than
      // spending a second offer on a fresh set of questions.
      try {
        exam = await App.api.get(`/api/skip-exam/${resumeId}`);
      } catch (err) {
        host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
        return;
      }
    } else {
      host.innerHTML = '<div class="loading"><span class="spinner"></span>Setting the exam</div>';
      try {
        exam = await App.api.post(`/api/skip-exam/${enrollmentId}`, {});
      } catch (err) {
        // An exam already open is not a dead end — it is the one to finish.
        // A double-tap on the offer, or a reload that lost the session id, both
        // land here, and the server points at the sitting worth carrying on with.
        if (err.payload && err.payload.session_id) {
          window.history.replaceState({}, '', `/skip?enrollment=${enrollmentId}&session=${err.payload.session_id}`);
          try {
            exam = await App.api.get(`/api/skip-exam/${err.payload.session_id}`);
          } catch (inner) {
            host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(inner.message)}</div>`;
            return;
          }
        } else {
          host.innerHTML = `
            <div class="notice notice-warn">${App.escapeHtml(err.message)}</div>
            <div class="row-wrap" style="margin-top:14px">
              <a class="btn btn-primary" href="/path?enrollment=${enrollmentId}">View your path</a>
            </div>`;
          return;
        }
      }
      // Keep the exam reachable by its own id, so a refresh resumes it. On the
      // resume path the id is already in the address bar, so this is a no-op.
      window.history.replaceState({}, '', `/skip?enrollment=${enrollmentId}&session=${exam.session_id}`);
    }

    items = exam.items || [];
    if (exam.ended_at && exam.result) {
      renderResult(exam.result);
      return;
    }
    index = items.findIndex((i) => !i.answered);
    if (index === -1) index = items.length;
    shell();
    if (index >= items.length) finish();
    else show();
  }

  function bandIndexFor(item) {
    return item.band === undefined || item.band === null ? 0 : item.band;
  }

  // The likelihood-ratio rule (evidence P3, CHALLENGE_SPRT): a longer first band
  // that holds at most of its questions right, then bands that allow one miss.
  // An exam built before it (or the owner's) keeps "every band perfect".
  function sprt() {
    return !!(exam && exam.bands && exam.bands[0] && exam.bands[0].rule === 'sprt');
  }

  function neededText(b) {
    return `${b.needed === undefined ? b.count : b.needed} of ${b.count} right`;
  }

  function shell() {
    host.innerHTML = `
      <div class="row-between" style="margin-bottom:14px; flex-wrap:wrap; gap:8px">
        <div>
          <h1 style="margin-bottom:2px">Challenge Exam</h1>
          <div class="small muted" id="subtitle">
            ${sprt() ? `${(exam.bands || []).length} bands, ${(exam.bands || []).reduce((n, b) => n + b.count, 0)} questions` : 'Five bands of seven'}, taken at level ${exam.from_level} — everything above where you stand.
          </div>
        </div>
        <div class="row">
          <span class="chip" id="band-chip"></span>
          <span class="chip chip-accent" id="counter"></span>
        </div>
      </div>
      <div class="card" id="brief"></div>
      <div class="player" id="item"></div>`;

    document.getElementById('brief').innerHTML = `
      <div class="card-title">${window.icon('award')}How this works</div>
      <p class="small muted" style="margin:0 0 10px">
        ${sprt()
    ? `Each band is pitched at the difficulty of one level, and the bands climb:
        ${(exam.bands || []).map((b) => `level ${b.level}`).join(', ')}.
        The first band is the gate: ${neededText(exam.bands[0])} holds it. Each band above it
        holds with at most one miss. A band counts only if every band below it held, and you
        land on the first level that is not proved. If the first band does not hold, nothing is skipped.`
    : `Each band is seven questions at the difficulty of one level, and the bands climb:
        ${(exam.bands || []).map((b) => `level ${b.level}`).join(', ')}.
        A band has to be perfect for the one above it to count, and you land on the
        first level that is not proved. If the first band is not perfect, nothing is skipped.`}
      </p>
      <table class="data"><tbody>
        ${(exam.bands || []).map((b) => `
          <tr><td>Level ${b.level}</td><td class="nowrap">${b.count} questions</td>
            <td>${sprt() ? `holds at ${neededText(b)}` : `skip to ${b.level} if every band below is clean too`}</td></tr>`).join('')}
      </tbody></table>
      <p class="tiny muted" style="margin:10px 0 0">
        Answers are held until the end, so the bands stay independent. The coach is off here —
        this one is a test, and a band that was walked to is not a band that was proved.
      </p>`;
  }

  function progress() {
    const chip = document.getElementById('band-chip');
    const counter = document.getElementById('counter');
    if (chip && counter) counter.textContent = `${Math.min(index + 1, items.length)} of ${items.length}`;
    if (chip) {
      const item = items[index];
      const band = item ? (exam.bands || []).find((b) => b.index === bandIndexFor(item)) : null;
      chip.innerHTML = band ? `${window.icon('layers')}Level ${band.level} band` : '';
    }
  }

  function show() {
    const item = items[index];
    const itemHost = document.getElementById('item');
    if (!item) { itemHost.innerHTML = ''; return; }
    progress();

    const last = index >= items.length - 1;
    Player.render(itemHost, item, {
      label: 'Exam',
      // The coach stays off. It would walk someone to the answer, and a band
      // that was walked is not a band that was proved.
      coach: false,
      onSubmit: async (answer) => {
        let result;
        try {
          result = await App.api.post(`/api/sessions/${exam.session_id}/answer`, {
            item_id: item.id,
            answer,
            ms: Date.now() - startedAt,
          });
        } catch (err) {
          App.toast(err.message, 'error');
          return;
        }
        item.answered = true;
        // The server holds the verdict, so this just moves on. There is nothing
        // to show here and showing something would give the bands away.
        index += 1;
        if (index >= items.length) finish();
        else show();
        return result;
      },
    });
    startedAt = Date.now();
  }

  // ── scoring ──────────────────────────────────────────────────────────────
  async function finish() {
    const itemHost = document.getElementById('item');
    itemHost.innerHTML = '<div class="loading"><span class="spinner"></span>Scoring the bands</div>';
    let result;
    try {
      result = await App.api.post(`/api/skip-exam/${exam.session_id}/finish`, {});
    } catch (err) {
      itemHost.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
      return;
    }
    exam.result = result;
    renderResult(result);
  }

  function renderResult(result) {
    const bands = result.bands || [];
    const moved = result.moved_to;
    // Whether each band held, as the server scored it (`held`); a result stored
    // before that field existed is read as "every band perfect", in order.
    const heldAt = bands.map((b, i) => (b.held !== undefined ? !!b.held : bands.slice(0, i + 1).every((x) => x.total > 0 && x.correct >= x.total)));
    const byRatio = bands.some((b) => b.held !== undefined && b.needed !== undefined && b.needed < b.total);
    const clean = heldAt.filter(Boolean).length;
    // The first band that did not hold is the one that decided the outcome.
    const brokeAt = bands.find((b, i) => !heldAt[i]);
    const nowAt = moved || exam.from_level;

    host.innerHTML = `
      <h1 style="margin-bottom:4px">Challenge Exam</h1>
      <div class="small muted" style="margin-bottom:16px">
        ${result.correct} of ${result.asked} right &middot; ${App.pct(result.accuracy)} overall
        ${result.xp ? `&middot; +${result.xp} XP` : ''}
      </div>

      ${moved
    ? `<div class="notice notice-success">
        <strong>You are now at level ${moved}.</strong>
        ${bands.length > 1 ? `${clean} of ${bands.length} bands ${byRatio ? 'held' : 'were perfect'}` : 'The band held'}${brokeAt
    ? `, and level ${brokeAt.level} is the first one not proved — you skip to it rather than past it.`
    : ' — every band held.'}
      </div>`
    : `<div class="notice notice-warn">
        <strong>No skip this time.</strong>
        ${brokeAt
    ? `The level ${brokeAt.level} band came in at ${brokeAt.correct} of ${brokeAt.total}${byRatio ? ` (${brokeAt.needed} needed)` : ''}, and every band above it depended on that one.`
    : 'Not every band was finished.'}
        You are still at level ${nowAt}. This exam is spent — put another run of clean levels
        together and the next one is offered again.
      </div>`}

      <div class="card" style="margin-top:16px">
        <div class="card-title">${window.icon('layers')}Band by band</div>
        <table class="data">
          <thead><tr><th>Band</th><th>Score</th><th>Effect</th></tr></thead>
          <tbody>
            ${bands.map((b, i) => {
    const held = heldAt[i];
    const decides = brokeAt && brokeAt.index === b.index;
    const effect = held
      ? (i === bands.length - 1 ? 'Skip to here' : 'Counts toward the run')
      : (decides ? 'Stopped the run here' : 'Not reached');
    return `
                <tr>
                  <td>Level ${b.level}</td>
                  <td class="nowrap">${b.correct} of ${b.total}${byRatio ? ` <span class="tiny muted">(${b.needed} needed)</span>` : ''}
                    ${held ? `<span class="chip chip-success">${byRatio ? 'held' : 'clean'}</span>` : ''}</td>
                  <td class="small muted">${effect}</td>
                </tr>`;
  }).join('')}
          </tbody>
        </table>
        <p class="tiny muted" style="margin:10px 0 0">
          ${brokeAt
    ? (byRatio
      ? `A band has to hold for the one above it to count, so the run stopped at level ${brokeAt.level}.`
      : `A band has to be perfect for the one above it to count, so the run stopped at level ${brokeAt.level}.`)
    : 'Every band held, so the whole run counted.'}
        </p>
      </div>

      <div class="row-wrap" style="margin-top:16px">
        <a class="btn btn-primary" href="/path?enrollment=${enrollmentId || ''}">
          ${window.icon('arrow-right')}Back to your path
        </a>
        <a class="btn" href="/dashboard">Dashboard</a>
      </div>`;
  }

  await open();
});
