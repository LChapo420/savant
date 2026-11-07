/**
 * Home's "Your material" and the Past page under UI_V2 (docs/UI-V2.md). GET /api/ui2/material-progress, read only.
 *
 * Why not /api/materials/:id/study for each upload: that call makes a blank progress row for a course nobody has opened, and Home must not store anything by being looked at.
 *
 * When an upload counts as complete. There is no such field, so it is worked out from what is stored: its learning path is fully built (course status "ready"), it has at least one part, and every
 * part is mastered or set aside by the learner's own goal, the same test js's nextStep uses for "done" (services/material-study.js). A mastered part that has come due for review stays complete; the row says a review is due.
 * Notes, podcasts, flashcards and practice tests keep no finished record, so they can't make an upload complete; an upload with no path is "not started".
 */
const db = require('../config/db');

/** Pure, so the test can check it: an upload's progress from its course and its progress row. */
function summarize(course, row, asideIds = []) {
  if (!course) return { status: 'none', mastered: 0, total: 0, due: 0, started: false, complete: false };
  const skills = course.skills || [];
  const aside = new Set(asideIds);
  const states = (row && row.skills) || {};
  const counted = skills.filter((s) => !aside.has(s.id));
  const mastered = counted.filter((s) => (states[s.id] || {}).status === 'mastered').length;
  const now = Date.now();
  const due = counted.filter((s) => { const st = states[s.id] || {}; return st.status === 'mastered' && st.due && Date.parse(st.due) <= now; }).length;
  const started = !!(row && (row.placed || Object.keys(states).length));
  return { status: course.status || 'none', mastered, total: counted.length, due, started, complete: course.status === 'ready' && counted.length > 0 && mastered === counted.length };
}

function progressFor(user) {
  const materials = require('./materials'); // eslint-disable-line global-require
  const courses = require('./course-builder'); // eslint-disable-line global-require
  const goal = require('./study-goal'); // eslint-disable-line global-require
  const rows = db.forUser('material_progress', user.id);
  return materials.list(user.id).map((m) => {
    const course = courses.get(user.id, m.id);
    const row = rows.find((r) => r.material_id === Number(m.id)) || null;
    let aside = [];
    if (course && course.skills && course.skills.length) {
      try { aside = goal.setAsideSkills(user.id, m.id, course).map((x) => x.id); } catch { aside = []; }
    }
    return { id: m.id, title: m.title, kind: m.kind, added_at: m.added_at, ...summarize(course, row, aside) };
  }).sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)));
}

/** The same test as the upload gate in routes/consent.js: a child account can't upload, with or without consent, and a guest saves first. */
function canUpload(user) {
  const a = require('../routes/consent').access(user); // eslint-disable-line global-require
  return !['pending', 'active', 'revoked', 'guest'].includes(a.state);
}

function reply(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Sign in first.' });
  res.setHeader('Cache-Control', 'no-store');
  const can = canUpload(req.user);
  return res.json({ can_upload: can, materials: can ? progressFor(req.user) : [] });
}

module.exports = { summarize, progressFor, canUpload, reply };
