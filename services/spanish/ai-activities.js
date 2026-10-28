/**
 * The Spanish activities that need a model at runtime: the conversation-lab
 * partner, writing feedback, and rubric scoring of writing and recordings.
 *
 * Every function has a deterministic fallback, so each level still works with
 * the AI switched off or out of budget: the partner follows the scenario's
 * script, feedback checks the level's must-use forms, and rubrics score
 * coverage and length. The `source` field on each result says which ran.
 */
const ai = require('../ai');
const grade = require('../../public/spanish/js/shared/grade');

const RUBRIC_SCHEMA = {
  type: 'object',
  properties: {
    task: { type: 'integer', minimum: 0, maximum: 4 },
    accuracy: { type: 'integer', minimum: 0, maximum: 4 },
    range: { type: 'integer', minimum: 0, maximum: 4 },
    fluency: { type: 'integer', minimum: 0, maximum: 4 },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { said: { type: 'string' }, better: { type: 'string' }, why: { type: 'string' }, tag: { type: 'string', enum: ['grammar', 'vocab', 'spelling', 'accent', 'word_order', 'sound', 'meaning'] } },
        required: ['said', 'better', 'why', 'tag'],
        additionalProperties: false,
      },
    },
  },
  required: ['task', 'accuracy', 'range', 'fluency', 'summary', 'strengths', 'fixes'],
  additionalProperties: false,
};

function overall(r) {
  return Math.round(((r.task + r.accuracy + r.range + r.fluency) / 16) * 100);
}

const norm = (s) => grade.stripAccents(grade.clean(s));

// A model call that comes back empty (a dropped connection, an answer cut off
// by its token limit) gets one more try before the built-in checker takes over.
async function structuredTwice(args) {
  for (let i = 0; i < 2; i++) {
    const out = await ai.structured(args).catch(() => null);
    if (out) return out;
  }
  return null;
}
const hasAny = (text, keys) => (keys || []).some((k) => norm(text).includes(norm(k)));

// ── conversation lab ───────────────────────────────────────────────────────

const TURN_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    goals_met: { type: 'array', items: { type: 'string' } },
    finished: { type: 'boolean' },
    hint: { type: 'string' },
  },
  required: ['reply', 'goals_met', 'finished', 'hint'],
  additionalProperties: false,
};

function partnerSystem(level) {
  const s = level.scenario;
  return `You are ${s.partnerName}, a character in a Spanish-learning role-play. Stay in character and speak only Spanish.
Learner level: ${level.cefr}. Use only very common words and the structures below; replies are 1 or 2 short sentences (max 15 words).
Setting: ${s.setting}
Your private card (the learner cannot see it): ${s.partnerCard}
The learner's card: ${s.learnerCard}
The learner's goals, by id: ${s.goals.map((g) => `${g.id}: ${g.text}`).join(' | ')}
Target language for this level: ${(s.targets || []).join(', ')}
Rules:
- Never give away what is on your card unless the learner asks for it (it is an information gap).
- If the learner makes a mistake on a form they have practised, prompt them to self-correct first (for example: "¿Cómo? ¿Quieres decir...?"). For a new form, simply recast it correctly in your reply.
- If the learner writes in English, answer in Spanish and gently ask them to try in Spanish.
- goals_met lists every goal id the learner has achieved so far in the whole conversation.
- finished is true only when all goals are met or the conversation has clearly ended.
- hint is one short English tip for what the learner could say next (empty if none needed).`;
}

function scriptedTurn(level, history, text) {
  const s = level.scenario;
  const met = new Set();
  const learnerLines = [...history.filter((h) => h.who === 'learner').map((h) => h.text), text];
  for (const step of s.script) if (learnerLines.some((l) => hasAny(l, step.expect))) met.add(step.goal);
  const step = s.script.find((st) => hasAny(text, st.expect));
  const usedReplies = new Set(history.filter((h) => h.who === 'partner').map((h) => h.text));
  let reply = step && !usedReplies.has(step.reply) ? step.reply : null;
  if (!reply) {
    const next = s.script.find((st) => !met.has(st.goal));
    reply = next ? (s.nudges && s.nudges[next.goal]) || s.fallbackReply : s.closing;
  }
  const goalsMet = s.goals.map((g) => g.id).filter((id) => met.has(id));
  const next = s.script.find((st) => !met.has(st.goal));
  return {
    reply,
    goals_met: goalsMet,
    finished: goalsMet.length === s.goals.length,
    hint: next ? next.hint : '',
    source: 'script',
  };
}

async function conversationTurn(level, history, text, userId) {
  if (ai.isEnabled()) {
    const transcript = history.map((h) => `${h.who === 'learner' ? 'Learner' : level.scenario.partnerName}: ${h.text}`).join('\n');
    const out = await ai.structured({
      role: 'fast',
      task: 'spanish_partner_turn',
      system: partnerSystem(level),
      user: `Conversation so far:\n${transcript}\nLearner: ${text}\n\nReply as ${level.scenario.partnerName}.`,
      schema: TURN_SCHEMA,
      schemaName: 'partner_turn',
      maxTokens: 400,
      userId,
    }).catch(() => null);
    if (out && out.reply) {
      const ids = new Set(level.scenario.goals.map((g) => g.id));
      return { reply: out.reply.trim(), goals_met: (out.goals_met || []).filter((g) => ids.has(g)), finished: !!out.finished, hint: out.hint || '', source: 'ai' };
    }
  }
  return scriptedTurn(level, history, text);
}

async function conversationRubric(level, history, goalsMet, userId) {
  const learner = history.filter((h) => h.who === 'learner').map((h) => h.text);
  if (ai.isEnabled() && learner.length) {
    const out = await structuredTwice({
      role: 'fast',
      task: 'spanish_rubric',
      system: `You assess a ${level.cefr} Spanish learner's role-play. Score 0-4 on task completion, accuracy, range and fluency, for this level (a level-appropriate performance is 3). Write summary and strengths in English, short. List up to 4 fixes: what the learner said, a better ${level.cefr} version in Spanish, and why in English.`,
      user: `Goals: ${level.scenario.goals.map((g) => g.text).join('; ')}\nGoals met: ${goalsMet.join(', ') || 'none'}\nTranscript:\n${history.map((h) => `${h.who === 'learner' ? 'Learner' : 'Partner'}: ${h.text}`).join('\n')}`,
      schema: RUBRIC_SCHEMA,
      schemaName: 'rubric',
      maxTokens: 1600,
      userId,
    });
    if (out) return { ...out, overall: overall(out), source: 'ai' };
  }
  const ratio = level.scenario.goals.length ? goalsMet.length / level.scenario.goals.length : 0;
  const words = learner.join(' ').split(/\s+/).filter(Boolean).length;
  const r = {
    task: Math.round(ratio * 4),
    accuracy: learner.length ? 3 : 0,
    range: Math.min(4, Math.round(words / 8)),
    fluency: Math.min(4, learner.length),
    summary: ratio === 1 ? 'You reached every goal of the role-play.' : `You reached ${goalsMet.length} of ${level.scenario.goals.length} goals.`,
    strengths: learner.length ? ['You kept the conversation in Spanish.'] : [],
    fixes: [],
  };
  return { ...r, overall: overall(r), source: 'heuristic' };
}

// ── writing ────────────────────────────────────────────────────────────────

const FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    on_task: { type: 'boolean' },
    priorities: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' }, example: { type: 'string' } },
        required: ['title', 'detail', 'example'],
        additionalProperties: false,
      },
    },
  },
  required: ['on_task', 'priorities'],
  additionalProperties: false,
};

function wordCount(t) { return String(t || '').trim().split(/\s+/).filter(Boolean).length; }

function heuristicFeedback(level, draft) {
  const w = level.writing;
  const n = wordCount(draft);
  const out = [];
  if (n < w.minWords) out.push({ title: 'Write a little more', detail: `Aim for ${w.minWords}–${w.maxWords} words; you have ${n}.`, example: w.model.split(/(?<=[.!?])\s/)[0] });
  if (n > w.maxWords) out.push({ title: 'Trim it down', detail: `Keep it to ${w.maxWords} words or fewer; you have ${n}.`, example: '' });
  for (const m of w.mustUse || []) {
    if (!new RegExp(m.pattern, 'i').test(grade.stripAccents(draft))) out.push({ title: m.title, detail: m.detail, example: m.example });
  }
  if (/\?/.test(draft) && !/¿/.test(draft)) out.push({ title: 'Open your questions', detail: 'Spanish questions start with ¿ as well as ending with ?.', example: '¿Cómo estás?' });
  if (/!/.test(draft) && !/¡/.test(draft)) out.push({ title: 'Open your exclamations', detail: 'Spanish exclamations start with ¡.', example: '¡Hola!' });
  // A word counts as missing its accent when its bare form appears as a whole
  // word and the accented form does not (case-insensitive, Unicode-aware).
  const wordsIn = new Set(draft.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean));
  const missingAccents = (w.accentWords || []).filter((word) => wordsIn.has(grade.stripAccents(word).toLowerCase()) && !wordsIn.has(word.toLowerCase()));
  if (missingAccents.length) out.push({ title: 'Check your accents', detail: `These words need their accent mark: ${missingAccents.join(', ')}.`, example: missingAccents[0] });
  return { on_task: n >= Math.max(1, Math.floor(w.minWords / 2)), priorities: out.slice(0, 3), source: 'heuristic' };
}

async function writingFeedback(level, draft, userId) {
  if (ai.isEnabled() && wordCount(draft) >= 1) {
    const w = level.writing;
    const out = await ai.structured({
      role: 'fast',
      task: 'spanish_rubric',
      system: `You are a warm Spanish writing coach for a ${level.cefr} learner. Give feedback on exactly 2 or 3 priorities, most important first, in English (title max 6 words, detail max 30 words), each with a short corrected Spanish example taken from or modelled on their text. Do not rewrite the whole text. Judge only what this level expects.`,
      user: `Task: ${w.task}\nReader: ${w.reader}\nLength: ${w.minWords}-${w.maxWords} words\nMust show: ${(w.mustUse || []).map((m) => m.title).join('; ')}\n\nLearner draft:\n${draft}`,
      schema: FEEDBACK_SCHEMA,
      schemaName: 'feedback',
      maxTokens: 700,
      userId,
    }).catch(() => null);
    if (out && Array.isArray(out.priorities) && out.priorities.length) return { on_task: out.on_task, priorities: out.priorities.slice(0, 3), source: 'ai' };
  }
  return heuristicFeedback(level, draft);
}

async function writingRubric(level, text, userId) {
  const w = level.writing;
  if (ai.isEnabled() && wordCount(text)) {
    const out = await structuredTwice({
      role: 'fast',
      task: 'spanish_rubric',
      system: `You assess a ${level.cefr} Spanish learner's short writing. Score 0-4 on task completion, accuracy, range and fluency (coherence), where a solid performance for this level is 3. Summary and strengths in English, short. Up to 4 fixes with what they wrote, a better version, and why.`,
      user: `Task: ${w.task}\nReader: ${w.reader}\nMust show: ${(w.mustUse || []).map((m) => m.title).join('; ')}\n\nText:\n${text}`,
      schema: RUBRIC_SCHEMA,
      schemaName: 'rubric',
      maxTokens: 1600,
      userId,
    });
    if (out) return { ...out, overall: overall(out), source: 'ai' };
  }
  const fb = heuristicFeedback(level, text);
  const n = wordCount(text);
  const used = (w.mustUse || []).filter((m) => new RegExp(m.pattern, 'i').test(grade.stripAccents(text))).length;
  const need = (w.mustUse || []).length || 1;
  const r = {
    task: n >= w.minWords ? 3 + (used === need ? 1 : 0) : Math.min(2, Math.round((n / w.minWords) * 3)),
    accuracy: Math.max(1, 4 - fb.priorities.length),
    range: Math.min(4, Math.round((used / need) * 4)),
    fluency: n >= w.minWords ? 3 : 2,
    summary: fb.priorities.length ? `Focus next on: ${fb.priorities.map((p) => p.title.toLowerCase()).join('; ')}.` : 'Clear and on task.',
    strengths: n >= w.minWords ? ['You wrote the full length.'] : [],
    fixes: [],
  };
  return { ...r, overall: overall(r), source: 'heuristic' };
}

// ── recordings (projects, live excerpts, checkpoint speaking samples) ──────

async function recordingRubric(level, { transcript, durationMs, pauseMs, brief, mustSay }, userId) {
  const words = wordCount(transcript);
  const minutes = Math.max(0.05, (durationMs || 0) / 60000);
  const wpm = Math.round(words / minutes);
  const covered = (mustSay || []).filter((k) => hasAny(transcript, [k]));
  if (ai.isEnabled() && words) {
    const out = await structuredTwice({
      role: 'fast',
      task: 'spanish_rubric',
      system: `You assess a ${level.cefr} Spanish learner's spoken recording from its speech-recognition transcript (recognition errors are possible; be fair). Score 0-4 on task completion, accuracy, range and fluency, where solid for this level is 3. Fluency also considers ${wpm} words per minute and ${Math.round((pauseMs || 0) / 1000)} s of long pauses. Summary and strengths in English. Up to 4 fixes.`,
      user: `Brief: ${brief}\nMust include: ${(mustSay || []).join('; ')}\nTranscript:\n${transcript}`,
      schema: RUBRIC_SCHEMA,
      schemaName: 'rubric',
      maxTokens: 1600,
      userId,
    });
    if (out) return { ...out, overall: overall(out), wpm, source: 'ai' };
  }
  const need = (mustSay || []).length || 1;
  const r = {
    task: Math.round((covered.length / need) * 4),
    accuracy: words ? 3 : 0,
    range: Math.min(4, Math.round(words / 10)),
    fluency: wpm >= 60 ? 3 : wpm >= 30 ? 2 : words ? 1 : 0,
    summary: `You covered ${covered.length} of ${need} required points at about ${wpm} words per minute.`,
    strengths: covered.length ? [`You included: ${covered.join(', ')}.`] : [],
    fixes: (mustSay || []).filter((k) => !covered.includes(k)).map((k) => ({ said: '', better: k, why: 'This was in the brief and missing from the recording.', tag: 'meaning' })),
  };
  return { ...r, overall: overall(r), wpm, source: 'heuristic' };
}

// A one-sentence reaction (reading block): is it Spanish, and one small fix.
const REACTION_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, reply: { type: 'string' }, better: { type: 'string' } },
  required: ['ok', 'reply', 'better'],
  additionalProperties: false,
};
async function reaction(level, text, userId) {
  if (ai.isEnabled() && wordCount(text)) {
    const out = await ai.structured({
      role: 'fast',
      task: 'spanish_reaction',
      system: `A ${level.cefr} Spanish learner wrote a one-sentence reaction to a short text. ok = it is a Spanish sentence related to the text. reply = one warm sentence in simple Spanish responding to their idea. better = their sentence with any errors corrected (same if none).`,
      user: `Text title: ${level.reader && level.reader.title}\nReaction: ${text}`,
      schema: REACTION_SCHEMA, schemaName: 'reaction', maxTokens: 250, userId,
    }).catch(() => null);
    if (out) return { ...out, source: 'ai' };
  }
  const spanishish = /\b(el|la|es|me|un|una|que|de|muy|y|no|gusta|está|es)\b/i.test(text);
  return { ok: spanishish && wordCount(text) >= 3, reply: spanishish ? '¡Gracias por tu opinión!' : 'Intenta escribir en español.', better: text, source: 'heuristic' };
}

module.exports = { conversationTurn, conversationRubric, writingFeedback, writingRubric, recordingRubric, reaction, wordCount };
