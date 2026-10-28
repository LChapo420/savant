# Tester-phase tailoring (2026-10-25)

**The owner's decision:** beta testers get lessons written for them personally. Each lesson is a model call plus a fact check, about $0.024 with Sonnet.

**Flag:** `TESTER_TAILORING` (on by default). In `config/subscriptions.js`, `canEditLevels` returns true for every non-owner account, whatever tier is picked. The owner still gets the base product. With `TESTER_TAILORING=off`, the tier decides again: `pro` and `school` are tailored, `standard` is not.

**Tests:** `scripts/block-levels-test.js` pins the flag off for its tier checks and adds 2 checks with it on (a standard tester is tailored; the owner is not). Passing: block-levels, owner-base 63/63, consent, security 100/100, learner-followups.

**Rollback:** set `TESTER_TAILORING=off`, or restore `config/subscriptions.js` and `scripts/block-levels-test.js` from their pre-edit text (the two edits are marked with the 2026-10-25 comment).

**Cost note:** every tester's lessons now use the Anthropic fact-check budget. It was $11.75 of the $24 stop on 2026-10-25. When that budget runs out, levels fall back to the free two-judge check (LEVEL_SELF_CHECK).
