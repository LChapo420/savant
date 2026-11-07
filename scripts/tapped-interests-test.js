/**
 * A tapped interest is a choice from a list, not a short answer (services/onboarding/tasks.js, public/js/start.js).
 *
 * The survey question scores by word count on three measures (relevance demand, interest transfer, curiosity hook). A tap on "Soccer, Music" used to count as
 * two words, and so pulled all three down, for a reason that says nothing about the learner. This holds:
 *   1. a tapped answer reads nothing: the whole first picture is the same as if the question had been skipped, on every measure, on the model and on the card;
 *   2. how many tiles were tapped makes no difference;
 *   3. nothing else changed: typed answers (the box on /baseline, "Something else" on the tile screen) score exactly as before, other survey questions ignore the flag.
 *
 * Learners: scripted answers on the service itself, in a temporary store. Extreme, contradictory and randomly generated, with held-out seeds, reported per learner
 * (worst 1%, 5%, 10%). Simulated, not real people: this shows the score no longer moves on a tap. It says nothing about what those three measures truly are for anyone.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(name)) process.env[name] = '';
process.env.OLLAMA_ENABLED = '0';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tapped-interests-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* gone */ } });

const db = require('../config/db');
const baseline = require('../services/onboarding');
const model = require('../services/onboarding/model');
const tasks = require('../services/onboarding/tasks');
const scorecard = require('../services/scorecard');
const { STAT_IDS } = require('../services/onboarding/plan');
const { byId } = require('../services/onboarding/pool');

const THREE = ['relevance_demand', 'interest_transfer', 'curiosity_hook'];
let passed = 0;
const ok = (name) => { passed += 1; console.log(`ok   ${name}`); };

const person = () => db.insert('users', { email: null, display_name: 'sim', age_check: { country: 'US', needs_parent: false, under_13: false, birth_ym: '1990-01' } });
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 1000; return h / 1000; };

/** How a scripted learner answers everything but the interests question. `seed` 1 and 0 are the two tails; 'mix' answers high and low in turn, a contradictory learner. */
function respond(step, seed, i) {
  const high = seed === 'mix' ? i % 2 === 0 : seed === 1 || (seed !== 0 && hash(step.id + seed) < 0.5);
  const n = seed === 'mix' ? 0.5 : seed;
  if (step.kind === 'forced') return { choice: high ? 'high' : 'low' };
  if (step.kind === 'span') return { maxSpan: seed === 1 ? 9 : seed === 0 ? 3 : 4 + Math.round(hash(n) * 4) };
  if (step.kind === 'speed') return { correct: seed === 1 ? 30 : seed === 0 ? 3 : 8 + Math.round(hash(n) * 16), wrong: seed === 0 ? 8 : 1, firstMs: 1500 + hash(n) * 3000 };
  return {};
}

const SENTENCE = 'I like soccer and I play on a team at school, and I also really enjoy making music with my friends after class, and I keep up with how space missions work.';
const STYLES = {
  tapOne: { response: { text: 'Soccer', tapped: true, typed: '' } },
  tapFive: { response: { text: 'Soccer, Music, Space, Cars, Cooking', tapped: true, typed: '' } },
  tapAll: { response: { text: 'Soccer, Basketball, Music, Video games, Cooking, Drawing and art, Animals, Space, Movies and TV, Cars, Fashion, Coding', tapped: true, typed: '' } },
  skipped: { skip: true },
  asShortText: { response: { text: 'Soccer, Music' } }, // how a tap was read before this fix, and how those words typed are still read
  longTyped: { response: { text: SENTENCE } },
};

/** One whole Quick test, the way /start runs it: interests held to the end. */
function takeTest(seed, style) {
  const user = person();
  let out = baseline.start(user, 'quick', { interests_last: true });
  let i = 0;
  while (!out.done) {
    const id = out.step.id;
    const session = baseline.get(user.id).active.id;
    const ms = byId[id].sec * 1000;
    out = baseline.answer(user, id === 'sv:interests' ? { session, id, ms, ...style } : { session, id, ms, response: respond(out.step, seed, i) });
    assert.ok(out.done || out.step, `the next step: ${JSON.stringify(out).slice(0, 200)}`);
    i += 1;
  }
  const card = scorecard.get(user.id).stats;
  return {
    est: model.estimates(baseline.get(user.id).known.state, STAT_IDS),
    card: Object.fromEntries(STAT_IDS.map((s) => [s, { s: card[s].s, m: card[s].m, w: card[s].w, n: card[s].n }])),
  };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ── 3. the scoring of everything else, checked first against a copy of the rule as it stood ─────────────────────────
{
  const z = (x, mu, sd) => Math.max(-3, Math.min(3, (x - mu) / sd));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rule = (len) => clamp(len === 0 ? -0.6 : z(len, 12, 14), -1, 1.5) * 0.7;
  const survey = Object.values(byId).filter((it) => it.kind === 'survey');
  assert.ok(survey.length >= 6, 'the survey items are there');
  for (const item of survey) {
    for (let len = 0; len <= 60; len += 1) {
      const text = Array.from({ length: len }, () => 'word').join(' ');
      const want = Object.fromEntries(item.informs.map((i) => [i.stat, rule(len)]));
      assert.deepStrictEqual(tasks.score(item, { text }, {}), want, `${item.id}, ${len} typed words`);
      if (item.survey !== 'interests') assert.deepStrictEqual(tasks.score(item, { text, tapped: true, typed: '' }, {}), want, `${item.id} ignores the tap flag`);
    }
  }
  ok(`typed answers score exactly as before: ${survey.length} survey questions, 0 to 60 words, and only the interests question knows about taps`);

  const item = byId['sv:interests'];
  assert.deepStrictEqual(tasks.score(item, { text: 'Soccer, Music', tapped: true, typed: '' }, {}), {}, 'taps alone read nothing');
  assert.deepStrictEqual(tasks.score(item, { text: 'Soccer, Music', tapped: true }, {}), {}, 'no typed field at all reads nothing');
  assert.deepStrictEqual(tasks.score(item, { text: 'Soccer, Music', tapped: true, typed: '   ' }, {}), {}, 'spaces are not words');
  assert.deepStrictEqual(tasks.score(item, { text: 'Soccer, Rock climbing', tapped: true, typed: 'Rock climbing' }, {}), tasks.score(item, { text: 'Rock climbing' }, {}), 'typed words beside a tap are read as those words, by the same rule');
  assert.deepStrictEqual(tasks.score(item, { text: 'Rock climbing', tapped: 'yes' }, {}), tasks.score(item, { text: 'Rock climbing' }, {}), 'only a true flag counts');
  ok('on the interests question: taps read nothing, words typed beside them read as typed');
}

// ── 1 and 2. the first picture ───────────────────────────────────────────────────────────────────────────────────
{
  const dev = [1, 0, 'mix', 0.11, 0.23, 0.37, 0.53, 0.71, 0.97, 0.05]; // the tails, a contradictory learner, then mixed
  const r = rng(20261107);
  const heldOut = Array.from({ length: 30 }, () => Math.round(r() * 1e6) / 1e6); // generated, not looked at while building this
  const seeds = [...dev, ...heldOut];
  const shiftOld = Object.fromEntries(THREE.map((s) => [s, []]));
  const shiftNew = Object.fromEntries(THREE.map((s) => [s, []]));
  const shiftLong = Object.fromEntries(THREE.map((s) => [s, []]));
  let worstAny = 0; let worstP = 0; let worstCard = 0; let worstTiles = 0; let cardMoved = 0;
  for (const seed of seeds) {
    const skipped = takeTest(seed, STYLES.skipped);
    const five = takeTest(seed, STYLES.tapFive);
    const one = takeTest(seed, STYLES.tapOne);
    const all = takeTest(seed, STYLES.tapAll);
    const old = takeTest(seed, STYLES.asShortText);
    const long = takeTest(seed, STYLES.longTyped);
    for (const id of STAT_IDS) {
      worstAny = Math.max(worstAny, Math.abs(five.est[id].value - skipped.est[id].value), Math.abs(five.est[id].dataValue - skipped.est[id].dataValue));
      worstP = Math.max(worstP, Math.abs(five.est[id].P - skipped.est[id].P));
      worstCard = Math.max(worstCard, ...['s', 'm', 'w', 'n'].map((f) => Math.abs(five.card[id][f] - skipped.card[id][f])));
      worstTiles = Math.max(worstTiles, Math.abs(one.est[id].value - five.est[id].value), Math.abs(all.est[id].value - five.est[id].value));
    }
    for (const s of THREE) {
      cardMoved = Math.max(cardMoved, Math.abs(old.card[s].s - skipped.card[s].s));
      shiftOld[s].push(old.est[s].value - skipped.est[s].value);
      shiftNew[s].push(five.est[s].value - skipped.est[s].value);
      shiftLong[s].push(long.est[s].value - skipped.est[s].value);
    }
  }
  console.log(`first picture, ${seeds.length} scripted learners (${dev.length} tails, contradictory and mixed, ${heldOut.length} generated and held out), ${STAT_IDS.length} measures, 0-100 scale; shift against the same learner skipping the question:`);
  for (const s of THREE) {
    const o = [...shiftOld[s]].sort((a, b) => a - b);
    const n = [...shiftNew[s]].map(Math.abs).sort((a, b) => a - b);
    console.log(`  ${s.padEnd(18)} a tap read as two words (before): mean ${mean(o).toFixed(2)}, worst 1% ${pct(o, 0.01).toFixed(2)}, 5% ${pct(o, 0.05).toFixed(2)}, 10% ${pct(o, 0.1).toFixed(2)} | a tap now: mean ${mean(shiftNew[s]).toFixed(2)}, worst ${n[n.length - 1].toFixed(2)} | a long typed sentence (unchanged): mean +${mean(shiftLong[s]).toFixed(2)}`);
    assert.ok(mean(o) < -0.5, `the skew this removes was real on ${s}`);
    assert.ok(n[n.length - 1] < 1e-9, `a tap does not move ${s}`);
    assert.ok(mean(shiftLong[s]) > 0.5, `a long typed sentence still reads higher on ${s}`);
  }
  console.log(`  all measures, tapping against skipping: worst value or reading ${worstAny.toFixed(6)}, worst precision ${worstP.toFixed(6)}, worst on the card ${worstCard.toFixed(6)} (a tap read as words moved the card by up to ${cardMoved.toFixed(2)}, so this comparison can see a change); 1 vs 5 vs 12 tiles: worst ${worstTiles.toFixed(6)}`);
  assert.ok(worstAny < 1e-9, 'a tap reads nothing on any measure');
  assert.ok(worstP < 1e-9, 'and adds no false confidence');
  assert.ok(cardMoved > 0, 'the card comparison can see a change');
  assert.ok(worstCard < 1e-9, 'and the card is the same');
  assert.ok(worstTiles < 1e-9, 'however many tiles');
  ok('a tap leaves the first picture as if the question had been skipped, on every measure, for every learner');
  ok('the number of tiles makes no difference');
}

// ── the page sends the flag, and only typed words as typed ──────────────────────────────────────────────────────────
{
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'start.js'), 'utf8');
  assert.ok(/id: 'sv:interests', response: \{ text: words, tapped: true, typed \}/.test(page), 'the interests screen says it was tapped');
  assert.ok(/const typed = S\.a\.interests\.includes\('other'\) && !isChild\(\) \? S\.a\.interest_text\.trim\(\) : ''/.test(page), 'only "Something else" counts as typed, and never for a child');
  const old = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'baseline.js'), 'utf8');
  assert.ok(!/tapped/.test(old), '/baseline is a typed box and does not send it');
  ok('the tile screen sends the flag; /baseline does not');
}

console.log(`\n${passed} passed.`);
if (db.flush) db.flush();
process.exit(0);
