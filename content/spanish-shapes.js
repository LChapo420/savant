/**
 * Spanish question shapes: the same grammar asked a different way.
 *
 * A conjugation generator produces fifty correct forms of one question, and a
 * learner meets all fifty without once being asked to *recognise* a form, spot an
 * error, or say which of two verbs a sentence needs. Those are different acts
 * from producing one, and they are the ones that survive contact with a page of
 * writing nobody chose for them.
 *
 * Every answer is still computed from the same conjugation tables the generators
 * use, so the bank stays verifiable end to end — `npm run check` holds every
 * item here to the same standard as every other, and
 * scripts/spanish-template-audit.js re-derives every key from its own tables.
 *
 * The lexicon is passed in by spanish-items.js rather than required back. The
 * two files need each other, and a require in both directions hands each a
 * half-built module: the tables would still be undefined at the point these
 * generators first run.
 *
 * Accepted alternatives go in `accepts`, which is what content/bank.js carries
 * to the grader. (They used to go in `x`, which bank.js drops.)
 */
const item = (o) => ({ source: 'bank', ...o });

/**
 * Who each conjugation slot is for. The fifth slot is ellos, ellas and ustedes:
 * it used to say "vosotros or ustedes", but vosotros has forms of its own
 * (habláis), so "vosotros hablan" was being taught as right.
 */
const SLOT_SUBJECT = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'ellos/ellas/ustedes'];
/** One pronoun per slot, for a prompt that shows a subject and a verb together. */
const SLOT_SPEAKER = ['yo', 'tú', 'ella', 'nosotros', 'ellos'];

/**
 * Sentences with one clear answer. Each has a twin that takes the same verb for
 * the same reason, so "complete both" shows the rule is a rule. Sentences where
 * the other verb is also Spanish with a different meaning ("sois cansados" is
 * "you are tiresome"; "el café es caliente" can be a general truth) are not here.
 */
const SER_ESTAR = [
  { s: 'Ella ___ profesora.', twin: 'Ella ___ médica.', a: 'es', verb: 'ser', why: 'a profession is part of who someone is, which takes ser' },
  { s: 'La ventana ___ rota.', twin: 'La ventana ___ sucia.', a: 'está', verb: 'estar', why: 'being broken is a condition, which takes estar' },
  { s: 'Nosotros ___ de Perú.', twin: 'Nosotros ___ de Chile.', a: 'somos', verb: 'ser', why: 'origin is part of who someone is, which takes ser' },
  { s: '¿Dónde ___ la biblioteca?', twin: '¿Dónde ___ el banco?', a: 'está', verb: 'estar', why: 'the location of a thing takes estar' },
  { s: 'La reunión ___ a las ocho.', twin: 'La fiesta ___ a las nueve.', a: 'es', verb: 'ser', why: 'the time of an event takes ser' },
  { s: 'Mis padres ___ en Madrid.', twin: 'Mis padres ___ en casa.', a: 'están', verb: 'estar', why: 'where someone is takes estar' },
  { s: 'Este libro ___ de mi hermana.', twin: 'Esta casa ___ de mis abuelos.', a: 'es', verb: 'ser', why: 'who something belongs to takes ser' },
  { s: 'Vosotros ___ en el parque.', twin: 'Vosotros ___ en la playa.', a: 'estáis', verb: 'estar', why: 'where someone is takes estar' },
];

/** The same person of the other verb: the mistake a learner actually makes. */
const OTHER_VERB = {
  es: 'está', está: 'es', somos: 'estamos', estamos: 'somos', son: 'están', están: 'son', sois: 'estáis', estáis: 'sois',
};

const TENSES = [
  { key: 'present', label: 'present' },
  { key: 'preterite', label: 'preterite' },
  { key: 'imperfect', label: 'imperfect' },
];

/**
 * Nouns left out of the food question because they could be argued either way:
 * salt, a plate (also "a dish"), and cocina (also "cuisine").
 */
const NOT_FOR_FOOD_QUESTIONS = ['sal', 'plato', 'cocina'];

const article = (noun, plural = false) => (plural
  ? (noun.g === 'm' ? 'los' : 'las')
  : (noun.g === 'm' ? 'el' : 'la'));
const genderWord = (noun) => (noun.g === 'm' ? 'masculine' : 'feminine');

const SHAPES = {
  // ── ser and estar ────────────────────────────────────────────────────────
  es_ser_estar(rng, d, ctx, lex) {
    const roll = rng.int(0, 3);
    const pick = rng.pick(SER_ESTAR);
    const right = pick.a;
    const wrong = OTHER_VERB[right];
    const otherVerb = pick.verb === 'ser' ? 'estar' : 'ser';

    if (roll === 0) {
      // Spot the error: someone has written the wrong one, and the task is
      // seeing it rather than producing it.
      return item({
        format: 'multiple_choice',
        prompt: `Which word is wrong: "${pick.s.replace('___', wrong)}"?`,
        choices: rng.shuffle([wrong, right, 'Both are correct', 'Neither is correct']),
        answer: wrong,
        rationale: `"${pick.s.replace('___', right)}" is right, because ${pick.why}.`,
      });
    }

    if (roll === 1) {
      // Say why, which is the transferable half and the one that survives when
      // the exact sentence does not. The question names both verbs, so "because
      // the subject is plural" (which decides the form, not the verb) is wrong.
      return item({
        format: 'multiple_choice',
        prompt: `"${pick.s.replace('___', right)}" — why ${pick.verb} and not ${otherVerb}?`,
        choices: rng.shuffle([pick.why, 'because it is a question',
          'because the subject is plural', 'because the sentence is negative', 'There is no reason']),
        answer: pick.why,
        rationale: `That is the rule this sentence is testing: ${pick.why}.`,
      });
    }

    if (roll === 2) {
      // Change one thing and the verb stays, which is what shows the rule is a
      // rule. Every sentence has its own twin; swapping words in place left half
      // of them unchanged and asked the same sentence twice.
      return item({
        format: 'multiple_choice',
        prompt: `Complete both: "${pick.s}" and "${pick.twin}"`,
        choices: rng.shuffle([right, wrong, 'Either one', 'Neither one']),
        answer: right,
        rationale: `Both take ${right}: ${pick.why}.`,
      });
    }

    const others = ['es', 'está', 'son', 'están', 'somos', 'estamos', 'sois', 'estáis']
      .filter((w) => w !== right && w !== wrong);
    return item({
      format: 'multiple_choice',
      prompt: `Choose the correct verb: ${pick.s}`,
      choices: rng.shuffle([right, wrong, ...rng.sample(others, 2)]),
      answer: right,
      rationale: `${right} is right because ${pick.why}.`,
    });
  },

  // ── core vocabulary ──────────────────────────────────────────────────────
  es_vocab_core(rng, d, ctx, lex) {
    const { NOUNS } = lex;

    const roll = rng.int(0, 3);
    const noun = rng.pick(NOUNS);
    const others = rng.sample(NOUNS.filter((n) => n.es !== noun.es), 3);

    if (roll === 0) {
      // Spanish into English rather than English into Spanish, which is a
      // different retrieval path and the one reading actually needs.
      return item({
        format: 'multiple_choice',
        prompt: `What does "${noun.es}" mean?`,
        choices: rng.shuffle([noun.en, ...others.map((o) => o.en)]),
        answer: noun.en,
        rationale: `"${noun.es}" means ${noun.en}.`,
      });
    }

    if (roll === 1) {
      // Which one is not a real Spanish word: three real nouns and one invented
      // one, so the test is knowing the vocabulary rather than spotting a shape.
      const real = rng.sample(NOUNS, 3);
      return item({
        format: 'multiple_choice',
        prompt: 'Which of these is not a Spanish word?',
        choices: rng.shuffle([...real.map((r) => r.es), 'xiloflore']),
        answer: 'xiloflore',
        rationale: `The other three are ordinary Spanish nouns: ${real.map((r) => `${r.es} (${r.en})`).join(', ')}.`,
      });
    }

    if (roll === 2) {
      // The odd one out, with the category named. It used to be "which does not
      // belong", keyed to "zapata" as "not a word from this course" — but zapata
      // is a Spanish word, and "belong" named no category to belong to.
      const foods = NOUNS.filter((n) => n.food && !NOT_FOR_FOOD_QUESTIONS.includes(n.es));
      const odd = rng.pick(NOUNS.filter((n) => !n.food && !NOT_FOR_FOOD_QUESTIONS.includes(n.es)));
      const three = rng.sample(foods, 3);
      return item({
        format: 'multiple_choice',
        prompt: 'Which of these is not something you eat or drink?',
        choices: rng.shuffle([odd.es, ...three.map((f) => f.es)]),
        answer: odd.es,
        rationale: `"${odd.es}" means ${odd.en}; the others are ${three.map((f) => `${f.es} (${f.en})`).join(', ')}.`,
      });
    }

    // The Spanish word is shown. It used to be left out, so the learner was given
    // a row of blanks and a gender and asked to guess one of sixty nouns.
    const blanked = noun.en.replace(/./g, '_');
    return item({
      format: 'type_in',
      prompt: `"${noun.es}" means "${blanked}" in English. Fill in the English word.`,
      answer: noun.en,
      rationale: `"${noun.es}" means ${noun.en}.`,
    });
  },

  // ── gender and articles ──────────────────────────────────────────────────
  es_gender(rng, d, ctx, lex) {
    const { NOUNS } = lex;

    const roll = rng.int(0, 3);
    // Drawn from the same lexicon the generators use, so every option is a real
    // Spanish noun and only the article is in question.
    const noun = rng.pick(NOUNS);
    const right = `${article(noun)} ${noun.es}`;
    const wrong = `${noun.g === 'm' ? 'la' : 'el'} ${noun.es}`;

    if (roll === 0) {
      // One wrong pairing among four nouns. It used to offer one noun with all
      // four articles, where "los libro" and "las libro" were wrong too.
      const rest = rng.sample(NOUNS.filter((n) => n.es !== noun.es), 3).map((n) => `${article(n)} ${n.es}`);
      return item({
        format: 'multiple_choice',
        prompt: 'Which of these has the wrong article?',
        choices: rng.shuffle([wrong, ...rest]),
        answer: wrong,
        rationale: `"${right}" is right, because "${noun.es}" is ${genderWord(noun)}. The others are correct.`,
      });
    }

    if (roll === 1) {
      // Four definite articles. "un" used to be among them, and "un libro" is
      // as right as "el libro".
      return item({
        format: 'multiple_choice',
        prompt: `Which article goes with "${noun.es}"?`,
        choices: rng.shuffle(['el', 'la', 'los', 'las']),
        answer: article(noun),
        rationale: `"${noun.es}" is ${genderWord(noun)} and singular, so it takes "${article(noun)}".`,
      });
    }

    if (roll === 2) {
      // The article alone. Asked as "the noun with its article", the grader read
      // a leading "el" as the optional pronoun "él" and accepted the bare noun,
      // and "un libro" (also a correct article) was marked wrong.
      return item({
        format: 'type_in',
        prompt: `Type the definite article for "${noun.es}": el or la?`,
        answer: article(noun),
        rationale: `"${right}" is right, because "${noun.es}" is ${genderWord(noun)}.`,
      });
    }

    const articles = rng.shuffle([right, wrong,
      `${noun.g === 'm' ? 'los' : 'las'} ${noun.es}`,
      `${noun.g === 'm' ? 'las' : 'los'} ${noun.es}`]);
    return item({
      format: 'multiple_choice',
      prompt: 'Which is correct?',
      choices: articles,
      answer: right,
      rationale: `"${right}" is right, because "${noun.es}" is ${genderWord(noun)} and singular.`,
    });
  },

  // ── adjective agreement ───────────────────────────────────────────────────
  es_adjectives(rng, d, ctx, lex) {
    const { NOUNS, ADJECTIVES, adjectiveFits, pluralize } = lex;

    const roll = rng.int(0, 3);
    // The spot-the-error and fix-it questions need an adjective whose ending
    // changes: "la mesa grande" has nothing to spot.
    const pool = roll === 3 ? ADJECTIVES : ADJECTIVES.filter((a) => a.m !== a.f);
    const adj = rng.pick(pool);
    const noun = rng.pick(NOUNS.filter((n) => adjectiveFits(adj, n)));
    const plural = rng.bool();
    const gender = noun.g;
    const number = (w) => (plural ? pluralize(w) : w);
    const right = number(gender === 'm' ? adj.m : adj.f);
    const wrongForm = number(gender === 'm' ? adj.f : adj.m);
    // The noun is shown in the same number as the adjective. It used to stay
    // singular, so "libro blancos" was offered as agreeing.
    const phrase = `${article(noun, plural)} ${plural ? noun.pl : noun.es}`;
    const described = `${genderWord(noun)}${plural ? ' and plural' : ''}`;

    if (roll === 0) {
      // Spot the agreement error, which is the thing learners are actually
      // hunting for when they proofread their own writing.
      return item({
        format: 'multiple_choice',
        prompt: `Which word is wrong in "${phrase} ${wrongForm}"?`,
        choices: rng.shuffle([wrongForm, article(noun, plural), plural ? noun.pl : noun.es, 'None of them']),
        answer: wrongForm,
        rationale: `"${phrase} ${right}" agrees with the noun, which is ${described}.`,
      });
    }

    if (roll === 1) {
      // Two nouns, one adjective. A masculine and a feminine noun described
      // together take the masculine plural. (This used to ask which single form
      // "agrees with both" and key "Neither", which was also wrong for grande.)
      const fits = NOUNS.filter((n) => adjectiveFits(adj, n));
      const m = rng.pick(fits.filter((n) => n.g === 'm'));
      const f = rng.pick(fits.filter((n) => n.g === 'f'));
      return item({
        format: 'multiple_choice',
        prompt: `Choose the form of "${adj.m}" (${adj.en}) that describes both: el ${m.es} y la ${f.es} ___`,
        choices: rng.shuffle([pluralize(adj.m), pluralize(adj.f), adj.m, adj.f]),
        answer: pluralize(adj.m),
        rationale: `An adjective describing a masculine and a feminine noun together is masculine plural: el ${m.es} y la ${f.es} ${pluralize(adj.m)}.`,
      });
    }

    if (roll === 2) {
      return item({
        format: 'type_in',
        prompt: `Fix the adjective so it agrees: "${phrase} ${wrongForm}". Type the corrected adjective.`,
        answer: right,
        rationale: `"${plural ? noun.pl : noun.es}" is ${described}, so it is "${right}".`,
      });
    }

    // Some adjectives (grande, interesante) have one form for both genders, so
    // the endings on offer collapse to two. The rest of the options are other
    // adjectives in a form that does not agree, so none of them is also right.
    const options = [...new Set([right, wrongForm, number(adj.m), number(adj.f),
      plural ? (gender === 'm' ? adj.m : adj.f) : pluralize(gender === 'm' ? adj.m : adj.f)])];
    const fillers = rng.shuffle(ADJECTIVES.filter((a) => a.m !== adj.m && a.m !== a.f));
    for (const other of fillers) {
      if (options.length >= 4) break;
      const alt = number(gender === 'm' ? other.f : other.m);
      if (!options.includes(alt)) options.push(alt);
    }
    return item({
      format: 'multiple_choice',
      prompt: `Complete with the right form of "${adj.m}" (${adj.en}): "${phrase} ___"`,
      choices: rng.shuffle(options.slice(0, 4)),
      answer: right,
      rationale: `The noun is ${described}, so it takes "${right}".`,
    });
  },

  // ── conjugations, asked in four different ways ────────────────────────────
  es_present_ar(rng, d, ctx, lex) { return conjugateShape(rng, d, (v) => v.inf.endsWith('ar'), 'present', lex); },
  es_present_erir(rng, d, ctx, lex) { return conjugateShape(rng, d, (v) => !v.inf.endsWith('ar'), 'present', lex); },
  es_preterite(rng, d, ctx, lex) { return conjugateShape(rng, d, () => true, 'preterite', lex); },
  es_imperfect(rng, d, ctx, lex) { return conjugateShape(rng, d, () => true, 'imperfect', lex); },

  es_questions(rng, d, ctx, lex) {
    const { NOUNS, VERBS, conjugate } = lex;

    const roll = rng.int(0, 3);

    if (roll === 0) {
      // Negation, which is a word placed before the verb, not anywhere. The key
      // keeps the pronoun: "no hablo" is also right, so it is not on offer.
      const verb = rng.pick(VERBS);
      const form = conjugate(verb.inf, 'present', 0);
      return item({
        format: 'multiple_choice',
        prompt: `Which is the negative of "yo ${form}"?`,
        choices: rng.shuffle([`yo no ${form}`, `no yo ${form}`, `yo ${form} no`, `yo ${form} nada`]),
        answer: `yo no ${form}`,
        rationale: `No goes directly in front of the verb: yo no ${form}. The pronoun can also be dropped: no ${form}.`,
      });
    }

    if (roll === 1) {
      // Turn a statement into a question, which changes the punctuation and is
      // the thing beginners get wrong most often.
      return item({
        format: 'multiple_choice',
        prompt: 'Make this a question: "El café está caliente."',
        choices: rng.shuffle(['¿El café está caliente?', 'El café está caliente?',
          '¿El café está caliente.', '¿El café está caliente!']),
        answer: '¿El café está caliente?',
        rationale: 'A question opens with an inverted mark and closes with one.',
      });
    }

    if (roll === 2) {
      return item({
        format: 'multiple_choice',
        prompt: 'Which asks "Where is the library?"',
        choices: rng.shuffle(['¿Dónde está la biblioteca?', '¿Qué es la biblioteca?',
          '¿Cuánto está la biblioteca?', '¿Quién está la biblioteca?']),
        answer: '¿Dónde está la biblioteca?',
        rationale: '"Dónde" asks about a place.',
      });
    }

    // A negative sentence to write. It used to key "Aquí no está la" — no noun,
    // and an article picked by whether the noun began with an l.
    const MOVABLE = NOUNS.filter((n) => n.k === 'obj' && !['casa', 'puerta', 'ventana', 'tren'].includes(n.es));
    const noun = rng.pick(MOVABLE);
    const the = `${article(noun)} ${noun.es}`;
    const The = the.charAt(0).toUpperCase() + the.slice(1);
    return item({
      format: 'type_in',
      prompt: `Translate into Spanish: "The ${noun.en} is not here."`,
      answer: `${The} no está aquí`,
      accepts: [`No está aquí ${the}`, `Aquí no está ${the}`, `${The} no está acá`, `No está acá ${the}`],
      rationale: `"No" goes directly in front of the verb, and where a thing is takes estar: ${the} no está aquí.`,
    });
  },

  es_numbers(rng, d, ctx, lex) {
    const { numToSpanish } = lex;

    const roll = rng.int(0, 2);
    const n = rng.int(11, 99);

    if (roll === 0) {
      // Which is largest, read as words rather than digits: three different
      // numbers. (Nudging a repeat upward used to reach 101, which has no word in
      // the table and printed "undefined y uno".)
      const range = Array.from({ length: 89 }, (_, i) => i + 11);
      const three = rng.sample(range, 3);
      const top = Math.max(...three);
      return item({
        format: 'multiple_choice',
        prompt: `Which is largest: ${three.map(numToSpanish).join(', ').replace(/, ([^,]*)$/, ', or $1')}?`,
        choices: rng.shuffle(three.map(numToSpanish)),
        answer: numToSpanish(top),
        rationale: `The largest of those is ${top} (${numToSpanish(top)}).`,
      });
    }

    if (roll === 1) {
      // How many, which is a different act from naming one.
      return item({
        format: 'type_in',
        prompt: `How many is ${numToSpanish(n)}? Give the number in digits.`,
        answer: String(n),
        rationale: `${numToSpanish(n)} is ${n}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `Write ${n} in Spanish.`,
      answer: numToSpanish(n),
      rationale: `${n} is "${numToSpanish(n)}".`,
    });
  },

  // Named for the skill it belongs to. It was "es_object_pronouns", which is no
  // skill, so none of these was ever served — and three of the four were wrong.
  es_object_pron(rng, d, ctx, lex) {
    const { NOUNS } = lex;

    const roll = rng.int(0, 3);
    const things = NOUNS.filter((n) => n.k === 'obj');
    const noun = rng.pick(things);
    const the = `${article(noun)} ${noun.es}`;
    const right = noun.g === 'm' ? 'Lo' : 'La';
    const wrong = noun.g === 'm' ? 'La' : 'Lo';

    if (roll === 0) {
      // Spot the error, which is how a learner meets this rule in real writing.
      return item({
        format: 'multiple_choice',
        prompt: `Someone rewrote "Veo ${the}." as "${wrong} veo." Which word is wrong?`,
        choices: rng.shuffle([wrong, 'veo', 'Nothing is wrong']),
        answer: wrong,
        rationale: `"${the}" is ${genderWord(noun)} singular, so the pronoun is ${right.toLowerCase()}: ${right} veo.`,
      });
    }

    if (roll === 1) {
      // After a preposition, which is where the rules actually differ.
      const who = rng.pick([
        { en: 'with her', key: 'ella', choices: ['ella', 'la', 'lo', 'le'] },
        { en: 'with him', key: 'él', choices: ['él', 'lo', 'le', 'la'] },
        { en: 'with them', key: 'ellos', choices: ['ellos', 'los', 'les', 'las'] },
      ]);
      return item({
        format: 'multiple_choice',
        prompt: `Complete: "Hablo con ___" (${who.en}).`,
        choices: rng.shuffle(who.choices),
        answer: who.key,
        rationale: `After a preposition Spanish uses the full pronoun, not lo, la or le: con ${who.key}.`,
      });
    }

    if (roll === 2) {
      // A woman as the direct object. (A man would not do: "le veo" for "lo veo"
      // is accepted in Spain, so the question would have two right answers.)
      const name = rng.pick(['Ana', 'María', 'Lucía', 'Elena', 'Rosa']);
      return item({
        format: 'multiple_choice',
        prompt: `In "Veo a ${name}", which pronoun replaces "a ${name}"?`,
        choices: rng.shuffle(['la', 'le', 'lo', 'les']),
        answer: 'la',
        rationale: `${name} is the direct object, and a direct object that is a woman is "la": la veo.`,
      });
    }

    // A thing, not a person: "le" is never the direct object for a thing, in any
    // region, so this has one answer where "which pronoun means him" had two.
    return item({
      format: 'multiple_choice',
      prompt: `Which direct object pronoun replaces "${the}" in "Compro ${the}"?`,
      choices: rng.shuffle(['lo', 'la', 'le', 'los']),
      answer: right.toLowerCase(),
      rationale: `"${the}" is ${genderWord(noun)} singular, so it is ${right.toLowerCase()}: ${right.toLowerCase()} compro.`,
    });
  },
};

/**
 * The four ways a conjugation can be asked, which is four questions rather than
 * one with fifty answers.
 *
 * They share the tables rather than re-deriving anything, so a form is computed
 * the same way whichever way it is asked — and the distractor in the error
 * question is a real form of the same verb, not a made-up string.
 */
function conjugateShape(rng, d, filter, tense, lex) {
  const { VERBS, conjugate, endingOf, spellingChanged, accentTwin } = lex;
  const roll = rng.int(0, 3);
  const verb = rng.pick(VERBS.filter(filter));
  const formOf = (s) => conjugate(verb.inf, tense, s);
  // Slots whose form no other slot shares: in the imperfect "hablaba" is both yo
  // and él, so asking which subject it belongs to has two answers.
  const unshared = [0, 1, 2, 3, 4].filter((s) => [0, 1, 2, 3, 4].every((o) => o === s || formOf(o) !== formOf(s)));
  const slot = roll === 2 ? rng.pick(unshared) : rng.int(0, 4);
  const answer = formOf(slot);
  const label = TENSES.find((t) => t.key === tense) ? tense : tense;

  if (roll === 0) {
    // Spot the error among four subject-and-verb pairs, three of them right. A
    // single pair ("yo hablas") had two answers: the verb is wrong for yo, or the
    // pronoun is wrong for hablas.
    const correct = rng.sample([0, 1, 2, 3, 4].filter((s) => s !== slot), 3)
      .map((s) => `${SLOT_SPEAKER[s]} ${formOf(s)}`);
    const wrongSlot = rng.pick([0, 1, 2, 3, 4].filter((s) => formOf(s) !== answer));
    const wrong = `${SLOT_SPEAKER[slot]} ${formOf(wrongSlot)}`;
    return item({
      format: 'multiple_choice',
      prompt: `Which of these is wrong (${label} of ${verb.inf})?`,
      choices: rng.shuffle([wrong, ...correct]),
      answer: wrong,
      rationale: `With "${SLOT_SPEAKER[slot]}" the ${label} form is "${answer}", not "${formOf(wrongSlot)}".`,
    });
  }

  if (roll === 1) {
    // Name the ending, which is the transferable part.
    const ending = endingOf(verb.inf, tense, slot);
    const full = spellingChanged(verb.inf, tense, slot)
      ? `The full form is "${answer}" (the stem changes spelling before an e), so the ending is "${ending}".`
      : `The full form is "${answer}", so the ending is "${ending}".`;
    // "-ó" typed without its accent is "-o", another ending of the same verb,
    // and the grader forgives accents. Those endings are asked as a choice.
    const twin = accentTwin(verb.inf, answer);
    if (twin) {
      const endings = [...new Set([0, 1, 2, 3, 4].map((s) => endingOf(verb.inf, tense, s)))];
      const twinEnding = twin.slice(answer.length - ending.length);
      const rest = endings.filter((e) => e !== ending && e !== twinEnding);
      return item({
        format: 'multiple_choice',
        prompt: `The ${label} of ${verb.inf} (${verb.en}) for "${SLOT_SUBJECT[slot]}" ends in:`,
        choices: rng.shuffle([ending, twinEnding, ...rng.sample(rest, 2)]),
        answer: ending,
        rationale: full,
      });
    }
    return item({
      format: 'type_in',
      prompt: `The ${label} of ${verb.inf} (${verb.en}) for "${SLOT_SUBJECT[slot]}" ends in:`,
      answer: ending,
      rationale: full,
    });
  }

  if (roll === 2) {
    // Which subject goes with this form, which is recognition run backwards.
    const subject = SLOT_SUBJECT[slot];
    return item({
      format: 'multiple_choice',
      prompt: `Which subject goes with "${answer}" (${label} of ${verb.inf})?`,
      choices: rng.shuffle([subject,
        ...rng.sample(SLOT_SUBJECT.filter((s) => s !== subject), 3)]),
      answer: subject,
      rationale: `"${answer}" is the form that goes with "${subject}".`,
    });
  }

  const others = [...new Set([0, 1, 2, 3, 4].map(formOf))].filter((f) => f !== answer);
  return item({
    format: 'multiple_choice',
    prompt: `Complete with the ${label} of ${verb.inf} (${verb.en}):\n${SLOT_SPEAKER[slot]} ___`,
    choices: rng.shuffle([answer, ...rng.sample(others, 3)]),
    answer,
    rationale: `${verb.inf} is a regular verb, so the stem plus the ${label} ending for "${SLOT_SPEAKER[slot]}" gives "${answer}".`,
  });
}

module.exports = SHAPES;
