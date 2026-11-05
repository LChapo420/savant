/**
 * Tailoring check for the extreme learners (docs/EXTREME-LEARNERS.md section 2): the same level written for two contrasting SIMULATED learners by the real block writer
 * (services/block-levels.js), judged blind. Run through `node scripts/extreme-learners.js tailor --live --writer coral --judges lyc_glm --cache FILE ...`.
 *
 * For each of n extreme learners (held-out seed) a subject (math, english, reading, spanish, iq, act in turn) and a teaching level are chosen; the level is written for the learner
 * (a scorecard card with every trait, interests, dislikes, past difficulties, strengths and the English-learner flag, all as the app reads them) and for a CONTRASTING learner (every
 * trait mirrored 100-v, another age, other interests). The judge (GLM-5.3 on Lyceum) sees both profiles (as P and Q, order random) and both versions (1 and 2, order random) and
 * never which is which. One in plant-every pairs has the versions swapped: the judge must then NOT agree with the true assignment. Asked: which version suits P, which suits Q,
 * fit 1-5, whether each version uses a learner's interests and whether that is natural or forced (0-3), accuracy 0-10 and whether both teach the same objective.
 */
const fs = require('fs');
const path = require('path');
const X = require('./extreme-learners');

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');
const SUBJECTS = ['math', 'english', 'reading', 'spanish', 'iq', 'act'];
const CELLS = {
  math: [['multiplication_and_division', 10], ['algebra_1_part_a', 30], ['fractions_area_and_perimeter', 12], ['algebra_1_part_a', 36]],
  english: [['proficient', 40], ['intermediate', 25], ['advanced_intermediate', 30], ['basics', 8]],
  reading: [['proficient_reader', 30], ['intermediate_reader', 20], ['advanced_intermediate_reader', 25]],
  spanish: [['spanish_grade_04_time_food_shopping_and_core_verbs', 8], ['spanish_grade_05_home_places_and_directions', 6], ['entry', 6]],
  iq: [['abstract_reasoning', 20], ['core_reasoning_skills', 15], ['advanced_analytical_thinking', 18]],
  act: [['act_grade_4', 10], ['act_grade_10', 30], ['act_grade_7', 20], ['act_grade_12', 14]],
};

const surveyFor = (L, subject) => {
  const said = [...L.dislikes.map((d) => `I really dislike ${d}.`), ...L.difficulties.map((d) => `I find ${d} really hard.`), ...L.strengths.map((d) => `I am good at ${d}.`)];
  if (L.ell) said.push(`English is my second language (my first is ${L.language}).`);
  return { interests: L.hobbies.join(', '), hobbies: L.hobbies.join(', '), studying: subject, notes: said.join(' ') };
};

/** The contrasting learner: every trait mirrored, a different age, different interests, dislikes and difficulties (drawn from another seed, none shared). */
function mirrorOf(L) {
  const Q = X.learner(L.seed + 7919, L.index + 1000, { kind: 'random' });
  const traits = Object.fromEntries(X.IDS.map((id) => [id, Number(Math.max(2, Math.min(98, 100 - L.traits[id])).toFixed(2))]));
  let hobbies = Q.hobbies.filter((h) => !L.hobbies.includes(h));
  if (!hobbies.length) hobbies = X.HOBBIES.filter((h) => !L.hobbies.includes(h)).slice(Q.index % 50, (Q.index % 50) + 2);
  return { ...Q, id: `${L.id}~mirror`, age: Math.max(8, Math.min(70, 78 - L.age)), traits, hobbies, dislikes: Q.dislikes.filter((d) => !L.dislikes.includes(d)), ell: !L.ell && Q.ell, language: !L.ell && Q.ell ? Q.language : 'English' };
}

function profileText(L, BY_ID) {
  const edge = X.IDS.map((id) => ({ id, v: L.traits[id], d: Math.abs(L.traits[id] - 50) })).filter((x) => x.d >= 30).sort((a, b) => b.d - a.d).slice(0, 12)
    .map((x) => `${BY_ID[x.id].name} ${x.v >= 50 ? 'HIGH' : 'LOW'} (${Math.round(x.v)}/100: ${x.v >= 50 ? BY_ID[x.id].high : BY_ID[x.id].low})`);
  return [`Age ${L.age}${L.ell ? `; English is a second language (first language ${L.language})` : ''}`, `Interests and hobbies: ${L.hobbies.join(', ') || '(none given)'}`,
    `Dislikes: ${L.dislikes.join(', ') || '(none given)'}`, `Past difficulties: ${L.difficulties.join('; ') || '(none given)'}`, `Strengths: ${L.strengths.join('; ') || '(none given)'}`,
    `Learning scorecard, the strongest measures: ${edge.join('; ') || '(all near typical)'}`].join('\n');
}

const SYSTEM = 'You are a careful, blind evaluator of teaching material. You never guess who or what wrote a text. Reply with one JSON object only, no prose.';
function judgePrompt(p1, q1, ctx, v1, v2) {
  return `Two versions, 1 and 2, of the same lesson level of a learning app (teaching text and graded check questions on one topic) were written for two different learners, P and Q. Judge using only the text.

LEARNER P
${p1}

LEARNER Q
${q1}

THE LEVEL'S TOPIC (both versions must teach this objective correctly):
${ctx}

VERSION 1:
<<<
${v1}
>>>

VERSION 2:
<<<
${v2}
>>>

Answer:
- "P_best": "1" | "2" | "either": the version better suited to learner P (wording, length, worked steps, hints, tone, examples, interests, avoiding dislikes, past difficulties). "either" only if you cannot tell them apart for P.
- "Q_best": the same for learner Q.
- "fit_P": {"1": 1-5, "2": 1-5} how well each version fits P. "fit_Q": the same for Q.
- "interest": for EACH version: {"uses": "P" | "Q" | "both" | "neither" (whose interests or hobbies it draws examples from), "natural": 0-3 (0 = no interest used; 1 = forced or shoehorned, the topic is bent or the example distracts; 2 = acceptable; 3 = natural and it genuinely helps explain), "forced": ["short quote of any forced use"], "dislike_hit": true if it uses something the learner it seems aimed at dislikes}.
- "accuracy": {"1": 0-10, "2": 0-10} (10 = no false or distorted statement), "errors": ["any false statement, with the version number"].
- "same_objective": true if both versions teach the same objective of the topic, false if either drifted to a different one; "objective_note": short.

Return JSON: {"P_best":..., "Q_best":..., "fit_P":{...}, "fit_Q":{...}, "interest":{"1":{...},"2":{...}}, "accuracy":{...}, "errors":[...], "same_objective":true|false, "objective_note":"..."}`;
}

async function tailor(arg) {
  Object.assign(process.env, { NODE_ENV: 'test', PERSONALIZE_HOLDOUT: '0', PERSONALIZE_EXPERIMENT_RATE: '0', LEVEL_SELF_CHECK: 'off', KEY_GATE: 'off', BLOCK_ADAPT: 'on' });
  const P = require('../material-sensitivity-proof'); // eslint-disable-line global-require
  const { base, installWriter, JUDGES, cache, sha, limited, usage } = P;
  const curriculum = require('../../config/curriculum'); const blockLevels = require('../../services/block-levels'); const adaptLib = require('../../services/block-adapt'); const { BY_ID } = require('../../services/scorecard/stats'); // eslint-disable-line global-require
  installWriter();
  const seed = Number(arg('seed', 515151)); const n = Number(arg('n', 48)); const plantEvery = Number(arg('plant-every', 6)); const conc = Number(arg('concurrency', 4));
  const judge = JUDGES[0]; if (!judge) throw new Error('no judge');
  const renderPlan = (plan) => {
    const lib = blockLevels.library();
    const out = [`THE LEVEL: ${plan.blocks.length} blocks, ${plan.checks.length} graded checks.`];
    for (const b of plan.blocks) out.push(`BLOCK ${b.index + 1} (${(lib[b.block] || {}).name || b.block}): ${adaptLib.textOf(b.data).join(' | ')}`);
    for (const c of plan.checks) out.push(`CHECK ${c.id} (${c.format}): ${c.prompt}${(c.choices || []).length ? ` Choices: ${c.choices.join(' / ')}.` : ''} Hint: ${c.hint || '(none)'} Explanation: ${c.rationale || '(none)'}`);
    return out.join('\n');
  };
  const pickCell = (subject, i) => {
    const list = CELLS[subject];
    for (let k = 0; k < list.length; k++) {
      const [g, lv0] = list[(i + k) % list.length];
      // the first level at or after lv0 that the block writer writes (kindFor: a lesson or a retention level, not a practice, checkpoint or graduation level) and whose topic is teaching, not a game
      for (let lv = lv0; lv < lv0 + 10; lv++) {
        try {
          if (!['lesson', 'retention'].includes(blockLevels.kindFor(curriculum.getGrade(subject, g), lv))) continue;
          const ctx = blockLevels.levelContext(subject, g, lv).text; const topic = (ctx.split('\n').find((l) => l.startsWith('TOPIC:')) || '');
          if (!/Activity \d+ of|quiz\/game|checkpoint/i.test(topic)) return { trackId: subject, gradeId: g, level: lv, ctx };
        } catch { /* next */ }
      }
    }
    return null;
  };
  const written = new Map();
  async function levelFor(L, cell, subject) {
    const ck = `xl:${sha(JSON.stringify([L.id, L.traits, cell.gradeId, cell.level, P.WRITER]))}`;
    const hit = cache.get(ck); if (hit && hit.text) return hit;
    if (written.has(ck)) return written.get(ck);
    const task = (async () => {
      try {
        const user = base.makeUser({ name: L.id.replace(/[^a-z0-9]/gi, ''), age: L.age, survey: surveyFor(L, subject), stats: L.traits, esl: L.ell });
        const plan = await blockLevels.write({ userId: user.id, trackId: cell.trackId, gradeId: cell.gradeId, level: cell.level, tailored: true });
        if (!plan || !plan.blocks) return { error: `no level written for ${L.id}` };
        const a = { text: renderPlan(plan) }; cache.set(ck, a); return a;
      } catch (e) { return { error: `${L.id}: ${e.message}` }; }
    })();
    written.set(ck, task); return task;
  }
  const topicOf = (cell) => { const t = cell.ctx.split('\n'); return `${t.find((l) => l.startsWith('SUBJECT:')) || ''}\n${(t.find((l) => l.startsWith('GRADE:')) || '').slice(0, 120)}\n${t.find((l) => l.startsWith('TOPIC:')) || ''}\n${t.find((l) => l.startsWith('TOPIC GENERALIZATION')) || ''}`; };
  // A reasoning judge (GLM-5.3) spends part of its token budget thinking; the shared judge call caps at 6000 and answered "no text" on these long pairs, so Lyceum is called here with a larger cap.
  const judgeMax = Number(arg('judge-max', 24000));
  async function callJudge(system, prompt) {
    if (!/^lyc_/.test(String(arg('judges', '')).split(',')[0])) return judge.call(system, prompt);
    process.env.LYCEUM_PIPELINE = '1';
    process.env.LYCEUM_LEDGER_FILE = process.env.LYCEUM_LEDGER_FILE || 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/lyceum-ledger.json';
    const { lyceum } = require('../../services/providers/lyceum'); // eslint-disable-line global-require
    const r = await P.gated(() => lyceum.chat({ task: 'extreme-tailor-judge', system, messages: [{ role: 'user', content: prompt }], maxTokens: judgeMax, model: judge.id, timeoutMs: 420000 }));
    usage.judgeTokens[judge.id] = (usage.judgeTokens[judge.id] || 0) + (r.usage.input_tokens || 0) + (r.usage.output_tokens || 0);
    return r.text;
  }
  async function judgePair(prompt) {
    const k = `xj:${judge.id}:${sha(prompt)}`; const hit = cache.get(k); if (hit) return hit;
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callJudge(SYSTEM, prompt); // eslint-disable-line no-await-in-loop
        usage.judgeCalls[judge.id] = (usage.judgeCalls[judge.id] || 0) + 1;
        const m = String(text).match(/\{[\s\S]*\}/); const v = m ? JSON.parse(m[0]) : null;
        if (v && v.P_best && v.Q_best && v.fit_P && v.interest) { cache.set(k, v); return v; }
        last = new Error(`unusable verdict: ${String(text).slice(0, 120)}`);
      } catch (e) { last = e; }
    }
    return { error: String(last && last.message).slice(0, 160) };
  }

  const targets = X.generate(seed, n);
  const recs = [];
  // --only 9,13,15: only these learner indexes (a retry of the pairs that failed, e.g. with another writer; their writer, judge and pair keys are cached separately)
  const only = arg('only') ? new Set(String(arg('only')).split(',').map(Number)) : null;
  await limited(targets.map((L, i) => ({ L, i })).filter(({ i }) => !only || only.has(i)), conc, async ({ L, i }) => {
    const subject = SUBJECTS[i % SUBJECTS.length];
    const cell = pickCell(subject, i + Math.floor(i / SUBJECTS.length));
    const rec = { learner: L.id, kind: L.kind, mix: L.mixLabel, age: L.age, ell: L.ell, subject, hobbies: L.hobbies, dislikes: L.dislikes, difficulties: L.difficulties };
    if (!cell) { rec.result = 'no teaching level found'; recs.push(rec); return; }
    rec.level = `${cell.gradeId} L${cell.level}`;
    const Q = mirrorOf(L); rec.mirror = { id: Q.id, age: Q.age, hobbies: Q.hobbies, dislikes: Q.dislikes };
    const [aP, aQ] = await Promise.all([levelFor(L, cell, subject), levelFor(Q, cell, subject)]);
    if (aP.error || aQ.error) { rec.result = `build failed: ${aP.error || aQ.error}`; recs.push(rec); return; }
    const planted = plantEvery > 0 && i % plantEvery === plantEvery - 1; rec.planted = planted;
    // vL / vM: the text SHOWN as written for the target / the mirror (swapped on a planted pair)
    const vL = planted ? aQ : aP; const vM = planted ? aP : aQ;
    const flip = parseInt(sha(`${L.id}|${subject}|v`).slice(0, 2), 16) % 2 === 1; // the target's text gets version 2 when true
    const v1 = flip ? vM : vL; const v2 = flip ? vL : vM;
    const numL = flip ? '2' : '1'; const numM = flip ? '1' : '2';
    const swap = parseInt(sha(`${L.id}|pq`).slice(0, 2), 16) % 2 === 1; // the mirror is shown as "P"
    const shown = swap ? { P: Q, Q: L } : { P: L, Q };
    const numFor = (who) => (who === L ? numL : numM);
    const truthP = numFor(shown.P); const truthQ = numFor(shown.Q);
    const v = await judgePair(judgePrompt(profileText(shown.P, BY_ID), profileText(shown.Q, BY_ID), topicOf(cell), v1.text, v2.text));
    if (v.error) { rec.result = `judge failed: ${v.error}`; recs.push(rec); return; }
    // fit = how many of the two learners the judge matched to the version SHOWN as theirs (on a planted pair that is the wrong text, so a high fit means the judge was fooled)
    const hitP = v.P_best === truthP ? 1 : 0; const hitQ = v.Q_best === truthQ ? 1 : 0;
    const tgtIsP = shown.P === L; const fitTarget = tgtIsP ? v.fit_P : v.fit_Q; const interest = v.interest[numL] || {};
    const uses = interest.uses;
    Object.assign(rec, {
      verdict: { P_best: v.P_best, Q_best: v.Q_best, truthP, truthQ, targetIsP: tgtIsP }, fit: hitP + hitQ, target_pick_ok: tgtIsP ? hitP : hitQ,
      target_fit_score: Number(fitTarget[numL]), target_fit_other: Number(fitTarget[numM]),
      interest, interest_uses_own: uses === 'both' || (uses === 'P' && tgtIsP) || (uses === 'Q' && !tgtIsP),
      accuracy: Math.min(Number(v.accuracy && v.accuracy['1']), Number(v.accuracy && v.accuracy['2'])), errors: v.errors || [], same_objective: v.same_objective !== false, objective_note: v.objective_note || '',
    });
    recs.push(rec); process.stdout.write(`\r${recs.length}/${n} pairs`);
  });
  process.stdout.write('\n');
  recs.sort((a, b) => a.learner.localeCompare(b.learner, undefined, { numeric: true }));
  const out = { label: 'AI-judged (GLM-5.3, blind) on SIMULATED learners; not real-learner proof', writer: P.WRITER, judge: judge.id, seed, n, plant_every: plantEvery, generated_at: new Date().toISOString(), usage, recs };
  const file = arg('json', 'docs/extreme-learners/tailor.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  if (cache.flush) cache.flush();
  console.log(tailorSummary(out));
}

function tailorSummary(out) {
  const ok = out.recs.filter((r) => !r.result);
  const real = ok.filter((r) => !r.planted); const pl = ok.filter((r) => r.planted);
  const lines = [`built and judged ${ok.length} of ${out.recs.length} pairs (${pl.length} planted swaps).`];
  if (pl.length) lines.push(`planted swaps: judge agreed with the planted (wrong) assignment on both learners in ${pl.filter((r) => r.fit === 2).length}/${pl.length} (fooled), contradicted it on both in ${pl.filter((r) => r.fit === 0).length}/${pl.length} (caught), mixed ${pl.filter((r) => r.fit === 1).length}.`);
  lines.push(`real pairs: both learners matched to their own version ${real.filter((r) => r.fit === 2).length}/${real.length}; the target matched ${real.filter((r) => r.target_pick_ok).length}/${real.length}; mean fit (1-5) of the version written for the target ${f1(mean(real.map((r) => r.target_fit_score)))} vs the contrasting one ${f1(mean(real.map((r) => r.target_fit_other)))}.`);
  const withInt = real.filter((r) => r.hobbies.length);
  lines.push(`interest use (${withInt.length} learners with interests): own interests used naturally (>=2) ${withInt.filter((r) => r.interest_uses_own && Number(r.interest.natural) >= 2).length}; forced (1) ${withInt.filter((r) => r.interest_uses_own && Number(r.interest.natural) === 1).length}; not used ${withInt.filter((r) => !r.interest_uses_own).length}.`);
  // The scorecard's own Interest transfer measure says whether wrapping content in interests helps this learner: at 30 or below the writer is told it does not, so leaving the interests out is right.
  const it = (r) => { const [, s, i] = /^x(\d+)-(\d+)$/.exec(r.learner); return X.learner(Number(s), Number(i)).traits.interest_transfer; };
  const wants = withInt.filter((r) => it(r) > 30); const declines = withInt.filter((r) => it(r) <= 30);
  lines.push(`interest use where the scorecard says interests help (interest_transfer > 30, ${wants.length} learners): natural ${wants.filter((r) => r.interest_uses_own && Number(r.interest.natural) >= 2).length}, forced ${wants.filter((r) => r.interest_uses_own && Number(r.interest.natural) === 1).length}, not used ${wants.filter((r) => !r.interest_uses_own).length}; where it says they do not (<= 30, ${declines.length} learners): used naturally ${declines.filter((r) => r.interest_uses_own && Number(r.interest.natural) >= 2).length}, not used ${declines.filter((r) => !r.interest_uses_own).length}.`);
  lines.push(`content: accuracy mean ${f1(mean(real.map((r) => r.accuracy)))}, min ${f1(Math.min(...real.map((r) => r.accuracy)))}; objective drifted in ${real.filter((r) => !r.same_objective).length}/${real.length}.`);
  return lines.join('\n');
}

/** Merge run files (a later file replaces an earlier record of the same learner only when the earlier one failed); returns { recs } for tailorSummary. */
function mergeRuns(filesList) {
  const by = new Map();
  for (const f of filesList) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const r of j.recs) { const key = `${r.learner}|${r.planted ? "p" : "r"}`; const old = by.get(key); if (!old || old.result) by.set(key, r); }
  }
  return { recs: [...by.values()].sort((a, b) => a.learner.localeCompare(b.learner, undefined, { numeric: true })) };
}
/** One row per individual: how well the version written for them fit them (judge matched both learners to their own text = 2). */
function tailorTable(out) {
  const rows = ['| learner | kind | subject, level | planted | fit (0-2) | fit score own vs other | own interests, natural 0-3 | accuracy | same objective |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of out.recs) {
    if (r.result) { rows.push(`| ${r.learner} | ${r.kind} | ${r.subject} | ${r.planted ? 'yes' : ''} | not judged: ${r.result.slice(0, 50)} | | | | |`); continue; }
    rows.push(`| ${r.learner} | ${r.kind}${r.mix ? ` (${r.mix})` : ''}, ${r.age}${r.ell ? ', ELL' : ''} | ${r.subject}, ${r.level} | ${r.planted ? 'yes (swapped)' : ''} | ${r.fit} | ${r.target_fit_score} vs ${r.target_fit_other} | ${r.hobbies.length ? `${r.interest_uses_own ? 'yes' : 'no'}, ${r.interest.natural}` : 'none given'} | ${r.accuracy} | ${r.same_objective ? 'yes' : 'NO'} |`);
  }
  return rows.join('\n');
}

module.exports = { tailor, tailorSummary, mergeRuns, tailorTable, mirrorOf, profileText, surveyFor, CELLS, SUBJECTS };
