/* Today's review: one short sitting a day that keeps what this grade already
 * taught (staged round 3, ADAPT_REVIEW_SESSION).
 *
 * The page says what is due and why, from the learner's own record: memory
 * checks on what they proved a day or more ago, things the forgetting curve
 * says are fading, and things that will not last a month yet. Each is one
 * question, answered with feedback. Anything they have forgotten is not a
 * question here: it is listed to learn again, from its own lesson.
 *
 * Nothing on this page moves the learner's level.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const host = document.getElementById('review');
  const enrollmentId = Number(App.query('enrollment'));
  const esc = App.escapeHtml;
  if (!enrollmentId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }
  const pathHref = `/path?enrollment=${enrollmentId}`;

  let data;
  try {
    data = await App.api.get(`/api/review/${enrollmentId}`);
  } catch (err) {
    host.innerHTML = `<div class="notice notice-error">${esc(err.status === 404 ? 'There is no daily review on this subject.' : err.message)}
      <div style="margin-top:10px"><a class="btn btn-sm" href="${pathHref}">Back to your path</a></div></div>`;
    return;
  }
  const { track, grade } = data;
  let plan = data.review;
  // Folded into the retention enforcers (ENFORCER_FOLD_REVIEW): only older work is left here.
  const reviewName = () => (plan && plan.folded ? 'Older work to keep' : "Today's review");

  // Why an objective is in today's review, in the learner's words.
  const WHY = {
    memory_check: 'Memory check',
    fading: 'Fading',
    durability: 'Make it last',
  };
  const WHY_LONG = {
    memory_check: 'You proved it a day or more ago. One question now shows whether it stuck, and counts it as kept.',
    fading: 'Not asked for a while, and likely to be slipping.',
    durability: 'Kept for now, but not yet likely to last a month.',
  };

  function head(title, sub) {
    const [gradeMain] = App.gradeParts(grade.name);
    return `
      <div class="path-top review-top" data-subject="${esc(track.id)}">
        <div>
          <a class="back-link" href="${pathHref}">${window.icon('arrow-left')}Your path</a>
          <div class="track-heading">
            ${App.symbol(track, { size: 'lg' })}
            <div>
              <h1>${esc(title)}</h1>
              <span class="tiny">${esc(track.name)}, ${esc(gradeMain)}.${sub ? ` ${sub}` : ''}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  function gateMeters(p) {
    if (!p) return '';
    const kept = p.gate.total - p.gate.blocking;
    return `
      <div class="tmeters review-meters">
        ${App.tmeter({ label: 'Objectives proven and kept', value: kept, target: p.gate.total, max: p.gate.total, unit: 'count' })}
        ${App.tmeter({ label: `Likely to last ${p.durability.horizon} days`, value: p.durability.share, target: p.durability.at })}
      </div>`;
  }

  function reteachList(rows) {
    if (!rows || !rows.length) return '';
    return `
      <section class="review-section" aria-labelledby="relearn-h">
        <h2 class="section-title" id="relearn-h">Learn again</h2>
        <p class="small muted review-note">You proved ${rows.length === 1 ? 'this' : 'these'} once and ${rows.length === 1 ? 'it has' : 'they have'} slipped since. Open the lesson and answer its questions; that is what proves it again. About <span class="num">${rows[0].minutes}</span> minutes each.</p>
        <ol class="review-list">
          ${rows.map((r) => `
            <li class="review-row">
              <span>
                <span class="review-title">${esc(App.cleanTitle(r.title))}</span>
                <span class="review-why">${esc(r.covers)}</span>
              </span>
              <a class="btn btn-sm" href="/session?enrollment=${enrollmentId}&level=${r.lesson_level}">Open the lesson<span class="visually-hidden">: ${esc(App.cleanTitle(r.title))}</span></a>
            </li>`).join('')}
        </ol>
      </section>`;
  }

  // Skills due in the learner's own courses: reviewed in their own quiz, never inside this sitting.
  function ownMaterialSection() {
    const m = plan && plan.own_material;
    if (!m || !m.total) return '';
    return `<section class="review-section" data-material-due aria-labelledby="own-h">
      <h2 class="section-title" id="own-h">Your own material</h2>
      <p class="small muted review-note"><span class="num">${m.total}</span> skill${m.total === 1 ? ' is' : 's are'} due for review in what you uploaded. They have their own quiz.</p>
      <ol class="review-list">
        ${m.materials.map((x) => `<li class="review-row"><span><a class="review-title" href="/my-material-study?id=${encodeURIComponent(x.material_id)}">${esc(x.title)}</a></span><span class="review-kind num">${x.due_count}</span></li>`).join('')}
      </ol>
    </section>`;
  }

  function overview() {
    if (!plan) {
      host.innerHTML = `${head(reviewName())}
        <div class="notice" style="margin-top:20px">This grade has no objective record to review from yet.</div>`;
      return;
    }
    const n = plan.retrieve.length;
    const counts = plan.counts || {};
    const resume = !!plan.open_session;
    const lede = n
      ? `<span class="num">${n}</span> question${n === 1 ? '' : 's'}, about <span class="num">${Math.max(1, Math.round(plan.minutes))}</span> minute${Math.round(plan.minutes) === 1 ? '' : 's'}. Each one is on something this grade has already taught you.`
      : plan.done_today
        ? 'Done for today. The next review is ready tomorrow or once something is due.'
        : 'Nothing is due for review today.';
    host.innerHTML = `
      ${head(reviewName())}
      <div class="review-now">
        <div>
          ${n ? '' : `<p class="path-done-line">${window.mark('tick')}${esc(plan.done_today ? 'Review done for today.' : 'Nothing to review today.')}</p>`}
          <p class="review-lede">${lede}</p>
          ${n ? `
            <dl class="facts review-facts">
              ${counts.memory_check ? `<div><dt>Memory checks</dt><dd>${counts.memory_check}</dd></div>` : ''}
              ${counts.fading ? `<div><dt>Fading</dt><dd>${counts.fading}</dd></div>` : ''}
              ${counts.durability ? `<div><dt>Make it last</dt><dd>${counts.durability}</dd></div>` : ''}
            </dl>
            <div class="path-actions">
              <button class="btn btn-primary btn-lg" type="button" id="start">${resume ? 'Carry on with the review' : 'Start the review'}</button>
              <span class="small">Answers are marked as you go. Nothing here changes your level.</span>
            </div>` : `<div class="path-actions"><a class="btn btn-primary" href="${pathHref}">Back to your path</a></div>`}
          ${plan.more ? `<p class="tiny muted">${plan.more} more ${plan.more === 1 ? 'is' : 'are'} due and will come up in the next review.</p>` : ''}
        </div>
        <div class="hero-body">${gateMeters(plan)}</div>
      </div>
      ${n ? `
        <section class="review-section" aria-labelledby="due-h">
          <h2 class="section-title" id="due-h">What is in it</h2>
          <ol class="review-list">
            ${plan.retrieve.map((r) => `
              <li class="review-row">
                <span>
                  <span class="review-title">${esc(App.cleanTitle(r.title))}</span>
                  <span class="review-why">${esc(WHY_LONG[r.reason] || '')}</span>
                </span>
                <span class="review-kind">${esc(WHY[r.reason] || 'Review')}</span>
              </li>`).join('')}
          </ol>
        </section>` : ''}
      ${reteachList(plan.reteach)}
      ${ownMaterialSection()}`;
    const start = document.getElementById('start');
    if (start) start.addEventListener('click', () => begin(start));
  }

  // ── the sitting ──────────────────────────────────────────────────────────
  let sitting = null;
  let items = [];
  let index = 0;
  let askedAt = Date.now();

  async function begin(button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>Setting up';
    try {
      sitting = await App.api.post(`/api/review/${enrollmentId}/start`, {});
    } catch (err) {
      App.toast(err.message, 'error');
      button.disabled = false;
      button.textContent = 'Start the review';
      return;
    }
    items = sitting.items;
    index = items.findIndex((i) => !i.answered);
    if (index === -1) index = items.length;
    host.innerHTML = `
      <div class="player" data-subject="${esc(track.id)}">
        <div class="player-head">
          <a class="icon-btn player-close" href="${pathHref}" title="Leave and go back to your path" aria-label="Leave and go back to your path">${window.icon('x')}</a>
          <div class="player-titles">
            <h1 id="title">${esc(reviewName())}</h1>
            <div id="subtitle">${esc(track.name)}. Questions on what this grade already taught you.</div>
          </div>
          <div class="player-chips"><span class="chip counter" id="counter"></span></div>
          <div class="player-meter">
            <div class="segments" id="segments" aria-hidden="true"></div>
            <span class="visually-hidden" id="pct"></span>
          </div>
        </div>
        <div class="card" id="item"></div>
      </div>`;
    if (index >= items.length) { finish(); return; }
    show();
  }

  function progress() {
    const answered = items.filter((i) => i.answered).length;
    document.getElementById('counter').textContent = `${Math.min(index + 1, items.length)} / ${items.length}`;
    document.getElementById('pct').textContent = `${answered} of ${items.length} answered`;
    document.getElementById('segments').innerHTML = items.map((it, i) => `<i class="${it.answered
      ? (it.correct === true ? 'is-correct' : it.correct === false ? 'is-wrong' : 'is-answered')
      : i === index ? 'is-now' : ''}"></i>`).join('');
  }

  function show() {
    const item = items[index];
    const itemHost = document.getElementById('item');
    progress();
    askedAt = Date.now();
    Player.render(itemHost, item, {
      label: WHY[item.review_reason] || null,
      // A memory check is answered unaided; the coach would turn it into a lesson.
      coach: false,
      onSubmit: async (answer, meta = {}) => {
        let result;
        try {
          result = await App.api.post(`/api/sessions/${sitting.session_id}/answer`, {
            item_id: item.id,
            answer,
            ms: Date.now() - askedAt,
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
        const last = index + 1 >= items.length;
        Player.reveal(itemHost, item, result, {
          nextLabel: last ? 'Finish the review' : 'Next question',
          onNext: () => { index += 1; if (index >= items.length) finish(); else show(); },
        });
      },
    });
  }

  async function finish() {
    host.innerHTML = '<div class="loading"><span class="spinner"></span>Saving your review</div>';
    let out;
    try {
      out = await App.api.post(`/api/review/sessions/${sitting.session_id}/finish`, {});
    } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
      return;
    }
    let fresh = null;
    try { fresh = (await App.api.get(`/api/review/${enrollmentId}`)).review; } catch { fresh = null; }
    plan = fresh || plan;
    const kept = out.gate ? out.gate.total - out.gate.blocking : null;
    host.innerHTML = `
      ${head('Review done')}
      <div class="review-now">
        <div>
          <p class="path-done-line">${out.answered && out.right === out.answered ? window.mark('tick') : ''}${out.right} of ${out.answered} right.</p>
          <dl class="facts review-facts">
            <div><dt>Right</dt><dd>${App.pct(out.accuracy)}</dd></div>
            ${out.xp ? `<div><dt>XP</dt><dd>+${out.xp}</dd></div>` : ''}
            ${out.streak ? `<div><dt>Days in a row</dt><dd>${out.streak}</dd></div>` : ''}
            ${kept !== null ? `<div><dt>Kept in this grade</dt><dd>${kept} / ${out.gate.total}</dd></div>` : ''}
          </dl>
          <p class="small">${out.right < out.answered
    ? 'What you missed comes back soon, and anything that has slipped is listed to learn again.'
    : 'Every one held. Each right answer a day or more apart makes it last longer.'}</p>
          <div class="path-actions">
            <a class="btn btn-primary" href="${pathHref}">Back to your path</a>
            <a class="btn btn-text" href="/dashboard">Dashboard</a>
          </div>
        </div>
        <div class="hero-body">${gateMeters(plan)}</div>
      </div>
      ${reteachList(out.reteach)}`;
    App.announce(`Review done. ${out.right} of ${out.answered} right.`);
  }

  overview();
});
