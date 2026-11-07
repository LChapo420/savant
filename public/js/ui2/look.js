/* What app pages and /start share under UI_V2 (docs/UI-V2.md): the giraffe as a guide, and the wordmark.
 *
 *   U2Look.giraffe(host, { crop: 'bust' | 'full', mood })  mounts the original Sunny SVG from js/start-tutor.js. It is not redrawn: only the window (viewBox) changes.
 *   U2Look.bind(el, { noTutor })  makes it press like the small giraffe in the top bar: tap for the chat, hold for the voice call. It passes the press on to that giraffe
 *                                 (js/tutor-giraffe.js), so its timing, its release-unlocks-sound rule and every gate the tutor dock has stay in one place. noTutor runs when there is no dock.
 *   U2Look.wordmark(height)       the mockup's wordmark: the same bars, the same serif, in ink.
 */
(function () {
  const FULL = '-135 -250 270 425';
  const BUST = '-135 -250 270 280'; // stops at the shoulders
  let n = 0;

  function giraffe(host, { crop = 'full', mood = 'idle' } = {}) {
    if (!window.Tutor || !host) return;
    window.Tutor.mount(host, { mood });
    // Each copy gets its own clip id, so hiding the top bar's giraffe never takes another copy's clip with it.
    n += 1;
    host.innerHTML = host.innerHTML.replace(/tutor-body-clip/g, `u2-body-clip-${n}`);
    window.U2Look.crop(host, crop);
  }
  function crop(host, kind) {
    const svg = host && host.querySelector('svg');
    if (svg) svg.setAttribute('viewBox', kind === 'bust' ? BUST : FULL);
  }

  function bind(el, { noTutor } = {}) {
    if (!el || el.dataset.u2Bound) return;
    el.dataset.u2Bound = '1';
    el.classList.add('u2-g');
    if (el.tagName !== 'BUTTON') { el.setAttribute('role', 'button'); el.tabIndex = 0; }
    el.setAttribute('aria-label', 'Open the tutor chat. Press and hold for a voice call.');
    el.title = 'Tap to chat. Hold to talk.';
    const dock = () => document.querySelector('.tdock-g-btn');
    let lastPointer = 0;
    let pressed = false;
    const pass = (type, e) => {
      const d = dock();
      if (d) d.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY }));
      return !!d;
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      pressed = true;
      lastPointer = Date.now();
      el.classList.add('is-pressing');
      try { el.setPointerCapture(e.pointerId); } catch { /* an old browser */ }
      pass('pointerdown', e);
    });
    el.addEventListener('pointermove', (e) => { if (pressed) pass('pointermove', e); });
    el.addEventListener('pointerup', (e) => {
      if (!pressed) return;
      pressed = false;
      lastPointer = Date.now();
      el.classList.remove('is-pressing');
      if (!pass('pointerup', e) && noTutor) noTutor();
    });
    el.addEventListener('pointercancel', (e) => { pressed = false; el.classList.remove('is-pressing'); pass('pointercancel', e); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dragstart', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener('selectstart', (e) => e.preventDefault());
    const keys = (type) => (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const d = dock();
      if (d) d.dispatchEvent(new KeyboardEvent(type, { key: e.key, repeat: e.repeat, bubbles: true }));
      else if (type === 'keyup' && noTutor) noTutor();
    };
    el.addEventListener('keydown', keys('keydown'));
    el.addEventListener('keyup', keys('keyup'));
    // A screen reader's activate: a click with no press before it.
    el.addEventListener('click', (e) => {
      if (Date.now() - lastPointer < 700) { e.preventDefault(); return; }
      const d = dock();
      if (d) d.click(); else if (noTutor) noTutor();
    });
  }

  function wordmark(h) {
    return `<svg class="u2-wm" viewBox="137.5 150.5 1084 216.5" style="height:${h}px;width:${(h * 1084) / 216.5}px" role="img" aria-label="Savant"><rect x="157.7" y="333.1" width="164.5" height="13.7"/><rect x="166.9" y="273.7" width="21.9" height="64"/><rect x="229" y="228" width="21.9" height="109.7"/><rect x="291.2" y="173.2" width="21.9" height="164.5"/><text x="470" y="340" font-size="250" letter-spacing="-2">Savant</text></svg>`;
  }

  window.U2Look = { giraffe, crop, bind, wordmark };
}());
