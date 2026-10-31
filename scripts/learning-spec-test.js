/**
 * The learning spec (services/learning-spec.js): every scorecard metric, plus interests, dislikes and
 * context, shapes how anything is rebuilt for a learner.
 *
 *   node scripts/learning-spec-test.js      (also run by `npm test`)
 *
 * Checks (no model is called; the data file is a temporary empty one):
 *   1. every metric has a rule (a new metric in stats.js without one fails here), every rule names real
 *      levers, every lever is pulled by at least one metric, every evidence id is a real mechanism
 *   2. per-metric sensitivity: each metric, alone, moves at least one concrete spec field
 *   3. confidence: a less sure reading moves a lever less than a sure one
 *   4. interests are used and dislikes are excluded (and a disliked subject that IS the topic becomes an aversion)
 *   5. 2,000 random scorecards from a fixed seed (extreme, missing, brand new): always a complete, valid,
 *      non-contradictory spec, and every rule monotonic in its documented direction
 *   6. deterministic, and under 20 ms
 *   7. the prompt: empty for the default spec, no learner numbers, surfaces, the content contract
 *   8. the post-generation check and the single revision
 *   9. reads the app's records (scorecard, survey, facts, mastery, goal, age) and gives the owner the default
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `learning-spec-test-${process.pid}.json`);
process.env.DB_FILE = tmp;
process.on('exit', () => { for (const f of [tmp, `${tmp}.tmp`]) try { fs.unlinkSync(f); } catch { /* gone */ } });

const assert = require('assert');
const ls = require('../services/learning-spec');
const { STATS } = require('../services/scorecard/stats');

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? `: ${detail}` : ''}`); }
}

const blankMetrics = () => Object.fromEntries(STATS.map((s) => [s.id, { measured: 50, confidence: 0 }]));
const input = (over = {}) => ({ metrics: blankMetrics(), ...over });
const withMetric = (id, measured, confidence, over = {}) => {
  const i = input(over);
  i.metrics[id] = { measured, confidence };
  return i;
};

// A seeded generator, so the 2,000 cards are the same every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every leaf path of an object, as { 'a.b': value } (arrays kept whole). */
function leaves(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, p, out); else out[p] = v;
  }
  return out;
}
const CONCRETE = (spec) => {
  const { levers, provenance, version, ...rest } = spec;
  return leaves(rest);
};
const diffFields = (a, b) => {
  const x = CONCRETE(a);
  const y = CONCRETE(b);
  return Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]) && k !== 'isDefault');
};

console.log('1. rules cover every metric');
{
  const have = new Set(ls.METRIC_RULES.map((r) => r.metric));
  const missing = STATS.filter((s) => !have.has(s.id)).map((s) => s.id);
  check('every metric in stats.js has a rule', missing.length === 0, missing.join(', '));
  check('there are 100 metrics and 100 rules', STATS.length === 100 && ls.METRIC_RULES.length === 100, `${STATS.length}/${ls.METRIC_RULES.length}`);
  const ids = new Set(STATS.map((s) => s.id));
  check('every rule names a real metric, once', ls.METRIC_RULES.every((r) => ids.has(r.metric)) && have.size === ls.METRIC_RULES.length);
  check('every rule has an effect, a documented rule text, and valid direction and weight',
    ls.METRIC_RULES.every((r) => r.effects.length >= 1 && r.rule.length > 20 && r.effects.every((e) => ls.LEVERS[e.lever] && (e.dir === 1 || e.dir === -1) && e.w > 0 && e.w <= 1)));
  const pulled = new Set(ls.METRIC_RULES.flatMap((r) => r.effects.map((e) => e.lever)));
  check('every lever is pulled by at least one metric', ls.LEVER_IDS.every((l) => pulled.has(l)), ls.LEVER_IDS.filter((l) => !pulled.has(l)).join(', '));
  // Evidence ids are real mechanism numbers in the evidence article.
  const doc = (n) => fs.readFileSync(path.join(__dirname, '..', 'curriculum-build', 'evidence-article', n), 'utf8');
  const nums = (text, re) => new Set([...text.matchAll(re)].map((m) => Number(m[1])));
  const m03 = nums(doc('03-scorecard-adaptation.md'), /^#### (\d+)\./gm);
  const m02 = nums(doc('02-retention-review.md'), /^\| (\d+) \|/gm);
  const bad = [];
  for (const r of ls.METRIC_RULES) {
    if (r.ev === null) continue;
    for (const id of String(r.ev).split(',')) {
      const m = /^(0[23])-M(\d+)$/.exec(id.trim());
      if (!m || !(m[1] === '03' ? m03 : m02).has(Number(m[2]))) bad.push(`${r.metric}:${id}`);
    }
  }
  check('every evidence id is a mechanism in 03-scorecard-adaptation.md or 02-retention-review.md', bad.length === 0, bad.join(', '));
  check('every context rule has an id, a rule text and a function', ls.CONTEXT_RULES.every((c) => c.id && c.rule && typeof c.pulls === 'function'));
  check('context rules name real levers', ls.CONTEXT_RULES.every((c) => c.pulls({ age: 8, esl: true, readingSupport: true, device: 'phone', mastery: 0.1, attempts: 5, goal: 'test', aversions: ['math', 'reading', 'writing'], topicDomain: 'math' }).every(([l]) => ls.LEVERS[l])));
}

console.log('2. every metric moves a concrete field');
{
  const failed = [];
  for (const s of STATS) {
    const hi = ls.buildSpecFrom(withMetric(s.id, 95, 95, { interests: ['soccer'] }));
    const lo = ls.buildSpecFrom(withMetric(s.id, 5, 95, { interests: ['soccer'] }));
    if (!diffFields(hi, lo).length) failed.push(s.id);
  }
  check('each of the 100 metrics, alone, changes at least one spec field', failed.length === 0, failed.join(', '));
  const lever = [];
  for (const l of ls.LEVER_IDS) {
    // Pull one lever to each end through a metric that drives it, and compare the concrete fields.
    const rule = [...ls.METRIC_RULES].filter((r) => r.effects.some((e) => e.lever === l)).sort((a, b) => b.effects.find((e) => e.lever === l).w - a.effects.find((e) => e.lever === l).w)[0];
    const e = rule.effects.find((x) => x.lever === l);
    const hi = ls.buildSpecFrom(withMetric(rule.metric, e.dir > 0 ? 100 : 0, 100));
    const lo = ls.buildSpecFrom(withMetric(rule.metric, e.dir > 0 ? 0 : 100, 100));
    if (Math.abs(hi.levers[l] - lo.levers[l]) < 0.2) lever.push(`${l}(weak)`);
  }
  check('every lever is moved visibly by a metric', lever.length === 0, lever.join(', '));
  const dead = [];
  for (const l of ls.LEVER_IDS) {
    const base = ls.buildSpecFrom(input());
    const up = ls.buildSpecFrom({ ...input(), _force: l });
    void base; void up;
  }
  check('a brand-new learner reads as the default spec', ls.buildSpecFrom(input()).isDefault === true);
  void dead;
}

console.log('3. confidence');
{
  const worse = [];
  for (const s of STATS) {
    const rule = ls.RULE_OF.get(s.id);
    const lever = rule.effects[0].lever;
    const lowC = Math.abs(ls.buildSpecFrom(withMetric(s.id, 95, 20)).levers[lever]);
    const highC = Math.abs(ls.buildSpecFrom(withMetric(s.id, 95, 90)).levers[lever]);
    const zero = ls.buildSpecFrom(withMetric(s.id, 95, 0)).levers[lever];
    if (!(lowC < highC) || zero !== 0) worse.push(s.id);
  }
  check('a low-confidence reading moves its lever less than a high-confidence one, and zero confidence moves nothing', worse.length === 0, worse.join(', '));
  const fall = ls.buildSpecFrom(withMetric('attention_runway', 10, 25));
  const sure = ls.buildSpecFrom(withMetric('attention_runway', 10, 90));
  check('so a short-focus learner the app is sure of gets a shorter session than one it is unsure of', sure.session.minutes <= fall.session.minutes && sure.lesson.minutes <= fall.lesson.minutes);
}

console.log('4. interests and dislikes');
{
  const spec = ls.buildSpecFrom(input({ interests: ['soccer', 'minecraft', 'cooking'], dislikes: ['spiders', 'soccer'], topic: 'photosynthesis', trackId: 'science' }));
  check('interests become example domains', spec.interests.exampleDomains.includes('minecraft') && spec.interests.exampleDomains.includes('cooking'));
  check('an interest that is also disliked is dropped', !spec.interests.exampleDomains.includes('soccer'));
  check('dislikes become avoided domains', spec.interests.avoidDomains.includes('spiders') && spec.interests.avoidDomains.includes('soccer'));
  const p = ls.specToPrompt(spec);
  check('the prompt names the interests and the avoided domains', /minecraft/.test(p) && /Never use examples[^\n]*spiders/.test(p), p.split('\n').filter((l) => /Examples|Never use/.test(l)).join(' | '));
  check('the prompt does not offer a disliked domain as an example source', !/draw them from[^\n]*soccer/.test(p));
  const neutral = ls.buildSpecFrom(withMetric('interest_transfer', 5, 95, { interests: ['cars'] }));
  check('a learner interest framing does not help gets neutral examples', neutral.interests.share < 0.3 && /neutral/.test(ls.specToPrompt(neutral)));
  const strong = ls.buildSpecFrom(withMetric('interest_transfer', 95, 95, { interests: ['cars'] }));
  check('and one it helps a lot gets examples built on them', strong.interests.share >= 0.8 && /cars/.test(ls.specToPrompt(strong)));
  const none = ls.buildSpecFrom(withMetric('interest_transfer', 95, 95));
  check('no stated interests: never invent one', none.interests.exampleDomains.length === 0 && none.interests.share === 0 && !/draw them from/.test(ls.specToPrompt(none)));
  const maths = ls.buildSpecFrom(input({ dislikes: ['math'], topic: 'two-step equations', trackId: 'math' }));
  check('a disliked subject that is the topic is not "avoided" (it cannot be) but becomes an aversion', !maths.interests.avoidDomains.includes('math') && maths.aversions.includes('math') && maths.feedback.lowStakes);
  const other = ls.buildSpecFrom(input({ dislikes: ['math'], topic: 'photosynthesis', trackId: 'science' }));
  check('the same dislike on another topic is avoided in examples', other.interests.avoidDomains.includes('math'));
  const parsed = ls.dislikesFromText('I hate word problems and I can\'t stand long reading. Really dislike being timed!');
  check('dislikes are read from plain sentences', parsed.includes('word problems') && parsed.some((p) => /reading/.test(p)) && parsed.some((p) => /timed/.test(p)), JSON.stringify(parsed));
  check('interests are read from a plain list', JSON.stringify(ls.interestsFromText('Soccer, minecraft and drawing; I like cars')) === JSON.stringify(['soccer', 'minecraft', 'drawing', 'cars']), JSON.stringify(ls.interestsFromText('Soccer, minecraft and drawing; I like cars')));
}

console.log('5. context');
{
  const kid = ls.buildSpecFrom(input({ age: 8 }));
  const old = ls.buildSpecFrom(input({ age: 60 }));
  check('an 8-year-old gets shorter sentences, plainer words and a shorter session than a 60-year-old',
    kid.language.maxSentenceWords < old.language.maxSentenceWords && kid.language.vocabularyGrade < old.language.vocabularyGrade && kid.session.minutes < old.session.minutes);
  const esl = ls.buildSpecFrom(input({ age: 25, esl: true }));
  const native = ls.buildSpecFrom(input({ age: 25 }));
  check('English as a second language gets plainer words, shorter sentences, defined terms and no idioms',
    esl.language.vocabularyGrade < native.language.vocabularyGrade && esl.language.maxSentenceWords < native.language.maxSentenceWords && esl.language.avoidIdioms && esl.language.defineTerms === 'every-use');
  const phone = ls.buildSpecFrom(input({ age: 25, device: 'phone' }));
  const desk = ls.buildSpecFrom(input({ age: 25, device: 'desk' }));
  check('phone-only gets a shorter session and lesson than a desk', phone.session.minutes < desk.session.minutes && phone.lesson.minutes <= desk.lesson.minutes);
  const novice = ls.buildSpecFrom(input({ mastery: 0.1, attempts: 6 }));
  const expert = ls.buildSpecFrom(input({ mastery: 0.9, attempts: 12 }));
  check('weak on the topic: more worked examples and support, a lower start; strong: the reverse',
    novice.practice.workedToPractice > expert.practice.workedToPractice && novice.scaffolding.level > expert.scaffolding.level && novice.difficulty.startOffset < expert.difficulty.startOffset);
  const unseen = ls.buildSpecFrom(input({ mastery: null, attempts: 0 }));
  check('an unseen topic never loses its worked examples (03-M18)', unseen.practice.workedToPractice >= 0.5 - 1e-9);
  const test = ls.buildSpecFrom(input({ goal: 'test' }));
  const quick = ls.buildSpecFrom(input({ goal: 'essentials' }));
  check('goals move the spec (test: more checks, essentials: shorter)', test.lesson.retrievalChecks > quick.lesson.retrievalChecks && quick.lesson.minutes < test.lesson.minutes);
  const reading = ls.buildSpecFrom(input({ dislikes: ['reading'] }));
  check('disliking reading means short paragraphs', reading.explain.textDensity === 'sparse');
  const anxious = ls.buildSpecFrom(withMetric('evaluation_anxiety', 95, 90));
  check('test-anxious: low stakes, no timers, gentle correction', anxious.feedback.lowStakes && anxious.feedback.timers === 'none' && anxious.feedback.tone.correction === 'gentle');
}

console.log('6. 2,000 random scorecards (seed 20261031)');
{
  const rand = rng(20261031);
  const ref = ls.buildSpecFrom(input());
  const refKeys = Object.keys(leaves(ref)).filter((k) => !k.startsWith('levers') && !k.startsWith('provenance')).sort();
  const types = (o) => Object.fromEntries(Object.entries(leaves(o)).map(([k, v]) => [k, Array.isArray(v) ? 'array' : typeof v]));
  const refTypes = types(CONCRETE(ref) && Object.fromEntries(Object.entries(ref).filter(([k]) => k !== 'levers' && k !== 'provenance')));
  const problems = new Set();
  let n = 0;
  const kinds = ['uniform', 'extreme', 'missing', 'new', 'sparse'];
  for (let i = 0; i < 2000; i++) {
    const kind = kinds[i % kinds.length];
    const metrics = {};
    for (const s of STATS) {
      if (kind === 'new') metrics[s.id] = { measured: 50, confidence: 0 };
      else if (kind === 'missing' && rand() < 0.5) continue; // a metric with no reading at all
      else if (kind === 'sparse' && rand() < 0.8) metrics[s.id] = { measured: 50, confidence: 0 };
      else if (kind === 'extreme') metrics[s.id] = { measured: rand() < 0.5 ? 0 : 100, confidence: rand() < 0.5 ? 100 : Math.round(rand() * 100) };
      else metrics[s.id] = { measured: Math.round(rand() * 100), confidence: Math.round(rand() * 100) };
    }
    const inp = {
      metrics,
      age: rand() < 0.2 ? null : Math.round(5 + rand() * 70),
      esl: rand() < 0.15,
      readingSupport: rand() < 0.1,
      device: ['phone', 'desk', null][Math.floor(rand() * 3)],
      mastery: rand() < 0.4 ? null : rand(),
      attempts: Math.floor(rand() * 20),
      goal: [null, 'next_grade', 'deep', 'test', 'essentials', 'conversation', 'specific'][Math.floor(rand() * 7)],
      interests: ['soccer', 'minecraft', 'cooking', 'cars', 'art', 'music', 'gaming'].filter(() => rand() < 0.3),
      dislikes: ['math', 'reading', 'spiders', 'soccer', 'writing', 'history'].filter(() => rand() < 0.2),
      topic: ['photosynthesis', 'two-step equations', 'causes of World War I', 'Spanish greetings'][Math.floor(rand() * 4)],
      trackId: null,
    };
    let spec;
    try { spec = ls.buildSpecFrom(inp); } catch (e) { problems.add(`threw: ${e.message}`); continue; }
    n++;
    // Complete: the same fields as the default spec, the same types.
    const flat = Object.fromEntries(Object.entries(spec).filter(([k]) => k !== 'levers' && k !== 'provenance'));
    const t = types(flat);
    const keys = Object.keys(t).filter((k) => !k.startsWith('provenance')).sort();
    if (JSON.stringify(keys) !== JSON.stringify(refKeys.filter((k) => !k.startsWith('provenance')))) problems.add('incomplete: field set differs from the default spec');
    for (const [k, ty] of Object.entries(t)) if (refTypes[k] && refTypes[k] !== ty) problems.add(`type: ${k} is ${ty}, default ${refTypes[k]}`);
    // Valid: finite numbers inside their bounds, known enums.
    for (const [k, v] of Object.entries(leaves(flat))) if (typeof v === 'number' && !Number.isFinite(v)) problems.add(`not finite: ${k}`);
    for (const l of ls.LEVER_IDS) if (!(spec.levers[l] >= -1 && spec.levers[l] <= 1)) problems.add(`lever out of range: ${l}`);
    const b = (k, v, lo, hi) => { if (!(v >= lo && v <= hi)) problems.add(`out of bounds: ${k}=${v}`); };
    b('lesson.minutes', spec.lesson.minutes, 3, 18); b('lesson.sections', spec.lesson.sections, 2, 6); b('chunkSentences', spec.lesson.chunkSentences, 2, 8);
    b('retrievalChecks', spec.lesson.retrievalChecks, 1, 7); b('warmupItems', spec.lesson.warmupItems, 0, 3); b('newIdeasPerChunk', spec.lesson.newIdeasPerChunk, 1, 3);
    b('vocabularyGrade', spec.language.vocabularyGrade, 1, 15); b('maxSentenceWords', spec.language.maxSentenceWords, 6, 30);
    b('startOffset', spec.difficulty.startOffset, -1.5, 1); b('stretch', spec.difficulty.stretchShare, 0.05, 0.25); b('support', spec.difficulty.supportShare, 0, 0.35);
    b('spacing', spec.review.spacingScale, 0.6, 1.25); b('targetRecall', spec.review.targetRecall, 0.85, 0.95); b('interleaving', spec.review.interleaving, 0, 0.6);
    b('session.minutes', spec.session.minutes, 5, 45); b('breakEvery', spec.session.breakEveryMinutes, 4, 30); b('items', spec.session.items, 4, 16);
    b('hintLevel', spec.scaffolding.hintLevel, 1, 3); b('workedToPractice', spec.practice.workedToPractice, 0.125, 2); b('share', spec.interests.share, 0, 0.9);
    if (!['brisk', 'steady', 'slow'].includes(spec.lesson.pace)) problems.add('pace enum');
    if (!['nudge', 'partial', 'step'].includes(spec.scaffolding.hintSize)) problems.add('hintSize enum');
    if (!['every-use', 'first-use', 'once'].includes(spec.language.defineTerms)) problems.add('defineTerms enum');
    if (!['immediate', 'after-set'].includes(spec.feedback.timing)) problems.add('timing enum');
    // Non-contradictory.
    const c = (cond, msg) => { if (!cond) problems.add(`contradiction: ${msg}`); };
    c(spec.feedback.lowStakes === (spec.feedback.timers === 'none'), 'low stakes iff no timers');
    c(!spec.interests.exampleDomains.some((d) => spec.interests.avoidDomains.some((a) => ls.mentions(d, a) || ls.mentions(a, d))), 'an interest is also an avoided domain');
    c(spec.interests.share === 0 || spec.interests.exampleDomains.length > 0, 'interest share without any interest');
    c(spec.difficulty.stretchShare + spec.difficulty.supportShare <= 0.5, 'stretch plus support over half the items');
    c(spec.session.breakEveryMinutes <= Math.max(spec.session.minutes, 8) + 10, 'break interval beyond the session');
    c(!(spec.scaffolding.hintSize === 'nudge' && spec.scaffolding.hintsBeforeReveal < 1), 'small hints with no hints');
    c(!(spec.explain.order === 'rule-first' && spec.explain.modes[0] === 'concrete-first'), 'rule-first order but concrete-first top mode');
    c(!(spec.lesson.minutes <= 4 && spec.lesson.retrievalChecks > 5), 'a very short lesson with many checks');
    c(spec.lesson.sections <= 6 && spec.lesson.chunkSentences * spec.lesson.sections <= 48, 'lesson size');
    c(spec.explain.modes.length === new Set(spec.explain.modes).size, 'a mode twice');
    c(ls.specToPrompt(spec) === '' ? spec.isDefault : true, 'an empty prompt for a non-default spec');
    c(!spec.isDefault || ls.specToPrompt(spec) === '', 'a prompt for the default spec');
    const prompt = ls.specToPrompt(spec);
    if (prompt) {
      c(/Content contract/.test(prompt), 'prompt lacks the content contract');
      c(!/scorecard|confidence|measured score/i.test(prompt.replace(/Never mention[^\n]*/, '')), 'prompt names the scorecard');
      // Opposite sides of one lever are never both in the prompt.
      for (const l of ls.LEVER_IDS) {
        const [neg, pos] = ls.PHRASES[l] || [];
        if (neg && pos && prompt.includes(neg) && prompt.includes(pos)) problems.add(`contradiction: both sides of ${l} in the prompt`);
      }
      const numbered = prompt.split('\n').filter((x) => /^\d+\. /.test(x)).length;
      c(numbered <= ls.MAX_PHRASES + 7, `a prompt of ${numbered} items`); // language, shape, at most MAX_PHRASES sentences, examples, avoided, at most 2 aversion notes
    }
  }
  check(`${n} random learners all gave a complete, valid, non-contradictory spec`, problems.size === 0, [...problems].slice(0, 6).join(' | '));

  // Monotonic: raising a metric moves each of its levers in its documented direction, whatever the rest are.
  const rand2 = rng(77);
  const wrong = [];
  for (let i = 0; i < 400; i++) {
    const rule = ls.METRIC_RULES[Math.floor(rand2() * ls.METRIC_RULES.length)];
    const metrics = {};
    for (const s of STATS) metrics[s.id] = { measured: Math.round(rand2() * 100), confidence: Math.round(rand2() * 100) };
    const conf = 20 + Math.round(rand2() * 80);
    const lo = ls.buildSpecFrom({ metrics: { ...metrics, [rule.metric]: { measured: 10, confidence: conf } }, age: 14 });
    const hi = ls.buildSpecFrom({ metrics: { ...metrics, [rule.metric]: { measured: 90, confidence: conf } }, age: 14 });
    for (const e of rule.effects) {
      const moved = (hi.levers[e.lever] - lo.levers[e.lever]) * e.dir;
      if (moved < -1e-9) wrong.push(`${rule.metric}->${e.lever}`);
    }
    // And no other lever moves.
    const others = ls.LEVER_IDS.filter((l) => !rule.effects.some((e) => e.lever === l) && Math.abs(hi.levers[l] - lo.levers[l]) > 1e-9);
    if (others.length) wrong.push(`${rule.metric} moved ${others[0]} without a rule`);
  }
  check('400 random raises of one metric: every lever it names moves the documented way, and no other lever moves', wrong.length === 0, [...new Set(wrong)].slice(0, 5).join(', '));
  // Monotone in the derived fields too, on the headline ones.
  const heads = [
    ['brevity_preference', -1, (s) => s.lesson.minutes], ['attention_runway', 1, (s) => s.session.minutes], ['vocabulary_ceiling', 1, (s) => s.language.vocabularyGrade],
    ['worked_example_dependence', 1, (s) => s.practice.workedToPractice], ['scaffolding_fade', -1, (s) => s.scaffolding.level], ['interleaving_tolerance', 1, (s) => s.review.interleaving],
    ['decay_rate', -1, (s) => s.review.spacingScale], ['challenge_appetite', 1, (s) => s.difficulty.stretchShare], ['evaluation_anxiety', 1, (s) => (s.feedback.lowStakes ? 1 : 0)],
    ['feedback_granularity', 1, (s) => ['brief', 'standard', 'detailed'].indexOf(s.feedback.granularity)], ['productive_struggle', -1, (s) => s.scaffolding.hintLevel],
  ];
  const nonMono = [];
  for (const [id, dir, f] of heads) {
    let prev = null;
    for (const score of [0, 20, 40, 50, 60, 80, 100]) {
      const v = f(ls.buildSpecFrom(withMetric(id, score, 95, { age: 14 })));
      if (prev !== null && (v - prev) * dir < -1e-9) nonMono.push(`${id}@${score}`);
      prev = v;
    }
  }
  check('headline fields are monotonic across the whole score range', nonMono.length === 0, nonMono.join(', '));
}

console.log('7. deterministic and fast');
{
  const rand = rng(5);
  const metrics = {};
  for (const s of STATS) metrics[s.id] = { measured: Math.round(rand() * 100), confidence: 20 + Math.round(rand() * 80) };
  const inp = { metrics, age: 12, interests: ['cars', 'art'], dislikes: ['math'], topic: 'two-step equations', trackId: 'math', goal: 'test', mastery: 0.3, attempts: 4 };
  const a = JSON.stringify(ls.buildSpecFrom(inp));
  const b = JSON.stringify(ls.buildSpecFrom(JSON.parse(JSON.stringify(inp))));
  check('the same input is the same spec, byte for byte', a === b);
  check('and the same prompt', ls.specToPrompt(JSON.parse(a)) === ls.specToPrompt(JSON.parse(b)));
  for (let i = 0; i < 200; i++) ls.buildSpecFrom(inp);
  const times = [];
  for (let i = 0; i < 1000; i++) {
    const t = process.hrtime.bigint();
    ls.buildSpecFrom(inp);
    ls.specToPrompt(ls.buildSpecFrom(inp));
    times.push(Number(process.hrtime.bigint() - t) / 1e6 / 2);
  }
  times.sort((x, y) => x - y);
  console.log(`       median ${times[500].toFixed(3)} ms, p99 ${times[989].toFixed(3)} ms, max ${times[999].toFixed(3)} ms`);
  check('a spec takes under 20 ms (p99 of 1,000 builds)', times[989] < 20);
}

console.log('8. the prompt');
{
  check('the default spec writes no prompt', ls.specToPrompt(ls.buildSpecFrom(input())) === '');
  const inp = input({ age: 9, interests: ['minecraft'], dislikes: ['spiders'], topic: 'photosynthesis' });
  inp.metrics.brevity_preference = { measured: 90, confidence: 90 };
  inp.metrics.evaluation_anxiety = { measured: 90, confidence: 90 };
  const spec = ls.buildSpecFrom(inp);
  const lesson = ls.specToPrompt(spec, { surface: 'lesson' });
  const material = ls.specToPrompt(spec, { surface: 'material' });
  const test = ls.specToPrompt(spec, { surface: 'test' });
  const tutor = ls.specToPrompt(spec, { surface: 'tutor' });
  check('the lesson block carries the content contract, the shape and the interests', /Content contract/.test(lesson) && /Shape:/.test(lesson) && /minecraft/.test(lesson));
  check('a material block never offers interest examples (the learner\'s own text is the only source)', !/draw them from/.test(material) && /Use only what the material says/.test(material));
  check('a test block carries stakes but no teaching shape', /low stakes/.test(test) && !/Shape:/.test(test));
  check('the tutor block has no lesson-length rules', !/Shape:/.test(tutor) && !/Keep the whole lesson short/.test(tutor));
  check('every block ends by forbidding the profile from showing through', [lesson, material, test, tutor].every((p) => /Never mention this profile/.test(p)));
  check('no block carries a learner score or confidence', ![lesson, material, test, tutor].some((p) => /\b(score|confidence|percentile)\b\D{0,12}\d/.test(p)));
  check('specHash is stable and "default" for the default spec', ls.specHash(spec) === ls.specHash(JSON.parse(JSON.stringify(spec))) && ls.specHash(ls.buildSpecFrom(input())) === 'default');
}

console.log('9. checking a draft against the spec');
{
  const inp = input({ age: 9, interests: ['minecraft'], dislikes: ['spiders'], topic: 'photosynthesis' });
  inp.metrics.interest_transfer = { measured: 95, confidence: 95 };
  inp.metrics.vocabulary_ceiling = { measured: 5, confidence: 95 };
  const spec = ls.buildSpecFrom(inp);
  const keyFacts = ['Plants make glucose from carbon dioxide and water using light energy', 'Chlorophyll in chloroplasts absorbs light', 'Oxygen is released as a by-product'];
  const good = 'Plants are like a farm in Minecraft. They make glucose from carbon dioxide and water. They use light energy to do it. Chlorophyll in the chloroplasts absorbs the light. Oxygen is released as a by-product. This is how a plant eats. In Minecraft a wheat crop needs light too. The leaf takes in air. The root takes in water. A Minecraft farm gets its energy from the sun.';
  check('a draft that follows the spec and keeps the facts passes', ls.checkFollowed(good, spec, { keyFacts }).ok, JSON.stringify(ls.checkFollowed(good, spec, { keyFacts }).problems));
  const spider = `${good} A spider also lives under the leaf.`;
  check('a disliked domain is caught', ls.checkFollowed(spider, spec, { keyFacts }).problems.some((p) => p.id === 'avoid_domain'));
  const noInterest = good.split('Minecraft').join('a garden');
  check('interests that are unused are caught', ls.checkFollowed(noInterest, spec, { keyFacts }).problems.some((p) => p.id === 'interest_unused'));
  const dropped = 'Plants are like a farm in Minecraft. They make glucose from carbon dioxide and water. This is how a plant eats. It is a small trade. The leaf takes in air. The root takes in water.';
  check('a dropped key fact is caught', ls.checkFollowed(dropped, spec, { keyFacts }).problems.some((p) => p.id === 'coverage'));
  const long = `${'Photosynthesis is the biochemical process whereby autotrophic organisms transform electromagnetic radiation into chemical potential energy stored within carbohydrate molecules, which subsequently sustain metabolic requirements throughout the entire organism and its surrounding ecological community in Minecraft. '.repeat(3)}`;
  check('long sentences are caught', ls.checkFollowed(long, spec, { keyFacts: [] }).problems.some((p) => p.id === 'sentence_length'));
  check('advanced words are caught', ls.checkFollowed(long, spec, { keyFacts: [] }).problems.some((p) => p.id === 'vocabulary'));
  check('the profile showing through is caught', ls.checkFollowed(`${good} Because you are slow at this, we go step by step.`, spec, { keyFacts }).problems.some((p) => p.id === 'profile_leak'));
  check('with the default spec only coverage and leaks are checked', ls.checkFollowed(long, ls.buildSpecFrom(input()), { keyFacts: [] }).ok);

  // Weakness classes the live proof found (docs/SCORECARD-PROOF.md): the shape, hints, quick checks, mistakes and format dislikes.
  {
    const kid = ls.buildSpecFrom(withMetric('chunk_granularity', 5, 95, { age: 8, interests: ['minecraft'] }));
    const section = (n) => ({ sentences: n, text: 'x '.repeat(n) });
    const shape = (secs, extra = {}) => ls.checkFollowed(good, kid, { structure: { sections: secs.map(section), mistakes: 1, checks: ['Q1 Hint: think.', 'Q2 Hint: look.'], ...extra } });
    check('sections far longer than the spec are caught, and the note says to split them and drop nothing', shape([7, 6, 6]).problems.some((p) => p.id === 'chunk_size' && /drop nothing/.test(p.detail)));
    check('sections near the spec pass', !shape([2, 2, 3]).problems.some((p) => p.id === 'chunk_size'));
    check('more common mistakes than the spec allows are caught', ls.checkFollowed(good, kid, { structure: { sections: [section(2), section(2)], mistakes: 4, checks: [] } }).problems.some((p) => p.id === 'mistakes_count'));
    const hinted = ls.buildSpecFrom(withMetric('scaffolding_fade', 5, 95, { age: 12 }));
    check('a learner who needs support gets a hint in each check question, and a draft with none is caught', hinted.scaffolding.hintInChecks && ls.checkFollowed(good, hinted, { structure: { sections: [section(2), section(2)], mistakes: 1, checks: ['What is it?', 'Why?', 'How?'] } }).problems.some((p) => p.id === 'hints_missing'));
    check('and one with hints passes', !ls.checkFollowed(good, hinted, { structure: { sections: [section(2), section(2)], mistakes: 1, checks: ['What is it? Hint: think of light.', 'Why? Hint: look at the leaf.'] } }).problems.some((p) => p.id === 'hints_missing'));
    const quick = ls.buildSpecFrom(withMetric('cycle_architecture', 4, 95));
    const qs = (texts) => ls.checkFollowed(good, quick, { structure: { sections: texts.map((t) => ({ sentences: 2, text: t })), mistakes: 1, checks: [] } });
    check('a learner who needs a check after every piece: a section with no "Quick check" is caught', quick.lesson.quickCheckEverySection && qs(['a b', 'c d', 'e f']).problems.some((p) => p.id === 'quick_checks') && !qs(['a Quick check: q? Answer: a', 'c Quick check: q? Answer: a', 'e Quick check: q? Answer: a']).problems.some((p) => p.id === 'quick_checks'));
    check('the lesson spec asks for fewer common mistakes when it asks for a short lesson, and says so', ls.buildSpecFrom(withMetric('brevity_preference', 95, 95)).lesson.mistakes === 1 && /at most 1 common mistake/.test(ls.specToPrompt(ls.buildSpecFrom(withMetric('brevity_preference', 95, 95)))));
    const longish = Array.from({ length: 12 }, () => 'The little dog ran to the big green gate.').join(' ');
    check('sentences a word or two over the cap are not flagged for a young learner (only a text well over it)', !ls.checkFollowed(longish, kid, {}).problems.some((p) => p.id === 'sentence_length'));
    const rambling = Array.from({ length: 6 }, () => 'Because the leaf holds many tiny green parts which each catch the light from the sun above the field, the plant can slowly make its own sugar all day long.').join(' ');
    check('but a text of sentences twice the cap still is', ls.checkFollowed(rambling, kid, {}).problems.some((p) => p.id === 'sentence_length'));
    // A dislike of a FORMAT is never an example domain to avoid: it changes the delivery.
    const fmt = ls.buildSpecFrom(input({ dislikes: ['long reading', 'being timed', 'when lessons repeat things', 'spiders'], topic: 'photosynthesis' }));
    check('disliked formats (long reading, timers, repetition) are not "avoided domains"; spiders still is', JSON.stringify(fmt.interests.avoidDomains) === JSON.stringify(['spiders']), fmt.interests.avoidDomains);
    check('they become aversions that change the delivery, with a sentence each', fmt.aversions.includes('reading') && fmt.aversions.includes('tests') && fmt.aversions.includes('repetition') && fmt.aversionNotes.length === 3 && fmt.feedback.lowStakes && fmt.explain.textDensity === 'sparse');
    check('a disliked subject other than the topic is still avoided in examples, and the aversion note is only for the subject taught', ls.buildSpecFrom(input({ dislikes: ['math'], topic: 'photosynthesis' })).interests.avoidDomains.includes('math') && ls.buildSpecFrom(input({ dislikes: ['math'], topic: 'photosynthesis' })).aversionNotes.length === 0 && ls.buildSpecFrom(input({ dislikes: ['math'], topic: 'two-step equations' })).aversionNotes.length === 1);
    const tryer = ls.buildSpecFrom(withMetric('worked_example_dependence', 5, 95));
    check('a learner who learns by doing is asked for "Try it" lines inside the lesson (never more than three), and a lesson with fewer is caught', tryer.practice.tryItems >= 2 && tryer.practice.tryItems <= 3 && /Try it: <question> Answer: <answer>/.test(ls.specToPrompt(tryer)) && ls.checkFollowed(good, tryer, { structure: { sections: [{ sentences: 2, text: 'a Try it: q? Answer: a' }, { sentences: 2, text: 'b' }] } }).problems.some((p) => p.id === 'try_its_missing') && !ls.checkFollowed(good, tryer, { structure: { sections: [{ sentences: 2, text: 'a Try it: q? Answer: a' }, { sentences: 2, text: 'b Try it: q? Answer: b. Try it: z? Answer: c' }] } }).problems.some((p) => p.id === 'try_its_missing'), tryer.practice.tryItems);
    const shortSpec = ls.buildSpecFrom(withMetric('attention_runway', 4, 95, { age: 9 }));
    const budget = shortSpec.lesson.wordBudget;
    check('the spec states the words a learner has time for, and a lesson far over it is caught (never at the cost of a key point)', budget >= 200 && budget < 700 && ls.checkFollowed(good, shortSpec, { structure: { words: Math.round(budget * 1.7), sections: [{ sentences: 2, text: 'x' }] } }).problems.some((p) => p.id === 'too_long' && /not any key point/.test(p.detail)) && !ls.checkFollowed(good, shortSpec, { structure: { words: budget, sections: [{ sentences: 2, text: 'x' }] } }).problems.some((p) => p.id === 'too_long'), [budget, shortSpec.lesson.minutes]);
    check('a longer attention gives a bigger budget, a phone a smaller one', ls.buildSpecFrom(withMetric('attention_runway', 96, 95, { age: 30 })).lesson.wordBudget > ls.buildSpecFrom(withMetric('attention_runway', 4, 95, { age: 30 })).lesson.wordBudget && ls.buildSpecFrom(input({ age: 30, device: 'phone' })).lesson.wordBudget < ls.buildSpecFrom(input({ age: 30 })).lesson.wordBudget);
    const curious = ls.buildSpecFrom(withMetric('curiosity_hook', 95, 95));
    check('a learner a question opener engages gets one asked for, and an intro without a question is caught', curious.lesson.hook === 'question' && ls.checkFollowed(good, curious, { structure: { intro: 'This lesson is about plants.', sections: [{ sentences: 2, text: 'x' }] } }).problems.some((p) => p.id === 'hook_missing') && !ls.checkFollowed(good, curious, { structure: { intro: 'What does a leaf eat?', sections: [{ sentences: 2, text: 'x' }] } }).problems.some((p) => p.id === 'hook_missing'));
    const everyOther = ls.buildSpecFrom(withMetric('cycle_architecture', 36, 95));
    check('a mild need for checks gets a quick check at every second section, and the check follows the cadence', everyOther.lesson.quickCheckEvery === 2 && /every second section/.test(ls.specToPrompt(everyOther)) && !ls.checkFollowed(good, everyOther, { structure: { sections: ['a', 'b Quick check: q? Answer: a', 'c', 'd Quick check: q? Answer: b'].map((t) => ({ sentences: 2, text: t })) } }).problems.some((p) => p.id === 'quick_checks'));
    const heavy = ls.buildSpecFrom(withMetric('interest_transfer', 95, 95, { interests: ['cars', 'engines'] }));
    check('a strong interest share names how often the interests are used, and a single passing mention is caught', /every other example on cars, engines, at least three in all/.test(ls.specToPrompt(heavy)) && ls.checkFollowed('Cars are fast. A lesson about plants and light and water and sugar and air. The sun is bright.', heavy, {}).problems.some((p) => p.id === 'interest_unused'));
    check('the worked-to-practice ratio becomes counts the page can show, and the check order follows the difficulty start and ramp', /worked example/.test(ls.specToPrompt(ls.buildSpecFrom(withMetric('worked_example_dependence', 95, 95)))) && ls.buildSpecFrom(withMetric('worked_example_dependence', 95, 95)).practice.tryItems <= ls.buildSpecFrom(withMetric('worked_example_dependence', 5, 95)).practice.tryItems + 0 && /clearly easier/.test(ls.specToPrompt(ls.buildSpecFrom(withMetric('prior_knowledge', 2, 99)))));
    check('more sentence kinds are read as dislikes', ls.dislikesFromText('I never liked math. I am scared of spiders. I dread tests.').length === 3);
  }
  let calls = 0;
  const run = (drafts) => ls.reviseOnce({ generate: async () => drafts[Math.min(calls++, drafts.length - 1)], textOf: (x) => x, spec, keyFacts });
  (async () => {
    calls = 0;
    const r1 = await run([good]);
    check('a good draft is kept with one call', r1.result === good && calls === 1 && !r1.revised);
    calls = 0;
    const r2 = await run([spider, good]);
    check('a bad draft is revised once, with the problem named', r2.result === good && calls === 2 && r2.revised);
    calls = 0;
    const notes = [];
    await ls.reviseOnce({ generate: async (note) => { notes.push(note); return notes.length === 1 ? spider : good; }, textOf: (x) => x, spec, keyFacts });
    check('the revision note names the avoided domain and says to keep every fact', /spider/.test(notes[1]) && /keeping every fact/.test(notes[1]));
    calls = 0;
    const r3 = await run([spider, dropped]);
    check('a revision that loses a key fact is thrown away', r3.result === spider && !r3.revised);
    calls = 0;
    const r4 = await run([spider, spider, spider]);
    check('it never asks a third time', calls === 2);
    calls = 0;
    const r5 = await ls.reviseOnce({ generate: async () => null, textOf: (x) => x, spec, keyFacts });
    check('no draft is no draft', r5.result === null);
    void r4;

    await records();
    finish();
  })();
}

async function records() {
  console.log('10. the app\'s own records');
  const db = require('../config/db');
  const learner = require('../services/learner');
  const scorecard = require('../services/scorecard');
  const now = new Date();
  const birth = `${now.getUTCFullYear() - 10}-01`;
  const kid = db.insert('users', { email: 'kid@example.test', name: 'Kid', age_check: { birth_ym: birth } });
  const adult = db.insert('users', { email: 'adult@example.test', name: 'Adult' });
  const blankUser = db.insert('users', { email: 'blank@example.test', name: 'Blank' });
  learner.saveProfile(kid.id, { survey: { ...learner.cleanSurvey({ interests: 'minecraft, drawing', hobbies: 'soccer', notes: 'I hate long reading. English is not my first language.' }) } });
  db.insert('learner_records', { user_id: kid.id, facts: [{ id: 'f1', kind: 'dislike', topic: '', text: 'spiders', status: 'tentative', support: 1 }, { id: 'f2', kind: 'interest', topic: '', text: 'cars', status: 'solid', support: 3 }], recommendations: [], suggestions: {}, big: {}, conclusions: [], next_id: 3 });
  const card = scorecard.get(kid.id);
  for (const id of ['brevity_preference', 'attention_runway']) {
    card.stats[id] = { ...card.stats[id], s: id === 'brevity_preference' ? 90 : 10, m: id === 'brevity_preference' ? 90 : 10, w: 8, mw: 8, n: 30, evv: 30, evx: 30, evk: 'value' };
  }
  db.update('scorecards', card.id, { stats: card.stats });
  const spec = ls.buildSpec(kid.id, { topic: 'photosynthesis', trackId: 'science' });
  check('reads the learner\'s age from the age screen', spec.learner.ageBand === '9-11');
  check('reads interests from the survey, hobbies and the record', ['minecraft', 'drawing', 'soccer', 'cars'].every((d) => spec.interests.exampleDomains.includes(d) || ls.mentions(spec.interests.exampleDomains.join(' '), d)), JSON.stringify(spec.interests));
  check('reads dislikes from the record and the survey notes', spec.interests.avoidDomains.includes('spiders') && spec.aversions.includes('reading'), JSON.stringify(spec.interests.avoidDomains));
  check('reads English-as-a-second-language from what they wrote', spec.learner.esl === true);
  check('reads the scorecard: a measured short-lesson, short-focus learner gets a short lesson and session', spec.lesson.minutes <= 6 && spec.levers.length < -0.1 && spec.levers.sessionLen < -0.1, `${spec.lesson.minutes} ${spec.levers.length}`);
  check('the spec is not the default', !spec.isDefault && ls.specToPrompt(spec).length > 100);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) ls.buildSpec(kid.id, { topic: 'photosynthesis', trackId: 'science' });
  const per = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  console.log(`       buildSpec from the database: ${per.toFixed(2)} ms`);
  check('and reading the database too stays under 20 ms', per < 20);
  const adultSpec = ls.buildSpec(adult.id, { topic: 'photosynthesis' });
  check('an adult with nothing on record gets the default spec and an empty prompt', adultSpec.isDefault && ls.specToPrompt(adultSpec) === '');
  check('a learner with no scorecard row is not given one by asking', !db.findOne('scorecards', (r) => r.user_id === blankUser.id) && ls.buildSpec(blankUser.id, {}).isDefault && !db.findOne('scorecards', (r) => r.user_id === blankUser.id));
  const ownerEmail = require('../config/owner').ownerEmail();
  const owner = db.insert('users', { email: ownerEmail, name: 'Owner' });
  learner.saveProfile(owner.id, { survey: learner.cleanSurvey({ interests: 'chess' }) });
  const ownerSpec = ls.buildSpec(owner.id, {});
  check('the owner gets the base product: the default spec', ownerSpec.isDefault && ls.specToPrompt(ownerSpec) === '' && ownerSpec.ownerBase === true);
  check('buildSpec never throws, even for a missing learner', ls.buildSpec(999999, {}).isDefault && ls.buildSpec(null, {}).isDefault && ls.buildSpec(undefined, { skillIds: 5 }).isDefault);
  const mastered = ls.buildSpec(kid.id, { skillIds: ['__no_such_skill__'] });
  check('an unknown skill id reads as no mastery information', mastered && mastered.practice.workedToPractice > 0);
}

function finish() {
  if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nlearning-spec-test: all checks passed');
}
