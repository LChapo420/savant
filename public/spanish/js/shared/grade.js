/* Answer checking for the Spanish section, shared by the server (require) and
 * the browser (window.ES.grade). One implementation, so a game checked in the
 * browser and a lesson checked on the server can never disagree.
 *
 * The rules, chosen to feel like the app learners already know:
 *   - case, spacing and punctuation (including ¿ ¡ « ») never matter
 *   - a missing or wrong accent is accepted with a nudge ("accent")
 *   - a missing ñ is accepted with a nudge, unless the item lists the pair as
 *     meaningful (año / ano)
 *   - one typo in a word of 5+ letters is accepted with a nudge ("typo")
 *   - any of the item's accepted answers counts
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ES = root.ES || {}; root.ES.grade = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  const PUNCT = /[¿?¡!.,;:"“”«»()\[\]…\-–—]/g;

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function clean(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[’`´]/g, "'")
      .replace(PUNCT, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function words(s) { return clean(s).split(' ').filter(Boolean); }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length; const n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  // Compare one candidate word list to one accepted word list.
  // Returns null (no match) or the nudge it needed: '' | 'accent' | 'typo'.
  function compareWords(got, want, strictPairs) {
    if (got.length !== want.length) return null;
    let note = '';
    for (let i = 0; i < want.length; i++) {
      const g = got[i]; const w = want[i];
      if (g === w) continue;
      const ga = stripAccents(g); const wa = stripAccents(w);
      if (ga === wa) {
        if (strictPairs && strictPairs.some(([x, y]) => (x === g && y === w) || (x === w && y === g))) return null;
        note = note || 'accent';
        continue;
      }
      if (wa.length >= 5 && lev(ga, wa) === 1) { note = 'typo'; continue; }
      return null;
    }
    return note;
  }

  /**
   * Check a typed or assembled answer.
   * @param {string} response
   * @param {string[]} accepted  every valid answer; the first is the one shown
   * @param {{strictPairs?: string[][]}} [opts]
   * @returns {{correct: boolean, note: ''|'accent'|'typo', closest: string}}
   */
  function check(response, accepted, opts = {}) {
    const got = words(response);
    let best = null;
    for (const a of accepted || []) {
      const note = compareWords(got, words(a), opts.strictPairs);
      if (note === '') return { correct: true, note: '', closest: a };
      if (note !== null && !best) best = { correct: true, note, closest: a };
    }
    if (best) return best;
    return { correct: false, note: '', closest: (accepted && accepted[0]) || '' };
  }

  // Spanish spelling that sounds the same: if two words match after this, the
  // learner heard right and spelled wrong ("spelling"); otherwise they misheard
  // ("sound"). Used to tag dictation errors for the error log.
  function soundKey(w) {
    return stripAccents(w)
      .replace(/^h/, '').replace(/([^c])h/g, '$1')
      .replace(/v/g, 'b')
      .replace(/ll/g, 'y').replace(/y([^aeiou]|$)/g, 'i$1')
      .replace(/z/g, 's').replace(/c([ei])/g, 's$1')
      .replace(/qu([ei])/g, 'k$1').replace(/c([aou]|[^ei]|$)/g, 'k$1')
      .replace(/g([ei])/g, 'j$1').replace(/gu([ei])/g, 'g$1')
      .replace(/x/g, 'ks').replace(/rr/g, 'R').replace(/^r/, 'R')
      .replace(/ñ/g, 'ny');
  }

  // A one-letter difference that is not a same-sound spelling: a vowel or an
  // r/rr difference changes what was heard (pero/perro, mesa/misa), anything
  // else is a slip of the fingers.
  function soundOrSlip(got, want) {
    const a = stripAccents(got); const b = stripAccents(want);
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    const ch = (a[k] || '') + (b[k] || '');
    return /[aeiour]/.test(ch) ? 'sound' : 'spelling';
  }

  // Word-level alignment (LCS) between what the learner typed and the target.
  // Each target word comes back as ok | accent | spelling | sound | missing, and
  // stray learner words as extra. Drives the dictation diff and its error tags.
  function diff(response, target) {
    const a = words(response); const b = words(target);
    const eq = (x, y) => stripAccents(x) === stripAccents(y) || soundKey(x) === soundKey(y) || (y.length >= 5 && lev(stripAccents(x), stripAccents(y)) <= 1);
    const m = a.length; const n = b.length;
    const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
      L[i][j] = eq(a[i], b[j]) ? 1 + L[i + 1][j + 1] : Math.max(L[i + 1][j], L[i][j + 1]);
    }
    const out = []; let i = 0; let j = 0;
    while (i < m && j < n) {
      if (eq(a[i], b[j])) {
        const got = a[i]; const want = b[j];
        let tag = 'ok';
        if (got !== want) tag = stripAccents(got) === stripAccents(want) ? 'accent' : (soundKey(got) === soundKey(want) ? 'spelling' : soundOrSlip(got, want));
        out.push({ word: want, got, tag }); i++; j++;
      } else if (L[i + 1][j] >= L[i][j + 1]) {
        // a learner word that matches nothing here: a mishearing of the next target word
        if (j < n && !b.slice(j + 1).some((w) => eq(a[i], w)) && (i + 1 >= m || !eq(a[i + 1], b[j]))) {
          out.push({ word: b[j], got: a[i], tag: 'sound' }); i++; j++;
        } else { out.push({ word: null, got: a[i], tag: 'extra' }); i++; }
      } else { out.push({ word: b[j], got: '', tag: 'missing' }); j++; }
    }
    while (j < n) { out.push({ word: b[j], got: '', tag: 'missing' }); j++; }
    while (i < m) { out.push({ word: null, got: a[i], tag: 'extra' }); i++; }
    const counted = out.filter((x) => x.word);
    const good = counted.filter((x) => x.tag === 'ok' || x.tag === 'accent').length;
    return { tokens: out, score: counted.length ? Math.round((good / counted.length) * 100) : 0 };
  }

  /**
   * Score a speech-recognition transcript against the target sentence.
   * Beginner transcripts are rough, so this is lenient: accent- and
   * spelling-blind word matching, pass at 70%.
   */
  function speech(transcript, target, accepted) {
    const targets = [target, ...(accepted || [])];
    let best = { score: 0, missing: words(target) };
    for (const t of targets) {
      const d = diff(transcript, t);
      const counted = d.tokens.filter((x) => x.word);
      const ok = counted.filter((x) => x.tag !== 'missing' && x.tag !== 'sound').length;
      const score = counted.length ? Math.round((ok / counted.length) * 100) : 0;
      if (score > best.score) best = { score, missing: counted.filter((x) => x.tag === 'missing' || x.tag === 'sound').map((x) => x.word) };
    }
    return { score: best.score, pass: best.score >= 70, missing: best.missing };
  }

  return { check, diff, speech, clean, words, stripAccents, soundKey, lev };
});
