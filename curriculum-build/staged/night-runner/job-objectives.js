/**
 * Job 1: objective questions for all 8,955 objectives of the six subjects.
 *
 *   writer   MiniMax M3.1 Flash first; since 14:10 UTC also the free pool's writer lanes
 *            (core.write: NVIDIA, xKiro $0, UnoRouter :free, OpenRouter :free), 4 questions
 *   code     structure, duplicates, length cue, explanation-key agreement, math-claims (math)
 *   judges   two blind judges (no key shown; each must pick the key) from two DIFFERENT
 *            families, neither the writer's family (core.judgeTwo)
 *   source   a fact the key depends on, named by either judge, must be supported by an
 *            offline Wikipedia / Wiktionary passage quoted verbatim (source-check.js)
 * Kept only when the code checks pass, BOTH judges pick the key and say it tests the
 * objective, has exactly one correct option and suits the grade, and every named fact is
 * sourced. Any disagreement drops the question. An objective with fewer than 3 kept gets one
 * more round. Output: staged/adaptation/objective-items-night/.
 */
const fs = require('fs');
const path = require('path');
const core = require('./core');

const { ROOT, log, kinds } = core;
const source = require('./source-check');
const coverage = require(path.join(ROOT, 'services', 'coverage.js'));
const curriculum = require(path.join(ROOT, 'config', 'curriculum.js'));
const { keyAgreement } = require(path.join(ROOT, 'services', 'key-agreement.js'));
const mathClaims = require(path.join(ROOT, 'services', 'math-claims.js'));

const OUT = path.join(ROOT, 'curriculum-build', 'staged', 'adaptation', 'objective-items-night');
fs.mkdirSync(OUT, { recursive: true });
const RESULTS = path.join(OUT, 'results.jsonl');
const PILOT = path.join(ROOT, 'curriculum-build', 'staged', 'adaptation', 'objective-items.cache.jsonl');
const PER = 4;
const WANT = 3;

const WRITE_SYSTEM = `You write short multiple-choice questions that test ONE learning objective of a school course, for checking whether a learner can still do it days later.
Rules:
- Every question tests exactly the objective given, not neighbouring topics, at the grade level given.
- Exactly 4 options, exactly one correct; wrong options are plausible mistakes a learner makes on this objective.
- Text only: no pictures, diagrams, audio or "the figure below". Everything needed is in the question.
- Do not put the correct option's wording inside the question. No "all of the above" or "none of the above".
- The correct option must not stand out by length: keep the four options about the same length.
- Facts and arithmetic must be exactly right. Keep each question under 60 words.
- Each question is different in what it asks (not the same question with new numbers).
- Decide the correct option first, then set answer_index to its 0-based position, and write the rationale about that option.`;

const WRITE_SCHEMA = {
  type: 'object',
  properties: { questions: { type: 'array', items: { type: 'object', properties: { prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer_index: { type: 'integer' }, rationale: { type: 'string' } }, required: ['prompt', 'choices', 'answer_index', 'rationale'] } } },
  required: ['questions'],
};

const JUDGE_SYSTEM = `You check quiz questions for a school course. Each question names its course grade and the learning objective it is meant to test. For each question, solve it yourself first and pick the option you believe is correct (you are not told the key). Then judge:
- tests_objective: does it test the learning objective given (not a different topic)?
- one_correct: is exactly one option correct, with no ambiguity?
- grade_ok: is it suitable for the grade given, and answerable from the text alone?
Be strict: a question with a factual error, two defensible answers, or a missing picture fails.
- fact_claim: if the correct answer depends on a fact about the world (history, science, geography, a book, a date, a person) or on a word's meaning that the question does not give, state that fact in one short sentence; otherwise "" (arithmetic, logic, grammar rules, or a passage given in the question need none).`;
const JUDGE_SCHEMA = {
  type: 'object',
  properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' }, tests_objective: { type: 'boolean' }, one_correct: { type: 'boolean' }, grade_ok: { type: 'boolean' }, issue: { type: 'string' }, fact_claim: { type: 'string' } }, required: ['index', 'chosen_index', 'tests_objective', 'one_correct', 'grade_ok', 'issue', 'fact_claim'] } } },
  required: ['verdicts'],
};
const qText = (q, i, gradeName, o) => `Question ${i} [Course grade: ${gradeName} | Learning objective: ${o.title} — ${o.covers}]\n${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`;
kinds['obj-blind'] = { system: JUDGE_SYSTEM, schema: JUDGE_SCHEMA, batch: 16, maxTokens: 6000, render: (it, i) => qText(it.q, i, it.gradeName, it.o) };

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
function lengthCue(choices, ki) {
  const a = String(choices[ki] || '').trim().length;
  const others = choices.filter((_, j) => j !== ki).map((c) => String(c).trim().length);
  const mean = others.reduce((x, y) => x + y, 0) / others.length;
  const max = Math.max(...others);
  return (a >= 1.8 * mean && a - max >= 10) || (max >= 1.8 * a && max - a >= 10 && others.filter((l) => l >= 1.8 * a).length === others.length);
}
function codeChecks(q, o, seen) {
  const p = [];
  if (!q || typeof q.prompt !== 'string' || q.prompt.trim().length < 12) p.push('prompt missing or too short');
  if (q && q.prompt && q.prompt.split(/\s+/).length > 80) p.push('prompt over 80 words');
  if (!Array.isArray(q && q.choices) || q.choices.length !== 4) p.push('not exactly 4 choices');
  else {
    if (new Set(q.choices.map(norm)).size !== 4) p.push('duplicate choices');
    if (q.choices.some((c) => !String(c).trim())) p.push('empty choice');
    if (q.choices.some((c) => /\b(all|none) of the above\b/i.test(c))) p.push('all/none of the above');
  }
  if (!Number.isInteger(q && q.answer_index) || q.answer_index < 0 || q.answer_index > 3) p.push('answer index out of range');
  else if (Array.isArray(q.choices) && q.choices.length === 4) {
    const key = norm(q.choices[q.answer_index]);
    if (key.length > 3 && norm(q.prompt).includes(key)) p.push('the correct option is written in the question');
    if (lengthCue(q.choices, q.answer_index)) p.push('length cue: the key stands out by length');
    const ka = keyAgreement({ choices: q.choices.map(String), answerIndex: q.answer_index, explanation: String(q.rationale || '') });
    if (ka.flagged) p.push(`rationale points to another option (${ka.reason})`);
    if (o.track_id === 'math') {
      const mp = [...mathClaims.questionProblems({ prompt: q.prompt, choices: q.choices, answer: q.choices[q.answer_index] }), ...mathClaims.arithmeticProblems(String(q.rationale || ''))];
      if (mp.length) p.push(`math-claims: ${mp.map((x) => x.problem).join('; ').slice(0, 200)}`);
    }
  }
  if (/\b(picture|diagram|image|listen to|audio)\b|\b(the|this) (figure|graph|grid|model) (below|above|shown)\b|\b(shown|pictured) (below|above|here)\b|\bin the (figure|diagram)\b/i.test((q && q.prompt) || '')) p.push('needs a picture or audio');
  if (!String((q && q.rationale) || '').trim()) p.push('no rationale');
  if (q && q.prompt && seen.has(norm(q.prompt))) p.push('duplicate of another question for this objective');
  return p;
}

// ── which objectives, in what order ──────────────────────────────────────────
function plan() {
  const tracks = Array.isArray(curriculum.TRACKS) ? curriculum.TRACKS : Object.values(curriculum.TRACKS);
  const gradesOf = (id) => ((tracks.find((t) => t.id === id) || {}).grades || []).map((g) => ({ track: id, grade: g }));
  const interleave = (lists) => { const out = []; for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]); return out; };
  const grades = [...interleave(['math', 'english', 'reading'].map(gradesOf)), ...interleave(['iq', 'act', 'spanish'].map(gradesOf))];
  const list = [];
  for (const { track, grade } of grades) for (const o of coverage.objectivesFor(track, grade.id)) list.push({ o, gradeName: grade.name, ref: `${track}:${grade.id}` });
  return list;
}

function loadDone() {
  const done = new Map();
  if (fs.existsSync(PILOT)) for (const l of fs.readFileSync(PILOT, 'utf8').split('\n')) { try { const r = JSON.parse(l); if (!r.error) done.set(r.objective, { ...r, source: 'pilot' }); } catch { /* */ } }
  if (fs.existsSync(RESULTS)) for (const l of fs.readFileSync(RESULTS, 'utf8').split('\n')) { try { const r = JSON.parse(l); done.set(r.objective, r); } catch { /* */ } }
  return done;
}

const stats = { objectives: 0, done: 0, written: 0, kept: 0, inflight: 0, b_pending: 0, rounds2: 0, errors: 0 };

async function roundFor(job, { o, gradeName }, round, already) {
  const avoid = already.length ? `\n\nThese questions already exist for this objective; write different ones (different in what they ask):\n${already.map((q) => `- ${q.prompt}`).join('\n')}` : '';
  const n = round ? Math.max(2, WANT - already.length + 1) : PER;
  const user = `Course grade: ${gradeName}\nLearning objective: ${o.title} — ${o.covers}${avoid}\n\nWrite ${n} questions.`;
  // MiniMax (xKiro) races the free pool's writer lanes; whichever allowed writer is free first writes
  const w = await core.write({ job, system: WRITE_SYSTEM, user, schema: WRITE_SCHEMA, schemaName: 'submit_questions', maxTokens: 6000 });
  const writer = w.model;
  const questions = ((w.data && w.data.questions) || []).slice(0, n + 1);
  const seen = new Set(already.map((q) => norm(q.prompt)));
  const checked = questions.map((q) => { const p = codeChecks(q, o, seen); if (q && q.prompt) seen.add(norm(q.prompt)); return { q, p }; });
  const passing = checked.filter((c) => !c.p.length).map((c) => c.q);
  const rejected = checked.filter((c) => c.p.length).map((c) => ({ round, writer, prompt: c.q && c.q.prompt, choices: c.q && c.q.choices, answer_index: c.q && c.q.answer_index, reason: `code: ${c.p.join('; ')}` }));
  core.writerStat(writer, { written: questions.length, code_pass: passing.length });
  return { written: questions.length, passing, rejected, writer };
}

async function settle({ o }, r, round) {
  const items = [];
  const rejected = [...r.rejected];
  // two blind verdicts per question: two different families, neither the writer's
  const vs = await Promise.all(r.passing.map((q) => core.judgeTwo('objectives', 'obj-blind', { q, o, gradeName: r.gradeName }, r.writer)));
  const models = new Set();
  await Promise.all(r.passing.map(async (q, i) => {
    const [ja, jb] = vs[i];
    const va = ja && ja.v; const vb = jb && jb.v;
    [ja, jb].forEach((j) => { if (j) models.add(j.model); });
    const good = (v) => v && v.chosen_index === q.answer_index && v.tests_objective && v.one_correct && v.grade_ok;
    if (va && vb) core.writerStat(r.writer, { judged: 1, a_key: va.chosen_index === q.answer_index ? 1 : 0, b_key: vb.chosen_index === q.answer_index ? 1 : 0, both_key: good(va) && good(vb) ? 1 : 0, judges_same_pick: va.chosen_index === vb.chosen_index ? 1 : 0 });
    let why = null;
    let src = null;
    if (good(va) && good(vb)) {
      const claims = source.claimsOf(va, vb);
      if (claims.length) {
        core.writerStat(r.writer, { fact_claims: 1 });
        src = await source.checkAll({ job: 'objectives', writerModel: r.writer, claims, prompt: q.prompt, answer: q.choices[q.answer_index], topic: `${o.title} ${o.track_id}` });
        if (src.ok) core.writerStat(r.writer, { sourced: 1 });
        else why = `source: ${src.checks.map((c) => `"${c.claim.slice(0, 120)}": ${c.verdict || c.method}`).join('; ')}`;
      }
      if (!why) {
        core.writerStat(r.writer, { kept: 1 });
        items.push({ objective_id: o.id, track_id: o.track_id, grade_id: o.grade_id, skill_id: o.skill, level: o.lesson_level, format: 'multiple_choice', prompt: q.prompt.trim(), choices: q.choices.map((c) => String(c).trim()), answer: String(q.choices[q.answer_index]).trim(), rationale: String(q.rationale).trim(), verified: { code: true, writer: r.writer, writer_family: core.familyOf(r.writer), judge_a: `${ja.model} (blind)`, judge_b: `${jb.model} (blind)`, judge_families: [ja.family, jb.family], source: src ? src.checks.map((c) => ({ claim: c.claim, url: c.url, quote: c.quote, reader: c.reader })) : 'no factual claim named by either judge', round } });
        return;
      }
    }
    if (!why) {
      why = [['A', va], ['B', vb]].map(([n, v]) => {
        if (!v) return `${n}: no verdict`;
        const bits = [];
        if (v.chosen_index !== q.answer_index) bits.push(`picked ${v.chosen_index} not ${q.answer_index}`);
        if (!v.tests_objective) bits.push('off objective');
        if (!v.one_correct) bits.push('not exactly one correct');
        if (!v.grade_ok) bits.push('not suitable');
        return bits.length ? `${n}: ${bits.join(', ')}${v.issue ? ` (${String(v.issue).slice(0, 160)})` : ''}` : null;
      }).filter(Boolean).join(' | ');
    }
    rejected.push({ round, writer: r.writer, prompt: q.prompt, choices: q.choices, answer_index: q.answer_index, reason: why, judge_a: ja && ja.model, judge_b: jb && jb.model, source: src ? src.checks : undefined });
  }));
  return { items, rejected, judgeB: [...models] };
}

async function doObjective(job, unit) {
  const all = { objective: unit.o.id, ref: unit.ref, title: unit.o.title, written: 0, items: [], rejected: [], writer: null, judge_a: null, judge_b: [], rounds: 0 };
  for (let round = 0; round < 2 && all.items.length < WANT; round++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await roundFor(job, unit, round, all.items);
    r.gradeName = unit.gradeName;
    all.rounds = round + 1;
    all.written += r.written; all.writer = r.writer;
    all.writers = [...new Set([...(all.writers || []), r.writer])];
    if (round) stats.rounds2++;
    if (!r.passing.length) { all.rejected.push(...r.rejected); continue; }
    all.judge_a = 'two blind judges of two families other than the writer (see each item)';
    stats.b_pending += r.passing.length;
    // eslint-disable-next-line no-await-in-loop
    const s = await settle(unit, r, round);
    stats.b_pending -= r.passing.length;
    all.items.push(...s.items); all.rejected.push(...s.rejected);
    all.judge_b = [...new Set([...all.judge_b, ...s.judgeB])];
  }
  return all;
}

let writing = false;
function writeOutputs() {
  if (writing) return; writing = true;
  try {
    const done = loadDone();
    const byGrade = new Map();
    for (const r of done.values()) {
      const ref = r.ref || (r.items[0] ? `${r.items[0].track_id}:${r.items[0].grade_id}` : null) || (r.source === 'pilot' ? (r.objective.startsWith('volume') ? 'math:volume_coordinates_and_expressions' : 'english:intermediate') : 'unknown');
      if (!byGrade.has(ref)) byGrade.set(ref, []);
      byGrade.get(ref).push(r);
    }
    const report = { generated_at: new Date().toISOString(), rule: 'kept = code checks pass AND two blind judges of two different families, neither the writer family, both pick the key and say on-objective, one correct, grade-suitable AND any fact the key depends on is quoted verbatim from offline Wikipedia/Wiktionary (before 14:10 UTC 2026-10-24: writer MiniMax, judge A MiniMax in a separate blind pass, judge B another family)', writers: core.writerReport(), grades: {} };
    for (const [ref, rs] of byGrade) {
      const items = rs.flatMap((r) => r.items);
      const [t, g] = ref.split(':');
      fs.writeFileSync(path.join(OUT, `objective-items.${t}.${g}.json`), JSON.stringify({ track_id: t, grade_id: g, generated_at: new Date().toISOString(), items }, null, 1));
      report.grades[ref] = { objectives_done: rs.length, objectives_total: coverage.objectivesFor(t, g).length, written: rs.reduce((s, r) => s + (r.written || 0), 0), kept: items.length, with_3_plus: rs.filter((r) => r.items.length >= 3).length, with_none: rs.filter((r) => !r.items.length).length, from_pilot: rs.filter((r) => r.source === 'pilot').length };
    }
    const tot = Object.values(report.grades).reduce((s, g) => ({ done: s.done + g.objectives_done, written: s.written + g.written, kept: s.kept + g.kept }), { done: 0, written: 0, kept: 0 });
    report.total = { ...tot, objectives: 8955, keep_rate: tot.written ? +(tot.kept / tot.written).toFixed(3) : 0 };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  } catch (err) { log(`objectives: report failed: ${err.message}`); } finally { writing = false; }
}

async function run({ workers = 24, limit = 0, maxBPending = 2500 } = {}) {
  const job = 'objectives';
  let units = plan();
  const done = loadDone();
  stats.objectives = units.length;
  units = units.filter((u) => !done.has(u.o.id));
  if (limit) units = units.slice(0, limit);
  stats.done = done.size;
  log(`objectives: ${stats.objectives} in all, ${done.size} done before, ${units.length} to do`);
  let at = 0;
  const reportTimer = setInterval(writeOutputs, 5 * 60000);
  async function worker() {
    while (at < units.length) {
      while (stats.b_pending > maxBPending) await core.sleep(5000); // judge B far behind: let it catch up
      const u = units[at++];
      stats.inflight++;
      try {
        const r = await doObjective(job, u);
        fs.appendFileSync(RESULTS, `${JSON.stringify(r)}\n`);
        stats.done++; stats.written += r.written; stats.kept += r.items.length;
      } catch (err) {
        stats.errors++;
        log(`objectives: ${u.o.id}: ${String(err.message).slice(0, 160)}`);
        if (err.fatal) return;
      } finally { stats.inflight--; }
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  clearInterval(reportTimer);
  writeOutputs();
  log(`objectives: finished this pass (${stats.done} done)`);
}

module.exports = { run, stats, writeOutputs, codeChecks };
