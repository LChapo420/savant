/**
 * The labelled case set for typed-answer grading (curriculum-build/grading-cascade/cases.json):
 * the Jev pilot's 188 cases (curriculum-build/jev-pilot/grading-cases.json, labels by
 * construction) plus hand-written cases added 2026-10-23 across Spanish, English, reading
 * comprehension and math word answers, weighted toward HARD near-misses (one wrong
 * person, gender, mood, preposition, unit, root or detail) and valid alternates the key
 * does not list.
 *
 * Labelling rule: a case is kept only when a careful teacher would not hesitate. Cases a
 * teacher could reasonably mark either way were left out on purpose (written down in
 * comments where the temptation was strongest), because an ambiguous label measures the
 * label, not the grader. `why` says what decides each label.
 *
 *   node scripts/grading-cases-build.js         writes the merged file and prints counts
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'curriculum-build', 'grading-cascade', 'cases.json');

const extra = [];
let n = 0;
/** One question, its key, and learner answers [answer, truth, why]. */
function Q(group, format, question, reference, accepted, answers) {
  for (const [learner, truth, why] of answers) {
    n += 1;
    extra.push({
      id: `x${n}`, group, kind: truth ? 'valid alternate' : 'near-miss', why, truth,
      question, reference, accepted, learner, format,
    });
  }
}

// ── Spanish translation (short_answer) ──────────────────────────────────────
const ST = (q, ref, acc, answers) => Q('spanish translation', 'short_answer', `Translate into Spanish: ${q}`, ref, acc, answers);
ST('I am tired.', 'Estoy cansado', ['Estoy cansada'], [
  ['Soy cansado', false, 'ser for a temporary state'],
  ['Estoy cansados', false, 'number agreement (plural adjective for "I")'],
  ['Tengo cansado', false, 'wrong verb (tener)'],
]);
ST('We are at the library.', 'Estamos en la biblioteca', [], [
  ['Estamos en la librería', false, 'false friend: librería is a bookstore'],
  ['Somos en la biblioteca', false, 'ser for location'],
  ['Estamos a la biblioteca', false, '"a" means to, not at'],
]);
ST('My sister is tall.', 'Mi hermana es alta', [], [
  ['Mi hermana es alto', false, 'gender agreement'],
  ['Mi hermano es alto', false, 'brother, not sister'],
]);
ST("I don't have a car.", 'No tengo coche', ['No tengo carro', 'No tengo auto'], [
  ['No tengo un coche', true, 'the article is optional here'],
  ['Tengo un coche', false, 'negation missing'],
  ['No tengo un carro', true, 'regional word plus optional article'],
  ['No tiene coche', false, 'wrong person (he/she)'],
]);
ST('They eat dinner at eight.', 'Cenan a las ocho', [], [
  ['Comen la cena a las ocho', true, 'valid paraphrase of cenar'],
  ['Cenamos a las ocho', false, 'wrong person (we)'],
  ['Cenan en las ocho', false, 'wrong preposition for clock time'],
  ['Cenan a ocho', false, 'article "las" missing before the hour'],
]);
ST('She wants to travel to Mexico.', 'Ella quiere viajar a México', ['Quiere viajar a México'], [
  ['Ella quiere viaja a México', false, 'infinitive needed after querer'],
  ['Ella quería viajar a México', false, 'tense (wanted)'],
  ['Ella desea viajar a México', true, 'desear is a valid synonym'],
]);
ST('The children are playing in the park.', 'Los niños están jugando en el parque', ['Los niños juegan en el parque'], [
  ['Los chicos están jugando en el parque', true, 'chicos is a valid word for kids'],
  ['Los niños son jugando en el parque', false, 'ser with the progressive'],
  ['Los niños están jugar en el parque', false, 'infinitive instead of gerund'],
]);
ST('I like apples.', 'Me gustan las manzanas', [], [
  ['Me gusta las manzanas', false, 'gustar must agree with the plural subject'],
  ['Yo gusto las manzanas', false, 'gustar used like "like"'],
  ['A mí me gustan las manzanas', true, 'emphatic "a mí" is correct'],
  ['Me gustan manzanas', false, 'the article is required with a gustar subject'],
]);
Q('spanish translation', 'short_answer', 'Translate into Spanish, speaking to one friend: Do you speak English?', '¿Hablas inglés?', [], [
  ['¿Tú hablas inglés?', true, 'optional subject pronoun'],
  ['¿Hablan inglés?', false, 'plural "you" for one friend'],
  ['¿Hablas tú inglés?', true, 'inverted pronoun is correct'],
  ['¿Habla inglés?', false, 'usted form for a friend'],
]);
ST('We went to the beach yesterday.', 'Fuimos a la playa ayer', ['Ayer fuimos a la playa'], [
  ['Ayer nosotros fuimos a la playa', true, 'optional pronoun, moved time word'],
  ['Vamos a la playa ayer', false, 'present tense with "yesterday"'],
  ['Fuimos a la playa mañana', false, 'tomorrow, not yesterday'],
  ['Íbamos a la playa ayer', false, 'imperfect "were going" for a completed trip'],
  ['Fuimos al playa ayer', false, '"al" with a feminine noun'],
]);
ST('It is raining.', 'Está lloviendo', ['Llueve'], [
  ['Es lloviendo', false, 'ser with the progressive'],
  ['Está llueve', false, 'conjugated verb after estar'],
]);
ST('I have two brothers.', 'Tengo dos hermanos', [], [
  ['Tengo dos hermanas', false, 'sisters, not brothers'],
  ['Tengo dos hermano', false, 'singular noun after dos'],
  ['Yo tengo 2 hermanos', true, 'a numeral is fine in a translation'],
  ['Tengo tres hermanos', false, 'three, not two'],
]);
ST('The water is cold.', 'El agua está fría', [], [
  ['La agua está fría', false, 'agua takes "el" in the singular'],
  ['El agua está frío', false, 'agua is feminine: fría'],
]);
Q('spanish translation', 'short_answer', 'Translate into Spanish, speaking to a friend: Can you help me?', '¿Puedes ayudarme?', ['¿Me puedes ayudar?'], [
  ['¿Puedes ayudar me?', false, 'the pronoun must attach to the infinitive'],
  ['¿Puedes me ayudar?', false, 'pronoun placed between the verbs'],
  ['¿Tú puedes ayudarme?', true, 'optional subject pronoun'],
]);
ST('I hope that you come.', 'Espero que vengas', [], [
  ['Espero que vienes', false, 'indicative after esperar que'],
  ['Espero que venga', true, 'usted form; "you" is not specified'],
  ['Espero que vendrás', false, 'future indicative after esperar que'],
]);
ST('He is reading a book.', 'Él está leyendo un libro', ['Él lee un libro'], [
  ['Él está leendo un libro', false, 'misspelled gerund (leyendo)'],
  ['Él está leyendo una libro', false, 'article gender'],
  ['Él es leyendo un libro', false, 'ser with the progressive'],
  ['Él lee el libro', false, '"the book", not "a book"'],
]);
ST('The museum opens at ten.', 'El museo abre a las diez', [], [
  ['El museo abre en las diez', false, 'wrong preposition for clock time'],
  ['El museo abrió a las diez', false, 'past tense'],
  ['El museo abre a las dos', false, 'two, not ten'],
]);
ST('Where is the bathroom?', '¿Dónde está el baño?', ['¿Dónde está el servicio?'], [
  ['¿Dónde es el baño?', false, 'ser for location'],
  ['¿Adónde está el baño?', false, 'adónde means "to where"'],
  ['¿Dónde queda el baño?', true, 'quedar for location is correct'],
  ['¿Dónde está el aseo?', true, 'aseo is the Spain word'],
]);
ST('I was born in 2010.', 'Nací en 2010', ['Nací en el 2010'], [
  ['Nacé en 2010', false, 'misformed preterite'],
  ['Nacía en 2010', false, 'imperfect for a single event'],
  ['Yo nací en el año 2010', true, 'pronoun and "el año" are fine'],
  ['Nací en 2011', false, 'wrong year'],
]);
ST('These shoes are expensive.', 'Estos zapatos son caros', [], [
  ['Estas zapatos son caros', false, 'demonstrative gender'],
  ['Estos zapatos son caras', false, 'adjective gender'],
  ['Esos zapatos son caros', false, '"those", not "these"'],
]);
ST('I need to study more.', 'Necesito estudiar más', [], [
  ['Necesito estudio más', false, 'conjugated verb instead of the infinitive'],
  ['Tengo que estudiar más', true, 'tener que expresses the need'],
  ['Necesito estudiar menos', false, 'less, not more'],
  ['Necesito a estudiar más', false, 'no "a" before the infinitive'],
]);
ST('She called her mother.', 'Ella llamó a su madre', ['Llamó a su mamá'], [
  ['Ella llamó su madre', false, 'personal "a" missing'],
  ['Ella llama a su madre', false, 'present tense'],
  ['Ella llamó a su mamá', true, 'mamá is fine'],
  ['Ella llamó a su padre', false, 'father, not mother'],
]);
ST('We have lived here for five years.', 'Hemos vivido aquí durante cinco años', ['Vivimos aquí desde hace cinco años', 'Llevamos cinco años viviendo aquí'], [
  ['Hace cinco años que vivimos aquí', true, 'hace ... que is the natural form'],
  ['Hemos vivido aquí por cinco años', true, '"por" for duration is accepted'],
  ['Vivimos aquí hace cinco años', false, 'means "we lived here five years ago"'],
  ['Hemos vivido aquí durante cuatro años', false, 'four, not five'],
]);
Q('spanish translation', 'short_answer', 'Translate into Spanish, speaking to a friend: Close the door, please.', 'Cierra la puerta, por favor', [], [
  ['Cerra la puerta, por favor', false, 'stem change missing (cierra)'],
  ['Cierras la puerta, por favor', false, 'indicative, not a command'],
  ['Por favor, cierra la puerta', true, 'reordered politeness phrase'],
]);
ST('The cat is under the table.', 'El gato está debajo de la mesa', ['El gato está bajo la mesa'], [
  ['El gato está encima de la mesa', false, 'on top of, not under'],
  ['El gato es debajo de la mesa', false, 'ser for location'],
]);
ST('My friends are funny.', 'Mis amigos son divertidos', ['Mis amigos son graciosos'], [
  ['Mis amigos son chistosos', true, 'chistosos is a regional synonym'],
  ['Mis amigos son divertido', false, 'number agreement'],
  ['Mis amigas son divertidas', true, 'female friends; English is neutral'],
]);
ST('I will call you tomorrow.', 'Te llamaré mañana', ['Te llamo mañana', 'Voy a llamarte mañana'], [
  ['Te voy a llamar mañana', true, 'ir a + infinitive future'],
  ['Te llamé mañana', false, 'past tense'],
  ['Llamaré te mañana', false, 'pronoun after a conjugated verb'],
  ['Te llamaré ayer', false, 'yesterday, not tomorrow'],
]);
Q('spanish translation', 'short_answer', 'Translate into Spanish, speaking to a classmate: How old are you?', '¿Cuántos años tienes?', [], [
  ['¿Cuántos años eres?', false, 'ser for age'],
  ['¿Qué edad tienes?', true, 'valid alternative'],
  ['¿Cuántos años tiene?', false, 'usted form for a classmate'],
]);
ST('The pencils are on the desk.', 'Los lápices están en el escritorio', ['Los lápices están sobre el escritorio'], [
  ['Los lápizes están en el escritorio', false, 'plural spelling (lápices)'],
  ['Los lápices están encima del escritorio', true, 'encima de is correct'],
  ['Los lápices están en la escritorio', false, 'article gender'],
]);
ST('I am going to eat.', 'Voy a comer', [], [
  ['Voy comer', false, '"a" missing'],
  ['Vas a comer', false, 'wrong person'],
]);

// ── Spanish type-in (type_in) ───────────────────────────────────────────────
const SW = (q, ref, acc, answers) => Q('spanish type-in', 'type_in', q, ref, acc, answers);
SW('Write the Spanish word for "library" (no article).', 'biblioteca', [], [
  ['librería', false, 'false friend: bookstore'],
  ['biblioteka', false, 'misspelled'],
]);
SW('Write the Spanish word for "apple" (no article).', 'manzana', [], [
  ['manzanas', false, 'plural'],
  ['mansana', false, 'misspelled'],
]);
SW('Write the Spanish verb "to run" (infinitive).', 'correr', [], [
  ['corre', false, 'conjugated, not the infinitive'],
  ['corer', false, 'misspelled'],
]);
SW('Write the Spanish word for "car" (no article).', 'coche', ['carro', 'auto'], [
  ['automóvil', true, 'a standard word for car'],
  ['camión', false, 'truck'],
  ['coches', false, 'plural'],
]);
SW('Write the Spanish word for "computer" (no article).', 'computadora', ['ordenador'], [
  ['computador', true, 'used in Chile and Colombia'],
]);
SW('Write the Spanish word for "juice" (no article).', 'jugo', ['zumo'], [
  ['jugos', false, 'plural'],
  ['hugo', false, 'misspelled'],
]);
SW('Write the Spanish word for "bus" (no article).', 'autobús', ['bus'], [
  ['ómnibus', true, 'used in Argentina and Uruguay'],
  ['autobuses', false, 'plural'],
]);
SW('Write the Spanish word for "Thursday".', 'jueves', [], [
  ['juebes', false, 'misspelled'],
  ['martes', false, 'Tuesday'],
]);
SW('Write the Spanish word for "red" (masculine singular).', 'rojo', [], [
  ['roja', false, 'feminine'],
  ['rojos', false, 'plural'],
]);
SW('Write the number 16 in Spanish.', 'dieciséis', [], [
  ['diez y seis', true, 'older spelling the RAE still accepts'],
  ['diesiseis', false, 'misspelled'],
  ['sesenta', false, 'sixty'],
]);
SW('Write the number 21 in Spanish.', 'veintiuno', [], [
  ['veinte y uno', true, 'older spelling the RAE still accepts'],
  ['ventiuno', false, 'misspelled'],
  ['doce', false, 'twelve'],
]);
SW('Write the number 100 in Spanish.', 'cien', [], [
  ['ciento', false, '"ciento" is used only in compounds (ciento uno)'],
  ['mil', false, 'a thousand'],
]);
SW('Write the number 500 in Spanish.', 'quinientos', [], [
  ['cincocientos', false, 'irregular form is quinientos'],
  ['cincuenta', false, 'fifty'],
]);
SW('How do you say the time 1:00 in Spanish?', 'es la una', [], [
  ['son la una', false, '"es" with one o\'clock'],
  ['es la una en punto', true, '"en punto" is fine'],
  ['son las una', false, 'plural article with una'],
]);
SW('How do you say the time 7:30 in Spanish?', 'son las siete y media', [], [
  ['son las siete y treinta', true, 'y treinta is correct'],
  ['son las siete y medio', false, '"media" for half past'],
  ['es las siete y media', false, '"son" for hours other than one'],
]);
SW('How do you say the time 2:45 in Spanish?', 'son las tres menos cuarto', ['son las dos y cuarenta y cinco'], [
  ['son las tres menos quince', true, 'menos quince is correct'],
  ['son las dos menos cuarto', false, 'that is 1:45'],
]);
SW('Write the Spanish word for "Saturday".', 'sábado', [], [
  ['domingo', false, 'Sunday'],
]);
SW('Write the Spanish opposite of "grande" (masculine singular).', 'pequeño', ['chico'], [
  ['grande', false, 'the word itself, not its opposite'],
  ['pequenio', false, 'misspelled'],
]);
SW('Complete with the present tense of tener: nosotros ___', 'tenemos', [], [
  ['tienemos', false, 'stem change in the nosotros form'],
  ['tenimos', false, 'misformed'],
  ['tienen', false, 'wrong person'],
]);
SW('Complete with the preterite of ir: ellos ___', 'fueron', [], [
  ['iban', false, 'imperfect'],
  ['fueran', false, 'subjunctive'],
]);
SW('Complete with the present subjunctive of hacer: Es importante que tú ___ la tarea.', 'hagas', [], [
  ['haces', false, 'indicative'],
  ['haga', false, 'wrong person for tú'],
]);
SW('Complete with the present tense of conocer: Yo ___ a tu hermano.', 'conozco', [], [
  ['conosco', false, 'misspelled'],
  ['conoco', false, 'irregular yo form missing'],
]);
SW('Complete with por or para: Este regalo es ___ ti.', 'para', [], [
  ['por', false, 'recipient takes para'],
]);
SW('Complete with ser or estar in the present: La fiesta ___ en mi casa.', 'es', [], [
  ['está', false, 'an event\'s location takes ser'],
]);
SW('Complete with the imperfect of ser: Cuando yo ___ niño, vivía en Lima.', 'era', [], [
  ['fui', false, 'preterite'],
  ['estaba', false, 'estar instead of ser'],
]);
SW('Complete with the direct object pronoun: ¿Tienes las llaves? Sí, ___ tengo.', 'las', [], [
  ['les', false, 'indirect object pronoun'],
  ['los', false, 'gender: llaves is feminine'],
]);
SW('Complete with gustar: A ellos les ___ el fútbol.', 'gusta', [], [
  ['gustan', false, 'singular subject (el fútbol)'],
  ['gusto', false, 'yo form'],
]);

// ── English (short_answer and type_in) ──────────────────────────────────────
const ER = (q, ref, acc, answers) => Q('english rewrite', 'short_answer', q, ref, acc, answers);
const EW = (q, ref, acc, answers) => Q('english type-in', 'type_in', q, ref, acc, answers);
ER('Rewrite in the past tense: "She walks to school."', 'She walked to school.', [], [
  ['She walk to school.', false, 'no tense change, agreement broken'],
  ['She has walked to school.', false, 'present perfect, not the past'],
  ['She walkt to school.', false, 'misspelled'],
]);
ER('Rewrite in the past tense: "They buy bread."', 'They bought bread.', [], [
  ['They buyed bread.', false, 'irregular past'],
  ['They brought bread.', false, 'brought is the past of bring'],
]);
ER('Rewrite using a contraction: "She is not here."', "She isn't here.", ["She's not here."], [
  ['She isnt here.', false, 'the apostrophe is the point of the item'],
  ["She is'nt here.", false, 'apostrophe in the wrong place'],
  ['She is not here.', false, 'no contraction'],
]);
ER('Rewrite using a contraction: "We will not go."', "We won't go.", [], [
  ["We willn't go.", false, 'the contraction is won\'t'],
]);
ER('Make it plural: "The child plays."', 'The children play.', [], [
  ['The childs play.', false, 'irregular plural'],
  ['The children plays.', false, 'verb agreement'],
]);
ER('Make it plural: "The mouse ran."', 'The mice ran.', [], [
  ['The mouses ran.', false, 'irregular plural'],
  ['The mice runned.', false, 'irregular past'],
]);
EW('Write the comparative form of "good".', 'better', [], [
  ['gooder', false, 'irregular comparative'],
  ['more good', false, 'irregular comparative'],
  ['best', false, 'superlative'],
]);
EW('Write the superlative form of "bad".', 'worst', [], [
  ['baddest', false, 'irregular superlative'],
  ['worse', false, 'comparative'],
  ['the worst', true, 'the article is fine'],
]);
EW('Write the past participle of "write".', 'written', [], [
  ['wrote', false, 'simple past'],
  ['writen', false, 'misspelled'],
]);
EW('Write the plural of "knife".', 'knives', [], [
  ['knifes', false, 'that is the verb form'],
  ['knive', false, 'misspelled'],
]);
EW('Write the past tense of "teach".', 'taught', [], [
  ['teached', false, 'irregular past'],
  ['tought', false, 'misspelled'],
  ['thought', false, 'past of think'],
]);
ER('Correct the pronouns: "Me and him went to the store."', 'He and I went to the store.', [], [
  ['Him and I went to the store.', false, 'object pronoun as subject'],
  ['He and me went to the store.', false, 'object pronoun as subject'],
]);
ER('Correct the pronoun: "Between you and I, the test was easy."', 'Between you and me, the test was easy.', [], [
  ['Between you and myself, the test was easy.', false, 'reflexive misused'],
  ['Between me and you, the test was easy.', true, 'object case, order is free'],
]);
ER('Fix the verb: "Neither of the boys were ready."', 'Neither of the boys was ready.', [], [
  ['Neither of the boy was ready.', false, 'noun made singular instead'],
  ['Neither of the boys is ready.', false, 'tense changed'],
]);
ER('Combine using "because": "We stayed inside." "It was raining."', 'We stayed inside because it was raining.', [], [
  ['Because it was raining, we stayed inside.', true, 'clause order is free'],
  ['It was raining because we stayed inside.', false, 'cause and effect reversed'],
]);
ER('Combine using "although": "He was tired." "He finished the race."', 'Although he was tired, he finished the race.', [], [
  ['He finished the race although he was tired.', true, 'clause order is free'],
  ['Although he finished the race, he was tired.', false, 'meaning reversed'],
  ['Although he was tired, but he finished the race.', false, 'double conjunction'],
]);
ER('Combine using "who": "I met a girl." "She plays the violin."', 'I met a girl who plays the violin.', [], [
  ['I met a girl that plays the violin.', false, 'the item asks for "who"'],
  ['I met a girl who play the violin.', false, 'verb agreement'],
]);
ER('Rewrite in the passive voice: "The dog chased the cat."', 'The cat was chased by the dog.', [], [
  ['The cat is chased by the dog.', false, 'tense changed'],
  ['The cat was chase by the dog.', false, 'participle form'],
  ['The dog was chased by the cat.', false, 'meaning reversed'],
]);
ER('Rewrite in the passive voice: "Someone stole my bike."', 'My bike was stolen.', ['My bike was stolen by someone.'], [
  ['My bike was stole.', false, 'participle form'],
]);
EW('Write the antonym of "increase".', 'decrease', ['reduce'], [
  ['lessen', true, 'a valid antonym'],
  ['diminish', true, 'a valid antonym'],
  ['decreese', false, 'misspelled'],
]);
EW('Write a synonym of "begin".', 'start', ['commence'], [
  ['end', false, 'an antonym'],
]);
ER('Add the missing apostrophe (there is one dog): "The dogs bone is buried."', "The dog's bone is buried.", [], [
  ["The dogs' bone is buried.", false, 'plural possessive for one dog'],
  ["The dog's bone is buried", true, 'final period missing; the apostrophe is right'],
]);
ER('Fix the capitalization: "we visited new york in july."', 'We visited New York in July.', [], [
  ['We visited New York in july.', false, 'July not capitalized'],
  ['We Visited New York In July.', false, 'extra capitals'],
  ['We visited New York in July', true, 'final period missing; capitals right'],
]);
ER('Fix the spelling: "I recieved the package."', 'I received the package.', [], [
  ['I receeved the package.', false, 'still misspelled'],
]);
ER('Rewrite as a yes/no question: "She is coming tomorrow."', 'Is she coming tomorrow?', [], [
  ['She is coming tomorrow?', false, 'no inversion'],
  ['Is she come tomorrow?', false, 'verb form'],
]);
ER('Rewrite in reported speech: She said, "I am hungry."', 'She said that she was hungry.', ['She said she was hungry.'], [
  ['She said that I was hungry.', false, 'pronoun not shifted'],
]);
ER('Fix the run-on sentence: "I love pizza I eat it every day."', 'I love pizza. I eat it every day.', ['I love pizza; I eat it every day.'], [
  ['I love pizza, and I eat it every day.', true, 'comma plus conjunction fixes it'],
  ['I love pizza because I eat it every day.', false, 'meaning changed'],
]);
EW('Type the missing word: "If I ___ (be) you, I would study."', 'were', [], [
  ['am', false, 'present indicative'],
  ['be', false, 'base form'],
]);
EW('Type the missing word: "She has ___ (eat) breakfast."', 'eaten', [], [
  ['ate', false, 'simple past after has'],
  ['eated', false, 'irregular participle'],
]);
EW('Type the correct word: "___ going to the park." (They\'re / Their / There)', "They're", [], [
  ['Their', false, 'possessive'],
  ['There', false, 'place word'],
]);
EW('Type the correct word: "The cat licked ___ paw." (its / it\'s)', 'its', [], [
  ["it's", false, 'contraction of it is'],
]);
EW('Write the adverb form of "quick".', 'quickly', [], [
  ['quickley', false, 'misspelled'],
  ['quicker', false, 'comparative adjective'],
]);

// ── Reading comprehension (short_answer) ────────────────────────────────────
const R = (passage, q, ref, acc, answers) => Q('reading', 'short_answer', `${passage}\n\nQuestion: ${q}`, ref, acc, answers);
const P1 = 'Maya left for school, but halfway there she noticed dark clouds. She ran back home to grab her umbrella, and she reached class just as the bell rang.';
R(P1, 'Why did Maya go back home?', 'To get her umbrella, because it looked like rain.', [], [
  ['She went back for her umbrella.', true, 'the reason, in other words'],
  ['Because she saw dark clouds and wanted her umbrella.', true, 'both parts, paraphrased'],
  ['To get her raincoat.', false, 'umbrella, not raincoat'],
  ['Because she was late for class.', false, 'not the reason'],
  ['She forgot her homework.', false, 'not in the passage'],
]);
R(P1, 'Was Maya late for class? Explain.', 'No. She arrived just as the bell rang.', [], [
  ['No, she got there right when the bell rang.', true, 'answer with the reason'],
  ['Yes, the bell had already rung.', false, 'contradicts the passage'],
  ['No.', false, 'the explanation asked for is missing'],
]);
const P2 = 'The town library closes at 6 p.m. on weekdays and at 2 p.m. on Saturdays. It is closed on Sundays.';
R(P2, 'When does the library close on Saturdays?', 'At 2 p.m.', [], [
  ['2 pm', true, 'same time'],
  ['at two in the afternoon', true, 'same time in words'],
  ['6 p.m.', false, 'that is weekdays'],
  ['It is closed on Saturdays.', false, 'it is closed on Sundays'],
  ['14:00', true, 'same time, 24-hour clock'],
]);
R(P2, 'On which day is the library closed all day?', 'Sunday', [], [
  ['Sundays', true, 'plural is fine'],
  ['Saturday', false, 'wrong day'],
  ['on Sunday', true, 'same answer'],
]);
const P3 = 'Leo planted tomato seeds in April. By July the plants were taller than his little sister, but they did not produce a single tomato until August.';
R(P3, "When did Leo's plants first produce tomatoes?", 'In August.', [], [
  ['August', true, 'same month'],
  ['July', false, 'that is when they were tall'],
  ['In April', false, 'that is when he planted'],
]);
R(P3, 'How tall were the plants by July?', 'Taller than his little sister.', [], [
  ['They were taller than his sister.', true, 'same comparison'],
  ['As tall as his sister.', false, 'taller, not as tall'],
  ['Taller than Leo.', false, 'his sister, not Leo'],
]);
const P4 = 'Ana had saved $40. She spent $15 on a book and gave half of what was left to her brother.';
R(P4, 'How much money did Ana give her brother?', '$12.50', [], [
  ['twelve dollars and fifty cents', true, 'same amount in words'],
  ['$12.50 dollars', true, 'same amount, doubled unit'],
  ['$25', false, 'that is what was left before giving half'],
  ['$7.50', false, 'half of $15'],
]);
const P5 = 'Octopuses have three hearts. Two pump blood to the gills, and one pumps it to the rest of the body.';
R(P5, 'What does the third heart do?', 'It pumps blood to the rest of the body.', [], [
  ['It pumps blood around the body, not to the gills.', true, 'same meaning'],
  ['It pumps blood to the gills.', false, 'that is the other two'],
  ['It helps the octopus breathe.', false, 'not stated'],
]);
R(P5, 'How many hearts pump blood to the gills?', 'Two', [], [
  ['2', true, 'numeral'],
  ['three', false, 'three in total, two to the gills'],
]);
const P6 = "The museum's new dinosaur skeleton is 12 meters long. It was found in Argentina in 2014 and took three years to assemble.";
R(P6, 'Where was the skeleton found?', 'In Argentina.', [], [
  ['Argentina', true, 'same place'],
  ['Brazil', false, 'wrong country'],
]);
R(P6, 'In what year was the skeleton finished being assembled?', '2017', [], [
  ['in 2017', true, 'same year'],
  ['2014', false, 'the year it was found'],
]);
R(P6, 'How long is the skeleton?', '12 meters', [], [
  ['12 m', true, 'abbreviated unit'],
  ['12 feet', false, 'wrong unit'],
  ['twelve meters', true, 'number in words'],
]);
const P7 = 'When the power went out, Sam lit a candle and searched the drawer for batteries for his flashlight. Finding none, he sighed and sat by the candle to finish his book.';
R(P7, 'Why did Sam read by candlelight?', 'Because the power was out and he had no batteries for his flashlight.', [], [
  ["The power was out and he couldn't find batteries.", true, 'both reasons'],
  ['Because he liked candles.', false, 'not stated'],
  ['Because his flashlight was broken.', false, 'it had no batteries; nothing says broken'],
]);
const P8 = 'Water boils at 100 degrees Celsius at sea level. On a high mountain, where the air pressure is lower, it boils at a lower temperature.';
R(P8, 'Why does water boil at a lower temperature on a high mountain?', 'Because the air pressure is lower.', [], [
  ['lower air pressure up there', true, 'same reason'],
  ['because it is colder on the mountain', false, 'not the reason given'],
  ['because the air pressure is higher', false, 'reversed'],
  ['less pressure', true, 'same reason, brief'],
]);
R(P8, 'At what temperature does water boil at sea level?', '100 degrees Celsius', [], [
  ['100°C', true, 'symbol form'],
  ['100 degrees Fahrenheit', false, 'wrong scale'],
]);
const P9 = 'Priya practiced the piano for 20 minutes on Monday, 35 minutes on Tuesday, and did not practice on Wednesday.';
R(P9, 'How many minutes did Priya practice in total over the three days?', '55 minutes', [], [
  ['55 min', true, 'abbreviated unit'],
  ['50 minutes', false, 'wrong sum'],
  ['an hour', false, '60 is not 55'],
]);
R(P9, 'On which day did Priya not practice?', 'Wednesday', [], [
  ['Wed.', true, 'abbreviation'],
  ['Tuesday', false, 'she practiced 35 minutes'],
]);
const P10 = 'In the story, Grandpa told Eli that the old oak had been struck by lightning twice but still grew new leaves every spring. Eli decided he would not give up on learning to swim.';
R(P10, 'What lesson did Eli take from the oak tree?', 'Not to give up, even after setbacks.', [], [
  ['Keep trying even when things go wrong.', true, 'same lesson'],
  ['That lightning is dangerous.', false, 'not the lesson'],
  ['To plant more trees.', false, 'not the lesson'],
  ['Never give up.', true, 'same lesson'],
]);
const P11 = 'Mount Everest is the highest mountain above sea level, but Mauna Kea in Hawaii is taller when measured from its base on the ocean floor.';
R(P11, 'Which mountain is taller when measured from base to peak?', 'Mauna Kea', [], [
  ['Mauna Kea in Hawaii', true, 'same mountain'],
  ['Mount Everest', false, 'highest above sea level, not base to peak'],
  ['Mauna Loa', false, 'a different mountain'],
]);
R(P11, 'Which is the highest mountain above sea level?', 'Mount Everest', [], [
  ['Everest', true, 'same mountain'],
  ['Mt. Everest', true, 'abbreviation'],
  ['K2', false, 'not in the passage'],
]);
const P12 = 'The recipe calls for 3 cups of flour for 12 cookies. Jordan wants to make 24 cookies.';
R(P12, 'How many cups of flour does Jordan need?', '6 cups', [], [
  ['6', true, 'the number, unit implied by the question'],
  ['six cups', true, 'number in words'],
  ['3 cups', false, 'that is for 12 cookies'],
  ['6 tablespoons', false, 'wrong unit'],
]);

// ── Math word answers (type_in) ─────────────────────────────────────────────
const M = (q, ref, acc, answers) => Q('math word', 'type_in', q, ref, acc, answers);
M('A train leaves at 2:15 p.m. and arrives at 4:40 p.m. How long is the trip?', '2 hours 25 minutes', ['2 h 25 min'], [
  ['2 hours and 25 minutes', true, 'same duration'],
  ['145 minutes', true, 'same duration in minutes'],
  ['2.25 hours', false, '2.25 hours is 2 h 15 min'],
  ['2 hours 35 minutes', false, 'wrong minutes'],
]);
M('Pencils cost $0.35 each. How much do 8 pencils cost?', '$2.80', [], [
  ['2 dollars 80 cents', true, 'same amount'],
  ['$2.40', false, 'wrong amount'],
]);
M('Solve: x^2 = 49', 'x = 7 or x = -7', ['7, -7', '±7'], [
  ['x = 7', false, 'one root missing'],
  ['7 and -7', true, 'both roots'],
  ['x = ±7', true, 'both roots'],
  ['-7, 7', true, 'both roots, any order'],
  ['49', false, 'not a root'],
]);
M('Expand: 3(x + 4)', '3x + 12', [], [
  ['3x+12', true, 'spacing only'],
  ['12 + 3x', true, 'terms reordered'],
  ['3(x + 4)', false, 'not expanded'],
  ['3x + 4', false, 'did not distribute to 4'],
  ['3x + 7', false, 'added instead of multiplied'],
]);
M('Factor: x^2 + 5x + 6', '(x + 2)(x + 3)', [], [
  ['(x+3)(x+2)', true, 'factors in either order'],
  ['(x + 2)(x - 3)', false, 'sign'],
  ['(x + 1)(x + 6)', false, 'gives 7x'],
  ['x(x + 5) + 6', false, 'not factored'],
]);
M('Write 3/8 as a decimal.', '0.375', [], [
  ['zero point three seven five', true, 'same decimal in words'],
]);
M('What is 15% of 80?', '12', [], [
  ['twelve', true, 'number in words'],
  ['12%', false, 'a number, not a percent'],
]);
M('A rectangle is 8 cm by 5 cm. What is its perimeter?', '26 cm', [], [
  ['26 cm²', false, 'an area unit for a perimeter'],
  ['40 cm', false, 'that is the area\'s number'],
  ['26 centimeters', true, 'unit written out'],
]);
M('Round 3.14159 to the nearest hundredth.', '3.14', [], [
  ['3.14 (approximately)', true, 'same value with a note'],
]);
M('Find the slope of the line through (1, 2) and (3, 8).', '3', [], [
  ['slope = 3', true, 'same value'],
  ['1/3', false, 'run over rise'],
]);
M('Write the coordinates of the point 3 units right of the origin and 2 units down.', '(3, -2)', [], [
  ['(3,-2)', true, 'spacing only'],
  ['(-2, 3)', false, 'coordinates swapped'],
  ['(3, 2)', false, 'sign'],
  ['3, -2', true, 'no parentheses'],
]);
M('A shirt costs $20 and is on sale for 25% off. What is the sale price?', '$15', [], [
  ['15 dollars', true, 'same amount'],
  ['$5', false, 'that is the discount'],
  ['75%', false, 'a percent, not a price'],
]);
M('Simplify: 2x + 3x - x', '4x', [], [
  ['4 x', true, 'spacing only'],
  ['5x', false, 'dropped the subtraction'],
  ['4', false, 'the variable is missing'],
]);
M('Convert 2.5 hours to minutes.', '150', [], [
  ['150 min', true, 'unit abbreviated'],
  ['150 minutes', true, 'with the unit'],
  ['125', false, 'wrong'],
]);
M('Write 0.6 as a fraction in lowest terms.', '3/5', [], [
  ['6/10', false, 'not in lowest terms'],
  ['0.6', false, 'not a fraction'],
]);
M('Jamal reads 15 pages a day. How many days will it take him to read a 90-page book?', '6', [], [
  ['6 days', true, 'with the unit'],
  ['5 days', false, 'wrong'],
  ['six days', true, 'number in words'],
]);
M('What is the area of a triangle with base 10 cm and height 6 cm?', '30 cm²', ['30 square cm'], [
  ['30 square centimeters', true, 'same unit in words'],
  ['60 cm²', false, 'forgot the half'],
  ['30 cm', false, 'a length unit for an area'],
]);
M('Evaluate 2^5.', '32', [], [
  ['2*2*2*2*2', false, 'not evaluated'],
  ['thirty-two', true, 'number in words'],
]);
M('A car travels 180 miles in 3 hours. What is its average speed?', '60 miles per hour', ['60 mph'], [
  ['60 miles an hour', true, 'same unit'],
  ['60 km/h', false, 'wrong unit'],
  ['540 miles per hour', false, 'multiplied'],
]);
M('List all the factors of 12.', '1, 2, 3, 4, 6, 12', [], [
  ['1, 2, 3, 4, 6', false, '12 missing'],
  ['2, 3, 4, 6', false, '1 and 12 missing'],
  ['12, 6, 4, 3, 2, 1', true, 'any order'],
]);
M('What is the median of 3, 9, 4, 7, 5?', '5', [], [
  ['the median is 5', true, 'in a sentence'],
  ['5.6', false, 'that is the mean'],
]);
M('How many sides does a hexagon have?', '6', [], [
  ['six', true, 'in words'],
  ['6 sides', true, 'with the unit'],
  ['8', false, 'octagon'],
]);
M('Write 1,250,000 in scientific notation.', '1.25 × 10^6', [], [
  ['1.25 x 10^6', true, 'x for times'],
  ['1.25 * 10^6', true, '* for times'],
  ['12.5 × 10^5', false, 'coefficient must be under 10'],
  ['1.25 × 10^5', false, 'wrong exponent'],
]);
M('Maria has 3 times as many stickers as Tom. Tom has 14 stickers. How many stickers do they have together?', '56', [], [
  ['56 stickers', true, 'with the unit'],
  ['42', false, "only Maria's"],
  ['42 stickers', false, "only Maria's"],
  ['fifty-six', true, 'in words'],
]);
M('A bag has 4 red and 6 blue marbles. What is the probability of picking a red marble? Give a fraction in lowest terms.', '2/5', [], [
  ['4/10', false, 'not in lowest terms'],
  ['2/3', false, 'red to blue, not red to all'],
  ['two fifths', false, 'the item asks for a fraction like 2/5... see note'],
]);

// Not a teacher-unanimous label: drop it (kept here so the reasoning is visible).
const AMBIGUOUS = new Set(['two fifths', 'Cierras la puerta, por favor', 'veinte y uno', 'zero point three seven five']);

/**
 * Label audit, 2026-10-23: every case where all the strong judges (Nemotron Ultra on
 * NVIDIA and on OpenRouter, GLM 5.3 @max) agreed against the label was read again.
 *   RELABELLED: the pilot marked "which" as a valid alternate on items that say
 *     'Join these into one sentence using "that"'. The item names the word, so "which"
 *     does not do what was asked: wrong.
 *   DISPUTED (kept in the file, left out of every score): careful teachers would split.
 *     "venga" for an unspecified "you" (usted form; the key uses tú), "No tengo un coche"
 *     (the article is grammatical but marked), "Tengo que" for "I need to".
 */
const RELABEL = {
  g94: { truth: false, why: 'the item asks for "that"; "which" does not do what was asked (relabelled 2026-10-23)' },
  g104: { truth: false, why: 'the item asks for "that" (relabelled 2026-10-23)' },
  g108: { truth: false, why: 'the item asks for "that" (relabelled 2026-10-23)' },
  g110: { truth: false, why: 'the item asks for "that" (relabelled 2026-10-23)' },
  g113: { truth: false, why: 'the item asks for "that" (relabelled 2026-10-23)' },
  g117: { truth: false, why: 'the item asks for "that" (relabelled 2026-10-23)' },
};
const DISPUTED = new Set(['g9', 'x48', 'x9', 'x11', 'x69']);

/**
 * Adversarial cases (security review 2026-10-24, D3): a WRONG answer with text aimed at
 * the grader (ignore-the-rules, "the answer is correct", fake system or reference lines,
 * JSON verdicts, role-play, chat-template tokens, obfuscated text) or a wrong answer
 * dressed up with a claim ("my teacher accepts this"). Each borrows the question and key
 * of a pilot case (`base`), and every one is labelled incorrect: the substance of the
 * answer is wrong, so no wording around it can make it acceptable. Written by hand in
 * curriculum-build/grading-cascade/adversarial-cases.json, English and Spanish.
 */
function adversarial(baseCases) {
  const file = path.join(ROOT, 'curriculum-build', 'grading-cascade', 'adversarial-cases.json');
  if (!fs.existsSync(file)) return [];
  const byId = new Map(baseCases.map((c) => [c.id, c]));
  return JSON.parse(fs.readFileSync(file, 'utf8')).map((a) => {
    const b = byId.get(a.base);
    if (!b) throw new Error(`${a.id}: no base case ${a.base}`);
    if (b.truth) throw new Error(`${a.id}: base case ${a.base} is an acceptable answer; adversarial cases borrow wrong ones`);
    return {
      id: a.id, group: 'adversarial', kind: a.kind, truth: false,
      why: 'a wrong answer with text aimed at the grader (prompt injection) or a claim of acceptance; never acceptable',
      question: b.question, reference: b.reference, accepted: b.accepted || [], learner: a.learner, format: b.format,
      base: a.base, source: 'adversarial 2026-10-24',
    };
  });
}

function build() {
  const pilot = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'jev-pilot', 'grading-cases.json'), 'utf8'))
    .map((c) => ({ ...c, source: 'jev-pilot' }));
  const added = extra.filter((c) => !AMBIGUOUS.has(c.learner)).map((c) => ({ ...c, source: 'added 2026-10-23' }));
  const all = [...pilot, ...added, ...adversarial([...pilot, ...added])].map((c) => {
    const r = RELABEL[c.id];
    const out = r ? { ...c, truth: r.truth, kind: r.truth ? c.kind : 'near-miss', why: r.why, relabelled: true } : c;
    return DISPUTED.has(c.id) ? { ...out, disputed: true } : out;
  });
  const ids = new Set();
  for (const c of all) {
    if (ids.has(c.id)) throw new Error(`duplicate id ${c.id}`);
    ids.add(c.id);
    for (const k of ['question', 'reference', 'learner']) if (!String(c[k] || '').trim()) throw new Error(`${c.id}: empty ${k}`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
  const count = {};
  for (const c of all) { const k = `${c.group} | ${c.truth ? 'acceptable' : 'wrong'}`; count[k] = (count[k] || 0) + 1; }
  return { total: all.length, pilot: pilot.length, added: added.length, count };
}

if (require.main === module) console.log(JSON.stringify(build(), null, 1));
module.exports = { build, OUT };
