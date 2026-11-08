# Tutor events: tests and other dates on the learner's calendar

Owner, 8 Nov 2026: "make it so users can tell the tutor what days they have tests or anything and the tutor can put that on their calendar."

Switch: `TUTOR_EVENTS`, **default on** (0/off/false turns off the detection, the `/api/events` routes (404) and the context line; stored rows are kept). Tested in `scripts/tutor-events-test.js`.

## How it works
- **Storage**: `tutor_events` rows (`user_id, title, date YYYY-MM-DD, time HH:MM|null, kind test|quiz|exam|due|other, enrollment_id|null, source tutor|manual, created_at`) in `config/db`. Listed, edited, deleted by the learner (`routes/events.js`, writes limited to 120/hour). Registered in `routes/consent.js` KNOWN_COLLECTIONS (so account deletion and a parent's child export reach it) and `routes/profile.js` EXPORT_MORE (the learner's data export).
- **Dates are read in code** (`services/tutor-events.js`, no model): the learner's own local date (their saved time zone), today/tomorrow/day after tomorrow, weekday names, "this Friday" (next one on or after today), "next Tuesday" (that weekday of next Monday-to-Sunday week; the card shows the full date to edit), "in 3 days/two weeks", "Nov 12", "12 November", "the 15th", ISO, and `11/12` by the account's country (US/PH month first; GB and most others day first; unknown country asks, offering both). "next week/month", a weekday said on that same day, a date that has passed (up to 45 days back; further back rolls to next year), an impossible date (30 Feb) or one over a year away give a card with no date and a question; never a guess. Several events per message. Talk about past tests ("how did my test go") makes nothing.
- **Chat**: `POST /api/tutor/dock` and `/dock/stream` (voice call). The reply is the normal checked reply; `events: { suggestions, ask }` is separate data. The dock shows a card ("Add Math test, Wed 11 Nov?", editable title and date, Add / Not now). Nothing is written until Add, or a typed or spoken yes/"add it" to the waiting offer (answered by the route, no model call). In voice turns the reply ends "Want me to add it to your calendar?". Offers wait 30 minutes, in memory. A safety reply never carries a card.
- **Retention goal, second explicit choice**: for a test or exam matching one of their enrollments, after Add a second card says "Reviews will aim at Nov 12." with Yes/No; yes calls the existing `PUT /api/retention-goals` (`horizon: date`). Never automatic; the voice flow asks it as a separate question.
- **Tutor context**: "Their calendar, next 30 days" (at most 6 lines, "in 3 days") inside the dock's existing character budget.
- **Calendar page**: `public/js/calendar-events.js` (+ `css/calendar-events.css`, loaded by `calendar.html`) reads `/api/events`, lays pills on the days of the month shown and lists "Your dates" with add/edit/delete. It does not touch `calendar.js`, `routes/retention.js` or `services/retention-schedule.js`.

## Consent
Nothing leaves the server for any of this, so a child account without a parent's outside-AI yes gets cards, yes and the calendar too (tested). The tutor's words still follow the existing rules.

## Not done / notes
- Pending offers are in memory (lost on restart; the card still works via its own Add).
- Events are not yet used by the enforcer schedule, only by the tutor and the optional retention goal.
- Screenshots: `design-refs/tutor-events/` (made by `scripts/tutor-events-shots.js`, 375 light). The dashboard of an account with no subject overflows to 516 px wide at phone size before this change; the chat shot is taken on the calendar page for that reason.
