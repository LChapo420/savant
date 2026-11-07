/**
 * The background re-check of text stored before the fact guard existed (docs/FACT-COVERAGE.md, open item): generated games, generated practice items and generated
 * lessons in old sessions. It REPORTS and never deletes or changes a stored row: what it finds goes to `fact_recheck_findings` for a person to read, because a check
 * alone is not good enough evidence to remove something (it catches some errors and flags some good text).
 *
 * Switch: FACT_RECHECK=1 (default off). FACT_RECHECK_DAY_USD is the daily cap (default $1), paid from prepaid credits through the ordinary ledgers: the check is a normal
 * services/ai.js call on the background lane, so free slots go first and the learner clearances apply. At the cap the job stops until the next day. When no checker
 * answers it does not move on: the row is read again later, after a wait, and nothing is written about it. Keeps its place in `fact_recheck_state`, one row.
 * The stored text is generated content with no learner's words in it, read with no learner attached (storedContent: the added prepaid providers may read it while their own
 * learner switch and window are open, never a pipeline-only one). After those windows close only what is cleared for learners remains, and the job waits when that is busy.
 * Rows hold no learner id and no learner words: a reference to the stored row, the checker's quote and its reason.
 */
const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require

const FINDINGS = 'fact_recheck_findings';
const STATE = 'fact_recheck_state';
const KINDS = ['game', 'item', 'lesson'];
const on = () => String(process.env.FACT_RECHECK || '0').trim() === '1';
const dayCap = () => { const n = Number(process.env.FACT_RECHECK_DAY_USD); return process.env.FACT_RECHECK_DAY_USD !== undefined && Number.isFinite(n) && n >= 0 ? n : 1; };
const today = () => new Date().toISOString().slice(0, 10);
const BATCH = 5;
const TICK_MS = () => Number(process.env.FACT_RECHECK_TICK_MS || 60000);
const BACKOFF_MS = 15 * 60000;

const has = (s) => typeof s === 'string' && s.trim();

/** The rows of one kind, in a stable order, so the job can keep its place. */
function rows(kind) {
  const db = lazy('../config/db');
  if (kind === 'game') return db.find('game_payloads', (g) => g.payload && Array.isArray(g.payload.questions) && g.payload.questions.length);
  if (kind === 'item') return db.find('items', (i) => i.source === 'ai' && has(i.prompt));
  if (kind === 'lesson') return db.find('lessons', (l) => l.source === 'ai');
  return [];
}

/** The pieces one stored row is read in: each with a reference a person can follow. */
function piecesOf(kind, row) {
  const { renderQuestion } = lazy('./fact-registry');
  if (kind === 'game') {
    const meta = row.payload.meta || {};
    return row.payload.questions.map((q, i) => ({ ref: `question ${q.id || i}`, text: renderQuestion(q), context: `${meta.subject || ''} ${meta.topic || ''}`.trim() }));
  }
  if (kind === 'item') return [{ ref: 'item', text: renderQuestion(row) }];
  const out = [];
  const add = (ref, t) => { if (has(t)) out.push({ ref, text: t }); };
  add('title and intro', [row.title, row.intro].filter(has).join('. '));
  (row.sections || []).forEach((s, i) => add(`section ${i + 1}`, [s.heading, s.body].filter(has).join('. ')));
  const worked = row.worked_example;
  add('worked example', typeof worked === 'string' ? worked : worked ? JSON.stringify(worked) : '');
  add('common mistakes', Array.isArray(row.common_mistakes) ? row.common_mistakes.join(' ') : row.common_mistakes);
  add('summary', Array.isArray(row.summary) ? row.summary.join(' ') : row.summary);
  (row.check_questions || []).forEach((q, i) => add(`check question ${i + 1}`, renderQuestion(q)));
  return out;
}

/** Read one stored row. Writes findings; returns what happened. Never touches the row. `llm` is for tests. */
async function checkRow(kind, row, { llm = null, record = true, budgetMs = 120000 } = {}) {
  const guard = lazy('./fact-guard');
  const pool = lazy('./pool');
  const pieces = piecesOf(kind, row);
  if (!pieces.length) return { ran: true, pieces: 0, findings: [], usd: 0, ms: 0 };
  const source = pieces[0].context ? `Subject and topic: ${pieces[0].context}` : '';
  const v = await pool.runBackground(() => guard.check({ pieces: pieces.map((p) => p.text), source, mode: 'general', dataClass: 'learner', budgetMs, llm, storedContent: true }));
  const findings = (v.wrong || []).map((w) => ({ kind, ref_id: row.id, ref: (pieces[w.index] || {}).ref || '', quote: w.quote || '', why: w.why || '', model: v.model || null, day: today(), status: 'open' }));
  if (v.ran && record) { const db = lazy('../config/db'); findings.forEach((f) => db.insert(FINDINGS, f)); }
  return { ran: v.ran, pieces: pieces.length, findings, usd: v.costUsd || 0, ms: v.ms, model: v.model || null };
}

function state() {
  const db = lazy('../config/db');
  let s = db.findOne(STATE, () => true);
  if (!s) s = db.insert(STATE, { cursor: { game: 0, item: 0, lesson: 0 }, day: today(), day_usd: 0, total_usd: 0, rows_read: 0, findings: 0 });
  return s;
}

/** The next rows nobody has read, one kind at a time so a large one does not starve the others. */
function nextRows(s, n) {
  const out = [];
  for (const kind of KINDS) {
    const after = (s.cursor && s.cursor[kind]) || 0;
    for (const r of rows(kind).filter((x) => x.id > after).sort((a, b) => a.id - b.id).slice(0, n)) out.push({ kind, row: r });
  }
  return out.slice(0, n);
}

/**
 * One round: up to `batch` rows, within today's cap. Returns { state, read, stopped }. `stopped`: 'off' (switch), 'cap', 'no_checker', 'done' or null.
 * A switch-off stops it before anything is read.
 */
async function tick({ batch = BATCH, llm = null, force = false } = {}) {
  if (!on() && !force) return { read: 0, stopped: 'off' };
  const db = lazy('../config/db');
  let s = state();
  if (s.day !== today()) s = db.update(STATE, s.id, { day: today(), day_usd: 0 });
  let read = 0;
  const todo = nextRows(s, batch);
  if (!todo.length) return { read, stopped: 'done', state: s };
  for (const { kind, row } of todo) {
    if ((s.day_usd || 0) >= dayCap()) return { read, stopped: 'cap', state: s };
    const r = await checkRow(kind, row, { llm }); // eslint-disable-line no-await-in-loop
    if (!r.ran) return { read, stopped: 'no_checker', state: s };
    read++;
    s = db.update(STATE, s.id, { cursor: { ...(s.cursor || {}), [kind]: row.id }, day_usd: Number(((s.day_usd || 0) + r.usd).toFixed(6)), total_usd: Number(((s.total_usd || 0) + r.usd).toFixed(6)), rows_read: (s.rows_read || 0) + 1, findings: (s.findings || 0) + r.findings.length });
  }
  return { read, stopped: null, state: s };
}

/** For the owner: where it has got to and what it found, counts by kind. */
function report() {
  const db = lazy('../config/db');
  const s = state();
  const findings = db.find(FINDINGS, () => true);
  const left = {}; const total = {};
  for (const k of KINDS) { const all = rows(k); total[k] = all.length; left[k] = all.filter((r) => r.id > ((s.cursor && s.cursor[k]) || 0)).length; }
  const byKind = {}; for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  return { on: on(), day_cap_usd: dayCap(), day_usd: s.day_usd || 0, total_usd: s.total_usd || 0, rows_read: s.rows_read || 0, total, left, findings: findings.length, findings_by_kind: byKind };
}

let timer = null;
/** Called once at startup. Does nothing unless the switch is on. A round that hits the cap, or finds no checker, waits longer before asking again. */
function start() {
  if (!on() || timer) return;
  let waitUntil = 0;
  let busy = false;
  timer = setInterval(async () => {
    if (busy || Date.now() < waitUntil) return;
    busy = true;
    try {
      const r = await tick();
      if (r.stopped === 'cap' || r.stopped === 'no_checker' || r.stopped === 'done') waitUntil = Date.now() + BACKOFF_MS;
    } catch (err) { console.warn(`fact-recheck: ${err.message}`); waitUntil = Date.now() + BACKOFF_MS; } finally { busy = false; }
  }, TICK_MS());
  if (timer.unref) timer.unref();
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { on, dayCap, rows, piecesOf, checkRow, tick, report, start, stop, FINDINGS, STATE, KINDS };
