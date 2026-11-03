/**
 * Do the base levels stay exactly as they were? (subjects-levels depth, 2 Nov 2026)
 *
 *   node scripts/block-diff.js --snapshot FILE     write the hash of every model prompt a built-in level makes
 *   node scripts/block-diff.js --compare FILE      write them again and list every prompt that differs from FILE
 *   node scripts/block-diff.js --selfcheck         the same writers with the adapter off, then on: no sheet or snapshot needed (run by npm test)
 *
 * A learner we know nothing about (an empty learning spec) and the shared base version of a level must be written from
 * exactly the prompts they were written from before the block adapter (services/block-adapt.js). This runs the real writers
 * (block-levels write, block-checkpoints write, game-payloads ensureTailored) for one lesson level of each of math, English,
 * IQ and Spanish, a Master checkpoint and an English game, with the model replaced by a stub that records the system and user
 * text of every call, and hashes them. FILE is made on the commit before the adapter (docs/block-diff-base.json); --compare
 * exits 1 when any hash differs. No model is called; the DB is a copy of the test fixture.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';
process.env.AI_POOL = '0';
process.env.TESTER_TAILORING = 'off';
process.env.LEVEL_SELF_CHECK = 'off';
process.env.KEY_GATE = 'off';
delete process.env.FACT_CHECK_ANTHROPIC_KEY;
const copy = path.join(os.tmpdir(), `block-diff-${process.pid}.json`);
fs.copyFileSync(process.env.BLOCK_DIFF_DB || path.join(__dirname, 'fixtures', 'test-db.json'), copy);
process.env.DB_FILE = copy;
const db = require('../config/db');
process.on('exit', () => { try { fs.unlinkSync(copy); } catch { /* gone */ } });

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const curriculum = require('../config/curriculum');
const gameAssignments = require('../config/game-assignments');
const learner = require('../services/learner');
const ai = require('../services/ai');
const providers = require('../services/providers');
const blockLevels = require('../services/block-levels');
const blockCheckpoints = require('../services/block-checkpoints');
const gamePayloads = require('../services/game-payloads');

const sha = (t) => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 12);
const GRADES = { math: /^algebra/, english: /^proficient$/, iq: /^abstract_reasoning$/, spanish: /^spanish_grade_04/ };

function gradeOf(trackId) {
  const all = curriculum.getTrack ? curriculum.getTrack(trackId).grades : curriculum.gradesFor(trackId);
  return all.find((g) => GRADES[trackId].test(g.id)) || all[Math.min(all.length - 1, 5)];
}
function firstLevel(grade, trackId, want) {
  for (let l = 8; l <= grade.pathLength; l++) {
    const kind = blockLevels.kindFor(grade, l);
    if (want === 'lesson' && kind === 'lesson') return l;
    if (want === 'checkpoint' && kind === 'checkpoint') return l;
  }
  return null;
}
function emptyUser(tag) {
  const u = db.insert('users', { email: `blockdiff-${tag}@example.test`, display_name: `Diff ${tag}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  learner.saveProfile(u.id, { subscription: 'pro' });
  return u;
}

async function collect(tag) {
  const out = {};
  let current = null;
  const realDetail = ai.structuredDetail;
  const realCurrent = providers.current;
  providers.current = (role) => (role === 'blocks' ? { name: 'stub', modelFor: () => 'stub', isEnabled: () => true } : realCurrent(role));
  ai.structuredDetail = async (args) => {
    const list = (out[current] = out[current] || []);
    list.push(`${args.task || args.schemaName}:${sha(args.system)}:${sha(args.user)}`);
    return null;
  };
  try {
    const user = emptyUser(tag);
    for (const trackId of ['math', 'english', 'iq', 'spanish']) {
      const grade = gradeOf(trackId);
      const level = firstLevel(grade, trackId, 'lesson');
      if (!level) { out[`${trackId}:lesson`] = ['no lesson level']; continue; }
      for (const [tag, tailored, uid] of [['shared', false, null], ['empty', true, user.id]]) {
        current = `${trackId}:${grade.id}:${level}:lesson:${tag}`;
        db.insert('enrollments', { user_id: user.id, track_id: trackId, grade_id: grade.id, target_level: grade.pathLength, current_level: level, status: 'active', xp: 0, level_items: 0 });
        // eslint-disable-next-line no-await-in-loop
        await blockLevels.write({ userId: uid, trackId, gradeId: grade.id, level, tailored }).catch((e) => { (out[current] = out[current] || []).push(`threw:${String(e.message).slice(0, 60)}`); });
      }
      const cp = firstLevel(grade, trackId, 'checkpoint');
      if (cp) {
        current = `${trackId}:${grade.id}:${cp}:checkpoint:empty`;
        const enrollment = db.insert('enrollments', { user_id: user.id, track_id: trackId, grade_id: grade.id, target_level: grade.pathLength, current_level: cp, status: 'active', xp: 0, level_items: 0 });
        // eslint-disable-next-line no-await-in-loop
        await blockCheckpoints.write({ userId: user.id, enrollment, grade, level: cp, attempt: 1 }).catch((e) => { (out[current] = out[current] || []).push(`threw:${String(e.message).slice(0, 60)}`); });
      }
    }
    // An English game level (its questions are model-written; the bank games of the other subjects are code).
    const assignment = gameAssignments.resolve('english', 'proficient', 106);
    current = 'english:proficient:106:game:empty';
    await gamePayloads.ensureTailored(user.id, 'english', 'proficient', 106, assignment, gamePayloads.schemaFor(assignment.engineId));
  } finally {
    ai.structuredDetail = realDetail;
    providers.current = realCurrent;
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

const same2 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
(async () => {
  if (argv.includes('--selfcheck')) {
    // Independent of the sheets on this machine: the same writers in two fresh processes (each on its own copy of the database, so
    // the same ids), with the adapter off and then on. A learner with no spec and the shared version of a level must give the same prompts.
    const { execFileSync } = require('child_process'); // eslint-disable-line global-require
    const run = (mode) => {
      const file = path.join(os.tmpdir(), `block-diff-${mode}-${process.pid}.json`);
      execFileSync(process.execPath, [__filename, '--snapshot', file], { env: { ...process.env, BLOCK_ADAPT: mode }, stdio: 'pipe' });
      const out = JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.unlinkSync(file);
      return out;
    };
    const off = run('off'); const on = run('on');
    const diff = Object.keys(off).filter((k) => !same2(off[k], on[k]));
    console.log(`block-diff: ${Object.keys(off).length - diff.length} of ${Object.keys(off).length} cases give the same prompts with the adapter on and off (an empty spec, and the shared version)`);
    for (const k of diff) console.log(`  DIFFERS ${k}
    off ${JSON.stringify(off[k])}
    on  ${JSON.stringify(on[k])}`);
    process.exit(diff.length || !Object.keys(off).length ? 1 : 0);
  }
  const sorted = await collect('empty');
  const keys = Object.keys(sorted);
  const file = arg('snapshot') || arg('compare');
  if (arg('snapshot')) {
    fs.writeFileSync(file, `${JSON.stringify(sorted, null, 1)}\n`);
    console.log(`block-diff: ${keys.length} cases, ${keys.reduce((n, k) => n + sorted[k].length, 0)} prompts written to ${file}`);
    return;
  }
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  let same = 0; const diff = [];
  for (const k of new Set([...Object.keys(base), ...keys])) {
    (JSON.stringify(base[k]) === JSON.stringify(sorted[k]) ? (same += 1) : diff.push(k));
  }
  console.log(`block-diff: ${same} of ${same + diff.length} cases are byte-identical to the base prompts`);
  for (const k of diff) console.log(`  DIFFERS ${k}\n    base ${JSON.stringify(base[k])}\n    now  ${JSON.stringify(sorted[k])}`);
  process.exit(diff.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
