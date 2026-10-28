/**
 * English items. Grammar and mechanics come from authored pools (a generator
 * cannot invent a comma splice worth arguing about); reading items are drawn
 * from content/passages.js; a few skills are generated procedurally where the
 * pattern is genuinely mechanical.
 */
const { fromPool, entryToItem, pickByDifficulty, shapeKey, forSchool } = require('./pool');
const { questionsForSkill } = require('./passages');
const { questionsForSkill: questionsForSkill2 } = require('./passages-2');
const { choicesFrom } = require('./rng');
const { FAMILIES } = require('./english-families');
// The same rules asked in different ways. A family varies a noun; a shape varies
// the task, which is the only thing that actually makes a question new.
const { FAMILIES: SHAPES } = require('./english-shapes');
const { FAMILIES: PASSAGE_FAMILIES } = require('./passage-families');

/** Matches bank.itemKey; kept local to avoid a circular require. */
const itemKeyOf = (i) => [String(i.prompt || '').trim(), String(i.answer == null ? '' : i.answer).trim(),
  ...(Array.isArray(i.choices) && i.choices.length ? [[...i.choices].map(String).sort().join('')] : [])].join('||');

const POOLS = {
  parts_of_speech: [
    { d: 1, p: 'In "The quiet library closed early," which word is an adjective?', c: ['quiet', 'library', 'closed', 'early'], a: 'quiet', r: 'An adjective describes a noun. "Quiet" describes the library.' },
    { d: 2, p: 'In "She spoke softly to the crowd," which word is an adverb?', c: ['softly', 'spoke', 'crowd', 'the'], a: 'softly', r: 'An adverb can modify a verb (as well as an adjective or another adverb); here "softly" modifies "spoke" by telling how she spoke.' },
    { d: 2, p: 'In "The dog under the porch barked," what is the subject?', c: ['dog', 'porch', 'barked', 'under'], a: 'dog', r: 'The subject is who or what performs the verb. The dog barked; "under the porch" only locates it.' },
    { d: 3, p: 'In "Marcus and his sister built a raft," which word is a conjunction?', c: ['and', 'built', 'his', 'raft'], a: 'and', r: 'A conjunction joins words or groups of words; "and" joins Marcus and his sister.' },
    { d: 4, p: 'In "Running uphill exhausted her," what part of speech is "Running"?', c: ['gerund (noun form of a verb)', 'main verb', 'adjective', 'preposition'], a: 'gerund (noun form of a verb)', r: '"Running" is the subject of the sentence, so the -ing form is working as a noun: a gerund.' },
    { d: 5, p: 'In "The letter, which arrived Tuesday, was unsigned," what does "which arrived Tuesday" do?', c: ['modifies "letter" as a nonessential clause', 'serves as the main clause', 'acts as the sentence’s verb', 'modifies "unsigned"'], a: 'modifies "letter" as a nonessential clause', r: 'It is a relative clause adding nonessential information about the letter, which is why it takes commas.' },
    { d: 6, p: 'In "He is the candidate whom the board endorsed," "whom" functions as', c: ['the object of "endorsed"', 'the subject of "endorsed"', 'a possessive', 'a preposition'], a: 'the object of "endorsed"', r: 'The board endorsed him, so the pronoun is an object and takes the objective form "whom."' },
    { d: 7, p: 'In "To finish early would surprise everyone," the phrase "To finish early" is', c: ['an infinitive phrase acting as the subject', 'a prepositional phrase', 'the main verb', 'an adverbial clause'], a: 'an infinitive phrase acting as the subject', r: '"To finish early" is what would surprise everyone, so the infinitive phrase is the subject.' },
  ],

  subject_verb: [
    { d: 1, p: 'Choose the correct verb: The books ___ on the shelf.', c: ['are', 'is', 'was', 'has been'], a: 'are', r: 'The plural subject "books" takes the plural verb "are."' },
    { d: 2, p: 'Choose the correct verb: My brother and his friends ___ every Sunday.', c: ['practice', 'practices', 'is practicing', 'has practiced'], a: 'practice', r: 'Two subjects joined by "and" form a plural subject, so the verb is plural.' },
    { d: 4, p: 'Choose the correct verb: Each of the applicants ___ a writing sample.', c: ['submits', 'submit', 'have submitted', 'were submitting'], a: 'submits', r: '"Each" is singular; "of the applicants" is a prepositional phrase and does not change the subject.' },
    { d: 5, p: 'Choose the correct verb: Neither the manager nor the clerks ___ the code.', c: ['know', 'knows', 'has known', 'is knowing'], a: 'know', r: 'With "neither ... nor," the verb agrees with the nearer subject, and "clerks" is plural.' },
    { d: 5, p: 'Choose the correct verb: The committee ___ announcing its decision on Friday.', c: ['is', 'are', 'were', 'have been'], a: 'is', r: 'The pronoun "its" shows the committee is being treated as a single unit, so the verb must be singular too: "is." (British English often allows a plural verb with a collective noun, but not alongside "its.")' },
    { d: 6, p: 'Choose the correct verb: There ___ a dozen reasons to wait.', c: ['are', 'is', 'has been', 'was'], a: 'are', r: 'In "there is/are" sentences the real subject follows the verb; "a dozen reasons" is plural.' },
    { d: 7, p: 'Choose the correct verb: The list of approved vendors ___ posted quarterly.', c: ['is', 'are', 'have been', 'were'], a: 'is', r: 'The subject is "list," not "vendors," so the verb is singular.' },
    { d: 8, p: 'Choose the correct verb: Mathematics, along with physics, ___ required for the degree.', c: ['is', 'are', 'were', 'have been'], a: 'is', r: '"Along with physics" is an interrupting phrase; the singular subject "mathematics" governs the verb.' },
  ],

  punctuation_basic: [
    { d: 1, p: 'Which sentence is punctuated correctly?', c: ['Where did you put the keys?', 'Where did you put the keys.', 'where did you put the keys?', 'Where did you put the keys!?'], a: 'Where did you put the keys?', r: 'A direct question takes a question mark, and the first word is capitalized.' },
    { d: 2, p: 'Which sentence is punctuated correctly?', c: ['We left on monday for Denver.', 'We left on Monday for Denver.', 'we left on Monday for denver.', 'We left on Monday for Denver'], a: 'We left on Monday for Denver.', r: 'Days and city names are proper nouns and need capitals; the statement ends with a period.' },
    { d: 3, p: 'Which sentence is punctuated correctly?', c: ['Stop the car now!', 'Stop the car now?', 'stop the car now!', 'Stop the car now'], a: 'Stop the car now!', r: 'An urgent command can end with an exclamation point, every sentence needs end punctuation, and the first word is capitalized. (A calm command could end with a period instead.)' },
    { d: 4, p: 'Which sentence is punctuated correctly?', c: ['She asked whether the store was open.', 'She asked whether the store was open?', 'She asked, whether the store was open.', 'she asked whether the store was open.'], a: 'She asked whether the store was open.', r: 'An indirect question is a statement, so it ends with a period and takes no comma.' },
    { d: 5, p: 'In standard American style, which sentence is punctuated correctly?', c: ['"Bring the ledger," he said.', '"Bring the ledger" he said.', '"Bring the ledger." he said.', '"Bring the ledger", he said.'], a: '"Bring the ledger," he said.', r: 'A comma separates the quotation from the speaker tag, and in American style it goes inside the closing quotation mark. (British style sometimes places it outside; that is a style difference, not an error.)' },
    { d: 6, p: 'Which sentence is punctuated correctly?', c: ['The plan has one flaw: it costs too much.', 'The plan has one flaw, it costs too much.', 'The plan has one flaw; that it costs too much.', 'The plan has one flaw - : it costs too much.'], a: 'The plan has one flaw: it costs too much.', r: 'A colon introduces an explanation of what came before it.' },
    { d: 7, p: 'Which sentence is punctuated correctly?', c: ['We tested three models; the second failed twice.', 'We tested three models, the second failed twice.', 'We tested three models: the second failed twice, and.', 'We tested three models the second failed twice.'], a: 'We tested three models; the second failed twice.', r: 'Two independent clauses can be joined by a semicolon; a comma alone would be a splice.' },
  ],

  sentence_struct: [
    { d: 2, p: 'Which is a complete sentence?', c: ['The train arrived.', 'Because the train arrived late.', 'Arriving at the station after dark.', 'Which was unexpected.'], a: 'The train arrived.', r: 'A complete sentence needs a subject and a finite verb and must stand alone; the others are fragments.' },
    { d: 3, p: 'Which is a fragment?', c: ['Although the lights were on.', 'The lights were on.', 'Turn on the lights.', 'Were the lights on?'], a: 'Although the lights were on.', r: '"Although" makes the clause subordinate, so it cannot stand by itself.' },
    { d: 4, p: 'Which sentence is a run-on?', c: ['I finished the draft I sent it immediately.', 'I finished the draft and sent it immediately.', 'After finishing the draft, I sent it.', 'I finished the draft; I sent it immediately.'], a: 'I finished the draft I sent it immediately.', r: 'Two independent clauses are jammed together with no conjunction or punctuation.' },
    { d: 5, p: 'Which choice best fixes the comma splice "The road flooded, we turned back."?', c: ['The road flooded, so we turned back.', 'The road flooded we turned back.', 'The road flooded, therefore we turned back.', 'The road flooded, and, we turned back.'], a: 'The road flooded, so we turned back.', r: 'A coordinating conjunction after the comma joins the two clauses properly.' },
    { d: 6, p: 'Which sentence is correctly constructed?', c: ['Having reviewed the file, the auditor signed it.', 'Having reviewed the file, it was signed by the auditor.', 'Having reviewed the file, the signature was added.', 'Having reviewed the file, and the auditor signed it.'], a: 'Having reviewed the file, the auditor signed it.', r: 'The opening phrase must describe the subject that follows, and the subject here is the one who reviewed. Adding "and" leaves the opening phrase attached to nothing.' },
    { d: 7, p: 'Which revision best combines "The grant expired. The lab kept working."?', c: ['Although the grant expired, the lab kept working.', 'The grant expired, the lab kept working.', 'The grant expired and so the lab kept working, however.', 'The grant expired; although the lab kept working.'], a: 'Although the grant expired, the lab kept working.', r: 'Subordination shows the contrast between the two facts in one clean sentence.' },
  ],

  pronoun_case: [
    { d: 2, p: 'Choose the correct pronoun: The award went to Dana and ___.', c: ['me', 'I', 'myself', 'mine'], a: 'me', r: 'The pronoun is the object of "to," so it takes the objective form. Test it alone: "went to me."' },
    { d: 3, p: 'Choose the correct pronoun: ___ and I reviewed the contract.', c: ['She', 'Her', 'Herself', 'Hers'], a: 'She', r: 'The pronoun is part of the subject, so it takes the subjective form.' },
    { d: 4, p: 'Choose the correct pronoun: Each student must bring ___ own notebook.', c: ['their', 'they’re', 'there', 'its'], a: 'their', r: '"Their" is the possessive, and singular "their" for an unspecified person is accepted by major guides (AP, APA, Chicago). "They’re" means "they are," "there" is a place, and "its" is used for things, not people.' },
    { d: 5, p: 'Choose the correct pronoun: The supervisor to ___ you spoke has retired.', c: ['whom', 'who', 'which', 'whose'], a: 'whom', r: 'After a preposition the objective form "whom" is required.' },
    { d: 6, p: 'Choose the correct pronoun: No one on the crew remembered ___ lines.', c: ['his or her', 'their’s', 'they’re', 'whose'], a: 'his or her', r: '"No one" is singular and "his or her" is a singular possessive. "Their’s" is never correct (the possessive has no apostrophe), "they’re" means "they are," and "whose" asks a question. (Many guides would also accept "their" here, but it is not offered.)' },
    { d: 7, p: 'Which sentence has a clear pronoun reference?', c: ['When Ana met Iris, Ana was nervous.', 'When Ana met Iris, she was nervous.', 'Ana met Iris, and she was nervous about it.', 'She was nervous when Ana met Iris.'], a: 'When Ana met Iris, Ana was nervous.', r: 'With two possible antecedents, repeating the name is the only version with one possible meaning.' },
    { d: 8, p: 'Choose the correct pronoun for formal writing: It was ___ who filed the report.', c: ['he', 'him', 'himself', 'his'], a: 'he', r: 'In formal writing, a pronoun after a linking verb is a predicate nominative and takes the subjective form, "he." ("It was him" is common in speech and informal writing.)' },
  ],

  verb_tense: [
    { d: 2, p: 'Choose the correct form: Yesterday she ___ to the market.', c: ['walked', 'walks', 'will walk', 'is walking'], a: 'walked', r: '"Yesterday" sets the action in the past, so the simple past is required.' },
    { d: 3, p: 'Choose the correct form: By next June I ___ here for ten years.', c: ['will have worked', 'will work', 'worked', 'have worked'], a: 'will have worked', r: 'An action completed by a future point takes the future perfect.' },
    { d: 4, p: 'Choose the correct form: They ___ the report before the meeting started.', c: ['had finished', 'have finished', 'finish', 'will finish'], a: 'had finished', r: 'The past perfect "had finished" marks the earlier of two past events. "Have finished," "finish" and "will finish" are not past forms, so they clash with "started."' },
    { d: 5, p: 'Choose the correct form: She has ___ in Lisbon since 2019.', c: ['lived', 'living', 'lives', 'live'], a: 'lived', r: 'The present perfect uses the past participle: has lived.' },
    { d: 6, p: 'Choose the correct form: If I ___ more time, I would rewrite it.', c: ['had', 'have', 'would have', 'will have'], a: 'had', r: 'An unreal (hypothetical) condition about the present uses the past form "had" in the if-clause, paired with "would" in the result clause.' },
    { d: 7, p: 'Which sentence keeps tense consistent?', c: ['He opened the door and looked inside.', 'He opened the door and looks inside.', 'He opens the door and looked inside.', 'He had opened the door and looks inside.'], a: 'He opened the door and looked inside.', r: 'Both verbs in the compound predicate stay in the simple past.' },
    { d: 8, p: 'Choose the correct form: The bridge ___ by the time we arrived.', c: ['had been rebuilt', 'was rebuilding', 'has been rebuilt', 'is rebuilt'], a: 'had been rebuilt', r: 'A passive action completed before another past event takes the past perfect passive.' },
  ],

  comma_use: [
    { d: 2, p: 'Which sentence uses commas correctly?', c: ['We packed bread, cheese, and apples.', 'We packed bread cheese, and apples.', 'We packed, bread, cheese and apples.', 'We packed bread, cheese and, apples.'], a: 'We packed bread, cheese, and apples.', r: 'Items in a series are separated by commas. The comma before the final "and" (the serial or Oxford comma) is a style choice: many guides use it, while AP style leaves it out. Either way, no comma goes between the verb and its object or after "and."' },
    { d: 3, p: 'Which sentence uses commas correctly?', c: ['After the storm passed, we cleared the road.', 'After the storm passed we, cleared the road.', 'After, the storm passed we cleared the road.', 'After the storm, passed we cleared the road.'], a: 'After the storm passed, we cleared the road.', r: 'An introductory clause is normally followed by a comma, placed where the clause ends. The other versions put the comma inside a clause, splitting words that belong together.' },
    { d: 4, p: 'Which sentence uses commas correctly?', c: ['The van, which we rented Friday, broke down.', 'The van which we rented Friday, broke down.', 'The van, which we rented Friday broke down.', 'The van which, we rented Friday, broke down.'], a: 'The van, which we rented Friday, broke down.', r: 'A nonessential clause is set off by a comma at both ends.' },
    { d: 5, p: 'Which sentence uses commas correctly?', c: ['I called the office, but no one answered.', 'I called the office but, no one answered.', 'I called the office, no one answered.', 'I called the office but no one, answered.'], a: 'I called the office, but no one answered.', r: 'A comma normally goes before a coordinating conjunction ("but") that joins two independent clauses; without the conjunction, a comma alone would be a comma splice.' },
    { d: 6, p: 'Which sentence uses commas correctly?', c: ['My cousin Elena, a pilot, lives in Reno.', 'My cousin Elena a pilot, lives in Reno.', 'My cousin, Elena a pilot lives in Reno.', 'My cousin Elena, a pilot lives in Reno.'], a: 'My cousin Elena, a pilot, lives in Reno.', r: '"A pilot" is a nonessential appositive (extra information about Elena), so it is enclosed in commas on both sides.' },
    { d: 7, p: 'Which sentence uses commas correctly?', c: ['The results were, frankly, disappointing.', 'The results were frankly, disappointing.', 'The results, were frankly disappointing.', 'The results were, frankly disappointing.'], a: 'The results were, frankly, disappointing.', r: 'An interrupting adverb is set off on both sides.' },
    { d: 8, p: 'Which sentence uses commas correctly?', c: ['She wore a heavy wool coat.', 'She wore a heavy, wool, coat.', 'She wore a heavy wool, coat.', 'She wore, a heavy wool coat.'], a: 'She wore a heavy wool coat.', r: 'These adjectives are cumulative rather than coordinate, so no comma belongs between them.' },
  ],

  apostrophes: [
    { d: 2, p: 'Which is correct?', c: ['the dog’s collar', 'the dogs collar', 'the dogs’ collar (one dog)', 'the dog’s’ collar'], a: 'the dog’s collar', r: 'A singular possessive takes apostrophe + s.' },
    { d: 3, p: 'Which is correct for the collars belonging to several dogs?', c: ['the dogs’ collars', 'the dog’s collars', 'the dogs collars', 'the dogs’s collars'], a: 'the dogs’ collars', r: 'A plural already ending in s takes only an apostrophe.' },
    { d: 4, p: 'Which sentence is correct?', c: ['It’s too late to change its color.', 'Its too late to change it’s color.', 'It’s too late to change it’s color.', 'Its’ too late to change its color.'], a: 'It’s too late to change its color.', r: '"It’s" is a contraction of "it is"; "its" is the possessive.' },
    { d: 5, p: 'Which is correct?', c: ['the children’s books', 'the childrens’ books', 'the childrens books', 'the children’s’ books'], a: 'the children’s books', r: '"Children" is an irregular plural that does not end in s, so it takes apostrophe + s.' },
    { d: 6, p: 'Which sentence is correct?', c: ['Whose report is late, and who’s presenting it?', 'Who’s report is late, and whose presenting it?', 'Whose report is late, and whose presenting it?', 'Who’s report is late, and who’s presenting it?'], a: 'Whose report is late, and who’s presenting it?', r: '"Whose" is possessive; "who’s" contracts "who is."' },
    { d: 7, p: 'Which is correct for a jointly owned office?', c: ['Ana and Marco’s office', 'Ana’s and Marco’s office', 'Ana and Marcos’ office', 'Anas and Marco’s office'], a: 'Ana and Marco’s office', r: 'Joint ownership marks only the last name as possessive. "Ana’s and Marco’s" would mean two separate owners, and the name is Marco, not Marcos.' },
  ],

  modifiers: [
    { d: 4, p: 'Which sentence avoids a misplaced modifier?', c: ['Covered in mud, the hikers reached the shelter.', 'Covered in mud, the shelter was reached by the hikers.', 'The hikers reached the shelter covered in mud, tired.', 'Reaching the shelter, mud covered.'], a: 'Covered in mud, the hikers reached the shelter.', r: 'The opening phrase must modify the noun right after it — the hikers, not the shelter.' },
    { d: 5, p: 'Which sentence says that she went running on nearly every day of the month?', c: ['She ran almost every day of the month.', 'She almost ran every day of the month.', 'Almost she ran every day of the month.', 'She ran every almost day of the month.'], a: 'She ran almost every day of the month.', r: '"Almost" limits the word right after it. "Almost every day" means nearly every day; "almost ran" means she nearly ran but did not.' },
    { d: 6, p: 'Which sentence corrects the dangling modifier in "After reviewing the data, the conclusion was revised."?', c: ['After reviewing the data, the team revised the conclusion.', 'After reviewing the data, the revision was made.', 'The conclusion, after reviewing the data, was revised.', 'After the data was reviewed, the conclusion revised.'], a: 'After reviewing the data, the team revised the conclusion.', r: 'Someone has to do the reviewing; naming that subject fixes the dangler.' },
    { d: 7, p: 'Which sentence is parallel?', c: ['The job requires writing, editing, and proofreading.', 'The job requires writing, editing, and to proofread.', 'The job requires to write, editing, and proofreading.', 'The job requires writing, to edit, and proofreading.'], a: 'The job requires writing, editing, and proofreading.', r: 'Items in a series must share a grammatical form; here all three are gerunds.' },
    { d: 8, p: 'Which comparison is complete and logical?', c: ['The new car’s engine is quieter than the old car’s.', 'The new car’s engine is quieter than the old car.', 'The new car’s engine is more quiet.', 'The new car’s engine is the quieter of all the engines.'], a: 'The new car’s engine is quieter than the old car’s.', r: 'A comparison must be between like things: the new car’s engine and the old car’s engine, not the whole old car. "More quiet" never says than what, and a comparison among all the engines needs the superlative "quietest."' },
  ],

  word_choice: [
    { d: 2, p: 'Choose the correct word: The new rule will ___ everyone.', c: ['affect', 'effect', 'affective', 'effectual'], a: 'affect', r: '"Affect" is the verb meaning to influence; "effect" is normally the noun.' },
    { d: 2, p: 'Choose the correct word: ___ going to need more time.', c: ['They’re', 'Their', 'There', 'Theirs'], a: 'They’re', r: '"They’re" contracts "they are," which is what the sentence needs.' },
    { d: 3, p: 'Choose the correct word: This box is heavier ___ that one.', c: ['than', 'then', 'that', 'thus'], a: 'than', r: '"Than" makes comparisons; "then" refers to time or sequence.' },
    { d: 4, p: 'Choose the correct word: We had ___ volunteers than last year.', c: ['fewer', 'less', 'lesser', 'fewest'], a: 'fewer', r: '"Fewer" counts individual items; "less" describes an uncountable amount.' },
    { d: 5, p: 'Choose the correct word: The evidence had no ___ on the verdict.', c: ['effect', 'affect', 'affecting', 'effected'], a: 'effect', r: 'Here the word is a noun meaning result, which is "effect."' },
    { d: 6, p: 'Choose the correct word: Please ___ the documents on the table.', c: ['lay', 'lie', 'laid', 'lied'], a: 'lay', r: '"Lay" takes a direct object; "lie" does not.' },
    { d: 7, p: 'Choose the correct word: From her silence, we ___ that she disagreed.', c: ['inferred', 'implied', 'insinuated', 'informed'], a: 'inferred', r: 'To infer is to draw a conclusion from evidence; to imply or insinuate is to suggest something without saying it. The listeners drew the conclusion, so "inferred."' },
    { d: 8, p: 'Choose the correct word: Her new survey ___ the earlier study by covering the years it left out.', c: ['comprises', 'compromises', 'complements', 'compliments'], a: 'complements', r: '"Complements" means completes or goes well with, which is what filling in missing years does. "Compliments" means praises, "compromises" means weakens, and "comprises" means consists of.' },
  ],

  transitions: [
    { d: 3, p: 'Choose the best transition: The forecast called for rain. ___, we packed the tents anyway.', c: ['Still', 'Therefore', 'Likewise', 'For example'], a: 'Still', r: 'The second sentence contrasts with the first, so a contrast transition fits.' },
    { d: 4, p: 'Choose the best transition: The shipment was delayed. ___, the launch slipped a week.', c: ['As a result', 'Nevertheless', 'In contrast', 'Similarly'], a: 'As a result', r: 'The second sentence states a consequence of the first.' },
    { d: 5, p: 'Choose the best transition: Sales rose in April. ___, returns rose with them.', c: ['However', 'Because', 'For instance', 'In conclusion'], a: 'However', r: 'The rise in returns qualifies the good news, which calls for a contrast.' },
    { d: 6, p: 'Choose the best transition: The alloy resists corrosion. ___, it costs four times as much as steel.', c: ['On the other hand', 'Consequently', 'In addition', 'That is'], a: 'On the other hand', r: 'A drawback set against an advantage needs a contrasting transition.' },
    { d: 7, p: 'Choose the best transition: Two trials showed no benefit. ___, the treatment remains in the guidelines.', c: ['Even so', 'Thus', 'Namely', 'Meanwhile'], a: 'Even so', r: '"Even so" concedes the evidence and then states the surprising outcome.' },
    { d: 8, p: 'Choose the best transition: The method is slow and expensive. ___, it is the only one accepted in court.', c: ['That said', 'For example', 'In other words', 'Accordingly'], a: 'That said', r: 'The sentence pivots from drawbacks to a decisive advantage, which is a concessive pivot.' },
  ],

  act_rhetoric: [
    { d: 4, p: 'A paragraph about a city’s water system ends with a sentence about the mayor’s childhood. The writer should', c: ['delete the sentence because it is irrelevant to the paragraph', 'keep it because it adds human interest', 'move it to the start of the paragraph', 'expand it into its own paragraph'], a: 'delete the sentence because it is irrelevant to the paragraph', r: 'ACT rhetoric questions reward relevance: material that does not serve the paragraph’s focus comes out.' },
    { d: 5, p: 'Which revision is most concise without losing meaning? "The reason why the bridge failed was because of the fact that the bolts corroded."', c: ['The bridge failed because the bolts corroded.', 'The reason the bridge failed was that the bolts had corroded.', 'Due to the fact that the bolts corroded, the bridge failed.', 'The bridge failed on account of corroded bolts being the reason.'], a: 'The bridge failed because the bolts corroded.', r: 'Redundant framing ("the reason why ... was because of the fact that") is cut entirely.' },
    { d: 6, p: 'An essay about urban gardens needs a sentence to introduce a paragraph of statistics on yield per square foot. The best choice is', c: ['Small plots produce more than their size suggests.', 'Gardening is a popular hobby in many cities.', 'Some people prefer flowers to vegetables.', 'The history of urban gardens is long and varied.'], a: 'Small plots produce more than their size suggests.', r: 'A topic sentence should predict the paragraph’s content, and the paragraph is about yield relative to size.' },
    { d: 7, p: 'A writer wants to emphasize that the change was immediate. Which phrasing is best?', c: ['Within hours, applications doubled.', 'Applications doubled at some point.', 'Applications, over a period of time, doubled.', 'It came to pass that applications doubled.'], a: 'Within hours, applications doubled.', r: 'A specific short interval delivers the emphasis; the alternatives blur the timing.' },
    { d: 8, p: 'A paragraph argues that the policy failed, then ends: "The policy was also popular." To keep the paragraph focused, the writer should', c: ['move the sentence to a paragraph about public reaction', 'delete the rest of the paragraph', 'add more sentences about popularity', 'keep it as a conclusion'], a: 'move the sentence to a paragraph about public reaction', r: 'The information is useful but belongs where it supports the point, not appended to an argument about failure.' },
  ],

  act_science: [
    { d: 4, p: 'Study 1: as temperature rose from 10°C to 40°C, enzyme activity rose steadily; from 40°C to 60°C it fell sharply. Activity was highest at about', c: ['40°C', '10°C', '60°C', '25°C'], a: '40°C', r: 'The turning point between rising and falling activity is the maximum.' },
    { d: 5, p: 'A table shows seed germination: 0 mm rain, 2%; 10 mm, 31%; 20 mm, 58%; 30 mm, 61%. The data best support that germination', c: ['rises with rainfall but levels off', 'falls as rainfall increases', 'is unaffected by rainfall', 'rises without limit'], a: 'rises with rainfall but levels off', r: 'The jump from 20 to 30 mm is 3 points, far smaller than earlier jumps, which is a plateau.' },
    { d: 6, p: 'Two scientists disagree about a lake’s oxygen decline. Scientist A blames fertilizer runoff from nearby farms; Scientist B blames rising temperature. Which finding would best support B?', c: ['Oxygen fell in a nearby lake with no farms in its watershed', 'Runoff volume doubled in the same period', 'Nitrogen levels rose sharply near the inlet', 'Algae blooms were heaviest beside the farm outflow'], a: 'Oxygen fell in a nearby lake with no farms in its watershed', r: 'A lake with no runoff source showing the same decline points away from runoff and toward a shared cause like temperature.' },
    { d: 7, p: 'In Experiment 2 the control and treatment groups differed only in light exposure, yet both showed identical growth. The most reasonable conclusion is that', c: ['light exposure did not affect growth under these conditions', 'the experiment must have been run incorrectly', 'growth depends only on light', 'the control group was unnecessary'], a: 'light exposure did not affect growth under these conditions', r: 'When the only varied factor produces no difference, that factor did not drive the outcome in this setup.' },
    { d: 8, p: 'A researcher reports a correlation of 0.91 between ice cream sales and sunscreen sales. The best interpretation is that', c: ['both track a third factor such as hot, sunny weather', 'ice cream sales cause sunscreen sales', 'sunscreen sales cause ice cream sales', 'the correlation must be a calculation error'], a: 'both track a third factor such as hot, sunny weather', r: 'Both products sell more in hot, sunny weather. A strong correlation alone does not show that one causes the other; a shared driver is the more reasonable explanation.' },
  ],
};

// The authored items and the families feed one pool per skill: the authored ones
// are sharper, the families are what stop a learner seeing the same eight lines,
// and the shapes are what stop them seeing the same question with a noun swapped.
const G = {};
const ALL = {};
// The first US grade each rule is taught, for school grades (standards check,
// 2026-10-24; content/english-grade-items.js SCHOOL_GRADES, content/pool.js forSchool).
const { tagSchoolGrades } = require('./english-grade-items');
const UNTAGGED = {};
for (const skill of new Set([...Object.keys(POOLS), ...Object.keys(FAMILIES), ...Object.keys(SHAPES)])) {
  ALL[skill] = [
    ...(POOLS[skill] || []),
    ...(FAMILIES[skill] || []),
    ...(SHAPES[skill] || []),
  ];
  const missed = tagSchoolGrades(skill, ALL[skill]);
  if (missed.length) UNTAGGED[skill] = missed;
  G[skill] = fromPool(ALL[skill], skill);
}

// Reading skills draw on the authored passages and on generated ones. The
// authored prose is better, and there are now fourteen of them across two banks —
// six in passages.js and eight in passages-2.js — because six was a hard ceiling:
// a passage stops being reusable once every skill has asked about its main idea,
// its purpose, a detail and a word in it, which is four questions, and there are
// five reading skills. The generated passages now come in four structures rather
// than one, so a question about the opening cannot be answered from the closing
// paragraph. Every kind carries questions checkable against the passage in front
// of the learner.
for (const skill of ['main_idea', 'inference', 'author_purpose', 'detail_support', 'vocab_context']) {
  const pool = [
    ...questionsForSkill(skill),
    ...questionsForSkill2(skill),
    ...(PASSAGE_FAMILIES[skill] || []),
  ];
  const shapeOf = (entry) => (typeof entry.p === 'function' ? shapeKey({
    skill_id: skill,
    family_frame: entry.frame,
    varies: entry.varies,
  }) : null);

  G[skill] = (rng, d, ctx = {}) => {
    const avoid = ctx.avoid || new Set();
    const seenShapes = ctx.seenShapes || new Set();
    const entry = pickByDifficulty(rng, forSchool(pool, ctx.school), d, avoid, shapeOf, seenShapes);
    // Build from the entry that was chosen. Delegating to fromPool here would
    // pick a second time and usually land somewhere else.
    let built = entryToItem(rng, entry, d);
    if (typeof entry.p === 'function') {
      // A family whose shape is already spent is not worth re-rolling; a family
      // whose shape is new is, because the renderings are what vary.
      if (!(seenShapes.has(shapeOf(entry)) && seenShapes.size)) {
        for (let tries = 1; tries < 12 && avoid.has(itemKeyOf(built)); tries++) {
          built = entryToItem(rng, entry, d);
        }
      }
    } else {
      built.passage_id = entry.passage_id;
    }
    return built;
  };
}

module.exports = { GENERATORS: G, POOLS, ALL, UNTAGGED };
