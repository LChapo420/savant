#!/usr/bin/env node
/**
 * Turns the two proposal files (recheck-fixes.json, audit-fixes.json) into leaf-level edit records against the stored rows, with the reviewer's amendments, so the judges and
 * scripts/apply-content-fixes.js read the same thing. Anchored on a read-only DB copy (DB_FILE). Writes docs/fact-gate/fix-review-records.json. Nothing touches live data.
 *   DB_FILE=<copy> node scripts/fact-gate/fix-review-build.js
 */
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'fact-gate');
const db = JSON.parse(fs.readFileSync(process.env.DB_FILE || 'C:/Users/admin/AppData/Local/Temp/fact-gate/db-copy.json', 'utf8'));
const recheck = JSON.parse(fs.readFileSync(path.join(DOCS, 'recheck-fixes.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(path.join(DOCS, 'audit-fixes.json'), 'utf8'));

/** Reviewer's changes to a proposal: only wording the review found wrong in the proposal itself. Each carries why. */
const AMEND_GAME = {
  '18/q09': { 'choices.2': 'It ends on the missing book, the point the reader is meant to notice.', why: 'the proposal lost the full stop every other option has' },
  '19/q19': { 'choices.1': 'Because the alarm shrieked, keys jangling and coat unbuttoned', why: 'the proposal added a full stop no other option has, a cue' },
  '27/q39': { explanation: 'The three place phrases are matched as parallel prepositional phrases, expanding the sentence with consistent grammatical form.', why: 'the kept explanation called the phrases "objects"' },
  '59/q15': { prompt: "A student wrote 'Did you finish the essay,' as a complete question. Which fix best follows the rule about replacing needed stops?", why: "the proposal ran the student's line into the question with no separator" },
};
// The app's own writer gate (inspectPayload: the answer is identifiable by its length) refuses these as proposed: same correction, fewer words or a longer wrong option.
Object.assign(AMEND_GAME, {
  '7/q9': { 'choices.0': 'A bus timetable listing every stop for the summer', why: 'as proposed the key stood out by length' },
  '36/q47': { 'choices.1': 'a hypothetical event', why: 'as proposed the key stood out by length' },
  '20/q25': { 'choices.1': 'As the audience leaned forward, the choir sang softly.', why: 'as proposed the key stood out by length, and added "sweetly" to a sentence that has no such word' },
  '20/q14': { 'choices.3': "It is a fragment because 'Because' makes it a dependent clause.", why: 'as proposed the key stood out by length' },
  '28/q01': { 'choices.1': "Change 'she paused' to 'paused' so all three items match", why: 'as proposed the key stood out by length' },
});
// Cross-family reads and blind solves found the question still unsound around a right fix: a second right answer, or an "only" that is not so.
Object.assign(AMEND_GAME, {
  '32/q1': { prompt: 'Combine: (1) The janitor unlocked the doors at seven. (2) Students streamed into the gym. (3) The bell rang. Which combination avoids a voice shift by staying active throughout?', why: 'the all-passive option also avoided a shift: two right answers' },
  '34/q19': { prompt: 'Which revision removes the inappropriate shift by putting both clauses in active voice? The cookies were eaten by the children, and they emptied the plate.', why: 'the all-passive option also removed the shift: two right answers (both blind readers said so)' },
  '19/q19': { 'choices.1': 'Because the alarm shrieked, keys jangling and coat unbuttoned', explanation: 'This version has a main clause with a subject and a finite verb (keys jangled) and reads clearly; the others are fragments or awkwardly inverted.', why: 'the proposal added a full stop no other option has, and its "only" was false: the passive option also has a main clause' },
  '50/q40': { prompt: 'Revise using the mark that joins two closely related complete sentences: The soloist forgot her music the page turner had left.', explanation: 'A semicolon joins two closely related complete sentences; a comma alone would be a comma splice.', why: 'the proposal said the second clause explains the first, which argues for the colon; dash, colon and semicolon were all right as asked' },
  '33/q03': { 'choices.0': 'she is', why: '"I wish she had gone on time today" is also a good sentence: two right answers' },
});
const AMEND_PART = {
  'english/proficient/10|block 7': { drop: ['recoveryTip'], why: "\"exactly one independent clause\" is false for a correct compound sentence; the stored tip matches the level's own rule card, so it stays" },
  'english/proficient/19|check 4': { set: { accepts: ['period and semicolon', 'semicolon and period', 'period, semicolon', 'period or semicolon', 'a period or a semicolon', 'a semicolon and a period'] }, why: 'the proposal also dropped the right answers "period, semicolon" and "period or semicolon"; only the half answers go' },
  'english/proficient/72|block 6': { set: { correctReasoning: 'The first sentence is complete, so it ends with a period. "No arguments." is a deliberate fragment with clean end punctuation. A dash would be a legitimate way to set off the aside, but the dash version drops the end mark after "arguments," leaving the fragment hanging. Only the two-sentence version marks both sentence ends correctly.' }, why: 'the proposal named options by a number the learner does not see, and "option 3" counted from zero points at the right answer' },
  'english/proficient/81|check 3': { drop: ['accepts'], set: { answer: "It's a fragment because it has a dependent clause and no independent clause", choices: ["It's a run-on, so add a semicolon before the dash", "It's a fragment because it has a dependent clause and no independent clause", "It's correct — a dash always excuses an incomplete sentence", "It's a fragment, so replace the dash with an ellipsis"] }, why: 'a multiple choice check has no use for a new accepts list, and as proposed the key stood out by length' },
  'english/proficient/81|block 4': { set: { cells: { 2: { feedback: 'Attach it to a full sentence, or finish the thought.' } } }, why: 'the kept feedback said to give it a subject and verb, which the new example already has' },
  'english/proficient/82|block 3': { set: { era: 'London and New York, 1800s–1980s', beforeAfter: { after: 'Editors slowly gave up. Chicago stopped objecting to split infinitives by the 1980s, and most modern guides now allow a split infinitive when it improves clarity or avoids awkwardness. Usage had already changed — the rules followed.' } }, why: "\"by 1993\" has no source; Chicago's own Q&A dates the change to its thirteenth edition" },
  'english/proficient/82|block 8': { set: { rows: { 2: { detail: 'Once widely condemned, split infinitives are now accepted: Chicago stopped objecting by the 1980s, and AP allows a split when it is not awkward and is needed for the meaning.' } } }, why: 'same date; AP wording taken from its verb entry as quoted' },
  'english/proficient/95|block 9': { set: { paragraph: 'The book was really good and the main character got really upset about all of the changes that happened at her new school.' }, why: 'the proposal changed the paragraph without its tokens: the two would have read differently' },
  'english/proficient/95|check 4': { drop: ['choices'], why: 'the check stays typed; choices on a typed check do nothing' },
  'spanish/intermediate/97|check 2': { drop: ['rationale'], why: 'the proposal put grader notes in the text a learner reads; the stored line is right' },
};

const leafDiff = (a, b, p = [], out = []) => {
  const obj = (x) => x && typeof x === 'object';
  if (obj(a) && obj(b) && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length) && (Array.isArray(a) || Object.keys(a).sort().join() === Object.keys(b).sort().join())) {
    for (const k of Object.keys(a)) leafDiff(a[k], b[k], [...p, k], out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: p, old: a === undefined ? null : a, new: b === undefined ? null : b });
  return out;
};
const deepSet = (o, v) => { for (const [k, x] of Object.entries(v)) { if (x && typeof x === 'object' && !Array.isArray(x)) deepSet(o[k], x); else o[k] = x; } };

const records = [];
for (const [k, f] of Object.entries(recheck.game_fixes)) {
  const [, id, qid] = k.split(':');
  const row = db.game_payloads.find((g) => g.id === Number(id));
  const after = JSON.parse(JSON.stringify(f.after));
  const am = AMEND_GAME[`${id}/${qid}`];
  if (am) for (const [p, v] of Object.entries(am)) { if (p === 'why') continue; const [x, y] = p.split('.'); if (y === undefined) after[x] = v; else after[x][Number(y)] = v; }
  records.push({
    id: `game:${row.track_id}/${row.grade_id}/${row.level}/${qid}`, source: 'recheck', proposer: 'claude', store: 'game_payloads',
    track_id: row.track_id, grade_id: row.grade_id, level: row.level, engine_id: row.engine_id, qid, old_row_id: row.id, topic: (row.payload.questions.find((q) => q.id === qid) || {}).topic || '',
    question_after: after, edits: leafDiff(f.before, after), amended: am ? am.why : null,
  });
}
for (const c of audit.certain) {
  const [lv, part] = c.key.split('|');
  const [tr, gr, l] = lv.split('/');
  const [w, i] = part.split(' ');
  const plans = db.block_plans.filter((p) => !p.user_id && p.status === 'ready' && p.track_id === tr && p.grade_id === gr && p.level === Number(l));
  if (plans.length !== 1) throw new Error(`${c.key}: ${plans.length} plans`);
  const plan = plans[0];
  const after = JSON.parse(JSON.stringify(c.after));
  const am = AMEND_PART[c.key];
  let current; let partName = null;
  if (w === 'block') {
    const b = plan.blocks.find((x, k) => (x.index ?? k) === Number(i));
    current = b.data; partName = b.block;
  } else {
    current = plan.checks[Number(i)]; partName = current.format;
  }
  if (am && am.drop) for (const k of am.drop) { if (current[k] === undefined) delete after[k]; else after[k] = current[k]; }
  if (am && am.set) deepSet(after, am.set);
  // A check's `after` holds only the fields the repair could change: never touch the rest of the row.
  const edits = w === 'block' ? leafDiff(current, after) : ['prompt', 'answer', 'rationale', 'choices', 'accepts', 'hint'].flatMap((k) => (after[k] === undefined ? [] : leafDiff(current[k], after[k], [k])));
  const finalPart = JSON.parse(JSON.stringify(current));
  for (const e of edits) { let o = finalPart; for (const k of e.path.slice(0, -1)) o = o[k]; o[e.path[e.path.length - 1]] = e.new; }
  records.push({
    id: `plan:${c.key}`, source: 'audit', proposer: c.round === 1 ? 'glm' : 'grok', store: 'block_plans', track_id: tr, grade_id: gr, level: Number(l), part: w, index: Number(i), part_name: partName,
    prewritten: !!plan.prewritten, reasons: c.reasons, part_after: finalPart, edits, amended: am ? am.why : null,
  });
}
fs.writeFileSync(path.join(DOCS, 'fix-review-records.json'), `${JSON.stringify({ built: 'from recheck-fixes.json and audit-fixes.json', records }, null, 1)}\n`);
console.log(records.length, 'records', records.filter((r) => r.amended).length, 'amended', records.filter((r) => !r.edits.length).length, 'empty', records.reduce((n, r) => n + r.edits.length, 0), 'leaf edits');
