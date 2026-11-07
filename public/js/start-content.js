/* The words and pictures of the new onboarding. No logic beyond small lookups, so copy can be changed without touching the flow.
 *
 * Step 6's examples are written ahead of time, here, so the screen is instant and nothing a learner says goes to any outside service.
 * **double stars** mark what the marker highlights. They are made-up scenarios, not claims about the world; scripts/onboarding-v2-test.js
 * checks every interest has every idea, and that the fraction examples really are 3 of 4.
 */
(function () {
  const line = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  const ICONS = {
    math: line('<path d="M6 8h6M9 5v6M15 7l4 4M19 7l-4 4M5 17h7M15 16h4M15 19h4"/>'),
    english: line('<path d="M3 18 8 6l5 12M4.800 14h6.400"/><path d="M20.500 11v7M20.500 14.500a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>'),
    reading: line('<path d="M12 6.500C10 5 7 4.500 3.500 5v13c3.500-.5 6.500 0 8.500 1.500 2-1.500 5-2 8.500-1.500V5C17 4.500 14 5 12 6.500ZM12 6.500v13"/>'),
    iq: line('<path d="M9 18h6M10 21h4M12 3a6.500 6.500 0 0 0-4 11.600c.8.700 1 1.400 1 2.400h6c0-1 .2-1.700 1-2.400A6.500 6.500 0 0 0 12 3Z"/>'),
    act: line('<path d="m4 20 1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19l-4 1ZM14.500 6.500l3 3"/>'),
    spanish: line('<path d="M4 5.500h16v11H10l-4.500 3.500v-3.500H4v-11Z"/><path d="M12 8.500v.01M12 10.800v3"/>'),
    chess: line('<path d="M9.500 9.500a3 3 0 1 1 5 0M9 10h6M10 10c0 3-1 5.500-2.500 7.500h9C15 15.500 14 13 14 10M6.500 20.500h11"/>'),
    piano: line('<rect x="3.500" y="5" width="17" height="14" rx="2"/><path d="M9 5v14M15 5v14M7 5v8M11 5v8M13 5v8M17 5v8" /><path d="M7 13h0M11 13h0"/>'),
    basketball: line('<circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500v17M6 6c2.500 2 2.500 10 0 12M18 6c-2.500 2-2.500 10 0 12"/>'),
    notes: line('<path d="M7 3.500h7l4.500 4.500v12.500H7a1.500 1.500 0 0 1-1.500-1.500V5A1.500 1.500 0 0 1 7 3.500Z"/><path d="M14 3.500V8h4.500M9 12.500h6M9 16h6"/>'),
    test: line('<rect x="4" y="5" width="16" height="15.500" rx="2"/><path d="M4 9.500h16M8.500 3v4M15.500 3v4M8.500 15l2.500 2.500 4.500-4.500"/>'),
    school: line('<path d="M12 5 2.500 9.500 12 14l9.500-4.500L12 5Z"/><path d="M6.500 11.500V16c1.500 1.500 3.500 2.200 5.500 2.200s4-.7 5.500-2.200v-4.500M21.500 9.500V15"/>'),
    work: line('<rect x="3.500" y="8" width="17" height="11.500" rx="2"/><path d="M9 8V6a1.500 1.500 0 0 1 1.500-1.500h3A1.500 1.500 0 0 1 15 6v2M3.500 13h17"/>'),
    curious: line('<path d="M9 9.200a3 3 0 1 1 4.500 2.600c-1 .6-1.500 1.200-1.500 2.400"/><path d="M12 17.500v.01"/><circle cx="12" cy="12" r="9"/>'),
    love: line('<path d="M12 20s-7.500-4.500-8.800-9.200C2.300 7.200 5 4.500 8 4.800c1.800.2 3.200 1.200 4 2.700.8-1.500 2.200-2.500 4-2.700 3-.3 5.700 2.400 4.800 6C19.500 15.500 12 20 12 20Z"/>'),
    soccer: line('<circle cx="12" cy="12" r="8.500"/><path d="m12 8 3.800 2.800-1.400 4.500H9.600l-1.400-4.500L12 8ZM12 8V3.500M15.800 10.800l4.300-1.400M14.400 15.300l2.700 3.600M9.600 15.300l-2.700 3.600M8.200 10.800 3.900 9.400"/>'),
    music: line('<path d="M9 18V6l10.500-2v12"/><circle cx="6.500" cy="18" r="2.500"/><circle cx="17" cy="16" r="2.500"/>'),
    gaming: line('<path d="M7 8h10a4.500 4.500 0 0 1 4.300 3.200l.9 3.300a2.700 2.700 0 0 1-4.600 2.500L15.500 15h-7L6.400 17a2.700 2.700 0 0 1-4.600-2.500l.9-3.300A4.500 4.500 0 0 1 7 8Z"/><path d="M8 10.200v2.800M6.600 11.600h2.800M15.500 11h.01M17.500 12.500h.01"/>'),
    cooking: line('<path d="M5 10.500h14v6.500a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6.500ZM3 10.500h18M9 7c0-1.500 1-1.500 1-3M14 7c0-1.500 1-1.500 1-3"/>'),
    art: line('<path d="M14.500 4 20 9.500 11 18.500l-5.500-5.500L14.500 4Z"/><path d="M5.500 13c-2 1-2.500 3-2.500 7 4 0 6-.5 7-2.500"/>'),
    animals: line('<circle cx="6" cy="11" r="1.900"/><circle cx="10" cy="6.800" r="1.900"/><circle cx="14.500" cy="6.800" r="1.900"/><circle cx="18.500" cy="11" r="1.900"/><path d="M12.200 11.500c-2.500 0-5 3-5 5.500 0 1.700 1.200 2.800 2.800 2.800.9 0 1.500-.4 2.200-.4s1.300.4 2.200.4c1.600 0 2.800-1.100 2.800-2.800 0-2.500-2.500-5.500-5-5.500Z"/>'),
    space: line('<path d="M12 3c3 2 4.500 5.500 4.500 9 0 1.800-.4 3.500-1 5h-7c-.6-1.500-1-3.200-1-5 0-3.500 1.500-7 4.500-9Z"/><circle cx="12" cy="10" r="1.700"/><path d="M8 13.500 5 16.500v3l3-1.500M16 13.500l3 3v3L16 18M10.500 20h3"/>'),
    movies: line('<rect x="3.500" y="9.500" width="17" height="10.500" rx="1.500"/><path d="m3.500 9.500-.8-3.200 16.500-3.800.8 3.200L3.500 9.500ZM7.500 5.500l2 3M12.500 4.300l2 3"/>'),
    cars: line('<path d="M4 15.500v-3l2-5.200A2 2 0 0 1 7.900 6h8.200a2 2 0 0 1 1.900 1.300l2 5.200v3a1.500 1.500 0 0 1-1.500 1.500h-13A1.500 1.500 0 0 1 4 15.500ZM4.500 12h15"/><circle cx="7.500" cy="17" r="1.800"/><circle cx="16.500" cy="17" r="1.800"/>'),
    fashion: line('<path d="M12 8a2.200 2.200 0 1 0-2.200-2.200M12 8v1.500l8.500 6.200c1 .7.500 2.300-.8 2.300H4.300c-1.300 0-1.800-1.600-.8-2.300L12 9.500"/>'),
    coding: line('<path d="m8.500 7.500-5 4.500 5 4.500M15.500 7.500l5 4.500-5 4.500M13.500 5l-3 14"/>'),
    other: line('<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'),
    calendar: line('<rect x="4" y="5" width="16" height="15.500" rx="2"/><path d="M4 9.500h16M8.500 3v4M15.500 3v4"/>'),
    back: line('<path d="M15 5l-7 7 7 7"/>'),
    eye: line('<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12Z"/><circle cx="12" cy="12" r="2.800"/>'),
    arrow: line('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  };

  /** Short subject lines. A subject with none falls back to the catalogue's first sentence. */
  const TRACK_LINES = {
    math: 'From counting to calculus and beyond',
    english: 'Grammar, writing and how language works',
    reading: 'From first words to close reading',
    iq: 'Patterns, logic and working memory',
    act: 'Section by section, against the clock',
    spanish: 'From first greetings to the subjunctive',
    chess: 'From the first move to real plans',
    piano: 'From the first keys to full pieces',
    basketball: 'From the first bounce to reading a defense',
  };

  const TRACK_REPLY = {
    math: '**Math.** It all builds on itself, so finding where you are really matters.',
    english: '**English.** Good one. It helps with everything else you read and write.',
    reading: '**Reading.** Nice. Every other subject gets easier with this one.',
    iq: '**IQ training.** Patterns and puzzles. Fun ones, I promise.',
    act: '**The ACT.** Got it. We\'ll work out what to focus on first.',
    spanish: '**¡Español!** Great pick.',
    chess: '**Chess.** I like it. There\'s always a better move to find.',
    piano: '**Piano.** Lovely. Hands ready.',
    basketball: '**Basketball.** Let\'s get on the court.',
    notes: '**Your own notes.** Good. I can build lessons from them once you\'ve saved your progress.',
  };

  const WHY = [
    { id: 'test', icon: 'test', title: 'A test or exam', reply: 'A test. Then **every review counts toward that day.**' },
    { id: 'school', icon: 'school', title: 'School or a class', reply: 'School. I can **work alongside your class.**' },
    { id: 'work', icon: 'work', title: 'My job or career', reply: 'For work. **Useful skills,** then.' },
    { id: 'curious', icon: 'curious', title: 'I\'m just curious', reply: 'Curious is **my favorite kind of learner.**' },
    { id: 'love', icon: 'love', title: 'Something I love', reply: 'The **best reason there is.**' },
  ];

  /** The retention goal's choices (services/retention-goal.js): the words say what the choice really does. `len` draws the small ruler. */
  const HORIZONS = [
    { id: 'date', title: 'Until a test date', sub: 'Pick the day', len: 0, reply: 'Your reviews get **packed in before that date,** right up to the day itself.' },
    { id: 'months', title: 'A few months', sub: 'About 90 days', len: 20, reply: 'A few months. I\'ll **skip the reviews you\'d only need after that.**' },
    { id: 'year', title: 'A year', sub: '365 days', len: 45, reply: 'A year. Your reviews **spread out to fit it.**' },
    { id: 'years', title: 'Years', sub: 'About 3 years', len: 75, reply: 'Years. Reviews **keep coming back, further apart.**' },
    { id: 'forever', title: 'For good', sub: 'The full review calendar', len: 100, reply: 'For good. You get **the full long-term review calendar.**' },
  ];

  const INTERESTS = [
    { id: 'soccer', icon: 'soccer', title: 'Soccer', reply: 'Soccer! **Penalty kicks,** coming up.' },
    { id: 'basketball', icon: 'basketball', title: 'Basketball', reply: 'Basketball. **Free throws,** then.' },
    { id: 'music', icon: 'music', title: 'Music', reply: 'Music. I can **work with a beat.**' },
    { id: 'gaming', icon: 'gaming', title: 'Video games', reply: 'Games. **Extra lives** it is.' },
    { id: 'cooking', icon: 'cooking', title: 'Cooking', reply: 'Cooking. **Hope you\'re hungry.**' },
    { id: 'art', icon: 'art', title: 'Drawing and art', reply: 'Art. **Grab a brush.**' },
    { id: 'animals', icon: 'animals', title: 'Animals', reply: 'Animals. **Good choice.**' },
    { id: 'space', icon: 'space', title: 'Space', reply: 'Space. **Fueling up.**' },
    { id: 'movies', icon: 'movies', title: 'Movies and TV', reply: 'Movies. **Popcorn ready.**' },
    { id: 'cars', icon: 'cars', title: 'Cars', reply: 'Cars. **Let\'s get into the garage.**' },
    { id: 'fashion', icon: 'fashion', title: 'Fashion', reply: 'Fashion. **Great taste.**' },
    { id: 'coding', icon: 'coding', title: 'Coding', reply: 'Coding. **Tests first, then.**' },
  ];

  /** Which idea a subject's sample uses. */
  const IDEA_OF = { math: 'fractions', act: 'fractions', iq: 'fractions', english: 'mainidea', reading: 'mainidea', spanish: 'endings', chess: 'practice', piano: 'practice', basketball: 'practice' };

  const IDEAS = {
    fractions: {
      topic: 'What 3/4 means',
      plain: '3/4 means 3 out of 4 equal parts.',
      viz: 'tokens',
      examples: {
        soccer: 'Your team takes **4 penalty kicks** and scores **3**. Three out of four is **3/4**.',
        basketball: 'You shoot **4 free throws** and make **3**. That\'s **3/4** of your shots.',
        music: 'A bar of music has **4 beats**. Clap on **3** of them. You clapped **3/4** of the bar.',
        gaming: 'You start a level with **4 hearts** and finish with **3**. You kept **3/4** of your hearts.',
        cooking: 'A recipe needs **4 eggs** and you\'ve cracked **3**. That\'s **3/4** of the eggs done.',
        art: 'You split a canvas into **4 equal squares** and paint **3**. **3/4** of it is painted.',
        animals: 'A dog has **4 paws** and **3** are muddy. **3/4** of its paws need a wash.',
        space: 'A rocket has **4 equal fuel tanks** and **3** are full. **3/4** of the tanks are ready.',
        movies: 'A series has **4 films** and you\'ve seen **3**. You\'ve watched **3/4** of them.',
        cars: 'A car has **4 tires** and you\'ve changed **3**. **3/4** of the tires are new.',
        fashion: 'You lay out **4 outfits** and **3** have sneakers. **3/4** of your outfits do.',
        coding: 'You run **4 tests** and **3** pass. **3/4** of your tests pass.',
      },
    },
    mainidea: {
      topic: 'What a main idea is',
      plain: 'The main idea is the one point everything else in a passage backs up.',
      viz: null,
      examples: {
        soccer: 'A match report says the keeper made six saves and the defense blocked every cross. Those details back up one point: **the defense won this game.**',
        basketball: 'A recap says the bench scored 40 points and the starters got to rest. Those details back up one point: **the bench won this game.**',
        music: 'A review says the chorus sticks in your head and the beat never lets up. Those details back up one point: **this song is catchy.**',
        gaming: 'A review says the menus are confusing and saves get lost. Those details back up one point: **this game is frustrating to use.**',
        cooking: 'A recipe note says to use cold butter and not to overmix. Those details back up one point: **handle this dough gently.**',
        art: 'A guide says to draw light lines first and darken them later. Those details back up one point: **start loose, finish firm.**',
        animals: 'A guide says puppies need short walks, soft food and lots of naps. Those details back up one point: **puppies need gentle care.**',
        space: 'A mission plan lists spare parts, backup radios and extra fuel. Those details back up one point: **this crew is planning for trouble.**',
        movies: 'A review says the plot drags and the ending is rushed. Those details back up one point: **the pacing is off.**',
        cars: 'A manual says to check the oil, tires and brakes before a long trip. Those details back up one point: **get the car checked before you go.**',
        fashion: 'A style guide says to pick one bold piece and keep the rest simple. Those details back up one point: **let one thing stand out.**',
        coding: 'A code review says the names are clear and every function is short. Those details back up one point: **this code is easy to read.**',
      },
    },
    endings: {
      topic: 'Verb endings in Spanish',
      plain: 'A Spanish verb\'s ending tells you who is doing it. Hablo is I speak. Hablas is you speak.',
      viz: null,
      examples: {
        soccer: '**Paso** el balón: I pass the ball. **Pasas** el balón: you pass the ball. The ending tells you who.',
        basketball: '**Encesto**: I score a basket. **Encestas**: you score a basket. The ending tells you who.',
        music: '**Canto** una canción: I sing a song. **Cantas** una canción: you sing a song. The ending tells you who.',
        gaming: '**Gano** la partida: I win the game. **Ganas** la partida: you win the game. The ending tells you who.',
        cooking: '**Cocino** la cena: I cook dinner. **Cocinas** la cena: you cook dinner. The ending tells you who.',
        art: '**Dibujo** un gato: I draw a cat. **Dibujas** un gato: you draw a cat. The ending tells you who.',
        animals: '**Cuido** al perro: I look after the dog. **Cuidas** al perro: you look after the dog. The ending tells you who.',
        space: '**Miro** las estrellas: I look at the stars. **Miras** las estrellas: you look at the stars. The ending tells you who.',
        movies: '**Grabo** una película: I film a movie. **Grabas** una película: you film a movie. The ending tells you who.',
        cars: '**Manejo** el coche: I drive the car. **Manejas** el coche: you drive the car. The ending tells you who.',
        fashion: '**Diseño** un vestido: I design a dress. **Diseñas** un vestido: you design a dress. The ending tells you who.',
        coding: '**Programo** un juego: I code a game. **Programas** un juego: you code a game. The ending tells you who.',
      },
    },
    practice: {
      topic: 'Practising the hard part',
      plain: 'When one part keeps going wrong, practise just that part slowly, then put it back into the whole.',
      viz: null,
      examples: {
        soccer: 'Your penalties keep going wide. Don\'t play a whole match: **take ten slow kicks at one corner,** then try it at full speed.',
        basketball: 'Your free throws keep hitting the rim. Don\'t scrimmage: **shoot ten slowly from the line,** then try them tired.',
        music: 'One bar keeps tripping you up. Don\'t restart the song: **loop that bar slowly,** then play it in the song.',
        gaming: 'One boss keeps beating you. Don\'t replay the level: **practise that one attack pattern,** then take on the whole fight.',
        cooking: 'Your sauce keeps splitting. Don\'t cook the whole meal: **make just the sauce, slowly,** then bring it back to the plate.',
        art: 'Hands keep looking wrong in your drawings. Don\'t redo the portrait: **sketch ten slow hands,** then put one back in.',
        animals: 'Your dog runs off when you call. Don\'t go to the park yet: **practise the call at home,** then try it outside.',
        space: 'A model rocket keeps tipping over. Don\'t rebuild it all: **test just the fins,** then launch the whole thing.',
        movies: 'One scene in your short film isn\'t working. Don\'t reshoot it all: **redo that one shot slowly,** then cut it back in.',
        cars: 'You keep stalling on hills. Don\'t drive across town: **practise hill starts on one quiet street,** then get back on the road.',
        fashion: 'Your zippers keep coming out crooked. Don\'t sew a whole dress: **sew ten zippers on scraps,** then do it for real.',
        coding: 'One function keeps breaking. Don\'t rewrite the app: **test that one function alone,** then run it all together.',
      },
    },
  };

  function ideaFor(trackId) { return IDEAS[IDEA_OF[trackId]] || IDEAS.fractions; }

  window.ObContent = { ICONS, TRACK_LINES, TRACK_REPLY, WHY, HORIZONS, INTERESTS, IDEAS, IDEA_OF, ideaFor };
}());
