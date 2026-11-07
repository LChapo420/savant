# UI v2: structure A, "One next thing"

The owner's chosen app structure, from `design-refs/ui-v2-mockups/` (`sheet.png`, `make.js`). Behind `UI_V2=on`, off by default. Testers arrive Nov 15.

## How it is built

- `services/ui-v2.js`: when the flag is on, adds to each listed page's HTML: `data-ui2="on"`, `css/ui2/tokens.css`, `css/ui2/app.css`, `js/ui2/shell.js`, and on Home `js/ui2/home.js`. Off, it only calls `next()`, so every page is the same file as before. `scripts/ui-v2-test.js` checks the bytes.
- No existing file under `public/` is edited. The existing scripts still draw every page, with all their decisions, gating, consent rules, scoring, player and fact-check paths. The new files move and restyle what they drew.
- Every colour is a token in `css/ui2/tokens.css`; `app.css` has none of its own (tested), so a colour picker can come last. The older component tokens point at the new ones, so pages not yet rearranged already have the Sunny colours.
- Everything is a view of `/dashboard` (`/dashboard#everything`). It holds the real subject cards, planner, recent sessions and offers, moved rather than copied. Other pages link to it, so there is no second copy of any decision.

Tests: `node scripts/ui-v2-test.js`, `node scripts/ui-v2-browser-test.js`. Owner's look: `node scripts/ui-v2-sheet.js`.

## Slices

1. Home, menu, top bar, question feedback. **Built. Stopped here for the owner's look.**
2. Subject page: level summary and the whole-grade view.
3. Profile: scorecard first, streak and XP, sub-pages.
4. Everything else in the table below.
Then, if there is time, the colour picker.

## Where every page and state lives

Status: **done** is built and tested in structure A. **Colours** means the page works, has the new top bar (back, title, giraffe) and Sunny colours, and has not been rearranged yet. **Moved** means the real thing now sits in a new place. **Not yet** means no design work has reached it; it still works as today. **Out** means deliberately not under this flag.

### The day

| What a learner has today | Today's place | Where it lives in A | Slice | Status |
|---|---|---|---|---|
| The next thing to do | Dashboard, plan and lead card | Home: one task, one button | 1 | done |
| The day's steps, with why and minutes | Dashboard, Today's plan card | Home: the bar at the bottom opens them; desktop: "Then" column | 1 | done |
| Minutes today (30 to 120) | Dashboard, plan card | Home: "45 min" link; Everything | 1 | done |
| Empty home, no subjects | Dashboard empty state | Home, same words and links, including the preferences and survey first steps | 1 | done |
| Placement pending | Dashboard lead card | Home: "Find your level", Take the placement quiz | 1 | done |
| Graduated | Dashboard lead card, "View track" | Home falls back to the lead card, quieter button; Everything row says Graduated | 1 | done, not shown on the sheet |
| Checkpoint due, cooling down | Dashboard lead card, "Retry available" | Home: first plan step, or the lead card's own words and link | 1 | done, not shown on the sheet |
| A Final held for consolidation | Dashboard lead card and note | Home: the plan's review; the note stays on the Everything row. `/held` page: slice 4 | 1, 4 | home part done; `/held` colours |
| Catch-up rows under a grade | Dashboard subject card | Everything: nested under the subject, in route order | 1 | moved, restyled; synthetic check pending in slice 2 |
| Catch-up check link | Dashboard subject card | Everything: on the subject's row | 1 | moved |
| Today's review card, skills due | Dashboard | Everything: Review row with the count; a plan step on Home | 1 | done |
| This week: days studied, questions | Dashboard hero | Desktop side column; the profile in slice 3 (phone) | 1, 3 | desktop done; **phone: not on Home by design, profile next** |
| Streak and XP | Header, hero | Profile only, hideable there (the setting exists today) | 3 | off Home and bar; profile keeps them |
| Subject list, level meters | Dashboard cards | Everything: Your subjects | 1 | moved |
| Add a subject | Dashboard, nav | Everything | 1 | done; `/onboarding` colours |
| Retake placement, retake dialog | Dashboard card and path | Subject page (the same server answer); dialog unchanged | 2 | path has it; dialog restyle not yet |
| Recent sessions | Dashboard | Everything, folded | 1 | moved |
| Next study time planner, calendar file | Dashboard | Everything, folded with the calendar link | 1 | moved |
| Calendar | Nav, `/calendar` | Everything row | 4 | colours |
| Offers: reading check, speed, daily check | Dashboard aside | Everything: "Your tutor and optional extras", folded | 1 | moved. **Owner to confirm**: they no longer show on Home |
| Preferences quiz offer | Dashboard aside | Same fold | 1 | moved |
| What the tutor has noticed | Dashboard aside | Same fold; full version on the profile | 1, 3 | moved |
| What does my tutor know? | Dashboard | Same fold | 1 | moved |
| "Ask your tutor" button on Home | Dashboard | The giraffe is that chat now, so the older button is hidden | 1 | replaced. The older one answers through `/api/tutor/chat`, the giraffe through `/api/tutor/dock` |
| Theme and sign out | Header | Everything, at the end | 1 | done |
| Curriculum (accounts that can browse), Game lab and Admin (admins) | Nav | Everything rows, same conditions | 1 | done; pages out of scope below |
| Owner's Spanish progress links | Dashboard, account 6689 | Same fold | 1 | moved. Never tested on that account; the code is unchanged |
| Admin AI note | Dashboard | Same fold | 1 | moved |
| Study session strip | Under the header | Idle: pill in the top bar. Running, paused, an enforcer waiting: its own line under the bar | 1 | done |
| Break line | Study strip | Unchanged, in the strip | 1 | unchanged |
| Consent line for a child's account | Under the header | Unchanged, under the bar | 1 | unchanged |
| Guest "save your account" line | `ob2-guest.js` | Unchanged | 1 | unchanged, not looked at yet |
| Tutor giraffe, chat, voice | Top bar | Top bar, tap for chat, hold for voice, on every page | 1 | done |

### Learning

| What a learner has today | Today's place | Where it lives in A | Slice | Status |
|---|---|---|---|---|
| Question: top bar, segments, clock | `/session` | Same page, restyled | 1 | done |
| Answer feedback | `player.js` verdict, every page that uses the player | Tinted sheet from the bottom, one Next button | 1 | done on `/session`; same code on review, placement, skip, enforcer, not yet looked at |
| Report a problem, Ask about this | Verdict | Flag at the top of the sheet; Ask beside Next | 1 | done |
| Change this: shorter, simpler, more examples, another topic | Verdict | One small "Change this" link in the sheet | 1 | done |
| Answer while the chat is open | Verdict | Stays in the page, so it never sits on the chat | 1 | done |
| Checking your answer, a written answer being marked | Verdict | Inline tinted card | 1 | restyled, not shown on the sheet |
| Exam: no feedback until the end | `/session` | Rules line stays under the bar | 1 | restyled, not shown on the sheet |
| Session recap | `/session` | Colours now; design in slice 4 | 4 | colours |
| Lesson | `/base-lesson`, model-written HTML in a sandboxed frame | One scrolling page, restyled. Not split | 4 | colours; the frame's own colours not yet matched |
| Subject page, path, level summary | `/path` | Back, title, summary and whole-grade view | 2 | colours |
| Mastery meters, skills table | `/path` and profile | Subject page | 2 | colours |
| Test-out | `/session` with the lever on | Same flow, restyled | 4 | colours |
| Master quiz, Grand, Final | `/session` | Same player; intro and result restyled | 4 | colours |
| Written task | `/session` with `editor.js`, oral with `say-aloud.js` | Same page, restyled | 4 | colours |
| Help me learn after a failed quiz | `/help` | Same page | 4 | colours |
| Challenge exam | `/skip` | Same page | 4 | colours |
| Review | `/review` | Back, intro as in the mockup | 4 | colours |
| Retention enforcer | `/enforcer` | Same page | 4 | colours |
| Graduation held | `/held` | Same page | 4 | colours |
| Catch me up | `/catchup`, `/spanish/catch-up` | Same page | 4 | colours; Spanish's own shell not yet |
| Placement | `/placement`, `/subject-placement` | Same page | 4 | colours |
| Chess boards, piano and basketball practice | `/skill-practice`, `/stage-check`, `/stage-left` | Same page; boards keep their own colours until checked | 4 | colours, not looked at |
| Spanish activities | `/spanish/learn`, `/spanish/play` | Own shell with the giraffe's thin bar | 4 | not yet |
| Games | `/games/*`, `boosters` | Own canvases, left alone; a frame around them only | 4 | `boosters` colours; games not yet |
| Reading check, skill check, daily check, baseline, style quiz, survey | Own pages | Same pages | 4 | colours |

### Me

| What a learner has today | Today's place | Where it lives in A | Slice | Status |
|---|---|---|---|---|
| Profile, scorecard, streak, XP, hide setting | `/profile` | Header, scorecard card, rows | 3 | colours |
| See all measures | `/profile` | Under the scorecard | 3 | colours |
| Goals, how long to remember | `/profile` | Row, its own view | 3 | colours |
| What the tutor has learned, what your tutor remembers | `/profile` | Row | 3 | colours |
| Latest evidence | `/profile` | Under the scorecard | 3 | colours |
| Details report | `/profile` | Row | 3 | colours |
| Plan picker, your plan | `/profile` | "Your data and plan" row | 3 | colours |
| Your data, delete account | `/profile` | Same row | 3 | colours |
| Focus history and subject focus | `/profile`, `focus.js` | Row. Its heat map has its own greens: **to become tokens** | 3 | colours in part |
| Invite a friend | `/profile` | Row | 3 | colours |
| Display and wellbeing, break line setting | `/profile` | "Look and colours" row | 3 | colours |
| Style picker (whole looks) | `/profile` | **Decision for the owner**: under UI v2 the look is Sunny, so the picker does nothing visible until the colour picker replaces it | 3 | open |
| My material list, upload | `/my-material` | Everything row; the page as in the mockup. Upload logic not touched | 4 | colours |
| Study pack, notes, podcast, cards, study, test | `/my-material-*` | Same pages, back goes to the list | 4 | colours |
| Curriculum browser | `/curriculum` | Everything row | 4 | colours |

### States

| State | Status |
|---|---|
| Loading | Home has its own line while it builds. Other pages keep today's spinner in new colours. Slice 4 |
| Error on load | `App.mount`'s notice and Try again, new colours. Not forced in a test yet. Slice 4 |
| Offline | `/offline.html`: not under the flag yet, it is cached by the service worker. Slice 4 |
| Not found | `not-found.html`: not under the flag yet. Slice 4 |
| Keyboard, focus ring | Tested on Home and the sheet |
| Reduced motion | Tested on the sheet and dialogs |
| Light and dark | Tokens for both, contrast tested; dark checked on screen on Home, Everything and a question |

### Left out on purpose

Landing, sign-in, register, `/start` (already this look), privacy, the sealed Spanish tests, the ACT pages, parent pages, admin and owner tools. They do not get the flag. Parent pages may be worth doing last.

## What cannot work as the mockup showed

- **"1 of 6 done, about 36 min left":** the plan never empties. `services/daily-plan.js` does not take off what was already done today, so after each sitting it fills the chosen minutes again. Home shows today's finished sittings as filled dots, so the count is true, but the queue grows and there is no "done for today" screen. A placement counts as a sitting. Changing this needs a change to the plan, which this work leaves alone.
- **"A lesson of about 13 minutes, then 3 questions":** the plan does not know the question count before the session opens, so Home says only the minutes.
- **Level titles for later subjects** come from one extra read of that subject's path, the same read the dashboard makes for its lead.

## Found on the way

- `dashboard.js` looks for `.dash-aside` to show own material due. The class is `.home-aside`, so that section has never appeared. With the flag off it stays as it is. With it on, the My material row shows the count.
