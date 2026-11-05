/**
 * The explanation-key gate at generation time (live since 2026-10-24; KEY_GATE=off turns it off).
 *
 * services/key-agreement.js flags a multiple-choice question whose own explanation
 * describes a different option than its key (the 2026-10-23 audit's error: 119 game
 * questions). A flag is not a verdict (about 1 in 9 flags is a good question), so a
 * flagged question is re-keyed blind by an independent judge that is never shown the
 * key or the explanation:
 *
 *   judge picks the key      -> kept
 *   judge picks another one  -> rejected, with the reason, for the caller to rewrite
 *   no judge answer          -> rejected (never kept on no evidence)
 *
 * The judge follows the app's learner-safe chain, NVIDIA first (owner, 2026-10-24):
 * NVIDIA Nemotron Ultra by name, a different family from the GLM / DeepSeek writers
 * of the `blocks` role; then the rest of the app's chain for `check` (Claude last,
 * inside the key's ledger). Never xKiro or UnoRouter (build pipeline only). Only
 * question text and options are sent, never a learner's words. Live and on by
 * default since 2026-10-24; KEY_GATE=off turns it off.
 */
const keyAgreement = require('./key-agreement');

// How long the free Nemotron Ultra judge may take before the app's own chain answers instead. It was 120 s x 2 attempts: the 4 Nov walk saw
// it time out on every first lesson (busy free tier) and add 2 to 4 minutes before the fallback judge even started. The fallback is the same
// independent blind re-solve, so nothing is relaxed; only the wait for a slow judge is. KEY_GATE_JUDGE_TIMEOUT_MS overrides.
const POOL_TIMEOUT_MS = () => Math.max(3000, Number(process.env.KEY_GATE_POOL_TIMEOUT_MS || 20000));
const JUDGE_TIMEOUT_MS = () => Math.max(5000, Number(process.env.KEY_GATE_JUDGE_TIMEOUT_MS || 40000));
const JUDGE_MODELS = () => [{ model: process.env.KEY_GATE_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }];
// Default on since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); KEY_GATE=off turns it off.
const on = () => String(process.env.KEY_GATE || 'on').toLowerCase() === 'on';

const SYSTEM = 'You answer multiple-choice questions for a school course. For each question, work it out yourself and give the index (0-based) of the one option you believe is correct. You are not told the answer key.';
const SCHEMA = {
  type: 'object',
  properties: { picks: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' } }, required: ['index', 'chosen_index'] } } },
  required: ['picks'],
};

/** Build-pipeline-only providers: never asked on the app's path, whatever the environment says. */
const PIPELINE_ONLY = new Set(['xkiro', 'unorouter']);

function picksFrom(r, batch) {
  const by = new Map(((r && r.data && r.data.picks) || []).map((p) => [p.index, p.chosen_index]));
  return batch.map((_, i) => (Number.isInteger(by.get(i)) ? by.get(i) : null));
}

/**
 * Blind picks for a batch of {prompt, choices}, one per question (null when not answered).
 *
 * The app's learner-safe chain (owner, 2026-10-24), NVIDIA first: Nemotron Ultra by
 * name (a different family from the GLM / DeepSeek writers of the `blocks` role);
 * if it gives no picks, the rest of the app's own chain for the `check` role
 * (services/providers: NVIDIA's tier, the local models, the verified-$0 free APIs,
 * then Claude inside the key's ledger). xKiro and UnoRouter are build-pipeline only
 * and are never asked here. Only question text and options are sent.
 */
/**
 * The blind judge through the pool's `blind_mc` slots (config/model-lineup.json), before the free NVIDIA models: the first lesson after a
 * placement waited minutes on a busy free tier for this check (4 Nov 2026), while GLM 5.3 Flash on Gonka answered a question in 0.3 s
 * median (scripts/fact-verifier-eval.js). Same independent re-solve (no key, no rationale sent); `excludeFamilies` keeps it off the
 * writer's own family. Only question text and options leave: no learner words. KEY_GATE_POOL=off puts NVIDIA back first. Null = no picks.
 */
async function poolJudge(call, batch, excludeFamilies) {
  if (String(process.env.KEY_GATE_POOL || 'on').toLowerCase() === 'off') return null;
  try {
    // eslint-disable-next-line global-require
    const ai = require('./ai');
    const r = await ai.structuredDetail({ ...call, task: 'blind_mc', dataClass: 'pipeline', timeoutMs: POOL_TIMEOUT_MS(), excludeFamilies: excludeFamilies && excludeFamilies.length ? excludeFamilies : undefined });
    const picks = picksFrom(r, batch);
    return picks.some((p) => p !== null) ? picks : null;
  } catch (err) {
    console.warn(`key-gate: the pool gave no blind picks (${err.message})`);
    return null;
  }
}

async function nemotronJudge(batch, { excludeFamilies = null } = {}) {
  // eslint-disable-next-line global-require
  const nvidia = require('./providers/nvidia');
  // eslint-disable-next-line global-require
  const providers = require('./providers');
  const user = `${batch.map((q, i) => `Question ${i}: ${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`).join('\n\n')}\n\nReturn one pick per question, with its index.`;
  const call = { role: 'check', system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_picks', maxTokens: 3000 };
  const pooled = await poolJudge(call, batch, excludeFamilies);
  if (pooled) return pooled;
  if (nvidia.isEnabled('check')) {
    try {
      const picks = picksFrom(await nvidia.structured({ ...call, models: JUDGE_MODELS(), timeoutMs: JUDGE_TIMEOUT_MS(), attempts: 1 }), batch);
      if (picks.some((p) => p !== null)) return picks;
    } catch (err) {
      console.warn(`key-gate: Nemotron Ultra gave no blind picks (${err.message}); trying the app's chain`);
    }
  }
  for (const p of providers.chain('check').filter((x) => !PIPELINE_ONLY.has(x.name))) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const picks = picksFrom(await p.structured(call), batch);
      if (picks.some((x) => x !== null)) return picks;
    } catch (err) {
      console.warn(`key-gate: ${p.name} gave no blind picks (${err.message})`);
    }
  }
  return batch.map(() => null);
}

/**
 * @param {object[]} questions {prompt, choices, answerIndex|answer, explanation|rationale}
 * @returns {Promise<{index: number, reason: string}[]>} the questions to reject; [] when the gate is off
 */
async function rejectedByKeyGate(questions, { judge = nemotronJudge, excludeFamilies = null } = {}) {
  if (!on() || !Array.isArray(questions) || !questions.length) return [];
  const results = await keyAgreement.rekeyFlagged(questions, { judge: (batch) => judge(batch, { excludeFamilies }).catch(() => batch.map(() => null)) });
  return results.filter((r) => r.verdict === 'rejected' || r.verdict === 'unjudged').map((r) => ({
    index: r.index,
    reason: r.verdict === 'rejected'
      ? `${r.flag.reason}, and a blind check picked option ${r.judgePicked + 1}`
      : `${r.flag.reason}, and no blind check could settle it`,
  }));
}

/**
 * The self-check's blind re-solve (evidence article 01, P10; used by
 * services/block-levels.js when no verifier key is set): EVERY question, flagged
 * or not, is answered by the same blind judge, never shown the key or the
 * explanation (self-consistency against an independent solver).
 *
 * @param {object[]} questions {prompt, choices, answerIndex|answer}
 * @returns {Promise<{index, verdict: 'agreed'|'disagreed'|'unjudged', picked: number|null, keyIndex: number}[]>}
 */
async function blindResolve(questions, { judge = nemotronJudge, excludeFamilies = null } = {}) {
  if (!Array.isArray(questions) || !questions.length) return [];
  const batch = questions.map((q) => ({ prompt: String(q.prompt || ''), choices: (q.choices || []).map(String) }));
  let picks = [];
  try { picks = await judge(batch, { excludeFamilies }); } catch { picks = []; }
  return questions.map((q, index) => {
    const keyIndex = keyAgreement.keyIndexOf(q);
    const pick = Array.isArray(picks) && Number.isInteger(picks[index]) ? picks[index] : null;
    const verdict = pick === null || keyIndex < 0 ? 'unjudged' : pick === keyIndex ? 'agreed' : 'disagreed';
    return { index, verdict, picked: pick, keyIndex };
  });
}

module.exports = { rejectedByKeyGate, nemotronJudge, blindResolve, on };
