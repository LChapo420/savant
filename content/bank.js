/**
 * The content bank: one generator per skill, and the normalization every item
 * passes through before it can be served.
 *
 * This is the product's floor. When the model API is missing, over budget, slow,
 * or wrong, the bank still produces a correct, level-appropriate question for
 * every skill in the curriculum — which is why the site never has a dead screen.
 */
const { makeRng } = require('./rng');
const { shapeKey, stably } = require('./pool');
const holdout = require('./holdout');
const mathItems = require('./math-items');
const { GENERATORS: englishItems } = require('./english-items');
const { GENERATORS: iqItems } = require('./iq-items');
const { GENERATORS: spanishItems } = require('./spanish-items');
const { GENERATORS: phonicsFamilies } = require('./phonics-families');
const { GENERATORS: chessItems } = require('./chess-items');
const { GENERATORS: pianoItems } = require('./piano-items');
const { GENERATORS: basketballItems } = require('./basketball-items');
// The skills that fit the early and late grades of English, Reading and Spanish
// (grade-fit, 2026-10-24); the math ones are inside math-items.js.
const { GENERATORS: englishGradeItems } = require('./english-grade-items');
const { GENERATORS: spanishGradeItems } = require('./spanish-grade-items');
const curriculum = require('../config/curriculum');

const GENERATORS = {
  ...mathItems,
  ...englishItems,
  ...iqItems,
  ...spanishItems,
  // Phonics is the reading-and-writing-words skill, and it stands alone rather
  // than folding into parts_of_speech: the questions are about letters making
  // sounds, and a learner decoding their first words cannot be asked what part
  // of speech a word is. It is a family of ten rules rather than one generator,
  // so a block drawn from it can ask a different thing each time.
  ...phonicsFamilies,
  ...chessItems,
  ...pianoItems,
  ...basketballItems,
  ...englishGradeItems,
  ...spanishGradeItems,
};

/** Skills a grade lists that have no generator yet. The check script fails on any. */
function missingSkills() {
  return curriculum.allUsedSkills().filter((s) => typeof GENERATORS[s] !== 'function');
}

function clampDifficulty(d) {
  return Math.max(1, Math.min(10, Math.round(Number(d) * 10) / 10));
}

/**
 * Every item leaves here in the same shape, whatever the generator did. The
 * invariants enforced below are the ones that have historically broken quizzes:
 * a multiple-choice item whose answer is not among the choices, duplicate
 * choices, a stray choices array on a type-in, or a missing rationale.
 */
/**
 * Templates compose from helpers that each own their own spacing — `signedTerm`
 * emits a leading space so "x^2 - 4x" comes out right — and where a template also
 * types a space the two collide. Fixing it in every generator is 16 chances to
 * miss one, so it is collapsed here, once, on the way out. Newlines survive:
 * some prompts are laid out deliberately.
 */
function tidy(text) {
  // A space before a mark is pulled in ("Is it red ?" -> "Is it red?"), except a
  // "?" that is a blank to fill rather than the end of a question: one followed
  // by an operator or a word ("3 × ? = 21", "x^2 + ?x"). Pulling that one in
  // printed "3 ×? = 21" to learners.
  return String(text)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!])/g, '$1')
    .replace(/[ \t]+\?(?![ \t]*[\w=+\-×÷*/(])/g, '?')
    .trim();
}

function normalize(raw, skillId, difficulty, seed) {
  const item = {
    skill_id: skillId,
    skill_name: curriculum.skillName(skillId),
    difficulty: clampDifficulty(raw.difficulty != null ? raw.difficulty : difficulty),
    format: raw.format || 'multiple_choice',
    prompt: tidy(raw.prompt || ''),
    answer: String(raw.answer),
    rationale: tidy(raw.rationale || ''),
    source: raw.source || 'bank',
    gen_seed: seed,
  };
  if (raw.passage) item.passage = tidy(raw.passage);
  if (raw.passage_id) item.passage_id = raw.passage_id;
  if (raw.fen) item.fen = String(raw.fen);
  if (Array.isArray(raw.accepts) && raw.accepts.length) item.accepts = raw.accepts.map(String);
  if (raw.hint) item.hint = String(raw.hint);

  if (item.format === 'multiple_choice') {
    const seen = new Set();
    const choices = [];
    for (const c of raw.choices || []) {
      const s = String(c);
      if (seen.has(s)) continue;
      seen.add(s);
      choices.push(s);
    }
    if (!choices.includes(item.answer)) choices.push(item.answer);
    item.choices = choices;
    if (item.choices.length < 2) item.format = 'type_in';
  }
  if (item.format !== 'multiple_choice') delete item.choices;

  if (!item.prompt) throw new Error(`generator for ${skillId} produced an empty prompt`);
  if (!item.rationale) item.rationale = 'Check each step against the rule for this skill.';
  return item;
}

/**
 * Generate one item.
 *
 * @param {object} opts
 * @param {string} opts.skillId
 * @param {number} opts.difficulty 1-10
 * @param {string|number} [opts.seed]  same seed, same item
 * @param {Set<string>} [opts.avoid]   prompts already used in this sitting
 * @param {Set<string>} [opts.seenShapes]  question shapes already met, by any
 *   learner. This is what stops a family being asked twice under different nouns,
 *   and it is why a pool needs several *shapes* rather than several renderings.
 * @param {number} [opts.school]  the US school grade the item is for (-1 to 12;
 *   config/grade-skills.js schoolGrade). Math serves that grade's standard and
 *   the English pools only that grade's rules; without it nothing changes.
 */
function generate({ skillId, difficulty = 5, seed, avoid, seenShapes, school, stable }) {
  const gen = GENERATORS[skillId];
  if (!gen) throw new Error(`no bank generator for skill "${skillId}"`);
  const usedSeed = seed != null ? seed : `${skillId}:${difficulty}:${Math.random()}`;
  const rng = makeRng(String(usedSeed));
  const d = clampDifficulty(difficulty);
  const ctx = { avoid: avoid || new Set(), seenShapes: seenShapes || null };
  if (Number.isFinite(school)) ctx.school = school;
  // `stable`: the same seed gives the same item in every process (content/pool.js
  // withShapes; used by the bank-fed games). Off for every other caller.
  if (stable) ctx.stable = true;
  const raw = stable ? stably(() => gen(rng, d, ctx)) : gen(rng, d, ctx);
  const built = normalize(raw, skillId, d, String(usedSeed));
  // A learner with held-back questions (content/holdout.js) is drawn another one.
  // Free for everyone else: isBlocked is false at once when no holdout is in force.
  if (!holdout.isBlocked(built)) return built;
  for (let n = 1; n <= 40; n++) {
    const reseed = `${usedSeed}:held${n}`;
    const again = normalize(gen(makeRng(reseed), d, ctx), skillId, d, reseed);
    if (!holdout.isBlocked(again)) return again;
  }
  return built;
}

/**
 * What makes two items the same question.
 *
 * Not the prompt alone. Whole families of grammar questions share one prompt —
 * "Which sentence is punctuated correctly?" — and differ entirely in the four
 * sentences offered. Keyed on the prompt, every one of those looks like a repeat
 * of the first, so a session dedupe throws away perfectly good questions and
 * then, having run out of "new" ones, serves a real repeat anyway. That was the
 * whole mechanism behind repeated questions in levels and quizzes.
 *
 * Prompt plus answer is the honest identity: same wording and same answer is the
 * same question, and nothing else is.
 */
function itemKey(item) {
  if (!item) return '';
  const parts = [
    String(item.prompt || '').trim(),
    String(item.answer == null ? '' : item.answer).trim(),
  ];
  // The options count too. "Which number does not belong?" is one prompt and one
  // answer across thousands of genuinely different questions — the numbers on
  // offer are the question. Sorted, so reshuffling the same four options is not
  // mistaken for a new item.
  if (Array.isArray(item.choices) && item.choices.length) {
    parts.push([...item.choices].map(String).sort().join('\u0001'));
  }
  return parts.join('||');
}

/**
 * Generate items for a plan of { skillId, difficulty } entries, skipping repeats.
 *
 * Two sets are kept. `avoid` is the exact prompts already asked in this sitting,
 * which is what keeps a session from serving the same string twice. `shapes` is
 * the set of question *frames* asked — for this sitting and for this learner
 * before it — and it is what stops a family being asked a second time with the
 * nouns changed. Without it a 120-question sitting can contain 119 distinct
 * strings of one question, which is exactly what a learner reports as repetition.
 *
 * @param {Set<string>} [seenShapes]  frames already met
 * @param {function} [only]  a generator to use in place of the skill's own, so a
 *   caller can pin the draw to one family. A lesson teaching one rule asks
 *   questions about that rule, and the pin is what makes it true rather than
 *   likely. The plan's skillId is still what the item is recorded against, so
 *   mastery and the repeat metric see the right skill either way.
 *
 * @param {Set<string>} [extraAvoid]  item keys this draw must not produce, on top of
 *   anything in the plan. A lesson draws its worked examples and then its check
 *   questions; the checks pass the examples' keys here, so a check is never the
 *   exact question the worked example above it already answered. The one thing a
 *   check question is not allowed to be.
 */
function generateMany(plan, seenShapes, only, extraAvoid) {
  const avoid = extraAvoid instanceof Set ? new Set(extraAvoid) : new Set();
  const shapes = seenShapes instanceof Set ? seenShapes : new Set();
  const out = [];
  for (const entry of plan) {
    let item = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (only) {
        const candidate = only(makeRng(`${entry.skillId}:${entry.difficulty}:${Date.now()}:${out.length}:${attempt}:${Math.random()}`),
          clampDifficulty(entry.difficulty), { avoid, seenShapes: shapes, ...(Number.isFinite(entry.school) ? { school: entry.school } : {}) });
        const normalized = normalize(candidate, entry.skillId, clampDifficulty(entry.difficulty), 'pinned');
        item = normalized;
        if (!avoid.has(itemKey(normalized)) && !holdout.isBlocked(normalized)) break;
        continue;
      }
      const candidate = generate({
        skillId: entry.skillId,
        difficulty: entry.difficulty,
        seed: `${entry.skillId}:${entry.difficulty}:${Date.now()}:${out.length}:${attempt}:${Math.random()}`,
        avoid,
        seenShapes: shapes,
        school: entry.school,
      });
      item = candidate;
      if (!avoid.has(itemKey(candidate))) break;
    }
    avoid.add(itemKey(item));
    shapes.add(shapeKey(item));
    out.push({ ...item, ...(entry.role ? { role: entry.role } : {}) });
  }
  return out;
}

module.exports = { generate, generateMany, itemKey, shapeKey, GENERATORS, missingSkills };
