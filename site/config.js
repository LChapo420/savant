/* Site settings: contact addresses, where the forms send, and social accounts.
 * A value starting with "REPLACE_" is shown as "link to come" instead of a link. */
window.SAVANT_SITE = {
  // Where people write to you. Used for the email fallback of every form,
  // the footer contact link and the privacy page.
  contactEmail: 'contact@savantedu.com',
  // Investor notes go here. Set to '' to use contactEmail.
  investorEmail: 'contact@savantedu.com',          // e.g. founder@savantedu.com later
  // Requests about data (removal, a copy of what we hold). Set to '' to use contactEmail.
  privacyEmail: 'contact@savantedu.com',           // e.g. privacy@savantedu.com later
  // If you change an address here, also change the mailto links in index.html,
  // privacy.html, thanks.html and 404.html (shown when JavaScript is off).

  // Where the forms send sign-ups:
  //   ''                        the same server that serves this page (node server.js)
  //   'https://forms.example'   server.js running on another host (set SITE_ORIGINS there)
  //   'mailto'                  no backend: each form opens the visitor's email app instead
  // With '' or a URL, the page checks <endpoint>/api/health first and falls back to
  // email by itself if the backend is not there.
  formEndpoint: '',

  // Social accounts, in the order shown in the footer. Use full https:// URLs.
  // `icon` picks the platform's logo (instagram, tiktok, x, youtube); the
  // logos are drawn inline by assets/site.js, nothing is loaded from the platforms.
  socials: [
    { name: 'Instagram',   icon: 'instagram', url: 'https://www.instagram.com/savantedu_app/' },
    { name: 'TikTok',      icon: 'tiktok',    url: 'https://www.tiktok.com/@savantedu.com' },
    { name: 'X (Twitter)', icon: 'x',         url: 'https://x.com/savanteducom' },
    { name: 'YouTube',     icon: 'youtube',   url: 'https://www.youtube.com/@Savant-edu' },
  ],
};
