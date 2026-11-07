/**
 * Shared pieces of the fact-gate measurement (brief fact-gate, 6 Nov 2026). Not part of npm test, not loaded by the app.
 * Env: live ledgers (never another copy), pipeline opt-ins, a process run cap. Levels come from a COPY of the database (DB_FILE) and the
 * Algebra 1 export; nothing here writes to any live data.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV }); } catch { /* environment */ } }
const LIVE_DIR = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['CORAL', 'GONKA', 'GROKIFIED', 'LYCEUM', 'MUNITO', 'ZEROGPU']) {
  if (!process.env[`${n}_LEDGER_FILE`]) process.env[`${n}_LEDGER_FILE`] = `${LIVE_DIR}/${n.toLowerCase()}-ledger.json`;
  process.env[`${n}_PIPELINE`] = '1';
}
process.env.CROUTON_PIPELINE = '1';
process.env.NVIDIA_PIPELINE = '1';
process.env.XKIRO_PIPELINE = '1';
if (!process.env.ANTHROPIC_LEDGER_FILE) process.env.ANTHROPIC_LEDGER_FILE = `${LIVE_DIR}/anthropic-ledger.json`;
if (!process.env.CROUTON_COUNTER_FILE) process.env.CROUTON_COUNTER_FILE = `${LIVE_DIR}/crouton-counter.json`;
require('../../services/run-cap').defaultCap(5);

const TMP = process.env.FACT_GATE_TMP || 'C:/Users/admin/AppData/Local/Temp/fact-gate';
const DB = process.env.DB_FILE || path.join(TMP, 'db-copy.json');
const DOCS = path.join(__dirname, '..', '..', 'docs', 'fact-gate');
const ALGEBRA = path.join(__dirname, '..', '..', 'docs', 'instant-layer', 'base-algebra-1-part-a-6-new-levels-pool-gate-then-sonnet.export.json');

const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));
const appendJsonl = (f, v) => fs.appendFileSync(f, `${JSON.stringify(v)}\n`);
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/** A plan as the verifier sees it: blocks by their stored index, checks by position. */
function normalize(p, source) {
  return {
    id: `${p.track_id}/${p.grade_id}/${p.level}`,
    source,
    track: p.track_id,
    grade: p.grade_id,
    level: p.level,
    kind: p.kind,
    verification: p.verification ? { status: p.verification.status, model: p.verification.model, rounds: p.verification.rounds } : null,
    check_tier: p.check_tier || null,
    blocks: (p.blocks || []).map((b, k) => ({ index: b.index ?? k, block: b.block, data: b.data })),
    checks: (p.checks || []).map((c, i) => ({
      index: i, format: c.format, prompt: c.prompt, fen: c.fen, frames: c.frames, options: c.options, choices: c.choices, answer: c.answer, rationale: c.rationale, hint: c.hint, accepts: c.accepts,
    })),
  };
}

/** Every written shared level we can read: the database copy (read-only) and the 12 exported Algebra 1 levels. */
function loadLevels({ includeAlgebra = true } = {}) {
  const db = readJson(DB);
  const shared = db.block_plans.filter((p) => !p.user_id && p.status === 'ready' && (p.blocks || []).length).map((p) => normalize(p, 'db'));
  if (!includeAlgebra) return shared;
  const al = readJson(ALGEBRA).plans.map((p) => normalize(p, 'algebra-export'));
  return [...shared, ...al];
}

const contextOf = (lv) => `Subject: ${lv.track}, grade ${lv.grade}, level ${lv.level}.`;

/** The text of one part. `part` is {word:'block'|'check', index}. */
const partText = (lv, word, index) => {
  if (word === 'block') { const b = lv.blocks.find((x) => x.index === index); return b ? JSON.stringify(b.data) : null; }
  const c = lv.checks.find((x) => x.index === index); return c ? JSON.stringify(c) : null;
};

/** The level with edits applied (a deep copy). Throws when an original is not found exactly once. */
function applyEdits(lv, edits) {
  const out = JSON.parse(JSON.stringify(lv));
  for (const e of edits) {
    const [word, idx] = [e.word, Number(e.index)];
    const coll = word === 'block' ? out.blocks : out.checks;
    const at = coll.findIndex((x) => x.index === idx);
    if (at < 0) throw new Error(`no ${word} ${idx}`);
    const obj = word === 'block' ? coll[at].data : coll[at];
    if (e.set) { Object.assign(obj, e.set); continue; } // field set on a check
    if (e.path !== undefined) { const ks = String(e.path).split('.'); let o = obj; for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = e.value; continue; } // a key moved in a block
    const text = JSON.stringify(obj);
    const first = text.indexOf(e.original);
    if (first < 0) throw new Error(`not found: ${e.original}`);
    if (!e.allowMany && text.indexOf(e.original, first + 1) >= 0) throw new Error(`more than once: ${e.original}`);
    const changed = e.allowMany ? text.split(e.original).join(e.wrong) : text.replace(e.original, () => e.wrong);
    const parsed = JSON.parse(changed);
    if (word === 'block') coll[at].data = parsed; else coll[at] = parsed;
  }
  return out;
}

/** Wilson 95% interval, as [low, high] of a proportion. */
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96; const p = k / n; const d = 1 + z * z / n; const c = p + z * z / (2 * n); const r = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - r) / d), Math.min(1, (c + r) / d)];
}
const pct = (x) => `${(100 * x).toFixed(0)}%`;
const fmtRate = (k, n) => { const [l, h] = wilson(k, n); return `${k}/${n} = ${n ? pct(k / n) : '-'} (${pct(l)}-${pct(h)})`; };

/** Run fn over items, `par` at a time; a thrown item is passed to onError. Keeps going past failures. */
async function runPool(items, par, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(par, items.length) || 1 }, async () => {
    while (next < items.length) { const k = next++; await fn(items[k], k); } // eslint-disable-line no-await-in-loop
  }));
}

module.exports = { fs, path, TMP, DB, DOCS, LIVE_DIR, hash, sleep, readJson, writeJson, appendJsonl, readJsonl, normalize, loadLevels, contextOf, partText, applyEdits, wilson, pct, fmtRate, runPool };
