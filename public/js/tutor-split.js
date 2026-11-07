/* The chat beside the page, never over it (owner, 7 Nov 2026).
 *
 *   const split = TutorSplit.create(panel, { side: 'bottom' });
 *   split.open(); split.close(); split.setSide('top'); split.place() // 'top' | 'bottom' | 'right'
 *
 * Phone, upright: the chat fills part of the screen from the top or the bottom, the learner's choice. The page stays where it always was (the window scrolls,
 * nothing is moved into a frame, so an open lesson or a half-typed answer is not reloaded); it gets room so all of it can be scrolled into the part left over:
 *   - from the bottom: padding at the end of the page
 *   - from the top: the chat sits under the page's top bar, and a spacer right after that bar pushes the page down by the chat's height
 *   - the page's own fixed and sticky bars (Check, Next, toasts, a modal's backdrop) are moved clear of the chat, by inline style, and put back on close
 * Desktop and a phone on its side: a panel on the right, and the page narrows by its width.
 *
 * The on-screen keyboard shrinks only the visual viewport on phones, so every size here comes from visualViewport. On a very small screen with the keyboard up the
 * page's share can reach nothing: the chat takes what is left until the keyboard goes.
 */
(function () {
  const OWN = '.tdock-panel, .tdock-g, .tdock-bar, .tdock-spacer';
  const MIN_CHAT = 210;
  const MIN_WINDOW = 120;

  function create(panel, { side = 'bottom' } = {}) {
    let isOpen = false;
    let current = side === 'top' ? 'top' : 'bottom';
    let geo = { place: 'bottom', chat: 0, topOff: 0, botOff: 0, width: 0 };
    const html = document.documentElement;
    const spacer = document.createElement('div');
    spacer.className = 'tdock-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    const moved = new Map(); // element -> its inline style before we touched it, plus its own computed offsets

    // ── The lesson's top bar ───────────────────────────────────────────────
    // A session's bar is tall on a phone and scrolls away with the page, and the giraffe is in it. Once the page has scrolled, or when the chat comes from the top, only the bar's
    // first row stays, stuck to the top; the margin keeps the page exactly where it was, so nothing jumps.
    let slimForced = false;
    function slimHead() {
      const head = document.querySelector('.player .player-head');
      if (!head) return;
      const slim = head.classList.contains('tdock-slim');
      if (!slim) {
        if (getComputedStyle(head).position === 'sticky') return; // this player's bar sticks by itself
        const r = head.getBoundingClientRect();
        head.dataset.tdockTop = String(r.top + window.scrollY);
        head.dataset.tdockFull = String(r.height);
      }
      const want = slimForced || window.scrollY > Number(head.dataset.tdockTop || 0) + 4;
      if (want === slim) return;
      if (want) {
        const row = head.querySelector('.tdock-g') || head.querySelector('.player-chips');
        const headTop = head.getBoundingClientRect().top;
        const rowH = row ? Math.ceil(row.getBoundingClientRect().bottom - headTop + 6) : 56;
        const full = Number(head.dataset.tdockFull || rowH);
        head.dataset.tdockMargin = getComputedStyle(head).marginBottom;
        head.classList.add('tdock-slim');
        head.style.height = `${rowH}px`;
        head.style.setProperty('margin-bottom', `calc(${head.dataset.tdockMargin} + ${slimForced ? 0 : Math.max(0, full - rowH)}px)`, 'important');
      } else {
        head.classList.remove('tdock-slim');
        head.style.height = '';
        head.style.removeProperty('margin-bottom');
      }
    }
    window.addEventListener('scroll', slimHead, { passive: true });

    function topBar() {
      for (const n of [document.querySelector('.player .player-head'), document.querySelector('.tdock-bar'), document.querySelector('.site-header')]) {
        if (!n) continue;
        const cs = getComputedStyle(n);
        if (cs.display !== 'none' && (cs.position === 'sticky' || cs.position === 'fixed') && n.offsetWidth > window.innerWidth * 0.5) return n;
      }
      return null;
    }
    function tabBar() {
      const t = document.getElementById('tabbar');
      if (!t) return null;
      const cs = getComputedStyle(t);
      return cs.display === 'none' ? null : t;
    }

    function measure() {
      const vv = window.visualViewport;
      const zoomed = vv && vv.scale > 1.05;
      const vvH = vv && !zoomed ? vv.height : window.innerHeight;
      const vvTop = vv && !zoomed ? vv.offsetTop : 0;
      const keyboard = window.innerHeight - vvH - vvTop > 80;
      const W = html.clientWidth || window.innerWidth;
      const H = window.innerHeight;
      if (W >= 900 || (W > H && H < 520)) {
        const width = Math.round(W >= 900 ? Math.min(420, Math.max(340, W * 0.3)) : W * 0.46);
        return { place: 'right', chat: 0, width, vvH, vvTop, H, W, keyboard, topOff: 0, botOff: 0 };
      }
      if (current === 'top' && !slimForced && isOpen) { slimForced = true; slimHead(); }
      const bar = topBar();
      const tabs = keyboard ? null : tabBar();
      const barH = bar ? bar.offsetHeight : 0;
      const topH = vvTop > 0 ? 0 : barH;
      const tabH = tabs ? tabs.offsetHeight : 0;
      const room = vvH - topH - tabH;
      const wanted = keyboard ? room * 0.62 : room * 0.5;
      let chat = Math.round(Math.max(MIN_CHAT, Math.min(wanted, room - MIN_WINDOW)));
      if (room < MIN_CHAT + MIN_WINDOW) chat = Math.round(room); // a tiny screen: the chat gets it all while it needs it
      chat = Math.min(chat, Math.round(room));
      return current === 'top'
        ? { place: 'top', chat, width: 0, vvH, vvTop, H, W, keyboard, topOff: topH + vvTop, botOff: 0, bar, tabH }
        : { place: 'bottom', chat, width: 0, vvH, vvTop, H, W, keyboard, topOff: 0, botOff: Math.max(0, H - vvTop - vvH) + tabH, bar, tabH };
    }

    function applyPanel() {
      const s = panel.style;
      panel.dataset.place = geo.place;
      if (geo.place === 'right') {
        s.top = `${geo.vvTop}px`; s.bottom = 'auto'; s.left = 'auto'; s.right = '0'; s.width = `${geo.width}px`; s.height = `${geo.vvH}px`;
        panel.dataset.tight = String(geo.vvH < 420);
        return;
      }
      s.left = '0'; s.right = '0'; s.width = 'auto'; s.height = `${geo.chat}px`;
      panel.dataset.tight = String(geo.chat < 300); // no room for the notes and chips: the words and the typing box come first
      if (geo.place === 'top') { s.top = `${geo.topOff}px`; s.bottom = 'auto'; } else { s.bottom = `${geo.botOff}px`; s.top = 'auto'; }
    }

    function applyPage() {
      const open = isOpen;
      html.style.paddingBottom = open && geo.place === 'bottom' ? `${geo.chat}px` : '';
      html.style.paddingRight = open && geo.place === 'right' ? `${geo.width}px` : '';
      html.style.scrollPaddingBottom = open && geo.place === 'bottom' ? `${geo.chat + (geo.tabH || 0) + 16}px` : '';
      html.style.scrollPaddingTop = open && geo.place === 'top' ? `${geo.chat + geo.topOff + 12}px` : '';
      html.dataset.tdock = open ? geo.place : '';
      document.body.classList.toggle('tdock-compact', open && geo.place !== 'right' && geo.H < 520);
      if (slimForced !== (open && geo.place === 'top')) { slimForced = open && geo.place === 'top'; const h = document.querySelector('.player .player-head.tdock-slim'); if (h) { h.classList.remove('tdock-slim'); h.style.height = ''; h.style.removeProperty('margin-bottom'); } slimHead(); }
      if (open && geo.place === 'top') {
        const bar = geo.bar;
        const anchor = bar && bar.parentElement ? bar : null;
        if (anchor) { if (spacer.previousElementSibling !== anchor) anchor.parentElement.insertBefore(spacer, anchor.nextSibling); } else if (spacer.parentElement !== document.body || spacer !== document.body.firstChild) document.body.insertBefore(spacer, document.body.firstChild);
        spacer.style.height = `${geo.chat}px`;
      } else if (spacer.parentElement) spacer.remove();
    }

    // ── The page's own fixed and sticky things ─────────────────────────────
    function restore(el) {
      const was = moved.get(el);
      if (!was) return;
      for (const k of Object.keys(was.inline)) el.style[k] = was.inline[k];
      moved.delete(el);
    }
    function restoreAll() { for (const el of [...moved.keys()]) restore(el); }
    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

    function moveClear(el) {
      const wasMoved = moved.get(el);
      if (wasMoved) { for (const k of Object.keys(wasMoved.inline)) el.style[k] = wasMoved.inline[k]; moved.delete(el); }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const inline = { top: el.style.top, bottom: el.style.bottom, right: el.style.right, maxWidth: el.style.maxWidth, height: el.style.height };
      const set = (k, v) => { el.style[k] = v; };
      const H = window.innerHeight;
      let touched = false;
      if (cs.position === 'fixed') {
        if (el.id === 'tabbar' && geo.place !== 'right') return; // the chat sits above the tab bar
        if (el.classList.contains('site-header')) return; // the desktop sidebar is on the left, the sticky header is the top bar
        if (geo.place === 'right') {
          if (r.right > geo.W - geo.width + 1) { set('right', `${(num(cs.right) || 0) + geo.width}px`); set('maxWidth', `calc(100vw - ${geo.width}px)`); touched = true; }
        } else {
          const big = r.height >= H * 0.6;
          const off = geo.chat;
          if (geo.place === 'bottom' && (big || r.bottom > H * 0.5)) {
            const own = num(cs.bottom) || 0;
            const tabH = geo.tabH || 0;
            set('bottom', `${big || own < tabH ? off + tabH : own + off}px`); // clear of the chat, and of the tab bar under it
            if (big) { set('height', 'auto'); set('top', cs.top); } else set('top', 'auto');
            touched = true;
          } else if (geo.place === 'top' && (big || r.top < H * 0.5)) {
            set('top', `${(num(cs.top) || 0) + off + geo.topOff}px`);
            if (big) { set('height', 'auto'); set('bottom', cs.bottom); } else set('bottom', 'auto');
            touched = true;
          }
        }
      } else if (cs.position === 'sticky' && geo.place !== 'right') {
        if (el === geo.bar || el.classList.contains('site-header')) return;
        if (geo.place === 'top' && cs.top !== 'auto') { set('top', `${(num(cs.top) || 0) + geo.chat}px`); touched = true; }
        if (geo.place === 'bottom' && cs.bottom !== 'auto') { set('bottom', `${(num(cs.bottom) || 0) + geo.chat}px`); touched = true; }
      }
      if (touched) moved.set(el, { inline });
    }

    function scan() {
      if (!isOpen || !document.body) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(n) {
          if (n.matches(OWN)) return NodeFilter.FILTER_REJECT;
          if (n.namespaceURI === 'http://www.w3.org/2000/svg') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const gone = new Set(moved.keys());
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (moved.has(n)) { gone.delete(n); moveClear(n); continue; }
        const p = getComputedStyle(n).position;
        if (p === 'fixed' || p === 'sticky') moveClear(n);
      }
      for (const el of gone) moved.delete(el); // left the page
    }
    let scanTimer = null;
    const queueScan = () => { if (scanTimer || !isOpen) return; scanTimer = setTimeout(() => { scanTimer = null; scan(); }, 250); };

    function layout() {
      if (!isOpen) return;
      const before = `${geo.place}:${geo.chat}:${geo.width}:${geo.topOff}:${geo.botOff}`;
      geo = measure();
      applyPanel();
      applyPage();
      if (`${geo.place}:${geo.chat}:${geo.width}:${geo.topOff}:${geo.botOff}` !== before) scan();
    }
    let frame = 0;
    const queueLayout = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; layout(); }); };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueLayout);
      window.visualViewport.addEventListener('scroll', queueLayout);
    }
    window.addEventListener('resize', queueLayout);
    window.addEventListener('orientationchange', () => setTimeout(queueLayout, 250));
    panel.addEventListener('focusin', () => setTimeout(queueLayout, 300));
    panel.addEventListener('focusout', () => setTimeout(queueLayout, 300));
    if (window.MutationObserver) new MutationObserver(() => { if (isOpen) { queueScan(); queueLayout(); } }).observe(document.documentElement, { childList: true, subtree: true });

    return {
      open() {
        if (isOpen) return;
        isOpen = true;
        geo = measure();
        applyPanel();
        applyPage();
        scan();
        panel.dataset.open = 'true';
      },
      close() {
        if (!isOpen) return;
        isOpen = false;
        panel.dataset.open = 'false';
        restoreAll();
        applyPage();
      },
      setSide(s) {
        current = s === 'top' ? 'top' : 'bottom';
        if (!isOpen) { geo = measure(); applyPanel(); return; }
        restoreAll();
        geo = measure();
        applyPanel();
        applyPage();
        scan();
      },
      side: () => current,
      place: () => measure().place,
      isOpen: () => isOpen,
      layout,
    };
  }

  window.TutorSplit = { create };
}());
