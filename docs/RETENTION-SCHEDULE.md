# Data retention schedule (DRAFT, written from the code)

Status: draft written 2026-10-29 from what the code does. It matches the table on `public/privacy.html`
("How long we keep it"). No lawyer has read it. **OWNER:** lines need a decision.

| Data | Kept for | What deletes it | Where in the code |
|---|---|---|---|
| Child sign-up no parent answered | 14 days (`CONSENT_PENDING_DAYS`), then deleted with the parent's email | sweep | `routes/consent.js` |
| Child account after a parent withdraws consent | locked at once; deleted after 30 days (`CONSENT_REVOKED_DAYS`) unless consent is given again | sweep | `routes/consent.js` |
| Child account a parent deletes | deleted at once | parent page | `routes/consent.js` |
| Adult account and learning data | while the account exists. OWNER: decide the inactive-account period (the policy still has a placeholder) | learner, or the owner on request | n/a |
| Adult account the learner deletes | deleted at once, everything tied to it, no copy of the email kept | profile "Delete my account" | `services/account-deletion.js` |
| Own study material (uploads and pasted text) | until the learner deletes it; deleting also removes its course and progress | learner | `routes/materials.js` |
| Spanish uploads (files, recordings) | 7 days (`UPLOAD_RETENTION_DAYS`), swept at start and hourly | sweep | `services/upload-retention.js` |
| Tutor voice clips sent for speech-to-text | not stored after they become text | n/a | `services/spanish/voice.js` |
| Sign-in sessions | 30 days from last use, then pruned | store | `services/session-store.js`, `server.js` |
| Server backups of `data/` | **no schedule is written yet.** OWNER: decide where backups go and for how long, then record it here | OWNER | n/a |

## Rules

- Learner data is never sold and never used for advertising (as `public/privacy.html` says).
- A deletion removes the live copy at once; copies in backups (if any exist) fall away on the backup schedule
  above, which is why that row must be filled in.
- Whenever a new kind of learner data is stored, add a row here in the same change.

## Review

OWNER: review this table at the same time as `docs/SECURITY-PROGRAMME.md`.
