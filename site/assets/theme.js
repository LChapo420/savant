/* Runs in <head> before the page paints, so a saved light or dark choice never flashes. */
(function () {
  try {
    var saved = localStorage.getItem('savant-site-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) { /* storage blocked: follow the system setting */ }
})();
