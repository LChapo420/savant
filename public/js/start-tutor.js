/* The tutor, as one component. The character is the Sunny giraffe (owner, 7 Nov: "for now"). Swapping it means replacing this file and
 * the .tutor block in css/screens/start.css. Everything else calls Tutor.mount(host) and Tutor.mood(host, name).
 *
 * NAME stays null until the owner picks one. Copy never names the tutor; if NAME is set, Tutor.greeting() starts using it.
 *
 * Moods: idle, happy, cheer (happy, bouncing), think, wave. The look is in css/screens/start.css under .tutor; motion honours reduced-motion there. Decorative:
 * the speech bubble beside it carries the words, so the SVG is hidden from screen readers.
 */
(function () {
  const BODY = 'M0 -188C50 -188 76 -156 76 -120C76 -86 58 -66 52 -44C46 -24 46 -6 52 10C66 28 84 50 84 86C84 126 46 140 0 140C-46 140 -84 126 -84 86C-84 50 -66 28 -52 10C-46 -6 -46 -24 -52 -44C-58 -66 -76 -86 -76 -120C-76 -156 -50 -188 0 -188Z';
  const spot = (x, y, r, rot) => `<ellipse class="t-spot" cx="${x}" cy="${y}" rx="${r * 1.2}" ry="${r * 0.92}" transform="rotate(${rot} ${x} ${y})"/>`;
  const svg = `
  <svg class="tutor-svg" viewBox="-135 -250 270 425" aria-hidden="true" focusable="false">
    <defs><clipPath id="tutor-body-clip"><path d="${BODY}"/></clipPath></defs>
    <ellipse class="t-shadow" cx="0" cy="160" rx="92" ry="11"/>
    <g class="t-whole">
      <path class="t-tail" d="M70 118C106 112 118 88 110 64"/><circle class="t-spot" cx="110" cy="52" r="20"/>
      <ellipse class="t-foot" cx="-38" cy="142" rx="38" ry="20"/><ellipse class="t-foot" cx="38" cy="142" rx="38" ry="20"/>
      <rect class="t-shade" x="-41" y="-222" width="26" height="50" rx="13" transform="rotate(-7 -26 -180)"/><rect class="t-shade" x="15" y="-222" width="26" height="50" rx="13" transform="rotate(7 26 -180)"/>
      <circle class="t-spot" cx="-31" cy="-222" r="20"/><circle class="t-spot" cx="31" cy="-222" r="20"/><ellipse class="t-spot" cx="0" cy="-192" rx="15" ry="20"/>
      <ellipse class="t-shade" cx="-90" cy="-140" rx="32" ry="20" transform="rotate(-24 -72 -140)"/><ellipse class="t-shade" cx="90" cy="-140" rx="32" ry="20" transform="rotate(24 72 -140)"/>
      <path class="t-shade" d="${BODY}"/>
      <g clip-path="url(#tutor-body-clip)">
        <path class="t-coat" d="${BODY}" transform="translate(-9 -3)"/>
        ${spot(-52, -162, 15, 20)}${spot(50, -166, 12, -24)}${spot(-44, -26, 17, 30)}${spot(40, -8, 18, -18)}${spot(-36, 26, 12, 10)}${spot(-68, 66, 15, 62)}${spot(70, 78, 15, -60)}
        <ellipse class="t-light" cx="0" cy="88" rx="50" ry="49"/>
      </g>
      <ellipse class="t-light" cx="0" cy="-70" rx="44" ry="26"/>
      <g class="t-eyes">
        <circle class="t-eye" cx="-28" cy="-126" r="29"/><circle class="t-eye" cx="28" cy="-126" r="29"/>
        <g class="t-pupils">
          <circle class="t-pupil" cx="-22" cy="-122" r="16"/><circle class="t-pupil" cx="22" cy="-122" r="16"/>
          <circle class="t-glint" cx="-16" cy="-129" r="5.500"/><circle class="t-glint" cx="28" cy="-129" r="5.500"/>
        </g>
      </g>
      <g class="t-eyes-happy">
        <path d="M-50 -118C-44 -150 -12 -150 -6 -118"/>
        <path d="M6 -118C12 -150 44 -150 50 -118"/>
      </g>
      <ellipse class="t-foot" cx="-11" cy="-79" rx="4" ry="5"/><ellipse class="t-foot" cx="11" cy="-79" rx="4" ry="5"/>
      <g class="t-mouth"><path class="t-mouth-in" d="M-17 -68C-10 -50 10 -50 17 -68Z"/><path class="t-tongue" d="M-9 -60C-4 -54 4 -54 9 -60C4 -63 -4 -63 -9 -60Z"/></g>
      <g class="t-mouth-happy"><path class="t-mouth-in" d="M-26 -72C-18 -38 18 -38 26 -72Z"/><path class="t-tongue" d="M-14 -56C-7 -45 7 -45 14 -56C7 -61 -7 -61 -14 -56Z"/></g>
      <g class="t-arm-l"><ellipse class="t-shade" cx="-74" cy="52" rx="20" ry="38" transform="rotate(24 -74 52)"/></g>
      <g class="t-arm-r"><ellipse class="t-shade" cx="78" cy="10" rx="20" ry="38" transform="rotate(38 78 10)"/></g>
    </g>
  </svg>`;

  function mount(host, { mood = 'idle' } = {}) {
    if (!host) return;
    host.classList.add('tutor');
    host.innerHTML = svg;
    host.dataset.mood = mood;
  }

  let timer = null;
  /** Change mood. `hold` (ms) goes back to idle afterwards. */
  function mood(host, name, hold) {
    if (!host) return;
    host.dataset.mood = name;
    host.classList.remove('is-bouncing');
    // Reading the size restarts the bounce on a repeat reaction.
    void host.offsetWidth; // eslint-disable-line no-void
    if (name === 'happy') host.classList.add('is-bouncing');
    clearTimeout(timer);
    if (hold) timer = setTimeout(() => { host.dataset.mood = 'idle'; }, hold);
  }

  window.Tutor = {
    NAME: null,
    mount,
    mood,
    greeting() { return this.NAME ? `Hi, I'm ${this.NAME}, your tutor.` : "Hi, I'm your tutor."; },
  };
}());
