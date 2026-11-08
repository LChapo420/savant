/**
 * Test-first skipping with proof (docs/UPLOAD-4X.md lever 2). UPLOAD_TESTFIRST=1 (default off).
 *
 * The starting check of an uploaded course (material-path.nextPlacement) already skips what a learner answers right. This tightens what counts as proof and adds a recheck:
 *   - a skill is skipped only on `need` right answers (default 2) with no miss on it, and at least one given as "sure". A wrong answer given as "sure" is a misconception: that skill is
 *     never skipped and goes to the learner as remediation;
 *   - a skipped skill comes back for a recheck after RECHECK_DAYS, sooner than a skill learned the long way, and a failed recheck reopens it through the ordinary review rule;
 *   - the walk keeps asking (one more question on each skill it would skip) until a candidate has its `need` right answers or no unused question is left.
 * Off, nothing here is called. Pure functions, no I/O. The simulated cost and false-skip rate are in docs/UPLOAD-4X.md.
 */
'use strict';

const PARAMS = { need: 2, recheckDays: 3 };
const enabled = () => process.env.UPLOAD_TESTFIRST === '1';
const CONFIDENCE = ['sure', 'think', 'guess'];
const cleanConfidence = (c) => (CONFIDENCE.includes(c) ? c : null);

/** answers: [{ correct, confidence? }] on one skill. { skip, right, wrong, sure, misconception, why } */
function proof(answers, p = PARAMS) {
  const a = answers || [];
  const right = a.filter((x) => x.correct).length;
  const wrong = a.length - right;
  const sure = a.filter((x) => x.correct && x.confidence === 'sure').length;
  const misconception = a.some((x) => !x.correct && x.confidence === 'sure');
  let why = null;
  if (misconception) why = 'a wrong answer given as sure';
  else if (wrong > 0) why = 'a miss on this skill';
  else if (right < p.need) why = `${right} of ${p.need} right answers`;
  else if (!sure) why = 'no answer given as sure';
  return { skip: !why, right, wrong, sure, misconception, why };
}

/** First recheck of a skipped skill: an ISO time. */
const recheckAt = (now, p = PARAMS) => new Date(now + p.recheckDays * 86400000).toISOString();

module.exports = { PARAMS, CONFIDENCE, enabled, cleanConfidence, proof, recheckAt };
