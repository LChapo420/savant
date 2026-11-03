/**
 * Second blind judge for the English game keys flagged by scripts/english-game-key-audit.js (2 Nov 2026).
 *
 *   node scripts/english-key-second-judge.js --db COPY.json --audit DIR --out DIR2 [--judge gemini|sol]
 *
 * Reads DIR/before.json (the 152 questions counted wrong) and the DB copy, asks the second judge blind (question and options only, never the key
 * or the explanation), and splits the flagged questions:
 *   confirmed  both blind judges (Nemotron Ultra from the first pass, and this one) pick the same other option AND the code check
 *              (key-agreement: the explanation describes that option) points at it  ->  re-key (staged in DIR2/rekey-confirmed.json)
 *   rewrite    everything else (duplicate options, judges disagree, the explanation points elsewhere)  ->  DIR2/rewrite.json, not applied
 * Nothing is written to the live database. Sol (MODELFLARE_API_KEY) is the intended second judge; when its key has no quota the Gemini free tier is used.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DB = arg('db'); const AUDIT = arg('audit'); const OUT = arg('out'); const JUDGE = arg('judge', 'gemini');
fs.mkdirSync(OUT, { recursive: true });
const ka = require('../services/key-agreement');
const SYSTEM = 'You answer multiple-choice questions for a school course. For each question, work it out yourself and give the index (0-based) of the one option you believe is correct. You are not told the answer key. Reply with one JSON object: {"picks":[{"index":0,"chosen_index":2}, ...]}';

async function ask(batch) {
  const user = `${batch.map((q, i) => `Question ${i}: ${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`).join('\n\n')}\n\nReturn the JSON.`;
  for (let a = 0; a < 4; a++) {
    let text = '';
    try {
      if (JUDGE === 'sol') {
        const key = require('dotenv').parse(fs.readFileSync('C:/coding/claudecommittdIq/folderThing/.env')).MODELFLARE_API_KEY;
        const r = await fetch('https://modelflare.dev/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(180000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: 'gpt-6.1-sol', max_tokens: 2500, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }) });
        if (r.status !== 200) throw new Error(`sol ${r.status}`);
        text = (((await r.json()).choices || [])[0] || {}).message.content || '';
      } else if (JUDGE === 'nvidia') {
        const nv = require('../services/providers/nvidia'); // eslint-disable-line global-require
        const r = await nv.chat({ role: 'fast', system: SYSTEM, messages: [{ role: 'user', content: user }], maxTokens: 2500, model: arg('model', 'minimaxai/minimax-m3.1-flash'), effort: 'off', timeoutMs: 180000 });
        text = r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1);
      } else {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', { method: 'POST', signal: AbortSignal.timeout(180000), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0, maxOutputTokens: 2500, responseMimeType: 'application/json' } }) });
        if (r.status !== 200) throw new Error(`gemini ${r.status}`);
        text = (((((await r.json()).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('');
      }
      const picks = (JSON.parse(text).picks || []);
      const by = new Map(picks.map((p) => [p.index, p.chosen_index]));
      return batch.map((_, i) => (Number.isInteger(by.get(i)) ? by.get(i) : null));
    } catch { await new Promise((res) => { setTimeout(res, 8000 * (a + 1)); }); }
  }
  return batch.map(() => null);
}

(async () => {
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const before = JSON.parse(fs.readFileSync(path.join(AUDIT, 'before.json'), 'utf8'));
  const rows = new Map(db.game_payloads.map((g) => [g.id, g]));
  const items = before.wrong.map((w) => { const q = rows.get(w.row).payload.questions[w.qi]; return { w, q, prompt: String(q.prompt), choices: q.choices.map(String) }; });
  const second = [];
  for (let i = 0; i < items.length; i += 12) second.push(...(await ask(items.slice(i, i + 12))));
  const confirmed = []; const rewrite = [];
  items.forEach((it, i) => {
    const key = ka.keyIndexOf(it.q); const flag = ka.keyAgreement(it.q);
    const a = it.w.judgeA; const b = second[i];
    const dup = new Set(it.choices.map((c) => c.trim().toLowerCase())).size < it.choices.length;
    const rec = { ...it.w, judgeSecond: b, judgeSecondName: JUDGE };
    if (!dup && a !== null && a === b && a !== key && flag.flagged && flag.pointsTo === a) confirmed.push({ ...rec, set: { answerIndex: a } });
    else rewrite.push({ ...rec, why: dup ? 'duplicate options' : b === null ? 'second judge gave no answer' : a !== b ? 'the two judges disagree' : 'the explanation points elsewhere' });
  });
  fs.writeFileSync(path.join(OUT, 'rekey-confirmed.json'), JSON.stringify({ note: 'staged, not applied: both blind judges and the code check agree', rekey: confirmed }, null, 1));
  fs.writeFileSync(path.join(OUT, 'rewrite.json'), JSON.stringify({ note: 'staged, not applied: needs a rewrite or a person', rewrite }, null, 1));
  // After: apply the confirmed re-keys to the copy and count again with the same checks.
  for (const r of confirmed) { const q = rows.get(r.row).payload.questions[r.qi]; q.answerIndex = r.set.answerIndex; }
  let flagged = 0;
  for (const g of db.game_payloads.filter((x) => x.track_id === 'english')) for (const q of g.payload.questions) if (ka.keyAgreement(q).flagged) flagged += 1;
  const summary = { judge: JUDGE, flagged_in: items.length, second_answered: second.filter((x) => x !== null).length, confirmed_rekeys: confirmed.length, rewrite: rewrite.length, explanation_flags_after_rekeys: flagged };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(summary);
})();
