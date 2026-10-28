// Generate content/math-grades.js from the creator's Math spreadsheet.
//
// The sheet is a **layout**: 49 grades, 28,780 levels, every level named with a
// type, a title and what it covers. It is the same shape as the English and
// Reading sheets, so `scripts/build-sheet-track.js` reads it — see that file for
// the reading, the type mapping and the writing of the output.
//
// What is left here is this sheet's own two decisions: the grade names a learner
// sees, and the skill each level's questions come from.
//
// ## The skills
//
// Math is not one skill but a spread of them, and the sheet runs from counting
// blocks to a doctoral qualifying exam. The bank has twenty-four math skills
// already, from `add_sub` to `complex_nums`, and those are the ones used here — a
// new family of questions for this sheet would be new content, and the sheet is a
// layout rather than a syllabus.
//
// The rules are ordered best-first and matched on the level's **title** first and
// its **coverage** second. A lesson's title names the rule it teaches ("Equal
// Groups and the Meaning of Multiplication", "Solving Two-Step Equations"), which
// is what these rules are written against. A quiz's title names its cycle
// ("Master Quiz 2 (Cycle 1)") and says nothing, so a level with no match on its
// title is tried on its coverage, which does name the material.
//
// ## What about the graduate grades
//
// From Calculus onwards the sheet's material is beyond what the bank can test:
// differential forms, Galois theory, the arithmetic hierarchy. Rather than drop
// those levels — they are the creator's, and dropping a level is worse than
// asking a broader question about it — they fall back to the nearest skill the
// bank has, which is what the *whole skill* fallback already does. `word_problems`
// is the usual landing place because it is the one math skill that can put a
// number in front of a learner whatever the topic, and `act_data` takes the rest
// because it is the one that can read a graph, a table or a distribution. The
// levels are still served, still titled from the sheet, and still answered.
const { readSheet, writeTrack } = require('./build-sheet-track');

const ROOT = 'C:/coding/iqmax_clone_9.26/iq max repo 2';
const SRC = 'C:/coding/iqmaxx/creator_files/Math_Levels_Topics.csv';
const OUT = `${ROOT}/content/math-grades.js`;

/**
 * The grade names a learner sees, and a one-line summary for the catalogue.
 *
 * Keyed by index rather than by id, because the id is derived from the heading and
 * a keyed-by-id table that missed one entry would silently fall back to a name
 * that is the heading again. The index is the sheet's own order and cannot drift.
 */
const GRADE_NAMES = [
  ['Sense of Quantity', 'Preschool, ages 3-4', 'Big, small, more and less — the first mathematics, played rather than written.'],
  ['Counting and Comparing', 'Pre-K, ages 4-5', 'Counting objects, sorting by one attribute, and the first shapes.'],
  ['Numbers to 10', 'Kindergarten, first half', 'The numbers one to ten, the numerals that write them, and one more and one less.'],
  ['Numbers to 20 and Teen Numbers', 'Kindergarten, second half', 'Counting to twenty, the teen numbers, and comparing amounts.'],
  ['Add and Subtract Within 20', '1st Grade, first half', 'Joining, separating and comparing, and the first addition and subtraction sentences.'],
  ['Place Value to 100 and Measurement', '1st Grade, second half', 'Tens and ones, and length, weight and capacity with nonstandard units.'],
  ['Place Value to 1,000 and Fluent Addition', '2nd Grade, first half', 'Hundreds, tens and ones, and addition that carries.'],
  ['Regrouping, Money, and Arrays', '2nd Grade, second half', 'Borrowing and carrying, counting money, and arrays as a picture of multiplication.'],
  ['Multiplication and Division', '3rd Grade, first half', 'Equal groups, sharing, and the meaning of a product and a quotient.'],
  ['Fractions, Area, and Perimeter', '3rd Grade, second half', 'Halves and thirds, and the area and perimeter of simple figures.'],
  ['Multi-Digit Arithmetic and Fraction Equivalence', '4th Grade', 'Multi-digit addition and subtraction, and fractions that name the same amount.'],
  ['Fraction and Decimal Operations', '5th Grade, first half', 'Adding, subtracting and multiplying fractions, and decimals as another way to write them.'],
  ['Volume, Coordinates, and Expressions', '5th Grade, second half', 'Filling space with unit cubes, points on a grid, and the language of algebra.'],
  ['Ratios, Rates, and Percents', '6th Grade, first third', 'How many times as much, how fast, and how many out of a hundred.'],
  ['Rational Numbers and Fraction Division', '6th Grade, middle third', 'Numbers above and below zero, and dividing by a fraction.'],
  ['Expressions, Equations, and Data', '6th Grade, last third', 'Translating words into expressions, solving simple equations, and reading data.'],
  ['Proportional Relationships and Signed Numbers', '7th Grade, first half', 'Unit rates, scale drawings, and adding and multiplying with negative numbers.'],
  ['Linear Equations, Geometry, and Probability', '7th Grade, second half', 'Two-step equations, angle and area reasoning, and chance as a fraction.'],
  ['Exponents, Linear Functions, and Systems', '8th Grade, first half', 'Powers, lines that bend or not, and two equations with two unknowns.'],
  ['Transformations, Pythagorean Theorem, and Data Models', '8th Grade, second half', 'Moving and flipping figures, right triangles, and modelling real data.'],
  ['Algebra 1, Part A', '9th Grade, first half', 'Equations and inequalities, lines, and the structure of an expression.'],
  ['Algebra 1, Part B', '9th Grade, second half', 'Exponential growth, quadratic expressions, and data that is not a straight line.'],
  ['Geometry, Part A', '10th Grade, first half', 'Congruence, similarity, and the circles that go with them.'],
  ['Geometry, Part B', '10th Grade, second half', 'Trigonometry, coordinates, and the areas and volumes that follow from them.'],
  ['Algebra 2, Part A', '11th Grade, first half', 'Polynomials, rational expressions, and the graphs that go with them.'],
  ['Algebra 2, Part B', '11th Grade, second half', 'Sequences, series, and the roots and logarithms that describe growth.'],
  ['Precalculus', '12th Grade, Honors', 'Functions as objects, trigonometry beyond the triangle, and the limits that start calculus.'],
  ['Statistics and Data Analysis', '12th Grade, Honors / AP level', 'Distributions, sampling, inference, and reading a study rather than a list.'],
  ['Calculus I', 'College Freshman, semester 1', 'Limits, derivatives, and what a derivative measures.'],
  ['Calculus II', 'College Freshman, semester 2', 'Integration, the fundamental theorem, and series that converge.'],
  ['Multivariable Calculus', 'College Sophomore, semester 1', 'Functions of several variables, partial derivatives, and the change in several directions at once.'],
  ['Linear Algebra', 'College Sophomore, semesters 1-2', 'Matrices as transformations, vector spaces, eigenvalues, and what a matrix can be diagonalised into.'],
  ['Discrete Mathematics and Proof Writing', 'College Sophomore, semester 2', 'Counting, graphs, logic, and writing a proof that holds.'],
  ['Differential Equations and Mathematical Modeling', 'College Junior, semester 1', 'Models that change over time, and the models that do not have closed-form answers.'],
  ['Probability', 'College Junior', 'Counting outcomes, conditional probability, and the limit theorems.'],
  ['Mathematical Statistics', 'College Junior', 'Estimators, distributions, inference, and what a confidence interval does and does not say.'],
  ['Real Analysis I', 'College Junior', 'The real numbers built from the bottom up, and what convergence actually means.'],
  ['Real Analysis II and Metric Spaces', 'College Junior-Senior', 'Riemann integration, sequences and series of functions, and spaces with a notion of distance.'],
  ['Abstract Algebra I', 'College Junior-Senior', 'Groups, homomorphisms, and the quotients they produce.'],
  ['Abstract Algebra II', 'College Senior', 'Rings, fields, and the structure a field can carry.'],
  ['Topology', 'College Senior', 'Open sets, continuity, compactness, and spaces that are studied for their shape rather than their size.'],
  ['Complex Analysis', 'College Senior', 'Holomorphic functions, residues, and the contour integral.'],
  ['Advanced Undergraduate Electives and Honors Capstone', 'College Senior / Honors Thesis', 'Elective depth across pure maths, applied maths, statistics, logic, and education, and the capstone that ends them.'],
  ['Graduate Core I', "Graduate School, Master's Year 1", 'The core graduate material, with the proof-writing the first year is really about.'],
  ['Graduate Core II', "Graduate School, Master's Years 1-2", 'Advanced material across the fields, and the specialisation that follows.'],
  ['Master\'s Specialization and Thesis', "Graduate School, Master's Year 2", 'A specialisation chosen and a thesis written and defended.'],
  ['Doctoral', 'Graduate School, PhD', 'Qualifying review, original results, and a dissertation.'],
  ['Postdoctoral / Professional', 'Postdoctoral / Early-Career Scholar', 'An independent research agenda, teaching, and the grant and paper work that carries it.'],
  ['Senior Scholar', 'Senior Scholar / Field Leader', 'Leading a field: its open problems, its major theorems, and its people.'],
];

/**
 * Which skill can ask a question about a level.
 *
 * Ordered best-first. Matched on the title, then on the coverage. A level that
 * matches neither is served from the whole skill its grade is built from, which
 * is a broader question rather than a wrong one.
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
  // Counting, comparing and the shapes a preschool child handles by hand. These
  // come first because the sheet's first four grades are not about numerals at
  // all — they are about a pile of blocks, and a rule about place value would
  // sweep them into arithmetic the child has not reached.
  [/count|sens(e|ing) of quantity|more and less|one attribute|same and different|matching|sort(ing)? (toys|objects|things|by)|group/i, 'add_sub'],
  [/shape|pattern/i, 'geometry_area'],
  [/measur|weight|height|length|capacity|unit|cubes|foot|ruler|nonstandard|thermometer|degrees/i, 'geometry_area'],
  [/position|spatial|before|after|direction|map/i, 'geometry_area'],
  [/numeral|number name|writing (the )?numbers|trace|finger|handful|rhyme|detective|path|break(ing)? apart|ten\b|eleven|twelve|teen/i, 'add_sub'],

  // Place value and the arithmetic built on it.
  [/place value|tens and ones|hundreds|thousands|regroup|borrow|carry|expanded form|base.?ten|number line|compare(ing)? (numbers|numerals)|order(ing)? numbers|rounding/i, 'add_sub'],
  [/add(ition|ing)?|subtract(ion|ing)?|sum|difference|join|separat|take(s| away)|more than|less than/i, 'add_sub'],
  [/money|coin|cent\b|dollar|bill\b|quarter|change from|paying/i, 'decimals'],
  [/elapsed|clock|calendar|schedule|days? and hours|minutes and seconds|time (passing|elapsed)/i, 'word_problems'],

  // Multiplication and division, by the two meanings a sheet-level title uses:
  // equal groups, and sharing.
  [/multipli|factor|array|equal group|product|times (table|\d)|repeated addition|distributive/i, 'mul_div'],
  [/divi[dv]|quotient|remainder|sharing|grouping|equal sharing|partition/i, 'mul_div'],

  // Fractions, decimals and percents — the three ways of naming a part of a
  // whole, which the sheet teaches in that order across grades 3 to 6.
  [/fraction|numerator|denominator|equivalent|simplif|reducing|improper|mixed number|common denominator|lcm|gcd|coprime/i, 'fractions'],
  [/decimal|terminating|repeating|decimal point|place value to the (tenth|hundredth)|thousandth/i, 'decimals'],
  [/percent|per cent|out of a hundred|discount|tax|interest|percent(age)? (increase|decrease|change)/i, 'percents'],
  [/ratio|rate|proportion|unit rate|scale factor|similar(ity)? (in|of)|unit price|speed|density|unit conver/i, 'ratios'],

  // Geometry, in the order the sheet reaches for it.
  [/area|perimeter|surface area|volume|capacity|composite/i, 'geometry_area'],
  [/triang|pythagor|right angle|hypotenuse/i, 'geometry_area'],
  [/angle|parallel|perpendicular|congruent|similar|polygon|quadrilateral|trapezoid|rhombus|parallelogram/i, 'geometry_area'],
  [/circle|circumference|radius|diameter|arc|sector|chord|tangent|pythagor/i, 'geometry_area'],
  [/transform|rotation|reflection|translation|dilation|slope of a line|coordinate|midpoint|quadrant/i, 'slope_lines'],
  [/trigon|sin\b|cos\b|tan\b|sine|cosine|tangent(?!.*line)|law of sines|unit circle/i, 'trig_basics'],

  // Signed numbers, order of operations, exponents and roots.
  [/signed|negative|integer|absolute value|opposite|number line/i, 'integers'],
  [/order of operations|order of operation|bodmas|parenthes|precedence|pemdas/i, 'order_ops'],
  [/exponent|power of|square root|cube root|root|index (of|law)|laws? of (exponents|powers)|scientific notation/i, 'exponents'],
  [/logarithm|\blog\b|exponential/i, 'logs'],

  // Algebra, from its language to its graphs.
  [/expression|term|coefficient|variable|simplif|like term|distributive|translat(e|ing) (a )?(word|phrase)|evaluate/i, 'linear_eq'],
  [/equation|solve|solving|balance|two-step|one-step|formula|rearrang/i, 'linear_eq'],
  [/inequalit|greater than or equal|less than or equal|compound inequal/i, 'inequalities'],
  [/slope|rate of change|parallel lines|perpendicular lines|point-slope|line of best fit|linear function|proportional relationship|y ?= ?mx|graph a line/i, 'slope_lines'],
  [/system of equations|system\b|simultaneous|elimination|substitution method|word problem.*two unknown/i, 'systems'],
  [/quadratic|x\^2|factor(ing)? a quadratic|completing the square|quadratic formula|parabola|vertex/i, 'quadratics'],
  [/polynomial|monomial|binomial|remainder theorem|synthetic division|factor theorem|conjugate/i, 'polynomials'],
  [/rational expression|rational function|lcm of polynomial|partial fractions|variation/i, 'rational_expr'],
  [/function|domain|range|composition|inverse function|parent function|piecewise|end behavior|asymptote/i, 'functions'],
  [/sequence|series|arithmetic sequence|geometric sequence|recursive|summation|sigma|converge|diverge|geometric series/i, 'sequences'],
  [/complex number|imaginary|polar form|de moivre|argand/i, 'complex_nums'],

  // Data, chance and the two things a statistics grade is built on.
  [/probabilit|chance|odds|expected value|conditional|bayes|tree diagram|fair game|variance of a random/i, 'word_problems'],
  [/statistic|mean\b|median|mode\b|standard deviation|variance\b|quartile|box.?plot|histogram|scatter plot|correlation|regression|distribution|z-?score|confidence interval|hypothesis test|p-?value|sample mean|central limit/i, 'act_data'],
  [/data|chart|graph|table|survey|graphing|plot|read a graph|scale on a graph/i, 'act_data'],

  // The grade-a-level material, which is where the rules above stop fitting and
  // the fallback takes over. These are here so a level that *is* testable by
  // something in the bank lands on the nearest thing rather than on a default.
  [/calculus|limit|derivative|integral|differentiat|integrat|riemann|chain rule|product rule|quotient rule|fundamental theorem|series that conver|newton.?s method|lagrange|taylor/i, 'functions'],
  [/matrix|matrices|vector|linear transformation|eigen|determinant|rank|null space|row reduc|diagonaliz|inner product|span\b|orthogon/i, 'functions'],
  [/proof|theorem|axiom|lemma|corollary|induction|logic|deductive|counterexample|combinator|graph theor|set\b|equivalence relation|group\b|ring\b|field\b|homomorph|quotient/i, 'word_problems'],
  [/topolog|metric space|open set|compact|manifold|contour|holomorphic|residue|converge|uniformly|banach|hilbert|measure|lebesgue|riemann integral/i, 'functions'],
  [/differential equation|ode\b|pde\b|initial value|modeling|equilibrium|phase plane|numerical (method|approximation)|euler|runge|stability/i, 'word_problems'],
  [/differential form|manifold|vector field|tensor|stochastic|measure theory|fourier|laplace transform|convolution|partial derivative|multivariable|jacobian|gradient|divergence|curl/i, 'functions'],

  // Applied and professional mathematics: a word problem with a number in it is
  // the honest thing to serve here, because the material is a technique applied
  // to a situation and that is what a word problem is.
  [/optimiz|linear program|integer program|combinatorial|graph\b|network flow|queue|markov|chain|stochastic process|monte carlo|simulation|numerical/i, 'word_problems'],
  [/cryptograph|encryption|information theor|entropy|coding theor|complexity|computability|turing|automata|formal|proof assist|lean|coq|isabelle|type theor|category theor/i, 'word_problems'],
  [/teaching|curriculum|pedagog|student|learning|education|equity|assessment|inquiry|classroom/i, 'word_problems'],
  [/research|thesis|dissertation|advisor|grant|publication|peer review|conference|seminar|academic (writing|profession)|career|leadership|department|policy|survey of|history of|philosophy of|literature|misconduct|dispute|editor/i, 'act_data'],
  [/frontier|case study|problem (list|program)|roadmap|agenda of a field|field-defining|millennium|hilbert|smale/i, 'act_data'],
  // The remaining graduate material, which arrives as names rather than as
  // descriptions: a module, a bundle, a variety, a code. These are the words the
  // sheet uses at this level, and matching them is what keeps a doctoral grade
  // from falling through to the default on every line.
  [/module|variety|bundle|cohomology|duality|scheme|sheaf|gauge|field|surfaces?|hodge|wavelet|multiresolution|signal processing|perturbation|wkb|boundary layer|algebraic (closure|surface)|transcendence degree|nonassociative|lie superalgebra|jordan algebra|free, projective|injective|galois|structural turn|asymptotic|power series (and|,) |scattering|traveling salesman|heuristic/i, 'functions'],
  [/absolute (extrema|maxima|minima)|suprem|infima|least upper bound|closed (set|region)|closure|interior|boundary|path.?connected|components?|gluing|cylinder|mobius|torus|klein|singularit|casorati|essential|isolated|pole|residue|conformal|wronskian|linear independence of solutions|well.?posed|pigeonhole|shortest path|spanning tree|random walk|gambler|connectivity|paths? and cycles|quantifier|predicate|error.?correcting code|finite field|prime field|extreme value|argumen/i, 'functions'],
  [/fisher information|cramer|rao|bias|sampl|observational stud|experiment|randomi[sz]ation|control group|blocking|confidence|estimation|estimator|permutation test|bootstrap/i, 'act_data'],
  // The last of the sheet's own vocabulary. Seven lessons were left with no rule
  // after everything above, and because a drill inherits its lesson's skill those
  // seven accounted for four hundred and twenty-eight levels — so each is named
  // here rather than left to the fallback:
  //   Big and Small / Zero Means None       the first mathematics, by size and by
  //                                        nothing: comparing, and counting to a
  //                                        number that has no objects
  //   Fact Families                         three numbers that make the same sum,
  //                                        which is addition seen three ways
  //   Reasoning Abstractly                  choosing a model for a situation, which
  //                                        is a word problem about the word problem
  //   The Number e                          continuous growth, which is what the log
  //                                        rules above reach for
  //   Insurance Premiums                    risk priced against a premium, which is
  //                                        the same arithmetic in a situation
  //   Sylvester's Law of Inertia            a bilinear form's signature, which is a
  //                                        linear-algebra fact
  [/big and small|more and less|zero means|none left|empty/i, 'add_sub'],
  [/fact famil|related fact|number bond|triangle fact/i, 'add_sub'],
  [/reasoning abstract|choose a model|pick the best model|best representation|non-examples?/i, 'word_problems'],
  [/number e\b|continuous growth|euler'?s number/i, 'logs'],
  [/insurance|premium|deductible|risk\b|actuar/i, 'ratios'],
  [/sylvester|law of inertia|bilinear form|quadratic form|signature of/i, 'functions'],
  // The professional-skills lessons in the electives grade, which are the last
  // group with no lesson to inherit from. They are about doing mathematics rather
  // than about mathematics, and the honest thing to serve is the one skill that
  // can put a number in front of a learner whatever the topic — so a learner
  // meeting "Programming Foundations for Mathematicians in Python" is asked
  // questions about quantities and relationships rather than about code, which is
  // broader than the lesson but not wrong.
  [/writing mathematics|latex|tikz|beamer|diagram|slide|program(ming)?|python|matlab|julia|version control|jupyter|reproducib|code\b|software|tool|editor|notation|exposition|communicat|present|notation hygiene/i, 'word_problems'],
  [/olympiad|invariant|monovariant|extremal|number-theoretic|diophantine|contest problem|puzzle/i, 'word_problems'],
  // The electives grade labels each of its lessons with the field it belongs to:
  // "[Pure Math] …", "[Applied Math] …", "[Statistics/Data Science] …",
  // "[Logic/Foundations] …", "[Math Education] …", "[All Tracks] …". That label
  // is the sheet's own way of saying what sort of mathematics a lesson is, and it
  // is the only part of these titles that can be matched — "Putnam-Style Problems
  // in Analysis and Algebra" and "Life Contingencies and Survival Models" share no
  // vocabulary with each other or with anything in the bank. So the label is read
  // for the field, and the topic is left to the fallback.
  //
  // This is a catch-all for one grade of one sheet and it says so: it is the last
  // rule, so a lesson that any earlier rule claimed keeps its skill, and this only
  // sees what none of them wanted. `word_problems` is where a level lands when the
  // bank has no closer match, because it is the one math skill that can put a
  // number in front of a learner whatever the topic.
  [/^\[(pure math|applied math|statistics\/data science|logic\/foundations|math education|all tracks)\]/i, 'word_problems'],
];

const { grades, unknownTypes } = readSheet(SRC, skillFor);

// A drill takes the skill of the lesson it names, and this sheet's drills name
// their lesson: "Activity 3 of 9 (quiz/game): Match Objects, Pictures, and
// Numbers - Big and Small Play with Blocks" is a drill on that lesson. Without
// this, one lesson the rules miss leaves all nine of its drills with no skill —
// which is why 48 unmatched lessons accounted for 2,539 unmatched levels, and
// the rules had to be widened against the lessons rather than against the drills.
//
// The same holds for a Summary (it names the lessons it recaps, joined by " + ")
// and for a cycle quiz (it names nothing, so it is left to the fallback).
//
// The lookup is by lesson title, and in the electives grade it cannot be a plain
// exact match. That grade labels each lesson with its field — "[Pure Math] …" —
// but a drill names the lesson *without* the label: the lesson is
// "[Pure Math] Putnam-Style Problems in Analysis and Algebra" and the drill is
// "Activity 3 of 9 (quiz/game): Identify the Hypotheses and the Key Idea -
// Putnam-Style Problems in Analysis and Algebra". Matching the drill's name
// against the lesson's title found nothing, and 268 levels were left with no
// skill for exactly that reason — every lesson in that grade was fine and every
// drill on them was not.
//
// So a lesson is indexed twice: by its title as written, and by its title with any
// leading field label removed. A drill then finds its lesson by either name, and a
// label in the lesson's title is never required to be repeated by the drill.
const stripLabel = (title) => title.replace(/^\[[^\]]*\]\s*/, '');

/** The names a drill might use for a lesson, lower-cased. */
function lessonKeys(title) {
  const keys = new Set([title.toLowerCase()]);
  const bare = stripLabel(title).toLowerCase();
  if (bare && bare !== title.toLowerCase()) keys.add(bare);
  return keys;
}

for (const g of grades) {
  const byLesson = new Map();
  for (const l of g.levels) {
    if (l.skill && l.kind === 'lesson') {
      for (const k of lessonKeys(l.title)) if (!byLesson.has(k)) byLesson.set(k, l.skill);
    }
  }
  for (const l of g.levels) {
    if (l.skill) continue;
    // The part after " - ", which is the lesson a drill sits on.
    const dash = l.title.indexOf(' - ');
    if (dash > 0) {
      const named = byLesson.get(l.title.slice(dash + 3).trim().toLowerCase());
      if (named) { l.skill = named; continue; }
    }
    // A Summary names its lessons inside its own title: "Summary: A + B + C".
    if (/^summary:/i.test(l.title)) {
      const parts = l.title.replace(/^summary:\s*/i, '')
        .replace(/\s*-\s*(cycle|level)\b.*$/i, '')
        .split(/\s*\+\s*/);
      for (const p of parts) {
        const named = byLesson.get(stripLabel(p).trim().toLowerCase());
        if (named) { l.skill = named; break; }
      }
    }
  }
}

// The names, and the skills a grade is built from when the rules name none — the
// twenty-odd are the ones the rules can produce, in the order a course meets them,
// so a grade's bands follow the sheet rather than an alphabetical list.
const SKILL_FALLBACK = ['add_sub', 'mul_div', 'fractions', 'decimals', 'percents', 'ratios',
  'integers', 'order_ops', 'exponents', 'geometry_area', 'slope_lines', 'trig_basics',
  'linear_eq', 'inequalities', 'systems', 'quadratics', 'polynomials', 'functions',
  'logs', 'sequences', 'rational_expr', 'complex_nums', 'word_problems', 'act_data'];

/** The display name, tier and blurb for each grade, by its position in the sheet. */

/** grade band -> the tier it was filed at, for the report at the end. */
const tiersSeen = {};

function metaFor(index) {
  const row = GRADE_NAMES[index];
  if (!row) {
    // Unreachable for the sheet as it stands, and stated rather than guessed: a
    // name invented here would be a course the creator never wrote.
    throw new Error(`the math sheet has a grade at index ${index} with no name in`
      + ' GRADE_NAMES; add one rather than letting it fall back to a heading');
  }
  const [name, band, blurb] = row;
  // The tier is the band, and the band is the course. Read the grade number out of
  // the band and group those into the bands the placement quiz is sized for, with
  // the post-secondary bands above them.
  //
  // Two versions of this were wrong before it was right, both invisibly, because a
  // tier is a sort order: a grade filed one band too low still renders, still has
  // every level, and still has a title. The first matched `([1-8])…Grade` and
  // stopped at eight, so 9th grade and everything after it fell through. The
  // second used `if (gradeNum === 0) tier = 1` for preschool — but `gradeNum` is 0
  // for a band with *no* grade number in it as well, so "College Freshman,
  // semester 1" and "Graduate School, PhD" were both filed as preschool, and
  // twenty-three of the forty-nine grades came out at tier 1. The symptom was a
  // twenty-question placement quiz offered in a doctoral course.
  //
  // So: a band that names a grade year is a school grade and is read as one; a band
  // that does not is post-secondary and is read by what it does name. The two are
  // never both true, and the branch order follows that rather than relying on a
  // zero that means two different things.
  const isSchool = /Preschool|Pre-K|Kindergarten|\b([1-9]|1[0-2])\s*(?:st|nd|rd|th)\b/i.test(band);
  const isCollege = /College (Freshman|Sophomore|Junior|Senior)/i.test(band);
  const isGraduate = /Graduate School|Postdoctoral|Senior Scholar/i.test(band);
  const honors = /Honors|AP level/i.test(band);

  const m = /\b([1-9]|1[0-2])\s*(?:st|nd|rd|th)\b/i.exec(band);
  const gradeNum = m ? Number(m[1]) : 0;

  let tier;
  if (isSchool) {
    if (gradeNum === 0) tier = 1;                    // preschool, pre-K, kindergarten
    else if (gradeNum <= 3) tier = 1;                // 1st to 3rd
    else if (gradeNum <= 8) tier = 2;                // 4th to 8th
    else tier = honors ? 3 : 2;                      // 9th to 12th; honors run ahead
  } else if (isCollege) {
    tier = /College (Freshman|Sophomore)/i.test(band) ? 4 : 5;
  } else if (isGraduate) {
    tier = 6;
  } else {
    // A band that is neither, stated rather than guessed: a new kind of course in
    // the sheet should be filed deliberately, not by which branch it happened to
    // miss.
    throw new Error(`the math sheet has a grade band this generator does not place:`
      + ` ${JSON.stringify(band)} (grade "${GRADE_NAMES[index][0]}").`
      + ' Add it to the tier rules rather than letting it fall to a default.');
  }
  // The tiers just assigned, as a record. A wrong tier is invisible in the output,
  // so the counts are printed and a band filed above the school grades is named.
  tiersSeen[band] = tier;
  return { name: `${name} — ${band}`, tier, blurb };
}

writeTrack({
  grades: grades.map((g, i) => {
    // The skills this grade's own levels name, in the order they first appear, so
    // the grade's bands follow its sheet. A grade whose levels name none falls
    // back to the whole reading list, because a grade with no skills has no bands
    // and therefore no levels.
    const seen = [];
    for (const l of g.levels) {
      if (l.skill && !seen.includes(l.skill)) seen.push(l.skill);
    }
    g.skills = seen.length ? seen : SKILL_FALLBACK;
    return g;
  }),
  out: OUT,
  subject: 'Math',
  meta: (() => {
    // `writeTrack` looks meta up by id, so build it by id from the same names.
    const { idFrom } = require('./build-sheet-track');
    const out = {};
    grades.forEach((g, i) => { out[idFrom(g.heading, i)] = metaFor(i); });
    return out;
  })(),
  keepIds: null,
  unknownTypes,
});

// The tier report, because a tier is invisible in the output. A grade filed one
// band too low still renders, still has every one of its levels, and still has a
// title and a coverage — the only symptom is a placement quiz sized for a
// younger course, which is easy to read as "the placement quiz is short".
const byTier = new Map();
for (const tier of Object.values(tiersSeen)) byTier.set(tier, (byTier.get(tier) || 0) + 1);
console.log(`\ntiers: ${[...byTier].sort((a, b) => a[0] - b[0])
  .map(([t, n]) => `${n} at tier ${t}`).join(', ')}`);
const suspicious = Object.entries(tiersSeen)
  .filter(([band, tier]) => tier === 6 && !/Graduate|Postdoc|Senior Scholar/.test(band));
if (suspicious.length) {
  console.log(`  ${suspicious.length} band(s) filed at tier 6 that are not graduate bands:`);
  for (const [band] of suspicious) console.log(`    ${band}`);
}
