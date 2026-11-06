/**
 * Proof for study goals (SIMULATED learners, AI-JUDGED; no real learner is measured here).
 *
 *   node scripts/study-goal-proof.js --mode core     --writer coral --judges lyc_glm,gemini --n 12 --seed 727272 --out FILE
 *   node scripts/study-goal-proof.js --mode approach --writer coral --judges lyc_glm,gemini --n 12 --seed 727273 --out FILE
 *
 * core:     the same level written by the real block writer for each extreme held-out learner with the full-depth goal and with
 *           the core-parts goal. Reported per learner: words of the level, the estimated minutes (words at 200 a minute plus half
 *           a minute a check), and the share of the grade's levels the goal sets aside. GATE: a question set is written from the
 *           course's own objective text before either version is seen (family one), an answerer sees ONE version only (family two) and
 *           answers, and BOTH families grade the answers against the key. Core-question answerability must be no lower than the
 *           standard path's, and words at least 25% fewer. The worst 10% of learners are reported. Under the gate the goal stays off.
 *           A blind judge is also asked which version is for a learner who wants only the core parts fast (planted identical pairs
 *           must come back TIE).
 * approach: the wired lesson-opening and explanation-order lines (services/block-adapt.js approachLines) on and off, the same level and
 *           learner: a blind judge picks which version suits the learner's profile (chance is 50%), planted identical pairs must come
 *           back TIE, and both versions are checked to teach the same facts.
 */
const fs = require('fs');
Object.assign(process.env, { NODE_ENV: 'test', PERSONALIZE_HOLDOUT: '0', PERSONALIZE_EXPERIMENT_RATE: '0', LEVEL_SELF_CHECK: 'off', KEY_GATE: 'off', BLOCK_ADAPT: 'on', RUN_CAP_USD: process.env.RUN_CAP_USD || '4' });
const P = require('./material-sensitivity-proof');
// The test fixture blanks every key; give back only the free/cheap providers this proof uses (never the Anthropic key).
const envFile = require('dotenv').parse(fs.readFileSync('C:/coding/claudecommittdIq/folderThing/.env'));
for (const k of Object.keys(envFile)) if (/^(CORAL|LYCEUM|GEMINI|NVIDIA|GROKIFIED)_/.test(k)) process.env[k] = envFile[k];
process.env.CORAL_PIPELINE = '1'; process.env.LYCEUM_PIPELINE = '1'; process.env.STUDY_GOAL_CORE = 'on'; process.env.STUDY_GOAL_TEST = 'on'; // the proof turns the (default-off) core switch on
const X = require('./lib/extreme-learners');
const T = require('./lib/extreme-tailor');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const MODE = arg('mode', 'core'); const N = Number(arg('n', 12)); const SEED = Number(arg('seed', 727272)); const OUT = arg('out', null); const CONC = Number(arg('concurrency', 3));
const { base, installWriter, cache, sha } = P;
// Judges: GLM-5.3 is a reasoning model and returned EMPTY text on many pairs at the shared 6000-token cap (5 Nov run); here it gets the same
// large cap as scripts/lib/extreme-tailor.js (--judge-max, 24000). Every judge call is retried on an empty or failed reply, and a pair whose
// answers or grades still cannot be read is dropped as UNSCORED (reported), never counted as a zero.
const JUDGE_MAX = Number(arg('judge-max', 24000));
const withRetry = (j) => ({ ...j, call: async (s, u) => { let last; for (let k = 0; k < 3; k++) { try { const t = await j.call(s, u); if (String(t || '').trim() && jsonOf(t)) return t; /* an unreadable reply is asked again */ last = new Error(`${j.id} returned no text`); } catch (e) { last = e; } } throw last; } });
const bigCap = (j) => (j.id !== 'z-ai/glm-5.3' ? j : { ...j, call: async (s, u) => {
  process.env.LYCEUM_PIPELINE = '1';
  process.env.LYCEUM_LEDGER_FILE = process.env.LYCEUM_LEDGER_FILE || 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/lyceum-ledger.json';
  const { lyceum } = require('../services/providers/lyceum'); // eslint-disable-line global-require
  const r = await P.gated(() => lyceum.chat({ task: 'study-goal-judge', system: s, messages: [{ role: 'user', content: u }], maxTokens: JUDGE_MAX, model: j.id, timeoutMs: 420000 }));
  return r.text;
} });
const JUDGES = P.JUDGES.map(bigCap).map(withRetry);
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const blockLevels = require('../services/block-levels');
const adaptLib = require('../services/block-adapt');
const sg = require('../services/study-goal');

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const words = (t) => (String(t).match(/[A-Za-zÀ-ÿ'-]+/g) || []).length;
const SUBJECTS = ['math', 'english', 'iq', 'spanish'];
// The last balanced {...} in a reply that parses (models sometimes add prose, a code fence or a second object).
const jsonOf = (t) => {
  const str = String(t || ''); const found = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '{') continue;
    let depth = 0; let inStr = false;
    for (let k = i; k < str.length; k++) {
      const ch = str[k];
      if (inStr) { if (ch === '\\') k++; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) { try { found.push(JSON.parse(str.slice(i, k + 1))); } catch { /* not json */ } i = k; break; }
    }
  }
  return found.length ? found[found.length - 1] : null;
};

// A grader's verdicts as n booleans, whatever shape it replied in ({correct:[..]}, {results:[true | {match|correct:true}]}, a bare list, or cut-off JSON).
// Falls back to the n true/false words in the reply; null (the pair is UNSCORED) when it cannot be read as exactly n verdicts.
const gradesOf = (raw, n) => {
  const t = String(raw || '');
  const asBool = (v) => (typeof v === 'boolean' ? v : (v && typeof v === 'object' ? [v.correct, v.match, v.matches, v.result, v.is_correct, v.grade].find((x) => typeof x === 'boolean') : undefined));
  const tryList = (l) => { if (!Array.isArray(l) || l.length !== n) return null; const b = l.map(asBool); return b.every((x) => typeof x === 'boolean') ? b : null; };
  const o = jsonOf(t);
  if (o) { for (const v of [o.correct, o.results, o.verdicts, o.grades, o.answers, ...Object.values(o)]) { const r = tryList(v); if (r) return r; } }
  try { const m = t.match(/\[[\s\S]*\]/); if (m) { const r = tryList(JSON.parse(m[0])); if (r) return r; } } catch { /* fall through */ }
  const words = t.match(/(true|false)/gi) || [];
  return words.length === n ? words.map((w) => w.toLowerCase() === 'true') : null;
};
function pickCell(subject, i) {
  const list = T.CELLS[subject];
  for (let k = 0; k < list.length; k++) {
    const [g, lv0] = list[(i + k) % list.length];
    for (let lv = lv0; lv < lv0 + 10; lv++) {
      try {
        if (!['lesson', 'retention'].includes(blockLevels.kindFor(curriculum.getGrade(subject, g), lv))) continue;
        const ctx = blockLevels.levelContext(subject, g, lv).text; const topic = (ctx.split('\n').find((l) => l.startsWith('TOPIC:')) || '');
        if (!/Activity \d+ of|quiz\/game|checkpoint/i.test(topic)) return { trackId: subject, gradeId: g, level: lv, ctx };
      } catch { /* next */ }
    }
  }
  return null;
}
const render = (plan) => {
  const lib = blockLevels.library();
  const out = [];
  for (const b of plan.blocks) out.push(`BLOCK ${b.index + 1} (${(lib[b.block] || {}).name || b.block}): ${adaptLib.textOf(b.data).join(' | ')}`);
  for (const c of plan.checks) out.push(`CHECK (${c.format}): ${c.prompt}${(c.choices || []).length ? ` Choices: ${c.choices.join(' / ')}.` : ''} Explanation: ${c.rationale || '(none)'}`);
  return out.join('\n');
};
const teachWords = (plan) => plan.blocks.reduce((n, b) => n + words(adaptLib.textOf(b.data).join(' ')), 0);

async function writeVersion(L, cell, subject, variant) {
  const ck = `sgp:${sha(JSON.stringify([L.id, L.traits, cell.gradeId, cell.level, P.WRITER, variant]))}`;
  const hit = cache.get(ck); if (hit && hit.text) return hit;
  const user = base.makeUser({ name: L.id.replace(/[^a-z0-9]/gi, ''), age: L.age, survey: T.surveyFor(L, subject), stats: L.traits, esl: L.ell });
  const gid = variant.startsWith('core') ? 'core' : variant.startsWith('test') ? 'test' : null; const goal = gid ? { goal: gid, restored: [], set_on: '2026-11-06' } : undefined;
  db.insert('enrollments', { user_id: user.id, track_id: cell.trackId, grade_id: cell.gradeId, target_level: 300, current_level: cell.level, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString(), ...(goal ? { study_goal: goal } : {}) });
  let plan;
  try {
    for (let k = 0; k < 3 && !(plan && plan.blocks); k++) { // the writer sometimes returns an unusable or cut-off reply: write again (up to 3 tries)
      try { plan = await blockLevels.write({ userId: user.id, trackId: cell.trackId, gradeId: cell.gradeId, level: cell.level, tailored: true }); } catch { plan = null; }
    }
  } catch { plan = null; }
  if (!plan || !plan.blocks) return { error: `no level written for ${L.id}` };
  const a = { text: render(plan), words: teachWords(plan), checks: plan.checks.length }; cache.set(ck, a); return a;
}

async function pool(items, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (next < items.length) { const i = next++; try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { error: e.message }; } } }));
  return out;
}

async function coreItem(L, i) {
  const subject = SUBJECTS[i % SUBJECTS.length]; const cell = pickCell(subject, i); if (!cell) return { error: 'no cell' };
  // 1. The core questions, written from the course's own objective text ALONE, before either version of the lesson exists or is seen.
  const objective = cell.ctx.split('\n').filter((l) => /^(SUBJECT|GRADE|TOPIC|TOPIC GENERALIZATION|COVERS|OBJECTIVE)/.test(l)).join('\n').slice(0, 1500);
  const qk = `${MODE === 'test' ? 'sgx3' : 'sgq3'}:${sha(objective)}`; let qs = cache.get(qk);
  if (!qs) {
    const r = jsonOf(await JUDGES[0].call('You write exam questions. Reply with JSON only.', `From this course objective ALONE (no lesson text exists yet), write 8 short questions that ${MODE === 'test' ? 'a test on this objective would ask, exam style: recall of definitions and rules, applying them to a new case, and one harder question' : 'test the must-know core of the objective: definitions, rules, steps, and the facts a learner has to be able to state or apply'}. Each has the short correct answer. JSON: {"questions":[{"q":"...","a":"..."}]}\n\n${objective}`));
    qs = r && Array.isArray(r.questions) && r.questions.length >= 4 ? { list: r.questions.slice(0, 8) } : null; if (qs) cache.set(qk, qs);
  }
  if (!qs) return { error: 'unscored: no questions' };
  // 2. Both versions of the level, then the answerers see ONE version only.
  const full = await writeVersion(L, cell, subject, 'full'); const core = await writeVersion(L, cell, subject, MODE === 'test' ? 'test1' : MODE === 'control' ? 'full2' : (process.env.CORE_VARIANT || 'core2')); // 'core' here means the goal version; control = a second independent full-depth write
  if (full.error || core.error) return { error: full.error || core.error };
  const answerable = {};
  for (const [name, v] of [['full', full], ['core', core]]) {
    const ans = jsonOf(await JUDGES[JUDGES.length > 1 ? 1 : 0].call('You answer questions using ONLY the lesson given; if the lesson does not contain the answer write "NOT IN LESSON". Reply with JSON only.', `LESSON:\n${v.text}\n\nQUESTIONS:\n${qs.list.map((x, k) => `${k + 1}. ${x.q}`).join('\n')}\n\nJSON: {"answers":["..."]}`));
    if (!ans || !Array.isArray(ans.answers)) return { error: 'unscored: answers unreadable' };
    answerable[name] = [];
    for (const j of JUDGES) {
      const raw = await j.call('You grade answers against a key. Reply with JSON only.', `For each item say whether the ANSWER matches the KEY in substance (true/false). "NOT IN LESSON" is false.\n${qs.list.map((x, k) => `${k + 1}. KEY: ${x.a} | ANSWER: ${ans.answers[k] || 'NOT IN LESSON'}`).join('\n')}\nJSON: {"correct":[true,false]}`);
      const g = gradesOf(raw, qs.list.length);
      if (!g) return { error: `unscored: grades unreadable (${j.family}: ${String(raw).replace(/\s+/g, ' ').slice(0, 160)})` };
      answerable[name].push(g.filter(Boolean).length / qs.list.length);
    }
  }
  // 3. blind: which version is for the learner who wants only the core parts fast; one in four pairs is two copies of the same version (must be TIE)
  const planted = i % 5 === 4; const flip = sha(`${L.id}${i}`).charCodeAt(0) % 2 === 0;
  const v1 = planted ? full.text : (flip ? core.text : full.text); const v2 = planted ? full.text : (flip ? full.text : core.text);
  const pick = jsonOf(await JUDGES[0].call('You compare two versions of one lesson. Reply with JSON only.', `Two versions (1 and 2) of the same level. Which one was written for a learner who wants ${MODE === 'test' ? 'to be READY FOR A TEST' : 'ONLY THE CORE PARTS, FAST'}? Answer 1, 2 or "TIE" if you cannot tell them apart.\nVERSION 1:\n${v1}\n\nVERSION 2:\n${v2}\n\nJSON: {"core_is":"1"|"2"|"TIE"}`));
  const said = pick ? String(pick.core_is) : '?';
  return { id: L.id, kind: L.kind, age: L.age, subject, grade: cell.gradeId, level: cell.level, words_full: full.words, words_core: core.words, checks_full: full.checks, checks_core: core.checks, ans_full: answerable.full, ans_core: answerable.core, planted, flip, said, blind_right: planted ? said === 'TIE' : said === (flip ? '1' : '2') };
}

async function approachItem(L, i) {
  const subject = SUBJECTS[i % SUBJECTS.length]; const cell = pickCell(subject, i + 1); if (!cell) return { error: 'no cell' };
  const off = await writeVersion(L, cell, subject, 'approach-off'); const on = await writeVersion(L, cell, subject, 'approach-on');
  if (off.error || on.error) return { error: off.error || on.error };
  const planted = i % 5 === 4; const flip = sha(`${L.id}a${i}`).charCodeAt(0) % 2 === 0;
  const v1 = planted ? on.text : (flip ? on.text : off.text); const v2 = planted ? on.text : (flip ? off.text : on.text);
  const r = jsonOf(await JUDGES[0].call('You compare two versions of one lesson for one learner. Reply with JSON only.', `LEARNER PROFILE (traits 0-100, interests, difficulties):\n${X.writerProfile(L)}\n\nVERSION 1:\n${v1}\n\nVERSION 2:\n${v2}\n\nWhich version suits this learner better? Answer 1, 2 or "TIE". Also: do both versions teach the same facts, with no false statement in either (true/false)?\nJSON: {"better":"1"|"2"|"TIE","same_facts":true}`));
  const said = r ? String(r.better) : '?';
  return { id: L.id, subject, planted, flip, said, same_facts: r ? r.same_facts !== false : null, differs: off.text !== on.text, picked_on: planted ? null : said === (flip ? '1' : '2'), planted_ok: planted ? said === 'TIE' : null };
}

(async () => {
  installWriter();
  const learners = X.generate(SEED, N, {});
  // The approach switch is a process-wide env var: write every 'off' version first with it off, then every 'on' version with it on (never both at
  // once: the 5 Nov run set it per call under concurrency, so its pairs may have been mixed). Core mode runs the shipping default (off).
  process.env.BLOCK_APPROACH = 'off';
  if (MODE === 'approach') {
    const cellOf = (L, i) => { const subject = SUBJECTS[i % SUBJECTS.length]; return { subject, cell: pickCell(subject, i + 1) }; };
    await pool(learners, async (L, i) => { const { subject, cell } = cellOf(L, i); return cell ? writeVersion(L, cell, subject, 'approach-off') : null; });
    process.env.BLOCK_APPROACH = 'on';
    await pool(learners, async (L, i) => { const { subject, cell } = cellOf(L, i); return cell ? writeVersion(L, cell, subject, 'approach-on') : null; });
  }
  const rows = (await pool(learners, MODE !== 'approach' ? coreItem : approachItem)).map((r, i) => ({ i, ...r }));
  const good = rows.filter((r) => !r.error);
  const summary = { mode: MODE, label: 'SIMULATED learners, AI-judged; not a result on real people', n: N, ok: good.length, unscored_or_failed: rows.filter((r) => r.error).length, errors: rows.filter((r) => r.error).map((r) => r.error).slice(0, 8), writer: P.WRITER, judges: JUDGES.map((j) => `${j.id} (${j.family})`) };
  if (MODE !== 'approach') {
    const wr = good.map((r) => r.words_core / Math.max(1, r.words_full));
    const dAns = (k) => good.map((r) => (r.ans_core[k] ?? 0) - (r.ans_full[k] ?? 0));
    const minutes = (w, c) => w / 200 + c * 0.5;
    const boot = (d) => { let st = 12345; const rnd = () => { st = (st * 1664525 + 1013904223) % 4294967296; return st / 4294967296; }; const m = []; for (let b = 0; b < 2000; b++) { let t = 0; for (let k = 0; k < d.length; k++) t += d[Math.floor(rnd() * d.length)]; m.push(t / d.length); } return [pct(m, 0.025), pct(m, 0.975)]; };
    const fam = JUDGES.map((j, k) => ({ judge: j.family, ans_full: mean(good.map((r) => r.ans_full[k] ?? NaN)), ans_core: mean(good.map((r) => r.ans_core[k] ?? NaN)), mean_diff: mean(dAns(k)), diff_ci95: boot(dAns(k)), worst_drop: { p1: pct(dAns(k), 0.01), p5: pct(dAns(k), 0.05), p10: pct(dAns(k), 0.1) } }));
    const wordsFewer = 1 - mean(wr);
    const gateOf = (wf, ok, f) => { const worst10 = f.every((x) => x.worst_drop.p10 >= -0.10 - 1e-9); const words = MODE === 'test' ? true : wf >= 0.25; return { goal: MODE, scored_learners: good.length, enough_scored: good.length >= 60, words_25pct_fewer: MODE === 'test' ? 'n/a' : wf >= 0.25, answerability_not_lower: ok, worst10_loss_within_0_10: worst10, stays_on: words && ok && worst10 && good.length >= 60 }; };
    const ansOk = fam.every((f) => f.ans_core >= f.ans_full - 1e-9);
    const sets = ['math', 'english', 'iq', 'spanish'].map((s) => { let tot = 0; let as = 0; for (const g of curriculum.getTrack(s).grades) { tot += curriculum.getGrade(s, g.id).pathLength; as += sg.coreSetAsideLevels(s, g.id).length; } return { subject: s, levels: tot, set_aside_share: as / tot }; });
    const perLevelFull = mean(good.map((r) => minutes(r.words_full, r.checks_full))); const perLevelCore = mean(good.map((r) => minutes(r.words_core, r.checks_core)));
    const share = mean(sets.map((x) => x.set_aside_share));
    Object.assign(summary, { words_fewer: wordsFewer, words_fewer_worst: { p1: 1 - pct(wr, 0.99), p5: 1 - pct(wr, 0.95), p10: 1 - pct(wr, 0.9) }, learners_with_more_words: good.filter((r) => r.words_core > r.words_full).length, by_kind: Object.fromEntries([...new Set(good.map((r) => r.kind))].map((k) => [k, { n: good.filter((r) => r.kind === k).length, words_fewer: 1 - mean(good.filter((r) => r.kind === k).map((r) => r.words_core / Math.max(1, r.words_full))) }])), per_level_minutes: { full: perLevelFull, core: perLevelCore }, hours_ratio_core_over_full: (perLevelCore * (1 - share)) / perLevelFull, set_aside: sets, answerability: fam, gate: gateOf(wordsFewer, ansOk, fam),
      blind: { real: good.filter((r) => !r.planted).length, right: good.filter((r) => !r.planted && r.blind_right).length, planted: good.filter((r) => r.planted).length, planted_tie: good.filter((r) => r.planted && r.blind_right).length } });
  } else {
    const real = good.filter((r) => !r.planted); const pl = good.filter((r) => r.planted);
    Object.assign(summary, { versions_differ: real.filter((r) => r.differs).length, real: real.length, picked_matching: real.filter((r) => r.picked_on).length, tie: real.filter((r) => r.said === 'TIE').length, planted: pl.length, planted_tie: pl.filter((r) => r.planted_ok).length, same_facts: good.filter((r) => r.same_facts).length });
  }
  const text = JSON.stringify({ summary, rows }, null, 1);
  if (OUT) fs.writeFileSync(OUT, text);
  console.log(JSON.stringify(summary, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
