/* style-boot.js: picks the visual style before the page paints.
 *
 * Load it as a plain, synchronous <script src="/js/style-boot.js"></script> in
 * the <head> of every page, BEFORE the css/style.css link. (The content security
 * policy forbids inline script, so the "tiny inline head script" is this file;
 * a blocking external script in the head has the same no-flash effect.)
 *
 * What it does, in order:
 *   1. Reads the colour-mode preference (localStorage "polymath.theme": "light"
 *      or "dark" when the learner used the sun/moon button, otherwise the
 *      system's prefers-color-scheme) and the style preference (localStorage
 *      "savant.style": "auto" or a style id).
 *   2. Resolves them to one style id:
 *        Auto  -> "chunky" in light mode, "night" in dark mode
 *        pick  -> that style, and its own light/dark mode wins
 *   3. Sets on <html>:  data-style="<id>"   data-mode="light|dark"
 *      and data-theme="light|dark" when the mode is forced (a button press or
 *      an explicit style); data-theme is absent while the system decides, which
 *      is exactly how it behaved before styles existed.
 *   4. document.write()s <link href="/css/styles/<id>.css"> (render-blocking, so
 *      there is never a flash of the wrong style) and updates <meta theme-color>.
 *      Only the active style's file is requested, and a style's @font-face rules
 *      live in that file, so only the active style's fonts are ever downloaded.
 *
 * It also exposes window.SavantStyle for js/app.js and the Profile picker:
 *   SavantStyle.STYLES        the registry (id -> {label, mode, ready})
 *   SavantStyle.state()       {pref, style, mode, forced}
 *   SavantStyle.set(pref)     pref = "auto" or a ready style id; applies now
 *   SavantStyle.setTheme(m)   m = "light" | "dark" | null (the sun/moon button)
 *   SavantStyle.ids()         ids of styles that can be picked (ready: true)
 *
 * To add a style: write public/css/styles/<id>.css, then set ready: true on its
 * entry below (and see public/css/styles/README.md).
 *
 * Must stay ES5-safe and dependency-free: it runs before anything else.
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY_STYLE = 'savant.style';
  var KEY_THEME = 'polymath.theme';

  // id -> label, the mode the style is drawn in, whether its css file exists,
  // and the browser-chrome colour (its --page).
  var STYLES = {
    chunky:     { label: 'Chunky',     mode: 'light', ready: true,  chrome: '#F7F6F2' },
    night:      { label: 'Night',      mode: 'dark',  ready: true,  chrome: '#0F1115' },
    editorial:  { label: 'Editorial',  mode: 'light', ready: true , chrome: '#FAF8F3' },
    desk:       { label: 'Study desk', mode: 'light', ready: true , chrome: '#F6F1E7' },
    notebook:   { label: 'Notebook',   mode: 'light', ready: true , chrome: '#FBFAF5' },
    bento:      { label: 'Bento',      mode: 'light', ready: true , chrome: '#F3F3F1' }
  };
  var AUTO = { light: 'chunky', dark: 'night' };

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { /* private browsing: the choice lasts for this page only */ }
  }
  function systemDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function resolve() {
    var theme = read(KEY_THEME);
    if (theme !== 'light' && theme !== 'dark') theme = null;
    var pref = read(KEY_STYLE) || 'auto';
    var picked = pref !== 'auto' && STYLES[pref] && STYLES[pref].ready ? pref : null;
    if (!picked) pref = 'auto';
    var mode = picked ? STYLES[picked].mode : (theme || (systemDark() ? 'dark' : 'light'));
    var style = picked || AUTO[mode];
    // data-theme is set only when something forced the mode.
    var forced = picked ? mode : theme;
    return { pref: pref, style: style, mode: mode, forced: forced };
  }

  var loaded = {};
  function cssHref(id) { return '/css/styles/' + id + '.css'; }

  function chrome(style) {
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) {
      metas[i].removeAttribute('media');
      metas[i].setAttribute('content', STYLES[style].chrome);
    }
  }

  function apply(r) {
    root.setAttribute('data-style', r.style);
    root.setAttribute('data-mode', r.mode);
    if (r.forced) root.setAttribute('data-theme', r.forced);
    else root.removeAttribute('data-theme');
    root.style.colorScheme = r.mode;
    if (document.head) chrome(r.style);
  }

  var current = resolve();

  // First paint: a parser-inserted <link> blocks rendering until it has loaded.
  loaded[current.style] = true;
  document.write('<link rel="stylesheet" id="style-css-' + current.style + '" href="' + cssHref(current.style) + '">');
  apply(current);
  document.addEventListener('DOMContentLoaded', function () { chrome(current.style); });

  // Later switches (the Profile picker, the sun/moon button): load the file
  // first, then flip the attribute, so there is no unstyled frame.
  function switchTo(next, done) {
    function go() { current = next; apply(next); if (done) done(next); }
    if (loaded[next.style] || document.getElementById('style-css-' + next.style)) { loaded[next.style] = true; go(); return; }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'style-css-' + next.style;
    link.href = cssHref(next.style);
    link.onload = function () { loaded[next.style] = true; go(); };
    link.onerror = function () { go(); };
    document.head.appendChild(link);
  }

  // While the system decides (no forced mode, style on Auto), follow it live.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var follow = function () {
      var next = resolve();
      if (next.style !== current.style) switchTo(next);
    };
    if (mq.addEventListener) mq.addEventListener('change', follow);
    else if (mq.addListener) mq.addListener(follow);
  }

  window.SavantStyle = {
    STYLES: STYLES,
    ids: function () { return Object.keys(STYLES).filter(function (id) { return STYLES[id].ready; }); },
    state: function () { return { pref: current.pref, style: current.style, mode: current.mode, forced: current.forced }; },
    /** pref: "auto" or a ready style id. Kept in localStorage; the caller saves it to the server. */
    set: function (pref, done) {
      if (pref !== 'auto' && !(STYLES[pref] && STYLES[pref].ready)) pref = 'auto';
      write(KEY_STYLE, pref === 'auto' ? null : pref);
      // Choosing Auto hands the mode back to the system unless a button forced it.
      switchTo(resolve(), done);
    },
    /** The sun/moon button. mode: "light" | "dark" | null. Choosing a mode puts the style back on Auto. */
    setTheme: function (mode, done) {
      write(KEY_THEME, mode === 'light' || mode === 'dark' ? mode : null);
      write(KEY_STYLE, null);
      switchTo(resolve(), done);
    },
    /** Apply a preference that arrived from the server (user.style_pref) without writing back. */
    adopt: function (pref) {
      var have = read(KEY_STYLE) || 'auto';
      if (!pref || pref === have) return;
      if (pref !== 'auto' && !(STYLES[pref] && STYLES[pref].ready)) return;
      write(KEY_STYLE, pref === 'auto' ? null : pref);
      switchTo(resolve());
    }
  };
})();
