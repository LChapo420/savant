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

  // Small illustrated icons for the sidebar: each tool drawn as an object with its own colours and a little
  // depth (a lighter top face, a darker edge), not a line icon on a coloured square.
  var g = function (id, a, b) { return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>'; };
  var ILL = {
    overview: '<defs>' + g('ov1', '#ffb36b', '#f57a2c') + g('ov2', '#7fb8ff', '#3d7fe6') + g('ov3', '#8ee3b0', '#2fb36b') + g('ov4', '#ffd36b', '#f2a91c') + '</defs>'
      + '<rect x="3" y="3" width="12" height="12" rx="3.5" fill="url(#ov1)"/><rect x="17" y="3" width="12" height="12" rx="3.5" fill="url(#ov2)"/><rect x="3" y="17" width="12" height="12" rx="3.5" fill="url(#ov3)"/><rect x="17" y="17" width="12" height="12" rx="3.5" fill="url(#ov4)"/>',
    flashcards: '<defs>' + g('fc1', '#ffd36b', '#f2a91c') + g('fc2', '#ff9a5c', '#f2552c') + '</defs>'
      + '<rect x="9" y="3" width="19" height="14" rx="3" transform="rotate(10 18.5 10)" fill="url(#fc1)"/><rect x="4" y="9" width="20" height="15" rx="3.2" fill="url(#fc2)"/><rect x="4" y="9" width="20" height="4" rx="2" fill="#fff" opacity=".22"/><rect x="8" y="16" width="12" height="2.2" rx="1.1" fill="#fff" opacity=".9"/><rect x="8" y="19.6" width="7" height="2.2" rx="1.1" fill="#fff" opacity=".7"/>',
    quiz: '<defs>' + g('qz', '#7ab6ff', '#2f6fe8') + '</defs>'
      + '<path d="M6 4h20a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H14l-6 5v-5H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill="url(#qz)"/><path d="M6 4h20a3 3 0 0 1 3 3v3H3V7a3 3 0 0 1 3-3z" fill="#fff" opacity=".18"/>'
      + '<path d="M13 10.5a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.8v.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="19" r="1.4" fill="#fff"/>',
    blanks: '<defs>' + g('fb', '#ffe08a', '#f5b623') + '</defs>'
      + '<rect x="3" y="5" width="26" height="22" rx="3.5" fill="url(#fb)"/><rect x="3" y="5" width="26" height="5" rx="2.5" fill="#fff" opacity=".25"/>'
      + '<rect x="7" y="12" width="7" height="2.4" rx="1.2" fill="#8a5a00" opacity=".55"/><rect x="16" y="12" width="9" height="2.4" rx="1.2" fill="#fff"/><rect x="7" y="17" width="10" height="2.4" rx="1.2" fill="#fff"/><rect x="19" y="17" width="6" height="2.4" rx="1.2" fill="#8a5a00" opacity=".55"/><rect x="7" y="22" width="13" height="2.4" rx="1.2" fill="#8a5a00" opacity=".55"/>',
    written: '<defs>' + g('wt', '#b9a3ff', '#7a5cf0') + g('pn', '#ffcf66', '#f2a01c') + '</defs>'
      + '<rect x="4" y="3" width="19" height="25" rx="3" fill="url(#wt)"/><rect x="8" y="9" width="11" height="2.2" rx="1.1" fill="#fff" opacity=".9"/><rect x="8" y="13.5" width="11" height="2.2" rx="1.1" fill="#fff" opacity=".75"/><rect x="8" y="18" width="7" height="2.2" rx="1.1" fill="#fff" opacity=".6"/>'
      + '<path d="M26.5 11.5l2.5 2.5-9 9-3.6 1.1 1.1-3.6z" fill="url(#pn)"/><path d="M16.4 24.1l1.1-3.6 2.5 2.5z" fill="#3a2a10"/>',
    tutor: '<defs>' + g('tu1', '#8ee3b0', '#22a35e') + g('tu2', '#ffffff', '#e6efe9') + '</defs>'
      + '<path d="M5 3h16a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H11l-5 4v-4H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" fill="url(#tu1)"/>'
      + '<path d="M14 14h13a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1v3l-4-3h-8a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" fill="url(#tu2)" stroke="#cfe3d6"/>'
      + '<circle cx="9" cy="10.5" r="1.4" fill="#fff"/><circle cx="13" cy="10.5" r="1.4" fill="#fff"/><circle cx="17" cy="10.5" r="1.4" fill="#fff"/>',
    notes: '<defs>' + g('nt', '#8fb0ff', '#3b5bdb') + '</defs>'
      + '<rect x="5" y="5" width="22" height="24" rx="3.5" fill="url(#nt)"/><rect x="5" y="5" width="22" height="6" rx="3" fill="#fff" opacity=".2"/>'
      + '<circle cx="10" cy="5" r="1.6" fill="#e8eeff" stroke="#2a46b8"/><circle cx="16" cy="5" r="1.6" fill="#e8eeff" stroke="#2a46b8"/><circle cx="22" cy="5" r="1.6" fill="#e8eeff" stroke="#2a46b8"/>'
      + '<rect x="9" y="14" width="14" height="2.2" rx="1.1" fill="#fff"/><rect x="9" y="18.5" width="14" height="2.2" rx="1.1" fill="#fff" opacity=".8"/><rect x="9" y="23" width="9" height="2.2" rx="1.1" fill="#fff" opacity=".65"/>',
    podcast: '<defs>' + g('pc', '#ff8fbf', '#e03478') + g('pc2', '#ff6fa3', '#b81f5c') + '</defs>'
      + '<path d="M5 18v-3a11 11 0 0 1 22 0v3" fill="none" stroke="url(#pc)" stroke-width="3.2" stroke-linecap="round"/>'
      + '<rect x="3" y="16" width="7.5" height="12" rx="3.2" fill="url(#pc2)"/><rect x="21.5" y="16" width="7.5" height="12" rx="3.2" fill="url(#pc2)"/>'
      + '<rect x="4.6" y="17.6" width="2.4" height="5" rx="1.2" fill="#fff" opacity=".45"/><rect x="23.1" y="17.6" width="2.4" height="5" rx="1.2" fill="#fff" opacity=".45"/>',
    content: '<defs>' + g('ct', '#6fd8e6', '#0f9fb0') + '</defs>'
      + '<path d="M4 6a3 3 0 0 1 3-3h7a2 2 0 0 1 2 2v23a3 3 0 0 0-3-2H4z" fill="url(#ct)"/><path d="M28 6a3 3 0 0 0-3-3h-7a2 2 0 0 0-2 2v23a3 3 0 0 1 3-2h9z" fill="url(#ct)" opacity=".85"/>'
      + '<rect x="7" y="9" width="6" height="1.8" rx=".9" fill="#fff" opacity=".85"/><rect x="7" y="13" width="6" height="1.8" rx=".9" fill="#fff" opacity=".7"/><rect x="19" y="9" width="6" height="1.8" rx=".9" fill="#fff" opacity=".85"/><rect x="19" y="13" width="6" height="1.8" rx=".9" fill="#fff" opacity=".7"/>',
  };
  var ill = function (k) { return '<svg class="ill" viewBox="0 0 32 32" aria-hidden="true">' + ILL[k] + '</svg>'; };
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

  nav.innerHTML = PAGES.map(function (p) { return '<button type="button" data-page="' + p[0] + '">' + ill(p[0]) + '<span>' + p[1] + '</span></button>'; }).join('');
  nav.addEventListener('click', function (e) { var b = e.target.closest('[data-page]'); if (b) show(b.getAttribute('data-page')); });

  function show(page) {
    Array.prototype.forEach.call(nav.children, function (b) { b.classList.toggle('on', b.getAttribute('data-page') === page); });
    if (page !== 'podcast') stop();
    if (page === 'flashcards') return flashcards();
    if (page === 'quiz') return quiz();
    if (page === 'podcast') return podcast();
    var label = PAGES.filter(function (p) { return p[0] === page; })[0][1];
    main.innerHTML = '<div class="placeholder"><div class="ic">' + ill(page) + '</div><h3>' + label + '</h3><p>This part of your study set is being prepared. It will be ready in a moment.</p></div>';
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
  // Light or dark: the system's choice until the sun/moon button picks one (remembered on this device).
  var THEME_KEY = 'savant.demoTheme';
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var isDark = function () { var t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; };
  var drawTheme = function () { $('#theme').innerHTML = isDark() ? SUN : MOON; };
  try { var saved = window.localStorage.getItem(THEME_KEY); if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved); } catch (e) { /* private mode */ }
  $('#theme').addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { window.localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    drawTheme();
  });
  drawTheme();

  $('#go').addEventListener('click', function () { if (!$('#link').value.trim()) { $('#link').value = 'https://www.youtube.com/watch?v=intro-psych-lecture-9'; } build(); });
  $('#link').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#go').click(); } });
}());
