# Staged: adaptive teaching and objective items (goal 5)

Nothing in this folder is live. The design and the numbers are in `../../ADAPTIVE-COVERAGE.md`.

| file | what it is | how it was verified |
|---|---|---|
| `adaptive-teaching-on.patch` | Learner-visible wiring for `ADAPTIVE_TEACHING=on`, as a unified diff against the current `services/learner-path.js`, `mastery.js`, `level-editor.js` and `block-levels.js`. It adds: practice ends on proof, retention levels are always walked, and the writer prompt gets the plan's lines, with the covers text restated word for word. | Round 2: regenerated so each file keeps its own line endings (block-levels and learner-path are CRLF, level-editor and mastery LF; the round-1 file failed `git apply` on the CRLF two). `git apply --check -p1` is clean on the current files, and `verify-patch.js` on a patched copy (with round-2 `services/adaptation.js`) passes 4 of 4: off gives +1; on skips a proven objective's practice up to its first retention level; retention levels are walked; the editor prompt carries the plan and the covers text. `node --check` passes on every patched file. |
| `coverage-audit.txt` / `.json` | Round 2 output of `scripts/coverage-audit.js` (seed 20261023, 12 grades, 8 profiles x 8 learners x 4 policies: linear, gate, round-1 adaptive, round-2 adaptive2). Round 1's output is kept as `coverage-audit.round1.*`. | It is the measurement itself. The guarantee check passed. |
| `skills/` | Round 2: chess, piano and basketball in the coverage model (skill record, stage gate, dose plans, audit). See `skills/README.md`. | `skills/skill-audit.js` re-derives every completed or skipped stage's proof from its sittings; 0 violations. |
| `build-objective-items.js` | Pilot generator: questions written for one objective each. Free NVIDIA models only, called with explicit models so no paid provider can be reached. | Code checks first: 4 unique options, key in range, no answer leak, no missing picture or audio, rationale present. Then two independent blind judges (Nemotron Ultra and GLM 5.3) from families other than the writer's (DeepSeek V4.1 Flash). An item is kept only when both judges pick the key and both say yes to on-objective, exactly one correct, and grade-suitable. |
| `objective-items.<track>.<grade>.json` | Kept items, each with its `objective_id`, ready for probes, proof checks and memory checks. | As above. Rejections, with reasons, are in `objective-items.report.json`. |
| `round3/` | Round 3: the five owner decisions of ADAPTIVE-COVERAGE.md section 7 as one-step patches (daily review, consolidation, too fast to count, record-based remediation, graduation-held screen), each off behind its own flag, with tests and screenshots. See `round3/README.md`. | Full npm chain 37/37 on a patched copy; each patch alone passes its test; all 31 subsets apply. |
| `objective-items.cache.jsonl` | Per-objective results as they finish, so the run can resume. | — |

To approve, in order:

1. `COVERAGE_GATE=enforce`. This needs a client screen for a held graduation.
2. `ADAPTIVE_TEACHING=shadow`, then compare against the holdout.
3. `ADAPTIVE_TEACHING=on` plus `git apply curriculum-build/staged/adaptation/adaptive-teaching-on.patch` (diff paths are `a/services/...`; use `-p1`).
4. Import the objective items into the item flow with `objective_id`.
5. Round 2 (ADAPTIVE-COVERAGE.md section 5): a daily review session that serves `adaptation.reviewQueue(..., {curve, durable, reteach})` (memory checks, durability retrievals, lapsed objectives taught again), a short review-only consolidation stretch before the Final, effort monitoring on scored sittings (`adaptation.sittingRule`), and remediation after a missed Final (`adaptation.remediation`). These are path and UI changes; none is in the patch yet.
