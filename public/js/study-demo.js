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

  // College intro psychology (PSYC 101, lecture 9): learning and conditioning. Shown as card 41-45 of 133 and question 7-11 of 20.
  var CARDS = [
    ['Blocking (Kamin, 1969)', 'A new CS added to a CS that already predicts the US gains little or no conditioning. Pairing alone is not enough: the US must be surprising for learning to occur.'],
    ['Rescorla–Wagner model (1972)', 'ΔV = αβ(λ − ΣV). Learning on each trial is proportional to the prediction error: the US that actually occurs (λ) minus what all the CSs present already predict (ΣV).'],
    ['Contingency vs. contiguity (Rescorla, 1968)', 'A CS is conditioned when it changes the probability of the US, not merely when the two co-occur. If the US is just as likely without the CS, many pairings produce almost no conditioning.'],
    ['Conditioned taste aversion (Garcia & Koelling, 1966)', 'Taste is readily associated with illness and audiovisual cues with shock, but not the reverse. Learning can occur in one trial across hours of delay, challenging the equipotentiality assumption.'],
    ['Partial reinforcement extinction effect (PREE)', 'Behavior reinforced intermittently extinguishes more slowly than behavior reinforced after every response, because non-reinforcement is harder to tell apart from training.'],
  ];
  var QUIZ = [
    { q: 'Rats first learn tone → shock. Next, a tone + light compound is paired with shock. Tested with the light alone, they show little fear. This is:', c: ['Blocking', 'Overshadowing', 'Latent inhibition', 'Sensory preconditioning'], a: 0, why: 'The tone already predicts the shock, so the compound trials produce almost no prediction error and the light gains little associative strength (Kamin, 1969).' },
    { q: 'According to the Rescorla–Wagner model, the change in associative strength on a trial is largest when:', c: ['The US is fully predicted by the CSs present', 'The difference between λ and ΣV is largest', 'The CS and US begin at the same moment', 'The CS is salient but the US is omitted on every trial'], a: 1, why: 'ΔV = αβ(λ − ΣV): learning scales with prediction error, so it is greatest early in training, when ΣV is far from λ.' },
    { q: 'Shock occurs with probability .40 whether or not a tone is playing. After 100 tone–shock pairings, the tone produces almost no fear. This best supports the idea that:', c: ['Contiguity is sufficient for conditioning', 'Conditioning depends on contingency, not mere pairing', 'Extinction has occurred', 'Spontaneous recovery is being suppressed'], a: 1, why: 'The tone adds no information about shock, since p(US | CS) = p(US | no CS), so it is not conditioned despite frequent pairings (Rescorla, 1968).' },
    { q: 'A parent allows video games (a high-frequency behavior) only after homework (a low-frequency behavior) is finished. This applies the:', c: ['Premack principle', 'Matching law', 'Law of effect', 'Shaping by successive approximations'], a: 0, why: 'Premack (1959): the opportunity to do a more probable behavior can reinforce a less probable one.' },
    { q: 'Pigeons choose between keys on concurrent VI 30-s and VI 60-s schedules. Herrnstein\'s matching law predicts they will:', c: ['Respond only on the VI 30-s key', 'Split responses roughly 2:1 toward the VI 30-s key', 'Split responses evenly', 'Respond more on the VI 60-s key'], a: 1, why: 'Relative response rate matches relative reinforcement rate. The VI 30-s key pays off about twice as often, so about two-thirds of responses go there (Herrnstein, 1961).' },
  ];
  var TRANSCRIPT = [
    ['6:31', 'Maya', 'For decades the textbook story was contiguity: pair a tone with food often enough and the association forms. Rescorla\'s 1968 study broke that.'],
    ['6:52', 'Sam', 'He kept the number of tone–shock pairings the same, but added extra shocks when no tone was playing. The animals stopped fearing the tone.'],
    ['7:12', 'Maya', 'Because the tone no longer told them anything. Conditioning tracks contingency, how much the CS changes the probability of the US, not just how often the two co-occur.'],
    ['7:34', 'Sam', 'And Kamin\'s blocking result points the same way. If the tone already predicts the shock, adding a light gives no new information, so the light barely gets conditioned.'],
    ['7:55', 'Maya', 'Which is exactly what Rescorla–Wagner formalizes: learning is driven by prediction error, lambda minus the summed V. No surprise, no learning.'],
    ['8:16', 'Sam', 'Pause here, listener: in a blocking design, what is the prediction error on the compound trials, and why?'],
  ];
  // The two podcast hosts, drawn as small cartoon portraits. Each has a colour that their name uses too.
  var HOSTS = {
    Maya: '<svg class="face-av" viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="avm"><circle cx="20" cy="20" r="20"/></clipPath></defs><g clip-path="url(#avm)">'
      + '<rect width="40" height="40" fill="#ffd6e5"/><path d="M8.5 24c0-10 5-15.5 11.5-15.5S31.5 14 31.5 24v10h-23z" fill="#5a2e22"/>'
      + '<path d="M7 42c1-8 6.5-11 13-11s12 3 13 11z" fill="#e03478"/><rect x="17" y="25" width="6" height="7" rx="2" fill="#e8b08a"/>'
      + '<ellipse cx="20" cy="20.5" rx="7.6" ry="8.6" fill="#f7cba6"/><path d="M12.2 19.5c.8-6.2 4.6-9.6 8.6-9.6 4.3 0 7.5 3.2 7.9 7.6-3.4-.6-6.4-2.6-8.4-5-1.6 3.4-4.6 5.8-8.1 7z" fill="#5a2e22"/>'
      + '<circle cx="17" cy="21.4" r="1.15" fill="#2b1a14"/><circle cx="23" cy="21.4" r="1.15" fill="#2b1a14"/><circle cx="15.4" cy="24.3" r="1.5" fill="#ff8fa8" opacity=".55"/><circle cx="24.6" cy="24.3" r="1.5" fill="#ff8fa8" opacity=".55"/>'
      + '<path d="M17.6 25.4c1.4 1.3 3.4 1.3 4.8 0" fill="none" stroke="#8a3b2a" stroke-width="1.2" stroke-linecap="round"/><circle cx="12.6" cy="24" r="1" fill="#ffd36b"/><circle cx="27.4" cy="24" r="1" fill="#ffd36b"/></g></svg>',
    Sam: '<svg class="face-av" viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="avs"><circle cx="20" cy="20" r="20"/></clipPath></defs><g clip-path="url(#avs)">'
      + '<rect width="40" height="40" fill="#d6e8ff"/><path d="M7 42c1-8 6.5-11 13-11s12 3 13 11z" fill="#2f6fe8"/><path d="M16.5 31l3.5 4 3.5-4z" fill="#fff"/><rect x="17" y="25" width="6" height="7" rx="2" fill="#a86f48"/>'
      + '<ellipse cx="20" cy="20.5" rx="7.6" ry="8.6" fill="#c98e62"/><path d="M11.8 19c-.6-6.4 3.4-10.2 8.2-10.2s8.9 3.6 8.3 10c-1-2.4-2.6-4-4.6-4.4-2.3 1.2-5.4 1.3-7.8.2-2 .6-3.4 2.2-4.1 4.4z" fill="#1f1a1a"/>'
      + '<circle cx="17" cy="21.2" r="2.5" fill="#fff" fill-opacity=".25" stroke="#1f1a1a" stroke-width=".9"/><circle cx="23" cy="21.2" r="2.5" fill="#fff" fill-opacity=".25" stroke="#1f1a1a" stroke-width=".9"/><path d="M19.5 21.2h1" stroke="#1f1a1a" stroke-width=".9"/>'
      + '<circle cx="17" cy="21.3" r="1" fill="#1f1a1a"/><circle cx="23" cy="21.3" r="1" fill="#1f1a1a"/><path d="M17.4 25.3c1.5 1.5 3.7 1.5 5.2 0" fill="none" stroke="#5a2f1a" stroke-width="1.2" stroke-linecap="round"/></g></svg>',
  };
  var host = function (name) { return '<span class="host host-' + name.toLowerCase() + '">' + HOSTS[name] + '</span>'; };

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
    if (page !== 'written') clearInterval(clock);
    current = page;
    if (panel.classList.contains('open') && !busy) drawChat(false);
    window.scrollTo(0, 0);
    if (page === 'notes') return notes();
    if (page === 'written') return written();
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
        b.classList.add('picked');
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
      + '<div class="pod"><div class="player"><div class="meta"><div class="cover">' + svg('podcast') + '</div><div><h3>Surprise Is the Teacher</h3><p>Contingency, blocking and the Rescorla–Wagner model · 30 min</p>'
      + '<div class="hosts">' + host('Maya') + '<b>Maya</b>' + host('Sam') + '<b>Sam</b></div></div></div>'
      + '<div class="wave" id="wave">' + bars + '</div><div class="times"><span id="cur"></span><span>30:00</span></div>'
      + '<div class="controls"><button type="button" class="speed" id="speed">1×</button><button type="button" id="back" aria-label="Back 15 seconds"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>'
      + '<button type="button" class="play" id="play" aria-label="Play"></button>'
      + '<button type="button" id="fwd" aria-label="Forward 15 seconds"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button><span style="width:44px"></span></div></div>'
      + '<div class="transcript" id="tx">' + TRANSCRIPT.map(function (l) { return '<div class="line" data-t="' + l[0] + '">' + host(l[1]) + '<div><div class="who-line"><b class="name-' + l[1].toLowerCase() + '">' + l[1] + '</b><span class="ts">' + l[0] + '</span></div><span>' + l[2] + '</span></div></div>'; }).join('') + '</div></div>';
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

  // Notes: the lecture written up as a long study document, in the order the lecture taught it.
  var call = function (kind, title, body) { return '<div class="callout ' + kind + '"><b>' + title + '</b>' + body + '</div>'; };
  var tbl = function (head, rows) { return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'; };
  var t = function (w) { return '<mark>' + w + '</mark>'; };
  var NOTE_SECTIONS = [
    ['What counts as learning', '<p>Psychologists define ' + t('learning') + ' as a relatively durable change in behavior or knowledge that results from experience. The definition excludes changes caused by maturation, fatigue, injury or drugs, and it separates learning (a change in what an organism <em>can</em> do) from performance (what it actually does on a given occasion).</p>'
      + '<p>The simplest forms are ' + t('non-associative') + ': <b>habituation</b>, a decrease in response to a repeated, harmless stimulus (you stop noticing the refrigerator hum), and <b>sensitization</b>, an increase in response after an intense or aversive stimulus (jumping at small noises after a near-accident). This lecture focuses on ' + t('associative learning') + ', where an organism learns that events go together: two stimuli (classical conditioning) or a behavior and its consequence (operant conditioning).</p>'
      + call('key', 'Key idea', 'Learning is inferred from performance, never observed directly. Tolman\'s latent learning studies (section 9) show why the two must be kept apart.')],
    ['Classical conditioning: Pavlov\'s procedure', '<p>Ivan Pavlov, a physiologist measuring salivation for his Nobel-winning work on digestion (1904), noticed that dogs began to salivate before food reached their mouths: at the sight of the dish, or the footsteps of the assistant. He turned this "psychic secretion" into an experimental method.</p>'
      + '<p>A ' + t('neutral stimulus (NS)') + ', such as a metronome, is presented just before an ' + t('unconditioned stimulus (US)') + ' (meat powder) that reliably produces an ' + t('unconditioned response (UR)') + ' (salivation) without any learning. After repeated pairings, the former NS becomes a ' + t('conditioned stimulus (CS)') + ' that produces a ' + t('conditioned response (CR)') + ' on its own.</p>'
      + tbl(['Term', 'Pavlov\'s study', 'Learned?', 'How to identify it'], [['US', 'Meat powder', 'No', 'Produces the response from the start'], ['UR', 'Salivation to meat', 'No', 'Reflexive response to the US'], ['CS', 'Metronome (after training)', 'Yes', 'Was neutral; now predicts the US'], ['CR', 'Salivation to metronome', 'Yes', 'Response to the CS; often weaker than the UR']])
      + '<p>The timing of the CS relative to the US matters a great deal:</p>'
      + tbl(['Procedure', 'Arrangement', 'Typical strength'], [['Delay', 'CS starts first and overlaps the US', 'Strongest'], ['Trace', 'CS ends before the US; a gap separates them', 'Weaker as the gap grows'], ['Simultaneous', 'CS and US start together', 'Weak'], ['Backward', 'US comes before the CS', 'Weakest; may become inhibitory']])
      + call('tip', 'Exam tip', 'The UR and CR are usually the same <em>kind</em> of response (salivation), so identify them by what triggers them, not by what they look like. Some CRs are even opposite to the UR: drug-compensatory responses help explain tolerance (Siegel, 1984).')],
    ['Acquisition, extinction and recovery', '<p>' + t('Acquisition') + ' is the phase in which the CR is established; it typically follows a negatively accelerated curve, with large gains on early trials and smaller gains later. ' + t('Extinction') + ' occurs when the CS is presented repeatedly without the US and the CR weakens.</p>'
      + '<p>Crucially, extinction does <b>not</b> erase the original association. Four findings show that the CS–US memory survives:</p>'
      + '<ul><li><b>Spontaneous recovery:</b> after a rest interval, the extinguished CR reappears.</li><li><b>Renewal</b> (Bouton & Bolles, 1979): a CR extinguished in context B returns when the CS is tested back in the training context A (the ABA design).</li><li><b>Reinstatement:</b> unsignalled presentations of the US alone bring the CR back.</li><li><b>Rapid reacquisition:</b> re-pairing the CS and US restores the CR faster than original learning.</li></ul>'
      + call('key', 'Key idea', 'Extinction is best understood as <em>new, context-dependent inhibitory learning</em> ("in this context, the CS means no US") layered on top of the original association. This is why exposure therapy for phobias can relapse when the client leaves the clinic.')],
    ['Generalization and discrimination', '<p>' + t('Stimulus generalization') + ' is responding to stimuli similar to the CS; the response declines as similarity decreases, producing a <b>generalization gradient</b>. ' + t('Stimulus discrimination') + ' is learned when one stimulus (CS+) is paired with the US and another (CS−) is not.</p>'
      + '<p>Watson and Rayner\'s (1920) "Little Albert" study paired a white rat with a loud noise in an 11-month-old infant; fear later generalized to a rabbit, a dog and a fur coat. The study is historically important but methodologically weak (one participant, no reliable measurement) and would violate modern ethics standards, since the fear was never extinguished.</p>'
      + call('example', 'Real-world example', 'A student who failed an exam in Room 204 feels uneasy in every lecture hall with the same seating layout (generalization), but not in the library (discrimination).')],
    ['What is actually learned: contingency and prediction error', '<p>For decades conditioning was explained by ' + t('contiguity') + ', the closeness in time of CS and US. Three findings showed this is not enough.</p>'
      + '<p><b>Contingency (Rescorla, 1968).</b> Rescorla held the number of tone–shock pairings constant but varied how often shock occurred <em>without</em> the tone. When p(US | CS) equalled p(US | no CS), the tone produced almost no fear despite many pairings. Animals learn how much a CS changes the probability of the US.</p>'
      + '<p><b>Blocking (Kamin, 1969).</b> If a tone is first trained to predict shock, a light later added to the tone gains little conditioning, even though it is paired with shock just as often. The light is redundant.</p>'
      + '<p><b>The Rescorla–Wagner model (1972)</b> captures both: <span class="eq">ΔV = αβ(λ − ΣV)</span> where V is associative strength, α and β are the salience of the CS and US, λ is the maximum conditioning the US can support, and ΣV is what all CSs present already predict. The term (λ − ΣV) is the ' + t('prediction error') + '. In blocking, ΣV is already close to λ, so the error, and therefore the learning about the light, is near zero.</p>'
      + call('key', 'Brain link', 'Midbrain dopamine neurons fire to unexpected rewards, shift their firing to a cue that predicts reward, and dip below baseline when a predicted reward is omitted: a neural prediction-error signal (Schultz, Dayan & Montague, 1997).')
      + call('tip', 'Exam tip', 'The model also explains the negatively accelerated acquisition curve: as ΣV approaches λ, each trial adds less. It does <em>not</em> explain latent inhibition (slower conditioning to a pre-exposed CS) without extra assumptions.')],
    ['Biological constraints on learning', '<p>Early learning theory assumed ' + t('equipotentiality') + ': any stimulus could be associated with any outcome equally well. Garcia and Koelling (1966) tested this with a 2 × 2 design.</p>'
      + tbl(['Cue during drinking', 'Followed by illness', 'Followed by shock'], [['Taste (saccharin water)', '<b>Strong avoidance</b>', 'Little avoidance'], ['"Bright-noisy" water (light + click)', 'Little avoidance', '<b>Strong avoidance</b>']])
      + '<p>Taste was readily linked to illness, and audiovisual cues to pain, but not the reverse. Taste aversions can also form in a single trial with delays of several hours, far beyond the seconds that other conditioning requires. Seligman (1970) called this ' + t('preparedness') + ': evolution makes some associations easier to learn than others. Humans, likewise, acquire fears of snakes and spiders more readily than of flowers or electrical outlets (Öhman & Mineka, 2001).</p>'
      + '<p>Operant learning has limits too. Breland and Breland (1961), former students of Skinner, found that trained raccoons began rubbing coins together "miserly" instead of depositing them: ' + t('instinctive drift') + ' back toward species-typical food behaviors.</p>'],
    ['Operant conditioning: consequences shape behavior', '<p>Thorndike (1898) placed cats in puzzle boxes and found that escape times fell gradually across trials. His ' + t('law of effect') + ' states that responses followed by satisfying consequences become more likely, and those followed by discomfort less likely. Skinner (1938) systematized this using the operant chamber and the cumulative recorder, measuring response <em>rate</em>.</p>'
      + '<p>"Positive" and "negative" refer to adding or removing a stimulus, not to good or bad. "Reinforcement" always increases behavior; "punishment" always decreases it.</p>'
      + tbl(['', 'Stimulus added', 'Stimulus removed'], [['<b>Behavior increases</b>', 'Positive reinforcement<br><small>Bonus points for attending class</small>', 'Negative reinforcement<br><small>Buckling up stops the seat-belt chime</small>'], ['<b>Behavior decreases</b>', 'Positive punishment<br><small>A speeding ticket</small>', 'Negative punishment<br><small>Losing phone privileges</small>']])
      + '<p>' + t('Primary reinforcers') + ' (food, water, warmth) are biologically effective; ' + t('secondary (conditioned) reinforcers') + ' such as money, grades and praise acquire value through association with primary ones. The ' + t('Premack principle') + ' (1959) adds that a more probable activity can reinforce a less probable one.</p>'
      + call('tip', 'Exam trap', 'Negative reinforcement is <b>not</b> punishment. If the behavior becomes more frequent, it is reinforcement, whatever was added or removed.')],
    ['Schedules of reinforcement', '<p>Under ' + t('continuous reinforcement') + ' every response is reinforced, which produces fast acquisition but fast extinction. Under ' + t('partial (intermittent) reinforcement') + ', only some responses are, which produces slower acquisition but much greater resistance to extinction: the ' + t('partial reinforcement extinction effect') + '.</p>'
      + tbl(['Schedule', 'Rule', 'Response pattern', 'Example'], [['Fixed ratio (FR)', 'After every n responses', 'High rate, post-reinforcement pause', 'Paid per 10 items assembled'], ['Variable ratio (VR)', 'After an average of n responses', 'Highest, steady rate; very resistant to extinction', 'Slot machines'], ['Fixed interval (FI)', 'First response after a fixed time', '"Scallop": slow after reinforcement, faster near the end of the interval', 'Studying before a scheduled exam'], ['Variable interval (VI)', 'First response after a varying time', 'Moderate, steady rate', 'Checking for a text reply']])
      + '<p>When two schedules run at once, Herrnstein\'s (1961) ' + t('matching law') + ' holds that the proportion of responses on each option matches the proportion of reinforcement it provides: B₁/(B₁ + B₂) = R₁/(R₁ + R₂).</p>'],
    ['Shaping, chaining and the limits of punishment', '<p>' + t('Shaping') + ' reinforces successive approximations of a target behavior, such as reinforcing a rat first for facing the lever, then approaching it, then touching it, then pressing it. ' + t('Chaining') + ' links a sequence of behaviors, with each step acting as the cue for the next, and is often trained backward from the final link.</p>'
      + '<p>Punishment can suppress behavior quickly, but it works best when it is immediate, consistent and paired with reinforcement of an alternative behavior. A meta-analysis of 88 studies found corporal punishment associated with immediate compliance, but also with increased aggression and poorer parent–child relationships (Gershoff, 2002). Punishment tells the learner what not to do, not what to do instead.</p>'
      + call('example', 'Applied example', 'Token economies in classrooms and clinics use secondary reinforcers (tokens) exchanged for backup reinforcers, combining shaping and a ratio schedule.')],
    ['Cognition and observation in learning', '<p><b>Latent learning.</b> Tolman and Honzik (1930) let rats explore a maze without food. When food was introduced on day 11, these rats immediately ran the maze as well as rats rewarded from the start. They had formed a ' + t('cognitive map') + ' and learned without reinforcement; the reward changed their performance, not their learning.</p>'
      + '<p><b>Observational learning.</b> In Bandura, Ross and Ross (1961), children who watched an adult model hit a Bobo doll were far more likely to imitate the aggression. Bandura described four processes: <b>attention</b>, <b>retention</b>, <b>reproduction</b> and <b>motivation</b>. Seeing a model rewarded (vicarious reinforcement) increases imitation, but children who saw the model punished could still reproduce the behavior when offered incentives, again separating learning from performance.</p>'
      + '<p><b>Learned helplessness.</b> Dogs exposed to inescapable shock later failed to escape avoidable shock (Seligman & Maier, 1967). What matters is not shock itself but the learned lack of control, a model later linked to depression and revised to emphasize attributions.</p>'],
    ['Summary and common exam traps', '<ul><li>Classical conditioning learns <b>stimulus–stimulus</b> relations; operant conditioning learns <b>response–consequence</b> relations.</li><li>Conditioning depends on <b>contingency and prediction error</b>, not just pairing (Rescorla, 1968; Kamin, 1969; Rescorla–Wagner, 1972).</li><li>Extinction is new inhibitory learning; spontaneous recovery, renewal and reinstatement show the original memory survives.</li><li>"Negative" means removed, not bad. Negative reinforcement increases behavior.</li><li>VR schedules give the highest response rates and most resistance to extinction; FI gives the scallop.</li><li>Biology constrains what is learned easily (Garcia & Koelling, 1966; Breland & Breland, 1961).</li><li>Learning and performance can come apart (Tolman, 1930; Bandura, 1961).</li></ul>'
      + call('tip', 'Before the exam', 'Be able to label US, UR, CS and CR in a new scenario, place any example in the reinforcement/punishment 2 × 2, and explain blocking with the Rescorla–Wagner equation.')],
  ];

  function notes() {
    main.innerHTML = '<article class="doc"><div class="doc-meta">PSYC 101 · Lecture 9 · Generated from your 1 h 12 min lecture · 14 min read</div>'
      + '<h1>Learning and Conditioning</h1><p class="doc-lead">Classical and operant conditioning, what animals and people actually learn when they are conditioned, the biological limits on learning, and the role of cognition and observation.</p>'
      + '<div class="toc">' + NOTE_SECTIONS.map(function (s, i) { return '<a href="#n' + (i + 1) + '">' + (i + 1) + '. ' + s[0] + '</a>'; }).join('') + '</div>'
      + NOTE_SECTIONS.map(function (s, i) { return '<section id="n' + (i + 1) + '"><h2><span class="num">' + (i + 1) + '</span>' + s[0] + '</h2>' + s[1] + '</section>'; }).join('')
      + '</article>';
    Array.prototype.forEach.call(main.querySelectorAll('.toc a'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); var el = document.querySelector(a.getAttribute('href')); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' }); });
    });
  }

  // Written test: short answers graded against the lecture's rubric. This demo checks each rubric point by
  // looking for its key ideas in the answer, then shows the model answer.
  var WQ = [
    { n: 3, q: 'Explain why the Rescorla–Wagner model predicts blocking. Refer to prediction error in your answer.', pts: [
      [/already predict|fully predict|predicts? the (us|shock|outcome|food)|first (cs|stimulus|tone).{0,40}predict/, 'Says the first CS already predicts the US'],
      [/prediction error|surpris|λ|lambda|σv|sum(med)? (of )?v|difference between/, 'Names prediction error (λ − ΣV)'],
      [/(zero|no|little|small|nothing|tiny).{0,30}(error|surprise|left to learn)|error.{0,25}(zero|small|none|near)/, 'Says the error on compound trials is near zero'],
      [/(new|added|second|light|other|redundant).{0,60}(little|no |barely|doesn|does not|weak|redundant|nothing)/, 'Says the added CS gains little associative strength']],
      model: 'In phase 1 the tone is paired with shock until its associative strength approaches λ. On the compound (tone + light) trials, ΣV already equals the tone\'s strength, so the prediction error (λ − ΣV) is close to zero. Because ΔV for every CS present is proportional to that error, the light gains almost no associative strength, so it is "blocked."' },
    { n: 4, q: 'Distinguish negative reinforcement from punishment, and give one original example of each.', pts: [
      [/(remov|take away|taking away|stop|end|escape|avoid).{0,50}(unpleasant|aversive|bad|annoying|pain|noise|headache)/, 'Negative reinforcement removes an aversive stimulus'],
      [/reinforce\w*.{0,70}(increase|strengthen|more likely|repeat)|(increase|strengthen|more likely).{0,70}reinforce/, 'Reinforcement increases the behavior'],
      [/punish\w*.{0,70}(decrease|weaken|less likely|reduce|suppress)|(decrease|weaken|less likely|reduce).{0,70}punish/, 'Punishment decreases the behavior'],
      [/for example|e\.g\.|for instance|such as|an example/, 'Gives an original example of each']],
      model: 'Both involve aversive stimuli, but they have opposite effects. Negative reinforcement increases a behavior by removing an aversive stimulus: a driver buckles up because it stops the seat-belt chime. Punishment decreases a behavior, either by adding something aversive (positive punishment: a fine for parking illegally) or removing something pleasant (negative punishment: losing phone privileges for missing curfew).' },
    { n: 5, q: 'Garcia and Koelling (1966) challenged the equipotentiality assumption. Describe their design and what it showed.', pts: [
      [/taste|flavou?r|saccharin|sweet/, 'Describes the taste cue'],
      [/bright|noisy|audiovisual|light|click/, 'Describes the audiovisual cue'],
      [/(ill|sick|nause|radiation|x-ray|lithium)[\s\S]*shock|shock[\s\S]*(ill|sick|nause|radiation|x-ray|lithium)/, 'Describes the two consequences: illness and shock'],
      [/prepar|equipotential|not (all|every)|biolog|evolution|innate/, 'Concludes some associations are biologically prepared']],
      model: 'Rats drank "bright-noisy-tasty" water: a saccharin flavor plus a light and click. Half were then made ill (X-ray radiation); half received shock. Rats made ill later avoided the taste but not the audiovisual cue; shocked rats avoided the audiovisual cue but not the taste. Since cues and outcomes were not interchangeable, equipotentiality is false: animals are biologically prepared to link taste with illness and external cues with pain.' },
    { n: 6, q: 'Why do psychologists say extinction does not erase the original learning? Support your answer with two pieces of evidence.', pts: [
      [/spontaneous recovery|recover/, 'Spontaneous recovery'],
      [/renewal|context|aba/, 'Renewal after a change of context'],
      [/reinstat|reacquisition|savings/, 'Reinstatement or rapid reacquisition'],
      [/(new|inhibitory|second|competing) (learning|association|memory)|inhibit|suppress/, 'Says extinction is new inhibitory learning']],
      model: 'Extinction is new, context-specific inhibitory learning laid over the original CS–US association. Evidence: the CR returns after a rest (spontaneous recovery), returns when the CS is tested outside the extinction context (renewal; Bouton & Bolles, 1979), returns after unsignalled US presentations (reinstatement), and is reacquired faster than it was first learned.' },
  ];
  var wIx = 0;
  var wAns = {};
  var secsLeft = 32 * 60 + 14;
  var clock = null;
  function written() {
    var it = WQ[wIx];
    var dots = '';
    for (var i = 1; i <= 10; i++) dots += '<i class="' + (i < 3 ? 'done' : i === it.n ? 'cur' : i < it.n ? 'done' : '') + '">' + i + '</i>';
    main.innerHTML = '<div class="row"><div><h2>Written test</h2><p class="sub">Answer in your own words. Each answer is graded against the rubric from your lecture, and you see what you missed.</p></div>'
      + '<span class="timer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg><b id="clock"></b> left</span></div>'
      + '<div class="row" style="max-width:780px;margin:6px auto 0"><span class="sub" style="margin:0">Question <b style="color:var(--ink)">' + it.n + '</b> / 10</span><div class="qdots">' + dots + '</div></div>'
      + '<div class="q"><div class="q-eyebrow">Short answer · 4 points</div><h3>' + it.q + '</h3>'
      + '<label class="sr" for="ans">Your answer</label><textarea id="ans" rows="8" placeholder="Type your answer…">' + (wAns[wIx] || '').replace(/</g, '&lt;') + '</textarea>'
      + '<div class="row" style="margin-top:12px"><span class="sub" style="margin:0" id="wc"></span><div style="display:flex;gap:10px"><button class="btn ghost" type="button" id="wskip">Skip</button><button class="btn" type="button" id="wsubmit">Submit answer</button></div></div>'
      + '<div id="grade"></div></div>';
    var ta = $('#ans');
    var count = function () { var n = (ta.value.trim().match(/\S+/g) || []).length; $('#wc').textContent = n + (n === 1 ? ' word' : ' words'); wAns[wIx] = ta.value; };
    ta.addEventListener('input', count);
    count();
    var next = function () { wIx = (wIx + 1) % WQ.length; written(); };
    $('#wskip').addEventListener('click', next);
    $('#wsubmit').addEventListener('click', function () {
      if (!ta.value.trim()) { ta.focus(); ta.classList.add('nudge'); setTimeout(function () { ta.classList.remove('nudge'); }, 500); return; }
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Grading…';
      setTimeout(function () {
        var text = ta.value.toLowerCase();
        var hits = it.pts.map(function (p) { return p[0].test(text); });
        var score = hits.filter(Boolean).length;
        $('#grade').innerHTML = '<div class="grade"><div class="score s' + score + '"><b>' + score + '</b><span>/ 4</span></div><div class="grade-body"><h4>' + (score === 4 ? 'Excellent answer' : score >= 2 ? 'Good start: a few points missing' : 'Let\'s build this answer up') + '</h4>'
          + '<ul class="rubric">' + it.pts.map(function (p, i) { return '<li class="' + (hits[i] ? 'hit' : 'miss') + '">' + p[1] + '</li>'; }).join('') + '</ul></div></div>'
          + '<div class="model"><b>Model answer</b>' + it.model + '</div><div class="row" style="margin-top:14px"><span></span><button class="btn" type="button" id="wnext">Next question →</button></div>';
        btn.style.display = 'none';
        $('#wskip').style.display = 'none';
        $('#wnext').addEventListener('click', next);
      }, 1200);
    });
    var tick = function () { if ($('#clock')) $('#clock').textContent = fmt(secsLeft); };
    clearInterval(clock);
    clock = setInterval(function () { secsLeft = Math.max(0, secsLeft - 1); tick(); }, 1000);
    tick();
  }

  // Ask AI: a chat beside the study set. It sends what is on the screen right now (headings, the paragraphs in
  // view, the question and the learner's answer) to the same tutor as the app's dock, so it answers about this page.
  var current = 'flashcards';
  var chat = [];
  var CHIPS = {
    notes: ['Explain what\'s on my screen more simply', 'Quiz me on this section', 'Give me a real-world example'],
    written: ['How should I structure this answer?', 'Which key terms should I use?', 'Check my answer so far'],
    flashcards: ['Explain this card another way', 'Give me a way to remember this'],
    quiz: ['Why is that the answer?', 'Explain why the other options are wrong'],
    podcast: ['Summarize what they just said', 'Help me answer Sam\'s question'],
  };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var md = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,!?]|$)/g, '$1<i>$2</i>').replace(/^#+\s*/gm, '').replace(/\n/g, '<br>'); };

  function screen() {
    var vh = window.innerHeight;
    var seen = function (el) { var r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > 70 && r.top < vh; };
    var txt = function (el) { return el.innerText.replace(/\s+/g, ' ').trim(); };
    var all = function (sel) { return Array.prototype.filter.call(main.querySelectorAll(sel), seen); };
    var headings = all('h1, h2, h3').map(txt);
    var blocks = [];
    var flash = main.querySelector('.flash');
    if (flash) {
      var faces = flash.querySelectorAll('.face');
      blocks.push('Flashcard front: ' + txt(faces[0]).replace(/^Term\s*/, ''));
      if (flash.classList.contains('flipped')) blocks.push('Flashcard back (showing): ' + txt(faces[1]).replace(/^Definition\s*/, ''));
    }
    all('p, li, tr, .callout, .line.now, .q-eyebrow').forEach(function (el) { var s = txt(el); if (s && blocks.indexOf(s) < 0) blocks.push(s); });
    var choices = all('.choice').map(function (c) { return { text: txt(c).replace(/^[A-D]\s*/, ''), selected: c.classList.contains('picked') }; });
    var ans = main.querySelector('#ans');
    var inputs = ans ? [{ label: 'Their written answer', value: ans.value }] : [];
    var feedback = all('.explain.show, .grade, .model').map(txt);
    var doc = document.documentElement;
    var percent = doc.scrollHeight > vh ? Math.round(window.scrollY / (doc.scrollHeight - vh) * 100) : 0;
    var page = PAGES.filter(function (p) { return p[0] === current; })[0][1];
    return {
      path: '/study-demo',
      title: page + ' · PSYC 101 Lecture 9: Learning and Conditioning',
      heading: headings[0] || page,
      text: blocks.join('\n').slice(0, 1500),
      snapshot: { v: 1, headings: headings.slice(0, 4), blocks: blocks.slice(0, 8), choices: choices, inputs: inputs, feedback: feedback.slice(0, 3), visuals: [], scroll: { percent: percent } },
    };
  }

  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ask-fab';
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7z"/></svg>Ask AI';
  var panel = document.createElement('aside');
  panel.className = 'ask-panel';
  panel.setAttribute('aria-label', 'Ask AI');
  panel.innerHTML = '<div class="ask-head"><div class="ask-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6z"/></svg></div><div><b>Ask AI</b><span>Sees what\'s on your screen</span></div><button type="button" class="ask-x" aria-label="Close">×</button></div>'
    + '<div class="ask-log" id="asklog"></div><form class="ask-form" id="askform"><input id="askin" autocomplete="off" placeholder="Ask about what\'s on screen…" aria-label="Ask AI"><button type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>';
  document.body.appendChild(fab);
  document.body.appendChild(panel);
  var log = panel.querySelector('#asklog');
  function drawChat(busy) {
    var chips = CHIPS[current] || ['What is on this page?'];
    log.innerHTML = (chat.length ? '' : '<div class="ask-hello"><b>Hi! I can see your ' + PAGES.filter(function (p) { return p[0] === current; })[0][1].toLowerCase() + '.</b> Ask me anything about what\'s on your screen.</div>')
      + chat.map(function (m) { return '<div class="msg ' + (m.role === 'user' ? 'me' : 'ai') + '">' + (m.role === 'user' ? esc(m.content) : md(m.content)) + '</div>'; }).join('')
      + (busy ? '<div class="msg ai typing"><i></i><i></i><i></i></div>' : '')
      + (busy ? '' : '<div class="ask-chips">' + chips.map(function (c) { return '<button type="button">' + esc(c) + '</button>'; }).join('') + '</div>');
    // A new answer is shown from its first line; anything else scrolls to the bottom.
    var last = log.querySelectorAll('.msg');
    last = last[last.length - 1];
    log.scrollTop = last && last.classList.contains('ai') && !busy ? last.offsetTop - 12 : log.scrollHeight;
  }
  var busy = false;
  function ask(text) {
    if (busy || !text.trim()) return;
    busy = true;
    chat.push({ role: 'user', content: text.trim() });
    drawChat(true);
    fetch('/api/tutor/dock', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: chat.slice(-10), page: screen(), input_mode: 'text' }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        var reply = res.ok && res.j.reply ? res.j.reply : res.status === 401 ? 'Sign in to Savant in this browser first, then ask again.' : (res.j && res.j.error) || 'I could not answer just now. Try again in a moment.';
        chat.push({ role: 'assistant', content: reply });
      })
      .catch(function () { chat.push({ role: 'assistant', content: 'I could not reach Savant. Check your connection and try again.' }); })
      .then(function () { busy = false; drawChat(false); });
  }
  fab.addEventListener('click', function () { var open = !panel.classList.contains('open'); panel.classList.toggle('open', open); fab.classList.toggle('hide', open); if (open) { drawChat(busy); panel.querySelector('#askin').focus(); } });
  panel.querySelector('.ask-x').addEventListener('click', function () { panel.classList.remove('open'); fab.classList.remove('hide'); });
  panel.querySelector('#askform').addEventListener('submit', function (e) { e.preventDefault(); var i = panel.querySelector('#askin'); var v = i.value; i.value = ''; ask(v); });
  log.addEventListener('click', function (e) { var b = e.target.closest('.ask-chips button'); if (b) ask(b.textContent); });

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
      if (i === steps.length) { setTimeout(function () { $('#upload').style.display = 'none'; $('#set').classList.add('show'); document.body.classList.add('in-set'); show('flashcards'); window.scrollTo(0, 0); }, 500); return; }
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
