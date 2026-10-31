/**
 * "Learn from your own material": what THIS learner still needs (S12). Pure functions over a built course and the
 * learner's material_progress row; nothing here touches the database or a model.
 *
 * Every output that picks items for a learner asks this first, so they all agree on who needs what:
 *
 *   known   mastered and not yet due for review, nothing missed outstanding: skipped (this is the placement skip,
 *           07-M3, kept alive by the review clock, 07-M9).
 *   due     mastered and the review clock (the learner's own half-life, 07-M9) says it is time: a short review.
 *   fix     being remediated, or has questions the learner missed (07-M6): the missed ones come first.
 *   learning  started, not mastered: more practice, pitched at the skill's tier (07-M4).
 *   new     never touched (or the starting check has not run): everything is treated as unknown, nothing is skipped.
 *
 * A skill that is not `known` always gets at least one item, so no skill the learner does not know is left out;
 * known skills are the only ones skipped. Items per skill are fixed small numbers (ITEMS), capped by the questions
 * the skill has, so a learner who knows half the material is asked about half as much.
 */
const DAY = 86400000;
const ITEMS = { due: 2, fix: 3, learning: 3, new: 3 };
const ORDER = ['fix', 'due', 'learning', 'new'];

/** One skill's need from its progress state. `placed` false means no starting check yet: nothing is known. */
function needOf(st, placed, now) {
  const s = st || {};
  const missed = (s.wrong || []).length > 0;
  if (s.status === 'mastered') {
    if (s.remediate || missed) return 'fix';
    if (s.due && Date.parse(s.due) <= now) return 'due';
    return 'known';
  }
  if (s.remediate || missed) return 'fix';
  if (s.status && s.status !== 'new') return 'learning';
  return 'new';
}

/**
 * The plan: { skills: [{ id, need, items, tier, missed }], total, skipped: [ids], next_due }, most urgent first.
 * `r` may be null (no progress yet): every skill is new.
 */
function plan(course, r, now = Date.now(), spec = null) {
  // The learner's own number of retrieval checks (services/learning-spec.js lesson.retrievalChecks, 3 by default)
  // scales the questions per skill; every skill that is not known still gets at least one.
  const scale = spec && !spec.isDefault ? spec.lesson.retrievalChecks / 3 : 1;
  const progress = (r && r.skills) || {};
  const placed = !!(r && r.placed);
  const skills = [];
  const skipped = [];
  for (const s of course.skills || []) {
    const qs = (s.questions || []).length;
    if (!qs) continue;
    const st = progress[s.id];
    const need = needOf(st, placed, now);
    if (need === 'known') { skipped.push(s.id); continue; }
    const tier = need === 'due' ? Math.max(2, (st && st.tier) || 2) : ((st && st.tier) || 1);
    skills.push({ id: s.id, need, items: Math.min(Math.max(1, Math.round(ITEMS[need] * scale)), qs), tier, missed: ((st && st.wrong) || []).length });
  }
  skills.sort((a, b) => ORDER.indexOf(a.need) - ORDER.indexOf(b.need) || b.missed - a.missed);
  const upcoming = skipped.map((id) => progress[id] && progress[id].due).filter(Boolean).sort()[0] || null;
  return { skills, total: skills.reduce((n, s) => n + s.items, 0), skipped, next_due: upcoming };
}

/**
 * The questions of one planned skill, best first: missed ones, then questions at or above the skill's tier (nearest
 * tier first), then the rest. `rnd` breaks ties so repeats vary.
 */
function pickFor(skill, entry, wrongIds, rnd) {
  const wrong = new Set(wrongIds || []);
  const keyed = (skill.questions || []).map((q) => ({ q, k: (wrong.has(q.id) ? 0 : 10) + Math.abs((q.tier || 2) - entry.tier) + (q.tier && q.tier < entry.tier ? 5 : 0) + rnd() * 0.9 }));
  keyed.sort((a, b) => a.k - b.k);
  return keyed.slice(0, entry.items).map((x) => x.q);
}

module.exports = { ITEMS, needOf, plan, pickFor, DAY };
