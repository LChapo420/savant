/* The child's side of parental consent: what is waiting, what works now, and
 * sending the request again. A locked account (a parent withdrew consent) lands
 * here from every other page (App.currentUser). */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, null);
  const $ = (id) => document.getElementById(id);
  const c = user.consent || {};

  if (user.age_needed || (c.state === 'pending' && !c.has_request)) {
    window.location.href = '/onboarding';
    return;
  }
  if (c.state === 'revoked') {
    $('title').textContent = 'This account is turned off';
    $('revoked').classList.remove('hidden');
    return;
  }
  if (c.state !== 'pending') {
    $('title').textContent = 'All set';
    $('open').classList.remove('hidden');
    return;
  }
  if (c.locked) {
    // The server is set to lock a child account until a parent agrees.
    document.querySelector('#pending a.btn-primary').classList.add('hidden');
  }

  $('pending').classList.remove('hidden');
  if (c.parent_email) $('sent-to').textContent = c.parent_email;
  if (c.expires_at) $('expires').textContent = new Date(c.expires_at).toLocaleDateString(undefined, { dateStyle: 'long' });
  if (App.query('sent')) {
    $('ok').textContent = 'Sent. Ask your parent to check their inbox and the spam folder.';
    $('ok').classList.remove('hidden');
  }

  const button = $('resend');
  $('resend-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('error').classList.add('hidden');
    $('ok').classList.add('hidden');
    button.disabled = true;
    try {
      const typed = $('parent_email').value.trim();
      const out = await App.api.post('/api/consent/child/request', typed ? { parent_email: typed } : {});
      $('sent-to').textContent = out.parent_email;
      $('expires').textContent = new Date(out.expires_at).toLocaleDateString(undefined, { dateStyle: 'long' });
      $('ok').textContent = 'Sent again. Ask your parent to check their inbox and the spam folder.';
      $('ok').classList.remove('hidden');
    } catch (err) {
      $('error').textContent = err.message;
      $('error').classList.remove('hidden');
    }
    button.disabled = false;
  });
});
