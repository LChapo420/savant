/* The Savant vs Duolingo Spanish study, participant page (services/spanish-study.js, docs/yc/DUOLINGO-STUDY-PROTOCOL.md).
 * Join with consent, see the arm and window, take the pre/post tests (public/spanish-study-test.html),
 * and, in the Duolingo arm, enter each day's minutes. Savant-arm minutes come from the app's own study clock. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  const API = '/api/spanish-study';
  const fail = (id, err) => { document.getElementById(id).innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`; };
  let me;
  try { me = await App.api.get(`${API}/me`); } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }

  function form() {
    root.innerHTML = `
      <h1>Spanish study</h1>
      <p>We want to find out, honestly, whether a beginner learns more everyday Spanish per hour of study with Savant or with Duolingo. You are assigned to one app by a public random number, study the same number of minutes a day for two weeks, and take the same short listening and reading test before and after. We report everyone, including people who drop out and results that are zero or negative. One person's change tells us little; an average over many does.</p>
      <h2>Your data</h2>
      <p>The study keeps your test results, your minutes and the answers below. Only the Savant team sees them, by name, and any published number is an average, not you. You can leave at any time, and deleting your account deletes it. If you are 13 to 17, a parent or guardian must know you are joining; the study is not open to anyone under 13.</p>
      <form id="join" class="stack">
        <label><input type="checkbox" name="consent"> I agree to join the study.</label>
        <fieldset><legend>Your age</legend>
          <label><input type="radio" name="age" value="adult"> 18 or older</label>
          <label><input type="radio" name="age" value="teen"> 13 to 17</label></fieldset>
        <label id="parentRow" hidden><input type="checkbox" name="parent"> A parent or guardian knows I am joining.</label>
        <label><input type="checkbox" name="beginner"> I have not studied Spanish in the last two years.</label>
        <div id="msg"></div>
        <button class="btn btn-primary" type="submit">Join the study</button>
      </form>`;
    const f = document.getElementById('join');
    f.addEventListener('change', () => { document.getElementById('parentRow').hidden = f.age.value !== 'teen'; });
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        me = await App.api.post(`${API}/join`, {
          consent: f.consent.checked, age_group: f.age.value || undefined,
          parent_aware: f.parent.checked, no_recent_spanish: f.beginner.checked,
        });
        render();
      } catch (err) { fail('msg', err); }
    };
  }

  const done = (test, phase) => me.tests_done.some((t) => t.test === test && t.phase === phase);
  const bothDone = (phase) => done('listening', phase) && done('daily', phase);

  function nextTest() {
    const phase = !bothDone('pre') ? 'pre' : 'post';
    if (bothDone('post')) return '<p>Both tests are done. Thank you: your results are part of the average the study reports.</p>';
    const when = phase === 'pre'
      ? `The pre-test must be taken on ${esc(me.start_date)} or the day after, before you have studied much.`
      : `The post-test opens on the last study day, ${esc(me.end_date)}.`;
    return `<p><strong>${phase === 'pre' ? 'Pre-test' : 'Post-test'}.</strong> About 15 minutes. ${when}</p>
      <p><a class="btn btn-primary" href="/spanish-study-test">Go to the test</a></p>`;
  }

  function armBlock() {
    if (me.arm === 'savant') {
      return `<p>Your app is <strong>Savant</strong>. Study the Spanish path for about ${me.daily_minutes} minutes a day and press Start session each time, so your minutes are measured, not guessed. Do not use Duolingo or any other Spanish app for these two weeks.</p>
        <p><a class="btn" href="/dashboard">Open Savant</a></p>`;
    }
    const rows = (me.checkins || []).slice().sort((a, b) => (a.day < b.day ? 1 : -1));
    return `<p>Your app is <strong>Duolingo</strong>. Study about ${me.daily_minutes} minutes a day in Duolingo only. Each day, enter the minutes and tick the box if you saved a screenshot of Duolingo's own stats page; we may ask to see them.</p>
      <form id="checkin" class="stack">
        <label>Day <input type="date" name="day" value="${esc(me.today)}" min="${esc(me.start_date)}" max="${esc(me.today < me.end_date ? me.today : me.end_date)}"></label>
        <label>Minutes studied <input type="number" name="minutes" min="0" max="240" inputmode="numeric" required></label>
        <label><input type="checkbox" name="shot"> I saved a screenshot of Duolingo's stats for this day.</label>
        <div id="cmsg"></div>
        <button class="btn btn-primary" type="submit">Save the day</button>
      </form>
      ${rows.length ? `<div class="card"><div class="table-scroll"><table class="data" style="width:100%"><thead><tr><th>Day</th><th class="n">Minutes</th><th>Screenshot</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.day)}</td><td class="n">${r.minutes}</td><td>${r.screenshot ? 'yes' : 'no'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  }

  function joined() {
    root.innerHTML = `
      <h1>Spanish study</h1>
      <div class="card"><p style="margin-top:0">Your study days run <strong>${esc(me.start_date)}</strong> to <strong>${esc(me.end_date)}</strong> (${me.days} days).</p>${nextTest()}</div>
      <h2>Your daily study</h2>${armBlock()}
      <p><button class="btn btn-ghost" id="leave" type="button">Leave the study</button></p>
      <div id="msg"></div>`;
    const c = document.getElementById('checkin');
    if (c) {
      c.onsubmit = async (e) => {
        e.preventDefault();
        try {
          me = await App.api.post(`${API}/checkin`, { day: c.day.value, minutes: Number(c.minutes.value), screenshot: c.shot.checked });
          joined();
        } catch (err) { fail('cmsg', err); }
      };
    }
    document.getElementById('leave').onclick = async () => {
      if (!window.confirm('Leave the study? Your account stays; your study results stop counting.')) return;
      try { me = await App.api.post(`${API}/leave`, {}); render(); } catch (err) { fail('msg', err); }
    };
  }

  function render() { return me.joined ? joined() : form(); }
  render();
});
