# Savant public site

The landing page for the domain. It is not the app: one page about what Savant is and will be,
links to the socials, an updates sign-up, a beta application, an investor area, and a privacy page.
No cookies, ad trackers or third-party requests; the fonts are self-hosted. Simple visit statistics are
kept on our own server (see "Visit statistics"), with consent first in the UK, EU, EEA and Switzerland.

## Files

| File | What it is |
| --- | --- |
| `config.js` | **The one block you fill in**: contact emails, form endpoint, social links |
| `index.html` | The page: hero, how it works, subjects, beta, updates, investors, footer |
| `privacy.html` | What the forms collect, how long it is kept, and a "remove my details" form |
| `thanks.html`, `404.html` | Shown after a form sent without JavaScript; not-found page |
| `assets/site.css`, `assets/site.js`, `assets/theme.js` | Styles (the app's "Measured and marked" design), form handling, light/dark |
| `fonts/` | Atkinson Hyperlegible Next and Mono (one variable file each, SIL OFL 1.1; the licences ship with them) |
| `favicon.svg` | The three-tick logo, light/dark aware |
| `server.js` | Small Node server: serves the pages and stores form submissions |
| `admin.js`, `admin-assets/` | The private admin page (see "Private admin page"); never served as files |
| `analytics.js`, `analytics-report.js`, `admin-visitors.js` | Visit statistics: collection and storage, the numbers for the admin page, the Visitors tab (see "Visit statistics") |
| `geo.js`, `geo/ip-city.bin`, `geo/land-50m.json`, `geo/borders-50m.json`, `geo/states-50m.json` | In-memory IP geolocation (DB-IP, CC BY 4.0) and the globe's land, country borders and state/province lines (Natural Earth 50m, public domain). `geo/raw/` holds the downloads and is gitignored |
| `tools/build-geo.js` | Builds the two geo files from the downloads (`node server.js geo-update` runs it) |
| `assets/track.js` | The page's visit-statistics event recorder, used by `assets/site.js` |
| `admin.env` | The admin page's private settings, made on the server. Gitignored, never served, `chmod 600` |
| `test.js` | Tests for the server: validation, spam guards, same-origin checks, removal, the admin page |
| `_headers` | Security headers for Netlify or Cloudflare Pages |
| `data/` | Submissions, one `.jsonl` file per form. Gitignored. Never commit it |
| `screenshots/` | 375 px and 1280 px, light and dark, plus the beta form's error and sent states. `before/` and `after/` hold the 2026-10-24 design fixes at 375, 768, 1024 and 1280 px, light and dark |

## What you must fill in

1. **`config.js`**
   - `contactEmail`, `investorEmail` and `privacyEmail` are all `contact@savantedu.com` for now
     (an empty `investorEmail` or `privacyEmail` falls back to `contactEmail`). The same address is
     written into the mailto links of the HTML pages so they work without JavaScript; if you change
     it, change those links too (`node test.js` checks them).
   - `socials`: the full `https://` URL for Instagram, TikTok, X (Twitter) and YouTube. The footer
     shows each platform's own logo (drawn inline by `assets/site.js`, nothing loaded from the
     platforms); an entry still starting `REPLACE_` shows as a dashed, unlinked logo with
     "Accounts open soon." underneath. `icon` picks the logo; add or delete lines as needed.
   - `formEndpoint`: leave `''` when you run `server.js`; see the deploy options below.
2. **`privacy.html`**: the dashed placeholders (operator's legal name and postal address, hosting
   provider and region, log retention, email provider, how long investor notes are kept, response
   time). Have a lawyer read it with the app's own privacy policy.
3. **The domain**: once bought, set `SITE_ORIGINS=https://your-domain,https://www.your-domain` for
   `server.js`, and if you like add `<link rel="canonical" href="https://your-domain/">` and an
   `og:url` meta to `index.html`. An OG preview image is not made yet.
4. **Facts on the page** come from `docs/PRODUCT-DECISIONS.md` and the live catalogue on 2026-10-24
   (nine subjects, 219 grades). Update the subjects table if subjects are added.

## Run it locally

```
cd site
node server.js            # http://127.0.0.1:8787  (PORT=... to change)
node test.js              # 60 tests, uses a temporary data folder and a tiny fixture geo file
```

`express` is the only dependency. Inside this repo it is found in `../node_modules`; on its own,
run `npm install` in `site/` first (it is listed in `site/package.json`).

## Deploy options

**The live site runs on a Google Cloud Ubuntu 24.04 VM, set up by one script.** See
[`deploy/README-DEPLOY.md`](../../deploy/README-DEPLOY.md) (the `deploy` folder next to this
repo; the same file is inside the package). The package, `deploy/savant-site-vm.zip`, holds
this site with express already installed and `setup.sh`; on the VM you run
`sudo bash setup.sh` and it installs Node.js 22, Caddy (HTTPS), the `savant-site` service,
ufw, fail2ban, automatic updates, a monthly geo update and daily backups, and sets up the
admin sign-in with Google Authenticator. Rebuild the package after changing the site:

```
cd deploy
node build-zip.js --deps <a folder where "npm install --omit=dev" was run with site/package.json>
```

The options below are for other hosts.

### A. Run server.js (simplest, keeps submissions on your own server)

Any host that runs Node 18 or later (a small VPS, Render, Railway, Fly.io):

```
npm install --omit=dev
NODE_ENV=production PORT=8080 SITE_ORIGINS=https://your-domain TRUST_PROXY=1 node server.js
```

- `NODE_ENV=production` binds 0.0.0.0 (otherwise 127.0.0.1). `TRUST_PROXY=1` when behind the
  host's proxy or Cloudflare, so the rate limit sees real visitor IPs.
- **`data/` must be on a persistent disk.** Many free tiers wipe the disk on every deploy; attach a
  volume, or set `DATA_DIR` to one.
- Put HTTPS in front (the host's, Caddy or Cloudflare). The server sends HSTS when it sees HTTPS.

### B. Static host plus the form server elsewhere

Upload the site folder to Netlify, Cloudflare Pages or GitHub Pages (only the public files are
needed: the HTML pages, `config.js`, `favicon.svg`, `assets/`, `fonts/`, `_headers`). Run
`server.js` somewhere else as in A, with `SITE_ORIGINS=https://your-domain` so it accepts posts and
answers CORS from the static site. Then set `formEndpoint: 'https://forms.your-domain'` in
`config.js`, and add that origin to `connect-src` in `_headers`.

### C. Static host only, no backend

Set `formEndpoint: 'mailto'`. Every form then opens the visitor's email app with their answers
filled in, addressed to your contact email. Nothing is stored anywhere except your inbox. (With
`''` the page would first try `/api/health`, find nothing, and fall back to email anyway, at the
cost of one 404 in the console.)

A hosted form service (Formspree and the like) would also work, but it is a third party that sees
every submission; the privacy page would have to name it. It is not wired in.

## How the forms behave

- With JavaScript: the page checks `<endpoint>/api/health`, then posts JSON. Errors appear under
  each field and focus moves to the first one. If the server cannot be reached, the form falls back
  to email.
- Without JavaScript: the forms post normally to `server.js`, which redirects to `thanks.html` or
  shows a page listing what to fix.
- Beta: email, name or nickname, role (learner, parent, teacher), "Why should we accept you?"
  (required, 30 to 1,000 characters, checked in the browser and again in `server.js`, stored as
  `why` with the question as `why_question`), "I am 13 or older, or I'm a
  parent signing up for my child" (required), and consent to be emailed (unticked, required).
  No child email is ever asked for.
- Updates: email and consent (unticked, required). Investors: name, email, firm (optional), message.
- The exact words of each ticked box are stored with the answer.

## Spam and abuse guards (server.js)

- Honeypot field (`website`), hidden off-screen; filled in means the bot gets "thanks" and nothing is stored.
- Minimum fill time: a JavaScript post sent under 1.5 s after the page loaded is treated the same way.
- Rate limits in memory: 5 posts per IP per form per 10 minutes, 300 per form per hour overall
  (`RATE_PER_IP`, `RATE_PER_FORM`). The IP is never stored with a submission (visit statistics are
  separate; see below).
- Same-origin only: a POST must carry a matching `Origin` (or `Sec-Fetch-Site: same-origin`, or a
  matching `Referer`); anything else gets 403. No cookies exist, so there is nothing to ride on.
- JSON or form bodies only, 16 KB at most; strict field lengths; control characters stripped.
- Updates and beta keep one entry per email; a repeat gets the same answer, so the form never
  reveals who is already signed up.
- Only the listed public files are served; `server.js`, `admin.js`, `data/`, this README, dotfiles
  and anything named `admin.env*` are not.

## Handling the data

```
node server.js export            # data/export-updates.csv, export-beta.csv, export-investors.csv
node server.js forget a@b.com    # delete every submission for an address, and the visits linked to them
```

Visitors can also remove themselves on the privacy page (`/privacy#remove`): it deletes every entry
for that address at once, with the visit statistics linked to those entries (every visit from the IP
addresses they were linked to), and gives the same answer whether or not it was there. It needs no proof
that the address is theirs, which is the usual trade-off for an email list: the worst misuse is
removing someone else from a list. Approve beta testers by editing `status` in `data/beta.jsonl`, or
from the CSV export.

## Visit statistics

Our own server keeps the statistics: no cookies, no third party, nothing loaded from other hosts (the
CSP is unchanged: `'self'` only). `privacy.html` ("Visit statistics") is the public description; keep
it in step with any change here.

### What is recorded, for whom

| Visitor | What is kept |
| --- | --- |
| Outside the UK, EU, EEA and Switzerland | An identified page view: time, IP address, path, source, referrer **host** only, `utm_source`/`utm_medium`/`utm_campaign`, `?src=`, country, city and lat/lon rounded to 0.1&deg;, device type, model (iPhone, Pixel 8, Samsung SM-S918B...), OS and browser with major versions, screen size (to 10 px) and pixel ratio, language, time zone. Then its interaction events (below) |
| UK, EU, EEA, Switzerland (and Crown Dependencies, Gibraltar, EU outermost regions), judged by the in-memory geo lookup | A one-line notice: "May we keep simple visit stats, including your IP address? See Privacy." with Allow / No thanks (44 px targets) and a close button. The choice lives in `localStorage` (`savant-visit-stats`) only. Until Allow: **anonymous daily counters only** (country + source + device type; event type + page), never an IP or anything per visitor. After Allow: as above |
| Global Privacy Control (`Sec-GPC: 1` or `navigator.globalPrivacyControl`), anywhere | Anonymous counters only; no notice |
| An IP that chose "Don't allow" on the privacy page | Anonymous counters only. The IP is kept as a salted SHA-256 hash (`data/visit-optout.json`, salt in `data/visit-salt`), and its stored visits are deleted at once |
| Bots (user-agent patterns, `navigator.webdriver`), no JavaScript | Nothing (no JS means no beacon) |
| The signed-in admin (valid session cookie) or an address in `ADMIN_ALLOW_IPS` | Nothing |
| No geo file loaded | Everyone counted anonymously; the notice never shows; a warning at start |

**Interaction events** (identified visits; anonymous ones keep only the event type and page): scroll
milestones 25/50/75/90/100% and the deepest point; sections seen and time in view; active time
(visible, focused, not idle 30 s) and total time; clicks on buttons and links (the element's id,
`data-track` or visible label, 60 characters; an internal path or an outbound **host**; the section;
the kind: nav, social, mail, theme, evidence, out, link, button); rage clicks (3 within 1 s on one
spot) and dead clicks; per form (updates, beta, investors, remove): seen, each field focused (by
**name**), validation errors by field and kind (e.g. `why-too-short`), submit pressed, sent (with the
time from first focus), and abandoned with the last field touched; load timing (TTFB, DOM ready,
load), Web Vitals (LCP, CLS, INP); script errors (message and file:line); 404s by path; the notice
choice and GPC (always anonymous counts). **Nothing anyone types is ever read or sent**: no input
values, keystrokes, mouse paths or session replay (`assets/track.js` never touches `.value`; the
tests check it with a field whose value cannot be read). Sessions (30 minutes without activity),
pages per session, entry and exit pages and new versus returning visitors are worked out on the
server from the page views.

### How it is sent

`assets/site.js` posts one beacon per page view to `POST /api/visit` (path, `document.referrer`, UTM
tags, `src`, the consent state, GPC). The answer is a short page-view token (identified), "anonymous",
or "off". The device details follow once in the first event batch, and events go to
`POST /api/visit-events` every 5 seconds and on `pagehide` (`sendBeacon`, `text/plain`). The privacy
page's control posts to `POST /api/visit-choice`. All three are same-origin checked like the forms,
JSON only (16 KB), and rate limited (`VISIT_RATE_PER_IP`, default 60 page views per IP per 10 minutes,
five times that for event batches; 20,000 page views an hour overall). The server takes the IP from
`req.ip` (so `TRUST_PROXY` applies), and only accepts a token's events from the address it was given to.

### Tagging links

Add `?src=` to links you share, for example `https://savantedu.com/?src=email` in emails,
`?src=ig` for an Instagram bio, `?src=podcast`. `ig`, `fb`, `tw`/`twitter`, `yt`, `li`, `tt`, `mail` and
`newsletter` are folded into the platform names. Standard UTM tags work too: `utm_medium=email` always
counts as Email, otherwise `utm_source` names the source; `src` wins over UTM, and UTM over the referrer.
Without tags, the referrer host decides: Google (any `google.*`), Bing, DuckDuckGo, Yahoo, Instagram,
Facebook (also `fb.com`, `m.`/`l.facebook.com`), X (`t.co`, `x.com`, `twitter.com`), TikTok, YouTube,
LinkedIn (also `lnkd.in`), Reddit, Email (webmail such as `mail.google.com`, `outlook.live.com`), any
other site by its host, "Direct" with no referrer, and "Within the site" for links between our pages.

### Linking names, removal, retention

- When a form is sent (updates, beta, investors) from an IP that had an identified visit in the last
  24 hours, `data/visit-links.jsonl` records the form, the submission id, the IP and the time. The
  Visitors tab then shows that name and email next to the visitor. The form records are unchanged.
- "Remove my details" and `node server.js forget <email>` delete the submissions, their links, and
  every visit (and its events) from the linked IPs, in every month, compressed ones included.
- **24 months.** On start and daily, months older than 24 months are deleted, the month on the edge is
  rewritten without the older records, and old counter days and links go too (logged in
  `data/visits/log.jsonl`).

### Storage

- `data/visits/YYYY-MM.jsonl` (page views) and `YYYY-MM.events.jsonl` (events), mode 0600, appended
  through the same one-at-a-time queue as the forms. Two hours into a new month, the previous months
  are gzipped to `.jsonl.gz`; the admin page reads them through zlib (streamed) and caches each closed
  month's totals until its file changes.
- Each month file is dictionary encoded: a line `{"$":"text"}` defines the next string id (1, 2, ...)
  and records use those ids under short keys (`p` path, `s` source, `y` city, `m` model...). Times are
  epoch seconds; IPv4 addresses are numbers (IPv6 stays text). Removal and pruning rewrite a month with
  a fresh table, keeping its gzip state. A running server notices a file rewritten by the
  `forget` command and re-reads its table.
- `data/visit-counts.json`: the anonymous daily counters. Its keys per day are capped at 3,000.
- **`DATA_MAX_MB`** (default 2000): checked at start and hourly. Over it, whole months are deleted,
  oldest first (never the current one), each logged as `cap_prune`; if the current month alone is
  still over, new visits are counted anonymously until there is room (`cap_full`). The Visitors tab
  shows the disk used, the cap, each month's size and these events.
- Measured on the seeded test data (670 page views, 15.9 events each): a page view record is 174 bytes
  raw and 23 bytes gzipped, an event 41 bytes raw and 7 bytes gzipped, so a page view with its events
  is about 820 bytes raw (current month) and 140 bytes gzipped (closed months). Projected for 24 months:
  about **0.11 GB at 1,000 page views a day, 1.1 GB at 10,000, 11.3 GB at 100,000** (of which the open
  month is 23 MB, 235 MB and 2.3 GB). Real traffic compresses less well than seeded data; allow 2 to 3
  times that. At 100,000 a day, raise `DATA_MAX_MB` (for example to 15000) or the cap will keep only
  the newest months, and expect the Visitors tab to take seconds to build.

### Geo data (`geo/`)

- `geo/ip-city.bin` (about 37 MB) is built from DB-IP's "IP to City Lite" CSV: sorted IPv4 and IPv6
  ranges, adjacent ranges with the same place merged, places numbered by frequency, varint-coded in
  blocks of 64 with a block index. The server loads it into one Buffer at start: **about 38 MB of
  RAM**, a lookup takes about 3 µs (IPv4) or 6 µs (IPv6). IPv6 is matched on its top 64 bits.
- `geo/land-50m.json` (382 KB), `geo/borders-50m.json` (88 KB) and `geo/states-50m.json` (128 KB) are Natural Earth's 50m land, country borders and state/province lines, lightly simplified (Douglas-Peucker 0.02&deg;; coordinates
  stored as integers of degrees x100, about 1 km), served to signed-in admins only at
  `/donteventry/assets/land.json`, `borders.json` and `states.json`.
- **Refresh monthly** (DB-IP publishes a new file at the start of each month). On the VM, `setup.sh`
  installs `savant-geo-update.timer`, which does this on the 3rd of each month as the service user
  and then restarts the site (`sudo systemctl start savant-geo-update` runs it now). By hand, as the
  service user, outside the service (its systemd sandbox cannot write to the app folder):
  ```
  sudo -u savant bash -c 'cd /srv/savant/app && node server.js geo-update'
  sudo systemctl restart savant-site
  ```
  `geo-update` downloads `https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.csv.gz` for this
  month (or last month early in the month) into `geo/raw/`, checks it, rebuilds `geo/ip-city.bin`
  (about 45 s, and up to about 320 MB of memory while building; the running site needs only the
  38 MB), and deletes older raw downloads. (`setup.sh` makes `geo/` the one app folder the service
  user can write, for this.) To rebuild
  from files you downloaded yourself: `node tools/build-geo.js --csv <file.csv.gz> --land <file.geojson>`.
- Attribution, required by CC BY 4.0: "IP geolocation by DB-IP.com" with a link, shown on the
  Visitors tab and on the privacy page. Natural Earth is public domain.

### The Visitors tab

`/donteventry?form=visitors`, server-rendered, every value escaped; its script
(`/donteventry/assets/visitors.js`) and the land file are served only to a signed-in session. It shows
the summary (total, unique by IP, anonymous, countries, sessions, returning), a 3D globe (orthographic
canvas, drag or arrow keys to turn it, slow spin that stops on interaction, pauses on hover and never
runs with reduced motion; dots clustered to about 1&deg;, area by visitors, "City, Country: N
visitors" on hover or tap; a legend and the top locations as a list), visits by source with
conversion per source, devices (type, OS, browser, models; conversion by device type), engagement
(active time, scroll depth, sections, entry and exit pages, conversion by entry page), a funnel per
form with drop-off and abandon fields, clicks (top elements, outbound hosts, mailto, theme, nav,
evidence, rage and dead clicks), speed (median and 75th percentile of TTFB, DOM ready, load, LCP, CLS,
INP), script errors and 404s, the top visitors (by IP, with linked name and email, location, device,
first and last seen, visits, sources and pages; a search box; select a row for that visitor's
sessions and events), the notice choices and GPC counts, and storage.

## Private admin page

A page only the owner can open: sign in, see every submission (updates, beta, investors) newest
first, with a tab per form and a search box, export a form as CSV, delete one entry (a two-step
confirm, no JavaScript needed), log out, read the last 50 security events, and see the visit
statistics on the Visitors tab (see "Visit statistics"). It lives at
`/donteventry`. Nothing links to it, and it is deliberately **not** in a robots.txt, because listing it
there would publish the path. Until it is configured, and for anyone it does not let in, that path
answers exactly like any unknown address: the normal 404 page.

**Every sign-in needs the password and a 6-digit authenticator code.** The page is on only when
`ADMIN_USER`, `ADMIN_PASSWORD_HASH` and `ADMIN_TOTP_SECRET` are all set and valid; with any of them
missing or broken it is the 404, and the server logs one line saying why, for example
`[admin] private page off (its path is the normal 404): ADMIN_TOTP_SECRET is not set. ...`. There is
no password-only path.

### Turn it on (on the VM)

On the Google Cloud VM, `setup.sh` does all of this for you (it asks for the password, shows a QR
code for Google Authenticator and checks one code before it saves anything), and
`sudo bash setup.sh --reset-admin` replaces it. See [`deploy/README-DEPLOY.md`](../../deploy/README-DEPLOY.md).
By hand:

The settings live in a private file, `admin.env` (KEY=VALUE lines). Keep it outside the repo and
point `ADMIN_ENV_FILE` at it (the default is `site/admin.env`, which is gitignored). Real environment
variables override the file. The server refuses to turn the page on if the file can be read by group
or others. Run these as the service user (`savant` in the checklist below):

```
sudo -u savant bash                                  # a shell as the service user
cd /srv/savant/app
umask 077
export ADMIN_ENV_FILE=/srv/savant/admin.env
echo 'ADMIN_USER=pick-a-name' > "$ADMIN_ENV_FILE"
node server.js admin-hash >> "$ADMIN_ENV_FILE"       # type the passphrase twice; nothing is shown
node server.js admin-totp | tee /dev/tty | grep '^ADMIN_TOTP_SECRET=' >> "$ADMIN_ENV_FILE"
chmod 600 "$ADMIN_ENV_FILE"
exit
sudo systemctl restart savant-site
journalctl -u savant-site -n 5                       # "[admin] private page on (authenticator code required, ...)"
```

`node server.js admin-verify-code` reads one code on stdin and exits 0 if it matches
`ADMIN_TOTP_SECRET` now (one 30-second step either side), 1 if not, 2 if there is no valid secret;
it prints nothing on stdout. `setup.sh` uses it to check the authenticator app before it saves.

- `admin-hash` prints only the `ADMIN_PASSWORD_HASH=scrypt$...` line (scrypt, N=2^17, r=8, p=1,
  a 32-byte salt and a 64-byte key), so `>>` puts nothing else in the file. It reads the password
  from the terminal without echo, or from stdin when piped, or from `ADMIN_PASSWORD_INPUT`. Avoid the
  last one on a server: it ends up in shell history. It refuses an empty password, and warns (but
  still prints the hash) if the password is under 12 characters or follows a common pattern.
- **Use a long passphrase**: five or more random words. It is the main thing between the internet and
  every submission.
- **The authenticator code (TOTP) is required.** `admin-totp` makes a random 20-byte secret and
  prints it with an `otpauth://` link (issuer Savant, labelled with your `ADMIN_USER`). Add it to an
  authenticator app (paste the link, or "enter a setup key" and type the secret), then delete the
  scrollback. Anyone with the secret can make codes. Without it the page stays off.
- Optional lines: `ADMIN_ALLOW_IPS=203.0.113.7,198.51.100.0/24` (exact IPs or CIDR, IPv4 or IPv6;
  every other address gets the 404), `ADMIN_SESSION_HOURS=2`, `ADMIN_IDLE_MINUTES=20`.
- To change the password or the code, make a new line, replace the old one and restart. A restart
  also signs every session out and clears every lock (they are kept in memory only).

### Trying it on your own computer

In development (NODE_ENV not `production`) the page also works over plain `http://localhost`. The
session cookie is then called `sv_admin_dev` and has no `Secure` flag, because browsers would drop a
Secure cookie on http. Over HTTPS, and always in production, it is `__Host-sv_admin` with `Secure`.

```
cd site
umask 077
echo 'ADMIN_USER=dev' > admin.env
node server.js admin-hash >> admin.env
node server.js admin-totp | tee /dev/tty | grep '^ADMIN_TOTP_SECRET=' >> admin.env   # add it to your app
node server.js                       # then open http://127.0.0.1:8787/donteventry
```

An older `admin.env` without `ADMIN_TOTP_SECRET` now turns the page off (the 404) until the line is
added.

### How it is protected

- **Hidden.** Not configured (any of the three settings missing or invalid), an IP outside
  `ADMIN_ALLOW_IPS`, or plain http in production: the normal 404, the same bytes and headers as any
  unknown path.
- **Sign-in.** The password is checked with scrypt and a constant-time compare; the user name is also
  compared in constant time. A 6-digit RFC 6238 code is always required (SHA-1, 30 seconds, one step
  either side), and each code works only once. A wrong user, password or code, or no code, gets the
  same message, and every sign-in answer takes at least half a second.
- **Brute force** (in memory). Five failures from one address in 15 minutes lock that address for 15
  minutes, then 30, 60 and so on up to 24 hours (IPv6 counts by its /64). Twenty failures in 15
  minutes from all addresses together lock sign-in for everyone for 15 minutes, logged as a warning.
  A locked attempt only ever sees "Too many attempts. Please try again later." (429), with no counts
  or times. The trade-off: anyone can lock you out for 15 minutes by failing 20 times. Set
  `ADMIN_ALLOW_IPS` to make that impossible, or restart the service to clear it.
- **Session.** 32 random bytes in an HttpOnly, Secure, SameSite=Strict, `__Host-` cookie with no
  Domain. The server keeps only a hash of it, in memory. A new one is made at each sign-in. It ends
  after 2 hours however active you are, after 20 idle minutes, if the browser changes, and at logout.
  When the idle time passes, the open page also hides the data and reloads to the sign-in form.
- **CSRF.** Sign-in, logout and delete each need a token. For sign-in it is an HMAC of a pre-session
  cookie; afterwards it is an HMAC of the session. They also need a same-origin `Origin`, or
  `Sec-Fetch-Site: same-origin` (the admin pages send no Referer, so browsers send `Origin: null`
  and rely on this). Anything else is refused. This needs a current browser; old ones are refused.
- **Headers.** `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, a `robots` meta tag, a
  strict CSP (no inline scripts or styles, `frame-ancestors 'none'`, `form-action 'self'`,
  `base-uri 'none'`), `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and a Permissions-Policy
  that turns off camera, microphone, location and the like.
- **Output.** Every submitted value is HTML-escaped. The page is plain server-rendered HTML; its one
  small script is a file served only to a signed-in session. CSV cells that start with `=`, `+`,
  `-`, `@`, a tab or a carriage return get a leading `'`, so a spreadsheet will not run them.
- **Files.** Admin routes read only the three known form files. Delete takes a record id and rewrites
  the file through the same one-at-a-time queue as the forms, so it never races a new sign-up.
  Data files are created with mode 0600 and `data/` with 0700, and at every start the server puts
  `data/` back to owner-only (folders 0700, files 0600) if anything changed it.
- **Owner-only data.** Submissions, visit statistics and the audit log are reachable only through the
  signed-in admin routes. Under `/api` there is nothing but `GET /api/health`, the form posts
  (`updates`, `beta`, `investors`, `forget`) and the three visit beacons; every other `/api` path and
  method is a 404, and no route serves a file from `data/` (`node test.js` checks every data file
  under every path prefix, with and without a session).
- **Audit log.** `data/admin-audit.jsonl` (0600) records the time, the event (`login_ok`, `login_fail`,
  `lockout`, `logout`, `delete`, `export`), the IP and the browser. It never records a password, code,
  token or the name typed in. Note: this does keep the IPs of admin sign-in attempts on disk. Visitors'
  form posts are not affected, but mention it in `privacy.html` if you want to be complete.
- **Small requests.** Admin posts must be ordinary form posts, 4 KB at most.

### Ubuntu 24.04 on Google Cloud: hardening checklist

`deploy/setup.sh` does every step below (with Node.js 22 from NodeSource, the app in
`/srv/savant/app` owned by root, port 8787, and a systemd timer instead of cron for backups and
the geo update). The list stays here as the reference for what it does, or for doing it by hand.

1. **A non-root service user, and the repo outside any web root.**
   ```
   sudo apt update && sudo apt install -y nodejs npm git     # 24.04 ships Node 18; setup.sh installs 22
   sudo adduser --system --group --home /srv/savant --shell /usr/sbin/nologin savant
   sudo -u savant git clone <your-repo-url> /srv/savant/app
   cd /srv/savant/app/site && sudo -u savant npm ci --omit=dev
   sudo install -d -m 700 -o savant -g savant /srv/savant/data
   ```
   Nothing under `/srv/savant` is ever a web root: Caddy only proxies to Node, and Node serves an
   explicit list of public files.
2. **A systemd unit**, `/etc/systemd/system/savant-site.service`:
   ```
   [Unit]
   Description=Savant site
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=savant
   Group=savant
   WorkingDirectory=/srv/savant/app/site
   ExecStart=/usr/bin/node server.js
   Environment=NODE_ENV=production
   Environment=HOST=127.0.0.1
   Environment=PORT=8080
   Environment=TRUST_PROXY=1
   Environment=SITE_ORIGINS=https://your-domain,https://www.your-domain
   Environment=DATA_DIR=/srv/savant/data
   Environment=ADMIN_ENV_FILE=/srv/savant/admin.env
   UMask=0077
   Restart=on-failure
   NoNewPrivileges=true
   ProtectSystem=strict
   ReadWritePaths=/srv/savant/data
   ProtectHome=true
   PrivateTmp=true
   PrivateDevices=true
   ProtectKernelTunables=true
   ProtectKernelModules=true
   ProtectControlGroups=true
   RestrictNamespaces=true
   RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
   LockPersonality=true
   CapabilityBoundingSet=
   MemoryMax=512M

   [Install]
   WantedBy=multi-user.target
   ```
   Then run `sudo systemctl daemon-reload && sudo systemctl enable --now savant-site`.
   `HOST=127.0.0.1` matters: with `TRUST_PROXY=1`, anyone who could reach port 8080 directly could
   fake their IP and get round the per-address lock and the allow-list. The server warns if it sees
   that combination.
3. **HTTPS with Caddy** (it gets and renews Let's Encrypt certificates itself).
   Run `sudo apt install -y caddy`, then put this in `/etc/caddy/Caddyfile`:
   ```
   your-domain, www.your-domain {
       encode zstd gzip
       reverse_proxy 127.0.0.1:8080
   }
   ```
   Then `sudo systemctl reload caddy`. With nginx instead, use `certbot --nginx`, and in the
   `location /` block set `proxy_pass http://127.0.0.1:8080;`,
   `proxy_set_header Host $host;`, `proxy_set_header X-Forwarded-For $remote_addr;` and
   `proxy_set_header X-Forwarded-Proto $scheme;`. Either way keep `TRUST_PROXY=1` (exactly one proxy)
   and `NODE_ENV=production`, so the admin page answers only over HTTPS.
4. **Firewall on the VM (ufw):** only SSH, HTTP and HTTPS.
   ```
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
   sudo ufw enable
   ```
5. **SSH keys only.** Put this in `/etc/ssh/sshd_config.d/99-hardening.conf`:
   ```
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   PermitRootLogin no
   PubkeyAuthentication yes
   ```
   Then run `sudo sshd -t && sudo systemctl reload ssh`, keeping your current session open until a
   new login works. On GCP, OS Login (`enable-oslogin=TRUE` in the instance metadata, ideally with
   2-step verification) manages the keys for you.
6. **fail2ban** for SSH, and optionally for admin lockouts. Run `sudo apt install -y fail2ban`, then
   create `/etc/fail2ban/jail.local`:
   ```
   [sshd]
   enabled = true
   backend = systemd
   maxretry = 5
   bantime = 1h

   [savant-admin]
   enabled = true
   backend = systemd
   journalmatch = _SYSTEMD_UNIT=savant-site.service
   filter = savant-admin
   maxretry = 1
   bantime = 24h
   ```
   Then create `/etc/fail2ban/filter.d/savant-admin.conf`, with `[Definition]` on one line and
   `failregex = \[admin\] sign-in locked for <HOST> for` on the next. Finally run
   `sudo systemctl restart fail2ban`. Behind Caddy on the same machine, a ban stops new connections
   from that address at the firewall.
7. **Automatic security updates:** `sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`.
   Run `npm audit --omit=dev` in `site/` now and then.
8. **GCP firewall rules** (VPC network, in front of ufw). Allow 80 and 443 from anywhere. Allow 22
   only from your own IP, or from Google's IAP range, and reach the VM with
   `gcloud compute ssh --tunnel-through-iap`. Delete the default open SSH and RDP rules:
   ```
   gcloud compute firewall-rules create savant-web --network=default --allow=tcp:80,tcp:443 --target-tags=savant
   gcloud compute firewall-rules create savant-ssh --network=default --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=savant
   gcloud compute firewall-rules delete default-allow-ssh default-allow-rdp
   gcloud compute instances add-tags <vm-name> --tags=savant --zone=<zone>
   ```
   Also: use a Shielded VM, and give the VM a service account with no roles (the site needs none).
9. **Optional: `ADMIN_ALLOW_IPS`.** If you have a fixed home or office IP, or a VPN, list it. Every
   other address then gets the 404, and no one else can try a password or trip the global lock.
10. **Backups of `data/`.** It holds personal data: keep it `chmod 700` (files 0600), and back it up
    to a place that is just as private. For example, put this in `/etc/cron.daily/savant-backup`
    and make that file executable:
    ```
    #!/bin/sh
    umask 077
    install -d -m 700 /var/backups/savant
    tar -C /srv/savant -czf /var/backups/savant/data-$(date +%F).tgz data
    find /var/backups/savant -name 'data-*.tgz' -mtime +30 -delete
    ```
    Copy them off the VM encrypted (for example `age` or `gpg`), to a private bucket only you can
    read. A GCP disk snapshot schedule is a good second layer. Test a restore once.
