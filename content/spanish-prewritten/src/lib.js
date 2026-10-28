/**
 * Helpers for the pre-written Spanish lessons.
 *
 * Each helper returns one block of a lesson as the app stores it in a
 * block_plans row: { block, purpose, data }, where `data` is exactly what the
 * block's renderer reads (its schema in public/engine/registry.json). Nothing
 * here adds a field a schema does not have: scripts/check-spanish-prewritten.js
 * validates every block against its schema and fails on any extra field.
 *
 * Checks are written as the fill-out writes them ({ prompt, choices, answer,
 * accepts, rationale, hint }) plus the layout's { skill, format, focus, after };
 * scripts/build-spanish-prewritten.js runs each through the app's own item check
 * (services/ai.js validateItem), as block-levels does for a written level.
 */

/** Plain prose: sections of paragraphs. */
function text(purpose, { eyebrow, title, subtitle, sections }) {
  return { block: 'Basic_TextBlock', purpose, data: clean({ eyebrow, title, subtitle, sections }) };
}

/** A rule card: one anchor sentence and its supporting points. */
function rule(purpose, { tag, ruleName, anchor, points }) {
  return { block: 'Theory_RuleCard', purpose, data: clean({ tag, ruleName, anchor, prerequisites: points }) };
}

/** A display table. */
function table(purpose, { caption, headers, rows, footnote, highlightColumn }) {
  rows.forEach((r, i) => {
    if (r.length !== headers.length) throw new Error(`table row ${i} has ${r.length} cells for ${headers.length} headers`);
  });
  return { block: 'Basic_DataTable', purpose, data: clean({ caption, headers, rows, footnote, highlightColumn }) };
}

/**
 * The audio script: every line a voice reads, in order, as the AudioWave
 * block's time-aligned cues. Timings are estimated from the syllables of each
 * line (about 0.22 s a syllable, plus a pause to repeat it), so a recorded clip
 * of the same script lines up with the highlights.
 */
function audio(purpose, { title, subtitle, lines, cueNote, repeatGap = 1.5 }) {
  let t = 0.3;
  const cues = lines.map((line) => {
    const syllables = (String(line).toLowerCase().match(/[aeiouáéíóúü]+/g) || []).length;
    const speak = Math.max(0.8, Math.round(syllables * 0.22 * 10) / 10);
    const cue = { text: line, start: round1(t), end: round1(t + speak) };
    t += speak + repeatGap;
    return cue;
  });
  return {
    block: 'Concept_AudioWave',
    purpose,
    data: clean({
      title, subtitle, cueNote, duration: round1(t), cues,
      playLabel: 'Play', pauseLabel: 'Pause',
      unavailableLabel: 'Audio is not available here: read each line aloud yourself, slowly, then at normal speed.',
    }),
  };
}

/** Multiple choice with feedback on every option. options: [{ text, why }], correct: index. */
function mc(purpose, { prompt, passage, passageLabel, options, correct, correctMsg }) {
  const ids = 'abcdef'.split('');
  const byOption = {};
  options.forEach((o, i) => { if (o.why) byOption[ids[i]] = o.why; });
  return {
    block: 'Interact_MultipleChoice',
    purpose,
    data: clean({
      prompt, passage, passageLabel,
      options: options.map((o, i) => ({ id: ids[i], text: o.text })),
      correctOptionId: ids[correct],
      feedback: { correct: correctMsg || 'Right.', incorrect: 'Not quite. Read the feedback and try again.', byOption },
    }),
  };
}

/**
 * Fill-the-blank passage. parts: strings (text) and blanks
 * { options: [...], correct: i, note } in reading order.
 */
function fill(purpose, { title, instructions, parts, correctMsg, incorrectMsg }) {
  let n = 0;
  const perBlank = {};
  const segments = parts.map((p) => {
    if (typeof p === 'string') return { kind: 'text', text: p };
    n += 1;
    const id = `b${n}`;
    if (p.note) perBlank[id] = p.note;
    if (!(p.correct >= 0 && p.correct < p.options.length)) throw new Error(`blank ${id}: correct index out of range`);
    return { kind: 'blank', id, options: p.options, correctIndex: p.correct };
  });
  return {
    block: 'Recall_FillTheBlank',
    purpose,
    data: clean({
      title, instructions, segments,
      feedback: { correct: correctMsg || 'All correct.', incorrect: incorrectMsg || 'At least one choice is off. Change it and check again.' },
      perBlankFeedback: Object.keys(perBlank).length ? perBlank : undefined,
    }),
  };
}

/** Matching: pairs [[left, right, hint?]]; the right column is shown in a fixed shuffled order. */
function match(purpose, { title, instruction, pairs, order, completionMessage }) {
  const terms = pairs.map((p, i) => clean({ id: `t${i + 1}`, label: p[0], hint: p[2] }));
  const defs = pairs.map((p, i) => ({ id: `d${i + 1}`, label: p[1] }));
  const shown = (order || rotate(defs.map((_, i) => i))).map((i) => defs[i]);
  return {
    block: 'Interact_TermConnect',
    purpose,
    data: clean({
      title, instruction, terms, definitions: shown,
      matches: pairs.map((_, i) => ({ termId: `t${i + 1}`, definitionId: `d${i + 1}` })),
      completionMessage: completionMessage || 'All matched.',
    }),
  };
}

/** Sorting into 2-3 buckets. cats: [{ id, label, hint }], items: [[text, catId, detail?]]. */
function sort(purpose, { title, instruction, cats, items }) {
  const known = new Set(cats.map((c) => c.id));
  items.forEach(([t, c]) => { if (!known.has(c)) throw new Error(`sort item "${t}" names unknown bucket ${c}`); });
  return {
    block: 'Interact_CategorySort',
    purpose,
    data: clean({
      title, instruction,
      categories: cats.map((c) => clean({ id: c.id, label: c.label, hint: c.hint })),
      items: items.map(([t, c, d], i) => clean({ id: `i${i + 1}`, text: t, detail: d, correctCategoryId: c })),
      shuffle: true,
    }),
  };
}

/** Build a sentence from chips. words: the correct order; shown in a fixed scrambled order. */
function scramble(purpose, { prompt, words, contextLabel, hintText, feedbackCorrect, order }) {
  const tokens = words.map((w, i) => ({ id: `w${i + 1}`, text: w }));
  const shown = (order || scrambleOrder(words.length)).map((i) => ({ id: `w${i + 1}`, text: words[i], correctIndex: i }));
  return {
    block: 'Interact_SentenceScramble',
    purpose,
    data: clean({
      prompt, contextLabel, tokens, chips: shown,
      feedbackCorrect: feedbackCorrect || `Right: ${words.join(' ')}`,
      feedbackReset: 'That chip comes later. Start again from the first word.',
      clearOnMistake: true, hintAfterAttempts: 2, hintText,
    }),
  };
}

/** The most common mistake, as a question with its reveal. */
function trap(purpose, { question, context, choices, correct, traps, label, why, reasoning, tip, trapReasons, difficulty }) {
  return {
    block: 'Trap_CommonError',
    purpose,
    data: clean({
      question, context, choices, correctIndex: correct, commonErrorLabel: label, trapChoiceIndexes: traps,
      trapReasons, whyIntuitionFailed: why, correctReasoning: reasoning, recoveryTip: tip, difficulty: difficulty || 'Trap',
    }),
  };
}

/** Cautions: exceptions and traps, with wrong and right examples. */
function caution(purpose, { conceptLabel, flagTitle, flagIntro, cautions, footerNote }) {
  return { block: 'Concept_CautionFlag', purpose, data: clean({ conceptLabel, flagTitle, flagIntro, cautions: cautions.map(clean), footerNote }) };
}

/** Self-test cards that reveal on tap. cards: [[prompt, answer, note?]]. */
function reveal(purpose, { title, subtitle, cards }) {
  return {
    block: 'Interact_ClickToReveal',
    purpose,
    data: clean({
      title, subtitle,
      cards: cards.map(([p, a, n], i) => clean({ promptLabel: `${i + 1}`, prompt: p, answer: a, note: n })),
      revealLabel: 'Tap to check', revealedLabel: 'Shown',
    }),
  };
}

/** A summary sheet. rows: [[key, value, detail?]]. */
function cheat(purpose, { title, subtitle, rows }) {
  return {
    block: 'Memory_CheatSheet',
    purpose,
    data: clean({ title, subtitle, rows: rows.map(([k, v, d]) => clean({ key: k, value: v, detail: d })) }),
  };
}

/** Sentence x-ray: source marks each term's place with {{...}}; terms [[label, mark, note]]. */
function xray(purpose, { prompt, source, terms }) {
  const marks = [...source.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]);
  terms.forEach(([label, mark]) => {
    if (!marks.includes(mark)) throw new Error(`xray term "${label}" marks "${mark}", which is not marked in the source`);
  });
  if (marks.length !== terms.length) throw new Error(`xray: ${marks.length} marks for ${terms.length} terms`);
  return {
    block: 'Interact_XRay',
    purpose,
    data: { prompt, source, terms: terms.map(([label, mark, note], i) => clean({ id: `x${i + 1}`, label, mark, note })) },
  };
}

/** Two columns side by side. */
function contrast(purpose, { title, subtitle, left, right, footnote }) {
  const col = (c, tone) => clean({ heading: c.heading, tone: c.tone || tone, items: c.items.map((it) => clean(Array.isArray(it) ? { label: it[0], text: it[1], example: it[2] } : it)) });
  return { block: 'Theory_ContrastSplit', purpose, data: clean({ title, subtitle, leftColumn: col(left, 'success'), rightColumn: col(right, 'caution'), footnote }) };
}

/** The closing takeaway banner. */
function takeaway(purpose, { topic, takeaway: line, terms, footerNote }) {
  return {
    block: 'Concept_TakeawayBadge',
    purpose,
    data: clean({ badgeLabel: 'Key takeaway', topic, takeaway: line, terms, footerNote, accent: 'success', icon: 'check' }),
  };
}

/** Two choices to think about before the lesson starts. */
function dilemma(purpose, { eyebrow, prompt, context, left, right, footerNote }) {
  return {
    block: 'Hook_Dilemma',
    purpose,
    data: clean({
      eyebrow, prompt, context,
      leftChoice: clean({ label: 'OPTION A', title: left[0], body: left[1], tone: 'accent' }),
      rightChoice: clean({ label: 'OPTION B', title: right[0], body: right[1], tone: 'accent' }),
      versusLabel: 'OR', footerNote,
    }),
  };
}

// ── checks ────────────────────────────────────────────────────────────────
/** A graded multiple-choice check: four choices, `answer` is one of them. */
function check(skill, { prompt, choices, answer, rationale, hint, focus, after }) {
  return { skill, format: 'multiple_choice', prompt, choices, answer, accepts: [], rationale, hint, focus, after };
}

/**
 * A graded typed check. The grader forgives case, accents, trailing punctuation
 * and a leading subject pronoun, but not a leading ¿ or ¡, so a form without
 * them is accepted as well.
 */
function typed(skill, { prompt, answer, accepts = [], rationale, hint, focus, after }) {
  const all = [...accepts];
  for (const a of [answer, ...accepts]) {
    const bare = String(a).replace(/^[¿¡]\s*/, '');
    if (bare !== a) all.push(bare);
  }
  return { skill, format: 'type_in', prompt, choices: [], answer, accepts: [...new Set(all)].filter((a) => a !== answer), rationale, hint, focus, after };
}

// ── plumbing ──────────────────────────────────────────────────────────────
function round1(n) { return Math.round(n * 10) / 10; }

/** Drop undefined fields, so optional fields that were not written are absent rather than null. */
function clean(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

/** A fixed, readable order that is not the answer order: 1 3 5 ... then 0 2 4 ... */
function rotate(ix) {
  if (ix.length < 2) return ix;
  return [...ix.filter((i) => i % 2 === 1), ...ix.filter((i) => i % 2 === 0)];
}

function scrambleOrder(n) {
  const order = [...Array(n).keys()].reverse();
  if (n > 3) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

module.exports = {
  text, rule, table, audio, mc, fill, match, sort, scramble, trap, caution, reveal, cheat, xray, contrast, takeaway, dilemma,
  check, typed,
};
