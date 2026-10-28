/**
 * The admin area: every learner, their learning scorecard, learning-style
 * summary, what they told us about themselves, their progress, and the evidence
 * behind it.
 *
 * Every route here is behind requireAdmin (ADMIN_EMAILS, the owner by default),
 * which answers 404 to anyone else. Read-only: nothing here changes a learner's
 * data, and nothing here calls a model.
 */
const express = require('express');
const path = require('path');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const subscriptions = require('../config/subscriptions');
const mastery = require('../services/mastery');
const learner = require('../services/learner');
const details = require('../services/details');
const personalize = require('../services/personalize');
const scorecard = require('../services/scorecard');
const translate = require('../services/scorecard/translate');
const summary = require('../services/scorecard/summary');
const ai = require('../services/ai');
const learnerRecord = require('../services/learner-record');
const realMetrics = require('../services/real-user-metrics');
const { requireAuth, requireAdmin, isAdmin, publicUser } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

function lastActive(userId) {
  return db.find('sessions', (s) => s.user_id === userId)
    .map((s) => s.ended_at || s.started_at || s.created_at)
    .filter(Boolean)
    .sort()
    .pop() || null;
}

function accuracyOf(userId) {
  const answered = db.find('items', (i) => i.user_id === userId && i.correct !== null && i.correct !== undefined);
  return {
    answered: answered.length,
    accuracy: answered.length ? answered.filter((i) => i.correct).length / answered.length : null,
  };
}

/** What the learner wrote about their interests, hobbies and sports, in one line. */
function interestsOf(profile) {
  const s = profile.survey || {};
  return ['interests', 'hobbies', 'sports'].map((k) => String(s[k] || '').trim()).filter(Boolean).join('; ');
}

function subjectRow(e) {
  const track = curriculum.getTrack(e.track_id);
  const grade = curriculum.getGrade(e.track_id, e.grade_id);
  return {
    id: e.id,
    track_id: e.track_id,
    grade_id: e.grade_id,
    track: track ? track.name : e.track_id,
    grade: grade ? grade.name : e.grade_id,
    level: e.current_level,
    path_length: grade ? grade.pathLength : null,
    status: e.status,
    placed_at: e.placed_at || null,
  };
}

/** Every learner, one row each, for the list. */
router.get('/users', (req, res) => {
  const cards = new Map(db.all('scorecards').map((c) => [c.user_id, c]));
  const users = db.all('users').map((user) => {
    const profile = learner.getProfile(user.id);
    const card = cards.get(user.id);
    const { answered, accuracy } = accuracyOf(user.id);
    const sum = card ? summary.summarize(card) : null;
    return {
      ...publicUser(user, profile),
      is_admin: isAdmin(user),
      plan: profile.subscription || 'standard',
      last_active: lastActive(user.id),
      sessions: db.find('sessions', (s) => s.user_id === user.id && s.kind !== 'placement').length,
      answered,
      accuracy,
      subjects: db.find('enrollments', (e) => e.user_id === user.id).map(subjectRow),
      interests: interestsOf(profile),
      scorecard_confidence: card ? scorecard.overallConfidence(card) : 0,
      top_traits: sum ? sum.strongest.slice(0, 3).map((t) => t.reads) : [],
      tailored_pages: db.find('level_edits', (e) => e.user_id === user.id && !e.problem).length,
    };
  }).sort((a, b) => String(b.last_active || b.created_at).localeCompare(String(a.last_active || a.created_at)));

  const edits = db.all('level_edits');
  const pages = db.all('level_signals').filter((r) => r.kind === 'base_lesson');
  res.json({
    totals: {
      users: users.length,
      active_7d: users.filter((u) => u.last_active && Date.now() - Date.parse(u.last_active) < 7 * 86400000).length,
      sessions: db.all('sessions').filter((s) => s.kind !== 'placement').length,
      answers: db.all('items').filter((i) => i.correct !== null && i.correct !== undefined).length,
      tailored_pages: edits.filter((e) => !e.problem).length,
      rejected_pages: edits.filter((e) => e.problem).length,
      lesson_pages_finished: pages.length,
      holdout_pages_finished: pages.filter((r) => r.arm === 'holdout').length,
    },
    users,
  });
});

/** Everything about one learner. */
router.get('/users/:id', (req, res) => {
  const user = db.byId('users', req.params.id);
  if (!user) return res.status(404).json({ error: 'No such user.' });
  const profile = learner.getProfile(user.id);
  const card = scorecard.get(user.id);
  const trackId = typeof req.query.track === 'string' && req.query.track ? req.query.track : null;
  const enrollments = db.find('enrollments', (e) => e.user_id === user.id);

  // The brief the level editor would send for this learner's current level, on
  // the course chosen (or their most recent one): the exact text, not a summary.
  const focus = enrollments.find((e) => e.track_id === trackId) || enrollments[enrollments.length - 1] || null;
  const where = focus ? { trackId: focus.track_id, gradeId: focus.grade_id, level: focus.current_level } : {};

  const view = scorecard.view(user.id, { trackId });
  res.json({
    user: { ...publicUser(user, profile), last_active: lastActive(user.id), ...accuracyOf(user.id) },
    plan: profile.subscription || 'standard',
    levels_written_for_them: subscriptions.canEditLevels(user, profile),
    summary: summary.summarize(card, { trackId }),
    survey: { ...learner.blankSurvey(), ...(profile.survey || {}) },
    survey_fields: Object.fromEntries(Object.entries(learner.SURVEY_FIELDS).map(([k, v]) => [k, v.label])),
    scorecard: {
      overall_confidence: scorecard.overallConfidence(card),
      categories: view.categories,
      tracks: Object.keys(card.subjects || {}),
    },
    applied: translate.directives(card, { use: 'L', trackId })
      .map((d) => ({ name: d.name, text: d.text, confidence: d.confidence, strong: d.strong })),
    brief: focus ? details.brief(user.id, where) : null,
    brief_for: focus ? `${focus.track_id}/${focus.grade_id} level ${focus.current_level}` : null,
    next_arm: focus ? personalize.armFor(user.id, where) : null,
    questionnaire: {
      taken: !!profile.took_style_quiz,
      stated: profile.style_vector || {},
      observed: profile.observed || {},
      traits: profile.observed_traits || [],
    },
    conclusions: profile.feedback_conclusions || [],
    evidence: (card.log || []).slice(-60).reverse().map((l) => ({
      ...l, name: scorecard.BY_ID[l.stat] ? scorecard.BY_ID[l.stat].name : l.stat,
    })),
    enrollments: enrollments.map((e) => {
      const row = subjectRow(e);
      const grade = curriculum.getGrade(e.track_id, e.grade_id);
      row.skills = grade ? grade.skills.map((id) => {
        const st = mastery.stateFor(user.id, id);
        return { name: curriculum.skillName(id), mastery: st.mastery, attempts: st.attempts, correct: st.correct, error_tags: st.error_tags || [] };
      }).filter((s) => s.attempts > 0) : [];
      return row;
    }),
    tailored_pages: db.find('level_edits', (e) => e.user_id === user.id)
      .sort((a, b) => b.level - a.level).slice(0, 30)
      .map((e) => ({
        track_id: e.track_id,
        grade_id: e.grade_id,
        level: e.level,
        topic: e.topic || null,
        basis: e.basis,
        model: e.model,
        seconds: e.seconds,
        arm: e.arm || null,
        experiment: e.experiment ? `${e.experiment.label} (${e.experiment.arm === 'high' ? 'with' : 'without'})` : null,
        problem: e.problem || null,
        generated_at: e.generated_at || e.created_at,
      })),
    levels: db.find('level_signals', (r) => r.user_id === user.id).slice(-40).reverse()
      .map((r) => ({ level: r.level, track_id: r.track_id, kind: r.kind, accuracy: r.accuracy, conclusion: r.conclusion || null, said: r.said || null, arm: r.arm || null })),
    feedback: db.find('level_feedback', (f) => f.user_id === user.id).slice(-20).reverse()
      .map((f) => ({ level: f.level, track_id: f.track_id, liked: f.liked, disliked: f.disliked, comments: f.comments || '', pace: f.pace || null, length: f.length || null, difficulty: f.difficulty || null, at: f.submitted_at })),
    sessions: db.find('sessions', (s) => s.user_id === user.id)
      .sort((a, b) => String(b.started_at || b.created_at).localeCompare(String(a.started_at || a.created_at)))
      .slice(0, 25)
      .map((s) => ({
        id: s.id, kind: s.kind, track_id: s.track_id, levels: s.levels || [s.level],
        started_at: s.started_at || s.created_at, ended_at: s.ended_at, score: s.score,
        summary: s.analysis && s.analysis.summary ? s.analysis.summary : null,
      })),
    record: (() => {
      const rec = learnerRecord.get(user.id);
      return {
        facts: rec.facts.filter((f) => f.status !== 'superseded').sort((a, b) => b.support - a.support),
        recommendations: rec.recommendations.slice().reverse(),
        big: Object.entries(rec.big || {}).filter(([, b]) => b.count > 0)
          .map(([stat, b]) => ({ stat, name: scorecard.BY_ID[stat] ? scorecard.BY_ID[stat].name : stat, dir: b.dir, count: b.count })),
        conclusions: rec.conclusions.slice(-15).reverse(),
      };
    })(),
    reads: db.find('level_debriefs', (d) => d.user_id === user.id).slice(-25).reverse()
      .map((d) => ({
        level: d.level, track_id: d.track_id, kind: d.kind, source: d.source, status: d.status, mode: d.mode || null,
        reason: d.reason || null, due_at: d.due_at, finished_at: d.finished_at || null, conclusion: d.conclusion || null,
        report: d.report || null, reviews: d.reviews || [],
      })),
    // Every block level written for them: lessons and retention checks (layout and
    // fill-out), tailored checkpoints, and tailored game question sets — with the
    // model that wrote each one and what it spent.
    block_levels: [
      ...db.find('block_plans', (p) => p.user_id === user.id).map((p) => ({
        kind: p.kind === 'checkpoint' ? (p.checkpoint_kind || 'checkpoint') : p.kind,
        track_id: p.track_id,
        level: p.level,
        attempt: p.attempt || 1,
        status: p.status,
        reason: p.reason || null,
        approach: p.approach || '',
        layout: p.kind === 'checkpoint'
          ? `${p.filled || 0}/${p.wanted || 0} questions; styles ${[...new Set((p.layout || []).map((l) => l.style))].join(', ')}`
          : (p.blocks || []).map((b) => b.block).join(' → '),
        checks: (p.checks || []).length,
        dropped: (p.dropped || []).map((d) => d.block),
        right: Object.entries(p.answers || {}).filter(([k, a]) => k.startsWith(`${user.id}:`) && a.correct).length,
        answered: Object.keys(p.answers || {}).filter((k) => k.startsWith(`${user.id}:`)).length,
        arm: p.arm || null,
        experiment: p.experiment ? `${p.experiment.label} (${p.experiment.arm === 'high' ? 'with' : 'without'})` : null,
        model: p.model || null,
        usage: p.usage || null,
        seconds: p.seconds || null,
        at: p.finished_at || p.started_at || null,
      })),
      ...db.find('game_payloads', (g) => g.user_id === user.id).map((g) => ({
        kind: `game (${g.engine_id})`,
        track_id: g.track_id,
        level: g.level,
        attempt: 1,
        status: g.payload && !(g.problems || []).length ? 'ready' : 'failed',
        reason: (g.problems || [])[0] || null,
        approach: g.plan && g.plan.curve ? `curve: ${g.plan.curve}${g.plan.theme && !/^none$/i.test(g.plan.theme) ? `; theme: ${g.plan.theme}` : ''}` : '',
        layout: g.plan && g.plan.mix ? g.plan.mix.map((m) => `${m.count}× ${m.style} ${m.skill}`).join(', ') : '',
        checks: g.payload ? (g.payload.questions || []).length : 0,
        dropped: [],
        right: null,
        answered: null,
        arm: g.arm || null,
        experiment: g.experiment ? `${g.experiment.label} (${g.experiment.arm === 'high' ? 'with' : 'without'})` : null,
        model: g.model || null,
        usage: g.usage || null,
        seconds: g.seconds || null,
        at: g.generated_at || null,
      })),
    ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 40),
    big_after: learnerRecord.BIG_AFTER,
    ai_usage_today: ai.usageToday(user.id),
  });
});

/**
 * Real-user metrics (services/real-user-metrics.js, rules in docs/METRICS.md):
 * sign-ups, active days, day-1/day-7 return, sessions and minutes, AI cost per
 * active learner. Test, demo and founder accounts are counted apart, never as users.
 */
function metricsNow(req) {
  return realMetrics.compute(db, {
    days: Number(req.query.days) || 30,
    ledgerDir: process.env.METRICS_LEDGER_DIR || path.join(__dirname, '..', 'data'),
  });
}

router.get('/metrics', (req, res) => {
  res.json(metricsNow(req));
});

router.get('/metrics.csv', (req, res) => {
  const table = typeof req.query.table === 'string' ? req.query.table : 'daily';
  if (!realMetrics.TABLES.includes(table)) return res.status(400).json({ error: `table must be one of ${realMetrics.TABLES.join(', ')}` });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="metrics-${table}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(realMetrics.toCsv(metricsNow(req), table));
});

/** Every learner's 100 stats as a spreadsheet: score and confidence per stat. */
router.get('/export.csv', (req, res) => {
  const quote = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // A leading = + - @ would be read as a formula by a spreadsheet.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ['user_id', 'email', 'name', 'joined', 'plan', 'interests', 'overall_confidence',
    ...scorecard.STATS.flatMap((s) => [s.id, `${s.id}_confidence`])];
  const rows = [header.join(',')];
  for (const user of db.all('users')) {
    const profile = learner.getProfile(user.id);
    const card = db.findOne('scorecards', (c) => c.user_id === user.id);
    const cells = [user.id, user.email, user.display_name, user.created_at, profile.subscription || 'standard',
      interestsOf(profile), card ? scorecard.overallConfidence(card) : 0];
    for (const s of scorecard.STATS) {
      const r = card ? scorecard.read(card, s.id) : { score: '', confidence: 0 };
      cells.push(r.score, r.confidence);
    }
    rows.push(cells.map(quote).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="scorecards-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(rows.join('\n'));
});

module.exports = router;
