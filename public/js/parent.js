/* The parent page: review, change, withdraw, delete (routes/consent.js).
 *
 * A parent account is separate from learner accounts: it signs in with the
 * email the consent request went to, and the session it starts carries no
 * learner. Every action is asked of the server again; nothing here is the
 * thing that allows it. Destructive actions confirm inline, never in a dialog. */
App.mount(async () => {
  App.header(null, null);
  const $ = (id) => document.getElementById(id);
  const esc = App.escapeHtml;
  const errorBox = $('error');
  const fail = (message) => {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ block: 'nearest' });
  };
  const clear = () => errorBox.classList.add('hidden');

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');

  const STATUS = { active: 'Consent given', revoked: 'Consent withdrawn: account locked' };
  const METHOD = { email_plus: 'Email link plus confirmation email', signed_form: 'Signed form, checked by Savant' };
  const LABEL = {
    enrollments: 'subjects and grades', skill_states: 'skill records', profiles: 'learning profile', sessions: 'sittings',
    items: 'answered questions', events: 'answer events', lessons: 'lessons written for them', streaks: 'streaks',
    essays: 'essays', level_feedback: 'comments about levels', scorecards: 'learning scorecard', level_signals: 'level timings',
    learner_records: 'learner record', level_debriefs: 'after-level reads', subject_placements: 'subject placements',
    game_payloads: 'game question sets', block_plans: 'lesson layouts', assist_chats: 'chat turns', level_logs: 'activity logs',
    chess_ratings: 'chess rating', chess_puzzle_attempts: 'chess puzzles', chess_rush_runs: 'chess rush runs',
    chess_drill_cards: 'chess move-trainer cards', chess_drill_runs: 'chess move-trainer sessions',
    piano_song_results: 'piano song results', ai_usage: 'daily AI use counts', remediations: 'help-me-learn records',
    reports: 'problem reports', level_edits: 'tailored levels',
  };

  let state = null;

  async function load() {
    const me = await App.api.get('/api/consent/parent/me');
    state = me;
    if (!me.parent) {
      $('home').classList.add('hidden');
      $('signin').classList.remove('hidden');
      return;
    }
    $('signin').classList.add('hidden');
    $('home').classList.remove('hidden');
    $('me-email').textContent = me.parent.email;
    $('no-children').classList.toggle('hidden', me.children.length > 0);
    $('children').innerHTML = me.children.map(childBlock).join('');
  }

  function optStatus(scope) {
    if (!scope || (!scope.requested && !scope.active)) return 'Off';
    if (scope.active) return `On since ${fmtDay(scope.verified_at)} (signed form)`;
    return 'Asked for: starts when your signed form is checked';
  }

  function childBlock(c) {
    const ch = c.child || {};
    const active = c.status === 'active';
    const g = c.granted || {};
    const s = c.scopes || {};
    const off = !!(c.settings && c.settings.camera_mic_off);
    return `
      <article class="child-block" data-id="${c.id}">
        <h2>${esc(ch.display_name || 'Child')} ${ch.username ? `<span class="child-user">${esc(ch.username)}</span>` : ''}</h2>
        <dl class="facts consent-facts">
          <div><dt>Status</dt><dd>${esc(STATUS[c.status] || c.status)}</dd></div>
          <div><dt>Given</dt><dd>${esc(fmt(g.at))}</dd></div>
          <div><dt>How</dt><dd>${esc(METHOD[g.method] || g.method || '')}</dd></div>
          <div><dt>Notice version</dt><dd>${esc(c.notice_version || '')}</dd></div>
          <div><dt>Confirmation email</dt><dd>${c.confirmation && c.confirmation.sent_at ? `Sent ${esc(fmt(c.confirmation.sent_at))}` : active && c.confirmation && c.confirmation.due_at ? `Due ${esc(fmt(c.confirmation.due_at))}` : ''}</dd></div>
        </dl>
        ${c.status === 'revoked' ? `
          <div class="notice">
            <p>You withdrew consent on ${esc(fmt(c.revoked_at))}. The account is locked and nothing new is collected.
              It and everything in it will be deleted on <strong>${esc(fmtDay(c.delete_after))}</strong> unless you give consent again.</p>
            <label class="check-row"><input type="checkbox" data-regrant-check>
              <span>I am this child's parent or legal guardian and I agree again to the <a href="/privacy#children">current notice</a>.</span></label>
            <button class="btn btn-sm" data-act="regrant" type="button">Give consent again</button>
          </div>` : ''}

        <section class="child-part">
          <h3>What Savant keeps</h3>
          <div data-summary><button class="btn btn-sm" data-act="summary" type="button">Show a summary</button></div>
          <p><a class="btn-text" href="/api/consent/parent/children/${c.id}/data?download=1">Download everything (JSON)</a></p>
        </section>

        ${active ? `
        <section class="child-part">
          <h3>Camera and microphone</h3>
          <label class="check-row"><input type="checkbox" data-act="camera" ${off ? 'checked' : ''}>
            <span>Turn off the camera and microphone features for ${esc(ch.display_name || 'this child')}. They can still tap and use the on-screen keys.</span></label>
          <p class="tiny muted" data-camera-note>${off ? 'Off: the browser is told to refuse the camera and microphone on every Savant page.' : 'On: only when your child starts a camera or microphone activity, processed on their device, nothing uploaded.'}</p>
        </section>

        <section class="child-part">
          <h3>Streak and XP</h3>
          <label class="check-row"><input type="checkbox" data-act="stats" ${c.settings && c.settings.hide_stats ? 'checked' : ''}>
            <span>Hide the day streak and XP for ${esc(ch.display_name || 'this child')}. They are still counted; they are just not shown.</span></label>
        </section>

        <section class="child-part">
          <h3>Outside AI and AI training</h3>
          <label class="check-row"><input type="checkbox" data-opt="third_party_ai" ${s.third_party_ai && (s.third_party_ai.requested || s.third_party_ai.active) ? 'checked' : ''}>
            <span>Allow what ${esc(ch.display_name || 'my child')} writes or says to go to the <a href="/privacy#vendors">outside AI companies</a>, only to answer or mark it.
              <span class="tiny muted opt-status">${esc(optStatus(s.third_party_ai))}</span></span></label>
          <label class="check-row"><input type="checkbox" data-opt="ai_training" ${s.ai_training && (s.ai_training.requested || s.ai_training.active) ? 'checked' : ''}>
            <span>Allow their data to be used to train AI models (Savant does not do this today).
              <span class="tiny muted opt-status">${esc(optStatus(s.ai_training))}</span></span></label>
          <p class="tiny muted">Turning one on needs the <a href="/parent-form">signed form</a>. Turning one off works at once.</p>
        </section>

        <section class="child-part">
          <h3>Withdraw consent</h3>
          <p class="muted small">The account locks now and nothing new is collected. It is deleted after ${esc(String(state.revoked_days || 30))} days unless you give consent again.</p>
          <button class="btn btn-sm" data-act="revoke-ask" type="button" aria-expanded="false">Withdraw consent</button>
          <div class="hidden" data-revoke-confirm>
            <button class="btn btn-danger btn-sm" data-act="revoke" type="button">Yes, withdraw and lock the account</button>
          </div>
        </section>` : ''}

        <section class="child-part">
          <h3>Delete the account and its data</h3>
          <p class="muted small">Deletes ${esc(ch.display_name || 'the account')} and everything Savant keeps about them, at once. This cannot be undone.</p>
          <div class="delete-row">
            <label class="field"><span>Type DELETE to confirm</span><input type="text" data-delete-word autocomplete="off" autocapitalize="characters"></label>
            <button class="btn btn-danger btn-sm" data-act="delete" type="button">Delete</button>
          </div>
        </section>
      </article>`;
  }

  // ── sign in and out ────────────────────────────────────────────────────────
  $('signin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clear();
    const button = $('signin-submit');
    button.disabled = true;
    try {
      await App.api.post('/api/consent/parent/login', { email: $('p-email').value.trim(), password: $('p-password').value });
      await load();
    } catch (err) {
      fail(err.message);
    }
    button.disabled = false;
  });
  $('signout').addEventListener('click', async () => {
    try { await App.api.post('/api/consent/parent/logout', {}); } catch { /* signing out locally regardless */ }
    window.location.href = '/parent';
  });
  $('delete-parent').addEventListener('click', async () => {
    clear();
    try {
      await App.api.post('/api/consent/parent/delete-account', {});
      window.location.href = '/';
    } catch (err) { fail(err.message); }
  });

  // ── per-child actions ──────────────────────────────────────────────────────
  $('children').addEventListener('click', async (event) => {
    const target = event.target.closest('[data-act]');
    if (!target || target.matches('input')) return;
    const block = target.closest('.child-block');
    const id = block.dataset.id;
    const base = `/api/consent/parent/children/${id}`;
    clear();
    try {
      switch (target.dataset.act) {
        case 'summary': {
          const { counts } = await App.api.get(`${base}/data`);
          const rows = Object.entries(counts);
          block.querySelector('[data-summary]').innerHTML = rows.length
            ? `<ul class="keeps">${rows.map(([k, n]) => `<li><span class="num">${n}</span> ${esc(LABEL[k] || k.replace(/_/g, ' '))}</li>`).join('')}</ul>
               <p class="tiny muted">Plus the account itself: name or nickname, username, password (scrambled), month and year of birth, country.</p>`
            : '<p class="muted">Only the account itself: name or nickname, username, password (scrambled), month and year of birth, country. No learning yet.</p>';
          break;
        }
        case 'revoke-ask': {
          const box = block.querySelector('[data-revoke-confirm]');
          box.classList.toggle('hidden');
          target.setAttribute('aria-expanded', String(!box.classList.contains('hidden')));
          break;
        }
        case 'revoke':
          await App.api.post(`${base}/revoke`, {});
          App.toast('Consent withdrawn. The account is locked.');
          await load();
          break;
        case 'regrant': {
          const ok = block.querySelector('[data-regrant-check]');
          if (!ok.checked) return fail('Tick the box to confirm you are the parent or legal guardian and agree.');
          const { notice_version: noticeVersion } = await App.api.get('/api/consent/config');
          await App.api.post(`${base}/consent`, { notice_version: noticeVersion, i_am_parent: true });
          App.toast('Consent given again. The account is open.');
          await load();
          break;
        }
        case 'delete': {
          const word = block.querySelector('[data-delete-word]').value;
          await App.api.post(`${base}/delete`, { confirm: word });
          App.toast('Deleted.');
          await load();
          break;
        }
        default:
      }
    } catch (err) { fail(err.message); }
  });

  $('children').addEventListener('change', async (event) => {
    const input = event.target;
    const block = input.closest('.child-block');
    if (!block) return;
    const base = `/api/consent/parent/children/${block.dataset.id}`;
    clear();
    try {
      if (input.dataset.act === 'camera') {
        await App.api.post(`${base}/settings`, { camera_mic_off: input.checked });
        App.toast(input.checked ? 'Camera and microphone turned off.' : 'Camera and microphone allowed again.');
        await load();
      } else if (input.dataset.act === 'stats') {
        await App.api.post(`${base}/settings`, { hide_stats: input.checked });
        App.toast(input.checked ? 'The streak and XP are hidden.' : 'The streak and XP are shown again.');
        await load();
      } else if (input.dataset.opt) {
        await App.api.post(`${base}/opt-ins`, { [input.dataset.opt]: input.checked });
        App.toast(input.checked ? 'Asked for. Send the signed form to start it.' : 'Turned off.');
        await load();
      }
    } catch (err) {
      input.checked = !input.checked;
      fail(err.message);
    }
  });

  try { await load(); } catch (err) { fail(err.message); }
});
