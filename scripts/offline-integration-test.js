/**
 * The offline-first fact pool and local fallback wired into the fact cascade, tested
 * with mocks: no model, kiwix-serve or fact-checker server is called.
 *
 *   - FACT_POOL unset: nothing changes (no offline pool, no offline passages)
 *   - FACT_POOL=offline: the paid researcher sees ONLY the unsourced facts; without
 *     it, unsourced facts are dropped, never handed to the writer
 *   - documentFor is async and appends offline passages only when asked and on
 *   - the offline second chance can clear a claim but never adds or changes a flag
 *   - cheap()'s local step answers only for tasks the local lineup serves
 *
 *   node scripts/offline-integration-test.js
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|FACT_CHECK)_.*KEY/.test(name)) process.env[name] = '';
}
delete process.env.FACT_POOL;
const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `offline-integration-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}

const pool = require('../services/offline-pool');
const offlineFacts = require('../services/offline-facts');
const ollama = require('../services/providers/ollama');
const cascade = require('../services/fact-cascade');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

(async () => {
  const realBuild = pool.buildUnitPool;
  let built = 0;
  pool.buildUnitPool = async () => {
    built++;
    return {
      facts: [
        { fact: 'Hablar means to speak.', kind: 'established', source_url: 'https://en.wiktionary.org/wiki/hablar', source_quote: 'to speak' },
        { fact: 'The rook moves along ranks and files.', kind: 'established', source_url: 'https://en.wikipedia.org/wiki/Rook_(chess)', source_quote: 'any number of squares' },
        { fact: 'A haiku has 5, 7 and 5 syllables.', kind: 'established', source_url: '', source_quote: '', unsourced: true },
      ],
      misconceptions: ['librería means library'],
      sources: [{ url: 'https://en.wiktionary.org/wiki/hablar', title: 'hablar' }],
      searches: 0, cost: 0, model: 'offline pool (test)', offline: { supported: 2, unsourced: 1, checkers: true },
    };
  };
  const context = { text: 'Unit', topic: 'test' };

  // 1. off by default
  let researched = null;
  const research = async (args) => { researched = args; return { facts: [{ fact: 'A haiku has three lines of 5, 7 and 5 syllables.', kind: 'established', source_url: 'https://example.org', source_quote: 'q' }], misconceptions: [], sources: [{ url: 'https://example.org', title: 'x' }], searches: 2, cost: 0.03, model: 'claude (test)' }; };
  check('FACT_POOL unset: offlineFirst is off', (await pool.offlineFirst({ context, research })) === null && built === 0 && researched === null);
  const poolRow = { facts: [{ fact: 'The rook moves along ranks and files.', source_quote: 'The rook moves any number of squares along a rank or file.' }] };
  const realDoc = offlineFacts.documentFor;
  let offlineAsked = 0;
  offlineFacts.documentFor = async () => { offlineAsked++; return { doc: 'Rook (chess): OFFLINE PASSAGE', passages: [] }; };
  const docOff = await cascade.documentFor('The rook moves along files.', poolRow, 6, { offline: true });
  check('FACT_POOL unset: documentFor is async and pool-only', /rank or file/.test(docOff) && !/OFFLINE/.test(docOff) && offlineAsked === 0);

  // 2. on
  process.env.FACT_POOL = 'offline';
  const sheet = await pool.offlineFirst({ context, coverage: ['haiku'], research });
  check('FACT_POOL=offline: the researcher gets ONLY the unsourced facts, with few searches', researched && researched.coverage.length === 1 && /haiku/.test(researched.coverage[0]) && researched.maxSearches <= 4);
  check('the sheet keeps the 2 sourced facts and the researched one, cost and searches from the researcher only', sheet && sheet.facts.length === 3 && sheet.cost === 0.03 && sheet.searches === 2 && sheet.offline.researched === 1);
  const dropped = await pool.offlineFirst({ context, research: async () => null });
  check('without a researcher answer, unsourced facts are dropped, not given to the writer', dropped && dropped.facts.length === 2 && dropped.facts.every((f) => !f.unsourced) && dropped.offline.dropped === 1);
  pool.buildUnitPool = async () => ({ facts: [{ fact: 'x', unsourced: true }], misconceptions: [], sources: [], model: 't', offline: {} });
  check('nothing sourced and no researcher answer: null, so the caller researches as before', (await pool.offlineFirst({ context, research: async () => null })) === null);
  pool.buildUnitPool = async () => null;
  check('offline pool unavailable: null', (await pool.offlineFirst({ context, research })) === null);

  const docOn = await cascade.documentFor('The rook moves along files.', poolRow, 6, { offline: true });
  check('FACT_POOL=offline: documentFor appends offline passages when asked', /rank or file/.test(docOn) && /OFFLINE PASSAGE/.test(docOn));
  const docPlain = await cascade.documentFor('The rook moves along files.', poolRow, 6);
  check('documentFor without { offline } stays pool-only (the flag-raising callers)', !/OFFLINE/.test(docPlain));

  // 3. the second chance only clears
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const pairs = JSON.parse(opts.body).pairs;
    return { ok: true, json: async () => ({ results: pairs.map((p) => (/supported claim/.test(p.claim) ? { factcg: 0.9, minicheck: 0.95 } : { factcg: 0.02, minicheck: 0.01 })) }) };
  };
  const factual = [{ claim: 'A supported claim.' }, { claim: 'An example about block 3.' }, { claim: 'Already fine.' }];
  const verdicts = new Map([[0, 'local: not in the unit\'s sources'], [1, 'local: Granite says ungrounded'], [2, 'supported']]);
  const cleared = await cascade.offlineSecondChance(factual, verdicts, { topic: 't' });
  check('offline evidence clears a claim it supports', cleared === 1 && verdicts.get(0) === 'supported');
  check('"unsupported" offline never changes a verdict or adds a flag', verdicts.get(1) === 'local: Granite says ungrounded' && verdicts.size === 3);
  global.fetch = async () => { throw new Error('down'); };
  const v2 = new Map([[0, 'local: x']]);
  check('checkers down: verdicts unchanged', (await cascade.offlineSecondChance([{ claim: 'A supported claim.' }], v2)) === 0 && v2.get(0) === 'local: x');
  global.fetch = realFetch;

  // 4. the local step in cheap()
  const realEnabled = ollama.isEnabled;
  const realStructured = ollama.structured;
  ollama.isEnabled = () => false;
  check('local step skipped for a task the local lineup does not serve', (await cascade.localAnswer({ system: 's', user: 'u', schema: {}, schemaName: 'x', task: 'fact_read' })) === null);
  ollama.isEnabled = (role, task) => task === 'fact_claims';
  ollama.structured = async () => ({ data: { claims: [] }, model: 'qwen3.5:4b' });
  const la = await cascade.localAnswer({ system: 's', user: 'u', schema: {}, schemaName: 'x', task: 'fact_claims' });
  check('local step answers a served task at $0', la && la.cost === 0 && la.model === 'qwen3.5:4b');
  ollama.structured = async () => { throw new Error('no RAM'); };
  check('a failing local model returns null (Haiku next)', (await cascade.localAnswer({ system: 's', user: 'u', schema: {}, schemaName: 'x', task: 'fact_claims' })) === null);

  ollama.isEnabled = realEnabled;
  ollama.structured = realStructured;
  offlineFacts.documentFor = realDoc;
  pool.buildUnitPool = realBuild;
  delete process.env.FACT_POOL;
  if (ownCopy) fs.rmSync(ownCopy, { force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); if (ownCopy) fs.rmSync(ownCopy, { force: true }); process.exit(1); });
