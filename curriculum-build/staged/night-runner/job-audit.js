/**
 * Job 3: finish the content fact audit (curriculum-build/CONTENT-FACT-AUDIT.md section 7).
 *
 *   - the 3,819 questions no judge read, plus the 269 the explanation-key heuristic
 *     flagged (staged/content-fixes/not-yet-judged.json): MiniMax answers every one blind;
 *     where it disagrees with the key (or reports a problem), and for every flagged one, a
 *     judge from another family reviews it WITH the key and explanation;
 *   - the 5 lessons no judge read: MiniMax lists errors; another family checks each;
 *   - a "wrong" both judges agree on is source-checked: by computation (services/math-claims.js)
 *     where it applies, else offline Wikipedia / Wiktionary passages (kiwix, 127.0.0.1:8090)
 *     read by MiniMax, whose quote must appear verbatim in the passage. Unsourced ones are
 *     listed for the owner, never turned into a fix.
 * Units come from the audit's own extraction (units.json, shared content and model text
 * only; learner names redacted). Output: staged/content-fixes/night-audit/.
 */
const fs = require('fs');
const path = require('path');
const core = require('./core');

const { ROOT, log, minimax, judgeB, kinds } = core;
const mathClaims = require(path.join(ROOT, 'services', 'math-claims.js'));
const offline = require(path.join(ROOT, 'services', 'offline-facts.js'));
const { redact } = require('./redact');

const OUT = path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'night-audit');
fs.mkdirSync(OUT, { recursive: true });
const RESULTS = path.join(OUT, 'results.jsonl');
const OLD_AUDIT = 'C:/Users/admin/AppData/Local/Temp/claude/C--coding-claudecommittdIq-folderThing/b8206e34-7709-469e-8326-7a732d82d175/scratchpad/fact-audit';

const GRADE = {
  proficient: 'English, Proficient (grades 9-10)', basics: 'English, basics (about grades 3-5)', advanced: 'English, advanced (grades 11-12)',
  algebra1: 'Math, Algebra 1', prealgebra: 'Math, pre-algebra', algebra_1_part_a: 'Math, Algebra 1 part A', arithmetic: 'Math, arithmetic',
  numbers_to_20_and_teen_numbers: 'Math, kindergarten/grade 1 numbers to 20', entry: 'Spanish, beginner',
  chess_board_explorer: 'Chess for young beginners', piano_keyboard_explorer: 'Piano for young beginners', basketball_junior_club_player: 'Basketball, junior club player',
};
const ctx = (u) => GRADE[u.grade] || `${u.track}${u.grade ? `, ${u.grade}` : ''}`;
const users = (u) => (u.occ || []).map((o) => o.user).filter((x) => x != null);
const R = (u, s) => redact(s, users(u));

// judge.js's prompts, unchanged
const BLIND_SYSTEM = `You check quiz questions written for a school learning app. You are NOT told the answer key.
For each question: solve it yourself and give the answer you believe is correct.
- Multiple choice: chosen_index = the 0-based index of the option you pick; list in also_correct any OTHER option that is equally correct.
- Typed answer (no options): chosen_index = -1 and typed_answer = your answer, short.
- problem: "" if the question is sound. Otherwise say what is wrong: a false statement in it, two defensible answers, no correct option, missing information, or options that are identical.
Apply standard American English usage and standard school mathematics. Be exact.`;
const BLIND_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' }, typed_answer: { type: 'string' }, also_correct: { type: 'array', items: { type: 'integer' } }, problem: { type: 'string' } }, required: ['index', 'chosen_index', 'problem'] } } }, required: ['verdicts'] };
const REVIEW_SYSTEM = `You are a strict fact checker for a school learning app. Each question below is shown with its answer key and the explanation learners see.
For each one decide:
- key_correct: is the key a correct answer to the question as written?
- only_one: for multiple choice, is the key the ONLY correct option? (list others in other_correct)
- explanation_correct: is every statement in the explanation (and hint) true?
- error: "" if all is right; otherwise quote the exact wrong words and say what is true instead.
Only real errors count: a false statement, a wrong rule, a wrong calculation, a wrong or non-unique key. Do not flag style, simplifications that are true for the grade, or British vs American spelling.`;
const REVIEW_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, key_correct: { type: 'boolean' }, only_one: { type: 'boolean' }, other_correct: { type: 'array', items: { type: 'integer' } }, explanation_correct: { type: 'boolean' }, error: { type: 'string' } }, required: ['index', 'key_correct', 'explanation_correct', 'error'] } } }, required: ['verdicts'] };
const PROSE_SYSTEM = `You are a strict fact checker for a school learning app. Read the lesson content below (for the course named) and list every REAL error a learner could be taught:
- a false statement or wrong rule (grammar, math, science, history, chess, music, sport rules...),
- a wrong calculation or a step that does not follow,
- an example that does not show what the text says it shows (e.g. a sentence labelled correct that is incorrect, a "fragment" that is a complete sentence),
- an answer key or "correct option" (ids like correctId/correctIndex/answer) that is wrong, or a question with two correct options,
- a contradiction between two parts.
Do NOT flag: style, tone, simplifications that are still true at this grade, British vs American spelling, deliberately wrong examples that the text itself labels as mistakes, or formatting.
For each error give quote (the exact wrong words, copied), problem, correction. If there are no errors return an empty list.`;
const PROSE_SCHEMA = { type: 'object', properties: { errors: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, problem: { type: 'string' }, correction: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['quote', 'problem', 'correction', 'confidence'] } } }, required: ['errors'] };
const FLAG_SYSTEM = `You are a strict fact checker for a school learning app. Each item quotes words from a lesson, a reviewer's claim that the words are wrong, and the reviewer's correction.
For each item decide:
- error_real: are the quoted words really wrong as the lesson states them (not a style point, not a true simplification, not a mistake the lesson itself labels as a mistake)?
- correction_true: is the reviewer's correction itself true?
- note: one sentence on why.`;
const FLAG_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, error_real: { type: 'boolean' }, correction_true: { type: 'boolean' }, note: { type: 'string' } }, required: ['index', 'error_real', 'correction_true', 'note'] } } }, required: ['verdicts'] };
const SOURCE_SYSTEM = `You check one claim against encyclopedia passages (offline Wikipedia / Wiktionary). Use ONLY the passages, not your own knowledge.
- verdict "supports_correction": a passage states something that shows the correction is right (and the original wrong);
- "supports_original": a passage shows the original was right;
- "not_addressed": the passages do not settle it.
quote: the exact sentence from the passage that settles it, copied character for character ("" if not_addressed). article: that passage's title.`;
const SOURCE_SCHEMA = { type: 'object', properties: { verdict: { type: 'string', enum: ['supports_correction', 'supports_original', 'not_addressed'] }, quote: { type: 'string' }, article: { type: 'string' } }, required: ['verdict', 'quote', 'article'] };

function qText(u, i, withKey) {
  const lines = [`Question ${i} [${ctx(u)}]${u.passage ? `\nPassage: ${R(u, u.passage).slice(0, 1500)}` : ''}\n${R(u, u.prompt)}`];
  if (u.choices) lines.push(u.choices.map((c, j) => `  (${j}) ${R(u, c)}`).join('\n')); else lines.push('  (typed answer)');
  if (withKey) {
    lines.push(`  KEY: ${u.choices ? `(${keyIndex(u)}) ` : ''}${R(u, u.answer)}${u.accepts ? `  (also accepted: ${u.accepts.join(' | ')})` : ''}`);
    if (u.explanation) lines.push(`  EXPLANATION: ${R(u, u.explanation)}`);
    if (u.hint) lines.push(`  HINT: ${R(u, u.hint)}`);
  }
  return lines.join('\n');
}
const nm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// for the verbatim-quote check: case, spacing, punctuation and markup do not count
const loose = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, '');
const keyIndex = (u) => (u.choices ? u.choices.findIndex((c) => nm(c) === nm(u.answer)) : -1);
kinds['audit-review'] = { system: REVIEW_SYSTEM, schema: REVIEW_SCHEMA, batch: 12, maxTokens: 6000, render: (u, i) => qText(u, i, true), keyOf: (u) => u.uid };
kinds['flag-check'] = { system: FLAG_SYSTEM, schema: FLAG_SCHEMA, batch: 10, maxTokens: 5000, keyOf: (it) => [it.uid, it.quote, it.correction], render: (it, i) => `Item ${i} [${it.course}]\nLesson words: "${it.quote}"\nReviewer's claim: ${it.problem}\nReviewer's correction: ${it.correction}` };

const normAns = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.\-/ ]+/g, '').replace(/\s+/g, ' ').trim();
const stats = { questions: 0, blind_done: 0, agree: 0, disagree: 0, reviewed_b: 0, confirmed_wrong: 0, sourced: 0, unsourced: 0, split: 0, prose_done: 0, prose_flags: 0, prose_confirmed: 0 };
const results = new Map();
function record(r) { results.set(r.uid, r); fs.appendFileSync(RESULTS, `${JSON.stringify(r)}\n`); }

async function sourceCheck(job, u, claim, correction, original) {
  // 1. computation, where the code checkers apply
  if (u.track === 'math') {
    const qp = u.choices ? mathClaims.questionProblems({ prompt: u.prompt, choices: u.choices, answer: u.answer }) : [];
    const ap = mathClaims.arithmeticProblems(`${original || ''}`);
    if (qp.length || ap.length) return { method: 'computation (services/math-claims.js)', source: 'computation', detail: [...qp, ...ap].map((p) => p.problem).join('; ') };
  }
  // 2. offline Wikipedia / Wiktionary, read by MiniMax; the quote must be in the passage
  let passages = [];
  try { passages = await offline.retrieve(`${claim} ${correction}`.slice(0, 400), { topic: `${u.skill || ''} ${ctx(u)}`, k: 4, embed: false }); } catch (err) { return { method: 'offline retrieval failed', source: null, detail: err.message }; }
  if (!passages.length) return { method: 'offline retrieval: nothing found', source: null };
  const user = `Claim checked: ${claim}\nOriginal (said to be wrong): ${original}\nCorrection: ${correction}\n\nPassages:\n${passages.map((p, i) => `[${i}] ${p.title} (${p.book})\n${p.text}`).join('\n\n')}`;
  const r = await minimax({ job, system: SOURCE_SYSTEM, user, schema: SOURCE_SCHEMA, schemaName: 'submit_source_check', maxTokens: 4000 }).catch(() => null);
  const v = r && r.data;
  if (!v) return { method: 'offline retrieval + MiniMax reading (no answer)', source: null };
  const hit = v.quote && loose(v.quote).length >= 20 ? passages.find((x) => loose(x.text).includes(loose(v.quote))) : null;
  const p = hit || passages.find((x) => x.title === v.article);
  const verbatim = !!hit;
  const url = p ? (/wiktionary/i.test(p.book || '') ? `https://en.wiktionary.org/wiki/${encodeURIComponent(String(p.title).replace(/\s+/g, '_'))}` : `https://en.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/\s+/g, '_'))}`) : null;
  return { method: 'offline Wikipedia/Wiktionary passage, read by MiniMax, quote verified verbatim', verdict: v.verdict, quote: v.quote, article: v.article, verbatim, source: verbatim && v.verdict === 'supports_correction' ? url : null, url };
}

async function doBatch(job, batch, flagged) {
  const user = `${batch.map((u, i) => qText(u, i, false)).join('\n\n')}\n\nReturn one verdict per question, with its index.`;
  let a = null;
  try { a = await minimax({ job, system: BLIND_SYSTEM, user, schema: BLIND_SCHEMA, schemaName: 'submit_verdicts', maxTokens: 6000 }); } catch (err) { if (err.fatal) throw err; log(`audit: blind batch failed: ${err.message}`); return; }
  const by = new Map(((a.data && a.data.verdicts) || []).map((v) => [v.index, v]));
  await Promise.all(batch.map(async (u, i) => {
    const v = by.get(i);
    stats.blind_done++;
    const ki = keyIndex(u);
    let agree = false;
    if (v) {
      if (u.choices) agree = v.chosen_index === ki && !String(v.problem || '').trim() && !(v.also_correct || []).length;
      else agree = !String(v.problem || '').trim() && [u.answer, ...(u.accepts || [])].some((x) => normAns(x) === normAns(v.typed_answer));
    }
    const base = { uid: u.uid, occ: u.occ, track: u.track, grade: u.grade, format: u.format, prompt: u.prompt, choices: u.choices, key: u.answer, explanation: u.explanation, flagged: !!flagged.get(u.uid), a: v ? { pick: v.chosen_index, typed: v.typed_answer, also: v.also_correct, problem: v.problem } : null, model_a: a.model };
    if (agree && !base.flagged) { stats.agree++; record({ ...base, outcome: 'ok (MiniMax blind agrees with the key)' }); return; }
    if (!agree) stats.disagree++;
    const b = await judgeB(job, 'audit-review', u);
    stats.reviewed_b++;
    if (!b) { record({ ...base, outcome: 'unsettled: no judge B verdict' }); return; }
    const bv = b.v;
    const bWrong = bv.key_correct === false || (u.choices && bv.only_one === false);
    const out = { ...base, b: bv, model_b: b.model };
    if (!bWrong) { if (!agree) stats.split++; record({ ...out, outcome: agree ? 'ok (flagged, but both judges accept the key)' : 'split: MiniMax disagreed, judge B accepts the key (likely MiniMax false alarm)' }); return; }
    if (agree) { stats.split++; record({ ...out, outcome: 'split: MiniMax accepted the key blind, judge B calls it wrong' }); return; }
    // both judges: wrong
    stats.confirmed_wrong++;
    const alt = (bv.other_correct || []).length === 1 ? bv.other_correct[0] : (v && u.choices && v.chosen_index !== ki ? v.chosen_index : null);
    const correction = u.choices && alt != null && u.choices[alt] ? `The correct option is (${alt}) "${u.choices[alt]}", not the key "${u.answer}". ${bv.error || ''}` : (bv.error || (v && v.problem) || 'no correct answer as written');
    const src = await sourceCheck(job, u, `${R(u, u.prompt)}`, correction, `Key: ${u.answer}. Explanation: ${u.explanation}`);
    if (src.source) stats.sourced++; else stats.unsourced++;
    record({ ...out, outcome: src.source ? 'confirmed wrong: both judges + source' : 'both judges call it wrong; no source settles it (owner)', alt, correction, source_check: src });
  }));
}

async function doProse(job, u) {
  const text = R(u, u.text);
  const p = await minimax({ job, system: PROSE_SYSTEM, user: `Course: ${ctx(u)}\n\n${text}`, schema: PROSE_SCHEMA, schemaName: 'submit_errors', maxTokens: 16000 });
  const errs = (p.data && p.data.errors) || [];
  stats.prose_flags += errs.length;
  const checked = await Promise.all(errs.map(async (e) => {
    const b = await judgeB(job, 'flag-check', { uid: u.uid, course: ctx(u), quote: e.quote, problem: e.problem, correction: e.correction });
    const real = b && b.v.error_real && b.v.correction_true;
    let src = null;
    if (real) {
      const ap = u.track === 'math' ? [...mathClaims.arithmeticProblems(e.quote), ...mathClaims.operationProblems(e.quote)] : [];
      src = ap.length ? { method: 'computation (services/math-claims.js)', source: 'computation', detail: ap.map((x) => x.problem).join('; ') } : await sourceCheck(job, u, e.problem, e.correction, e.quote);
      stats.prose_confirmed++;
    }
    return { ...e, in_text: nm(text).includes(nm(e.quote)), b: b && b.v, model_b: b && b.model, outcome: !b ? 'unsettled: no judge B verdict' : !real ? 'judge B: not an error (or the correction is wrong)' : src && src.source ? 'confirmed: both judges + source' : 'both judges agree; no source settles it (owner)', source_check: src };
  }));
  stats.prose_done++;
  record({ uid: u.uid, kind: 'prose', occ: u.occ, track: u.track, grade: u.grade, model_a: p.model, errors: checked, outcome: `${checked.filter((c) => /^confirmed/.test(c.outcome)).length} confirmed of ${errs.length} flagged` });
}

const { corroborate } = require('./corroborate');

function writeOutputs() {
  const all = [...results.values()].map(corroborate);
  const fixes = [];
  let n = 0;
  for (const r of all) {
    if (r.kind === 'prose') {
      for (const e of r.errors.filter((x) => /^confirmed/.test(x.outcome))) {
        for (const o of r.occ) fixes.push({ ref: `N${++n}`, collection: o.coll, row_id: o.row, path: o.path, shared: o.user == null, user_id: o.user, action: 'rewrite_text', wrong: e.quote, correct: e.correction, source: e.source_check.source, quote: e.source_check.quote || e.source_check.detail, method: `MiniMax read + ${r.model_a ? 'judge B ' : ''}${e.model_b} + ${e.source_check.method}` });
      }
      continue;
    }
    if (!/^confirmed wrong/.test(r.outcome)) continue;
    for (const o of r.occ) {
      const rekey = r.choices && r.alt != null && r.choices[r.alt] && r.b && r.b.key_correct === false;
      fixes.push({ ref: `N${++n}`, collection: o.coll, row_id: o.row, path: o.path, shared: o.user == null, user_id: o.user, action: rekey ? 'rekey' : 'rewrite_or_remove', ...(rekey ? { set: o.coll === 'game_payloads' ? { answerIndex: r.alt } : { answer: r.choices[r.alt] } } : {}), wrong: `Q: ${r.prompt} — Key: "${r.key}"`, correct: r.correction, source: r.source_check.source, quote: r.source_check.quote || r.source_check.detail, method: `MiniMax blind + ${r.model_b} review + ${r.source_check.method}` });
    }
  }
  const outcomes = {};
  for (const r of all) { const k = r.kind === 'prose' ? 'prose' : r.outcome.replace(/\(.*\)/, '').trim(); outcomes[k] = (outcomes[k] || 0) + 1; }
  fs.writeFileSync(path.join(OUT, 'fixes-night.json'), JSON.stringify({ generated: new Date().toISOString(), note: 'Proposed corrections from the night audit (2026-10-24). Nothing applied. Each needs both judges AND a source (computation or a verbatim offline Wikipedia/Wiktionary quote).', count: fixes.length, fixes }, null, 1));
  fs.writeFileSync(path.join(OUT, 'owner-review.json'), JSON.stringify({ note: 'Both judges call these wrong, but no source settled them. Not fixes.', items: all.filter((r) => /no source settles it/.test(r.outcome) || (r.kind === 'prose' && r.errors.some((e) => /no source/.test(e.outcome)))) }, null, 1));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ generated: new Date().toISOString(), stats, outcomes, fixes: fixes.length, units_recorded: all.length }, null, 1));
}

async function run({ unitsFile, workers = 4 }) {
  const job = 'audit';
  if (fs.existsSync(RESULTS)) for (const l of fs.readFileSync(RESULTS, 'utf8').split('\n')) { try { const r = JSON.parse(l); results.set(r.uid, r); } catch { /* */ } }
  const U = JSON.parse(fs.readFileSync(unitsFile, 'utf8'));
  const judged = new Set();
  for (const f of ['cache-A-blind.jsonl', 'cache-A-review.jsonl', 'cache-B-blind.jsonl', 'cache-B-review.jsonl', 'cache-A-prose.jsonl', 'cache-B-prose.jsonl']) {
    const p = path.join(OLD_AUDIT, f);
    if (!fs.existsSync(p)) continue;
    for (const l of fs.readFileSync(p, 'utf8').split('\n')) { try { const r = JSON.parse(l); if (!r.error) r.uids.forEach((x) => judged.add(x)); } catch { /* */ } }
  }
  const nyj = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'not-yet-judged.json'), 'utf8')).items;
  const flagged = new Map(nyj.map((i) => [i.uid, i]));
  const MODEL_JUDGEABLE = new Set(['multiple_choice', 'type_in', 'short_answer']);
  const qs = U.filter((u) => u.kind === 'q' && (!judged.has(u.uid) || flagged.has(u.uid)));
  const skipped = qs.filter((u) => !MODEL_JUDGEABLE.has(u.format));
  const todo = qs.filter((u) => MODEL_JUDGEABLE.has(u.format) && !results.has(u.uid));
  const prose = U.filter((u) => u.kind === 'prose' && !judged.has(u.uid) && !results.has(u.uid));
  stats.questions = qs.length;
  log(`audit: ${qs.length} questions (${U.filter((u) => u.kind === 'q' && !judged.has(u.uid)).length} unjudged + flagged), ${todo.length} to do, ${skipped.length} board/keys items left to the code checkers; ${prose.length} lessons`);
  fs.writeFileSync(path.join(OUT, 'skipped-non-text.json'), JSON.stringify(skipped.map((u) => ({ uid: u.uid, format: u.format, prompt: u.prompt })), null, 1));
  // batches of 15 per course, in a fixed order so a restart rebuilds the same batches (cached)
  const groups = new Map();
  for (const u of todo.sort((x, y) => (x.uid < y.uid ? -1 : 1))) { const k = ctx(u); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
  const tasks = [];
  for (const u of prose) tasks.push(() => doProse(job, u).catch((err) => log(`audit: prose ${u.uid}: ${err.message}`)));
  for (const g of groups.values()) for (let i = 0; i < g.length; i += 15) { const b = g.slice(i, i + 15); tasks.push(() => doBatch(job, b, flagged)); }
  const timer = setInterval(writeOutputs, 5 * 60000);
  let at = 0;
  async function worker() { while (at < tasks.length) { const t = tasks[at++]; try { await t(); } catch (err) { log(`audit: ${err.message}`); if (err.fatal) return; } } }
  await Promise.all(Array.from({ length: workers }, worker));
  clearInterval(timer);
  writeOutputs();
  log('audit: finished');
}

module.exports = { run, stats, writeOutputs };
