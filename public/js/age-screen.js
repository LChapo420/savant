/* The neutral age screen, shared by sign-up and by the one-time question for
 * accounts made before it existed (onboarding).
 *
 * Neutral on purpose (FTC COPPA FAQ D.7 and the UK Children's Code): month and
 * year with no default, every year from this one back 100, a country list with
 * no default, and nothing on the screen that says which answer leads where. The
 * server holds the first answer for the session and decides the route; this file
 * never knows any age threshold.
 */
(function () {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  let configPromise = null;
  function config() {
    if (!configPromise) configPromise = App.api.get('/api/consent/config');
    return configPromise;
  }

  /** Fill the three selects. Each keeps its empty first option selected. */
  async function fill({ month, year, country }) {
    MONTHS.forEach((name, i) => month.add(new Option(name, String(i + 1))));
    const now = new Date().getFullYear();
    for (let y = now; y >= now - 100; y--) year.add(new Option(String(y), String(y)));
    const { countries, pending_days: pendingDays } = await config();
    countries.forEach((c) => country.add(new Option(c.name, c.code)));
    month.value = '';
    year.value = '';
    country.value = '';
    return { pendingDays };
  }

  /** Read the selects; an empty one is an error the caller shows. */
  function read({ month, year, country }) {
    if (!month.value || !year.value) return { error: 'Choose the month and year you were born.', focus: !month.value ? month : year };
    if (!country.value) return { error: 'Choose the country you live in.', focus: country };
    return { body: { birth_month: Number(month.value), birth_year: Number(year.value), country: country.value } };
  }

  /** Send the answer. Resolves with { route: 'self' | 'parent', locked }. */
  function submit(body) {
    return App.api.post('/api/consent/age', body);
  }

  window.AgeScreen = { fill, read, submit, config };
}());
