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

  // "Savant" is DM Serif Display drawn as outlines, not <text>: live text in this fixed viewBox depends on the browser's measuring and on what it inherits. Under /start's .ob-wordmark it inherited weight 800, and the clipped t on an iPhone is what that faux bold does when it widens the letters.
  const WORD = 'M529.3 344.5Q515.5 344.5 501.3 341.1Q487 337.8 477.5 332.3L478.8 298.3L481.3 298.3L489 314.5Q492.5 321.5 496.5 326.9Q500.5 332.3 507.5 335.3Q512.5 337.8 517.1 338.6Q521.8 339.5 527.5 339.5Q542.8 339.5 551.6 331.3Q560.5 323 560.5 310Q560.5 297.8 554.5 290.9Q548.5 284 535.3 277.5L525 273Q503.5 263.5 491.4 251.1Q479.3 238.8 479.3 218.3Q479.3 203.5 486.9 192.8Q494.5 182 508.1 176.3Q521.8 170.5 540 170.5Q553.3 170.5 565.1 174Q577 177.5 585.8 183.5L584.3 213.5L581.8 213.5L571.5 194.8Q567.3 186 563 182.4Q558.8 178.8 553.3 177.3Q550 176.3 547.3 175.9Q544.5 175.5 540.3 175.5Q527.5 175.5 518.8 182.9Q510 190.3 510 202.8Q510 215.5 516.8 223.1Q523.5 230.8 536.5 236.8L548 241.8Q572 252.3 582.5 264.1Q593 276 593 294.8Q593 316.8 576.4 330.6Q559.8 344.5 529.3 344.5ZM639.8 343.8Q625.3 343.8 615.4 335.5Q605.5 327.3 605.5 311.8Q605.5 300 617.5 290.1Q629.5 280.3 655.3 275.3Q659.3 274.5 664.3 273.6Q669.3 272.8 674.8 271.8L674.8 252Q674.8 235 670.6 228.1Q666.5 221.3 657.8 221.3Q651.8 221.3 648.3 225.1Q644.8 229 643.8 238.5L643.3 241.3Q642.8 252 638 257Q633.3 262 626.3 262Q619.8 262 615.5 258Q611.3 254 611.3 247.3Q611.3 237 618.4 230Q625.5 223 637.3 219.5Q649 216 662.8 216Q685 216 697.1 226.9Q709.3 237.8 709.3 262.3L709.3 317.5Q709.3 328.8 719.8 328.8L725.3 328.8L727.5 330.8Q722.8 336.8 717.1 340Q711.5 343.3 701.3 343.3Q690.3 343.3 683.9 338.1Q677.5 333 675.5 324.5Q668 332.5 660.1 338.1Q652.3 343.8 639.8 343.8ZM655 328.5Q660 328.5 664.4 326.1Q668.8 323.8 674.8 318.8L674.8 276.8Q672.3 277.3 669.8 277.8Q667.3 278.3 664 278.8Q652.5 281.8 645.6 288.9Q638.8 296 638.8 308Q638.8 318.3 643.5 323.4Q648.3 328.5 655 328.5ZM781.8 340.8L737.5 234.5Q734 226 725.5 223.3L722 222.3L722 219.8L786.8 219.8L786.8 222.3L782.3 223.3Q772.5 225.8 776.3 236.3L802.5 306L827 236.8Q829 231.8 828 228.5Q827 225.3 822 223.8L815.8 222.3L815.8 219.8L852 219.8L852 222.3L844.8 224Q840 225.3 837.4 227.8Q834.8 230.3 833 235.3L796.3 340.8ZM887 343.8Q872.5 343.8 862.6 335.5Q852.8 327.3 852.8 311.8Q852.8 300 864.8 290.1Q876.8 280.3 902.5 275.3Q906.5 274.5 911.5 273.6Q916.5 272.8 922 271.8L922 252Q922 235 917.9 228.1Q913.8 221.3 905 221.3Q899 221.3 895.5 225.1Q892 229 891 238.5L890.5 241.3Q890 252 885.3 257Q880.5 262 873.5 262Q867 262 862.8 258Q858.5 254 858.5 247.3Q858.5 237 865.6 230Q872.8 223 884.5 219.5Q896.3 216 910 216Q932.3 216 944.4 226.9Q956.5 237.8 956.5 262.3L956.5 317.5Q956.5 328.8 967 328.8L972.5 328.8L974.8 330.8Q970 336.8 964.4 340Q958.8 343.3 948.5 343.3Q937.5 343.3 931.1 338.1Q924.8 333 922.8 324.5Q915.3 332.5 907.4 338.1Q899.5 343.8 887 343.8ZM902.3 328.5Q907.3 328.5 911.6 326.1Q916 323.8 922 318.8L922 276.8Q919.5 277.3 917 277.8Q914.5 278.3 911.3 278.8Q899.8 281.8 892.9 288.9Q886 296 886 308Q886 318.3 890.8 323.4Q895.5 328.5 902.3 328.5ZM977.5 340L977.5 337.5L981 336.5Q989.8 334 989.8 324.3L989.8 246Q989.8 240.5 988 237.9Q986.3 235.3 981.3 234.3L977.5 233.3L977.5 230.8L1020.3 216.3L1022.8 218.8L1024.8 233.8Q1033.5 226 1044.5 221Q1055.5 216 1066.3 216Q1082.8 216 1091.6 225Q1100.5 234 1100.5 252.5L1100.5 324.5Q1100.5 334.3 1110 336.8L1112.3 337.5L1112.3 340L1053.3 340L1053.3 337.5L1056.5 336.5Q1065.3 333.8 1065.3 324.3L1065.3 244.5Q1065.3 228.5 1049.3 228.5Q1038.3 228.5 1025.3 239.5L1025.3 324.5Q1025.3 334.3 1034 336.8L1036.3 337.5L1036.3 340ZM1166.3 343.8Q1150.3 343.8 1141.4 335.8Q1132.5 327.8 1132.5 310.3L1132.5 224.8L1115.3 224.8L1115.3 222.3L1121.3 221.3Q1129 219.5 1134.6 216.3Q1140.3 213 1145.8 207.5L1166.3 184.8L1168.8 184.8L1168 219.8L1196 219.8L1196 224.8L1167.8 224.8L1167.8 314.8Q1167.8 323.5 1171.6 328Q1175.5 332.5 1181.5 332.5Q1186.8 332.5 1190.8 329.9Q1194.8 327.3 1198.8 322.8L1201.3 325.3Q1196.3 333.8 1187.5 338.8Q1178.8 343.8 1166.3 343.8Z';
  function wordmark(h) {
    return `<svg class="u2-wm" viewBox="137.5 150.5 1084 216.5" style="height:${h}px;width:${(h * 1084) / 216.5}px" role="img" aria-label="Savant"><rect x="157.7" y="333.1" width="164.5" height="13.7"/><rect x="166.9" y="273.7" width="21.9" height="64"/><rect x="229" y="228" width="21.9" height="109.7"/><rect x="291.2" y="173.2" width="21.9" height="164.5"/><path d="${WORD}"/></svg>`;
  }

  // ── The voice call: the page stays; the giraffe shows the state on itself ──
  // Owner, 7 Nov: "don't make the giraffe take the whole screen, just have him look like he's listening when he is and talking when he is". The giraffe that is already on the
  // page (the guide on Home, else the bar's) gets the state through <html data-u2-call> and CSS: a ring, eyes up when thinking, the existing open mouth moving when talking
  // (data-u2-mouth="talk"; "driven" is js/tutor-giraffe.js mouthDriver and CSS leaves the mouth alone). A small quiet label says the state; "Tap to end, hold for chat" sits under it.
  let stage = null; // the label
  let stageShown = null; // the state on screen
  let endTimer = null;
  let level = 0;
  const root = document.documentElement;
  const HOW = 'Tap to end, hold for chat';
  function buildStage() {
    stage = document.createElement('div');
    stage.id = 'u2-call';
    stage.setAttribute('role', 'status');
    stage.hidden = true;
    stage.innerHTML = '<span class="u2-call-word" id="u2-call-word"></span><small class="u2-call-how" id="u2-call-how"></small>';
    document.body.appendChild(stage);
  }
  const callGiraffes = () => [...document.querySelectorAll('.u2-guide .tutor, .site-header .tdock-g .tutor')];
  function hideStage() {
    clearTimeout(endTimer);
    stageShown = null;
    if (stage) stage.hidden = true;
    delete root.dataset.u2Call;
    delete root.dataset.u2Mouth;
    root.classList.remove('u2-calling');
    root.style.removeProperty('--tdock-level');
  }
  function showState(state, word, mouth) {
    if (!stage) buildStage();
    stage.hidden = false;
    stage.dataset.state = state;
    root.dataset.u2Call = state;
    root.dataset.u2Mouth = mouth || '';
    root.classList.add('u2-calling');
    const text = word || { listening: 'Listening', thinking: 'Thinking', talking: 'Talking' }[state] || '';
    const w = stage.querySelector('#u2-call-word');
    if (w.textContent !== text) w.textContent = text;
    stage.querySelector('#u2-call-how').textContent = state === 'ended' ? '' : HOW;
    const mood = state === 'thinking' ? 'think' : state === 'ended' ? 'wave' : 'idle';
    callGiraffes().forEach((h) => { if (h.dataset.mood !== mood && window.Tutor) window.Tutor.mood(h, mood); });
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
      // The call is over. If the giraffe says why (not on the way to the chat), it says so for a moment.
      if (word) {
        showState('ended', word, '');
        endTimer = setTimeout(hideStage, 4000);
      } else hideStage();
    }
    if (stage && !stage.hidden && voice === 'listening') {
      const v = parseFloat(g.style.getPropertyValue('--tdock-level')) || 0;
      if (v !== level) { level = v; root.style.setProperty('--tdock-level', String(v)); }
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
