/**
 * The learning loop: start a session, answer items, close out a level, continue
 * to the next one or finish, then the retention questions that follow. Also the
 * per-item coach, the post-answer explainer, and the bad-item report.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const sessions = require('../services/sessions');
const lessons = require('../services/lessons');
const catchupUnits = require('../services/catchup-units');
const essays = require('../services/essays');
const mastery = require('../services/mastery');
const learnerPath = require('../services/learner-path');
const learner = require('../services/learner');
const remediation = require('../services/remediation');
const ownerSkips = require('../services/owner-skips');
const bank = require('../content/bank');
const topics = require('../content/topics');
// The layout, for the questions a grade's own data answers better than a
// formula: the next level of a kind, the end of a stated path, how many lessons
// a grade holds.
const LAYOUT = require('../config/level-layout');
const baseLessons = require('../config/base-lessons');
const blockLevels = require('../services/block-levels');
const gamePayloads = require('../services/game-payloads');
const gameAssignments = require('../config/game-assignments');
const grading = require('../services/grading');
const ai = require('../services/ai');
const scorecardHooks = require('../services/scorecard/hooks');
const learnerRecord = require('../services/learner-record');
// "Too fast to count" on checkpoints and the Final (staged round 3, ADAPT_EFFORT=on).
const effortMonitor = require('../services/effort-monitor');
const { canBrowse } = require('../config/capabilities');
const { requireAuth, requireSkip, canSkip, isAdmin } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');
// The write-ahead (WRITE_AHEAD): the next levels written and checked before they are opened.
const writeAhead = require('../services/write-ahead');
// Spanish levels played with the lab's activities (the main path's Duolingo-style player).
const esPath = require('../services/spanish/path');

const router = express.Router();

/** Write ahead for this enrollment as it now stands (fire-and-forget; nothing when WRITE_AHEAD=off). */
function aheadFor(user, enrollmentId, reason) {
  const enrollment = enrollmentId ? db.byId('enrollments', enrollmentId) : null;
  if (enrollment) writeAhead.trigger({ user, enrollment, reason });
}

/**
 * How many levels the path draws *ahead* of the learner.
 *
 * Ahead is deliberately far: an account that may open any level is being told
 * about a level it cannot currently see, which is worse than telling it the
 * level is locked. A hundred and thirty covers most of a path from anywhere.
 *
 * There is no window behind at all. It used to be five levels, on the reasoning
 * that there is nothing to find behind a learner that is not already done. That
 * was true when a grade's first lesson was level 10 and a level was only a
 * lesson, a quiz or practice. It is not true of a course that *names* its
 * levels: every English grade opens with nine **Testers** — the entry checks that
 * decide which lessons the learner may skip — and a learner standing on level 40
 * could not see them at all. The path is drawn from level 1 and windowed ahead,
 * because a path that scrolls past its own opening is not showing the course.
 */
const PATH_WINDOW = 130;

/**
 * Where a drawn path starts: level 1, always.
 *
 * A function of nothing, so it is one that can be asked. The path used to begin
 * five levels behind the learner, which on a course that names its levels hid the
 * nine Testers every English grade opens with — a learner standing on level 40
 * could not see the entry checks that decide what they may skip. Exported so the
 * self-test asks *this* rather than a copy of it, because a copy is exactly how
 * the five-level rule survived a check that agreed with it.
 *
 * @returns {number} the first level drawn
 */
function windowStartFor() {
  return 1;
}

function loadSession(req) {
  const session = db.byId('sessions', req.params.id || req.body.session_id);
  if (!session || session.user_id !== req.user.id) return null;
  return session;
}

/**
 * Whether this sitting holds feedback to the end of each level because the
 * learner asked for it (the style quiz's "feedback at the end, all at once").
 *
 * The preference is read once, when the sitting is built, and kept on its
 * params, so changing it on the profile page applies from the next session
 * rather than halfway through this one. A graded exam is not counted here: it
 * holds feedback for its own reasons (see the answer route) and reports at the
 * end the way it always has. Anyone who never said, or whose answers lean the
 * other way, gets feedback after each question — that is the default.
 */
function holdsFeedbackByChoice(session) {
  if (curriculum.isCheckpoint(session.kind) || session.kind === 'skip') return false;
  return !!session.params && session.params.immediateFeedback === false;
}

/**
 * The feedback that was held back, laid out for the end of a level: what was
 * asked, what the learner said, whether it was right, the answer and the
 * explanation. Only questions whose feedback was actually held are listed — a
 * recall question or a remediation drill showed its verdict on the spot.
 */
function heldReview(session, items) {
  if (!holdsFeedbackByChoice(session)) return [];
  return items
    .filter((it) => it.role !== 'retention' && it.role !== 'drill')
    .filter((it) => it.skipped || (it.user_answer !== null && it.user_answer !== undefined))
    .map((it) => ({
      id: it.id,
      block: it.block === undefined ? 0 : it.block,
      level: it.level || null,
      skill_name: it.skill_name || curriculum.skillName(it.skill_id),
      format: it.format,
      prompt: it.prompt,
      passage: it.passage || null,
      choices: it.choices || null,
      your_answer: it.skipped ? null : it.user_answer,
      skipped: !!it.skipped,
      correct: it.skipped ? null : !!it.correct,
      answer: it.answer,
      rationale: it.rationale || '',
      feedback: it.ai_feedback || null,
      error_tag: it.error_tag || null,
    }));
}

/**
 * An item as the page may see it on a reload or resume. While feedback is held —
 * an exam until it ends, or a learner who chose to see everything at the end
 * until that level closes — the verdict stays on the server: sending `correct`
 * let a reload show every answer as right or wrong before the review.
 */
function itemForPage(session, item) {
  const shown = sessions.sanitize(item);
  if (shown.correct === null) return shown;
  const revealsAlways = item.role === 'retention' || item.role === 'drill';
  const exam = curriculum.isCheckpoint(session.kind) || session.kind === 'skip';
  const block = (session.blocks || []).find((b) => b.index === shown.block);
  const held = exam ? !session.ended_at
    : holdsFeedbackByChoice(session) && !revealsAlways && !(block && block.resolved) && !session.ended_at;
  return held ? { ...shown, correct: null } : shown;
}

function sessionShape(session) {
  return {
    session_id: session.id,
    kind: session.kind,
    level: session.level,
    start_level: session.start_level,
    levels: session.levels || [session.level],
    blocks: (session.blocks || []).map((b) => ({ index: b.index, level: b.level, kind: b.kind || null, resolved: !!b.resolved })),
    params: session.params,
    // Said in so many words, so the player does not have to know how the params
    // encode it: false means answers are recorded without a verdict and the
    // whole level's feedback is shown together when the level closes.
    immediate_feedback: !holdsFeedbackByChoice(session),
    // Which course this sitting is on. The row has carried these from the start;
    // they were simply never sent, and the end-of-level screen needs them to file
    // feedback against the level it just finished rather than making a second
    // request to find out where the learner is.
    track_id: session.track_id || null,
    grade_id: session.grade_id || null,
    enrollment_id: session.enrollment_id || null,
  };
}

/**
 * Start a lesson, or the checkpoint the enrollment is parked on. A checkpoint
 * cannot be started early. A retry can be started immediately: every attempt
 * after the first is written fresh, so there is nothing to grind.
 */

/**
 * May this account open a level other than the one it is standing on?
 *
 * Behind is the learner's own: they have already worked through it, and going
 * back over a lesson before the quiz that covers it is ordinary use of a course
 * rather than a privilege. Ahead is material they have not been taught, possibly
 * including a checkpoint they would then sit at a level they were never taught
 * for, and that still takes the skip permission — which is one account.
 *
 * Either way the session is built at that level and the enrollment does not move,
 * so opening another level cannot cost anyone their position.
 *
 * A level in a unit the learner proved they know is open too, wherever it is.
 * Their gap-only path steps over it (services/learner-path.js), but reviewing
 * something you know is ordinary use of a course, and it was proved, so it holds
 * nothing they have not been shown.
 *
 * Named and exported because it is the whole of the decision, and a decision
 * with a name can be asked directly by a test instead of being reimplemented
 * beside it — which is how the two would drift and the check would keep passing.
 *
 * @param {number} level the level being opened
 * @param {number} standing the level the enrollment is on
 * @param {boolean} maySkip whether this account holds the skip permission
 * @param {boolean} [known] whether the level is in a unit the learner proved
 * @returns {boolean}
 */
function mayOpenLevel(level, standing, maySkip, known = false) {
  return level <= standing || !!maySkip || !!known;
}

/**
 * Why a level the learner is not standing on is theirs to open, as their unit
 * plan tells it: 'known' for a unit they proved, which their path skips;
 * 'skipped' for a unit behind them that the placement passed and they never
 * worked. Null without a plan, or for a level they did work — so the session
 * page never tells a learner they "already worked through" something they
 * skipped.
 */
function reviewKind(enrollment, grade, level) {
  const unit = learnerPath.unitAt(enrollment, level, grade);
  if (!unit) return null;
  if (unit.status === 'known') return 'known';
  if (unit.status === 'unseen' && unit.end < (enrollment.current_level || 1)) return 'skipped';
  return null;
}

router.post('/sessions', requireAuth, limit('session-start', 60, 60 * 60 * 1000), async (req, res) => {
  const enrollment = db.byId('enrollments', req.body.enrollment_id);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  if (enrollment.status === 'placement_pending') {
    return res.status(409).json({ error: 'Take the placement quiz for this subject first.' });
  }
  if (enrollment.status === 'graduated') {
    return res.status(409).json({ error: 'You have graduated this track. Pick the next one.' });
  }
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });
  // Spanish: a goal that puts the current level aside moves the learner to the next one it keeps.
  if (enrollment.track_id === 'spanish' && (req.body.level === undefined || req.body.level === null)) Object.assign(enrollment, esPath.settleDeferred(enrollment));

  // Consolidation before the Final (staged round 3; ADAPT_CONSOLIDATE=on with the
  // daily review on, off by default): while the learner's record says the grade
  // will not last, the Final waits behind short daily reviews, for at most 21
  // days. A level other than their own is not affected, nor is the next grade.
  if (req.body.level === undefined || req.body.level === null || Number(req.body.level) === enrollment.current_level) {
    // eslint-disable-next-line global-require
    const consolidation = require('../services/consolidation');
    const stretch = consolidation.forEnrollment(req.user.id, enrollment, grade);
    // Never holds the owner's account (canSkip): it may skip anything.
    if (stretch && stretch.active && !canSkip(req.user)) {
      return res.status(409).json({ error: consolidation.heldMessage(stretch), consolidation: stretch });
    }
  }

  // A level other than the one the enrollment is standing on.
  //
  // Two different permissions, and they used to be one:
  //
  //   **Behind** where they stand — they have already worked through it. Every
  //   account may go back: re-reading a lesson before the quiz that covers it, or
  //   checking something you half remember, is ordinary use of a course and there
  //   is nothing in it they could not already see. Opening a past level is a
  //   *preview* — the session is built at that level and the enrollment does not
  //   move, so it cannot cost them their position.
  //
  //   **Ahead** of where they stand — material they have not been taught, which
  //   may include a checkpoint they would then have to pass at a level they were
  //   never taught for. That still needs the skip permission, which is one
  //   account, and it is the thing that permission is for.
  let atLevel = null;
  if (req.body.level !== undefined && req.body.level !== null && Number(req.body.level) !== enrollment.current_level) {
    atLevel = Number(req.body.level);
    if (!Number.isInteger(atLevel) || atLevel < 1 || atLevel > grade.pathLength) {
      return res.status(400).json({ error: 'No such level.' });
    }
    // A level of a catch-up block (services/catchup-units.js) is the learner's to open.
    const known = (learnerPath.unitAt(enrollment, atLevel, grade) || {}).status === 'known'
      || catchupUnits.allowsLevel(req.user.id, enrollment, atLevel);
    if (!mayOpenLevel(atLevel, enrollment.current_level, canSkip(req.user), known)) {
      return res.status(403).json({ error: 'That level is not open yet.' });
    }
    // A sitting is one thing at a time. Opening a level out of order would leave
    // the level they are actually on unfinished behind it.
    for (const stale of db.find('sessions', (s) => s.user_id === req.user.id
      && s.enrollment_id === enrollment.id && !s.ended_at
      && s.kind !== 'placement' && s.kind !== 'skip' && s.kind !== 'enforcer')) {
      db.update('sessions', stale.id, { ended_at: new Date().toISOString(), abandoned: true });
      // A sitting on their own level left unfinished for another level is a
      // quit, and the scorecard reads it (persistence). A preview being closed
      // is only a look at another level ending, so it is not.
      if (!stale.preview) scorecardHooks.onSessionAbandoned(req.user.id, db.byId('sessions', stale.id), sessions.itemsFor(stale.id));
    }
  }

  // A game level is a game, not a set of questions.
  //
  // The session route is where every button on the site leads — the path row,
  // the dashboard, the finish card of every page — so this is where the game has
  // to meet the learner. Serving it anywhere else made the game a page you had
  // to know the address of. No sitting is created here: playing the game is the
  // work at this level, and its answers are recorded through their own route as
  // they are given.
  const wantedLevel = atLevel || enrollment.current_level;

  // A Spanish level the Duolingo-style player can build is played there
  // (services/spanish/path.js), through the same door as a game. `classic` is
  // the way back to the ordinary session for that level.
  if (enrollment.track_id === 'spanish' && !req.body.classic && esPath.supports(enrollment.grade_id, wantedLevel)) {
    return res.json({
      game: {
        kind: 'spanish',
        level: wantedLevel,
        url: `/spanish/learn?enrollment=${enrollment.id}${atLevel ? `&level=${wantedLevel}` : ''}`,
      },
    });
  }

  // Write the next block levels while this one is being worked: nobody awaits it.
  blockLevels.prefetchAhead({ user: req.user, enrollment, grade });

  // A lesson or retention level built from blocks is a page, like a game: the
  // learner is sent to it, and its checks are graded through their own route.
  // Only when a plan can actually be served — one is stored, or a model can
  // write one — otherwise the ordinary session below teaches the level.
  const blockKind = blockLevels.kindFor(grade, wantedLevel);
  if ((blockKind === 'lesson' || blockKind === 'retention') && !req.body.ordinary && blockLevels.visibleTo(req.user)
    && ((blockLevels.aiReady() && blockLevels.mayGenerate(req.user))
      || blockLevels.servedPlan(req.user, enrollment.track_id, enrollment.grade_id, wantedLevel))) {
    return res.json({
      game: {
        kind: blockKind,
        level: wantedLevel,
        url: `/base-lesson?track=${encodeURIComponent(enrollment.track_id)}`
          + `&grade=${encodeURIComponent(enrollment.grade_id)}&level=${wantedLevel}`
          + `&enrollment=${enrollment.id}`,
      },
    });
  }

  const game = gameAssignments.resolve(enrollment.track_id, enrollment.grade_id, wantedLevel);
  // `ordinary` is the way out of a game whose questions cannot be served (its write
  // failed or is still running): without it a learner on that level was sent back
  // to the same unready game every time, a dead end. A game that is ready still plays.
  const gameRow = game && req.body.ordinary ? gamePayloads.stored(enrollment.track_id, enrollment.grade_id, wantedLevel, req.user.id) : null;
  const gameUnready = !!req.body.ordinary && !(gameRow && gameRow.payload && !(gameRow.problems || []).length);
  if (game && !gameUnready && gamePayloads.accessFor(req.user, enrollment.track_id, enrollment.grade_id, wantedLevel)) {
    return res.json({
      game: {
        engine_id: game.engineId,
        level: wantedLevel,
        url: `/base-lesson?track=${encodeURIComponent(enrollment.track_id)}`
          + `&grade=${encodeURIComponent(enrollment.grade_id)}&level=${wantedLevel}`
          + `&enrollment=${enrollment.id}`,
      },
    });
  }

  // The level decides what the session is — a taught lesson, a checkpoint quiz,
  // or practice — and the client does not get to choose; createSession reads it
  // off the enrollment.

  // Resume an unfinished sitting instead of stacking a second one. A session
  // row with no items is one that never finished being built — resuming it
  // would hand the learner an empty screen, so it is discarded instead.
  // A remediation drill is its own short session and is never resumed here:
  // "retry the quiz" must open the quiz, not drop the learner back into the
  // practice round they were in the middle of. A Challenge Exam is excluded for
  // the same reason: it is a single thing to be finished, and a level skip
  // should never be the thing that resurrects an abandoned sitting.
  // A review of another level (a preview) left open is not resumed when the
  // learner asks for their own level: resumed as an ordinary sitting it lost its
  // preview fields, closed out as the level they stand on, and reported a jump
  // from the reviewed level to it. It is closed instead, as opening a different
  // level already does above.
  if (!atLevel) {
    for (const stale of db.find('sessions', (s) => s.user_id === req.user.id
      && s.enrollment_id === enrollment.id && !s.ended_at && s.preview && s.kind !== 'enforcer')) {
      // A preview closed: not a quit, so the scorecard is not told.
      db.update('sessions', stale.id, { ended_at: new Date().toISOString(), abandoned: true });
    }
  }
  // A retention enforcer's sitting (services/enforcers.js) is its own thing, never the level's.
  const open = db.findOne('sessions', (s) => s.user_id === req.user.id
    && s.enrollment_id === enrollment.id && !s.ended_at
    && s.kind !== 'placement' && s.kind !== 'remediate' && s.kind !== 'skip' && s.kind !== 'enforcer');
  if (open && !sessions.itemsFor(open.id).length) {
    db.remove('sessions', (s) => s.id === open.id);
  } else if (open) {
    const items = sessions.itemsFor(open.id);
    // A sitting on a lesson level always reopens on its lesson (lessons.forSitting):
    // one whose lesson was never stored used to come back as its checks alone.
    const openLesson = lessons.forSitting(open);
    // The essay is looked for across every block rather than at block zero. A
    // learner who reaches a written checkpoint two levels into a sitting has it
    // attached to that block, and looking only at zero returned null — so the
    // writing was unreachable on a reload and the session came back looking
    // like a plain quiz with no draft.
    const openEssay = (db.find('essays', (e) => e.session_id === open.id
      && e.user_id === req.user.id) || [])[0] || null;
    return res.json({
      ...sessionShape(open),
      resumed: true,
      pass_mark: curriculum.passMarkFor(open.kind, { base: require('../config/owner').ownerBase(req.user.id) }), // eslint-disable-line global-require
      kind_label: open.kind === 'essay'
        ? curriculum.checkpointLabel(grade, open.level)
        : curriculum.CHECKPOINT_LABEL[open.kind] || null,
      lesson: lessons.sanitize(openLesson),
      essay: openEssay ? essays.sanitize(openEssay) : null,
      items: items.map((it) => itemForPage(open, it)),
    });
  }

  const { session, items, lesson, essay } = await sessions.createSession({
    userId: req.user.id, enrollment, grade, level: atLevel,
  });
  res.status(201).json({
    ...sessionShape(session),
    resumed: false,
    pass_mark: curriculum.passMarkFor(session.kind, { base: require('../config/owner').ownerBase(req.user.id) }), // eslint-disable-line global-require
    kind_label: session.kind === 'essay'
      ? curriculum.checkpointLabel(grade, session.level)
      : curriculum.CHECKPOINT_LABEL[session.kind] || null,
    // The client says plainly that this is a look at a level the learner is not
    // standing on, so nobody finishes a session here and wonders why they are
    // still on the level below.
    preview: !!atLevel,
    your_level: enrollment.current_level,
    // Why a level not stood on is open, when the learner's unit plan says:
    // 'known' for a unit they proved (their path skips it), 'skipped' for one
    // behind them that the placement passed and they never worked. Null
    // otherwise — the ordinary "behind" or "ahead" of a preview.
    unit_review: atLevel ? reviewKind(enrollment, grade, atLevel) : null,
    lesson,
    essay,
    items: items.map((it) => sessions.sanitize(it)),
  });
});

router.get('/sessions/:id', requireAuth, (req, res) => {
  const session = loadSession(req);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const items = sessions.itemsFor(session.id);
  res.json({
    session: {
      ...sessionShape(session),
      started_at: session.started_at,
      ended_at: session.ended_at,
      score: session.score,
      analysis: session.analysis,
    },
    items: items.map((it) => itemForPage(session, it)),
  });
});

/** Grade one answer. Feedback is withheld when the learner's profile says they
 *  do better seeing it all at the end, and always withheld during a checkpoint. */
router.post('/sessions/:id/answer', requireAuth, async (req, res) => {
  const session = loadSession(req);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const item = db.byId('items', req.body.item_id);
  if (!item || item.session_id !== session.id) return res.status(404).json({ error: 'Question not found.' });
  if (session.ended_at && item.role !== 'retention') {
    return res.status(409).json({ error: 'This session is already finished.' });
  }

  // Effort monitoring on a checkpoint or the Final (ADAPT_EFFORT=on; off by
  // default): an answer too fast to have been read is not scored. It is set
  // aside and a parallel question on the same thing takes its place, at most
  // twice per question; the pass mark and the number of scored questions are
  // unchanged.
  const tooFast = effortMonitor.screen({
    userId: req.user.id, session, item, userAnswer: req.body.answer, ms: req.body.ms,
  });
  if (tooFast) {
    return res.json({
      recorded: false,
      too_fast: true,
      reveal: false,
      message: effortMonitor.TOO_FAST,
      replacement: sessions.sanitize(tooFast.replacement),
      block: item.block || 0,
    });
  }

  const result = await sessions.answer({
    userId: req.user.id,
    session,
    itemId: item.id,
    userAnswer: req.body.answer,
    ms: req.body.ms,
    confidence: req.body.confidence,
    changes: req.body.changes,
  });
  if (!result) return res.status(400).json({ error: 'That answer could not be recorded.' });

  // The study session's clock (services/study-sessions.js), and on a retention
  // enforcer question: its time against the budget, a miss brought back once,
  // and the stop once the budget is spent (services/enforcers.js).
  // eslint-disable-next-line global-require
  if (session.kind !== 'enforcer') require('../services/study-sessions').touch(req.user.id);
  let enforcerNote = null;
  if (session.kind === 'enforcer') {
    // eslint-disable-next-line global-require
    try { enforcerNote = require('../services/enforcers').afterAnswer(req.user.id, db.byId('items', item.id), { ms: req.body.ms, correct: result.checking ? null : result.correct }); } catch (err) { console.warn(`enforcer answer: ${err.message}`); }
  }

  // Feedback is held back during a checkpoint, and when the learner's profile
  // says they do better seeing it all at the end. A lesson's check questions
  // used to reveal regardless, on the grounds that their job is to correct the
  // reading on the spot — but a learner who said being told mid-quiz breaks
  // their concentration was then told mid-quiz on every lesson, while the
  // profile page promised otherwise. They follow the preference now, and the
  // corrections arrive a few questions later, all together, when the lesson
  // level closes (the `review` on block-finish).
  const isExam = curriculum.isCheckpoint(session.kind);
  // A Challenge Exam holds feedback for the same reason, and more strictly than
  // a checkpoint does. A checkpoint is fifteen questions scored as one whole; the
  // exam is five bands that each have to be perfect, so revealing as it goes
  // would hand the learner the band boundaries and let them protect a run they
  // have not actually earned.
  const isGraded = isExam || session.kind === 'skip';
  // A remediation drill always reveals too: the learner is there specifically to
  // fix this, and holding the correction to the end of the round wastes the one
  // moment they are most ready to take it in.
  // A lesson's check questions are on the same level as its teaching, so they
  // follow the learner's feedback choice like practice does (owner's decision,
  // 2026-10-22); recall and remediation still reveal on the spot.
  const immediate = item.role === 'retention'
    || item.role === 'drill'
    || (!isGraded && !holdsFeedbackByChoice(session));

  // Tell the client whether this was the last unanswered item in its block, so
  // it knows to offer "next level" or "finish" rather than a next question.
  const block = item.block || 0;
  // An answer being checked in the background is answered: it does not hold the level open.
  // A question set aside as too fast to count is not one still to answer: its
  // replacement is.
  const remaining = sessions.itemsInBlock(session.id, block).filter((i) => i.correct === null && i.grading !== 'checking' && !i.reserved).length;
  // A rapid answer from a learner whose own record says they rush: a one-line
  // note to slow down (ADAPT_EFFORT=on). It changes no score.
  const slow = effortMonitor.slowDown({ userId: req.user.id, session, ms: req.body.ms });

  // A typed answer the grader is still checking (services/typed-grading.js): the page
  // shows a neutral "checking your answer" state and polls GET /items/:id/grading.
  const enf = enforcerNote ? { enforcer: enforcerNote } : {};
  if (result.checking) {
    return res.json({ recorded: true, checking: true, reveal: immediate, block, block_remaining: remaining, ...enf });
  }

  if (!immediate) {
    return res.json({ recorded: true, reveal: false, block, block_remaining: remaining, ...(slow ? { slow_down: slow } : {}), ...enf });
  }
  res.json({
    recorded: true,
    reveal: true,
    block,
    block_remaining: remaining,
    ...enf,
    ...(slow ? { slow_down: slow } : {}),
    correct: result.correct,
    answer: result.answer,
    rationale: result.rationale,
    feedback: result.feedback || null,
    error_tag: result.errorTag || null,
  });
});

/**
 * Close out the current block: re-evaluate the level, level the learner up if
 * they earned it, and hand back one recall question about the level just
 * worked. The learner then chooses another level or the end of the session.
 */
router.post('/sessions/:id/block-finish', requireAuth, async (req, res) => {
  const session = loadSession(req);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.ended_at) return res.status(409).json({ error: 'This session is already finished.' });
  // Checkpoints are scored as a whole at the end; only taught and practice
  // levels close out block by block.
  if (curriculum.isCheckpoint(session.kind)) return res.status(400).json({ error: 'A checkpoint is scored when you finish it.' });

  const enrollment = db.byId('enrollments', session.enrollment_id);
  const grade = enrollment && curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!enrollment || !grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  const blocks = session.blocks || [];
  const blockIndex = req.body.block === undefined ? blocks.length - 1 : Number(req.body.block);
  const block = blocks.find((b) => b.index === blockIndex);
  if (!block) return res.status(404).json({ error: 'No such part of this session.' });
  if (block.resolved) return res.status(409).json({ error: 'That level has already been closed out.' });

  // A skipped question is not an unanswered one. It has been dealt with — it
  // just leaves the score rather than counting against the learner — so holding
  // the level open for it would trap them on a question they dismissed.
  // Typed answers still being checked are finished first, so the level is judged on
  // every answer (usually already settled while the learner worked on).
  const pendingChecks = sessions.itemsInBlock(session.id, blockIndex).filter((i) => i.grading === 'checking' && i.correct === null).map((i) => i.id);
  if (pendingChecks.length && (await sessions.settleChecking(pendingChecks)).length) {
    return res.status(409).json({ error: 'Still checking one of your answers. Try again in a moment.', checking: true });
  }
  const unanswered = sessions.itemsInBlock(session.id, blockIndex)
    .filter((i) => i.correct === null && !i.skipped);
  if (unanswered.length) {
    return res.status(409).json({ error: `Answer the remaining ${unanswered.length} question${unanswered.length === 1 ? '' : 's'} first.` });
  }

  // How a lesson level's lesson was read (read time, scroll-backs), saved on
  // the level's row before the level is read, so the scorecard sees it.
  const read = req.body && req.body.lesson_telemetry;
  if (read && block.kind === 'lesson' && !session.preview) {
    scorecardHooks.onLessonRead(req.user.id, {
      trackId: session.track_id, gradeId: session.grade_id, level: block.level,
      readMs: read.read_ms, scrollBacks: read.scroll_backs,
    });
  }

  const outcome = sessions.resolveBlock({ userId: req.user.id, session, enrollment, grade, blockIndex });
  aheadFor(req.user, enrollment.id, 'level finished');
  res.json({
    ...outcome,
    retention: outcome.retention ? sessions.sanitize(outcome.retention) : null,
    // A learner who asked for feedback at the end got none while answering, so
    // this is where they get all of it: every question in the level with its
    // verdict, the answer and the explanation. Read after the level is resolved
    // only because that is when the route has it to hand; nothing in it feeds
    // back into the grading. Empty for everyone who saw it as they went.
    review: heldReview(session, sessions.itemsInBlock(session.id, blockIndex)),
  });
});

/**
 * Add the next block to a running session: the next level if the learner just
 * advanced, or more work at the same level if they did not. This is the "next
 * level" button, and the reason a session is not capped at one level.
 */
router.post('/sessions/:id/next-block', requireAuth, limit('next-block', 120, 60 * 60 * 1000), async (req, res) => {
  const session = loadSession(req);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.ended_at) return res.status(409).json({ error: 'This session is already finished.' });
  if (curriculum.isCheckpoint(session.kind)) return res.status(400).json({ error: 'Finish the checkpoint before carrying on.' });
  // A preview is one level, looked at on its own. The next block would be built
  // at whatever the enrollment is standing on, which is a different level from
  // the one being previewed — carrying on would silently drop them back.
  if (session.preview) return res.status(400).json({ error: 'Finish this level to return to your own.' });

  const enrollment = db.byId('enrollments', session.enrollment_id);
  const grade = enrollment && curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!enrollment || !grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  const last = (session.blocks || [])[(session.blocks || []).length - 1];
  if (last && !last.resolved) {
    return res.status(409).json({ error: 'Close out the current level first.' });
  }

  const { session: updated, items, lesson, essay, block, level, kind } = await sessions.addBlock({
    userId: req.user.id, session, enrollment, grade,
  });
  res.status(201).json({
    ...sessionShape(updated),
    block,
    level,
    kind,
    lesson,
    essay,
    pass_mark: curriculum.passMarkFor(kind, { base: require('../config/owner').ownerBase(req.user.id) }), // eslint-disable-line global-require
    kind_label: kind === 'essay'
      ? curriculum.checkpointLabel(grade, level)
      : curriculum.CHECKPOINT_LABEL[kind] || null,
    items: items.map((it) => sessions.sanitize(it)),
  });
});

/**
 * Finish the session. Analysis covers every level the sitting touched, XP and
 * streak are awarded, the level is re-checked, and the wider retention set is
 * created.
 */
router.post('/sessions/:id/finish', requireAuth, async (req, res) => {
  const session = loadSession(req);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  if (session.ended_at) {
    const existing = sessions.itemsFor(session.id).filter((i) => i.retention_scope === 'session');
    return res.json({
      already: true,
      accuracy: session.score,
      analysis: session.analysis,
      // The levels answered at, as the recap of a fresh finish reports them.
      levels: sessions.workedLevels(session),
      retention: existing.map((it) => sessions.sanitize(it)),
    });
  }

  // A level the learner walked out of before it closed never reached its
  // end-of-level review, so whatever feedback was held in it is shown on the
  // recap instead. Read before finishing, from the blocks still open.
  const openBlocks = new Set((session.blocks || []).filter((b) => !b.resolved).map((b) => b.index));
  const unreviewed = heldReview(session, sessions.itemsFor(session.id)
    .filter((it) => openBlocks.has(it.block === undefined ? 0 : it.block)));

  // Answers still being checked are settled before the session is scored.
  await sessions.settleChecking(sessions.itemsFor(session.id).filter((i) => i.grading === 'checking' && i.correct === null).map((i) => i.id));
  const outcome = await sessions.finish({ userId: req.user.id, session });

  // With retention enforcers on and a study session running, the session
  // enforcer asks these topics when the study session ends (later, oldest
  // first), so the set is not asked twice; its missed skills go to that
  // enforcer flagged (ENFORCER_DEFER_SITTING_RETENTION; services/enforcers.js
  // deferSittingRetention). The per-level retention question stays.
  const deferRetention = require('../services/enforcers').deferSittingRetention(req.user.id, session, outcome.retentionPlan, sessions.itemsFor(session.id));

  // Retention questions: the analyst's own, when it produced any, otherwise
  // fresh bank items spanning the levels the session covered.
  const fromAi = (outcome.analysis.retention_questions || [])
    .filter((q) => q.prompt && q.answer)
    .map((q, i) => ({
      skill_id: q.skill_id && curriculum.SKILLS[q.skill_id]
        ? q.skill_id
        : (outcome.retentionPlan[i] || outcome.retentionPlan[0] || {}).skillId || 'main_idea',
      skill_name: curriculum.skillName(q.skill_id),
      difficulty: (outcome.retentionPlan[i] || outcome.retentionPlan[0] || {}).difficulty || 5,
      format: 'short_answer',
      prompt: q.prompt,
      answer: q.answer,
      rationale: q.why || 'Recalling it now is what moves it into next week.',
      source: 'ai',
      level: (outcome.retentionPlan[i] || {}).level || session.end_level || session.level,
    }));

  const retentionSource = deferRetention ? [] : fromAi.length
    ? fromAi
    : bank.generateMany(outcome.retentionPlan.map((p) => {
      // Held to the grade's range and standard (config/grade-skills.js fitEntry).
      const entry = { skillId: p.skillId, difficulty: p.difficulty };
      const g = session.track_id && session.grade_id ? curriculum.getGrade(session.track_id, session.grade_id) : null;
      return g ? require('../config/grade-skills').fitEntry(g, entry) : entry;
    }))
      .map((item, i) => ({ ...item, level: (outcome.retentionPlan[i] || {}).level || session.level }));

  const retentionRows = retentionSource.slice(0, 3).map((item, i) => db.insert('items', {
    ...item,
    session_id: session.id,
    user_id: req.user.id,
    role: 'retention',
    retention_scope: 'session',
    block: 999,
    index: 1000 + i,
    user_answer: null,
    correct: null,
    ms: null,
    coach_used: false,
  }));

  // A level played for a catch-up block ticks it off when it is passed (the master bar).
  if (session.track_id && session.grade_id && outcome.accuracy >= curriculum.PASS_MARKS.master) {
    for (const lv of sessions.workedLevels(session)) catchupUnits.onLevelPassed({ userId: req.user.id, trackId: session.track_id, gradeId: session.grade_id, level: Number(lv) });
  }
  if (session.enrollment_id && !session.preview) aheadFor(req.user, session.enrollment_id, 'session finished');
  res.json({
    accuracy: outcome.accuracy,
    xp: outcome.xp,
    streak: outcome.streak,
    analysis: outcome.analysis,
    progress: outcome.progress,
    levels: outcome.levels,
    level_up: outcome.levelUp,
    next_kind: outcome.nextKind,
    next_level: outcome.nextLevel,
    checkpoint: outcome.checkpoint,
    // Whether the run of clean levels has just earned the Challenge Exam, so the
    // recap can offer it in the same breath as the level it was earned on rather
    // than making the learner go and find it.
    skip: outcome.skip || null,
    ai: ai.isEnabled() && outcome.analysis.source === 'ai',
    // The deeper read of the session is still being written; the client polls
    // GET /api/sessions/:id once to pick it up.
    analysis_pending: ai.isEnabled() && outcome.analysis.source !== 'ai',
    provider: ai.providerName(),
    retention: retentionRows.map((it) => sessions.sanitize(it)),
    retention_deferred: deferRetention,
    review: unreviewed,
  });
});

/**
 * A question in a sitting whose answers are held until it is over: a checkpoint,
 * a level-skip exam or a placement. The page never offers the coach or the tutor
 * on these, and the routes refuse them too, so the answer key cannot be had by
 * asking (the product's guarantee that the client never receives the key).
 */
function heldItem(item) {
  const session = item && db.byId('sessions', item.session_id);
  if (!session) return false;
  return curriculum.isCheckpoint(session.kind) || session.kind === 'skip' || session.kind === 'placement';
}

/**
 * Whether priming is worth a model call for this learner.
 *
 * The page asks for a primed opener after 3.5 s on any unanswered question, which
 * is nearly every question, while most learners open the coach on few of them. A
 * primed opener nobody opens is a whole coach turn written for nothing: it was the
 * largest single use of tokens in a learner-hour (subjects audit 2026-10-24). The
 * coach streams its first words in well under a second, so priming only pays for
 * a learner who opens it often. A learner is primed for when, over their last
 * COACH_PRIME_WINDOW answered questions (at least 5), they opened the coach on at
 * least COACH_PRIME_RATE of them; everyone else gets the coach written when they
 * open it, streamed, exactly as every learner did before the stream route learned
 * to serve a primed opener. COACH_PRIME=all primes for everyone, =off for no one.
 */
function primesFor(user) {
  if (process.env.COACH_PRIME === 'all') return true;
  if (process.env.COACH_PRIME === 'off' || !user) return false;
  const windowSize = Number(process.env.COACH_PRIME_WINDOW || 30);
  const rate = Number(process.env.COACH_PRIME_RATE || 0.25);
  const recent = db.find('items', (i) => i.user_id === user.id && i.correct !== null && i.role !== 'exam').slice(-windowSize);
  if (recent.length < 5) return false;
  return recent.filter((i) => i.coach_used).length / recent.length >= rate;
}

/**
 * The coach: a back-and-forth on a question the learner has NOT answered yet,
 * which walks them to the answer instead of handing it over.
 *
 * Using it is recorded on the item. That is not punishment — it keeps the
 * mastery estimate honest, since an answer reached with help is weaker evidence
 * than one reached alone.
 */
router.post('/items/:id/coach', requireAuth, limit('coach', 120, 60 * 60 * 1000), async (req, res) => {
  const item = db.byId('items', req.params.id);
  if (!item || item.user_id !== req.user.id) return res.status(404).json({ error: 'Question not found.' });
  if (heldItem(item)) return res.status(409).json({ error: 'The coach is not available during a checkpoint.' });
  if (item.correct !== null) {
    return res.status(409).json({ error: 'This question is already answered — ask about it instead.' });
  }

  const messages = Array.isArray(req.body.messages) ? req.body.messages.slice(-10) : [];
  const cleaned = messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.trim().slice(0, 800) }));

  if (!item.coach_used) db.update('items', item.id, { coach_used: true, coach_started_at: new Date().toISOString() });
  // What the learner said while stuck, kept for the after-level read: it is the
  // most direct evidence there is of where their understanding broke.
  if (cleaned.some((m) => m.role === 'user')) {
    db.update('items', item.id, {
      coach_log: cleaned.filter((m) => m.role === 'user').slice(-8).map((m) => m.content.slice(0, 300)),
    });
  }

  // Opening the coach on a question we primed costs nothing: the question is
  // already written.
  if (!cleaned.length && item.coach_opener) {
    return res.json({ reply: item.coach_opener, source: 'ai', coached: true, primed: true, provider: ai.providerName() });
  }

  const reply = await ai.coachReply({ item, messages: cleaned, userId: req.user.id });
  if (reply) return res.json({ reply, source: 'ai', coached: true, provider: ai.providerName() });

  // No model available. The stored rationale cannot be used here: it exists to
  // explain an answer the learner has already given, so it names the answer, and
  // a coach that names the answer is not a coach. Fall back to a prompt that
  // asks rather than tells, and use the authored hint only if it stays quiet
  // about the answer too.
  const hintIsSafe = item.hint && !grading.normalize(item.hint).includes(grading.normalize(item.answer));
  const nudge = hintIsSafe
    ? item.hint
    : item.format === 'multiple_choice'
      ? 'Read what the question is asking for, then take the choices one at a time: which can you rule out, and on what grounds?'
      : 'Say what the question is asking you to produce, then write down the first step you are confident about. What does that step give you?';
  res.json({
    reply: `${nudge}\n\nThe back-and-forth coach needs the AI tutor, which is not connected right now.`,
    source: 'bank',
    coached: true,
  });
});

/**
 * Write the coach's opening question ahead of being asked for it.
 *
 * The opener is the only turn in a coaching conversation that does not depend on
 * anything the learner has said, which means it can be written while they are
 * still reading the question. The client fires this after a few seconds of
 * dwell — long enough to signal being stuck, short enough that it is ready
 * before they reach for help — and the coach then opens instantly instead of
 * spending a second and a half on a round trip they are watching.
 *
 * It is deliberately not fired for every item: only ones a learner lingers on.
 */
router.post('/items/:id/coach/prime', requireAuth, limit('coach-prime', 200, 60 * 60 * 1000), async (req, res) => {
  const item = db.byId('items', req.params.id);
  if (!item || item.user_id !== req.user.id) return res.status(404).json({ error: 'Question not found.' });
  if (heldItem(item)) return res.json({ ready: false, priming: false });
  if (item.correct !== null || item.coach_opener) return res.json({ ready: !!item.coach_opener });
  // Only for a learner who uses the coach: see primesFor.
  if (!primesFor(req.user)) return res.json({ ready: false, priming: false });

  // Answer the client immediately; the writing happens behind it.
  res.json({ ready: false, priming: true });

  try {
    const opener = await ai.coachReply({ item, messages: [], userId: req.user.id });
    if (opener) db.update('items', item.id, { coach_opener: opener });
  } catch (err) {
    console.warn(`ai: priming the coach failed: ${err.message}`);
  }
});

/**
 * The same coach, streamed as server-sent events, so the reply starts appearing
 * in a few hundred milliseconds instead of after the whole thing is written.
 * The client falls back to the plain endpoint above if this one is unavailable.
 */
router.post('/items/:id/coach/stream', requireAuth, limit('coach', 120, 60 * 60 * 1000), async (req, res) => {
  const item = db.byId('items', req.params.id);
  if (!item || item.user_id !== req.user.id) return res.status(404).json({ error: 'Question not found.' });
  if (heldItem(item)) return res.status(409).json({ error: 'The coach is not available during a checkpoint.' });
  if (item.correct !== null) {
    return res.status(409).json({ error: 'This question is already answered — ask about it instead.' });
  }

  const messages = Array.isArray(req.body.messages) ? req.body.messages.slice(-10) : [];
  const cleaned = messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.trim().slice(0, 800) }));

  if (!item.coach_used) db.update('items', item.id, { coach_used: true, coach_started_at: new Date().toISOString() });
  // What the learner said while stuck, kept for the after-level read: it is the
  // most direct evidence there is of where their understanding broke.
  if (cleaned.some((m) => m.role === 'user')) {
    db.update('items', item.id, {
      coach_log: cleaned.filter((m) => m.role === 'user').slice(-8).map((m) => m.content.slice(0, 300)),
    });
  }

  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // keeps a reverse proxy from buffering the stream
  });
  res.flushHeaders();

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  let open = true;

  // A primed opener is already written (and was leak-checked when it was): the
  // page streams the coach, so this is where priming has to pay off. Before
  // this the stream wrote a second opener and every primed one went unused.
  if (!cleaned.length && item.coach_opener) {
    send({ delta: item.coach_opener });
    return res.end(`data: ${JSON.stringify({ done: true, source: 'ai', primed: true, provider: ai.providerName() })}\n\n`);
  }
  // The response's close, not the request's: since Node 16 a request emits 'close'
  // as soon as its body has been read, which marked every stream closed before the
  // first word, so the page got an empty stream and fell back to /coach, paying a
  // second model call for every coach turn (subjects audit, 2026-10-24).
  res.on('close', () => { if (!res.writableEnded) open = false; });

  const streamed = await ai.coachReplyStream({
    item,
    messages: cleaned,
    userId: req.user.id,
    onDelta: (text) => { if (open) send({ delta: text }); },
  });

  if (!open) return res.end();

  if (streamed) {
    // A reply that tripped the leak guard is replaced wholesale, so the client
    // is told to drop whatever it has already rendered.
    if (streamed.replaced) send({ replace: streamed.text });
    return res.end(`data: ${JSON.stringify({ done: true, source: 'ai', provider: ai.providerName() })}\n\n`);
  }

  // No provider, no budget, or the stream failed before it started: fall back to
  // the same nudge the non-streaming route uses.
  const hintIsSafe = item.hint && !grading.normalize(item.hint).includes(grading.normalize(item.answer));
  const nudge = hintIsSafe
    ? item.hint
    : item.format === 'multiple_choice'
      ? 'Read what the question is asking for, then take the choices one at a time: which can you rule out, and on what grounds?'
      : 'Say what the question is asking you to produce, then write down the first step you are confident about. What does that step give you?';
  send({ replace: `${nudge}\n\nThe back-and-forth coach needs the AI tutor, which is not connected right now.` });
  return res.end(`data: ${JSON.stringify({ done: true, source: 'bank' })}\n\n`);
});

/** Ask about an item the learner has already answered. Here the answer is
 *  already known to them, so this one explains directly. */
router.post('/items/:id/ask', requireAuth, limit('tutor', 60, 60 * 60 * 1000), async (req, res) => {
  const item = db.byId('items', req.params.id);
  if (!item || item.user_id !== req.user.id) return res.status(404).json({ error: 'Question not found.' });
  if (item.correct === null || item.correct === undefined) {
    return res.status(409).json({ error: 'Answer the question first, then ask about it.' });
  }
  if (heldItem(item) && !(db.byId('sessions', item.session_id) || {}).ended_at) {
    return res.status(409).json({ error: 'Ask about it when the checkpoint is finished.' });
  }
  const question = String(req.body.question || '').trim().slice(0, 500);
  if (question.length < 3) return res.status(400).json({ error: 'Ask a question first.' });
  // What they asked after answering goes to the after-level read too: a question
  // about a question they got right is as telling as one they got wrong.
  db.update('items', item.id, { ask_log: [...(item.ask_log || []), question.slice(0, 300)].slice(-8) });

  const reply = await ai.tutorReply({ item, question, userId: req.user.id });
  if (reply) return res.json({ reply, source: 'ai', provider: ai.providerName() });
  res.json({
    reply: `${item.rationale}\n\nThe answer is ${item.answer}. A reply in your own terms needs the AI tutor, which is not connected right now.`,
    source: 'bank',
  });
});

/** Report a bad item. Reported items are pulled from rotation immediately: a
 *  wrong question in a learning product is the most expensive bug there is. */
/** Where a typed answer that is being checked stands (the page polls this). */
router.get('/items/:id/grading', requireAuth, (req, res) => {
  const item = db.byId('items', req.params.id);
  if (!item || item.user_id !== req.user.id) return res.status(404).json({ error: 'Question not found.' });
  const status = sessions.checkingStatus(item);
  if (status.checking) return res.json(status);
  // Feedback held for the end of the level or a checkpoint stays held.
  const session = db.byId('sessions', item.session_id);
  const isExam = session && (curriculum.isCheckpoint(session.kind) || session.kind === 'skip');
  if (isExam) return res.json({ checking: false, recorded: true, reveal: false });
  return res.json({ ...status, reveal: true, error_tag: status.errorTag });
});

router.post('/items/:id/report', requireAuth, limit('report', 30, 60 * 60 * 1000), (req, res) => {
  const item = db.byId('items', req.params.id);
  if (!item || item.user_id !== req.user.id) return res.status(404).json({ error: 'Question not found.' });
  const reason = String(req.body.reason || '').trim().slice(0, 500);

  db.insert('reports', {
    user_id: req.user.id,
    item_id: item.id,
    skill_id: item.skill_id,
    difficulty: item.difficulty,
    prompt: item.prompt,
    answer: item.answer,
    source: item.source,
    gen_seed: item.gen_seed || null,
    reason,
    status: 'open',
  });

  for (const row of db.find('content_cache', (c) => (c.payload || []).some((p) => p.prompt === item.prompt))) {
    db.update('content_cache', row.id, { payload: row.payload.filter((p) => p.prompt !== item.prompt) });
  }
  res.json({ ok: true });
});

/**
 * What the learner thought of a level.
 *
 * Two free-text boxes — what they liked and what they did not — stored against the
 * level, and folded into the details report that levels are written from. This is
 * the only place the learner is asked directly rather than measured, so it is the
 * only source for why a level worked for them rather than how they performed on it.
 *
 * Validation follows the report route above: trim, cap, refuse an empty submission.
 * There is no minimum length beyond that, because "too easy" is a complete and
 * useful answer and a minimum would only teach people to pad.
 */
router.post('/levels/:track/:grade/:level/feedback', requireAuth,
  limit('level-feedback', 60, 60 * 60 * 1000), (req, res) => {
    const { track, grade: gradeId } = req.params;
    const level = Number(req.params.level);

    const grade = curriculum.getGrade(track, gradeId);
    if (!grade) return res.status(404).json({ error: 'No such subject.' });
    if (!Number.isInteger(level) || level < 1 || level > grade.pathLength) {
      return res.status(400).json({ error: 'No such level.' });
    }

    const liked = String(req.body.liked || '').trim().slice(0, 1000);
    const disliked = String(req.body.disliked || '').trim().slice(0, 1000);
    const comments = String(req.body.comments || '').trim().slice(0, 1000);
    // Three optional taps beside the two boxes. Any one of the five is a
    // submission: "too long" is a complete and useful answer.
    const tap = (value, allowed) => (allowed.includes(value) ? value : null);
    const pace = tap(req.body.pace, ['slow', 'right', 'fast']);
    const length = tap(req.body.length, ['short', 'right', 'long']);
    const difficulty = tap(req.body.difficulty, ['easy', 'right', 'hard']);
    if (!liked && !disliked && !comments && !pace && !length && !difficulty) {
      return res.status(400).json({ error: 'Say something you liked or something you did not.' });
    }

    const row = db.insert('level_feedback', {
      user_id: req.user.id,
      track_id: track,
      grade_id: gradeId,
      level,
      kind: curriculum.levelKind(level, grade.pathLength, grade),
      liked,
      disliked,
      comments,
      pace,
      length,
      difficulty,
      submitted_at: new Date().toISOString(),
    });

    // The taps go straight to the learning scorecard; the words reach it through
    // the model's read of the next session.
    scorecardHooks.onFeedback(req.user.id, {
      trackId: track, gradeId, level, pace, length, difficulty, liked, disliked,
    });

    // Fold it into the conclusions in the background. Not awaited: the learner has
    // already said what they think, and making them watch a spinner while a model
    // summarises their own words back at them would be the wrong shape entirely.
    // A failure here costs the conclusions being one submission stale, nothing more.
    // The words go to the after-level read: one prompt with what they liked, what
    // they did not, what else they said, and the level's own content, which writes
    // the conclusion to their record and suggests changes to their scorecard.
    learnerRecord.attachFeedback(req.user.id, { trackId: track, gradeId, level, feedbackId: row.id });
    learnerRecord.processDue().catch(() => {});

    res.json({ ok: true, id: row.id });
  });

// ── skipping ───────────────────────────────────────────────────────────────
/**
 * Withdraw the question in front of the learner.
 *
 * The one thing this deliberately does not do is write a verdict. `correct`
 * stays null, and that is the whole mechanism: every accuracy calculation in the
 * app already filters on `correct !== null`, so a skipped question leaves the
 * score entirely rather than being counted wrong. It also does not call
 * `mastery.recordAttempt` — a question nobody answered is not evidence in either
 * direction, and recording one as wrong would be a lie about what happened.
 *
 * Gated by `requireSkip`, which is server-side: the client not offering a button
 * is a courtesy, and this refusing the request is the part that counts.
 */
router.post('/items/:id/skip', requireAuth, requireSkip, limit('skip-question', 400, 60 * 60 * 1000), (req, res) => {
  const item = db.byId('items', req.params.id);
  if (!item || item.user_id !== req.user.id) return res.status(404).json({ error: 'Question not found.' });
  if (item.correct !== null) {
    return res.status(409).json({ error: 'That question is already answered.' });
  }
  db.update('items', item.id, { skipped: true, skipped_at: new Date().toISOString() });
  res.json({ skipped: true, id: item.id });
});

/**
 * Move past the level the learner is standing on, without working on it.
 *
 * It does not count as a cleared level — see `mastery.skipLevel`, which exists
 * as its own function precisely so that omission is deliberate and visible
 * rather than a line somebody adds back later. Nothing was demonstrated here, so
 * nothing is recorded, and the Challenge Exam run is unaffected.
 */
router.post('/enrollments/:id/skip-level', requireAuth, requireSkip, limit('skip-level', 200, 60 * 60 * 1000), (req, res) => {
  const enrollment = db.byId('enrollments', req.params.id);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  if (enrollment.status === 'graduated') return res.status(409).json({ error: 'You have graduated this track.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  // An unfinished sitting is standing on the level being skipped, and would keep
  // offering it after they have moved on. Closed rather than resumed.
  for (const open of db.find('sessions', (s) => s.user_id === req.user.id
    && s.enrollment_id === enrollment.id && !s.ended_at)) {
    db.update('sessions', open.id, { ended_at: new Date().toISOString(), abandoned: true });
  }

  const level = mastery.skipLevel(enrollment, grade);
  aheadFor(req.user, enrollment.id, 'skip-level');
  res.json({ ok: true, level, kind: curriculum.levelKind(level, grade.pathLength, grade) });
});

/**
 * Stand on a level, with everything below it recorded as cleared at 100%.
 *
 * The same gate as the other two skip routes, which is the point of putting it
 * in `middleware/auth.js` rather than repeating the check: there are now three
 * ways to move without working, and a fourth that forgot the guard would be a
 * way for anyone to hand themselves a finished track.
 *
 * `jumpToLevel` validates the level itself, so this route only has to find the
 * enrollment and refuse the graduated case.
 */
router.post('/enrollments/:id/jump-to', requireAuth, requireSkip, limit('skip-level', 200, 60 * 60 * 1000), (req, res) => {
  const enrollment = db.byId('enrollments', req.params.id);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  if (enrollment.status === 'graduated') return res.status(409).json({ error: 'You have graduated this track.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  // An unfinished sitting stands on the level being jumped away from, and would
  // keep offering it after they have moved on.
  for (const open of db.find('sessions', (s) => s.user_id === req.user.id
    && s.enrollment_id === enrollment.id && !s.ended_at)) {
    db.update('sessions', open.id, { ended_at: new Date().toISOString(), abandoned: true });
  }

  // Back (or onto the level it stands on): the owner may stand on any level of
  // any grade (services/owner-skips.js); only the position moves.
  const wanted = Math.floor(Number(req.body.level));
  if (Number.isFinite(wanted) && wanted >= 1 && wanted <= (enrollment.current_level || 1)) {
    // Read before the move: `enrollment` is the stored row, which go() updates.
    const from = enrollment.current_level;
    const back = ownerSkips.go({ userId: req.user.id, trackId: enrollment.track_id, gradeId: enrollment.grade_id, level: wanted });
    if (back.error) return res.status(back.status || 400).json({ error: back.error });
    aheadFor(req.user, back.enrollment ? back.enrollment.id : enrollment.id, 'jump');
    return res.json({ ok: true, moved: true, level: back.level, from, cleared: 0, skills: 0, back: true, kind: curriculum.levelKind(back.level, grade.pathLength, grade) });
  }
  const outcome = mastery.jumpToLevel({
    userId: req.user.id, enrollment, grade, to: req.body.level,
  });
  if (!outcome.moved) return res.status(400).json({ error: outcome.reason });

  // A checkpoint that is now recorded as passed cannot also have an open "work on
  // what went wrong" behind it, and a remediation is keyed on the enrollment, so
  // it is closed here rather than left contradicting the path.
  remediation.clearFor(req.user.id, enrollment.id);

  // The jump target first, then the levels after it (write-ahead).
  aheadFor(req.user, enrollment.id, 'jump');
  res.json({ ok: true, ...outcome, kind: curriculum.levelKind(outcome.level, grade.pathLength, grade) });
});

/**
 * The owner's skips (services/owner-skips.js), behind the same requireSkip as
 * the two routes above: skip a whole grade, and stand on any level of any
 * grade, joined or not (the placement quiz is skipped). Everyone else: 403.
 */
router.post('/enrollments/:id/skip-grade', requireAuth, requireSkip, limit('skip-level', 200, 60 * 60 * 1000), (req, res) => {
  const enrollment = db.byId('enrollments', req.params.id);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  const out = ownerSkips.skipGrade({ userId: req.user.id, enrollment });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  if (out.next) aheadFor(req.user, out.next.id, 'skip-grade');
  res.json({ ok: true, graduated: out.graduated.id, next_enrollment: out.next ? out.next.id : null, next_grade: out.next ? out.next.grade_id : null });
});

router.post('/owner/go', requireAuth, requireSkip, limit('skip-level', 200, 60 * 60 * 1000), (req, res) => {
  const out = ownerSkips.go({ userId: req.user.id, trackId: req.body.track_id, gradeId: req.body.grade_id, level: req.body.level });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  aheadFor(req.user, out.enrollment.id, 'owner/go');
  res.json({ ok: true, enrollment_id: out.enrollment.id, level: out.level, created: out.created, cleared: out.cleared, reopened: out.reopened });
});

/**
 * A path row as the path page reads it (?view=page, learner follow-ups
 * 2026-10-24): the same row without what the page never reads (focus,
 * difficulty, label), without empty or false fields, without `topic` when
 * `level_title` names the row (the page reads level_title || topic), without
 * `focus_name` when `covers` says what the level is for (it is only the
 * fallback), and without `delivered` off a checkpoint (read only on one).
 * Every value the page draws is unchanged.
 */
function pageNode(n) {
  const out = {};
  for (const [k, v] of Object.entries(n)) {
    if (v === null || v === false || v === undefined || v === '') continue;
    if (k === 'focus' || k === 'difficulty' || k === 'label') continue;
    if (k === 'topic' && n.level_title) continue;
    if (k === 'focus_name' && n.covers) continue;
    if (k === 'delivered' && !n.checkpoint) continue;
    out[k] = v;
  }
  return out;
}

/**
 * The level path around the learner's position: what is done, where they are,
 * what the next checkpoint is, and what is still locked.
 */
router.get('/path/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const track = curriculum.getTrack(enrollment.track_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });
  // Opening the path writes ahead of where the learner stands (WRITE_AHEAD).
  writeAhead.trigger({ user: req.user, enrollment, grade, reason: 'path' });
  // Spanish: the learner's goal may put levels aside (services/spanish/goal-fit.js).
  const esFit = enrollment.track_id === 'spanish' ? esPath.pathFit(esPath.settleDeferred(enrollment)) : null;

  const current = enrollment.current_level || 1;
  // How much of the path is drawn. An account that may browse the curriculum is
  // shown all of it: a path is now up to sixteen hundred levels, and a window
  // around the present leaves the other fifteen grades unreadable and most of
  // this one invisible. Every other account gets a window, because a path that
  // runs to the graduation exam is a wall of rows rather than a path.
  const wholePath = canBrowse(req.user);
  // Where the drawn path starts: always level 1. Levels behind are not windowed
  // out, so a course's opening — its entry checks, its first lessons — is on the
  // page wherever the learner is standing.
  const from = windowStartFor();
  // How far ahead the path is drawn, and how far ahead an account that may skip
  // can see. Wide enough to cover most of a path in one look, which is the
  // point of being able to open a level far ahead: a window of twenty made the
  // levels someone wanted out of view rather than merely locked.
  const to = wholePath ? grade.pathLength : Math.min(grade.pathLength, current + PATH_WINDOW);
  // An account that may skip can see past its own position and open what it
  // likes. The levels are still marked unfinished — it is standing on level 40,
  // not 92, and calling those levels done would be a lie the path would then
  // have to be careful about everywhere else. What changes is that they are
  // open rather than locked.
  const mayOpenAhead = canSkip(req.user);
  // ?view=ticks (learner follow-ups 2026-10-24): the dashboard reads only the
  // checkpoint ticks on its scale, the current level's row and the next Master
  // quiz, so it gets those rows of the same window and nothing else.
  const ticksOnly = req.query.view === 'ticks';
  // The learner's unit plan, if they have one: each level carries its unit's
  // status, so a unit they proved is drawn as skipped, with a way to review it.
  const planUnits = learnerPath.unitRows(enrollment);
  // A checkpoint between units answers for the units it covers.
  const unitOfLevel = (level) => planUnits.find((u) => level >= u.start && level <= u.end)
    || (planUnits.length ? learnerPath.unitAt(enrollment, level, grade) : null);
  const nodes = [];
  for (let level = from; level <= to; level++) {
    const plan = curriculum.levelPlan(grade, level);
    if (ticksOnly && !plan.checkpoint && level !== current) continue;
    const unit = unitOfLevel(level);
    // A unit wholly behind the learner that is still to learn or not checked was
    // never worked — the path comes back for it — so its levels are not done
    // just because their numbers are lower. They are drawn as open, still to do.
    const owed = !!unit && level < current && unit.end < current
      && ['learn', 'unchecked', 'unseen'].includes(unit.status);
    const state = owed ? 'locked' : level < current ? 'done' : level === current ? 'current' : 'locked';
    // What this level teaches. A lesson is a topic, not a skill name, and the
    // topic is what the path should say — "Nouns and the words that name them"
    // tells a reader what is on it, "Parts of speech" does not.
    const t = topics.topicFor(grade, level, plan.focus, enrollment.track_id);
    // What the course itself calls this level, and what sort of level it says it
    // is. A course that names its levels has both, and both are needed: the title
    // is what tells one Activity from the next, and the type is what tells a
    // reader whether they are about to be taught something or asked something.
    const entry = LAYOUT.entryFor(grade, level);
    const rowTopic = enrollment.track_id === 'iq'
      ? { topic: t ? t.topic : null, covers: entry ? entry.covers || '' : t ? t.covers || '' : '' }
      : entry ? { topic: entry.topic || entry.title, covers: entry.covers || '' } : t;
    nodes.push({
      level,
      focus: plan.focus,
      focus_name: curriculum.skillName(plan.focus),
      topic: rowTopic ? rowTopic.topic : null,
      // The sheet's own title for the level, kept apart from `topic` so a course
      // that names its levels is not forced to call its levels topics. Null for a
      // grade on the rule, where `topic` is the title.
      level_title: entry ? entry.title : null,
      // The sheet's own word for the kind of level: Tester, Lesson, Activity,
      // Summary, Master Quiz, Essay Draft, and so on. Null when the course does
      // not say, and the page falls back to the app's word for the kind.
      type: entry ? entry.type : null,
      // What this level covers, in the creator's own words. Sent so the path can
      // say what the level is for instead of naming the skill it is filed under —
      // "reading and spelling long a words such as rain, play, and day" tells a
      // learner what they will be able to do, where "phonics" tells them a filing
      // label. Null on a grade whose syllabus has topic names only.
      covers: rowTopic ? (rowTopic.covers || null) : null,
      difficulty: Math.round(plan.difficulty * 10) / 10,
      kind: plan.kind,
      // What the level is for this learner, which for an English checkpoint is
      // not the same as what its number says it is.
      delivered: plan.delivered,
      label: curriculum.checkpointLabel(grade, level),
      checkpoint: plan.checkpoint,
      state,
      // Readable past-the-present levels, and whether they can be started. A
      // level in a unit the learner proved is open to review wherever it is.
      reachable: state === 'locked' && (owed || mayOpenAhead || (!!unit && unit.status === 'known')),
      // The unit this level is in and its status on the learner's plan (known,
      // learn, done, unseen), or null without a plan.
      unit_status: unit ? unit.status : null,
      unit_key: unit ? unit.key : null,
      unit_number: unit ? unit.unit : null,
      unit_title: unit ? unit.title : null,
      // Whether the learner may test out of this level's unit now — a unit not
      // checked yet offers it ("Not checked yet, test out?").
      unit_can_test_out: !!(unit && unit.can_test_out),
      // Spanish: put aside by the learner's goal (still open), and played with
      // the Duolingo-style activities rather than the plain questions.
      ...(esFit ? {
        deferred: esFit.deferred[level] || null,
        activities: esPath.supports(enrollment.grade_id, level),
      } : {}),
    });
  }

  if (ticksOnly) {
    return res.json({
      enrollment: { id: enrollment.id, current_level: current, path_length: grade.pathLength },
      checkpoints: {
        next: {
          lesson: curriculum.nextLessonLevel(grade, current + 1),
          master: LAYOUT.nextOfKind(grade, 'master', current + 1),
          grand: LAYOUT.nextOfKind(grade, 'grand', current + 1),
          any: LAYOUT.nextCheckpoint(grade, current + 1),
          end: LAYOUT.endOf(grade),
        },
      },
      nodes: nodes.map(pageNode),
    });
  }

  const progress = mastery.levelProgress(req.user.id, enrollment, grade);
  const skills = curriculum.levelPlan(grade, current).introduced.map((id) => {
    const state = mastery.stateFor(req.user.id, id);
    return {
      id,
      name: curriculum.skillName(id),
      mastery: Number(state.mastery.toFixed(3)),
      attempts: state.attempts,
      due_at: state.next_due_at,
      error_tags: state.error_tags || [],
    };
  });

  res.json({
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      current_level: current,
      path_length: grade.pathLength,
      xp: enrollment.xp || 0,
      level_kind: curriculum.levelKind(current, grade.pathLength, grade),
      // What this level actually is for this learner, and what it is called.
      delivered: curriculum.checkpointKind(grade, current),
      kind_label: curriculum.checkpointLabel(grade, current),
      // A spoken checkpoint (preschool and Kindergarten; services/essays.js).
      spoken: !!essays.oralKindFor(grade, current),
      checkpoint_attempts: enrollment.checkpoint_attempts || 0,
      lesson_ready: !!lessons.find(req.user.id, enrollment, current),
      can_skip_level: canSkip(req.user),
    },
    // Set when a checkpoint here was not passed, so the path can offer both
    // doors: retake it now, or work on what went wrong first.
    remediation: (() => {
      const row = remediation.activeFor(req.user.id, enrollment.id);
      if (!row) return null;
      return {
        id: row.id,
        kind: row.kind,
        attempt: row.attempt,
        accuracy: row.accuracy,
        required: row.required,
        areas: (row.areas || []).map((a) => ({ skill_name: a.skill_name, accuracy: a.accuracy, held: !!a.held })),
      };
    })(),
    track: { id: track.id, name: track.name, color: track.color, icon: track.icon },
    grade: { id: grade.id, name: grade.name, blurb: grade.blurb },
    // Spanish: why the path is ordered this way, in one line (GOAL-FIT.md).
    spanish_fit: esFit ? { profile: esFit.profile, label: esFit.label, why: esFit.why, deferred_count: Object.keys(esFit.deferred).length, queue: esFit.queue } : null,
    // Which levels of this grade have a generated base lesson, so the page can link
    // to one only where there is one. Empty for an account that may not see
    // generated lessons, which is the same answer as "none exist" and needs no
    // separate branch on the client.
    base_lessons: baseLessons.canSeeBaseLessons(req.user)
      ? { [track.id]: { [grade.id]: baseLessons.levelsFor(track.id, grade.id) } }
      : {},
    checkpoints: {
      // The next level of each kind from where this learner stands, worked out on
      // the server and sent as levels rather than as spacing.
      //
      // The page used to compute these itself, as `master_every * Math.ceil(level /
      // master_every)`, which rounds up to a multiple of twenty-five. That is right
      // for a grade on the rule and wrong for a grade that states its levels: for
      // every English grade it named a level that held a lesson. Shipping the
      // answer rather than the spacing means the page cannot disagree with the
      // server about what the next quiz is, which is the only way it ever can when
      // the layout is stated rather than arithmetic.
      next: {
        lesson: curriculum.nextLessonLevel(grade, current + 1),
        master: LAYOUT.nextOfKind(grade, 'master', current + 1),
        grand: LAYOUT.nextOfKind(grade, 'grand', current + 1),
        any: LAYOUT.nextCheckpoint(grade, current + 1),
        end: LAYOUT.endOf(grade),
      },
      // Whether this course's syllabus states the level of each of its lessons.
      stated_lessons: curriculum.statesLessonLevels(grade),
      pass_marks: curriculum.passMarksFor({ base: require('../config/owner').ownerBase(req.user.id) }), // eslint-disable-line global-require
    },
    nodes: req.query.view === 'page' ? nodes.map(pageNode) : nodes,
    progress,
    skills,
    // The Challenge Exam offer, so the path can put it in front of the learner
    // the moment it is earned rather than only on the exam page they would have
    // to go looking for.
    skip: mastery.skipOffer(req.user.id, enrollment, grade),
    params: learner.sessionParams(learner.getProfile(req.user.id)),
  });
});

/**
 * Consolidation before the Final, for the path (staged round 3,
 * ADAPT_CONSOLIDATE): where the stretch stands, today's review, and the next
 * grade. 404 while it is off, so the path draws as before.
 */
router.get('/consolidation/:enrollmentId', requireAuth, (req, res) => {
  // eslint-disable-next-line global-require
  const consolidation = require('../services/consolidation');
  if (!consolidation.enabled()) return res.status(404).json({ error: 'No such endpoint.' });
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  res.json({ consolidation: consolidation.forEnrollment(req.user.id, enrollment) });
});

/**
 * Read the whole curriculum: every subject, every grade, every level.
 *
 * The path route above needs an enrollment, because a path is a thing a learner
 * is standing on. That makes the other fifteen grades unreachable, which is
 * correct for someone using the product and useless for anyone looking at how it
 * is built — and it means the syllabus, the topic order and the path lengths can
 * only be checked by reading source.
 *
 * So this is a read-only view of the same plan the learner is served, with no
 * enrollment and no consequence: it marks nothing, advances nothing, and grants
 * nothing. `?track=` and `?grade=` narrow it; without them it returns every grade
 * at once, which is the shape the whole-curriculum question actually wants.
 *
 * Where an account *is* enrolled, its position is included so the reader can see
 * where they stand inside the whole rather than only the part in front of them.
 */
router.get('/curriculum', requireAuth, (req, res) => {
  if (!canBrowse(req.user)) return res.status(403).json({ error: 'Not available on this account.' });

  const onlyTrack = req.query.track || null;
  const onlyGrade = req.query.grade || null;
  // The complete view is kept for callers that need every level, but the page
  // first asks for a catalogue. Sending every node for every grade before the
  // browser can show the grade list made the imported Spanish curriculum look
  // absent: the response was several megabytes before the first useful row.
  const summaryOnly = req.query.view === 'summary' || req.query.summary === '1';

  const tracks = curriculum.TRACKS
    .filter((t) => !onlyTrack || t.id === onlyTrack)
    .map((track) => {
      // Where this account stands on each grade it has joined, so the reader can
      // see their own position inside the whole rather than only the whole. Every
      // enrollment on this track, so the position shows whether or not the view
      // has been narrowed to one grade.
      const byGrade = new Map();
      for (const e of db.find('enrollments', (x) => x.user_id === req.user.id && x.track_id === track.id)) {
        byGrade.set(e.grade_id, e);
      }

      const grades = track.grades
        .filter((g) => !onlyGrade || g.id === onlyGrade)
        .map((grade) => {
          const enrollment = byGrade.get(grade.id) || null;
          const current = enrollment ? (enrollment.current_level || 1) : null;
          const nodes = [];
          let lessonCount = 0;
          if (!summaryOnly) {
            for (let level = 1; level <= grade.pathLength; level++) {
              const plan = curriculum.levelPlan(grade, level);
              const t = topics.topicFor(grade, level, plan.focus, track.id);
              const entry = LAYOUT.entryFor(grade, level);
              const rowTopic = track.id === 'iq'
                ? { topic: t ? t.topic : null, covers: entry ? entry.covers || '' : t ? t.covers || '' : '' }
                : entry ? { topic: entry.topic || entry.title, covers: entry.covers || '' } : t;
              nodes.push({
                level,
                kind: plan.kind,
                delivered: plan.delivered,
                label: curriculum.checkpointLabel(grade, level),
                checkpoint: plan.checkpoint,
                focus: plan.focus,
                focus_name: curriculum.skillName(plan.focus),
                topic: rowTopic ? rowTopic.topic : null,
                // The course's own title and type for the level, as on the enrolled
                // path: the title says which level this is and the type says what
                // sort it is. Null on a grade that does not name its levels.
                level_title: entry ? entry.title : null,
                type: entry ? entry.type : null,
                // As on the enrolled path: the coverage is what a level is for, and
                // the skill is only where it is filed.
                covers: rowTopic ? (rowTopic.covers || null) : null,
                difficulty: Math.round(plan.difficulty * 10) / 10,
                state: !enrollment
                  ? 'unjoined'
                  : level < current ? 'done' : level === current ? 'current' : 'locked',
              });
            }
            lessonCount = nodes.filter((n) => n.kind === 'lesson').length;
          } else {
            for (let level = 1; level <= grade.pathLength; level++) {
              if (curriculum.levelKind(level, grade.pathLength, grade) === 'lesson') lessonCount++;
            }
          }
          const checkpoints = [];
          for (let level = LAYOUT.nextCheckpoint(grade, 1); level != null;
            level = LAYOUT.nextCheckpoint(grade, level + 1)) {
            const plan = curriculum.levelPlan(grade, level);
            if (plan.checkpoint) checkpoints.push({
              level,
              kind: plan.checkpoint,
              label: curriculum.checkpointLabel(grade, level),
            });
          }
          const outline = topics.gradeOutline(grade, track.id);
          return {
            id: grade.id,
            name: grade.name,
            blurb: grade.blurb,
            tier: grade.tier,
            path_length: grade.pathLength,
            skills: grade.skills.map((id) => ({ id, name: curriculum.skillName(id) })),
            // The syllabus, so the path and what it is teaching can be read
            // together rather than inferred from the levels.
            topics: summaryOnly ? [] : outline,
            topic_count: outline.length,
            // How many lesson levels the grade holds against how many topics it
            // has to teach, which is the number that goes wrong when a path is
            // sized by hand.
            lessons: lessonCount,
            // Whether the syllabus states the level of each lesson, which decides
            // whether the quizzes follow a lesson or precede it.
            stated_lessons: curriculum.statesLessonLevels(grade),
            checkpoints,
            enrolled: !!enrollment,
            current_level: current,
            nodes: summaryOnly ? [] : nodes,
            details: !summaryOnly,
          };
        });
      return {
        id: track.id,
        name: track.name,
        blurb: track.blurb,
        color: track.color,
        icon: track.icon,
        grades,
      };
    });

  res.json({
    tracks,
    // The spacing is no longer sent. It was the one number the browser needed and
    // the one number that cannot describe a stated layout, so the page now says
    // what a layout is in words the data supplies rather than in arithmetic the
    // data contradicts. Each grade carries `stated_lessons` for that.
    checkpoints: {},
  });
});

// ── The Challenge Exam ─────────────────────────────────────────────────────
/**
 * A way past levels the learner has already proved they can do, offered for a
 * run of twenty-five consecutive levels at 90% or better.
 *
 * The exam is five bands of seven drawn from the levels *above* where the
 * learner stands, and it moves them only as far as an unbroken run of perfect
 * bands reaches. Start at 92 and the bands are 100 through 140; five clean
 * bands and 140 is theirs, break the fourth and 130 is as far as it goes.
 *
 * It is a kind of sitting of its own and is never resumed, because its bands
 * only mean anything all together — half a Challenge Exam is not half a level
 * skip, it is no level skip.
 */
router.post('/skip-exam/:enrollmentId', requireAuth, limit('skip-exam', 4, 24 * 3600 * 1000), async (req, res) => {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  if (enrollment.status === 'graduated') {
    return res.status(409).json({ error: 'You have graduated this track.' });
  }
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  const offer = mastery.skipOffer(req.user.id, enrollment, grade);
  if (!offer.offered) {
    return res.status(409).json({
      error: `Not yet — this needs ${offer.needed} levels in a row at ${Math.round(offer.mark * 100)}%. You are on ${offer.run}.`,
      offer,
    });
  }
  if (!offer.bands.length) {
    return res.status(409).json({ error: 'There is nothing further on this path to skip to.' });
  }

  // One exam open at a time. Without this a double-tap stacks two sittings on
  // the same offer, and whichever is finished last is the one that counts — so
  // the learner sits the exam twice and is told the first attempt never
  // happened. The open one is handed back instead, which is also what a reload
  // needs.
  const open = db.findOne('sessions', (s) => s.user_id === req.user.id
    && s.enrollment_id === enrollment.id && s.kind === 'skip' && !s.ended_at);
  if (open) {
    return res.status(409).json({
      error: 'You already have a Challenge Exam open.',
      session_id: open.id,
      resumed: true,
    });
  }

  const { session, items } = await sessions.createSkipExamSession({ userId: req.user.id, enrollment, grade });
  res.status(201).json({
    session_id: session.id,
    kind: 'skip',
    level: enrollment.current_level,
    from_level: enrollment.current_level,
    bands: session.bands,
    total: items.length,
    items: items.map((it) => sessions.sanitize(it)),
  });
});

/** Re-read a Challenge Exam, so a reload mid-exam does not lose the sitting. */
router.get('/skip-exam/:id', requireAuth, (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session || session.user_id !== req.user.id || session.kind !== 'skip') {
    return res.status(404).json({ error: 'Exam not found.' });
  }
  res.json({
    session_id: session.id,
    kind: 'skip',
    level: session.level,
    from_level: session.start_level,
    bands: session.bands,
    ended_at: session.ended_at,
    result: session.ended_at ? session.score : null,
    items: sessions.itemsFor(session.id).map((it) => itemForPage(session, it)),
  });
});

/**
 * Score a finished Challenge Exam and apply the jump.
 *
 * The result is written to the session before the level moves, so calling this
 * twice cannot award the same skip twice: the second call reads the stored
 * result back. That also means a reload after the exam lands on the same
 * outcome rather than on a second jump.
 */
router.post('/skip-exam/:id/finish', requireAuth, (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session || session.user_id !== req.user.id || session.kind !== 'skip') {
    return res.status(404).json({ error: 'Exam not found.' });
  }
  const enrollment = db.byId('enrollments', session.enrollment_id);
  const grade = enrollment && curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!enrollment || !grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  if (session.ended_at) {
    return res.json({ ...(session.score || {}), already: true });
  }

  const score = sessions.scoreSkipExam(session.id);
  if (!score.asked) return res.status(409).json({ error: 'Answer at least one question first.' });

  const items = db.find('items', (i) => i.session_id === session.id && i.correct !== null);
  const xp = mastery.xpForItems(items);
  const user = db.byId('users', req.user.id);
  db.update('users', req.user.id, { xp: (user.xp || 0) + xp });

  const moved = score.target_level
    ? mastery.awardSkip(req.user.id, enrollment, grade, score.target_level)
    // Spent either way: the exam measured the levels above where the learner
    // stood, and re-sitting it to fish for a better draw is what the old
    // checkpoint cooldown used to exist to stop. The run itself is untouched, so
    // another twenty-five clean levels earns another exam.
    : mastery.spendOffer(req.user.id, enrollment.id);

  const result = {
    bands: score.bands,
    target_level: score.target_level,
    moved_to: moved,
    asked: score.asked,
    correct: score.correct,
    total: score.total,
    accuracy: score.accuracy,
    xp,
  };
  db.update('sessions', session.id, {
    ended_at: new Date().toISOString(),
    score: result,
    xp_awarded: xp,
    skipped_to: moved,
  });

  res.json(result);
});

// ── development tools ──────────────────────────────────────────────────────
/**
 * Put a learner where a long run of clean levels would have put them.
 *
 * Reaching the Challenge Exam honestly takes twenty-five levels, and there is no
 * way to script that through the API — the run is written as levels are cleared,
 * one at a time, by the ordinary path. This exists so the exam can be exercised
 * during development without playing a season of a subject first.
 *
 * It is gated on DEV_TOOLS rather than on NODE_ENV, deliberately. This app is
 * already deployed with NODE_ENV unset in at least one real environment, and
 * anything that grants levels is exactly the thing that must not open by
 * accident. Off unless someone says so, in one place, at the top of the file.
 *
 * And never in production, whatever the flag says (security review 2026-10-24, D5):
 * with NODE_ENV=production the block is not registered at all, and each route checks
 * again per request, so a flag copied into a production .env opens nothing.
 */
const devToolsRefused = () => process.env.NODE_ENV === 'production';
if (process.env.DEV_TOOLS === '1' && devToolsRefused()) {
  console.warn('DEV_TOOLS=1 ignored: the development tools never run with NODE_ENV=production.');
}
if (process.env.DEV_TOOLS === '1' && !devToolsRefused()) {
  router.use('/dev', (req, res, next) => (devToolsRefused() ? res.status(404).json({ error: 'No such endpoint.' }) : next()));
  router.post('/dev/seed-skip-run', requireAuth, (req, res) => {
    const enrollment = db.byId('enrollments', req.body.enrollment_id);
    if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
    const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
    if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });

    const to = Math.max(1, Math.min(grade.pathLength, Number(req.body.level) || 92));
    // A learner who has not placed yet is not on the path at all, and the offer
    // checks that — so this marks the placement done rather than leaving a
    // half-built enrollment that the rest of the app would refuse to serve.
    db.update('enrollments', enrollment.id, { current_level: to, status: 'active', placed_at: new Date().toISOString() });
    for (let level = to - curriculum.SKIP_STREAK_LEVELS + 1; level <= to; level++) {
      mastery.recordLevelCleared({
        userId: req.user.id,
        enrollmentId: enrollment.id,
        level,
        accuracy: 1,
        grade,
      });
    }
    res.json({ ok: true, level: to, skip: mastery.skipOffer(req.user.id, enrollment, grade) });
  });

  /**
   * The answer key, for a test harness. The ordinary client never receives it —
   * that is the product's central guarantee — so a script driving the app over
   * HTTP has no way to answer correctly, and without this the exam can only be
   * exercised in-process. Scoped to the caller's own items, and gated the same
   * way as the seed above.
   */
  router.get('/dev/item-key/:sessionId', requireAuth, (req, res) => {
    const session = db.byId('sessions', req.params.sessionId);
    if (!session || session.user_id !== req.user.id) return res.status(404).json({ error: 'Session not found.' });
    res.json({
      items: sessions.itemsFor(session.id).map((i) => ({
        id: i.id, band: i.band, answer: i.answer, skill_id: i.skill_id, difficulty: i.difficulty,
      })),
    });
  });

  /**
   * Set a password on an account, by email.
   *
   * The store is held in memory, so a script cannot seed a credential into the
   * running server's copy of a user — it would be writing to a different
   * process's data and the change would vanish. This is the only way to make a
   * real sign-in possible from outside, which is what checking the level preview
   * against the actual privileged account needs. Gated the same way as the rest
   * of this block, and off unless someone says so.
   *
   * Narrowed 2026-10-24 (security review D5): it used to let ANY signed-in account
   * set ANY account's password, the owner's included. Now the caller must be an
   * admin (ADMIN_EMAILS) and may set only their own account's password; anyone else
   * gets the same 404 as a missing route, and production refuses it outright.
   */
  router.post('/dev/set-password', requireAuth, limit('dev-set-password', 20, 60 * 60 * 1000), (req, res) => {
    if (devToolsRefused() || !isAdmin(req.user)) return res.status(404).json({ error: 'No such endpoint.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || password.length < 8) {
      return res.status(400).json({ error: 'Give an email and a password of at least eight characters.' });
    }
    const target = db.findOne('users', (u) => String(u.email || '').toLowerCase() === email);
    if (!target || target.id !== req.user.id) {
      return res.status(403).json({ error: 'Only your own account\'s password can be set here.' });
    }
    // Required lazily, like the rest of the optional-dependency handling here.
    // eslint-disable-next-line global-require
    db.update('users', target.id, { password_hash: require('bcryptjs').hashSync(password, 10) });
    res.json({ ok: true, email: target.email });
  });
}

// The router, and the one piece of its arithmetic the self-test asks, so that a
// check on the path window is a check on this file rather than on a copy of it.
module.exports = router;
module.exports.windowStartFor = windowStartFor;
// The decision about opening another level, exported so a test asks it rather than
// reimplementing it. See the comment on it above.
module.exports.mayOpenLevel = mayOpenLevel;
module.exports.reviewKind = reviewKind;
