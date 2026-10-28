// Generate content/reading-grades.js from the creator's Reading spreadsheet.
//
// The sheet is a **layout**: it names every level of every grade — 6,578 rows
// across sixteen grades — with a type, a title, and what that level covers.
// Levels run 1 to N with nothing missing and nothing named twice, so a grade's
// path is its highest level plus the graduation exam, and every level is served
// with the words its author wrote for it.
//
// The reading of the sheet, the type mapping and the writing of the file are in
// `scripts/build-sheet-track.js`, which the English track uses too. What is left
// here is the Reading sheet's own two decisions: the names a learner sees, and
// the skill each level's questions are drawn from.
//
// Reading is a *different subject* from English, and the difference is in the
// questions rather than the lessons. English asks about the craft of writing and
// about language; reading asks what a text says, why it says it, and how a reader
// gets there. So the skills below are its own — inference, main idea, evidence,
// author's purpose, structure, vocabulary in context, and literary reading — and
// they are the ones the ACT reading track already draws on. A level the rules miss
// is served from the whole skill its grade is built from, which is a broader
// question rather than a wrong one.
const { readSheet, writeTrack } = require('./build-sheet-track');

const ROOT = 'C:/coding/iqmax_clone_9.26/iq max repo 2';
const SRC = 'C:/coding/iqmaxx/creator_files/Reading_Levels_Topics.csv';
const OUT = `${ROOT}/content/reading-grades.js`;

/** The grade names a learner sees, and a one-line summary for the catalogue. */
const GRADE_META = {
  foundations: { name: 'Reading Foundations — Preschool to Kindergarten', tier: 1, blurb: 'Read-alouds, picture books, and talking about a story.' },
  early_decoder: { name: 'Early Decoder — 1st Grade', tier: 1, blurb: 'Phonics, decoding, and the first chapters.' },
  beginning_reader: { name: 'Beginning Reader — 2nd Grade', tier: 1, blurb: 'Decoding longer words, retelling, and early comprehension.' },
  developing_reader: { name: 'Developing Reader — 3rd Grade', tier: 2, blurb: 'Main idea, sequence, and reading across a whole text.' },
  intermediate_reader: { name: 'Intermediate Reader — 4th Grade', tier: 2, blurb: 'Character, setting, and evidence from what a text says.' },
  upper_intermediate_reader: { name: 'Upper Intermediate Reader — 5th to 6th Grade', tier: 2, blurb: 'Figurative language, author’s purpose, and comparing accounts.' },
  advanced_intermediate_reader: { name: 'Advanced Intermediate Reader — 7th to 8th Grade', tier: 3, blurb: 'Theme, structure, and reading between the lines.' },
  proficient_reader: { name: 'Proficient Reader — 9th to 10th Grade', tier: 3, blurb: 'Argument, evidence, and nonfiction reading.' },
  advanced_reader: { name: 'Advanced Reader — 11th to 12th Grade', tier: 4, blurb: 'Interpretation, comparison, and evaluating a source.' },
  college_academic_reading: { name: 'College Academic Reading — Freshman Year', tier: 4, blurb: 'Reading an argument closely, and finding your position in it.' },
  literary_studies: { name: 'Literary Studies — Sophomore to Junior', tier: 5, blurb: 'Periods, movements, and reading the history in a text.' },
  advanced_undergraduate: { name: 'Advanced Undergraduate / Honors', tier: 5, blurb: 'Honors-level reading and the research conversation.' },
  masters: { name: "Master's — Graduate School", tier: 6, blurb: 'Reading a field, and the literature a field argues from.' },
  doctoral: { name: 'Doctoral — Graduate School', tier: 7, blurb: 'Original reading, and what a claim rests on.' },
  postdoctoral_professional: { name: 'Postdoctoral / Professional', tier: 7, blurb: 'Reading a discipline, and teaching others to read it.' },
  field_authority: { name: 'Field Authority — Senior Scholar', tier: 8, blurb: 'Shaping what a field reads, and how it reads.' },
};

/**
 * Which skill can ask a question about a level.
 *
 * Ordered best-first, so a level two skills could take goes to the one that tests
 * it more directly. Matched on the level's **title** first and its **coverage**
 * second: a lesson's title names what it teaches ("What Is a Book?", "Finding the
 * Main Idea"), which is what the rules below are written against, while a quiz's
 * title names the cycle it sits in and says nothing. A level with no match on
 * either is served from the whole skill its grade is built from.
 *
 * The skills are the reading ones. Early decoding is `phonics`, which is the same
 * skill the English track uses for its first grades — the letters make the same
 * sounds whichever subject is asking, and one family of questions about them is
 * better than two that disagree.
 *
 * @param {object} level a row from the sheet
 * @returns {string|null} a skill id
 */
function skillFor(level) {
  for (const [re, skill] of RULES) if (re.test(level.title)) return skill;
  for (const [re, skill] of RULES) if (level.covers && re.test(level.covers)) return skill;
  return null;
}

const RULES = [
  // Decoding and print, before anything else. A reader who cannot sound out a
  // word cannot be asked what the sentence means, so these sit above the
  // comprehension rules and a lesson about phonics never gets handed to a question
  // about theme.
  //
  // This block is wide on purpose. The first two grades are almost entirely
  // letter-sound work — "Sounds of B, C, D, F, G", "Reading Words with -ck, -ng,
  // and -nk", "Middle Sounds: Hearing the Vowel" — and a rule that matched only
  // the words "phonics" and "decode" left 191 of the subject's lessons with no
  // skill at all, which meant their check questions came from whichever skill the
  // grade happened to list first rather than from the one they were about.
  [/phonics|decode|decoding|sound out|sight word|dolch|fry|high.?frequency word|letter sounds?|digraph|syllable|blending|fluency|accura(cy|tely) read|word famil|print awareness/i, 'phonics'],
  [/beginning sounds?|ending sounds?|middle sounds?|vowel sounds?|sounds of [a-z]|long and short vowel|reading vowels|silent e|vowel team|consonant|blend|look.?alike|pattern book|rhyming|syllab|letter(s)? stand for|magic e|tricky vowel|irregularly spelled|spelling changes before endings|two.?part words|two part words|apostrophes|contractions|read.*words with|words that end in|nonwords|decodable|spell|words with|word pattern|sound pattern|-ck|-ng|-nk|\bck\b|\bng\b|\bnk\b|-y\b/i, 'phonics'],
  [/print awareness|print concept|environmental print|real page|word boundar|title page|front cover|back cover|letter.*(in|on) (a|the) (real )?(page|book)|letters in (a|the) (real )?(page|book)|words and letters|find(ing)? (words|letters)|uppercase and lowercase|top to bottom|left to right|book cover|your name in print|name in print|reading (directions|signs|labels)|on your own/i, 'phonics'],
  [/illustrat|author, illustrator|picture book|read.?aloud|model read|signs? and labels?|logos?/i, 'phonics'],

  // What a text says: the main idea, and the parts under it.
  [/main idea|central idea|big idea|key idea|core message|central message|lesson and moral|topic|subject|what .* (about|is the text)|gist/i, 'main_idea'],
  [/summary|summariz|summarise|paraphras|retell|retelling|recount|tell the story|story elements|how stories begin|stamina|independent reading|be(gin)?(ning)? and end|conclusion|what happened|problem and solution|reasons? that support|reasons? (the|an? author)|comparing two|compare two|support the author|author.?s points|point or points/i, 'main_idea'],

  // Finding the evidence, which is most of what a reader is asked to do.
  [/evidence|support (your|the) (answer|claim)|cite|quotation|quote from|text (evidence|support)|prove|justify|show .* from|line(s)? that|find (the )?(quote|line|detail)|explicit detail|detail(s)? (in|from) the text|stated in the text|according to the (text|passage)|with details|details and examples|key detail|supporting detail/i, 'detail_support'],
  [/annotat|mark up|highlight|close reading|note.?taking|reread|re.?read|text.?based|evidence log|tracking (my|our) reading|explaining a text/i, 'detail_support'],
  [/text structure|structure of the (text|passage)|analyz(e|ing) structure|structure of two|organis|organiz|sequence|cause and effect|problem and solution|compare and contrast|comparing|comparison|before.*after.*during|graphic|chart|table|diagram|section|heading|paragraph|scanning|skimming|table of contents|index|glossary|front matter|how.?to (text|read)|procedures?|multistep|technical/i, 'detail_support'],
  [/comprehension|who, what|why and how|connecting text|connect.*pictures|real or make.?believe|visualiz|asking questions|ask questions|watch it modeled|try a new short text|answer a question|sort true|tell or write|what comes next/i, 'detail_support'],

  // Reading between the lines.
  [/infer|inference|imply|implied|read between|not stated|background knowledge|what can you conclude|conclusion|deduce|deduction|predict|what .* (might|will|would)|reading between/i, 'inference'],
  [/think(ing)? like a (detective|author|reader)|what the author .*(really|actually)|why did the author|purpose of the detail|point of view|perspective|first person|third person|reliable|narrator|unreliable|bias/i, 'inference'],

  // Why a text is written, and who it is for.
  [/author.?s purpose|purpose of the (text|author)|why the author|to (inform|entertain|persuade|explain|convince)|informational|persuasive|narrative (text|purpose)|intended audience|who is this for|develop individuals|develop.*(events|ideas)|unfold a series/i, 'author_purpose'],
  [/word.?choice|connotation|denotation|loaded language|shade of meaning|how the author (says|word|writes)|tone|diction|sentence (structure|variety)|rhythm|figurative|metaphor|simile|personif|hyperbol|symbol|imagery|irony|verbal|situational|dramatic|motif|recurring|alliterat|archetyp|hero.?s journey/i, 'act_rhetoric'],

  // Words, and what they are doing in this particular text.
  [/vocab|diction|context clue|unfamiliar word|new word|glossar|thesaurus|dictionar|connotation|denotation|word.?part|prefix|suffix|root|etymolog|shades? of meaning|literal meaning|word.?in context|denote|refer(s|ent)? to|pronoun|antecedent/i, 'vocab_context'],
  [/satire|parody|search tools|keywords|sidebar|hyperlink|multimedia|digital text|news article|feature/i, 'vocab_context'],

  // Fiction, and how a novel works.
  [/character|setting|plot|theme|conflict|resolution|foreshadow|flashback|symbolism|allegor|poem|poetry|verse|stanza|rhyme|haiku|prose|nonfiction|expositional|biograph|memoir|informational text|novel|short stor|folktale|fairy tale|myth|legend|fable|fantasy|realism|historical fiction/i, 'vocab_context'],
  [/drama|play|tragedy|comedy|romance|performance|stage|screenplay|act(ing)? out|sonnet|villanelle|ballad|shakespeare|chaucer|beowulf|medieval|renaissance|modernism|postwar|contemporary|transatlantic|anglophone|world literature|caribbean|african|asian|latin american|queer|gender studies|children.?s|young adult|film|circular|visual arts|music|religion|science|trauma|testimony|disaster|epic|oral|literature/i, 'vocab_context'],
  [/narratolog|reception history|new historicism|cultural materialism|disability studies|gender and sexuality|world literature: theories|translation studies|ethics and literature|deconstruction|derrida|foucault|power, and discourse|reader response|historiograph|interdisciplinary approaches|rethinking literary|shaping.*(field|literary)|editing a collection/i, 'act_science'],

  // Reading that has to be argued with rather than understood.
  [/argument|counterargument|claim|rebuttal|refut|evaluate|assess the (author|argument|evidence)|compare accounts|accounts of|firsthand|secondhand|balance|critical|reliable source|evaluate sources|credibility|who is more credible|sourcing|who wrote it/i, 'act_data'],
  [/opinion|fact|distinguish|misleading|research|abstract|journal|scholarly|citation|peer.?review|methodolog|literature review/i, 'act_data'],

  // Reading at the level of the discipline, and reading a discipline.
  [/reading a (field|discipline|body)|field|discipline|critique|theory|canon|period|movement|genre|tradition|historical context|political rhetoric/i, 'act_science'],
  [/close reading|hermeneut|theory of reading|how we read|what reading is|reading as|cognitive|psychology of|eye tracking|legacy/i, 'act_science'],
  // The graduate material: the study of texts as objects, the digital work done to
  // them, and the science of teaching reading. Bracketed prefixes are the
  // creator's own field labels, so they are matched deliberately.
  [/^\[(literature|textual scholarship|digital humanities|reading science)\]|seminar in|seminar$|studies seminar|studies in/i, 'act_science'],
  [/paleograph|codicolog|manuscript|tei|text encoding|encoding|digitization|digital archiv|born.?digital|preservation|digital editions?|textual criticism|editions|transcription|codicolog|spatial humanities|literary mapping/i, 'act_science'],
  [/distant reading|text mining|corpus|natural language processing|machine learning|language models|literary analysis|computational/i, 'act_science'],
  [/reading development|reading disorder|dyslexia|emergent literacy|assessment of reading|readability|instructional materials|structured literacy|disciplinary and adolescent|digital literacy|online reading|intervention design|administration and leadership of literacy|literacy program|clinical practicum|multilingual reading|empirical studies|measurement of reading|literacy policy|literacy assessment|comprehensive exam/i, 'act_science'],
  [/biblio|citation|editorial|scholarship|curriculum|syllabus|exam|program|leadership|admin/i, 'act_science'],
];

const { grades, unknownTypes } = readSheet(SRC, skillFor);

// An Activity, a Summary, a quiz and a review all name a lesson in their title —
// "Activity 3 of 9 (quiz/game): Blend and Read Words - Silent Letters" is a drill
// on the lesson called "Silent Letters". So when a level matches no rule of its
// own, it is asked again with the part of its title after the dash, and if that
// is still nothing, with the whole title minus the "Activity N of 9" prefix. That
// leaves 780 levels before this and about ninety after it, and the difference is
// that a drill on a lesson is now asked from the lesson's own material rather
// than from whichever skill the grade happened to list first.
//
// A level that still matches nothing is served from the whole skill its grade is
// built from, which is a broader question rather than a wrong one.
for (const g of grades) {
  // The level -> skill map the lessons themselves gave, so a drill can be looked
  // up by the lesson it names.
  const byLesson = new Map();
  for (const l of g.levels) {
    if (l.skill && l.kind === 'lesson') byLesson.set(l.title.toLowerCase(), l.skill);
  }
  for (const l of g.levels) {
    if (l.skill) continue;
    // The part after " - ", which is the lesson a drill or a quiz sits on.
    const dash = l.title.indexOf(' - ');
    if (dash > 0) {
      const named = byLesson.get(l.title.slice(dash + 3).trim().toLowerCase());
      if (named) { l.skill = named; continue; }
    }
    // "Activity 3 of 9 (quiz/game): Match the Sound - Hearing Word Boundaries" —
    // drop the numbering and see whether what is left is a lesson.
    const stripped = l.title.replace(/^Activity\s+\d+\s+of\s+\d+\s*\([^)]*\)\s*:\s*/i, '')
      .replace(/^Grade Review Activity\s+\d+\s+of\s+\d+\s*\([^)]*\)\s*:\s*/i, '')
      .replace(/^Master Quiz\s+\d+\s*\(Cycle\s+\d+\)\s*-\s*/i, '')
      .replace(/^Grand Master Quiz\s*\(Cycle\s+\d+\)\s*-\s*/i, '')
      .trim();
    const direct = byLesson.get(stripped.toLowerCase());
    if (direct) { l.skill = direct; continue; }
    const inner = dash > 0 ? l.title.slice(dash + 3).trim().toLowerCase() : null;
    if (inner && byLesson.has(inner)) { l.skill = byLesson.get(inner); }
  }
}

writeTrack({
  grades,
  out: OUT,
  subject: 'Reading',
  meta: GRADE_META,
  unknownTypes,
});
