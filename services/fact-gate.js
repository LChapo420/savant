/**
 * The measured fact gate (brief fact-gate, docs/FACT-GATE.md): how much a check catches. Whether a check happens is services/fact-guard.js; when it runs is the scheduler's.
 *
 *   FACT_GATE=on     a shared (base) level is read by this gate instead of the claim read; a level for a learner keeps today's read, so nobody waits on it
 *   FACT_GATE=off    (default) nothing changes
 *
 * One read, three stages:
 *   1. the code pass (services/fact-code-checks.js): free, 20 ms, recomputes what can be recomputed. Its certain findings go straight to repair;
 *   2. readers, each in its own model family, hunt for errors (only the errors, so a read costs a tenth of the claim-by-claim list). Families the writer belongs to are skipped;
 *   3. a decider rules on what the readers and the code's suspicions raised, so a false alarm does not cost a repair.
 * Readers and decider come from FACT_GATE_READERS and FACT_GATE_DECIDER as `provider:model,...`. The defaults are in DEFAULTS; a reader that cannot answer does not sink the read
 * unless all of them failed: then the level has not been read (null, no keep on no evidence). Every call goes through its provider's own ledger.
 */
const code = require('./fact-code-checks');

const HUNT_SYSTEM = `You check a lesson for errors before it reaches a learner. You get the subject, grade and level, then every block and graded check as JSON. Many lessons have no errors at all, and a false alarm costs real money. Report only what is actually wrong.

Go through it in this order, working things out yourself and never trusting the writer's explanation:
1. Numbers: redo every calculation, count, conversion and table value. Follow each worked example step by step to its end.
2. Formulas and procedures: is each stated rule, formula, sign, order of steps and conjugation pattern right?
3. Keys: for every graded check and every interactive item with a key (answer, correctIndex, correctId, correctOptionId, correctBucket and so on), work out the answer BEFORE reading the key, then compare. The key must be right, its explanation must argue for it, and it must agree with what the blocks of this lesson teach.
4. Facts: every date, person, place, term name, definition and word meaning, from what you know for certain.
5. Direction: cause and effect, which way a rule runs, which form goes with which case.
6. Misleading statements: a flat "always", "never" or "any" where the truth has an exception that a learner of this level would be misled by.
7. Agreement: two parts of the lesson that contradict each other.

Do not report: style, tone, teaching choices, simplifications that are fair at this level, debatable usage presented as debatable, made-up names and scenarios in examples, or text that is meant to be wrong (wrong options of a question, trap text, lines marked isError true, the false side of a true/false item) unless its marking or feedback is itself wrong.

For each error give: where ("block N" or "check N", numbered as given), quote (the exact wrong words), why (what is wrong, with the working), truth (what it should say). No errors: an empty list.`;
const HUNT_SCHEMA = {
  type: 'object',
  required: ['errors'],
  properties: { errors: { type: 'array', items: { type: 'object', required: ['where', 'quote', 'why', 'truth'], properties: { where: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' }, truth: { type: 'string' } } } } },
};
const DECIDE_SYSTEM = `You rule on suspected errors in a lesson. Other checkers read this lesson and raised the flags listed; they raise many false alarms, and they also find real errors. You have no stake in either. For each flag, read the lesson text it points at and work the matter out yourself from scratch: do the arithmetic, read the rule, recall the fact.

Rule "real" only if the lesson's text as written is actually wrong or would actually mislead a learner at this level: a wrong number, step, formula, key, fact, or direction; a key that disagrees with its explanation or with what the lesson teaches; a flat statement with an exception that matters here; or two parts that contradict each other.

Rule "false" when the flag is mistaken, is only about style or teaching choices, misreads the text, objects to text that is meant to be wrong (a wrong option, a trap, a line marked isError true), objects to a fair simplification, or quotes words that are not there.

Give one ruling per flag, in order, with a one-sentence reason.`;
const DECIDE_SCHEMA = { type: 'object', required: ['rulings'], properties: { rulings: { type: 'array', items: { type: 'object', required: ['flag', 'real', 'reason'], properties: { flag: { type: 'integer' }, real: { type: 'boolean' }, reason: { type: 'string' } } } } } };

const DEFAULTS = { readers: 'zerogpu:z-ai/glm-5.3-flash,grokified:grok-4.3', decider: 'grokified:grok-4.3' };
const FAMILY = (model) => { const m = String(model).toLowerCase(); return m.includes('glm') ? 'glm' : m.includes('deepseek') ? 'deepseek' : m.includes('grok') ? 'grok' : m.includes('kimi') ? 'kimi' : m.includes('claude') ? 'claude' : m.split('/')[0]; };

function gateOn() { return String(process.env.FACT_GATE || '').toLowerCase() === 'on'; }
/** This gate reads shared levels only: a learner's own level keeps today's read and its lane, so nobody waits on it. */
function appliesTo({ userId = null } = {}) { return gateOn() && !userId; }

function parseSlots(text) {
  return String(text || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf(':'); return { provider: s.slice(0, i), model: s.slice(i + 1) }; });
}
function slotsOf() {
  return { readers: parseSlots(process.env.FACT_GATE_READERS || DEFAULTS.readers), decider: parseSlots(process.env.FACT_GATE_DECIDER || DEFAULTS.decider)[0] || null };
}
/* eslint-disable global-require */
const PROVIDERS = {
  zerogpu: () => require('./providers/zerogpu').zerogpu,
  gonka: () => require('./providers/gonka').gonka,
  coral: () => require('./providers/coral').coral,
  munito: () => require('./providers/munito').munito,
  grokified: () => require('./providers/grokified').grokified,
  lyceum: () => require('./providers/lyceum').lyceum,
};
/* eslint-enable global-require */
const defaultCall = async (slot, args) => {
  const p = PROVIDERS[slot.provider] && PROVIDERS[slot.provider]();
  if (!p) throw new Error(`fact gate: no provider ${slot.provider}`);
  const r = await p.structured({ ...args, model: slot.model, task: 'fact_gate', timeoutMs: 280000 });
  return { data: r.data, usage: r.usage, cost: (r.usage && r.usage.cost_usd) || 0, model: r.model };
};

const render = ({ context, blocks, checks }) => [
  context.text,
  '',
  ...blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`),
  ...checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, fen: c.fen, frames: c.frames, options: c.options, choices: c.choices, answer: c.answer, accepts: c.accepts, rationale: c.rationale, hint: c.hint })}`),
].join('\n');

const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const placeKey = (where) => { const m = /(block|check)\s*#?\s*(\d+)/i.exec(where || ''); return m ? `${m[1].toLowerCase()} ${m[2]}` : null; };
const flagKey = (f) => `${placeKey(f.where) || '?'}|${words(f.claim).slice(0, 8).join(' ')}`;
const retracted = (f) => /\b(this is (actually )?(fine|correct)|actually correct|no error|that part is fine)\b/i.test(f.why || '');

/**
 * One read of a level. Returns the shape of block-levels verifyLevel: { claims: [{where, claim, kind, verdict, truth, evidence, by}], cost, usage, model, stages } or null when no reader answered.
 * `call(slot, args)` is injected by tests. Claims are failed ones only (this read does not list what it found right).
 */
async function read({ context, blocks, checks, excludeFamilies = null, call = defaultCall, trackId = null, gradeId = null }) {
  const stages = { code: 0, read: 0, raised: 0, kept: 0, failedReaders: 0, slots: [] };
  const certain = []; const suspects = [];
  for (const f of code.checkLevel({ trackId: trackId || context.trackId, gradeId, blocks, checks })) (f.certain ? certain : suspects).push(f);
  stages.code = certain.length;
  const { readers: all, decider } = slotsOf();
  const skip = new Set(excludeFamilies || []);
  const readers = all.filter((s) => !skip.has(FAMILY(s.model)));
  const use = readers.length ? readers : all; // never unread: when every family wrote it, the readers read it anyway
  const user = render({ context, blocks, checks });
  let cost = 0; const usage = { input_tokens: 0, output_tokens: 0 }; const models = [];
  const add = (r) => { cost += r.cost || 0; if (r.usage) { usage.input_tokens += r.usage.input_tokens || 0; usage.output_tokens += r.usage.output_tokens || 0; } if (r.model) models.push(r.model); };
  const seen = new Map();
  const replies = await Promise.all(use.map((slot) => call(slot, { system: HUNT_SYSTEM, user, schema: HUNT_SCHEMA, schemaName: 'submit_errors', maxTokens: 12000 }).catch(() => null)));
  replies.forEach((r) => {
    if (!r || !r.data) { stages.failedReaders++; return; }
    stages.read++;
    add(r);
    for (const e of r.data.errors || []) {
      const f = { where: String(e.where || ''), claim: String(e.quote || ''), why: String(e.why || ''), truth: String(e.truth || '') };
      if (placeKey(f.where) && !retracted(f) && !seen.has(flagKey(f))) seen.set(flagKey(f), f);
    }
  });
  if (!stages.read) return null;
  for (const s of suspects) if (!seen.has(flagKey(s))) seen.set(flagKey(s), { where: s.where, claim: s.claim, why: s.rule, truth: s.truth });
  const raised = [...seen.values()];
  stages.raised = raised.length;
  let kept = raised;
  if (raised.length && decider) {
    const list = raised.map((f, i) => `FLAG ${i} at ${f.where}: "${f.claim.slice(0, 300)}" — ${f.why.slice(0, 300)} ${f.truth ? `(suggested truth: ${f.truth.slice(0, 200)})` : ''}`).join('\n');
    const r = await call(decider, { system: DECIDE_SYSTEM, user: `${user}\n\nFLAGS\n${list}`, schema: DECIDE_SCHEMA, schemaName: 'submit_rulings', maxTokens: 12000 }).catch(() => null);
    if (r && r.data) {
      add(r);
      const rulings = r.data.rulings || [];
      kept = raised.filter((_, i) => { const q = rulings.find((x) => Number(x.flag) === i) || rulings[i]; return q ? q.real !== false : true; }); // no ruling: the flag stands
    }
  }
  stages.kept = kept.length;
  const claims = [...certain.map((f) => ({ where: f.where, claim: f.claim, kind: 'fact', verdict: 'false', evidence: 'computed', truth: f.truth, by: 'code' })), ...kept.map((f) => ({ where: f.where, claim: f.claim, kind: 'fact', verdict: 'false', evidence: 'knowledge', truth: f.truth || f.why, by: 'reader' }))];
  return { claims, cost, usage, model: [...new Set(models)].join('+') || 'code', stages };
}

module.exports = { gateOn, appliesTo, read, slotsOf, HUNT_SYSTEM, DECIDE_SYSTEM, DEFAULTS };
