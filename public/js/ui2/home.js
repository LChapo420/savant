/* Home and Everything (docs/UI-V2.md, structure A, "One next thing"). Loaded before js/dashboard.js when UI_V2 is on.
 *
 * js/dashboard.js runs untouched and draws today's page into #root, with every decision it always made: placement, checkpoints, a held Final, catch-ups, retake, the planner, the offers.
 * This file then shows that work two ways, on the one page:
 *
 *   Home        Continue: a row per subject, each with its own next step from the card js/dashboard.js drew, and the one strong button on the plan's first step (GET /api/plan/today, the same reply and
 *               first step as today's "Start" button; with no step, the lead card's own wording and link). Your material: upload, then unfinished uploads. A link to Past. The time picker and the day's plan stay, quietly.
 *   Past        /dashboard#past: finished uploads, finished paths and levels, past sessions, each with a way to reopen it. Read only.
 *   Everything  /dashboard#everything: the real subject cards, planner, recent sessions, offers and the rest, moved into one menu. Moved, not copied, so their listeners keep working.
 *               Other pages link here rather than keep a second copy of any of it.
 *
 * What it writes: PUT /api/plan/minutes from the minutes picker, the same call as today's. Nothing else.
 */
(function () {
  if (!window.App || !App.ui2) return;
  const { ic, gets } = App.ui2;
  const esc = App.escapeHtml;
  const PRESETS = [30, 45, 60, 90, 120];
  const root = document.getElementById('root');
  if (!root) return;

  let plan = null;
  let progress = null;
  let built = false;
  let focusReq = 0;
  let cameFromHome = false;
  let mats = { can_upload: false, materials: [] };
  let pastBuilt = false;
  /** Subjects picked in the private beta's onboarding that still need a start (GET /api/ui2/waiting, services/onboarding-v2.js waitingFor). */
  let waiting = [];
  /** What the learner chose at "How do you want to learn?" (curriculum, own, both), from /api/ui2/waiting. */
  let how = null;

  // ── small pieces ─────────────────────────────────────────────────────────
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const stepName = (b) => {
    if (b.kind === 'break') return 'Take a break';
    if (b.enforcer) return b.scheduledEnforcer ? 'End day session' : 'Finish your retention enforcer';
    const what = b.kind === 'review' ? 'Review' : b.placement ? 'Placement quiz' : `${b.kind === 'catchup' ? 'Catch-up level' : 'Level'} ${b.level}`;
    // The subject's short name when this is one of the learner's enrollments; the plan's own title (it can carry the whole grade) otherwise.
    const e = ((progress && progress.enrollments) || []).find((x) => x.id === b.enrollmentId);
    const subject = e ? e.track.name : App.noDash(b.subject || '');
    return subject ? `${what}: ${subject}` : what;
  };
  const mins = (m) => `${Math.round(Number(m) * 10) / 10} min`;
  const textOf = (node) => {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('.visually-hidden').forEach((n) => n.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };
  const tile = (href, icon, title, extra = '', attrs = '') => `<a class="u2-opt" href="${href}" ${attrs}>${ic(icon)}<b>${esc(title)}</b>${extra}</a>`;
  const tileBtn = (id, icon, title, attrs = '') => `<button type="button" class="u2-opt" id="${id}" ${attrs}>${ic(icon)}<b>${esc(title)}</b></button>`;
  const opens = (panel) => `aria-expanded="false" aria-controls="${panel}" data-u2-panel="${panel}"`;
  const picker = () => `
    <div class="u2-picker" role="group" aria-label="Minutes you have today">
      <span class="u2-vh">I have</span>
      ${PRESETS.map((m) => `<button type="button" class="u2-chip${plan && m === plan.minutes ? ' on' : ''}" data-minutes="${m}" aria-pressed="${!!(plan && m === plan.minutes)}" aria-label="${m} minutes">${m}</button>`).join('')}
      <span>min</span>
    </div>`;

  // ── what the one task is ─────────────────────────────────────────────────
  const leadCard = () => {
    const card = root.querySelector('.plan-next');
    if (!card) return null;
    const button = card.querySelector('a.btn');
    const whole = card.querySelector('.next-links a[href^="/path"]');
    const m = whole ? /enrollment=(\d+)/.exec(whole.getAttribute('href')) : null;
    return {
      card,
      id: m ? Number(m[1]) : null,
      heading: textOf(card.querySelector('h2')).replace(/^Next:\s*/, ''),
      detail: textOf(card.querySelector('.next-detail')),
      label: textOf(button),
      href: button ? button.getAttribute('href') : null,
      strong: !!(button && button.classList.contains('btn-primary')),
      symbol: card.querySelector('.symbol') ? card.querySelector('.symbol').outerHTML : '',
      path: whole ? whole.getAttribute('href') : null,
    };
  };
  const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  async function focusOf() {
    const lead = leadCard();
    const blocks = (plan && plan.blocks) || [];
    const first = blocks.find((b) => b.kind !== 'break' && b.href);
    if (!first) {
      if (!lead) return null;
      return { icon: lead.symbol, eyebrow: 'Up next', title: capital(lead.heading), detail: lead.detail, href: lead.href, label: lead.label, strong: lead.strong, path: lead.path };
    }
    const about = `about ${Math.round(first.estMinutes)} ${Math.round(first.estMinutes) === 1 ? 'minute' : 'minutes'}`;
    if (first.enforcer) return { icon: `<span class="u2-square u2-lg">${ic('target')}</span>`, eyebrow: 'Up next', title: stepName(first), detail: first.why || capital(about), href: first.href, label: 'Start', strong: true, path: lead && lead.path, block: first };
    if (first.kind === 'review') {
      return { icon: `<span class="u2-square u2-lg">${ic('loop')}</span>`, eyebrow: 'Up next', title: stepName(first), detail: first.why ? `${first.why}. ${capital(about)}.`.replace(/\.\./g, '.') : capital(about), href: first.href, label: 'Start the review', strong: true, path: first.enrollmentId ? `/path?enrollment=${first.enrollmentId}` : (lead && lead.path), block: first };
    }
    const e = ((progress && progress.enrollments) || []).find((x) => x.id === first.enrollmentId);
    const symbol = e ? App.symbol(e.track, { size: 'lg' }) : (lead ? lead.symbol : '');
    const path = first.enrollmentId ? `/path?enrollment=${first.enrollmentId}` : (lead && lead.path);
    const grade = e ? App.gradeParts(e.grade.name)[0] : '';
    const where = e ? `${e.track.name}, ${grade}.` : '';
    if (first.placement) {
      return { icon: symbol, eyebrow: 'Up next', title: e ? `Find your level in ${e.track.name}` : stepName(first), detail: `${where} A placement quiz of about ${Math.round(first.estMinutes)} minutes finds where you start.`.trim(), href: first.href, label: 'Take the placement quiz', strong: true, path: null, block: first };
    }
    // The level's own title, from the path the lead card already asked for, or this subject's own.
    let title = stepName(first);
    let kind = null;
    if (e && first.level) {
      const url = `/api/path/${e.id}?view=ticks`;
      try {
        const reply = await (gets.get(url) || App.api.get(url));
        const node = (reply.nodes || []).find((n) => n.level === first.level);
        if (node) {
          kind = node.kind || node.type || null;
          const parts = App.levelParts(node);
          if (parts && parts.title) title = parts.title;
        }
      } catch { /* the plain name stands */ }
    }
    const sameAsLead = lead && lead.id === first.enrollmentId && e && e.current_level === first.level;
    const label = sameAsLead && lead.label ? lead.label : first.checkpoint && kind ? `Take the ${App.levelName(kind)}` : kind === 'lesson' ? `Start lesson ${first.level}` : `Start level ${first.level}`;
    const note = sameAsLead && lead.detail && !/^0 of /.test(lead.detail) ? ` ${lead.detail}` : '';
    return {
      icon: symbol,
      eyebrow: `${e ? `${e.track.name}, ` : ''}${first.kind === 'catchup' ? 'catch-up ' : ''}level ${first.level}`,
      title,
      detail: note.trim(),
      href: first.href,
      label: label.replace(/^Start lesson \d+$/, 'Start lesson'),
      strong: true,
      path,
      block: first,
    };
  }

  // ── Home ─────────────────────────────────────────────────────────────────
  // ── pieces of Home ───────────────────────────────────────────────────────
  const active = () => ((progress && progress.enrollments) || []).filter((e) => e.status !== 'graduated');
  const shareOf = (e) => { const total = Number(e.grade && e.grade.pathLength) || 0; return e.status === 'placement_pending' || !total ? 0 : Math.max(2, Math.min(100, Math.round(((e.current_level - 1) / total) * 100))); };
  const levelWords = (e) => (e.status === 'placement_pending' ? 'Not placed yet' : `Level ${e.current_level}`);
  const cardOf = (e) => { const a = root.querySelector(`.subject-card a[href="/path?enrollment=${e.id}"]`); return a ? a.closest('.subject-card') : null; };
  /** A subject's own way on: the link js/dashboard.js worked out for its card, and the card's note if it has one. */
  const hrefOf = (e) => { const c = cardOf(e); const a = c && c.querySelector('.subject-card-act a.btn'); return a ? a.getAttribute('href') : `/path?enrollment=${e.id}`; };
  const mini = (pct, id) => `<span class="u2-mini" aria-hidden="true"><i style="width:${pct}%${id ? `;background:var(--s-${esc(id)}, var(--act))` : ''}"></i></span>`;
  const subjectRow = (e) => `<a class="u2-opt u2-s-row" href="${esc(hrefOf(e))}" data-enrollment="${e.id}">${App.symbol(e.track)}<span class="u2-o-t"><b>${esc(e.track.name)}</b><small>${esc(levelWords(e))}</small></span>${mini(shareOf(e), e.track.id)}${ic('chev-r', 'u2-mute')}</a>`;
  /** Two or more subjects: square raised tiles, two to a row. A waiting subject opens its placement / pick-a-grade choice under the grid. */
  const tileWords = (e) => (e.status === 'placement_pending' ? 'Needs a start' : `Level ${e.current_level}`);
  const subjectTile = (e) => `<a class="u2-opt u2-square" href="${esc(hrefOf(e))}" data-enrollment="${e.id}">${App.symbol(e.track)}<b>${esc(e.track.name)}</b><small>${esc(tileWords(e))}</small>${mini(shareOf(e), e.track.id)}</a>`;
  const waitTile = (w) => `<button type="button" class="u2-opt u2-square" data-wait-tile="${esc(w.track.id)}" aria-expanded="false">${App.symbol(w.track)}<b>${esc(w.track.name)}</b><small>Needs a start</small></button>`;
  const materialWords = (m) => {
    if (m.status === 'none') return 'Not started';
    if (m.status === 'building' && !m.total) return 'Being built';
    if (!m.mastered && !m.started) return `${plural(m.total, 'part')}, not started`;
    return `${m.mastered} of ${plural(m.total, 'part')}`;
  };
  const materialHref = (m) => (m.total ? `/my-material-study?id=${m.id}` : '/my-material');
  /** A subject from the onboarding with no start yet: the placement (Quick, the strong pill) or a grade picked from the list. Either makes the enrollment the usual way. */
  const waitCard = (w) => `<div class="u2-feature u2-wait" data-waiting="${esc(w.track.id)}">
      <div class="u2-f-top">${App.symbol(w.track)}<span class="u2-o-t"><b>${esc(w.track.name)}</b><small>Not started yet</small></span></div>
      <div class="u2-wait-acts">
        <a class="u2-btn" href="${esc(w.placement_href)}" data-start="placement">Take the placement</a>
        <a class="u2-btn2" href="${esc(w.pick_href)}" data-start="pick">Pick my grade</a>
      </div>
    </div>`;
  const materialRow = (m) => `<a class="u2-opt u2-s-row" href="${materialHref(m)}" data-material="${m.id}">${ic('note')}<span class="u2-o-t"><b>${esc(m.title)}</b><small>${esc(materialWords(m))}</small></span>${m.total ? mini(Math.round((m.mastered / m.total) * 100)) : ''}${ic('chev-r', 'u2-mute')}</a>`;

  function guideInto(slot, words, id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (id) btn.id = id;
    const host = document.createElement('span');
    btn.appendChild(host);
    App.ui2.look.giraffe(host, { crop: window.matchMedia('(min-width: 768px)').matches ? 'full' : 'bust', mood: 'idle' });
    App.ui2.look.bind(btn);
    const guide = document.createElement('div');
    guide.className = 'u2-guide';
    guide.appendChild(btn);
    guide.insertAdjacentHTML('beforeend', `<div class="u2-tailwrap"><div class="u2-bubble">${esc(words)}</div></div>`);
    slot.prepend(guide);
    document.documentElement.classList.add('u2-has-guide');
  }

  async function drawHome() {
    const host = document.getElementById('u2-home');
    if (!host) return;
    const req = ++focusReq;
    const focus = await focusOf();
    if (req !== focusReq) return;
    const subjects = active();
    const unfinished = mats.materials.filter((m) => !m.complete);
    const hasPast = !!(mats.materials.some((m) => m.complete) || ((progress && progress.recent) || []).length || ((progress && progress.enrollments) || []).some((e) => e.status === 'graduated'));
    const leadId = focus && focus.block ? focus.block.enrollmentId : (leadCard() ? leadCard().id : null);
    const lead = subjects.find((e) => e.id === leadId) || null;
    const rest = subjects.filter((e) => e !== lead);
    const nothing = !subjects.length && !mats.materials.length;
    let main = '';
    const waitFirst = !subjects.length && waiting.length > 0;
    const squares = subjects.length + waiting.length > 1;
    const grid = `<div class="u2-squares" id="u2-subjects">${subjects.map(subjectTile).join('')}${waiting.map(waitTile).join('')}</div><div id="u2-wait-open" class="u2-waits" aria-live="polite"></div>`;
    if (waitFirst) {
      main = `<h1 class="u2-t1 u2-wait-title" tabindex="-1" id="u2-title">Choose where to start</h1>
        <p class="u2-m u2-detail">A short placement finds your level, or pick it yourself.</p>
        ${squares ? grid : `<div class="u2-waits">${waiting.map(waitCard).join('')}</div>`}`;
    } else if (focus && focus.href && (subjects.length || !unfinished.length)) {
      // The one strong button: the plan's next step.
      main = `<div class="u2-feature">
        ${lead ? `<div class="u2-f-top">${App.symbol(lead.track)}<span class="u2-o-t"><b>${esc(lead.track.name)}</b><small>${esc(levelWords(lead))}</small></span>${mini(shareOf(lead), lead.track.id)}</div>` : ''}
        <h1 class="u2-t1" tabindex="-1" id="u2-title">${esc(focus.title)}</h1>
        ${focus.detail ? `<p class="u2-m u2-detail">${esc(focus.detail)}</p>` : ''}
        <a class="${focus.strong ? 'u2-btn' : 'u2-btn2'}" id="u2-start" href="${esc(focus.href)}">${esc(focus.label)}</a>
      </div>`;
    } else if (!subjects.length && unfinished.length && mats.can_upload) {
      const m = unfinished[0];
      main = `<div class="u2-feature">
        <div class="u2-f-top">${ic('note')}<span class="u2-o-t"><b>Your material</b><small>${esc(materialWords(m))}</small></span>${m.total ? mini(Math.round((m.mastered / m.total) * 100)) : ''}</div>
        <h1 class="u2-t1" tabindex="-1" id="u2-title">${esc(m.title)}</h1>
        <a class="u2-btn" id="u2-start" href="${materialHref(m)}">${m.total ? 'Continue' : 'Make a learning path'}</a>
      </div>`;
    } else if ((nothing || !subjects.length) && how === 'own') {
      main = ''; // own material: Your material below has the way on
    } else if (nothing || !subjects.length) {
      main = `<div class="u2-feature"><h1 class="u2-t1" tabindex="-1" id="u2-title">Pick your first subject</h1><a class="u2-btn" id="u2-start" href="/onboarding">Choose subjects</a></div>`;
    }
    const leadMaterial = !waitFirst && !subjects.length && unfinished.length && mats.can_upload ? unfinished[0] : null;
    const listed = unfinished.filter((m) => m !== leadMaterial);
    const canPlan = !!(plan && subjects.length);
    host.innerHTML = `
      <div class="u2-home-body">
        <section class="u2-h-sec" id="u2-continue" aria-label="Continue">
          ${subjects.length ? '<h2 class="u2-h">Continue</h2>' : ''}
          ${main}
          ${squares && subjects.length ? grid : ''}
          ${!squares && rest.length ? `<div class="u2-rows">${rest.map(subjectRow).join('')}</div>` : ''}
          ${!squares && subjects.length && waiting.length ? `<h2 class="u2-h">Choose where to start</h2><div class="u2-waits">${waiting.map(waitCard).join('')}</div>` : ''}
          ${!subjects.length && !waiting.length && mats.materials.length ? `<a class="u2-opt u2-s-row" id="u2-add-subject" href="/onboarding">${ic('plus')}<b>Add a subject</b></a>` : ''}
          ${canPlan ? `<div class="u2-quiet">
            <button type="button" class="u2-chip-t" id="u2-minutes" aria-haspopup="dialog" aria-label="${plan.minutes} minutes today. Change">${ic('clock')}${plan.minutes} min${ic('chev-d')}</button>
            ${(plan.blocks || []).length ? '<button type="button" class="u2-next" id="u2-peek" aria-haspopup="dialog">Today\'s plan</button>' : ''}
          </div>` : ''}
        </section>
        ${mats.can_upload ? `
        <section class="u2-h-sec" id="u2-material" aria-label="Your material">
          <h2 class="u2-h">Your material</h2>
          <div class="u2-rows">
            <a class="u2-opt u2-s-row" id="u2-upload" href="/my-material">${ic('upload')}<b>Upload your own</b></a>
            ${listed.map(materialRow).join('')}
          </div>
        </section>` : ''}
        ${hasPast ? `<a class="u2-btn2" id="u2-past-link" href="#past">Past</a>` : ''}
      </div>`;
    const finished = doneForToday(canPlan);
    if (finished) {
      const go = host.querySelector('#u2-continue');
      go.hidden = true;
      go.insertAdjacentHTML('beforebegin', `<section class="u2-h-sec" id="u2-done" aria-label="Done for today"><div class="u2-feature"><h1 class="u2-t1" tabindex="-1" id="u2-title">Done for today</h1><p class="u2-m u2-detail" style="margin:0 auto">${today.spent} of your ${plan.minutes} minutes.</p><button type="button" class="u2-btn2" id="u2-keep-going">Keep going</button></div></section>`);
      host.querySelector('#u2-keep-going').addEventListener('click', async () => {
        try { sessionStorage.setItem(`u2-keep-${today.date}`, '1'); } catch { /* it just asks again next load */ }
        keptGoing = true;
        await drawHome();
      });
    }
    guideInto(host, finished ? 'Done for today.' : waitFirst ? 'Where should we start?' : (how === 'own' || how === 'both') && !mats.materials.length ? "Add your notes when you're ready." : focus || mats.materials.length ? 'Ready when you are.' : 'Let\'s get you started.', 'u2-giraffe');
    host.querySelectorAll('[data-wait-tile]').forEach((b) => b.addEventListener('click', () => {
      const w = waiting.find((x) => x.track.id === b.dataset.waitTile);
      const slot = host.querySelector('#u2-wait-open');
      if (!w || !slot) return;
      host.querySelectorAll('[data-wait-tile]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-expanded', String(x === b)); });
      slot.innerHTML = waitCard(w);
    }));
    // The empty page's other first steps (the style quiz, the survey) stay on the page, under the sections. Not while subjects wait: its "Choose subjects" would ask again.
    const empty = root.querySelector('.empty-state');
    if (empty && !waitFirst) host.querySelector('.u2-home-body').appendChild(empty);
  }

  // ── Past ─────────────────────────────────────────────────────────────────
  const dayWords = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  const KIND = { placement: 'Placement', session: 'Session', checkpoint: 'Checkpoint', skip: 'Challenge exam', lesson: 'Lesson', spanish: 'Activities' };
  const pastRow = (group, href, icon, title, sub) => `<a class="u2-opt u2-s-row" data-past="${group}" href="${esc(href)}">${icon}<span class="u2-o-t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${ic('chev-r', 'u2-mute')}</a>`;
  async function buildPast() {
    if (pastBuilt) return;
    pastBuilt = true;
    const past = document.createElement('div');
    past.id = 'u2-past';
    past.innerHTML = '<h1 class="u2-vh" tabindex="-1" id="u2-past-title">Past</h1><div class="u2-home-body" id="u2-past-body"><p class="u2-m">Loading</p></div>';
    root.appendChild(past);
    guideInto(past, 'What you have finished.');
    const all = (progress && progress.enrollments) || [];
    const uploads = mats.materials.filter((m) => m.complete).map((m) => pastRow('uploads', `/my-material-study?id=${m.id}`, ic('note'), m.title, `All ${plural(m.total, 'part')} done${m.due ? `, ${plural(m.due, 'review')} due` : ''}`));
    const paths = all.filter((e) => e.status === 'graduated').map((e) => pastRow('subjects', `/path?enrollment=${e.id}`, App.symbol(e.track), `${e.track.name}, ${App.gradeParts(e.grade.name)[0]}`, 'Path finished'));
    // Levels finished: what the path itself marks done. Placed or skipped past isn't finished, and set-aside levels aren't counted.
    const levels = [];
    await Promise.all(all.filter((e) => e.status !== 'graduated' && e.status !== 'placement_pending').map(async (e) => {
      const url = `/api/path/${e.id}?view=ticks`;
      try {
        const reply = await (gets.get(url) || App.api.get(url));
        const done = (reply.nodes || []).filter((n) => n.state === 'done' && !['known', 'unseen'].includes(n.unit_status) && !n.deferred);
        if (done.length) levels.push(pastRow('subjects', `/path?enrollment=${e.id}`, App.symbol(e.track), e.track.name, `${plural(done.length, 'level')} finished`));
      } catch { /* nothing to show for this subject */ }
    }));
    const byTrack = (id) => all.find((e) => e.track.id === id);
    const sessions = ((progress && progress.recent) || []).map((r) => {
      const e = byTrack(r.track_id);
      const lv = (r.levels && r.levels.length ? r.levels : [r.level]).filter(Boolean);
      const where = r.kind === 'placement' || !lv.length ? '' : `, level ${lv.length > 1 ? `${lv[0]} to ${lv[lv.length - 1]}` : lv[0]}`;
      const score = r.score == null || !r.answered ? '' : `, ${Math.round(r.score * r.answered)} of ${r.answered}`;
      return pastRow('sessions', e ? `/path?enrollment=${e.id}` : '/dashboard', e ? App.symbol(e.track) : ic('history'), `${e ? e.track.name : KIND[r.kind] || 'Session'}${where}`, `${dayWords(r.ended_at)}, ${KIND[r.kind] || 'Session'}${score}`);
    });
    const groups = [['uploads', 'Uploads', uploads], ['subjects', 'Subjects', [...paths, ...levels]], ['sessions', 'Sessions', sessions]].filter((g) => g[2].length);
    const body = document.getElementById('u2-past-body');
    if (!groups.length) { body.innerHTML = '<p class="u2-m u2-past-none">Nothing here yet. What you finish will show up here.</p>'; return; }
    body.innerHTML = `
      ${groups.length > 1 ? `<div class="u2-picker u2-past-filter" role="group" aria-label="Show"><button type="button" class="u2-chip on" data-past-show="all" aria-pressed="true">All</button>${groups.map((g) => `<button type="button" class="u2-chip" data-past-show="${g[0]}" aria-pressed="false">${g[1]}</button>`).join('')}</div>` : ''}
      ${groups.map((g) => `<section class="u2-h-sec" data-past-group="${g[0]}"><h2 class="u2-h">${g[1]}</h2><div class="u2-rows">${g[2].join('')}</div></section>`).join('')}`;
    body.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-past-show]');
      if (!b) return;
      const want = b.dataset.pastShow;
      body.querySelectorAll('[data-past-show]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      body.querySelectorAll('[data-past-group]').forEach((g) => { g.hidden = want !== 'all' && g.dataset.pastGroup !== want; });
    });
  }

  // ── sheets: the day's steps, and the minutes ─────────────────────────────
  function openSheet(title, body, opener) {
    const dlg = document.createElement('dialog');
    dlg.className = 'u2-dialog';
    dlg.setAttribute('aria-label', title);
    dlg.innerHTML = `
      <div class="u2-dialog-head"><b class="u2-t3">${esc(title)}</b><button type="button" class="u2-ib" data-close aria-label="Close">${ic('x')}</button></div>
      <div class="u2-dialog-body">${body}</div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.close(); };
    dlg.addEventListener('close', () => { dlg.remove(); if (opener && opener.isConnected) opener.focus(); else { const again = opener && opener.id && document.getElementById(opener.id); if (again) again.focus(); } });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) close(); });
    dlg.showModal();
    return dlg;
  }
  function stepsBody() {
    const blocks = (plan && plan.blocks) || [];
    const first = blocks.find((b) => b.kind !== 'break' && b.href);
    return `
      ${picker()}
      <ol class="u2-steps">${blocks.map((b) => `
        <li class="${b === first ? 'now' : ''}">
          <span class="u2-sb"><b>${esc(stepName(b))}</b><span class="u2-num">${mins(b.estMinutes)}</span></span>
          ${b.why ? `<small>${esc(b.why)}</small>` : ''}
        </li>`).join('')}</ol>
      <p class="u2-s">About ${Math.round(plan.minutes_used)} of your ${plan.minutes} minutes${plan.break_minutes ? `, ${plan.break_minutes} of them breaks` : ''}. Estimates use your own pace once Savant has seen enough of it.</p>`;
  }

  async function setMinutes(minutes, holder) {
    try {
      await App.api.request('PUT', '/api/plan/minutes', { minutes });
      plan = await App.api.get(`/api/plan/today?minutes=${minutes}`);
      await drawHome();
      drawAllPicker();
      if (holder) {
        const body = holder.querySelector('.u2-dialog-body');
        if (body && holder.dataset.kind === 'steps') body.innerHTML = stepsBody();
        else if (body) body.innerHTML = picker();
        const again = holder.querySelector(`[data-minutes="${minutes}"]`);
        if (again) again.focus();
      } else {
        const again = document.querySelector(`#u2-all [data-minutes="${minutes}"]`);
        if (again) again.focus();
      }
      App.announce(`${minutes} minutes today.`);
    } catch (err) { App.toast(err.message, 'error'); }
  }
  document.addEventListener('click', (ev) => {
    const pick = ev.target.closest('[data-minutes]');
    if (pick) { setMinutes(Number(pick.getAttribute('data-minutes')), pick.closest('dialog')); return; }
    const minutes = ev.target.closest('#u2-minutes');
    if (minutes) { const d = openSheet('Minutes you have today', picker(), minutes); d.dataset.kind = 'minutes'; return; }
    const peek = ev.target.closest('#u2-peek');
    if (peek) { const d = openSheet('Today\'s plan', stepsBody(), peek); d.dataset.kind = 'steps'; }
  });

  // ── Everything ───────────────────────────────────────────────────────────
  function drawAllPicker() {
    const slot = document.getElementById('u2-all-picker');
    if (slot) slot.innerHTML = plan ? picker() : '';
  }
  function buildAll() {
    const user = App.ui2.user || {};
    const home = root.querySelector('.home');
    const all = document.createElement('div');
    all.id = 'u2-all';
    const leadHref = (name) => { const lead = leadCard(); return lead && lead.id ? `/${name}?enrollment=${lead.id}` : null; };
    const due = (progress && progress.due) || [];
    const reviewHref = leadHref('review') || (user.retention ? '/calendar' : null);
    const dark = document.documentElement.dataset.mode === 'dark';
    const recent = !!(progress && progress.recent && progress.recent.length);
    all.innerHTML = `
      <h1 class="u2-vh" tabindex="-1" id="u2-all-title">Everything</h1>
      <div class="u2-guide" id="u2-all-guide"><span id="u2-all-g"></span><div class="u2-tailwrap"><div class="u2-bubble">Where to next?</div></div></div>
      <div class="u2-all-body">
        <section id="u2-all-subjects"><h2 class="u2-vh">Your subjects</h2><div id="u2-subject-slot"></div><a class="u2-opt u2-all-add" href="/onboarding">${ic('plus')}<b>Add a subject</b></a></section>
        <section id="u2-all-plan" ${plan ? '' : 'hidden'}><h2 class="u2-time-h">Time today</h2><div id="u2-all-picker"></div></section>
        <section id="u2-all-else">
          <h2 class="u2-vh">Everything else</h2>
          <div class="u2-grid">
            ${reviewHref ? tile(reviewHref, 'loop', 'Review', due.length ? `<span class="u2-count" aria-label="${plural(due.length, 'skill')} due">${due.length}</span>` : '') : ''}
            ${mats.can_upload ? tile('/my-material', 'note', 'My material', '', 'id="u2-row-material"') : ''}
            ${tile('/dashboard#past', 'history', 'Past', '', 'id="u2-row-past"')}
            ${tileBtn('u2-t-calendar', 'calendar', 'Calendar', opens('u2-panel-calendar'))}
            ${recent ? tileBtn('u2-t-recent', 'history', 'Sessions', opens('u2-panel-recent')) : ''}
            ${tile('/profile', 'user', 'Profile')}
            ${home ? tileBtn('u2-t-extras', 'chat', 'Tutor', opens('u2-panel-extras')) : ''}
            ${user.can_browse ? tile('/curriculum', 'book', 'Curriculum') : ''}
            ${user.is_admin ? tile('/game-lab', 'target', 'Game lab') + tile('/admin', 'settings', 'Admin') : ''}
            <button type="button" class="u2-opt" id="u2-theme">${ic(dark ? 'sun' : 'moon')}<b>${dark ? 'Light theme' : 'Dark theme'}</b></button>
            <button type="button" class="u2-opt" id="u2-signout">${ic('out')}<b>Sign out</b></button>
          </div>
          <div class="u2-panel" id="u2-panel-calendar" hidden></div>
          ${recent ? '<div class="u2-panel" id="u2-panel-recent" hidden></div>' : ''}
          ${home ? '<div class="u2-panel" id="u2-panel-extras" hidden></div>' : ''}
        </section>
      </div>`;
    root.appendChild(all);
    drawAllPicker();

    if (home) {
      // The real parts, moved: their listeners are on these nodes and go with them.
      const cards = home.querySelector('.subject-cards');
      if (cards) {
        document.getElementById('u2-subject-slot').appendChild(cards);
        cards.querySelectorAll('.subject-card').forEach((c) => { c.insertAdjacentHTML('beforeend', ic('chev-r', 'u2-mute u2-card-chev')); });
      }
      const calendarBody = all.querySelector('#u2-panel-calendar');
      if (calendarBody) {
        const planner = home.querySelector('#planner');
        if (planner) calendarBody.appendChild(planner);
        if (user.retention) calendarBody.insertAdjacentHTML('beforeend', '<a class="u2-a" href="/calendar">Open the calendar</a>');
      }
      const recentBody = all.querySelector('#u2-panel-recent');
      if (recentBody) { const recent = home.querySelector('.recent-card'); if (recent) recentBody.appendChild(recent); }
      const extras = all.querySelector('#u2-panel-extras');
      extras.insertAdjacentHTML('afterbegin', '<button type="button" class="u2-a" id="u2-talk" style="background:none;border:0;cursor:pointer">Talk to your tutor</button>');
      extras.querySelector('#u2-talk').addEventListener('click', () => { const d = document.querySelector('.tdock-g-btn'); if (d) d.click(); });
      const aside = home.querySelector('.home-aside');
      const tutorHost = home.querySelector('#tutor-host');
      if (aside) { while (aside.firstChild) extras.appendChild(aside.firstChild); }
      if (tutorHost) extras.appendChild(tutorHost);
    }

    // The menu's own giraffe. Tiles that hold more open a panel under the grid.
    const gSlot = document.getElementById('u2-all-g');
    const gBtn = document.createElement('button');
    gBtn.type = 'button';
    const gHost = document.createElement('span');
    gBtn.appendChild(gHost);
    gSlot.replaceWith(gBtn);
    App.ui2.look.giraffe(gHost, { crop: window.matchMedia('(min-width: 768px) and (max-width: 1024px)').matches ? 'full' : 'bust' });
    App.ui2.look.bind(gBtn);
    all.querySelectorAll('[data-u2-panel]').forEach((t) => t.addEventListener('click', () => {
      const open = t.getAttribute('aria-expanded') !== 'true';
      all.querySelectorAll('[data-u2-panel]').forEach((o) => {
        o.setAttribute('aria-expanded', String(o === t && open));
        const p = document.getElementById(o.dataset.u2Panel);
        if (p) p.hidden = !(o === t && open);
      });
    }));

    // What the old header did, in the one list.
    document.getElementById('u2-signout').addEventListener('click', () => { const b = document.getElementById('logout'); if (b) b.click(); });
    const theme = document.getElementById('u2-theme');
    if (!document.getElementById('theme-toggle')) theme.hidden = true;
    theme.addEventListener('click', () => {
      const b = document.getElementById('theme-toggle');
      if (b) b.click();
      const nowDark = document.documentElement.dataset.mode === 'dark';
      theme.querySelector('svg').outerHTML = ic(nowDark ? 'sun' : 'moon');
      theme.querySelector('b').textContent = nowDark ? 'Light theme' : 'Dark theme';
    });

    // Own material due: quiet if none or on any error.
    App.api.get('/api/materials/review-due').then((d) => {
      if (!d || !(d.total || d.cards_total)) return;
      const line = [d.total ? plural(d.total, 'skill') : '', d.cards_total ? plural(d.cards_total, 'flashcard') : ''].filter(Boolean).join(' and ');
      const t = document.querySelector('#u2-row-material');
      if (t) { t.insertAdjacentHTML('beforeend', `<span class="u2-count" aria-hidden="true">${(d.total || 0) + (d.cards_total || 0)}</span>`); t.setAttribute('aria-label', `My material, ${line} due`); }
    }).catch(() => {});
  }

  // ── which view ───────────────────────────────────────────────────────────
  function applyView(moveFocus) {
    const view = location.hash === '#everything' ? 'everything' : location.hash === '#past' ? 'past' : 'home';
    if (view === 'past' && document.documentElement.classList.contains('u2-ready')) buildPast();
    document.documentElement.dataset.u2View = view;
    const menu = document.getElementById('u2-menu');
    if (menu) {
      menu.innerHTML = ic(view === 'home' ? 'menu' : 'x');
      menu.setAttribute('aria-label', view === 'home' ? 'Open everything' : view === 'past' ? 'Close past' : 'Close everything');
      menu.setAttribute('href', view === 'home' ? '/dashboard#everything' : '/dashboard');
    }
    document.title = view === 'everything' ? 'Everything | Savant' : view === 'past' ? 'Past | Savant' : 'Home | Savant';
    if (moveFocus) {
      window.scrollTo(0, 0);
      const target = document.getElementById(view === 'everything' ? 'u2-all-title' : view === 'past' ? 'u2-past-title' : 'u2-title');
      if (target) target.focus({ preventScroll: true });
    }
  }
  App.ui2.onBar = () => {
    applyView(false);
    const menu = document.getElementById('u2-menu');
    if (menu) {
      menu.addEventListener('click', (ev) => {
        if (location.hash === '#past') {
          ev.preventDefault();
          location.hash = '';
        } else if (location.hash === '#everything') {
          ev.preventDefault();
          if (cameFromHome) history.back();
          else location.hash = '';
        } else {
          ev.preventDefault();
          cameFromHome = true;
          location.hash = 'everything';
        }
      });
    }
  };
  window.addEventListener('hashchange', () => { applyView(true); });

  /** The chosen minutes are met and the learner hasn't asked for more. Reads services/ui-v2-today.js against the plan's minutes, so choosing more minutes opens the day again. The plan itself is not touched. */
  let today = null;
  let keptGoing = false;
  function doneForToday(canPlan) {
    if (!canPlan || !today || keptGoing || !(today.spent >= plan.minutes)) return false;
    try { if (sessionStorage.getItem(`u2-keep-${today.date}`)) return false; } catch { /* no storage: asks each load */ }
    return true;
  }

  // ── when js/dashboard.js has drawn ───────────────────────────────────────
  async function build() {
    if (built) return;
    built = true;
    document.documentElement.classList.add('u2-home-page');
    const progressReply = gets.get('/api/progress');
    try { progress = progressReply ? await progressReply : null; } catch { progress = null; }
    const planReply = gets.get('/api/plan/today');
    try { plan = planReply ? await planReply : null; } catch { plan = null; }
    try { mats = await App.api.get('/api/ui2/material-progress'); } catch { mats = { can_upload: false, materials: [] }; }
    try { today = await App.api.get('/api/ui2/today'); } catch { today = null; }
    try { const w = await App.api.get('/api/ui2/waiting'); waiting = w.subjects || []; how = w.how || null; } catch { waiting = []; how = null; }
    const host = document.createElement('div');
    host.id = 'u2-home';
    root.insertBefore(host, root.firstChild);
    await drawHome();
    buildAll();
    document.documentElement.classList.add('u2-ready');
    applyView(false);
  }
  const check = () => { if (root.querySelector('.home, .empty-state')) build(); };
  if (window.MutationObserver) new MutationObserver(check).observe(root, { childList: true });
}());
