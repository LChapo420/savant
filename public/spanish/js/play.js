/* /spanish/play?level=<id> — load one level and hand it to its engine. */
(async function () {
  const ES = window.ES;
  const root = document.getElementById('app');
  const id = new URLSearchParams(location.search).get('level');
  const fail = (msg) => {
    root.innerHTML = `<div class="es-endscreen"><div class="es-endscreen__char">${ES.character('mara')}</div><h1 class="es-h2">${ES.esc(msg)}</h1><a class="es-btn es-btn--primary" href="/spanish/lab">Back to the test lab</a></div>`;
  };
  if (!id) return fail('No level chosen.');
  try {
    const prefs = JSON.parse(localStorage.getItem('es-prefs') || '{}');
    if (prefs.sfx === false) ES.sfx.enabled = false;
  } catch { /* ignore */ }
  let level;
  try { level = (await ES.api.get(`/api/es/lab/levels/${encodeURIComponent(id)}`)).level; }
  catch (err) { return fail(err.status === 404 ? 'That level does not exist.' : 'Could not load the level.'); }
  document.title = `${level.title} · Spanish`;
  const engine = ES.engines[level.engine];
  if (!engine) return fail(`No player for "${level.engine}" yet.`);
  ES.board.set({ kind: String(level.engine || '').replace(/_/g, ' '), title: level.title });
  try {
    await engine(level, root);
  } catch (err) {
    console.error(err);
    fail('Something went wrong in this level.');
  }
})();
