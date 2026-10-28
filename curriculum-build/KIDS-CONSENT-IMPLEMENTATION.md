# Age gate and verifiable parental consent: what was built, and the checklist for the lawyer

Written 2026-10-22. Builds recommendation option 2 of `curriculum-build/KIDS-CAMERA-MIC-PRIVACY.md` (the
camera and microphone paragraph inside the sign-up consent), its data-flow contract (section 6) and copy
(section 7), and the product decision "under 13: parent/guardian-linked" (`docs/PRODUCT-DECISIONS.md`).
**Not legal advice.** The code is a working draft of a compliance programme; a lawyer who does children's
privacy has to confirm the items in section 9 before any child under the consent age uses Savant.

---

## 1. What was built

| Piece | Where |
| --- | --- |
| Age screen, consent records, parent accounts, the limits, the sweep | `routes/consent.js` (new; mounted in `server.js`) |
| Sign-up split by the age answer; sign-in by email or username; `/me` carries the consent state | `routes/auth.js` |
| Two new collections: `parents`, `parental_consents` | `config/db.js` |
| `connect-src` narrowed to `/api/` on the camera and mic pages; 'self' only everywhere else | `middleware/security.js` |
| Pluggable mail sender with a dev outbox (the app had no mail mechanism) | `utils/mailer.js` (new) |
| Sign-up: age screen, then the adult form or the child form, then "we emailed your parent" | `public/register.html`, `public/js/auth.js`, `public/js/age-screen.js` (new) |
| One-time age question for older accounts, and the parent-email step | `public/onboarding.html`, `public/js/onboarding.js` |
| Redirects (age needed, locked) and the "waiting for a parent" line under the header | `public/js/app.js` (small helper) |
| The parent's notice and answer page | `public/parent-consent.html`, `public/js/parent-consent.js` |
| The parent page: review, download, camera/mic off, opt-ins, withdraw, give again, delete | `public/parent.html`, `public/js/parent.js` |
| The child's status page (waiting, or turned off) and "send the email again" | `public/parent-needed.html`, `public/js/parent-needed.js` |
| The printable signed consent form, and the operator's page to check forms | `public/parent-form.html`, `public/parent-admin.html` (+ js) |
| Privacy policy in the "Measured and marked" design | `public/privacy.html`, `public/js/privacy.js` |
| Styles (section 28, appended) | `public/css/style.css` |
| Tests: age gate, consent record, limits, revoke/delete, migration, CSP, no-upload build test | `scripts/consent-test.js` (new) |

Backups of every edited file: `C:\Users\admin\AppData\Local\Temp\claude\C--coding-claudecommittdIq-folderThing\b8206e34-7709-469e-8326-7a732d82d175\scratchpad\before-consent\`.

---

## 2. The flows

**Sign-up.** The first screen asks month and year of birth and country, with no default in any of the three,
every year from this one back 100, and no wording that hints which answer leads where (FTC FAQ D.7, UK
Children's Code "no nudging"). The server answers only `self` or `parent`, never the threshold, and keeps the
first answer in the session for a day, so going back and choosing an older year changes nothing. The
stored result on the account is `age_check: { country, birth_ym, age_at_check, consent_age, needs_parent,
under_13, checked_at, screen_version, asked_on }`.

Consent ages (from the research doc, section 8): US 13, UK 13, Denmark 13, Sweden 13, Spain 14, Italy 14,
France 15, Germany 16, Netherlands 16; **every other country 16** (the GDPR default and the strictest age the
doc names). Age is counted as the youngest the person could be (birthday on the last day of the month), so a
borderline case goes to a parent.

**Under the consent age: a child account.** Collected: a first name or nickname, a username (no child email),
a password, the parent's email. This is the minimum 312.5(c)(1) allows before consent. The child is signed
in to a limited account at once (the owner's choice) and the parent gets the request email.

**The parent's answer** (`/parent-consent?token=...`, a one-time 256-bit token, stored hashed, taken out of
the address bar on load). The page is the direct notice: what is collected, how it is used, the camera and
microphone paragraph from the doc section 7B word for word, outside AI off unless chosen, retention, rights,
the privacy policy link. The parent ticks "I am this child's parent or legal guardian, and I agree...", sets
a parent-account password, and may tick, separately and unticked by default: outside AI processing of the
child's words; AI training; "turn off camera and microphone". "I do not agree" deletes the child account, its
data and the parent's email at once.

**After consent.** A parent account (separate from learner accounts; signing in as a parent signs any learner
out of that browser). A day later the "plus" email confirms the consent and repeats how to withdraw. The
parent page shows the record (status, timestamp, method, notice version, confirmation) and lets the parent:
see a summary and download everything as JSON; turn camera and microphone off (takes effect on the next page
load); turn the opt-ins on (needs the signed form) or off (at once); withdraw consent (the account locks at
once, deleted after 30 days unless consent is given again); give consent again; delete the account and every
row (type DELETE; immediate); close the parent account when no child is linked.

**The consent record** (`parental_consents`): `child_user_id`, `parent_email`, `parent_id`, `status`
(pending, active, revoked, declined, expired, deleted), `requested_at`, `expires_at`, `token_hash`,
`notice_version`, `policy_version`, `granted: { at, method, method_detail, notice_version, notice_sha256 (hash
of the exact notice page served), policy_version, evidence: { ip_sha256 (salted, truncated), user_agent } }`,
`scopes` (account and learning, camera/mic on device, third-party AI, AI training; each with active,
method, dates), `settings.camera_mic_off`, `confirmation: { due_at, sent_at }`, `revoked_at`,
`deletion_requested_at`, `deleted_at`, and an append-only `history` of events. After deletion the record
becomes a stub with no parent email (a SHA-256 of it instead) and no child data.

---

## 3. The consent method chosen, and why

**Base consent: "email plus" (16 CFR 312.5(b)(2)(vi)).** The parent receives the notice by email, answers on
the notice page, and Savant sends a **delayed confirmation email** a day later that says how to withdraw
consent. Why: it is the only FTC-listed method a small app can run with no vendor, no payment processor, no
ID checks and no staff, and the 2025 amendments keep it **for operators that do not disclose the child's
data** (internal use only). So the base consent is scoped to exactly that: the account, the learning record,
and the on-device camera and microphone (which, per the doc, are not even a "collection" of images or audio).

**Disclosures need a stronger method: a signed consent form (312.5(b)(2)(i)).** Sending a child's words to an
outside AI company, and AI training, are offered as separate, unticked choices (the 2025 rule's separate
consent for disclosure). They do not take effect when ticked: the parent prints the form, signs it, sends a
scan, and the operator checks it on `/parent-admin` before the switch turns on. Signed forms are slow, but they
need nothing except a person to check them, which fits a small app; a card-transaction or ID-check vendor can
replace this later with no change to the record shape (the scope's `method` field says which).

Not chosen: card transaction (needs a payment processor and a real charge or notice per transaction), toll-free
line or video call (staff), government ID or face match (vendor, and ID data to delete), knowledge-based
questions (vendor). Text-plus works like email plus and could be added if phone numbers are ever collected.

---

## 4. What each account state may do

| State | Who | Camera / mic | Outside AI on the learner's words | Recording / file upload | Everything else |
| --- | --- | --- | --- | --- | --- |
| `full` | at or over the country's consent age | on (browser asks) | on | on | on |
| `needs_age` | account from before the screen | **off** | **off** | **off** | asked on the next page |
| `pending` | child, no parent answer yet | **off** | **off** | **off** | tap / button / typing learning works (or nothing, with `CONSENT_PENDING_ACCESS=locked`) |
| `active` | child, parent agreed (email plus) | on unless the parent turned it off | **off** until a verified signed form | **off always** | on |
| `active` + verified opt-in | as above | as above | on | **off always** | on |
| `revoked` | parent withdrew | off | off | off | **locked**: only sign-in and the status page |

How it is enforced:

- **Camera and microphone**: `routes/consent.js` `permissionsGate` sends
  `Permissions-Policy: camera=(), microphone=()` on every response for an account that may not use them, so
  the browser refuses `getUserMedia` before any engine code runs (checked in the browser: the basketball shot
  tracker shows "Camera permission was not given. Log your shots by hand on the court below." and the tap
  logger works). No engine file was edited.
- **Outside AI**: `routes/consent.js` `gate` (mounted on `/api` before every router) refuses with 403 and a
  plain message: the question coach and "ask about this" (`/items/:id/coach`, `/coach/prime`, `/coach/stream`,
  `/ask`), chat assist in lessons (`/lessons/.../assist`), essay marking (`/essays/:id/submit`), the Spanish
  conversation, writing, recording-score and reaction endpoints, and the typed parts of level feedback and the
  interests survey (taps still go through). The survey is skipped after a child sign-up.
- **Uploads**: `/api/es/asr` and `/api/es/upload` refuse every child account whatever the opt-ins say (the
  doc prefers uploads disabled for children until a lawyer approves).
- **Locked**: every `/api` path except `/auth/*`, `/consent/*` and `/health` refuses; pages redirect to
  `/parent-needed`.

**Gap that must be closed before any child uses Savant (owner of `services/ai.js`, not edited here):** three
paths still reach an outside model with a child's data, because they live inside services this work was not
allowed to edit: (1) `services/sessions.js` `answer()` calls `ai.gradeFreeResponse` for a typed answer the
deterministic grader cannot settle; (2) lesson and level writing (`generateLesson`, `analyzeSession`, the coach
system prompt) include `learnerBrief(userId)`, a summary of the child's results; (3) background work
(`learner-record`, block levels) may do the same. The one-line fix is in `services/ai.js` `withProviders()`
(every per-learner call goes through it):

```js
// first line of withProviders(userId, ...)
if (userId) { const u = db.byId('users', userId); const a = u && require('../routes/consent').access(u);
  if (a && !a.ai_free_text) return null; } // a child without the outside-AI opt-in: deterministic bank only
```

Returning `null` is the existing "budget exhausted" path, so every caller already falls back to the
deterministic bank. Until it lands, the privacy policy and notice describe the intended behaviour, not the
current one, for those three paths.

---

## 5. No-upload safeguards (the contract in the doc, section 6)

- **CSP `connect-src`**: `'self'` on every page (no other host, no `ws:`/`wss:`, no `blob:`/`data:`
  targets). The camera and microphone tools' own pages (`/engine/basketball/*`, `/engine/piano/*`) are
  narrower: `connect-src <origin>/api/` only. Inside a lesson the same modules run in the lesson page, which
  needs `'self'` for its other blocks, so there the build test is the backstop.
- **Build test** (`scripts/consent-test.js`, first section; reads files only): every file in
  `public/engine/basketball` and `public/engine/piano` must have no `XMLHttpRequest`, `sendBeacon`,
  `WebSocket`, `EventSource`, WebRTC, `FormData`, upload path, form post, outside host, `importScripts` or
  image beacon, and `fetch` only to `/api/piano/songs...` (the song library and the stars post). The
  `Basketball_Film` block (which records with `MediaRecorder`) must have no network call at all, not even the
  allowed ones. The scanner is itself tested against planted network code. HTML pages there must load nothing
  from another host and have no inline script.
- **Findings (reported, not fixed, because those files belong to another agent):**
  1. `Basketball_Film` creates a blob URL for the clip (`URL.createObjectURL`) and never calls
     `URL.revokeObjectURL` (contract point 6). The test prints a WARN; `--strict` makes it a failure.
  2. The in-activity line is still "If you are under 13, ask a parent before using the camera..." in
     `camera-blocks.js` and `basketball-blocks.js`; the doc's section 7C has the replacement.
  3. `public/spanish/js/core/recorder.js` sends recordings to `/api/es/asr` (and the Spanish projects to
     `/api/es/upload`, which also stores the file on the server). Not a camera/mic engine module; gated off for
     every child account on the server. For adults, the policy says so.

---

## 6. Email

The app had no mail mechanism. `utils/mailer.js` is a pluggable sender: with no transport plugged in it writes
each message as a JSON file to a **dev outbox** (`MAIL_OUTBOX_DIR`, else `outbox/` beside the data file) and
sends nothing. In production with no transport it refuses (so a parent never silently misses the request);
`MAIL_ALLOW_OUTBOX=1` overrides. To send for real, call `require('./utils/mailer').setTransport(fn)` at start-up
with a function `({ to, subject, text, tag }) => Promise` for the chosen provider. The outbox holds working
consent links, so it is as private as the data file and is never served.

---

## 7. Existing accounts: the migration

Decision: **ask on the next page load**, which for most people is the next sign-in. An account with no
`age_check` is in the `needs_age` state: camera and microphone off, outside-AI endpoints refused, and every page
except onboarding, privacy and the parent pages sends it to `/onboarding`, which shows the same neutral
question first (the answer is final; support can correct it). At or over the consent age: full access, nothing
else changes. Under it: the account becomes a pending child account and asks for a parent's email; the 14-day
clock starts when the request goes out. The account's existing email stays as its sign-in until the parent
decides (a lawyer question below); if no parent agrees, the account and its history are deleted, as for a new
sign-up. A sign-up through the API with no age answer (older clients, `scripts/smoke.js`) lands in the same
`needs_age` state rather than failing.

---

## 8. Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `CONSENT_PENDING_DAYS` | 14 | an unanswered request (and the child account, and the parent email) is deleted after this |
| `CONSENT_REVOKED_DAYS` | 30 | a withdrawn account is deleted after this unless consent is given again |
| `CONSENT_CONFIRM_DELAY_HOURS` | 24 | when the "plus" confirmation email goes |
| `CONSENT_PENDING_ACCESS` | `limited` | `locked`: a child account can do nothing until a parent agrees (the stricter reading) |
| `CONSENT_SWEEP` | on | `off` stops the 10-minute sweep (tests run it through `POST /api/consent/admin/sweep`) |
| `APP_ORIGIN` | the request's host | the origin used in email links |
| `MAIL_OUTBOX_DIR`, `MAIL_ALLOW_OUTBOX` | | see section 6 |

Operator endpoints (accounts in `ADMIN_EMAILS`; 404 for everyone else): `GET /api/consent/admin/forms` and
`POST /api/consent/admin/forms/:id/verify` (signed forms, also on `/parent-admin`), `GET
/api/consent/admin/records/:id` (one consent record as stored, for proof), `GET /api/consent/admin/rows/:userId`
(deletion audit: what any collection still holds for an account id), `POST /api/consent/admin/sweep` (run the
sweep now; outside production it accepts `at` to run as of a later time, which the tests use).

Versions: `NOTICE_VERSION`, `POLICY_VERSION`, `SCREEN_VERSION` at the top of `routes/consent.js`. Change the
notice text in `public/parent-consent.html` and bump `NOTICE_VERSION` (and the `data-notice-version` on the
page) together; a parent answering an old page is refused.

---

## 9. For the lawyer: checklist

Confirm or change each item. References are to `KIDS-CAMERA-MIC-PRIVACY.md` unless noted.

**Method and scope**

- [ ] Email plus is acceptable for the base consent given that it is scoped to internal use (account, learning
      record, on-device camera/mic) and nothing is disclosed under it (doc section 2 table; 2025 rule).
- [ ] Is an AI provider that only processes the child's words to answer them (under a no-training, confidential
      contract) a "third party" needing disclosure consent, or "support for internal operations"? The build
      assumes the former (signed form required), which is stricter. If the latter, email plus could cover it
      with the provider named in the notice.
- [ ] The signed form (print, sign, scan, operator check) as the stronger method for the two opt-ins; or name a
      vendor method (card transaction, ID check) to use instead.
- [ ] Whether to offer the AI-training opt-in at all, given Savant does not train models and the owner says
      never sell minors' data.
- [ ] Whether a parent account made through the email link is a sufficient basis for "give consent again" after
      a withdrawal, without a new email round.
- [ ] Risk that a child enters their own second email as the parent's (inherent to email plus); acceptable with
      the delayed confirmation?

**The age screen**

- [ ] Month-and-year plus country is a neutral screen under FAQ D.7 and the Children's Code (no default, no
      hint, first answer sticks for a day in the session). Is a session-only lock enough, or should a longer
      cookie stop a retry the next day?
- [ ] The consent-age table (US 13; UK, DK, SE 13; ES, IT 14; FR 15; DE, NL 16; **everyone else 16**). Fill in
      the real ages for every launch country (several EU states are 13 to 15; non-EU countries have their own
      rules), and say whether US states with teen laws need anything for 13 to 17.
- [ ] What happens when a child passes the consent age (13 or 16): the account currently stays parent-linked.

**Before consent (312.5(c)(1))**

- [ ] The owner chose to let a child use the tap-only parts of a pending account straight away, which creates a
      learning record before consent. The research doc (section 7A) reads 312.5(c)(1) as "no account until a
      parent consents". Choose: keep `limited`, or set `CONSENT_PENDING_ACCESS=locked`.
- [ ] 14 days as the "reasonable time" before an unanswered request is deleted.
- [ ] Existing under-age accounts found by the migration keep their email as sign-in while pending, and lose
      their history if no parent answers in 14 days. Acceptable, or should their email be dropped at once?

**Notice and policy text**

- [ ] The direct notice in `public/parent-consent.html` covers every 312.4(c) element, including the camera and
      microphone paragraph (doc 7B, used verbatim) and that the parent may consent to collection without
      disclosure.
- [ ] `public/privacy.html`: fill the placeholders (operator name and address, privacy contact, response time,
      hosting and email providers and regions, inactive-account retention, account-deletion period, how long the
      consent stub is kept, security review frequency), and confirm the AI vendor list (modelflare.dev,
      OpenRouter, Anthropic, Google Gemini, Xiaomi MiMo, NVIDIA).
- [ ] The policy says children's words are not sent to outside AI without the opt-in. **This is not yet fully
      true** (section 4 gap: typed-answer checking, lesson writing from a learner summary, background reads).
      Do not admit children until the `services/ai.js` hook is in.
- [ ] The adult-facing statement about the Spanish section (recordings sent to a speech service; project files
      stored on the server) and its retention (those files are kept with no deletion schedule today).
- [ ] The in-activity notice for children (doc 7C) replaces the current "ask a parent" line (engine owner).

**Retention, deletion, security (the 2025 rule's written policies)**

- [ ] Written retention policy: pending 14 days, withdrawn 30 days, parent deletion immediate, consent stub
      kept for N years as proof (with a hashed parent email). Set N and the inactive-account period.
- [ ] Adult deletion: the product decision says deletion is off during beta; GDPR and California need it on
      request. The policy currently promises it "within 30 days" by writing in.
- [ ] Written information security programme (the 2025 rule): the policy lists what exists (hashed passwords and
      tokens, httpOnly secure cookie, strict CSP, same-origin checks, rate limits); a lawyer-approved written
      programme with a named owner and review cadence is still to be written.
- [ ] Backups: the store is one JSON file; any backup copy must follow the same deletion schedule.

**Camera and microphone (from the research doc, section 9)**

- [ ] Option 2 (name camera/mic in the consent) is what is built; confirm.
- [ ] Basketball_Film local recording and playback for under-13s on the base consent; no upload or AI critique
      is wired to it (the build test enforces that), and the blob URL is not yet revoked (engine owner).
- [ ] DPIA (UK/EU) on file before serving those markets; UK representative if serving the UK.
- [ ] School-managed accounts (FAQ N.1 to N.5) are not built; decide before any school channel.

**Operations**

- [ ] A real mail provider plugged in (`utils/mailer.js setTransport`), with its own data-processing terms.
- [ ] Who checks signed forms, how forms are stored, and for how long.
- [ ] Production caching: pages carry per-account `Permissions-Policy`; in production static pages are cached
      for an hour (`Vary: Cookie` is set), so a parent's "camera off" can take up to an hour to reach an
      already-cached page. Shorten page caching if that matters.

---

## 10. Tests

- `node scripts/consent-test.js` (about 170 checks; runs `server.js` on a copy of the data file with model keys
  blanked and mail to a temporary outbox): the age rule per country and the boundary month; config does not
  leak thresholds; first answer sticks; adult and child sign-up; username sign-in; Permissions-Policy per state;
  every outside-AI endpoint refused before consent and for a child without the verified opt-in; uploads refused
  for every child; the consent record (timestamp, method, versions, notice hash, token cleared, no raw IP); the
  signed-form verification; camera/mic off and opt-in withdrawal by the parent; data review and download; the
  delayed confirmation; revoke (locked) and consent again; deletion after 30 days, by the parent at once, by
  declining, and after 14 days unanswered, each leaving no row with the child's id; the migration of existing
  accounts; CSP on ordinary and camera/mic pages; the no-upload build test. `--strict` turns the Film blob-URL
  warning into a failure.
- Not added to the `npm test` chain (package.json was not in the files this work could edit): add
  `&& node scripts/consent-test.js` to the end of `scripts.test` to make the build fail on a camera/mic upload
  path.
