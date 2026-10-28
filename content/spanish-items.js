/**
 * Spanish items. Conjugation, gender, numbers, and adjective agreement are
 * generated from a lexicon plus the regular ending tables, so the bank covers
 * every person of every regular verb without a hand-written answer key. Ser vs
 * estar, object pronouns, and translation come from authored pools, because the
 * judgment in those is not mechanical.
 *
 * Answers are compared with accents stripped (see services/grading.js), so a
 * learner typing "hablo" for "hablo" is never marked wrong for a missing accent
 * mark — but the rationale always shows the fully accented form.
 */
const { choicesFrom } = require('./rng');
const { fromPool, withShapes } = require('./pool');
const { FAMILIES } = require('./spanish-families');

const item = (o) => ({ source: 'bank', ...o });

/**
 * The core noun bank. Every Spanish skill that names a thing draws from here, so
 * its length is the main lever on how often a learner sees the same question:
 * vocabulary, gender, articles, adjective agreement and the pronoun families all
 * multiply by it. Genders are checked, including the ones that contradict their
 * ending (el problema, la mano, el día, la leche, el mapa, la flor).
 *
 *   pl    the plural, written out: "lápices" and "jardines" are not stem + s/es
 *   alt   other Spanish words that are just as right for the English word, so a
 *         type-in accepts them ("car" is coche, carro or auto depending on where
 *         the learner learned it)
 *   k     'obj' for a countable everyday object, the nouns the adjective
 *         families describe ("la leche alta" is grammatical and meaningless)
 *   food  something eaten or drunk, for the odd-one-out shape
 *   mass  not normally counted, so never asked about in the plural
 *
 * Azúcar is not here on purpose: "el azúcar" and "la azúcar" are both correct,
 * so a question asking for its article has two right answers.
 */
const NOUNS = [
  { es: 'libro', pl: 'libros', en: 'book', g: 'm', k: 'obj' },
  { es: 'mesa', pl: 'mesas', en: 'table', g: 'f', k: 'obj' },
  { es: 'perro', pl: 'perros', en: 'dog', g: 'm' },
  { es: 'casa', pl: 'casas', en: 'house', g: 'f', k: 'obj' },
  { es: 'ciudad', pl: 'ciudades', en: 'city', g: 'f' },
  { es: 'problema', pl: 'problemas', en: 'problem', g: 'm' },
  { es: 'mano', pl: 'manos', en: 'hand', g: 'f' },
  { es: 'día', pl: 'días', en: 'day', g: 'm' },
  { es: 'leche', pl: 'leches', en: 'milk', g: 'f', food: true, mass: true },
  { es: 'papel', pl: 'papeles', en: 'paper', g: 'm' },
  { es: 'noche', pl: 'noches', en: 'night', g: 'f' },
  { es: 'mapa', pl: 'mapas', en: 'map', g: 'm', k: 'obj' },
  { es: 'clase', pl: 'clases', en: 'class', g: 'f' },
  { es: 'reloj', pl: 'relojes', en: 'clock', g: 'm', k: 'obj' },
  { es: 'ventana', pl: 'ventanas', en: 'window', g: 'f', k: 'obj' },
  { es: 'coche', pl: 'coches', en: 'car', g: 'm', k: 'obj', alt: ['carro', 'auto', 'automóvil'] },
  { es: 'flor', pl: 'flores', en: 'flower', g: 'f' },
  { es: 'lápiz', pl: 'lápices', en: 'pencil', g: 'm', k: 'obj' },
  { es: 'silla', pl: 'sillas', en: 'chair', g: 'f', k: 'obj' },
  { es: 'cuaderno', pl: 'cuadernos', en: 'notebook', g: 'm', k: 'obj', alt: ['libreta'] },
  { es: 'carta', pl: 'cartas', en: 'letter', g: 'f', k: 'obj', alt: ['letra'] },
  { es: 'sombrero', pl: 'sombreros', en: 'hat', g: 'm', k: 'obj', alt: ['gorro'] },
  { es: 'llave', pl: 'llaves', en: 'key', g: 'f', k: 'obj' },
  { es: 'plato', pl: 'platos', en: 'plate', g: 'm', k: 'obj' },
  { es: 'maleta', pl: 'maletas', en: 'suitcase', g: 'f', k: 'obj', alt: ['valija'] },
  { es: 'zapato', pl: 'zapatos', en: 'shoe', g: 'm', k: 'obj' },
  { es: 'camisa', pl: 'camisas', en: 'shirt', g: 'f', k: 'obj' },
  { es: 'queso', pl: 'quesos', en: 'cheese', g: 'm', food: true },
  { es: 'manzana', pl: 'manzanas', en: 'apple', g: 'f', food: true },
  { es: 'pan', pl: 'panes', en: 'bread', g: 'm', food: true },
  { es: 'puerta', pl: 'puertas', en: 'door', g: 'f', k: 'obj' },
  { es: 'jardín', pl: 'jardines', en: 'garden', g: 'm' },
  { es: 'cocina', pl: 'cocinas', en: 'kitchen', g: 'f' },
  { es: 'tren', pl: 'trenes', en: 'train', g: 'm', k: 'obj' },
  { es: 'playa', pl: 'playas', en: 'beach', g: 'f' },
  { es: 'campo', pl: 'campos', en: 'field', g: 'm' },
  { es: 'tienda', pl: 'tiendas', en: 'shop', g: 'f' },
  { es: 'río', pl: 'ríos', en: 'river', g: 'm' },
  { es: 'calle', pl: 'calles', en: 'street', g: 'f' },
  { es: 'pueblo', pl: 'pueblos', en: 'village', g: 'm', alt: ['aldea'] },
  { es: 'escuela', pl: 'escuelas', en: 'school', g: 'f', alt: ['colegio'] },
  { es: 'cielo', pl: 'cielos', en: 'sky', g: 'm' },
  { es: 'nube', pl: 'nubes', en: 'cloud', g: 'f' },
  { es: 'jugo', pl: 'jugos', en: 'juice', g: 'm', food: true, alt: ['zumo'] },
  { es: 'sopa', pl: 'sopas', en: 'soup', g: 'f', food: true },
  { es: 'huevo', pl: 'huevos', en: 'egg', g: 'm', food: true },
  { es: 'cuchara', pl: 'cucharas', en: 'spoon', g: 'f', k: 'obj' },
  { es: 'cuchillo', pl: 'cuchillos', en: 'knife', g: 'm', k: 'obj' },
  { es: 'toalla', pl: 'toallas', en: 'towel', g: 'f', k: 'obj' },
  { es: 'espejo', pl: 'espejos', en: 'mirror', g: 'm', k: 'obj' },
  { es: 'cama', pl: 'camas', en: 'bed', g: 'f', k: 'obj' },
  { es: 'techo', pl: 'techos', en: 'roof', g: 'm', alt: ['tejado'] },
  { es: 'pared', pl: 'paredes', en: 'wall', g: 'f', alt: ['muro'] },
  { es: 'suelo', pl: 'suelos', en: 'floor', g: 'm', alt: ['piso'] },
  { es: 'bolsa', pl: 'bolsas', en: 'bag', g: 'f', k: 'obj', alt: ['bolso'] },
  { es: 'dinero', pl: 'dineros', en: 'money', g: 'm', mass: true, alt: ['plata'] },
  { es: 'carne', pl: 'carnes', en: 'meat', g: 'f', food: true },
  { es: 'pescado', pl: 'pescados', en: 'fish', g: 'm', food: true, alt: ['pez'] },
  { es: 'sal', pl: 'sales', en: 'salt', g: 'f', mass: true },
  { es: 'arroz', pl: 'arroces', en: 'rice', g: 'm', food: true, mass: true },
];

const VERBS = [
  { inf: 'hablar', en: 'to speak' }, { inf: 'trabajar', en: 'to work' },
  { inf: 'estudiar', en: 'to study' }, { inf: 'caminar', en: 'to walk' },
  { inf: 'cocinar', en: 'to cook' }, { inf: 'escuchar', en: 'to listen' },
  { inf: 'comer', en: 'to eat' }, { inf: 'beber', en: 'to drink' },
  { inf: 'aprender', en: 'to learn' }, { inf: 'correr', en: 'to run' },
  { inf: 'vivir', en: 'to live' }, { inf: 'escribir', en: 'to write' },
  { inf: 'abrir', en: 'to open' }, { inf: 'recibir', en: 'to receive' },
  { inf: 'cantar', en: 'to sing' }, { inf: 'bailar', en: 'to dance' },
  { inf: 'limpiar', en: 'to clean' }, { inf: 'comprar', en: 'to buy' },
  { inf: 'llevar', en: 'to carry' }, { inf: 'esperar', en: 'to wait' },
  { inf: 'preguntar', en: 'to ask' }, { inf: 'lavar', en: 'to wash' },
  { inf: 'mirar', en: 'to watch' }, { inf: 'nadar', en: 'to swim' },
  { inf: 'vender', en: 'to sell' }, { inf: 'romper', en: 'to break' },
  { inf: 'barrer', en: 'to sweep' },
  { inf: 'compartir', en: 'to share' }, { inf: 'subir', en: 'to go up' },
  { inf: 'añadir', en: 'to add' }, { inf: 'decidir', en: 'to decide' },
  { inf: 'pintar', en: 'to paint' }, { inf: 'buscar', en: 'to look for' },
  { inf: 'enseñar', en: 'to teach' }, { inf: 'ayudar', en: 'to help' },
  { inf: 'llamar', en: 'to call' }, { inf: 'usar', en: 'to use' },
  { inf: 'viajar', en: 'to travel' }, { inf: 'entrar', en: 'to enter' },
  { inf: 'deber', en: 'to owe' },
  { inf: 'temer', en: 'to fear' }, { inf: 'coser', en: 'to sew' },
  { inf: 'cumplir', en: 'to fulfil' }, { inf: 'partir', en: 'to depart' },
  { inf: 'unir', en: 'to join' }, { inf: 'permitir', en: 'to allow' },
];

/**
 * Adjectives, and the nouns each one can sensibly describe. Agreement is the
 * point of the question, but the phrase still has to mean something: "la leche
 * alta" agrees perfectly and is not Spanish anyone would say. Without `only`, an
 * adjective fits every everyday object (k: 'obj').
 */
const ADJECTIVES = [
  { m: 'blanco', f: 'blanca', en: 'white' },
  { m: 'alto', f: 'alta', en: 'tall', only: ['mesa', 'silla', 'casa', 'puerta', 'ventana', 'cama', 'sombrero', 'espejo'] },
  { m: 'pequeño', f: 'pequeña', en: 'small' }, { m: 'nuevo', f: 'nueva', en: 'new' },
  { m: 'rojo', f: 'roja', en: 'red' }, { m: 'bonito', f: 'bonita', en: 'pretty' },
  { m: 'grande', f: 'grande', en: 'big' },
  { m: 'interesante', f: 'interesante', en: 'interesting', only: ['libro', 'mapa', 'carta', 'ciudad', 'problema', 'clase', 'día', 'noche', 'pueblo'] },
];

function adjectiveFits(adj, noun) {
  return adj.only ? adj.only.includes(noun.es) : noun.k === 'obj';
}

/** An adjective in the plural: a vowel takes -s, a consonant -es. */
function pluralize(word) {
  return /[aeiouáéó]$/.test(word) ? `${word}s` : `${word}es`;
}

const PRONOUNS = [
  { es: 'yo', en: 'I', slot: 0 },
  { es: 'tú', en: 'you (informal)', slot: 1 },
  { es: 'él', en: 'he', slot: 2 },
  { es: 'ella', en: 'she', slot: 2 },
  { es: 'nosotros', en: 'we', slot: 3 },
  { es: 'ellos', en: 'they', slot: 4 },
];

const ENDINGS = {
  present: {
    ar: ['o', 'as', 'a', 'amos', 'an'],
    er: ['o', 'es', 'e', 'emos', 'en'],
    ir: ['o', 'es', 'e', 'imos', 'en'],
  },
  preterite: {
    ar: ['é', 'aste', 'ó', 'amos', 'aron'],
    er: ['í', 'iste', 'ió', 'imos', 'ieron'],
    ir: ['í', 'iste', 'ió', 'imos', 'ieron'],
  },
  imperfect: {
    ar: ['aba', 'abas', 'aba', 'ábamos', 'aban'],
    er: ['ía', 'ías', 'ía', 'íamos', 'ían'],
    ir: ['ía', 'ías', 'ía', 'íamos', 'ían'],
  },
  subjunctive: {
    ar: ['e', 'es', 'e', 'emos', 'en'],
    er: ['a', 'as', 'a', 'amos', 'an'],
    ir: ['a', 'as', 'a', 'amos', 'an'],
  },
};

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
/** The twenties are one word, and three of them carry an accent: veintidós, veintitrés, veintiséis. */
const TWENTIES = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];

function numToSpanish(n) {
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`numToSpanish: ${n} is outside 0-100`);
  if (n < 20) return UNITS[n];
  if (n === 100) return 'cien';
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 2) return TWENTIES[u];
  return u === 0 ? TENS[t] : `${TENS[t]} y ${UNITS[u]}`;
}

function stemOf(inf) {
  return { stem: inf.slice(0, -2), type: inf.slice(-2) };
}

/**
 * Stem plus ending, with the spelling changes an -ar stem needs before an e:
 * busc-é is written busqué (and busque), pag-é pagué, empez-é empecé. Without them
 * "buscé" and "busce" were served as right answers.
 */
function conjugate(inf, tense, slot) {
  const { stem, type } = stemOf(inf);
  const ending = ENDINGS[tense][type][slot];
  if (type === 'ar' && /^[eé]/.test(ending)) {
    if (stem.endsWith('c')) return `${stem.slice(0, -1)}qu${ending}`;
    if (stem.endsWith('g')) return `${stem}u${ending}`;
    if (stem.endsWith('z')) return `${stem.slice(0, -1)}c${ending}`;
  }
  return stem + ending;
}

/** The ending a conjugated form adds, and whether the stem changed spelling for it. */
function endingOf(inf, tense, slot) {
  return ENDINGS[tense][stemOf(inf).type][slot];
}
function spellingChanged(inf, tense, slot) {
  return conjugate(inf, tense, slot) !== stemOf(inf).stem + endingOf(inf, tense, slot);
}

const TENSE_KEYS = Object.keys(ENDINGS);
const bare = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Another form of the same verb that differs from this one only by an accent:
 * habló and hablo, hablé and hable. The grader forgives accents, so a type-in keyed
 * "habló" would also accept "hablo", which is a different person in a different
 * tense.
 */
function accentTwin(inf, form) {
  for (const t of TENSE_KEYS) {
    for (let s = 0; s < 5; s++) {
      const other = conjugate(inf, t, s);
      if (other !== form && bare(other) === bare(form)) return other;
    }
  }
  return null;
}

function conjugationItem(rng, d, tense, verbFilter, label) {
  const verb = rng.pick(VERBS.filter(verbFilter));
  const pron = d <= 3 ? rng.pick(PRONOUNS.filter((p) => p.slot <= 2)) : rng.pick(PRONOUNS);
  const answer = conjugate(verb.inf, tense, pron.slot);
  // Two persons can share a form (yo and él in the imperfect and the
  // subjunctive), and a distractor that is also right is not a distractor.
  const wrongs = [...new Set([0, 1, 2, 3, 4].map((s) => conjugate(verb.inf, tense, s)))]
    .filter((f) => f !== answer);
  // A key with an accent twin is asked as a choice, with the twin among the
  // options, because typed it would be graded the same as its twin.
  const twin = accentTwin(verb.inf, answer);
  const format = twin ? 'multiple_choice' : d >= 5 ? 'type_in' : rng.bool() ? 'type_in' : 'multiple_choice';
  const distractors = twin
    ? [twin, ...rng.sample(wrongs.filter((w) => w !== twin), 2)]
    : rng.sample(wrongs, 3);
  const { stem, type } = stemOf(verb.inf);
  const changed = spellingChanged(verb.inf, tense, pron.slot)
    ? ` Before an e, "${stem}" is spelled "${answer.slice(0, answer.length - endingOf(verb.inf, tense, pron.slot).length)}" to keep its sound.`
    : '';
  return item({
    format,
    prompt: `Complete with the ${label} of ${verb.inf} (${verb.en}):\n${pron.es} ___`,
    choices: rng.shuffle([answer, ...distractors]),
    answer,
    rationale: `${verb.inf} is a regular -${type} verb. Drop the ending for the stem "${stem}" and add the ${label} ending for ${pron.es}: ${answer}.${changed}`,
  });
}

const POOLS = {
  es_ser_estar: [
    { d: 2, p: 'Choose the correct verb: Ella ___ profesora.', c: ['es', 'está', 'son', 'estás'], a: 'es', r: 'Profession is a lasting identity, so it takes ser: ella es profesora.' },
    // Was "El café ___ caliente", but "el café es caliente" can be said of
    // coffee in general, so it had two answers. Being open has one.
    { d: 3, p: 'Choose the correct verb: La ventana ___ abierta.', c: ['está', 'es', 'son', 'estar'], a: 'está', r: 'A temporary condition like being open takes estar.' },
    { d: 4, p: 'Choose the correct verb: Nosotros ___ de México.', c: ['somos', 'estamos', 'son', 'están'], a: 'somos', r: 'Origin takes ser: somos de México.' },
    { d: 5, p: 'Choose the correct verb: ¿Dónde ___ la biblioteca?', c: ['está', 'es', 'son', 'estoy'], a: 'está', r: 'Location of a thing takes estar, even when the location never changes.' },
    { d: 6, p: 'Choose the correct verb: La reunión ___ a las tres.', c: ['es', 'está', 'están', 'estar'], a: 'es', r: 'The time of an event takes ser: la reunión es a las tres.' },
    { d: 7, p: '"Ella es aburrida" means:', c: ['She is boring', 'She is bored', 'She was bored', 'She gets bored'], a: 'She is boring', r: 'With ser the adjective describes a trait (boring); with estar it would describe a state (bored).' },
    { d: 8, p: 'Choose the correct verb: Los plátanos ___ verdes; no puedes comerlos todavía.', c: ['están', 'son', 'es', 'estamos'], a: 'están', r: 'Estar marks the condition of being unripe; ser verdes would mean they are a green variety.' },
  ],

  es_questions: [
    { d: 2, p: 'Choose the question word: ¿___ te llamas?', c: ['Cómo', 'Qué', 'Dónde', 'Cuándo'], a: 'Cómo', r: '"¿Cómo te llamas?" is the standard way to ask a name.' },
    { d: 3, p: 'Choose the question word: ¿___ está el baño?', c: ['Dónde', 'Cuándo', 'Quién', 'Cuánto'], a: 'Dónde', r: 'Dónde asks about location.' },
    { d: 4, p: 'Choose the question word: ¿___ cuesta el billete?', c: ['Cuánto', 'Cómo', 'Cuál', 'Quién'], a: 'Cuánto', r: 'Cuánto asks how much.' },
    { d: 5, p: 'Which is the correct negative sentence?', c: ['No tengo nada.', 'No tengo algo.', 'Tengo nada.', 'No nada tengo.'], a: 'No tengo nada.', r: 'Spanish uses double negation: no + nada.' },
    { d: 6, p: 'Choose the correct word: ¿___ de estos libros prefieres?', c: ['Cuál', 'Qué', 'Cómo', 'Quién'], a: 'Cuál', r: 'Cuál selects among known options; qué asks for a definition or an open answer.' },
    { d: 7, p: 'Which question asks "Whose book is this?"', c: ['¿De quién es este libro?', '¿Quién es este libro?', '¿Cuál es este libro?', '¿Qué es de este libro?'], a: '¿De quién es este libro?', r: 'Possession is asked with "de quién," literally "of whom."' },
  ],

  es_object_pron: [
    { d: 4, p: 'Replace the object: Veo el libro. → ___ veo.', c: ['Lo', 'La', 'Le', 'Los'], a: 'Lo', r: 'El libro is masculine singular, so the direct object pronoun is lo.' },
    { d: 5, p: 'Replace the object: Compro las flores. → ___ compro.', c: ['Las', 'Los', 'Les', 'La'], a: 'Las', r: 'Las flores is feminine plural: las.' },
    { d: 6, p: 'Choose the correct pronoun: ___ doy el libro a María.', c: ['Le', 'La', 'Lo', 'Les'], a: 'Le', r: 'María is the indirect object (the receiver), and the singular indirect pronoun is le.' },
    { d: 7, p: 'Which sentence places the pronouns correctly?', c: ['Se lo doy.', 'Lo se doy.', 'Doy se lo.', 'Le lo doy.'], a: 'Se lo doy.', r: 'Indirect comes before direct, and le + lo becomes se lo.' },
    { d: 8, p: 'Which is correct? (I want to give it to you.)', c: ['Quiero dártelo.', 'Quiero te lo dar.', 'Te lo quiero dar lo.', 'Quiero dar te lo.'], a: 'Quiero dártelo.', r: 'With an infinitive, pronouns attach to the end in indirect-then-direct order: dár-te-lo.' },
  ],

  es_greetings: [
    { d: 1, p: 'What does "Buenos días" mean?', c: ['Good morning', 'Good night', 'See you later', 'Thank you'], a: 'Good morning', r: 'Buenos días is used until midday.' },
    { d: 1, p: 'How do you say "Thank you very much"?', c: ['Muchas gracias', 'Por favor', 'De nada', 'Hasta luego'], a: 'Muchas gracias', r: 'Gracias is thanks; muchas gracias adds emphasis.' },
    { d: 2, p: 'What does "De nada" mean?', c: ['You’re welcome', 'No, thanks', 'Not at all like that', 'Nothing new'], a: 'You’re welcome', r: 'De nada is the standard reply to gracias.' },
    // "In the evening" had two right answers: in Spain buenas tardes runs until
    // dinner, well into what English calls the evening. Late at night has one.
    { d: 2, p: 'Which is the polite way to greet someone late at night?', c: ['Buenas noches', 'Buenos días', 'Buenas tardes', 'Hasta mañana'], a: 'Buenas noches', r: 'Buenas noches is the greeting once it is night; buenas tardes belongs to the afternoon and early evening.' },
    { d: 3, p: 'What does "Mucho gusto" mean?', c: ['Nice to meet you', 'Much better', 'With pleasure, I refuse', 'Very tasty'], a: 'Nice to meet you', r: 'It is the standard phrase on being introduced.' },
    { d: 4, p: 'Which reply best answers "¿Cómo estás?"', c: ['Estoy bien, gracias.', 'Me llamo Ana.', 'Soy de Perú.', 'Tengo veinte años.'], a: 'Estoy bien, gracias.', r: 'The question asks how you are, which estar answers.' },
    { d: 5, p: 'Which is more formal?', c: ['¿Cómo está usted?', '¿Cómo estás?', '¿Qué tal?', '¿Qué hay?'], a: '¿Cómo está usted?', r: 'Usted is the formal second person, used with strangers and in professional settings.' },
  ],

  es_translate: [
    { d: 2, p: 'Translate into Spanish: I speak Spanish.', a: 'Hablo español', x: ['Yo hablo español', 'Hablo castellano', 'Yo hablo castellano'], r: 'The subject pronoun is optional because the -o ending already marks "I": (Yo) hablo español.', format: 'short_answer' },
    { d: 3, p: 'Translate into Spanish: We eat at home.', a: 'Comemos en casa', x: ['Nosotros comemos en casa', 'Nosotras comemos en casa'], r: 'Comer is regular: comemos. "At home" is "en casa" with no article.', format: 'short_answer' },
    { d: 4, p: 'Translate into Spanish: She lives in a big city.', a: 'Ella vive en una ciudad grande', x: ['Vive en una ciudad grande', 'Ella vive en una gran ciudad', 'Vive en una gran ciudad'], r: 'Vivir is regular: vive. Most adjectives follow the noun: ciudad grande.', format: 'short_answer' },
    { d: 5, p: 'Translate into Spanish: The books are on the table.', a: 'Los libros están en la mesa', x: ['Los libros están sobre la mesa', 'Los libros están encima de la mesa'], r: 'Location takes estar, and libro is masculine plural: los libros están.', format: 'short_answer' },
    { d: 6, p: 'Translate into Spanish: Yesterday I worked a lot.', a: 'Ayer trabajé mucho', x: ['Ayer yo trabajé mucho'], r: 'A completed past action takes the preterite: trabajé.', format: 'short_answer' },
    { d: 7, p: 'Translate into Spanish: When I was a child, I read every night.', a: 'Cuando era niño, leía todas las noches', x: ['Cuando era niña, leía todas las noches', 'Cuando yo era niño, leía todas las noches', 'Cuando yo era niña, leía todas las noches', 'Cuando era pequeño, leía todas las noches', 'Cuando era pequeña, leía todas las noches', 'Cuando era niño, leía cada noche', 'Cuando era niña, leía cada noche'], r: 'Both verbs describe habitual or ongoing past states, so both are imperfect: era, leía.', format: 'short_answer' },
    { d: 8, p: 'Translate into Spanish: I want you to come tomorrow.', a: 'Quiero que vengas mañana', x: ['Yo quiero que vengas mañana', 'Quiero que venga mañana', 'Quiero que vengan mañana', 'Quiero que vengáis mañana'], r: 'A wish directed at someone else triggers the subjunctive in the second clause: quiero que vengas (or venga for usted, vengan for ustedes).', format: 'short_answer' },
  ],
};

const G = {
  es_vocab_core(rng, d) {
    const noun = rng.pick(NOUNS);
    const others = rng.sample(NOUNS.filter((n) => n.es !== noun.es), 3);
    if (d <= 4 || rng.bool()) {
      return item({
        format: 'multiple_choice',
        prompt: `What does "${noun.es}" mean?`,
        choices: rng.shuffle([noun.en, ...others.map((o) => o.en)]),
        answer: noun.en,
        rationale: `"${noun.es}" means ${noun.en}.`,
      });
    }
    const also = noun.alt || [];
    return item({
      format: 'type_in',
      prompt: `Write the Spanish word for "${noun.en}" (no article).`,
      answer: noun.es,
      // Other words that are just as right where the learner learned Spanish.
      accepts: also,
      rationale: `${noun.en} is "${noun.es}" (${noun.g === 'm' ? 'el' : 'la'} ${noun.es})`
        + `${also.length ? `; ${also.map((w) => `"${w}"`).join(' and ')} ${also.length > 1 ? 'are' : 'is'} also used` : ''}.`,
    });
  },

  es_gender(rng, d) {
    const noun = rng.pick(NOUNS);
    // A noun nobody counts ("leches", "dineros") is not asked about in the plural.
    const plural = d >= 6 && !noun.mass && rng.bool();
    // Definite and indefinite articles test the same gender knowledge, so asking
    // for both doubles the bank without loosening the skill.
    const indefinite = d >= 3 && rng.bool();
    const article = plural
      ? (indefinite ? (noun.g === 'm' ? 'unos' : 'unas') : (noun.g === 'm' ? 'los' : 'las'))
      : (indefinite ? (noun.g === 'm' ? 'un' : 'una') : (noun.g === 'm' ? 'el' : 'la'));
    const shown = plural ? noun.pl : noun.es;
    const gender = noun.g === 'm' ? 'masculine' : 'feminine';
    // The nouns whose ending points the wrong way. Leche and flor used to be on
    // this list, but -e and -r endings do not point either way, so "despite its
    // ending" was not true of them.
    const tricky = { problema: 'ends in -a', mapa: 'ends in -a', día: 'ends in -a', mano: 'ends in -o' }[noun.es];
    return item({
      format: 'multiple_choice',
      prompt: `Choose the correct article: ___ ${shown}`,
      choices: rng.shuffle(plural
        ? (indefinite ? ['unos', 'unas', 'un', 'una'] : ['los', 'las', 'el', 'la'])
        : (indefinite ? ['un', 'una', 'unos', 'unas'] : ['el', 'la', 'los', 'las'])),
      answer: article,
      rationale: tricky
        ? `"${noun.es}" is ${gender} even though it ${tricky}, which makes it one to memorize: ${article} ${shown}.`
        : `"${noun.es}" is ${gender}${plural ? ' and here plural' : ''}, so the article is ${article}: ${article} ${shown}.`,
    });
  },

  es_numbers(rng, d) {
    if (d <= 4) {
      const n = rng.int(0, d <= 2 ? 20 : 60);
      return item({
        format: 'type_in',
        prompt: `Write the number ${n} in Spanish.`,
        answer: numToSpanish(n),
        rationale: `${n} is "${numToSpanish(n)}".`,
      });
    }
    if (d <= 7) {
      const n = rng.int(21, 99);
      return item({
        format: 'type_in',
        prompt: `Write the number ${n} in Spanish.`,
        answer: numToSpanish(n),
        rationale: n < 30
          ? `The twenties join into one word: ${numToSpanish(n)}.`
          : `From thirty up, the tens and units are joined by "y": ${numToSpanish(n)}.`,
      });
    }
    const hour = rng.int(1, 12);
    const minute = rng.pick([0, 15, 30]);
    // One o'clock is "la una": the hour agrees with "hora", so it is una, not uno.
    const lead = hour === 1 ? 'es la' : 'son las';
    const said = `${lead} ${hour === 1 ? 'una' : numToSpanish(hour)}`;
    const answer = minute === 0 ? said : minute === 15 ? `${said} y cuarto` : `${said} y media`;
    // Both ways of saying a quarter and a half past are correct and common.
    const accepts = minute === 0 ? [`${said} en punto`] : minute === 15 ? [`${said} y quince`] : [`${said} y treinta`];
    return item({
      format: 'type_in',
      prompt: `How do you say the time ${hour}:${String(minute).padStart(2, '0')} in Spanish?`,
      answer,
      accepts,
      rationale: hour === 1
        ? `One o’clock is singular: "${answer}".`
        : `Hours take the plural: "${answer}".`,
    });
  },

  es_present_ar: (rng, d) => conjugationItem(rng, d, 'present', (v) => v.inf.endsWith('ar'), 'present tense'),
  es_present_erir: (rng, d) => conjugationItem(rng, d, 'present', (v) => !v.inf.endsWith('ar'), 'present tense'),
  es_preterite: (rng, d) => conjugationItem(rng, d, 'preterite', () => true, 'preterite'),
  es_imperfect: (rng, d) => conjugationItem(rng, d, 'imperfect', () => true, 'imperfect'),

  es_subjunctive(rng, d) {
    if (d >= 7 && rng.bool()) {
      const verb = rng.pick(VERBS);
      const answer = conjugate(verb.inf, 'subjunctive', 1);
      return item({
        format: 'multiple_choice',
        prompt: `Choose the correct form: Quiero que tú ___ (${verb.inf}).`,
        choices: rng.shuffle([answer, conjugate(verb.inf, 'present', 1), conjugate(verb.inf, 'preterite', 1), conjugate(verb.inf, 'imperfect', 1)]),
        answer,
        rationale: `"Quiero que" expresses a wish about someone else, which triggers the subjunctive: tú ${answer}.`,
      });
    }
    return conjugationItem(rng, d, 'subjunctive', () => true, 'present subjunctive');
  },

  es_adjectives(rng, d) {
    const adj = rng.pick(ADJECTIVES);
    const noun = rng.pick(NOUNS.filter((n) => adjectiveFits(adj, n)));
    const plural = d >= 6 && rng.bool();
    const baseForm = noun.g === 'm' ? adj.m : adj.f;
    const answer = plural ? pluralize(baseForm) : baseForm;
    const nounShown = plural ? noun.pl : noun.es;
    const article = plural ? (noun.g === 'm' ? 'los' : 'las') : (noun.g === 'm' ? 'el' : 'la');
    // Invariant adjectives (grande, interesante) have identical masculine and
    // feminine forms, so their own four forms collapse into two. Pull the extra
    // distractors from another adjective rather than serving a two-choice item.
    const other = rng.pick(ADJECTIVES.filter((a) => a.m !== adj.m));
    const wrongs = [...new Set([adj.m, adj.f, pluralize(adj.m), pluralize(adj.f),
      noun.g === 'm' ? other.f : other.m, pluralize(other.m)])].filter((w) => w !== answer);
    return item({
      format: 'multiple_choice',
      prompt: `Choose the correct form of "${adj.m}" (${adj.en}):\n${article} ${nounShown} ___`,
      choices: rng.shuffle([answer, ...wrongs.slice(0, 3)]),
      answer,
      rationale: `Adjectives agree with the noun. "${noun.es}" is ${noun.g === 'm' ? 'masculine' : 'feminine'}${plural ? ' and here plural' : ''}, so the form is "${answer}".`,
    });
  },
};

/** The generators before any pool or shape is mixed in, so an audit can reach each one. */
const BASE_GENERATORS = { ...G };

// Authored items and generated families share one pool per skill.
for (const skill of new Set([...Object.keys(POOLS), ...Object.keys(FAMILIES)])) {
  G[skill] = fromPool([...(POOLS[skill] || []), ...(FAMILIES[skill] || [])], skill);
}

// A skill with shapes in it alternates between the pool and a different *kind*
// of question on the same grammar: spot the error rather than produce the form,
// name the ending, or say which subject a form belongs to. The pool is the
// default; a shape is used when the learner has not just had one.
//
// The lexicon is handed in rather than required back, because the two files
// referencing each other would otherwise each get a half-built module: this one
// is still defining the tables when the shapes file asks for them.
const LEXICON = {
  NOUNS, VERBS, ADJECTIVES, numToSpanish, conjugate, endingOf, spellingChanged, accentTwin,
  adjectiveFits, pluralize, TENSE_KEYS,
};
const SHAPES = require('./spanish-shapes');
for (const [skill, shapes] of Object.entries(SHAPES)) {
  const base = G[skill];
  // A shape named for a skill that does not exist is never served. That is how
  // the object-pronoun shapes sat unused under "es_object_pronouns" while the
  // skill is es_object_pron, so a misnamed one now fails loudly at load.
  if (!base) throw new Error(`spanish-shapes: no Spanish skill "${skill}" to attach shapes to`);
  const withLexicon = (rng, d, ctx) => shapes(rng, d, ctx, LEXICON);
  G[skill] = withShapes(base, withLexicon, skill);
}

module.exports = {
  GENERATORS: G, BASE_GENERATORS, SHAPES, LEXICON, POOLS, NOUNS, VERBS, ADJECTIVES, numToSpanish, conjugate,
};
