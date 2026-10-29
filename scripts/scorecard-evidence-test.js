/**
 * Tests for the scorecard and adaptation changes from the evidence article
 * (curriculum-build/evidence-article/03-scorecard-adaptation.md, P1-P8, P10),
 * each with its switch on (the default) and off.
 *
 *   node scripts/scorecard-evidence-test.js      (also run by `npm test`)
 *
 * Runs on its own throwaway data file with every model key blanked: no model
 * call, no network, nothing real touched.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
const tmp = path.join(os.tmpdir(), `${path.basename(__filename, '.js')}-${process.pid}.json`);
process.env.DB_FILE = tmp;
const FLAGS = ['SCORECARD_DROP_RUSH_TYPED', 'SCORECARD_SOFT_STRETCH', 'SCORECARD_LENGTHEN_NEW_ONLY', 'SCORECARD_OBSERVED_PREFS',
  'SCORECARD_WORKED_HINT_TEXT', 'SCORECARD_SUBGOAL_TEXT', 'RAPID_ITEM_RELATIVE', 'COACH_LEAK_CHOICE', 'ADAPT_EFFORT', 'OBJ_RAPID_MS',
  'OWNER_EMAIL', 'OWNER_BASE', 'ADAPT_OWNER', 'RETAIN_SPAN_DAYS', 'RETAIN_DAYS'];
for (const k of FLAGS) delete process.env[k];

const db = require('../config/db');
const coverage = require('../services/coverage');
const adaptation = require('../services/adaptation');
const learner = require('../services/learner');
const scorecard = require('../services/scorecard');
const contract = require('../services/scorecard/contract');
const { BY_ID } = require('../services/scorecard/stats');
const reliability = require('../services/scorecard/reliability');
const effortMonitor = require('../services/effort-monitor');
const ai = require('../services/ai');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}
function withEnv(vars, fn) {
  const was = {};
  for (const [k, v] of Object.entries(vars)) { was[k] = process.env[k]; process.env[k] = v; }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(was)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const DAY = coverage.DAY;
const TRACK = 'math';
const GRADE = 'numbers_to_10';
const model = coverage.modelFor(TRACK, GRADE);
const o0 = model.objectives[0];
const fresh = coverage.assess(model, []);
const provenStates = fresh.map((s, i) => (i === 0 ? { ...s, status: 'proven', proven_by: 'test', answers: 6, L: 0.99, proven_at: Date.now() - DAY } : s));
const plan = (sides, states = fresh, base = { itemCount: 10, stretchShare: 0.3, supportShare: 0.1, preferTypeIn: false }) => adaptation.decide({ model, states, level: o0.lesson_level, sides, base });

function newUser(tag) {
  return db.insert('users', { email: `evidence-${tag}-${Math.random().toString(36).slice(2, 8)}@example.test`, name: tag, password_hash: 'x', xp: 0, streak: 0, onboarded: true });
}
function settle(userId, stat, value, times) {
  for (let i = 0; i < times; i++) scorecard.observe(userId, [{ stat, value, weight: 1 }], { source: 'test' });
}

console.log('\nP1 no typed-answer switch for rushers (SCORECARD_DROP_RUSH_TYPED)');
check('on: rush_tendency moves no structure', !('rush_tendency' in contract.knobsNow()) && plan({ rush_tendency: 'high' }).knobs.prefer_type_in === false);
check('on: the contract structure has typed false for a rusher', contract.structureFrom({ rush_tendency: 'high' }).typed === false);
withEnv({ SCORECARD_DROP_RUSH_TYPED: 'off' }, () => {
  check('off: the old knob is back (typed answers)', contract.knobsNow().rush_tendency.high.typed === true && plan({ rush_tendency: 'high' }).knobs.prefer_type_in === true
    && contract.structureFrom({ rush_tendency: 'high' }).typed === true);
});
check('the default table is the one adaptation documents', JSON.stringify(contract.KNOBS) === JSON.stringify(adaptation.DIRECTIVE_KNOBS)
  && JSON.stringify(contract.knobsNow()) === JSON.stringify(contract.KNOBS));

console.log('\nP2 softer challenge high side (SCORECARD_SOFT_STRETCH)');
check('on: challenge high adds 0.05 stretch', contract.knobsNow().challenge_appetite.high.stretch === 0.05);
check('on: stretch is clamped at 0.25', plan({ challenge_appetite: 'high' }).knobs.stretch_share === 0.25 && contract.stretchMax() === 0.25);
check('on: an optional harder case at the end, not a hard worked example', /optional harder/.test(BY_ID.challenge_appetite.dir[1]) && !/genuinely challenging/.test(BY_ID.challenge_appetite.dir[1]));
withEnv({ SCORECARD_SOFT_STRETCH: 'off' }, () => {
  check('off: +0.1 and the 0.35 clamp', contract.knobsNow().challenge_appetite.high.stretch === 0.1 && plan({ challenge_appetite: 'high' }).knobs.stretch_share === 0.35);
  check('off: the old text', /genuinely challenging/.test(BY_ID.challenge_appetite.dir[1]));
});
check('the low side is unchanged', JSON.stringify(contract.knobsNow().challenge_appetite.low) === JSON.stringify({ stretch: -0.05, support: 0.05 }));

console.log('\nP3 lengthen only for a new objective (SCORECARD_LENGTHEN_NEW_ONLY)');
check('on: full detail on an objective with no evidence (worked examples)', plan({ brevity_preference: 'low' }).knobs.length === 'full');
const known = plan({ brevity_preference: 'low' }, provenStates);
check('on: not lengthened on a proven objective (problems first stays short)', known.knobs.guidance === 'problems_first' && known.knobs.length === 'short'
  && known.reasons.some((r) => /not lengthened/.test(r)), known.knobs);
check('on: the shorter side is unchanged', plan({ brevity_preference: 'high' }, provenStates).knobs.length === 'short' && plan({ brevity_preference: 'high' }).knobs.length === 'short');
withEnv({ SCORECARD_LENGTHEN_NEW_ONLY: 'off' }, () => {
  check('off: lengthened on a proven objective too', plan({ brevity_preference: 'low' }, provenStates).knobs.length === 'standard');
});
check('a scorecard guidance move cannot make a new objective "known" for this rule', plan({ brevity_preference: 'low', scaffolding_fade: 'high' }).knobs.length === 'full');

console.log('\nP4 observed behaviour replaces the stated preference (SCORECARD_OBSERVED_PREFS)');
const prof = { style_vector: { challenge_appetite: 0.9 }, observed: { challenge_appetite: 0.1 }, evidence_count: 10 };
check('on: after 7+ analysed sessions the stated value has no weight', Math.abs(learner.effective(prof, 'challenge_appetite') - 0.1) < 1e-9);
check('on: before that it still counts (3 sessions: 0.45 observed)', Math.abs(learner.effective({ ...prof, evidence_count: 3 }, 'challenge_appetite') - (0.9 * 0.55 + 0.1 * 0.45)) < 1e-9);
withEnv({ SCORECARD_OBSERVED_PREFS: 'off' }, () => {
  check('off: capped at 0.75 observed', Math.abs(learner.effective(prof, 'challenge_appetite') - (0.9 * 0.25 + 0.1 * 0.75)) < 1e-9);
});
const shadowUser = newUser('shadow');
withEnv({ SCORECARD_OBSERVED_PREFS: 'shadow' }, () => {
  const before = learner.observedPrefsShadow().length;
  const v = learner.effective({ ...prof, user_id: shadowUser.id }, 'challenge_appetite');
  const log = learner.observedPrefsShadow();
  check('shadow: the old rule decides', Math.abs(v - (0.9 * 0.25 + 0.1 * 0.75)) < 1e-9, v);
  check('shadow: what would change is recorded', log.length === before + 1 && log[log.length - 1].dim === 'challenge_appetite' && Math.abs(log[log.length - 1].new - 0.1) < 1e-3, log.slice(-1));
});
// The scorecard term: an ungated reading moves nothing; a gated one does.
const wobbly = newUser('wobbly');
settle(wobbly.id, 'challenge_appetite', 5, 4);
const wcard = scorecard.forDimension(wobbly.id, 'challenge_appetite');
const wprof = { user_id: wobbly.id, style_vector: { challenge_appetite: 0.8 }, observed: {}, evidence_count: 0 };
const gated = contract.read(wobbly.id, { memory: false }).lesson.sides.challenge_appetite;
check('test set-up: a reading at confidence >= 30 that the gate does not pass', wcard && wcard.confidence >= 30 && !gated, { wcard, gated });
check('on: an ungated reading does not move the value', Math.abs(learner.effective(wprof, 'challenge_appetite') - 0.8) < 1e-9);
withEnv({ SCORECARD_OBSERVED_PREFS: 'off' }, () => {
  check('off: it did (the old ungated blend)', learner.effective(wprof, 'challenge_appetite') < 0.8 - 0.05);
});
const sure = newUser('sure');
settle(sure.id, 'challenge_appetite', 95, 20);
const sprof = { user_id: sure.id, style_vector: { challenge_appetite: 0.2 }, observed: {}, evidence_count: 0 };
const sgate = contract.read(sure.id, { memory: false }).lesson.sides.challenge_appetite;
check('on: a gated reading still moves it', sgate === 'high' && learner.effective(sprof, 'challenge_appetite') > 0.5, { sgate, v: learner.effective(sprof, 'challenge_appetite') });

console.log('\nP5 and P6 directive texts');
check('P5 on: worked example of the step, then try first', /fully worked example of exactly this step/.test(BY_ID.hint_dependency.dir[1]) && !/gentle hints/.test(BY_ID.hint_dependency.dir[1]));
withEnv({ SCORECARD_WORKED_HINT_TEXT: 'off' }, () => check('P5 off: the old text', /gentle hints/.test(BY_ID.hint_dependency.dir[1])));
check('P6 on: sub-goals and specific feedback added', /short sub-goals/.test(BY_ID.self_efficacy.dir[0]) && /clearly achievable/.test(BY_ID.self_efficacy.dir[0]));
withEnv({ SCORECARD_SUBGOAL_TEXT: 'off' }, () => check('P6 off: the old text', !/sub-goals/.test(BY_ID.self_efficacy.dir[0])));
check('the texts carry no numbers (model text rule)', ![BY_ID.hint_dependency.dir[1], BY_ID.self_efficacy.dir[0], BY_ID.challenge_appetite.dir[1]].some((t) => /\d/.test(t)));

console.log('\nP7 split-half check (Spearman-Brown, 500 random day splits, point >= 0.6 and lower 95% >= 0.5)');
function synth(n, signal, seed) {
  let a = seed;
  const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: n }, () => {
    const t = gauss();
    return { events: Array.from({ length: 30 }, (_, k) => ({ day: Math.floor(k / 3), value: signal * t + gauss(), weight: 1 })) };
  });
}
const strong = reliability.splitHalf(synth(60, 1, 7));
const noise = reliability.splitHalf(synth(60, 0, 7));
check('a stable trait passes', strong.pass && strong.point >= 0.6 && strong.lower >= 0.5 && strong.splits === 500, strong);
check('pure noise fails', !noise.pass && noise.point < 0.6, noise);
check('the corrected value is above the half value (Spearman-Brown)', strong.point > strong.r_half && Math.abs(reliability.spearmanBrown(0.5) - 2 / 3) < 1e-12);
check('deterministic', JSON.stringify(reliability.splitHalf(synth(60, 1, 7))) === JSON.stringify(strong));
const few = reliability.splitHalf(synth(8, 1, 3));
check('few learners: a high point can still fail on its lower bound', few.lower === null || few.lower < few.point, few);
check('too few learners is refused, not passed', reliability.splitHalf(synth(3, 1, 3)).pass === false);

console.log('\nP8 item-relative rapid line (RAPID_ITEM_RELATIVE)');
const others = Array.from({ length: 30 }, (_, i) => newUser(`timer${i}`));
const longItem = { skill_id: o0.skill, prompt: 'A long passage question for the rapid line test', answer: '3', choices: ['1', '2', '3', '4'], difficulty: 3 };
for (let i = 0; i < 29; i++) db.insert('items', { ...longItem, user_id: others[i].id, correct: true, ms: 40000 + i * 10 });
effortMonitor.resetTypicalTimes();
check('29 timed answers: still the fixed 1.2 s line', effortMonitor.rapidLine(longItem) === 1200);
db.insert('items', { ...longItem, user_id: others[29].id, correct: true, ms: 40000 });
effortMonitor.resetTypicalTimes();
const line = effortMonitor.rapidLine(longItem);
check('30 timed answers: 0.10 x the median (about 4 s)', line >= 4000 && line <= 4020, line);
check('a short item never goes below 1.2 s', effortMonitor.rapidLine({ prompt: 'never seen', answer: 'x' }) === 1200);
withEnv({ RAPID_ITEM_RELATIVE: 'off' }, () => check('off: the fixed line', effortMonitor.rapidLine(longItem) === 1200));
check('sittingRule: 3 s on that item is set aside, 3 s with no line is scored', adaptation.sittingRule({ ms: 3000, rapidMs: line }, 0) === 'reserve'
  && adaptation.sittingRule({ ms: 3000 }, 0) === 'score' && adaptation.sittingRule({ ms: 600 }, 0) === 'reserve');

// Coverage: a 3 s answer under the item's line is not evidence; a set-aside
// answer is never counted as wrong, whatever its time.
const st = (answers) => coverage.assess(model, answers.map((a) => ({ t: Date.now() - DAY, level: o0.lesson_level, role: 'check', skill: o0.skill, choices: 4, coach: false, objective: null, objectiveTest: false, ...a })))[0];
check('coverage: 3 s under the item line is rapid, not evidence', st([{ correct: false, ms: 3000, rapidMs: line }]).answers === 0 && st([{ correct: false, ms: 3000, rapidMs: line }]).rapid > 0);
check('coverage: 3 s with the fixed line is evidence (as before)', st([{ correct: false, ms: 3000 }]).answers > 0);

const who = newUser('sitter');
const enr = db.insert('enrollments', { user_id: who.id, track_id: TRACK, grade_id: GRADE, current_level: o0.lesson_level, target_level: 99, status: 'active', level_items: 0, levels_completed: 0, xp: 0 });
const cp = db.insert('sessions', { user_id: who.id, enrollment_id: enr.id, track_id: TRACK, grade_id: GRADE, level: o0.lesson_level, kind: 'master', blocks: [] });
const asked = db.insert('items', { ...longItem, user_id: who.id, session_id: cp.id, role: 'exam', level: o0.lesson_level, block: 0, index: 0, user_answer: null, correct: null, ms: null });
const shown = effortMonitor.screen({ userId: who.id, session: cp, item: asked, userAnswer: '1', ms: 3000 });
const setAside = db.byId('items', asked.id);
check('screen: a 3 s answer on the long item is set aside on a checkpoint, with a parallel question', !!(shown && shown.replacement) && setAside.reserved === true && setAside.correct === null, { shown: !!shown, setAside });
const ans = coverage.answersFor(who.id, db.byId('enrollments', enr.id));
const mine = ans.filter((a) => a.ms === 3000);
check('answersFor: the set-aside answer carries an infinite line', mine.length === 1 && mine[0].rapidMs === Infinity, mine);
const after = coverage.assess(model, mine)[0];
check('a set-aside answer is never counted as wrong (rapid, no evidence)', after.answers === 0 && after.rapid > 0 && after.L === fresh[0].L, after);
const slow = db.insert('items', { ...longItem, user_id: who.id, session_id: cp.id, role: 'exam', level: o0.lesson_level, block: 0, index: 1, user_answer: null, correct: null, ms: null });
check('screen: 9 s on the same item is scored', effortMonitor.screen({ userId: who.id, session: cp, item: slow, userAnswer: '3', ms: 9000 }) === null);
withEnv({ OWNER_EMAIL: who.email }, () => check('the owner keeps the fixed line', effortMonitor.rapidLine({ ...longItem, user_id: who.id }) === 1200));

console.log('\nP10 the leak guard catches the key\'s choice number or letter (COACH_LEAK_CHOICE)');
const mc = { answer: 'blue', choices: ['red', 'blue', 'green', 'yellow'] };
const leaks = ['It is option 2.', 'Look again at (2).', 'Go with the second one.', 'Choice B is the one.', 'I would pick answer #2', 'the second option fits'];
const fine = ['Try to answer a simpler part first.', 'What is 3(2)?', 'Option 3 is tempting, but why?', 'Which colour is the sky on a clear day?', 'The first step is to read it again.'];
check('names of the key\'s place are caught', leaks.every((t) => ai.choiceLeak(t, mc, [])), leaks.filter((t) => !ai.choiceLeak(t, mc, [])));
check('other text and other options are not', fine.every((t) => !ai.choiceLeak(t, mc, [])), fine.filter((t) => ai.choiceLeak(t, mc, [])));
check('leakGuard redirects such a reply', ai.leakGuard('It is option 2.', mc, []) !== 'It is option 2.');
check('the learner named it first: it may be confirmed', !ai.choiceLeak('Yes, option 2 is right.', mc, [{ role: 'user', content: 'is it 2?' }]));
check('the last option, by its place', ai.choiceLeak('Take the last one.', { answer: 'd', choices: ['a', 'b', 'c', 'd'] }, []));
check('a typed item has no choice to leak', !ai.choiceLeak('option 2', { answer: 'blue', choices: [] }, []));
withEnv({ COACH_LEAK_CHOICE: 'off' }, () => check('off: not checked', !ai.choiceLeak('It is option 2.', mc, []) && ai.leakGuard('It is option 2.', mc, []) === 'It is option 2.'));

console.log('\nreviewQueue: no early memory check once retention is believed (for coverage RETAIN_SPAN_DAYS)');
withEnv({ RETAIN_SPAN_DAYS: '7', RETAIN_DAYS: '1' }, () => {
  const ck = coverage.knobs();
  const now = Date.now();
  const base = { ...fresh[0], status: 'proven', proven_at: now - 3 * DAY, last_at: now - 2 * DAY, L: 0.99, answers: 6 };
  const q = (s) => adaptation.reviewQueue(model, fresh.map((x, i) => (i === 0 ? s : x)), now, {}).filter((r) => r.i === 0 || r.id === o0.id);
  check('believed kept, 3 days after proof: no memory check yet', !q({ ...base, R: ck.RETAIN_AT + 0.01 }).some((r) => r.reason === 'memory_check'));
  check('believed kept, 8 days after proof: the memory check is listed', q({ ...base, R: ck.RETAIN_AT + 0.01, proven_at: now - 8 * DAY }).some((r) => r.reason === 'memory_check'));
  check('not yet believed kept, 3 days after proof: listed as before', q({ ...base, R: ck.RETAIN_PRIOR }).some((r) => r.reason === 'memory_check'));
});

console.log('\nP8 cost: reading the record stays fast (the typical-times map is built once per TTL, never per answer)');
withEnv({ ADAPT_REVIEW_SESSION: 'on' }, () => {
  // eslint-disable-next-line global-require
  const reviewSession = require('../services/review-session');
  // eslint-disable-next-line global-require
  const curriculum = require('../config/curriculum');
  const g = curriculum.getGrade(TRACK, GRADE);
  const finalLevel = g.levels.find((l) => l.kind === 'graduation').level;
  const u = newUser('final');
  const e = db.insert('enrollments', { user_id: u.id, track_id: TRACK, grade_id: GRADE, current_level: finalLevel, target_level: g.pathLength, status: 'active', level_items: 0, levels_completed: 0, xp: 0 });
  const sess = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [] });
  const put = (o, daysAgo) => db.insert('items', { user_id: u.id, session_id: sess.id, skill_id: o.skill, difficulty: 3, format: 'short_answer', prompt: `final ${o.id} ${daysAgo} ${Math.random()}`, answer: '1', choices: null, role: 'check', level: o.lesson_level, block: 0, index: 0, user_answer: '1', correct: true, ms: 9000, coach_used: false, answered_at: new Date(Date.now() - daysAgo * DAY).toISOString() });
  for (const o of model.objectives) { for (let k = 0; k < 5; k++) put(o, 4 - k * 0.002); put(o, 2); }
  const time = () => { const t0 = Date.now(); reviewSession.today(u.id, db.byId('enrollments', e.id)); return Date.now() - t0; };
  effortMonitor.resetTypicalTimes();
  const builds0 = effortMonitor.typicalBuildCount();
  time(); // builds the map once
  // Alternated, because each today() call costs a little more than the last.
  const on = [];
  const off = [];
  for (let r = 0; r < 3; r++) { on.push(time()); off.push(withEnv({ RAPID_ITEM_RELATIVE: 'off' }, time)); }
  check('the typical-times map is built once for many reads (not per answer, not per read)', effortMonitor.typicalBuildCount() - builds0 === 1, effortMonitor.typicalBuildCount() - builds0);
  const onT = Math.min(...on);
  const offT = Math.min(...off);
  console.log(`  (review today() for a learner on the Final, ${model.objectives.length * 6} answers: P8 on ${on.join(', ')} ms; off ${off.join(', ')} ms)`);
  // today() itself costs about a second on this machine before P8 (2026-10-25:
  // 1169-1869 ms), so the bar is what P8 adds, plus a ceiling that an O(N^2)
  // read (about 11 s before the fix) cannot pass.
  check('P8 adds at most 25% (or 150 ms) to review today()', onT <= Math.max(offT * 1.25, offT + 150), { on, off });
  // Slower hosts (the cloud container: 4.0-4.7 s on 2026-10-29) raise the ceiling with the P8-off time, so it still
  // catches an O(N^2) read on the P8 path without failing on a slow machine.
  const ceiling = Math.max(4000, offT * 3);
  check(`review today() for a learner on the Final stays under ${ceiling} ms (4 s, or 3x the P8-off time)`, onT < ceiling, on);
});

try { fs.unlinkSync(tmp); } catch { /* already gone */ }
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
