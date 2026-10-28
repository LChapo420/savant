/* Icons for the Spanish section. Drawn for this project (no third-party set),
 * 24x24, round caps, currentColor, so they follow the theme tokens.
 * Usage: ES.icon('flame') -> '<svg …>…</svg>' string. Decorative by default
 * (aria-hidden); pass a label to make one announce itself.
 */
(function () {
  const S = (body, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

  const ICONS = {
    home: S('<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>'),
    league: S('<path d="M12 3 4.5 6v5.5c0 4.4 3.1 7.9 7.5 9.5 4.4-1.6 7.5-5.1 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>'),
    quests: S('<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17"/><path d="M6 9V7.5A3.5 3.5 0 0 1 9.5 4h5A3.5 3.5 0 0 1 18 7.5V9"/><rect x="10.5" y="11.5" width="3" height="3.5" rx=".8"/>'),
    shop: S('<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8"/><path d="M10 20v-4.5h4V20"/>'),
    user: S('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"/>'),
    more: S('<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>'),
    practice: S('<path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/>'),
    flame: S('<path d="M12 21.5c4 0 6.5-2.6 6.5-6.3 0-3.6-2.5-5.6-3.6-8.7-.4 1.7-1.3 2.8-2.6 3.4.3-3.2-.9-5.9-3.3-7.4.2 3.3-1.3 5.1-2.8 6.9C5 11 4.5 12.8 4.5 15c0 3.8 3.2 6.5 7.5 6.5Z" fill="currentColor"/><path d="M12 19c1.7 0 2.8-1 2.8-2.6 0-1.4-.9-2.3-1.6-3.5-.5 1-1.2 1.4-1.9 1.6.1-1-.3-1.9-1-2.6-.4 1.6-1.9 2.6-1.9 4.5 0 1.6 1.4 2.6 3.6 2.6Z" fill="var(--es-bg)" stroke="none"/>'),
    gem: S('<path d="M6.5 4h11l3.5 5-9 11L3 9l3.5-5Z" fill="currentColor"/><path d="M3 9h18M9 4l-1 5 4 11 4-11-1-5" stroke="var(--es-bg)" stroke-width="1.4"/>'),
    heart: S('<path d="M12 20.5s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.5c0 5.8-8 10.4-8 10.4Z" fill="currentColor"/><path d="M8.2 9.6a2 2 0 0 1 1.8-1.3" stroke="var(--es-bg)" stroke-width="1.6"/>'),
    bolt: S('<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6l1-8Z" fill="currentColor"/>'),
    target: S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
    clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    speaker: S('<path d="M4 9.5v5h3.5L12.5 19V5L7.5 9.5H4Z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
    turtle: S('<path d="M4.5 15c0-3.9 3.1-7 7-7s7 3.1 7 7H4.5Z" fill="currentColor"/><path d="M18.5 13h1.8a1.7 1.7 0 0 0 0-3.4h-.8M6.5 15l-1 2.5M16.5 15l1 2.5M3 15h18"/>'),
    mic: S('<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'),
    micOff: S('<path d="M9 9V6a3 3 0 0 1 5.6-1.5M15 10.5v.5a3 3 0 0 1-4.6 2.5M5.5 11a6.5 6.5 0 0 0 10.8 4.9M18.5 11c0 .6-.1 1.2-.2 1.8M12 17.5V21M3.5 3.5l17 17"/>'),
    x: S('<path d="M6 6l12 12M18 6 6 18"/>'),
    check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    star: S('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" fill="currentColor"/>'),
    book: S('<path d="M12 6.5C10 5 7.5 4.5 4 4.5v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-14c-3.5 0-6 .5-8 2Z"/><path d="M12 6.5v14"/>'),
    headphones: S('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5" fill="currentColor"/><rect x="16.5" y="14" width="4" height="6" rx="1.5" fill="currentColor"/>'),
    chat: S('<path d="M4 5.5h16v10H9.5L5 19.5v-4H4v-10Z"/><path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01"/>'),
    pen: S('<path d="m4 20 1.2-4.6L15.6 5a2.1 2.1 0 0 1 3 3L8.6 18.8 4 20Z"/><path d="m13.5 7 3.5 3.5"/>'),
    trophy: S('<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" fill="currentColor"/><path d="M8 6H4.5a3.5 3.5 0 0 0 3.8 4M16 6h3.5a3.5 3.5 0 0 1-3.8 4M12 13v4M8 20.5h8M9.5 17h5"/>'),
    lock: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
    sparkle: S('<path d="M12 3.5c.7 4.2 2.3 5.8 6.5 6.5-4.2.7-5.8 2.3-6.5 6.5-.7-4.2-2.3-5.8-6.5-6.5 4.2-.7 5.8-2.3 6.5-6.5Z" fill="currentColor"/><path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z" fill="currentColor"/>'),
    redo: S('<path d="M19 8.5A7.5 7.5 0 1 0 19.5 15"/><path d="M19.5 3.5v5h-5"/>'),
    flag: S('<path d="M5 21V4M5 4.5h12.5l-2 4 2 4H5"/>'),
    snow: S('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>'),
    gift: S('<rect x="3.5" y="9" width="17" height="11" rx="2" fill="currentColor"/><path d="M3.5 13h17M12 9v11" stroke="var(--es-bg)"/><path d="M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9Zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9Z"/>'),
    sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    moon: S('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>'),
  };

  function icon(name, label) {
    const svg = ICONS[name] || ICONS.star;
    return label
      ? svg.replace('<svg ', `<svg role="img" aria-label="${String(label).replace(/"/g, '&quot;')}" `)
      : svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
  }

  window.ES = window.ES || {};
  window.ES.icon = icon;
  window.ES.iconNames = Object.keys(ICONS);
})();
