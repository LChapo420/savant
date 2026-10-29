# Server to-do, 29 Oct 2026

Two jobs on the VM that serves savantedu.com. Both need your SSH session and (for B) your
domain registrar; nothing here can be done from the PC without them.

---

## A. robots.txt and sitemap.xml on savantedu.com (5 minutes)

Today both return 404. The repo's `site/` now serves them (`site/robots.txt`, `site/sitemap.xml`,
two lines in `site/server.js`, tested), but the copy on the VM has its own edits (it serves `og.png`
and a canonical tag the repo does not have), so do not pull over it. Serve the two files from Caddy
instead; this touches neither the site's code nor its data.

1. Make the files:

```
sudo mkdir -p /srv/savant/seo
sudo tee /srv/savant/seo/robots.txt >/dev/null <<'EOF'
User-agent: *
Disallow: /api/
Disallow: /thanks

Sitemap: https://savantedu.com/sitemap.xml
EOF
sudo tee /srv/savant/seo/sitemap.xml >/dev/null <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://savantedu.com/</loc><lastmod>2026-10-29</lastmod></url>
  <url><loc>https://savantedu.com/evidence.html</loc><lastmod>2026-10-29</lastmod></url>
  <url><loc>https://savantedu.com/privacy.html</loc><lastmod>2026-10-29</lastmod></url>
  <url><loc>https://beta.savantedu.com/</loc><lastmod>2026-10-29</lastmod></url>
</urlset>
EOF
sudo chmod 755 /srv/savant/seo && sudo chmod 644 /srv/savant/seo/*
```

2. `sudo nano /etc/caddy/Caddyfile`. Inside the `savantedu.com { ... }` block, on the first lines
   after the `{`, add:

```
	handle /robots.txt {
		root * /srv/savant/seo
		file_server
	}
	handle /sitemap.xml {
		root * /srv/savant/seo
		file_server
	}
```

3. Check and reload (a typo is caught by `validate` and nothing changes):

```
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
curl -s https://savantedu.com/robots.txt
curl -s -o /dev/null -w "%{http_code}\n" https://savantedu.com/sitemap.xml
```

The second line must print `200`. Then in Google Search Console (Domain property `savantedu.com`,
verified by the TXT record it gives you): Sitemaps, submit `https://savantedu.com/sitemap.xml`;
URL Inspection on `https://savantedu.com/`, Request indexing.

---

## B. beta.savantedu.com: the app, only your two logins (about 30 minutes)

Follow `deploy/beta/README.md` steps 0 to 13, with these changes. The app already supports this
by settings alone: with the invite gate on, nobody can sign up without an invite code, and sign-in
is refused for every account except invited ones, admins and `BETA_ALLOW_EMAILS`.

- **Step 1 (DNS):** at your registrar, an `A` record `beta` pointing at the same IP as `savantedu.com`.
- **Step 6 (settings)**, in `/srv/savant-beta/savant-beta.env`:

```
ADMIN_EMAILS=the.landon.d@gmail.com
OWNER_EMAIL=the.landon.d@gmail.com
BETA_GATE=invite
BETA_GATE_LOGIN=1
BETA_ALLOW_EMAILS=the.landon.d@gmail.com,landon@savantedu.com
```

  (`BETA_GATE` and `BETA_GATE_LOGIN` are already set that way in the template; leave them.)
- **Step 10 (accounts):** make one invite per address, open each link, sign up with that exact address:

```
sudo savant-beta-run node scripts/beta-invites.js approve the.landon.d@gmail.com
sudo savant-beta-run node scripts/beta-invites.js approve landon@savantedu.com
```

- **Step 11 (reviewer demo account): skip it.** The demo account can sign in past the gate, and you
  want only your two logins. (If YC or speedrun later want a reviewer login, run step 11 then.)
- **Never run** `beta-invites.js approve-applicants` while you want it to be just the two of you:
  every invite redeemed adds a login.

### Every feature, including the site-wide tutor and the Spanish path

The release is the newest `main`, so the code is the same as on your PC: the tutor on every page,
the Spanish path with catch-up, and all subjects (their content is in git). What a fresh server
lacks is keys and your progress:

- **Keys** (step 6; add these lines, values typed on the VM only):

```
NVIDIA_API_KEY=        the tutor and lessons (already in the kit)
GEMINI_API_KEY=        Spanish listening voice
MIMO_API_KEY=          Spanish speaking (speech to text)
LLMGATEWAY_API_KEY=    the better Spanish voice and the tutor's voice
LLMGATEWAY_CAP_USD=2
```

  The $5 speech cap is counted per server, so split it: `LLMGATEWAY_CAP_USD=2` here, and add
  `LLMGATEWAY_CAP_USD=3` to the `.env` on your PC (spent so far: $0.03). Leave
  `LLMGATEWAY_API_KEY` empty if you would rather keep all $5 for the PC; the beta then uses the
  Gemini voice.
- **The better voice is per account.** After both sign-ups, list their ids and put them in
  `SPANISH_GATEWAY_USERS`:

```
sudo savant-beta-run node -e "const d=require('/srv/savant-beta/shared/data/db.json');for(const u of d.users)console.log(u.id,u.email)"
sudo nano /srv/savant-beta/savant-beta.env    # SPANISH_GATEWAY_USERS=<id>,<id>
sudo systemctl restart savant-beta
```

- **Progress does not move.** The beta starts with an empty database: both accounts start the
  Spanish path from placement. Your Spanish progress, scorecards and tutor memory stay on the PC.
  Copying them across is possible (one account's rows from `data/db.json`), but ask first; it is
  not part of this kit.

What each account is: `the.landon.d@gmail.com` is the owner (base product, `/admin` opens);
`landon@savantedu.com` is an ordinary learner account with every modification, so it is the one to
test the learner experience with.

Check after step 12: in a private window, sign up at `https://beta.savantedu.com/register` with
any other address and no code; it must say Savant is in a private beta.
