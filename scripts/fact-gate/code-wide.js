#!/usr/bin/env node
// The code pass over everything else stored (text it was not tuned on): game questions, per-user lessons, items. Certain flags are false alarms unless the row is really wrong: listed for a human read.
const L = require('./lib');
const code = require('../../services/fact-code-checks');

const db = L.readJson(L.DB);
const out = []; let n = 0; const t0 = Date.now();
const run = (kind, id, lv) => { n++; for (const f of code.checkLevel(lv).filter((x) => x.certain)) out.push({ kind, id, where: f.where, rule: f.rule, claim: f.claim, truth: f.truth }); };
for (const p of db.game_payloads) {
  const qs = (p.payload && p.payload.questions) || [];
  run('game', p.id, { trackId: p.track_id, gradeId: p.grade_id, blocks: [], checks: qs.filter((q) => q && Array.isArray(q.choices)).map((q, i) => ({ index: i, format: 'multiple_choice', prompt: q.prompt, choices: q.choices, answer: q.choices[q.answerIndex], rationale: q.explanation })) });
}
const asObj = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
for (const l of db.lessons || []) {
  const blocks = []; let k = 0;
  for (const name of ['sections', 'worked_example', 'common_mistakes']) { const v = asObj(l[name]); if (v) blocks.push({ index: k++, block: name === 'common_mistakes' ? 'Trap_common' : 'Basic_TextBlock', data: name === 'common_mistakes' ? { wrongExample: v } : { [name]: v } }); }
  const cq = asObj(l.check_questions);
  const checks = Array.isArray(cq) ? cq.map((c, i) => ({ index: i, format: c.format || (c.choices ? 'multiple_choice' : 'type_in'), prompt: c.prompt, choices: c.choices, answer: c.answer, rationale: c.rationale, accepts: c.accepts })) : [];
  run('lesson', l.id, { trackId: l.track_id, gradeId: l.grade_id, blocks, checks });
}
for (const it of db.items || []) run('item', it.id, { trackId: it.track_id, gradeId: it.grade_id, blocks: [], checks: [{ index: 0, format: it.format || (it.choices ? 'multiple_choice' : 'type_in'), prompt: it.prompt, choices: it.choices, answer: it.answer, rationale: it.rationale, accepts: it.accepts }] });
const by = {}; for (const f of out) { const k = `${f.kind}:${f.rule}`; by[k] = (by[k] || 0) + 1; }
console.log(`rows ${n}, certain flags ${out.length}, ${(Date.now() - t0) / n | 0} ms/row`, JSON.stringify(by));
L.writeJson(L.path.join(L.TMP, 'code-wide.json'), out);
for (const f of out.slice(0, Number(process.argv[2] || 40))) console.log(`${f.kind} ${f.id} ${f.where} ${f.rule} | ${String(f.claim).slice(0, 90)} | ${String(f.truth).slice(0, 50)}`);
