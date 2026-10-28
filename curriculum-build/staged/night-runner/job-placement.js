/**
 * Job 0 (priority, 2026-10-24 14:45 UTC): finish the four staged placement sets the placement
 * re-validation agent left half-judged (basketball 105, piano 133, chess 133, Spanish 399;
 * curriculum-build/PLACEMENT-REVALIDATION-2026-10-24.md). Its pipeline's own files are filled in
 * its own formats, so pipeline.js merge2 / keys2 and the apply gate (scratchpad reval/apply-live.js)
 * read them unchanged:
 *   A  blind key check (pipeline keySystem), placement-judge/<t>-keysA.json
 *   B  blind locate-and-key judge with the curriculum outline, placement-judge/<t>-nemotron.json
 * Rules: neither A nor B is the writer's family, and A and B are two different families
 * (core.judgeOne with a shared pair); their requests go ahead of all other judging (prio), and
 * only the strongest free judges take them (core STRONG: MiniMax, Nemotron Ultra, GLM 5.3, Qwen3.8
 * Max, Gemini 3.6 Flash), not the small ones (gpt-oss 20B, Nemotron Lightning).
 * A doubt (either judge says anything but "correct") is never overruled here: the item is
 * rewritten (pipeline.js rewrite, GLM 5.3 on NVIDIA, the judges' notes as the problem) and the
 * new item is judged by A and B again, up to PS_ROUNDS rounds. A set is reported verified only
 * when the apply gate's check passes. Nothing here writes data/db.json.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const core = require('./core');

const { ROOT, log, kinds } = core;
const SP = 'C:/Users/admin/AppData/Local/Temp/claude/C--coding-claudecommittdIq-folderThing/34e6f487-b3f5-4acd-899c-244171ef0427/scratchpad';
const PIPE = path.join(ROOT, 'curriculum-build', 'staged', 'placement-sets', 'pipeline.js');
const JUDGE_DIR = path.join(ROOT, 'curriculum-build', 'placement-judge');
const SETS = path.join(ROOT, 'curriculum-build', 'staged', 'placement-sets');
const BASE_DB = path.join(SP, 'reval', 'db.ps-base.json');
const PS_DB = path.join(SP, 'reval', 'db.runner-ps.json');
const DUMP = path.join(SP, 'reval', 'ps-dump.json');
const GATE = path.join(SP, 'reval', 'apply-live.js');
const REPORT = path.join(core.STATE, 'placement.json');
const TRACKS = (process.env.PS_TRACKS || 'basketball,piano,chess,spanish').split(',');
const ROUNDS = Number(process.env.PS_ROUNDS || 4);
// 2026-10-25: rounds left per track after a restart (PS_ROUNDS_<TRACK>), so the total stays at the owner's 4;
// the last round does not rewrite (its doubts go to the stronger model, not another GLM/Nemotron pass).
const ROUNDS_FOR = (t) => Number(process.env[`PS_ROUNDS_${t.toUpperCase()}`] || ROUNDS);
// Tracks whose judge-B verdicts are written from outside the pool (Claude in-app, family "anthropic",
// fallback order step 3) into placement-judge/<t>-nemotron.json: no B requests are queued for them, the
// file is re-read from disk each pass, and the track waits for them instead of giving up.
const EXT_B = new Set((process.env.PS_B_EXTERNAL || '').split(',').filter(Boolean));
// ...except items Claude itself rewrote (the stronger-model pass): their B judge must be another family, so the pool judges them.
const extB = (t, q) => EXT_B.has(t) && core.familyOf(q.writer) !== 'anthropic';

const stats = { tracks: {}, round: 0, phase: 'start' };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function child(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env, DB_FILE: '', DB_READONLY: '' }, maxBuffer: 64 * 1024 * 1024, timeout: 3 * 3600 * 1000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || '').split('\n').filter((l) => l && !/^ai: /.test(l)).slice(-5).join(' | ') });
    });
  });
}
// one DB copy and one dump per track, so each set runs its rounds on its own
const dbFor = (t) => PS_DB.replace(/\.json$/, `-${t}.json`);
async function dump(t) {
  const out = DUMP.replace(/\.json$/, `-${t}.json`);
  const a = await child([PIPE, 'dbcopy', dbFor(t), t], { PS_DB: BASE_DB });
  const b = await child([path.join(__dirname, 'placement-dump.js'), out, t], { PS_DB: dbFor(t) });
  if (!a.ok || !b.ok) throw new Error(`placement dump failed: ${a.err} ${b.err}`);
  return readJson(out, {})[t];
}

const KEY_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, key: { type: 'string', enum: ['correct', 'wrong', 'ambiguous', 'flawed'] }, answer: { type: 'string' }, note: { type: 'string' } }, required: ['index', 'key', 'answer', 'note'] } } }, required: ['verdicts'] };
const LOC_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, grade: { type: 'integer' }, unit: { type: 'integer' }, key: { type: 'string', enum: ['correct', 'wrong', 'ambiguous'] }, note: { type: 'string' } }, required: ['index', 'grade', 'unit', 'key', 'note'] } } }, required: ['verdicts'] };
const qText = (q, i) => `Question ${i}\nquestion: ${q.prompt}\n${q.choices ? `options: ${q.choices.map((c) => `[${c}]`).join(' ')}` : 'options: (type-in answer)'}\nkeyed answer: ${q.answer}`;
function defineKinds(t, d) {
  kinds[`psA-${t}`] = { system: `${d.keySystem}\nThe questions are numbered; use each question's number as its index.\nanswer: the option you worked out to be right. note: only when not correct, why, and the right answer ("" otherwise).`, schema: KEY_SCHEMA, strong: true, batch: 8, maxTokens: 24000, render: qText, keyOf: (q) => `psA:${t}:${q.key}` };
  kinds[`psB-${t}`] = { system: `${d.judgeSystem}\nThe questions are numbered; use each question's number as its index. grade: the G number from the outline; unit: the U number inside that grade. note: only when the key is wrong or ambiguous, why, and the right answer ("" otherwise).\n\nCURRICULUM OUTLINE\n${d.outline}`, schema: LOC_SCHEMA, strong: true, batch: 6, maxTokens: 24000, render: qText, keyOf: (q) => `psB:${t}:${q.key}` };
}

// verdict files: read, update in memory, written back after every verdict (one writer: this job)
const files = {};
function vfile(t, tag) { const f = path.join(JUDGE_DIR, `${t}${tag}.json`); if (!files[f]) files[f] = readJson(f, {}); return { f, v: files[f] }; }
function save(t, tag) { const { f, v } = vfile(t, tag); fs.writeFileSync(f, JSON.stringify(v, null, 1)); }

async function judgeTrack(t, d) {
  if (EXT_B.has(t)) delete files[path.join(JUDGE_DIR, `${t}-nemotron.json`)];
  const A = vfile(t, '-keysA').v; const B = vfile(t, '-nemotron').v;
  const qs = d.questions;
  const st = (stats.tracks[t] = { ...(stats.tracks[t] || {}), items: qs.length, a_have: qs.filter((q) => A[q.key]).length, b_have: qs.filter((q) => B[q.key]).length });
  const jobs = [];
  for (const q of qs) {
    if (A[q.key] && B[q.key]) continue;
    const wf = core.familyOf(q.writer);
    const pair = { claimed: new Set() };
    if (A[q.key]) pair.claimed.add(core.familyOf(A[q.key].judge));
    if (B[q.key]) pair.claimed.add(core.familyOf(B[q.key].judge));
    const exclude = new Set([wf]);
    if (!A[q.key]) {
      jobs.push(core.judgeOne('placement', `psA-${t}`, q, exclude, pair, qs.length).then((r) => {
        if (!r) { st.a_failed = (st.a_failed || 0) + 1; return; }
        A[q.key] = { key: r.v.key, answer: r.v.answer || '', note: r.v.note || '', judge: r.model, grade_id: q.grade_id, index: q.index, prompt: String(q.prompt).slice(0, 160), writer: q.writer, at: new Date().toISOString() };
        st.a_have++; save(t, '-keysA');
      }));
    }
    if (!B[q.key] && !extB(t, q)) {
      jobs.push(core.judgeOne('placement', `psB-${t}`, q, exclude, pair, qs.length).then((r) => {
        if (!r) { st.b_failed = (st.b_failed || 0) + 1; return; }
        const gi = Number(r.v.grade) - 1;
        if (!(gi >= 0 && gi < d.gradeIds.length)) { st.b_bad = (st.b_bad || 0) + 1; return; }
        const units = d.units[d.gradeIds[gi]] || 1;
        B[q.key] = { written_for: q.grade_id, band: q.band, grade_id: d.gradeIds[gi], grade_index: gi, unit: Math.max(1, Math.min(units, Number(r.v.unit) || 1)), units, key: r.v.key, note: r.v.note || '', prompt: String(q.prompt).slice(0, 160), judge: r.model, writer: q.writer, at: new Date().toISOString() };
        st.b_have++; save(t, '-nemotron');
      }));
    }
  }
  st.b_external_waiting = qs.filter((q) => !B[q.key] && extB(t, q)).length;
  log(`placement ${t}: ${qs.length} items, A ${st.a_have}, B ${st.b_have}; ${jobs.length} verdicts to get${st.b_external_waiting ? `; ${st.b_external_waiting} B verdicts from Claude in-app awaited` : ''}`);
  await Promise.all(jobs);
  if (EXT_B.has(t)) { delete files[path.join(JUDGE_DIR, `${t}-nemotron.json`)]; Object.assign(B, vfile(t, '-nemotron').v); }
  const onlyB = qs.every((q) => A[q.key] && (B[q.key] || extB(t, q)));
  return { complete: qs.every((q) => A[q.key] && B[q.key]), onlyB };
}

function writeReport() { try { fs.writeFileSync(REPORT, JSON.stringify({ at: new Date().toISOString(), ...stats }, null, 1)); } catch { /* */ } }

async function finishTrack(t, d, round, last = false) {
  const st = stats.tracks[t];
  const m = await child([PIPE, 'merge2', t], { PS_DB: dbFor(t) });
  st.merge = (m.out.match(/\{.*\}/) || [''])[0];
  const k = await child([PIPE, 'keys2', t], { PS_DB: dbFor(t) });
  let doubts = [];
  try { doubts = JSON.parse(k.out.slice(k.out.indexOf('['), k.out.lastIndexOf(']') + 1)); } catch { doubts = []; }
  const revFile = path.join(SETS, `review-${t}.json`);
  const old = readJson(revFile, []);
  const keep = old.filter((x) => x.action === 'keep');
  const list = doubts.filter((q) => !keep.some((x) => x.grade_id === q.grade_id && x.index === q.index && x.prompt === q.prompt))
    .map((q) => ({ grade_id: q.grade_id, index: q.index, action: 'rewrite', prompt: q.prompt, why: `Judges doubted the key: ${q.note}`.slice(0, 600), round: `runner-${round}`, at: new Date().toISOString() }));
  st.doubts_by_round = { ...(st.doubts_by_round || {}), [round]: list.length };
  st.doubt_notes = [...(st.doubt_notes || []), ...list.map((x) => ({ round, grade_id: x.grade_id, index: x.index, prompt: String(x.prompt).slice(0, 140), why: x.why.slice(0, 300) }))].slice(-400);
  log(`placement ${t} round ${round}: ${st.merge}; ${list.length} doubted keys to rewrite`);
  if (!list.length) {
    const g = await child([GATE, 'check', t]);
    st.gate = g.out.trim();
    st.verified = /PASS/.test(g.out);
    log(`placement ${t}: gate ${st.gate}`);
    return true;
  }
  fs.writeFileSync(revFile, JSON.stringify([...old, ...list], null, 1));
  if (last) { st.left_for_stronger = list.map((x) => ({ grade_id: x.grade_id, index: x.index })); log(`placement ${t}: last round; ${list.length} doubted keys left for the stronger model`); return false; }
  const listFile = path.join(SP, 'reval', `rewrite-${t}-runner-${round}.json`);
  fs.writeFileSync(listFile, JSON.stringify(list, null, 1));
  stats.phase = `rewriting ${t} (round ${round})`; writeReport();
  // GLM 5.3 rewrites first; when NVIDIA's GLM does not answer (0 rewritten), Nemotron Ultra tries
  let r = await child([PIPE, 'rewrite', t, listFile], { PS_DB: dbFor(t), PS_WRITER: process.env.PS_REWRITER || 'glm', NV_CONC: '2' });
  if (/rewrote 0\//.test(r.out) || !/rewrote/.test(r.out)) r = await child([PIPE, 'rewrite', t, listFile], { PS_DB: dbFor(t), PS_WRITER: 'nemotron', NV_CONC: '2' });
  st.rewrites = [...(st.rewrites || []), { round, listed: list.length, result: (r.out.match(/rewrote \d+\/\d+[^\n]*/) || [r.err || 'no output'])[0] }];
  log(`placement ${t}: ${st.rewrites[st.rewrites.length - 1].result}`);
  return false;
}

async function trackLoop(t) {
  let asks = 0;
  const R = ROUNDS_FOR(t);
  for (let round = 1; round <= R;) {
    // eslint-disable-next-line no-await-in-loop
    const d = await dump(t);
    defineKinds(t, d);
    // eslint-disable-next-line no-await-in-loop
    const { complete, onlyB } = await judgeTrack(t, d);
    stats.tracks[t].round = round; writeReport();
    if (!complete && onlyB) {
      // eslint-disable-next-line no-await-in-loop
      await core.sleep(120000);
      continue;
    }
    if (!complete) {
      if (++asks > 12) break;
      log(`placement ${t}: some verdicts failed; asking again`);
      // eslint-disable-next-line no-await-in-loop
      await core.sleep(60000);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    if (await finishTrack(t, d, round, round === R)) { writeReport(); return; }
    writeReport();
    round++;
  }
  log(`placement ${t}: not verified after ${R} rounds`);
}

async function run() {
  stats.phase = 'running'; writeReport();
  await Promise.all(TRACKS.map((t) => trackLoop(t).catch((err) => log(`placement ${t}: ${err.message}`))));
  stats.phase = 'finished'; writeReport();
  log(`placement: finished; verified ${TRACKS.filter((t) => stats.tracks[t] && stats.tracks[t].verified).join(', ') || 'none'}`);
}

module.exports = { run, stats };
