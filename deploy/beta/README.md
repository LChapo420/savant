# Savant beta at beta.savantedu.com

Copy-paste steps to put this app online at **https://beta.savantedu.com** on the Google Cloud
Ubuntu 24.04 VM that already serves the landing site. About 30 minutes, plus however long
Resend takes to verify your mail domain (often minutes; see step 0).

What you end up with:

- the app at `https://beta.savantedu.com`, HTTPS by Caddy (automatic certificate), run by
  systemd as its own user, restarted on a crash;
- a **fresh data directory** (`/srv/savant-beta/shared/data`): no learner data from your PC;
- invite-only sign-up (the staged beta gate), `/healthz`, SQLite sessions that survive
  restarts, mail through Resend;
- a nightly backup with a restore test, plus a disk snapshot off the VM;
- one command to update (`sudo savant-beta-release`) that never touches the data and switches
  back by itself if the new version does not come up;
- the reviewer demo account and a smoke test.

**What this does not touch:** the landing site (`savant-site.service`, `/srv/savant/app`,
`/srv/savant/data`) and its Caddy block. The beta lives in `/srv/savant-beta`, runs as the user
`savantbeta`, on port 6767, and only adds one block to the Caddyfile.

**Secrets:** this folder lists environment variables **by name only**. You type the values into
one file on the VM (step 6). Never paste a key into git, a chat or a screenshot.

---

## Files in this folder

| File | Goes to | What it is |
|---|---|---|
| `README.md` | | these steps |
| `savant-beta.env.example` | `/srv/savant-beta/savant-beta.env` | every setting, names only |
| `savant-beta.service` | `/etc/systemd/system/` | the app (Node), as `savantbeta` |
| `savant-beta-backup.service`, `.timer` | `/etc/systemd/system/` | nightly backup + restore test, 03:30 UTC |
| `Caddyfile.beta` | appended to `/etc/caddy/Caddyfile` | HTTPS and the reverse proxy |
| `release.sh` | `/usr/local/sbin/savant-beta-release` | put a git version live, keep the data, roll back by itself |
| `run.sh` | `/usr/local/sbin/savant-beta-run` | run one tool in the live app with its settings |
| `smoke-test.js` | (run from the repo) | checks the live site end to end |

On the VM:

```
/srv/savant-beta/
  repo/                 git clone (read-only deploy key)
  releases/<UTC stamp>/ one folder per release, code only; the newest 3 are kept
  app -> releases/...   what systemd runs
  shared/data/          db.json, sessions, invites, ledgers, outbox   <- the learners' data
  shared/logs/          the app's error log
  shared/base-lesson-scripts/   lesson scripts the app writes while it runs
  backups/              nightly backups (28 days)
  savant-beta.env       the settings (root:savantbeta, 640)
  demo-account.local.txt  the demo login (step 11; savantbeta, 600)
```

Every release links its `data/`, `logs/` and `public/base-lesson-scripts/` into `shared/`, so a
new release never replaces anyone's data.

---

## Step 0. Before you start (on your PC, 5 minutes)

Have these ready:

- [ ] The VM's name and zone (Google Cloud console, Compute Engine, VM instances), and a way in:
      `gcloud compute ssh <vm-name> --zone <zone> --tunnel-through-iap` (drop `--tunnel-through-iap`
      if you do not use IAP).
- [ ] Access to the DNS settings of `savantedu.com` (where the landing site's records are).
- [ ] An **NVIDIA API key** for the learners' models.
- [ ] The **email address you will sign in with** on the beta (it becomes the admin).
- [ ] **Resend** (mail for parental consent, invites and alerts). In resend.com: Domains, Add
      domain `send.savantedu.com`, add the DNS records it shows at your DNS host, press Verify,
      then API Keys, Create, permission "Sending access", domain `send.savantedu.com`. Keep the
      key for step 6. If Resend is not verified yet when you get there, see
      [If mail is not ready](#if-mail-is-not-ready).
- [ ] Which git version to deploy. After this pull request is merged: `origin/main`. Before
      that: `origin/claude/gallant-carson-kvb382`.

---

## Step 1. DNS record (2 minutes, on your PC)

In the DNS settings for `savantedu.com`, add:

| Type | Name | Value | TTL | Proxy (Cloudflare only) |
|---|---|---|---|---|
| `A` | `beta` | the VM's external IPv4 | Auto / 300 | **DNS only** (grey cloud) |

The VM's IP is the one `savantedu.com` already points at if the landing site is on this VM. To
read it from Google Cloud:

```
gcloud compute instances describe <vm-name> --zone <zone> --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

Check it (it can take a few minutes): `nslookup beta.savantedu.com` must answer with that IP.

- Keep it **DNS only** so Caddy can get its certificate. (Proxying through Cloudflare later is
  possible with SSL mode "Full (strict)".)
- If the domain has a `CAA` record, it must allow `letsencrypt.org`.
- If the IP is "Ephemeral" in the console, it changes when the VM stops: reserve it (VPC
  network, IP addresses, Reserve).

Do this first: by step 8 the record must resolve.

---

## Step 2. Check the VM (3 minutes)

SSH in, then:

```
node -v                                              # v22.13 or later (v24 is fine)
node -e "require('node:sqlite'); console.log('sqlite ok')"
free -m                                              # see "Memory" below
df -h /                                              # 3 GB free is plenty
sudo ss -ltnp | grep ':6767 ' || echo "port 6767 free"
sudo ufw status                                      # only 22, 80 and 443 allowed
```

- **Node too old, or `node:sqlite` fails:** `sudo apt-get update && sudo apt-get install -y nodejs`
  (the landing site's setup already added the NodeSource repository), then check again.
- **Memory:** the app uses about 315 MB, next to the landing site and Caddy. If `free -m` shows a
  total under 1,900 MB and `swapon --show` shows nothing, add 2 GB of swap:
  ```
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- **Port 6767** must stay closed to the internet: `ufw` allows only 22, 80 and 443, and the Google
  Cloud firewall rules for the landing site open only 80 and 443. Do not open it.

---

## Step 3. The app's user and folders (1 minute)

```
sudo adduser --system --group --home /srv/savant-beta --shell /usr/sbin/nologin savantbeta
sudo chmod 750 /srv/savant-beta
sudo -u savantbeta mkdir -p /srv/savant-beta/releases /srv/savant-beta/shared/data /srv/savant-beta/shared/logs \
  /srv/savant-beta/shared/base-lesson-scripts /srv/savant-beta/backups /srv/savant-beta/.ssh
sudo chmod 700 /srv/savant-beta/shared/data /srv/savant-beta/backups /srv/savant-beta/.ssh
```

`shared/data` starts empty: that is the fresh data directory. The app creates `db.json` there the
first time it starts.

---

## Step 4. Read access to the repo: a deploy key (3 minutes)

```
sudo -u savantbeta ssh-keygen -t ed25519 -N '' -C 'savant-beta VM' -f /srv/savant-beta/.ssh/id_ed25519
sudo cat /srv/savant-beta/.ssh/id_ed25519.pub
```

On GitHub: the `LChapo420/savant` repository, Settings, Deploy keys, Add deploy key. Title
"beta VM", paste the line, **leave "Allow write access" unticked**, Add key. Then:

```
sudo -u savantbeta -H ssh -o StrictHostKeyChecking=accept-new -T git@github.com
sudo -u savantbeta -H git clone --no-checkout git@github.com:LChapo420/savant.git /srv/savant-beta/repo
```

The first line answers "You've successfully authenticated, but GitHub does not provide shell
access" (that is success). It also records GitHub's host key; compare the fingerprint it prints
with the ED25519 one on GitHub's "GitHub's SSH key fingerprints" page.

---

## Step 5. Install the kit's files (1 minute)

Set the version once for this SSH session (step 0), then copy the files out of git:

```
REF=origin/main          # before the PR is merged: REF=origin/claude/gallant-carson-kvb382
sudo -u savantbeta -H git -C /srv/savant-beta/repo fetch -q origin
kit() { sudo -u savantbeta -H git -C /srv/savant-beta/repo show "$REF:deploy/beta/$1"; }

kit release.sh                 | sudo tee /usr/local/sbin/savant-beta-release >/dev/null
kit run.sh                     | sudo tee /usr/local/sbin/savant-beta-run >/dev/null
sudo chmod 755 /usr/local/sbin/savant-beta-release /usr/local/sbin/savant-beta-run
kit savant-beta.service        | sudo tee /etc/systemd/system/savant-beta.service >/dev/null
kit savant-beta-backup.service | sudo tee /etc/systemd/system/savant-beta-backup.service >/dev/null
kit savant-beta-backup.timer   | sudo tee /etc/systemd/system/savant-beta-backup.timer >/dev/null
[ -e /srv/savant-beta/savant-beta.env ] || kit savant-beta.env.example | sudo tee /srv/savant-beta/savant-beta.env >/dev/null
sudo chown root:savantbeta /srv/savant-beta/savant-beta.env && sudo chmod 640 /srv/savant-beta/savant-beta.env
```

The two scripts live in `/usr/local/sbin`, owned by root, so the app's own user cannot change
what `sudo` runs. The `[ -e ... ] ||` keeps an env file you already filled from being replaced.

---

## Step 6. The settings (5 minutes)

Generate the session secret straight into the file (it never appears on screen):

```
SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
sudo sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" /srv/savant-beta/savant-beta.env; unset SECRET
```

Then fill the rest:

```
sudo nano /srv/savant-beta/savant-beta.env
```

| Name | Fill with | Required |
|---|---|---|
| `SESSION_SECRET` | done above | yes |
| `ADMIN_EMAILS` | your sign-in address (opens `/admin`) | yes |
| `OWNER_EMAIL` | the same address | yes |
| `RESEND_API_KEY` | the Resend key from step 0 | yes |
| `NVIDIA_API_KEY` | your NVIDIA key | yes |
| `MAIL_REPLY_TO` | where replies to app emails go, e.g. `contact@savantedu.com` | optional |
| `ERROR_ALERT_EMAIL` | where the first error of each new kind is emailed | optional |
| `BETA_ALLOW_EMAILS` | extra addresses allowed to sign in without an invite | optional |
| `FOUNDER_EMAILS` | more of your own addresses (metrics count them as founder) | optional |
| `METRICS_EXCLUDE_EMAILS` | addresses you test with (metrics count them as test) | optional |

Everything else in the file is already set and is not secret: `NODE_ENV`, `PORT`, `TRUST_PROXY`,
`APP_ORIGIN`, `ALLOWED_ORIGINS`, `DB_FILE`, `SESSION_DB_FILE`, `BETA_INVITES_FILE`,
`MAIL_OUTBOX_DIR`, `LOG_DIR`, `BACKUP_DIR`, `BACKUP_MAX_AGE_DAYS`, `MAIL_PROVIDER`, `MAIL_FROM`,
`BETA_GATE`, `BETA_GATE_LOGIN`, `CONSENT_PENDING_ACCESS`, `OLLAMA_ENABLED`. Keep the quotes around
`MAIL_FROM`. The bottom of the file lists the variables that must **never** be set on this server
(build-pipeline keys and test switches).

Check that the five required values are filled (prints `5`):

```
sudo grep -cE '^(SESSION_SECRET|ADMIN_EMAILS|OWNER_EMAIL|RESEND_API_KEY|NVIDIA_API_KEY)=.+' /srv/savant-beta/savant-beta.env
```

---

## Step 7. The services (1 minute)

```
sudo systemctl daemon-reload
sudo systemctl enable savant-beta
sudo systemctl enable --now savant-beta-backup.timer
```

The app itself starts in step 9, once there is a release to run.

---

## Step 8. HTTPS: the Caddy block (2 minutes)

```
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-beta
{ echo; kit Caddyfile.beta; } | sudo tee -a /etc/caddy/Caddyfile >/dev/null
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

(`kit` is the helper from step 5; in a new SSH session, set `REF` and define `kit` again.)
`validate` must end with "Valid configuration" (if it does not, put the old file back with
`sudo cp /etc/caddy/Caddyfile.before-beta /etc/caddy/Caddyfile` and do not reload). Caddy now gets the certificate for
`beta.savantedu.com` by itself; `sudo journalctl -u caddy -n 30 --no-pager | grep -i beta` shows it
("certificate obtained successfully"). Until step 9 the address answers 502: nothing runs yet.

---

## Step 9. The first release (3 minutes)

```
sudo savant-beta-release "$REF"
```

It ends with `== release <stamp> (<commit>) is live`. What it did: unpacked that commit into
`releases/`, linked `shared/`, ran `npm ci`, applied the staged beta wiring
(`curriculum-build/staged/beta-launch/apply.js`) to this copy only, and started the service.
Check:

```
curl -s http://127.0.0.1:6767/healthz                  # {"ok":true}
sudo journalctl -u savant-beta -n 20 --no-pager        # "mail: resend; sessions: sqlite; beta gate: invite"
curl -sI https://beta.savantedu.com/healthz | head -1  # HTTP/2 200
```

If it says "did not answer /healthz; switching back", read the journal line it names. The usual
causes are an unfilled required value in step 6 (the app says "Refusing to start" and why) or
Node older than 22.13.

---

## Step 10. Your own account (2 minutes)

The beta is invite-only, including for you:

```
sudo savant-beta-run node scripts/beta-invites.js approve you@yourdomain.com
```

It prints a code and a link once (`https://beta.savantedu.com/join?invite=...`). Open the link,
sign up **with the same address as `ADMIN_EMAILS`**, then open
`https://beta.savantedu.com/admin#metrics`: the real-user metrics, with your account shown apart as
"founder".

---

## Step 11. The reviewer demo account (3 minutes)

The seed writes to the data file directly, so the app must be stopped while it runs (it refuses
otherwise):

```
sudo systemctl stop savant-beta
sudo savant-beta-run node scripts/seed-demo-account.js --data /srv/savant-beta/shared/data/db.json \
  --login-file /srv/savant-beta/demo-account.local.txt
sudo systemctl start savant-beta
sudo cat /srv/savant-beta/demo-account.local.txt
```

- It makes "Riley (demo account)": placement done in Algebra 1 and ACT Prep, two sittings in each,
  level feedback, and a short tutor conversation. With `NVIDIA_API_KEY` set the tutor replies are
  live (a minute or two); `--offline` makes it instant, but the tutor history then shows the
  tutor's "not connected" reply.
- The account is flagged demo: the metrics never count it, and the invite gate lets it sign in.
- A backup of the data file is made first (`db.json.before-demo-<stamp>.bak`); if the run fails
  or you press Ctrl-C, the file is put back as it was.
- The login is only in that file (mode 600). Running the seed again changes nothing; add
  `--new-password` for a new password.

---

## Step 12. Smoke test (1 minute)

On the VM, with the demo login:

```
sudo savant-beta-run node deploy/beta/smoke-test.js --url https://beta.savantedu.com \
  --login-file /srv/savant-beta/demo-account.local.txt
```

From your PC, in your copy of the repo: `node deploy/beta/smoke-test.js --url https://beta.savantedu.com`.

It must end `0 failed`. It checks `/healthz`, the certificate, the http to https redirect, HSTS,
the pages, that `.env`, `data/`, `logs/` and the server code are not served, that the admin and ops
APIs are closed to visitors, that sign-up without an invite is refused, and (with the login file)
that the demo account signs in and has its subjects and tutor history. It never creates an
account. `--url http://127.0.0.1:6767` on the VM checks the app without Caddy.

---

## Step 13. Backups (3 minutes)

**Nightly, on the VM** (enabled in step 7): at 03:30 UTC `savant-beta-backup` takes
`backups/db-<stamp>.json.gz` (with the invite file and the AI spend ledgers), then unpacks it,
checks its checksum and every collection, and loads it through the app's own loader. Backups older
than 28 days are deleted (the privacy policy promises deletion within 30 days), the newest 3 always
stay. Take the first one now and check it:

```
sudo systemctl start savant-beta-backup
systemctl status savant-beta-backup --no-pager       # both steps "status=0/SUCCESS"
sudo ls -l /srv/savant-beta/backups
systemctl list-timers savant-beta-backup.timer --no-pager
```

**Off the VM** (a backup on the same disk does not survive the disk): a daily snapshot schedule of
the VM's disk, kept 14 days. From your PC (or Cloud Shell), once:

```
gcloud compute resource-policies create snapshot-schedule savant-daily --region <region> \
  --max-retention-days 14 --start-time 04:00 --daily-schedule
gcloud compute disks add-resource-policies <disk-name> --resource-policies savant-daily --zone <zone>
```

`<region>` is the zone without its last letter (zone `us-central1-a` is region `us-central1`);
`<disk-name>` is usually the VM's name (Compute Engine, Disks). Snapshots cost a few cents a month
at this size.

---

## Updating without losing data

```
sudo savant-beta-release              # the newest origin/main
sudo savant-beta-release origin/<branch-or-tag>
```

Every release: a new folder, `npm ci`, the beta wiring, a check that the content bank loads, **a
backup of the data**, the switch, a restart, and `/healthz`. If `/healthz` does not answer within 90
seconds it switches back to the previous release by itself and exits 1. Testers stay signed in
across restarts (sessions are in `shared/data/sessions.sqlite`).

The data rules:

- Never delete or replace anything in `/srv/savant-beta/shared/`. It is the only place learner
  data lives; releases only link to it.
- Never run a script that writes the data file (the demo seed, a restore) while the app runs.
- Content made on your PC reaches the beta only through git: `npm run base:export` on the PC,
  commit `content/base-levels`, release. The VM's `db.json` is the beta's, not your PC's.

**Roll back by hand** (the previous release is still there):

```
ls -1 /srv/savant-beta/releases
sudo -u savantbeta ln -sfn /srv/savant-beta/releases/<previous> /srv/savant-beta/app.next
sudo -u savantbeta mv -Tf /srv/savant-beta/app.next /srv/savant-beta/app
sudo systemctl restart savant-beta
```

**Restore the data from a backup** (only if the data itself is wrong; everything since that backup
is lost):

```
sudo savant-beta-run node scripts/backup-db.js --list
sudo systemctl stop savant-beta
B=/srv/savant-beta/backups/db-<stamp>.json.gz
sudo savant-beta-run node scripts/backup-db.js --restore-test --file "$B"
sudo savant-beta-run node scripts/backup-db.js --restore "$B" --to /srv/savant-beta/shared/data/db.json.restored
sudo -u savantbeta mv /srv/savant-beta/shared/data/db.json /srv/savant-beta/shared/data/db.json.bad-$(date -u +%Y%m%dT%H%M%SZ)
sudo -u savantbeta mv /srv/savant-beta/shared/data/db.json.restored /srv/savant-beta/shared/data/db.json
sudo systemctl start savant-beta
```

---

## Inviting testers

From the landing site's applications (its data folder is `DATA_DIR` in
`systemctl cat savant-site`; `/srv/savant/data` with the site's setup script). The site's folder is
private to its own user, so copy the file for the beta's tools first:

```
sudo install -o savantbeta -m 600 /srv/savant/data/beta.jsonl /tmp/beta.jsonl
sudo savant-beta-run node scripts/beta-invites.js applicants --from /tmp/beta.jsonl
sudo savant-beta-run node scripts/beta-invites.js approve-applicants <id,id,...> --from /tmp/beta.jsonl --send
sudo rm /tmp/beta.jsonl
```

`--send` emails each person their code and link through Resend. Without it, the code is printed
once for you to pass on. One person by address: `approve <email> [--send]`. Approve adults (and teens
at or over their country's consent age) only, until the tester consent gate exists
(`curriculum-build/BETA-LAUNCH-KIT.md` 4.4).

**Opening sign-up to everyone** instead: set `BETA_GATE=` and `BETA_GATE_LOGIN=` (empty) in the env
file and `sudo systemctl restart savant-beta`. Do that only **after** you have signed up with your
`ADMIN_EMAILS` address (step 10): admin rights follow the address, which is never verified, so on
an open server whoever registers it first is admin.

---

## If mail is not ready

The app refuses to start in production without a mail provider, because parental consent emails
must go out. If Resend has not verified `send.savantedu.com` yet, you can start without it **for
the first adult testers only**: in the env file put `#` before `MAIL_PROVIDER=resend` and add
`MAIL_ALLOW_OUTBOX=1`, then `sudo systemctl restart savant-beta`. Then:

- no email leaves the server; consent requests, invite emails and alerts are written to
  `shared/data/outbox/` instead;
- a child's sign-up stays waiting for a consent email that never arrives (its access stays
  limited), so approve adults only;
- pass invite codes by hand (`approve <email>` without `--send`).

As soon as Resend shows Verified: remove `MAIL_ALLOW_OUTBOX=1`, remove the `#`, restart.

---

## Troubleshooting

| What you see | Look at | Usual cause |
|---|---|---|
| `release.sh` stops before "switching" | its last lines | `git fetch` (deploy key), `npm ci` (network), "anchors not found" (the staged wiring no longer fits `server.js`: run `node curriculum-build/staged/beta-launch/apply.js --check` on your PC) |
| "did not answer /healthz; switching back" | `sudo journalctl -u savant-beta -n 80 --no-pager` | "Refusing to start": a required setting (step 6); `node:sqlite` missing: Node too old |
| 502 at `https://beta.savantedu.com` | `systemctl status savant-beta` | the app is stopped or restarting |
| certificate errors | `sudo journalctl -u caddy -n 50 --no-pager` | the DNS record does not point here yet, it is proxied (orange cloud), or a `CAA` record blocks Let's Encrypt |
| `/healthz` is 503 | `sudo savant-beta-run node -e "console.log(require('fs').statfsSync('.'))"`, the journal | under 200 MB of free disk, or the event loop stuck |
| backup failed | `systemctl status savant-beta-backup`, `sudo cat /srv/savant-beta/backups/restore-test-last.json` | disk full; a damaged store (then restore, above) |
| out of memory | `journalctl -k | grep -i oom`, `free -m` | add swap (step 2) or a bigger machine type |

Admin views on the running beta: `/admin#metrics` (real users), `/api/ops/status` and
`/api/ops/errors` (health numbers and grouped errors, admins only).

---

## What was tested, and what was not

Tested in a sandbox by `node scripts/beta-deploy-kit-test.js` (Linux): the env example holds names
only; the units and scripts agree on paths and parse; `release.sh` from a git snapshot into a fresh
data directory with the staged wiring applied to the release only, in production mode; `run.sh`; an
invite for the admin and the gate refusing a stranger; the demo seed refusing while the app runs and
working when stopped; `smoke-test.js` passing with the demo login; the nightly backup and its
restore test; a second release keeping every account; a broken release switched back by itself;
old releases pruned. systemd was replaced by a stand-in that starts `node server.js` with only the
env file's settings.

**Not tested here** (no VM, DNS or accounts in the test environment): the real systemd units and
their sandboxing (`ProtectSystem=strict`), Caddy and its certificate, the DNS record, the GitHub
deploy key, Resend and NVIDIA with real keys, the Google Cloud snapshot commands, and memory on the
VM's machine type. Steps 9, 12 and 13 check each of these on the VM.
