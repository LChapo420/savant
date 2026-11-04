/** Tests for scripts/autobuild.js with a fake aider and a fake reviewer, on a throwaway git repo. No network, no Claude. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const A = require('./autobuild');

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log(`FAIL ${m}`); } else console.log(`ok   ${m}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autobuild-test-'));
const repo = path.join(tmp, 'repo');
const sh = (c, cwd = repo) => execSync(c, { cwd, stdio: 'pipe', encoding: 'utf8' });

function setup(tasks) {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(path.join(repo, 'docs/night'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  sh('git init -q -b main'); sh('git config user.email t@t'); sh('git config user.name t');
  fs.writeFileSync(path.join(repo, 'feature.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repo, 'scripts/feature-test.js'), 'const a=require("../feature");if(a<0)process.exit(1);\nconsole.assert(a>=1);\n');
  fs.writeFileSync(path.join(repo, 'other.js'), 'x\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'data/\nnode_modules/\n');
  fs.mkdirSync(path.join(repo, 'data'));
  const q = '# q\n\n' + tasks.map((t) => `## TASK ${t.id}\nStatus: open\nGoal: "g ${t.id}"\nFiles: feature.js\nTest: ${t.test || 'node -e "process.exit(0)"'}\nAcceptance: do the thing\nexactly this way.\n`).join('\n');
  fs.writeFileSync(path.join(repo, 'docs/night/AUTO-QUEUE.md'), q);
  sh('git add -A'); sh('git commit -qm init');
  return q;
}
const W = [{ key: 'fake', family: 'minimax', model: 'fake', base: '', apiKey: 'k', paid: false }];
const opts = (extra = {}) => ({ repo, base: 'main', queue: path.join(repo, 'docs/night/AUTO-QUEUE.md'), log: path.join(repo, 'docs/night/AUTO-LOG.md'), wtRoot: tmp, tmp,
  lock: path.join(tmp, 'lock'), fullTest: 'node -e "process.exit(0)"', writers: W, env: {}, link: false, ...extra });
const edit = (dir, f, s) => fs.writeFileSync(path.join(dir, f), s);
const goodReview = async () => ({ pass: true, reasons: [], model: 'fake-reviewer', costUsd: 0 });

(async () => {
  // 1. pass path: claims, commits, logs, status only
  const q0 = setup([{ id: 't1' }]);
  const mainBefore = sh('git rev-parse main');
  let calls = 0;
  let r = await A.run(opts(), { runAider: (w, dir) => { calls++; edit(dir, 'feature.js', 'module.exports = 2;\n'); return { ok: true, costUsd: 0 }; }, review: goodReview });
  const q1 = fs.readFileSync(path.join(repo, 'docs/night/AUTO-QUEUE.md'), 'utf8');
  ok(r.results[0].done && /Status: done [0-9a-f]{7}/.test(q1), 'pass: status becomes done <commit>');
  ok(A.frozen(q1) === A.frozen(q0), 'pass: task text byte-identical (only Status changed)');
  ok(/auto\/t1/.test(fs.readFileSync(path.join(repo, 'docs/night/AUTO-LOG.md'), 'utf8')), 'pass: AUTO-LOG entry written');
  ok(/Built by autobuild/.test(sh('git log -1 --format=%B auto/t1')) && !/Co-Authored-By/.test(sh('git log -1 --format=%B auto/t1')), 'pass: commit message, no Claude trailer');
  ok(sh('git rev-parse main') === mainBefore && sh('git rev-parse auto/t1') !== mainBefore, 'pass: main untouched, work only on auto/t1');
  ok(!fs.existsSync(path.join(tmp, 'lock')), 'lock released');

  // 2. retry with failure fed back, then success
  setup([{ id: 't2', test: 'node scripts/feature-test.js' }]);
  const msgs = [];
  let n = 0;
  r = await A.run(opts(), { runAider: (w, dir, msg) => { msgs.push(fs.readFileSync(msg, 'utf8')); n++; edit(dir, 'feature.js', n === 1 ? 'module.exports = -5;\n' : 'module.exports = 3;\n'); return { ok: true, costUsd: 0 }; }, review: goodReview });
  ok(r.results[0].done && r.results[0].attempts === 2, 'retry: second attempt passes');
  ok(/TASK TEST failed/.test(msgs[1]), 'retry: failure is fed back into the next prompt');

  // 3. blocked after 3 failed attempts
  setup([{ id: 't3' }, { id: 't4' }]);
  n = 0;
  r = await A.run(opts({ only: 't3' }), { runAider: (w, dir) => { n++; edit(dir, 'feature.js', `module.exports = ${n + 10};\n`); return { ok: true, costUsd: 0 }; }, review: async () => ({ pass: false, reasons: ['nope'], model: 'r', costUsd: 0 }) });
  const q3 = fs.readFileSync(path.join(repo, 'docs/night/AUTO-QUEUE.md'), 'utf8');
  ok(n === 3 && /Status: blocked 3 attempts failed/.test(q3), 'blocked: 3 attempts then blocked <reason>');
  ok(/## TASK t4\nStatus: open/.test(q3), 'blocked: other tasks untouched');

  // 4. scope gate
  setup([{ id: 't5' }]);
  n = 0;
  r = await A.run(opts(), { runAider: (w, dir) => { n++; edit(dir, 'feature.js', 'module.exports = 9;\n'); edit(dir, 'other.js', 'changed\n'); return { ok: true, costUsd: 0 }; }, review: goodReview });
  ok(r.results[0].blocked && /scope/.test((r.results[0].notes || []).join(',')), 'scope: out-of-scope edit is rejected');
  ok(A.scopeGate([{ st: '??', file: 'scripts/new-thing-test.js' }], ['feature.js']).length === 0, 'scope: a new test file is allowed');
  ok(A.scopeGate([{ st: ' M', file: 'docs/PRODUCT-DECISIONS.md' }], ['docs/PRODUCT-DECISIONS.md']).length === 1, 'scope: sealed file refused even if listed');
  ok(A.scopeGate([{ st: ' M', file: '.env' }], ['feature.js']).length === 1, 'scope: .env refused');

  // 5. gate weakening
  setup([{ id: 't6', test: 'node scripts/feature-test.js' }]);
  fs.appendFileSync(path.join(repo, 'docs/night/AUTO-QUEUE.md'), '');
  const wk = (before, after) => `--- a/scripts/x-test.js\n+++ b/scripts/x-test.js\n@@\n-${before}\n+${after}\n`;
  ok(A.weakeningGate(wk('assert(score >= 95);', 'assert(score >= 90);')).length === 1, 'weakening: lowered threshold caught');
  ok(A.weakeningGate(wk('assert.strictEqual(a, 1);', '')).length === 1, 'weakening: deleted assertion caught');
  ok(A.weakeningGate(wk('assert(x);', 'it.skip(x);')).length >= 1, 'weakening: skip caught');
  ok(A.weakeningGate(wk('assert(score >= 95);', 'assert(score >= 96);')).length === 0, 'weakening: tightened threshold fine');
  ok(A.weakeningGate('--- a/feature.js\n+++ b/feature.js\n-assert(1)\n').length === 0, 'weakening: non-test files not judged');
  n = 0;
  r = await A.run(opts(), { runAider: (w, dir) => { n++; edit(dir, 'scripts/feature-test.js', 'const a=require("../feature");\n'); edit(dir, 'feature.js', 'module.exports = 4;\n'); return { ok: true, costUsd: 0 }; }, review: goodReview });
  ok(r.results[0].blocked && /scope|weakening/.test((r.results[0].notes || []).join(',')), 'weakening: edit of an existing test is stopped end to end');

  // 6. queue text can never be edited through setStatus
  const qf = path.join(repo, 'docs/night/AUTO-QUEUE.md');
  let threw = false;
  try { A.setStatus(qf, 'nope', 'done'); } catch (e) { threw = true; }
  ok(threw, 'queue: unknown task id refused');
  const before = fs.readFileSync(qf, 'utf8');
  A.setStatus(qf, 't6', 'blocked reason\nGoal: injected');
  ok(A.frozen(fs.readFileSync(qf, 'utf8')) === A.frozen(before) && !/^Goal: injected/m.test(fs.readFileSync(qf, 'utf8')), 'queue: a multi-line status cannot inject task text');

  // 7. lock
  fs.writeFileSync(path.join(tmp, 'lock'), JSON.stringify({ pid: process.pid, at: Date.now() }));
  r = await A.run(opts(), { runAider: () => { throw new Error('should not run'); }, review: goodReview });
  ok(r.ran === false, 'lock: a second run does not start');
  fs.unlinkSync(path.join(tmp, 'lock'));

  // 8. verdict parsing fails closed
  ok(A.parseVerdict('garbage').pass === false && A.parseVerdict('{"verdict":"pass","reasons":[]}').pass === true, 'review: verdict parsing fails closed');

  // 9. credit providers: writer order and reviewer family (mock fetch, throwaway ledgers; no network)
  {
    const saved = {};
    const set = (k, v) => { if (!(k in saved)) saved[k] = process.env[k]; process.env[k] = v; };
    set('GROKIFIED_API_KEY', 'k-not-real'); set('GONKA_API_KEY', 'k-not-real'); set('XKIRO_API_KEY', 'k-not-real'); delete process.env.MUNITO_API_KEY; delete process.env.NVIDIA_API_KEY; delete process.env.OPENROUTER_API_KEY;
    set('GROKIFIED_LEDGER_FILE', path.join(tmp, 'g1.json')); set('GONKA_LEDGER_FILE', path.join(tmp, 'g2.json'));
    const w = A.writers({ XKIRO_API_KEY: 'x', GROKIFIED_API_KEY: 'k', GONKA_API_KEY: 'k' }, new Date('2026-11-04T00:00:00Z'));
    ok(w.map((x) => x.model).join('|') === 'minimax/minimax-m3.1-flash|grok-build-0.1|deepseek-ai/DeepSeek-V4-Flash-0731|zai-org/GLM-5.3-Flash', 'writers: MiniMax (free), then grok-build-0.1, Gonka DeepSeek, Gonka GLM');
    const w2 = A.writers({ GROKIFIED_API_KEY: 'k', GONKA_API_KEY: 'k' }, new Date('2026-11-08T00:00:00Z'));
    ok(w2[0].model === 'grok-build-0.1' && w2.length === 3, 'writers: grok-build-0.1 first once the MiniMax grant has expired');
    const models = [];
    const mock = async (url, init) => { const b = JSON.parse(init.body); models.push(b.model); return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ choices: [{ message: { content: '{"verdict":"pass","reasons":[]}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }; };
    require('../services/providers/grokified')._setFetch(mock); require('../services/providers/gonka')._setFetch(mock);
    const task = { id: 'x', goal: 'g', acceptance: 'a', files: ['f.js'] };
    for (const [writer, want] of [[w[0], 'grok-4.3'], [w[1], 'zai-org/GLM-5.3-Flash'], [w[2], 'grok-4.3'], [w[3], 'grok-4.3']]) {
      models.length = 0;
      const rv = await A.review({ writer, task, diff: 'diff' });
      ok(rv.pass && models[0] === want, `review: writer ${writer.model} is reviewed by ${models[0]} (want ${want})`);
      ok(!(writer.family === 'grok' && /grok/.test(models[0])), 'review: never the writer own family');
    }
    require('../services/providers/grokified')._setFetch(null); require('../services/providers/gonka')._setFetch(null);
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `${failures} FAILED` : 'autobuild-test: all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
