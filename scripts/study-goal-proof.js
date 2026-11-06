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
for (const k of Object.keys(envFile)) if (/^(CORAL|LYCEUM|GEMINI)_/.test(k)) process.env[k] = envFile[k];
process.env.CORAL_PIPELINE = '1'; process.env.LYCEUM_PIPELINE = '1';
const X = require('./lib/extreme-learners');
const T = require('./lib/extreme-tailor');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const MODE = arg('mode', 'core'); const N = Number(arg('n', 12)); const SEED = Number(arg('seed', 727272)); const OUT = arg('out', null); const CONC = Number(arg('concurrency', 3));
const { base, installWriter, JUDGES, cache, sha } = P;
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const blockLevels = require('../services/block-levels');
const adaptLib = require('../services/block-adapt');
const sg = require('../services/study-goal');

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const words = (t) => (String(t).match(/[A-Za-zÀ-ÿ'-]+/g) || []).length;
const SUBJECTS = ['math', 'english', 'iq'];
const jsonOf = (t) => { try { const m = String(t || '').match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } };

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
  const goal = variant === 'core' ? { goal: 'core', restored: [], set_on: '2026-11-05' } : undefined;
  db.insert('enrollments', { user_id: user.id, track_id: cell.trackId, grade_id: cell.gradeId, target_level: 300, current_level: cell.level, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString(), ...(goal ? { study_goal: goal } : {}) });
  const prevOff = process.env.BLOCK_APPROACH;
  if (variant === 'approach-off') process.env.BLOCK_APPROACH = 'off';
  let plan;
  try { plan = await blockLevels.write({ userId: user.id, trackId: cell.trackId, gradeId: cell.gradeId, level: cell.level, tailored: true }); } finally { if (prevOff === undefined) delete process.env.BLOCK_APPROACH; else process.env.BLOCK_APPROACH = prevOff; }
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
  const full = await writeVersion(L, cell, subject, 'full'); const core = await writeVersion(L, cell, subject, 'core');
  if (full.error || core.error) return { error: full.error || core.error };
  const objective = cell.ctx.split('\n').filter((l) => /^(SUBJECT|GRADE|TOPIC|TOPIC GENERALIZATION|COVERS|OBJECTIVE)/.test(l)).join('\n').slice(0, 1500);
  const qk = `sgq:${sha(objective)}`; let qs = cache.get(qk);
  if (!qs) {
    const r = jsonOf(await JUDGES[0].call('You write exam questions. Reply with JSON only.', `From this course objective ALONE (not from any lesson), write 5 short questions a learner who has studied the objective must be able to answer, each with the short correct answer. JSON: {"questions":[{"q":"...","a":"..."}]}\n\n${objective}`));
    qs = r && Array.isArray(r.questions) ? { list: r.questions.slice(0, 5) } : null; if (qs) cache.set(qk, qs);
  }
  if (!qs) return { error: 'no questions' };
  const answerable = {};
  for (const [name, v] of [['full', full], ['core', core]]) {
    const ans = jsonOf(await JUDGES[JUDGES.length > 1 ? 1 : 0].call('You answer questions using ONLY the lesson given; if the lesson does not contain the answer write "NOT IN LESSON". Reply with JSON only.', `LESSON:\n${v.text}\n\nQUESTIONS:\n${qs.list.map((x, k) => `${k + 1}. ${x.q}`).join('\n')}\n\nJSON: {"answers":["..."]}`));
    const given = (ans && ans.answers) || [];
    answerable[name] = [];
    for (const j of JUDGES) {
      const g = jsonOf(await j.call('You grade answers against a key. Reply with JSON only.', `For each item say whether the ANSWER matches the KEY in substance (true/false). "NOT IN LESSON" is false.\n${qs.list.map((x, k) => `${k + 1}. KEY: ${x.a} | ANSWER: ${given[k] || 'NOT IN LESSON'}`).join('\n')}\nJSON: {"correct":[true,false]}`));
      const c = (g && g.correct) || []; answerable[name].push(c.filter(Boolean).length / qs.list.length);
    }
  }
  // blind: which version is for the learner who wants only the core parts fast; one in four pairs is two copies of the same version (must be TIE)
  const planted = i % 4 === 3; const flip = sha(`${L.id}${i}`).charCodeAt(0) % 2 === 0;
  const v1 = planted ? full.text : (flip ? core.text : full.text); const v2 = planted ? full.text : (flip ? full.text : core.text);
  const pick = jsonOf(await JUDGES[0].call('You compare two versions of one lesson. Reply with JSON only.', `Two versions (1 and 2) of the same level. Which one was written for a learner who wants ONLY THE CORE PARTS, FAST? Answer 1, 2 or "TIE" if you cannot tell them apart.\nVERSION 1:\n${v1}\n\nVERSION 2:\n${v2}\n\nJSON: {"core_is":"1"|"2"|"TIE"}`));
  const said = pick ? String(pick.core_is) : '?';
  return { id: L.id, subject, grade: cell.gradeId, level: cell.level, words_full: full.words, words_core: core.words, checks_full: full.checks, checks_core: core.checks, ans_full: answerable.full, ans_core: answerable.core, planted, flip, said, blind_right: planted ? said === 'TIE' : said === (flip ? '1' : '2') };
}

async function approachItem(L, i) {
  const subject = SUBJECTS[i % SUBJECTS.length]; const cell = pickCell(subject, i + 1); if (!cell) return { error: 'no cell' };
  const off = await writeVersion(L, cell, subject, 'approach-off'); const on = await writeVersion(L, cell, subject, 'full');
  if (off.error || on.error) return { error: off.error || on.error };
  const planted = i % 4 === 3; const flip = sha(`${L.id}a${i}`).charCodeAt(0) % 2 === 0;
  const v1 = planted ? on.text : (flip ? on.text : off.text); const v2 = planted ? on.text : (flip ? off.text : on.text);
  const r = jsonOf(await JUDGES[0].call('You compare two versions of one lesson for one learner. Reply with JSON only.', `LEARNER PROFILE (traits 0-100, interests, difficulties):\n${X.writerProfile(L)}\n\nVERSION 1:\n${v1}\n\nVERSION 2:\n${v2}\n\nWhich version suits this learner better? Answer 1, 2 or "TIE". Also: do both versions teach the same facts, with no false statement in either (true/false)?\nJSON: {"better":"1"|"2"|"TIE","same_facts":true}`));
  const said = r ? String(r.better) : '?';
  return { id: L.id, subject, planted, flip, said, same_facts: r ? r.same_facts !== false : null, differs: off.text !== on.text, picked_on: planted ? null : said === (flip ? '1' : '2'), planted_ok: planted ? said === 'TIE' : null };
}

(async () => {
  installWriter();
  const learners = X.generate(SEED, N, {});
  const rows = (await pool(learners, MODE === 'core' ? coreItem : approachItem)).map((r, i) => ({ i, ...r }));
  const good = rows.filter((r) => !r.error);
  const summary = { mode: MODE, label: 'SIMULATED learners, AI-judged; not a result on real people', n: N, ok: good.length, errors: rows.filter((r) => r.error).map((r) => r.error).slice(0, 5), writer: P.WRITER, judges: JUDGES.map((j) => `${j.id} (${j.family})`) };
  if (MODE === 'core') {
    const wr = good.map((r) => r.words_core / Math.max(1, r.words_full));
    const dAns = (k) => good.map((r) => (r.ans_core[k] ?? 0) - (r.ans_full[k] ?? 0));
    const minutes = (w, c) => w / 200 + c * 0.5;
    const fam = JUDGES.map((j, k) => ({ judge: j.family, ans_full: mean(good.map((r) => r.ans_full[k] ?? NaN)), ans_core: mean(good.map((r) => r.ans_core[k] ?? NaN)), worst10_drop: pct(dAns(k), 0.1) }));
    const wordsFewer = 1 - mean(wr);
    const ansOk = fam.every((f) => f.ans_core >= f.ans_full - 1e-9);
    const sets = ['math', 'english', 'iq'].map((s) => { let tot = 0; let as = 0; for (const g of curriculum.getTrack(s).grades) { tot += curriculum.getGrade(s, g.id).pathLength; as += sg.coreSetAsideLevels(s, g.id).length; } return { subject: s, levels: tot, set_aside_share: as / tot }; });
    const perLevelFull = mean(good.map((r) => minutes(r.words_full, r.checks_full))); const perLevelCore = mean(good.map((r) => minutes(r.words_core, r.checks_core)));
    const share = mean(sets.map((x) => x.set_aside_share));
    Object.assign(summary, { words_fewer: wordsFewer, words_fewer_worst10: 1 - pct(wr, 0.9), per_level_minutes: { full: perLevelFull, core: perLevelCore }, hours_ratio_core_over_full: (perLevelCore * (1 - share)) / perLevelFull, set_aside: sets, answerability: fam, gate: { words_25pct_fewer: wordsFewer >= 0.25, answerability_not_lower: ansOk, stays_on: wordsFewer >= 0.25 && ansOk },
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
