(function () {
  'use strict';
  // Mobile fit + rotate prompt for the full Moto X3M Phaser game block.
  // The game is a fixed 720x480 (Phaser defaults to NO_SCALE), so on a small
  // screen the canvas gets clipped inside a tall black frame. This finds the
  // game in Phaser.GAMES and switches it to SHOW_ALL so it fills its frame at
  // the correct 3:2 aspect ratio. Also shows a rotate prompt in portrait.

  function game() {
    return window.__motoGame
      || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0])
      || null;
  }

  // SHOW_ALL scales the canvas to fit its parent while keeping the aspect ratio.
  function fit() {
    var g = game();
    if (!g || !g.scale || !window.Phaser || !Phaser.ScaleManager) return;
    try {
      g.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
      g.scale.pageAlignHorizontally = true;
      g.scale.pageAlignVertically = true;
      if (g.scale.refresh) g.scale.refresh();
    } catch (e) {}
  }

  // Configure once the game is booted; refit on every container change.
  var iv = setInterval(function () {
    var g = game();
    if (g && g.isBooted) { fit(); clearInterval(iv); }
  }, 100);
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);

  // Portrait rotate prompt — the game is landscape-locked (720x480).
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
    overlay.className = (portrait && handheld) ? 'show' : '';
  }
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();
})();