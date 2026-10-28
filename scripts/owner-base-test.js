/**
 * The owner's rule (curriculum-build/OWNER-BASE-VS-OPTIMIZED.md): the owner's
 * account (the.landon.d@gmail.com, config/owner.js) gets the base product with
 * nothing modified, and may skip anything; every other learner gets every
 * modification and none of the skips.
 *
 *   node scripts/owner-base-test.js
 *
 * Runs on a throwaway copy of data/db.json (never the file itself) with every
 * model key blanked and OLLAMA_ENABLED=0: no model call, no network. The real
 * owner row in the copy is walked beside a "twin": a new learner given the
 * owner's own profile, scorecard and learner record, so every difference below
 * comes from the rule and not from the data. The walk: placement -> path ->
 * lesson -> practice -> review (and the Final), then the owner's skips.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO|UNOROUTER/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
const SOURCE = path.join(__dirname, '..', 'data', 'db.json');
const tmp = path.join(os.tmpdir(), `owner-base-test-${process.pid}.json`);
if (fs.existsSync(SOURCE)) fs.copyFileSync(SOURCE, tmp);
process.env.DB_FILE = tmp;
// Every switch at its live default: the rule is tested as the app runs it.
for (const k of ['OWNER_EMAIL', 'OWNER_BASE', 'ADAPT_OWNER', 'ADMIN_EMAILS', 'BLOCK_TAILOR_OWNER', 'BLOCK_LEVELS', 'BLOCK_GENERATE',
  'ADAPTIVE_TEACHING', 'ADAPT_REVIEW_SESSION', 'ADAPT_CONSOLIDATE', 'ADAPT_EFFORT', 'ADAPT_REMEDIATION', 'ADAPT_DURABLE', 'COVERAGE_GATE', 'COVERAGE_RULE',
  'SKILL_RECORD', 'SKILL_STAGE_TESTS', 'SKILL_STAGE_GATE', 'SKILL_STAGE_GATE_SHADOW', 'SKILL_DOSE', 'OBJECTIVE_ITEMS', 'GRADE_BANDS', 'KEY_GATE', 'GAME_HOLDS',
  'PERSONALIZE_HOLDOUT', 'DEV_TOOLS']) delete process.env[k];

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const owner = require('../config/owner');
const coverage = require('../services/coverage');
const adaptation = require('../services/adaptation');
const learner = require('../services/learner');
const contract = require('../services/scorecard/contract');
const personalize = require('../services/personalize');
const blockLevels = require('../services/block-levels');
const lessons = require('../services/lessons');
const sessions = require('../services/sessions');
const learnerPath = require('../services/learner-path');
const review = require('../services/review-session');
const consolidation = require('../services/consolidation');
const effortMonitor = require('../services/effort-monitor');
const skillRecord = require('../services/skill-record');
const skillGate = require('../services/skill-gate');
const skillDose = require('../services/skill-dose');
const capabilities = require('../config/capabilities');
const subscriptions = require('../config/subscriptions');
const baseLessons = require('../config/base-lessons');
const auth = require('../middleware/auth');

let failures = 0;
let passes = 0;
function check(label, ok, detail) {
  if (ok) { passes++; console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 500)}`}`);
}
function done() {
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  console.log(failures ? `\n${failures} check(s) FAILED (${passes} passed)` : `\nall ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

const DAY = coverage.DAY;
const OWNER_ADDRESS = 'the.landon.d@gmail.com';

/** An app with routers mounted ({prefix: router}); the x-user header is the signed-in account. */
function serve(mounts) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  for (const [prefix, r] of mounts) app.use(prefix, r);
  app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid) => new Promise((ok, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

(async () => {
  console.log('owner base vs optimized (on a copy of data/db.json, keys blanked, OLLAMA_ENABLED=0)');

  // ── the two accounts ──────────────────────────────────────────────────────
  let me = db.findOne('users', (u) => String(u.email || '').trim().toLowerCase() === OWNER_ADDRESS);
  if (!me) me = db.insert('users', { email: OWNER_ADDRESS, display_name: 'Owner', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  const twin = db.insert('users', { email: `twin-${process.pid}@example.test`, display_name: 'Twin', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  // The owner's own personal data, given to the twin: a style vector that is not
  // neutral, a scorecard, a learner record. The owner keeps theirs (or gets the same).
  const STYLE = { practice_density: 0.9, session_pacing: 0.85, challenge_appetite: 0.9, retrieval_style: 0.9, feedback_timing: 0.8, explanation_depth: 0.9, error_focus: 0.2, example_order: 0.9, visual_support: 0.9, verbalization: 0.9 };
  let myProfile = db.findOne('profiles', (p) => p.user_id === me.id);
  if (!myProfile) myProfile = db.insert('profiles', { user_id: me.id });
  db.update('profiles', myProfile.id, { style_vector: { ...(myProfile.style_vector || {}), ...STYLE }, evidence_count: Math.max(3, myProfile.evidence_count || 0), subscription: 'pro', survey: { interests: 'football and baking' } });
  myProfile = db.byId('profiles', myProfile.id);
  const { id: _p, user_id: _u, ...profileData } = myProfile;
  db.insert('profiles', { ...profileData, user_id: twin.id });
  const card = db.findOne('scorecards', (r) => r.user_id === me.id);
  if (card) { const { id, ...rest } = card; db.insert('scorecards', { ...rest, user_id: twin.id }); }
  const rec = db.findOne('learner_records', (r) => r.user_id === me.id);
  if (rec) { const { id, ...rest } = rec; db.insert('learner_records', { ...rest, user_id: twin.id }); }
  const O = me.id;
  const T = twin.id;

  check('the owner row is the real owner address and isOwner says so', blockLevels.isOwner(me) && owner.isOwner(me) && !owner.isOwner(twin));
  check('ownerBase: the owner yes, the twin no', owner.ownerBase(O) && owner.ownerBase(me) && !owner.ownerBase(T));

  // ── one helper for every owner check (OWNER_EMAIL moves all of them) ──────
  check('skip, browse, admin, base pages and no level editor: the owner', capabilities.canSkip(me) && capabilities.canBrowse(me) && auth.isAdmin(me)
    && baseLessons.canSeeBaseLessons(me) && !subscriptions.canEditLevels(me, { subscription: 'pro' }));
  check('none of those for the twin (the twin on pro may have levels rewritten)', !capabilities.canSkip(twin) && !capabilities.canBrowse(twin) && !auth.isAdmin(twin)
    && subscriptions.canEditLevels(twin, { subscription: 'pro' }));
  check('the browser is told can_skip / can_browse for the owner only', auth.publicUser(me).can_skip && auth.publicUser(me).can_browse && !auth.publicUser(twin).can_skip && !auth.publicUser(twin).can_browse);
  process.env.OWNER_EMAIL = twin.email;
  check('OWNER_EMAIL moves every check at once', capabilities.canSkip(twin) && auth.isAdmin(twin) && baseLessons.canSeeBaseLessons(twin) && blockLevels.isOwner(twin)
    && owner.ownerBase(T) && !subscriptions.canEditLevels(twin, { subscription: 'pro' }) && !capabilities.canSkip(me) && capabilities.SKIP_EMAILS[0] === twin.email);
  delete process.env.OWNER_EMAIL;
  const ownerSources = ['config/base-lessons.js', 'config/capabilities.js', 'config/subscriptions.js', 'middleware/auth.js', 'services/block-levels.js']
    .filter((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes(OWNER_ADDRESS));
  check('no duplicate hard-coded owner address left (only config/owner.js has it)', ownerSources.length === 0, ownerSources);

  const app = await serve([
    ['/api', require('../routes/catalog').router],
    ['/api', require('../routes/review')],
    ['/api/placement', require('../routes/placement')],
    ['/api', require('../routes/learn')],
    ['/api', require('../routes/skills')],
  ]);

  // ── 1. placement ──────────────────────────────────────────────────────────
  console.log('\n1. placement');
  const TRACK = 'math';
  const GRADE = 'numbers_to_10';
  const grade = curriculum.getGrade(TRACK, GRADE);
  const model = coverage.modelFor(TRACK, GRADE);
  const FINAL = grade.levels.find((l) => l.kind === 'graduation').level;
  db.remove('enrollments', (e) => e.user_id === O && e.track_id === TRACK && e.grade_id === GRADE);
  let r = await app.call('POST', '/api/enrollments', { selections: [{ track_id: TRACK, grade_id: GRADE }] }, O);
  const eO = r.json.created[0].id;
  r = await app.call('POST', '/api/enrollments', { selections: [{ track_id: TRACK, grade_id: GRADE }] }, T);
  const eT = r.json.created[0].id;
  check('both join placement_pending', db.byId('enrollments', eO).status === 'placement_pending' && db.byId('enrollments', eT).status === 'placement_pending');
  r = await app.call('POST', '/api/placement/start', { enrollment_id: eT }, T);
  check('the twin sits the placement quiz', r.status === 201 && Array.isArray(r.json.items) && r.json.items.length > 0, r.status);
  r = await app.call('POST', '/api/placement/skip', { enrollment_id: eT }, T);
  check('the twin may not skip it (403)', r.status === 403, r);
  r = await app.call('POST', '/api/placement/start', { enrollment_id: eO }, O);
  r = await app.call('POST', '/api/placement/skip', { enrollment_id: eO }, O);
  const placedO = db.byId('enrollments', eO);
  check('the owner skips it: active on level 1, the open quiz cancelled', r.status === 200 && placedO.status === 'active' && placedO.current_level === 1
    && !db.findOne('sessions', (s) => s.enrollment_id === eO && s.kind === 'placement' && !s.ended_at), r.json);
  // The twin's quiz is the same base quiz for everyone; its result is simulated as level 1, no unit plan.
  db.update('enrollments', eT, { status: 'active', placed_at: new Date().toISOString(), current_level: 1 });
  db.update('sessions', db.findOne('sessions', (s) => s.enrollment_id === eT && s.kind === 'placement' && !s.ended_at).id, { ended_at: new Date().toISOString() });

  // The same record on both: objective 0 proven two days ago (a memory check is
  // due), plenty of rapid answers (the effort flag), the rest unproven.
  const o0 = model.objectives[0];
  function seed(uid, enrollmentId) {
    const s = db.insert('sessions', { user_id: uid, enrollment_id: enrollmentId, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [{ index: 0, level: 1, kind: 'practice', resolved: true }], started_at: new Date(Date.now() - 30 * DAY).toISOString(), ended_at: new Date().toISOString() });
    const put = (o, daysAgo, correct, ms) => db.insert('items', { user_id: uid, session_id: s.id, skill_id: o.skill, difficulty: 2, format: 'short_answer', prompt: `seed ${o.id} ${daysAgo} ${Math.random()}`, answer: '1', choices: null, role: 'check', level: o.lesson_level, block: 0, index: 0, user_answer: correct ? '1' : '2', correct, ms, coach_used: false, answered_at: new Date(Date.now() - daysAgo * DAY).toISOString() });
    for (let k = 0; k < 5; k++) put(o0, 2 - k * 0.002, true, 9000);
    for (let k = 0; k < 40; k++) put(model.objectives[1 + (k % 3)], 1 + k * 0.01, k % 2 === 0, k % 3 === 0 ? 300 : 8000);
  }
  seed(O, eO);
  seed(T, eT);

  // ── 2. path ───────────────────────────────────────────────────────────────
  console.log('\n2. path');
  const practiceOf0 = Object.entries(model.levelMap).map(([lvl, e]) => ({ lvl: Number(lvl), e }))
    .filter((x) => x.e.kind === 'activity' && x.e.direct === 0 && !x.e.retention).map((x) => x.lvl).sort((a, b) => a - b);
  const at = practiceOf0[0];
  db.update('enrollments', eO, { current_level: at });
  db.update('enrollments', eT, { current_level: at });
  const nextO = learnerPath.nextLevelAfter(db.byId('enrollments', eO), grade, at);
  const nextT = learnerPath.nextLevelAfter(db.byId('enrollments', eT), grade, at);
  check('adaptive pacing: the owner walks the sheet (next level), the twin steps over a proven objective\'s practice',
    nextO === at + 1 && (practiceOf0.length < 2 || nextT > at + 1), { at, nextO, nextT, practiceOf0 });
  const pO = await app.call('GET', `/api/path/${eO}`, null, O);
  const pT = await app.call('GET', `/api/path/${eT}`, null, T);
  const neutral = learner.sessionParams({}, {});
  check('the owner\'s session settings are the base ones, whatever their profile says', JSON.stringify(pO.json.params) === JSON.stringify(neutral), { owner: pO.json.params, neutral });
  check('the twin\'s follow their profile (same data as the owner\'s)', JSON.stringify(pT.json.params) !== JSON.stringify(neutral), pT.json.params);
  check('the path page draws the owner\'s skip controls, not the twin\'s', pO.json.enrollment.can_skip_level === true && pT.json.enrollment.can_skip_level === false);

  // ── 3. lesson ─────────────────────────────────────────────────────────────
  console.log('\n3. lesson');
  const lessonLevel = (model.objectives.find((o) => o.lesson_level && model.levelMap[o.lesson_level]) || o0).lesson_level;
  const bO = learner.teachingBrief(O, { skillId: o0.skill, level: lessonLevel, trackName: 'Math' });
  const bT = learner.teachingBrief(T, { skillId: o0.skill, level: lessonLevel, trackName: 'Math' });
  check('coach / tutor / lesson brief: the owner\'s is the standard one', /HOW TO TEACH/.test(bO) && !/BEST TAUGHT|SCORECARD|LEARNER RECORD|INTERESTS|WHAT THEY KNOW|football/.test(bO), bO);
  check('the twin\'s is written for them (style, interests, what they know)', /HOW THIS LEARNER IS BEST TAUGHT/.test(bT) && /football/.test(bT) && /WHAT THEY KNOW/.test(bT), bT.slice(0, 300));
  const enrO = db.byId('enrollments', eO);
  const enrT = db.byId('enrollments', eT);
  const linesO = lessons.adaptLines(O, enrO, lessonLevel);
  const linesT = lessons.adaptLines(T, enrT, lessonLevel);
  check('lesson writer: nothing added for the owner', linesO.length === 0, linesO);
  check('lesson writer: the twin\'s lesson gets how-to-teach lines from their record', linesT.some((l) => /HOW TO TEACH THIS LEVEL FOR THIS LEARNER/.test(l)), linesT);
  check('block levels and games: the owner reads the shared base versions (pro or not), the twin on pro gets their own', !blockLevels.tailorsFor(me) && blockLevels.tailorsFor(twin));
  check('a shared block level carries no learner', /LEARNER: none/.test(blockLevels.learnerText(null, { trackId: TRACK, gradeId: GRADE, level: lessonLevel }, { tailored: false })));
  const oldRow = { id: -1, user_id: O, source: 'ai' };
  check('an old lesson written for the owner with their profile is written again; the twin\'s is kept', !lessons.fitFor(O, oldRow) && lessons.fitFor(O, { ...oldRow, base_written: true }) && lessons.fitFor(T, { ...oldRow, user_id: T }));
  const written = await lessons.ensure({ userId: O, enrollment: enrO, grade, level: lessonLevel });
  check('a lesson written for the owner now is marked as the base lesson', written && written.base_written === true, written && Object.keys(written));
  const cO = contract.read(O, { trackId: TRACK, gradeId: GRADE });
  const cT = contract.read(T, { trackId: TRACK, gradeId: GRADE });
  check('scorecard contract: the owner gets what a brand-new learner gets, well formed', cO.owner_base === true && cO.status === 'empty' && cO.lesson.promptLines.length === 0 && contract.validate(cO).length === 0, cO.status);
  check('scorecard contract: the twin\'s is read from the card', !cT.owner_base && cT.status !== 'fallback' && contract.validate(cT).length === 0, cT.status);
  check('the scorecard prompt block is empty for the owner', personalize.scorecardSection(O, { trackId: TRACK }).length === 0);

  // ── 4. practice ───────────────────────────────────────────────────────────
  console.log('\n4. practice');
  const sO = await sessions.createSession({ userId: O, enrollment: db.byId('enrollments', eO), grade });
  const sT = await sessions.createSession({ userId: T, enrollment: db.byId('enrollments', eT), grade });
  check('practice: the owner\'s sitting has no adaptation plan and the base settings', !sO.session.adaptation_plan && JSON.stringify(sO.session.params) === JSON.stringify(neutral), sO.session.params);
  check('practice: the twin\'s is planned from the record', !!sT.session.adaptation_plan && sT.session.adaptation_plan.mode === 'on', sT.session.adaptation_plan);
  check('adaptation.planForLevel: null for the owner, a plan for the twin', adaptation.planForLevel({ userId: O, enrollment: db.byId('enrollments', eO), level: at }) === null
    && !!adaptation.planForLevel({ userId: T, enrollment: db.byId('enrollments', eT), level: at }));
  // A checkpoint sitting: the too-fast rule.
  const cpO = db.insert('sessions', { user_id: O, enrollment_id: eO, kind: 'master', level: at, started_at: new Date().toISOString() });
  const cpT = db.insert('sessions', { user_id: T, enrollment_id: eT, kind: 'master', level: at, started_at: new Date().toISOString() });
  const itemOn = (uid, s) => db.insert('items', { user_id: uid, session_id: s.id, skill_id: o0.skill, difficulty: 2, format: 'multiple_choice', prompt: `cp ${Math.random()}`, answer: 'a', choices: ['a', 'b', 'c', 'd'], role: 'exam', level: at, block: 0, index: 0, user_answer: null, correct: null });
  const fastO = effortMonitor.screen({ userId: O, session: cpO, item: itemOn(O, cpO), userAnswer: 'a', ms: 300 });
  const fastT = effortMonitor.screen({ userId: T, session: cpT, item: itemOn(T, cpT), userAnswer: 'a', ms: 300 });
  check('too fast to count: on for the twin (a parallel question), never holds the owner', !fastO && !!(fastT && fastT.replacement), { fastO, fastT: !!fastT });
  const slowO = effortMonitor.slowDown({ userId: O, session: db.byId('sessions', sO.session.id), ms: 300 });
  check('the slow-down note from the learner\'s own record: never for the owner', slowO === null);

  // ── 5. review, remediation, the Final ─────────────────────────────────────
  console.log('\n5. review and the Final');
  const rvO = review.today(O, db.byId('enrollments', eO));
  const rvT = review.today(T, db.byId('enrollments', eT));
  check('daily review: none for the owner, the twin has today\'s (memory checks due)', rvO === null && rvT && rvT.retrieve.length > 0, rvT && rvT.counts);
  r = await app.call('GET', `/api/review/${eO}`, null, O);
  check('the path asks for the review: the owner\'s is null', r.status === 200 && r.json.review === null, r.status);
  r = await app.call('POST', `/api/review/${eO}/start`, {}, O);
  check('the owner cannot start a review sitting (nothing to review)', r.status === 409, r.status);
  check('remediation from the record: the twin only', adaptation.remediationPlanFor({ userId: O, enrollment: db.byId('enrollments', eO), missedSkills: [o0.skill] }) === null
    && !!adaptation.remediationPlanFor({ userId: T, enrollment: db.byId('enrollments', eT), missedSkills: [o0.skill] }));
  db.update('enrollments', eO, { current_level: FINAL });
  db.update('enrollments', eT, { current_level: FINAL });
  const cnO = consolidation.forEnrollment(O, db.byId('enrollments', eO), grade);
  const cnT = consolidation.forEnrollment(T, db.byId('enrollments', eT), grade);
  check('consolidation before the Final: the twin is in it, the owner never', cnO === null && cnT && cnT.active, cnT);
  r = await app.call('POST', '/api/sessions', { enrollment_id: eT }, T);
  check('the twin\'s Final waits behind consolidation (409)', r.status === 409 && !!r.json.consolidation, r.status);
  r = await app.call('POST', '/api/sessions', { enrollment_id: eO }, O);
  check('the owner opens the Final', r.status === 200 || r.status === 201, r.status);
  const gO = coverage.atGraduation(O, db.byId('enrollments', eO));
  const gT = coverage.atGraduation(T, db.byId('enrollments', eT));
  check('coverage gate (enforce): holds the twin, never the owner', gO && gO.block === false && gT && gT.block === true, { gO: gO && gO.block, gT: gT && gT.block });

  // Skills: piano's first stage (fully wired, gate on).
  const PG = 'piano_keyboard_explorer';
  const pgrade = curriculum.getGrade('piano', PG);
  const pFinal = pgrade.levels.find((l) => l.kind === 'graduation').level;
  db.remove('enrollments', (e) => e.user_id === O && e.track_id === 'piano' && e.grade_id === PG);
  const mk = (uid, lvl) => db.insert('enrollments', { user_id: uid, track_id: 'piano', grade_id: PG, target_level: pgrade.pathLength, current_level: lvl, level_items: 0, levels_completed: lvl - 1, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date().toISOString() });
  const pO1 = mk(O, 1);
  const pT1 = mk(T, 1);
  check('skill practice dose: the twin\'s "Today\'s practice" row, none for the owner', skillDose.pathNode(O, pO1) === null && !!skillDose.pathNode(T, pT1) && skillDose.planFor(O, pO1) === null);
  r = await app.call('GET', `/api/skills/practice/${pO1.id}`, null, O);
  const r2 = await app.call('GET', `/api/skills/practice/${pT1.id}`, null, T);
  check('the dose page: 404 for the owner, served to the twin', r.status === 404 && r2.status === 200, [r.status, r2.status]);
  db.update('enrollments', pO1.id, { current_level: pFinal });
  db.update('enrollments', pT1.id, { current_level: pFinal });
  const sgO = skillGate.atGraduation(db.byId('enrollments', pO1.id));
  const sgT = skillGate.atGraduation(db.byId('enrollments', pT1.id));
  check('skill stage gate (PI0, on): holds the twin, never the owner', sgO && sgO.block === false && sgT && sgT.block === true, { sgO, sgT: sgT && sgT.summary });
  check('no stage-gate row on the owner\'s path', skillGate.pathNode(O, db.byId('enrollments', pO1.id)) === null && !!skillGate.pathNode(T, db.byId('enrollments', pT1.id)));
  check('the skill record itself is kept for both (data, not a modification)', skillRecord.enabled() && skillRecord.stageView(O, db.byId('enrollments', pO1.id)) && skillRecord.stageView(T, db.byId('enrollments', pT1.id)));

  // ── safety and integrity: on for everyone ─────────────────────────────────
  console.log('\n6. safety and integrity rules (on for both)');
  // eslint-disable-next-line global-require
  check('answer-key gate, game holds, grade bands and objective items are on', require('../services/key-gate').on() && require('../services/game-payloads').holdsOn()
    && !!curriculum.gradeBand(grade) && require('../services/objective-items').enabled());
  check('the same base curriculum: the same level plan for both', JSON.stringify(curriculum.levelPlan(grade, at)) === JSON.stringify(curriculum.levelPlan(grade, at)));

  // ── 7. the owner's skips ──────────────────────────────────────────────────
  console.log('\n7. the owner skips anything; nobody else can');
  db.update('enrollments', eO, { current_level: 3 });
  db.update('enrollments', eT, { current_level: 3 });
  const qO = itemOn(O, cpO);
  const qT = itemOn(T, cpT);
  r = await app.call('POST', `/api/items/${qO.id}/skip`, {}, O);
  const r3 = await app.call('POST', `/api/items/${qT.id}/skip`, {}, T);
  check('skip a question: the owner yes, the twin 403', r.status === 200 && r3.status === 403, [r.status, r3.status]);
  r = await app.call('POST', `/api/enrollments/${eO}/skip-level`, {}, O);
  const r4 = await app.call('POST', `/api/enrollments/${eT}/skip-level`, {}, T);
  check('skip a level: the owner yes, the twin 403', r.status === 200 && r.json.level === 4 && r4.status === 403, [r.json, r4.status]);
  r = await app.call('POST', `/api/enrollments/${eO}/jump-to`, { level: FINAL }, O);
  const r5 = await app.call('POST', `/api/enrollments/${eT}/jump-to`, { level: FINAL }, T);
  check('jump ahead to the Final: the owner yes, the twin 403', r.status === 200 && db.byId('enrollments', eO).current_level === FINAL && r5.status === 403, [r.json, r5.status]);
  r = await app.call('POST', `/api/enrollments/${eO}/jump-to`, { level: 2 }, O);
  check('jump back to any level: the owner yes', r.status === 200 && db.byId('enrollments', eO).current_level === 2, r.json);
  const other = curriculum.getTrack('english').grades[2];
  r = await app.call('POST', '/api/owner/go', { track_id: 'english', grade_id: other.id, level: 40 }, O);
  const goE = r.json && db.byId('enrollments', r.json.enrollment_id);
  check('stand on any level of any grade (joined on the spot, no placement): the owner', r.status === 200 && goE && goE.status === 'active' && goE.current_level === 40 && goE.grade_id === other.id, r.json);
  r = await app.call('POST', '/api/owner/go', { track_id: 'english', grade_id: other.id, level: 40 }, T);
  check('the twin: 403', r.status === 403, r.status);
  r = await app.call('POST', `/api/enrollments/${eO}/skip-grade`, {}, O);
  const next = r.json && r.json.next_enrollment ? db.byId('enrollments', r.json.next_enrollment) : null;
  check('skip a whole grade: graduated without the Final or any gate, the next grade open', r.status === 200 && db.byId('enrollments', eO).status === 'graduated'
    && (!curriculum.getTrack(TRACK).grades[curriculum.getTrack(TRACK).grades.findIndex((g) => g.id === GRADE) + 1] || (next && next.status === 'active')), r.json);
  r = await app.call('POST', `/api/enrollments/${eT}/skip-grade`, {}, T);
  check('the twin: 403', r.status === 403, r.status);
  r = await app.call('GET', '/api/curriculum?view=summary', null, T);
  check('the curriculum browser (where any grade is picked): 403 for the twin', r.status === 403, r.status);
  // The controls are drawn only for the owner (the server refuses them anyway).
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
  check('UI: the path page draws "Go to level" and "Skip this grade" only with can_skip_level', /enrollment\.can_skip_level && enrollment\.status !== 'graduated' \? `\s*<form class="row-wrap owner-skips" id="owner-jump"/.test(src('path.js')) && /id="owner-skip-grade"/.test(src('path.js')));
  check('UI: "Skip placement" on the placement page only with can_skip', /user\.can_skip \? '<button[^']*id="owner-skip-placement"/.test(src('placement.js')));
  check('UI: "Go here" / "Start here" on the curriculum page only with can_skip (a page only the owner can open)', /user\.can_skip \? `<button[^`]*data-go="/.test(src('curriculum.js')) && /user\.can_skip \? `<button[^`]*data-go-grade=/.test(src('curriculum.js')) && /if \(!user\.can_browse\)/.test(src('curriculum.js')));
  check('UI: "Skip question" in a sitting only with can_skip', /user && user\.can_skip && item && !item\.answered/.test(src('session.js')));
  check('UI: subject placement offers the owner a way past it', /user\.can_skip \? `<a [^`]*\/curriculum\?track=/.test(src('subject-placement.js')));

  // ── the switch ────────────────────────────────────────────────────────────
  console.log('\n8. OWNER_BASE=off: the owner is an ordinary learner again');
  process.env.OWNER_BASE = 'off';
  check('OWNER_BASE=off: the owner\'s settings, brief and contract are personalised', JSON.stringify(learner.sessionParams(learner.getProfile(O))) !== JSON.stringify(neutral)
    && /BEST TAUGHT/.test(learner.teachingBrief(O, {})) && !contract.read(O, {}).owner_base && !owner.ownerBase(O));
  check('OWNER_BASE=off keeps the skips (capabilities, not personalisation)', capabilities.canSkip(me));
  delete process.env.OWNER_BASE;
  process.env.ADAPT_OWNER = '1';
  check('ADAPT_OWNER=1 (the older switch) does the same', !owner.ownerBase(O));
  delete process.env.ADAPT_OWNER;

  app.close();
  done();
})().catch((err) => { console.error(err); failures++; done(); });
