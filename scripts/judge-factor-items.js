#!/usr/bin/env node
/**
 * Blind check of the 22 factor self-ratings (content/onboarding/factor-items.json; services/onboarding/pool.js fq:*), written by hand on
 * 3 Nov 2026. Two free judges of different families (NVIDIA Nemotron Ultra, and MiniMax M3.1 Flash through xKiro, pipeline only: item text
 * only, never a learner) each answer two questions per pair, never told which answer the writer meant:
 *   pole    shown the factor's description and the two statements in a shuffled order: which one is the HIGH end?
 *   family  shown only the HIGH statement and the 11 factors (g and the 10 scorecard categories): which factor does it describe?
 * A pair passes when both judges pick the writer's high statement, and at least one judge names the writer's factor (g, intake and reasoning
 * count as one cognitive family for this, since the posterior loads them together). Writes curriculum-build/onboarding-sim/factor-judge.json.
 *
 *   node scripts/judge-factor-items.js            (needs NVIDIA_API_KEY and XKIRO_API_KEY in .env; costs nothing)
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });

process.env.XKIRO_PIPELINE = '1';
const nvidia = require('../services/providers/nvidia');
const { xkiro } = require('../services/providers/xkiro');
const { STATS } = require('../services/scorecard/stats');

const FILE = path.join(__dirname, '..', 'content', 'onboarding', 'factor-items.json');
const OUT = path.join(__dirname, '..', 'curriculum-build', 'onboarding-sim', 'factor-judge.json');
const items = JSON.parse(fs.readFileSync(FILE, 'utf8')).items;

const byCat = {};
for (const s of STATS) (byCat[s.category] = byCat[s.category] || []).push(s.name);
const FACTORS = { g: 'General learning ability: how quickly and well someone learns new material overall' };
for (const [c, names] of Object.entries(byCat)) FACTORS[c] = `${c[0].toUpperCase()}${c.slice(1)}: ${names.slice(0, 6).join(', ')}`;
const FAMILY = (f) => (['g', 'intake', 'reasoning'].includes(f) ? 'cognitive' : f);

const pairs = [];
for (const [factor, list] of Object.entries(items)) list.forEach((p, i) => pairs.push({ id: `${factor}:${'ab'[i]}`, factor, ...p, flip: (pairs.length * 7 + 3) % 2 === 1 }));

const SYSTEM = 'You check short self-rating statements for a learning questionnaire. Judge only from the text given. Answer in the JSON asked for.';
const POLE_SCHEMA = { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, high: { type: 'string', enum: ['A', 'B', 'neither'] } }, required: ['index', 'high'] } } }, required: ['answers'] };
const FAM_SCHEMA = { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, factor: { type: 'string', enum: Object.keys(FACTORS) } }, required: ['index', 'factor'] } } }, required: ['answers'] };

const poleUser = () => `${pairs.map((p, i) => `Item ${i}. Factor: ${FACTORS[p.factor]}\n  A: ${p.flip ? p.low : p.high}\n  B: ${p.flip ? p.high : p.low}`).join('\n\n')}\n\nFor each item: which statement describes someone HIGH on that factor? Answer "neither" if they do not clearly differ on it.`;
const famUser = () => `Factors:\n${Object.entries(FACTORS).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n\n${pairs.map((p, i) => `Statement ${i}: "${p.high}"`).join('\n')}\n\nFor each statement, which ONE factor does it mainly describe? Give the factor's key.`;

const judges = {
  nemotron: (user, schema) => nvidia.structured({ role: 'check', system: SYSTEM, user, schema, schemaName: 'submit', maxTokens: 4000, models: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], timeoutMs: 180000, attempts: 3 }),
  minimax: (user, schema) => xkiro.structured({ system: SYSTEM, user, schema, schemaName: 'submit', maxTokens: 8000, models: ['minimax/minimax-m3.1-flash'], timeoutMs: 240000, reasoningEffort: 'medium' }),
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function ask(name, user, schema) {
  for (let t = 0; t < 6; t++) {
    try {
      const r = await judges[name](user, schema);
      const by = new Map(((r && r.data && r.data.answers) || []).map((a) => [a.index, a]));
      if (by.size >= pairs.length * 0.9) return by;
    } catch (err) { console.warn(`${name}: ${err.message}`); }
    await sleep(15000 * (t + 1));
  }
  return new Map();
}

(async () => {
  const res = {};
  for (const name of Object.keys(judges)) {
    res[name] = { pole: await ask(name, poleUser(), POLE_SCHEMA), family: await ask(name, famUser(), FAM_SCHEMA) };
    console.log(`${name}: ${res[name].pole.size} pole, ${res[name].family.size} family answers`);
  }
  const rows = pairs.map((p, i) => {
    const want = p.flip ? 'B' : 'A';
    const r = { id: p.id, factor: p.factor, high: p.high, low: p.low };
    for (const name of Object.keys(judges)) {
      const pole = res[name].pole.get(i);
      const fam = res[name].family.get(i);
      r[`${name}_pole_ok`] = pole ? pole.high === want : null;
      r[`${name}_factor`] = fam ? fam.factor : null;
      r[`${name}_factor_ok`] = fam ? fam.factor === p.factor : null;
      r[`${name}_family_ok`] = fam ? FAMILY(fam.factor) === FAMILY(p.factor) : null;
    }
    const names = Object.keys(judges);
    r.pass = names.every((n) => r[`${n}_pole_ok`] === true) && names.some((n) => r[`${n}_family_ok`] === true);
    return r;
  });
  const count = (f) => rows.filter((r) => r[f] === true).length;
  const summary = {
    pairs: rows.length, passed: rows.filter((r) => r.pass).length,
    pole_ok: Object.fromEntries(Object.keys(judges).map((n) => [n, count(`${n}_pole_ok`)])),
    exact_factor: Object.fromEntries(Object.keys(judges).map((n) => [n, count(`${n}_factor_ok`)])),
    family_factor: Object.fromEntries(Object.keys(judges).map((n) => [n, count(`${n}_family_ok`)])),
    failed: rows.filter((r) => !r.pass).map((r) => r.id),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify({ at: new Date().toISOString(), judges: { nemotron: 'nvidia/nemotron-3-ultra-550b-a55b', minimax: 'minimax/minimax-m3.1-flash (xKiro)' }, factors: FACTORS, summary, rows }, null, 1)}\n`);
  console.log(JSON.stringify(summary, null, 1));
  process.exit(0);
})();
