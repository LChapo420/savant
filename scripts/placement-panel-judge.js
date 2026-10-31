/**
 * More independent judges for a subject's placement questions, through Standard Compute (P1b).
 *
 *   node scripts/placement-panel-judge.js judge <track> [model ...]   blind readings, cached per model
 *   node scripts/placement-panel-judge.js calibrate <track>           mean of every judge with a reading
 *
 * Spanish, chess, piano and basketball had readings from one judge only (NVIDIA Nemotron; the other two NVIDIA judges and
 * MiniMax did not answer), so content/placement-calibration/<track>.json was written with no points and the walk placed
 * every question by its band. This adds judges from other model families, each reading the same outline and questions
 * with no hint of the grade they were written for (the instructions of scripts/placement-second-judge.js), and calibrates
 * each question on the mean of all judges that read it, needing at least two. Verdicts are cached in
 * curriculum-build/placement-judge/<track>-<judge>.json in the shape placement-second-judge.js uses, so a rerun only asks
 * for what is missing. Questions are never edited here (the Spanish tests are sealed); key disagreements are reported.
 *
 * Every call goes through services/standard-compute-ledger.js (ceiling $26). Only curriculum text is sent, no learner data.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const rules = require('../config/subject-placement');
const testers = require('./placement-testers');
const ledger = require('../services/standard-compute-ledger');

const DIR = path.join(ROOT, 'curriculum-build', 'placement-judge');
const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8')); } catch { return {}; } };
const write = (name, data) => fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(data, null, 1));

const DEFAULT_MODELS = ['anthropic/claude-sonnet-5.5', 'google/gemini-3.8-flash'];
const tagOf = (model) => ({ 'anthropic/claude-sonnet-5.5': 'sonnet', 'google/gemini-3.8-flash': 'gemini' }[model] || model.split('/').pop().replace(/[^a-z0-9]+/gi, '-'));
const CEILING_USD = 26;
const BATCH = 25;

const INSTRUCTIONS = 'For each question: the FIRST point in this curriculum (grade G and unit U) by which a learner who has '
  + 'worked through everything up to and including that unit would reliably answer it (about 9 in 10 such learners right). '
  + 'Judge from what it requires; multiple choice is answered by recognising the right option, and everyday knowledge or '
  + 'an earlier skill means an earlier point. Then check the key: correct / wrong / ambiguous (another option also defensible).';
const FORMAT = 'Reply with JSON only: {"questions":[{"id":"<id>","grade":<the G number>,"unit":<the U number>,'
  + '"key":"correct|wrong|ambiguous","note":"<one short reason, only when the key is not correct>"}]} with one entry for every id.';

async function chat(model, user) {
  const key = String(process.env.STANDARD_COMPUTE_API_KEY || '').trim();
  if (!key) throw new Error('no Standard Compute key');
  const base = (/^https?:\/\//.test(String(process.env.STANDARD_COMPUTE_BASE_URL || '')) ? process.env.STANDARD_COMPUTE_BASE_URL : 'https://api.stdcmpt.com/v1').replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
  const maxTokens = 24000; // reasoning models think before they answer; a small budget leaves an empty or cut reply
  const id = ledger.reserve({ usd: ledger.estimate({ model, inputChars: user.length, maxTokens }), task: 'placement_panel_judge', model, ceilingUsd: CEILING_USD });
  let settled = false;
  const settleOnce = (a) => { if (!settled) { settled = true; ledger.settle(id, a); } };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: user }], temperature: 0, max_tokens: maxTokens }),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    if (res.status !== 200 || !json || !json.choices) { settleOnce({ outcome: 'not_billed' }); throw new Error(`${model} ${res.status}: ${text.slice(0, 150)}`); }
    const u = json.usage || {};
    const usage = { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 };
    settleOnce({ usd: ledger.costOf(model, usage), outcome: 'ok', usage });
    const content = json.choices[0].message.content || '';
    if (json.choices[0].finish_reason === 'length') console.log(`  ${model}: reply cut at the token limit (${usage.output_tokens} tokens)`);
    return content;
  } catch (e) { settleOnce({ outcome: 'unknown' }); throw e; } finally { clearTimeout(timer); }
}

function parseRows(text) {
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try { return JSON.parse(s.slice(start, end + 1)).questions || []; } catch { return []; }
}

/** Blind readings from one model for every question it has not read yet; three rounds so a dropped id is asked again. */
async function judge(trackId, model) {
  const tag = tagOf(model);
  const cache = read(`${trackId}-${tag}`);
  const gradeIds = rules.gradesFor(trackId);
  const outline = testers.outline(trackId, gradeIds.length > 20 ? 1 : 2);
  const all = testers.allQuestions(trackId);
  let calls = 0;
  for (let round = 1; round <= 3; round++) {
    const todo = all.filter((q) => !cache[q.key]);
    if (!todo.length) break;
    let s = 0xbeef + round; // a fixed shuffle, so a batch mixes grades and the written grade cannot be read from the order
    const order = todo.map((q) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return [s, q]; }).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const batches = [];
    const size = round === 1 ? BATCH : 10; // retries in smaller batches, so a long reply is not cut again
    for (let i = 0; i < order.length; i += size) batches.push(order.slice(i, i + size));
    const run = async (batch) => {
      const prompt = [INSTRUCTIONS, '', FORMAT, '', '## Curriculum outline', '', outline, '', '## Questions', '',
        ...batch.map((q) => `id: ${q.key}\nquestion: ${q.prompt}\noptions: ${(q.choices || []).map((c) => `[${c}]`).join(' ')}\nkeyed answer: ${q.answer}\n`)].join('\n');
      let rows = [];
      try { rows = parseRows(await chat(model, prompt)); calls++; } catch (e) { console.log(`  ${trackId} ${tag}: ${e.message}`); return; }
      if (!rows.length) console.log(`  ${trackId} ${tag}: a batch of ${batch.length} came back unreadable (round ${round})`);
      const byKey = new Map(batch.map((q) => [q.key, q]));
      for (const r of rows) {
        const q = byKey.get(String(r.id).trim());
        const gi = Number(r.grade) - 1;
        if (!q || !(gi >= 0 && gi < gradeIds.length)) continue;
        const units = testers.unitsOf(trackId, gradeIds[gi]).length;
        cache[q.key] = {
          written_for: q.grade_id, band: q.band, grade_id: gradeIds[gi], grade_index: gi,
          unit: Math.max(1, Math.min(units, Number(r.unit) || 1)), units,
          key: ['correct', 'wrong', 'ambiguous'].includes(r.key) ? r.key : 'ambiguous',
          note: String(r.note || ''), prompt: String(q.prompt).slice(0, 160), judge: tag,
        };
      }
      write(`${trackId}-${tag}`, cache);
    };
    for (let i = 0; i < batches.length; i += 4) await Promise.all(batches.slice(i, i + 4).map(run)); // four at a time
  }
  const have = all.filter((q) => cache[q.key]).length;
  return { track: trackId, judge: tag, read: have, of: all.length, calls };
}

const pointOf = (v) => v.grade_index + (v.unit - 0.5) / v.units;

/** The judges whose caches exist for a track: Nemotron (the first reading) plus every panel model. */
function judgesFor(trackId) {
  const tags = ['nemotron'];
  for (const f of fs.readdirSync(DIR)) {
    const m = f.match(new RegExp(`^${trackId}-(sonnet|gemini|panel-(?!report)[a-z0-9-]+)\\.json$`));
    if (m) tags.push(m[1]);
  }
  return tags;
}

/** Each question's point: the mean of every judge that read it (at least two), with the spread and any key doubts. */
function calibrate(trackId) {
  const tags = judgesFor(trackId);
  const caches = Object.fromEntries(tags.map((t) => [t, read(`${trackId}-${t}`)]));
  const points = {};
  const doubts = [];
  const spreads = [];
  let missing = 0;
  for (const q of testers.allQuestions(trackId)) {
    const vs = tags.map((t) => caches[t][q.key]).filter((v) => v && Number.isFinite(pointOf(v)));
    if (vs.length < 2) { missing++; continue; }
    const ps = vs.map(pointOf);
    points[q.key] = Number((ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(3));
    spreads.push(Math.max(...ps) - Math.min(...ps));
    const bad = vs.filter((v) => v.key !== 'correct');
    if (bad.length >= 2) doubts.push({ key: q.key, grade_id: q.grade_id, prompt: String(q.prompt).slice(0, 160), answer: q.answer, verdicts: bad.map((v) => `${v.judge || 'nemotron'}: ${v.key}${v.note ? ` (${v.note})` : ''}`) });
  }
  const dir = path.join(ROOT, 'content', 'placement-calibration');
  fs.writeFileSync(path.join(dir, `${trackId}.json`), JSON.stringify({
    track_id: trackId,
    made_at: new Date().toISOString(),
    judges: tags.map((t) => ({ nemotron: 'nvidia nemotron-3-ultra (blind)', sonnet: 'claude-sonnet-5.5 via standard compute (blind)', gemini: 'gemini-3.8-flash via standard compute (blind)' }[t] || `${t} (blind)`)),
    note: 'Each question\'s point in grades from the start of the subject: the mean of every judge that read it (at least two; scripts/placement-panel-judge.js). Read by services/subject-placement.js calibrationFor.',
    points,
  }, null, 1));
  spreads.sort((a, b) => a - b);
  const med = spreads.length ? spreads[Math.floor(spreads.length / 2)] : null;
  const report = { track: trackId, judges: tags, calibrated: Object.keys(points).length, missing, median_spread_grades: med && Number(med.toFixed(2)), over_two_grades_apart: spreads.filter((x) => x > 2).length, key_doubts: doubts };
  write(`${trackId}-panel-report`, report);
  return { ...report, key_doubts: doubts.length };
}

module.exports = { judge, calibrate, judgesFor, chat, parseRows };

if (require.main === module) {
  const [cmd, trackId, ...models] = process.argv.slice(2);
  if (!rules.gradesFor(trackId || '').length) { console.log('usage: placement-panel-judge.js judge|calibrate <track> [model ...]'); process.exit(1); }
  (async () => {
    if (cmd === 'judge') for (const m of models.length ? models : DEFAULT_MODELS) console.log(JSON.stringify(await judge(trackId, m)));
    else if (cmd === 'calibrate') console.log(JSON.stringify(calibrate(trackId)));
    else { console.log('unknown command'); process.exit(1); }
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
