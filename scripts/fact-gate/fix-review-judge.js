#!/usr/bin/env node
/**
 * Independent reads of the proposed stored-text fixes (docs/fact-gate/fix-review-records.json). Pipeline text only, no learner data, no account ids. Nothing is applied here.
 *   review  each judge sees the part after the change and each old -> new pair, says whether the old was wrong, the new is true, and the part still holds. The family that proposed a fix does not vote on it.
 *   blind   key and explanation withheld: which option is right, and is any other option also right. Multiple choice and trap parts only.
 * Resumable: raw answers in FIX_REVIEW_TMP/raw.jsonl. Output: docs/fact-gate/fix-review-judges.json. Spend goes through the providers' ledgers, RUN_CAP_USD (default $5).
 *   DB_FILE=<copy> DB_READONLY=1 node scripts/fact-gate/fix-review-judge.js [par=4] [only-id-substring]
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const J = require('./judges');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'fact-gate');
const TMP = process.env.FIX_REVIEW_TMP || path.join(L.TMP, 'fix-review');
fs.mkdirSync(TMP, { recursive: true });
const RAW = path.join(TMP, 'raw.jsonl');
const { records } = L.readJson(path.join(DOCS, 'fix-review-records.json'));
const recheck = L.readJson(path.join(DOCS, 'recheck-fixes.json'));
const [, , PAR = '4', ONLY = ''] = process.argv;

const FAMILY = { kimi31: 'kimi', grok43: 'grok', glm_flash_zgpu: 'glm' };
const REVIEW_SYSTEM = `You check a proposed correction to a stored school lesson or quiz question, before it reaches learners. The proposal may be wrong: many are. A "fix" that breaks a true sentence, leaves a question with no single right answer, or misdescribes the question is worse than no fix.
Work it out yourself. Do the sums. Use what you know for certain, and say unsure rather than guess. Judge only what the change touches and whether the part still holds after it; ignore style and tone, and anything unrelated in the part.
Answer:
- working: your reasoning, short.
- old_wrong: was the old text actually wrong or misleading? yes, no or unsure.
- new_true: is every statement in the new text true? yes, no or unsure.
- part_sound: after the change, is the part consistent: exactly one right answer where there is a key, the key is that answer, explanations and feedback agree with the key and with the text they describe, nothing else in the part now contradicts it? yes, no or unsure.
- verdict: right (old wrong, new true, part sound), wrong (the change is false, or breaks something, or the old text was fine), or unsure.
- why: one line, at most 25 words.`;
const REVIEW_SCHEMA = { type: 'object', required: ['working', 'old_wrong', 'new_true', 'part_sound', 'verdict', 'why'], properties: { working: { type: 'string' }, old_wrong: { type: 'string', enum: ['yes', 'no', 'unsure'] }, new_true: { type: 'string', enum: ['yes', 'no', 'unsure'] }, part_sound: { type: 'string', enum: ['yes', 'no', 'unsure'] }, verdict: { type: 'string', enum: ['right', 'wrong', 'unsure'] }, why: { type: 'string' } } };
const BLIND_SYSTEM = `Answer this school question as a subject expert. Work it out yourself. Then say which option is the one best answer, and whether any other option is also fully correct.
Answer: working (short), option (the 0-based number of the best answer), also_correct (0-based numbers of any other option that is also fully correct; usually none).`;
const BLIND_SCHEMA = { type: 'object', required: ['working', 'option', 'also_correct'], properties: { working: { type: 'string' }, option: { type: 'integer' }, also_correct: { type: 'array', items: { type: 'integer' } } } };

const pair = (e) => `${e.path.join('.') || '(whole)'}\n  old: ${JSON.stringify(e.old)}\n  new: ${JSON.stringify(e.new)}`;
function reviewUser(r) {
  if (r.store === 'game_payloads') {
    const q = r.question_after;
    return `Subject: ${r.track_id}, grade ${r.grade_id}, level ${r.level}. Topic: ${r.topic}.\nQuiz question after the change (answerIndex counts from 0):\n${JSON.stringify({ prompt: q.prompt, choices: q.choices, answerIndex: q.answerIndex, explanation: q.explanation }, null, 1)}\n\nChanges:\n${r.edits.map(pair).join('\n')}`;
  }
  if (r.store === 'row') return `Subject: ${r.subject}. A sentence in a lesson or a question.\nChanges:\n${r.edits.map(pair).join('\n')}\n\nContext: ${r.context}`;
  return `Subject: ${r.track_id}, grade ${r.grade_id}, level ${r.level}. Part: ${r.part} ${r.index} (${r.part_name}).\nThe part after the change (numbers in JSON count from 0):\n${JSON.stringify(r.part_after).slice(0, 7000)}\n\nChanges:\n${r.edits.map(pair).join('\n').slice(0, 5000)}`;
}
function blindOf(r) {
  if (r.store === 'game_payloads') return { key: r.question_after.answerIndex, user: `Question: ${r.question_after.prompt}\nOptions:\n${r.question_after.choices.map((c, i) => `${i}. ${c}`).join('\n')}` };
  const p = r.part_after;
  if (r.part === 'check' && p.format === 'multiple_choice') return { key: p.choices.indexOf(p.answer), user: `Question: ${p.prompt}\nOptions:\n${p.choices.map((c, i) => `${i}. ${c}`).join('\n')}` };
  if (r.part === 'block' && Array.isArray(p.choices) && Number.isInteger(p.correctIndex)) return { key: p.correctIndex, user: `${p.context ? `Context: ${p.context}\n` : ''}Question: ${p.question}\nOptions:\n${p.choices.map((c, i) => `${i}. ${c}`).join('\n')}` };
  if (r.part === 'block' && Array.isArray(p.options) && p.correctId) return { key: p.options.findIndex((o) => o.id === p.correctId), user: `Question: ${p.prompt}\nOptions:\n${p.options.map((o, i) => `${i}. ${o.text}`).join('\n')}` };
  return null;
}

// The per-learner rows: only the changed words go out, never the row or who it belongs to.
const rowRecords = Object.entries(recheck.row_fixes).map(([k, fx]) => ({
  id: `row:${k}`, store: 'row', proposer: 'claude', subject: k.includes('33639') || ['lessons:1220', 'lessons:3069'].includes(k) ? 'english' : 'math',
  context: '', edits: fx.map((f, i) => ({ path: [String(i)], old: f.from, new: f.to })),
}));

async function ask(m, system, user, schema, schemaName) {
  for (let a = 0; ; a++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await J.callModel(m, { system, user, schema, schemaName, maxTokens: 6000 });
    } catch (e) {
      if (a >= 3) throw e;
      // eslint-disable-next-line no-await-in-loop
      await L.sleep(8000 * (a + 1));
    }
  }
}

(async () => {
  const done = new Set(L.readJsonl(RAW).map((x) => `${x.kind}|${x.id}|${x.model}`));
  const jobs = [];
  for (const r of [...records, ...rowRecords]) {
    if (ONLY && !r.id.includes(ONLY)) continue;
    for (const m of Object.keys(FAMILY)) {
      if (FAMILY[m] === r.proposer) continue;
      if (r.store === 'row' && m === 'kimi31') continue;
      jobs.push({ kind: 'review', r, m });
    }
    const b = r.store === 'row' ? null : blindOf(r);
    if (b) for (const m of ['grok43', 'glm_flash_zgpu']) if (FAMILY[m] !== r.proposer) jobs.push({ kind: 'blind', r, m, b });
    if (b && r.proposer === 'grok') jobs.push({ kind: 'blind', r, m: 'kimi31', b });
    if (b && r.proposer === 'glm') jobs.push({ kind: 'blind', r, m: 'kimi31', b });
  }
  const todo = jobs.filter((j) => !done.has(`${j.kind}|${j.r.id}|${j.m}`));
  console.log(`${jobs.length} reads, ${todo.length} to do`);
  let cost = 0; let fails = 0; let n = 0;
  await L.runPool(todo, Number(PAR), async (j) => {
    try {
      const res = j.kind === 'review'
        ? await ask(j.m, REVIEW_SYSTEM, reviewUser(j.r), REVIEW_SCHEMA, 'submit_review')
        : await ask(j.m, BLIND_SYSTEM, j.b.user, BLIND_SCHEMA, 'submit_answer');
      cost += res.cost || 0;
      L.appendJsonl(RAW, { kind: j.kind, id: j.r.id, model: j.m, key: j.b ? j.b.key : undefined, data: res.data, cost: res.cost || 0 });
    } catch (e) {
      fails++;
      console.log('fail', j.kind, j.r.id, j.m, String(e.message).slice(0, 90));
    }
    if (++n % 20 === 0) console.log(`${n}/${todo.length} $${cost.toFixed(3)} fails ${fails}`);
  });
  const raw = L.readJsonl(RAW);
  const byId = {};
  for (const x of raw) {
    const o = byId[x.id] = byId[x.id] || { review: {}, blind: {} };
    if (x.kind === 'review') o.review[x.model] = { verdict: x.data.verdict, old_wrong: x.data.old_wrong, new_true: x.data.new_true, part_sound: x.data.part_sound, why: x.data.why };
    else o.blind[x.model] = { option: x.data.option, key: x.key, also: x.data.also_correct };
  }
  L.writeJson(path.join(DOCS, 'fix-review-judges.json'), { how: 'see scripts/fact-gate/fix-review-judge.js; AI-judged, not proof', spent_usd: raw.reduce((s, x) => s + (x.cost || 0), 0), byId });
  console.log(`DONE this run $${cost.toFixed(3)}, all runs $${raw.reduce((s, x) => s + (x.cost || 0), 0).toFixed(3)}, fails ${fails}`);
  process.exit(0);
})();
