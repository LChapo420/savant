/**
 * Does a multiple-choice question's own explanation describe its keyed option?
 *
 * The 2026-10-23 content fact audit (curriculum-build/CONTENT-FACT-AUDIT.md) found
 * 119 stored game questions whose answer key was wrong while the question's own
 * explanation described the right option: the writer reasoned correctly and then
 * keyed a different slot. This is the audit's deterministic check (scratchpad
 * fact-audit/keyalign.js), made reusable for every place a model writes a
 * multiple-choice question with an explanation (game payloads, block-plan checks,
 * lesson check questions, model-written items):
 *
 *   - every option is scored by the explanation's words it shares, counting only
 *     words that separate the options (a word in every option says nothing) and
 *     weighting a word by 1 / (how many options carry it);
 *   - the explanation quoting one option verbatim, and not the key, is a strong sign.
 *
 * A flag is NOT a verdict. The audit found 86% of judged flags were real errors, so
 * 14% were not: a flagged question goes to a blind re-key by an independent judge
 * (see `rekeyFlagged`), and is kept when that judge, not told the key, picks it.
 * Only the code checks here are deterministic; the judge is injected by the caller
 * so this module never reaches a provider on its own.
 */

const STOP = new Set(('a an the of to in on and or but for with is are was were be been it its this that these those as at by from not no so if than then into because which who whom what when where while about only also can could would should will shall do does did has have had he she they we you i your their his her our my me us them there here one two three').split(' '));

const words = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether `lowText` contains the option as a whole phrase (not inside a longer word or sum). */
function mentions(lowText, option) {
  const o = String(option).toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.]$/, '');
  if (!o) return false;
  return new RegExp(`(^|[^a-z0-9'])${esc(o)}(?![a-z0-9]|\\s*[-+*/=]\\s*\\d)`).test(lowText);
}
const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/** The keyed option's index, from answerIndex or from the answer text. -1 when neither fits. */
function keyIndexOf(q) {
  const choices = (q.choices || []).map(squash);
  if (Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < choices.length) return q.answerIndex;
  if (Number.isInteger(q.answer_index) && q.answer_index >= 0 && q.answer_index < choices.length) return q.answer_index;
  if (q.answer != null) return choices.indexOf(squash(q.answer));
  return -1;
}

/**
 * @param {{choices: string[], answerIndex?: number, answer?: string, explanation?: string, rationale?: string}} q
 * @returns {{flagged: boolean, keyIndex: number, pointsTo: number|null, quotedOther: boolean, scores: number[], reason: string|null}}
 */
function keyAgreement(q) {
  const none = (keyIndex = -1) => ({ flagged: false, keyIndex, pointsTo: null, quotedOther: false, scores: [], reason: null });
  if (!q || !Array.isArray(q.choices) || q.choices.length < 2) return none();
  const explanation = String(q.explanation || q.rationale || '');
  if (!explanation.trim()) return none();
  const choices = q.choices.map((c) => String(c == null ? '' : c));
  const ki = keyIndexOf(q);
  if (ki < 0) return none();

  const sets = choices.map((c) => new Set(words(c)));
  const df = {};
  sets.forEach((s) => s.forEach((w) => { df[w] = (df[w] || 0) + 1; }));
  const ex = new Set(words(explanation));
  const scores = sets.map((s) => [...s].filter((w) => ex.has(w) && df[w] < choices.length).reduce((a, w) => a + 1 / df[w], 0));
  const top = Math.max(...scores);
  const best = scores.indexOf(top);
  const low = explanation.toLowerCase();
  // An option counts as quoted only as a whole phrase: "x = 15" is not quoted by
  // "x = 15 - 8 = 7", and "run" is not quoted by "running".
  const quoted = choices.map((c) => c.trim().length > 3 && mentions(low, c));
  const quotedOther = quoted.some((x, j) => x && j !== ki) && !quoted[ki];
  const outscored = best !== ki && top >= 1 && top >= 2 * (scores[ki] || 0) + 0.5;
  if (!outscored && !quotedOther) return { ...none(ki), scores };
  // An explanation that names the keyed option itself is discussing it (often
  // contrasting it with a distractor it also names): measured on 747 bank items,
  // this veto takes false flags from 41 to 2 and costs 1 of 120 confirmed wrong keys.
  if ((choices[ki].trim().length >= 2 || /^\d$/.test(choices[ki].trim())) && mentions(low, choices[ki])) return { ...none(ki), scores, veto: 'the explanation names the key' };
  const pointsTo = quotedOther ? quoted.findIndex((x, j) => x && j !== ki) : best;
  return {
    flagged: true,
    keyIndex: ki,
    pointsTo,
    quotedOther,
    scores,
    reason: quotedOther
      ? `the explanation quotes option ${pointsTo + 1}, not the keyed option ${ki + 1}`
      : `the explanation describes option ${pointsTo + 1} (score ${scores[pointsTo].toFixed(2)}) more than the keyed option ${ki + 1} (score ${(scores[ki] || 0).toFixed(2)})`,
  };
}

/**
 * Settle flagged questions with a blind re-key: the judge sees the question and
 * the options, never the key or the explanation, and picks one. A question is kept
 * when the judge picks its key; it is rejected (to be rewritten, never silently
 * dropped) when the judge picks another option or cannot answer.
 *
 * @param {object[]} questions  each {prompt, choices, answerIndex|answer, explanation|rationale}
 * @param {{judge: (batch: {prompt: string, choices: string[]}[]) => Promise<(number|null)[]>}} opts
 *        `judge` answers blind and returns one chosen index (or null) per question.
 * @returns {Promise<{index: number, flag: object, verdict: 'clean'|'kept'|'rejected'|'unjudged', judgePicked: number|null}[]>}
 */
async function rekeyFlagged(questions, { judge } = {}) {
  const out = questions.map((q, index) => ({ index, flag: keyAgreement(q), verdict: 'clean', judgePicked: null }));
  const flagged = out.filter((r) => r.flag.flagged);
  if (!flagged.length) return out;
  let picks = [];
  if (typeof judge === 'function') {
    try {
      picks = await judge(flagged.map((r) => ({ prompt: String(questions[r.index].prompt || ''), choices: questions[r.index].choices.map(String) })));
    } catch {
      picks = [];
    }
  }
  flagged.forEach((r, i) => {
    const pick = Array.isArray(picks) && Number.isInteger(picks[i]) ? picks[i] : null;
    r.judgePicked = pick;
    if (pick == null) r.verdict = 'unjudged';
    else r.verdict = pick === r.flag.keyIndex ? 'kept' : 'rejected';
  });
  return out;
}

module.exports = { keyAgreement, rekeyFlagged, keyIndexOf, words };
