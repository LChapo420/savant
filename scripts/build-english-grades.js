// Generate content/english-grades.js from the creator's English spreadsheet.
//
// The reading of the sheet, the type mapping and the writing of the file all live
// in `scripts/build-sheet-track.js`, which the Reading track uses too. Two
// generators copying the same sheet logic is how this one came to disagree with a
// second copy of its own level rule twice — which is what
// `config/level-layout.js` now exists to prevent, and not something to repeat
// for the sake of one more subject.
//
// What is left here is this sheet's own two decisions: the ids its grades have
// always had, because stored enrollments point at them, and the skill each
// level's questions are drawn from.
const { readSheet, writeTrack } = require('./build-sheet-track');

const ROOT = 'C:/coding/iqmax_clone_9.26/iq max repo 2';
const SRC = 'C:/coding/iqmaxx/creator_files/English_Levels_Topics.csv';
const OUT = `${ROOT}/content/english-grades.js`;

/**
 * The existing three English grades keep their ids, because stored enrollments
 * and the ones already out in the world point at them. The new ones are named
 * from their headings.
 */
const KEEP_IDS = { 0: 'basics', 1: 'grammar', 2: 'reading' };

/** The grade names a learner sees, and a one-line summary for the catalogue. */
const GRADE_META = {
  basics: { name: 'Foundations — Preschool to Kindergarten', tier: 1, blurb: 'Listening, speaking, first letters, and first sentences.' },
  early_reader: { name: 'Early Reader — 1st Grade', tier: 1, blurb: 'Phonics, decoding, and the first paragraphs.' },
  beginning_writer: { name: 'Beginning Reader/Writer — 2nd Grade', tier: 1, blurb: 'Spelling patterns, simple sentences, and short informative writing.' },
  developing: { name: 'Developing — 3rd Grade', tier: 2, blurb: 'Sentence structure, punctuation, and the five-paragraph essay.' },
  intermediate: { name: 'Intermediate — 4th Grade', tier: 2, blurb: 'Clauses, modifiers, research skills, and literary analysis.' },
  upper_intermediate: { name: 'Upper Intermediate — 5th to 6th Grade', tier: 2, blurb: 'Rhetorical situation, argument, and working with sources.' },
  advanced_intermediate: { name: 'Advanced Intermediate — 7th to 8th Grade', tier: 3, blurb: 'Advanced syntax, voice, tone, and the analytical essay.' },
  proficient: { name: 'Proficient — 9th to 10th Grade', tier: 3, blurb: 'Rhetorical theory, research methods, and college preparation.' },
  advanced: { name: 'Advanced — 11th to 12th Grade', tier: 4, blurb: 'Style, stylistics, and writing that joins critical conversation.' },
  college_composition: { name: 'College Composition — Year 1', tier: 4, blurb: 'Academic writing, argument, and the research paper.' },
  language_writing_studies: { name: 'Language & Writing Studies — Years 2-3', tier: 5, blurb: 'Linguistics, composition theory, and professional practice.' },
  advanced_undergraduate: { name: 'Advanced Undergraduate / Honors', tier: 5, blurb: 'Honors thesis work and the disciplines of academic writing.' },
  masters: { name: "Master's — Graduate School", tier: 6, blurb: 'Graduate study, the seminar paper, and publishing research.' },
  doctoral: { name: 'Doctoral — Graduate School', tier: 7, blurb: 'The dissertation, gatekeeping, and a research program.' },
  postdoctoral: { name: 'Postdoctoral / Professional', tier: 7, blurb: 'Postdoctoral planning, teaching, and professional leadership.' },
  field_authority: { name: 'Field Authority — Senior Scholar', tier: 8, blurb: 'Shaping a field, legacy planning, and field-defining work.' },
};

const RULES = [
  // Phonics and early decoding — the preschool and early-reader material.
  //
  // The listening, speaking and drawing levels come first because a preschool
  // grade is not about letters: it is about following a read-aloud, taking a
  // turn, and saying what you mean. The bank cannot test any of that with a
  // multiple-choice question, so those levels are taught from phonics — the
  // nearest material the bank does have — and the rule sits before the catch-all
  // that would otherwise sweep them into reading comprehension and hand a
  // five-year-old a question about an ecological survey.
  [/listening and attention|asking and answering|following .*(directions|steps)|speaking clearly|naming common|colors, shapes|position and direction|question words|describing people|drawing and dictating|adding drawings|shared research|speaking in simple|writing your name|plural words|conversational vs|building on what others|giving and restating|recounting events|using digital tools to write|gathering facts for a group/i, 'phonics'],
  [/letter|^letters|alphabet|uppercase|lowercase|letter formation|stroke|tracing|cur(c|s)ive|keyboard/i, 'phonics'],
  [/letter sounds?|vowel|consonant|syllable|blend|digraph|word famil|phoneme|segmenting|sound|rhyme|rhythm|meter|phonolog|phonetic|orthograph|spelling|short [a-z] words|long [a-z]|soft [cg]|common endings|irregular plural|morpholog|prefix|suffix|root word|words? with more than one meaning|same-meaning/i, 'phonics'],
  [/word.?play|riddle|tongue.?twister|puns?|idiom|adage|proverb|figurative|literary device|euphemism|oxymoron|paradox/i, 'word_choice'],

  // Vocabulary.
  [/vocab|diction|word choice|shades of meaning|synonym|antonym|homophone|homograph|connotation|denotation|glossar|thesaurus|dictionar|lexicograph|etymolog|word origin|multip.?meaning|word part|precise (language|word)|opposites?\b/i, 'vocab_context'],
  [/context clue|academic and domain|domain.?specific|domain vocabulary|precise language/i, 'vocab_context'],
  [/register|tone|formal vs|conversational|standard vs|informal language|professional language|usage debate|non.?standard/i, 'word_choice'],

  // Grammar: the sentence and what is in it.
  [/sentence frag|run.?on|comma splice|complete sentence|incomplete sentence|subject.?predicate|what makes a complete|topic, support|word order|scrambl|parts of a sentence/i, 'sentence_struct'],
  [/sentence combin|expanding, combin|rearrang|choppy|varied sentence|sentence variety|style and voice|syntax|rhythm|concision|wordiness|clarity and coherence|economy|concise/i, 'sentence_struct'],
  [/subject.?verb agreement|agreement in tricky|pronoun.?antecedent|pronoun shift|intensive pronoun/i, 'subject_verb'],
  [/pronoun/i, 'pronoun_case'],
  [/verb tense|tense consist|perfect tense|progressive verb|irregular (past )?tense|verb mood|mood and tense|modal auxiliary|helping verb|verb form|linking verb|action verb|verbals?:|participles?|gerunds?|infinitives?|reflexive pronoun|direct object|indirect object/i, 'verb_tense'],
  [/noun|plural|possess|abstract noun|collective noun|proper noun|common noun/i, 'parts_of_speech'],
  [/adjectiv|adverb|modifier|dangling|misplaced|parallel|comparative|superlative|describing word/i, 'modifiers'],
  [/appositive|phrase|clause|prepositional|participial|gerund phrase|infinitive phrase|dependent clause|independent clause|compound sentence|complex sentence|simple, compound|subordinating|coordinating|relative clause/i, 'parts_of_speech'],
  [/conjunction|coordinat|subordinat|correlative|relative pronoun|transition|cohesion|signpost|linking word|connective|joining words|article|determinative|preposition|interjection|adverbial/i, 'comma_use'],
  [/capit(al|ization)|end (punc|mark)|semicolon|colon|dash|ellipsis|quotation|apostrophe|parenthes|punctuat|hyphen|comma|period|question mark|exclamation|double negative|contraction|syllab/i, 'punctuation_basic'],
  [/advanced grammar|grammar review|grammar in context|mixed errors|error pattern|proofread|editing for|editing and|revision|revising|proofreading|peer review|feedback|fact family|array/i, 'sentence_struct'],

  // Reading and comprehension.
  [/main idea|central idea|core message|big idea|summary|summariz|summarise|paraphras/i, 'main_idea'],
  [/inference|infer|read between|conclusion that is not|unstated|imply|implication|background knowledge|what can you conclude|evaluate|judg|assess/i, 'inference'],
  [/author.?s purpose|rhetorical situation|purpose and audience|why the (author|writer|passage|text)/i, 'author_purpose'],
  [/point of view|perspective|narrator|speaker reliability|audience|rhetor(ic)? appeal|ethos|pathos|logos|tone|mood|concession|rhetorical strategy|rhetorical analysis|rhetorical essay|persuad|propaganda|advertis|media|visual rhetoric|argument/i, 'author_purpose'],
  [/detail|evidence|quote|quotation|citing|citation|mla|apa|chicago|works cited|bibliograph|source|note.?taking/i, 'detail_support'],
  [/text structure|organis|organiz|structure of|sequence|cause and effect|problem and solution|comparison|compare|contrast|outlining|outline|paragraph|synthes|integrat|multiple (sources|media)|conflicting/i, 'detail_support'],
  [/logical|fallac|logic|claim|reasoning|deduc|induc|analogy|syllogis|valid/i, 'inference'],
  [/research method|research design|research process|methodolog|ethic|plagiar|integrity|fieldwork|field method|interview|survey|dataset|corpus|corput|computational|data collection|experiment|research question|formulating a research|formulating|developing a question|building a question|question development|begin.*research|short research|group project|shared research|gathering facts|working with (primary|original)|textual criticism|transcription/i, 'act_data'],
  [/literary|literature|novel|poem|poetry|fiction|creative writing|playwriting|screenwriting|script|character|plot|setting|theme|stylistic|dramatic|poetic|verse/i, 'vocab_context'],

  // The writing a learner does.
  [/writing|essay|thesis|draft|compos|letter|email|report|proposal|memo|blog|op-ed|paragraph|sentence|manuscript|publication/i, 'sentence_struct'],
  [/process|planning|prewrit|freewrit|brainstorm|getting your ideas|managing|project management|time management|portfolio|self.?assessment|reflection/i, 'main_idea'],
  [/listening|speak|oral|present|discussion|semin|deliver|conversation|group|collaborat|keynote/i, 'inference'],
  [/technical|professional|business|workplace|multimedia|visual|document design|usability|instructional design|digital writing|content strategy|user experience|ux |presentation|slide|visual|video|audio|image|media literacy/i, 'act_rhetoric'],
  [/rhetoric|rhetorical|composition|pedagog|teaching|curriculum|assessment|writing program/i, 'act_rhetoric'],
  [/linguistic|phonolog|semantics|socioling|morpholog|syntax|discourse|dialect|world english|endangered|acquisition|computational|nlp|corpus|pragmatic|conlang|constructed language|old english|history of the (english )?language|language acquisition|neuroling|translat|python|programming|text encoding|text mining|metadata|intellectual property|permission|copyright/i, 'act_science'],
  [/digital humanit|encoding|text mining|data visualization|digital archiv|curation|digital edition|markup|data.?driven|empirical|statistics|qualitative|quantitative/i, 'act_data'],
  [/honors|thesis|dissertation|master.?s|doctoral|postdoc|publication|journal|monograph|book proposal|grant|conference|keynote|academic service|governance|tenure|mentor|curriculum vitae|cover letter|job market|scholarly|leadership|field|directing|program administration|program evaluation|professionalization|network/i, 'act_science'],
  [/literacy|reading and writing|as a second|esl|tesol|adult|early career/i, 'vocab_context'],

  // A catch-all, and last for a reason. The bracketed prefixes are how the
  // creator sorted the sheet by field — "[All Tracks] Doctoral Program
  // Orientation" is about a doctoral programme — and several of its keywords
  // ("field", "postdoctoral", "research") are ordinary words that would catch a
  // primary-grade level about a research project if this sat first. Put at the
  // end, it only sees what nothing else claimed.
  [/^graduate study|doctor(al)? program|postdoctoral|research (plan|program)|monograph|book proposal|book series|reference work|curriculum and policy|scholarly association|field.?defining|legacy|public intellectual|scholarship as|interdisciplinary field|shaping a field|alternative academic|second language reading|interdisciplinary (and international )?collab/i, 'act_science'],
];

/**
 * Which skill a level's questions come from.
 *
 * Matched on the level's **title**, and on what it covers as a second try. A
 * lesson's title names the rule it teaches ("Silent Letters", "Subject-Verb
 * Agreement"), which is what the rules below are written against; a quiz's title
 * names the cycle it sits in ("Master Quiz 2 (Cycle 1)") and says nothing, so a
 * level with no match on its title is tried on its coverage, which does name the
 * material — "Telling one from many and forming plurals" is `parts_of_speech`.
 *
 * A level that matches neither is served from the whole skill its grade is built
 * from, which is a broader question rather than a wrong one.
 *
 * @param {object} level a row from the sheet, with `title` and `covers`
 * @returns {string|null} a skill id
 */
function skillFor(level) {
  for (const [re, skill] of RULES) if (re.test(level.title)) return skill;
  for (const [re, skill] of RULES) if (level.covers && re.test(level.covers)) return skill;
  return null;
}


const { grades, unknownTypes } = readSheet(SRC, skillFor);
writeTrack({
  grades,
  out: OUT,
  subject: 'English',
  meta: GRADE_META,
  keepIds: KEEP_IDS,
  unknownTypes,
});
