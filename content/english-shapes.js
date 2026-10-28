/**
 * English question shapes: the same rules asked in genuinely different ways.
 *
 * The census behind this file found the real problem with the question bank. Not
 * that it was small — `word_choice` alone renders 1,405 distinct strings — but
 * that it was *narrow*. A family is one idea wearing many nouns: "which word is
 * the adjective?" with a different adjective is still one question, and a learner
 * meets it nine times in a level and once a level for forty levels.
 *
 * So the unit here is the **shape**: a different task performed on the same
 * material. Spotting a word is not the same task as choosing between two words in
 * a sentence, which is not the same as repairing one that is broken. Each family
 * below has a `frame`, which is the constant part of the question and what the
 * repeat metric and the picker both measure — so a family can be used once, and
 * then the generator is forced to reach for a different task rather than a
 * different noun.
 *
 * Two rules when adding one, unchanged from english-families.js:
 *
 *   The rule lives in the template. A slot that could change which answer is
 *   right does not belong in that slot.
 *
 *   Distractors are built, not listed — each wrong option is a named mistake, so
 *   a learner can be told why it is wrong rather than only that it is.
 *
 * And three that the first version of this file broke, every one of them in
 * every rendering, which `scripts/english-template-audit.js` now checks:
 *
 *   A slot is used the way its bank is written. PLACES_PREP already carries its
 *   preposition ("under the counter"), so "at the ${place}" reads "at the under
 *   the counter"; PLACES already carries its article. A verb in a sentence takes
 *   the form its subject needs — `verb.s` after one person, never `verb.base`.
 *
 *   The grader forgives case, commas and the final mark (services/grading.js), so
 *   a question about a capital letter or a comma cannot be a type-in: copying the
 *   broken sentence would be marked right. Those are multiple choice.
 *
 *   Two slots from one bank are drawn apart (`other`), or a list reads "books,
 *   books, and books".
 */
const V = require('./vocab');
const { spread } = require('./pool');

const decap = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const an = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const firstWord = (phrase) => phrase.split(' ')[0];
const lastWord = (phrase) => phrase.split(' ').pop();
const afterFirst = (phrase) => phrase.split(' ').slice(1).join(' ');

/** A slot drawn from `bank`, never equal to the slots already filled under `taken`. */
const other = (bank, ...taken) => (rng, out) => rng.pick(bank.filter((v) => !taken.some((t) => out[t] === v)));

const FAMILIES = {
  // ── parts of speech ──────────────────────────────────────────────────────
  // The existing families all ask the learner to *name* a word's class. These
  // ask them to use the class, which is the harder half of the skill and cannot
  // be answered from the answer position.
  parts_of_speech: [
    {
      d: 2,
      frame: 'which word in this sentence does the work of a verb',
      slots: { name: V.NAMES, place: V.PLACES_PREP_PERSON, verb: V.VERBS_INTRANSITIVE },
      p: (s) => `In "${s.name} ${s.verb.past} ${s.place} until closing," one word is a verb. Which one?`,
      c: (s) => [s.verb.past, s.name, lastWord(s.place), 'until'],
      a: (s) => s.verb.past,
      r: (s) => `"${s.verb.past}" is the action. ${s.name} is who did it, and "${s.place}" says where.`,
    },
    {
      d: 4,
      frame: 'replace the word with one that keeps the sentence meaning',
      slots: {
        adj: V.ADJECTIVES_THING,
        alt: other(V.ADJECTIVES_THING, 'adj'),
        noun: V.NOUNS_SMALL,
        adv: V.ADVERBS,
        verb: V.VERBS_OBJECT,
      },
      // Multiple choice, not a type-in: any adjective is a right answer, and the
      // grader can only match a fixed string. Asking which of four words could
      // take the adjective's place keeps the task — use the class — and has one key.
      p: (s) => `"The ${s.adj} ${s.noun} arrived late." Which word could replace "${s.adj}" and still leave a correct sentence?`,
      c: (s) => [s.alt, s.adv, s.verb.s, 'beneath'],
      a: (s) => s.alt,
      r: (s) => `"${s.alt}" is an adjective, so it can describe the ${s.noun} the way "${s.adj}" did.`
        + ` "${s.adv}" is an adverb, "${s.verb.s}" is a verb and "beneath" is a preposition, and none of`
        + ' them can sit there.',
    },
    {
      d: 5,
      frame: 'which noun in this sentence is the object of the verb',
      slots: { role: V.ROLES_PLURAL, verb: V.VERBS_TRANSITIVE },
      p: (s) => `"The ${s.role} ${s.verb.past} ${s.verb.obj} after lunch." Which words receive the action?`,
      c: (s) => [s.verb.obj, `the ${s.role}`, s.verb.past, 'after lunch'],
      a: (s) => s.verb.obj,
      r: (s) => `A verb's object is what it acts on. The ${s.role} ${s.verb.past} something, and that`
        + ` something is ${s.verb.obj}.`,
    },
    {
      d: 6,
      frame: 'which word in this sentence is an adjective',
      slots: { name: V.NAMES, verb: V.VERBS_OBJECT, adj: V.ADJECTIVES_THING, noun: V.NOUNS_SMALL, adv: V.ADVERBS },
      p: (s) => `"${s.name} ${s.verb.past} the ${s.adj} ${s.noun} ${s.adv} yesterday." Which word describes a noun?`,
      c: (s) => [s.adj, s.adv, s.verb.past, 'yesterday'],
      a: (s) => s.adj,
      r: (s) => `"${s.adj}" describes the ${s.noun}, so it is an adjective. "${s.adv}" describes how`
        + ` ${s.name} ${s.verb.past} it, so it is an adverb.`,
    },
    {
      d: 7,
      frame: 'which word in this sentence is a conjunction',
      slots: { name: V.NAMES, verb: V.VERBS_TRANSITIVE },
      p: (s) => `"${s.name} ${s.verb.past} ${s.verb.obj} and then left." Which word joins two actions?`,
      c: (s) => ['and', s.name, s.verb.past, 'left'],
      a: () => 'and',
      r: () => 'A conjunction joins two parts of a sentence; "and" joins two actions here.',
    },
    {
      d: 8,
      frame: 'which word in this sentence is a preposition',
      slots: { name: V.NAMES, place: V.PLACES_PREP_PERSON, verb: V.VERBS_INTRANSITIVE },
      p: (s) => `"${s.name} ${s.verb.past} ${s.place}." Which word is a preposition?`,
      c: (s) => [firstWord(s.place), s.name, s.verb.past, lastWord(s.place)],
      a: (s) => firstWord(s.place),
      r: (s) => `"${firstWord(s.place)}" takes "${afterFirst(s.place)}" after it and answers "where?",`
        + ' which is what a preposition does.',
    },
  ],

  // ── subject-verb agreement ────────────────────────────────────────────────
  // The existing families are almost all "pick are or is". These require the
  // learner to find the verb and then justify it, or to repair a broken
  // sentence, which is a different task with the same rule underneath.
  subject_verb: [
    {
      d: 2,
      frame: 'complete the sentence with the correct verb',
      slots: { name: V.NAMES, place: V.PLACES },
      format: 'type_in',
      // The tense is named, because "went" is also a correct form of "go" and the
      // rule being tested is agreement, not tense.
      p: (s) => `Complete with the present tense of "go": "${s.name} and two friends ___ to ${s.place} every Saturday."`,
      a: () => 'go',
      r: (s) => `The subject is "${s.name} and two friends", which is plural, so the verb is "go", not "goes".`,
    },
    {
      d: 3,
      frame: 'which subject takes a plural verb',
      slots: { noun: V.NOUNS_PLURAL, name: V.NAMES },
      p: () => 'Which subject needs a plural verb?',
      c: (s) => [s.name, `the ${s.noun}`, 'Either one', 'Neither one'],
      a: (s) => `the ${s.noun}`,
      r: (s) => `"The ${s.noun}" names more than one thing, so it takes a plural verb; ${s.name} is one person.`,
    },
    {
      d: 4,
      frame: 'choose the verb that agrees with the subject',
      slots: { role: V.ROLES_SINGULAR, place: V.PLACES },
      p: (s) => `"The ${s.role} at ${s.place} ___ early every week." Which verb agrees?`,
      c: () => ['arrives', 'arrive', 'arriving', 'to arrive'],
      a: () => 'arrives',
      r: (s) => `One ${s.role} is singular, so the verb takes the -s: "arrives".`,
    },
    {
      d: 5,
      frame: 'fix the agreement error in this sentence',
      slots: { role: V.ROLES_SINGULAR, verb: V.VERBS_TRANSITIVE },
      format: 'type_in',
      p: (s) => `Fix the verb: "The ${s.role} ${s.verb.base} ${s.verb.obj} every week."`,
      a: (s) => `The ${s.role} ${s.verb.s} ${s.verb.obj} every week.`,
      x: (s) => [s.verb.s, `The ${s.role} ${s.verb.s}`],
      r: (s) => `"The ${s.role}" is one person, so the verb needs the -s: "${s.verb.s}".`,
    },
    {
      d: 6,
      frame: 'which sentence is correct',
      slots: { role: V.ROLES_SINGULAR },
      p: () => 'Which sentence is correct?',
      c: (s) => [
        `The ${s.role} is here.`,
        `The ${s.role} are here.`,
        `The ${s.role} been here.`,
        `The ${s.role} being here.`,
      ],
      a: (s) => `The ${s.role} is here.`,
      r: (s) => `A single ${s.role} takes "is", not "are"; "been" and "being" cannot be the verb on their own.`,
    },
    {
      d: 7,
      frame: 'which phrase has a plural subject',
      slots: { noun: V.NOUNS_PLURAL },
      p: () => 'Which subject takes a plural verb?',
      c: (s) => [
        `Several of the ${s.noun}`,
        `A list of the ${s.noun}`,
        `One of the ${s.noun}`,
        `Each of the ${s.noun}`,
      ],
      a: (s) => `Several of the ${s.noun}`,
      r: (s) => `"Several" means more than one, so "several of the ${s.noun}" takes a plural verb. "A list",`
        + ` "one" and "each" are singular, and "the ${s.noun}" after them only sits in a phrase.`,
    },
    {
      d: 8,
      frame: 'choose the verb that agrees with an intervening phrase',
      slots: { noun: V.NOUNS_SMALL, role: V.ROLES_PLURAL },
      p: (s) => `"The ${s.noun} belonging to the ${s.role} ___ in the office." Which verb agrees?`,
      // "has been" was an option here and agrees with a singular subject just as
      // well as "is" does; every distractor now disagrees with it.
      c: () => ['is', 'are', 'were', 'have been'],
      a: () => 'is',
      r: (s) => `The subject is the ${s.noun}, which is singular; "the ${s.role}" sits inside the phrase`
        + ` "belonging to the ${s.role}" and does not change the verb.`,
    },
  ],

  // ── end punctuation ──────────────────────────────────────────────────────
  // Every existing family in this skill shows four sentences and asks which is
  // punctuated correctly, with the prompt identical every time. These vary the
  // task: repair one, choose the mark, or say what a mark is doing.
  punctuation_basic: [
    {
      d: 2,
      frame: 'which mark belongs at the end of this question',
      slots: { name: V.NAMES, verb: V.VERBS_TRANSITIVE },
      p: (s) => `What mark finishes this sentence? "Did ${s.name} ${s.verb.base} ${s.verb.obj}"`,
      c: () => ['.', '?', '!', ','],
      a: () => '?',
      r: () => 'It begins with "Did" and asks something, so it takes a question mark.',
    },
    {
      d: 3,
      frame: 'add the missing capital letter',
      slots: { name: V.NAMES, place: V.PLACES },
      p: (s) => `Which word needs a capital letter? "${decap(s.name)} went to ${s.place} after work."`,
      c: (s) => [decap(s.name), 'went', lastWord(s.place), 'work'],
      a: (s) => decap(s.name),
      r: (s) => `"${s.name}" is a name, and it also starts the sentence, so it takes a capital: ${s.name}.`,
    },
    {
      d: 4,
      frame: 'which sentence is punctuated correctly',
      slots: { name: V.NAMES },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => {
        const right = `${s.name} asked whether the office was open.`;
        return [
          right,
          right.replace('asked', 'asked,'),
          decap(right),
          `${s.name} asked whether the office was open?`,
        ];
      },
      a: (s) => `${s.name} asked whether the office was open.`,
      r: () => 'An indirect question is a statement, so it takes a full stop and no comma before the clause.',
    },
    {
      d: 5,
      frame: 'choose the mark that ends this sentence',
      slots: { name: V.NAMES, verb: V.VERBS_OBJECT },
      p: (s) => `"${s.name} ${s.verb.past} the parcel in the rain" — which mark ends it?`,
      c: () => ['.', '!', '?', ':'],
      a: () => '.',
      r: () => 'It is a plain statement, so it takes a full stop.',
    },
    {
      d: 6,
      frame: 'which sentence needs no comma',
      slots: { name: V.NAMES, verb: V.VERBS_OBJECT },
      p: () => 'Which sentence is written correctly?',
      c: (s) => [
        `${s.name} ${s.verb.past} the parcel in the rain.`,
        `${s.name}, ${s.verb.past} the parcel in the rain.`,
        `${s.name} ${s.verb.past}, the parcel in the rain.`,
        `${s.name} ${s.verb.past} the parcel, in the rain.`,
      ],
      a: (s) => `${s.name} ${s.verb.past} the parcel in the rain.`,
      r: () => 'A plain subject, verb and object takes no commas at all.',
    },
    {
      d: 7,
      frame: 'write the sentence with the capital added',
      slots: { name: V.NAMES, city: V.CITIES },
      p: () => 'Which version has every capital letter it needs?',
      c: (s) => [
        `${s.name} flew to ${s.city} on Tuesday.`,
        `${s.name} flew to ${decap(s.city)} on Tuesday.`,
        `${s.name} flew to ${s.city} on tuesday.`,
        `${decap(s.name)} flew to ${s.city} on Tuesday.`,
      ],
      a: (s) => `${s.name} flew to ${s.city} on Tuesday.`,
      r: (s) => `A name, a city and a day all take capitals: ${s.name}, ${s.city}, Tuesday.`,
    },
  ],

  // ── commas ───────────────────────────────────────────────────────────────
  // The existing comma families are four near-identical "which sentence uses
  // commas correctly" questions, one of which is 96% of all renderings. These
  // each put the comma somewhere different and ask a different question about it.
  comma_use: [
    {
      d: 2,
      frame: 'add the missing comma in a list of three',
      slots: {
        a: V.NOUNS_PLURAL,
        b: other(V.NOUNS_PLURAL, 'a'),
        c: other(V.NOUNS_PLURAL, 'a', 'b'),
        place: V.PLACES,
      },
      p: (s) => `Where do the commas go? "We packed ${s.a} ${s.b} and ${s.c} for ${s.place}."`,
      c: (s) => [
        `We packed ${s.a}, ${s.b}, and ${s.c} for ${s.place}.`,
        `We packed ${s.a} ${s.b}, and ${s.c} for ${s.place}.`,
        `We packed, ${s.a}, ${s.b}, and ${s.c} for ${s.place}.`,
        `We packed ${s.a}, ${s.b}, and, ${s.c} for ${s.place}.`,
      ],
      a: (s) => `We packed ${s.a}, ${s.b}, and ${s.c} for ${s.place}.`,
      r: (s) => `Commas separate the items in a list: one after "${s.a}" and, in this style, one before the`
        + ' final "and". None belongs after "packed" or after "and".',
    },
    {
      d: 3,
      frame: 'which sentence needs a comma after the opening word',
      slots: { name: V.NAMES, place: V.PLACES_PREP_PERSON },
      p: () => 'Which sentence uses commas correctly?',
      c: (s) => {
        const right = `${s.name}, tired from the climb, waited ${s.place}.`;
        return [
          right,
          `${s.name} tired from the climb waited ${s.place}.`,
          right.replace('waited', 'waited,'),
          decap(right),
        ];
      },
      a: (s) => `${s.name}, tired from the climb, waited ${s.place}.`,
      r: () => 'A phrase that interrupts between the subject and its verb, like "tired from the climb", is set'
        + ' off by a comma on each side.',
    },
    {
      d: 4,
      frame: 'remove the comma that does not belong',
      slots: { name: V.NAMES, noun: V.NOUNS_SMALL, place: V.PLACES_PREP_PUT },
      p: (s) => `One comma here does not belong: "The ${s.noun} ${s.place}, belongs to ${s.name}." Which version is correct?`,
      c: (s) => [
        `The ${s.noun} ${s.place} belongs to ${s.name}.`,
        `The ${s.noun} ${s.place}, belongs to ${s.name}.`,
        `The ${s.noun}, ${s.place} belongs to ${s.name}.`,
        `The ${s.noun} ${s.place} belongs, to ${s.name}.`,
      ],
      a: (s) => `The ${s.noun} ${s.place} belongs to ${s.name}.`,
      r: (s) => `"The ${s.noun} ${s.place}" is the whole subject, and a subject is never split from its verb`
        + ' by a single comma.',
    },
    {
      d: 5,
      frame: 'choose the sentence that uses a comma correctly',
      slots: { role: V.ROLES_SINGULAR, place: V.PLACES_PREP_PERSON },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => [
        `The ${s.role}, who arrived first, waited ${s.place}.`,
        `The ${s.role} who arrived first, waited ${s.place}.`,
        `The ${s.role}, who arrived first waited ${s.place}.`,
        `The ${s.role}, who arrived first, waited, ${s.place}.`,
      ],
      a: (s) => `The ${s.role}, who arrived first, waited ${s.place}.`,
      r: () => 'Added as extra information, "who arrived first" takes a comma on both sides; one comma on its'
        + ' own splits the subject from its verb.',
    },
    {
      d: 6,
      frame: 'place the comma before the joining word',
      slots: { trade: V.TRADEOFFS },
      // A contrast, so "but" is the right joining word for the two clauses.
      p: (s) => `One comma is needed: "${s.trade.good} but ${s.trade.bad}." Which version places it correctly?`,
      c: (s) => [
        `${s.trade.good}, but ${s.trade.bad}.`,
        `${s.trade.good} but, ${s.trade.bad}.`,
        `${s.trade.good}, but, ${s.trade.bad}.`,
        `${s.trade.good} but ${firstWord(s.trade.bad)}, ${afterFirst(s.trade.bad)}.`,
      ],
      a: (s) => `${s.trade.good}, but ${s.trade.bad}.`,
      r: () => 'When "but" joins two complete clauses, the comma goes before it, not after it.',
    },
    {
      d: 7,
      frame: 'which sentence needs a comma before its list',
      slots: { role: V.ROLES_PLURAL, a: V.NOUNS_PLURAL, b: other(V.NOUNS_PLURAL, 'a') },
      p: () => 'Which sentence is punctuated correctly?',
      c: (s) => [
        `The ${s.role} brought ${s.a}, ${s.b} and a map.`,
        `The ${s.role} brought ${s.a} ${s.b} and a map.`,
        `The ${s.role}, brought ${s.a}, ${s.b} and a map.`,
        `The ${s.role} brought, ${s.a} ${s.b} and a map.`,
      ],
      a: (s) => `The ${s.role} brought ${s.a}, ${s.b} and a map.`,
      r: () => 'The comma separates items in a list; it does not belong after the verb or the subject.',
    },
  ],

  // ── modifiers ────────────────────────────────────────────────────────────
  // Three families, one of which is 1,728 renderings of a single -ing list. These
  // ask for the misplaced word itself, which is the skill the lesson names.
  modifiers: [
    {
      d: 4,
      frame: 'which word is misplaced in this sentence',
      slots: { role: V.ROLES_SINGULAR, noun: V.NOUNS_SMALL, place: V.PLACES },
      p: (s) => `"Running to ${s.place}, the ${s.role}'s ${s.noun} fell out of the bag." Which part is the misplaced modifier?`,
      c: (s) => [`Running to ${s.place}`, `the ${s.role}'s ${s.noun}`, 'fell out of the bag', 'None; the sentence is correct'],
      a: (s) => `Running to ${s.place}`,
      r: (s) => `An opening phrase describes the subject right after it, and here that subject is the ${s.noun}`
        + ` — so the sentence says the ${s.noun} was running. The ${s.role} has to come first:`
        + ` "Running to ${s.place}, the ${s.role} dropped the ${s.noun}."`,
    },
    {
      d: 5,
      frame: 'which word is misplaced in a list of participles',
      slots: {
        role: V.ROLES_PLURAL,
        a: V.VERBS_TRANSITIVE,
        b: other(V.VERBS_TRANSITIVE, 'a'),
        c: other(V.VERBS_TRANSITIVE, 'a', 'b'),
      },
      p: (s) => `"The ${s.role} ${s.a.past} ${s.a.obj}, ${s.b.past} ${s.b.obj} and ${s.c.ing} ${s.c.obj}." Which word breaks the pattern?`,
      c: (s) => [s.c.ing, s.a.past, s.b.past, 'and'],
      a: (s) => s.c.ing,
      r: (s) => `The list runs "${s.a.past}", "${s.b.past}", so the last verb has to match: "${s.c.past}".`
        + ` "${s.c.ing}" is the one out of step.`,
    },
    {
      d: 6,
      frame: 'move the word to where it belongs',
      slots: { role: V.ROLES_SINGULAR, noun: V.NOUNS_PLURAL, verb: V.VERBS_OBJECT },
      p: (s) => `The ${s.role} ${s.verb.past} most of the ${s.noun}, but not all. Which sentence puts "almost" where it says that?`,
      c: (s) => [
        `The ${s.role} ${s.verb.past} almost all of the ${s.noun}.`,
        `The ${s.role} almost ${s.verb.past} all of the ${s.noun}.`,
        `Almost the ${s.role} ${s.verb.past} all of the ${s.noun}.`,
        `The ${s.role} ${s.verb.past} all of the almost ${s.noun}.`,
      ],
      a: (s) => `The ${s.role} ${s.verb.past} almost all of the ${s.noun}.`,
      r: (s) => `"Almost" limits the words right after it. "Almost all of the ${s.noun}" means most of them;`
        + ` "almost ${s.verb.past}" would mean the ${s.role} came close to doing it and did not.`,
    },
    {
      d: 7,
      frame: 'which word in this sentence is modifying the wrong noun',
      slots: { adj: V.ADJECTIVES_THING, noun: V.NOUNS_SMALL, role: V.ROLES_PLURAL },
      p: (s) => `The writer means the ${s.noun} was ${s.adj}: "The ${s.role} carried ${an(s.noun)} to the car that`
        + ` was ${s.adj}." Which part is misplaced?`,
      c: (s) => [`that was ${s.adj}`, `The ${s.role}`, 'carried', 'to the car'],
      a: (s) => `that was ${s.adj}`,
      r: (s) => `"that was ${s.adj}" sits right after "the car", so it reads as describing the car. To describe`
        + ` the ${s.noun} it belongs next to it: "carried ${an(s.noun)} that was ${s.adj} to the car".`,
    },
    {
      d: 8,
      frame: 'repair the parallel structure',
      slots: { role: V.ROLES_PLURAL, a: V.VERBS_TRANSITIVE, b: other(V.VERBS_TRANSITIVE, 'a') },
      format: 'type_in',
      p: (s) => `Fix the parallelism: "The ${s.role} decided to ${s.a.base} ${s.a.obj}, ${s.b.ing} ${s.b.obj} and to leave early."`,
      a: (s) => `The ${s.role} decided to ${s.a.base} ${s.a.obj}, ${s.b.base} ${s.b.obj} and leave early.`,
      x: (s) => [
        `The ${s.role} decided to ${s.a.base} ${s.a.obj}, ${s.b.base} ${s.b.obj} and leave early.`,
        `The ${s.role} decided to ${s.a.base} ${s.a.obj}, to ${s.b.base} ${s.b.obj} and to leave early.`,
      ],
      r: (s) => 'Every item in the list takes the same form: one "to" in front of the whole list'
        + ` ("to ${s.a.base} ..., ${s.b.base} ... and leave early") or a "to" before each item.`
        + ` "${s.b.ing}" fits neither.`,
    },
  ],

  // ── commonly confused words ───────────────────────────────────────────────
  // The most literal version of the complaint: six families, six single words,
  // and three of them with a fixed choice set, so a learner can answer without
  // reading. These are the skill the lesson actually names — choosing between two
  // words in a sentence, which needs the sentence read.
  word_choice: [
    {
      d: 3,
      frame: 'choose between their and theyre',
      slots: { role: V.ROLES_PLURAL },
      p: (s) => `Complete the sentence: "The ${s.role} left ___ coats on the chairs."`,
      c: () => ['their', "they're", 'there', 'theirs'],
      a: () => 'their',
      r: () => '"Their" shows who something belongs to; "they\'re" means they are, and "theirs" stands without a noun.',
    },
    {
      d: 4,
      frame: 'choose between affect and effect',
      slots: { name: V.NAMES },
      p: (s) => `Complete: "The weather will ___ ${s.name}'s match."`,
      c: () => ['affect', 'effect', 'affects', 'effects'],
      a: () => 'affect',
      r: () => '"Affect" is the verb and takes the object; "effect" is usually the noun.',
    },
    {
      d: 5,
      frame: 'choose between fewer and less',
      slots: { noun: V.NOUNS_PLURAL },
      p: (s) => `Complete: "We have ___ ${s.noun} than the other team."`,
      c: () => ['fewer', 'less', 'lesser', 'fewest'],
      a: () => 'fewer',
      r: (s) => `"${s.noun}" is a count noun here, and count nouns take "fewer".`,
    },
    {
      d: 6,
      frame: 'choose between than and then',
      slots: { name: V.NAMES, role: V.ROLES_SINGULAR },
      p: (s) => `Complete: "${s.name} arrived earlier ___ the ${s.role}."`,
      c: () => ['then', 'than', 'their', 'there'],
      a: () => 'than',
      r: () => 'Comparing two things takes "than"; "then" is a time word.',
    },
    {
      d: 7,
      frame: 'choose between its and its with the apostrophe',
      slots: { group: ['team', 'squad', 'side', 'crew'], spell: ['second half', 'final quarter', 'last ten minutes', 'closing stages'] },
      p: (s) => `Complete: "The ${s.group} lost ___ momentum in the ${s.spell}."`,
      c: () => ['its', "it's", "its'", 'it has'],
      a: () => 'its',
      r: () => '"Its" is the possessive; "it\'s" is short for it is or it has.',
    },
    {
      d: 8,
      frame: 'choose between lay and lie',
      slots: { noun: V.NOUNS_SMALL, place: V.PLACES_PREP_PUT },
      p: (s) => `Complete: "Yesterday they ___ the ${s.noun} down ${s.place}."`,
      c: () => ['laid', 'lay', 'lied', 'layed'],
      a: () => 'laid',
      r: (s) => `"Lay" takes an object — here the ${s.noun} — and its past tense is "laid". "Lay" on its own is`
        + ' the past of "lie", which takes no object.',
    },
    {
      d: 8,
      frame: 'choose between whose and whos',
      slots: { role: V.ROLES_SINGULAR },
      p: (s) => `Complete: "The ${s.role} ___ name was on the letter has left."`,
      c: () => ['whose', "who's", 'who', 'whom'],
      a: () => 'whose',
      r: (s) => `"Whose" shows that the name belongs to the ${s.role}; "who's" is short for who is.`,
    },
  ],

  // ── fragments and run-ons ────────────────────────────────────────────────
  // The run-on family has eight renderings. These are all about *finding* the
  // fault, which is a different act from choosing between two whole sentences.
  sentence_struct: [
    {
      d: 3,
      frame: 'identify the fragment in this sentence',
      slots: { name: V.NAMES, role: V.ROLES_SINGULAR },
      p: (s) => `"${s.name} missed the bus. Because the ${s.role} was late." Which part is a fragment?`,
      c: (s) => [`Because the ${s.role} was late`, `${s.name} missed the bus`, 'Both parts', 'Neither part'],
      a: (s) => `Because the ${s.role} was late`,
      r: (s) => 'A clause that starts with "because" cannot stand alone; it needs a main clause, as in'
        + ` "${s.name} missed the bus because the ${s.role} was late."`,
    },
    {
      d: 4,
      frame: 'fix the run-on by naming the missing mark',
      slots: { event: V.EVENTS },
      // Multiple choice: the grader ignores commas, so a typed fix that only adds
      // one would be indistinguishable from the run-on itself.
      p: (s) => `Which fixes the run-on "${cap(s.event.cause)} ${s.event.effect}."?`,
      c: (s) => [
        `${cap(s.event.cause)}, so ${s.event.effect}.`,
        `${cap(s.event.cause)}, ${s.event.effect}.`,
        `${cap(s.event.cause)} so, ${s.event.effect}.`,
        `${cap(s.event.cause)} ${s.event.effect}.`,
      ],
      a: (s) => `${cap(s.event.cause)}, so ${s.event.effect}.`,
      r: () => 'Two complete clauses need a comma with a joining word such as "so", a semicolon, or a full stop'
        + ' between them; a comma alone is a comma splice.',
    },
    {
      d: 5,
      frame: 'which sentence is complete',
      slots: { name: V.NAMES, place: V.PLACES_PREP_PERSON },
      p: () => 'Which sentence is complete?',
      c: (s) => [
        `${s.name} waited ${s.place}.`,
        `Waiting ${s.place}.`,
        `Because ${s.name} waited ${s.place}.`,
        `${cap(s.place)}, waiting.`,
      ],
      a: (s) => `${s.name} waited ${s.place}.`,
      r: () => 'A complete sentence has a subject and a verb and stands alone.',
    },
    {
      d: 6,
      frame: 'join the two halves with the right mark',
      slots: { name: V.NAMES, noun: V.NOUNS_SMALL },
      format: 'type_in',
      p: (s) => `Join these into one sentence using "that": "${s.name} found the ${s.noun}. The ${s.noun} had been missing for a week."`,
      a: (s) => `${s.name} found the ${s.noun} that had been missing for a week.`,
      x: (s) => [`${s.name} found the ${s.noun} which had been missing for a week.`],
      r: (s) => `The second sentence describes the ${s.noun}, so it can become a clause right after it:`
        + ` "the ${s.noun} that had been missing for a week".`,
    },
    {
      d: 7,
      frame: 'find the dangling participle',
      slots: { role: V.ROLES_SINGULAR, place: V.PLACES },
      p: (s) => `"Walking to ${s.place}, the parcel slipped from the ${s.role}'s hands." What is wrong?`,
      c: () => [
        'It says the parcel was walking',
        'The verb should be in the present tense',
        'A comma is missing after "parcel"',
        'Nothing; the sentence is correct',
      ],
      a: () => 'It says the parcel was walking',
      r: (s) => 'An opening participle attaches to the subject that follows it. Here that is the parcel, so the'
        + ` sentence says the parcel was walking; the ${s.role} should be the subject.`,
    },
  ],

  // ── verb tense ───────────────────────────────────────────────────────────
  // Five families, five consecutive one-step tenses, and no negation, no
  // reporting verbs, no real conditionals. These are the forms a learner
  // actually has trouble with.
  verb_tense: [
    {
      d: 4,
      frame: 'choose the verb in reported speech',
      slots: { pair: V.NAME_PAIRS },
      p: (s) => `${s.pair[0]} and ${s.pair[1]} said, "We are tired." Which version reports it with the tense moved back?`,
      c: (s) => [
        `${s.pair[0]} and ${s.pair[1]} said they are tired.`,
        `${s.pair[0]} and ${s.pair[1]} said they were tired.`,
        `${s.pair[0]} and ${s.pair[1]} said they will be tired.`,
        `${s.pair[0]} and ${s.pair[1]} said they had been tired.`,
      ],
      a: (s) => `${s.pair[0]} and ${s.pair[1]} said they were tired.`,
      r: () => 'Reported after a past verb like "said", the present "are" moves one step back: "were".',
    },
    {
      d: 5,
      frame: 'choose the tense for a conditional',
      slots: { name: V.NAMES, verb: V.VERBS_TRANSITIVE },
      p: (s) => `Complete the first conditional: "If it rains tomorrow, ${s.name} ___ ${s.verb.obj} at home."`,
      c: (s) => [`will ${s.verb.base}`, s.verb.past, `would ${s.verb.base}`, `has ${s.verb.pp}`],
      a: (s) => `will ${s.verb.base}`,
      r: () => 'A first conditional pairs "if" and the present ("rains") with "will" and the verb.',
    },
    {
      d: 5,
      frame: 'choose the tense to match a time marker',
      slots: { name: V.NAMES, verb: V.VERBS_INTRANSITIVE },
      p: (s) => `"${s.name} ___ (${s.verb.base}) for two hours now." Which form fits?`,
      // "has waited" also fits "for two hours"; every distractor here is a form
      // that cannot sit with "for two hours now".
      c: (s) => [`has been ${s.verb.ing}`, `was ${s.verb.ing}`, `will be ${s.verb.ing}`, `is ${s.verb.ing}`],
      a: (s) => `has been ${s.verb.ing}`,
      r: (s) => 'Something that started in the past and is still going on, with "for" and a length of time,'
        + ` takes the present perfect continuous: "has been ${s.verb.ing}".`,
    },
    {
      d: 6,
      frame: 'negate the sentence',
      slots: { role: V.ROLES_PLURAL, verb: V.VERBS_TRANSITIVE },
      format: 'type_in',
      p: (s) => `Negate it: "The ${s.role} ${s.verb.past} ${s.verb.obj}."`,
      a: (s) => `The ${s.role} did not ${s.verb.base} ${s.verb.obj}.`,
      x: (s) => [`The ${s.role} didn't ${s.verb.base} ${s.verb.obj}.`],
      r: (s) => `A simple past negative takes "did not" and the bare verb: "did not ${s.verb.base}".`,
    },
    {
      d: 6,
      frame: 'choose the tense for a third conditional',
      slots: { pair: V.NAME_PAIRS },
      p: (s) => `Complete the third conditional: "If ${s.pair[0]} and ${s.pair[1]} had trained harder, they ___ (win) the final last year."`,
      c: () => ['would win', 'will win', 'would have won', 'had won'],
      a: () => 'would have won',
      r: () => 'A past hypothetical takes "would have" plus the past participle.',
    },
    {
      d: 7,
      frame: 'keep the tense consistent through the sentence',
      slots: { name: V.NAMES, verb: V.VERBS_TRANSITIVE },
      format: 'type_in',
      p: (s) => `Fix the tense: "Yesterday ${s.name} ${s.verb.s} ${s.verb.obj}, and tomorrow ${s.name} will ${s.verb.base}`
        + ` ${s.verb.pro} again." What should replace "${s.verb.s}"?`,
      a: (s) => s.verb.past,
      x: (s) => [`Yesterday ${s.name} ${s.verb.past} ${s.verb.obj}, and tomorrow ${s.name} will ${s.verb.base} ${s.verb.pro} again.`],
      r: (s) => `"Yesterday" puts the first action in the past, so it takes the simple past "${s.verb.past}";`
        + ' the "tomorrow" half keeps "will".',
    },
    {
      d: 8,
      frame: 'choose the verb form after a modal',
      slots: { role: V.ROLES_SINGULAR },
      p: (s) => `"The ${s.role} should ___ (go) now." Which form?`,
      c: () => ['go', 'went', 'going', 'gone'],
      a: () => 'go',
      r: () => 'A modal takes the bare infinitive, with no "to" and no ending.',
    },
  ],

  // ── transitions ──────────────────────────────────────────────────────────
  // Two of the existing families answer "Even so" and four share a distractor
  // pool, so six of the twelve answers are guessable. These draw their
  // distractors from the sentence rather than from a fixed list.
  transitions: [
    {
      d: 3,
      frame: 'choose the transition that shows a result',
      slots: { event: V.EVENTS },
      p: (s) => `Complete: "${cap(s.event.cause)}. ___ ${s.event.effect}."`,
      c: () => ['As a result,', 'In contrast,', 'For example,', 'Nevertheless,'],
      a: () => 'As a result,',
      r: () => 'The second sentence is what the first one caused, so the link is "as a result" — not a contrast'
        + ' or an example.',
    },
    {
      d: 5,
      frame: 'choose the transition that shows a contrast',
      slots: { trade: V.TRADEOFFS },
      p: (s) => `Complete: "${s.trade.good}. ___ ${s.trade.bad}."`,
      c: () => ['On the other hand,', 'For this reason,', 'In the first place,', 'As a result,'],
      a: () => 'On the other hand,',
      r: () => 'A good point followed by a drawback is a contrast, and "on the other hand" marks one.',
    },
    {
      d: 6,
      frame: 'choose the transition that adds an example',
      slots: { event: V.EVENTS },
      p: (s) => `Complete: "One disruption often leads to another. ___ last year ${s.event.cause}, and ${s.event.effect}."`,
      c: () => ['For example,', 'On the other hand,', 'Nevertheless,', 'In conclusion,'],
      a: () => 'For example,',
      r: () => 'The second sentence is one case of the general claim in the first, which is what an example does.',
    },
    {
      d: 7,
      frame: 'choose the transition that concedes a point',
      slots: { trade: V.TRADEOFFS },
      p: (s) => `Complete: "The plan has real costs. ___ ${decap(s.trade.good)}."`,
      c: () => ['Even so,', 'For that reason,', 'In other words,', 'For example,'],
      a: () => 'Even so,',
      r: () => 'The first sentence admits a drawback and the second still argues for the plan, so the link is a'
        + ' concession: "even so".',
    },
    {
      d: 8,
      frame: 'choose the transition that draws a conclusion',
      slots: { thing: ['pump', 'sensor', 'generator', 'valve', 'heater', 'compressor'] },
      p: (s) => `Complete: "The ${s.thing} failed its first test, its second and its third. ___ it is not ready for use."`,
      c: () => ['Therefore,', 'For example,', 'Meanwhile,', 'On the contrary,'],
      a: () => 'Therefore,',
      r: () => 'The last sentence is what the evidence before it adds up to, so it takes a conclusion word.',
    },
  ],

  // ── pronouns ─────────────────────────────────────────────────────────────
  // Four existing families have a fixed choice set, and two pairs are the same
  // rule twice. These each need a different pronoun *and* a different reason.
  pronoun_case: [
    {
      d: 3,
      frame: 'choose the object pronoun',
      slots: { role: V.ROLES_SINGULAR },
      p: () => 'Complete: "Send the message to ___ when you get a chance."',
      c: () => ['me', 'I', 'my', 'mine'],
      a: () => 'me',
      r: () => 'The word after a preposition is an object, so it is "me" and not "I".',
    },
    {
      d: 4,
      frame: 'choose the possessive for a singular noun',
      slots: { role: V.ROLES_SINGULAR, noun: V.NOUNS_SMALL },
      p: (s) => `Complete: "Every ${s.role} must bring ___ own ${s.noun}."`,
      c: () => ['their', 'theirs', 'them', 'they'],
      a: () => 'their',
      r: (s) => `"Every ${s.role}" means each one without saying who, and "their" is the standard possessive`
        + ' for that; "theirs" stands without a noun after it.',
    },
    {
      d: 5,
      frame: 'choose the subject pronoun before a verb',
      slots: { pair: V.NAME_PAIRS },
      p: (s) => `"${s.pair[0]} and ${s.pair[1]} missed the bus." Replace the names with a pronoun.`,
      c: () => ['They', 'Them', 'Theirs', 'Themselves'],
      a: () => 'They',
      r: () => 'The names are the subject, and the subject pronoun for two people is "they"; "them" belongs after'
        + ' a verb or a preposition.',
    },
    {
      d: 6,
      frame: 'choose the reflexive pronoun',
      slots: { role: V.ROLES_PLURAL, verb: V.VERBS_TRANSITIVE },
      p: (s) => `Complete: "The ${s.role} ${s.verb.past} ${s.verb.obj} by ___."`,
      c: () => ['themselves', 'them', 'they', 'theirs'],
      a: () => 'themselves',
      r: (s) => `Doing something "by" yourself, without help, takes the reflexive form, and for "the ${s.role}"`
        + ' that is "themselves".',
    },
    {
      d: 7,
      frame: 'choose between its and the possessive with the apostrophe',
      slots: { noun: V.NOUNS_PAINTED, place: V.PLACES },
      p: (s) => `Complete: "The ${s.noun} at ${s.place} lost ___ paint."`,
      c: () => ['its', "it's", "its'", 'it has'],
      a: () => 'its',
      r: () => 'The paint belongs to the thing, so it is "its", with no apostrophe.',
    },
  ],
};

module.exports = { FAMILIES: spread(FAMILIES) };
