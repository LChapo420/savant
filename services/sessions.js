/**
 * Sessions: a sitting that can cover more than one level.
 *
 * A session is made of blocks. A block is one level's worth of work, composed
 * from four kinds of item:
 *
 *   review   skills whose spaced-review interval has come due
 *   support  just below the current level, to keep footing
 *   focus    at the level's focus skill and difficulty
 *   stretch  above the current level, where the ceiling gets probed
 *
 * When a block is finished the level is re-evaluated. If it is complete the
 * learner levels up mid-session, answers one quick recall question about the
 * level they just cleared, and then chooses: another level, or finish. So a
 * session that starts at level 125 can end at 130, and the analysis at the end
 * covers all of it rather than only the last level.
 *
 * The mix within a block is set by the learner profile (services/learner.js) and
 * by what is actually due (services/mastery.js), which is what makes two
 * learners at the same level get different sessions.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const gradeSkills = require('../config/grade-skills');
const bank = require('../content/bank');
const mastery = require('./mastery');
const learner = require('./learner');
const grading = require('./grading');
const ai = require('./ai');
const lessons = require('./lessons');
const levelEditor = require('./level-editor');
const essays = require('./essays');
const remediation = require('./remediation');
const scorecardHooks = require('./scorecard/hooks');
const learnerRecord = require('./learner-record');
const blockLevels = require('./block-levels');
const blockCheckpoints = require('./block-checkpoints');
const adaptation = require('./adaptation');
const goals = require('./goals');

/** Does this account get the base product (config/owner.js ownerBase)? False on any failure. */
function ownerBaseOf(userId) {
  try {
    // eslint-disable-next-line global-require
    return require('../config/owner').ownerBase(userId);
  } catch {
    return false;
  }
}

/** What the browser is allowed to see about an item. Never the answer. */
function sanitize(item, index) {
  return {
    index: index === undefined ? item.index : index,
    id: item.id,
    skill_id: item.skill_id,
    skill_name: item.skill_name || curriculum.skillName(item.skill_id),
    difficulty: item.difficulty,
    format: item.format,
    prompt: item.prompt,
    passage: item.passage || null,
    // A chess position the question is set on: the page draws it on a board.
    fen: item.fen || null,
    choices: item.choices || null,
    role: item.role || 'focus',
    level: item.level || null,
    block: item.block === undefined ? 0 : item.block,
    // Which Challenge Exam band an item belongs to, and the level that band
    // speaks for. Sent only on an exam; null everywhere else so the client can
    // read it unconditionally.
    band: item.band === undefined ? null : item.band,
    band_level: item.band_level || null,
    coach_used: !!item.coach_used,
    // A skipped question leaves `correct` as null, which is what drops it out of
    // every accuracy calculation in the app. This flag is only so the client can
    // say so rather than re-offer a question the learner has already dismissed.
    skipped: !!item.skipped,
    // Set aside as too fast to count (round 3, ADAPT_EFFORT): never scored; a
    // parallel question in the same place replaced it.
    reserved: !!item.reserved,
    answered: item.user_answer !== undefined && item.user_answer !== null,
    correct: item.correct === undefined ? null : item.correct,
  };
}

/**
 * Honor a learner's preference for producing answers cold rather than
 * recognizing them: retry the generator a few times looking for a type-in of the
 * same skill and difficulty. Cheap, and it fails soft when the skill only has
 * one format.
 */
function generateWithPreference(entry, preferTypeIn, avoid) {
  const seen = avoid instanceof Set ? avoid : new Set(avoid || []);
  let any = null;
  let fresh = null;
  // The generators are random and take `avoid` as a hint, not a guarantee, so a
  // collision is checked here rather than assumed away. Identity is prompt plus
  // answer (bank.itemKey): several grammar families ask one question about many
  // different sentences, and treating those as one question is what made a
  // session run out of "new" material and start repeating.
  for (let attempt = 0; attempt < 10; attempt++) {
    const item = bank.generate({
      skillId: entry.skillId,
      difficulty: entry.difficulty,
      seed: `${entry.skillId}:${entry.difficulty}:${Date.now()}:${attempt}:${Math.random()}`,
      avoid: seen,
      school: entry.school,
    });
    if (!any) any = item;
    if (seen.has(bank.itemKey(item))) continue;
    if (!fresh) fresh = item;
    if (!preferTypeIn || item.format !== 'multiple_choice') return item;
  }
  // Nothing new in ten tries: this skill's generator has a small space at this
  // difficulty. A repeat is better than no question — and scripts/repeat-rate.js
  // is what keeps that from being the normal case.
  return fresh || any;
}

/**
 * Everything this learner has already been asked, as item keys.
 *
 * Without this, `avoid` only covered the current session, so a learner working
 * through levels 21, 22 and 23 — the same skill at almost the same difficulty —
 * met the same questions again in each one. The window is the last few hundred
 * items, which is far longer than anyone's memory for a practice question and
 * short enough to stay cheap.
 */
const HISTORY_WINDOW = Number(process.env.ITEM_HISTORY_WINDOW || 600);

function learnerHistory(userId, skillIds) {
  const wanted = skillIds && skillIds.length ? new Set(skillIds) : null;
  const rows = db.find('items', (i) => i.user_id === userId
    && (!wanted || wanted.has(i.skill_id)));
  return new Set(rows.slice(-HISTORY_WINDOW).map((i) => bank.itemKey(i)));
}

function clampDifficulty(d) {
  return Math.max(1, Math.min(10, Math.round(d * 10) / 10));
}

/** Plan one level's worth of work: an array of { skillId, difficulty, role }. */
function planLesson(userId, enrollment, grade, params) {
  const plan = curriculum.levelPlan(grade, enrollment.current_level);
  const count = params.itemCount || 10;
  const reviewLimit = Math.max(1, Math.round(count * 0.3));
  // One scheduler decides what is due (evidence 02, P4; CURVE_REVIEWS): where
  // the grade has an objective model, the fitted forgetting curve's queue
  // (adaptation.reviewQueue) picks the reviews; the SM-2 ladder is the fallback.
  const curve = curveReviews(userId, enrollment, plan.introduced, reviewLimit);
  const due = curve || mastery.dueReviews(userId, plan.introduced, reviewLimit);
  const weak = mastery.weakSkills(userId, plan.introduced);
  const mix = interleaveMode(userId, enrollment, grade);

  const entries = [];
  for (const state of due) {
    entries.push({
      skillId: state.skill_id, difficulty: clampDifficulty(plan.difficulty - 1), role: 'review',
      ...(state.objective ? { objective: state.objective, reviewReason: state.reason } : {}),
    });
  }

  const stretchCount = Math.max(1, Math.round(count * params.stretchShare));
  const supportCount = Math.round(count * params.supportShare);
  const focusCount = Math.max(1, count - entries.length - stretchCount - supportCount);

  // Support items come from the weakest introduced skill, or the focus skill if
  // nothing is weak yet.
  const supportSkill = (weak[0] && weak[0].skill_id) || plan.focus;
  for (let i = 0; i < supportCount; i++) {
    entries.push({ skillId: supportSkill, difficulty: clampDifficulty(plan.difficulty - 1.5), role: 'support' });
  }
  // Interleaving (evidence 01, P1): from the second practice level after a
  // lesson, one focus item in three is on an earlier topic, and from the third,
  // one in two. The alternate is always a skill other than the focus: the
  // weakest of the earlier skills first, then the earliest introduced, in turn.
  // (A brand-new focus topic has mastery 0, so it is also the weakest skill;
  // taking weak[0] made the "earlier topic" an item on the focus itself.)
  const earlier = plan.introduced.filter((s) => s !== plan.focus);
  const altEvery = mix && mix.since >= 3 ? 2 : 3;
  const alternates = mix && mix.since >= 2 && earlier.length
    ? (() => {
      const weakEarlier = weak.map((w) => w.skill_id).filter((s) => s !== plan.focus && earlier.includes(s));
      return [...weakEarlier, ...earlier.filter((s) => !weakEarlier.includes(s))];
    })()
    : null;
  for (let i = 0; i < focusCount; i++) {
    // Alternate between the level's focus skill and the next weakest, so a block
    // is never twelve copies of one idea.
    const alt = alternates
      ? { skill_id: alternates[Math.floor(i / altEvery) % alternates.length] }
      : weak[i % Math.max(1, weak.length)];
    const skillId = i % altEvery === altEvery - 1 && alt ? alt.skill_id : plan.focus;
    entries.push({ skillId, difficulty: clampDifficulty(plan.difficulty), role: 'focus' });
  }
  for (let i = 0; i < stretchCount; i++) {
    entries.push({ skillId: plan.focus, difficulty: clampDifficulty(plan.difficulty + 1.5), role: 'stretch' });
  }

  // Review first (retrieval before new material), then the body: blocked by role
  // as before, or, with interleaving on, spread evenly across skills.
  const body = entries.filter((e) => e.role !== 'review');
  const reviews = entries.filter((e) => e.role === 'review');
  return withinGrade(grade, [...reviews, ...(mix && mix.since >= 2 ? spreadBySkill(body) : body)]);
}

/**
 * Should this learner's practice body be interleaved (evidence article 01, P1;
 * INTERLEAVE_SESSIONS, default on)? Interleaving skills within a sitting improves
 * delayed tests in mathematics by d about 0.4-0.8 (rohrer2015, rohrer2020; less for
 * vocabulary and expository text, brunmair2019), so:
 *   - the first practice level after a lesson stays blocked (a short block right
 *     after teaching), and interleaving starts on the second;
 *   - from the third, one focus item in two is on an earlier topic;
 *   - the text tracks (Spanish, Reading, and English's Reading grade) stay as they were;
 *   - the owner gets the base product (config/owner.js ownerBase).
 * Returns null when off, else { since }: how many levels past the last lesson.
 */
function interleaveMode(userId, enrollment, grade) {
  if (String(process.env.INTERLEAVE_SESSIONS || 'on').toLowerCase() === 'off') return null;
  if (!grade || ['spanish', 'reading'].includes(grade.trackId || enrollment.track_id) || enrollment.grade_id === 'reading') return null;
  try {
    // eslint-disable-next-line global-require
    if (require('../config/owner').ownerBase(userId)) return null;
  } catch { return null; }
  const level = enrollment.current_level;
  for (let l = level - 1, n = 1; l >= 1 && n <= 60; l--, n++) {
    if (curriculum.levelKind(l, grade.pathLength, grade) === 'lesson') return { since: n };
  }
  return { since: level };
}

/**
 * The body spread evenly across its skills: each skill's items keep their own
 * order (easier before harder), and the skills are woven together by each item's
 * relative place in its skill's run, so no skill comes in one long stretch.
 * Deterministic, so a resumed or re-planned block is the same order.
 */
function spreadBySkill(body) {
  const bySkill = new Map();
  body.forEach((e, at) => {
    const list = bySkill.get(e.skillId) || [];
    list.push({ e, at });
    bySkill.set(e.skillId, list);
  });
  const placed = [];
  for (const list of bySkill.values()) {
    list.forEach((x, j) => placed.push({ ...x, key: (j + 0.5) / list.length }));
  }
  placed.sort((a, b) => (a.key - b.key) || (a.at - b.at));
  return placed.map((x) => x.e);
}

/**
 * The due reviews from the fitted forgetting curve (evidence 02, P4;
 * CURVE_REVIEWS, default on): the objectives adaptation.reviewQueue says to
 * bring back now (memory checks, fading, least durable), mapped to their skills
 * among those introduced, at most two per skill. Null when there is no
 * objective model for the grade, the switch is off, or the learner is the owner:
 * then mastery.dueReviews (SM-2) decides, as before. An empty list means the
 * curve says nothing is due.
 */
function curveReviews(userId, enrollment, introduced, limit) {
  if (String(process.env.CURVE_REVIEWS || 'on').toLowerCase() === 'off') return null;
  try {
    // eslint-disable-next-line global-require
    if (require('../config/owner').ownerBase(userId)) return null;
    const rec = adaptation.recordFor(userId, enrollment);
    if (!rec || !rec.report || !rec.report.model || !rec.report.model.objectives.length) return null;
    const { model, states } = rec.report;
    const queue = adaptation.reviewQueue(model, states, Date.now(), { limit: model.objectives.length, curve: rec.curve });
    const allowed = new Set(introduced);
    const perSkill = new Map();
    const out = [];
    for (const q of queue) {
      if (!['memory_check', 'fading', 'durability'].includes(q.reason) || !q.skill || !allowed.has(q.skill)) continue;
      if ((perSkill.get(q.skill) || 0) >= 2) continue;
      perSkill.set(q.skill, (perSkill.get(q.skill) || 0) + 1);
      out.push({ skill_id: q.skill, objective: q.id, reason: q.reason });
      if (out.length >= limit) break;
    }
    return out;
  } catch (err) {
    console.warn(`sessions: curve reviews unavailable (${err.message}); using the SM-2 ladder`);
    return null;
  }
}

/**
 * Each entry's difficulty held to the range its skill fits in this grade, with
 * the grade's school grade attached so the bank serves that grade's standard
 * (config/grade-skills.js fitEntry).
 */
function withinGrade(grade, entries) {
  return entries.map((e) => gradeSkills.fitEntry(grade, e));
}

/** Plan a checkpoint: every introduced skill, sampled across the level's range. */
function planCheckpoint(enrollment, grade, kind) {
  const plan = curriculum.levelPlan(grade, enrollment.current_level);
  const count = curriculum.CHECKPOINT_LENGTH[kind] || 15;
  const skills = kind === 'graduation' ? grade.skills : plan.introduced;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const spread = kind === 'graduation' ? 4 : 2;
    const t = count === 1 ? 0.5 : i / (count - 1);
    const difficulty = clampDifficulty(plan.difficulty - spread / 2 + t * spread);
    entries.push({ skillId: skills[i % skills.length], difficulty, role: 'exam' });
  }
  return withinGrade(grade, entries);
}

/**
 * Every exam question this learner has already been asked at this level, which
 * is what a retry has to avoid. Recognising a question from the attempt you just
 * failed is not a retest.
 */
function examPromptsSeen(userId, level) {
  return db.find('items', (i) => i.user_id === userId && i.level === level && i.role === 'exam')
    .map((i) => bank.itemKey(i));
}

/** How long a retry waits on freshly written questions before the bank fills in.
 *  Someone is staring at a spinner, so this is a ceiling, not a target. */
const REGEN_WAIT_MS = Number(process.env.CHECKPOINT_REGEN_WAIT_MS || 20000);

/**
 * Write the retry's questions while the learner is still reading why they failed.
 *
 * Regenerating a 15-question quiz takes about 18 seconds. Spent after they click
 * "retry" that is a spinner; spent while they are on the recap screen it is free,
 * and the retry opens immediately. Same trade as writing the next lesson a level
 * early. Nobody awaits this.
 */
function prefetchRetry({ userId, enrollment, grade, kind, remediationId }) {
  // A tailored learner's retry is written the same way their first attempt was.
  const user = db.byId('users', userId);
  if (user && blockLevels.tailorsFor(user) && blockLevels.aiReady()) {
    blockCheckpoints.prefetch({
      userId, enrollment, grade, level: enrollment.current_level, attempt: (enrollment.checkpoint_attempts || 0) + 1,
    });
    return;
  }
  const entries = planCheckpoint(enrollment, grade, kind);
  const avoid = examPromptsSeen(userId, enrollment.current_level);
  ai.regenerateItems({
    entries,
    avoid,
    kindLabel: curriculum.CHECKPOINT_LABEL[kind] || 'checkpoint',
    level: enrollment.current_level,
    userId,
  })
    .then((fresh) => {
      const slots = Object.keys(fresh || {});
      if (!slots.length) return;
      const row = db.byId('remediations', remediationId);
      if (!row) return;
      db.update('remediations', remediationId, {
        retry_items: slots.map((slot) => ({ slot: Number(slot), item: fresh[slot] })),
      });
    })
    .catch((err) => console.warn(`ai: preparing the ${kind} retry failed: ${err.message}`));
}

/**
 * The prefetched retry questions, if they arrived, checked against the plan they
 * have to fill. A slot whose skill no longer matches is dropped rather than
 * trusted — cheaper than a wrong question in a graded quiz.
 */
function claimPrefetchedRetry(userId, enrollmentId, entries) {
  const row = remediation.activeFor(userId, enrollmentId);
  if (!row || !(row.retry_items || []).length) return {};
  const out = {};
  for (const { slot, item } of row.retry_items) {
    const entry = entries[slot];
    if (entry && item && item.skill_id === entry.skillId) out[slot] = item;
  }
  // Used once: the next attempt gets questions of its own.
  db.update('remediations', row.id, { retry_items: [] });
  return out;
}

/**
 * Materialize a checkpoint retry: the same skills at the same difficulties, with
 * questions the learner has not seen.
 *
 * The questions come from the `regen` model (GLM 5.3 Flash) where it answers in
 * time, and from the bank with the old prompts excluded where it does not — so a
 * retry is never blocked on a vendor, and is never a rerun of the failed
 * attempt either way.
 */
async function regeneratedItems({ userId, entries, level, kind, avoid }) {
  const fresh = await Promise.race([
    ai.regenerateItems({
      entries,
      avoid,
      kindLabel: curriculum.CHECKPOINT_LABEL[kind] || 'checkpoint',
      level,
      userId,
    }).catch((err) => {
      console.warn(`ai: regenerating the ${kind} quiz failed: ${err.message}`);
      return {};
    }),
    new Promise((resolve) => setTimeout(() => resolve({}), REGEN_WAIT_MS)),
  ]);
  return fresh || {};
}

/**
 * Turn a plan into stored items. The model, when available and in budget,
 * authors the focus and stretch items; the bank covers everything else and
 * every failure path.
 */
async function materialize({ userId, session, entries, params, level, blockIndex, fresh = {}, avoidAlso = [] }) {
  const existing = db.find('items', (i) => i.session_id === session.id);
  // This sitting, plus everything this learner has been asked recently on these
  // skills. The second half is what stops consecutive levels on one skill from
  // asking the same questions.
  const avoid = new Set([
    ...existing.map((i) => bank.itemKey(i)),
    ...learnerHistory(userId, entries.map((e) => e.skillId)),
    ...avoidAlso,
  ]);
  const startIndex = existing.length;

  // Cache-only, and not awaited on the model: a session must open immediately,
  // and the bank covers anything the cache cannot.
  const aiItems = ai.generateItems({
    entries: entries.filter((e) => e.role === 'focus' || e.role === 'stretch'),
    userId,
  });
  let aiIndex = 0;

  const rows = [];
  for (let slot = 0; slot < entries.length; slot++) {
    const entry = entries[slot];
    let item = fresh[slot] || null;
    if (item && avoid.has(bank.itemKey(item))) item = null;
    if (!item && (entry.role === 'focus' || entry.role === 'stretch') && aiItems && aiItems[aiIndex]) {
      item = aiItems[aiIndex++];
      if (avoid.has(bank.itemKey(item))) item = null;
    }
    // A review the forgetting curve asked for (curveReviews): a question written
    // for that objective when one is left, and tagged with it either way, so the
    // answer is that objective's memory check.
    if (!item && entry.objective) {
      try {
        // eslint-disable-next-line global-require
        item = require('./objective-items').pick({ trackId: session.track_id, gradeId: session.grade_id, objectiveId: entry.objective, avoid, difficulty: entry.difficulty });
      } catch { item = null; }
    }
    if (!item) item = generateWithPreference(entry, params.preferTypeIn, avoid);
    avoid.add(bank.itemKey(item));
    rows.push(db.insert('items', {
      ...item,
      ...(entry.objective ? { objective_id: entry.objective, review_reason: entry.reviewReason || null } : {}),
      session_id: session.id,
      user_id: userId,
      role: entry.role,
      level,
      block: blockIndex,
      index: startIndex + rows.length,
      user_answer: null,
      correct: null,
      ms: null,
      coach_used: false,
    }));
  }
  return rows;
}

/** Store ready-made items (a lesson's check questions) as part of a block. */
function insertItems({ userId, session, items, level, blockIndex }) {
  const startIndex = db.find('items', (i) => i.session_id === session.id).length;
  return items.map((item, i) => db.insert('items', {
    ...item,
    session_id: session.id,
    user_id: userId,
    role: item.role || 'check',
    level,
    block: blockIndex,
    index: startIndex + i,
    user_answer: null,
    correct: null,
    ms: null,
    coach_used: false,
  }));
}

/**
 * The quick check that goes with a written checkpoint.
 *
 * Short on purpose. The essay is what this level is decided on — a learner who
 * has written four hundred words and been marked against a rubric has given far
 * more evidence than five multiple choice answers, and a long quiz in front of
 * it would be the part they remember the level by. What the questions are for is
 * coverage: the skills the essay's rubric cannot measure on its own, fed into
 * mastery and the session analysis like any other work.
 */
function planEssayQuiz(grade, level, count) {
  const plan = curriculum.levelPlan(grade, level);
  const skills = plan.introduced;
  const total = count || curriculum.ESSAY_QUIZ_LENGTH[plan.kind] || curriculum.ESSAY_QUIZ_LENGTH.master;
  const entries = [];
  for (let i = 0; i < total; i++) {
    entries.push({
      skillId: skills[i % skills.length],
      difficulty: clampDifficulty(plan.difficulty),
      role: 'exam',
    });
  }
  return entries;
}

/** A resumed lesson block's lesson: the stored one when it may be served to this learner, else the bank's, stored now. */
function resumedLesson(userId, enrollment, grade, level) {
  const row = lessons.find(userId, enrollment, level);
  if (row && lessons.fitFor(userId, row) && (row.sections || []).length) return row;
  return lessons.storedFallback({ userId, enrollment, grade, level });
}

/**
 * Build one block for whatever kind of level the learner is standing on: a
 * taught lesson with its check questions, a written checkpoint, a checkpoint
 * quiz, or practice.
 */
async function buildBlock({ userId, session, enrollment, grade, level, blockIndex, params }) {
  // A block that already has items is a block being resumed, and it is handed
  // back exactly as it is.
  //
  // Without this, reopening a sitting plans the level again and hands out fresh
  // questions — so the answers the learner already gave are sitting on items
  // nothing displays, and an exam looks like it started from the beginning. It
  // was the shape of every "my place was lost" report, and the reason a lesson
  // could come back with different check questions too.
  //
  // The answers themselves were never lost; they were orphaned by this.
  const existing = db.find('items', (i) => i.session_id === session.id && (i.block || 0) === blockIndex);
  if (existing.length) {
    const kind = curriculum.levelKind(level, grade.pathLength, grade);
    return {
      kind,
      items: existing.sort((a, b) => a.index - b.index),
      // Never the checks alone on a lesson level: the stored lesson, or the bank's.
      lesson: kind === 'lesson' ? resumedLesson(userId, enrollment, grade, level) : null,
      essay: essays.forSession(userId, session.id, blockIndex),
      prepared: true,
      resumed: true,
    };
  }

  const kind = curriculum.levelKind(level, grade.pathLength, grade);

  if (kind === 'lesson') {
    const { lesson, prepared } = await lessons.forLevel({ userId, enrollment, grade, level });
    const items = insertItems({
      userId,
      session,
      items: (lesson.check_questions || []).map((q) => ({ ...q, role: 'check' })),
      level,
      blockIndex,
    });
    return { kind, items, lesson, prepared };
  }

  // A written checkpoint is a checkpoint by its level number and something else
  // by what the learner does, so it branches before the quiz path rather than
  // being a kind the rest of the file has to keep recognising.
  if (curriculum.isEssayCheckpoint(grade, level)) {
    const attempt = (enrollment.checkpoint_attempts || 0) + 1;
    const { essay, prepared } = await essays.forLevel({ userId, enrollment, grade, level, attempt });
    const items = await materialize({
      userId,
      session,
      entries: planEssayQuiz(grade, level),
      params,
      level,
      blockIndex,
    });
    return { kind: 'essay', items, lesson: null, essay, prepared, attempt };
  }

  const checkpoint = curriculum.isCheckpoint(kind);
  const entries = checkpoint
    ? planCheckpoint(enrollment, grade, kind)
    : planLesson(userId, enrollment, grade, params);

  // A second or later attempt at a checkpoint is written fresh. The first one
  // does not need to be: nothing has been seen yet.
  const retry = checkpoint && (enrollment.checkpoint_attempts || 0) > 0;
  const avoidAlso = retry ? examPromptsSeen(userId, level) : [];
  let fresh = {};
  // A learner whose levels are tailored gets a checkpoint written for them: the
  // course's blueprint, presented the way they show what they know
  // (services/block-checkpoints.js). Every attempt, first and retry, is written
  // fresh. Whatever does not arrive in time falls through to the paths below.
  const user = checkpoint ? db.byId('users', userId) : null;
  if (checkpoint && user && blockLevels.tailorsFor(user) && blockLevels.aiReady()) {
    fresh = await blockCheckpoints.claim({
      userId,
      enrollment,
      grade,
      level,
      entries,
      attempt: (enrollment.checkpoint_attempts || 0) + 1,
      waitMs: REGEN_WAIT_MS,
    });
  }
  // Everyone else's first attempt is the level's base quiz when one has been
  // written: the same blueprint, written to test what the lessons taught.
  if (checkpoint && !retry && !Object.keys(fresh).length) {
    fresh = blockCheckpoints.shared({ enrollment, level, entries });
  }
  if (retry && entries.filter((_, slot) => !fresh[slot]).length > entries.length / 2) {
    // Written while they were reading the recap, in the usual case.
    fresh = { ...claimPrefetchedRetry(userId, enrollment.id, entries), ...fresh };
    const missing = entries.filter((_, slot) => !fresh[slot]).length;
    if (missing > entries.length / 2) {
      const live = await regeneratedItems({ userId, entries, level, kind, avoid: avoidAlso });
      fresh = { ...live, ...fresh };
    }
  }

  const items = await materialize({ userId, session, entries, params, level, blockIndex, fresh, avoidAlso });
  return { kind, items, lesson: null, prepared: true, attempt: retry ? enrollment.checkpoint_attempts + 1 : 1 };
}

/**
 * Create a session and its first block, sized to the level the learner is on.
 *
 * `level` overrides which level this sitting is built at, and only the route
 * that has already checked the account is allowed to pass one. It builds the
 * work at that level and nothing else: the enrollment stays where it is, so a
 * preview of a level ahead neither advances anyone nor marks anything cleared.
 * `preview` on the session row is what keeps the recap honest about it.
 */
async function createSession({ userId, enrollment, grade, level: atLevel }) {
  // An unfinished sitting on this enrollment is returned as it stands, rather
  // than replaced by a new one.
  //
  // The route has always done this before calling, so the app behaved — but the
  // guard was in the caller rather than the service, which meant every other
  // caller got the dangerous version. Building a second session at the same
  // level plans the level again: fresh questions, none of the answers attached,
  // and the old answers orphaned on items nothing displays. That is exactly the
  // report that "my place was lost" describes, and it was one call away from
  // being true of the real route too.
  if (enrollment) {
    const open = db.findOne('sessions', (s) => s.user_id === userId
      && s.enrollment_id === enrollment.id && !s.ended_at
      && s.kind !== 'placement' && s.kind !== 'remediate' && s.kind !== 'skip' && s.kind !== 'enforcer');
    if (open && itemsFor(open.id).length) {
      const block = (open.blocks || [])[(open.blocks || []).length - 1]
        || { index: 0, kind: 'practice' };
      return {
        session: open,
        resumed: true,
        block: block.index,
        level: open.level,
        kind: block.kind,
        items: itemsFor(open.id),
        lesson: lessons.forSitting(open),
        essay: (db.find('essays', (e) => e.session_id === open.id && e.user_id === userId) || [])[0] || null,
      };
    }
  }

  const profile = learner.getProfile(userId);
  const level = atLevel || (enrollment ? enrollment.current_level : 0);
  const preview = !!atLevel && !!enrollment && atLevel !== enrollment.current_level;
  const levelKind = curriculum.levelKind(level, grade.pathLength, grade);
  let params = learner.sessionParams(profile, {
    checkpoint: curriculum.isCheckpoint(levelKind) ? levelKind : null,
    goal: enrollment ? goals.forEnrollment(enrollment) : null,
  });
  // Per-learner adaptation (services/adaptation.js): HOW this level teaches,
  // never what it covers. Off unless ADAPTIVE_TEACHING is set, and then only on
  // a practice or lesson level the learner is standing on: `shadow` records the
  // plan on the sitting and changes nothing; `on` applies its bounded knobs
  // (questions per block, stretch and support shares, typed answers).
  // The plan starts from the params before the scorecard's structure: decide()
  // applies the same confident sides itself (DIRECTIVE_KNOBS = contract.KNOBS), so
  // starting from `params` counted each one twice.
  const unscored = enrollment && !preview && adaptation.mode() !== 'off' && !curriculum.isCheckpoint(levelKind)
    ? learner.sessionParams(profile, { checkpoint: null, scorecard: false, goal: enrollment ? goals.forEnrollment(enrollment) : null }) : params;
  const adapted = enrollment && !preview && adaptation.mode() !== 'off' && !curriculum.isCheckpoint(levelKind)
    ? adaptation.planForLevel({ userId, enrollment, level, base: unscored }) : null;
  if (adapted && adaptation.mode() === 'on') params = adaptation.paramsFor(unscored, adapted);

  // A session is named for the level it opens on; later blocks carry their own.
  // A written checkpoint is named for what the learner does on it, not for the
  // level number it happens to fall on, so the client can tell the two apart.
  const sessionKind = curriculum.isEssayCheckpoint(grade, level)
    ? 'essay'
    : curriculum.isCheckpoint(levelKind)
      ? levelKind
      : levelKind === 'lesson' ? 'teach' : 'lesson';

  const session = db.insert('sessions', {
    user_id: userId,
    enrollment_id: enrollment ? enrollment.id : null,
    track_id: enrollment ? enrollment.track_id : null,
    grade_id: enrollment ? enrollment.grade_id : null,
    level,
    start_level: level,
    end_level: level,
    levels: [level],
    blocks: [{ index: 0, level, kind: levelKind, resolved: false }],
    kind: sessionKind,
    params,
    started_at: new Date().toISOString(),
    ended_at: null,
    score: null,
    analysis: null,
    xp_awarded: 0,
    // Set on a sitting built at a level the learner is not standing on. It marks
    // the work as real — it is graded, it feeds mastery — while the enrollment
    // stays where it was.
    preview,
    at_level: preview ? enrollment.current_level : null,
    ...(adapted ? { adaptation_plan: { mode: adaptation.mode(), objective: adapted.objective, knobs: adapted.knobs, review: adapted.review, reasons: adapted.reasons } } : {}),
  });

  const built = await buildBlock({ userId, session, enrollment, grade, level, blockIndex: 0, params });
  if (built.lesson) db.update('sessions', session.id, { lesson_id: built.lesson.id });
  // The essay is joined by query rather than by a column, because a sitting can
  // open on a practice level and reach its written checkpoint two blocks later.
  const essay = built.essay ? essays.attach(built.essay, session.id, 0) : null;

  // While the learner works here, write the next lesson so it is waiting for
  // them rather than being generated under a spinner. A preview writes nothing
  // ahead: it is a level out of order, and the lesson after *their* level is the
  // one that will actually be wanted.
  if (!preview) {
    lessons.prefetchNext({ userId, enrollment, grade, level });
    essays.prefetch({ userId, enrollment, grade, level: level + 1 });
    // And this learner's own version of the next level, on the same reasoning and
    // for the same level: the time they spend here is the time it has to be
    // written. Does nothing at all for an account whose levels are not written
    // for them.
    levelEditor.prefetchNext(userId, enrollment, level);
  }

  return {
    session: db.byId('sessions', session.id),
    items: built.items,
    lesson: built.lesson ? lessons.sanitize(built.lesson) : null,
    essay: essay ? essays.sanitize(essay) : null,
    preview,
  };
}

/**
 * A round of drill questions on one weak area from a failed checkpoint.
 *
 * Its own session, of kind `remediate`, for two reasons: the answers are graded
 * and fed into mastery like any other work, and it must not be able to advance a
 * level — only the quiz does that, and `mastery.tryLevelUp` refuses anything but
 * a practice level, so standing on a checkpoint level makes that structural
 * rather than a rule someone has to remember.
 *
 * Questions come from the bank, and always exclude the quiz questions and earlier
 * drills — being re-asked the question you just got wrong teaches recognition,
 * not the skill. The bank rather than the model on purpose: five questions take
 * it a millisecond against 17 seconds on flash, its answers are computed so they
 * are always right, and mechanical practice at a fixed difficulty is exactly what
 * a procedural generator is good at. The model's latency is spent where it buys
 * something the bank cannot do — reading the mistake, and the conversation.
 */
async function createDrillSession({ userId, enrollment, grade, area, count = 5 }) {
  const profile = learner.getProfile(userId);
  const params = learner.sessionParams(profile, {});
  const level = enrollment.current_level;
  const difficulty = clampDifficulty(area.difficulty || curriculum.levelPlan(grade, level).difficulty);
  const entries = Array.from({ length: count }, () => ({ skillId: area.skill_id, difficulty, role: 'drill' }));

  const session = db.insert('sessions', {
    user_id: userId,
    enrollment_id: enrollment.id,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    level,
    start_level: level,
    end_level: level,
    levels: [level],
    blocks: [{ index: 0, level, kind: 'drill', resolved: false }],
    kind: 'remediate',
    skill_id: area.skill_id,
    params,
    started_at: new Date().toISOString(),
    ended_at: null,
    score: null,
    analysis: null,
    xp_awarded: 0,
  });

  const avoidAlso = [
    ...examPromptsSeen(userId, level),
    ...db.find('items', (i) => i.user_id === userId && i.role === 'drill' && i.skill_id === area.skill_id)
      .map((i) => bank.itemKey(i)),
  ];
  const items = await materialize({
    userId, session, entries, params, level, blockIndex: 0, avoidAlso,
  });

  return { session: db.byId('sessions', session.id), items };
}

/** Score a finished drill round: how many of its questions were right. */
function scoreDrill(sessionId) {
  const rows = db.find('items', (i) => i.session_id === Number(sessionId) && i.role === 'drill');
  const answered = rows.filter((i) => i.correct !== null);
  return {
    asked: rows.length,
    answered: answered.length,
    correct: answered.filter((i) => i.correct).length,
  };
}

// ── The Challenge Exam ─────────────────────────────────────────────────────
/**
 * Plan a Challenge Exam: five bands of seven, each band pitched at the
 * difficulty of a level ten marks above the one before it.
 *
 * The skills come from the level at the top band rather than the level the
 * learner is standing on, because someone who has just cleared twenty-five
 * levels has already met everything up to here, and an exam drawn from it would
 * be a retest wearing a challenge's name. The bands are already the stretch, so
 * the exam asks for no stretch items of its own.
 */
function planSkipExam(grade, level, rule = curriculum.skipRule()) {
  const bands = curriculum.skipExamBands(level, grade.pathLength, { rule });
  const top = bands.length ? bands[bands.length - 1].level : level;
  const skills = curriculum.levelPlan(grade, top).introduced;
  const entries = [];
  for (const band of bands) {
    const plan = curriculum.levelPlan(grade, band.level);
    for (let i = 0; i < band.count; i++) {
      entries.push({
        skillId: skills[i % skills.length],
        difficulty: clampDifficulty(plan.difficulty),
        role: 'skip',
        band: band.index,
        band_level: band.level,
      });
    }
  }
  return entries;
}

/**
 * Create a Challenge Exam.
 *
 * Its own session kind, because a level skip is not ordinary work: it is scored
 * as a whole at the end rather than level by level, and on success it moves the
 * learner more than one step. Keeping it separate is also what stops the exam
 * being folded into a sitting the learner abandons halfway — an exam is a thing
 * you finish, and its bands only mean anything all together.
 */
async function createSkipExamSession({ userId, enrollment, grade }) {
  const profile = learner.getProfile(userId);
  const params = learner.sessionParams(profile, {});
  const level = enrollment.current_level;
  // The rule is fixed when the exam is built and kept on it, so it is scored by
  // the rule the learner was shown (evidence P3; CHALLENGE_SPRT, not for the owner).
  const rule = curriculum.skipRule({ base: ownerBaseOf(userId) });
  const bands = curriculum.skipExamBands(level, grade.pathLength, { rule });
  const entries = planSkipExam(grade, level, rule);

  const session = db.insert('sessions', {
    user_id: userId,
    enrollment_id: enrollment.id,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    level,
    start_level: level,
    end_level: level,
    levels: bands.map((b) => b.level),
    blocks: [{ index: 0, level, kind: 'skip', resolved: false }],
    kind: 'skip',
    bands,
    pass_rule: rule,
    params,
    started_at: new Date().toISOString(),
    ended_at: null,
    score: null,
    analysis: null,
    xp_awarded: 0,
  });

  // materialize() stores the item and stamps what it was given, so the band is
  // carried on the plan and written onto the row it produced.
  const rows = await materialize({
    userId, session, entries, params, level, blockIndex: 0,
  });
  entries.forEach((entry, i) => {
    if (rows[i]) db.update('items', rows[i].id, { band: entry.band, band_level: entry.band_level });
  });

  return { session: db.byId('sessions', session.id), items: itemsFor(session.id), bands };
}

/**
 * Score a Challenge Exam band by band, and say where it sends the learner.
 *
 * The walk stops at the first band that is not perfect, because each band is a
 * claim that everything above it holds and a band that fails takes that claim
 * with it. The target is therefore the top of the last unbroken run of perfect
 * bands: `100, 100, 100, 40, 100` lands on 130 with the 140 ignored, and
 * `70, 100, 100, 100, 100` lands nowhere at all, because the run never started.
 */
function scoreSkipExam(sessionId) {
  const rows = itemsFor(sessionId).filter((i) => i.role === 'skip');
  const byBand = {};
  for (const row of rows) {
    const key = row.band === undefined || row.band === null ? 0 : row.band;
    const band = byBand[key] || (byBand[key] = { index: key, level: row.band_level || null, total: 0, correct: 0, answered: 0 });
    band.total += 1;
    if (row.correct !== null) {
      band.answered += 1;
      if (row.correct) band.correct += 1;
    }
  }

  // Scored by the rule it was built with (createSkipExamSession): an exam built
  // before the likelihood-ratio rule has none stored, and keeps "every band perfect".
  const session = db.byId('sessions', sessionId);
  const rule = (session && session.pass_rule) || 'perfect';
  const sorted = Object.values(byBand).sort((a, b) => a.index - b.index);
  const verdicts = rule === 'sprt' ? curriculum.skipVerdicts(sorted) : null;
  const bands = sorted.map((b, i) => ({
    ...b,
    accuracy: b.answered ? b.correct / b.answered : 0,
    // Whether the band counted toward the skip, and what it needed, for the result page.
    held: verdicts ? verdicts.held[i] : b.total > 0 && b.correct >= b.total && sorted.slice(0, i).every((x) => x.correct >= x.total),
    needed: rule === 'sprt' ? (i === 0 ? curriculum.neededToPass('skip', b.total) : Math.max(0, b.total - 1)) : b.total,
  }));

  const asked = rows.filter((i) => i.correct !== null);
  const correct = asked.filter((i) => i.correct).length;
  return {
    bands,
    rule,
    target_level: verdicts ? verdicts.target : curriculum.skipTargetFromBands(bands),
    asked: asked.length,
    correct,
    total: rows.length,
    accuracy: asked.length ? correct / asked.length : 0,
  };
}

/**
 * Add another block to a running session: the next level if the learner has
 * advanced, or more work at the same level if they have not. This is what makes
 * a session a sitting rather than a single level.
 */
async function addBlock({ userId, session, enrollment, grade }) {
  const params = session.params || learner.sessionParams(learner.getProfile(userId));
  const level = enrollment.current_level;
  const kind = curriculum.levelKind(level, grade.pathLength, grade);
  const blocks = [...(session.blocks || [])];
  const blockIndex = blocks.length;
  blocks.push({ index: blockIndex, level, kind, resolved: false });

  const levels = [...new Set([...(session.levels || []), level])].sort((a, b) => a - b);
  db.update('sessions', session.id, { blocks, levels, end_level: level, level });

  const built = await buildBlock({ userId, session, enrollment, grade, level, blockIndex, params });
  lessons.prefetchNext({ userId, enrollment, grade, level });
  essays.prefetch({ userId, enrollment, grade, level: level + 1 });
  levelEditor.prefetchNext(userId, enrollment, level);
  const essay = built.essay ? essays.attach(built.essay, session.id, blockIndex) : null;

  return {
    session: db.byId('sessions', session.id),
    items: built.items,
    lesson: built.lesson ? lessons.sanitize(built.lesson) : null,
    essay: essay ? essays.sanitize(essay) : null,
    block: blockIndex,
    level,
    kind: built.kind,
  };
}

function itemsFor(sessionId) {
  return db.find('items', (i) => i.session_id === sessionId).sort((a, b) => a.index - b.index);
}

function itemsInBlock(sessionId, blockIndex) {
  return itemsFor(sessionId).filter((i) => (i.block || 0) === blockIndex && i.role !== 'retention');
}

/**
 * What was actually done in each of these sessions: how many questions the
 * learner answered, and at which levels.
 *
 * The stored `levels` cannot answer that. Closing a level appends the level the
 * learner was moved on to — that is what lets the next block be built there —
 * so a sitting that worked level 42 and stopped reads "42 to 43" although
 * nobody saw a question at 43. And a sitting opened and closed without an
 * answer still has a level on it. Anything that tells the learner what they
 * did reads this instead. The stored fields stay as they are, because the
 * session player and the next block rely on them.
 *
 * A question counts at the level of the block it was served in (a stretch item
 * is still part of that level's work). The recall questions are left out: they
 * are asked about a level after it is worked, not part of working it. One pass
 * over the items table for the whole list, so the dashboard does not scan it
 * once per row.
 *
 * @returns {Map<number, {answered: number, levels: number[]}>}
 */
function workDone(sessionList) {
  const byId = new Map(sessionList.map((s) => [s.id, { session: s, answered: 0, levels: new Set() }]));
  if (!byId.size) return new Map();
  const answered = db.find('items', (i) => byId.has(i.session_id) && i.role !== 'retention'
    && i.user_answer !== null && i.user_answer !== undefined);
  for (const item of answered) {
    const row = byId.get(item.session_id);
    const block = (row.session.blocks || []).find((b) => b.index === (item.block || 0));
    const level = block ? block.level : item.level || row.session.level;
    row.answered += 1;
    if (level !== undefined && level !== null) row.levels.add(level);
  }
  // A main-path Spanish level (services/spanish/path.js) keeps its answers on
  // its run, and counts them on its session row.
  for (const row of byId.values()) {
    if (row.session.kind === 'spanish' && row.session.es_answered) {
      row.answered += row.session.es_answered;
      row.levels.add(row.session.start_level);
    }
  }
  // A written checkpoint can be the writing alone, with no quick questions, and
  // a piece handed in is work done just as an answer is.
  for (const essay of db.find('essays', (e) => byId.has(e.session_id) && (e.attempts || []).length)) {
    const row = byId.get(essay.session_id);
    const block = (row.session.blocks || []).find((b) => b.index === (essay.block || 0));
    row.answered += 1;
    row.levels.add(block ? block.level : row.session.level);
  }
  return new Map([...byId].map(([id, row]) => [id, {
    answered: row.answered,
    levels: [...row.levels].sort((a, b) => a - b),
  }]));
}

/**
 * The levels a session actually worked, for the recap and the analysis. Falls
 * back to the stored list for a sitting with no answers at all, so a caller
 * always has something to name.
 */
function workedLevels(session) {
  const done = workDone([session]).get(session.id);
  if (done && done.levels.length) return done.levels;
  return session.levels && session.levels.length ? session.levels : [session.level];
}

/**
 * Grade one answer, update the learner's state, and return the feedback the
 * client shows. Immediate feedback is a profile setting, so the caller decides
 * whether to display the rationale now or hold it for the recap.
 */
async function answer({ userId, session, itemId, userAnswer, ms, confidence = null, changes = 0 }) {
  const item = db.byId('items', itemId);
  if (!item || item.session_id !== session.id || item.user_id !== userId) return null;
  if (item.user_answer !== null && item.user_answer !== undefined) {
    // Already answered: report the stored result rather than double-counting it.
    return {
      already: true,
      correct: item.correct,
      answer: item.answer,
      rationale: item.rationale,
      errorTag: item.error_tag || null,
    };
  }

  const verdict = grading.grade(item, userAnswer);
  let correct = verdict.correct;
  let feedback = null;
  let errorTag = null;

  let gradedBy = null;

  if (verdict.needsAi) {
    // The layered grader (services/typed-grading.js): it accepts only by consensus of
    // free judges. When it cannot settle within the interactive budget, the answer is
    // held as "being checked" and finished in the background (holdForChecking).
    const judged = await ai.gradeFreeResponse({ item, userAnswer, userId });
    if (judged && judged.status === 'checking') {
      return holdForChecking({ userId, session, item, userAnswer, ms, confidence, changes, settle: judged.settle });
    }
    if (judged) {
      correct = judged.correct;
      feedback = judged.feedback || null;
      errorTag = judged.error_tag || null;
      gradedBy = judged.status === 'unresolved' ? 'unresolved' : judged.by || null;
    }
  }

  return recordAnswer({ userId, session, item, userAnswer, ms, confidence, changes, correct, feedback, errorTag, gradedBy });
}

/** Typed answers being checked in the background, by item id: the settling promise. */
const checking = new Map();

/**
 * Hold a typed answer the grader could not settle in time. The learner sees a neutral
 * "checking your answer" state; nothing about the answer counts yet (no mastery, no
 * scorecard), and the item reads as answered-but-pending (`grading: 'checking'`, correct
 * null). When the background check finishes, recordAnswer runs exactly as it would have.
 */
function holdForChecking({ userId, session, item, userAnswer, ms, confidence, changes, settle }) {
  db.update('items', item.id, {
    user_answer: String(userAnswer == null ? '' : userAnswer),
    grading: 'checking',
    grading_started_at: new Date().toISOString(),
    ms: Number(ms || 0),
    confidence: ['sure', 'think', 'guess'].includes(confidence) ? confidence : null,
    answer_changes: Math.max(0, Math.min(50, Number(changes) || 0)),
  });
  const done = Promise.resolve(settle).then((final) => finishChecking({ userId, sessionId: session.id, itemId: item.id, userAnswer, ms, confidence, changes, final }))
    .catch((err) => {
      console.warn(`grading: background check of item ${item.id} failed (${err.message}); closing it as not accepted, flagged for review`);
      return finishChecking({ userId, sessionId: session.id, itemId: item.id, userAnswer, ms, confidence, changes, final: { status: 'unresolved', correct: null } });
    })
    .finally(() => checking.delete(item.id));
  checking.set(item.id, done);
  return { checking: true, correct: null, answer: null, rationale: null, feedback: null, errorTag: null };
}

/** Store the background verdict. An answer no judge could settle is NOT accepted, and flagged. */
function finishChecking({ userId, sessionId, itemId, userAnswer, ms, confidence, changes, final }) {
  const item = db.byId('items', itemId);
  if (!item || item.grading !== 'checking' || (item.correct !== null && item.correct !== undefined)) return null;
  const session = db.byId('sessions', sessionId);
  if (!session) return null;
  const settled = final && final.correct === true;
  return recordAnswer({
    userId, session, item, userAnswer, ms, confidence, changes,
    correct: settled,
    feedback: (final && final.feedback) || null,
    errorTag: settled ? null : (final && final.error_tag) || null,
    gradedBy: final && final.status === 'unresolved' ? 'unresolved' : (final && final.by) || 'judges',
  });
}

/**
 * Wait for the answers still being checked (block finish, session finish). An item
 * left 'checking' with no check running (the server restarted) is graded again now.
 */
async function settleChecking(itemIds, timeoutMs = 150000) {
  const ids = [...new Set(itemIds)];
  const waits = ids.map(async (id) => {
    const item = db.byId('items', id);
    if (!item || item.grading !== 'checking' || (item.correct !== null && item.correct !== undefined)) return;
    if (checking.has(id)) { await checking.get(id); return; }
    const session = db.byId('sessions', item.session_id);
    if (!session) return;
    // eslint-disable-next-line global-require
    const typed = require('./typed-grading');
    const final = await typed.runCascade(
      { question: item.prompt, reference: item.answer, accepted: item.accepts || [], learner: item.user_answer },
      { allowOutside: typed.outsideAllowed(item.user_id) },
    ).then((r) => ({ status: r.verdict === 'correct' ? 'accepted' : r.verdict === 'incorrect' ? 'rejected' : 'unresolved', correct: r.verdict === 'correct' ? true : r.verdict === 'incorrect' ? false : null, feedback: r.feedback, error_tag: r.error_tag, by: r.by }))
      .catch(() => ({ status: 'unresolved', correct: null }));
    finishChecking({ userId: item.user_id, sessionId: session.id, itemId: id, userAnswer: item.user_answer, ms: item.ms, confidence: item.confidence, changes: item.answer_changes, final });
  });
  let timer;
  await Promise.race([Promise.all(waits), new Promise((r) => { timer = setTimeout(r, timeoutMs); if (timer.unref) timer.unref(); })]);
  clearTimeout(timer);
  return ids.filter((id) => { const it = db.byId('items', id); return it && it.grading === 'checking' && (it.correct === null || it.correct === undefined); });
}

/** Where a held answer stands, for the page polling it. */
function checkingStatus(item) {
  if (item.grading === 'checking' && (item.correct === null || item.correct === undefined)) return { checking: true };
  return {
    checking: false,
    correct: item.correct,
    answer: item.answer,
    rationale: item.rationale,
    feedback: item.ai_feedback || null,
    errorTag: item.error_tag || null,
    graded_by: item.graded_by || null,
  };
}

/** Record a graded answer: the item, mastery, the scorecard, the level's progress. */
function recordAnswer({ userId, session, item, userAnswer, ms, confidence, changes, correct, feedback, errorTag, gradedBy = null }) {
  const grade = curriculum.getGrade(session.track_id, session.grade_id);
  const itemLevel = item.level || session.level || 1;
  const levelDifficulty = grade ? curriculum.levelPlan(grade, itemLevel).difficulty : item.difficulty;

  db.update('items', item.id, {
    user_answer: String(userAnswer == null ? '' : userAnswer),
    correct,
    ms: Number(ms || 0),
    error_tag: errorTag,
    ai_feedback: feedback,
    // What the learner said about their own certainty, and how many times they
    // revised a typed answer: two of the learning scorecard's cheapest strong
    // signals.
    confidence: ['sure', 'think', 'guess'].includes(confidence) ? confidence : null,
    answer_changes: Math.max(0, Math.min(50, Number(changes) || 0)),
    // How a typed answer the rules could not settle was decided; 'unresolved' means no
    // judge consensus, closed as not accepted and left for a person to review.
    ...(gradedBy ? { graded_by: gradedBy } : {}),
    ...(gradedBy === 'unresolved' ? { needs_review: true } : {}),
    ...(item.grading === 'checking' ? { grading: 'settled', grading_settled_at: new Date().toISOString() } : {}),
  });

  mastery.recordAttempt({
    userId,
    skillId: item.skill_id,
    correct,
    difficulty: item.difficulty,
    levelDifficulty,
    latencyMs: ms,
    errorTag,
    // An answer reached with the coach is weaker evidence of mastery than one
    // reached alone, and recordAttempt discounts it.
    hintUsed: !!item.coach_used,
    itemId: item.id,
  });

  // Exam answers still teach the scorecard about pace and certainty; placement
  // is left out, since it is deliberately pitched past the learner.
  if (session.kind !== 'placement') {
    scorecardHooks.onAnswer(userId, db.byId('items', item.id), { trackId: session.track_id });
  }

  if (session.kind === 'lesson' && session.enrollment_id) {
    const enrollment = db.byId('enrollments', session.enrollment_id);
    if (enrollment) db.update('enrollments', enrollment.id, { level_items: (enrollment.level_items || 0) + 1 });
  }

  // On a checkpoint, the moment the pass mark becomes unreachable the outcome is
  // settled and the teaching for the weak areas can start being written — while
  // the learner is still working through the last few questions. That head start
  // is what makes "help me learn" open on finished content instead of a spinner.
  if (curriculum.isCheckpoint(session.kind) && session.enrollment_id) {
    const enrollment = db.byId('enrollments', session.enrollment_id);
    const mark = curriculum.PASS_MARKS[session.kind];
    if (enrollment && mark) {
      remediation.startEarly({ userId, session, enrollment, kind: session.kind, required: mark });
    }
  }

  return {
    correct,
    answer: item.answer,
    rationale: item.rationale,
    feedback,
    errorTag,
  };
}

/** One quick recall question about the level just finished, drawn from whatever
 *  wobbled in that block. This is the per-level check; the end of the session
 *  gets a wider one. */
function blockRetentionItem({ userId, session, blockIndex }) {
  const items = itemsInBlock(session.id, blockIndex).filter((i) => i.correct !== null);
  if (!items.length) return null;
  const missed = items.filter((i) => !i.correct);
  const pool = missed.length ? missed : items;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const avgDifficulty = items.reduce((a, i) => a + i.difficulty, 0) / items.length;

  const entry = { skillId: pick.skill_id, difficulty: clampDifficulty(avgDifficulty - 0.5) };
  const grade = session.track_id && session.grade_id ? curriculum.getGrade(session.track_id, session.grade_id) : null;
  const [built] = bank.generateMany([grade ? gradeSkills.fitEntry(grade, entry) : entry]);
  return db.insert('items', {
    ...built,
    session_id: session.id,
    user_id: userId,
    role: 'retention',
    level: pick.level || session.level,
    block: blockIndex,
    index: 900 + blockIndex,
    user_answer: null,
    correct: null,
    ms: null,
    coach_used: false,
    retention_scope: 'level',
  });
}

/**
 * Called when every item in the current block has been answered: decide whether
 * the level is finished, level the learner up if it is, and hand back the one
 * recall question for that level.
 */
function resolveBlock({ userId, session, enrollment, grade, blockIndex }) {
  const blocks = [...(session.blocks || [])];
  const block = blocks.find((b) => b.index === blockIndex) || { index: blockIndex, level: session.level };
  const kind = block.kind || curriculum.levelKind(block.level, grade.pathLength, grade);

  // A lesson level is cleared by working through the lesson, not by a mastery
  // threshold: the check questions are there to make the reading stick, and
  // failing one should send the learner back over the lesson, not stall the path.
  // On a preview of a level ahead, nothing is cleared at all — the block is
  // marked resolved so the learner can carry on or finish, and the level they
  // are actually standing on is left exactly as it was.
  const result = session.preview
    ? { advanced: false, progress: mastery.levelProgress(userId, db.byId('enrollments', enrollment.id), grade) }
    : kind === 'lesson'
      ? mastery.completeLesson(userId, db.byId('enrollments', enrollment.id), grade)
      : mastery.tryLevelUp(userId, db.byId('enrollments', enrollment.id), grade);

  if (kind === 'lesson' && result.advanced) {
    const lesson = lessons.find(userId, enrollment, block.level);
    if (lesson) lessons.markComplete(lesson.id);
  }

  block.resolved = true;
  block.level_complete = result.advanced;
  blocks[blockIndex] = block;

  const fresh = db.byId('enrollments', enrollment.id);

  // A cleared level counts toward the Challenge Exam run only if it was earned
  // well, and only if the level actually moved. A block the learner sat well but
  // did not pass does not extend a run: they are still standing on the same
  // level, and staying there must not quietly earn the offer.
  if (result.advanced) {
    const blockItems = itemsInBlock(session.id, blockIndex).filter((i) => i.correct !== null);
    const blockAccuracy = blockItems.length
      ? blockItems.filter((i) => i.correct).length / blockItems.length
      : 0;
    mastery.recordLevelCleared({
      userId,
      enrollmentId: enrollment.id,
      level: block.level,
      accuracy: blockAccuracy,
      grade,
    });
  }

  const levels = [...new Set([...(session.levels || []), fresh.current_level])].sort((a, b) => a - b);
  db.update('sessions', session.id, {
    blocks,
    levels,
    end_level: fresh.current_level,
    level: fresh.current_level,
  });

  const retention = blockRetentionItem({ userId, session: db.byId('sessions', session.id), blockIndex });

  // A preview of a level ahead is not this learner's real work on it.
  if (!session.preview) {
    const blockItems = itemsInBlock(session.id, blockIndex);
    scorecardHooks.onBlockResolved(userId, {
      session, kind, level: block.level, items: blockItems, trackId: session.track_id,
    });
    // The after-level read: it waits a moment for feedback, then reads the level.
    learnerRecord.scheduleDebrief({
      userId, trackId: session.track_id, gradeId: session.grade_id, level: block.level, kind,
      source: 'level', sessionId: session.id, itemIds: blockItems.map((i) => i.id),
    });
  }

  const nextKind = fresh.status === 'active'
    ? curriculum.levelKind(fresh.current_level, grade.pathLength, grade)
    : null;

  return {
    level: block.level,
    kind,
    level_complete: !!block.level_complete,
    level_up: result.advanced ? result.level : null,
    progress: result.progress,
    next_level: fresh.current_level,
    next_kind: nextKind,
    can_continue: fresh.status === 'active',
    retention,
  };
}

/**
 * Pass or fail a checkpoint.
 *
 * A pass clears the gate and moves the level, or graduates the track. Under the
 * mark there is no waiting: the attempt is read for what actually went wrong and
 * the learner chooses between retaking it on freshly written questions and being
 * taught the weak areas first, with the retry always available. That is why the
 * old cooldown is gone — it existed to stop someone grinding the same questions
 * until the draw was kind, and every attempt after the first is now a different
 * quiz.
 */
function resolveCheckpoint({ userId, session, enrollment, grade, accuracy }) {
  const kind = session.kind;
  const nominal = curriculum.PASS_MARKS[kind];
  if (!nominal) return null;
  // The likelihood-ratio decision (evidence P3; CHECKPOINT_SPRT, not for the owner):
  // on the quiz's own questions, with an exam ended early judged on decisive evidence.
  let decision = null;
  if (curriculum.checkpointSprtOn({ base: ownerBaseOf(userId) })) {
    const rows = itemsFor(session.id).filter((i) => i.role === 'exam' && !i.reserved);
    const answered = rows.filter((i) => i.correct !== null && i.correct !== undefined);
    if (rows.length) {
      decision = curriculum.passDecision(kind, {
        correct: answered.filter((i) => i.correct).length,
        answered: answered.length,
        skipped: rows.filter((i) => i.skipped && (i.correct === null || i.correct === undefined)).length,
        planned: rows.length,
      });
    }
  }
  // What the learner is told was needed: the share of the quiz the decision asks for.
  const mark = decision ? decision.required : nominal;
  const decisionNote = decision ? { decided_by: decision.decided, needed: decision.needed } : {};
  if (decision ? decision.passed : accuracy >= nominal) {
    const result = mastery.clearCheckpoint(enrollment, grade, kind);
    // A checkpoint joins the run on its own score, not on the fact that it was
    // passed. Clearing a Master quiz at 76% is a level cleared at 76%, and
    // counting it as a 90% level would let the hardest levels on the path buy
    // the offer the run is supposed to be evidence for.
    mastery.recordLevelCleared({
      userId,
      enrollmentId: enrollment.id,
      level: enrollment.current_level,
      accuracy,
      grade,
    });
    remediation.clearFor(userId, enrollment.id);
    return { kind, passed: true, required: mark, accuracy, ...decisionNote, ...result };
  }

  // The learner stays standing on the checkpoint level: the level itself is the
  // gate, and nothing else about their position changes.
  db.update('enrollments', enrollment.id, {
    checkpoint_retry_at: null,
    checkpoint_attempts: (enrollment.checkpoint_attempts || 0) + 1,
  });
  const fresh = db.byId('enrollments', enrollment.id);
  const row = remediation.open({
    userId,
    session,
    enrollment: fresh,
    kind,
    accuracy,
    required: mark,
  });
  // Both doors are prepared now rather than when they are opened: the diagnosis
  // (in remediation.open) and the retry's questions.
  prefetchRetry({ userId, enrollment: fresh, grade, kind, remediationId: row.id });
  return {
    kind,
    passed: false,
    required: mark,
    accuracy,
    ...decisionNote,
    attempt: row.attempt,
    remediation_id: row.id,
    weak_areas: row.areas.map((a) => ({ skill_id: a.skill_id, skill_name: a.skill_name, accuracy: a.accuracy })),
  };
}

/**
 * The weak areas of a written attempt, read off the rubric rather than off
 * missed questions.
 *
 * A criterion scoring under three out of four is an area to work on, and because
 * every criterion names a skill the drills behind it are ordinary drill
 * questions on that skill — which is why the criterion carries a `skill_id` at
 * all.
 *
 * Two kinds are excluded, and both for the same reason: there is nothing to
 * practise. A criterion that could not be marked is not a known weakness, and a
 * criterion about how the writing is put together has no bank of questions
 * behind it — sending a learner to drill "is this paragraph in a sensible
 * order" would send them nowhere.
 */
function areasFromEssay(essay, result) {
  const out = [];
  for (const marked of (result && result.criteria) || []) {
    if (typeof marked.score !== 'number' || marked.score >= 3) continue;
    const criterion = (essay.criteria || [])[marked.index];
    if (!criterion || criterion.introduced === false) continue;
    out.push({
      skill_id: criterion.skill_id,
      skill_name: criterion.skill_name || curriculum.skillName(criterion.skill_id),
      asked: 1,
      correct: marked.score >= 2 ? 1 : 0,
      accuracy: marked.score / 4,
      headline: criterion.name,
      missed: [{
        prompt: essay.prompt,
        answer: `Full marks looks like: ${criterion.levels[3]}${marked.next_step ? ` Next step: ${marked.next_step}` : ''}`,
        user_answer: marked.evidence || null,
      }],
    });
  }
  return out;
}

/**
 * Pass or fail a written checkpoint.
 *
 * The same shape as resolveCheckpoint, and deliberately reading from the same
 * places: a pass clears the gate through `mastery.clearCheckpoint`, a fail opens
 * the same two doors. What differs is where the mark comes from — the essay, not
 * the quick check — and that there is nothing to prefetch on a fail, because a
 * rewrite is a new topic rather than a new set of questions.
 */
/**
 * What a marked essay says about this learner, as a line the next lesson's
 * writer reads (scorecard hooks' conclusions): the mark, the weakest
 * criterion, and the next step it was given. Only a real mark is recorded.
 */
function noteEssayOutcome({ userId, session, enrollment, essay, result }) {
  if (!result || result.source !== 'ai' || !essay) return;
  const marked = (result.criteria || []).filter((c) => typeof c.score === 'number');
  if (!marked.length) return;
  const weakest = [...marked].sort((a, b) => a.score - b.score)[0];
  const name = ((essay.criteria || [])[weakest.index] || {}).name || 'one criterion';
  const strongest = [...marked].sort((a, b) => b.score - a.score)[0];
  const strongName = ((essay.criteria || [])[strongest.index] || {}).name || '';
  db.insert('level_feedback', {
    user_id: userId,
    session_id: session ? session.id : null,
    block: 'essay',
    level: enrollment.current_level,
    kind: 'essay',
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    accuracy: result.overall,
    conclusion: `Level ${enrollment.current_level} (written ${essay.source === 'revision' ? 'revision' : 'piece'}): `
      + `scored ${Math.round(result.overall * 100)}% against the rubric; weakest on ${name} (${weakest.score}/4)`
      + `${weakest.next_step ? `, next step: ${String(weakest.next_step).slice(0, 160)}` : ''}`
      + `${strongName && strongest.score >= 3 ? `; strongest on ${strongName} (${strongest.score}/4)` : ''}.`,
  });
}

function resolveEssayCheckpoint({ userId, session, enrollment, grade, essay, result }) {
  const mark = curriculum.PASS_MARKS.essay;
  const accuracy = result && typeof result.overall === 'number' ? result.overall : 0;
  try {
    noteEssayOutcome({ userId, session, enrollment, essay, result });
  } catch (err) {
    console.warn(`essays: recording the outcome failed: ${err.message}`);
  }

  if (accuracy >= mark) {
    const cleared = mastery.clearCheckpoint(enrollment, grade, 'essay');
    mastery.recordLevelCleared({
      userId,
      enrollmentId: enrollment.id,
      level: enrollment.current_level,
      accuracy,
      grade,
    });
    remediation.clearFor(userId, enrollment.id);
    return { kind: 'essay', passed: true, required: mark, accuracy, ...cleared };
  }

  db.update('enrollments', enrollment.id, {
    checkpoint_retry_at: null,
    checkpoint_attempts: (enrollment.checkpoint_attempts || 0) + 1,
  });
  const fresh = db.byId('enrollments', enrollment.id);

  // Nothing on the rubric came back weak, and they are still under the mark:
  // spread thin. Take the level's focus skill as the one area, the same way
  // areasFrom falls back to the whole attempt.
  // A spoken checkpoint is marked on its tap-to-answer questions: their misses are the areas.
  const weak = essay && essay.mode === 'oral'
    ? remediation.areasFrom(itemsFor(session.id).filter((i) => (i.block || 0) === (essay.block || 0)))
    : areasFromEssay(essay, result);
  const focusSkill = curriculum.levelPlan(grade, enrollment.current_level).focus;
  const areas = weak.length ? weak : [{
    skill_id: focusSkill,
    skill_name: curriculum.skillName(focusSkill),
    asked: 1,
    correct: 0,
    accuracy,
    headline: 'The whole essay',
    missed: [{ prompt: essay ? essay.prompt : '', answer: '', user_answer: null }],
  }];

  const row = remediation.open({
    userId,
    session,
    enrollment: fresh,
    kind: 'essay',
    accuracy,
    required: mark,
    areas,
  });

  return {
    kind: 'essay',
    passed: false,
    required: mark,
    accuracy,
    attempt: row.attempt,
    remediation_id: row.id,
    weak_areas: row.areas.map((a) => ({ skill_id: a.skill_id, skill_name: a.skill_name, accuracy: a.accuracy })),
  };
}

/**
 * The recap's summary line after a passed Final, or null for any other
 * sitting. The rule-based line ("the next one steps up") is about moving to a
 * next level, which a graduated or held Final does not do (learner follow-ups
 * 2026-10-24).
 */
function outcomeSummary(checkpoint, accuracy, levels) {
  if (!checkpoint || !checkpoint.passed || checkpoint.kind !== 'graduation') return null;
  const span = levels && levels.length > 1 ? ` across levels ${levels[0]} to ${levels[levels.length - 1]}` : '';
  const lead = `${accuracy >= 0.85 ? 'Strong session' : 'Solid session'}${span}.`;
  if (checkpoint.coverage_held) return `${lead} The Final is passed. What comes next is proving the objectives graduation waits on, not another Final.`;
  if (checkpoint.skill_held) return `${lead} The Final is passed. Graduation now waits on this stage's measured skills, not another Final.`;
  if (checkpoint.graduated) return `${lead} The Final is passed and this grade is complete.`;
  return null;
}

/** Rule-based analysis. Runs when the model is unavailable, and as the schema
 *  the model output has to match — so both paths produce the same shape. */
function ruleBasedAnalysis(items, session) {
  const answered = items.filter((i) => i.correct !== null && i.role !== 'retention');
  const accuracy = answered.length ? answered.filter((i) => i.correct).length / answered.length : 0;
  const bySkill = {};
  for (const it of answered) {
    const s = bySkill[it.skill_id] || (bySkill[it.skill_id] = { skill_id: it.skill_id, name: it.skill_name, asked: 0, correct: 0, ms: 0, coached: 0 });
    s.asked++;
    if (it.correct) s.correct++;
    if (it.coach_used) s.coached++;
    s.ms += it.ms || 0;
  }
  const rows = Object.values(bySkill).map((s) => ({ ...s, accuracy: s.correct / s.asked, avgMs: Math.round(s.ms / s.asked) }));
  // A skill carried by the coach is not solid, however the answers came out.
  const solid = rows.filter((r) => r.accuracy >= 0.8 && r.coached / r.asked < 0.5);
  const fragile = rows.filter((r) => (r.accuracy >= 0.4 && r.accuracy < 0.8) || (r.accuracy >= 0.8 && r.coached / r.asked >= 0.5));
  const broken = rows.filter((r) => r.accuracy < 0.4);

  const stretch = answered.filter((i) => i.role === 'stretch');
  const typeIn = answered.filter((i) => i.format !== 'multiple_choice');
  const mc = answered.filter((i) => i.format === 'multiple_choice');
  const avgMs = answered.length ? answered.reduce((a, i) => a + (i.ms || 0), 0) / answered.length : 0;

  const observed_signals = {};
  if (stretch.length >= 2) {
    observed_signals.challenge_appetite = stretch.filter((i) => i.correct).length / stretch.length;
  }
  if (typeIn.length >= 2 && mc.length >= 2) {
    const typeInAcc = typeIn.filter((i) => i.correct).length / typeIn.length;
    const mcAcc = mc.filter((i) => i.correct).length / mc.length;
    // Producing answers cold as well as recognizing them is evidence that
    // retrieval practice suits this learner.
    observed_signals.retrieval_style = Math.max(0, Math.min(1, 0.5 + (typeInAcc - mcAcc)));
  }
  if (avgMs > 0) {
    observed_signals.practice_density = avgMs < 20000 ? 0.7 : avgMs > 60000 ? 0.3 : 0.5;
  }
  const coachedShare = answered.length ? answered.filter((i) => i.coach_used).length / answered.length : 0;
  if (coachedShare > 0) {
    // Leaning on the coach is evidence that fuller explanation helps.
    observed_signals.explanation_depth = Math.min(1, 0.5 + coachedShare);
  }

  const levels = session && session.levels ? session.levels : [];
  const span = levels.length > 1 ? ` across levels ${levels[0]} to ${levels[levels.length - 1]}` : '';
  const summary = accuracy >= 0.85
    ? `Strong session${span}. The level is no longer the constraint, so the next one steps up.`
    : accuracy >= 0.6
      ? `Solid session${span} with a few soft spots, which the next one reviews first.`
      : `This material is not settled yet${span}. The next session stays here and rebuilds the weakest skill.`;

  return {
    source: 'rules',
    accuracy,
    summary,
    learned: solid.map((r) => r.name),
    fragile: fragile.map((r) => r.name),
    gaps: broken.map((r) => r.name),
    skills: rows,
    levels,
    traits: [],
    observed_signals,
    next_session: {
      difficulty_delta: accuracy >= 0.85 ? 0.5 : accuracy <= 0.5 ? -0.5 : 0,
      review_skills: [...broken, ...fragile].slice(0, 3).map((r) => r.skill_id),
      note: '',
    },
    retention_questions: [],
  };
}

/**
 * The end-of-session recall set. Unlike the per-level question, this one spans
 * the whole sitting: it samples the skills that wobbled across every level
 * covered, oldest first, so the start of the session is revisited and not just
 * the last thing touched.
 */
function retentionPlan(sessionItems) {
  const answered = sessionItems.filter((i) => i.correct !== null && i.role !== 'retention');
  if (!answered.length) return [];

  const byLevel = {};
  for (const item of answered) {
    const level = item.level || 0;
    (byLevel[level] = byLevel[level] || []).push(item);
  }
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);

  // One question per level covered, taken from what was missed there; then fill
  // up to three from the weakest remaining skills.
  const plan = [];
  const usedSkills = new Set();
  for (const level of levels) {
    const items = byLevel[level];
    const missed = items.filter((i) => !i.correct);
    const pool = (missed.length ? missed : items).filter((i) => !usedSkills.has(i.skill_id));
    const pick = pool[0] || (missed.length ? missed[0] : items[0]);
    if (!pick) continue;
    usedSkills.add(pick.skill_id);
    const avg = items.reduce((a, i) => a + i.difficulty, 0) / items.length;
    plan.push({ skillId: pick.skill_id, difficulty: clampDifficulty(avg - 0.5), level, role: 'retention' });
    if (plan.length >= 3) break;
  }

  if (plan.length < 3) {
    const remaining = answered
      .filter((i) => !usedSkills.has(i.skill_id))
      .sort((a, b) => Number(a.correct) - Number(b.correct));
    for (const item of remaining) {
      if (plan.length >= 3) break;
      usedSkills.add(item.skill_id);
      plan.push({
        skillId: item.skill_id,
        difficulty: clampDifficulty(item.difficulty - 0.5),
        level: item.level,
        role: 'retention',
      });
    }
  }
  return plan;
}

/**
 * Finish a session: score everything answered across every block, award XP,
 * update the streak, ask the analyst what happened over the whole sitting, fold
 * the result into the learner profile, and resolve the level or checkpoint.
 */
async function finish({ userId, session }) {
  const items = itemsFor(session.id);
  const graded = items.filter((i) => i.correct !== null && i.role !== 'retention');
  const accuracy = graded.length ? graded.filter((i) => i.correct).length / graded.length : 0;
  const profile = learner.getProfile(userId);
  // The levels the learner answered questions at, not the stored list: closing a
  // level appends the one they were moved on to, and a recap that says "levels
  // 42 to 43" about a sitting that never saw 43 is telling them something false.
  const levels = workedLevels(session);

  // The deep analysis is the slowest call in the app — it reads a whole sitting
  // and updates what we know about how this person learns. Making the learner
  // watch a spinner for it would be the wrong trade: the rule-based recap is
  // ready instantly and is honest, so it goes out now and the richer one
  // replaces it on the session record when it lands.
  const rules = ruleBasedAnalysis(items, { ...session, levels });
  let analysis = rules;
  // Set once the checkpoint below is resolved: a passed Final that graduated or
  // is held must not be summed up as "the next one steps up" (outcomeSummary).
  let outcomeLine = null;
  const deepAnalysis = ai.analyzeSession({ items: graded, profile, session, levels, userId })
    .then((result) => {
      if (!result) return null;
      const merged = { ...rules, ...result, source: 'ai' };
      if (outcomeLine) merged.summary = outcomeLine;
      db.update('sessions', session.id, { analysis: merged, analysis_upgraded_at: new Date().toISOString() });
      learner.absorbAnalysis(userId, merged);
      return merged;
    })
    .catch((err) => {
      console.warn(`ai: session analysis failed: ${err.message}`);
      return null;
    });

  // A caller that wants to wait can; the route does not.
  const pending = deepAnalysis;

  const xp = mastery.xpForItems(items.filter((i) => i.correct !== null));
  // The streak and the XP, on the learner's own calendar day with one grace day
  // (services/streak.js; STREAK_LOCAL_GRACE, and the owner keeps the old UTC rule).
  const streak = require('./streak').record(userId, { xp });

  db.update('sessions', session.id, {
    ended_at: new Date().toISOString(),
    score: accuracy,
    analysis,
    xp_awarded: xp,
  });

  // A basketball court sitting counts toward the weekly load cap (implementer E's
  // SKILL_LOAD_CAPS, services/skill-dose.js): its minutes, from start to finish,
  // at most two hours. A preview or a placement is not training load.
  if (session.track_id === 'basketball' && !session.preview && session.kind !== 'placement') {
    const startedAt = Date.parse(session.started_at || '');
    const minutes = Number.isFinite(startedAt) ? Math.min(120, Math.round((Date.now() - startedAt) / 60000)) : 0;
    if (minutes > 0) {
      try {
        // eslint-disable-next-line global-require
        require('./skill-dose').logLoad(userId, 'basketball', minutes);
      } catch (err) {
        console.warn(`sessions: basketball load not logged (${err.message})`);
      }
    }
  }

  // The rule-based signals go in now; the deep analysis folds its own in when it
  // arrives, so the profile is never left waiting on a slow call either.
  learner.absorbAnalysis(userId, analysis);

  // A checkpoint is one long block that never goes through block-finish, so its
  // level patterns (fatigue, recovery after a miss) are read here instead.
  if (curriculum.isCheckpoint(session.kind) && !session.preview) {
    scorecardHooks.onBlockResolved(userId, {
      session, kind: session.kind, level: session.level, items: graded, trackId: session.track_id,
    });
    learnerRecord.scheduleDebrief({
      userId, trackId: session.track_id, gradeId: session.grade_id, level: session.level, kind: session.kind,
      source: 'checkpoint', sessionId: session.id, itemIds: graded.map((i) => i.id),
    });
  }
  if (session.kind !== 'placement' && !session.preview) {
    scorecardHooks.onSessionFinished(userId, db.byId('sessions', session.id), items);
  }

  let progress = null;
  let levelResult = null;
  let checkpoint = null;
  const enrollment = session.enrollment_id ? db.byId('enrollments', session.enrollment_id) : null;
  const grade = enrollment ? curriculum.getGrade(enrollment.track_id, enrollment.grade_id) : null;
  // A preview of a level ahead is real work — it is graded, it feeds mastery, it
  // is worth XP and it is analysed — but it moves nothing. The whole block below
  // is the "moving things" part: XP onto the track, a level up, a checkpoint
  // passed, a run extended. None of it happens for a level the learner is only
  // looking at, which is what makes it safe to let them look.
  if (enrollment && grade && !session.preview) {
    db.update('enrollments', enrollment.id, { xp: (enrollment.xp || 0) + xp, last_session_at: new Date().toISOString() });
    if (session.kind === 'essay') {
      // The quick check fed mastery and the analysis as usual; the checkpoint is
      // decided by the writing, which is the only thing the level is about.
      const essay = essays.forSession(userId, session.id, 0)
        || essays.find(userId, enrollment, session.level, session.blocks[0].attempt);
      const result = essay && (essay.attempts || []).length
        ? essay.attempts[essay.attempts.length - 1]
        : null;
      checkpoint = resolveEssayCheckpoint({ userId, session, enrollment, grade, essay, result });
      progress = mastery.levelProgress(userId, db.byId('enrollments', enrollment.id), grade);
    } else if (curriculum.isCheckpoint(session.kind)) {
      checkpoint = resolveCheckpoint({ userId, session, enrollment, grade, accuracy });
      progress = mastery.levelProgress(userId, db.byId('enrollments', enrollment.id), grade);
    } else {
      // A block the learner walked away from mid-way is still evaluated here, so
      // finishing early never costs a level that was actually earned. A lesson
      // level only clears through its own block, which resolveBlock handles.
      levelResult = mastery.tryLevelUp(userId, db.byId('enrollments', enrollment.id), grade);
      progress = levelResult.progress;
    }
  }

  // A Final that graduated, or passed with graduation held (coverage gate or
  // skill stage gate), ends this grade's levels: the recap says what comes next.
  outcomeLine = outcomeSummary(checkpoint, accuracy, levels);
  if (outcomeLine) {
    analysis = { ...analysis, summary: outcomeLine };
    const stored = db.byId('sessions', session.id);
    const base = stored && stored.analysis && stored.analysis.source === 'ai' ? stored.analysis : analysis;
    db.update('sessions', session.id, { analysis: { ...base, summary: outcomeLine } });
  }

  const fresh = enrollment ? db.byId('enrollments', enrollment.id) : null;
  return {
    analysisPending: pending,
    accuracy,
    xp,
    streak,
    analysis,
    progress,
    levels,
    levelUp: levelResult && levelResult.advanced ? levelResult.level : null,
    nextKind: fresh && grade && fresh.status === 'active'
      ? curriculum.levelKind(fresh.current_level, grade.pathLength, grade)
      : null,
    nextLevel: fresh ? fresh.current_level : null,
    checkpoint,
    // Read after the run has been updated, so an exam earned on the level just
    // cleared is offered in the same breath as clearing it.
    skip: fresh && grade ? mastery.skipOffer(userId, fresh, grade) : null,
    retentionPlan: retentionPlan(items),
  };
}

module.exports = {
  createSession,
  createDrillSession,
  createSkipExamSession,
  scoreDrill,
  scoreSkipExam,
  planSkipExam,
  examPromptsSeen,
  prefetchRetry,
  claimPrefetchedRetry,
  addBlock,
  buildBlock,
  itemsFor,
  itemsInBlock,
  workDone,
  workedLevels,
  answer,
  settleChecking,
  checkingStatus,
  resolveBlock,
  finish,
  sanitize,
  planLesson,
  interleaveMode,
  spreadBySkill,
  curveReviews,
  planCheckpoint,
  planEssayQuiz,
  ruleBasedAnalysis,
  outcomeSummary,
  areasFromEssay,
  resolveEssayCheckpoint,
  retentionPlan,
  blockRetentionItem,
  generateWithPreference,
  resolveCheckpoint,
};
