/* The skill check (services/speed-placement.js): one question at a time, then what is now off the path, said plainly, with the way back to it on the path page. */
(async () => {
  await App.currentUser({ require: true });
  const host = document.getElementById('item');
  const enrollmentId = Number(App.query('enrollment'));
  const back = `/path?enrollment=${enrollmentId}`;
  const fail = (message) => { host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(message)} <a href="${back}">Back to your path</a>.</div>`; };
  if (!enrollmentId) { fail('No subject selected.'); return; }
  let sessionId; let item; let startedAt = Date.now();
  function done(out) {
    const names = out.known.length + out.implied.length;
    host.innerHTML = `
      <article class="lesson">
        <h2>${names ? `${names} skill${names === 1 ? '' : 's'} off your path` : 'Nothing to skip this time'}</h2>
        <p class="lesson-intro" role="status">${names ? `You showed ${out.known.length}${out.implied.length ? `, and ${out.implied.length} more follow from those` : ''}. Their lessons and practice are stepped over. They are listed on your path if you want them, and they still come up in your reviews.` : 'Your path stays as it was, and these questions counted as practice.'}</p>
        <div class="check-bar lesson-bar"><a class="btn btn-primary btn-lg btn-block" href="${back}">Back to your path</a></div>
      </article>`;
  }
  function show() {
    startedAt = Date.now();
    Player.render(host, item, {
      check: 'Check',
      coach: false,
      onSubmit: async (answer) => {
        let r;
        try { r = await App.api.post(`/api/speed/skill-check/${sessionId}/answer`, { item_id: item.id, answer, ms: Date.now() - startedAt }); } catch (err) { App.toast(err.message, 'error'); return; }
        const verdict = { reveal: true, ...r };
        Player.reveal(host, item, verdict, {
          nextLabel: r.done ? 'See the result' : 'Next question',
          onNext: () => { if (r.done) done(r.done); else { item = r.next; show(); } },
        });
      },
    });
  }
  try {
    const s = await App.api.post(`/api/speed/skill-check/${enrollmentId}/start`, {});
    sessionId = s.session_id; item = s.item;
  } catch (err) { fail(err.message); return; }
  show();
})();
