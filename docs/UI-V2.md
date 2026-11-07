# UI v2: structure A, "One next thing"

The owner's chosen app structure, from `design-refs/ui-v2-mockups/` (`sheet.png`, `make.js`). Behind `UI_V2=on`, off by default. Testers arrive Nov 15.

**The look is look v4**, approved by the owner: `design-refs/ui-v4-mockups/` (`sheet.png` for phones, `sheet-large.png` for tablet and desktop, `make.js` for its tokens and CSS). White pages, graphite text, Savant blue, DM Serif Display for headings and the wordmark, Atkinson Hyperlegible for the rest. Main actions are full pills on a 6 px edge; answers, options and tiles are raised on a 4 px edge and sink when pressed or picked. The giraffe is the original Sunny SVG from `js/start-tutor.js`, never redrawn: it guides each screen, holds the question in its bubble, and gives the answer there, tinted. On a screen where it stands, tapping it opens the chat and holding it starts the voice call, through the top bar's giraffe (`js/ui2/look.js` passes the press on, so the timing and every gate stay in `js/tutor-giraffe.js` and `js/tutor-dock.js`). Where it doesn't, the small one stays in the top bar. Sizes: phone first; tablet from 768 px, a 640 px column; desktop from 1025 px, a 960 px column, the menu a rail, the chat a panel beside the page; buttons 260 to 360 px there.

## Home and Past (owner, 7 Nov)

"I want the Home Screen to show the options to continue what ever subjects they might be in, and to upload their own material and to continue on stuff they uploaded and didn't finish and then be a page for previous stuff like uploads they already completed the activity or learning path of all that kind of stuff". This replaces the one-task home, in the same look.

- **Home** (`js/ui2/home.js`): the giraffe and a short bubble. **Continue**: the plan's first step gets the one strong button; every other subject is a raised row with its own link, the one `js/dashboard.js` worked out for its card. The time picker and "Today's plan" stay under them, quietly. **Your material**: Upload your own, then unfinished uploads with their progress, each going to `/my-material-study`, which picks up at its own next step. Then a link to **Past**. Phone: one column. Tablet: a 640 px column. Desktop: two columns in 960 px.
- **Past** (`/dashboard#past`, in the Everything menu, a view of Home as Everything is): finished uploads, finished paths, subjects' finished levels, recent sessions, each with a way to reopen it; a filter (All, Uploads, Subjects, Sessions) when there is more than one kind.
- **When an upload counts as complete** (`services/ui-v2-material.js`): its learning path is fully built (course status `ready`), has at least one part, and every part is mastered or set aside by the learner's own goal. A mastered part that has come due for review stays complete, and the row says a review is due. `GET /api/ui2/material-progress` works this out and stores nothing; `GET /api/materials/:id/study` would make a blank progress row for an untouched course, so Home doesn't call it.
- **Subjects waiting for a start** (owner, 7 Nov; private beta, docs/ONBOARDING-V2.md): each subject picked in the onboarding with no enrollment yet is a card with **Take the placement** (the 3D pill, the Quick subject placement) and **Pick my grade** (the second pill, the add-a-subject page with that grade list open). With no subjects yet they lead Home under "Choose where to start"; with subjects they follow Continue. `GET /api/ui2/waiting`, read only.
- **States.** No subjects and no uploads: "Pick your first subject" as the strong button, and Upload your own. Only uploads: the newest unfinished upload gets the strong button, and "Add a subject" is a row. A child account: no upload action and no Your material, by the same test as the upload gate in `routes/consent.js`, which shuts uploads for a child account with or without consent.

What the stored data can't do: Past can't reopen an exact past session, so a session row opens that subject's path. The server gives the last 8 sessions only (`recent` in `/api/progress`). Notes, podcasts, flashcards and practice tests keep no finished record, so they don't make an upload complete and aren't listed in Past. Finished levels are a count per subject, from what the path marks done, not including levels placed or skipped past.

## The tutor's chat and call

The chat keeps `js/tutor-dock.js` and `js/tutor-split.js` as they are; `css/ui2/look.css` restyles it: the giraffe and a serif title in its head, top-or-bottom as one thin pill with the chosen half tinted, round icon buttons, tinted and outlined bubbles, raised quick questions, the Send pill on a 6 px edge. During a voice call (`U2Look.watchTutor` in `js/ui2/look.js`) the giraffe fills the screen, the whole original drawing, with its mouth moving as it talks, its word in the bubble, and "Tap me to end the call. Hold me to switch to chat." It only reads what `js/tutor-giraffe.js` writes, and a press on it goes to that giraffe, so the call's logic is unchanged. When the giraffe gives a reason for a call ending, the stage says it for a few seconds with a Back button. Going to chat by a hold drops straight to the chat.

## How it is built

- `services/ui-v2.js`: when the flag is on, adds to each listed page's HTML: `data-ui2="on"`, `css/ui2/tokens.css`, `css/ui2/look.css`, `css/ui2/app.css`, `js/ui2/boot.js`, the giraffe, `js/ui2/look.js`, `js/ui2/shell.js`, and on Home `js/ui2/home.js`. On `/start` it adds `css/ui2/start.css` and `js/ui2/start.js`, and serves `/js/start.js` with three small hooks, each an exact-string replacement the test checks. Off, it only calls `next()`, so every page, `/start` and its script are the files as they are. `scripts/ui-v2-test.js` checks the bytes.
- No existing file under `public/` is edited, apart from two opt-in hooks for the beta's onboarding ending at the subjects: `?mode=quick` on `js/subject-placement.js` and `?why=signed_out` on `js/auth.js`. Each changes nothing without its parameter (`scripts/ui-v2-test.js` names them). The existing scripts still draw every page, with all their decisions, gating, consent rules, scoring, player and fact-check paths. The new files move and restyle what they drew.
- Every colour is a token in `css/ui2/tokens.css`; `look.css`, `app.css` and `start.css` have none of their own (tested), so a colour picker can come last. The older component tokens point at the new ones, so pages not yet rearranged already have the new colours and buttons. They wait on the owner's look at the real screens.
- `/start`'s first screen is swappable: `UI_V2_WELCOME` picks one design, `card` (H in `design-refs/first-screen/sheet-2.png`, the owner's pick, 7 Nov; the default) or `giraffe` (the look v4 welcome). Each has its words in `js/ui2/welcome.js` and its look in its own block of `css/ui2/welcome.css`; trying A, C, D, F or G from `design-refs/first-screen/` is one entry, one block, and the setting. "I have an account" shows only when signed out, so private-beta testers don't see it. Test: `node scripts/ui-v2-welcome-test.js` (every design at 320, 375 and 390, light and dark; `WELCOME_SHOTS=<dir>` saves `real-h.png`). The wordmark: `node scripts/ui-v2-wordmark-test.js`.
- Everything is a view of `/dashboard` (`/dashboard#everything`). It holds the real subject cards, planner, recent sessions and offers, moved rather than copied. Other pages link to it, so there is no second copy of any decision.

The later pages: `js/ui2/pages.js` moves what each page's script drew, and `css/ui2/pages.css` styles it. The mockup has no lesson, subject or review screen, so these follow its parts: the giraffe and bubble at the head, the serif title, one strong button, raised rows.

Tests: `node scripts/ui-v2-test.js`, `node scripts/ui-v2-browser-test.js`, `node scripts/ui-v2-pages-test.js` (opens each later page with and without `js/ui2/pages.js`; every link and button seen without it must be there with it). Owner's look: `node scripts/ui-v2-sheet.js` writes `design-refs/ui-v4-shots/contact-sheet.png` and `contact-sheet-large.png`; `node scripts/ui-v2-sheet-2.js` writes `contact-sheet-2.png`.

## Slices

1. Home, menu, top bar, question feedback, and the onboarding at `/start`, in look v4. **Built. Stopped here for the owner's look.**
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
| Add a subject | Dashboard, nav | Everything | 1 | done. The long notes and the optional extras fold; the giraffe asks |
| Retake placement, retake dialog | Dashboard card and path | Subject page (the same server answer); dialog unchanged | 2 | path has it; dialog restyle not yet |
| Recent sessions | Dashboard | Everything, folded | 1 | moved |
| Next study time planner, calendar file | Dashboard | Everything, folded with the calendar link | 1 | moved |
| Calendar | Nav, `/calendar` | Everything row | 4 | done. The month first; how it counts and what the marks mean fold |
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
| Lesson in a session (the usual one) | `/session` | One scrolling page, restyled, same words | 4 | done |
| Lesson page | `/base-lesson`, model-written HTML in a sandboxed frame | Title over the frame, back in the top bar, how it was made in a fold | 4 | done, shown with a stubbed body. A stored page in the frame keeps its own colours (the ones on disk are dark): not reachable from a synthetic account at a low level, not looked at |
| Subject page, path, level summary | `/path` | Back, title, giraffe with the level, the next thing, meters and ruler, whole-grade view as raised rows, skills, notes in a fold | 2 | done |
| Mastery meters, skills table | `/path` and profile | Subject page: the table is one line and a meter per skill on a phone | 2 | done on `/path`; profile not yet |
| Test-out | `/session` with the lever on | Same flow, restyled | 4 | colours |
| Master quiz, Grand, Final | `/session` | Same player; intro and result restyled | 4 | colours |
| Written task | `/session` with `editor.js`, oral with `say-aloud.js` | Same page, restyled | 4 | colours |
| Help me learn after a failed quiz | `/help` | Same page | 4 | colours |
| Challenge exam | `/skip` | Same page | 4 | colours |
| Review | `/review` | Giraffe says how much, one button, what is in it, Learn again, own material due. The sitting is the player | 4 | done, with a stubbed plan; a real plan needs days of history |
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
| Profile, scorecard, streak, XP, hide setting | `/profile` | Header, scorecard card, rows | 3 | done. Header and numbers, the scorecard, then one row per thing, opening in place |
| See all measures | `/profile` | Under the scorecard | 3 | done, a fold under the scorecard |
| Goals, how long to remember | `/profile` | Row, its own view | 3 | done, a row. A link to a card inside a row opens the row |
| What the tutor has learned, what your tutor remembers | `/profile` | Row | 3 | done |
| Latest evidence | `/profile` | Under the scorecard | 3 | done |
| Details report | `/profile` | Row | 3 | done |
| Plan picker, your plan | `/profile` | "Your data and plan" row | 3 | done, the row "Your data and plan" |
| Your data, delete account | `/profile` | Same row | 3 | done, same row, wording unchanged |
| Focus history and subject focus | `/profile`, `focus.js` | Row. Its heat map has its own greens: **to become tokens** | 3 | done, a row. The heat map keeps its own greens: **to become tokens** |
| Invite a friend | `/profile` | Row | 3 | done, a row, gone when there is no link |
| Display and wellbeing, break line setting | `/profile` | "Look and colours" row | 3 | done, in the row "Settings". Not named "Look and colours" yet |
| Style picker (whole looks) | `/profile` | **Decision for the owner**: under UI v2 the look is Sunny, so the picker does nothing visible until the colour picker replaces it | 3 | open |
| My material list, upload | `/my-material` | Everything row; the page as in the mockup. Upload logic not touched | 4 | done. Six raised tiles, one way open at a time; the list; each thing's options fold. "Where it goes" keeps its whole wording, one tap away |
| Study pack, notes, podcast, cards, study, test | `/my-material-*` | Same pages, back goes to the list | 4 | done in the look, back in the top bar; a course's map has what is next first. Checked before a build; only the map with a built course, stubbed |
| Curriculum browser | `/curriculum` | Everything row | 4 | colours |

### States

| State | Status |
|---|---|
| Loading | done. Home has its own line while it builds; other pages the same spinner, in the look |
| Error on load | done. `App.mount`'s notice and Try again, in the look; forced on the sheet with a stubbed 500 |
| Offline | done. `/offline.html` with the giraffe, and `/sw.js` under the flag keeps what it needs (one exact-string hook, tested). Seen by stopping the server: the browser's offline switch doesn't reach a service worker |
| Not found | done, under the flag from the 404 in `server.js` |
| Keyboard, focus ring | Tested on Home and the sheet |
| Reduced motion | Tested on the sheet and dialogs |
| Light and dark | Tokens for both, contrast tested; dark checked on screen on Home, Everything and a question |

### Left out on purpose

Landing, sign-in, register, privacy, the sealed Spanish tests, the ACT pages, parent pages, admin and owner tools. They do not get the flag. Parent pages may be worth doing last.

## What cannot work as the mockup showed

- **"Not sure" on a question:** the player has no such answer, and adding one is a change to scoring, so it isn't there. The placement inside `/start` has "I don't know", which is real.
- **Check on every question:** the player grades on tap unless a question asks for Check, so most questions go straight to the answer.
- **The big sum (3x + 2x):** a real question is one sentence. "Simplify: 3x + 2x" splits into the bubble and the big sum; anything else stays whole in the bubble. A question over 170 characters, or with a passage, stays on the page and the bubble says "Your turn."
- **The "Start session" pill and the coach's "Help me work it out":** real features the mockup doesn't show. The first is a round clock button in the top bar, the second a thin pill under the answers. The running clock on a question is off the screen (still there for screen readers).
- **"More" on the subjects and "Colours" in the menu:** neither exists yet. All the subjects show; the menu's tile is the dark and light switch. Several subjects show numbers rather than ticks, because the first is where the learner starts.
- **Report a problem and "Change this":** a small flag in the corner of the bubble, and one small link over the buttons.
- **Home's day dots, greeting and "This week":** gone. The steps sheet opens from "Today's plan".

- **"1 of 6 done, about 36 min left":** the plan never empties: `services/daily-plan.js` fills the chosen minutes again after each sitting, and that is left alone. So Home counts apart from it: **Done for today** (`services/ui-v2-today.js`, `GET /api/ui2/today`, read only) shows once the chosen minutes are met, with an optional **Keep going** that brings the same Continue back for the rest of that day. Time spent is the larger of the study timer and the day's finished sittings, each capped at 45 minutes. A lesson page read with no timer running leaves no time, so that learner sees it late. Choosing more minutes opens the day again.
- **"A lesson of about 13 minutes, then 3 questions":** the plan does not know the question count before the session opens, so Home says only the minutes.
- **Level titles for later subjects** come from one extra read of that subject's path, the same read the dashboard makes for its lead.

## Found on the way

- `js/my-material-podcast.js` line 226: a line of code sits inside the page's template, so the podcast page shows it as text and `PartChange.wire` never runs there (the podcast's "Change this"). With the flag off it stays, by the byte rule. Under the flag the text is taken off the screen; the wiring still needs the real fix.
- `dashboard.js` looks for `.dash-aside` to show own material due. The class is `.home-aside`, so that section has never appeared. With the flag off it stays as it is. With it on, the My material row shows the count.
