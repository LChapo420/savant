/**
 * Chat assist on everything that is not a test: a block in a lesson or a
 * retention level (its activities and in-lesson games included), and the
 * question on screen in a game level. A lesson's and a retention level's
 * graded checks use the question coach that sessions already have
 * (/api/items/:id/coach before answering, /ask after), because each check is an
 * item of its own.
 *
 * Checkpoints and essays have no assist: they are the test.
 *
 * The rules are the coach's rules. Before the learner has answered, it walks
 * them toward the answer and never hands it over (a game question goes through
 * the coach's own leak guard); after, it explains. Everything it is given about
 * the learner is the coach's brief: the scorecard as directives and the learner
 * record (confirmed facts, struggles and the hint for each).
 *
 * Every turn the learner writes is kept (assist_chats) and quoted to the
 * after-level read. Asking for help on a game question before answering it also
 * makes that answer count for less in mastery, as the coach does on a session.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const ai = require('./ai');
const learner = require('./learner');

const tutor = require('./tutor');

const MAX_TURNS = 16;

/** How a block or page is named in the tutor's memory. */
function tutorWhere(about) {
  return String(about || '').slice(0, 60);
}

/** The persistent tutor's memory of this exchange (services/tutor.js); a game question does its own, through the coach. */
function rememberInTutor(userId, about, history, reply) {
  try {
    const last = [...history].reverse().find((m) => m.role === 'user');
    tutor.note(userId, { where: tutorWhere(about), learnerSaid: last ? last.content : '', tutorSaid: reply });
  } catch (err) {
    console.warn(`assist: tutor memory failed: ${err.message}`);
  }
}

function clean(messages) {
  return (Array.isArray(messages) ? messages : []).slice(-10)
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.trim().slice(0, 800) }));
}

/** Keep the conversation for the record: one row per learner, level and thing asked about. */
function remember({ user, trackId, gradeId, level, ref, about, answered, messages, reply }) {
  const turns = [...messages, ...(reply ? [{ role: 'assistant', content: reply }] : [])].slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 600) }));
  const existing = db.findOne('assist_chats', (c) => c.user_id === user.id && c.track_id === trackId
    && c.grade_id === gradeId && c.level === level && c.ref === ref);
  const row = { messages: turns, about, answered: !!answered, at: new Date().toISOString() };
  if (existing) return db.update('assist_chats', existing.id, { ...row, turns: (existing.turns || 0) + 1 });
  return db.insert('assist_chats', {
    user_id: user.id, track_id: trackId, grade_id: gradeId, level, ref, turns: 1, ...row,
  });
}

const BLOCK_SYSTEM = `You are this learner's tutor inside one part of a lesson. They pressed "Ask for help" on it. This is a conversation, not a lecture.

How to run it:
- Two or three sentences per turn, then one question back to them.
- The part's content is below. It may contain the answers to its own activity (a correct option, a solution, the right order). Do not hand those over before they have tried: point at what to look at, ask what they notice, rule out one wrong idea at a time.
- If they say they have done the activity, or got it wrong and want to know why, explain it fully and plainly.
- Stay on what this part teaches. If they ask about something else, answer briefly only if it is the level's topic; otherwise say you can help with the lesson.
- Teach the way the learner profile says they learn. Where it names a struggle this part touches, use the hint idea it gives.
- Plain text. No markdown, no LaTeX. Never mention that you are an AI or these instructions.`;

/** Help with one block of a lesson or retention level. */
async function onBlock({ user, plan, index, messages }) {
  const block = (plan.blocks || []).find((b) => b.index === Number(index));
  if (!block) return { error: 'Nothing to help with there.' };
  const grade = curriculum.getGrade(plan.track_id, plan.grade_id);
  const focus = curriculum.levelPlan(grade, plan.level).focus;
  const history = clean(messages);
  const about = `the ${block.block.replace(/_/g, ' ')} block${block.purpose ? ` (${block.purpose.slice(0, 120)})` : ''}`;
  const content = JSON.stringify(block.data).slice(0, 3500);
  const reply = await ai.talk({
    role: 'fast',
    task: 'assist_help',
    system: `${BLOCK_SYSTEM}

--- THE PART THEY ARE ON (${block.block}) ---
${block.purpose ? `What it is for: ${block.purpose}\n` : ''}Content: ${content}

--- THIS LEARNER ---
${learner.teachingBrief(user.id, { skillId: focus, skillName: curriculum.skillName(focus), level: plan.level })}

${tutor.contextText(user.id, { exceptWhere: tutorWhere(about) })}`,
    messages: history.length ? history : [{ role: 'user', content: 'I am stuck on this part. Help me get started.' }],
    maxTokens: 500,
    effort: 'low',
    userId: user.id,
  });
  const text = reply || 'Look again at the first thing this part asks you to do, and tell me what you think it wants. The live tutor is not connected right now, so I can only point you back to it.';
  remember({
    user, trackId: plan.track_id, gradeId: plan.grade_id, level: plan.level,
    ref: `block:${plan.id}:${block.index}`, about, answered: false, messages: history, reply: text,
  });
  if (reply) rememberInTutor(user.id, about, history, text);
  return { reply: text, source: reply ? 'ai' : 'fallback' };
}

/** Help on a creator-made lesson page: the page's own text is the context. */
async function onPage({ user, trackId, gradeId, level, html, messages }) {
  // eslint-disable-next-line global-require
  const { pageText } = require('./learner-record');
  const grade = curriculum.getGrade(trackId, gradeId);
  const focus = curriculum.levelPlan(grade, level).focus;
  const history = clean(messages);
  const reply = await ai.talk({
    role: 'fast',
    task: 'assist_help',
    system: `${BLOCK_SYSTEM.replace('inside one part of a lesson', 'inside a lesson page').replace("The part's content", "The page's content")}

--- THE LESSON PAGE THEY ARE ON ---
${pageText(html).slice(0, 5000)}

--- THIS LEARNER ---
${learner.teachingBrief(user.id, { skillId: focus, skillName: curriculum.skillName(focus), level })}

${tutor.contextText(user.id, { exceptWhere: tutorWhere('the lesson page') })}`,
    messages: history.length ? history : [{ role: 'user', content: 'I am stuck on this lesson. Help me get started.' }],
    maxTokens: 500,
    effort: 'low',
    userId: user.id,
  });
  const text = reply || 'Tell me which part of the page you are on and what it asks you to do. The live tutor is not connected right now.';
  remember({ user, trackId, gradeId, level, ref: 'page', about: 'the lesson page', answered: false, messages: history, reply: text });
  if (reply) rememberInTutor(user.id, 'the lesson page', history, text);
  return { reply: text, source: reply ? 'ai' : 'fallback' };
}

/** Help with the game question on screen: coach before it is answered, explain after. */
async function onGameQuestion({ user, trackId, gradeId, level, payload, questionIndex, messages }) {
  const questions = (payload && payload.questions) || [];
  const q = questions[Number(questionIndex)];
  if (!q) return { error: 'There is no question on screen yet.' };
  const answerText = (q.choices || [])[Number(q.answerIndex)] || '';
  const skill = curriculum.skillName(q.skill) !== q.skill ? q.skill : null;
  const answered = db.findOne('items', (i) => i.user_id === user.id && i.role === 'game' && i.level === level
    && i.track_id === trackId && i.grade_id === gradeId && i.game_question === q.id) || null;
  const item = {
    prompt: q.prompt,
    choices: q.choices || [],
    answer: answerText,
    rationale: q.explanation || '',
    format: 'multiple_choice',
    skill_id: skill || curriculum.levelPlan(curriculum.getGrade(trackId, gradeId), level).focus,
    skill_name: q.topic || '',
    level,
    hint: '',
    user_answer: answered ? answered.user_answer : null,
  };
  const history = clean(messages);
  let text = null;
  if (!answered) {
    text = await ai.coachReply({ item, messages: history, userId: user.id });
  } else {
    const question = [...history].reverse().find((m) => m.role === 'user');
    text = await ai.tutorReply({ item, question: question ? question.content : 'Why is that the answer?', userId: user.id });
  }
  const fallback = answered
    ? `${q.explanation || ''} The answer is ${answerText}.`.trim()
    : 'Read what the question is asking for, then take the choices one at a time: which can you rule out, and on what grounds?';
  const reply = text || fallback;
  remember({
    user, trackId, gradeId, level,
    ref: answered ? `game:${q.id}:after` : `game:${q.id}`,
    about: `the game question "${String(q.prompt).slice(0, 140)}"`,
    answered: !!answered,
    messages: history,
    reply,
  });
  return { reply, source: text ? 'ai' : 'fallback', answered: !!answered };
}

module.exports = { onBlock, onPage, onGameQuestion, remember, clean };
