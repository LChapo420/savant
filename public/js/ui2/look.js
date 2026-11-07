/* What app pages and /start share under UI_V2 (docs/UI-V2.md): the giraffe as a guide, and the wordmark.
 *
 *   U2Look.giraffe(host, { crop: 'bust' | 'full', mood })  mounts the original Sunny SVG from js/start-tutor.js. It is not redrawn: only the window (viewBox) changes.
 *   U2Look.bind(el, { noTutor })  makes it press like the small giraffe in the top bar: tap for the chat, hold for the voice call. It passes the press on to that giraffe
 *                                 (js/tutor-giraffe.js), so its timing, its release-unlocks-sound rule and every gate the tutor dock has stay in one place. noTutor runs when there is no dock.
 *   U2Look.wordmark(height)       the mockup's wordmark: the same bars, the same serif, in ink.
 *   U2Look.watchTutor()           while a voice call runs, the giraffe fills the screen, its mouth moving as it talks, and says plainly how to end the call and switch to chat. It only reads the state
 *                                 js/tutor-giraffe.js already writes (data-voice, data-mouth, the word beside it), and a press on it goes to that giraffe too, so tap ends the call and hold goes to chat, as on this branch.
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

  // ── The voice call, full screen ──────────────────────────────────────────
  let stage = null;
  let stageShown = null; // the state on screen
  let endTimer = null;
  let level = 0;
  function buildStage() {
    stage = document.createElement('div');
    stage.id = 'u2-call';
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', 'Voice call with your tutor');
    stage.hidden = true;
    stage.innerHTML = `<div class="u2-bubble u2-down" id="u2-call-word" aria-hidden="true"></div>
      <button type="button" class="u2-call-g"><span class="u2-call-ring" aria-hidden="true"></span><span class="u2-call-host"></span></button>
      <p class="u2-call-how" id="u2-call-how"><b>Tap me</b> to end the call. <b>Hold me</b> to switch to chat.</p>
      <button type="button" class="u2-btn2" id="u2-call-done" hidden>Back</button>`;
    document.body.appendChild(stage);
    giraffe(stage.querySelector('.u2-call-host'), { crop: 'full' });
    bind(stage.querySelector('.u2-call-g'));
    stage.querySelector('.u2-call-g').setAttribute('aria-label', 'Tap to end the call. Press and hold to switch to chat.');
    stage.querySelector('.u2-call-g').title = '';
    stage.querySelector('#u2-call-done').addEventListener('click', hideStage);
  }
  function hideStage() {
    clearTimeout(endTimer);
    stageShown = null;
    if (stage) stage.hidden = true;
    document.documentElement.classList.remove('u2-calling');
  }
  function showState(state, word, mouth) {
    if (!stage) buildStage();
    stage.hidden = false;
    stage.dataset.state = state;
    stage.dataset.mouth = mouth || '';
    document.documentElement.classList.add('u2-calling');
    const w = stage.querySelector('#u2-call-word');
    const text = word || { listening: 'Listening', thinking: 'Thinking', talking: 'Talking' }[state] || '';
    if (w.textContent !== text) w.textContent = text;
    stage.querySelector('#u2-call-how').hidden = state === 'ended';
    stage.querySelector('#u2-call-done').hidden = state !== 'ended';
    const host = stage.querySelector('.u2-call-host');
    const mood = state === 'thinking' ? 'think' : state === 'ended' ? 'wave' : 'idle';
    if (host.dataset.mood !== mood && window.Tutor) window.Tutor.mood(host, mood);
    stageShown = state;
  }
  function syncCall() {
    const g = document.querySelector('.tdock-g');
    if (!g) return;
    const voice = g.dataset.voice || '';
    const word = g.querySelector('.tdock-g-status') ? g.querySelector('.tdock-g-status').textContent.trim() : '';
    if (voice) {
      clearTimeout(endTimer);
      showState(voice, word, g.dataset.mouth);
    } else if (stageShown && stageShown !== 'ended') {
      // The call is over. If the giraffe says why (not on the way to the chat), it says so here for a moment.
      if (word) {
        showState('ended', word, '');
        endTimer = setTimeout(hideStage, 4000);
      } else hideStage();
    }
    if (stage && !stage.hidden && voice === 'listening') {
      const v = parseFloat(g.style.getPropertyValue('--tdock-level')) || 0;
      if (v !== level) { level = v; stage.style.setProperty('--tdock-level', String(v)); }
    }
  }
  // ── The chat's head: the giraffe, the title ──────────────────────────────
  function dressChat() {
    const head = document.querySelector('.tdock-panel .tdock-head');
    if (!head || head.dataset.u2) return;
    head.dataset.u2 = '1';
    const host = document.createElement('span');
    host.className = 'u2-chat-g';
    head.insertBefore(host, head.firstChild);
    giraffe(host, { crop: 'bust' });
    const title = head.querySelector('.tdock-title');
    if (title) title.textContent = 'Tutor';
  }
  let watching = false;
  function watchTutor() {
    if (watching || !window.MutationObserver) return;
    watching = true;
    let queued = false;
    const run = () => { queued = false; dressChat(); syncCall(); };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
    new MutationObserver(queue).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-voice', 'data-mouth', 'style'] });
    queue();
  }

  window.U2Look = { giraffe, crop, bind, wordmark, watchTutor };
}());
