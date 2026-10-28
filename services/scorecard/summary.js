/**
 * A learner's learning style in plain language, written from the scorecard.
 *
 * Deterministic on purpose: the summary says only what the evidence says, and
 * the same scorecard always reads the same way. Each line names the stat, the
 * score and how sure the app is, so a reader can tell a firm finding from an
 * early impression.
 */
const scorecard = require('./index');
const { STATS, CATEGORIES } = require('./stats');

const FIRM = 50;      // confidence at which a finding is stated plainly
const TENTATIVE = 25; // below this, a stat is not mentioned at all
const EDGE = 15;      // distance from 50 that is worth mentioning

/**
 * @returns {{ headline: string, paragraphs: string[], strongest: object[], unknown: number }}
 */
function summarize(card, { trackId = null } = {}) {
  const read = STATS.map((stat) => ({ stat, ...scorecard.read(card, stat.id, { trackId }) }));
  const notable = read
    .filter((r) => r.confidence >= TENTATIVE && Math.abs(r.score - 50) >= EDGE)
    .sort((a, b) => (Math.abs(b.score - 50) * b.confidence) - (Math.abs(a.score - 50) * a.confidence));
  const overall = scorecard.overallConfidence(card);
  const unknown = read.filter((r) => r.confidence < TENTATIVE).length;

  const headline = !notable.length
    ? `Not enough evidence yet for a learning-style summary (${overall}% overall confidence; ${unknown} of 100 stats still unmeasured).`
    : `${notable.length} clear tendencies found so far, ${overall}% overall confidence, ${unknown} of 100 stats still unmeasured.`;

  const paragraphs = CATEGORIES.map((cat) => {
    const lines = notable.filter((r) => r.stat.category === cat.id).slice(0, 4).map((r) => {
      const leaning = r.score >= 50 ? r.stat.high : r.stat.low;
      const hedge = r.confidence >= FIRM ? '' : 'probably ';
      return `${hedge}${leaning} (${r.stat.name.toLowerCase()} ${r.score}, ${r.confidence}% sure)`;
    });
    return lines.length ? `${cat.name}: ${lines.join('; ')}.` : null;
  }).filter(Boolean);

  return {
    headline,
    paragraphs,
    strongest: notable.slice(0, 8).map((r) => ({
      id: r.stat.id, name: r.stat.name, score: r.score, confidence: r.confidence,
      reads: r.score >= 50 ? r.stat.high : r.stat.low,
    })),
    unknown,
    overall,
  };
}

module.exports = { summarize };
