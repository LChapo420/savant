/**
 * English and Reading skills the bank was missing at both ends (grade-fit, 2026-10-24).
 *
 * Before these, a preschool English or Reading grade could only be served phonics
 * and ACT-style passages about salt marshes, and a doctoral grade only high-school
 * grammar and the same passages. These fill the gaps:
 *
 *   early_literacy       letters, rhymes, first sounds, syllables, words in a
 *                        sentence, how a book works (preschool to grade 1)
 *   early_comprehension  short stories and animal fact texts with who, where,
 *                        first/then/last, feelings and main idea (grades 1 to 4)
 *   literary_analysis    devices, forms, narration and critical theory (grade 5 on)
 *   academic_writing     sources, argument, citation and research practice (grade 5 on)
 *   linguistics          sounds, words, sentences and language in society (college on)
 *
 * Which grade may use which is config/grade-skills.js. The generated items are
 * re-derived from what the learner is shown by scripts/math-reading-template-audit.js;
 * the authored ones are checked there against REVIEWED_ENGLISH, the key each was
 * fact-checked with.
 */
const { fromPool } = require('./pool');

const item = (o) => ({ source: 'bank', ...o });
const q = (s) => `"${s}"`;

// ── early literacy ──────────────────────────────────────────────────────────
// Rhyme families: every word in a family shares its rime and no two families do.
const RHYMES = [
  ['cat', 'hat', 'bat', 'mat', 'rat'], ['dog', 'log', 'frog', 'fog'], ['pig', 'wig', 'big', 'dig'],
  ['sun', 'run', 'bun', 'fun'], ['bed', 'red', 'sled'], ['hen', 'pen', 'ten'], ['cake', 'lake', 'rake', 'snake'],
  ['bug', 'rug', 'hug', 'mug'], ['top', 'mop', 'hop'], ['car', 'star', 'jar'], ['king', 'ring', 'sing', 'wing'],
];
// Words that start with one plain consonant sound (no digraphs, and no c/k, which share a sound).
const FIRST = {
  b: ['ball', 'bear', 'bus', 'boat'], m: ['moon', 'milk', 'map', 'mouse'], s: ['sun', 'sock', 'seal', 'soap'],
  t: ['top', 'tiger', 'tent', 'toe'], p: ['pig', 'pan', 'pear', 'pot'], d: ['dog', 'duck', 'door', 'doll'],
  f: ['fish', 'fan', 'fox', 'feet'], l: ['lion', 'leaf', 'lamp', 'log'], r: ['rain', 'rabbit', 'rock', 'ring'],
  n: ['nest', 'nose', 'nut', 'net'],
};
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SYLLABLES = {
  cat: 1, dog: 1, sun: 1, ball: 1, tree: 1, apple: 2, tiger: 2, rabbit: 2, pencil: 2, monkey: 2, table: 2, zebra: 2,
  banana: 3, butterfly: 3, elephant: 3, dinosaur: 3, umbrella: 3, kangaroo: 3, computer: 3, caterpillar: 4,
  watermelon: 4, alligator: 4, helicopter: 4,
};
const SENT_ANIMALS = ['cat', 'dog', 'duck', 'frog', 'hen', 'pig'];
const SENT_VERBS = ['sat', 'slept', 'hid', 'jumped', 'stood'];
const SENT_PLACES = ['mat', 'bed', 'log', 'rug', 'box', 'hill'];
const PRINT = [
  { d: 1, p: 'In English, which way do we read the words on a page?', c: ['from left to right', 'from right to left', 'from the bottom to the top', 'from the middle out'], a: 'from left to right', r: 'English is read from left to right, and from the top line down.' },
  { d: 1, p: 'What is the front of a book called?', c: ['the cover', 'the spine', 'the last page', 'the index'], a: 'the cover', r: 'The front cover is where the title is printed, and it is where we start.' },
  { d: 1.5, p: 'Who writes the words in a book?', c: ['the author', 'the illustrator', 'the reader', 'the librarian'], a: 'the author', r: 'The author writes the words; the illustrator draws the pictures.' },
  { d: 1.5, p: 'Who draws the pictures in a picture book?', c: ['the illustrator', 'the author', 'the reader', 'the printer'], a: 'the illustrator', r: 'The illustrator makes the pictures; the author writes the words.' },
  { d: 2, p: 'What is the name of a book called?', c: ['the title', 'the author', 'the page', 'the letter'], a: 'the title', r: 'The title is the name of the book, and it is printed on the cover.' },
];
const PRINT_GEN = fromPool(PRINT, 'early_literacy');

function earlyLiteracy(rng, d, ctx) {
  const kind = rng.pick(d < 1.7 ? ['rhyme', 'after', 'before', 'lower', 'upper', 'startsWith', 'print'] : d < 2.4
    ? ['rhyme', 'after', 'before', 'lower', 'upper', 'startsWith', 'first', 'syllables', 'vowel', 'print'] : ['rhyme', 'first', 'syllables', 'vowel', 'words', 'before', 'after', 'startsWith']);
  if (kind === 'print') return PRINT_GEN(rng, d, ctx);
  if (kind === 'upper') {
    const L = rng.pick(ALPHA.split(''));
    const others = rng.sample(ALPHA.split('').filter((l) => l !== L), 3);
    return item({ format: 'multiple_choice', prompt: `Find the capital letter for the small letter ${q(L.toLowerCase())}.`, choices: rng.shuffle([L, ...others]), answer: L,
      rationale: `${q(L.toLowerCase())} and ${q(L)} are the same letter, written small and big.` });
  }
  if (kind === 'startsWith') {
    const letters = rng.sample(Object.keys(FIRST), 4);
    const others = letters.slice(1).map((l) => rng.pick(FIRST[l]));
    const ans = rng.pick(FIRST[letters[0]]);
    return item({ format: 'multiple_choice', prompt: `Which word starts with the letter ${q(letters[0])}?`, choices: rng.shuffle([ans, ...others]), answer: ans,
      rationale: `${q(ans)} starts with ${q(letters[0])}; the other words start with different letters.` });
  }
  if (kind === 'before') {
    const i = rng.int(1, 25);
    const ans = ALPHA[i - 1];
    const others = rng.sample(ALPHA.split('').filter((l) => l !== ans && l !== ALPHA[i]), 3);
    return item({ format: 'multiple_choice', prompt: `Which letter is just before ${q(ALPHA[i])} when you say the ABCs?`, choices: rng.shuffle([ans, ...others]), answer: ans,
      rationale: `In the alphabet song, ${q(ans)} comes just before ${q(ALPHA[i])}.` });
  }
  if (kind === 'rhyme') {
    const fams = rng.sample(RHYMES, 4);
    const [w, ans] = rng.sample(fams[0], 2);
    const others = fams.slice(1).map((f) => rng.pick(f));
    return item({ format: 'multiple_choice', prompt: `Which word rhymes with ${q(w)}?`, choices: rng.shuffle([ans, ...others]), answer: ans,
      rationale: `${q(w)} and ${q(ans)} end with the same sound, so they rhyme.` });
  }
  if (kind === 'first') {
    const letters = rng.sample(Object.keys(FIRST), 4);
    const [w, ans] = rng.sample(FIRST[letters[0]], 2);
    const others = letters.slice(1).map((l) => rng.pick(FIRST[l]));
    return item({ format: 'multiple_choice', prompt: `Which word begins with the same sound as ${q(w)}?`, choices: rng.shuffle([ans, ...others]), answer: ans,
      rationale: `${q(w)} and ${q(ans)} both begin with the /${letters[0]}/ sound.` });
  }
  if (kind === 'after' || kind === 'before') {
    const i = kind === 'after' ? rng.int(0, 24) : rng.int(1, 25);
    const ans = ALPHA[kind === 'after' ? i + 1 : i - 1];
    const others = rng.sample(ALPHA.split('').filter((l) => l !== ans && l !== ALPHA[i]), 3);
    return item({ format: 'multiple_choice', prompt: `Which letter comes right ${kind} ${q(ALPHA[i])} in the alphabet?`, choices: rng.shuffle([ans, ...others]), answer: ans,
      rationale: `In the alphabet song, ${kind === 'after' ? `${q(ALPHA[i])} is followed by ${q(ans)}` : `${q(ans)} comes just before ${q(ALPHA[i])}`}.` });
  }
  if (kind === 'lower') {
    const L = rng.pick(ALPHA.split(''));
    const others = rng.sample(ALPHA.toLowerCase().split('').filter((l) => l !== L.toLowerCase()), 3);
    return item({ format: 'multiple_choice', prompt: `Which lowercase letter goes with the capital letter ${q(L)}?`, choices: rng.shuffle([L.toLowerCase(), ...others]), answer: L.toLowerCase(),
      rationale: `${q(L)} and ${q(L.toLowerCase())} are the same letter, written big and small.` });
  }
  if (kind === 'syllables') {
    const w = rng.pick(Object.keys(SYLLABLES));
    return item({ format: 'type_in', prompt: `Clap the word ${q(w)}. How many syllables does it have?`, answer: String(SYLLABLES[w]),
      rationale: `Each clap is one syllable, and ${q(w)} has ${SYLLABLES[w]}.` });
  }
  if (kind === 'vowel') {
    const v = rng.pick(['a', 'e', 'i', 'o', 'u']);
    const cons = rng.sample('bcdfghjklmnprstvwz'.split(''), 3);
    return item({ format: 'multiple_choice', prompt: 'Which of these letters is a vowel?', choices: rng.shuffle([v, ...cons]), answer: v,
      rationale: `The vowels are a, e, i, o and u, so ${q(v)} is the vowel here.` });
  }
  const s = `The ${rng.pick(SENT_ANIMALS)} ${rng.pick(SENT_VERBS)} on the ${rng.pick(SENT_PLACES)}.`;
  const n = s.split(' ').length;
  return item({ format: 'type_in', prompt: `How many words are in this sentence? ${q(s)}`, answer: String(n),
    rationale: `Count each word with a space after it: ${s.replace(/\.$/, '').split(' ').join(' / ')}. That is ${n} words.` });
}

// ── early comprehension ─────────────────────────────────────────────────────
const KIDS = [['Mia', 'she', 'her'], ['Ben', 'he', 'his'], ['Ana', 'she', 'her'], ['Leo', 'he', 'his'], ['Zoe', 'she', 'her'], ['Sam', 'he', 'his']];
const RELATIVES = ['grandma', 'grandpa', 'mom', 'dad', 'aunt', 'uncle', 'big sister', 'big brother'];
const PLACES = {
  park: ['played on the swings', 'fed the ducks', 'ate a picnic lunch'],
  beach: ['built a sandcastle', 'looked for shells', 'splashed in the waves'],
  library: ['picked out three books', 'listened to a story', 'drew a picture of a dragon'],
  farm: ['collected eggs', 'brushed a pony', 'rode on a tractor'],
  zoo: ['watched the lions', 'fed the goats', 'saw a sleeping bear'],
  garden: ['planted seeds', 'watered the flowers', 'picked tomatoes'],
};
const FEELINGS = [['happy', 'they had a fun day together'], ['tired', 'they had been busy all day'], ['proud', 'everyone said they had done a great job']];
const ANIMALS = {
  frogs: { home: 'live near ponds and streams', food: 'eat flies and other insects', extra: 'Baby frogs are called tadpoles.' },
  honeybees: { home: 'live in hives', food: 'eat nectar and pollen from flowers', extra: 'They make honey.' },
  'barn owls': { home: 'live in barns and old trees', food: 'eat mice', extra: 'They hunt at night.' },
  'emperor penguins': { home: 'live in Antarctica', food: 'eat fish and squid', extra: 'They cannot fly, but they swim very well.' },
  camels: { home: 'live in the desert', food: 'eat desert plants', extra: 'They can go many days without drinking water.' },
  'gray squirrels': { home: 'live in trees', food: 'eat nuts and seeds', extra: 'They bury nuts to eat later.' },
  'dairy cows': { home: 'live on farms', food: 'eat grass and hay', extra: 'They give us milk.' },
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function earlyComprehension(rng, d) {
  if (d >= 2 && rng.bool(0.4)) {
    const names = rng.sample(Object.keys(ANIMALS), 4);
    const a = names[0]; const f = ANIMALS[a];
    const passage = `${cap(a)} ${f.home}. They ${f.food}. ${f.extra}`;
    const kind = rng.pick(['food', 'home', 'about', 'fact']);
    if (kind === 'food' || kind === 'home') {
      const word = kind === 'food' ? 'eat' : 'live';
      const strip = (s) => s.replace(new RegExp(`^${word} `), '');
      return item({ format: 'multiple_choice', passage, prompt: kind === 'food' ? `According to the text, what do ${a} eat?` : `According to the text, where do ${a} live?`,
        choices: rng.shuffle(names.map((n) => strip(ANIMALS[n][kind]))), answer: strip(f[kind]),
        rationale: `The text says that ${a} ${f[kind]}.` });
    }
    if (kind === 'about') {
      return item({ format: 'multiple_choice', passage, prompt: 'What is this text mostly about?', choices: rng.shuffle(names), answer: a,
        rationale: `Every sentence tells something about ${a}.` });
    }
    return item({ format: 'multiple_choice', passage, prompt: 'Which fact is in the text?', choices: rng.shuffle(names.map((n) => ANIMALS[n].extra)), answer: f.extra,
      rationale: `The text ends: ${q(f.extra)}` });
  }
  const [name, pron, poss] = rng.pick(KIDS);
  const [place, other1, other2, other3] = rng.sample(Object.keys(PLACES), 4);
  const acts = rng.shuffle(PLACES[place]);
  const rels = rng.sample(RELATIVES, 4);
  const [feel, reason] = rng.pick(FEELINGS);
  const passage = `${name} went to the ${place} with ${poss} ${rels[0]}. First, they ${acts[0]}. Then they ${acts[1]}. Last, they ${acts[2]}. ${name} felt ${feel} because ${reason}.`;
  const kinds = d < 2.5 ? ['who', 'where', 'first', 'then', 'last', 'feel'] : ['who', 'where', 'first', 'last', 'why', 'about'];
  const kind = rng.pick(kinds);
  const mc = (prompt, choices, answer, rationale) => item({ format: 'multiple_choice', passage, prompt, choices: rng.shuffle(choices), answer, rationale });
  if (kind === 'who') return mc(`Who went to the ${place} with ${name}?`, rels.map((r) => `${poss} ${r}`), `${poss} ${rels[0]}`, `The first sentence says ${name} went with ${poss} ${rels[0]}.`);
  if (kind === 'where') return mc(`Where did ${name} go?`, [place, other1, other2, other3].map((p) => `to the ${p}`), `to the ${place}`, `The story begins: ${name} went to the ${place}.`);
  if (kind === 'feel') return mc(`How did ${name} feel at the end?`, ['happy', 'tired', 'proud', 'scared'], feel, `The last sentence says ${name} felt ${feel}.`);
  if (kind === 'why') return mc(`Why did ${name} feel ${feel}?`, [...FEELINGS.map((x) => x[1]), 'it started to rain'], reason, `The story says ${name} felt ${feel} because ${reason}.`);
  if (kind === 'about') return mc('What is the story mostly about?', [place, other1, other2, other3].map((p) => `a trip to the ${p}`), `a trip to the ${place}`, `The whole story happens on ${name}'s trip to the ${place}.`);
  const at = { first: 0, then: 1, last: 2 }[kind];
  const word = { first: 'first', then: 'next, after the first thing', last: 'last' }[kind];
  return mc(kind === 'then' ? `What did they do second?` : `What did they do ${word}?`, [...acts, PLACES[other1][0]], acts[at],
    `The story uses ${kind === 'first' ? '"First"' : kind === 'then' ? '"Then"' : '"Last"'} to show the order: they ${acts[at]}.`);
}

// ── literary analysis ───────────────────────────────────────────────────────
const LITERARY = [
  { d: 3, p: 'Which sentence uses a simile?', c: ['Her smile was as bright as the sun.', 'Her smile was the sun.', 'She smiled at the sun.', 'The sun was bright today.'], a: 'Her smile was as bright as the sun.', r: 'A simile compares two things using "like" or "as".' },
  { d: 3, p: 'Which sentence uses personification?', c: ['The wind whispered through the trees.', 'The wind was very strong.', 'The trees were tall and green.', 'We walked between the trees.'], a: 'The wind whispered through the trees.', r: 'Personification gives a human action, whispering, to something that is not human.' },
  { d: 3.5, p: 'What is the setting of a story?', c: ['when and where it takes place', 'the main problem the characters face', 'the lesson the story teaches', 'the person who tells the story'], a: 'when and where it takes place', r: 'The setting is the time and place of the events.' },
  { d: 4, p: '"My backpack weighs a thousand pounds." This sentence is an example of', c: ['hyperbole', 'a simile', 'onomatopoeia', 'alliteration'], a: 'hyperbole', r: 'Hyperbole is deliberate exaggeration for effect; no backpack weighs a thousand pounds.' },
  { d: 4, p: 'Which line uses alliteration?', c: ['Seven silly snakes slid south.', 'The snake slid quietly away.', 'Snakes are reptiles.', 'A snake is like a rope.'], a: 'Seven silly snakes slid south.', r: 'Alliteration repeats the same first consonant sound in nearby words.' },
  { d: 4, p: 'A story is told by a narrator who uses "I" and takes part in the events. This is', c: ['first-person point of view', 'third-person omniscient point of view', 'second-person point of view', 'third-person limited point of view'], a: 'first-person point of view', r: 'A narrator who says "I" and is a character in the story is a first-person narrator.' },
  { d: 4.5, p: 'Which word is an example of onomatopoeia?', c: ['buzz', 'quickly', 'beautiful', 'river'], a: 'buzz', r: 'Onomatopoeia is a word that imitates the sound it names, like "buzz".' },
  { d: 4.5, p: 'What is the theme of a story?', c: ['the central message or insight about life it conveys', 'the order in which events happen', 'the place where the story happens', 'the most exciting moment of the plot'], a: 'the central message or insight about life it conveys', r: 'The theme is the underlying idea the story expresses, such as the cost of pride.' },
  { d: 5, p: 'A sailor alone on a raft struggles to survive a storm. Which type of conflict is this?', c: ['character versus nature', 'character versus self', 'character versus society', 'character versus character'], a: 'character versus nature', r: 'The struggle is against a force of nature, the storm.' },
  { d: 5, p: 'An author gives hints early in a story about what will happen later. This technique is called', c: ['foreshadowing', 'flashback', 'imagery', 'characterization'], a: 'foreshadowing', r: 'Foreshadowing hints at later events; a flashback moves back to earlier ones.' },
  { d: 5, p: 'A poem with the rhyme pattern AABB is made of', c: ['pairs of rhyming lines', 'lines that never rhyme', 'every other line rhyming', 'one rhyme repeated in every line'], a: 'pairs of rhyming lines', r: 'AABB means lines 1 and 2 rhyme, then lines 3 and 4: rhyming couplets.' },
  { d: 5.5, p: 'In a play, the audience knows a character is about to walk into a trap, but the character does not. This is', c: ['dramatic irony', 'verbal irony', 'situational irony', 'a soliloquy'], a: 'dramatic irony', r: 'Dramatic irony is when the audience knows something a character does not.' },
  { d: 5.5, p: 'A fire station burns down. This is an example of', c: ['situational irony', 'dramatic irony', 'personification', 'an allusion'], a: 'situational irony', r: 'Situational irony is when what happens is the opposite of what we would expect.' },
  { d: 6, p: 'Which phrase is an oxymoron?', c: ['deafening silence', 'loud music', 'quiet library', 'silent night'], a: 'deafening silence', r: 'An oxymoron puts two contradictory words side by side.' },
  { d: 6, p: 'How many lines does a sonnet traditionally have?', c: ['14', '10', '12', '16'], a: '14', r: 'A sonnet is a fourteen-line poem, usually in iambic pentameter.' },
  { d: 6, p: 'A Shakespearean (English) sonnet ends with', c: ['a rhyming couplet', 'a single unrhymed line', 'a repeated refrain', 'a six-line sestet'], a: 'a rhyming couplet', r: 'Its rhyme scheme is ABAB CDCD EFEF GG: three quatrains and a final couplet.' },
  { d: 6, p: 'A character alone on stage speaks his thoughts aloud for the audience. This speech is', c: ['a soliloquy', 'an aside', 'a dialogue', 'an epilogue'], a: 'a soliloquy', r: 'A soliloquy is a speech made alone on stage, revealing inner thoughts.' },
  { d: 6.5, p: 'In classical tragedy, the hero\'s fatal error or flaw is called', c: ['hamartia', 'catharsis', 'anagnorisis', 'mimesis'], a: 'hamartia', r: 'Aristotle\'s term for the tragic error is hamartia; catharsis is the purging of the audience and anagnorisis a recognition.' },
  { d: 6.5, p: '"I have a dream that... I have a dream that... I have a dream that..." The repetition at the start of each clause is', c: ['anaphora', 'chiasmus', 'litotes', 'zeugma'], a: 'anaphora', r: 'Anaphora repeats a word or phrase at the beginning of successive clauses.' },
  { d: 6.5, p: 'A sentence of poetry that runs on past the end of a line without a pause is an example of', c: ['enjambment', 'caesura', 'end-stopping', 'meter'], a: 'enjambment', r: 'Enjambment carries the sense over the line break; a caesura is a pause within a line.' },
  { d: 7, p: 'A novel told entirely through letters is called', c: ['an epistolary novel', 'a picaresque novel', 'a bildungsroman', 'a roman à clef'], a: 'an epistolary novel', r: 'Epistolary novels are written as letters (or diaries and documents).' },
  { d: 7, p: 'A novel that follows a young protagonist\'s growth into adulthood is a', c: ['bildungsroman', 'satire', 'novella', 'gothic romance'], a: 'bildungsroman', r: 'A bildungsroman is a coming-of-age novel of education and formation.' },
  { d: 7, p: '"Shall I compare thee to a summer\'s day?" opens a Shakespeare sonnet. The meter of that sonnet is', c: ['iambic pentameter', 'trochaic tetrameter', 'dactylic hexameter', 'anapestic trimeter'], a: 'iambic pentameter', r: 'Five iambs, unstressed then stressed: shall I / com-PARE / thee TO / a SUM- / mer\'s DAY.' },
  { d: 7.5, p: '"All hands on deck" uses a part (hands) to stand for the whole (sailors). This figure is', c: ['synecdoche', 'metonymy', 'apostrophe', 'hyperbole'], a: 'synecdoche', r: 'Synecdoche names a part for the whole; metonymy names something closely associated.' },
  { d: 7.5, p: '"The White House announced a new policy" uses a building to stand for the president\'s staff. This figure is', c: ['metonymy', 'synecdoche', 'personification', 'litotes'], a: 'metonymy', r: 'Metonymy substitutes something closely associated (the building) for the thing meant.' },
  { d: 7.5, p: '"Ask not what your country can do for you; ask what you can do for your country." The reversed structure is', c: ['chiasmus', 'anaphora', 'zeugma', 'polysyndeton'], a: 'chiasmus', r: 'Chiasmus repeats terms in reverse order (A-B, B-A).' },
  { d: 7.5, p: '"She was not unaware of the danger" makes its point by denying the opposite. This figure is', c: ['litotes', 'hyperbole', 'paradox', 'zeugma'], a: 'litotes', r: 'Litotes is understatement by negating the contrary ("not unaware" = aware).' },
  { d: 8, p: 'A third-person narration that slips into a character\'s own idiom and thoughts without quotation marks is called', c: ['free indirect discourse', 'stream of consciousness', 'dramatic monologue', 'unreliable narration'], a: 'free indirect discourse', r: 'Free indirect discourse blends the narrator\'s voice with the character\'s; Austen and Flaubert are classic users.' },
  { d: 8, p: 'An epic that opens in the middle of the action, as the Iliad does, begins', c: ['in medias res', 'ab ovo', 'in extremis', 'deus ex machina'], a: 'in medias res', r: '"In medias res" (into the middle of things) is Horace\'s phrase; "ab ovo" means from the very beginning.' },
  { d: 8, p: 'In a Petrarchan sonnet, the octave is followed by', c: ['a sestet', 'a couplet', 'a quatrain', 'a refrain'], a: 'a sestet', r: 'The Italian sonnet divides into an eight-line octave and a six-line sestet, with a turn (volta) between.' },
  { d: 8, p: 'The meter of Homer\'s Iliad and Virgil\'s Aeneid is', c: ['dactylic hexameter', 'iambic pentameter', 'alliterative verse', 'terza rima'], a: 'dactylic hexameter', r: 'Classical epic is written in dactylic hexameter, six feet per line.' },
  { d: 8.5, p: 'In Aristotle\'s Poetics, the purging of pity and fear that tragedy brings about is', c: ['catharsis', 'anagnorisis', 'peripeteia', 'hamartia'], a: 'catharsis', r: 'Catharsis is the purgation of pity and fear; anagnorisis is recognition and peripeteia a reversal.' },
  { d: 8.5, p: 'Viktor Shklovsky argued that art makes the familiar strange so we perceive it anew. His term for this is', c: ['defamiliarization', 'différance', 'heteroglossia', 'intertextuality'], a: 'defamiliarization', r: 'Defamiliarization (ostranenie) is the Russian Formalist idea from "Art as Technique" (1917).' },
  { d: 8.5, p: 'Wimsatt and Beardsley called judging a poem by what its author meant to do', c: ['the intentional fallacy', 'the affective fallacy', 'the pathetic fallacy', 'the biographical fallacy'], a: 'the intentional fallacy', r: 'Their 1946 essay "The Intentional Fallacy" is a founding text of New Criticism.' },
  { d: 9, p: 'Which critic is most associated with New Historicism?', c: ['Stephen Greenblatt', 'Jacques Derrida', 'Wolfgang Iser', 'Northrop Frye'], a: 'Stephen Greenblatt', r: 'Greenblatt coined the term in the early 1980s (Renaissance Self-Fashioning, 1980).' },
  { d: 9, p: 'Roland Barthes\'s 1967 essay arguing that a text\'s meaning lies with its reader rather than its writer is', c: ['"The Death of the Author"', '"What Is an Author?"', '"Tradition and the Individual Talent"', '"The Intentional Fallacy"'], a: '"The Death of the Author"', r: '"What Is an Author?" is Foucault\'s reply (1969); the Eliot essay is from 1919.' },
  { d: 9, p: 'Mikhail Bakhtin\'s term for the many social voices and registers present within a novel is', c: ['heteroglossia', 'defamiliarization', 'the uncanny', 'focalization'], a: 'heteroglossia', r: 'Heteroglossia (raznorechie) is Bakhtin\'s word for the novel\'s diversity of social speech.' },
  { d: 9, p: 'Edward Said\'s 1978 study of how the West represented "the East" is', c: ['Orientalism', 'The Wretched of the Earth', 'Imagined Communities', 'The Location of Culture'], a: 'Orientalism', r: 'Orientalism is foundational to postcolonial criticism; the others are by Fanon, Anderson and Bhabha.' },
  { d: 9.5, p: 'In Gérard Genette\'s narratology, an analepsis is', c: ['a narration of events earlier than the present point of the story', 'a narration of events that will happen later', 'a gap the narrative leaves unfilled', 'a shift in who perceives the events'], a: 'a narration of events earlier than the present point of the story', r: 'Analepsis is Genette\'s flashback; prolepsis is a flash-forward, and focalization concerns who perceives.' },
  { d: 9.5, p: 'Sandra Gilbert and Susan Gubar\'s 1979 study of nineteenth-century women writers is', c: ['The Madwoman in the Attic', 'A Room of One\'s Own', 'The Second Sex', 'Sexual Politics'], a: 'The Madwoman in the Attic', r: 'The others are by Woolf (1929), Beauvoir (1949) and Millett (1970).' },
  { d: 9.5, p: 'Harold Bloom\'s theory that poets write in struggle against their strong predecessors is called', c: ['the anxiety of influence', 'the horizon of expectations', 'the hermeneutic circle', 'the objective correlative'], a: 'the anxiety of influence', r: 'Bloom set it out in The Anxiety of Influence (1973); the others are Jauss, Schleiermacher and Gadamer, and Eliot.' },
  { d: 10, p: 'Julia Kristeva coined a term for the way every text is built from and responds to other texts. It is', c: ['intertextuality', 'metafiction', 'dialogism', 'paratext'], a: 'intertextuality', r: 'Kristeva introduced "intertextuality" in the 1960s, developing Bakhtin\'s dialogism; "paratext" is Genette\'s.' },
  { d: 10, p: 'Hans Robert Jauss\'s reception theory describes the assumptions a work\'s first readers bring to it as', c: ['the horizon of expectations', 'the implied reader', 'the interpretive community', 'the political unconscious'], a: 'the horizon of expectations', r: 'The implied reader is Iser\'s, the interpretive community Fish\'s and the political unconscious Jameson\'s.' },
];

// ── academic writing and research ───────────────────────────────────────────
const ACADEMIC = [
  // Grade 4 (standards check, 2026-10-24): the pool's other early entries are
  // grades 6-7 (claims, counterclaims, plagiarism), so grade 4 had two questions.
  { d: 3.5, p: 'Which sentence states a fact rather than an opinion?', c: ['A week has seven days.', 'Mondays are the worst day of the week.', 'Everyone loves summer holidays.', 'Pizza is the tastiest food.'], a: 'A week has seven days.', r: 'A fact can be checked and shown to be true; the other three say what someone thinks or feels.' },
  { d: 4, p: 'A firsthand account of an event is written by', c: ['someone who was there and saw it happen', 'someone who read about it much later', 'a person who made the event up', 'a dictionary editor'], a: 'someone who was there and saw it happen', r: 'A firsthand account comes from a witness; a secondhand account is told by someone who learned about it from others.' },
  { d: 4, p: 'When you write a report, why do you list the books and websites you used?', c: ['so readers know where the information came from', 'to make the report look longer', 'because every report needs exactly five sources', 'so nobody else can use those books'], a: 'so readers know where the information came from', r: 'A list of sources lets readers check the facts and gives credit to the writers you learned from.' },
  { d: 3.5, p: 'Which statement is an opinion rather than a fact?', c: ['Summer is the best season of the year.', 'Water freezes at 0 degrees Celsius.', 'A week has seven days.', 'The Pacific is the largest ocean.'], a: 'Summer is the best season of the year.', r: 'An opinion is a belief that cannot be proved true or false; the others can be checked.' },
  { d: 4, p: 'A diary written by a soldier during a war is', c: ['a primary source', 'a secondary source', 'a tertiary source', 'an opinion piece'], a: 'a primary source', r: 'A primary source was created by someone who took part in or witnessed the events.' },
  { d: 4.5, p: 'Which is the strongest thesis statement for an essay?', c: ['School should start later because teenagers need more sleep to learn well.', 'This essay is about school start times.', 'Some schools start early and some start late.', 'Sleep is something everyone does.'], a: 'School should start later because teenagers need more sleep to learn well.', r: 'A strong thesis makes a clear, arguable claim and gives a reason for it.' },
  { d: 4.5, p: 'Using another writer\'s words or ideas without giving them credit is called', c: ['plagiarism', 'paraphrasing', 'summarizing', 'citing'], a: 'plagiarism', r: 'Plagiarism is presenting someone else\'s work as your own; citing gives the credit.' },
  { d: 5, p: 'Which source is usually the most reliable for a science report?', c: ['an article in a peer-reviewed journal', 'an anonymous post on a forum', 'an advertisement for a product', 'a comment under a video'], a: 'an article in a peer-reviewed journal', r: 'Peer-reviewed articles are checked by other experts before they are published.' },
  { d: 5, p: 'In an argument essay, a counterclaim is', c: ['an opposing point of view that the writer answers', 'the writer\'s main claim', 'a fact that supports the main claim', 'the essay\'s concluding sentence'], a: 'an opposing point of view that the writer answers', r: 'Addressing a counterclaim and rebutting it makes an argument stronger.' },
  { d: 5.5, p: 'Which logical fallacy attacks the person making an argument instead of the argument?', c: ['ad hominem', 'straw man', 'false dilemma', 'slippery slope'], a: 'ad hominem', r: '"Ad hominem" means "to the person".' },
  { d: 5.5, p: '"Either we ban all cars or the city will choke on smog." This argument is', c: ['a false dilemma', 'an ad hominem attack', 'a hasty generalization', 'circular reasoning'], a: 'a false dilemma', r: 'It presents only two options when many others exist.' },
  { d: 6, p: 'Which in-text citation follows APA style?', c: ['(Nguyen, 2019)', '(Nguyen 45)', '[1]', 'Nguyen: 2019'], a: '(Nguyen, 2019)', r: 'APA cites author and year; MLA cites author and page, as in (Nguyen 45).' },
  { d: 6, p: 'Which in-text citation follows MLA style?', c: ['(Okafor 112)', '(Okafor, 2020)', '(2020, Okafor)', '(Okafor, p. 112, 2020)'], a: '(Okafor 112)', r: 'MLA uses the author\'s name and the page number, with no comma.' },
  { d: 6, p: 'A study finds that towns with more ice-cream sales have more drownings. The best conclusion is that', c: ['the two are correlated, perhaps both rising in hot weather, but this does not show one causes the other', 'eating ice cream causes drowning', 'drowning causes people to buy ice cream', 'the study must be wrong'], a: 'the two are correlated, perhaps both rising in hot weather, but this does not show one causes the other', r: 'Correlation is not causation; a third factor, hot weather, can drive both.' },
  { d: 6.5, p: 'Which wording is the most appropriately hedged for an academic claim from one small study?', c: ['These results suggest that the method may improve recall.', 'These results prove that the method improves recall.', 'Everyone should use this method.', 'The method obviously works.'], a: 'These results suggest that the method may improve recall.', r: 'Hedging ("suggest", "may") matches the strength of the claim to the strength of the evidence.' },
  { d: 6.5, p: 'The main purpose of an abstract at the start of a research article is to', c: ['summarize the question, methods, results and conclusion briefly', 'list every source the author consulted', 'thank the people who helped', 'give the author\'s biography'], a: 'summarize the question, methods, results and conclusion briefly', r: 'An abstract lets a reader decide quickly whether the full article is relevant.' },
  { d: 7, p: 'The main job of a literature review is to', c: ['survey and synthesize existing research to show where a new study fits', 'report the results of a new experiment', 'list sources in alphabetical order without comment', 'argue for the author\'s personal opinion'], a: 'survey and synthesize existing research to show where a new study fits', r: 'A literature review maps what is known and identifies the gap a project addresses.' },
  { d: 7, p: 'In Aristotle\'s rhetoric, an appeal based on the speaker\'s credibility and character is', c: ['ethos', 'pathos', 'logos', 'kairos'], a: 'ethos', r: 'Ethos is credibility, pathos emotion, logos reasoning, and kairos the timeliness of an appeal.' },
  { d: 7, p: 'In the Toulmin model of argument, the assumption that connects the evidence to the claim is the', c: ['warrant', 'backing', 'qualifier', 'rebuttal'], a: 'warrant', r: 'Toulmin\'s warrant licenses the step from data (grounds) to claim; backing supports the warrant.' },
  { d: 7.5, p: 'A researcher interviews twelve nurses and analyses recurring themes in what they say. This is', c: ['a qualitative method', 'a quantitative method', 'a controlled experiment', 'a meta-analysis'], a: 'a qualitative method', r: 'Interviews analysed for themes produce qualitative, not numerical, data.' },
  { d: 7.5, p: 'Which research question is the most focused and researchable?', c: ['How does daily phone use relate to sleep duration among first-year university students?', 'What is the meaning of life?', 'Are phones good or bad?', 'Why is technology important?'], a: 'How does daily phone use relate to sleep duration among first-year university students?', r: 'A good research question names its variables and population and can be answered with evidence.' },
  { d: 7.5, p: 'A measuring instrument that gives consistent results each time it is used is', c: ['reliable', 'valid', 'significant', 'generalizable'], a: 'reliable', r: 'Reliability is consistency; validity is whether it measures what it claims to measure.' },
  { d: 8, p: 'The standard structure of many scientific articles is abbreviated IMRaD. It stands for', c: ['Introduction, Methods, Results and Discussion', 'Ideas, Materials, Reading and Drafting', 'Introduction, Motivation, Review and Data', 'Inquiry, Measurement, Reflection and Design'], a: 'Introduction, Methods, Results and Discussion', r: 'IMRaD is the conventional order of sections in empirical research articles.' },
  { d: 8, p: 'Before human participants take part in a university study, researchers normally need', c: ['approval from an ethics board and the participants\' informed consent', 'only the participants\' names', 'a publisher\'s contract', 'a patent on the method'], a: 'approval from an ethics board and the participants\' informed consent', r: 'An institutional review board (or ethics committee) reviews the study, and participants must give informed consent.' },
  { d: 8, p: 'Using several methods or data sources to cross-check a finding is called', c: ['triangulation', 'operationalization', 'replication', 'randomization'], a: 'triangulation', r: 'Triangulation strengthens a qualitative finding by checking it from more than one angle.' },
  { d: 8.5, p: 'In double-blind peer review,', c: ['neither the authors nor the reviewers know each other\'s identities', 'only the authors are anonymous', 'only the reviewers are anonymous', 'reviews are published with names attached'], a: 'neither the authors nor the reviewers know each other\'s identities', r: 'Single-blind hides only the reviewers; open review publishes names.' },
  { d: 8.5, p: 'A DOI attached to a journal article is', c: ['a persistent identifier that links to the article', 'the journal\'s impact factor', 'the article\'s page range', 'the author\'s ID number'], a: 'a persistent identifier that links to the article', r: 'A Digital Object Identifier resolves to the article even if its web address changes.' },
  { d: 8.5, p: 'The h-index of a scholar is 12. This means', c: ['12 of their papers have each been cited at least 12 times', 'they have published exactly 12 papers', 'their work has been cited 12 times in total', 'they have 12 co-authors'], a: '12 of their papers have each been cited at least 12 times', r: 'The h-index is the largest h such that h papers have at least h citations each.' },
  { d: 9, p: 'Publicly registering a study\'s hypotheses and analysis plan before collecting data is called', c: ['preregistration', 'peer review', 'replication', 'meta-analysis'], a: 'preregistration', r: 'Preregistration guards against changing the analysis after seeing the data.' },
  { d: 9, p: 'Trying many analyses and reporting only the ones that reach statistical significance is', c: ['p-hacking', 'triangulation', 'blinding', 'preregistration'], a: 'p-hacking', r: 'P-hacking inflates false positives and is one cause of the replication crisis.' },
  { d: 9, p: 'A journal\'s impact factor measures', c: ['the average number of recent citations to the articles it published', 'how many articles it rejects', 'the quality of each individual article', 'how long its review process takes'], a: 'the average number of recent citations to the articles it published', r: 'It averages citations in a year to items from the previous two years, and says nothing reliable about any one article.' },
  { d: 9.5, p: 'Under the widely used ICMJE criteria, which contribution alone does not qualify someone as an author?', c: ['acquiring the funding for the project', 'drafting the manuscript and approving the final version', 'designing the study and revising the paper critically', 'analysing the data and agreeing to be accountable for the work'], a: 'acquiring the funding for the project', r: 'ICMJE lists funding acquisition alone, general supervision or support as grounds for acknowledgement, not authorship.' },
  { d: 9.5, p: 'The "replication crisis" refers to', c: ['the finding that many published results could not be reproduced by later studies', 'a shortage of copies of rare books', 'the rising cost of printing journals', 'disputes over who owns research data'], a: 'the finding that many published results could not be reproduced by later studies', r: 'Large replication projects in psychology and medicine found many effects smaller than reported or absent.' },
  { d: 10, p: 'An editor reconstructing the text closest to an author\'s intention by comparing surviving versions is practising', c: ['textual criticism', 'reader-response criticism', 'discourse analysis', 'content strategy'], a: 'textual criticism', r: 'Textual criticism compares witnesses (manuscripts and editions) to establish a text.' },
  { d: 10, p: 'In a research grant proposal, the "specific aims" section mainly', c: ['states the concrete objectives the project will achieve and why they matter', 'lists the budget line by line', 'gives the full results of the project', 'describes the applicant\'s teaching record'], a: 'states the concrete objectives the project will achieve and why they matter', r: 'Reviewers read the aims first; they frame the problem, the gap and what will be done.' },
];

// ── linguistics ─────────────────────────────────────────────────────────────
const LINGUISTICS = [
  { d: 6, p: 'How many morphemes are in the word "unhappiness"?', c: ['3', '1', '2', '4'], a: '3', r: 'un- (not) + happy + -ness (a state): three meaningful parts.' },
  { d: 6, p: '"Brunch" (breakfast + lunch) was formed by', c: ['blending', 'clipping', 'compounding', 'borrowing'], a: 'blending', r: 'A blend fuses parts of two words; "ad" from "advertisement" is clipping.' },
  { d: 6, p: '"Laser" (light amplification by stimulated emission of radiation) is', c: ['an acronym', 'a blend', 'a back-formation', 'a loanword'], a: 'an acronym', r: 'An acronym is formed from initial letters and pronounced as a word.' },
  { d: 6.5, p: 'A morpheme that cannot stand alone as a word, such as "-ed", is', c: ['a bound morpheme', 'a free morpheme', 'a phoneme', 'a lexeme'], a: 'a bound morpheme', r: 'Bound morphemes attach to other morphemes; free morphemes like "cat" stand alone.' },
  { d: 6.5, p: 'Which pair of words is a minimal pair?', c: ['ship and sheep', 'ship and boat', 'ship and shipping', 'ship and ships'], a: 'ship and sheep', r: 'A minimal pair differs in exactly one sound, here the vowel.' },
  { d: 7, p: 'Which IPA symbol represents the first sound of "shoe"?', c: ['ʃ', 'θ', 'ʒ', 'ŋ'], a: 'ʃ', r: '/ʃ/ is the "sh" sound; /θ/ is "th" in "thin", /ʒ/ the middle of "measure", /ŋ/ the end of "sing".' },
  { d: 7, p: 'The sounds /p/, /b/ and /m/ are all made with both lips. Their place of articulation is', c: ['bilabial', 'alveolar', 'velar', 'labiodental'], a: 'bilabial', r: 'Bilabial sounds use both lips; /f/ and /v/ are labiodental.' },
  { d: 7, p: 'The difference between /t/ and /d/ is mainly', c: ['voicing', 'place of articulation', 'nasality', 'vowel length'], a: 'voicing', r: 'Both are alveolar stops; /d/ is voiced (vocal folds vibrate) and /t/ is voiceless.' },
  { d: 7, p: 'A grammar that describes how people actually speak, without judging it, is', c: ['descriptive', 'prescriptive', 'normative', 'generative'], a: 'descriptive', r: 'Linguists describe usage; prescriptive grammar states rules for "correct" usage.' },
  { d: 7.5, p: 'A contact language with no native speakers, used between groups who share no language, is', c: ['a pidgin', 'a creole', 'a dialect', 'a lingua franca of native speakers'], a: 'a pidgin', r: 'When a pidgin becomes children\'s first language it develops into a creole.' },
  { d: 7.5, p: 'Switching between two languages within one conversation is called', c: ['code-switching', 'borrowing', 'diglossia', 'calquing'], a: 'code-switching', r: 'Code-switching is alternating languages or varieties in discourse.' },
  { d: 7.5, p: 'English belongs to which language family?', c: ['Indo-European', 'Afro-Asiatic', 'Sino-Tibetan', 'Uralic'], a: 'Indo-European', r: 'English is a West Germanic language within Indo-European.' },
  { d: 8, p: 'The Great Vowel Shift changed the pronunciation of English long vowels during', c: ['the late Middle English and Early Modern English period', 'the Old English period before 900', 'the twentieth century', 'the Norman Conquest of 1066 alone'], a: 'the late Middle English and Early Modern English period', r: 'It ran roughly from the 1400s to the 1700s, which is why English spelling no longer matches its long vowels.' },
  { d: 8, p: 'The [pʰ] in "pin" and the [p] in "spin" are, in English,', c: ['allophones of one phoneme', 'two separate phonemes', 'a minimal pair', 'two morphemes'], a: 'allophones of one phoneme', r: 'English speakers hear them as one sound /p/; aspiration does not change meaning in English.' },
  { d: 8, p: 'The Norman Conquest of 1066 most strongly affected English by', c: ['adding a large French vocabulary', 'replacing English grammar with Latin grammar', 'introducing the Latin alphabet', 'ending the use of English in writing forever'], a: 'adding a large French vocabulary', r: 'Thousands of French words entered English, especially in law, government and food.' },
  { d: 8.5, p: 'The idea that the language we speak shapes how we think is usually called', c: ['the Sapir-Whorf hypothesis', 'the critical period hypothesis', 'universal grammar', 'the input hypothesis'], a: 'the Sapir-Whorf hypothesis', r: 'Also called linguistic relativity; its strong form is rejected, weaker forms are debated.' },
  { d: 8.5, p: 'The claim that there is an age window after which a first language is hard to acquire fully is', c: ['the critical period hypothesis', 'the Sapir-Whorf hypothesis', 'the interlanguage hypothesis', 'the affective filter hypothesis'], a: 'the critical period hypothesis', r: 'Associated with Lenneberg (1967); the affective filter is one of Krashen\'s hypotheses.' },
  { d: 8.5, p: 'Words like "here", "now" and "you", whose reference depends on the context of speaking, are examples of', c: ['deixis', 'polysemy', 'hyponymy', 'presupposition'], a: 'deixis', r: 'Deictic expressions point to the speaker, time or place of the utterance.' },
  { d: 9, p: '"The horse raced past the barn fell." Readers stumble on this sentence because it is', c: ['a garden-path sentence', 'ungrammatical', 'a run-on sentence', 'a sentence fragment'], a: 'a garden-path sentence', r: 'It is grammatical ("The horse [that was] raced past the barn fell") but leads the parser down the wrong analysis.' },
  { d: 9, p: 'A says "Did you finish the report?" and B replies "I finished the introduction." B implies the rest is not done. This inference is', c: ['a conversational implicature', 'an entailment', 'a presupposition', 'a performative'], a: 'a conversational implicature', r: 'Grice\'s maxim of quantity leads A to infer that B would have said more if more were done.' },
  { d: 9, p: 'Which of these is one of Grice\'s conversational maxims?', c: ['Quantity: be as informative as required, and no more', 'Politeness: always soften a request', 'Brevity: never use more than ten words', 'Certainty: never hedge a claim'], a: 'Quantity: be as informative as required, and no more', r: 'Grice\'s four maxims are quantity, quality, relation and manner.' },
  { d: 9, p: 'J. L. Austin called utterances such as "I promise to come" that perform an act in being said', c: ['performatives', 'constatives', 'implicatures', 'presuppositions'], a: 'performatives', r: 'In How to Do Things with Words (1962) Austin contrasted performatives with constatives (statements).' },
  { d: 9.5, p: 'William Labov\'s New York department-store study showed that pronouncing /r/ after vowels', c: ['varied with the social status of the store', 'was identical in every store', 'was found only among tourists', 'depended only on the speaker\'s age'], a: 'varied with the social status of the store', r: 'In the 1960s survey, staff in the most upscale store used post-vocalic /r/ most, a founding result of variationist sociolinguistics.' },
  { d: 9.5, p: 'A language that builds words by stringing together many distinct affixes, each with one meaning, as Turkish does, is', c: ['agglutinative', 'isolating', 'fusional', 'tonal'], a: 'agglutinative', r: 'Mandarin is largely isolating; Latin is fusional, packing several meanings into one ending.' },
  { d: 9.5, p: 'In an ergative-absolutive language such as Basque, the subject of an intransitive verb is marked like', c: ['the object of a transitive verb', 'the subject of a transitive verb', 'an indirect object', 'a possessor'], a: 'the object of a transitive verb', r: 'Ergative alignment groups intransitive subjects with transitive objects (absolutive case).' },
  { d: 10, p: 'Noam Chomsky\'s proposal of an innate, species-wide set of principles underlying all human languages is', c: ['universal grammar', 'construction grammar', 'systemic functional grammar', 'the input hypothesis'], a: 'universal grammar', r: 'Construction grammar and Halliday\'s systemic functional grammar reject or reframe the idea.' },
  { d: 10, p: 'In corpus linguistics, a concordance is', c: ['a list of every occurrence of a word shown in its surrounding context', 'a dictionary of word origins', 'a count of the speakers of a language', 'a rule of subject-verb agreement'], a: 'a list of every occurrence of a word shown in its surrounding context', r: 'Key-word-in-context (KWIC) concordances let researchers see how a word is actually used.' },
];

// ── the US grade each rule is first taught (standards check, 2026-10-24) ────
// The grammar, phonics and writing pools are shared with the ACT and the upper
// grades, and their difficulty numbers were set for those: "an indirect
// question" and "a comma after an opening clause" sat at difficulty 1, so a
// first-grader was asked them. Each entry now carries `g`, the first grade whose
// Common Core standard teaches its rule (CCSS ELA Language L.K-12.1-2, Reading
// Foundational Skills RF.K-3.3, Writing W.4-8, Reading Literature RL.4-8), and a
// school grade is served only entries with g at or below it (content/pool.js
// forSchool). Callers without a school grade (ACT, college) are unchanged.
// Matched in order against "<family frame> | <authored prompt> | <authored key>".
const SCHOOL_GRADES = {
  parts_of_speech: [
    [/which word is an adjective|in this sentence is an adjective/, 1], // L.1.1f
    [/which word is a conjunction|in this sentence is a conjunction/, 1], // L.1.1g
    [/preposition/, 1], // L.1.1i
    [/does the work of a verb/, 1], // L.1.1e
    [/which word is an adverb/, 2], // L.2.1e
    [/what is the subject/, 2], // L.2.1f
    [/replace the word/, 2], // L.2.1e
    [/what does the adverb modify/, 3], // L.3.1a
    [/object of the verb/, 5],
    [/whom/, 6], // L.6.1a
    [/nonessential clause|what does the clause do/, 6], // L.6.2a
    [/-ing form|Running uphill|infinitive|the phrase is/, 8], // L.8.1a verbals
  ],
  punctuation_basic: [
    // Two family labels do not say what they render: "(capitalization of a name
    // and a city)" is "Amara arrived in Valparaiso on Monday, tired but on time."
    // (a comma before a trailing phrase) and "(a possessive apostrophe)" is "The
    // inspectors brought three things: blueprints, tea, and patience." (a colon
    // before a list). Tagged by what they render.
    [/\(capitalization of a name and a city\)/, 6], // L.6.2a
    [/\(a possessive apostrophe\)/, 9], // L.9-10.2b
    [/a direct question|end of this question|mark that ends this sentence|Where did you put the keys|exclamation for a command|Stop the car now/, 1], // L.1.2b
    [/add the missing capital letter/, 1], // L.1.2a
    [/day and a city|name and a city|capital added|Monday for Denver/, 2], // L.2.2a geographic names
    [/possessive apostrophe/, 2], // L.2.2c
    [/quotation tag|Bring the ledger/, 4], // L.4.2b
    [/indirect question|whether the store|which sentence is punctuated correctly \|/, 5],
    [/needs no comma/, 5],
    [/colon|flaw: it costs|semicolon|second failed twice/, 9], // L.9-10.2a-b
  ],
  sentence_struct: [
    [/complete sentence|which sentence is complete/, 1], // L.1.1j
    [/fragment|run-on|comma splice/, 4], // L.4.1f
    [/join the two halves/, 4], // L.4.1a relative pronouns
    [/best combines/, 5],
    [/dangling|correctly constructed/, 7], // L.7.1c
  ],
  comma_use: [
    [/list of three|bread, cheese, and apples/, 1], // L.1.2c commas in a series
    [/conjunction joining two clauses|before the joining word|I called the office, but/, 4], // L.4.2c
    [/comma that does not belong/, 5],
    [/subordinate clause opening|comma after the opening word|After the storm passed|comma before its list/, 5], // L.5.2a-b
    [/appositive|a pilot|which we rented Friday|uses a comma correctly|frankly/, 6], // L.6.2a nonrestrictive and parenthetical
    [/heavy wool coat/, 7], // L.7.2a coordinate adjectives
  ],
  pronoun_case: [
    [/object pronoun|subject pronoun/, 1], // L.1.1d
    [/reflexive/, 2], // L.2.1c
    [/The _ brought _ own/, 3], // L.3.1f pronoun-antecedent agreement
    [/its and the possessive/, 4], // L.4.1g
    [/It was _ who|It was ___ who/, 9],
    [/went to _ and _|went to Dana|and I|bring _ own|bring ___ own|possessive for a singular noun|you spoke|No one on the crew|clear pronoun reference|Between _ and _/, 6], // L.6.1a, c, d
  ],
  word_choice: [
    [/their and theyre|going to need more time|than and then|heavier|its and its|whose and whos/, 4], // L.4.1g
    [/fewer|We had _ _ than|There was _ _ than/, 5],
    [/affect|will _ the _|no _ on the|no ___ on the/, 6],
    [/inferred/, 7],
    [/lay|Please _ the/, 8],
    [/complements/, 9],
  ],
  verb_tense: [
    [/to the market|to the depot|the same route|_ _ _ the results/, 1], // L.1.1e
    [/negate/, 2],
    [/after a modal/, 4], // L.4.1c
    [/time marker|will have worked|had finished|By the time|in Lisbon|same method for|keep the tense consistent|keeps tense consistent/, 5], // L.5.1b-d
    [/conditional|If I ___ more time|had been rebuilt/, 8], // L.8.1b-c
    [/reported speech/, 9],
  ],
  subject_verb: [
    [/The books ___ on the shelf|correct verb: The _ _ \||which subject takes a plural verb|which sentence is correct/, 1], // L.1.1c
    [/and his friends|_ and _ _|complete the sentence with the correct verb|agrees with the subject|fix the agreement error/, 3], // L.3.1f
    [/Neither/, 5], // L.5.1e correlative conjunctions
    [/Each of the|plural subject|divided on the proposal|committee|There ___ a dozen|list of approved|intervening phrase/, 6],
    [/along with|required for the degree/, 9],
  ],
  apostrophes: [
    [/the dog’s collar|\(one\)|^Which sentence is correct\? \| {2}\| $/, 2], // L.2.2c
    [/several dogs|more than one|children’s/, 3], // L.3.2d
    [/lost _ label|too late to change|Whose report/, 4], // L.4.1g
    [/jointly owned/, 9],
  ],
  transitions: [
    [/tents anyway|shows a contrast|an advantage, then a drawback|Sales rose in April/, 5], // W.5.1c
    [/shipment was delayed|a cause, then its effect|shows a result|forecast called for rain\. ___, we move|counted the _|adds an example|draws a conclusion/, 3], // W.3.1c
    [/alloy resists|Two trials|method is slow|concedes a point|drawback, then an outcome|second consequence/, 7], // W.7.1c
  ],
  modifiers: [
    [/list of participles/, 9], // parallel participles, L.9-10.1a
    [/misplaced|nearly every day|"only"|move the word|wrong noun|dangling/, 7], // L.7.1c
    [/parallel|complete and logical/, 9], // L.9-10.1a
  ],
  phonics: [
    [/vowel sound in a short word|same middle sound|put the sounds together|change the first sound|which letters are in the set/, 0], // RF.K.1d, RF.K.2d-e, RF.K.3b
    [/long vowel from a final e/, 1], // RF.1.3c
    [/which two letters make the sound|which letters work together|what the final e does|what an ending adds/, 1], // RF.1.3a, c, f
    [/what sound does r make|which type of syllable/, 2], // RF.2.3
    [/which letter is silent|what a prefix means/, 3], // RF.3.3a, d
    [/which word shares a root/, 4], // L.4.4b
  ],
};
const keyOf = (e) => [e.frame || '', typeof e.p === 'string' ? e.p : '', typeof e.a === 'string' ? e.a : ''].join(' | ');
/** Set `g` on every entry of a skill's pool from SCHOOL_GRADES; returns the entries left untagged. */
function tagSchoolGrades(skill, entries) {
  const rules = SCHOOL_GRADES[skill];
  if (!rules) return [];
  const missed = [];
  for (const e of entries) {
    if (Number.isFinite(e.g)) continue;
    const hit = rules.find(([re]) => re.test(keyOf(e)));
    if (hit) e.g = hit[1]; else missed.push(e);
  }
  return missed;
}

// The writing and literature pools by their own standards. Their difficulty was
// already near the grade for most entries; these are the ones it was not.
const LITERARY_GRADES = [
  [/setting of a story/, 1], // RL.K.3
  [/simile|alliteration|first-person|onomatopoeia|theme of a story|AABB/, 4], // L.4.5a, RL.4.2, 4.5, 4.6
  [/personification|hyperbole/, 5], // L.5.5a
  [/type of conflict/, 6],
  [/foreshadowing/, 7],
  [/dramatic irony|situational irony/, 8], // RL.8.6
];
const ACADEMIC_GRADES = [
  [/fact rather than an opinion|opinion rather than a fact|firsthand account|diary written by a soldier|list the books and websites/, 4], // RI.4.6, W.4.1, W.4.8
  [/thesis statement|peer-reviewed/, 6], // W.6.1a, W.6.8
  [/plagiarism|counterclaim|giving them credit/, 7], // W.7.8, W.7.1a
  [/fallacy|false dilemma|APA|MLA/, 9], // RI.9-10.8, W.9-10.8
  [/ethos/, 10], // RI.9-10.6
];
const byDifficulty = (d) => (d < 4.6 ? 4 : d < 5.1 ? 6 : d < 6 ? 9 : d < 6.6 ? 10 : d < 7 ? 12 : 13);
for (const [list, rules] of [[LITERARY, LITERARY_GRADES], [ACADEMIC, ACADEMIC_GRADES]]) {
  for (const e of list) {
    const hit = rules.find(([re]) => re.test(e.p));
    e.g = hit ? hit[1] : byDifficulty(e.d);
  }
}

const GENERATORS = {
  early_literacy: earlyLiteracy,
  early_comprehension: earlyComprehension,
  literary_analysis: fromPool(LITERARY, 'literary_analysis'),
  academic_writing: fromPool(ACADEMIC, 'academic_writing'),
  linguistics: fromPool(LINGUISTICS, 'linguistics'),
};

module.exports = {
  GENERATORS,
  POOLS: { early_literacy: PRINT, literary_analysis: LITERARY, academic_writing: ACADEMIC, linguistics: LINGUISTICS },
  DATA: { RHYMES, FIRST, SYLLABLES, PLACES, FEELINGS, ANIMALS, RELATIVES },
  SCHOOL_GRADES,
  tagSchoolGrades,
};
