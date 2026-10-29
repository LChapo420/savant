#!/usr/bin/env node
/**
 * Finishing any Spanish level the learner stands on opens the next one
 * (owner's report 2026-10-29: a Quick Game at level 28 of `entry` was finished,
 * "Next level" answered 403 "That level is not open yet.").
 *
 * Walks a learner through levels 26 to 31 of `entry` (lesson, pronunciation,
 * game, story episode, speaking, lesson) through the real routes, finishing each
 * the way its player does, and checks after each one that the enrollment moved
 * on and that the level the server names next opens. Also checks that the game
 * page's "Next level" link no longer computes level + 1.
 *
 *   node scripts/spanish-level-walk-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO|UNOROUTER/.test(k)) process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spanish-level-walk-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const esPath = require('../services/spanish/path');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`ok   ${name}`);
  else { failed += 1; console.log(`FAIL ${name}${detail === undefined ? '' : `\n     ${JSON.stringify(detail).slice(0, 300)}`}`); }
}

function serve() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/es/path', require('../routes/spanish/path'));
  app.use('/api', require('../routes/learn'));
  app.use('/api', require('../routes/base-lessons'));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid) => new Promise((ok, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
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
  const grade = curriculum.getGrade('spanish', 'entry');
  const user = db.insert('users', { email: 'walk@example.com', display_name: 'W', xp: 0, streak: 0 });
  const enrollment = db.insert('enrollments', { user_id: user.id, track_id: 'spanish', grade_id: 'entry', status: 'active', current_level: 26, level_items: 0, xp: 0 });
  const app = await serve();
  try {
    const standing = () => db.byId('enrollments', enrollment.id).current_level;
    for (let level = 26; level <= 31; level++) {
      const row = grade.levels.find((l) => l.level === level);
      const label = `level ${level} (${row.type} / ${row.activity})`;
      if (standing() !== level) { check(`${label}: the walk is standing on it`, false, { standing: standing() }); break; }
      const start = await app.call('POST', '/api/sessions', { enrollment_id: enrollment.id }, user.id);
      const g = start.json && start.json.game;
      check(`${label}: the session door opens it`, start.status === 200 && !!g, { status: start.status, json: start.json });
      if (!g) break;
      if (g.kind === 'spanish') {
        check(`${label}: the path player takes it`, esPath.supports('entry', level));
        const built = await app.call('GET', `/api/es/path/level?enrollment=${enrollment.id}`, null, user.id);
        check(`${label}: the path builds the run`, built.status === 200 && built.json.run, built.json);
        const done = await app.call('POST', '/api/es/path/finish', { run: built.json.run, hits: 0, total: 0 }, user.id);
        check(`${label}: finishing the run passes`, done.status === 200 && done.json.passed !== false, done.json);
      } else {
        check(`${label}: it is a game level the path player does not build`, !esPath.supports('entry', level) && !!g.engine_id, g);
        const fin = await app.call('POST', `/api/lessons/spanish/entry/${level}/game-finish`, { result: 'win', correct: 4, wrong: 1, play: 'walk' }, user.id);
        check(`${label}: the game finish advances the level`, fin.status === 200 && fin.json.advanced === true && fin.json.level === level + 1, fin.json);
      }
      check(`${label}: the enrollment moved on`, standing() > level, standing());
      const next = await app.call('GET', `/api/es/path/level?enrollment=${enrollment.id}`, null, user.id);
      const nextStart = await app.call('POST', '/api/sessions', { enrollment_id: enrollment.id }, user.id);
      check(`${label}: the level the server names next opens (no 403)`, next.status === 200 && nextStart.status !== 403, { next: next.status, session: nextStart.status });
    }
    check('the walk reached level 32', standing() === 32, standing());

    // A bad game result does not move the learner, and playing a level behind settles nothing.
    db.update('enrollments', enrollment.id, { current_level: 40 });
    const behind = await app.call('POST', '/api/lessons/spanish/entry/28/game-finish', { result: 'lose', correct: 4, wrong: 1, play: 'b' }, user.id);
    check('a game played behind the learner settles nothing', behind.status === 200 && behind.json.settled === false && db.byId('enrollments', enrollment.id).current_level === 40, behind.json);
    db.update('enrollments', enrollment.id, { current_level: 28 });
    const poor = await app.call('POST', '/api/lessons/spanish/entry/28/game-finish', { result: 'lose', correct: 1, wrong: 4, play: 'p' }, user.id);
    check('a poor game (20% right) does not open the next level', poor.status === 200 && poor.json.advanced === false && db.byId('enrollments', enrollment.id).current_level === 28, poor.json);
  } finally {
    app.close();
  }

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'base-lesson.js'), 'utf8');
  check('the game page never builds a next link from level + 1', !/level=\$\{level \+ 1\}/.test(src));

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
