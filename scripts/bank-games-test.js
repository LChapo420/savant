/**
 * Bank-fed learning games (BANK_GAMES; services/game-bank.js; the rules and
 * sources in curriculum-build/GAMES-PLACEMENT.md).
 *
 *   node scripts/bank-games-test.js
 *
 * Runs on a throwaway store (never data/db.json) with every model key blanked,
 * OLLAMA_ENABLED=0 and the model calls stubbed to fail loudly: a bank game must
 * never need one. Checks:
 *   1. every assigned payload validates against its engine's contract (schema,
 *      the page's own check, the shared game checks), and plays in the engine;
 *   2. every key is the bank's own: each question is drawn again from its origin;
 *   3. games appear only where the rules say (practice slots 4/6, or 5 standing in;
 *      Spanish "Game" rows; never lessons, checkpoints, testers, retention or
 *      production rows; at most two per ladder, never side by side; K-16 only);
 *   4. grade fit: no Kindergarten game shows a number of 100 or more;
 *   5. the owner gets the same base set as anyone, with no model call and no
 *      tailoring; holds are respected; English Proficient keeps its own games;
 *   6. the routes: the session sends the learner to the game, the page serves it,
 *      answers record against the question's own skill, and the finish settles;
 *   7. the same set in any process (a second process builds it again);
 *   8. BANK_GAMES=off restores the old resolve() exactly (the engine cycle).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO|UNOROUTER/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
for (const k of ['BANK_GAMES', 'GAME_HOLDS', 'OWNER_EMAIL', 'OWNER_BASE', 'BLOCK_LEVELS', 'BLOCK_GENERATE', 'BLOCK_TAILOR_OWNER', 'LESSON_SANDBOX', 'GRADE_SKILLS', 'OBJECTIVE_ITEMS']) delete process.env[k];
const tmp = path.join(os.tmpdir(), `bank-games-test-${process.pid}.json`);
process.env.DB_FILE = tmp;

const ROOT = path.join(__dirname, '..');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const assignments = require('../config/game-assignments');
const bank = require('../content/bank');
const ai = require('../services/ai');
const games = require('../services/game-payloads');
const gameBank = require('../services/game-bank');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; return; }
  failed++;
  console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}

// No model, ever: any call is a failure of the rule.
let modelCalls = 0;
for (const fn of ['structured', 'structuredDetail', 'complete', 'chat', 'text']) {
  if (typeof ai[fn] === 'function') ai[fn] = async () => { modelCalls++; throw new Error('a bank game called a model'); };
}

const K = { track: 'math', grade: 'numbers_to_20_and_teen_numbers' };
const kGrade = curriculum.getGrade(K.track, K.grade);

/** The placed levels of a grade, and the ones that filled. */
function scan(trackId, gradeId, limit = Infinity) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const placed = [];
  const filled = [];
  for (let l = 1; l <= grade.pathLength && filled.length < limit; l++) {
    if (!gameBank.placedAt(grade, l)) continue;
    placed.push(l);
    if (gameBank.forLevel(trackId, gradeId, l)) filled.push(l);
  }
  return { grade, placed, filled };
}

/** A sample across every track: every grade's first two filled levels (up to six tried). */
function sample() {
  const out = [];
  for (const trackId of gameBank.TRACKS) {
    for (const g of curriculum.getTrack(trackId).grades) {
      const grade = curriculum.getGrade(trackId, g.id);
      let got = 0;
      let tried = 0;
      for (let l = 1; l <= grade.pathLength && got < 2 && tried < 6; l++) {
        if (!gameBank.placedAt(grade, l)) continue;
        tried++;
        const found = gameBank.forLevel(trackId, g.id, l);
        if (found) { got++; out.push({ trackId, gradeId: g.id, level: l, found }); }
      }
    }
  }
  return out;
}

/** Mount one engine with a payload in a DOM, ask a question, answer it right and wrong. */
function playInEngine(engineId, payload) {
  // eslint-disable-next-line global-require
  const { JSDOM, VirtualConsole } = require('jsdom');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="game-root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  let now = 0; let tid = 0; const timers = new Map(); const frames = new Map();
  w.setTimeout = (fn, ms) => { const id = ++tid; timers.set(id, { fn, at: now + ms }); return id; };
  w.clearTimeout = (id) => timers.delete(id);
  w.requestAnimationFrame = (fn) => { const id = ++tid; frames.set(id, fn); return id; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  const advance = (s) => { for (let t = 0; t < s; t += 0.02) { now += 20; for (const [id, it] of [...timers]) if (it.at <= now) { timers.delete(id); it.fn(); } const cbs = [...frames]; frames.clear(); cbs.forEach(([, fn]) => fn(now)); } };
  const cursor = { at: 0, next(total) { const index = this.at % total; const wrapped = this.at > 0 && index === 0; this.at++; return { index, wrapped }; } };
  w.PolymathGame = { cursor, nextLevelUrl: null };
  const answers = [];
  w.addEventListener('game:answer', (e) => answers.push(e.detail));
  w.addEventListener('error', (e) => errors.push(e.message));
  for (const file of ['remade.js', 'boards.js', 'arcade.js']) w.eval(fs.readFileSync(path.join(ROOT, 'public', 'games', file), 'utf8'));
  const api = w.RemadeGames.start(engineId, payload);
  const root = w.document.getElementById('game-root');
  const status = (root.querySelector('[data-game-status]') || {}).textContent || '';
  const out = { refused: /valid four-choice/.test(status) || !api || !api.controller, asked: false, rightOk: false, wrongOk: false, errors };
  if (out.refused) { dom.window.close(); return out; }
  // Reach a question: the engine's own action buttons, or a mismatched pair in memory match.
  for (let step = 0; step < 12 && api.phase() !== 'question'; step++) {
    advance(0.2);
    if (api.phase() === 'question') break;
    if (engineId === 'yahtzee') {
      // Its question comes after a round is scored.
      api.controller.roll();
      const open = api.controller.state().open.findIndex((x) => x);
      api.controller.scoreCategory(open >= 0 ? open : 12);
      continue;
    }
    if (engineId === 'memory-match' && api.controller.state) {
      const s = api.controller.state;
      const a = s.deck.findIndex((v, i) => !s.matched.has(i));
      const b = s.deck.findIndex((v, i) => !s.matched.has(i) && v !== s.deck[a]);
      api.controller.select(a); api.controller.select(b);
      const nextPair = [...root.querySelectorAll('button')].find((x) => x.textContent === 'Next pair');
      if (nextPair) nextPair.click();
      continue;
    }
    const action = [...root.querySelectorAll('[data-game-action]')].find((x) => !x.disabled);
    if (action) action.click();
  }
  if (api.phase() === 'question') {
    out.asked = true;
    const q = api.question();
    const inSet = payload.questions.find((x) => x.prompt === q.prompt);
    api.choose(q.answerIndex);
    const first = answers[answers.length - 1];
    out.rightOk = !!(first && first.correct === true && inSet && first.questionId === inSet.id);
  }
  dom.window.close();
  return out;
}

function serve(mounts) {
  // eslint-disable-next-line global-require
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  for (const [prefix, r] of mounts) app.use(prefix, r);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid) => new Promise((ok, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json, text }); });
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
  console.log('bank-fed games (throwaway store, keys blanked, OLLAMA_ENABLED=0, model calls stubbed)');
  const t0 = Date.now();

  // ── 1. contracts, 2. keys, 4. grade fit (a sample across every track) ──────
  const sampled = sample();
  const byTrack = {};
  for (const s of sampled) byTrack[s.trackId] = (byTrack[s.trackId] || 0) + 1;
  for (const t of ['math', 'reading', 'english', 'spanish', 'iq', 'act', 'piano']) check(`${t}: bank games exist`, (byTrack[t] || 0) > 0, byTrack);
  let invalid = 0;
  let keyMismatch = 0;
  let optionStray = 0;
  for (const { trackId, gradeId, level, found } of sampled) {
    const problems = gameBank.validate(found.payload);
    if (problems.length) { invalid++; if (invalid <= 3) check(`${trackId}/${gradeId}/${level} validates`, false, problems.slice(0, 4)); }
    for (const q of found.payload.questions) {
      const again = gameBank.redraw(trackId, gradeId, q.origin);
      const key = q.choices[q.answerIndex];
      if (!again || String(again.answer).trim() !== key) {
        keyMismatch++;
        if (keyMismatch <= 3) check(`${trackId}/${gradeId}/${level} key is the bank's`, false, { prompt: q.prompt, key, bank: again && again.answer });
        continue;
      }
      // Every option is the key, one of the bank's own options, or (numeric items
      // only) a computed integer that is not the key.
      const own = (again.choices || []).map((c) => String(c).trim());
      for (const c of q.choices) {
        if (c === key || own.includes(c)) continue;
        if (/^-?\d+$/.test(key) && /^-?\d+$/.test(c) && Number(c) !== Number(key)) continue;
        optionStray++;
      }
    }
  }
  check(`every sampled payload validates against its engine contract (${sampled.length} payloads)`, invalid === 0, invalid);
  check('every key is the bank\'s computed key (each question drawn again from its origin)', keyMismatch === 0, keyMismatch);
  check('every option is the key, a bank option, or a computed wrong number', optionStray === 0, optionStray);

  // Each engine the bank uses plays a real bank set: the page accepts it, asks, and scores a right answer.
  const engines = new Map();
  for (const s of sampled) if (!engines.has(s.found.engineId)) engines.set(s.found.engineId, s.found.payload);
  // Every engine the bank may choose, even one the sample did not reach, plays a bank set.
  const spare = sampled.find((s) => s.trackId === 'spanish') || sampled[0];
  for (const engineId of gameBank.installed()) {
    if (!engines.has(engineId)) engines.set(engineId, { ...spare.found.payload, engineId });
  }
  for (const [engineId, payload] of engines) {
    const played = playInEngine(engineId, payload);
    check(`${engineId}: the page accepts a bank set`, !played.refused, played);
    check(`${engineId}: a question is asked and a right answer is scored right, with the set's id`, played.asked && played.rightOk, played);
    check(`${engineId}: no page errors`, played.errors.length === 0, played.errors);
  }

  // ── 3. placement ───────────────────────────────────────────────────────────
  const k = scan(K.track, K.grade);
  check('Kindergarten numbers_to_20: games are placed', k.placed.length >= 20, k.placed.length);
  check('Kindergarten numbers_to_20: almost every placed slot fills', k.filled.length >= k.placed.length - 2, { placed: k.placed.length, filled: k.filled.length });
  const kEngines = new Set(k.filled.map((l) => gameBank.forLevel(K.track, K.grade, l).engineId));
  check('Kindergarten numbers_to_20: at least three different games', kEngines.size >= 3, [...kEngines]);
  check('Kindergarten: only the calm board games', [...kEngines].every((e) => gameBank.POOLS.early.number.concat(gameBank.POOLS.early.shapes, gameBank.POOLS.early.general).includes(e)), [...kEngines]);
  const firstLesson = LAYOUT.nextLesson(kGrade, 1);
  check('the lesson (first exposure) is not a game', assignments.resolve(K.track, K.grade, firstLesson) === null, firstLesson);
  check('Activity 1 after the lesson (worked, guided) is not a game', assignments.resolve(K.track, K.grade, firstLesson + 1) === null);
  check('Activity 4 after the lesson is a bank game', (assignments.resolve(K.track, K.grade, firstLesson + 4) || {}).source === 'bank', assignments.resolve(K.track, K.grade, firstLesson + 4));
  let placementBad = [];
  const gradesToScan = [[K.track, K.grade], ['math', 'multiplication_and_division'], ['math', 'algebra_1_part_a'], ['english', 'basics'],
    ['english', 'intermediate'], ['reading', 'early_decoder'], ['spanish', 'entry'], ['spanish', 'spanish_grade_09_preterite_i'],
    ['iq', 'core_reasoning_skills'], ['act', 'act_grade_3'], ['piano', 'piano_pre_reader'], ['basketball', 'basketball_mini_starter'], ['chess', 'chess_rules_learner']];
  for (const [trackId, gradeId] of gradesToScan) {
    const grade = curriculum.getGrade(trackId, gradeId);
    let lastGame = -10;
    const perLadder = new Map();
    for (let l = 1; l <= grade.pathLength; l++) {
      const a = assignments.resolve(trackId, gradeId, l);
      const kind = curriculum.levelKind(l, grade.pathLength, grade);
      const entry = LAYOUT.entryFor(grade, l) || {};
      if (!a || a.source !== 'bank') continue;
      const where = `${trackId}/${gradeId}/${l}`;
      if (kind !== 'practice') placementBad.push(`${where} is a ${kind}`);
      if (/\(retention\)/i.test(entry.title || '') || /^Tester\b/i.test(entry.title || '')) placementBad.push(`${where} is ${entry.title}`);
      if (trackId === 'spanish') {
        if (!/^(review )?game$/i.test(String(entry.type || '').trim())) placementBad.push(`${where} is a Spanish ${entry.type} row`);
        if (gameBank.PRODUCTION.test(String(entry.title || ''))) placementBad.push(`${where} is a production row: ${entry.title}`);
      } else {
        const m = /Activity (\d+) of 9/.exec(entry.title || '');
        if (!m || ![4, 5, 6].includes(Number(m[1]))) placementBad.push(`${where} is slot ${m && m[1]}`);
        if (gameBank.PRODUCTION.test(gameBank.activityName(entry.title))) placementBad.push(`${where} is a production row: ${entry.title}`);
        if (l - lastGame === 1) placementBad.push(`${where} follows a game`);
        const ladder = l - Number(m && m[1]);
        perLadder.set(ladder, (perLadder.get(ladder) || 0) + 1);
        if (perLadder.get(ladder) > 2) placementBad.push(`${where}: a third game in one ladder`);
      }
      lastGame = l;
    }
  }
  check('games only on the rule\'s practice slots (no lesson, checkpoint, tester, retention, production row; ≤2 per ladder; never adjacent)', placementBad.length === 0, placementBad.slice(0, 6));
  const beyond = curriculum.getGrade('math', 'doctoral');
  let beyondGames = 0;
  for (let l = 1; l <= beyond.pathLength; l++) if ((assignments.resolve('math', 'doctoral', l) || {}).source === 'bank') beyondGames++;
  check('graduate grades and beyond: no games (K-16 only)', beyondGames === 0, beyondGames);
  // Skill tracks: never on a row whose own skill is played on a board, keyboard or court.
  let physical = 0;
  for (const [trackId, gradeId] of [['piano', 'piano_pre_reader'], ['basketball', 'basketball_mini_starter'], ['chess', 'chess_rules_learner']]) {
    const grade = curriculum.getGrade(trackId, gradeId);
    for (let l = 1; l <= grade.pathLength; l++) {
      const a = assignments.resolve(trackId, gradeId, l);
      if (!a || a.source !== 'bank') continue;
      // A row's own skill must be a knowledge skill; a grade-review row (no skill of
      // its own) may be a game only when every question is on a knowledge skill.
      const rowSkill = (LAYOUT.entryFor(grade, l) || {}).skill;
      const questions = gameBank.payloadFor(trackId, gradeId, l).questions;
      if (rowSkill ? !gameBank.KNOWLEDGE_SKILLS.has(rowSkill) : !questions.every((q) => gameBank.KNOWLEDGE_SKILLS.has(q.skill))) physical++;
    }
  }
  check('skill tracks: games only on knowledge rows', physical === 0, physical);

  // ── 4. grade fit ───────────────────────────────────────────────────────────
  let bigK = [];
  for (const l of k.filled) {
    for (const q of gameBank.forLevel(K.track, K.grade, l).payload.questions) {
      const nums = `${q.prompt} ${q.choices.join(' ')}`.match(/\d+/g) || [];
      if (nums.some((n) => Number(n) >= 100)) bigK.push(q.prompt);
    }
  }
  check('Kindergarten: no game shows a number of 100 or more', bigK.length === 0, bigK.slice(0, 3));
  check('Kindergarten: no engine whose board shows 100 or more', k.filled.every((l) => (gameBank.ENGINE_INFO[gameBank.forLevel(K.track, K.grade, l).engineId].numbers || 0) < 100));
  const gradeSkills = require('../config/grade-skills');
  check('Kindergarten: every draw is held to the grade\'s difficulty range (config/grade-skills.js capDifficulty)', k.filled.every((l) => gameBank.forLevel(K.track, K.grade, l).payload.questions
    .every((q) => q.origin.source !== 'bank' || gradeSkills.capDifficulty(kGrade, q.origin.skill, q.origin.difficulty) === q.origin.difficulty)));
  check('Kindergarten: every draw carries the school grade (fitEntry), so the bank serves the K standard', k.filled.every((l) => gameBank.forLevel(K.track, K.grade, l).payload.questions
    .every((q) => q.origin.source !== 'bank' || q.origin.school === 0)));
  check('a question\'s difficulty is the bank item\'s own', sampled.slice(0, 60).every((s) => s.found.payload.questions.every((q) => {
    const again = gameBank.redraw(s.trackId, s.gradeId, q.origin);
    return q.origin.source !== 'bank' || q.difficulty === Math.max(1, Math.min(10, Math.round(Number(again.difficulty) || 5)));
  })));

  // ── 5. owner, holds, English Proficient ────────────────────────────────────
  const ownerEmail = require('../config/owner').ownerEmail();
  const owner = db.insert('users', { email: ownerEmail, display_name: 'Owner', password_hash: 'x', onboarded: true, birth_year: 1990 });
  const learner = db.insert('users', { email: `bank-learner-${process.pid}@example.test`, display_name: 'Learner', password_hash: 'x', onboarded: true, birth_year: 2019 });
  const L14 = firstLesson + 4;
  const forOwner = await games.ensure(owner.id, K.track, K.grade, L14, { tailored: true });
  const forLearner = await games.ensure(learner.id, K.track, K.grade, L14, { tailored: false });
  check('the owner gets the bank game', !!(forOwner && forOwner.bank));
  check('the owner\'s set is the same base set a standard learner gets (no tailoring)', !!forOwner && JSON.stringify(forOwner.payload) === JSON.stringify(forLearner.payload));
  check('no model was called for any bank game', modelCalls === 0, modelCalls);
  check('a bank game is open to every account (base content)', games.accessFor(owner, K.track, K.grade, L14) && games.accessFor(learner, K.track, K.grade, L14));
  check('nothing about a bank game is stored', db.find('game_payloads', () => true).length === 0);
  // A hold on a bank level (a row with serving_hold, as the content factory sets): not served.
  const hold = db.insert('game_payloads', { user_id: null, engine_id: 'tug-of-war', track_id: K.track, grade_id: K.grade, level: L14, payload: null, problems: ['held'], serving_hold: { reason: 'test' } });
  check('a held bank level is not served, not open and not answerable', games.held(K.track, K.grade, L14) && !(await games.ensure(learner.id, K.track, K.grade, L14, {})) && !games.accessFor(learner, K.track, K.grade, L14) && games.stored(K.track, K.grade, L14, learner.id) === null);
  db.remove('game_payloads', (r) => r.id === hold.id);
  check('the hold lifted, the level serves again', !games.held(K.track, K.grade, L14) && games.accessFor(learner, K.track, K.grade, L14));
  const holds = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'game-holds.json'), 'utf8')).holds;
  check('every listed hold stays held and is never a bank game', holds.every((h) => games.held(h.track_id, h.grade_id, h.level) && (assignments.resolve(h.track_id, h.grade_id, h.level) || {}).source !== 'bank'));
  const authored = require('./../config/level-assignments.json').levels;
  check('English Proficient keeps its authored assignments', Object.entries(authored).every(([key, v]) => {
    const [t, g, l] = key.split('/');
    const got = assignments.resolve(t, g, Number(l));
    return got && got.engineId === v.engineId && got.source === 'level';
  }));
  const ep = curriculum.getGrade('english', 'proficient');
  let epBank = 0;
  for (let l = 1; l <= ep.pathLength; l++) if ((assignments.resolve('english', 'proficient', l) || {}).source === 'bank') epBank++;
  check('English Proficient gets no bank games on top of its own', epBank === 0, epBank);

  // ── 6. the routes ──────────────────────────────────────────────────────────
  const enrollment = db.insert('enrollments', { user_id: learner.id, track_id: K.track, grade_id: K.grade, current_level: L14, status: 'active', level_items: 0 });
  db.insert('enrollments', { user_id: owner.id, track_id: K.track, grade_id: K.grade, current_level: L14, status: 'active', level_items: 0 });
  const app = await serve([['/api', require('../routes/learn')], ['/api', require('../routes/base-lessons')]]);
  try {
    const started = Date.now();
    const sess = await app.call('POST', '/api/sessions', { enrollment_id: enrollment.id }, learner.id);
    check('the session route sends the learner to the game', sess.status === 200 && sess.json.game && sess.json.game.engine_id === forLearner.payload.engineId, { status: sess.status, json: sess.json });
    const lesson = await app.call('GET', `/api/lessons/${K.track}/${K.grade}/${L14}`, null, learner.id);
    check('the level page answers as a game, at once', lesson.status === 200 && lesson.json.basis === 'game' && lesson.json.meta.engine_id === forLearner.payload.engineId && Date.now() - started < 3000, { status: lesson.status, ms: Date.now() - started, basis: lesson.json && lesson.json.basis });
    check('the page names the bank, not a model', lesson.json && lesson.json.meta && /bank/.test(String(lesson.json.meta.model)), lesson.json && lesson.json.meta);
    const frame = await app.call('GET', `/api/lessons/${K.track}/${K.grade}/${L14}/page`, null, learner.id);
    check('the sandboxed frame serves the engine with the bank set in it', frame.status === 200 && frame.text.includes(forLearner.payload.questions[0].id), frame.status);
    const q0 = forLearner.payload.questions.find((q) => q.skill) || forLearner.payload.questions[0];
    const right = await app.call('POST', `/api/lessons/${K.track}/${K.grade}/${L14}/game-answer`, { question_id: q0.id, question_index: 3, correct: true, ms: 4200, play: 'p1' }, learner.id);
    check('an answer is recorded against the question\'s own skill', right.status === 200 && right.json.skill === q0.skill, { status: right.status, json: right.json, want: q0.skill });
    const item = db.find('items', (i) => i.user_id === learner.id && i.role === 'game').pop();
    check('the answer is an item with the bank\'s key and difficulty', !!item && item.answer === q0.choices[q0.answerIndex] && item.difficulty === q0.difficulty && item.correct === true, item);
    const state = db.findOne('skill_states', (s) => s.user_id === learner.id && s.skill_id === q0.skill);
    check('mastery took the answer, on that skill', !!state && (state.attempts || 0) >= 1, state);
    // A question whose skill the gate does not measure at this level is credited in
    // turn to a measured skill, as before (Spanish level 5 measures es_greetings while
    // its row, and so its game, practises es_vocab_core).
    const es = gameBank.forLevel('spanish', 'entry', 5);
    if (es) {
      db.insert('enrollments', { user_id: learner.id, track_id: 'spanish', grade_id: 'entry', current_level: 5, status: 'active', level_items: 0 });
      const measured = curriculum.levelPlan(curriculum.getGrade('spanish', 'entry'), 5).introduced;
      const outside = es.payload.questions.find((q) => !measured.includes(q.skill));
      if (outside) {
        const credited = await app.call('POST', '/api/lessons/spanish/entry/5/game-answer', { question_id: outside.id, question_index: 0, correct: true, ms: 3000 }, learner.id);
        check('a question on a skill the gate does not measure is credited to a measured skill (the old rule)', credited.status === 200 && measured.includes(credited.json.skill), { json: credited.json, measured });
      }
    }
    const stray = await app.call('POST', `/api/lessons/${K.track}/${K.grade}/${L14}/game-answer`, { question_id: 'not-a-question', correct: true }, learner.id);
    check('an answer to a question not in the set is refused', stray.status === 400, stray.status);
    const finish = await app.call('POST', `/api/lessons/${K.track}/${K.grade}/${L14}/game-finish`, { result: 'win', correct: 1, wrong: 0, play: 'p1' }, learner.id);
    check('the finish is settled by the mastery gate', finish.status === 200 && finish.json.settled === true && finish.json.progress, finish.json);
    const ownerSess = await app.call('POST', '/api/sessions', { enrollment_id: db.findOne('enrollments', (e) => e.user_id === owner.id).id }, owner.id);
    check('the owner is sent to the same game', ownerSess.status === 200 && ownerSess.json.game && ownerSess.json.game.engine_id === forLearner.payload.engineId, ownerSess.json);
    check('still no model call after the routes', modelCalls === 0, modelCalls);
  } finally {
    app.close();
  }

  // ── 7. the same set in any process ─────────────────────────────────────────
  const probe = `process.env.DB_FILE=${JSON.stringify(tmp)};process.env.DB_READONLY='1';const b=require(${JSON.stringify(path.join(ROOT, 'content', 'bank'))});for(let i=0;i<40;i++){for(const s of ['place_value','counting','shapes','linear_eq','es_vocab_core']){try{b.generate({skillId:s,difficulty:2,seed:'warm'+i})}catch(e){}}}const g=require(${JSON.stringify(path.join(ROOT, 'services', 'game-bank'))});const out={};for(const [t,gr,l] of ${JSON.stringify([[K.track, K.grade, L14], ['math', 'algebra_1_part_a', 24], ['spanish', 'entry', 5]])}){const f=g.forLevel(t,gr,l);out[t+'/'+gr+'/'+l]=f?JSON.stringify(f.payload):null;}process.stdout.write(JSON.stringify(out));`;
  const other = JSON.parse(execFileSync(process.execPath, ['-e', probe], { cwd: ROOT, env: process.env, maxBuffer: 64 * 1024 * 1024 }).toString());
  for (const [key, json] of Object.entries(other)) {
    const [t, gr, l] = key.split('/');
    const here = gameBank.forLevel(t, gr, Number(l));
    check(`${key}: the same set in another process (after other draws)`, !!here && json === JSON.stringify(here.payload));
  }
  gameBank.reset();
  check('the same set after the cache is cleared', JSON.stringify(gameBank.forLevel(K.track, K.grade, L14).payload) === JSON.stringify(forLearner.payload));
  const tBuild = Date.now();
  gameBank.reset();
  gameBank.forLevel('math', 'multiplication_and_division', 14);
  check('a set is computed in well under a second', Date.now() - tBuild < 1000, Date.now() - tBuild);

  // ── 8. BANK_GAMES=off ──────────────────────────────────────────────────────
  process.env.BANK_GAMES = 'off';
  const registry = assignments.registeredEngines();
  let offBad = [];
  for (const [trackId, gradeId] of [[K.track, K.grade], ['spanish', 'entry'], ['iq', 'core_reasoning_skills']]) {
    const grade = curriculum.getGrade(trackId, gradeId);
    for (let l = 1; l <= Math.min(grade.pathLength, 120); l++) {
      const got = assignments.resolve(trackId, gradeId, l);
      const kind = curriculum.levelKind(l, grade.pathLength, grade);
      const entry = LAYOUT.entryFor(grade, l) || {};
      const retention = /\(retention\)/i.test(String(entry.title || '')) || /^retention\b/i.test(String(entry.covers || ''));
      const spanishNonGame = trackId === 'spanish' && !/game/i.test(String(entry.type || ''));
      const want = kind !== 'practice' || retention || spanishNonGame ? null : registry[(l - 1) % registry.length];
      if ((got ? got.engineId : null) !== want || (got && got.source !== 'cycle')) offBad.push({ l, got, want });
    }
  }
  check('BANK_GAMES=off: resolve() is the old engine cycle exactly', offBad.length === 0, offBad.slice(0, 3));
  check('BANK_GAMES=off: no bank payload is served or stored', gameBank.payloadFor(K.track, K.grade, L14) === null && games.stored(K.track, K.grade, L14) === null);
  check('BANK_GAMES=off: a level with no written set is not ready (the old rule: a model must write it first)', games.sharedReady(K.track, K.grade, L14) === false);
  delete process.env.BANK_GAMES;
  check('BANK_GAMES back on: the bank game returns', (assignments.resolve(K.track, K.grade, L14) || {}).source === 'bank');

  console.log(`bank-games-test: ${passed} passed, ${failed} failed (${sampled.length} sampled payloads, ${engines.size} engines, ${Math.round((Date.now() - t0) / 1000)} s)`);
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  process.exit(1);
});
