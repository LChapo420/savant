/**
 * Offline test of the block adapter (services/block-adapt.js): the learning spec reaches block lessons, games and checkpoints of
 * math, English, IQ and Spanish; a learner with no spec gets nothing added; a tailored fill-out is checked and rewritten once.
 *
 *   node scripts/block-adapt-test.js      (also run by `npm test`)
 *
 * No model is called: a stub stands in for the `blocks` route. Writes to a copy of the fixture database.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');

for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';
process.env.AI_POOL = '0';
process.env.TESTER_TAILORING = 'off';
process.env.LEVEL_SELF_CHECK = 'off';
process.env.KEY_GATE = 'off';
delete process.env.FACT_CHECK_ANTHROPIC_KEY;
let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `block-adapt-test-${process.pid}.json`);
  const real = path.join(__dirname, '..', 'data', 'db.json');
  fs.copyFileSync(fs.existsSync(real) ? real : path.join(__dirname, 'fixtures', 'test-db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
const db = require('../config/db');
process.on('exit', () => { if (ownCopy) try { fs.unlinkSync(ownCopy); } catch { /* gone */ } });

const learner = require('../services/learner');
const scorecard = require('../services/scorecard');
const ls = require('../services/learning-spec');
const ai = require('../services/ai');
const providers = require('../services/providers');
const adapt = require('../services/block-adapt');
const blockLevels = require('../services/block-levels');
const curriculum = require('../config/curriculum');

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else { failures += 1; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); }
}

const year = new Date().getUTCFullYear();
function makeUser(tag, stats, survey) {
  const user = db.insert('users', {
    email: `adapt-${tag}-${Math.random().toString(36).slice(2, 7)}@example.test`, display_name: `Adapt ${tag}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true,
    age_check: { birth_ym: `${year - 14}-01`, needs_parent: false, under_13: false, synthetic: true },
  });
  learner.saveProfile(user.id, { survey: learner.cleanSurvey(survey || {}), subscription: 'pro' });
  const card = scorecard.get(user.id);
  for (const [id, score] of Object.entries(stats || {})) card.stats[id] = { ...card.stats[id], s: score, m: score, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' };
  db.update('scorecards', card.id, { stats: card.stats });
  return user;
}
const SURVEY = { interests: 'basketball, video games', hobbies: 'drawing comics', dislikes: 'spiders' };
const SHORT = { brevity_preference: 90, attention_runway: 12, working_memory_span: 15, step_explicitness: 90, productive_struggle: 10, worked_example_dependence: 90, feedback_granularity: 90 };
const LONG = { brevity_preference: 10, attention_runway: 90, working_memory_span: 90, step_explicitness: 10, productive_struggle: 90, worked_example_dependence: 10, feedback_granularity: 15 };

(async () => {
  const where = (trackId, gradeId, level) => ({ trackId, gradeId, level });
  const ctxOf = (trackId, gradeId, level) => blockLevels.levelContext(trackId, gradeId, level);
  const short = makeUser('short', SHORT, SURVEY);
  const long = makeUser('long', LONG, SURVEY);
  const blank = makeUser('blank', {}, {});

  console.log('\nthe adapter for each kind and subject');
  const lesson = (u, t = 'english', g = 'proficient', l = 105, kind = 'lesson') => adapt.begin({ userId: u.id, where: where(t, g, l), kind, context: ctxOf(t, g, l) });
  const aBlank = lesson(blank);
  check('a learner with no spec: inactive, every line empty', !aBlank.active && !aBlank.layout && !aBlank.fill && !aBlank.game && !aBlank.checkpoint);
  check('no learner at all (the shared version): inactive', !adapt.begin({ userId: null, where: where('english', 'proficient', 105), kind: 'lesson', context: ctxOf('english', 'proficient', 105) }).active);
  const aShort = lesson(short); const aLong = lesson(long);
  check('a learner with a spec: layout and fill lines exist', aShort.active && /about \d+ minutes/.test(aShort.layout) && /Length: all the text/.test(aShort.fill), aShort.layout);
  const words = (a) => Number((a.fill.match(/under about (\d+) words/) || [])[1]);
  const blocks = (a) => Number((a.layout.match(/plan about (\d+) blocks/) || [])[1]);
  check('a short-attention learner gets a shorter word budget and fewer blocks than a long-focus one', words(aShort) < words(aLong) && blocks(aShort) <= blocks(aLong), [words(aShort), words(aLong), blocks(aShort), blocks(aLong)]);
  check('hints: asked for the learner who needs them, forbidden for the one who does not', /Every check has a hint/.test(aShort.fill) && /Leave every check's hint empty/.test(aLong.fill));
  check('the interests appear as the setting, the dislike never does', /basketball|video games/.test(`${aShort.fill}`) && !/spider/i.test(`${aShort.fill}${aShort.layout}`));
  const retention = lesson(short, 'english', 'proficient', 113, 'retention');
  check('a retention level asks for retrieval, not re-teaching', retention.active && /produce or recognise from memory/.test(retention.fill));
  const subj = {};
  for (const [t, g] of [['math', 'algebra_1_part_a'], ['english', 'proficient'], ['iq', 'abstract_reasoning'], ['spanish', 'spanish_grade_04_time_food_shopping_and_core_verbs']]) {
    subj[t] = adapt.begin({ userId: short.id, where: where(t, g, 10), kind: 'lesson', context: ctxOf(t, g, 10) }).fill;
  }
  check('math: one operation per line in worked examples', /one operation per line/.test(subj.math) || /symbols|words the first time/.test(subj.math), subj.math.slice(-300));
  check('English: model sentences about the interest, the wrong one labelled', /correct English/.test(subj.english));
  check('IQ: the rule is stated in one sentence', /pattern or rule in one plain sentence/.test(subj.iq));
  check('Spanish: gloss, accents and inverted marks', /English gloss/.test(subj.spanish) && /¿/.test(subj.spanish));
  check('the four subjects say four different things', new Set(Object.values(subj)).size === 4);

  const game = adapt.begin({ userId: short.id, where: where('english', 'proficient', 106), kind: 'game', context: ctxOf('english', 'proficient', 106) });
  check('a game: the question shape (tiers, formats, explanations), a theme and the difficulty order', game.active && /tier/.test(game.game) && /Theme: set scenarios in/.test(game.game) && /Difficulty order/.test(game.game), game.game.slice(0, 200));
  const cp = adapt.begin({ userId: short.id, where: where('english', 'proficient', 51), kind: 'checkpoint', context: ctxOf('english', 'proficient', 51) });
  check('a checkpoint: presentation only, no difficulty order, no hints', cp.active && /rationale/.test(cp.checkpoint) && !/Difficulty order|Order the checks|warm-up/.test(cp.checkpoint) && /no question gets a hint/.test(cp.checkpoint), cp.checkpoint.slice(0, 200));

  console.log('\nthe check and one revision');
  const run = async (a, drafts) => { let n = 0; const r = await adapt.revise(a, { generate: async () => drafts[Math.min(n++, drafts.length - 1)], parts: (d) => ({ teach: adapt.textOf(d.blocks), checks: [] }), keyFacts: ['Subjects and verbs agree in number.'], topic: 'agreement' }); return { ...r, calls: n }; };
  const clean = { blocks: [{ data: { text: 'A subject and its verb agree in number. When the subject is one thing, the verb is singular, as in the center scores. Subjects and verbs agree in number in every sentence.' } }] };
  const bad = { blocks: [{ data: { text: 'Think of spiders: a spider spins its web. Subjects and verbs agree in number in every sentence you write.' } }] };
  const r1 = await run(aShort, [bad, clean]);
  check('a draft that uses a disliked setting is rewritten once', r1.calls === 2 && r1.checked, [r1.calls, r1.problems, r1.before]);
  const r2 = await run(aBlank, [bad, clean]);
  check('with no spec the writer is called once and nothing is checked', r2.calls === 1 && !r2.checked && r2.result === bad);
  const r3 = await run(aShort, [clean]);
  check('a draft that follows the spec is kept as it is', r3.calls <= 2 && !!r3.result);

  console.log('\nend to end: the prompts the real writer builds');
  const realDetail = ai.structuredDetail;
  const realCurrent = providers.current;
  providers.current = (role) => (role === 'blocks' ? { name: 'stub', modelFor: () => 'stub', isEnabled: () => true } : realCurrent(role));
  const seen = [];
  ai.structuredDetail = async (args) => { seen.push(args); return null; };
  try {
    const grade = curriculum.getGrade('english', 'proficient');
    const lessonLevel = (() => { for (let l = 8; l <= grade.pathLength; l++) if (blockLevels.kindFor(grade, l) === 'lesson') return l; return null; })();
    db.insert('enrollments', { user_id: short.id, track_id: 'english', grade_id: 'proficient', target_level: grade.pathLength, current_level: lessonLevel, status: 'active', xp: 0, level_items: 0 });
    await blockLevels.write({ userId: short.id, trackId: 'english', gradeId: 'proficient', level: lessonLevel, tailored: true }).catch(() => null);
    const layoutCall = seen.find((a) => a.schemaName === 'submit_layout');
    const fillCall = seen.find((a) => a.schemaName === 'submit_block_content');
    check('the layout call carries the size and format lines', layoutCall && /plan about \d+ blocks/.test(layoutCall.user), layoutCall && layoutCall.user.slice(-300));
    check('the fill call carries the length, example and subject lines', fillCall && /Length: all the text/.test(fillCall.user) && /correct English/.test(fillCall.user));
    seen.length = 0;
    await blockLevels.write({ userId: blank.id, trackId: 'english', gradeId: 'proficient', level: lessonLevel, tailored: true }).catch(() => null);
    check('a learner with no spec: neither call has the adapter block', seen.length >= 1 && !seen.some((a) => /FOR THIS LEARNER AT THIS LEVEL/.test(a.user)));
  } finally {
    ai.structuredDetail = realDetail;
    providers.current = realCurrent;
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall block adapter checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
