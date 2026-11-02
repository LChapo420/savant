/**
 * Per-measure counterfactual proof on BUILT-IN block levels: does each scorecard measure change the level a learner is given, in the right
 * direction, without losing the topic? Math, English, IQ and Spanish, one level each. AI-judged on simulated learners, not real-learner proof.
 *
 *   node scripts/block-sensitivity-proof.js --live --adapter off --tag blk-off --cache FILE --subjects math,english,iq,spanish
 *   node scripts/block-sensitivity-proof.js --live --adapter on  --tag blk-on  --cache FILE
 *   node scripts/block-sensitivity-proof.js --live --adapter on  --tag blk-on-plant --plant swap --replay docs/block-depth/blk-on.json
 *   node scripts/block-sensitivity-proof.js --render docs/block-depth/blk-off.json,docs/block-depth/blk-on.json
 *
 * Method: the same as scripts/material-sensitivity-proof.js (its writer, judges, cache and joint profiles are reused, not copied). A base
 * learner (age 14, interests basketball and video games, dislikes spiders) is copied: one copy has ONE measure LOW (10), the other HIGH (90);
 * both get the level written by the app's REAL block writer (services/block-levels.js write: layout call, fill-out call, the adapter's check
 * and one revision when --adapter on). A blind judge sees the two renderings in random order with the measure's definition and the level's
 * topic and says which one was written for the HIGH learner (or "same"). Joint profiles J1-J4 move four measures at once against the mirror
 * profile. --adapter off is the writer as it was before services/block-adapt.js (BLOCK_ADAPT=off), so before and after use the same
 * writer, judges, levels and learners. The owner-base rule, holdouts and per-level experiments are off (the arm must not differ by chance).
 *
 * Share of measures followed = judge verdicts that name the HIGH learner's version, over all verdicts, per subject.
 */
process.env.NODE_ENV = 'test';
process.env.PERSONALIZE_HOLDOUT = '0';
process.env.PERSONALIZE_EXPERIMENT_RATE = '0';
process.env.LEVEL_SELF_CHECK = 'off';
process.env.KEY_GATE = 'off';
const fs = require('fs');
const path = require('path');
const argv0 = process.argv.slice(2);
const flagVal = (n, d = null) => { const eq = argv0.find((a) => a.startsWith(`--${n}=`)); if (eq) return eq.slice(n.length + 3); const i = argv0.indexOf(`--${n}`); return i >= 0 && argv0[i + 1] && !argv0[i + 1].startsWith('--') ? argv0[i + 1] : d; };
const ADAPTER = flagVal('adapter', 'on') === 'off' ? 'off' : 'on';
process.env.BLOCK_ADAPT = ADAPTER;

if (flagVal('render')) {
  renderReport();
  return;
}

const P = require('./material-sensitivity-proof');
const {
  arg, base, ls, usage, installWriter, judgeOnce, JUDGES, JOINT, LO, HI, userFor, measureLine, PLANT, REPLAY, CONCURRENCY, REP, LIVE, cache, sha, limited, BY_ID,
} = P;
const { db } = base;
const blockLevels = require('../services/block-levels');
const adaptLib = require('../services/block-adapt');
const curriculum = require('../config/curriculum');

const TAG = arg('tag', `blk-${ADAPTER}`);
const OUT_JSON = arg('json', path.join(__dirname, '..', 'docs', 'block-depth', `${TAG}.json`));
// One level per subject: a topic where wording, length, worked steps and interests have something to act on.
const LEVELS = {
  math: { trackId: 'math', gradeId: 'algebra_1_part_a', level: 30 },
  english: { trackId: 'english', gradeId: 'proficient', level: 40 },
  iq: { trackId: 'iq', gradeId: 'abstract_reasoning', level: 20 },
  spanish: { trackId: 'spanish', gradeId: 'spanish_grade_04_time_food_shopping_and_core_verbs', level: 8 },
};
const SUBJECTS = (arg('subjects', 'math,english,iq,spanish')).split(',').filter((s) => LEVELS[s]);
// The measures a block level can show: length, wording, interests, worked steps, hints, explanation detail.
const SINGLE = (arg('measures', 'brevity_preference,vocabulary_ceiling,interest_transfer,worked_example_dependence,feedback_granularity')).split(',').filter(Boolean);
const BASE_SURVEY = { interests: 'basketball, video games', hobbies: 'drawing comics', dislikes: 'spiders' };

// ── the level, as a judge reads it ──────────────────────────────────────────
function renderPlan(plan) {
  const lib = blockLevels.library();
  const out = [`THE LEVEL: ${plan.blocks.length} blocks, ${plan.checks.length} graded checks (${plan.checks.filter((c) => c.format === 'type_in').length} typed, ${plan.checks.filter((c) => c.format !== 'type_in').length} multiple choice).`];
  for (const b of plan.blocks) {
    const t = adaptLib.textOf(b.data).join(' | ');
    out.push(`BLOCK ${b.index + 1} (${(lib[b.block] || {}).name || b.block}; ${b.purpose || ''}): ${t}`);
  }
  for (const c of plan.checks) {
    out.push(`CHECK ${c.id}${c.after >= 0 ? ` after block ${c.after + 1}` : ''} (${c.format}): ${c.prompt}${(c.choices || []).length ? ` Choices: ${c.choices.join(' / ')}.` : ''} Hint: ${c.hint || '(none)'} Explanation: ${c.rationale || '(none)'}`);
  }
  return out.join('\n');
}
function codeMeasure(plan, spec) {
  const teach = plan.blocks.flatMap((b) => adaptLib.textOf(b.data));
  const words = adaptLib.wordCount(teach);
  const all = `${teach.join(' ')} ${plan.checks.map((c) => `${c.prompt} ${c.rationale}`).join(' ')}`;
  const cov = ls.checkFollowed(all, null, { keyFacts: plan.coverage || [] }).stats;
  const domains = ['basketball', 'video game', 'game'];
  return {
    words, blocks: plan.blocks.length, checks: plan.checks.length, typed: plan.checks.filter((c) => c.format === 'type_in').length,
    hints: plan.checks.filter((c) => (c.hint || '').trim()).length, rationaleWords: Math.round(adaptLib.wordCount(plan.checks.map((c) => c.rationale || '')) / Math.max(1, plan.checks.length)),
    interestUses: domains.reduce((n, d) => n + (all.toLowerCase().split(d).length - 1), 0), spider: /spider/i.test(all), coverageMissing: cov ? cov.keyFactsMissing : null,
    revised: !!(plan.spec_check && plan.spec_check.revised),
  };
}

const writes = new Map();
async function levelFor(subject, user, label) {
  const cfg = LEVELS[subject];
  const stats = user.__stats || {};
  const ck = `blk:${ADAPTER}:${subject}:${sha(JSON.stringify([stats, REP, cfg]))}`;
  const hit = LIVE ? cache.get(ck) : null;
  if (hit && hit.text) return { ...hit, cached: true };
  // BLOCK_PROOF_CACHE_ONLY=1: judge what has been written, write nothing more (a level that is not cached counts as not built).
  if (process.env.BLOCK_PROOF_CACHE_ONLY === '1') return { error: `not written yet (${label})` };
  if (writes.has(ck)) return writes.get(ck);
  const task = (async () => {
    try {
      const plan = await blockLevels.write({ userId: user.id, trackId: cfg.trackId, gradeId: cfg.gradeId, level: cfg.level, tailored: true });
      if (!plan || !plan.blocks) return { error: `no level written (${label})` };
      const a = { text: renderPlan(plan), code: codeMeasure(plan), revised: !!(plan.spec_check && plan.spec_check.revised), open: (plan.spec_check && plan.spec_check.open) || [] };
      if (LIVE) cache.set(ck, a);
      return a;
    } catch (e) { return { error: `${label}: ${e.message}` }; }
  })();
  writes.set(ck, task);
  return task;
}
const users = new Map();
function profileUser(name, stats) {
  if (!users.has(name)) {
    const u = base.makeUser({ name, age: 14, survey: BASE_SURVEY, stats, blurb: name });
    u.__stats = stats;
    users.set(name, u);
  }
  return users.get(name);
}

// ── the judge ───────────────────────────────────────────────────────────────
const topicOf = (subject) => {
  const cfg = LEVELS[subject];
  const text = blockLevels.levelContext(cfg.trackId, cfg.gradeId, cfg.level).text.split('\n');
  return `${text.find((l) => l.startsWith('SUBJECT:'))}\n${text.find((l) => l.startsWith('GRADE:')).slice(0, 120)}\n${text.find((l) => l.startsWith('TOPIC:'))}\n${text.find((l) => l.startsWith('TOPIC GENERALIZATION'))}`;
};
function pairPrompt(subject, measures, A, B, others) {
  const one = measures.length === 1;
  const hasOthers = !!(others && others.length);
  const ask = one
    ? `First, in one sentence, say how the two versions differ in ways this measure would explain. Then say which learner each version suits better: "LOW", "HIGH", or "EITHER" if the versions do not differ in a way this measure explains.${hasOthers ? ' The two learners ALSO differ on the other measures listed above, so a difference that one of THOSE explains (and this measure does not) is not evidence about this measure: answer "EITHER" if that is all you can see.' : ''}`
    : '';
  const shape = '"evidence": "one sentence: the difference in the text", "A_suits": "LOW" | "HIGH" | "EITHER", "B_suits": "LOW" | "HIGH" | "EITHER", "certainty": 1-5';
  return `Two versions, A and B, of the same built-in lesson level of a learning app (blocks of teaching text and graded check questions on one topic) were written for two learners who ${hasOthers ? `differ on ${others.length + 1} learning measures at once; judge the ONE below` : 'are the same in every way except ONE learning measure: one learner is LOW on it and the other HIGH'}.

THE MEASURE${hasOthers ? ' TO JUDGE' : ''}:
${measures.map((m) => measureLine(m)).join('\n')}
${hasOthers ? `\nTHE OTHER MEASURES the two learners also differ on (do not judge these; they only explain differences that are not this measure's):\n${others.map((m) => `- ${measureLine(m)}`).join('\n')}\n` : ''}
THE LEVEL'S TOPIC (what both versions must teach, correctly):
${topicOf(subject)}

VERSION A:
<<<
${A}
>>>

VERSION B:
<<<
${B}
>>>

${ask}
Then check EACH version against what is known about the topic: its accuracy (10 = no false or distorted statement; list any false statement).

Return this JSON: { ${shape}, "A": {"accuracy": 0-10, "errors": ["..."], "missing": []}, "B": {"accuracy": 0-10, "errors": ["..."], "missing": []} }`;
}

/** hiOf[m] says which of the two ('X' or 'Y') is the HIGH learner's for measure m. One judge call per measure per judge. */
async function judgePair(subject, measures, hiOf, artX, artY) {
  const flip = parseInt(sha(`${subject}|${measures.join(',')}|${TAG}`).slice(0, 2), 16) % 2 === 1;
  const A = flip ? artY : artX; const B = flip ? artX : artY;
  const truth = Object.fromEntries(measures.map((m) => [m, (hiOf[m] === 'X') !== flip ? 'A' : 'B']));
  return Promise.all(JUDGES.map(async (j) => {
    const parts = await Promise.all(measures.map((m) => judgeOnce(j, pairPrompt(subject, [m], A.text, B.text, measures.filter((x) => x !== m)), [m])));
    const bad = parts.find((p) => p.error);
    if (bad) return { judge: j.id, error: bad.error };
    const pick = Object.fromEntries(measures.map((m, i) => [m, parts[i].picks[m]]));
    const back = (s) => (s === 'A' ? (flip ? 'Y' : 'X') : s === 'B' ? (flip ? 'X' : 'Y') : 'same');
    return {
      judge: j.id, family: j.family, picks: Object.fromEntries(measures.map((m) => [m, back(pick[m])])),
      correct: Object.fromEntries(measures.map((m) => [m, pick[m] === truth[m]])), same: Object.fromEntries(measures.map((m) => [m, pick[m] === 'same'])),
      accuracy: Math.min(...parts.flatMap((p) => [p.A.accuracy, p.B.accuracy])),
    };
  }));
}

// ── the phases ──────────────────────────────────────────────────────────────
async function runSingle() {
  const recs = [];
  const tasks = [];
  for (const subject of SUBJECTS) for (const m of SINGLE) tasks.push({ subject, m });
  await limited(tasks, CONCURRENCY, async ({ subject, m }) => {
    const uLo = profileUser(`${subject}-${m}-lo`, { [m]: LO }); const uHi = profileUser(`${subject}-${m}-hi`, { [m]: HI });
    const rec = { subject, measure: m, group: BY_ID[m].category };
    const [aLo, aHi] = await Promise.all([levelFor(subject, uLo, `${m} low`), levelFor(subject, uHi, `${m} high`)]);
    if (aLo.error || aHi.error) { rec.result = `build failed: ${aLo.error || aHi.error}`; recs.push(rec); return; }
    rec.code = { lo: aLo.code, hi: aHi.code }; rec.revised = { lo: aLo.revised, hi: aHi.revised };
    rec.verdicts = await judgePair(subject, [m], { [m]: 'Y' }, aLo, aHi);
    rec.texts = { lo: aLo.text, hi: aHi.text };
    recs.push(rec);
    process.stdout.write(`\r${recs.length}/${tasks.length} single pairs`);
  });
  process.stdout.write('\n');
  return recs;
}
async function runJoint() {
  const recs = [];
  const only = arg('profiles') ? arg('profiles').split(',') : null;
  const tasks = [];
  for (const subject of SUBJECTS) for (const p of JOINT) if (!only || only.includes(p.id)) tasks.push({ subject, p });
  const replay = REPLAY || null;
  await limited(tasks, CONCURRENCY, async ({ subject, p }) => {
    const stats = Object.fromEntries(Object.entries(p.set).map(([m, h]) => [m, h ? HI : LO]));
    const mirror = Object.fromEntries(Object.entries(p.set).map(([m, h]) => [m, h ? LO : HI]));
    const measures = Object.keys(p.set);
    const rec = { subject, profile: p.id, set: p.set };
    const old = replay ? replay.find((x) => x.subject === subject && x.profile === p.id) : null;
    let [aP, aM] = old ? [{ text: old.texts.profile }, { text: old.texts.mirror }] : await Promise.all([levelFor(subject, profileUser(`${subject}-${p.id}-profile`, stats), `${p.id} profile`), levelFor(subject, profileUser(`${subject}-${p.id}-mirror`, mirror), `${p.id} mirror`)]);
    if (aP.error || aM.error) { rec.result = `build failed: ${aP.error || aM.error}`; recs.push(rec); return; }
    if (PLANT) { const keep = aP; aP = aM; aM = keep; rec.plant = PLANT; }
    const hiOf = Object.fromEntries(measures.map((m) => [m, p.set[m] ? 'X' : 'Y']));
    rec.code = { profile: aP.code || null, mirror: aM.code || null };
    rec.verdicts = await judgePair(subject, measures, hiOf, aP, aM);
    rec.texts = { profile: aP.text, mirror: aM.text };
    recs.push(rec);
    process.stdout.write(`\r${recs.length}/${tasks.length} joint pairs`);
  });
  process.stdout.write('\n');
  return recs;
}

function tally(recs, joint) {
  const bySubject = {};
  for (const r of recs) {
    const s = (bySubject[r.subject] = bySubject[r.subject] || { verdicts: 0, correct: 0, same: 0, failed: 0, pairs: 0 });
    s.pairs += 1;
    if (r.result) { s.failed += 1; continue; }
    const ms = joint ? Object.keys(r.set) : [r.measure];
    for (const v of (r.verdicts || []).filter((x) => !x.error)) for (const m of ms) { s.verdicts += 1; if (v.correct[m]) s.correct += 1; else if (v.same[m]) s.same += 1; }
  }
  return bySubject;
}
const sumOf = (t) => Object.values(t).reduce((a, s) => ({ verdicts: a.verdicts + s.verdicts, correct: a.correct + s.correct, same: a.same + s.same }), { verdicts: 0, correct: 0, same: 0 });

async function main() {
  const t0 = Date.now();
  installWriter();
  const out = { tag: TAG, adapter: ADAPTER, generated_at: new Date().toISOString(), writer: P.WRITER_MODEL, judges: JUDGES.map((j) => j.id), subjects: SUBJECTS, levels: LEVELS, single_measures: SINGLE, plant: PLANT || null, label: 'AI-judged on simulated learners; not real-learner proof' };
  const phase = arg('phase', 'both');
  if (phase === 'single' || phase === 'both') { const recs = await runSingle(); out.single = { bySubject: tally(recs, false), recs: recs.map((r) => ({ ...r, texts: undefined })), texts: recs.map((r) => ({ subject: r.subject, measure: r.measure, texts: r.texts })) }; }
  if (phase === 'joint' || phase === 'both') { const recs = await runJoint(); out.joint = { bySubject: tally(recs, true), recs: recs.map((r) => ({ ...r, texts: undefined })) }; out.jointTexts = recs.map((r) => ({ subject: r.subject, profile: r.profile, texts: r.texts })); }
  if (cache.flush) cache.flush();
  out.usage = { ...usage, seconds: Math.round((Date.now() - t0) / 1000) };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));
  console.log(`wrote ${OUT_JSON}`);
  for (const k of ['single', 'joint']) if (out[k]) { const s = sumOf(out[k].bySubject); console.log(`${k} (${ADAPTER}): ${s.correct}/${s.verdicts} direction-correct, ${s.same} same; ${Object.entries(out[k].bySubject).map(([n, v]) => `${n} ${v.correct}/${v.verdicts}`).join(', ')}`); }
  if (PLANT && out.joint) { const s = sumOf(out.joint.bySubject); console.log(`planted ${PLANT}: caught ${s.verdicts - s.correct - s.same}/${s.verdicts}, fooled ${s.correct}, could not tell ${s.same}`); }
  console.log(`writer calls ${usage.writerCalls} (${usage.writerIn} in, ${usage.writerOut} out); judge calls ${JSON.stringify(usage.judgeCalls)}; errors ${JSON.stringify(usage.errors)}; ${out.usage.seconds}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });

// ── the report: --render off.json,on.json ──────────────────────────────────
function renderReport() {
  const files = flagVal('render').split(',').filter(Boolean);
  // Files of one adapter setting (a single-measure run and a joint run) are merged into one column.
  const runs = [];
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    const same = runs.find((x) => x.adapter === r.adapter);
    if (!same) { runs.push({ ...r, tag: r.tag }); continue; }
    for (const k of ['single', 'joint']) if (r[k]) same[k] = same[k] ? { ...same[k], bySubject: { ...same[k].bySubject, ...r[k].bySubject } } : r[k];
    same.subjects = [...new Set([...same.subjects, ...r.subjects])];
    same.tag = `${same.tag}+${r.tag}`;
  }
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
  const subjects = [...new Set(runs.flatMap((r) => r.subjects))];
  const lines = ['| subject | phase | ' + runs.map((r) => `adapter ${r.adapter} (${r.tag})`).join(' | ') + ' |', `|---|---|${runs.map(() => '---').join('|')}|`];
  for (const s of subjects) {
    for (const k of ['single', 'joint']) {
      lines.push(`| ${s} | ${k} | ${runs.map((r) => { const v = r[k] && r[k].bySubject[s]; return v ? `${v.correct}/${v.verdicts} (${pct(v.correct, v.verdicts)})${v.failed ? `, ${v.failed} failed` : ''}` : 'n/a'; }).join(' | ')} |`);
    }
  }
  for (const k of ['single', 'joint']) {
    lines.push(`| all | ${k} | ${runs.map((r) => { if (!r[k]) return 'n/a'; const t = Object.values(r[k].bySubject).reduce((a, v) => ({ c: a.c + v.correct, n: a.n + v.verdicts }), { c: 0, n: 0 }); return `${t.c}/${t.n} (${pct(t.c, t.n)})`; }).join(' | ')} |`);
  }
  console.log(lines.join('\n'));
}
