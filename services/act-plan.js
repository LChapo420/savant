/**
 * Test-date plan: from the test date, the section scores and what the learner has mastered,
 * lay out a fixed number of sessions that fits the weeks left, with review timed to peak
 * at the test date.
 *
 * Pure arithmetic over what is already stored (services/act-scores.js, skill_states). No model,
 * no clock except the `now` passed in, nothing written. It picks skills, it does not estimate a score.
 *
 * Choosing: each ACT skill belongs to one section. A section's gap is the target minus the latest
 * recorded score in it (with no target, 36 minus the score, so the weakest section comes first; with no
 * score at all, every section counts the same). A skill's weight is its section's gap times how much
 * of it is not yet mastered. Science carries half weight because whether it enters the composite is
 * UNVERIFIED (docs/yc/SOURCES-TO-VERIFY.md).
 *
 * Laying out: the last REST_DAYS before the test are review only and the day before is a rest day.
 * Learn sessions go to the highest-weight skills first, one skill per session, spread over the weak sections;
 * a review session revisits the most overdue skill already worked, on the ladder's gaps (1, 3, 7, 14 days).
 */
const curriculum = require('../config/curriculum');
const act = require('./act-scores');
const mastery = require('./mastery');

// Config: one object, change here. Minutes are suggestions, not measured.
const CONFIG = {
  sessionsPerWeek: 4,
  minutes: 30,
  maxSessions: 60,       // a hard cap on the plan's length
  restDays: 1,           // idle days before the test
  reviewOnlyDays: 7,     // the final stretch is review, nothing new
  ladder: [1, 3, 7, 14], // days after a learn session at which it is reviewed
  masteredAt: 0.8,       // a skill at or above this needs review, not learning
  scienceWeight: 0.5,
};

// Which ACT section each skill in the ACT track serves.
const SECTION_OF = {
  subject_verb: 'english', pronoun_case: 'english', act_rhetoric: 'english', verb_tense: 'english',
  comma_use: 'english', sentence_struct: 'english', punctuation_basic: 'english', apostrophes: 'english',
  transitions: 'english', modifiers: 'english',
  detail_support: 'reading', vocab_context: 'reading', author_purpose: 'reading', main_idea: 'reading', inference: 'reading',
  act_science: 'science', act_data: 'science',
};
function sectionOf(skillId) { return SECTION_OF[skillId] || 'math'; }

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date, n) => day(Date.parse(`${date}T00:00:00Z`) + n * 86400000);

function actSkills() {
  const set = new Set();
  for (const g of curriculum.getTrack('act').grades) for (const s of g.skills) set.add(s);
  return [...set];
}

/** Latest score per section from the recorded tests (null when none). */
function latestBySection(scores) {
  const out = { english: null, math: null, reading: null, science: null };
  for (const row of scores) for (const s of act.SECTIONS) if (row[s] !== null && row[s] !== undefined) out[s] = row[s];
  return out;
}

/** Skills ranked by weight, highest first. `states` maps skill id to { mastery }. */
function rankSkills(profile, scores, states, config = CONFIG) {
  const latest = latestBySection(scores);
  const ceiling = profile.target || 36;
  const gap = {};
  for (const s of act.SECTIONS) gap[s] = latest[s] === null ? Math.max(1, ceiling - 18) : Math.max(1, ceiling - latest[s]);
  const rows = [];
  for (const id of actSkills()) {
    const section = sectionOf(id);
    const m = states[id] ? states[id].mastery || 0 : 0;
    const weight = gap[section] * (1 - Math.min(1, m)) * (section === 'science' ? config.scienceWeight : 1);
    rows.push({ skill_id: id, name: curriculum.skillName(id), section, mastery: Math.round(m * 100) / 100, weight });
  }
  return rows.sort((a, b) => b.weight - a.weight || (a.skill_id < b.skill_id ? -1 : 1));
}

/**
 * Order skills for learning: highest weight first, but each pick from a section shrinks that section's
 * remaining weights (by SPREAD) so the plan works the weak sections in turn rather than finishing one first.
 */
const SPREAD = 0.8;
function learningOrder(ranked, config = CONFIG) {
  const left = ranked.filter((r) => r.mastery < config.masteredAt).map((r) => ({ ...r }));
  const out = [];
  while (left.length) {
    left.sort((a, b) => b.weight - a.weight || (a.skill_id < b.skill_id ? -1 : 1));
    const top = left.shift();
    out.push(top);
    for (const r of left) if (r.section === top.section) r.weight *= SPREAD;
  }
  return out;
}

/**
 * Build the plan. Returns { status, ... }:
 *   no_date / past     nothing to lay out yet, with a reason string
 *   ok                 { test_date, days_left, weeks_left, sessions: [...], sections: [...] }
 * Each session: { date, kind: 'learn'|'review'|'rest'|'test', skills: [{skill_id,name,section}], minutes }.
 */
function build({ profile, scores, states, now = Date.now(), config = CONFIG }) {
  if (!profile || !profile.test_date) return { status: 'no_date', reason: 'Add your test date and the plan appears.' };
  const days = act.daysToTest(profile.test_date, now);
  if (days === null || days < 0) return { status: 'past', reason: 'Your test date has passed. Set the next one to get a new plan.' };

  const today = day(now);
  const ranked = rankSkills(profile, scores, states, config);
  const needLearning = learningOrder(ranked, config);
  const pick = (r) => ({ skill_id: r.skill_id, name: r.name, section: r.section });

  // Study days: every day from today to the day before rest, spread to sessionsPerWeek.
  const studyEnd = days - config.restDays - 1;        // last offset (from today) a session may fall on
  const slots = [];
  if (studyEnd >= 0) {
    const perWeek = Math.min(7, Math.max(1, config.sessionsPerWeek));
    const total = Math.min(config.maxSessions, Math.max(1, Math.round(((studyEnd + 1) * perWeek) / 7)));
    for (let i = 0; i < total; i++) slots.push(total === 1 ? 0 : Math.round((i * studyEnd) / (total - 1)));
  }
  const unique = [...new Set(slots)];

  const reviewFrom = days - config.reviewOnlyDays;    // offsets >= this are review only
  const sessions = [];
  const learned = [];   // { skill, offset }
  let next = 0;
  for (const off of unique) {
    const due = learned.filter((l) => l.pending.some((p) => p <= off)).sort((a, b) => a.pending[0] - b.pending[0]);
    const learnPhase = off < reviewFrom && next < needLearning.length;
    let kind; let skills;
    if (learnPhase && !due.some((l) => l.pending[0] <= off - 4)) {
      const r = needLearning[next++];
      skills = [pick(r)];
      kind = 'learn';
      learned.push({ skill: pick(r), pending: config.ladder.map((g) => off + g) });
    } else {
      // review the most overdue skill; if nothing has been learned yet, rework the weakest ones
      const chosen = due.slice(0, 1);
      chosen.forEach((l) => { l.pending = l.pending.filter((p) => p > off); });
      skills = chosen.length ? chosen.map((l) => l.skill) : ranked.slice(0, 2).map(pick);
      kind = 'review';
    }
    sessions.push({ date: addDays(today, off), kind, skills, minutes: config.minutes });
  }
  if (days - config.restDays >= 0 && config.restDays > 0 && days > 0) sessions.push({ date: addDays(today, days - 1), kind: 'rest', skills: [], minutes: 0 });
  sessions.push({ date: profile.test_date, kind: 'test', skills: [], minutes: 0 });

  const sections = {};
  for (const s of sessions) for (const k of s.skills) sections[k.section] = (sections[k.section] || 0) + 1;
  return {
    status: 'ok',
    test_date: profile.test_date,
    days_left: days,
    weeks_left: Math.round((days / 7) * 10) / 10,
    session_count: sessions.filter((s) => s.kind === 'learn' || s.kind === 'review').length,
    learn_count: sessions.filter((s) => s.kind === 'learn').length,
    unreached: Math.max(0, needLearning.length - next),
    sections: Object.keys(sections).map((s) => ({ section: s, sessions: sections[s] })),
    sessions,
  };
}

/** The plan for one learner, read from the db. */
function forUser(userId, now = Date.now()) {
  const profile = act.getProfile(userId);
  const states = mastery.statesFor(userId, actSkills());
  return build({ profile, scores: act.listScores(userId), states, now });
}

module.exports = { CONFIG, learningOrder, SECTION_OF, sectionOf, actSkills, latestBySection, rankSkills, build, forUser };
