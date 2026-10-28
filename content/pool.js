/**
 * Helpers for the authored item pools (grammar, reading, reasoning, Spanish).
 *
 * A pool entry comes in two shapes. The terse one is a single fixed item:
 *
 *   { d, p, c, a, r }
 *     d  difficulty 1-10
 *     p  prompt
 *     c  choices (omit for type-in)
 *     a  answer (exact choice text, or the accepted string)
 *     r  rationale shown after the answer
 *     x  optional extra accepted answers
 *     pass optional passage shown above the prompt
 *
 * The second is a **family**: the same question shape with slots filled from word
 * banks, so one entry is hundreds or thousands of questions.
 *
 *   { d, slots: { noun: ['books', 'folders'], place: ['on the shelf'] },
 *     p: (s) => `The ${s.noun} ___ ${s.place}.`,
 *     c: (s) => ['are', 'is', 'was', 'has been'],
 *     a: (s) => 'are',
 *     r: (s) => `The plural subject "${s.noun}" takes a plural verb.` }
 *
 * Families exist because a fixed list is a repeat generator. Eight authored
 * items per skill means a learner has seen all of them inside one sitting, and
 * measured over a 120-question run the repeat rate was 94%. Crossing three slots
 * of ten options each turns those same eight rules into thousands of questions
 * without loosening what is being tested: the rule lives in the template, the
 * variation lives in the slots, and the rationale is written per variant so it
 * still names the specific words in front of the learner.
 */
const { choicesFrom } = require('./rng');

/** How many times to re-roll a family's slots looking for an unseen prompt. */
const RENDER_TRIES = 12;

/** How many different entries to try when the first one keeps repeating itself. */
const PICK_TRIES = 6;

function isFamily(entry) {
  return !!entry && typeof entry.p === 'function';
}

/** One value per slot. Independent draws, so the space is the product. */
function fillSlots(rng, slots) {
  const out = {};
  for (const [name, options] of Object.entries(slots || {})) {
    out[name] = typeof options === 'function' ? options(rng, out) : rng.pick(options);
  }
  return out;
}

/** Roughly how many distinct questions a family can produce. */
function familySize(entry) {
  if (!isFamily(entry)) return 1;
  return Object.values(entry.slots || {}).reduce(
    (n, options) => n * (Array.isArray(options) ? options.length : 8), 1,
  );
}

/** The whole pool's space, used by the repeat-rate script and the content check. */
function poolSize(pool) {
  return pool.reduce((n, entry) => n + familySize(entry), 0);
}

function renderFamily(rng, entry, d) {
  const s = fillSlots(rng, entry.slots);
  const value = (v) => (typeof v === 'function' ? v(s) : v);
  return {
    // A family with a range takes the difficulty that was asked for, inside that
    // range, so mastery is credited against the level the learner is standing on
    // rather than against the family's nominal difficulty.
    d: entry.dr ? Math.min(Math.max(d, entry.dr[0]), entry.dr[1]) : (entry.d == null ? d : entry.d),
    p: String(value(entry.p)),
    // The question's frame, carried through so its *shape* can be measured
    // without re-deriving it from rendered prose. A family that writes its
    // template here is declaring "these renderings are one question", which is
    // what lets the picker skip it once a learner has had it.
    family_frame: entry.frame ? String(value(entry.frame)) : String(entry.p).replace(/\{\{?\w+\}?\}/g, 'w'),
    varies: entry.varies,
    c: entry.c ? value(entry.c).map(String) : undefined,
    a: String(value(entry.a)),
    r: String(value(entry.r)),
    x: entry.x ? value(entry.x) : undefined,
    pass: entry.pass ? String(value(entry.pass)) : undefined,
  };
}

/**
 * Pick the pool entry closest to the requested difficulty, preferring ones the
 * learner is unlikely to have just seen.
 *
 * `avoid` carries every prompt the learner has already been asked — this sitting
 * and their recent history — which is what stops a quiz, or a run of levels on
 * the same skill, repeating a line.
 */
/** The same identity bank.itemKey computes, for a fixed pool entry. */
function entryKey(e) {
  const parts = [String(e.p || "").trim(), String(e.a == null ? "" : e.a).trim()];
  if (Array.isArray(e.c) && e.c.length) parts.push([...e.c].map(String).sort().join(""));
  return parts.join("||");
}

function pickByDifficulty(rng, pool, d, avoid = new Set(), shapeOf = null, seenShapeSet = new Set()) {
  // A family is never "used up" by a rendering: there are thousands of them. But
  // it can be used up as a *shape* — 784 renderings of one question is one
  // question. Fixed entries are filtered once seen, by prompt AND answer, because
  // several pools ask one question about many different sentences.
  const fresh = pool.filter((e) => isFamily(e) || !avoid.has(entryKey(e)));
  // Families whose shape is spent are dropped too, when the caller can say which
  // shapes those are. This is what forces a different rule rather than a
  // different noun. When every shape in the pool is spent, the strict filter is
  // abandoned rather than the picker stalling — repeating a question beats
  // returning nothing, and the metric is what tells us the space is too small.
  const unseen = shapeOf
    ? fresh.filter((e) => {
      const shape = shapeOf(e);
      return !shape || !seenShapeSet.has(shape);
    })
    : fresh;
  const usable = unseen.length ? unseen : (fresh.length ? fresh : pool);
  let best = Infinity;
  for (const e of usable) best = Math.min(best, difficultyGap(e, d));
  const near = usable.filter((e) => difficultyGap(e, d) <= best + 1.5);
  return rng.pick(near);
}

/**
 * How far an entry is from the difficulty being asked for.
 *
 * A family may declare `dr: [lo, hi]` instead of a single `d`, meaning the rule it
 * tests is reasonable anywhere in that band — subject-verb agreement is a fair
 * question at difficulty 3 and at difficulty 6, the sentence just gets longer.
 * Without ranges every family is pinned to one difficulty, so a level two bands
 * away sees one or two families and repeats them.
 */
function difficultyGap(entry, d) {
  if (entry.dr) {
    if (d < entry.dr[0]) return entry.dr[0] - d;
    if (d > entry.dr[1]) return d - entry.dr[1];
    return 0;
  }
  return Math.abs((entry.d || 5) - d);
}

/**
 * Give every family a difficulty range around its nominal difficulty.
 *
 * Applied to a whole file's families at load time rather than written out on each
 * one, because the answer is the same for nearly all of them: the rule holds a
 * few bands either side. The width is what decides how many families a given
 * level can reach, and that — not the total size of the bank — is what the repeat
 * rate actually depends on: a skill with six hundred possible questions still
 * repeats if a level can only reach thirty of them.
 */
function spread(families, width = 3) {
  const out = {};
  for (const [skill, list] of Object.entries(families)) {
    out[skill] = list.map((entry) => {
      if (!isFamily(entry) || entry.dr) return entry;
      const at = entry.d == null ? 5 : entry.d;
      return { ...entry, dr: [Math.max(1, at - width), Math.min(10, at + width)] };
    });
  }
  return out;
}

/** Turn a pool entry (fixed, or one rendering of a family) into an item. */
function entryToItem(rng, entry, d) {
  const e = isFamily(entry) ? renderFamily(rng, entry, d) : entry;
  const base = {
    source: 'bank',
    format: e.c ? 'multiple_choice' : e.format || entry.format || 'type_in',
    prompt: e.p,
    answer: String(e.a),
    rationale: e.r,
    difficulty: e.d || d,
  };
  if (e.pass) base.passage = e.pass;
  if (e.x) base.accepts = e.x;
  if (e.varies) base.varies = e.varies;
  if (e.family_frame) base.family_frame = e.family_frame;
  if (e.c) base.choices = rng.shuffle([...new Set(e.c.map(String))]);
  return base;
}

/**
 * The entries of a pool a US school grade may be served (standards check,
 * 2026-10-24). An entry's `g` is the first grade whose standard teaches its rule
 * (set from content/english-grade-items.js SCHOOL_GRADES); an entry without one,
 * or a caller with no school grade (the ACT, college grades), is unaffected. A
 * pool with nothing at or below the grade is served whole, which the grade-skills
 * test reports, since the grade-fit table should never allow it.
 */
const schoolCache = new WeakMap();
function forSchool(pool, school) {
  if (!Number.isFinite(school) || !Array.isArray(pool)) return pool;
  let byGrade = schoolCache.get(pool);
  if (!byGrade) { byGrade = new Map(); schoolCache.set(pool, byGrade); }
  if (!byGrade.has(school)) {
    const fit = pool.filter((e) => !Number.isFinite(e.g) || e.g <= school);
    byGrade.set(school, fit.length ? fit : pool);
  }
  return byGrade.get(school);
}

/**
 * Build a generator from a pool.
 *
 * When the chosen entry is a family, its slots are re-rolled until the rendered
 * prompt is one the learner has not seen. That is where the repeat rate actually
 * comes from: picking a fresh family is not enough if it renders the same
 * sentence.
 */
function fromPool(fullPool, skillId) {
  const key = (item) => entryKey({ p: item.prompt, a: item.answer, c: item.choices });
  return (rng, d, ctx = {}) => {
    // A school grade is served only the rules its standard teaches; once those
    // are all seen it repeats one of them rather than reaching a later grade's.
    const pool = forSchool(fullPool, ctx.school);
    const avoid = ctx.avoid || new Set();
    // A second set, of question *shapes* the learner has met. This is the one
    // that matters: a family with 784 renderings is one question, and re-rolling
    // its nouns twelve times cannot make a second one. Families whose shape has
    // been seen are dropped from the band entirely, so the picker is forced to
    // reach for a different rule — which is the only way the space actually grows.
    const seenShapes = ctx.seenShapes || null;
    // The shape a family *would* produce, computed from its own template rather
    // than from a rendering, so it is the same value however the slots happen to
    // fall. Fixed entries have no frame and are never shape-filtered — there are
    // only ever as many of them as were authored.
    const shapeOf = (entry) => (isFamily(entry) ? shapeKey({
      skill_id: skillId,
      family_frame: entry.frame || String(entry.p || '').replace(/\{\{?\w+\}?\}/g, 'w'),
      varies: entry.varies,
    }) : null);

    let first = null;
    // Three levels of retry, and each one matters. Re-rendering a family only
    // helps while its shape is unseen. Once it is seen, the answer is a different
    // family in the same band, and once the whole band is seen, a different
    // band — because a rule asked at difficulty 4 is still a real question at 3.
    for (let pick = 0; pick < PICK_TRIES; pick++) {
      const entry = pickByDifficulty(rng, pool, d, avoid, shapeOf, seenShapes || new Set());
      let item = entryToItem(rng, entry, d);
      if (!first) first = item;
      if (!isFamily(entry)) {
        if (!avoid.has(key(item))) return item;
        continue;
      }
      // A family whose shape is already spent is not worth re-rolling at all.
      if (seenShapes && seenShapes.has(shapeOf(entry))) continue;
      for (let tries = 1; tries < RENDER_TRIES && avoid.has(key(item)); tries++) {
        item = entryToItem(rng, entry, d);
      }
      if (!avoid.has(key(item))) return item;
    }
    return first;
  };
}

/**
 * Four distinct choices, answer first.
 *
 * Computed distractors collide: a painted 4×4×4 cube has 24 one-face cubes and 24
 * two-face cubes, so the obvious wrong answer is the right one. Rather than
 * hand-checking every arithmetic coincidence, a family hands its candidates here
 * and gets four distinct strings back, topped up from `filler` and then by
 * nudging the numeric answer.
 */
function distinctChoices(answer, candidates = [], filler = []) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const s = String(value);
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  // A family may hand the right answer over as a bare string, with the
  // candidates beside it. Iterating a string would otherwise offer every
  // character as a distractor, which is how a four-letter word turns a reading
  // question into single letters.
  add(answer);
  for (const c of [].concat(candidates || [])) add(c);
  for (const c of [].concat(filler || [])) { if (out.length < 4) add(c); }
  // Still short: the answer is a number and nearby numbers are plausible.
  const n = Number(String(answer).replace(/[^\d.-]/g, ''));
  const suffix = String(answer).replace(/^[\d.-]+/, '');
  for (let step = 1; out.length < 4 && step < 40; step++) {
    if (Number.isFinite(n)) {
      add(`${n + step}${suffix}`);
      if (n - step > 0 && out.length < 4) add(`${n - step}${suffix}`);
    } else {
      add(`${answer} (${step})`);
    }
  }
  return out.slice(0, 4);
}

/**
 * The shape of a question: what it asks, with the content taken out.
 *
 * `itemKey` answers "have I seen this exact item", and it is the right key for
 * that — the shared content cache only wants identical duplicates avoided. It is
 * the wrong key for "does this feel like a new question", because a family that
 * fills two noun slots produces 784 different strings and exactly one idea, and a
 * learner meets all 784 as the same question.
 *
 * So this is the second key, and it is what the repeat metric and the avoid set
 * for *practice* should use. The rule is mechanical and has to be: strip
 * punctuation and digits, then the words a family varies, and what is left is the
 * frame. "Which word is the adjective?" and "Which word is the adverb?" are
 * different frames and both survive; the same frame over a different noun is one
 * question wearing 784 costumes.
 *
 * A family therefore declares the words it varies in `varies`, and those are
 * removed before the frame is taken. Families that do not declare it get the
 * generic treatment, which is why a handful of them are wrong in the same way
 * today — declaring it is the fix, and the metric reports the ones that have not
 * declared it yet rather than hiding them.
 */
function shapeKey(item) {
  if (!item) return '';
  // A family that accepts several spellings of its answer is still one question.
  // "1 1/4" and "1-1/4" pass the same way, so counting them as separate shapes
  // made a skill look far more varied than it is: systems reported 105 distinct
  // shapes in 120 questions, which is arithmetically impossible for a question
  // asked twenty different ways.
  let frame = (item.family_frame || item.prompt || '').trim();
  for (const alt of (Array.isArray(item.x) ? item.x : []).slice(1)) {
    if (!alt || typeof alt !== 'string') continue;
    const a = alt.trim().toLowerCase();
    if (!a) continue;
    frame = frame.split(a).join(' alt ');
  }
  frame = frame
    .toLowerCase()
    .replace(/[""'']/g, "'")
    .replace(/[0-9]+/g, '#')
    .replace(/[a-z]+/g, (word) => (/^[+\-*/=<>%x]$/.test(word) ? word : 'w'))
    .replace(/\s+/g, ' ')
    .trim();
  // The words this question varies are not part of its identity either. "The
  // dog" and "the cat" are the same question; stripping them is what makes a
  // family of 784 renderings measurable as one idea.
  for (const word of item.varies || []) {
    const w = String(word).toLowerCase().replace(/[^a-z']/g, '');
    if (w.length < 2) continue;
    frame = frame.split(` ${w} `).join(' ').split(` ${w}`).join(' ').split(`${w} `).join(' ');
  }
  return `${item.skill_id || ''}||${frame.replace(/\s+/g, ' ').trim()}`;
}

/**
 * Alternate a base generator with a set of shapes, so a skill offers a different
 * *kind* of question rather than the same one with different numbers.
 *
 * The earlier version tested for the literal strings "<skill>||arithmetic" and
 * "<skill>||shape", which nothing ever puts in the shape set — generateMany
 * records the real frame of whatever it just built, like "add_sub||# - # =". The
 * test could never pass, so every skill served its base generator forever and
 * the shapes were dead code that happened to validate.
 *
 * Rotating is also the only way the avoid set helps: without it, generateMany
 * rejects a duplicate item and immediately asks the same generator again, so the
 * learner gets a second question that is the first question with other numbers.
 *
 * @param {function} base     the original generator
 * @param {function} shapes   a generator producing a different task on the same material
 * @param {string} skillId    used to tell this skill's shapes from another's
 * @returns {function} a generator of the same signature
 */
const SHAPE_ROTATION_LIMIT = 12;

// While above zero, withShapes chooses from the seed alone (see `stably`).
let stableDepth = 0;
/** Run one synchronous draw whose result must depend on its seed alone. */
function stably(fn) {
  stableDepth++;
  try { return fn(); } finally { stableDepth--; }
}

function withShapes(base, shapes, skillId) {
  // The state lives for the process rather than in the call. The shape set handed
  // to a generator is only a snapshot: generateMany grows its own copy, and the
  // set the caller passed in does not change. So the record of "what has this
  // skill already served" has to live here to be worth anything.
  //
  // `shapeTurns` is a count, not a list of shapes. An earlier version grew a
  // list of distinct shape keys and decided on its length, which meant the very
  // first shape served made the length 1 and turned rotation off for the rest of
  // the process: eleven base questions and one shape. What is being asked is
  // "have I spent my budget of shape turns", so the budget is counted in turns.
  let shapeTurns = 0;
  return (rng, d, ctx = {}) => {
    // A caller that needs the same item from the same seed in any process (the
    // bank-fed games, services/game-bank.js) draws inside `stably`: the
    // shape-or-base choice then comes from the seed, and the process's turn budget
    // is left alone. A depth count rather than ctx alone, because some base
    // generators call themselves again without passing ctx on.
    if (ctx.stable || stableDepth > 0) return (rng.next() < 0.5 ? shapes : base)(rng, d, ctx);
    // Alternate until the budget runs out, then let the base generator have the
    // rest: repeating the basic arithmetic is the lesson rather than a failure
    // of it, and a learner who has met every shape has nothing left to rotate to.
    const useShape = shapeTurns < SHAPE_ROTATION_LIMIT && shapeTurns % 2 === 0;
    const item = useShape ? shapes(rng, d, ctx) : base(rng, d, ctx);
    shapeTurns++;
    return item;
  };
}

/** The identity of a built item, so a re-roll can be checked against the avoid set. */
const entryKeyOf = (item) => entryKey({ p: item.prompt, a: item.answer, c: item.choices });

/**
 * A generator that serves one family, and nothing else.
 *
 * A lesson teaches one topic; the questions at the end of it should be about
 * that topic. Drawn from the whole skill they are about whichever rule the
 * difficulty band happened to favour, which is why a lesson on "subject and
 * object pronouns" could end in a question about a dangling participle. Pinning
 * to a single family makes "the questions follow the lesson" a property of the
 * draw rather than a hope, and it is why `content/topics.js` can name a rule and
 * the bank can be asked for exactly that rule.
 *
 * The difficulty is ignored. A lesson on a rule is on that rule; whether the
 * example is easy or hard is the lesson's business, not the picker's.
 */
function fromFamily(family, skillId) {
  return (rng, d, ctx = {}) => {
    const avoid = ctx.avoid || new Set();
    let built = entryToItem(rng, family, d);
    // Re-roll for the slots only, the way fromPool does: a family has hundreds
    // of renderings, so the one that was picked by chance is often already on
    // the learner's list.
    for (let tries = 1; tries < 12 && avoid.has(entryKeyOf(built)); tries++) {
      built = entryToItem(rng, family, d);
    }
    return { ...built, skill_id: skillId };
  };
}

module.exports = {
  forSchool,
  distinctChoices,
  spread,
  difficultyGap,
  pickByDifficulty,
  entryToItem,
  fromPool,
  fromFamily,
  choicesFrom,
  isFamily,
  shapeKey,
  withShapes,
  stably,
  familySize,
  poolSize,
  fillSlots,
  shapeKey,
};
