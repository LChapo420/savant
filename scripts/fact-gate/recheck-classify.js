#!/usr/bin/env node
/**
 * The stored re-check (_briefs/stored-recheck-nov6.json) sorted by a human read of each row, with corrected text for review. Writes docs/fact-gate/recheck-fixes.json; touches no live data.
 * Verdicts: label (real: explanation names a stale place; fixed in code by services/game-ordinals.js), real (text wrong: fix below), checker (the finding is mistaken), unclear.
 */
const fs = require('fs');
const path = require('path');

const found = require('C:/coding/savant-wt/_briefs/stored-recheck-nov6.json').found;
const db = JSON.parse(fs.readFileSync(process.env.DB_FILE || 'C:/Users/admin/AppData/Local/Temp/fact-gate/db-copy.json', 'utf8'));

const LABEL = [0, 4, 8, 14, 24, 27, 28, 29, 32, 33, 34, 37, 38, 44, 46, 50, 51, 60, 65, 70, 76, 77];
const CHECKER = [22, 42, 49];
const UNCLEAR = [73];

// Games: `k` keyed by "row/qid". set: fields; choice: { index: text }; all: replace in every option.
const G = {
  '52/q11': { explanation: 'A colon after three things sets up the list that follows.' },
  '52/q23': { all: ['a enormous', 'an enormous'] },
  '69/q6': { prompt: 'A scientist found an error in her published data. Which word best fits a neutral report: She had to ______ the mistake publicly.', explanation: 'Acknowledge means to state openly that something is true, the neutral word for correcting the record; confess implies guilt, and concede implies losing an argument.' },
  '43/q2': { choice: { 2: 'The library contains the following: novels, biographies, and magazines.' }, explanation: "A colon introduces a list after a complete sentence, and 'The library contains the following' can stand alone." },
  '32/q1': { explanation: 'Both clauses stay active, with the janitor and the students as the doers, so no unmarked shift occurs.' },
  '32/q30': { explanation: 'All three clauses stay passive, with the budget as the subject receiving each action, so the voice never shifts.' },
  '2/q28': { explanation: 'Them is the object pronoun for the winners, the people the reporters asked.' },
  '58/q18': { choice: { 2: 'shows that a list is about to begin' }, answerIndex: 3, explanation: 'In dialogue, a dash at the end of a line shows the speaker was cut off, usually by another speaker.' },
  '58/q49': { explanation: 'A dash sets up a sharp, punchy payoff after a complete statement.' },
  '29/q26': { choice: { 1: 'put the loss at the end so the sentence lands on it' }, explanation: 'Sentence-final position carries the most weight, so the surprising loss belongs there.' },
  '29/q18': { choice: { 1: 'Every branch is over twenty years old, so the company is closing them.' }, explanation: "So makes clear that the branches' age is the cause and the closing is the result." },
  '20/q25': { choice: { 1: 'While the audience leaned forward, softly, sweetly, the choir sang.' } },
  '20/q21': { explanation: "The main clause 'The team won the championship' comes first, and descriptive phrases are piled on after it: the classic cumulative shape." },
  '20/q14': { choice: { 3: "It is a fragment because 'Because' makes it a dependent clause that cannot stand alone." }, explanation: "Length is not the problem; it has a subject and a verb, but 'Because' leaves the thought unfinished." },
  '20/q38': { choice: { 0: 'Suddenly, with everyone falling silent, out went the lights.' }, explanation: "The main clause 'out went the lights' is held to the very end, which is what makes it periodic and builds suspense." },
  '20/q31': { prompt: 'Which sentence is cumulative, meaning that it begins with the main clause and places additional details toward the end?', explanation: '"The children ran across the lawn, laughing and waving their colorful flags" is cumulative because it begins with the main clause and adds details after it.' },
  '18/q09': { choice: { 2: 'It ends on the missing book, the point the reader is meant to notice' } },
  '18/q44': { choice: { 1: 'It turns two complete sentences into one unpunctuated run-on.' }, explanation: 'Joining two independent clauses with nothing between them creates a fused sentence, a kind of run-on.' },
  '55/q50': { choice: { 1: 'The proof was plain: the map, the ledger, the fingerprints.' }, explanation: 'The colon lands with a snap after the claim, and the list keeps ordinary commas.' },
  '21/q5': { choice: { 2: 'The old theater sat empty on the corner for years, kids daring each other to go inside.' }, explanation: 'The main clause comes first, then an absolute phrase adds the detail without a comma splice.' },
  '68/d32': { explanation: "'Beamed,' 'bounced,' and 'arms wide' all carry warm, positive, loving connotations." },
  '7/q9': { choice: { 0: 'A bus timetable for the summer' } },
  '34/q19': { explanation: 'Changing the first clause to active voice matches the second clause and restores a clear agent.' },
  '67/q7': { choice: { 2: 'AP adds the comma to prevent ambiguity; Chicago uses it in every series.' } },
  '51/q44': { explanation: 'The active verb planted gives way to the passive were mulched, so the shift sits in the second clause.' },
  '19/q19': { prompt: 'A student wrote this fragment: Dashing toward the door, keys jangling, coat half unbuttoned, alarm still shrieking behind her. Which revision is a clear, complete sentence?', explanation: 'Only this version has a main clause of its own, with a subject and a finite verb (keys jangled), in clear natural order.' },
  '19/q15': { explanation: "'Because' makes this a dependent clause that leaves the thought unfinished, so it is a sentence fragment." },
  '11/q14': { explanation: "'After' makes this a dependent clause with no main clause, so it is a fragment." },
  '11/q41': { choice: { 2: 'Although tired and out of breath' } },
  '27/q39': { choice: { 0: 'He searched in the attic, in the closet, and beneath the stairs.' } },
  '27/q9': { prompt: 'I called the office, it was closed. What name does this error have?' },
  '25/q2': { explanation: 'A cumulative sentence leads with the main clause and piles details afterward, so the main point lands first.' },
  '92/q41': { choice: { 2: '32 meters' }, explanation: 'Speed is v(t) = 12 + 3t^2, so the distance is the integral from 0 to 2 of (12 + 3t^2) dt = 24 + 8 = 32 meters.' },
  '36/q47': { choice: { 1: 'an unlikely, hypothetical event' } },
  '36/q07': { explanation: 'Keeping the bridge as the subject puts the focus on the structure, not the designers.' },
  '39/q20': { explanation: 'An imperative keeps the pattern of commands: seal, label, report.' },
  '39/q30': { explanation: "The trees receive the bending, so 'were bent' is passive; the second sentence is active, so the two do not match." },
  '50/q40': { explanation: 'The second clause explains the first, and a semicolon joins two closely related complete sentences.' },
  '28/q36': { explanation: 'Ended is past tense, so the main verb should match: praised.' },
  '28/q03': { explanation: "Making the rain the subject of the sentence foregrounds the storm, matching the writer's purpose." },
  '28/q01': { choice: { 1: 'Change the final item to match: told stories, used humor, and paused at the right moments' } },
  '30/q39': { prompt: 'Choose the sentence that is correctly punctuated and clearly worded.', explanation: 'Only this version stays one clear sentence, with the two verbs of the relative clause joined by and.' },
  '30/q09': { choice: { 0: 'the main point comes first and the details build after it' } },
  '61/q02': { prompt: 'Which version correctly marks the break after the introductory clause?', explanation: '"After the presentation ended, the committee began its discussion." correctly uses a comma to mark the end of the introductory clause.' },
  '61/q21': { explanation: 'The first comma marks the abrupt turn and the second sets off the interrupting wait.' },
  '40/q3x': { choice: { 1: 'The garden was swarmed by bees all afternoon.' } },
  '9/q49': { explanation: 'Whom is the object of thanked, and it refers to the volunteers the coach called.' },
  '59/q15': { prompt: 'A student wrote: Did you finish the essay, Which fix best follows the rule about replacing needed stops?', choice: { 1: 'Change the comma to a question mark.' } },
  '48/q37': { choice: { 1: 'A fragment before the colon' } },
  '48/q20': { choice: { 2: 'Because the words before it are not a complete sentence' } },
  '33/q20': { choice: { 0: 'were compared' }, explanation: "With the doer unnamed, were compared matches the first clause's past passive." },
  '33/q03': { choice: { 1: 'she were' } },
  '37/q28': { choice: { 2: 'The firefighter saved her.' } },
};
// Lessons (collection lessons, by id) and items: exact text replacements inside the row.
const L = {
  424: [['adding 5 to both sides instead of subtracting. That gives x = 17', 'adding 5 to the right side only, instead of subtracting it. That gives x = 17'], ['subtracting 4 again instead of adding. That gives x = 5', 'subtracting 4 from the right side instead of adding it. That gives x = 5']],
  48: [['Adding 4 instead of subtracting it in 3x + 4 = 19. That move', 'Adding 4 to the right side instead of subtracting it in 3x + 4 = 19. That move']],
  193: [['dividing only the left side by 2 gives x + 7 = 17', 'dividing only the 2x by 2 gives x + 7 = 17']],
  2908: [['so only 3 tens were added over four steps and the count', 'so the jump from 70 to 90 adds two tens in one step and the count']],
  3069: [['Sight (Latin) and scope (Greek)', 'Vision (Latin) and scope (Greek)'], ['Rewrite with Latin-family words: ', 'Rewrite with plainer words and no Greek roots: '], ["The writer's history of the living region", "The writer's record of the living region"], ['Same content, Latin-family, and', 'Same content, no Greek roots, and']],
  1220: [['Having checked the locks, she left the house.', 'Having checked the locks before leaving the house.', true], ['Wait, that is not a fragment. Having checked the locks modifies she, and she left the house is the main clause. Let me recheck. The actual fragment here is a trick. All four are complete sentences. The correct answer to the question as written is none of them. I need to fix this question. Let me replace it with a clearer one.', "It has no main clause: 'Having checked' is a phrase with no subject and no finite verb. The other three are complete sentences."]],
};
const ITEMS = { 33639: L[1220] };

const norm = (s) => String(s);
const applyQ = (q, f) => {
  const out = JSON.parse(JSON.stringify(q));
  for (const k of ['prompt', 'explanation', 'answerIndex']) if (k in f) out[k] = f[k];
  if (f.choice) for (const [i, t] of Object.entries(f.choice)) out.choices[Number(i)] = t;
  if (f.all) out.choices = out.choices.map((c) => c.split(f.all[0]).join(f.all[1]));
  return out;
};
const out = { built: '2026-11-06', how: 'Each finding read against its stored row by hand. Not applied anywhere. label: fixed in code (services/game-ordinals.js) with no row change.', findings: [], game_fixes: {}, row_fixes: {}, counts: {} };
const games = found.filter((x) => x.kind === 'game');
const problems = [];
games.forEach((x, i) => {
  const qid = String(x.ref).replace('question ', '');
  const key = `${x.ref_id}/${qid}`;
  const verdict = LABEL.includes(i) ? 'label' : CHECKER.includes(i) ? 'checker' : UNCLEAR.includes(i) ? 'unclear' : 'real';
  if (verdict === 'real' && !G[key]) problems.push(`no fix ${i} ${key}`);
  const fixedText = !!G[key];
  out.findings.push({ kind: 'game', row: x.ref_id, question: qid, verdict, also_text_fix: verdict === 'label' && fixedText ? true : undefined, finding: String(x.why).slice(0, 160) });
});
for (const [key, f] of Object.entries(G)) {
  const [row, qid] = key.split('/');
  const p = db.game_payloads.find((r) => r.id === Number(row));
  const q = p && (p.payload.questions || []).find((y) => String(y.id) === qid);
  if (!q) { problems.push(`no row ${key}`); continue; }
  const fixed = applyQ(q, f);
  if (new Set(fixed.choices).size !== fixed.choices.length) problems.push(`duplicate options ${key}`);
  out.game_fixes[`game_payloads:${row}:${qid}`] = { before: { prompt: q.prompt, choices: q.choices, answerIndex: q.answerIndex, explanation: q.explanation }, after: { prompt: fixed.prompt, choices: fixed.choices, answerIndex: fixed.answerIndex, explanation: fixed.explanation } };
}
const replaceIn = (row, list, label) => {
  let s = JSON.stringify(row);
  const hits = [];
  for (const [a, b] of list) {
    const A = JSON.stringify(a).slice(1, -1); const B = JSON.stringify(b).slice(1, -1);
    if (!s.includes(A)) { problems.push(`${label}: not found: ${a.slice(0, 50)}`); continue; }
    s = s.split(A).join(B);
    hits.push({ from: a, to: b });
  }
  JSON.parse(s);
  return hits;
};
for (const [id, list] of Object.entries(L)) out.row_fixes[`lessons:${id}`] = replaceIn(db.lessons.find((r) => r.id === Number(id)), list, `lesson ${id}`);
for (const [id, list] of Object.entries(ITEMS)) out.row_fixes[`items:${id}`] = replaceIn(db.items.find((r) => r.id === Number(id)), list, `item ${id}`);
// Alignment's section number.
const l4075 = db.lessons.find((r) => r.id === 4075);
const secs = (typeof l4075.sections === 'string' ? JSON.parse(l4075.sections) : l4075.sections) || [];
const at = secs.findIndex((s) => /Alignment/.test(JSON.stringify(s)));
const num4075 = at + 1;
for (const x of found.filter((y) => y.kind !== 'game')) {
  let verdict = 'real';
  if (x.ref_id === 33640) verdict = 'unclear';
  if (x.ref_id === 4075) verdict = num4075 === 2 ? 'checker' : 'real';
  out.findings.push({ kind: x.kind, row: x.ref_id, ref: x.ref, verdict, finding: String(x.why).slice(0, 160) });
}
if (num4075 !== 2) out.row_fixes['lessons:4075'] = replaceIn(l4075, [['The principle of Alignment, stated in Section 2,', `The principle of Alignment, stated in Section ${num4075},`]], 'lesson 4075');
const count = {};
for (const f of out.findings) { const k = `${f.kind}:${f.verdict}`; count[k] = (count[k] || 0) + 1; }
out.counts = count;
fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'fact-gate', 'recheck-fixes.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(count), 'game fixes', Object.keys(out.game_fixes).length, 'row fixes', Object.keys(out.row_fixes).length, 'alignment section', num4075);
if (problems.length) console.log(problems.join('\n'));
