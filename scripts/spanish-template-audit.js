/**
 * Render every built-in Spanish question and check what comes out.
 *
 *   node scripts/spanish-template-audit.js                audit; exits 1 on any flag
 *   node scripts/spanish-template-audit.js --skill=es_gender      one skill only
 *   node scripts/spanish-template-audit.js --examples=5   more examples per problem
 *   node scripts/spanish-template-audit.js --show=2       also print renderings per source
 *   node scripts/spanish-template-audit.js --seeds=300    seeds per difficulty for generators
 *   node scripts/spanish-template-audit.js --content=DIR  read the content files from DIR
 *        instead of content/ (to audit a backup and see what a fix changed)
 *
 * The Spanish bank is four kinds of generator: the procedural ones in
 * spanish-items.js (conjugation, gender, numbers, agreement), the authored pools
 * beside them, the slot families in spanish-families.js, and the alternative
 * question shapes in spanish-shapes.js. Each is internally consistent — the key is
 * computed by the same table that built the question — and that is exactly why a
 * wrong table, a missing spelling change or a profession in the wrong gender comes
 * out wrong in every rendering and nobody notices. So this does not trust the
 * generators. It reads the rendered prompt, works the question again from its own
 * tables, and compares. A prompt no verifier recognises is itself a flag, so a new
 * template cannot slip in unchecked.
 *
 * Its own knowledge, written independently of content/:
 *   - a noun lexicon: gender, plural, English glosses, and the other Spanish words
 *     that are just as right for the English one (car: coche, carro, auto)
 *   - a conjugator: regular endings for all six persons in four tenses, the -car,
 *     -gar and -zar spelling changes, and full tables for ser, estar, ir, tener,
 *     hacer, poder and andar
 *   - a number speller (with veintidós, veintitrés, veintiséis, dieciséis)
 *   - ser/estar rules by what the predicate is (profession, origin, owner, time of
 *     an event, location, a passing condition) and the adjectives whose meaning
 *     changes with the verb, so a sentence with two right answers is caught
 *   - greeting and idiom glosses, natural replies, and question words with the
 *     replies that decide them
 *   - which adjectives and states make sense on which nouns
 *
 * Checked on every item:
 *   - debris: undefined, NaN, null, [object, ${, doubled spaces, empty choices
 *   - multiple choice: the key among the choices, no duplicate choices, at least
 *     three distinct, and no distractor that is also right (tú/usted, regional
 *     variants, synonyms, the other gender of an invariant adjective)
 *   - the keyed answer re-derived by the audit's own rules
 *   - Spanish mechanics in every trusted text: article and demonstrative agreement
 *     with the noun after them, adjective agreement, ¿…? and ¡…! pairs, al and del
 *     contractions, words missing their accent or ñ
 *   - English mechanics in the prompt: verb forms such as "studys"
 *   - grading, through services/grading.js: the key and every accepted answer
 *     grade correct, the key typed without accents grades correct, every other
 *     right answer the audit knows grades correct, and the wrong answers the audit
 *     knows (another person's form, the bare noun for an article question, a form
 *     that differs only by an accent) do not
 *   - wiring: every shape is attached to a skill that exists
 *
 * "Trusted" text is what a learner is told is right: the prompt (unless it shows
 * an error on purpose), the key, the accepted answers, the rationale, and the
 * prompt's sentence with the key filled in. Distractors are wrong on purpose and
 * are held only to debris and accent checks.
 *
 * No model is called and nothing is written.
 */
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';

const path = require('path');
const { grade, normalize } = require('../services/grading');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = arg('skill', null);
const EXAMPLES = Number(arg('examples', 2));
const SHOW = Number(arg('show', 0));
const SEEDS = Number(arg('seeds', 250));
const CONTENT = path.resolve(arg('content', path.join(__dirname, '..', 'content')));
const load = (name) => require(path.join(CONTENT, name));

/** Families with at most this many slot combinations are rendered exhaustively. */
const ENUMERATE_UP_TO = 5000;
/** Larger ones, and ones with drawn slots, are sampled this many times. */
const SAMPLES = 1500;

const { makeRng } = load('rng');
const { fillSlots } = load('pool');
const ITEMS = load('spanish-items');
const { FAMILIES } = load('spanish-families');
const SHAPES = ITEMS.SHAPES || load('spanish-shapes');
const LEXICON = ITEMS.LEXICON || {
  NOUNS: ITEMS.NOUNS, VERBS: ITEMS.VERBS, ADJECTIVES: ITEMS.ADJECTIVES, numToSpanish: ITEMS.numToSpanish, conjugate: ITEMS.conjugate,
};

// ═══ the audit's own knowledge ═══════════════════════════════════════════════
const bare = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const lc = (s) => String(s).toLowerCase();
const same = (a, b) => normalize(a) === normalize(b);
const glossKey = (s) => lc(s).replace(/[‘’]/g, "'").trim();
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ── nouns ───────────────────────────────────────────────────────────────────
/**
 * es: [gender, plural, English glosses]. Genders checked against the RAE; the
 * glosses are every English sense a learner could fairly give, so a distractor
 * that is one of them is a second right answer.
 */
const NOUN_DATA = {
  libro: ['m', 'libros', ['book']], mesa: ['f', 'mesas', ['table']], perro: ['m', 'perros', ['dog']],
  casa: ['f', 'casas', ['house', 'home']], ciudad: ['f', 'ciudades', ['city', 'town']],
  problema: ['m', 'problemas', ['problem']], mano: ['f', 'manos', ['hand']], día: ['m', 'días', ['day']],
  leche: ['f', 'leches', ['milk']], papel: ['m', 'papeles', ['paper', 'role']], noche: ['f', 'noches', ['night']],
  mapa: ['m', 'mapas', ['map']], clase: ['f', 'clases', ['class', 'classroom', 'kind']],
  reloj: ['m', 'relojes', ['clock', 'watch']], ventana: ['f', 'ventanas', ['window']],
  coche: ['m', 'coches', ['car']], flor: ['f', 'flores', ['flower']], lápiz: ['m', 'lápices', ['pencil']],
  silla: ['f', 'sillas', ['chair']], cuaderno: ['m', 'cuadernos', ['notebook', 'exercise book']],
  carta: ['f', 'cartas', ['letter', 'menu', 'card']], sombrero: ['m', 'sombreros', ['hat']],
  llave: ['f', 'llaves', ['key', 'tap', 'wrench']], plato: ['m', 'platos', ['plate', 'dish']],
  maleta: ['f', 'maletas', ['suitcase']], zapato: ['m', 'zapatos', ['shoe']], camisa: ['f', 'camisas', ['shirt']],
  queso: ['m', 'quesos', ['cheese']], manzana: ['f', 'manzanas', ['apple']], pan: ['m', 'panes', ['bread']],
  puerta: ['f', 'puertas', ['door']], jardín: ['m', 'jardines', ['garden']],
  cocina: ['f', 'cocinas', ['kitchen', 'cuisine', 'stove']], tren: ['m', 'trenes', ['train']],
  playa: ['f', 'playas', ['beach']], campo: ['m', 'campos', ['field', 'countryside']],
  tienda: ['f', 'tiendas', ['shop', 'store', 'tent']], río: ['m', 'ríos', ['river']], calle: ['f', 'calles', ['street']],
  pueblo: ['m', 'pueblos', ['village', 'town', 'people']], escuela: ['f', 'escuelas', ['school']],
  cielo: ['m', 'cielos', ['sky', 'heaven']], nube: ['f', 'nubes', ['cloud']], jugo: ['m', 'jugos', ['juice']],
  sopa: ['f', 'sopas', ['soup']], huevo: ['m', 'huevos', ['egg']], cuchara: ['f', 'cucharas', ['spoon']],
  cuchillo: ['m', 'cuchillos', ['knife']], toalla: ['f', 'toallas', ['towel']], espejo: ['m', 'espejos', ['mirror']],
  cama: ['f', 'camas', ['bed']], techo: ['m', 'techos', ['roof', 'ceiling']], pared: ['f', 'paredes', ['wall']],
  suelo: ['m', 'suelos', ['floor', 'ground', 'soil']], bolsa: ['f', 'bolsas', ['bag']],
  dinero: ['m', 'dineros', ['money']], carne: ['f', 'carnes', ['meat']], pescado: ['m', 'pescados', ['fish']],
  sal: ['f', 'sales', ['salt']], arroz: ['m', 'arroces', ['rice']],
  // Known so that a question asking for its article is caught: el or la azúcar.
  azúcar: ['m', 'azúcares', ['sugar']],
  // Nouns the sentence families use.
  biblioteca: ['f', 'bibliotecas', ['library']], mercado: ['m', 'mercados', ['market']],
  estación: ['f', 'estaciones', ['station']], hospital: ['m', 'hospitales', ['hospital']],
  farmacia: ['f', 'farmacias', ['pharmacy']], museo: ['m', 'museos', ['museum']],
  panadería: ['f', 'panaderías', ['bakery']], banco: ['m', 'bancos', ['bank', 'bench']],
  correo: ['m', 'correos', ['post office', 'mail']], plaza: ['f', 'plazas', ['square']], cine: ['m', 'cines', ['cinema']],
  aeropuerto: ['m', 'aeropuertos', ['airport']], iglesia: ['f', 'iglesias', ['church']],
  parque: ['m', 'parques', ['park']], puerto: ['m', 'puertos', ['harbour', 'port']],
  reunión: ['f', 'reuniones', ['meeting']], concierto: ['m', 'conciertos', ['concert']],
  examen: ['m', 'exámenes', ['exam']], fiesta: ['f', 'fiestas', ['party']], partido: ['m', 'partidos', ['match', 'game']],
  billete: ['m', 'billetes', ['ticket']], entrada: ['f', 'entradas', ['entry ticket', 'ticket', 'entrance']],
  café: ['m', 'cafés', ['coffee', 'café']], oficina: ['f', 'oficinas', ['office']], baño: ['m', 'baños', ['bathroom']],
  plátano: ['m', 'plátanos', ['banana']], pera: ['f', 'peras', ['pear']], tomate: ['m', 'tomates', ['tomato']],
  padre: ['m', 'padres', ['father']], hermana: ['f', 'hermanas', ['sister']], abuelo: ['m', 'abuelos', ['grandfather']],
  amigo: ['m', 'amigos', ['friend']], amiga: ['f', 'amigas', ['friend']], mañana: ['f', 'mañanas', ['morning']],
  hora: ['f', 'horas', ['hour']], vaso: ['m', 'vasos', ['glass']],
  // The other words the bank accepts for an English one.
  carro: ['m', 'carros', ['car']], auto: ['m', 'autos', ['car']], automóvil: ['m', 'automóviles', ['car']],
  libreta: ['f', 'libretas', ['notebook']], letra: ['f', 'letras', ['letter']], gorro: ['m', 'gorros', ['hat']],
  valija: ['f', 'valijas', ['suitcase']], aldea: ['f', 'aldeas', ['village']], colegio: ['m', 'colegios', ['school']],
  zumo: ['m', 'zumos', ['juice']], tejado: ['m', 'tejados', ['roof']], muro: ['m', 'muros', ['wall']],
  piso: ['m', 'pisos', ['floor', 'flat']], bolso: ['m', 'bolsos', ['bag', 'handbag']], plata: ['f', 'platas', ['money', 'silver']],
  pez: ['m', 'peces', ['fish']],
};
/** Nouns the gender questions must not use: both articles are correct. */
const BOTH_GENDERS = ['azúcar', 'mar', 'arte', 'radio', 'internet'];
/** Nobody counts these; a plural article question on them is not real Spanish. */
const MASS = ['leche', 'dinero', 'sal', 'arroz'];
/** English words for which more than one Spanish noun is right. */
const SPANISH_FOR = {
  car: ['coche', 'carro', 'auto', 'automóvil'], juice: ['jugo', 'zumo'], notebook: ['cuaderno', 'libreta'],
  letter: ['carta', 'letra'], hat: ['sombrero', 'gorro'], suitcase: ['maleta', 'valija'], village: ['pueblo', 'aldea'],
  school: ['escuela', 'colegio'], roof: ['techo', 'tejado'], wall: ['pared', 'muro'], floor: ['suelo', 'piso'],
  bag: ['bolsa', 'bolso'], money: ['dinero', 'plata'], fish: ['pescado', 'pez'],
};
const FOOD = ['leche', 'queso', 'manzana', 'pan', 'jugo', 'sopa', 'huevo', 'carne', 'pescado', 'arroz'];
/** Arguable either way as "something you eat or drink": salt, a plate (also "a dish"), cuisine. */
const FOOD_ARGUABLE = ['sal', 'plato', 'cocina'];
/** Things that are not words in Spanish, checked. */
const NOT_SPANISH = ['xiloflore'];

const NOUN = new Map();      // any form -> { lemma, g, n }
for (const [lemma, [g, pl]] of Object.entries(NOUN_DATA)) {
  NOUN.set(lemma, { lemma, g, n: 's' });
  NOUN.set(pl, { lemma, g, n: 'p' });
}
const glossesOf = (lemma) => (NOUN_DATA[lemma] ? NOUN_DATA[lemma][2] : []);

/** Everyday countable objects: what blanco, nuevo, rojo, pequeño, grande and bonito describe. */
const OBJECTS = ['libro', 'mesa', 'casa', 'mapa', 'reloj', 'ventana', 'coche', 'lápiz', 'silla', 'cuaderno', 'carta',
  'sombrero', 'llave', 'plato', 'maleta', 'zapato', 'camisa', 'puerta', 'tren', 'cuchara', 'cuchillo', 'toalla',
  'espejo', 'cama', 'bolsa'];

// ── adjectives ──────────────────────────────────────────────────────────────
/** lemma: [feminine, English, nouns it can sensibly describe]. */
const ADJ_DATA = {
  blanco: ['blanca', 'white', OBJECTS], alto: ['alta', 'tall', ['mesa', 'silla', 'casa', 'puerta', 'ventana', 'cama', 'sombrero', 'espejo', 'pared', 'techo']],
  pequeño: ['pequeña', 'small', OBJECTS], nuevo: ['nueva', 'new', OBJECTS], rojo: ['roja', 'red', OBJECTS],
  bonito: ['bonita', 'pretty', OBJECTS], grande: ['grande', 'big', OBJECTS],
  interesante: ['interesante', 'interesting', ['libro', 'mapa', 'carta', 'ciudad', 'problema', 'clase', 'día', 'noche', 'pueblo']],
  cansado: ['cansada', 'tired', ['perro']],
  // States that take estar, with what they can describe.
  abierto: ['abierta', 'open', ['libro', 'casa', 'coche', 'ventana', 'cuaderno', 'carta', 'maleta', 'puerta', 'tienda', 'biblioteca']],
  cerrado: ['cerrada', 'closed', ['libro', 'casa', 'coche', 'ventana', 'cuaderno', 'carta', 'maleta', 'puerta', 'tienda', 'biblioteca']],
  sucio: ['sucia', 'dirty', [...OBJECTS, 'suelo', 'pared']], limpio: ['limpia', 'clean', [...OBJECTS, 'suelo', 'pared']],
  roto: ['rota', 'broken', [...OBJECTS.filter((n) => !['casa', 'tren'].includes(n)), 'papel']],
  lleno: ['llena', 'full', ['casa', 'coche', 'plato', 'maleta', 'bolsa', 'vaso', 'tren']],
  verde: ['verde', 'green', null], caliente: ['caliente', 'hot', null], frío: ['fría', 'cold', null],
  contento: ['contenta', 'happy', null], médico: ['médica', 'doctor', null],
  difícil: ['difícil', 'difficult', null], fácil: ['fácil', 'easy', null],
};
const ADJ = new Map();       // form -> { lemma, g, n } (g null = either)
for (const [m, [f]] of Object.entries(ADJ_DATA)) {
  const pl = (w) => (/[aeiouáéó]$/.test(w) ? `${w}s` : `${w}es`);
  if (m === f) {
    ADJ.set(m, { lemma: m, g: null, n: 's' });
    ADJ.set(pl(m), { lemma: m, g: null, n: 'p' });
  } else {
    ADJ.set(m, { lemma: m, g: 'm', n: 's' });
    ADJ.set(f, { lemma: m, g: 'f', n: 's' });
    ADJ.set(pl(m), { lemma: m, g: 'm', n: 'p' });
    ADJ.set(pl(f), { lemma: m, g: 'f', n: 'p' });
  }
}
const adjForm = (lemma, g, n) => {
  const [f] = ADJ_DATA[lemma];
  const base = g === 'f' ? f : lemma;
  return n === 'p' ? (/[aeiouáéó]$/.test(base) ? `${base}s` : `${base}es`) : base;
};
/**
 * Adjectives that mean something different with ser and with estar, or that take
 * either for the same meaning in some contexts: a sentence with one of these has
 * two right answers unless something else decides it.
 */
const SER_OR_ESTAR = ['caliente', 'frío', 'cansado', 'aburrido', 'listo', 'malo', 'bueno', 'rico', 'enfermo',
  'difícil', 'fácil', 'contento', 'vivo', 'orgulloso', 'seguro', 'callado'];
const ESTAR_STATES = ['abierto', 'cerrado', 'sucio', 'limpio', 'roto', 'lleno'];

// ── articles and demonstratives ─────────────────────────────────────────────
const DETERMINER = {
  el: ['m', 's'], la: ['f', 's'], los: ['m', 'p'], las: ['f', 'p'], un: ['m', 's'], una: ['f', 's'],
  unos: ['m', 'p'], unas: ['f', 'p'], este: ['m', 's'], esta: ['f', 's'], estos: ['m', 'p'], estas: ['f', 'p'],
  del: ['m', 's'], al: ['m', 's'],
};
const DEFINITE = { m: { s: 'el', p: 'los' }, f: { s: 'la', p: 'las' } };
const INDEFINITE = { m: { s: 'un', p: 'unos' }, f: { s: 'una', p: 'unas' } };

// ── verbs ───────────────────────────────────────────────────────────────────
/** Persons: 0 yo, 1 tú, 2 él/ella/usted, 3 nosotros, 4 vosotros, 5 ellos/ellas/ustedes. */
const PERSON_OF = {
  yo: 0, tú: 1, él: 2, ella: 2, usted: 2, nosotros: 3, nosotras: 3, vosotros: 4, vosotras: 4,
  ellos: 5, ellas: 5, ustedes: 5,
};
/** The generators' five slots skip vosotros. */
const SLOT_PERSON = [0, 1, 2, 3, 5];
const REGULAR = {
  present: { ar: ['o', 'as', 'a', 'amos', 'áis', 'an'], er: ['o', 'es', 'e', 'emos', 'éis', 'en'], ir: ['o', 'es', 'e', 'imos', 'ís', 'en'] },
  preterite: { ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'], er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'], ir: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'] },
  imperfect: { ar: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'], er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'], ir: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'] },
  subjunctive: { ar: ['e', 'es', 'e', 'emos', 'éis', 'en'], er: ['a', 'as', 'a', 'amos', 'áis', 'an'], ir: ['a', 'as', 'a', 'amos', 'áis', 'an'] },
};
const IRREGULAR = {
  ser: { present: 'soy eres es somos sois son', preterite: 'fui fuiste fue fuimos fuisteis fueron', imperfect: 'era eras era éramos erais eran', subjunctive: 'sea seas sea seamos seáis sean' },
  estar: { present: 'estoy estás está estamos estáis están', preterite: 'estuve estuviste estuvo estuvimos estuvisteis estuvieron', imperfect: 'estaba estabas estaba estábamos estabais estaban', subjunctive: 'esté estés esté estemos estéis estén' },
  ir: { present: 'voy vas va vamos vais van', preterite: 'fui fuiste fue fuimos fuisteis fueron', imperfect: 'iba ibas iba íbamos ibais iban', subjunctive: 'vaya vayas vaya vayamos vayáis vayan' },
  tener: { present: 'tengo tienes tiene tenemos tenéis tienen', preterite: 'tuve tuviste tuvo tuvimos tuvisteis tuvieron', imperfect: 'tenía tenías tenía teníamos teníais tenían', subjunctive: 'tenga tengas tenga tengamos tengáis tengan' },
  hacer: { present: 'hago haces hace hacemos hacéis hacen', preterite: 'hice hiciste hizo hicimos hicisteis hicieron', imperfect: 'hacía hacías hacía hacíamos hacíais hacían', subjunctive: 'haga hagas haga hagamos hagáis hagan' },
  poder: { present: 'puedo puedes puede podemos podéis pueden', preterite: 'pude pudiste pudo pudimos pudisteis pudieron', imperfect: 'podía podías podía podíamos podíais podían', subjunctive: 'pueda puedas pueda podamos podáis puedan' },
  andar: { preterite: 'anduve anduviste anduvo anduvimos anduvisteis anduvieron' },
};
/** Every verb the bank may use, with its English glosses. Unlisted verbs are flagged. */
const VERB_EN = {
  hablar: ['to speak', 'to talk'], trabajar: ['to work'], estudiar: ['to study'], caminar: ['to walk'], cocinar: ['to cook'],
  escuchar: ['to listen', 'to listen to', 'to hear'], comer: ['to eat'], beber: ['to drink'], aprender: ['to learn'],
  correr: ['to run'], vivir: ['to live'], escribir: ['to write'], abrir: ['to open'], recibir: ['to receive', 'to get'],
  cantar: ['to sing'], bailar: ['to dance'], limpiar: ['to clean'], comprar: ['to buy'],
  llevar: ['to carry', 'to take', 'to wear'], esperar: ['to wait', 'to hope', 'to expect'], preguntar: ['to ask'],
  lavar: ['to wash'], mirar: ['to watch', 'to look at', 'to look'], nadar: ['to swim'], vender: ['to sell'],
  romper: ['to break'], barrer: ['to sweep'], compartir: ['to share'], subir: ['to go up', 'to climb', 'to raise'],
  añadir: ['to add'], decidir: ['to decide'], pintar: ['to paint'], buscar: ['to look for', 'to search for'],
  enseñar: ['to teach', 'to show'], ayudar: ['to help'], llamar: ['to call'], usar: ['to use'], viajar: ['to travel'],
  entrar: ['to enter', 'to go in'], deber: ['to owe', 'must'], temer: ['to fear'], coser: ['to sew'],
  cumplir: ['to fulfil', 'to fulfill', 'to carry out'], partir: ['to depart', 'to leave', 'to split'],
  unir: ['to join', 'to unite'], permitir: ['to allow', 'to permit'], tomar: ['to take', 'to drink'], andar: ['to walk'],
  dar: ['to give'], mandar: ['to send'], explicar: ['to explain'], traer: ['to bring'],
  ser: ['to be'], estar: ['to be'], ir: ['to go'], tener: ['to have'], hacer: ['to do', 'to make'], poder: ['to be able to', 'can'],
};
/** Regular in these four tenses apart from spelling. Checked one by one. */
const REGULAR_VERBS = new Set(Object.keys(VERB_EN).filter((v) => !['ser', 'estar', 'ir', 'tener', 'hacer', 'poder', 'dar', 'traer'].includes(v)));

function conj(inf, tense, person) {
  const irr = IRREGULAR[inf] && IRREGULAR[inf][tense];
  if (irr) return irr.split(' ')[person];
  if (!REGULAR_VERBS.has(inf)) return null;
  const type = inf.slice(-2);
  let stem = inf.slice(0, -2);
  const ending = REGULAR[tense][type][person];
  // c, g and z keep their sound before e by changing spelling: busqué, pagué, empecé.
  if (type === 'ar' && /^[eé]/.test(ending)) {
    if (/c$/.test(stem)) stem = `${stem.slice(0, -1)}qu`;
    else if (/g$/.test(stem)) stem = `${stem}u`;
    else if (/z$/.test(stem)) stem = `${stem.slice(0, -1)}c`;
  }
  return stem + ending;
}
const TENSES = ['present', 'preterite', 'imperfect', 'subjunctive'];
const allForms = (inf) => TENSES.flatMap((t) => [0, 1, 2, 3, 4, 5].map((p) => conj(inf, t, p))).filter(Boolean);
const TENSE_LABEL = { 'present tense': 'present', present: 'present', preterite: 'preterite', imperfect: 'imperfect', 'present subjunctive': 'subjunctive' };
/** Subject labels a shape may offer, and the persons each one covers. */
const SUBJECT_LABEL = {
  yo: [0], tú: [1], 'él/ella/usted': [2], 'él or ella': [2], nosotros: [3], 'ellos/ellas/ustedes': [5],
  'vosotros or ustedes': [4, 5],
};

// ── numbers ─────────────────────────────────────────────────────────────────
const SMALL_NUMBERS = 'cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve'.split(' ');
const DECADES = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa' };
function spell(n) {
  if (n === 100) return 'cien';
  if (n < 30) return SMALL_NUMBERS[n];
  const d = Math.floor(n / 10);
  return n % 10 ? `${DECADES[d]} y ${SMALL_NUMBERS[n % 10]}` : DECADES[d];
}
const UNSPELL = new Map(Array.from({ length: 101 }, (_, n) => [spell(n), n]));

// ── ser and estar ───────────────────────────────────────────────────────────
const SER = IRREGULAR.ser.present.split(' ');
const ESTAR = IRREGULAR.estar.present.split(' ');
const PROFESSION = {
  profesor: 'm', profesora: 'f', enfermero: 'm', enfermera: 'f', ingeniero: 'm', ingeniera: 'f', cocinero: 'm', cocinera: 'f',
  abogado: 'm', abogada: 'f', panadero: 'm', panadera: 'f', dentista: null, piloto: null, carpintero: 'm', carpintera: 'f',
  periodista: null, contador: 'm', contadora: 'f', mecánico: 'm', mecánica: 'f', bibliotecario: 'm', bibliotecaria: 'f',
  electricista: null, veterinario: 'm', veterinaria: 'f', arquitecto: 'm', arquitecta: 'f', farmacéutico: 'm',
  farmacéutica: 'f', traductor: 'm', traductora: 'f', médico: 'm', médica: 'f',
};
const COUNTRY = ['México', 'Perú', 'Chile', 'Colombia', 'España', 'Guatemala', 'Uruguay', 'Panamá', 'Argentina', 'Bolivia',
  'Ecuador', 'Honduras', 'Paraguay', 'Costa Rica', 'Nicaragua', 'Cuba', 'Venezuela', 'El Salvador', 'República Dominicana',
  'Puerto Rico'];
const EVENT = ['reunión', 'concierto', 'clase', 'examen', 'fiesta', 'partido'];
const TIME_PHRASE = /^(a las (una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|a mediodía|mañana|hoy|el (lunes|martes|miércoles|jueves|viernes|sábado|domingo))$/;
const NAMES = { María: 'f', Carlos: 'm', Lucía: 'f', Javier: 'm', Elena: 'f', Diego: 'm', Rosa: 'f', Andrés: 'm', Ana: 'f' };

/** Gender, number and person of a subject: a pronoun, a name, or a noun phrase. */
function subjectOf(text) {
  const t = text.trim();
  const low = lc(t);
  if (PERSON_OF[low] != null) {
    const p = PERSON_OF[low];
    const g = /as$|^ella$/.test(low) ? 'f' : (/^(yo|tú|usted|ustedes)$/.test(low) ? null : 'm');
    return { person: p, g, n: [3, 4, 5].includes(p) ? 'p' : 's' };
  }
  if (NAMES[t]) return { person: 2, g: NAMES[t], n: 's' };
  const m = low.match(/^(el|la|los|las|este|esta|estos|estas|mi|mis|tu|tus|su|sus) (\S+)$/);
  if (m && NOUN.has(m[2])) {
    const noun = NOUN.get(m[2]);
    return { person: noun.n === 'p' ? 5 : 2, g: noun.g, n: noun.n, noun: noun.lemma, det: m[1] };
  }
  return null;
}

/**
 * What a sentence with "___" for ser/estar takes. Returns { verb, person, why } or
 * { ambiguous } or { error } or null when the audit does not know the pattern.
 */
function serOrEstar(sentence) {
  let m = sentence.match(/^¿Dónde ___ (.+)\?$/);
  if (m) {
    const subj = subjectOf(m[1]);
    if (!subj) return null;
    if (EVENT.includes(subj.noun)) return { ambiguous: `where an event is held takes ser, but "está" is common too: ${m[1]}` };
    return { verb: 'estar', person: subj.person, why: 'location' };
  }
  m = sentence.match(/^(.+?) ___ (.+?)\.?$/);
  if (!m) return null;
  const subj = subjectOf(m[1]);
  if (!subj) return null;
  const pred = m[2].replace(/^muy /, '');
  const out = (verb, why, extra = {}) => ({ verb, person: subj.person, why, ...extra });
  if (Object.prototype.hasOwnProperty.call(PROFESSION, pred)) {
    const g = PROFESSION[pred];
    if (g && subj.g && g !== subj.g) return { error: `"${m[1]}" with the ${g === 'f' ? 'feminine' : 'masculine'} "${pred}"` };
    return out('ser', 'profession');
  }
  let p;
  if ((p = pred.match(/^de (.+)$/))) {
    if (COUNTRY.includes(p[1])) return out('ser', 'origin');
    if (/^(mi|mis|tu|tus|su|sus) /.test(p[1])) return out('ser', 'possession');
    return null;
  }
  if (TIME_PHRASE.test(pred)) return EVENT.includes(subj.noun) ? out('ser', 'time') : null;
  if (/^en /.test(pred)) {
    if (EVENT.includes(subj.noun)) return { ambiguous: `where an event is held: ${sentence}` };
    return out('estar', 'location');
  }
  if ((p = pred.match(/^verdes; no puedes (comerlos|comerlas) todavía$/))) {
    const want = subj.g === 'f' ? 'comerlas' : 'comerlos';
    if (p[1] !== want) return { error: `"${p[1]}" for ${m[1]}: the pronoun should be "${want.slice(5)}"` };
    return out('estar', 'condition');
  }
  if (ADJ.has(pred)) {
    const a = ADJ.get(pred);
    if ((a.g && subj.g && a.g !== subj.g) || a.n !== subj.n) return { error: `"${pred}" does not agree with "${m[1]}"` };
    if (SER_OR_ESTAR.includes(a.lemma)) return { ambiguous: `"${a.lemma}" takes ser or estar with different meanings: ${sentence}` };
    if (subj.noun && ADJ_DATA[a.lemma][2] && !ADJ_DATA[a.lemma][2].includes(subj.noun)) {
      return { nonsense: `"${m[1]} … ${pred}" is grammatical and means nothing` };
    }
    if (ESTAR_STATES.includes(a.lemma)) return out('estar', 'condition');
    return null;
  }
  return null;
}
const SER_ESTAR_REASON = {
  profession: /profession|who someone is/, origin: /origin/, possession: /belongs|possession|owner/,
  time: /time of an event/, location: /location|where someone is|where .* is/, condition: /condition|state/,
};

// ── greetings and phrases ───────────────────────────────────────────────────
/** Spanish phrase -> every English gloss a learner could fairly give. */
const PHRASE = {
  'Buenos días': ['Good morning'], 'Buenas tardes': ['Good afternoon', 'Good evening'],
  'Buenas noches': ['Good evening', 'Good night'], 'Hasta luego': ['See you later', 'See you around', 'Goodbye', 'Bye'],
  'Muchas gracias': ['Thank you very much', 'Thank you', 'Thanks a lot'], Gracias: ['Thank you', 'Thanks'],
  'De nada': ["You're welcome"], 'Mucho gusto': ['Nice to meet you', 'Delighted to meet you', 'Pleased to meet you'],
  'Por favor': ['Please'], 'Lo siento': ["I'm sorry", 'Sorry'], 'Hasta mañana': ['See you tomorrow'],
  'Con permiso': ['Excuse me', 'Pardon me'], Perdón: ['Pardon me', 'Excuse me', "I'm sorry", 'Sorry'],
  Bienvenido: ['Welcome'], Igualmente: ['Likewise', 'Same to you'],
  'Nos vemos': ['See you around', 'See you later', 'See you', 'Goodbye'], Adiós: ['Goodbye', 'Bye'],
  'Buen viaje': ['Have a good trip'], 'Que te vaya bien': ['Hope it goes well for you'], '¿Qué tal?': ["How's it going?"],
  Encantado: ['Delighted to meet you', 'Nice to meet you', 'Pleased to meet you'], Salud: ['Bless you', 'Cheers'],
  'Buen provecho': ['Enjoy your meal'], 'Feliz cumpleaños': ['Happy birthday'], 'Buena suerte': ['Good luck'],
  'Que descanses': ['Rest well', 'Sleep well', 'Good night'], 'No pasa nada': ["It's no problem", "Don't worry", "It's okay"],
  'Claro que sí': ['Of course'], 'Hasta pronto': ['See you soon', 'See you later', 'See you around'], Cuídate: ['Take care'],
  'Con mucho gusto': ['With pleasure', "You're welcome", 'Nice to meet you'],
  Disculpe: ['Excuse me (formal)', 'Excuse me', 'Pardon me', "I'm sorry"], Enhorabuena: ['Congratulations'],
  'Me da igual': ['It makes no difference to me', 'It amounts to the same thing', "I don't mind"],
  'Da lo mismo': ['It amounts to the same thing', 'It makes no difference to me'],
  'Vale la pena': ['It is worth the trouble'], 'No hay de qué': ['Think nothing of it', "You're welcome"],
  'Menos mal': ['Just as well', 'Thank goodness'], 'Ya veremos': ['We shall see'], 'Ni hablar': ['Out of the question'],
  'Por supuesto': ['Naturally', 'Of course'], 'A lo mejor': ['Maybe', 'Perhaps'], 'De vez en cuando': ['From time to time'],
  'En seguida': ['Right away'], 'Sin falta': ['Without fail'],
};
const PHRASE_GLOSS = new Map(Object.entries(PHRASE).map(([k, v]) => [k, v.map(glossKey)]));
/** Who says what back: every natural reply. */
const NATURAL_REPLY = {
  Gracias: ['De nada', 'No hay de qué', 'Con mucho gusto', 'A ti'],
  'Mucho gusto': ['Igualmente', 'Mucho gusto', 'Encantado', 'Encantada', 'El gusto es mío'],
  'Buen viaje': ['Gracias', 'Muchas gracias', 'Igualmente'],
  'Lo siento': ['No pasa nada', 'No te preocupes', 'Tranquilo'],
  'Hasta mañana': ['Hasta mañana', 'Hasta luego', 'Adiós', 'Nos vemos', 'Chao'],
  '¿Cómo estás?': ['Bien, gracias', 'Muy bien', 'Estoy bien, gracias'],
  'Buen provecho': ['Gracias', 'Igualmente', 'Muchas gracias'],
};
const ANSWERS_TO = {
  '¿Cómo estás?': ['Estoy bien, gracias.'], '¿Cómo te llamas?': ['Me llamo Ana.'], '¿De dónde eres?': ['Soy de Perú.'],
  '¿Cuántos años tienes?': ['Tengo veinte años.'],
};
/** When you arrive, which greetings fit. Eight in the evening is still "tardes" in Spain. */
const GREETING_AT = {
  'at nine in the morning': ['Buenos días'], 'just after lunch': ['Buenas tardes'],
  'at eight in the evening': ['Buenas tardes', 'Buenas noches'], 'at ten at night': ['Buenas noches'],
};

// ── translation ─────────────────────────────────────────────────────────────
const EN_VERB = {
  speak: ['hablar'], work: ['trabajar'], study: ['estudiar'], cook: ['cocinar'], walk: ['caminar', 'andar'],
  eat: ['comer'], drink: ['beber', 'tomar'], learn: ['aprender'], live: ['vivir'], write: ['escribir'],
};
const EN_3SG = { speaks: 'speak', works: 'work', studies: 'study', cooks: 'cook', walks: 'walk', eats: 'eat', drinks: 'drink', learns: 'learn', lives: 'live', writes: 'write' };
const EN_PAST = { spoke: 'speak', worked: 'work', studied: 'study', cooked: 'cook', walked: 'walk', ate: 'eat', drank: 'drink', learned: 'learn', learnt: 'learn', lived: 'live', wrote: 'write' };
const EN_PHRASE = {
  'at home': ['en casa'], 'at the office': ['en la oficina'], 'in the park': ['en el parque'],
  'in the morning': ['por la mañana', 'en la mañana'], 'every day': ['todos los días', 'cada día'],
  'with my friends': ['con mis amigos', 'con mis amigas'],
};
/** Live is not a thing you do at the office or in the morning, or "a lot". */
const LIVE_OK = ['at home', 'with my friends'];
const EN_SPOT = {
  'on the table': ['en la mesa', 'sobre la mesa', 'encima de la mesa'], 'on the chair': ['en la silla', 'sobre la silla', 'encima de la silla'],
  'in the car': ['en el coche', 'en el carro', 'en el auto'], 'in the suitcase': ['en la maleta', 'en la valija'],
};
/** What fits where: small things on any of them, a suitcase only in a car. */
const SMALL_THINGS = ['book', 'paper', 'plate', 'notebook', 'clock', 'flower', 'letter', 'key'];
/** Fixed translations, reviewed: every answer that is right. */
const FIXED_TRANSLATIONS = {
  'I speak Spanish.': ['Hablo español', 'Yo hablo español', 'Hablo castellano', 'Yo hablo castellano'],
  'We eat at home.': ['Comemos en casa', 'Nosotros comemos en casa', 'Nosotras comemos en casa'],
  'She lives in a big city.': ['Ella vive en una ciudad grande', 'Vive en una ciudad grande', 'Ella vive en una gran ciudad', 'Vive en una gran ciudad'],
  'The books are on the table.': ['Los libros están en la mesa', 'Los libros están sobre la mesa', 'Los libros están encima de la mesa'],
  'Yesterday I worked a lot.': ['Ayer trabajé mucho', 'Ayer yo trabajé mucho'],
  'When I was a child, I read every night.': ['Cuando era niño, leía todas las noches', 'Cuando era niña, leía todas las noches',
    'Cuando yo era niño, leía todas las noches', 'Cuando yo era niña, leía todas las noches',
    'Cuando era pequeño, leía todas las noches', 'Cuando era pequeña, leía todas las noches',
    'Cuando era niño, leía cada noche', 'Cuando era niña, leía cada noche'],
  // "You" is tú, usted, ustedes or vosotros; English does not say which.
  'I want you to come tomorrow.': ['Quiero que vengas mañana', 'Quiero que venga mañana', 'Quiero que vengan mañana', 'Quiero que vengáis mañana'],
};
/** Other fixed items, reviewed by hand: prompt -> the one right answer. */
const FIXED_KEYS = {
  '"Ella es aburrida" means:': 'She is boring',
  'Which sentence places the pronouns correctly?': 'Se lo doy.',
  'Which is the polite way to greet someone late at night?': 'Buenas noches',
  'Which is more formal?': '¿Cómo está usted?',
  'Make this a question: "El café está caliente."': '¿El café está caliente?',
  'Which asks "Where is the library?"': '¿Dónde está la biblioteca?',
};

// ── text mechanics ──────────────────────────────────────────────────────────
/** Unaccented spellings that are never right. Ambiguous pairs (esta/está, tu/tú) are left out. */
const NEEDS_ACCENT = new Map(Object.entries({
  dia: 'día', dias: 'días', rio: 'río', rios: 'ríos', lapiz: 'lápiz', lapices: 'lápices', jardin: 'jardín', cafe: 'café',
  estacion: 'estación', reunion: 'reunión', panaderia: 'panadería', platano: 'plátano', platanos: 'plátanos',
  mecanico: 'mecánico', mecanica: 'mecánica', farmaceutico: 'farmacéutico', farmaceutica: 'farmacéutica', peru: 'Perú',
  panama: 'Panamá', mexico: 'México', espana: 'España', manana: 'mañana', nino: 'niño', nina: 'niña', pequeno: 'pequeño',
  pequena: 'pequeña', pequenos: 'pequeños', pequenas: 'pequeñas', espanol: 'español', ensenar: 'enseñar', anadir: 'añadir',
  adios: 'adiós', perdon: 'perdón', cuidate: 'cuídate', aqui: 'aquí', aca: 'acá', alli: 'allí', tambien: 'también',
  estan: 'están', dieciseis: 'dieciséis', veintidos: 'veintidós', veintitres: 'veintitrés', veintiseis: 'veintiséis',
  automovil: 'automóvil', almacen: 'almacén', examenes: 'exámenes', facil: 'fácil', dificil: 'difícil', medica: 'médica',
  medico: 'médico', leia: 'leía', era: null, maria: 'María', lucia: 'Lucía', andres: 'Andrés', republica: 'República',
  cumpleanos: 'cumpleaños', ano: 'año', anos: 'años', dias: 'días', banos: 'baños', bano: 'baño', vengais: 'vengáis',
  estais: 'estáis', habeis: 'habéis', ingles: 'inglés', cuanto: null,
}).filter(([, v]) => v));
const EN_WORDS = /\b(what|which|how|does|do|is|are|the|you|this|mean|say|asks|of|these|reply|answers|largest|many|where|who|whose|why|when|or|and)\b/i;
const ES_WORDS = /\b(está|es|qué|cómo|dónde|cuándo|quién|cuál|cuánto|cuántos|cuántas|tiene|hay|tienes|eres|estás|llamas|te|usted|son|están|el|la|los|las)\b/i;

function mechanics(text, out) {
  if (!text) return;
  // ¿ and ? in pairs, ¡ and ! in pairs.
  const pair = (open, close, name) => {
    let depth = 0;
    for (const ch of text) {
      if (ch === open) depth++;
      if (ch === close && depth > 0) depth--;
    }
    if (depth > 0) out.push(['punctuation', `${name} opened and never closed: "${text}"`]);
  };
  pair('¿', '?', '¿');
  pair('¡', '!', '¡');
  // A Spanish question with no opening mark.
  for (const m of text.matchAll(/([^.?!:"“”—\n¿]*)\?/g)) {
    const seg = m[1];
    const start = m.index;
    const before = text.slice(0, start);
    const opened = before.lastIndexOf('¿') > Math.max(before.lastIndexOf('?'), before.lastIndexOf('.'), before.lastIndexOf('"'));
    if (opened) continue;
    if (ES_WORDS.test(seg) && !EN_WORDS.test(seg) && seg.trim().split(/\s+/).length >= 2) {
      out.push(['punctuation', `Spanish question without ¿: "${seg.trim()}?"`]);
    }
  }
  let hit;
  if ((hit = text.match(/\bde el\b/)) || (hit = text.match(/\ba el\b/))) out.push(['contraction', `"${hit[0]}" should be ${hit[0].startsWith('de') ? 'del' : 'al'}`]);
  for (const w of text.split(/[^A-Za-zÀ-ÿñÑ]+/)) {
    const fix = NEEDS_ACCENT.get(lc(w));
    if (fix && lc(w) !== lc(fix)) { out.push(['accent', `"${w}" should be "${fix}"`]); break; }
  }
}

/** Article, demonstrative and adjective agreement with the nouns in a Spanish text. */
function agreement(text, out) {
  if (!text) return;
  const toks = text.split(/[\s,.;:!?¿¡"“”()—\n]+/).filter(Boolean);
  for (let i = 0; i < toks.length - 1; i++) {
    const det = DETERMINER[lc(toks[i])];
    const noun = NOUN.get(lc(toks[i + 1]));
    // "El Salvador", "la una": a capital El before a proper name, or no noun at all.
    if (det && noun && !(toks[i] === 'El' && /^[A-Z]/.test(toks[i + 1]))) {
      if (det[0] !== noun.g || det[1] !== noun.n) out.push(['agreement', `"${toks[i]} ${toks[i + 1]}"`]);
    }
    if (noun) {
      let j = i + 1;
      if (/^(está|están|es|son|estaba|estaban|era|eran)$/.test(lc(toks[j] || '')) && toks[j] !== toks[i + 1]) j++;
      const adj = ADJ.get(lc(toks[j] || ''));
      if (adj && (adj.n !== noun.n || (adj.g && adj.g !== noun.g))) out.push(['agreement', `"${toks[i + 1]} … ${toks[j]}"`]);
      const nextVerb = lc(toks[i + 2] || '');
      const adjAfterVerb = /^(está|están|es|son)$/.test(nextVerb) ? ADJ.get(lc(toks[i + 3] || '')) : null;
      if (adjAfterVerb && (adjAfterVerb.n !== noun.n || (adjAfterVerb.g && adjAfterVerb.g !== noun.g))) {
        out.push(['agreement', `"${toks[i + 1]} ${toks[i + 2]} ${toks[i + 3]}"`]);
      }
    }
  }
}

/** English the prompt shows: verb forms glued together by a template. */
function english(text, out) {
  let hit;
  if ((hit = text.match(/\b\w*[^aeiou\W]ys\b/))) out.push(['english', `"${hit[0]}"`]);
  if ((hit = text.match(/\ba [aeiou][a-z]+/)) && !/\ba (one|uni|use|usu|eu)/.test(hit[0])) out.push(['english', `"${hit[0]}"`]);
  if ((hit = text.match(/\bwalk into (a|the) [^,.]*?(door|desk|counter|gate|taxi)\b/))) out.push(['english', `"${hit[0]}" reads as colliding with it`]);
}

const DEBRIS = /undefined|NaN|\[object|\bnull\b|\$\{|\{\{/;

// ═══ the verifiers ═══════════════════════════════════════════════════════════
/**
 * Each takes an item and returns null (not mine) or
 *   { key, right?: [...], wrong?: [...], trusted?: [...], flags?: [[code, detail]], deliberate? }
 * key       the answer the audit derives (null when it only checks properties)
 * right     every answer that is correct: MC distractors must not be among them;
 *           type-ins must accept each of them
 * wrong     answers the grader must not accept
 * trusted   extra text to hold to the Spanish checks (a filled-in sentence)
 * deliberate the prompt shows a mistake on purpose, so it is not grammar-checked
 */
const VERIFIERS = [];
const verifier = (rx, fn) => VERIFIERS.push({ rx, fn });

const nounInfo = (form) => NOUN.get(lc(form));
const article = (g, n, indefinite = false) => (indefinite ? INDEFINITE : DEFINITE)[g][n];

// ── vocabulary ──────────────────────────────────────────────────────────────
verifier(/^What does "(.+)" mean\?$/, (it, m) => {
  const x = m[1];
  let glosses = null;
  if (PHRASE_GLOSS.has(x)) glosses = PHRASE_GLOSS.get(x);
  else if (NOUN_DATA[x]) glosses = glossesOf(x).map(glossKey);
  if (!glosses) return { flags: [['unverified', `no gloss known for "${x}"`]] };
  const key = (it.choices || [it.answer]).find((c) => glosses.includes(glossKey(c)) && glossKey(c) === glossKey(it.answer));
  return { key: key || `(one of: ${glosses.join(' / ')})`, rightBy: (c) => glosses.includes(glossKey(c)) };
});

verifier(/^Write the Spanish word for "(.+)" \(no article\)\.$/, (it, m) => {
  const en = m[1];
  const nouns = Object.keys(NOUN_DATA).filter((n) => glossesOf(n)[0] === en);
  const right = [...new Set([...nouns, ...(SPANISH_FOR[en] || [])])];
  if (!right.length) return { flags: [['unverified', `no Spanish known for "${en}"`]] };
  const key = right.find((r) => r === it.answer) || right[0];
  const wrongs = Object.keys(NOUN_DATA).filter((n) => !right.includes(n) && !glossesOf(n).includes(en)).slice(0, 6);
  return { key, right, wrong: wrongs };
});

verifier(/^Which of these is not a Spanish word\?$/, (it) => {
  const fake = it.choices.filter((c) => !NOUN.has(lc(c)));
  const flags = [];
  if (fake.length !== 1) flags.push(['two-right-answers', `${fake.length} choices are not in the lexicon: ${fake.join(', ')}`]);
  if (fake[0] && !NOT_SPANISH.includes(fake[0])) flags.push(['unverified', `"${fake[0]}" is not a word the audit knows to be invented`]);
  return { key: fake[0], flags };
});

verifier(/^Which of these does not belong with the others\?$/, (it) => ({
  flags: [['ambiguous', `no category is named, and "${it.answer}"${NOT_SPANISH.includes(it.answer) ? '' : ' is a real Spanish word'}`]],
}));

verifier(/^Which of these is not something you eat or drink\?$/, (it) => {
  const flags = [];
  const odd = it.choices.filter((c) => !FOOD.includes(c));
  const arguable = it.choices.filter((c) => FOOD_ARGUABLE.includes(c));
  if (arguable.length) flags.push(['ambiguous', `"${arguable.join('", "')}" could be argued either way`]);
  if (odd.length !== 1) flags.push(['two-right-answers', `${odd.length} non-foods: ${odd.join(', ')}`]);
  return { key: odd[0], flags };
});

verifier(/^"(.+)" means "(_+)" in English\. Fill in the English word\.$/, (it, m) => {
  const glosses = glossesOf(m[1]);
  const flags = [];
  if (!glosses.includes(it.answer)) flags.push(['wrong-key', `"${it.answer}" is not a gloss of ${m[1]}`]);
  if (m[2].length !== it.answer.length) flags.push(['wrong-key', `${m[2].length} blanks for "${it.answer}"`]);
  return { key: it.answer, flags };
});

verifier(/^Fill in the English: "(_+)" \((masculine|feminine) noun\)\.$/, () => ({
  flags: [['unanswerable', 'the Spanish word is not shown; only blanks and a gender']],
}));

// ── gender ──────────────────────────────────────────────────────────────────
verifier(/^Choose the correct article: ___ (\S+)$/, (it, m) => {
  const noun = nounInfo(m[1]);
  if (!noun) return { flags: [['unverified', `unknown noun "${m[1]}"`]] };
  const flags = [];
  if (BOTH_GENDERS.includes(noun.lemma)) flags.push(['two-right-answers', `"${noun.lemma}" takes el and la`]);
  if (noun.n === 'p' && MASS.includes(noun.lemma)) flags.push(['nonsense', `"${m[1]}" is not normally plural`]);
  const indefinite = it.choices.some((c) => /^un/.test(c));
  return { key: article(noun.g, noun.n, indefinite), rightBy: (c) => c === article(noun.g, noun.n, /^un/.test(c)), flags, trusted: [`${it.answer} ${m[1]}`] };
});

verifier(/^Which article goes with "(\S+)"\?$/, (it, m) => {
  const noun = nounInfo(m[1]);
  if (!noun) return { flags: [['unverified', `unknown noun "${m[1]}"`]] };
  const ok = [article(noun.g, noun.n), article(noun.g, noun.n, true)];
  return { key: ok[0], rightBy: (c) => ok.includes(c) };
});

verifier(/^Type the definite article for "(\S+)": el or la\?$/, (it, m) => {
  const noun = nounInfo(m[1]);
  if (!noun) return { flags: [['unverified', `unknown noun "${m[1]}"`]] };
  const key = article(noun.g, noun.n);
  return { key, wrong: [key === 'el' ? 'la' : 'el', 'los', 'las'] };
});

verifier(/^Give the noun with its correct article, singular: (\S+)$/, (it, m) => {
  const noun = nounInfo(m[1]);
  if (!noun) return { flags: [['unverified', `unknown noun "${m[1]}"`]] };
  const key = `${article(noun.g, 's')} ${m[1]}`;
  // "un libro" also has its correct article; the bare noun has none.
  return { key, right: [key, `${article(noun.g, 's', true)} ${m[1]}`], wrong: [m[1], `${article(noun.g === 'm' ? 'f' : 'm', 's')} ${m[1]}`] };
});

/** "el libro", "la libro": is the article right for the noun? */
const pairOk = (phrase) => {
  const [a, n] = phrase.split(' ');
  const noun = nounInfo(n);
  const det = DETERMINER[a];
  if (!noun || !det) return null;
  return det[0] === noun.g && det[1] === noun.n;
};
verifier(/^Which of these has the wrong article\?$/, (it) => {
  const verdicts = it.choices.map(pairOk);
  if (verdicts.some((v) => v === null)) return { flags: [['unverified', `unknown pairing in ${it.choices.join(', ')}`]] };
  const wrong = it.choices.filter((c, i) => !verdicts[i]);
  return { key: wrong[0], deliberate: true, flags: wrong.length === 1 ? [] : [['two-right-answers', `${wrong.length} wrong pairings: ${wrong.join(', ')}`]] };
});
verifier(/^Which is correct\?$/, (it) => {
  const verdicts = it.choices.map(pairOk);
  if (verdicts.some((v) => v === null)) return { flags: [['unverified', `unknown pairing in ${it.choices.join(', ')}`]] };
  const right = it.choices.filter((c, i) => verdicts[i]);
  return { key: right[0], flags: right.length === 1 ? [] : [['two-right-answers', `${right.length} correct: ${right.join(', ')}`]] };
});

// ── adjectives ──────────────────────────────────────────────────────────────
const fits = (lemma, noun) => !ADJ_DATA[lemma][2] || ADJ_DATA[lemma][2].includes(noun);
verifier(/^Choose the correct form of "(\S+)" \(([^)]+)\):\n(\S+) (\S+) ___$/, (it, m) => {
  const [, lemma, en, det, nounForm] = m;
  const noun = nounInfo(nounForm);
  if (!noun || !ADJ_DATA[lemma]) return { flags: [['unverified', `unknown "${lemma}" or "${nounForm}"`]] };
  const flags = [];
  if (ADJ_DATA[lemma][1] !== en) flags.push(['wrong-gloss', `"${lemma}" glossed as "${en}"`]);
  if (!fits(lemma, noun.lemma)) flags.push(['nonsense', `"${nounForm} ${it.answer}" agrees and means nothing`]);
  if (pairOk(`${det} ${nounForm}`) === false) flags.push(['agreement', `"${det} ${nounForm}"`]);
  const key = adjForm(lemma, noun.g, noun.n);
  return { key, rightBy: (c) => c === key, flags, trusted: [`${det} ${nounForm} ${it.answer}`] };
});

verifier(/^Which word is wrong in "(\S+) (\S+) (\S+)"\?$/, (it, m) => {
  const [, det, nounForm, adj] = m;
  const noun = nounInfo(nounForm);
  const a = ADJ.get(adj);
  if (!noun || !a) return { flags: [['unverified', `unknown "${nounForm}" or "${adj}"`]] };
  const flags = [];
  if (pairOk(`${det} ${nounForm}`) === false) flags.push(['ambiguous', `the article "${det}" is wrong too`]);
  if (!fits(a.lemma, noun.lemma)) flags.push(['nonsense', `"${nounForm} ${a.lemma}" means nothing`]);
  const agrees = (!a.g || a.g === noun.g) && a.n === noun.n;
  return { key: agrees ? 'None of them' : adj, deliberate: true, flags };
});

verifier(/^Choose the form of "(\S+)" \(([^)]+)\) that describes both: el (\S+) y la (\S+) ___$/, (it, m) => {
  const [, lemma, , mNoun, fNoun] = m;
  if (!ADJ_DATA[lemma]) return { flags: [['unverified', `unknown "${lemma}"`]] };
  const flags = [];
  if (nounInfo(mNoun)?.g !== 'm' || nounInfo(fNoun)?.g !== 'f') flags.push(['agreement', `el ${mNoun} / la ${fNoun}`]);
  if (!fits(lemma, mNoun) || !fits(lemma, fNoun)) flags.push(['nonsense', `"${lemma}" on ${mNoun} or ${fNoun}`]);
  const key = adjForm(lemma, 'm', 'p');
  return { key, rightBy: (c) => c === key, flags };
});

verifier(/^Fix the adjective so it agrees: "(\S+) (\S+) (\S+)"\. Type the corrected adjective\.$/, (it, m) => {
  const [, det, nounForm, adj] = m;
  const noun = nounInfo(nounForm);
  const a = ADJ.get(adj);
  if (!noun || !a) return { flags: [['unverified', `unknown "${nounForm}" or "${adj}"`]] };
  const flags = [];
  const key = adjForm(a.lemma, noun.g, noun.n);
  if (key === adj) flags.push(['nothing-to-fix', `"${det} ${nounForm} ${adj}" already agrees`]);
  if (!fits(a.lemma, noun.lemma)) flags.push(['nonsense', `"${nounForm} ${key}"`]);
  const wrong = ['m', 'f'].flatMap((g) => ['s', 'p'].map((n) => adjForm(a.lemma, g, n))).filter((f) => f !== key);
  return { key, wrong, deliberate: true, flags, trusted: [`${det} ${nounForm} ${it.answer}`] };
});

verifier(/^Complete with the right form of "(\S+)" \(([^)]+)\): "(\S+) (\S+) ___"$/, (it, m) => {
  const [, lemma, , det, nounForm] = m;
  const noun = nounInfo(nounForm);
  if (!noun || !ADJ_DATA[lemma]) return { flags: [['unverified', `unknown "${lemma}" or "${nounForm}"`]] };
  const flags = [];
  if (!fits(lemma, noun.lemma)) flags.push(['nonsense', `"${nounForm} ${lemma}"`]);
  const key = adjForm(lemma, noun.g, noun.n);
  return { key, rightBy: (c) => c === key, flags, trusted: [`${det} ${nounForm} ${it.answer}`] };
});

// The forms these shapes used to take, kept so a regression is recognised.
verifier(/^Which adjective is wrong: "(\S+) (\S+)"\?$/, (it, m) => {
  const noun = nounInfo(m[1]);
  const a = ADJ.get(m[2]);
  if (!noun || !a) return { flags: [['unverified', `unknown "${m[1]}" or "${m[2]}"`]] };
  const agrees = (!a.g || a.g === noun.g) && a.n === noun.n;
  const flags = [];
  if (agrees) flags.push(['wrong-key', `"${m[1]} ${m[2]}" agrees, yet "${it.answer}" is keyed as wrong`]);
  if (a.n !== noun.n) flags.push(['agreement', `singular noun "${m[1]}" shown with plural "${m[2]}"`]);
  return { key: agrees ? '(nothing is wrong)' : m[2], deliberate: true, flags };
});
verifier(/^Which adjective agrees with both "(\S+)" and "(\S+)"\?$/, (it) => {
  const flags = [['wrong-rule', 'a masculine and a feminine noun together take the masculine plural, which is not offered']];
  const inv = it.choices.filter((c) => ADJ.get(c) && ADJ.get(c).g === null);
  if (inv.length) flags.push(['two-right-answers', `"${inv[0]}" has one form for both genders`]);
  return { key: null, flags };
});
verifier(/^Make the adjective agree: (\S+) (\S+) \(fix the ending\)$/, (it, m) => {
  const noun = nounInfo(m[1]);
  const a = ADJ.get(m[2]);
  if (!noun || !a) return { flags: [['unverified', `unknown "${m[1]}" or "${m[2]}"`]] };
  const key = adjForm(a.lemma, noun.g, noun.n);
  const flags = [];
  if (key === m[2]) flags.push(['nothing-to-fix', `"${m[1]} ${m[2]}" already agrees`]);
  return { key, flags, deliberate: true };
});
verifier(/^Complete: "(\S+) ___"$/, (it, m) => {
  const noun = nounInfo(m[1]);
  const a = ADJ.get(it.answer);
  if (!noun || !a) return { flags: [['unverified', `unknown "${m[1]}" or "${it.answer}"`]] };
  const key = adjForm(a.lemma, noun.g, noun.n);
  return { key, rightBy: (c) => { const x = ADJ.get(c); return !!x && (!x.g || x.g === noun.g) && x.n === noun.n; } };
});

// ── conjugation ─────────────────────────────────────────────────────────────
function verbFlags(inf, en) {
  const flags = [];
  if (!VERB_EN[inf]) flags.push(['unverified', `verb "${inf}" is not in the audit's table`]);
  else if (en && !VERB_EN[inf].includes(en)) flags.push(['wrong-gloss', `${inf} glossed as "${en}"`]);
  return flags;
}
/** Wrong forms of the verb the grader would still accept because they differ from the key only by accents. */
const accentTwins = (inf, key) => allForms(inf).filter((f) => f !== key && bare(f) === bare(key));

verifier(/^Complete with the (present tense|preterite|imperfect|present subjunctive|present) of (\S+) \(([^)]+)\):\n(\S+) ___$/, (it, m) => {
  const [, label, inf, en, pron] = m;
  const tense = TENSE_LABEL[label];
  const person = PERSON_OF[pron];
  const flags = verbFlags(inf, en);
  if (person == null) return { flags: [...flags, ['unverified', `unknown subject "${pron}"`]] };
  const key = conj(inf, tense, person);
  if (!key) return { flags };
  if (!it.rationale.includes(key)) flags.push(['rationale', `rationale does not show "${key}"`]);
  return { key, rightBy: (c) => c === key, wrong: [...accentTwins(inf, key), ...[0, 1, 2, 3, 5].map((p) => conj(inf, tense, p)).filter((f) => f !== key)], flags, trusted: [`${pron} ${key}`] };
});

verifier(/^Choose the correct form: Quiero que tú ___ \((\S+)\)\.$/, (it, m) => {
  const key = conj(m[1], 'subjunctive', 1);
  return { key, rightBy: (c) => c === key, flags: verbFlags(m[1]) };
});

verifier(/^Which of these is wrong \((present|preterite|imperfect) of (\S+)\)\?$/, (it, m) => {
  const [, tense, inf] = m;
  const flags = verbFlags(inf);
  const wrong = it.choices.filter((c) => {
    const [pron, form] = c.split(' ');
    return conj(inf, tense, PERSON_OF[pron]) !== form;
  });
  if (wrong.length !== 1) flags.push(['two-right-answers', `${wrong.length} wrong pairs: ${wrong.join(', ')}`]);
  return { key: wrong[0], flags };
});

verifier(/^Which word is wrong: "(\S+) (\S+)"\?$/, (it, m) => {
  if (PERSON_OF[m[1]] == null && !/ or /.test(m[1])) return null;
  return { flags: [['ambiguous', `"${m[1]} ${m[2]}": the verb is wrong for the pronoun, or the pronoun for the verb`]] };
});

verifier(/^The (present|preterite|imperfect) of (\S+) \(([^)]+)\) for "([^"]+)" ends in:$/, (it, m) => {
  const [, tense, inf, en, subject] = m;
  const flags = verbFlags(inf, en);
  const persons = SUBJECT_LABEL[subject];
  if (!persons) return { flags: [...flags, ['unverified', `unknown subject label "${subject}"`]] };
  if (persons.length > 1) flags.push(['wrong-label', `"${subject}" covers persons with different forms`]);
  const type = inf.slice(-2);
  const key = REGULAR[tense][type][persons[persons.length - 1]];
  // A typed ending that differs from another ending of the verb only by an accent.
  const endings = new Set(TENSES.flatMap((t) => REGULAR[t][type]));
  const twins = [...endings].filter((e) => e !== key && bare(e) === bare(key));
  return { key, wrong: twins, flags };
});

verifier(/^Which subject goes with "(\S+)"(?: \((present|preterite|imperfect) of (\S+)\))?\?$/, (it, m) => {
  const [, form, tense, inf0] = m;
  const flags = [];
  // Without a tense or verb in the prompt, find the verb from the form.
  const infs = inf0 ? [inf0] : Object.keys(VERB_EN).filter((v) => allForms(v).includes(form));
  const tenses = tense ? [tense] : ['present', 'preterite', 'imperfect'];
  const persons = new Set();
  for (const v of infs) for (const t of tenses) for (const p of [0, 1, 2, 3, 4, 5]) if (conj(v, t, p) === form) persons.add(p);
  const ok = it.choices.filter((c) => (SUBJECT_LABEL[c] || []).some((p) => persons.has(p)));
  for (const c of it.choices) if (!SUBJECT_LABEL[c]) flags.push(['unverified', `unknown subject label "${c}"`]);
  for (const c of it.choices) {
    const ps = SUBJECT_LABEL[c] || [];
    if (ps.length > 1 && ps.some((p) => persons.has(p)) && !ps.every((p) => persons.has(p))) flags.push(['wrong-label', `"${c}" does not all take "${form}"`]);
  }
  if (ok.length !== 1) flags.push(['two-right-answers', `"${form}" goes with ${ok.join(' and ') || 'none of the choices'}`]);
  return { key: ok[0], flags };
});

// ── ser and estar ───────────────────────────────────────────────────────────
function serEstarKey(sentence) {
  const r = serOrEstar(sentence);
  if (!r) return { flags: [['unverified', `no ser/estar rule for "${sentence}"`]] };
  if (r.ambiguous) return { flags: [['two-right-answers', r.ambiguous]] };
  if (r.error) return { flags: [['agreement', r.error]] };
  if (r.nonsense) return { flags: [['nonsense', r.nonsense]] };
  return { key: (r.verb === 'ser' ? SER : ESTAR)[r.person], verb: r.verb, why: r.why, flags: [] };
}
const fillIn = (sentence, w) => sentence.replace('___', w);

verifier(/^Choose the correct verb: (.+)$/, (it, m) => {
  const r = serEstarKey(m[1]);
  if (r.key && r.why) {
    if (r.verb === 'ser' && /takes estar/.test(it.rationale)) r.flags.push(['rationale', 'rationale says estar']);
    if (r.verb === 'estar' && /takes ser/.test(it.rationale)) r.flags.push(['rationale', 'rationale says ser']);
  }
  if (/^[a-záéíóú]/.test(m[1])) r.flags.push(['capitals', `sentence starts lower-case: "${m[1]}"`]);
  return { ...r, rightBy: r.key ? (c) => c === r.key : undefined, trusted: r.key ? [fillIn(m[1], it.answer)] : [] };
});

verifier(/^Which word is wrong: "(.+)"\?$/, (it, m) => {
  const words = m[1].replace(/[¿?.]/g, '').split(' ');
  const shown = words.find((w) => SER.includes(w) || ESTAR.includes(w));
  if (!shown || words.length < 3) return null;
  const r = serEstarKey(m[1].replace(new RegExp(`(^|[ ¿])${shown}( |$)`), '$1___$2'));
  if (r.key === shown) r.flags.push(['wrong-key', `"${shown}" is right in "${m[1]}"`]);
  return { key: r.key && r.key !== shown ? shown : null, flags: r.flags, deliberate: true };
});

verifier(/^"(.+)" — why (ser|estar) and not (ser|estar)\?$/, (it, m) => {
  const sentence = m[1];
  const verb = [...SER, ...ESTAR].find((w) => new RegExp(`(^|[ ¿])${w}( |$)`).test(sentence));
  const r = serEstarKey(verb ? sentence.replace(new RegExp(`(^|[ ¿])${verb}( |$)`), `$1___$2`) : sentence);
  if (r.verb && r.verb !== m[2]) r.flags.push(['wrong-key', `the sentence takes ${r.verb}, the prompt says ${m[2]}`]);
  const reasonRx = r.why ? SER_ESTAR_REASON[r.why] : null;
  const matching = reasonRx ? it.choices.filter((c) => reasonRx.test(c)) : [];
  if (reasonRx && (matching.length !== 1 || matching[0] !== it.answer)) r.flags.push(['wrong-key', `reason "${r.why}" vs keyed "${it.answer}"`]);
  return { key: matching[0] || null, flags: r.flags, trusted: [sentence] };
});
verifier(/^"(.+)" — why this verb\?$/, (it, m) => {
  const plural = /^(Nosotros|Mis|Los|Las|Vosotros)/.test(m[1]);
  return { flags: plural ? [['ambiguous', `"because the subject is plural" explains the form in "${m[1]}"`]] : [['unverified', 'does not say which verbs are being compared']] };
});

verifier(/^Complete both: "(.+)" and "(.+)"$/, (it, m) => {
  const a = serEstarKey(m[1]);
  const b = serEstarKey(m[2]);
  const flags = [...a.flags, ...b.flags];
  if (m[1] === m[2]) flags.push(['same-sentence-twice', `"${m[1]}"`]);
  if (a.key && b.key && a.key !== b.key) flags.push(['wrong-key', `${a.key} and ${b.key}`]);
  return { key: a.key && a.key === b.key ? a.key : null, rightBy: a.key ? (c) => c === a.key : undefined, flags, trusted: a.key ? [fillIn(m[1], it.answer), fillIn(m[2], it.answer)] : [] };
});

// ── questions and negation ─────────────────────────────────────────────────
/** The question word a "¿___ …?" sentence takes, and the others that would also be right. */
function questionWord(q) {
  let m;
  if ((m = q.match(/^¿___ está (.+)\?$/)) && subjectOf(m[1])) return { key: 'Dónde', also: ['Cómo'] };
  if ((m = q.match(/^¿___ cuesta (.+)\?$/)) && subjectOf(m[1])) return { key: 'Cuánto', also: [] };
  if ((m = q.match(/^¿___ es (.+)\? — Es (.+)\.$/)) && subjectOf(m[1])) {
    const s = subjectOf(m[1]);
    if (EVENT.includes(s.noun) && TIME_PHRASE.test(m[2])) return { key: 'Cuándo', also: [] };
    return null;
  }
  if ((m = q.match(/^¿___ es (.+)\?$/)) && subjectOf(m[1])) {
    const s = subjectOf(m[1]);
    if (s.n === 'p') return { error: `"es" with the plural "${m[1]}"` };
    if (EVENT.includes(s.noun)) return { key: 'Cuándo', also: ['Dónde', 'Cómo', 'Qué'] };
    return { key: 'Qué', also: ['Cómo', 'Dónde'] };
  }
  if (/^¿___ te llamas\?$/.test(q)) return { key: 'Cómo', also: [] };
  if ((m = q.match(/^¿___ de (estos|estas) (\S+) prefieres\?$/))) {
    const n = nounInfo(m[2]);
    if (!n) return null;
    if (DETERMINER[m[1]][0] !== n.g) return { error: `"${m[1]} ${m[2]}"` };
    return { key: 'Cuál', also: [] };
  }
  if ((m = q.match(/^¿___ tiene (los|las) (\S+)\? — (\S+) tiene \1 \2\.$/)) && NAMES[m[3]]) return { key: 'Quién', also: [] };
  if ((m = q.match(/^¿___ (\S+) hay\? — Hay tres \1\.$/))) {
    const n = nounInfo(m[1]);
    if (!n || n.n !== 'p') return null;
    return { key: n.g === 'm' ? 'Cuántos' : 'Cuántas', also: [] };
  }
  if ((m = q.match(/^¿___ necesitas (los|las) (\S+)\? — Porque \1 necesito para la clase\.$/))) return { key: 'Por qué', also: [] };
  if ((m = q.match(/^¿___ quieres comprar\? — Quiero comprar (\S+)\.$/)) && nounInfo(m[1])) return { key: 'Qué', also: [] };
  // The bare forms this family used to print.
  if ((m = q.match(/^¿___ tiene (\S+)\?$/))) return { key: 'Quién', also: ['Por qué', 'Dónde', 'Cuándo', 'Qué'] };
  if ((m = q.match(/^¿___ (\S+) hay\?$/))) {
    const n = nounInfo(m[1]);
    return n ? { key: n.g === 'm' ? 'Cuántos' : 'Cuántas', also: ['Qué'] } : null;
  }
  if ((m = q.match(/^¿___ necesitas (\S+)\?$/))) return { key: 'Por qué', also: ['Dónde', 'Cuándo', 'Para qué'] };
  return null;
}
verifier(/^Choose the (?:question word|correct word): (.+)$/, (it, m) => {
  const r = questionWord(m[1]);
  if (!r) return { flags: [['unverified', `no question-word rule for "${m[1]}"`]] };
  if (r.error) return { flags: [['agreement', r.error]] };
  return { key: r.key, rightBy: (c) => c === r.key || r.also.includes(c), trusted: [fillIn(m[1], it.answer)] };
});

const NEGATIVE_OK = [
  /^No tengo (nada|a nadie)\.$/,
];
function negativeOk(s) {
  if (NEGATIVE_OK.some((rx) => rx.test(s))) return true;
  const m = s.match(/^(\S+) no (\S+) nunca\.$/);
  if (m && NAMES[m[1]]) return Object.keys(VERB_EN).some((v) => conj(v, 'present', 2) === m[2]);
  return false;
}
verifier(/^Which is the correct negative sentence\?$/, (it) => {
  const ok = it.choices.filter(negativeOk);
  const flags = [];
  if (ok.length !== 1) flags.push(['two-right-answers', `${ok.length} correct: ${ok.join(' | ')}`]);
  const vivir = it.answer.match(/^\S+ no vive nunca\.$/);
  if (vivir) flags.push(['nonsense', `"${it.answer}" — "never lives"`]);
  return { key: ok[0], flags };
});

verifier(/^Which is the negative of "yo (\S+)"\?$/, (it, m) => {
  const right = [`yo no ${m[1]}`, `no ${m[1]}`];
  return { key: right[0], rightBy: (c) => right.includes(c) };
});

verifier(/^Which question asks "Whose (.+) is this\?"$/, (it, m) => {
  const nouns = Object.keys(NOUN_DATA).filter((n) => glossesOf(n)[0] === m[1]);
  if (!nouns.length) return { flags: [['unverified', `no Spanish known for "${m[1]}"`]] };
  const right = nouns.map((n) => `¿De quién es ${NOUN_DATA[n][0] === 'm' ? 'este' : 'esta'} ${n}?`);
  return { key: right.find((r) => r === it.answer) || right[0], rightBy: (c) => right.includes(c) };
});

verifier(/^Translate into Spanish: "The (.+) is not here\."$/, (it, m) => {
  const nouns = Object.keys(NOUN_DATA).filter((n) => glossesOf(n)[0] === m[1] || (SPANISH_FOR[m[1]] || []).includes(n));
  if (!nouns.length) return { flags: [['unverified', `no Spanish known for "${m[1]}"`]] };
  const right = nouns.flatMap((n) => {
    const the = `${article(NOUN_DATA[n][0], 's')} ${n}`;
    return [`${capFirst(the)} no está aquí`, `No está aquí ${the}`, `Aquí no está ${the}`, `${capFirst(the)} no está acá`];
  });
  return { key: right.find((r) => r === it.answer) || right[0], right: right.slice(0, 4), wrong: [`${capFirst(article(NOUN_DATA[nouns[0]][0], 's'))} ${nouns[0]} está aquí`] };
});
verifier(/^Negate: "(.+)" is here\./, () => ({ flags: [['wrong-key', 'the keyed sentence has no noun']] }));

// ── numbers ─────────────────────────────────────────────────────────────────
verifier(/^Write (?:the number )?(\d+) in Spanish\.$/, (it, m) => ({ key: spell(Number(m[1])), wrong: [spell(Number(m[1]) === 100 ? 99 : Number(m[1]) + 1)] }));
verifier(/^How many is (.+)\? Give the number in digits\.$/, (it, m) => {
  const n = UNSPELL.get(m[1]);
  return n == null ? { flags: [['unverified', `"${m[1]}" is not a number the audit can read`]] } : { key: String(n) };
});
verifier(/^Which is largest: (.+)\?$/, (it, m) => {
  const words = m[1].replace(/,? or /, ', ').split(', ');
  const nums = words.map((w) => UNSPELL.get(w));
  if (nums.some((n) => n == null)) return { flags: [['unverified', `cannot read "${m[1]}"`]] };
  const top = Math.max(...nums);
  const flags = [];
  if (new Set(nums).size !== nums.length) flags.push(['duplicate-choice', m[1]]);
  return { key: spell(top), flags };
});
verifier(/^How do you say the time (\d+):(\d\d) in Spanish\?$/, (it, m) => {
  const h = Number(m[1]);
  const min = Number(m[2]);
  const base = h === 1 ? 'es la una' : `son las ${spell(h)}`;
  const right = min === 0 ? [base, `${base} en punto`] : min === 15 ? [`${base} y cuarto`, `${base} y quince`] : [`${base} y media`, `${base} y treinta`];
  return { key: right[0], right, wrong: [h === 1 ? 'es la uno' : `son las ${spell(h === 12 ? 11 : h + 1)}`] };
});

// ── object pronouns ─────────────────────────────────────────────────────────
const KEEPABLE = ['libro', 'zapato', 'reloj', 'papel', 'cuaderno', 'carta', 'sombrero', 'llave', 'plato', 'maleta', 'lápiz'];
const CARRIABLE = ['libros', 'papeles', 'platos', 'cuadernos', 'relojes', 'flores', 'cartas', 'llaves', 'maletas', 'sillas'];
const ANIMATE = ['perro', 'perros'];
verifier(/^Replace the object: (\S+) (el|la|los|las) (\S+)\. → ___ (\S+)\.$/, (it, m) => {
  const [, verb, det, nounForm, verb2] = m;
  const noun = nounInfo(nounForm);
  if (!noun) return { flags: [['unverified', `unknown noun "${nounForm}"`]] };
  const flags = [];
  if (lc(verb) !== verb2) flags.push(['debris', `"${verb}" became "${verb2}"`]);
  if (pairOk(`${det} ${nounForm}`) === false) flags.push(['agreement', `"${det} ${nounForm}"`]);
  if (ANIMATE.includes(nounForm)) flags.push(['grammar', `"${verb} ${det} ${nounForm}": an animal as direct object wants the personal a`]);
  if (verb === 'Guardo' && !KEEPABLE.includes(nounForm)) flags.push(['nonsense', `"Guardo ${det} ${nounForm}"`]);
  if (verb === 'Llevo' && !CARRIABLE.includes(nounForm)) flags.push(['nonsense', `"Llevo ${det} ${nounForm}"`]);
  const key = capFirst({ m: { s: 'lo', p: 'los' }, f: { s: 'la', p: 'las' } }[noun.g][noun.n]);
  return { key, rightBy: (c) => c === key, flags, trusted: [`${key} ${verb2}.`] };
});
verifier(/^Choose the correct pronoun: ___ doy (el|la) (\S+) a (\S+)\.$/, (it, m) => {
  const flags = [];
  if (pairOk(`${m[1]} ${m[2]}`) === false) flags.push(['agreement', `"${m[1]} ${m[2]}"`]);
  if (!NAMES[m[3]]) flags.push(['unverified', `unknown name ${m[3]}`]);
  return { key: 'Le', rightBy: (c) => c === 'Le', flags };
});
const TO_YOU = { give: 'dar', send: 'mandar', explain: 'explicar', bring: 'traer' };
verifier(/^Which is correct\? \(I want to (give|send|explain|bring) it to you\.\)$/, (it, m) => {
  const inf = TO_YOU[m[1]];
  // The infinitive's last vowel takes the stress mark once two pronouns are attached.
  const stressed = inf.replace(/([aei])r$/, (x, v) => `${{ a: 'á', e: 'é', i: 'í' }[v]}r`);
  const right = [`Quiero ${stressed}telo.`, `Te lo quiero ${inf}.`];
  return { key: right[0], rightBy: (c) => right.includes(c) };
});
verifier(/^Someone rewrote "Veo (el|la) (\S+)\." as "(Lo|La) veo\." Which word is wrong\?$/, (it, m) => {
  const noun = nounInfo(m[2]);
  if (!noun) return { flags: [['unverified', `unknown noun "${m[2]}"`]] };
  const right = noun.g === 'm' ? 'Lo' : 'La';
  return { key: m[3] === right ? 'Nothing is wrong' : m[3], deliberate: true };
});
verifier(/^Complete: "Hablo con ___" \(with (her|him|them)\)\.$/, (it, m) => ({
  key: { her: 'ella', him: 'él', them: 'ellos' }[m[1]],
  rightBy: (c) => c === { her: 'ella', him: 'él', them: 'ellos' }[m[1]] || (m[1] === 'them' && c === 'ellas'),
}));
verifier(/^In "Veo a (\S+)", which pronoun replaces "a \1"\?$/, (it, m) => {
  const g = NAMES[m[1]];
  if (!g) return { flags: [['unverified', `unknown name ${m[1]}`]] };
  // A man as direct object is "lo", and "le" is accepted for it in Spain.
  return { key: g === 'f' ? 'la' : 'lo', rightBy: (c) => (g === 'f' ? c === 'la' : ['lo', 'le'].includes(c)) };
});
verifier(/^Which direct object pronoun replaces "(el|la) (\S+)" in "Compro \1 \2"\?$/, (it, m) => {
  const noun = nounInfo(m[2]);
  if (!noun) return { flags: [['unverified', `unknown noun "${m[2]}"`]] };
  const key = noun.g === 'm' ? 'lo' : 'la';
  return { key, rightBy: (c) => c === key };
});
verifier(/^Which pronoun means "him" when used directly\?$/, () => ({ flags: [['two-right-answers', '"le" for "him" as a direct object (leísmo) is accepted in Spain beside "lo"']] }));
verifier(/^Which pronoun is wrong: "Lo veo en la calle"\?$/, () => ({ flags: [['wrong-key', '"La" is not in the sentence, and nothing in it is wrong']] }));
verifier(/^Which replaces "a Ana" to avoid repeating it\?$/, () => ({ flags: [['ambiguous', 'no sentence: "a Ana" as an indirect object is "le"']] }));

// ── greetings ───────────────────────────────────────────────────────────────
verifier(/^How do you say "(.+)"\?$/, (it, m) => {
  const en = glossKey(m[1]);
  const right = [...PHRASE_GLOSS.entries()].filter(([, gl]) => gl.includes(en)).map(([es]) => es);
  if (!right.length) return { flags: [['unverified', `no phrase known for "${m[1]}"`]] };
  return { key: right.find((r) => r === it.answer) || right[0], rightBy: (c) => right.includes(c) };
});
verifier(/^Which reply best answers "(.+)"$/, (it, m) => {
  const right = ANSWERS_TO[m[1]];
  if (!right) return { flags: [['unverified', `no reply known for "${m[1]}"`]] };
  return { key: right[0], rightBy: (c) => right.includes(c) };
});
verifier(/^You (?:walk into|arrive at) (.+?) (at nine in the morning|just after lunch|at eight in the evening|at ten at night)(?: and greet the person there)?\. What do you say\?$/, (it, m) => {
  const right = GREETING_AT[m[2]];
  return { key: right[0], rightBy: (c) => right.includes(c) };
});
verifier(/^Someone says "(.+)"\. What is the natural reply\?$/, (it, m) => {
  const right = NATURAL_REPLY[m[1]];
  if (!right) return { flags: [['unverified', `no replies known for "${m[1]}"`]] };
  return { key: right.find((r) => r === it.answer) || right[0], rightBy: (c) => right.includes(c) };
});
verifier(/^You are speaking to (.+)\. Which is the appropriate form\?$/, (it) => {
  const formal = it.choices.filter((c) => /\busted\b|\bse llama\b|\bestá usted\b/.test(c));
  return { key: formal[0], flags: formal.length === 1 ? [] : [['two-right-answers', formal.join(' | ')]] };
});

// ── translation ─────────────────────────────────────────────────────────────
function translations(en) {
  if (FIXED_TRANSLATIONS[en]) return { right: FIXED_TRANSLATIONS[en] };
  let m;
  const variants = (infs, tense, person, phrases, pronouns) => infs.flatMap((inf) => phrases.flatMap((ph) => {
    const form = conj(inf, tense, person);
    return [`${capFirst(form)} ${ph}`, ...pronouns.map((p) => `${p} ${form} ${ph}`)];
  }));
  if ((m = en.match(/^(I|We) (\w+) (.+)\.$/)) && EN_VERB[m[2]] && EN_PHRASE[m[3]]) {
    const flags = m[2] === 'live' && !LIVE_OK.includes(m[3]) ? [['nonsense', `"${en}"`]] : [];
    const person = m[1] === 'I' ? 0 : 3;
    return { flags, right: variants(EN_VERB[m[2]], 'present', person, EN_PHRASE[m[3]], person ? ['Nosotros', 'Nosotras'] : ['Yo']), wrong: [`${capFirst(conj(EN_VERB[m[2]][0], 'present', person ? 0 : 3))} ${EN_PHRASE[m[3]][0]}`] };
  }
  if ((m = en.match(/^(She|He) (\w+) (.+)\.$/)) && EN_PHRASE[m[3]]) {
    if (!EN_3SG[m[2]]) return { flags: [['english', `"${m[2]}" is not the English third person of a verb the audit knows`]] };
    const base = EN_3SG[m[2]];
    const flags = base === 'live' && !LIVE_OK.includes(m[3]) ? [['nonsense', `"${en}"`]] : [];
    return { flags, right: variants(EN_VERB[base], 'present', 2, EN_PHRASE[m[3]], [m[1] === 'She' ? 'Ella' : 'Él']) };
  }
  if ((m = en.match(/^The (\w+)s are (on the table|on the chair|in the car|in the suitcase)\.$/))) {
    const sing = m[1];
    const nouns = Object.keys(NOUN_DATA).filter((n) => glossesOf(n)[0] === sing || (SPANISH_FOR[sing] || []).includes(n));
    if (!nouns.length) return { flags: [['unverified', `no Spanish known for "${sing}"`]] };
    const flags = [];
    if (!(SMALL_THINGS.includes(sing) || (sing === 'suitcase' && m[2] === 'in the car'))) flags.push(['nonsense', `"${en}"`]);
    const right = nouns.flatMap((n) => EN_SPOT[m[2]].map((spot) => `${capFirst(article(NOUN_DATA[n][0], 'p'))} ${NOUN_DATA[n][1]} están ${spot}`));
    return { flags, right, wrong: [`${capFirst(article(NOUN_DATA[nouns[0]][0], 'p'))} ${NOUN_DATA[nouns[0]][1]} son ${EN_SPOT[m[2]][0]}`] };
  }
  if ((m = en.match(/^(Yesterday|Last night) I (\w+) a lot\.$/))) {
    const base = EN_PAST[m[2]];
    if (!base) return { flags: [['english', `"${m[2]}" is not a past form the audit knows`]] };
    const flags = base === 'live' ? [['nonsense', `"${en}"`]] : [];
    const whens = m[1] === 'Yesterday' ? ['Ayer'] : ['Anoche', 'Ayer por la noche', 'Ayer en la noche'];
    const right = whens.flatMap((w) => EN_VERB[base].flatMap((inf) => {
      const form = conj(inf, 'preterite', 0);
      return [`${w} ${form} mucho`, `${w} yo ${form} mucho`];
    }));
    return { flags, right, wrong: [`${whens[0]} ${conj(EN_VERB[base][0], 'present', 0)} mucho`] };
  }
  return null;
}
verifier(/^Translate into Spanish: ([^"].+)$/, (it, m) => {
  const t = translations(m[1]);
  if (!t) return { flags: [['unverified', `no translation rule for "${m[1]}"`]] };
  if (!t.right) return { flags: t.flags };
  return { key: t.right.find((r) => same(r, it.answer)) || t.right[0], right: t.right, wrong: t.wrong || [], flags: t.flags || [] };
});

// Fixed items, reviewed by hand.
verifier(/^.+$/, (it) => {
  if (!Object.prototype.hasOwnProperty.call(FIXED_KEYS, it.prompt)) return null;
  return { key: FIXED_KEYS[it.prompt] };
});

// ═══ rendering ═══════════════════════════════════════════════════════════════
/** The item as content/bank.js would serve it, from a generator's raw output. */
function fromGenerator(raw) {
  const flags = [];
  if (raw.x && !raw.accepts) flags.push(['accepts-dropped', `"x" is not carried by bank.js; accepted answers ${JSON.stringify(raw.x)} are lost`]);
  const format = raw.format || 'multiple_choice';
  return {
    item: {
      format,
      prompt: String(raw.prompt || ''),
      answer: String(raw.answer),
      rationale: String(raw.rationale || ''),
      accepts: Array.isArray(raw.accepts) ? raw.accepts.map(String) : [],
      rawChoices: format === 'multiple_choice' ? (raw.choices || []).map(String) : null,
      choices: format === 'multiple_choice' ? [...new Set((raw.choices || []).map(String))] : null,
    },
    flags,
  };
}

/** The item as content/pool.js entryToItem builds it from a family rendering or a fixed entry. */
function fromEntry(entry, s) {
  const v = (f) => (typeof f === 'function' ? f(s) : f);
  const c = entry.c ? v(entry.c).map(String) : null;
  return {
    item: {
      format: c ? 'multiple_choice' : (entry.format || 'type_in'),
      prompt: String(v(entry.p)),
      answer: String(v(entry.a)),
      rationale: String(v(entry.r)),
      accepts: entry.x ? [].concat(v(entry.x)).map(String) : [],
      rawChoices: c,
      choices: c ? [...new Set(c)] : null,
    },
    flags: [],
  };
}

/** Every combination when affordable, a seeded sample when not. */
function* slotFills(entry, seedText) {
  const slots = entry.slots || {};
  const names = Object.keys(slots);
  const allArrays = names.every((n) => Array.isArray(slots[n]));
  const size = allArrays ? names.reduce((n, k) => n * slots[k].length, 1) : Infinity;
  if (size <= ENUMERATE_UP_TO) {
    const idx = names.map(() => 0);
    for (let i = 0; i < size; i++) {
      const s = {};
      names.forEach((n, j) => { s[n] = slots[n][idx[j]]; });
      yield s;
      for (let j = names.length - 1; j >= 0; j--) {
        idx[j]++;
        if (idx[j] < slots[names[j]].length) break;
        idx[j] = 0;
      }
    }
    return;
  }
  const rng = makeRng(`spanish-audit:${seedText}`);
  for (let i = 0; i < SAMPLES; i++) yield fillSlots(rng, slots);
}

// ═══ checking one item ═══════════════════════════════════════════════════════
const report = new Map(); // source key -> { rendered, flags: Map(code -> {n, examples}), shown: [] }
function bucket(key) {
  if (!report.has(key)) report.set(key, { rendered: 0, flags: new Map(), shown: [] });
  return report.get(key);
}
function flag(b, code, detail, it) {
  const f = b.flags.get(code) || { n: 0, examples: [] };
  f.n++;
  if (f.examples.length < EXAMPLES && !f.examples.some((e) => e.detail === detail)) {
    f.examples.push({ detail, prompt: it.prompt, answer: it.answer, choices: it.choices, accepts: it.accepts });
  }
  b.flags.set(code, f);
}

function graderItem(it) {
  return { format: it.format, answer: it.answer, accepts: it.accepts, choices: it.choices || undefined };
}

function auditItem(b, it, pre) {
  b.rendered++;
  if (b.shown.length < SHOW && b.rendered % 37 === 1) b.shown.push(it);
  const seen = new Set();
  const once = (code, detail) => {
    const k = `${code}:${detail}`;
    if (seen.has(k)) return;
    seen.add(k);
    flag(b, code, detail, it);
  };
  for (const [code, detail] of pre) once(code, detail);

  // Debris, anywhere.
  const all = [it.prompt, it.answer, it.rationale, ...it.accepts, ...(it.rawChoices || [])];
  for (const t of all) {
    let hit;
    if ((hit = t.match(DEBRIS))) once('debris', `"${hit[0]}" in "${t.slice(0, 80)}"`);
    if (/ {2,}|^\s|\s$/.test(t.replace(/\n/g, ' '))) once('debris', `stray spaces in "${t.slice(0, 80)}"`);
  }
  if (!it.answer.trim()) once('debris', 'empty answer');

  // Multiple choice.
  if (it.format === 'multiple_choice') {
    const c = it.rawChoices;
    if (!c.includes(it.answer)) once('key-not-a-choice', it.answer);
    const dupes = c.filter((x, i) => c.indexOf(x) !== i);
    if (dupes.length) once('duplicate-choice', dupes.join(', '));
    if (new Set(c).size < 3) once('too-few-choices', `${new Set(c).size} distinct`);
    if (c.some((x) => !x.trim())) once('debris', 'empty choice');
  }

  // The keyed answer, re-derived.
  let v = null;
  for (const { rx, fn } of VERIFIERS) {
    const m = it.prompt.match(rx);
    if (!m) continue;
    v = fn(it, m);
    if (v) break;
  }
  if (!v) {
    once('unverified', `no verifier recognises: "${it.prompt.slice(0, 90)}"`);
    v = {};
  }
  for (const [code, detail] of v.flags || []) once(code, detail);
  // A type-in key may differ from the audit's spelling in case or a final mark,
  // never in an accent.
  const loose = (t) => lc(t).replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();
  if (v.key != null && v.key !== it.answer && !(it.format !== 'multiple_choice' && loose(v.key) === loose(it.answer))) {
    once('wrong-key', `keyed "${it.answer}", the audit derives "${v.key}"`);
  }
  if (it.format === 'multiple_choice') {
    const rightBy = v.rightBy || (v.right ? (x) => v.right.includes(x) : null);
    if (rightBy) {
      for (const ch of it.choices) {
        if (ch !== it.answer && rightBy(ch)) once('two-right-answers', `"${ch}" is also right`);
      }
    }
  }

  // Grading through the real grader.
  const g = graderItem(it);
  const passes = (ans) => grade(g, ans).correct;
  if (!passes(it.answer)) once('key-not-graded', `the key "${it.answer}" does not grade correct`);
  if (it.format !== 'multiple_choice') {
    if (!passes(bare(it.answer))) once('accent-not-forgiven', `"${bare(it.answer)}" (no accents) is marked wrong`);
    for (const a of it.accepts) if (!passes(a)) once('accept-not-graded', `"${a}" does not grade correct`);
    for (const r of v.right || []) if (!passes(r)) once('rejects-right', `"${r}" is right and is marked wrong`);
    // Compared exactly: a wrong form that differs from the key only by an accent
    // (hablo for habló) is the case this is here to catch.
    for (const w of v.wrong || []) {
      if (w && w !== it.answer && !(v.right || []).includes(w) && passes(w)) once('accepts-wrong', `"${w}" is wrong and is marked right`);
    }
  }

  // Spanish and English mechanics on what a learner is told is right.
  const deliberate = v.deliberate || /^(Which word is wrong|Which of these has the wrong|Which of these is wrong|Someone rewrote|Fix the adjective|Make the adjective|Which adjective is wrong)/.test(it.prompt);
  const makeQuestion = /^Make this a question/.test(it.prompt);
  // When the question asks for the mistake, the key is the mistake.
  const trusted = [...(v.deliberate ? [] : [it.answer]), it.rationale, ...it.accepts, ...(v.trusted || [])];
  if (!deliberate) trusted.push(it.prompt);
  const out = [];
  for (const t of trusted) { mechanics(t, out); agreement(t, out); }
  if (deliberate) {
    // An error shown on purpose is still spelled right.
    const tmp = [];
    mechanics(it.prompt, tmp);
    out.push(...tmp.filter(([code]) => code === 'accent'));
  }
  for (const ch of (makeQuestion ? [] : (it.choices || []))) {
    const tmp = [];
    mechanics(ch, tmp);
    out.push(...tmp.filter(([code]) => code === 'accent' || code === 'punctuation'));
  }
  english(it.prompt, out);
  for (const [code, detail] of out) once(code, detail);
}

// ── grade-fit B2-C2 skills (content/spanish-grade-items.js, 2026-10-24) ─────
// The two families are worked again from tables written here: the imperfect
// subjunctive from the third-person plural preterite (tuvieron -> tuviera), and
// passive-se agreement from whether the thing is singular or plural. Every fixed
// item is held to REVIEWED_ES, the key it was fact-checked with when written; a
// new or edited one is "unverified" until it is checked and recorded here.
const REVIEWED_ES = {
  es_adv_grammar: {
    "Completa: Estudio mucho ___ aprobar el examen.": "para",
    "Completa: Gracias ___ tu ayuda.": "por",
    "Completa: Caminamos ___ el parque toda la tarde.": "por",
    "Completa: Llovía mucho; ___, salimos a correr.": "sin embargo",
    "Completa: No estudió nada; ___, suspendió el examen.": "por lo tanto",
    "Completa: A mí me gusta el té; mi hermano, ___, prefiere el café.": "en cambio",
    "Completa: ___ estaba cansada, terminó el informe.": "Aunque",
    "Ana dijo: «Mañana iré al médico». En estilo indirecto: Ana dijo que al día siguiente ___ al médico.": "iría",
    "El médico me dijo: «Descanse». En estilo indirecto: El médico me dijo que ___.": "descansara",
    "Completa: La profesora con ___ hablé es muy simpática.": "quien",
    "Completa: Es un escritor ___ novelas se han traducido a muchos idiomas.": "cuyas",
    "Completa: Si hubieras salido antes, ayer ___ (llegar) a tiempo.": "habrías llegado",
    "Completa: Si hubiéramos entrenado más, el sábado ___ (ganar) el partido.": "habríamos ganado",
    "Completa: Ayer me pidió que ___ (venir) temprano esa misma tarde.": "viniera",
    "Completa: Habla como si lo ___ (saber) todo.": "supiera",
    "¿Cuál de estas frases es correcta en la norma culta?": "Pienso que tienes razón.",
    "Completa: Ojalá ___ (venir) ayer; te habrías divertido.": "hubieras venido",
    "Compara «Aunque llueve, saldré» con «Aunque llueva, saldré». La segunda frase presenta la lluvia como": "algo posible o no confirmado",
    "En la oración «Se venden pisos», la construcción con «se» es": "una pasiva refleja",
    "En la oración «Se vive bien aquí», la construcción con «se» es": "una impersonal con se",
  },
  es_idioms_register: {
    "¿Qué significa «ser pan comido»?": "ser muy fácil",
    "¿Qué significa «echar una mano»?": "ayudar",
    "¿Qué significa «costar un ojo de la cara»?": "ser carísimo",
    "¿Qué significa «meter la pata»?": "cometer un error o una indiscreción",
    "¿Qué significa «tomar el pelo»?": "burlarse de alguien en broma",
    "¿Qué significa «estar en las nubes»?": "estar distraído",
    "¿Qué significa «tirar la toalla»?": "rendirse",
    "En la mayor parte de España, ¿qué pronombre se usa para hablar de manera informal con un grupo de amigos?": "vosotros",
    "¿Qué significa «no tener pelos en la lengua»?": "decir lo que se piensa sin rodeos",
    "¿Qué significa «dar en el clavo»?": "acertar",
    "En Argentina y Uruguay, ¿qué forma verbal acompaña normalmente al pronombre «vos»?": "vos tenés",
    "¿Qué significa «estar hasta las narices»?": "estar harto",
    "¿Qué significa «hacer la vista gorda»?": "fingir que no se ve algo",
    "¿Cuál es la fórmula más adecuada para cerrar una carta formal?": "Atentamente,",
    "¿Cuál es el saludo más adecuado para empezar una carta formal?": "Estimado señor:",
    "¿Qué significa «ser uña y carne»?": "ser inseparables",
    "¿Qué significa «quedarse de piedra»?": "quedarse muy sorprendido",
    "La palabra coloquial «guay», con el sentido de «estupendo», es típica de": "España",
    "¿Qué significa «no dar pie con bola»?": "no acertar en nada",
    "¿Qué significa «importar un pepino»?": "no importar nada",
    "En el español de Argentina, un «pibe» es": "un niño o un chico",
    "¿Qué es el seseo?": "pronunciar la z y la c (ante e, i) como s",
    "¿Qué es el yeísmo?": "pronunciar igual la ll y la y",
    "¿Qué es el leísmo?": "usar «le» como complemento directo en lugar de «lo» o «la»",
    "La Real Academia Española admite el leísmo cuando el complemento directo es": "una persona de género masculino en singular",
    "¿Qué significa «estar embarazada»?": "esperar un bebé",
    "En español, el adjetivo «actual» significa": "presente, de ahora",
    "En español, una persona «sensible» es una persona": "que se emociona o percibe las cosas con facilidad",
    "Llueve a mares el día de tu pícnic y alguien comenta: «¡Qué día tan estupendo!». Es un ejemplo de": "ironía",
    "¿Cómo se llama la variedad del español de Buenos Aires y Montevideo?": "el español rioplatense",
    "En el español de casi toda América, ¿qué pronombre ocupa el lugar de «vosotros»?": "ustedes",
    "¿Qué es el voseo?": "el uso de «vos» como pronombre de segunda persona del singular",
    "El lunfardo es": "un argot nacido en Buenos Aires",
    "El judeoespañol que conservaron los sefardíes tras ser expulsados de España (1492) se llama también": "ladino",
  },
  es_literature: {
    "¿Quién escribió «Don Quijote de la Mancha»?": "Miguel de Cervantes",
    "¿Quién escribió «Cien años de soledad»?": "Gabriel García Márquez",
    "¿En qué pueblo imaginario transcurre «Cien años de soledad»?": "Macondo",
    "¿Quién escribió «Pedro Páramo»?": "Juan Rulfo",
    "¿Quién escribió «La casa de Bernarda Alba»?": "Federico García Lorca",
    "¿Qué poeta nicaragüense encabezó el modernismo con «Azul…» (1888)?": "Rubén Darío",
    "¿Quién es el héroe del «Cantar de mio Cid»?": "Rodrigo Díaz de Vivar",
    "¿Qué obra anónima de 1554 inaugura la novela picaresca?": "«Lazarillo de Tormes»",
    "¿Quién escribió «La vida es sueño»?": "Pedro Calderón de la Barca",
    "¿Qué obra de Tirso de Molina creó el personaje de don Juan?": "«El burlador de Sevilla»",
    "¿Qué autora mexicana escribió «Como agua para chocolate»?": "Laura Esquivel",
    "«Fuenteovejuna» es una obra de": "Lope de Vega",
    "Gustavo Adolfo Bécquer es el autor de": "las «Rimas»",
    "¿Cuál de estos escritores pertenece a la Generación del 98?": "Miguel de Unamuno",
    "«Campos de Castilla» (1912) es un libro de poemas de": "Antonio Machado",
    "El esperpento, que deforma la realidad para criticarla, es la estética de": "Ramón del Valle-Inclán",
    "¿Qué novela de Leopoldo Alas «Clarín» transcurre en Vetusta?": "«La Regenta»",
    "¿Quién escribió «Rayuela» (1963)?": "Julio Cortázar",
    "«Ficciones» (1944) es un libro de cuentos de": "Jorge Luis Borges",
    "¿Quién fue la primera persona latinoamericana en recibir el Premio Nobel de Literatura?": "Gabriela Mistral",
    "«El laberinto de la soledad» (1950), ensayo sobre la identidad mexicana, es de": "Octavio Paz",
    "¿Quién escribió la «Respuesta a sor Filotea de la Cruz»?": "sor Juana Inés de la Cruz",
    "«The House on Mango Street» (1984), clásico de la literatura latina de Estados Unidos, es de": "Sandra Cisneros",
    "Con Juan Boscán, Garcilaso de la Vega introdujo en la poesía castellana": "el endecasílabo y el soneto italianos",
    "En el romance tradicional, los versos son octosílabos y riman": "en asonante los pares",
    "¿Qué cineasta dirigió «Un perro andaluz» (1929) junto a Salvador Dalí?": "Luis Buñuel",
    "¿Quién dirigió «El laberinto del fauno» (2006)?": "Guillermo del Toro",
    "Antonio de Nebrija publicó la primera gramática del castellano en": "1492",
    "La Real Academia Española se fundó en": "1713",
    "La Constitución española vigente se aprobó en": "1978",
    "La guerra civil española duró": "de 1936 a 1939",
    "Las greguerías, frases breves de humor e ingenio, son creación de": "Ramón Gómez de la Serna",
    "«La casa de los espíritus» (1982) es la primera novela de": "Isabel Allende",
    "¿Qué escritor peruano recibió el Premio Nobel de Literatura en 2010?": "Mario Vargas Llosa",
  },
};
const PRET_3PL = {
  tener: 'tuvieron', ser: 'fueron', poder: 'pudieron', saber: 'supieron', hacer: 'hicieron', estar: 'estuvieron',
  querer: 'quisieron', decir: 'dijeron', hablar: 'hablaron', vivir: 'vivieron', venir: 'vinieron', poner: 'pusieron',
};
verifier(/^Completa con la forma correcta: Si (yo|ella|él) ___ \((\w+)\) ([^,]+), (.+)\.$/, (it, m) => {
  const pret = PRET_3PL[m[2]];
  if (!pret) return { flags: [['unverified', `no preterite for ${m[2]}`]] };
  const key = `${pret.slice(0, -3)}ra`;
  const flags = [];
  if (!/\b\w+ría(mos|n)?\b/.test(m[4])) flags.push(['unreal-condition', `the main clause "${m[4]}" has no conditional`]);
  return { key, right: [key, `${pret.slice(0, -3)}se`], flags, trusted: [it.prompt.replace('___', key).replace(` (${m[2]})`, '')] };
});
verifier(/^Completa con la forma correcta: En esta tienda se ___ \((\w+)(ar|er|ir)\) (.+)\.$/, (it, m) => {
  const head = m[3].split(' ')[0];
  const singular = /^(un|una)$/.test(head) || !/s$/.test(head);
  const ending = m[2] === 'ar' ? 'a' : 'e';
  const key = `${m[1]}${ending}${singular ? '' : 'n'}`;
  return { key, right: [key], trusted: [it.prompt.replace('___', key).replace(` (${m[1]}${m[2]})`, '')] };
});
verifier(/[\s\S]*/, (it) => {
  for (const table of Object.values(REVIEWED_ES)) if (Object.prototype.hasOwnProperty.call(table, it.prompt)) return { key: table[it.prompt] };
  return null;
});

// ═══ the run ═════════════════════════════════════════════════════════════════
const skillOk = (skill) => !ONLY || skill === ONLY;

// Wiring: a shape attached to no skill is never served.
for (const skill of Object.keys(SHAPES)) {
  if (!skillOk(skill)) continue;
  if (!ITEMS.GENERATORS[skill]) {
    const b = bucket(`spanish-shapes/${skill}`);
    flag(b, 'dead-shape', `no Spanish skill "${skill}", so these shapes are never served`, { prompt: '(wiring)', answer: '' });
  }
}

// The procedural generators, before pools or shapes are mixed in.
const BASE = ITEMS.BASE_GENERATORS || null;
const POOLED = new Set([...Object.keys(ITEMS.POOLS || {}), ...Object.keys(FAMILIES)]);
const baseSkills = BASE ? Object.keys(BASE) : Object.keys(ITEMS.GENERATORS).filter((s) => !POOLED.has(s));
for (const skill of baseSkills) {
  if (!skillOk(skill)) continue;
  const b = bucket(`spanish-items/${skill}`);
  // Without the export (an older content folder), the wired generator serves its
  // base after its shape turns are spent: twelve warm-up calls reach that point.
  const gen = BASE ? BASE[skill] : ITEMS.GENERATORS[skill];
  if (!BASE) for (let i = 0; i < 12; i++) gen(makeRng(`warm:${i}`), 5, {});
  for (let d = 1; d <= 10; d++) {
    for (let k = 0; k < SEEDS; k++) {
      const { item: it, flags } = fromGenerator(gen(makeRng(`spanish-audit:${skill}:${d}:${k}`), d, {}));
      auditItem(b, it, flags);
    }
  }
}

// The shapes, each called directly.
for (const [skill, shape] of Object.entries(SHAPES)) {
  if (!skillOk(skill)) continue;
  const b = bucket(`spanish-shapes/${skill}`);
  for (let d = 1; d <= 10; d++) {
    for (let k = 0; k < SEEDS; k++) {
      let raw;
      try {
        raw = shape(makeRng(`spanish-audit:shape:${skill}:${d}:${k}`), d, {}, LEXICON);
      } catch (err) {
        flag(b, 'throws', err.message, { prompt: `${skill} d=${d} k=${k}`, answer: '' });
        continue;
      }
      const { item: it, flags } = fromGenerator(raw);
      auditItem(b, it, flags);
    }
  }
}

// The authored pools.
for (const [skill, list] of Object.entries(ITEMS.POOLS || {})) {
  if (!skillOk(skill)) continue;
  const b = bucket(`spanish-items/POOLS.${skill}`);
  for (const entry of list) {
    const { item: it, flags } = fromEntry(entry, {});
    auditItem(b, it, flags);
  }
}

// The families, every slot combination where that is affordable.
for (const [skill, list] of Object.entries(FAMILIES)) {
  if (!skillOk(skill)) continue;
  list.forEach((entry, i) => {
    const key = `spanish-families/${skill}[${i}]`;
    const b = bucket(key);
    for (const s of slotFills(entry, key)) {
      let built;
      try {
        built = fromEntry(entry, s);
      } catch (err) {
        flag(b, 'throws', err.message, { prompt: JSON.stringify(s).slice(0, 120), answer: '' });
        continue;
      }
      auditItem(b, built.item, built.flags);
    }
  });
}

// The wired generators, as content/bank.js calls them: rotation and pooling.
for (const [skill, gen] of Object.entries(ITEMS.GENERATORS)) {
  if (!skillOk(skill)) continue;
  const b = bucket(`wired/${skill}`);
  for (let k = 0; k < 60; k++) {
    const d = 1 + (k % 10);
    const { item: it, flags } = fromGenerator((() => {
      const raw = gen(makeRng(`spanish-audit:wired:${skill}:${k}`), d, { avoid: new Set() });
      return { ...raw, prompt: raw.prompt, answer: raw.answer, accepts: raw.accepts };
    })());
    auditItem(b, it, flags);
  }
}

// The grade-fit B2-C2 skills: every fixed item, every family rendering, and the
// wired generator as content/bank.js calls it.
{
  let FIT;
  try { FIT = load('spanish-grade-items'); } catch (err) {
    // A content folder from before this skill set (--content=backup) has none.
    if (!(err.code === 'MODULE_NOT_FOUND' && /spanish-grade-items/.test(err.message))) throw err;
  }
  for (const [skill, list] of Object.entries(FIT ? FIT.POOLS : {})) {
    if (!skillOk(skill)) continue;
    list.forEach((entry, i) => {
      const key = `spanish-grade-items/${skill}${typeof entry.p === 'function' ? `[${i}]` : ''}`;
      const b = bucket(key);
      if (typeof entry.p !== 'function') { const { item, flags } = fromEntry(entry, {}); auditItem(b, item, flags); return; }
      for (const s of slotFills(entry, key)) { const built = fromEntry(entry, s); auditItem(b, built.item, built.flags); }
    });
    const b = bucket(`wired/${skill}`);
    for (let k = 0; k < 200; k++) {
      const raw = FIT.GENERATORS[skill](makeRng(`spanish-audit:grade-fit:${skill}:${k}`), 1 + (k % 10), { avoid: new Set() });
      const { item: it, flags } = fromGenerator(raw);
      auditItem(b, it, flags);
    }
  }
}

// ═══ the report ══════════════════════════════════════════════════════════════
let renderings = 0;
let problems = 0;
const flagged = [];
for (const [key, b] of report) {
  renderings += b.rendered;
  const n = [...b.flags.values()].reduce((t, f) => t + f.n, 0);
  problems += n;
  if (n) flagged.push(key);
  if (SHOW && b.shown.length) {
    console.log(`\n${key}  (${b.rendered} rendered)`);
    for (const it of b.shown) {
      console.log(`  Q: ${it.prompt.replace(/\n/g, ' / ')}`);
      if (it.choices) console.log(`     [${it.choices.join(' | ')}]`);
      console.log(`     key: ${it.answer}${it.accepts.length ? `  (also: ${it.accepts.join(' / ')})` : ''}`);
    }
  }
}

console.log('\nSpanish template audit');
console.log(`${report.size} sources (families, shapes, pools, generators), ${renderings} renderings\n`);
console.log('source'.padEnd(44) + 'rendered  flags');
for (const [key, b] of report) {
  const n = [...b.flags.values()].reduce((t, f) => t + f.n, 0);
  console.log(`${key.padEnd(44)}${String(b.rendered).padStart(8)}${String(n).padStart(7)}`);
}

for (const key of flagged) {
  const b = report.get(key);
  console.log(`\n✗ ${key}`);
  for (const [code, f] of b.flags) {
    console.log(`    ${code} ×${f.n}`);
    for (const ex of f.examples) {
      console.log(`      - ${ex.detail}`);
      console.log(`        Q: ${String(ex.prompt).replace(/\n/g, ' / ')}`);
      if (ex.choices) console.log(`        [${ex.choices.join(' | ')}]  key: ${ex.answer}`);
      else console.log(`        key: ${ex.answer}${ex.accepts && ex.accepts.length ? `  (accepts: ${ex.accepts.join(' / ')})` : ''}`);
    }
  }
}

if (problems) {
  console.log(`\n${problems} problem renderings in ${flagged.length} sources.`);
  process.exit(1);
}
console.log('\nClean: every rendering passed.');
