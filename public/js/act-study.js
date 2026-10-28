/* The ACT study: what it is, how to take part, and which practice test to take first.
 *
 * The two practice tests are ACT's own free ones, never Savant's questions. How many
 * current-format tests ACT offers is UNVERIFIED (docs/yc/SOURCES-TO-VERIFY.md), so the
 * links go to ACT's pages and the learner is told to confirm there. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'profile');
  const root = document.getElementById('root');
  const esc = App.escapeHtml;
  let me;
  try { me = await App.api.get('/api/act-study/me'); } catch (err) {
    root.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    return;
  }

  const steps = `
    <ol>
      <li><strong>Take the first practice test, timed, in one sitting.</strong> Use ACT's own free practice tests, not Savant's questions. Score it with ACT's scoring tables and keep your answer sheet or a screenshot.</li>
      <li><strong>Enter the scores</strong> on <a href="/act-scores">your ACT scores page</a>: kind "practice", and put the form letter (A or B) in the Form box.</li>
      <li><strong>Use Savant for about four weeks</strong> (wait-group students use it only after the second test). Press Start session when you study, so your time is measured and not guessed.</li>
      <li><strong>Take the other practice test</strong>, timed, under the same conditions, and enter it the same way.</li>
    </ol>
    <p class="muted">Where to find the tests: <a href="https://www.act.org/content/act/en/products-and-services/the-act-educator/the-act-test/enhancements-k12/faqs.html" rel="noopener" target="_blank">ACT's page on the online practice tests</a> and the free <a href="https://www.act.org/content/dam/act/unsecured/documents/Preparing-for-the-ACT-e.pdf" rel="noopener" target="_blank">Preparing for the ACT</a> booklet. Check there which two current-format tests you can use; if you can't find two, tell us before you start.</p>`;

  function joined() {
    const next = !me.has_before ? `Your first test is <strong>Form ${me.before_form}</strong>.` : !me.has_after ? `You have entered Form ${me.before_form}. Next: <strong>Form ${me.after_form}</strong> after about four weeks of Savant.` : 'You have entered both scores. Thank you.';
    const waitNote = me.group === 'wait' ? '<p><strong>You are in the wait group:</strong> please don\'t study on Savant until you have entered your second score. Then it is all yours.</p>' : '';
    root.innerHTML = `
      <h1>ACT study</h1>
      <div class="card"><p>${next}</p>${waitNote}<p class="muted">Half of the students take A first and half take B first, so a harder form can't pass for a gain.</p></div>
      <h2>Your steps</h2>${steps}
      <p><a class="btn btn-primary" href="/act-scores">Enter a score</a>
      <button class="btn" id="leave" type="button">Leave the study</button></p>
      <div id="msg"></div>`;
    document.getElementById('leave').onclick = async () => {
      if (!window.confirm('Leave the study? Your scores stay on your account.')) return;
      try { me = await App.api.post('/api/act-study/leave', {}); render(); } catch (err) { document.getElementById('msg').innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`; }
    };
  }

  function form() {
    root.innerHTML = `
      <h1>ACT study</h1>
      <p>We want to find out, honestly, whether students who use Savant for a few weeks score higher on an official ACT practice test. Retesting alone raises scores, so we compare carefully and we report everyone, including students who drop out and results that are zero or negative. One student's change tells us little; an average over many does.</p>
      <h2>How it works</h2>${steps}
      <h2>Your data</h2>
      <p>The study keeps your two practice-test scores, how much you used Savant, and the answers below. Only the Savant team sees them, by name, and any published number is an average, not you. You can leave at any time, and deleting your account deletes it.</p>
      <form id="join" class="stack">
        <label><input type="checkbox" name="consent"> I agree to join the study.</label>
        <label><input type="checkbox" name="parent_aware"> A parent or guardian knows I am joining.</label>
        <fieldset><legend>Have you taken or seen ACT's free practice tests before?</legend>
          <label><input type="radio" name="seen" value="no"> No, never</label>
          <label><input type="radio" name="seen" value="yes"> Yes, I have seen one or both</label></fieldset>
        <fieldset><legend>Optional: may we ask you to wait to start Savant?</legend>
          <label><input type="checkbox" name="wait_ok"> I'm happy to be asked to take the first test, wait four weeks without studying on Savant, take the second test, and only then start Savant. (Some students are asked to wait so we have something fair to compare against. It is not a penalty: you get everything after the second test.)</label></fieldset>
        <label>Any other ACT prep you're doing (optional)<br><input name="other_prep" maxlength="300" style="width:100%"></label>
        <div id="msg"></div>
        <button class="btn btn-primary" type="submit">Join the study</button>
      </form>`;
    document.getElementById('join').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const seen = f.seen.value;
      try {
        me = await App.api.post('/api/act-study/join', {
          consent: f.consent.checked, parent_aware: f.parent_aware.checked,
          seen_forms: seen === '' ? undefined : seen === 'yes', other_prep: f.other_prep.value, wait_ok: f.wait_ok.checked,
        });
        render();
      } catch (err) { document.getElementById('msg').innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`; }
    };
  }

  function render() { return me.joined ? joined() : form(); }
  render();
});
