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
// UNVERIFIED until checked on act.org (docs/yc/SOURCES-TO-VERIFY.md); also in services/act-timing.js SECTIONS.writing.
const MINUTES = 40;

// Practice prompts in the shape of an ACT issue prompt: a short situation, then a question to take a position on.
// Written for Savant, not copied from any test. Each attempt draws the next one, so a rewrite gets a new topic.
const PROMPTS = [
  'Many schools are moving some lessons online so students can learn at their own pace. Some people say this lets every student reach their best. Others say students learn more from being in a room together. Write an essay that states your position on how far schools should rely on online lessons. You may take one of the views above or give your own. Explain your reasoning and give examples.',
  'Cities are adding more bike lanes and fewer car lanes to cut traffic and pollution. Supporters say it makes cities healthier and safer. Critics say it makes life harder for people who have no choice but to drive. Write an essay that states your position on whether cities should give up road space for bikes. Explain your reasoning and give examples.',
  'Some employers now let people work from home most of the week. One view is that people do better work with the freedom to arrange their own day. Another is that teams build ideas and trust only when they work side by side. Write an essay that states your position on whether most jobs should be done from home. Explain your reasoning and give examples.',
  'Public libraries are changing, with fewer shelves of books and more rooms for computers, classes and meetings. Some people see this as a loss of what a library is for. Others see it as a library finally serving what a community needs. Write an essay that states your position on how libraries should spend their space. Explain your reasoning and give examples.',
];

/** The practice prompt for the nth attempt (1-based), wrapping round the bank. */
function promptFor(attempt) {
  const n = Math.max(1, Math.floor(Number(attempt)) || 1);
  return PROMPTS[(n - 1) % PROMPTS.length];
}

/** The payload of an essays row for a timed ACT Writing attempt. */
function payloadFor(attempt) {
  return {
    prompt: promptFor(attempt),
    guidance: `Planning and writing: ${MINUTES} minutes on the real test. Take a position, deal with at least one other view, and support each claim with a reason or example. You are marked on four domains.`,
    criteria: buildRubric(),
    source: 'act_writing',
  };
}

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

module.exports = { SCALE, MINUTES, PROMPTS, DOMAINS, promptFor, payloadFor, buildRubric, toDomainScale, domainReport };
