#!/usr/bin/env node
/**
 * Step 6: "the most optimal broadly", as far as anything can test it today, on the shared lessons. AI-judged and computed: NOT real-learner proof.
 *   node scripts/fact-gate/base-ready.js measure          computed numbers per level (free)
 *   node scripts/fact-gate/base-ready.js judge <judge>    the rubric read per level, with planted-bad controls and a repeat (noise control)
 *   node scripts/fact-gate/base-ready.js report           the table
 * Rubric judged by two families. Controls: each level also read damaged (teaching blocks removed; checks taken from another level; order shuffled), so the judge is measured
 * before it is believed, and read twice (same text, same judge) for the noise.
 * Learners: six extreme or unusual profiles in every read (rules: extreme and random learners, per-individual worst cases).
 */
const L = require('./lib');
const J = require('./judges');

const [, , CMD = 'measure', JUDGE = 'glm_flash_zgpu', PAR = '4'] = process.argv;
const OUT = L.path.join(L.TMP, 'base-ready');
L.fs.mkdirSync(OUT, { recursive: true });
const levels = L.loadLevels();

const LEARNERS = [
  'a 10-year-old who reads two years below grade and gives up after one long paragraph',
  'an adult second-language English speaker, strong at math, weak at English idioms',
  'a very strong learner who already knows most of this and is bored by repetition',
  'a learner with attention difficulties who skims and only stops at anything interactive',
  'a career changer of 45 who last studied this 25 years ago and has forgotten the terms',
  'a random mix: 13, loves football, hates this subject, anxious about being wrong, fast reader',
];
const SYSTEM = `You judge one level of a self-study course as an experienced curriculum designer. Score what is on the page, not what could be added. You get the subject, grade and level, what the level should cover, then every block and graded check as JSON. Scores 0 to 5, where 3 is an ordinary competent textbook page, 5 is the best you have seen, and 0 is unusable. Be hard: most levels are 2 to 4.

- covers: does it teach everything the level's topic needs, with no gaps a later level would trip on?
- clarity: can a learner of this grade follow it without a teacher?
- worked: does it show worked examples or modelled answers before asking the learner to do it?
- retrieval: does it make the learner recall and apply, beyond recognising?
- misconceptions: does it name and defuse the likely mistakes?
- check_validity: do the graded checks test what was taught, and would passing them mean the learner has it?
- efficient: is every part needed, with nothing a learner could skip without losing anything? (5 = nothing to cut)
- learners: for each learner listed, score 0 to 5 how well this level would work for them as written.
- fix_first: the single change that would help most, in one short sentence.`;
const SCHEMA = {
  type: 'object',
  required: ['covers', 'clarity', 'worked', 'retrieval', 'misconceptions', 'check_validity', 'efficient', 'learners', 'fix_first'],
  properties: {
    covers: { type: 'number' }, clarity: { type: 'number' }, worked: { type: 'number' }, retrieval: { type: 'number' }, misconceptions: { type: 'number' }, check_validity: { type: 'number' }, efficient: { type: 'number' },
    learners: { type: 'array', items: { type: 'number' } }, fix_first: { type: 'string' },
  },
};
const CRITERIA = ['covers', 'clarity', 'worked', 'retrieval', 'misconceptions', 'check_validity', 'efficient'];

const TEACHING = /^(Theory_|Basic_|Concept_|Hook_|Memory_|Context_)/;
function damaged(lv, how, other) {
  const out = JSON.parse(JSON.stringify(lv));
  if (how === 'no_teaching') { const kept = out.blocks.filter((b) => !TEACHING.test(b.block)); if (kept.length >= 2) out.blocks = kept; else out.blocks = out.blocks.slice(0, 1); }
  if (how === 'wrong_checks') out.checks = other.checks.map((c, i) => ({ ...c, index: i }));
  if (how === 'shuffled') out.blocks = [...out.blocks].sort((a, b) => (L.hash(`${a.index}x`) < L.hash(`${b.index}x`) ? -1 : 1)).map((b, i) => ({ ...b, index: i }));
  return out;
}

function strings(o, out = []) { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') for (const k of Object.keys(o)) if (!/^(id|color|accent|icon|block|tag|key|ariaLabel|index|format|skill_id|source)$/i.test(k)) strings(o[k], out); return out; }
const syll = (w) => { const s = w.toLowerCase().replace(/[^a-z]/g, ''); if (!s) return 0; return Math.max(1, (s.replace(/e$/, '').match(/[aeiouy]+/g) || []).length); };
function measure(lv) {
  const text = [...lv.blocks.map((b) => b.data), ...lv.checks.map((c) => ({ p: c.prompt, c: c.choices, r: c.rationale }))].flatMap((x) => strings(x)).filter((s) => /\s/.test(s) && !/^https?:/.test(s));
  const all = text.join(' ');
  const ws = all.match(/[\p{L}'-]+/gu) || [];
  const sentences = Math.max(1, (all.match(/[.!?]+(\s|$)/g) || []).length);
  const syllables = ws.reduce((n, w) => n + syll(w), 0);
  const fk = 0.39 * (ws.length / sentences) + 11.8 * (syllables / Math.max(1, ws.length)) - 15.59;
  const interactive = lv.blocks.filter((b) => /^(Interact_|Recall_|Ret_|Game_|Trap_)/.test(b.block)).length;
  return { id: lv.id, track: lv.track, grade: lv.grade, kind: lv.kind, source: lv.source, verified: !!(lv.verification && lv.verification.status === 'verified'), tier: lv.check_tier, model: lv.verification && lv.verification.model, blocks: lv.blocks.length, checks: lv.checks.length, words: ws.length, minutes: +(ws.length / 180 + lv.checks.length * 0.5 + interactive * 0.75).toFixed(1), fk: +fk.toFixed(1), interactive, hasWorked: lv.blocks.some((b) => /Steps|Worked|StepLadder|FormulaBuilder|BeforeAfter|ForensicAudit|TimelineSteps/.test(b.block)) };
}

async function judge() {
  const file = L.path.join(OUT, `rubric-${JUDGE.replace(/[:/]/g, '_')}.jsonl`);
  const done = new Set(L.readJsonl(file).map((r) => r.key));
  const jobs = [];
  levels.forEach((lv, i) => {
    const other = levels[(i + 17) % levels.length];
    jobs.push({ key: `${lv.id}|plain|0`, lv, ctl: 'plain' });
    if (L.hash(`rep${lv.id}`) < '5') jobs.push({ key: `${lv.id}|plain|1`, lv, ctl: 'repeat' }); // same text again: about a third of the levels
    const pick = parseInt(L.hash(`ctl${lv.id}`).slice(0, 4), 16) % 3;
    if (L.hash(`dmg${lv.id}`) < '8') {
      const how = ['no_teaching', 'wrong_checks', 'shuffled'][pick];
      if (how !== 'wrong_checks' || other.checks.length) jobs.push({ key: `${lv.id}|${how}|0`, lv: damaged(lv, how, other), ctl: how });
    }
  });
  const todo = jobs.filter((j) => !done.has(j.key));
  console.log(`${todo.length} reads`);
  let cost = 0;
  await L.runPool(todo, Number(PAR), async ({ key, lv, ctl }) => {
    const user = `Learners:\n${LEARNERS.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\n${J.render(lv)}`;
    for (let a = 0; a < 3; a++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await J.callModel(JUDGE, { system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_scores', maxTokens: 6000, task: 'fact_gate_base_ready' });
        cost += r.cost || 0;
        L.appendJsonl(file, { key, id: lv.id, ctl, ...r.data, cost: r.cost });
        return;
      } catch (e) { if (a === 2) console.log('fail', key, String(e.message).slice(0, 100)); else await L.sleep(3000); } // eslint-disable-line no-await-in-loop
    }
  });
  console.log(`RESULT rubric ${JUDGE} $${cost.toFixed(3)}`);
  process.exit(0);
}

function report() {
  const rows = levels.map(measure);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const by = {};
  for (const r of rows) (by[`${r.track}/${r.grade}`] = by[`${r.track}/${r.grade}`] || []).push(r);
  console.log('grade | levels | verified | median words | minutes | FK | worked-example block');
  for (const [k, v] of Object.entries(by)) console.log(`${k.slice(0, 36).padEnd(36)} ${String(v.length).padStart(3)} ${String(v.filter((r) => r.verified).length).padStart(3)} ${String(med(v.map((r) => r.words))).padStart(5)} ${String(med(v.map((r) => r.minutes))).padStart(5)} ${String(med(v.map((r) => r.fk))).padStart(5)} ${v.filter((r) => r.hasWorked).length}`);
  L.writeJson(L.path.join(OUT, 'measures.json'), rows);
  for (const f of L.fs.readdirSync(OUT).filter((x) => x.startsWith('rubric-'))) {
    const rs = L.readJsonl(L.path.join(OUT, f));
    const plain = rs.filter((r) => r.ctl === 'plain');
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const score = (r) => mean(CRITERIA.map((c) => Number(r[c]) || 0));
    console.log(`\n${f}: ${rs.length} reads, $${rs.reduce((n, r) => n + (r.cost || 0), 0).toFixed(3)}`);
    console.log(` plain mean ${mean(plain.map(score)).toFixed(2)}; by criterion ${CRITERIA.map((c) => `${c} ${mean(plain.map((r) => Number(r[c]) || 0)).toFixed(1)}`).join(', ')}`);
    const base = new Map(plain.map((r) => [r.id, r]));
    const rep = rs.filter((r) => r.ctl === 'repeat' && base.has(r.id));
    console.log(` noise (same text, repeat, n=${rep.length}): mean abs change ${mean(rep.map((r) => Math.abs(score(r) - score(base.get(r.id))))).toFixed(2)}`);
    for (const how of ['no_teaching', 'wrong_checks', 'shuffled']) {
      const d = rs.filter((r) => r.ctl === how && base.has(r.id));
      const crit = how === 'wrong_checks' ? 'check_validity' : how === 'no_teaching' ? 'covers' : 'clarity';
      console.log(` control ${how} n=${d.length}: overall drop ${mean(d.map((r) => score(base.get(r.id)) - score(r))).toFixed(2)}; ${crit} ${mean(d.map((r) => Number(base.get(r.id)[crit]) || 0)).toFixed(1)} → ${mean(d.map((r) => Number(r[crit]) || 0)).toFixed(1)}; lower in ${d.filter((r) => score(r) < score(base.get(r.id))).length}/${d.length}`);
    }
    const perTrack = {};
    for (const r of plain) { const t = r.id.split('/')[0]; (perTrack[t] = perTrack[t] || []).push(r); }
    console.log(` by subject: ${Object.entries(perTrack).map(([t, v]) => `${t} ${mean(v.map(score)).toFixed(2)} (n=${v.length})`).join(', ')}`);
    const learnerMeans = LEARNERS.map((_, i) => mean(plain.map((r) => Number((r.learners || [])[i]) || 0)));
    console.log(` learners mean: ${learnerMeans.map((x) => x.toFixed(1)).join(' ')}`);
    const all = plain.flatMap((r) => (r.learners || []).map(Number)).sort((a, b) => a - b);
    const q = (p) => all[Math.floor(all.length * p)];
    console.log(` per learner-level: worst 1% ${q(0.01)}, 5% ${q(0.05)}, 10% ${q(0.1)}, median ${q(0.5)}; levels with any learner under 2: ${plain.filter((r) => (r.learners || []).some((x) => Number(x) < 2)).length}/${plain.length}`);
    const low = [...plain].sort((a, b) => score(a) - score(b)).slice(0, 5);
    console.log(` lowest: ${low.map((r) => `${r.id} ${score(r).toFixed(1)}`).join('; ')}`);
    L.writeJson(L.path.join(OUT, `${f}.fixfirst.json`), plain.map((r) => ({ id: r.id, s: +score(r).toFixed(2), fix: r.fix_first })));
  }
}

if (CMD === 'judge') judge(); else report();
