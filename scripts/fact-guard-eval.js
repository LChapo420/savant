#!/usr/bin/env node
/**
 * Which model can run the live fact check (services/fact-guard.js, task fact_live), and what does it catch, cost and take? Live calls, paid providers
 * through their ledgers (RUN_CAP_USD default 5), NOT part of npm test. No learner data: every case is hand-written or comes from docs/fact-verifier-set.json.
 *
 *   node scripts/fact-guard-eval.js [--only a,b] [--sets tutor,layer,lesson] [--runs 1] [--out FILE]
 *
 * Sets (hand-planted or AI-planted errors with clean controls; a judge measured on them, not a real-learner result):
 *   tutor   short tutor replies, 26 with one error, 26 clean, each with the question it answers
 *   layer   personal layers over a short lesson, 12 with an added or wrong fact, 12 clean
 *   lesson  the 36 planted + 24 clean lesson blocks of docs/fact-verifier-set.json (real lesson text)
 * A planted case counts as caught when the check flags anything in it (a live hold works that way too); a clean case flagged is a false alarm.
 */
const fs = require('fs');
const path = require('path');

const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV }); } catch { /* rely on the environment */ } }
require('../services/run-cap').defaultCap(5);
const LIVE_DIR = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['CORAL', 'GONKA', 'GROKIFIED', 'LYCEUM', 'MUNITO', 'ZEROGPU']) {
  if (!process.env[`${n}_LEDGER_FILE`]) process.env[`${n}_LEDGER_FILE`] = `${LIVE_DIR}/${n.toLowerCase()}-ledger.json`;
  process.env[`${n}_PIPELINE`] = '1';
}

const guard = require('../services/fact-guard');

const CANDIDATES = {
  'zerogpu-glm-flash': { prov: () => require('../services/providers/zerogpu').zerogpu, model: 'z-ai/glm-5.3-flash' },
  'coral-deepseek-std': { prov: () => require('../services/providers/coral').coral, model: 'deepseek-v4.1-flash' },
  'coral-deepseek-fast': { prov: () => require('../services/providers/coral').coral, model: 'deepseek-v4.1-flash-fast' },
  'gonka-glm-flash': { prov: () => require('../services/providers/gonka').gonka, model: 'zai-org/GLM-5.3-Flash' },
  'gonka-deepseek-flash': { prov: () => require('../services/providers/gonka').gonka, model: 'deepseek-ai/DeepSeek-V4-Flash-0731' },
  'munito-glm-flash': { prov: () => require('../services/providers/munito').munito, model: 'zai-org/glm-5.3-flash' },
  'nvidia-glm-flash': { nvidia: 'z-ai/glm-5.3-flash' },
  'nvidia-nemotron-ultra': { nvidia: 'nvidia/nemotron-3-ultra-550b-a55b' },
  'nvidia-nemotron-lightning': { nvidia: 'nvidia/nemotron-3.5-lightning-30b-a3b' },
  'grokified-grok-4.3': { prov: () => require('../services/providers/grokified').grokified, model: 'grok-4.3' },
  'lyceum-kimi-k3.1-pro': { prov: () => require('../services/providers/lyceum').lyceum, model: 'moonshotai/kimi-k3.1-pro', maxTokens: 1500 },
};

// reference, reply, wrong? Hand-written. One error at most, of the kinds a tutor makes: arithmetic, a rule, a date, a definition, a false "that's right".
const TUTOR = [
  ['Solve 3x + 5 = 20.', 'Subtract 5 from both sides to get 3x = 15, then divide by 3, so x = 5.', 0],
  ['Solve 3x + 5 = 20.', 'Subtract 5 from both sides to get 3x = 15, then divide by 3, so x = 6.', 1],
  ['What is 15% of 80?', 'Ten percent of 80 is 8 and five percent is 4, so together that makes 12.', 0],
  ['What is 15% of 80?', 'Ten percent of 80 is 8 and five percent is half of that, 4, so together that makes 14.', 1],
  ['Simplify 2/4 + 1/4.', 'They share a denominator, so add the tops: 3/4.', 0],
  ['Simplify 2/4 + 1/4.', 'They share a denominator, so add the tops and the bottoms: 3/8.', 1],
  ['What is the slope of y = 2x + 7?', 'The number in front of x is the slope, so here it is 2, and 7 tells you where the line crosses the y-axis.', 0],
  ['What is the slope of y = 2x + 7?', 'The slope is the number on its own, so here it is 7, and 2 tells you where the line crosses the y-axis.', 1],
  ['Area of a circle radius 3.', 'Use pi times the radius squared, so pi times 9, about 28.3 square units.', 0],
  ['Area of a circle radius 3.', 'Use two times pi times the radius, so 6 pi, about 18.8 square units, which is the area.', 1],
  ['What does the mitochondrion do?', 'It releases energy from food by making ATP, the molecule the cell spends to do its work.', 0],
  ['What does the mitochondrion do?', 'It stores the cell\'s DNA and controls which genes are switched on, so it acts as the control centre of the cell.', 1],
  ['What gas do plants take in for photosynthesis?', 'They take in carbon dioxide through small pores and release oxygen as a by-product.', 0],
  ['What gas do plants take in for photosynthesis?', 'They take in oxygen through small pores and release carbon dioxide as the by-product of photosynthesis.', 1],
  ['Newton\'s second law.', 'Force equals mass times acceleration, so a heavier cart needs more force to speed up at the same rate.', 0],
  ['Newton\'s second law.', 'Force equals mass divided by acceleration, so a heavier cart needs less force to speed up at the same rate.', 1],
  ['When did World War II end?', 'It ended in 1945, with Germany surrendering in May and Japan in September.', 0],
  ['When did World War II end?', 'It ended in 1939, with Germany surrendering in May and Japan in September.', 1],
  ['Who wrote the Declaration of Independence?', 'Thomas Jefferson was its main author, working with a small committee in 1776.', 0],
  ['Who wrote the Declaration of Independence?', 'Abraham Lincoln was its main author, working with a small committee in 1776.', 1],
  ['Their vs there.', '"Their" shows that something belongs to them, as in "their coats", and "there" points to a place.', 0],
  ['Their vs there.', '"There" shows that something belongs to them, as in "there coats", and "their" points to a place.', 1],
  ['Past tense of "go".', 'It is irregular: the past tense is "went", so you would say "she went home".', 0],
  ['Past tense of "go".', 'It is a regular verb: the past tense is "goed", so you would say "she goed home".', 1],
  ['How do you say "I eat" in Spanish?', 'You say "yo como", because comer takes -o for yo in the present tense.', 0],
  ['How do you say "I eat" in Spanish?', 'You say "yo come", because comer takes -e for yo in the present tense.', 1],
  ['Ser or estar for "she is tired"?', 'Use estar, because being tired is a passing state: "ella está cansada".', 0],
  ['Ser or estar for "she is tired"?', 'Use ser, because being tired is a passing state: "ella es cansada".', 1],
  ['How does a bishop move in chess?', 'It moves any number of squares along a diagonal, so it always stays on one colour.', 0],
  ['How does a bishop move in chess?', 'It moves any number of squares along a rank or file, so it always stays on one colour.', 1],
  ['What is checkmate?', 'The king is attacked and has no legal way out: it cannot move, block or capture the attacker.', 0],
  ['What is checkmate?', 'The king has no legal move but is not under attack, and the game ends as a win for the other side.', 1],
  ['What is a noun?', 'A noun names a person, place, thing or idea, like "teacher" or "freedom".', 0],
  ['What is a noun?', 'A noun is a word that describes an action, like "run" or "think".', 1],
  ['Learner answered 12 for 3 x 4.', 'Yes, 3 times 4 is 12. Nice work. What would 3 times 5 be?', 0],
  ['Learner answered 14 for 3 x 4.', 'Yes, that is right, 3 times 4 is 14. Nice work. What would 3 times 5 be?', 1],
  ['Learner answered 7 for sqrt(49).', 'Right, 7 times 7 is 49, so the square root is 7.', 0],
  ['Learner answered 8 for sqrt(49).', 'Right, 8 times 8 is 49, so the square root is 8.', 1],
  ['Boiling point of water at sea level.', 'Water boils at 100 degrees Celsius at sea level, which is 212 degrees Fahrenheit.', 0],
  ['Boiling point of water at sea level.', 'Water boils at 100 degrees Celsius at sea level, which is 180 degrees Fahrenheit.', 1],
  ['What is a chord on a piano?', 'A chord is three or more notes played together. C major is C, E and G.', 0],
  ['What is a chord on a piano?', 'A chord is three or more notes played together. C major is C, E flat and G.', 1],
  ['Free throw in basketball.', 'A made free throw is worth one point and is taken from the line with nobody guarding you.', 0],
  ['Free throw in basketball.', 'A made free throw is worth two points and is taken from the line with nobody guarding you.', 1],
  ['Where do I start with fractions?', 'Start with what the bottom number means: how many equal parts the whole is cut into. What do you think 1/4 of a pizza looks like?', 0],
  ['How long should I study today?', 'Twenty minutes is plenty today. Let us do your two due reviews first, then one new part if you still feel fresh.', 0],
  ['Hi', 'Hi! Good to see you. Want to pick up where you left off, or is something on your mind?', 0],
  ['I keep failing this quiz.', 'That is frustrating, and it happens. Let us find the one step that keeps tripping you up. Which question felt hardest?', 0],
  ['Capital of Australia.', 'The capital is Canberra, even though Sydney is the largest city.', 0],
  ['Capital of Australia.', 'The capital is Sydney, which is also the largest city.', 1],
  ['DNA base pairing.', 'Adenine pairs with thymine and cytosine pairs with guanine.', 0],
  ['DNA base pairing.', 'Adenine pairs with guanine and cytosine pairs with thymine.', 1],
].map(([ref, text, bad], i) => ({ id: `t${i}`, planted: !!bad, pieces: [text], source: ref, mode: 'general' }));

const LESSON_A = 'The bishop moves any number of squares along a diagonal. It always stays on the colour it starts on. A bishop cannot jump over other pieces. Check: which squares can a bishop on c1 reach in one move?';
const LESSON_B = 'To add fractions with the same denominator, add the numerators and keep the denominator. 2/5 + 1/5 = 3/5. To add fractions with different denominators, first rewrite them with a common denominator. Check: what is 1/3 + 1/3?';
const LESSON_C = 'Plants make food by photosynthesis. They take in carbon dioxide and water, use light energy, and give off oxygen. Chlorophyll in the leaves absorbs the light. Check: which gas do plants give off?';
const LAYERS = [
  [LESSON_A, 'Imagine a point guard who can only ever pass on the diagonal. How far could that pass travel?', 0],
  [LESSON_A, 'Bishops are the piece most grandmasters trade last, because they win more endgames than knights do.', 1],
  [LESSON_A, 'Think of a bishop like a skateboarder locked to one set of painted lines: it can go as far as the line runs, but never crosses to the other colour.', 0],
  [LESSON_A, 'A bishop is worth exactly 3.25 pawns, which is like a star player being worth a bit more than three role players.', 1],
  [LESSON_A, 'You said you like building things, so this will help you see how a position fits together before you move.', 0],
  [LESSON_A, 'Like the Queen\'s Gambit, invented in the 1400s, a bishop controls the long diagonal from a1 to h8 from the very start of the game.', 1],
  [LESSON_B, 'Picture cutting one pizza into fifths for your team. If two people grab slices and then one more does, how much is gone?', 0],
  [LESSON_B, 'Fractions were invented by the ancient Greeks, which is why every chef still uses them to scale a recipe.', 1],
  [LESSON_B, 'Think of the denominator like the size of the slices in your recipe: you can only count slices together when they are the same size.', 0],
  [LESSON_B, 'Adding fractions works like adding yards in a game: you just add the tops and add the bottoms and you have the total.', 1],
  [LESSON_B, 'This matters to you because your baking is all about getting amounts right, and you want your recipes to come out.', 0],
  [LESSON_B, 'About 60 percent of students get this wrong at first, like a beginner baker who burns the first batch.', 1],
  [LESSON_C, 'Imagine your garden as a tiny kitchen running all day. What goes in, and what comes out?', 0],
  [LESSON_C, 'Plants do most of their photosynthesis at night, the way a night-shift crew gets the real work done.', 1],
  [LESSON_C, 'Think of chlorophyll like a solar panel on a roof: it catches the light that powers the rest of the job.', 0],
  [LESSON_C, 'Think of a leaf like a factory that breathes in oxygen and breathes out carbon dioxide all day.', 1],
  [LESSON_C, 'You care about your vegetable patch, so knowing what it needs will help you see why it does or does not grow.', 0],
  [LESSON_C, 'The Amazon rainforest makes 20 percent of the world\'s oxygen, like a giant version of your backyard garden.', 1],
  [LESSON_A, 'What if the only way your striker could score was by running corner to corner across the pitch?', 0],
  [LESSON_B, 'Like splitting a bill between friends: when everybody\'s share is counted in fifths, you just count how many fifths you have.', 0],
  [LESSON_C, 'Picture the sun as the person paying the electricity bill for your whole garden.', 0],
  [LESSON_A, 'Bishops were called elephants in the original Indian game, which is like how your favourite team once had another name.', 1],
  [LESSON_B, 'Like a guitar neck, where frets are placed at exactly one twelfth of the string, a denominator tells you the equal parts.', 1],
  [LESSON_C, 'Picture a greenhouse crew: chlorophyll, which is made of iron, is the worker who catches the light.', 1],
].map(([lesson, text, bad], i) => ({ id: `l${i}`, planted: !!bad, pieces: [text], source: lesson, mode: 'overlay' }));

function lessonSet() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'fact-verifier-set.json'), 'utf8'));
  return d.fact.map((c) => ({ id: c.id, planted: !!c.planted, pieces: [JSON.stringify(c.data)], source: c.context, mode: 'general' }));
}

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
  return { only: get('only', Object.keys(CANDIDATES).join(',')).split(','), sets: get('sets', 'tutor,layer').split(','), runs: Number(get('runs', 1)), out: get('out', null), conc: Number(get('conc', 4)) };
}

async function one(cand, c) {
  const req = { role: 'fast', task: 'fact_live', system: guard.SYSTEMS[c.mode], user: guard.checkUser({ pieces: c.pieces, source: c.source, mode: c.mode }), schema: guard.SCHEMA, schemaName: 'submit_check', maxTokens: cand.maxTokens || 510, effort: 'off' };
  const t0 = Date.now();
  try {
    let r;
    if (cand.nvidia) r = await require('../services/providers/nvidia').structured({ ...req, models: [{ model: cand.nvidia, effort: 'off' }], attempts: 1, timeoutMs: 30000 });
    else r = await cand.prov().structured({ ...req, model: cand.model, timeoutMs: 45000 });
    const ok = r && r.data && Array.isArray(r.data.wrong);
    return { id: c.id, planted: c.planted, ok: !!ok, flagged: ok ? r.data.wrong.length > 0 : null, ms: Date.now() - t0, usage: (r && r.usage) || null, why: ok ? r.data.wrong.map((w) => w.why).join('; ').slice(0, 160) : '' };
  } catch (err) {
    return { id: c.id, planted: c.planted, ok: false, flagged: null, ms: Date.now() - t0, error: String(err.message || err).slice(0, 100) };
  }
}

const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

async function main() {
  const o = args();
  const sets = { tutor: TUTOR, layer: LAYERS, lesson: o.sets.includes('lesson') ? lessonSet() : [] };
  const out = { at: new Date().toISOString(), rows: [], cases: {} };
  for (const name of o.only) {
    const cand = CANDIDATES[name];
    if (!cand) continue;
    for (const setName of o.sets) {
      const cases = [];
      for (let k = 0; k < o.runs; k += 1) cases.push(...sets[setName]);
      const res = [];
      let next = 0;
      await Promise.all(Array.from({ length: o.conc }, async () => {
        while (next < cases.length) { const c = cases[next++]; res.push(await one(cand, c)); } // eslint-disable-line no-await-in-loop
      }));
      const answered = res.filter((r) => r.ok);
      const planted = answered.filter((r) => r.planted); const clean = answered.filter((r) => !r.planted);
      const caught = planted.filter((r) => r.flagged).length; const alarms = clean.filter((r) => r.flagged).length;
      const inTok = answered.reduce((n, r) => n + ((r.usage && (r.usage.input_tokens || r.usage.prompt_tokens)) || 0), 0);
      const outTok = answered.reduce((n, r) => n + ((r.usage && (r.usage.output_tokens || r.usage.completion_tokens)) || 0), 0);
      const row = { model: name, set: setName, cases: cases.length, answered: answered.length, caught, planted: planted.length, alarms, clean: clean.length, p50: pct(answered.map((r) => r.ms), 0.5), p95: pct(answered.map((r) => r.ms), 0.95), in_per_call: answered.length ? Math.round(inTok / answered.length) : 0, out_per_call: answered.length ? Math.round(outTok / answered.length) : 0 };
      out.rows.push(row);
      out.cases[`${name}/${setName}`] = res.map((r) => ({ id: r.id, p: r.planted, f: r.flagged, ms: r.ms, why: r.why, e: r.error }));
      console.log(`${name.padEnd(28)} ${setName.padEnd(7)} answered ${row.answered}/${row.cases}  caught ${caught}/${planted.length}  false alarms ${alarms}/${clean.length}  p50 ${row.p50} ms  p95 ${row.p95} ms  tokens ${row.in_per_call}/${row.out_per_call}`);
      if (o.out) fs.writeFileSync(o.out, JSON.stringify(out));
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
