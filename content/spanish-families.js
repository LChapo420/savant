/**
 * Spanish item families.
 *
 * The authored pools taught the right things — ser against estar, question words,
 * object pronouns, greetings, translation — but six items per skill means a
 * learner sees all of them in one sitting. These families keep each rule and vary
 * the nouns, verbs, people and places it is asked about, drawing on the same word
 * banks the procedural Spanish generators already use.
 *
 * Accents are written properly here; services/grading.js accepts answers without
 * them, so a learner is never marked wrong for a keyboard.
 */
const { distinctChoices, spread } = require('./pool');

// Nouns with gender and number, so an article or a pronoun family can be sure of
// the agreement it is testing. All of them things: "Veo el perro" wants the
// personal a ("Veo al perro"), so the dog that used to be here is now a shoe.
const NOUNS = [
  { es: 'libro', en: 'book', g: 'm' }, { es: 'mesa', en: 'table', g: 'f' },
  { es: 'zapato', en: 'shoe', g: 'm' }, { es: 'casa', en: 'house', g: 'f' },
  { es: 'coche', en: 'car', g: 'm' }, { es: 'ventana', en: 'window', g: 'f' },
  { es: 'reloj', en: 'clock', g: 'm' }, { es: 'flor', en: 'flower', g: 'f' },
  { es: 'papel', en: 'paper', g: 'm' }, { es: 'silla', en: 'chair', g: 'f' },
  { es: 'cuaderno', en: 'notebook', g: 'm' }, { es: 'carta', en: 'letter', g: 'f' },
  { es: 'sombrero', en: 'hat', g: 'm' }, { es: 'llave', en: 'key', g: 'f' },
  { es: 'plato', en: 'plate', g: 'm' }, { es: 'maleta', en: 'suitcase', g: 'f' },
];

const PLURALS = {
  m: [{ es: 'libros', en: 'books', g: 'm' },
    { es: 'coches', en: 'cars', g: 'm', alt: [{ es: 'carros', g: 'm' }, { es: 'autos', g: 'm' }] },
    { es: 'papeles', en: 'papers', g: 'm' }, { es: 'platos', en: 'plates', g: 'm' },
    { es: 'cuadernos', en: 'notebooks', g: 'm', alt: [{ es: 'libretas', g: 'f' }] }, { es: 'relojes', en: 'clocks', g: 'm' }],
  f: [{ es: 'flores', en: 'flowers', g: 'f' }, { es: 'mesas', en: 'tables', g: 'f' },
    { es: 'cartas', en: 'letters', g: 'f', alt: [{ es: 'letras', g: 'f' }] }, { es: 'sillas', en: 'chairs', g: 'f' },
    { es: 'llaves', en: 'keys', g: 'f' }, { es: 'maletas', en: 'suitcases', g: 'f', alt: [{ es: 'valijas', g: 'f' }] }],
};
const ALL_PLURALS = [...PLURALS.m, ...PLURALS.f];
/** "estos libros", "estas flores": the demonstrative agrees like any adjective. */
const these = (n) => (n.g === 'm' ? 'estos' : 'estas');
const theP = (n) => (n.g === 'm' ? 'los' : 'las');

/**
 * Professions in both genders, so "Él ___ profesora" cannot be built: the form
 * follows the person it describes.
 */
const PROFESSIONS = [
  { m: 'profesor', f: 'profesora', en: 'teacher' }, { m: 'enfermero', f: 'enfermera', en: 'nurse' },
  { m: 'ingeniero', f: 'ingeniera', en: 'engineer' }, { m: 'cocinero', f: 'cocinera', en: 'cook' },
  { m: 'abogado', f: 'abogada', en: 'lawyer' }, { m: 'panadero', f: 'panadera', en: 'baker' },
  { m: 'dentista', f: 'dentista', en: 'dentist' }, { m: 'piloto', f: 'piloto', en: 'pilot' },
  { m: 'carpintero', f: 'carpintera', en: 'carpenter' }, { m: 'periodista', f: 'periodista', en: 'journalist' },
  { m: 'contador', f: 'contadora', en: 'accountant' }, { m: 'mecánico', f: 'mecánica', en: 'mechanic' },
  { m: 'bibliotecario', f: 'bibliotecaria', en: 'librarian' }, { m: 'electricista', f: 'electricista', en: 'electrician' },
  { m: 'veterinario', f: 'veterinaria', en: 'vet' }, { m: 'arquitecto', f: 'arquitecta', en: 'architect' },
  { m: 'farmacéutico', f: 'farmacéutica', en: 'pharmacist' }, { m: 'traductor', f: 'traductora', en: 'translator' },
];
const WORKERS = [{ es: 'Ella', g: 'f' }, { es: 'Él', g: 'm' }]
  .flatMap((who) => PROFESSIONS.map((job) => ({ who: who.es, es: job[who.g], en: job.en })));

const COUNTRIES = ['México', 'Perú', 'Chile', 'Colombia', 'España', 'Guatemala', 'Uruguay', 'Panamá',
  'Argentina', 'Bolivia', 'Ecuador', 'Honduras', 'Paraguay', 'Costa Rica', 'Nicaragua', 'Cuba',
  'Venezuela', 'El Salvador', 'República Dominicana', 'Puerto Rico'];

/**
 * Adjectives that describe a passing state, so they take estar, each with the
 * nouns it can describe: "el perro está abierto" agreed perfectly and meant
 * nothing. Hot and cold are gone, because "la casa es fría" (a cold house) and
 * "una sopa fría" (a cold soup) are Spanish with ser, so those had two answers.
 */
const STATES = [
  { m: 'abierto', f: 'abierta', en: 'open', on: ['libro', 'casa', 'coche', 'ventana', 'cuaderno', 'carta', 'maleta'] },
  { m: 'cerrado', f: 'cerrada', en: 'closed', on: ['libro', 'casa', 'coche', 'ventana', 'cuaderno', 'carta', 'maleta'] },
  { m: 'sucio', f: 'sucia', en: 'dirty', on: ['mesa', 'zapato', 'casa', 'coche', 'ventana', 'silla', 'sombrero', 'plato', 'maleta'] },
  { m: 'limpio', f: 'limpia', en: 'clean', on: ['mesa', 'zapato', 'casa', 'coche', 'ventana', 'silla', 'sombrero', 'plato', 'maleta'] },
  { m: 'roto', f: 'rota', en: 'broken', on: ['libro', 'mesa', 'zapato', 'coche', 'ventana', 'reloj', 'silla', 'sombrero', 'llave', 'plato', 'maleta'] },
  { m: 'lleno', f: 'llena', en: 'full', on: ['casa', 'coche', 'plato', 'maleta'] },
];
const CONDITIONS = STATES.flatMap((state) => NOUNS.filter((n) => state.on.includes(n.es)).map((noun) => ({ noun, state })));

const PLACES = [
  { es: 'la biblioteca', en: 'the library' }, { es: 'el mercado', en: 'the market' },
  { es: 'la estación', en: 'the station' }, { es: 'el hospital', en: 'the hospital' },
  { es: 'la farmacia', en: 'the pharmacy' }, { es: 'el museo', en: 'the museum' },
  { es: 'la panadería', en: 'the bakery' }, { es: 'el banco', en: 'the bank' },
  { es: 'la escuela', en: 'the school' }, { es: 'el correo', en: 'the post office' },
  { es: 'la plaza', en: 'the square' }, { es: 'el cine', en: 'the cinema' },
  { es: 'la playa', en: 'the beach' }, { es: 'el aeropuerto', en: 'the airport' },
  { es: 'la iglesia', en: 'the church' }, { es: 'el parque', en: 'the park' },
  { es: 'la tienda', en: 'the shop' }, { es: 'el puerto', en: 'the harbour' },
];

const TIMES = [
  { es: 'a las tres', en: 'at three' }, { es: 'a las ocho', en: 'at eight' },
  { es: 'el lunes', en: 'on Monday' }, { es: 'mañana', en: 'tomorrow' },
  { es: 'a mediodía', en: 'at noon' }, { es: 'el viernes', en: 'on Friday' },
];

const EVENTS = [
  { es: 'la reunión', en: 'the meeting' }, { es: 'el concierto', en: 'the concert' },
  { es: 'la clase', en: 'the class' }, { es: 'el examen', en: 'the exam' },
  { es: 'la fiesta', en: 'the party' }, { es: 'el partido', en: 'the match' },
];

const NAMES_ES = ['María', 'Carlos', 'Lucía', 'Javier', 'Elena', 'Diego', 'Rosa', 'Andrés'];

/**
 * Regular verbs with the forms the translation families need. `alt` is another
 * verb that is just as right for the English one (tomar for drink, andar for
 * walk), so a translation in it is accepted.
 */
const VERBS_ES = [
  { inf: 'hablar', en: 'speak', enPast: 'spoke', yo: 'hablo', nos: 'hablamos', el: 'habla', past: 'hablé' },
  { inf: 'trabajar', en: 'work', enPast: 'worked', yo: 'trabajo', nos: 'trabajamos', el: 'trabaja', past: 'trabajé' },
  { inf: 'estudiar', en: 'study', enS: 'studies', enPast: 'studied', yo: 'estudio', nos: 'estudiamos', el: 'estudia', past: 'estudié' },
  { inf: 'cocinar', en: 'cook', enPast: 'cooked', yo: 'cocino', nos: 'cocinamos', el: 'cocina', past: 'cociné' },
  { inf: 'caminar', en: 'walk', enPast: 'walked', yo: 'camino', nos: 'caminamos', el: 'camina', past: 'caminé',
    alt: { yo: 'ando', nos: 'andamos', el: 'anda', past: 'anduve' } },
  { inf: 'comer', en: 'eat', enPast: 'ate', yo: 'como', nos: 'comemos', el: 'come', past: 'comí' },
  { inf: 'beber', en: 'drink', enPast: 'drank', yo: 'bebo', nos: 'bebemos', el: 'bebe', past: 'bebí',
    alt: { yo: 'tomo', nos: 'tomamos', el: 'toma', past: 'tomé' } },
  { inf: 'aprender', en: 'learn', enPast: 'learned', yo: 'aprendo', nos: 'aprendemos', el: 'aprende', past: 'aprendí' },
  { inf: 'vivir', en: 'live', enPast: 'lived', yo: 'vivo', nos: 'vivimos', el: 'vive', past: 'viví' },
  { inf: 'escribir', en: 'write', enPast: 'wrote', yo: 'escribo', nos: 'escribimos', el: 'escribe', past: 'escribí' },
];

/** Where or when, with the other ways of saying it that are just as right. */
const OBJECTS_EN = [
  { es: 'en casa', en: 'at home', also: [] }, { es: 'en la oficina', en: 'at the office', also: [] },
  { es: 'en el parque', en: 'in the park', also: [] },
  { es: 'por la mañana', en: 'in the morning', also: ['en la mañana'] },
  { es: 'todos los días', en: 'every day', also: ['cada día'] },
  { es: 'con mis amigos', en: 'with my friends', also: ['con mis amigas'] },
];

/**
 * A verb with a phrase it makes sense with. "Vivo por la mañana" and "Anoche viví
 * mucho" are grammatical and mean nothing, so vivir only goes where it can.
 */
const LIVE_WHERE = ['en casa', 'con mis amigos'];
const DOINGS = VERBS_ES.flatMap((verb) => OBJECTS_EN
  .filter((where) => verb.inf !== 'vivir' || LIVE_WHERE.includes(where.es))
  .map((where) => ({ verb, where })));
/** Verbs that can stand alone with "mucho" or "nunca": not vivir. */
const ACTIVITIES = VERBS_ES.filter((v) => v.inf !== 'vivir');
/** Every accepted way of writing "<subject> <verb> <phrase>", with and without the pronoun. */
const formsOf = (verb, key) => [verb[key], ...(verb.alt ? [verb.alt[key]] : [])];
const saying = (verb, key, where, pronouns) => formsOf(verb, key).flatMap((form) => [where.es, ...where.also]
  .flatMap((w) => [`${cap(form)} ${w}`, ...pronouns.map((pr) => `${pr} ${form} ${w}`)]));

/** "este libro", "esta mesa". */
const this1 = (n) => (n.g === 'm' ? 'este' : 'esta');

/** Verbs paired with the nouns they can take: you keep a key in a drawer, not a window. */
const KEEPABLE = ['libro', 'zapato', 'reloj', 'papel', 'cuaderno', 'carta', 'sombrero', 'llave', 'plato', 'maleta'];
const TAKES = [{ es: 'Veo', en: 'I see' }, { es: 'Tengo', en: 'I have' },
  { es: 'Compro', en: 'I buy' }, { es: 'Guardo', en: 'I keep' }]
  .flatMap((verb) => NOUNS.filter((n) => verb.es !== 'Guardo' || KEEPABLE.includes(n.es)).map((noun) => ({ verb, noun })));
const CARRIABLE = ['libros', 'papeles', 'platos', 'cuadernos', 'relojes', 'flores', 'cartas', 'llaves', 'maletas', 'sillas'];
const TAKES_PLURAL = [{ es: 'Compro', en: 'I buy' }, { es: 'Veo', en: 'I see' }, { es: 'Llevo', en: 'I carry' }]
  .flatMap((verb) => ALL_PLURALS.filter((n) => verb.es !== 'Llevo' || CARRIABLE.includes(n.es)).map((plural) => ({ verb, plural })));

/** Small things on places they fit: not "las sillas están en la silla". */
const SMALL = ['libros', 'papeles', 'platos', 'cuadernos', 'relojes', 'flores', 'cartas', 'llaves'];
const SPOTS = [
  { es: 'en la mesa', en: 'on the table', also: ['sobre la mesa', 'encima de la mesa'] },
  { es: 'en la silla', en: 'on the chair', also: ['sobre la silla', 'encima de la silla'] },
  { es: 'en el coche', en: 'in the car', also: ['en el carro', 'en el auto'] },
  { es: 'en la maleta', en: 'in the suitcase', also: ['en la valija'] },
];
const STUFF = [
  ...ALL_PLURALS.filter((n) => SMALL.includes(n.es)).flatMap((plural) => SPOTS.map((place) => ({ plural, place }))),
  { plural: PLURALS.f.find((n) => n.es === 'maletas'), place: SPOTS[2] },
];

/** The four question words, each asked with a reply that only it fits. */
const ASKS = [
  {
    word: () => 'Quién', what: 'a person',
    q: (x) => `¿___ tiene ${theP(x)} ${x.es}? — Carlos tiene ${theP(x)} ${x.es}.`,
    wrong: () => ['Qué', 'Dónde', 'Cuándo'],
  },
  {
    word: (x) => (x.g === 'm' ? 'Cuántos' : 'Cuántas'), what: 'a number of things',
    q: (x) => `¿___ ${x.es} hay? — Hay tres ${x.es}.`,
    wrong: (x) => [x.g === 'm' ? 'Cuántas' : 'Cuántos', 'Quién', 'Dónde'],
  },
  {
    word: () => 'Por qué', what: 'a reason',
    q: (x) => `¿___ necesitas ${theP(x)} ${x.es}? — Porque ${theP(x)} necesito para la clase.`,
    wrong: () => ['Quién', 'Dónde', 'Cuándo'],
  },
  {
    word: () => 'Qué', what: 'a thing',
    q: (x) => `¿___ quieres comprar? — Quiero comprar ${x.es}.`,
    wrong: () => ['Quién', 'Dónde', 'Por qué'],
  },
];

/**
 * English meanings and the other glosses that are also right for each phrase. A
 * distractor that is one of those is a second right answer: "Buenas noches" is
 * good evening and good night, "Perdón" is pardon me, excuse me and sorry.
 */
const GREETINGS = [
  { es: 'Buenos días', en: 'Good morning', why: 'Buenos días is used until midday.' },
  { es: 'Buenas tardes', en: 'Good afternoon', also: ['Good evening'], why: 'Buenas tardes runs from midday to dusk.' },
  { es: 'Buenas noches', en: 'Good evening', also: ['Good night'], why: 'Buenas noches covers evening and night.' },
  { es: 'Hasta luego', en: 'See you later', also: ['See you around', 'Goodbye'], why: 'It is a casual goodbye.' },
  { es: 'Muchas gracias', en: 'Thank you very much', also: ['Thank you'], why: 'Gracias is thanks; muchas gracias adds emphasis.' },
  { es: 'De nada', en: 'You’re welcome', why: 'De nada is the standard reply to gracias.' },
  { es: 'Mucho gusto', en: 'Nice to meet you', also: ['Delighted to meet you'], why: 'It is the standard phrase on being introduced.' },
  { es: 'Por favor', en: 'Please', why: 'Por favor is the ordinary polite request.' },
  { es: 'Lo siento', en: 'I’m sorry', also: ['Pardon me'], why: 'Lo siento is the usual apology.' },
  { es: 'Hasta mañana', en: 'See you tomorrow', why: 'Mañana is tomorrow, so this is a goodbye until then.' },
  { es: 'Con permiso', en: 'Excuse me', also: ['Pardon me'], why: 'Con permiso asks to pass or to step away politely.' },
  { es: 'Perdón', en: 'Pardon me', also: ['Excuse me', 'I’m sorry'], why: 'Perdón is the short apology, used for small interruptions.' },
  { es: 'Bienvenido', en: 'Welcome', why: 'Bienvenido greets an arrival.' },
  { es: 'Igualmente', en: 'Likewise', why: 'Igualmente returns a good wish or a pleasure at meeting.' },
  { es: 'Nos vemos', en: 'See you around', also: ['See you later', 'Goodbye'], why: 'Nos vemos is a casual sign-off, literally "we see each other."' },
  { es: 'Adiós', en: 'Goodbye', why: 'Adiós is the plain goodbye.' },
  { es: 'Buen viaje', en: 'Have a good trip', why: 'Buen viaje sends someone off on a journey.' },
  { es: 'Que te vaya bien', en: 'Hope it goes well for you', why: 'A warm parting wish, using the subjunctive vaya.' },
  { es: '¿Qué tal?', en: 'How’s it going?', why: 'A casual "how are things," lighter than ¿Cómo estás?' },
  { es: 'Encantado', en: 'Delighted to meet you', also: ['Nice to meet you'], why: 'Encantado (or encantada) is a more formal "nice to meet you."' },
  { es: 'Salud', en: 'Bless you', why: 'Salud is said after a sneeze, and also as a toast.' },
  { es: 'Buen provecho', en: 'Enjoy your meal', why: 'Said to people who are about to eat.' },
  { es: 'Feliz cumpleaños', en: 'Happy birthday', why: 'Cumpleaños is a birthday, literally "completing years."' },
  { es: 'Buena suerte', en: 'Good luck', why: 'Suerte is luck; buena suerte wishes someone well.' },
  { es: 'Que descanses', en: 'Rest well', also: ['Good night'], why: 'A parting wish at the end of a day, using the subjunctive descanses.' },
  { es: 'No pasa nada', en: 'It’s no problem', why: 'Literally "nothing happens" — used to wave off an apology.' },
  { es: 'Claro que sí', en: 'Of course', why: 'An emphatic yes.' },
  { es: 'Hasta pronto', en: 'See you soon', also: ['See you later', 'See you around'], why: 'Pronto is soon, so this is a warmer goodbye than adiós.' },
  { es: 'Cuídate', en: 'Take care', why: 'From cuidarse, to look after oneself.' },
  { es: 'Con mucho gusto', en: 'With pleasure', also: ['You’re welcome', 'Nice to meet you'], why: 'A warm way of agreeing to do something.' },
  { es: 'Disculpe', en: 'Excuse me (formal)', also: ['Excuse me', 'Pardon me', 'I’m sorry'], why: 'The usted form of disculpar, used to get a stranger’s attention.' },
  { es: 'Enhorabuena', en: 'Congratulations', why: 'Literally "in a good hour."' },
];
const GLOSS_DISTRACTORS = [
  'Good morning', 'Good night', 'See you later', 'Thank you', 'Please', 'I’m sorry',
  'You’re welcome', 'Nice to meet you', 'Good afternoon', 'See you tomorrow', 'Excuse me',
  'Welcome', 'Likewise', 'Goodbye', 'Have a good trip', 'Bless you', 'Enjoy your meal',
  'Pardon me', 'How’s it going?', 'See you around',
];

/** Phrases to say, each with the other phrases that would say the same thing. */
const TO_SAY = [
  { es: 'Buenos días', en: 'Good morning' }, { es: 'Buenas tardes', en: 'Good afternoon' },
  // "Good evening" is buenas tardes too, in the early evening; "good night" is not.
  { es: 'Buenas noches', en: 'Good night' }, { es: 'Muchas gracias', en: 'Thank you very much' },
  { es: 'Por favor', en: 'Please' }, { es: 'De nada', en: 'You’re welcome' },
  { es: 'Hasta luego', en: 'See you later', same: ['Nos vemos'] },
  { es: 'Mucho gusto', en: 'Nice to meet you', same: ['Encantado'] },
  { es: 'Lo siento', en: 'I’m sorry', same: ['Perdón'] }, { es: 'Con permiso', en: 'Excuse me', same: ['Perdón'] },
  { es: 'Bienvenido', en: 'Welcome' }, { es: 'Igualmente', en: 'Likewise' },
  { es: 'Adiós', en: 'Goodbye', same: ['Hasta luego', 'Nos vemos'] }, { es: 'Buen viaje', en: 'Have a good trip' },
  { es: 'Buen provecho', en: 'Enjoy your meal' }, { es: 'Hasta mañana', en: 'See you tomorrow' },
];
const PHRASE_DISTRACTORS = [
  'Buenos días', 'Buenas tardes', 'Buenas noches', 'Muchas gracias', 'Por favor',
  'De nada', 'Hasta luego', 'Mucho gusto', 'Lo siento', 'Hasta mañana',
  'Con permiso', 'Bienvenido', 'Igualmente', 'Adiós', 'Buen viaje', 'Buen provecho',
  'Nos vemos', 'Perdón', 'Salud', 'Encantado',
];

/** Idioms, with the glosses of the others that mean the same thing. */
const IDIOMS = [
  { es: 'Me da igual', en: 'It makes no difference to me', also: ['It amounts to the same thing'], why: 'Literally "it gives me the same."' },
  { es: 'Vale la pena', en: 'It is worth the trouble', why: 'Literally "it is worth the sorrow."' },
  { es: 'Da lo mismo', en: 'It amounts to the same thing', also: ['It makes no difference to me'], why: 'Used to say two options are equivalent.' },
  { es: 'No hay de qué', en: 'Think nothing of it', why: 'A warmer alternative to de nada.' },
  { es: 'Menos mal', en: 'Just as well', why: 'Literally "less bad" — relief that something turned out all right.' },
  { es: 'Ya veremos', en: 'We shall see', why: 'A way of deferring a decision.' },
  { es: 'Ni hablar', en: 'Out of the question', why: 'Literally "not even to speak of it."' },
  { es: 'Por supuesto', en: 'Naturally', why: 'A firm agreement, stronger than sí.' },
  { es: 'A lo mejor', en: 'Maybe', why: 'An idiom, despite looking like a superlative.' },
  { es: 'De vez en cuando', en: 'From time to time', why: 'A set phrase for occasional frequency.' },
  { es: 'En seguida', en: 'Right away', why: 'Used for something about to happen.' },
  { es: 'Sin falta', en: 'Without fail', why: 'A promise that something will happen.' },
];

/** Three distractors drawn from `list`, none of them the key or another right answer. */
const wrongOnes = (rng, list, key, alsoRight = []) => rng.shuffle(list
  .filter((x) => x !== key && !alsoRight.includes(x))).slice(0, 3);

const FAMILIES = {
  // ── ser and estar ────────────────────────────────────────────────────────
  es_ser_estar: [
    {
      d: 2,
      slots: { worker: WORKERS },
      p: (s) => `Choose the correct verb: ${s.worker.who} ___ ${s.worker.es}.`,
      c: () => ['es', 'está', 'son', 'estás'],
      a: () => 'es',
      r: (s) => `A profession is part of who someone is, so it takes ser: ${lower(s.worker.who)} es`
        + ` ${s.worker.es} (${s.worker.en}).`,
    },
    {
      d: 3,
      slots: { it: CONDITIONS },
      p: (s) => `Choose the correct verb: ${cap(article(s.it.noun))} ${s.it.noun.es} ___ `
        + `${s.it.noun.g === 'f' ? s.it.state.f : s.it.state.m}.`,
      c: () => ['está', 'es', 'son', 'estar'],
      a: () => 'está',
      r: (s) => `Being ${s.it.state.en} is a passing condition, and conditions take estar.`,
    },
    {
      d: 4,
      slots: { who: ['Nosotros', 'Nosotras'], country: COUNTRIES },
      p: (s) => `Choose the correct verb: ${s.who} ___ de ${s.country}.`,
      c: () => ['somos', 'estamos', 'son', 'están'],
      a: () => 'somos',
      r: (s) => `Origin takes ser: ${lower(s.who)} somos de ${s.country}.`,
    },
    {
      d: 5,
      slots: { place: PLACES },
      p: (s) => `Choose the correct verb: ¿Dónde ___ ${s.place.es}?`,
      c: () => ['está', 'es', 'son', 'estoy'],
      a: () => 'está',
      r: (s) => `The location of a thing takes estar, even when ${s.place.en} never moves.`,
    },
    {
      d: 6,
      slots: { event: EVENTS, time: TIMES },
      p: (s) => `Choose the correct verb: ${cap(s.event.es)} ___ ${s.time.es}.`,
      c: () => ['es', 'está', 'están', 'estar'],
      a: () => 'es',
      r: (s) => `The time of an event takes ser: ${s.event.es} es ${s.time.es}`
        + ` (${s.event.en} is ${s.time.en}).`,
    },
    {
      d: 8,
      // "comerlos" for a masculine fruit, "comerlas" for a feminine one: the
      // pronoun agrees with what it stands for.
      slots: { fruit: [{ es: 'los plátanos', en: 'the bananas', them: 'comerlos' },
        { es: 'las manzanas', en: 'the apples', them: 'comerlas' },
        { es: 'las peras', en: 'the pears', them: 'comerlas' },
        { es: 'los tomates', en: 'the tomatoes', them: 'comerlos' }] },
      p: (s) => `Choose the correct verb: ${cap(s.fruit.es)} ___ verdes; no puedes ${s.fruit.them} todavía.`,
      c: () => ['están', 'son', 'es', 'estamos'],
      a: () => 'están',
      r: (s) => `Estar marks the condition of being unripe; "son verdes" would mean ${s.fruit.en} are`
        + ' a green variety.',
    },
  ],

  // ── questions and negation ───────────────────────────────────────────────
  es_questions: [
    {
      d: 3,
      slots: { place: PLACES },
      p: (s) => `Choose the question word: ¿___ está ${s.place.es}?`,
      c: () => ['Dónde', 'Cuándo', 'Quién', 'Cuánto'],
      a: () => 'Dónde',
      r: (s) => `Dónde asks about location, which is what you want for ${s.place.en}.`,
    },
    {
      d: 4,
      slots: { thing: [{ es: 'el billete', en: 'the ticket' }, { es: 'la entrada', en: 'the entry ticket' },
        { es: 'el café', en: 'the coffee' }, { es: 'la maleta', en: 'the suitcase' }] },
      p: (s) => `Choose the question word: ¿___ cuesta ${s.thing.es}?`,
      c: () => ['Cuánto', 'Cómo', 'Cuál', 'Quién'],
      a: () => 'Cuánto',
      r: () => 'Cuánto asks how much.',
    },
    {
      // The reply is shown, because without it "¿Dónde es la reunión?" (where is
      // the meeting held) is as right as "¿Cuándo es la reunión?".
      d: 4,
      slots: { time: TIMES, event: EVENTS },
      p: (s) => `Choose the question word: ¿___ es ${s.event.es}? — Es ${s.time.es}.`,
      c: () => ['Cuándo', 'Dónde', 'Quién', 'Cuánto'],
      a: () => 'Cuándo',
      r: (s) => `Cuándo asks about time, and the reply gives one: ${s.event.es} es ${s.time.es}`
        + ` (${s.event.en} is ${s.time.en}).`,
    },
    {
      d: 5,
      slots: { thing: [{ es: 'nada', en: 'nothing' }, { es: 'nadie', en: 'nobody' }] },
      p: () => 'Which is the correct negative sentence?',
      c: (s) => [`No tengo ${s.thing.es === 'nadie' ? 'a nadie' : 'nada'}.`,
        'No tengo algo.', `Tengo ${s.thing.es === 'nadie' ? 'a nadie' : 'nada'}.`,
        `No ${s.thing.es} tengo.`],
      a: (s) => `No tengo ${s.thing.es === 'nadie' ? 'a nadie' : 'nada'}.`,
      r: (s) => `Spanish uses double negation: no plus ${s.thing.es}.`,
    },
    {
      d: 6,
      slots: { plural: ALL_PLURALS },
      p: (s) => `Choose the correct word: ¿___ de ${these(s.plural)} ${s.plural.es} prefieres?`,
      c: () => ['Cuál', 'Qué', 'Cómo', 'Quién'],
      a: () => 'Cuál',
      r: () => 'Cuál selects among known options; qué asks for a definition or an open answer.',
    },
    {
      d: 7,
      slots: { noun: NOUNS },
      p: (s) => `Which question asks "Whose ${s.noun.en} is this?"`,
      c: (s) => [`¿De quién es ${this1(s.noun)} ${s.noun.es}?`, `¿Quién es ${this1(s.noun)} ${s.noun.es}?`,
        `¿Cuál es ${this1(s.noun)} ${s.noun.es}?`, `¿Qué es de ${this1(s.noun)} ${s.noun.es}?`],
      a: (s) => `¿De quién es ${this1(s.noun)} ${s.noun.es}?`,
      r: () => 'Possession is asked with "de quién," literally "of whom."',
    },
    {
      // Each question word comes with the reply it gets, so only one of the
      // options asks for what the reply gives. Bare, "¿___ tiene libros?" took
      // quién, por qué, dónde and cuándo alike, and "¿Qué es libros?" was offered
      // as Spanish.
      d: 3,
      slots: { ask: ASKS, thing: ALL_PLURALS },
      p: (s) => `Choose the question word: ${s.ask.q(s.thing)}`,
      c: (s) => distinctChoices(s.ask.word(s.thing), s.ask.wrong(s.thing)),
      a: (s) => s.ask.word(s.thing),
      r: (s) => `${s.ask.word(s.thing)} asks about ${s.ask.what}, which is what the reply gives.`,
    },
    {
      d: 5,
      slots: { verb: ACTIVITIES, name: NAMES_ES },
      p: () => 'Which is the correct negative sentence?',
      c: (s) => [`${s.name} no ${s.verb.el} nunca.`, `${s.name} no ${s.verb.el} nada nunca no.`,
        `${s.name} ${s.verb.el} nunca.`, `No ${s.name} ${s.verb.el} nunca.`],
      a: (s) => `${s.name} no ${s.verb.el} nunca.`,
      r: () => 'The negative goes directly before the verb, and nunca after it —'
        + ' Spanish keeps both without cancelling them out.',
    },
  ],

  // ── object pronouns ──────────────────────────────────────────────────────
  es_object_pron: [
    {
      d: 4,
      slots: { take: TAKES },
      p: (s) => `Replace the object: ${s.take.verb.es} ${article(s.take.noun)} ${s.take.noun.es}.`
        + ` → ___ ${lower(s.take.verb.es)}.`,
      c: (s) => (s.take.noun.g === 'm' ? ['Lo', 'La', 'Le', 'Los'] : ['La', 'Lo', 'Le', 'Las']),
      a: (s) => (s.take.noun.g === 'm' ? 'Lo' : 'La'),
      r: (s) => `${cap(article(s.take.noun))} ${s.take.noun.es} is ${s.take.noun.g === 'm' ? 'masculine' : 'feminine'}`
        + ` singular, so the direct object pronoun is ${s.take.noun.g === 'm' ? 'lo' : 'la'}.`,
    },
    {
      d: 5,
      slots: { take: TAKES_PLURAL },
      p: (s) => `Replace the object: ${s.take.verb.es} ${theP(s.take.plural)} ${s.take.plural.es}.`
        + ` → ___ ${lower(s.take.verb.es)}.`,
      c: (s) => (s.take.plural.g === 'm' ? ['Los', 'Las', 'Les', 'Lo'] : ['Las', 'Los', 'Les', 'La']),
      a: (s) => cap(theP(s.take.plural)),
      r: (s) => `${cap(theP(s.take.plural))} ${s.take.plural.es} is`
        + ` ${s.take.plural.g === 'm' ? 'masculine' : 'feminine'} plural: ${theP(s.take.plural)}.`,
    },
    {
      d: 6,
      slots: { name: NAMES_ES, noun: NOUNS },
      p: (s) => `Choose the correct pronoun: ___ doy ${article(s.noun)} ${s.noun.es} a ${s.name}.`,
      c: () => ['Le', 'La', 'Lo', 'Les'],
      a: () => 'Le',
      r: (s) => `${s.name} is the indirect object — the one receiving it — and the singular indirect`
        + ' pronoun is le.',
    },
    {
      d: 8,
      slots: { verb: [{ inf: 'dar', gerund: 'dártelo', en: 'give it to you' },
        { inf: 'mandar', gerund: 'mandártelo', en: 'send it to you' },
        { inf: 'explicar', gerund: 'explicártelo', en: 'explain it to you' },
        { inf: 'traer', gerund: 'traértelo', en: 'bring it to you' }] },
      p: (s) => `Which is correct? (I want to ${s.verb.en}.)`,
      c: (s) => [`Quiero ${s.verb.gerund}.`, `Quiero te lo ${s.verb.inf}.`,
        `Te lo quiero ${s.verb.inf} lo.`, `Quiero ${s.verb.inf} te lo.`],
      a: (s) => `Quiero ${s.verb.gerund}.`,
      r: (s) => 'With an infinitive the pronouns attach to the end, indirect before direct:'
        + ` ${s.verb.gerund}.`,
    },
  ],

  // ── greetings and courtesy ───────────────────────────────────────────────
  es_greetings: [
    {
      d: 1,
      slots: {
        phrase: GREETINGS,
        others: (rng, filled) => wrongOnes(rng, GLOSS_DISTRACTORS, filled.phrase.en, filled.phrase.also),
      },
      p: (s) => `What does "${s.phrase.es}" mean?`,
      c: (s) => distinctChoices(s.phrase.en, s.others),
      a: (s) => s.phrase.en,
      r: (s) => s.phrase.why,
    },
    {
      d: 2,
      slots: {
        phrase: TO_SAY,
        others: (rng, filled) => wrongOnes(rng, PHRASE_DISTRACTORS, filled.phrase.es, filled.phrase.same),
      },
      p: (s) => `How do you say "${s.phrase.en}"?`,
      c: (s) => distinctChoices(s.phrase.es, s.others),
      a: (s) => s.phrase.es,
      r: (s) => `"${s.phrase.es}" is the standard way to say ${lower(s.phrase.en)}.`,
    },
    {
      d: 4,
      slots: {
        q: [
          { es: '¿Cómo estás?', right: 'Estoy bien, gracias.', why: 'The question asks how you are, which estar answers.' },
          { es: '¿Cómo te llamas?', right: 'Me llamo Ana.', why: 'Llamarse gives your name: me llamo.' },
          { es: '¿De dónde eres?', right: 'Soy de Perú.', why: 'Origin takes ser de.' },
          { es: '¿Cuántos años tienes?', right: 'Tengo veinte años.', why: 'Age uses tener, not ser.' },
        ],
      },
      p: (s) => `Which reply best answers "${s.q.es}"`,
      c: (s) => distinctChoices(s.q.right,
        ['Estoy bien, gracias.', 'Me llamo Ana.', 'Soy de Perú.', 'Tengo veinte años.']
          .filter((x) => x !== s.q.right)),
      a: (s) => s.q.right,
      r: (s) => s.q.why,
    },
    {
      // The situation decides the phrase, which is how greetings are actually
      // used — and it multiplies the bank by every setting worth naming. Eight in
      // the evening used to key buenas noches, but in Spain that is still buenas
      // tardes; ten at night is buenas noches everywhere.
      d: 3,
      slots: {
        when: [
          { at: 'at nine in the morning', say: 'Buenos días', why: 'Buenos días runs until midday.' },
          { at: 'just after lunch', say: 'Buenas tardes', why: 'Buenas tardes runs from midday to dusk.' },
          { at: 'at ten at night', say: 'Buenas noches', why: 'Buenas noches covers the night.' },
        ],
        where: ['a bakery', 'a pharmacy', 'the post office', 'a neighbour’s door',
          'the hotel desk', 'a taxi rank', 'the market', 'the clinic', 'a bookshop', 'the bank',
          'a café', 'the ticket office', 'the school gate', 'a museum',
          'the harbour office', 'a bus station', 'the pharmacy counter'],
      },
      p: (s) => `You arrive at ${s.where} ${s.when.at} and greet the person there. What do you say?`,
      c: (s) => distinctChoices(s.when.say,
        ['Buenos días', 'Buenas tardes', 'Buenas noches', 'Hasta luego', 'De nada']
          .filter((x) => x !== s.when.say)),
      a: (s) => s.when.say,
      r: (s) => s.when.why,
    },
    {
      d: 2,
      slots: {
        pair: [
          { said: 'Gracias', reply: 'De nada', why: 'De nada is the standard reply to thanks.' },
          { said: 'Mucho gusto', reply: 'Igualmente', why: 'Igualmente returns the pleasure at meeting.' },
          // "Igualmente" is also what you say back to a good wish you share, so it
          // is not offered as a wrong reply to these two.
          { said: 'Buen viaje', reply: 'Gracias', not: ['Igualmente'], why: 'A good wish is answered with thanks.' },
          { said: 'Lo siento', reply: 'No pasa nada', why: 'No pasa nada waves off an apology.' },
          { said: 'Hasta mañana', reply: 'Hasta mañana', why: 'A parting is returned in kind.' },
          { said: '¿Cómo estás?', reply: 'Bien, gracias', why: 'The question asks how you are.' },
          { said: 'Buen provecho', reply: 'Gracias', not: ['Igualmente'], why: 'You thank someone for wishing you a good meal.' },
        ],
      },
      p: (s) => `Someone says "${s.pair.said}". What is the natural reply?`,
      c: (s) => distinctChoices(s.pair.reply,
        ['De nada', 'Igualmente', 'Gracias', 'No pasa nada', 'Hasta mañana', 'Bien, gracias', 'Con permiso']
          .filter((x) => x !== s.pair.reply && !(s.pair.not || []).includes(x))),
      a: (s) => s.pair.reply,
      r: (s) => s.pair.why,
    },
    {
      // Greetings and set phrases only ran to difficulty 4, so the harder bands fell
      // back on the same few items. Idiom carries the same skill further up.
      d: 7,
      slots: {
        phrase: IDIOMS,
        others: (rng, filled) => wrongOnes(rng, IDIOMS.map((i) => i.en), filled.phrase.en, filled.phrase.also),
      },
      p: (s) => `What does "${s.phrase.es}" mean?`,
      c: (s) => distinctChoices(s.phrase.en, s.others),
      a: (s) => s.phrase.en,
      r: (s) => s.phrase.why,
    },
    {
      d: 5,
      slots: {
        who: ['a new manager', 'a doctor you have not met', 'an older neighbour', 'a police officer',
          'a customer', 'your friend’s grandmother', 'a hotel receptionist',
          'an official at the counter', 'a professor', 'a client on the phone', 'a landlord',
          'a shop owner you have just met', 'a nurse at reception', 'an examiner'],
        formal: [{ es: '¿Cómo está usted?', why: 'Usted is the formal second person.' },
          { es: '¿Cómo se llama usted?', why: 'The usted form is the formal way to ask a name.' }],
      },
      p: (s) => `You are speaking to ${s.who}. Which is the appropriate form?`,
      c: (s) => distinctChoices(s.formal.es,
        ['¿Cómo estás?', '¿Qué tal?', '¿Qué hay?', '¿Cómo te llamas?']),
      a: (s) => s.formal.es,
      r: (s) => `${s.formal.why} With ${s.who} the formal form is the safe choice.`,
    },
  ],

  // ── translation ─────────────────────────────────────────────────────────
  // (the greeting and question banks above are deliberately crossed with
  // situations as well as phrases, because "what does this phrase mean" alone is
  // a small domain and would repeat.)
  //
  // Every accepted answer is listed, including the other right ways of saying the
  // phrase ("en la mañana" beside "por la mañana", "cada día" beside "todos los
  // días"), because a type-in is graded by matching and only falls back to a model.
  es_translate: [
    {
      d: 2,
      slots: { doing: DOINGS },
      format: 'short_answer',
      p: (s) => `Translate into Spanish: I ${s.doing.verb.en} ${s.doing.where.en}.`,
      a: (s) => `${cap(s.doing.verb.yo)} ${s.doing.where.es}`,
      x: (s) => saying(s.doing.verb, 'yo', s.doing.where, ['Yo']),
      r: (s) => 'The subject pronoun is optional because the -o ending already marks "I":'
        + ` (Yo) ${s.doing.verb.yo} ${s.doing.where.es}.`,
    },
    {
      d: 3,
      slots: { doing: DOINGS },
      format: 'short_answer',
      p: (s) => `Translate into Spanish: We ${s.doing.verb.en} ${s.doing.where.en}.`,
      a: (s) => `${cap(s.doing.verb.nos)} ${s.doing.where.es}`,
      x: (s) => saying(s.doing.verb, 'nos', s.doing.where, ['Nosotros', 'Nosotras']),
      r: (s) => `${s.doing.verb.inf} is regular, so "we" is ${s.doing.verb.nos}.`,
    },
    {
      d: 4,
      slots: { doing: DOINGS, who: ['She', 'He'] },
      format: 'short_answer',
      p: (s) => `Translate into Spanish: ${s.who} ${s.doing.verb.enS || `${s.doing.verb.en}s`} ${s.doing.where.en}.`,
      a: (s) => `${s.who === 'She' ? 'Ella' : 'Él'} ${s.doing.verb.el} ${s.doing.where.es}`,
      x: (s) => saying(s.doing.verb, 'el', s.doing.where, [s.who === 'She' ? 'Ella' : 'Él']),
      r: (s) => `${s.doing.verb.inf} is regular: ${s.doing.verb.el}. The pronoun is optional once the ending is clear.`,
    },
    {
      d: 5,
      slots: { stuff: STUFF },
      format: 'short_answer',
      p: (s) => `Translate into Spanish: The ${s.stuff.plural.en} are ${s.stuff.place.en}.`,
      a: (s) => `${cap(theP(s.stuff.plural))} ${s.stuff.plural.es} están ${s.stuff.place.es}`,
      // "On" is en, sobre or encima de; a car is a coche, carro or auto.
      // Another word for the thing brings its own article: los cuadernos, las libretas.
      x: (s) => [s.stuff.plural, ...(s.stuff.plural.alt || [])].flatMap((what) => [s.stuff.place.es,
        ...s.stuff.place.also].map((where) => `${cap(theP(what))} ${what.es} están ${where}`)),
      r: (s) => `Location takes estar, and ${s.stuff.plural.es} is`
        + ` ${s.stuff.plural.g === 'm' ? 'masculine' : 'feminine'} plural: están.`,
    },
    {
      d: 6,
      slots: { verb: ACTIVITIES, when: [{ es: 'Ayer', en: 'Yesterday', also: [] },
        { es: 'Anoche', en: 'Last night', also: ['Ayer por la noche', 'Ayer en la noche'] }] },
      format: 'short_answer',
      p: (s) => `Translate into Spanish: ${s.when.en} I ${s.verb.enPast} a lot.`,
      a: (s) => `${s.when.es} ${s.verb.past} mucho`,
      x: (s) => [s.when.es, ...s.when.also].flatMap((when) => formsOf(s.verb, 'past')
        .flatMap((form) => [`${when} ${form} mucho`, `${when} yo ${form} mucho`])),
      r: (s) => `A completed past action takes the preterite: ${s.verb.past}.`,
    },
  ],
};

function cap(text) {
  return String(text).charAt(0).toUpperCase() + String(text).slice(1);
}

function lower(text) {
  return String(text).charAt(0).toLowerCase() + String(text).slice(1);
}

function article(noun) {
  return noun.g === 'm' ? 'el' : 'la';
}


// ── frames ───────────────────────────────────────────────────────────────
// The constant part of each family's question, with the varying words left as
// holes, so the shape filter can tell two families apart when they share a
// prompt. Hand-written for the same reason as english-families.js: deriving
// them collapses every family asking the same question onto one frame, which
// is the pair the picker exists to separate, and leaves fragments with a hole
// where the sentence should be. Families that already carried a frame keep
// it; only the ones with none are set here.
//
// Written before `module.exports`, because spread hands out copies and a block
// after it would assign onto objects nothing else can reach.
FAMILIES.es_ser_estar[0].frame = "Choose the correct verb: a person ___ a profession.";
FAMILIES.es_ser_estar[1].frame = "Choose the correct verb: a thing ___ a condition.";
FAMILIES.es_ser_estar[2].frame = "Choose the correct verb: a person ___ a country of origin.";
FAMILIES.es_ser_estar[3].frame = "Choose the correct verb: asking where a thing is.";
FAMILIES.es_ser_estar[4].frame = "Choose the correct verb: an event ___ a stated time.";
FAMILIES.es_ser_estar[5].frame = "Choose the correct verb: a thing ___ an adjective describing it.";
FAMILIES.es_questions[0].frame = "Choose the question word: asking where a thing is";
FAMILIES.es_questions[1].frame = "Choose the question word: asking what something costs";
FAMILIES.es_questions[2].frame = "Choose the question word: asking what something is";
FAMILIES.es_questions[3].frame = "Which is the correct negative sentence? (a verb phrase)";
FAMILIES.es_questions[4].frame = "Choose the correct word: asking which of several is preferred";
FAMILIES.es_questions[5].frame = "Which question asks whose something is?";
FAMILIES.es_questions[6].frame = "Choose the question word: asking who someone is";
FAMILIES.es_questions[7].frame = "Which is the correct negative sentence? (a sentence with a subject)";
FAMILIES.es_object_pron[0].frame = "Replace a singular direct object with a pronoun";
FAMILIES.es_object_pron[1].frame = "Replace a plural direct object with a pronoun";
FAMILIES.es_object_pron[2].frame = "Choose the correct pronoun: an indirect object before a name";
FAMILIES.es_object_pron[3].frame = "Which is correct? (a verb that takes an object)";
FAMILIES.es_greetings[0].frame = "What does this greeting mean?";
FAMILIES.es_greetings[1].frame = "How do you say this phrase?";
FAMILIES.es_greetings[2].frame = "Which reply best answers this question?";
FAMILIES.es_greetings[3].frame = "You walk into a place. What do you say?";
FAMILIES.es_greetings[4].frame = "Someone says this. What is the natural reply?";
FAMILIES.es_greetings[5].frame = "What does this farewell mean?";
FAMILIES.es_greetings[6].frame = "You are speaking to someone. Which is the appropriate form?";
FAMILIES.es_translate[0].frame = "Translate into Spanish: a first-person statement with two clauses";
FAMILIES.es_translate[1].frame = "Translate into Spanish: a first-person plural statement with two clauses";
FAMILIES.es_translate[2].frame = "Translate into Spanish: a third-person statement with two clauses";
FAMILIES.es_translate[3].frame = "Translate into Spanish: a statement with a definite subject";
FAMILIES.es_translate[4].frame = "Translate into Spanish: a habitual statement with a pronoun";

module.exports = { FAMILIES: spread(FAMILIES) };
