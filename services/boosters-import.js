/**
 * Optional import of past results (services/boosters.js): figures the learner types (ACT composite, SAT or PSAT total, grade average) and a
 * review-history CSV of the kind a flashcard program can export (a row per review: which card, how long since it was last seen, whether it was
 * remembered). The figures become prior knowledge, as a designed test at the weight of a self-reported number (scorecard/signals.js
 * fromImportedResults); the history becomes memory tests for the forgetting model (fromDelayedCheck's rows). Nothing is uploaded to a server
 * file store: the browser reads a chosen file and posts its text, which is parsed here and not kept (only the counts are).
 *
 * The history format, one review per line, with a header row naming the columns it has (any order, comma, tab or semicolon):
 *   card (optional)       an id for the card; reviews of one card are read in order, so earlier right and wrong counts are known
 *   interval_days         days since the card was last seen before this review (Anki: the interval of the previous review)
 *   correct               1, 0, true, false, yes, no, right, wrong; or ease (1 = again, 2 to 4 = remembered) in its place
 * A quiz or card app that exports terms and definitions only (Quizlet's export) holds no history: there is nothing to import from it.
 */
const boosters = require('./boosters');

const MAX_CHARS = 400 * 1024;
const MAX_ROWS = 20000;
const KEEP_TESTS = 150;

const num = (v) => { const n = Number(String(v).trim().replace(',', '.')); return Number.isFinite(n) ? n : null; };
const yes = (v) => /^(1|true|yes|y|right|correct|remembered)$/i.test(String(v).trim());
const no = (v) => /^(0|false|no|n|wrong|incorrect|forgot|forgotten)$/i.test(String(v).trim());

/** The history's reviews as memory tests: [{ dt, nc, nw, pk, g, right }], at most the last KEEP_TESTS with an interval of a day or more. */
function parseHistory(text) {
  const raw = String(text || '').slice(0, MAX_CHARS);
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, MAX_ROWS + 1);
  if (lines.length < 2) return { tests: [], rows: 0, error: 'The file needs a header row and at least one review.' };
  const sep = [',', '\t', ';'].map((s) => [s, lines[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const at = (...names) => head.findIndex((h) => names.includes(h));
  const iCard = at('card', 'cardid', 'card_id', 'id');
  const iInt = at('interval_days', 'interval', 'days', 'lastinterval', 'last_interval');
  const iOk = at('correct', 'result', 'remembered', 'right');
  const iEase = at('ease', 'rating', 'button');
  if (iInt < 0 || (iOk < 0 && iEase < 0)) return { tests: [], rows: 0, error: 'The header must name the interval (interval_days) and the result (correct, or ease).' };
  const seen = new Map();
  const tests = [];
  let rows = 0;
  for (const line of lines.slice(1)) {
    const c = line.split(sep);
    const interval = num(c[iInt]);
    let ok = null;
    if (iOk >= 0) ok = yes(c[iOk]) ? true : no(c[iOk]) ? false : null;
    else { const e = num(c[iEase]); ok = e === null ? null : e >= 2; }
    if (interval === null || ok === null) continue;
    rows++;
    const key = iCard >= 0 ? String(c[iCard]).trim() : '_';
    const prior = seen.get(key) || { nc: 0, nw: 0 };
    if (interval >= 1 && interval <= 3650) tests.push({ dt: interval, nc: iCard >= 0 ? prior.nc : 1, nw: iCard >= 0 ? prior.nw : 0, pk: 0.9, g: 0.1, right: ok });
    seen.set(key, { nc: prior.nc + (ok ? 1 : 0), nw: prior.nw + (ok ? 0 : 1) });
  }
  return { tests: tests.slice(-KEEP_TESTS), rows };
}

/** body: { act_composite, sat_total, psat_total, gpa, history_csv }. Returns { ok, kinds } or { error, code }. */
function importResults(user, body) {
  if (!boosters.allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
  const b = body || {};
  const results = {};
  const kinds = [];
  const take = (key, lo, hi, label) => {
    if (b[key] === undefined || b[key] === null || b[key] === '') return null;
    const v = num(b[key]);
    if (v === null || v < lo || v > hi) return `${label} must be between ${lo} and ${hi}.`;
    results[key] = v;
    kinds.push(key);
    return null;
  };
  const errs = [take('act_composite', 1, 36, 'The ACT composite'), take('sat_total', 400, 1600, 'The SAT total'), take('psat_total', 320, 1520, 'The PSAT total'), take('gpa', 0, 4.5, 'The grade average (a 0 to 4 scale)')].filter(Boolean);
  if (errs.length) return { error: errs[0], code: 'bad_value' };
  let tests = [];
  let rows = 0;
  if (b.history_csv) {
    const h = parseHistory(b.history_csv);
    if (h.error) return { error: h.error, code: 'bad_file' };
    tests = h.tests;
    rows = h.rows;
    if (tests.length) kinds.push('review_history');
  }
  if (!kinds.length) return { error: 'Type at least one result, or choose a review-history file.', code: 'empty' };
  // eslint-disable-next-line global-require
  const hooks = require('./scorecard/hooks');
  try { hooks.onImportedResults(user.id, results, tests); } catch (err) { console.warn(`boosters: import not applied: ${err.message}`); return { error: 'The results could not be saved.', code: 'failed' }; }
  boosters.put(user.id, { imports: { at: new Date().toISOString(), kinds, review_rows: rows, memory_tests: tests.length } });
  return { ok: true, kinds, memory_tests: tests.length, review_rows: rows };
}

module.exports = { importResults, parseHistory };
