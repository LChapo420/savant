/**
 * Held-back questions: a per-learner exclusion in item selection.
 *
 * data/holdout.json is { "<userId>": [itemId, ...] }. An item id names a question
 * kept in data/spanish-run/items.json (scripts/spanish-run.js builds both). While
 * that learner's request is running, the bank (content/bank.js) will not hand them
 * a question that matches one of those ids; it draws another. Everyone else is
 * unaffected: with no entry for the learner, runAs() just calls the handler.
 *
 * Why: an honest before-and-after needs test questions the learner has never been
 * practised on. The first use is the founder's Spanish run (curriculum-build/SPANISH-RUN.md).
 *
 * What counts as the same question
 *   exact   same prompt and same answer (the options are ignored: a multiple-choice
 *           question with other distractors is still that question)
 *   target  for skills whose answer IS the thing being tested (a number word, a
 *           conjugated form, a vocabulary word): same skill and same answer, in
 *           any wording of the prompt
 * Not covered, by design: AI-written lesson text, and the same word asked in the
 * other direction (Spanish to English vs English to Spanish).
 */
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

const dataDir = () => process.env.HOLDOUT_DIR || path.join(__dirname, '..', 'data');
const holdoutFile = () => path.join(dataDir(), 'holdout.json');
const itemsFile = () => path.join(dataDir(), 'spanish-run', 'items.json');

const norm = (s) => String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const exactKey = (prompt, answer) => `${norm(prompt)}||${norm(answer)}`;
const targetKey = (skill, answer) => `${skill}||${norm(answer)}`;
/** A short answer ("a", "an", "tú") is not a target: blocking it would empty the skill. */
const targetable = (skill, answer) => TARGET_SKILLS.has(skill) && /^\S{4,}$/.test(norm(answer));

/** Skills whose answer is the target word itself, so the wording of the prompt does not matter. */
const TARGET_SKILLS = new Set(['es_numbers', 'es_vocab_core', 'es_present_ar', 'es_present_erir']);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

// One cache, checked at most every two seconds, so a request costs nothing when the files have not changed.
let cache = { at: 0, sig: '', byUser: new Map() };
function load() {
  const now = Date.now();
  if (now - cache.at < 2000) return cache.byUser;
  let sig = '';
  try { sig = `${fs.statSync(holdoutFile()).mtimeMs}|${fs.statSync(itemsFile()).mtimeMs}`; } catch (e) { sig = 'none'; }
  if (sig === cache.sig) { cache.at = now; return cache.byUser; }
  const byUser = new Map();
  const held = readJson(holdoutFile()) || {};
  const items = (readJson(itemsFile()) || {}).items || {};
  for (const [userId, ids] of Object.entries(held)) {
    const exact = new Set();
    const target = new Set();
    for (const id of Array.isArray(ids) ? ids : []) {
      const it = items[id];
      if (!it) continue;
      exact.add(exactKey(it.prompt, it.answer));
      if (targetable(it.skill_id, it.answer)) target.add(targetKey(it.skill_id, it.answer));
    }
    if (exact.size) byUser.set(String(userId), { exact, target });
  }
  cache = { at: now, sig, byUser };
  return byUser;
}

/** Run `fn` with this learner's held-back questions in force. A no-op for anyone without any. */
function runAs(userId, fn) {
  const mine = userId == null ? null : load().get(String(userId));
  return mine ? als.run(mine, fn) : fn();
}

/** Is this item one the current learner must not be shown? */
function isBlocked(item) {
  const store = als.getStore();
  if (!store || !item) return false;
  if (store.exact.has(exactKey(item.prompt, item.answer))) return true;
  return store.target.size > 0 && store.target.has(targetKey(item.skill_id, item.answer));
}

/** Test hook: forget what was read. */
function reset() { cache = { at: 0, sig: '', byUser: new Map() }; }

module.exports = { runAs, isBlocked, exactKey, targetKey, targetable, norm, TARGET_SKILLS, reset, holdoutFile, itemsFile };
