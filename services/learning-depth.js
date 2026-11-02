/**
 * The full depth of the learning spec (services/learning-spec.js): every scorecard measure with its value and confidence,
 * read jointly and graded, plus what the learner has told or shown us about themselves, compiled into ONE ranked,
 * concrete instruction set a writer can follow. learning-spec.js computes the levers; this file reads them in full.
 *
 *   const depth = require('./learning-depth');
 *   depth.measuresOf(input.metrics, METRIC_RULES)   // all 100 rows: value, confidence, effective value, band, levers
 *   depth.jointOf(levers)                            // the conflict rules that fire, each with its settled instruction
 *   depth.learningOf(levers, spec, ctx)              // the research-backed learning methods, each tied to its measures
 *   depth.compile(spec, surface, phrases)            // the ranked instruction lines for one surface (no numbers about the learner)
 *
 * How the measures are read (the rules, stated):
 *
 *   1. Shrinkage. A measure's effective value is 50 + (measured - 50) * confidence / 100: a measure the app is unsure of is pulled
 *      toward the default in exact proportion to its uncertainty (confidence 0 moves nothing, confidence 100 moves it all the way).
 *      learning-spec.js uses the same product, z * c, in every lever sum, so the table here and the levers can never disagree.
 *   2. Joint, not one at a time. Every measure that touches a lever adds to that lever's one sum (weighted by its rule and its
 *      confidence), so two measures that pull one way of teaching in opposite directions are settled by the size of their pulls,
 *      never by which was read first. There is one lean per lever, not one answer per measure.
 *   3. Graded. A lean's size sets the strength of its instruction: under 0.15 nothing is said (a 55 is almost the default);
 *      0.15 to 0.35 is a light touch ("where it fits"); 0.35 to 0.6 is a plain instruction; 0.6 and over is applied throughout.
 *      So a 95 is not written like a 55, and a 55 is not written at all.
 *   4. Conflicts between levers (two needs that act on the same page in different ways) are settled by JOINT_RULES below, by
 *      three principles, in this order:
 *        a. the content contract first: no rule ever drops a point, a fact or an objective;
 *        b. access before preference: what lets the learner take it in at all (reading level, working memory, attention,
 *           anxiety) is kept whole, and what they would enjoy (challenge, novelty, pace, game framing) is fitted around it;
 *        c. compose rather than average: when the two needs act on different parts of the page, each gets its part (support on
 *           the core, the stretch optional at the end), so neither is diluted to a half-measure.
 *   5. Everything ranked. Inside each strength, an instruction is ranked by the size of its lean times how much its lever shapes
 *      the page (LEVERS imp in learning-spec.js). Nothing that clears the 0.15 bar is dropped: the strongest are numbered and
 *      the light touches are grouped on one line, so the block stays short enough to be followed.
 *   6. No learner number reaches a model. The block holds instructions and limits on the page, never a score, a confidence or a
 *      label for the learner.
 *
 * The learner's own context (interests, hobbies, dislikes, past difficulties, strengths) is gathered by learning-spec.js gather():
 * the survey (interests, hobbies, sports, studying, notes), the tutor's facts (services/tutor-facts.js: interest, hard,
 * misconception, worked, goal), the after-level record (services/learner-record.js: strength, struggle, preference, interest,
 * dislike), and the scorecard's own confident extremes on the capability measures (CAPABILITIES below). Text the learner wrote is
 * cleaned and clipped and framed as data, never as instructions.
 *
 * Every function here is pure (no I/O) and never throws on missing input.
 */
const { STATS, BY_ID } = require('./scorecard/stats');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, n = 2) => Number(Number(v).toFixed(n));

// ── graded strength of a lean ───────────────────────────────────────────────
const SHOW = 0.15;
const CLEAR = 0.35;
const STRONG = 0.6;
/** 'none' | 'light' | 'clear' | 'strong', from a lean's size. */
function strengthOf(lean) {
  const a = Math.abs(Number(lean) || 0);
  if (a >= STRONG) return 'strong';
  if (a >= CLEAR) return 'clear';
  if (a >= SHOW) return 'light';
  return 'none';
}

// ── the measures, every one ─────────────────────────────────────────────────
/** The band an effective value falls in. */
function bandOf(eff) {
  if (eff <= 20) return 'very low';
  if (eff <= 38) return 'low';
  if (eff < 62) return 'typical';
  if (eff < 80) return 'high';
  return 'very high';
}

/**
 * Every one of the 100 measures: { id, name, group, impact, measured, confidence, effective, z, band, side, levers }.
 * `metrics` is { id: { measured, confidence } } (missing = 50 at confidence 0). `rules` is learning-spec's METRIC_RULES.
 * `side` is the stat's own words for where the learner sits (null in the typical band); `levers` the levers it moves with the
 * pull it adds to each (direction * weight * z * c, the same product learning-spec sums).
 */
function measuresOf(metrics = {}, rules = []) {
  const ruleOf = new Map((rules || []).map((r) => [r.metric, r]));
  return STATS.map((s) => {
    const m = (metrics || {})[s.id] || {};
    const measured = Number.isFinite(Number(m.measured)) && m.measured !== null && m.measured !== undefined ? Number(m.measured) : 50;
    const confidence = clamp(Number(m.confidence) || 0, 0, 100);
    const c = confidence / 100;
    const z = clamp((measured - 50) / 50, -1, 1);
    const effective = round(50 + (measured - 50) * c, 1);
    const band = bandOf(effective);
    const rule = ruleOf.get(s.id);
    const levers = rule ? rule.effects.map((e) => ({ lever: e.lever, pull: round(e.dir * e.w * z * c, 3) })).filter((e) => e.pull) : [];
    return {
      id: s.id, name: s.name, group: s.category, impact: s.impact, measured, confidence, effective, z: round(z * c, 3), band,
      side: band === 'typical' ? null : (effective < 50 ? s.low : s.high), levers,
    };
  });
}

// ── capabilities: which measures name a strength on one side and a difficulty on the other ──────────────────────────────
/**
 * [measure, +1 if high is the strength / -1 if low is the strength]. Only measures where one side is plainly easier to learn
 * with; preference measures (formality, humour, story) are neither. A measure counts when its EFFECTIVE value is in the
 * 'very high' or 'very low' band (strong and confident), so a guess never becomes a strength or a difficulty.
 */
const CAPABILITIES = [
  ['intake_baseline', 1], ['working_memory_span', 1], ['processing_velocity', 1], ['vocabulary_ceiling', 1], ['jargon_absorption', 1],
  ['abstraction_tolerance', 1], ['text_density_tolerance', 1], ['logical_rigor', 1], ['pattern_detection', 1], ['causal_chain_depth', 1],
  ['systems_thinking', 1], ['analogical_transfer', 1], ['cognitive_flexibility', 1], ['attention_runway', 1], ['retrieval_strength', 1],
  ['retention_index', 1], ['decay_rate', -1], ['interference_susceptibility', -1], ['frustration_threshold', 1], ['error_recovery_speed', 1],
  ['self_efficacy', 1], ['self_monitoring', 1], ['strategy_awareness', 1], ['persistence', 1], ['near_transfer', 1], ['far_transfer', 1],
  ['prior_knowledge', 1], ['mastery_velocity', 1], ['notation_comfort', 1], ['open_response_performance', 1], ['evaluation_anxiety', -1],
  ['misconception_persistence', -1], ['rush_tendency', -1], ['guessing_propensity', -1], ['boredom_susceptibility', -1], ['hint_dependency', -1],
  ['perfectionism', -1], ['confidence_calibration', 1], ['spatial_anchoring', 1],
];

// The stat's own words where they read well as a strength or a difficulty; these few are reworded so a prompt never carries words
// about measurement ("confidence") or a quoted label.
const CAP_TEXT = {
  confidence_calibration: ['often unsure whether their own answer is right', 'knows well when their answer is right'],
  self_efficacy: ['doubts they can do this kind of thing', 'believes they can learn this'],
  evaluation_anxiety: ['steady when answers are checked', 'gets nervous when it feels like a test'],
  mastery_velocity: ['improves slowly from one lesson to the next', 'improves fast from one lesson to the next'],
};

/** The measure-derived strengths and difficulties: { strengths: [text], difficulties: [text] }, strongest first, three each. */
function capabilitiesOf(measures) {
  const by = new Map((measures || []).map((m) => [m.id, m]));
  const strengths = []; const difficulties = [];
  for (const [id, pol] of CAPABILITIES) {
    const m = by.get(id);
    if (!m || (m.band !== 'very high' && m.band !== 'very low')) continue;
    const high = m.effective >= 50;
    const good = pol > 0 ? high : !high;
    const s = BY_ID[id];
    const text = CAP_TEXT[id] ? CAP_TEXT[id][high ? 1 : 0] : (high ? s.high : s.low);
    (good ? strengths : difficulties).push({ id, text, size: Math.abs(m.effective - 50) });
  }
  const top = (xs) => xs.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id)).slice(0, 3);
  return { strengths: top(strengths), difficulties: top(difficulties) };
}

// ── what the learner said, cleaned ──────────────────────────────────────────
/** A learner-written phrase made safe for a prompt: one line, plain characters, no quotes or instructions-looking punctuation, clipped. */
function cleanSaid(text, max = 90) {
  const t = String(text || '').replace(/[\r\n\t]+/g, ' ').replace(/["`<>{}[\]\\|]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}...` : t;
}
// A sentence of theirs that says something is hard for them, or that they are good at something (first person, or "for me").
const DIFFICULTY_RE = /\b(hard|difficult|tricky|confus(?:ing|ed|es)|struggl(?:e|es|ed|ing)|never (?:understood|got|get)|trouble with|get lost|got lost|lose track|mix(?:es)? up|blank out)\b/i;
const STRENGTH_RE = /\b((?:good|great|strong|quick|fast) at|i do well (?:in|with|at)|i(?:'m| am) confident (?:in|with|at)|(?:comes )?easy for me|i(?:'m| am) a fast learner)\b/i;
const FIRST_PERSON = /\b(i|i'm|i am|me|my|for me)\b/i;
const DISLIKE_ONLY = /\b(hate|dislike|can'?t stand|bored)\b/i;
/** Past difficulties and strengths read from what the learner wrote in the survey's notes: their own sentences, cleaned. */
function saidOf(text) {
  const out = { difficulties: [], strengths: [] };
  const sents = String(text || '').split(/(?<=[.!?\n])\s*/).map((x) => x.trim()).filter(Boolean);
  for (const s of sents) {
    if (!FIRST_PERSON.test(s)) continue;
    if (DISLIKE_ONLY.test(s) && !DIFFICULTY_RE.test(s)) continue; // a dislike, read elsewhere
    const clean = cleanSaid(s.replace(/[.!?]+$/, ''), 90);
    if (clean.split(' ').length < 3) continue;
    if (STRENGTH_RE.test(s) && !DIFFICULTY_RE.test(s)) out.strengths.push(clean);
    else if (DIFFICULTY_RE.test(s)) out.difficulties.push(clean);
  }
  return out;
}

/** De-duplicated (case and word overlap), cleaned, clipped list. */
function tidy(list, max) {
  const out = [];
  const key = (x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length >= 4).sort().join(' ');
  for (const raw of list || []) {
    const x = cleanSaid(raw);
    if (!x) continue;
    const k = key(x);
    if (out.some((y) => key(y) === k || (k && key(y).includes(k)) || (key(y) && k.includes(key(y))))) continue;
    out.push(x);
  }
  return out.slice(0, max);
}

/**
 * The learner's own context, gathered (learning-spec gather fills input.profileFacts): { difficulties, strengths, worked, goals,
 * studying } from what they said and what the app has recorded, plus the measure-derived capabilities. Every list is short.
 */
function factsOf(input = {}, measures = []) {
  const pf = input.profileFacts || {};
  const caps = capabilitiesOf(measures);
  return {
    difficulties: tidy(pf.difficulties || [], 4),
    strengths: tidy(pf.strengths || [], 3),
    worked: tidy(pf.worked || [], 2),
    goals: tidy(pf.goals || [], 2),
    studying: cleanSaid(pf.studying || '', 80) || null,
    measuredStrengths: caps.strengths.map((x) => x.text),
    measuredDifficulties: caps.difficulties.map((x) => x.text),
    measuredIds: { strengths: caps.strengths.map((x) => x.id), difficulties: caps.difficulties.map((x) => x.id) },
  };
}

// ── conflicts between levers, and how each is settled ───────────────────────
/**
 * Each: id, the principle it applies (access, compose), when it fires (on the leans), the instruction that settles it, and the
 * levers it reads. Several can fire; at most MAX_JOINT go in a block, the ones with the largest leans first.
 */
const J = (id, principle, levers, when, line) => ({ id, principle, levers, when, line });
const JOINT_RULES = [
  J('brisk_but_small', 'access', ['pace', 'chunk'], (L) => L.pace >= 0.3 && L.chunk <= -0.3,
    'Brisk and small at once: many short pieces, each said once, with no padding or restating between them; the pieces stay small even though the pace is quick.'),
  J('support_core_stretch_last', 'compose', ['scaffold', 'challenge'], (L) => L.scaffold >= 0.3 && L.challenge >= 0.3,
    'Support and stretch together: full support on the core items, then one unsupported harder case at the very end, clearly optional.'),
  J('stretch_without_stakes', 'access', ['challenge', 'pressure', 'gentleness'], (L) => L.challenge >= 0.3 && (L.pressure <= -0.3 || L.gentleness >= 0.4),
    'Stretch without stakes: offer the harder case as an optional puzzle, never as a test, with no penalty for missing it.'),
  J('short_but_retrieval_stays', 'compose', ['length', 'checks', 'checkFreq', 'recapEnd'], (L) => L.length <= -0.3 && (L.checks >= 0.3 || L.checkFreq >= 0.3 || L.recapEnd >= 0.3),
    'Short, but the retrieval stays: cut explanation, asides and extra examples first; keep every check question and the closing recall.'),
  J('worked_and_generative', 'compose', ['worked', 'generation'], (L) => L.worked >= 0.3 && L.generation >= 0.3,
    'Worked and generative together: show the worked example step by step, but ask them to predict each step before it is shown.'),
  J('expert_but_structured', 'compose', ['worked', 'structure'], (L) => L.worked <= -0.3 && L.structure >= 0.3,
    'Little worked support but clear structure: skip the long worked example, and keep numbered steps for the part that is new.'),
  J('novel_but_predictable', 'access', ['novelty', 'structure'], (L) => L.novelty >= 0.3 && L.structure >= 0.3,
    'Variety inside a fixed frame: vary the contexts and examples, but keep the layout and the step format the same every time.'),
  J('brisk_but_restated', 'access', ['pace', 'repetition'], (L) => L.pace >= 0.3 && L.repetition >= 0.3,
    'Brisk but restated: say each idea once, and restate only the single key point once, at the end.'),
  J('full_in_short_sittings', 'access', ['length', 'sessionLen'], (L) => L.length >= 0.3 && L.sessionLen <= -0.3,
    'A full treatment in short sittings: mark a clear stopping point between parts so it can be done in pieces.'),
  J('game_without_pressure', 'access', ['gamification', 'pressure'], (L) => L.gamification >= 0.3 && L.pressure <= -0.3,
    'Game framing without pressure: points or levels for trying, no timers, no losing.'),
  J('humour_in_formal', 'compose', ['humor', 'formality'], (L) => L.humor >= 0.3 && L.formality >= 0.3,
    'Light humour inside a formal register: dry and brief, never slangy.'),
  J('deep_but_short', 'compose', ['depth', 'length'], (L) => L.depth >= 0.3 && L.length <= -0.3,
    'Deep but short: go deep on the one central point and keep the other points brief (each still covered).'),
  J('choice_inside_structure', 'compose', ['autonomy', 'structure'], (L) => L.autonomy >= 0.3 && L.structure >= 0.3,
    'Choice inside structure: a fixed numbered route, with one point where they choose which example or task to do.'),
  J('detail_only_on_misses', 'compose', ['feedbackDetail', 'length'], (L) => L.feedbackDetail >= 0.3 && L.length <= -0.3,
    'Detail only where it is needed: a step-by-step explanation after a miss, one line after a right answer.'),
  J('misconception_gently', 'access', ['misconception', 'gentleness'], (L) => L.misconception >= 0.3 && L.gentleness >= 0.3,
    'Name the common wrong idea as one many people hold, never as their mistake.'),
  J('dense_but_plain', 'access', ['density', 'vocab'], (L) => L.density >= 0.3 && L.vocab <= -0.3,
    'Plain words in connected prose: full paragraphs are fine, but every word is an everyday one.'),
  J('precise_but_plain', 'access', ['rigor', 'vocab'], (L) => L.rigor >= 0.3 && L.vocab <= -0.3,
    'Precise but plain: exact statements in everyday words, each technical term defined where it appears.'),
  J('quick_dialogue', 'compose', ['dialogic', 'pace'], (L) => L.dialogic >= 0.3 && L.pace >= 0.3,
    'Question-and-answer that moves fast: one-line questions and one-line answers.'),
  J('big_picture_then_small', 'compose', ['bigPicture', 'chunk'], (L) => L.bigPicture >= 0.3 && L.chunk <= -0.3,
    'The big picture first, in two lines, then the details in small pieces.'),
  J('easy_win_first_stretch_last', 'compose', ['momentum', 'challenge'], (L) => L.momentum >= 0.3 && L.challenge >= 0.3,
    'An easy win first, the stretch last: the first item is one they will surely get, and the hardest comes at the end.'),
  J('abstract_but_concrete_access', 'access', ['ruleFirst', 'vocab', 'notation'], (L) => L.ruleFirst >= 0.3 && (L.vocab <= -0.4 || L.notation <= -0.4),
    'Rule first, in words: state the general rule first, but in plain words, and bring in a symbol only after a worked case.'),
  // Found by the joint profiles: a story frame swallowed the numbered steps a structure-needing learner also has.
  J('story_with_steps', 'access', ['story', 'structure'], (L) => L.story >= 0.3 && L.structure >= 0.3,
    'Story and steps together: tell it as a story, but inside the story number every step and say what comes next.'),
  J('story_with_support', 'access', ['story', 'scaffold', 'hintSize'], (L) => L.story >= 0.3 && (L.scaffold >= 0.3 || L.hintSize >= 0.4),
    'Story and support together: the story carries the idea, and every practice item inside it still gets its hint and partial steps.'),
  // Found by the joint profiles (material-weak): "predict each step" was written as a numbered list, which two judges read as the
  // numbered-steps learner's version; and a practice-first lesson for an anxious learner opened with a quick check.
  J('open_but_predicting', 'compose', ['structure', 'generation'], (L) => L.structure <= -0.3 && L.generation >= 0.3,
    'Open but predicting: put the prediction prompts as plain questions in the flow of the text, with no step numbers or labels, and leave one task without a set method.'),
  J('practice_first_but_gentle', 'access', ['worked', 'pressure', 'gentleness'], (L) => L.worked <= -0.3 && (L.pressure <= -0.3 || L.gentleness >= 0.4),
    'Practice first, but gently: the first item is one they will surely get, nothing opens with a quick check or a quiz, and the first lines say that nothing here is scored.'),
];
const MAX_JOINT = 4;

/** The joint rules that fire for these leans, strongest first: [{ id, principle, line, size }]. */
function jointOf(L = {}) {
  const lean = (k) => Number(L[k]) || 0;
  const Lx = new Proxy({}, { get: (_, k) => lean(k) });
  return JOINT_RULES.filter((r) => { try { return r.when(Lx); } catch { return false; } })
    .map((r) => ({ id: r.id, principle: r.principle, line: r.line, size: round(Math.min(...r.levers.map((l) => Math.abs(lean(l))).filter((x) => x >= 0.3).concat([1])), 3), levers: r.levers }))
    .sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
}

// ── the research-backed learning methods, each tied to the measures that modulate it ─────────────────────────────────────
/**
 * The levers that make learning stick and go faster, each set from the learner's leans (and so from the measures behind them):
 *
 *   retrieval    retrieval practice inside the material: how many recall questions, spread through it, recall not recognition
 *                (02/03 evidence: testing effect). Modulated by retrieval_strength, consolidation_need, generation_effect,
 *                recognition_recall_gap, enactive_encoding, cycle_architecture (through checks, checkFreq, typed, generation).
 *   fading       worked examples that fade for novices (full -> completion -> independent), and none for experts (the expertise
 *                reversal effect). Modulated by prior_knowledge, worked_example_dependence, scaffolding_fade, hint_dependency and the
 *                topic's mastery (through worked, scaffold, diffStart).
 *   order        concrete then abstract, or the reverse. Modulated by abstraction_tolerance, deductive/inductive_trajectory (ruleFirst).
 *   spacing      spacing and interleaving hooks: a question on an earlier idea, a look-alike mixed in, a line to recall tomorrow.
 *                Modulated by interleaving_tolerance, decay_rate, interference_susceptibility, integration_tendency, systems_thinking.
 *   gapOnly      what the learner already knows gets one line, the words go to what is new; every objective still appears.
 *                Modulated by prior_knowledge and the topic's mastery (diffStart, worked, length).
 *   dualCoding   the central idea also as a picture in text where the medium allows (the podcast: a picture described in words).
 *                Modulated by spatial_anchoring, cognitive_flexibility, text_density_tolerance (visual, multiRep).
 *   length       the word budget and minutes (lesson.wordBudget, lesson.minutes) from brevity_preference, attention_runway,
 *                processing_velocity, boredom_susceptibility, persistence (length, pace).
 */
const LEARNING_MEASURES = {
  retrieval: ['retrieval_strength', 'consolidation_need', 'generation_effect', 'recognition_recall_gap', 'enactive_encoding', 'cycle_architecture', 'rush_tendency'],
  fading: ['prior_knowledge', 'worked_example_dependence', 'scaffolding_fade', 'hint_dependency', 'step_explicitness', 'productive_struggle'],
  order: ['abstraction_tolerance', 'deductive_trajectory', 'inductive_trajectory'],
  spacing: ['interleaving_tolerance', 'decay_rate', 'interference_susceptibility', 'integration_tendency', 'systems_thinking', 'consolidation_need'],
  gapOnly: ['prior_knowledge', 'mastery_velocity'],
  dualCoding: ['spatial_anchoring', 'cognitive_flexibility', 'text_density_tolerance'],
  length: ['brevity_preference', 'attention_runway', 'processing_velocity', 'boredom_susceptibility', 'persistence'],
};

/** The methods' settings for one spec (its leans, derived fields and context). Pure. */
function learningOf(L = {}, spec = {}, ctx = {}, measures = []) {
  const lean = (k) => Number(L[k]) || 0;
  const eff = new Map((measures || []).map((m) => [m.id, m.effective]));
  const prior = eff.has('prior_knowledge') ? eff.get('prior_knowledge') : 50;
  const mastery = Number.isFinite(ctx.mastery) && (ctx.attempts || 0) >= 3 ? ctx.mastery : null;
  // Each method only where no lever sentence says the opposite (a method never contradicts the block it sits in).
  const novice = (lean('worked') >= 0.3 || prior <= 35 || (mastery !== null && mastery < 0.35)) && lean('worked') > -SHOW;
  // Knows the subject (a high prior or topic mastery) is not the same as learning from principles rather than worked cases (a low
  // worked_example_dependence says nothing about what they know): only the first is told they know the basics or given gap-only coverage.
  const knows = prior >= 70 || (mastery !== null && mastery >= 0.75 && (ctx.attempts || 0) >= 5);
  const expert = (lean('worked') <= -0.3 || knows) && lean('worked') < SHOW;
  const mixOk = lean('interleave') > -SHOW;
  const lesson = spec.lesson || {};
  return {
    retrieval: {
      questions: lesson.retrievalChecks || 3,
      spread: lean('checkFreq') > -SHOW,
      fromMemory: true,
      produce: lean('typed') >= 0.3 || lean('generation') >= 0.3,
      cumulative: lean('interleave') >= SHOW || lean('integration') >= SHOW || lean('reviewIntensity') >= SHOW || lean('recapEnd') >= 0.3,
    },
    fading: { mode: expert && !novice ? (knows ? 'expert' : 'principles') : novice && !expert ? 'fade' : 'one-then-try' },
    order: lean('ruleFirst') >= 0.3 ? 'abstract-first' : lean('ruleFirst') <= -0.3 ? 'concrete-first' : 'balanced',
    spacing: {
      earlierQuestion: mixOk && lean('integration') > -SHOW && (lean('interleave') >= SHOW || lean('integration') >= SHOW || lean('reviewIntensity') >= SHOW || lean('reviewSpacing') <= -SHOW),
      lookalike: mixOk && (lean('contrast') >= 0.3 || lean('interleave') >= 0.3),
      tomorrowLine: lean('reviewSpacing') <= -SHOW || lean('recapEnd') >= 0.3 || lean('reviewIntensity') >= 0.3,
    },
    gapOnly: { on: knows && !novice && lean('worked') < SHOW, strong: prior >= 80 || (mastery !== null && mastery >= 0.85) },
    // The picture's form follows the learner too (the full run found an arrow chain read as a long causal chain for a learner who follows
    // one or two links): no arrow chain when short cause links are asked for.
    dualCoding: { on: lean('visual') > -SHOW, strength: lean('visual') >= 0.3 || lean('multiRep') >= 0.3 ? 'every-key-idea' : 'central-idea', forms: lean('causal') <= -SHOW ? 'an aligned table or a labelled list (no long arrow chains)' : 'an aligned table, an arrow chain or a labelled list' },
    length: { words: lesson.wordBudget || null, minutes: lesson.minutes || null, compact: lean('length') <= -0.3 },
    measures: LEARNING_MEASURES,
  };
}

/** The method sentences for one surface. [] for the test surface (its question shape carries what applies). */
function learningLines(learning, surface) {
  if (!learning || surface === 'test' || surface === 'tutor') return [];
  const out = [];
  const lessonLike = surface === 'lesson' || surface === 'level';
  const r = learning.retrieval;
  if (lessonLike) {
    out.push(`Retrieval practice: ${r.spread ? 'spread the check questions through the lesson, not all at the end' : 'put the check questions after each full stretch of teaching, never interrupting it'}; each asks them to ${r.produce ? 'produce' : 'recall'} the idea from memory, never to reread or merely recognise it${r.cumulative ? ', and the last one brings back an idea from earlier' : ''}.`);
  } else if (surface === 'podcast') {
    out.push('Retrieval practice: each check-in asks the listener to recall the idea in their own words before the hosts say it again.');
  } else if (surface === 'material') {
    out.push('Retrieval practice: where the material has practice or a summary, ask for the idea from memory before it is shown again.');
  }
  const f = learning.fading.mode;
  if (lessonLike || surface === 'material') {
    if (f === 'fade') out.push('Worked examples fade: the first fully worked with every step shown, the next with its last step left for them to finish, then one they do alone.');
    else if (f === 'expert') out.push('They already know the basics: at most one short solved case for reference, then straight to problems; no long worked example.');
    else if (f === 'principles') out.push('They learn from the principle rather than from long solved cases: at most one short solved case for reference, then straight to problems.');
    else out.push('One worked example, then a problem of the same kind for them to do.');
  }
  if (learning.order === 'concrete-first') out.push('Concrete first: start from one or two concrete cases, then name the general rule they show, then the general form.');
  else if (learning.order === 'abstract-first') out.push('Principle first: state the general rule, then show it on concrete cases.');
  const sp = learning.spacing;
  if (lessonLike && (sp.earlierQuestion || sp.lookalike || sp.tomorrowLine)) {
    const parts = [];
    if (sp.earlierQuestion) parts.push('one question on an earlier idea');
    if (sp.lookalike) parts.push('one look-alike problem mixed into the practice so they must choose the method');
    if (sp.tomorrowLine) parts.push('a closing line that names the one thing to recall tomorrow');
    out.push(`Spacing and interleaving: include ${parts.join(', ')}.`);
  } else if ((surface === 'notes' || surface === 'podcast' || surface === 'material') && sp.tomorrowLine) {
    out.push('Close with the one point to recall tomorrow, in a single line.');
  }
  // Own material for a learner who needs less: no longer than the plain outline (every added bullet or line is paid for by a cut).
  if ((learning.length.compact || learning.gapOnly.on) && (surface === 'notes' || surface === 'podcast' || surface === 'material')) {
    out.push('Length: no longer than a plain outline of the material would be; every question, analogy or aid you add is paid for by cutting words elsewhere, never by dropping a point.');
  }
  if (learning.gapOnly.on) {
    out.push(surface === 'lesson' || surface === 'level'
      ? `Gap-only: they know the basics, so each point they already know gets ${learning.gapOnly.strong ? 'a single line' : 'one or two lines'} (still stated, so every objective appears) and the words go to what is new.`
      : `Gap-only: give the points a learner with a solid background already knows ${learning.gapOnly.strong ? 'a single line each' : 'one or two lines each'} (every point still stated, every fact kept) and spend the words on the harder points.`);
  }
  if (learning.dualCoding.on) {
    if (surface === 'podcast') out.push(`Dual coding: describe ${learning.dualCoding.strength === 'every-key-idea' ? 'a simple picture for each key idea' : 'one simple picture of the central idea'} that the listener can hold in mind.`);
    else if (surface === 'notes') out.push(`Dual coding: for ${learning.dualCoding.strength === 'every-key-idea' ? 'each section that has steps, parts or a sequence' : 'the central idea'}, add one bullet that starts "Layout:" and draws the point as a picture in text (${learning.dualCoding.forms || 'an aligned table, an arrow chain or a labelled list'}), built only from the material.`);
    else out.push(`Dual coding: pair ${learning.dualCoding.strength === 'every-key-idea' ? 'each key idea' : 'the central idea'} with a picture in text (${learning.dualCoding.forms || 'an aligned table, an arrow chain or a labelled list'}) that shows the same thing as the words${surface === 'material' ? ', built only from the material' : ''}.`);
  }
  return out;
}

// ── the learner's own context as lines ──────────────────────────────────────
function contextLines(facts, surface) {
  if (!facts || surface === 'tutor') return [];
  const out = [];
  const strengths = [...facts.strengths, ...facts.measuredStrengths].slice(0, 4);
  const difficulties = [...facts.difficulties, ...facts.measuredDifficulties].slice(0, 5);
  if (strengths.length) out.push(`Strengths to build on (lean on them to carry the hard part): ${strengths.join('; ')}.`);
  if (difficulties.length) out.push(`Past difficulties to pre-empt (address each before it bites, without saying they find it hard): ${difficulties.join('; ')}.`);
  if (facts.worked.length && surface !== 'test') out.push(`Explanations that have worked for them before: ${facts.worked.join('; ')}.`);
  if (facts.goals.length || facts.studying) out.push(`What they are working toward: ${[...facts.goals, ...(facts.studying ? [facts.studying] : [])].slice(0, 2).join('; ')}; where a choice of emphasis is open, choose what serves it.`);
  return out;
}

// ── compiling the lever sentences, graded ───────────────────────────────────
/**
 * The graded lever instructions for one surface: { numbered: [text], light: [text] }. `ranked` is learning-spec's list of
 * { lever, text, lean, score } (already filtered to the surface and to |lean| >= SHOW, sorted by score). Strong ones say they
 * apply throughout; clear ones are plain; light ones are grouped. Nothing is dropped: up to `maxNumbered` strong-and-clear ones are
 * numbered, the rest join the grouped line.
 */
function gradeRanked(ranked, maxNumbered = 12) {
  const numbered = []; const overflow = []; const light = [];
  // A promoted sentence (see promote below) is numbered even when its lean is light, and holds its place: the others fill what room is left.
  let room = maxNumbered - ranked.filter((r) => r.promoted && strengthOf(r.lean) !== 'none').length;
  for (const r of ranked) {
    const st = strengthOf(r.lean);
    if (st === 'none') continue;
    if (st === 'light' && !r.promoted) { light.push(r.text.replace(/\.$/, '')); continue; }
    const text = st === 'strong' ? `${r.text.replace(/\.$/, '')}. Apply this throughout.` : r.text;
    if (r.promoted) numbered.push(text);
    else if (room > 0) { numbered.push(text); room -= 1; } else overflow.push(text);
  }
  return { numbered, overflow, light };
}

/** A measure this far from the middle (z times confidence) counts as strongly moved. */
const SIGNATURE_AT = 0.5;
const MAX_PROMOTED = 4;
/**
 * Priority ordering by measure. Levers are ranked by how much they shape the page, so when several measures move at once a measure
 * whose levers are small (an attention span, say, which only asks for smaller pieces) is outranked and ends up as a light touch, or
 * is lost behind the measures that share its levers: the joint profiles showed that effect vanishing from the text. So every
 * strongly moved measure keeps ONE numbered instruction of its own: the sentence of the lever it moves most, taken only from the
 * levers whose final lean points the way this measure pulls (a sentence that says the opposite is never promoted). A measure already
 * represented in the numbered list gets nothing more. Nothing is dropped: a promoted sentence takes the place of the lowest
 * ranked numbered one, which moves to the "Also" list.
 *
 * `ranked`: learning-spec's { lever, text, lean, score } for one surface. `measures`: measuresOf(). `impOf(lever)`: how much a lever
 * shapes the page. Returns the same list with `promoted: true` on the chosen entries (copies; the input is untouched).
 */
function promote(ranked, measures, { max = 10, impOf = () => 0, limit = MAX_PROMOTED } = {}) {
  const list = (ranked || []).map((r) => ({ ...r }));
  if (!list.length || !Array.isArray(measures)) return list;
  // The sentences the plain ranking numbers.
  const inNumbered = new Set(list.filter((r) => strengthOf(r.lean) === 'clear' || strengthOf(r.lean) === 'strong').slice(0, max).map((r) => r.lever));
  const byLever = new Map(list.map((r) => [r.lever, r]));
  const strong = measures.filter((m) => Math.abs(m.z) >= SIGNATURE_AT).sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.id.localeCompare(b.id));
  const chosen = new Set();
  // A lever several strongly moved measures pull on is explained by all of them, so it does not stand for any one: a measure is
  // represented by a lever of its own when it has one with a sentence, and by a shared one only when it has none.
  const claims = new Map();
  for (const m of strong) for (const e of (m.levers || [])) if (e.pull) claims.set(e.lever, (claims.get(e.lever) || 0) + 1);
  for (const m of strong) {
    if (chosen.size >= limit) break;
    let mine = (m.levers || []).map((e) => ({ e, r: byLever.get(e.lever) })).filter((x) => x.r && strengthOf(x.r.lean) !== 'none' && Math.sign(x.e.pull) === Math.sign(x.r.lean));
    const own = mine.filter((x) => claims.get(x.e.lever) === 1);
    if (own.length) mine = own;
    if (!mine.length || mine.some((x) => inNumbered.has(x.e.lever) || chosen.has(x.e.lever))) continue;
    mine.sort((a, b) => Math.abs(b.e.pull) * (1 + impOf(b.e.lever)) - Math.abs(a.e.pull) * (1 + impOf(a.e.lever)) || a.e.lever.localeCompare(b.e.lever));
    chosen.add(mine[0].e.lever);
  }
  for (const r of list) if (chosen.has(r.lever)) r.promoted = true;
  return list;
}

module.exports = {
  SHOW, CLEAR, STRONG, strengthOf, bandOf,
  measuresOf, CAPABILITIES, CAP_TEXT, capabilitiesOf, cleanSaid, saidOf, factsOf,
  JOINT_RULES, MAX_JOINT, jointOf,
  LEARNING_MEASURES, learningOf, learningLines, contextLines, gradeRanked, promote, SIGNATURE_AT, MAX_PROMOTED,
};
