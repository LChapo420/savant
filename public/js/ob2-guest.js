/* Onboarding v2: on the app's own pages, a learner who has not saved an account yet sees one quiet line offering to, and one prompt when a
 * lesson finishes. Loaded by js/app.js only when the signed-in user is a guest; nothing else in the app knows about it. */
(function () {
  if (window.__ob2Guest) return;
  window.__ob2Guest = true;

  function bar() {
    if (document.getElementById('ob2-bar')) return;
    const line = document.createElement('div');
    line.id = 'ob2-bar';
    line.setAttribute('style', 'display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px 16px;background:#ffe34d;color:#15171b;font-size:.9375rem;line-height:1.3;text-align:center');
    line.innerHTML = '<span>Your progress isn\'t saved yet.</span> <a href="/start#save" style="color:inherit;font-weight:700;min-height:28px;display:inline-flex;align-items:center">Save it</a>';
    document.body.insertBefore(line, document.body.firstChild);
  }

  function prompt() {
    if (document.getElementById('ob2-sheet')) return;
    let told = false;
    try { told = window.sessionStorage.getItem('ob2.told') === '1'; window.sessionStorage.setItem('ob2.told', '1'); } catch (err) { /* ask anyway */ }
    if (told) return;
    const sheet = document.createElement('dialog');
    sheet.id = 'ob2-sheet';
    sheet.setAttribute('aria-labelledby', 'ob2-sheet-title');
    sheet.setAttribute('style', 'max-width:420px;width:calc(100% - 32px);border:0;border-radius:16px;padding:22px;background:Canvas;color:CanvasText;font:inherit');
    sheet.innerHTML = `<h2 id="ob2-sheet-title" style="margin:0 0 6px;font-size:1.375rem">That's your first lesson done.</h2>
      <p style="margin:0 0 16px">Save your progress so it's still here tomorrow.</p>
      <a href="/start#save" style="display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:12px;background:#15171b;color:#fff;font-weight:700;text-decoration:none;box-shadow:0 0 0 1.5px #f3f4f6">Save my progress</a>
      <button type="button" id="ob2-later" style="display:block;width:100%;min-height:44px;margin-top:6px;border:0;background:none;color:inherit;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer">Keep going for now</button>`;
    document.body.appendChild(sheet);
    sheet.querySelector('#ob2-later').addEventListener('click', () => sheet.close());
    if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', '');
  }

  bar();
  const api = window.App && window.App.api;
  if (api && api.post) {
    const send = api.post.bind(api);
    api.post = async (path, body) => {
      const out = await send(path, body);
      if (/\/(sessions\/\d+\/finish|lessons\/[^/]+\/[^/]+\/\d+\/(finish|game-finish))$/.test(String(path))) prompt();
      return out;
    };
  }
}());
