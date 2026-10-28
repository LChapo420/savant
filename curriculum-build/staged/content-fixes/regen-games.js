/**
 * Verified regeneration of the English Proficient game payloads (staged only).
 *
 *   XKIRO_PIPELINE=1 DB_FILE=<a copy of data/db.json> DB_READONLY=1 \
 *     node curriculum-build/staged/content-fixes/regen-games.js --rows=13,64 [--rounds=2] [--chunk=6] [--resume]
 *
 * The 70 stored games (game_payloads, english:proficient) were written by GLM 5.3
 * Flash and imported with no answer check; the 2026-10-23 fact audit confirmed 156
 * errors in 63 of them and estimates ~27% of their 3,500 questions are defective
 * (curriculum-build/CONTENT-FACT-AUDIT.md). This rewrites a game's question set and
 * keeps a question only when it survives every gate:
 *
 *   1. writer       MiniMax M3.1 Flash on xKiro (its free token grant), the level's own
 *                   game prompt (scripts/lib/game-prompt.js) plus the accuracy rules below
 *   2. code checks  services/game-payloads.js inspectPayload's per-question checks
 *                   (shape, distinct options, the length giveaway) and the explanation-key
 *                   agreement check (services/key-agreement.js)
 *   3. two judges   each answers BLIND (never sees the key or the explanation) and says
 *                   whether exactly one option is right; kept only when BOTH pick the key
 *                   and both say yes. Judge A: NVIDIA Nemotron Ultra. Judge B, another
 *                   family: NVIDIA GLM 5.3, else xKiro Qwen3.8 Max / Mistral Large 3 (free),
 *                   else OpenRouter Gemma 4 31B (:free, price verified $0)
 *   4. rewrite      questions that fail are written again (up to --rounds), never patched
 *
 * Output: curriculum-build/staged/content-fixes/games/game-<row>.json (the replacement
 * payload, in the stored envelope, plus every rejected question with its reason) and
 * games/report.json. data/db.json is never written: the DB is opened read-only on a copy.
 *
 * Keys: only NVIDIA_API_KEY, XKIRO_API_KEY, XKIRO_BASE_URL and OPENROUTER_API_KEY are
 * read from ../.env (never printed). No Anthropic call can be made from here.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(__dirname, 'games');

(function loadKeys() {
  const envFile = [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')].find((f) => fs.existsSync(f));
  if (!envFile) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const name of ['NVIDIA_API_KEY', 'XKIRO_API_KEY', 'XKIRO_BASE_URL', 'OPENROUTER_API_KEY']) {
    if (process.env[name]) continue;
    const line = lines.find((l) => new RegExp(`^${name}\\s*=`).test(l));
    if (line) process.env[name] = line.replace(new RegExp(`^${name}\\s*=\\s*`), '').replace(/^["']|["']$/g, '').trim();
  }
}());
// No paid provider is reachable from here: Anthropic is never required, and these are off.
process.env.ANTHROPIC_API_KEY = '';
process.env.OLLAMA_ENABLED = '0';
process.env.NVIDIA_RPM = process.env.NVIDIA_RPM || '12';
process.env.NVIDIA_CONCURRENCY = process.env.NVIDIA_CONCURRENCY || '2';
if (process.env.XKIRO_PIPELINE !== '1') { console.error('set XKIRO_PIPELINE=1 (build pipeline only)'); process.exit(2); }
if (!process.env.DB_FILE || path.resolve(process.env.DB_FILE) === path.join(ROOT, 'data', 'db.json')) { console.error('set DB_FILE to a COPY of data/db.json'); process.exit(2); }
process.env.DB_READONLY = '1';

const db = require(path.join(ROOT, 'config', 'db.js'));
const games = require(path.join(ROOT, 'services', 'game-payloads.js'));
const gamePrompt = require(path.join(ROOT, 'scripts', 'lib', 'game-prompt.js'));
const { keyAgreement } = require(path.join(ROOT, 'services', 'key-agreement.js'));
const nvidia = require(path.join(ROOT, 'services', 'providers', 'nvidia.js'));
const { xkiro } = require(path.join(ROOT, 'services', 'providers', 'xkiro.js'));
const { openrouterFree } = require(path.join(ROOT, 'services', 'providers', 'free-apis.js'));

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
const ROWS = opt('rows', '').split(',').map(Number).filter(Boolean);
const ROUNDS = Number(opt('rounds', 2));
// MiniMax reasons at length before it answers: 17 questions ran out of tokens with nothing
// written (2026-10-23), 6 at a time is reliable.
const CHUNK = Number(opt('chunk', 6));
const JUDGE_BATCH = Number(opt('batch', 10));
const RESUME = argv.includes('--resume');

const WRITER = ['minimax/minimax-m3.1-flash'];
const JUDGE_A = [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }];
const JUDGE_B_NVIDIA = [{ model: 'z-ai/glm-5.3', effort: 'high' }];
const JUDGE_B_XKIRO = ['qwen/qwen3.8-max:free', 'mistralai/mistral-large-2512'];
const JUDGE_B_OPENROUTER = ['google/gemma-4-31b-it:free'];
// Last resort for judge B: NVIDIA's small Nemotron. Same family as judge A, so its
// agreement is weaker evidence; every kept question records which judge B answered.
const JUDGE_B_LAST = [{ model: 'nvidia/nemotron-3.5-lightning-30b-a3b', effort: 'medium' }];

/** The NVIDIA watcher's latest line says GLM 5.3 is refusing: do not hammer it. */
function glmRefusing() {
  try {
    const lines = fs.readFileSync(path.join(ROOT, 'curriculum-build', 'nvidia-probe-log.txt'), 'utf8').trim().split(/\r?\n/);
    return /glm-5\.3=429/.test(lines[lines.length - 1] || '');
  } catch { return false; }
}

// Added to the level's own game prompt: the audit's three failure modes, named.
const ACCURACY_RULES = `

Accuracy rules (an answer-key audit of earlier games found these mistakes; none may appear):
- Decide the correct option FIRST, then write the explanation about that option, then set answerIndex to that option's position (0-based). The explanation must describe the option at answerIndex, never another one.
- The four options are four different texts. Never repeat an option, even with different capitals.
- Exactly one option is correct. If two options could be defended (for example a comma splice is also a run-on; a dash can both add emphasis and set off extra information), rewrite the options.
- Do not build a question on a false premise, and keep each explanation to one accurate sentence.`;

const JUDGE_SYSTEM = `You check quiz questions for an English course (grades 9-10). For each question, work it out yourself and pick the option you believe is correct (you are not told the key). Then say whether exactly one option is correct, with no ambiguity and no false premise. Be strict: two defensible options, no correct option, a factual or grammar error, or a question that does not make sense all fail one_correct.`;
const JUDGE_SCHEMA = {
  type: 'object',
  properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' }, one_correct: { type: 'boolean' }, issue: { type: 'string' } }, required: ['index', 'chosen_index', 'one_correct', 'issue'] } } },
  required: ['verdicts'],
};

const tokens = { writer: 0, judge_a: 0, judge_b: 0 };
const addTokens = (k, u) => { if (u) tokens[k] += (u.input_tokens || u.input || 0) + (u.output_tokens || u.output || 0); };

// The questions only: the stored game keeps its title, feedback lines and settings.
// No field is required per question here: one question missing its difficulty must not
// void a whole chunk. Each question then meets the code checks on its own, and one with
// a missing field is rejected there, with the reason.
const WRITE_SCHEMA = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answerIndex: { type: 'integer' },
          explanation: { type: 'string' },
          difficulty: { type: 'integer' },
          skill: { type: 'string' },
          topic: { type: 'string' },
        },
      },
    },
  },
};

async function write(prompt, schema, count, already) {
  const user = `${prompt.user}${already.length ? `\n\nTHE SET ALREADY HAS THESE QUESTIONS — do not repeat any of them, their facts, or their answers:\n${already.map((q) => `- ${String(q.prompt).slice(0, 150)} (answer: ${String((Array.isArray(q.choices) ? q.choices : [])[q.answerIndex] || '').slice(0, 70)})`).join('\n').slice(0, 9000)}` : ''}\n\nWrite exactly ${count} questions now, as {"questions": [{"prompt", "choices" (exactly ${schema.choicesPerQuestion || 4}), "answerIndex" (0-based), "explanation", "difficulty" (1-10), "skill", "topic"}]}.`;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    // "temporarily at capacity": wait 30 s, then 60 s
    // eslint-disable-next-line no-await-in-loop
    if (attempt) await new Promise((res) => { setTimeout(res, 30000 * attempt); });
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await xkiro.structured({ system: prompt.system + ACCURACY_RULES, user, schema: WRITE_SCHEMA, schemaName: 'submit_game_questions', maxTokens: 14000, models: WRITER, timeoutMs: 300000 });
      addTokens('writer', r && r.usage);
      const reply = games.normalizeReply(r && r.data);
      return { questions: (reply && Array.isArray(reply.questions) ? reply.questions : []).filter((q) => q && typeof q === 'object').slice(0, count), model: r && r.model };
    } catch (err) {
      lastErr = err;
      console.warn(`  writer attempt ${attempt + 1}: ${err.message}`);
    }
  }
  console.warn(`  writer gave up on this chunk: ${lastErr && lastErr.message}`);
  return { questions: [], model: null };
}

/** Per-question code checks: the game checker's own (on a one-question set) plus key agreement. */
function codeProblems(q, schema) {
  const one = games.inspectPayload({ questions: [q] }, { ...schema, questionCount: 1 }).filter((p) => /^q1:/.test(p)).map((p) => p.replace(/^q1:\s*/, ''));
  const opts = Array.isArray(q && q.choices) ? q.choices.map(String) : [];
  const ka = keyAgreement({ choices: opts, answerIndex: Number(q && q.answerIndex), explanation: String((q && q.explanation) || '') });
  if (ka.flagged) one.push(`explanation-key: ${ka.reason}`);
  return one;
}

async function judgeWith(which, batch) {
  const user = `${batch.map((q, i) => `Question ${i}: ${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`).join('\n\n')}\n\nReturn one verdict per question, with its index.`;
  const args = { system: JUDGE_SYSTEM, user, schema: JUDGE_SCHEMA, schemaName: 'submit_verdicts', maxTokens: 6000 };
  let r = null;
  if (which === 'A') {
    r = await nvidia.structured({ role: 'check', ...args, models: JUDGE_A, timeoutMs: 240000, attempts: 2 });
  } else {
    const tries = [
      ...(glmRefusing() ? [] : [() => nvidia.structured({ role: 'check', ...args, models: JUDGE_B_NVIDIA, timeoutMs: 240000, attempts: 1 })]),
      () => xkiro.structured({ ...args, models: JUDGE_B_XKIRO, timeoutMs: 240000 }),
      () => openrouterFree.structured({ ...args, models: JUDGE_B_OPENROUTER, timeoutMs: 240000 }),
      () => nvidia.structured({ role: 'check', ...args, models: JUDGE_B_LAST, timeoutMs: 240000, attempts: 1 }),
    ];
    let lastErr = null;
    for (const t of tries) {
      try { r = await t(); if (r && r.data) break; } catch (err) { lastErr = err; console.warn(`  judge B fallback: ${String(err.message).slice(0, 120)}`); }
    }
    if (!r || !r.data) throw lastErr || new Error('judge B: no free judge answered');
  }
  addTokens(which === 'A' ? 'judge_a' : 'judge_b', r && r.usage);
  const by = new Map(((r && r.data && r.data.verdicts) || []).map((v) => [v.index, v]));
  return { model: r && r.model, verdicts: batch.map((_, i) => by.get(i) || null) };
}

async function judgeAll(questions) {
  const out = [];
  for (let s = 0; s < questions.length; s += JUDGE_BATCH) {
    const batch = questions.slice(s, s + JUDGE_BATCH);
    // A judge that fails (a network blip, a busy model) is asked again after 30 s,
    // 60 s and 120 s before its verdicts count as missing.
    const withRetry = async (which) => {
      let last = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        // eslint-disable-next-line no-await-in-loop
        if (attempt) { console.warn(`  judge ${which} retry ${attempt} after: ${String(last).slice(0, 100)}`); await new Promise((res) => { setTimeout(res, 30000 * 2 ** (attempt - 1)); }); }
        try {
          // eslint-disable-next-line no-await-in-loop
          return await judgeWith(which, batch);
        } catch (err) { last = err.message; }
      }
      return { model: null, error: last, verdicts: batch.map(() => null) };
    };
    // eslint-disable-next-line no-await-in-loop
    const [a, b] = await Promise.all([withRetry('A'), withRetry('B')]);
    batch.forEach((q, i) => out.push({ q, a: a.verdicts[i], b: b.verdicts[i], modelA: a.model, modelB: b.model, errA: a.error, errB: b.error }));
  }
  return out;
}

async function regen(row) {
  const schema = games.schemaFor(row.engine_id);
  if (!schema) throw new Error(`no schema for ${row.engine_id}`);
  const want = schema.questionCount;
  const prompt = gamePrompt.buildGamePrompt(row.track_id, row.grade_id, row.level, schema);
  const kept = [];
  const rejected = [];
  const judged = [];
  let written = 0;
  let writerModel = null;
  // --resume: carry on from this row's last staged output (its kept, rejected and judged questions).
  const prev = path.join(OUT, `game-${row.id}.json`);
  if (RESUME && fs.existsSync(prev)) {
    const p = JSON.parse(fs.readFileSync(prev, 'utf8'));
    kept.push(...(p.kept || (p.payload && p.payload.questions) || []));
    rejected.push(...(p.rejected || []));
    judged.push(...(p.judged || []));
    written = (p.stats && p.stats.written) || 0;
    writerModel = p.writer || null;
    console.log(`  row ${row.id}: resuming with ${kept.length} kept, ${written} written`);
  }
  let title = null;
  let feedback = null;
  for (let round = 0; round <= ROUNDS && kept.length < want; round++) {
    const need = want - kept.length;
    const fresh = [];
    let passingCount = 0;
    let judgesDown = false;
    for (let left = need; left > 0 && !judgesDown;) {
      const n = Math.min(CHUNK, left);
      // eslint-disable-next-line no-await-in-loop
      const w = await write(prompt, schema, n, [...kept, ...fresh]);
      writerModel = writerModel || w.model;
      if (!w.questions.length) break;
      fresh.push(...w.questions); written += w.questions.length; left -= w.questions.length;
      const passing = [];
      for (const q of w.questions) {
        const probs = codeProblems(q, schema);
        if (probs.length) rejected.push({ round, stage: 'code', prompt: q && q.prompt, choices: q && q.choices, answerIndex: q && q.answerIndex, explanation: q && q.explanation, reason: probs.join('; ') });
        else passing.push(q);
      }
      passingCount += passing.length;
      // Each chunk is judged as soon as it is written, so a judge outage costs one chunk.
      // eslint-disable-next-line no-await-in-loop
      const verdicts = await judgeAll(passing);
      if (verdicts.length && verdicts.every((v) => !v.a || !v.b)) { judgesDown = true; console.warn(`  row ${row.id}: a judge gave no verdict for a whole chunk (${verdicts[0].errA || verdicts[0].errB || 'no answer'}); stopping this row`); }
      settle(verdicts, round);
    }
    console.log(`  row ${row.id} round ${round}: wrote ${fresh.length}, code passed ${passingCount}, kept so far ${kept.length}/${want}`);
    if (judgesDown) break;
  }
  function settle(verdicts, round) {
    for (const v of verdicts) {
      const ki = Number(v.q.answerIndex);
      const ok = (x) => x && x.chosen_index === ki && x.one_correct === true;
      judged.push({ round, ki, a: v.a ? { pick: v.a.chosen_index, one: v.a.one_correct } : null, b: v.b ? { pick: v.b.chosen_index, one: v.b.one_correct } : null, modelA: v.modelA, modelB: v.modelB });
      if (ok(v.a) && ok(v.b) && kept.length < want) kept.push({ ...v.q, verified: { code: true, judge_a: v.modelA, judge_b: v.modelB } });
      else {
        const why = [['A', v.a, v.errA], ['B', v.b, v.errB]].map(([n, x, err]) => (!x ? `${n}: no verdict${err ? ` (${String(err).slice(0, 80)})` : ''}` : x.chosen_index !== ki ? `${n}: picked ${x.chosen_index} not ${ki}${x.issue ? ` (${String(x.issue).slice(0, 140)})` : ''}` : x.one_correct !== true ? `${n}: not exactly one correct${x.issue ? ` (${String(x.issue).slice(0, 140)})` : ''}` : null)).filter(Boolean).join(' | ');
        rejected.push({ round, stage: 'judges', prompt: v.q.prompt, choices: v.q.choices, answerIndex: ki, explanation: v.q.explanation, reason: why || 'surplus' });
      }
    }
  }
  // The whole-set checks (count, answer-slot balance) on what was kept, in the game's play order.
  const ordered = games.evenOrder(kept.map((q, i) => ({ ...q, id: `q${i + 1}` })), `${row.track_id}:${row.grade_id}:${row.level}`);
  const setProblems = games.inspectPayload({ questions: ordered }, schema).filter((p) => !/^q\d+:/.test(p));
  const payload = {
    ...row.payload,
    meta: { ...row.payload.meta, title: title || row.payload.meta.title },
    questions: ordered.map((q) => ({ id: String(q.id), prompt: String(q.prompt), choices: q.choices.map(String), answerIndex: Number(q.answerIndex), explanation: String(q.explanation), difficulty: Number(q.difficulty), skill: String(q.skill || ''), topic: String(q.topic || '') })),
    feedback: row.payload.feedback,
  };
  const both = judged.filter((j) => j.a && j.b);
  const stats = {
    written,
    code_rejected: rejected.filter((r) => r.stage === 'code').length,
    sent_to_judges: judged.length,
    kept: kept.length,
    keep_rate_of_written: written ? +(kept.length / written).toFixed(3) : 0,
    keep_rate_of_judged: judged.length ? +(kept.length / judged.length).toFixed(3) : 0,
    judges: {
      both_answered: both.length,
      picked_same_option: both.filter((j) => j.a.pick === j.b.pick).length,
      a_picked_key: judged.filter((j) => j.a && j.a.pick === j.ki).length,
      b_picked_key: judged.filter((j) => j.b && j.b.pick === j.ki).length,
      both_picked_key: both.filter((j) => j.a.pick === j.ki && j.b.pick === j.ki).length,
      models_a: [...new Set(judged.map((j) => j.modelA).filter(Boolean))],
      models_b: [...new Set(judged.map((j) => j.modelB).filter(Boolean))],
    },
    complete: kept.length >= want && !setProblems.length,
    set_problems: setProblems,
  };
  return { row_id: row.id, engine_id: row.engine_id, track_id: row.track_id, grade_id: row.grade_id, level: row.level, generated_at: new Date().toISOString(), writer: writerModel, stats, payload, kept, rejected, judged };
}

async function main() {
  if (!ROWS.length) { console.error('name the rows: --rows=13,64'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const started = Date.now();
  const results = [];
  for (const id of ROWS) {
    const row = db.byId('game_payloads', id);
    if (!row || row.track_id !== 'english' || row.grade_id !== 'proficient') { console.warn(`row ${id}: not an English Proficient game`); continue; }
    console.log(`row ${id}: ${row.engine_id}, level ${row.level}`);
    // eslint-disable-next-line no-await-in-loop
    const r = await regen(row);
    fs.writeFileSync(path.join(OUT, `game-${id}.json`), JSON.stringify(r, null, 1));
    results.push({ row_id: id, engine_id: row.engine_id, level: row.level, writer: r.writer, ...r.stats });
    console.log(`row ${id}: kept ${r.stats.kept}/${r.stats.written} written (${r.stats.code_rejected} failed code checks); judges agreed on ${r.stats.judges.picked_same_option}/${r.stats.judges.both_answered}`);
  }
  const report = { generated_at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), rows: results, tokens, applied: false };
  const file = path.join(OUT, `report-${ROWS.join('-')}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, rows: results.map((r) => ({ row: r.row_id, kept: r.kept, written: r.written, judged: r.sent_to_judges, complete: r.complete })) }, null, 1));
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
