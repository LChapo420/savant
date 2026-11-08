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
 * On a phone (under 768 px; the owner's pick, design-refs/home-clean, option A "Lesson first"), Home is drawn one way, redrawn if the width crosses: the giraffe and its line, one card
 * with the next lesson and the one 3D button (the minutes as a quiet chip on it), then "Your subjects" as square tiles two to a row, the lead one outlined, never listed twice. A subject
 * from the onboarding with no start yet is a wide card in that grid with Take the placement and Pick my grade on it. Unfinished uploads, then one line of quiet links (Add a subject,
 * Today's plan, Past). The study timer's "Start session" is the Menu's quiet "Time a session" row. No progress bars on tiles. Done for today keeps the subjects under it. Upload your own, the stats and the menu are the bottom bar's (js/ui2/shell.js).
 * The menu there is Everything (/dashboard#menu or #everything), as a list: profile first, then Learn, then Settings: colours (css/ui2/accent.css), the chat at the top or the bottom
 * (js/tutor-dock.js's own setting), theme, sign out.
 *
 * On a tablet or desktop (768 px and up; the owner's pick, design-refs/home-clean/desktop.png D1, polished in side-menu.png), Home is the same option A, widened: the giraffe and
 * its line across the top, the one card (with "See the whole path" beside the 3D button), the subjects as raised tiles three to a row (a subject waiting for a start is a dashed tile
 * that opens its two choices under the grid), your uploads; and beside them a quiet side column (#u2-side) with only what the app already knows: today's minutes of the plan, its
 * steps, the streak (unless hidden), the week's minutes (GET /api/ui2/stats) and skills due for review. The two columns come from the home's own width (a container query in
 * css/ui2/app.css), not the window's, so whichever desktop menu the owner picks (js/ui2/shell.js, DESK_NAV) can take its share of the width without touching this file.
 * Under 880 px of home width (a tablet) it is one column, the side column under the rest.
 *
 * What it writes: PUT /api/plan/minutes from the minutes picker, the same call as today's. From the phone's Settings: the chat side (PUT /api/tutor/dock/side, as the chat's own
 * buttons do), the theme (js/style-boot.js and POST /api/prefs, as the profile does) and the colour (this device only). Nothing else.
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
  /** The last seven days' minutes for the wide Home's side column (GET /api/ui2/stats), fetched once, the first time Home is drawn wide. */
  let week;

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
  const levelWords = (e) => (e.status === 'placement_pending' ? 'Not placed yet' : `Level ${e.current_level}`);
  const cardOf = (e) => { const a = root.querySelector(`.subject-card a[href="/path?enrollment=${e.id}"]`); return a ? a.closest('.subject-card') : null; };
  /** A subject's own way on: the link js/dashboard.js worked out for its card, and the card's note if it has one. */
  const hrefOf = (e) => { const c = cardOf(e); const a = c && c.querySelector('.subject-card-act a.btn'); return a ? a.getAttribute('href') : `/path?enrollment=${e.id}`; };
  const materialWords = (m) => {
    if (m.status === 'none') return 'Not started';
    if (m.status === 'building' && !m.total) return 'Being built';
    if (!m.mastered && !m.started) return `${plural(m.total, 'part')}, not started`;
    return `${m.mastered} of ${plural(m.total, 'part')}`;
  };
  const materialHref = (m) => (m.total ? `/my-material-study?id=${m.id}` : '/my-material');


  // ── the phone's Home (option A) ──────────────────────────────────────────
  const PHONE = App.ui2.phone || window.matchMedia('(max-width: 767px)');
  const minutesChip = () => `<button type="button" class="u2-chip-t" id="u2-minutes" aria-haspopup="dialog" aria-label="${plan.minutes} minutes today. Change">${ic('clock')}${plan.minutes} min${ic('chev-d')}</button>`;
  const phoneSquare = (e, cur) => `<a class="u2-opt u2-square${cur ? ' u2-cur' : ''}" href="${esc(hrefOf(e))}" data-enrollment="${e.id}">${App.symbol(e.track)}<span class="u2-sq-t"><b>${esc(e.track.name)}</b><small>${esc(levelWords(e))}${cur ? '<span class="u2-vh">, up next</span>' : ''}</small></span></a>`;
  /** A subject waiting for a start, its two ways in on it: the lead one as the page's card (the 3D pill), the others as wide cards in the grid. Either makes the enrollment the usual way. */
  const phoneWait = (w, isLead) => `<div class="u2-card u2-wait${isLead ? ' u2-wait-lead' : ' u2-wide'}" data-waiting="${esc(w.track.id)}">
      <div class="u2-f-top">${App.symbol(w.track)}<span class="u2-o-t"><b>${esc(w.track.name)}</b><small>${isLead ? 'Not started yet' : 'Pick how to start'}</small></span></div>
      <div class="${isLead ? 'u2-wait-acts' : 'u2-wait-two'}">
        <a class="${isLead ? 'u2-btn' : 'u2-btn2 u2-sm'}" href="${esc(w.placement_href)}" data-start="placement">Take the placement</a>
        <a class="${isLead ? 'u2-btn2' : 'u2-btn2 u2-sm'}" href="${esc(w.pick_href)}" data-start="pick">Pick my grade</a>
      </div>
    </div>`;
  const phoneMaterialRow = (m) => `<a class="u2-opt u2-s-row" href="${materialHref(m)}" data-material="${m.id}">${ic('note')}<span class="u2-o-t"><b>${esc(m.title)}</b><small>${esc(materialWords(m))}</small></span>${ic('chev-r', 'u2-mute')}</a>`;
  const card = (meta, title, body) => `<div class="u2-card u2-hero">${meta ? `<div class="u2-meta">${meta}</div>` : ''}<h1 class="u2-t1" tabindex="-1" id="u2-title">${esc(title)}</h1>${body}</div>`;

  // ── the wide Home's extras (D1): the dashed tile of a subject waiting for a start, and the quiet side column ──
  const wideWait = (w) => `<button type="button" class="u2-opt u2-square u2-wait-sq" data-wait-tile="${esc(w.track.id)}" aria-expanded="false" aria-controls="u2-wait-open">${App.symbol(w.track)}<span class="u2-sq-t"><b>${esc(w.track.name)}</b><small>Pick how to start</small></span></button>`;
  const sec = (title, right) => `<div class="u2-sec"><h2 class="u2-label">${title}</h2>${right || ''}</div>`;
  const SIDE_STEPS = 5;
  /** Only what the app already keeps: the plan's minutes and steps, today's minutes (services/ui-v2-today.js), the streak (the old header's hide rule), the week, skills due. No buttons. */
  function sideColumn(leadId) {
    const blocks = (plan && plan.blocks) || [];
    const first = blocks.find((b) => b.kind !== 'break' && b.href);
    const spent = Math.max(0, Math.round((today && today.spent) || 0));
    const left = Math.max(0, plan.minutes - spent);
    const user = App.ui2.user || {};
    const streak = user.hide_stats ? 0 : Number(user.streak) || 0;
    const pct = Math.min(100, Math.round((spent / Math.max(1, plan.minutes)) * 100));
    const steps = blocks.slice(0, SIDE_STEPS).map((b) => `<li class="${b === first ? 'now' : ''}${b.kind === 'break' ? ' brk' : ''}"><i aria-hidden="true"></i><b>${esc(stepName(b))}</b><em>${mins(b.estMinutes)}</em></li>`).join('');
    const days = (week && week.days) || [];
    const top = Math.max(1, ...days.map((d) => d.minutes));
    const dayName = (iso, how) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: how });
    const due = ((progress && progress.due) || []).length;
    const reviewHref = leadId ? `/review?enrollment=${leadId}` : null;
    return `<aside class="u2-side" id="u2-side" aria-label="Today">
        <div class="u2-side-h"><h2 class="u2-t3">Today</h2>${streak ? `<span class="u2-side-streak" role="img" aria-label="${plural(streak, 'day')} in a row">${ic('flame')}<b aria-hidden="true">${streak}</b></span>` : ''}</div>
        <p class="u2-side-time"><b class="u2-side-n">${spent}</b> of ${plan.minutes} minutes<span>${left} left</span></p>
        <div class="u2-side-bar" role="progressbar" aria-label="Minutes today" aria-valuemin="0" aria-valuemax="${plan.minutes}" aria-valuenow="${Math.min(spent, plan.minutes)}"><i style="width:${pct}%"></i></div>
        ${steps ? `<ol class="u2-side-steps" aria-label="Today's plan">${steps}</ol>` : ''}
        ${blocks.length > SIDE_STEPS ? `<button type="button" class="u2-next u2-side-more" id="u2-peek" aria-haspopup="dialog">All ${blocks.length} steps</button>` : ''}
        ${days.length ? `<div class="u2-side-rule"></div>
        <div class="u2-side-h"><h2 class="u2-t3">This week</h2><span class="u2-side-dim">${week.week_minutes} min</span></div>
        ${week.week_minutes ? '' : '<p class="u2-s u2-side-none">Your week fills in as you study.</p>'}
        <div ${week.week_minutes ? '' : 'hidden '}class="u2-week u2-side-week" role="img" aria-label="Minutes studied each day, the last 7 days: ${esc(days.map((d) => `${dayName(d.date, 'long')} ${d.minutes}`).join(', '))}">
          ${days.map((d) => `<span class="${d.date === week.today ? 'today' : ''}${d.minutes ? '' : ' none'}"><i style="height:${d.minutes ? Math.max(4, Math.round((d.minutes / top) * 44)) : 3}px"></i><em>${esc(dayName(d.date, 'narrow'))}</em></span>`).join('')}
        </div>` : ''}
        ${due && reviewHref ? `<a class="u2-side-link" id="u2-side-review" href="${esc(reviewHref)}">${ic('loop')}${plural(due, 'skill')} due for review</a>` : ''}
      </aside>`;
  }

  function phoneHome(host, { focus, subjects, unfinished, leadId, canPlan, hasPast, finished, wide = false }) {
    const waits = waiting.filter((w) => !subjects.some((e) => e.track && e.track.id === w.track.id)); // a subject is listed once
    const lead = subjects.find((e) => e.id === leadId) || null;
    const waitFirst = !subjects.length && waits.length > 0;
    const leadMaterial = !waitFirst && !subjects.length && unfinished.length && mats.can_upload ? unfinished[0] : null;
    const listed = unfinished.filter((m) => m !== leadMaterial);
    let hero = '';
    if (waitFirst) {
      hero = `<h1 class="u2-t1 u2-wait-title" tabindex="-1" id="u2-title">Choose where to start</h1>
        <p class="u2-m u2-detail">A short placement finds your level, or pick it yourself.</p>
        ${phoneWait(waits[0], true)}`;
    } else if (focus && focus.href && (subjects.length || !unfinished.length)) {
      const meta = `<span>${esc(lead ? `${lead.track.name} · ${levelWords(lead)}` : capital(focus.eyebrow || 'Up next'))}</span>${canPlan ? minutesChip() : ''}`;
      const go = `<a class="${focus.strong ? 'u2-btn' : 'u2-btn2'}" id="u2-start" href="${esc(focus.href)}">${esc(focus.label)}</a>`;
      hero = card(meta, focus.title, `${focus.detail ? `<p class="u2-m u2-detail">${esc(focus.detail)}</p>` : ''}${wide ? `<div class="u2-h-act">${go}${focus.path ? `<a class="u2-next" id="u2-path" href="${esc(focus.path)}">See the whole path</a>` : ''}</div>` : go}`);
    } else if (leadMaterial) {
      hero = card(`<span>Your upload · ${esc(materialWords(leadMaterial))}</span>`, leadMaterial.title, `<a class="u2-btn" id="u2-start" href="${materialHref(leadMaterial)}">${leadMaterial.total ? 'Continue' : 'Make a learning path'}</a>`);
    } else if (!subjects.length && how === 'own' && mats.can_upload) {
      hero = card('<span>Your own material</span>', 'Add your notes', '<p class="u2-m u2-detail">Notes, books or videos. Savant turns them into lessons.</p><a class="u2-btn" id="u2-upload" href="/my-material">Upload your own</a>');
    } else if (!subjects.length) {
      hero = card('', 'Pick your first subject', '<a class="u2-btn" id="u2-start" href="/onboarding">Choose subjects</a>');
    }
    // One grid: every subject once (the lead outlined), then the subjects still waiting, wide.
    const rest = waitFirst ? waits.slice(1) : waits;
    const many = waitFirst ? rest.length > 0 : subjects.length + rest.length > 1;
    const addInLabel = wide && many && !waitFirst;
    const label = waitFirst ? '' : addInLabel ? sec('Your subjects', '<a class="u2-next" id="u2-add-subject" href="/onboarding">Add a subject</a>') : '<h2 class="u2-label">Your subjects</h2>';
    const grid = many ? `${label}<div class="u2-squares" id="u2-subjects">${waitFirst ? '' : subjects.map((e) => phoneSquare(e, !!lead && e === lead)).join('')}${rest.map((w) => (wide ? wideWait(w) : phoneWait(w, false))).join('')}</div>${wide ? '<div id="u2-wait-open" class="u2-waits" aria-live="polite"></div>' : ''}` : '';
    // Wide: Past sits on the uploads' label, Upload your own beside it (the desktop menu has no Upload yet), and today's steps are in the side column.
    const side = wide && canPlan;
    const pastInLabel = wide && hasPast && listed.length > 0;
    const links = [];
    if (!addInLabel && !waitFirst && subjects.length <= 1 && (subjects.length || mats.materials.length)) links.push('<a class="u2-next" id="u2-add-subject" href="/onboarding">Add a subject</a>');
    if (!side && canPlan && (plan.blocks || []).length) links.push('<button type="button" class="u2-next" id="u2-peek" aria-haspopup="dialog">Today\'s plan</button>');
    if (hasPast && !pastInLabel) links.push('<a class="u2-next" id="u2-past-link" href="#past">Past</a>');
    let uploads = '';
    if (listed.length) {
      const right = wide ? `<span class="u2-sec-r">${mats.can_upload ? '<a class="u2-next" id="u2-upload" href="/my-material">Upload your own</a>' : ''}${pastInLabel ? '<a class="u2-next" id="u2-past-link" href="#past">Past</a>' : ''}</span>` : '';
      uploads = `<section class="u2-h-sec" id="u2-material" aria-label="Your uploads">${wide ? sec('Your uploads', right) : '<h2 class="u2-label">Your uploads</h2>'}<div class="u2-rows">${listed.map(phoneMaterialRow).join('')}</div></section>`;
    } else if (wide && mats.can_upload && !leadMaterial && !(how === 'own' && !subjects.length)) {
      uploads = `<section class="u2-h-sec" id="u2-material" aria-label="Your material"><h2 class="u2-label">Your material</h2><div class="u2-rows"><a class="u2-opt u2-s-row" id="u2-upload" href="/my-material">${ic('upload')}<span class="u2-o-t"><b>Upload your own</b><small>Notes, books or videos become lessons</small></span>${ic('chev-r', 'u2-mute')}</a></div></section>`;
    }
    const done = finished ? `<section class="u2-h-sec" id="u2-done" aria-label="Done for today"><div class="u2-card u2-hero u2-done-card">
        <span class="u2-ck" aria-hidden="true">${ic('check')}</span>
        <h1 class="u2-t1" tabindex="-1" id="u2-title">See you tomorrow</h1>
        <p class="u2-m u2-detail">${today.spent} of your ${plan.minutes} minutes.${focus && focus.title ? ` Next: ${esc(focus.title)}.` : ''}</p>
        <button type="button" class="u2-btn2" id="u2-keep-going">Keep going</button></div></section>` : '';
    const sections = `
        ${done}
        <section class="u2-h-sec" id="u2-continue" aria-label="Continue">
          ${finished ? '' : hero}
          ${grid}
        </section>
        ${uploads}
        ${links.length ? `<p class="u2-links">${links.join('')}</p>` : ''}`;
    host.innerHTML = wide
      ? `<div class="u2-home-body u2-ha u2-hd${side ? ' u2-hd-two' : ''}"><div class="u2-hd-main">${sections}</div>${side ? sideColumn(leadId) : ''}</div>`
      : `<div class="u2-home-body u2-ha">${sections}</div>`;
    return { waitFirst };
  }

  function guideInto(slot, words, id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (id) btn.id = id;
    const host = document.createElement('span');
    btn.appendChild(host);
    // Home's own giraffe is the bust at every width (D1: it leads the page, it doesn't fill it); Past keeps the whole one on a wide screen.
    App.ui2.look.giraffe(host, { crop: id === 'u2-giraffe' || !window.matchMedia('(min-width: 768px)').matches ? 'bust' : 'full', mood: 'idle' });
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
    const wide = !PHONE.matches;
    if (wide && week === undefined) { try { week = await App.api.get('/api/ui2/stats'); } catch { week = null; } }
    const focus = await focusOf();
    if (req !== focusReq) return;
    // The empty page's other first steps live in here once moved; keep them through a redraw.
    const keep = host.querySelector('.empty-state');
    if (keep) { keep.hidden = true; root.appendChild(keep); }
    const subjects = active();
    const unfinished = mats.materials.filter((m) => !m.complete);
    const hasPast = !!(mats.materials.some((m) => m.complete) || ((progress && progress.recent) || []).length || ((progress && progress.enrollments) || []).some((e) => e.status === 'graduated'));
    const leadId = focus && focus.block ? focus.block.enrollmentId : (leadCard() ? leadCard().id : null);
    const canPlan = !!(plan && subjects.length);
    const finished = doneForToday(canPlan);
    const shown = phoneHome(host, { focus, subjects, unfinished, leadId, canPlan, hasPast, finished, wide });
    afterDraw(host, finished, shown.waitFirst, focus);
    // Wide: a waiting subject's dashed tile opens its two ways in under the grid.
    host.querySelectorAll('[data-wait-tile]').forEach((b) => b.addEventListener('click', () => {
      const w = waiting.find((x) => x.track.id === b.dataset.waitTile);
      const slot = host.querySelector('#u2-wait-open');
      if (!w || !slot) return;
      const open = b.getAttribute('aria-expanded') !== 'true';
      host.querySelectorAll('[data-wait-tile]').forEach((x) => { x.classList.toggle('on', open && x === b); x.setAttribute('aria-expanded', String(open && x === b)); });
      slot.innerHTML = open ? phoneWait(w, false) : '';
    }));
  }
  /** What both layouts do once drawn: Keep going, the giraffe and its words, and the empty page's other first steps. */
  function afterDraw(host, finished, waitFirst, focus) {
    const keepGoing = host.querySelector('#u2-keep-going');
    if (keepGoing) {
      keepGoing.addEventListener('click', async () => {
        try { sessionStorage.setItem(`u2-keep-${today.date}`, '1'); } catch { /* it just asks again next load */ }
        keptGoing = true;
        await drawHome();
      });
    }
    guideInto(host, finished ? 'Done for today.' : waitFirst ? 'Where should we start?' : (how === 'own' || how === 'both') && !mats.materials.length ? "Add your notes when you're ready." : focus || mats.materials.length ? 'Ready when you are.' : 'Let\'s get you started.', 'u2-giraffe');
    // The empty page's other first steps (the style quiz, the survey) stay on the page, under the sections. Not while subjects wait: its "Choose subjects" would ask again.
    const empty = root.querySelector('.empty-state');
    if (empty && !waitFirst) { empty.hidden = false; host.querySelector('.u2-home-body').appendChild(empty); }
    // Owner, 8 Nov: with subjects waiting, the old "Pick your first subject" stayed under the page on desktop, out of place. It waits hidden.
    else if (empty) empty.hidden = true;
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
    if (peek) { const d = openSheet('Today\'s plan', stepsBody(), peek); d.dataset.kind = 'steps'; return; }
    if (ev.target.closest('#u2-t-timer') && !App.ui2.startStudy()) App.toast('The study timer is not available here.', 'error');
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
    const name = String(user.display_name || user.username || 'You');
    const timer = !!user.retention; // js/study.js's strip comes with it (js/app.js); the row shows only while that strip is idle
    all.innerHTML = `
      <h1 class="u2-vh" tabindex="-1" id="u2-all-title">Everything</h1>
      <div class="u2-guide" id="u2-all-guide"><span id="u2-all-g"></span><div class="u2-tailwrap"><div class="u2-bubble">Where to next?</div></div></div>
      <div class="u2-all-body">
        <section class="u2-ph" id="u2-me"><h2 class="u2-vh">You</h2><a class="u2-list u2-li u2-prof" href="/profile"><span class="u2-av" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase() || 'Y')}</span><span class="u2-o-t"><b>${esc(name)}</b><small>Profile and account</small></span>${ic('chev-r', 'u2-mute')}</a></section>
        <section id="u2-all-subjects"><h2 class="u2-vh">Your subjects</h2><div id="u2-subject-slot"></div><a class="u2-opt u2-all-add" href="/onboarding">${ic('plus')}<b>Add a subject</b></a></section>
        <section id="u2-all-plan" ${plan ? '' : 'hidden'}><h2 class="u2-time-h">Time today</h2><div id="u2-all-picker"></div></section>
        <section id="u2-all-else">
          <h2 class="u2-vh">Everything else</h2>
          <h2 class="u2-label u2-ph" aria-hidden="true">Learn</h2>
          <div class="u2-grid">
            <button type="button" class="u2-opt u2-ph" id="u2-t-subjects" aria-expanded="false" aria-controls="u2-all-subjects">${ic('book')}<b>Subjects</b></button>
            ${reviewHref ? tile(reviewHref, 'loop', 'Review', due.length ? `<span class="u2-count" aria-label="${plural(due.length, 'skill')} due">${due.length}</span>` : '') : ''}
            ${mats.can_upload ? tile('/my-material', 'note', 'My material', '', 'id="u2-row-material"') : ''}
            ${tile('/dashboard#past', 'history', 'Past', '', 'id="u2-row-past"')}
            ${tileBtn('u2-t-calendar', 'calendar', 'Calendar', opens('u2-panel-calendar'))}
            ${recent ? tileBtn('u2-t-recent', 'history', 'Sessions', opens('u2-panel-recent')) : ''}
            ${tile('/profile', 'user', 'Profile', '', 'data-dt')}
            ${home ? tileBtn('u2-t-extras', 'chat', 'Tutor', opens('u2-panel-extras')) : ''}
            ${user.can_browse ? tile('/curriculum', 'book', 'Curriculum') : ''}
            ${user.is_admin ? tile('/game-lab', 'target', 'Game lab') + tile('/admin', 'settings', 'Admin') : ''}
            ${timer ? `<button type="button" class="u2-opt u2-ph" id="u2-t-timer">${ic('clock')}<b>Time a session</b></button>` : ''}
            <button type="button" class="u2-opt" id="u2-theme" data-dt>${ic(dark ? 'sun' : 'moon')}<b>${dark ? 'Light theme' : 'Dark theme'}</b></button>
            <button type="button" class="u2-opt" id="u2-signout" data-dt>${ic('out')}<b>Sign out</b></button>
          </div>
          <div class="u2-panel" id="u2-panel-calendar" hidden></div>
          ${recent ? '<div class="u2-panel" id="u2-panel-recent" hidden></div>' : ''}
          ${home ? '<div class="u2-panel" id="u2-panel-extras" hidden></div>' : ''}
        </section>
        <section class="u2-ph" id="u2-settings">
          <h2 class="u2-label">Settings</h2>
          <div class="u2-list">
            <div class="u2-li">${ic('swatch')}<b class="u2-li-t" id="u2-l-colour">Colours</b><span class="u2-swatches" role="radiogroup" aria-labelledby="u2-l-colour">${ACCENTS.map(([k, label]) => `<button type="button" role="radio" class="u2-sw" data-accent-set="${k}" aria-label="${label}" aria-checked="false"><i></i></button>`).join('')}</span></div>
            <div class="u2-li">${ic('chat')}<b class="u2-li-t" id="u2-l-chat">Chat</b><span class="u2-seg" role="radiogroup" aria-labelledby="u2-l-chat"><button type="button" role="radio" data-side-set="top" aria-checked="false">Top</button><button type="button" role="radio" data-side-set="bottom" aria-checked="false">Bottom</button></span></div>
            <div class="u2-li">${ic('moon')}<b class="u2-li-t" id="u2-l-theme">Theme</b><span class="u2-seg" role="radiogroup" aria-labelledby="u2-l-theme"><button type="button" role="radio" data-theme-set="light" aria-checked="false">Light</button><button type="button" role="radio" data-theme-set="dark" aria-checked="false">Dark</button><button type="button" role="radio" data-theme-set="auto" aria-checked="false">Auto</button></span></div>
            <button type="button" class="u2-li" id="u2-set-signout">${ic('out')}<b class="u2-li-t">Sign out</b></button>
          </div>
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
    phoneSettings(all);
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

  // ── the phone's Menu: Subjects opens the real cards; Settings ────────────
  const ACCENTS = [['blue', 'Savant blue'], ['ink', 'Ink'], ['plum', 'Plum']];
  const stored = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  function markSettings(all) {
    const accent = document.documentElement.dataset.accent || 'blue';
    const side = stored('savant.tutor.side') === 'top' ? 'top' : 'bottom';
    const theme = stored('polymath.theme');
    const pick = (attr, now) => all.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute(attr) === now)));
    pick('data-accent-set', accent);
    pick('data-side-set', side);
    pick('data-theme-set', theme === 'light' || theme === 'dark' ? theme : 'auto');
  }
  function phoneSettings(all) {
    const subjectsBtn = all.querySelector('#u2-t-subjects');
    subjectsBtn.addEventListener('click', () => {
      const open = all.classList.toggle('u2-subj-open');
      subjectsBtn.setAttribute('aria-expanded', String(open));
    });
    all.querySelector('#u2-set-signout').addEventListener('click', () => { const b = document.getElementById('logout'); if (b) b.click(); });
    all.querySelector('#u2-settings').addEventListener('click', async (ev) => {
      const accent = ev.target.closest('[data-accent-set]');
      const side = ev.target.closest('[data-side-set]');
      const theme = ev.target.closest('[data-theme-set]');
      if (accent) {
        const k = accent.dataset.accentSet;
        if (k === 'blue') delete document.documentElement.dataset.accent; else document.documentElement.dataset.accent = k;
        try { if (k === 'blue') localStorage.removeItem('savant.u2.accent'); else localStorage.setItem('savant.u2.accent', k); } catch { /* this page only */ }
        App.announce(`${accent.getAttribute('aria-label')} on`);
      } else if (side) {
        const k = side.dataset.sideSet;
        // The chat's own button when it is open, so it moves now; otherwise its stored choice, local and on the account, as that button saves it.
        const own = document.querySelector(`.tdock-panel .s-${k}`);
        if (own) own.click();
        else {
          try { localStorage.setItem('savant.tutor.side', k); } catch { /* the account keeps it */ }
          App.api.request('PUT', '/api/tutor/dock/side', { side: k }).catch(() => {});
        }
        App.announce(`Chat at the ${k}`);
      } else if (theme && window.SavantStyle) {
        const k = theme.dataset.themeSet;
        window.SavantStyle.setTheme(k === 'auto' ? null : k);
        markSettings(all);
        try { await App.api.post('/api/prefs', { style: 'auto' }); } catch { /* kept on this device */ }
        App.announce(k === 'auto' ? 'Theme follows your device' : `${capital(k)} theme`);
      } else return;
      markSettings(all);
    });
    markSettings(all);
  }

  // ── which view ───────────────────────────────────────────────────────────
  function applyView(moveFocus) {
    const view = /^#(everything|menu)$/.test(location.hash) ? 'everything' : location.hash === '#past' ? 'past' : 'home';
    if (view === 'past' && document.documentElement.classList.contains('u2-ready')) buildPast();
    document.documentElement.dataset.u2View = view;
    const menu = document.getElementById('u2-menu');
    if (menu) {
      menu.innerHTML = ic(view === 'home' ? 'menu' : 'x');
      menu.setAttribute('aria-label', view === 'home' ? 'Open everything' : view === 'past' ? 'Close past' : 'Close everything');
      menu.setAttribute('href', view === 'home' ? '/dashboard#everything' : '/dashboard');
    }
    const named = document.getElementById('u2-tb-view');
    if (named) named.textContent = view === 'everything' ? 'Menu' : view === 'past' ? 'Past' : '';
    document.title = view === 'everything' ? `${PHONE.matches ? 'Menu' : 'Everything'} | Savant` : view === 'past' ? 'Past | Savant' : 'Home | Savant';
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
        } else if (/^#(everything|menu)$/.test(location.hash)) {
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
  const crossed = () => { if (built && document.getElementById('u2-home')) { drawHome(); applyView(false); } };
  if (PHONE.addEventListener) PHONE.addEventListener('change', crossed);
  const check = () => { if (root.querySelector('.home, .empty-state')) build(); };
  if (window.MutationObserver) new MutationObserver(check).observe(root, { childList: true });
}());
