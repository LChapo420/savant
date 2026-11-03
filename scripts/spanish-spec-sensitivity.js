#!/usr/bin/env node
/**
 * Does the Spanish path really change with the learner's scorecard? AI-judged, one level per measure group, with a planted swap.
 *
 *   node scripts/spanish-spec-sensitivity.js --mock     offline: the judge is a deterministic stand-in (part of the harness check)
 *   node scripts/spanish-spec-sensitivity.js --live     real judges: Nemotron Ultra (NVIDIA free) first, then Modelflare Sol; writes
 *                                                       the numbers to curriculum-build/spanish-depth/sensitivity.json
 *
 * For each of the scorecard's ten measure groups (intake, reasoning, pacing, engagement, memory, resilience, metacognition,
 * representation, motivation, transfer) plus the learner's context (interests and dislikes), two synthetic learners differ ONLY in
 * that group: X has every measure of it high (92), Y has every measure low (8), both with confidence 90. The same Spanish level
 * (a vocabulary lesson and a role-play of Unit 4.1) is built for X and for Y by the player's own code (services/spanish/path.js
 * buildLevel with the learner's spec). A judge is shown a plain-words profile of the learner and the two levels in a hashed order,
 * and says which was built for that learner. The PLANTED SWAP then shows the same two levels with the OTHER learner's profile: a
 * real difference flips the answer, a judge that always says "level 1" does not. A group counts as visible only when the judge is
 * right both ways. Plain code also reports whether the two levels differ at all, so no claim rests on a model alone.
 *
 * Synthetic learners only: no real learner's data is sent anywhere. Money: the free judge first; Sol (Modelflare, its own key limit)
 * is the second judge. Standard Compute $0, Anthropic $0.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
const live = process.argv.includes('--live');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'es-sens-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.SPANISH_UNIT_DIR = path.join(TMP, 'units');

const learningSpec = require('../services/learning-spec');
const { STATS } = require('../services/scorecard/stats');
const esPath = require('../services/spanish/path');
const curriculum = require('../config/curriculum');

const G = 'spanish_grade_04_time_food_shopping_and_core_verbs';
const grade = curriculum.getGrade('spanish', G);
const LESSON = grade.levels.find((l) => l.unit === 'Unit 4.1' && l.type === 'Lesson').level;
const CONVO = grade.levels.find((l) => l.unit === 'Unit 4.1' && l.activity === 'Conversation Lab').level;

function spec(measures, ctx = {}) {
  const g = learningSpec.gather(0, { trackId: 'spanish', topic: 'x' });
  g.hasScorecard = true; g.metrics = {};
  for (const [k, v] of Object.entries(measures)) g.metrics[k] = { measured: v, confidence: 90 };
  return learningSpec.buildSpecFrom(Object.assign(g, ctx));
}
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

const GROUPS = [...new Set(STATS.map((s) => s.category))].map((cat) => {
  const stats = STATS.filter((s) => s.category === cat);
  const mk = (v) => Object.fromEntries(stats.map((s) => [s.id, v]));
  return { id: cat, X: spec(mk(92)), Y: spec(mk(8)), profileX: stats.map((s) => `${s.name}: ${s.high}`).join('; '), profileY: stats.map((s) => `${s.name}: ${s.low}`).join('; ') };
});
GROUPS.push({
  id: 'context (interests and dislikes)',
  X: spec({}, { interests: ['basketball', 'anime'], dislikes: ['cooking'] }), Y: spec({}, { interests: ['cooking', 'gardening'], dislikes: ['basketball'] }),
  profileX: 'Loves basketball and anime; dislikes cooking.', profileY: 'Loves cooking and gardening; dislikes basketball.',
});

/** What a level is, in plain words and numbers, for the judge and for the code check. */
function describe(spc) {
  const lesson = esPath.buildLevel({ userId: 1, gradeId: G, level: LESSON, seed: 'sens', spec: spc });
  const convo = esPath.buildLevel({ userId: 1, gradeId: G, level: CONVO, seed: 'sens', spec: spc });
  const kinds = lesson.items.map((i) => i.kind);
  const tally = {}; for (const k of kinds) tally[k] = (tally[k] || 0) + 1;
  const topics = convo.scenario.topics || { like: [], avoid: [] };
  return {
    text: [`Vocabulary lesson, ${lesson.items.length} steps in this order: ${kinds.join(', ')}.`,
      `New words introduced first: ${(lesson.introduces || []).slice(0, 5).map((id) => (esPath.PHRASES.get(id) || {}).es).join(' | ')}.`,
      `Role-play partner small-talk topics: ${topics.like.length ? topics.like.join(', ') : '(none)'}; never mentioned: ${topics.avoid.length ? topics.avoid.join(', ') : '(none)'}.`].join('\n'),
    key: JSON.stringify([kinds, lesson.introduces, topics]),
  };
}

const SYSTEM = 'You are checking whether a language-learning app adapts to a learner. You are told what a learner is like and shown two versions of the same Spanish lesson. Say which version was built for that learner, from the differences you can see. Answer with the number 1 or 2 only in "pick", and one sentence of reason.';
const SCHEMA = { type: 'object', properties: { pick: { type: 'integer' }, reason: { type: 'string' } }, required: ['pick', 'reason'] };
const askText = (profile, a, b) => `LEARNER: ${profile}\n\nVERSION 1:\n${a.text}\n\nVERSION 2:\n${b.text}\n\nWhich version was built for this learner? Reply as JSON {"pick": 1 or 2, "reason": "..."}.`;

async function nemotron(user) {
  require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
  const nvidia = require('../services/providers/nvidia');
  const out = await nvidia.structured({ role: 'check', system: SYSTEM, user, schema: SCHEMA, schemaName: 'pick', maxTokens: 800, models: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], timeoutMs: 150000, attempts: 2 });
  return out.data;
}
// The Gemini key's free tier: a judge of a third family (Google) while Sol's key is refused.
async function geminiJudge(user) {
  require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
  const gemini = require('../services/providers/gemini');
  const out = await gemini.structured({ role: 'fast', system: SYSTEM, user, schema: SCHEMA, schemaName: 'pick', maxTokens: 800 });
  return out.data;
}
async function sol(user) {
  const key = require('dotenv').parse(fs.readFileSync('C:/coding/claudecommittdIq/folderThing/.env')).MODELFLARE_LUNA_API_KEY;
  if (!key) throw new Error('no Modelflare key');
  const r = await fetch(`${(process.env.MODELFLARE_BASE_URL || 'https://modelflare.dev/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(180000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-6.1-sol', temperature: 0, max_tokens: 800, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
  });
  if (r.status !== 200) throw new Error(`modelflare ${r.status}`);
  const j = await r.json();
  const text = (((j.choices || [])[0] || {}).message || {}).content || '';
  const m = /"pick"\s*:\s*([12])/.exec(text) || /\b([12])\b/.exec(text);
  if (!m) throw new Error('no pick');
  return { pick: Number(m[1]), reason: text.slice(0, 160) };
}
// The mock judge looks at the described steps only: it picks the version with more steps of the kind the profile asks for (game / dialogue words).
async function mock(user) {
  const [, a, b] = /VERSION 1:\n([\s\S]*?)\n\nVERSION 2:\n([\s\S]*?)\n\nWhich/.exec(user);
  const score = (t) => (t.match(/match_pairs|tap_heard|complete_chat|read_respond/g) || []).length + (/basketball/.test(t) ? 3 : 0);
  const wantsMore = /outside reasons|Loves basketball|nee?ds? constant|variety|changes|bored|rewards strongly|competition/i.test(user.split('VERSION 1')[0]);
  const sa = score(a); const sb = score(b);
  return { pick: (wantsMore ? sa >= sb : sa <= sb) ? 1 : 2, reason: 'mock' };
}

async function judge(name, fn, g, dX, dY) {
  const orders = [[dX, dY, 1], [dY, dX, 2]];            // the hash decides which version sits first
  const flip = hash(`${g.id}|order`) % 2 === 1;
  const [first, second] = flip ? [dY, dX] : [dX, dY];
  const profileFor = (which) => (which === 'X' ? g.profileX : g.profileY);
  const run = async (profile, wantsX) => {
    const r = await fn(askText(profile, first, second));
    const pickedFirst = r.pick === 1;
    const picked = pickedFirst === !flip ? 'X' : 'Y';   // which learner's version the judge chose
    return { correct: picked === (wantsX ? 'X' : 'Y'), picked, reason: r.reason };
  };
  void orders;
  const a = await run(profileFor('X'), true);
  const swap = await run(profileFor('Y'), false);       // the planted swap: the other learner's profile must flip the answer
  return { judge: name, correct: a.correct, swapCorrect: swap.correct, visible: a.correct && swap.correct, reason: a.reason };
}

(async () => {
  const judges = live ? [['nemotron-ultra (NVIDIA free)', nemotron], ['gemini flash (free tier)', geminiJudge], ['gpt-6.1-sol (Modelflare)', sol]] : [['mock', mock]];
  const rows = [];
  for (const g of GROUPS) {
    const dX = describe(g.X); const dY = describe(g.Y);
    const row = { group: g.id, codeDiffers: dX.key !== dY.key, judges: [] };
    if (row.codeDiffers) {
      for (const [name, fn] of judges) {
        try { row.judges.push(await judge(name, fn, g, dX, dY)); } catch (e) { row.judges.push({ judge: name, error: String(e.message).slice(0, 80) }); } // eslint-disable-line no-await-in-loop
      }
    }
    rows.push(row);
    console.log(`${g.id}: levels ${row.codeDiffers ? 'DIFFER' : 'identical'}${row.judges.map((j) => ` | ${j.judge}: ${j.error ? `error ${j.error}` : `${j.visible ? 'visible' : 'not seen'} (right ${j.correct ? 'yes' : 'no'}, swap ${j.swapCorrect ? 'yes' : 'no'})`}`).join('')}`);
  }
  const differs = rows.filter((r) => r.codeDiffers).length;
  const summary = { when: new Date().toISOString(), mode: live ? 'live' : 'mock', groups: rows.length, groupsWhereLevelDiffers: differs, byJudge: {} };
  for (const [name] of judges) {
    const js = rows.flatMap((r) => r.judges).filter((j) => j.judge === name && !j.error);
    summary.byJudge[name] = { judged: js.length, visibleBothWays: js.filter((j) => j.visible).length, rightUnswapped: js.filter((j) => j.correct).length, rightSwapped: js.filter((j) => j.swapCorrect).length };
  }
  console.log(JSON.stringify(summary));
  if (live) {
    const dir = path.join(__dirname, '..', 'curriculum-build', 'spanish-depth');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sensitivity.json'), JSON.stringify({ summary, rows }, null, 1));
  }
  if (!live) {
    const ok = differs >= 3 && rows.find((r) => /engagement/.test(r.group)).codeDiffers && rows.find((r) => /context/.test(r.group)).codeDiffers;
    console.log(ok ? 'harness ok' : 'FAIL: the levels do not differ where they must');
    process.exit(ok ? 0 : 1);
  }
})().catch((e) => { console.log(e.stack); process.exit(1); });
