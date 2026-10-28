/**
 * Jev (TypeSafe `typesafe/jev-1.13`), a decision model on OpenRouter's Decisions
 * API, behind a hard, persistent budget.
 *
 * Jev is the one paid OpenRouter model the owner allows, and only where no free
 * model does as well (curriculum-build/MODEL-LINEUP.md). It has $0.13 left IN
 * TOTAL, forever, across every run and the live app. So:
 *
 *   - Every call reads the ledger (data/jev-ledger.json) fresh from disk first.
 *   - The call's cost is estimated up front (1.5 x characters / 4 tokens x the
 *     listed price, with a floor) and the call is refused unless
 *     counted spend + open reservations + this estimate stays within the budget.
 *   - The estimate is written to the ledger as a reservation BEFORE the request
 *     is sent, so a crash or a second process can never spend past the cap: a
 *     reservation that is never settled stays counted as spent.
 *   - Afterwards the call is settled at the largest of: the cost OpenRouter
 *     reported, the reported input tokens x the listed price, and (if nothing
 *     came back) the estimate. Failed requests that may have been billed (5xx,
 *     network) are counted at the estimate.
 *   - A call reported at more than 3x the listed price, any call over $0.0005, or
 *     an HTTP 401/402/403 locks Jev off in the ledger until a person unlocks it.
 *
 * The budget can only be lowered by the environment (JEV_BUDGET_USD), never raised.
 * Jev is OFF unless JEV_ENABLED=1 and config/model-lineup.json "jev" enables the
 * task — the eval enables a task only where Jev beats every free model.
 */
const fs = require('fs');
const path = require('path');

const MODEL = 'typesafe/jev-1.13';
const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const PRICE = 0.000000042; // USD per input token (completion is free), read off OpenRouter on 2026-10-22
const HARD_BUDGET_USD = 0.13; // the owner's total remaining, forever
const MAX_PER_CALL_USD = 0.0005;
const LEDGER = () => process.env.JEV_LEDGER_FILE || path.join(__dirname, '..', 'data', 'jev-ledger.json');

function budget() {
  const env = Number(process.env.JEV_BUDGET_USD);
  return Number.isFinite(env) && env >= 0 ? Math.min(env, HARD_BUDGET_USD) : HARD_BUDGET_USD;
}

function freshLedger() {
  return {
    model: MODEL,
    budget_usd: HARD_BUDGET_USD,
    note: 'Persistent Jev spend ledger. Every Jev call anywhere (app or scripts) reads this first and is refused if it could exceed the budget. Do not delete: deleting it would reset the count, not the money.',
    created_at: new Date().toISOString(),
    counted_usd: 0,
    calls: 0,
    failed_calls: 0,
    refused_calls: 0,
    input_tokens: 0,
    locked: null,
    reservations: {},
    by_task: {},
    log: [],
  };
}

function readLedger() {
  try {
    const data = JSON.parse(fs.readFileSync(LEDGER(), 'utf8'));
    return { ...freshLedger(), ...data, reservations: data.reservations || {}, by_task: data.by_task || {}, log: data.log || [] };
  } catch (err) {
    if (err.code === 'ENOENT') return freshLedger();
    // An unreadable ledger is not an empty one: refuse rather than start from zero.
    return { ...freshLedger(), locked: `ledger unreadable (${err.message})` };
  }
}

function writeLedger(ledger) {
  const file = LEDGER();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  ledger.log = (ledger.log || []).slice(-1000);
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 1));
  fs.renameSync(tmp, file);
}

/** Everything counted against the budget: settled spend plus every open reservation. */
function committed(ledger) {
  return (ledger.counted_usd || 0) + Object.values(ledger.reservations || {}).reduce((s, r) => s + (r.usd || 0), 0);
}

function remaining() {
  const ledger = readLedger();
  return Math.max(0, budget() - committed(ledger));
}

function estimateFor(body) {
  return Math.max(Math.ceil((String(body).length / 4) * 1.5) * PRICE, 0.000005);
}

function isConfigured() {
  return !!String(process.env.OPENROUTER_API_KEY || '').trim();
}

/** Is Jev switched on for this task? (JEV_ENABLED=1 and the lineup says so.) */
function enabledFor(task) {
  if (String(process.env.JEV_ENABLED || '') !== '1' || !isConfigured()) return false;
  try {
    // eslint-disable-next-line global-require
    const lineup = require('./providers/nvidia').readLineup();
    return !!(lineup.jev && lineup.jev[task] === true);
  } catch { return false; }
}

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

/**
 * One Decisions call: `questions` evaluated against `state`. Returns the parsed
 * response ({ answers, usage, ... }) or { refused: reason } / null on failure.
 * Never throws for budget reasons: a refusal is an ordinary answer the caller
 * falls back from.
 */
async function decide({ task = 'unspecified', state, questions }) {
  if (!isConfigured()) return { refused: 'no OpenRouter key' };
  const body = JSON.stringify({ model: MODEL, state, questions });
  const estimate = estimateFor(body);

  // Read, check and reserve in one step, before anything is sent.
  const ledger = readLedger();
  const cap = budget();
  if (ledger.locked) return { refused: `Jev is locked: ${ledger.locked}` };
  if (estimate > MAX_PER_CALL_USD) {
    ledger.refused_calls = (ledger.refused_calls || 0) + 1;
    writeLedger(ledger);
    return { refused: `estimated $${estimate.toFixed(6)} is over the per-call limit` };
  }
  if (committed(ledger) + estimate > cap) {
    ledger.refused_calls = (ledger.refused_calls || 0) + 1;
    ledger.log.push({ at: new Date().toISOString(), task, refused: true, estimate });
    writeLedger(ledger);
    return { refused: `budget: $${committed(ledger).toFixed(6)} of $${cap} committed; this call needs about $${estimate.toFixed(6)}` };
  }
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  ledger.reservations[id] = { usd: estimate, task, at: new Date().toISOString() };
  writeLedger(ledger);

  let outcome = null;
  let counted = estimate;
  let tokens = 0;
  let reported = null;
  let status = 0;
  let lock = null;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${String(process.env.OPENROUTER_API_KEY).trim()}`, 'Content-Type': 'application/json', 'X-Title': 'polymath-jev' },
      body,
    });
    status = res.status;
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) {
      // A refused request (4xx) is not billed; a server error may have been.
      counted = res.status >= 500 ? estimate : 0;
      if ([401, 402, 403].includes(res.status)) lock = `HTTP ${res.status} from OpenRouter`;
      outcome = null;
    } else {
      const usage = (data && data.usage) || {};
      tokens = Number(usage.input_tokens) || 0;
      reported = Number(usage.cost);
      const byTokens = tokens * PRICE;
      counted = Math.max(Number.isFinite(reported) ? reported : 0, byTokens, tokens ? 0 : estimate);
      if ((Number.isFinite(reported) && byTokens > 0 && reported > 3 * byTokens) || counted > MAX_PER_CALL_USD) {
        lock = `a call cost $${counted} for ${tokens} input tokens`;
      }
      outcome = data;
    }
  } catch (err) {
    counted = estimate; // a network failure may or may not have been billed
    outcome = null;
  } finally {
    const after = readLedger();
    delete after.reservations[id];
    after.counted_usd = Number(((after.counted_usd || 0) + counted).toFixed(9));
    if (outcome) after.calls = (after.calls || 0) + 1; else after.failed_calls = (after.failed_calls || 0) + 1;
    after.input_tokens = (after.input_tokens || 0) + tokens;
    const t = after.by_task[task] || (after.by_task[task] = { calls: 0, counted_usd: 0, input_tokens: 0 });
    t.calls++;
    t.counted_usd = Number((t.counted_usd + counted).toFixed(9));
    t.input_tokens += tokens;
    if (lock) after.locked = lock;
    after.log.push({ at: new Date().toISOString(), task, status, tokens, reported: Number.isFinite(reported) ? reported : null, counted });
    writeLedger(after);
    if (lock) console.warn(`jev: locked off (${lock}); see ${LEDGER()}`);
    console.log(`jev: ${task} call counted $${counted.toFixed(6)}; $${Math.max(0, budget() - committed(after)).toFixed(6)} of $${budget()} left`);
  }
  return outcome;
}

/** Typed-answer grading, as in the pilot: p(acceptable). */
const GRADE_QUESTION = {
  acceptable: {
    type: 'noul',
    instructions: 'Is learner_answer an acceptable answer to question, given reference_answer and other_accepted_answers? Judge meaning and correctness the way a careful teacher would.',
    criteria: {
      true: 'The learner answer says the same thing as the reference answer or one of the other accepted answers, with correct grammar and form. Differences only in accents, capital letters, spacing, final punctuation, a contraction, or an optional subject pronoun do not matter, and neither does a different but equally correct word choice or word order.',
      false: 'The learner answer has a real error: a different word, number or value, a different person, tense, mood, gender or agreement, a mistake the question asked to fix left in place, or a requirement of the question ignored (such as lowest terms).',
    },
  },
};

/**
 * Grade one typed answer the rules rejected. Returns { correct, p } when Jev is
 * decisive (p >= 0.7 accept, p <= 0.3 reject), or null (undecided, refused,
 * failed) so the caller asks its model.
 */
async function gradeTyped({ question, reference, accepted, learner }) {
  const out = await decide({
    task: 'grade_free_response',
    state: { question, reference_answer: reference, other_accepted_answers: (accepted && accepted.length) ? accepted : 'none', learner_answer: learner },
    questions: GRADE_QUESTION,
  });
  const p = out && out.answers && out.answers.acceptable && Number(out.answers.acceptable.noul);
  if (!Number.isFinite(p)) return null;
  if (p >= 0.7) return { correct: true, p };
  if (p <= 0.3) return { correct: false, p };
  return null;
}

/** Blind multiple choice: which option is right. Returns { answer, confidence } or null. */
async function chooseOption({ question, passage = null, options }) {
  const letters = 'ABCDEFGHIJ';
  const criteria = {};
  options.forEach((o, i) => { criteria[letters[i]] = String(o); });
  const out = await decide({
    task: 'blind_mc',
    state: passage ? { passage, question } : { question },
    questions: { answer: { type: 'choice', instructions: 'Which option is the correct answer to the question in the state? Work it out; exactly one option is right.', criteria } },
  });
  const a = out && out.answers && out.answers.answer;
  if (!a || !a.choice || criteria[a.choice] === undefined) return null;
  return { answer: criteria[a.choice], confidence: Number(a.confidence) || 0 };
}

module.exports = {
  MODEL, PRICE, HARD_BUDGET_USD, budget, remaining, readLedger, committed, estimateFor,
  decide, gradeTyped, chooseOption, enabledFor, isConfigured, GRADE_QUESTION, LEDGER, _setFetch,
};
