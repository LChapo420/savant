/* Before the new onboarding paints: the learner's sun/moon choice, if they made one (the same key as js/style-boot.js). Otherwise the system decides. */
(function () {
  try {
    const forced = window.localStorage.getItem('polymath.theme');
    if (forced === 'light' || forced === 'dark') document.documentElement.setAttribute('data-theme', forced);
  } catch (err) { /* no storage: the system decides */ }
}());
