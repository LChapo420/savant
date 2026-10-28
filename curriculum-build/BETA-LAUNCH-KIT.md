# Beta launch kit: Savant on the owner's own domain

> **Web references re-checked 2026-10-25:** 28 links (2 more are `<domain>` templates): 26 verified, 2 changed (Cloudflare Email Routing moved to Email Service; SES pricing, corrected below), 0 dead. Quotes and URLs: `FACT-REVERIFY-2026-10-25.md`.

Written 2026-10-24 (night run) for the owner's request: get the app ready for a beta on its own domain, at the lowest cost. The landing site (`site/`, built tonight by another agent) collects the beta applications; this kit covers everything from those applications to a running, backed-up app.

**Status: everything that changes the app's behaviour is STAGED.** New files sit where they will live, but nothing loads them until the wiring is applied on launch day (step L-3). The wiring for `server.js`, `config/db.js` and `package.json` is one script, `curriculum-build/staged/beta-launch/apply.js`, whose `--check` mode confirms it still fits the files other agents are editing. Nothing was committed; `data/db.json` and `.env` were not touched; no key was printed.

Prices and limits below were read on the providers' own pages on 2026-10-24 unless a line says otherwise. Recheck them on the day you pay, because they change (Hetzner's cheap line, for example, is listed but "currently not available").

---

## The short version

| Decision | Choice | Monthly cost |
|---|---|---|
| Where the app runs | One small Linux VM with its own disk. **Recommended: DigitalOcean Basic, 1 GiB.** $0 option: Oracle Always Free (with a reclamation risk, section 1.1). | $6 (+$1.80 for DO daily backups, optional) |
| Domain, DNS, HTTPS | Cloudflare Registrar (sold at cost), Cloudflare DNS (free), Caddy on the VM for certificates (free, automatic). | the domain's registry price |
| Landing site | Same VM, its own small server (`site/server.js`) behind the same Caddy. | $0 |
| Data store | Launch on today's JSON file (tested, unchanged). Move to SQLite (staged, migration measured and checked row by row) before the store grows past about 30 MB or 25+ active testers. Not Postgres (section 1.3). | $0 |
| Email | Resend free tier (3,000 a month, 100 a day), Brevo free as the automatic failover. | $0 |
| Off-box backups | Cloudflare R2 free tier (10 GB-month), encrypted on the VM before upload. | $0 |
| Error monitoring and uptime | Local error log and `/api/ops/*` (no third-party tracker); an uptime check run from the laptop that emails on a state change. | $0 |
| Beta gate | Invite codes from the landing site's applications (`BETA_GATE=invite`), one code per approved address. | $0 |

**Total: about $6 a month plus the domain**, or $0 plus the domain on Oracle's free tier if you accept its risks.

**Blockers before any under-13 tester joins** (unchanged by this kit, listed so launch day does not miss them): the tester consent gate is blocked in this session and must be built by the owner elsewhere (section 4.4); the `services/ai.js` child-data hook (`KIDS-CONSENT-IMPLEMENTATION.md` section 4) and the privacy-policy placeholders are still open. Until then, approve adults (and teens at or over their country's consent age) only.

---

## 1. Hosting

### 1.1 What the app needs, measured

- **A process that stays up.** `server.js` keeps the whole store in memory, runs background work (the consent sweep every 10 minutes, the after-level reads) and writes the store to local disk. Serverless hosts (Vercel, Netlify, Cloudflare Workers) cannot run it, and a host whose disk is wiped on restart loses every account.
- **Memory.** Booted on a copy of `data/db.json` with keys blanked: **315 MB resident, 252 MB heap**, and 317 MB after a few page loads (2026-10-24). So 512 MB is too tight once the OS is counted; **1 GB is the floor**.
- **Disk.** The deploy (code, `public/`, `content/`, `node_modules`) is about 170 MB; the store is 11.8 MB today. 10 GB is plenty for months.
- **Traffic.** `public/` is 55 MB in total; a tester's first visit downloads a few MB and later visits are cached for an hour. Tens of testers stay far under any plan's included transfer except Google's (1 GB a month).
- **No GPU, no local models.** Ollama, kiwix, the fact checkers and the chess engines are laptop pieces (section 1.4).

### 1.2 Hosts compared (checked 2026-10-24)

| Host | Plan | Price | RAM / CPU / disk | Transfer | Fit |
|---|---|---|---|---|---|
| **Oracle Cloud Always Free** | Ampere A1 Flex | **$0** | "2 OCPUs and 12 GB of memory" in total; 200 GB block storage, 5 volume backups | 10 TB a month out | Best specs for $0. **Risks:** Oracle "may" reclaim an idle Always Free instance when, over 7 days, 95th-percentile CPU is under 20%, network under 20% and (A1 only) memory under 20%. Savant at 315 MB of 12 GB with a small beta meets all three, so it could be reclaimed. Arm64 (Node is fine; a chess engine needs an Arm build). Free A1 capacity is often unavailable. Whether a Pay As You Go account is exempt from reclamation is not stated on the page read; check before relying on it. Instances must be in the home region. |
| Google Cloud free tier | 1 e2-micro, us-west1 / us-central1 / us-east1 | $0 | 1 GB RAM, 30 GB standard disk | **1 GB a month** out | RAM just fits. 1 GB of egress a month is too little for a web app. The external IPv4 address charge for a free-tier VM could not be confirmed from Google's pages (not verified). |
| **DigitalOcean** | Basic Droplet | **$6** (1 GiB, 1 vCPU, 25 GiB SSD) or $4 (512 MiB, too small) | as listed | 1,000 GiB | **Recommended.** Plain VM, predictable bill, daily backups for 30% of the Droplet price ($1.80), weekly for 20%. |
| Hetzner Cloud | CX23 (2 vCPU, 4 GB, 40 GB) | €5.99 excl. VAT | as listed | 20 TB | Best value per GB, but every Cost-Optimized plan showed "currently not available". The available Regular Performance CPX02 (1 vCPU, 1 GB, 20 GB) is €6.49 in the EU; US locations start at €17.99 (CPX11). IPv4 included. |
| Fly.io | shared-cpu-1x 1 GB + 1 GB volume | $6.70 + $0.15 | as listed | $0.02/GB out (NA/EU) | Works (machines plus volumes). "New organizations don't have a free tier"; a volume lives on one host, so snapshots ($0.08/GB-month, first 10 GB free) are the backup. More moving parts than a VM for the same price. |
| Railway | Hobby | $5 including $5 of usage | RAM $10/GB-month, CPU $20/vCPU-month, volume $0.15/GB-month | | 315 MB of RAM alone is about $3 a month of the $5; CPU on top. The Free plan (0.5 GB RAM, 0.5 GB volume, $1 credit a month) is too small. |
| Render | Free web service | $0 | ephemeral disk | | **Not usable:** "Free web services cannot" attach a persistent disk, the filesystem is wiped on every restart, and the service spins down after 15 minutes idle. |
| Koyeb | | | | | The pricing page read showed a free tier for Postgres only, no free compute. Not used. |
| The laptop + Cloudflare Tunnel | | $0 | this laptop | home upload | Tunnel is "available on all plans". Keeps Ollama and kiwix next to the app. **Not for the beta:** the laptop is the build machine (RAM at its 95% limit tonight, agents running), holds `.env` with build-only keys, and must stay on. Kept as the emergency fallback in section 5. |

**Pick:** DigitalOcean Basic 1 GiB ($6) in the region nearest most testers, with the app, the landing site and Caddy on the same Droplet. Move to Hetzner CX23 if it becomes available and the testers are in Europe, or to Oracle A1 if $0 matters more than the reclamation risk (then keep the off-box backups strictly, section 2.4).

### 1.3 The data store: stay on JSON for launch, SQLite staged, Postgres not now

**Measured on a copy of `data/db.json` (11.8 MB, 9,702 rows in 35 collections), 2026-10-24:**

| Operation | Time |
|---|---|
| JSON driver, one flush: `JSON.stringify(store, null, 2)` | 84 to 99 ms |
| JSON driver, write + rename | 47 to 51 ms |
| So: event loop blocked per flush (up to four flushes a second under load) | about 150 ms, growing with the store |
| SQLite driver, flush after one change in `items` (6,065 rows) | 45 ms |
| SQLite driver, flush after one change in `events` | 8 ms |
| SQLite driver, full comparison of every collection (once a minute and at exit) | 81 to 103 ms |
| SQLite driver, load at boot | 314 ms, 94 MB RSS for the store alone |
| Migration JSON → SQLite | read 191 to 195 ms, write 441 to 463 ms, row-by-row check 785 to 873 ms; **1.6 s in total**; 11.8 MB of JSON → 10.9 MB of SQLite |
| Reverse (rollback) SQLite → JSON | read 338 ms, write 173 ms, check 1,069 ms |

**Why not launch on SQLite tonight:** the driver is new. It is tested end to end (section 6), including the whole app running on it, but the JSON store has months of use behind it. The beta starts small, and 150 ms flushes are fine for a handful of testers.

**When to move:** watch `/api/ops/status` (`checks.db.bytes`, `checks.event_loop.p99_ms`). Move when the store passes about 30 MB or p99 passes 200 ms, and in any case before 25+ testers are active at once. A rough growth estimate (an assumption, not measured): an active tester-day adds on the order of 100 rows (items, events, sessions) of about 600 bytes each, so 50 active testers add about 3 MB a day, and the JSON flush would reach about 0.5 s within a month.

**Why not Postgres:** every caller uses the store synchronously (`db.find(...)` inside request handlers, no `await`). A network database means making hundreds of call sites async, which is a rewrite. Free Postgres tiers exist, but they buy nothing until the app runs on more than one machine. SQLite through Node's built-in `node:sqlite` is synchronous, in process, and needs no new package (Node 22.5+; this laptop runs 24.19; install the same major on the server).

**What was built (staged):**

- `config/db-sqlite.js`: the same API as `config/db.js`. It keeps the same in-memory arrays, so every route and service works unchanged. On flush it writes only the rows whose JSON changed, in one transaction, to a WAL-mode file. Rows edited outside the API are caught by the once-a-minute full comparison and at exit (the JSON driver saves those only when something else writes, so this is no less durable). It refuses to start when its file is missing but a JSON store exists, so a forgotten migration cannot look like every account vanished.
- `config/db-sqlite-schema.js`: the table layout. One `rows` table keyed by (collection, id), with the row's JSON exactly as the app holds it and its array position. The collection list is read from `config/db.js`, so there is one list.
- `scripts/migrate-json-to-sqlite.js`: forward, `--verify` and `--reverse`. It writes `<target>.partial` and renames it into place only after the check passes. **The check:**
  - SQLite `integrity_check` is ok;
  - the row count matches per collection;
  - every row is byte-identical as JSON, in order;
  - every counter is equal and none is below its collection's highest id;
  - one SHA-256 over the whole store matches.
  It caught a single changed field in a test (section 6).
- `scripts/backup-db.js` handles both drivers (SQLite through its online backup API).
- The switch: `DB_DRIVER=sqlite` (three lines at the top of `config/db.js`, in `apply.js`).

**Migration day, on the server:**

1. Take a backup and run the restore test.
2. `systemctl stop savant`.
3. `node scripts/migrate-json-to-sqlite.js --from /srv/savant/shared/data/db.json --to /srv/savant/shared/data/db.sqlite --report /srv/savant/backups/migrate-report.json`.
4. Add `DB_DRIVER=sqlite` and `DB_SQLITE_FILE` to `savant.env`.
5. `systemctl start savant`, then check `/healthz` and that a tester can sign in.
6. Keep `db.json` read-only beside it for a week as the fallback (section 5, R3).

### 1.4 What runs where, and how the app behaves without the laptop pieces

| Piece | Runs on | On the server |
|---|---|---|
| `server.js` (the app) | VM | yes |
| `site/server.js` (landing page, beta form) | VM | yes; writes `site-data/beta.jsonl`, which the invite tool reads |
| Store, sessions, invites, outbox, ledgers (`shared/data`) | VM disk | yes; backed up daily |
| NVIDIA models (learner AI, first in the app's chain) | NVIDIA | `NVIDIA_API_KEY` |
| Build pipeline: night runner, xKiro, UnoRouter, MiniMax, lesson writing and fact audit | laptop | **never**: xKiro and UnoRouter cannot take learner data, so their keys never go on the server |
| Ollama (`qwen3.5:4b`, embeddings) | laptop | `OLLAMA_ENABLED=0`. The provider then reports itself off and the chain skips it (NVIDIA → Claude as configured). Local is only ever a fallback (owner's rule), so learners lose nothing they get today when NVIDIA answers. `scripts/ollama-provider-test.js` and `offline-integration-test.js` cover the off state. |
| kiwix-serve (offline Wikipedia and Wiktionary), fact checkers (FactCG, MiniCheck and the rest) | laptop | Not used by the app unless `FACT_POOL=offline` (leave it unset). Lesson writing on the server, which happens only for tailored, owner and `BASE_LESSON_ACCOUNTS` accounts, runs without the local checkers ("Without them the rest still runs", `PRODUCT-DECISIONS.md`). |
| Stockfish, Leorik, Maia-2 | laptop | Optional. With none installed, `services/chess-engine.js` reports `available() = false` and play falls back to the in-browser bot, and Maia-2 is skipped. To have server analysis, install the distribution's `stockfish` and set `STOCKFISH_PATH`. |
| Health watch (`scripts/health-watch.js`), backup decryption key, restore drills | laptop | |

**Owner decision needed: the lesson gate on the server.** `services/block-levels.js` serves only verified levels while `FACT_CHECK_ANTHROPIC_KEY` is set. Without that key the gate is off (`gateOn()` requires it), so a stored but unverified plan could be served. Choose one:

- **(a)** Set the key on the server with its own `ANTHROPIC_LEDGER_STOP_USD`. The ledger file is per machine, so the laptop's $24 stop does not cover the server's spend.
- **(b)** Ask the block-levels owner for a switch that keeps the gate on without the key. That is not done here, because the file belongs to other work.

Whichever you choose, ship only verified base levels (`content/base-levels`, loaded at boot by `services/base-content.importAll()`).

**Content after cut-over:** the server's store becomes the live one. Staged content fixes that the pipeline writes into the laptop's `data/db.json` no longer reach testers. They have to ship through `content/base-levels` (`npm run base:export` on the laptop, deployed, imported at boot) or a reviewed import on the server.

### 1.5 Server setup (Ubuntu LTS on the Droplet)

Files in `curriculum-build/staged/beta-launch/deploy/`: `savant.service`, `savant-site.service`, `savant-backup.service` + `.timer`, `journald-savant.conf`, `Caddyfile`, `env.production.example`, `rsync-exclude.txt`, `release.sh`, `offsite-backup.sh`.

1. Create the Droplet with an SSH key (no password login). Install the current Node LTS (22 or 24; `node:sqlite` needs 22.5+), Caddy (from its official apt repository), `age` and `rclone`. Turn on `ufw` with only 22, 80 and 443 open.
2. `adduser --system --group savant`, and make `/srv/savant/{releases,shared/data,shared/logs,backups,bin,upload}` owned by `savant`. Allow the restart in release.sh with a sudoers line: `savant ALL=(root) NOPASSWD: /bin/systemctl restart savant`.
3. From the laptop: `rsync -az --delete --exclude-from=curriculum-build/staged/beta-launch/deploy/rsync-exclude.txt ./ savant@<ip>:/srv/savant/upload/`. `data/` is excluded, so a `--delete` never removes the server's data.
4. Copy the data once, by hand, at cut-over: `data/db.json`, `data/spanish-media/` and the ledgers, into `/srv/savant/shared/data/` (section 5, launch day).
5. Write `/srv/savant/savant.env` from `env.production.example` (chmod 600) and generate the session secret there (section 2.3).
6. Install the units, the journald drop-in and the Caddyfile (with the real domain); run `caddy validate`; then `systemctl enable --now savant savant-site savant-backup.timer caddy`.
7. Every later deploy: rsync to `upload/`, then `sudo -u savant sh /srv/savant/bin/release.sh /srv/savant/upload`. It makes a new release folder, links the shared data, runs `npm ci --omit=dev`, checks the content bank loads, takes a backup, switches, restarts, and **switches back by itself** if `/healthz` does not answer within a minute. It keeps 5 releases.

### 1.6 Domain, HTTPS and DNS

1. **Buy the domain at Cloudflare Registrar.** It "sells domains at cost: you pay the registry and ICANN list price with no markup", and WHOIS redaction is free. Note that "all domains on Cloudflare Registrar use Cloudflare nameservers", which is what this plan uses anyway.
2. **DNS records** (Cloudflare dashboard):
   - `A @` and `A www` → the Droplet's IPv4 (the landing site). Add `AAAA` records if IPv6 is enabled.
   - `A app` → the same IP (the app at `https://app.<domain>`, so `APP_ORIGIN=https://app.<domain>`).
   - Start with these **DNS only (grey cloud)**, so Caddy's own certificate challenge reaches the box. Later, proxying through Cloudflare is optional; if you turn it on, set SSL to "Full (strict)", keep `TRUST_PROXY=1` (Caddy is still the one proxy the app sees), and the site's `SITE_ORIGINS` stays the same.
   - `CAA @` → `0 issue "letsencrypt.org"` (plus `0 issue "zerossl.com"` if you keep Caddy's fallback issuer).
   - **Email (section 3):** the SPF and DKIM records Resend shows for the sending subdomain (Resend recommends "sending your emails from one or more subdomains", for example `send.<domain>`), and `TXT _dmarc` → `v=DMARC1; p=none; rua=mailto:<owner inbox>`. Tighten to `p=quarantine` after two clean weeks.
   - **Inbound mail** for `contact@`, `privacy@` and `investors@` (the site's `config.js` addresses): Cloudflare Email Routing (it "forwards them to destination addresses", on Free plans) to the owner's inbox. It cannot send mail to arbitrary recipients on the Free plan, so it does not replace Resend.
3. **HTTPS:** Caddy obtains and renews certificates by itself once DNS points at the box and ports 80 and 443 are open. The app already sends HSTS in production (`middleware/security.js`), and `server.js` redirects `http` to `https` when the proxy says so. Check with `curl -I https://app.<domain>/healthz`.
4. **The landing site's settings:** `SITE_ORIGINS=https://<domain>,https://www.<domain>` (in `savant-site.service`), and in `site/config.js` the contact addresses and `formEndpoint: ''` (same box).

---

## 2. Production configuration

### 2.1 Environment variables (names only; values go in `/srv/savant/savant.env`, chmod 600, never in git)

**Required**

| Name | Why |
|---|---|
| `NODE_ENV=production` | the production behaviours in 2.2 |
| `SESSION_SECRET` | 32+ characters; the app refuses to start without it |
| `APP_ORIGIN` | `https://app.<domain>`. The links in consent and invite emails are built from it; without it they come from the request's Host header, which the client controls. Staged: production refuses to start without an https value. |
| `TRUST_PROXY=1` | one proxy (Caddy). This is the production default, stated explicitly. |
| `ADMIN_EMAILS` | who can see `/api/admin`, `/api/ops/*` and `/parent-admin`. It defaults to the owner's address, so set it explicitly. Admin rights follow an email address that is never verified (security review, 2026-10-24), so whoever registers that address first on a new server is admin. Ship the current data file (the owner's account is already in it), and keep `BETA_GATE=invite` on: with the gate on, nobody can register an address without an invite for it. |
| `ALLOWED_ORIGINS` | `https://app.<domain>`. Since the security review, consent emails trust the Host header only for loopback or these origins. |
| `MAIL_PROVIDER`, `RESEND_API_KEY` (and `BREVO_API_KEY` for the failover), `MAIL_FROM` | section 3. Staged: production refuses to start without a provider. |
| `NVIDIA_API_KEY` | the learners' models |
| `OLLAMA_ENABLED=0` | there is no local model on the server |
| `DB_FILE`, `SESSION_DB_FILE`, `BETA_INVITES_FILE`, `MAIL_OUTBOX_DIR`, `LOG_DIR`, `BACKUP_DIR` | absolute paths under `/srv/savant/shared` and `/srv/savant/backups` |

**Recommended**

`BETA_GATE=invite`, `BETA_GATE_LOGIN=1`, `MAIL_REPLY_TO`, `MAIL_DAILY_CAP`, `ERROR_ALERT_EMAIL`, `BACKUP_MAX_AGE_DAYS=28`, `OWNER_EMAIL`, `CONSENT_PENDING_ACCESS` (a lawyer question), and `AI_DAILY_CENTS_PER_USER` / `AI_DAILY_CALLS_PER_USER` (spend caps per learner, defaults 25 cents and 120 calls).

**Owner decision:** `FACT_CHECK_ANTHROPIC_KEY` with the server's own `ANTHROPIC_LEDGER_STOP_USD` (1.4), `ANTHROPIC_API_KEY` (the last fallback), `MODELFLARE_API_KEY` (product decisions allow it during the beta; testers must acknowledge it), `SPANISH_LAB=on` (the Spanish lab is off in production unless set).

**Never on the server:**

- `XKIRO_*`, `UNOROUTER_*` (build pipeline only, no learner data). `server.js` already ignores `XKIRO_PIPELINE` and `UNOROUTER_PIPELINE` (security review, 2026-10-24); keep the keys off the box as well.
- `OPENROUTER_GPT_SOL_API_KEY` (coding assistant only), and `OPENROUTER_GLM_API_KEY` and any paid OpenRouter use (no-spend rule).
- `MAIL_ALLOW_OUTBOX=1` (it would "send" parent emails into a file).
- `DEV_TOOLS=1`, `BLOCK_GENERATE=all`, `BLOCK_FACT_GATE=0`, `OLLAMA_FALLBACK_ALL`, `CONSENT_SWEEP=off`, `DB_READONLY`, `AI_LEGACY_PROVIDERS`, `FACT_POOL=offline`.
- `RESEND_API_URL` / `BREVO_API_URL` (test-only overrides).

The full list of variables the code reads is in the source (`grep -o "process.env.[A-Z_]*"`); everything not named here keeps its measured default.

### 2.2 What `NODE_ENV=production` changes (from the code)

**Today:**

- The session cookie is `Secure`.
- `trust proxy` defaults to 1.
- `http` is redirected to `https` (308) when `X-Forwarded-Proto` is `http`.
- HSTS is sent (one year, `includeSubDomains`).
- Static files are cached for 1 hour instead of `no-store`.
- The app refuses to start without a 32+ character `SESSION_SECRET`.
- The mailer refuses to write the dev outbox.
- The consent sweep's test-only `at` time is ignored.
- The game lab is admin-only.
- The Spanish lab is off unless `SPANISH_LAB=on`.

**Added by the staged wiring:**

- Production refuses to start without `MAIL_PROVIDER` or an https `APP_ORIGIN`.
- Sessions are stored in SQLite.
- `/api/health` tells non-admins only `{ ok: true }`. Today it lists every provider and the free memory to anyone.

### 2.3 Session secret and session store

- **Making the secret.** Generate it on the server, straight into the env file, so it never passes through a chat, a terminal log or git: `node -e "console.log('SESSION_SECRET='+require('crypto').randomBytes(48).toString('base64url'))" >> /srv/savant/savant.env`.
- **Rotating it** signs everyone out; do it if the file is ever exposed.
- **Why the session store changes.** Today `server.js` uses express-session's default MemoryStore, which its own documentation says is not for production. It leaks memory, and every restart or deploy signs every tester out.
- **The staged store.** `services/session-store.js` is a SQLite store on `node:sqlite`, with no new package. Expired sessions are pruned every 15 minutes, and sessions survive restarts (tested). It is the default in production; `SESSION_STORE=memory` opts out. The file is not backed up, because losing it only signs people out.

### 2.4 Backups (automated daily, with a restore test)

**What runs.** `scripts/backup-db.js`, run daily by `savant-backup.timer` (03:30 UTC):

1. **Snapshot.** Reads the store while the server runs, retrying if a read meets the server's rename. With `DB_DRIVER=sqlite` it uses SQLite's online backup instead.
2. **Writes the backup.** `db-<UTC stamp>.json.gz` plus a manifest: SHA-256 of the data and of the gzip, and per-collection row counts, highest ids and counters. The invite file and the model ledgers go with it.
3. **Prunes.** Removes backups older than `BACKUP_MAX_AGE_DAYS` (default 28), always keeping the newest 3.
4. **Restore test** (`--restore-test`, the timer's second step). Unzips the newest backup to a temp file and matches both checksums. It checks every collection's ids and counters, then loads the copy through the app's own `config/db.js` in a child process (read-only) and compares row counts. Any mismatch exits 1, so the timer shows as failed. The result is kept in `restore-test-last.json`.
5. **Off-box copy** (`deploy/offsite-backup.sh`). Encrypts the newest backup with `age`, to a public key whose private half stays on the laptop, then uploads it with `rclone` to a Cloudflare R2 bucket. R2's free tier is "10 GB-month / month", 1 million Class A and 10 million Class B operations, and free egress. A backup on the same disk does not survive the disk.

**Measured on a copy of the real store:** backup 906 ms (11.8 MB → 1.56 MB gzipped); restore test 663 to 982 ms (31 collections, 9,702 rows loaded). On SQLite: backup 629 ms; restore test 74 to 124 ms.

**Why 28 days.** The privacy policy promises deletion within 30 days, and `KIDS-CONSENT-IMPLEMENTATION.md` section 9 says backups must follow the deletion schedule. A backup older than that would still hold an account its owner deleted. `offsite-backup.sh` applies the same 28 days to the bucket.

**Restore drill, monthly, on the laptop:**

1. Download the newest `.tar.age` and decrypt it with the private key.
2. Run `node scripts/backup-db.js --restore-test --file <db-*.json.gz> --dir <folder>`.
3. Start a local copy on it (`DB_FILE=<restored copy> npm start`) and sign in as a test account.

**Restoring for real:** section 5, R4.

### 2.5 Log rotation

- **App stdout and stderr** go to journald. The drop-in `journald-savant.conf` caps the journal at 300 MB and 30 days. Read the logs with `journalctl -u savant`.
- **The error log** (`logs/errors.jsonl`) rotates by itself: 5 MB × 5 files (`ERROR_LOG_MAX_MB`, `ERROR_LOG_KEEP`).
- **Caddy's access log** rolls at 20 MiB, keeping 5 files and at most 30 days. The Caddyfile filter drops client IPs, cookies and the `token` and `invite` query values. Check the filter syntax with `caddy validate` on the installed version.
- **The landing site** writes no IPs to disk (`site/server.js`).

### 2.6 Health check and error monitoring, without third-party trackers

`routes/ops.js` (staged):

- **`GET /healthz` (public).** Returns `200 {"ok":true}` or `503 {"ok":false}`. It checks:
  - the store answers and its file exists;
  - the free disk is at least `HEALTH_MIN_FREE_DISK_MB` (200);
  - event-loop p99 is under `HEALTH_MAX_LOOP_MS` (2,000).

  Nothing else is shown, because anyone can call it. It sits outside `/api`, so the consent gate and the origin check never block it.
- **`GET /api/ops/status` (admins; 404 for everyone else).** The same checks with their numbers, plus:
  - the newest backup's age (flagged past `HEALTH_MAX_BACKUP_AGE_H`, 26);
  - the mail transport;
  - the beta gate state and invite counts;
  - memory, uptime and the top error groups.
- **`GET /api/ops/errors` (admins).** The grouped digest and the last 100 entries.

`services/error-log.js` (staged):

- **Where errors go.** Request errors, unhandled rejections and uncaught exceptions go to `logs/errors.jsonl`. An uncaught exception is recorded, then the process exits and systemd restarts it.
- **Grouping.** Errors are grouped by fingerprint: the message with numbers taken out, plus the top stack frame.
- **What is never written:** request bodies, cookies, headers, IP addresses or query strings, so answers, session cookies and consent tokens cannot leak into a log. Email addresses and key-shaped strings are masked.
- **Alerts.** With `ERROR_ALERT_EMAIL` set, the first error of a new kind is emailed, at most once an hour (`ERROR_ALERT_MIN_MS`). A 4xx (a broken JSON body) is recorded as `client` and never emailed.
- **A bug fixed along the way.** The wiring also fixes a broken JSON body being answered 500 "Something went wrong on our side". It now gets a 400 (413 when too large).

**Uptime from outside:** `scripts/health-watch.js --url https://app.<domain>`.

- **Where it runs.** On the laptop's Task Scheduler every 5 minutes: `schtasks /Create /SC MINUTE /MO 5 /TN SavantHealth /TR "node C:\path\to\app\scripts\health-watch.js --url https://app.<domain>"`.
- **What counts as down.** Two failed tries 20 s apart.
- **What it sends.** One email when the app goes down and one when it comes back, through the same mail provider.
- **Why not UptimeRobot.** Its free plan (50 monitors, 5-minute checks) describes itself as "Good for hobby and non-profit projects", so it is not used for a commercial beta.

---

## 3. Email for parental consent, invites and alerts

### 3.1 Free tiers compared (2026-10-24)

| Provider | Free tier | Notes |
|---|---|---|
| **Resend** | 3,000 a month, **100 a day**, 3 custom domains, 30-day data retention, ticket support | Pro is $20 for 50,000 a month with no daily limit. API: `POST https://api.resend.com/emails`, `Authorization: Bearer`, `Idempotency-Key` supported; default rate limit 10 requests a second per team. **Chosen: primary.** |
| **Brevo** | 300 a day per third-party summaries | Brevo's own pricing and limits pages did not render or answered 403 here, so **check the limit and any free-plan branding on Brevo's site when opening the account**. API: `POST https://api.brevo.com/v3/smtp/email`, `api-key` header, 201 with `messageId`. **Chosen: automatic failover.** |
| Mailgun | 100 a day, 1 sending domain, 1-day log retention | Basic is $15 for 10,000 a month. |
| MailerSend | 500 a month, 100 daily API requests, 1 domain, 1-day activity retention | |
| SMTP2GO | 1,000 a month | The page did not state daily limits. Starter is $10 for 10,000. |
| Postmark | 100 a month (does not expire) | Basic is $15 for 10,000. |
| Amazon SES | No standing free quota; new accounts get "up to $200 in AWS Free Tier credits" for 6 months | Then $0.10 per 1,000 on à-la-carte pricing. SES now also sells plans (Essentials is $0.16 per 1,000), and inactive account-regions start on Essentials from 21 July 2026, so choose à-la-carte (re-checked 2026-10-25). |
| Cloudflare Email Sending | beta, "Available on Workers Paid plan" | Not free. Email Routing (free) only forwards inbound mail. |

**Expected volume in the beta** is far under 100 a day: invites (one per approved tester), consent requests and their next-day confirmations (two per child), alerts (rate-limited). If a busy day hits Resend's 100, the failover sends through Brevo; the cap is counted per provider per UTC day in `mail-counters.json`, which holds counts only, no addresses.

### 3.2 The adapter (staged): `utils/mail-transports.js`

- **No mail library.** It calls the providers' HTTP APIs with Node's own `fetch`. The output is plain text, as the consent flow writes it.
- **`installFromEnv()`** plugs the configured provider into the existing `utils/mailer.js` with `setTransport()`; `mailer.js` itself is unchanged. `MAIL_PROVIDER=resend,brevo` means Resend first, then Brevo on a 429, a 5xx, a timeout or the daily cap. A 4xx such as a bad address goes straight back to the caller, because the second provider would refuse it too.
- **Keys.** A key is never logged; errors carry the provider's status and message only (tested). Resend gets an idempotency key per message, so a retry after a timeout does not send twice.
- **Wiring.** One call at the top of `server.js` (in `apply.js`).
- **Tested** against a mocked `fetch` (request shapes, headers, failover, caps, restarts) and end to end. The real server, given a fake Resend on 127.0.0.1, sent a child sign-up's consent request with the Bearer key, the verified sender and an `APP_ORIGIN` link (section 6).

**Account setup:**

1. Make the Resend account, add `send.<domain>` as a domain, and add the records it shows in Cloudflare DNS (DNS only).
2. Wait for "verified", then make an API key with **sending access only** and put it in `savant.env`.
3. Do the same at Brevo for the failover.
4. Sign both providers' data-processing terms. This is an open item on the lawyer's list (`KIDS-CONSENT-IMPLEMENTATION.md` section 9, "Operations").

---

## 4. Beta testers: from the landing site's form to an account

### 4.1 The flow

1. **Someone applies.** They fill in the landing site's beta form (`site/server.js`), which writes `site-data/beta.jsonl`: id, time, email, name, role (learner / parent / teacher), age confirmation ("I am 13 or older, or I'm a parent signing up for my child") and `status: applied`. The app never writes that file.
2. **The owner reviews.** `node scripts/beta-invites.js applicants --from /srv/savant/site-data/beta.jsonl` lists every application with its invite state.
3. **The owner approves.** `node scripts/beta-invites.js approve-applicants <id,id> --from ... --send` makes a one-time code per address and emails it: "You are in ... Beta testers use it completely free", the `/join` link, the code, and the expiry (30 days).
4. **The tester signs up.** They open `https://app.<domain>/join?invite=<code>`. The gate keeps the code in the session and sends them to `/register` with the code out of the address bar, so the register page needs no change.
5. **The gate checks the code.** On sign-up, `middleware/beta-gate.js` (with `BETA_GATE=invite`) asks for a valid code bound to the sign-up's email, or, for a child sign-up, to the parent email. It then marks the code used by the new account and puts `beta_tester` on the user row.
6. **Sign-in is gated too.** With `BETA_GATE_LOGIN=1`, an account that did not come through an invite, and is neither an admin nor in `BETA_ALLOW_EMAILS`, is told the beta is invite-only. It is told only after its password checks out, so the answer never reveals which emails have accounts. Both gated paths answer before the auth router's own limits, so they carry their own: 20 sign-ups an hour and 20 password tries per 15 minutes per address.

### 4.2 Codes

- **Format.** 10 characters of Crockford base32 (`XXXXX-XXXXX`, 50 bits, from `crypto.randomBytes`). Lower case, a missing dash, and the look-alikes I, L and O are accepted.
- **Storage.** Only a SHA-256 of the code is stored (`beta-invites.json`), so the file cannot be used to sign up. A lost code is revoked and approved again.
- **Binding.** A code is bound to its email unless `BETA_BIND_EMAIL=0`, so a forwarded code does not work for a stranger. Approving the same address again replaces the old code.
- **Commands.** `revoke <email>` stops a code, and `forget <email>` removes an address's invite rows (for a data request; the site's own `node server.js forget <email>` covers the application).
- **Double use.** Two sign-ups racing with one code: the second gets 409 while the first is in flight, then "already used".

### 4.3 Messages a tester can see

There are plain 403 messages for: no code, an unknown code, a used one, an expired one, a revoked or replaced one, and another email's code. Each tells the tester what to do next.

### 4.4 Not built here: the tester consent gate

The owner's decision (memory, 2026-10-23) is full access once the tester terms are accepted, by a parent for a minor. The auto-mode safety checker blocked building that gate on 2026-10-23, and it **stays blocked in this session**. It was not built, and nothing here works around it.

What this kit leaves for it:

- `redeem()` records `terms_accepted: null` on each invite, so the gate has a field to fill.
- The invite email already tells a parent to use their own email on the child sign-up.

**Until the owner builds the gate elsewhere:** approve adult applicants, and teen applicants at or over their country's consent age, only. A child's sign-up would run today's parental consent flow, whose outside-AI paths are not yet fully closed (`KIDS-CONSENT-IMPLEMENTATION.md` section 4).

---

## 5. Launch day and rollback

### 5.1 Launch-day checklist

**Before the day (T-2 to T-1):**

- [ ] **L-0. Update body-parser.** When online, run `npm update body-parser` (GHSA-27r3-jxmh-p828; mitigated for now with `inflate: false`, per `SECURITY-REVIEW-2026-10-24.md`) and commit the lockfile.
- [ ] **L-1. Run the tests on the laptop.** Run `node curriculum-build/staged/beta-launch/apply.js --check`: every anchor must be found. Then run the `npm test` chain on a DB copy with keys blanked and `OLLAMA_ENABLED=0` (`ollama-provider-test` without it), plus `node scripts/beta-launch-test.js` (138 checks).
- [ ] **L-2. Set up the Droplet.** Create it and follow 1.5 steps 1 and 2. Buy the domain, add the DNS records (1.6), and verify Resend and Brevo (3.2).
- [ ] **L-3. Apply the wiring on the laptop.** Run `node curriculum-build/staged/beta-launch/apply.js --write --backup <folder>`, then run the tests again on the patched files. Coordinate first with whichever agent or session is editing `server.js` that day.
- [ ] **L-4. Write the env file.** Fill `savant.env` (2.1) and generate the session secret there (2.3). Check that no build-only key is in it (the "Never on the server" list).
- [ ] **L-5. Rehearse the deploy.** Rsync and `release.sh` with a **copy** of the store. Check `/healthz`, `/api/ops/status` (as admin), sign-up through an invite, the consent email to your own second address, and a restart keeping you signed in. Run `backup-db.js` and `--restore-test` on the server.
- [ ] **L-6. Finish the landing site.** Set `site/config.js` (contact emails, socials) and `SITE_ORIGINS`; run its `npm test`. The site agent owns those files.
- [ ] **L-7. Settle the open decisions.** The lesson gate key (1.4). Adults-only approvals until the tester consent gate exists (4.4). The privacy-policy placeholders filled (hosting: DigitalOcean, region; email: Resend and Brevo; `KIDS-CONSENT-IMPLEMENTATION.md` section 9).

**The day:**

- [ ] **L-8. Freeze the laptop's store.** Pause the pipeline jobs that write the laptop's `data/db.json` (`staged/night-runner/state/STOP`), then copy `data/db.json`, `data/spanish-media/` and the ledgers to the server (`shared/data`). Record the file's SHA-256 on both ends.
- [ ] **L-9. Start the services.** `systemctl start savant savant-site`. `curl https://app.<domain>/healthz` must answer `{"ok":true}`, and the journal must show `mail: resend>brevo; sessions: sqlite; beta gate: invite`.
- [ ] **L-10. Back up the first day.** `systemctl start savant-backup` by hand, then check `restore-test-last.json` (ok) and the off-box copy in R2.
- [ ] **L-11. Watch it from outside.** Start the health watch on the laptop and confirm one "down" and one "up" email by stopping the app for a minute.
- [ ] **L-12. Invite a first wave of 3 to 5 people you know.** Watch `/api/ops/status` and `/api/ops/errors` for an hour before the next wave.
- [ ] **L-13. Point the site at the app.** Once the first wave is fine, replace the app link placeholder (if any) in the landing site. Then approve applicants in waves.

**After the day:**

- [ ] **L-14. Check every morning:** the backup timer (`systemctl status savant-backup`), the error digest, the store size and event-loop p99 (the SQLite move trigger, 1.3), and the mail counts.
- [ ] **L-15. Monthly:** a restore drill on the laptop (2.4), and DigitalOcean's billing page.

### 5.2 Rollback plan

| # | What went wrong | What to do | Data loss |
|---|---|---|---|
| R1 | A new release misbehaves | `release.sh` switches back by itself when `/healthz` fails. Otherwise, by hand: `ln -sfn /srv/savant/releases/<previous> /srv/savant/app.next && mv -Tf /srv/savant/app.next /srv/savant/app && systemctl restart savant`. | none (the shared data is untouched) |
| R2 | The staged wiring itself (gate, mail, sessions) misbehaves | Turn the part off by setting its variable: `BETA_GATE` unset (warning: sign-ups open to anyone, so prefer `BETA_ALLOW_EMAILS`, or reissuing codes), `MAIL_PROVIDER=brevo` alone, `SESSION_STORE=memory`. Restart. To remove it completely, copy the backups from `apply.js --write --backup` over the three files and deploy. | none |
| R3 | The SQLite driver misbehaves | `systemctl stop savant`, then `node scripts/migrate-json-to-sqlite.js --reverse --from shared/data/db.sqlite --to shared/data/db.json.from-sqlite`. It checks every row against the SQLite file. Move it to `db.json`, remove `DB_DRIVER` from `savant.env`, start. | none (tested: an account made on SQLite is in the JSON written back) |
| R4 | The store is damaged or wrong (a bad import, a bug that deleted rows) | Stop the app. `node scripts/backup-db.js --list`, pick the last good backup, run `--restore-test --file <it>`, then `--restore <it> --to shared/data/db.json.restored` and swap it in. Start. Tell the affected testers what was lost since that backup (at most a day). | since the backup |
| R5 | The Droplet or its disk is gone | New Droplet (1.5), then the newest off-box backup (decrypt on the laptop, upload), then R4's restore. Repoint the `A` records (Cloudflare DNS changes take effect in minutes at low TTL). **Emergency $0 fallback while that happens:** run the app on the laptop from the same backup behind a Cloudflare Tunnel on `app.<domain>`, with `OLLAMA_ENABLED=0` and **only the server's env values** (not the laptop's `.env`). | since the backup |
| R6 | The mail provider fails or suspends the account | The failover covers a 429, a 5xx and the cap. For a suspension, set `MAIL_PROVIDER=brevo` and restart. Consent requests that failed show "send the email again" to the child (`routes/consent.js`). | none |
| R7 | The whole beta must stop (a privacy incident, a legal question) | Put a static "paused" page in Caddy for `app.<domain>` (`respond "Savant's beta is paused for a short while." 503`), keep the app stopped, and keep the backups. The landing site keeps taking applications. | none |

---

## 6. Tests

**`node scripts/beta-launch-test.js`: 138 checks, all passing (2026-10-24).**

- **How it runs.** On temporary copies only, with model keys blanked and `OLLAMA_ENABLED=0`. The only network use is 127.0.0.1.
- **How it tests the wiring.** It applies `apply.js` to the `server.js` of the day in a temporary file and runs it for real.
- **How it tests the SQLite driver.** It simulates the `config/db.js` patch with a require hook. The real file is not edited.

What it covers:

1. **Mail.** Resend and Brevo request shapes and headers; 429 failover; no failover on a 4xx; the daily cap (persisted, failing over, resetting the next UTC day); the key never in an error; `installFromEnv` replacing the outbox.
2. **Invites.**
   - Code format; only the hash stored.
   - Email binding (adult and child-parent); expiry; reuse; replace; revoke; forget.
   - The site's JSONL read without being changed.
   - The CLI end to end, sending to the dev outbox without loading the data file.
3. **Sessions.** Set, get, expiry, prune, touch, destroy, and a restart on the same file.
4. **Error log.** Route, status and user recorded; no query string, body or cookie; emails masked; grouping; rotation.
5. **SQLite driver.**
   - The same operations on both drivers give the same rows after a reload, including an edit made outside the API.
   - A write survives a hard kill 250 ms later.
   - It refuses to start on an unmigrated store.
   - On a copy of the real `data/db.json`: migration (9,702 rows, 1.6 s), `--verify`, detection of one changed row, reverse to JSON loaded by the JSON driver, and refusing to overwrite without `--force`.
6. **Backups.**
   - Backup with manifest and extras; the source unchanged; checksums; the restore test passing.
   - Pruning past 28 days while keeping the newest 3.
   - A corrupted backup failing the restore test; restore refusing to overwrite, then writing an exact copy.
   - The SQLite backup and restore test.
7. **The patched server:**
   - every anchor found; the start-up line; the key not in the output;
   - `/healthz`, and `/api/ops/status` hidden from visitors;
   - the gate refusing a missing, unknown or other-email code; `/join`; sign-up making the account and redeeming the code; reuse refused; a child sign-up through the parent's invite;
   - the consent email through a fake Resend with an `APP_ORIGIN` link;
   - the login gate (a wrong password still 401; non-invited 403; an invited tester and an admin allowed; password guesses rate-limited);
   - admin `/api/ops/status` and `/api/ops/errors`; a broken JSON body answered 400 and logged without its body;
   - sessions surviving a restart;
   - production refusing to start without a mail provider, with an `http` `APP_ORIGIN`, or with a short secret; production `/api/health` trimmed; sessions on SQLite by default;
   - the whole app on the SQLite driver: a sign-up; a JSON-era account signing in after the migration; a restart; no JSON written; rollback carrying the new account back.
8. **Health watch.** Up; down (one notice naming the status); still down (no second notice); back up (one notice).

**The `npm test` chain** (45 steps on 2026-10-24, plus `beta-launch-test.js`), run step by step on a copy of `data/db.json` with every model key blanked and `OLLAMA_ENABLED=0` (`ollama-provider-test` without it):

- **Second run, 03:44 UTC: 46 of 46 passed.**
- **First run, 03:2x UTC: 44 of 45.** `self-test.js` failed once while other agents were editing services. It then passed on its own twice and in the second full run. No file it loads was changed by this kit.

---

## 7. Files

**New, not loaded by the app until the wiring is applied:**

- `utils/mail-transports.js`
- `services/beta-invites.js`
- `middleware/beta-gate.js`
- `services/session-store.js`
- `services/error-log.js`
- `routes/ops.js`
- `config/db-sqlite.js`
- `config/db-sqlite-schema.js`

**New tools (run by hand or by the timer; they change nothing in the app):**

- `scripts/backup-db.js`
- `scripts/migrate-json-to-sqlite.js`
- `scripts/beta-invites.js`
- `scripts/health-watch.js`
- `scripts/beta-launch-test.js`

**Staged wiring and deploy files:** `curriculum-build/staged/beta-launch/`:

- `apply.js` (check and apply);
- `server.js.patch` and `config-db.js.patch` (the same changes as diffs, for reading, made against the files of 2026-10-24 03:40 UTC; `apply.js` is the one to use);
- `deploy/` (section 1.5).

**Not edited:** `server.js`, `config/db.js`, `utils/mailer.js`, `package.json`, `middleware/*`, `routes/*` (except the new `routes/ops.js`), `site/*`, `data/*`, `.env`. Backups of the files this kit patches, as they were before it started: `C:\Users\admin\AppData\Local\Temp\claude\C--coding-claudecommittdIq-folderThing\34e6f487-b3f5-4acd-899c-244171ef0427\scratchpad\before-launch-kit\`.

**Sources** (read 2026-10-24):

- **Hosting:** [hetzner.com/cloud](https://www.hetzner.com/cloud/), [Hetzner regular performance](https://www.hetzner.com/cloud/regular-performance/), [Hetzner cost-optimized](https://www.hetzner.com/cloud/cost-optimized/), [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Fly.io pricing](https://docs.fly.io/about/pricing), [Render free](https://render.com/docs/free), [Google Cloud free features](https://docs.cloud.google.com/free/docs/free-cloud-features), [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets), [Railway plans](https://docs.railway.com/reference/pricing/plans), [Koyeb pricing](https://www.koyeb.com/pricing).
- **Cloudflare:** [Tunnel](https://developers.cloudflare.com/tunnel/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Registrar](https://www.cloudflare.com/products/registrar/), [Registrar FAQ](https://developers.cloudflare.com/registrar/faq/), [Email Routing](https://developers.cloudflare.com/email-routing/).
- **Email:** [Resend pricing](https://resend.com/pricing), [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [Resend rate limit](https://resend.com/docs/api-reference/rate-limit), [Resend domains](https://resend.com/docs/dashboard/domains/introduction), [Brevo send API](https://developers.brevo.com/reference/sendtransacemail), [Mailgun pricing](https://www.mailgun.com/pricing/), [MailerSend pricing](https://www.mailersend.com/pricing), [SMTP2GO pricing](https://www.smtp2go.com/pricing/), [Postmark pricing](https://postmarkapp.com/pricing), [Amazon SES pricing](https://aws.amazon.com/ses/pricing/).
- **Uptime:** [UptimeRobot pricing](https://uptimerobot.com/pricing/).
