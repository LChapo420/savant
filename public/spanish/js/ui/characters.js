/* The cast and the picture art, drawn for this project as plain SVG.
 *
 * PLACEHOLDERS: the owner may swap in their own characters. Each one keeps the
 * same contract: id, name, voice (TTS voice id, see config/spanish), and an SVG
 * whose mouth has .es-mouth-open / .es-mouth-closed so [data-talking] animates it.
 *
 * Mascot: Axo, an axolotl (ajolote), chosen because it is Mexican, friendly,
 * and nothing like any other app's mascot.
 */
(function () {
  const INK = '#2a2440';

  const mouth = (x, y, w = 14) => `
    <path class="es-mouth-closed" d="M${x - w / 2} ${y} q${w / 2} ${w / 2.6} ${w} 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <ellipse class="es-mouth-open" cx="${x}" cy="${y + 3}" rx="${w / 2.4}" ry="${w / 3}" fill="${INK}"/>`;
  const eyes = (lx, rx, y, r = 4.5) => `
    <g class="es-eyes"><circle cx="${lx}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${rx}" cy="${y}" r="${r}" fill="${INK}"/>
    <circle cx="${lx + 1.5}" cy="${y - 1.5}" r="${r / 3}" fill="#fff"/><circle cx="${rx + 1.5}" cy="${y - 1.5}" r="${r / 3}" fill="#fff"/></g>`;

  const CAST = {
    axo: {
      name: 'Axo', role: 'guide', voice: 'mascot',
      svg: `
        <g>
          <path d="M22 54c-12-6-16-16-12-20 5 2 9 8 14 14M24 44c-10-10-10-20-5-22 4 4 6 12 8 18M98 54c12-6 16-16 12-20-5 2-9 8-14 14M96 44c10-10 10-20 5-22-4 4-6 12-8 18" fill="#ff8fb6" stroke="#e5608f" stroke-width="3" stroke-linejoin="round"/>
          <ellipse cx="60" cy="112" rx="34" ry="24" fill="#ffb3cc"/>
          <ellipse cx="60" cy="116" rx="20" ry="14" fill="#ffd6e4"/>
          <ellipse cx="60" cy="62" rx="40" ry="34" fill="#ffb3cc"/>
          <ellipse cx="42" cy="74" rx="7" ry="4.5" fill="#ff8fb6" opacity=".7"/>
          <ellipse cx="78" cy="74" rx="7" ry="4.5" fill="#ff8fb6" opacity=".7"/>
          ${eyes(46, 74, 58, 6)}
          ${mouth(60, 76, 16)}
          <path d="M34 120c-6 6-10 12-6 14M86 120c6 6 10 12 6 14" stroke="#e5608f" stroke-width="5" stroke-linecap="round" fill="none"/>
        </g>`,
    },
    mara: {
      name: 'Mara', role: 'teacher', voice: 'female_warm',
      svg: `
        <path d="M24 140c2-26 18-38 36-38s34 12 36 38Z" fill="#2fa38a"/>
        <path d="M50 100h20v10a10 10 0 0 1-20 0Z" fill="#b97a56"/>
        <circle cx="60" cy="62" r="30" fill="#c98b63"/>
        <path d="M28 64c-6-26 10-44 32-44s40 16 32 44c-4-10-6-18-14-24-10 6-26 8-44 6-2 6-4 12-6 18Z" fill="#3b2418"/>
        <circle cx="30" cy="40" r="10" fill="#3b2418"/><circle cx="90" cy="40" r="10" fill="#3b2418"/><circle cx="60" cy="24" r="12" fill="#3b2418"/>
        <rect x="38" y="54" width="18" height="13" rx="6" fill="none" stroke="${INK}" stroke-width="3"/>
        <rect x="64" y="54" width="18" height="13" rx="6" fill="none" stroke="${INK}" stroke-width="3"/>
        <path d="M56 60h8" stroke="${INK}" stroke-width="3"/>
        ${eyes(47, 73, 60, 3.5)}
        ${mouth(60, 79, 14)}`,
    },
    tomas: {
      name: 'Tomás', role: 'friend', voice: 'male_young',
      svg: `
        <path d="M24 140c2-26 18-38 36-38s34 12 36 38Z" fill="#f2a43a"/>
        <path d="M50 100h20v10a10 10 0 0 1-20 0Z" fill="#e7b48e"/>
        <circle cx="60" cy="64" r="29" fill="#f0c39f"/>
        <path d="M30 56c0-20 14-32 30-32s30 12 30 32H30Z" fill="#5468ff"/>
        <rect x="27" y="52" width="66" height="10" rx="5" fill="#3d4fe0"/>
        <circle cx="60" cy="22" r="7" fill="#ffd45c"/>
        ${eyes(48, 72, 70, 4)}
        ${mouth(60, 85, 14)}`,
    },
    rosa: {
      name: 'Abuela Rosa', role: 'grandmother', voice: 'female_elder',
      svg: `
        <path d="M24 140c2-26 18-38 36-38s34 12 36 38Z" fill="#c2477a"/>
        <path d="M44 106c10 8 22 8 32 0" stroke="#ffe08a" stroke-width="4" fill="none"/>
        <path d="M50 98h20v10a10 10 0 0 1-20 0Z" fill="#a8704f"/>
        <circle cx="60" cy="64" r="29" fill="#b77d58"/>
        <path d="M30 62c-2-22 12-36 30-36s32 14 30 36c-4-12-14-20-30-20S34 50 30 62Z" fill="#d9d9e3"/>
        <circle cx="60" cy="24" r="13" fill="#d9d9e3"/>
        <path d="M40 60q7-5 14 0M66 60q7-5 14 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="42" cy="78" r="5" fill="#e98b8b" opacity=".6"/><circle cx="78" cy="78" r="5" fill="#e98b8b" opacity=".6"/>
        ${mouth(60, 82, 14)}`,
    },
    diego: {
      name: 'Diego', role: 'kid', voice: 'child',
      svg: `
        <path d="M30 140c2-22 14-32 30-32s28 10 30 32Z" fill="#e5484d"/>
        <path d="M52 104h16v8a8 8 0 0 1-16 0Z" fill="#8a5a3c"/>
        <circle cx="60" cy="72" r="27" fill="#9a6644"/>
        <path d="M34 66c0-18 12-28 26-28s26 10 26 28H34Z" fill="#1f8fe0"/>
        <path d="M80 62h22a4 4 0 0 1 0 8H80Z" fill="#1f8fe0"/>
        ${eyes(50, 70, 76, 4)}
        ${mouth(60, 90, 12)}`,
    },
  };

  // Picture-choice art: simple objects, one colour family each.
  const ART = {
    agua: '<path d="M38 26h44l-6 76a8 8 0 0 1-8 7H52a8 8 0 0 1-8-7Z" fill="#cfe9ff" stroke="#3b8fd9" stroke-width="4"/><path d="M42 54h36l-4 48a5 5 0 0 1-5 4H51a5 5 0 0 1-5-4Z" fill="#55b3ff"/><path d="M52 64q4 6 0 12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>',
    gato: '<path d="M30 56 26 22l22 16h24l22-16-4 34" fill="#f2a43a"/><ellipse cx="60" cy="72" rx="34" ry="30" fill="#f2a43a"/><path d="M34 34l8 10M86 34l-8 10" stroke="#d07f14" stroke-width="4"/><circle cx="47" cy="68" r="5" fill="#2a2440"/><circle cx="73" cy="68" r="5" fill="#2a2440"/><path d="M56 80h8l-4 4Z" fill="#e5608f"/><path d="M24 80h18M24 88h18M78 80h18M78 88h18" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
    perro: '<ellipse cx="60" cy="70" rx="32" ry="30" fill="#c58d5d"/><path d="M28 50c-10 6-12 26-4 34 6-6 10-18 10-30ZM92 50c10 6 12 26 4 34-6-6-10-18-10-30Z" fill="#7a4e2c"/><circle cx="48" cy="64" r="5" fill="#2a2440"/><circle cx="72" cy="64" r="5" fill="#2a2440"/><ellipse cx="60" cy="82" rx="12" ry="9" fill="#f0d2b4"/><ellipse cx="60" cy="78" rx="6" ry="4.5" fill="#2a2440"/><path d="M58 90q2 8 6 6" stroke="#e5484d" stroke-width="5" stroke-linecap="round" fill="none"/>',
    pan: '<path d="M20 70c0-20 18-34 40-34s40 14 40 34c0 14-6 22-14 22H34c-8 0-14-8-14-22Z" fill="#e9a65a"/><path d="M38 52q6 10 0 20M56 48q6 12 0 24M74 52q6 10 0 20" stroke="#b86f26" stroke-width="5" fill="none" stroke-linecap="round"/>',
    casa: '<path d="M20 62 60 26l40 36" fill="#e5484d"/><rect x="30" y="58" width="60" height="44" rx="3" fill="#ffe08a"/><rect x="52" y="74" width="16" height="28" rx="2" fill="#7a4e2c"/><rect x="36" y="66" width="12" height="12" rx="2" fill="#55b3ff"/><rect x="72" y="66" width="12" height="12" rx="2" fill="#55b3ff"/>',
    libro: '<path d="M60 36c-10-8-24-10-38-10v62c14 0 28 2 38 10 10-8 24-10 38-10V26c-14 0-28 2-38 10Z" fill="#9b82ff" stroke="#6a4fd8" stroke-width="4" stroke-linejoin="round"/><path d="M60 36v62" stroke="#6a4fd8" stroke-width="4"/><path d="M32 44h18M32 54h18M70 44h18M70 54h18" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
    cafe: '<path d="M30 48h50v28a20 20 0 0 1-20 20H50a20 20 0 0 1-20-20Z" fill="#f4f0ea" stroke="#7a4e2c" stroke-width="4"/><path d="M80 56h6a9 9 0 0 1 0 18h-6" fill="none" stroke="#7a4e2c" stroke-width="4"/><ellipse cx="55" cy="50" rx="21" ry="4" fill="#7a4e2c"/><path d="M46 38q-4-6 0-12M58 38q-4-6 0-12" stroke="#a9b3c8" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M24 100h68" stroke="#a9b3c8" stroke-width="4" stroke-linecap="round"/>',
    manzana: '<path d="M60 40c-8-6-30-6-32 18-2 22 12 42 22 42 4 0 6-2 10-2s6 2 10 2c10 0 24-20 22-42-2-24-24-24-32-18Z" fill="#e5484d"/><path d="M60 40c0-8 2-14 6-18" stroke="#7a4e2c" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M66 30c6-6 16-6 18 0-6 6-14 6-18 0Z" fill="#3cc474"/><ellipse cx="44" cy="58" rx="5" ry="9" fill="#fff" opacity=".35"/>',
    hotel: '<rect x="28" y="24" width="64" height="80" rx="4" fill="#9b82ff"/><rect x="22" y="18" width="76" height="12" rx="3" fill="#6a4fd8"/><text x="60" y="27.5" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" font-family="sans-serif">HOTEL</text><g fill="#ffe08a"><rect x="38" y="40" width="12" height="10" rx="2"/><rect x="54" y="40" width="12" height="10" rx="2"/><rect x="70" y="40" width="12" height="10" rx="2"/><rect x="38" y="58" width="12" height="10" rx="2"/><rect x="54" y="58" width="12" height="10" rx="2"/><rect x="70" y="58" width="12" height="10" rx="2"/></g><rect x="52" y="80" width="16" height="24" rx="2" fill="#2a2440"/>',
    tren: '<rect x="22" y="30" width="76" height="56" rx="14" fill="#e5484d"/><rect x="32" y="40" width="22" height="18" rx="4" fill="#cfe9ff"/><rect x="66" y="40" width="22" height="18" rx="4" fill="#cfe9ff"/><rect x="22" y="68" width="76" height="6" fill="#ffe08a"/><circle cx="40" cy="92" r="8" fill="#2a2440"/><circle cx="80" cy="92" r="8" fill="#2a2440"/><path d="M14 104h92" stroke="#7a4e2c" stroke-width="4" stroke-linecap="round"/>',
    musica: '<path d="M46 86V34l40-10v52" fill="none" stroke="#9b82ff" stroke-width="7" stroke-linejoin="round"/><ellipse cx="38" cy="88" rx="12" ry="9" fill="#9b82ff"/><ellipse cx="78" cy="78" rx="12" ry="9" fill="#9b82ff"/><path d="M46 46l40-10" stroke="#9b82ff" stroke-width="7"/>',
    sol: '<circle cx="60" cy="60" r="24" fill="#ffc53d"/><g stroke="#ffc53d" stroke-width="7" stroke-linecap="round"><path d="M60 16v12M60 92v12M16 60h12M92 60h12M29 29l8 8M83 83l8 8M29 91l8-8M83 37l8-8"/></g>',
    luna: '<path d="M78 24a38 38 0 1 0 18 54 30 30 0 1 1-18-54Z" fill="#ffe08a"/><circle cx="50" cy="56" r="4" fill="#e9c35a"/><circle cx="62" cy="80" r="6" fill="#e9c35a"/>',
    leche: '<path d="M42 34h36l6 14v56H36V48Z" fill="#f4f6fb" stroke="#55b3ff" stroke-width="4" stroke-linejoin="round"/><path d="M42 34l6-12h24l6 12" fill="#55b3ff"/><rect x="42" y="60" width="36" height="22" rx="3" fill="#55b3ff"/><text x="60" y="75" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" font-family="sans-serif">LECHE</text>',
    mesa: '<rect x="18" y="44" width="84" height="12" rx="4" fill="#c58d5d"/><path d="M28 56v44M92 56v44" stroke="#7a4e2c" stroke-width="7" stroke-linecap="round"/><rect x="44" y="30" width="14" height="14" rx="3" fill="#55b3ff"/><circle cx="74" cy="36" r="8" fill="#e5484d"/>',
    telefono: '<rect x="38" y="16" width="44" height="88" rx="10" fill="#2a2440"/><rect x="43" y="26" width="34" height="62" rx="4" fill="#55b3ff"/><circle cx="60" cy="96" r="4" fill="#a9b3c8"/><path d="M50 40h20M50 50h14" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
  };

  function svgWrap(inner, label, extra = '') {
    const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
    return `<svg viewBox="0 0 120 140" ${a11y} ${extra}>${inner}</svg>`;
  }

  window.ES = window.ES || {};
  window.ES.cast = Object.fromEntries(Object.entries(CAST).map(([id, c]) => [id, { id, name: c.name, role: c.role, voice: c.voice }]));
  window.ES.character = (id, { label } = {}) => {
    const c = CAST[id] || CAST.axo;
    return svgWrap(c.svg, label || null, `class="es-char" data-char="${id}"`);
  };
  window.ES.art = (key, { label } = {}) => {
    const body = ART[key];
    if (!body) return '';
    return `<svg viewBox="0 0 120 120" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;
  };
  window.ES.artNames = Object.keys(ART);
})();
