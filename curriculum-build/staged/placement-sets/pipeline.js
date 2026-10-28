/**
 * Placement question sets for the subjects that have none (or only a test fixture):
 * written, code-checked, judged by two independent model families, and STAGED.
 * Nothing here writes data/db.json or anything the live app reads.
 *
 *   node pipeline.js write <track...>        MiniMax M3.1 Flash (xKiro grant) writes the ladder
 *   node pipeline.js judge <track...> A|B    A = MiniMax blind judge, B = NVIDIA Nemotron Ultra
 *                                            (UnoRouter Gemini 3.6 Flash :free as B's fallback)
 *   node pipeline.js merge <track...>        both judges -> -both / -mean, staged calibration
 *   node pipeline.js keys <track...>         every key a judge doubts, for the source check
 *   node pipeline.js rewrite <track> <file>  rewrite listed questions (MiniMax), code-check, keep
 *   node pipeline.js dbcopy <out> <track...> a DB copy with the staged sets in place (for testers)
 *
 * Build pipeline only: what is sent is content the app wrote (grade names, lesson titles,
 * questions). No learner data. Paid providers are blanked in this process.
 *
 * Env: PS_DB (a DB copy to read the curriculum through; required), MM_CONC (2), NV_CONC (2).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..', '..');
const { loadKeys } = require(path.join(ROOT, 'curriculum-build', 'staged', 'night-runner', 'env.js'));

loadKeys(['XKIRO_API_KEY', 'XKIRO_BASE_URL', 'NVIDIA_API_KEY', 'UNOROUTER_API_KEY', 'UNOROUTER_BASE_URL']);
for (const k of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'MIMO_API_KEY', 'MODELFLARE_API_KEY']) process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
process.env.XKIRO_PIPELINE = '1';
process.env.UNOROUTER_PIPELINE = '1';
process.env.XKIRO_RETRIES = '0';
process.env.XKIRO_REST_MS = '0';
process.env.UNOROUTER_RETRIES = '0';
if (!process.env.PS_DB) { console.error('PS_DB=<db copy> is required'); process.exit(2); }
process.env.DB_FILE = path.resolve(process.env.PS_DB);
process.env.DB_READONLY = '1';

const xk = require(path.join(ROOT, 'services', 'providers', 'xkiro.js'));
const nvidia = require(path.join(ROOT, 'services', 'providers', 'nvidia.js'));
const { unorouter } = require(path.join(ROOT, 'services', 'providers', 'unorouter.js'));
const curriculum = require(path.join(ROOT, 'config', 'curriculum'));
const rules = require(path.join(ROOT, 'config', 'subject-placement'));
const sp = require(path.join(ROOT, 'services', 'subject-placement'));
const adaptive = require(path.join(ROOT, 'services', 'adaptive-placement'));
const testers = require(path.join(ROOT, 'scripts', 'placement-testers'));

const OUT = HERE;
const JUDGE_DIR = path.join(ROOT, 'curriculum-build', 'placement-judge');
const CACHE = path.join(OUT, 'state', 'cache.jsonl');
const LOG = path.join(OUT, 'state', 'pipeline.log');
fs.mkdirSync(path.join(OUT, 'state'), { recursive: true });

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const hash = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex');
function log(...a) {
  const line = `${new Date().toISOString().slice(11, 19)} ${a.join(' ')}`;
  console.log(line);
  fs.appendFileSync(LOG, `${line}\n`);
}

// ── answer cache ──────────────────────────────────────────────────────────
const cache = new Map();
try {
  for (const line of fs.readFileSync(CACHE, 'utf8').split('\n')) { if (line.trim()) { const r = JSON.parse(line); cache.set(r.k, r.v); } }
} catch { /* none yet */ }
function cachePut(k, v) { cache.set(k, v); fs.appendFileSync(CACHE, `${JSON.stringify({ k, v })}\n`); }

const tally = { minimax: { calls: 0, input: 0, output: 0, r429: 0 }, nvidia: { calls: 0, input: 0, output: 0 }, uno: { calls: 0 } };
function addUsage(who, u) { const t = tally[who]; t.calls++; if (u) { t.input = (t.input || 0) + (u.input_tokens || 0); t.output = (t.output || 0) + (u.output_tokens || 0); } }

// ── semaphores ────────────────────────────────────────────────────────────
function sem(limit) {
  let active = 0; const q = [];
  const s = {
    limit,
    async take() { while (active >= s.limit) await new Promise((r) => q.push(r)); active++; },
    give() { active--; const r = q.shift(); if (r) r(); },
  };
  return s;
}
const MM = 'minimax/minimax-m3.1-flash';
const mmSem = sem(Number(process.env.MM_CONC || 2));
const nvSem = sem(Number(process.env.NV_CONC || 2));
let unoNext = 0;

/** One MiniMax structured call (cached); backs off on 429, never hammers. */
async function minimax({ system, user, schema, schemaName, maxTokens = 12000, tag = '', maxAttempts = 12 }) {
  const k = hash(['mm', system, user, schemaName]);
  if (cache.has(k)) return cache.get(k);
  let n429 = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await mmSem.take();
    let wait = 0;
    try {
      const r = await xk.xkiro.structured({ system, user, schema, schemaName, maxTokens, models: [MM], timeoutMs: 480000 });
      addUsage('minimax', r.usage);
      const v = { data: r.data, model: r.model || MM, usage: r.usage };
      cachePut(k, v);
      return v;
    } catch (err) {
      if (err.status === 402 || err.status === 403 || err.daily) throw err;
      if (err.status === 429) { tally.minimax.r429++; wait = Math.min(120000, 5000 * 2 ** Math.min(n429++, 5)) * (0.7 + Math.random() * 0.6); }
      // xKiro answers "at capacity" with a 200 that parses as unusable: back off like a 429.
      else if (err.unusable || err.status === 422) wait = Math.min(120000, 15000 * 2 ** Math.min(attempt, 3)) * (0.7 + Math.random() * 0.6);
      else wait = Math.min(240000, 10000 * 2 ** Math.min(attempt, 4));
      log(`minimax ${tag}: ${String(err.message).slice(0, 120)}; retry in ${Math.round(wait / 1000)}s`);
    } finally { mmSem.give(); }
    await sleep(wait);
  }
  return null;
}

/**
 * The writer: MiniMax (xKiro) by default; PS_WRITER=glm writes with NVIDIA GLM-5.3 (the next lane in
 * tonight's order) when MiniMax is at capacity. Judges stay MiniMax (A) and Nemotron (B), so a GLM-written
 * question is judged by two families other than its writer.
 */
// PS_WRITER=nemotron writes with NVIDIA Nemotron Ultra; its questions are then judged (B) by GLM-5.3 Flash.
const WRITERS = { glm: { model: 'z-ai/glm-5.3', effort: 'high' }, nemotron: { model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' } };
const WRITER_ENTRY = WRITERS[process.env.PS_WRITER] || null;
const WRITER = WRITER_ENTRY ? WRITER_ENTRY.model : MM;
async function writer(args) {
  if (WRITER === MM) return minimax(args);
  const k = hash([WRITER === 'z-ai/glm-5.3' ? 'glm' : WRITER, args.system, args.user, args.schemaName]);
  if (cache.has(k)) return cache.get(k);
  for (let attempt = 0; attempt < 6; attempt++) {
    await nvSem.take();
    try {
      const r = await nvidia.structured({ role: 'check', system: args.system, user: args.user, schema: args.schema, schemaName: args.schemaName, maxTokens: Math.min(32000, args.maxTokens || 12000), models: [WRITER_ENTRY], timeoutMs: 600000, attempts: 1, lane: 'background' });
      addUsage('nvidia', r.usage);
      const v = { data: r.data, model: r.model || WRITER, usage: r.usage };
      cachePut(k, v);
      return v;
    } catch (err) {
      log(`glm ${args.tag}: ${String(err.message).slice(0, 140)}`);
    } finally { nvSem.give(); }
    await sleep(20000 * (attempt + 1));
  }
  return null;
}

/** Judge B: NVIDIA Nemotron Ultra, then UnoRouter Gemini 3.6 Flash :free (1 call a minute). */
async function judgeB({ system, user, schema, schemaName, maxTokens = 12000, tag = '', writer = '' }) {
  // PS_B_MODEL overrides (when Nemotron 504s); it must still differ from the writer's family.
  const bModel = process.env.PS_B_MODEL && !writer.includes(process.env.PS_B_MODEL.split('/')[0]) ? process.env.PS_B_MODEL : /nemotron/.test(writer) ? 'z-ai/glm-5.3-flash' : 'nvidia/nemotron-3-ultra-550b-a55b';
  const k = hash(bModel === 'nvidia/nemotron-3-ultra-550b-a55b' ? ['b', system, user, schemaName] : ['b', bModel, system, user, schemaName]);
  if (cache.has(k)) return cache.get(k);
  for (let attempt = 0; attempt < 6; attempt++) {
    await nvSem.take();
    try {
      const r = await nvidia.structured({ role: 'check', system, user, schema, schemaName, maxTokens, models: [{ model: bModel, effort: process.env.PS_B_EFFORT || 'medium' }], timeoutMs: 420000, attempts: 1, lane: 'background' });
      addUsage('nvidia', r.usage);
      const v = { data: r.data, model: r.model || bModel, usage: r.usage };
      cachePut(k, v);
      return v;
    } catch (err) {
      log(`nvidia ${tag}: ${String(err.message).slice(0, 140)}`);
    } finally { nvSem.give(); }
    // fallback lane, paced
    const wait = Math.max(0, unoNext - Date.now());
    if (wait) await sleep(wait);
    unoNext = Date.now() + 63000;
    try {
      const r = await unorouter.structured({ system, user, schema, schemaName, maxTokens, models: ['gemini-3.6-flash:free'], timeoutMs: 300000 });
      addUsage('uno', r.usage);
      const v = { data: r.data, model: r.model || 'gemini-3.6-flash:free', usage: r.usage };
      cachePut(k, v);
      return v;
    } catch (err) {
      log(`uno ${tag}: ${String(err.message).slice(0, 140)}`);
      await sleep(30000);
    }
  }
  return null;
}

// ── the curriculum as the writer sees it ──────────────────────────────────
function gradeOutline(trackId, gradeId, maxChars = 2600) {
  const units = testers.unitsOf(trackId, gradeId);
  const text = units.map((u, i) => `U${i + 1}: ${u.lessons.map((l) => l.title).join(' / ')}`).join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)} …` : text;
}

const EXTRA_RULES = [
  'EXTRA RULES FOR THIS SUBJECT (they override nothing above, they add to it):',
  '- Every question is TEXT ONLY and complete in itself. It cannot show a picture, a diagram, a board, a staff, a',
  '  video or a sound. If it needs a position or a figure, describe it fully in words (chess: give the pieces and',
  '  squares in algebraic notation; music: name the notes; sport: describe the situation). Never write "shown",',
  '  "below", "the picture", "the diagram", "listen".',
  '- Each question tests what THAT grade teaches (its units are listed below), at the band\'s point in the grade:',
  '  easy ≈ the first units, medium ≈ the middle units, hard ≈ the late units, capstone = needs the whole grade.',
  '  A question that a learner of an earlier grade, or anyone from everyday knowledge, could answer is wasted.',
  '- Exactly four options, all different, exactly one of them the keyed answer, copied character for character.',
  '  No "all of the above", "none of the above", "both", or options that overlap.',
  '- Work every question out yourself before you key it. A wrong key is the worst failure there is.',
].join('\n');

function writerUser(trackId, gradeIds, batch, written) {
  const base = sp.questionUserPrompt(trackId, gradeIds, { batch, written });
  const outl = batch.map((id) => `${rules.gradeName(trackId, id)} [grade_id: ${id}] — its units in order:\n${gradeOutline(trackId, id)}`).join('\n\n');
  return `${base}\n\n${EXTRA_RULES}\n\nWHAT EACH GRADE IN THIS CALL TEACHES:\n${outl}`;
}

// ── code checks ───────────────────────────────────────────────────────────
const NORM = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
function codeProblems(q) {
  const out = [];
  const choices = Array.isArray(q.choices) ? q.choices.map((c) => String(c)) : [];
  if (!q.prompt || String(q.prompt).trim().length < 12) out.push('prompt too short');
  if (choices.length !== 4) out.push(`${choices.length} choices, expected 4`);
  const norm = choices.map(NORM);
  if (new Set(norm).size !== norm.length) out.push('duplicate choices');
  const hits = choices.filter((c) => c.trim() === String(q.answer).trim()).length;
  if (hits !== 1) out.push(hits ? 'answer appears more than once' : 'answer not among the choices');
  if (norm.some((c) => /\b(all|none) of the above\b|^both\b|^neither\b/.test(c))) out.push('all/none of the above');
  if (/\b(shown|pictured|the picture|the image|the diagram|the figure|below|listen to|the video|the audio|the graph above)\b/i.test(q.prompt)) out.push('refers to something not given');
  if (sp.lengthCue(choices, q.answer)) out.push('answer identifiable by its length');
  const ans = NORM(q.answer);
  if (ans.length >= 6 && NORM(q.prompt).includes(ans)) out.push('answer text appears in the prompt');
  return out;
}

function duplicates(rows) {
  const seen = new Map();
  const out = [];
  for (const r of rows) {
    r.questions.forEach((q, i) => {
      const k = NORM(q.prompt).replace(/[^a-z0-9 ]/g, '');
      if (seen.has(k)) out.push({ grade_id: r.grade_id, index: i, of: seen.get(k) });
      else seen.set(k, `${r.grade_id}#${i}`);
    });
  }
  return out;
}

// ── write ─────────────────────────────────────────────────────────────────
const PER_CALL = Number(process.env.PS_PER_CALL || 3);
const setFile = (t) => path.join(OUT, `${t}-set.json`);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

const ONE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['questions'],
  properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'prompt', 'choices', 'answer', 'rationale'], properties: {
    n: { type: 'integer' }, topic: { type: 'string' }, prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'string' }, rationale: { type: 'string' },
  } } } },
};

async function rewriteQuestions(trackId, items, why) {
  // items: [{n, grade_id, band, q, problems}]
  const gradeIds = rules.gradesFor(trackId);
  const user = [
    `SUBJECT: ${(curriculum.getTrack(trackId) || {}).name || trackId}. Rewrite each placement question below from scratch so that it has no problem listed. Keep its grade, band and topic.`,
    '',
    EXTRA_RULES,
    '',
    ...items.map((it) => [
      `N${it.n}  grade ${gradeIds.indexOf(it.grade_id) + 1} of ${gradeIds.length}: ${rules.gradeName(trackId, it.grade_id)} [band: ${it.band} — ${rules.BANDS[it.band]}]`,
      `The grade's units: ${gradeOutline(trackId, it.grade_id, 900).replace(/\n/g, '; ')}`,
      `Old question: ${it.q.prompt}`,
      `Old options: ${(it.q.choices || []).join(' | ')}  (keyed: ${it.q.answer})`,
      `Problems: ${it.problems.join('; ')}`,
      '',
    ].join('\n')),
    'Return one rewritten question per N, with the same n.',
  ].join('\n');
  const r = await writer({ system: sp.questionSystemPrompt(), user, schema: ONE_SCHEMA, schemaName: 'submit_rewritten_questions', maxTokens: 4000 + items.length * 1200, tag: `${trackId} rewrite ${why}` });
  const out = new Map();
  for (const row of (r && r.data && r.data.questions) || []) {
    const it = items.find((x) => x.n === Number(row.n));
    if (!it) continue;
    const q = { band: it.band, stated_band: null, topic: row.topic ? String(row.topic).slice(0, 80) : it.q.topic, prompt: String(row.prompt), choices: (row.choices || []).map(String), answer: String(row.answer), rationale: String(row.rationale || ''), writer: (r && r.model) || WRITER };
    if (!codeProblems(q).length) out.set(it.n, q);
  }
  return out;
}

async function writeTrack(trackId) {
  const gradeIds = rules.gradesFor(trackId);
  const state = readJson(setFile(trackId), null) || { track_id: trackId, grade_ids: gradeIds, grades: [] };
  const have = new Map(state.grades.map((g) => [g.grade_id, g]));
  for (let from = 0; from < gradeIds.length; from += PER_CALL) {
    const batch = gradeIds.slice(from, from + PER_CALL).filter((id) => !have.has(id));
    for (let attempt = 1; attempt <= 4 && batch.some((id) => !have.has(id)); attempt++) {
      const wanted = batch.filter((id) => !have.has(id));
      const written = gradeIds.filter((id) => have.has(id)).map((id) => have.get(id));
      const r = await writer({
        system: sp.questionSystemPrompt(), user: writerUser(trackId, gradeIds, wanted, written) + (attempt > 1 ? `\n\n(Attempt ${attempt}: return every listed grade, complete.)` : ''),
        schema: sp.QUESTION_SCHEMA, schemaName: 'submit_placement_questions', maxTokens: 6000 + wanted.length * 7 * 700, tag: `${trackId} ${wanted.join(',')}`,
      });
      const grades = (r && r.data && r.data.grades) || [];
      for (const id of wanted) {
        const row = grades.find((g) => String(g.grade_id) === id);
        if (!row || !Array.isArray(row.questions) || row.questions.length !== 7) continue;
        const qs = row.questions.map((q, i) => ({ band: rules.MIX[i], stated_band: q.band && q.band !== rules.MIX[i] ? q.band : null, topic: q.topic ? String(q.topic).slice(0, 80) : null, prompt: String(q.prompt || ''), choices: Array.isArray(q.choices) ? q.choices.map(String) : null, answer: String(q.answer || ''), rationale: String(q.rationale || ''), writer: (r && r.model) || WRITER }));
        have.set(id, { grade_id: id, questions: qs });
      }
      log(`${trackId}: wrote ${wanted.filter((id) => have.has(id)).length}/${wanted.length} grades (attempt ${attempt})`);
    }
    state.grades = gradeIds.filter((id) => have.has(id)).map((id) => have.get(id));
    fs.writeFileSync(setFile(trackId), JSON.stringify(state, null, 1));
  }
  // code checks, then rewrite what fails (up to 3 passes)
  for (let pass = 1; pass <= 3; pass++) {
    const dup = duplicates(state.grades);
    const items = [];
    for (const g of state.grades) {
      g.questions.forEach((q, i) => {
        const problems = codeProblems(q);
        if (dup.some((d) => d.grade_id === g.grade_id && d.index === i)) problems.push('repeats an earlier question');
        if (problems.length) items.push({ n: items.length, grade_id: g.grade_id, index: i, band: q.band, q, problems });
      });
    }
    log(`${trackId}: code check pass ${pass}: ${items.length} questions fail`);
    if (!items.length) break;
    for (let i = 0; i < items.length; i += 8) {
      const chunk = items.slice(i, i + 8).map((it, j) => ({ ...it, n: j }));
      const fixed = await rewriteQuestions(trackId, chunk, `p${pass}`);
      for (const it of chunk) {
        const q = fixed.get(it.n);
        if (q) state.grades.find((g) => g.grade_id === it.grade_id).questions[it.index] = { ...q, rewritten: `code-${pass}` };
      }
    }
    fs.writeFileSync(setFile(trackId), JSON.stringify(state, null, 1));
  }
  const remaining = [];
  state.grades.forEach((g) => g.questions.forEach((q, i) => { const p = codeProblems(q); if (p.length) remaining.push(`${g.grade_id}#${i}: ${p.join('; ')}`); }));
  state.code_problems = remaining;
  state.model = WRITER;
  state.written_at = new Date().toISOString();
  state.complete = state.grades.length === gradeIds.length;
  fs.writeFileSync(setFile(trackId), JSON.stringify(state, null, 1));
  log(`${trackId}: ${state.grades.length}/${gradeIds.length} grades written, ${remaining.length} code problems left`);
  return state;
}

// ── judge (the testers' blind locate-and-key judge, two families) ─────────
const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['questions'],
  properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'grade', 'unit', 'key'], properties: {
    id: { type: 'string' }, grade: { type: 'integer', description: 'G number from the outline' }, unit: { type: 'integer', description: 'U number inside that grade' },
    key: { type: 'string', enum: ['correct', 'wrong', 'ambiguous'] }, note: { type: 'string', description: 'Only when the key is wrong or ambiguous: why, and the right answer.' },
  } } } },
};
function judgeSystem(trackId, gradeCount) {
  const name = (curriculum.getTrack(trackId) || {}).name || trackId;
  return [
    `You are an experienced ${name} teacher and curriculum specialist. You are given the outline of one curriculum`,
    `(${gradeCount} grades in order, G1 first; each grade's units in order, U1 first, with lesson titles) and a few`,
    'placement questions taken from anywhere in it, in no particular order.',
    '',
    'For each question, say the FIRST point in this curriculum — grade G and unit U — by which a learner who has',
    'worked through everything up to and including that unit would reliably answer it (about 9 in 10 such learners',
    'right). Judge from what the question actually requires, not from how it looks or how long it is:',
    '- a question that only needs an earlier skill, or everyday knowledge, belongs at that earlier point;',
    '- a question that needs a skill this curriculum teaches late belongs where that skill is taught;',
    '- multiple choice is answered by recognising the right option, which is easier than producing it.',
    '',
    'Then check the answer key: "correct" if the keyed answer is right and the only right option, "wrong" if it is',
    'not right, "ambiguous" if another option is also defensible. Work the question yourself before deciding.',
    'Answer every question by its id.',
  ].join('\n');
}
function judgeUser(trackId, batch, titlesPerUnit) {
  const items = batch.map((q) => [`id: ${q.key}`, `question: ${q.prompt}`, q.choices ? `options: ${q.choices.map((c) => `[${c}]`).join(' ')}` : 'options: (type-in answer)', `keyed answer: ${q.answer}`].join('\n')).join('\n\n');
  return `CURRICULUM OUTLINE\n${testers.outline(trackId, titlesPerUnit)}\n\nQUESTIONS\n${items}`;
}
const judgeFile = (t, tag) => path.join(JUDGE_DIR, `${t}${tag}.json`);
function shuffled(list, seed) {
  const out = list.slice(); let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = s % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

async function judgeTrack(trackId, which) {
  const tag = which === 'A' ? '-minimax' : '-nemotron';
  const gradeIds = rules.gradesFor(trackId);
  const titles = gradeIds.length > 20 ? 1 : 2;
  const verdicts = readJson(judgeFile(trackId, tag), {});
  const all = testers.allQuestions(trackId);
  const staged = readJson(setFile(trackId), null);
  const writerOf = (q) => { const g = staged && staged.grades.find((x) => x.grade_id === q.grade_id); const w = g && g.questions[q.index] && g.questions[q.index].writer; return w || (staged ? String(staged.model || '') : 'mimo/claude'); };
  let todo = shuffled(all.filter((q) => !verdicts[q.key]), which === 'A' ? 0x5eed : 0xbeef);
  if (which === 'B') todo = [...todo.filter((q) => !/nemotron/.test(writerOf(q))), ...todo.filter((q) => /nemotron/.test(writerOf(q)))];
  log(`${trackId} judge ${which}: ${todo.length} to judge (${Object.keys(verdicts).length} cached)`);
  const BATCH = which === 'A' ? Number(process.env.PS_A_BATCH || 20) : 10;
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) {
    const fam = /nemotron/.test(writerOf(todo[i]));
    let j = i; const b = [];
    while (j < todo.length && b.length < BATCH && (which !== 'B' || /nemotron/.test(writerOf(todo[j])) === fam)) b.push(todo[j++]);
    batches.push(b); i = j - BATCH;
  }
  const call = which === 'A' ? minimax : judgeB;
  await Promise.all(batches.map(async (batch0, bi) => {
    let batch = batch0;
    for (let attempt = 1; attempt <= 3 && batch.length; attempt++) {
      const r = await call({ system: judgeSystem(trackId, gradeIds.length), user: judgeUser(trackId, batch, titles) + (attempt > 1 ? `\n\n(retry ${attempt})` : ''), schema: JUDGE_SCHEMA, schemaName: 'submit_locations', maxTokens: 16000, tag: `${trackId} judge${which} b${bi}`, writer: writerOf(batch[0]) });
      for (const row of (r && r.data && r.data.questions) || []) {
        const q = batch.find((b) => b.key === String(row.id).trim());
        const gi = Number(row.grade) - 1;
        if (!q || !(gi >= 0 && gi < gradeIds.length)) continue;
        const units = testers.unitsOf(trackId, gradeIds[gi]).length;
        verdicts[q.key] = { written_for: q.grade_id, band: q.band, grade_id: gradeIds[gi], grade_index: gi, unit: Math.max(1, Math.min(units, Number(row.unit) || 1)), units, key: row.key, note: row.note || '', prompt: String(q.prompt).slice(0, 160), judge: (r && r.model) || which };
      }
      fs.writeFileSync(judgeFile(trackId, tag), JSON.stringify(verdicts, null, 1));
      batch = batch.filter((q) => !verdicts[q.key]);
    }
  }));
  const missing = all.filter((q) => !verdicts[q.key]).length;
  log(`${trackId} judge ${which}: done, ${missing} unjudged`);
}

// ── merge: stricter-of-two and the mean (what calibration uses) ───────────
const pointOf = (v) => v.grade_index + (v.unit - 0.5) / v.units;
const WORSE = { correct: 0, ambiguous: 1, wrong: 2 };
function merge(trackId) {
  const a = readJson(judgeFile(trackId, '-minimax'), {});
  const b = readJson(judgeFile(trackId, '-nemotron'), {});
  const gradeIds = rules.gradesFor(trackId);
  const both = {}; const mean = {}; const points = {};
  const current = new Set(testers.allQuestions(trackId).map((q) => q.key));
  for (const key of current) {
    const x = a[key]; const y = b[key];
    if (!x || !y) continue;
    const easier = pointOf(y) < pointOf(x) ? y : x;
    const worst = WORSE[y.key] > WORSE[x.key] ? y.key : x.key;
    const note = [x.key !== 'correct' ? `A: ${x.note}` : '', y.key !== 'correct' ? `B: ${y.note}` : ''].filter(Boolean).join(' | ');
    both[key] = { ...easier, key: worst, note, judge: 'both' };
    const p = (pointOf(x) + pointOf(y)) / 2;
    const gi = Math.max(0, Math.min(gradeIds.length - 1, Math.floor(p)));
    const units = testers.unitsOf(trackId, gradeIds[gi]).length;
    mean[key] = { ...x, grade_index: gi, grade_id: gradeIds[gi], unit: Math.max(1, Math.min(units, Math.round((p - gi) * units + 0.5))), units, point: Number(p.toFixed(3)), spread: Number(Math.abs(pointOf(x) - pointOf(y)).toFixed(2)), key: worst, note, judge: 'mean' };
    points[key] = Number(p.toFixed(3));
  }
  fs.writeFileSync(judgeFile(trackId, '-both'), JSON.stringify(both, null, 1));
  fs.writeFileSync(judgeFile(trackId, '-mean'), JSON.stringify(mean, null, 1));
  fs.mkdirSync(path.join(OUT, 'calibration'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'calibration', `${trackId}.json`), JSON.stringify({
    track_id: trackId, made_at: new Date().toISOString(),
    judges: ['minimax-m3.1-flash (xKiro, blind)', 'nvidia nemotron-3-ultra (blind; UnoRouter gemini-3.6-flash:free fallback)'],
    note: "Each question's point in grades from the start of the subject: the mean of the two judges. STAGED: copy to content/placement-calibration/<track>.json together with the set.",
    points,
  }, null, 1));
  const flagged = Object.values(both).filter((v) => v.key !== 'correct').length;
  log(`${trackId}: merged ${Object.keys(both).length}/${current.size}; keys doubted by either judge: ${flagged}`);
  return { merged: Object.keys(both).length, of: current.size, flagged };
}

function keys(trackId) {
  const a = readJson(judgeFile(trackId, '-minimax'), {});
  const b = readJson(judgeFile(trackId, '-nemotron'), {});
  const out = [];
  for (const q of testers.allQuestions(trackId)) {
    const x = a[q.key]; const y = b[q.key];
    if ((x && x.key !== 'correct') || (y && y.key !== 'correct')) {
      out.push({ key: q.key, grade_id: q.grade_id, index: q.index, band: q.band, prompt: q.prompt, choices: q.choices, answer: q.answer, A: x ? `${x.key}: ${x.note}` : '-', B: y ? `${y.key}: ${y.note}` : '-' });
    }
  }
  return out;
}

/** Apply a reviewed list: [{grade_id, index, action: 'rewrite'|'keep', why}] -> rewrite with MiniMax, code-check. */
async function rewriteListed(trackId, file) {
  const list = readJson(file, []);
  const state = readJson(setFile(trackId), null);
  const items = list.filter((x) => x.action === 'rewrite').map((x, n) => {
    const q = state.grades.find((g) => g.grade_id === x.grade_id).questions[x.index];
    return { n, grade_id: x.grade_id, index: x.index, band: q.band, q, problems: [x.why] };
  });
  let changed = 0;
  for (let i = 0; i < items.length; i += 8) {
    const chunk = items.slice(i, i + 8).map((it, j) => ({ ...it, n: j }));
    const fixed = await rewriteQuestions(trackId, chunk, 'review');
    for (const it of chunk) {
      const q = fixed.get(it.n);
      if (q) { state.grades.find((g) => g.grade_id === it.grade_id).questions[it.index] = { ...q, rewritten: 'review' }; changed++; }
    }
  }
  fs.writeFileSync(setFile(trackId), JSON.stringify(state, null, 1));
  log(`${trackId}: rewrote ${changed}/${items.length} listed questions`);
}

/** A DB copy whose placement_question_sets hold the staged sets (replacing any row for that track). */
function dbcopy(out, tracks) {
  const src = JSON.parse(fs.readFileSync(process.env.DB_FILE, 'utf8'));
  for (const t of tracks) {
    const s = readJson(setFile(t), null);
    if (!s || !s.complete) { console.log(`${t}: no complete staged set`); continue; }
    src.placement_question_sets = (src.placement_question_sets || []).filter((x) => x.track_id !== t);
    src._counters = src._counters || {};
    const id = (src._counters.placement_question_sets = (src._counters.placement_question_sets || 0) + 1);
    src.placement_question_sets.push({ id, created_at: new Date().toISOString(), track_id: t, grade_ids: s.grade_ids, model: s.model, grades: s.grades, problems: s.code_problems || [], staged: true });
  }
  fs.writeFileSync(out, JSON.stringify(src));
  console.log(`wrote ${out}`);
}


// ── key check A (compact: no outline) and location judge C ────────────────
// MiniMax's lane is shared and mostly at capacity, and a full locate-and-key prompt carries the
// whole curriculum outline (12-15K tokens). The key check needs only the questions, so A checks
// keys in batches of 20 without the outline (UnoRouter Gemini 3.6 Flash :free, another family,
// when MiniMax will not answer). Location for calibration comes from the two NVIDIA families
// (Nemotron Ultra and GLM-5.3 Flash): every item gets both, whoever wrote it.
const KEY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['questions'],
  properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'key'], properties: {
    id: { type: 'string' }, key: { type: 'string', enum: ['correct', 'wrong', 'ambiguous', 'flawed'] }, answer: { type: 'string', description: 'The option you worked out to be right.' }, note: { type: 'string', description: 'Only when not correct: why, and the right answer.' },
  } } } },
};
function keySystem(trackId) {
  const name = (curriculum.getTrack(trackId) || {}).name || trackId;
  return [
    'You are an exacting ' + name + ' examiner checking the answer keys of multiple-choice placement questions.',
    'For each question, work it out yourself first, then compare with the keyed answer:',
    '"correct" if the keyed answer is right and the only right option; "wrong" if it is not right (say the right',
    'answer, even if it is not among the options); "ambiguous" if another option is also defensible; "flawed" if the',
    'question is broken (refers to something it does not give, gives the answer away, or cannot be answered as written).',
    'Answer every question by its id.',
  ].join('\n');
}
const keyFile = (t) => path.join(JUDGE_DIR, t + '-keysA.json');
async function keyCheck(trackId) {
  const done = readJson(keyFile(trackId), {});
  const all = testers.allQuestions(trackId).filter((q) => !done[q.key]);
  log(trackId + ' key check A: ' + all.length + ' to check');
  const BATCH = Number(process.env.PS_KEY_BATCH || 20);
  for (let i = 0; i < all.length; i += BATCH) {
    let batch = all.slice(i, i + BATCH);
    for (let attempt = 1; attempt <= 3 && batch.length; attempt++) {
      const user = batch.map((q) => 'id: ' + q.key + '\nquestion: ' + q.prompt + '\noptions: ' + (q.choices || []).map((c) => '[' + c + ']').join(' ') + '\nkeyed answer: ' + q.answer).join('\n\n') + (attempt > 1 ? '\n\n(retry ' + attempt + ')' : '');
      // PS_KEY_NO_MM=1: a second process must not take MiniMax's one lane; it checks keys on Gemini 3.6 Flash.
      let r = process.env.PS_KEY_NO_MM === '1' ? null : await minimax({ system: keySystem(trackId), user, schema: KEY_SCHEMA, schemaName: 'submit_keys', maxTokens: 12000, tag: trackId + ' keysA ' + i, maxAttempts: Number(process.env.PS_MM_ATTEMPTS || 5) });
      let who = r && r.model;
      if (!r) {
        const wait = Math.max(0, unoNext - Date.now()); if (wait) await sleep(wait); unoNext = Date.now() + 63000;
        try { r = await unorouter.structured({ system: keySystem(trackId), user, schema: KEY_SCHEMA, schemaName: 'submit_keys', maxTokens: 12000, models: ['gemini-3.6-flash:free'], timeoutMs: 300000 }); addUsage('uno', r.usage); who = r.model || 'gemini-3.6-flash:free'; } catch (e) { log('uno keysA: ' + String(e.message).slice(0, 120)); r = null; }
      }
      for (const row of (r && r.data && r.data.questions) || []) {
        const q = batch.find((b) => b.key === String(row.id).trim());
        if (q) done[q.key] = { key: row.key, answer: row.answer || '', note: row.note || '', judge: who, grade_id: q.grade_id, index: q.index, prompt: String(q.prompt).slice(0, 160) };
      }
      fs.writeFileSync(keyFile(trackId), JSON.stringify(done, null, 1));
      batch = batch.filter((q) => !done[q.key]);
    }
  }
  log(trackId + ' key check A: ' + testers.allQuestions(trackId).filter((q) => !done[q.key]).length + ' unchecked');
}

/** Location judge C: the NVIDIA family that was not this item's judge B. */
async function judgeC(trackId) {
  const gradeIds = rules.gradesFor(trackId);
  const titles = gradeIds.length > 20 ? 1 : 2;
  const file = judgeFile(trackId, '-c');
  const verdicts = readJson(file, {});
  const bv = readJson(judgeFile(trackId, '-nemotron'), {});
  const all = testers.allQuestions(trackId).filter((q) => !verdicts[q.key]);
  // C is Nemotron (location only; its key verdict is never used) unless Nemotron was this item's B; GLM-5.3 Flash 504s on the long outline prompt.
  const cModelOf = (q) => (/nemotron/.test(String((bv[q.key] || {}).judge || '')) ? 'z-ai/glm-5.3-flash' : 'nvidia/nemotron-3-ultra-550b-a55b');
  const groups = {};
  for (const q of all) (groups[cModelOf(q)] = groups[cModelOf(q)] || []).push(q);
  log(trackId + ' judge C: ' + all.length + ' to locate');
  const jobs = [];
  for (const [model, qs] of Object.entries(groups)) for (let i = 0; i < qs.length; i += 10) jobs.push({ model, batch: qs.slice(i, i + 10) });
  await Promise.all(jobs.map(async (job, bi) => {
    let { batch } = job;
    for (let attempt = 1; attempt <= 3 && batch.length; attempt++) {
      const k = hash(['c', job.model, trackId, batch.map((q) => q.key), attempt]);
      let r = cache.get(k) || null;
      if (!r) {
        await nvSem.take();
        try {
          const x = await nvidia.structured({ role: 'check', system: judgeSystem(trackId, gradeIds.length), user: judgeUser(trackId, batch, titles), schema: JUDGE_SCHEMA, schemaName: 'submit_locations', maxTokens: 16000, models: [{ model: job.model, effort: 'medium' }], timeoutMs: 420000, attempts: 1, lane: 'background' });
          addUsage('nvidia', x.usage); r = { data: x.data, model: x.model || job.model }; cachePut(k, r);
        } catch (e) { log('C ' + trackId + ' b' + bi + ': ' + String(e.message).slice(0, 120)); await sleep(30000); } finally { nvSem.give(); }
      }
      for (const row of (r && r.data && r.data.questions) || []) {
        const q = batch.find((b) => b.key === String(row.id).trim());
        const gi = Number(row.grade) - 1;
        if (!q || !(gi >= 0 && gi < gradeIds.length)) continue;
        const units = testers.unitsOf(trackId, gradeIds[gi]).length;
        verdicts[q.key] = { written_for: q.grade_id, band: q.band, grade_id: gradeIds[gi], grade_index: gi, unit: Math.max(1, Math.min(units, Number(row.unit) || 1)), units, key: row.key, note: row.note || '', prompt: String(q.prompt).slice(0, 160), judge: r.model };
      }
      fs.writeFileSync(file, JSON.stringify(verdicts, null, 1));
      batch = batch.filter((q) => !verdicts[q.key]);
    }
  }));
  log(trackId + ' judge C: ' + testers.allQuestions(trackId).filter((q) => !verdicts[q.key]).length + ' unlocated');
}

/**
 * Merge v2: keys from A (full MiniMax judge or the compact key check) and B; location = mean of every
 * location judge the item has (MiniMax A where it exists, B, C). -both keeps the easiest location and the
 * worse key; -mean is what the staged calibration holds.
 */
function merge2(trackId) {
  const A = readJson(judgeFile(trackId, '-minimax'), {});
  const KA = readJson(keyFile(trackId), {});
  const B = readJson(judgeFile(trackId, '-nemotron'), {});
  const C = readJson(judgeFile(trackId, '-c'), {});
  const gradeIds = rules.gradesFor(trackId);
  const both = {}; const mean = {}; const points = {}; const missing = { keyA: 0, B: 0 };
  const W2 = { correct: 0, ambiguous: 1, flawed: 2, wrong: 2 };
  const review = readJson(path.join(OUT, 'review-' + trackId + '.json'), []);
  for (const q of testers.allQuestions(trackId)) {
    const keyA = (KA[q.key] && KA[q.key].key) || (A[q.key] && A[q.key].key);
    const b = B[q.key];
    if (!keyA) missing.keyA++;
    if (!b) { missing.B++; continue; }
    const locs = [A[q.key], b, C[q.key]].filter(Boolean);
    const pts = locs.map(pointOf);
    const p = pts.reduce((x, y) => x + y, 0) / pts.length;
    const easiest = locs[pts.indexOf(Math.min(...pts))];
    const worst = [keyA || 'correct', b.key].sort((x, y) => (W2[y] || 0) - (W2[x] || 0))[0];
    let key = worst === 'flawed' ? 'wrong' : worst;
    // A doubt that was source-checked and found wrong (review-<track>.json, action keep) does not hold the item.
    const kept = key !== 'correct' && review.find((r) => r.action === 'keep' && r.grade_id === q.grade_id && r.index === q.index && (!r.prompt || r.prompt === q.prompt));
    if (kept) key = 'correct';
    const note = [keyA && keyA !== 'correct' ? 'A: ' + ((KA[q.key] || A[q.key] || {}).note || '') : '', b.key !== 'correct' ? 'B: ' + b.note : ''].filter(Boolean).join(' | ');
    both[q.key] = { ...easiest, key, note, judge: 'both', keyA: keyA || null };
    const gi = Math.max(0, Math.min(gradeIds.length - 1, Math.floor(p)));
    const units = testers.unitsOf(trackId, gradeIds[gi]).length;
    mean[q.key] = { ...b, grade_index: gi, grade_id: gradeIds[gi], unit: Math.max(1, Math.min(units, Math.round((p - gi) * units + 0.5))), units, point: Number(p.toFixed(3)), judges: locs.length, key, note, judge: 'mean' };
    // Calibrate only on two or more location judges; one judge alone is noisier than the band position.
    if (locs.length >= 2) points[q.key] = Number(p.toFixed(3));
  }
  fs.writeFileSync(judgeFile(trackId, '-both'), JSON.stringify(both, null, 1));
  fs.writeFileSync(judgeFile(trackId, '-mean'), JSON.stringify(mean, null, 1));
  fs.mkdirSync(path.join(OUT, 'calibration'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'calibration', trackId + '.json'), JSON.stringify({
    track_id: trackId, made_at: new Date().toISOString(),
    judges: ['nvidia nemotron-3-ultra (blind)', 'nvidia glm-5.3-flash (blind)', 'minimax-m3.1-flash (blind, where it answered)'],
    note: "Each question's point in grades from the start of the subject: the mean of the location judges. Read by services/subject-placement.js calibrationFor.",
    points,
  }, null, 1));
  const flagged = Object.values(both).filter((v) => v.key !== 'correct').length;
  log(trackId + ': merge2 ' + Object.keys(both).length + ' items, missing keyA ' + missing.keyA + ', missing B ' + missing.B + '; keys doubted by A or B: ' + flagged);
  return { items: Object.keys(both).length, missing, flagged };
}

function keys2(trackId) {
  const both = readJson(judgeFile(trackId, '-both'), {});
  const C = readJson(judgeFile(trackId, '-c'), {});
  return testers.allQuestions(trackId).filter((q) => both[q.key] && both[q.key].key !== 'correct').map((q) => ({ grade_id: q.grade_id, index: q.index, prompt: q.prompt, choices: q.choices, answer: q.answer, note: both[q.key].note, c: C[q.key] && C[q.key].key !== 'correct' ? 'C: ' + C[q.key].key + ' ' + C[q.key].note : '' }));
}

module.exports = { codeProblems, judgeSystem, judgeUser, JUDGE_SCHEMA };

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  (async () => {
    if (cmd === 'write') await Promise.all(args.map((t) => writeTrack(t).catch((e) => log(`${t}: write failed ${e.message}`))));
    else if (cmd === 'judge') { const which = args.pop(); await Promise.all(args.map((t) => judgeTrack(t, which))); }
    else if (cmd === 'merge') args.forEach((t) => console.log(t, JSON.stringify(merge(t))));
    else if (cmd === 'keycheck') { for (const t of args) await keyCheck(t); }
    else if (cmd === 'judgec') await Promise.all(args.map((t) => judgeC(t)));
    else if (cmd === 'merge2') args.forEach((t) => console.log(t, JSON.stringify(merge2(t))));
    else if (cmd === 'keys2') args.forEach((t) => console.log(JSON.stringify(keys2(t), null, 1)));
    else if (cmd === 'keys') args.forEach((t) => console.log(JSON.stringify(keys(t), null, 1)));
    else if (cmd === 'rewrite') await rewriteListed(args[0], args[1]);
    else if (cmd === 'dbcopy') dbcopy(args[0], args.slice(1));
    else console.log('usage: write|judge|merge|keys|rewrite|dbcopy');
    fs.writeFileSync(path.join(OUT, 'state', `tally-${process.pid}.json`), JSON.stringify(tally, null, 1));
    log(`tally ${JSON.stringify(tally)}`);
  })().catch((e) => { console.error(e); process.exitCode = 1; });
}
