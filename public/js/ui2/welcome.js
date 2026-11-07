/* The first screen of /start under UI_V2, one entry per design. services/ui-v2.js puts the chosen one on <html data-welcome> from the setting UI_V2_WELCOME
 * (card by default); each one's look is its own block in css/ui2/welcome.css. To try another (design-refs/first-screen/ has A to J): an entry here, a block there, the setting.
 * Every design keeps js/start.js's buttons: Get started, and "I have an account" only for someone signed out (testers in the private beta are already signed in, so they don't see it).
 */
(function () {
  const WELCOMES = {
    // The giraffe big, the headline under it (design-refs/ui-v4-mockups, Welcome). The first screen until 7 Nov.
    giraffe: { h1: 'From zero to Savant.', lead: 'Lessons built around you.' },
    // H in design-refs/first-screen/sheet-2.png: one card on a faint pattern of the subjects' icons, the wordmark in the card. The owner's pick, 7 Nov.
    card: { h1: 'Learn it properly, from the start.', lead: 'Lessons built around you.' },
  };
  const asked = document.documentElement.dataset.welcome;
  const name = Object.prototype.hasOwnProperty.call(WELCOMES, asked) ? asked : 'giraffe';
  const w = WELCOMES[name];
  window.U2Welcome = { name, names: Object.keys(WELCOMES), html: `<div class="ob-welcome"><h1>${w.h1}</h1><p class="ob-lead">${w.lead}</p></div>` };
}());
