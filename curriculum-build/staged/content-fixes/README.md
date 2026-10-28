# Staged content fixes (not applied)

These fixes come from the content fact audit on 2026-10-23. The full report is `curriculum-build/CONTENT-FACT-AUDIT.md`.

Nothing in this folder has been applied. `data/db.json` was never opened for writing.

## Files

### `fixes.json`

There are 240 entries, one for each stored place that holds a confirmed error. The 231 confirmed errors span those 240 places because some appear in more than one row.

Each entry has these fields:

- `collection`, `row_id`, `path`: where the error is stored.
- `shared`: whether the row is shared content or belongs to one learner (`user_id`).
- `wrong` and `correct`: what the row says now, and what it should say.
- `source` and `method`: how the error was confirmed.
- `action`: what kind of fix it needs.

The `action` values:

| Action | Count | What it means |
|---|---|---|
| `rekey` | 129 | Only the key changes. `set` gives the exact field change: `answerIndex` for game payloads, `answer` for other rows. |
| `replace_duplicate_options` | 13 | Write a distinct option to replace each duplicate. |
| `replace_duplicate_options_then_rekey` | 1 | Write the distinct options first, then set the key as above. |
| `rewrite_or_remove` / `rewrite` | 26 | The question has no correct option, two correct options, or a false premise. Write it again, or drop it. |
| `rewrite_text` | 71 | Lesson or block prose. Replace the wrong sentence so it says what `correct` states. The exact wording is left to the owner or a rewrite pass. |

### `not-yet-judged.json`

This file lists 269 questions that the code heuristic flagged but no judge or person has checked yet. In each one, the explanation describes a different option than the key. On the flags that were judged, 86% were real errors.

**Do not apply these entries.** Each one must be judged and checked against a source first.

## Before applying anything

1. **Game payloads.** About 27% of a random sample was wrong. Consider regenerating the 70 English Proficient games, not patching them one by one.
2. **Re-run the checks after any change.** Use the scratchpad scripts `fact-audit/codecheck.js` and `keyalign.js` on a DB copy.
3. **Lessons are one learner's rows.** They were written for one learner at a time. Decide whether to patch them, or to regenerate the lessons and fix the shared generator prompt.
   - The algebra Common Mistakes pattern ("adding 7 to both sides ... gives x = 19") appears in many lessons. It comes from the generator prompt, not from a single row.
