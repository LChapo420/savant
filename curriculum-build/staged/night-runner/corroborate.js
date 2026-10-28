const path = require('path');
const { keyAgreement } = require(path.join(__dirname, '..', '..', '..', 'services', 'key-agreement.js'));

/**
 * The earlier audit's corroboration for a wrong key (section 5): the question's own
 * explanation describes the option both judges say is correct. A code check
 * (services/key-agreement.js), so it counts as the source when no passage settles it.
 */
function ownExplanation(r) {
  if (!r.choices || r.alt == null || !r.explanation) return null;
  const ka = keyAgreement({ choices: r.choices, answer: r.key, explanation: r.explanation });
  return ka.flagged && ka.pointsTo === r.alt ? `the item's own explanation describes option (${r.alt}), not the key (code check: ${ka.reason})` : null;
}
function corroborate(r) {
  if (!/no source settles it/.test(r.outcome)) return r;
  const own = ownExplanation(r);
  if (!own) return r;
  return { ...r, outcome: 'confirmed wrong: both judges + the item\'s own explanation', source_check: { ...r.source_check, method: 'key-agreement code check (the explanation describes the correct option)', source: 'own explanation', detail: own } };
}

module.exports = { corroborate, ownExplanation };
