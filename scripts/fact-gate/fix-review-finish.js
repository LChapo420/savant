#!/usr/bin/env node
/**
 * The reviewer's verdict on every proposed stored-text fix, joined with the other families' reads. Writes docs/fact-gate/content-fixes-approved.json (what scripts/apply-content-fixes.js applies)
 * and docs/fact-gate/fix-review.md. Refuses to approve a record no other family called right, or a changed question two blind families did not solve to its key.
 *   DB_FILE=<copy> node scripts/fact-gate/fix-review-finish.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs', 'fact-gate');
const db = JSON.parse(fs.readFileSync(process.env.DB_FILE || 'C:/Users/admin/AppData/Local/Temp/fact-gate/db-copy.json', 'utf8'));
const { records } = JSON.parse(fs.readFileSync(path.join(DOCS, 'fix-review-records.json'), 'utf8'));
const judges = JSON.parse(fs.readFileSync(path.join(DOCS, 'fix-review-judges.json'), 'utf8')).byId;
const recheck = JSON.parse(fs.readFileSync(path.join(DOCS, 'recheck-fixes.json'), 'utf8'));

const P = 'english/proficient';
/** One line each. Game keys: level/question. Part keys: level|part. */
const WHY = {
  [`game:${P}/75/q11`]: 'The keyed option uses a colon; the stored explanation named a comma.',
  [`game:${P}/75/q23`]: '"an enormous", in all four options, so no option is singled out.',
  [`game:${P}/99/q6`]: 'Key is acknowledge; the stored explanation argued for confess. "Neutral report" makes the key the one best word.',
  [`game:${P}/63/q2`]: '"The library contains:" has no complete sentence before the colon; "contains the following:" does. Colon rule checked against the level.',
  [`game:${P}/44/q1`]: 'Key is active in both clauses; the stored explanation called it passive. Prompt now says active, since the all-passive option also avoided a shift.',
  [`game:${P}/44/q30`]: 'The budget receives all three actions; the mayor does not.',
  [`game:${P}/1/q28`]: 'Them stands for the winners, not the reporters.',
  [`game:${P}/73/q18`]: 'A dash at the end of a dialogue line marks a speaker cut off; a replaced option removes the overlap and the key moves to the right place.',
  [`game:${P}/73/q49`]: 'Key is the dash; the stored explanation named a colon.',
  [`game:${P}/36/q26`]: 'The loss, not a "winning detail", is what the sentence should land on.',
  [`game:${P}/36/q18`]: 'The stored key was a fragment; the new one states cause and result with "so".',
  [`game:${P}/22/q25`]: 'The stored key was a fragment. New key keeps the main clause last and adds no word the sentence lacks.',
  [`game:${P}/22/q21`]: 'The main clause in the sentence is "The team won the championship"; the stored explanation quoted one from elsewhere.',
  [`game:${P}/22/q14`]: '"Because she was late" has a subject and a verb; it is a fragment because it is dependent.',
  [`game:${P}/22/q38`]: 'The stored key opened with its main clause, so it was not periodic; the new one ends on it.',
  [`game:${P}/22/q31`]: 'Main clause first is cumulative; the prompt and explanation called it periodic.',
  [`game:${P}/23/q09`]: 'The sentence ends on the missing book, not the borrowed books.',
  [`game:${P}/23/q44`]: 'No punctuation between two clauses is a run-on, not a fragment.',
  [`game:${P}/77/q50`]: 'The keyed option had dashes where the explanation claimed commas; it now has the colon and commas described.',
  [`game:${P}/100/d32`]: '"bright" is not in the line; "arms wide" is.',
  [`game:${P}/6/q9`]: 'A folk tale is also narrative: two right answers. The replacement is not narrative.',
  [`game:${P}/46/q19`]: 'The first clause is the one that changes. Prompt now asks for active voice, since the all-passive option also removed the shift.',
  [`game:${P}/86/q7`]: 'Chicago recommends the serial comma; AP drops it except to prevent confusion (style pages, Chicago Shop Talk). The stored key said Chicago omits it.',
  [`game:${P}/47/q44`]: 'The sentence says "were mulched", not "was watered".',
  [`game:${P}/26/q19`]: 'Stored prompt asked what is true of a fragment and two options were sentences. New prompt has one clear answer.',
  [`game:${P}/26/q15`]: 'The clause has a verb; "Because" is what makes it a fragment.',
  [`game:${P}/12/q14`]: 'The stored explanation quoted "was not ready", which is not in the sentence.',
  [`game:${P}/12/q41`]: '"Although tired, the players kept going" is complete: two right answers. The replacement is a fragment.',
  [`game:${P}/35/q39`]: '"the attic, the closet" are not prepositional phrases; the new key has three, and the explanation no longer calls them objects.',
  [`game:${P}/35/q9`]: 'With no comma the line is a run-on; a comma makes the keyed "comma splice" right.',
  [`game:${P}/33/q2`]: 'The stored explanation gave the final details the emphasis, against its own key.',
  'game:math/calculus_i/9/q41': 'Recomputed: v(t) = 12 + 3t^2, integral from 0 to 2 = 32. Stored 36 integrated 12 + 6t. 32 was not among the wrong options.',
  [`game:${P}/54/q47`]: 'If + were + would is hypothetical; the stored key said a real possibility, against its own explanation.',
  [`game:${P}/54/q07`]: '"The bridge bends" is active; the stored explanation called it passive.',
  [`game:${P}/45/q20`]: 'The key keeps the imperative; the stored explanation spoke of passive commands.',
  [`game:${P}/45/q30`]: '"were bent" is passive; the stored explanation said the trees act.',
  [`game:${P}/68/q40`]: 'The stored explanation argued for the dash against its key. The proposed "explains" argued for a colon, so prompt and explanation now rest on the semicolon rule alone.',
  [`game:${P}/37/q36`]: 'Ended is past, so praised; the stored explanation defended the present against its key.',
  [`game:${P}/37/q03`]: 'The rain is the subject and the verb is active; the stored explanation said passive.',
  [`game:${P}/37/q01`]: 'The stored key spoke of verbs not in the sentence. The new one names the real fix.',
  [`game:${P}/32/q39`]: 'Stored prompt had a blank and no pattern; the verbs are joined inside a relative clause, not two clauses.',
  [`game:${P}/32/q09`]: 'The main point of a cumulative sentence comes first; the stored key described a periodic one.',
  [`game:${P}/85/q02`]: '"After the presentation ended" is a clause, not a prepositional phrase.',
  [`game:${P}/85/q21`]: 'The keyed option has commas and no dash.',
  [`game:${P}/57/q3x`]: '"was swarming with" is active; "was swarmed by" is the passive the prompt asks for.',
  [`game:${P}/14/q49`]: 'Whom is the object of thanked only.',
  [`game:${P}/79/q15`]: 'The options speak of a comma and the stem had none, and the keyed period is wrong for a question. Stem now shows the comma; key is the question mark.',
  [`game:${P}/69/q37`]: 'The rule concerns what comes before the colon.',
  [`game:${P}/69/q20`]: '"My hobbies are" is not a complete sentence; the key said it was.',
  [`game:${P}/42/q20`]: 'First clause is past passive, so "were compared".',
  [`game:${P}/42/q03`]: 'No "if" after wish. "she had gone" also made a good sentence, so that wrong option is replaced.',
  [`game:${P}/53/q28`]: '"The firefighter was saved by her" is also passive: two right answers. The replacement is active.',
  [`plan:${P}/10|block 4`]: 'Second clause glued on leads to the fix; the yes and no were swapped.',
  [`plan:${P}/10|block 7`]: 'The sentence has a dependent clause with its own subject and verb. Kept the stored tip: the proposed "exactly one independent clause" is false for a compound sentence.',
  [`plan:${P}/10|block 5`]: '"an explained-by".',
  [`plan:${P}/18|block 5`]: 'The Although clause is attached, not standing alone; the real faults are a splice, a run-on and a missing comma. Rewrites both name them.',
  [`plan:${P}/20|block 0`]: 'Option B had different words and no delay. It now holds the same facts, withheld.',
  [`plan:${P}/20|block 8`]: 'Choice D has no comma at all.',
  [`plan:${P}/20|block 9`]: 'A fragment can have a subject and a verb; the new definition covers dependent clauses.',
  [`plan:${P}/29|block 3`]: 'Line 1 has two clauses and no coach; line 3 has one verb.',
  [`plan:${P}/28|block 0`]: 'The round has four solution chunks; "three" did not match it. Sibling definitions unaffected.',
  [`plan:${P}/28|block 2`]: 'Lines 2 and 7 are both fragments: two, not one. Line 7 has a finite verb, will devour.',
  [`plan:${P}/19|block 5`]: 'The task is one sentence and the facts are the bake sale and the shifts; the funds were not in it, and a two-sentence answer did not fit.',
  [`plan:${P}/19|check 4`]: 'Half answers ("semicolon") go. Kept "period, semicolon" and "period or semicolon", which the proposal dropped although they are right.',
  [`plan:${P}/30|block 2`]: '"Silence, never again." has no verb; the example is a fronted phrase in a full sentence.',
  [`plan:${P}/30|block 5`]: 'Four cautions, not three; the example now follows a full sentence, as the rule asks.',
  [`plan:${P}/39|block 0`]: '"Flying" is a verb form, but not finite: "no verb anywhere" was false.',
  [`plan:${P}/39|block 4`]: 'The verbs are close, update, ask; "closing, moving, asking" are not in the line.',
  [`plan:${P}/39|check 0`]: 'Three clauses have two joins: two splices, not three.',
  [`plan:${P}/38|block 0`]: '"Fix 4 of 3" impossible.',
  [`plan:${P}/40|block 0`]: 'Titles and tones were on the wrong options: A is the jolting one.',
  [`plan:${P}/52|block 4`]: 'Win + would mixes tenses; the level\'s rule card gives if + will for a situation that could happen.',
  [`plan:${P}/50|block 4`]: 'One fused join and one comma splice, counted in the sentence.',
  [`plan:${P}/50|block 5`]: 'The example has a verb, "took": only the subject is missing.',
  [`plan:${P}/50|check 2`]: 'The stem has no mood shift to fix; the prompt now asks for the command the key gives.',
  [`plan:${P}/70|block 4`]: 'The statement is about "were".',
  [`plan:${P}/71|block 4`]: 'The line in error is "its"; the message spoke of colons and semicolons.',
  [`plan:${P}/49|block 2`]: 'Line 4 held a passive while its explanation said active; the line is now active.',
  [`plan:${P}/49|block 4`]: '"Now." is not in the sentence, which ends "act now"; the option is reframed on the real shift. Key unchanged.',
  [`plan:${P}/82|block 3`]: 'No 2014 change is on record. Chicago\'s own Q&A says it has not frowned on a split since the thirteenth edition (1983). Proposed "by 1993" had no source; corrected to "by the 1980s".',
  [`plan:${P}/82|block 8`]: 'Same date. AP wording taken from its verb entry as quoted: a split that is not awkward and is needed for the meaning.',
  [`plan:${P}/81|block 3`]: '"who lives in Denver" is a relative clause, not an appositive.',
  [`plan:${P}/81|block 4`]: '"Because it was raining" has a subject and a verb. Feedback changed too, as it still said to give it both.',
  [`plan:${P}/81|check 3`]: 'The dash is not the fault; the missing independent clause is. Key shortened, no accepts list added.',
  [`plan:${P}/80|check 3`]: 'The keyed sentence is active; its text said "to passive".',
  [`plan:${P}/72|block 6`]: 'As stored two options were right. The dash option now lacks its end mark. Reasoning no longer counts options by a number the learner does not see.',
  [`plan:${P}/92|block 5`]: '"no trash talking allowed" is not a clause, so no splice; semicolons have a second use.',
  [`plan:${P}/95|block 2`]: 'Counted: "got" appears twice in the draft.',
  [`plan:${P}/95|block 7`]: '"our fewer players" was broken; "fewer of our players".',
  [`plan:${P}/95|block 9`]: '"bunch of stuff" was vague and unmarked, so "there are four" failed. Paragraph corrected to match its tokens, which the proposal missed.',
  [`plan:${P}/95|check 0`]: 'Lazy and slow do not describe checking twice.',
  [`plan:${P}/95|check 4`]: 'The check said to type a letter and showed no options. Options now in the prompt; key B matches the stored rationale. No choices field on a typed check.',
  [`plan:${P}/91|block 4`]: 'Line 5 has no "Honestly"; the remark moves to line 3, where it is.',
  [`plan:${P}/91|check 4`]: 'Two ands make a long sentence, not a run-on; the new key is fused.',
  'plan:spanish/advanced/108|block 5': 'Muy does not mean a lot. Mucho as very much is only in phrases like me gusta mucho.',
  'plan:spanish/advanced/163|block 0': '"always" was false: es una cantante colombiana takes the article.',
  'plan:spanish/entry/16|block 4': 'Counted: four blanks.',
  'plan:spanish/advanced/80|block 5': '"Only" was false: -án, -ón, -ín also take -a (holgazana, mandona; Spanish grammar pages).',
  'plan:spanish/entry/42|check 1': 'The prompt asks for one word; "diez y ocho" is three.',
  'plan:spanish/intermediate/97|check 2': '"qué día es" leaves out today. Kept the stored rationale: the proposal put grader notes in text the learner reads.',
};
const REJECT = {
  [`game:${P}/24/q5`]: { verdict: 'wrong', why: 'Stale: this question was rewritten and released on 4 Nov. The fix describes text no longer stored, on the server copy it is a mismatch.' },
};
const ROWS = {
  'lessons:48': { verdict: 'unsure', why: 'Per-learner row, not applied. Literally, 4 added to the right side leaves 3x + 4 = 23, not 3x = 23: still loose.' },
  'lessons:193': { verdict: 'right', why: 'Per-learner row, not applied. Recomputed: x + 7 = 17, x = 10, 2(10) + 7 = 27.' },
  'lessons:424': { verdict: 'unsure', why: 'Per-learner row, not applied. Literally, the right side alone gives x + 5 = 17 and x - 4 = 5, not x = 17 and x = 5: still loose.' },
  'lessons:1220': { verdict: 'right', why: 'Per-learner row (the admin account), not applied. Stored rationale was model working; new key is a fragment.' },
  'lessons:2908': { verdict: 'right', why: 'Per-learner row (the admin account), not applied. Recomputed jumps 10, 20, 10.' },
  'lessons:3069': { verdict: 'right', why: 'Per-learner row (the admin account), not applied. Sight is Old English and history Greek; vision and record are Latin.' },
  'items:33639': { verdict: 'right', why: 'Not applied: a served item with a learner\'s answer on it. Changing it would rewrite history, and it is never served again.' },
};

const sha = (v) => require('crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex'); // eslint-disable-line global-require
const leafDiff = (a, b, p = [], out = []) => {
  const obj = (x) => x && typeof x === 'object';
  if (obj(a) && obj(b) && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) leafDiff(a[k], b[k], [...p, k], out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(b === undefined ? { path: p, old: a } : { path: p, old: a === undefined ? null : a, new: b });
  return out;
};
function spanishFromBuild(r) {
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'spanish-prewritten', r.grade_id, `level-${String(r.level).padStart(3, '0')}.json`), 'utf8'));
  const row = db.block_plans.find((p) => !p.user_id && p.status === 'ready' && p.track_id === r.track_id && p.grade_id === r.grade_id && p.level === r.level);
  const was = r.part === 'check' ? row.checks[r.index] : row.blocks.find((b, k) => (b.index ?? k) === r.index).data;
  const now = r.part === 'check' ? file.checks[r.index] : file.blocks.find((b, k) => (b.index ?? k) === r.index).data;
  if (sha({ approach: file.approach, coverage: file.coverage, blocks: file.blocks, checks: file.checks }) !== file.prewritten.sha256) throw new Error(`${r.id}: the built file does not match its hash`);
  const rowEdits = [{ path: ['prewritten', 'sha256'], old: row.prewritten.sha256, new: file.prewritten.sha256 }];
  return { edits: leafDiff(was, now), row_edits: rowEdits };
}

const FAM = { kimi31: 'Kimi K3.1 Pro', grok43: 'grok-4.3', glm_flash_zgpu: 'GLM-5.3 Flash' };
const approved = []; const lines = []; const rejected = [];
for (const r of records) {
  const j = judges[r.id] || { review: {}, blind: {} };
  const votes = Object.entries(j.review);
  const say = votes.map(([m, v]) => `${FAM[m]}: ${v.verdict}`).join(', ');
  const blind = Object.entries(j.blind);
  const blindSay = blind.length ? ` Blind: ${blind.map(([m, b]) => `${FAM[m]} ${b.option === b.key && !(b.also || []).length ? 'solved to the key' : `picked ${b.option}${(b.also || []).length ? ` and ${b.also}` : ''}`}`).join(', ')}.` : '';
  if (REJECT[r.id]) { lines.push({ id: r.id, verdict: REJECT[r.id].verdict, apply: 'no', why: REJECT[r.id].why, reads: say + blindSay }); rejected.push(r.id); continue; }
  if (!WHY[r.id]) throw new Error(`no verdict for ${r.id}`);
  if (!votes.length || votes.some(([, v]) => v.verdict !== 'right')) throw new Error(`${r.id}: not every other family says right: ${say}`);
  const hashField = r.store === 'game_payloads' && r.edits.some((e) => ['prompt', 'choices', 'answerIndex'].includes(e.path[0]));
  if (hashField && (blind.length < 2 || blind.some(([, b]) => b.option !== b.key || (b.also || []).length))) throw new Error(`${r.id}: changed question not solved blind to its key by two families: ${blindSay}`);
  const out = { id: r.id, store: r.store, track_id: r.track_id, grade_id: r.grade_id, level: r.level, edits: r.edits };
  if (r.store === 'game_payloads') out.qid = r.qid; else { out.part = r.part; out.index = r.index; }
  if (r.prewritten) Object.assign(out, spanishFromBuild(r));
  approved.push(out);
  lines.push({ id: r.id, verdict: 'right', apply: 'yes', corrected: !!r.amended, why: WHY[r.id], correction: r.amended, reads: say + blindSay, where: r.store === 'game_payloads' ? (r.id.endsWith('/14/q49') ? 'database, base-levels file' : 'database') : (r.prewritten ? 'database, Spanish source' : 'database, base-levels file') });
}
fs.writeFileSync(path.join(DOCS, 'content-fixes-approved.json'), `${JSON.stringify({ built: 'scripts/fact-gate/fix-review-finish.js', note: 'Only reviewed, cross-checked fixes to shared rows. Verdicts: fix-review.md.', records: approved }, null, 1)}\n`);

const rowLines = Object.entries(recheck.row_fixes).map(([k, fx]) => {
  const j = judges[`row:${k}`] || { review: {} };
  return { id: k, verdict: ROWS[k].verdict, apply: 'no', why: ROWS[k].why, reads: Object.entries(j.review).map(([m, v]) => `${FAM[m]}: ${v.verdict}`).join(', '), n: fx.length };
});
const count = (l, f) => l.filter(f).length;
const md = [
  '# Review of the stored content fixes (7 Nov 2026)',
  '',
  'Every proposed fix in `recheck-fixes.json` and `audit-fixes.json`, read against what it changes and the whole question or part around it. AI-judged and read by hand; no learner was involved, and a checked fix is not proof of truth.',
  '',
  'How a fix was read: one reviewer (Claude, the family that wrote the recheck proposals) read each one with its part; Kimi K3.1 Pro, grok-4.3 and GLM-5.3 Flash each gave a verdict, the family that proposed a fix not voting on it; multiple-choice questions and trap parts were solved blind by two families with the key withheld. Sums were recomputed in code. An approved record has every other family saying right, and a changed game question has two blind solves on its key with no second right answer. Where a read or the validators found the proposal wrong, the wording was corrected and read again from scratch: those are marked corrected.',
  '',
  `**Applied: ${approved.length}** (${count(lines, (l) => l.apply === 'yes' && !l.corrected)} as proposed, ${count(lines, (l) => l.apply === 'yes' && l.corrected)} corrected first). **Rejected: ${rejected.length}.** **Not applied, per-learner rows: ${rowLines.length}** (out of scope: ${count(rowLines, (l) => l.verdict === 'right')} right on content, ${count(rowLines, (l) => l.verdict === 'unsure')} unsure).`,
  '',
  '## Where they live, and running it',
  '',
  '- **Database only:** 51 game questions (`game_payloads`, shared rows). Levels are found by subject, grade and level, so row numbers do not matter.',
  '- **Database and `content/base-levels/english-proficient.json`:** 42 English lesson parts and 1 game question (`block_plans`, `game_payloads`). The file is fixed on this branch; a data file already holding the level never takes it from the file, so the database needs the script.',
  "- **Database and `content/spanish-prewritten/`:** 6 Spanish parts. Sources fixed and built on this branch; the script also moves each row's `prewritten.sha256`, so `scripts/import-spanish-prewritten.js` still says unchanged.",
  '- **Nothing lives in code or config.** Old copies that were not changed: `public*/base-lesson-scripts/english/proficient/level-*-0.js` (nothing links to them; the route names scripts by hash) and `curriculum-build/staged/` (archives).',
  '- **Not in reach:** per-learner rows. The server copy held 0 per-learner plans and 0 per-learner games with old text.',
  '',
  'Dry run on a throwaway copy of the live data (7 Nov): 100 to apply, 60 rows, 25 release hashes moved, 0 mismatches once the rejected record is out; it was the only mismatch before. After a write on the copy: a second run finds 100 already done, nothing written. After the start-up passes (`importAll`, `game-fixes applyAll`): still 100 already done, 52 questions in the baked page, all served, 48 parts holding the text. `--revert`: 100 reverted, same data as before (key order aside; the backup is byte for byte).',
  '',
  '**On each later start, the log says "Game fixes left alone (stored content differs): 4"**: levels 22 (q31, q38), 63 (q2), 85 (q02) in `content/game-fixes/english-proficient.json`. It is the safe branch, and nothing is overwritten; tested.',
  '',
  'Run it, with the app stopped, since it holds the data in memory:',
  '',
  '```',
  'scp scripts/apply-content-fixes.js docs/fact-gate/content-fixes-approved.json root@192.209.63.151:/tmp/',
  'ssh root@192.209.63.151',
  'chmod a+r /tmp/apply-content-fixes.js /tmp/content-fixes-approved.json',
  'systemctl stop savant',
  'runuser -u savant -- node /tmp/apply-content-fixes.js --db /srv/savant/data/db.json --fixes /tmp/content-fixes-approved.json',
  'runuser -u savant -- node /tmp/apply-content-fixes.js --db /srv/savant/data/db.json --fixes /tmp/content-fixes-approved.json --write',
  'systemctl start savant',
  '```',
  '',
  'The first of those two is the dry run: expect 100 to apply, 0 mismatches. The write prints the backup and journal paths, beside the data file. Reverse, app stopped: `runuser -u savant -- node /tmp/apply-content-fixes.js --db /srv/savant/data/db.json --revert <journal> --write`, or copy the backup back.',
  '',
  '## What remains wrong or unchecked',
  '',
  '- 19 parts in `audit-fixes.json` `not_certain` were left for a person, and were outside this review.',
  '- Reads judge the changed part, not the whole level. Text a fix did not touch can still be wrong: level 22 q25 has stray ".," in two wrong options; level 53 q28 has "She were saved" and "She be saved" as wrong options.',
  '- The Chicago date rests on its Q&A as shown in a search result (the page itself is behind a login). The AP and Chicago rules come from secondary style pages quoting them; neither manual was read.',
  '- Every family here can believe the same wrong thing. A clean read is checked, not proven true.',
  '',
  '## Rejected and not applied',
  '',
  '| Record | Verdict | Why | Other families |',
  '|---|---|---|---|',
  ...lines.filter((l) => l.apply === 'no').map((l) => `| ${l.id} | ${l.verdict} | ${l.why} | ${l.reads} |`),
  ...rowLines.map((l) => `| ${l.id} (${l.n} replacements) | ${l.verdict} | ${l.why} | ${l.reads} |`),
  '',
  '## Corrected before approval (what was wrong with the proposal)',
  '',
  ...lines.filter((l) => l.corrected).map((l) => `- **${l.id}**: ${l.correction}.`),
  '',
  '## Applied',
  '',
  '| Record | Verdict | Why | Where | Other families and blind solves |',
  '|---|---|---|---|---|',
  ...lines.filter((l) => l.apply === 'yes').map((l) => `| ${l.id}${l.corrected ? ' (corrected)' : ''} | ${l.verdict} | ${l.why} | ${l.where} | ${l.reads} |`),
  '',
].join('\n').replace(/\|(?=[^|\n]*block \d)/g, '|');
fs.writeFileSync(path.join(DOCS, 'fix-review.md'), md);
console.log(`approved ${approved.length}, rejected ${rejected.length}, rows ${rowLines.length}, corrected ${count(lines, (l) => l.corrected)}, leaf edits ${approved.reduce((n, a) => n + a.edits.length, 0)}`);
