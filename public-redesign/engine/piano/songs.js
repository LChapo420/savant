/* The song path page (songs.html): grades of songs with this learner's stars, from the server. */
(function () {
  var pathHost = document.getElementById('path');
  var notice = document.getElementById('notice');
  var total = document.getElementById('total');
  var player = document.getElementById('player');
  var openSong = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }

  function stars(n) {
    var s = el('span', 'stars');
    s.setAttribute('aria-label', n + ' of 3 stars');
    for (var i = 0; i < 3; i++) s.appendChild(el('span', i < n ? null : 'off', '★'));
    return s;
  }

  function load() {
    return fetch('/api/piano/songs', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(draw)
      .catch(function () { pathHost.innerHTML = ''; pathHost.appendChild(el('p', 'lead', 'The song path could not be loaded. Reload the page to try again.')); });
  }

  function draw(data) {
    notice.innerHTML = '';
    if (!data.signed_in) {
      var n = el('div', 'notice', 'You are not signed in, so stars are not kept. ');
      var a = el('a', null, 'Sign in');
      a.href = '/login';
      n.appendChild(a);
      n.appendChild(document.createTextNode(' to keep them on your path.'));
      notice.appendChild(n);
    }
    var earned = 0;
    var possible = 0;
    pathHost.innerHTML = '';
    data.grades.forEach(function (g) {
      var card = el('section', 'grade');
      var h = el('h2', null, 'Grade ' + g.number + ': ' + g.name);
      if (data.current_grade === g.id) h.appendChild(el('span', 'badge', 'Your grade'));
      card.appendChild(h);
      var got = g.songs.reduce(function (s, x) { return s + x.best; }, 0);
      card.appendChild(el('p', 'sub', got + ' of ' + g.songs.length * 3 + ' stars'));
      earned += got;
      possible += g.songs.length * 3;
      var path = el('div', 'path');
      g.songs.forEach(function (s, i) {
        var stop = el('div', 'stop');
        var node = el('button', 'node' + (s.best ? ' is-done' : ''), s.open ? String(i + 1) : '🔒');
        node.type = 'button';
        node.disabled = !s.open;
        node.setAttribute('aria-label', s.title + (s.open ? ', ' + s.best + ' of 3 stars' : ', locked: earn a star on the song before it first'));
        node.addEventListener('click', function () { play(s.id); });
        var label = el('div', 'label');
        label.appendChild(el('b', null, s.title));
        label.appendChild(el('span', null, s.by + (s.open ? '' : ' · opens after a star on the song before')));
        label.appendChild(document.createElement('br'));
        label.appendChild(stars(s.best));
        stop.appendChild(node);
        stop.appendChild(label);
        path.appendChild(stop);
      });
      card.appendChild(path);
      pathHost.appendChild(card);
    });
    total.textContent = '★ ' + earned + ' / ' + possible;
  }

  function play(id) {
    openSong = id;
    window.LessonBlocks.get('Piano_Song').render(player, { prompt: 'Start with your right hand in Learn mode, then try Play mode, then both hands.', song: id, hands: 'right', mode: 'learn' });
    player.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('pianosongresult', function () { load(); });
  load().then(function () {
    var want = new URLSearchParams(location.search).get('song');
    if (want) play(want);
  });
})();
