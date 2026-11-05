/**
 * Proof for interest theming of bank items (services/item-theme.js). SIMULATED learners (an interest label each) and
 * AI-judged results, not real-learner evidence. Free models only (pipeline data class: curriculum text + topic words).
 *
 *   node scripts/item-theme-proof.js [--items=40] [--out=docs/ITEM-THEME-PROOF.json]
 *
 * Per (item, interest) the writer's stem goes through the gates. Reported: how many stems pass each stage, key
 * agreement of the accepted stems by a second, different blind solver (and that solver's own floor on the untouched
 * base items), and engagement-fit before/after from a simulated learner persona judged by an AI judge (1-5).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_FILE = process.env.DB_FILE || path.join(os.tmpdir(), 'theme-proof-db.json');
if (!fs.existsSync(process.env.DB_FILE)) fs.writeFileSync(process.env.DB_FILE, '{}');
const env = require('C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/node_modules/dotenv').parse(fs.readFileSync('C:/coding/claudecommittdIq/folderThing/.env'));
for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
process.env.XKIRO_PIPELINE = '1';
process.env.GONKA_PIPELINE = '1';
process.env.LYCEUM_PIPELINE = '1';
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
process.env.ANTHROPIC_LEDGER_FILE = LIVE + 'anthropic-ledger.json';
process.env.STANDARD_COMPUTE_LEDGER_FILE = LIVE + 'standard-compute-ledger.json';
process.env.GONKA_LEDGER_FILE = LIVE + 'gonka-ledger.json';
process.env.LYCEUM_LEDGER_FILE = LIVE + 'lyceum-ledger.json';

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const N = Number(arg('items', 40));
const OUT = arg('out', path.join(__dirname, '..', 'docs', 'ITEM-THEME-PROOF.json'));
const bank = require('../content/bank');
const ai = require('../services/ai');
const it = require('../services/item-theme');
const nvidia = require('../services/providers/nvidia');

const INTERESTS = ['basketball', 'cooking', 'minecraft', 'soccer', 'music', 'animals'];
// The tracks theming serves by default (services/item-theme.js THEME_TRACKS): math and IQ.
const curriculum = require('../config/curriculum');
const inTracks = new Set();
for (const t of Object.values(curriculum.TRACKS)) if (['math', 'iq'].includes(t.id)) for (const g of t.grades) for (const sk of g.skills || []) inTracks.add(typeof sk === 'string' ? sk : sk.id);
const SKILLS = Object.keys(bank.GENERATORS).filter((k) => inTracks.has(k));

async function pmap(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < list.length) {
      const k = i++;
      try { out[k] = await fn(list[k], k); } catch (e) { out[k] = { error: e.message }; }
    }
  }));
  return out;
}

function sample() {
  const items = [];
  let guard = 0;
  while (items.length < N && guard++ < N * 40) {
    const skillId = SKILLS[Math.floor(Math.random() * SKILLS.length)];
    let b;
    try { b = bank.generate({ skillId, difficulty: 3 + Math.floor(Math.random() * 5) }); } catch { continue; }
    if (it.themable(b)) items.push({ item: b, domain: INTERESTS[items.length % INTERESTS.length] });
  }
  return items;
}

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[−–]/g, '-').replace(/[\s,$]+/g, '').replace(/\.0+$/, '');

// A second blind solver for the held-out agreement check: the pipeline chain (the writers' family), not the gate's Nemotron.
async function secondSolve(item, stem) {
  const q = item.format === 'multiple_choice' ? `${stem}\n${item.choices.map((c, j) => `(${j}) ${c}`).join('\n')}` : stem;
  const r = await ai.structured({
    role: 'blocks', task: 'theme-solve', system: `Solve the question yourself. Give only the final answer${item.format === 'multiple_choice' ? ' as the exact option text' : ''}.`,
    user: q, schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] }, schemaName: 'ans', maxTokens: 3000, dataClass: 'pipeline',
  });
  return !!r && norm(r.answer) === norm(item.answer);
}

const FIT_SCHEMA = { type: 'object', properties: { score: { type: 'integer' } }, required: ['score'] };
async function fit(domain, text) {
  const r = await nvidia.structured({
    role: 'check', system: `You are a simulated 14 year old learner whose favourite thing is ${domain}. Rate how engaging and relevant this practice question feels to you, 1 (boring, nothing to do with me) to 5 (I would happily do it). Judge only the question's setting, not its difficulty.`,
    user: text, schema: FIT_SCHEMA, schemaName: 'rating', maxTokens: 800, models: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'low' }], timeoutMs: 90000, attempts: 2,
  });
  return r && r.data && Number.isInteger(r.data.score) ? Math.max(1, Math.min(5, r.data.score)) : null;
}

(async () => {
  const work = sample();
  const rows = await pmap(work, 4, async ({ item, domain }) => ({ item, domain, r: await it.theme(item, domain, { dataClass: 'pipeline' }) }));
  const stages = {};
  const accepted = [];
  for (const row of rows) {
    const st = row.r && row.r.ok ? 'ok' : (row.r && row.r.stage) || 'error';
    stages[st] = (stages[st] || 0) + 1;
    if (row.r && row.r.ok) accepted.push({ item: row.item, domain: row.domain, themed: row.r.item });
  }
  const held = await pmap(accepted, 4, (a) => secondSolve(a.item, a.themed.prompt));
  const heldBase = await pmap(accepted, 4, (a) => secondSolve(a.item, a.item.prompt));
  const fits = await pmap(accepted, 4, async (a) => ({ before: await fit(a.domain, a.item.prompt), after: await fit(a.domain, a.themed.prompt) }));
  const ok = fits.filter((f) => f && f.before && f.after);
  const mean = (xs) => (xs.length ? +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2) : null);
  const report = {
    kind: 'SIMULATED learners (interest labels) and AI-judged; not real-learner proof',
    at: new Date().toISOString(),
    candidates: work.length,
    gate_stages: stages,
    accepted: accepted.length,
    accept_rate: +(accepted.length / Math.max(1, work.length)).toFixed(3),
    key_agreement: {
      gate: 'blind re-solve (Nemotron) agrees with the original key on 100% of accepted, by construction',
      held_out_second_solver_themed: `${held.filter((x) => x === true).length}/${accepted.length}`,
      held_out_second_solver_untouched_base: `${heldBase.filter((x) => x === true).length}/${accepted.length}`,
    },
    engagement_fit_1to5: {
      n: ok.length, before: mean(ok.map((f) => f.before)), after: mean(ok.map((f) => f.after)),
      better: ok.filter((f) => f.after > f.before).length, same: ok.filter((f) => f.after === f.before).length, worse: ok.filter((f) => f.after < f.before).length,
    },
    examples: accepted.slice(0, 6).map((a) => ({ interest: a.domain, skill: a.item.skill_id, before: a.item.prompt, after: a.themed.prompt })),
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
