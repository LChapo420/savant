/**
 * From an onboarding session's estimates to scorecard evidence.
 *
 * The scorecard moves a measure's score toward an observation's value by weight / (mass + strength): with a blank card (score 50, strength 1)
 * and weight P, one observation lands exactly on the Bayesian posterior mean (50 + P/(1+P) x (reading - 50)). So each measure is fed as ONE
 * designed-test observation whose value is the data-only reading and whose weight is the precision the session gathered on it (P, in units of
 * the population's own spread), capped at the scorecard's own designed-test cap. A measure the session never read is not fed at all.
 *
 * A deeper retake feeds only the precision it ADDED (P now minus P already fed), so the learned history on the card is kept and the new
 * evidence is combined with it by the scorecard's own rules; nothing is replaced.
 */
'use strict';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TEST_CAP = 4;   // services/scorecard/index.js TEST_BATCH_CAP

/**
 * @param {Object<string,{dataValue:number,P:number}>} est  model.estimates() output
 * @param {Object<string,number>} [alreadyFed] precision already fed per measure by earlier sessions
 */
function observations(est, alreadyFed = {}, { tailK = Number(process.env.DAILY_TAIL_K || 0) } = {}) {
  const out = [];
  for (const [stat, e] of Object.entries(est)) {
    let added = e.P - (alreadyFed[stat] || 0);
    if (!(added > 0.02)) continue;
    // Heavier-tailed prior (off by default, tailK 0): a reading far from the middle is trusted more, because a learner at a tail is exactly who a
    // normal prior with spread 17 pulls in too far. The weight grows by tailK for each population spread beyond one, but only as far as the data's own precision.
    if (tailK > 0) added *= 1 + tailK * Math.max(0, Math.min(2, Math.abs(e.dataValue - 50) / 17 - 1));
    out.push({
      stat,
      value: Math.round(clamp(e.dataValue, 0, 100) * 100) / 100,
      weight: Math.round(Math.min(TEST_CAP, added) * 1000) / 1000,
      test: true,
      note: 'onboarding baseline',
    });
  }
  return out;
}

/** The precision fed per measure, as stored on the profile, after a session. */
function fedAfter(est, alreadyFed = {}) {
  const next = { ...alreadyFed };
  for (const [stat, e] of Object.entries(est)) if (e.P > (next[stat] || 0)) next[stat] = Math.round(e.P * 1000) / 1000;
  return next;
}

module.exports = { observations, fedAfter, TEST_CAP };
