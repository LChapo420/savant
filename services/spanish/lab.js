/**
 * The Spanish test lab: every curriculum level type with sample content.
 *
 * Levels are kept here with their answers. What a browser receives is a
 * public copy with answers stripped (except quick games, which check locally),
 * and per-learner assembly applied for the bank-driven engines (unit check,
 * exams). Answers are checked by `check()`, the same path real levels will use.
 */
const grade = require('../../public/spanish/js/shared/grade');

const LEVELS = [
  ...require('../../config/spanish/lab/lessons'),
  ...require('../../config/spanish/lab/activities'),
  ...require('../../config/spanish/lab/assessments'),
  ...require('../../config/spanish/lab/games'),
];
const { BANK } = require('../../config/spanish/lab/assessments');

const byId = new Map(LEVELS.map((l) => [l.id, l]));
const bankById = new Map(BANK.map((b) => [b.id, b]));

// Every gradable item in a level, by id (walks nested stories, sections, units).
const itemIndex = new Map();
function indexItems(levelId, node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => indexItems(levelId, n)); return; }
  if (node.id && node.kind) itemIndex.set(`${levelId}:${node.id}`, node);
  for (const v of Object.values(node)) if (v && typeof v === 'object') indexItems(levelId, v);
}
for (const l of LEVELS) indexItems(l.id, l);
// Bank items are reachable from every bank-driven level.
for (const l of LEVELS) if (['unit_check', 'exam'].includes(l.engine)) for (const b of BANK) itemIndex.set(`${l.id}:${b.id}`, b);

function list() {
  return LEVELS.map((l) => ({
    id: l.id, engine: l.engine, game: l.game || null, title: l.title, cefr: l.cefr, csv: l.csv, duolingo: l.duolingo,
  }));
}

const SECRET = new Set(['answer', 'accepted', 'wrong', 'model', 'partnerCard', 'script', 'nudges', 'fallbackReply', 'closing', 'correctAsIs']);

function strip(node) {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (SECRET.has(k)) continue;
    out[k] = strip(v);
  }
  return out;
}

function shuffle(a, seed = Date.now()) {
  const arr = [...a]; let s = seed % 2147483647 || 1;
  for (let i = arr.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// Unit check: due reviews first, then items tagged with a weak spot, then the rest.
function assembleCheck(level) {
  const due = level.learner.due.map((id) => bankById.get(id)).filter(Boolean);
  const weak = BANK.filter((b) => !due.includes(b) && b.tags.some((t) => level.learner.weak.includes(t)));
  const rest = shuffle(BANK.filter((b) => !due.includes(b) && !weak.includes(b)));
  const picked = [...due, ...weak, ...rest].slice(0, level.count);
  return shuffle(picked).map((b) => ({ ...b, why: due.includes(b) ? 'due' : weak.includes(b) ? 'weak' : 'review' }));
}

// Exam sections: pick from each pool, weak-spot items first when the level is weighted.
function assembleExam(level) {
  const weak = (level.learner && level.learner.weak) || [];
  return level.sections.map((sec) => {
    if (sec.task) return { ...sec };
    const pool = sec.from.map((id) => bankById.get(id)).filter(Boolean);
    const ordered = [...pool.filter((b) => b.tags.some((t) => weak.includes(t))), ...shuffle(pool.filter((b) => !b.tags.some((t) => weak.includes(t))))];
    return { ...sec, items: shuffle(ordered.slice(0, sec.pick)), from: undefined };
  });
}

function publicLevel(id) {
  const level = byId.get(id);
  if (!level) return null;
  let view = { ...level };
  if (level.engine === 'unit_check') view = { ...view, items: assembleCheck(level), bank: undefined };
  if (level.engine === 'exam') view = { ...view, sections: assembleExam(level) };
  if (level.clientAnswers) return JSON.parse(JSON.stringify(view));
  return strip(JSON.parse(JSON.stringify(view)));
}

function itemFor(levelId, itemId) { return itemIndex.get(`${levelId}:${itemId}`) || null; }

const sentence = (before, mid, after) => [before, mid, after].filter((x) => x !== undefined && x !== '').join(' ').replace(/\s+([,.?!])/g, '$1').replace(/¿ /g, '¿');

/**
 * Check one answer.
 * @returns {{correct: boolean, note?: string, solution: string, tokens?: object[], score?: number}}
 */
function check(levelId, itemId, response) {
  const item = itemFor(levelId, itemId);
  if (!item) return null;
  const r = response || {};
  switch (item.kind) {
    case 'select_image': case 'listen_image':
      return { correct: r.index === item.answer, solution: item.choices[item.answer].es };
    case 'select_meaning': case 'select_translation': case 'listen_choose': case 'listen_meaning':
    case 'listen_meaning_clip': case 'read_respond': case 'complete_chat':
      return { correct: r.index === item.answer, solution: item.choices[item.answer] };
    case 'fill_choice':
      return { correct: r.index === item.answer, solution: sentence(item.before, item.choices[item.answer], item.after) };
    case 'minimal_pair':
      return { correct: r.index === item.answer, solution: item.pair[item.answer] };
    case 'translate': case 'tap_heard': case 'type_heard': {
      const g = grade.check(r.text, item.accepted);
      return { correct: g.correct, note: g.note, solution: item.accepted[0], closest: g.closest };
    }
    case 'complete_translation': {
      const g = grade.check(r.text, item.accepted);
      return { correct: g.correct, note: g.note, solution: sentence(item.before, item.accepted[0], item.after) };
    }
    case 'fix_sentence': {
      const fixed = item.tokens.map((t, i) => (i === item.wrong ? item.choices[item.answer] : t)).join(' ');
      return { correct: r.wrong === item.wrong && r.fix === item.answer, wrongPicked: r.wrong === item.wrong, solution: fixed, wrongIndex: item.wrong };
    }
    case 'speak': case 'record_compare': {
      const s = grade.speech(r.transcript || '', item.es, item.accepted);
      return { correct: s.pass, score: s.score, missing: s.missing, solution: item.es };
    }
    default:
      return null;
  }
}

function sayFor(levelId, itemId) {
  const item = itemFor(levelId, itemId);
  if (!item) return null;
  if (item.kind === 'minimal_pair') return item.pair[item.answer];
  return item.es || null;
}

function dictationCheck(levelId, lineId, text) {
  const level = byId.get(levelId);
  const line = level && level.lines && level.lines.find((l) => l.id === lineId);
  if (!line) return null;
  const d = grade.diff(text, line.es);
  const correct = d.tokens.every((t) => t.tag === 'ok' || t.tag === 'accent');
  return { correct, score: d.score, tokens: d.tokens, solution: line.es };
}

// Where a level keeps its writing / recording / conversation config.
function writingFor(levelId, taskId) {
  const level = byId.get(levelId);
  if (!level) return null;
  if (!taskId) return level.writing ? { level, writing: level.writing } : null;
  const sec = (level.sections || []).find((s) => s.task && s.task.id === taskId);
  return sec && sec.task.writing ? { level, writing: sec.task.writing } : null;
}
function recordingFor(levelId, taskId) {
  const level = byId.get(levelId);
  if (!level) return null;
  if (!taskId) return level.record ? { level, record: level.record } : null;
  const sec = (level.sections || []).find((s) => s.task && s.task.id === taskId);
  return sec ? { level, record: sec.task } : null;
}
function scenarioFor(levelId, part) {
  const level = byId.get(levelId);
  if (!level) return null;
  const scenario = part === 'exchange' ? level.exchange : part === 'standIn' ? level.standIn : level.scenario;
  return scenario ? { ...level, scenario } : null;
}

module.exports = { list, publicLevel, check, sayFor, dictationCheck, writingFor, recordingFor, scenarioFor, byId, LEVELS };
