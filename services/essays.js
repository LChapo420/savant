/**
 * The written checkpoint: an English Master or Grand Master is a piece of
 * writing and a rubric, not a quiz.
 *
 * A learner reaches level 25 of English, is asked to write something, is marked
 * against a rubric written for them at that level, and rewrites until it passes.
 * The shape of the problem is the same as a lesson's — per learner, per level,
 * generated ahead of time, stored, never shown twice — so this is deliberately
 * the same file with a different payload: same in-flight map, same bounded wait,
 * same prefetch-and-forget, same strict sanitize.
 *
 * One thing differs, and it is the reason the identity key carries an attempt
 * number. A lesson is written once and reused forever. An essay cannot be: a
 * learner who failed it and is being asked to write again must get a *different*
 * topic, or the rewrite is a copy of the attempt they just failed. That is the
 * same rule the checkpoint quiz already follows when it regenerates its
 * questions, and for the same reason — recognising the writing is not retesting
 * the skill.
 *
 * That changed. Writing is not a quiz: the way a piece of writing improves is by
 * being revised against what held its mark down, and the course sheet says so
 * itself with its "Essay Revision" levels — the same work sat again against
 * feedback. So a rewrite after a mark under 75%, and an Essay Revision level,
 * now carry the same topic and rubric forward with the learner's own last draft
 * and the feedback on it, and the learner fixes that piece (with the tutor, if
 * they want it) and hands it in again. A new attempt is still a new row, so
 * every mark stays in the history. No model is called for a revision: it is
 * the piece they already have.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const { stripTags, toPlainText } = require('./grading');
const ai = require('./ai');
const LAYOUT = require('../config/level-layout');
const actWriting = require('./act-writing');

/** Essays being written right now, so a prefetch and a request do not collide. */
const inFlight = new Map();

/**
 * The highest a draft may run, in characters of markup.
 *
 * Down from 20,000 because this is now HTML rather than plain text: the same
 * writing in tags runs to two or three times its length, and the JSON body has
 * to carry the escaping on top. Twelve thousand characters is several long
 * essays, and the point of the ceiling is to stop one enormous draft in a
 * multiple-choice prompt from being posted.
 */
const MAX_DRAFT_CHARS = 12000;

/**
 * Said, not typed (learner follow-ups 2026-10-24; YOUNG_ORAL, default on, =off
 * goes back to the typed essay).
 *
 * The preschool and Kindergarten sheets ask for two kinds of checkpoint that are
 * spoken, not written: "Explain Aloud" (math: "give an oral or tap-and-say
 * explanation of how you solved one problem") and "Oral Retell" (English and
 * Reading foundations: "one sentence told aloud and written down by an adult").
 * They used to be delivered as an 80-word typed essay marked by a model, which a
 * four-year-old cannot write. Now:
 *   - the sitting's quick check (tap-to-answer questions on the level's skill,
 *     marked by the app) decides the pass, at the essay's pass mark;
 *   - the learner then says it aloud, with an optional recording that stays on
 *     the device (public/js/say-aloud.js: nothing is uploaded or kept), and
 *     taps "I said it";
 *   - a grown-up may confirm they heard it. That is a person's say-so, so the
 *     coverage record takes it as a light, unverified answer (OBJ_ATTEST_W), and
 *     it can never prove an objective on its own.
 * No model is called for these levels.
 */
function youngOral() {
  return String(process.env.YOUNG_ORAL || 'on').toLowerCase() !== 'off';
}

/** 'explain' | 'retell' for a spoken checkpoint level, else null. */
function oralKindFor(grade, level) {
  if (!grade || !youngOral()) return null;
  const entry = LAYOUT.entryFor(grade, level);
  const title = String((entry && entry.title) || '');
  if (/explain aloud/i.test(title)) return 'explain';
  if (/oral retell/i.test(title)) return 'retell';
  return null;
}

/** The spoken checkpoint's brief, from the sheet's own words. */
function buildOral({ grade, level, kind }) {
  const entry = LAYOUT.entryFor(grade, level) || {};
  const span = (/what was taught in (.+?)\.\s*Feedback/i.exec(String(entry.covers || '')) || [])[1] || '';
  const ends = span.split(/\s+through\s+/i);
  const about = !span ? '' : ends.length === 2 ? ` It covers the lessons from ${ends[0]} to ${ends[1]}.` : ` It covers ${span}.`;
  const prompt = kind === 'explain'
    ? 'Pick one of the problems you just did. Tell a grown-up how you solved it, out loud.'
    : 'Tell a grown-up one sentence about what you learned, out loud.';
  const guidance = kind === 'explain'
    ? `Say what you counted or did, step by step. A grown-up can help by asking "How did you know?"${about}`
    : `One sentence is enough. A grown-up can write it down for you if you like.${about}`;
  return { prompt, guidance, criteria: [], source: 'oral', mode: 'oral', oral_kind: kind };
}

/**
 * Which attempt this level is on: one more than the last essay written for it.
 * A rewrite is a new attempt, which is what gets it a different topic.
 */
function attemptFor(userId, enrollment, level) {
  const rows = db.find('essays', (e) => e.user_id === userId
    && e.track_id === enrollment.track_id
    && e.grade_id === enrollment.grade_id
    && e.level === level);
  if (!rows.length) return 1;
  return Math.max(...rows.map((e) => e.attempt || 1)) + 1;
}

function find(userId, enrollment, level, attempt) {
  const n = attempt || 1;
  return db.findOne('essays', (e) => e.user_id === userId
    && e.track_id === enrollment.track_id
    && e.grade_id === enrollment.grade_id
    && e.level === level
    && e.attempt === n) || null;
}

/**
 * Put an essay away, or improve one already there.
 *
 * A written essay always replaces a bank's, including one stored moments earlier
 * by the timeout path — the learner may already be looking at the bank's topic
 * when the better one lands, so it is not swapped underneath them; the improved
 * essay is what the next attempt gets. What it never replaces is a written one,
 * or one that has been graded: there is nothing better to offer, and a learner
 * mid-rewrite must not find the rubric changed under them.
 */
function store(userId, enrollment, level, attempt, payload) {
  const n = attempt || 1;
  const existing = find(userId, enrollment, level, n);
  if (existing) {
    if ((existing.attempts || []).length || existing.cleared_at) return existing;
    // A spoken checkpoint takes over any typed brief stored before it existed.
    if (existing.source === 'oral' || ((existing.source === 'ai' || existing.source === 'revision') && payload.source !== 'oral')) return existing;
    return db.update('essays', existing.id, {
      prompt: payload.prompt,
      guidance: payload.guidance,
      criteria: payload.criteria,
      source: payload.source,
      mode: payload.mode || null,
      oral_kind: payload.oral_kind || null,
    });
  }
  return db.insert('essays', {
    user_id: userId,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    level,
    attempt: n,
    draft: '',
    attempts: [],
    passed: false,
    cleared_at: null,
    session_id: null,
    block: null,
    ...payload,
  });
}

/**
 * The essay written without a model: a real topic and a real rubric assembled
 * from the level's own skills.
 *
 * Not a placeholder. The learner still gets something they can attempt and
 * something they are genuinely marked against — the descriptors are drawn from
 * the skills the level is about rather than invented — it simply does not know
 * this particular learner or react to what they wrote. The grade it produces is
 * the rule-based one below, which says so plainly rather than pretending.
 */
function buildFallback({ grade, level }) {
  const plan = curriculum.levelPlan(grade, level);
  const focus = curriculum.skillName(plan.focus);

  // One criterion on the level's own skill, plus the two that are about the
  // writing rather than any skill. Three, because a rubric of one is not a
  // rubric. Written out rather than generated because they are the same for
  // every learner at this level, and this is what runs when there is no model.
  const onFocus = (title) => ({
    skill_id: plan.focus,
    skill_name: focus,
    name: title,
    introduced: true,
    levels: [
      `${focus} is not really present in the writing, and the sentences around it are hard to follow.`,
      `${focus} appears, but inconsistently, and the reader has to work to recover the meaning.`,
      `${focus} is handled clearly and consistently, with only occasional lapses.`,
      `${focus} is precise and deliberate throughout, and the reader never has to guess.`,
    ],
  });
  const onWriting = (title, weak, strong) => ({
    skill_id: title.skill_id,
    skill_name: title.name,
    name: title.name,
    introduced: false,
    levels: [weak, 'Follows the shape of the writing but not consistently.', 'Clear and mostly well organised.', strong],
  });

  const criteria = grade.trackId === 'math' ? [
    onFocus(`${focus} in the working`),
    onWriting({ skill_id: 'math_reasoning', name: 'Reasoning and justification' },
      'Steps appear without reasons, or the reasoning does not lead to the answer.',
      'Every step follows from the one before, and each one says why.'),
    onWriting({ skill_id: 'math_communication', name: 'Clear mathematical communication' },
      'The working is hard to follow and the answer is not clearly stated.',
      'The working reads in order, uses the right terms and notation, and ends on a clear answer.'),
  ] : [
    onFocus(`${focus} in the writing`),
    onWriting({ skill_id: 'writing_structure', name: 'Structure and shape' },
      'The paragraphs are not in an order a reader can follow.',
      'Each paragraph does one job, in an order that builds the argument.'),
    onWriting({ skill_id: 'writing_clarity', name: 'Clarity of expression' },
      'The reader has to reread to work out what is being said.',
      'Every sentence says exactly what it means the first time.'),
  ];

  return {
    prompt: `This level is about ${focus.toLowerCase()}. Write about something you have a view on where that comes up, and say what you think and why.`,
    guidance: 'Three to five paragraphs. Say what you think, and give a reason for it.',
    criteria,
    source: 'bank',
  };
}

/**
 * The piece a revision carries forward: the learner's previous attempt at this
 * level, or — on an Essay Revision level with nothing written here yet — their
 * latest essay at the draft level before it. Null when there is nothing to revise.
 */
function revisionSource(userId, enrollment, grade, level, attempt) {
  const mine = (e) => e.user_id === userId && e.track_id === enrollment.track_id
    && e.grade_id === enrollment.grade_id && (e.attempts || []).length;
  if (attempt > 1) {
    const prior = db.find('essays', (e) => mine(e) && e.level === level && (e.attempt || 1) < attempt)
      .sort((a, b) => (b.attempt || 1) - (a.attempt || 1))[0];
    if (prior) return prior;
  }
  const entry = LAYOUT.entryFor(grade, level) || {};
  if (!/revision/i.test(String(entry.type || ''))) return null;
  return db.find('essays', (e) => mine(e) && e.level < level)
    .sort((a, b) => b.level - a.level || (b.attempt || 1) - (a.attempt || 1))[0] || null;
}

/** The feedback a revision is written against, from the source's last mark. */
function feedbackFrom(source) {
  const last = (source.attempts || [])[source.attempts.length - 1];
  if (!last) return null;
  return {
    from_level: source.level,
    from_attempt: source.attempt || 1,
    overall: last.overall,
    focus: last.focus || '',
    strengths: last.strengths || [],
    criteria: (last.criteria || []).map((c) => ({
      index: c.index,
      name: ((source.criteria || [])[c.index] || {}).name || `Part ${c.index + 1}`,
      score: c.score,
      next_step: c.next_step || '',
    })),
  };
}

/** The level's shared base topic and rubric, if one has been written. */
function baseEssay(trackId, gradeId, level) {
  return db.findOne('block_plans', (p) => p.user_id === null && p.kind === 'essay'
    && p.track_id === trackId && p.grade_id === gradeId && p.level === level && p.status === 'ready') || null;
}

/** Write the level's shared base topic and rubric, with no learner in the prompt. */
async function writeBase({ trackId, gradeId, level, role = 'blocks' }) {
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  const grade = curriculum.getGrade(trackId, gradeId);
  const track = curriculum.getTrack(trackId);
  const plan = curriculum.levelPlan(grade, level);
  const started = Date.now();
  const payload = await ai.generateEssayPrompt({
    level,
    trackName: track ? track.name : trackId,
    gradeName: grade.name,
    plan: { ...plan, pathLength: grade.pathLength, all: grade.skills },
    userId: null,
    trackId,
    context: blockLevels.levelContext(trackId, gradeId, level).text,
    role,
  });
  const existing = db.findOne('block_plans', (p) => p.user_id === null && p.kind === 'essay'
    && p.track_id === trackId && p.grade_id === gradeId && p.level === level);
  const row = {
    user_id: null, kind: 'essay', track_id: trackId, grade_id: gradeId, level, attempt: 1,
    status: payload ? 'ready' : 'failed',
    reason: payload ? null : 'the model returned no usable topic and rubric',
    prompt: payload ? payload.prompt : null,
    guidance: payload ? payload.guidance : null,
    criteria: payload ? payload.criteria : null,
    seconds: Math.round((Date.now() - started) / 1000),
    finished_at: new Date().toISOString(),
  };
  return existing ? db.update('block_plans', existing.id, row) : db.insert('block_plans', row);
}

async function write({ userId, enrollment, grade, level, attempt, urgent }) {
  const oral = oralKindFor(grade, level);
  if (oral) return store(userId, enrollment, level, attempt, buildOral({ grade, level, kind: oral }));
  const plan = curriculum.levelPlan(grade, level);
  const track = curriculum.getTrack(enrollment.track_id);

  // A rewrite or an Essay Revision level: the same piece, revised.
  const source = revisionSource(userId, enrollment, grade, level, attempt || 1);
  if (source) {
    return store(userId, enrollment, level, attempt, {
      prompt: source.prompt,
      guidance: source.guidance,
      criteria: source.criteria,
      source: 'revision',
      revision_of: source.id,
      revising: feedbackFrom(source),
      draft: source.draft || '',
      plain: source.plain || '',
    });
  }

  // A learner whose levels are not tailored writes to the level's base topic
  // and rubric when one has been written (scripts/generate-base-levels.js).
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  const user = db.byId('users', userId);
  if (!blockLevels.tailorsFor(user)) {
    const base = baseEssay(enrollment.track_id, enrollment.grade_id, level);
    if (base) {
      return store(userId, enrollment, level, attempt, {
        prompt: base.prompt, guidance: base.guidance, criteria: base.criteria, source: 'ai', base_id: base.id,
      });
    }
  }

  let payload = null;
  if (ai.isEnabled()) {
    payload = await ai.generateEssayPrompt({
      level,
      trackName: track ? track.name : enrollment.track_id,
      gradeName: grade.name,
      plan: { ...plan, pathLength: grade.pathLength, all: grade.skills },
      userId,
      urgent,
      trackId: enrollment.track_id,
      // The essay is this learner's own, so its topic is chosen for them.
      learner: blockLevels.learnerText(userId, { trackId: enrollment.track_id, gradeId: enrollment.grade_id, level }, { tailored: true }),
      context: blockLevels.levelContext(enrollment.track_id, enrollment.grade_id, level).text,
    });
  }
  if (!payload) payload = buildFallback({ grade, level });
  return store(userId, enrollment, level, attempt, payload);
}

/** Write it now, reusing one already in flight rather than starting a second. */
function ensure({ userId, enrollment, grade, level, attempt, urgent }) {
  const n = attempt || 1;
  const existing = find(userId, enrollment, level, n);
  if (existing && (existing.source === 'ai' || existing.source === 'revision' || existing.source === 'oral') && !(oralKindFor(grade, level) && existing.source !== 'oral' && !(existing.attempts || []).length)) return Promise.resolve(existing);

  const key = `${userId}:${enrollment.id}:${level}:${n}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const task = write({ userId, enrollment, grade, level, attempt: n, urgent })
    .catch((err) => {
      console.warn(`essays: writing the level ${level} essay failed: ${err.message}`);
      return store(userId, enrollment, level, n, buildFallback({ grade, level }));
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

/** ACT Writing practice is not a path level: its essays rows sit at this level number. */
const ACT_WRITING_LEVEL = 0;

/**
 * Open a timed ACT Writing practice for a learner on the ACT track: the unmarked attempt they already have, or a
 * fresh one with the next prompt. Marking, drafts and the owner check go through the usual /essays/:id routes.
 */
function startActWriting({ userId, enrollment }) {
  const rows = db.find('essays', (e) => e.user_id === userId && e.track_id === enrollment.track_id
    && e.grade_id === enrollment.grade_id && e.level === ACT_WRITING_LEVEL);
  const open = rows.filter((e) => !(e.attempts || []).length).sort((a, b) => b.attempt - a.attempt)[0];
  if (open) return open;
  return store(userId, enrollment, ACT_WRITING_LEVEL, attemptFor(userId, enrollment, ACT_WRITING_LEVEL), actWriting.payloadFor(rows.length + 1));
}

/**
 * Prepare the essay for a level nobody is waiting on yet.
 *
 * Fired from the same two places as a lesson prefetch — starting a session and
 * carrying into a new level — so by the time a learner walks into a written
 * checkpoint the topic and rubric are already in the database. The Graduation
 * exam is not one of these, and `isEssayCheckpoint` is what says so, so nothing
 * here has to know which levels are written.
 */
function prefetch({ userId, enrollment, grade, level }) {
  if (!enrollment || !grade) return;
  if (!curriculum.isEssayCheckpoint(grade, level)) return;
  // Only the first attempt is worth writing ahead: a rewrite gets a new topic,
  // and there is no way to know a learner will need one until they have failed.
  if (find(userId, enrollment, level, 1)) return;
  ensure({ userId, enrollment, grade, level, attempt: 1 }).catch(() => { /* logged in ensure */ });
}

/** How long a learner waits for a written topic before being given the bank one. */
const WRITE_WAIT_MS = Number(process.env.ESSAY_WAIT_MS || 3000);

/**
 * The essay for a level, and whether it was ready in advance.
 *
 * Same bounded wait as a lesson, for the same reason, with one difference in
 * what happens on a timeout: the bank's essay is returned *without* being stored
 * under this attempt. Storing it would burn the attempt number, and the written
 * one still landing a few seconds later would then have nowhere to go — the
 * learner would be marked against a topic nobody chose for them.
 */
async function forLevel({ userId, enrollment, grade, level, attempt }) {
  const n = attempt || 1;
  const oral = oralKindFor(grade, level);
  if (oral) return { essay: store(userId, enrollment, level, n, buildOral({ grade, level, kind: oral })), prepared: true };
  const cached = find(userId, enrollment, level, n);
  if (cached && (cached.source === 'ai' || cached.source === 'revision' || !ai.isEnabled())) {
    return { essay: cached, prepared: true };
  }

  if (revisionSource(userId, enrollment, grade, level, n)) {
    return { essay: await ensure({ userId, enrollment, grade, level, attempt: n, urgent: true }), prepared: true };
  }
  const writing = ensure({ userId, enrollment, grade, level, attempt: n, urgent: true });
  const timeout = new Promise((resolve) => { setTimeout(() => resolve(null), WRITE_WAIT_MS); });
  const winner = await Promise.race([writing, timeout]);
  if (winner) return { essay: winner, prepared: false };

  // Still writing. Store the bank's essay so the learner has something to write
  // against *and* something their draft can be saved to, and let the written one
  // land in the background for the next time round. Storing it under this attempt
  // is safe for the opposite reason to the one that stops a lesson: a lesson is
  // reused, and a bank lesson stored under its level would replace the written
  // one forever, whereas `store` lets a later written one take over.
  return {
    essay: store(userId, enrollment, level, n, buildFallback({ grade, level })),
    prepared: false,
    stillWriting: true,
  };
}

/** The essay attached to a block of a sitting, looked up rather than joined. */
function forSession(userId, sessionId, block) {
  return db.findOne('essays', (e) => e.user_id === userId && e.session_id === sessionId
    && e.block === block) || null;
}

function attach(row, sessionId, block) {
  if (!row) return null;
  return db.update('essays', row.id, { session_id: sessionId, block });
}

/**
 * Keep a draft.
 *
 * The markup is filtered on the way in rather than on the way out, so a stored
 * row is never something that could hurt a page. Everything above this file
 * escapes whatever it renders; this is the one place a learner's own markup is
 * allowed to reach a page, and the filter is what makes that safe.
 *
 * A draft written before the editor was a word processor was plain text, and
 * stays readable: stripping tags out of prose is a no-op.
 */
function saveDraft(essayId, text) {
  const clean = stripTags(text).slice(0, MAX_DRAFT_CHARS);
  return db.update('essays', essayId, {
    draft: clean,
    plain: toPlainText(clean).slice(0, MAX_DRAFT_CHARS),
    saved_at: new Date().toISOString(),
  });
}

/** How long something is, in words. A tag is not a word. */
function wordCount(text) {
  return toPlainText(text).split(/\s+/).filter(Boolean).length;
}

/**
 * A mark made without a model.
 *
 * This is deliberately not a guess. A rule-based grader cannot read prose, and
 * anything it produced here would be a number on someone's writing that no one
 * earned. What it can honestly do is notice that nothing was written, and
 * report that the rubric could not be applied. A learner is never told they
 * failed a piece of writing by something that did not read it.
 */
function ruleGrade(essay, text) {
  const words = wordCount(text);
  return {
    criteria: (essay.criteria || []).map((c, i) => ({
      index: i,
      score: null,
      evidence: null,
      next_step: 'Not marked — the tutor is not connected.',
    })),
    overall: 0,
    strengths: [],
    focus: 'The tutor could not read this one, so it has not been marked. Try again when the tutor is back.',
    words,
    source: 'rules',
  };
}

/**
 * Mark one attempt and record it against the essay.
 *
 * Every attempt is kept rather than overwritten. A learner who rewrites three
 * times should be able to see that their third one is better than their first,
 * and the stored history is what lets the tutor say so.
 */
async function grade(row, text, userId) {
  // The model reads prose, not markup. Marking a submission full of tags would
  // put them in the evidence quotes, and counting words on the raw string would
  // let a page of `<strong>` pass the minimum as though it were an essay.
  const clean = stripTags(text).slice(0, MAX_DRAFT_CHARS);
  const plain = toPlainText(clean);
  const words = wordCount(plain);
  if (words < curriculum.ESSAY_MIN_WORDS) {
    return {
      error: `Write at least ${curriculum.ESSAY_MIN_WORDS} words — you have ${words}.`,
      words,
    };
  }

  const result = await ai.gradeEssay({ essay: row, text: plain, userId });
  const marked = result || ruleGrade(row, plain);
  const passed = marked.overall >= curriculum.ESSAY_PASS_MARK;

  const attempt = {
    at: new Date().toISOString(),
    words,
    overall: marked.overall,
    source: marked.source,
    criteria: marked.criteria,
    strengths: marked.strengths,
    focus: marked.focus,
  };
  const history = [...(row.attempts || []), attempt];
  db.update('essays', row.id, {
    draft: clean,
    plain,
    saved_at: new Date().toISOString(),
    attempts: history,
    passed: !!row.passed || passed,
    cleared_at: row.cleared_at || (passed ? new Date().toISOString() : null),
  });

  return {
    ...marked,
    words,
    passed,
    required: curriculum.ESSAY_PASS_MARK,
    attempt: history.length,
  };
}

/**
 * Hand in a spoken checkpoint (mode 'oral', above).
 *
 * The mark is the sitting's quick check: the tap-to-answer questions of this
 * essay's block, marked by the app, every question asked counting (one left
 * unanswered counts as missed, as on the typed essay). The learner must have
 * said it aloud ("I said it"); nothing they said is sent or kept, so it is not
 * marked. A grown-up's confirmation is stored on the row for the coverage
 * record (services/coverage.js answersFor) as a light, unverified answer.
 */
function oralSubmit(row, { said, parentConfirmed } = {}) {
  if (!row || row.mode !== 'oral') return { error: 'This checkpoint is not a spoken one.' };
  if (said !== true) return { error: 'Say it aloud first, then tap "I said it".' };
  if (!row.session_id) return { error: 'Answer the questions first.' };
  const asked = db.find('items', (i) => i.session_id === row.session_id && (i.block || 0) === (row.block || 0)
    && i.role !== 'retention' && !i.reserved);
  if (!asked.length) return { error: 'Answer the questions first.' };
  const right = asked.filter((i) => i.correct === true).length;
  const overall = right / asked.length;
  const passed = overall >= curriculum.ESSAY_PASS_MARK;
  const grade = curriculum.getGrade(row.track_id, row.grade_id);
  const plan = grade ? curriculum.levelPlan(grade, row.level) : null;
  const now = new Date().toISOString();
  const focus = passed
    ? 'Well done. You answered the questions and said it out loud.'
    : `${right} of ${asked.length} questions right. Have another go at the questions, then say it aloud again.`;
  const attempt = {
    at: now,
    words: 0,
    overall,
    source: 'taps',
    criteria: [],
    strengths: [],
    focus,
    taps: { right, asked: asked.length },
    said: true,
    parent_confirmed: parentConfirmed === true,
  };
  const history = [...(row.attempts || []), attempt];
  const oral = [...(row.oral || []), { at: now, level: row.level, skill: plan ? plan.focus : null, parent_confirmed: parentConfirmed === true }];
  db.update('essays', row.id, {
    attempts: history,
    oral,
    passed: !!row.passed || passed,
    cleared_at: row.cleared_at || (passed ? now : null),
  });
  return { overall, criteria: [], strengths: [], focus, source: 'taps', words: 0, passed, required: curriculum.ESSAY_PASS_MARK, attempt: history.length, taps: attempt.taps };
}

/**
 * What the browser is allowed to see.
 *
 *
 * The rubric is in it, because a learner is meant to read what they are being
 * marked against before they write a word. The last grade is in it too, because
 * the learner is the one being marked and there is nothing to hide from them.
 * What is not in it is every earlier attempt — those are history for the tutor,
 * and a rewrite should not be written while the previous mark is on screen.
 */
function sanitize(essay) {
  if (!essay) return null;
  const attempts = essay.attempts || [];
  const last = attempts.length ? attempts[attempts.length - 1] : null;
  // The draft is stored filtered, so it is safe to hand straight back for the
  // editor to load. `plain` is only a mirror for counting, so a row written
  // before the editor existed is read through the same conversion.
  const draft = essay.draft || '';
  return {
    id: essay.id,
    level: essay.level,
    attempt: essay.attempt,
    prompt: essay.prompt,
    guidance: essay.guidance || '',
    criteria: essay.criteria || [],
    source: essay.source,
    draft,
    words: wordCount(essay.plain || draft),
    saved_at: essay.saved_at || null,
    min_words: essay.mode === 'oral' ? 0 : curriculum.ESSAY_MIN_WORDS,
    // A spoken checkpoint (preschool and Kindergarten): see oralSubmit.
    mode: essay.mode || 'written',
    oral_kind: essay.oral_kind || null,
    required: curriculum.ESSAY_PASS_MARK,
    attempts: attempts.length,
    passed: !!essay.passed,
    // A revision shows the feedback it is being revised against: that is the
    // whole point of revising, unlike a fresh topic.
    revising: essay.revising || null,
    minutes: essay.source === 'act_writing' ? actWriting.MINUTES : null,
    domain_report: essay.source === 'act_writing' && last ? actWriting.domainReport(last) : null,
    // The most recent mark, so a reload after grading shows the result rather
    // than an empty editor.
    result: last ? {
      overall: last.overall,
      source: last.source,
      criteria: last.criteria,
      strengths: last.strengths,
      focus: last.focus,
      words: last.words,
      taps: last.taps || null,
      parent_confirmed: !!last.parent_confirmed,
      passed: !!essay.passed,
    } : null,
  };
}

module.exports = {
  find, attemptFor, ensure, startActWriting, ACT_WRITING_LEVEL, prefetch, forLevel, forSession, attach,
  saveDraft, grade, oralSubmit, oralKindFor, buildOral, sanitize, buildFallback, wordCount, toPlainText, MAX_DRAFT_CHARS, baseEssay, writeBase,
};
