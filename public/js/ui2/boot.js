/* Before the page paints, when UI_V2 is on (services/ui-v2.js puts this at the end of <head>).
 *
 * js/style-boot.js still works out light or dark (data-mode), from the sun/moon choice or the system's. Under UI v2 there is one look, the approved v4, in both modes, so the older whole-page styles
 * must not apply: css/screens/study.css and others have rules for [data-style="night"] and "bento" that would change the fonts and cards. So data-style stays "chunky", the base the new
 * tokens were checked on (css/ui2/tokens.css loads its file), whatever the style code sets it to. The address bar's colour follows the mode.
 */
(function () {
  const root = document.documentElement;
  function pin() {
    if (root.dataset.style !== 'chunky') root.dataset.style = 'chunky';
    const color = root.dataset.mode === 'dark' ? '#14161a' : '#ffffff';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { if (m.content !== color) m.content = color; });
  }
  pin();
  new MutationObserver(pin).observe(root, { attributes: true, attributeFilter: ['data-style', 'data-mode'] });
}());
