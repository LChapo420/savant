/* Today's practice for chess, piano and basketball (staged skills round 3,
 * patch 04; SKILL_DOSE): the plan from the learner's own skill record, which
 * says which drills, how many sets and why. Sets go to the skills furthest
 * from their bar, every unproven skill gets at least one, and proven skills
 * keep a share until they have had their over-learning dose, so they do not
 * fade while the others catch up. Warm sets never prove a skill; the cold
 * stage check does.
 *
 * Network: GET and POST to /api/skills/practice only.
 */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');
  const host = document.getElementById('skill-practice');
  const enrollmentId = Number(App.query('enrollment'));
  const esc = App.escapeHtml;
  if (!enrollmentId) {
    host.innerHTML = '<div class="notice notice-error">No subject selected. <a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }
  const pathHref = `/path?enrollment=${enrollmentId}`;
  const api = `/api/skills/practice/${enrollmentId}`;
  const name = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const KIND = { practice: 'To prove', overlearn: 'Make it last', maintenance: 'Keep it', consolidation: 'Keep it' };
  const KIND_LONG = {
    practice: 'Not proven yet: sets go to it by how far your recent sets are from the bar.',
    overlearn: 'Proven: a share of sets until it has had twice the practice it took to prove, so it lasts.',
    maintenance: 'Proven and practised enough: one set keeps it going.',
    consolidation: 'Everything is proven: spare time keeps it all standing.',
  };
  let data;

  async function load() {
    try { data = await App.api.get(api); } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${esc(err.status === 404 ? 'There is no practice plan on this subject.' : err.message)}
        <div style="margin-top:10px"><a class="btn btn-sm" href="${pathHref}">Back to your path</a></div></div>`;
      return;
    }
    draw();
  }

  function draw() {
    const p = data.practice;
    const [gradeMain] = App.gradeParts(data.grade.name);
    const first = p.practice.find((x) => x.left);
    const done = p.sets - p.left;
    host.innerHTML = `
      <div class="path-top skill-top" data-subject="${esc(data.track.id)}">
        <div>
          <a class="back-link" href="${pathHref}">${window.icon('arrow-left')}Your path</a>
          <div class="track-heading">
            ${App.symbol(data.track, { size: 'lg' })}
            <div>
              <h1>Today's practice</h1>
              <span class="tiny">${esc(data.track.name)}, ${esc(gradeMain)}. Stage ${esc(p.stage.id)}: ${esc(p.stage.name)}.</span>
            </div>
          </div>
        </div>
      </div>
      <div class="skill-now">
        <div>
          <p class="skill-lede">${p.left ? `<span class="num">${p.left}</span> set${p.left === 1 ? '' : 's'} left today, about <span class="num">${p.set_minutes}</span> minutes each.` : `${window.mark('tick')}Done for today.`}${p.lesson_minutes ? ` Plus about <span class="num">${p.lesson_minutes}</span> minutes of this grade's lessons.` : ''}</p>
          ${p.sittings.length ? `<p class="notice notice-review">First, the stage check: ${p.sittings.map((s) => esc(s.title || name(s.name))).join(', ')} ${p.sittings.length === 1 ? 'is' : 'are'} ready to sit cold. Practising first would make ${p.sittings.length === 1 ? 'it' : 'them'} warm for 20 hours. <a href="/stage-check?enrollment=${enrollmentId}">Go to the stage check</a>.</p>` : ''}
          <p class="small muted skill-note">A set is the skill's own check, played warm with the answer after each question. It never proves a skill: it tells the plan when a cold check is worth sitting.</p>
        </div>
        <div class="tmeters">${App.tmeter({ label: 'Sets done today', value: done, target: p.sets, max: p.sets || 1, unit: 'count' })}</div>
      </div>
      <section class="skill-section" aria-labelledby="plan-h">
        <h2 class="section-title" id="plan-h">The plan</h2>
        <ol class="skill-list">${p.practice.map((x) => `
          <li class="skill-row${x.left ? '' : ' is-done'}">
            <span class="skill-mark">${x.left ? '' : window.mark('tick', 'mark-plain')}</span>
            <span class="skill-main">
              <span class="skill-title">${esc(x.title || name(x.name))}<span class="skill-tag">${esc(KIND[x.kind] || '')}</span></span>
              <span class="skill-why">${esc(KIND_LONG[x.kind] || '')}</span>
              <span class="skill-meta"><span class="num">${x.done}</span> of <span class="num">${x.sets}</span> set${x.sets === 1 ? '' : 's'}. ${esc(x.drill.set)}${x.drill.how === 'log' && x.drill.says ? `. ${esc(x.drill.says)}` : ''}</span>
            </span>
            <span class="skill-act">${x.left ? actionFor(x, first && x.metric === first.metric) : ''}</span>
          </li>`).join('')}</ol>
      </section>
      ${p.reasons.length ? `<details class="skill-review"><summary>Why this plan</summary><ul>${p.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>` : ''}`;
    host.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => run(b.getAttribute('data-set'))));
  }

  function actionFor(x, primary) {
    const cls = `btn btn-sm${primary ? ' btn-primary' : ''}`;
    if (x.drill.how === 'items' || x.drill.how === 'take') return `<button class="${cls}" type="button" data-set="${esc(x.metric)}">${x.open ? 'Carry on' : 'Practise'}<span class="visually-hidden">: ${esc(name(x.name))}</span></button>`;
    return `${x.drill.href ? `<a class="btn btn-sm btn-ghost" href="${esc(x.drill.href)}" target="_blank" rel="noopener">Open the drill</a>` : ''}<button class="${cls}" type="button" data-set="${esc(x.metric)}">Log a set</button>`;
  }

  function frame(x) {
    host.innerHTML = `
      <div class="player skill-player" data-subject="${esc(data.track.id)}">
        <div class="player-head">
          <a class="icon-btn player-close" href="#" data-leave title="Back to the plan" aria-label="Back to the plan">${window.icon('x')}</a>
          <div class="player-titles"><h1 id="title">${esc(x.title || name(x.name))}</h1><div id="subtitle">Practice set. ${esc(x.test)}</div></div>
        </div>
        <div class="card" id="runner"></div>
      </div>`;
    host.querySelector('[data-leave]').addEventListener('click', (e) => { e.preventDefault(); load(); });
    return host.querySelector('#runner');
  }

  function after(runner, r) {
    runner.innerHTML = `<p class="skill-verdict ${r.at_target ? 'is-right' : 'is-wrong'}">${window.mark(r.at_target ? 'tick' : 'cross')}<span>${r.at_target ? 'That set was at the bar.' : 'That set was below the bar.'}</span></p>
      ${r.note ? `<p class="small muted">${esc(r.note)}</p>` : ''}
      <div class="path-actions"><button class="btn btn-primary" type="button" data-back>Back to the plan</button></div>`;
    runner.querySelector('[data-back]').addEventListener('click', load);
    runner.querySelector('[data-back]').focus();
  }

  async function run(metric) {
    const x = data.practice.practice.find((y) => y.metric === metric);
    const runner = frame(x);
    const base = `${api}/${encodeURIComponent(metric)}`;
    const finish = async () => {
      try { after(runner, await App.api.post(`${base}/finish`, {})); } catch (err) { App.toast(err.message, 'error'); load(); }
    };
    if (x.drill.how === 'count') {
      SkillKit.count(runner, {
        fields: x.drill.fields, hands: x.drill.hands, cameraOk: false, submitLabel: 'Log the set',
        onSubmit: async (body) => { try { after(runner, await App.api.post(`${base}/log`, body)); } catch (err) { App.toast(err.message, 'error'); } },
      });
      return;
    }
    if (x.drill.how === 'log') {
      runner.innerHTML = `<p class="skill-stem">How did the set go?</p>
        <p class="small muted">Your own word: it only times the next cold check, and never proves anything.</p>
        <div class="path-actions"><button class="btn btn-primary" type="button" data-yes>At the bar</button><button class="btn" type="button" data-no>Not yet</button></div>`;
      const log = async (at) => { try { after(runner, await App.api.post(`${base}/log`, { at_target: at })); } catch (err) { App.toast(err.message, 'error'); } };
      runner.querySelector('[data-yes]').addEventListener('click', () => log(true));
      runner.querySelector('[data-no]').addEventListener('click', () => log(false));
      return;
    }
    let s;
    try { s = (await App.api.post(`${base}/start`, {})).set; } catch (err) { App.toast(err.message, 'error'); load(); return; }
    if (s.how === 'items') {
      SkillKit.items(runner, { items: s.items, answered: s.answered, subject: data.track.id, feedback: true, onAnswer: (index, answer, source) => App.api.post(`${base}/answer`, { index, answer, source }), onDone: finish });
    } else {
      SkillKit.takes(runner, { parts: s.parts, practice: true, onTake: (part, played, origin) => App.api.post(`${base}/take`, { part, played, origin }), onDone: finish });
    }
  }

  load();
});
