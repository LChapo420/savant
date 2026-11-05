/**
 * Re-gate and re-release English Proficient game levels one at a time (4 Nov 2026: level 24 held, level 23 q24 reworded).
 *
 *   node scripts/english-game-level-fix.js --db <copy of data/db.json> --out DIR --level 24
 *   node scripts/english-game-level-fix.js --db <copy> --out DIR --level 23 --reword q24:"correctly punctuated"
 *
 * Works on the data-file COPY (read only) with content/game-fixes/english-proficient.json already applied (the copy carries the fixes).
 *   1. every question of the level is judged blind (key and explanation withheld) by two families, as scripts/english-game-release-check.js:
 *      A NVIDIA Nemotron Ultra, B Gemini free tier or MiniMax M3.1 Flash (scripts/lib/english-game-judges.js). Picks are cached by the
 *      question's hash in DIR/picks.json (seeded from --seed-picks, the earlier release run's cache, so unchanged questions are not re-asked);
 *   2. a question either judge picks differently from the key is rewritten: writer Coral DeepSeek V4.1 Flash (ledger-capped, pipeline only,
 *      question text only), the same code checks as scripts/english-game-rewrite.js, then both judges must pick the key; up to 3 tries;
 *   3. --reword qid:"phrase": the prompt of that question gets the phrase (e.g. "one correctly punctuated sentence") and only that question is re-judged;
 *   4. the level is released only when ALL its questions are then picked by both judges. The new rewrite entries and the release hash are
 *      merged into content/game-fixes/english-proficient.json (a reworded question is a rewrite whose old_prompt is the stored prompt).
 * Nothing is written to the data file. Exit 0 when the level is released, 1 when it stays held.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
process.env.CORAL_PIPELINE = '1';
const DB = arg('db'); const OUT = arg('out'); const LEVEL = Number(arg('level')); const REWORD = arg('reword');
if (!DB || !OUT || !LEVEL) { console.error('--db --out --level [--reword qid:"phrase"] [--seed-picks file]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const fixes = require('../services/game-fixes');
const ka = require('../services/key-agreement');
const judges = require('./lib/english-game-judges');
const { coral } = require('../services/providers/coral');

const FIX = path.join(__dirname, '..', 'content', 'game-fixes', 'english-proficient.json');
const pickFile = path.join(OUT, 'picks.json');
const picks = fs.existsSync(pickFile) ? JSON.parse(fs.readFileSync(pickFile, 'utf8')) : {};
const seedFile = arg('seed-picks');
const seed = seedFile && fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : {};
const save = () => fs.writeFileSync(pickFile, JSON.stringify(picks));
const hashOf = (q) => fixes.setHash([q]);

async function judgeAll(qs, which) {
  const todo = qs.filter((q) => got(q, which) === undefined);
  const batches = [];
  for (let i = 0; i < todo.length; i += 25) batches.push(todo.slice(i, i + 25));
  let at = 0;
  const worker = async () => {
    while (at < batches.length) {
      const b = batches[at++];
      // eslint-disable-next-line no-await-in-loop
      const p = await judges[which](b);
      b.forEach((q, j) => { picks[hashOf(q)] = { ...(picks[hashOf(q)] || {}), [which]: p[j] === null ? -1 : p[j], ...(which === 'B' && p.by ? { Bby: p.by } : {}) }; });
      save();
    }
  };
  await Promise.all([worker(), worker()]);
}
function seeded(q, which) {
  const k = Object.keys(seed).find((x) => x.endsWith(`:${q.id}:${hashOf(q)}`) && seed[x][which] !== undefined);
  return k ? seed[k][which] : undefined;
}
const got = (q, which) => (picks[hashOf(q)] || {})[which] !== undefined ? picks[hashOf(q)][which] : seeded(q, which);
// Indexes, not ids: a stored level can carry the same id twice (level 24 has two q4 and two q5).
const bad = (qs) => qs.map((q, i) => i).filter((i) => got(qs[i], 'A') !== qs[i].answerIndex || got(qs[i], 'B') !== qs[i].answerIndex);

const SCHEMA = { type: 'object', properties: { prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, correct_index: { type: 'integer' }, explanation: { type: 'string' } }, required: ['prompt', 'choices', 'correct_index', 'explanation'] };
const SYSTEM = 'You write one multiple-choice English question for a school course (grammar, usage, punctuation, vocabulary, reading or writing). '
  + 'Rules: exactly four options, all different, exactly one of them correct and defensible by standard usage; the other three are plausible but clearly wrong. '
  + 'No "all of the above", "none of the above" or "both" options. The question must be answerable from its own text. '
  + 'The explanation is one sentence that says why the correct option is correct and names it by its wording. Keep to the topic and difficulty given.';
const same = (c) => String(c).trim().toLowerCase().replace(/\s+/g, ' ');

function shuffleKey(q, seedN) {
  const idx = q.choices.map((_, i) => i);
  let s = seedN >>> 0 || 1;
  for (let i = idx.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { choices: idx.map((i) => q.choices[i]), answerIndex: idx.indexOf(q.correct_index) };
}

async function rewrite(orig, why, n) {
  for (let t = 0; t < 3; t++) {
    let d = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      d = (await coral.structured({ system: SYSTEM, user: `Replace this question, which cannot stay (${why}). Write a NEW question that tests the same skill at the same difficulty, with a different example.\n\nSkill: ${orig.skill || ''}\nTopic: ${orig.topic || ''}\nDifficulty (1-10): ${orig.difficulty || ''}\nOld question: ${orig.prompt}\nOld options: ${orig.choices.map((c, i) => `(${i}) ${c}`).join(' | ')}\n\nReturn the new question.`, schema: SCHEMA, schemaName: 'submit_question', maxTokens: 2000, timeoutMs: 240000 })).data;
    } catch (e) { if (e.status === 402) throw e; continue; }
    if (!d || !Array.isArray(d.choices) || d.choices.length !== 4 || !Number.isInteger(d.correct_index) || d.correct_index < 0 || d.correct_index > 3) continue;
    if (new Set(d.choices.map(same)).size !== 4 || d.choices.some((c) => /\b(all|none|both|neither) of (the|these)\b|\bboth (a|b|c|d)\b|\ball of the above\b/i.test(c))) continue;
    if (d.prompt.trim().toLowerCase() === orig.prompt.trim().toLowerCase()) continue;
    const sk = shuffleKey(d, (n * 7919 + t) | 0);
    const full = { id: orig.id, prompt: d.prompt.trim(), choices: sk.choices.map((c) => String(c).trim()), answerIndex: sk.answerIndex, explanation: String(d.explanation).trim(), difficulty: orig.difficulty, skill: orig.skill, topic: orig.topic };
    if (ka.keyAgreement(full).flagged) continue;
    // eslint-disable-next-line no-await-in-loop
    const [a, b] = await Promise.all([judges.A([full]), judges.B([full])]);
    picks[hashOf(full)] = { A: a[0] === null ? -1 : a[0], B: b[0] === null ? -1 : b[0], Bby: b.by }; save();
    if (a[0] === full.answerIndex && b[0] === full.answerIndex) return full;
  }
  return null;
}

(async () => {
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const row = db.game_payloads.find((r) => !r.user_id && r.track_id === 'english' && r.grade_id === 'proficient' && r.level === LEVEL);
  const qs = JSON.parse(JSON.stringify(row.payload.questions));
  const fx = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const newRewrites = [];
  if (REWORD) {
    const [qid, ...rest] = REWORD.split(':');
    const phrase = rest.join(':');
    const i = qs.findIndex((q) => q.id === qid);
    const old = qs[i].prompt;
    qs[i] = { ...qs[i], prompt: old.replace(/into one (grammatically correct )?sentence/i, `into one ${phrase} sentence`) };
    if (qs[i].prompt === old) throw new Error('could not place the phrase');
    console.log(`reworded ${qid}:\n  was: ${old}\n  now: ${qs[i].prompt}`);
    newRewrites.push({ level: LEVEL, qid, old_prompt: old, question: qs[i] });
  }
  console.log(`level ${LEVEL} (row ${row.id}), ${qs.length} questions, hash ${fixes.setHash(qs)}`);
  await judgeAll(qs, 'A'); await judgeAll(qs, 'B');
  let disputed = bad(qs);
  console.log(`disputed after judging: ${disputed.map((i) => `#${i} ${qs[i].id}(key ${qs[i].answerIndex}, A ${got(qs[i], 'A')}, B ${got(qs[i], 'B')})`).join(' ') || 'none'}`);
  for (const i of disputed) {
    const q = qs[i];
    // A reworded question that fails is not rewritten twice over: it is reported.
    const orig = qs[i];
    const r = await rewrite(orig, `a blind judge does not pick its key (key ${q.answerIndex}, A ${got(q, 'A')}, B ${got(q, 'B')})`, i + LEVEL);
    if (!r) { console.log(`  ${q.id}: rewrite failed, level stays held`); continue; }
    const prior = newRewrites.findIndex((x) => x.qid === q.id && x.question.prompt === orig.prompt);
    const oldPrompt = prior >= 0 ? newRewrites[prior].old_prompt : orig.prompt;
    if (prior >= 0) newRewrites.splice(prior, 1);
    newRewrites.push({ level: LEVEL, qid: q.id, old_prompt: oldPrompt, question: r });
    qs[i] = r;
    console.log(`  ${q.id}: rewritten and kept by both judges`);
  }
  disputed = bad(qs);
  const ok = !disputed.length;
  const report = { level: LEVEL, row: row.id, released: ok, questions: qs.length, still_disputed: disputed.map((i) => `#${i} ${qs[i].id}`), hash: fixes.setHash(qs), rewrites: newRewrites.map((r) => r.qid), judgeB: [...new Set(qs.map((q) => (picks[hashOf(q)] || {}).Bby).filter(Boolean))] };
  fs.writeFileSync(path.join(OUT, `level-${LEVEL}-report.json`), JSON.stringify(report, null, 1));
  if (ok) {
    // merge: a rewrite of a question that already has one in the fixes replaces it (same qid and level), the old_prompt is the ORIGINAL stored prompt
    for (const r of newRewrites) {
      const k = fx.rewrites.findIndex((w) => w.level === r.level && w.qid === r.qid && (w.question.prompt === r.old_prompt || w.old_prompt === r.old_prompt));
      if (k >= 0) { const prev = fx.rewrites[k]; r.old_prompt = prev.old_prompt; r.also_old = [...new Set([...(prev.also_old || []), prev.question.prompt])]; fx.rewrites[k] = r; } else fx.rewrites.push(r);
    }
    const rel = fx.release.findIndex((x) => x.level === LEVEL);
    if (rel >= 0) fx.release[rel].hash = report.hash; else fx.release.push({ level: LEVEL, hash: report.hash });
    fs.writeFileSync(FIX, `${JSON.stringify(fx, null, 1)}\n`);
  }
  console.log(JSON.stringify(report));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
