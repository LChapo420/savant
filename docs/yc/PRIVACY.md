# Privacy: what Savant does with minors' data, what applies, and what to fix

Written 2026-10-28. **Not legal advice.** This is a founder's working summary for investors and for a lawyer
to check.

## Read this first: what is verified

- **Section 1 (what the app does) was read from the code** in this repository, with file and line references.
  On 2026-10-28 I also ran `scripts/consent-test.js` (after `npm ci`): 187 checks passed, 0 failed.
- **Sections 2 and 3 (the law, and the AI providers' terms) are UNVERIFIED.** This session's network policy
  blocked ftc.gov, ecfr.gov, federalregister.gov, nebraskalegislature.gov, studentprivacy.ed.gov and every AI
  provider's terms page, so none could be opened. What is written there comes from web-search summaries,
  mostly of law-firm blogs, and each item names the primary page to open. `SOURCES-TO-VERIFY.md` has the
  checklist. **Don't quote a date, threshold or rule from sections 2 and 3 to an investor until it is ticked
  there.**

---

## 1. What the app does today (from the code)

### 1.1 The age screen

`routes/consent.js` (header comment, and `evaluateAge` at line 168):
- Before any account details, everyone is asked their **month and year of birth and their country**. There is
  no default answer and no wording that hints which answer "passes".
- The server tells the browser only "self" or "parent", never the age threshold.
- The first answer is kept in the browser session for a day, so going back and picking an older year changes
  nothing.
- Age is counted as the youngest the person could be (birthday taken as the last day of the month), so a
  borderline case goes to a parent.
- Ages of digital consent (`CONSENT_AGE`, line 82): US 13; UK, Denmark, Sweden 13; Spain, Italy 14; France 15;
  Germany, Netherlands 16; **every other country 16**.
- Accounts from before the screen existed are asked on their next visit. Until they answer, the camera,
  microphone and outside AI are off.

### 1.2 Account states and what each may do

From `routes/consent.js` `access()` (line 310) and `curriculum-build/KIDS-CONSENT-IMPLEMENTATION.md` section 4:

| State | Who | Camera / mic | Outside AI on the learner's own words | Recording or file upload | Everything else |
|---|---|---|---|---|---|
| `full` | at or over the country's consent age, **which in the US includes every 13- to 17-year-old** | on (the browser asks) | on | on | on |
| `needs_age` | an account from before the screen | off | off | off | asked on the next page |
| `pending` | under the consent age, no parent answer yet | off | off | off | tap and typing learning works (or nothing, with `CONSENT_PENDING_ACCESS=locked`) |
| `active` | a parent agreed by "email plus" | on unless the parent turned it off | **off until a signed form is checked** | **always off** | on |
| `active` plus verified opt-in | as above | as above | on | always off | on |
| `revoked` | a parent withdrew consent | off | off | off | locked: only sign-in and the status page |

**The key point for an ACT product:** almost every ACT student is 15 to 18, so in the US they get a `full`
account, treated the same as an adult (`access()` line 314: `if (!check.needs_parent) return { state: 'full', ...
ai_free_text: true }`). The parent-consent machinery applies to under-13s, who are not the ACT audience.

### 1.3 Under-13s (US): the child account and parental consent

From the `routes/consent.js` header and `KIDS-CONSENT-IMPLEMENTATION.md` sections 2 and 3:

- **Collected before consent:** a first name or nickname, a username (no child email), a password, and the
  parent's email.
- **The parent** gets an email with a one-time link (a 256-bit token, stored hashed) to a notice page. They agree
  or decline there. Agreeing creates a separate parent account; a confirmation email follows a day later and
  says how to withdraw. The code calls this the "email plus" method and cites 16 CFR 312.5(b)(2)(vi).
- **Email plus covers internal use only:** the account, the learning record, and the on-device camera and
  microphone. **Sending the child's own words to an outside AI, and AI training,** are separate opt-ins. They are
  unticked by default and stay off until the parent returns a **signed form** and the operator (the founder)
  checks it on `/parent-admin` (the code cites 312.5(b)(2)(i)).
- **Retention:** an unanswered request is deleted with the child's account after 14 days (`PENDING_DAYS`,
  line 67). A revoked account is deleted after 30 days unless consent is given again (`REVOKED_DAYS`, line 68).
  A parent's deletion is immediate (`deleteChild`, line 363). What remains is a stub: dates, method, notice
  version, and a SHA-256 hash of the parent's email.
- **The parent page** lets a parent see a summary, download everything as JSON, turn the camera and microphone
  off, change the opt-ins, withdraw consent, and delete the account.

### 1.4 How the limits are enforced

- **Endpoints:** `gate()` (line 525) runs before every `/api` route. For an account without the outside-AI
  opt-in, it refuses (HTTP 403) the coach, "ask about this", lesson chat help, the tutor, essay marking, the
  Spanish speech and writing endpoints (`OUTSIDE_AI`, line 483), and any typed text in level feedback, the
  interests survey and goals. Recording and file uploads are refused for every child account
  (`CHILD_MEDIA_UPLOAD`, line 501).
- **Model calls inside the app:** `services/ai.js` `withProviders()` (lines 178 to 186) checks
  `outsideAllowed(userId)` (line 128, implemented in `services/typed-grading.js` line 579) and drops every
  outside provider for a learner whose consent does not cover outside AI. That learner gets only the local
  model (Ollama on the server) and the deterministic question bank. The pooled path passes the same flag
  (`viaPool`, line 161).
  - Earlier, `KIDS-CONSENT-IMPLEMENTATION.md` section 4 listed three paths that still reached an outside model
    with a child's data (typed-answer checking, lesson writing from a learner summary, background reads). The
    `withProviders` check is the fix that document asked for, so the gap looks closed. **I did not audit every
    caller to confirm it passes the user id.** One I checked, `services/learner-record.js` around line 632,
    does.
- **Camera and microphone:** for accounts that may not use them, `permissionsGate()` sends
  `Permissions-Policy: camera=(), microphone=()`, so the browser refuses them. A build test in
  `scripts/consent-test.js` checks that the basketball and piano engines make no upload calls.
- **Tests:** `scripts/consent-test.js` covers the age gate, the consent record, the limits, revoke and delete,
  and the migration: 187 checks, all passing on 2026-10-28. `scripts/pool-test.js` checks that "a learner
  without outside consent gets no outside slot at all" (line 389).

### 1.5 Which AI providers get what

From `curriculum-build/MODEL-LINEUP.md` (the lineup, the free fallbacks, and "The model pool (2026-10-27)"),
`services/providers/*` and `services/spanish/voice.js`. "Learner data" means a request carrying a learner's id:
their answers, typed text, or a summary of their progress.

| Provider | What it receives | Who | Status in code |
|---|---|---|---|
| **NVIDIA build** (free API tier; Nemotron, GLM, DeepSeek models) | Learner data: coach and tutor turns, typed-answer grading, lessons written for a learner, session analysis | every account with outside AI allowed | **First in every chain.** This is where almost all learner traffic goes. |
| **Ollama** (local models on the server) | Learner data | everyone, including children without the opt-in | Not an outside provider: nothing leaves the machine. Skipped when free RAM is low. |
| **Google Gemini free tier** (text) | Learner data, as a fallback | accounts with outside AI allowed | **Off** until `GEMINI_FREE_TIER_CONFIRMED=1` (`services/providers/free-apis.js` lines 264 to 286) |
| **OpenRouter `:free` models** | Learner data, as a fallback | accounts with outside AI allowed | On if an OpenRouter key is set (`free-apis.js` line 182), with a $0 price cap |
| **Anthropic (Claude)** | Learner data, last resort only | accounts with outside AI allowed | Only when every free model fails, inside a $24 total spend ledger (`services/anthropic-ledger.js`) |
| **Modelflare** (a model reseller) | Writes the shared placement quiz for a subject (one set for every learner, per `services/subject-placement.js` line 19) | n/a | The ACT set is already stored (`curriculum-build/LIVE-CHANGES-2026-10-24.md`), so ACT placement makes no live call |
| **Xiaomi MiMo** (speech recognition) | Spanish speaking recordings | adults only (uploads are blocked for child accounts) | `services/spanish/voice.js` line 24 |
| **Google Gemini TTS** | App-written Spanish text to read aloud (not learner data) | n/a | `voice.js` line 23 |
| **LLM Gateway** (default models `eleven-v3` for speech and `grok-stt-1-0` for transcription) | Spanish speech for the accounts listed in `SPANISH_GATEWAY_USERS` | listed adults only | `voice.js` lines 34 to 43. **Not in the privacy policy's vendor list.** |
| xKiro, UnoRouter, Standard Compute | Shared, non-learner content only (base lessons, offline jobs) | never learner data | `services/pool.js` `refusal()` (line 462) refuses any learner-class request, and the app server sets none of the opt-ins these need |
| MiMo text, OpenRouter paid, Gemini paid, Jev | none | n/a | Out of every chain unless re-enabled by environment variables |

The data store itself is one JSON file, `data/db.json`, on the server. It is not in git (`.gitignore`: "Learner
data, ledgers and database backups (all of data/)").

### 1.6 The privacy policy as written

`public/privacy.html`:
- says "We do not sell personal data, use it for advertising, or build profiles for anyone else. We do not use
  children's data to train AI models";
- says there are no advertising, analytics or tracking cookies and no third-party scripts;
- lists the outside AI companies as modelflare.dev, OpenRouter, Anthropic, Google, Xiaomi and NVIDIA;
- **still has placeholders:** the operator's legal name and postal address, a privacy contact email, the
  response time, the hosting and email providers, the inactive-account retention period, and how often the
  security programme is reviewed.

---

## 2. What applies (UNVERIFIED: the primary sources could not be opened)

### 2.1 COPPA (US, under 13)

- COPPA is the federal rule for operators of services directed to children under 13, or with actual knowledge
  that they collect from them. Rule text: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312
  (§312.2 definitions; §312.5(b) consent methods, including email plus).
- **2025 amendments** (search summary): the final rule was published in the Federal Register on April 22, 2025,
  took effect June 23, 2025, and had a general compliance deadline of **April 22, 2026**. If that holds, the
  amended rule fully applies now. Reported changes: separate parental consent before disclosing children's data
  to third parties, a written information security programme, and biometric identifiers counted as personal
  information. A written data-retention policy is also reported in some summaries but was not confirmed.
  Page: https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- **The FTC's COPPA FAQ** (schools, service providers, third-party sharing):
  https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- **Enforcement example** (search summary): *U.S. v. Edmodo* (2023). The FTC alleged the ed-tech company pushed
  COPPA duties onto schools and used student data for advertising. The proposed order carried a $6 million
  penalty (suspended) and required deleting models built from the data. Confirm on ftc.gov.

How it fits Savant: the app is built to apply COPPA's consent rules to under-13s (section 1.3). Whether its
setup is right is the lawyer's question; the open items are listed in `KIDS-CONSENT-IMPLEMENTATION.md`
section 9.

### 2.2 Nebraska (search summaries only)

| Law | What the summaries say | Does it likely reach Savant? | Page to open |
|---|---|---|---|
| **Nebraska Data Privacy Act** (LB1074, 2024) | Effective January 1, 2025. Exempts businesses that are "small" under the federal Small Business Act, **except** that a small business still may not sell sensitive data without consent. | Probably exempt as a small business, but the sensitive-data rule would still apply. Savant does not sell data. | the LB1074 slip law on https://nebraskalegislature.gov |
| **Age-Appropriate Online Design Code Act** (LB504, 2025; amended by LB838, 2026) | Operative January 1, 2026, with civil penalties from July 1, 2026. One summary says LB838 limits it to businesses with more than $25 million in annual revenue (the full test was cut off). | If the revenue threshold is right, not today. Its duties (privacy-protective defaults, limits on profiling) are still a good design guide for a teen product. | https://nebraskalegislature.gov/FloorDocs/109/PDF/CS/LB504.pdf and LB838 |
| **Parental Rights in Social Media Act** (LB383, 2025) | Effective July 1, 2026. Requires age verification and parental consent for minors' social-media accounts. A court reportedly enjoined those parts on June 27, 2026 (*NetChoice v. Hilgers*). | Depends on its definition of a social media company, **which was not found**. A learning app with no social features is probably outside it. Check before adding any social feature (the roadmap mentions leaderboards and study groups). | https://www.nebraskalegislature.gov/FloorDocs/109/PDF/CS/LB383.pdf |
| **Student Online Personal Protection Act** (LB512, 2017) | Reportedly applies to operators with actual knowledge that their service is used for K-12 school purposes, and bans targeted advertising based on student data. | Only if Savant is sold to or used by schools. Direct-to-family use probably falls outside it. | https://www.nebraskalegislature.gov/FloorDocs/105/PDF/Final/LB512.pdf |

Other states have their own teen privacy and design-code laws. Those weren't researched here, and they matter
once users come from outside Nebraska.

### 2.3 FERPA (only if schools are involved)

FERPA binds schools that receive federal funds, and their education records. A vendor receives those records
only under the "school official" exception: it does a service the school would otherwise do, under the school's
direct control, and uses the data only for that purpose (34 CFR §99.31(a)(1)(i)(B), per secondary sources). A
family using Savant directly, with no school involved, handles no education records. **Confirm both points** at
https://studentprivacy.ed.gov. Savant has no school accounts today: "school-managed accounts ... are not built"
(`KIDS-CONSENT-IMPLEMENTATION.md` section 9).

## 3. The AI providers' terms (UNVERIFIED, and the biggest practical risk)

| Provider | What the search summaries say | Why it matters | Page to open |
|---|---|---|---|
| **NVIDIA build (API trial)** | The trial is reportedly for **testing and evaluation, not production**; production is said to need NVIDIA AI Enterprise. Sources conflict on whether prompts are used to improve products. | Almost all of Savant's learner traffic goes here (section 1.5). If the trial terms rule out production use, the beta's main AI provider is off-limits for real users. | the API Trial Terms linked from https://build.nvidia.com model pages |
| **Google Gemini API, free tier** | Users reportedly must be **18 or older**. On unpaid tiers, content is reportedly used to improve Google's products, and **human reviewers may read it**. | Incompatible with minors' data. It is **off** in the app today; keep it off for learner data. | https://ai.google.dev/gemini-api/terms |
| **OpenRouter `:free` models** | OpenRouter reportedly doesn't train on prompts, but many free models are hosted by providers whose own terms allow training. | Learner data could end up in a training set. | https://openrouter.ai/privacy , https://openrouter.ai/terms |
| **Anthropic API** | The Commercial Terms reportedly bar training on customer content. Anthropic reportedly lets organisations serve minors **if they add safeguards** (age checks, content moderation, education on safe use). | The provider with the clearest terms for this use, but it is the paid last resort. | https://www.anthropic.com/legal/commercial-terms , https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors |
| **Xiaomi MiMo** | Terms and data location are unconfirmed. A third-party aggregator says its privacy policy allows training with an opt-out. | Gets adults' Spanish recordings today. | https://mimo.xiaomi.com/legal/privacy |
| **Ollama (local)** | Local inference reportedly sends no prompts to Ollama. | The safe default for children. | https://ollama.com/privacy |

---

## 4. The gaps, most important first

1. **Learner data goes mostly to free API tiers that may not allow it.** NVIDIA's trial may be evaluation-only,
   and OpenRouter's free hosts may train on prompts (both UNVERIFIED, section 3). For a product used by
   teenagers, this is the gap an investor or a parent would care about most. **Fix:** before opening the beta
   beyond a handful of testers, route learner-class traffic only to providers whose terms allow production use
   and forbid training on inputs, under a paid or contracted tier, plus the local model. Accept the AI cost
   that brings, and update the vendor list. The pool already separates learner from pipeline data
   (`services/pool.js`), so this is a configuration and provider choice, not a rewrite.
2. **13- to 17-year-olds are treated exactly like adults.** That is what COPPA alone requires, but it is a
   product choice, not a legal floor everywhere, and teen laws vary by state. **Fix:** decide teen defaults
   (for example: no training ever, no recording uploads, no social features), and write them into the policy.
3. **The privacy policy is unfinished:** placeholders (section 1.6), LLM Gateway missing from the vendor list,
   and Modelflare listed without saying whose models it resells.
4. **Adult deletion: CLOSED in code 2026-10-29.** Profile page "Delete my account" (password plus the word DELETE) calls `POST /api/account/delete` (`services/account-deletion.js`), which removes the user and every learner row at once and keeps no stub. `ACCOUNT_DELETE=off` switches it off (`docs/PRODUCT-DECISIONS.md` said deletion would be off during the beta; the owner may set that). The policy's retention row now says "deleted at once". Not covered: copies in server backups of `data/` (no schedule is written; open item 8).
5. **No written information security programme and no written retention policy** (both reportedly required by
   the 2025 COPPA amendments; UNVERIFIED). The policy lists security measures that exist (hashed passwords and
   tokens, a strict CSP, rate limits), but there is no document with an owner and a review schedule.
6. **No lawyer has reviewed any of it.** `KIDS-CONSENT-IMPLEMENTATION.md` section 9 is the checklist, and
   every box is open.
7. **Signed-form checks depend on one person.** The founder checks every signed consent form by hand. That
   is fine for a few families and doesn't scale.
8. **Spanish uploads: CLOSED in code 2026-10-29** (`services/upload-retention.js`: files in `data/spanish-uploads` are deleted after `UPLOAD_RETENTION_DAYS`, default 7, swept at start and hourly; the policy's retention table says so). Still open: server backups of `data/`, and the uploads are not tied to an account, so account deletion cannot find them (the 7-day sweep bounds that). Original gap: **Spanish recordings and project files have no deletion schedule** (`KIDS-CONSENT-IMPLEMENTATION.md`
   section 9, notice and policy items).
9. **Admin rights follow an unverified email address.** Whoever registers the admin address first on a new
   server is admin (`curriculum-build/BETA-LAUNCH-KIT.md`, environment table). The beta kit's mitigation is to
   ship the existing data file and keep the invite gate on. That gate is not yet mounted on `main`; see plan
   step 1.
10. **Consent emails need a configured mail transport.** In production `utils/mailer.js` refuses to send
    without one (line 59). A transport module exists (`utils/mail-transports.js`). Whether it is configured
    depends on the deploy, which another session is doing.
11. **No school product.** FERPA and Nebraska's student-data law only start to matter with schools. Don't sign
    up a school until a data agreement and school-managed accounts exist.

## 5. The plan, in words a 16-year-old founder can say truthfully

**What you can say today** (all of it is true in the code):

> "Savant asks everyone's month and year of birth before they sign up. Under 13, it creates a child account
> with no email, and nothing outside our own app happens until a parent agrees by email. Sending a child's
> words to an outside AI needs a separate signed form from the parent. Parents can see, download and delete
> everything. We don't sell data, show ads, or use tracking cookies. ACT students are mostly 15 to 18, so the
> child flow is a safety net rather than our main audience.
>
> What isn't done yet: a lawyer hasn't reviewed it, and today most AI calls go to free model tiers. Before we
> open beyond a small beta, we're moving all student data to providers whose terms forbid training on it, and
> finishing the policy and a written security plan."

**Don't say:** "COPPA compliant", "FERPA compliant", "lawyer-approved", or "student data never leaves our
servers". None of those is true yet.

**The plan, with rough effort:**

| # | Step | Effort | Done when |
|---|---|---|---|
| 1 | Keep the beta invite-only, and invite only students 13 and up, until steps 2 to 5 are done | small: the invite gate is built (`middleware/beta-gate.js`, `services/beta-invites.js`) but not mounted in `server.js` on `main` as of 2026-10-28; the beta deploy (another session) is meant to turn it on with `BETA_GATE=invite` | the deployed server refuses sign-ups without an invite |
| 2 | Open and save the NVIDIA, OpenRouter, Anthropic and Gemini terms pages; decide which providers may receive learner data; restrict the learner-class chain to them | 1 day to decide, configuration to apply | the vendor list in the policy matches the live config |
| 3 | Fill every placeholder in `public/privacy.html`; add LLM Gateway; name what Modelflare resells | half a day | no "placeholder" left in the file |
| 4 | Write a 1 to 2 page information security programme (owner, what is protected, how, review every 6 months) and a retention schedule (including Spanish recordings) | 1 day | both files exist in the repo |
| 5 | Turn adult deletion on, or change the policy's promise | small code change (another session owns the app code) | policy and code agree |
| 6 | Get a children's-privacy lawyer to go through `KIDS-CONSENT-IMPLEMENTATION.md` section 9. If funded, budget for it; if not, ask about pro bono programmes for startups (not researched here). | depends on the lawyer | every checklist box decided |
| 7 | Before any school pilot: a data agreement, school-managed accounts, and the FERPA and Nebraska student-data checks | weeks | a signed agreement |

Parents' role: the founder is a minor, so contracts with providers, a lawyer or a school will need a parent's
signature. The founder's parents have said they will sign.
