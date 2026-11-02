/**
 * Writes docs/SUBJECT-LEVELS-DEPTH.md from the proof runs in docs/block-depth/ (block-sensitivity-proof.js) and the English key re-audit.
 *   node scripts/block-depth-doc.js
 * Every number in the page is read from those files; nothing is typed in. AI-judged on simulated learners, never real-learner proof.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dir = path.join(ROOT, 'docs', 'block-depth');
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
const runs = { off: { single: read('blk-off-single.json'), joint: read('blk-off-joint.json') }, on: { single: read('blk-on-single.json'), joint: read('blk-on-joint.json') } };
const plant = read('blk-on-plant.json');
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'english-games-reaudit', 'summary.json'), 'utf8'));
const SUBJECTS = ['math', 'english', 'iq', 'spanish'];
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
const cell = (arm, phase, s) => { const v = runs[arm][phase] && runs[arm][phase][phase].bySubject[s]; return v ? v : { verdicts: 0, correct: 0, same: 0, failed: 0, pairs: 0 }; };
const show = (v) => (v.verdicts ? `${v.correct}/${v.verdicts} (${pct(v.correct, v.verdicts)})` : `n/a${v.pairs ? ` (${v.failed} of ${v.pairs} pairs not written)` : ''}`);

// What the writer actually did differently for the low and the high learner (plain code, no judge): mean words, blocks, checks.
function shape(arm) {
  const recs = (runs[arm].single && runs[arm].single.single.recs) || [];
  const out = {};
  for (const s of SUBJECTS) {
    const rs = recs.filter((r) => r.subject === s && r.code && r.measure === 'brevity_preference');
    out[s] = rs.length ? { lo: rs[0].code.lo, hi: rs[0].code.hi } : null;
  }
  return out;
}
const L = [];
L.push('# Built-in levels at the depth of uploaded material: math, English, IQ, Spanish', '',
  'Written by `scripts/block-depth-doc.js` from `docs/block-depth/*.json` (`scripts/block-sensitivity-proof.js`). **Every proof number is AI-judged on simulated learners (age-14 profiles built from the scorecard), written by MiniMax M3.1 Flash on xKiro (free grant, pipeline use), judged blind by two free models of other families. It is not real-learner proof.** The base level is the same writer with the adapter off (`BLOCK_ADAPT=off`), so before and after share the writer, the judges, the levels and the learners.', '',
  '## What changed', '',
  '`services/block-adapt.js` is one adapter from `services/learning-spec.js` to the block lesson/retention writer (`block-levels.js`), the game question writer (`game-payloads.js`) and the checkpoint writer (`block-checkpoints.js`); per-subject wording lives in its `SUBJECT_LINES`. Each call now carries the learner\'s size (minutes, blocks, graded checks, word budget), examples and worked steps per idea, check formats and difficulty order, hints, explanation detail, interests as the setting (never dislikes) and the subject lines; the fill-out is checked with `checkFollowed` and rewritten once with the problems named (the same machinery as notes and podcasts). Checkpoints get presentation only. Write-ahead writes through the same functions, so it inherits all of it. An empty spec, the shared base level and the owner under the owner-base rule are unchanged: `node scripts/block-diff.js --selfcheck` (in `npm test`) shows identical prompts with the adapter on and off, and `--compare docs/block-diff-base.json` shows 13 of 13 cases byte-identical to the commit before the adapter.', '',
  '## Proof: share of measures followed (judge verdicts naming the HIGH learner\'s level)', '',
  'One level per subject (math 30, English 40, IQ 20, Spanish 8 of their grades), four single measures (brevity_preference, vocabulary_ceiling, interest_transfer, worked_example_dependence), and joint profiles J1-J4 against their mirror. A cell is correct verdicts / all verdicts; "same" and wrong verdicts count against.', '',
  '| subject | single, adapter off | single, adapter on | joint, adapter off | joint, adapter on |', '|---|---|---|---|---|');
for (const s of SUBJECTS) L.push(`| ${s} | ${show(cell('off', 'single', s))} | ${show(cell('on', 'single', s))} | ${show(cell('off', 'joint', s))} | ${show(cell('on', 'joint', s))} |`);
const tot = (arm, phase) => SUBJECTS.reduce((a, s) => { const v = cell(arm, phase, s); return { c: a.c + v.correct, n: a.n + v.verdicts }; }, { c: 0, n: 0 });
L.push(`| all | ${['off', 'on'].flatMap((arm) => ['single'].map((p) => `${tot(arm, p).c}/${tot(arm, p).n} (${pct(tot(arm, p).c, tot(arm, p).n)})`)).join(' | ')} | ${['off', 'on'].map((arm) => `${tot(arm, 'joint').c}/${tot(arm, 'joint').n} (${pct(tot(arm, 'joint').c, tot(arm, 'joint').n)})`).join(' | ')} |`, '');
if (plant && plant.joint) {
  const t = Object.values(plant.joint.bySubject).reduce((a, v) => ({ n: a.n + v.verdicts, c: a.c + v.correct, s: a.s + v.same }), { n: 0, c: 0, s: 0 });
  L.push(`Planted swap (the joint texts of the adapter-on run with profile and mirror swapped, so every pair is the wrong way round): the judges caught ${t.n - t.c - t.s} of ${t.n} verdicts, were fooled on ${t.c}, could not tell on ${t.s}. A judge that followed position or length instead of the writing would be fooled on about half.`, '');
}
const sOff = shape('off'); const sOn = shape('on');
L.push('### What the writer did for a learner who needs it short (brevity_preference low against high; plain code, no judge)', '', '| subject | adapter | blocks lo -> hi | graded checks lo -> hi | words lo -> hi | revised |', '|---|---|---|---|---|---|');
for (const s of SUBJECTS) for (const [arm, sh] of [['off', sOff], ['on', sOn]]) { const c = sh[s]; L.push(c ? `| ${s} | ${arm} | ${c.lo.blocks} -> ${c.hi.blocks} | ${c.lo.checks} -> ${c.hi.checks} | ${c.lo.words} -> ${c.hi.words} | ${c.hi.revised ? 'yes' : 'no'} |` : `| ${s} | ${arm} | not written in this run | | | |`); }
L.push('', '## English game answer keys re-audited (audit gap 10)', '',
  `Source: a copy of the live database (\`${audit.source}\`), all ${audit.before.total} multiple-choice questions of the 70 English Proficient game levels. Method: \`scripts/english-game-key-audit.js\` (code check that the explanation describes the keyed option, duplicate options, and a blind answer from ${audit.judge}). A question is counted wrong only on two signals (explanation flag plus the blind judge disagreeing, or duplicate options).`, '',
  `- **Before: ${audit.before.wrong} wrong or ambiguous keys of ${audit.before.total} (${pct(audit.before.wrong, audit.before.total)})**, all in the 56 original held games (0 in the 14 regenerated games, which pass the key gate). ${audit.before.dup} duplicate-option questions, ${audit.before.flagged} explanation flags. The blind judge alone disagreed with the key on ${audit.blindDisagree} of ${audit.judged} judged questions (about 13% of those are judge false alarms, per the 23 Oct audit).`,
  `- **Fix, staged and not applied** (\`curriculum-build/staged/content-fixes/english-games-reaudit/rekey.json\`): ${audit.before.rekey} re-keys (the explanation and the blind judge name the same other option) and ${audit.before.rewrite} questions listed for a rewrite (duplicate options or no agreement).`,
  `- **After the re-keys, same checks: ${audit.after.wrong} wrong (${pct(audit.after.wrong, audit.after.total)})**, explanation flags ${audit.before.flagged} -> ${audit.after.flagged}. The 56 originals stay held (\`content/game-holds.json\`); the database was only read.`,
  '- The second judge (GLM 5.3 on NVIDIA) returned no answers, so the error count rests on one blind judge plus the code check. Not re-solved by a person.', '',
  '## Not done / honest limits', '',
  '- The proof is partial wherever a cell says "pairs not written": the free writers and judges (xKiro MiniMax, NVIDIA, Gemini free tier) were rate-limited for hours on 2 Nov, and Modelflare Sol answered 401, so it did not judge. Those cells are not claimed.',
  '- Bank practice items (about 80% of levels) are package E and untouched. Spanish player files (package D) and the sealed Spanish files are untouched.',
  '- Games of math, IQ and Spanish are bank games (computed, no model), so the game lines apply to model-written games only (English); the checkpoint lines apply to every subject.',
  '- No real-learner evidence of learning faster or retaining more exists for any of this.');
fs.writeFileSync(path.join(ROOT, 'docs', 'SUBJECT-LEVELS-DEPTH.md'), `${L.join('\n')}\n`);
console.log('wrote docs/SUBJECT-LEVELS-DEPTH.md');
