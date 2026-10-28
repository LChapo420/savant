/**
 * The per-user level editor.
 *
 * One learner approaches one level. This writes the version of that level meant
 * for them: the shared base page, or the level's own plan, rewritten around how
 * they learn, what they are interested in, and what they have said about the
 * levels they have already done.
 *
 * ## Prefetched, never awaited
 *
 * A rewrite is minutes of work, so a learner never waits on it. It is started one
 * level ahead — while they are reading the level they are on — and stored, so that
 * arriving at the next level is a database read rather than a model call. Every
 * entry point returns immediately and the work continues in the background; the
 * learner gets the base page if it is not ready, and gets it silently.
 *
 * ## Everything here degrades
 *
 * Off, over budget, model down, or an answer that fails the contract: the learner
 * gets the level they would have got anyway. There is no path through this file
 * that produces an error on the page, and none that produces a broken one — every
 * candidate is put through the same `inspect`/`truncated` contract a generated page
 * is, because a learner on a paid tier must not be the one who finds a bad page.
 *
 * ## The model
 *
 * `personalize`: DeepSeek V4.1 Flash on OpenRouter — the model the base pages are
 * generated with — backed by MiMo V2.6 Pro, and nothing else. It is passed
 * `lane: 'background'` so a minutes-long rewrite cannot sit in the chat queue and
 * hold the coach's turns behind it.
 *
 * ## The learning scorecard
 *
 * The brief (services/details.js) carries the learner's 100-stat scorecard as
 * ranked instructions, so the rewrite is shaped by how they measurably learn as
 * well as by what they said. Two things are layered on here (services/personalize.js):
 * a small share of levels are a holdout and are not rewritten at all, so tailored
 * pages can be compared with the shared one; and some levels deliberately try one
 * way of teaching, which the next level's result is credited to.
 */
const LAYOUT = require('../config/level-layout');
const curriculum = require('../config/curriculum');
const baseLessons = require('../config/base-lessons');
const subscriptions = require('../config/subscriptions');
const db = require('../config/db');
const learner = require('./learner');
const details = require('./details');
const personalize = require('./personalize');

// The validator and the contract text are shared with the generator on purpose:
// a tailored page is held to exactly what a generated one is.
const editor = require('../scripts/generate-base-lesson');
const { OUTPUT_FORMAT } = require('../scripts/lib/lesson-prompt-template');

/** What one learner's level is allowed to cost, in tokens. */
const MAX_TOKENS = Number(process.env.LEVEL_EDIT_MAX_TOKENS || 60000);

/**
 * Writes in flight, keyed by learner and level.
 *
 * The same pattern `services/lessons.js` uses: a prefetch and an on-demand request
 * for the same level collapse into one call rather than paying for it twice.
 */
const inFlight = new Map();

const key = (userId, trackId, gradeId, level) => `${userId}:${trackId}:${gradeId}:${level}`;

/**
 * The stored tailored page for a level, or null.
 *
 * Deliberately does not check whether it is still current — a stale tailored page
 * is still the best thing we have for that learner, and `stale()` is what decides
 * whether to write a new one. Serving turns on existence; rewriting turns on
 * freshness.
 *
 * @returns {{html: string, meta: object}|null}
 */
function forLevel(userId, trackId, gradeId, level) {
  const row = db.findOne('level_edits', (e) => e.user_id === userId
    && e.track_id === trackId && e.grade_id === gradeId && e.level === level);
  // A row with a problem is a failure that was recorded for diagnosis, not a page.
  // Never served, however complete its html looks — the whole reason a rejected
  // page is kept is so it can be read later, and a page kept for reading is not a
  // page kept for serving.
  if (!row || !row.html || row.problem) return null;
  return { html: row.html, meta: row };
}

/** Is a write in flight for this learner on this course? */
function pendingFor(userId, trackId, gradeId) {
  for (const k of inFlight.keys()) {
    if (k.startsWith(`${userId}:${trackId}:${gradeId}:`)) return true;
  }
  return false;
}

/**
 * Has this learner's tailored page for a level gone out of date?
 *
 * Two things make it stale: the details it was written from have changed (new
 * feedback, an interest they edited, another analysed session), or the base page it
 * was made from has been regenerated underneath it. Both are cheap to check and
 * both are compared by value rather than by time, because a clock cannot tell the
 * difference between a page written a minute ago and a page written a minute ago
 * from out-of-date facts.
 */
function stale(row, userId, where) {
  if (!row) return true;
  if (row.details_hash !== details.briefHash(userId, where)) return true;
  const base = baseLessons.get(where.trackId, where.gradeId, where.level);
  // A page authored from a plan rather than edited from a base has nothing to
  // compare against, so only the details can make it stale.
  if (row.basis === 'base' && (!base || base.mtime !== row.base_mtime)) return true;
  return false;
}

/**
 * The prompt for one level, built for one learner.
 *
 * Two cases, and they are genuinely different work rather than the same work with
 * a different noun:
 *
 *   **edit** — a page exists. Rewrite it. The page already embodies a theme, a
 *   game engine and a structure that are known to satisfy the contract, so the
 *   instruction is to change what does not suit this learner rather than to invent
 *   the page again.
 *
 *   **write** — no page exists. The level is a practice, quiz or checkpoint level,
 *   which the adaptive session serves as questions rather than as a page. Here the
 *   model is writing a teaching page for the level from its plan.
 *
 * Both end with the same contract, and both are checked against it.
 */
function buildEditorPrompt(userId, where, basis, baseHtml, experiment = null) {
  const grade = curriculum.getGrade(where.trackId, where.gradeId);
  const plan = curriculum.levelPlan(grade, where.level);
  const entry = LAYOUT.entryFor(grade, where.level) || {};
  const brief = details.brief(userId, where);

  const head = [
    `You are writing one level of a course for one specific learner.`,
    '',
    `- SUBJECT: ${curriculum.getTrack(where.trackId).name}`,
    `- LEVEL: ${where.level}`,
    `- WHAT THIS LEVEL IS: ${entry.kind || plan.kind}`,
    `- TOPIC: ${entry.title || plan.focus || '(unnamed level)'}`,
    `- WHAT IT COVERS: ${entry.covers || ''}`,
    `- FOCUS SKILL: ${plan.focus || ''}`,
    `- DIFFICULTY: ${plan.difficulty}`,
    '',
  ].join('\n');

  const task = basis === 'base'
    ? [
      'Below is the current version of this level — the same page every learner on',
      'this course gets. Rewrite it as the version for the learner described above.',
      '',
      'Do all of these, and be specific rather than tasteful about it:',
      '',
      '1. **Use their interests.** Every worked example, practice sentence, scenario',
      '   and passage should be about something they said they care about, wherever',
      '   the subject allows it. If they said basketball, then the sentence being',
      '   analysed is about basketball. This is the single most visible thing you can',
      '   do for them and the easiest to skip; do not skip it.',
      '2. **Act on what they said about earlier levels.** If they said a page had too',
      '   much text before anything happened, put something to do near the top. If',
      '   they said it was too easy, raise the difficulty. Quote nothing back at them',
      '   and do not mention that they said it.',
      '3. **Honour the stated preferences** in the sections above — depth, order,',
      '   whether an example or the rule comes first, whether they type answers.',
      '4. **Keep what works.** The theme, the game engine and the structure already',
      '   satisfy the contract; keep them unless they conflict with the above.',
      '',
      'Do not change what the level teaches, and do not weaken it: this is a lesson',
      'they have to be able to pass the quiz after.',
      '',
      'Keep the page whole and working. Every control must still work, the root',
      'element must keep its id, and the page must still end with its Finish Lesson',
      'button calling window.polymathFinishLesson().',
      '',
      '=== THE CURRENT PAGE ===',
      baseHtml,
      '=== END OF THE CURRENT PAGE ===',
    ].join('\n')
    : [
      'No page exists for this level yet — the app serves it as questions. Write the',
      'teaching page for it, for the learner described above: what this level is, why',
      'it matters, worked examples, and something they can do rather than read.',
      '',
      'Use their interests for every example and practice sentence, wherever the',
      'subject allows. That is the point of writing this for them rather than for',
      'everybody, and a page that could have been written for anyone has wasted the',
      'work.',
      '',
      'This page teaches; it does not test. The learner still answers the level\'s',
      'questions in the app afterwards, so do not try to reproduce them and do not',
      'claim to mark anything. A quiz or exam level is revised here, not passed here.',
      '',
      'End with a Finish Lesson button that calls window.polymathFinishLesson(),',
      'exactly as a lesson page does. What that button does for a level of this kind',
      'is decided by the app, not by the page.',
    ].join('\n');

  // How this level should teach this learner, from their own record on its
  // objective (services/adaptation.js): worked examples or problems first, how
  // long, which earlier objectives to bring back. Only with
  // ADAPTIVE_TEACHING=on; it restates what the level must cover word for word,
  // and changes none of it.
  // eslint-disable-next-line global-require
  const adaptation = require('./adaptation');
  let howLines = [];
  if (adaptation.mode() === 'on') {
    // eslint-disable-next-line global-require
    const db = require('../config/db');
    const enrollment = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === where.trackId && e.grade_id === where.gradeId);
    const adapted = enrollment ? adaptation.planForLevel({ userId, enrollment, level: where.level }) : null;
    howLines = adaptation.promptLines(adapted);
  }
  const how = howLines.length ? `${howLines.join('\n')}\n` : '';

  // One way of teaching tried on purpose for this level, and judged by the result.
  const trial = experiment
    ? `FOR THIS LEVEL SPECIFICALLY (this overrides any instruction above on the same point):\n${experiment.text}\n`
    : '';

  return [
    head,
    brief,
    '',
    how,
    trial,
    task,
    '',
    OUTPUT_FORMAT,
  ].join('\n');
}

/**
 * Write one learner's version of one level, and store it. Safe to call repeatedly.
 *
 * @param {{userId: number, enrollment: object, grade: object, level: number}} args
 * @returns {Promise<{kind: string, html?: string, meta?: object}>} what the caller
 *   should serve — a tailored page, the base page, or nothing at all.
 */
async function ensure({ userId, enrollment, grade, level }) {
  const where = { trackId: enrollment.track_id, gradeId: enrollment.grade_id, level };

  // Not a paying account: not even a queue entry, so this costs nothing.
  const profile = learner.getProfile(userId);
  const user = db.byId('users', userId);
  if (!subscriptions.canEditLevels(user, profile)) return null;

  const existing = db.findOne('level_edits', (e) => e.user_id === userId
    && e.track_id === where.trackId && e.grade_id === where.gradeId && e.level === level);
  if (existing && !stale(existing, userId, where)) return forLevel(userId, where.trackId, where.gradeId, level);

  // A holdout level is the shared page on purpose, so tailored pages have
  // something to be measured against. The arm is a hash of learner and level, so
  // this is the same answer every time and never a rewrite skipped by chance.
  const { arm, experiment } = personalize.armFor(userId, where);
  if (arm === 'holdout') {
    const shared = baseLessons.get(where.trackId, where.gradeId, level);
    return shared ? { kind: 'base', html: shared.html, meta: shared.meta, arm } : null;
  }

  const k = key(userId, where.trackId, where.gradeId, level);
  if (inFlight.has(k)) return inFlight.get(k);

  const job = (async () => {
    const base = baseLessons.get(where.trackId, where.gradeId, level);
    const basis = base ? 'base' : 'authored';
    const entry = LAYOUT.entryFor(grade, level) || {};
    const prompt = buildEditorPrompt(userId, where, basis, base ? base.html : null, experiment);

    // Required lazily for the same reason services/details.js does it: ai.js
    // reaches back into the learner profile, and a top-level require would close
    // the loop at load time.
    // eslint-disable-next-line global-require
    const ai = require('./ai');
    const started = Date.now();

    const raw = await ai.talkDetail({
      role: 'personalize',
      task: 'level_editor',
      userId,
      lane: 'background',
      maxTokens: MAX_TOKENS,
      system: 'You write and revise interactive teaching pages. You return only the '
        + 'complete page, with no commentary before or after it.',
      messages: [{ role: 'user', content: prompt }],
    });

    // No answer, over budget, or the model off: the learner gets what they would
    // have got anyway. This is the normal path when anything is wrong.
    if (!raw || !raw.text) {
      return base ? { kind: 'base', html: base.html, meta: base.meta } : { kind: 'ordinary' };
    }

    const html = editor.extractHtml(raw.text);
    const problem = editor.truncated(html) || editor.inspect(html)
      || personalize.checkAgainstBase(html, base ? base.html : null);

    if (problem) {
      // The rejected page is kept, not thrown away. A note saying only that
      // something was wrong is not enough to fix it — the next person needs to see
      // what came back. `forLevel` refuses any row carrying a problem, so keeping it
      // costs nothing and is the difference between a diagnosable failure and a
      // shrug.
      console.warn(`level-editor: ${where.trackId}/${where.gradeId} level ${level} `
        + `for user ${userId} was rejected: ${problem}`);
      db.upsert('level_edits',
        (e) => e.user_id === userId && e.track_id === where.trackId
          && e.grade_id === where.gradeId && e.level === level,
        () => ({
          user_id: userId,
          track_id: where.trackId,
          grade_id: where.gradeId,
          level,
          kind: LAYOUT.kindOf(grade, level, grade.pathLength),
          basis,
          html,
          details_hash: details.briefHash(userId, where),
          base_mtime: base ? base.mtime : null,
          model: raw.model,
          seconds: Math.round((Date.now() - started) / 1000),
          problem,
        }));
      return base ? { kind: 'base', html: base.html, meta: base.meta } : { kind: 'ordinary' };
    }

    const row = db.upsert('level_edits',
      (e) => e.user_id === userId && e.track_id === where.trackId
        && e.grade_id === where.gradeId && e.level === level,
      () => ({
        user_id: userId,
        track_id: where.trackId,
        grade_id: where.gradeId,
        level,
        kind: LAYOUT.kindOf(grade, level, grade.pathLength),
        basis,
        html,
        // The same descriptive fields a base page's note carries, so the page's
        // shell reads one shape whether the page is shared or tailored. Without
        // these the heading would fall back to the word "Lesson" and the date would
        // be blank, and the difference between the two kinds of page would show up
        // as missing text rather than as deliberate wording.
        topic: entry.title || null,
        generalization: entry.covers || null,
        grade_band: grade.name,
        generated_at: new Date().toISOString(),
        details_hash: details.briefHash(userId, where),
        base_mtime: base ? base.mtime : null,
        // The model that actually answered, not the one the role prefers. The
        // chain falls through when a vendor is down or exhausted, and a page
        // attributed to weights that did not write it is a false record.
        model: raw.model,
        seconds: Math.round((Date.now() - started) / 1000),
        arm,
        experiment,
        problem: null,
      }));
    return { kind: 'edited', html: row.html, meta: row };
  })().finally(() => inFlight.delete(k));

  inFlight.set(k, job);
  return job;
}

/**
 * Start a write without waiting for it, for the level after the one in hand.
 *
 * Called from the places a learner moves on from, so the next level is being
 * written while they read the current one. Silently does nothing for an account
 * that may not be edited — that check lives in `ensure`, and this does not repeat
 * it, because a prefetch that quietly does nothing is the correct outcome either
 * way.
 *
 * Never rejects, and is never awaited by its caller.
 */
function prefetchNext(userId, enrollment, level) {
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return;
  // The level the learner will actually move to: on a gap-only path that steps
  // over units they proved, not always the one after (services/learner-path.js).
  // eslint-disable-next-line global-require
  const learnerPath = require('./learner-path');
  const next = learnerPath.planFor(enrollment) && Number.isInteger(Number(level))
    ? learnerPath.nextLevelAfter(enrollment, grade, Number(level))
    : Math.min(grade.pathLength, Number(level) + 1);
  if (!Number.isInteger(next) || next < 1) return;

  const target = grade.pathLength && next <= grade.pathLength ? next : null;
  if (target === null) return;

  ensure({ userId, enrollment, grade, level: target }).catch(() => {});
}

/** Forget every tailored page for one learner on one course. */
function invalidate(userId, trackId, gradeId) {
  return db.remove('level_edits', (e) => e.user_id === userId
    && (!trackId || e.track_id === trackId)
    && (!gradeId || e.grade_id === gradeId));
}

module.exports = {
  ensure, forLevel, pendingFor, stale, invalidate, buildEditorPrompt, prefetchNext,
};
