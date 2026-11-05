/**
 * Interest theming of bank practice items (open item in services/sessions.js applySpecRamp).
 *
 * When a learner has an interest (profile, survey, tutor facts: learning-spec interests.exampleDomains), a bank
 * practice item is restyled into it (a word problem about basketball or cooking) WITHOUT changing the skill, the
 * numbers, the options or the key. Only the stem is rewritten; choices, answer and every number stay exactly as the
 * bank wrote them.
 *
 * Written ahead, served instantly: themed items are authored in the background into a pool shared by interest
 * (key skill|difficulty|domain, so no learner words are stored or sent, only a topic word like "basketball"), at
 * twice what a sitting needs. materialize() takes a ready themed item when one exists and otherwise serves the
 * base item; nothing waits on a model. THEME_ITEMS=off turns it off.
 *
 * A themed item is stored only when ALL gates pass (never weakened to raise the numbers):
 *   1. deterministic: the same numbers (as a multiset) in the stem, the stem is not empty, the stem is 0.6x-3x the
 *      length of the original, choices and answer untouched, no key leaked into the stem;
 *   2. an independent blind re-solve (services/key-gate.js blindResolve for multiple choice; the same Nemotron
 *      judge answering a typed question) must agree with the ORIGINAL key;
 *   2b. a second blind re-solve by another family (GLM through Gonka, else Lyceum) must also agree; any disagreement rejects.
 *   3. a judge from another family (Nemotron, not the GLM / DeepSeek / MiniMax writers) must say the theme kept the
 *      skill and the difficulty and is natural for the interest.
 */
const db = require('../config/db');
const bank = require('../content/bank');

const on = () => String(process.env.THEME_ITEMS || 'on').toLowerCase() !== 'off';
const TRACKS = () => String(process.env.THEME_TRACKS || 'math,iq').split(',').map((s) => s.trim()).filter(Boolean);
const POOL_MAX = 8;
const SURPLUS = 2; // "2x just enough"
const inflight = new Set();

const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 '&-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const numbersOf = (s) => (String(s || '').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(/,/g, '')).sort().join('|');
const poolKey = (skillId, difficulty, domain) => `${skillId}|${Math.round(difficulty)}|${clean(domain)}`;

/** The interest to theme this learner's items in, or null (no interest, wrong track, off, no consent for outside AI). */
function domainFor(userId, session) {
  if (!on() || !userId || !session || !TRACKS().includes(session.track_id)) return null;
  try {
    // eslint-disable-next-line global-require
    if (require('../config/owner').ownerBase(userId)) return null;
    // eslint-disable-next-line global-require
    if (!require('./typed-grading').outsideAllowed(userId)) return null;
    // eslint-disable-next-line global-require
    const spec = require('./learning-spec').buildSpec(userId, { trackId: session.track_id, gradeId: session.grade_id, topic: null, skillIds: [] });
    if (!spec || spec.isDefault || !spec.interests || !(spec.interests.share >= 0.3)) return null;
    const d = (spec.interests.exampleDomains || []).map(clean).filter(Boolean)[0];
    return d || null;
  } catch { return null; }
}

/** A bank item that can be themed: a short stem, no passage, multiple choice or typed. */
function themable(item) {
  if (!item || !item.prompt || item.passage) return false;
  if (item.format !== 'multiple_choice' && item.format !== 'type_in') return false;
  return String(item.prompt).length <= 400;
}

/** Deterministic checks. Returns a reason string when the themed stem is rejected, else null. */
function stemProblem(item, stem) {
  const s = String(stem || '').trim();
  if (!s) return 'empty stem';
  if (s === String(item.prompt).trim()) return 'unchanged';
  const ratio = s.length / Math.max(1, String(item.prompt).length);
  if (ratio < 0.6 || ratio > 3) return 'length changed too much';
  if (numbersOf(s) !== numbersOf(item.prompt)) return 'numbers changed';
  if (item.format === 'type_in' && /answer\s*(is|=)/i.test(s)) return 'leaks the answer';
  if (item.format === 'multiple_choice' && (item.choices || []).length && !(item.choices || []).every((c) => String(c).length < 80)) return 'choices too long';
  return null;
}

const WRITER_SCHEMA = {
  type: 'object',
  properties: { themable: { type: 'boolean' }, prompt: { type: 'string' } },
  required: ['themable', 'prompt'],
  additionalProperties: false,
};
const WRITER_SYSTEM = 'You restyle a practice question into a learner\'s interest. Keep the SAME skill, the SAME numbers (each one exactly once, none added, none dropped), the SAME operations and difficulty, and an answer identical to the original; the setting adds no quantity of its own. Do not change or mention the options or the answer. Write the question stem only, in plain text, about as long as the original. If the question has no natural word-problem form in that interest without changing what it tests (a bare calculation, a pure pattern, a grammar rule), return themable false and repeat the original.';

async function write(item, domain, { userId, dataClass }) {
  const ai = require('./ai'); // eslint-disable-line global-require
  const opts = (item.format === 'multiple_choice' ? `Options (do not change): ${(item.choices || []).join(' | ')}\n` : '');
  const user = `Interest: ${domain}\nOriginal question: ${item.prompt}\n${opts}Correct answer (must stay correct): ${item.answer}\nReturn the restyled stem.`;
  const r = await ai.structured({ role: 'blocks', task: 'theme', system: WRITER_SYSTEM, user, schema: WRITER_SCHEMA, schemaName: 'themed_stem', maxTokens: 700, userId: userId || undefined, dataClass: dataClass || 'learner' });
  if (!r || r.themable !== true || typeof r.prompt !== 'string') return null;
  return r.prompt.trim();
}

const SOLVE_SCHEMA = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] };
const normAns = (s) => String(s == null ? '' : s).toLowerCase().replace(/[−–]/g, '-').replace(/[\s,$]+/g, '').replace(/\.0+$/, '');

/** Blind re-solve of the themed item: 'agreed' | 'disagreed' | 'unjudged' against the ORIGINAL key. */
async function resolve(item, stem, { solver } = {}) {
  const themed = { ...item, prompt: stem };
  if (solver) return solver(themed);
  if (item.format === 'multiple_choice') {
    // eslint-disable-next-line global-require
    const [r] = await require('./key-gate').blindResolve([{ prompt: stem, choices: item.choices, answer: item.answer }]);
    return r ? r.verdict : 'unjudged';
  }
  try {
    // eslint-disable-next-line global-require
    const nvidia = require('./providers/nvidia');
    const out = await nvidia.structured({ role: 'check', system: 'Solve the question yourself. Reply with only the final answer.', user: stem, schema: SOLVE_SCHEMA, schemaName: 'submit_answer', maxTokens: 3000, models: [{ model: process.env.KEY_GATE_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], timeoutMs: 120000, attempts: 2 });
    const a = out && out.data && out.data.answer;
    if (a == null) return 'unjudged';
    return normAns(a) === normAns(item.answer) ? 'agreed' : 'disagreed';
  } catch { return 'unjudged'; }
}

const SECOND_MODELS = () => [
  { provider: 'gonka', model: process.env.THEME_SOLVE2_GONKA || 'zai-org/GLM-5.3-Flash' },
  { provider: 'lyceum', model: process.env.THEME_SOLVE2_LYCEUM || 'z-ai/glm-5.3' },
];

/** The same blind re-solve by a second model family (GLM): Gonka first, Lyceum if Gonka gives nothing. */
async function resolve2(item, stem, { solver2 } = {}) {
  const themed = { ...item, prompt: stem };
  if (solver2) return solver2(themed);
  const mc = item.format === 'multiple_choice';
  const user = mc ? [stem, ...item.choices.map((c, j) => `(${j}) ${c}`)].join(String.fromCharCode(10)) : stem;
  const schema = mc ? { type: 'object', properties: { index: { type: 'integer' } }, required: ['index'] } : SOLVE_SCHEMA;
  const system = mc ? 'Work the question out yourself and give the 0-based index of the one correct option. You are not told the key.' : 'Solve the question yourself. Reply with only the final answer.';
  for (const { provider, model } of SECOND_MODELS()) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const p = require(`./providers/${provider}`)[provider];
      if (!p || !p.isEnabled()) continue;
      // eslint-disable-next-line no-await-in-loop
      const out = await p.structured({ role: 'check', model, system, user, schema, schemaName: 'submit_answer', maxTokens: 4000, timeoutMs: 120000 });
      const d = out && out.data;
      if (!d) continue;
      if (mc) {
        if (!Number.isInteger(d.index)) continue;
        return String(item.choices[d.index]).trim() === String(item.answer).trim() ? 'agreed' : 'disagreed';
      }
      if (d.answer == null) continue;
      return normAns(d.answer) === normAns(item.answer) ? 'agreed' : 'disagreed';
    } catch { /* next provider */ }
  }
  return 'unjudged';
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: { same_skill: { type: 'boolean' }, same_difficulty: { type: 'boolean' }, natural: { type: 'boolean' }, note: { type: 'string' } },
  required: ['same_skill', 'same_difficulty', 'natural'],
};

/** A judge from another family than the writers: did the theme keep the skill and the difficulty? */
async function judge(item, stem, domain, { judger } = {}) {
  if (judger) return judger(item, stem, domain);
  try {
    // eslint-disable-next-line global-require
    const nvidia = require('./providers/nvidia');
    const user = `Skill tested: ${item.skill_name || item.skill_id}\nOriginal question: ${item.prompt}\nRestyled into "${domain}": ${stem}\n${item.format === 'multiple_choice' ? `Options: ${(item.choices || []).join(' | ')}\n` : ''}Answer: ${item.answer}\nsame_skill: does the restyled question test exactly the same skill? same_difficulty: is it no easier and no harder (same operations, same numbers, no extra reading load)? natural: does it read as a sensible, correct question in that interest, with no wrong facts?`;
    const out = await nvidia.structured({ role: 'check', system: 'You are a strict judge of school practice questions.', user, schema: JUDGE_SCHEMA, schemaName: 'submit_judgement', maxTokens: 1500, models: [{ model: process.env.THEME_JUDGE_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], timeoutMs: 120000, attempts: 2 });
    const d = out && out.data;
    return d ? { same_skill: !!d.same_skill, same_difficulty: !!d.same_difficulty, natural: !!d.natural, note: d.note || '' } : null;
  } catch { return null; }
}

/**
 * Theme one item through every gate. deps ({writer, solver, judger}) are injectable for tests and the proof.
 * @returns {Promise<{ok: boolean, item?: object, reason?: string, stage?: string}>}
 */
async function theme(item, domain, { userId = null, dataClass = 'learner', deps = {} } = {}) {
  if (!themable(item)) return { ok: false, stage: 'themable', reason: 'not a themable item' };
  let stem;
  try { stem = await (deps.writer ? deps.writer(item, domain) : write(item, domain, { userId, dataClass })); } catch { stem = null; }
  if (!stem) return { ok: false, stage: 'write', reason: 'no themed stem' };
  const bad = stemProblem(item, stem);
  if (bad) return { ok: false, stage: 'stem', reason: bad };
  const verdict = await resolve(item, stem, deps);
  if (verdict !== 'agreed') return { ok: false, stage: 'resolve', reason: `blind re-solve ${verdict}` };
  // Second family (GLM via Gonka, else Lyceum): both families must match the ORIGINAL key; any disagreement or no answer rejects.
  const second = await resolve2(item, stem, deps);
  if (second !== 'agreed') return { ok: false, stage: 'resolve2', reason: `second-family re-solve ${second}` };
  const j = await judge(item, stem, domain, deps);
  if (!j) return { ok: false, stage: 'judge', reason: 'no judge answer' };
  if (!j.same_skill || !j.same_difficulty || !j.natural) return { ok: false, stage: 'judge', reason: `judge: skill ${j.same_skill}, difficulty ${j.same_difficulty}, natural ${j.natural}` };
  return { ok: true, item: { ...item, prompt: stem, themed: domain, base_prompt: item.prompt, source: 'bank-themed' } };
}

/** Sync: take one ready themed item for this entry that is not in `avoid`, or null (the base item is served). */
function take({ skillId, difficulty, domain, avoid }) {
  if (!domain) return null;
  const key = poolKey(skillId, difficulty, domain);
  const row = db.find('themed_items', (r) => r.key === key)[0];
  if (!row) return null;
  const seen = avoid instanceof Set ? avoid : new Set();
  const i = (row.items || []).findIndex((it) => !seen.has(bank.itemKey(it)));
  if (i < 0) return null;
  const item = row.items[i];
  db.update('themed_items', row.id, { items: row.items.filter((_, k) => k !== i), served: (row.served || 0) + 1 });
  return { ...item, difficulty };
}

/** Background: write ahead until the pool holds `count` themed items for this skill, difficulty and interest. */
function topUp({ skillId, difficulty, domain, count, userId, deps }) {
  if (!on() || !domain) return Promise.resolve(0);
  const key = poolKey(skillId, difficulty, domain);
  if (inflight.has(key)) return Promise.resolve(0);
  inflight.add(key);
  return (async () => {
    let made = 0;
    try {
      const row = db.find('themed_items', (r) => r.key === key)[0];
      let have = row ? (row.items || []).length : 0;
      const want = Math.min(POOL_MAX, count);
      for (let attempt = 0; have < want && attempt < want * 3; attempt++) {
        const base = bank.generate({ skillId, difficulty, seed: `${key}:${Date.now()}:${attempt}:${Math.random()}` });
        if (!themable(base)) { if (attempt >= 3) break; continue; }
        // eslint-disable-next-line no-await-in-loop
        const r = await theme(base, domain, { userId, deps });
        db.insert('themed_log', { key, ok: r.ok, stage: r.stage || 'ok', at: Date.now() });
        if (!r.ok) continue;
        const cur = db.find('themed_items', (x) => x.key === key)[0];
        if (cur) db.update('themed_items', cur.id, { items: [...(cur.items || []), r.item] });
        else db.insert('themed_items', { key, items: [r.item], served: 0 });
        have++; made++;
      }
    } catch (err) { console.warn(`item-theme: ${key}: ${err.message}`); } finally { inflight.delete(key); }
    return made;
  })();
}

/** Called once per materialized plan: write ahead twice what these entries need, per skill and difficulty, per interest. */
function writeAhead({ userId, domain, entries }) {
  if (!domain || !on()) return;
  const need = {};
  for (const e of entries) {
    if (e.role !== 'focus' && e.role !== 'stretch' && e.role !== 'support' && e.role !== 'warmup') continue;
    const k = `${e.skillId}|${Math.round(e.difficulty)}`;
    need[k] = (need[k] || { skillId: e.skillId, difficulty: Math.round(e.difficulty), n: 0 });
    need[k].n++;
  }
  for (const g of Object.values(need)) topUp({ skillId: g.skillId, difficulty: g.difficulty, domain, count: g.n * SURPLUS, userId }).catch(() => {});
}

module.exports = { on, domainFor, themable, stemProblem, theme, take, topUp, writeAhead, poolKey, numbersOf };
