/* The words and pictures of the new onboarding. No logic, so copy can be changed without touching the flow. **double stars** mark what stands out in a line. */
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
    tap: line('<path d="M9 11V5.500a2 2 0 0 1 4 0V11l5.200 1.300a2 2 0 0 1 1.500 2.200l-.7 5H10l-4.500-5a1.800 1.800 0 0 1 2.600-2.400L9 13"/>'),
    memory: line('<path d="M6 8.500h2.500V16M6 16h5M14 9.500a2.300 2.300 0 0 1 4.500.5c0 2-4.500 3.500-4.500 6h5"/>'),
    spot: line('<circle cx="10.500" cy="10.500" r="6.500"/><path d="m15.500 15.500 5 5"/>'),
    chat: line('<path d="M4 5.500h16v11H10l-4.500 3.500v-3.500H4v-11Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>'),
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

  /** The agreement screen. Version with services/onboarding-v2.js AGREEMENT_VERSION: a change to these words needs a new version. */
  const AGREEMENT = {
    version: '2026-11-07.1',
    items: [
      { icon: 'test', title: 'The beta terms', text: 'Savant is a beta for approved testers. Things may change or break. Lessons are fact checked, but fact checked doesn\'t mean always right, so don\'t rely on it alone for anything that matters.' },
      { icon: 'eye', title: 'Your privacy', text: 'We keep your answers and progress to teach you. We never sell your data, and you can export it any time.', link: { href: '/privacy', label: 'Privacy policy' } },
      { icon: 'chat', title: 'Outside AI services', text: 'To write lessons around you, what you tell me, your answers and your interests go to outside AI companies.', link: { href: '/privacy#vendors', label: 'See which companies' } },
    ],
  };

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

  window.ObContent = { AGREEMENT, ICONS, TRACK_LINES, TRACK_REPLY, INTERESTS };
}());
