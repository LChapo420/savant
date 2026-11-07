/* Forgot password and set a new password (routes/password-reset.js). One file serves both pages: which form is on the page says which it is. */
App.mount(async () => {
  App.header(null, null);

  const errorBox = document.getElementById('error');
  const submit = document.getElementById('submit');
  const show = (el, on) => el.classList.toggle('hidden', !on);
  function fail(message, focus) {
    errorBox.textContent = message;
    show(errorBox, true);
    submit.disabled = false;
    if (focus) focus.focus();
  }

  // ── asking for a link ──────────────────────────────────────────────────────
  const forgot = document.getElementById('forgot-form');
  if (forgot) {
    const next = App.query('next') || '';
    if (next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) document.getElementById('back').href = `/login?next=${encodeURIComponent(next)}`;
    const email = document.getElementById('email');
    forgot.addEventListener('submit', async (event) => {
      event.preventDefault();
      show(errorBox, false);
      const address = email.value.trim();
      if (!address.includes('@')) return fail('Enter your email address. If you signed up with a username, ask your parent or guardian for help.', email);
      submit.disabled = true;
      try {
        await App.api.post('/api/auth/password-reset/request', { email: address, next });
      } catch (err) {
        return fail(err.message, email);
      }
      show(forgot, false);
      show(document.getElementById('intro'), false);
      show(document.getElementById('sent'), true);
    });
    return;
  }

  // ── setting the new password ───────────────────────────────────────────────
  // The token is in the #fragment, so no server ever sees it in an address. It comes out of the address bar and history here, and stays with this tab
  // only, so a reload still works.
  const KEY = 'password-reset-token';
  const stored = (use) => { try { return use(window.sessionStorage); } catch { return null; } };
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (fromLink) {
    stored((s) => s.setItem(KEY, fromLink));
    window.history.replaceState(null, '', window.location.pathname);
  }
  const token = fromLink || stored((s) => s.getItem(KEY));

  const form = document.getElementById('reset-form');
  function dead() {
    stored((s) => s.removeItem(KEY));
    show(form, false);
    show(document.getElementById('intro'), false);
    show(errorBox, false);
    show(document.getElementById('dead'), true);
  }
  let valid = false;
  if (token) {
    try {
      valid = (await App.api.post('/api/auth/password-reset/check', { token })).valid === true;
    } catch (err) {
      fail(err.message); // could not ask (no connection, or too many tries): the save below asks again
      valid = true;
    }
  }
  if (!valid) return dead();
  show(form, true);
  show(document.getElementById('intro'), true);

  const password = document.getElementById('password');
  const again = document.getElementById('again');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    show(errorBox, false);
    if (password.value.length < 8) return fail('Use a password of at least 8 characters.', password);
    if (password.value !== again.value) return fail("Those two passwords don't match.", again);
    submit.disabled = true;
    let out;
    try {
      out = await App.api.post('/api/auth/password-reset/reset', { token, password: password.value });
    } catch (err) {
      if (/run out|already been used/.test(err.message || '')) return dead();
      return fail(err.message, password);
    }
    stored((s) => s.removeItem(KEY));
    window.location.replace(out.redirect);
  });
});
