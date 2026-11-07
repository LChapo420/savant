/* The tutor, as one component. The character is not decided yet: this is a placeholder (a little highlighter), and swapping the
 * final character in means replacing this file only. Everything else calls Tutor.mount(host) and Tutor.mood(host, name).
 *
 * NAME stays null until the owner picks one. Copy never names the tutor; if NAME is set, Tutor.greeting() starts using it.
 *
 * Moods: idle, happy, think, wave. The look is in css/screens/start.css under .tutor; motion honours reduced-motion there. Decorative:
 * the speech bubble beside it carries the words, so the SVG is hidden from screen readers.
 */
(function () {
  const svg = `
  <svg class="tutor-svg" viewBox="0 0 120 140" aria-hidden="true" focusable="false">
    <ellipse class="t-shadow" cx="60" cy="131" rx="30" ry="5"/>
    <g class="t-whole">
      <path class="t-arm t-arm-l" d="M30 88c-8 2-12 7-13 13"/>
      <path class="t-arm t-arm-r" d="M90 88c8-2 12-7 13-13"/>
      <path class="t-tip" d="M42 42 45 19c.4-3 2.4-5 5.4-5.7l20-5c3.800-.9 7 1.600 7.400 5.400L78 42Z"/>
      <rect class="t-collar" x="37" y="36" width="46" height="12" rx="5"/>
      <rect class="t-body" x="28" y="44" width="64" height="82" rx="20"/>
      <circle class="t-cheek" cx="39" cy="92" r="5"/>
      <circle class="t-cheek" cx="81" cy="92" r="5"/>
      <g class="t-eyes">
        <circle class="t-eye" cx="47" cy="76" r="11"/>
        <circle class="t-eye" cx="73" cy="76" r="11"/>
        <g class="t-pupils">
          <circle class="t-pupil" cx="48" cy="77" r="5.500"/>
          <circle class="t-pupil" cx="74" cy="77" r="5.500"/>
          <circle class="t-glint" cx="50" cy="74.500" r="1.800"/>
          <circle class="t-glint" cx="76" cy="74.500" r="1.800"/>
        </g>
      </g>
      <g class="t-eyes-happy">
        <path d="M38 79c2-7 16-7 18 0"/>
        <path d="M64 79c2-7 16-7 18 0"/>
      </g>
      <path class="t-mouth" d="M52 98c3 4 13 4 16 0"/>
      <path class="t-mouth-happy" d="M49 95h22c0 9-5 13-11 13s-11-4-11-13Z"/>
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
