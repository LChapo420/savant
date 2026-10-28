/**
 * In-process test of the learning scorecard and how it reaches the level editor.
 *
 *   node scripts/scorecard-test.js      (also run by `npm test`)
 *
 * No model is called. Where the level editor needs one, a stub stands in for it,
 * so the test can check what matters without a key: that the brief carries the
 * scorecard, that a rewrite of the creator's real level 105 page is kept when it
 * is whole and refused when it is not, that holdouts are left alone, and that
 * evidence moves the right stats by the right amount.
 *
 * It writes to its own copy of the data file (deleted at the end), under
 * accounts named scoretest-*, unless DB_FILE=<file> names one.
 *
 * Every model key is blanked first. "No model is called" used to depend on no
 * provider being configured, and on a machine with a key in its environment the
 * after-level read went out for real (paid OpenRouter calls).
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';

const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `scorecard-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
// config/db is loaded here, on the copy, so its own exit write is registered
// before this cleanup: registered the other way round, the copy was deleted and
// then written back, leaving 140 MB behind each run.
require('../config/db');
process.on('exit', () => { if (ownCopy) try { fs.unlinkSync(ownCopy); } catch { /* gone */ } });

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const baseLessons = require('../config/base-lessons');
const sessions = require('../services/sessions');
const learner = require('../services/learner');
const details = require('../services/details');
const ai = require('../services/ai');
const providers = require('../services/providers');
const levelEditor = require('../services/level-editor');
const personalize = require('../services/personalize');
const scorecard = require('../services/scorecard');
const translate = require('../services/scorecard/translate');
const signals = require('../services/scorecard/signals');
const hooks = require('../services/scorecard/hooks');
const summary = require('../services/scorecard/summary');

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}

function makeUser(tag, extra = {}) {
  const user = db.insert('users', {
    email: `scoretest-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`,
    display_name: `Score Test ${tag}`,
    password_hash: 'not-a-real-hash',
    xp: 0,
    streak: 0,
    onboarded: true,
  });
  if (Object.keys(extra).length) learner.saveProfile(user.id, extra);
  return user;
}

function enroll(user, trackId, gradeId, level) {
  return db.insert('enrollments', {
    user_id: user.id,
    track_id: trackId,
    grade_id: gradeId,
    target_level: curriculum.getGrade(trackId, gradeId).pathLength,
    current_level: level,
    level_items: 0,
    levels_completed: 0,
    xp: 0,
    status: 'active',
    pending_checkpoint: null,
  });
}

/** Make a stat confidently sit at `value`. */
function settle(userId, stat, value, times = 12, trackId) {
  for (let i = 0; i < times; i++) scorecard.observe(userId, [{ stat, value, weight: 1 }], { source: 'test', trackId });
}

(async () => {
  // ── the stats ────────────────────────────────────────────────────────────
  console.log('\nstats');
  check('there are exactly 100 stats', scorecard.STATS.length === 100, scorecard.STATS.length);
  check('ten categories of ten', scorecard.CATEGORIES.every((c) => scorecard.STATS.filter((s) => s.category === c.id).length === 10));
  const promised = ['cognitive_flexibility', 'deductive_trajectory', 'inductive_trajectory', 'stimulus_envelope',
    'cycle_architecture', 'intake_baseline', 'failure_response'];
  check('the stats named in the brief all exist', promised.every((id) => scorecard.BY_ID[id]));
  check('every lesson stat has an instruction', scorecard.STATS.filter((s) => s.use.includes('L')).every((s) => s.dir[0] || s.dir[1]));
  check('no instruction talks about check questions, which lesson pages do not have',
    !scorecard.STATS.some((s) => s.dir.some((d) => d && /check questions/i.test(d))));
  check('every combined instruction points at a real side',
    translate.COMBINED.every(([a, sa, b, sb]) => scorecard.BY_ID[a] && scorecard.BY_ID[b]
      && scorecard.BY_ID[a].dir[sa === 'high' ? 1 : 0] && scorecard.BY_ID[b].dir[sb === 'high' ? 1 : 0]));

  // ── the arithmetic ───────────────────────────────────────────────────────
  console.log('\nscoring');
  const u1 = makeUser('math');
  check('a new scorecard has zero confidence', scorecard.overallConfidence(scorecard.get(u1.id)) === 0);
  scorecard.observe(u1.id, [{ stat: 'intake_baseline', value: 100, weight: 1 }], { source: 'test' });
  let r = scorecard.read(scorecard.get(u1.id), 'intake_baseline');
  check('one observation moves the score toward it, at most MAX_STEP', r.score > 50 && r.score <= 50 + scorecard.MAX_STEP, r.score);
  check('one observation gives some confidence, not much', r.confidence > 0 && r.confidence < 40, r.confidence);
  scorecard.observe(u1.id, Array.from({ length: 10 }, () => ({ stat: 'working_memory_span', value: 100, weight: 1 })), { source: 'test' });
  check('one batch cannot redefine a learner', scorecard.read(scorecard.get(u1.id), 'working_memory_span').score <= 50 + scorecard.MAX_STEP);
  settle(u1.id, 'processing_velocity', 90, 30);
  r = scorecard.read(scorecard.get(u1.id), 'processing_velocity');
  check('consistent evidence converges with high confidence', r.score >= 82 && r.confidence >= 85, r);
  settle(u1.id, 'processing_velocity', 20, 30);
  check('a learner who changes is tracked, not frozen', scorecard.read(scorecard.get(u1.id), 'processing_velocity').score < 40);
  settle(u1.id, 'prior_knowledge', 90, 10, 'math');
  scorecard.observe(u1.id, [{ stat: 'prior_knowledge', value: 15, weight: 1 }], { source: 'test', trackId: 'english' });
  const mathPrior = scorecard.read(scorecard.get(u1.id), 'prior_knowledge', { trackId: 'math' }).score;
  const engPrior = scorecard.read(scorecard.get(u1.id), 'prior_knowledge', { trackId: 'english' }).score;
  check('per-subject stats keep subjects apart', mathPrior - engPrior > 20, { mathPrior, engPrior });

  // ── translation ──────────────────────────────────────────────────────────
  console.log('\ntranslation');
  const u2 = makeUser('translate');
  check('a new learner gets no instructions', translate.directives(scorecard.get(u2.id)).length === 0);
  scorecard.observe(u2.id, [{ stat: 'inductive_trajectory', value: 100, weight: 0.2 }], { source: 'test' });
  check('an unconfident score produces no instruction', !translate.directives(scorecard.get(u2.id)).some((d) => d.stat === 'inductive_trajectory'));
  settle(u2.id, 'inductive_trajectory', 92);
  check('a confident high score produces its instruction', translate.directives(scorecard.get(u2.id)).some((d) => d.stat === 'inductive_trajectory' && d.strong));
  settle(u2.id, 'step_explicitness', 90);
  settle(u2.id, 'brevity_preference', 90);
  const merged = translate.directives(scorecard.get(u2.id));
  check('conflicting instructions are merged into one',
    merged.some((d) => d.stat === 'step_explicitness+brevity_preference') && !merged.some((d) => d.stat === 'brevity_preference'));
  for (const s of scorecard.STATS.slice(0, 60)) settle(u2.id, s.id, 95, 6);
  check('instructions are capped and ranked', (() => {
    const l = translate.directives(scorecard.get(u2.id));
    return l.length <= translate.MAX_DIRECTIVES && l.every((d, i) => i === 0 || l[i - 1].priority >= d.priority);
  })());

  // ── signals ──────────────────────────────────────────────────────────────
  console.log('\nsignals');
  const sureWrong = signals.fromAnswer({ prompt: 'What is 3 + 4?', difficulty: 3, ms: 6000, correct: false, confidence: 'sure', role: 'focus', format: 'type_in' });
  check('sure but wrong lowers calibration', sureWrong.some((o) => o.stat === 'confidence_calibration' && o.value < 30));
  check('a missed review raises the decay rate',
    signals.fromAnswer({ prompt: 'x', difficulty: 4, ms: 8000, correct: false, role: 'review', format: 'type_in' }).some((o) => o.stat === 'decay_rate' && o.value > 60));
  const block = [true, false, true, false, true, true, false, true].map((c, i) => ({
    id: i + 1, index: i, prompt: 'Solve for x in this equation', difficulty: 5, ms: 9000, correct: c, role: 'focus', format: 'type_in',
  }));
  check('recovering after every miss scores a good failure response', signals.fromBlock(block).some((o) => o.stat === 'failure_response' && o.value > 70));
  const page = signals.fromBaseLesson({ readMs: 0, words: 3000, nextAccuracy: 0.9, baseline: 0.6,
    experiment: { stat: 'analogical_transfer', arm: 'high', label: 'an analogy' } });
  check('a lesson page whose next level beat the usual credits its experiment',
    page.some((o) => o.stat === 'analogical_transfer' && o.value > 60), page);
  check('a lesson page skimmed in seconds reads as rushing',
    signals.fromBaseLesson({ readMs: 20000, words: 3000 }).some((o) => o.stat === 'rush_tendency'));
  check('the feedback taps move the right stats', (() => {
    const fb = signals.fromFeedback({ length: 'long', pace: 'fast' });
    return fb.some((o) => o.stat === 'brevity_preference' && o.value > 60) && fb.every((o) => o.weight <= 0.3);
  })());

  // ── the profile, the coach and the questionnaire ─────────────────────────
  console.log('\nprofile');
  const u3 = makeUser('profile', { survey: learner.cleanSurvey({ hobbies: 'skateboarding and chess' }) });
  scorecard.seedFromStyleQuiz(u3.id, { example_order: 1 });
  const seeded = scorecard.read(scorecard.get(u3.id), 'inductive_trajectory');
  check('the questionnaire nudges the scorecard but is not trusted alone', seeded.score > 50 && seeded.confidence < translate.MIN_CONF, seeded);
  const before = learner.effective({ ...learner.getProfile(u3.id) }, 'challenge_appetite');
  settle(u3.id, 'challenge_appetite', 95, 20);
  const after = learner.effective({ ...learner.getProfile(u3.id) }, 'challenge_appetite');
  check('a confident scorecard steers the session settings', after > before + 0.25, { before, after });
  const coach = learner.teachingBrief(u3.id, {});
  check('the coach brief carries the scorecard and their interests', /MEASURED SCORECARD/.test(coach) && /skateboarding/.test(coach));

  // ── the route ────────────────────────────────────────────────────────────
  console.log('\nprovider route');
  // The owner's lineup (2026-10-22): NVIDIA build first, Claude last; MiMo and paid
  // OpenRouter are out (curriculum-build/MODEL-LINEUP.md).
  const keys = { o: process.env.OPENROUTER_API_KEY, m: process.env.MIMO_API_KEY, n: process.env.NVIDIA_API_KEY };
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.MIMO_API_KEY = 'test-key';
  process.env.NVIDIA_API_KEY = 'test-key';
  // Since 2026-10-23 the free fallbacks (local, Gemini free tier, OpenRouter `:free`)
  // sit between NVIDIA and Claude: still nothing paid, MiMo never, Claude last.
  const FREE_CHAIN = 'nvidia,ollama,gemini_free,openrouter_free,anthropic';
  check('a level for one learner is written by NVIDIA, then the free fallbacks, then Claude last, and nothing else',
    providers.order('personalize').join(',') === FREE_CHAIN, providers.order('personalize'));
  const declared = process.env.AI_PROVIDER_PERSONALIZE_FALLBACK;
  process.env.AI_PROVIDER_PERSONALIZE_FALLBACK = 'mimo';
  check('spelling MiMo in as the fallback in .env does not let it in',
    providers.order('personalize').join(',') === FREE_CHAIN, providers.order('personalize'));
  if (declared === undefined) delete process.env.AI_PROVIDER_PERSONALIZE_FALLBACK;
  else process.env.AI_PROVIDER_PERSONALIZE_FALLBACK = declared;
  {
    const live = providers.chain('personalize');
    const names = live.map((p) => p.name);
    const orFree = live.find((p) => p.name === 'openrouter_free');
    check('even with MiMo and OpenRouter keys present, NVIDIA answers first and nothing paid can answer (OpenRouter only as its $0 `:free` tier)',
      names[0] === 'nvidia' && !names.some((n) => ['mimo', 'openrouter', 'gemini'].includes(n))
      && names.every((n) => ['nvidia', 'ollama', 'gemini_free', 'openrouter_free', 'anthropic'].includes(n))
      && (!orFree || (orFree.status().models || []).every((m) => /:free$/.test(m))), names);
  }
  check('on NVIDIA it is a fast-thinking model unless the lineup says otherwise',
    ['z-ai/glm-5.3-flash', 'deepseek-ai/deepseek-v4.1-flash', 'z-ai/glm-5.3'].includes(providers.chain('personalize')[0].modelFor('personalize')),
    providers.chain('personalize')[0].modelFor('personalize'));
  if (keys.o === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = keys.o;
  if (keys.m === undefined) delete process.env.MIMO_API_KEY; else process.env.MIMO_API_KEY = keys.m;
  if (keys.n === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = keys.n;

  // ── the brief the level editor sends ─────────────────────────────────────
  console.log('\nthe brief');
  const u4 = makeUser('brief', { subscription: 'pro', survey: learner.cleanSurvey({ hobbies: 'basketball' }) });
  enroll(u4, 'english', 'proficient', 104);
  settle(u4.id, 'brevity_preference', 92);
  const where = { trackId: 'english', gradeId: 'proficient', level: 105 };
  const brief = details.brief(u4.id, where);
  check('the brief carries the measured instructions', /learning scorecard/.test(brief) && /as brief as possible/.test(brief));
  check('the brief never shows raw scores', !/\bconfidence \d|score \d/i.test(brief));
  const hashBefore = details.briefHash(u4.id, where);
  scorecard.observe(u4.id, [{ stat: 'brevity_preference', value: 93, weight: 0.2 }], { source: 'test' });
  check('a small move that changes no instruction does not make a written level stale',
    details.briefHash(u4.id, where) === hashBefore);

  // ── holdout and experiments ──────────────────────────────────────────────
  console.log('\nholdout and experiments');
  check('a level\'s arm is the same every time it is asked', JSON.stringify(personalize.armFor(u4.id, where)) === JSON.stringify(personalize.armFor(u4.id, where)));
  // A new learner: nothing is known, so every experiment is open to them.
  const fresh = makeUser('arms');
  let holdouts = 0;
  let trials = 0;
  for (let level = 1; level <= 1000; level++) {
    const a = personalize.armFor(fresh.id, { trackId: 'english', gradeId: 'proficient', level });
    if (a.arm === 'holdout') holdouts++;
    if (a.experiment) trials++;
  }
  check('about one level in ten is a holdout', holdouts > 60 && holdouts < 140, holdouts);
  check('about a third of the rest try one way of teaching', trials > 230 && trials < 400, trials);
  // A learner confidently known on every stat an experiment could test.
  const settled = makeUser('settled');
  for (const e of personalize.EXPERIMENTS) settle(settled.id, e.stat, 80, 10);
  let known = 0;
  for (let level = 1; level <= 200; level++) {
    if (personalize.armFor(settled.id, { trackId: 'english', gradeId: 'proficient', level }).experiment) known++;
  }
  check('nothing is experimented on once it is confidently known', known === 0, known);

  // ── the creator's real lesson 105, rewritten by a stub ───────────────────
  console.log('\nlevel editor on the real level 105 (stub model)');
  const base = baseLessons.get('english', 'proficient', 105);
  check('the creator\'s level 105 page is here', !!base && base.html.length > 20000, base && base.html.length);
  check('it passes its own checks unchanged', personalize.checkAgainstBase(base.html, base.html) === null);
  const firstId = (base.html.match(/\sid="([^"]+)"/) || [])[1];
  check('a rewrite that drops one of its element ids is refused',
    /missing/.test(personalize.checkAgainstBase(base.html.replace(` id="${firstId}"`, ''), base.html) || ''));
  check('a rewrite that breaks its script is refused',
    /compiles/.test(personalize.checkAgainstBase(base.html.replace('</script>', '{{{ </script>'), base.html) || ''));

  const realTalk = ai.talkDetail;
  const seen = [];
  let reply = 'good';
  ai.talkDetail = async ({ role, messages }) => {
    seen.push({ role, prompt: messages[0].content });
    const html = reply === 'good'
      ? base.html.replace(/Tone Control/, 'Tone Control, courtside')
      : base.html.replace(` id="${firstId}"`, '');
    return { text: html, model: 'stub/deepseek' };
  };
  try {
    // A learner whose level 105 is not a holdout, so the editor writes it.
    let learnerTailored = null;
    for (let i = 0; i < 40 && !learnerTailored; i++) {
      const candidate = makeUser(`tailored-${i}`, { subscription: 'pro', survey: learner.cleanSurvey({ hobbies: 'basketball' }) });
      if (personalize.armFor(candidate.id, where).arm !== 'holdout') learnerTailored = candidate;
    }
    const e5 = enroll(learnerTailored, 'english', 'proficient', 104);
    settle(learnerTailored.id, 'inductive_trajectory', 92);
    const written = await levelEditor.ensure({
      userId: learnerTailored.id, enrollment: e5, grade: curriculum.getGrade('english', 'proficient'), level: 105,
    });
    check('the level is written for the learner', written && written.kind === 'edited', written && written.kind);
    check('on the personalize route', seen.length === 1 && seen[0].role === 'personalize', seen.map((s) => s.role));
    check('with the creator\'s page and the scorecard in one prompt',
      seen[0] && seen[0].prompt.includes('Tone Control') && /learning scorecard/.test(seen[0].prompt) && /concrete cases/.test(seen[0].prompt));
    const row = db.findOne('level_edits', (x) => x.user_id === learnerTailored.id && x.level === 105);
    check('it is stored with its arm and the model that wrote it', row && row.arm === 'tailored' && row.model === 'stub/deepseek', row && { arm: row.arm, model: row.model });

    // Finishing it, and the level after it.
    hooks.onBaseLessonFinished(learnerTailored.id, {
      trackId: 'english', gradeId: 'proficient', level: 105, skillId: 'word_choice', readMs: 240000, words: 3000,
      basis: 'edited', arm: 'tailored', experiment: row.experiment,
    });
    hooks.creditPendingLesson(learnerTailored.id, { trackId: 'english', gradeId: 'proficient', level: 106, accuracy: 0.8 });
    const signal = db.find('level_signals', (x) => x.user_id === learnerTailored.id && x.kind === 'base_lesson').pop();
    check('the lesson page is judged by the level after it', signal && signal.pending === false && signal.accuracy === 0.8, signal);
    check('and the next level\'s writer is told how it went',
      hooks.conclusionsFor(learnerTailored.id, { trackId: 'english', gradeId: 'proficient' }).some((c) => /level after it came out at 80%/.test(c)));

    // A rewrite that breaks the page is refused and the shared page stands.
    reply = 'bad';
    const other = makeUser('tailored-bad', { subscription: 'pro' });
    const e6 = enroll(other, 'english', 'proficient', 104);
    if (personalize.armFor(other.id, where).arm !== 'holdout') {
      const refused = await levelEditor.ensure({ userId: other.id, enrollment: e6, grade: curriculum.getGrade('english', 'proficient'), level: 105 });
      check('a rewrite that breaks the page is refused, and the shared page is served', refused && refused.kind === 'base', refused && refused.kind);
      check('and it is never served later', levelEditor.forLevel(other.id, 'english', 'proficient', 105) === null);
    }

    // A holdout is never sent to the model.
    let holdoutUser = null;
    for (let i = 0; i < 400 && !holdoutUser; i++) {
      const candidate = makeUser(`holdout-${i}`, { subscription: 'pro' });
      if (personalize.armFor(candidate.id, where).arm === 'holdout') holdoutUser = candidate;
    }
    const calls = seen.length;
    const e7 = enroll(holdoutUser, 'english', 'proficient', 104);
    const held = await levelEditor.ensure({ userId: holdoutUser.id, enrollment: e7, grade: curriculum.getGrade('english', 'proficient'), level: 105 });
    check('a holdout level is the shared page, and no model is asked', held && held.kind === 'base' && seen.length === calls, { kind: held && held.kind, calls: seen.length - calls });
  } finally {
    ai.talkDetail = realTalk;
  }

  // ── evidence from the real session path ──────────────────────────────────
  console.log('\nsessions');
  const u8 = makeUser('session');
  const e8 = enroll(u8, 'english', 'proficient', 101);
  const grade = curriculum.getGrade('english', 'proficient');
  const opened = await sessions.createSession({ userId: u8.id, enrollment: db.byId('enrollments', e8.id), grade });
  for (const [n, item] of opened.items.entries()) {
    await sessions.answer({ userId: u8.id, session: opened.session, itemId: item.id, userAnswer: item.answer, ms: 7000, confidence: n === 0 ? 'sure' : null, changes: 1 });
  }
  check('confidence is stored on the answer', db.byId('items', opened.items[0].id).confidence === 'sure');
  check('every answer reaches the scorecard', scorecard.get(u8.id).log.some((l) => /^answer:/.test(l.source)));
  sessions.resolveBlock({ userId: u8.id, session: db.byId('sessions', opened.session.id), enrollment: db.byId('enrollments', e8.id), grade, blockIndex: 0 });
  check('closing the level writes its conclusion',
    db.find('level_signals', (x) => x.user_id === u8.id && /Level 101 \(practice\)/.test(x.conclusion || '')).length === 1);
  const said = hooks.onFeedback(u8.id, { trackId: 'english', gradeId: 'proficient', level: 101, length: 'long', liked: 'the examples' });
  check('the feedback taps are recorded', said && said.length === 'long');
  const finished = await sessions.finish({ userId: u8.id, session: db.byId('sessions', opened.session.id) });
  check('the session finishes normally', typeof finished.accuracy === 'number');

  // ── the after-level read (stub model) ────────────────────────────────────
  console.log('\nafter-level reads');
  // eslint-disable-next-line global-require
  const record = require('../services/learner-record');
  const realStructured = ai.structured;
  const realCurrent = providers.current;
  const stubProvider = { name: 'stub', modelFor: () => 'stub-model', isEnabled: () => true };
  let nextRead = null;
  let nextReview = null;
  const prompts = [];
  ai.structured = async ({ schemaName, user, system }) => {
    prompts.push({ schemaName, user, system });
    if (schemaName === 'submit_level_read') return nextRead;
    if (schemaName === 'submit_review') return nextReview;
    return null;
  };
  providers.current = (role) => (role === 'personalize' ? stubProvider : realCurrent(role));
  const emptyRead = (extra) => ({ conclusion: '', emotions: [], stat_changes: [], facts: [], recommendation_votes: [], ...extra });
  // Work the whole queue, not the default five. `processDue` takes the oldest
  // rows first, and this file is the real data file: a read left behind by an
  // earlier run is legitimately older than the one this test is watching, so
  // the row under test falls outside the default limit — and then outside it
  // for good, because every run leaves a few more behind. A test that depends
  // on queue depth is a test that fails on its second run. In production the
  // timer drains the backlog unaided; here it is asked for outright.
  const runDue = () => record.processDue(500);
  try {
    // A level ends: its read is queued, waiting for feedback.
    const r1 = makeUser('reads');
    const e9 = enroll(r1, 'english', 'proficient', 101);
    const s9 = await sessions.createSession({ userId: r1.id, enrollment: db.byId('enrollments', e9.id), grade });
    for (const [n, item] of s9.items.entries()) {
      await sessions.answer({ userId: r1.id, session: s9.session, itemId: item.id, userAnswer: n === 0 ? 'not it' : item.answer, ms: n === 0 ? 61000 : 6000 });
    }
    db.update('items', s9.items[0].id, { coach_used: true, coach_log: ['I do not get what tone means here'] });
    sessions.resolveBlock({ userId: r1.id, session: db.byId('sessions', s9.session.id), enrollment: db.byId('enrollments', e9.id), grade, blockIndex: 0 });
    const queued = db.find('level_debriefs', (d) => d.user_id === r1.id && d.level === 101).pop();
    check('finishing a level queues its read', !!queued && queued.status === 'pending' && queued.item_ids.length === s9.items.length);
    check('it waits for feedback before running', Date.parse(queued.due_at) > Date.now() + 60000);

    // They leave feedback: the read runs now, as the feedback version.
    const fb = db.insert('level_feedback', {
      user_id: r1.id, track_id: 'english', grade_id: 'proficient', level: 101, liked: 'the sneaker examples',
      disliked: 'the wall of text at the start', comments: 'I felt lost and a bit annoyed', submitted_at: new Date().toISOString(),
    });
    record.attachFeedback(r1.id, { trackId: 'english', gradeId: 'proficient', level: 101, feedbackId: fb.id });
    check('feedback makes the read due now', Date.parse(db.byId('level_debriefs', queued.id).due_at) <= Date.now());
    const humorBefore = scorecard.read(scorecard.get(r1.id), 'humor_receptivity').score;
    nextRead = emptyRead({
      conclusion: 'Engaged by interest-based examples, put off by long intros; felt lost early.',
      emotions: ['annoyed by the long intro'],
      stat_changes: [{ stat: 'humor_receptivity', delta: 25, reason: 'asked for lighter tone' }, { stat: 'made_up_stat', delta: 10, reason: 'x' }],
      facts: [{ kind: 'struggle', topic: 'tone', text: 'Cannot tell formal from neutral tone in a sentence', question_shape: 'pick the more formal of two near-identical sentences', hint_idea: 'Look for contractions and slang first', relation: 'new', fact_id: '', reasoning: '' }],
    });
    await runDue();
    const ran = db.byId('level_debriefs', queued.id);
    check('the read ran in feedback mode', ran.status === 'done' && ran.mode === 'feedback', ran.status);
    const fp = prompts.filter((p) => p.schemaName === 'submit_level_read').pop();
    check('one prompt carries what they liked, disliked and said, and the level\'s content',
      /the sneaker examples/.test(fp.user) && /wall of text/.test(fp.user) && /felt lost/.test(fp.user) && /THE LEVEL:/.test(fp.user));
    check('it carries every one of the 100 stats with what it means and where they are now',
      scorecard.STATS.every((st) => fp.user.includes(`${st.id} — ${st.name}`)));
    check('it explains the rules, including the one-point limit', /at most 1 point/.test(fp.system) && /11 different levels/.test(fp.system));
    check('a filler level is labelled as one', /filler made from the question bank/.test(fp.user));
    const humorAfter = scorecard.read(scorecard.get(r1.id), 'humor_receptivity').score;
    check('a suggested +25 moves the stat by exactly 1', humorAfter - humorBefore === 1, { humorBefore, humorAfter });
    check('the conclusion goes on their record', record.get(r1.id).conclusions.some((c) => /put off by long intros/.test(c.text)));
    check('and into the conclusions their profile shows',
      ((learner.getProfile(r1.id).feedback_conclusions || [])[0] || '').includes('long intros'));

    // Without feedback, the read is of their answers: wrong ones, timings, the coach.
    const r2 = makeUser('reads-perf');
    const e10 = enroll(r2, 'english', 'proficient', 101);
    const s10 = await sessions.createSession({ userId: r2.id, enrollment: db.byId('enrollments', e10.id), grade });
    for (const [n, item] of s10.items.entries()) {
      await sessions.answer({ userId: r2.id, session: s10.session, itemId: item.id, userAnswer: n === 0 ? 'wrong answer' : item.answer, ms: 9000 });
    }
    db.update('items', s10.items[0].id, { coach_used: true, coach_log: ['why is B not formal'] });
    sessions.resolveBlock({ userId: r2.id, session: db.byId('sessions', s10.session.id), enrollment: db.byId('enrollments', e10.id), grade, blockIndex: 0 });
    const q2 = db.find('level_debriefs', (d) => d.user_id === r2.id).pop();
    db.update('level_debriefs', q2.id, { due_at: new Date().toISOString() });
    nextRead = emptyRead({ conclusion: 'Struggles to separate formal and neutral tone.' });
    await runDue();
    const pp = prompts.filter((p) => p.schemaName === 'submit_level_read').pop();
    check('without feedback the read is in performance mode', db.byId('level_debriefs', q2.id).mode === 'performance');
    check('and carries the wrong answers, their timings and what they said to the coach',
      /WRONG in 9s/.test(pp.user) && /reasonable time is about/.test(pp.user) && /why is B not formal/.test(pp.user));

    // A big change needs big suggestions from 11 different levels.
    const r3 = makeUser('big');
    // Pinned first, because this assertion is about the one-point clamp and the
    // eleven-level release, not about where the learner started. A brand-new
    // scorecard sits at the population's average once enough learners have been
    // measured, and that average drifts upward as the database fills: unpinned,
    // the starting score rose far enough that the full +25 ran into the stat's
    // ceiling and the delta was merely whatever was left over. That passes in an
    // empty database and fails in a used one, which is the worst kind of test.
    settle(r3.id, 'narrative_pull', 50);
    const start = scorecard.read(scorecard.get(r3.id), 'narrative_pull').score;
    for (let i = 1; i <= 10; i++) {
      record.applyDebrief(r3.id, emptyRead({ stat_changes: [{ stat: 'narrative_pull', delta: 25, reason: 'loved the story' }] }),
        { trackId: 'english', gradeId: 'proficient', level: 200 + i, mode: 'performance' });
    }
    const afterTen = scorecard.read(scorecard.get(r3.id), 'narrative_pull').score;
    check('ten levels asking for +25 move it one point each', afterTen - start === 10, afterTen - start);
    record.applyDebrief(r3.id, emptyRead({ stat_changes: [{ stat: 'narrative_pull', delta: 25, reason: 'loved the story' }] }),
      { trackId: 'english', gradeId: 'proficient', level: 211, mode: 'performance' });
    const afterEleven = scorecard.read(scorecard.get(r3.id), 'narrative_pull').score;
    check('the eleventh lets the full change through', afterEleven - afterTen === 25, afterEleven - afterTen);
    record.applyDebrief(r3.id, emptyRead({ stat_changes: [{ stat: 'narrative_pull', delta: 25, reason: 'again' }] }),
      { trackId: 'english', gradeId: 'proficient', level: 211, mode: 'performance' });
    check('the same level twice does not count twice', (record.get(r3.id).big.narrative_pull || {}).count <= 1);

    // Nine reads say one thing, one says the other: nothing solid changes.
    const r4 = makeUser('conflict');
    for (let i = 1; i <= 9; i++) {
      record.applyDebrief(r4.id, emptyRead({ stat_changes: [{ stat: 'brevity_preference', delta: 5, reason: 'wanted it shorter' }] }),
        { trackId: 'english', gradeId: 'proficient', level: 300 + i, mode: 'performance' });
    }
    const brevityBefore = scorecard.read(scorecard.get(r4.id), 'brevity_preference').score;
    record.applyDebrief(r4.id, emptyRead({ stat_changes: [{ stat: 'brevity_preference', delta: -5, reason: 'wanted more detail this time' }] }),
      { trackId: 'english', gradeId: 'proficient', level: 310, mode: 'performance' });
    check('one read against nine changes nothing', scorecard.read(scorecard.get(r4.id), 'brevity_preference').score === brevityBefore);
    const held = record.get(r4.id).recommendations.find((r) => r.stat === 'brevity_preference');
    check('it becomes a recommendation, with its reasoning', !!held && held.status === 'open' && /more detail/.test(held.reasons.join(' ')), held);

    // A stat the app is confident about is not moved by a read that disagrees.
    settle(r4.id, 'abstraction_tolerance', 88);
    const absBefore = scorecard.read(scorecard.get(r4.id), 'abstraction_tolerance').score;
    record.applyDebrief(r4.id, emptyRead({ stat_changes: [{ stat: 'abstraction_tolerance', delta: -20, reason: 'needed concrete cases' }] }),
      { trackId: 'english', gradeId: 'proficient', level: 311, mode: 'performance' });
    check('a confident score is not moved by a read against it',
      scorecard.read(scorecard.get(r4.id), 'abstraction_tolerance').score === absBefore);

    // Facts: tentative until three levels agree; then solid, and they reach the brief.
    const r5 = makeUser('facts', { subscription: 'pro' });
    enroll(r5, 'english', 'proficient', 104);
    const struggle = { kind: 'struggle', topic: 'tone', text: 'Mixes up formal and neutral tone', question_shape: 'choose the more formal sentence', hint_idea: 'Check for contractions first', relation: 'new', fact_id: '', reasoning: '' };
    record.applyDebrief(r5.id, emptyRead({ facts: [struggle] }), { trackId: 'english', gradeId: 'proficient', level: 101, mode: 'performance' });
    check('a first sighting is tentative', record.get(r5.id).facts[0].status === 'tentative');
    record.applyDebrief(r5.id, emptyRead({ facts: [{ ...struggle, relation: 'supports', fact_id: record.get(r5.id).facts[0].id }] }), { trackId: 'english', gradeId: 'proficient', level: 102, mode: 'performance' });
    const brief2 = details.brief(r5.id, { trackId: 'english', gradeId: 'proficient', level: 105 });
    check('a struggle seen twice reaches the next level\'s brief, with its hint',
      /WHERE THEY STRUGGLE/.test(brief2) && /Check for contractions first/.test(brief2) && /choose the more formal sentence/.test(brief2));
    record.applyDebrief(r5.id, emptyRead({ facts: [{ ...struggle, relation: 'new', text: 'Mixes up formal and neutral tone in sentences' }] }), { trackId: 'english', gradeId: 'proficient', level: 103, mode: 'performance' });
    check('a third agreeing level makes it solid, even described in new words', record.get(r5.id).facts[0].status === 'solid', record.get(r5.id).facts);
    const solidId = record.get(r5.id).facts[0].id;
    record.applyDebrief(r5.id, emptyRead({ facts: [{ ...struggle, relation: 'contradicts', fact_id: solidId, text: 'Tone is no longer a problem', reasoning: 'got every tone question right' }] }),
      { trackId: 'english', gradeId: 'proficient', level: 106, mode: 'performance' });
    const rec = record.get(r5.id);
    check('a read against a solid fact does not change it', rec.facts.find((f) => f.id === solidId).status === 'solid');
    const factRec = rec.recommendations.find((r) => r.fact_id === solidId);
    check('it becomes a recommendation instead', !!factRec && factRec.status === 'open');

    // The recommendation gathers support; a review against everything known decides.
    nextRead = emptyRead({ recommendation_votes: [{ id: factRec.id, stance: 'supports', why: 'all tone questions right again' }] });
    for (const level of [107, 108]) {
      const row = record.scheduleDebrief({ userId: r5.id, trackId: 'english', gradeId: 'proficient', level, kind: 'practice', itemIds: s10.items.map((i) => i.id) });
      db.update('level_debriefs', row.id, { due_at: new Date().toISOString() });
    }
    nextReview = { decision: 'apply', reasoning: 'Three levels of clean tone work outweigh the earlier struggle.', delta: 0, replacement: 'Has mastered telling formal from neutral tone' };
    await runDue();
    const reviewed = record.get(r5.id);
    const done = reviewed.recommendations.find((r) => r.id === factRec.id);
    check('enough support sends it to a review that sees the whole record',
      prompts.some((p) => p.schemaName === 'submit_review' && /THE WHOLE RECORD/.test(p.user) && /THE SCORECARD/.test(p.user)));
    check('an approved review applies it', done.status === 'applied'
      && reviewed.facts.find((f) => f.id === solidId).status === 'superseded'
      && reviewed.facts.some((f) => /mastered/.test(f.text) && f.status === 'solid'), done);

    // A stat recommendation, approved by review, moves the stat by the reviewed amount.
    const r6 = makeUser('stat-review');
    settle(r6.id, 'deductive_trajectory', 85);
    for (let i = 0; i < 3; i++) {
      record.applyDebrief(r6.id, emptyRead({ stat_changes: [{ stat: 'deductive_trajectory', delta: -20, reason: 'did better with examples first' }] }),
        { trackId: 'english', gradeId: 'proficient', level: 400 + i, mode: 'performance' });
    }
    const statRec = record.get(r6.id).recommendations.find((r) => r.stat === 'deductive_trajectory');
    check('repeated disagreement with a confident stat gathers on one recommendation', statRec && statRec.support === 3, statRec);
    const dBefore = scorecard.read(scorecard.get(r6.id), 'deductive_trajectory').score;
    nextReview = { decision: 'apply', reasoning: 'Consistent across levels.', delta: -12, replacement: '' };
    await record.review(r6.id, statRec.id);
    check('an approved stat recommendation moves it by the reviewed amount',
      scorecard.read(scorecard.get(r6.id), 'deductive_trajectory').score === dBefore - 12);

    // A lesson page finished with nothing said is not read; with no model, nothing is.
    const r7 = makeUser('quiet');
    const quiet = record.scheduleDebrief({ userId: r7.id, trackId: 'english', gradeId: 'proficient', level: 105, kind: 'lesson', source: 'lesson page' });
    db.update('level_debriefs', quiet.id, { due_at: new Date().toISOString() });
    await runDue();
    check('a lesson page with no feedback and no questions is skipped', db.byId('level_debriefs', quiet.id).status === 'skipped');
    check('the creator\'s page is read as a creator-made lesson page',
      /creator-made lesson page/.test(record.levelContent({ user_id: r7.id, track_id: 'english', grade_id: 'proficient', level: 105 }, []).kind));
  } finally {
    ai.structured = realStructured;
    providers.current = realCurrent;
  }
  const r8 = makeUser('nomodel');
  const nm = record.scheduleDebrief({ userId: r8.id, trackId: 'english', gradeId: 'proficient', level: 101, kind: 'practice', itemIds: [] });
  db.insert('level_feedback', { user_id: r8.id, track_id: 'english', grade_id: 'proficient', level: 101, liked: 'x', submitted_at: new Date().toISOString() });
  record.attachFeedback(r8.id, { trackId: 'english', gradeId: 'proficient', level: 101, feedbackId: db.all('level_feedback').slice(-1)[0].id });
  await runDue();
  check('without a model the read is skipped and nothing changes',
    db.byId('level_debriefs', nm.id).status === 'skipped' && record.get(r8.id).conclusions.length === 0, db.byId('level_debriefs', nm.id));

  // ── the forgetting curve for review scheduling (adaptation.js) ───────────
  console.log('\nforgetting curve export');
  {
    const forgetting = require('../services/scorecard/forgetting'); // eslint-disable-line global-require
    const none = forgetting.recallCurve(null, null);
    check('no population: the default curve, m 0, not fitted',
      !none.fitted && none.source === 'default' && none.m === 0 && none.curve.a === forgetting.DEFAULT_CURVE.a, none);
    const pop = { curve: { a: 2, b: 0.4, c: -0.2 }, norm: 0.1, tau: 0.5, tests: 900, learners: 30 };
    const typical = forgetting.recallCurve(pop, null);
    check('a population: its fitted curve, read with the typical learner\'s multiplier',
      typical.fitted && typical.curve.a === 2 && typical.m === 0.1 && typical.mSource === 'population', typical);
    // A learner who forgets every test after 3 days reads a shorter half-life than one who keeps them.
    const tests = (y) => Array.from({ length: 40 }, () => forgetting.row({ dt: 3, nc: 2, nw: 0, pk: 0.9, g: 0.1, y, day: 100 }));
    const forgets = forgetting.recallCurve(pop, tests(0), 100);
    const keeps = forgetting.recallCurve(pop, tests(1), 100);
    check('a learner\'s own multiplier follows their memory tests', forgets.mSource === 'learner' && forgets.m < 0.1 && keeps.m > 0.1, { f: forgets.m, k: keeps.m });
    const p1 = forgetting.recallAt(keeps, { days: 1, right: 2 });
    const p30 = forgetting.recallAt(keeps, { days: 30, right: 2 });
    check('predicted recall falls with time and stays a probability', p1 > p30 && p30 > 0 && p1 < 1, { p1, p30 });
    check('recallAt matches predict on the same inputs',
      Math.abs(forgetting.recallAt(typical, { days: 5, right: 3, wrong: 1, fresh: 0.95, guess: 0 })
        - forgetting.predict(pop.curve, [5, 3, 1, 0.95, 0], 0.1).P) < 1e-9);
    const live = scorecard.forgettingCurve({ userId: u1.id });
    check('scorecard.forgettingCurve always returns a usable curve',
      live && live.curve && Number.isFinite(live.curve.a) && Number.isFinite(live.m) && typeof live.fitted === 'boolean', live);
  }

  // ── the summary and the admin check ──────────────────────────────────────
  console.log('\nsummary and admin');
  check('a new learner has no tendencies yet', summary.summarize(scorecard.get(makeUser('blank').id)).strongest.length === 0);
  const sum = summary.summarize(scorecard.get(u4.id));
  check('the summary names the clearest tendency, read the right way round',
    sum.strongest.some((t) => t.id === 'brevity_preference' && t.reads === scorecard.BY_ID.brevity_preference.high), sum.strongest);
  const { isAdmin } = require('../middleware/auth'); // eslint-disable-line global-require
  check('the owner is an admin, case-insensitively', isAdmin({ email: 'The.Landon.D@gmail.com' }));
  check('nobody else is', !isAdmin({ email: 'someone@example.com' }) && !isAdmin(null));

  db.flush();
  console.log(`\n${failures ? `${failures} failure(s)` : 'all scorecard checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('scorecard test crashed:', err);
  process.exit(1);
});
