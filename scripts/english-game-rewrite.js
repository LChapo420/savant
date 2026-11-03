/**
 * Rewrite the English game questions the 2 Nov re-audit could not re-key (62), with free models, and gate each rewrite.
 *
 *   node scripts/english-game-rewrite.js --db data/db.json --out DIR [--limit N]
 *
 * Reads the worktree copy of the data file (read only). For each entry of rewrite.json:
 *   1. writer: the free NVIDIA writer (REWRITE_MODEL; default DeepSeek V4.1 Flash) writes a replacement question on the same skill (4 distinct options, one defensible answer);
 *      the correct option's position is shuffled here, not by the model;
 *   2. code checks: distinct options, no "all/none of the above", services/key-agreement.js does not flag it;
 *   3. blind re-solve by two judges of different families, neither shown the key or the explanation: NVIDIA Nemotron Ultra
 *      (services/key-gate.js) and Gemini (free tier). Both must pick the key. Up to 3 tries per question.
 * Resumable: DIR/rewritten.json keeps every question that passed; DIR/rewrite-failed.json lists the ones that did not.
 * Only question text goes to the models. Needs NVIDIA_API_KEY and GEMINI_API_KEY (read from the .env by dotenv; never printed).
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
const WRITER = process.env.REWRITE_MODEL || 'deepseek-ai/deepseek-v4.1-flash';
const DB = arg('db'); const OUT = arg('out'); const LIMIT = Number(arg('limit', 0));
if (!DB || !OUT) { console.error('--db data/db.json --out DIR'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const ka = require('../services/key-agreement');
const keyGate = require('../services/key-gate');
const nvidia = require('../services/providers/nvidia');
const gemini = require('../services/providers/gemini');
const judges = require('./lib/english-game-judges');

const STAGED = path.join(__dirname, '..', 'curriculum-build', 'staged', 'content-fixes', 'english-games-reaudit');
const SCHEMA = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' } },
    correct_index: { type: 'integer' },
    explanation: { type: 'string' },
  },
  required: ['prompt', 'choices', 'correct_index', 'explanation'],
};
const SYSTEM = 'You write one multiple-choice English question for a school course (grammar, usage, punctuation, vocabulary, reading or writing). '
  + 'Rules: exactly four options, all different, exactly one of them correct and defensible by standard usage; the other three are plausible but clearly wrong. '
  + 'No "all of the above", "none of the above" or "both" options. The question must be answerable from its own text. '
  + 'The explanation is one sentence that says why the correct option is correct and names it by its wording. Keep to the topic and difficulty given.';

function userFor(orig, why) {
  return `Replace this question, which cannot stay (${why}). Write a NEW question that tests the same skill at the same difficulty, with a different example.\n\n`
    + `Skill: ${orig.skill || ''}\nTopic: ${orig.topic || ''}\nDifficulty (1-10): ${orig.difficulty || ''}\n`
    + `Old question: ${orig.prompt}\nOld options: ${(orig.choices || []).map((c, i) => `(${i}) ${c}`).join(' | ')}\n\nReturn the new question.`;
}

function shuffleKey(q, seed) {
  const idx = q.choices.map((_, i) => i);
  let s = seed >>> 0 || 1;
  for (let i = idx.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const choices = idx.map((i) => q.choices[i]);
  return { ...q, choices, answerIndex: idx.indexOf(q.correct_index) };
}

function codeProblems(q, origPrompt) {
  const p = [];
  if (!q || typeof q.prompt !== 'string' || !Array.isArray(q.choices) || q.choices.length !== 4) return ['shape'];
  const norm = q.choices.map((c) => String(c).trim().toLowerCase().replace(/[^a-z0-9 ]/g, ''));
  if (new Set(norm).size !== 4 || norm.some((c) => !c)) p.push('options not distinct');
  if (q.choices.some((c) => /\b(all|none|both|neither) of (the|these)\b|\bboth (a|b|c|d)\b|\ball of the above\b/i.test(c))) p.push('all/none/both option');
  if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) p.push('bad index');
  if (q.prompt.trim().toLowerCase() === String(origPrompt).trim().toLowerCase()) p.push('same prompt');
  return p;
}

async function main() {
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const rows = new Map(db.game_payloads.map((r) => [r.id, r]));
  const rewrite = JSON.parse(fs.readFileSync(path.join(STAGED, 'rewrite.json'), 'utf8')).rewrite.concat(arg('extra') ? JSON.parse(fs.readFileSync(arg('extra'), 'utf8')).rewrite : []);
  const doneFile = path.join(OUT, 'rewritten.json');
  const done = fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, 'utf8')) : {};
  const failed = {};
  const todo = rewrite.filter((r) => !done[r.key]).slice(0, LIMIT || undefined);
  console.log(`rewriting ${todo.length} (already done ${Object.keys(done).length})`);
  let at = 0;
  const worker = async () => {
    while (at < todo.length) {
      const it = todo[at++];
      const row = rows.get(it.row);
      const orig = row.payload.questions.find((q) => q.id === it.key.split(':')[1]);
      let result = null; const tries = [];
      for (let t = 0; t < 3 && !result; t++) {
        let w = null;
        try {
          // eslint-disable-next-line no-await-in-loop
          w = await nvidia.structured({ role: 'blocks', system: SYSTEM, user: userFor(orig, it.why), schema: SCHEMA, schemaName: 'submit_question', maxTokens: 1500, models: [{ model: WRITER, effort: 'low' }], timeoutMs: 150000, attempts: 1 });
        } catch (e) { tries.push(`writer: ${String(e.message).slice(0, 80)}`); }
        const d = w && w.data;
        const probs = codeProblems(d, orig.prompt);
        if (!d || probs.length) { tries.push(`code: ${probs.join(',') || 'no data'}`); continue; }
        const q = shuffleKey(d, (it.row * 7919 + it.qi * 31 + t) | 0);
        const full = { id: orig.id, prompt: q.prompt.trim(), choices: q.choices.map((c) => String(c).trim()), answerIndex: q.answerIndex, explanation: String(q.explanation).trim(), difficulty: orig.difficulty, skill: orig.skill, topic: orig.topic };
        if (ka.keyAgreement(full).flagged) { tries.push('explanation does not match the key'); continue; }
        // eslint-disable-next-line no-await-in-loop
        const [a, b] = await Promise.all([judges.A([full]), judges.B([full])]);
        if (a[0] === full.answerIndex && b[0] === full.answerIndex) result = { ...full, judgeA: a[0], judgeB: b[0], writer: WRITER, tries: t + 1 };
        else tries.push(`judges: A=${a[0]} B=${b[0]} key=${full.answerIndex}`);
      }
      if (result) done[it.key] = { row: it.row, level: it.level, old_prompt: orig.prompt, question: result };
      else failed[it.key] = { row: it.row, level: it.level, tries };
      fs.writeFileSync(doneFile, JSON.stringify(done, null, 1));
      fs.writeFileSync(path.join(OUT, 'rewrite-failed.json'), JSON.stringify(failed, null, 1));
      process.stdout.write(result ? '+' : '-');
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  console.log(`\npassed ${Object.keys(done).length}, failed ${Object.keys(failed).length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
void keyGate; void gemini;
