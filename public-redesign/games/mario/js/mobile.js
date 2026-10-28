//On-screen controls for touch devices.
(function() {
  var isTouch = (navigator.maxTouchPoints > 0) ||
    (navigator.msMaxTouchPoints > 0) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (!isTouch) return;
  document.body.classList.add('touch');

  var KEYS = ['LEFT', 'RIGHT', 'DOWN', 'JUMP', 'RUN'];
  var buttons = [];

  function releaseAll() {
    KEYS.forEach(function(key) { input.release(key); });
    buttons.forEach(function(btn) { btn.classList.remove('active'); });
  }

  function makeButton(label, key, cls) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctrl-btn ' + cls;
    btn.textContent = label;
    btn.setAttribute('aria-label', key);

    btn.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      if (btn.setPointerCapture) {
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      }
      input.press(key);
      btn.classList.add('active');
    });
    btn.addEventListener('pointerup', function(e) {
      e.preventDefault();
      input.release(key);
      btn.classList.remove('active');
    });
    btn.addEventListener('pointercancel', function(e) {
      e.preventDefault();
      input.release(key);
      btn.classList.remove('active');
    });
    btn.addEventListener('contextmenu', function(e) { e.preventDefault(); });

    buttons.push(btn);
    return btn;
  }

  var dpad = document.createElement('div');
  dpad.className = 'cluster dpad';
  dpad.appendChild(makeButton('\u25c0', 'LEFT', 'left'));
  dpad.appendChild(makeButton('\u25bc', 'DOWN', 'down'));
  dpad.appendChild(makeButton('\u25b6', 'RIGHT', 'right'));

  var actions = document.createElement('div');
  actions.className = 'cluster actions';
  actions.appendChild(makeButton('B', 'RUN', 'run'));
  actions.appendChild(makeButton('A', 'JUMP', 'jump'));

  var controls = document.createElement('div');
  controls.className = 'mobile-controls show';
  controls.appendChild(dpad);
  controls.appendChild(actions);
  document.body.appendChild(controls);

  //never leave a button stuck down if the app loses focus
  window.addEventListener('blur', releaseAll);
})();
