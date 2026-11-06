/**
 * The fact guard: nothing a model wrote reaches a learner until a real fact check has passed it (owner, 6 Nov 2026: "just make sure everything Savant
 * makes and puts out is 100% fact checked"). This is a COVERAGE rule: it decides whether a check happens at all, on every path. How much a check catches
 * is the fact-gate build's job; 100% checked is not 100% true, and nothing here says so.
 *
 * There is one way in. services/ai.js runs every model call through `withProviders`, and `withProviders` hands every answer to `pass` below. What happens
 * next is decided by the task's row in services/fact-registry.js, not by the caller, so a new output path cannot quietly skip the check:
 *
 *   inline      checked here, now, before the caller gets the text (`check`)
 *   downstream  the row names the verifier that runs later in the same pipeline, before anything is stored as servable
 *   internal    never shown to a learner (a judge, a memory fold, a key check)
 *   exempt      shown, but holds no claim of fact (each with its reason)
 *   no row      treated as held: an unregistered task shows nothing, and scripts/fact-coverage-test.js fails
 *
 * Failing closed: a check that says wrong, or that cannot run, means the text is not shown. A chat gets a fixed, honest sentence (`HELD`), never the words
 * "the tutor is not connected" when it is; anything else returns null, which every caller already treats as "the model gave nothing" and answers from its
 * own fixed content (the bank lesson, the rule-based reading, the stored explanation, no layer).
 *
 * A checker is a provider too: the check is an ordinary call through services/ai.js with the learner's id, so the consent rule and every provider clearance
 * apply to it as to the writer (an under-13 without consent is checked on local models only; after 14 Nov the added providers drop out by themselves).
 *
 * Switch: FACT_CHECK_ALL. 0 restores the old behaviour exactly. Default: DEFAULT_ON below.
 *
 * The guard's own spend has two limits: FACT_GUARD_LEARNER_DAY_USD (one learner, one day, default $0.25: about four times the heaviest measured day) and FACT_GUARD_DAY_USD
 * (the whole app, one day, default $10). Over either, a check reads on free slots only. It never skips the check: if no free slot answers, a chat gets a sentence saying
 * so (HELD.cap) and stored text is not stored, as when a check cannot run. The counters: `ai_usage.check_usd` per learner and day (deleted and exported with ai_usage), a
 * `_spend` row in `fact_guard_stats` for the day.
 *
 * Plug-ins from other builds, picked up when they reach main (see `plugins`):
 *   - services/fact-code-checks.js (fact-gate): recomputed maths before the model. `recompute` runs when the module exists.
 *   - services/material-factcheck.js (uploads-perfect): sentence-by-sentence check of uploaded lessons; the registry's material rows name it.
 *   - services/tutor-full.js factCheck (tutor-full): when that lands, its call should go: dock_help is already checked here, a second call only adds time.
 */
const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require
const DEFAULT_ON = '1';
const on = () => String(process.env.FACT_CHECK_ALL === undefined ? DEFAULT_ON : process.env.FACT_CHECK_ALL).trim() === '1';

/** Fixed sentences for a chat whose reply was held. Honest about why; they state no fact about the subject. */
const HELD = {
  wrong: 'I started to write an answer but my check found a mistake in it, so I held it back rather than risk teaching you something wrong. Could you ask that another way, or tell me which part you want to go over?',
  cant: 'I can\'t double-check my answer right now, so I would rather not guess. Please ask me again in a minute, or carry on with your lesson in the meantime.',
  cap: 'I have reached today\'s limit for double-checking answers, and I won\'t show you one I haven\'t checked. Your lessons and saved material still open as usual, and I can answer again tomorrow.',
};

const MAX_PIECE = 1800; // one piece, in characters
const MAX_CALL = 9000; // pieces sent in one check call, in characters
const MAX_SOURCE = 6000;

const SCHEMA = {
  type: 'object',
  properties: {
    working: { type: 'string' },
    checked: { type: 'integer' },
    wrong: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, quote: { type: 'string' }, why: { type: 'string' } }, required: ['n', 'why'] } },
  },
  required: ['checked', 'wrong'],
};

// `working` comes first on purpose (found 6 Nov): DeepSeek at no reasoning wrote its check inside `why` ("987 x 654 = 645,498 is correct? ... wait") and left the right answer in `wrong`: 18 of 146 right answers flagged.
const RULES_COMMON = `Reply with JSON only: {"working": "<short: work out any sum or step yourself here, before any verdict>", "checked": <how many statements of fact you read>, "wrong": [{"n": <the number of the piece>, "quote": "<its exact words>", "why": "<what is false, in a few words>"}]}. Finish working a statement out before you decide. "wrong" holds only what your working found false, and is empty when nothing is false: never put a statement there to check it, and never one you found correct. Never flag something you cannot say is false.`;

const NOT_CLAIMS = 'Not claims, never flag them: encouragement, study advice, plans, what the learner should do next, questions put to the learner, opinions, style, tone, wording, things left out, a true simplification fit for a beginner, and anything about the learner you cannot see. A wrong option in a multiple-choice question is meant to be wrong: judge the question, its key and its explanation. Showing a mistake is not making one: "a frequent mistake gives x = -1" is false only if that mistake does not give it. "That\'s right" refers to the learner\'s answer to the question the tutor had just asked: read the conversation before judging it.';

const SYSTEMS = {
  general: `You fact-check text an AI tutor wrote, before a learner sees it. Find statements about the subject that are false: wrong arithmetic or wrong steps (work them out yourself, never trust the text), wrong definitions, rules, dates, names, grammar or translations, a key that is not the right answer, a learner's answer called right when it is wrong or wrong when it is right. ${NOT_CLAIMS} An analogy or an "imagine" scene is fine unless it says something false about the subject. A REFERENCE, when given, is the question, the key or the lesson the text is about: use it to understand the text, and flag a statement that contradicts it. ${RULES_COMMON}`,
  source: `You check text written for a learner against a SOURCE before the learner sees it. Flag a statement that misreports or contradicts the SOURCE, and a statement about the subject that is false whatever the SOURCE says. A statement the SOURCE does not cover is fine when it is true. If the SOURCE is cut short, absence from it proves nothing. ${NOT_CLAIMS} ${RULES_COMMON}`,
  material: `You check text written for a student from THEIR OWN study material (the SOURCE) before they see it. The SOURCE decides: flag a statement that misstates or contradicts it, even if you would have said otherwise. A fact the SOURCE does not contain is allowed only when it is certainly true by general knowledge: flag it when it is false or you cannot be sure. If the SOURCE is cut short, absence from it proves nothing, so judge such a statement by general knowledge. ${NOT_CLAIMS} ${RULES_COMMON}`,
  overlay: `A short personal layer (a reason to care, a hook, analogies from the reader's interests) is about to be put over a LESSON that was already checked. The layer is allowed no fact about the subject of its own. Flag any statement about the subject that the LESSON does not give, or that misstates the LESSON, including claims dressed up as reasons to care (how common, how important, what experts do, what it decides) and an analogy that says something untrue about the lesson's point. A comparison that only explains a point the LESSON makes is fine; so are facts about the interest itself that everyone knows, and anything about why this reader might care. ${RULES_COMMON}`,
};

const strings = (v, out = []) => {
  if (typeof v === 'string') { if (v.trim()) out.push(v); } else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const clip = (t, n) => { const s = String(t || ''); return s.length > n ? `${s.slice(0, n)} [cut short]` : s; };
const stripHtml = (t) => String(t || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ── what the check saw, for the owner's numbers: counts only, no learner, no text (kept in `fact_guard_stats`, one row a day and task) ─────────
const today = () => new Date().toISOString().slice(0, 10);
function note(task, outcome, ms) {
  try {
    const db = lazy('../config/db');
    const day = today();
    db.upsert('fact_guard_stats', (r) => r.day === day && r.task === task, (r) => ({
      day, task,
      checked: ((r && r.checked) || 0) + 1,
      passed: ((r && r.passed) || 0) + (outcome === 'passed' ? 1 : 0),
      wrong: ((r && r.wrong) || 0) + (outcome === 'wrong' ? 1 : 0),
      cant: ((r && r.cant) || 0) + (outcome === 'cant' ? 1 : 0),
      ms_total: ((r && r.ms_total) || 0) + Math.round(ms || 0),
    }));
  } catch { /* the numbers are extra */ }
}

// ── the guard's own spend ────────────────────────────────────────────────────────────────────────────────────────────────
const limit = (name, dflt) => { const n = Number(process.env[name]); return process.env[name] !== undefined && process.env[name] !== '' && Number.isFinite(n) && n >= 0 ? n : dflt; };
const SPEND_TASK = '_spend';
function addSpend(userId, usd) {
  if (!usd) return;
  try {
    const db = lazy('../config/db');
    const day = today();
    db.upsert('fact_guard_stats', (r) => r.day === day && r.task === SPEND_TASK, (r) => ({ day, task: SPEND_TASK, usd: Number((((r && r.usd) || 0) + usd).toFixed(6)) }));
    if (userId) db.upsert('ai_usage', (u) => u.user_id === userId && u.day === day, (r) => ({ ...(r || { user_id: userId, day, cents: 0, calls: 0 }), check_usd: Number((((r && r.check_usd) || 0) + usd).toFixed(6)) }));
  } catch { /* the check matters more than its counter */ }
}
/** Which limit is reached, if any: 'learner', 'day' or null. A check over a limit reads on free slots only. */
function capReached(userId) {
  try {
    const db = lazy('../config/db');
    const day = today();
    const all = db.findOne('fact_guard_stats', (r) => r.day === day && r.task === SPEND_TASK);
    if (all && all.usd >= limit('FACT_GUARD_DAY_USD', 10)) return 'day';
    if (userId) { const u = db.findOne('ai_usage', (r) => r.user_id === userId && r.day === day); if (u && (u.check_usd || 0) >= limit('FACT_GUARD_LEARNER_DAY_USD', 0.25)) return 'learner'; }
  } catch { /* no counter: the provider ledgers still hold */ }
  return null;
}

/** The recomputed-maths first pass (fact-gate build), once it is on main: its certain findings count as wrong with no model asked. */
function recompute(text) {
  let mod = null;
  try { mod = lazy('./fact-code-checks'); } catch { return []; }
  try {
    if (!mod.codeChecksOn || !mod.codeChecksOn()) return [];
    return (mod.checkLevel({ blocks: [{ index: 0, block: 'text', data: { text } }], checks: [] }) || []).filter((f) => f.certain).map((f) => f.claim || f.rule);
  } catch { return []; }
}

/** The user text of one check call. Exported for the eval, so what is measured is exactly what runs. */
function checkUser({ pieces, source = '', learnerSaid = '', mode = 'general' }) {
  const label = mode === 'general' ? 'REFERENCE' : mode === 'overlay' ? 'LESSON' : 'SOURCE';
  return [
    source ? `${label}:\n${clip(source, MAX_SOURCE)}` : '',
    learnerSaid ? `THE CONVERSATION JUST BEFORE THIS (for context, not to be checked):\n${clip(learnerSaid, 900)}` : '',
    `TEXT TO CHECK:\n${pieces.map((p, i) => `[${i + 1}] ${clip(p, MAX_PIECE)}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');
}

/** Cut pieces into calls of at most MAX_CALL characters, keeping their numbers. */
function batches(pieces) {
  const out = [];
  let cur = []; let size = 0;
  pieces.forEach((p, i) => {
    const len = Math.min(p.length, MAX_PIECE);
    if (cur.length && size + len > MAX_CALL) { out.push(cur); cur = []; size = 0; }
    cur.push({ text: p, index: i }); size += len;
  });
  if (cur.length) out.push(cur);
  return out;
}

/**
 * One real check. `pieces` are strings; returns { ran, wrong: [{ index, why, quote }], ms, model }. ran=false when any call could not answer: that is never a
 * pass. Goes through services/ai.js (task fact_live), so the learner's consent and the provider clearances decide who may read it.
 */
async function check({ pieces, source = '', learnerSaid = '', mode = 'general', userId = null, writerModel = null, budgetMs = 8000, dataClass = null, waiting = false, llm = null, storedContent = false }) {
  const t0 = Date.now();
  const list = pieces.map((p) => String(p || '').trim()).filter(Boolean);
  if (!list.length) return { ran: true, wrong: [], ms: 0, model: null };
  const wrong = [];
  let model = null;
  let ran = true;
  let costUsd = 0;
  const capped = capReached(userId);
  list.forEach((p, i) => { for (const claim of recompute(p)) wrong.push({ index: i, why: `recomputed: ${String(claim).slice(0, 120)}`, quote: '' }); });
  const ai = lazy('./ai');
  const pool = lazy('./pool');
  // Independence: against general knowledge a model shares its own family's beliefs, so another family reads first (when anything outside this machine may read it;
  // a learner on local models only has what they have). Comparing text with a source (overlay, material) rests on the source, so any cleared checker will do: measured
  // 6 Nov, the same catches at 0.3 s on Coral against 6.7 s on ZeroGPU for a layer. If no other family answers in time, the same family reads it before anything is held.
  let exclude = null;
  try { // FACT_LIVE_SAME_FAMILY=1 (owner's call, off): a waiting learner's check takes the fastest reader even if it shares the writer's family: p50 0.7 s against 3.6 s, with the same catches measured on planted errors (docs/FACT-COVERAGE.md).
    const sameOk = waiting && String(process.env.FACT_LIVE_SAME_FAMILY || '') === '1';
    const f = !sameOk && writerModel && (mode === 'general' || mode === 'source') ? pool.familyOfModel(writerModel) : null; if (f && ai.outsideOk(userId)) exclude = [f]; } catch { exclude = null; }
  await Promise.all(batches(list).map(async (batch) => {
    const base = {
      role: 'fast', task: 'fact_live', system: SYSTEMS[mode] || SYSTEMS.general, user: checkUser({ pieces: batch.map((b) => b.text), source, learnerSaid, mode }),
      schema: SCHEMA, schemaName: 'submit_check', maxTokens: 700 + batch.length * 90, effort: 'off', userId,
      ...(dataClass && !userId ? { dataClass } : {}), hedgeAfterMs: waiting ? 1800 : undefined, ...(capped ? { freeOnly: true } : {}), ...(storedContent ? { storedContent: true } : {}),
    };
    const go = llm || ((a) => ai.structuredDetail(a));
    const ask = async (args) => {
      try {
        // A learner is waiting: the fast lane, which puts the paid checkers ahead of a busy free model. Background work stays on its own lane.
        return waiting && !pool.inBackground() ? await pool.runForeground(() => go(args), { fast: true }) : await go(args);
      } catch { return null; }
    };
    let res = null;
    const budget = () => budgetMs - (Date.now() - t0);
    if (budget() < 500) { ran = false; return; }
    // The independent reader gets part of the time, never all of it: on stored text it used to take the whole budget, so a slow provider meant no last-resort reader and a false "could not check" (found 6 Nov: 3 of 5 debriefs lost that way).
    if (exclude) res = await ask({ ...base, excludeFamilies: exclude, timeoutMs: Math.min(budget(), Math.round(budgetMs * 0.6)) });
    if (!(res && res.data) && budget() >= 500) res = await ask({ ...base, timeoutMs: budget() });
    if (res && res.costUsd) { costUsd += res.costUsd; addSpend(userId, res.costUsd); }
    const data = res && res.data;
    if (!data || !Array.isArray(data.wrong)) { ran = false; return; }
    if (res.model) model = res.model;
    for (const w of data.wrong) {
      const b = batch[Number(w && w.n) - 1];
      // A verdict that names no piece is still a verdict on the text: it counts against the first piece of the call rather than being lost.
      wrong.push({ index: b ? b.index : batch[0].index, why: String((w && w.why) || '').slice(0, 200), quote: String((w && w.quote) || '').slice(0, 200) });
    }
  }));
  return { ran, wrong, ms: Date.now() - t0, model, costUsd, capped };
}

/** The pieces of one answer for this task's row: a chat is one piece; structured output splits where the row says, so one bad question does not lose a batch. */
function piecesOf(entry, result) {
  const isChat = typeof result.text === 'string';
  if (isChat) {
    const t = entry.html ? stripHtml(result.text) : result.text;
    if (entry.html) { const out = []; for (let i = 0; i < t.length; i += MAX_PIECE) out.push(t.slice(i, i + MAX_PIECE)); return { list: out, drops: null }; }
    return { list: [t], drops: null };
  }
  if (entry.pieces && result.data) {
    const copy = JSON.parse(JSON.stringify(result.data));
    const parts = (entry.pieces(copy) || []).filter((p) => String(p.text || '').trim());
    return { list: parts.map((p) => p.text), drops: parts.map((p) => p.drop), copy, atLeast: entry.atLeast ? () => entry.atLeast(copy) : null };
  }
  const all = strings(result.data).join('\n');
  const list = [];
  for (let i = 0; i < all.length; i += MAX_PIECE) list.push(all.slice(i, i + MAX_PIECE));
  return { list, drops: null };
}

/** The turns just before this reply. Without the tutor's own last question a true "that's right" reads as a false claim (found 6 Nov: "ottawa" to a question about Canada, held). */
function lastLearnerLine(req) {
  const list = req && Array.isArray(req.messages) ? req.messages.slice(-3) : [];
  return list.map((m) => `${m.role === 'assistant' ? 'Tutor' : 'Learner'}: ${String(m.content || '').slice(0, 400)}`).join('\n');
}

const heldChat = (result, why) => ({ ...result, text: HELD[why], held: why });

/**
 * The choke point. Every answer from services/ai.js comes through here. `rerun(note)` asks the writer once more with the checker's finding (chat tasks).
 * Resolves the answer to give the caller (possibly with wrong pieces removed, or a fixed sentence), or null.
 */
async function pass({ task, factTask = null, userId = null, req = null, result, rerun = null }) {
  if (!on() || !result) return result;
  const registry = lazy('./fact-registry');
  const key = factTask || (req && req.factTask) || task;
  const entry = registry.lookup(key);
  if (!entry) {
    console.warn(`fact-guard: "${key}" is not in services/fact-registry.js, so its answer is not shown`);
    note(String(key), 'cant', 0);
    return typeof result.text === 'string' ? heldChat(result, 'cant') : null;
  }
  if (entry.kind !== 'inline') return result;
  const r = (req && req.factSource) || '';
  const budgetMs = (req && req.factBudgetMs) || entry.budgetMs || 60000;
  const dataClass = req && req.dataClass;
  const opts = { source: r, learnerSaid: lastLearnerLine(req), mode: (req && req.factMode) || entry.mode || 'general', userId, budgetMs, dataClass, waiting: !!entry.live };
  const { list, drops, copy, atLeast } = piecesOf(entry, result);
  if (!list.length) return result;
  const t0 = Date.now();
  let v = await check({ ...opts, pieces: list, writerModel: result.model });
  if (!v.ran) {
    note(key, 'cant', Date.now() - t0);
    console.warn(`fact-guard: no checker could read ${key}; not shown`);
    return typeof result.text === 'string' && entry.live ? heldChat(result, v.capped ? 'cap' : 'cant') : null;
  }
  if (!v.wrong.length) { note(key, 'passed', Date.now() - t0); return result; }
  note(key, 'wrong', Date.now() - t0);
  console.warn(`fact-guard: ${key} held, ${v.wrong.length} statement(s): ${v.wrong.map((w) => w.why).join(' | ').slice(0, 300)}`);
  // Structured output with pieces: take out only what the check found. Nothing is rewritten here.
  if (drops) {
    const flagged = new Set(v.wrong.map((w) => w.index));
    [...flagged].sort((a, b) => b - a).forEach((i) => { if (drops[i]) drops[i](); });
    if (atLeast && !atLeast()) return null;
    return { ...result, data: copy, fact_dropped: flagged.size };
  }
  // A chat gets one more try with what the checker found, checked in its turn, while there is still time.
  if (typeof result.text === 'string' && entry.live && rerun) {
    const second = await rerun(`A fact check of your last draft found this wrong: ${v.wrong.map((w) => w.why).join('; ').slice(0, 400)}. Do not repeat it. Answer again, correctly and briefly.`);
    if (second && typeof second.text === 'string' && second.text.trim()) {
      v = await check({ ...opts, pieces: [second.text], writerModel: second.model });
      if (v.ran && !v.wrong.length) { note(key, 'passed', 0); return second; }
    }
  }
  return typeof result.text === 'string' && entry.live ? heldChat(result, v.ran ? 'wrong' : 'cant') : null;
}

/**
 * A check for model text that does not come through `withProviders` (the grading judges call their providers directly). true: it may be shown. Fails closed.
 */
async function passesText({ task, text, source = '', mode = 'general', userId = null, budgetMs = 8000, waiting = false, learnerSaid = '' }) {
  if (!on() || !String(text || '').trim()) return true;
  const t0 = Date.now();
  const v = await check({ pieces: [text], source, mode, userId, budgetMs, waiting, learnerSaid });
  const ok = v.ran && !v.wrong.length;
  note(task, !v.ran ? 'cant' : (ok ? 'passed' : 'wrong'), Date.now() - t0);
  return ok;
}

/** Today's numbers, for the admin view and the report: counts only. */
function stats(day = today()) {
  try { return lazy('../config/db').find('fact_guard_stats', (r) => r.day === day); } catch { return []; }
}

/** Is this reply one of the fixed sentences? A held reply is never stored as if it were written for the moment (a primed opener, say). */
const isHeld = (text) => text === HELD.wrong || text === HELD.cant || text === HELD.cap;

module.exports = { on, DEFAULT_ON, capReached, addSpend, pass, check, passesText, checkUser, batches, piecesOf, stats, stripHtml, isHeld, SYSTEMS, SCHEMA, HELD };
