# Information security programme (DRAFT, written from the code)

Status: draft written 2026-10-29 from what the code does. It is not a legal document and no lawyer has read it
(`docs/yc/PRIVACY.md` gap 6). Lines marked **OWNER:** need a person's decision or fact.

## 1. Who is responsible

- **Programme owner:** OWNER: name the person who answers for security (today the founder).
- **Backup person:** OWNER: name one, or write "none yet".
- **Review schedule:** OWNER: choose a cadence (suggested: every 6 months, and after any incident or new provider).
  Record each review below with its date.

| Review date | By | Changes made |
|---|---|---|
| (none yet) | | |

## 2. What is in place (each line is checked by `scripts/security-docs-test.js`)

- **Passwords** are stored only as bcrypt hashes (`bcryptjs`), never in plain text.
- **Sessions** use an HTTP-only cookie with `SameSite=lax`, `Secure` in production, expiring after 30 days
  (`server.js`); session rows live in a SQLite store that prunes expired rows (`services/session-store.js`).
- **Browser protections** (`middleware/security.js`): a Content-Security-Policy with `script-src 'self'`,
  `frame-ancestors 'none'`, `object-src 'none'`; `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`;
  a strict referrer policy; HSTS in production; camera and microphone allowed only for the app's own origin.
- **Cross-site request check:** state-changing requests must come from the app's own origin
  (`enforceSameOrigin`).
- **Rate limits** on sign-in, uploads, tutor voice and other costly routes (per route, in `routes/`).
- **Children's data:** under-13 accounts have no email and no outside processing until a parent agrees; see
  `docs/yc/PRIVACY.md` section 1.3.
- **Learner data and AI providers:** learner-class traffic is separated from pipeline traffic
  (`services/pool.js`); paid spend is stopped by ledgers (`services/anthropic-ledger.js`,
  `services/standard-compute-ledger.js`, the LLM Gateway ledger).
- **Uploads:** type decided from bytes, size caps, PDF and DOCX parsed in a child process with a time and memory
  limit (`services/material-runner.js`).
- **Deletion:** adults delete their account from the profile (`services/account-deletion.js`); parents delete a
  child's. See `docs/RETENTION-SCHEDULE.md`.
- **Secrets** live in environment variables or the gitignored `data/` folder, not in the repository.

## 3. What is not in place (be honest about these)

- No independent security test or penetration test has been done.
- Admin rights follow an email address (`docs/yc/PRIVACY.md` gap 9).
- No written plan for backups of `data/` (see the retention schedule).
- Several outside providers' terms are unverified (`docs/yc/PRIVACY.md` section 3).
- No lawyer review.

## 4. If something goes wrong

1. Stop the harm first: OWNER: describe how to take the app offline (hosting steps).
2. Write down what happened, when, and which accounts and kinds of data were touched.
3. Tell affected learners, and parents for child accounts, without delay and in plain words.
   OWNER: confirm legal notice duties with a lawyer before the beta opens wider.
4. Fix the cause, add a test, and record the review row above.
