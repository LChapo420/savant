/**
 * Generated reading passages, and the questions that come with them.
 *
 * The six hand-written passages in passages.js are better prose than anything
 * generated, but there are six of them, which is five or six questions per
 * reading skill — a learner exhausts the whole bank in one sitting and then reads
 * the same passage for the rest of the track.
 *
 * These families assemble a passage from facts and then ask about those same
 * facts. That is what makes the questions defensible: the answer is not something
 * a model decided, it is a number or a clause that the template put into the text
 * two paragraphs earlier. Every question here can be checked against the passage
 * it shipped with, which is the standard a reading item has to meet.
 *
 * Narrative and literary reading still comes from the authored passages. What is
 * generated is the informational kind, where the structure — claim, evidence,
 * complication — is genuinely regular.
 */
const { distinctChoices, spread } = require('./pool');

// ── the facts a field-study passage is built from ───────────────────────────
const RESEARCHERS = ['Mira Okonjo', 'Daniel Reis', 'Saskia Lindqvist', 'Tomas Aluko',
  'Hanne Vogel', 'Rafael Duarte', 'Ingrid Sowande', 'Peter Nakamura'];

const SITES = [
  { place: 'a salt marsh east of the river mouth', short: 'the marsh' },
  { place: 'a limestone plateau above the treeline', short: 'the plateau' },
  { place: 'a flooded quarry on the edge of the city', short: 'the quarry' },
  { place: 'a stretch of cold coastline north of the harbor', short: 'the coast' },
  { place: 'an abandoned orchard behind a disused rail line', short: 'the orchard' },
  { place: 'a shallow lake that freezes most winters', short: 'the lake' },
];

// `sites` is where each one can actually live or happen, by the site's short
// name. Drawn independently, the slots put brown trout in an abandoned orchard,
// freshwater mussels in a salt marsh and reed beds on a plateau above the
// treeline — every one of them a sentence a learner would be asked to trust.
const SUBJECTS = [
  { name: 'reed warblers', unit: 'nesting pairs', verb: 'nested', sites: ['the marsh', 'the lake', 'the quarry'] },
  { name: 'freshwater mussels', unit: 'live beds', verb: 'settled', sites: ['the lake', 'the quarry'] },
  { name: 'ground beetles', unit: 'trap counts', verb: 'appeared', sites: ['the marsh', 'the plateau', 'the coast', 'the orchard'] },
  { name: 'wild bees', unit: 'foraging visits', verb: 'foraged', sites: ['the plateau', 'the orchard', 'the marsh'] },
  { name: 'brown trout', unit: 'spawning runs', verb: 'spawned', sites: ['the lake', 'the quarry'] },
  { name: 'moss species', unit: 'recorded patches', verb: 'grew', sites: ['the plateau', 'the quarry', 'the coast', 'the orchard'] },
];

// Every cause is local to one site. Two were weather — "the warm spring arrived
// three weeks early", "the winter ice lasted a month longer" — and the passages
// then said a site eleven kilometres away, under the same weather, never had
// it, and that "the weather was shared; the outcome was not".
const CAUSES = [
  { factor: 'the reed beds were cut back each autumn', lever: 'the autumn cutting', sites: ['the marsh', 'the lake', 'the quarry'] },
  { factor: 'runoff from the new access road reached the water', lever: 'the road runoff', sites: ['the marsh', 'the quarry', 'the coast', 'the lake'] },
  { factor: 'a neighbouring estate began spraying its hedges', lever: 'the hedge spraying', sites: ['the orchard', 'the marsh', 'the lake'] },
  { factor: 'a neighbouring farm switched to drip irrigation', lever: 'the irrigation change', sites: ['the orchard', 'the marsh', 'the lake'] },
  { factor: 'work began on a wind farm along the ridge', lever: 'the wind-farm construction', sites: ['the plateau', 'the coast'] },
];

/** A subject, or a cause, that belongs at the site already drawn. */
const fitsSite = (list) => (rng, out) => rng.pick(list.filter((x) => x.sites.includes(out.site.short)));

/** A word used in a specific sense, so a vocabulary-in-context question has a
 *  defensible answer rather than a dictionary argument. */
const CONTEXT_WORDS = [
  { word: 'marginal', sense: 'small enough to be nearly negligible', decoys: ['located at an edge', 'written in a margin', 'of poor quality'] },
  { word: 'arrested', sense: 'stopped or held in place', decoys: ['taken into custody', 'caught the attention of', 'slowed gradually'] },
  { word: 'sustained', sense: 'kept up over a long period', decoys: ['suffered or endured', 'supported from below', 'nourished'] },
  { word: 'novel', sense: 'new and previously unseen', decoys: ['a long work of fiction', 'unusually complicated', 'unwelcome'] },
  { word: 'depressed', sense: 'pushed down to a lower level', decoys: ['unhappy', 'hollowed out', 'flattened by weight'] },
  { word: 'thin', sense: 'weak and unconvincing', decoys: ['narrow in width', 'sparse in number', 'watery'] },
  { word: 'exposed', sense: 'left without shelter', decoys: ['revealed to the public', 'photographed', 'accused'] },
  { word: 'reserved', sense: 'set aside for a purpose', decoys: ['quiet in manner', 'booked in advance', 'held back in reply'] },
  { word: 'flat', sense: 'unchanging from season to season', decoys: ['smooth to the touch', 'without flavour', 'out of tune'] },
  { word: 'stable', sense: 'holding at the same level', decoys: ['a building for horses', 'firmly balanced', 'long-lasting'] },
  { word: 'fine', sense: 'small enough to be hard to see', decoys: ['acceptable', 'a penalty payment', 'of high quality'] },
  { word: 'broken', sense: 'interrupted rather than continuous', decoys: ['damaged beyond use', 'defeated in spirit', 'bankrupt'] },
  { word: 'plain', sense: 'obvious once seen', decoys: ['undecorated', 'a wide flat region', 'ordinary'] },
  { word: 'charged', sense: 'given a formal responsibility', decoys: ['accused of a crime', 'filled with electricity', 'billed for payment'] },
  { word: 'measured', sense: 'careful and restrained', decoys: ['recorded with instruments', 'cut to length', 'weighed'] },
  { word: 'checked', sense: 'held back from increasing', decoys: ['examined for errors', 'marked with a tick', 'patterned in squares'] },
  { word: 'dear', sense: 'expensive', decoys: ['much loved', 'a form of address', 'closely held'] },
  { word: 'grave', sense: 'serious enough to worry about', decoys: ['a burial place', 'slow and heavy', 'engraved'] },
  { word: 'spare', sense: 'plain and without excess', decoys: ['kept in reserve', 'thin in build', 'to show mercy'] },
  { word: 'want', sense: 'a shortage of something needed', decoys: ['a wish for something', 'poverty', 'a request'] },
  { word: 'close', sense: 'careful and detailed', decoys: ['nearby', 'to shut', 'stuffy'] },
  { word: 'even', sense: 'steady and without variation', decoys: ['smooth and flat as a surface', 'divisible by two', 'as well'] },
  { word: 'short', sense: 'not enough to meet the need', decoys: ['small in height', 'brief in time', 'curt in manner'] },
  { word: 'sound', sense: 'reliable and free of faults', decoys: ['a noise', 'a narrow sea channel', 'to measure a depth'] },
  { word: 'rough', sense: 'approximate rather than exact', decoys: ['uneven to the touch', 'violent', 'unfinished'] },
  { word: 'marked', sense: 'clearly noticeable', decoys: ['written on', 'graded', 'followed closely'] },
  { word: 'ready', sense: 'available without delay', decoys: ['prepared for something', 'willing', 'quick to react'] },
  { word: 'body', sense: 'a large quantity gathered together', decoys: ['a physical form', 'a corpse', 'the main part of a text'] },
  { word: 'address', sense: 'to deal with directly', decoys: ['where someone lives', 'to speak to a crowd', 'a formal speech'] },
  { word: 'reduced', sense: 'made smaller in extent', decoys: ['lowered in price', 'boiled down', 'demoted'] },
  { word: 'bearing', sense: 'relevance to the matter', decoys: ['a compass direction', 'a way of carrying oneself', 'a machine part'] },
  { word: 'qualified', sense: 'limited by conditions', decoys: ['formally trained', 'eligible', 'certified'] },
  { word: 'telling', sense: 'revealing more than intended', decoys: ['narrating', 'counting', 'instructing'] },
  { word: 'arrested', sense: 'stopped or held in place', decoys: ['taken into custody', 'caught the attention of', 'slowed gradually'] },
  { word: 'stiff', sense: 'severe or hard to meet', decoys: ['not easily bent', 'formal in manner', 'sore'] },
  { word: 'raised', sense: 'brought up for discussion', decoys: ['lifted higher', 'brought up as a child', 'increased'] },
  { word: 'settled', sense: 'decided beyond further argument', decoys: ['moved in to live', 'calmed down', 'paid in full'] },
  { word: 'drawn', sense: 'taken from a source', decoys: ['sketched', 'pulled', 'tired-looking'] },
  { word: 'held', sense: 'stayed at the same level', decoys: ['grasped', 'contained', 'believed'] },
  { word: 'hollow', sense: 'without real substance', decoys: ['empty inside', 'sunken', 'echoing'] },
  { word: 'tired', sense: 'stale from being used too often', decoys: ['in need of sleep', 'short of breath', 'bored'] },
  { word: 'threadbare', sense: 'weak from being used too often', decoys: ['worn down to the threads', 'poorly dressed', 'cheaply made'] },
  { word: 'level', sense: 'holding at one value without rising or falling', decoys: ['flat and horizontal', 'a floor of a building', 'a tool for checking surfaces'] },
  { word: 'frozen', sense: 'held at one value without changing', decoys: ['turned to ice', 'very cold', 'unable to move from fear'] },
  { word: 'fixed', sense: 'not changing over time', decoys: ['repaired', 'fastened in place', 'arranged dishonestly'] },
  { word: 'shaky', sense: 'poorly supported by evidence', decoys: ['trembling', 'unsteady on its feet', 'nervous'] },
  { word: 'flimsy', sense: 'too weak to be convincing', decoys: ['easily torn', 'lightly built', 'see-through'] },
  { word: 'brittle', sense: 'likely to give way under a challenge', decoys: ['hard and easily snapped', 'sharp in tone', 'dried out'] },
];

/**
 * The words a passage may actually use. A word only has a sense in context if
 * the context gives it that sense, and each passage puts its word in one fixed
 * place: the study passage says an objection "looks ___", the other three call a
 * count that never moved "___". Drawing from the whole list above put "dear",
 * "address" and "body" in those places — "the objection looks body" — and then
 * asked what the word meant there.
 */
const pickWords = (names) => CONTEXT_WORDS.filter((w) => names.includes(w.word));
/** Words that describe an objection as weak: "the objection ... looks ___". */
const WEAK_WORDS = pickWords(['thin', 'marginal', 'hollow', 'tired', 'threadbare', 'shaky', 'flimsy', 'brittle']);
/** Words that describe a figure that has not moved: "a count that ___ for that long". */
const STEADY_WORDS = pickWords(['flat', 'stable', 'even', 'level', 'frozen', 'fixed']);

/**
 * "Which reading of the word does NOT fit the way the passage uses it?" offered
 * the three dictionary decoys and the passage's sense — so three of the four
 * options did not fit, and one of them was keyed. Asked as a pairing instead (the
 * meaning the word has here, then one it does not have here), exactly one option
 * puts the passage's sense first.
 */
function notFitting(w) {
  const key = `${w.sense}, rather than ${w.decoys[0]}`;
  return {
    p: `Which pairing describes how the passage uses "${w.word}": the meaning it has here, then a meaning it does not have here?`,
    c: distinctChoices(key, w.decoys.map((d) => `${d}, rather than ${w.sense}`)),
    a: key,
  };
}

const FAMILIES = {};

/**
 * One field-study passage, and every reading question that can be asked of it.
 *
 * `build` returns the text plus the derived facts, so each question family below
 * renders the same passage and asks its own question about it.
 */
function study(s) {
  const drop = s.before - s.after;
  const share = Math.round((drop / s.before) * 100);
  const text = `For ${s.years} years ${s.researcher} counted ${s.subject.name} at ${s.site.place}, `
    + `and for most of that time the figures barely moved: ${s.before} ${s.subject.unit} in an average `
    + `season, give or take a handful. The change, when it came, was not gradual. In the first season `
    + `after ${s.cause.factor}, the count fell to ${s.after}, and it stayed there the following year `
    + `and the year after that. ${s.researcher.split(' ')[0]} had expected some effect and found the `
    + `size of it hard to credit: ${aNumber(share)} percent drop is not a bad season, it is a different site.\n\n`
    + `What made the case convincing was a second location. Eleven kilometres away, a stretch of the `
    + `same habitat where ${s.cause.lever} never happened held steady at ${s.before} through the same `
    + `three seasons. The weather was shared; the outcome was not. Against that comparison the `
    + `objection that ${s.subject.name} simply have poor years everywhere looks ${s.contextWord.word}, `
    + `and the report published in the spring said so in one sentence and moved on.`;
  return { text, drop, share };
}

const STUDY_SLOTS = {
  researcher: RESEARCHERS,
  site: SITES,
  subject: fitsSite(SUBJECTS),
  cause: fitsSite(CAUSES),
  contextWord: WEAK_WORDS,
  years: [nine(), 12, 14, 17, 21],
  before: [46, 58, 64, 72, 85, 93],
  after: [8, 11, 14, 19, 23],
};

function nine() { return 9; }

/** "a 64", but "an 87", "an 8" and "an 11": the article follows how the number is said. */
function aNumber(n) {
  return /^8/.test(String(n)) || n === 11 || n === 18 ? `an ${n}` : `a ${n}`;
}

/** Shorthand for a family over one generated passage. */
function onStudy(d, ask) {
  return {
    d,
    slots: STUDY_SLOTS,
    pass: (s) => study(s).text,
    p: (s) => ask(s, study(s)).p,
    c: (s) => ask(s, study(s)).c,
    a: (s) => ask(s, study(s)).a,
    r: (s) => ask(s, study(s)).r,
  };
}

// Every correct answer below names something from its own passage — the subject,
// the site, the cause, a number. An answer phrased the same way for every passage
// would let a learner pick it without reading, which is the same problem as a
// repeated question wearing a new coat.
FAMILIES.main_idea = [
  onStudy(4, (s, f) => ({
    p: 'Which statement best expresses the main idea of the passage?',
    c: distinctChoices(
      `A second site unaffected by ${s.cause.lever} is what made the ${s.subject.name} decline convincing`,
      [`${s.subject.name.charAt(0).toUpperCase() + s.subject.name.slice(1)} are in decline everywhere`,
        `${s.researcher} spent ${s.years} years at ${s.site.short} without reaching a conclusion`,
        `Weather explains the fall from ${s.before} to ${s.after}`],
    ),
    a: `A second site unaffected by ${s.cause.lever} is what made the ${s.subject.name} decline convincing`,
    r: `The passage spends its second half on the unaffected stretch holding at ${s.before}, which is`
      + ' what rules out a generally bad season and makes the drop mean something.',
  })),
  onStudy(6, (s, f) => ({
    p: 'The passage is primarily concerned with',
    c: distinctChoices(
      `showing that ${s.cause.lever} was responsible for the change at ${s.site.short}`,
      [`the history of work at ${s.site.short}`,
        `the difficulty of counting ${s.subject.name} accurately`,
        `why ${s.years}-year studies are more reliable than short ones`],
    ),
    a: `showing that ${s.cause.lever} was responsible for the change at ${s.site.short}`,
    r: `The structure is a stable baseline, a change after ${s.cause.lever}, and a comparison site —`
      + ' that is an argument about cause, not a history or a method note.',
  })),
];

FAMILIES.detail_support = [
  onStudy(3, (s, f) => ({
    p: `According to the passage, how many ${s.subject.unit} were counted in an average season`
      + ' before the change?',
    c: distinctChoices(String(s.before), [String(s.after), String(f.drop), String(s.years)]),
    a: String(s.before),
    r: `The passage gives ${s.before} ${s.subject.unit} as the long-run average before the change.`,
  })),
  onStudy(4, (s, f) => ({
    p: 'According to the passage, what happened at the second location?',
    c: distinctChoices(
      `It held steady at ${s.before} through the same three seasons`,
      [`It fell to ${s.after} a year later`, 'It was never counted',
        'It recovered after one poor season'],
    ),
    a: `It held steady at ${s.before} through the same three seasons`,
    r: `The text says the comparison stretch "held steady at ${s.before} through the same three seasons."`,
  })),
  onStudy(5, (s, f) => ({
    p: 'How long did the count stay at its lower level, according to the passage?',
    c: distinctChoices(`Three seasons, ending at ${s.after} ${s.subject.unit}`,
      ['One season only', `${s.years} years`, 'The passage does not say']),
    a: `Three seasons, ending at ${s.after} ${s.subject.unit}`,
    r: 'The fall happened in the first season after the change and "stayed there the following year'
      + ' and the year after that," which is three seasons.',
  })),
];

FAMILIES.inference = [
  onStudy(6, (s, f) => ({
    p: 'The passage most strongly suggests that the researcher considered the second location',
    c: distinctChoices(
      `necessary to rule out anything ${s.site.short} and the comparison stretch had in common`,
      [`more important than ${s.site.short} itself`, 'a waste of effort',
        `evidence that the ${s.subject.name} will not return`],
    ),
    a: `necessary to rule out anything ${s.site.short} and the comparison stretch had in common`,
    r: 'The sentence "The weather was shared; the outcome was not" is the whole point of the second'
      + ' site: it removes the explanations common to both.',
  })),
  onStudy(7, (s, f) => ({
    p: `It can reasonably be inferred that if ${s.cause.lever} were reversed,`,
    c: distinctChoices(
      `the ${s.subject.unit} might recover, though the passage does not promise it`,
      [`the count would return to ${s.before} within one season`,
        'nothing would change, because the cause is the weather',
        'the comparison stretch would begin to decline'],
    ),
    a: `the ${s.subject.unit} might recover, though the passage does not promise it`,
    r: 'The passage establishes the cause but says nothing about reversing it, so anything stronger'
      + ' than a possibility goes beyond the text.',
  })),
];

FAMILIES.author_purpose = [
  onStudy(7, (s, f) => ({
    p: 'The detail that the report "said so in one sentence and moved on" primarily serves to',
    c: distinctChoices(
      `suggest that the comparison stretch had settled the question about ${s.subject.name}`,
      ['criticize the report for being too brief', 'show that the finding was ignored',
        `introduce new work on ${s.cause.lever}`],
    ),
    a: `suggest that the comparison stretch had settled the question about ${s.subject.name}`,
    r: 'Dismissing an objection in one sentence is what you do with an objection that no longer'
      + ' needs arguing, which is the effect the comparison site had.',
  })),
  onStudy(5, (s, f) => ({
    p: `Why does the passage mention that the drop was "not gradual"?`,
    c: distinctChoices(
      `To point at something that happened in one season, such as ${s.cause.lever}`,
      [`To suggest the earlier count of ${s.before} was wrong`,
        `To show that ${s.researcher.split(' ')[0]} was surprised`,
        `To explain why the study ran for ${s.years} years`],
    ),
    a: `To point at something that happened in one season, such as ${s.cause.lever}`,
    r: `A change that arrives in one season points at something that happened in that season —`
      + ` here, ${s.cause.lever}.`,
  })),
];

FAMILIES.author_purpose.push(
  onStudy(4, (s) => ({
    p: `Why does the passage give the figure ${s.before} twice — once for ${s.site.short}`
      + ' and once for the comparison stretch?',
    c: distinctChoices(
      'To make the two sites directly comparable before the change',
      [`To show that ${s.researcher.split(' ')[0]} counted carefully`,
        `To suggest ${s.subject.name} always number about ${s.before}`,
        'To fill out the second paragraph'],
    ),
    a: 'To make the two sites directly comparable before the change',
    r: `Both sites sitting at ${s.before} beforehand is what makes the later difference —`
      + ` ${s.after} against ${s.before} — mean anything at all.`,
  })),
  onStudy(6, (s) => ({
    p: `The sentence "The weather was shared; the outcome was not" functions in the passage as`,
    c: distinctChoices(
      `the step that rules out weather as the cause at ${s.site.short}`,
      ['a description of the local climate', `an admission that the ${s.years}-year record is incomplete`,
        `a transition into the discussion of ${s.cause.lever}`],
    ),
    a: `the step that rules out weather as the cause at ${s.site.short}`,
    r: 'Two sites under the same weather with different outcomes cannot both be explained by the'
      + ' weather, which is exactly the elimination that sentence performs.',
  })),
);

FAMILIES.vocab_context = [
  onStudy(5, (s) => ({
    p: `As used in the last sentence, "${s.contextWord.word}" most nearly means`,
    c: distinctChoices(s.contextWord.sense, s.contextWord.decoys),
    a: s.contextWord.sense,
    r: `The objection is being dismissed against the comparison site, so "${s.contextWord.word}"`
      + ` is being used to mean ${s.contextWord.sense}.`,
  })),
  onStudy(4, (s) => ({
    p: `Which word in the passage is used to mean "${s.contextWord.sense}"?`,
    c: distinctChoices(s.contextWord.word,
      // Every option is a word the passage uses. The site's short name is not
      // always one ("the coast" is written "coastline"), so the last word of the
      // place as written is used instead.
      [s.subject.name.split(' ')[0], s.site.place.split(' ').pop(), 'comparison', 'season']),
    a: s.contextWord.word,
    r: `"${s.contextWord.word}" carries that sense in the final sentence; the other words in the`
      + ' passage are being used in their ordinary meanings.',
  })),
  onStudy(7, (s) => ({
    ...notFitting(s.contextWord),
    r: `In this passage "${s.contextWord.word}" means ${s.contextWord.sense},`
      + ` and ${s.contextWord.decoys[0]} is a meaning the word has elsewhere, not here.`,
  })),
];

// ── the other three structures ──────────────────────────────────────────────
/**
 * The study passage above was the only structure, and that was the deeper
 * problem than its six-sentence sameness: a learner could answer every generated
 * reading question having read the first paragraph, because the first paragraph
 * was always the same three claims in the same order.
 *
 * So the structure varies now, not only the content. Each of the three below is
 * a different argument, which means the paragraph that answers a question moves
 * around — a question about the opening cannot be answered from the conclusion
 * here, and vice versa. That is the whole point, and it is why these are
 * passages rather than more slots.
 */
const COMPARISON_SLOTS = {
  ...STUDY_SLOTS,
  contextWord: STEADY_WORDS,
  // Never the first site again: "At a flooded quarry ... At a flooded quarry"
  // is one site compared with itself.
  // And a site where the subject can live, since it is counted there too.
  second: (rng, out) => rng.pick(SITES.filter((x) => x !== out.site && out.subject.sites.includes(x.short))),
  measure: ['the number of nesting pairs', 'the count of recorded patches', 'the trap count per night',
    'the area of open water', 'the measured population'],
};

/** Two places, measured the same way, one answer disagreeing with the other. */
function comparison(s) {
  return {
    name: 'comparison',
    text: `The two sites are eleven kilometres apart and share a weather system, which is what makes the`
      + ` comparison worth running. At ${s.site.place} the long-run figure for ${s.subject.name} sits near`
      + ` ${s.before} ${s.subject.unit}, and it has been ${s.contextWord.word} for as long as anyone has`
      + ` counted. At ${s.second.place} the same measure, taken the same way over the`
      + ` same ${s.years} years, sits near ${s.after}. The first instinct is to look for something local`
      + ` — a different substrate, a different history of grazing — and there is some, but it does not`
      + ` account for a gap of that size.\n\n`
      // The lever, a noun phrase: the factor is a whole clause ("the reed beds were
      // cut back each autumn") and "What separates them is the reed beds were cut
      // back" is not a sentence.
      + `What separates them is ${s.cause.lever}, which happened at ${s.site.short} and nowhere else.`
      + ` The word that keeps doing the work in the discussion is ${s.contextWord.word}: each site was`
      + ` called ${s.contextWord.word} on the strength of a long baseline, and the baseline turns out to`
      + ` be the thing that needs explaining rather than the thing that settles it.`,
    gap: s.before - s.after,
  };
}

/**
 * Someone states a position, concedes what is against it, and holds the line.
 *
 * Every phrase a question below quotes is in this text, and every key is
 * something it says. The first version read `s.held` and `s.fell`, which the
 * slots never had, so it printed "undefined nesting pairs"; and its questions
 * quoted sentences it did not contain ("easy to date and harder to explain", "is
 * not a small thing, and it is not reversible").
 */
function position(s) {
  return {
    name: 'position',
    text: `The survey's position is that ${s.cause.lever} caused the fall at ${s.site.short}, and it is`
      + ` a better case than it first appears. ${s.researcher} counted ${s.subject.name} at ${s.site.place}`
      + ` for ${s.years} years, and for most of that time the figure did not move: ${s.before}`
      + ` ${s.subject.unit} in an average season, give or take a handful. That stability is the strongest`
      // "stays": the word is an adjective, and "a figure that flat for that long"
      // has no verb.
      + ` part of the case. A figure that stays ${s.contextWord.word} for that long is being held up by`
      + ` something, and nobody has explained what. Then, in the first season after ${s.cause.factor},`
      + ` the count fell to ${s.after}. The change is easy to date and harder to explain.\n\n`
      + `The objection is the obvious one, and it is not weak: no one was watching closely enough to`
      + ` catch a bad count in any season. The survey has no way to answer it, because a count nobody`
      + ` checked at the time cannot be checked now, and it says so. Two other explanations survive,`
      + ` and both are more clever than the one on offer, but neither fits the timing as well. The survey`
      + ` kept ${s.cause.lever} as its explanation because abandoning it would have required a thorough`
      + ` survey of the surrounding area, and there was no time for one. That does not make it wrong,`
      + ` only untested. Whatever the cause was, it is not a small thing, and it is not reversible.`
      + ` It will still be there in a year, whatever is decided.`,
    held: s.before,
    fell: s.after,
  };
}

/** A cause, a long clean record, and the question the record cannot answer. */
function mechanism(s) {
  return {
    name: 'mechanism',
    text: `The survey found the cause. It also found that the cause is not the site. Both sentences are`
      + ` in the report, in that order, and the second is the one worth arguing about. For ${s.years}`
      + ` years the count at ${s.site.place} was ${s.contextWord.word} in the strict sense:`
      + ` ${s.before} ${s.subject.unit} in an average season, with almost no variation across the whole`
      + ` span, a figure held in place by something until it fell to ${s.after}. The change was that`
      + ` ${s.cause.factor}, and ${s.researcher} is confident of it. So the survey did two things: it`
      + ` identified the cause, and it recorded a clean history.\n\n`
      + `The count is hard to explain because the site did not change: no new ditches, no new path,`
      + ` nothing that ${s.site.short} itself could have done. It is not clear the thing ever came from`
      + ` the site. A second explanation was dismissed, but the evidence fits both explanations equally`
      + ` well, and the favoured one cannot be tested without a record that does not exist. A cause that`
      + ` leaves a record can be traced; this one left nothing else behind. That absence is itself the`
      + ` evidence: only something from outside the site could move the count and leave the site`
      + ` untouched. If nothing was done about it, nothing was. Either way, the consequence will`
      + ` outlast the decision.`,
    held: s.before,
    fell: s.after,
  };
}

/**
 * One family over one generated passage, asked in one way.
 *
 * `ask` is a single function of the slots and the built passage, rather than a
 * bundle, because the shape has to be known before the passage is rendered: the
 * picker filters families by shape, so a shape that only exists after rendering
 * is a shape the picker cannot avoid.
 */
const onStructure = (d, pass, ask) => ({
  d,
  slots: COMPARISON_SLOTS,
  // The structure's name and the question's own frame, so two structures asking
  // the same thing about different texts are two shapes, and one structure asking
  // two different things is also two shapes.
  //
  // This used to read `pass.name` and `ask.frame` at build time. Both are
  // functions: a function has a `.name` — the engine's guess at the variable,
  // which came out right only by accident — and no `.frame` at all. Every one of
  // these families was therefore framed "comparison: undefined", "position:
  // undefined" or "mechanism: undefined", so a skill with nine questions
  // reported three shapes and the picker could not tell two different questions
  // apart.
  //
  // The frame is inside what `ask` returns. Calling it here needs the slots, so
  // it is called against a probe built from the slot banks: every field is the
  // first value in its list, which is enough for `frame` (a constant string)
  // and is thrown away immediately after. The real call still happens per item.
  frame: (() => {
    const probe = {};
    for (const [name, bank] of Object.entries(COMPARISON_SLOTS)) {
      probe[name] = Array.isArray(bank) ? bank[0] : bank;
    }
    try {
      return `${pass.name}: ${ask(probe, pass(probe)).frame}`;
    } catch (err) {
      // A probe that cannot build a passage is not a reason to fail the module:
      // the family still works, it just falls back to the structure's name, and
      // the shape filter treats it as one shape rather than none.
      return `${pass.name}: unframed`;
    }
  })(),
  pass: (s) => pass(s).text,
  p: (s) => ask(s, pass(s)).p,
  c: (s) => ask(s, pass(s)).c,
  a: (s) => ask(s, pass(s)).a,
  r: (s) => ask(s, pass(s)).r,
});

// Each structure is asked about in its own way, and the questions point at
// different parts of the text, because the text is laid out differently.
const COMPARISON_ASKS = {
  main_idea: [
    (s, f) => ({
      frame: 'which statement best expresses the main idea',
      p: 'Which statement best expresses the main idea of the passage?',
      c: distinctChoices(
        'Two sites measured the same way gave different answers, and the difference is local',
        ['One of the two sites has been badly counted', 'Weather is the only influence on either site',
          `${s.years} years of counting are unreliable at this scale`],
      ),
      a: 'Two sites measured the same way gave different answers, and the difference is local',
      r: 'Both sites are measured identically and the gap between them is large; the whole'
        + ' passage turns on that comparison rather than on either site alone.',
    }),
    (s, f) => ({
      frame: 'what the comparison establishes',
      p: 'By measuring both sites the same way, the passage is able to',
      c: distinctChoices('rule out a general explanation for both figures', ['estimate the total population',
        'establish which site should be closed', 'show the measure itself is unreliable'],
      ),
      a: 'rule out a general explanation for both figures',
      r: 'A shared weather system and an identical method mean a shared cause is ruled out, which is'
        + ' what makes the local one worth looking at.',
    }),
  ],
  detail_support: [
    (s, f) => ({
      frame: 'how far apart the two sites are',
      p: 'According to the passage, how far apart are the two sites?',
      c: distinctChoices('Eleven kilometres',
        ['Three kilometres', 'One hundred kilometres', 'They are in the same valley']),
      a: 'Eleven kilometres',
      r: 'The passage opens by saying the two sites "are eleven kilometres apart".',
    }),
    (s, f) => ({
      frame: 'which explanation the first instinct reaches for',
      p: 'The passage says the first instinct is to look for something local, and names it as',
      c: distinctChoices('a different substrate or grazing history',
        ['a change in the counting method', 'a difference in the weather system', 'a different set of species']),
      a: 'a different substrate or grazing history',
      r: 'It is named at the end of the first paragraph: "a different substrate, a different history of grazing".',
    }),
  ],
  inference: [
    (s, f) => ({
      frame: 'what the label applied to both sites implies',
      p: 'The passage says each site was called "' + s.contextWord.word + '" on the strength of a long baseline. This implies that',
      c: distinctChoices('the label rested on a stability the comparison has now complicated',
        ['the label was applied without any measurement at all',
          'the label was correct in both cases', 'the baseline was measured only once']),
      a: 'the label rested on a stability the comparison has now complicated',
      r: 'A long baseline is what justified the label, and the passage then says the baseline "turns out to be'
        + ' the thing that needs explaining" — so the label is now less secure than it was.',
    }),
    (s, f) => ({
      frame: 'why a shared weather system matters to the argument',
      p: 'The passage opens by noting the two sites share a weather system. The main reason this matters is that it',
      c: distinctChoices('makes a general weather explanation unlikely as the cause of the gap',
        ['reduces the cost of measuring both sites', 'explains why the two sites were chosen',
          'shows that both sites have the same species']),
      a: 'makes a general weather explanation unlikely as the cause of the gap',
      r: 'A shared weather system rules out weather as the differentiating cause, which is what'
        + ' licenses the search for something local.',
    }),
  ],
  author_purpose: [
    (s, f) => ({
      frame: 'what the local-explanation detail serves to show',
      p: 'The passage says there is local variation but that it "does not account for a gap of that size." This mainly serves to',
      c: distinctChoices('rule out the easy explanation before offering the harder one',
        ['suggest the study was inconclusive', 'show the second site is less reliable',
          'indicate the first site was chosen badly']),
      a: 'rule out the easy explanation before offering the harder one',
      r: 'It disposes of the comfortable account so that the local cause in the next paragraph'
        + ' carries more weight.',
    }),
    (s, f) => ({
      frame: 'why the passage returns to the word at the end',
      p: 'The passage ends by returning to the word used to describe both sites. The effect is to',
      c: distinctChoices('leave the reader with a term whose meaning has shifted under the argument',
        ['give the reader a summary of the finding', 'introduce a new piece of evidence',
          'show the two sites have been renamed']),
      a: 'leave the reader with a term whose meaning has shifted under the argument',
      r: 'The word is introduced as a description and comes back as something that needs explaining,'
        + ' and the passage ends there rather than resolving it.',
    }),
  ],
  vocab_context: [
    (s, f) => ({
      frame: 'what the word means in this passage',
      p: `As used in the passage, "${s.contextWord.word}" most nearly means`,
      c: distinctChoices(s.contextWord.sense, s.contextWord.decoys),
      a: s.contextWord.sense,
      r: `The word is used to characterise a long unchanging baseline at both sites, so it means`
        + ` ${s.contextWord.sense} in this passage.`,
    }),
    (s, f) => ({
      frame: 'which reading of the word does not fit',
      ...notFitting(s.contextWord),
      r: `Here it means ${s.contextWord.sense}, and ${s.contextWord.decoys[0]} is a meaning the word has`
        + ' elsewhere, not here.',
    }),
  ],
};

const POSITION_ASKS = {
  main_idea: [
    (s, f) => ({
      frame: 'why the passage opens by setting out the opposing case',
      p: 'The passage quotes the objection that "no one was watching closely enough to catch a bad count in any season." Its main purpose is to',
      c: distinctChoices('show why the objection cannot be answered rather than dismiss it',
        ['warn readers not to trust the survey', 'suggest the counts were fabricated',
          'explain why the site was abandoned']),
      a: 'show why the objection cannot be answered rather than dismiss it',
      r: 'The objection is followed at once by "the survey has no way to answer it," and the reason why,'
        + ' so the passage admits the point instead of waving it away.',
    }),
    (s, f) => ({
      frame: 'what the passage offers as the strongest support for its case',
      p: 'The passage\'s strongest support for its position is that',
      c: distinctChoices('the stability of the count for a long period is itself unexplained',
        ['the argument began from the numbers rather than from opinion',
          'the cause is visible from the path', 'the species is well studied elsewhere'],
      ),
      a: 'the stability of the count for a long period is itself unexplained',
      r: `The count held near ${f.held} for ${s.years} years, and the passage calls that stability "the`
        + ' strongest part of the case" because "nobody has explained" what held it there.',
    }),
  ],
  detail_support: [
    (s, f) => ({
      frame: 'what the change is not being described as',
      p: 'According to the passage, the change at the site is best described as',
      c: distinctChoices('easy to date and hard to explain',
        ['gradual and well understood', 'sudden and irreversible', 'unlikely to have any real cause']),
      a: 'easy to date and hard to explain',
      r: 'The passage opens with exactly that phrasing: "easy to date and harder to explain."',
    }),
    (s, f) => ({
      frame: 'what the cause is said to be',
      p: 'The passage states that the cause was',
      c: distinctChoices('not a small thing, and not reversible',
        ['temporary and likely to pass', 'the only influence at work', 'unknown but probably minor']),
      a: 'not a small thing, and not reversible',
      r: 'The text says the cause "is not a small thing, and it is not reversible."',
    }),
  ],
  inference: [
    (s, f) => ({
      frame: 'what the stability of the count implies',
      p: 'The passage notes the count held near the same figure for many years. This suggests that',
      c: distinctChoices('something was preventing the count from changing, and then stopped',
        ['the species was newly introduced to the site', 'the counting method was introduced recently',
          'the site had recently been abandoned']),
      a: 'something was preventing the count from changing, and then stopped',
      r: 'The passage says a figure that steady "is being held up by something" — and the fall is'
        + ' what happens when that something gave way.',
    }),
    (s, f) => ({
      frame: 'what the reason given for abandoning the idea implies',
      p: 'The passage reports that abandoning one explanation would have required a thorough survey of the surrounding area. This implies',
      c: distinctChoices('the explanation was reasonable but could not be tested in the time available',
        ['the survey would have disproved the explanation',
          'the species was not present in the surrounding area',
          'the cause is unrelated to anything nearby']),
      a: 'the explanation was reasonable but could not be tested in the time available',
      r: 'An explanation that could not be tested was not necessarily wrong, and the next sentence says'
        + ' so: "That does not make it wrong, only untested."',
    }),
  ],
  author_purpose: [
    (s, f) => ({
      frame: 'what the concession is there to do',
      p: 'The passage allows that the two other explanations are "more clever than the one on offer." This mainly serves to',
      c: distinctChoices('show the case is fair to its rivals while explaining why it still prefers its own',
        ['show that the other explanations are correct',
          'suggest the survey was badly designed', 'indicate the cause has since been identified'],
      ),
      a: 'show the case is fair to its rivals while explaining why it still prefers its own',
      r: 'The concession is followed at once by "neither fits the timing as well", so the passage grants'
        + ' the rivals their appeal and still keeps its own explanation.',
    }),
    (s, f) => ({
      frame: 'what the final claim about one more year implies',
      p: 'The passage ends by saying the cause "will still be there in a year, whatever is decided." This implies',
      c: distinctChoices('the cause is unlikely to change soon whatever decision is taken',
        ['a decision is expected within the year',
          'the site will be closed within the year', 'the survey will be repeated next year']),
      a: 'the cause is unlikely to change soon whatever decision is taken',
      r: 'The closing line says the cause will outlast any decision, so whatever is decided, the thing'
        + ' causing the problem is not going away soon.',
    }),
  ],
  vocab_context: [
    (s, f) => ({
      frame: 'what the word means in this passage',
      p: `As used in the passage, "${s.contextWord.word}" most nearly means`,
      c: distinctChoices(s.contextWord.sense, s.contextWord.decoys),
      a: s.contextWord.sense,
      r: `The word describes a count that did not move for ${s.years} years, so it means`
        + ` ${s.contextWord.sense} here.`,
    }),
    (s, f) => ({
      frame: 'which reading of the word does not fit',
      ...notFitting(s.contextWord),
      r: `Here it means ${s.contextWord.sense}, and ${s.contextWord.decoys[0]} is a meaning the word has`
        + ' elsewhere, not here.',
    }),
  ],
};

const MECHANISM_ASKS = {
  main_idea: [
    (s, f) => ({
      frame: 'what makes the cause worth keeping despite the open-ended question',
      p: 'The passage closes by saying that the consequence will outlast the decision. Its main purpose is to',
      c: distinctChoices('warn that solving the riddle quickly may not matter',
        ['show that the decision has already been made',
          'argue the site should be closed immediately', 'explain how the cause was identified']),
      a: 'warn that solving the riddle quickly may not matter',
      r: 'The passage raises the cause, the long clean history and the difficulty of testing the'
        + ' explanation, then ends on "the consequence will outlast the decision": settling the question'
        + ' quickly would not undo what has happened.',
    }),
    (s, f) => ({
      frame: 'what the passage is primarily concerned with',
      p: 'The passage is primarily concerned with',
      c: distinctChoices('why one explanation is difficult to test even when it seems strongest',
        ['the history of the site before the count was taken',
          'how the species was first identified', 'the disagreements between two surveys']),
      a: 'why one explanation is difficult to test even when it seems strongest',
      r: 'The explanations are set out, then the difficulty of testing the favoured one is'
        + ' the turn the passage takes and never leaves.',
    }),
  ],
  detail_support: [
    (s, f) => ({
      frame: 'what the causes are said to be in relation to one another',
      p: 'According to the passage, the explanation the survey favours and the one it dismisses are',
      c: distinctChoices('equally supported by the evidence given',
        ['both confirmed by other surveys', 'known to be impossible', 'contradicted by the long record']),
      a: 'equally supported by the evidence given',
      r: 'The passage says "the evidence fits both explanations equally well," which is the'
        + ' whole reason the question is open.',
    }),
    (s, f) => ({
      frame: 'what the survey is said to have done',
      p: 'According to the passage, the survey',
      c: distinctChoices('identified the cause and recorded a clean history',
        ['rejected a cause on thin evidence', 'found no evidence either way', 'confirmed what an earlier survey had found']),
      a: 'identified the cause and recorded a clean history',
      r: 'Those two results are the passage\'s own summary of the survey\'s findings.',
    }),
  ],
  inference: [
    (s, f) => ({
      frame: 'what the record implies about the site',
      p: 'The record shows almost no variation across the whole span. This implies',
      c: distinctChoices('something was actively keeping the figure steady',
        ['the figure was never properly measured', 'the site changed back and forth without notice',
          'the count was fixed by convention in later years']),
      a: 'something was actively keeping the figure steady',
      r: 'The passage calls the steady count "a figure held in place by something", which is what'
        + ' the answer says.',
    }),
    (s, f) => ({
      frame: 'what the non-changeability of the count implies for the cause',
      p: 'The passage notes the count is "hard to explain" because the site did not change. This implies',
      c: distinctChoices('the cause was something other than the site itself',
        ['the cause was the site itself', 'the count was recorded incorrectly',
          'no cause is likely to be found']),
      a: 'the cause was something other than the site itself',
      r: 'The passage says it is "not clear the thing ever came from the site" — so the'
        + ' cause is located elsewhere.',
    }),
  ],
  author_purpose: [
    (s, f) => ({
      frame: 'what the final question is there to leave open',
      p: 'Near its end the passage says "if nothing was done about it, nothing was." Its effect is to',
      c: distinctChoices('leave the reader with the absence of any recorded response',
        ['conclude that the count was unreliable', 'suggest the survey was unnecessary',
          'imply the site should have been closed']),
      a: 'leave the reader with the absence of any recorded response',
      r: 'The line points at a record with no response in it, which is a gap rather than a finding,'
        + ' and the passage leaves it there.',
    }),
    (s, f) => ({
      frame: 'what the comparison between the two cases serves to show',
      p: 'The passage compares a cause that leaves a record with one that "left nothing else behind." This serves to',
      c: distinctChoices('show why the absence of evidence is itself evidence here',
        ['show that one cause is more likely than the other',
          'suggest both causes are equally probable', 'explain why the site was chosen']),
      a: 'show why the absence of evidence is itself evidence here',
      r: 'Right after the comparison the passage says "That absence is itself the evidence": only a'
        + ' cause from outside the site could move the count and leave the site untouched.',
    }),
  ],
  vocab_context: [
    (s, f) => ({
      frame: 'what the word means in this passage',
      p: `As used in the passage, "${s.contextWord.word}" most nearly means`,
      c: distinctChoices(s.contextWord.sense, s.contextWord.decoys),
      a: s.contextWord.sense,
      r: `The word describes a count that stayed at one figure year after year, so it means`
        + ` ${s.contextWord.sense} here.`,
    }),
    (s, f) => ({
      frame: 'which reading of the word does not fit',
      ...notFitting(s.contextWord),
      r: `Here it means ${s.contextWord.sense}, and ${s.contextWord.decoys[0]} is a meaning the word has`
        + ' elsewhere, not here.',
    }),
  ],
};

for (const skill of Object.keys(COMPARISON_ASKS)) {
  // Two questions per structure, and each structure asks its own questions —
  // a question written for a comparison is wrong on a passage that states a
  // position, so the three are kept apart rather than shared.
  FAMILIES[skill] = (FAMILIES[skill] || []).concat([
    onStructure(5, comparison, COMPARISON_ASKS[skill][0]),
    onStructure(6, comparison, COMPARISON_ASKS[skill][1]),
    onStructure(7, position, POSITION_ASKS[skill][0]),
    onStructure(8, position, POSITION_ASKS[skill][1]),
    onStructure(6, mechanism, MECHANISM_ASKS[skill][0]),
    onStructure(7, mechanism, MECHANISM_ASKS[skill][1]),
  ]);
}


// ── frames ───────────────────────────────────────────────────────────────
// The constant part of each family's question, with the varying words left as
// holes, so the shape filter can tell two families apart when they share a
// prompt. Hand-written for the same reason as english-families.js: deriving
// them collapses every family asking the same question onto one frame, which
// is the pair the picker exists to separate, and leaves fragments with a hole
// where the sentence should be. Families that already carried a frame keep
// it; only the ones with none are set here.
//
// Written before `module.exports`, because spread hands out copies and a block
// after it would assign onto objects nothing else can reach.
FAMILIES.main_idea[0].frame = "Which statement best expresses the main idea of the passage?";
FAMILIES.main_idea[1].frame = "The passage is primarily concerned with";
FAMILIES.detail_support[0].frame = "According to the passage, how many were counted in an average season?";
FAMILIES.detail_support[1].frame = "According to the passage, what happened at the second location?";
FAMILIES.detail_support[2].frame = "According to the passage, how long did the count stay at its lower level?";
FAMILIES.inference[0].frame = "The passage most strongly suggests that the researcher considered the second location";
FAMILIES.inference[1].frame = "It can reasonably be inferred that if the figures were reversed,";
FAMILIES.author_purpose[0].frame = "The detail that the report \"said so in one sentence and moved on\" serves to";
FAMILIES.author_purpose[1].frame = "Why does the passage mention that the drop was \"not gradual\"?";
FAMILIES.author_purpose[2].frame = "Why does the passage give a figure twice, for the case and the comparison?";
FAMILIES.author_purpose[3].frame = "The sentence \"The weather was shared; the outcome was not\" functions as";
FAMILIES.vocab_context[0].frame = "the sense of the word in the closing sentence";
FAMILIES.vocab_context[1].frame = "which word carries that sense";
FAMILIES.vocab_context[2].frame = "which reading of the word does not apply";

module.exports = { FAMILIES: spread(FAMILIES), study, comparison, position, mechanism };
