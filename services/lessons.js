/**
 * Lessons: the levels where the product teaches instead of testing.
 *
 * Every tenth level is a lesson, as is the level after each checkpoint (see
 * config/curriculum.js). A lesson is written for one learner — the profile
 * decides its depth, whether rules or examples come first, and what the check
 * questions look like — so it cannot be shared the way generated questions are.
 *
 * That makes generation latency the problem to solve. It is solved by writing
 * the lesson one level early: when a learner starts the level before a lesson,
 * the lesson is written in the background while they work, and by the time they
 * reach it the page is already sitting in the database. The on-demand path
 * still exists for the case where they arrive before it finished, and the bank
 * fallback still exists for the case where there is no model at all.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const gradeSkills = require('../config/grade-skills');
const bank = require('../content/bank');
const pool = require('../content/pool');
const topics = require('../content/topics');
const learner = require('./learner');
const goals = require('./goals');
const ai = require('./ai');
const learningSpec = require('./learning-spec');

/** Lessons being written right now, so a prefetch and a request do not collide. */
const inFlight = new Map();

function find(userId, enrollment, level) {
  return db.findOne('lessons', (l) => l.user_id === userId
    && l.track_id === enrollment.track_id
    && l.grade_id === enrollment.grade_id
    && l.level === level) || null;
}

/**
 * May this stored lesson be served to this account as it is? Always, except
 * that the owner gets the base lesson (config/owner.js ownerBase): a lesson
 * written for the owner before that rule (with their profile in the brief) is
 * written again, and lessons written since carry `base_written`.
 */
function fitFor(userId, row) {
  if (!row) return false;
  // eslint-disable-next-line global-require
  return !!row.base_written || !require('../config/owner').ownerBase(userId);
}

function store(userId, enrollment, level, payload, skillId) {
  // eslint-disable-next-line global-require
  const base = require('../config/owner').ownerBase(userId) ? { base_written: true } : {};
  const existing = find(userId, enrollment, level);
  if (existing) {
    // A better version arrived after a fallback was stored: replace it, unless
    // the learner has already worked through it.
    // While model-written lessons may not be served (aiLessonsAllowed, P10), an
    // unfinished one is replaced by the bank's.
    if (existing.completed_at || (existing.source === 'ai' && fitFor(userId, existing) && (aiLessonsAllowed() || payload.source === 'ai'))) return existing;
    return db.update('lessons', existing.id, { ...payload, skill_id: skillId, source: payload.source, ...base });
  }
  return db.insert('lessons', {
    user_id: userId,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    level,
    skill_id: skillId,
    completed_at: null,
    ...payload,
    ...base,
  });
}

/**
 * The lesson written without a model: real teaching content assembled from the
 * bank rather than a placeholder. It uses the generators' own worked reasoning
 * (every bank item carries a rationale) as the explanation, which is honest
 * material even if it reads more mechanically than the model's version.
 */
/**
 * What this learner has already been asked on this track, as item keys.
 *
 * The lesson's own questions go through this, which is what makes them follow
 * the lesson rather than repeat a question the learner met three levels ago on
 * the same skill.
 */
const LESSON_HISTORY = 400;

function recentItemKeys(userId, { trackId, gradeId }) {
  if (!userId) return new Set();
  return new Set(db.find('items', (i) => i.user_id === userId
    && i.track_id === trackId && i.grade_id === gradeId)
    .slice(-LESSON_HISTORY)
    .map((i) => bank.itemKey(i)));
}

function buildFallback({ userId, enrollment, grade, level, skillId }) {
  const skill = curriculum.skillName(skillId);
  const plan = curriculum.levelPlan(grade, level);
  const difficulty = gradeSkills.capDifficulty(grade, skillId, plan.difficulty);

  // What has this learner already been asked on this track? The fallback's
  // check questions used to be drawn blind, which meant level 10 and level 30 of
  // the same skill could hand out the same question — the lesson had a topic and
  // its questions did not follow it.
  // An enrollment is optional, so the fallback can still be built without one.
  const avoid = enrollment
    ? recentItemKeys(userId, { trackId: enrollment.track_id, gradeId: enrollment.grade_id })
    : new Set();

  // What this level is actually about. A skill spans tens of levels, and a lesson
  // that taught the skill's name five times taught nothing new on the second. The
  // topic is the rule; the skill only says which family of rules it belongs to.
  //
  // The title is `lesson-(topic)` — the topic verbatim, in the creator's words, in
  // the place a learner looks for it. The level it is on is already in the page's
  // breadcrumb and the path behind it, so repeating the number in the title would
  // be the only place a level ever appears twice.
  const trackId = enrollment ? enrollment.track_id : 'math';
  const topic = topics.topicFor(grade, level, skillId, trackId);
  const title = topic ? `lesson-(${topic.topic})` : `lesson-(${skill} at level ${level})`;

  // The teaching comes first, and the questions follow it. Where the topic names
  // a family, the worked example and the first check are drawn from that family
  // alone, so the lesson really is about the rule its title claims. The
  // remaining checks come from the rest of the skill, because a family is one
  // question: three checks all pinned to it are three renderings of the same
  // sentence frame, which is the repetition this whole layer exists to remove.
  // A lesson on a topic, tested on that topic once and then on the material
  // around it, is how a class checks a lesson.
  const pinned = topic && topic.family && typeof topic.family.p === 'function'
    ? pool.fromFamily(topic.family, skillId)
    : null;

  // Every draw carries the grade's school grade, so the bank serves that grade's
  // standard (config/grade-skills.js fitEntry).
  const fit = (d) => gradeSkills.fitEntry(grade, { skillId, difficulty: d });
  const demo = bank.generateMany([fit(Math.max(1, difficulty - 1)), fit(difficulty)], avoid, pinned);

  // The checks avoid everything the learner has already been asked and the
  // examples the lesson just showed — a check is never allowed to be the
  // question whose answer is two sections above it.
  const checkAvoid = new Set([...avoid, ...demo.map((d) => bank.itemKey(d))]);
  const onTopic = bank.generateMany(
    [fit(difficulty)], new Set(avoid), pinned, checkAvoid,
  );
  const rest = bank.generateMany(
    [
      fit(Math.max(1, difficulty - 0.5)),
      fit(Math.min(10, difficulty + 0.5)),
    ],
    new Set([...avoid, ...onTopic.map((d) => bank.itemKey(d))]),
    null,
    new Set([...checkAvoid, ...onTopic.map((d) => bank.itemKey(d))]),
  );
  const checks = [...onTopic, ...rest].map((item) => ({ ...item, role: 'check' }));

  // The lesson is its topic, and it says what the topic covers in the words the
  // creator of the syllabus used. That description is the subtext: a heading
  // called "The Oxford Comma" tells a learner what to look for, and a sentence
  // saying what the comma does tells them what they will be able to do after.
  //
  // The two are separate sections rather than one heading with the coverage under
  // it, because the coverage is what the creator wrote about the topic and the
  // title is a label. A learner scanning the page can find either without the
  // other being in the way.
  //
  // The name of the next topic comes from the grade's own list rather than the
  // skill's: a grade whose lessons state their level interleaves skills, so
  // "the next topic of this skill" is not the lesson that comes next.
  const outline = topics.gradeOutline(grade, trackId);
  const nameAt = (i) => {
    const t = outline[Math.max(0, Math.min(outline.length - 1, i))];
    return { name: t.topic, covers: t.covers || '' };
  };
  const about = topic.covers
    || `This is where ${skill.toLowerCase()} starts on this path.`;
  const sections = [
    { heading: title, body: about },
    {
      heading: 'An example, worked through',
      body: demo[0] ? demo[0].rationale : '',
      example: demo[0] ? `${demo[0].prompt}\nAnswer: ${demo[0].answer}` : '',
    },
    {
      heading: 'One step harder',
      body: demo[1] ? demo[1].rationale : '',
      example: demo[1] ? `${demo[1].prompt}\nAnswer: ${demo[1].answer}` : '',
    },
  ];

  const intro = topic.covers
    ? `This lesson is about ${topic.topic.toLowerCase()}. ${topic.covers} `
      + 'Work through the examples, then answer the questions at the end.'
    : `This lesson is about ${topic.topic.toLowerCase()}. `
      + 'Work through the examples, then answer the questions at the end.';

  // A lesson teaches one topic, and the levels up to the next lesson are its
  // practice. Saying that on the lesson is what makes a path read as a course
  // rather than as a list of levels — and naming the next topic is what makes
  // the sequence readable without opening it.
  const nextName = nameAt(topic.index + 1);
  const closesAt = curriculum.practiceUntil(grade, level);
  const onward = topic.index < topic.of - 1
    ? `This is topic ${topic.index + 1} of ${topic.of} in this subject. `
      + `Levels ${level + 1} to ${closesAt} practise it, and the next lesson is "${nextName.name}".`
    : `This is the last topic in this subject. `
      + `Levels ${level + 1} to ${closesAt} practise it before the next checkpoint.`;

  return {
    title,
    topic: topic.topic,
    covers: topic.covers || null,
    next_topic: topic.index < topic.of - 1 ? nextName.name : null,
    next_lesson_level: closesAt,
    intro,
    sections,
    summary: topic.covers || (demo[0] ? demo[0].rationale : `Practice ${skill.toLowerCase()} one step at a time.`),
    worked_example: demo[1] ? {
      problem: demo[1].prompt,
      steps: [demo[1].rationale],
      answer: demo[1].answer,
    } : null,
    common_mistakes: [],
    onward,
    check_questions: checks,
    source: 'bank',
  };
}

/**
 * What the other lesson writers get (block levels, the level editor), for this
 * one too: the scorecard's lesson lines through the insertion contract
 * (services/scorecard/contract.js forPrompt) and, with ADAPTIVE_TEACHING=on, how
 * this level teaches this learner (services/adaptation.js promptLines). Empty
 * for the owner, who gets the base lesson (config/owner.js ownerBase), and on
 * any failure.
 */
function adaptLines(userId, enrollment, level, spec = null) {
  try {
    /* eslint-disable global-require */
    const contract = require('./scorecard/contract');
    const adaptation = require('./adaptation');
    /* eslint-enable global-require */
    const lines = contract.forPrompt(contract.read(userId, { trackId: enrollment.track_id, gradeId: enrollment.grade_id, memory: false }));
    if (adaptation.mode() === 'on') lines.push(...adaptation.promptLines(adaptation.planForLevel({ userId, enrollment, level })));
    // The learning spec (services/learning-spec.js): every scorecard metric, interests, dislikes and context,
    // as one block. Empty for the owner and for a learner we know nothing about.
    if (spec) lines.push(...learningSpec.specToLines(spec, { surface: 'lesson' }));
    return lines;
  } catch (err) {
    console.warn(`lessons: adaptation lines failed: ${err.message}`);
    return [];
  }
}

async function write({ userId, enrollment, grade, level, urgent }) {
  const plan = curriculum.levelPlan(grade, level);
  const skillId = plan.focus;
  const profile = learner.getProfile(userId);
  const params = learner.sessionParams(profile, { goal: goals.forEnrollment(enrollment) });
  const track = curriculum.getTrack(enrollment.track_id);

  // The same topic the bank fallback would teach. Both paths teach the same
  // thing: a level is a topic in a sequence, not a skill name, and a learner who
  // gets the model-written version of level 20 should be taught the same rule as
  // one who gets the bank version.
  const topic = topics.topicFor(grade, level, skillId, enrollment.track_id);
  // The neighbours in the sequence, so the writer knows what this topic sits
  // between rather than treating it as a standalone topic.
  const skillTopics = topics.topicsFor(grade, enrollment.track_id, skillId);

  // What this learner has already been taught on this track, so the next lesson
  // builds on it instead of repeating it.
  const taught = db.find('lessons', (l) => l.user_id === userId
    && l.track_id === enrollment.track_id
    && l.grade_id === enrollment.grade_id
    && l.level < level)
    .sort((a, b) => a.level - b.level)
    .slice(-4)
    .map((l) => ({ level: l.level, title: l.title, summary: String(l.summary || '').slice(0, 200) }));

  // How this learner is taught (services/learning-spec.js), for this topic and its skill's mastery.
  const spec = learningSpec.buildSpec(userId, { skillIds: [skillId], topic: topic ? topic.topic : null, trackId: enrollment.track_id, gradeId: enrollment.grade_id });
  let payload = null;
  if (aiLessonsAllowed()) {
    payload = await ai.generateLesson({
      skillId,
      difficulty: plan.difficulty,
      level,
      trackName: track ? track.name : enrollment.track_id,
      gradeName: grade.name,
      topic: topic ? topic.topic : null,
      topicPosition: topic ? `${topic.index + 1} of ${topic.of}` : null,
      topicBefore: topic && topic.index > 0 ? skillTopics[topic.index - 1] : null,
      topicAfter: topic && topic.index < topic.of - 1 ? skillTopics[topic.index + 1] : null,
      profile,
      params,
      taught,
      urgent,
      userId,
      extraLines: [...adaptLines(userId, enrollment, level, spec), ...goals.promptLines(userId, enrollment.track_id, enrollment.grade_id)],
      spec,
      keyFacts: topic && topic.covers ? [topic.covers] : [],
    });
  }
  if (!payload) payload = buildFallback({ userId, enrollment, grade, level, skillId });
  else if (!spec.isDefault) payload.spec_hash = learningSpec.specHash(spec); // so a later change to the spec can be told from a stale page
  return store(userId, enrollment, level, payload, skillId);
}

/**
 * May a model-written lesson be served? Not while no verifier key is set and the
 * self-check is on (LEVEL_SELF_CHECK, evidence article 01 P10; services/block-levels.js
 * selfCheckOn): a lesson written here has no claim-by-claim read behind it, so
 * the learner is taught from the bank's lesson instead, and nothing is written.
 * LEVEL_SELF_CHECK=off restores model-written lessons without a key.
 */
function aiLessonsAllowed() {
  if (!ai.isEnabled()) return false;
  try {
    // eslint-disable-next-line global-require
    return !require('./block-levels').selfCheckOn();
  } catch {
    return false;
  }
}

/** A stored lesson that may be served as it is: model-written only while those are allowed. */
function servableLesson(userId, lesson) {
  return !!(lesson && fitFor(userId, lesson) && (aiLessonsAllowed() ? lesson.source === 'ai' : lesson.source !== 'ai'));
}

/** Write the lesson now, reusing one already in flight rather than starting a second. */
function ensure({ userId, enrollment, grade, level, urgent }) {
  const existing = find(userId, enrollment, level);
  if (servableLesson(userId, existing)) return Promise.resolve(existing);

  const key = `${userId}:${enrollment.id}:${level}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const task = write({ userId, enrollment, grade, level, urgent })
    .catch((err) => {
      console.warn(`lessons: writing level ${level} failed: ${err.message}`);
      return store(userId, enrollment, level, buildFallback({ userId, enrollment, grade, level, skillId: curriculum.levelPlan(grade, level).focus }), curriculum.levelPlan(grade, level).focus);
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

/**
 * Called when a learner starts working at `level`: if the next lesson is close,
 * start writing it now. Nobody waits on this.
 */
/**
 * Prepare the lesson for one specific level, now, in the background. Used the
 * moment a learner is placed: they are reading their placement result, which is
 * exactly the cover needed to write their first lesson before they open it.
 */
function prefetch({ userId, enrollment, grade, level }) {
  if (!enrollment || !grade) return;
  if (curriculum.levelKind(level, grade.pathLength, grade) !== 'lesson') return;
  const existing = find(userId, enrollment, level);
  if (existing && existing.source === 'ai' && fitFor(userId, existing)) return;
  ensure({ userId, enrollment, grade, level }).catch(() => { /* logged in ensure */ });
}

function prefetchNext({ userId, enrollment, grade, level }) {
  if (!enrollment || !grade) return;
  const target = curriculum.nextLessonLevel(grade, level + 1);
  if (!target) return;
  // Only prepare the lesson that is genuinely next, not every lesson ahead.
  if (target > level + curriculum.LESSON_EVERY) return;
  const existing = find(userId, enrollment, target);
  if (existing && existing.source === 'ai' && fitFor(userId, existing)) return;
  ensure({ userId, enrollment, grade, level: target })
    .catch(() => { /* logged in ensure */ });
}

/** How long a learner will wait for a lesson before being given the bank's
 *  version instead. The written one keeps going and replaces it for next time. */
const WRITE_WAIT_MS = Number(process.env.LESSON_WAIT_MS || 2500);

/**
 * The lesson for a level, and whether it was ready in advance.
 *
 * Prefetching covers the normal case, but not a learner's very first lesson
 * straight after placement, and not a model having a slow minute. So the wait
 * is bounded: past it, the bank's lesson opens immediately and the written one
 * lands in the background for next time. Nobody watches a spinner for a page of
 * text that already exists in another form.
 */
async function forLevel({ userId, enrollment, grade, level }) {
  const cached = find(userId, enrollment, level);
  if (servableLesson(userId, cached)) {
    return { lesson: cached, prepared: true };
  }
  // No model-written lesson may be served (aiLessonsAllowed): the bank's, stored now.
  if (!aiLessonsAllowed()) {
    return { lesson: await ensure({ userId, enrollment, grade, level, urgent: true }), prepared: true };
  }

  const writing = ensure({ userId, enrollment, grade, level, urgent: true });
  const timeout = new Promise((resolve) => { setTimeout(() => resolve(null), WRITE_WAIT_MS); });
  const winner = await Promise.race([writing, timeout]);
  if (winner) return { lesson: winner, prepared: false };

  // Still being written. Serve the bank's lesson now; `ensure` will store the
  // written one when it finishes, and `store` keeps it unless this one has
  // already been completed.
  // It is stored, so the sitting keeps it (lesson_id): unstored, a reopened
  // sitting found no lesson and showed the checks alone, with no teaching
  // (math numbers_to_20 level 10, 2026-10-25). The written one replaces it
  // when it lands, unless the learner has finished it by then.
  return { lesson: storedFallback({ userId, enrollment, grade, level }), prepared: false, stillWriting: true };
}

/** The bank's lesson for a level (with its worked example), stored for this learner. */
function storedFallback({ userId, enrollment, grade, level }) {
  const skillId = curriculum.levelPlan(grade, level).focus;
  return store(userId, enrollment, level, buildFallback({ userId, enrollment, grade, level, skillId }), skillId);
}

/**
 * The lesson a sitting opened on a lesson level teaches. A sitting whose lesson
 * was never stored (lesson_id null) is given the level's stored lesson, when it
 * may be served to this learner, or else the bank's, stored now; so a lesson
 * level never comes back as its checks alone.
 */
function forSitting(session) {
  if (!session) return null;
  if (session.lesson_id) {
    const row = db.byId('lessons', session.lesson_id);
    if (row) return row;
  }
  const first = (session.blocks || [])[0];
  if (!first || first.kind !== 'lesson' || !session.enrollment_id) return null;
  const enrollment = db.byId('enrollments', session.enrollment_id);
  const grade = enrollment && curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!enrollment || !grade) return null;
  const level = first.level || session.start_level || session.level;
  const existing = find(session.user_id, enrollment, level);
  const lesson = existing && fitFor(session.user_id, existing) && (existing.sections || []).length
    ? existing
    : storedFallback({ userId: session.user_id, enrollment, grade, level });
  if (lesson && lesson.id) db.update('sessions', session.id, { lesson_id: lesson.id });
  return lesson;
}

function markComplete(lessonId) {
  return db.update('lessons', lessonId, { completed_at: new Date().toISOString() });
}

/** What the browser is allowed to see: everything except the check answers. */
function sanitize(lesson) {
  if (!lesson) return null;
  return {
    id: lesson.id,
    level: lesson.level,
    skill_id: lesson.skill_id,
    skill_name: curriculum.skillName(lesson.skill_id),
    title: lesson.title,
    topic: lesson.topic || null,
    // What the topic covers, in the creator's words. This is the lesson's
    // subtext: a heading says what to look for and this says what it does.
    covers: lesson.covers || null,
    // The topic after this one and the level its lesson lands on, so a reader
    // can see the sequence without opening every lesson in it.
    next_topic: lesson.next_topic || null,
    next_lesson_level: lesson.next_lesson_level || null,
    onward: lesson.onward || null,
    intro: lesson.intro,
    sections: lesson.sections || [],
    worked_example: lesson.worked_example || null,
    common_mistakes: lesson.common_mistakes || [],
    summary: lesson.summary,
    source: lesson.source,
    // A shared base lesson is labelled as the course's lesson, not "written for you".
    base_written: !!lesson.base_written,
    completed_at: lesson.completed_at || null,
  };
}

module.exports = {
  adaptLines,
  fitFor, find, ensure, prefetch, prefetchNext, forLevel, markComplete, sanitize, buildFallback, storedFallback, forSitting };
