/**
 * Pilot: questions written for ONE objective each, for the coverage model's
 * probes, proof checks and memory checks (curriculum-build/ADAPTIVE-COVERAGE.md).
 *
 *   NODE_PATH=../node_modules node curriculum-build/staged/adaptation/build-objective-items.js \
 *     --grades=math:volume_coordinates_and_expressions,english:intermediate [--limit=2] [--per=3]
 *
 * Why: the bank's practice questions are written per skill, so on their own
 * they can prove a skill rather than an objective (the coverage audit measured
 * 7-15% premature proofs from them). An objective is only proven with right
 * answers to questions written for it, and a memory check needs them too.
 *
 * Free models only, called straight through services/providers/nvidia.js with
 * explicit models (no chain, so nothing can fall through to a paid provider):
 *   writer   deepseek-ai/deepseek-v4.1-flash (high)
 *   judge A  nvidia/nemotron-3-ultra-550b-a55b (medium)   — answers blind
 *   judge B  z-ai/glm-5.3 (high)                           — answers blind
 * Two independent judges from other model families answer every question
 * without the key and say whether it tests the objective, has exactly one right
 * option and suits the grade. Code checks run first. A question is kept only
 * when the code checks pass and BOTH judges independently pick the key and say
 * yes to all three. Everything is staged here; nothing is served.
 *
 * Only NVIDIA_API_KEY is read from ../.env (never printed), plus the two xKiro lines
 * when XKIRO_PIPELINE=1 asks for that fallback. No other key is loaded.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT_DIR = __dirname;

// Load only the NVIDIA key (and xKiro's, for its opt-in fallback), so no other
// provider can be reached from here.
(function loadKeys() {
  const envFile = [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')].find((f) => fs.existsSync(f));
  if (!envFile) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  const names = ['NVIDIA_API_KEY', ...(process.env.XKIRO_PIPELINE === '1' ? ['XKIRO_API_KEY', 'XKIRO_BASE_URL'] : [])];
  for (const name of names) {
    if (process.env[name]) continue;
    const line = lines.find((l) => new RegExp(`^${name}\\s*=`).test(l));
    if (line) process.env[name] = line.replace(new RegExp(`^${name}\\s*=\\s*`), '').replace(/^["']|["']$/g, '').trim();
  }
}());
process.env.NVIDIA_RPM = process.env.NVIDIA_RPM || '20';
process.env.NVIDIA_CONCURRENCY = process.env.NVIDIA_CONCURRENCY || '4';

const nvidia = require(path.join(ROOT, 'services', 'providers', 'nvidia.js'));
const coverage = require(path.join(ROOT, 'services', 'coverage.js'));
const curriculum = require(path.join(ROOT, 'config', 'curriculum.js'));

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
const GRADES = opt('grades', 'math:volume_coordinates_and_expressions,english:intermediate').split(',');
const LIMIT = Number(opt('limit', 0));
const PER = Number(opt('per', 3));
const PARALLEL = Number(opt('parallel', 4));

const WRITER = [{ model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'high' }, { model: 'z-ai/glm-5.3-flash', effort: 'high' }];
const JUDGE_A = [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }];
const JUDGE_B = [{ model: 'z-ai/glm-5.3', effort: 'high' }];

const WRITE_SYSTEM = `You write short multiple-choice questions that test ONE learning objective of a school course, for checking whether a learner can still do it days later.
Rules:
- Every question tests exactly the objective given, not neighbouring topics, at the grade level given.
- Exactly 4 options, exactly one correct; wrong options are plausible mistakes a learner makes on this objective.
- Text only: no pictures, diagrams, audio or "the figure below". Everything needed is in the question.
- Do not put the correct option's wording inside the question. No "all of the above" or "none of the above".
- Facts and arithmetic must be exactly right. Keep each question under 60 words.
- Each question is different in what it asks (not the same question with new numbers).`;

const WRITE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answer_index: { type: 'integer' },
          rationale: { type: 'string' },
        },
        required: ['prompt', 'choices', 'answer_index', 'rationale'],
      },
    },
  },
  required: ['questions'],
};

const JUDGE_SYSTEM = `You check quiz questions for a school course. For each question, solve it yourself first and pick the option you believe is correct (you are not told the key). Then judge:
- tests_objective: does it test the learning objective given (not a different topic)?
- one_correct: is exactly one option correct, with no ambiguity?
- grade_ok: is it suitable for the grade given, and answerable from the text alone?
Be strict: a question with a factual error, two defensible answers, or a missing picture fails.`;

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          chosen_index: { type: 'integer' },
          tests_objective: { type: 'boolean' },
          one_correct: { type: 'boolean' },
          grade_ok: { type: 'boolean' },
          issue: { type: 'string' },
        },
        required: ['index', 'chosen_index', 'tests_objective', 'one_correct', 'grade_ok', 'issue'],
      },
    },
  },
  required: ['verdicts'],
};

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Code checks, before any judge sees a question. */
function codeChecks(q) {
  const problems = [];
  if (!q || typeof q.prompt !== 'string' || q.prompt.trim().length < 12) problems.push('prompt missing or too short');
  if (q.prompt && q.prompt.split(/\s+/).length > 80) problems.push('prompt over 80 words');
  if (!Array.isArray(q.choices) || q.choices.length !== 4) problems.push('not exactly 4 choices');
  else {
    if (new Set(q.choices.map(norm)).size !== 4) problems.push('duplicate choices');
    if (q.choices.some((c) => !String(c).trim())) problems.push('empty choice');
    if (q.choices.some((c) => /\b(all|none) of the above\b/i.test(c))) problems.push('all/none of the above');
  }
  if (!Number.isInteger(q.answer_index) || q.answer_index < 0 || q.answer_index > 3) problems.push('answer index out of range');
  else if (Array.isArray(q.choices) && q.choices[q.answer_index] && norm(q.choices[q.answer_index]).length > 3
    && norm(q.prompt).includes(norm(q.choices[q.answer_index]))) problems.push('the correct option is written in the question');
  // "solid figure" is geometry; "the figure below" is a missing picture.
  if (/\b(picture|diagram|image|listen to|audio)\b|\b(the|this) (figure|graph|grid|model) (below|above|shown)\b|\b(shown|pictured) (below|above|here)\b|\bin the (figure|diagram)\b/i.test(q.prompt || '')) problems.push('needs a picture or audio');
  if (!String(q.rationale || '').trim()) problems.push('no rationale');
  return problems;
}

// When NVIDIA refuses (its GLM 5.3 and DeepSeek were rate-limited for hours on
// 2026-10-23), the same step goes to xKiro's free models instead: the writer to
// MiniMax M3.1 Flash (the account's free grant), judge B to Qwen3.8 Max then Mistral
// Large 3, a different family from judge A (Nemotron). Build use only; no learner data.
const XKIRO_FALLBACK = new Map([
  [WRITER, ['minimax/minimax-m3.1-flash']],
  [JUDGE_B, ['qwen/qwen3.8-max:free', 'mistralai/mistral-large-2512']],
]);
async function call(models, system, user, schema, schemaName, maxTokens) {
  const t0 = Date.now();
  let r = null;
  const fallback = XKIRO_FALLBACK.get(models);
  const viaXkiro = () => {
    // eslint-disable-next-line global-require
    const { xkiro } = require(path.join(ROOT, 'services', 'providers', 'xkiro.js'));
    return xkiro.structured({ system, user, schema, schemaName, maxTokens, models: fallback, timeoutMs: 240000 });
  };
  // XKIRO_FIRST=1: NVIDIA's models for this step are known to be refusing, so skip
  // the retries that would only spend its allowance.
  if (fallback && process.env.XKIRO_PIPELINE === '1' && process.env.XKIRO_FIRST === '1') {
    r = await viaXkiro();
  } else {
    try {
      r = await nvidia.structured({ role: 'check', system, user, schema, schemaName, maxTokens, models, timeoutMs: 240000, attempts: 3 });
    } catch (err) {
      if (!fallback || process.env.XKIRO_PIPELINE !== '1') throw err;
      r = await viaXkiro();
    }
  }
  return { data: r && r.data, model: r && r.model, ms: Date.now() - t0, usage: r && r.usage };
}

async function judge(models, objective, gradeName, questions) {
  const user = [
    `Course grade: ${gradeName}`,
    `Learning objective: ${objective.title} — ${objective.covers}`,
    '',
    ...questions.map((q, i) => `Question ${i}: ${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`),
    '',
    'Return one verdict per question, with its index.',
  ].join('\n');
  const r = await call(models, JUDGE_SYSTEM, user, JUDGE_SCHEMA, 'submit_verdicts', 6000);
  const byIndex = new Map(((r.data && r.data.verdicts) || []).map((v) => [v.index, v]));
  return { model: r.model, ms: r.ms, verdicts: questions.map((_, i) => byIndex.get(i) || null) };
}

async function one(ref, gradeName, objective) {
  const user = `Course grade: ${gradeName}\nLearning objective: ${objective.title} — ${objective.covers}\n\nWrite ${PER} questions.`;
  let written;
  try {
    written = await call(WRITER, WRITE_SYSTEM, user, WRITE_SCHEMA, 'submit_questions', 5000);
  } catch (err) {
    return { objective: objective.id, error: `writer: ${err.message}`, items: [] };
  }
  const questions = ((written.data && written.data.questions) || []).slice(0, PER + 1);
  const checked = questions.map((q) => ({ q, problems: codeChecks(q) }));
  const passing = checked.filter((c) => !c.problems.length).map((c) => c.q);
  let a = { verdicts: [] };
  let b = { verdicts: [] };
  if (passing.length) {
    try {
      [a, b] = await Promise.all([judge(JUDGE_A, objective, gradeName, passing), judge(JUDGE_B, objective, gradeName, passing)]);
    } catch (err) {
      return { objective: objective.id, error: `judge: ${err.message}`, items: [], writer: written.model };
    }
  }
  const items = [];
  const rejected = checked.filter((c) => c.problems.length).map((c) => ({ prompt: c.q && c.q.prompt, reason: `code: ${c.problems.join('; ')}` }));
  passing.forEach((q, i) => {
    const va = a.verdicts[i];
    const vb = b.verdicts[i];
    const ok = (v) => v && v.chosen_index === q.answer_index && v.tests_objective && v.one_correct && v.grade_ok;
    if (ok(va) && ok(vb)) {
      items.push({
        objective_id: objective.id,
        track_id: objective.track_id,
        grade_id: objective.grade_id,
        skill_id: objective.skill,
        level: objective.lesson_level,
        format: 'multiple_choice',
        prompt: q.prompt.trim(),
        choices: q.choices.map((c) => String(c).trim()),
        answer: String(q.choices[q.answer_index]).trim(),
        rationale: String(q.rationale).trim(),
        verified: { code: true, judge_a: a.model, judge_b: b.model },
      });
    } else {
      const why = [va, vb].map((v, j) => {
        const name = j ? 'B' : 'A';
        if (!v) return `${name}: no verdict`;
        const bits = [];
        if (v.chosen_index !== q.answer_index) bits.push(`picked ${v.chosen_index} not ${q.answer_index}`);
        if (!v.tests_objective) bits.push('off objective');
        if (!v.one_correct) bits.push('not exactly one correct');
        if (!v.grade_ok) bits.push('not suitable');
        return bits.length ? `${name}: ${bits.join(', ')}${v.issue ? ` (${String(v.issue).slice(0, 160)})` : ''}` : null;
      }).filter(Boolean);
      rejected.push({ prompt: q.prompt, choices: q.choices, answer_index: q.answer_index, reason: why.join(' | ') });
    }
  });
  return { objective: objective.id, title: objective.title, writer: written.model, judge_a: a.model, judge_b: b.model, written: questions.length, items, rejected };
}

// Every finished objective is appended here as it completes, so a run that is
// stopped (a paused agent, a lost connection) resumes where it left off.
const CACHE = path.join(OUT_DIR, 'objective-items.cache.jsonl');
function cached() {
  const out = new Map();
  if (!fs.existsSync(CACHE)) return out;
  for (const line of fs.readFileSync(CACHE, 'utf8').split(/\n/)) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (!r.error) out.set(r.objective, r); } catch { /* a torn last line */ }
  }
  return out;
}

async function pool(tasks, n) {
  const out = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
      process.stdout.write(`  ${i + 1}/${tasks.length} ${out[i].objective}: kept ${out[i].items.length}/${out[i].written || 0}${out[i].error ? ` ERROR ${out[i].error}` : ''}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return out;
}

async function main() {
  if (!process.env.NVIDIA_API_KEY) { console.error('no NVIDIA key available'); process.exit(2); }
  const started = Date.now();
  const report = { started_at: new Date().toISOString(), per_objective: PER, writer: WRITER, judge_a: JUDGE_A, judge_b: JUDGE_B, grades: {} };
  for (const ref of GRADES) {
    const [trackId, gradeId] = ref.split(':');
    const grade = curriculum.getGrade(trackId, gradeId);
    let objectives = coverage.objectivesFor(trackId, gradeId);
    if (LIMIT) objectives = objectives.slice(0, LIMIT);
    console.log(`${ref}: ${objectives.length} objectives`);
    const done = cached();
    const results = await pool(objectives.map((o) => async () => {
      if (done.has(o.id)) return done.get(o.id);
      // Rate limits and short network outages: retry with backoff (1, 2, 4, 8 minutes).
      let r = await one(ref, `${grade.name}`, o);
      for (let attempt = 0; r.error && attempt < 4; attempt++) {
        await new Promise((res) => { setTimeout(res, 60000 * 2 ** attempt); });
        r = await one(ref, `${grade.name}`, o);
      }
      if (!r.error) fs.appendFileSync(CACHE, `${JSON.stringify(r)}\n`);
      return r;
    }), PARALLEL);
    const items = results.flatMap((r) => r.items);
    const file = path.join(OUT_DIR, `objective-items.${trackId}.${gradeId}.json`);
    fs.writeFileSync(file, JSON.stringify({ track_id: trackId, grade_id: gradeId, generated_at: new Date().toISOString(), items }, null, 1));
    report.grades[ref] = {
      objectives: objectives.length,
      written: results.reduce((s, r) => s + (r.written || 0), 0),
      kept: items.length,
      objectives_with_two_or_more: results.filter((r) => r.items.length >= 2).length,
      objectives_with_none: results.filter((r) => !r.items.length).map((r) => r.objective),
      errors: results.filter((r) => r.error).map((r) => ({ objective: r.objective, error: r.error })),
      rejected: results.flatMap((r) => (r.rejected || []).map((x) => ({ objective: r.objective, ...x }))),
      file: path.basename(file),
    };
  }
  report.seconds = Math.round((Date.now() - started) / 1000);
  fs.writeFileSync(path.join(OUT_DIR, 'objective-items.report.json'), JSON.stringify(report, null, 1));
  for (const [ref, g] of Object.entries(report.grades)) console.log(`${ref}: ${g.kept} kept of ${g.written} written; ${g.objectives_with_two_or_more}/${g.objectives} objectives have 2+; errors ${g.errors.length}`);
  console.log(`done in ${report.seconds}s`);
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
