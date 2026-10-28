/**
 * Typed-answer grading, tested with no model calls (every judge is mocked):
 *
 *   - the rules' form fixes (lowest terms, as a fraction / decimal, capitalization and
 *     accent items, lists and mixed numbers read as numbers)
 *   - the deterministic checks (copied prompt, no attempt, listed wrong option,
 *     contractions, numbers in words, Spanish numbers, units)
 *   - every labelled case the rules and the deterministic checks settle is settled right
 *   - the consensus policy: accept only on agreement with a strong judge and no veto;
 *     escalation on disagreement; an unsettled answer is NOT accepted
 *   - the interactive budget: a slow cascade returns "checking" and settles later
 *   - a learner without outside-AI consent: only local judges are asked
 *
 * Keys are blanked first; the DB is a temporary copy unless DB_FILE names one.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|FACT_CHECK)_.*KEY/.test(name)) process.env[name] = '';
}
const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `grading-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
process.env.ANTHROPIC_LEDGER_FILE = path.join(os.tmpdir(), `grading-test-${process.pid}-anthropic.json`);
process.env.OLLAMA_ENABLED = '0';

const grading = require('../services/grading');
const tg = require('../services/typed-grading');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`); }
}
const item = (prompt, answer, extra = {}) => ({ format: 'type_in', prompt, answer, ...extra });

async function main() {
  console.log('rules: the form the question asks for');
  check('"lowest terms": an unreduced fraction is wrong', grading.grade(item('Write 24/32 in lowest terms.', '3/4'), '24/32').correct === false);
  check('"lowest terms": the reduced fraction is right', grading.grade(item('Write 24/32 in lowest terms.', '3/4'), '3/4').correct === true);
  check('"as a fraction": a decimal of the same value is wrong', grading.grade(item('1/2 + 1/4 = (answer in lowest terms, as a fraction like 3/4)', '3/4'), '0.75').correct === false);
  check('capitalization item: the unfixed sentence goes to the grader, not straight to "right"',
    (() => { const r = grading.grade({ format: 'short_answer', prompt: 'Fix the capitalization: "i went to paris in may."', answer: 'I went to Paris in May.' }, 'i went to paris in may'); return !r.correct && r.needsAi; })());
  check('accent item: the word without its accent is wrong', grading.grade(item('Write cancion with its written accent.', 'canción'), 'cancion').correct === false);
  check('accent item: capitals still forgiven', grading.grade(item('Write cancion with its written accent.', 'canción'), 'Canción').correct === true);
  check('a list is not read as one number ("1, 2" is not 12)', grading.grade(item('What is 6 + 6?', '12'), '1 2').correct === false);
  check('a list in another order goes to the grader instead of being marked wrong', grading.grade(item('List all the factors of 12.', '1, 2, 3, 4, 6, 12'), '12, 6, 4, 3, 2, 1').needsAi === true);
  check('thousands separators still read (1,250,000)', grading.grade(item('Population?', '1250000'), '1,250,000').correct === true);
  check('a mixed number is read as one (1 1/2 = 1.5, not 11/2)', grading.grade(item('q', '1.5'), '1 1/2').correct === true && grading.grade(item('q', '5.5'), '1 1/2').correct === false);
  check('"x = 8." still equals 8', grading.grade(item('If 9x + 18 = 90, what is x?', '8'), 'x = 8.').correct === true);
  check('a type-in that is not a number goes to the grader (valid alternates exist)', grading.grade(item('How do you say 5:15 in Spanish?', 'son las cinco y cuarto'), 'son las cinco y quince').needsAi === true);

  console.log('\nthe deterministic checks');
  const pj = (i, a) => tg.preJudge(i, a);
  check('the prompt\'s own sentence typed back is wrong', (pj({ prompt: 'Fix the verb: "The dog bark loudly."', answer: 'The dog barks loudly.' }, 'The dog bark loudly.') || {}).verdict === 'incorrect');
  check('"idk" is no attempt', (pj({ prompt: 'q', answer: 'x' }, 'idk') || {}).verdict === 'incorrect');
  check('"none" is NOT treated as no attempt (it can be the answer)', pj({ prompt: 'How many are left?', answer: '0' }, 'none') === null);
  check('a contraction of the key is right', (pj({ prompt: 'Negate it: "They filed it."', answer: 'They did not file it.' }, "They didn't file it.") || {}).verdict === 'correct');
  check('...but never accepted on a contraction or capitalization item', (pj({ prompt: 'Write the contraction of "did not".', answer: "didn't" }, 'did not') || {}).verdict !== 'correct'
    && pj({ prompt: 'Fix the capitalization: "we visited new york in july."', answer: 'We visited New York in July.' }, 'We visited New York in july.') === null);
  check('a different Spanish number is wrong; the same one is right', (pj({ prompt: 'Write the number 53 in Spanish.', answer: 'cincuenta y tres' }, 'cincuenta') || {}).verdict === 'incorrect'
    && (pj({ prompt: 'Write the number 16 in Spanish.', answer: 'dieciséis' }, 'diez y seis') || {}).verdict === 'correct');
  check('"ciento" alone and "veinte y uno" are left to a judge, never accepted here', pj({ prompt: 'Write the number 100 in Spanish.', answer: 'cien' }, 'ciento') === null && pj({ prompt: 'Write the number 21 in Spanish.', answer: 'veintiuno' }, 'veinte y uno') === null);
  check('a number in words', (pj(item('How many sides does a hexagon have?', '6'), 'six') || {}).verdict === 'correct' && (pj(item('How many hearts?', 'Two'), 'three') || {}).verdict === 'incorrect');
  check('the right number with the question\'s unit is right; a different number is wrong', (pj(item('How many cups of flour?', '6'), '6 cups') || {}).verdict === 'correct' && (pj(item('Jamal reads 15 pages a day. How many days?', '6'), '5 days') || {}).verdict === 'incorrect');
  check('a unit symbol or another unit is left to a judge ("26 cm²" for a perimeter, "30 cm" for an area)',
    pj(item('A rectangle is 8 cm by 5 cm. What is its perimeter?', '26 cm'), '26 cm²') === null && pj(item('Area of a triangle with base 10 cm, height 6 cm?', '30 cm²'), '30 cm') === null);
  check('"12%" for "15% of 80" is not accepted here', !(pj(item('What is 15% of 80?', '12'), '12%') || {}).verdict || pj(item('What is 15% of 80?', '12'), '12%').verdict !== 'correct');

  console.log('\nthe labelled cases the rules and checks settle');
  const casesFile = path.join(__dirname, '..', 'curriculum-build', 'grading-cascade', 'cases.json');
  if (fs.existsSync(casesFile)) {
    const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
    let settled = 0; const wrong = [];
    for (const c of cases) {
      const it = { format: c.format || 'short_answer', prompt: c.question, answer: c.reference, accepts: c.accepted || [] };
      const r = grading.grade(it, c.learner);
      let verdict = r.correct ? 'correct' : !r.needsAi ? 'incorrect' : null;
      if (!verdict) { const p = tg.preJudge(it, c.learner); verdict = p ? p.verdict : null; }
      if (!verdict) continue;
      settled++;
      if ((verdict === 'correct') !== c.truth) wrong.push(c.id);
    }
    check(`all ${settled} of ${cases.length} cases settled without a model are settled right (0 false accepts, 0 false rejects)`, wrong.length === 0, wrong);
  }

  console.log('\nconsensus');
  const pol = { ...tg.DEFAULT_POLICY, strong: ['ultra', 'glm-max'], veto: ['ultra', 'glm-max', 'lightning'], min_confidence: 0.6 };
  const v = (judge, verdict, confidence = 0.9) => ({ judge, verdict, confidence });
  check('two agreeing judges, one strong: accepted', tg.decide([v('ultra', 'correct'), v('lightning', 'correct')], pol) === 'correct');
  check('two weak judges agreeing: not accepted', tg.decide([v('lightning', 'correct'), v('qwen-local', 'correct')], pol) === null);
  check('one strong judge alone: not accepted', tg.decide([v('ultra', 'correct')], pol) === null);
  check('a veto blocks acceptance', tg.decide([v('ultra', 'correct'), v('glm-max', 'correct'), v('lightning', 'incorrect')], pol) === null);
  check('low confidence counts as unsure', tg.decide([v('ultra', 'correct', 0.4), v('glm-max', 'correct')], pol) === null);
  check('two agreeing rejections with no "correct": rejected', tg.decide([v('ultra', 'incorrect'), v('lightning', 'incorrect')], pol) === 'incorrect');

  console.log('\nthe cascade (mocked judges)');
  const calls = [];
  let script = {};
  let delay = 0;
  const fake = (provider) => ({
    name: provider,
    isConfigured: () => true,
    isEnabled: () => true,
    outage: () => ({ state: 'ok' }),
    health: async () => ({ ok: true }),
    structured: async (args) => {
      const model = (args.models && args.models[0] && (args.models[0].model || String(args.models[0]).split('@')[0])) || provider;
      calls.push(model);
      if (delay) await new Promise((r) => { setTimeout(r, delay); });
      const id = Object.keys(tg.JUDGES).find((k) => tg.JUDGES[k].model === model && tg.JUDGES[k].provider === provider);
      const verdict = script[id];
      if (!verdict) throw new Error('down');
      return { data: { difference: 'd', verdict, confidence: 0.95, error_tag: 'none', feedback: 'fb' }, model };
    },
  });
  tg._setCallers({ nvidia: fake('nvidia'), ollama: fake('ollama'), openrouter_free: fake('openrouter_free'), anthropic: { ...fake('anthropic'), isEnabled: () => false } });
  const policyFile = path.join(os.tmpdir(), `grading-test-${process.pid}-lineup.json`);
  fs.writeFileSync(policyFile, JSON.stringify({ grading: {
    stages: [{ name: 'fast', judges: ['ultra', 'lightning'] }, { name: 'escalate', judges: ['glm-max'] }, { name: 'free_fallback', judges: ['or-ultra'] }],
    local_stages: [{ name: 'local', judges: ['qwen-local', 'gemma-local'] }],
    strong: ['ultra', 'glm-max', 'or-ultra'], veto: ['ultra', 'glm-max', 'or-ultra', 'lightning'], min_correct: 2, min_incorrect: 2, min_confidence: 0.6, interactive_budget_ms: 2000,
  } }));
  process.env.MODEL_LINEUP_FILE = policyFile;
  const it = { format: 'short_answer', prompt: 'Translate into Spanish: The keys are in the car.', answer: 'Las llaves están en el coche' };

  script = { ultra: 'correct', lightning: 'correct', 'glm-max': 'correct' };
  let r = await tg.gradeTyped({ item: it, userAnswer: 'Las llaves están en el carro', allowOutside: true });
  check('fast judges agree: accepted, no escalation', r.status === 'accepted' && r.correct === true && !calls.includes('z-ai/glm-5.3'), { r: r.status, calls });

  calls.length = 0;
  script = { ultra: 'correct', lightning: 'incorrect', 'glm-max': 'correct', 'or-ultra': 'correct' };
  r = await tg.gradeTyped({ item: it, userAnswer: 'Las llaves están en el auto', allowOutside: true });
  check('disagreement escalates to GLM 5.3; a veto still stands, so it is NOT accepted', calls.includes('z-ai/glm-5.3') && r.correct !== true, { status: r.status, calls });

  calls.length = 0;
  script = { ultra: 'incorrect', lightning: 'incorrect' };
  r = await tg.gradeTyped({ item: it, userAnswer: 'Las llaves son en el coche', allowOutside: true });
  check('both fast judges reject: rejected at once', r.status === 'rejected' && r.correct === false && calls.length === 2, { r: r.status, calls });

  calls.length = 0;
  script = {};
  r = await tg.gradeTyped({ item: it, userAnswer: 'Las llaves están dentro del coche', allowOutside: true });
  check('no judge answers: closed as NOT accepted (unresolved)', r.status === 'unresolved' && r.correct !== true, r.status);

  calls.length = 0;
  script = { ultra: 'correct', lightning: 'correct' };
  delay = 3000; // past the 2 s test budget (generous, so a loaded machine does not flake the other checks)
  r = await tg.gradeTyped({ item: it, userAnswer: 'Las llaves están en el carro', allowOutside: true });
  check('past the interactive budget: "checking", with the verdict settling in the background', r.status === 'checking' && r.correct === null && r.settle, r.status);
  const settled = await r.settle;
  check('the background verdict arrives', settled.status === 'accepted' && settled.correct === true, settled.status);
  delay = 0;

  calls.length = 0;
  script = { ultra: 'correct', lightning: 'correct', 'qwen-local': 'correct', 'gemma-local': 'correct' };
  r = await tg.gradeTyped({ item: it, userAnswer: 'Las llaves están en el carro', allowOutside: false });
  check('without outside-AI consent only the local judges are asked', calls.length === 2 && calls.every((m) => ['qwen3.5:4b', 'gemma4:e4b-it-qat'].includes(m)) && r.status === 'accepted', { calls, status: r.status });

  tg._setCallers(null);
  delete process.env.MODEL_LINEUP_FILE;
  fs.unlinkSync(policyFile);

  console.log('\nsessions: an answer held as "being checked"');
  const db = require('../config/db');
  const ai = require('../services/ai');
  const sessions = require('../services/sessions');
  const enrollment = db.all('enrollments').find((e) => e.user_id && db.byId('users', e.user_id));
  if (!enrollment) { console.log('  (no enrollment in this DB copy; skipped)'); return; }
  const session = db.insert('sessions', { user_id: enrollment.user_id, enrollment_id: enrollment.id, track_id: enrollment.track_id, grade_id: enrollment.grade_id, level: enrollment.level || 1, kind: 'practice', blocks: [{ index: 0, level: enrollment.level || 1 }], started_at: new Date().toISOString() });
  const held = db.insert('items', { session_id: session.id, user_id: enrollment.user_id, skill_id: 'test_skill', format: 'short_answer', prompt: it.prompt, answer: it.answer, difficulty: 3, block: 0, index: 0, user_answer: null, correct: null });
  const realGrade = ai.gradeFreeResponse;
  let release;
  const settle = new Promise((r) => { release = r; });
  ai.gradeFreeResponse = async () => ({ correct: null, status: 'checking', by: 'pending', settle });
  const shown = await sessions.answer({ userId: enrollment.user_id, session, itemId: held.id, userAnswer: 'Las llaves están en el carro', ms: 4000 });
  let row = db.byId('items', held.id);
  check('the learner gets "checking", the item reads answered-but-pending, nothing counted yet', shown.checking === true && row.grading === 'checking' && row.correct === null && row.user_answer === 'Las llaves están en el carro', { shown, grading: row.grading, correct: row.correct });
  check('a second submit reports the stored (pending) state instead of grading again', (await sessions.answer({ userId: enrollment.user_id, session, itemId: held.id, userAnswer: 'x' })).already === true);
  release({ status: 'accepted', correct: true, by: 'judges', feedback: 'Carro is right.', error_tag: null });
  const left = await sessions.settleChecking([held.id], 5000);
  row = db.byId('items', held.id);
  check('the background verdict is stored when it arrives (graded_by judges, grading settled)', left.length === 0 && row.correct === true && row.grading === 'settled' && row.graded_by === 'judges', { correct: row.correct, grading: row.grading, by: row.graded_by });
  check('the page sees the verdict', sessions.checkingStatus(row).checking === false && sessions.checkingStatus(row).correct === true);
  const held2 = db.insert('items', { session_id: session.id, user_id: enrollment.user_id, skill_id: 'test_skill', format: 'short_answer', prompt: it.prompt, answer: it.answer, difficulty: 3, block: 0, index: 1, user_answer: null, correct: null });
  ai.gradeFreeResponse = async () => ({ correct: null, status: 'checking', by: 'pending', settle: Promise.resolve({ status: 'unresolved', correct: null }) });
  await sessions.answer({ userId: enrollment.user_id, session, itemId: held2.id, userAnswer: 'Las llaves quedan en el coche' });
  await sessions.settleChecking([held2.id], 5000);
  row = db.byId('items', held2.id);
  check('an answer no judge could settle is closed as NOT accepted and flagged for review', row.correct === false && row.graded_by === 'unresolved' && row.needs_review === true, { correct: row.correct, by: row.graded_by });
  ai.gradeFreeResponse = realGrade;
}

main().catch((err) => { failures++; console.log(`  FAIL threw: ${err.stack}`); }).finally(() => {
  for (const f of [ownCopy, process.env.ANTHROPIC_LEDGER_FILE]) { try { if (f) fs.unlinkSync(f); } catch { /* gone */ } }
  console.log(failures ? `\n${failures} failed` : '\nall grading checks passed');
  process.exit(failures ? 1 : 0);
});
