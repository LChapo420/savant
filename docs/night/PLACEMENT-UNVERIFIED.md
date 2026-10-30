# Placement: claims to verify (copy into docs/yc/SOURCES-TO-VERIFY.md when merging; that file lives on yc-next)

| ✓ | Claim | Used in | Search terms |
|---|---|---|---|
| [ ] | An "I don't know" response carries no lucky-guess probability, so a likelihood for it should drop the guessing floor (lower asymptote 0) while keeping the slip; i.e. option-omit / "don't know" responses in Bayesian adaptive placement | `services/adaptive-placement.js` `assumed(..., idk)`, proven only on simulated learners in `scripts/placement-sim-test.js` | "omitted responses" item response theory; "don't know option" formula scoring guessing correction; "do not know" response option adaptive testing |
| [ ] | Stopping early once nearly all the belief sits in the first grade (floor stop) is safe | `services/adaptive-placement.js` `atFloor` | computerized adaptive test variable-length stopping rule posterior credible interval; floor effect adaptive placement |
