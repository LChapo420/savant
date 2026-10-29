# Real-user metrics: what is counted, and how

The admin area's **Real-user metrics** view (`/admin#metrics`), its CSV export
(`/api/admin/metrics.csv?table=daily|cohorts|monthly|funnel|excluded`) and
`scripts/metrics-report.js` all come from one module, `services/real-user-metrics.js`. This page
is the plain-language version of its rules. If the two ever disagree, the code is what ran; fix
whichever is wrong.

The purpose is numbers that can go in an application or a pitch without a footnote: **test, demo
and team accounts are never counted as users**, and the page always says how many accounts were
left out and why.

## Who counts as a user

Every account is put in exactly one group. The first rule that matches wins.

| # | Group | Rule |
|---|---|---|
| 1 | demo | The account is flagged demo: `is_demo: true` or `account_kind: "demo"` on the user row. `scripts/seed-demo-account.js` sets both on the reviewer demo account. |
| 2 | test | The account is flagged test: `is_test: true` or `account_kind: "test"`. |
| 3 | test | The email is listed in `METRICS_EXCLUDE_EMAILS` (comma separated). Use it for real-looking addresses you tested with. |
| 4 | test | The email's domain is one no real person can receive mail at: a reserved test top-level domain (`.test`, `.example`, `.invalid`, `.localhost`; RFC 2606 and RFC 6761), or `example.com`, `example.net`, `example.org` and their subdomains. So `someone@example.test` and `qa@example.com` are test; `someone@myexample.com` is not. A child account has no email of its own; its parent's email (from the consent record) is checked instead. |
| 5 | founder | The owner's address (`OWNER_EMAIL`, default in `config/owner.js`), any address in `FOUNDER_EMAILS` or `ADMIN_EMAILS`, or any address at a team domain (`TEAM_EMAIL_DOMAINS`, default `savantedu.com`; set it to empty to turn this off). Shown on its own as "founder", with its own activity, never inside the user numbers. |
| 6 | real | Everyone else. |

Matching ignores case and surrounding spaces. Every excluded account is listed with the rule that
excluded it (the bottom of the page, and the `excluded` CSV), so the exclusions can be checked one
by one.

To mark an account by hand, set `is_test: true` (or `is_demo: true`) on its row in the data file
while the app is stopped.

## What counts as activity

A learner is **active on a day** if they did something that left a record on that day:

- a sitting started or finished (`sessions`),
- a question served or answered (`items`), a learning event (`events`),
- a study session running (`study_sessions`: start, end, last activity),
- a message they typed to the tutor (`tutor_memory`, the learner's turns only),
- a chat assist (`assist_chats`), level feedback (`level_feedback`), a finished lesson page
  (`level_signals`), an essay (`essays`),
- a chess puzzle, rush or drill run, a piano song result.

Signing up, or only signing in, is **not** activity. A tutor reply on its own is not activity.

**Days are UTC calendar days.** A learner in California who studies at 9 pm on a Monday is counted
on Tuesday (UTC). The page says so.

## The numbers

| Number | Definition |
|---|---|
| Real users | Accounts in the "real" group. |
| Did anything at all | Real users with at least one active day. |
| Active on 2+ distinct days | Real users with at least two different active days, ever. |
| Sign-ups per day | Real accounts created that UTC day (excluded sign-ups are shown in their own column). |
| Active learners per day | Real users active that day. |
| Day-1 return | Of the real users who signed up on day D, the share active on day D+1. |
| Day-7 return | Of the real users who signed up on day D, the share active on day D+7 (exactly that day). |
| Back within days 1–7 | Of the same cohort, the share active on any of days D+1 to D+7. |
| Cohorts | One per sign-up day. A cohort counts toward a return rate only once that day is over (D+1, or D+7, before today), so a cohort that has not had the chance to return does not pull the rate down. The pooled rate is all returners over all eligible users, not an average of daily rates. |
| Funnel: signed up | All real accounts. Every later step is a count of real users out of this. |
| Funnel: finished onboarding | Real users whose account has `onboarded` set. |
| Funnel: first lesson | Real users who answered at least one question in a sitting that is not a placement (a placement is a test, not a lesson). |
| Funnel: came back | Real users active on any day after their sign-up day. |
| Funnel: next day / week 1 | Same as day-1 return and back-within-days-1-7, over the cohorts old enough to have had the chance, so the denominator is smaller than the sign-up count and is printed beside it. |
| Funnel: invited friends | Real users whose account carries `referred_by` (they signed up from another learner's `/register?ref=CODE` link), how many of them answered a first question outside placement, and how many different inviters brought them. Child accounts are never recorded as invited. No reward is given for inviting. |
| Minutes per active day | All-time measured study minutes (and, separately, the capped sitting minutes) divided by all-time active days of real users. The first undercounts, the second overcounts. |
| Active learners (a period) | Real users active on at least one day in the period (the last 30 days, or a calendar month). |
| Sittings per active learner | Sittings (`sessions` rows, placements included) started in the period by active real users, divided by the active learners. |
| Measured study minutes | The app's own clock: active time inside Start session / End session (idle gaps count at most 5 minutes). Learners who never press Start session have none, so this undercounts. |
| Sitting minutes (upper estimate) | Start to finish of each finished sitting, each capped at 90 minutes. A sitting left open counts up to the cap, so this overcounts. The truth is between the two. |
| AI cost per active learner (estimate) | The `ai_usage` rows of real users in the period (the app records each call's token counts times the provider's list price), divided by active learners. Free tiers (NVIDIA, the free fallbacks) record $0. It is an **estimate**, not an invoice. |
| Ledger spend ÷ active learners (upper bound) | The paid-model spend ledgers (`data/*ledger*.json`: Anthropic, Standard Compute, Jev) summed for the month. They are machine-wide: the app, the build pipeline and the founder's own use on that machine all land in them, and they cannot be split per learner. Divided by active learners it is an **upper bound**. The Standard Compute ledger prices tokens at a deliberately high assumed rate. Refused calls are not counted. Each ledger keeps only its last 1,000 entries, so a month that starts before a trimmed ledger's oldest entry is marked **partial**. |

The founder's own sittings, minutes and AI cost are shown beside each month, never mixed in.

## Where it runs

- **Admin page:** `/admin#metrics` (admins only; everyone else gets 404). The day range can be
  14 to 365 days.
- **CSV:** the four buttons on that page, or `/api/admin/metrics.csv?table=daily|cohorts|monthly|funnel|excluded&days=N`.
  Cells that start with `=`, `+`, `-`, `@` are prefixed with `'` so a spreadsheet does not run them.
- **Without the server:** `node scripts/metrics-report.js --data data/db.json [--csv-dir out] [--days 60] [--ledgers data] [--json]`.
  Read-only: the data file is never written (`DB_READONLY=1`), and an unreadable file is refused
  rather than moved aside.
- The ledgers are read from `METRICS_LEDGER_DIR` if set, else the app's `data/` folder.

## Tests

`node scripts/real-user-metrics-test.js` builds a scratch data file through the app's own
`config/db.js`, fills it with real, test, demo and founder accounts (the excluded ones are made the
most active, so any leak changes a checked number), and checks every rule above, the CSV, the
read-only report, and the admin routes on a running server.
