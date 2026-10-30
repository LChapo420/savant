/* The learner's own view of the model the app keeps on them: what they said, what
 * the sessions showed, and exactly what it changes. Showing this is deliberate —
 * a system that plans your study should be able to explain itself. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');

  const root = document.getElementById('root');
  const [profile, progress, card, act] = await Promise.all([
    App.api.get('/api/profile'),
    App.api.get('/api/progress'),
    App.api.get('/api/scorecard'),
    // ACT practice scores: only what the learner typed in. A failure just leaves the card empty.
    App.api.get('/api/act/scores').catch(() => null),
  ]);
  const masteryOf = new Map(await Promise.all(progress.enrollments
    .filter((e) => e.status !== 'placement_pending')
    .map(async (e) => [e.id, await App.api.get(`/api/mastery/${e.id}`)])));

  /** All hundred stats, grouped and collapsed, with how sure each one is. */
  function scorecardCategories(c) {
    return c.categories.map((cat) => {
      const sure = cat.stats.filter((st) => st.confidence >= 30).length;
      return `<details class="sc-category">
        <summary><span>${App.escapeHtml(cat.name)}</span><span class="tiny muted">${sure} of ${cat.stats.length} measured</span></summary>
        <div>${cat.stats.map((st) => `
          <div class="sc-stat">
            <div class="small" style="font-weight:600">${App.escapeHtml(st.name)}</div>
            <div>
              <div class="meter"><span style="width:${st.score}%; opacity:${(0.25 + 0.75 * st.confidence / 100).toFixed(2)}"></span></div>
              <div class="ends"><span>${App.escapeHtml(st.low)}</span><span style="text-align:right">${App.escapeHtml(st.high)}</span></div>
            </div>
            <div class="num"><strong>${st.score}</strong> <span class="tiny muted">${st.confidence}% sure</span></div>
          </div>`).join('')}
        </div>
      </details>`;
    }).join('');
  }

  function dimensionRows(rows) {
    if (!rows.length) return '<p class="small muted">Nothing recorded yet.</p>';
    return `<table class="data"><tbody>
      ${rows.map((r) => `
        <tr>
          <td>${App.escapeHtml(r.label)}</td>
          <td style="width:40%"><div class="meter"><span style="width:${r.value * 100}%"></span></div></td>
          <td class="small">${App.escapeHtml(r.reads)}</td>
        </tr>`).join('')}
    </tbody></table>`;
  }

  /**
   * What the chosen plan actually does, in words.
   *
   * A plan name on its own tells a learner nothing about what they get, and this
   * feature changes the pages they read rather than anything they can count — so
   * the sentence has to say so. The owner is on pro and still does not get it,
   * deliberately, and saying "not on this account" is honest without explaining
   * who they are.
   */
  function planNote(p) {
    if (p.can_edit_levels) {
      return 'Your levels are written for you: before you reach one, it is rewritten '
        + 'around how you\'ve been doing and what you have said about earlier levels.';
    }
    if (p.subscription === 'pro' || p.subscription === 'school') {
      return 'Level rewriting is not active on this account.';
    }
    return 'On pro and school, each level is rewritten for you before you reach it.';
  }

  /**
   * What the learner told us about themselves, read-only, with a way to change it.
   *
   * Read-only rather than five boxes here as well. The survey has one editor — the
   * page at /survey — and putting a second set of the same boxes on the profile
   * would be two places writing one set of fields, which is how they end up
   * disagreeing about what a learner said.
   */
  function surveyBlock(p) {
    const fields = p.survey_fields || {};
    const answers = p.survey || {};
    const answered = Object.keys(fields).filter((k) => String(answers[k] || '').trim());

    if (!answered.length) {
      return `
        <div class="notice notice-warn" style="margin-bottom:4px">
          <strong>You have not filled this in yet.</strong>
          <p class="small" style="margin:6px 0 8px">
            Your lessons are written around this — what you are interested in, what
            you are studying, and anything else that helps. It takes two minutes and
            every question is optional.
          </p>
          <a class="btn btn-sm btn-primary" href="/survey?next=/profile">Tell us about you</a>
        </div>`;
    }

    return `
      <table class="data"><tbody>
        ${answered.map((k) => `
          <tr>
            <td class="nowrap" style="vertical-align:top; width:34%">${App.escapeHtml(fields[k].label)}</td>
            <td class="small">${App.escapeHtml(String(answers[k]).trim()).replace(/\n/g, '<br>')}</td>
          </tr>`).join('')}
      </tbody></table>
      <div class="row-wrap" style="margin-top:10px">
        <a class="btn btn-sm" href="/survey?next=/profile">Change these answers</a>
        ${answered.length < Object.keys(fields).length
          ? '<span class="small muted">You can fill in the rest at any time.</span>' : ''}
      </div>`;
  }

  /** What the learner has said about levels, newest first. */
  function feedbackRows(rows) {
    if (!rows || !rows.length) {
      return `<div style="margin-top:16px">
        <div class="small" style="font-weight:600; margin-bottom:5px">What you have said about levels</div>
        <p class="small muted" style="margin:0">Nothing yet.</p>
      </div>`;
    }
    return `
      <div style="margin-top:16px">
        <div class="small" style="font-weight:600; margin-bottom:5px">What you have said about levels</div>
        <table class="data"><tbody>
          ${rows.map((f) => `
            <tr>
              <td class="nowrap tiny">${App.escapeHtml(f.track_id)}/${App.escapeHtml(f.grade_id)} &middot; ${f.level}</td>
              <td class="small">
                ${f.liked ? `<div>${window.icon('check')} ${App.escapeHtml(f.liked)}</div>` : ''}
                ${f.disliked ? `<div class="muted">${window.icon('x')} ${App.escapeHtml(f.disliked)}</div>` : ''}
              </td>
            </tr>`).join('')}
        </tbody></table>
      </div>`;
  }

  /* Display and wellbeing (config/ux.js): hide the streak and XP, turn the break line off.
   * Choice raises motivation and effort (Patall et al. 2008) and rewards can undermine
   * interest for some learners (Deci et al. 1999), so the numbers are the learner's to hide. */
  function displayCard() {
    const ux = user.ux || {};
    const rows = [];
    if (ux.hide_stats_setting) {
      rows.push(`<label class="check-row"><input type="checkbox" id="pref-show-stats" ${user.hide_stats ? '' : 'checked'} ${user.hide_stats_by_parent ? 'disabled' : ''}>
        <span>Show my streak and XP
          <span class="tiny muted">${user.hide_stats_by_parent ? 'A parent turned these off. They can turn them back on.' : 'Turn this off to hide the numbers everywhere. They are still counted.'}</span></span></label>`);
    }
    if (ux.break_nudge) {
      rows.push(`<label class="check-row"><input type="checkbox" id="pref-break" ${user.break_nudge_off ? '' : 'checked'}>
        <span>Suggest a break after long study
          <span class="tiny muted">A quiet line under the header after about ${ux.break_after_min || 25} minutes in a row. It never blocks anything. Short breaks help you feel fresher; they may not change your score.</span></span></label>`);
    }
    if (!rows.length) return '';
    return `<h2 class="section-title">${window.icon('settings')}Display and wellbeing</h2><div class="card">${rows.join('')}</div>`;
  }

  const esc = App.escapeHtml;

  // ── top of the page: who, the numbers, the last seven days ─────────────────
  const allSkills = [...masteryOf.values()].flatMap((m) => m.skills || []);
  const mastered = allSkills.filter((k) => k.mastery >= 0.8).length;

  // Questions answered on each of the last seven days, from the learner's own sittings
  // (GET /api/progress `week`). Nothing is estimated: a day with no sitting is an empty bar.
  function weekChart() {
    const days = [];
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      days.push({ d, n: 0, key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` });
    }
    for (const w of progress.week || []) {
      const t = new Date(w.ended_at);
      const hit = days.find((x) => x.key === `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`);
      if (hit) hit.n += Number(w.answered) || 0;
    }
    const total = days.reduce((sum, x) => sum + x.n, 0);
    const top = Math.max(1, ...days.map((x) => x.n));
    const label = days.map((x) => `${x.d.toLocaleDateString(undefined, { weekday: 'long' })} ${x.n}`).join(', ');
    return `
      <div class="card pf-week">
        <div class="sec-head"><h2>Questions answered</h2><span>last 7 days</span></div>
        ${total ? `
        <div class="pf-bars" role="img" aria-label="Questions answered per day, last 7 days: ${esc(label)}">
          ${days.map((x, i) => `
            <div class="pf-bar${i === 6 ? ' today' : ''}${x.n ? '' : ' none'}">
              <span class="pf-bar-n num">${x.n || ''}</span>
              <i style="height:${x.n ? Math.max(8, Math.round((x.n / top) * 100)) : 0}%"></i>
              <b>${x.d.toLocaleDateString(undefined, { weekday: 'short' })}</b>
            </div>`).join('')}
        </div>` : '<p class="small muted pf-empty">No questions answered in the last 7 days yet. Your week fills in as you study.</p>'}
      </div>`;
  }

  function actCard() {
    const p = act && act.profile ? act.profile : {};
    const scores = act && act.scores ? act.scores.filter((x) => x.composite !== null) : [];
    const latest = scores.slice(-2).reverse();
    const days = act ? act.days_to_test : null;
    const head = days !== null && days !== undefined && days >= 0 ? `<span>${days} day${days === 1 ? '' : 's'} to your test</span>` : '';
    return `
      <div class="card pf-act">
        <div class="sec-head"><h2>ACT practice</h2>${head}</div>
        ${latest.length ? `
          <ul class="pf-scores">
            ${latest.map((x) => `<li><b class="num">${x.composite}</b><span>${esc(x.taken_on)}</span></li>`).join('')}
          </ul>
          ${p.target ? `<p class="small muted pf-note">Target ${p.target}${act.points_to_target > 0 ? `, ${act.points_to_target} above your latest` : ', reached'}.</p>` : ''}`
          : '<p class="small muted pf-empty">No practice-test scores yet. Type in the score from each official practice test and see it charted.</p>'}
        <a class="btn btn-sm" href="/act-scores">${latest.length ? 'Open ACT scores' : 'Add a score'}</a>
      </div>`;
  }

  function subjectBars() {
    if (!progress.enrollments.length) {
      return '<div class="card pf-subjects"><div class="sec-head"><h2>Subjects</h2></div><p class="small muted pf-empty">No subjects yet. <a href="/onboarding">Pick one.</a></p></div>';
    }
    return `
      <div class="card pf-subjects">
        <div class="sec-head"><h2>Subjects</h2><span>average mastery</span></div>
        <ul class="pf-mastery">
          ${progress.enrollments.map((e) => {
            const m = masteryOf.get(e.id);
            const skills = m ? m.skills || [] : [];
            if (!skills.length) {
              return `<li data-subject="${esc(e.track.id)}"><span class="pf-m-name">${esc(e.track.name)}</span><span class="pf-m-none">${m ? 'no skills yet' : 'placement not taken'}</span></li>`;
            }
            const avg = skills.reduce((sum, k) => sum + k.mastery, 0) / skills.length;
            return `<li data-subject="${esc(e.track.id)}"><span class="pf-m-name">${esc(e.track.name)}</span><span class="meter"><span style="width:${Math.round(avg * 100)}%"></span></span><span class="pf-m-pct num">${App.pct(avg)}</span></li>`;
          }).join('')}
        </ul>
      </div>`;
  }

  // ── the style picker ("Look") ───────────────────────────────────────────────
  const LOOKS = ['chunky', 'night', 'bento', 'editorial', 'desk', 'notebook'];
  const SW = window.SavantStyle ? window.SavantStyle.STYLES : {};
  function lookCards() {
    const state = window.SavantStyle ? window.SavantStyle.state() : { pref: 'auto' };
    const card = (id, name, note) => {
      const ready = id === 'auto' || (SW[id] && SW[id].ready);
      const on = state.pref === id;
      return `<button type="button" class="look-card${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-look="${id}"${ready ? '' : ' disabled'}>
        <span class="look-swatch" data-swatch="${id}" aria-hidden="true"><i class="sw-bar"></i><i class="sw-line"></i><i class="sw-line s"></i><i class="sw-pill"></i></span>
        <span class="look-name">${esc(name)}</span>
        <span class="look-note">${esc(ready ? note : 'Coming soon')}</span>
      </button>`;
    };
    const notes = { auto: 'Light by day, dark at night', chunky: 'Bold and friendly', night: 'Dark and calm', bento: 'Soft pastel tiles', editorial: 'Like a printed journal', desk: 'Warm paper and ink', notebook: 'Ruled lines, handwritten' };
    return card('auto', 'Auto', notes.auto) + LOOKS.map((id) => card(id, SW[id] ? SW[id].label : id, notes[id])).join('');
  }
  function themeNow() {
    try { const t = window.localStorage.getItem('polymath.theme'); return t === 'light' || t === 'dark' ? t : 'device'; } catch (e) { return 'device'; }
  }
  function lookBlock() {
    const t = themeNow();
    const seg = (v, text) => `<button type="button" class="pf-seg${t === v ? ' on' : ''}" role="radio" aria-checked="${t === v}" data-theme-pick="${v}">${text}</button>`;
    return `
      <div class="sec-head pf-sec"><h2>Look</h2><span>how Savant is drawn</span></div>
      <div class="card pf-look">
        <div class="look-grid" role="radiogroup" aria-label="Look">${lookCards()}</div>
        <div class="pf-appearance">
          <div><b>Light or dark</b><span class="small muted">Used by Auto. Choosing one here puts Look back on Auto.</span></div>
          <div class="pf-segs" role="radiogroup" aria-label="Light or dark">${seg('device', 'Match device')}${seg('light', 'Light')}${seg('dark', 'Dark')}</div>
        </div>
      </div>`;
  }

  const joined = new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const initial = (String(user.display_name || user.email || '?').trim()[0] || '?').toUpperCase();
  const actLine = act && act.profile && act.profile.test_date && act.days_to_test !== null && act.days_to_test >= 0
    ? ` &middot; <b>ACT ${esc(act.profile.test_date)}</b> (${act.days_to_test} day${act.days_to_test === 1 ? '' : 's'})` : '';

  function settingRows() {
    const row = (href, label, value, extra = '') => `<a class="pf-row" href="${href}"${extra}><span class="pf-row-label">${label}</span><span class="pf-row-value">${value}</span>${window.icon('chevron-right')}</a>`;
    const answered = Object.keys(profile.survey_fields || {}).filter((k) => String((profile.survey || {})[k] || '').trim()).length;
    return `
      <div class="card pf-rows">
        ${row('/style-quiz?next=/profile', 'Learning style', profile.took_style_quiz ? 'Taken' : 'Not taken yet')}
        ${row('/survey?next=/profile', 'Interests and goals', answered ? `${answered} answered` : 'Not filled in')}
        ${row('/act-scores', 'ACT scores', act && act.scores && act.scores.length ? `${act.scores.length} recorded` : 'None yet')}
        ${row('/api/account/export', 'Download my data', 'JSON file', ' download')}
      </div>`;
  }

  root.innerHTML = `
    <div class="pf">
    <header class="pf-head">
      <span class="pf-avatar" aria-hidden="true">${esc(initial)}</span>
      <div class="pf-who">
        <h1>${esc(user.display_name)}</h1>
        <p class="muted">${esc(user.email)}, joined ${joined}${actLine}</p>
      </div>
    </header>

    <dl class="pf-stats">
      <div data-stat${user.hide_stats ? ' class="hidden"' : ''}>${window.icon('flame')}<dd class="num">${user.streak || 0}</dd><dt>day streak</dt></div>
      <div data-stat${user.hide_stats ? ' class="hidden"' : ''}>${window.icon('star')}<dd class="num">${user.xp || 0}</dd><dt>total XP</dt></div>
      <div>${window.icon('award')}<dd class="num">${mastered}</dd><dt>skills mastered</dt></div>
      <div>${window.icon('chart')}<dd class="num">${profile.evidence_count}</dd><dt>sessions analyzed</dt></div>
    </dl>

    <div class="pf-grid">
      ${weekChart()}
      ${actCard()}
      ${subjectBars()}
    </div>

    <div class="sec-head pf-sec"><h2>Focus</h2></div>
    <div id="focus-root"></div>

    ${lookBlock()}

    <div class="sec-head pf-sec"><h2>Settings</h2></div>
    ${settingRows()}
    ${displayCard() ? `<div class="pf-display">${displayCard()}</div>` : ''}

    <div class="sec-head pf-sec"><h2>How Savant sees you</h2><span>and what it changes</span></div>
    <h2 class="section-title">${window.icon('settings')}What this changes in your sessions</h2>
    <div class="card">
      <table class="data"><tbody>
        <tr><td>Session length</td><td>${profile.applied.session_length} questions</td></tr>
        <tr><td>Share above your level</td><td>${App.pct(profile.applied.stretch_share)}</td></tr>
        <tr><td>Answer format</td><td>${profile.applied.prefer_type_in ? 'type-in preferred' : 'mixed formats'}</td></tr>
        <tr><td>Feedback timing</td><td>${profile.applied.immediate_feedback ? 'after each question' : 'at the end of the session'}</td></tr>
        <tr><td>Explanation depth</td><td>${App.escapeHtml(profile.applied.explanation_depth)}</td></tr>
        <tr><td>After a wrong answer</td><td>${profile.applied.name_the_error ? 'name the specific mistake' : 'reteach the method'}</td></tr>
        <tr><td>AI tutor and coach</td><td>${profile.ai_enabled
          ? `on via ${App.escapeHtml(profile.ai_provider || 'a model provider')}`
          : 'off (running on the question bank)'}</td></tr>
      </tbody></table>
    </div>

    <div class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <div class="card-title">${window.icon('list')}What you told us</div>
        ${profile.took_style_quiz
          ? dimensionRows(profile.stated)
          : `<p class="small muted">You have not taken the learning-style questionnaire.</p>
             <a class="btn btn-sm btn-primary" href="/style-quiz?next=/profile">Take it now</a>`}
        ${profile.took_style_quiz ? '<a class="btn btn-sm" style="margin-top:10px" href="/style-quiz?next=/profile">Retake it</a>' : ''}
      </div>
      <div class="card">
        <div class="card-title">${window.icon('trending-up')}What your sessions showed</div>
        <p class="small muted">Observed behavior gains weight with every analyzed session and gradually outweighs the questionnaire.</p>
        ${dimensionRows(profile.observed)}
        ${profile.traits.length ? `
          <div style="margin-top:12px">
            <div class="small" style="font-weight:600; margin-bottom:5px">Notes from the tutor</div>
            <ul class="small" style="margin:0; padding-left:18px">${profile.traits.map((t) => `<li>${App.escapeHtml(t)}</li>`).join('')}</ul>
          </div>` : ''}
      </div>
    </div>


    <h2 class="section-title">${window.icon('user')}Your plan</h2>
    <div class="card">
      <label class="field" style="max-width:320px">
        <span>Plan</span>
        <select id="plan-select">
          ${(profile.tiers || ['standard', 'pro', 'school']).map((t) => `
            <option value="${App.escapeHtml(t)}"${t === profile.subscription ? ' selected' : ''}>${App.escapeHtml(t)}</option>`).join('')}
        </select>
      </label>
      <p class="small muted" id="plan-note" style="margin:0">${planNote(profile)}</p>
    </div>

    <h2 class="section-title">${window.icon('edit')}My material</h2>
    <div class="card">
      <p class="small muted">Upload or paste your own notes or a chapter. Savant keeps the text private to you.</p>
      <a class="btn btn-sm" href="/my-material">Open my material</a>
    </div>

    <h2 class="section-title">${window.icon('edit')}Your goals</h2>
    <div class="card" id="goals-card">
      <p class="small muted">What you want from each subject or grade. It shapes how long a placement is and how lessons and practice are set up to start with; how you do as you go keeps adjusting it.</p>
    </div>

    <h2 class="section-title">${window.icon('edit')}Your details report</h2>
    <div class="card">
      <p class="small muted">
        Everything the tutor knows about you, in one place. It is what your own
        version of a level is written from, so it is worth correcting.
      </p>

      ${surveyBlock(profile)}

      <div style="margin-top:16px">
        <div class="small" style="font-weight:600; margin-bottom:5px">What we concluded from your feedback</div>
        ${profile.conclusions && profile.conclusions.length
          ? `<ul class="small" style="margin:0; padding-left:18px">${profile.conclusions.map((c) => `<li>${App.escapeHtml(c)}</li>`).join('')}</ul>`
          : '<p class="small muted" style="margin:0">Nothing yet. Say what you thought of a level and this fills in.</p>'}
      </div>

      ${feedbackRows(profile.feedback_recent)}
    </div>

    <h2 class="section-title">${window.icon('brain')}Your learning scorecard</h2>
    <div class="card">
      <div class="row-between" style="align-items:flex-start; flex-wrap:wrap; gap:10px">
        <p class="small muted" style="margin:0; max-width:62ch">
          One hundred measures of how you've been doing, each scored 0–100 from what you actually do —
          how you read, answer, recover from mistakes, and remember. Confidence shows how much
          evidence stands behind each score; only confident scores change how your levels are written.
        </p>
        <div class="stat-block" style="text-align:right">
          <span class="value">${card.overall_confidence}%</span><span class="label">How well we know you</span>
        </div>
      </div>
      <p class="small" style="margin:14px 0 6px"><strong>${App.escapeHtml(card.summary.headline)}</strong></p>
      ${card.summary.paragraphs.map((p) => `<p class="small" style="margin:4px 0">${App.escapeHtml(p)}</p>`).join('')}
      <div style="margin-top:14px">
        <div class="small" style="font-weight:600; margin-bottom:6px">How your levels are written for you right now</div>
        ${card.applied.length
          ? `<ul class="small" style="margin:0; padding-left:18px">${card.applied.map((d) => `<li>${App.escapeHtml(d.text)} <span class="tiny muted">(${App.escapeHtml(d.name)}, ${d.confidence}% sure)</span></li>`).join('')}</ul>`
          : '<p class="small muted" style="margin:0">Nothing yet — a few levels will show what works for you.</p>'}
        <p class="tiny muted" style="margin:8px 0 0">${card.personalizer
          ? `Levels written for you use ${App.escapeHtml(card.personalizer.model)} (${App.escapeHtml(card.personalizer.provider)}).`
          : 'No AI provider is configured, so the scorecard is measured but levels are not rewritten.'}
          Your interests come from <a href="/survey">About you</a>.</p>
      </div>
    </div>
    ${card.learned.length ? `
      <div class="card" style="margin-top:14px">
        <div class="card-title">${window.icon('brain')}What the tutor has learned about you</div>
        <p class="small muted" style="margin-top:0">Confirmed across several of your levels. Where you struggle, your next levels add a hint at that point.</p>
        <ul class="small" style="margin:0; padding-left:18px">${card.learned.map((f) => `<li>${f.kind === 'struggle' ? '<strong>Working on:</strong> ' : ''}${f.topic ? `${App.escapeHtml(f.topic)} — ` : ''}${App.escapeHtml(f.text)} <span class="tiny muted">(${f.levels} levels)</span></li>`).join('')}</ul>
      </div>` : ''}
    <div style="margin-top:6px">${scorecardCategories(card)}</div>
    ${card.recent.length ? `
      <div class="card" style="margin-top:14px">
        <div class="card-title">${window.icon('trending-up')}Latest evidence</div>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Latest evidence"><table class="data"><tbody>
          ${card.recent.map((r) => `
            <tr>
              <td class="small">${App.escapeHtml(r.name)}</td>
              <td class="tiny nowrap">${r.from} &rarr; ${r.to}</td>
              <td class="tiny muted">${App.escapeHtml(r.note || r.source)}</td>
            </tr>`).join('')}
        </tbody></table></div>
      </div>` : ''}

    <h2 class="section-title">${window.icon('chart')}Mastery by subject</h2>
    <div class="grid grid-2" id="mastery">
      ${progress.enrollments.length ? '' : '<p class="small muted">No subjects yet. <a href="/onboarding">Pick one.</a></p>'}
    </div>

    <div id="invite-host"></div>

    <h2 class="section-title">${window.icon('brain')}What your tutor remembers</h2>
    <div class="card" id="tutor-facts">
      <p class="small muted" style="margin-top:0">Short notes your tutor keeps from your chats so it can help you better next time: goals, ideas you mix up, what explanations worked, what is hard, what you like. Delete any you do not want kept. Notes you do not come back to fade on their own.</p>
      <div id="tutor-facts-list" class="small muted">Loading…</div>
    </div>

    <h2 class="section-title">${window.icon('user')}Your data</h2>
    <div class="card">
      <p class="small muted">Everything the app holds on you, as one JSON file: your profile, every session, every answer, and every event.</p>
      <a class="btn btn-sm" href="/api/account/export" download>Download my data</a>
    </div>
    ${user.under_13 || user.audience === 'kids' || user.is_admin ? '' : `
    <div class="card" id="delete-card">
      <p class="small muted">Delete your account and everything tied to it: your profile, answers, essays, uploaded material and invites. This cannot be undone. Download your data first if you want a copy.</p>
      <form id="delete-form" class="stack" autocomplete="off">
        <label class="small" for="delete-password">Your password</label>
        <input class="input" id="delete-password" type="password" autocomplete="current-password" required>
        <label class="small" for="delete-confirm">Type DELETE to confirm</label>
        <input class="input" id="delete-confirm" type="text" autocomplete="off" required>
        <button class="btn btn-sm" type="submit">Delete my account</button>
      </form>
    </div>`}
    </div>`;

  mountTutorFacts(document.getElementById('tutor-facts-list'));

  // Focus history and subject focus (public/js/focus.js).
  if (window.FocusHistory) window.FocusHistory.mount(document.getElementById('focus-root'));

  const deleteForm = document.getElementById('delete-form');
  if (deleteForm) deleteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = deleteForm.querySelector('button');
    btn.disabled = true;
    try {
      await App.api.post('/api/account/delete', {
        password: document.getElementById('delete-password').value,
        confirm: document.getElementById('delete-confirm').value,
      });
      window.location.href = '/';
    } catch (err) {
      App.toast(err.message, 'error');
      btn.disabled = false;
    }
  });


  // ── Look: pick a style, apply it now, save it to the account ────────────────
  const lookHost = root.querySelector('.pf-look');
  function refreshLook() {
    const state = window.SavantStyle ? window.SavantStyle.state() : { pref: 'auto' };
    lookHost.querySelectorAll('.look-card').forEach((b) => {
      const on = b.dataset.look === state.pref;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    const t = themeNow();
    lookHost.querySelectorAll('.pf-seg').forEach((b) => {
      const on = b.dataset.themePick === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }
  lookHost.addEventListener('click', async (event) => {
    const pick = event.target.closest('[data-look]');
    const theme = event.target.closest('[data-theme-pick]');
    if (pick && !pick.disabled) {
      await App.setStyle(pick.dataset.look);
      refreshLook();
      App.announce(`${pick.querySelector('.look-name').textContent} look on`);
    } else if (theme && window.SavantStyle) {
      const mode = theme.dataset.themePick === 'device' ? null : theme.dataset.themePick;
      window.SavantStyle.setTheme(mode);
      try { await App.api.post('/api/prefs', { style: 'auto' }); } catch (err) { /* kept on this device */ }
      refreshLook();
      App.announce('Look set to Auto');
    }
  });

  // ── display and wellbeing ────────────────────────────────────────────────────
  async function savePref(input, patch, done) {
    input.disabled = true;
    try {
      const out = await App.api.post('/api/prefs', patch);
      Object.assign(user, out.user);
      App.header(user, 'profile');
      root.querySelectorAll('[data-stat]').forEach((row) => row.classList.toggle('hidden', !!user.hide_stats));
      App.toast(done);
    } catch (err) {
      input.checked = !input.checked;
      App.toast(err.message, 'error');
    } finally {
      input.disabled = !!(input.id === 'pref-show-stats' && user.hide_stats_by_parent);
      input.focus();
    }
  }
  const showStats = document.getElementById('pref-show-stats');
  if (showStats) showStats.addEventListener('change', () => savePref(showStats, { hide_stats: !showStats.checked }, showStats.checked ? 'Your streak and XP are shown.' : 'Your streak and XP are hidden.'));
  const breakPref = document.getElementById('pref-break');
  if (breakPref) breakPref.addEventListener('change', () => savePref(breakPref, { break_nudge: breakPref.checked }, breakPref.checked ? 'Break suggestions are on.' : 'Break suggestions are off.'));

  // ── the plan selector ────────────────────────────────────────────────────────
  //
  // Wired with addEventListener rather than an inline handler, which the content
  // security policy forbids — the same reason every other control on this page is
  // built this way.
  const planSelect = document.getElementById('plan-select');
  const planNoteEl = document.getElementById('plan-note');
  if (planSelect) {
    planSelect.addEventListener('change', async () => {
      planSelect.disabled = true;
      try {
        const saved = await App.api.post('/api/profile/subscription',
          { subscription: planSelect.value });
        App.toast(`Plan set to ${saved.subscription}.`);
        // The note is about what the plan does, and for the owner the answer is
        // "not active" whatever they pick — so it is re-read from the response
        // rather than assumed from the tier they chose.
        planNoteEl.textContent = planNote({
          can_edit_levels: saved.can_edit_levels,
          subscription: saved.subscription,
        });
      } catch (err) {
        App.toast(err.message, 'error');
      } finally {
        planSelect.disabled = false;
      }
    });
  }

  // Invite a friend: a plain link, no reward. Counts only; who joined is never shown.
  try {
    const ref = await App.api.get('/api/referral');
    if (ref.enabled) {
      const link = `${window.location.origin}${ref.path}`;
      document.getElementById('invite-host').innerHTML = `
        <h2 class="section-title">${window.icon('user')}Invite a friend</h2>
        <div class="card">
          <p class="small muted">Share this link. There is no prize; it just helps a friend start. You only see how many joined, never who.</p>
          <label class="field"><span class="visually-hidden">Your invite link</span>
            <input type="text" id="invite-link" readonly value="${App.escapeHtml(link)}"></label>
          <button class="btn btn-sm btn-primary" id="invite-copy" type="button">Copy link</button>
          <p class="tiny muted" style="margin-top:8px">${ref.joined} joined, ${ref.started} started learning.</p>
        </div>`;
      document.getElementById('invite-copy').addEventListener('click', async (event) => {
        const input = document.getElementById('invite-link');
        try { await navigator.clipboard.writeText(input.value); event.target.textContent = 'Copied'; } catch { input.select(); }
      });
    }
  } catch { /* the card is optional */ }

  if (window.GoalPicker) window.GoalPicker.list(document.getElementById('goals-card'));

  const masteryHost = document.getElementById('mastery');
  for (const enrollment of progress.enrollments) {
    if (enrollment.status === 'placement_pending') {
      masteryHost.appendChild(App.el('div', { class: 'card' }, `
        <div class="card-title">${App.escapeHtml(enrollment.track.name)}, ${App.escapeHtml(App.gradeLabel(enrollment.grade.name))}</div>
        <p class="small muted">Placement quiz not taken yet.</p>
        <a class="btn btn-sm btn-primary" href="/placement?enrollment=${enrollment.id}">Take it</a>`));
      continue;
    }
    const { skills } = masteryOf.get(enrollment.id);
    masteryHost.appendChild(App.el('div', { class: 'card' }, `
      <div class="card-head">
        <div class="card-title">${App.escapeHtml(enrollment.track.name)}
          <span class="tiny muted">${App.escapeHtml(enrollment.grade.name)}</span>
        </div>
        <span class="chip chip-accent">level ${enrollment.current_level}</span>
      </div>
      <table class="data"><tbody>
        ${skills.map((s) => `
          <tr>
            <td>${App.escapeHtml(s.name)}</td>
            <td style="width:38%"><div class="meter ${s.mastery >= 0.8 ? 'meter-success' : s.mastery < 0.6 ? 'meter-warn' : ''}"><span style="width:${s.mastery * 100}%"></span></div></td>
            <td class="tiny nowrap">${App.pct(s.mastery)} &middot; ${s.correct}/${s.attempts}</td>
          </tr>`).join('')}
      </tbody></table>`));
  }
});


/** The tutor's durable notes, each with a delete button (GET/DELETE /api/tutor/facts). */
async function mountTutorFacts(host) {
  if (!host) return;
  const FACT_KIND = { goal: 'Goal', misconception: 'Mix-up', worked: 'What worked', hard: 'Hard for you', interest: 'Interest' };
  async function draw() {
    let facts = [];
    try { facts = (await App.api.get('/api/tutor/facts')).facts; } catch (err) { host.textContent = err.message || 'That did not load.'; return; }
    if (!facts.length) { host.textContent = 'Nothing yet. It fills in as you talk with your tutor.'; return; }
    host.className = 'small';
    host.innerHTML = `<ul style="margin:0; padding-left:0; list-style:none">${facts.map((f) => `
      <li style="display:flex; gap:8px; align-items:flex-start; padding:6px 0; border-top:1px solid var(--border, #e5e5e5)">
        <span style="flex:1"><strong>${App.escapeHtml(FACT_KIND[f.kind] || f.kind)}:</strong> ${App.escapeHtml(f.text)}${f.skill ? ` <span class="tiny muted">(${App.escapeHtml(f.skill)})</span>` : ''}${f.wrong_answer ? ` <span class="tiny muted">you said "${App.escapeHtml(f.wrong_answer)}"</span>` : ''}
          <span class="tiny muted">${f.times > 1 ? `seen ${f.times} times, ` : ''}last ${App.escapeHtml(String(f.last_confirmed_at || '').slice(0, 10))}</span></span>
        <button type="button" class="btn btn-ghost btn-sm" data-fact="${App.escapeHtml(f.id)}" aria-label="Delete this note">Delete</button>
      </li>`).join('')}</ul>
      <p style="margin:10px 0 0"><button type="button" class="btn btn-ghost btn-sm" id="facts-clear">Delete all notes</button></p>`;
    host.querySelectorAll('[data-fact]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await App.api.del(`/api/tutor/facts/${encodeURIComponent(b.dataset.fact)}`); } catch (err) { App.toast(err.message, 'error'); }
      draw();
    }));
    host.querySelector('#facts-clear').addEventListener('click', async () => {
      try { await App.api.del('/api/tutor/facts'); App.toast('Notes deleted.', 'info'); } catch (err) { App.toast(err.message, 'error'); }
      draw();
    });
  }
  draw();
}
