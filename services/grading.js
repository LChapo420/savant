/**
 * Answer comparison. This runs on the server and nowhere else: the client never
 * receives an answer key, so a learner cannot read the answers out of the page.
 *
 * The rules here decide what counts as "the same answer", and they are
 * deliberately generous about form and strict about substance: accents,
 * capitalization, "$", stray punctuation, and 0.5 versus 1/2 are all forgiven,
 * while a wrong value never is.
 */
/**
 * Formats whose unmatched answers go to the layered grader (services/typed-grading.js)
 * before they are called wrong. type_in joined on 2026-10-23: a typed word or phrase
 * has valid alternates the key cannot list ("son las cinco y quince" for "son las
 * cinco y cuarto"), and the grader accepts only on consensus, so it cannot add a
 * false accept. GRADING_AI_TYPE_IN=0 turns that off.
 */
const AI_GRADED_FORMATS = new Set(['short_answer']);
const aiGraded = (format) => AI_GRADED_FORMATS.has(format) || (format === 'type_in' && String(process.env.GRADING_AI_TYPE_IN || '1') !== '0');

/** Leading subject pronouns a Spanish answer may include or omit freely. */
const OPTIONAL_LEADING = ['yo', 'tu', 'usted', 'el', 'ella', 'nosotros', 'nosotras', 'ustedes', 'ellos', 'ellas'];

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(raw) {
  let s = String(raw == null ? '' : raw);
  s = stripAccents(s.toLowerCase());
  s = s.replace(/[−–—]/g, '-');   // unicode minus and dashes
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(/[$,]/g, '');
  s = s.replace(/[.!?¡¿;]+$/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * The text a number is read from: lower case, no accents, unicode minus, no "$",
 * no trailing full stop. Commas and inner spaces are NOT removed (see asNumber).
 */
function numberText(raw) {
  return stripAccents(String(raw == null ? '' : raw).toLowerCase())
    .replace(/[−–—]/g, '-').replace(/\$/g, '').replace(/[.!?;]+$/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Commas are read as thousands separators only in that exact shape (1,250 or
 * 1,250,000.5). Anything else with a comma or an inner space is not one number:
 * measured 2026-10-23, the old reading stripped both, so "12, 6, 4, 3, 2, 1" became
 * 1264321 (a right list marked wrong), "1 2" became 12 (it matched a key of 12),
 * and "1 1/2" became 11/2.
 */
function asNumber(s) {
  let t = numberText(s);
  if (t.includes(',')) {
    if (!/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return null;
    t = t.replace(/,/g, '');
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function asFraction(s) {
  const t = numberText(s).replace(/\s*\/\s*/g, '/');
  const simple = t.match(/^([-+]?\d+)\/([-+]?\d+)$/);
  if (simple) {
    const den = Number(simple[2]);
    return den ? Number(simple[1]) / den : null;
  }
  // A mixed number: "1 1/2", "-2 3/4".
  const mixed = t.match(/^([-+]?)(\d+) (\d+)\/(\d+)$/);
  if (mixed) {
    const den = Number(mixed[4]);
    if (!den) return null;
    const v = Number(mixed[2]) + Number(mixed[3]) / den;
    return mixed[1] === '-' ? -v : v;
  }
  return null;
}

/** A single numeric value from an answer written as an integer, decimal, fraction or mixed number. */
function numericValue(s) {
  const n = asNumber(s);
  if (n !== null) return n;
  return asFraction(s);
}

function stripLeadingPronoun(s) {
  const parts = s.split(' ');
  if (parts.length > 1 && OPTIONAL_LEADING.includes(parts[0])) return parts.slice(1).join(' ');
  return s;
}

/**
 * Whether a leading pronoun may be dropped from `raw` when it is compared with
 * `other`. Accents are gone after normalize(), so "el" (the article) and "él"
 * (he), "tu" (your) and "tú" (you) look the same there — and dropping them
 * freely let a type-in keyed "el libro" accept a bare "libro". An unaccented
 * "el" or "tu" is only treated as the pronoun when the other side spells it with
 * its accent; every other pronoun in the list is never an article.
 */
function mayDropPronoun(raw, other) {
  const first = String(raw == null ? '' : raw).trim().toLowerCase().split(/\s+/)[0] || '';
  const otherFirst = String(other == null ? '' : other).trim().toLowerCase().split(/\s+/)[0] || '';
  if (first === 'el') return otherFirst === 'él';
  if (first === 'tu') return otherFirst === 'tú';
  return true;
}

/**
 * Drop a single leading "x =" from an answer to an equation.
 *
 * "8" and "x = 8" are the same answer, and which one a learner types is a habit,
 * not knowledge. Both forms turn up in answer keys — the bank writes the bare
 * value, a model sometimes writes the assignment — so marking one of them wrong
 * would fail people for their notation. Only one leading assignment is removed and
 * only when there is exactly one "=", so a multi-root answer like "x = 2 or x = 3"
 * still has to name both roots.
 *
 * The forgiveness runs both ways: a key of "y = mx + b" accepts "mx + b" as well.
 * That is deliberate — the same unfairness in the other direction.
 */
function stripAssignment(s) {
  if ((s.match(/=/g) || []).length !== 1) return s;
  const m = s.match(/^[a-z]\s*=\s*(.+)$/);
  return m && m[1].trim() ? m[1].trim() : s;
}

/**
 * What the question itself says the FORM of the answer must be.
 *
 * The rules forgive form (capitals, accents, 0.5 for 1/2), and that is right
 * until the form is the thing being asked for. Measured 2026-10-23: "Write 24/32
 * in lowest terms" accepted "24/32" (the question typed back), "Fix the
 * capitalization: i went to paris" accepted the unfixed sentence, and an accent
 * item accepted the word without its accent. So the forgiveness is switched off
 * in exactly the dimension the prompt names.
 */
function formDemands(prompt) {
  const p = String(prompt == null ? '' : prompt);
  return {
    lowestTerms: /lowest terms|simplest form|fully simplif|reduce(d)? (the )?fraction/i.test(p),
    asFraction: /\bas an? (improper )?fraction\b/i.test(p),
    asDecimal: /\bas a decimal\b/i.test(p),
    caseSensitive: /capitali[sz]|capital letter|upper ?case|lower ?case|proper noun/i.test(p),
    punctuationSensitive: /punctuat|apostrophe|comma|quotation mark|end mark|semicolon|colon\b|hyphen/i.test(p),
    accentSensitive: /\baccent|tilde|diacritic|acento|tilde|written mark/i.test(p),
  };
}

/** The same letters, keeping exactly what the prompt demands (case, punctuation, accents). */
function strictForm(raw, demands) {
  let s = String(raw == null ? '' : raw).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  if (!demands.caseSensitive) s = s.toLowerCase();
  if (!demands.accentSensitive) s = stripAccents(s);
  if (!demands.punctuationSensitive) s = s.replace(/[$,]/g, '').replace(/[.!?¡¿;]+$/g, '').trim();
  return s;
}

function gcd(a, b) {
  let x = Math.abs(a); let y = Math.abs(b);
  while (y) { [x, y] = [y, x % y]; }
  return x;
}

/**
 * A numeric answer that has the right value but breaks the form the question
 * asked for: an unreduced fraction for "lowest terms", a decimal for "as a
 * fraction", a fraction for "as a decimal". Null when the form is fine.
 */
function formBreach(answer, demands) {
  const s = numberText(answer).replace(/\s*\/\s*/g, '/');
  const frac = s.match(/^[-+]?(?:\d+ )?(\d+)\/(\d+)$/);
  if (demands.lowestTerms && frac && gcd(Number(frac[1]), Number(frac[2])) > 1) return 'not in lowest terms';
  if (demands.asFraction && !frac && /[.]/.test(s)) return 'written as a decimal, not a fraction';
  if (demands.asDecimal && frac) return 'written as a fraction, not a decimal';
  return null;
}

function sameText(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const sa = mayDropPronoun(a, b) ? stripLeadingPronoun(na) : na;
  const sb = mayDropPronoun(b, a) ? stripLeadingPronoun(nb) : nb;
  if (sa === sb) return true;
  return stripAssignment(na) === stripAssignment(nb);
}

/**
 * Grade one answer against an item.
 *
 * @returns {{correct: boolean, needsAi: boolean, matched: string|null}}
 *   `needsAi` marks a free-response answer that did not match any accepted
 *   string and deserves a model grader before it is called wrong.
 */
function grade(item, userAnswer) {
  const accepted = [item.answer, ...(item.accepts || [])];

  // A question set on a chess position is answered with a move, and moves are
  // compared as moves in that position: the text rules below would lower-case
  // "Bxc3" (a bishop) into "bxc3" (a pawn).
  // Notes played on a keyboard are compared as notes: a chord in any order and
  // octave, a sequence in order and any octave.
  // A read of a basketball play is the id of the option picked.
  if (item.format === 'play') {
    // eslint-disable-next-line global-require
    const correct = require('./basketball-checks').gradePlay(item, userAnswer);
    return { correct, needsAi: false, matched: String(userAnswer == null ? '' : userAnswer) };
  }

  if (item.format === 'keys') {
    // eslint-disable-next-line global-require
    const correct = require('./piano-checks').gradeKeys(item, userAnswer);
    return { correct, needsAi: false, matched: String(userAnswer == null ? '' : userAnswer) };
  }

  if (item.fen && (item.format === 'board' || item.format === 'type_in')) {
    // eslint-disable-next-line global-require
    const correct = require('./chess-checks').gradeBoard(item, userAnswer);
    return { correct, needsAi: false, matched: String(userAnswer == null ? '' : userAnswer) };
  }

  if (item.format === 'multiple_choice') {
    const chosen = String(userAnswer == null ? '' : userAnswer);
    const selected = Array.isArray(item.choices)
      ? item.choices.find((choice) => String(choice) === chosen)
      : undefined;
    if (selected !== undefined) {
      return { correct: selected === item.answer, needsAi: false, matched: chosen };
    }
    // Text first, index second.
    //
    // The order matters and getting it the other way round marked a learner wrong
    // for picking the right answer. The client may send either the choice's text
    // or its index, and a bare integer is ambiguous: for a question whose choices
    // are "1", "2", "3", "4" and whose answer is "2", the integer 2 is the
    // *choice*, not the third option. Reading it as an index first compared the
    // learner's answer against "3" and reported the question they got right as
    // wrong. So a text match wins, and the index is only tried when the text
    // matched nothing — which is the case the index form exists for.
    if (accepted.some((a) => sameText(a, chosen))) {
      return { correct: true, needsAi: false, matched: chosen };
    }
    if (/^\d+$/.test(chosen.trim()) && Array.isArray(item.choices) && Number(chosen) < item.choices.length) {
      const byIndex = item.choices[Number(chosen)];
      return { correct: sameText(byIndex, item.answer), needsAi: false, matched: byIndex };
    }
    return { correct: false, needsAi: false, matched: chosen };
  }

  const demands = formDemands(item.prompt);
  const strict = demands.caseSensitive || demands.punctuationSensitive || demands.accentSensitive;
  for (const candidate of accepted) {
    if (!sameText(candidate, userAnswer)) continue;
    // Same words, but the prompt asks for exactly the form the rules forgive:
    // only an exact match in that dimension counts here; anything else is left
    // to the judge (or marked wrong where no judge applies).
    if (strict && !accepted.some((a) => strictForm(a, demands) === strictForm(userAnswer, demands))) {
      // Only the accent differs on an accent item: that is the whole question.
      if (demands.accentSensitive && !demands.caseSensitive && !demands.punctuationSensitive) {
        return { correct: false, needsAi: false, matched: null, breach: 'the accent the question asks for' };
      }
      break;
    }
    if (formBreach(userAnswer, demands)) break;
    return { correct: true, needsAi: false, matched: candidate };
  }

  // "x = 8" is a number as much as "8" is, so the numeric comparison sees past
  // the assignment too.
  const expected = numericValue(stripAssignment(numberText(item.answer)));
  const got = numericValue(stripAssignment(numberText(userAnswer)));
  if (expected !== null && got !== null) {
    const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-9);
    const sameValue = Math.abs(expected - got) <= tolerance;
    // The right value in the wrong form ("24/32" for "lowest terms") is wrong.
    const breach = sameValue ? formBreach(stripAssignment(numberText(userAnswer)), demands) : null;
    return { correct: sameValue && !breach, needsAi: false, matched: String(userAnswer), ...(breach ? { breach } : {}) };
  }

  return {
    correct: false,
    needsAi: aiGraded(item.format) && String(userAnswer || '').trim().length > 0,
    matched: null,
  };
}

// ── markup ──────────────────────────────────────────────────────────────────
/**
 * The only markup a piece of writing is allowed to carry.
 *
 * A learner's draft is the one place in this app where their own markup reaches
 * a rendered page, because a rich text editor produces HTML and everything else
 * here is escaped on the way out. So it is filtered on the way in, against this
 * list, and the list is deliberately short: formatting, and nothing else.
 *
 * What is absent is the point. No `script`, no `style`, no `a` with an `href`, no
 * `img` with a `src` — nothing that can fetch, execute, or style the page. Event
 * handlers are excluded by the same mechanism, since no attribute below is
 * allowed to exist.
 */
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark',
  'p', 'div', 'br', 'span', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
]);

/** Tags whose boundaries are a word break, so removing one does not join words. */
const BLOCK_TAGS = new Set(['p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'blockquote', 'pre', 'tr', 'table']);

/**
 * Container tags whose contents are structure the writing is made of, kept
 * because a list of reasons is a different thing from a run-on sentence. The
 * container itself still goes — `<ul>` around five `<li>`s is layout, and the
 * boundary between items is what matters.
 */
const KEPT_CONTAINERS = new Set(['ul', 'ol', 'li', 'blockquote', 'pre', 'code']);

/**
 * Tags outside the list are unwrapped rather than deleted, so their text survives
 * — a learner who pastes a link should keep the words, not the anchor. Their
 * *content* is kept but the element never reaches a page, and `script` and `style`
 * are dropped whole because their contents are code, not prose.
 */
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript',
  'template', 'svg', 'math', 'head', 'title', 'link', 'meta', 'base']);

/**
 * Reduce submitted markup to the formatting above, keeping the formatting.
 *
 * This is what a stored draft goes through on the way in. What comes out is
 * markup that is safe to render as-is: the allowed tags with no attributes, and
 * nothing else. A stored draft is the one place in this app where a learner's
 * own markup reaches a page, so this is where that promise is kept.
 *
 * It is deliberately not a general HTML parser. The input is whatever a
 * contenteditable produced plus whatever was typed into a devtools console, and
 * the guarantee needed is narrow: after this, nothing in the string can run.
 */
function stripTags(input) {
  let out = String(input == null ? '' : input);
  // Comments and declarations first: a stripped tag must not be able to
  // reassemble itself out of the leftovers of its own removal.
  out = out.replace(/<!--[\s\S]*?-->/g, '').replace(/<![^>]*>/g, '');

  // Elements whose contents are not prose go first, contents and all.
  for (const name of DROP_TAGS) {
    const both = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}\\s*>`, 'gi');
    out = out.replace(both, ' ');
    // A self-closing or unclosed one has no contents to keep anyway.
    out = out.replace(new RegExp(`</?${name}\\b[^>]*>`, 'gi'), ' ');
  }

  // Every remaining tag is reduced to its opening name, with no attributes. A
  // block tag leaves a space rather than nothing, because `<p>One</p><p>Two` is
  // two words and removing the tags outright would make it one. An inline tag
  // inside a word — as in `un<em>bel</em>ievable` — is kept instead, because
  // removing that one would join two halves of a word into a different word.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, name) => {
    const tag = String(name).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return BLOCK_TAGS.has(tag) ? ' ' : '';
    // A list or a quotation is part of what was written, so it stays. A
    // paragraph is not — two paragraphs are two blocks of text, and the reader
    // gets the break back as a space.
    if (KEPT_CONTAINERS.has(tag)) return match.startsWith('</') ? `</${tag}>` : `<${tag}>`;
    if (BLOCK_TAGS.has(tag)) return ' ';
    return match.startsWith('</') ? `</${tag}>` : `<${tag}>`;
  });

  return protectText(decodeEntities(out));
}

/**
 * Re-escape a decoded string so decoded angle brackets cannot become tags.
 *
 * It has to be selective, because by the time it runs the string already holds
 * the allowed tags written by `stripTags` and those must survive as markup.
 * Anything that is not one of ours is treated as text.
 */
function protectText(text) {
  const parts = String(text).split(/(<\/?[a-z][a-z0-9]*>)/gi);
  return parts.map((part) => {
    if (!part) return part;
    const match = /^(<\/?)([a-z][a-z0-9]*)>$/i.exec(part);
    if (match && ALLOWED_TAGS.has(match[2].toLowerCase())) return part;
    return part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }).join('');
}

/**
 * The same walk, but the writing without the markup at all.
 *
 * The grader reads this and the word count uses it, because neither wants a tag
 * in the evidence quote or a `<strong>` counted as a word. Same allowlist, same
 * guarantees, different output: here every tag becomes a word break.
 */
function toPlainText(input) {
  return stripTags(input)
    // Whatever inline formatting is left becomes a word break: `<strong>cat` and
    // `cat</strong>` are the same word with a tag on it.
    .replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    // A tag sitting next to punctuation leaves a space in front of it. Removed
    // here rather than in stripTags, which stores what the editor will show back.
    .replace(/\s+([.,;:!?'")\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
      try { return String.fromCodePoint(code); } catch { return ''; }
    }
    const hit = ENTITIES[String(body).toLowerCase()];
    return hit === undefined ? '' : hit;
  });
}

module.exports = {
  grade, normalize, numericValue, sameText, stripAccents, stripAssignment, formDemands, formBreach, strictForm, numberText,
  stripTags, toPlainText,
};
