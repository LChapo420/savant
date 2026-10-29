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
 * Each mode's whole placement budget, in minutes: the owner's limits (Quick 20 at
 * most, Accurate 90 at most), shared by the subject walk, the in-grade stage, the
 * earlier-grade gap scan and the quick check. Stated on its own because the stage
 * clocks no longer add up to it: Accurate leaves 8 minutes for the gap scan.
 */
const WHOLE_MINUTES = { quick: 20, balanced: 45, accurate: 90 };

const MODES = {
  // Quick was 28 / 12 / 0.90; on calibrated questions, against the stricter of
  // two judges, that missed 2-5 testers in 256, and 32 / 18 / 0.94 missed 0-1.
  quick: { max: 32, min: 18, sure: 0.94, minutes: 14 },
  balanced: { max: 70, min: 20, sure: 0.97, minutes: 32 },
  // Accurate was 160 questions / 65 minutes. Capped at 130 / 57 it places the
  // same testers exactly as well (588 of 588 math within one grade, 410 exact),
  // and the 8 minutes it frees go to the earlier-grade gap scan, which had almost
  // none left in math (missed gaps 2.3% -> 1.0% in scripts/gap-path-sim.js).
  accurate: { max: 130, min: 40, sure: 0.995, minutes: 57 },
};

/** The chance the walk assumes of a right answer from someone at `x`, on a question written for `pos`. */
function assumed(x, pos, guess, shape = {}) {
  const width = shape.width ?? WIDTH;
  const reliable = shape.reliable ?? RELIABLE;
  const luck = Math.min(0.6, guess + LUCK);
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
    const p = assumed(x, a.pos, a.guess, shape);
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
        blocks.push({ grade: g, part: `b${k / size}`, idx, pos });
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

/** The next block: the unasked one written nearest the middle of the belief. */
function nextBlock(blocks, asked, target) {
  const done = new Set(asked.map((b) => `${b.grade}:${b.part}`));
  let best = null;
  for (const b of blocks) {
    if (done.has(`${b.grade}:${b.part}`)) continue;
    if (!best || Math.abs(b.pos - target) < Math.abs(best.pos - target)) best = b;
  }
  return best;
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
function nextTarget(answered, post) {
  const m = median(post);
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
  if (mode !== 'quick' || !scale) return cfg;
  return { ...cfg, min: cfg.min + Math.floor((span * scale) / 8), max: cfg.max + Math.floor((span * scale) / 12) };
}

/** Should the walk stop here? */
function done(mode, answered, post) {
  const cfg = limits(mode, post.grid[post.grid.length - 1]);
  if (answered.length >= cfg.max) return true;
  if (answered.length < cfg.min) return false;
  const m = median(post);
  return massWithin(post, m - 1, m + 1) >= cfg.sure;
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
function recommend(span, post) {
  const x = median(post);
  const mass = gradeMass(span, post);
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
  questionKey, positionOf, BAND_AT, MODES, WHOLE_MINUTES, assumed, posterior, median, quantile, massWithin, blocksFor, nextBlock, firstTarget, nextTarget, done, limits,
  gradeMass, wholePercents, recommend,
};
