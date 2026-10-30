/* ACT Writing: the four ACT domains as a rubric in the shape the English track's essay marking already uses, and a
 * report of a marked attempt by domain.
 *
 * The rubric is `criteria` for an essays row (services/essays.js): each criterion has four level descriptors, and
 * `ai.gradeEssay` marks each 1 to 4. `domainReport` turns those marks into one line per domain on the 2 to 12 scale
 * that ACT reports domains on. The scale and the domain names are UNVERIFIED until checked on act.org (see
 * docs/yc/SOURCES-TO-VERIFY.md); the numbers are an estimate by Savant, never an ACT score, and say so.
 * No model is called here; the marking itself stays in essays.grade.
 */

const SCALE = { min: 2, max: 12 };

const DOMAINS = [
  { id: 'ideas_analysis', name: 'Ideas and Analysis', skill_id: 'act_writing_ideas',
    levels: [
      'No clear position on the issue, or the position is not tied to the prompt.',
      'States a position, but the perspectives are barely engaged and the analysis is thin.',
      'States a clear position and engages other perspectives, with some analysis of how they relate.',
      'A thoughtful position that weighs other perspectives and says what follows from them.',
    ] },
  { id: 'development_support', name: 'Development and Support', skill_id: 'act_writing_support',
    levels: [
      'Claims are not explained or supported.',
      'Some claims are explained, but the reasons and examples are general or off the point.',
      'Claims are explained with relevant reasons and examples.',
      'Claims are developed with specific, well-chosen reasons and examples that carry the argument.',
    ] },
  { id: 'organization', name: 'Organization', skill_id: 'act_writing_organization',
    levels: [
      'No order a reader can follow.',
      'A basic order, but ideas jump and the transitions are missing or mechanical.',
      'A clear order with transitions that connect the ideas.',
      'Each paragraph does one job, and the order builds the argument.',
    ] },
  { id: 'language_use', name: 'Language Use and Conventions', skill_id: 'act_writing_language',
    levels: [
      'Errors in grammar and word choice often block the meaning.',
      'Frequent errors, but the meaning can be recovered.',
      'Mostly correct, with a clear and suitable style.',
      'Precise word choice and varied sentences, with only rare slips.',
    ] },
];

/** The rubric as the `criteria` of an essays row. A fresh copy each call, so a caller may edit it. */
function buildRubric() {
  return DOMAINS.map((d) => ({
    skill_id: d.skill_id,
    skill_name: d.name,
    name: d.name,
    introduced: false,
    levels: d.levels.slice(),
  }));
}

/** A mark of 1 to 4 on a 2 to 12 domain scale: 1 gives 2, 4 gives 12. */
function toDomainScale(score) {
  const s = Math.min(4, Math.max(1, Number(score)));
  return Math.round(SCALE.min + ((s - 1) / 3) * (SCALE.max - SCALE.min));
}

/**
 * One line per domain from a marked attempt ({ criteria: [{ index, score, evidence, next_step }] }, the shape
 * `essays.grade` returns). A criterion that was not marked (rule fallback, score null) gives a null score, not a
 * zero. `estimate` is the mean of the marked domains, or null when none was marked.
 */
function domainReport(marked) {
  const byIndex = new Map(((marked && marked.criteria) || []).map((c) => [c.index, c]));
  const domains = DOMAINS.map((d, i) => {
    const c = byIndex.get(i);
    const marked1to4 = c && Number.isFinite(c.score) ? c.score : null;
    return {
      id: d.id,
      name: d.name,
      score: marked1to4 === null ? null : toDomainScale(marked1to4),
      evidence: (c && c.evidence) || null,
      next_step: (c && c.next_step) || null,
    };
  });
  const scored = domains.filter((d) => d.score !== null);
  const estimate = scored.length ? Math.round((scored.reduce((n, d) => n + d.score, 0) / scored.length) * 10) / 10 : null;
  return {
    domains,
    estimate,
    scale: `${SCALE.min} to ${SCALE.max}`,
    note: 'An estimate from Savant\'s marking, not an ACT score.',
  };
}

module.exports = { SCALE, DOMAINS, buildRubric, toDomainScale, domainReport };
