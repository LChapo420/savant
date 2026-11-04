/**
 * On-demand writing-ahead of the Duolingo-style engine units for Spanish grades 5-57.
 *
 * content/spanish-path/units-g1..g4 hold the written units (phrases, scene, role-play card, fill-the-blank,
 * chat and reading items) for grades 1-4. The owner forbids bulk base builds before the curriculum is tested,
 * so grades 5-57 are written one unit at a time, just ahead of the learner:
 *
 *   ahead(gradeId, level)   called when a learner opens or finishes a level: writes the unit of that level and
 *                           the unit of the next level (and the next unit when the learner is near the end of
 *                           this one), in the background, once each.
 *   writeUnit(...)          draft by a free model (NVIDIA; curriculum text only, never learner data), then
 *                           the same checks the other subjects use before anything is served:
 *                             1. structural checks in code (counts, ¿? ¡! balance, answer index, duplicate options);
 *                             2. every keyed item (fill, chat, reading, scene question, and every phrase as a
 *                                meaning question) re-solved blind by Nemotron Ultra (services/key-gate.js,
 *                                the key withheld); an item the blind solver disagrees with is dropped, and an
 *                                item it cannot answer is dropped too (never kept on no evidence);
 *                             3. a native-speaker review of phrases, scene lines and the role-play card by the
 *                                same judge; a rejected item is dropped (a rejected role-play card drops the card).
 *                           A unit that keeps too little (MIN_*) is not stored and is retried later.
 *   load()                  the stored, checked units; services/spanish/path.js registers them at start-up and
 *                           when one is written, so path.supports()/buildLevel() serve only checked units. A level
 *                           whose unit is not stored yet goes to the ordinary session (the path never dead-ends).
 *
 * Stored in <DB folder>/spanish-units/g<no>/<unit>.json (SPANISH_UNIT_DIR to move it). Each file records which
 * checks it passed. Money (4 Nov 2026): the writer is Coral's DeepSeek V4.1 Flash, then Gonka's DeepSeek V4 Flash (owner credits, capped
 * ledgers), then the free NVIDIA models; the blind solver and the reviewer are Gemini free tier, then Lyceum MiniMax M3, then Gonka's GLM 5.3
 * Flash (other families than the writer), then Nemotron Ultra. The NVIDIA free tier alone timed out on a unit (240 s a call), which is why this was off; with the credit
 * providers a level's units are written in under a minute (scripts/spanish-write-ahead-proof.js). Curriculum text only, never learner
 * data. Standard Compute and Anthropic are never called from here. SPANISH_WRITE_AHEAD=off turns the writing-ahead off.
 */
const fs = require('fs');
const path = require('path');
const curriculum = require('../../config/curriculum');

const ART = ['agua', 'gato', 'perro', 'pan', 'casa', 'libro', 'cafe', 'manzana', 'hotel', 'tren', 'musica', 'sol', 'luna', 'leche', 'mesa', 'telefono'];
const CAST = ['mara', 'tomas', 'rosa', 'diego'];
const PARTNER_NAME = { mara: 'Mara', tomas: 'Tomás', rosa: 'Rosa', diego: 'Diego' };
const TEACHING = /^(Lesson\/Topic|Speaking\/Topic|Listening\/Topic|Reading\/Topic|Writing\/Topic|Pronunciation\/Topic|Game\/Topic)$/;
/** Writers: DeepSeek flash, then GLM flash, at low effort; the judges are Nemotron Ultra (another family). */
const WRITERS = JSON.parse(process.env.SPANISH_WRITER_MODELS || '[{"model":"deepseek-ai/deepseek-v4.1-flash","effort":"low"},{"model":"z-ai/glm-5.3-flash","effort":"low"}]');
/** A unit is stored only when it keeps at least this much after the checks. */
const MIN = { phrases: 10, fills: 3, chats: 2, reads: 1 };

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const nfc = (s) => String(s == null ? '' : s).normalize('NFC').trim();
const gradeNo = (gradeId) => curriculum.getTrack('spanish').grades.findIndex((g) => g.id === gradeId) + 1;

function storeDir() {
  if (process.env.SPANISH_UNIT_DIR) return process.env.SPANISH_UNIT_DIR;
  const base = process.env.DB_FILE ? path.dirname(path.resolve(process.env.DB_FILE)) : path.join(__dirname, '..', '..', 'data');
  return path.join(base, 'spanish-units');
}
const fileOf = (gradeId, unit) => path.join(storeDir(), `g${gradeNo(gradeId)}`, `${unit.replace(/^Unit\s+/, '').replace('.', '_')}.json`);

// ── the spec: what a unit is written from ───────────────────────────────────

function specOf(gradeId, unitLabel) {
  const grade = curriculum.getGrade('spanish', gradeId);
  if (!grade) return null;
  const rows = grade.levels.filter((l) => l.unit === unitLabel);
  if (!rows.length) return null;
  const intro = rows.find((r) => r.type === 'Preview') || rows[0];
  const goal = String(intro.title).replace(/^Unit \d+\.\d+:\s*/, '').trim();
  const keys = ((String(intro.covers).match(/Key phrases: (.*?)\. Hear/) || [])[1] || '').split(' / ').map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const topics = rows.filter((r) => TEACHING.test(`${r.type}/${r.activity}`)).map((r) => ({
    id: slug(r.title.replace(/^(Listening|Speaking|Reading|Writing|Role-Play):\s*/i, '')) || 'topic', title: r.title, covers: String(r.covers || '').slice(0, 200),
  })).filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  const convo = rows.find((r) => r.activity === 'Conversation Lab');
  return {
    grade: gradeId, gradeNo: gradeNo(gradeId), unit: unitLabel, goal, keys, topics, gradeName: grade.name,
    level: String(grade.heading || '').replace(/^Grade \d+:\s*/, '').slice(0, 120),
    skills: grade.skills && grade.skills.length ? grade.skills : ['es_vocab_core'],
    convo: convo ? String(convo.title).replace(/^Conversation Lab:\s*/, '') : null,
  };
}

// ── the draft ───────────────────────────────────────────────────────────────

const MC = (extra = {}) => ({ type: 'object', properties: { choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' }, ...extra } });
function unitSchema(skills) {
  return {
    type: 'object',
    properties: {
      phrases: { type: 'array', items: { type: 'object', properties: { es: { type: 'string' }, en: { type: 'array', items: { type: 'string' } }, alt: { type: 'array', items: { type: 'string' } }, tier: { type: 'integer' }, skill: { type: 'string', enum: skills }, topic: { type: 'string' } }, required: ['es', 'en', 'tier', 'skill', 'topic'] } },
      scene: { type: 'object', properties: { title: { type: 'string' }, art: { type: 'string' }, lines: { type: 'array', items: { type: 'object', properties: { who: { type: 'string', enum: [...CAST, 'narrator'] }, es: { type: 'string' }, en: { type: 'string' } }, required: ['who', 'es', 'en'] } }, questions: { type: 'array', items: { ...MC({ after: { type: 'integer' }, question: { type: 'string' } }), required: ['after', 'question', 'choices', 'answer'] } } }, required: ['title', 'lines', 'questions'] },
      convo: { type: 'object', properties: { partner: { type: 'string', enum: CAST }, setting: { type: 'string' }, learnerCard: { type: 'string' }, learnerCardEs: { type: 'string' }, partnerCard: { type: 'string' }, goals: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } }, targets: { type: 'array', items: { type: 'string' } }, opening: { type: 'string' }, script: { type: 'array', items: { type: 'object', properties: { goal: { type: 'string' }, expect: { type: 'array', items: { type: 'string' } }, reply: { type: 'string' }, hint: { type: 'string' } }, required: ['goal', 'expect', 'reply', 'hint'] } }, nudges: { type: 'object' }, closing: { type: 'string' } }, required: ['partner', 'setting', 'learnerCard', 'learnerCardEs', 'partnerCard', 'goals', 'targets', 'opening', 'script', 'nudges', 'closing'] },
      fills: { type: 'array', items: { ...MC({ before: { type: 'string' }, after: { type: 'string' }, en: { type: 'string' } }), required: ['before', 'after', 'choices', 'answer', 'en'] } },
      chats: { type: 'array', items: { ...MC({ who: { type: 'string', enum: CAST }, es: { type: 'string' } }), required: ['who', 'es', 'choices', 'answer'] } },
      reads: { type: 'array', items: { ...MC({ passage: { type: 'string' }, question: { type: 'string' } }), required: ['passage', 'question', 'choices', 'answer'] } },
    },
    required: ['phrases', 'scene', 'convo', 'fills', 'chats', 'reads'],
  };
}

function genPrompt(spec) {
  const system = `You write Spanish course content for a Duolingo-style app used by English-speaking teenagers and adults. Level of this grade: ${spec.level || spec.gradeName}. Every Spanish string must be correct standard Spanish: all accents and tildes, opening ¿ and ¡, natural phrasing a native speaker would use. Use only Spanish a learner who has finished the earlier units could understand, with this unit's new material in it. Keep English translations natural. Nothing unsuitable for a teenager. Exactly one correct choice in every multiple-choice item; the wrong choices are the usual learner mistakes, all the same kind and length as the right one.`;
  const user = `Write the content for ${spec.unit} of Grade ${spec.gradeNo} (${spec.gradeName}).
Unit goal: ${spec.goal}
Key phrases from the syllabus: ${spec.keys.join(' / ') || '(none)'}
Topics (use these exact ids for each phrase's "topic"):
${spec.topics.map((t) => `- id "${t.id}": ${t.title}. ${t.covers}`).join('\n')}
Role-play scenario: ${spec.convo || 'a short everyday conversation using the unit'}

Write:
- "phrases": 14 to 16, at least 3 per topic. "es", "en" (1-4 accepted English translations, the most natural first), optional "alt" (other equally correct Spanish for the first English meaning), "tier" 1-3 (1 = most useful), "skill" one of ${spec.skills.join(', ')}, "topic".
- "scene": a 6-8 line scene with the cast ${CAST.join(', ')} (at most one "narrator" line) using the unit's phrases; "title" in Spanish; "art" one of ${ART.join(', ')}; 3 "questions" in English about it (each: after = number of lines heard, question, 3 English choices, answer index).
- "convo": a role-play card. "partner" one of ${CAST.join(', ')}; "setting", "learnerCard", "partnerCard" in English; "learnerCardEs" the task in simple Spanish; 3-4 "goals" ({id,text}); "targets" 4-6 Spanish chunks; "opening"; "script" one step per goal ({goal, expect: lowercase word stems the learner may use, reply, hint}); "nudges" an object goal id -> a Spanish prompt; "closing".
- "fills": 4 fill-the-blank items: before + blank + after makes one Spanish sentence; 3 single-word "choices", exactly one correct; "answer" its index; "en" the English of the full sentence.
- "chats": 3 items: a cast member says "es"; 3 Spanish reply "choices", exactly one natural and correct; "answer" index.
- "reads": 2 items: a 2-3 sentence Spanish "passage", an English "question", 3 English "choices", "answer" index.
Do not repeat a Spanish phrase twice in "phrases".`;
  return { system, user };
}

// ── structural checks ───────────────────────────────────────────────────────

const balanced = (t) => (t.match(/¿/g) || []).length === (t.match(/\?/g) || []).length && (t.match(/¡/g) || []).length === (t.match(/!/g) || []).length;
const okMc = (x) => Array.isArray(x.choices) && x.choices.length >= 2 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.choices.length && new Set(x.choices.map((c) => nfc(c).toLowerCase())).size === x.choices.length;

function structural(draft, spec) {
  const problems = [];
  const topicIds = new Set(spec.topics.map((t) => t.id));
  const fallbackTopic = spec.topics[0] ? spec.topics[0].id : 'topic';
  const seen = new Set();
  draft.phrases = (draft.phrases || []).filter((p) => {
    if (!p || !p.es || !Array.isArray(p.en) || !p.en.length || !balanced(p.es)) { problems.push(`phrase ${p && p.es}`); return false; }
    if (![1, 2, 3].includes(p.tier)) p.tier = 2;
    if (!topicIds.has(p.topic)) p.topic = fallbackTopic;
    if (!spec.skills.includes(p.skill)) p.skill = spec.skills[0];
    const k = nfc(p.es).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (const list of ['fills', 'chats', 'reads']) {
    draft[list] = (draft[list] || []).filter((x) => { const ok = okMc(x) && (list !== 'chats' || balanced(x.es || '')) && (list !== 'fills' || (x.before != null && x.after != null && x.en)); if (!ok) problems.push(`${list} item`); return ok; });
  }
  const sc = draft.scene || { lines: [], questions: [] };
  sc.art = ART.includes(sc.art) ? sc.art : 'casa';
  sc.lines = (sc.lines || []).filter((l) => l && l.es && l.en && balanced(l.es));
  sc.questions = (sc.questions || []).filter((q) => okMc(q) && q.after >= 1 && q.after <= sc.lines.length);
  draft.scene = sc;
  const cv = draft.convo || {};
  if (!Array.isArray(cv.goals) || cv.goals.length < 3 || !Array.isArray(cv.script) || cv.script.length !== cv.goals.length || !cv.opening) draft.convo = null;
  if (draft.phrases.length < MIN.phrases) problems.push(`only ${draft.phrases.length} phrases`);
  return problems;
}

// ── the checks ──────────────────────────────────────────────────────────────

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

/** Every keyed item as {id, prompt, choices, answer} for the blind re-solve. */
function keyedItems(draft) {
  const out = [];
  draft.fills.forEach((f, i) => out.push({ id: `F${i + 1}`, prompt: `Complete the Spanish sentence: ${f.before} ___ ${f.after}  (English: ${f.en})`, choices: f.choices.map(nfc), answer: nfc(f.choices[f.answer]) }));
  draft.chats.forEach((c, i) => out.push({ id: `C${i + 1}`, prompt: `In a Spanish conversation someone says: "${c.es}" Which reply is the natural, correct one?`, choices: c.choices.map(nfc), answer: nfc(c.choices[c.answer]) }));
  draft.reads.forEach((r, i) => out.push({ id: `R${i + 1}`, prompt: `Read: "${r.passage}"\n${r.question}`, choices: r.choices.map(nfc), answer: nfc(r.choices[r.answer]) }));
  const heard = (n) => draft.scene.lines.slice(0, n).map((l) => l.es).join(' ');
  draft.scene.questions.forEach((q, i) => out.push({ id: `Q${i + 1}`, prompt: `Spanish scene: "${heard(q.after)}"\n${q.question}`, choices: q.choices.map(nfc), answer: nfc(q.choices[q.answer]) }));
  // Every phrase as a meaning question: the first English meaning against three others of the unit.
  draft.phrases.forEach((p, i) => {
    const others = draft.phrases.filter((o, j) => j !== i && nfc(o.en[0]).toLowerCase() !== nfc(p.en[0]).toLowerCase()).sort((a, b) => hash(`${p.es}|${a.es}`) - hash(`${p.es}|${b.es}`)).slice(0, 3);
    if (others.length === 3) out.push({ id: `P${i + 1}`, prompt: `What does the Spanish “${p.es}” mean?`, choices: [nfc(p.en[0]), ...others.map((o) => nfc(o.en[0]))].sort((a, b) => hash(a) - hash(b)), answer: nfc(p.en[0]) });
  });
  return out;
}

const REVIEW_SCHEMA = { type: 'object', properties: { rejects: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, problem: { type: 'string' } }, required: ['id', 'problem'] } } }, required: ['rejects'] };

/** Items a native-speaker review looks at (no key to re-solve): scene lines and the role-play card. Phrases too, for the English. */
function reviewItems(draft) {
  const out = [];
  draft.phrases.forEach((p, i) => out.push({ id: `P${i + 1}`, text: `PHRASE es: "${p.es}"${p.alt && p.alt.length ? ` (also accepted: ${p.alt.map((a) => `"${a}"`).join(', ')})` : ''} = en: ${p.en.map((e) => `"${e}"`).join(' / ')}` }));
  draft.scene.lines.forEach((l, i) => out.push({ id: `S${i + 1}`, text: `SCENE LINE ${i + 1} (${l.who}): "${l.es}" = "${l.en}"` }));
  if (draft.convo) {
    const cv = draft.convo;
    out.push({ id: 'V1', text: `ROLE-PLAY opening "${cv.opening}"; learner task (es) "${cv.learnerCardEs}"; targets ${cv.targets.map((t) => `"${t}"`).join(', ')}; partner replies ${cv.script.map((s) => `"${s.reply}"`).join(', ')}; hints ${cv.script.map((s) => `"${s.hint}"`).join(', ')}` });
  }
  return out;
}

/**
 * One structured call on the credit providers, in order (curriculum text only): the first that is enabled and answers wins.
 * `order` is a list of {name, model}; a ledger stop or a failure moves on to the next, and null means none answered.
 */
async function creditCall(order, args) {
  for (const o of order) {
    let p = null;
    try { const mod = require(`../providers/${o.name}`); p = mod[o.name] || mod; } catch { continue; } // eslint-disable-line global-require, import/no-dynamic-require
    if (!p || !p.isEnabled || !p.isEnabled()) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await p.structured({ ...args, model: o.model, task: 'spanish_write_ahead' });
      if (r && r.data) return r;
    } catch (err) { console.warn(`spanish write-ahead: ${o.name} gave no answer (${String(err && err.message).slice(0, 120)}); trying the next`); }
  }
  return null;
}
const WRITER_ORDER = [{ name: 'coral', model: process.env.SPANISH_CORAL_MODEL || undefined }, { name: 'gonka', model: undefined }];
// Judges are fast non-reasoning calls of other families than the writer (DeepSeek): Gemini free tier, Lyceum MiniMax M3, then Gonka GLM 5.3 Flash
// (a reasoning model: it timed out at 60 s on a 20-item batch, so it is the last credit fallback).
const JUDGE_ORDER = [{ name: 'gemini', model: undefined }, { name: 'lyceum', model: 'minimax/minimax-m3' }, { name: 'gonka', model: process.env.SPANISH_JUDGE_MODEL || 'zai-org/GLM-5.3-Flash' }];
const JUDGE_SYSTEM = 'You answer multiple-choice questions for a school course. For each question, work it out yourself and give the index (0-based) of the one option you believe is correct. You are not told the answer key.';
const JUDGE_SCHEMA = { type: 'object', properties: { picks: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' } }, required: ['index', 'chosen_index'] } } }, required: ['picks'] };

/** The blind solver: Gemini, Lyceum MiniMax, Gonka GLM (none the writer's family), then the app's usual Nemotron judge. */
async function defaultJudge(batch) {
  const user = `${batch.map((q, i) => `Question ${i}: ${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`).join('\n\n')}\n\nReturn one pick per question, with its index.`;
  const r = await creditCall(JUDGE_ORDER, { role: 'check', system: JUDGE_SYSTEM, user, schema: JUDGE_SCHEMA, schemaName: 'submit_picks', maxTokens: 6000, timeoutMs: 60000 });
  if (r) {
    const by = new Map((r.data.picks || []).map((p) => [p.index, p.chosen_index]));
    const picks = batch.map((_, i) => (Number.isInteger(by.get(i)) ? by.get(i) : null));
    if (picks.some((x) => x !== null)) return picks;
  }
  return require('../key-gate').nemotronJudge(batch); // eslint-disable-line global-require
}

async function defaultReview(spec, items) {
  // eslint-disable-next-line global-require
  const nvidia = require('../providers/nvidia');
  const system = 'You are a strict native-speaker reviewer of Spanish teaching content. You find real errors only.';
  const user = `Review these items for ${spec.unit} of "${spec.gradeName}" (${spec.goal}).
Reject an item only for a real error: a spelling or accent mistake, wrong gender/number agreement or article, a wrong verb form, English that does not mean what the Spanish says (or an accepted alternative that means something else), or unnatural Spanish no native speaker would say. Do NOT reject for style, or for regional variation that is correct somewhere.

${items.map((it) => `${it.id}: ${it.text}`).join('\n')}

Reply {"rejects":[{"id":"…","problem":"…"}]} listing only items with a real error (empty if none).`;
  const viaCredit = await creditCall(JUDGE_ORDER, { role: 'check', system, user, schema: REVIEW_SCHEMA, schemaName: 'verdicts', maxTokens: 6000, timeoutMs: 60000 });
  if (viaCredit) return (viaCredit.data.rejects || []).map((r) => String(r.id).trim());
  const out = await nvidia.structured({ role: 'check', system, user, schema: REVIEW_SCHEMA, schemaName: 'verdicts', maxTokens: 2500, models: [{ model: process.env.KEY_GATE_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], timeoutMs: 150000, attempts: 2 });
  return (out.data.rejects || []).map((r) => String(r.id).trim());
}

/**
 * The checks. `judge(batch)` answers keyed items blind (default: key-gate's Nemotron Ultra); `review(spec, items)` returns the
 * ids a reviewer rejects. Returns {drop:Set, unjudged:number, agreed:number, disagreed:number, reviewed:boolean}.
 */
async function checkDraft(draft, spec, { judge = null, review = defaultReview } = {}) {
  // eslint-disable-next-line global-require
  const keyGate = require('../key-gate');
  const drop = new Set();
  const keyed = keyedItems(draft);
  let agreed = 0; let disagreed = 0; let unjudged = 0;
  // The blind re-solve (batches of 20) and the native-speaker review (batches of 30) run side by side: they read the same draft and
  // neither needs the other, so a unit waits for the slowest call, not the sum.
  const solving = Promise.all(Array.from({ length: Math.ceil(keyed.length / 20) }, async (_, k) => {
    const batch = keyed.slice(k * 20, k * 20 + 20);
    let res = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      res = await keyGate.blindResolve(batch.map((q) => ({ prompt: q.prompt, choices: q.choices, answer: q.answer })), { judge: judge || defaultJudge });
      if (res.some((r) => r.verdict !== 'unjudged')) break;
    }
    res.forEach((r, j) => {
      if (r.verdict === 'agreed') agreed++;
      else { if (r.verdict === 'disagreed') disagreed++; else unjudged++; drop.add(batch[j].id); }
    });
  }));
  let reviewed = true;
  const reviewing = (async () => {
    try {
      const items = reviewItems(draft);
      const parts = Array.from({ length: Math.ceil(items.length / 30) }, (_, k) => items.slice(k * 30, k * 30 + 30));
      for (const ids of await Promise.all(parts.map((part) => review(spec, part)))) for (const id of ids) drop.add(id);
    } catch { reviewed = false; }
  })();
  await Promise.all([solving, reviewing]);
  return { drop, agreed, disagreed, unjudged, reviewed };
}

/** The unit in units-g*.js shape, without the dropped items. */
function finalUnit(spec, draft, drop) {
  const keep = (prefix, list) => list.filter((_, i) => !drop.has(`${prefix}${i + 1}`));
  const kept = draft.scene.lines.map((l, i) => ({ l, i })).filter(({ i }) => !drop.has(`S${i + 1}`));
  const questions = keep('Q', draft.scene.questions).filter((q) => !drop.has(`S${q.after}`)).map((q) => ({ ...q, after: kept.filter((k) => k.i < q.after).length })).filter((q) => q.after >= 1);
  const prefix = `g${spec.gradeNo}u${spec.unit.replace(/^Unit\s+\d+\./, '')}_`;
  const ids = new Set();
  const phrases = keep('P', draft.phrases).map((p) => {
    let id = `${prefix}${slug(p.es)}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    const o = { id, es: p.es, en: p.en };
    if (p.alt && p.alt.length) o.alt = p.alt;
    return Object.assign(o, { tier: p.tier, skill: p.skill, topic: p.topic });
  });
  const cv = draft.convo && !drop.has('V1') ? draft.convo : null;
  return {
    unit: spec.unit, grade: spec.grade, goal: spec.goal,
    topics: spec.topics.map((t) => ({ id: t.id, title: t.title })),
    phrases,
    scene: { title: draft.scene.title, art: draft.scene.art, lines: kept.map(({ l }, i) => ({ who: l.who, es: l.es, en: l.en, ...(i === 0 ? { art: draft.scene.art } : {}) })), questions: questions.map((q) => ({ after: q.after, question: q.question, choices: q.choices, answer: q.answer })) },
    convo: cv ? { partner: cv.partner, partnerName: PARTNER_NAME[cv.partner], setting: cv.setting, learnerCard: cv.learnerCard, learnerCardEs: cv.learnerCardEs, partnerCard: cv.partnerCard, goals: cv.goals, targets: cv.targets, opening: cv.opening, script: cv.script, nudges: cv.nudges || {}, fallbackReply: '¿Perdón? ¿Puedes repetir, por favor?', closing: cv.closing, maxTurns: 10 } : null,
    fills: keep('F', draft.fills).map((x) => ({ before: x.before, after: x.after, choices: x.choices, answer: x.answer, en: x.en })),
    chats: keep('C', draft.chats).map((x) => ({ lines: [{ who: x.who, es: x.es }], choices: x.choices, answer: x.answer })),
    reads: keep('R', draft.reads).map((x) => ({ passage: x.passage, question: x.question, choices: x.choices, answer: x.answer })),
  };
}

async function defaultWriter(spec) {
  // eslint-disable-next-line global-require
  const nvidia = require('../providers/nvidia');
  const { system, user } = genPrompt(spec);
  const viaCredit = await creditCall(WRITER_ORDER, { system, user, schema: unitSchema(spec.skills), schemaName: 'submit_unit', maxTokens: 9000, timeoutMs: 120000 });
  if (viaCredit) return viaCredit.data;
  const out = await nvidia.structured({ role: 'blocks', models: WRITERS, system, user, schema: unitSchema(spec.skills), schemaName: 'submit_unit', maxTokens: 9000, timeoutMs: 240000, attempts: 1 });
  return out.data;
}

const inflight = new Map();

/**
 * Write, check and store one unit. `writer(spec)` returns a draft; tests pass fakes for `writer`, `judge` and `review`.
 * Resolves to the stored unit, or null when it did not keep enough (nothing is stored then).
 */
async function writeUnit(gradeId, unitLabel, opts = {}) {
  const spec = specOf(gradeId, unitLabel);
  if (!spec || !spec.topics.length) return null;
  const draft = await (opts.writer || defaultWriter)(spec);
  if (!draft) return null;
  structural(draft, spec);
  if (draft.phrases.length < MIN.phrases) return null;
  const checks = await checkDraft(draft, spec, opts);
  if (!checks.reviewed && !opts.allowUnreviewed) return null;
  const unit = finalUnit(spec, draft, checks.drop);
  if (unit.phrases.length < MIN.phrases || unit.fills.length < MIN.fills || unit.chats.length < MIN.chats || unit.reads.length < MIN.reads) return null;
  const file = fileOf(gradeId, unitLabel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record = { status: 'checked', written_at: new Date().toISOString(), checks: { blind_agreed: checks.agreed, blind_disagreed_dropped: checks.disagreed, unjudged_dropped: checks.unjudged, reviewed: checks.reviewed, dropped_ids: [...checks.drop] }, unit };
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(record, null, 1));
  fs.renameSync(`${file}.tmp`, file);
  return hydrate(unit);
}

/** Topic matchers are regexes in the engine files; stored units keep the title. */
function hydrate(unit) {
  return { ...unit, topics: unit.topics.map((t) => ({ id: t.id, match: new RegExp(esc(t.title), 'i') })) };
}

function isStored(gradeId, unitLabel) { return fs.existsSync(fileOf(gradeId, unitLabel)); }

/** Make sure one unit is written (once, even when asked for in parallel). Resolves to the unit or null. */
function ensure(gradeId, unitLabel, opts = {}) {
  const key = `${gradeId}|${unitLabel}`;
  if (isStored(gradeId, unitLabel) && !opts.force) return Promise.resolve(null);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let unit = null;
    for (let attempt = 0; attempt < (opts.attempts || 2) && !unit; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      unit = await writeUnit(gradeId, unitLabel, opts).catch(() => null);
    }
    if (unit) { try { require('./path').registerUnit(unit); } catch { /* path not loaded in a bare script */ } } // eslint-disable-line global-require
    return unit;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** The units a learner at `level` of the grade needs written: this level's, the next level's, and the next unit's when near the end. */
function unitsAhead(gradeId, level) {
  const grade = curriculum.getGrade('spanish', gradeId);
  if (!grade) return [];
  const at = grade.levels.findIndex((l) => l.level === level);
  if (at < 0) return [];
  const labels = [];
  const add = (row) => { if (row && /^Unit \d+\.\d+$/.test(row.unit) && !labels.includes(row.unit)) labels.push(row.unit); };
  add(grade.levels[at]);
  add(grade.levels[at + 1]);
  const rowUnit = grade.levels[at].unit;
  const rest = grade.levels.slice(at).filter((l) => l.unit === rowUnit).length;
  if (rest <= 4) { const nxt = grade.levels.slice(at).find((l) => l.unit !== rowUnit); add(nxt); }
  return labels;
}

/** Fire-and-forget: write whatever the learner will need next. Static grades (1-4) are never written here. */
function ahead(gradeId, level, opts = {}) {
  // ON BY DEFAULT since 4 Nov 2026 (Coral and Gonka write and check a level's units in under a minute, scripts/spanish-write-ahead-proof.js);
  // SPANISH_WRITE_AHEAD=off turns it off and grades 5-57 go to the ordinary session (checked content); stored, checked units are still served.
  if (gradeNo(gradeId) < 5 || String(process.env.SPANISH_WRITE_AHEAD || '').toLowerCase() === 'off') return Promise.resolve([]);
  const pending = unitsAhead(gradeId, level).filter((u) => !isStored(gradeId, u)).map((u) => ensure(gradeId, u, opts));
  return Promise.all(pending);
}

/** Every stored, checked unit (hydrated). */
function load() {
  const out = [];
  const root = storeDir();
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch { return out; }
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(root, d, f), 'utf8'));
        if (rec.status === 'checked' && rec.unit && rec.unit.phrases) out.push(hydrate(rec.unit));
      } catch { /* a half-written or damaged file is skipped, never served */ }
    }
  }
  return out;
}

module.exports = { unitSchema, defaultJudge, defaultReview, specOf, structural, keyedItems, checkDraft, finalUnit, writeUnit, ensure, ahead, unitsAhead, load, isStored, storeDir, MIN, genPrompt };
