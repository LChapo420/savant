(function () {
  'use strict';
  // Portrait rotate prompt for the Mario game block. game.css already scales the
  // canvas to fit its frame; this shows a rotate guide in portrait and freezes
  // play while the guide is up (so Mario can't die behind it).

  var overlay = document.createElement('div');
  overlay.id = 'mx3m-rotate';
  overlay.innerHTML = '<div class="mx3m-rotate-card">'
    + '<div class="mx3m-rotate-phone"></div>'
    + '<div class="mx3m-rotate-arrow">↻</div>'
    + '<div class="mx3m-rotate-title">Rotate your phone</div>'
    + '<div class="mx3m-rotate-sub">This game plays in landscape.</div>'
    + '</div>';
  function mount() { if (document.body) document.body.appendChild(overlay); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  function checkOrientation() {
    var portrait = !!(window.matchMedia && window.matchMedia('(orientation: portrait)').matches);
    // Only prompt on hand-held-sized screens, not a tall desktop window.
    var handheld = Math.min(window.innerWidth, window.innerHeight) < 620;
    var showPrompt = portrait && handheld;
    overlay.className = showPrompt ? 'show' : '';
    // Freeze while the prompt is up, and keep frozen while a death question is
    // open. game.js's loop reads this global each frame.
    var questionUp = !!(document.querySelector && document.querySelector('#math-overlay:not(.hidden)'));
    window.paused = showPrompt || questionUp;
  }
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();
})();