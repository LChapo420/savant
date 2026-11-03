/**
 * Wording a Spanish placement question must not have (used by generate-spanish-unit-placement.js):
 *   - the answer quoted in the prompt (a "which form of comer? 'comía'" question gives itself away);
 *   - the options written into the prompt (so the answer is always the first lettered one);
 *   - lettered options ("A) ...") inside the options.
 * Returns '' for a clean question, otherwise the reason.
 */
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

function leaks(q) {
  const p = ` ${norm(q.prompt)} `;
  const a = norm(q.answer);
  if (a.length >= 3 && p.includes(` ${a} `) && !/\b(mean|means|translate|english)\b/.test(p)) return 'answer in prompt';
  if ((q.choices || []).some((c) => /^\(?[A-Da-d][).:]\s/.test(String(c).trim()))) return 'lettered option';
  if (/(^|\s)A[).]\s.*\sB[).]\s/.test(q.prompt)) return 'options in prompt';
  return '';
}

module.exports = { leaks };
