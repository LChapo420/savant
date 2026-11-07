#!/usr/bin/env node
/**
 * Round 4 (docs/speed-real/ROUND4.md): does SPEED_TIGHT_PAGE lose anything? AI-JUDGED, NOT a real learner. A free NVIDIA model sees only the page and answers its own check questions, once from the whole page and once from
 * the tight page; a second call lists what the set-aside text says that the kept text does not. Shared base levels and simulated accounts' lessons only: no real learner's text goes to a pipeline-only provider.
 * Held-out material: pages picked by a hash fixed before any run, and none were read while building the rule.
 *   node scripts/speed-r4-page-check.js DB_COPY OUT.json [--n=30] [--width=3]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
process.env.DB_FILE = path.join(require('os').tmpdir(), `r4-page-${process.pid}.json`);
const nvidia = require('../services/providers/nvidia');
const speed = require('../services/speed-levers');

const [DB, OUT] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? Number(m.split('=')[1]) : d; };
const N = flag('n', 30); const WIDTH = flag('width', 3);
const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
const held = (s) => crypto.createHash('sha1').update(`r4page:${s}`).digest()[0] % 4 !== 0;
const hashOrder = (s) => crypto.createHash('sha1').update(`r4order:${s}`).digest('hex');
const NOT_SHOWN = /^(id|type|kind|layout|color|colour|icon|style|variant|svg|image|src|answer_index|correct|tone|accent|answer|explanation)$/i;
const visible = (o) => { if (o == null) return ''; if (typeof o === 'string') return o; if (typeof o === 'number') return String(o); if (Array.isArray(o)) return o.map(visible).join(' '); return Object.entries(o).map(([k, v]) => (NOT_SHOWN.test(k) ? '' : visible(v))).join(' '); };
const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;

const pages = [];
for (const p of d.block_plans) {
  if (p.user_id || p.kind !== 'lesson' || p.status !== 'ready' || !Array.isArray(p.blocks) || !(p.checks || []).length) continue;
  const id = `plan:${p.track_id}/${p.grade_id}/${p.level}`; if (!held(id)) continue;
  const kept = p.blocks.filter((b) => !speed.asideBlock(b)).map((b) => visible(b.data)).join('\n');
  const aside = p.blocks.filter((b) => speed.asideBlock(b)).map((b) => visible(b.data)).join('\n');
  if (!aside) continue;
  pages.push({ id, source: 'shared block level', kept, aside, checks: p.checks.map((c) => ({ prompt: c.prompt, choices: c.choices || null, answer: c.answer })) });
}
const simIds = new Set(d.users.filter((u) => /savant-local-sim|@test\.|example\.(com|org)/i.test(u.email || '')).map((u) => u.id));
for (const l of d.lessons) {
  if (l.source !== 'ai' || !simIds.has(l.user_id) || l.user_id === 6689 || !(l.check_questions || []).length) continue;
  const id = `lesson:${l.id}`; if (!held(id)) continue;
  const secs = (l.sections || []).map((s) => `${s.heading || ''}\n${s.body || ''}\n${s.example || ''}`).join('\n');
  const we = l.worked_example ? `${l.worked_example.problem}\n${(l.worked_example.steps || []).join('\n')}\n${l.worked_example.answer}` : '';
  pages.push({ id, source: 'simulated account lesson', kept: `${secs}\n${we}\n${(l.common_mistakes || []).join('\n')}`, aside: `${l.intro || ''}\n${l.summary || ''}`, checks: l.check_questions.map((c) => ({ prompt: c.prompt, choices: c.choices || null, answer: c.answer })) });
}
const chosen = [...pages].sort((a, b) => (hashOrder(a.id) < hashOrder(b.id) ? -1 : 1)).filter((p, i, all) => all.slice(0, i).filter((x) => x.source === p.source).length < N);
console.log(`pages available ${pages.length}, chosen ${chosen.length}`);

const SOLVE = { type: 'object', properties: { answers: { type: 'array', items: { type: 'string' } } }, required: ['answers'] };
const UNIQUE = { type: 'object', properties: { only_in_removed: { type: 'array', items: { type: 'string' } } }, required: ['only_in_removed'] };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.\-/ ]+/g, '').trim();
async function solve(text, checks) {
  const qs = checks.map((c, i) => `${i + 1}. ${c.prompt}${c.choices ? `\nChoices: ${c.choices.join(' | ')}` : ''}`).join('\n');
  const out = await nvidia.structured({ role: 'check', system: 'Answer each question using ONLY the lesson text given. If the text does not give the answer, reply "not in text" for that question. Give the choice text exactly when choices are shown.', user: `LESSON TEXT:\n${text.slice(0, 9000)}\n\nQUESTIONS:\n${qs}\n\nReply with one answer per question, in order.`, schema: SOLVE, schemaName: 'submit_answers', maxTokens: 3000 });
  const a = (out && out.data && out.data.answers) || [];
  return checks.map((c, i) => { const g = norm(a[i]); const k = norm(c.answer); return !!g && !!k && (g === k || g.includes(k) || k.includes(g)); });
}
async function unique(kept, aside) {
  const out = await nvidia.structured({ role: 'check', system: 'You compare two parts of one lesson. List each fact, rule or key point stated in REMOVED that KEPT does not state or clearly imply. Hooks, encouragement, restatements and story openings are not key points. An empty list is a fine answer.', user: `KEPT:\n${kept.slice(0, 9000)}\n\nREMOVED:\n${aside.slice(0, 4000)}`, schema: UNIQUE, schemaName: 'submit_list', maxTokens: 3000 });
  return (out && out.data && out.data.only_in_removed) || null;
}
(async () => {
  const rows = []; let i = 0; let live = 0;
  await new Promise((resolve) => {
    const next = () => {
      if (i >= chosen.length && live === 0) return resolve();
      while (live < WIDTH && i < chosen.length) {
        const p = chosen[i++]; live++;
        (async () => {
          const row = { id: p.id, source: p.source, words_kept: words(p.kept), words_aside: words(p.aside), checks: p.checks.length };
          try {
            row.full = await solve(`${p.kept}\n${p.aside}`, p.checks);
            row.tight = await solve(p.kept, p.checks);
            row.unique = await unique(p.kept, p.aside);
          } catch (e) { row.error = String(e.message || e).slice(0, 120); }
          rows.push(row);
          console.log(`${rows.length}/${chosen.length} ${p.id} ${row.error || `${(row.full || []).filter(Boolean).length}/${(row.tight || []).filter(Boolean).length} of ${p.checks.length}, unique ${(row.unique || []).length}`}`);
        })().finally(() => { live--; next(); });
      }
    };
    next();
  });
  const ok = rows.filter((r) => !r.error && r.unique);
  const sum = (f) => ok.reduce((s, r) => s + f(r), 0);
  const res = { ai_judged: true, model: 'NVIDIA free, the check lineup', n_pages: ok.length, errors: rows.length - ok.length, checks: sum((r) => r.checks), right_full: sum((r) => r.full.filter(Boolean).length), right_tight: sum((r) => r.tight.filter(Boolean).length), lost_by_tight: sum((r) => r.full.filter((x, j) => x && !r.tight[j]).length), words_kept: sum((r) => r.words_kept), words_aside: sum((r) => r.words_aside), pages_with_unique: ok.filter((r) => r.unique.length).length, unique_points: sum((r) => r.unique.length), samples: ok.flatMap((r) => r.unique.slice(0, 1).map((x) => `${r.source}: ${String(x).slice(0, 110)}`)).slice(0, 12), rows };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ ...res, rows: undefined }, null, 1));
  process.exit(0);
})();
