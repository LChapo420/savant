/**
 * Is the fast writer for short voice turns (TUTOR_VOICE_FAST, services/tutor-context.js hardVoiceTurn) as good as the usual one? Held-out questions, real models.
 *
 *   node scripts/voice-fast-quality.js [--out=<file.json>] [--judge=grok-4.3]
 *
 * SPENDS A LITTLE (about $0.05): each question is answered twice through the real dock route in voice mode (same checks), once with the switch off and once on, for
 * synthetic learners on a temporary database (no real account is touched). A judge from a third model family (grok-4.3 on Grokified, its own ledger) compares each pair
 * blind, in random order, and scores each reply. AI-judged, not learner-measured. Live ledgers; RUN_CAP_USD caps the run. Modelflare, OpenRouter, Anthropic and
 * Standard Compute keys are blanked.
 *
 * The questions were written after the rule and are not used anywhere else (the delay clip and the profilers use other ones). Some are hard on purpose, to check the
 * rule sends them to the usual writer; extreme learners (a child's phrasing, slang, a very old learner, a sad one, Spanish) are in the mix.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : d; };
require(path.join(ROOT, 'node_modules/dotenv')).config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
for (const p of ['ANTHROPIC', 'CORAL', 'GLADIA', 'GONKA', 'GROKIFIED', 'JEV', 'LLMGATEWAY', 'LYCEUM', 'MUNITO', 'STANDARD_COMPUTE', 'ZEROGPU']) process.env[`${p}_LEDGER_FILE`] = path.join(LIVE, `${p.toLowerCase().replace('_', '-')}-ledger.json`);
Object.assign(process.env, { DB_FILE: path.join(os.tmpdir(), `vfq-${process.pid}.json`), HOLDOUT_DIR: os.tmpdir(), RUN_CAP_USD: process.env.RUN_CAP_USD || '0.5', NODE_ENV: 'development', GROKIFIED_PIPELINE: '1',
  MODELFLARE_API_KEY: '', MODELFLARE_HAIKU_API_KEY: '', MODELFLARE_LUNA_API_KEY: '', OPENROUTER_API_KEY: '', OPENROUTER_DEEPSEEK_API_KEY: '', OPENROUTER_GLM_API_KEY: '', OPENROUTER_GPT_SOL_API_KEY: '', ANTHROPIC_API_KEY: '', FACT_CHECK_ANTHROPIC_KEY: '', STANDARD_COMPUTE_API_KEY: '', UNOROUTER_API_KEY: '', AIHUBMIX_API_KEY: '', XKIRO_API_KEY: '' });
process.chdir(ROOT);

const LEARNERS = [
  { name: 'Gia', birth_year: 1996 },
  { name: 'Theo', birth_year: 2011 }, // 15
  { name: 'Ruth', birth_year: 1952 }, // 74
];
const QUESTIONS = [
  'What is an adjective?', 'What does a cell membrane do?', 'Who was Cleopatra?', 'What is the opposite of evaporation?', 'Why do leaves change colour in autumn?',
  'What is a metaphor?', 'How far away is the moon, roughly?', 'What is the water cycle?', 'What does gravity do?', 'Is a tomato a fruit?',
  'What is an atom made of?', 'what even is a noun lol', 'what r fractions for', 'Why do we have seasons?', 'What is democracy?',
  'What is the past tense of run?', 'How do bees make honey?', 'What is a synonym for happy?', 'What is a continent?', 'I feel kind of dumb today, can you help me with verbs?',
  'Que significa la palabra biblioteca?', 'What is the biggest planet?', 'What is an equation?', 'Why is the ocean salty?', 'What does a thermometer measure?',
  // Hard on purpose: the rule should keep these on the usual writer.
  'What is 15 percent of 80?', 'Can you walk me through long division step by step?', 'What is 7 times 8 minus 6?', 'Prove that the angles of a triangle add up to 180 degrees.', 'Explain it again differently please, I did not get photosynthesis.',
];

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

async function judge(grok, model, q, learner, a, b) {
  const system = 'You judge two replies from a voice tutor (they will be spoken aloud) to the same learner question. Be strict about facts. Reply with JSON only.';
  const user = `Learner (${learner}) said: "${q}"

Reply A: ${a}

Reply B: ${b}

For each reply list any statement that is false or misleading (an empty list if none), and score it 1 to 10 on: correct (facts), helpful (answers what was asked, at the right level, invites the next step), spoken (short, natural to hear, no lists or symbols), friendly (warm, like a smart friend). Then say which is better overall for this learner, or tie.
JSON: {"a":{"false":[],"correct":0,"helpful":0,"spoken":0,"friendly":0},"b":{"false":[],"correct":0,"helpful":0,"spoken":0,"friendly":0},"better":"A"|"B"|"tie","why":"<short>"}`;
  const r = await grok.chat({ system, messages: [{ role: 'user', content: user }], model, maxTokens: 700, temperature: 0, task: 'voice_fast_quality_judge' });
  const m = String(r && r.text || '').match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

(async () => {
  const db = require(path.join(ROOT, 'config/db'));
  const dock = require(path.join(ROOT, 'services/tutor-context'));
  const pool = require(path.join(ROOT, 'services/pool'));
  const { grokified } = require(path.join(ROOT, 'services/providers/grokified'));
  const users = LEARNERS.map((l, k) => db.insert('users', { email: `vfq${k}@example.test`, display_name: l.name, birth_year: l.birth_year, age_check: { needs_parent: false, age: 2026 - l.birth_year, birth_year: l.birth_year } }));
  const page = { path: '/dashboard', title: 'Home', heading: 'Today', text: 'Your plan for today' };
  let lastSlot = null;
  const ch = pool.callHedged;
  pool.callHedged = async (req, o) => { const r = await ch(req, o); if (req.task === 'dock_help') lastSlot = r && r.pool ? r.pool.slot : null; return r; };
  const rows = [];
  for (let k = 0; k < QUESTIONS.length; k++) {
    const q = QUESTIONS[k];
    const user = users[k % users.length];
    const one = async (fast) => {
      process.env.TUTOR_VOICE_FAST = fast ? '1' : '0';
      lastSlot = null;
      const t0 = Date.now();
      const r = await dock.reply({ user, messages: [{ role: 'user', content: q }], page, inputMode: 'voice' });
      return { reply: r.reply, source: r.source, held: !!r.held || /could you ask that another way|rather not guess|can't double-check/i.test(r.reply), writer: r.writer || 'usual', why: r.hard_why || null, slot: lastSlot, ms: Date.now() - t0 };
    };
    const usual = await one(false);
    const fast = await one(true);
    const flip = Math.random() < 0.5;
    let verdict = null;
    try { verdict = await judge(grokified, arg('judge', 'grok-4.3'), q, `${user.display_name}, born ${user.birth_year}`, flip ? fast.reply : usual.reply, flip ? usual.reply : fast.reply); } catch (e) { verdict = { error: String(e.message).slice(0, 120) }; }
    const v = verdict && !verdict.error ? { fast: flip ? verdict.a : verdict.b, usual: flip ? verdict.b : verdict.a, better: verdict.better === 'tie' ? 'tie' : ((verdict.better === 'A') === flip ? 'fast' : 'usual'), why: verdict.why } : verdict;
    rows.push({ q, learner: user.display_name, eligible: dock.hardVoiceTurn({ message: q, page, mode: 'full', plan: null }) === null, usual, fast, verdict: v });
    console.log(`${k + 1}. ${q.slice(0, 40).padEnd(40)} fast-writer=${fast.writer}(${String(fast.slot || '').slice(0, 26)}) ${usual.ms}ms/${fast.ms}ms better=${v && v.better}`);
  }
  const elig = rows.filter((r) => r.eligible && r.fast.writer === 'fast' && r.verdict && r.verdict.fast);
  const avg = (list, who, k) => (list.reduce((n, r) => n + Number(r.verdict[who][k] || 0), 0) / Math.max(1, list.length)).toFixed(2);
  const sum = {
    questions: rows.length,
    routed_fast: rows.filter((r) => r.fast.writer === 'fast').length,
    hard_kept_usual: rows.filter((r) => !r.eligible && r.fast.writer === 'usual').length,
    hard_total: rows.filter((r) => !r.eligible).length,
    fast_written_by: [...new Set(elig.map((r) => r.fast.slot))],
    judged_pairs: elig.length,
    better: { fast: elig.filter((r) => r.verdict.better === 'fast').length, usual: elig.filter((r) => r.verdict.better === 'usual').length, tie: elig.filter((r) => r.verdict.better === 'tie').length },
    false_statements: { fast: elig.reduce((n, r) => n + (r.verdict.fast.false || []).length, 0), usual: elig.reduce((n, r) => n + (r.verdict.usual.false || []).length, 0) },
    held: { fast: elig.filter((r) => r.fast.held).length, usual: elig.filter((r) => r.usual.held).length },
    mean: Object.fromEntries(['correct', 'helpful', 'spoken', 'friendly'].map((k) => [k, { fast: avg(elig, 'fast', k), usual: avg(elig, 'usual', k) }])),
    worst_fast: elig.map((r) => ({ q: r.q, s: ['correct', 'helpful', 'spoken', 'friendly'].reduce((n, k) => n + Number(r.verdict.fast[k] || 0), 0) - ['correct', 'helpful', 'spoken', 'friendly'].reduce((n, k) => n + Number(r.verdict.usual[k] || 0), 0) })).sort((a, b) => a.s - b.s).slice(0, 3),
    ms_median: { usual: median(rows.map((r) => r.usual.ms)), fast: median(rows.map((r) => r.fast.ms)) },
  };
  console.log(JSON.stringify(sum, null, 1));
  if (arg('out', null)) fs.writeFileSync(arg('out'), JSON.stringify({ summary: sum, rows }, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
