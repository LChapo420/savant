/**
 * autobuild: builds the tasks in docs/night/AUTO-QUEUE.md with NO Claude calls (aider on free/cheap models, an independent
 * reviewer from a different model family). See docs/AUTOBUILD.md.
 *
 *   node scripts/autobuild.js [--task=<id>] [--max-tasks=N]       env: AUTOBUILD_MINUTES (default 100)
 *
 * What it may change in the queue: ONLY each task's `Status:` line (open | claimed <date> | done <commit> | blocked <reason>).
 * Task text (goal, acceptance, files, test) is checked byte-for-byte after every write; a mismatch aborts the run.
 * Per task: branch auto/<id> from main in its own worktree, aider (max 3 attempts, failure fed back), gates: task test + full
 * test, scope, no gate weakening, independent review. Pass: commit on auto/<id> (never pushed, never merged) + AUTO-LOG entry.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq';
const ENV_FILE = 'C:/coding/claudecommittdIq/folderThing/.env';
const SEALED = [/^\.env/, /(^|\/)\.env$/, /^data\//, /^docs\/PRODUCT-DECISIONS\.md$/, /^docs\/night\/AUTO-QUEUE\.md$/, /(^|\/)RULES\.md$/,
  /^spanish-check/, /^routes\/spanish-check/, /^public\/spanish-check/, /^public\/spanish-listening/, /^public\/js\/spanish-check/,
  /^public\/js\/spanish-listening/, /^spanish-dictation\//, /^scripts\/autobuild(-test)?\.js$/, /^scripts\/run-tests\.js$/];
const TEST_LIKE = /(^|\/)(scripts\/[^/]*(test|gate|guard|check)[^/]*\.js|scripts\/test-steps\.json|scripts\/run-tests\.js|scripts\/lib\/[^/]*gate[^/]*\.js)$/;
const NEW_TEST_OK = /^scripts\/[A-Za-z0-9._-]*-test\.js$/;

// ---------- queue: parse and status-only writes ----------
const STATUS_RE = /^Status:[ \t]*(.*)$/m;
function parseQueue(text) {
  const parts = text.split(/^(?=## TASK )/m).slice(1);
  return parts.map((p) => {
    const id = (p.match(/^## TASK ([A-Za-z0-9_.-]+)/) || [])[1];
    const field = (name) => { const m = p.match(new RegExp(`^${name}:[ \\t]*([\\s\\S]*?)(?=^[A-Za-z]+:|^## TASK |$(?![\\s\\S]))`, 'm')); return m ? m[1].trim() : ''; };
    const files = field('Files').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return { id, goal: field('Goal'), acceptance: field('Acceptance'), files, test: field('Test'), status: (p.match(STATUS_RE) || [, ''])[1].trim() };
  }).filter((t) => t.id);
}
/** The queue with every Status value blanked: what must never change. */
const frozen = (text) => text.replace(/^(Status:)[ \t]*.*$/gm, '$1');
function setStatus(file, id, status) {
  const before = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`(^## TASK ${id.replace(/[.]/g, '\\.')}\\b[\\s\\S]*?^Status:)[ \\t]*.*$`, 'm');
  if (!re.test(before)) throw new Error(`queue: no Status line for ${id}`);
  const after = before.replace(re, (m, a) => `${a} ${String(status).replace(/[\r\n]+/g, ' ').slice(0, 200)}`);
  if (frozen(after) !== frozen(before)) throw new Error('queue: a status write would change task text; refusing');
  fs.writeFileSync(file, after);
}

// ---------- lock ----------
function takeLock(file, ttlMs) {
  try {
    const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
    let alive = true;
    try { process.kill(cur.pid, 0); } catch (e) { alive = e.code === 'EPERM'; }
    if (alive && Date.now() - cur.at < ttlMs) return false;
  } catch (e) { /* none or unreadable: take it */ }
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() }));
  return true;
}
const dropLock = (file) => { try { fs.unlinkSync(file); } catch (e) { /* gone */ } };

// ---------- process helpers ----------
function sh(cmd, cwd, timeoutMs = 20 * 60 * 1000, env = process.env) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, env, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}
const git = (cwd, args) => sh(`git ${args}`, cwd, 120000);
const tail = (s, n = 2500) => (s.length > n ? `...${s.slice(-n)}` : s);

// ---------- gates 2 and 3 (pure, tested) ----------
function changedFiles(cwd) {
  const out = git(cwd, 'status --porcelain --untracked-files=all').out;
  return out.split(/\r?\n/).filter(Boolean).map((l) => ({ st: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '').replace(/ -> .*$/, '') })).filter((c) => !/^\.aider/.test(c.file));
}
function scopeGate(changes, allowed) {
  const bad = [];
  for (const { st, file } of changes) {
    if (/^node_modules(\/|$)/.test(file)) continue;
    const sealed = SEALED.some((re) => re.test(file));
    const inScope = allowed.includes(file);
    const newTest = st.trim() === '??' && NEW_TEST_OK.test(file);
    if (sealed && !inScope) bad.push(`${file} (sealed)`);
    else if (sealed && inScope && /^(\.env|data\/|docs\/PRODUCT-DECISIONS|docs\/night\/AUTO-QUEUE|.*RULES\.md)/.test(file)) bad.push(`${file} (sealed)`);
    else if (!inScope && !newTest) bad.push(`${file} (out of scope)`);
  }
  return bad;
}
const nums = (s) => (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
/** Looks at a unified diff of test-like files for deleted/loosened assertions, skips, lower thresholds. */
function weakeningGate(diffText) {
  const problems = [];
  let file = null;
  const removed = []; const added = [];
  const flush = () => {
    if (file && TEST_LIKE.test(file)) {
      const addedSet = new Set(added.map((l) => l.trim()));
      for (const r of removed) {
        const t = r.trim();
        if (!t || addedSet.has(t)) continue;
        if (/\b(assert|expect|ok\(|check\(|fail\(|equal|throws|strictEqual|deepEqual|process\.exit\(1\))/.test(t) || (file.endsWith('test-steps.json') && /"/.test(t))) {
          // a removed assertion is fine only when a changed line of the same shape was added
          const shape = t.replace(/\d+(?:\.\d+)?/g, '#').replace(/["'`][^"'`]*["'`]/g, 'S');
          const twin = added.find((a) => a.replace(/\d+(?:\.\d+)?/g, '#').replace(/["'`][^"'`]*["'`]/g, 'S').trim() === shape);
          if (!twin) problems.push(`${file}: removed check "${t.slice(0, 90)}"`);
          else if (/(>=?|<=?|min|max|threshold|floor|ceil|limit|least|most)/i.test(t)) {
            const a = nums(t); const b = nums(twin);
            const gt = /(>=?|min|floor|least)/i.test(t) && !/<=?/.test(t);
            if (a.length === b.length && a.some((x, i) => (gt ? b[i] < x : b[i] > x))) problems.push(`${file}: loosened threshold "${t.slice(0, 90)}" -> "${twin.trim().slice(0, 60)}"`);
          }
        }
      }
      for (const a of added) if (/\.skip\(|\bxit\(|\bxdescribe\(|process\.exit\(0\)\s*;?\s*\/\/\s*skip|\|\|\s*true\b.*assert|--no-gate|SKIP_GATE/.test(a)) problems.push(`${file}: added skip "${a.trim().slice(0, 90)}"`);
    }
    removed.length = 0; added.length = 0;
  };
  for (const line of diffText.split(/\r?\n/)) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) { flush(); file = m[1]; continue; }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;
    if (line.startsWith('-')) removed.push(line.slice(1));
    else if (line.startsWith('+')) added.push(line.slice(1));
  }
  flush();
  return problems;
}

// ---------- models ----------
const FAMILY = { xkiro: 'minimax', munito: 'deepseek', nvidia: 'nemotron' };
function writers(env, now = new Date()) {
  const list = [];
  if (env.XKIRO_API_KEY && now < new Date('2026-11-07T00:00:00Z')) list.push({ key: 'xkiro', family: FAMILY.xkiro, model: 'minimax/minimax-m3.1-flash', base: env.XKIRO_BASE_URL || 'https://api.xkiro.com/v1', apiKey: env.XKIRO_API_KEY, paid: false });
  // Coral DeepSeek V4.1 Flash Standard: no provider in this repo yet; add here when one exists.
  if (env.MUNITO_API_KEY) list.push({ key: 'munito', family: FAMILY.munito, model: 'deepseek-ai/deepseek-v4.1-flash-1017', base: require('../services/providers/munito').baseUrl(env.MUNITO_BASE_URL), apiKey: env.MUNITO_API_KEY, paid: true });
  if (env.NVIDIA_API_KEY) list.push({ key: 'nvidia', family: FAMILY.nvidia, model: 'nvidia/nemotron-3-ultra-550b-a55b', base: (env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, ''), apiKey: env.NVIDIA_API_KEY, paid: false });
  return list;
}
function runAider(w, cwd, msgFile, files, timeoutMs, env) {
  const e = { ...env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', TERM: 'dumb', NO_COLOR: '1' };
  const args = ['--model', `openai/${w.model}`, '--openai-api-base', w.base, '--openai-api-key', w.apiKey, '--yes-always', '--no-auto-commits', '--no-show-model-warnings',
    '--no-check-update', '--no-gitignore', '--map-tokens', '1024', '--model-settings-file', 'C:/coding/savant-wt/_tools/aider-models.yml', '--edit-format', 'diff', '--no-pretty',
    '--no-stream', '--timeout', '600', '--message-file', msgFile, ...files];
  const r = spawnSync('aider', args, { cwd, env: e, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', shell: true, timeout: Math.max(60000, timeoutMs) });
  const out = `${r.stdout || ''}${r.stderr || ''}`.split(w.apiKey).join('<key>');
  fs.writeFileSync(msgFile.replace(/\.md$/, '-aider.log'), out);
  const k = (s) => (/k$/i.test(s) ? parseFloat(s) * 1000 : parseFloat(s)) || 0;
  const m = out.match(/Tokens:\s*([\d.,]+k?) sent,\s*([\d.,]+k?) received/i);
  const tokens = m ? { input_tokens: k(m[1].replace(/,/g, '')), output_tokens: k(m[2].replace(/,/g, '')) } : { input_tokens: 0, output_tokens: 0 };
  let costUsd = 0;
  if (w.paid && w.key === 'munito') {
    try {
      const L = require('../services/munito-ledger');
      costUsd = L.costOf(w.model, tokens);
      const id = L.reserve({ usd: costUsd, task: 'autobuild', model: w.model });
      L.settle(id, { usd: costUsd, usage: tokens });
    } catch (err) { /* ledger refusal: cost still reported */ }
  }
  return { ok: r.status === 0, costUsd, tokens, log: out };
}

/** Independent review: a model of a different family than the writer. Returns { pass, reasons, model, costUsd }. */
async function review({ writer, task, diff }) {
  const system = 'You are a strict, independent code reviewer. Reply with one JSON object only: {"verdict":"pass"|"fail","reasons":["..."]}.';
  const user = `TASK ${task.id}\nGOAL: ${task.goal}\nACCEPTANCE CRITERIA (every one must be met):\n${task.acceptance}\nFILES IN SCOPE: ${task.files.join(', ')}\n\n`
    + `Judge the diff below. Fail if any acceptance criterion is unmet, if tests or gates were weakened or skipped, if anything out of scope changed, or if code/docs claim a number, citation or fact `
    + `that is not traceable to a file in the repo (or marked ASSUMED). Pass only if you can find no such problem.\n\nDIFF:\n${diff.slice(0, 60000)}`;
  const order = [];
  if (writer.family !== FAMILY.munito && process.env.MUNITO_API_KEY) order.push('munito');
  if (writer.family !== FAMILY.nvidia && process.env.NVIDIA_API_KEY) order.push('nvidia');
  let lastErr = 'no reviewer of another model family is configured';
  for (const which of order) {
    try {
      let r;
      if (which === 'munito') {
        process.env.MUNITO_PIPELINE = '1';
        r = await require('../services/providers/munito').munito.chat({ task: 'autobuild-review', system, messages: [{ role: 'user', content: user }], maxTokens: 1500, effort: null });
        r = { text: r.text, model: r.model, costUsd: r.usage.cost_usd || 0 };
      } else {
        const n = require('../services/providers/nvidia');
        const c = await n.chat({ role: 'fast', task: 'autobuild-review', model: 'nvidia/nemotron-3-ultra-550b-a55b', system, messages: [{ role: 'user', content: user }], maxTokens: 1500 });
        if (!c || !c.text) throw new Error('nvidia gave no text');
        r = { text: c.text, model: 'nvidia/nemotron-3-ultra-550b-a55b', costUsd: 0 };
      }
      return { ...parseVerdict(r.text), model: r.model, costUsd: r.costUsd };
    } catch (err) { lastErr = `${which}: ${err.message}`; }
  }
  return { pass: false, reasons: [`reviewer unavailable (fail closed): ${lastErr}`], model: null, costUsd: 0 };
}
function parseVerdict(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : text);
    return { pass: j.verdict === 'pass', reasons: Array.isArray(j.reasons) ? j.reasons.map(String) : [String(j.reasons || '')] };
  } catch (e) { return { pass: false, reasons: ['reviewer reply was not a valid verdict (fail closed)'] }; }
}

// ---------- the run ----------
function defaultDeps() {
  return { runAider, review, sh };
}
function ensureWorktree(opts, id) {
  const dir = path.join(opts.wtRoot, `auto-${id}`);
  if (!fs.existsSync(dir)) {
    const r = git(opts.repo, `worktree add -B auto/${id} "${dir}" ${opts.base}`);
    if (!r.ok) throw new Error(`worktree: ${tail(r.out, 300)}`);
  } else git(dir, `reset --hard ${opts.base}`);
  if (opts.link !== false) {
    const nm = path.join(dir, 'node_modules');
    if (!fs.existsSync(nm)) { try { fs.symlinkSync(path.join(opts.repo, 'node_modules'), nm, 'junction'); } catch (e) { /* tests without deps */ } }
    const db = path.join(dir, 'data', 'db.json');
    const src = path.join(opts.repo, 'data', 'db.json');
    if (!fs.existsSync(db) && fs.existsSync(src)) { fs.mkdirSync(path.dirname(db), { recursive: true }); fs.copyFileSync(src, db); }
  }
  return dir;
}

async function buildTask(opts, deps, task, deadline) {
  const dir = ensureWorktree(opts, task.id);
  const ws = opts.writers;
  const started = Date.now();
  let cost = 0; let lastFail = ''; let usedModel = 'none'; let reviewerModel = '-'; const gateNotes = [];
  const dbCopy = path.join(dir, 'data', 'db.json');
  const env = { ...opts.env, DB_FILE: fs.existsSync(dbCopy) ? dbCopy : (opts.env.DB_FILE || ''), STANDARD_COMPUTE_LEDGER_FILE: '', };
  let attempt = 0; let skipped = 0;
  while (attempt < opts.attempts) {
    attempt++;
    if (Date.now() > deadline) return { blocked: 'time budget used up', cost, model: usedModel, started };
    const w = ws[(attempt - 1 + skipped) % ws.length];
    usedModel = `${w.model} (${w.key})`;
    const msg = path.join(opts.tmp, `autobuild-${task.id}-${attempt}.md`);
    fs.writeFileSync(msg, `Task ${task.id}. Goal this serves: ${task.goal}\n\nAcceptance criteria (all must be met, change nothing else):\n${task.acceptance}\n\n`
      + `Edit only these files (you may add new scripts/*-test.js files): ${task.files.join(', ')}\nTest that must pass: ${task.test}\n`
      + 'Never weaken, delete or skip any test, assertion or threshold. Never invent numbers or citations; mark any assumption ASSUMED.\n'
      + (lastFail ? `\nYour previous attempt failed this gate, fix it:\n${lastFail}\n` : ''));
    const existing = task.files.filter((f) => fs.existsSync(path.join(dir, f)));
    const a = deps.runAider(w, dir, msg, existing.length ? existing : task.files, deadline - Date.now(), env);
    cost += a.costUsd || 0;
    // gate 2: scope
    const changes = changedFiles(dir).filter((c) => !/^node_modules/.test(c.file) && !/^data\//.test(c.file));
    if (!changes.length && /capacity limit|overloaded|ServiceUnavailable|APIConnectionError|AuthenticationError|RateLimitError|Invalid API key/i.test(a.log || '') && skipped < ws.length) {
      skipped++; attempt--; gateNotes.push(`${w.key}: provider unavailable, next model`); continue;
    }
    if (!changes.length) { lastFail = 'No files changed.'; gateNotes.push(`a${attempt}: no change`); continue; }
    const scope = scopeGate(changes, task.files);
    if (scope.length) { lastFail = `SCOPE gate: ${scope.join('; ')}. Revert those and touch only the listed files.`; gateNotes.push(`a${attempt}: scope`); git(dir, 'checkout -- .'); continue; }
    // gate 3: no weakening (tracked diff)
    git(dir, 'add -N .');
    const diff = git(dir, 'diff HEAD').out;
    const weak = weakeningGate(diff);
    if (weak.length) { lastFail = `NO-WEAKENING gate: ${weak.join('; ')}`; gateNotes.push(`a${attempt}: weakening`); git(dir, 'checkout -- .'); git(dir, 'clean -fdq -- scripts'); continue; }
    // gate 1: task test, then full test
    const t1 = deps.sh(task.test, dir, 30 * 60 * 1000, env);
    if (!t1.ok) { lastFail = `TASK TEST failed (${task.test}):\n${tail(t1.out)}`; gateNotes.push(`a${attempt}: task test`); continue; }
    const t2 = deps.sh(opts.fullTest, dir, 90 * 60 * 1000, env);
    if (!t2.ok) { lastFail = `FULL TEST failed (${opts.fullTest}):\n${tail(t2.out)}`; gateNotes.push(`a${attempt}: full test`); continue; }
    // the tests may have regenerated tracked files out of scope: refuse
    const after = scopeGate(changedFiles(dir).filter((c) => !/^node_modules/.test(c.file) && !/^data\//.test(c.file)), task.files.concat(opts.regenerated || []));
    if (after.length) { lastFail = `SCOPE gate after tests: ${after.join('; ')}`; gateNotes.push(`a${attempt}: scope-after`); continue; }
    // gate 4: independent review
    const rv = await deps.review({ writer: w, task, diff: git(dir, 'diff HEAD').out });
    cost += rv.costUsd || 0; reviewerModel = rv.model || '-';
    if (!rv.pass) { lastFail = `REVIEW failed (${rv.model}): ${rv.reasons.join(' | ')}`; gateNotes.push(`a${attempt}: review`); continue; }
    git(dir, 'add -A');
    const m = path.join(opts.tmp, `autobuild-${task.id}-commit.txt`);
    fs.writeFileSync(m, `autobuild ${task.id}: ${task.goal.slice(0, 90)}\n\nBuilt by autobuild (${usedModel}); reviewed by ${reviewerModel}.\n`);
    const c = git(dir, `-c user.name=autobuild -c user.email=autobuild@localhost commit -q -F "${m}"`);
    if (!c.ok) return { blocked: `commit failed: ${tail(c.out, 150)}`, cost, model: usedModel, started };
    const hash = git(dir, 'rev-parse --short HEAD').out.trim();
    return { done: hash, cost, model: usedModel, reviewer: reviewerModel, attempts: attempt, notes: gateNotes, started };
  }
  return { blocked: `3 attempts failed; last: ${lastFail.replace(/\s+/g, ' ').slice(0, 120)}`, cost, model: usedModel, notes: gateNotes, started };
}

function logEntry(file, task, branch, r) {
  const mins = ((Date.now() - r.started) / 60000).toFixed(1);
  const gates = r.done ? 'task test, full test, scope, no-weakening, independent review all passed' : `gates: ${(r.notes || []).join(', ') || 'n/a'}`;
  const body = r.done
    ? `**${task.id}** on \`${branch}\`, commit ${r.done}: ${gates}. Writer ${r.model}, reviewer ${r.reviewer}, ${r.attempts} attempt(s), cost $${r.cost.toFixed(4)}, ${mins} min.`
    : `**${task.id}** on \`${branch}\` BLOCKED (${r.blocked}). ${gates}. Last writer ${r.model}, cost $${r.cost.toFixed(4)}, ${mins} min.`;
  fs.appendFileSync(file, `\n- ${new Date().toISOString()} ${body}\n`);
}

async function run(userOpts = {}, userDeps = {}) {
  const deps = { ...defaultDeps(), ...userDeps };
  const opts = {
    repo: ROOT, base: 'main', queue: path.join(ROOT, 'docs/night/AUTO-QUEUE.md'), log: path.join(ROOT, 'docs/night/AUTO-LOG.md'),
    wtRoot: path.dirname(ROOT), tmp: os.tmpdir(), lock: path.join(os.tmpdir(), 'savant-autobuild.lock'), minutes: Number(process.env.AUTOBUILD_MINUTES) || 100,
    attempts: 3, fullTest: 'npm test', env: process.env, writers: null, only: null, maxTasks: 99, ...userOpts,
  };
  if (!takeLock(opts.lock, (opts.minutes + 30) * 60000)) return { ran: false, reason: 'another run holds the lock' };
  const results = [];
  try {
    const deadline = Date.now() + opts.minutes * 60000;
    if (!opts.writers) opts.writers = writers(opts.env);
    if (!opts.writers.length) throw new Error('no writer model is configured');
    for (let n = 0; n < opts.maxTasks && Date.now() < deadline; n++) {
      const task = parseQueue(fs.readFileSync(opts.queue, 'utf8')).find((t) => t.status === 'open' && (!opts.only || t.id === opts.only));
      if (!task) break;
      setStatus(opts.queue, task.id, `claimed ${new Date().toISOString().slice(0, 10)}`);
      let r;
      try { r = await buildTask(opts, deps, task, deadline); } catch (err) { r = { blocked: `error: ${err.message.slice(0, 150)}`, cost: 0, model: 'n/a', started: Date.now() }; }
      setStatus(opts.queue, task.id, r.done ? `done ${r.done}` : `blocked ${r.blocked}`);
      logEntry(opts.log, task, `auto/${task.id}`, r);
      results.push({ id: task.id, ...r });
      if (opts.only) break;
    }
    return { ran: true, results };
  } finally { dropLock(opts.lock); }
}

function loadEnv() {
  const base = { ...process.env };
  try {
    const parsed = require('dotenv').parse(fs.readFileSync(ENV_FILE));
    Object.assign(base, parsed);
  } catch (e) { /* no .env: free paths only */ }
  base.XKIRO_PIPELINE = '1'; base.MUNITO_PIPELINE = '1';
  base.MUNITO_LEDGER_FILE = base.MUNITO_LEDGER_FILE || `${LIVE}/data/munito-ledger.json`;
  return base;
}

if (require.main === module) {
  const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
  const env = loadEnv();
  Object.assign(process.env, env); // provider modules read process.env
  run({ env, only: arg('task'), maxTasks: Number(arg('max-tasks')) || 99 }).then((r) => {
    console.log(JSON.stringify(r, (k, v) => (k === 'log' ? undefined : v), 2));
    process.exit(0);
  }).catch((e) => { console.error(`autobuild: ${e.message}`); process.exit(1); });
}

module.exports = { parseQueue, setStatus, frozen, scopeGate, weakeningGate, takeLock, dropLock, parseVerdict, writers, run, changedFiles };
