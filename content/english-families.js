/**
 * English item families: one rule per family, hundreds of sentences each.
 *
 * The authored pools in english-items.js are good questions but there are only
 * six or eight per skill, so a learner meets all of them in one sitting. These
 * families test exactly the same rules at the same difficulties, with the
 * sentence built from the word banks in content/vocab.js.
 *
 * Two rules when adding one:
 *
 *   The rule lives in the template, never in a slot. If a slot value could change
 *   which answer is correct, it does not belong in that slot. That is why the
 *   plural-noun bank is separate from the singular one and the mass-noun one.
 *
 *   Distractors are built, not listed. A "which sentence is punctuated correctly"
 *   family corrupts its own correct sentence in three named ways, so every
 *   rendering has exactly one right answer and three that are wrong for a reason
 *   a learner can be told.
 */
const V = require('./vocab');
const { spread } = require('./pool');

/** Lowercase the first character — a capitalization error, built not written. */
const decap = (s) => s.charAt(0).toLowerCase() + s.slice(1);
/** Swap the final punctuation mark. */
const endWith = (s, mark) => s.replace(/[.?!]$/, '') + mark;
const lower = (s) => s.toLowerCase();
/**
 * A time phrase moved into the middle of a sentence. Only its first letter
 * drops: "Every Tuesday" becomes "every Tuesday", never "every tuesday".
 */
const midSentence = decap;

/** A slot drawn from `bank`, never equal to the slots already filled under `taken`. */
const other = (bank, ...taken) => (rng, out) => rng.pick(bank.filter((v) => !taken.some((t) => out[t] === v)));
const pick = (bank, keep) => bank.filter((v) => keep.includes(v.base || v));
/** A name that takes a plain apostrophe-s: "Marcus" has a second accepted spelling. */
const NAMES_NO_S = V.NAMES.filter((n) => !/s$/.test(n));
/** "The route is shorter, but it has one flaw: it closes in winter." */
const colonFlaw = (trade) => {
  const plural = /^they\b/.test(trade.bad);
  return `${trade.good}, but ${plural ? 'they have' : 'it has'} one flaw: ${trade.bad}.`;
};
/** Verbs whose -ing form names a duty: "the job involves inspecting", not "arriving". */
const JOB_VERBS = pick(V.VERBS, ['call', 'repair', 'deliver', 'report', 'inspect', 'answer', 'clean', 'label']);

const FAMILIES = {
  // ── parts of speech ──────────────────────────────────────────────────────
  parts_of_speech: [
    {
      d: 1,
      slots: { adj: V.ADJECTIVES_THING, noun: V.NOUNS_SINGULAR, name: V.NAMES },
      p: (s) => `In "The ${s.adj} ${s.noun} surprised ${s.name}," which word is an adjective?`,
      c: (s) => [s.adj, s.noun, 'surprised', s.name],
      a: (s) => s.adj,
      r: (s) => `An adjective describes a noun. "${s.adj}" describes the ${s.noun}.`,
    },
    {
      d: 2,
      slots: { adv: V.ADVERBS, name: V.NAMES, verb: V.VERBS_INTRANSITIVE },
      p: (s) => `In "${s.name} ${s.verb.past} ${s.adv} at the counter," which word is an adverb?`,
      c: (s) => [s.adv, s.verb.past, 'counter', 'the'],
      a: (s) => s.adv,
      r: (s) => `An adverb modifies a verb; "${s.adv}" tells how ${s.name} ${s.verb.past}.`,
    },
    {
      d: 2,
      // A person, so the verb is something the subject can do: "the ladder on the
      // shelf answered" was a sentence this used to produce.
      slots: { noun: V.ROLES_SINGULAR, prep: V.PLACES_PREP_PERSON, verb: V.VERBS_INTRANSITIVE },
      p: (s) => `In "The ${s.noun} ${s.prep} ${s.verb.past}," what is the subject?`,
      c: (s) => [s.noun, s.prep.split(' ').pop(), s.verb.past, s.prep.split(' ')[0]],
      a: (s) => s.noun,
      r: (s) => `The subject is who or what performs the verb. The ${s.noun} ${s.verb.past};`
        + ` "${s.prep}" only locates the ${s.noun}.`,
    },
    {
      d: 3,
      slots: { pair: V.NAME_PAIRS, verb: V.VERBS_TRANSITIVE },
      p: (s) => `In "${s.pair[0]} and ${s.pair[1]} ${s.verb.past} ${s.verb.obj}," which word is a conjunction?`,
      c: (s) => ['and', s.verb.past, s.pair[1], s.verb.obj.split(' ').pop()],
      a: () => 'and',
      r: (s) => `A conjunction joins words or groups of words; "and" joins ${s.pair[0]} and ${s.pair[1]}.`,
    },
    {
      d: 4,
      slots: { verb: pick(V.VERBS_INTRANSITIVE, ['wait', 'work', 'study', 'practice']), name: V.NAMES },
      p: (s) => `In "${s.verb.ing.charAt(0).toUpperCase() + s.verb.ing.slice(1)} all day exhausted ${s.name},"`
        + ` what part of speech is "${s.verb.ing}"?`,
      c: () => ['gerund (noun form of a verb)', 'main verb', 'adjective', 'preposition'],
      a: () => 'gerund (noun form of a verb)',
      r: (s) => `"${s.verb.ing}" is the subject of the sentence, so the -ing form is working as a noun: a gerund.`,
    },
    {
      d: 5,
      slots: { noun: V.NOUNS_SINGULAR, day: V.DAYS },
      p: (s) => `In "The ${s.noun}, which arrived ${s.day}, was unsigned," what does "which arrived ${s.day}" do?`,
      c: (s) => [`modifies "${s.noun}" as a nonessential clause`, 'serves as the main clause',
        'acts as the sentence’s verb', 'modifies "unsigned"'],
      a: (s) => `modifies "${s.noun}" as a nonessential clause`,
      r: (s) => `It is a relative clause adding nonessential information about the ${s.noun},`
        + ' which is why it takes commas.',
    },
    {
      d: 7,
      slots: { verb: pick(V.VERBS, ['arrive', 'finish', 'deliver', 'call', 'report', 'answer']) },
      p: (s) => `In "To ${s.verb.base} early would surprise everyone," the phrase "To ${s.verb.base} early" is`,
      c: () => ['an infinitive phrase acting as the subject', 'a prepositional phrase',
        'the main verb', 'an adverbial clause'],
      a: () => 'an infinitive phrase acting as the subject',
      r: (s) => `"To ${s.verb.base} early" is what would surprise everyone, so the infinitive phrase is the subject.`,
    },
  ],

  // ── subject-verb agreement ───────────────────────────────────────────────
  subject_verb: [
    {
      d: 1,
      slots: { noun: V.NOUNS_PLURAL, where: V.PLACES_PREP },
      p: (s) => `Choose the correct verb: The ${s.noun} ___ ${s.where}.`,
      c: () => ['are', 'is', 'was', 'has been'],
      a: () => 'are',
      r: (s) => `The plural subject "${s.noun}" takes the plural verb "are."`,
    },
    {
      d: 2,
      slots: { pair: V.NAME_PAIRS, verb: V.VERBS_TRANSITIVE, when: V.TIME_PRESENT },
      p: (s) => `Choose the correct verb: ${s.pair[0]} and ${s.pair[1]} ___ ${s.verb.obj} ${midSentence(s.when)}.`,
      c: (s) => [s.verb.base, s.verb.s, `is ${s.verb.ing}`, `has ${s.verb.pp}`],
      a: (s) => s.verb.base,
      r: () => 'Two subjects joined by "and" form a plural subject, so the verb takes its plural form.',
    },
    {
      d: 4,
      slots: { role: V.ROLES_PLURAL, verb: V.VERBS_TRANSITIVE },
      p: (s) => `Choose the correct verb: Each of the ${s.role} ___ ${s.verb.obj}.`,
      c: (s) => [s.verb.s, s.verb.base, `have ${s.verb.pp}`, `were ${s.verb.ing}`],
      a: (s) => s.verb.s,
      r: (s) => `"Each" is singular; "of the ${s.role}" is a prepositional phrase and does not change the subject.`,
    },
    {
      d: 5,
      slots: { one: V.ROLES_SINGULAR, many: V.ROLES_PLURAL, verb: V.VERBS_TRANSITIVE },
      p: (s) => `Choose the correct verb: Neither the ${s.one} nor the ${s.many} ___ ${s.verb.obj}.`,
      c: (s) => [s.verb.base, s.verb.s, `has ${s.verb.pp}`, `is ${s.verb.ing}`],
      a: (s) => s.verb.base,
      r: (s) => `With "neither ... nor," the verb agrees with the nearer subject, and "${s.many}" is plural.`,
    },
    {
      d: 5,
      slots: { group: V.NOUNS_COLLECTIVE },
      p: (s) => `Choose the correct verb: The ${s.group} ___ divided on the proposal.`,
      c: () => ['is', 'are', 'were', 'have been'],
      a: () => 'is',
      r: (s) => `In American usage a collective noun like "${s.group}" is treated as singular.`,
    },
    {
      d: 7,
      slots: { role: V.ROLES_PLURAL, when: ['quarterly', 'every Friday', 'each month', 'twice a year'] },
      p: (s) => `Choose the correct verb: The list of approved ${s.role} ___ posted ${s.when}.`,
      c: () => ['is', 'are', 'have been', 'were'],
      a: () => 'is',
      r: (s) => `The subject is "list," not "${s.role}," so the verb is singular.`,
    },
    {
      d: 8,
      slots: {
        subject: ['Mathematics', 'Physics', 'Statistics', 'Economics'],
        aside: ['along with chemistry', 'together with biology', 'as well as geology'],
      },
      p: (s) => `Choose the correct verb: ${s.subject}, ${s.aside}, ___ required for the degree.`,
      c: () => ['is', 'are', 'were', 'have been'],
      a: () => 'is',
      r: (s) => `"${s.aside}" is an interrupting phrase; the singular subject "${lower(s.subject)}" governs the verb.`,
    },
  ],

  // ── punctuation ──────────────────────────────────────────────────────────
  // Each family writes one correct sentence and corrupts it three ways, so every
  // rendering has exactly one defensible answer.
  punctuation_basic: [
    {
      d: 1,
      slots: { noun: V.NOUNS_PLURAL, where: V.PLACES_PREP },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => {
        const right = `Where did you put the ${s.noun}?`;
        return [right, endWith(right, '.'), decap(right), endWith(right, '!?')];
      },
      a: (s) => `Where did you put the ${s.noun}?`,
      r: () => 'A direct question takes a question mark, and the first word is capitalized.',
    },
    {
      d: 2,
      slots: { day: V.DAYS, city: V.CITIES },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => {
        const right = `We left on ${s.day} for ${s.city}.`;
        return [right, right.replace(s.day, lower(s.day)), decap(right.replace(s.city, lower(s.city))),
          endWith(right, '')];
      },
      a: (s) => `We left on ${s.day} for ${s.city}.`,
      r: (s) => `Days and city names are proper nouns and need capitals, so "${s.day}" and "${s.city}"`
        + ' stay capitalized; the statement ends with a period.',
    },
    {
      d: 3,
      slots: { thing: ['car', 'press', 'line', 'drill', 'engine', 'mixer', 'saw'] },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => {
        const right = `Stop the ${s.thing} now!`;
        return [right, endWith(right, '?'), decap(right), endWith(right, '')];
      },
      a: (s) => `Stop the ${s.thing} now!`,
      r: () => 'An urgent command takes an exclamation point and a capital at the start.',
    },
    {
      d: 4,
      slots: { name: V.NAMES, place: V.PLACES },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => {
        const right = `${s.name} asked whether ${s.place} was open.`;
        return [right, endWith(right, '?'), right.replace('asked', 'asked,'), decap(right)];
      },
      a: (s) => `${s.name} asked whether ${s.place} was open.`,
      r: () => 'An indirect question is a statement, so it ends with a period and takes no comma.',
    },
    {
      d: 5,
      slots: { thing: ['ledger', 'sample', 'toolbox', 'manifest', 'key', 'crate'], name: V.NAMES },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => [`"Bring the ${s.thing}," ${s.name} said.`, `"Bring the ${s.thing}" ${s.name} said.`,
        `"Bring the ${s.thing}." ${s.name} said.`, `"Bring the ${s.thing}", ${s.name} said.`],
      a: (s) => `"Bring the ${s.thing}," ${s.name} said.`,
      r: () => 'A comma separates the quotation from the tag and belongs inside the closing quotation mark.',
    },
    {
      d: 6,
      slots: { trade: V.TRADEOFFS },
      p: () => 'Which sentence is punctuated correctly?',
      // The flaw belongs to the thing named first. "The plan has one flaw: they
      // vary in size" left "they" meaning nothing, and "it drifts in the heat"
      // said the plan drifts.
      c: (s) => {
        const flaw = colonFlaw(s.trade);
        return [flaw, flaw.replace(':', ','), flaw.replace(':', '; that'), flaw.replace(':', ' -:')];
      },
      a: (s) => colonFlaw(s.trade),
      r: () => 'A colon introduces an explanation of what came before it.',
    },
    {
      d: 7,
      slots: { event: V.EVENTS },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => {
        const a = s.event.cause.charAt(0).toUpperCase() + s.event.cause.slice(1);
        return [`${a}; ${s.event.effect}.`, `${a}, ${s.event.effect}.`,
          `${a}: ${s.event.effect}, and.`, `${a} ${s.event.effect}.`];
      },
      a: (s) => `${s.event.cause.charAt(0).toUpperCase() + s.event.cause.slice(1)}; ${s.event.effect}.`,
      r: () => 'Two independent clauses can be joined by a semicolon; a comma alone would be a splice.',
    },
  ],

  // ── sentence structure ───────────────────────────────────────────────────
  sentence_struct: [
    {
      d: 2,
      slots: { noun: V.ROLES_SINGULAR, verb: V.VERBS_INTRANSITIVE },
      p: () => 'Which is a complete sentence?',
      c: (s) => [`The ${s.noun} ${s.verb.past}.`, `Because the ${s.noun} ${s.verb.past} until midnight.`,
        `${s.verb.ing.charAt(0).toUpperCase() + s.verb.ing.slice(1)} after dark.`, 'Which was unexpected.'],
      a: (s) => `The ${s.noun} ${s.verb.past}.`,
      r: () => 'A complete sentence needs a subject and a finite verb and must stand alone; the others are fragments.',
    },
    {
      d: 3,
      slots: { noun: V.NOUNS_PLURAL, sub: ['Although', 'Because', 'While', 'Unless'] },
      p: () => 'Which is a fragment?',
      c: (s) => [`${s.sub} the ${s.noun} were ready.`, `The ${s.noun} were ready.`,
        `Get the ${s.noun} ready.`, `Were the ${s.noun} ready?`],
      a: (s) => `${s.sub} the ${s.noun} were ready.`,
      r: (s) => `"${s.sub}" makes the clause subordinate, so it cannot stand by itself.`,
    },
    {
      d: 4,
      slots: { verb: V.VERBS_TRANSITIVE },
      p: () => 'Which sentence is a run-on?',
      c: (s) => [`I ${s.verb.past} ${s.verb.obj} I sent ${s.verb.pro} immediately.`,
        `I ${s.verb.past} ${s.verb.obj} and sent ${s.verb.pro} immediately.`,
        `After ${s.verb.ing} ${s.verb.obj}, I sent ${s.verb.pro}.`,
        `I ${s.verb.past} ${s.verb.obj}; I sent ${s.verb.pro} immediately.`],
      a: (s) => `I ${s.verb.past} ${s.verb.obj} I sent ${s.verb.pro} immediately.`,
      r: () => 'Two independent clauses are jammed together with no conjunction and no punctuation.',
    },
    {
      d: 5,
      slots: { event: V.EVENTS },
      p: (s) => `Which choice best fixes the comma splice "${s.event.cause.charAt(0).toUpperCase()
        + s.event.cause.slice(1)}, ${s.event.effect}."?`,
      c: (s) => {
        const a = s.event.cause.charAt(0).toUpperCase() + s.event.cause.slice(1);
        return [`${a}, so ${s.event.effect}.`, `${a} ${s.event.effect}.`,
          `${a}, therefore ${s.event.effect}.`, `${a}, and, ${s.event.effect}.`];
      },
      a: (s) => `${s.event.cause.charAt(0).toUpperCase() + s.event.cause.slice(1)}, so ${s.event.effect}.`,
      r: () => 'A coordinating conjunction after the comma joins the two clauses properly.',
    },
    {
      d: 6,
      slots: { role: V.ROLES_SINGULAR, verb: V.VERBS_TRANSITIVE },
      p: () => 'Which sentence is correctly constructed?',
      // The main clause is something the one who did the first thing could do
      // next. "Having signed the form, the clerk signed it" was a rendering.
      c: (s) => [`Having ${s.verb.pp} ${s.verb.obj}, the ${s.role} went home.`,
        `Having ${s.verb.pp} ${s.verb.obj}, the day was over for the ${s.role}.`,
        `Having ${s.verb.pp} ${s.verb.obj}, the office was locked by the ${s.role}.`,
        `Having ${s.verb.pp} ${s.verb.obj} the ${s.role} went home.`],
      a: (s) => `Having ${s.verb.pp} ${s.verb.obj}, the ${s.role} went home.`,
      r: (s) => `The opening phrase must describe the subject that follows it, and the ${s.role} is the one`
        + ` who ${s.verb.pp} ${s.verb.obj}.`,
    },
  ],

  // ── pronouns ─────────────────────────────────────────────────────────────
  pronoun_case: [
    {
      d: 2,
      slots: {
        name: V.NAMES,
        thing: ['award', 'contract', 'grant', 'prize', 'bonus', 'commission', 'scholarship',
          'tender', 'fellowship', 'placement'],
      },
      p: (s) => `Choose the correct pronoun: The ${s.thing} went to ${s.name} and ___.`,
      c: () => ['me', 'I', 'myself', 'mine'],
      a: () => 'me',
      r: () => 'The pronoun is the object of "to," so it takes the objective form. Test it alone: "went to me."',
    },
    {
      d: 3,
      slots: { verb: V.VERBS_TRANSITIVE },
      p: (s) => `Choose the correct pronoun: ___ and I ${s.verb.past} ${s.verb.obj}.`,
      c: () => ['She', 'Her', 'Herself', 'Hers'],
      a: () => 'She',
      r: () => 'The pronoun is part of the subject, so it takes the subjective form.',
    },
    {
      d: 4,
      slots: { thing: V.NOUNS_SINGULAR },
      p: (s) => `Choose the correct pronoun: Each student must bring ___ own ${s.thing}.`,
      c: () => ['their', 'they’re', 'there', 'its'],
      a: () => 'their',
      r: () => '"Their" is the possessive form and is standard as a singular for an unspecified student.',
    },
    {
      d: 5,
      slots: { role: V.ROLES_SINGULAR },
      p: (s) => `Choose the correct pronoun: The ${s.role} to ___ you spoke has retired.`,
      c: () => ['whom', 'who', 'which', 'whose'],
      a: () => 'whom',
      r: () => 'After a preposition the objective form "whom" is required.',
    },
    {
      d: 7,
      // The pronoun has to fit both people, or it is not ambiguous at all — it is
      // just wrong. "When Marcus met Dev, she was nervous" was a rendering.
      slots: { duo: V.NAME_PAIRS_PRONOUN },
      p: () => 'Which sentence has a clear pronoun reference?',
      c: ({ duo: { pair, pro } }) => [`When ${pair[0]} met ${pair[1]}, ${pair[0]} was nervous.`,
        `When ${pair[0]} met ${pair[1]}, ${pro} was nervous.`,
        `${pair[0]} met ${pair[1]}, and ${pro} was nervous about it.`,
        `${pro.charAt(0).toUpperCase() + pro.slice(1)} was nervous when ${pair[0]} met ${pair[1]}.`],
      a: ({ duo: { pair } }) => `When ${pair[0]} met ${pair[1]}, ${pair[0]} was nervous.`,
      r: ({ duo: { pair, pro } }) => `"${pro}" could mean ${pair[0]} or ${pair[1]}, so repeating the name is`
        + ' the only version with one possible meaning.',
    },
    {
      d: 8,
      slots: {
        doc: ['report', 'complaint', 'appeal', 'notice', 'claim', 'objection', 'petition',
          'affidavit', 'summary', 'dissent'],
      },
      p: (s) => `Choose the correct pronoun: It was ___ who filed the ${s.doc}.`,
      c: () => ['he', 'him', 'himself', 'his'],
      a: () => 'he',
      r: () => 'After a linking verb the pronoun is a predicate nominative and takes the subjective form.',
    },
  ],

  // ── verb tense ───────────────────────────────────────────────────────────
  verb_tense: [
    {
      d: 2,
      // "This morning" is left out: said while it is still morning, "is
      // reviewing" would be right too.
      slots: { when: V.TIME_PAST.filter((t) => t !== 'This morning'), name: V.NAMES, verb: V.VERBS_TRANSITIVE },
      p: (s) => `Choose the correct form: ${s.when} ${s.name} ___ ${s.verb.obj} at the depot.`,
      c: (s) => [s.verb.past, s.verb.s, `will ${s.verb.base}`, `is ${s.verb.ing}`],
      a: (s) => s.verb.past,
      r: (s) => `"${midSentence(s.when)}" sets the action in the past, so the simple past "${s.verb.past}" is required.`,
    },
    {
      d: 3,
      slots: { when: V.TIME_PRESENT, role: V.ROLES_SINGULAR, verb: V.VERBS_TRANSITIVE },
      p: (s) => `Choose the correct form: ${s.when} the ${s.role} ___ ${s.verb.obj}.`,
      // No simple past among the choices: "Every morning the clerk reviewed the
      // contract" is a correct sentence about the past, so it cannot be the
      // wrong answer.
      c: (s) => [s.verb.s, s.verb.base, `are ${s.verb.ing}`, `have ${s.verb.pp}`],
      a: (s) => s.verb.s,
      r: (s) => `A repeated present action with a singular subject takes "${s.verb.s}."`,
    },
    {
      d: 4,
      slots: { when: V.TIME_FUTURE, name: V.NAMES, verb: V.VERBS_TRANSITIVE },
      p: (s) => `Choose the correct form: ${s.when} ${s.name} ___ ${s.verb.obj}.`,
      // No present simple either: "Tomorrow Ana signs the form" is good English
      // for a scheduled event.
      c: (s) => [`will ${s.verb.base}`, s.verb.past, `has ${s.verb.pp}`, `had ${s.verb.pp}`],
      a: (s) => `will ${s.verb.base}`,
      r: (s) => `"${midSentence(s.when)}" puts the action ahead of now, which is the simple future.`,
    },
    {
      d: 6,
      slots: { verb: V.VERBS_TRANSITIVE, name: V.NAMES },
      p: (s) => `Choose the correct form: By the time ${s.name} arrived, the crew ___ already ${s.verb.pp} ${s.verb.obj}.`,
      c: () => ['had', 'has', 'have', 'will have'],
      a: () => 'had',
      r: () => 'One past action finished before another takes the past perfect: "had" plus the participle.',
    },
    {
      d: 7,
      // "Since", not "for": "The team used the same method for three years" is
      // correct about a finished stretch, while "since" only takes the perfect.
      slots: { verb: V.VERBS_METHOD, since: ['2019', 'last spring', 'the merger', 'March', 'the last inspection'] },
      p: (s) => `Choose the correct form: The team ___ the same method since ${s.since}.`,
      c: (s) => [`has ${s.verb.pp}`, s.verb.past, `is ${s.verb.ing}`, `will ${s.verb.base}`],
      a: (s) => `has ${s.verb.pp}`,
      r: () => '"Since" marks an action that started in the past and still holds, which takes the present perfect.',
    },
  ],

  // ── commas ───────────────────────────────────────────────────────────────
  comma_use: [
    {
      d: 2,
      slots: { a: V.NOUNS_PLURAL, b: other(V.NOUNS_PLURAL, 'a'), c2: other(V.NOUNS_PLURAL, 'a', 'b') },
      p: () => 'Which sentence uses commas correctly?',
      c: (s) => [`We packed ${s.a}, ${s.b}, and ${s.c2}.`, `We packed ${s.a} ${s.b} and ${s.c2}.`,
        `We packed, ${s.a}, ${s.b} and ${s.c2}.`, `We packed ${s.a}, ${s.b} and, ${s.c2}.`],
      a: (s) => `We packed ${s.a}, ${s.b}, and ${s.c2}.`,
      // The comma before "and" is a style choice, so the rationale says so; no
      // option here leaves it out while being otherwise right.
      r: () => 'Items in a series are separated by commas, and in this style that includes one before the'
        + ' final "and."',
    },
    {
      d: 4,
      // The opening clause is the event's own cause, so the sentence makes sense
      // as well as being punctuated: "Once the forms arrived, the crops were
      // rationed" was a rendering.
      slots: { sub: ['When', 'After', 'Because', 'Once'], event: V.EVENTS },
      p: () => 'Which sentence uses commas correctly?',
      c: (s) => [`${s.sub} ${s.event.cause}, ${s.event.effect}.`, `${s.sub} ${s.event.cause} ${s.event.effect}.`,
        `${s.sub} ${s.event.cause}, and ${s.event.effect}.`, `${s.sub}, ${s.event.cause} ${s.event.effect}.`],
      a: (s) => `${s.sub} ${s.event.cause}, ${s.event.effect}.`,
      r: (s) => `An introductory clause like "${lower(s.sub)} ${s.event.cause}" is followed by a comma.`,
    },
    {
      d: 5,
      slots: { name: V.NAMES, role: V.ROLES_SINGULAR },
      p: () => 'Which sentence uses commas correctly?',
      c: (s) => [`${s.name}, our ${s.role}, signed the form.`, `${s.name} our ${s.role} signed the form.`,
        `${s.name}, our ${s.role} signed the form.`, `${s.name} our ${s.role}, signed the form.`],
      a: (s) => `${s.name}, our ${s.role}, signed the form.`,
      r: (s) => `"our ${s.role}" is an appositive renaming ${s.name}, so it takes a comma on both sides.`,
    },
    {
      d: 6,
      slots: { event: V.EVENTS },
      p: () => 'Which sentence uses commas correctly?',
      c: (s) => {
        const a = s.event.cause.charAt(0).toUpperCase() + s.event.cause.slice(1);
        return [`${a}, so ${s.event.effect}.`, `${a} so, ${s.event.effect}.`,
          `${a}, ${s.event.effect}.`, `${a}, so, ${s.event.effect}.`];
      },
      a: (s) => `${s.event.cause.charAt(0).toUpperCase() + s.event.cause.slice(1)}, so ${s.event.effect}.`,
      r: () => 'A comma goes before the coordinating conjunction that joins two independent clauses.',
    },
  ],

  // ── apostrophes ──────────────────────────────────────────────────────────
  apostrophes: [
    {
      d: 2,
      slots: { role: V.ROLES_SINGULAR, thing: V.NOUNS_SINGULAR },
      p: (s) => `Choose the correct form: the ${s.role}___ ${s.thing} (one ${s.role})`,
      c: () => ['’s', 's’', 's', '’'],
      a: () => '’s',
      r: (s) => `One ${s.role} owning one ${s.thing} takes apostrophe then s.`,
    },
    {
      d: 4,
      slots: { role: V.ROLES_PLURAL, thing: V.NOUNS_PLURAL },
      // The plural as the bank spells it. Rebuilding it from a stem made
      // "nurss" and "coachs".
      p: (s) => `Choose the correct form: the ${s.role}___ ${s.thing} (more than one)`,
      c: () => ['’', '’s', 's’s', 's'],
      a: () => '’',
      r: () => 'A plural already ending in s takes only an apostrophe after it.',
    },
    {
      d: 3,
      slots: { noun: V.NOUNS_SINGULAR },
      p: (s) => `Which is correct? The ${s.noun} lost ___ label.`,
      c: () => ['its', 'it’s', 'its’', 'it is'],
      a: () => 'its',
      r: () => '"Its" is the possessive; "it’s" is short for "it is," which does not fit here.',
    },
    {
      d: 5,
      // Not a name ending in s: "Marcus’ report" is accepted style as well, so
      // it cannot be the wrong answer.
      slots: { name: NAMES_NO_S },
      p: (s) => `Which sentence is correct?`,
      c: (s) => [`${s.name}’s report arrived late.`, `${s.name}s report arrived late.`,
        `${s.name}s’ report arrived late.`, `${s.name}’ report arrived late.`],
      a: (s) => `${s.name}’s report arrived late.`,
      r: (s) => `A singular name takes apostrophe s to show possession: ${s.name}’s report.`,
    },
  ],

  // ── modifiers and parallelism ────────────────────────────────────────────
  modifiers: [
    {
      d: 5,
      slots: { role: V.ROLES_SINGULAR, verb: V.VERBS_TRANSITIVE },
      p: () => 'Which sentence has no misplaced modifier?',
      c: (s) => [`${s.verb.ing.charAt(0).toUpperCase() + s.verb.ing.slice(1)} carefully, the ${s.role} found the error.`,
        `${s.verb.ing.charAt(0).toUpperCase() + s.verb.ing.slice(1)} carefully, the error was found.`,
        `The error was found ${s.verb.ing} carefully.`,
        `${s.verb.ing.charAt(0).toUpperCase() + s.verb.ing.slice(1)} carefully the error found the ${s.role}.`],
      a: (s) => `${s.verb.ing.charAt(0).toUpperCase() + s.verb.ing.slice(1)} carefully, the ${s.role} found the error.`,
      r: (s) => `The opening phrase has to describe whoever was ${s.verb.ing}, and that is the ${s.role}.`,
    },
    {
      d: 6,
      // Duties a job can involve, and three different ones.
      slots: {
        a: JOB_VERBS,
        b: other(JOB_VERBS, 'a'),
        c2: other(JOB_VERBS, 'a', 'b'),
      },
      p: () => 'Which sentence is parallel?',
      c: (s) => [`The job involves ${s.a.ing}, ${s.b.ing}, and ${s.c2.ing}.`,
        `The job involves ${s.a.ing}, ${s.b.ing}, and to ${s.c2.base}.`,
        `The job involves to ${s.a.base}, ${s.b.ing}, and ${s.c2.ing}.`,
        `The job involves ${s.a.ing}, to ${s.b.base}, and ${s.c2.pp}.`],
      a: (s) => `The job involves ${s.a.ing}, ${s.b.ing}, and ${s.c2.ing}.`,
      r: () => 'Items in a list must take the same grammatical form; here all three are -ing forms.',
    },
    {
      d: 7,
      slots: { adj: V.ADJECTIVES_THING, noun: V.NOUNS_SINGULAR },
      p: (s) => `Where does "only" belong to say that nothing besides the ${s.noun} was ${s.adj}?`,
      // "The book only was dusty" used to be a distractor, but "only" after its
      // noun is formal English for exactly this meaning. "Only, ..." means "except
      // that", which is wrong without argument.
      c: (s) => [`Only the ${s.noun} was ${s.adj}.`, `The only ${s.noun} was ${s.adj}.`,
        `The ${s.noun} was only ${s.adj}.`, `Only, the ${s.noun} was ${s.adj}.`],
      a: (s) => `Only the ${s.noun} was ${s.adj}.`,
      r: (s) => `"Only" limits whatever follows it, so putting it before "the ${s.noun}" limits the thing`
        + ' rather than the description.',
    },
  ],

  // ── word choice ──────────────────────────────────────────────────────────
  word_choice: [
    {
      d: 2,
      slots: { thing: ['rule', 'schedule', 'policy', 'fee', 'route'], who: V.ROLES_PLURAL },
      p: (s) => `Choose the correct word: The new ${s.thing} will ___ the ${s.who}.`,
      c: () => ['affect', 'effect', 'affective', 'effectual'],
      a: () => 'affect',
      r: () => '"Affect" is the verb meaning to influence; "effect" is normally the noun.',
    },
    {
      d: 5,
      slots: { thing: ['evidence', 'delay', 'weather', 'shortage', 'ruling'] },
      p: (s) => `Choose the correct word: The ${s.thing} had no ___ on the outcome.`,
      c: () => ['effect', 'affect', 'affecting', 'effected'],
      a: () => 'effect',
      r: () => 'Here the word is a noun meaning result, which is "effect."',
    },
    {
      d: 4,
      slots: { count: V.NOUNS_PLURAL },
      p: (s) => `Choose the correct word: We had ___ ${s.count} than last year.`,
      c: () => ['fewer', 'less', 'lesser', 'fewest'],
      a: () => 'fewer',
      r: (s) => `"${s.count}" can be counted, and countable things take "fewer."`,
    },
    {
      d: 4,
      slots: { mass: V.NOUNS_MASS },
      p: (s) => `Choose the correct word: There was ___ ${s.mass} than last year.`,
      c: () => ['less', 'fewer', 'fewest', 'lesser'],
      a: () => 'less',
      r: (s) => `"${s.mass}" is not counted in units, so it takes "less."`,
    },
    {
      d: 3,
      slots: { a: V.NOUNS_SINGULAR, b: other(V.NOUNS_SINGULAR, 'a') },
      p: (s) => `Choose the correct word: This ${s.a} is heavier ___ that ${s.b}.`,
      c: () => ['than', 'then', 'that', 'thus'],
      a: () => 'than',
      r: () => '"Than" makes comparisons; "then" refers to time or sequence.',
    },
    {
      d: 6,
      slots: { thing: V.NOUNS_PLURAL, where: V.PLACES_PREP_PUT },
      p: (s) => `Choose the correct word: Please ___ the ${s.thing} ${s.where}.`,
      c: () => ['lay', 'lie', 'laid', 'lied'],
      a: () => 'lay',
      r: (s) => `"Lay" takes a direct object — the ${s.thing} — and "lie" does not.`,
    },
  ],

  // ── transitions ──────────────────────────────────────────────────────────
  transitions: [
    {
      d: 4,
      slots: { event: V.EVENTS },
      p: (s) => `Choose the best transition: ${s.event.cause.charAt(0).toUpperCase()
        + s.event.cause.slice(1)}. ___, ${s.event.effect}.`,
      c: () => ['As a result', 'Nevertheless', 'In contrast', 'Similarly'],
      a: () => 'As a result',
      r: (s) => `"${s.event.effect}" is a consequence of the first sentence, so the transition marks cause`
        + ' and effect.',
    },
    {
      d: 6,
      slots: { trade: V.TRADEOFFS },
      p: (s) => `Choose the best transition: ${s.trade.good}. ___, ${s.trade.bad}.`,
      c: () => ['On the other hand', 'Consequently', 'In addition', 'That is'],
      a: () => 'On the other hand',
      r: () => 'A drawback set against an advantage needs a contrasting transition.',
    },
    {
      d: 7,
      // The drawback comes with the thing it is a drawback of. On its own it read
      // "Nobody supports it. Even so, it is still..." with nothing for "it" to
      // mean, and "They vary in size. Even so, it is..." for the bricks.
      slots: { trade: V.TRADEOFFS },
      p: (s) => `Choose the best transition: ${s.trade.good}, but ${s.trade.bad}. ___, the team chose`
        + ` ${/^they\b/.test(s.trade.bad) ? 'them' : 'it'}.`,
      c: () => ['Even so', 'Thus', 'Namely', 'Meanwhile'],
      a: () => 'Even so',
      r: () => '"Even so" concedes the drawback and then states the outcome anyway.',
    },
    {
      d: 3,
      slots: { a: V.NOUNS_PLURAL, place: V.PLACES },
      p: (s) => `Choose the best transition: The forecast called for rain. ___, we moved the ${s.a} to ${s.place}.`,
      c: () => ['So', 'However', 'For example', 'In conclusion'],
      a: () => 'So',
      r: () => 'The second sentence is what the forecast caused, so a consequence transition fits.',
    },
  ],

  // ── ACT rhetoric ─────────────────────────────────────────────────────────
  // (two more transition families and one more pronoun family are appended at the
  // bottom of this file.)
  act_rhetoric: [
    {
      d: 4,
      slots: {
        topic: ['a city’s water system', 'a harbor redevelopment', 'a school bus route',
          'a regional power grid', 'a river cleanup'],
        stray: ['the mayor’s childhood', 'a councillor’s favorite restaurant',
          'the architect’s dog', 'a reporter’s commute'],
      },
      p: (s) => `A paragraph about ${s.topic} ends with a sentence about ${s.stray}. The writer should`,
      c: () => ['delete the sentence because it is irrelevant to the paragraph',
        'keep it because it adds human interest', 'move it to the start of the paragraph',
        'expand it into its own paragraph'],
      a: () => 'delete the sentence because it is irrelevant to the paragraph',
      r: (s) => `Rhetoric questions reward relevance: ${s.stray} does not serve a paragraph about ${s.topic}.`,
    },
    {
      d: 5,
      slots: { event: V.EVENTS },
      p: (s) => 'Which revision is most concise without losing meaning? "The reason why '
        + `${s.event.effect} was because of the fact that ${s.event.cause}."`,
      c: (s) => [`${s.event.effect.charAt(0).toUpperCase() + s.event.effect.slice(1)} because ${s.event.cause}.`,
        `The reason ${s.event.effect} was that ${s.event.cause}.`,
        `Due to the fact that ${s.event.cause}, ${s.event.effect}.`,
        `${s.event.effect.charAt(0).toUpperCase() + s.event.effect.slice(1)} on account of ${s.event.cause} being the reason.`],
      a: (s) => `${s.event.effect.charAt(0).toUpperCase() + s.event.effect.slice(1)} because ${s.event.cause}.`,
      r: () => 'Redundant framing ("the reason why ... was because of the fact that") is cut entirely.',
    },
    {
      d: 7,
      slots: { unit: ['applications', 'enrollments', 'orders', 'downloads', 'signups'],
        span: ['Within hours', 'Within a day', 'Inside a week'] },
      p: () => 'A writer wants to emphasize that the change was immediate. Which phrasing is best?',
      c: (s) => [`${s.span}, ${s.unit} doubled.`, `${s.unit.charAt(0).toUpperCase() + s.unit.slice(1)} doubled at some point.`,
        `${s.unit.charAt(0).toUpperCase() + s.unit.slice(1)}, over a period of time, doubled.`,
        `It came to pass that ${s.unit} doubled.`],
      a: (s) => `${s.span}, ${s.unit} doubled.`,
      r: () => 'A specific short interval delivers the emphasis; the alternatives blur the timing.',
    },
  ],

  // ── ACT science ──────────────────────────────────────────────────────────
  // (three more rhetoric families are appended to act_rhetoric at the bottom of
  // this file, where the slot banks they need are already in scope.)
  // These are computed from their own numbers, so the data and the answer can
  // never disagree.
  act_science: [
    {
      d: 4,
      slots: {
        low: [5, 10, 15],
        peak: [35, 40, 45, 50],
        high: [60, 65, 70],
        measure: ['enzyme activity', 'reaction rate', 'oxygen uptake', 'growth rate'],
      },
      p: (s) => `Study 1: as temperature rose from ${s.low}°C to ${s.peak}°C, ${s.measure} rose`
        + ` steadily; from ${s.peak}°C to ${s.high}°C it fell sharply. ${s.measure.charAt(0).toUpperCase()
          + s.measure.slice(1)} was highest at about`,
      c: (s) => [`${s.peak}°C`, `${s.low}°C`, `${s.high}°C`,
        `${Math.round((s.low + s.peak) / 2)}°C`],
      a: (s) => `${s.peak}°C`,
      r: (s) => `The turning point between rising and falling is the maximum, and here it is ${s.peak}°C.`,
    },
    {
      d: 5,
      slots: {
        base: [2, 3, 4],
        mid: [28, 31, 34],
        high: [55, 58, 61],
        // A few points above the 20 mm figure, always: drawn on its own it could
        // fall below it, and the rationale reported a step of "-2 points".
        top: (rng, out) => out.high + rng.pick([2, 3, 4]),
        thing: ['seed germination', 'sapling survival', 'shoot emergence'],
      },
      p: (s) => `A table shows ${s.thing}: 0 mm rain, ${s.base}%; 10 mm, ${s.mid}%; 20 mm, ${s.high}%;`
        + ` 30 mm, ${s.top}%. The data best support that ${s.thing}`,
      c: () => ['rises with rainfall but levels off', 'falls as rainfall increases',
        'is unaffected by rainfall', 'rises without limit'],
      a: () => 'rises with rainfall but levels off',
      r: (s) => `The step from 20 to 30 mm is ${s.top - s.high} points against ${s.high - s.mid} before it,`
        + ' which is a plateau.',
    },
    {
      d: 6,
      slots: {
        thing: ['a lake’s oxygen decline', 'a river’s fish loss', 'a pond’s algae growth'],
        blameA: ['runoff', 'fertilizer', 'sediment'],
        blameB: ['rising temperature', 'longer summers', 'reduced inflow'],
      },
      p: (s) => `Two scientists disagree about ${s.thing}. Scientist A blames ${s.blameA};`
        + ` Scientist B blames ${s.blameB}. Which finding would best support B?`,
      // "Change", not "decline": one of the three things is algae growth, which rises.
      c: (s) => [`The same change appeared in a nearby water body with no ${s.blameA} in its watershed`,
        `${s.blameA.charAt(0).toUpperCase() + s.blameA.slice(1)} doubled in the same period`,
        `Nitrogen rose sharply near the inlet`,
        `The effect was heaviest beside the ${s.blameA} outflow`],
      a: (s) => `The same change appeared in a nearby water body with no ${s.blameA} in its watershed`,
      r: (s) => `A site with no ${s.blameA} showing the same change points away from ${s.blameA}`
        + ` and toward a shared cause like ${s.blameB}.`,
    },
    {
      d: 8,
      slots: {
        r: [0.88, 0.91, 0.94],
        // Both sides are summer goods. Soup against ice cream, or umbrellas against
        // sandals, would follow the season in opposite directions, and a positive
        // correlation between them is not what a shared season produces.
        a: ['iced coffee sales', 'electric fan sales', 'lemonade sales'],
        b: ['sunscreen sales', 'ice cream sales', 'sandal sales'],
      },
      p: (s) => `A researcher reports a correlation of ${s.r} between ${s.a} and ${s.b}.`
        + ' The best interpretation is that',
      c: (s) => ['both track a third factor such as season', `${s.a} cause ${s.b}`,
        `${s.b} cause ${s.a}`, 'the correlation must be a calculation error'],
      a: () => 'both track a third factor such as season',
      r: () => 'A strong correlation between unrelated products usually indicates a shared driver, not causation.',
    },
  ],
};

FAMILIES.transitions.push(
  {
    d: 5,
    slots: { event: V.EVENTS, place: V.PLACES },
    p: (s) => `Choose the best transition: ${s.event.cause.charAt(0).toUpperCase()
      + s.event.cause.slice(1)}. ___, ${s.place} stayed open all week.`,
    c: () => ['Even so', 'Therefore', 'For example', 'Likewise'],
    a: () => 'Even so',
    r: (s) => `Staying open after ${s.event.cause} is the opposite of what you would expect,`
      + ' which is what a concessive transition marks.',
  },
  {
    d: 6,
    slots: { a: V.NOUNS_PLURAL, b: other(V.NOUNS_PLURAL, 'a'), role: V.ROLES_PLURAL },
    p: (s) => `Choose the best transition: The ${s.role} counted the ${s.a}. ___, they counted`
      + ` the ${s.b}.`,
    c: () => ['Then', 'However', 'By contrast', 'In conclusion'],
    a: () => 'Then',
    r: () => 'Two steps in the same sequence take a sequence transition, not a contrast.',
  },
);

FAMILIES.pronoun_case.push(
  {
    d: 6,
    slots: { pair: V.NAME_PAIRS, verb: V.VERBS_TRANSITIVE },
    // "was" or "were" by the object: "the whole of the samples was packed" was a rendering.
    p: (s) => `Choose the correct pronoun: Between ${s.pair[0]} and ___, ${s.verb.obj}`
      + ` ${s.verb.pro === 'them' ? 'were' : 'was'} ${s.verb.pp} by noon.`,
    c: () => ['me', 'I', 'myself', 'mine'],
    a: () => 'me',
    r: () => '"Between" is a preposition, so the pronoun after it takes the objective form.',
  },
  {
    d: 4,
    slots: { role: V.ROLES_PLURAL, thing: V.NOUNS_PLURAL },
    p: (s) => `Choose the correct pronoun: The ${s.role} brought ___ own ${s.thing}.`,
    c: () => ['their', 'there', 'they\u2019re', 'its'],
    a: () => 'their',
    r: (s) => `"Their" is the possessive form, and the ${s.role} are plural.`,
  },
);

FAMILIES.parts_of_speech.push(
  {
    d: 3,
    slots: { name: V.NAMES, place: V.PLACES, prep: V.PLACES_PREP_PERSON },
    p: (s) => `In "${s.name} waited ${s.prep} at ${s.place}," which word is a preposition?`,
    c: (s) => [s.prep.split(' ')[0], s.name, 'waited', s.place.split(' ').pop()],
    a: (s) => s.prep.split(' ')[0],
    r: (s) => `"${s.prep.split(' ')[0]}" introduces the phrase "${s.prep}", which locates the waiting.`,
  },
  {
    d: 6,
    slots: { role: V.ROLES_SINGULAR, verb: V.VERBS_TRANSITIVE, adv: V.ADVERBS },
    p: (s) => `In "The ${s.role} ${s.verb.past} ${s.verb.obj} ${s.adv}," what does "${s.adv}" modify?`,
    c: (s) => [`the verb "${s.verb.past}"`, `the noun "${s.role}"`,
      'the whole sentence equally', `the object "${s.verb.obj}"`],
    a: (s) => `the verb "${s.verb.past}"`,
    r: (s) => `An adverb modifies the verb: it tells how the ${s.role} ${s.verb.past}.`,
  },
);

FAMILIES.punctuation_basic.push(
  {
    d: 4,
    slots: { city: V.CITIES, day: V.DAYS, name: V.NAMES },
    p: () => 'Which sentence is punctuated correctly?',
    c: (s) => [`${s.name} arrived in ${s.city} on ${s.day}, tired but on time.`,
      `${s.name} arrived in ${s.city} on ${s.day} tired but on time.`,
      `${s.name} arrived in ${s.city}, on ${s.day}, tired but on time.`,
      `${s.name}, arrived in ${s.city} on ${s.day}, tired but on time.`],
    a: (s) => `${s.name} arrived in ${s.city} on ${s.day}, tired but on time.`,
    r: () => 'The trailing description is set off by one comma; no comma belongs between the subject'
      + ' and its verb, or before an ordinary prepositional phrase.',
  },
  {
    d: 6,
    slots: { role: V.ROLES_PLURAL, noun: V.NOUNS_PLURAL },
    p: () => 'Which sentence is punctuated correctly?',
    c: (s) => [`The ${s.role} brought three things: ${s.noun}, tea, and patience.`,
      `The ${s.role} brought three things; ${s.noun}, tea, and patience.`,
      `The ${s.role} brought three things, ${s.noun}, tea and patience.`,
      `The ${s.role} brought: three things, ${s.noun}, tea, and patience.`],
    a: (s) => `The ${s.role} brought three things: ${s.noun}, tea, and patience.`,
    r: () => 'A colon introduces a list after a complete clause, and the list items take commas.',
  },
);

FAMILIES.act_rhetoric.push(
  {
    d: 5,
    slots: { place: V.PLACES, role: V.ROLES_PLURAL, adj: V.ADJECTIVES_PLACE },
    p: (s) => `A paragraph describes ${s.place} as ${s.adj}. The writer wants to add one sentence`
      + ` of evidence for that. The best choice is`,
    c: (s) => [`The ${s.role} who work there say so without being asked.`,
      `${s.place.charAt(0).toUpperCase() + s.place.slice(1)} has been there a long time.`,
      `Many people have opinions about ${s.place}.`,
      `The word "${s.adj}" has several meanings.`],
    a: (s) => `The ${s.role} who work there say so without being asked.`,
    r: (s) => `Evidence has to bear on the claim. Unprompted agreement from the ${s.role} supports`
      + ` "${s.adj}"; the others change the subject.`,
  },
  {
    d: 6,
    slots: { a: V.NOUNS_PLURAL, b: other(V.NOUNS_PLURAL, 'a'), role: V.ROLES_SINGULAR },
    p: (s) => `A writer has two paragraphs: one on ${s.a} and one on ${s.b}. Which sentence best`
      + ' opens the second one?',
    c: (s) => [`The ${s.b} raise a different question.`,
      `The ${s.a} are worth another look.`,
      `Every ${s.role} has an opinion on this.`,
      `There is more to say about all of it.`],
    a: (s) => `The ${s.b} raise a different question.`,
    r: (s) => `An opening sentence should announce the new paragraph's subject — the ${s.b} — and`
      + ' signal the turn away from the last one.',
  },
  {
    d: 7,
    slots: { trade: V.TRADEOFFS, role: V.ROLES_SINGULAR },
    p: (s) => `A writer wants to concede a drawback without abandoning the argument. Which is best?`,
    c: (s) => [`${s.trade.good}, even though ${s.trade.bad}.`,
      `${s.trade.good}. ${s.trade.bad.charAt(0).toUpperCase() + s.trade.bad.slice(1)}.`,
      `${s.trade.bad.charAt(0).toUpperCase() + s.trade.bad.slice(1)}, and that is the end of it.`,
      `The ${s.role} disagrees about whether ${s.trade.bad}.`],
    a: (s) => `${s.trade.good}, even though ${s.trade.bad}.`,
    r: () => 'Subordinating the drawback concedes it and keeps the main clause — the argument —'
      + ' in charge of the sentence.',
  },
);


// ── frames ───────────────────────────────────────────────────────────────
// The constant part of each family's question, with the varying words left as
// holes. The shape filter reads these to keep a learner off a family they have
// just had, and the repeat metric counts them, so a family without one is a
// family the picker cannot tell from its neighbours.
//
// Hand-written, not derived: rendering each family twice and keeping the words
// that agree collapses the nine punctuation families onto one frame — the very
// pair the picker exists to separate — and leaves fragments with a hole where
// the sentence should be. Where a group shares one prompt, the frame is the
// only place the rule it tests is recorded, so each names its own.
FAMILIES.parts_of_speech[0].frame = "In \"The _ _ surprised _,\" which word is an adjective?";
FAMILIES.parts_of_speech[1].frame = "In \"_ _ _ at the counter,\" which word is an adverb?";
FAMILIES.parts_of_speech[2].frame = "In \"The _ _ _,\" what is the subject?";
FAMILIES.parts_of_speech[3].frame = "In \"_ and _ _ _,\" which word is a conjunction?";
FAMILIES.parts_of_speech[4].frame = "In \"_ uphill exhausted _,\" what part of speech is the -ing form?";
FAMILIES.parts_of_speech[5].frame = "In \"The _, which arrived _, was unsigned,\" what does the clause do?";
FAMILIES.parts_of_speech[6].frame = "In \"To _ early would surprise everyone,\" the phrase is";
FAMILIES.parts_of_speech[7].frame = "In \"_ waited _ at _,\" which word is a preposition?";
FAMILIES.parts_of_speech[8].frame = "In \"The _ _ _ _,\" what does the adverb modify?";
FAMILIES.subject_verb[0].frame = "Choose the correct verb: The _ _";
FAMILIES.subject_verb[1].frame = "Choose the correct verb: _ and _ _";
FAMILIES.subject_verb[2].frame = "Choose the correct verb: Each of the _ _";
FAMILIES.subject_verb[3].frame = "Choose the correct verb: Neither the _ nor the _ _";
FAMILIES.subject_verb[4].frame = "Choose the correct verb: The _ _ divided on the proposal.";
FAMILIES.subject_verb[5].frame = "Choose the correct verb: The list of approved _ _ posted _";
FAMILIES.subject_verb[6].frame = "Choose the correct verb: _, _ , _ required for the degree.";
FAMILIES.punctuation_basic[0].frame = "Which sentence is punctuated correctly? (a direct question)";
FAMILIES.punctuation_basic[1].frame = "Which sentence is punctuated correctly? (capitals for a day and a city)";
FAMILIES.punctuation_basic[2].frame = "Which sentence is punctuated correctly? (an exclamation for a command)";
FAMILIES.punctuation_basic[3].frame = "Which sentence is punctuated correctly? (an indirect question)";
FAMILIES.punctuation_basic[4].frame = "Which sentence is punctuated correctly? (a comma before a quotation tag)";
FAMILIES.punctuation_basic[5].frame = "Which sentence is punctuated correctly? (a colon introducing an explanation)";
FAMILIES.punctuation_basic[6].frame = "Which sentence is punctuated correctly? (a semicolon between clauses)";
FAMILIES.punctuation_basic[7].frame = "Which sentence is punctuated correctly? (capitalization of a name and a city)";
FAMILIES.punctuation_basic[8].frame = "Which sentence is punctuated correctly? (a possessive apostrophe)";
FAMILIES.sentence_struct[0].frame = "Which is a complete sentence?";
FAMILIES.sentence_struct[1].frame = "Which is a fragment?";
FAMILIES.sentence_struct[2].frame = "Which sentence is a run-on?";
FAMILIES.sentence_struct[3].frame = "Which choice best fixes the comma splice?";
FAMILIES.sentence_struct[4].frame = "Which sentence is correctly constructed? (a dangling participle)";
FAMILIES.pronoun_case[0].frame = "Choose the correct pronoun: The _ went to _ and _";
FAMILIES.pronoun_case[1].frame = "Choose the correct pronoun: _ and I _ _";
FAMILIES.pronoun_case[2].frame = "Choose the correct pronoun: Each student must bring _ own _";
FAMILIES.pronoun_case[3].frame = "Choose the correct pronoun: The _ to _ you spoke has retired.";
FAMILIES.pronoun_case[4].frame = "Which sentence has a clear pronoun reference?";
FAMILIES.pronoun_case[5].frame = "Choose the correct pronoun: It was _ who filed the _";
FAMILIES.pronoun_case[6].frame = "Choose the correct pronoun: Between _ and _, the whole of the _ was _";
FAMILIES.pronoun_case[7].frame = "Choose the correct pronoun: The _ brought _ own _";
FAMILIES.verb_tense[0].frame = "Choose the correct form: _ _ _ to the depot.";
FAMILIES.verb_tense[1].frame = "Choose the correct form: _ the _ _ the same route.";
FAMILIES.verb_tense[2].frame = "Choose the correct form: _ _ _ the results.";
FAMILIES.verb_tense[3].frame = "Choose the correct form: By the time _ arrived, the crew _ already _ the job.";
FAMILIES.verb_tense[4].frame = "Choose the correct form: The team _ the same method for _";
FAMILIES.comma_use[0].frame = "Which sentence uses commas correctly? (a list of three or more)";
FAMILIES.comma_use[1].frame = "Which sentence uses commas correctly? (a subordinate clause opening the sentence)";
FAMILIES.comma_use[2].frame = "Which sentence uses commas correctly? (an appositive naming a role)";
FAMILIES.comma_use[3].frame = "Which sentence uses commas correctly? (a conjunction joining two clauses)";
FAMILIES.apostrophes[0].frame = "Choose the correct form: the _ (one)";
FAMILIES.apostrophes[1].frame = "Choose the correct form: the _ (more than one)";
FAMILIES.apostrophes[2].frame = "Which is correct? The _ lost _ label.";
FAMILIES.apostrophes[3].frame = "Which sentence is correct?";
FAMILIES.modifiers[0].frame = "Which sentence has no misplaced modifier?";
FAMILIES.modifiers[1].frame = "Which sentence is parallel?";
FAMILIES.modifiers[2].frame = "Where does \"only\" belong to say that nothing besides the _ was _?";
FAMILIES.word_choice[0].frame = "Choose the correct word: The new _ will _ the _";
FAMILIES.word_choice[1].frame = "Choose the correct word: The _ had no _ on the outcome.";
FAMILIES.word_choice[2].frame = "Choose the correct word: We had _ _ than last year.";
FAMILIES.word_choice[3].frame = "Choose the correct word: There was _ _ than last year.";
FAMILIES.word_choice[4].frame = "Choose the correct word: This _ is heavier _ that _";
FAMILIES.word_choice[5].frame = "Choose the correct word: Please _ the _ _";
FAMILIES.transitions[0].frame = "Choose the best transition: a cause, then its effect.";
FAMILIES.transitions[1].frame = "Choose the best transition: an advantage, then a drawback set against it.";
FAMILIES.transitions[2].frame = "Choose the best transition: a drawback, then an outcome that ignores it.";
FAMILIES.transitions[3].frame = "Choose the best transition: The forecast called for rain. ___, we moved the _ to _";
FAMILIES.transitions[4].frame = "Choose the best transition: a consequence, then a second consequence.";
FAMILIES.transitions[5].frame = "Choose the best transition: The _ counted the _ . ___, they counted the _ .";
FAMILIES.act_rhetoric[0].frame = "A paragraph about _ ends with a sentence about _. The writer should";
FAMILIES.act_rhetoric[1].frame = "Which revision is most concise without losing meaning?";
FAMILIES.act_rhetoric[2].frame = "A writer wants to emphasize that the change was immediate. Which phrasing is best?";
FAMILIES.act_rhetoric[3].frame = "A paragraph describes _ as _. The writer wants to add one sentence of evidence. The best choice is";
FAMILIES.act_rhetoric[4].frame = "A writer has two paragraphs: one on _ and one on _. Which sentence best opens the second?";
FAMILIES.act_rhetoric[5].frame = "A writer wants to concede a drawback without abandoning the argument. Which is best?";
FAMILIES.act_science[0].frame = "Study 1: as temperature rose, the _ rose then fell. It was highest at about";
FAMILIES.act_science[1].frame = "A table shows _ at four levels of rain. The data best support that";
FAMILIES.act_science[2].frame = "Two scientists disagree about a _. One blames _; the other blames _. Which finding would best support B?";
FAMILIES.act_science[3].frame = "A researcher reports a correlation of _ between _ and _. The best interpretation is that";

module.exports = { FAMILIES: spread(FAMILIES) };



// ── frames ───────────────────────────────────────────────────────────────
// The constant part of each family's question, with the varying words left as
// holes. The shape filter reads these to keep a learner off a family they have
// just had, and the repeat metric counts them, so a family without one is a
// family the picker cannot tell from its neighbours.
//
// Hand-written, not derived: rendering each family twice and keeping the words
// that agree collapses the nine punctuation families onto one frame — the very
// pair the picker exists to separate — and leaves fragments with a hole where
// the sentence should be. Where a group shares one prompt, the frame is the
// only place the rule it tests is recorded, so each names its own.
FAMILIES.parts_of_speech[0].frame = "In \"The _ _ surprised _,\" which word is an adjective?";
FAMILIES.parts_of_speech[1].frame = "In \"_ _ _ at the counter,\" which word is an adverb?";
FAMILIES.parts_of_speech[2].frame = "In \"The _ _ _,\" what is the subject?";
FAMILIES.parts_of_speech[3].frame = "In \"_ and _ _ _,\" which word is a conjunction?";
FAMILIES.parts_of_speech[4].frame = "In \"_ uphill exhausted _,\" what part of speech is the -ing form?";
FAMILIES.parts_of_speech[5].frame = "In \"The _, which arrived _, was unsigned,\" what does the clause do?";
FAMILIES.parts_of_speech[6].frame = "In \"To _ early would surprise everyone,\" the phrase is";
FAMILIES.parts_of_speech[7].frame = "In \"_ waited _ at _,\" which word is a preposition?";
FAMILIES.parts_of_speech[8].frame = "In \"The _ _ _ _,\" what does the adverb modify?";
FAMILIES.subject_verb[0].frame = "Choose the correct verb: The _ _";
FAMILIES.subject_verb[1].frame = "Choose the correct verb: _ and _ _";
FAMILIES.subject_verb[2].frame = "Choose the correct verb: Each of the _ _";
FAMILIES.subject_verb[3].frame = "Choose the correct verb: Neither the _ nor the _ _";
FAMILIES.subject_verb[4].frame = "Choose the correct verb: The _ _ divided on the proposal.";
FAMILIES.subject_verb[5].frame = "Choose the correct verb: The list of approved _ _ posted _";
FAMILIES.subject_verb[6].frame = "Choose the correct verb: _, _ , _ required for the degree.";
FAMILIES.punctuation_basic[0].frame = "Which sentence is punctuated correctly? (a direct question)";
FAMILIES.punctuation_basic[1].frame = "Which sentence is punctuated correctly? (capitals for a day and a city)";
FAMILIES.punctuation_basic[2].frame = "Which sentence is punctuated correctly? (an exclamation for a command)";
FAMILIES.punctuation_basic[3].frame = "Which sentence is punctuated correctly? (an indirect question)";
FAMILIES.punctuation_basic[4].frame = "Which sentence is punctuated correctly? (a comma before a quotation tag)";
FAMILIES.punctuation_basic[5].frame = "Which sentence is punctuated correctly? (a colon introducing an explanation)";
FAMILIES.punctuation_basic[6].frame = "Which sentence is punctuated correctly? (a semicolon between clauses)";
FAMILIES.punctuation_basic[7].frame = "Which sentence is punctuated correctly? (capitalization of a name and a city)";
FAMILIES.punctuation_basic[8].frame = "Which sentence is punctuated correctly? (a possessive apostrophe)";
FAMILIES.sentence_struct[0].frame = "Which is a complete sentence?";
FAMILIES.sentence_struct[1].frame = "Which is a fragment?";
FAMILIES.sentence_struct[2].frame = "Which sentence is a run-on?";
FAMILIES.sentence_struct[3].frame = "Which choice best fixes the comma splice?";
FAMILIES.sentence_struct[4].frame = "Which sentence is correctly constructed? (a dangling participle)";
FAMILIES.pronoun_case[0].frame = "Choose the correct pronoun: The _ went to _ and _";
FAMILIES.pronoun_case[1].frame = "Choose the correct pronoun: _ and I _ _";
FAMILIES.pronoun_case[2].frame = "Choose the correct pronoun: Each student must bring _ own _";
FAMILIES.pronoun_case[3].frame = "Choose the correct pronoun: The _ to _ you spoke has retired.";
FAMILIES.pronoun_case[4].frame = "Which sentence has a clear pronoun reference?";
FAMILIES.pronoun_case[5].frame = "Choose the correct pronoun: It was _ who filed the _";
FAMILIES.pronoun_case[6].frame = "Choose the correct pronoun: Between _ and _, the whole of the _ was _";
FAMILIES.pronoun_case[7].frame = "Choose the correct pronoun: The _ brought _ own _";
FAMILIES.verb_tense[0].frame = "Choose the correct form: _ _ _ to the depot.";
FAMILIES.verb_tense[1].frame = "Choose the correct form: _ the _ _ the same route.";
FAMILIES.verb_tense[2].frame = "Choose the correct form: _ _ _ the results.";
FAMILIES.verb_tense[3].frame = "Choose the correct form: By the time _ arrived, the crew _ already _ the job.";
FAMILIES.verb_tense[4].frame = "Choose the correct form: The team _ the same method for _";
FAMILIES.comma_use[0].frame = "Which sentence uses commas correctly? (a list of three or more)";
FAMILIES.comma_use[1].frame = "Which sentence uses commas correctly? (a subordinate clause opening the sentence)";
FAMILIES.comma_use[2].frame = "Which sentence uses commas correctly? (an appositive naming a role)";
FAMILIES.comma_use[3].frame = "Which sentence uses commas correctly? (a conjunction joining two clauses)";
FAMILIES.apostrophes[0].frame = "Choose the correct form: the _ (one)";
FAMILIES.apostrophes[1].frame = "Choose the correct form: the _ (more than one)";
FAMILIES.apostrophes[2].frame = "Which is correct? The _ lost _ label.";
FAMILIES.apostrophes[3].frame = "Which sentence is correct?";
FAMILIES.modifiers[0].frame = "Which sentence has no misplaced modifier?";
FAMILIES.modifiers[1].frame = "Which sentence is parallel?";
FAMILIES.modifiers[2].frame = "Where does \"only\" belong to say that nothing besides the _ was _?";
FAMILIES.word_choice[0].frame = "Choose the correct word: The new _ will _ the _";
FAMILIES.word_choice[1].frame = "Choose the correct word: The _ had no _ on the outcome.";
FAMILIES.word_choice[2].frame = "Choose the correct word: We had _ _ than last year.";
FAMILIES.word_choice[3].frame = "Choose the correct word: There was _ _ than last year.";
FAMILIES.word_choice[4].frame = "Choose the correct word: This _ is heavier _ that _";
FAMILIES.word_choice[5].frame = "Choose the correct word: Please _ the _ _";
FAMILIES.transitions[0].frame = "Choose the best transition: _ . ___, _ .";
FAMILIES.transitions[1].frame = "Choose the best transition: _ . ___, _ .";
FAMILIES.transitions[2].frame = "Choose the best transition: _ . ___, _ .";
FAMILIES.transitions[3].frame = "Choose the best transition: The forecast called for rain. ___, we moved the _ to _";
FAMILIES.transitions[4].frame = "Choose the best transition: _ . ___, _ .";
FAMILIES.transitions[5].frame = "Choose the best transition: The _ counted the _ . ___, they counted the _ .";
FAMILIES.act_rhetoric[0].frame = "A paragraph about _ ends with a sentence about _. The writer should";
FAMILIES.act_rhetoric[1].frame = "Which revision is most concise without losing meaning?";
FAMILIES.act_rhetoric[2].frame = "A writer wants to emphasize that the change was immediate. Which phrasing is best?";
FAMILIES.act_rhetoric[3].frame = "A paragraph describes _ as _. The writer wants to add one sentence of evidence. The best choice is";
FAMILIES.act_rhetoric[4].frame = "A writer has two paragraphs: one on _ and one on _. Which sentence best opens the second?";
FAMILIES.act_rhetoric[5].frame = "A writer wants to concede a drawback without abandoning the argument. Which is best?";
FAMILIES.act_science[0].frame = "Study 1: as temperature rose, the _ rose then fell. It was highest at about";
FAMILIES.act_science[1].frame = "A table shows _ at four levels of rain. The data best support that";
FAMILIES.act_science[2].frame = "Two scientists disagree about a _. One blames _; the other blames _. Which finding would best support B?";
FAMILIES.act_science[3].frame = "A researcher reports a correlation of _ between _ and _. The best interpretation is that";
