/**
 * Spanish skills for B2 to C2 (grade-fit, 2026-10-24).
 *
 * The rest of the Spanish bank stops at about B1: "What does zapato mean?",
 * present-tense conjugation, "Translate: The books are in the suitcase." A C1 or
 * C2 grade (pragmatics, dialects, literature, translation, linguistics) was being
 * served exactly that. These three are written for those grades, in Spanish:
 *
 *   es_adv_grammar      si-clauses with the imperfect subjunctive, the conditional
 *                       perfect, passive and impersonal se, connectors, reported
 *                       speech, relatives, como si, dequeísmo
 *   es_idioms_register  idioms, formal and informal register, regional words,
 *                       voseo, seseo, yeísmo, leísmo, false friends
 *   es_literature       the canon from the Cantar de mio Cid to the Boom, cinema,
 *                       and the dates of the language's institutions
 *
 * Which grade may use which is config/grade-skills.js. The families are re-derived
 * by scripts/spanish-template-audit.js from its own tables; the fixed items are
 * checked there against REVIEWED_ES, the key each was fact-checked with.
 */
const { fromPool } = require('./pool');

// ── advanced grammar ────────────────────────────────────────────────────────
// Si + imperfect subjunctive, then a conditional. Forms are first/third person
// singular: [imperfect subjunctive, present subjunctive, conditional, imperfect].
const SI_VERBS = [
  { inf: 'tener', forms: ['tuviera', 'tenga', 'tendría', 'tenía'], s: 'Si yo ___ (tener) más tiempo, leería más novelas.' },
  { inf: 'ser', forms: ['fuera', 'sea', 'sería', 'era'], s: 'Si ella ___ (ser) la directora, cambiaría las normas.' },
  { inf: 'poder', forms: ['pudiera', 'pueda', 'podría', 'podía'], s: 'Si yo ___ (poder) elegir, viviría junto al mar.' },
  { inf: 'saber', forms: ['supiera', 'sepa', 'sabría', 'sabía'], s: 'Si él ___ (saber) la respuesta, te la diría.' },
  { inf: 'hacer', forms: ['hiciera', 'haga', 'haría', 'hacía'], s: 'Si ella ___ (hacer) ejercicio cada día, se sentiría mejor.' },
  { inf: 'estar', forms: ['estuviera', 'esté', 'estaría', 'estaba'], s: 'Si yo ___ (estar) en tu lugar, aceptaría la oferta.' },
  { inf: 'querer', forms: ['quisiera', 'quiera', 'querría', 'quería'], s: 'Si él ___ (querer) ayudarnos, nos llamaría.' },
  { inf: 'decir', forms: ['dijera', 'diga', 'diría', 'decía'], s: 'Si ella ___ (decir) la verdad, todos la creerían.' },
  { inf: 'hablar', forms: ['hablara', 'hable', 'hablaría', 'hablaba'], s: 'Si yo ___ (hablar) japonés, buscaría trabajo en Tokio.' },
  { inf: 'vivir', forms: ['viviera', 'viva', 'viviría', 'vivía'], s: 'Si él ___ (vivir) más cerca, nos visitaría más.' },
  { inf: 'venir', forms: ['viniera', 'venga', 'vendría', 'venía'], s: 'Si ella ___ (venir) mañana, prepararíamos una cena.' },
  { inf: 'poner', forms: ['pusiera', 'ponga', 'pondría', 'ponía'], s: 'Si yo ___ (poner) la alarma, me despertaría a tiempo.' },
];
// Passive se: the verb agrees with the thing sold, repaired, rented or bought.
// Each verb is paired only with things that make sense with it.
const SE_VERBS = { vender: ['vende', 'venden', 'vendemos'], reparar: ['repara', 'reparan', 'reparamos'], alquilar: ['alquila', 'alquilan', 'alquilamos'], comprar: ['compra', 'compran', 'compramos'] };
const SE_PAIRS = [
  ['vender', 'bicicletas'], ['vender', 'libros de texto'], ['vender', 'pan recién hecho'], ['vender', 'ropa de segunda mano'], ['vender', 'un piano'],
  ['reparar', 'bicicletas'], ['reparar', 'muebles antiguos'], ['reparar', 'un piano'], ['reparar', 'coches usados'],
  ['alquilar', 'bicicletas'], ['alquilar', 'una furgoneta'], ['alquilar', 'coches'],
  ['comprar', 'libros de texto'], ['comprar', 'muebles antiguos'], ['comprar', 'ropa de segunda mano'], ['comprar', 'oro'],
];
const seSingular = (thing) => /^(un|una|pan|ropa|oro)( |$)/.test(thing);

const ADV_GRAMMAR = [
  {
    dr: [5, 8],
    slots: { v: SI_VERBS },
    p: (s) => `Completa con la forma correcta: ${s.v.s}`,
    c: (s) => s.v.forms,
    a: (s) => s.v.forms[0],
    r: (s) => `Una condición irreal en el presente lleva «si» + imperfecto de subjuntivo y el condicional en la otra parte: ${s.v.s.replace('___', s.v.forms[0]).replace(` (${s.v.inf})`, '')}`,
    frame: 'si + imperfecto de subjuntivo',
    varies: ['v'],
  },
  {
    dr: [4, 7],
    slots: { pair: SE_PAIRS },
    p: (s) => `Completa con la forma correcta: En esta tienda se ___ (${s.pair[0]}) ${s.pair[1]}.`,
    c: (s) => [...SE_VERBS[s.pair[0]], s.pair[0]],
    a: (s) => SE_VERBS[s.pair[0]][seSingular(s.pair[1]) ? 0 : 1],
    r: (s) => `En la pasiva refleja el verbo concuerda con «${s.pair[1]}», que es ${seSingular(s.pair[1]) ? 'singular' : 'plural'}: se ${SE_VERBS[s.pair[0]][seSingular(s.pair[1]) ? 0 : 1]} ${s.pair[1]}.`,
    frame: 'pasiva refleja: concordancia',
    varies: ['pair'],
  },
  { d: 4, p: 'Completa: Estudio mucho ___ aprobar el examen.', c: ['para', 'por', 'de', 'con'], a: 'para', r: '«Para» + infinitivo expresa finalidad.' },
  { d: 4, p: 'Completa: Gracias ___ tu ayuda.', c: ['por', 'para', 'de', 'a'], a: 'por', r: 'Se agradece algo «por» un motivo: gracias por tu ayuda.' },
  { d: 4.5, p: 'Completa: Caminamos ___ el parque toda la tarde.', c: ['por', 'para', 'hasta', 'desde'], a: 'por', r: '«Por» indica movimiento a través de un lugar.' },
  { d: 5, p: 'Completa: Llovía mucho; ___, salimos a correr.', c: ['sin embargo', 'por lo tanto', 'es decir', 'además'], a: 'sin embargo', r: '«Sin embargo» introduce algo contrario a lo esperable.' },
  { d: 5, p: 'Completa: No estudió nada; ___, suspendió el examen.', c: ['por lo tanto', 'sin embargo', 'en cambio', 'no obstante'], a: 'por lo tanto', r: '«Por lo tanto» presenta una consecuencia.' },
  { d: 5.5, p: 'Completa: A mí me gusta el té; mi hermano, ___, prefiere el café.', c: ['en cambio', 'por eso', 'así que', 'por consiguiente'], a: 'en cambio', r: '«En cambio» contrasta dos personas o ideas.' },
  { d: 6, p: 'Completa: ___ estaba cansada, terminó el informe.', c: ['Aunque', 'Porque', 'Por lo tanto', 'Así que'], a: 'Aunque', r: '«Aunque» introduce una concesión: el cansancio no impidió terminarlo.' },
  { d: 6, p: 'Ana dijo: «Mañana iré al médico». En estilo indirecto: Ana dijo que al día siguiente ___ al médico.', c: ['iría', 'fue', 'vaya', 'ha ido'], a: 'iría', r: 'En estilo indirecto con verbo en pasado, el futuro pasa a condicional: iré → iría.' },
  { d: 6.5, p: 'El médico me dijo: «Descanse». En estilo indirecto: El médico me dijo que ___.', c: ['descansara', 'descanso', 'descansaré', 'descansaba'], a: 'descansara', r: 'Una orden referida en pasado pasa a imperfecto de subjuntivo: que descansara (o descansase).' },
  { d: 6.5, p: 'Completa: La profesora con ___ hablé es muy simpática.', c: ['quien', 'que', 'cuyo', 'cual'], a: 'quien', r: 'Tras preposición y referido a persona se usa «quien» (o «la que», «la cual»).' },
  { d: 7, p: 'Completa: Es un escritor ___ novelas se han traducido a muchos idiomas.', c: ['cuyas', 'cuyo', 'que', 'quien'], a: 'cuyas', r: '«Cuyo» concuerda con lo poseído, no con el poseedor: cuyas novelas.' },
  { d: 7.5, p: 'Completa: Si hubieras salido antes, ayer ___ (llegar) a tiempo.', c: ['habrías llegado', 'llegarías', 'llegaste', 'habrás llegado'], a: 'habrías llegado', r: 'Una condición irreal en el pasado pide pluscuamperfecto de subjuntivo y condicional compuesto.' },
  { d: 7.5, p: 'Completa: Si hubiéramos entrenado más, el sábado ___ (ganar) el partido.', c: ['habríamos ganado', 'ganaríamos', 'ganamos', 'habremos ganado'], a: 'habríamos ganado', r: 'El resultado irreal en el pasado va en condicional compuesto: habríamos ganado.' },
  { d: 8, p: 'Completa: Ayer me pidió que ___ (venir) temprano esa misma tarde.', c: ['viniera', 'venga', 'vendría', 'vine'], a: 'viniera', r: 'Tras un verbo de petición en pasado, el subordinado va en imperfecto de subjuntivo.' },
  { d: 8.5, p: 'Completa: Habla como si lo ___ (saber) todo.', c: ['supiera', 'sabe', 'sepa', 'sabría'], a: 'supiera', r: '«Como si» exige imperfecto (o pluscuamperfecto) de subjuntivo.' },
  { d: 9, p: '¿Cuál de estas frases es correcta en la norma culta?', c: ['Pienso que tienes razón.', 'Pienso de que tienes razón.', 'Me alegro que hayas venido.', 'Estoy seguro que vendrá.'], a: 'Pienso que tienes razón.', r: '«Pienso de que» es dequeísmo; «me alegro que» y «estoy seguro que» son queísmo (lo culto es «me alegro de que», «estoy seguro de que»).' },
  { d: 9, p: 'Completa: Ojalá ___ (venir) ayer; te habrías divertido.', c: ['hubieras venido', 'vengas', 'vinieras', 'has venido'], a: 'hubieras venido', r: 'Un deseo imposible sobre el pasado lleva pluscuamperfecto de subjuntivo.' },
  { d: 9.5, p: 'Compara «Aunque llueve, saldré» con «Aunque llueva, saldré». La segunda frase presenta la lluvia como', c: ['algo posible o no confirmado', 'un hecho comprobado', 'algo que ya terminó', 'la causa de no salir'], a: 'algo posible o no confirmado', r: 'Con indicativo la concesión es un hecho; con subjuntivo es hipotética o no se da por cierta.' },
  { d: 10, p: 'En la oración «Se venden pisos», la construcción con «se» es', c: ['una pasiva refleja', 'una impersonal con se', 'un se recíproco', 'un se reflexivo'], a: 'una pasiva refleja', r: 'El verbo concuerda con «pisos», que es el sujeto paciente: pasiva refleja.' },
  { d: 10, p: 'En la oración «Se vive bien aquí», la construcción con «se» es', c: ['una impersonal con se', 'una pasiva refleja', 'un se recíproco', 'un dativo de interés'], a: 'una impersonal con se', r: 'No hay sujeto con el que concordar; el verbo va en singular: impersonal con se.' },
];

// ── idioms, register and variation ──────────────────────────────────────────
const IDIOMS_REGISTER = [
  { d: 5, p: '¿Qué significa «ser pan comido»?', c: ['ser muy fácil', 'tener mucha hambre', 'ser muy barato', 'estar recién hecho'], a: 'ser muy fácil', r: '«Esto es pan comido» quiere decir que es facilísimo.' },
  { d: 5, p: '¿Qué significa «echar una mano»?', c: ['ayudar', 'saludar con la mano', 'pegar a alguien', 'rechazar una oferta'], a: 'ayudar', r: '«¿Me echas una mano?» es pedir ayuda.' },
  { d: 5.5, p: '¿Qué significa «costar un ojo de la cara»?', c: ['ser carísimo', 'doler mucho', 'ser muy feo', 'verse con dificultad'], a: 'ser carísimo', r: 'Se dice de algo que tiene un precio muy alto.' },
  { d: 5.5, p: '¿Qué significa «meter la pata»?', c: ['cometer un error o una indiscreción', 'caminar mal', 'enfadarse mucho', 'ir muy deprisa'], a: 'cometer un error o una indiscreción', r: 'Meter la pata es equivocarse, sobre todo diciendo algo inoportuno.' },
  { d: 6, p: '¿Qué significa «tomar el pelo»?', c: ['burlarse de alguien en broma', 'cortarle el pelo', 'enfadarse con alguien', 'peinar a alguien'], a: 'burlarse de alguien en broma', r: '«¿Me estás tomando el pelo?» es preguntar si te están engañando en broma.' },
  { d: 6, p: '¿Qué significa «estar en las nubes»?', c: ['estar distraído', 'estar muy contento', 'viajar en avión', 'tener fiebre'], a: 'estar distraído', r: 'Quien está en las nubes no presta atención a lo que pasa.' },
  { d: 6, p: '¿Qué significa «tirar la toalla»?', c: ['rendirse', 'limpiar la casa', 'ir a la playa', 'ganar una pelea'], a: 'rendirse', r: 'Viene del boxeo: tirar la toalla es abandonar.' },
  { d: 6, p: 'En la mayor parte de España, ¿qué pronombre se usa para hablar de manera informal con un grupo de amigos?', c: ['vosotros', 'ustedes', 'nosotros', 'vos'], a: 'vosotros', r: 'En casi toda España se usa «vosotros» en el trato informal; «ustedes» es formal.' },
  { d: 6.5, p: '¿Qué significa «no tener pelos en la lengua»?', c: ['decir lo que se piensa sin rodeos', 'hablar muy poco', 'no saber cocinar', 'mentir a menudo'], a: 'decir lo que se piensa sin rodeos', r: 'Es hablar con total franqueza.' },
  { d: 6.5, p: '¿Qué significa «dar en el clavo»?', c: ['acertar', 'hacerse daño', 'construir algo', 'equivocarse'], a: 'acertar', r: 'Dar en el clavo es acertar de lleno.' },
  { d: 6.5, p: 'En Argentina y Uruguay, ¿qué forma verbal acompaña normalmente al pronombre «vos»?', c: ['vos tenés', 'vos tienes', 'vos tengas', 'vos tuvistes'], a: 'vos tenés', r: 'El voseo rioplatense tiene formas propias en presente: vos tenés, vos sabés, vos sos.' },
  { d: 7, p: '¿Qué significa «estar hasta las narices»?', c: ['estar harto', 'estar resfriado', 'oler mal', 'estar muy ocupado'], a: 'estar harto', r: 'Estar hasta las narices es no aguantar más una situación.' },
  { d: 7, p: '¿Qué significa «hacer la vista gorda»?', c: ['fingir que no se ve algo', 'necesitar gafas', 'mirar fijamente', 'enfadarse'], a: 'fingir que no se ve algo', r: 'Se hace la vista gorda para tolerar algo sin decir nada.' },
  { d: 7, p: '¿Cuál es la fórmula más adecuada para cerrar una carta formal?', c: ['Atentamente,', 'Un abrazo,', 'Besos,', 'Chao,'], a: 'Atentamente,', r: '«Atentamente» es la despedida estándar en la correspondencia formal.' },
  { d: 7, p: '¿Cuál es el saludo más adecuado para empezar una carta formal?', c: ['Estimado señor:', '¡Hola, tío!', '¿Qué onda?', 'Querido amigo:'], a: 'Estimado señor:', r: 'En español el saludo de una carta formal va seguido de dos puntos: «Estimado señor:».' },
  { d: 7.5, p: '¿Qué significa «ser uña y carne»?', c: ['ser inseparables', 'pelearse siempre', 'ser parientes lejanos', 'no conocerse'], a: 'ser inseparables', r: 'Se dice de dos personas muy unidas.' },
  { d: 7.5, p: '¿Qué significa «quedarse de piedra»?', c: ['quedarse muy sorprendido', 'quedarse dormido', 'ponerse enfermo', 'ponerse furioso'], a: 'quedarse muy sorprendido', r: 'Es quedarse paralizado por la sorpresa.' },
  { d: 7.5, p: 'La palabra coloquial «guay», con el sentido de «estupendo», es típica de', c: ['España', 'México', 'Argentina', 'Chile'], a: 'España', r: '«Guay» es coloquial peninsular; en México se dice «padre» y en Argentina «copado».' },
  { d: 8, p: '¿Qué significa «no dar pie con bola»?', c: ['no acertar en nada', 'jugar bien al fútbol', 'caminar descalzo', 'tener mucha suerte'], a: 'no acertar en nada', r: 'Es equivocarse una y otra vez.' },
  { d: 8, p: '¿Qué significa «importar un pepino»?', c: ['no importar nada', 'importar mucho', 'gustar la verdura', 'ser muy caro'], a: 'no importar nada', r: '«Me importa un pepino» expresa total indiferencia.' },
  { d: 8, p: 'En el español de Argentina, un «pibe» es', c: ['un niño o un chico', 'un amigo íntimo', 'un policía', 'un jefe'], a: 'un niño o un chico', r: '«Pibe» (y «piba») es la forma rioplatense de llamar a un chico o una chica.' },
  { d: 8, p: '¿Qué es el seseo?', c: ['pronunciar la z y la c (ante e, i) como s', 'pronunciar la s como z', 'no pronunciar la s final', 'pronunciar igual la ll y la y'], a: 'pronunciar la z y la c (ante e, i) como s', r: 'El seseo es general en América, Canarias y parte de Andalucía; lo último descrito es el yeísmo.' },
  { d: 8, p: '¿Qué es el yeísmo?', c: ['pronunciar igual la ll y la y', 'pronunciar la z como s', 'usar «le» en lugar de «lo»', 'usar «vos» en lugar de «tú»'], a: 'pronunciar igual la ll y la y', r: 'Con yeísmo «pollo» y «poyo» suenan igual; es mayoritario en el mundo hispanohablante.' },
  { d: 8.5, p: '¿Qué es el leísmo?', c: ['usar «le» como complemento directo en lugar de «lo» o «la»', 'usar «la» como complemento indirecto', 'usar «lo» como complemento indirecto', 'omitir el pronombre átono'], a: 'usar «le» como complemento directo en lugar de «lo» o «la»', r: 'Usar «la» por «le» es laísmo y «lo» por «le», loísmo.' },
  { d: 8.5, p: 'La Real Academia Española admite el leísmo cuando el complemento directo es', c: ['una persona de género masculino en singular', 'una cosa de género femenino', 'un objeto en plural', 'un animal hembra'], a: 'una persona de género masculino en singular', r: '«A Juan le vi ayer» se admite; con cosas o mujeres el leísmo no se acepta en la norma.' },
  { d: 8.5, p: '¿Qué significa «estar embarazada»?', c: ['esperar un bebé', 'sentir vergüenza', 'estar enfadada', 'estar cansada'], a: 'esperar un bebé', r: 'Es un falso amigo: «avergonzada» es lo que significa embarrassed.' },
  { d: 9, p: 'En español, el adjetivo «actual» significa', c: ['presente, de ahora', 'real o verdadero', 'antiguo', 'activo'], a: 'presente, de ahora', r: 'Falso amigo del inglés actual, que se traduce por «real» o «verdadero».' },
  { d: 9, p: 'En español, una persona «sensible» es una persona', c: ['que se emociona o percibe las cosas con facilidad', 'sensata y prudente', 'que no siente nada', 'muy valiente'], a: 'que se emociona o percibe las cosas con facilidad', r: 'Falso amigo: sensible en inglés se dice «sensato».' },
  { d: 9, p: 'Llueve a mares el día de tu pícnic y alguien comenta: «¡Qué día tan estupendo!». Es un ejemplo de', c: ['ironía', 'hipérbole', 'metáfora', 'aliteración'], a: 'ironía', r: 'Se dice lo contrario de lo que se quiere dar a entender.' },
  { d: 9.5, p: '¿Cómo se llama la variedad del español de Buenos Aires y Montevideo?', c: ['el español rioplatense', 'el español andaluz', 'el español caribeño', 'el español andino'], a: 'el español rioplatense', r: 'Toma su nombre del Río de la Plata y se caracteriza, entre otras cosas, por el voseo.' },
  { d: 9.5, p: 'En el español de casi toda América, ¿qué pronombre ocupa el lugar de «vosotros»?', c: ['ustedes', 'vos', 'nosotros', 'ellos'], a: 'ustedes', r: 'En América «ustedes» sirve para el plural formal e informal.' },
  { d: 10, p: '¿Qué es el voseo?', c: ['el uso de «vos» como pronombre de segunda persona del singular', 'el uso de «vosotros» en América', 'el uso de «usted» entre amigos', 'la pérdida de la s final'], a: 'el uso de «vos» como pronombre de segunda persona del singular', r: 'Es general en el Río de la Plata y frecuente en Centroamérica, con distintos grados de aceptación.' },
  { d: 10, p: 'El lunfardo es', c: ['un argot nacido en Buenos Aires', 'una lengua indígena de Perú', 'el español de Guinea Ecuatorial', 'el dialecto de Galicia'], a: 'un argot nacido en Buenos Aires', r: 'Surgió a finales del siglo XIX en Buenos Aires y dejó muchas palabras en el tango.' },
  { d: 10, p: 'El judeoespañol que conservaron los sefardíes tras ser expulsados de España (1492) se llama también', c: ['ladino', 'lunfardo', 'espanglish', 'bable'], a: 'ladino', r: 'El ladino (o judezmo) se habló en el Mediterráneo oriental; el bable es el asturiano.' },
];

// ── literature, cinema and history ──────────────────────────────────────────
const LITERATURE = [
  { d: 7, p: '¿Quién escribió «Don Quijote de la Mancha»?', c: ['Miguel de Cervantes', 'Lope de Vega', 'Pedro Calderón de la Barca', 'Francisco de Quevedo'], a: 'Miguel de Cervantes', r: 'Cervantes publicó la primera parte en 1605 y la segunda en 1615.' },
  { d: 7, p: '¿Quién escribió «Cien años de soledad»?', c: ['Gabriel García Márquez', 'Mario Vargas Llosa', 'Julio Cortázar', 'Carlos Fuentes'], a: 'Gabriel García Márquez', r: 'La novela (1967) es el gran emblema del realismo mágico.' },
  { d: 7, p: '¿En qué pueblo imaginario transcurre «Cien años de soledad»?', c: ['Macondo', 'Comala', 'Santa María', 'Vetusta'], a: 'Macondo', r: 'Comala es de Rulfo, Santa María de Onetti y Vetusta de Clarín.' },
  { d: 7.5, p: '¿Quién escribió «Pedro Páramo»?', c: ['Juan Rulfo', 'Jorge Luis Borges', 'Octavio Paz', 'Rómulo Gallegos'], a: 'Juan Rulfo', r: 'Rulfo la publicó en 1955; transcurre en Comala.' },
  { d: 7.5, p: '¿Quién escribió «La casa de Bernarda Alba»?', c: ['Federico García Lorca', 'Antonio Machado', 'Ramón del Valle-Inclán', 'Benito Pérez Galdós'], a: 'Federico García Lorca', r: 'Lorca la terminó en 1936, poco antes de ser asesinado.' },
  { d: 7.5, p: '¿Qué poeta nicaragüense encabezó el modernismo con «Azul…» (1888)?', c: ['Rubén Darío', 'José Martí', 'Pablo Neruda', 'Amado Nervo'], a: 'Rubén Darío', r: 'Martí también fue modernista, pero era cubano; Neruda era chileno y Nervo mexicano.' },
  { d: 8, p: '¿Quién es el héroe del «Cantar de mio Cid»?', c: ['Rodrigo Díaz de Vivar', 'Lázaro de Tormes', 'don Juan Tenorio', 'Calisto'], a: 'Rodrigo Díaz de Vivar', r: 'El Cid Campeador es la figura histórica Rodrigo Díaz de Vivar.' },
  { d: 8, p: '¿Qué obra anónima de 1554 inaugura la novela picaresca?', c: ['«Lazarillo de Tormes»', '«La Celestina»', '«El Buscón»', '«Guzmán de Alfarache»'], a: '«Lazarillo de Tormes»', r: '«Guzmán de Alfarache» (1599) y «El Buscón» (1626) son picarescas posteriores.' },
  { d: 8, p: '¿Quién escribió «La vida es sueño»?', c: ['Pedro Calderón de la Barca', 'Lope de Vega', 'Tirso de Molina', 'Garcilaso de la Vega'], a: 'Pedro Calderón de la Barca', r: 'Es el drama de Segismundo, estrenado hacia 1635.' },
  { d: 8, p: '¿Qué obra de Tirso de Molina creó el personaje de don Juan?', c: ['«El burlador de Sevilla»', '«Don Juan Tenorio»', '«Fuenteovejuna»', '«La Celestina»'], a: '«El burlador de Sevilla»', r: '«Don Juan Tenorio» es la versión romántica de José Zorrilla (1844).' },
  { d: 8, p: '¿Qué autora mexicana escribió «Como agua para chocolate»?', c: ['Laura Esquivel', 'Elena Poniatowska', 'Rosario Castellanos', 'Ángeles Mastretta'], a: 'Laura Esquivel', r: 'Esquivel la publicó en 1989.' },
  { d: 8.5, p: '«Fuenteovejuna» es una obra de', c: ['Lope de Vega', 'Calderón de la Barca', 'Miguel de Cervantes', 'José Zorrilla'], a: 'Lope de Vega', r: 'Lope la escribió a comienzos del siglo XVII sobre una rebelión de 1476.' },
  { d: 8.5, p: 'Gustavo Adolfo Bécquer es el autor de', c: ['las «Rimas»', '«Campos de Castilla»', '«Romancero gitano»', '«Azul…»'], a: 'las «Rimas»', r: 'Las «Rimas» son la cumbre de la lírica romántica española.' },
  { d: 8.5, p: '¿Cuál de estos escritores pertenece a la Generación del 98?', c: ['Miguel de Unamuno', 'Rubén Darío', 'Federico García Lorca', 'Gustavo Adolfo Bécquer'], a: 'Miguel de Unamuno', r: 'Lorca es del 27, Darío del modernismo y Bécquer del Romanticismo.' },
  { d: 8.5, p: '«Campos de Castilla» (1912) es un libro de poemas de', c: ['Antonio Machado', 'Juan Ramón Jiménez', 'Rafael Alberti', 'Luis Cernuda'], a: 'Antonio Machado', r: 'Es el gran libro castellano de Machado.' },
  { d: 8.5, p: 'El esperpento, que deforma la realidad para criticarla, es la estética de', c: ['Ramón del Valle-Inclán', 'Pío Baroja', 'Azorín', 'Leopoldo Alas «Clarín»'], a: 'Ramón del Valle-Inclán', r: 'Valle-Inclán lo define en «Luces de bohemia» (1920).' },
  { d: 9, p: '¿Qué novela de Leopoldo Alas «Clarín» transcurre en Vetusta?', c: ['«La Regenta»', '«Fortunata y Jacinta»', '«Niebla»', '«Pepita Jiménez»'], a: '«La Regenta»', r: '«Fortunata y Jacinta» es de Galdós, «Niebla» de Unamuno y «Pepita Jiménez» de Valera.' },
  { d: 9, p: '¿Quién escribió «Rayuela» (1963)?', c: ['Julio Cortázar', 'Jorge Luis Borges', 'Ernesto Sabato', 'Adolfo Bioy Casares'], a: 'Julio Cortázar', r: 'Es la novela de lectura abierta de Cortázar.' },
  { d: 9, p: '«Ficciones» (1944) es un libro de cuentos de', c: ['Jorge Luis Borges', 'Julio Cortázar', 'Horacio Quiroga', 'Juan Carlos Onetti'], a: 'Jorge Luis Borges', r: 'Incluye «Tlön, Uqbar, Orbis Tertius» y «El jardín de senderos que se bifurcan».' },
  { d: 9, p: '¿Quién fue la primera persona latinoamericana en recibir el Premio Nobel de Literatura?', c: ['Gabriela Mistral', 'Pablo Neruda', 'Octavio Paz', 'Gabriel García Márquez'], a: 'Gabriela Mistral', r: 'Mistral lo recibió en 1945; Neruda en 1971, García Márquez en 1982 y Paz en 1990.' },
  { d: 9, p: '«El laberinto de la soledad» (1950), ensayo sobre la identidad mexicana, es de', c: ['Octavio Paz', 'Carlos Fuentes', 'Alfonso Reyes', 'José Vasconcelos'], a: 'Octavio Paz', r: 'Es el ensayo más conocido de Paz.' },
  { d: 9, p: '¿Quién escribió la «Respuesta a sor Filotea de la Cruz»?', c: ['sor Juana Inés de la Cruz', 'santa Teresa de Jesús', 'Rosalía de Castro', 'Emilia Pardo Bazán'], a: 'sor Juana Inés de la Cruz', r: 'En esa carta de 1691 sor Juana defiende el derecho de las mujeres al saber.' },
  { d: 9, p: '«The House on Mango Street» (1984), clásico de la literatura latina de Estados Unidos, es de', c: ['Sandra Cisneros', 'Julia Alvarez', 'Junot Díaz', 'Rudolfo Anaya'], a: 'Sandra Cisneros', r: 'Cisneros narra la infancia de Esperanza en Chicago.' },
  { d: 9, p: 'Con Juan Boscán, Garcilaso de la Vega introdujo en la poesía castellana', c: ['el endecasílabo y el soneto italianos', 'el romance octosílabo', 'el verso libre', 'el cantar de gesta'], a: 'el endecasílabo y el soneto italianos', r: 'Lo hicieron en la primera mitad del siglo XVI, siguiendo a Petrarca.' },
  { d: 9.5, p: 'En el romance tradicional, los versos son octosílabos y riman', c: ['en asonante los pares', 'en consonante todos', 'en asonante los impares', 'sin ninguna rima'], a: 'en asonante los pares', r: 'Los impares quedan sueltos y los pares comparten la rima asonante.' },
  { d: 9.5, p: '¿Qué cineasta dirigió «Un perro andaluz» (1929) junto a Salvador Dalí?', c: ['Luis Buñuel', 'Pedro Almodóvar', 'Carlos Saura', 'Luis García Berlanga'], a: 'Luis Buñuel', r: 'Es un hito del cine surrealista.' },
  { d: 9.5, p: '¿Quién dirigió «El laberinto del fauno» (2006)?', c: ['Guillermo del Toro', 'Alfonso Cuarón', 'Pedro Almodóvar', 'Alejandro González Iñárritu'], a: 'Guillermo del Toro', r: 'Del Toro ambientó la película en la España de la posguerra.' },
  { d: 9.5, p: 'Antonio de Nebrija publicó la primera gramática del castellano en', c: ['1492', '1605', '1713', '1898'], a: '1492', r: 'La «Gramática de la lengua castellana» apareció el mismo año de la llegada de Colón a América.' },
  { d: 9.5, p: 'La Real Academia Española se fundó en', c: ['1713', '1492', '1812', '1931'], a: '1713', r: 'Se fundó en Madrid en 1713, con el lema «Limpia, fija y da esplendor».' },
  { d: 10, p: 'La Constitución española vigente se aprobó en', c: ['1978', '1931', '1975', '1986'], a: '1978', r: 'Se aprobó en referéndum el 6 de diciembre de 1978, tras la muerte de Franco (1975).' },
  { d: 10, p: 'La guerra civil española duró', c: ['de 1936 a 1939', 'de 1898 a 1902', 'de 1914 a 1918', 'de 1940 a 1945'], a: 'de 1936 a 1939', r: 'Empezó con el golpe de julio de 1936 y terminó en abril de 1939.' },
  { d: 10, p: 'Las greguerías, frases breves de humor e ingenio, son creación de', c: ['Ramón Gómez de la Serna', 'Miguel de Unamuno', 'Gloria Fuertes', 'Enrique Jardiel Poncela'], a: 'Ramón Gómez de la Serna', r: 'Él las definió como «humorismo + metáfora».' },
  { d: 10, p: '«La casa de los espíritus» (1982) es la primera novela de', c: ['Isabel Allende', 'Laura Esquivel', 'Elena Garro', 'Clarice Lispector'], a: 'Isabel Allende', r: 'Allende es chilena; Lispector escribió en portugués.' },
  { d: 10, p: '¿Qué escritor peruano recibió el Premio Nobel de Literatura en 2010?', c: ['Mario Vargas Llosa', 'César Vallejo', 'José María Arguedas', 'Ciro Alegría'], a: 'Mario Vargas Llosa', r: 'Es el autor de «La ciudad y los perros» y «Conversación en La Catedral».' },
];

const GENERATORS = {
  es_adv_grammar: fromPool(ADV_GRAMMAR, 'es_adv_grammar'),
  es_idioms_register: fromPool(IDIOMS_REGISTER, 'es_idioms_register'),
  es_literature: fromPool(LITERATURE, 'es_literature'),
};

module.exports = { GENERATORS, POOLS: { es_adv_grammar: ADV_GRAMMAR, es_idioms_register: IDIOMS_REGISTER, es_literature: LITERATURE }, SI_VERBS, SE_VERBS, SE_PAIRS };
