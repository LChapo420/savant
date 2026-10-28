/* The learner's own view of the model the app keeps on them: what they said, what
 * the sessions showed, and exactly what it changes. Showing this is deliberate —
 * a system that plans your study should be able to explain itself. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');

  const root = document.getElementById('root');
  const [profile, progress, card] = await Promise.all([
    App.api.get('/api/profile'),
    App.api.get('/api/progress'),
    App.api.get('/api/scorecard'),
  ]);

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
        + 'around how you learn and what you have said about earlier levels.';
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

  root.innerHTML = `
    <div class="row-between" style="margin-bottom:12px">
      <div>
        <h1 style="margin-bottom:2px">${App.escapeHtml(user.display_name)}</h1>
        <div class="small muted">${App.escapeHtml(user.email)} &middot; joined ${new Date(user.created_at).toLocaleDateString()}</div>
      </div>
      <a class="btn btn-ghost btn-sm" href="/dashboard">${window.icon('arrow-left')}Dashboard</a>
    </div>

    <div class="grid grid-3">
      <div class="card card-tight stat-block"><span class="value">${user.streak || 0}</span><span class="label">Day streak</span></div>
      <div class="card card-tight stat-block"><span class="value">${user.xp || 0}</span><span class="label">Total XP</span></div>
      <div class="card card-tight stat-block"><span class="value">${profile.evidence_count}</span><span class="label">Sessions analyzed</span></div>
    </div>

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
          One hundred measures of how you learn best, each scored 0–100 from what you actually do —
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
        <div class="table-scroll"><table class="data"><tbody>
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

    <h2 class="section-title">${window.icon('user')}Your data</h2>
    <div class="card">
      <p class="small muted">Everything the app holds on you, as one JSON file: your profile, every session, every answer, and every event.</p>
      <a class="btn btn-sm" href="/api/account/export" download>Download my data</a>
    </div>`;

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

  const masteryHost = document.getElementById('mastery');
  for (const enrollment of progress.enrollments) {
    if (enrollment.status === 'placement_pending') {
      masteryHost.appendChild(App.el('div', { class: 'card' }, `
        <div class="card-title">${App.escapeHtml(enrollment.track.name)} &middot; ${App.escapeHtml(enrollment.grade.name)}</div>
        <p class="small muted">Placement quiz not taken yet.</p>
        <a class="btn btn-sm btn-primary" href="/placement?enrollment=${enrollment.id}">Take it</a>`));
      continue;
    }
    const { skills } = await App.api.get(`/api/mastery/${enrollment.id}`);
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
