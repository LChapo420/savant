/**
 * "Learn from your own material", extending a path (S1b).
 *
 *   more(userId, materialId)                     "continue": more grounded practice on the skills already on the path
 *   addMaterial(userId, materialId, sourceId)    "add material": the skills of another of the learner's materials join the path
 *
 * Both change the one stored course (services/course-builder.js), so the learner's per-skill state and spaced-review
 * schedule (services/material-study.js, services/material-path.js) carry on as they were: existing skill and question
 * ids never change, new questions get the next numbers, and added skills come after the existing ones with ids of
 * their own, so nothing the learner already did is lost or reordered.
 *
 * Every new question goes through the same checks as a first build (a quote that is in the learner's own passage, then
 * a second model pass), against the text of the material the skill came from. Same data rules as the builder: calls
 * go through services/ai.js as the learner, with their own token budget; tests pass an `llm`.
 */
const db = require('../config/db');
const materials = require('./materials');
const cb = require('./course-builder');

const MAX_QUESTIONS_PER_SKILL = 24;  // a skill's pool stops growing here
const MAX_ADDED_MATERIALS = 4;
const MAX_SKILLS = 60;               // a path never grows past this many skills
const TOKEN_BUDGET = Number(process.env.MATERIAL_EXTEND_TOKEN_BUDGET || 160000);
const CONCURRENCY = Number(process.env.MATERIAL_BUILD_CONCURRENCY || 4);

const norm = (s) => String(s || '').toLowerCase().replace(/[“”„"‘’']/g, '').replace(/\s+/g, ' ').trim();
const llmOf = (opts) => opts.llm || ((a) => require('./ai').structuredDetail(a)); // eslint-disable-line global-require

function courseRow(userId, materialId) { return cb.get(userId, materialId); }
function usable(c) { return c && ['ready', 'partial'].includes(c.status) && (c.skills || []).length; }

/** The text of the material a skill came from, as passages, or null when it is gone or has changed since the build. */
function passagesFor(userId, course, skill, cache) {
  const origin = skill.origin_material || course.material_id;
  if (!cache.has(origin)) {
    const mat = materials.get(userId, origin, true);
    const want = skill.origin_material ? ((course.added || []).find((a) => a.material_id === origin) || {}).text_hash : course.text_hash;
    const ok = mat && want && cb.hash(mat.text) === want;
    cache.set(origin, ok ? new Map(cb.chunk(mat.text).slice(0, cb.MAX_PASSAGES).map((p) => [p.id, p])) : null);
  }
  return cache.get(origin);
}

/** What the learner is told about the last extension (kept on the course row so the page can poll for it). */
function record(userId, materialId, patch) {
  const c = courseRow(userId, materialId);
  if (c) { db.update('material_courses', c.id, { last_extend: { ...patch, at: new Date().toISOString() } }); db.flush(); }
}
/** Start `more` or `addMaterial` without waiting: the outcome is written to the course row. */
function start(kind, userId, materialId, args = {}, opts = {}) {
  const run = kind === 'add' ? addMaterial(userId, materialId, args.sourceId, opts) : more(userId, materialId, { ...opts, skillIds: args.skillIds });
  return run.then((out) => {
    record(userId, materialId, out.error ? { kind, ok: false, error: out.error, code: out.code } : { kind, ok: true, added: out.added, skills: out.skills, duplicates: out.duplicates || 0 });
    return out;
  });
}

/** Run `fn` over `items`, a few at a time. */
async function pool(items, n, fn) {
  const todo = items.slice();
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (todo.length) await fn(todo.shift()); }));
}

/**
 * Continue: more questions on the same skills (all of them, or the ids in opts.skillIds).
 * Resolves { added, skills, skipped, dropped, course } or { error, code }. Never throws.
 */
async function more(userId, materialId, opts = {}) {
  const key = `${userId}:${Number(materialId)}`;
  if (cb.inflight.has(key)) return { error: 'This course is being changed right now.', code: 'busy' };
  const course = courseRow(userId, materialId);
  if (!usable(course)) return { error: 'There is no course to extend yet.', code: 'no_course' };
  if (!opts.llm && !require('./ai').isEnabled()) return { error: 'The course builder is not available right now.', code: 'unavailable' }; // eslint-disable-line global-require
  cb.inflight.add(key);
  try {
    const want = Array.isArray(opts.skillIds) && opts.skillIds.length ? new Set(opts.skillIds.map(String)) : null;
    const ctx = { unanswered: 0, llm: llmOf(opts), userId, budget: new cb.Budget(opts.tokenBudget || TOKEN_BUDGET), dropped: { ungrounded: 0, invalid: 0, unsupported: 0, skills: 0 }, models: new Set() };
    const cache = new Map();
    const added = new Map(); // skill id -> new questions
    let skipped = 0;
    let stopped = false;
    const todo = course.skills.filter((s) => (!want || want.has(s.id)) && s.questions.length < MAX_QUESTIONS_PER_SKILL);
    await pool(todo, opts.concurrency || CONCURRENCY, async (skill) => {
      if (stopped) return;
      const passages = passagesFor(userId, course, skill, cache);
      if (!passages || !skill.passage_ids.every((id) => passages.has(id))) { skipped++; return; }
      const have = skill.questions.map((q) => q.prompt);
      const extra = { have, haveNorm: new Set(have.map(norm)), offset: skill.questions.length, room: MAX_QUESTIONS_PER_SKILL - skill.questions.length };
      const r = await cb.buildSkill({ ...skill, taught: skill.source === 'general' ? false : true }, passages, ctx, extra);
      if (r.stopped) { stopped = true; return; }
      if (r.value) added.set(skill.id, r.value.questions);
      else skipped++;
    });
    if (!added.size) return { added: 0, skills: 0, skipped, dropped: ctx.dropped, stopped, error: stopped ? 'The token budget for this round ran out.' : 'No new questions passed the checks. Try again, or add more material.', code: stopped ? 'budget' : 'nothing_new' };
    // Re-read: another request may have saved while the model ran (the lock only guards builds and extensions).
    const fresh = courseRow(userId, materialId);
    const skills = fresh.skills.map((s) => {
      const more = added.get(s.id);
      if (!more) return s;
      const ids = new Set(s.questions.map((q) => q.id));
      return { ...s, questions: [...s.questions, ...more.filter((q) => !ids.has(q.id))] };
    });
    const total = [...added.values()].reduce((n, q) => n + q.length, 0);
    const done = db.update('material_courses', fresh.id, {
      skills, extended: { rounds: ((fresh.extended && fresh.extended.rounds) || 0) + 1, last_at: new Date().toISOString(), questions_added: ((fresh.extended && fresh.extended.questions_added) || 0) + total },
      tokens_used: (fresh.tokens_used || 0) + ctx.budget.used, models: [...new Set([...(fresh.models || []), ...ctx.models])],
    });
    db.flush();
    return { added: total, skills: added.size, skipped, dropped: ctx.dropped, stopped, course: done };
  } catch (err) {
    console.error('course-extend:', err.message);
    return { error: 'The extra practice could not be built.', code: 'failed' };
  } finally {
    cb.inflight.delete(key);
  }
}

/**
 * Add material: build (or reuse) the course of another of the learner's materials and join its skills onto this path.
 * A skill whose title is already on the path is left out (counted as duplicate). Resolves { added, duplicates, course } or { error, code }.
 */
async function addMaterial(userId, materialId, sourceId, opts = {}) {
  const target = Number(materialId);
  const source = Number(sourceId);
  if (!Number.isInteger(source) || source === target) return { error: 'Pick a different material to add.', code: 'same_material' };
  const course = courseRow(userId, target);
  if (!usable(course)) return { error: 'There is no course to extend yet.', code: 'no_course' };
  const mat = materials.get(userId, source, true);
  if (!mat) return { error: 'No such material.', code: 'not_found' };
  if ((course.added || []).some((a) => a.material_id === source)) return { error: 'That material is already on this path.', code: 'already_added' };
  if ((course.added || []).length >= MAX_ADDED_MATERIALS) return { error: `A path can take up to ${MAX_ADDED_MATERIALS} added materials.`, code: 'too_many' };
  if (course.skills.length >= MAX_SKILLS) return { error: 'This path is already as long as it gets.', code: 'too_long' };

  const built = await cb.build(userId, source, { llm: opts.llm, tokenBudget: opts.tokenBudget });
  if (built.error) return built;
  const src = built.course;
  if (!usable(src)) return { error: 'That material could not be turned into skills.', code: 'outline_failed' };

  const key = `${userId}:${target}`;
  if (cb.inflight.has(key)) return { error: 'This course is being changed right now.', code: 'busy' };
  cb.inflight.add(key);
  try {
    const fresh = courseRow(userId, target);
    if (!usable(fresh) || (fresh.added || []).some((a) => a.material_id === source)) return { error: 'The course changed while the other material was built. Try again.', code: 'busy' };
    const titles = new Set(fresh.skills.map((s) => norm(s.title)));
    const prefix = `m${source}_`;
    const room = MAX_SKILLS - fresh.skills.length;
    const take = [];
    let duplicates = 0;
    for (const s of src.skills) {
      if (titles.has(norm(s.title))) { duplicates++; continue; }
      if (take.length < room) take.push(s);
    }
    if (!take.length) return { error: 'Everything in that material is already on this path.', code: 'nothing_new', duplicates };
    const idOf = (id) => `${prefix}${id}`.slice(0, 48);
    const kept = new Set(take.map((s) => s.id));
    const joined = take.map((s) => ({
      ...s, id: idOf(s.id), origin_material: source,
      prerequisites: (s.prerequisites || []).filter((p) => kept.has(p)).map(idOf),
      questions: s.questions.map((q, i) => ({ ...q, id: `${idOf(s.id)}_q${i + 1}` })),
    }));
    for (const s of joined) { delete s.depth; delete s.level; delete s.unit_id; }
    const skills = [...fresh.skills.map((s) => { const c = { ...s }; delete c.depth; return c; }), ...joined];
    const units = cb.layout(skills);
    const addedList = [...(fresh.added || []), { material_id: source, title: src.title, text_hash: src.text_hash, skill_ids: joined.map((s) => s.id), added_at: new Date().toISOString() }];
    const done = db.update('material_courses', fresh.id, { skills, units, added: addedList });
    db.flush();
    return { added: joined.length, duplicates, partial: src.status === 'partial', course: done };
  } catch (err) {
    console.error('course-extend:', err.message);
    return { error: 'The material could not be added.', code: 'failed' };
  } finally {
    cb.inflight.delete(key);
  }
}

module.exports = { start, MAX_QUESTIONS_PER_SKILL, MAX_ADDED_MATERIALS, MAX_SKILLS, more, addMaterial };
