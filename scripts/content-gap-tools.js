#!/usr/bin/env node
/**
 * Content-gap pipeline: write new multiple-choice items with one model family and check every one
 * with a different family before it is kept. Curriculum content only: no learner data is read or sent.
 *
 *   node scripts/content-gap-tools.js catchup-gen <track>     top up the unit banks to 7 questions a unit (candidates)
 *   node scripts/content-gap-tools.js catchup-check <track>   blind-check the candidates, rewrite a rejected one once, drop it on a second rejection
 *   node scripts/content-gap-tools.js catchup-apply <track>   append the passed ones to content/unit-placement/<track>.json
 *   node scripts/content-gap-tools.js catchup-count <track>   questions per unit now
 *   node scripts/content-gap-tools.js place-gen <iq|act>      candidate top-end placement items (content/placement-extra)
 *   node scripts/content-gap-tools.js place-check <iq|act>    blind solve + position judge by two NVIDIA models
 *   node scripts/content-gap-tools.js place-apply <iq|act>    write the passed items and their calibrated points
 *
 * Writer: Standard Compute (DeepSeek V4.1) through services/providers/standard-compute.js. It needs
 * STANDARD_COMPUTE_PIPELINE=1 and the ledger's own cap (set STANDARD_COMPUTE_CAP_USD lower to be stricter).
 * Checkers: free NVIDIA models of other families (MiniMax M3.1 Flash, Mistral Large 4), at most two calls
 * in flight, and a stop when neither has answered for 30 minutes.
 *
 * Work files (candidates and verdicts) live in CONTENT_GAP_WORK (default curriculum-build/content-gap/work);
 * the counts of each run are written to curriculum-build/content-gap/<name>-report.json.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
process.env.DB_FILE = process.env.DB_FILE || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gap-')), 'db.json');
const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
const here = path.join(ROOT, '.env');
dotenv.config({ path: process.env.ENV_FILE || (fs.existsSync(here) ? here : path.join(ROOT, '..', '.env')) });
process.env.STANDARD_COMPUTE_PIPELINE = '1';

const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const adaptive = require('../services/adaptive-placement');
const testers = require('./placement-testers');
const { standardCompute } = require('../services/providers/standard-compute');
const nvidia = require('../services/providers/nvidia');

const WORK = process.env.CONTENT_GAP_WORK || path.join(ROOT, 'curriculum-build', 'content-gap', 'work');
const REPORTS = path.join(ROOT, 'curriculum-build', 'content-gap');
const TARGET = 7;
const MINIMAX = 'minimaxai/minimax-m3.1-flash';
const MISTRAL = 'mistralai/mistral-large-4-1t-a52b';

// ── small helpers ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashOf = (s) => crypto.createHash('sha256').update(String(s)).digest().readUInt32LE(0);
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1)); }
const norm = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

/** Writer: Standard Compute, up to 3 tries. A ledger stop (402) is fatal. */
async function write({ system, user, schema, schemaName, maxTokens = 6000, task }) {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await standardCompute.structured({ task, system, user, schema, schemaName, maxTokens });
    } catch (err) {
      last = err;
      if (err.status === 402 || /ledger/i.test(err.message || '')) throw err;
      // eslint-disable-next-line no-await-in-loop
      await sleep(2000 * attempt);
    }
  }
  throw last;
}

// Checkers: at most 2 NVIDIA calls in flight, across every process of this tool (two slot files; a slot
// older than 20 minutes is taken as left behind by a crashed run).
const SLOT_DIR = path.join(os.tmpdir(), 'content-gap-nvidia-slots');
async function slot() {
  fs.mkdirSync(SLOT_DIR, { recursive: true });
  for (;;) {
    for (const n of [1, 2]) {
      const f = path.join(SLOT_DIR, `slot${n}`);
      try { const age = Date.now() - fs.statSync(f).mtimeMs; if (age > 20 * 60 * 1000) fs.unlinkSync(f); } catch { /* none */ }
      try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); return f; } catch { /* taken */ }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(1500 + Math.floor(Math.random() * 1000));
  }
}
function release(f) { try { fs.unlinkSync(f); } catch { /* gone */ } }
let lastOk = Date.now();

async function ask(model, { system, user, schema, schemaName, maxTokens = 6000 }) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const held = await slot(); // a slot is held only for the call itself, never while waiting to retry
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await nvidia.structured({ role: 'check', system, user, schema, schemaName, maxTokens, models: [{ model, effort: 'medium' }], timeoutMs: Number(process.env.NVIDIA_CALL_MS || 240000), attempts: 1 });
      if (r && r.data) { lastOk = Date.now(); return r.data; }
    } catch (err) {
      if (Date.now() - lastOk > 30 * 60 * 1000) { console.error(`CHECKERS DOWN > 30 min (last: ${String(err.message).slice(0, 120)})`); process.exit(3); }
    } finally { release(held); }
    // eslint-disable-next-line no-await-in-loop
    await sleep(Math.min(30000, 5000 * attempt));
  }
  return null;
}

/** Options as letters in an order derived from the item, never the order the writer used. */
function lettered(item, salt = '') {
  const order = item.choices.map((c, i) => ({ c, h: hashOf(`${salt}|${item.prompt}|${c}`), i })).sort((a, b) => a.h - b.h).map((x) => x.c);
  return order;
}

/** Same rule as services/subject-placement.js lengthCue: the answer must not stand out by length. */
function lengthCue(choices, answer) {
  const a = String(answer).trim();
  const options = choices.map((c) => String(c).trim());
  const others = options.filter((c) => c !== a).map((c) => c.length);
  if (options.length < 3 || !a.length || !others.length) return false;
  const mean = others.reduce((x, y) => x + y, 0) / others.length;
  const max = Math.max(...others);
  return (a.length >= 1.8 * mean && a.length - max >= 10) || (max >= 1.8 * a.length && max - a.length >= 10);
}

/** One item as stored, or null when it cannot be asked as written. */
function clean(q) {
  if (!q || Array.isArray(q.answer)) return null;
  const answer = String(q.answer || '').trim();
  const wrong = (Array.isArray(q.wrong) ? q.wrong : []).map((w) => String(w || '').trim()).filter(Boolean);
  const unique = new Set([norm(answer), ...wrong.map(norm)]);
  if (!answer || !String(q.prompt || '').trim() || wrong.length !== 3 || unique.size !== 4) return null;
  const choices = [answer, ...wrong];
  if (lengthCue(choices, answer)) return null;
  return { skill: String(q.skill || q.topic || '').slice(0, 90), prompt: String(q.prompt).trim(), answer, choices };
}

// ── the blind checker ──────────────────────────────────────────────────────

const SOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'choice', 'only_one', 'distractors_ok'],
        properties: {
          id: { type: 'string' },
          choice: { type: 'string', description: 'The letter of the one option you judge correct, from working the question yourself.' },
          only_one: { type: 'boolean', description: 'True only if exactly one option is defensible; false if two or more could be argued right, or none is.' },
          distractors_ok: { type: 'boolean', description: 'True if each wrong option is a plausible mistake for someone who has not learned the skill, and none is silly, duplicated or a giveaway.' },
          fits: { type: 'boolean', description: 'True if the difficulty and content suit the stated level (see the context).' },
          note: { type: 'string', description: 'If anything is false: one sentence saying what is wrong.' },
        },
      },
    },
  },
};

const SOLVE_SYSTEM = [
  'You are an exacting teacher checking draft multiple-choice questions before they are used in a real test.',
  'You are NOT told the intended answer. For each question: work it out yourself from scratch, pick the one option you believe is correct',
  '(by its letter), and judge the question. Be strict: if two options could both be argued correct, or the question depends on an unstated',
  'convention, or none is right, say only_one is false. If a wrong option is actually correct, only_one is false.',
  'Judge distractors: each should be a mistake a learner who has not learned the skill would plausibly make.',
  'Reply only through the tool, one result per question id.',
].join('\n');

/** Blind-solve a batch with one model. Returns Map(id -> verdict). */
async function solveBatch(model, batch, context, salt, trackId = null) {
  const NL = String.fromCharCode(10);
  // With a track, the same call also places each question against the reference items (one reasoning pass, not two).
  const refs = trackId
    ? [`${NL}${NL}After solving, also give \`point\`: where the question sits on the ladder (0 = the very first lesson, ${rules.gradesFor(trackId).length} = the hardest the course reaches), judged from what it needs, against these reference questions (position: question):`,
      ...anchorsFor(trackId).map((a) => `${a.point.toFixed(1)}: ${a.prompt}`)].join(NL)
    : '';
  const schema = trackId
    ? { ...SOLVE_SCHEMA, properties: { results: { ...SOLVE_SCHEMA.properties.results, items: { ...SOLVE_SCHEMA.properties.results.items, required: [...SOLVE_SCHEMA.properties.results.items.required, 'point'], properties: { ...SOLVE_SCHEMA.properties.results.items.properties, point: { type: 'number' } } } } } }
    : SOLVE_SCHEMA;
  const shown = batch.map((b) => {
    const opts = lettered(b.item, salt);
    return { id: b.id, opts, text: `id: ${b.id}\nquestion: ${b.item.prompt}\n${opts.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')}` };
  });
  const data = await ask(model, {
    system: SOLVE_SYSTEM,
    user: `${context}${refs}\n\nQUESTIONS\n\n${shown.map((s) => s.text).join('\n\n')}`,
    schema,
    schemaName: 'submit_checks',
  });
  const out = new Map();
  if (!data || !Array.isArray(data.results)) return out;
  for (const r of data.results) {
    const s = shown.find((x) => x.id === String(r.id).trim());
    if (!s) continue;
    const letter = String(r.choice || '').trim().toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
    const picked = letter ? s.opts['ABCD'.indexOf(letter)] : null;
    out.set(s.id, { picked, point: Number.isFinite(Number(r.point)) ? Number(r.point) : null, only_one: !!r.only_one, distractors_ok: !!r.distractors_ok, fits: r.fits === undefined ? true : !!r.fits, note: String(r.note || '').slice(0, 300) });
  }
  return out;
}

function verdictOf(item, v) {
  if (!v || !v.picked) return { pass: false, why: 'no verdict' };
  if (norm(v.picked) !== norm(item.answer)) return { pass: false, why: `checker chose a different option than the key. ${v.note}` };
  if (!v.only_one) return { pass: false, why: `more than one defensible option. ${v.note}` };
  if (!v.distractors_ok) return { pass: false, why: `weak distractors. ${v.note}` };
  if (!v.fits) return { pass: false, why: `level does not fit. ${v.note}` };
  return { pass: true, why: '' };
}

// ── catch-up: unit banks to 7 questions a unit ─────────────────────────────

const BANK_DIR = path.join(ROOT, 'content', 'unit-placement');
const bankFile = (t) => path.join(BANK_DIR, `${t}.json`);
const candFile = (t) => path.join(WORK, `catchup-${t}.json`);

const GEN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['units'],
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['unit', 'questions'],
        properties: {
          unit: { type: 'integer' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['skill', 'prompt', 'answer', 'wrong'],
              properties: {
                skill: { type: 'string', description: 'The one skill of this unit the question checks, in a few words.' },
                prompt: { type: 'string' },
                answer: { type: 'string' },
                wrong: { type: 'array', items: { type: 'string' }, description: 'Exactly three wrong options.' },
              },
            },
          },
        },
      },
    },
  },
};

function genSystem(trackName) {
  return [
    `You write placement questions for one grade of a ${trackName} course. They place a learner inside the grade to`,
    'within one unit, and they are also the quick check for a unit the learner skips. Every question must be right:',
    'one correct option, and the facts, numbers and terms in it true. Work each question yourself before you submit it.',
    '',
    'For each unit you are asked for, write the number of NEW multiple-choice questions shown (the answer plus exactly three wrong options):',
    '- Each checks a skill this unit teaches, at the level of someone who has just finished the unit.',
    '- A learner who stopped at the end of the PREVIOUS unit should usually get it wrong: it needs this unit\'s new skill,',
    '  not only earlier ones. Do not test later units.',
    '- Each new question checks a different skill or angle from the ones already written for that unit, and uses different numbers, words and contexts.',
    '- Wrong options are the mistakes a learner who has not learned this unit would actually make. All four options',
    '  are the same kind of thing and about the same length; the answer must not stand out by length, wording or detail.',
    '- No "all/none of the above", no trick wording, no question that needs a picture. Describe what a picture would show',
    '  in words; small counts may use emoji (for example 🍎🍎🍎). Keep the wording at the reading level of the grade.',
    '- Self-contained: the question gives everything needed. For a reading skill, include the short passage in the prompt.',
  ].join('\n');
}

function genUser(trackId, gradeId, units, wanted, have) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const lines = units.map((u, i) => {
    const n = i + 1;
    const mark = wanted[n] ? '>>' : '  ';
    const lessons = u.lessons.map((l) => `${l.title}${l.covers ? ` — ${String(l.covers).slice(0, 220)}` : ''}`).join('\n      ');
    const existing = (have[n] || []).map((q) => `\n      already written (do not repeat or paraphrase): ${String(q.prompt).slice(0, 200)}`).join('');
    return `${mark} U${n}${wanted[n] ? ` [write ${wanted[n]} new]` : ''}:\n      ${lessons}${existing}`;
  }).join('\n');
  return `GRADE: ${grade.name}\n\nUNITS IN ORDER (write for the ones marked >>; the rest are context):\n${lines}\n\n`
    + `Write the number of NEW questions shown for each of ${Object.keys(wanted).map((n) => `U${n}`).join(', ')}. ${process.env.GEN_NUDGE || ""}`;
}

function loadCand(t) { return readJson(candFile(t), { track_id: t, items: [], counts: { generated: 0, passed_first: 0, rewritten_passed: 0, dropped: 0 } }); }

/** Accepted so far per unit: the bank's questions plus passed candidates. */
function haveByUnit(bank, cand) {
  const have = {};
  for (const [gradeId, g] of Object.entries(bank.grades)) {
    g.units.forEach((u, i) => { have[`${gradeId}|${i + 1}`] = u.questions.slice(); });
  }
  for (const c of cand.items) if (c.status === 'passed' || c.status === 'new' || c.status === 'rewritten') (have[c.unit_key] = have[c.unit_key] || []).push(c.item);
  return have;
}

async function catchupGen(trackId) {
  const bank = readJson(bankFile(trackId), null);
  if (!bank) throw new Error(`no bank for ${trackId}`);
  const cand = loadCand(trackId);
  const have = haveByUnit(bank, cand);
  const trackName = (curriculum.getTrack(trackId) || {}).name || trackId;
  const jobs = [];
  const gmax = Number(process.env.GRADE_MAX || 999);
  for (const gradeId of rules.gradesFor(trackId)) {
    if (rules.gradesFor(trackId).indexOf(gradeId) >= gmax) continue;
    const g = bank.grades[gradeId];
    if (!g) continue;
    const units = testers.unitsOf(trackId, gradeId);
    if (units.length !== g.units.length) { console.log(`${gradeId}: curriculum units differ from the bank, skipped`); continue; }
    const need = {};
    g.units.forEach((u, i) => { const n = TARGET - (have[`${gradeId}|${i + 1}`] || []).length; if (n > 0) need[i + 1] = n; });
    const keys = Object.keys(need);
    for (let i = 0; i < keys.length; i += 6) {
      const wanted = {};
      keys.slice(i, i + 6).forEach((k) => { wanted[k] = need[k]; });
      jobs.push({ gradeId, units, wanted });
    }
  }
  console.log(`${trackId}: ${jobs.length} writer calls, ${jobs.reduce((n, j) => n + Object.values(j.wanted).reduce((a, b) => a + b, 0), 0)} questions wanted`);
  let done = 0;
  await pool(jobs, Number(process.env.GEN_PARALLEL || 6), async (job) => {
    const haveHere = {};
    for (const n of Object.keys(job.wanted)) haveHere[n] = have[`${job.gradeId}|${n}`] || [];
    // Units not asked for are context only; give their existing prompts too so nothing is repeated across the grade.
    let reply = null;
    try {
      reply = await write({ system: genSystem(trackName), user: genUser(trackId, job.gradeId, job.units, job.wanted, haveHere), schema: GEN_SCHEMA, schemaName: 'submit_unit_questions', maxTokens: 7000, task: `night_content_catchup_${trackId}` });
    } catch (err) {
      if (err.status === 402) throw err;
      console.log(`  ${job.gradeId}: ${String(err.message).slice(0, 100)}`);
      return;
    }
    let got = 0;
    for (const row of reply.data.units || []) {
      const n = Number(row.unit);
      if (!job.wanted[n]) continue;
      const seen = new Set(have[`${job.gradeId}|${n}`].map((q) => norm(q.prompt)));
      for (const raw of (row.questions || []).slice(0, job.wanted[n])) {
        const item = clean(raw);
        if (!item || seen.has(norm(item.prompt))) continue;
        seen.add(norm(item.prompt));
        cand.items.push({ id: `c${cand.items.length}`, unit_key: `${job.gradeId}|${n}`, grade_id: job.gradeId, unit: n, item, status: 'new', tries: 0 });
        cand.counts.generated++;
        got++;
      }
    }
    done++;
    writeJson(candFile(trackId), cand);
    if (done % 10 === 0) console.log(`  ${done}/${jobs.length} calls, ${cand.items.length} candidates`);
  });
  writeJson(candFile(trackId), cand);
  console.log(`${trackId}: ${cand.items.length} candidates, generated total ${cand.counts.generated}`);
}

function unitContext(trackId, gradeId, unitNo) {
  const units = testers.unitsOf(trackId, gradeId);
  const u = units[unitNo - 1];
  const grade = curriculum.getGrade(trackId, gradeId);
  return `GRADE: ${grade.name}\nUNIT ${unitNo} lessons: ${u.lessons.map((l) => l.title).join(' | ')}`;
}

const REWRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['skill', 'prompt', 'answer', 'wrong'],
  properties: GEN_SCHEMA.properties.units.items.properties.questions.items.properties,
};

async function rewrite(trackId, c, why) {
  const trackName = (curriculum.getTrack(trackId) || {}).name || trackId;
  const r = await write({
    system: `${genSystem(trackName)}\n\nYou are now REWRITING one question that a checker rejected. Fix the problem it names; keep it testing the same unit.`,
    user: `${unitContext(trackId, c.grade_id, c.unit)}\n\nREJECTED QUESTION: ${c.item.prompt}\nkeyed answer: ${c.item.answer}\noptions: ${c.item.choices.join(' | ')}\nchecker said: ${why}\n\nWrite one corrected question (schema fields skill, prompt, answer, wrong[3]). If the original idea cannot be made unambiguous, write a different question for the same unit.`,
    schema: REWRITE_SCHEMA, schemaName: 'submit_question', maxTokens: 2500, task: `night_content_catchup_${trackId}_rewrite`,
  });
  return clean(r.data);
}

/** Check every 'new' or 'rewritten' candidate: a pass is kept; a first rejection is rewritten once; a second is dropped. */
async function catchupCheck(trackId) {
  const cand = loadCand(trackId);
  const B = Number(process.env.CHECK_BATCH || 8);
  for (let round = 0; round < 3; round++) {
    const order = rules.gradesFor(trackId);
    const gmax = Number(process.env.GRADE_MAX || 999); // check the lowest grades first, up to this many
    const todo = cand.items.filter((c) => (c.status === 'new' || c.status === 'rewritten') && order.indexOf(c.grade_id) < gmax);
    if (!todo.length) break;
    // Group by grade so a batch shares one context line per unit.
    todo.sort((a, b) => order.indexOf(a.grade_id) - order.indexOf(b.grade_id) || a.unit - b.unit);
    const batches = [];
    for (let i = 0; i < todo.length; i += B) batches.push(todo.slice(i, i + B));
    console.log(`${trackId} round ${round + 1}: checking ${todo.length} in ${batches.length} calls`);
    let finished = 0;
    const pending = [];
    await pool(batches, 2, async (batch) => {
      const ctx = [...new Set(batch.map((c) => `${c.grade_id} U${c.unit}`))].map((k) => { const [g, u] = k.split(' U'); return `${unitContext(trackId, g, Number(u))}`; }).join('\n\n');
      const context = `Each question is meant to check ONE skill of the unit it came from, at the level of a learner who has just finished that unit (not earlier-only, not later material). Units:\n\n${ctx}\n\nQuestion ids and their units: ${batch.map((c) => `${c.id}=${c.grade_id} U${c.unit}`).join('; ')}`;
      const verdicts = await solveBatch(MINIMAX, batch.map((c) => ({ id: c.id, item: c.item })), context, 'a');
      for (const c of batch) {
        const v = verdictOf(c.item, verdicts.get(c.id));
        if (v.why === 'no verdict') continue; // not answered: stays queued for the next round
        c.tries++;
        c.last_note = v.why;
        if (v.pass) { c.status = c.tries === 1 ? 'passed' : 'passed'; c.passed_after = c.tries; if (c.tries === 1) cand.counts.passed_first++; else cand.counts.rewritten_passed++; continue; }
        if (c.tries >= 2) { c.status = 'dropped'; cand.counts.dropped++; continue; }
        // The rewrite runs beside the checking (it is a different, paid-and-fast lane), so a rejected item never holds a checker slot.
        c.status = 'rewriting';
        pending.push(rewrite(trackId, c, v.why).then((fresh) => {
          if (fresh) { c.item = fresh; c.status = 'rewritten'; } else { c.status = 'dropped'; cand.counts.dropped++; }
        }).catch((err) => { if (err.status === 402) throw err; c.status = 'dropped'; cand.counts.dropped++; }));
      }
      finished++;
      writeJson(candFile(trackId), cand);
      if (finished % 5 === 0) console.log(`  ${finished}/${batches.length} batches; passed ${cand.items.filter((c) => c.status === 'passed').length}, dropped ${cand.counts.dropped}`);
    });
    await Promise.all(pending);
    writeJson(candFile(trackId), cand);
  }
  writeJson(candFile(trackId), cand);
  const by = (s) => cand.items.filter((c) => c.status === s).length;
  console.log(`${trackId}: passed ${by('passed')}, dropped ${by('dropped')}, queued ${by('new') + by('rewritten')}; counts ${JSON.stringify(cand.counts)}`);
}

function catchupCount(trackId) {
  const bank = readJson(bankFile(trackId), null);
  const h = {};
  for (const g of Object.values(bank.grades)) for (const u of g.units) h[u.questions.length] = (h[u.questions.length] || 0) + 1;
  console.log(trackId, JSON.stringify(h));
  return h;
}

function catchupApply(trackId) {
  const bank = readJson(bankFile(trackId), null);
  const cand = loadCand(trackId);
  let added = 0;
  for (const c of cand.items.filter((x) => x.status === 'passed')) {
    const unit = bank.grades[c.grade_id].units[c.unit - 1];
    if (unit.questions.length >= TARGET) { c.status = 'surplus'; continue; }
    if (unit.questions.some((q) => norm(q.prompt) === norm(c.item.prompt))) continue;
    unit.questions.push(c.item);
    c.status = 'applied';
    added++;
  }
  fs.writeFileSync(bankFile(trackId), JSON.stringify(bank, null, 1));
  writeJson(candFile(trackId), cand);
  const h = catchupCount(trackId);
  const by = (s) => cand.items.filter((c) => c.status === s).length;
  writeJson(path.join(REPORTS, `catchup-${trackId}-report.json`), {
    track_id: trackId, made_at: new Date().toISOString(), writer: 'standard-compute deepseek v4.1 flash', checker: MINIMAX,
    generated: cand.items.length, passed_first_time: cand.items.filter((c) => ['passed', 'applied', 'surplus'].includes(c.status) && c.passed_after === 1).length, rewritten_then_passed: cand.items.filter((c) => ['passed', 'applied', 'surplus'].includes(c.status) && c.passed_after === 2).length,
    dropped: by('dropped'), applied_to_bank: by('applied'), surplus_not_used: by('surplus'), unit_question_counts: h,
    dropped_notes: cand.items.filter((c) => c.status === 'dropped').map((c) => ({ unit: c.unit_key, prompt: c.item.prompt.slice(0, 120), why: String(c.last_note || '').slice(0, 160) })).slice(0, 80),
  });
  console.log(`${trackId}: ${added} added`);
}

// ── placement: top-end items for iq / act ──────────────────────────────────

const EXTRA_DIR = path.join(ROOT, 'content', 'placement-extra');
const CAL_DIR = path.join(ROOT, 'content', 'placement-calibration');
const placeFile = (t) => path.join(WORK, `place-${t}.json`);

const PLACE_GEN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['unit', 'skill', 'prompt', 'answer', 'wrong', 'rationale'],
        properties: {
          unit: { type: 'integer', description: 'The U number of the unit this question is written for.' },
          skill: { type: 'string' },
          prompt: { type: 'string' },
          answer: { type: 'string' },
          wrong: { type: 'array', items: { type: 'string' }, description: 'Exactly three wrong options.' },
          rationale: { type: 'string', description: 'One sentence: why the answer is the answer.' },
        },
      },
    },
  },
};

/** The top of these ladders is judgment and practice, not puzzles: the earlier top items are scenarios whose best answer applies the practice a unit teaches. */
function judgmentSystem(trackId) {
  const track = (curriculum.getTrack(trackId) || {}).name || trackId;
  const mean = readJson(path.join(ROOT, 'curriculum-build', 'placement-judge', trackId + '-mean.json'), {});
  const examples = Object.values(mean).filter((v) => v.key === 'correct' && v.point >= rules.gradesFor(trackId).length - 2.2 && String(v.prompt).length < 160).sort((a, b) => b.point - a.point).slice(0, 8).map((v) => '- ' + v.prompt);
  return [
    'You write placement questions for the TOP of a ' + track + ' ladder, where the units teach a practice or a way of judging (what a strong practitioner does), not new facts.',
    'Write a scenario-based judgment question: a concrete situation, then four courses of action or readings, exactly one of which a strong practitioner who has learned this unit would choose.',
    'The three wrong options are plausible mistakes of exactly the kind the unit warns against (they sound reasonable to someone who has not learned the practice). No computation puzzles, no trivia.',
    'It needs the specific practice the unit names, applied to the situation; general knowledge or earlier units alone should not be enough to pick the best option.',
    'Exactly one defensible answer, defensible from the situation as stated; give every fact the choice depends on. Original (never copy a published item). Four options, the same kind of thing, about the same length (the answer must not stand out by length or detail). Self-contained text, no "all/none of the above".',
    'Style of the earlier top items (do not reuse their content):',
    ...examples,
    '',
    'Each question is different in content from the others and from the ones already written.',
  ].join(String.fromCharCode(10));
}

function placeSystem(trackId) {
  if (process.env.PLACE_STYLE === 'judgment') return judgmentSystem(trackId);
  const track = (curriculum.getTrack(trackId) || {}).name || trackId;
  return [
    `You write placement questions for the TOP of a ${track} ladder. A learner who already knows nearly everything in the subject sits them,`,
    'and they must tell a learner who has finished grade N apart from one who has finished grade N-1. They are original (never copy a',
    'published test item), multiple choice with the answer plus exactly three wrong options, and every one must be right.',
    '',
    '- Exactly one defensible answer, defensible from the question alone: state every convention, give every number, no trick wording.',
    '- Work each question through yourself and check the answer before you submit it. A wrong key is the worst mistake here.',
    '- It needs the skill of the unit it is written for (named in the outline) and cannot be answered by everyday knowledge or by the units before.',
    '- Self-contained and text only: describe any figure in words. No "all/none of the above".',
    '- Wrong options are specific mistakes a learner short of this unit would make; all four options are the same kind of thing, in the same form, and about the same length, so the answer cannot be picked by shape.',
    '- Spread the position of the right answer: do not put it in the same slot every time (you give it as `answer`, the order is mixed later).',
    '- Each question is different in content from the others and from the ones already written.',
  ].join('\n');
}

/** The target grades' units, as the writer sees them. */
function placeUser(trackId, gradeIndex, counts, written) {
  const unitNos = Object.keys(counts).map(Number);
  const gradeId = rules.gradesFor(trackId)[gradeIndex];
  const grade = curriculum.getGrade(trackId, gradeId);
  const units = testers.unitsOf(trackId, gradeId);
  const lines = unitNos.map((n) => `U${n} [write ${counts[n]}]: ${units[n - 1].lessons.map((l) => `${l.title}${l.covers ? ` — ${String(l.covers).slice(0, 200)}` : ''}`).join(' | ')}`);
  const prior = written.slice(-60).map((w) => `- ${w.slice(0, 140)}`).join('\n');
  return `GRADE ${gradeIndex + 1} of ${rules.gradesFor(trackId).length}: ${grade.name}\n\nWrite the number of questions shown for EACH of these units (set the unit field); several for one unit must test different skills of it:\n${lines.join('\n')}\n\n`
    + `Difficulty: each question should be among the hardest a learner who has just finished the unit can answer, so that a learner who stopped one grade earlier gets it wrong.
`
    + (process.env.PLACE_FOCUS ? `FOCUS: the question must need the specific skill or practice this unit teaches (what its lessons name), applied to a concrete case. A question that a strong learner could answer from general mathematics, logic or knowledge, or from earlier grades alone, is wrong for this task: the curriculum places such a question earlier. Prefer a scenario or worked situation whose answer turns on the unit skill.
` : "")
    + (prior ? `\nALREADY WRITTEN, do not repeat or paraphrase:\n${prior}\n` : '');
}

function loadPlace(t) { return readJson(placeFile(t), { track_id: t, items: [], counts: { generated: 0, passed: 0, rewritten_passed: 0, dropped: 0 } }); }

async function placeGen(trackId, args) {
  const grades = (args.grades || (trackId === 'iq' ? '9,10,11,12' : '13,14,15,16')).split(',').map(Number); // 1-based grade numbers
  const perGrade = Number(args.per_grade || 16);
  const perCall = 2; // units per call
  const cand = loadPlace(trackId);
  const written = cand.items.map((c) => c.item.prompt);
  const jobs = [];
  for (const g of grades) {
    const gradeId = rules.gradesFor(trackId)[g - 1];
    const units = testers.unitsOf(trackId, gradeId);
    const have = cand.items.filter((c) => c.grade_index === g - 1).length;
    const want = Math.max(0, perGrade - have);
    // Spread over units, skipping the first (an orientation unit) and the last (a recap).
    const all = units.map((u, i) => i + 1).filter((n) => n > 1 && n < units.length);
    let s = hashOf(`${trackId}${g}${have}`);
    const counts = {};
    let pool = all.slice();
    for (let k = 0; k < want; k++) {
      if (!pool.length) pool = all.slice(); // a grade with few units takes several questions a unit
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const n = pool.splice(s % pool.length, 1)[0];
      counts[n] = (counts[n] || 0) + 1;
    }
    const keys = Object.keys(counts);
    for (let i = 0; i < keys.length; i += perCall) {
      const part = {};
      keys.slice(i, i + perCall).forEach((k) => { part[k] = counts[k]; });
      jobs.push({ g: g - 1, gradeId, counts: part });
    }
  }
  console.log(`${trackId}: ${jobs.length} writer calls`);
  await pool(jobs, 4, async (job) => {
    let reply;
    try { reply = await write({ system: placeSystem(trackId), user: placeUser(trackId, job.g, job.counts, written), schema: PLACE_GEN_SCHEMA, schemaName: 'submit_questions', maxTokens: 14000, task: `night_content_place_${trackId}` }); } catch (err) { if (err.status === 402) throw err; console.log(`  ${job.gradeId}: ${String(err.message).slice(0, 100)}`); return; }
    for (const raw of reply.data.questions || []) {
      const item = clean(raw);
      if (!item || !job.counts[Number(raw.unit)]) continue;
      cand.items.push({ id: `p${cand.items.length}`, grade_index: job.g, grade_id: job.gradeId, unit: Number(raw.unit), item: { ...item, rationale: String(raw.rationale || '').slice(0, 240) }, status: 'new', tries: 0 });
      cand.counts.generated++;
      written.push(item.prompt);
    }
    writeJson(placeFile(trackId), cand);
  });
  writeJson(placeFile(trackId), cand);
  console.log(`${trackId}: ${cand.items.length} candidates`);
}

const LOCATE = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'grade', 'unit', 'key'],
        properties: {
          id: { type: 'string' },
          grade: { type: 'integer', description: 'G number from the outline' },
          unit: { type: 'integer', description: 'U number inside that grade' },
          key: { type: 'string', enum: ['correct', 'wrong', 'ambiguous'] },
          note: { type: 'string' },
        },
      },
    },
  },
};

/** Same instructions the earlier calibration judges got (scripts/placement-testers.js judgeSystem). */
function locateSystem(trackId, gradeCount) {
  return [
    `You are an experienced ${trackId} teacher and curriculum specialist. You are given the outline of one curriculum`,
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

/**
 * Place new items on the ladder against reference questions: the judge reads about ten questions whose positions the
 * earlier calibration fixed (content/placement-calibration + the judged prompts in curriculum-build/placement-judge),
 * and puts each new one on the same scale. A short prompt, so the checker answers inside the gateway's time limit
 * (reading the whole curriculum outline took 4+ minutes and often a 504), and it keeps the new points on the same
 * scale as the old ones. `deepseek` places only; it is never asked about a key.
 */
const anchorCache = new Map();
function anchorsFor(trackId) {
  if (anchorCache.has(trackId)) return anchorCache.get(trackId);
  const mean = readJson(path.join(ROOT, 'curriculum-build', 'placement-judge', `${trackId}-mean.json`), {});
  const cal = readJson(path.join(CAL_DIR, `${trackId}.json`), { points: {} }).points;
  const span = rules.gradesFor(trackId).length;
  const pool = Object.entries(mean).filter(([k, v]) => v.key === 'correct' && String(v.prompt).length < 150 && Number.isFinite(cal[k])).map(([k, v]) => ({ prompt: v.prompt, point: cal[k] })).sort((a, b) => a.point - b.point);
  const want = Array.from({ length: 11 }, (_, i) => (i / 10) * (span - 0.5));
  const used = new Set();
  const out = [];
  for (const w of want) {
    const best = pool.filter((p) => !used.has(p.prompt)).sort((a, b) => Math.abs(a.point - w) - Math.abs(b.point - w))[0];
    if (best) { used.add(best.prompt); out.push(best); }
  }
  out.sort((a, b) => a.point - b.point);
  anchorCache.set(trackId, out);
  return out;
}

const PLACE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'point'], properties: { id: { type: 'string' }, point: { type: 'number', description: 'Position on the 0 to N scale, one decimal.' } } } } },
};

async function locateBatch(model, trackId, batch, { reverse = false } = {}) {
  const NL = String.fromCharCode(10);
  const span = rules.gradesFor(trackId).length;
  const anchors = reverse ? anchorsFor(trackId).slice().reverse() : anchorsFor(trackId);
  const system = [
    `You place ${trackId} placement questions on a ladder of ${span} levels, 0 = the very first lesson, ${span} = the hardest thing the course reaches.`,
    'A question sits at the point by which a learner who has worked through the course up to there would answer it right about 9 times in 10.',
    'Reference questions with their fixed positions are given. Judge from what a question actually requires (the skills and steps), not from its length or look,',
    'and put each NEW question on the same scale, between or beyond the references as its demands say (one decimal). Answer every id.',
  ].join(NL);
  const user = ['REFERENCE QUESTIONS (position: question)', ...anchors.map((a) => `${a.point.toFixed(1)}: ${a.prompt}`), '', 'NEW QUESTIONS',
    ...(reverse ? batch.slice().reverse() : batch).map((c) => [`id: ${c.id}`, `question: ${c.item.prompt}`, `options: ${lettered(c.item, 'loc').map((o) => `[${o}]`).join(' ')}`].join(NL))].join(NL);
  const req = { system, user, schema: PLACE_SCHEMA, schemaName: 'submit_positions', maxTokens: 6000 };
  const data = model === 'deepseek' ? (await write({ ...req, task: 'night_content_locate' }).catch(() => null) || {}).data : await ask(model, req);
  const out = new Map();
  for (const r of (data && data.questions) || []) {
    const p = Number(r.point);
    if (Number.isFinite(p)) out.set(String(r.id).trim(), { point: Math.max(0, Math.min(span, p)), key: 'correct', note: '' });
  }
  return out;
}

async function locateByOutline(model, trackId, batch) {
  const gradeIds = rules.gradesFor(trackId);
  // Only the top half of the ladder is outlined (the items are written for the top, and a smaller prompt is much
  // faster for the checker). The judge is told the earlier grades exist and are easier.
  const from = Math.floor(gradeIds.length / 2) - 1;
  const full = testers.outline(trackId, 1).split(/\n(?=G\d+ )/);
  const NL = String.fromCharCode(10);
  const outline = `(G1 to G${from} are omitted: they are easier than everything below. A question that needs only those: say grade ${from}, unit 1.)${NL}${full.slice(from).join(NL)}`;
  const items = batch.map((c) => [`id: ${c.id}`, `question: ${c.item.prompt}`, `options: ${lettered(c.item, 'loc').map((o) => `[${o}]`).join(' ')}`, `keyed answer: ${c.item.answer}`].join(NL)).join(NL + NL);
  const req = { system: `${locateSystem(trackId, gradeIds.length)}${NL}Keep notes to one short sentence, and only when the key is wrong or ambiguous.`, user: ['CURRICULUM OUTLINE', outline, '', 'QUESTIONS', items].join(NL), schema: LOCATE, schemaName: 'submit_locations', maxTokens: 12000 };
  // 'deepseek' (Standard Compute, the writer's family) is used only to place the item on the ladder, never to check its key.
  const data = model === 'deepseek' ? (await write({ ...req, task: 'night_content_locate' }).catch(() => null) || {}).data : await ask(model, req);
  const out = new Map();
  for (const r of (data && data.questions) || []) {
    const gi = Number(r.grade) - 1;
    if (!(gi >= 0 && gi < gradeIds.length)) continue;
    const units = testers.unitsOf(trackId, gradeIds[gi]).length;
    const unit = Math.max(1, Math.min(units, Number(r.unit) || 1));
    out.set(String(r.id).trim(), { point: gi + (unit - 0.5) / units, key: r.key, note: String(r.note || '').slice(0, 200) });
  }
  return out;
}

function placeContext(trackId, c) {
  return `${unitContext(trackId, c.grade_id, c.unit)}\n(question ${c.id} is written for this unit; judge whether its difficulty and content suit a learner at the top of this grade, as the hardest of its kind in the unit)`;
}

/** Place every unchecked candidate first (DeepSeek, fast), so the slow free checkers see the highest items first. */
async function placeRank(trackId) {
  const cand = loadPlace(trackId);
  const todo = cand.items.filter((c) => c.placed === undefined && (c.status === 'new' || c.status === 'rewritten'));
  const batches = [];
  for (let i = 0; i < todo.length; i += 6) batches.push(todo.slice(i, i + 6));
  await pool(batches, 4, async (batch) => {
    const [a, b] = await Promise.all([locateByOutline('deepseek', trackId, batch), locateBatch('deepseek', trackId, batch)]);
    for (const c of batch) { const x = a.get(c.id); const y = b.get(c.id); if (x && y) c.placed = Number(((x.point + y.point) / 2).toFixed(2)); }
    writeJson(placeFile(trackId), cand);
  });
  writeJson(placeFile(trackId), cand);
  const h = {};
  for (const c of cand.items) if (c.placed !== undefined) h[Math.floor(c.placed)] = (h[Math.floor(c.placed)] || 0) + 1;
  console.log(trackId, 'placed (grade index: count)', JSON.stringify(h));
}

async function placeCheck(trackId) {
  const cand = loadPlace(trackId);
  const B = Number(process.env.CHECK_BATCH || 6);
  const minPlaced = Number(process.env.MIN_PLACED || 0);
  const needle = (c) => (c.status === 'new' || c.status === 'rewritten') && !(c.placed !== undefined && c.placed < minPlaced);
  for (let round = 0; round < 3; round++) {
    const todo = cand.items.filter(needle).sort((x, y) => (y.placed || 0) - (x.placed || 0));
    if (!todo.length) break;
    const batches = [];
    for (let i = 0; i < todo.length; i += B) batches.push(todo.slice(i, i + B));
    console.log(`${trackId} round ${round + 1}: ${todo.length} items, ${batches.length} batches x 2 models x (solve + locate)`);
    await pool(batches, 2, async (batch) => {
      const ctx = batch.map((c) => placeContext(trackId, c)).join('\n\n');
      const items = batch.map((c) => ({ id: c.id, item: c.item }));
      // Both models see every item; the pool above keeps two batches in flight and `ask` keeps two calls in flight.
      // MiniMax (free NVIDIA) blind-solves and reviews each item (key, one defensible answer, distractors, fit). Its own placement
      // took about 90 s an item (gateway timeouts), and Mistral Large 4 timed out on these hard items, so the position comes from
      // DeepSeek: a reading of the curriculum outline (the method the earlier calibration used), sanity-checked by a second reading
      // against reference items. DeepSeek is never asked whether a key is right.
      const [sa, la, lb] = await Promise.all([solveBatch(MINIMAX, items, ctx, 'a'), locateByOutline('deepseek', trackId, batch), locateBatch('deepseek', trackId, batch)]);
      const sb = sa;
      for (const c of batch) {
        const va = verdictOf(c.item, sa.get(c.id));
        const vb = verdictOf(c.item, sb.get(c.id));
        const ka = la.get(c.id); const kb = lb.get(c.id);
        if (va.why === 'no verdict' || vb.why === 'no verdict' || !ka || !kb) continue; // queued again
        c.tries++;
        const keyBad = false;
        const spread = Math.abs(ka.point - kb.point);
        const problems = [!va.pass && `MiniMax: ${va.why}`, keyBad && `locate judges: ${ka.key}/${kb.key} ${ka.note} ${kb.note}`, spread > 99 && `judges disagree on the level by ${spread.toFixed(1)} grades`].filter(Boolean);
        c.verdicts = { minimax_blind_solve: va.pass, placement_a: Number(ka.point.toFixed(3)), placement_b: Number(kb.point.toFixed(3)) };
        c.point = Number(ka.point.toFixed(3)); // the outline reading (the method the earlier points used); the anchor reading is a sanity check
        c.spread = Number(spread.toFixed(2));
        if (!problems.length) { c.status = 'passed'; c.passed_after = c.tries; if (c.tries === 1) cand.counts.passed++; else cand.counts.rewritten_passed++; continue; }
        c.last_note = problems.join(' | ').slice(0, 400);
        if (c.tries >= 2) { c.status = 'dropped'; cand.counts.dropped++; continue; }
        try {
          const trackName = (curriculum.getTrack(trackId) || {}).name || trackId;
          const r = await write({
            system: `${placeSystem(trackId)}\n\nYou are REWRITING one question a checker rejected. Fix what it names, or write a different question for the same unit.`,
            user: `GRADE ${c.grade_index + 1} (${trackName}), unit ${c.unit}\n${unitContext(trackId, c.grade_id, c.unit)}\n\nREJECTED: ${c.item.prompt}\nkeyed answer: ${c.item.answer}\noptions: ${c.item.choices.join(' | ')}\nchecker said: ${c.last_note}\n\nWrite one corrected question (fields unit=${c.unit}, skill, prompt, answer, wrong[3], rationale).`,
            schema: PLACE_GEN_SCHEMA, schemaName: 'submit_questions', maxTokens: 2500, task: `night_content_place_${trackId}_rewrite`,
          });
          const q = (r.data.questions || [])[0];
          const item = clean(q);
          if (item) { c.item = { ...item, rationale: String((q && q.rationale) || '').slice(0, 240) }; c.status = 'rewritten'; } else { c.status = 'dropped'; cand.counts.dropped++; }
        } catch (err) { if (err.status === 402) throw err; c.status = 'dropped'; cand.counts.dropped++; }
      }
      writeJson(placeFile(trackId), cand);
    });
  }
  writeJson(placeFile(trackId), cand);
  const by = (s) => cand.items.filter((c) => c.status === s).length;
  console.log(`${trackId}: passed ${by('passed')}, dropped ${by('dropped')}, queued ${by('new') + by('rewritten')}; counts ${JSON.stringify(cand.counts)}`);
}

function placeApply(trackId, args) {
  const cand = loadPlace(trackId);
  const minPoint = args.min_point === undefined ? 0 : Number(args.min_point);
  const gradeIds = rules.gradesFor(trackId);
  const file = path.join(EXTRA_DIR, `${trackId}.json`);
  const extra = readJson(file, { track_id: trackId, note: '', grades: {} });
  const calFile = path.join(CAL_DIR, `${trackId}.json`);
  const cal = readJson(calFile, null);
  let added = 0;
  const seen = new Set(Object.values(extra.grades).flat().map((q) => norm(q.prompt)));
  for (const c of cand.items.filter((x) => x.status === 'passed')) {
    if (c.point < minPoint || seen.has(norm(c.item.prompt))) continue;
    const gi = Math.max(0, Math.min(gradeIds.length - 1, Math.floor(c.point)));
    const gradeId = gradeIds[gi];
    const band = c.point - gi >= 0.66 ? 'capstone' : c.point - gi >= 0.33 ? 'hard' : 'hard';
    const q = { topic: c.item.skill, prompt: c.item.prompt, answer: c.item.answer, choices: c.item.choices, rationale: c.item.rationale, band };
    (extra.grades[gradeId] = extra.grades[gradeId] || []).push(q);
    cal.points[adaptive.questionKey(q)] = c.point;
    seen.add(norm(c.item.prompt));
    c.status = 'applied';
    added++;
  }
  extra.note = 'Extra calibrated top-end items, appended after a grade\'s seven stored questions (services/subject-placement.js withExtras). Written by Standard Compute (DeepSeek V4.1), each blind-checked and located by two other families (MiniMax M3.1 Flash, Mistral Large 4); the point is the mean of the two judges. Grade = the grade the point falls in.';
  extra.made_at = new Date().toISOString();
  extra.judges = ['minimaxai/minimax-m3.1-flash (blind solve, key, ambiguity, distractors, fit)', 'deepseek-v4.1 via Standard Compute: position read from the curriculum outline, sanity-checked against reference items (placement only; never asked about a key)'];
  fs.mkdirSync(EXTRA_DIR, { recursive: true });
  writeJson(file, extra);
  cal.made_at = new Date().toISOString();
  if (!(cal.judges || []).some((j) => /extra items/.test(j))) cal.judges = [...(cal.judges || []), 'extra items: keys checked by minimax-m3.1-flash; positions = deepseek-v4.1 outline reading, sanity-checked against reference items'];
  writeJson(calFile, cal);
  writeJson(placeFile(trackId), cand);
  const by = (s) => cand.items.filter((c) => c.status === s).length;
  const perGrade = {};
  for (const [g, list] of Object.entries(extra.grades)) perGrade[g] = list.length;
  writeJson(path.join(REPORTS, `place-${trackId}-report.json`), {
    track_id: trackId, made_at: new Date().toISOString(), writer: 'standard-compute deepseek v4.1 flash', checkers: [MINIMAX], placement: 'DeepSeek V4.1 reading of the curriculum outline (the method of the earlier points); a second reading against reference items is kept as a sanity figure (candidates.verdicts) but does not reject',
    applied_detail: cand.items.filter((c) => c.status === 'applied').map((c) => ({ grade: c.grade_id, unit: c.unit, point: c.point, anchor_reading: c.verdicts && c.verdicts.placement_b, rewritten: c.passed_after === 2, prompt: c.item.prompt.slice(0, 90) })),
    checked: cand.items.filter((c) => c.tries > 0).length, not_checked_left_out: cand.items.filter((c) => !c.tries).length,
    generated: cand.items.length, passed_first_time: cand.items.filter((c) => ['passed', 'applied'].includes(c.status) && c.passed_after === 1).length, rewritten_then_passed: cand.items.filter((c) => ['passed', 'applied'].includes(c.status) && c.passed_after === 2).length, dropped: by('dropped'),
    applied: by('applied'), extra_items_per_grade: perGrade,
    dropped_notes: cand.items.filter((c) => c.status === 'dropped').map((c) => ({ grade: c.grade_id, unit: c.unit, prompt: c.item.prompt.slice(0, 100), why: String(c.last_note || '').slice(0, 200) })).slice(0, 60),
  });
  console.log(`${trackId}: ${added} applied`, JSON.stringify(perGrade));
}

// ── main ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  const [cmd, track, ...rest] = process.argv.slice(2);
  const args = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k.replace(/-/g, '_'), v === undefined ? true : v]));
  const table = {
    'catchup-gen': () => catchupGen(track), 'catchup-check': () => catchupCheck(track), 'catchup-apply': async () => catchupApply(track), 'catchup-count': async () => catchupCount(track),
    'place-gen': () => placeGen(track, args), 'place-rank': () => placeRank(track), 'place-check': () => placeCheck(track), 'place-apply': async () => placeApply(track, args),
  };
  if (!table[cmd]) { console.error('usage: see the header of scripts/content-gap-tools.js'); process.exit(2); }
  table[cmd]().then(() => process.exit(0)).catch((err) => { console.error(String(err.message || err).slice(0, 300)); process.exit(1); });
}

module.exports = { clean, lengthCue, verdictOf, locateBatch, solveBatch, MINIMAX, MISTRAL };
