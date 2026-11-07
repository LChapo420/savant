/* The small giraffe that opens the tutor (owner, 7 Nov 2026: "you tap on the giraffe and the chat pops up").
 *
 *   const g = TutorGiraffe.create({ onTap, onHold, onRelease, onAlt, altLabel });
 *   g.setVoice('listening' | 'thinking' | 'talking' | null);  g.say('Listening');  g.setOpen(bool);
 *
 * Where it sits (place() below), always in the page's own top bar, in the flow, so it covers nothing:
 *   - a question player: the player's sticky top bar (the site header steps away there)
 *   - phone and tablet: the sticky header, just left of the theme and sign-out buttons, top right
 *   - desktop: the fixed left sidebar, right under the wordmark
 *   - a page with no header of ours (the Spanish learn pages): a thin sticky bar added at the top of the page
 *
 * Press: tap < HOLD_MS <= hold. Works with touch, mouse, and the keyboard (hold Enter or Space). A screen reader's activate
 * is a click, which counts as a tap; the second button (hidden until focused) does what the hold does.
 *
 * THE MOUTH. For now the talking state is one CSS animation on .t-mouth. When the final character is chosen, speech-synced mouth shapes plug in here and
 * nowhere else: set TutorGiraffe.mouthDriver = { start({ text, audioContext, source, setShape }), stop() }. tutor-call.js calls g.speaking(true, ...) when a
 * sentence starts (source is the audio node when the server's voice is playing, null for the browser's voice) and g.speaking(false) when it stops. setShape(name)
 * writes data-mouth-shape on the giraffe, for the character's CSS to read. While a driver is set the CSS animation is off.
 */
(function () {
  const HOLD_MS = 450;
  const MOVE_PX = 14;

  function create({ onTap, onHold, onRelease, onAlt, altLabel }) {
    const root = document.createElement('span');
    root.className = 'tdock-g';
    root.innerHTML = `
      <span class="tdock-g-status" aria-live="polite"></span>
      <button type="button" class="tdock-g-btn" aria-expanded="false" aria-label="Open the tutor chat" title="Tap to chat. Hold to talk.">
        <span class="tdock-g-ring" aria-hidden="true"></span>
        <span class="tdock-g-face"></span>
      </button>
      <button type="button" class="tdock-g-alt">${altLabel || 'Start a voice call with the tutor'}</button>`;
    const btn = root.querySelector('.tdock-g-btn');
    const alt = root.querySelector('.tdock-g-alt');
    const statusEl = root.querySelector('.tdock-g-status');
    const face = root.querySelector('.tdock-g-face');
    if (window.Tutor) {
      window.Tutor.mount(face);
      // Only the head at this size: the full body would be a speck in a top bar.
      const svg = face.querySelector('svg');
      if (svg) svg.setAttribute('viewBox', '-122 -248 244 244');
    }

    // ── Press ──────────────────────────────────────────────────────────────
    let timer = null;
    let held = false;
    let down = null;
    let handledAt = 0;
    let viaKeys = false;
    const clearPress = () => { clearTimeout(timer); timer = null; root.classList.remove('is-pressing'); };
    const startPress = (x, y) => {
      held = false;
      down = { x, y };
      root.classList.add('is-pressing');
      timer = setTimeout(() => {
        timer = null;
        held = true;
        root.classList.remove('is-pressing');
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* not allowed */ } }
        if (onHold) onHold();
      }, HOLD_MS);
    };
    const endPress = () => {
      const wasHold = held;
      const pending = !!timer;
      clearPress();
      down = null;
      held = false;
      handledAt = Date.now();
      // The release is the user gesture a phone wants before it will play sound (the hold itself does not count on touch).
      if (wasHold) { if (onRelease) onRelease(); return; }
      if (pending && onTap) onTap();
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      viaKeys = false;
      try { btn.setPointerCapture(e.pointerId); } catch { /* an old browser */ }
      startPress(e.clientX, e.clientY);
    });
    btn.addEventListener('pointermove', (e) => {
      if (!down || !timer) return;
      if (Math.abs(e.clientX - down.x) > MOVE_PX || Math.abs(e.clientY - down.y) > MOVE_PX) { clearPress(); down = null; handledAt = Date.now(); } // a slide is neither a tap nor a hold
    });
    btn.addEventListener('pointerup', () => { if (down || held) endPress(); });
    btn.addEventListener('pointercancel', () => { clearPress(); down = null; held = false; handledAt = Date.now(); });
    // No callout, no selection, no drag, no scroll from this press.
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('dragstart', (e) => e.preventDefault());
    btn.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    btn.addEventListener('selectstart', (e) => e.preventDefault());
    // The keyboard: Enter or Space is a tap, held down it is a hold.
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      viaKeys = true;
      if (!e.repeat && !down && !held) startPress(0, 0);
    });
    btn.addEventListener('keyup', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (down || held) endPress();
    });
    btn.addEventListener('blur', () => { if (timer) { clearPress(); down = null; } });
    // A screen reader's activate, or a click with nothing before it. Ignored right after a press it belongs to.
    btn.addEventListener('click', (e) => {
      if (Date.now() - handledAt < 700) { e.preventDefault(); return; }
      if (onTap) onTap();
    });
    alt.addEventListener('click', () => { if (onAlt) onAlt(); });

    // ── Where it sits ──────────────────────────────────────────────────────
    let ownBar = null;
    const wide = () => window.matchMedia && window.matchMedia('(min-width: 1025px)').matches && document.body.classList.contains('has-tabbar');
    const shown = (n) => !!n && getComputedStyle(n).display !== 'none';
    function hostFor() {
      const head = document.querySelector('.player .player-head');
      if (head && shown(head)) {
        const chips = head.querySelector('.player-chips');
        return { parent: chips || head, before: null };
      }
      const wrap = document.querySelector('.site-header .wrap');
      if (wrap && shown(wrap.parentElement)) {
        if (wide()) {
          const brand = wrap.querySelector('.brand');
          if (brand) return { parent: wrap, before: brand.nextSibling === root ? root.nextSibling : brand.nextSibling };
        }
        const actions = wrap.querySelector('.header-actions');
        if (actions) return { parent: wrap, before: actions };
      }
      if (!ownBar) { ownBar = document.createElement('div'); ownBar.className = 'tdock-bar'; }
      if (ownBar.parentElement !== document.body) document.body.insertBefore(ownBar, document.body.firstChild);
      return { parent: ownBar, before: null };
    }
    function place() {
      const { parent, before } = hostFor();
      if (ownBar && parent !== ownBar && ownBar.parentElement) ownBar.remove();
      if (root.parentElement === parent && (before === null ? (root.parentElement.lastElementChild === root || parent !== ownBar) : root.nextSibling === before)) return;
      const hadFocus = root.contains(document.activeElement) ? document.activeElement : null;
      parent.insertBefore(root, before);
      if (hadFocus) { try { hadFocus.focus({ preventScroll: true }); } catch { /* gone */ } }
    }
    let queued = false;
    const queue = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; place(); }, 120); };
    place();
    // The header and the player redraw themselves after they load; the giraffe goes back where it belongs.
    if (window.MutationObserver) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', queue);

    // ── States ─────────────────────────────────────────────────────────────
    let noticeTimer = null;
    const g = {
      root,
      button: btn,
      viaKeyboard: () => viaKeys,
      setVoice(state) {
        root.dataset.voice = state || '';
        if (face.dataset) face.dataset.mood = state === 'thinking' ? 'think' : 'idle';
        if (!state) root.style.removeProperty('--tdock-level');
        document.documentElement.classList.toggle('tdock-in-call', !!state);
      },
      /** A level from 0 to 1: the listening ring breathes with the learner's voice (not with reduced motion). */
      setLevel(v) { root.style.setProperty('--tdock-level', String(Math.max(0, Math.min(1, v)))); },
      /** The word beside the giraffe; announced to screen readers. `ms` clears it afterwards. */
      say(text, ms) {
        clearTimeout(noticeTimer);
        statusEl.textContent = text || '';
        root.classList.toggle('has-status', !!text);
        if (ms) noticeTimer = setTimeout(() => { statusEl.textContent = ''; root.classList.remove('has-status'); }, ms);
      },
      setOpen(open) { btn.setAttribute('aria-expanded', String(!!open)); if (!root.dataset.voice) btn.setAttribute('aria-label', open ? 'Close the tutor chat' : 'Open the tutor chat'); },
      setLabels(main, second) { if (main) btn.setAttribute('aria-label', main); if (second) alt.textContent = second; },
      focus() { try { btn.focus({ preventScroll: true }); } catch { /* gone */ } },
      /** The mouth plug: see the header. */
      speaking(on, ctx) {
        const driver = window.TutorGiraffe.mouthDriver;
        root.dataset.mouth = on ? (driver ? 'driven' : 'talk') : '';
        if (driver) {
          if (on) driver.start({ ...ctx, setShape: (name) => { root.dataset.mouthShape = name; } });
          else { driver.stop(); delete root.dataset.mouthShape; }
        }
      },
      wave() { if (window.Tutor) window.Tutor.mood(face, 'wave', 3500); },
      place,
    };
    return g;
  }

  window.TutorGiraffe = { create, mouthDriver: null, HOLD_MS };
}());
