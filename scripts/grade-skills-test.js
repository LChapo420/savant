/**
 * Grade-fit: every grade draws only skills that fit it (config/grade-skills.js).
 *
 *   node scripts/grade-skills-test.js            the checks; exits 1 on any failure
 *   node scripts/grade-skills-test.js --verbose  also print each grade's skills
 *
 * For every grade of every track it samples what a learner is actually served and
 * checks each skill against the grade's fit table:
 *   - the grade's skills, every level row's skill and every objective's skill;
 *   - every level's plan (focus and introduced skills), every checkpoint plan and
 *     the Final, through the real planners (sessions.planLesson / planCheckpoint);
 *   - real bank items generated from those plans for a spread of practice levels,
 *     the first checkpoint of each kind and the Final: each item's skill fits,
 *     and generation never throws;
 *   - every objective's skill is one its own title or coverage text names (by the
 *     grade-fit rules), or is reported as inherited/defaulted;
 *   - the coverage model still validates for every grade;
 *   - tracks the table does not map (IQ, ACT, chess, piano) are exactly as before;
 *   - GRADE_SKILLS=off gives back the sheets' own tags (the rollback).
 *
 * Runs on its own empty data file with every model key blanked: no model call,
 * no network, nothing real touched.
 */
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|_TOKEN$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
process.env.DB_FILE = path.join(os.tmpdir(), `grade-skills-test-${process.pid}.json`);
delete process.env.GRADE_SKILLS;

const VERBOSE = process.argv.includes('--verbose');
const curriculum = require('../config/curriculum');
const gradeSkills = require('../config/grade-skills');
const bank = require('../content/bank');
const coverage = require('../services/coverage');
const sessions = require('../services/sessions');

let failures = 0;
const fails = [];
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 600)}`}`);
}
const RAW = {
  math: 'math-grades', english: 'english-grades', reading: 'reading-grades', iq: 'iq-grades', spanish: 'spanish-grades',
  act: 'act-grades', chess: 'chess-grades', piano: 'piano-grades', basketball: 'basketball-grades',
};
const raw = (t) => require(`../content/${RAW[t]}`).GRADES;
const PARAMS = { itemCount: 10, stretchShare: 0.2, supportShare: 0.2 };

const totals = { grades: 0, levels: 0, plans: 0, checkpoints: 0, items: 0, objectives: 0, evidenced: 0 };
const evidence = {};
console.log('every grade draws only fitting skills');
for (const track of curriculum.TRACKS) {
  const mapped = !!gradeSkills.FIT[track.id];
  const bad = [];
  let items = 0; let plans = 0; let cps = 0;
  track.grades.forEach((g0, idx) => {
    const grade = curriculum.getGrade(track.id, g0.id);
    totals.grades++;
    const allowed = gradeSkills.allowedFor(track.id, idx);
    if (VERBOSE) console.log(`     ${track.id}/${grade.id}: ${grade.skills.join(', ')}`);
    const fits = (s) => !allowed || allowed.has(s);
    const note = (where, s) => { if (!fits(s)) bad.push(`${grade.id} ${where}: ${s}`); };
    for (const s of grade.skills) note('grade skill', s);
    for (const r of grade.levels || []) { totals.levels++; if (r.skill) note(`level ${r.level} row`, r.skill); }
    // Every level's plan.
    const checkpointsSeen = new Set();
    const practice = [];
    for (let L = 1; L <= grade.pathLength; L++) {
      const plan = curriculum.levelPlan(grade, L);
      plans++;
      note(`level ${L} focus`, plan.focus);
      for (const s of plan.introduced) note(`level ${L} introduced`, s);
      if (plan.checkpoint) {
        cps++;
        for (const e of sessions.planCheckpoint({ current_level: L }, grade, plan.checkpoint)) note(`level ${L} ${plan.checkpoint} draw`, e.skillId);
        if (!checkpointsSeen.has(plan.checkpoint)) { checkpointsSeen.add(plan.checkpoint); practice.push([L, plan.checkpoint]); }
      } else if (plan.kind !== 'lesson') practice.push([L, null]);
    }
    // The Final, as the planner draws it, from the last level.
    const finalPlan = sessions.planCheckpoint({ current_level: grade.pathLength }, grade, 'graduation');
    for (const e of finalPlan) note('Final draw', e.skillId);
    // Real items: twelve practice levels spread across the grade, the first of
    // each checkpoint kind, and the Final.
    const spread = practice.filter(([, k]) => !k);
    const sample = [];
    for (let i = 0; i < 12 && spread.length; i++) sample.push(spread[Math.floor((i * (spread.length - 1)) / 11)]);
    for (const p of practice.filter(([, k]) => k)) sample.push(p);
    for (const [L, kind] of sample) {
      const entries = kind ? sessions.planCheckpoint({ current_level: L }, grade, kind)
        : sessions.planLesson(`grade-skills-test-${track.id}-${grade.id}`, { current_level: L, track_id: track.id, grade_id: grade.id }, grade, PARAMS);
      let out = [];
      try { out = bank.generateMany(entries); } catch (err) { bad.push(`${grade.id} level ${L}: generation threw ${err.message}`); }
      for (const it of out) { items++; note(`level ${L} item`, it.skill_id); }
    }
    let finalItems = [];
    try { finalItems = bank.generateMany(finalPlan); } catch (err) { bad.push(`${grade.id} Final: generation threw ${err.message}`); }
    for (const it of finalItems) { items++; note('Final item', it.skill_id); }
    // Objectives: fit, and named by their own words.
    const model = coverage.modelFor(track.id, grade.id);
    const v = coverage.validate(track.id, grade.id);
    if (v && v.problems && v.problems.length) bad.push(`${grade.id} coverage: ${v.problems.slice(0, 2).join('; ')}`);
    for (const o of (model ? model.objectives : [])) {
      totals.objectives++;
      note(`objective ${o.id}`, o.skill);
      if (!mapped || !allowed) continue;
      const e = (evidence[track.id] = evidence[track.id] || { n: 0, named: 0, kept: 0 });
      e.n++;
      const named = (gradeSkills.RULES[track.id] || []).some(([re, s]) => s === o.skill && (re.test(o.title) || re.test(o.covers)));
      if (named) { e.named++; totals.evidenced++; } else if (gradeSkills.MODE[track.id] === 'filter' && !o.sheet_skill) e.kept++;
    }
  });
  totals.items += items; totals.plans += plans; totals.checkpoints += cps;
  check(`${track.id}: ${track.grades.length} grades, ${plans} level plans, ${cps} checkpoint plans, ${items} items — every skill fits${mapped ? '' : ' (track not mapped: all skills allowed)'}`, bad.length === 0, bad.slice(0, 8));
}

console.log('objectives named by their own words');
for (const [t, e] of Object.entries(evidence)) {
  const rest = e.n - e.named - e.kept;
  console.log(`  info ${t}: of ${e.n} objectives, ${e.named} have a skill their own title or coverage names, ${e.kept} keep the sheet's tag (which fits), ${rest} were re-pointed by the lesson before them, a substitute for the sheet's tag, or the grade's nearest core skill (all fit)`);
}

console.log('the cases the audit found');
{
  const k = curriculum.getGrade('math', 'sense_of_quantity');
  check('preschool math (Sense of Quantity) has no linear equations or addition', !k.skills.includes('linear_eq') && !k.skills.includes('add_sub'), k.skills);
  const kItems = bank.generateMany(sessions.planCheckpoint({ current_level: k.pathLength }, k, 'graduation'));
  check('its Final asks only counting and shapes', kItems.every((i) => ['counting', 'shapes'].includes(i.skill_id)), [...new Set(kItems.map((i) => i.skill_id))]);
  check('its Final answers stay within 20', kItems.every((i) => !/^\d+$/.test(i.answer) || Number(i.answer) <= 20), kItems.map((i) => i.answer).filter((a) => /^\d+$/.test(a) && +a > 20));
  const kinder = curriculum.getGrade('math', 'numbers_to_10');
  check('Kindergarten math (Numbers to 10) has no linear equations', !kinder.skills.includes('linear_eq'), kinder.skills);
  const doc = curriculum.getGrade('reading', 'doctoral');
  check('doctoral Reading has no phonics', !doc.skills.includes('phonics'), doc.skills);
  const docItems = bank.generateMany(sessions.planCheckpoint({ current_level: doc.pathLength }, doc, 'graduation'));
  check('doctoral Reading\'s Final never asks about syllables', docItems.every((i) => i.skill_id !== 'phonics' && !/syllable/i.test(i.prompt)), docItems.filter((i) => /syllable/i.test(i.prompt)).map((i) => i.prompt));
  const pre = curriculum.getGrade('english', 'basics');
  const preItems = bank.generateMany(sessions.planCheckpoint({ current_level: pre.pathLength }, pre, 'graduation'));
  check('preschool English\'s Final has no ACT-style passage questions', preItems.every((i) => !['main_idea', 'inference', 'author_purpose', 'detail_support', 'vocab_context', 'act_rhetoric'].includes(i.skill_id)), [...new Set(preItems.map((i) => i.skill_id))]);
  const mathDoc = curriculum.getGrade('math', 'doctoral');
  check('doctoral math draws no school arithmetic or algebra', mathDoc.skills.every((s) => ['linear_algebra', 'probability', 'discrete_math', 'abstract_algebra', 'analysis', 'topology'].includes(s)), mathDoc.skills);
  const es = curriculum.getGrade('spanish', 'spanish_grade_47_literature_ii_19th_and_20th_century_part_1_of_2');
  check('a C2 Spanish literature grade no longer falls back to all fourteen A1-B1 skills', es.skills.every((s) => ['es_adv_grammar', 'es_idioms_register', 'es_literature'].includes(s)), es.skills);
  const a1 = curriculum.getGrade('spanish', 'entry');
  check('Spanish A1 keeps its own tags', a1.skills.join() === raw('spanish')[0].skills.join(), a1.skills);
}

console.log('unmapped tracks are unchanged');
for (const t of ['iq', 'act', 'chess', 'piano']) {
  const same = curriculum.getTrack(t).grades.every((g, i) => g.skills.join() === (raw(t)[i].skills.length ? raw(t)[i].skills : g.skills).join());
  check(`${t}: every grade's skills are the sheet's own`, same);
}

console.log('place value by number size');
{
  // Every level of each early math grade, through the real difficulty and range:
  // Kindergarten stays in the teens, 1st grade within 100, 2nd and 3rd within
  // 1,000 (final click-through, 2026-10-24: a Kindergarten level asked about 402).
  const largest = (gradeId) => {
    const g = curriculum.getGrade('math', gradeId);
    let top = 0;
    for (let level = 1; level <= g.pathLength; level += 3) {
      const d = gradeSkills.capDifficulty(g, 'place_value', curriculum.levelPlan(g, level).difficulty);
      for (let s = 0; s < 4; s++) {
        const it = bank.generate({ skillId: 'place_value', difficulty: d, seed: `pv:${gradeId}:${level}:${s}` });
        for (const n of `${it.prompt} ${(it.choices || []).join(' ')}`.replace(/(\d),(\d)/g, '$1$2').match(/\d+/g) || []) top = Math.max(top, Number(n));
      }
    }
    return top;
  };
  for (const [gradeId, cap] of [['numbers_to_20_and_teen_numbers', 20], ['add_and_subtract_within_20', 100], ['place_value_to_100_and_measurement', 100],
    ['place_value_to_1_000_and_fluent_addition', 1000], ['regrouping_money_and_arrays', 1000]]) {
    const top = largest(gradeId);
    check(`math ${gradeId}: place-value numbers stay within ${cap}`, top <= cap, top);
  }
}

console.log('each school grade gets its own standard (standards check, curriculum-build/GRADE-FIT-STANDARDS.md)');
{
  // Every math grade from preschool to grade 8: every third level through the
  // real planners (lesson, checkpoint and Final draws carry the grade's range and
  // school grade), each item held to what that grade's Common Core standard
  // covers. Caps are the largest number a grade's standard works with.
  // Ages 3-4 count within 10 (shape comparisons run to 12 cubes); Pre-K and
  // Kindergarten within 20 (ELOF P-MATH 1 at 60 months, K.CC.3).
  const CAP = { '-1': 20, 0: 20, 1: 100, 2: 1000, 3: 1000 };
  const GRADE_CAP = { sense_of_quantity: 12 };
  const nums = (it) => (`${it.prompt} ${it.answer} ${(it.choices || []).join(' ')}`.replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(\.\d+)?/g) || []).map(Number);
  const math = curriculum.getTrack('math');
  const bad = {};
  let served = 0;
  const note = (school, why, it) => { const k = `${school} ${why}`; if (!bad[k]) bad[k] = `${it.skill_id}: ${it.prompt.slice(0, 90)} => ${it.answer}`; };
  for (const g0 of math.grades) {
    const g = curriculum.getGrade('math', g0.id);
    const school = gradeSkills.schoolGrade(g);
    if (school === null || school > 8) continue;
    const plans = [];
    for (let L = 1; L <= g.pathLength; L += 3) {
      const plan = curriculum.levelPlan(g, L);
      plans.push(plan.checkpoint ? sessions.planCheckpoint({ current_level: L }, g, plan.checkpoint)
        : sessions.planLesson(`school-${g.id}-${L}`, { current_level: L, track_id: 'math', grade_id: g.id }, g, PARAMS));
    }
    plans.push(sessions.planCheckpoint({ current_level: g.pathLength }, g, 'graduation'));
    for (const entries of plans) {
      if (entries.some((e) => e.school !== school)) note(school, 'entry without its school grade', { skill_id: entries[0].skillId, prompt: '', answer: '' });
      for (const it of bank.generateMany(entries)) {
        served++;
        const text = `${it.prompt} ${it.answer}`;
        const ns = nums(it);
        const cap = GRADE_CAP[g.id] || CAP[school];
        if (cap !== undefined && ns.some((n) => Math.abs(n) > cap)) note(school, `number above ${cap}`, it);
        if (school <= 6 && !(school === 6 && it.skill_id === 'integers') && /(^|[\s(=:])[-−]\d|^-/.test(text)) note(school, 'a negative number (7.NS.1)', it);
        if (school <= 1 && /[×÷]/.test(text)) note(school, 'multiplication or division (2.OA.3-4, 3.OA)', it);
        if (school <= 2 && /\d\/\d/.test(text)) note(school, 'a fraction (3.NF)', it);
        if (school <= 3 && /\d\.\d/.test(text)) note(school, 'a decimal (4.NF.6)', it);
        if (school <= 5 && /%/.test(text)) note(school, 'a percent (6.RP.3c)', it);
        if (school <= 4 && /\^/.test(text)) note(school, 'an exponent (5.NBT.2, 6.EE.1)', it);
        if (school <= 5 && /Solve for x|x [<>≤≥]/.test(text)) note(school, 'an equation or inequality in x (6.EE.5-8)', it);
        if (school <= 6 && /π|circle has radius/.test(text)) note(school, 'a circle (7.G.4)', it);
        if (school <= 7 && /cylinder has radius/.test(text)) note(school, 'the volume of a cylinder (8.G.9)', it);
        if (school <= 4 && /[1-9]\d* ?\/ ?\d+ [+-] \d+ ?\/ ?\d+/.test(text) && (() => { const m = text.match(/(\d+)\/(\d+) [+-] (\d+)\/(\d+)/); return m && m[2] !== m[4]; })()) note(school, 'unlike denominators (5.NF.1)', it);
        if (school <= 6 && /standard deviation|z-score/.test(text)) note(school, 'standard deviation (HSS-ID.A.2-4)', it);
        if (school <= 3 && /How many (centimetres|inches|minutes|hours|grams|days|months) are in/.test(text)) note(school, 'a unit conversion (4.MD.1)', it);
        if (school <= 1 && /\bRound \d|nearest (ten|hundred|thousand)/.test(text)) note(school, 'rounding (3.NBT.1)', it);
        if (school === 2 && /^Round /.test(it.prompt)) note(school, 'rounding (3.NBT.1)', it);
      }
    }
  }
  check(`math preschool to grade 8: ${served} items through the planners, each within its grade's standard`, Object.keys(bad).length === 0, bad);
  const act = curriculum.getGrade('act', curriculum.getTrack('act').grades[0].id);
  const actPlan = sessions.planLesson('school-act', { current_level: 5, track_id: 'act', grade_id: act.id }, act, PARAMS);
  check('the ACT is unchanged: its plans carry no school grade, so the bank serves its own generators', gradeSkills.schoolGrade(act) === null && actPlan.every((e) => e.school === undefined));
  const k = curriculum.getGrade('math', 'numbers_to_20_and_teen_numbers');
  const fitted = gradeSkills.fitEntry(k, { skillId: 'place_value', difficulty: 2.5 });
  check('reviews and drills are fitted too (fitEntry): a Kindergarten place-value review at 2.5 is held to 1.6, school grade 0', fitted.difficulty === 1.6 && fitted.school === 0, fitted);

  // English and Reading: each school grade's pools hold only rules its standard
  // teaches, and never fall back to the whole pool.
  const { ALL } = require('../content/english-items');
  const { FAMILIES: PH } = require('../content/phonics-families');
  const EG = require('../content/english-grade-items');
  const { forSchool } = require('../content/pool');
  const POOL = { ...ALL, phonics: PH.phonics, literary_analysis: EG.POOLS.literary_analysis, academic_writing: EG.POOLS.academic_writing };
  const tagged = Object.keys(EG.SCHOOL_GRADES).concat(['literary_analysis', 'academic_writing']);
  const untagged = tagged.flatMap((s) => (POOL[s] || []).filter((e) => !Number.isFinite(e.g)).map((e) => `${s}: ${e.frame || e.p}`));
  check(`every entry of the ${tagged.length} graded English pools has the grade its rule is first taught`, untagged.length === 0, untagged.slice(0, 5));
  const thin = []; const above = []; let englishItems = 0;
  const MARK = /gerund|infinitive|nonessential|semicolon|; |things: |flaw: |\bwhom\b|comma splice|dangling|whether|," \w+ said|[Nn]either|along with|have been|will have|had been|reported|conditional|\baffect|\beffect|\blay\b|\blie\b/;
  for (const t of ['english', 'reading']) {
    for (const g0 of curriculum.getTrack(t).grades) {
      const g = curriculum.getGrade(t, g0.id);
      const school = gradeSkills.schoolGrade(g);
      if (school === null) continue;
      for (const s of g.skills) {
        if (!POOL[s] || !tagged.includes(s)) continue;
        const fit = forSchool(POOL[s], school);
        if (fit === POOL[s] && POOL[s].some((e) => e.g > school)) thin.push(`${g.id}/${s}: no rule at grade ${school}`);
        if (fit.some((e) => e.g > school)) above.push(`${g.id}/${s}`);
      }
      if (school > 3) continue;
      // What a grade-1 to grade-3 sitting is actually served, by the planner.
      for (let L = 1; L <= g.pathLength; L += 7) {
        const plan = curriculum.levelPlan(g, L);
        const entries = plan.checkpoint ? sessions.planCheckpoint({ current_level: L }, g, plan.checkpoint)
          : sessions.planLesson(`school-${t}-${g.id}-${L}`, { current_level: L, track_id: t, grade_id: g.id }, g, PARAMS);
        for (const it of bank.generateMany(entries)) {
          englishItems++;
          if (!tagged.includes(it.skill_id) || it.skill_id === 'transitions') continue;
          if (MARK.test(`${it.prompt} || ${it.answer}`)) above.push(`${g.id} L${L} ${it.skill_id}: ${it.prompt.slice(0, 70)} => ${it.answer}`);
        }
      }
    }
  }
  check('no English or Reading school grade falls back to a whole pool (every fitting skill has a rule at its grade)', thin.length === 0, thin.slice(0, 8));
  check(`English and Reading preschool to grade 3: ${englishItems} planner items, none a later grade's rule (verbals, semicolons, dangling modifiers, perfect tenses, affect/effect...)`, above.length === 0, above.slice(0, 8));

  // Spanish by the CEFR: past-tense narration is A2, the subjunctive B1.
  const es = curriculum.getTrack('spanish').grades.map((g0) => curriculum.getGrade('spanish', g0.id));
  const early = es.slice(0, 15).filter((g) => g.skills.includes('es_subjunctive')).map((g) => g.id);
  check('no A1 or A2 Spanish grade drills the subjunctive (CEFR B1)', early.length === 0, early);
  check('no A1 Spanish grade drills the preterite (CEFR A2)', es.slice(0, 8).every((g) => !g.skills.includes('es_preterite')));
  check('AP-level Statistics draws no calculus or linear algebra', !curriculum.getGrade('math', 'statistics_and_data_analysis').skills.some((s) => s === 'calculus' || s === 'linear_algebra'),
    curriculum.getGrade('math', 'statistics_and_data_analysis').skills);
  check('7th grade draws no slope (8.EE.5-6)', !curriculum.getGrade('math', 'linear_equations_geometry_and_probability').skills.includes('slope_lines'));
}

console.log('rollback');
{
  const out = execFileSync(process.execPath, ['-e', `
    const c = require('./config/curriculum');
    const k = c.getGrade('math', 'sense_of_quantity').skills;
    const d = c.getGrade('reading', 'doctoral').skills;
    const raw = (t) => require('./content/' + t + '-grades').GRADES;
    const same = ['math', 'english', 'reading', 'spanish', 'basketball'].every((t) => c.getTrack(t).grades.every((g, i) => g.levels === raw(t)[i].levels));
    process.stdout.write(JSON.stringify({ k, d, same }));
  `], { cwd: path.join(__dirname, '..'), env: { ...process.env, GRADE_SKILLS: 'off' } }).toString();
  const r = JSON.parse(out);
  check('GRADE_SKILLS=off: the sheets\' own level rows are served unchanged', r.same === true);
  check('GRADE_SKILLS=off: preschool math is back to its sheet tags (linear_eq included)', r.k.includes('linear_eq'), r.k);
  check('GRADE_SKILLS=off: doctoral Reading is back to its sheet tags (phonics included)', r.d.includes('phonics'), r.d);
}

console.log(`\n${totals.grades} grades, ${totals.levels} level rows, ${totals.plans} level plans, ${totals.checkpoints} checkpoint plans, ${totals.items} generated items, ${totals.objectives} objectives (${totals.evidenced} named by their own words in mapped tracks)`);
try { require('fs').unlinkSync(process.env.DB_FILE); } catch { /* never written */ }
if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\ngrade-skills test passed');
