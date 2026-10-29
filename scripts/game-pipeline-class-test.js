/**
 * A shared (no learner) game set is written as pipeline-class work, so the model
 * pool may use the pipeline slots config/model-lineup.json lists for
 * "game_questions" (Standard Compute, inside its ledger) when the free NVIDIA
 * lane is saturated. Before 2026-10-28 the call carried no dataClass, defaulted
 * to "learner", and a saturated NVIDIA left the base set unwritten.
 *   node scripts/game-pipeline-class-test.js
 */
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
process.env.DB_FILE = path.join(os.tmpdir(), `game-pipeline-class-test-${process.pid}.json`);

const ai = require('../services/ai');
const gameAssignments = require('../config/game-assignments');
const games = require('../services/game-payloads');

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`); } };

(async () => {
  const seen = [];
  ai.structured = async (req) => { seen.push(req); return null; };
  // Force a model-written (not bank) assignment: the first registered engine with a schema.
  const engineId = gameAssignments.registeredEngines().find((id) => games.schemaFor(id) && games.engineHtml(id));
  check('an engine exists to test with', !!engineId, engineId);
  gameAssignments.resolve = () => ({ engineId, overrides: {}, source: 'level' });
  if (engineId) {
    await games.ensure(null, 'math', 'calculus_i', 11, {});
    check('the shared set was asked for', seen.length >= 1, seen.length);
    check('a shared set (no user) is pipeline-class work', seen.every((r) => r.task === 'game_questions' && r.dataClass === 'pipeline' && !r.userId), seen.map((r) => [r.task, r.dataClass, r.userId]));
  }
  // Math sets: inequalities and repeated short answers are not faults; a real tag still is.
  const mk = (prompt, a, b) => ({ questions: [0, 1].map((i) => ({ id: `q${i}`, prompt: i ? b : prompt, choices: ['0', '1', '2', '3'], answerIndex: 0, explanation: 'e', difficulty: 3 })) });
  const schema = { questionCount: 2, choicesPerQuestion: 4 };
  const has = (r, t, o) => games.inspectPayload(r, schema, o).some((p) => p.includes(t));
  check('math: 0 < |x - a| < d is allowed', !has(mk('Why does 0 < |x - a| < d matter?', 0, 'Is x > 2?'), 'markup', { trackId: 'math' }));
  check('math: the same answer twice is allowed', !has(mk('p one', 0, 'p two'), 'answer twice', { trackId: 'math' }));
  check('math: a real tag is still markup', has(mk('Is <b>x</b> bold?', 0, 'p two'), 'markup', { trackId: 'math' }));
  check('other subjects: < is still markup, the same answer twice still a fault', has(mk('Is x < 2?', 0, 'p two'), 'markup', { trackId: 'english' }) && has(mk('p one', 0, 'p two'), 'answer twice', {}));
  // A grade with exact entries for only its first levels can let the bank govern the rest (bank_fallthrough).
  const entries = { levels: { 'math/calculus_i/10': { engineId: 'tic-tac-toe' } } };
  check('exact level entries make a grade authored', gameAssignments.authoredGrade(entries, 'math', 'calculus_i') === true);
  check('bank_fallthrough lets the bank govern the rest of the grade', gameAssignments.authoredGrade({ ...entries, bank_fallthrough: ['math/calculus_i'] }, 'math', 'calculus_i') === false);
  check('bank_fallthrough names one grade only', gameAssignments.authoredGrade({ levels: { 'math/algebra_1_part_a/3': { engineId: 'x' } }, bank_fallthrough: ['math/calculus_i'] }, 'math', 'algebra_1_part_a') === true);
  console.log(failed ? `${failed} FAILED, ${passed} passed` : `${passed}/${passed} passed`);
  process.exit(failed ? 1 : 0);
})();
