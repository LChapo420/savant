/* The song player testbed (see song-demo.html). */
(function () {
  var B = window.LessonBlocks;
  var pick = document.getElementById('pick');
  var host = document.getElementById('song');
  var params = new URLSearchParams(location.search);

  function show(id) {
    B.get('Piano_Song').render(host, { prompt: 'Start with your right hand in Learn mode, then try Play mode.', song: id, hands: 'right', mode: 'learn' });
  }

  fetch('/api/piano/songs', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
    j.grades.forEach(function (g) {
      var group = document.createElement('optgroup');
      group.label = 'Grade ' + g.number + ': ' + g.name;
      g.songs.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.title;
        group.appendChild(o);
      });
      pick.appendChild(group);
    });
    var first = params.get('song') || 'mary-had-a-little-lamb';
    pick.value = first;
    show(pick.value || first);
  });
  pick.addEventListener('change', function () { show(pick.value); });

  // Written into the block: four bars on the black keys, both hands.
  B.get('Piano_Song').render(document.getElementById('inline'), {
    prompt: 'A short black-key tune written for this page.',
    title: 'Black-Key Steps', beatsPerBar: 4, tempo: 80,
    rh: [{ note: 'F#4', beats: 1 }, { note: 'G#4', beats: 1 }, { note: 'A#4', beats: 2 }, { note: 'A#4', beats: 1 }, { note: 'G#4', beats: 1 }, { note: 'F#4', beats: 2 },
      { note: 'C#5', beats: 1 }, { note: 'A#4', beats: 1 }, { note: 'G#4', beats: 2 }, { note: 'F#4', beats: 4 }],
    lh: [{ note: 'F#3', beats: 4 }, { note: 'F#3', beats: 4 }, { note: 'C#3', beats: 4 }, { note: 'F#3', beats: 4 }],
  });
})();
