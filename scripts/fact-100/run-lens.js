#!/usr/bin/env node
/**
 * Special-purpose reads aimed at the two kinds readers miss together. Same scoring as any reader; thresholds and wording may look at dev2 only.
 *   counter   every general statement must survive a counterexample hunt (misleading simplifications)
 *   neighbour every term, rule and word is compared with what it is most often confused with (wrong-but-plausible facts)
 *   node scripts/fact-100/run-lens.js <lens> <model> [par=2] [split=dev2|heldout|all]
 */
const C = require('./common');
const { L } = C;
const J = require('../fact-gate/judges');

const [, , LENS = 'counter', MODEL = 'glm_flash_gonka', PAR = '2', SPLIT = 'dev2'] = process.argv;
const SYSTEMS = {
  counter: `You test the general statements in a lesson. Take every sentence that states a rule, a law, a definition or what happens in general (not made-up scenarios, not advice on studying). For each, try to build a concrete counterexample that a learner of this grade could meet soon: a number, a word, a position, a case.

Report a statement only if ALL of these hold:
1. You have a specific counterexample, written out, and you checked it.
2. The lesson does not itself state that exception or limit anywhere (read all of it first).
3. A learner who believed the sentence as written would get a later problem wrong because of it.

Do not report: fair simplifications whose exceptions are far above this level, statements the lesson qualifies with words like usually or most, style advice, or anything in a wrong option, a trap, or a line marked as an error.

For each: where ("block N" or "check N"), quote (the exact words), why (the counterexample, worked out), truth (the statement as it should read). Most lessons have none: an empty list is the common answer.`,
  neighbour: `You check a lesson for near misses: a fact that is wrong but sounds right, because it belongs to a neighbouring thing. For every term, definition, named rule, word meaning, grammar form, formula and named person in the lesson, recall what it is most often confused with (false friends in a foreign language, a nearby rule, the opposite direction of a relation, a popular myth), then decide which of the two the lesson actually states. Decide from what you know for certain.

Report only what the lesson states wrongly. Do not report style, teaching choices, or anything in a wrong option, a trap, or a line marked as an error.

For each: where ("block N" or "check N"), quote (the exact words), why (what it was confused with, and how you know), truth (what it should say). Most lessons have none: an empty list is the common answer.`,
};
const SCHEMA = J.HUNT_SCHEMA;
const name = `${LENS}_${MODEL}`;
const set = C.loadSet('heldout');
const levelSplit = new Map([...set.plants.map((p) => [p.level, p.split]), ...set.clean.map((c) => [c.level, c.split])]);
(async () => {
  await C.runChecker(name, 'heldout', async (lv) => {
    const r = await J.callModel(MODEL, { system: SYSTEMS[LENS], user: J.render(lv), schema: SCHEMA, schemaName: 'submit_errors', maxTokens: 8000 });
    return { flags: (r.data.errors || []).map((e) => ({ where: e.where, claim: e.quote, why: e.why, truth: e.truth })), cost: r.cost || 0 };
  }, { par: Number(PAR), filter: (x) => SPLIT === 'all' || levelSplit.get(x.level) === SPLIT });
  const raw = C.readRaw(name, 'heldout').filter((r) => r.read && (SPLIT === 'all' || levelSplit.get(r.level) === SPLIT));
  const res = C.scorePlants(raw, 'heldout');
  const ps = set.plants.filter((p) => res.has(p.id));
  console.log(name, SPLIT, 'caught', L.fmtRate(ps.filter((p) => res.get(p.id)).length, ps.length));
  for (const k of [...new Set(ps.map((p) => p.kind))]) { const q = ps.filter((p) => p.kind === k); console.log(' ', k.padEnd(28), q.filter((p) => res.get(p.id)).length, '/', q.length); }
  const cleanIds = new Set(set.clean.map((c) => `clean:${c.level}`));
  const cl = raw.filter((r) => cleanIds.has(r.id));
  console.log(`clean levels ${cl.length}, flagged ${cl.filter((r) => r.flags.length).length}, flags ${cl.reduce((n, r) => n + r.flags.length, 0)}; $ a read ${(raw.reduce((n, r) => n + (r.cost || 0), 0) / Math.max(1, raw.length)).toFixed(5)}`);
  for (const r of cl.filter((x) => x.flags.length).slice(0, 8)) console.log('   ', r.level.split('/').slice(-2).join('/'), String(r.flags[0].claim).slice(0, 70), '::', String(r.flags[0].why).slice(0, 110));
  process.exit(0);
})();
