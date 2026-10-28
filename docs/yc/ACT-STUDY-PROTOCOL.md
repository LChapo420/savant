# ACT study protocol (DRAFT, not yet sealed)

Status: **draft**. Nothing here is pre-registered until the owner fills the `OWNER:` lines, then seals and
time-stamps this file with the tooling in `spanish-check/scripts/` (`seal.js`, `timestamp-seal.js`) **before the
first student takes a test**. After sealing, change nothing. Source for the design: `docs/yc/ACT-READINESS.md`
section 5. No result exists yet; this file contains no numbers about students.

## The question

Do students who use Savant for a few weeks score higher on an official ACT practice test than they would have
anyway? ("Anyway" matters: retesting alone raises scores.)

## The instrument

ACT's own free practice tests, forms **A** and **B**, never Savant's questions. OWNER: after opening ACT's pages
(links on `/act-study`), write which two tests A and B are, and confirm both are current format. How many exist
is UNVERIFIED (`SOURCES-TO-VERIFY.md`). Students take them timed, in one sitting, score them with ACT's tables, and
keep the answer sheet or a screenshot.

## The design

- **Before** and **after**: each student takes both forms, with Savant use in between.
- **Counterbalanced:** order is assigned by the app (`services/act-study.js`, `nextArm`): the next student gets
  whichever of A-then-B or B-then-A has fewer people (ties go to A-then-B). It is not chosen by hand.
- **Gap:** OWNER: fix it (the draft assumes four weeks between the two tests).
- **Minimum use that counts:** OWNER: fix it (active study minutes, from the app's study-session clock).
- **Exclusion rule:** a student who says they have seen the forms before is listed but excluded from the average
  (`excluded_seen_*` status), and the count is reported.
- **Dose** is measured by the app (study sessions and active minutes between the two test dates), not self-reported.
- **Comparison:** against a baseline, not zero. OWNER: choose the wait-list group or the external baselines in
  `ACT-READINESS.md` 5.2 item 6 (both UNVERIFIED figures), and say so here. The app now runs a wait-list arm: a student who ticks "happy to wait" is alternately assigned to start Savant now or only after the second test (everyone else starts now); the report shows each group and flags wait students whose use shows up in the window, since the app cannot stop them.

## What will be reported

Everyone: how many joined, left, finished, and were excluded; the mean and range of composite change (English,
Math, Reading; Science is charted but not in the composite, UNVERIFIED either way); the change for each order
(A-then-B and B-then-A); the dose; and every student's change including zero and negative ones. The report is
descriptive. It will not say "Savant raises scores by X points". The admin page `/act-study-admin` and its CSV
print exactly these numbers.

## What the numbers can't show

One student's change is within test noise (ACT's standard error is reportedly about 1 composite point,
UNVERIFIED). Volunteers are motivated and would improve anyway. With five students nothing is statistically
established; the first pilot only tells us the spread, from which the needed size can be worked out.

## Running it with 5 students

1. Seal this file (after the OWNER lines), then share `/act-study`.
2. Each student joins (consent, a parent knows, whether they've seen the forms). The app gives the order.
3. They enter both scores on `/act-scores` with the form letter A or B.
4. The owner reads `/act-study-admin`, or downloads the CSV.

## Privacy

Minors take part. Their scores, study time and answers are kept per `docs/yc/PRIVACY.md`, exported with their
account and deleted with it (`act_study` is in both lists). Only the admin sees names.
