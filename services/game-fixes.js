/**
 * Shipped fixes to stored shared game sets (content/game-fixes/*.json), applied to the data file at start-up.
 *
 * The data file is not in the repository (it holds accounts), so a fix to a stored shared set travels as data:
 * a list of exact edits that each check what they expect to find. Applying is idempotent and never overwrites
 * anything it did not expect:
 *
 *   rekeys   {level, qid, from, to}        the key moves from `from` to `to`; skipped when the key is already `to`, and
 *                                          left alone (reported as a conflict) when it is neither
 *   rewrites {level, qid, old_prompt, question}
 *                                          the question is replaced by the rewritten one (a blind-re-solved, code-checked
 *                                          question); skipped when it is already there, left alone when the stored prompt
 *                                          is neither the old nor the new one
 *   release  {level, hash}                 the level is released from its serving hold (`verified_replacement`) only when
 *                                          the stored questions, after the edits, hash to exactly `hash`: the set that was
 *                                          judged in full by two blind judges. Any other content stays held.
 *
 * Held levels stay held: this never edits content/game-holds.json and never sets verified_replacement without the hash.
 * The 2 Nov 2026 English re-audit (curriculum-build/staged/content-fixes/english-games-reaudit/) is the first user.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');

const DIR = path.join(__dirname, '..', 'content', 'game-fixes');

/** The hash a release is pinned to: prompt, options and key of every question, in order. */
function setHash(questions) {
  const h = crypto.createHash('sha256');
  for (const q of questions) h.update(JSON.stringify([q.id, q.prompt, q.choices, q.answerIndex]));
  return h.digest('hex').slice(0, 24);
}

function applyFile(fix) {
  const out = { rekeyed: 0, rewritten: 0, released: 0, already: 0, conflicts: [], missing: 0 };
  const rowOf = (level) => db.findOne('game_payloads', (r) => !r.user_id && r.track_id === fix.track_id && r.grade_id === fix.grade_id && r.level === level);
  const touched = new Set();
  for (const k of fix.rekeys || []) {
    const row = rowOf(k.level);
    const q = row && row.payload && (row.payload.questions || []).find((x) => x.id === k.qid);
    if (!q) { out.missing++; continue; }
    if (q.answerIndex === k.to) { out.already++; continue; }
    // a question that was re-keyed and then rewritten has the rewrite's key now: the rewrite wins, nothing to report
    if ((fix.rewrites || []).some((w) => w.level === k.level && w.qid === k.qid && q.prompt === w.question.prompt)) { out.already++; continue; }
    if (q.answerIndex !== k.from) { out.conflicts.push(`${k.level}:${k.qid} key ${q.answerIndex} is neither ${k.from} nor ${k.to}`); continue; }
    q.answerIndex = k.to; touched.add(row.id); out.rekeyed++;
  }
  for (const w of fix.rewrites || []) {
    const row = rowOf(w.level);
    const i = row && row.payload ? (row.payload.questions || []).findIndex((x) => x.id === w.qid) : -1;
    if (i < 0) { out.missing++; continue; }
    const q = row.payload.questions[i];
    // Already applied only when the whole judged question is there: a rewrite can keep the prompt and change the options or the key.
    const same = q.prompt === w.question.prompt && q.answerIndex === w.question.answerIndex
      && JSON.stringify(q.choices) === JSON.stringify(w.question.choices);
    if (same) { out.already++; continue; }
    if (q.prompt !== w.old_prompt) { out.conflicts.push(`${w.level}:${w.qid} prompt is neither the old nor the new one`); continue; }
    row.payload.questions[i] = { ...q, ...w.question, id: q.id };
    touched.add(row.id); out.rewritten++;
  }
  for (const id of touched) { const row = db.byId('game_payloads', id); db.update('game_payloads', id, { payload: row.payload, content_fixed_at: new Date().toISOString() }); }
  for (const r of fix.release || []) {
    const row = rowOf(r.level);
    if (!row || !row.payload || row.verified_replacement) continue;
    if (setHash(row.payload.questions || []) !== r.hash) continue; // the content is not the judged set: stays held
    db.update('game_payloads', row.id, { verified_replacement: { source: fix.source || 'game-fixes', at: new Date().toISOString(), hash: r.hash } });
    out.released++;
  }
  return out;
}

/** Apply every shipped fix file. Returns the totals. */
function applyAll() {
  const total = { rekeyed: 0, rewritten: 0, released: 0, already: 0, conflicts: [], missing: 0 };
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch { return total; }
  for (const f of files) {
    let fix = null;
    try { fix = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { continue; }
    const r = applyFile(fix);
    for (const k of ['rekeyed', 'rewritten', 'released', 'already', 'missing']) total[k] += r[k];
    total.conflicts.push(...r.conflicts);
  }
  return total;
}

module.exports = { applyAll, applyFile, setHash };
