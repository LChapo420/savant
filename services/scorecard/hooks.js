/**
 * Where the scorecard meets the learning loop.
 *
 * The rest of the app calls these at the moments evidence appears — an answer,
 * a level closing, a creator-made lesson page finished, a learner saying how a
 * level felt, a session ending — and never touches the scorecard's arithmetic
 * directly. Every hook swallows its own errors: the scorecard learning something
 * is never allowed to break the thing the learner is actually doing.
 *
 * One row per level lives in `level_signals`: how it was read, how it went, what
 * the learner said, which experiment (if any) it ran, and a plain-language
 * conclusion the next level's writer is told.
 */
const db = require('../../config/db');
const scorecard = require('./index');
const footprints = require('./footprints');
const signals = require('./signals');
const irt = require('./irt');

function safely(label, fn) {
  try {
    return fn();
  } catch (err) {
    console.warn(`scorecard: ${label} failed: ${err.message}`);
    return null;
  }
}

/** One graded answer. */
function onAnswer(userId, item, { trackId } = {}) {
  return safely('answer', () => {
    // What the ability model expected of this answer (recorded by
    // mastery.recordAttempt just before), so signals read it against that.
    const ctx = irt.contextFor(userId, item);
    const obs = [...signals.fromAnswer(item, ctx), ...signals.delayedExperimentOutcome(userId, item, ctx)];
    if (obs.length) scorecard.observe(userId, obs, { source: `answer:${item.role || 'item'}`, trackId });
  });
}

function levelRow(userId, where) {
  return db.find('level_signals', (r) => r.user_id === userId && r.track_id === where.trackId
    && r.grade_id === where.gradeId && r.level === where.level && r.kind !== 'session')
    .slice(-1)[0] || null;
}

function upsertLevelRow(userId, where, patch) {
  const existing = levelRow(userId, where);
  if (existing) return db.update('level_signals', existing.id, patch);
  return db.insert('level_signals', {
    user_id: userId, track_id: where.trackId, grade_id: where.gradeId, level: where.level, ...patch,
  });
}

/**
 * Error tags this learner had already produced on each skill before this level,
 * so a repeat can be told apart from a first mistake.
 */
function errorTagsBefore(userId, firstItemId) {
  const tags = {};
  for (const item of db.forUser('items', userId).filter((i) => i.error_tag && i.id < firstItemId)) {
    (tags[item.skill_id] = tags[item.skill_id] || []).push(item.error_tag);
  }
  return tags;
}

/**
 * A plain-language line about how one level went, for the next level's writer.
 * Written from facts, not from a model, so it is always there.
 */
function conclusionFor({ kind, level, items }) {
  const answered = items.filter((i) => i.correct !== null && i.correct !== undefined);
  const right = answered.filter((i) => i.correct).length;
  const parts = [`Level ${level} (${String(kind).replace(/_/g, ' ')}): ${right}/${answered.length} right`];
  const coached = answered.filter((i) => i.coach_used).length;
  if (coached) parts.push(`${coached} with the coach`);
  const slow = answered.filter((i) => i.ms && i.ms > signals.expectedMs(i) * 2.5).length;
  if (slow >= 2) parts.push(`${slow} answers took much longer than expected`);
  const tags = [...new Set(answered.filter((i) => !i.correct && i.error_tag).map((i) => i.error_tag.replace(/_/g, ' ')))];
  if (tags.length) parts.push(`mistakes: ${tags.join(', ')}`);
  const missedSkills = [...new Set(answered.filter((i) => !i.correct).map((i) => i.skill_name || i.skill_id))];
  if (missedSkills.length && missedSkills.length <= 3) parts.push(`missed on ${missedSkills.join(', ')}`);
  return `${parts.join('; ')}.`;
}

/**
 * A creator-made lesson page was finished. Its evidence is only half known now —
 * how long it was read — and the other half arrives with the next practice level,
 * which is credited back to this row (see creditPendingLesson).
 */
function onBaseLessonFinished(userId, { trackId, gradeId, level, skillId, readMs, words, basis, experiment, arm, scrollBacks = null }) {
  return safely('lesson page', () => {
    const backs = cleanCount(scrollBacks);
    const obs = signals.fromBaseLesson({ readMs, words, nextAccuracy: null, scrollBacks: backs });
    if (obs.length) scorecard.observe(userId, obs, { source: 'lesson page', trackId });
    const minutes = ((Number(readMs) || 0) / 60000).toFixed(1);
    // A new record each time: reading a lesson page again is a second reading,
    // with its own time and its own next level, not an edit of the first.
    return db.insert('level_signals', {
      user_id: userId,
      track_id: trackId,
      grade_id: gradeId,
      level,
      kind: 'base_lesson',
      skill_id: skillId || null,
      basis: basis || 'base',
      arm: arm || null,
      experiment: experiment || null,
      read_ms: Math.max(0, Math.min(4 * 3600000, Number(readMs) || 0)),
      ...(backs === null ? {} : { scroll_backs: backs }),
      words: Number(words) || 0,
      pending: true,
      finished_at: new Date().toISOString(),
      conclusion: `Level ${level} (lesson page${basis === 'edited' ? ', written for them' : ''}): read in ${minutes} min.`,
    });
  });
}

/** A count from the page: a whole number 0-200, or null when it was not sent. */
function cleanCount(v) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return null;
  return Math.max(0, Math.min(200, Math.round(Number(v))));
}

/**
 * How a lesson level's lesson (an AI-written lesson in a session) was read:
 * the time it was open before the checks and how often the learner scrolled
 * back up over it. Saved on the level's row, where the level read
 * (onBlockResolved -> signals.fromLesson) finds it as telemetry.
 */
function onLessonRead(userId, { trackId, gradeId, level, readMs, scrollBacks }) {
  return safely('lesson read', () => {
    const backs = cleanCount(scrollBacks);
    const ms = Number(readMs);
    const patch = {};
    if (Number.isFinite(ms) && ms > 0) patch.read_ms = Math.min(4 * 3600000, Math.round(ms));
    if (backs !== null) patch.scroll_backs = backs;
    if (!Object.keys(patch).length) return null;
    return upsertLevelRow(userId, { trackId, gradeId, level }, patch);
  });
}

/**
 * The practice level after a lesson page is the test of that page. Credit its
 * accuracy back to the most recent lesson page on this course still waiting for
 * an outcome, if it is close behind.
 */
function creditPendingLesson(userId, { trackId, gradeId, level, accuracy, items = null, ctx = null }) {
  if (accuracy === null || accuracy === undefined) return;
  const pending = db.find('level_signals', (r) => r.user_id === userId && r.kind === 'base_lesson'
    && r.pending && r.track_id === trackId && r.grade_id === gradeId
    && r.level < level && level - r.level <= 5)
    .slice(-1)[0];
  if (!pending) return;
  const baseline = signals.lessonBaseline(userId);
  // The outcome of the page: the next level's main questions (not its
  // reviews or warm-up support) against what the ability model expected.
  let outcome = null;
  if (items && ctx && pending.experiment) {
    const answered = items.filter((i) => i.correct !== null && i.correct !== undefined);
    const main = answered.filter((i) => ['focus', 'stretch', 'check'].includes(i.role));
    outcome = signals.residuals(main.length ? main : answered, ctx);
  }
  const obs = signals.fromBaseLesson({
    readMs: 0, words: pending.words, nextAccuracy: accuracy, baseline, experiment: pending.experiment, outcome,
  });
  if (obs.length) scorecard.observe(userId, obs, { source: 'lesson page, judged by the next level', trackId });
  db.update('level_signals', pending.id, {
    pending: false,
    accuracy,
    conclusion: `${String(pending.conclusion || `Level ${pending.level} (lesson page).`).replace(/\.$/, '')}; `
      + `the level after it came out at ${Math.round(accuracy * 100)}%.`,
  });
}

/** A level closed: its block-level patterns, and for a lesson, how the lesson worked. */
function onBlockResolved(userId, { session, kind, level, items, trackId, experiment = null }) {
  return safely('block', () => {
    const graded = items.filter((i) => i.correct !== null && i.correct !== undefined);
    if (!graded.length) return null;
    const where = { trackId: session.track_id, gradeId: session.grade_id, level };
    const firstId = Math.min(...graded.map((i) => i.id));
    const ctx = irt.contextsFor(userId, graded);
    const obs = signals.fromBlock(graded, { priorErrorTags: errorTagsBefore(userId, firstId), ctx });
    const accuracy = signals.accuracy(graded);

    if (kind === 'block_lesson') {
      // A block lesson's own checks are the first outcome of the way it was
      // taught (the next practice level is the second, through its page row).
      if (experiment) obs.push(...signals.experimentOutcome(experiment, signals.residuals(graded, ctx), `block lesson taught ${experiment.arm === 'high' ? 'with' : 'without'} ${experiment.label}: its checks against expectation`));
    } else if (kind === 'lesson') {
      const lesson = db.findOne('lessons', (l) => l.user_id === userId && l.level === level
        && l.track_id === session.track_id && l.grade_id === session.grade_id);
      if (lesson) {
        obs.push(...signals.fromLesson(lesson, {
          telemetry: levelRow(userId, where) || {},
          checks: graded.filter((i) => i.role === 'check'),
          baseline: signals.lessonBaseline(userId),
          ctx,
        }));
      }
    } else {
      creditPendingLesson(userId, { ...where, accuracy, items: graded, ctx });
    }

    const gap = returnGapDays(userId, session, kind);
    if (gap !== null) obs.push(...signals.fromReturn(gap, graded, ctx));
    if (obs.length) scorecard.observe(userId, obs, { source: `level:${kind}`, trackId });
    // Behavioural footprints in this level's answers (footprints.js: the coach opened first, switch cost on IQ levels).
    footprints.onBlock(userId, { session, level, items: graded });
    return upsertLevelRow(userId, where, {
      kind,
      session_id: session.id,
      accuracy,
      items: graded.length,
      conclusion: conclusionFor({ kind, level, items: graded }),
    });
  });
}

/**
 * What the learner said about a level, from the feedback form: the quick taps
 * (pace, length, difficulty) and whatever they wrote.
 */
function onFeedback(userId, { trackId, gradeId, level, pace, length, difficulty, liked, disliked }) {
  return safely('feedback', () => {
    const said = {
      pace: ['slow', 'right', 'fast'].includes(pace) ? pace : null,
      length: ['short', 'right', 'long'].includes(length) ? length : null,
      difficulty: ['easy', 'right', 'hard'].includes(difficulty) ? difficulty : null,
    };
    // A difficulty tap means something only against how the level went.
    const row = said.difficulty ? levelRow(userId, { trackId, gradeId, level }) : null;
    const accuracy = row && typeof row.accuracy === 'number' ? row.accuracy : undefined;
    const obs = signals.fromFeedback({ ...said, liked, disliked, accuracy });
    if (obs.length) scorecard.observe(userId, obs, { source: 'learner feedback', trackId });
    if (said.pace || said.length || said.difficulty) {
      upsertLevelRow(userId, { trackId, gradeId, level }, { said, said_at: new Date().toISOString() });
    }
    return said;
  });
}

/**
 * A session ended: the patterns only visible across a whole sitting. What a
 * model reads out of each level is done per level, by the after-level read
 * (services/learner-record.js), under its one-point rule.
 */
function onSessionFinished(userId, session, items) {
  safely('session', () => {
    const obs = signals.fromSession(userId, session, items);
    if (obs.length) scorecard.observe(userId, obs, { source: 'session', trackId: session.track_id });
  });
  // Round 9: what they wrote (typed answers of a few words or more, and any tutor chat since the last sweep) and how they use the app.
  if (process.env.SCORECARD_SWEEP !== 'off') {
    onLearnerText(userId, (items || []).filter((i) => i && ['type_in', 'short_answer', 'typed'].includes(i.format) && wordCount(i.user_answer) >= 4)
      .map((i) => ({ text: String(i.user_answer) })), { source: 'typed answers' });
    textSweep(userId);
    usageSweep(userId);
    footprints.weeklySweep(userId);
  }
}

// ── round 9: everything else the learner does and says (indicators.js, docs/SCORECARD-EVERYTHING.md) ──
const indicators = require('./indicators');
const textFeatures = require('./text-features');
const DAY_MS = 86400000;
const wordCount = (t) => String(t || '').split(/\s+/).filter(Boolean).length;

/**
 * What the learner wrote, as deterministic text features (text-features.js), computed here with no model: only the batch means reach the
 * scorecard (scorecards.ind), never the text. `messages`: [{ text, context?, latencyMs? }] (context: the tutor message it answers).
 * Not for an under-13 account without a parent's measurement agreement (owner rule: no extra measurement channels for them), though it
 * reads only what the learner already sent, on this machine. Throws nothing.
 */
function onLearnerText(userId, messages, { source = 'learner text' } = {}) {
  return safely('learner text', () => {
    if (!mayMeasureMore(userId)) return null;
    const list = (messages || []).filter((m) => m && String(m.text || '').trim());
    if (!list.length) return null;
    const obs = indicators.observations(textFeatures.summarize(list));
    return obs.length ? scorecard.observe(userId, obs, { source }) : null;
  });
}

/** Indicator means already aggregated elsewhere ({ 'cap.tabaway': { mean, n }, ... }: the browser's capture, a usage sweep, the sim). */
function onIndicators(userId, batch, { source = 'indicators' } = {}) {
  return safely('indicators', () => {
    const obs = indicators.observations(batch);
    return obs.length ? scorecard.observe(userId, obs, { source }) : null;
  });
}

/**
 * The tutor's own observations of the learner (the hook for services/tutor*.js; documented in docs/SCORECARD-EVERYTHING.md):
 * [{ measure, direction: -1 | 0 | 1, strength: 0-3 }] for measures in indicators.LLM_STATS. Each is one unit of the same llm.<measure>
 * indicator a transcript read feeds, at the same validity. Send a 0 for a measure the tutor looked for and saw nothing of, so a learner who
 * gives no sign is read as typical rather than not at all. Not for an under-13 account without a parent's measurement agreement.
 */
function onTutorObservation(userId, observations) {
  return safely('tutor observation', () => {
    if (!mayMeasureMore(userId)) return null;
    const batch = {};
    for (const o of observations || []) {
      const stat = o && String(o.measure || '');
      if (!indicators.LLM_STATS.includes(stat)) continue;
      const dir = Number(o.direction) > 0 ? 1 : Number(o.direction) < 0 ? -1 : 0;
      const v = dir * Math.max(0, Math.min(3, Math.round(Number(o.strength) || 0)));
      const key = `llm.${stat}`;
      const b = batch[key] || (batch[key] = { s: 0, n: 0 });
      b.s += v;
      b.n += 1;
    }
    const means = Object.fromEntries(Object.entries(batch).map(([k, b]) => [k, { mean: b.s / b.n, n: b.n }]));
    return Object.keys(means).length ? scorecard.observe(userId, indicators.observations(means), { source: 'tutor observation' }) : null;
  });
}

/** Whether new measurement channels may reach this account (services/boosters.js allowed: age screen answered; under the consent age, a parent's agreement). */
function mayMeasureMore(userId) {
  try {
    const user = db.byId('users', userId);
    return !!(user && require('../boosters').allowed(user)); // eslint-disable-line global-require
  } catch { return false; }
}

/** The tutor chat ended (for services/tutor*.js to call): sweep the new messages now instead of after the next sitting. */
function onTutorActivity(userId) {
  return textSweep(userId);
}

/**
 * The learner's tutor-chat messages since the last sweep (tutor_archive), as text features; and, when there is enough new text and the
 * account allows it, a model read of them in the background (transcript-read.js), at most once a day. The cursor is the time of the
 * last exchange swept, kept on the scorecard row with the words not yet read (only while a read may happen; never for an account that
 * may not have one).
 */
function textSweep(userId) {
  return safely('text sweep', () => {
    const row = (db.forUser('tutor_archive', userId)[0] || null);
    const entries = (row && row.entries) || [];
    const card = scorecard.get(userId);
    const cursor = card.text_cursor || '';
    const fresh = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e || !e.learner || !(String(e.at || '') > cursor)) continue;
      const prev = entries[i - 1];
      const gap = prev && prev.at ? Date.parse(e.at) - Date.parse(prev.at) : null;
      fresh.push({ text: e.learner, context: prev ? prev.tutor : null, latencyMs: gap !== null && gap > 0 && gap < 3600000 ? gap : null, at: e.at });
    }
    if (!fresh.length) return null;
    onLearnerText(userId, fresh, { source: 'tutor chat' });
    const transcript = require('./transcript-read'); // eslint-disable-line global-require
    const may = mayMeasureMore(userId) && process.env.SCORECARD_TRANSCRIPT_READ !== 'off';
    const patch = { text_cursor: fresh[fresh.length - 1].at };
    if (may) {
      // The words not yet read are counted, not kept: when a read is due its messages are taken from the archive again (after read_from).
      const words = (card.read_words || 0) + fresh.reduce((a, m) => a + wordCount(m.text), 0);
      const due = !card.read_at || Date.now() - Date.parse(card.read_at) >= transcript.READ_GAP_MS;
      if (due && words >= transcript.MIN_WORDS) {
        const from = card.read_from || '';
        const unread = entries.filter((e) => e && e.learner && String(e.at || '') > from).slice(-60).map((e) => e.learner);
        Object.assign(patch, { read_at: new Date().toISOString(), read_from: patch.text_cursor, read_words: 0 });
        transcript.read(userId, unread).catch(() => {});
      } else patch.read_words = words;
    } else patch.read_words = 0;
    db.update('scorecards', card.id, patch);
    return fresh.length;
  });
}

/** The circular standard deviation of clock hours, in hours (null under three). */
function hourSpread(hours) {
  if (hours.length < 3) return null;
  const a = hours.map((h) => (h / 24) * 2 * Math.PI);
  const c = a.reduce((x, t) => x + Math.cos(t), 0) / a.length;
  const s = a.reduce((x, t) => x + Math.sin(t), 0) / a.length;
  const r = Math.min(1, Math.sqrt(c * c + s * s));
  return (24 / (2 * Math.PI)) * Math.sqrt(-2 * Math.log(Math.max(r, 1e-6)));
}

/**
 * How the app is used, once a week per learner (use.* indicators), read from the learner's own rows: which optional extras are on, own
 * material added, how regular the hour of starting a sitting is, how much they talk to the tutor. `now` for tests.
 */
function usageSweep(userId, { now = Date.now() } = {}) {
  return safely('usage sweep', () => {
    if (!mayMeasureMore(userId)) return null;
    const card = scorecard.get(userId);
    if (card.use_at && now - Date.parse(card.use_at) < 7 * DAY_MS) return null;
    const since = now - 7 * DAY_MS;
    const mine = (s) => s.user_id === userId && s.kind !== 'placement' && !s.preview;
    const sessions = db.find('sessions', (s) => mine(s) && Date.parse(s.started_at || 0) >= since);
    if (!sessions.length) return null;
    const batch = {};
    // Hours are read in the server's zone: regularity is what counts, not the clock.
    const spread = hourSpread(db.find('sessions', (s) => mine(s) && Date.parse(s.started_at || 0) >= now - 14 * DAY_MS)
      .map((s) => new Date(s.started_at).getHours() + new Date(s.started_at).getMinutes() / 60));
    if (spread !== null) batch['use.hour'] = { mean: spread, n: 1 };
    const arch = (db.forUser('tutor_archive', userId)[0] || null);
    const said = ((arch && arch.entries) || []).filter((e) => e && e.learner && Date.parse(e.at || 0) >= since).length;
    batch['use.chat'] = { mean: Math.log(1 + said / sessions.length), n: 1 };
    try {
      const uploads = db.forUser('materials', userId).filter((m) => Date.parse(m.created_at || 0) >= since).length;
      batch['use.uploads'] = { mean: Math.log(1 + uploads), n: 1 };
    } catch { /* no materials table */ }
    try {
      const b = require('../boosters').get(userId); // eslint-disable-line global-require
      const on = [!!b.questionnaire, !!(b.silent && b.silent.on), !!b.max_accuracy, !!b.imports, Object.keys(b.games || {}).length > 0, ((b.delayed && b.delayed.taken) || []).length > 0].filter(Boolean).length;
      batch['use.extras'] = { mean: on, n: 1 };
    } catch { /* no boosters */ }
    const obs = indicators.observations(batch);
    if (obs.length) scorecard.observe(userId, obs, { source: 'how the app is used' });
    db.update('scorecards', scorecard.get(userId).id, { use_at: new Date(now).toISOString() });
    return batch;
  });
}

/**
 * A sitting closed unfinished: routes/learn.js closes the open sitting when
 * the learner opens a different level instead of coming back to it. Its
 * patterns were never read (only a finished sitting goes through
 * onSessionFinished), and a level left partway in it is a quit — the evidence
 * persistence is about. Its end is its last answer, not the moment it was
 * closed, which can be days later. A preview (a look at another level) being
 * closed is not a quit and is not passed here; neither is a sitting closed
 * by a privileged skip or jump.
 */
function onSessionAbandoned(userId, session, items) {
  return safely('abandoned session', () => {
    if (!session || session.preview || session.kind === 'placement' || session.kind === 'skip') return null;
    const answered = (items || []).filter((i) => i.correct !== null && i.correct !== undefined && i.role !== 'retention');
    if (!answered.length) return null;
    const last = Math.max(...answered.map((i) => Date.parse(i.answered_at || i.updated_at || i.created_at || 0) || 0));
    const asLeft = { ...session, ended_at: new Date(last || Date.now()).toISOString() };
    const obs = signals.fromSession(userId, asLeft, items, { abandoned: true });
    if (obs.length) scorecard.observe(userId, obs, { source: 'sitting left unfinished', trackId: session.track_id });
    return obs;
  });
}

/**
 * The days since the learner's last sitting, when this level is the first one closed in its sitting (re-entry: signals.fromReturn), else
 * null. Read before this level's row is written.
 */
function returnGapDays(userId, session, kind) {
  if (!session || session.id === undefined || session.kind === 'placement' || ['lesson', 'block_lesson'].includes(kind)) return null;
  const earlier = db.forUser('level_signals', userId).filter((r) => r.session_id === session.id && r.kind !== 'session');
  if (earlier.length) return null;
  const started = Date.parse(session.started_at || 0);
  if (!started) return null;
  const last = db.find('sessions', (s) => s.user_id === userId && s.id !== session.id && s.ended_at && s.kind !== 'placement'
    && Date.parse(s.ended_at) <= started).reduce((m, s) => Math.max(m, Date.parse(s.ended_at)), 0);
  return last ? (started - last) / 86400000 : null;
}

function onPlacement(userId, { trackId, placedLevel, pathLength }) {
  return safely('placement', () => scorecard.observe(userId, signals.fromPlacement(placedLevel, pathLength),
    { source: 'placement', trackId }));
}

/** The measurement channels (services/boosters*.js): what each gave, as observations through the scorecard's evidence path. Throw if the card is not updated. */
function onQuestionnaire(userId, answers, items) {
  const obs = signals.fromQuestionnaire(answers, items);
  return obs.length ? scorecard.observe(userId, obs, { source: 'questionnaire' }) : null;
}
function onDelayedCheck(userId, tests) {
  const obs = signals.fromDelayedCheck(tests);
  return obs.length ? scorecard.observe(userId, obs, { source: 'delayed check' }) : null;
}
function onGame(userId, stat, score, note) {
  const obs = signals.fromGame(stat, score, note);
  return obs.length ? scorecard.observe(userId, obs, { source: 'brain game' }) : null;
}
function onSilentSignals(userId, summary) {
  const obs = signals.fromSilent(summary);
  return obs.length ? scorecard.observe(userId, obs, { source: 'silent signals' }) : null;
}
function onImportedResults(userId, results, memoryTests) {
  const obs = [...signals.fromImportedResults(results || {}), ...signals.fromDelayedCheck(memoryTests || [])];
  return obs.length ? scorecard.observe(userId, obs, { source: 'imported results' }) : null;
}

/** A pairwise choice ("which is clearer?", services/boosters.js choice): pick 'high' | 'low' | 'same'. Throws if the card is not updated. */
function onChoice(userId, stat, pick, note) {
  const obs = signals.fromChoice(stat, pick, note);
  return obs.length ? scorecard.observe(userId, obs, { source: 'pairwise choice' }) : null;
}

/** The daily check (services/daily-check.js): designed-test observations of the precision a day added. Throws if the card is not updated. */
function onDailyCheck(userId, obs) {
  return obs && obs.length ? scorecard.observe(userId, obs, { source: 'daily check' }) : null;
}

/** The reading check (services/reading-check.js) ended: its measure of language level, as a designed test. Throws if the card is not updated. */
function onReadingCheck(userId, result) {
  const obs = signals.fromReadingCheck(result);
  if (!obs.length) return null;
  return scorecard.observe(userId, obs, { source: 'reading check' });
}

/**
 * The most recent conclusions for one course, oldest first: what the next level's
 * writer is told about how the last few levels went.
 */
function conclusionsFor(userId, { trackId, gradeId, max = 6 } = {}) {
  return db.find('level_signals', (r) => r.user_id === userId && r.conclusion
    && (!trackId || r.track_id === trackId) && (!gradeId || r.grade_id === gradeId))
    .slice(-max)
    .map((r) => {
      const said = r.said || {};
      const bits = [];
      if (said.length && said.length !== 'right') bits.push(`said it was too ${said.length}`);
      if (said.pace && said.pace !== 'right') bits.push(`said the pace was too ${said.pace}`);
      if (said.difficulty && said.difficulty !== 'right') bits.push(`said it was too ${said.difficulty}`);
      return bits.length ? `${r.conclusion} Learner ${bits.join(', ')}.` : r.conclusion;
    });
}

module.exports = {
  onLearnerText,
  onIndicators,
  onTutorObservation,
  onTutorActivity,
  textSweep,
  usageSweep,
  hourSpread,
  onQuestionnaire,
  onDelayedCheck,
  onGame,
  onSilentSignals,
  onImportedResults,
  onReadingCheck,
  onChoice,
  onDailyCheck,
  onAnswer,
  onLessonRead,
  onBaseLessonFinished,
  onBlockResolved,
  onFeedback,
  onSessionFinished,
  onSessionAbandoned,
  onPlacement,
  conclusionsFor,
  conclusionFor,
  creditPendingLesson,
};
