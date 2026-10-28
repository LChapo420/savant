/**
 * Job 2: regenerate the English Proficient game payloads with regen-games.js's pipeline
 * (staged/content-fixes/regen-games.js: the level's own game prompt + its accuracy rules,
 * the game checker's per-question code checks + explanation-key agreement, rewrite rather
 * than patch), with tonight's two-judge rule. Since 14:10 UTC: the writer is MiniMax or a free
 * pool writer (core.write), each question gets two blind judges of two DIFFERENT families,
 * neither the writer's (core.judgeTwo), and a fact the key depends on must be quoted verbatim
 * from offline Wikipedia / Wiktionary (source-check.js). Before: judge A = MiniMax in a
 * separate blind pass, judge B = another family. Rows 13 and 64 (the two samples, judged by two Nemotrons)
 * are not rewritten: their kept questions are re-judged by judge B, cross-family.
 *
 * Output: staged/content-fixes/games-night/game-<row>.json (regen-games.js's envelope)
 * and report.json. Reads a scratch COPY of data/db.json only.
 */
const fs = require('fs');
const path = require('path');
const core = require('./core');

const { ROOT, log, judgeB, kinds } = core;
const source = require('./source-check');
const games = require(path.join(ROOT, 'services', 'game-payloads.js'));
const gamePrompt = require(path.join(ROOT, 'scripts', 'lib', 'game-prompt.js'));
const { keyAgreement } = require(path.join(ROOT, 'services', 'key-agreement.js'));

const OUT = path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'games-night');
fs.mkdirSync(OUT, { recursive: true });
const SAMPLES = [13, 64];
const CHUNK = 6;

// regen-games.js's accuracy rules, unchanged.
const ACCURACY_RULES = `

Accuracy rules (an answer-key audit of earlier games found these mistakes; none may appear):
- Decide the correct option FIRST, then write the explanation about that option, then set answerIndex to that option's position (0-based). The explanation must describe the option at answerIndex, never another one.
- The four options are four different texts. Never repeat an option, even with different capitals.
- Exactly one option is correct. If two options could be defended (for example a comma splice is also a run-on; a dash can both add emphasis and set off extra information), rewrite the options.
- Do not build a question on a false premise, and keep each explanation to one accurate sentence.`;

const JUDGE_SYSTEM = `You check quiz questions for an English course (grades 9-10). For each question, work it out yourself and pick the option you believe is correct (you are not told the key). Then say whether exactly one option is correct, with no ambiguity and no false premise. Be strict: two defensible options, no correct option, a factual or grammar error, or a question that does not make sense all fail one_correct.
fact_claim: if the correct answer depends on a fact about the world (a book, an author, a date, history, science) or on a word's meaning that the question does not give, state that fact in one short sentence; otherwise "" (grammar, usage and punctuation rules, or a passage given in the question, need none).`;
const JUDGE_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' }, one_correct: { type: 'boolean' }, issue: { type: 'string' }, fact_claim: { type: 'string' } }, required: ['index', 'chosen_index', 'one_correct', 'issue', 'fact_claim'] } } }, required: ['verdicts'] };
const qText = (q, i) => `Question ${i}: ${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`;
kinds['game-blind'] = { system: JUDGE_SYSTEM, schema: JUDGE_SCHEMA, batch: 16, maxTokens: 6000, render: (q, i) => qText(q, i) };

const WRITE_SCHEMA = { type: 'object', required: ['questions'], properties: { questions: { type: 'array', items: { type: 'object', properties: { prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answerIndex: { type: 'integer' }, explanation: { type: 'string' }, difficulty: { type: 'integer' }, skill: { type: 'string' }, topic: { type: 'string' } } } } } };

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
function codeProblems(q, schema, seen) {
  const one = games.inspectPayload({ questions: [q] }, { ...schema, questionCount: 1 }).filter((p) => /^q1:/.test(p)).map((p) => p.replace(/^q1:\s*/, ''));
  const opts = Array.isArray(q && q.choices) ? q.choices.map(String) : [];
  const ka = keyAgreement({ choices: opts, answerIndex: Number(q && q.answerIndex), explanation: String((q && q.explanation) || '') });
  if (ka.flagged) one.push(`explanation-key: ${ka.reason}`);
  if (q && q.prompt && seen.has(norm(q.prompt))) one.push('repeats a question already in the set');
  return one;
}

const stats = { rows: 0, rows_done: 0, written: 0, kept: 0, samples_rejudged: 0 };

async function regenRow(job, row) {
  const schema = games.schemaFor(row.engine_id);
  if (!schema) throw new Error(`no schema for ${row.engine_id}`);
  const want = schema.questionCount;
  const prompt = gamePrompt.buildGamePrompt(row.track_id, row.grade_id, row.level, schema);
  const kept = []; const rejected = []; const judged = [];
  let written = 0;
  const seen = new Set();
  const writers = new Set();
  for (let round = 0; round < 4 && kept.length < want; round++) {
    const need = Math.ceil((want - kept.length) * (round ? 1.3 : 1.12));
    const fresh = [];
    const pending = [];
    for (let left = need, chunkNo = 0; left > 0; chunkNo++) {
      const n = Math.min(CHUNK, left);
      const already = [...kept, ...fresh];
      const user = `${prompt.user}${already.length ? `\n\nTHE SET ALREADY HAS THESE QUESTIONS — do not repeat any of them, their facts, or their answers:\n${already.map((q) => `- ${String(q.prompt).slice(0, 150)} (answer: ${String((Array.isArray(q.choices) ? q.choices : [])[q.answerIndex] || '').slice(0, 70)})`).join('\n').slice(0, 9000)}` : ''}\n\nWrite exactly ${n} questions now, as {"questions": [{"prompt", "choices" (exactly ${schema.choicesPerQuestion || 4}), "answerIndex" (0-based), "explanation", "difficulty" (1-10), "skill", "topic"}]}.`;
      let w;
      // eslint-disable-next-line no-await-in-loop
      try { w = await core.write({ job, key: ['game-write', row.id, round, chunkNo, user], system: prompt.system + ACCURACY_RULES, user, schema: WRITE_SCHEMA, schemaName: 'submit_game_questions', maxTokens: 14000 }); } catch (err) { if (err.fatal) throw err; log(`games: row ${row.id} chunk failed: ${err.message}`); left -= n; continue; }
      const writer = w.model;
      writers.add(writer);
      const reply = games.normalizeReply(w.data);
      const qs = (reply && Array.isArray(reply.questions) ? reply.questions : []).filter((q) => q && typeof q === 'object').slice(0, n);
      if (!qs.length) { left -= n; continue; }
      fresh.push(...qs); written += qs.length; left -= qs.length;
      const passing = [];
      for (const q of qs) {
        const probs = codeProblems(q, schema, seen);
        if (q && q.prompt) seen.add(norm(q.prompt));
        if (probs.length) rejected.push({ round, stage: 'code', prompt: q.prompt, choices: q.choices, answerIndex: q.answerIndex, explanation: q.explanation, reason: probs.join('; ') });
        else passing.push(q);
      }
      core.writerStat(writer, { written: qs.length, code_pass: passing.length });
      if (!passing.length) continue;
      // two blind judges of two different families, neither the writer's; settled at the end of the round
      passing.forEach((q) => pending.push(core.judgeTwo(job, 'game-blind', q, writer).then(async ([ja, jb]) => {
        const out = { q, writer, a: ja && ja.v, b: jb && jb.v, modelA: ja && ja.model, modelB: jb && jb.model, src: null };
        const ki = Number(q.answerIndex);
        const good = (x) => x && x.chosen_index === ki && x.one_correct === true;
        if (out.a && out.b) core.writerStat(writer, { judged: 1, a_key: out.a.chosen_index === ki ? 1 : 0, b_key: out.b.chosen_index === ki ? 1 : 0, both_key: good(out.a) && good(out.b) ? 1 : 0, judges_same_pick: out.a.chosen_index === out.b.chosen_index ? 1 : 0 });
        if (good(out.a) && good(out.b)) {
          const claims = source.claimsOf(out.a, out.b);
          if (claims.length) {
            core.writerStat(writer, { fact_claims: 1 });
            out.src = await source.checkAll({ job, writerModel: writer, claims, prompt: q.prompt, answer: (q.choices || [])[ki], topic: `${q.topic || ''} ${q.skill || ''} English` });
            if (out.src.ok) core.writerStat(writer, { sourced: 1 });
          }
        }
        return out;
      })));
    }
    // eslint-disable-next-line no-await-in-loop
    const verdicts = await Promise.all(pending);
    for (const v of verdicts) {
      const ki = Number(v.q.answerIndex);
      const ok = (x) => x && x.chosen_index === ki && x.one_correct === true;
      judged.push({ round, ki, a: v.a ? { pick: v.a.chosen_index, one: v.a.one_correct } : null, b: v.b ? { pick: v.b.chosen_index, one: v.b.one_correct } : null, modelA: v.modelA, modelB: v.modelB });
      const sourced = !v.src || v.src.ok;
      if (ok(v.a) && ok(v.b) && sourced && kept.length < want) {
        core.writerStat(v.writer, { kept: 1 });
        kept.push({ ...v.q, verified: { code: true, writer: v.writer, writer_family: core.familyOf(v.writer), judge_a: `${v.modelA} (blind)`, judge_b: `${v.modelB} (blind)`, source: v.src ? v.src.checks.map((c) => ({ claim: c.claim, url: c.url, quote: c.quote, reader: c.reader })) : 'no factual claim named by either judge' } });
      } else if (ok(v.a) && ok(v.b) && !sourced) {
        rejected.push({ round, stage: 'source', writer: v.writer, prompt: v.q.prompt, choices: v.q.choices, answerIndex: ki, explanation: v.q.explanation, reason: `source: ${v.src.checks.map((c) => `"${c.claim.slice(0, 120)}": ${c.verdict || c.method}`).join('; ')}` });
      } else {
        const why = [['A', v.a], ['B', v.b]].map(([n, x]) => (!x ? `${n}: no verdict` : x.chosen_index !== ki ? `${n}: picked ${x.chosen_index} not ${ki}${x.issue ? ` (${String(x.issue).slice(0, 140)})` : ''}` : x.one_correct !== true ? `${n}: not exactly one correct${x.issue ? ` (${String(x.issue).slice(0, 140)})` : ''}` : null)).filter(Boolean).join(' | ');
        rejected.push({ round, stage: 'judges', prompt: v.q.prompt, choices: v.q.choices, answerIndex: ki, explanation: v.q.explanation, reason: why || 'surplus' });
      }
    }
    log(`games: row ${row.id} round ${round}: wrote ${fresh.length}, kept so far ${kept.length}/${want}`);
  }
  // MiniMax tends to put the key first; spread the keys over the slots by re-ordering each
  // question's options (texts unchanged; the judges answered blind, so order does not matter).
  const spread = kept.map((q, i) => {
    const n = q.choices.length;
    const target = i % n;
    if (Number(q.answerIndex) === target) return q;
    const choices = q.choices.slice();
    [choices[q.answerIndex], choices[target]] = [choices[target], choices[q.answerIndex]];
    return { ...q, choices, answerIndex: target };
  });
  const ordered = games.evenOrder(spread.map((q, i) => ({ ...q, id: `q${i + 1}` })), `${row.track_id}:${row.grade_id}:${row.level}`);
  const setProblems = games.inspectPayload({ questions: ordered }, schema).filter((p) => !/^q\d+:/.test(p));
  const payload = { ...row.payload, questions: ordered.map((q) => ({ id: String(q.id), prompt: String(q.prompt), choices: q.choices.map(String), answerIndex: Number(q.answerIndex), explanation: String(q.explanation), difficulty: Number(q.difficulty), skill: String(q.skill || ''), topic: String(q.topic || '') })), feedback: row.payload.feedback };
  const both = judged.filter((j) => j.a && j.b);
  const st = {
    written, code_rejected: rejected.filter((r) => r.stage === 'code').length, sent_to_judges: judged.length, kept: kept.length,
    keep_rate_of_written: written ? +(kept.length / written).toFixed(3) : 0,
    judges: { both_answered: both.length, picked_same_option: both.filter((j) => j.a.pick === j.b.pick).length, a_picked_key: judged.filter((j) => j.a && j.a.pick === j.ki).length, b_picked_key: judged.filter((j) => j.b && j.b.pick === j.ki).length, models_a: [...new Set(judged.map((j) => j.modelA).filter(Boolean))], models_b: [...new Set(judged.map((j) => j.modelB).filter(Boolean))] },
    complete: kept.length >= want && !setProblems.length, set_problems: setProblems,
  };
  return { row_id: row.id, engine_id: row.engine_id, track_id: row.track_id, grade_id: row.grade_id, level: row.level, generated_at: new Date().toISOString(), writer: [...writers].join(', '), stats: st, payload, kept, rejected, judged, applied: false };
}

async function rejudgeSample(job, id) {
  const file = path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'games', `game-${id}.json`);
  const g = JSON.parse(fs.readFileSync(file, 'utf8'));
  const qs = g.payload.questions;
  // kept by two Nemotrons: re-judged by a family that is not Nemotron
  const vs = await Promise.all(qs.map((q) => judgeB(job, 'game-blind', q, ['nemotron'])));
  const rows = qs.map((q, i) => ({ id: q.id, prompt: q.prompt, key: q.answerIndex, b_pick: vs[i] && vs[i].v.chosen_index, b_one_correct: vs[i] && vs[i].v.one_correct, b_issue: vs[i] && vs[i].v.issue, b_model: vs[i] && vs[i].model }));
  const agree = rows.filter((r) => r.b_pick === r.key && r.b_one_correct === true);
  const out = { row_id: id, rejudged_at: new Date().toISOString(), note: 'The sample game kept by Nemotron Ultra + Nemotron Lightning (one family), re-judged blind by a judge from another family.', questions: qs.length, cross_family_agrees: agree.length, disagreements: rows.filter((r) => !(r.b_pick === r.key && r.b_one_correct === true)), answered: rows.filter((r) => r.b_pick !== undefined && r.b_pick !== null).length };
  fs.writeFileSync(path.join(OUT, `sample-${id}-rejudge.json`), JSON.stringify(out, null, 1));
  stats.samples_rejudged++;
  log(`games: sample ${id} re-judged cross-family: ${agree.length}/${qs.length} agree with the key`);
}

function writeReport() {
  const rows = [];
  for (const f of fs.readdirSync(OUT).filter((x) => /^game-\d+\.json$/.test(x))) {
    try { const g = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); rows.push({ row_id: g.row_id, engine_id: g.engine_id, level: g.level, ...g.stats, judges: undefined, models_b: g.stats.judges.models_b }); } catch { /* */ }
  }
  rows.sort((a, b) => a.row_id - b.row_id);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ generated_at: new Date().toISOString(), applied: false, rows_done: rows.length, complete: rows.filter((r) => r.complete).length, written: rows.reduce((s, r) => s + r.written, 0), kept: rows.reduce((s, r) => s + r.kept, 0), rows }, null, 1));
}

async function run({ dbCopy, workers = 3 }) {
  const job = 'games';
  const db = JSON.parse(fs.readFileSync(dbCopy, 'utf8'));
  const rows = db.game_payloads.filter((r) => r.track_id === 'english' && r.grade_id === 'proficient').sort((a, b) => a.id - b.id);
  stats.rows = rows.length;
  const todo = rows.filter((r) => !SAMPLES.includes(r.id) && !fs.existsSync(path.join(OUT, `game-${r.id}.json`)));
  stats.rows_done = rows.length - SAMPLES.length - todo.length;
  log(`games: ${rows.length} rows; ${todo.length} to regenerate; samples ${SAMPLES.join(', ')} to re-judge`);
  const sampleJobs = SAMPLES.filter((id) => !fs.existsSync(path.join(OUT, `sample-${id}-rejudge.json`))).map((id) => rejudgeSample(job, id).catch((err) => log(`games: sample ${id}: ${err.message}`)));
  let at = 0;
  async function worker() {
    while (at < todo.length) {
      const row = todo[at++];
      try {
        const r = await regenRow(job, row);
        fs.writeFileSync(path.join(OUT, `game-${row.id}.json`), JSON.stringify(r, null, 1));
        stats.rows_done++; stats.written += r.stats.written; stats.kept += r.stats.kept;
        log(`games: row ${row.id} kept ${r.stats.kept}/${r.stats.written} written, complete ${r.stats.complete}`);
        writeReport();
      } catch (err) {
        log(`games: row ${row.id}: ${err.message}`);
        if (err.fatal) return;
      }
    }
  }
  await Promise.all([...sampleJobs, ...Array.from({ length: workers }, worker)]);
  writeReport();
  log('games: finished');
}

module.exports = { run, stats };
