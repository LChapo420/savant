/**
 * Chess, piano and basketball: the skill record (services/skill-record.js;
 * staged patch skills-round3/01-skill-record). Off unless SKILL_RECORD=on:
 * every route under /api/skills then answers 404, the same as before.
 *
 *   GET /api/skills/record/:enrollmentId   the current stage: each metric's status and sittings, the gate
 *   GET /api/skills/path/:enrollmentId     the rows the path shows for this stage (from the parts below)
 *
 * The other staged parts mount here when their patch is applied, each behind
 * its own flag: routes/skill-checks.js (02, SKILL_STAGE_TESTS), routes/skill-gate.js
 * (03, SKILL_STAGE_GATE) and routes/skill-dose.js (04, SKILL_DOSE). Each exports
 * its router and a `pathNode(userId, enrollment, view)` for the path.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const record = require('../services/skill-record');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** A staged part, when its patch has been applied; null when it has not. */
function part(name) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(`./${name}`);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && String(err.message).includes(name)) return null;
    throw err;
  }
}
const PARTS = ['skill-checks', 'skill-gate', 'skill-dose'].map((name) => ({ name, mod: part(name) })).filter((p) => p.mod);

router.use('/skills', (req, res, next) => {
  if (!record.enabled()) return res.status(404).json({ error: 'No such endpoint.' });
  next();
});

/** The signed-in learner's own skill-subject enrollment, or a reason it is not. */
function skillEnrollment(req) {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return { status: 404, error: 'Enrollment not found.' };
  if (!record.isSkillTrack(enrollment.track_id)) return { status: 404, error: 'This subject has no skill record.' };
  if (!record.stageFor(enrollment.track_id, enrollment.grade_id)) return { status: 404, error: 'This grade is in no skill stage.' };
  return { enrollment };
}

function heading(enrollment) {
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const track = curriculum.getTrack(enrollment.track_id);
  return {
    enrollment: { id: enrollment.id, status: enrollment.status, current_level: enrollment.current_level, path_length: grade ? grade.pathLength : null },
    track: track ? { id: track.id, name: track.name } : { id: enrollment.track_id, name: enrollment.track_id },
    grade: grade ? { id: grade.id, name: grade.name } : { id: enrollment.grade_id, name: enrollment.grade_id },
  };
}

router.get('/skills/record/:enrollmentId', requireAuth, (req, res) => {
  const { enrollment, status, error } = skillEnrollment(req);
  if (!enrollment) return res.status(status).json({ error });
  res.json({ ...heading(enrollment), record: record.stageView(req.user.id, enrollment) });
});

router.get('/skills/path/:enrollmentId', requireAuth, (req, res) => {
  const { enrollment } = skillEnrollment(req);
  if (!enrollment) return res.json({ nodes: [] });
  const view = record.stageView(req.user.id, enrollment);
  const nodes = [];
  for (const p of PARTS) {
    if (typeof p.mod.pathNode !== 'function') continue;
    try {
      const node = p.mod.pathNode(req.user.id, enrollment, view);
      if (node) nodes.push(...[].concat(node));
    } catch (err) {
      console.error(`[skills] ${p.name} path row failed: ${err.message}`);
    }
  }
  res.json({ stage: view ? { id: view.stage.id, name: view.stage.name } : null, nodes });
});

for (const p of PARTS) if (p.mod.router || typeof p.mod === 'function') router.use(p.mod.router || p.mod);

module.exports = router;
module.exports.heading = heading;
module.exports.skillEnrollment = skillEnrollment;
