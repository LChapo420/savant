/**
 * Which bank skills fit which grade (GRADE_SKILLS=on, 2026-10-24).
 *
 * The bank is subject-wide and the sheets' skill tags were keyword guesses, so a
 * grade could name any skill its words happened to touch: Sense of Quantity
 * (preschool) carried linear equations, Abstract Algebra I tagged "Order of an
 * Element" as addition, and doctoral Reading listed phonics, so its Final could ask
 * "Which type of syllable is 'rain'?" (subjects audit, 2026-10-24). Grade bands
 * fixed the difficulty inside a skill; this fixes which skills a grade draws from.
 *
 * Two pieces of data per track:
 *   FIT    skill -> [first, last] grade position (0-based, in the track's order)
 *          where the skill is neither above nor far below the grade. A skill
 *          outside a grade's range is never served by that grade.
 *   RULES  [pattern, skill] in priority order. A lesson's title (then what it
 *          covers) picks the first skill whose pattern matches AND that fits the
 *          grade; so "Comparing Three-Digit Numbers" is counting in Kindergarten
 *          terms nowhere, and place value in grade 2.
 *
 * How a grade's levels are re-tagged (mode by track):
 *   classify (math, English, Reading): every lesson gets the first fitting rule
 *     for its title, then its coverage text; failing that, its sheet tag if that
 *     fits; failing that, the fitting core skill nearest the grade. A non-lesson
 *     row takes a fitting rule for its own title, or else the skill of the lesson
 *     it follows (the first lesson's, before any lesson).
 *   filter (Spanish, Basketball): a row keeps its sheet tag when it fits; when it
 *     does not (or has none), its title picks a fitting rule, then a substitute
 *     from SUB, then the nearest core skill.
 *   Tracks with no FIT (IQ, ACT, Chess, Piano) are unchanged: their skills are
 *   age-neutral reasoning families (IQ), one exam's content (ACT), or researched
 *   per-level tags whose grade bands already pitch them (chess, piano).
 *
 * The grade's `skills` are then its rows' skills in order of first appearance,
 * which is what the path, sessions, checkpoints and the Final draw from. The
 * sheet's own tag is kept on a re-tagged row as `sheet_skill`.
 *
 * GRADE_SKILLS=off restores the sheets' tags exactly.
 */

const on = () => String(process.env.GRADE_SKILLS || 'on').toLowerCase() === 'on';

// ── math (49 grades: 0 Sense of Quantity, preschool … 48 Senior Scholar) ──────
// 0-1 preschool/pre-K, 2-3 K, 4-5 grade 1, 6-7 grade 2, 8-9 grade 3, 10 grade 4,
// 11-12 grade 5, 13-15 grade 6, 16-17 grade 7, 18-19 grade 8, 20-21 algebra 1,
// 22-23 geometry, 24-25 algebra 2, 26 precalculus, 27 statistics, 28-41
// undergraduate, 42 honours, 43-45 graduate, 46 doctoral, 47-48 beyond.
const MATH_FIT = {
  counting: [0, 4], shapes: [0, 8], facts_within_20: [2, 7], place_value: [3, 11], measurement: [4, 10],
  add_sub: [5, 13], word_problems: [5, 19], data_stats: [7, 35], mul_div: [7, 16], fractions: [9, 19],
  // act_data asks unit rates and averages (6.RP.2-3, 6.SP.5), so it starts at grade 6.
  geometry_area: [9, 23], decimals: [10, 17], order_ops: [12, 19], exponents: [12, 25], act_data: [13, 21],
  percents: [13, 21], ratios: [13, 22], integers: [14, 21], linear_eq: [15, 26], inequalities: [15, 26],
  // Slope starts in grade 8 (8.EE.5-6, 8.F.4); 7th grade has proportional
  // relationships (7.RP.2), which are ratios (standards check, 2026-10-24).
  probability: [17, 48], slope_lines: [18, 26], systems: [18, 26], functions: [18, 30], quadratics: [21, 26],
  polynomials: [21, 26], sequences: [21, 30], trig_basics: [23, 30], rational_expr: [24, 26], complex_nums: [24, 29],
  // Precalculus (26) has limits and matrices (HSN-VM.C (+)); AP-level Statistics
  // (27) has neither, so its "Correlation and Its Limits" and "Rank Correlation"
  // were calculus and linear algebra by keyword alone. Two ranges each.
  logs: [25, 29], calculus: [[26, 26], [28, 37]], linear_algebra: [[26, 26], [28, 48]], discrete_math: [30, 48], analysis: [34, 48],
  abstract_algebra: [36, 48], topology: [37, 48],
};
const MATH_RULES = [
  [/\b(topolog|homeomorph|homotop|fundamental groups?|homology|cohomology|manifolds?|connected(ness)?|open sets?|closed sets?|closure|interior|boundary|surfaces?|euler characteristic|knots?|simplicial|cw complex|covering spaces?|bundles?|quotient spaces?|subspace|hausdorff|compactness|separation axioms?|countability|urysohn|tietze|retract|gluing|mobius|möbius|metric spaces? to topological)/i, 'topology'],
  [/\b(probabilit|random (variables?|walks?)|expected value|expectation|distributions?|binomial|poisson|bayes|conditional|markov|stochastic|brownian|martingales?|combinatori|permutations?|combinations?|counting principle|odds|dice|coins? flips?|law of large numbers|central limit|time series|survival)/i, 'probability'],
  [/\b(supremum|infimum|suprem|infim|least upper bound|completeness|nested intervals|cauchy sequences?|metric spaces?|compact(ness)?|uniform(ly)? (continu|converg)|lebesgue|measure theory|banach|hilbert|l\^?p spaces?|equicontinu|arzel|bolzano|heine|darboux|riemann-stieltjes|bounded variation|series|convergence|power series|radius of convergence|analytic functions?|holomorphic|residues?|contour|laurent|conformal|cauchy.?s? (integral|theorem)|liouville|singularit|complex (analysis|functions?|integration|numbers? revisited)|analysis|rigor|continuity|limits?|squeeze|differentiab|taylor|mean value|integral test|comparison tests?|cantor|perfect sets|harmonic|fourier|functional|operators?|spectral|zeta)/i, 'analysis'],
  [/\b(groups?|subgroups?|rings?|ideals?|field extensions?|fields?\b(?! trip| of study)|galois|homomorphism|isomorphism|symmetric groups?|cyclic|cosets?|lagrange|sylow|quotient|modules?|algebraic (number|element|geometry)|polynomial rings?|irreducib|cyclotomic|lattices?|categor(y|ies)|functors?|representation theory|commutative algebra|number theory|symmetr)/i, 'abstract_algebra'],
  [/\b(matri(x|ces)|determinants?|eigen|vector spaces?|linear (transformations?|maps?|independence|algebra)|bases?\b|span|rank|null ?space|orthogonal|inner products?|singular value|svd|diagonaliz|cayley-hamilton|least squares|principal components?|jordan|tensors?|vectors?)/i, 'linear_algebra'],
  [/\b(derivatives?|differentia(l|te|tion|bility)|integra(l|ls|tion|te)|antideriv|calculus|tangent lines?|secant lines?|riemann sums?|optimization|related rates|taylor|maclaurin|l.h[oô]pital|chain rule|euler.?s method|slope fields?|direction fields?|divergence|curl|gradient|green.?s theorem|stokes|jacobian|partial derivatives?|double integrals?|triple integrals?|line integrals?|limits?|instantaneous|accumulation|odes?|pdes?|differential equations?|dynamical systems?|laplace transform|mean value|continuity)/i, 'calculus'],
  [/\b(proofs?|logic(al)?|propositions?|truth tables?|quantifiers?|induction|recursion|recurrences?|graph theory|graphs and|trees?|vert(ex|ices)|edges?|set theory|sets\b|relations?|modular|congruen|divisib|primes?|gcd|euclid|pigeonhole|boolean|algorithms?|countable|uncountable|cardinal|diophantine|cryptograph|rsa|matroids?|model theory|forcing)/i, 'discrete_math'],
  [/\b(data|statistic|mean\b|median|mode\b|range\b|average|bar graphs?|picture graphs?|pictographs?|line plots?|dot plots?|box plots?|histograms?|pie charts?|circle graphs?|charts?|tally|surveys?|sampl(e|es|ing)|variability|standard deviation|variance|z-scores?|percentiles?|quartiles?|five-number|regression|correlation|scatter|line of best fit|residuals?|inference|hypothesis|confidence intervals?|estimat(e|ion|or)|likelihood|anova|chi-square|bias|causal)/i, 'data_stats'],
  [/\b(statistic|data|inference|regression|causal|learning analytics|machine learning|simulation)/i, 'probability'],
  [/\b(trig|sines?|cosines?|tangents?|radians?|unit circle|angles? of elevation|law of (sines|cosines)|polar|periodic)/i, 'trig_basics'],
  [/\b(complex numbers?|imaginary)/i, 'complex_nums'],
  [/\b(logarithm|logs?\b|exponential|compound interest|half-life|natural log)/i, 'logs'],
  [/\b(sequences?|series|arithmetic sequences?|geometric (sequences?|series)|recursive|nth term|sigma notation|summation)/i, 'sequences'],
  [/\b(rational (expressions?|functions?|equations?|inequalit)|asymptotes?|reciprocal)/i, 'rational_expr'],
  [/\b(polynomials?|monomials?|binomial theorem|factor(ing|ization)?|trinomials?|synthetic division|remainder theorem|degree)/i, 'polynomials'],
  [/\b(quadratic|parabola|vertex form|completing the square|discriminant)/i, 'quadratics'],
  [/\b(systems? of|simultaneous|elimination|systems\b)/i, 'systems'],
  [/\b(functions?|domain|f\(x\)|inputs? and outputs?|composition|inverses?|parent functions?|piecewise)/i, 'functions'],
  [/\b(slopes?|linear functions?|intercepts?|coordinate|ordered pairs?|graph(s|ing)?|rate of change|parallel|perpendicular|distance between|midpoint|translations?|reflections?|rotations?|dilations?|transformations?)/i, 'slope_lines'],
  [/\binequalit/i, 'inequalities'],
  [/\b(exponents?|powers?|square roots?|cube roots?|radicals?|scientific notation|perfect squares?)/i, 'exponents'],
  [/\b(equations?|solve|solving|unknown|variables?|expressions?|formulas?|substitution|balance|algebra)/i, 'linear_eq'],
  [/\b(integers?|negative|signed|positive and negative|absolute value|opposites?)/i, 'integers'],
  [/\b(percents?|%|discounts?|tax|tips?|interest|markups?)/i, 'percents'],
  [/\b(ratios?|rates?|proportion|unit rates?|scale|similar|speed|conversions?)/i, 'ratios'],
  [/\bdecimals?|tenths|hundredths|thousandths/i, 'decimals'],
  [/\b(fractions?|numerators?|denominators?|mixed numbers?)/i, 'fractions'],
  [/\b(order of operations|pemdas|grouping symbols|parenthes)/i, 'order_ops'],
  [/\b(area|perimeter|volume|surface area|angles?|triangles?|polygons?|circles?|circumference|prisms?|cylinders?|cones?|spheres?|pythag|congruen|geometr|quadrilaterals?|parallelograms?|trapezoids?|kites?|rectangles?|protractor|cubic|solids?)/i, 'geometry_area'],
  [/\b(multipl|divi(de|sion|sor)|times\b|products?|quotients?|factors?|multiples?|arrays?|equal groups|remainders?|lcm|least common|gcf|greatest common factor)/i, 'mul_div'],
  [/\b(within (5|10|20)|number bonds?|doubles|near doubles|make (a )?(ten|10)|fact famil|facts?\b|join|separat|put together|take apart|take from|add to|story problems?)/i, 'facts_within_20'],
  [/\b(add|addition|subtract|subtraction|sums?|differences?|plus|minus|regroup|carry|borrow|within (100|1,?000))/i, 'add_sub'],
  [/\b(money|coins?|dollars?|cents?|time|clocks?|hours?|minutes?|elapsed|calendar|measur|length|weigh|heavy|light|capacity|liquid|rulers?|inch|feet|foot|centimet|met(re|er)s?|units?|convert)/i, 'measurement'],
  [/\b(place value|tens|ones|hundreds|thousands|millions|digits?|expanded form|round(ing)?|numbers to|base-ten|bundles?|number lines?|three-digit|two-digit|multi-digit|compar(e|ing) (two|three|multi))/i, 'place_value'],
  [/\b(word problems?|story problems?|problem solving|multi-step|real-world|modell?ing|bar models?|tape diagrams?|strateg)/i, 'word_problems'],
  [/\b(add|subtract|sums?|differences?|plus|minus|story|how many in all|how many left)/i, 'facts_within_20'],
  [/\b(shapes?|circles?|squares?|triangles?|rectangles?|hexagons?|cubes?|spheres?|cones?|cylinders?|solids?|flat|sides|corners|vertices|patterns?|sort(ing)?|attributes?|positions?|directions?|above|below|beside|symmetr|equal parts|halves|halfs|fourths|quarters|big|small|tall|short|same and different|match(ing)?|build(ing)?)/i, 'shapes'],
  [/\b(count|counting|how many|subitiz|number words?|numerals?|numbers?\b|one more|one less|before and after|teens?|compar|more|fewer|less|greater|same number|order|zero|ten frames?|fingers|estimat|skip)/i, 'counting'],
];

// ── English (16 grades: 0 preschool-K, 1-4 grades 1-4, 5 grades 5-6, 6 grades 7-8,
// 7 grades 9-10, 8 grades 11-12, 9 college year 1, 10 years 2-3, 11 honours,
// 12 master's, 13 doctoral, 14 postdoctoral, 15 senior scholar) ──────────────
const ENGLISH_FIT = {
  early_literacy: [0, 1], phonics: [0, 4], early_comprehension: [0, 4],
  parts_of_speech: [1, 10], sentence_struct: [1, 10], punctuation_basic: [1, 8], subject_verb: [2, 9],
  pronoun_case: [2, 9], verb_tense: [2, 9], comma_use: [2, 10], apostrophes: [2, 9],
  // The bank's confused-words items start at L.4.1g (to/too/two, there/their), and
  // its modifier items are misplaced and dangling modifiers (L.7.1c) and
  // parallelism (L.9-10.1a): neither had a question at the grades they used to
  // start from (standards check, 2026-10-24). Comparatives (L.3.1g) re-tag to
  // parts of speech, whose adjective questions fit.
  word_choice: [4, 10], modifiers: [6, 10], transitions: [3, 10],
  literary_analysis: [4, 15], academic_writing: [4, 15],
  vocab_context: [5, 10], main_idea: [5, 10], detail_support: [5, 10], inference: [5, 11], author_purpose: [5, 11],
  act_rhetoric: [5, 11], linguistics: [9, 15],
};
// Reading has the same grade ladder; it adds the ACT reading-science and data
// skills for the secondary grades, and leaves out the grammar skills.
const READING_FIT = {
  early_literacy: [0, 1], phonics: [0, 4], early_comprehension: [0, 4],
  literary_analysis: [4, 15], academic_writing: [4, 15],
  vocab_context: [5, 10], main_idea: [5, 10], detail_support: [5, 10], inference: [5, 11], author_purpose: [5, 11],
  act_rhetoric: [6, 10], act_science: [6, 9], act_data: [6, 9], linguistics: [11, 15],
};
const LANGUAGE_RULES = [
  [/\b(alphabet|letters? [a-z](-[a-z])?\b|letter names?|letters and sounds|capital letters? at|the word i\b|rhym|beginning sounds?|first sounds?|initial sounds?|syllable clap|clapping|concepts of print|print\b|book handling|parts of a book|what is a book|writing (your|my) name|name in print|tracing|left to right|listening and attention|nursery|uppercase|lowercase)/i, 'early_literacy'],
  [/\b(phonics|phonemic|phonemes?|decod|blend(s|ing)?|digraphs?|vowels?|consonants?|silent e|magic e|r-controlled|word famil|segment|spelling|spell|sight words?|syllable types?|syllables|prefix|suffix|roots?|base words?|affix|word analysis|multisyllab|sounds? of)/i, 'phonics'],
  [/\b(linguistic|phonetic|phonolog|morpholog|semantic|pragmatic|sociolinguistic|dialects?|language acquisition|second language|bilingual|multilingual|corpus|lexicograph|etymolog|history of (the )?english|old english|middle english|language (policy|change|variation|famil|and (power|identity|society))|languages?, discrimination|conlang|constructed languages|discourse analysis|tesol|\besl\b|english as a second|teaching english|psychology of reading|word recognition|eye movements?|science of reading)/i, 'linguistics'],
  [/\bcommas?/i, 'comma_use'],
  [/\b(apostroph|possessive|contraction)/i, 'apostrophes'],
  [/\b(subject-verb|agreement)/i, 'subject_verb'],
  [/\bpronouns?/i, 'pronoun_case'],
  [/\b(verb tenses?|tenses?|past tense|irregular (past|verbs?)|verb forms?|perfect tense|progressive)/i, 'verb_tense'],
  [/\b(end punctuation|punctuation|capitaliz|capital letters|end marks?|question marks?|exclamation)/i, 'punctuation_basic'],
  [/\b(modifiers?|parallel|comparatives?|superlatives?|adjectives that compare)/i, 'modifiers'],
  [/\b(transitions?|signpost|cohesion|coherence|linking words)/i, 'transitions'],
  [/\b(word choice|confused words|homophones?|usage|diction|tone and register|register|concis|wordiness|style guides?)/i, 'word_choice'],
  [/\b(nouns?|verbs?|adjectives?|adverbs?|prepositions?|conjunctions?|interjections?|parts of speech|articles|determiners?|gerunds?|infinitives?|participles?|clauses?|phrases)\b/i, 'parts_of_speech'],
  [/\b(sentences?|fragments?|run-ons?|syntax|sentence combining|spaces between words)\b/i, 'sentence_struct'],
  [/\b(scien(ce|tific)|experiments?|lab reports?)/i, 'act_science'],
  [/\b(data|graphs?|charts?|tables?|infographics?|statistic)/i, 'act_data'],
  [/\b(literar|literature|poe(m|ms|try|tic|ts?)|novels?|fiction|narrat|drama|plays?\b|shakespeare|sonnets?|figurative|metaphors?|similes?|imagery|symbol|themes?|mood|irony|satire|parody|allusions?|genres?|myths?|tragedy|comedy|characters?|plots?|setting|point of view|stream of consciousness|criticism|critical|theory|formalis|structuralis|deconstruct|feminis|postcolonial|historicis|marxis|reader-response|canon|creative (writing|nonfiction)|memoir|rhetorical figures|schemes and tropes|figures of speech|styl(e|istic)|stor(y|ies)|folktales?|fables?|fairy tales?|romantic|modernis|renaissance|epic|verse|authors?|books?|reading lists|seminar)/i, 'literary_analysis'],
  [/\b(stor(y|ies)|read-?alouds?|retell|characters?|setting|events?|who,? what|key details?|sequence|beginning, middle|main topic|informational|nonfiction|fiction|text features|listening|ask(ing)? and answer(ing)?|questions|directions|describing|retelling|real or make-believe|pictures|texts?\b|information|conclusions?|predictions?|procedures|how-to|visualiz|cause and effect)/i, 'early_comprehension'],
  [/\b(main idea|summar|central idea|gist|retell)/i, 'main_idea'],
  [/\b(details?|evidence|support|key ideas|reasons)/i, 'detail_support'],
  [/\b(infer|conclusions?|predict|logical fallac|reasoning|fallac)/i, 'inference'],
  [/\b(author'?s? purpose|purpose|point of view|perspective|bias|tone|craft|rhetorical situation|audience)/i, 'author_purpose'],
  [/\b(vocabulary|word meanings?|context clues|multiple[- ]meaning|shades of meaning|reference skills|dictionar|thesaurus|glossary|words?)\b/i, 'vocab_context'],
  [/\b(rhetoric|persuas|speech(es)?|debate|argument|revis|editing)/i, 'act_rhetoric'],
  [/\b(research|sources?|citations?|cit(e|ing)|plagiar|bibliograph|annotat|thesis|dissertation|arguments?|claims?|counterargument|rebuttal|essays?|academic|scholar|peer review|publish|journals?|grants?|proposals?|literature reviews?|methods?|abstracts?|conferences?|dossier|tenure|funding|drafts?|portfolio|reports?|technical writing|documentation|manuals?|ux writing|content strategy|professional|writing|exams?|orientation|careers?|mentor|pedagog|teaching|composition|seminars?|leadership|editorial|editions?|editing|archiv|digital|text encoding|tei\b|corpus|reviews?|manuscripts?|credib|disciplines?|annotation|active reading|close reading|scholarship|policy|programs?)/i, 'academic_writing'],
];

// ── Spanish (57 grades: 0-7 A1, 8-14 A2, 15-22 B1, 23-30 B2, 31-41 C1, 42-56 C2
// and specialist: history, literature, translation, interpreting, linguistics) ──
// Checked against the CEFR Companion Volume (2020): describing past activities is
// A2 (p. 173), giving opinions and expressing hopes is B1, speculating about
// hypothetical situations is B2, register and idiom are B2-C1 (sociolinguistic
// appropriateness, p. 136). So the preterite starts at A2 (8) and the subjunctive
// at B1 (15): an A1 or A2 "Ojalá" / "Cuando llegues" chunk lesson is vocabulary,
// not a conjugation drill. Greetings and numbers stop at the end of A2 (14).
const SPANISH_FIT = {
  es_greetings: [0, 14], es_numbers: [0, 14], es_gender: [0, 18], es_vocab_core: [0, 22], es_present_ar: [0, 22],
  es_present_erir: [0, 22], es_questions: [0, 22], es_adjectives: [0, 22], es_ser_estar: [0, 30],
  es_translate: [3, 30], es_object_pron: [6, 30], es_preterite: [8, 30], es_subjunctive: [15, 41], es_imperfect: [8, 30],
  es_adv_grammar: [22, 56], es_idioms_register: [26, 56], es_literature: [42, 56],
};
const SPANISH_RULES = [
  [/\b(literat|poe(m|try|sía)|poet|novel|theat(er|re)|teatro|drama|cervantes|quijote|golden age|siglo de oro|generation of|generación|boom|cinema|cine\b|films?|histor|cultur|authors?|writers?|essays?|chronicle|medieval|baroque|romantic|realism|modernism|avant-garde|canon)/i, 'es_literature'],
  [/\b(idioms?|sayings?|proverbs?|register|dialects?|colloquial|slang|humou?r|irony|pragmatic|nuance|native|voseo|regional|variet(y|ies)|accents?|pronunciation|false friends|formal|informal|politeness|sounding|listening|street)/i, 'es_idioms_register'],
  [/\b(subjunctive|conditional|passive|impersonal|se constructions|clauses?|connectors?|cohesion|writing|grammar|indirect|relative|tenses?|verbs?|syntax|morpholog|phonolog|sounds|translat|interpret|stylistics|mediation|argument|debate|rhetoric|academic|professional|linguistic|sentences)/i, 'es_adv_grammar'],
];

// Basketball (15 grades): every skill fits every grade except the court-and-
// equipment basics, which stop before the research grade (14).
const BASKETBALL_FIT = {
  bb_skills: [0, 14], bb_court: [0, 13], bb_rules: [0, 14], bb_health: [0, 14], bb_tactics: [0, 14], bb_mental: [0, 14],
  bb_stats: [0, 14], bb_history: [0, 14], bb_officiating: [0, 14], bb_coaching: [0, 14], bb_frontier: [0, 14],
};
const FIT = { math: MATH_FIT, english: ENGLISH_FIT, reading: READING_FIT, spanish: SPANISH_FIT, basketball: BASKETBALL_FIT };
const RULES = { math: MATH_RULES, english: LANGUAGE_RULES, reading: LANGUAGE_RULES, spanish: SPANISH_RULES, basketball: [] };
const MODE = { math: 'classify', english: 'classify', reading: 'classify', spanish: 'filter', basketball: 'filter' };
// The skills a grade falls back on, nearest the grade first, when nothing names one.
const CORE = {
  math: ['counting', 'facts_within_20', 'place_value', 'add_sub', 'mul_div', 'fractions', 'ratios', 'linear_eq', 'functions', 'calculus', 'linear_algebra', 'probability', 'analysis', 'abstract_algebra'],
  english: ['early_literacy', 'phonics', 'early_comprehension', 'sentence_struct', 'parts_of_speech', 'main_idea', 'academic_writing', 'literary_analysis'],
  reading: ['early_literacy', 'phonics', 'early_comprehension', 'main_idea', 'detail_support', 'inference', 'literary_analysis', 'academic_writing'],
  spanish: ['es_vocab_core', 'es_present_ar', 'es_translate', 'es_subjunctive', 'es_adv_grammar', 'es_idioms_register', 'es_literature'],
  basketball: ['bb_frontier', 'bb_tactics', 'bb_rules'],
};
const SUB = {
  spanish: {
    es_greetings: ['es_vocab_core', 'es_idioms_register'], es_numbers: ['es_vocab_core', 'es_adv_grammar'], es_gender: ['es_adjectives', 'es_adv_grammar'],
    es_present_ar: ['es_preterite', 'es_subjunctive', 'es_adv_grammar'], es_present_erir: ['es_preterite', 'es_subjunctive', 'es_adv_grammar'],
    es_questions: ['es_translate', 'es_adv_grammar'], es_adjectives: ['es_ser_estar', 'es_adv_grammar'], es_vocab_core: ['es_translate', 'es_idioms_register'],
    es_ser_estar: ['es_adv_grammar'], es_translate: ['es_idioms_register', 'es_adv_grammar'], es_preterite: ['es_adv_grammar'],
    es_imperfect: ['es_adv_grammar'], es_object_pron: ['es_adv_grammar'], es_subjunctive: ['es_adv_grammar'],
  },
  basketball: { bb_court: ['bb_frontier', 'bb_rules'] },
};

/** The skills that fit grade `index` of a track, or null when the track is not mapped. */
function allowedFor(trackId, index) {
  const fit = FIT[trackId];
  if (!fit) return null;
  return new Set(Object.entries(fit).filter(([, r]) => rangesOf(r).some(([a, b]) => index >= a && index <= b)).map(([s]) => s));
}

/** A fit is [first, last], or a list of such ranges when a skill skips a grade. */
const rangesOf = (r) => (Array.isArray(r[0]) ? r : [r]);

/** The fitting core skill whose range is centred nearest the grade. */
function nearest(trackId, index, allowed) {
  const fit = FIT[trackId];
  const list = (CORE[trackId] || []).filter((s) => allowed.has(s));
  const pool = list.length ? list : [...allowed];
  let best = null; let gap = Infinity;
  for (const s of pool) {
    const ranges = fit[s] ? rangesOf(fit[s]) : [[index, index]];
    const g = Math.min(...ranges.map(([a, b]) => Math.abs((a + b) / 2 - index)));
    if (g < gap) { gap = g; best = s; }
  }
  return best;
}

function classify(trackId, text, allowed) {
  if (!text) return null;
  for (const [re, skill] of RULES[trackId] || []) if (allowed.has(skill) && re.test(text)) return skill;
  return null;
}

const isLesson = (r) => r.type === 'Lesson' && r.kind === 'lesson';

/**
 * Re-tag one grade's levels. Returns { levels, skills } or null (leave as is).
 * `g` is the sheet's grade (levels with skill tags); `index` its position.
 */
function remap(trackId, index, g, fallbackSkills) {
  if (!on()) return null;
  const allowed = allowedFor(trackId, index);
  if (!allowed || !allowed.size) return null;
  const rows = Array.isArray(g.levels) ? g.levels : [];
  const mode = MODE[trackId];
  const pick = (r, { titleOnly = false } = {}) => classify(trackId, r.title, allowed)
    || (titleOnly ? null : classify(trackId, r.covers, allowed));
  let levels;
  if (mode === 'classify') {
    const lessonSkill = (r) => pick(r) || (r.skill && allowed.has(r.skill) ? r.skill : null) || nearest(trackId, index, allowed);
    const firstLesson = rows.find(isLesson);
    let current = firstLesson ? lessonSkill(firstLesson) : nearest(trackId, index, allowed);
    levels = rows.map((r) => {
      let skill;
      if (isLesson(r)) { skill = lessonSkill(r); current = skill; } else skill = pick(r, { titleOnly: true }) || current;
      return skill === r.skill ? r : { ...r, skill, sheet_skill: r.skill || null };
    });
  } else {
    // A row the sheet left untagged stays untagged (the path gives it the grade's
    // banded skill, which fits), unless the grade has no tags at all.
    const tagged = rows.some((r) => r.skill);
    levels = rows.map((r) => {
      if (r.skill && allowed.has(r.skill)) return r;
      if (!r.skill && tagged) return r;
      const sub = ((SUB[trackId] || {})[r.skill] || []).find((s) => allowed.has(s));
      const skill = pick(r) || sub || nearest(trackId, index, allowed);
      return { ...r, skill, sheet_skill: r.skill || null };
    });
  }
  const skills = [];
  for (const r of levels) if (r.skill && !skills.includes(r.skill)) skills.push(r.skill);
  if (!skills.length) for (const s of fallbackSkills || []) if (allowed.has(s)) skills.push(s);
  if (!skills.length) skills.push(nearest(trackId, index, allowed));
  return { levels, skills };
}

/**
 * The part of a skill's difficulty scale that fits a grade, where the grade band
 * alone cannot say. The early math grades all share roughly the 1-3 band, while
 * place_value's generator steps up by number size inside it: teen numbers below
 * 1.7, two digits below 2, three below 2.8, four below 3.4, then six digits and
 * decimals from 3.9. Without a range a Kindergarten level at 2.5 asked about 402
 * (final click-through, 2026-10-24). Ranges follow the Common Core NBT standards:
 * K.NBT.1 teens, 1.NBT to 100, 2.NBT and 3.NBT to 1,000, 4.NBT to 1,000,000,
 * 5.NBT decimals.
 */
//
// Extended by the standards check (2026-10-24, curriculum-build/GRADE-FIT-STANDARDS.md)
// to every math-only skill whose generator steps by number size or kind inside
// the shared early band. Each range is the slice of the generator's tiers (see
// content/math-grade-items.js) that the grade's Common Core standard covers.
// Bounds have one decimal: the bank rounds a difficulty to 0.1, so a top of 2.39
// would be served as 2.4, the next tier.
const K2 = ['numbers_to_10', 'numbers_to_20_and_teen_numbers'];
const PRE = ['sense_of_quantity', 'counting_and_comparing'];
const G1 = ['add_and_subtract_within_20', 'place_value_to_100_and_measurement'];
const G2 = ['place_value_to_1_000_and_fluent_addition', 'regrouping_money_and_arrays'];
const G3 = ['multiplication_and_division', 'fractions_area_and_perimeter'];
const G4 = ['multi_digit_arithmetic_and_fraction_equivalence'];
const G5 = ['fraction_and_decimal_operations', 'volume_coordinates_and_expressions'];
const G6TO8 = ['ratios_rates_and_percents', 'rational_numbers_and_fraction_division', 'expressions_equations_and_data',
  'proportional_relationships_and_signed_numbers', 'linear_equations_geometry_and_probability',
  'exponents_linear_functions_and_systems', 'transformations_pythagorean_theorem_and_data_models'];
const every = (ids, range) => Object.fromEntries(ids.map((id) => [id, range]));
const DIFFICULTY_RANGE = {
  math: {
    place_value: {
      numbers_to_20_and_teen_numbers: [1, 1.6],
      add_and_subtract_within_20: [1, 1.9],
      place_value_to_100_and_measurement: [1.7, 1.9],
      // Rounding is 3.NBT.1: grade 2 compares, expands and steps by 10 and 100
      // within 1,000 (2.NBT.1-4, 2.NBT.8) and rounds nothing.
      ...every(G2, [2, 2.3]),
      ...every(G3, [2.4, 2.7]),
      multi_digit_arithmetic_and_fraction_equivalence: [2.8, 3.8],
      fraction_and_decimal_operations: [3.4, 10],
    },
    // Ages 3-4 count within 10 (Head Start ELOF P-MATH 1, 36-48 months); Pre-K and
    // Kindergarten to 20 (ELOF 60 months; K.CC.3, K.CC.5).
    counting: { sense_of_quantity: [1, 2.3] },
    // Kindergarten names squares, triangles and hexagons (K.G.2) and does not
    // partition; halves and fourths are 1.G.3, thirds 2.G.3.
    shapes: { ...every([...PRE, ...K2], [1, 2.1]), ...every(G1, [1.7, 2.4]) },
    // Kindergarten adds and subtracts within 10 (K.OA.2); compare problems and
    // sums to 20 are grade 1 (1.OA.1, 1.OA.6).
    facts_within_20: every(K2, [1, 2.1]),
    // Grade 1 tells time to the hour and half hour and measures length in
    // same-size units (1.MD.1-3); grade 2 money, time to five minutes and length
    // in inches and centimetres (2.MD.1-8); grade 3 elapsed time and mass and
    // volume (3.MD.1-2); unit conversion is grade 4 (4.MD.1).
    measurement: { ...every(G1, [1, 1.6]), ...every(G2, [1.7, 2.2]), ...every(G3, [2.3, 2.7]), ...every(G4, [2.8, 10]) },
    // Picture and bar graphs and tallies through grade 5 (2.MD.10, 3.MD.3, 4.MD.4,
    // 5.MD.2); mean, median and range are 6.SP.5; z-scores and standard deviation
    // are high school (HSS-ID.A.2-4).
    data_stats: { ...every([...G2.slice(1), ...G3, ...G4, ...G5], [1, 2.9]), ...every(G6TO8, [3, 5.9]) },
    // 7th grade: simple and compound events from a die or a bag (7.SP.5-8);
    // counting arrangements is high school (HSS-CP.B.9 (+)).
    probability: { linear_equations_geometry_and_probability: [1, 4.9] },
    // 7th grade multiplies and divides signed numbers (7.NS.2) with factors a
    // learner can work; the generator's upper half multiplies three-digit signed
    // numbers (e.g. (-222) × (-214)). At 4 and below the factors stay within 61.
    integers: every(['proportional_relationships_and_signed_numbers', 'linear_equations_geometry_and_probability'], [1, 4]),
    // Precalculus meets limits; derivatives and integrals are Calculus I.
    calculus: { precalculus: [1, 4.9] },
  },
};

/** `d` held inside the range that fits this grade and skill (unchanged when none is set). */
function capDifficulty(grade, skillId, d) {
  if (!on() || !grade) return d;
  const range = ((DIFFICULTY_RANGE[grade.trackId] || {})[skillId] || {})[grade.id];
  return range ? Math.max(range[0], Math.min(range[1], d)) : d;
}

/**
 * The US school grade a grade teaches (-1 preschool, 0 Kindergarten ... 12), or
 * null past school and on tracks without one (standards check, 2026-10-24).
 *
 * The bank's shared skills (add_sub, fractions, the grammar pools) also serve the
 * ACT and the upper grades, where their difficulty scale means something else, so
 * a school grade cannot be reached through difficulty alone without changing what
 * those tracks get. The planners pass this along with each entry instead
 * (`school`), and the item files use it: math serves the tier for that grade's
 * standard (content/math-grade-items.js SCHOOL), and the English pools serve only
 * the rules taught by that grade (content/english-grade-items.js SCHOOL_GRADES).
 * Anything that is not passed it serves exactly what it did before.
 */
const SCHOOL = {
  math: {
    sense_of_quantity: -1, counting_and_comparing: -1, numbers_to_10: 0, numbers_to_20_and_teen_numbers: 0,
    add_and_subtract_within_20: 1, place_value_to_100_and_measurement: 1,
    place_value_to_1_000_and_fluent_addition: 2, regrouping_money_and_arrays: 2,
    multiplication_and_division: 3, fractions_area_and_perimeter: 3, multi_digit_arithmetic_and_fraction_equivalence: 4,
    fraction_and_decimal_operations: 5, volume_coordinates_and_expressions: 5,
    ratios_rates_and_percents: 6, rational_numbers_and_fraction_division: 6, expressions_equations_and_data: 6,
    proportional_relationships_and_signed_numbers: 7, linear_equations_geometry_and_probability: 7,
    exponents_linear_functions_and_systems: 8, transformations_pythagorean_theorem_and_data_models: 8,
    algebra_1_part_a: 9, algebra_1_part_b: 9, geometry_part_a: 10, geometry_part_b: 10,
    algebra_2_part_a: 11, algebra_2_part_b: 11, precalculus: 12, statistics_and_data_analysis: 12,
  },
  // A two-year grade takes its upper year: "5th to 6th Grade" may use a grade-6 rule.
  english: { basics: 0, grammar: 1, reading: 2, developing: 3, intermediate: 4, upper_intermediate: 6, advanced_intermediate: 8, proficient: 10, advanced: 12 },
  reading: {
    foundations: 0, early_decoder: 1, beginning_reader: 2, developing_reader: 3, intermediate_reader: 4,
    upper_intermediate_reader: 6, advanced_intermediate_reader: 8, proficient_reader: 10, advanced_reader: 12,
  },
};
function schoolGrade(grade) {
  if (!on() || !grade) return null;
  const n = (SCHOOL[grade.trackId] || {})[grade.id];
  return n === undefined ? null : n;
}

/** A plan entry fitted to its grade: difficulty held to the grade's range, and the school grade attached. */
function fitEntry(grade, entry) {
  const school = schoolGrade(grade);
  const out = { ...entry, difficulty: capDifficulty(grade, entry.skillId, entry.difficulty) };
  if (school !== null) out.school = school;
  return out;
}

module.exports = { remap, allowedFor, on, capDifficulty, schoolGrade, fitEntry, FIT, RULES, MODE, DIFFICULTY_RANGE, SCHOOL };
