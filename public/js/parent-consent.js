/* The parent's answer to a consent request (routes/consent.js).
 *
 * The link in the email carries a one-time token. It is read once and taken out
 * of the address bar, so it does not sit in history or travel on as a referrer.
 * The notice version the page shows is sent with the answer; the server refuses
 * an answer to words that have since changed. */
App.mount(async () => {
  App.header(null, null);

  const $ = (id) => document.getElementById(id);
  const errorBox = $('error');
  const fail = (message, button) => {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    if (button) button.disabled = false;
    errorBox.scrollIntoView({ block: 'center' });
  };

  const token = App.query('token') || sessionStorage.getItem('savant.consent-token') || '';
  try { if (token) sessionStorage.setItem('savant.consent-token', token); } catch { /* private mode */ }
  if (App.query('token')) window.history.replaceState(null, '', '/parent-consent');

  if (!token) {
    $('loading').remove();
    return fail('This page opens from the link in the email Savant sent you.');
  }

  let request;
  try {
    [request] = await Promise.all([App.api.get(`/api/consent/request/${encodeURIComponent(token)}`)]);
  } catch (err) {
    $('loading').remove();
    return fail(err.message);
  }
  let config = {};
  try { config = await App.api.get('/api/consent/config'); } catch { /* defaults in the markup */ }
  $('loading').remove();
  $('request').classList.remove('hidden');

  const notice = $('notice');
  if (notice.dataset.noticeVersion !== request.notice_version) {
    return fail('The notice on this page is out of date. Reload the page to read the current one.');
  }
  $('child-name').textContent = request.child.display_name;
  $('parent-email').textContent = request.parent_email;
  document.querySelectorAll('[data-pending-days]').forEach((n) => { n.textContent = String(config.pending_days || 14); });
  document.querySelectorAll('[data-revoked-days]').forEach((n) => { n.textContent = String(config.revoked_days || 30); });

  // The parent account: signed in already, an existing one (its password), or a new one.
  const password = $('password');
  if (request.signed_in_as_this_parent) {
    $('password-field').classList.add('hidden');
  } else if (request.parent_account) {
    $('password-label').textContent = 'Your parent account password';
    $('password-hint').textContent = 'You already have a Savant parent account with this email. Enter its password to add this child to it.';
    password.setAttribute('autocomplete', 'current-password');
  }

  const agree = $('agree');
  $('consent-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    if (!$('i_am_parent').checked) return fail('Tick the box to confirm you are the parent or legal guardian and agree.');
    if (!request.signed_in_as_this_parent && password.value.length < 8) {
      password.focus();
      return fail(request.parent_account ? 'Enter your parent account password.' : 'Choose a password of at least 8 characters.');
    }
    agree.disabled = true;
    let out;
    try {
      out = await App.api.post(`/api/consent/request/${encodeURIComponent(token)}`, {
        decision: 'agree',
        notice_version: notice.dataset.noticeVersion,
        i_am_parent: true,
        password: password.value,
        opt_third_party_ai: $('opt_third_party_ai').checked,
        opt_ai_training: $('opt_ai_training').checked,
        camera_mic_off: $('camera_mic_off').checked,
      });
    } catch (err) {
      return fail(err.message, agree);
    }
    try { sessionStorage.removeItem('savant.consent-token'); } catch { /* private mode */ }
    $('request').classList.add('hidden');
    $('title').textContent = 'Thank you';
    $('done-text').textContent = `${request.child.display_name}'s account is now open. Tomorrow we will email you once more to confirm, with how to withdraw consent if this was not you.`;
    if (out.needs_signed_form) $('done-form').classList.remove('hidden');
    $('done').classList.remove('hidden');
    $('done-link').focus();
  });

  $('decline').addEventListener('click', () => {
    const box = $('decline-confirm');
    const open = box.classList.toggle('hidden') === false;
    $('decline').setAttribute('aria-expanded', String(open));
    if (open) $('decline-yes').focus();
  });
  $('decline-yes').addEventListener('click', async () => {
    errorBox.classList.add('hidden');
    try {
      await App.api.post(`/api/consent/request/${encodeURIComponent(token)}`, { decision: 'decline' });
    } catch (err) {
      return fail(err.message);
    }
    try { sessionStorage.removeItem('savant.consent-token'); } catch { /* private mode */ }
    $('request').classList.add('hidden');
    $('title').textContent = 'Deleted';
    $('done-text').textContent = 'The account and everything in it have been deleted, and so has your email address. Savant will not contact you again about it.';
    $('done-link').classList.add('hidden');
    $('done').classList.remove('hidden');
  });
});
