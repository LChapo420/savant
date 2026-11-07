# Open items for the owner (written 6 Nov 2026)

Things put off or waiting for a decision. Nothing here is forgotten or solved. Update it when one closes.

## Put off on purpose, no solution yet
| Item | Status |
|---|---|
| **Children without parental consent** | Owner, 6 Nov: not tending to them for now; think about it later. They get safe but weak fixed replies, and no outside AI. A small local model isn't the answer unless it can do it right. |
| Privacy fix for under-age testers before investors | Tester-phase access is allowed for now; a fix is needed before investors. Linked to the item above. |
| Tutor character | Owner, 6 Nov: a giraffe, one base character, colouring near the first three, maybe customizable, flat chunky mascot style. Round two is in design-refs/giraffes/giraffes-v2.png; awaiting a pick. |
| Logo font | Logo is serif (DM Serif Display), the app is Atkinson. "Worry about that later". |
| Mass video ideation | To do with the owner, starting from first video numbers. |
| Whole-app UI redesign | Onboarding is first; the rest follows once its look is approved. |
| Learner data after Nov 14 | Ask on Nov 10, per provider. Tutor checks, rewrites and most AI depend on it. |
| Pricing | Free, two paid tiers, schools. No prices set. |
| Whether to let more than 100 into the beta | "I might think about letting more in". |
| iOS and Play Store apps | At or soon after public launch, if funded. |
| High-stakes subjects (medicine, law, finance) | Likely AI plus a disclaimer. Not settled. |
| Selling anonymized research data | "May be OK", maybe never for minors. Not settled. |
| After design: study groups and leaderboards | Owner, 6 Nov: build once design is done. Study groups: chat online or offline and see what members are actively doing. Leaderboards: across friends and across study groups. |
| Other languages, credentials | Put off. |
| Voice tutor | Owner expects it to exist already; check it works end to end. |
| Free-skip rule | Exact rule not set. |
| savant.edu or own accreditation | Owner, 6 Nov: name is Savant, domain savantedu.com. Plan: partner with a school to get savant.edu, or get accredited. |

## Waiting on a decision
| Decision | My recommendation |
|---|---|
| New onboarding: approve the look, or changes? | Merge after your review; fix the "built around you" wording first |
| Scorecard goal, since 95% in a month looks out of reach | A realistic target with real-tester data; ceiling about 87 (84 to 89), simulated |
| Speed proof: own-control study, or a self-study control group | Own-control |
| Password reset | Build before Nov 15 |
| Reviews for a free month | Change it: reward breaks store and FTC rules. Ask at a happy moment, no reward |
| Base curriculum: hold the 220 levels, or pilot 20 first | Pilot 20 after English and worked-example fixes ($48 to $64 for all 220) |
| Import the 12 Algebra lessons already paid for | Yes, after a check |
| Accept 0.22 invented facts per course in uploads | Accepted for now by being live; zero stays the goal |
| Study-goal gates: compare against rewriting noise? | Yes; core still has to pass for young and old learners |
| `PART_MODIFY` | Off by default; try on your own account |
| Mastery stop on long goals | Off for now |
| `SCORECARD_ANCHOR=0.25`, `SCORECARD_REFIT_AUTO=1` from the first tester; active measurement; datasets to download | Worth reading `docs/SCORECARD-REAL.md` first |
| Reminder emails | Only if testers ask |
| Guest signing into an existing account keeps the level check, not lesson answers | Fine |
| Base speed lever, beta comparison wording | Older items from the status page |
| Read the 88 daily-check taps; school account made-for-kids setting; Z Fellows "2 applicants"; ZeroGPU exchange terms | Yours |
| Send Munito and Coral evaluations | After the Coral comparison finishes |

## Things I still have to do
- Review and apply content fixes: 62 stored text errors and 48 audited game fixes, with a backup.
- Get real balances for the five rebuilt ledgers (Coral, Gonka, Grokified, Munito, ZeroGPU): the owner's dashboards, then correct them.
- Count endpoint: owner runs `savant-count-patch.js` on the VM.
- Live site differs from the repo's `site/`: reconcile without restyling. The live page says six subjects, the app has nine.
- Old expired `OPENROUTER_API_KEY` Windows variable overrides `.env`; owner removes it. Crouton gave empty replies, needs a look.
- `/beta?ref=` creator links now go to sign-in.
- Copy ledger and DB backups off the server; run one backup restore on the server.
- Move the server to SQLite before any big wave; JSON store fails near 512 MB.
- Clean old worktrees.
- Turn on `COLD_FIRST_BLOCK` for the beta (recommended; gate passes pooled, one 3-learner run missed the median).
- Resume the factuality build (branch fact-100, paused for pacing) after the 05:30 UTC reset.
- Onboarding v2 agreement step is in progress on branch onboarding-v2; not merged. 
