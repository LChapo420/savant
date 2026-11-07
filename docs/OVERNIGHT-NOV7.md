# Overnight report, Nov 7 2026 (written 6:33am CST)

## Read this first
1. **The beta can't send email.** Live `mail` setting: `dev-outbox`. Invites, parents' consent emails and password resets don't go out. This blocks Nov 15, and only you can do the first step (below).
2. **The privacy page is wrong.** It says uploaded audio stays on our server, but it goes to Gladia first. Six companies that can receive learner data aren't named. A draft fix is ready and needs your answers.
3. **4x isn't shown.** Simulated, against careful study: about 1.35x at one year, slower than careful study at one week. Only about 5% of first-practice questions fit their lesson, per an AI judge. That's the biggest real speed problem left.
4. **A deploy is waiting on your OK.** Speed fixes and 100 content fixes passed the full suite. The permission check blocked the deploy, and I didn't go around it.

## What's live on beta.savantedu.com
- **New onboarding:** in the order you asked for, with the Sunny giraffe. Your account goes through it once on your next login. Nobody has walked it on the live site yet, as far as I can see.
- **Bug sweep:** 13 groups of fixes, listed in `docs/BUG-SWEEP-NOV7.md`.
- **Server settings added:** `ONBOARDING_V2=on`, `COLD_FIRST_BLOCK=on`. Sign-in-only stays on.

Database backups were taken before each deploy. The server is healthy, with 170 GB free.

## Merged, not live
| Work | Result | State |
|---|---|---|
| Speed plain fixes | Practice follows its lesson's skill; untaught skills stop holding levels. Simulated, about 72 answers per lesson fall to 48 | Suite passed 217 of 217; waits on your OK |
| 100 content fixes | 108 reviewed: 100 approved (23 reworded first), 1 stale, 7 personal ones left out. Each checked by other model families; math recomputed | Files merged; database write waits on your OK. Reversible |
| Factuality design | Shared level 85% caught, 8% false alarms, about $0.10. Rewrite 90%, 0.4% of sentences. Part 92%, 0 of 104. AI-judged on test errors | Merged, all off, fact bank not wired in |
| Password reset | 200 test checks pass | Merged, off; hidden until email works. Full suite not re-run yet |
| Privacy trace | `docs/PROVIDER-DATA-MAP.md`, `docs/PRIVACY-LIST-DRAFT.md` | Docs only; nothing live changed |

## Waiting for you to look at
- **Giraffe tutor** (branch `tutor-giraffe`): tap for chat from the top or bottom, hold for a voice call. Screens: `design-refs/tutor-giraffe-shots/contact-sheet.png`. Voice reply delay was a median of 3.7 s (1.4 to 6.7), on only 4 turns with a synthetic clip. Not tried on a real phone, in Safari or with a real microphone.

## Still running
- **Uploads (full modification and optimization):** branch `uploads-beta`, committing but not reported yet, so I have no results to give you.
- **Beta durability:** restore test, off-server backups, SQLite on a copy. Not reported yet.
- **Offline Wikipedia:** the index is finished on the server (121 GB), with the test of whether it helps still running. It stays off. If it doesn't help, I'll say so.

**Not started:** further tutor and scorecard gaps, and the SEO patch. The rest of the UI redesign waits on a mockup for you.

## Speed results (simulated, 320 held-out learners, 3 in 4 extreme, no real learner)
| Goal | Careful study | Tutor | Rereader (soft) |
|---|---|---|---|
| 1 week | 0.85x | 0.79x | 1.97x |
| 1 month | 0.97x | 1.04x | 4.90x |
| 6 months | 1.27x | 0.98x | 8.83x |
| 1 year | 1.35x | few reach it | 9.18x |
| No test day | 1.45x | none reach it | 9.73x |

These assume every practice question is on topic. If only half are, the one-year figure falls to 0.85x. Lower goals also came out slower than careful study, the opposite of what you want, and most learners keep slightly less than before. A real-learner study is the only way to know. See `docs/speed-real/ROUND4.md`.

## What went wrong
- **Deployed before a test fix:** a chained command of mine carried on after an edit failed, so the bug sweep was pushed and deployed before a too-strict test was fixed. The app code on the server is what the suite tested, but I shouldn't have let that happen.
- **Production deploy blocked:** see above. Nothing changed on the server.
- **Usage under pace:** 75% at the 10:30 UTC reset, not 95%. Three builds at once is the limit for this PC, and they spent long stretches waiting on test runs.
- **Your onboarding design pick:** I took "that'll do" to mean the flow as you last saw it, not mockup A, B or C. Tell me if you meant one of those.
- **Unexplained:** browser crashes during the learning-style test in earlier runs stopped after two fixes, but the cause was never found.

## Spending
Totals to date on the PC's ledgers. Five seeds are estimates from the Nov 6 crash, so please send real balances. Server ledgers are separate. Exact overnight spend per ledger isn't available, because the logs keep only recent rows.

| Ledger | Used | Limit | Note |
|---|---|---|---|
| Lyceum (Kimi) | $192.81 | $250 | At least $10.21 since midnight CST; **$57 left, and the fact checks rely on it** |
| Standard Compute | $37.66 | $39.50 | **Nearly out** |
| Anthropic key | $28.56 | stop $60.50 | |
| Coral | $46.01 | $100 | Estimated seed |
| ZeroGPU | $43.38 | $245 | Estimated seed |
| Grokified | $28.48 | $135 | Estimated seed |
| Gonka | $25.84 | $50 | Estimated seed |
| Munito | $14.91 | $100 | Estimated seed |
| LLM Gateway | $0.38 | $5 | |
| Gladia | $0.02 | $50 | |

Claude usage at 6:33am CST: 26% of this window, 62% weekly, extra usage off.

## What I need from you
**Do first:**
1. **Set up email (free):** create a Resend account, add `send.savantedu.com`, and add its DNS records. Then I wire it up. You'd enter the key yourself.
2. **Deploy OK:** should I deploy the speed and content fixes? The permission check will need your yes.
3. **Try it on your phone:** log in on beta and walk the onboarding, especially the test.

**Decide:**
4. **Giraffe tutor:** ship it to beta, or change something? Want a "thinking" sound during calls?
5. **Privacy (needs fixing before Nov 15):** approve the corrected company list; keep "We never sell your data"?; fill in the operator details. The page still says "Draft for legal review".
6. **Nov 10 providers:** Munito, Coral and Gladia have no end date in the code, so Nov 14 won't cut them off unless you say so. Standard Compute answers the tutor by default, and its terms are unknown.
7. **Off-topic questions:** build per-objective questions? It's the real fix, but it conflicts with "no bulk base build".
8. **Speed switches:** I recommend the proof, recheck and objective-practice switches on, and tight page off. Run spaced retention on half the testers? Turn on the one-prompt switch? Its effect on scorecard accuracy is unknown.
9. **Smaller questions:**
   - Should an unfinished session close on the next visit, so XP and streaks count?
   - Should testers reach dev pages like `/game-lab` by typing the address?
   - Should learners be able to set their own plan to `pro`?
   - Should a parent be able to set a child's password?
   - Add a required terms box to the application?
   - Write the SEO patch?
