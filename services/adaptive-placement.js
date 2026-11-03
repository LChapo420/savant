/**
 * The adaptive placement walk: Quick, Balanced and Accurate.
 *
 * The full walk climbs a subject from its first grade until the questions stop
 * being answerable. On a 49-grade subject that is hours, and a learner who
 * belongs in grade 30 spends most of it proving they can count. This walk asks
 * instead where the evidence is thinnest: it keeps a belief about where in the
 * subject the learner is (a grid of positions, each with a weight), asks the
 * block of questions written nearest the middle of that belief, updates, and
 * stops when the belief is narrow enough for the mode or the mode's cap is hit.
 *
 * Everything it knows about a question is where it was written for: its grade
 * and its band (easy near the start of the grade, the capstone at the end). The
 * same functions run in the app and in the simulated testers
 * (scripts/placement-testers.js), so what is measured is what ships.
 *
 * Positions are in grades from the start of the subject: 3.5 is half-way
 * through the fourth grade. Inside a grade the same machinery runs over units
 * (services/unit-placement.js), with a unit as the step.
 *
 * Pure functions only; nothing here touches the database.
 */

/** Where in its grade a band was written for: 0 is the start of the grade, 1 the end. */
const BAND_AT = { easy: 0.15, medium: 0.45, hard: 0.75, capstone: 0.98 };

const STEP = 0.05;
// What the walk assumes of a learner, tuned on simulated testers whose questions
// sit exactly where they were written for (so every miss is the walk's own):
// a slope a fifth of a grade wide, a 10% chance of slipping on something known,
// and 15 points of luck above pure guessing on something not. The sharper model
// it started with (0.12 wide, 5% slips, no luck) believed a run of three lucky
// guesses and stopped early: 9 of 384 quick walks landed two or more grades out,
// against 1 of 384 with these.
const SLIP = Number(process.env.ADAPTIVE_SLIP || 0.10);
const LUCK = Number(process.env.ADAPTIVE_LUCK || 0.15);
const WIDTH = Number(process.env.ADAPTIVE_WIDTH || 0.2);
// A question's calibrated point is where the judges say a learner answers it
// RELIABLY (about 9 in 10), not where they are at even odds. The walk's slope is
// centred this far below the point to match; without it every estimate sat a
// fifth of a grade high and late-in-grade learners landed two grades up.
const RELIABLE = Number(process.env.ADAPTIVE_RELIABLE || 0.3);

/**
 * The modes. `max` caps the questions; `minutes` is the clock the app holds the
 * walk to whatever the count. `sure` is how much of the belief has to sit within
 * one grade of its middle before the walk may stop, after at least `min`.
 */
/**
 * Each mode's whole placement budget, in minutes: the owner's limits of 2026-11-02 for Balanced (about 20) and
 * Accurate (under 60; they were 45 and 90), shared by the subject walk, the in-grade stage, the earlier-grade gap
 * scan and the quick check. Stated on its own because the stage clocks do not add up to it: Accurate leaves 3
 * minutes for the gap scan. QUICK STAYS AT 20: the owner's limit is under 5, but the best Quick this branch could
 * build (short questions first, clock-bound) places only 82% (math) to 95% (act) within one grade in 5 minutes,
 * under the 90% bar on four subjects, so it was not shipped (docs/ONBOARDING-MODES.md section 4, simulated).
 */
const WHOLE_MINUTES = { quick: 14, balanced: 20, accurate: 57 };

/**
 * When the clock ends a walk. It ends it once the clock has run out AND the mode's minimum has been answered (a learner who
 * stepped away mid-quiz was once stopped after 4 answers and placed three grades up, owner, 2026-10-29). A mode whose minimum
 * cannot be met in its clock (long reading passages at 60 seconds a question) would never stop, so a walk also ends at
 * HARD_STOP times the clock once HARD_FLOOR answers are in: the learner who stepped away has at least those 8 answers behind
 * them, and nobody is kept 60% past the owner's limit for the sake of a count.
 */
const HARD_STOP = 1.25;
const HARD_FLOOR = 8;
function clockEnded(mode, span, answeredCount, elapsedMs, clockMs) {
  if (!(elapsedMs >= clockMs)) return false;
  return answeredCount >= limits(mode, span).min || (elapsedMs >= clockMs * HARD_STOP && answeredCount >= HARD_FLOOR);
}

const MODES = {
  // Quick was 28 / 12 / 0.90; on calibrated questions, against the stricter of
  // two judges, that missed 2-5 testers in 256, and 32 / 18 / 0.94 missed 0-1.
  // 2026-11-03: Balanced and Accurate are re-fitted to the owner's limits by shortening the CLOCKS only; the question caps, the stop rule and every
  // gate that measures them are as they were. Quick keeps its 14 minutes (see WHOLE_MINUTES). Every mode asks short questions first
  // (`shortFirst`, nextBlock `fast`): among the questions near the belief's middle it takes the quickest, which keeps the accuracy and saves
  // minutes (docs/ONBOARDING-MODES.md section 4, simulated, seconds estimated from word counts: services/placement-seconds.js).
  // A mode with `noLift` gets no span-based lift of its minimum (see limits); none ships with it, it is how the sim tried a 5-minute Quick.
  quick: { max: 30, min: 8, sure: 0.94, confidence: 0.97, minutes: 6, shortFirst: true, noLift: true },
  balanced: { max: 70, min: 16, sure: 0.97, confidence: 0.97, minutes: 12, shortFirst: true },
  accurate: { max: 130, min: 24, sure: 0.995, confidence: 0.99, minutes: 40, shortFirst: true },
};

/** The chance the walk assumes of a right answer from someone at `x`, on a question written for `pos`. */
function assumed(x, pos, guess, shape = {}, idk = false) {
  const width = shape.width ?? WIDTH;
  const reliable = shape.reliable ?? RELIABLE;
  // Someone who presses "I don't know" has not guessed, so there is no luck to allow for: the press says more about
  // not knowing than a wrong answer does. It is M7's guessing floor taken to zero for an answer that cannot be a lucky
  // guess (01-M7); that reading is UNVERIFIED (docs/yc/SOURCES-TO-VERIFY.md) and proven only on simulated learners.
  const luck = idk ? 0 : Math.min(0.6, guess + LUCK);
  return luck + (1 - SLIP - luck) / (1 + Math.exp(-(x - pos + reliable) / width));
}

/**
 * The belief after these answers. `answered` is a list of
 * {pos, guess, correct}; `span` is how many grades (or units) the subject has.
 * `shape` overrides the slope's width and reliable shift (in the same steps as
 * `span`): a unit is a much smaller step than a grade.
 */
function posterior(span, answered, shape) {
  const grid = [];
  for (let x = 0; x <= span + 1e-9; x += STEP) grid.push(Math.round(x * 100) / 100);
  const logp = grid.map((x) => answered.reduce((sum, a) => {
    const p = assumed(x, a.pos, a.guess, shape, a.idk);
    return sum + Math.log(a.correct ? p : 1 - p);
  }, 0));
  const top = Math.max(...logp);
  const w = logp.map((l) => Math.exp(l - top));
  const total = w.reduce((a, b) => a + b, 0);
  return { grid, w: w.map((v) => v / total) };
}

function median(post) {
  let acc = 0;
  for (let i = 0; i < post.grid.length; i++) {
    acc += post.w[i];
    if (acc >= 0.5) return post.grid[i];
  }
  return post.grid[post.grid.length - 1];
}

/** The point below which a share `p` of the belief lies (median is p = 0.5). */
function quantile(post, p) {
  let acc = 0;
  for (let i = 0; i < post.grid.length; i++) {
    acc += post.w[i];
    if (acc >= p) return post.grid[i];
  }
  return post.grid[post.grid.length - 1];
}

/** The belief restricted to positions at or above `lo`, renormalised. */
function atLeast(post, lo) {
  const w = post.w.map((v, i) => (post.grid[i] >= lo ? v : 0));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  return { grid: post.grid, w: w.map((v) => v / total) };
}

function massWithin(post, lo, hi) {
  return post.grid.reduce((sum, x, i) => (x >= lo && x <= hi ? sum + post.w[i] : sum), 0);
}

/**
 * A grade's questions as blocks: the core (two easy, two medium) and the top
 * (two hard, the capstone). A block is what one screen asks before the walk
 * thinks again; it keeps a grade's questions in the order they were written.
 */
/**
 * A question's identity for calibration: its text, its answer and its options
 * (sorted, because the order they are shown in is shuffled per grade). The same
 * key the simulated testers' judges file their verdicts under.
 */
function questionKey(q) {
  // eslint-disable-next-line global-require
  return require('crypto').createHash('sha1')
    .update(`${q.prompt}\u0000${q.answer}\u0000${(q.choices || []).slice().sort().join('\u0001')}`)
    .digest('hex').slice(0, 16);
}

/**
 * Where a question sits, in grades from the start of the subject: its calibrated
 * point when it has one (where the judges found it really sits, attached by
 * services/subject-placement.js), otherwise where its band says it was written for.
 */
function positionOf(question, gradeIndex) {
  return Number.isFinite(question && question.pos) ? question.pos : gradeIndex + (BAND_AT[question && question.band] ?? 0.5);
}

function blocksFor(sets) {
  const blocks = [];
  sets.forEach((questions, g) => {
    // One question per screen: the walk re-aims after every answer. Measured on
    // simulated testers against the stricter of two judges, against the grade's
    // core-then-top halves: Math Quick 382 vs 357 of 392 within a grade, English
    // and Reading 128 of 128 in every mode, and fewer questions asked.
    // ADAPTIVE_BLOCK=0 restores the halves.
    const size = Number(process.env.ADAPTIVE_BLOCK ?? 1);
    if (size) {
      const order = (questions || []).map((q, i) => i).sort((x, y) => positionOf(questions[x], g) - positionOf(questions[y], g));
      for (let k = 0; k < order.length; k += size) {
        const idx = order.slice(k, k + size).sort((x, y) => x - y);
        const pos = idx.reduce((s, i) => s + positionOf(questions[i], g), 0) / idx.length;
        // `sec`: what the block is estimated to take (services/placement-seconds.js), when its questions carry it.
        const secs = idx.map((i) => questions[i].sec);
        // `guess`: the chance a blind guess is right on the block's questions (the information pick needs it).
        const guess = idx.reduce((n, i) => n + (Array.isArray(questions[i].choices) && questions[i].choices.length ? 1 / questions[i].choices.length : 0.02), 0) / idx.length;
        blocks.push({ grade: g, part: `b${k / size}`, idx, pos, guess, ...(secs.every(Number.isFinite) ? { sec: secs.reduce((a, b) => a + b, 0) } : {}) });
      }
      return;
    }
    const core = [];
    const top = [];
    (questions || []).forEach((q, i) => (['hard', 'capstone'].includes(q.band) ? top : core).push(i));
    for (const idx of [core, top]) {
      if (!idx.length) continue;
      const pos = idx.reduce((s, i) => s + positionOf(questions[i], g), 0) / idx.length;
      blocks.push({ grade: g, part: idx === core ? 'core' : 'top', idx, pos });
    }
  });
  return blocks;
}

/**
 * How far from the target, in grades, a question may sit before its length stops being worth it: a question this far
 * off tells the walk about as much as one half as far away does in half the time (see nextBlock `fast`).
 */
const FAST_W = Number(process.env.ADAPTIVE_FAST_W ?? 0.5);

/**
 * The next block: the unasked one written nearest the middle of the belief.
 *
 * `fast` (Quick, which is bound by a clock and not by a count): the cost of a question is its seconds, so among the blocks
 * near the target the one that is quickest is preferred. The score is seconds times (1 + (distance / FAST_W)^2), the
 * seconds per unit of what a question this far from the belief's middle can still tell; a block with no estimate counts
 * as FAST_DEFAULT_SEC. With every block the same length it picks the same block as the plain rule.
 */
const FAST_DEFAULT_SEC = 26;
function nextBlock(blocks, asked, target, { fast = false } = {}) {
  const done = new Set(asked.map((b) => `${b.grade}:${b.part}`));
  const cost = (b) => (Number.isFinite(b.sec) ? b.sec : FAST_DEFAULT_SEC) * (1 + ((b.pos - target) / FAST_W) ** 2);
  let best = null;
  for (const b of blocks) {
    if (done.has(`${b.grade}:${b.part}`)) continue;
    if (!best) { best = b; continue; }
    if (fast ? cost(b) < cost(best) : Math.abs(b.pos - target) < Math.abs(best.pos - target)) best = b;
  }
  return best;
}

/**
 * The information pick. Of the unasked blocks nearest the target (the gallop-limited middle of the belief, see nextTarget), take
 * the one whose answer is expected to leave the belief narrowest: smallest expected entropy, per second of the block's estimated
 * time when `fast` (a clock-bound mode spends seconds, not questions). A block with no estimate counts as FAST_DEFAULT_SEC. This
 * is the question that separates the grades the belief still cannot tell apart, rather than the one nearest the middle: at the
 * middle of a belief a question is answered right with about even odds by someone just below or just above it, so the
 * nearest question to the middle is not always the most telling one. ADAPTIVE_INFO=0 restores nextBlock's rule.
 */
const INFO = process.env.ADAPTIVE_INFO !== '0';
const INFO_NEAR = Number(process.env.ADAPTIVE_INFO_NEAR || 20);
const entropyOf = (w) => { let h = 0; for (let i = 0; i < w.length; i++) if (w[i] > 1e-12) h -= w[i] * Math.log(w[i]); return h; };

function nextBlockByInfo(blocks, asked, target, post, { fast = false, shape = {} } = {}) {
  const done = new Set(asked.map((b) => `${b.grade}:${b.part}`));
  const open = blocks.filter((b) => !done.has(`${b.grade}:${b.part}`));
  if (!open.length) return null;
  open.sort((a, b) => Math.abs(a.pos - target) - Math.abs(b.pos - target));
  const now = entropyOf(post.w);
  let best = null;
  for (const b of open.slice(0, INFO_NEAR)) {
    const guess = Number.isFinite(b.guess) ? b.guess : 0.25;
    const pr = post.grid.map((x, i) => assumed(x, b.pos, guess, shape));
    let zr = 0; let zw = 0;
    for (let i = 0; i < pr.length; i++) { zr += post.w[i] * pr[i]; zw += post.w[i] * (1 - pr[i]); }
    const wr = post.w.map((v, i) => (zr > 0 ? (v * pr[i]) / zr : 0));
    const ww = post.w.map((v, i) => (zw > 0 ? (v * (1 - pr[i])) / zw : 0));
    const expected = zr * entropyOf(wr) + zw * entropyOf(ww);
    const sec = fast ? (Number.isFinite(b.sec) ? b.sec : FAST_DEFAULT_SEC) : 1;
    const score = (now - expected) / sec;
    if (!best || score > best.score) best = { block: b, score };
  }
  return best ? best.block : null;
}

/** The block to ask next: by information once there is a belief to narrow, else the one nearest the target (nextBlock). */
function chooseBlock(blocks, asked, target, post, answeredCount, opts = {}) {
  if (INFO && answeredCount > 0 && post) {
    const b = nextBlockByInfo(blocks, asked, target, post, opts);
    if (b) return b;
  }
  return nextBlock(blocks, asked, target, opts);
}

/**
 * Where the walk aims before anything is answered: the easiest question of the grade the learner picked, or the
 * very start of the subject. It used to aim a third of the way in, so a beginner who said "Not sure" opened on
 * subjunctive or calculus (owner, 2026-10-28: "insanely hard questions"). ADAPTIVE_START=third restores it.
 */
function firstTarget(span, startHint) {
  if (Number.isFinite(startHint)) return startHint + BAND_AT.easy;
  return process.env.ADAPTIVE_START === 'third' ? span / 3 : 0;
}

/**
 * Where the walk aims next: the middle of the belief, but never more than a gallop above the hardest question
 * answered right so far. The gallop is 1 grade after a right answer, then 2, 4, 8 ... while the right answers
 * keep coming, and half a grade straight after a miss. A beginner only meets questions just past what they have
 * shown they know, and one lucky guess no longer throws them to the middle of the subject; a strong learner still
 * reaches the top of a 57-grade subject in about six right answers. Moving down is never limited.
 * ADAPTIVE_GALLOP=0 restores the plain median.
 */
function nextTarget(answered, post, ctx = {}) {
  const m = median(post);
  const span = post.grid[post.grid.length - 1];
  if (ctx.topLeft > 0 && ceilingCandidate(span, answered, post)) return span - 1;
  if (process.env.ADAPTIVE_GALLOP === '0') return m;
  const right = answered.filter((a) => a.correct);
  if (!right.length) return Math.min(m, 0);
  let streak = 0;
  for (let i = answered.length - 1; i >= 0 && answered[i].correct; i--) streak++;
  const top = Math.max(...right.map((a) => a.pos));
  return Math.min(m, top + (streak ? 2 ** (streak - 1) : 0.5));
}

/**
 * A mode's limits for a subject of `span` grades. Quick grows with the subject:
 * a fixed budget that settles a 16-grade subject left a 49-grade one stopping on
 * a run of lucky guesses (Math Quick 582 of 588 testers within a grade; with this,
 * 586, at about 29 questions on average). The clock still bounds it.
 */
function limits(mode, span) {
  const cfg = MODES[mode];
  const scale = Number(process.env.ADAPTIVE_QUICK_SCALE ?? 1.5);
  if (mode !== 'quick' || !scale || cfg.noLift) return cfg;
  return { ...cfg, min: cfg.min + Math.floor((span * scale) / 8), max: cfg.max + Math.floor((span * scale) / 12) };
}

// A learner who knows nothing gets nothing right on the easiest questions of the subject. After this many answers,
// with nearly all the belief inside the first grade, the walk stops: there is no more to learn by asking a beginner
// twenty questions. ADAPTIVE_FLOOR=0 turns it off.
const FLOOR_MIN = Number(process.env.ADAPTIVE_FLOOR ?? 6);
const FLOOR_SURE = 0.95;

/** Is the learner at the very start of the subject, sure enough to stop early? */
function atFloor(answered, post) {
  if (!FLOOR_MIN || answered.length < FLOOR_MIN) return false;
  return massWithin(post, 0, 1) >= FLOOR_SURE;
}

/**
 * The ceiling: a learner who knows everything has to be placed at the top, not left mid-way by one slip or a run
 * of misses on a thin top end (06-M3: placement is a measurement, so the end of the scale is measured too, with
 * enough items to tell). The top region is the last two grades. A learner is a ceiling candidate once the middle
 * of the belief is within three grades of the end; a candidate is not placed or stopped until the region's items
 * have been asked, and is placed at the top when at least three of them were answered and no more than a quarter
 * missed (one slip allowed from four). Guessing three of three on four choices is under 2%. Where the region has
 * fewer than three items nothing can be proven, and the subject is listed as a content gap (docs/night/PLACEMENT.md).
 * ADAPTIVE_CEILING=0 restores the plain belief.
 */
const CEILING = { region: 2, near: 3, min: 3 };

function ceilingProof(span, answered) {
  const top = answered.filter((a) => a.pos >= span - CEILING.region);
  const wrong = top.filter((a) => !a.correct).length;
  const proven = process.env.ADAPTIVE_CEILING !== '0' && top.length >= CEILING.min && wrong <= Math.floor(top.length / 4);
  return { asked: top.length, wrong, proven };
}

/**
 * Is the top proven for this belief? The count of top-region answers alone is not enough: a learner far below the
 * top who runs out of questions in Accurate mode reaches the top items last and can pass 3 of 4 by luck (about 5%),
 * which used to place a grade-6 learner at the last grade. The proof only stands when the belief itself puts the
 * learner near the end (the same "candidate" window), so lucky top answers cannot overrule a long record of misses.
 */
function topProven(span, answered, post) {
  return ceilingProof(span, answered).proven && median(post) >= span - CEILING.near;
}

/** True when the belief's middle is near the end and the top has not been proven yet. */
function ceilingCandidate(span, answered, post) {
  return process.env.ADAPTIVE_CEILING !== '0' && median(post) >= span - CEILING.near && !ceilingProof(span, answered).proven;
}

/** How many of the top region's items are still unasked (`blocks`, `asked` as in nextBlock). */
function topLeft(span, blocks, asked) {
  const seen = new Set(asked.map((b) => `${b.grade}:${b.part}`));
  return blocks.filter((b) => b.pos >= span - CEILING.region && !seen.has(`${b.grade}:${b.part}`)).reduce((n, b) => n + b.idx.length, 0);
}

/**
 * Precision stop (06-M3: a placement is a measurement with a stated error, so the walk stops on that error, not on a
 * count). The standard error is the spread of the belief; the walk may stop once it is under SE_MAX grades and at least
 * CONFIRM answers sit within CONFIRM_NEAR grades of the belief's middle, so the boundary itself has been tested and
 * not only inferred from items far above and below it. ADAPTIVE_SE_MAX=0 turns the extra stop condition off.
 */
const SE_MAX = Number(process.env.ADAPTIVE_SE_MAX ?? 0.6);
const CONFIRM = 2;
const CONFIRM_NEAR = 0.75;

function standardError(post) {
  const mean = post.grid.reduce((s, x, i) => s + x * post.w[i], 0);
  return Math.sqrt(post.grid.reduce((s, x, i) => s + post.w[i] * (x - mean) ** 2, 0));
}

function confirmed(answered, post) {
  const m = median(post);
  return answered.filter((a) => Math.abs(a.pos - m) <= CONFIRM_NEAR).length >= CONFIRM;
}

/**
 * Should the walk stop here? `ctx.topLeft` is the count of unasked top-region items (see topLeft); when given, a
 * ceiling candidate keeps going until the top is proven or its items run out, and a proven top may stop at the minimum.
 */
function done(mode, answered, post, ctx = {}) {
  const cfg = limits(mode, post.grid[post.grid.length - 1]);
  if (answered.length >= cfg.max) return true;
  if (atFloor(answered, post)) return true;
  if (answered.length < cfg.min) return false;
  const span = post.grid[post.grid.length - 1];
  if (topProven(span, answered, post)) return true;
  if (ctx.topLeft > 0 && ceilingCandidate(span, answered, post)) return false;
  const m = median(post);
  if (STOP === 'within1' && Number.isFinite(cfg.confidence)) {
    // Stop on the error the walk is held to: the share of the belief that puts the true grade within one of the recommended one,
    // and, as before, only once the boundary itself has been tested (CONFIRM answers near the belief's middle).
    if (!confirmed(answered, post)) return false;
    // At either end of the scale half of the within-one window lies outside it, so confidence there is cheap, while the product
    // wants a beginner placed at the very start and a learner who knows everything at the very end. Near an end the walk needs END_MIN answers.
    const r = recommend(span, post, answered).index;
    if ((r <= 1 || r >= span - 2) && answered.length < END_MIN) return false;
    return withinOneGrade(span, post, answered) >= cfg.confidence;
  }
  if (SE_MAX && (standardError(post) > SE_MAX || !confirmed(answered, post))) return false;
  return massWithin(post, m - 1, m + 1) >= cfg.sure;
}

/**
 * The share of the belief in which the true grade lies within one of the recommended grade R: the learner's real grade is
 * floor(position), so that is the positions in [R - 1, R + 2). ADAPTIVE_STOP=legacy keeps the earlier stop rule (`sure`).
 */
const STOP = process.env.ADAPTIVE_STOP || 'within1';
const END_MIN = Number(process.env.ADAPTIVE_END_MIN || 14);
function withinOneGrade(span, post, answered) {
  const r = recommend(span, post, answered).index;
  return massWithin(post, r - 1, r + 2 - 1e-9);
}

/**
 * How much of the belief sits in each grade: the walk's own probability that
 * the learner's frontier is in that grade, which is the probability that it is
 * the right grade to start. The grid's last point (the very end of the subject)
 * counts toward the last grade. Sums to 1.
 */
function gradeMass(span, post) {
  const mass = new Array(span).fill(0);
  post.grid.forEach((g, i) => { mass[Math.max(0, Math.min(span - 1, Math.floor(g)))] += post.w[i]; });
  return mass;
}

/**
 * Whole percents that add up to exactly 100 (largest remainder), so a page that
 * lists every grade shows a total of 100, not 99 or 101. A grade with almost no
 * belief reads 0.
 */
function wholePercents(mass) {
  const total = mass.reduce((a, b) => a + b, 0) || 1;
  const raw = mass.map((m) => (100 * m) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++;
  return out;
}

/**
 * The recommendation. For every grade, the probability (0-100, adding up to
 * 100) that it is the right one to start in: its share of the belief. The
 * recommended grade is the most probable one, so the grade the page calls
 * "recommended" is always the one with the highest percentage (the owner's
 * rule: "start at the highest percentage recommendation grade").
 * ADAPTIVE_PICK=median restores the old pick, the grade the middle of the
 * belief falls in; the two differ only when the belief straddles a grade
 * boundary, and then by one grade.
 *
 * `percents` is kept for older pages: each grade's share scaled so the
 * strongest reads 100.
 */
function recommend(span, post, answered) {
  const x = median(post);
  // A proven top conditions the belief on the evidence: the learner is in the upper grade and a half.
  const proven = !!answered && topProven(span, answered, post);
  const mass = gradeMass(span, proven ? atLeast(post, span - 1.5) : post);
  const best = mass.reduce((b, m, i) => (m > mass[b] ? i : b), 0);
  const middle = Math.max(0, Math.min(span - 1, Math.floor(x)));
  const index = process.env.ADAPTIVE_PICK === 'median' ? middle : best;
  const top = Math.max(...mass) || 1;
  const sure = massWithin(post, x - 1, x + 1);
  return {
    index,
    position: x,
    middle,
    percents: mass.map((m) => Math.round((m / top) * 100)),
    probabilities: wholePercents(mass),
    mass,
    sure,
  };
}

module.exports = {
  questionKey, positionOf, BAND_AT, MODES, WHOLE_MINUTES, clockEnded, HARD_STOP, HARD_FLOOR, assumed, posterior, median, quantile, massWithin, blocksFor, nextBlock, chooseBlock, nextBlockByInfo, withinOneGrade, firstTarget, nextTarget, done, limits,
  gradeMass, wholePercents, recommend, CEILING, ceilingProof, topProven, standardError, confirmed, SE_MAX, ceilingCandidate, topLeft,
};
