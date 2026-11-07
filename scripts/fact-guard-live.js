#!/usr/bin/env node
/**
 * The fact guard on the real path, with real models: how long does it add, how often does it hold, what does it cost? SIMULATED learners (extreme and random,
 * scripts/lib/extreme-learners.js, held-out seed) and a COPY of the database; no real learner's words. Spends prepaid credits through their ledgers
 * (RUN_CAP_USD default 3). Not part of npm test. Results are judged by AI, not real-learner proof.
 *
 *   node scripts/fact-guard-live.js --db copy.json [--seed 7711] [--n 12] [--lessons 3] [--turns 36] [--out FILE]
 *
 * Tutor: real tutor replies (task dock_help) to questions in several subjects, then the guard on each. Layer: services/lesson-layer.js compose on shared lessons.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV, quiet: true }); } catch { /* the environment */ } }
require('../services/run-cap').defaultCap(3);
const LIVE_DIR = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['CORAL', 'GONKA', 'GROKIFIED', 'LYCEUM', 'MUNITO', 'ZEROGPU']) {
  if (!process.env[`${n}_LEDGER_FILE`]) process.env[`${n}_LEDGER_FILE`] = `${LIVE_DIR}/${n.toLowerCase()}-ledger.json`;
  process.env[`${n}_PIPELINE`] = '1';
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fact-guard-live-'));
const tmpDb = path.join(tmp, 'db.json');
fs.copyFileSync(arg('db', path.join(LIVE_DIR, 'db.json')), tmpDb);
process.env.DB_FILE = tmpDb;

const db = require('../config/db');
const ai = require('../services/ai');
const pool = require('../services/pool');
const guard = require('../services/fact-guard');
const layer = require('../services/lesson-layer');
const ls = require('../services/learning-spec');
const X = require('./lib/extreme-learners');

const SEED = Number(arg('seed', 7711)); const N = Number(arg('n', 12)); const LESSONS_N = Number(arg('lessons', 3)); const TURNS = Number(arg('turns', 36));
const spent = () => Object.fromEntries(['zerogpu', 'coral', 'gonka', 'munito'].map((n) => { try { return [n, JSON.parse(fs.readFileSync(`${LIVE_DIR}/${n}-ledger.json`)).settled_usd]; } catch { return [n, 0]; } }));
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const QUESTIONS = [
  ['math', 'How do I add 2/3 and 1/4?'], ['math', 'What is the quadratic formula and when do I use it?'], ['math', 'Why is a negative times a negative positive?'], ['math', 'What is 18% of 250?'], ['math', 'What does the slope of a line tell me?'], ['math', 'How do I find the area of a triangle with base 7 and height 4?'],
  ['science', 'Why is the sky blue?'], ['science', 'What is the difference between an atom and a molecule?'], ['science', 'How do vaccines work?'], ['science', 'What does the mitochondria do?'], ['science', 'What is Newton\'s third law?'], ['science', 'Why does ice float on water?'],
  ['history', 'What caused World War I?'], ['history', 'When was the Magna Carta signed and why does it matter?'], ['history', 'Who was the first emperor of Rome?'], ['history', 'What was the Cold War about?'], ['english', 'What is the difference between affect and effect?'], ['english', 'What is a semicolon for?'],
  ['english', 'What is the passive voice?'], ['english', 'What is a metaphor? Give me an example.'], ['spanish', 'When do I use ser and when estar?'], ['spanish', 'How do I say I would like a coffee in Spanish?'], ['spanish', 'What is the preterite of hablar for yo?'], ['spanish', 'What gender is the word mano?'],
  ['chess', 'What is castling and when is it not allowed?'], ['chess', 'What is en passant?'], ['chess', 'How much is a rook worth compared to a bishop?'], ['basketball', 'What is a pick and roll?'], ['basketball', 'What is traveling?'], ['piano', 'What notes are in a G major scale?'],
  ['general', 'Hi!'], ['general', 'I feel stupid, I keep failing this.'], ['general', 'How should I study for a test on Friday?'], ['general', 'Can you explain that again but simpler?'], ['general', 'What should I work on next?'], ['general', 'Thanks, that helped.'],
];
const SYSTEM = 'You are a warm, exact personal tutor inside a learning app. Answer in at most four short sentences, plain text, at the level of a school student.';

// The route a cleared adult gets: a simulated account in the DB copy, so the pool sees a learner-class call with the same clearances a real one has.
const simUser = db.insert('users', { email: 'fact-guard-sim@savant.test', display_name: 'Sim', onboarded: true, account_type: 'standard', age_check: { birth_ym: '1990-01', needs_parent: false } });
const LEARNER = { userId: simUser.id, dataClass: 'learner' };

async function tutorRound() {
  const out = [];
  const list = QUESTIONS.slice(0, TURNS);
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < list.length) {
      const [subject, q] = list[next++];
      const t0 = Date.now();
      // factTask: the writer alone is timed here, so its call is registered as internal; the guard runs on its answer just below.
      // eslint-disable-next-line no-await-in-loop
      const w = await ai.talkDetail({ role: 'fast', task: 'dock_help', factTask: 'pool_batch_test', system: SYSTEM, messages: [{ role: 'user', content: q }], maxTokens: 400, hedgeAfterMs: 4000, timeoutMs: 15000, ...LEARNER }).catch(() => null);
      const writerMs = Date.now() - t0;
      if (!w || !w.text) { out.push({ subject, q, writerMs, none: true }); continue; }
      const t1 = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const p = await guard.pass({ task: 'dock_help', userId: LEARNER.userId || null, req: { kind: 'chat', messages: [{ role: 'user', content: q }], ...LEARNER }, result: { text: w.text, model: w.model }, rerun: (note) => ai.talkDetail({ role: 'fast', task: 'dock_help', factTask: 'pool_batch_test', system: `${SYSTEM}\n\n${note}`, messages: [{ role: 'user', content: q }], maxTokens: 400, timeoutMs: 10000, ...LEARNER }).catch(() => null) });
      out.push({ subject, q, writerMs, guardMs: Date.now() - t1, shown: p && p.text, heldAs: p && p.held, changed: !!(p && !p.held && p.text !== w.text), first: w.text, model: w.model });
    }
  }));
  return out;
}

async function layerRound() {
  const learners = X.generate(SEED, N);
  const specOf = (L, topic) => ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(L.traits).map(([m, v]) => [m, { measured: v, confidence: 90 }])), age: L.age, esl: !!L.ell, interests: L.hobbies, dislikes: L.dislikes, topic, profileFacts: { difficulties: L.difficulties, strengths: L.strengths, worked: [], goals: [] } });
  const plans = db.find('block_plans', (p) => !p.user_id && p.status === 'ready' && p.kind === 'lesson' && (p.blocks || []).length >= 3 && (p.checks || []).length >= 1);
  const byTrack = {}; for (const p of plans) (byTrack[p.track_id] = byTrack[p.track_id] || []).push(p);
  const lessons = Object.values(byTrack).map((a) => a[Math.floor(a.length / 2)]).slice(0, LESSONS_N);
  const cells = []; for (const p of lessons) for (const L of learners) cells.push({ p, L });
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < cells.length) {
      const { p, L } = cells[next++];
      const topic = p.topic || p.title || '';
      const source = layer.sourceOf(p, topic);
      let spec;
      try { spec = specOf(L, topic); } catch { continue; }
      const t0 = Date.now();
      const call = (a) => pool.runForeground(() => ai.structuredDetail({ role: 'fast', task: 'part_layer', ...a, ...LEARNER, effort: 'off', factSource: source.text }), { fast: true });
      // eslint-disable-next-line no-await-in-loop
      const r = await layer.compose({ spec, source, plan: p, call, t0 }).catch((e) => ({ got: null, problems: [String(e.message)], first: [] }));
      out.push({ learner: L.id || L.seed || L.name, track: p.track_id, ms: Date.now() - t0, shown: !!(r.got && !r.problems.length), problems: (r.problems || []).slice(0, 2), layer: r.got ? r.got.layer : null });
    }
  }));
  return out;
}

async function main() {
  const before = spent();
  const tutor = await tutorRound();
  const afterTutor = spent();
  const layers = await layerRound();
  const after = spent();
  const money = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, Number(((b[k] || 0) - (a[k] || 0)).toFixed(5))]));
  const g = tutor.filter((t) => !t.none);
  console.log(`TUTOR replies ${g.length}/${tutor.length}  writer p50 ${pct(g.map((t) => t.writerMs), 0.5)} ms p95 ${pct(g.map((t) => t.writerMs), 0.95)} ms`);
  console.log(`  guard added p50 ${pct(g.map((t) => t.guardMs), 0.5)} ms p95 ${pct(g.map((t) => t.guardMs), 0.95)} ms worst ${pct(g.map((t) => t.guardMs), 1)} ms`);
  console.log(`  passed first time ${g.filter((t) => !t.heldAs && !t.changed).length}, rewritten and passed ${g.filter((t) => t.changed).length}, held wrong ${g.filter((t) => t.heldAs === 'wrong').length}, held could-not-check ${g.filter((t) => t.heldAs === 'cant').length}`);
  for (const t of g.filter((x) => x.heldAs || x.changed)) console.log(`  HELD/REWRITTEN [${t.subject}] ${t.q} :: ${String(t.first).slice(0, 260)}`);
  console.log(`  ledger spend (includes other builds on these keys): ${JSON.stringify(money(before, afterTutor))}`);
  const shown = layers.filter((l) => l.shown);
  console.log(`LAYER ${shown.length}/${layers.length} shown, time to stored p50 ${pct(layers.map((l) => l.ms), 0.5)} ms p95 ${pct(layers.map((l) => l.ms), 0.95)} ms worst ${pct(layers.map((l) => l.ms), 1)} ms`);
  const why = {}; for (const l of layers.filter((x) => !x.shown)) { const k = String(l.problems[0] || 'none').slice(0, 40); why[k] = (why[k] || 0) + 1; }
  console.log(`  not shown because: ${JSON.stringify(why)}`);
  console.log(`  ledger spend (includes other builds on these keys): ${JSON.stringify(money(afterTutor, after))}`);
  console.log(`  guard stats: ${JSON.stringify(guard.stats())}`);
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ tutor, layers }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
