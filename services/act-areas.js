/**
 * Which ACT area a placement question belongs to, for the free level check's "three weakest areas".
 *
 * The ACT placement questions carry a topic line, sometimes tagged ("[Math] ...", "English: ...") and sometimes not. An
 * explicit tag wins; otherwise the topic and prompt are matched against keyword lists, most specific area first. Anything
 * that matches nothing is left out of the weakest-areas ranking rather than guessed into one.
 *
 * Science is shown as an area, but the ACT composite is English, math and reading (docs: act.html).
 */
const AREAS = [
  { id: 'grammar', section: 'English', name: 'English: grammar and punctuation' },
  { id: 'rhetoric', section: 'English', name: 'English: style, organisation and rhetoric' },
  { id: 'algebra', section: 'Math', name: 'Math: algebra and functions' },
  { id: 'number', section: 'Math', name: 'Math: numbers, fractions, ratios and percents' },
  { id: 'geometry', section: 'Math', name: 'Math: geometry and trigonometry' },
  { id: 'data', section: 'Math', name: 'Math: data, statistics and probability' },
  { id: 'reading', section: 'Reading', name: 'Reading: comprehension and inference' },
  { id: 'science', section: 'Science', name: 'Science: data and scientific reasoning' },
];
const BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]));

const TAG = [
  [/^\s*\[?(reading)\]?\s*:?/i, 'reading'],
  [/^\s*\[?(science)\]?\s*:?/i, 'science'],
];
const RULES = [
  ['reading', /\b(passage|main idea|author'?s? (purpose|tone|claim)|inference|infer|character|narrator|literary|theme|supporting detail|point of view|vocabulary in context|words in context|figurative|tone|rhetorical purpose of the passage|compare two passages|paired passages)/i],
  ['science', /\b(experiment|hypothesis|scientific|science|correlation|causation|science graph|trial|independent variable|dependent variable|conflicting viewpoints|research summar|control group|data representation|lab)/i],
  ['geometry', /\b(triangle|circle|angle|area|perimeter|volume|radius|diameter|pythag|trig|sine|cosine|tangent|polygon|rectangle|parallel|perpendicular|coordinate geometry|midpoint|distance formula|similar|congruent|arc|sector|cylinder|cone|sphere|radian|vector)/i],
  ['data', /\b(\bmean\b|median|\bmode\b|average|probability|statistic|standard deviation|scatter|residual|histogram|box plot|table|chart|graph|data|counting|permutation|combination|expected value|survey|sample)/i],
  ['grammar', /\b(comma|semicolon|colon|apostrophe|punctuation|subject.verb|verb tense|pronoun|modifier|sentence fragment|run.on|parallel structure|conjunction|preposition|capitali[sz]|agreement|dash|clause|sentence structure|possessive|plural|homophone|idiom|verb form|adjective|adverb|noun|verb|subjunctive|linking|tense|mood)/i],
  ['rhetoric', /\b(transition|rhetoric|organi[sz]ation|concis|wordiness|redundan|topic sentence|paragraph|essay|style|tone|purpose of the (sentence|underlined)|add or delete|irony|analogy|hyperbole|rhetorical device|logical order|effective)/i],
  ['algebra', /\b(equation|inequalit|linear|quadratic|polynomial|factor|function|slope|intercept|system|exponent|logarithm|log|expression|expand|distribut|solve for|variable|absolute value|radical|sequence|complex number|matrix|domain|range|vertex|parabola|rational|binomial|trinomial|radical|exponential|interval|simplif|sign error|evaluat)/i],
  ['number', /\b(fraction|decimal|percent|ratio|proportion|rate|integer|place value|rounding|estimat|order of operations|multiple|divisib|prime|gcf|lcm|unit conversion|interest|discount|scientific notation|number line|negative|word problem|arithmetic|discount|sales tax|sum)/i],
];

/** The area id of a question, or null when nothing in it says. */
function areaOf(q) {
  const topic = String((q && q.topic) || '');
  const prompt = String((q && q.prompt) || '');
  const bracket = topic.match(/^\s*\[(math|english|reading|science)\]/i) || topic.match(/^\s*(math|english|reading|science)\s*:/i);
  const section = bracket ? bracket[1].toLowerCase() : null;
  const hay = `${topic.replace(/^\s*\[[^\]]*\]\s*/, '').replace(/^\s*(math|english|reading|science)\s*:\s*/i, '')} ${section ? '' : prompt.slice(0, 160)}`;
  const pick = (ids) => {
    for (const [id, re] of RULES) if (ids.includes(id) && re.test(hay)) return id;
    return null;
  };
  if (section === 'reading') return 'reading';
  if (section === 'science') return 'science';
  if (section === 'english') return pick(['grammar', 'rhetoric']) || 'grammar';
  if (section === 'math') return pick(['geometry', 'data', 'algebra', 'number']) || 'algebra';
  for (const [id, re] of RULES) if (re.test(hay)) return id;
  return null;
}

module.exports = { AREAS, BY_ID, areaOf };
