/* Register and sign in. One file serves both pages: the presence of the age
 * screen is what marks the register page.
 *
 * Register is three steps: the neutral age screen (js/age-screen.js), then one
 * of two forms the server picks from that answer (the usual account, or a child
 * account with a username and a parent's email), then, for a child, a note that
 * the parent was emailed. The first age answer in a session is the one the
 * server keeps, so going back changes nothing: the page asks the server which
 * form to show rather than deciding itself. */
App.mount(async () => {
  App.header(null, null);

  const errorBox = document.getElementById('error');
  const isRegister = !!document.getElementById('step-age');

  function fail(message, button, focus) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    if (button) button.disabled = false;
    if (focus) focus.focus();
  }
  function clearError() { errorBox.classList.add('hidden'); }

  /** Where a new or returning account lands. */
  async function land(user, fresh) {
    const next = App.query('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      window.location.href = next;
      return;
    }
    if (user && user.consent && user.consent.locked) {
      window.location.href = '/parent-needed';
      return;
    }
    if (user && user.age_needed) {
      window.location.href = '/onboarding';
      return;
    }
    if (fresh) {
      // A new account goes through two questions before anything else: how they
      // learn, then what they are interested in. The survey is free text that
      // lessons are written from, so a child account whose parent has not allowed
      // outside AI skips it.
      window.location.href = user && user.consent && !user.consent.ai_free_text
        ? '/style-quiz?next=/onboarding'
        : '/style-quiz?next=/survey%3Fnext=/onboarding';
      return;
    }
    try {
      const { enrollments } = await App.api.get('/api/enrollments');
      window.location.href = enrollments.length ? '/dashboard' : '/onboarding';
    } catch {
      window.location.href = '/dashboard';
    }
  }

  // ── sign in ────────────────────────────────────────────────────────────────
  if (!isRegister) {
    const form = document.getElementById('form');
    const submit = document.getElementById('submit');
    const login = document.getElementById('email');
    // Child accounts sign in with a username, so the one box takes either.
    const label = login.closest('label') && login.closest('label').querySelector('span');
    if (label) label.textContent = 'Email or username';
    login.type = 'text';
    login.setAttribute('autocomplete', 'username');
    login.setAttribute('autocapitalize', 'none');
    login.setAttribute('spellcheck', 'false');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError();
      submit.disabled = true;
      let out;
      try {
        out = await App.api.post('/api/auth/login', {
          email: login.value.trim(),
          password: document.getElementById('password').value,
        });
      } catch (err) {
        return fail(err.message, submit);
      }
      land(out.user, false);
    });
    return;
  }

  // ── register ───────────────────────────────────────────────────────────────
  const steps = {
    age: document.getElementById('step-age'),
    self: document.getElementById('step-self'),
    parent: document.getElementById('step-parent'),
    sent: document.getElementById('step-sent'),
  };
  function show(name) {
    Object.entries(steps).forEach(([key, node]) => node.classList.toggle('hidden', key !== name));
    clearError();
    const first = steps[name].querySelector('input, select, a.btn');
    if (first) first.focus();
  }

  const selects = {
    month: document.getElementById('birth_month'),
    year: document.getElementById('birth_year'),
    country: document.getElementById('country'),
  };
  const { pendingDays } = await AgeScreen.fill(selects);
  document.getElementById('sent-days').textContent = String(pendingDays || 14);

  const ageSubmit = document.getElementById('age-submit');
  document.getElementById('age-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    const read = AgeScreen.read(selects);
    if (read.error) return fail(read.error, null, read.focus);
    ageSubmit.disabled = true;
    try {
      const { route } = await AgeScreen.submit(read.body);
      show(route === 'parent' ? 'parent' : 'self');
    } catch (err) {
      fail(err.message, ageSubmit);
    }
  });

  // The usual account.
  const submit = document.getElementById('submit');
  document.getElementById('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    submit.disabled = true;
    let out;
    try {
      out = await App.api.post('/api/auth/register', {
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        display_name: document.getElementById('display_name').value.trim(),
      });
    } catch (err) {
      // The server holds the age answer; if it says this is a child account,
      // the other form is the one to fill in.
      if (err.message && /username/i.test(err.message)) { show('parent'); return fail(err.message); }
      return fail(err.message, submit);
    }
    land(out.user, true);
  });

  // The child account.
  const childSubmit = document.getElementById('child-submit');
  document.getElementById('child-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    childSubmit.disabled = true;
    let out;
    try {
      out = await App.api.post('/api/auth/register', {
        display_name: document.getElementById('child_name').value.trim(),
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('child_password').value,
        parent_email: document.getElementById('parent_email').value.trim(),
      });
    } catch (err) {
      return fail(err.message, childSubmit);
    }
    const sentTo = out.user && out.user.consent && out.user.consent.parent_email;
    document.getElementById('sent-text').textContent = out.consent_email_sent === false
      ? 'Your account is made, but the email to your parent could not be sent. You can send it again from your account.'
      : `We emailed your parent or guardian${sentTo ? ` at ${sentTo}` : ''}.`;
    App.header(out.user, null);
    show('sent');
  });
});
