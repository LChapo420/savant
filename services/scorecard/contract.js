/**
 * The scorecard's insertion contract: the one versioned object anything that
 * changes a lesson or a curriculum reads from the scorecard.
 *
 *   const contract = require('./services/scorecard/contract');
 *   const c = contract.read(userId, { trackId, gradeId });
 *   contract.assertCompatible(c, 1);          // throws on a different major version
 *
 * What it carries (docs/SCORECARD.md, "The insertion contract"):
 *
 *   lesson.directives   every confident lesson directive, ranked, each with the
 *                       gate that passed it, its posterior probability and the
 *                       evidence it rests on (translate.directives, uncapped)
 *   lesson.sides        {stat: 'high'|'low'}: the same list with combined
 *                       instructions split back into their parts
 *   lesson.promptLines  the text a lesson writer gets: at most MAX_DIRECTIVES
 *                       instructions under one heading, or nothing at all
 *   coach.promptLines   the coach's block (use 'C', at most 8)
 *   structure           what the confident sides change in a plan's structure
 *                       (guidance, length, items, stretch, support, typed answers,
 *                       interest context, recap), from KNOBS
 *   memory              the forgetting curve to time reviews with
 *                       (scorecard.forgettingCurve; DEFAULT_CURVE until fitted)
 *   privacy             what may go to a model and what may not
 *
 * Every consumer reads the same object, so they cannot disagree: adaptation's
 * plan (structure, memory), block levels and the level editor (lesson.promptLines,
 * through the details brief), lesson-writing prompts (`GET /api/scorecard/prompt-block`),
 * the coach (coach.promptLines) and path planning (memory; never a skip). The
 * adapters below give each consumer exactly what it reads today, and
 * scripts/scorecard-contract-test.js checks they match what each consumer
 * actually builds.
 *
 * Rules the contract keeps whatever a consumer does with it:
 *   - Only measured evidence passes (translate's calibrated gate). Nothing a
 *     model read suggested, and nothing the questionnaire nudged, steers.
 *   - No numbers about the learner go into model-facing text. Prompt lines are
 *     fixed, hand-written sentences from stats.js; the choice of sentences is
 *     still personal data (it says something about the learner), so they go
 *     only to providers allowed learner data.
 *   - Never a skip. A scorecard reading never marks a unit known or removes an
 *     objective: what a grade must cover is coverage.js and learner-path.js,
 *     on bank evidence only. The contract has no field that could say so.
 *   - It never throws. Any failure returns status 'fallback': no directives,
 *     no structure change, the default forgetting curve, i.e. what a brand-new
 *     learner gets.
 */
const NAME = 'savant.scorecard.insertion';
const VERSION = '1.0.0';
const MAJOR = 1;

// What each confident side changes in a plan's structure. The canonical copy;
// services/adaptation.js DIRECTIVE_KNOBS must equal it (checked by
// scripts/scorecard-contract-test.js) until adaptation reads it from here.
// Only these stats move structure; every other confident directive reaches the
// writer as text and moves nothing else.
//
// Evidence article 03 (2026-10-25), each with an off switch:
//   P1 SCORECARD_DROP_RUSH_TYPED (on): rush_tendency high no longer switches to
//      typed answers. No study tests answer format against rushing (smith2014,
//      kang2007, little2012, greving2018); the effort monitor handles rushers.
//      Off puts back rush_tendency: { high: { typed: true } }.
//   P2 SCORECARD_SOFT_STRETCH (on): challenge_appetite high adds +0.05 stretch
//      (was +0.1) and the stretch share is clamped at 0.25 (was 0.35): the human
//      studies favour high success (jansen2013, eglington2020, lomas2013/2017).
// KNOBS is the default (both on); knobsNow() is what is in force.
const KNOBS = {
  prior_knowledge: { high: { guidance: -1 }, low: { guidance: +1 } },
  scaffolding_fade: { high: { guidance: -1 }, low: { guidance: +1 } },
  brevity_preference: { high: { length: -1 }, low: { length: +1 } },
  processing_velocity: { high: { length: -1, items: +0.2 }, low: { items: -0.2 } },
  challenge_appetite: { high: { stretch: +0.05 }, low: { stretch: -0.05, support: +0.05 } },
  frustration_threshold: { low: { support: +0.1, stretch: -0.05 } },
  persistence: { low: { items: -0.2 } },
  attention_runway: { low: { items: -0.25, length: -1 }, high: { items: +0.15 } },
  interest_transfer: { high: { context: 'interests' } },
  consolidation_need: { high: { recap: true } },
};

function flagOn(name) {
  return String(process.env[name] || 'on').toLowerCase() !== 'off';
}

/** The structure knobs in force: KNOBS, with P1 and P2 undone when switched off. */
function knobsNow() {
  const k = JSON.parse(JSON.stringify(KNOBS));
  if (!flagOn('SCORECARD_SOFT_STRETCH')) k.challenge_appetite.high.stretch = 0.1;
  if (!flagOn('SCORECARD_DROP_RUSH_TYPED')) {
    // Keep the old key order, so the off state is exactly the old table.
    const out = {};
    for (const [stat, v] of Object.entries(k)) {
      if (stat === 'interest_transfer') out.rush_tendency = { high: { typed: true } };
      out[stat] = v;
    }
    return out;
  }
  return k;
}

/** The highest stretch share a session or plan may get (P2: 0.25; 0.35 with SCORECARD_SOFT_STRETCH=off). */
function stretchMax() {
  return flagOn('SCORECARD_SOFT_STRETCH') ? 0.25 : 0.35;
}

const LESSON_HEADING = 'HOW THEY LEARN BEST (measured from their behavior by the learning scorecard, most important first)';
const COACH_HEADING = "FROM THIS LEARNER'S MEASURED SCORECARD";
const COACH_MAX = 8;

const PRIVACY = Object.freeze({
  learner_numbers_in_model_text: false,
  model_safe: ['lesson.promptLines', 'coach.promptLines'],
  internal_only: ['lesson.directives', 'lesson.sides', 'structure', 'memory', 'population'],
  never_included: ['scores', 'measured scores', 'evidence log', 'survey answers', 'free text', 'email', 'name'],
  providers: 'prompt lines are personal data in aggregate (they describe the learner): send them only to providers allowed learner data, never to build-pipeline-only providers',
  retention: 'the contract is computed on read and never stored',
});

function blankStructure() {
  return { guidance: 0, length: 0, items: 0, stretch: 0, support: 0, typed: false, context: null, recap: false, changes: [] };
}

/** What the confident sides change, summed, with the list of changes behind it. */
function structureFrom(sides) {
  const out = blankStructure();
  const knobs = knobsNow();
  for (const [stat, side] of Object.entries(sides || {})) {
    const change = knobs[stat] && knobs[stat][side];
    if (!change) continue;
    out.changes.push({ stat, side, change: { ...change } });
    for (const [k, v] of Object.entries(change)) {
      if (typeof v === 'number') out[k] = Number((out[k] + v).toFixed(4));
      else out[k] = v;
    }
  }
  return out;
}

/** {stat: side} from a directive list, combined instructions split into their parts. */
function sidesFrom(list) {
  const out = {};
  for (const d of list || []) {
    if (d.side === 'high' || d.side === 'low') out[d.stat] = d.side;
    else if (d.parts) {
      // eslint-disable-next-line global-require
      const { COMBINED } = require('./translate');
      const row = COMBINED.find(([a, , b]) => a === d.parts[0] && b === d.parts[1]);
      if (row) { out[row[0]] = row[1]; out[row[2]] = row[3]; }
    }
  }
  return out;
}

function lessonLines(card, list) {
  if (!list.length) return [];
  // eslint-disable-next-line global-require
  const translate = require('./translate');
  return [LESSON_HEADING, `- ${translate.certaintyNote(card, list)}`,
    ...list.map((d, i) => `${i + 1}. ${d.strong ? '(strong) ' : ''}${d.text}`)];
}

function coachLines(list) {
  return list.length ? [`${COACH_HEADING}\n${list.map((d) => `- ${d.text}`).join('\n')}`] : [];
}

function publicDirective(d) {
  return {
    stat: d.stat,
    name: d.name,
    side: d.side,
    ...(d.parts ? { parts: d.parts.slice(), sides: (d.sides || []).slice() } : {}),
    text: d.text,
    strong: !!d.strong,
    gate: d.gate || 'score',
    p: d.p === undefined ? null : d.p,
    confidence: d.confidence,
    evidence: d.evidence || null,
    priority: Number((d.priority || 0).toFixed(4)),
  };
}

function defaultMemory() {
  // eslint-disable-next-line global-require
  const forgetting = require('./forgetting');
  return { curve: { ...forgetting.DEFAULT_CURVE }, fitted: false, source: 'default', m: 0, mSd: null, mSource: 'none', norm: 0, cap: forgetting.CAP || 15, steers: false };
}

function envelope(where, status) {
  return {
    contract: NAME,
    version: VERSION,
    status,
    learner: { userId: where.userId || null, trackId: where.trackId || null, gradeId: where.gradeId || null },
    generated_at: new Date().toISOString(),
    population: { standing_used: false },
    lesson: { directives: [], sides: {}, certainty: null, promptLines: [], promptText: '', max: null },
    coach: { directives: [], promptLines: [] },
    structure: blankStructure(),
    memory: defaultMemory(),
    privacy: PRIVACY,
  };
}

/**
 * The contract for one learner, for one subject.
 *
 * @param {number} userId
 * @param {object} [opts]
 * @param {string} [opts.trackId]       the subject; per-subject stats read it
 * @param {string} [opts.gradeId]       carried through for the consumer
 * @param {boolean} [opts.hasInterests] defaults to learner.hasStatedInterests
 * @param {object} [opts.card]          a scorecard already read (scorecard.get)
 * @param {boolean} [opts.memory=true]  include the fitted forgetting curve
 * @returns {object} never throws
 */
function read(userId, { trackId = null, gradeId = null, hasInterests, card = null, memory = true } = {}) {
  const where = { userId, trackId, gradeId };
  if (!userId && !card) return envelope(where, 'empty');
  // The owner gets the base product (config/owner.js ownerBase; OWNER_BASE=off
  // lifts it): what a brand-new learner gets, whatever the card says.
  try {
    // eslint-disable-next-line global-require
    if (userId && require('../../config/owner').ownerBase(userId)) return { ...envelope(where, 'empty'), owner_base: true };
  } catch { /* read on */ }
  try {
    /* eslint-disable global-require */
    const scorecard = require('./index');
    const translate = require('./translate');
    /* eslint-enable global-require */
    const sc = card || scorecard.get(userId);
    let interests = hasInterests;
    if (interests === undefined) {
      try {
        // eslint-disable-next-line global-require
        interests = require('../learner').hasStatedInterests(userId);
      } catch {
        interests = false;
      }
    }
    const all = translate.directives(sc, { use: 'L', trackId, hasInterests: interests, max: Infinity });
    const capped = all.slice(0, translate.MAX_DIRECTIVES);
    const coach = translate.directives(sc, { use: 'C', hasInterests: interests, max: COACH_MAX });
    const out = envelope(where, all.length || coach.length ? 'ok' : 'empty');
    out.population = { standing_used: all.some((d) => d.gate === 'standing') };
    out.lesson.directives = all.map(publicDirective);
    out.lesson.sides = sidesFrom(all);
    out.lesson.certainty = capped.length ? translate.certaintyNote(sc, capped) : null;
    out.lesson.promptLines = lessonLines(sc, capped);
    out.lesson.promptText = out.lesson.promptLines.join('\n');
    out.lesson.max = translate.MAX_DIRECTIVES;
    out.coach.directives = coach.map(publicDirective);
    out.coach.promptLines = coachLines(coach);
    out.structure = structureFrom(out.lesson.sides);
    if (memory) {
      try {
        const rc = scorecard.forgettingCurve({ userId: userId || null, trackId });
        if (rc && rc.curve && Number.isFinite(rc.curve.a)) out.memory = { ...rc, steers: false };
      } catch { /* the default curve stays */ }
    }
    return out;
  } catch (err) {
    const out = envelope(where, 'fallback');
    out.error = String(err && err.message ? err.message : err).slice(0, 200);
    return out;
  }
}

// ── adapters: exactly what each consumer reads today ──────────────────────
/** adaptation.planForLevel: the sides decide() takes, and the curve it times reviews with. */
function forAdaptation(c) {
  return { sides: { ...c.lesson.sides }, curve: c.memory && c.memory.fitted ? c.memory : null, structure: c.structure };
}
/** details.brief / personalize.scorecardSection (recent: false): the lesson writer's lines. */
function forPrompt(c) {
  return c.lesson.promptLines.slice();
}
/** learner.teachingBrief: the coach's block. */
function forCoach(c) {
  return c.coach.promptLines.slice();
}
/** learner.sessionParams: what a session's size and mix may move by (gated, unlike its raw stat reads). */
function forSession(c) {
  const s = c.structure;
  return { items: s.items, support: s.support, stretch: s.stretch, typed: s.typed };
}
/** Path planning (learner-path, adaptation's review queue): the curve only; never a skip. */
function forPath(c) {
  return { curve: c.memory, skip: false };
}

/** Throws unless `c` is this contract at the given major version. */
function assertCompatible(c, major = MAJOR) {
  if (!c || c.contract !== NAME) throw new Error('not a scorecard insertion contract');
  const m = Number(String(c.version).split('.')[0]);
  if (m !== Number(major)) throw new Error(`scorecard contract v${c.version}, consumer expects v${major}`);
  return true;
}

/** Problems with an object claimed to be a contract ([] when it is well formed). */
function validate(c) {
  const p = [];
  const need = (cond, msg) => { if (!cond) p.push(msg); };
  need(c && c.contract === NAME, 'contract name');
  need(c && /^\d+\.\d+\.\d+$/.test(c.version || ''), 'semver version');
  need(c && ['ok', 'empty', 'fallback'].includes(c.status), 'status');
  if (!c) return p;
  need(Array.isArray(c.lesson && c.lesson.directives), 'lesson.directives');
  need(c.lesson && typeof c.lesson.sides === 'object', 'lesson.sides');
  need(Array.isArray(c.lesson && c.lesson.promptLines), 'lesson.promptLines');
  need(c.lesson && c.lesson.promptLines.length <= (c.lesson.max || 6) + 2, 'lesson.promptLines capped');
  for (const d of (c.lesson && c.lesson.directives) || []) {
    need(['high', 'low', 'combined'].includes(d.side), `side of ${d.stat}`);
    need(typeof d.text === 'string' && d.text.length > 0, `text of ${d.stat}`);
    need(['standing', 'score', 'test', 'mixed'].includes(d.gate), `gate of ${d.stat}`);
    need(d.p === null || (d.p >= 0 && d.p <= 1), `p of ${d.stat}`);
  }
  for (const [stat, side] of Object.entries((c.lesson && c.lesson.sides) || {})) need(side === 'high' || side === 'low', `sides.${stat}`);
  need(c.structure && Number.isFinite(c.structure.guidance) && Number.isFinite(c.structure.items), 'structure');
  need(c.memory && c.memory.curve && Number.isFinite(c.memory.curve.a) && c.memory.steers === false, 'memory');
  need(c.privacy && c.privacy.learner_numbers_in_model_text === false, 'privacy');
  const modelText = [...((c.lesson && c.lesson.promptLines) || []), ...((c.coach && c.coach.promptLines) || [])].join('\n');
  need(!/\d{2,}|@/.test(modelText.replace(/^\d+\. /gm, '')), 'model text carries no learner numbers or addresses');
  return p;
}

module.exports = {
  NAME,
  VERSION,
  MAJOR,
  KNOBS,
  knobsNow,
  stretchMax,
  flagOn,
  PRIVACY,
  LESSON_HEADING,
  COACH_HEADING,
  read,
  forAdaptation,
  forPrompt,
  forCoach,
  forSession,
  forPath,
  structureFrom,
  sidesFrom,
  assertCompatible,
  validate,
};
