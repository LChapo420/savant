/**
 * Job 4: corrected versions of the lessons and block plans with confirmed errors
 * (staged/content-fixes/fixes.json, collections lessons and block_plans).
 *
 *   writer   MiniMax: exact find/replace edits to the row's served text, one or more per error
 *   code     every edit applies exactly once; the row keeps its shape (same keys, same
 *            array lengths, keys/indices untouched unless the fix is a re-key);
 *            lessons through services/math-claims.js lessonProblems: no new problem may appear
 *   judge A  MiniMax, a separate review pass: is every error fixed and every edit true?
 *   judge B  another family, the same review
 * Both must pass; a row that fails gets one more round with the judges' notes. Staged as
 * replacement data with a diff: staged/content-fixes/rewrites/. Nothing is applied.
 */
const fs = require('fs');
const path = require('path');
const core = require('./core');

const { ROOT, log, minimax, judgeB, kinds } = core;
const mathClaims = require(path.join(ROOT, 'services', 'math-claims.js'));
const { redact } = require('./redact');

const OUT = path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'rewrites');
fs.mkdirSync(OUT, { recursive: true });

const EDIT_SYSTEM = `You correct confirmed errors in one lesson of a school learning app. The lesson is given as JSON; each error says what is wrong and what is true.
Return edits: each edit has find (an exact piece of ONE text value in the JSON, copied character for character, long enough to occur only once), replace (the corrected text) and fixes (the error refs it fixes).
Rules:
- Fix every error listed, and nothing else. Keep the lesson's style, level and length; change as few words as possible.
- Every sentence you write must be true. Worked math must be exactly right; a "common mistake" must be labelled as the mistake it is, with the correct step shown.
- Where an error is a wrong answer key, change the key's value (for example "answer" or "correctIndex") so it names the correct option; where a question has no single correct option, rewrite its options or wording so exactly one is correct.
- Do not touch ids or structure.`;
const EDIT_SCHEMA = { type: 'object', properties: { edits: { type: 'array', items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' }, fixes: { type: 'array', items: { type: 'string' } } }, required: ['find', 'replace', 'fixes'] } } }, required: ['edits'] };
const REVIEW_SYSTEM = `You review corrections to lessons in a school learning app. For each item you get the course, the confirmed errors (what was wrong, what is true) and the edits made (before -> after).
Decide:
- all_fixed: does every listed error disappear after the edits?
- all_true: is every word of every "after" text true and correct for the grade (math exactly right, grammar standard American English)?
- note: "" if both are yes, else what is still wrong.`;
const REVIEW_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, all_fixed: { type: 'boolean' }, all_true: { type: 'boolean' }, note: { type: 'string' } }, required: ['index', 'all_fixed', 'all_true', 'note'] } } }, required: ['verdicts'] };
const reviewText = (it, i) => `Item ${i} [${it.course}]\nERRORS:\n${it.errors.map((e) => `- ${e.ref}: wrong: ${e.wrong}\n  true: ${e.correct}`).join('\n')}\nEDITS:\n${it.diff.map((d, j) => `(${j + 1}) at ${d.path}\n  before: ${d.before_excerpt}\n  after:  ${d.after_excerpt}`).join('\n')}`;
kinds['rewrite-check'] = { system: REVIEW_SYSTEM, schema: REVIEW_SCHEMA, batch: 3, maxTokens: 6000, render: reviewText };

const LESSON_FIELDS = ['title', 'intro', 'sections', 'worked_example', 'common_mistakes', 'summary', 'check_questions'];
const PLAN_FIELDS = ['blocks', 'checks'];
const clone = (x) => JSON.parse(JSON.stringify(x));

function leaves(obj, at = '') {
  const out = [];
  if (typeof obj === 'string') out.push({ path: at, value: obj });
  else if (Array.isArray(obj)) obj.forEach((v, i) => out.push(...leaves(v, `${at}[${i}]`)));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) out.push(...leaves(v, at ? `${at}.${k}` : k));
  return out;
}
function setAt(obj, p, value) {
  const parts = p.match(/[^.[\]]+/g);
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}
function shape(x) {
  if (Array.isArray(x)) return x.map(shape);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map((k) => [k, shape(x[k])]));
  return typeof x;
}
const unesc = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };
const excerpt = (text, at, len) => text.slice(Math.max(0, at - 80), at + len + 80);

function applyEdits(content, edits) {
  const next = clone(content);
  const problems = [];
  const diff = [];
  for (const e of edits) {
    let find = e.find;
    let hits = leaves(next).filter((l) => l.value.includes(find));
    if (!hits.length) { find = unesc(e.find); hits = leaves(next).filter((l) => l.value.includes(find)); }
    const count = hits.reduce((s, l) => s + l.value.split(find).length - 1, 0);
    if (count !== 1) { problems.push(`edit "${String(e.find).slice(0, 60)}" matches ${count} places`); continue; }
    const leaf = hits[0];
    const pos = leaf.value.indexOf(find);
    const after = leaf.value.replace(find, () => e.replace);
    setAt(next, leaf.path, after);
    diff.push({ path: leaf.path, before: leaf.value, after, before_excerpt: excerpt(leaf.value, pos, find.length), after_excerpt: excerpt(after, pos, e.replace.length), fixes: e.fixes });
  }
  // keys and indices may change only as a re-key: the shape stays the same apart from leaves' values
  if (JSON.stringify(shape(next)) !== JSON.stringify(shape(content))) problems.push('the row changed shape');
  return { next, problems, diff };
}

const stats = { rows: 0, done: 0, passed: 0, owner: 0 };

async function doRow(job, row, collection, errors, dbUser) {
  const fields = collection === 'lessons' ? LESSON_FIELDS : PLAN_FIELDS;
  const content = Object.fromEntries(fields.filter((f) => row[f] !== undefined).map((f) => [f, row[f]]));
  // learner names never leave: redact on a copy, and edit that copy
  const red = JSON.parse(redact(JSON.stringify(content), [dbUser]));
  const course = `${row.track_id}, ${row.grade_id}, level ${row.level}${collection === 'block_plans' ? ` (${row.kind || 'plan'} as JSON blocks shown on screen)` : ''}`;
  const errs = errors.map((e) => ({ ref: e.ref, wrong: String(e.wrong).slice(0, 600), correct: String(e.correct).slice(0, 600), action: e.action }));
  let feedback = '';
  let last = null;
  for (let round = 0; round < 2; round++) {
    const user = `Course: ${course}\n\nERRORS (confirmed):\n${errs.map((e) => `- ${e.ref} [${e.action}]: wrong: ${e.wrong}\n  true: ${e.correct}`).join('\n')}${feedback}\n\nLESSON JSON:\n${JSON.stringify(red, null, 1)}`;
    // eslint-disable-next-line no-await-in-loop
    const w = await minimax({ job, system: EDIT_SYSTEM, user, schema: EDIT_SCHEMA, schemaName: 'submit_edits', maxTokens: 12000 });
    const edits = (w.data && w.data.edits) || [];
    const { next, problems, diff } = applyEdits(red, edits);
    let mathBefore = []; let mathAfter = [];
    if (collection === 'lessons') {
      mathBefore = mathClaims.lessonProblems(red).map((p) => `${p.where}:${p.claim}`);
      mathAfter = mathClaims.lessonProblems(next).map((p) => `${p.where}:${p.claim}`);
      const added = mathAfter.filter((p) => !mathBefore.includes(p));
      if (added.length) problems.push(`math-claims: new problems ${added.join(' | ').slice(0, 300)}`);
    }
    if (!diff.length) problems.push('no edit applied');
    const item = { course, errors: errs, diff };
    let va = null; let vb = null;
    if (!problems.length) {
      // eslint-disable-next-line no-await-in-loop
      const [a, b] = await Promise.all([
        minimax({ job, system: REVIEW_SYSTEM, user: `${reviewText(item, 0)}\n\nReturn one verdict, index 0.`, schema: REVIEW_SCHEMA, schemaName: 'submit_verdicts', maxTokens: 6000 }).catch(() => null),
        judgeB(job, 'rewrite-check', item),
      ]);
      va = a && a.data && (a.data.verdicts || [])[0];
      vb = b && b.v;
      last = { model_a: a && a.model, model_b: b && b.model };
    }
    const pass = !problems.length && va && vb && va.all_fixed && va.all_true && vb.all_fixed && vb.all_true;
    const res = { collection, row_id: row.id, shared: row.user_id == null, user_id: row.user_id, round, status: pass ? 'verified: code checks + MiniMax review + cross-family review' : 'needs owner', code_problems: problems, math_claims: collection === 'lessons' ? { before: mathBefore.length, after: mathAfter.length } : null, errors: errs, edits, diff: diff.map(({ before_excerpt: b1, after_excerpt: a1, ...d }) => d), judge_a: va, judge_b: vb, ...last, note: 'Learner names were replaced by "the learner" before the text was sent; apply the diff to the stored row (the names are not in any edited span unless shown).', applied: false };
    if (pass || round === 1) return { res, next };
    feedback = `\n\nAn earlier correction was rejected: ${[...problems, va && va.note, vb && vb.note].filter(Boolean).join(' | ').slice(0, 1200)}. Write the edits again.`;
  }
  return null;
}

function diffText(r) {
  return [`### ${r.collection} ${r.row_id} — ${r.status}`, ...r.diff.map((d) => `@@ ${d.path}\n- ${d.before}\n+ ${d.after}`), ''].join('\n');
}

async function run({ dbCopy, workers = 2 }) {
  const job = 'rewrites';
  const db = JSON.parse(fs.readFileSync(dbCopy, 'utf8'));
  const fixes = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'fixes.json'), 'utf8')).fixes;
  const groups = new Map();
  for (const f of fixes.filter((x) => x.collection === 'lessons' || x.collection === 'block_plans')) {
    const k = `${f.collection}:${f.row_id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const rows = [...groups.entries()].filter(([k]) => !fs.existsSync(path.join(OUT, `${k.replace(':', '-')}.json`)));
  stats.rows = groups.size;
  stats.done = groups.size - rows.length;
  log(`rewrites: ${groups.size} rows with confirmed errors, ${rows.length} to do`);
  let at = 0;
  async function worker() {
    while (at < rows.length) {
      const [k, errs] = rows[at++];
      const [coll, id] = k.split(':');
      const row = (db[coll] || []).find((r) => r.id === Number(id));
      if (!row) { log(`rewrites: ${k} not in the DB copy`); continue; }
      try {
        const out = await doRow(job, row, coll, errs, row.user_id);
        if (!out) continue;
        fs.writeFileSync(path.join(OUT, `${coll}-${id}.json`), JSON.stringify({ ...out.res, new_content: out.next }, null, 1));
        stats.done++;
        if (/^verified/.test(out.res.status)) stats.passed++; else stats.owner++;
        log(`rewrites: ${k}: ${out.res.status}`);
      } catch (err) { log(`rewrites: ${k}: ${err.message}`); if (err.fatal) return; }
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  const all = fs.readdirSync(OUT).filter((f) => /^(lessons|block_plans)-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')));
  fs.writeFileSync(path.join(OUT, 'rewrites.diff.md'), `# Staged corrections (not applied)\n\n${all.map(diffText).join('\n')}`);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ generated: new Date().toISOString(), rows: all.length, verified: all.filter((r) => /^verified/.test(r.status)).length, needs_owner: all.filter((r) => !/^verified/.test(r.status)).map((r) => `${r.collection}:${r.row_id}`), lessons: all.filter((r) => r.collection === 'lessons').length, block_plans: all.filter((r) => r.collection === 'block_plans').length }, null, 1));
  log('rewrites: finished');
}

module.exports = { run, stats, applyEdits };
