// The six Quick Games. Answers ship to the browser on purpose: a 3-minute
// speed game checks every tap locally, the way Duolingo's timed challenges do.

const CSV = (game, level, unit, what) => ({
  grade: 1, level, unit, type: 'Game', activity: 'Quick Game', skillFocus: 'Recall (game)', minutes: 3,
  node: `Quick Game: ${game}`, whatHappens: what,
});

module.exports = [
  {
    id: 'game-listen-tap', engine: 'quick_game', game: 'listen_tap', clientAnswers: true,
    title: 'Quick Game: Listen and Tap', cefr: 'Pre-A1', seconds: 180,
    csv: CSV('Listen and Tap', 17, 'Unit 1.2', 'Tap the picture or phrase you hear as fast as you can on the first two topics of this unit plus a few due review items. 3 minutes, scored on speed and accuracy; misses go back into spaced review.'),
    duolingo: { has: 'partial', equivalent: 'Timed challenges ("Rapid review")', notes: 'Rounds of hear-and-tap against the clock, combo multiplier, misses listed for review.' },
    items: [
      { es: 'el agua', choices: ['agua', 'cafe', 'pan', 'leche'] },
      { es: 'el café', choices: ['cafe', 'agua', 'manzana', 'libro'] },
      { es: 'el pan', choices: ['pan', 'casa', 'gato', 'cafe'] },
      { es: 'la casa', choices: ['casa', 'hotel', 'tren', 'pan'] },
      { es: 'el gato', choices: ['gato', 'perro', 'libro', 'sol'] },
      { es: 'el perro', choices: ['perro', 'gato', 'tren', 'agua'] },
      { es: 'el libro', choices: ['libro', 'mesa', 'telefono', 'casa'] },
      { es: 'la manzana', choices: ['manzana', 'pan', 'cafe', 'sol'] },
      { es: 'el tren', choices: ['tren', 'hotel', 'perro', 'musica'] },
      { es: 'el sol', choices: ['sol', 'luna', 'casa', 'agua'] },
      { es: 'la leche', choices: ['leche', 'agua', 'cafe', 'pan'] },
      { es: 'el teléfono', choices: ['telefono', 'libro', 'tren', 'mesa'] },
    ],
  },
  {
    id: 'game-word-race', engine: 'quick_game', game: 'word_race', clientAnswers: true,
    title: 'Quick Game: Word Race', cefr: 'Pre-A1', seconds: 180, perItem: 7,
    csv: CSV('Word Race', 28, 'Unit 1.3', 'Say or type the Spanish for each prompt before the timer runs out on the first two topics of this unit plus a few due review items. 3 minutes, scored on speed and accuracy; misses go back into spaced review.'),
    duolingo: { has: 'partial', equivalent: 'Timed challenges', notes: 'Per-word countdown, type or say the answer, speed bonus.' },
    items: [
      { en: 'hello', accepted: ['hola'] }, { en: 'goodbye', accepted: ['adiós', 'chao'] }, { en: 'thank you', accepted: ['gracias'] },
      { en: 'please', accepted: ['por favor'] }, { en: 'yes', accepted: ['sí'] }, { en: 'water', accepted: ['agua', 'el agua'] },
      { en: 'one', accepted: ['uno'] }, { en: 'two', accepted: ['dos'] }, { en: 'three', accepted: ['tres'] },
      { en: 'book', accepted: ['libro', 'el libro'] }, { en: 'good morning', accepted: ['buenos días'] }, { en: "you're welcome", accepted: ['de nada'] },
      { en: 'ten', accepted: ['diez'] }, { en: 'bathroom', accepted: ['baño', 'el baño'] }, { en: 'I want', accepted: ['quiero'] },
    ],
  },
  {
    id: 'game-sentence-builder', engine: 'quick_game', game: 'sentence_builder', clientAnswers: true,
    title: 'Quick Game: Sentence Builder', cefr: 'Pre-A1', seconds: 180,
    csv: CSV('Sentence Builder', 5, 'Unit 1.1', 'Drag word tiles to build sentences you hear on the first two topics of this unit plus a few due review items. 3 minutes, scored on speed and accuracy; misses go back into spaced review.'),
    duolingo: { has: 'partial', equivalent: 'Tap-what-you-hear inside timed challenges', notes: 'Hear it, build it from tiles, against the clock.' },
    items: [
      { es: 'Hola, ¿cómo estás?', extra: ['adiós', 'bien'] },
      { es: 'Buenos días, Mara.', extra: ['noches', 'Tomás'] },
      { es: 'Quiero agua, por favor.', extra: ['café', 'gracias'] },
      { es: 'Muy bien, gracias.', extra: ['mal', 'hola'] },
      { es: 'La información, por favor.', extra: ['el', 'hotel'] },
      { es: 'Adiós, hasta luego.', extra: ['mañana', 'hola'] },
      { es: 'Necesito ayuda.', extra: ['quiero', 'agua'] },
      { es: '¿Hay un baño aquí?', extra: ['es', 'allí'] },
    ],
  },
  {
    id: 'game-fix-sentence', engine: 'quick_game', game: 'fix_sentence', clientAnswers: true,
    title: 'Quick Game: Fix the Sentence', cefr: 'Pre-A1', seconds: 180,
    csv: CSV('Fix the Sentence', 43, 'Unit 1.4', 'Spot and fix the mistake in each sentence in a timed streak on the first two topics of this unit plus a few due review items. 3 minutes, scored on speed and accuracy; misses go back into spaced review.'),
    duolingo: { has: 'no', equivalent: 'None', notes: 'Tap the wrong word, pick the fix; streak multiplier.' },
    items: [
      { tokens: ['Buenos', 'noches,', 'Mara.'], wrong: 0, choices: ['Buenas', 'Buenos', 'Bueno'], answer: 0 },
      { tokens: ['Es', 'una', 'libro.'], wrong: 1, choices: ['un', 'una', 'unas'], answer: 0 },
      { tokens: ['Quiero', 'agua,', 'de', 'favor.'], wrong: 2, choices: ['por', 'para', 'con'], answer: 0 },
      { tokens: ['¿Como', 'estás?'], wrong: 0, choices: ['¿Cómo', '¿Qué', '¿Cuál'], answer: 0 },
      { tokens: ['Muchos', 'gracias.'], wrong: 0, choices: ['Muchas', 'Mucho', 'Mucha'], answer: 0 },
      { tokens: ['Tengo', 'tres', 'libro.'], wrong: 2, choices: ['libros.', 'libra.', 'libras.'], answer: 0 },
      { tokens: ['La', 'hotel', 'es', 'grande.'], wrong: 0, choices: ['El', 'Los', 'Las'], answer: 0 },
      { tokens: ['¿Hay', 'un', 'baño', 'aquí?'], wrong: -1, choices: [], answer: -1, correctAsIs: true },
      { tokens: ['Hasta', 'luego,', 'Tomas.'], wrong: 2, choices: ['Tomás.', 'Tomes.', 'Tamás.'], answer: 0 },
    ],
  },
  {
    id: 'game-memory-pairs', engine: 'quick_game', game: 'memory_pairs', clientAnswers: true,
    title: 'Quick Game: Memory Pairs', cefr: 'Pre-A1', seconds: 180,
    csv: CSV('Memory Pairs', 54, 'Unit 1.5', 'Flip cards to pair Spanish phrases with their meanings on the first two topics of this unit plus a few due review items. 3 minutes, scored on speed and accuracy; misses go back into spaced review.'),
    duolingo: { has: 'no', equivalent: 'None (closest: match pairs)', notes: 'Face-down memory grid; flips, speed and accuracy scored; new board when cleared.' },
    boards: [
      [['hola', 'hello'], ['adiós', 'goodbye'], ['gracias', 'thank you'], ['por favor', 'please'], ['agua', 'water'], ['libro', 'book']],
      [['uno', 'one'], ['dos', 'two'], ['tres', 'three'], ['casa', 'house'], ['perro', 'dog'], ['gato', 'cat']],
    ],
  },
  {
    id: 'game-speed-match', engine: 'quick_game', game: 'speed_match', clientAnswers: true,
    title: 'Quick Game: Speed Match', cefr: 'Pre-A1', seconds: 180,
    csv: CSV('Speed Match', 67, 'Unit 1.6', 'Match Spanish audio to pictures or meanings against the clock on the first two topics of this unit plus a few due review items. 3 minutes, scored on speed and accuracy; misses go back into spaced review.'),
    duolingo: { has: 'yes', equivalent: 'Match Madness', notes: 'Match Madness layout: two columns of five that refill as you match. Left tiles are audio only (tap to hear), right tiles are a picture or a meaning.' },
    pairs: [
      { es: 'hola', en: 'hello' }, { es: 'adiós', en: 'goodbye' }, { es: 'gracias', en: 'thank you' }, { es: 'por favor', en: 'please' },
      { es: 'el agua', art: 'agua' }, { es: 'el café', art: 'cafe' }, { es: 'el pan', art: 'pan' }, { es: 'la leche', art: 'leche' },
      { es: 'el libro', art: 'libro' }, { es: 'la casa', art: 'casa' }, { es: 'el perro', art: 'perro' }, { es: 'el gato', art: 'gato' },
      { es: 'el tren', art: 'tren' }, { es: 'uno', en: 'one' }, { es: 'dos', en: 'two' }, { es: 'tres', en: 'three' },
      { es: 'diez', en: 'ten' }, { es: 'la mesa', art: 'mesa' }, { es: 'el sol', art: 'sol' }, { es: 'la ayuda', en: 'help' },
      { es: 'el hotel', art: 'hotel' }, { es: 'la música', art: 'musica' }, { es: 'buenos días', en: 'good morning' }, { es: 'de nada', en: "you're welcome" },
    ],
  },
];
