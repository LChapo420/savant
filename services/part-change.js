/**
 * The learner changes a part themselves (modify-all, 7 Nov 2026): shorter, simpler, more examples, another example topic, on the part in front of them, and the choice sticks.
 *
 *   on()                         the switch: PART_CHANGE=on enables it (off by default until its gate passes, docs/MODIFICATION-MAP.md)
 *   prefsOf / record / clear     profiles.part_prefs { shorter, simpler, examples (1 to 3), topic }: read by learning-spec.js gather, so every later lesson, feedback, notes, tutor
 *                                reply and level writer follows it. Stored on the profile row, so account export and deletion already cover it. The learner sees and clears it on the profile.
 *   rewrite({...})               one rewrite of one text: ALWAYS from the stored original, with everything the learner has asked of this text, and held to it (below). Pure but for the llm.
 *   changeItem / changeLesson / changeBlock   apply it to a question's explanation, an uploaded-course lesson, a built-in lesson's block. revert* puts the stored text back.
 *
 * Facts: every number of the original kept; none added (except inside an example the learner asked for); then a model reads it claim by claim against the original (services/part-modify.js
 * fact gate). With "more examples" the example itself is allowed, and the gate asks instead whether anything is wrong. What fails twice is refused and the learner is told. The call goes
 * through services/ai.js (dataClass learner), so the under-13 outside-AI consent rule applies.
 */
const crypto = require('crypto');

const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require
const CHANGES = ['shorter', 'simpler', 'examples', 'topic'];
const on = () => String(process.env.PART_CHANGE || 'off').toLowerCase() === 'on';
const words = (t) => (String(t || '').match(/[A-Za-zÀ-ÿ0-9'-]+/g) || []);
const numbersOf = (t) => new Set((String(t || '').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));
const WORD_NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12' };
const numbersShown = (t) => { const n = numbersOf(t); for (const w of String(t || '').toLowerCase().match(/[a-z]+/g) || []) if (WORD_NUM[w]) n.add(WORD_NUM[w]); return n; };
const cleanTopic = (t) => String(t || '').replace(/[^\p{L}\p{N} '&-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const sentences = (t) => String(t || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
/** A rough reading load: words per sentence plus how long the words are. Only ever compared with the same text before. */
const readingLoad = (t) => { const w = words(t); const s = Math.max(1, sentences(t).length); return w.length ? w.length / s + (5 * w.join('').length) / w.length : 0; };

// ── the preference ──────────────────────────────────────────────────────────
function prefsOf(userId) {
  try { return (lazy('./learner').getProfile(userId) || {}).part_prefs || {}; } catch { return {}; }
}
function record(userId, change, topic = null) {
  if (!CHANGES.includes(change)) return prefsOf(userId);
  const p = { ...prefsOf(userId) };
  if (change === 'topic') { const t = cleanTopic(topic); if (t) p.topic = t; } else p[change] = Math.min(3, (Number(p[change]) || 0) + 1);
  p.at = new Date().toISOString();
  lazy('./learner').saveProfile(userId, { part_prefs: p });
  return p;
}
function clear(userId, key = null) {
  const p = { ...prefsOf(userId) };
  if (key && CHANGES.includes(key)) delete p[key]; else if (!key) for (const k of CHANGES) delete p[k];
  lazy('./learner').saveProfile(userId, { part_prefs: p });
  return p;
}

// ── one rewrite ─────────────────────────────────────────────────────────────
function rulesOf(asked, topic, fallbackTopic = null) {
  const r = [];
  const n = (k) => asked.filter((x) => x === k).length;
  if (n('shorter')) r.push(n('shorter') > 1 ? 'Make it much shorter: the fewest words that still carry every point.' : 'Make it clearly shorter: cut repeats and padding, keep every point.');
  if (n('simpler')) r.push('Use plainer, everyday words and shorter sentences. Replace a hard word with a plain one; keep a term the text is teaching, and say it plainly. One idea per sentence.');
  if (n('examples')) r.push(`Keep every point, and add ${n('examples') > 1 ? 'two short examples' : 'one short example'} of the same idea right after the point it shows, following the same rule. Every step and number in the example must be correct${topic || fallbackTopic ? `; set it in ${topic || fallbackTopic}` : ''}.`);
  // The explanation is about the question's own objects, so they are never renamed ("two model trains are visible" for two counters): a topic adds a comparison. A topic for the example itself comes with "more examples".
  if (topic && !n('examples')) r.push(`Keep the text as it is, its objects included, and add one short comparison from ${topic}, given as a comparison ("like ...") and stating no fact of its own.`);
  return r;
}
const WITH_EXAMPLE_GATE = 'You check a rewrite of a learner-facing text against its original. The learner asked for an added example, so an added example is fine. List the problems:\n- "wrong": anything in the REWRITE that is false, including a mistake in an added example\'s steps or numbers, or an example that does not show the same idea.\n- "dropped": a point the ORIGINAL makes that the REWRITE leaves out.\n- "changed": anything the REWRITE states differently from the ORIGINAL.\nReply with JSON only: {"wrong": [], "dropped": [], "changed": []}.';
function readExampleGate(reply) {
  const j = lazy('./part-modify').firstJson(reply);
  if (!j || !['wrong', 'dropped', 'changed'].some((k) => Array.isArray(j[k]))) return null;
  const problems = ['wrong', 'dropped', 'changed'].flatMap((k) => (Array.isArray(j[k]) ? j[k] : []).filter(Boolean).map((x) => `${k}: ${String(x).slice(0, 200)}`));
  return { ok: !problems.length, problems };
}
const SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };
const BUDGET_MS = Number(process.env.PART_CHANGE_BUDGET_MS || 20000);

/** What is mechanically wrong with a draft, given what was asked. [] means the fact gate may read it. */
function mechanical(original, text, asked, topic) {
  const out = [];
  const t = String(text || '').trim();
  if (!t) return ['empty'];
  const allowNew = asked.includes('examples');
  const have = numbersShown(t);
  for (const n of numbersOf(original)) if (!have.has(n)) out.push(`the number ${n} from the original is missing`);
  if (!allowNew) for (const n of numbersOf(t)) if (!numbersShown(original).has(n)) out.push(`the number ${n} is not in the original`);
  if (asked.includes('shorter') && !allowNew && words(t).length > 0.9 * words(original).length) out.push('it is not shorter than the original: cut more');
  if (asked.includes('simpler') && !allowNew && !asked.includes('topic') && readingLoad(t) > readingLoad(original) + 0.01) out.push('it is not simpler than the original: plainer words and shorter sentences');
  if (allowNew && words(t).length <= words(original).length) out.push('the example asked for is not there');
  if (topic && !String(t).toLowerCase().includes(topic.toLowerCase().split(' ')[0])) out.push(`${topic} does not appear`);
  return out;
}

/**
 * @returns {{ text: string|null, problems: string[], noop?: boolean }} text is null when it was refused (the stored text stays).
 */
async function rewrite({ original, context = '', asked, topic = null, spec = null, llm, gate, fallbackTopic = null }) {
  if (asked.length && asked.every((a) => a === 'shorter') && words(original).length <= 12) return { text: null, problems: [], noop: true };
  const rules = rulesOf(asked, topic, fallbackTopic);
  const specRules = spec && spec.interests && spec.interests.avoidDomains && spec.interests.avoidDomains.length ? [`Never use anything about: ${spec.interests.avoidDomains.join(', ')}.`] : [];
  const system = `You rewrite one piece of a lesson because the learner asked you to. Keep every fact, number and the answer exactly as in the original.${asked.includes('examples') ? '' : ' Add no new fact, rule, definition or tip.'} Never mention the learner. Plain text, no markdown. Return JSON {"text": "..."}.`;
  let problems = null;
  // The learner is waiting: no new try after the budget (a try is one write and two readings).
  const started = Date.now();
  for (let attempt = 0; attempt < 3 && (attempt === 0 || Date.now() - started < BUDGET_MS); attempt += 1) {
    let text = '';
    // eslint-disable-next-line no-await-in-loop
    try { const r = await llm({ system, user: `${context ? `${context}\n\n` : ''}Original:\n${original}\n\nWhat the learner asked for:\n${[...rules, ...specRules].map((x, i) => `${i + 1}. ${x}`).join('\n')}${problems ? `\n\nYour last draft had problems; fix them:\n${problems.map((p) => `- ${p}`).join('\n')}` : ''}`, schema: SCHEMA, schemaName: 'submit', maxTokens: 1500 }); text = r && typeof r.text === 'string' ? r.text.trim() : ''; } catch { text = ''; }
    problems = mechanical(original, text, asked, topic);
    if (!problems.length) {
      // eslint-disable-next-line no-await-in-loop
      const v = await gate({ original, text, withExample: asked.includes('examples'), spec, context });
      if (!v) problems = ['the fact check could not be read'];
      else if (!v.ok) problems = v.problems;
    }
    if (!problems.length) return { text, problems: [] };
  }
  // Only a text that could not be cut is "already short"; a draft refused on its facts is told as that.
  if (String(process.env.PART_CHANGE_LOG || '') === '1') console.warn(`part-change refused: ${JSON.stringify(problems).slice(0, 300)}`);
  return { text: null, problems, noop: asked[asked.length - 1] === 'shorter' && (problems || []).some((p) => /not shorter/.test(p)) };
}

const defaultLlm = (userId) => (a) => lazy('./ai').structured({ role: 'fast', task: 'part_modify', ...a, userId, dataClass: 'learner', effort: 'low' });
/** The fact gate through services/ai.js. null when it cannot be read (never a pass). */
const defaultGate = (userId) => async ({ original, text, withExample, spec, context }) => {
  const pm = lazy('./part-modify');
  try {
    if (withExample) {
      for (const task of ['part_gate_a', 'part_gate_b']) {
        // eslint-disable-next-line no-await-in-loop
        const r = await lazy('./ai').structured({ role: 'fast', task, system: WITH_EXAMPLE_GATE, user: `${context ? `${context}\n\n` : ''}ORIGINAL:\n${original}\n\nREWRITE:\n${text}`, schema: { type: 'object', properties: { wrong: { type: 'array', items: { type: 'string' } }, dropped: { type: 'array', items: { type: 'string' } }, changed: { type: 'array', items: { type: 'string' } } }, required: ['wrong', 'dropped', 'changed'] }, schemaName: 'submit', maxTokens: 600, userId, dataClass: 'learner', effort: 'low' });
        const v = readExampleGate(JSON.stringify(r || null));
        if (!v || !v.ok) return v;
      }
      return { ok: true, problems: [] };
    }
    return await pm.defaultGate(userId)('feedback', { text: original }, text, spec);
  } catch { return null; }
};

const REFUSED = 'That change could not be made without risking a fact, so this text stays as it was. Your choice is kept for what comes next.';
const NOOP = 'This is already about as short as it can be. Your choice is kept for what comes next.';
const reply = (r, stored) => (r.text ? { text: r.text, changed: true } : { text: stored, changed: false, message: r.noop ? NOOP : REFUSED });
const specOf = (userId, topic) => { try { return lazy('./learning-spec').buildSpec(userId, { topic }); } catch { return null; } };

// ── a question's explanation ────────────────────────────────────────────────
async function changeItem(userId, itemId, change, topic = null, { llm = null, gate = null } = {}) {
  const db = lazy('../config/db');
  const item = db.byId('items', itemId);
  if (!item || item.user_id !== userId) return { error: 'Question not found.', status: 404 };
  if (item.correct === null || item.correct === undefined) return { error: 'Answer the question first.', status: 409 };
  if (!item.rationale) return { error: 'There is no explanation to change on this question.', status: 409 };
  const prefs = record(userId, change, topic);
  const asked = [...((item.changed && item.changed.asked) || []), change];
  const useTopic = change === 'topic' ? cleanTopic(topic) : (item.changed && item.changed.topic) || null;
  const context = `Question: ${item.prompt || ''}${item.answer ? `\nCorrect answer: ${item.answer}` : ''}`;
  const r = await rewrite({ original: item.rationale, context, asked, topic: useTopic, spec: specOf(userId, item.skill_name), llm: llm || defaultLlm(userId), gate: gate || defaultGate(userId), fallbackTopic: prefs.topic });
  if (r.text) db.update('items', item.id, { changed: { rationale: r.text, asked, topic: useTopic, at: new Date().toISOString() } });
  return { ...reply(r, lazy('./part-modify').rationaleOf(db.byId('items', item.id))), prefs };
}
function revertItem(userId, itemId) {
  const db = lazy('../config/db');
  const item = db.byId('items', itemId);
  if (!item || item.user_id !== userId) return { error: 'Question not found.', status: 404 };
  db.update('items', item.id, { changed: null });
  return { text: item.rationale, changed: false };
}

// ── an uploaded course's lesson ─────────────────────────────────────────────
async function changeLesson(userId, materialId, skillId, change, topic = null, { llm = null, gate = null } = {}) {
  const db = lazy('../config/db');
  const course = lazy('./course-builder').get(userId, materialId);
  const skill = course && (course.skills || []).find((s) => String(s.id) === String(skillId));
  if (!skill || !skill.lesson || !(skill.lesson.paragraphs || []).length) return { error: 'Lesson not found.', status: 404 };
  const prefs = record(userId, change, topic);
  const original = (skill.lesson.prev || skill.lesson.paragraphs).join('\n\n');
  const asked = [...(skill.lesson.asked || []), change];
  const useTopic = change === 'topic' ? cleanTopic(topic) : skill.lesson.asked_topic || null;
  const r = await rewrite({ original, context: `Lesson: ${skill.title}\nKey points that must stay:\n${(skill.lesson.key_points || []).map((k) => `- ${k}`).join('\n')}`, asked, topic: useTopic, spec: specOf(userId, course.title), llm: llm || defaultLlm(userId), gate: gate || defaultGate(userId), fallbackTopic: prefs.topic });
  if (r.text) {
    const paragraphs = r.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const skills = course.skills.map((s) => (s === skill ? { ...s, lesson: { ...s.lesson, paragraphs, prev: s.lesson.prev || s.lesson.paragraphs, asked, asked_topic: useTopic } } : s));
    db.update('material_courses', course.id, { skills });
    return { paragraphs, changed: true, prefs };
  }
  return { paragraphs: skill.lesson.paragraphs, changed: false, message: r.noop ? NOOP : REFUSED, prefs };
}
function revertLesson(userId, materialId, skillId) {
  const db = lazy('../config/db');
  const course = lazy('./course-builder').get(userId, materialId);
  const skill = course && (course.skills || []).find((s) => String(s.id) === String(skillId));
  if (!skill || !skill.lesson) return { error: 'Lesson not found.', status: 404 };
  if (!skill.lesson.prev) return { paragraphs: skill.lesson.paragraphs, changed: false };
  const { prev, asked, asked_topic: _t, ...rest } = skill.lesson;
  const skills = course.skills.map((s) => (s === skill ? { ...s, lesson: { ...rest, paragraphs: prev } } : s));
  db.update('material_courses', course.id, { skills });
  return { paragraphs: prev, changed: false };
}

// ── a built-in lesson's block ───────────────────────────────────────────────
// Only blocks that carry reading text: a game or an interactive block's strings are its mechanics. Checks have their own route (the item above).
const TEXT_BLOCK = /^(Basic_TextBlock|Basic_Steps|Theory_|Concept_(?!AudioWave|ScaleZoom|SpectrumBar)|Context_|Memory_|Hook_|Trap_CommonError)/;
const SKIP = new Set(['id', 'index', 'type', 'kind', 'tag', 'block', 'color', 'colour', 'icon', 'emoji', 'url', 'src', 'image', 'format', 'level', 'answer', 'correct', 'style', 'variant', 'layout']);
/** Every sentence-bearing string of a block's data with its path. */
function leaves(data, at = [], out = []) {
  if (typeof data === 'string') { if (/[A-Za-zÀ-ÿ]{3,}/.test(data) && data.trim().split(/\s+/).length >= 4) out.push({ path: at, text: data }); return out; }
  if (Array.isArray(data)) { data.forEach((v, i) => leaves(v, [...at, i], out)); return out; }
  if (data && typeof data === 'object') for (const [k, v] of Object.entries(data)) if (!SKIP.has(k)) leaves(v, [...at, k], out);
  return out;
}
const put = (data, path, value) => { const c = JSON.parse(JSON.stringify(data)); let o = c; for (const p of path.slice(0, -1)) o = o[p]; o[path[path.length - 1]] = value; return c; };
const hashOf = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 12);
const COLLECTION = 'part_changes';

async function changeBlock(userId, { plan, ref }, change, topic = null, { llm = null, gate = null } = {}) {
  const db = lazy('../config/db');
  const block = plan && (plan.blocks || []).find((b) => b.index === Number(ref));
  if (!block) return { error: 'That part of the lesson was not found.', status: 404 };
  if (!TEXT_BLOCK.test(block.block)) return { error: 'This kind of block cannot be reworded.', status: 409 };
  const parts = leaves(block.data);
  if (!parts.length) return { error: 'This block has no text to change.', status: 409 };
  const prefs = record(userId, change, topic);
  const row = db.findOne(COLLECTION, (r) => r.user_id === userId && r.plan_id === plan.id && r.ref === block.index);
  const asked = [...((row && row.asked) || []), change];
  const useTopic = change === 'topic' ? cleanTopic(topic) : (row && row.topic) || null;
  const spec = specOf(userId, null);
  const context = `Lesson topic: ${plan.topic || ''}`;
  // Each string of the block is one rewrite, so its shape (a card's title and body, a list of steps) stays what the renderer reads. Only the longest strings carry an example or a topic.
  const longest = parts.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  let data = block.data;
  let done = 0;
  let problems = [];
  for (const p of parts) {
    const here = p === longest ? asked : asked.filter((a) => a !== 'examples');
    if (!here.length || (p !== longest && here.every((a) => a === 'topic'))) continue;
    // eslint-disable-next-line no-await-in-loop
    const r = await rewrite({ original: p.text, context, asked: here, topic: p === longest ? useTopic : null, spec, llm: llm || defaultLlm(userId), gate: gate || defaultGate(userId), fallbackTopic: prefs.topic });
    if (r.text) { data = put(data, p.path, r.text); done += 1; } else if (!r.noop) problems = r.problems;
  }
  if (!done) return { data: row ? row.data : block.data, changed: false, message: problems.length ? REFUSED : NOOP, prefs };
  const fields = { user_id: userId, plan_id: plan.id, ref: block.index, source_hash: hashOf(block.data), data, asked, topic: useTopic, at: new Date().toISOString() };
  if (row) db.update(COLLECTION, row.id, fields); else db.insert(COLLECTION, fields);
  return { data, changed: true, prefs };
}
function revertBlock(userId, { plan, ref }) {
  const db = lazy('../config/db');
  const block = plan && (plan.blocks || []).find((b) => b.index === Number(ref));
  if (!block) return { error: 'That part of the lesson was not found.', status: 404 };
  db.remove(COLLECTION, (r) => r.user_id === userId && r.plan_id === plan.id && r.ref === block.index);
  return { data: block.data, changed: false };
}
/** The learner's own version of a block, when the block is still the one it was changed from. */
function blockData(userId, plan, b) {
  if (!on() || !userId) return b.data;
  try {
    const row = lazy('../config/db').findOne(COLLECTION, (r) => r.user_id === userId && r.plan_id === plan.id && r.ref === b.index);
    return row && row.source_hash === hashOf(b.data) ? row.data : b.data;
  } catch { return b.data; }
}
const changeable = (blockName) => TEXT_BLOCK.test(blockName);

module.exports = {
  CHANGES, on, prefsOf, record, clear, rulesOf, mechanical, rewrite, changeItem, revertItem, changeLesson, revertLesson, changeBlock, revertBlock, blockData, changeable, leaves, readingLoad, readExampleGate, WITH_EXAMPLE_GATE, cleanTopic, COLLECTION,
};
