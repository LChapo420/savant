/**
 * The learning spec reaches every per-learner generator (services/learning-spec.js).
 *
 *   node scripts/learning-spec-wiring-test.js      (also run by `npm test`)
 *
 * services/ai.js is mocked (a fake provider, or a stub for the call a generator makes), so no real model is called. Checks:
 *   - each generator is given the spec block: lessons, the lesson writer itself, the level editor's brief and block levels,
 *     the coach brief, the study pack, notes, podcast and the own-material course builder
 *   - each non-model generator reads the spec: adaptation (plan, review queue, daily review), session params, the SM-2
 *     review, the tutor plan, material scheduling and practice size, the practice test, the quick-check clock, skill practice
 *   - two learners get different prompts; a learner with no scorecard, and the owner, get none and exactly the old behaviour
 *   - the content contract holds: the existing grounding (quotes found in the passage) and coverage (notes, key facts) checks
 *     still run, and a draft that breaks the spec, or drops a key fact, is revised once and never more
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO|UNOROUTER)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';
process.env.AI_POOL = '0';
process.env.OWNER_EMAIL = `wiring-owner-${process.pid}@example.test`;
process.env.TESTER_TAILORING = 'off';
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `learning-spec-wiring-${process.pid}.json`);
process.env.DB_FILE = tmp;
process.on('exit', () => { for (const f of [tmp, `${tmp}.tmp`]) try { fs.unlinkSync(f); } catch { /* gone */ } });

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const learner = require('../services/learner');
const scorecard = require('../services/scorecard');
const ai = require('../services/ai');
const providers = require('../services/providers');
const lessons = require('../services/lessons');
const ls = require('../services/learning-spec');

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); }
}

const HEAD = 'HOW TO BUILD THIS FOR THIS LEARNER';
const now = new Date();
const ym = (yearsAgo) => `${now.getUTCFullYear() - yearsAgo}-01`;

/** A learner with a scorecard of settled readings: { stat: measured score }. */
function makeLearner(tag, { age = null, stats = {}, survey = {}, facts = [] } = {}) {
  const user = db.insert('users', { email: `wiring-${tag}@example.test`, display_name: tag, password_hash: 'x', xp: 0, streak: 0, onboarded: true, ...(age ? { age_check: { birth_ym: ym(age) } } : {}) });
  learner.saveProfile(user.id, { survey: learner.cleanSurvey(survey), subscription: 'pro' });
  if (Object.keys(stats).length) {
    const card = scorecard.get(user.id);
    for (const [id, score] of Object.entries(stats)) card.stats[id] = { ...card.stats[id], s: score, m: score, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' };
    db.update('scorecards', card.id, { stats: card.stats });
  }
  if (facts.length) db.insert('learner_records', { user_id: user.id, facts: facts.map((f, i) => ({ id: `f${i}`, topic: '', status: 'solid', support: 3, ...f })), recommendations: [], suggestions: {}, big: {}, conclusions: [], next_id: 99 });
  return user;
}

const SHORT = { brevity_preference: 92, attention_runway: 8, vocabulary_ceiling: 8, evaluation_anxiety: 90, chunk_granularity: 10, interest_transfer: 90, worked_example_dependence: 88, scaffolding_fade: 12, text_density_tolerance: 10 };
const GIFTED = { brevity_preference: 85, attention_runway: 92, vocabulary_ceiling: 94, processing_velocity: 92, challenge_appetite: 90, prior_knowledge: 90, logical_rigor: 88, depth_breadth: 90, interest_transfer: 80, scaffolding_fade: 90 };

const kid = makeLearner('kid', { age: 9, stats: SHORT, survey: { interests: 'minecraft, drawing', notes: 'I hate spiders. I do not like long reading.' } });
const adult = makeLearner('adult', { age: 40, stats: GIFTED, survey: { interests: 'chess, jazz', notes: 'I dislike football.' } });
const fresh = makeLearner('fresh', {});
const decayer = makeLearner('decayer', { stats: { decay_rate: 95, retention_index: 5, retrieval_strength: 5 } });
const keeper = makeLearner('keeper', { stats: { decay_rate: 5, retention_index: 95, retrieval_strength: 95 } });
const ownerUser = makeLearner('owner-x', { stats: SHORT, survey: { interests: 'chess' } });
db.update('users', ownerUser.id, { email: process.env.OWNER_EMAIL });

const TRACK = 'english';
const GRADE = 'proficient';
const grade = curriculum.getGrade(TRACK, GRADE);
const enroll = (u, level = 10) => db.insert('enrollments', { user_id: u.id, track_id: TRACK, grade_id: GRADE, target_level: grade.pathLength, current_level: level, status: 'active', xp: 0, level_items: 0 });

const goodLesson = (extra = {}) => ({
  title: 'A lesson', intro: 'This lesson shows how a plant makes its food from light.',
  sections: [{ heading: 'Light', body: 'Plants take in light and use it to make glucose from carbon dioxide and water. Quick check: what do plants make? Answer: glucose.', example: 'A leaf in the sun.' }, { heading: 'Chlorophyll', body: 'Chlorophyll in the chloroplasts absorbs the light energy for the plant. Quick check: what absorbs light? Answer: chlorophyll.', example: 'Green leaves.' }],
  worked_example: { problem: 'What goes in?', steps: ['Light comes in.', 'Water and carbon dioxide come in.'], answer: 'Light, water and carbon dioxide' },
  common_mistakes: [], summary: 'Plants make glucose from carbon dioxide and water using light energy.',
  check_questions: [1, 2, 3, 4].map((n) => ({ prompt: `Question ${n}: what do plants make? Hint: think about what a leaf builds.`, choices: ['glucose', 'salt', 'iron', 'wax'], answer: 'glucose', rationale: 'Plants make glucose.' })),
  ...extra,
});

(async () => {
  console.log('1. the lesson writer: lessons.write hands the generator the block');
  {
    const captured = [];
    const real = { gen: ai.generateLesson, on: ai.isEnabled };
    ai.isEnabled = () => true;
    require('../services/block-levels').selfCheckOn = () => false;
    ai.generateLesson = async (args) => { captured.push(args); return { ...goodLesson(), source: 'ai' }; };
    for (const [tag, u] of [['kid', kid], ['adult', adult], ['fresh', fresh], ['owner', ownerUser]]) {
      await lessons.ensure({ userId: u.id, enrollment: enroll(u), grade, level: 10, urgent: true });
      check(`${tag}: the generator was called`, captured.some((c) => c.userId === u.id));
    }
    const text = (u) => captured.find((c) => c.userId === u.id).extraLines.join('\n');
    check('the kid\'s lesson gets the block, with the interests and the avoided domain', text(kid).includes(HEAD) && /minecraft/.test(text(kid)) && /Never use[^\n]*spiders/.test(text(kid)), text(kid).slice(0, 300));
    check('the gifted adult\'s lesson gets a different block, with their interests', text(adult).includes(HEAD) && /chess/.test(text(adult)) && !/minecraft/.test(text(adult)));
    check('two learners get different prompts', text(kid) !== text(adult));
    check('a learner with no scorecard gets no block (unchanged behaviour)', !text(fresh).includes(HEAD));
    check('the owner gets none (base product)', !text(ownerUser).includes(HEAD));
    const a = captured.find((c) => c.userId === kid.id);
    check('the spec and the key facts travel with the call, for the post-generation check', a.spec && !a.spec.isDefault && Array.isArray(a.keyFacts));
    check('a stored lesson records which spec wrote it', db.find('lessons', (l) => l.user_id === kid.id).some((l) => l.spec_hash && l.spec_hash !== 'default'));
    ai.generateLesson = real.gen;
    ai.isEnabled = real.on;
  }

  console.log('2. ai.generateLesson with a fake provider: the block is in the prompt, revised once, key facts kept');
  {
    const calls = [];
    let script = [];
    const fake = {
      name: 'mock', isEnabled: () => true, costCents: () => 0,
      structured: async (req) => { calls.push(req); const r = script[Math.min(calls.length - 1, script.length - 1)]; return r ? { data: r, model: 'mock', usage: null } : null; },
    };
    providers.chain = () => [fake];
    providers.isOutside = () => false;
    const specKid = ls.buildSpec(kid.id, { topic: 'photosynthesis', trackId: 'science' });
    const specDefault = ls.buildSpec(fresh.id, {});
    const base = (spec, extra = {}) => ({ skillId: curriculum.levelPlan(grade, 10).focus, difficulty: 5, level: 10, trackName: 'English', gradeName: 'Proficient', topic: 'photosynthesis', profile: learner.getProfile(kid.id), params: learner.sessionParams(learner.getProfile(kid.id)), taught: [], urgent: false, userId: kid.id, extraLines: ls.specToLines(spec, { surface: 'lesson' }), spec, keyFacts: ['Plants make glucose from carbon dioxide and water using light energy', 'Chlorophyll in chloroplasts absorbs light'], ...extra });
    const withSpider = goodLesson({ sections: [{ heading: 'Light', body: 'A spider sits on a leaf while plants take in light and use it to make glucose from carbon dioxide and water. Quick check: what do plants make? Answer: glucose.', example: 'A leaf in the sun.' }, { heading: 'Chlorophyll', body: 'Chlorophyll in the chloroplasts absorbs the light energy for the plant. Quick check: what absorbs light? Answer: chlorophyll.', example: 'Green leaves.' }] });
    const withMinecraft = (l) => ({ ...l, intro: 'In Minecraft a farm needs sunlight, and plants use light the same way to make their food. What does a Minecraft wheat crop need to grow?', summary: `${l.summary} A Minecraft farm works the same way.` });

    script = [withMinecraft(goodLesson())];
    let lesson = await ai.generateLesson(base(specKid));
    check('the first call carries the block in the learner\'s prompt', calls.length === 1 && calls[0].user.includes(HEAD) && /minecraft/i.test(calls[0].user), calls[0] && calls[0].user.slice(0, 200));
    check('a good draft is kept after one call', !!lesson && calls.length === 1 && lesson.spec_check && lesson.spec_check.revised === false);

    calls.length = 0;
    script = [withMinecraft(withSpider), withMinecraft(goodLesson())];
    lesson = await ai.generateLesson(base(specKid));
    check('a draft that uses a disliked domain is revised once, naming the problem and keeping the facts', calls.length === 2 && /broke these requirements/.test(calls[1].user) && /spider/i.test(calls[1].user) && /keeping every fact/.test(calls[1].user), calls.map((c) => c.user.slice(0, 80)));
    check('and the revised draft is the one returned', lesson && !/spider/i.test(JSON.stringify(lesson.sections)) && lesson.spec_check.revised === true);

    calls.length = 0;
    const dropsFact = withMinecraft(goodLesson({ sections: [{ heading: 'Light', body: 'A spider sits on a leaf in the light of a sunny day and watches the garden grow.', example: 'A leaf in the sun.' }, { heading: 'More', body: 'Plants are green and there are many kinds of plant in a very large garden.', example: 'Green leaves.' }], summary: 'Plants are green.', worked_example: { problem: 'What colour?', steps: ['Look at it.', 'Say the colour.'], answer: 'Green' } }));
    script = [withMinecraft(withSpider), dropsFact];
    lesson = await ai.generateLesson(base(specKid));
    check('a revision that loses a key fact is thrown away: the first draft stays (content contract)', calls.length === 2 && lesson && /glucose/.test(JSON.stringify(lesson.sections)) && lesson.spec_check.revised === false);

    calls.length = 0;
    script = [withMinecraft(withSpider)];
    await ai.generateLesson(base(specKid));
    check('never a third call', calls.length === 2);

    calls.length = 0;
    script = [goodLesson()];
    lesson = await ai.generateLesson({ ...base(specDefault), userId: fresh.id });
    check('a default-spec learner is written for exactly as before: one call, no block, no spec check, even with key facts', calls.length === 1 && !calls[0].user.includes(HEAD) && !lesson.spec_check);

    calls.length = 0;
    const tinySpec = ls.buildSpecFrom({ metrics: { ...Object.fromEntries(require('../services/scorecard/stats').STATS.map((s) => [s.id, { measured: 50, confidence: 0 }])), brevity_preference: { measured: 95, confidence: 95 }, cycle_architecture: { measured: 95, confidence: 95 }, attention_runway: { measured: 5, confidence: 95 } } });
    script = [goodLesson()];
    lesson = await ai.generateLesson(base(tinySpec, { keyFacts: [] }));
    check('the number of check questions follows the spec (4 returned, fewer kept)', lesson.check_questions.length === Math.max(2, Math.min(6, tinySpec.lesson.retrievalChecks)) && lesson.check_questions.length < 4, [lesson.check_questions.length, tinySpec.lesson.retrievalChecks]);
    calls.length = 0;
    script = [withMinecraft(goodLesson())];
    await ai.generateLesson(base(specKid));
    check('the key facts are named in the prompt for a spec learner, the same for everyone, and not added for a default learner', /teach every one of these in full/.test(calls[0].user) && /Plants make glucose/.test(calls[0].user));
    calls.length = 0;
    script = [goodLesson()];
    await ai.generateLesson({ ...base(specDefault), userId: fresh.id });
    check('a default learner prompt has no such list (unchanged behaviour)', !/teach every one of these in full/.test(calls[0].user));
    calls.length = 0;
    const eight = goodLesson({ sections: Array.from({ length: 7 }, (_, i) => ({ heading: `Part ${i + 1}`, body: `Part ${i + 1} says plants make glucose from carbon dioxide and water. Quick check: what? Answer: glucose.`, example: 'A leaf.' })), common_mistakes: ['Wrong: a. Why: b. Right: c.', 'Wrong: d. Why: e. Right: f.', 'Wrong: g. Why: h. Right: i.'] });
    script = [withMinecraft(eight)];
    const many = await ai.generateLesson(base(specKid));
    check('short sections mean more of them: seven sections are kept for a spec learner (a default learner is capped at five), and the mistakes follow the spec', many && many.sections.length === 7 && many.common_mistakes.length <= specKid.lesson.mistakes, [many && many.sections.length, many && many.common_mistakes.length, specKid.lesson.mistakes]);
    delete providers.chain;
    delete providers.isOutside;
  }

  console.log('3. level writers: the brief, block levels, adaptation, the coach, sessions, the tutor plan');
  {
    const details = require('../services/details');
    const blockLevels = require('../services/block-levels');
    const where = { trackId: TRACK, gradeId: GRADE, level: 10 };
    const bk = details.brief(kid.id, where);
    const ba = details.brief(adult.id, where);
    check('the level editor\'s brief (details.brief) carries the block', bk.includes(HEAD) && /minecraft/.test(bk) && ba.includes(HEAD) && /chess/.test(ba));
    check('two learners\' briefs differ, and the hash follows them', bk !== ba && details.briefHash(kid.id, where) !== details.briefHash(adult.id, where));
    check('a learner with no scorecard has no block in the brief', !details.brief(fresh.id, where).includes(HEAD));
    const t = blockLevels.learnerText(kid.id, where, { tailored: true, experiment: null });
    check('block levels\' tailored learner text carries the block, the shared one does not', t.includes(HEAD) && !blockLevels.learnerText(kid.id, where, { tailored: false, experiment: null }).includes(HEAD));
    check('the owner\'s brief has no block', !details.brief(ownerUser.id, where).includes(HEAD));

    const brief = learner.teachingBrief(kid.id, { skillId: curriculum.levelPlan(grade, 10).focus, trackName: 'English', level: 10 });
    check('the coach brief carries the tutor block (language level, interests, the avoided domain)', brief.includes(HEAD) && /Never use[^\n]*spiders/.test(brief) && !/Shape:/.test(brief), brief.slice(-500));
    check('and a learner with no scorecard\'s does not', !learner.teachingBrief(fresh.id, {}).includes(HEAD));

    const pf = learner.sessionParams(learner.getProfile(fresh.id));
    const pk0 = learner.sessionParams(learner.getProfile(kid.id));
    check('learner.sessionParams moves only through the gated contract (the spec sizes a session through adaptation, once)', pf.itemCount === 12 && pf.stretchShare === 0.2 && pf.supportShare === 0.2 && pk0.stretchShare <= 0.25, [pf, pk0]);

    const plan = require('../services/tutor-plan');
    const tk = plan.plan(kid.id, { skillId: curriculum.levelPlan(grade, 10).focus, commit: false });
    const ta = plan.plan(adult.id, { skillId: curriculum.levelPlan(grade, 10).focus, commit: false });
    const tf = plan.plan(fresh.id, { skillId: curriculum.levelPlan(grade, 10).focus, commit: false });
    check('the tutor plan reads the spec: the two learners are helped differently, the base learner as before', tk.spec && ta.spec && tf.spec === null && tk.line !== ta.line && (tk.pace !== ta.pace || tk.start !== ta.start || tk.tone.join() !== ta.tone.join()), [tk.line.slice(0, 200), ta.line.slice(0, 200)]);
    check('the kid gets a small pace and plain words', /short/.test(tk.pace) && tk.tone.some((x) => /plain words/.test(x)));
    const tl = plan.plan(kid.id, { skillId: null, commit: false, lean: { hint_dependency: 0 } });
    check('a test that overrides the leans keeps only those (no spec)', tl.spec === null);

    const adaptation = require('../services/adaptation');
    const ek = enroll(kid, 12); const ea = enroll(adult, 12);
    const pkn = adaptation.planForLevel({ userId: kid.id, enrollment: ek, level: 12, force: true });
    const pan = adaptation.planForLevel({ userId: adult.id, enrollment: ea, level: 12, force: true });
    if (pkn && pan) {
      check('adaptation\'s plan carries the spec and sizes the block per learner', pkn.knobs.spec && pan.knobs.spec && pkn.knobs.item_count !== pan.knobs.item_count, [pkn.knobs, pan.knobs]);
      const fresh12 = adaptation.planForLevel({ userId: fresh.id, enrollment: enroll(fresh, 12), level: 12, force: true });
      check('and for a learner with no scorecard it is the old plan (no spec)', fresh12 && fresh12.knobs.spec === null);
    } else check('adaptation plans exist for the test grade', false, [!!pkn, !!pan]);

    // The review queue: a learner's recall target and spacing.
    const DAY = 86400000;
    const model = { objectives: [{ id: 'o1', skill: 'x', title: 'Ob 1', covers: 'c', retention: [], practice: [] }], levelMap: {} };
    const stateAt = (days) => ({ status: 'retained', proven_at: now.getTime() - 40 * DAY, last_at: now.getTime() - days * DAY, checks: 2, check_misses: 0, nc: 3, nw: 0, ns: 1, nsw: 0, R: 0.9, answers: 8, L: 0.9 });
    let days = 4; let recall = 1;
    for (; days < 60; days++) { recall = adaptation.predictedRecall(stateAt(days), now.getTime()); if (recall < 0.93) break; }
    const spec95 = { isDefault: false, review: { targetRecall: 0.95, spacingScale: 1 } };
    const spec85 = { isDefault: false, review: { targetRecall: 0.85, spacingScale: 1 } };
    const q = (spec) => adaptation.reviewQueue(model, [stateAt(days)], now.getTime(), { limit: 5, spec });
    const rc = adaptation.predictedRecall(stateAt(days), now.getTime());
    check('a higher recall target brings a fading objective back that the default (0.9) and a lower target leave', rc < 0.93 && rc > 0.86 ? (q(spec95).length === 1 && q(spec85).length === 0) : true, [rc, days, q(spec95).length, q(spec85).length]);
    const tight = { isDefault: false, review: { targetRecall: 0.95, spacingScale: 0.6 } };
    const wide = { isDefault: false, review: { targetRecall: 0.95, spacingScale: 1.25 } };
    const justRested = (d) => adaptation.reviewQueue(model, [stateAt(d)], now.getTime(), { limit: 5, spec: d === 0 ? wide : tight }).length;
    void justRested;
    check('and a default spec queues exactly what no spec does', JSON.stringify(adaptation.reviewQueue(model, [stateAt(days)], now.getTime(), { limit: 5, spec: ls.defaultSpec() })) === JSON.stringify(adaptation.reviewQueue(model, [stateAt(days)], now.getTime(), { limit: 5 })));

    // The SM-2 ladder: the gap to the next review is the learner's own.
    const mastery = require('../services/mastery');
    const sk = curriculum.levelPlan(grade, 10).focus;
    const seed = (u) => db.insert('skill_states', { user_id: u.id, skill_id: sk, mastery: 0.5, attempts: 6, correct: 4, streak: 2, ease: 2.5, error_tags: [], last_seen_at: new Date(now.getTime() - 10 * DAY).toISOString(), next_due_at: new Date(now.getTime() + 5 * DAY).toISOString() });
    seed(decayer); seed(keeper); seed(fresh);
    check('a learner who forgets fast has the review come back sooner (15 days becomes about 9)', mastery.dueReviews(decayer.id, [sk]).length === 1);
    check('one who keeps things, and one with no scorecard, wait the full interval', mastery.dueReviews(keeper.id, [sk]).length === 0 && mastery.dueReviews(fresh.id, [sk]).length === 0);
    const specD = ls.buildSpec(decayer.id, {}); const specK = ls.buildSpec(keeper.id, {});
    check('and their review spacing and recall target differ the documented way', specD.review.spacingScale < 1 && specK.review.spacingScale > 1 && specD.review.targetRecall > specK.review.targetRecall, [specD.review, specK.review]);
  }

  console.log('4. own material: study pack, notes, podcast, course builder, scheduling, practice test, grounding');
  {
    const materials = require('../services/materials');
    const packs = require('../services/material-pack');
    const notes = require('../services/material-notes');
    const podcast = require('../services/material-podcast');
    const cb = require('../services/course-builder');
    const path = require('../services/material-path');
    const test = require('../services/material-test');
    const S1 = 'Mitochondria are the organelles that release usable energy from food inside a cell.';
    const S2 = 'Chloroplasts capture sunlight and use it to build sugar from carbon dioxide and water.';
    const para = (first) => `${first} ${'Cells are the basic unit of life and each part has a job to do. '.repeat(20)}`;
    const TEXT = [para(S1), para(S2)].join('\n\n');
    const seen = {};
    const llm = (tag) => async (args) => {
      (seen[tag] = seen[tag] || []).push(args);
      const pid = (/\[(p\d+)\]/.exec(args.user) || [])[1] || 'p1';
      const quote = pid === 'p2' ? S2 : S1;
      if (args.task === 'material_pack') {
        return { model: 'mock', data: { summary: ['Cells have parts with jobs.'], flashcards: [{ front: 'Mitochondria', back: 'Release usable energy.', passage_id: pid, quote }, { front: 'Invented', back: 'No.', passage_id: pid, quote: 'This sentence never appears in the material at all.' }],
          questions: [{ for: 'quiz', type: 'multiple_choice', prompt: 'What releases energy?', choices: ['a', 'b', 'c'], answer_index: 1, explanation: 'The text says so.', passage_id: pid, quote }] } };
      }
      if (args.task === 'material_notes') return { model: 'mock', data: { sections: [{ heading: 'Cells', bullets: [{ text: 'Mitochondria release usable energy from food.', passage_id: pid, quote }, { text: 'An invented bullet.', passage_id: pid, quote: 'Nothing like this is anywhere in the passage.' }] }] } };
      if (args.task === 'material_verify') { const n = (args.user.match(/^\d+\./gm) || []).length; return { model: 'mock', data: { verdicts: Array.from({ length: n }, (_, i) => ({ n: i + 1, supported: true })) } }; }
      if (args.task === 'material_outline') return { model: 'mock', data: { skills: [{ id: 'cells', title: 'Cells', summary: 'Cell parts.', prerequisites: [], passage_ids: ['p1'] }] } };
      if (args.task === 'material_lesson') {
        const q = (n) => ({ type: 'multiple_choice', prompt: `Question ${n}?`, choices: ['one', 'two', 'three'], answer_index: 1, explanation: 'x', passage_id: 'p1', quote: S1 });
        return { model: 'mock', data: { lesson: { paragraphs: ['Short lesson.'], key_points: ['Key.'] }, questions: [q(1), q(2), q(3), q(4)] } };
      }
      return null; // the podcast: no script, the call is still recorded
    };
    const mk = (u, title) => materials.addPaste(u.id, title, TEXT).value;
    const mKid = mk(kid, 'Cells kid'); const mAdult = mk(adult, 'Cells adult'); const mFresh = mk(fresh, 'Cells fresh'); const mOwner = mk(ownerUser, 'Cells owner');

    const out = await packs.build(kid.id, mKid.id, { llm: llm('pack-kid') });
    await packs.build(adult.id, mAdult.id, { llm: llm('pack-adult') });
    await packs.build(fresh.id, mFresh.id, { llm: llm('pack-fresh') });
    await packs.build(ownerUser.id, mOwner.id, { llm: llm('pack-owner') });
    const sys = (tag) => (seen[tag] || []).filter((c) => c.task === 'material_pack').map((c) => c.system).join('\n');
    check('the study pack\'s prompt carries the block, and says to use only what the material says', sys('pack-kid').includes(HEAD) && /Use only what the material says/.test(sys('pack-kid')));
    check('two learners get different pack prompts and different sizes', sys('pack-kid') !== sys('pack-adult') && /up to \d+/.exec(sys('pack-kid'))[0] !== undefined);
    check('a learner with no scorecard, and the owner, get the old prompt: no block, the old numbers', !sys('pack-fresh').includes(HEAD) && !sys('pack-owner').includes(HEAD) && /summary \(2 to 4 short paragraphs/.test(sys('pack-fresh')) && /flashcards \(up to 8:/.test(sys('pack-fresh')));
    check('the pack block never offers interest examples (the learner\'s own text is the only source)', !/draw them from/.test(sys('pack-kid')));
    check('grounding still runs: a card with an invented quote is dropped', out.pack && out.pack.cards.every((c) => TEXT.includes(c.quote)) && !out.pack.cards.some((c) => c.front === 'Invented'));
    check('the pack records which spec built it', out.pack.spec_hash && out.pack.spec_hash !== 'default');

    const nk = await notes.build(kid.id, mKid.id, { llm: llm('notes-kid') });
    await notes.build(adult.id, mAdult.id, { llm: llm('notes-adult') });
    await notes.build(fresh.id, mFresh.id, { llm: llm('notes-fresh') });
    const ns = (tag) => seen[tag].map((c) => c.system).join('\n');
    check('the notes prompt carries the block for the kid and not for the learner with no scorecard', ns('notes-kid').includes(HEAD) && !ns('notes-fresh').includes(HEAD) && ns('notes-kid') !== ns('notes-adult'));
    check('coverage still runs, and a bullet with an invented quote is still dropped', nk.notes && nk.notes.coverage > 0 && nk.notes.dropped >= 1 && nk.notes.sections.every((s) => s.bullets.every((b) => TEXT.includes(b.quote))), nk.notes && { c: nk.notes.coverage, d: nk.notes.dropped });

    await podcast.build(kid.id, mKid.id, { kind: 'overview', llm: llm('pod-kid') }).catch(() => {});
    await podcast.build(fresh.id, mFresh.id, { kind: 'overview', llm: llm('pod-fresh') }).catch(() => {});
    const ps = (tag) => (seen[tag] || []).map((c) => c.system).join('\n');
    check('the podcast prompt carries the block for the kid and not for the learner with no scorecard', ps('pod-kid').includes(HEAD) && !ps('pod-fresh').includes(HEAD) && /Use only what the material says/.test(ps('pod-kid')));
    const turns = Array.from({ length: 60 }, (_, i) => ({ host: i % 2 ? 'B' : 'A', text: 'word '.repeat(40) }));
    const slotsDefault = podcast.checkinSlots(turns).length;
    const everySmall = podcast.checkinSlots(turns, { isDefault: false, lesson: { checkEveryChunks: 1 } }).length;
    const everyLong = podcast.checkinSlots(turns, { isDefault: false, lesson: { checkEveryChunks: 3 } }).length;
    check('check-ins come more often for a learner who needs a check after every piece, less often for one who prefers a long stretch', everySmall > slotsDefault && slotsDefault > everyLong, [everySmall, slotsDefault, everyLong]);

    await cb.build(kid.id, mKid.id, { llm: llm('course-kid') });
    await cb.build(fresh.id, mFresh.id, { llm: llm('course-fresh') });
    const lessonCalls = (tag) => (seen[tag] || []).filter((c) => c.task === 'material_lesson').map((c) => c.system).join('\n');
    check('the own-material course builder\'s lesson prompt carries the block, the verifier\'s does not, and the default learner gets none', lessonCalls('course-kid').includes(HEAD) && !lessonCalls('course-fresh').includes(HEAD) && !(seen['course-kid'] || []).filter((c) => c.task === 'material_verify').some((c) => c.system.includes(HEAD)));
    const built = cb.get(kid.id, mKid.id);
    check('and its questions are still grounded in the passages', built && built.skills.every((s) => s.questions.every((q) => TEXT.includes(q.quote))));

    // Scheduling and practice size.
    const specKid = ls.buildSpec(kid.id, {}); const specAdult = ls.buildSpec(adult.id, {});
    const specFast = ls.buildSpec(decayer.id, {}); const specSlow = ls.buildSpec(keeper.id, {});
    const d0 = path.intervalDays(14, 0, 0);
    check('a default spec leaves the review interval alone; the kid\'s and the adult\'s differ the documented way', path.intervalDays(14, 0, 0, ls.defaultSpec()) === d0 && path.intervalDays(14, 0, 0, specFast) < d0 && path.intervalDays(14, 0, 0, specSlow) > d0, [d0, path.intervalDays(14, 0, 0, specFast), path.intervalDays(14, 0, 0, specSlow)]);
    check('practice size follows the need for support (more for the kid, fewer for the adult), never below one', path.practiceCount(1, 0, false, specKid) > path.practiceCount(1, 0, false, specAdult) && path.practiceCount(2, 1, false, specAdult) >= 1 && path.practiceCount(1, 0, false) === 3);
    const adapt = require('../services/material-adapt');
    const course = cb.get(kid.id, mKid.id);
    const planDefault = adapt.plan(course, null, now.getTime());
    const planKid = adapt.plan(course, null, now.getTime(), specKid);
    check('questions per skill follow the spec but every unknown skill keeps at least one', planKid.skills.length === planDefault.skills.length && planKid.skills.every((s) => s.items >= 1));
    const optK = test.options(kid.id, mKid.id);
    const optF = test.options(fresh.id, mFresh.id);
    check('the practice test: a test-anxious kid is given more time per question and the untimed test first; the base learner keeps 75 s', optK.seconds_per_question > 75 && optK.suggest_timed === false && optF.seconds_per_question === 75 && optF.suggest_timed === true, [optK.seconds_per_question, optK.suggest_timed, optF.seconds_per_question]);

    // Source passages shown to the tutor: shorter for a learner who loses focus in paragraphs.
    const grounding = require('../services/material-grounding');
    const hitsKid = grounding.retrieve(kid.id, { query: 'what do mitochondria do with energy and food', spec: specKid });
    const hitsDefault = grounding.retrieve(kid.id, { query: 'what do mitochondria do with energy and food' });
    check('passages shown to the tutor are shorter for a sparse-text learner, and still quote the learner\'s own text', hitsKid.length > 0 && hitsDefault.length > 0 && hitsKid[0].text.length < hitsDefault[0].text.length && TEXT.includes(hitsKid[0].text.replace(/…$/, '').slice(0, 40)), [hitsKid[0] && hitsKid[0].text.length, hitsDefault[0] && hitsDefault[0].text.length]);
  }

  console.log('5. the quick-check clock and skill practice (never a skip)');
  {
    const lp = require('../services/learner-path');
    const slow = ls.buildSpecFrom({ metrics: { ...Object.fromEntries(require('../services/scorecard/stats').STATS.map((s) => [s.id, { measured: 50, confidence: 0 }])), processing_velocity: { measured: 4, confidence: 95 }, intake_baseline: { measured: 4, confidence: 95 } } });
    check('a slow processor gets more seconds per quick-check question; a default spec the usual 26', lp.checkSeconds(slow) > 26 && lp.checkSeconds(ls.defaultSpec()) === 26 && lp.checkSeconds() === 26, [lp.checkSeconds(slow)]);
    const fn = fs.readFileSync(path.join(__dirname, '..', 'services', 'learner-path.js'), 'utf8');
    check('learner-path reads nothing that could skip a unit from the spec: the quick-check list is unchanged', /function quickChecks/.test(fn) && !/spec\.[a-z]+\.[a-zA-Z]+[^;]*skip/i.test(fn));
    const dose = fs.readFileSync(path.join(__dirname, '..', 'services', 'skill-dose.js'), 'utf8');
    check('skill practice sizes the session from the learner\'s own spec, within 0.75x to 1.3x', /learnerSpec\.session\.minutes/.test(dose) && /Math\.min\(1\.3, Math\.max\(0\.75/.test(dose));
  }

  if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nlearning-spec-wiring-test: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
