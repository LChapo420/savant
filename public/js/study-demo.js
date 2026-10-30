/* The filming demo of the study-set flow (public/study-demo.html). Nothing is uploaded or generated. */
(function () {
  var ICON = {
    overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
    flashcards: '<rect x="2" y="6" width="16" height="12" rx="2"/><path d="M6 6V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
    blanks: '<path d="M4 7h16M4 12h6M14 12h6M4 17h16"/>',
    written: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
    tutor: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    notes: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    podcast: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
    content: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/>',
  };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>'; };
  var PAGES = [['overview', 'Overview'], ['flashcards', 'Flashcards'], ['quiz', 'Quiz'], ['blanks', 'Fill in the blanks'], ['written', 'Written test'], ['tutor', 'Tutor lesson'], ['notes', 'Notes'], ['podcast', 'Podcast'], ['content', 'Content']];

  // Intro psychology: learning and conditioning. Shown as card 41-45 of 133 and question 7-11 of 20.
  var CARDS = [
    ['What is classical conditioning?', 'Learning in which a neutral stimulus comes to trigger a response after being repeatedly paired with a stimulus that already triggers it (Pavlov\'s dogs salivating to a bell).'],
    ['Unconditioned stimulus (US) vs. conditioned stimulus (CS)', 'The US triggers a response naturally (food → salivation). The CS starts out neutral and triggers the response only after pairing with the US (bell → salivation).'],
    ['What is extinction?', 'The weakening of a conditioned response when the CS is presented again and again without the US, or when a behavior is no longer reinforced.'],
    ['Negative reinforcement', 'Increasing a behavior by removing something unpleasant after it (taking aspirin removes a headache, so you take aspirin again). It is not punishment.'],
    ['Variable-ratio schedule', 'Reinforcement after an unpredictable number of responses, like a slot machine. It produces high, steady response rates that are very resistant to extinction.'],
  ];
  var QUIZ = [
    { q: 'A child is afraid of dogs after being bitten. Seeing any dog now causes fear. In this example, the dog is the:', c: ['Unconditioned stimulus', 'Conditioned stimulus', 'Unconditioned response', 'Neutral stimulus'], a: 1, why: 'The dog was neutral until it was paired with the bite (the US). Now it triggers fear on its own, so it is a conditioned stimulus.' },
    { q: 'Which schedule of reinforcement is most resistant to extinction?', c: ['Fixed-ratio', 'Fixed-interval', 'Variable-ratio', 'Continuous'], a: 2, why: 'Because reinforcement comes after an unpredictable number of responses, it is hard to tell when it has stopped, so the behavior lasts.' },
    { q: 'Removing a teen\'s phone because they broke curfew is an example of:', c: ['Positive punishment', 'Negative punishment', 'Negative reinforcement', 'Positive reinforcement'], a: 1, why: 'Something pleasant is taken away to decrease a behavior: negative punishment.' },
    { q: 'In Pavlov\'s experiment, salivating to the bell after training is the:', c: ['Conditioned response', 'Unconditioned response', 'Conditioned stimulus', 'Spontaneous recovery'], a: 0, why: 'The salivation is now triggered by the learned stimulus (the bell), so it is a conditioned response.' },
    { q: 'A conditioned response reappears after a rest period, following extinction. This is called:', c: ['Generalization', 'Discrimination', 'Spontaneous recovery', 'Shaping'], a: 2, why: 'Spontaneous recovery is the return of an extinguished response after a pause, showing extinction suppresses rather than erases learning.' },
  ];
  var TRANSCRIPT = [
    ['6:31', 'Maya', 'So Pavlov wasn\'t even studying learning. He was measuring digestion, and the dogs kept drooling before the food arrived.'],
    ['6:48', 'Sam', 'Right, they drooled at the footsteps of the assistant. That annoyance turned into one of the most famous findings in psychology.'],
    ['7:05', 'Maya', 'And that\'s the key move: a neutral stimulus, the bell, gets paired with food until the bell alone triggers salivation.'],
    ['7:12', 'Sam', 'Which is exactly where students mix things up on the exam: the food is the unconditioned stimulus, the bell becomes the conditioned one.'],
    ['7:31', 'Maya', 'Quick check for you, listener: if the bell keeps ringing with no food, what happens to the drooling?'],
    ['7:44', 'Sam', 'It fades. That\'s extinction. But give it a day, ring the bell, and some drooling comes back: spontaneous recovery.'],
  ];

  var $ = function (s) { return document.querySelector(s); };
  var nav = $('#nav');
  var main = $('#main');
  var cardIx = 0;
  var qIx = 0;
  var podT = 7 * 60 + 12; // 7:12 into 30:00
  var playing = false;
  var timer = null;
  var speed = 1;

  nav.innerHTML = PAGES.map(function (p) { return '<button type="button" data-page="' + p[0] + '">' + svg(p[0]) + p[1] + '</button>'; }).join('');
  nav.addEventListener('click', function (e) { var b = e.target.closest('[data-page]'); if (b) show(b.getAttribute('data-page')); });

  function show(page) {
    Array.prototype.forEach.call(nav.children, function (b) { b.classList.toggle('on', b.getAttribute('data-page') === page); });
    if (page !== 'podcast') stop();
    if (page === 'flashcards') return flashcards();
    if (page === 'quiz') return quiz();
    if (page === 'podcast') return podcast();
    var label = PAGES.filter(function (p) { return p[0] === page; })[0][1];
    main.innerHTML = '<div class="placeholder"><div class="ic">' + svg(page) + '</div><h3>' + label + '</h3><p>This part of your study set is being prepared. It will be ready in a moment.</p></div>';
  }

  function flashcards() {
    var n = 41 + cardIx;
    main.innerHTML = '<div class="row"><div><h2>Flashcards</h2><p class="sub">Tap the card to flip it. Rate how well you knew it, and Savant brings it back at the right time.</p></div>'
      + '<div class="mastery"><span><b>38</b> learned</span><span><b>12</b> still learning</span><span><b>83</b> new</span></div></div>'
      + '<div class="row" style="max-width:760px;margin:6px auto 0"><span class="sub" style="margin:0"><b style="color:var(--ink)">' + n + '</b> / 133</span><div class="bar" style="flex:1;margin-left:14px"><i style="width:' + (n / 133 * 100).toFixed(1) + '%"></i></div></div>'
      + '<div class="card-stage"><div class="flash" id="flash"><div class="face"><small>Term</small>' + CARDS[cardIx][0] + '</div><div class="face back"><small>Definition</small>' + CARDS[cardIx][1] + '</div></div></div>'
      + '<div class="card-actions"><button class="btn ghost" type="button" id="prev">← Previous</button><div class="rate"><button class="r1" type="button">Again</button><button class="r2" type="button">Hard</button><button class="r3" type="button">Got it</button></div><button class="btn ghost" type="button" id="next">Next →</button></div>';
    $('#flash').addEventListener('click', function () { this.classList.toggle('flipped'); });
    var step = function (d) { cardIx = (cardIx + d + CARDS.length) % CARDS.length; flashcards(); };
    $('#prev').addEventListener('click', function () { step(-1); });
    $('#next').addEventListener('click', function () { step(1); });
    Array.prototype.forEach.call(document.querySelectorAll('.rate button'), function (b) { b.addEventListener('click', function () { step(1); }); });
  }

  function quiz() {
    var n = 7 + qIx;
    var it = QUIZ[qIx];
    main.innerHTML = '<div class="row"><div><h2>Quiz</h2><p class="sub">Multiple choice from your lecture. Wrong answers come back later until you have them.</p></div><span class="sub" style="margin:0">Score so far: <b style="color:var(--ink)">' + (5 + qIx) + ' / ' + (6 + qIx) + '</b></span></div>'
      + '<div class="row" style="max-width:760px;margin:6px auto 0"><span class="sub" style="margin:0">Question <b style="color:var(--ink)">' + n + '</b> / 20</span><div class="bar" style="flex:1;margin-left:14px"><i style="width:' + (n / 20 * 100) + '%"></i></div></div>'
      + '<div class="q"><h3>' + it.q + '</h3>' + it.c.map(function (c, i) { return '<button class="choice" type="button" data-i="' + i + '"><span class="k">' + 'ABCD'[i] + '</span>' + c + '</button>'; }).join('')
      + '<div class="explain" id="explain"></div><div class="row" style="margin-top:14px"><span></span><button class="btn" type="button" id="qnext">Next question →</button></div></div>';
    var answered = false;
    Array.prototype.forEach.call(document.querySelectorAll('.choice'), function (b) {
      b.addEventListener('click', function () {
        if (answered) return;
        answered = true;
        var i = Number(b.getAttribute('data-i'));
        document.querySelectorAll('.choice')[it.a].classList.add('right');
        if (i !== it.a) b.classList.add('wrong');
        var ex = $('#explain');
        ex.innerHTML = (i === it.a ? '<b>Correct.</b> ' : '<b>Not quite.</b> ') + it.why;
        ex.classList.add('show');
      });
    });
    $('#qnext').addEventListener('click', function () { qIx = (qIx + 1) % QUIZ.length; quiz(); });
  }

  var fmt = function (s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function podcast() {
    var bars = '';
    for (var i = 0; i < 90; i++) { var h = 20 + Math.round(70 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37))); bars += '<i data-b="' + i + '" style="height:' + h + '%"></i>'; }
    main.innerHTML = '<h2>Podcast</h2><p class="sub">A conversation about your lecture, made for you. It pauses to ask you questions.</p>'
      + '<div class="pod"><div class="player"><div class="meta"><div class="cover">' + svg('podcast') + '</div><div><h3>Bells, Treats and Slot Machines</h3><p>Learning and conditioning · Maya and Sam · 30 min</p></div></div>'
      + '<div class="wave" id="wave">' + bars + '</div><div class="times"><span id="cur"></span><span>30:00</span></div>'
      + '<div class="controls"><button type="button" class="speed" id="speed">1×</button><button type="button" id="back" aria-label="Back 15 seconds"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>'
      + '<button type="button" class="play" id="play" aria-label="Play"></button>'
      + '<button type="button" id="fwd" aria-label="Forward 15 seconds"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button><span style="width:44px"></span></div></div>'
      + '<div class="transcript" id="tx">' + TRANSCRIPT.map(function (l) { return '<div class="line" data-t="' + l[0] + '"><b>' + l[1] + '</b><span>' + l[2] + '</span></div>'; }).join('') + '</div></div>';
    $('#play').addEventListener('click', function () { if (playing) stop(); else start(); });
    $('#back').addEventListener('click', function () { podT -= 15; draw(); });
    $('#fwd').addEventListener('click', function () { podT += 15; draw(); });
    $('#speed').addEventListener('click', function () { speed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1; this.textContent = speed + '×'; });
    draw();
  }
  function draw() {
    if (!$('#cur')) return;
    podT = Math.min(Math.max(podT, 0), 1800);
    $('#cur').textContent = fmt(podT);
    var past = Math.round(podT / 1800 * 90);
    Array.prototype.forEach.call(document.querySelectorAll('#wave i'), function (b, i) { b.classList.toggle('past', i < past); });
    $('#play').innerHTML = playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l11-7z"/></svg>';
    var lines = document.querySelectorAll('#tx .line');
    var current = 0;
    Array.prototype.forEach.call(lines, function (l, i) { var p = l.getAttribute('data-t').split(':'); if (podT >= Number(p[0]) * 60 + Number(p[1])) current = i; });
    Array.prototype.forEach.call(lines, function (l, i) { l.classList.toggle('now', i === current); });
  }
  function start() { playing = true; timer = setInterval(function () { podT += speed; draw(); }, 1000); draw(); }
  function stop() { playing = false; if (timer) clearInterval(timer); timer = null; draw(); }

  // Upload screen: choosing "Paste link" opens the box; any link runs the build steps, then opens Flashcards.
  Array.prototype.forEach.call(document.querySelectorAll('.opt'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.opt'), function (o) { o.classList.toggle('active', o === b); });
      var box = $('#linkbox');
      box.classList.add('show');
      var opt = b.getAttribute('data-opt');
      $('#link').placeholder = opt === 'link' ? 'Paste a link: YouTube, a website, Google Slides…' : opt === 'file' ? 'Choose a file, or paste a link to it…' : 'Paste the link to your recording…';
      $('#link').focus();
    });
  });
  function build() {
    $('#gen').classList.add('show');
    var steps = document.querySelectorAll('.step');
    var i = 0;
    (function tick() {
      if (i > 0) { steps[i - 1].classList.remove('run'); steps[i - 1].classList.add('done'); }
      if (i === steps.length) { setTimeout(function () { $('#upload').style.display = 'none'; $('#set').classList.add('show'); show('flashcards'); window.scrollTo(0, 0); }, 500); return; }
      steps[i].classList.add('run');
      i++;
      setTimeout(tick, 850);
    }());
  }
  $('#go').addEventListener('click', function () { if (!$('#link').value.trim()) { $('#link').value = 'https://www.youtube.com/watch?v=intro-psych-lecture-9'; } build(); });
  $('#link').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#go').click(); } });
}());
