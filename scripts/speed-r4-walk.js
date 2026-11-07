#!/usr/bin/env node
/**
 * Round 4, step 1: what eats a learner's time on the REAL path (docs/speed-real/ROUND4.md). Walks the real routes over HTTP in this process (POST /api/sessions and what it sends the learner to: an ordinary
 * sitting, a block page, a bank game) with a synthetic learner on a throwaway database that holds no real account: only the shared written levels from a copy. AI off, so a level with no stored plan falls to
 * the ordinary session and the bank's page, as it does for a standard learner.
 *
 *   node scripts/speed-r4-walk.js --grade=TRACK/GRADE --seed=N --kind=mid|weak|strong|random|expert --lessons=8 [--db=COPY] [--out=FILE] [--env=A=on,B=on]
 *
 * MEASURED: which levels the real code serves and steps over, how many answers of which role, what repeats a level, milliseconds on the server, near-repeats among the questions, coverage status per stretch.
 * SIMULATED: right or wrong. Answers come from the v2 learning model (scripts/faster-by-goal-sim.js constants), so "how many levels until proven" is simulated on the real rules.
 * NOT measured: how long a person takes. The clock runs on assumed seconds only so that the app's day logic works.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : d; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-r4-walk-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) delete process.env[k];
for (const kv of String(arg('env', '')).split(',').filter(Boolean)) { const [k, v] = kv.split('='); process.env[k] = v; }
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp */ } });
// A stripped database: shared written levels only, no real learner.
if (arg('db')) {
  const src = JSON.parse(fs.readFileSync(arg('db'), 'utf8'));
  fs.writeFileSync(process.env.DB_FILE, JSON.stringify({ block_plans: (src.block_plans || []).filter((p) => !p.user_id) }));
}

// The clock: the walker's own, so reviews and spaced levels really come due.
const RealDate = Date; let offset = 0;
global.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
};
const advance = (ms) => { offset += ms; };
const DAY = 86400000;
const origLog = console.log; const origWarn = console.warn; const origErr = console.error;
console.warn = () => {}; console.error = (...a) => { if (!/^ai: no slot/.test(String(a[0]))) origErr(...a); };
console.log = (...a) => { if (!/^ai: no slot/.test(String(a[0]))) origLog(...a); };

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const blockLevels = require('../services/block-levels');
const gamePayloads = require('../services/game-payloads');
const coverage = require('../services/coverage');
const speedLevers = require('../services/speed-levers');

const [TRACK, GRADE] = String(arg('grade', 'math/algebra_2_part_a')).split('/');
const SEED = Number(arg('seed', 1));
const KIND = arg('kind', 'mid');
const LESSONS = Number(arg('lessons', 8));
const MINUTES = Number(arg('minutes', 60));
const grade = curriculum.getGrade(TRACK, GRADE);
if (!grade) { origErr('no grade'); process.exit(2); }

let s0 = (SEED * 2654435761) >>> 0;
const rnd = () => { s0 = (s0 + 0x6D2B79F5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const P = { mid: { k0: 0.2, lr: 1, mult: 1 }, weak: { k0: 0.05, lr: 0.6, mult: 0.5 }, strong: { k0: 0.6, lr: 1.5, mult: 2 }, expert: { k0: 0.92, lr: 1.5, mult: 2 }, random: { k0: rnd() * 0.9, lr: 0.6 + rnd() * 0.9, mult: 0.4 + rnd() * 1.8 } }[KIND] || { k0: 0.2, lr: 1, mult: 1 };
const LM = { mass1: 0.3, massN: 5, mass2: 0.03, massDays: 0.25, sp0: 1.3, sp1: 1.5, h0: 2.8, missH: 1.5, miss: 0.4, a: 0.2, page: 0.5 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const stretches = new Map();
const lessonOf = (level) => { let l = Number(level) || 1; while (l > 1 && curriculum.levelKind(l, grade.pathLength, grade) !== 'lesson') l--; return l; };
const st = (lesson) => { if (!stretches.has(lesson)) stretches.set(lesson, { k: clamp(P.k0 + (rnd() - 0.5) * 0.2, 0.02, 0.97), H: 2 * P.mult, last: null, mass: 0 }); return stretches.get(lesson); };
const memR = (s, t) => (s.last === null ? 1 : 2 ** (-(t - s.last) / s.H));
const dayNow = () => offset / DAY;
function answerModel(s) {
  const t = dayNow(); const R = memR(s, t); const p = s.k * R + (1 - s.k * R) * 0.25; const right = rnd() < p;
  const days = s.last === null ? 0 : t - s.last;
  if (right) { if (s.last === null) { s.H = LM.h0 * P.mult; s.mass = 1; } else if (days < LM.massDays) { s.H *= 1 + (s.mass < LM.massN ? LM.mass1 : LM.mass2); s.mass++; } else { s.H *= LM.sp0 + LM.sp1 * (1 - R); s.mass = 0; } } else { s.H = s.last === null ? LM.missH * P.mult : Math.max(LM.missH * P.mult, s.H * LM.miss); s.mass = 0; }
  s.last = t; s.k = clamp(s.k + (1 - s.k) * LM.a * P.lr * (right ? 1 : 0.5), 0, 0.995);
  return { right, R, k: s.k };
}
const canon = (t) => String(t || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/-?\d+([.,/]\d+)*/g, '#').replace(/[^a-z#]+/g, ' ').trim();
const wc = (t) => String(t || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const NOT_SHOWN = /^(id|type|kind|layout|color|colour|icon|style|variant|svg|image|src|answer_index|correct|tone|accent|answer|explanation)$/i;
const visible = (o) => { if (o == null) return ''; if (typeof o === 'string') return o; if (typeof o === 'number') return ''; if (Array.isArray(o)) return o.map(visible).join(' '); return Object.entries(o).map(([k, v]) => (NOT_SHOWN.test(k) ? '' : visible(v))).join(' '); };

const led = { grade: `${TRACK}/${GRADE}`, kind: KIND, seed: SEED, env: arg('env', ''), levels: [], server_ms: {}, errors: [] };
const SEC = { item: 15, wrong: 12 }; // only to run the clock; never reported as a result

(async () => {
  const user = db.insert('users', { email: `r4-walk-${SEED}@savant-local-sim.org`, display_name: 'r4', onboarded: true, account_type: 'standard', age_check: { birth_ym: '1990-01', age_at_check: 36, under_13: false, needs_parent: false, asked_on: 'sign_up' } });
  const first = curriculum.levelKind(1, grade.pathLength, grade) === 'lesson' ? 1 : (curriculum.nextLessonLevel(grade, 1) || 1);
  const enr = db.insert('enrollments', { user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: grade.pathLength, current_level: first, level_items: 0, levels_completed: first - 1, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date().toISOString() });
  const app = express(); app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => { req.user = db.byId('users', user.id); next(); });
  app.use('/api', require('../routes/learn')); app.use('/api', require('../routes/base-lessons'));
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r)); const port = server.address().port;
  const call = async (bucket, method, url, body) => {
    const t = RealDate.now();
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ port, path: url, method, headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' } }, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => { let j = null; try { j = JSON.parse(d); } catch { j = { raw: d.slice(0, 200) }; } resolve({ status: r.statusCode, body: j }); }); });
      req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
    });
    (led.server_ms[bucket] = led.server_ms[bucket] || []).push(RealDate.now() - t);
    return res;
  };

  const seenCanon = new Map(); let lessonsDone = 0; let minutes = 0; let stuck = 0; let lastLevel = null; let sitting = 0;
  const startOffset = offset;
  const tick = (secs) => { advance(secs * 1000); minutes += secs / 60; };
  const objectiveState = (lessonLevel) => { try { const rep = coverage.forEnrollment(user.id, db.byId('enrollments', enr.id)); const i = rep.model.objectives.findIndex((o) => o.lesson_level === lessonLevel); return i >= 0 ? rep.states[i].status : null; } catch { return null; } };
  const noteRepeat = (row, prompt, lessonLevel) => { const c = canon(prompt); const seen = seenCanon.get(c); if (seen && seen.lesson === lessonLevel) { row.repeats++; if (seen.right) row.repeatsAfterRight++; } return c; };

  while (sitting < 1500) {
    sitting++;
    const fresh = db.byId('enrollments', enr.id);
    if (!fresh || fresh.status !== 'active') break;
    const level = fresh.current_level; const kindL = curriculum.levelKind(level, grade.pathLength, grade);
    if (kindL === 'lesson' && lessonsDone >= LESSONS) break;
    if (level === lastLevel) stuck++; else stuck = 0;
    if (stuck > 25) { led.errors.push(`stuck at ${level}`); break; }
    lastLevel = level;
    const lessonLevel = lessonOf(level);
    const opened = await call('open_level', 'POST', '/api/sessions', { enrollment_id: enr.id });
    if (opened.status >= 400) { led.errors.push(`open ${level}: ${opened.status} ${JSON.stringify(opened.body).slice(0, 120)}`); if (opened.status === 409 || opened.status === 429) break; }
    const body = opened.body || {};
    const row = { level, kind: kindL, route: body.game ? (body.game.kind || 'game') : 'session', answers: 0, right: 0, roles: {}, repeats: 0, repeatsAfterRight: 0, kBefore: st(lessonLevel).k, status: null };
    row.retention = blockLevels.kindFor(grade, level) === 'retention';
    const sk = st(lessonLevel);

    if (body.game && body.game.engine_id) {
      const kept = gamePayloads.stored(TRACK, GRADE, level, user.id);
      const qs = (kept && kept.payload && kept.payload.questions) || [];
      row.game_questions = qs.length;
      let right = 0; let wrong = 0; let i = 0;
      // A game ends when the engine says; the gate asks at least 12 answers. Taken at its fewest: favourable to the app.
      for (; i < qs.length && (i < 12); i++) {
        const q = qs[i]; noteRepeat(row, q.prompt, lessonLevel);
        const m = answerModel(sk);
        await call('game_answer', 'POST', `/api/lessons/${TRACK}/${GRADE}/${level}/game-answer`, { question_id: q.id, question_index: i, correct: m.right, ms: 15000, play: `w${sitting}` });
        seenCanon.set(canon(q.prompt), { lesson: lessonLevel, right: m.right });
        row.answers++; if (m.right) { row.right++; right++; } else wrong++;
        row.roles.game = (row.roles.game || 0) + 1; tick(SEC.item + (m.right ? 0 : SEC.wrong));
      }
      const fin = await call('game_finish', 'POST', `/api/lessons/${TRACK}/${GRADE}/${level}/game-finish`, { play: `w${sitting}`, correct: right, wrong });
      row.advanced = db.byId('enrollments', enr.id).current_level !== level;
      if (!row.advanced && fin.body && fin.body.progress) row.blockers = fin.body.progress.blockers;
    } else if (body.game && (body.game.kind === 'lesson' || body.game.kind === 'retention')) {
      const plan = blockLevels.servedPlan(db.byId('users', user.id), TRACK, GRADE, level);
      row.page_words = plan ? wc(visible((plan.blocks || []).map((b) => b.data))) : 0; row.blocks = plan ? (plan.blocks || []).length : 0;
      if (body.game.kind === 'lesson') { sk.k += (1 - sk.k) * clamp(LM.page * P.lr, 0, 0.95); }
      tick(Math.round(60 * (row.page_words / 200)));
      if (plan) {
        await call('page', 'GET', `/api/lessons/${TRACK}/${GRADE}/${level}`);
        for (const c of plan.checks || []) {
          const m = answerModel(sk);
          const given = m.right ? c.answer : (Array.isArray(c.choices) ? (c.choices.find((x) => String(x) !== String(c.answer)) ?? 'zzz') : 'zzz');
          await call('check', 'POST', `/api/lessons/${TRACK}/${GRADE}/${level}/check`, { check_id: c.id, answer: given, ms: 15000 });
          row.answers++; if (m.right) row.right++; row.roles.check = (row.roles.check || 0) + 1; tick(SEC.item + (m.right ? 0 : SEC.wrong));
        }
        const fin = await call('block_finish', 'POST', `/api/lessons/${TRACK}/${GRADE}/${level}/block-finish`, { blocks: [], read_ms: 1000 });
        row.advanced = db.byId('enrollments', enr.id).current_level !== level;
        if (!row.advanced && fin.body && fin.body.progress) row.blockers = fin.body.progress.blockers;
      }
    } else if (body.session_id || body.id || body.items) {
      const sid = body.session_id || body.id;
      if (body.lesson) {
        const l = body.lesson;
        row.page_words = wc(l.intro) + (l.sections || []).reduce((n, x) => n + wc(x.heading) + wc(x.body) + wc(x.example), 0) + wc(JSON.stringify(l.worked_example || '')) + wc((l.common_mistakes || []).join(' ')) + wc(l.summary);
        row.page_source = l.source || null;
        sk.k += (1 - sk.k) * clamp(LM.page * P.lr, 0, 0.95); tick(Math.round(60 * (row.page_words / 200)));
      }
      for (const it0 of body.items || []) {
        const live = db.byId('items', it0.id);
        if (!live || live.skipped || live.reserved) continue;
        if (live.correct !== null && live.correct !== undefined) continue;
        const c = noteRepeat(row, live.prompt, lessonLevel);
        const m = answerModel(sk);
        const given = m.right ? live.answer : (Array.isArray(live.choices) ? (live.choices.find((x) => String(x) !== String(live.answer)) ?? 'zzz') : 'zzz');
        const res = await call('answer', 'POST', `/api/sessions/${sid}/answer`, { item_id: live.id, answer: given, ms: (SEC.item + 2) * 1000 });
        if (res.status >= 400 && res.status !== 409) led.errors.push(`answer ${level}: ${res.status} ${JSON.stringify(res.body).slice(0, 100)}`);
        const after = db.byId('items', live.id); const r = !!(after && after.correct);
        seenCanon.set(c, { lesson: lessonLevel, right: r });
        row.answers++; if (r) row.right++;
        row.roles[live.role || 'none'] = (row.roles[live.role || 'none'] || 0) + 1;
        tick(SEC.item + (r ? 0 : SEC.wrong));
        if (res.body && res.body.speed && res.body.speed.action) { row.speed = res.body.speed.action; if (res.body.speed.action === 'stop_skill') break; }
      }
      if (curriculum.isCheckpoint(kindL) || body.kind === 'essay') {
        const fin = await call('finish', 'POST', `/api/sessions/${sid}/finish`, {});
        row.advanced = db.byId('enrollments', enr.id).current_level !== level;
        row.accuracy = row.answers ? row.right / row.answers : 0;
        if (!row.advanced) { db.update('enrollments', enr.id, { current_level: Math.min(grade.pathLength, level + 1), pending_checkpoint: null, level_items: 0 }); row.forced_past = true; void fin; }
        db.update('sessions', sid, { ended_at: db.byId('sessions', sid).ended_at || new Date().toISOString() });
      } else {
        const fin = await call('block_finish', 'POST', `/api/sessions/${sid}/block-finish`, {});
        row.advanced = !!(fin.body && fin.body.level_complete);
        if (fin.status >= 400) led.errors.push(`block-finish ${level}: ${fin.status} ${JSON.stringify(fin.body).slice(0, 120)}`);
        if (fin.body && fin.body.progress && !fin.body.level_complete) row.blockers = fin.body.progress.blockers;
        if (fin.body && fin.body.speed_skipped) row.speed_skipped = fin.body.speed_skipped;
        await call('finish', 'POST', `/api/sessions/${sid}/finish`, {});
      }
    } else { led.errors.push(`nothing to do at ${level}: ${JSON.stringify(body).slice(0, 160)}`); break; }
    row.kAfter = sk.k; row.status = objectiveState(lessonLevel);
    led.levels.push(row);
    if (kindL === 'lesson') lessonsDone++;
    if (minutes >= MINUTES) { advance(DAY - (minutes * 60000)); minutes = 0; }
  }
  led.path_days = (offset - startOffset) / DAY;
  led.final_level = db.byId('enrollments', enr.id).current_level;
  try { const rep = coverage.forEnrollment(user.id, db.byId('enrollments', enr.id)); const tally = {}; for (const st2 of rep.states) tally[st2.status] = (tally[st2.status] || 0) + 1; led.coverage = tally; } catch { led.coverage = null; }
  led.review_answers = led.levels.reduce((n, r) => n + (r.roles.review || 0), 0);
  // Whole-stretch view
  const stretchRows = new Map();
  for (const r of led.levels) { const L = lessonOf(r.level); const s = stretchRows.get(L) || { lesson: L, levels: 0, practice: 0, retention: 0, game: 0, answers: 0, right: 0, status: null, provenAfterLevels: null }; s.levels++; s.answers += r.answers; s.right += r.right; if (r.retention) s.retention++; else if (r.route !== 'session' && r.kind === 'practice') s.game++; else if (r.kind === 'practice') s.practice++; s.status = r.status; if (s.provenAfterLevels === null && (r.status === 'proven' || r.status === 'retained')) s.provenAfterLevels = s.levels; stretchRows.set(L, s); }
  led.stretches = [...stretchRows.values()];
  const outFile = arg('out');
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(led));
  const sum = (a) => a.reduce((x, y) => x + y, 0); const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(p * (b.length - 1))] : null; };
  const by = {};
  for (const r of led.levels) { const k = r.retention ? `retention/${r.route}` : `${r.kind}/${r.route}`; const b = (by[k] = by[k] || { sittings: 0, answers: 0, right: 0, repeats: 0, repeatsAfterRight: 0, words: 0 }); b.sittings++; b.answers += r.answers; b.right += r.right; b.repeats += r.repeats; b.repeatsAfterRight += r.repeatsAfterRight; b.words += r.page_words || 0; }
  origLog(`${led.grade} ${KIND} seed ${SEED}: lessons ${lessonsDone}, sittings ${led.levels.length}, answers ${sum(led.levels.map((r) => r.answers))}, ended on level ${led.final_level}, days ${led.path_days.toFixed(1)}`);
  origLog(Object.entries(by).map(([k, b]) => `${k}: sittings ${b.sittings}, answers ${b.answers}, right ${(100 * b.right / Math.max(1, b.answers)).toFixed(0)}%, near-repeats ${b.repeats} (after right ${b.repeatsAfterRight}), page words ${b.words}`).join('\n'));
  for (const [k, a] of Object.entries(led.server_ms)) origLog(`server ${k}: n ${a.length} p50 ${q(a, 0.5)} ms p95 ${q(a, 0.95)} ms max ${Math.max(...a)} ms`);
  origLog('stretches:', led.stretches.map((s) => `L${s.lesson}: ${s.levels} lv ${s.answers} ans ${(100 * s.right / Math.max(1, s.answers)).toFixed(0)}% ${s.status || '?'}@${s.provenAfterLevels || '-'}`).join(' | '));
  origLog('stay-on-level', led.levels.filter((r) => r.advanced === false).length, 'errors', led.errors.slice(0, 5));
  const b0 = led.levels.find((r) => r.blockers && r.blockers.length); if (b0) origLog('blockers e.g.', b0.blockers);
  origLog('sequence:', led.levels.slice(0, 40).map((r) => `${r.level}${r.kind === 'lesson' ? 'L' : r.retention ? 'R' : r.kind === 'practice' ? '' : r.kind[0].toUpperCase()}${r.route !== 'session' ? 'g' : ''}:${r.answers}${r.advanced === false ? '!' : ''}`).join(' '));
  void speedLevers;
  process.exit(0);
})().catch((e) => { origErr(e); process.exit(1); });
