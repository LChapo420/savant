# Review of the stored content fixes (7 Nov 2026)

Every proposed fix in `recheck-fixes.json` and `audit-fixes.json`, read against what it changes and the whole question or part around it. AI-judged and read by hand; no learner was involved, and a checked fix is not proof of truth.

How a fix was read: one reviewer (Claude, the family that wrote the recheck proposals) read each one with its part; Kimi K3.1 Pro, grok-4.3 and GLM-5.3 Flash each gave a verdict, the family that proposed a fix not voting on it; multiple-choice questions and trap parts were solved blind by two families with the key withheld. Sums were recomputed in code. An approved record has every other family saying right, and a changed game question has two blind solves on its key with no second right answer. Where a read or the validators found the proposal wrong, the wording was corrected and read again from scratch: those are marked corrected.

**Applied: 100** (77 as proposed, 23 corrected first). **Rejected: 1.** **Not applied, per-learner rows: 7** (out of scope: 5 right on content, 2 unsure).

## Where they live, and running it

- **Database only:** 51 game questions (`game_payloads`, shared rows). Levels are found by subject, grade and level, so row numbers do not matter.
- **Database and `content/base-levels/english-proficient.json`:** 42 English lesson parts and 1 game question (`block_plans`, `game_payloads`). The file is fixed on this branch; a data file already holding the level never takes it from the file, so the database needs the script.
- **Database and `content/spanish-prewritten/`:** 6 Spanish parts. Sources fixed and built on this branch; the script also moves each row's `prewritten.sha256`, so `scripts/import-spanish-prewritten.js` still says unchanged.
- **Nothing lives in code or config.** Old copies that were not changed: `public*/base-lesson-scripts/english/proficient/level-*-0.js` (nothing links to them; the route names scripts by hash) and `curriculum-build/staged/` (archives).
- **Not in reach:** per-learner rows. The server copy held 0 per-learner plans and 0 per-learner games with old text.

Dry run on a throwaway copy of the live data (7 Nov): 100 to apply, 60 rows, 25 release hashes moved, 0 mismatches once the rejected record is out; it was the only mismatch before. After a write on the copy: a second run finds 100 already done, nothing written. After the start-up passes (`importAll`, `game-fixes applyAll`): still 100 already done, 52 questions in the baked page, all served, 48 parts holding the text. `--revert`: 100 reverted, same data as before (key order aside; the backup is byte for byte).

**On each later start, the log says "Game fixes left alone (stored content differs): 4"**: levels 22 (q31, q38), 63 (q2), 85 (q02) in `content/game-fixes/english-proficient.json`. It is the safe branch, and nothing is overwritten; tested.

Run it, with the app stopped, since it holds the data in memory:

```
scp scripts/apply-content-fixes.js docs/fact-gate/content-fixes-approved.json root@192.209.63.151:/tmp/
ssh root@192.209.63.151
chmod a+r /tmp/apply-content-fixes.js /tmp/content-fixes-approved.json
systemctl stop savant
runuser -u savant -- node /tmp/apply-content-fixes.js --db /srv/savant/data/db.json --fixes /tmp/content-fixes-approved.json
runuser -u savant -- node /tmp/apply-content-fixes.js --db /srv/savant/data/db.json --fixes /tmp/content-fixes-approved.json --write
systemctl start savant
```

The first of those two is the dry run: expect 100 to apply, 0 mismatches. The write prints the backup and journal paths, beside the data file. Reverse, app stopped: `runuser -u savant -- node /tmp/apply-content-fixes.js --db /srv/savant/data/db.json --revert <journal> --write`, or copy the backup back.

## What remains wrong or unchecked

- 19 parts in `audit-fixes.json` `not_certain` were left for a person, and were outside this review.
- Reads judge the changed part, not the whole level. Text a fix did not touch can still be wrong: level 22 q25 has stray ".," in two wrong options; level 53 q28 has "She were saved" and "She be saved" as wrong options.
- The Chicago date rests on its Q&A as shown in a search result (the page itself is behind a login). The AP and Chicago rules come from secondary style pages quoting them; neither manual was read.
- Every family here can believe the same wrong thing. A clean read is checked, not proven true.

## Rejected and not applied

| Record | Verdict | Why | Other families |
|---|---|---|---|
| game:english/proficient/24/q5 | wrong | Stale: this question was rewritten and released on 4 Nov. The fix describes text no longer stored, on the server copy it is a mismatch. | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| lessons:48 (1 replacements) | unsure | Per-learner row, not applied. Literally, 4 added to the right side leaves 3x + 4 = 23, not 3x = 23: still loose. | grok-4.3: right, GLM-5.3 Flash: right |
| lessons:193 (1 replacements) | right | Per-learner row, not applied. Recomputed: x + 7 = 17, x = 10, 2(10) + 7 = 27. | GLM-5.3 Flash: right, grok-4.3: right |
| lessons:424 (2 replacements) | unsure | Per-learner row, not applied. Literally, the right side alone gives x + 5 = 17 and x - 4 = 5, not x = 17 and x = 5: still loose. | grok-4.3: unsure, GLM-5.3 Flash: right |
| lessons:1220 (2 replacements) | right | Per-learner row (the admin account), not applied. Stored rationale was model working; new key is a fragment. | grok-4.3: wrong, GLM-5.3 Flash: right |
| lessons:2908 (1 replacements) | right | Per-learner row (the admin account), not applied. Recomputed jumps 10, 20, 10. | grok-4.3: unsure, GLM-5.3 Flash: right |
| lessons:3069 (4 replacements) | right | Per-learner row (the admin account), not applied. Sight is Old English and history Greek; vision and record are Latin. | grok-4.3: right, GLM-5.3 Flash: right |
| items:33639 (2 replacements) | right | Not applied: a served item with a learner's answer on it. Changing it would rewrite history, and it is never served again. | grok-4.3: right, GLM-5.3 Flash: right |

## Corrected before approval (what was wrong with the proposal)

- **game:english/proficient/44/q1**: the all-passive option also avoided a shift: two right answers.
- **game:english/proficient/22/q25**: as proposed the key stood out by length, and added "sweetly" to a sentence that has no such word.
- **game:english/proficient/22/q14**: as proposed the key stood out by length.
- **game:english/proficient/23/q09**: the proposal lost the full stop every other option has.
- **game:english/proficient/6/q9**: as proposed the key stood out by length.
- **game:english/proficient/46/q19**: the all-passive option also removed the shift: two right answers (both blind readers said so).
- **game:english/proficient/26/q19**: the proposal added a full stop no other option has, and its "only" was false: the passive option also has a main clause.
- **game:english/proficient/35/q39**: the kept explanation called the phrases "objects".
- **game:english/proficient/54/q47**: as proposed the key stood out by length.
- **game:english/proficient/68/q40**: the proposal said the second clause explains the first, which argues for the colon; dash, colon and semicolon were all right as asked.
- **game:english/proficient/37/q01**: as proposed the key stood out by length.
- **game:english/proficient/79/q15**: the proposal ran the student's line into the question with no separator.
- **game:english/proficient/42/q03**: "I wish she had gone on time today" is also a good sentence: two right answers.
- **plan:english/proficient/10|block 7**: "exactly one independent clause" is false for a correct compound sentence; the stored tip matches the level's own rule card, so it stays.
- **plan:english/proficient/19|check 4**: the proposal also dropped the right answers "period, semicolon" and "period or semicolon"; only the half answers go.
- **plan:english/proficient/82|block 3**: "by 1993" has no source; Chicago's own Q&A dates the change to its thirteenth edition.
- **plan:english/proficient/82|block 8**: same date; AP wording taken from its verb entry as quoted.
- **plan:english/proficient/81|block 4**: the kept feedback said to give it a subject and verb, which the new example already has.
- **plan:english/proficient/81|check 3**: a multiple choice check has no use for a new accepts list, and as proposed the key stood out by length.
- **plan:english/proficient/72|block 6**: the proposal named options by a number the learner does not see, and "option 3" counted from zero points at the right answer.
- **plan:english/proficient/95|block 9**: the proposal changed the paragraph without its tokens: the two would have read differently.
- **plan:english/proficient/95|check 4**: the check stays typed; choices on a typed check do nothing.
- **plan:spanish/intermediate/97|check 2**: the proposal put grader notes in the text a learner reads; the stored line is right.

## Applied

| Record | Verdict | Why | Where | Other families and blind solves |
|---|---|---|---|---|
| game:english/proficient/75/q11 | right | The keyed option uses a colon; the stored explanation named a comma. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/75/q23 | right | "an enormous", in all four options, so no option is singled out. | database | GLM-5.3 Flash: right, Kimi K3.1 Pro: right, grok-4.3: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/99/q6 | right | Key is acknowledge; the stored explanation argued for confess. "Neutral report" makes the key the one best word. | database | grok-4.3: right, Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/63/q2 | right | "The library contains:" has no complete sentence before the colon; "contains the following:" does. Colon rule checked against the level. | database | Kimi K3.1 Pro: right, grok-4.3: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/44/q1 (corrected) | right | Key is active in both clauses; the stored explanation called it passive. Prompt now says active, since the all-passive option also avoided a shift. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/44/q30 | right | The budget receives all three actions; the mayor does not. | database | Kimi K3.1 Pro: right, grok-4.3: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/1/q28 | right | Them stands for the winners, not the reporters. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/73/q18 | right | A dash at the end of a dialogue line marks a speaker cut off; a replaced option removes the overlap and the key moves to the right place. | database | Kimi K3.1 Pro: right, grok-4.3: right, GLM-5.3 Flash: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/73/q49 | right | Key is the dash; the stored explanation named a colon. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/36/q26 | right | The loss, not a "winning detail", is what the sentence should land on. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/36/q18 | right | The stored key was a fragment; the new one states cause and result with "so". | database | Kimi K3.1 Pro: right, grok-4.3: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/22/q25 (corrected) | right | The stored key was a fragment. New key keeps the main clause last and adds no word the sentence lacks. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/22/q21 | right | The main clause in the sentence is "The team won the championship"; the stored explanation quoted one from elsewhere. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/22/q14 (corrected) | right | "Because she was late" has a subject and a verb; it is a fragment because it is dependent. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/22/q38 | right | The stored key opened with its main clause, so it was not periodic; the new one ends on it. | database | Kimi K3.1 Pro: right, grok-4.3: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/22/q31 | right | Main clause first is cumulative; the prompt and explanation called it periodic. | database | GLM-5.3 Flash: right, grok-4.3: right, Kimi K3.1 Pro: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/23/q09 (corrected) | right | The sentence ends on the missing book, not the borrowed books. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/23/q44 | right | No punctuation between two clauses is a run-on, not a fragment. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/77/q50 | right | The keyed option had dashes where the explanation claimed commas; it now has the colon and commas described. | database | Kimi K3.1 Pro: right, grok-4.3: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/100/d32 | right | "bright" is not in the line; "arms wide" is. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/6/q9 (corrected) | right | A folk tale is also narrative: two right answers. The replacement is not narrative. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/46/q19 (corrected) | right | The first clause is the one that changes. Prompt now asks for active voice, since the all-passive option also removed the shift. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/86/q7 | right | Chicago recommends the serial comma; AP drops it except to prevent confusion (style pages, Chicago Shop Talk). The stored key said Chicago omits it. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/47/q44 | right | The sentence says "were mulched", not "was watered". | database | GLM-5.3 Flash: right, Kimi K3.1 Pro: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/26/q19 (corrected) | right | Stored prompt asked what is true of a fragment and two options were sentences. New prompt has one clear answer. | database | GLM-5.3 Flash: right, Kimi K3.1 Pro: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/26/q15 | right | The clause has a verb; "Because" is what makes it a fragment. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/12/q14 | right | The stored explanation quoted "was not ready", which is not in the sentence. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/12/q41 | right | "Although tired, the players kept going" is complete: two right answers. The replacement is a fragment. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/35/q39 (corrected) | right | "the attic, the closet" are not prepositional phrases; the new key has three, and the explanation no longer calls them objects. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/35/q9 | right | With no comma the line is a run-on; a comma makes the keyed "comma splice" right. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/33/q2 | right | The stored explanation gave the final details the emphasis, against its own key. | database | GLM-5.3 Flash: right, Kimi K3.1 Pro: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:math/calculus_i/9/q41 | right | Recomputed: v(t) = 12 + 3t^2, integral from 0 to 2 = 32. Stored 36 integrated 12 + 6t. 32 was not among the wrong options. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/54/q47 (corrected) | right | If + were + would is hypothetical; the stored key said a real possibility, against its own explanation. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/54/q07 | right | "The bridge bends" is active; the stored explanation called it passive. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/45/q20 | right | The key keeps the imperative; the stored explanation spoke of passive commands. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/45/q30 | right | "were bent" is passive; the stored explanation said the trees act. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/68/q40 (corrected) | right | The stored explanation argued for the dash against its key. The proposed "explains" argued for a colon, so prompt and explanation now rest on the semicolon rule alone. | database | grok-4.3: right, Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/37/q36 | right | Ended is past, so praised; the stored explanation defended the present against its key. | database | Kimi K3.1 Pro: right, grok-4.3: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/37/q03 | right | The rain is the subject and the verb is active; the stored explanation said passive. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/37/q01 (corrected) | right | The stored key spoke of verbs not in the sentence. The new one names the real fix. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/32/q39 | right | Stored prompt had a blank and no pattern; the verbs are joined inside a relative clause, not two clauses. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/32/q09 | right | The main point of a cumulative sentence comes first; the stored key described a periodic one. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/85/q02 | right | "After the presentation ended" is a clause, not a prepositional phrase. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/85/q21 | right | The keyed option has commas and no dash. | database | GLM-5.3 Flash: right, grok-4.3: right, Kimi K3.1 Pro: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/57/q3x | right | "was swarming with" is active; "was swarmed by" is the passive the prompt asks for. | database | GLM-5.3 Flash: right, grok-4.3: right, Kimi K3.1 Pro: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/14/q49 | right | Whom is the object of thanked only. | database, base-levels file | GLM-5.3 Flash: right, Kimi K3.1 Pro: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/79/q15 (corrected) | right | The options speak of a comma and the stem had none, and the keyed period is wrong for a question. Stem now shows the comma; key is the question mark. | database | GLM-5.3 Flash: right, Kimi K3.1 Pro: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/69/q37 | right | The rule concerns what comes before the colon. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/69/q20 | right | "My hobbies are" is not a complete sentence; the key said it was. | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/42/q20 | right | First clause is past passive, so "were compared". | database | Kimi K3.1 Pro: right, GLM-5.3 Flash: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| game:english/proficient/42/q03 (corrected) | right | No "if" after wish. "she had gone" also made a good sentence, so that wrong option is replaced. | database | Kimi K3.1 Pro: right, grok-4.3: right, GLM-5.3 Flash: right Blind: grok-4.3 solved to the key, GLM-5.3 Flash solved to the key. |
| game:english/proficient/53/q28 | right | "The firefighter was saved by her" is also passive: two right answers. The replacement is active. | database | GLM-5.3 Flash: right, Kimi K3.1 Pro: right, grok-4.3: right Blind: GLM-5.3 Flash solved to the key, grok-4.3 solved to the key. |
| plan:english/proficient/10|block 4 | right | Second clause glued on leads to the fix; the yes and no were swapped. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/10|block 7 (corrected) | right | The sentence has a dependent clause with its own subject and verb. Kept the stored tip: the proposed "exactly one independent clause" is false for a compound sentence. | database, base-levels file | Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:english/proficient/10|block 5 | right | "an explained-by". | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/18|block 5 | right | The Although clause is attached, not standing alone; the real faults are a splice, a run-on and a missing comma. Rewrites both name them. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/20|block 0 | right | Option B had different words and no delay. It now holds the same facts, withheld. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/20|block 8 | right | Choice D has no comma at all. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right Blind: Kimi K3.1 Pro solved to the key, grok-4.3 solved to the key. |
| plan:english/proficient/20|block 9 | right | A fragment can have a subject and a verb; the new definition covers dependent clauses. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/29|block 3 | right | Line 1 has two clauses and no coach; line 3 has one verb. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/28|block 0 | right | The round has four solution chunks; "three" did not match it. Sibling definitions unaffected. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/28|block 2 | right | Lines 2 and 7 are both fragments: two, not one. Line 7 has a finite verb, will devour. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/19|block 5 | right | The task is one sentence and the facts are the bake sale and the shifts; the funds were not in it, and a two-sentence answer did not fit. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/19|check 4 (corrected) | right | Half answers ("semicolon") go. Kept "period, semicolon" and "period or semicolon", which the proposal dropped although they are right. | database, base-levels file | GLM-5.3 Flash: right, Kimi K3.1 Pro: right |
| plan:english/proficient/30|block 2 | right | "Silence, never again." has no verb; the example is a fronted phrase in a full sentence. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/30|block 5 | right | Four cautions, not three; the example now follows a full sentence, as the rule asks. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/39|block 0 | right | "Flying" is a verb form, but not finite: "no verb anywhere" was false. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/39|block 4 | right | The verbs are close, update, ask; "closing, moving, asking" are not in the line. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/39|check 0 | right | Three clauses have two joins: two splices, not three. | database, base-levels file | Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:english/proficient/38|block 0 | right | "Fix 4 of 3" impossible. | database, base-levels file | grok-4.3: right, Kimi K3.1 Pro: right |
| plan:english/proficient/40|block 0 | right | Titles and tones were on the wrong options: A is the jolting one. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/52|block 4 | right | Win + would mixes tenses; the level's rule card gives if + will for a situation that could happen. | database, base-levels file | grok-4.3: right, Kimi K3.1 Pro: right |
| plan:english/proficient/50|block 4 | right | One fused join and one comma splice, counted in the sentence. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/50|block 5 | right | The example has a verb, "took": only the subject is missing. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/50|check 2 | right | The stem has no mood shift to fix; the prompt now asks for the command the key gives. | database, base-levels file | Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:english/proficient/70|block 4 | right | The statement is about "were". | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/71|block 4 | right | The line in error is "its"; the message spoke of colons and semicolons. | database, base-levels file | grok-4.3: right, Kimi K3.1 Pro: right |
| plan:english/proficient/49|block 2 | right | Line 4 held a passive while its explanation said active; the line is now active. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/49|block 4 | right | "Now." is not in the sentence, which ends "act now"; the option is reframed on the real shift. Key unchanged. | database, base-levels file | GLM-5.3 Flash: right, Kimi K3.1 Pro: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:english/proficient/82|block 3 (corrected) | right | No 2014 change is on record. Chicago's own Q&A says it has not frowned on a split since the thirteenth edition (1983). Proposed "by 1993" had no source; corrected to "by the 1980s". | database, base-levels file | grok-4.3: right, Kimi K3.1 Pro: right |
| plan:english/proficient/82|block 8 (corrected) | right | Same date. AP wording taken from its verb entry as quoted: a split that is not awkward and is needed for the meaning. | database, base-levels file | grok-4.3: right, Kimi K3.1 Pro: right |
| plan:english/proficient/81|block 3 | right | "who lives in Denver" is a relative clause, not an appositive. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/81|block 4 (corrected) | right | "Because it was raining" has a subject and a verb. Feedback changed too, as it still said to give it both. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/81|check 3 (corrected) | right | The dash is not the fault; the missing independent clause is. Key shortened, no accepts list added. | database, base-levels file | GLM-5.3 Flash: right, Kimi K3.1 Pro: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:english/proficient/80|check 3 | right | The keyed sentence is active; its text said "to passive". | database, base-levels file | Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:english/proficient/72|block 6 (corrected) | right | As stored two options were right. The dash option now lacks its end mark. Reasoning no longer counts options by a number the learner does not see. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right Blind: Kimi K3.1 Pro solved to the key, grok-4.3 solved to the key. |
| plan:english/proficient/92|block 5 | right | "no trash talking allowed" is not a clause, so no splice; semicolons have a second use. | database, base-levels file | Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:english/proficient/95|block 2 | right | Counted: "got" appears twice in the draft. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/95|block 7 | right | "our fewer players" was broken; "fewer of our players". | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/95|block 9 (corrected) | right | "bunch of stuff" was vague and unmarked, so "there are four" failed. Paragraph corrected to match its tokens, which the proposal missed. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/95|check 0 | right | Lazy and slow do not describe checking twice. | database, base-levels file | Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:english/proficient/95|check 4 (corrected) | right | The check said to type a letter and showed no options. Options now in the prompt; key B matches the stored rationale. No choices field on a typed check. | database, base-levels file | Kimi K3.1 Pro: right, GLM-5.3 Flash: right |
| plan:english/proficient/91|block 4 | right | Line 5 has no "Honestly"; the remark moves to line 3, where it is. | database, base-levels file | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:english/proficient/91|check 4 | right | Two ands make a long sentence, not a run-on; the new key is fused. | database, base-levels file | Kimi K3.1 Pro: right, GLM-5.3 Flash: right Blind: GLM-5.3 Flash solved to the key, Kimi K3.1 Pro solved to the key. |
| plan:spanish/advanced/108|block 5 | right | Muy does not mean a lot. Mucho as very much is only in phrases like me gusta mucho. | database, Spanish source | Kimi K3.1 Pro: right, grok-4.3: right Blind: Kimi K3.1 Pro solved to the key, grok-4.3 solved to the key. |
| plan:spanish/advanced/163|block 0 | right | "always" was false: es una cantante colombiana takes the article. | database, Spanish source | Kimi K3.1 Pro: right, grok-4.3: right |
| plan:spanish/entry/16|block 4 | right | Counted: four blanks. | database, Spanish source | grok-4.3: right, Kimi K3.1 Pro: right |
| plan:spanish/advanced/80|block 5 | right | "Only" was false: -án, -ón, -ín also take -a (holgazana, mandona; Spanish grammar pages). | database, Spanish source | grok-4.3: right, Kimi K3.1 Pro: right Blind: Kimi K3.1 Pro solved to the key, grok-4.3 solved to the key. |
| plan:spanish/entry/42|check 1 | right | The prompt asks for one word; "diez y ocho" is three. | database, Spanish source | GLM-5.3 Flash: right, Kimi K3.1 Pro: right |
| plan:spanish/intermediate/97|check 2 (corrected) | right | "qué día es" leaves out today. Kept the stored rationale: the proposal put grader notes in text the learner reads. | database, Spanish source | GLM-5.3 Flash: right, Kimi K3.1 Pro: right |
