/* Register and sign in. One file serves both pages: the presence of the name
 * field is what distinguishes them. */
App.mount(async () => {
  App.header(null, null);

  const form = document.getElementById('form');
  const errorBox = document.getElementById('error');
  const submit = document.getElementById('submit');
  const nameField = document.getElementById('display_name');
  const isRegister = !!nameField;

  function fail(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    submit.disabled = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    submit.disabled = true;

    const body = {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };
    if (isRegister) body.display_name = nameField.value.trim();

    try {
      await App.api.post(isRegister ? '/api/auth/register' : '/api/auth/login', body);
    } catch (err) {
      return fail(err.message);
    }

    // Where to land.
    //
    // A new account goes through two questions before anything else: how they
    // learn, then what they are interested in. That ordering is deliberate — the
    // questionnaire is what sets their first session up, and the survey is what
    // their lessons are written from, so neither is much use collected after they
    // have already started. Both are skippable, and each skips into the next.
    const next = App.query('next');
    if (next && next.startsWith('/')) {
      window.location.href = next;
      return;
    }
    if (isRegister) {
      window.location.href = '/style-quiz?next=/survey%3Fnext=/onboarding';
      return;
    }
    try {
      const { enrollments } = await App.api.get('/api/enrollments');
      window.location.href = enrollments.length ? '/dashboard' : '/onboarding';
    } catch {
      window.location.href = '/dashboard';
    }
  });
});
