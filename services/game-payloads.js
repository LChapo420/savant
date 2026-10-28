/**
 * The questions for a game level: written once, validated, kept, injected.
 *
 * Two kinds of payload live here. The shared one is written once per level and
 * read by everyone it is not tailored for. A tailored one is written per
 * learner, in the two calls every block level uses: a small LAYOUT call that
 * plans the question set from their profile (which skills get the most
 * questions, what styles of question, which interest to theme it on, how the
 * difficulty climbs within the engine's range), then the FILL call — the
 * creator's own game prompt below, with the learner and that plan added.
 * Both go to the `blocks` role: GLM 5.3 Flash, backed by MiMo V2.6 Pro.
 *
 * One level's game needs one payload — the questions, their answer keys, the
 * explanations and the game's feedback lines — and this is the only place that
 * makes one. It is cached the moment it is good, so the model is asked once per
 * level rather than once per learner, and every later visit is a database read.
 *
 * The payload is never shown to anybody raw: `inject()` bakes it into the engine
 * template at the marker, with the escaping that keeps a question from breaking
 * out of the script it is written into.
 */
const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const assignments = require('../config/game-assignments');
const gamePrompt = require('../scripts/lib/game-prompt');
const ai = require('./ai');
const providers = require('./providers');
const { lengthCue, repairChoices } = require('./subject-placement');

const ROOT = path.join(__dirname, '..');
const ENGINES_DIR = path.join(ROOT, 'public', 'games', 'engines');
const SCHEMAS_DIR = path.join(ROOT, 'public', 'games', 'schemas');
const COLLECTION = 'game_payloads';

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;
const MARKER = '/* __DATA_INJECTION__ */';

/**
 * Serving holds (owner, 2026-10-24; curriculum-build/LIVE-CHANGES-2026-10-24.md). A
 * held level's shared game is kept in the store but never served, never written
 * again on a visit, and never answered: the level opens as an ordinary session
 * instead (accessFor is false). A level is held when its shared row has
 * `serving_hold` set, or when content/game-holds.json lists it (so a fresh store
 * that imports the shipped sets holds them too), unless the row carries
 * `verified_replacement`: a set written, code-checked and kept by two blind judges,
 * swapped in by the apply step. The 70 English Proficient sets the 2026-10-23 fact
 * audit found wrong are listed. GAME_HOLDS=off serves held levels again.
 */
const HOLDS_FILE = path.join(ROOT, 'content', 'game-holds.json');
let holdList = null;
function holdKeys() {
  if (!holdList) {
    holdList = new Set();
    try {
      for (const h of JSON.parse(fs.readFileSync(HOLDS_FILE, 'utf8')).holds || []) holdList.add(`${h.track_id}|${h.grade_id}|${h.level}`);
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`game-payloads: could not read ${HOLDS_FILE}: ${err.message}`);
    }
  }
  return holdList;
}

function holdsOn() {
  return String(process.env.GAME_HOLDS || 'on').toLowerCase() !== 'off';
}

function heldRow(row) {
  if (!row || row.user_id || !holdsOn() || row.verified_replacement) return false;
  return !!row.serving_hold || holdKeys().has(`${row.track_id}|${row.grade_id}|${row.level}`);
}

/** Is this level's shared game held from serving? */
function held(trackId, gradeId, level) {
  if (!holdsOn()) return false;
  const row = db.findOne(COLLECTION, (r) => !r.user_id && r.track_id === trackId
    && r.grade_id === gradeId && r.level === level);
  if (row) return heldRow(row);
  return holdKeys().has(`${trackId}|${gradeId}|${level}`);
}

/** The engine template, or null when the file is not there. */
function engineHtml(engineId) {
  if (!SAFE_ID.test(String(engineId || ''))) return null;
  try {
    return fs.readFileSync(path.join(ENGINES_DIR, `${engineId}.html`), 'utf8');
  } catch {
    return null;
  }
}

/** The engine's question schema — what the prompt asks for and what is checked. */
function schemaFor(engineId) {
  if (!SAFE_ID.test(String(engineId || ''))) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, `${engineId}.question-schema.json`), 'utf8'));
  } catch {
    return null;
  }
}

/** The output contract of the question call: the game's own shape, nothing more. */
function outputSchema(schema) {
  const choiceCount = schema.choicesPerQuestion || 4;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'questions', 'feedback'],
    properties: {
      title: { type: 'string', description: 'A short title for this game sitting, on the level\'s topic.' },
      questions: {
        type: 'array',
        description: `Exactly ${schema.questionCount} questions, in play order.`,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'prompt', 'choices', 'answerIndex', 'explanation', 'difficulty', 'skill', 'topic'],
          properties: {
            id: { type: 'string' },
            prompt: { type: 'string' },
            choices: {
              type: 'array',
              items: { type: 'string' },
              description: `Exactly ${choiceCount} options, one of them the answer.`,
            },
            answerIndex: { type: 'integer', minimum: 0, maximum: choiceCount - 1 },
            explanation: { type: 'string', description: 'One sentence: why the answer is the answer.' },
            difficulty: { type: 'integer', minimum: 1, maximum: 10 },
            skill: { type: 'string' },
            topic: { type: 'string' },
          },
        },
      },
      feedback: {
        type: 'object',
        additionalProperties: false,
        required: ['correct', 'incorrect', 'win', 'lose'],
        properties: {
          correct: { type: 'string' },
          incorrect: { type: 'string' },
          win: { type: 'string' },
          lose: { type: 'string' },
        },
      },
    },
  };
}

/**
 * Check a reply before it is trusted with a level.
 *
 * A wrong question is worse than no question: the game plays it as fact. So the
 * counts, the keys, the shapes and the giveaway tells (the placement work's own
 * `lengthCue`) are all checked here, and a reply that fails is asked for again
 * once before the level is left without a game.
 */
function inspectPayload(reply, schema) {
  const problems = [];
  if (!reply || !Array.isArray(reply.questions)) return ['no questions in the reply'];
  const want = schema.questionCount;
  const choices = schema.choicesPerQuestion || 4;

  // What ships is the first `want` questions — the envelope trims any surplus —
  // so a reply that wrote one question too many is not a faulty reply. Too few
  // is: the level would come up short.
  if (reply.questions.length < want) problems.push(`${reply.questions.length} questions, expected ${want}`);
  const seen = new Set();
  const slots = {};
  reply.questions.slice(0, want).forEach((q, i) => {
    const n = `q${i + 1}`;
    if (!q || typeof q.prompt !== 'string' || !q.prompt.trim()) problems.push(`${n}: no prompt`);
    if (!q || typeof q.explanation !== 'string' || !q.explanation.trim()) problems.push(`${n}: no explanation`);
    const opts = Array.isArray(q && q.choices) ? q.choices.map((c) => String(c == null ? '' : c).trim()).filter(Boolean) : [];
    if (opts.length !== choices) problems.push(`${n}: ${opts.length} choices, expected ${choices}`);
    // The same option twice: a learner who taps the copy of the key is marked wrong.
    // The 2026-10-23 audit found this in 15 stored game questions.
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) problems.push(`${n}: two choices are the same`);
    const answer = Number(q && q.answerIndex);
    if (!Number.isInteger(answer) || answer < 0 || answer >= opts.length) problems.push(`${n}: answerIndex ${q && q.answerIndex} is out of range`);
    if (opts.length && seen.has(opts[answer])) problems.push(`${n}: the same option text is the answer twice`);
    seen.add(opts[answer]);
    const prompt = String((q && q.prompt) || '');
    if (/[<>]/.test(prompt) || opts.some((o) => /[<>]/.test(o))) problems.push(`${n}: markup in the text`);
    const d = Number(q && q.difficulty);
    if (!Number.isInteger(d) || d < 1 || d > 10) problems.push(`${n}: difficulty ${q && q.difficulty} is out of range`);
    if (opts.length && answer >= 0 && answer < opts.length && lengthCue(opts, opts[answer])) {
      problems.push(`${n}: the answer is identifiable by its length`);
    }
    if (answer >= 0) slots[answer] = (slots[answer] || 0) + 1;
  });
  const answered = Object.values(slots).reduce((a, b) => a + b, 0);
  const busiest = Math.max(0, ...Object.values(slots));
  if (answered >= 6 && busiest / answered > 0.75) {
    problems.push(`the answer sits in one slot ${Math.round((busiest / answered) * 100)}% of the time`);
  }
  return problems.slice(0, 20);
}

/**
 * Put a question set in an order that is random but even in difficulty.
 *
 * The page's cursor plays the set in order, across plays, so any run of
 * questions should span the set's whole difficulty range rather than clumping
 * — ten easy ones then ten hard ones would make one sitting trivial and the
 * next a wall. The questions are grouped by difficulty, each group shuffled,
 * and the groups dealt out in proportion, so every stretch of the set mixes
 * them the way the whole set does. Seeded, so the order is stable for a level.
 */
function evenOrder(questions, seed = 'order') {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const groups = new Map();
  for (const q of questions) {
    const d = Number(q.difficulty) || 5;
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(q);
  }
  for (const list of groups.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  // Deal by "most behind its fair share" so each group is spread evenly through the set.
  const total = questions.length;
  const dealt = new Map([...groups.keys()].map((k) => [k, 0]));
  const out = [];
  for (let n = 1; n <= total; n++) {
    let pick = null;
    let worst = -Infinity;
    for (const [d, list] of groups) {
      if (dealt.get(d) >= list.length) continue;
      const lag = (list.length * n) / total - dealt.get(d) + rand() * 0.01;
      if (lag > worst) { worst = lag; pick = d; }
    }
    out.push(groups.get(pick)[dealt.get(pick)]);
    dealt.set(pick, dealt.get(pick) + 1);
  }
  return out;
}

/**
 * A reply as the model meant it. Some models send nested lists and objects as
 * JSON strings inside a tool call; those are read as what they are rather than
 * reported as "no questions".
 */
function normalizeReply(reply) {
  if (!reply || typeof reply !== 'object') return reply;
  const parse = (v) => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  };
  const out = { ...reply, questions: parse(reply.questions), feedback: parse(reply.feedback) };
  if (Array.isArray(out.questions)) {
    out.questions = out.questions.map((q) => (q && typeof q === 'object' ? { ...q, choices: parse(q.choices) } : parse(q)));
  }
  if (out.mix !== undefined) out.mix = parse(out.mix);
  if (out.notes !== undefined) out.notes = parse(out.notes);
  return out;
}

/** The envelope the engine is handed: settings from the schema, content from the model. */
function envelope(trackId, gradeId, level, schema, reply, model) {
  const track = curriculum.getTrack(trackId);
  const grade = curriculum.getGrade(trackId, gradeId);
  const entry = LAYOUT.entryFor(grade, level) || {};
  const d = schema.difficultyScale || {};
  return {
    schemaVersion: 1,
    engineId: schema.engineId,
    meta: {
      subject: track ? track.name : trackId,
      grade: grade.name,
      level,
      topic: entry.title || reply.title || '',
      title: reply.title || entry.title || '',
      ageRange: gamePrompt.buildGamePrompt(trackId, gradeId, level, schema).context.age.text,
    },
    settings: {
      questionCount: schema.questionCount,
      choicesPerTurn: schema.choicesPerQuestion || 4,
      difficulty: { start: d.start || 5, end: d.end || 8, curve: d.curve || 'flat' },
      timeLimitSec: null,
    },
    questions: evenOrder(reply.questions.slice(0, schema.questionCount), `${trackId}:${gradeId}:${level}`).map((q, i) => ({
      id: String(q.id || `q${i + 1}`),
      prompt: String(q.prompt),
      choices: q.choices.map((c) => String(c)),
      answerIndex: Number(q.answerIndex),
      explanation: String(q.explanation),
      difficulty: Number(q.difficulty),
      skill: String(q.skill || ''),
      topic: String(q.topic || ''),
    })),
    feedback: {
      correct: String(reply.feedback.correct),
      incorrect: String(reply.feedback.incorrect),
      win: String(reply.feedback.win),
      lose: String(reply.feedback.lose),
      draw: String(reply.feedback.draw || 'Draw game.'),
      outOfQuestions: String(reply.feedback.outOfQuestions || 'Out of questions.'),
    },
  };
}

/** The explanation-key gate's rejections, as inspectPayload-style problems ("qN: ..."). */
async function keyGateProblems(reply) {
  // eslint-disable-next-line global-require
  const keyGate = require('./key-gate');
  if (!keyGate.on() || !reply || !Array.isArray(reply.questions)) return [];
  const rejected = await keyGate.rejectedByKeyGate(reply.questions.map((q) => ({
    prompt: String(q.prompt || ''), choices: (q.choices || []).map(String), answerIndex: Number(q.answerIndex), explanation: String(q.explanation || ''),
  })));
  return rejected.map((r) => `q${r.index + 1}: ${r.reason}`);
}

/** Whether every problem is one question's own, and there are few of them. */
function patchable(problems) {
  if (!problems.length || !problems.every((p) => /^q\d+:/.test(p))) return false;
  const bad = new Set(problems.map((p) => p.match(/^q(\d+):/)[1]));
  return bad.size <= 15;
}

/**
 * Rewrite only the questions that failed the checks, in one small call: the
 * level's own prompt, the questions the set already has (so nothing repeats),
 * and the count to write. The new ones take the bad ones' places.
 */
async function patchQuestions(reply, schema, problems, prompt, userId) {
  const bad = [...new Set(problems.map((p) => Number(p.match(/^q(\d+):/)[1]) - 1))]
    .filter((i) => i >= 0 && i < reply.questions.length);
  if (!bad.length) return reply;
  const keep = reply.questions.filter((_, i) => !bad.includes(i));
  const got = await ai.structuredDetail({
    role: 'blocks',
    task: 'game_questions',
    system: prompt.system,
    user: `${prompt.user}

THE SET ALREADY HAS THESE QUESTIONS — do not repeat any of them, their facts, or their answers:
${keep.map((q) => `- ${String(q.prompt).slice(0, 160)} (answer: ${String((q.choices || [])[q.answerIndex] || '').slice(0, 80)})`).join('\n').slice(0, 9000)}

Write exactly ${bad.length} NEW questions in the same shape. Every wrong option is as long and as specific as the right one, and no answer repeats any answer above.`,
    schema: outputSchema({ ...schema, questionCount: bad.length }),
    schemaName: 'submit_game_questions',
    maxTokens: 16000,
    userId,
    lane: process.env.BLOCK_LANE || 'background',
  });
  const fresh = normalizeReply(got && got.data);
  if (!fresh || !Array.isArray(fresh.questions) || !fresh.questions.length) return reply;
  const out = { ...reply, questions: reply.questions.slice() };
  bad.forEach((slot, k) => {
    const q = fresh.questions[k];
    if (q && typeof q === 'object') out.questions[slot] = { ...q, id: (reply.questions[slot] && reply.questions[slot].id) || q.id };
  });
  return out;
}

/** Bake the payload into the engine at the marker. */
function inject(engine, payload) {
  const html = engineHtml(engine);
  if (!html) return null;
  if (!html.includes(MARKER)) return null;
  // `<` is escaped so a question can never close the script it is written into.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  // A function, not the string: a string replacement reads `$'`, `$&` and `` $` ``
  // inside the questions as patterns and pastes the engine's own markup into the
  // data (security review 2026-10-24, finding 8).
  return html.replace(MARKER, () => json);
}

/**
 * Rewrite the wrong options of any question whose options give the answer away.
 *
 * The question and its answer survive word for word — only the wrong options are
 * rewritten, and only by a repair that passes the same check that flagged it.
 * Refusing a whole level's questions over one giveaway option would throw away
 * eleven good ones.
 */
async function repairPayload(reply, schema, userId) {
  if (!reply || !Array.isArray(reply.questions)) return reply;
  const fixable = [];
  reply.questions.forEach((q, i) => {
    const opts = (q.choices || []).map((c) => String(c));
    const answer = opts[Number(q.answerIndex)];
    if (opts.length && answer && lengthCue(opts, answer)) {
      fixable.push({
        n: fixable.length,
        at: i,
        grade_id: 'game',
        topic: q.topic,
        prompt: q.prompt,
        answer,
        choices: opts,
      });
    }
  });
  if (!fixable.length) return reply;
  // Game questions are written on the blocks route, so they are repaired on it too.
  const fixed = await repairChoices(fixable, userId, 'blocks');
  for (const item of fixable) {
    const choices = fixed.get(item.n);
    if (choices && choices.length === (schema.choicesPerQuestion || 4)) {
      reply.questions[item.at].choices = choices;
    }
  }
  return reply;
}

/**
 * The payload for a level's game: the cached one, or a fresh one written now.
 *
 * @returns {Promise<{payload: object, fresh: boolean}|null>} null when the level
 * is not a game, or when the engine or its schema is missing.
 */
async function ensure(userId, trackId, gradeId, level, opts = {}) {
  const assignment = assignments.resolve(trackId, gradeId, level);
  if (!assignment) return null;
  // A held level is neither served nor written again (see holdsOn).
  if (held(trackId, gradeId, level)) return null;
  // A bank game (BANK_GAMES; services/game-bank.js): computed from the verified
  // bank, the same base set for everyone (the owner included), never written by a
  // model, never tailored and never stored.
  if (assignment.source === 'bank') {
    const computed = gameBank().payloadFor(trackId, gradeId, level);
    if (!computed || !engineHtml(assignment.engineId)) return null;
    return { payload: { ...computed, settings: { ...computed.settings, ...(assignment.overrides || {}) } }, fresh: false, bank: true };
  }
  const schema = schemaFor(assignment.engineId);
  const engine = engineHtml(assignment.engineId);
  if (!schema || !engine) return null;

  if (opts.tailored && userId) {
    const mine = await ensureTailored(userId, trackId, gradeId, level, assignment, schema);
    if (mine) return mine;
    // A tailored set that could not be written falls back to the level's shared one.
  }

  const stored = db.findOne(COLLECTION, (r) => !r.user_id && r.engine_id === assignment.engineId
    && r.track_id === trackId && r.grade_id === gradeId && r.level === level);
  // A clean payload is one whose problems list is empty, and an empty list is
  // truthy: `!stored.problems` was false for exactly the rows worth keeping, so
  // every visit fell through to writing the questions again and the level hung
  // on "Loading the lesson" while a model call that had already been answered
  // ran a second time. The cache is keyed on the list being empty, not present.
  if (stored && stored.payload && !(stored.problems || []).length) {
    return { payload: { ...stored.payload, settings: { ...stored.payload.settings, ...(assignment.overrides || {}) } }, fresh: false };
  }

  // A stored payload whose only fault is a giveaway option is repaired in place
  // rather than written again: the eleven good questions are kept and the one bad
  // option is rewritten.
  if (stored && stored.payload && (stored.problems || []).length
    && stored.problems.every((p) => /identifiable by its length/.test(p))) {
    const candidate = JSON.parse(JSON.stringify(stored.payload));
    await repairPayload(candidate, schema, userId);
    const clean = inspectPayload(candidate, schema);
    if (!clean.length) {
      const writer = providers.current('blocks');
      db.update(COLLECTION, stored.id, {
        payload: candidate,
        problems: [],
        model: writer ? `${writer.name} / ${writer.modelFor('blocks')}` : stored.model,
      });
      return { payload: { ...candidate, settings: { ...candidate.settings, ...(assignment.overrides || {}) } }, fresh: false };
    }
  }

  const prompt = gamePrompt.buildGamePrompt(trackId, gradeId, level, schema);
  const taught = taughtFor(trackId, gradeId, level);
  if (taught) prompt.user = `${prompt.user}\n\n${taught}`;
  let reply = null;
  let problems = ['no reply'];
  for (let attempt = 0; attempt < 2 && problems.length; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    reply = await ai.structured({
      role: 'blocks',
      task: 'game_questions',
      system: prompt.system,
      user: prompt.user,
      schema: outputSchema(schema),
      schemaName: 'submit_game_questions',
      // Room for the thinking as well as the questions: a 50-question reply cut
      // off near the token cap comes back short or crowded — the count wrong
      // and the answers piled into one slot — which is a starved reply, not a
      // careless one.
      maxTokens: Math.min(60000, 6000 + schema.questionCount * 440),
      userId,
      lane: process.env.BLOCK_LANE || 'background',
    });
    reply = normalizeReply(reply);
    problems = inspectPayload(reply, schema);
    // A handful of bad questions in a good set are rewritten on their own,
    // rather than the whole set being written again.
    // Up to three rounds of fixing only what is wrong, before the whole set is
    // written again: length giveaways first (rewriting a question's choices is
    // the cheapest fix), then the questions still failing are rewritten.
    for (let round = 0; round < 3 && reply && problems.length && problems.every((p) => /^q\d+:/.test(p)); round++) {
      if (problems.some((p) => /identifiable by its length/.test(p))) {
        await repairPayload(reply, schema, userId);
        problems = inspectPayload(reply, schema);
      }
      if (!patchable(problems)) break;
      reply = await patchQuestions(reply, schema, problems, prompt, userId);
      problems = inspectPayload(reply, schema);
    }
  }
  if (reply && problems.length && problems.every((p) => /identifiable by its length/.test(p))) {
    await repairPayload(reply, schema, userId);
    problems = inspectPayload(reply, schema);
  }
  // The explanation-key gate (KEY_GATE=on): a question whose explanation describes
  // another option is re-keyed blind; one the blind check does not confirm is
  // rewritten once, and checked again. Still failing, the set is not stored as clean.
  if (reply && !problems.length) {
    problems = await keyGateProblems(reply);
    if (problems.length && patchable(problems)) {
      reply = await patchQuestions(reply, schema, problems, prompt, userId);
      problems = inspectPayload(reply, schema);
      if (!problems.length) problems = await keyGateProblems(reply);
    }
  }

  const payload = reply ? envelope(trackId, gradeId, level, schema, reply, null) : null;
  const writer = providers.current('blocks');
  const row = {
    user_id: null,
    engine_id: assignment.engineId,
    track_id: trackId,
    grade_id: gradeId,
    level,
    payload,
    problems: payload ? problems : ['the model did not answer'],
    // What actually answered, not what the app prefers: the `games` role is
    // pinned to one model, so this names the weights the questions came from.
    model: writer ? `${writer.name} / ${writer.modelFor('blocks')}` : null,
    generated_at: new Date().toISOString(),
  };
  if (stored) db.update(COLLECTION, stored.id, row);
  else db.insert(COLLECTION, row);

  if (!payload || row.problems.length) return null;
  return { payload: { ...payload, settings: { ...payload.settings, ...(assignment.overrides || {}) } }, fresh: true };
}

/**
 * What the lesson this game follows actually covered — the coverage list its
 * block lesson was laid out to teach — so the game's questions practise what
 * was taught. Empty when that lesson has no block plan yet.
 */
function taughtFor(trackId, gradeId, level) {
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  const grade = curriculum.getGrade(trackId, gradeId);
  const last = LAYOUT.previousLesson(grade, level);
  if (!last) return '';
  const plan = blockLevels.findPlan({ userId: null, trackId, gradeId, level: last });
  if (!plan || !(plan.coverage || []).length) return '';
  return `WHAT THE LAST LESSON TAUGHT (the questions practise these points, spread across all of them):\n- ${blockLevels.taughtLine(trackId, gradeId, grade, last)}`;
}

/** The services/game-bank.js module, loaded on first use (it requires this file back). */
function gameBank() {
  // eslint-disable-next-line global-require
  return require('./game-bank');
}

/** The level's assignment when it is a bank game, else null. */
function bankAssignment(trackId, gradeId, level) {
  const found = assignments.resolve(trackId, gradeId, level);
  return found && found.source === 'bank' ? found : null;
}

/** A good shared payload for this level, if one has been written. */
function sharedReady(trackId, gradeId, level) {
  // A bank game is always ready: it is computed, not written.
  if (bankAssignment(trackId, gradeId, level)) return !held(trackId, gradeId, level);
  const row = db.findOne(COLLECTION, (r) => !r.user_id && r.track_id === trackId
    && r.grade_id === gradeId && r.level === level);
  return !!(row && row.payload && !(row.problems || []).length && !heldRow(row));
}

/**
 * May this account play the game at this level?
 *
 * Anyone, once the level's base question set exists — that is what a standard
 * learner plays. The owner and BASE_LESSON_ACCOUNTS may have it written on the
 * spot, and a learner on a tailoring plan gets their own.
 */
function accessFor(user, trackId, gradeId, level) {
  if (!user) return false;
  if (held(trackId, gradeId, level)) return false;
  // A bank game is base content, like the level's practice session: every account.
  if (bankAssignment(trackId, gradeId, level)) return true;
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  if (String(process.env.BLOCK_LEVELS || '').toLowerCase() === 'owner') {
    // eslint-disable-next-line global-require
    return require('../config/base-lessons').canSeeBaseLessons(user);
  }
  return blockLevels.mayGenerate(user) || sharedReady(trackId, gradeId, level);
}

/**
 * The stored payload and its problems: this learner's own when they have a good
 * one, otherwise the level's shared one. The answer route reads this, so it must
 * be the same set the learner was served.
 */
function stored(trackId, gradeId, level, userId = null) {
  // A bank game's set is computed again (it is seeded per level, so it is the
  // set that was served), in the shape of a shared row.
  const bank = bankAssignment(trackId, gradeId, level);
  if (bank) {
    if (held(trackId, gradeId, level)) return null;
    const payload = gameBank().payloadFor(trackId, gradeId, level);
    return payload ? {
      user_id: null, engine_id: bank.engineId, track_id: trackId, grade_id: gradeId, level,
      payload, problems: [], model: 'question bank (computed, no model)', generated_at: null, bank: true,
    } : null;
  }
  const mine = userId ? db.findOne(COLLECTION, (r) => r.user_id === userId && r.track_id === trackId
    && r.grade_id === gradeId && r.level === level && r.payload && !(r.problems || []).length) : null;
  if (held(trackId, gradeId, level)) return null;
  return mine || db.findOne(COLLECTION, (r) => !r.user_id && r.track_id === trackId
    && r.grade_id === gradeId && r.level === level) || null;
}


// ── tailored game questions ────────────────────────────────────────────────
const STYLES = ['recall', 'apply', 'analyze', 'scenario', 'error_spotting', 'compare'];

const PLAN_SYSTEM = `You plan the question set of one educational game level for one learner. The game's mechanics, its number of questions and its difficulty range are fixed; you decide what the set is made of so this learner understands and remembers the level's topic best.

Decide:
- mix: how the questions are split across the level's skills and question styles (recall, apply, analyze, scenario, error_spotting, compare). Weight the topics and question shapes the learner's record says they struggle with, without abandoning the rest of the level.
- theme: one of the learner's stated interests to set scenarios in, or "none". Never invent an interest.
- curve: how difficulty moves through the set inside the fixed range (for example: confidence first then climb; or interleaved).
- notes: up to three short instructions for the question writer drawn from the profile (wording, length, what to avoid).
Reply only through the tool.`;

function planSchema(count, skills) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mix', 'theme', 'curve', 'notes'],
    properties: {
      mix: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['skill', 'style', 'count'],
          properties: {
            skill: { type: 'string', enum: skills },
            style: { type: 'string', enum: STYLES },
            count: { type: 'integer', minimum: 1, maximum: count },
          },
        },
      },
      theme: { type: 'string' },
      curve: { type: 'string' },
      notes: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    },
  };
}

/** The plan as lines for the question writer. Counts are scaled to the set's size. */
function planText(plan, count) {
  const mix = (plan && plan.mix) || [];
  const total = mix.reduce((n, m) => n + (Number(m.count) || 0), 0) || 1;
  const lines = mix.slice(0, 12).map((m) => `- about ${Math.max(1, Math.round((m.count / total) * count))} ${m.style} questions on ${m.skill} (${curriculum.skillName(m.skill)})`);
  if (plan && plan.theme && !/^none$/i.test(plan.theme)) lines.push(`- set scenarios in: ${String(plan.theme).slice(0, 80)} (where it fits naturally)`);
  if (plan && plan.curve) lines.push(`- difficulty: ${String(plan.curve).slice(0, 160)}`);
  for (const n of ((plan && plan.notes) || []).slice(0, 3)) lines.push(`- ${String(n).slice(0, 160)}`);
  return lines.join('\n');
}

const tailoredInFlight = new Map();

/** This learner's own question set for a game level, written now if it is not kept. */
function ensureTailored(userId, trackId, gradeId, level, assignment, schema) {
  const mine = db.findOne(COLLECTION, (r) => r.user_id === userId && r.engine_id === assignment.engineId
    && r.track_id === trackId && r.grade_id === gradeId && r.level === level);
  if (mine && mine.payload && !(mine.problems || []).length) {
    return Promise.resolve({ payload: { ...mine.payload, settings: { ...mine.payload.settings, ...(assignment.overrides || {}) } }, fresh: false, tailored: true });
  }
  const key = `${userId}:${trackId}:${gradeId}:${level}`;
  if (tailoredInFlight.has(key)) return tailoredInFlight.get(key);
  const task = writeTailored(userId, trackId, gradeId, level, assignment, schema, mine)
    .catch((err) => {
      console.warn(`games: tailoring ${trackId}/${gradeId}/${level} failed: ${err.message}`);
      return null;
    })
    .finally(() => tailoredInFlight.delete(key));
  tailoredInFlight.set(key, task);
  return task;
}

async function writeTailored(userId, trackId, gradeId, level, assignment, schema, existing) {
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  // eslint-disable-next-line global-require
  const personalize = require('./personalize');
  const where = { trackId, gradeId, level };
  const { arm, experiment } = personalize.armFor(userId, where);
  if (arm === 'holdout') return null;

  const context = blockLevels.levelContext(trackId, gradeId, level);
  const learner = blockLevels.learnerText(userId, where, { tailored: true, experiment });
  const started = Date.now();

  const planned = await ai.structuredDetail({
    role: 'blocks',
    task: 'game_questions',
    system: PLAN_SYSTEM,
    user: `${context.text}\nGAME: ${assignment.engineId}, ${schema.questionCount} questions, ${schema.choicesPerQuestion || 4} choices each.\n\n${learner}\n\nPlan the question set.`,
    schema: planSchema(schema.questionCount, context.skills),
    schemaName: 'submit_question_plan',
    maxTokens: 12000,
    userId,
    lane: process.env.BLOCK_LANE || 'background',
  });
  const plan = normalizeReply(planned && planned.data);

  const prompt = gamePrompt.buildGamePrompt(trackId, gradeId, level, schema);
  const taught = taughtFor(trackId, gradeId, level);
  const user = [
    prompt.user,
    taught ? `\n${taught}` : '',
    '',
    learner,
    '',
    'PLAN FOR THIS LEARNER (follow it inside the mechanic requirements above):',
    planText(plan, schema.questionCount) || '- a balanced set across the level',
  ].join('\n');

  let reply = null;
  let problems = ['no reply'];
  let usage = planned && planned.usage ? { ...planned.usage } : { input_tokens: 0, output_tokens: 0 };
  let model = null;
  for (let attempt = 0; attempt < 2 && problems.length; attempt++) {
    const got = await ai.structuredDetail({
      role: 'blocks',
      task: 'game_questions',
      system: prompt.system,
      user,
      schema: outputSchema(schema),
      schemaName: 'submit_game_questions',
      maxTokens: Math.min(60000, 6000 + schema.questionCount * 440),
      userId,
      lane: process.env.BLOCK_LANE || 'background',
    });
    reply = normalizeReply(got && got.data);
    if (got && got.usage) {
      usage.input_tokens = (usage.input_tokens || 0) + (got.usage.input_tokens || 0);
      usage.output_tokens = (usage.output_tokens || 0) + (got.usage.output_tokens || 0);
    }
    if (got) model = got.model;
    problems = inspectPayload(reply, schema);
    // A handful of bad questions in a good set are rewritten on their own,
    // rather than the whole set being written again.
    // Up to three rounds of fixing only what is wrong, before the whole set is
    // written again: length giveaways first (rewriting a question's choices is
    // the cheapest fix), then the questions still failing are rewritten.
    for (let round = 0; round < 3 && reply && problems.length && problems.every((p) => /^q\d+:/.test(p)); round++) {
      if (problems.some((p) => /identifiable by its length/.test(p))) {
        await repairPayload(reply, schema, userId);
        problems = inspectPayload(reply, schema);
      }
      if (!patchable(problems)) break;
      reply = await patchQuestions(reply, schema, problems, prompt, userId);
      problems = inspectPayload(reply, schema);
    }
  }
  if (reply && problems.length && problems.every((p) => /identifiable by its length/.test(p))) {
    await repairPayload(reply, schema, userId);
    problems = inspectPayload(reply, schema);
  }
  if (reply && !problems.length) {
    problems = await keyGateProblems(reply);
    if (problems.length && patchable(problems)) {
      reply = await patchQuestions(reply, schema, problems, prompt, userId);
      problems = inspectPayload(reply, schema);
      if (!problems.length) problems = await keyGateProblems(reply);
    }
  }
  const payload = reply && !problems.length ? envelope(trackId, gradeId, level, schema, reply, null) : null;
  const row = {
    user_id: userId,
    engine_id: assignment.engineId,
    track_id: trackId,
    grade_id: gradeId,
    level,
    payload,
    problems: payload ? [] : (problems.length ? problems : ['the model did not answer']),
    plan: plan || null,
    arm,
    experiment: experiment || null,
    model,
    usage,
    seconds: Math.round((Date.now() - started) / 1000),
    generated_at: new Date().toISOString(),
  };
  if (existing) db.update(COLLECTION, existing.id, row);
  else db.insert(COLLECTION, row);
  if (!payload) return null;
  return { payload: { ...payload, settings: { ...payload.settings, ...(assignment.overrides || {}) } }, fresh: true, tailored: true };
}

module.exports = { held, holdsOn, outputSchema, ensure, ensureTailored, accessFor, sharedReady, evenOrder, normalizeReply, inject, stored, inspectPayload, engineHtml, schemaFor, planText, MARKER };
