# My stats: the owner's own learner numbers

Asked for on 2026-11-03: the owner studies on **landon@savantedu.com** and wants that account's stats, cost, averages and day-to-day numbers
kept apart from everyone else and from Claude's tests, so they are accurate.

**Page:** `/my-stats` (an admin, or that account itself; a 404 for everyone else). **API:** `GET /api/admin/my-stats?days=30` (1 to 90).
**Code:** services/my-stats.js, with the buckets in services/cost-tracker.js. **Test:** scripts/my-stats-test.js.

## What each number is

- **Study minutes**: the study timer (study_sessions `active_ms`), by the UTC day the sitting started.
- **App minutes, sessions, levels, level opens and waits**: from the cost tracker's `me` bucket. Sessions end after a 20-minute gap,
  and each gap counts at most 5 minutes. A tab refreshing itself is not a session.
- **Questions, right, accuracy, seconds per question**: this account's answered items. Placement questions are counted apart and kept out
  of accuracy. The median time per question ignores answers over 30 minutes.
- **AI calls, actual and list cost**: the `me` bucket. Actual is what was paid or metered (free routes are $0). List is what the same tokens
  would cost on a paid route. Tailored levels written ahead for this account count here. Shared base levels everyone uses are in Shared.
- **Averages**: over the days with any study. Cost per hour uses the study timer when it ran, otherwise app active time.

## What is kept out, and how

- **Other people**: other accounts are other buckets (Other learners, Team / test, Shared).
- **Claude's scripts and tests**: any event from a process that is not the app server is marked `src` and goes to Scripts / tests, even
  when it names this account. Tests run on their own data copies and their own tracker folders.
- The page's **Kept apart** table shows the other buckets' totals for the same window, so the separation is visible.

## Limits

- The cost tracker started on 2026-11-02. App minutes, levels and cost exist only from then.
- Free voice and upload extraction outside services/ai.js have no cost row (paid gateway voice does).
