/* The icon set, as one SVG sprite injected once per page.
 *
 * Every glyph in the app's own chrome comes from here: no icon font, no
 * third-party request. `icon(name)` returns the markup for a <use> reference, so
 * a page never contains raw path data. Emoji are allowed elsewhere — a generated
 * lesson page is model-written and uses them — so this is the app's set, not a
 * ban.
 */
(function () {
  const PATHS = {
    logo: '<path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z"/><path d="M3 12.5 12 17l9-4.5"/><path d="M3 17.5 12 22l9-4.5"/>',
    sigma: '<path d="M18 5H7l6 7-6 7h11"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 5.5V20.5"/><path d="M19 18v3H6.5"/>',
    brain: '<path d="M9.5 3A3.5 3.5 0 0 0 6 6.5 3 3 0 0 0 4 9.3a3 3 0 0 0 1.2 2.4A3.2 3.2 0 0 0 5 14a3 3 0 0 0 2 2.8V18a3 3 0 0 0 3 3h.5V3Z"/><path d="M14.5 3A3.5 3.5 0 0 1 18 6.5a3 3 0 0 1 2 2.8 3 3 0 0 1-1.2 2.4A3.2 3.2 0 0 1 19 14a3 3 0 0 1-2 2.8V18a3 3 0 0 1-3 3h-.5V3Z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8Z"/><path d="M5 21h14"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3v18"/><path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8"/><path d="M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/>',
    check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.2l2.8 2.8L16.2 9.6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="M11 18 5 12l6-6"/>',
    'chevron-right': '<path d="M9 5l7 7-7 7"/>',
    streak: '<path d="M12 3c3 4 5 6.2 5 9a5 5 0 0 1-10 0c0-1.6.7-3 2-4.5.3 1.6 1.1 2.5 2.2 2.5 1.3 0 1.9-1.2 1.4-3-.3-1.2-.8-2.4-.6-4Z"/>',
    star: '<path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.9l6-.9Z"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14.5 7 21l5-2.5L17 21l-1.5-6.5"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12.5 16V7M17 16v-8"/>',
    'trending-up': '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    'log-out': '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-13.7-4.7L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.4"/><path d="M12 17h.01"/>',
    flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2 4 2 4H6"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 13l9 5 9-5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16Z"/><path d="M14 6l4 4"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5Z"/>',
    zap: '<path d="M13 3 5 13.5h5l-1 7.5 8-10.5h-5Z"/>',
    graduation: '<path d="M2.5 8.5 12 4.5l9.5 4L12 12.5Z"/><path d="M6 10.8v4.4c0 1.6 2.7 2.8 6 2.8s6-1.2 6-2.8v-4.4"/><path d="M21.5 8.5v5"/>',
    'book-open': '<path d="M12 6.5C10.5 5 8.5 4.5 3.5 4.5v13C8.5 17.5 10.5 18 12 19.5"/><path d="M12 6.5c1.5-1.5 3.5-2 8.5-2v13c-5 0-7 .5-8.5 2"/><path d="M12 6.5v13"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.3a2 2 0 1 1 4 0A1.7 1.7 0 0 0 16.9 5.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z"/>',

    // ── the writing toolbar ────────────────────────────────────────────────
    // Drawn heavier than the rest, because these sit at 1.15em against a row of
    // hairlines and a 1.8 stroke turns a letterform into a smudge. `bold` and
    // `underline` get extra weight and fills; the rest match the house stroke.
    bold: '<path d="M7 4.5h6.2a4.2 4.2 0 0 1 0 8.4H7Z" stroke-width="2.4"/><path d="M7 12.9h7a4.3 4.3 0 0 1 0 8.6H7Z" stroke-width="2.4"/>',
    italic: '<path d="M10 4.5h7M7 19.5h7M14.5 4.5 9.5 19.5"/>',
    underline: '<path d="M6.5 4v6.5a5.5 5.5 0 0 0 11 0V4"/><path d="M5 20.5h14"/>',
    strike: '<path d="M4 12h16"/><path d="M16.5 7.2C15.6 5.6 13.8 4.6 11.6 4.6c-2.7 0-4.7 1.4-4.7 3.5 0 1.4.8 2.4 2.1 3.1"/><path d="M7.3 15.6c.7 2.2 2.5 3.8 5 3.8 2.9 0 5-1.5 5-3.8 0-1.1-.4-2-1.2-2.7"/>',
    'list-ordered': '<path d="M10 6.5h11M10 12h11M10 17.5h11"/><path d="M3.5 5.5 5 4.5v4"/><path d="M3 11h2.5L3 13.5h2.5"/><path d="M3.4 16.4c0-.7.6-1.1 1.3-1.1.7 0 1.2.5 1.2 1.1 0 1-2.5 1.4-2.5 2.7h2.6"/>',
    'align-left': '<path d="M4 6.5h16M4 12h10M4 17.5h13"/>',
    'align-center': '<path d="M4 6.5h16M7 12h10M5.5 17.5h13"/>',
    'align-right': '<path d="M4 6.5h16M10 12h10M7 17.5h13"/>',
    undo: '<path d="M4 9h10a5.5 5.5 0 0 1 0 11h-4"/><path d="M7.5 5.5 4 9l3.5 3.5"/>',
    redo: '<path d="M20 9H10a5.5 5.5 0 0 0 0 11h4"/><path d="M16.5 5.5 20 9l-3.5 3.5"/>',
  };

  const sprite = document.createElement('div');
  sprite.className = 'sprite';
  sprite.setAttribute('aria-hidden', 'true');
  sprite.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${
    Object.entries(PATHS).map(([name, body]) =>
      `<symbol id="ic-${name}" viewBox="0 0 24 24">${body}</symbol>`).join('')
  }</svg>`;

  function install() {
    if (!document.getElementById('polymath-sprite')) {
      sprite.id = 'polymath-sprite';
      document.body.prepend(sprite);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  /** Markup for one icon. `name` must exist in PATHS; unknown names render nothing. */
  window.icon = function icon(name, className) {
    if (!PATHS[name]) return '';
    return `<svg class="icon${className ? ` ${className}` : ''}" aria-hidden="true"><use href="#ic-${name}"></use></svg>`;
  };
  window.ICON_NAMES = Object.keys(PATHS);
})();
