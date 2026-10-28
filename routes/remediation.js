/**
 * "Help me learn" — the other door out of a failed Master or Grand Master quiz.
 *
 * Reading the failure is `GET /api/remediation/:enrollmentId`. Working on one
 * weak area is a conversation (`/teach`) and a round of drill questions
 * (`/drill`, then the ordinary answer route, then `/drill/finish`). An area holds
 * when its drills come in at or above the pass mark.
 *
 * Nothing here can move a level. The retry is the only thing that clears the
 * checkpoint, and it lives on the normal session route — which is also why every
 * response says the retry is available: the button is never conditional.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const sessions = require('../services/sessions');
const remediation = require('../services/remediation');
const mastery = require('../services/mastery');
const ai = require('../services/ai');
const bank = require('../content/bank');
const objectiveItems = require('../services/objective-items');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

function load(req) {
  const row = db.byId('remediations', req.params.id);
  if (!row || row.user_id !== req.user.id || row.cleared_at) return null;
  return row;
}

function payload(row) {
  return {
    remediation: remediation.sanitize(row),
    kind_label: curriculum.CHECKPOINT_LABEL[row.kind] || row.kind,
    // Stated every time on purpose: the client never has to work out whether
    // the retry is allowed yet, because it always is.
    can_retry: true,
    ai: ai.isEnabled(),
  };
}

/** What went wrong on the failed attempt, and the teaching for it. */
router.get('/remediation/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Enrollment not found.' });
  }
  const row = remediation.activeFor(req.user.id, enrollment.id);
  if (!row) return res.json({ remediation: null, can_retry: true });
  res.json({
    ...payload(row),
    enrollment_id: enrollment.id,
    grade_name: (curriculum.getGrade(enrollment.track_id, enrollment.grade_id) || {}).name || null,
  });
});

/**
 * One turn of the teaching conversation for a weak area.
 *
 * The transcript is stored, so closing the tab does not lose the thread, and so
 * the tutor picks up where it left off rather than starting over.
 */
router.post('/remediation/:id/teach', requireAuth, limit('remediation-teach', 240, 60 * 60 * 1000), async (req, res) => {
  const row = load(req);
  if (!row) return res.status(404).json({ error: 'Nothing to work on here.' });
  const index = Number(req.body.area_index || 0);
  const area = remediation.areaAt(row, index);
  if (!area) return res.status(404).json({ error: 'No such area.' });

  const said = String(req.body.message || '').trim().slice(0, 2000);
  const history = [...(area.messages || [])];
  if (said) history.push({ role: 'user', content: said });

  // The opener is written when the failure is read, so the first turn costs
  // nothing: it is already on the row.
  if (!history.length) {
    const opener = area.opener || 'Where do you want to start with this?';
    remediation.recordTalk(row.id, index, [{ role: 'assistant', content: opener }]);
    return res.json({ reply: opener, messages: [{ role: 'assistant', content: opener }], source: 'stored' });
  }

  const reply = await ai.remediationTeachReply({
    area: { ...area, skill_name: area.skill_name },
    level: row.level,
    kind: row.kind,
    messages: history,
    userId: req.user.id,
  });
  const text = reply || 'Take the last step again and tell me what you get — I want to see where it breaks.';
  const messages = [...history, { role: 'assistant', content: text }];
  remediation.recordTalk(row.id, index, messages);
  res.json({ reply: text, messages, source: reply ? 'ai' : 'fallback' });
});

/** A round of practice on one weak area: new questions, same skill, same level. */
router.post('/remediation/:id/drill', requireAuth, limit('remediation-drill', 60, 60 * 60 * 1000), async (req, res) => {
  const row = load(req);
  if (!row) return res.status(404).json({ error: 'Nothing to work on here.' });
  const index = Number(req.body.area_index || 0);
  const area = remediation.areaAt(row, index);
  if (!area) return res.status(404).json({ error: 'No such area.' });

  const enrollment = db.byId('enrollments', row.enrollment_id);
  const grade = enrollment && curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!enrollment || !grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  // Abandon an earlier unfinished round rather than leaving two open.
  for (const stale of db.find('sessions', (s) => s.user_id === req.user.id
    && s.kind === 'remediate' && !s.ended_at)) {
    db.update('sessions', stale.id, { ended_at: new Date().toISOString(), abandoned: true });
  }

  const { session, items } = await sessions.createDrillSession({
    userId: req.user.id,
    enrollment,
    grade,
    area,
    count: remediation.DRILL_COUNT,
  });

  res.status(201).json({
    session_id: session.id,
    area_index: index,
    skill_name: area.skill_name,
    required: row.required,
    items: items.map((it) => sessions.sanitize(it)),
  });
});

/**
 * After a missed Final (round 3, ADAPT_REMEDIATION=on): one recall question on
 * each objective the record says is kept but fading, with the answer straight
 * after. Tagged with the objective, so each answer is evidence on it alone.
 */
router.post('/remediation/:id/recall', requireAuth, limit('remediation-drill', 60, 60 * 60 * 1000), async (req, res) => {
  const row = load(req);
  if (!row || !row.record || !remediation.recordPlanOn(row.kind)) return res.status(404).json({ error: 'Nothing to recall here.' });
  const list = row.record.retrieve || [];
  if (!list.length) return res.status(409).json({ error: 'Nothing is fading; there is nothing to recall.' });
  const enrollment = db.byId('enrollments', row.enrollment_id);
  const grade = enrollment && curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!enrollment || !grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  for (const stale of db.find('sessions', (s) => s.user_id === req.user.id
    && s.kind === 'remediate' && !s.ended_at)) {
    db.update('sessions', stale.id, { ended_at: new Date().toISOString(), abandoned: true });
  }
  const session = db.insert('sessions', {
    user_id: req.user.id,
    enrollment_id: enrollment.id,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    level: enrollment.current_level,
    start_level: enrollment.current_level,
    end_level: enrollment.current_level,
    levels: [enrollment.current_level],
    blocks: [{ index: 0, level: enrollment.current_level, kind: 'drill', resolved: false }],
    kind: 'remediate',
    recall: true,
    params: { itemCount: list.length },
    started_at: new Date().toISOString(),
    ended_at: null,
    score: null,
    analysis: null,
    xp_awarded: 0,
  });
  const avoid = new Set(db.find('items', (i) => i.user_id === req.user.id).slice(-600).map((i) => bank.itemKey(i)));
  const shapes = new Set();
  const items = list.map((o, index) => {
    const plan = curriculum.levelPlan(grade, o.lesson_level);
    // Held to the grade's range and standard (config/grade-skills.js fitEntry).
    const entry = require('../config/grade-skills').fitEntry(grade, {
      skillId: o.skill, difficulty: Math.max(1, Math.min(10, Math.round(plan.difficulty * 10) / 10)), role: 'drill',
    });
    const { difficulty } = entry;
    // A question written for this objective first (OBJECTIVE_ITEMS), never one
    // already asked; the bank's question on its skill when it has none left.
    const written = objectiveItems.pick({ trackId: enrollment.track_id, gradeId: grade.id, objectiveId: o.objective, avoid, seenShapes: shapes, difficulty });
    const q = written ? { ...written, skill_id: written.skill_id || o.skill } : sessions.generateWithPreference(entry, false, avoid);
    avoid.add(bank.itemKey(q));
    return db.insert('items', {
      ...q,
      session_id: session.id,
      user_id: req.user.id,
      role: 'drill',
      level: o.lesson_level,
      block: 0,
      index,
      objective_id: o.objective,
      objective_test: true,
      user_answer: null,
      correct: null,
      ms: null,
      coach_used: false,
    });
  });
  res.status(201).json({
    session_id: session.id,
    required: row.required,
    items: items.map((it) => sessions.sanitize(it)),
  });
});

router.post('/remediation/:id/recall/finish', requireAuth, (req, res) => {
  const row = load(req);
  if (!row || !row.record) return res.status(404).json({ error: 'Nothing to recall here.' });
  const session = db.byId('sessions', req.body.session_id);
  if (!session || session.user_id !== req.user.id || session.kind !== 'remediate' || !session.recall) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  const score = sessions.scoreDrill(session.id);
  if (!score.answered) return res.status(409).json({ error: 'Answer at least one question first.' });
  const items = db.find('items', (i) => i.session_id === session.id && i.correct !== null);
  const xp = mastery.xpForItems(items);
  const accuracy = score.correct / score.answered;
  let updated = row;
  if (!session.ended_at) {
    db.update('sessions', session.id, { ended_at: new Date().toISOString(), score: accuracy, xp_awarded: xp });
    const user = db.byId('users', req.user.id);
    db.update('users', req.user.id, { xp: (user.xp || 0) + xp });
    updated = remediation.recordRecall(row.id, { correct: score.correct, asked: score.answered, sessionId: session.id });
  }
  res.json({ accuracy, correct: score.correct, asked: score.answered, xp, ...payload(updated) });
});

/** Score a finished round and say whether that area now holds. */
router.post('/remediation/:id/drill/finish', requireAuth, (req, res) => {
  const row = load(req);
  if (!row) return res.status(404).json({ error: 'Nothing to work on here.' });
  const index = Number(req.body.area_index || 0);
  if (!remediation.areaAt(row, index)) return res.status(404).json({ error: 'No such area.' });

  const session = db.byId('sessions', req.body.session_id);
  if (!session || session.user_id !== req.user.id || session.kind !== 'remediate') {
    return res.status(404).json({ error: 'Session not found.' });
  }

  const score = sessions.scoreDrill(session.id);
  if (!score.answered) return res.status(409).json({ error: 'Answer at least one question first.' });

  const items = db.find('items', (i) => i.session_id === session.id && i.correct !== null);
  const xp = mastery.xpForItems(items);
  const accuracy = score.correct / score.answered;
  if (!session.ended_at) {
    db.update('sessions', session.id, { ended_at: new Date().toISOString(), score: accuracy, xp_awarded: xp });
    const user = db.byId('users', req.user.id);
    db.update('users', req.user.id, { xp: (user.xp || 0) + xp });
  }

  const updated = remediation.recordDrill(row.id, index, {
    correct: score.correct,
    asked: score.answered,
    sessionId: session.id,
  });
  const area = remediation.areaAt(updated, index);
  const areas = updated.areas || [];
  const nextIndex = areas.findIndex((a, i) => !a.held && i !== index);

  res.json({
    accuracy,
    correct: score.correct,
    asked: score.answered,
    required: updated.required,
    held: !!area.held,
    xp,
    next_area: nextIndex === -1 ? null : nextIndex,
    all_held: areas.every((a) => a.held),
    ...payload(updated),
  });
});

module.exports = router;
