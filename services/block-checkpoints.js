/**
 * Master quizzes, Grand Master quizzes and the Final, written for one learner.
 *
 * A checkpoint is a test, so tailoring it has a hard limit: it may change how a
 * question is presented and never what it measures. The blueprint — which
 * skill each question is on and at what difficulty — comes from the course
 * (sessions.planCheckpoint) and is the same for everyone at that level. What
 * the learner's profile decides is the presentation: typed answers or choices,
 * a plain question or a scenario built on one of their interests, a data
 * table, an error to spot. No hints, no easier wording, no fewer steps.
 *
 * Two calls, like every block level:
 *
 *   1. LAYOUT  the blueprint and the learner; back comes a format and a style
 *              for every slot. A few hundred tokens out.
 *   2. FILL    the questions, slot by slot, in parallel batches of ten so a
 *              forty-question Final is not one long reply that frays at the end.
 *
 * The questions become ordinary session items, so everything after them is the
 * checkpoint path that already exists: graded on the server, the 75% mark
 * (90% for the Final), and under it the choice of retrying at once on freshly
 * written questions or working through what went wrong with the tutor first.
 * Every attempt is written fresh and told every question the learner has
 * already been asked at this level, so a retry is never a rerun.
 *
 * Written a level ahead (block-levels.prefetchAhead) and while the learner reads
 * why they failed (sessions.prefetchRetry), so nobody waits; anything the model
 * does not deliver in time is filled from the question bank by the session.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');

const COLLECTION = 'block_plans';
const BATCH = 10;
const STYLES = ['plain', 'scenario', 'interest', 'data', 'error_spot', 'compare'];

const inFlight = new Map();

function blueprint(enrollment, grade, level) {
  // eslint-disable-next-line global-require
  const sessions = require('./sessions');
  const kind = curriculum.levelKind(level, grade.pathLength, grade);
  const entries = sessions.planCheckpoint({ ...enrollment, current_level: level }, grade, kind);
  return { kind, entries };
}

function signature(entries) {
  return entries.map((e) => `${e.skillId}@${Math.round(e.difficulty)}`).join(',');
}

function find(userId, enrollment, level, attempt) {
  return db.findOne(COLLECTION, (p) => p.user_id === userId && p.kind === 'checkpoint'
    && p.track_id === enrollment.track_id && p.grade_id === enrollment.grade_id
    && p.level === level && p.attempt === attempt) || null;
}

const LAYOUT_SYSTEM = `You set the presentation of a checkpoint quiz for one learner. The quiz's blueprint is fixed: every slot's skill and difficulty is decided by the course and is the same for every learner, and you must not change it.

Spread the formats and styles so the quiz checks what was taught from several angles — producing an answer, choosing between close options, applying the idea to a new case, and finding and fixing an error — in the mix the level's own description asks for where it gives one.

For each slot choose:
- format: "multiple_choice" or "type_in". Lean toward typed answers for a learner who recognizes more than they recall, or who prefers producing answers; lean toward choices where the skill is about discriminating between close options. Mix both unless the profile is strong.
- style: plain (a direct question), scenario (a short real-world situation), interest (a scenario built on one of their stated interests, only if they have one that fits), data (the question works from a small table or set of numbers given in the prompt), error_spot (a worked attempt with one mistake to identify), compare (choose between two approaches or readings).
- context: a few words steering the writer, for example which interest, or which kind of error.

Fairness rules: a checkpoint measures the skill, so no style may make a question easier or harder than its difficulty, and no hints. Vary styles so the quiz does not feel like one question repeated. Use what the learner profile says about how they show what they know. Reply only through the tool.`;

const FILL_SYSTEM = `You write the questions for a checkpoint quiz in an adaptive tutoring app. Each slot gives the skill, the difficulty out of 10, the format and the presentation style. Write exactly that.

Rules that are never broken:
- Exactly one correct answer, decided by the question alone. Everything correct; do the arithmetic.
- The difficulty is the difficulty: the style changes the surface, never the amount of thinking.
- Multiple choice: exactly four choices, the same kind of thing and similar length, the answer exactly equal to one of them, its position varied across the quiz. type_in: a short answer (a word, a number, a short phrase), with other correct spellings in "accepts" and "choices" empty.
- No hints inside the question. "hint" is an empty string.
- The rationale names the step that decides the answer.
- Never reuse or lightly rephrase a question the learner has already been asked.
- Test what was actually taught: every question is on something the lessons under WHAT WAS TAUGHT covered, and across the quiz those lessons are covered in proportion — none left out. Test understanding, not recognition: make the learner use, identify, correct, compare or justify on new material they have not seen, so a learner who only memorised the lesson's wording cannot pass and one who understood it can.
- Pitch the wording, examples and reading load at the GRADE's average age.
- Plain text only: no HTML, markdown or LaTeX. Write x^2 and a/b.
Reply only through the tool.`;

function layoutSchema(count) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['approach', 'slots'],
    properties: {
      approach: { type: 'string' },
      slots: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['slot', 'format', 'style', 'context'],
          properties: {
            slot: { type: 'integer' },
            format: { type: 'string', enum: ['multiple_choice', 'type_in'] },
            style: { type: 'string', enum: STYLES },
            context: { type: 'string' },
          },
        },
      },
    },
  };
}

const ITEMS_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slot', 'format', 'prompt', 'choices', 'answer', 'accepts', 'rationale', 'hint'],
        properties: {
          slot: { type: 'integer' },
          format: { type: 'string', enum: ['multiple_choice', 'type_in'] },
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          accepts: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
          hint: { type: 'string' },
        },
      },
    },
  },
};

/** The presentation for every slot: the model's where it gave one, plain otherwise. */
/** A list as the model sent it: an array, or an array sent as a JSON string. */
function readList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function cleanLayout(raw, entries) {
  const out = entries.map((_, i) => ({ slot: i, format: i % 3 === 2 ? 'type_in' : 'multiple_choice', style: 'plain', context: '' }));
  for (const s of readList(raw && raw.slots)) {
    const i = Number(s && s.slot);
    if (!Number.isInteger(i) || i < 0 || i >= entries.length) continue;
    out[i] = {
      slot: i,
      format: s.format === 'type_in' ? 'type_in' : 'multiple_choice',
      style: STYLES.includes(s.style) ? s.style : 'plain',
      context: String(s.context || '').slice(0, 120),
    };
  }
  return out;
}

/**
 * Write the questions for one attempt.
 *
 * @returns {Promise<object|null>} the stored row, with `items` keyed by slot
 */
async function write({ userId, enrollment, grade, level, attempt }) {
  // eslint-disable-next-line global-require
  const ai = require('./ai');
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  // eslint-disable-next-line global-require
  const sessions = require('./sessions');
  const { kind, entries } = blueprint(enrollment, grade, level);
  if (!entries.length) return null;

  const where = { trackId: enrollment.track_id, gradeId: enrollment.grade_id, level };
  const context = blockLevels.levelContext(enrollment.track_id, enrollment.grade_id, level);
  const learner = blockLevels.learnerText(userId, where, { tailored: !!userId });
  const label = curriculum.CHECKPOINT_LABEL[kind] || 'checkpoint';
  const started = Date.now();

  const row = find(userId, enrollment, level, attempt) || db.insert(COLLECTION, {
    user_id: userId, kind: 'checkpoint', checkpoint_kind: kind, track_id: enrollment.track_id,
    grade_id: enrollment.grade_id, level, attempt, status: 'writing',
  });
  db.update(COLLECTION, row.id, { status: 'writing', signature: signature(entries), started_at: new Date().toISOString() });

  const spec = entries.map((e, i) => `slot ${i}: ${e.skillId} (${curriculum.skillName(e.skillId)}), difficulty ${Math.round(e.difficulty)}`).join('\n');
  const layoutReply = await ai.structuredDetail({
    role: 'blocks',
    task: 'block_layout',
    system: LAYOUT_SYSTEM,
    user: `${label.toUpperCase()}, ${entries.length} questions.\n${context.text}\n\n${learner}\n\nBLUEPRINT (fixed):\n${spec}\n\nSet the presentation of every slot.`,
    schema: layoutSchema(entries.length),
    schemaName: 'submit_quiz_layout',
    maxTokens: 16000,
    userId,
    lane: process.env.BLOCK_LANE || 'background',
  });
  const layout = cleanLayout(layoutReply && layoutReply.data, entries);

  const seen = sessions.examPromptsSeen(userId, level);
  const avoid = seen.slice(-40).map((p) => `- ${String(p).slice(0, 160)}`).join('\n');
  const batches = [];
  for (let at = 0; at < entries.length; at += BATCH) {
    const slots = layout.slice(at, at + BATCH);
    const lines = slots.map((s) => {
      const e = entries[s.slot];
      return `slot ${s.slot}: skill ${e.skillId} (${curriculum.skillName(e.skillId)}), difficulty ${Math.round(e.difficulty)}, ${s.format}, style ${s.style}${s.context ? ` (${s.context})` : ''}`;
    }).join('\n');
    batches.push(ai.structuredDetail({
      role: 'blocks',
      task: 'block_fill',
      system: FILL_SYSTEM,
      user: `${label} at level ${level}.\n${context.text}\n\n${learner}\n\nWRITE THESE SLOTS:\n${lines}\n\nAlready asked at this level, do not reuse:\n${avoid || '(none)'}`,
      schema: ITEMS_SCHEMA,
      schemaName: 'submit_quiz_items',
      maxTokens: 24000,
      userId,
      lane: 'parallel',
    }).catch(() => null));
  }
  const replies = await Promise.all(batches);

  const seenPrompts = new Set(seen.map((p) => String(p).trim().toLowerCase()));
  const items = {};
  const usage = { input_tokens: 0, output_tokens: 0 };
  for (const u of [layoutReply, ...replies]) {
    if (u && u.usage) {
      usage.input_tokens += u.usage.input_tokens || 0;
      usage.output_tokens += u.usage.output_tokens || 0;
    }
  }
  for (const reply of replies) {
    for (const raw of readList(reply && reply.data && reply.data.items)) {
      const slot = Number(raw && raw.slot);
      const entry = entries[slot];
      if (!entry || items[slot]) continue;
      const choices = readList(raw.choices);
      // eslint-disable-next-line global-require
      const answer = choices.length ? require('./block-levels').alignAnswer(raw.answer, choices) : raw.answer;
      const item = ai.validateItem({ ...raw, answer, choices, accepts: readList(raw.accepts), format: layout[slot].format, hint: '' }, entry.skillId, entry.difficulty);
      if (!item) continue;
      const key = item.prompt.trim().toLowerCase();
      if (seenPrompts.has(key)) continue;
      seenPrompts.add(key);
      items[slot] = { ...item, presentation: layout[slot].style };
    }
  }

  // No verifier key (LEVEL_SELF_CHECK, evidence P10): a written question reaches the
  // quiz only once a blind judge, never shown the key, picks the same answer. A
  // typed question has no independent check here, so its slot, like any slot that
  // fails, is filled from the question bank by the session.
  let selfCheck = null;
  if (blockLevels.selfCheckOn()) {
    // eslint-disable-next-line global-require
    const keyGate = require('./key-gate');
    const slots = Object.keys(items).filter((s) => items[s].format === 'multiple_choice' && Array.isArray(items[s].choices));
    const results = slots.length ? await keyGate.blindResolve(slots.map((s) => ({ prompt: items[s].prompt, choices: items[s].choices, answer: items[s].answer }))) : [];
    const agreed = new Set(slots.filter((s, n) => results[n] && results[n].verdict === 'agreed'));
    const before = Object.keys(items).length;
    for (const s of Object.keys(items)) if (!agreed.has(s)) delete items[s];
    selfCheck = { status: 'passed', kept: agreed.size, dropped: before - agreed.size, checked_at: new Date().toISOString() };
  }

  return db.update(COLLECTION, row.id, {
    ...(selfCheck ? { self_check: selfCheck } : {}),
    status: Object.keys(items).length ? 'ready' : 'failed',
    approach: layoutReply && layoutReply.data ? String(layoutReply.data.approach || '').slice(0, 400) : '',
    layout,
    items,
    filled: Object.keys(items).length,
    wanted: entries.length,
    model: (replies.find((r) => r && r.model) || {}).model || null,
    usage,
    seconds: Math.round((Date.now() - started) / 1000),
    claimed_at: null,
    finished_at: new Date().toISOString(),
  });
}

/** With no verifier key (LEVEL_SELF_CHECK, P10), only a self-checked set is handed out; the bank fills the rest. */
function selfChecked(row) {
  // eslint-disable-next-line global-require
  return !require('./block-levels').selfCheckOn() || !!(row && row.self_check && row.self_check.status === 'passed');
}

function ensure({ userId, enrollment, grade, level, attempt }) {
  const existing = find(userId, enrollment, level, attempt);
  if (existing && existing.status === 'ready') return Promise.resolve(existing);
  const key = `${userId}:${enrollment.id}:${level}:${attempt}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const task = write({ userId, enrollment, grade, level, attempt })
    .catch((err) => {
      console.warn(`blocks: writing the level ${level} checkpoint failed: ${err.message}`);
      return null;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

/** Write the next attempt ahead of time. Nobody awaits this. */
function prefetch({ userId, enrollment, grade, level, attempt }) {
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  if (!blockLevels.aiReady()) return;
  const at = level || enrollment.current_level;
  const n = attempt || (at === enrollment.current_level ? (enrollment.checkpoint_attempts || 0) + 1 : 1);
  const existing = find(userId, enrollment, at, n);
  if (existing && (existing.status === 'ready' || existing.status === 'writing')) return;
  ensure({ userId, enrollment, grade, level: at, attempt: n }).catch(() => {});
}

/**
 * The level's shared base questions, by slot — the first attempt for a learner
 * whose levels are not tailored. Written ahead by scripts/generate-base-levels.js,
 * read by everyone, never consumed; a retry is written fresh as before.
 */
function shared({ enrollment, level, entries }) {
  const row = db.findOne(COLLECTION, (p) => p.user_id === null && p.kind === 'checkpoint'
    && p.track_id === enrollment.track_id && p.grade_id === enrollment.grade_id
    && p.level === level && p.attempt === 1 && p.status === 'ready');
  if (!row || !selfChecked(row)) return {};
  const out = {};
  for (const [slot, item] of Object.entries(row.items || {})) {
    const entry = entries[Number(slot)];
    if (entry && item && item.skill_id === entry.skillId) out[slot] = { ...item, difficulty: entry.difficulty };
  }
  return out;
}

/** Write the level's shared base questions (no learner in the prompt). */
function writeShared({ trackId, gradeId, grade, level }) {
  const enrollment = { id: `base:${trackId}:${gradeId}`, track_id: trackId, grade_id: gradeId, current_level: level, checkpoint_attempts: 0 };
  return ensure({ userId: null, enrollment, grade, level, attempt: 1 });
}

/**
 * The tailored questions for this attempt, by slot, waiting at most `waitMs`.
 * Used once: a claimed set is never handed out again. Slots whose skill or
 * difficulty no longer match the blueprint are dropped rather than trusted.
 */
async function claim({ userId, enrollment, grade, level, entries, attempt, waitMs }) {
  const task = ensure({ userId, enrollment, grade, level, attempt });
  const row = await Promise.race([task, new Promise((r) => setTimeout(() => r(null), waitMs))]);
  if (!row || row.status !== 'ready' || row.claimed_at || !selfChecked(row)) return {};
  const out = {};
  for (const [slot, item] of Object.entries(row.items || {})) {
    const entry = entries[Number(slot)];
    if (entry && item && item.skill_id === entry.skillId) out[slot] = { ...item, difficulty: entry.difficulty };
  }
  db.update(COLLECTION, row.id, { claimed_at: new Date().toISOString() });
  return out;
}

module.exports = { write, ensure, prefetch, claim, shared, writeShared, blueprint, cleanLayout, signature, LAYOUT_SYSTEM, FILL_SYSTEM, STYLES };
