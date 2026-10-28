#!/usr/bin/env node
/**
 * The founder's Spanish run: a held-back test, a baseline/final quiz and a
 * no-review retention recheck (curriculum-build/SPANISH-RUN.md has the plan).
 *
 *   node scripts/spanish-run.js pick [--force]            build the ~40 held-back questions
 *   node scripts/spanish-run.js assign <userId>           hold them back from that learner
 *   node scripts/spanish-run.js quiz day0|final           take the held-back test (terminal)
 *   node scripts/spanish-run.js snapshot-day1 <userId>    end of day 1: freeze a sample of what they got right
 *   node scripts/spanish-run.js quiz retention            re-ask that sample, no review in between
 *   node scripts/spanish-run.js leakcheck <userId>        were any held-back questions ever served to them?
 *   node scripts/spanish-run.js report                    the numbers, with the caveats attached
 *
 * Files (all in data/spanish-run/ except holdout.json): items.json holds the
 * questions with their answers; results.json holds every sitting with timestamps.
 * data/db.json is only ever READ here.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
// HOLDOUT_DIR (the same override content/holdout.js honours) lets a dry run use a scratch copy.
const DATA = process.env.HOLDOUT_DIR || path.join(ROOT, 'data');
const DIR = path.join(DATA, 'spanish-run');
const ITEMS = path.join(DIR, 'items.json');
const RESULTS = path.join(DIR, 'results.json');
const HOLDOUT = path.join(DATA, 'holdout.json');
const DB = path.join(ROOT, 'data', 'db.json');

const holdout = require('../content/holdout');

const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fallback; } };
function writeJson(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2));
  fs.renameSync(tmp, f);
}
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const idOf = (prefix, item) => `${prefix}-${sha(holdout.exactKey(item.prompt, item.answer)).slice(0, 8)}`;

// ── the plan: [skill, difficulty, how many], by the grades a beginner reaches ─────
// Band A = Grades 1-2 (Pre-A1/A1.1), B = Grades 3-5 (A1.1-A1.2), C = Grades 6-7 (A1 complete).
// Four days is about 20-30 levels, so A and B are the likely ground; C is the stretch.
const PLAN = [
  ['A', 'es_greetings', 1, 2], ['A', 'es_greetings', 3, 1], ['A', 'es_vocab_core', 3, 3], ['A', 'es_numbers', 1, 2],
  ['A', 'es_gender', 1, 2], ['A', 'es_present_ar', 1, 2], ['A', 'es_questions', 1, 2],
  ['B', 'es_vocab_core', 5, 3], ['B', 'es_numbers', 3, 2], ['B', 'es_present_ar', 3, 2], ['B', 'es_present_erir', 3, 2],
  ['B', 'es_gender', 3, 2], ['B', 'es_adjectives', 3, 2], ['B', 'es_ser_estar', 3, 2], ['B', 'es_questions', 3, 1],
  ['C', 'es_vocab_core', 7, 2], ['C', 'es_numbers', 5, 1], ['C', 'es_present_ar', 5, 2], ['C', 'es_present_erir', 5, 1],
  ['C', 'es_ser_estar', 5, 1], ['C', 'es_adjectives', 5, 1], ['C', 'es_object_pron', 3, 1], ['C', 'es_questions', 5, 1],
];

function pick() {
  const bank = require('../content/bank');
  const items = {};
  const exact = new Set();
  const target = new Set();
  const perShape = new Map();
  for (const [band, skill, d, count] of PLAN) {
    let got = 0;
    for (let i = 0; got < count && i < 400; i++) {
      const it = bank.generate({ skillId: skill, difficulty: d, seed: `spanish-run-heldback:${skill}:${d}:${i}` });
      const ek = holdout.exactKey(it.prompt, it.answer);
      const tk = holdout.targetKey(skill, it.answer);
      const shape = bank.shapeKey(it);
      if (/is not (a Spanish word|something)/i.test(it.prompt)) continue; // answerable by common sense, which would flatter the baseline
      if (exact.has(ek) || (holdout.targetable(skill, it.answer) && target.has(tk))) continue;
      if ((perShape.get(shape) || 0) >= (i < 200 ? 1 : 2)) continue; // spread over shapes, not one idea eight times
      exact.add(ek); target.add(tk); perShape.set(shape, (perShape.get(shape) || 0) + 1);
      const id = idOf('hb', it);
      items[id] = {
        id, set: 'heldback', band, skill_id: skill, difficulty: d, format: it.format, prompt: it.prompt, answer: it.answer,
        ...(it.choices ? { choices: it.choices } : {}), ...(it.accepts ? { accepts: it.accepts } : {}), rationale: it.rationale,
      };
      got += 1;
    }
    if (got < count) console.log(`warning: only ${got}/${count} for ${skill} d${d}`);
  }
  return items;
}

function lib() { return readJson(ITEMS, { items: {} }); }
function results() { return readJson(RESULTS, { sittings: [] }); }
const heldIds = (l) => Object.values(l.items).filter((i) => i.set === 'heldback').map((i) => i.id);

function cmdPick(force) {
  const existing = lib();
  if (heldIds(existing).length && !force) {
    console.log(`Already ${heldIds(existing).length} held-back items in ${ITEMS}. Use --force to rebuild (refused if a sitting exists).`);
    return;
  }
  if (force && results().sittings.length) throw new Error('A sitting is already recorded; rebuilding would make it meaningless.');
  const items = pick();
  const keep = Object.values(existing.items).filter((i) => i.set !== 'heldback');
  const all = {}; for (const i of [...Object.values(items), ...keep]) all[i.id] = i;
  writeJson(ITEMS, { created_at: new Date().toISOString(), items: all });
  const by = {}; for (const i of Object.values(items)) by[`${i.band}:${i.skill_id}`] = (by[`${i.band}:${i.skill_id}`] || 0) + 1;
  console.log(`${Object.keys(items).length} held-back items written to ${ITEMS}`); console.log(by);
}

function cmdAssign(userId) {
  if (!userId) throw new Error('assign needs a user id');
  const l = lib();
  const ids = Object.keys(l.items); // held-back and, later, retention items
  if (!ids.length) throw new Error('Run pick first.');
  const held = readJson(HOLDOUT, {});
  held[String(userId)] = ids;
  writeJson(HOLDOUT, held);
  console.log(`user ${userId}: ${ids.length} questions held back (data/holdout.json). The app reads it within ~2 s; no restart needed once the running server includes content/holdout.js.`);
}

// ── taking a quiz ────────────────────────────────────────────────────────────────
const gradeItem = (item, given) => {
  if (!String(given || '').trim()) return false;
  const g = require('../services/grading').grade(item, given);
  return !!g.correct;
};

// Lines are queued as they arrive, so a typed answer and a piped file behave the same.
function makeAsk(rl) {
  const lines = []; const waiting = []; let closed = false;
  rl.on('line', (l) => { if (waiting.length) waiting.shift()(l); else lines.push(l); });
  rl.on('close', () => { closed = true; while (waiting.length) waiting.shift()(''); });
  return (q) => new Promise((res) => {
    process.stdout.write(q);
    if (lines.length) res(lines.shift()); else if (closed) res(''); else waiting.push(res);
  });
}

async function cmdQuiz(phase, argv) {
  if (!['day0', 'final', 'retention'].includes(phase)) throw new Error('phase must be day0, final or retention');
  const l = lib();
  const r = results();
  let ids;
  if (phase === 'retention') {
    const snap = r.sittings.find((s) => s.phase === 'snapshot-day1');
    if (!snap) throw new Error('No day-1 snapshot. Run snapshot-day1 first.');
    const n = Number((argv.find((a) => a.startsWith('--n=')) || '--n=20').slice(4));
    ids = snap.sample.slice(0, n);
  } else {
    ids = heldIds(l);
    // a fixed order, so day 0 and the final test are the same test
    ids.sort((a, b) => sha(a).localeCompare(sha(b)));
  }
  if (!ids.length) throw new Error('No questions. Run pick first.');
  if (phase !== 'retention' && r.sittings.some((s) => s.phase === phase)) {
    if (!argv.includes('--again')) throw new Error(`The ${phase} test is already recorded. (--again records another; the first stays on file.)`);
  }
  const rl = readline.createInterface({ input: process.stdin });
  const ask = makeAsk(rl);
  console.log(`\nSpanish ${phase} test: ${ids.length} questions. No feedback is given. Press Enter (or type ? ) if you do not know: it counts as wrong.\n`);
  const started = new Date();
  const answers = [];
  let i = 0;
  for (const id of ids) {
    const it = l.items[id];
    i += 1;
    const t0 = Date.now();
    console.log(`${i}/${ids.length}  ${it.prompt}`);
    let given = '';
    if (it.choices) {
      it.choices.forEach((c, k) => console.log(`   ${k + 1}) ${c}`));
      const a = (await ask('   your answer (1-' + it.choices.length + ', Enter = I do not know): ')).trim();
      const k = Number(a);
      given = Number.isInteger(k) && k >= 1 && k <= it.choices.length ? it.choices[k - 1] : '';
    } else {
      given = (await ask('   your answer (Enter = I do not know): ')).trim();
      if (given === '?') given = '';
    }
    answers.push({ id, given, correct: gradeItem(it, given), ms: Date.now() - t0 });
    console.log('');
  }
  rl.close();
  const correct = answers.filter((a) => a.correct).length;
  const chance = ids.reduce((s, id) => s + (l.items[id].choices ? 1 / l.items[id].choices.length : 0), 0);
  r.sittings.push({ phase, started_at: started.toISOString(), finished_at: new Date().toISOString(), n: ids.length, correct, chance_expected: Number(chance.toFixed(1)), answers });
  writeJson(RESULTS, r);
  console.log(`Recorded: ${correct}/${ids.length} (a pure guesser would average about ${chance.toFixed(1)} on the multiple-choice ones). Saved to ${RESULTS}`);
}

// ── retention: freeze what they got right on day 1 ───────────────────────────────
function cmdSnapshot(userId, argv) {
  if (!userId) throw new Error('snapshot-day1 needs a user id');
  const since = (argv.find((a) => a.startsWith('--since=')) || '').slice(8);
  const max = Number((argv.find((a) => a.startsWith('--max=')) || '--max=40').slice(6));
  const r = results();
  if (r.sittings.some((s) => s.phase === 'snapshot-day1')) throw new Error('A day-1 snapshot already exists.');
  const l = lib();
  const db = readJson(DB, { items: [] });
  const held = new Set(heldIds(l).map((id) => holdout.exactKey(l.items[id].prompt, l.items[id].answer)));
  const seen = new Set();
  const rows = [];
  for (const it of db.items) {
    if (String(it.user_id) !== String(userId) || !/^es_/.test(it.skill_id || '') || it.correct !== true) continue;
    if (since && String(it.created_at) < since) continue;
    if (it.format === 'short_answer') continue; // model-graded, not re-askable offline
    if (it.role === 'placement') continue; // right before any teaching is what they already knew, not what they kept
    const k = holdout.exactKey(it.prompt, it.answer);
    if (seen.has(k) || held.has(k)) continue;
    seen.add(k);
    rows.push(it);
  }
  if (!rows.length) throw new Error('No correct Spanish answers found for that user yet.');
  // a seeded shuffle, then the first `max`: no cherry-picking
  rows.sort((a, b) => sha(`ret:${a.id}`).localeCompare(sha(`ret:${b.id}`)));
  const chosen = rows.slice(0, max);
  for (const it of chosen) {
    const id = idOf('rt', it);
    l.items[id] = {
      id, set: 'retention', skill_id: it.skill_id, difficulty: it.difficulty, format: it.format, prompt: it.prompt, answer: it.answer,
      ...(it.choices ? { choices: it.choices } : {}), ...(it.accepts ? { accepts: it.accepts } : {}), rationale: it.rationale,
      answered_correct_at: it.created_at,
    };
  }
  writeJson(ITEMS, l);
  r.sittings.push({ phase: 'snapshot-day1', at: new Date().toISOString(), user_id: userId, available: rows.length, sample: chosen.map((it) => idOf('rt', it)) });
  writeJson(RESULTS, r);
  cmdAssign(userId); // hold these back too, so the app cannot review them in the meantime
  console.log(`${chosen.length} of ${rows.length} correct day-1 answers frozen for the Oct 31 recheck.`);
}

// ── did anything held back reach the learner? ───────────────────────────────────
function cmdLeak(userId) {
  const l = lib();
  const db = readJson(DB, { items: [] });
  const mine = db.items.filter((i) => String(i.user_id) === String(userId));
  // Only items served after the hold was in force can leak; the day-0 test is not in db.items at all.
  const exact = new Map(Object.values(l.items).map((i) => [holdout.exactKey(i.prompt, i.answer), i.id]));
  const hits = mine.filter((i) => exact.has(holdout.exactKey(i.prompt, i.answer)));
  console.log(`user ${userId}: ${mine.length} questions served, ${hits.length} match a held-back/retention question.`);
  for (const h of hits.slice(0, 20)) console.log(`  ${h.created_at} #${h.id} ${exact.get(holdout.exactKey(h.prompt, h.answer))}: ${h.prompt.slice(0, 70)}`);
  if (hits.length) process.exitCode = 1;
}

// ── report ───────────────────────────────────────────────────────────────────────
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96; const p = k / n;
  const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const pc = (x) => `${Math.round(x * 100)}%`;

function cmdReport() {
  const r = results(); const l = lib();
  const last = (p) => [...r.sittings].reverse().find((s) => s.phase === p);
  const line = (label, s) => {
    if (!s) return `${label}: not taken yet`;
    const [lo, hi] = wilson(s.correct, s.n);
    return `${label}: ${s.correct}/${s.n} = ${pc(s.correct / s.n)} (95% interval ${pc(lo)}-${pc(hi)}); chance would give ~${s.chance_expected}/${s.n}. Taken ${s.finished_at || s.at}.`;
  };
  const d0 = last('day0'); const fin = last('final'); const ret = last('retention');
  console.log(line('Day 0 (before)', d0)); console.log(line('Final (Oct 31)', fin));
  if (d0 && fin) {
    console.log(`Change: ${fin.correct - d0.correct >= 0 ? '+' : ''}${fin.correct - d0.correct} questions (${pc(fin.correct / fin.n - d0.correct / d0.n)} points), same ${d0.n} questions.`);
    const was = new Map(d0.answers.map((a) => [a.id, a.correct]));
    const by = {};
    for (const a of fin.answers) {
      const sk = l.items[a.id].skill_id; by[sk] = by[sk] || { before: 0, after: 0, n: 0 };
      by[sk].n += 1; by[sk].before += was.get(a.id) ? 1 : 0; by[sk].after += a.correct ? 1 : 0;
    }
    console.log('By skill (before -> after):'); for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(18)} ${v.before}/${v.n} -> ${v.after}/${v.n}`);
  }
  console.log(line('Retention recheck (items right on day 1, no review)', ret));
  console.log('\nn=1: one learner, my own test, no control group. Say so.');
}

(async () => {
  const [cmd, a1, ...rest] = process.argv.slice(2);
  const argv = [a1, ...rest].filter(Boolean);
  try {
    if (cmd === 'pick') cmdPick(argv.includes('--force'));
    else if (cmd === 'assign') cmdAssign(a1);
    else if (cmd === 'quiz') await cmdQuiz(a1, rest);
    else if (cmd === 'snapshot-day1') cmdSnapshot(a1, rest);
    else if (cmd === 'leakcheck') cmdLeak(a1);
    else if (cmd === 'report') cmdReport();
    else console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
  } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
})();
