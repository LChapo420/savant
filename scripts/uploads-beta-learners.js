/**
 * The UPLOAD_FOLLOW gate again, on the new path (AI-JUDGED, SIMULATED; never a real learner; extreme and random learners from new held-out seeds, per-individual results).
 * One course is built for each learner as the beta would (their spec reaches the writer), then judged twice: as stored ("base", what rounds 3 and 4 called today) and as served by services/material-parts.js with their spec
 * (goal's reading, shaping, and each lesson and practice question rewritten for them). Same judges and same prompt as rounds 3 and 4: C = Coral DeepSeek, N = NVIDIA nemotron (free). Builder and writer: ZeroGPU GLM 5.3 Flash; readers Gonka DeepSeek and GLM.
 *
 *   node scripts/uploads-beta-learners.js run <n> <seed>     (rows: <OUT_DIR>/learners/<seed>.json, resumes)
 *   node scripts/uploads-beta-learners.js report
 */
const fs = require('fs'); const path = require('path');
const L = require('./lib/uploads-beta-lib');

L.setup('learners');
process.env.UPLOAD_PARTS = 'on'; process.env.UPLOAD_PARTS_FOLLOW = 'on'; process.env.UPLOAD_OPTIMIZE = 'on'; process.env.UPLOAD_GOALS = 'on'; process.env.UPLOAD_AUTOBUILD = 'off'; process.env.FACT_CHECK_ALL = '0';
const db = require('../config/db');
const materials = require('../services/materials');
const K = require('../services/material-keypoints');
const cb = require('../services/course-builder');
const P = require('../services/material-parts');
const J = require('./lib/invented-judges');
const study = require('../services/material-study');

const DIR = path.join(L.OUT_DIR, 'learners');
fs.mkdirSync(DIR, { recursive: true });
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const TRAITS = {
  brevity_preference: ['wants the shortest version', 'wants it long and full'],
  vocabulary_ceiling: ['needs very plain words', 'reads advanced vocabulary easily'],
  attention_runway: ['loses focus fast: tiny chunks', 'holds focus a long time'],
  evaluation_anxiety: ['very anxious when tested: no test language, low stakes', 'not anxious when tested'],
  worked_example_dependence: ['needs a worked example for everything', 'wants to work it out alone'],
  challenge_appetite: ['wants hard stretch questions', 'wants gentle easy questions'],
  interest_transfer: ['learns far better through their interests', 'ignores interests'],
  text_density_tolerance: ['cannot take dense text', 'likes dense text'],
};
const INTERESTS = ['falconry', 'K-pop dance', 'tractor repair', 'speedrunning Zelda', 'ballet', 'competitive baking', 'birdwatching', 'skateboarding', 'chess openings', 'beekeeping', 'drone racing', 'knitting', 'crypto trading', 'marching band', 'pottery'];
const DISLIKES = ['sports', 'spiders', 'maths puzzles', 'cooking', 'war'];
function randomLearner(seed, i) {
  const r = rng(seed * 1000 + i); const pick = (a) => a[Math.floor(r() * a.length)];
  const stats = {}; const spoken = [];
  for (const [id, [hi, lo]] of Object.entries(TRAITS)) {
    if (r() < 0.45) continue;
    const high = r() < 0.5; stats[id] = high ? 90 + Math.floor(r() * 9) : 2 + Math.floor(r() * 9);
    spoken.push(high ? hi : lo);
  }
  const interests = [pick(INTERESTS), pick(INTERESTS)].filter((x, k, a) => a.indexOf(x) === k);
  const dislike = r() < 0.5 ? pick(DISLIKES) : null;
  const testDate = (i % 2 === 0 || r() < 0.2) ? new Date(Date.now() + (3 + Math.floor(r() * 25)) * 86400000).toISOString().slice(0, 10) : null;
  const age = pick([9, 12, 15, 19, 34, 61]);
  const esl = r() < 0.3;
  return { seed, i, stats, spoken, interests, dislike, testDate, age, esl };
}
const ym = (y) => `${new Date().getUTCFullYear() - y}-01`;

/** Who writes what: the build and the rewrites on ZeroGPU GLM, the fact check's two readers at Gonka. */
function writer() {
  return async (a) => {
    const fam = a.task === 'material_factcheck_glm' ? 'Z' : a.task === 'material_factcheck_deepseek' ? 'M' : (process.env.UB_WRITER || 'Q');
    for (let i = 0; i < 4; i++) {
      try { const data = await J.call(fam, { system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: Math.max(a.maxTokens || 1500, 2500) }); return { data, model: fam }; } catch (e) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
    }
    return null;
  };
}
const textOf = (skills) => skills.map((s) => [`## ${s.title}`, ...(s.lesson.paragraphs || []), ...(s.lesson.key_points || []).map((k) => `Key: ${k}`), ...(s.questions || []).map((q) => `Q: ${q.prompt} A: ${q.type === 'short_answer' ? q.answer : (q.choices || [])[q.answer_index]}. ${q.explanation || ''}`)].join('\n')).join('\n\n');
const lessonText = (skills) => skills.flatMap((s) => [...(s.lesson.paragraphs || []), ...(s.lesson.key_points || [])]).join(' ');
const SCHEMA = { type: 'object', properties: { traits: { type: 'array', items: { type: 'object', properties: { trait: { type: 'string' }, followed: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['trait', 'followed'] } }, invented_facts: { type: 'array', items: { type: 'string' } } }, required: ['traits', 'invented_facts'] };
const SYSTEM = 'You are a strict reviewer. A learner profile, the SOURCE the learner uploaded and the COURSE built from it are given. For EACH listed trait say whether the COURSE visibly follows it (followed true/false, with a short quote or measurable reason). Also list any specific factual claim in the COURSE that is not in the SOURCE (invented_facts; an analogy that borrows from an interest is fine if it makes no new claim about the subject). Be strict: generic text is not following the trait.';

async function judge(fam, wants, src, text) {
  const j = await J.askJ(fam, { system: SYSTEM, user: `TRAITS:\n${wants.map((w, n) => `${n + 1}. ${w}`).join('\n')}\n\nSOURCE:\n${src.slice(0, 5000)}\n\nCOURSE:\n${text.slice(0, 14000)}`, schema: SCHEMA, schemaName: 'review', maxTokens: 6000 });
  if (!j || !Array.isArray(j.traits)) return null;
  return { followed: j.traits.filter((t) => t.followed).length, of: j.traits.length, invented: (j.invented_facts || []).length, invented_list: (j.invented_facts || []).slice(0, 12), misses: j.traits.filter((t) => !t.followed).map((t) => t.trait) };
}

async function runOne(L0, src, store, file) {
  const learner = require('../services/learner'); const scorecard = require('../services/scorecard');
  const user = db.insert('users', { email: `ub-${L0.seed}-${L0.i}@example.test`, display_name: `ub${L0.i}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: ym(L0.age) } });
  learner.saveProfile(user.id, { survey: learner.cleanSurvey({ interests: L0.interests.join(', '), notes: `${L0.dislike ? `I dislike ${L0.dislike}. ` : ''}${L0.esl ? 'English is my second language. ' : ''}` }), subscription: 'pro' });
  const card = scorecard.get(user.id);
  for (const [id, sc] of Object.entries(L0.stats)) card.stats[id] = { ...card.stats[id], s: sc, m: sc, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' };
  db.update('scorecards', card.id, { stats: card.stats });
  const m = materials.addPaste(user.id, 'Plate tectonics', src.plain).value;
  const kps = K.extract(src.rich, { plain: src.plain }); db.update('materials', m.id, { key_points: kps.key_points, topics: kps.topics, assessed: kps.assessed });
  if (L0.testDate) db.update('materials', m.id, { retention_goal: { horizon: 'date', test_date: L0.testDate, set_on: new Date().toISOString().slice(0, 10) } });
  const llm = writer();
  const t0 = Date.now();
  let built; try { built = await cb.build(user.id, m.id, { llm, force: true, factcheck: true, stress: true, split: true }); } catch (e) { built = { error: e.message }; }
  if (!built.course) { store.rows.push({ seed: L0.seed, i: L0.i, error: String(built.error) }); L.save(file, store); console.log(`learner ${L0.i}: build failed`); return; }
  const buildS = Math.round((Date.now() - t0) / 1000);
  const t1 = Date.now();
  const raw = built.course.skills;
  const refs = raw.flatMap((s) => [`lesson:${s.id}`]);
  const served0 = study.internals.loadCourse(user.id, m.id).skills;
  const qRefs = served0.flatMap((s) => (s.questions || []).map((q) => `q:${s.id}:${q.id}`));
  const results = { lesson: { asked: 0, changed: 0 }, q: { asked: 0, changed: 0 } };
  await J.pool([...refs, ...qRefs], 4, async (ref) => {
    const kind = ref.startsWith('lesson') ? 'lesson' : 'q';
    const r = await P.followPart(user.id, m.id, ref, { llm, force: true, gates: null });
    if (r.skipped) return;
    results[kind].asked += 1; if (r.changed) results[kind].changed += 1;
  });
  const served = study.internals.loadCourse(user.id, m.id).skills;
  const followS = Math.round((Date.now() - t1) / 1000);
  const wants = [...L0.spoken, ...(L0.interests.length && !(L0.stats.interest_transfer < 50) ? [`likes ${L0.interests.join(' and ')} (examples and analogies may use them)`] : []), ...(L0.dislike ? [`dislikes ${L0.dislike} (must not appear)`] : []), ...(L0.esl ? ['English is a second language: plain syntax, no idioms'] : []), ...(L0.testDate ? [`has a test in ${Math.round((new Date(L0.testDate) - Date.now()) / 86400000)} days: exam-style wording, name the traps`] : []), `is ${L0.age} years old`];
  const row = { seed: L0.seed, i: L0.i, learner: L0, wants, status: built.course.status, skills: raw.length, build_s: buildS, follow_s: followS, results, source_words: L.words(src.plain), base_lesson: L.words(lessonText(raw)), base_whole: L.words(textOf(raw)), served_lesson: L.words(lessonText(served)), served_whole: L.words(textOf(served)), base: {}, served: {}, served_text: textOf(served), base_text: textOf(raw) };
  for (const fam of (process.env.UB_JUDGES || 'C,N').split(',')) {
    // eslint-disable-next-line no-await-in-loop
    row.base[fam] = await judge(fam, wants, src.plain, textOf(raw));
    // eslint-disable-next-line no-await-in-loop
    row.served[fam] = await judge(fam, wants, src.plain, textOf(served));
  }
  store.rows.push(row); L.save(file, store);
  const f = (x) => (x ? `${x.followed}/${x.of} inv ${x.invented}` : '-');
  console.log(`learner ${L0.i} [${L0.spoken.length} traits, age ${L0.age}${L0.esl ? ', ESL' : ''}${L0.testDate ? ', test' : ''}] build ${buildS}s follow ${followS}s (${results.lesson.changed}/${results.lesson.asked} lessons, ${results.q.changed}/${results.q.asked} questions) words ${row.source_words} -> ${row.base_lesson} -> ${row.served_lesson} | base ${f(row.base.C)} ${f(row.base.N)} | served ${f(row.served.C)} ${f(row.served.N)}`);
}

/**
 * The fit gate of docs/MODIFICATION-MAP.md section 5, same blind judge, on whole courses: is this learner's served course picked as the one written for them, against the stored one and against another learner's served one?
 * A and B are shuffled; planted identical pairs must come back SAME. p is one-sided against chance. Judges C (Coral DeepSeek) and G (Grok 4.3).
 */
const FIT_SYSTEM = 'You are a careful blind judge. You are shown the profile of ONE learner and two versions (A and B) of the same learner-facing text. Decide which version was written for THIS learner: the one whose length, wording, tone, level of detail and examples fit the profile, and which avoids what the learner dislikes. Ignore which is better written in general. Think briefly, then give your answer on the LAST line as exactly "ANSWER: A", "ANSWER: B" or "ANSWER: SAME" (SAME only if you truly cannot tell).';
async function askFit(fam, profile, a, b) {
  const user = `LEARNER PROFILE:\n${profile}\n\nVERSION A:\n${a.slice(0, 7000)}\n\nVERSION B:\n${b.slice(0, 7000)}`;
  const schema = { type: 'object', properties: { reason: { type: 'string' }, answer: { type: 'string', enum: ['A', 'B', 'SAME'] } }, required: ['answer'] };
  const sys = FIT_SYSTEM.replace(/Think briefly[\s\S]*$/, 'Think briefly, then give your answer as JSON {"reason": "...", "answer": "A" | "B" | "SAME"}.');
  for (let i = 0; i < 4; i += 1) {
    try {
      let d = null;
      if (fam === 'G') { const r = await require('../services/providers/grokified').grokified.structured({ model: 'grok-4.3', system: sys, user, schema, schemaName: 'pick', maxTokens: 3000, timeoutMs: 180000 }); d = r && r.data; } else d = await J.call(fam, { system: sys, user, schema, schemaName: 'pick', maxTokens: 3000 });
      if (d && ['A', 'B', 'SAME'].includes(d.answer)) return d.answer;
    } catch (e) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
  return null;
}
async function runFit() {
  const file = path.join(L.OUT_DIR, 'learners-fit.json');
  const store = L.load(file, { rows: [] });
  const rows = fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).flatMap((x) => L.load(path.join(DIR, x)).rows).filter((r) => !r.error && r.base_text && r.served_text);
  const r0 = rng(77011);
  const pairs = [];
  rows.forEach((r, i) => {
    const profile = r.wants.join('; ');
    const other = rows[(i + 1 + Math.floor(r0() * (rows.length - 1))) % rows.length];
    pairs.push({ key: `${r.seed}.${r.i}.stored`, kind: 'stored', profile, mine: r.served_text, them: r.base_text });
    if (other && other !== r) pairs.push({ key: `${r.seed}.${r.i}.other`, kind: 'other', profile, mine: r.served_text, them: other.served_text });
    if (i % 3 === 0) pairs.push({ key: `${r.seed}.${r.i}.same`, kind: 'identical', profile, mine: r.served_text, them: r.served_text });
  });
  await J.pool(pairs.flatMap((p) => ['C', 'G'].map((fam) => ({ ...p, fam }))), 4, async (p) => {
    if (store.rows.some((x) => x.key === p.key && x.fam === p.fam)) return;
    const flip = r0() < 0.5;
    const a = await askFit(p.fam, p.profile, flip ? p.them : p.mine, flip ? p.mine : p.them);
    const picked = a == null ? null : a === 'SAME' ? 'same' : ((a === 'A') !== flip ? 'mine' : 'them');
    store.rows.push({ key: p.key, kind: p.kind, fam: p.fam, picked }); L.save(file, store);
  });
  fitReport();
}
function fitReport() {
  const store = L.load(path.join(L.OUT_DIR, 'learners-fit.json'), { rows: [] });
  const binom = (k, n) => { let p = 0; const c = (a, b) => { let v = 1; for (let i = 1; i <= b; i += 1) v = (v * (a - b + i)) / i; return v; }; for (let i = k; i <= n; i += 1) p += c(n, i) * 0.5 ** n; return p; };
  for (const kind of ['stored', 'other', 'identical']) for (const fam of ['C', 'G']) {
    const v = store.rows.filter((x) => x.kind === kind && x.fam === fam && x.picked);
    const d = v.filter((x) => x.picked !== 'same');
    const w = d.filter((x) => x.picked === 'mine').length;
    if (v.length) console.log(`  fit ${kind.padEnd(9)} ${fam}: picked ${w} of ${d.length} (${d.length ? Math.round((100 * w) / d.length) : '-'}%, p ${d.length ? binom(w, d.length).toExponential(1) : '-'}), SAME ${v.length - d.length}`);
  }
}

function report() {
  const rows = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).flatMap((f) => L.load(path.join(DIR, f)).rows).filter((r) => !r.error);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * s.length)]; };
  console.log(`${rows.length} learners`);
  for (const arm of ['base', 'served']) for (const fam of ['C', 'N']) {
    const v = rows.map((r) => r[arm][fam]).filter(Boolean);
    const sh = v.map((x) => x.followed / x.of);
    if (!v.length) continue;
    console.log(`  ${arm.padEnd(6)} ${fam}: n ${v.length} followed ${Math.round(mean(sh) * 100)}% worst 1/5/10% ${[0.01, 0.05, 0.1].map((p) => Math.round(q(sh, p) * 100)).join(' / ')}% invented ${mean(v.map((x) => x.invented)).toFixed(2)} (none in ${v.filter((x) => !x.invented).length})`);
  }
  const miss = {};
  for (const r of rows) for (const fam of ['C', 'N']) for (const t of (r.served[fam] || { misses: [] }).misses) { const k = t.replace(/\d+ days/, 'N days').replace(/likes .*/, 'likes their interests').replace(/dislikes .*/, 'dislikes X').replace(/is \d+ years old/, 'age'); miss[k] = (miss[k] || 0) + 1; }
  console.log('  most missed, served:', Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join('; '));
  const brev = rows.filter((r) => r.wants.includes('wants the shortest version'));
  console.log(`  shortest-version learners ${brev.length}: lesson ${brev.map((r) => (r.served_lesson / r.source_words).toFixed(2)).join(', ')}; whole ${brev.map((r) => (r.served_whole / r.source_words).toFixed(2)).join(', ')} (base lesson ${brev.map((r) => (r.base_lesson / r.source_words).toFixed(2)).join(', ')})`);
  console.log(`  rewrites: lessons ${rows.reduce((n, r) => n + r.results.lesson.changed, 0)}/${rows.reduce((n, r) => n + r.results.lesson.asked, 0)}, questions ${rows.reduce((n, r) => n + r.results.q.changed, 0)}/${rows.reduce((n, r) => n + r.results.q.asked, 0)}; build s mean ${Math.round(mean(rows.map((r) => r.build_s)))}, follow s mean ${Math.round(mean(rows.map((r) => r.follow_s)))}`);
}

(async () => {
  if (process.argv[2] === 'report') { report(); fitReport(); process.exit(0); }
  if (process.argv[2] === 'fit') { await runFit(); console.log('spend', JSON.stringify(J.spend)); process.exit(0); }
  const n = Number(process.argv[3] || 6); const seed = Number(process.argv[4] || 7601);
  const file = path.join(DIR, `${seed}.json`);
  const store = L.load(file, { rows: [] });
  const d = L.allDocs().find((x) => x.id === 'h1');
  const src = await L.extracted(d);
  const todo = Array.from({ length: n }, (_, i) => randomLearner(seed, i)).filter((x) => !store.rows.some((r) => r.i === x.i));
  await J.pool(todo, Number(process.env.UB_CONC || 2), async (x) => { await runOne(x, src, store, file); });
  console.log('spend', JSON.stringify(J.spend));
  db.flush();
  process.exit(0);
})();
