/**
 * Write the base (shared) version of a stretch of levels: lessons, retention
 * levels, games, checkpoint quizzes and essays — the versions standard learners
 * and the owner see. Learners on a tailoring plan get their own versions on top.
 *
 *   npm run generate:base -- --track english --grade proficient --from 1 --to 100
 *       [--only lessons,retention,games,tests,essays] [--force] [--concurrency 4]
 *       [--no-assign] [--dry] [--allow-backup] [--redo-fallback]
 *
 * Uses GLM 5.3 Flash on OpenRouter only (OPENROUTER_GLM_API_KEY or
 * OPENROUTER_API_KEY). --allow-backup lets MiMo V2.6 Pro write what GLM cannot.
 * With FACT_CHECK_ANTHROPIC_KEY set, Claude researches each lesson's facts first
 * and verifies every claim after (services/block-levels.js, "making a level
 * factual"); a lesson that cannot be verified is held, not served. A lesson
 * written before verification existed is verified here rather than rewritten.
 *
 * Stop the server first: both write data/db.json, and whichever writes last wins.
 *
 * The order matters, and it is the order a learner meets them in reverse of
 * dependence:
 *
 *   1. games are assigned engines: random, but balanced across the engines'
 *      difficulty tiers and easier-to-harder within each run of activities,
 *      each engine used about equally (config/level-assignments.json)
 *   2. lessons — each one's layout starts from a coverage list of every point
 *      its topic and topic generalization require
 *   3. retention levels — built on what step 2's lessons actually covered
 *   4. games — the creator's game prompt, questions ordered evenly by difficulty
 *   5. tests and essays — built on what the lessons since the last checkpoint
 *      covered, to test understanding rather than recall of wording
 *
 * Already-written levels are skipped unless --force. A report is written to
 * data/base-levels-report.json.
 */
const fs = require('fs');
const path = require('path');

// The key may sit in this folder's .env or the repository root's.
const dotenv = require('dotenv');
const here = path.join(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(__dirname, '..', '..', '.env') });

// GLM 5.3 Flash only, unless --allow-backup: with no fallback named, the blocks
// route is OpenRouter's GLM and nothing else, so a level GLM cannot write is
// reported as failed rather than written by another model.
if (!process.argv.includes('--allow-backup')) process.env.AI_PROVIDER_BLOCKS_FALLBACK = '';
// The levels being written at once (--concurrency) each make their calls side by
// side rather than queueing behind one another: a few levels at a time stays far
// under the provider's request limit.
process.env.BLOCK_LANE = process.env.BLOCK_LANE || 'parallel';
// A base level is written once and read by everyone: it gets a real layout or it
// is written again, never the plain default.
process.env.BLOCK_REQUIRE_LAYOUT = '1';
// GLM's default thinking spends ten times the answer on reasoning; at low effort
// a layout costs ~900 output tokens instead of ~14,500 and is as complete.
process.env.OPENROUTER_GLM_BLOCKS_EFFORT = process.env.OPENROUTER_GLM_BLOCKS_EFFORT || 'low';

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const gameAssignments = require('../config/game-assignments');
const providers = require('../services/providers');
const blockLevels = require('../services/block-levels');
const blockCheckpoints = require('../services/block-checkpoints');
const gamePayloads = require('../services/game-payloads');
const essays = require('../services/essays');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const TRACK = flag('track', 'english');
const GRADE = flag('grade', 'proficient');
const FROM = Number(flag('from', 1));
const TO = Number(flag('to', 100));
const FORCE = !!flag('force', false);
// Rewrite levels that were written on the plain default layout.
const REDO_FALLBACK = !!flag('redo-fallback', false);
const DRY = !!flag('dry', false);
const ASSIGN = !flag('no-assign', false);
const CONCURRENCY = Math.max(1, Number(flag('concurrency', 4)));
const ONLY = new Set(String(flag('only', 'lessons,retention,games,tests,essays')).split(',').map((s) => s.trim()));

const ASSIGNMENTS_FILE = path.join(__dirname, '..', 'config', 'level-assignments.json');
const REGISTRY_FILE = path.join(__dirname, '..', 'game_registry.json');

const grade = curriculum.getGrade(TRACK, GRADE);
if (!grade) {
  console.error(`no grade ${TRACK}/${GRADE}`);
  process.exit(1);
}

// ── 1. balanced game assignment ────────────────────────────────────────────
function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000000) / 1000000; };
}

/**
 * The engines for every unassigned practice level in the range.
 *
 * Runs of consecutive game levels (the activities after a lesson, the entry
 * testers) each get a mix of the three tiers in about equal numbers, easier
 * first: the questions' difficulty range is set by the engine's tier, so a run
 * climbs from consolidating to stretching. Within a tier the least-used engine
 * is picked, ties broken at random, so the whole range uses the library evenly.
 */
function assignGames() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  const tierOf = (d) => (d === 'low' ? 0 : d === 'medium' ? 1 : 2);
  const tiers = [[], [], []];
  for (const e of registry.engines || []) {
    if (e.status === 'broken' || !gamePayloads.schemaFor(e.id) || !gamePayloads.engineHtml(e.id)) continue;
    tiers[tierOf(e.difficulty)].push(e.id);
  }
  const config = JSON.parse(fs.readFileSync(ASSIGNMENTS_FILE, 'utf8'));
  config.levels = config.levels || {};
  const rand = seeded(`${TRACK}:${GRADE}:${FROM}-${TO}`);
  const used = new Map();
  const pickFrom = (tier) => {
    const pool = tiers[tier].length ? tiers[tier] : tiers.flat();
    const least = Math.min(...pool.map((id) => used.get(id) || 0));
    const choices = pool.filter((id) => (used.get(id) || 0) === least);
    const id = choices[Math.floor(rand() * choices.length)];
    used.set(id, (used.get(id) || 0) + 1);
    return id;
  };

  // Runs of consecutive game levels.
  const runs = [];
  let run = [];
  for (let level = FROM; level <= TO; level++) {
    const isGame = !blockLevels.kindFor(grade, level) && !curriculum.isEssayCheckpoint(grade, level)
      && curriculum.levelKind(level, grade.pathLength, grade) === 'practice';
    if (isGame) run.push(level);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);

  const out = {};
  for (const levels of runs) {
    const n = levels.length;
    const plan = levels.map((_, i) => Math.min(2, Math.floor(((i + 0.5) * 3) / n)));
    levels.forEach((level, i) => {
      const key = `${TRACK}/${GRADE}/${level}`;
      if (config.levels[key] && config.levels[key].source !== 'balanced' && !FORCE) {
        out[level] = config.levels[key].engineId;
        return;
      }
      const engineId = pickFrom(plan[i]);
      config.levels[key] = { engineId, source: 'balanced' };
      out[level] = engineId;
    });
  }
  if (!DRY) fs.writeFileSync(ASSIGNMENTS_FILE, `${JSON.stringify(config, null, 2)}\n`);
  return out;
}

// ── running work ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Run tasks a few at a time. A task that fails is tried again after a pause:
 * GLM's upstream pool answers 429 when it is busy for everyone, and the
 * provider sets the route aside for a few minutes when it does, so an
 * immediate retry would only fail the same way.
 */
async function pool(tasks, size, { retries = 2, pauseMs = 200000 } = {}) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      for (let attempt = 0; attempt <= retries; attempt++) {
        results[i] = await tasks[i]().catch((err) => ({ ok: false, error: err.message }));
        if (!results[i] || results[i].ok !== false) break;
        if (attempt < retries) {
          console.log(`  ... retrying in ${Math.round(pauseMs / 1000)}s`);
          await sleep(pauseMs);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
  return results;
}

const report = { track: TRACK, grade: GRADE, from: FROM, to: TO, started_at: new Date().toISOString(), levels: [] };
const tokens = { input: 0, output: 0 };
function note(level, kind, row) {
  report.levels.push({ level, kind, ...row });
  if (row.usage) {
    tokens.input += (row.usage.input_tokens || 0) + (row.usage.cache_read_input_tokens || 0);
    tokens.output += row.usage.output_tokens || 0;
  }
  const status = row.ok ? 'ok  ' : 'FAIL';
  console.log(`  ${status} ${String(level).padStart(3)} ${kind.padEnd(10)} ${row.detail || row.error || ''}`);
  return row;
}

function levelsOf(kind) {
  const out = [];
  for (let level = FROM; level <= TO; level++) {
    const k = blockLevels.kindFor(grade, level);
    if (kind === 'essay' ? curriculum.isEssayCheckpoint(grade, level) : k === kind) out.push(level);
  }
  return out;
}

/** One line on a plan's verification: claims checked, fixed, dropped, searches and cost. */
function verified(plan) {
  const v = plan.verification;
  if (!v) return 'not verified (no FACT_CHECK_ANTHROPIC_KEY)';
  const failed = (v.claims || []).filter((c) => c.round === 0 && c.verdict !== 'verified').length;
  return `verified ${(v.claims || []).filter((c) => c.round === 0).length} claims, ${failed} wrong at first, `
    + `${v.blocks_fixed.length + v.checks_fixed.length} fixed, ${v.blocks_dropped.length + v.checks_dropped.length} dropped, `
    + `${v.searches} searches, $${(v.cost + ((plan.fact_sheet && plan.fact_sheet.cost) || 0)).toFixed(3)}`;
}

async function lessonLike(kind) {
  const levels = levelsOf(kind);
  console.log(`\n${kind === 'lesson' ? 'lessons' : 'retention levels'}: ${levels.length}`);
  const tasks = levels.map((level) => async () => {
    const existing = blockLevels.readyPlan({ userId: null, trackId: TRACK, gradeId: GRADE, level });
    const redo = FORCE || (REDO_FALLBACK && existing && existing.layout_fallback);
    if (existing && !redo) {
      if (blockLevels.servable(existing)) return note(level, kind, { ok: true, detail: 'already written' });
      // Written before verification existed, or held while the verifier was down.
      const checked = await blockLevels.verifyStored(existing);
      if (checked && blockLevels.servable(checked)) return note(level, kind, { ok: true, detail: `already written; ${verified(checked)}` });
      return note(level, kind, { ok: false, error: checked ? 'could not be verified (is the key working? node scripts/check-fact-key.js)' : 'too little survived verification; run again to rewrite it' });
    }
    if (existing && redo) db.update('block_plans', existing.id, { status: 'replaced' });
    const plan = await blockLevels.write({ userId: null, trackId: TRACK, gradeId: GRADE, level, tailored: false });
    if (!plan) {
      const row = db.find('block_plans', (p) => p.user_id === null && p.track_id === TRACK && p.grade_id === GRADE && p.level === level).pop();
      return note(level, kind, { ok: false, error: (row && row.reason) || 'no plan written' });
    }
    if (!blockLevels.servable(plan)) return note(level, kind, { ok: false, error: 'written, but held: it could not be verified (node scripts/check-fact-key.js)' });
    return note(level, kind, {
      ok: true,
      usage: plan.usage,
      detail: `${plan.blocks.length} blocks, ${plan.checks.length} checks, ${plan.coverage.length} coverage points${plan.dropped.length ? `, dropped ${plan.dropped.map((d) => d.block).join('/')}` : ''}; ${verified(plan)} (${plan.seconds}s)`,
    });
  });
  // Lessons go in order, a few at a time; retention needs the lessons first.
  await pool(tasks, CONCURRENCY);
}

async function games() {
  const levels = [];
  for (let level = FROM; level <= TO; level++) if (gameAssignments.resolve(TRACK, GRADE, level)) levels.push(level);
  console.log(`\ngames: ${levels.length}`);
  const tasks = levels.map((level) => async () => {
    const assignment = gameAssignments.resolve(TRACK, GRADE, level);
    const stored = db.findOne('game_payloads', (r) => !r.user_id && r.track_id === TRACK && r.grade_id === GRADE && r.level === level);
    if (stored && stored.engine_id === assignment.engineId && stored.payload && !(stored.problems || []).length && !FORCE) {
      return note(level, 'game', { ok: true, detail: `${assignment.engineId}, already written` });
    }
    if (stored) db.update('game_payloads', stored.id, { payload: null, problems: ['being rewritten'] });
    const started = Date.now();
    const ready = await gamePayloads.ensure(null, TRACK, GRADE, level);
    const row = gamePayloads.stored(TRACK, GRADE, level);
    if (!ready) return note(level, 'game', { ok: false, error: `${assignment.engineId}: ${((row && row.problems) || ['no reply']).slice(0, 2).join('; ')}` });
    const d = ready.payload.questions.map((q) => q.difficulty);
    return note(level, 'game', {
      ok: true,
      detail: `${assignment.engineId}, ${d.length} questions, difficulty ${Math.min(...d)}-${Math.max(...d)} (${Math.round((Date.now() - started) / 1000)}s)`,
    });
  });
  await pool(tasks, CONCURRENCY);
}

async function tests() {
  const levels = levelsOf('checkpoint');
  console.log(`\ntests: ${levels.length}`);
  for (const level of levels) {
    const existing = db.findOne('block_plans', (p) => p.user_id === null && p.kind === 'checkpoint'
      && p.track_id === TRACK && p.grade_id === GRADE && p.level === level && p.attempt === 1);
    if (existing && existing.status === 'ready' && !FORCE) { note(level, 'test', { ok: true, detail: 'already written' }); continue; }
    if (existing) db.update('block_plans', existing.id, { status: 'replaced', attempt: -1 });
    const row = await blockCheckpoints.writeShared({ trackId: TRACK, gradeId: GRADE, grade, level });
    note(level, 'test', row && row.status === 'ready'
      ? { ok: true, usage: row.usage, detail: `${row.filled}/${row.wanted} questions (${row.seconds}s)` }
      : { ok: false, error: 'no questions written' });
  }
}

async function essayLevels() {
  const levels = levelsOf('essay');
  console.log(`\nessays: ${levels.length}`);
  for (const level of levels) {
    const entry = LAYOUT.entryFor(grade, level) || {};
    if (/revision/i.test(String(entry.type || ''))) {
      note(level, 'essay', { ok: true, detail: 'a revision: each learner revises their own draft, nothing to write' });
      continue;
    }
    const existing = essays.baseEssay(TRACK, GRADE, level);
    if (existing && !FORCE) { note(level, 'essay', { ok: true, detail: 'already written' }); continue; }
    const row = await essays.writeBase({ trackId: TRACK, gradeId: GRADE, level });
    note(level, 'essay', row.status === 'ready'
      ? { ok: true, detail: `"${String(row.prompt).slice(0, 70)}..." ${row.criteria.length} criteria (${row.seconds}s)` }
      : { ok: false, error: row.reason });
  }
}

(async () => {
  const route = providers.current('blocks');
  console.log(`base levels for ${TRACK}/${GRADE} ${FROM}-${TO}`);
  console.log(`model: ${route ? `${route.name} / ${route.modelFor('blocks')}` : 'NONE'} (route ${providers.order('blocks').join(' -> ')})`);

  if (ASSIGN && ONLY.has('games')) {
    const assigned = assignGames();
    const tierCount = {};
    const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    for (const id of Object.values(assigned)) {
      const d = ((registry.engines || []).find((e) => e.id === id) || {}).difficulty || '?';
      tierCount[d] = (tierCount[d] || 0) + 1;
    }
    console.log(`\ngames assigned: ${Object.keys(assigned).length} levels, ${new Set(Object.values(assigned)).size} engines, by tier ${JSON.stringify(tierCount)}${DRY ? ' (dry run, not saved)' : ''}`);
  }

  if (DRY) {
    const ctx = blockLevels.levelContext(TRACK, GRADE, levelsOf('lesson')[0] || FROM);
    const catalog = blockLevels.catalogFor('lesson').map(blockLevels.catalogLine).join('\n');
    console.log(`\nlayout prompt: ~${Math.round((blockLevels.LAYOUT_SYSTEM.length + catalog.length + ctx.text.length) / 4)} tokens in`);
    console.log(`lessons ${levelsOf('lesson').length}, retention ${levelsOf('retention').length}, tests ${levelsOf('checkpoint').length}, essays ${levelsOf('essay').length}`);
    return;
  }
  if (!route) {
    console.error('\nNo model for the blocks route. Set OPENROUTER_GLM_API_KEY (or OPENROUTER_API_KEY), or MIMO_API_KEY, in .env.');
    process.exit(1);
  }

  if (ONLY.has('lessons')) await lessonLike('lesson');
  if (ONLY.has('retention')) await lessonLike('retention');
  if (ONLY.has('games')) await games();
  if (ONLY.has('tests')) await tests();
  if (ONLY.has('essays')) await essayLevels();

  // A level retried after a failure keeps only its last result.
  const last = new Map();
  for (const row of report.levels) last.set(`${row.kind}:${row.level}`, row);
  report.levels = [...last.values()].sort((a, b) => a.level - b.level);
  report.finished_at = new Date().toISOString();
  report.tokens = tokens;
  const failed = report.levels.filter((l) => !l.ok);
  const out = path.join(__dirname, '..', 'data', 'base-levels-report.json');
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${report.levels.length - failed.length} written or kept, ${failed.length} failed; ~${tokens.input} tokens in, ~${tokens.output} out (game calls not counted)`);
  console.log(`report: ${out}`);
  // Give the database a moment to flush its last write.
  setTimeout(() => process.exit(failed.length ? 2 : 0), 500);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
