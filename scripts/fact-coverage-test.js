#!/usr/bin/env node
/**
 * The owner's coverage rule, as a test (FACT_CHECK_ALL, services/fact-guard.js, services/fact-registry.js, docs/FACT-COVERAGE.md).
 *
 * Fails when: a model task in services/ or routes/ has no registry row; a model call names no task at all; a shown task is missing from the owner's table;
 * a row names a verifier that is not there; an exemption has no reason; the guard shows text a check said wrong or could not read; a checker would read a
 * learner's text on a provider that learner is not cleared for. No network, no model, no live DB.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fact-coverage-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
process.env.FACT_CHECK_ALL = '1';
process.env.AI_POOL = '1';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`  ok  ${name}`); };
const okAsync = async (name, fn) => { await fn(); n += 1; console.log(`  ok  ${name}`); };

function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}
const SOURCES = [...walk(path.join(ROOT, 'services')), ...walk(path.join(ROOT, 'routes')), path.join(ROOT, 'server.js')];
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const registry = require('../services/fact-registry');

/** The argument text of a call that starts at `open` (the index of its parenthesis). Strings and templates are skipped well enough for this code. */
function argsAt(t, open) {
  let depth = 0;
  for (let i = open; i < t.length && i < open + 60000; i += 1) {
    const c = t[i];
    if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') { depth -= 1; if (depth === 0) return t.slice(open, i + 1); }
    else if (c === '\'' || c === '"') { const q = c; i += 1; while (i < t.length && t[i] !== q && t[i] !== '\n') { if (t[i] === '\\') i += 1; i += 1; } }
    else if (c === '`') {
      i += 1;
      let inner = 0;
      while (i < t.length) {
        if (t[i] === '\\') { i += 2; continue; }
        if (t[i] === '$' && t[i + 1] === '{') { inner += 1; i += 2; continue; }
        if (inner > 0 && t[i] === '}') { inner -= 1; i += 1; continue; }
        if (inner === 0 && t[i] === '`') break;
        i += 1;
      }
    }
  }
  return '';
}

// Task names as ledgers and judges use them. These are labels, not model tasks that write for a learner.
const LABELS_NOT_TASKS = new Set(['transcribe', 'pipeline']);

ok('every task named in services/ and routes/ has a registry row', () => {
  const missing = [];
  const re = /\b(?:task|factTask):\s*((?:['"`][\w-]+['"`])|(?:[\w.]+\s*\?\s*['"`][\w-]+['"`]\s*:\s*['"`][\w-]+['"`]))/g;
  for (const f of SOURCES) {
    const t = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(t))) {
      for (const name of m[1].match(/['"`][\w-]+['"`]/g) || []) {
        const task = name.slice(1, -1);
        if (!registry.lookup(task) && !LABELS_NOT_TASKS.has(task)) missing.push(`${rel(f)}: ${task}`);
      }
    }
  }
  assert.deepStrictEqual(missing, [], `tasks with no row in services/fact-registry.js:\n${missing.join('\n')}`);
});

ok('every model call names its task, or passes one through from a caller that does', () => {
  const unnamed = [];
  const re = /\bai\.(talk|talkDetail|structured|structuredDetail)\s*(\()/g;
  for (const f of SOURCES) {
    if (rel(f) === 'services/fact-guard.js') continue;
    const t = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(t))) {
      const line = t.slice(t.lastIndexOf('\n', m.index) + 1, m.index);
      if (/^\s*(\*|\/\/)/.test(line)) continue; // a comment naming the call
      const a = argsAt(t, m.index + m[0].length - 1);
      // `...a` / a plain args object: the caller's call holds the task; those callers are scanned by the test above.
      if (!/\b(task|factTask)\b/.test(a) && !/^\(\s*(a|args|layoutArgs|fillArgs)\s*\)$/.test(a) && !/^\(\s*\{\s*\.\.\.(a|args)\b/.test(a)) unnamed.push(`${rel(f)}:${t.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepStrictEqual(unnamed, [], `model calls with no task:\n${unnamed.join('\n')}`);
});

ok('nothing reaches a model around services/ai.js unless it is listed here with its reason', () => {
  // A call that skips services/ai.js skips the guard, so each file that does it has to be named, and none of them writes text a learner reads unchecked.
  const ALLOWED = {
    'services/ai.js': 'the choke point itself',
    'services/pool.js': 'the slots the choke point calls',
    'services/block-levels.js': 'the level verifier and its repairs; what they lead to passes verifyLevel before it is served',
    'services/fact-cascade.js': 'the level verifier',
    'services/fact-check-anthropic.js': 'the level verifier on the owner\'s key',
    'services/item-theme.js': 'blind judges of a themed question: verdicts read by code',
    'services/key-gate.js': 'blind judges of keys: verdicts read by code',
    'services/offline-pool.js': 'the verifier\'s research sheet',
    'services/spanish/unit-writer.js': 'writes Spanish units ahead, keeps only what its review pass passes (registry: spanish_write_ahead)',
    'services/typed-grading.js': 'grading judges: verdicts read by code; the feedback line passes the guard in ai.gradeFreeResponse',
    'services/tutor-vision.js': 'a description of the page for the tutor, whose reply is checked',
    'services/subject-placement.js': 'an optional writer that calls the guard itself (placementStructured)',
  };
  const re = /\b(nvidia|p|local|factReader|lyceum|gonka|zerogpu|coral|munito|grokified|xkiro|ollama|mimo|anthropic|standardCompute|provider|prov)\.(structured|structuredStream|chat|chatStream|ask)\s*\(|\bcallHedged\s*\(|\brunBatch\s*\(|\.messages\.(create|stream)\s*\(|providers\/\w+'\)\.\w*[sS]tructured\w*\(/;
  const found = [];
  for (const f of SOURCES) {
    const name = rel(f);
    if (name.startsWith('services/providers/') || ALLOWED[name]) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (re.test(line) && !/^\s*(\*|\/\/)/.test(line)) found.push(`${name}:${i + 1}`); });
  }
  assert.deepStrictEqual(found, [], `model calls that skip services/ai.js and the guard:\n${found.join('\n')}`);
});

ok('every shown task is in the owner\'s table, and every row says who checks what', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'FACT-COVERAGE.md'), 'utf8');
  const absent = registry.shown().filter((k) => !doc.includes(`\`${k}\``));
  assert.deepStrictEqual(absent, [], `shown tasks missing from docs/FACT-COVERAGE.md: ${absent.join(', ')}`);
  for (const [k, e] of Object.entries(registry.TASKS)) {
    assert.ok(['inline', 'downstream', 'internal', 'exempt'].includes(e.kind), `${k}: kind`);
    if (e.kind === 'inline') assert.ok(e.what && e.source && e.ifHeld && e.budgetMs, `${k}: says what, source, ifHeld and budget`);
    if (e.kind === 'downstream') {
      assert.ok(e.by && e.file && e.symbol && e.what && e.ifHeld, `${k}: names its verifier`);
      assert.ok(fs.readFileSync(path.join(ROOT, e.file), 'utf8').includes(e.symbol), `${k}: ${e.symbol} is not in ${e.file}`);
    }
    if (e.kind === 'internal' || e.kind === 'exempt') assert.ok(e.why && e.why.length > 10, `${k}: says why`);
    if (e.kind === 'exempt') assert.ok(doc.includes(`\`${k}\``), `${k}: exemptions are listed`);
  }
});

ok('the claim stays honest: no "100% fact-checked" in the product', () => {
  const hits = [];
  for (const f of [...walk(path.join(ROOT, 'public')).filter((x) => /\.(js)$/.test(x)), ...fs.readdirSync(path.join(ROOT, 'public')).filter((x) => x.endsWith('.html')).map((x) => path.join(ROOT, 'public', x))]) {
    if (/100\s*%\s*fact.?checked/i.test(fs.readFileSync(f, 'utf8'))) hits.push(rel(f));
  }
  assert.deepStrictEqual(hits, []);
});

const db = require('../config/db');
const guard = require('../services/fact-guard');
const ai = require('../services/ai');
const pool = require('../services/pool');

/** The checker, stubbed: `say(args)` gives the answer of each check call. */
function stubChecker(say) {
  const calls = [];
  const real = ai.structuredDetail;
  ai.structuredDetail = async (a) => { calls.push(a); const r = await say(a, calls.length); return r; };
  return { calls, restore: () => { ai.structuredDetail = real; } };
}
const CLEAN = { data: { checked: 1, wrong: [] }, model: 'z-ai/glm-5.3-flash' };
const WRONG = { data: { checked: 1, wrong: [{ n: 1, quote: 'x', why: 'it is false' }] }, model: 'z-ai/glm-5.3-flash' };

async function runtime() {
  const chat = (text = 'A reply.') => ({ text, model: 'deepseek-v4.1-flash' });

  await okAsync('switch off: nothing changes, no check runs', async () => {
    process.env.FACT_CHECK_ALL = '0';
    const s = stubChecker(() => WRONG);
    const r = await guard.pass({ task: 'dock_help', req: { kind: 'chat' }, result: chat() });
    process.env.FACT_CHECK_ALL = '1';
    s.restore();
    assert.strictEqual(r.text, 'A reply.');
    assert.strictEqual(s.calls.length, 0);
  });

  await okAsync('an unregistered task shows nothing', async () => {
    const s = stubChecker(() => CLEAN);
    const a = await guard.pass({ task: 'brand_new_output', req: { kind: 'chat' }, result: chat() });
    const b = await guard.pass({ task: 'brand_new_output', req: { kind: 'structured' }, result: { data: { x: 'y' } } });
    const c = await guard.pass({ task: null, req: { kind: 'structured' }, result: { data: { x: 'y' } } });
    s.restore();
    assert.ok(guard.isHeld(a.text));
    assert.strictEqual(b, null);
    assert.strictEqual(c, null);
  });

  await okAsync('an internal task is not checked; a shown task is', async () => {
    const s = stubChecker(() => CLEAN);
    await guard.pass({ task: 'tutor_facts', req: { kind: 'chat' }, result: chat() });
    assert.strictEqual(s.calls.length, 0);
    const r = await guard.pass({ task: 'dock_help', req: { kind: 'chat', factSource: 'the page', messages: [{ role: 'user', content: 'is it 3/4?' }] }, userId: null, result: chat() });
    s.restore();
    assert.strictEqual(r.text, 'A reply.');
    assert.strictEqual(s.calls.length, 1);
    assert.strictEqual(s.calls[0].task, 'fact_live');
    assert.ok(s.calls[0].user.includes('A reply.') && s.calls[0].user.includes('the page') && s.calls[0].user.includes('is it 3/4?'));
    assert.deepStrictEqual(s.calls[0].excludeFamilies, ['deepseek'], 'another family than the writer checks');
  });

  await okAsync('tutor: wrong, then a checked second try is shown', async () => {
    const s = stubChecker((a, i) => (i === 1 ? WRONG : CLEAN));
    let note = '';
    const r = await guard.pass({ task: 'coach_turn', req: { kind: 'chat' }, result: chat('Two plus two is five.'), rerun: async (x) => { note = x; return chat('Two plus two is four.'); } });
    s.restore();
    assert.strictEqual(r.text, 'Two plus two is four.');
    assert.ok(note.includes('it is false'));
  });

  await okAsync('tutor: wrong twice is held with the honest sentence; the wrong text is gone', async () => {
    const s = stubChecker(() => WRONG);
    const r = await guard.pass({ task: 'dock_help', req: { kind: 'chat' }, result: chat('Two plus two is five.'), rerun: async () => chat('Two plus two is six.') });
    s.restore();
    assert.strictEqual(r.text, guard.HELD.wrong);
    assert.ok(!/five|six/.test(JSON.stringify(r.text)));
  });

  for (const [name, say] of [['no answer', () => null], ['an error', () => { throw new Error('down'); }], ['nonsense', () => ({ data: { verdict: 'fine' } })]]) {
    // eslint-disable-next-line no-await-in-loop
    await okAsync(`fail closed: a checker giving ${name} never passes`, async () => {
      const s = stubChecker(say);
      const live = await guard.pass({ task: 'assist_help', req: { kind: 'chat' }, result: chat() });
      const bg = await guard.pass({ task: 'analyze_session', req: { kind: 'structured' }, result: { data: { summary: 'You did well.' } } });
      const text = await guard.passesText({ task: 'grade_free_response', text: 'Feedback.' });
      s.restore();
      assert.strictEqual(live.text, guard.HELD.cant);
      assert.strictEqual(bg, null);
      assert.strictEqual(text, false);
    });
  }

  await okAsync('structured output: only the flagged piece is removed, on a copy', async () => {
    const data = { items: [{ prompt: 'Q1', answer: '1' }, { prompt: 'Q2', answer: '2' }, { prompt: 'Q3', answer: '3' }] };
    const s = stubChecker(() => ({ data: { checked: 3, wrong: [{ n: 2, why: 'key is wrong' }] }, model: 'm' }));
    const r = await guard.pass({ task: 'author_items', req: { kind: 'structured' }, result: { data, model: 'w' } });
    s.restore();
    assert.deepStrictEqual(r.data.items.map((x) => x.prompt), ['Q1', 'Q3']);
    assert.strictEqual(data.items.length, 3);
  });

  await okAsync('structured output: nothing left means nothing shown', async () => {
    const s = stubChecker(() => ({ data: { checked: 1, wrong: [{ n: 1, why: 'x' }] }, model: 'm' }));
    const r = await guard.pass({ task: 'regen_items', req: { kind: 'structured' }, result: { data: { items: [{ prompt: 'Q', answer: 'A' }] } } });
    s.restore();
    assert.strictEqual(r, null);
  });

  await okAsync('personal layer: a wrong piece goes; too little left means no layer', async () => {
    const layer = { why: 'It matters to you.', hook: 'Imagine a game.', analogies: [{ point: 'p', text: 'Like a bishop, which is worth 3.25 pawns.' }] };
    let s = stubChecker((a) => { assert.ok(a.user.startsWith('LESSON:')); return { data: { checked: 3, wrong: [{ n: 3, why: 'adds a number' }] }, model: 'm' }; });
    const r = await guard.pass({ task: 'part_layer', req: { kind: 'structured', factSource: 'The lesson.' }, result: { data: layer, model: 'w' } });
    s.restore();
    assert.deepStrictEqual(r.data.analogies, []);
    assert.strictEqual(r.data.why, 'It matters to you.');
    s = stubChecker(() => ({ data: { checked: 3, wrong: [{ n: 1, why: 'a' }, { n: 2, why: 'b' }] }, model: 'm' }));
    const r2 = await guard.pass({ task: 'part_layer', req: { kind: 'structured', factSource: 'The lesson.' }, result: { data: layer, model: 'w' } });
    s.restore();
    assert.strictEqual(r2, null);
  });

  await okAsync('an upload is checked against the learner\'s own text, whatever else is believed', async () => {
    const s = stubChecker(() => CLEAN);
    await guard.pass({ task: 'material_notes', req: { kind: 'structured', factSource: 'Their passage.' }, result: { data: { sections: [{ heading: 'H', bullets: [{ text: 'A bullet.' }] }] } } });
    s.restore();
    assert.strictEqual(s.calls[0].system, guard.SYSTEMS.material);
    assert.ok(s.calls[0].user.startsWith('SOURCE:\nTheir passage.'));
  });

  await okAsync('the real entry points: ai.talk and ai.structured go through the guard, by task', async () => {
    const realHedged = pool.callHedged;
    const seen = [];
    pool.callHedged = async (req) => {
      seen.push(req.task || req.role);
      if (req.task === 'fact_live') return { data: { checked: 1, wrong: [{ n: 1, why: 'false' }] }, model: 'glm', usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } };
      if (req.kind === 'chat') return { text: 'Two plus two is five.', model: 'deepseek', usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } };
      return { data: { summary: 'Claim.' }, model: 'deepseek', usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } };
    };
    const said = await ai.talk({ role: 'fast', task: 'dock_help', system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10, timeoutMs: 1000 });
    const none = await ai.structured({ role: 'fast', task: 'analyze_session', system: 's', user: 'u', schema: {}, maxTokens: 10 });
    const nameless = await ai.structured({ role: 'fast', system: 's', user: 'u', schema: {}, maxTokens: 10 });
    pool.callHedged = realHedged;
    assert.ok(guard.isHeld(said), 'the wrong reply is not what the caller gets');
    assert.strictEqual(none, null);
    assert.strictEqual(nameless, null, 'a call with no task shows nothing');
    assert.ok(seen.includes('fact_live'));
  });

  await okAsync('the coach is never streamed unchecked: the stream sends a reply whole, after the check', async () => {
    const realHedged = pool.callHedged;
    pool.callHedged = async (req) => (req.task === 'fact_live'
      ? { data: { checked: 1, wrong: [] }, model: 'glm', usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } }
      : { text: 'What is the first step?', model: 'deepseek', usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } });
    const deltas = [];
    const out = await ai.coachReplyStream({ item: { prompt: 'Q', answer: 'zebra' }, messages: [{ role: 'user', content: 'help' }], onDelta: (d) => deltas.push(d) });
    pool.callHedged = realHedged;
    assert.deepStrictEqual(deltas, ['What is the first step?']);
    assert.strictEqual(out.text, 'What is the first step?');
  });

  await okAsync('personal layer, the whole path: a failed or absent check stores no layer and the lesson stays', async () => {
    const layer = require('../services/lesson-layer'); // eslint-disable-line global-require
    const plan = { id: 'pl-1', track_id: 't', grade_id: 'g', level: 1, blocks: [{ data: { text: 'A bishop moves along diagonals.' } }], checks: [] };
    const written = { why: 'You want your game to hold up, so this is worth your time.', hook: 'Imagine a point guard who only passes on the diagonal. How far could it go?', analogies: [] };
    const spec = { isDefault: false, interests: { exampleDomains: ['basketball'] } };
    const realHedged = pool.callHedged;
    for (const [id, checker] of [['pl-1', () => ({ data: { checked: 2, wrong: [{ n: 1, why: 'x' }, { n: 2, why: 'y' }] }, model: 'glm' })], ['pl-2', () => null]]) {
      pool.callHedged = async (req) => (req.task === 'fact_live'
        ? (() => { const c = checker(); return c && { ...c, usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } }; })()
        : { data: written, model: 'deepseek-v4.1-flash', usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } });
      const u = db.insert('users', { email: `layer-${id}@savant.test`, age_check: { birth_ym: '1990-01', needs_parent: false } });
      // eslint-disable-next-line no-await-in-loop
      const row = await layer.start({ user: u, plan: { ...plan, id }, spec });
      assert.strictEqual(row, null, `${id}: nothing stored as ready`);
      assert.strictEqual(layer.get(u.id, id).state, 'none');
    }
    pool.callHedged = async (req) => (req.task === 'fact_live'
      ? { data: { checked: 2, wrong: [] }, model: 'glm', usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } }
      : { data: written, model: 'deepseek-v4.1-flash', usage: null, pool: { provider: 'x', attempts: [], elapsedMs: 1 } });
    const u = db.insert('users', { email: 'layer-ok@savant.test', age_check: { birth_ym: '1990-01', needs_parent: false } });
    const row = await layer.start({ user: u, plan: { ...plan, id: 'pl-3' }, spec });
    pool.callHedged = realHedged;
    assert.ok(row && row.fact_checked, 'a checked layer is stored and marked');
    assert.strictEqual(layer.get(u.id, 'pl-3').state, 'ready');
  });

  ok('a checker is a provider too: an under-13 without consent never reaches an outside slot', () => {
    const slots = pool.candidatesFor({ kind: 'structured', role: 'fast', task: 'fact_live', userId: 99, dataClass: 'learner', outside: false, munito: false, coral: false, xkiro: false });
    const providers = require('../services/providers'); // eslint-disable-line global-require
    for (const s of slots) assert.ok(!providers.isOutside(providers.ALL[s.provider] || { name: s.provider }), `${s.id} is outside this machine`);
  });

  ok('14 Nov: when the window closes the added providers drop out of the check by themselves', () => {
    process.env.ZEROGPU_LEARNER = 'on';
    const cleared = { kind: 'structured', role: 'fast', task: 'fact_live', userId: 99, dataClass: 'learner', outside: true, munito: true, coral: true, xkiro: false };
    process.env.ZEROGPU_LEARNER_UNTIL = '2099-01-01T00:00:00Z';
    const before = pool.candidatesFor(cleared).map((s) => s.id);
    process.env.ZEROGPU_LEARNER_UNTIL = '2026-11-14T06:00:00Z';
    const nowZ = Date.now;
    Date.now = () => Date.parse('2026-11-15T00:00:00Z');
    const after = pool.candidatesFor(cleared).map((s) => s.id);
    Date.now = nowZ;
    delete process.env.ZEROGPU_LEARNER_UNTIL;
    assert.ok(before.some((id) => id.startsWith('zerogpu:')), 'in the window ZeroGPU may check');
    assert.ok(!after.some((id) => id.startsWith('zerogpu:')), 'after the window it may not');
  });

  ok('stored text from before the guard is not served', () => {
    const partModify = require('../services/part-modify'); // eslint-disable-line global-require
    const item = { rationale: 'Stored.', hint: 'Stored hint.', shaped: { rationale: 'Rewritten, rules only.', hint: 'Rewritten hint.' } };
    assert.strictEqual(partModify.rationaleOf(item), 'Stored.');
    assert.strictEqual(partModify.hintOf(item), 'Stored hint.');
    const layer = require('../services/lesson-layer'); // eslint-disable-line global-require
    db.insert(layer.COLLECTION, { user_id: 1, plan_id: 'p1', status: 'ready', layer: { why: 'x' } });
    assert.strictEqual(layer.get(1, 'p1').state, 'none');
    db.insert(layer.COLLECTION, { user_id: 1, plan_id: 'p2', status: 'ready', layer: { why: 'x' }, fact_checked: true });
    assert.strictEqual(layer.get(1, 'p2').state, 'ready');
  });

  ok('the held sentences state no fact about any subject and do not claim the tutor is unplugged', () => {
    for (const t of Object.values(guard.HELD)) {
      assert.ok(!/\d/.test(t));
      assert.ok(!/not connected/.test(t));
    }
  });

  ok('the owner\'s numbers keep no learner and no text', () => {
    const rows = guard.stats();
    assert.ok(rows.length > 0);
    for (const r of rows) assert.deepStrictEqual(Object.keys(r).filter((k) => !['id', 'day', 'task', 'usd', 'checked', 'passed', 'wrong', 'cant', 'ms_total', 'created_at', 'updated_at'].includes(k)), []);
  });
}

async function spendAndRecheck() {
  const db = require('../config/db');
  const pool = require('../services/pool');
  const recheck = require('../services/fact-recheck');
  const day = new Date().toISOString().slice(0, 10);
  const clean = () => ({ data: { checked: 1, wrong: [] }, model: 'stub', costUsd: 0.01 });

  await okAsync('the guard counts its own spend, per learner and per day, and never against the learner\'s limit', async () => {
    const before = db.findOne('fact_guard_stats', (r) => r.day === day && r.task === '_spend');
    await guard.check({ pieces: ['Two plus two is four.'], userId: 77123, llm: async () => clean() });
    const row = db.findOne('ai_usage', (u) => u.user_id === 77123 && u.day === day);
    assert.ok(row && Math.abs(row.check_usd - 0.01) < 1e-9);
    assert.strictEqual(row.calls, 0); assert.strictEqual(row.cents, 0);
    const after = db.findOne('fact_guard_stats', (r) => r.day === day && r.task === '_spend');
    assert.ok(after.usd > ((before && before.usd) || 0));
    assert.ok(!Object.keys(after).some((k) => /user/.test(k)));
  });

  await okAsync('over the learner\'s limit a check reads on free slots only; if none answers the chat says so and is never shown unchecked', async () => {
    process.env.FACT_GUARD_LEARNER_DAY_USD = '0.005';
    assert.strictEqual(guard.capReached(77123), 'learner');
    assert.strictEqual(guard.capReached(77124), null);
    let asked = null;
    const v = await guard.check({ pieces: ['Two plus two is four.'], userId: 77123, llm: async (a) => { asked = a; return clean(); } });
    assert.strictEqual(asked.freeOnly, true); assert.strictEqual(v.capped, 'learner');
    delete process.env.FACT_GUARD_LEARNER_DAY_USD;
  });

  await okAsync('over the day\'s limit too, and a paid slot refuses a free-only request', async () => {
    process.env.FACT_GUARD_DAY_USD = '0.001';
    assert.strictEqual(guard.capReached(null), 'day');
    delete process.env.FACT_GUARD_DAY_USD;
    const why = pool.refusal({ id: 'x', provider: 'test', paid: true, supports: ['structured'], dataClass: 'learner' }, { task: 'fact_live', kind: 'structured', freeOnly: true, dataClass: 'learner' }, 'structured');
    assert.ok(/^budget/.test(String(why)));
  });

  await okAsync('a slow independent reader leaves time for the last-resort reader on stored text too', async () => {
    const seen = [];
    const v = await guard.check({ pieces: ['Two plus two is four.'], writerModel: 'deepseek-v4.1-flash', budgetMs: 1000, userId: null, dataClass: 'pipeline', llm: async (a) => { seen.push(a); if (a.excludeFamilies) return null; return clean(); } });
    assert.ok(v.ran);
    if (seen[0].excludeFamilies) assert.ok(seen[0].timeoutMs <= 600);
  });

  await okAsync('the re-check: off by default, reports without changing a row, keeps its place, stops at its cap, waits when no checker answers', async () => {
    delete process.env.FACT_RECHECK;
    assert.strictEqual((await recheck.tick()).stopped, 'off');
    const a = db.insert('items', { source: 'ai', prompt: 'What is 2 + 2?', answer: '5', rationale: 'Because.' });
    const b = db.insert('items', { source: 'ai', prompt: 'What is 3 + 3?', answer: '6', rationale: 'Sum.' });
    const copy = JSON.stringify(db.byId('items', a.id));
    process.env.FACT_RECHECK = '1'; process.env.FACT_RECHECK_DAY_USD = '0.3';
    let t = await recheck.tick({ batch: 1, llm: async () => null });
    assert.strictEqual(t.stopped, 'no_checker'); assert.strictEqual(t.read, 0);
    const wrongOnFirst = async () => ({ data: { checked: 1, wrong: [{ n: 1, quote: 'Key: 5', why: '2 + 2 is 4' }] }, model: 'stub', costUsd: 0.4 });
    for (let i = 0; i < 400; i += 1) { // eslint-disable-line no-await-in-loop
      t = await recheck.tick({ batch: 1, llm: wrongOnFirst }); // eslint-disable-line no-await-in-loop
      if (t.stopped) break;
    }
    assert.strictEqual(t.stopped, 'cap');
    assert.strictEqual(JSON.stringify(db.byId('items', a.id)), copy);
    assert.ok(db.byId('items', b.id));
    const rows = db.find(recheck.FINDINGS, () => true);
    assert.ok(rows.length >= 1);
    assert.ok(!rows.some((r) => 'user_id' in r));
    delete process.env.FACT_RECHECK; delete process.env.FACT_RECHECK_DAY_USD;
  });

  ok('the check reads the turns before a reply, so a true "that is right" is judged against the question that was asked', () => {
    const ctx = guard.lastLearnerLine({ messages: [{ role: 'user', content: 'Quiz me' }, { role: 'assistant', content: 'What is the capital of Canada?' }, { role: 'user', content: 'ottawa' }] });
    assert.ok(/Tutor: What is the capital of Canada/.test(ctx) && /Learner: ottawa/.test(ctx));
    assert.ok(/capital of Canada/.test(guard.checkUser({ pieces: ['x'], learnerSaid: ctx })));
  });

  ok('the check works a statement out before it gives a verdict', () => {
    assert.ok(guard.SCHEMA.properties.working);
    assert.strictEqual(Object.keys(guard.SCHEMA.properties)[0], 'working');
  });
}

runtime().then(spendAndRecheck).then(() => {
  console.log(`fact-coverage-test: ${n} checks passed`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
