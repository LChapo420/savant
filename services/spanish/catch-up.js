/**
 * The Spanish catch-up, skill by skill (version 3).
 *
 * The earlier catch-up (services/gap-scan.js) asked three questions about a whole
 * Spanish grade, found "Grade 4" to learn, and handed the learner all 152 levels of
 * it (about 680 minutes). This one follows curriculum-build/EVIDENCE-ARTICLE.md:
 * skip what is known on adequate evidence, teach only what is missing, to mastery,
 * with retrieval, feedback, spacing and interleaving.
 *
 *   1. The check. Every grade below the recommended one is split into its skills:
 *      the curriculum's own units (content/spanish-grades.js "Unit 3.1" … each with
 *      an "I can …" goal; 7 to 13 per grade). Each skill is probed with up to three
 *      questions, a round at a time, and decided by the same belief every other skip
 *      uses (services/learner-path.js unitBelief, the 'past' prior): three right make
 *      it known, a miss makes it a gap, and one still undecided after three questions
 *      is a gap too (never skipped on a guess). Questions come from the checked item
 *      banks: the bank generators where one fits the skill (content/spanish-items.js,
 *      multiple choice only) and the skill's own checked engine unit
 *      (content/spanish-path/units-*.js: its fill-the-blank items and its phrases).
 *
 *   2. The route. Each gap becomes one short block: the skill's own teaching levels
 *      (its preview, lessons and unit check: about 20-45 minutes), not the grade.
 *      "Catch-up k of N" counts the blocks. A block is played level by level in the
 *      Duolingo-style player (/spanish/learn), on the grade's own enrollment.
 *
 *   3. Spacing and interleaving. Each run already puts the phrases it asked into the
 *      engine's Leitner boxes (es_review). When a block is finished, every phrase of
 *      the skill that no run has met yet is put in box 1 as well, so the whole skill
 *      comes back on the engine's schedule. A later block's lessons recycle up to
 *      three phrases from the skills already caught up (due ones first).
 *
 *   4. The final mixed re-check, before the recommended grade opens: two fresh
 *      questions for every caught-up skill and one each for a sample of the skills
 *      the check found known (up to four, spread over the grades), shuffled together.
 *      The bar is 75%, per skill: a caught-up skill with a miss goes back on the route
 *      (that skill only); a sampled known skill with a miss becomes a new block. The
 *      next re-check asks only about the skills sent back.
 *
 *   5. Migration. A learner whose catch-up was accepted the old way (the gap-scan
 *      route on the recommended grade's enrollment) gets this one the next time they
 *      open it (stateFor). Nothing they have is moved or reset: enrollments keep
 *      their levels, and es_review keeps every box.
 *
 * One row per learner per subject placement, in `es_catch_up`.
 */
const crypto = require('crypto');
const db = require('../../config/db');
const curriculum = require('../../config/curriculum');
const learnerPath = require('../learner-path');
const subjectPlacement = require('../subject-placement');
const { makeRng } = require('../../content/rng');

const COLL = 'es_catch_up';
const VERSION = 3;
const TRACK = 'spanish';
/** Questions per skill in the check at most. */
const MAX_PER_SKILL = Number(process.env.ES_CATCHUP_MAX_PER_SKILL || 3);
/** The re-check's bar, per skill and overall. */
const MASTERY = 0.75;
/** Re-check: fresh questions per caught-up skill, and how many known skills are sampled (one question each). */
const RECHECK_PER_SKILL = 2;
const RECHECK_KNOWN_SAMPLE = 4;
/** Phrases from earlier caught-up skills a later block's lesson recycles. */
const MIX_IN = 3;
/** The slots a block is made of: the skill's preview, its lessons and its unit check. */
const BLOCK_SLOTS = new Set(['intro', 'vocabulary', 'grammar', 'listening', 'speaking', 'pronunciation', 'reading', 'writing', 'review']);

function esPath() {
  // eslint-disable-next-line global-require
  return require('./path');
}
function bankGenerators() {
  // eslint-disable-next-line global-require
  return require('../../content/spanish-items').GENERATORS;
}

// ── the skills ─────────────────────────────────────────────────────────────

function track() { return curriculum.getTrack(TRACK); }
function gradeIds() { return ((track() || {}).grades || []).map((g) => g.id); }
function gradeNo(gradeId) { return gradeIds().indexOf(gradeId) + 1; }
function gradeLabel(gradeId) { const g = curriculum.getGrade(TRACK, gradeId); return `Grade ${gradeNo(gradeId)}${g ? `: ${g.name}` : ''}`; }

const skillCache = new Map();
/**
 * A grade's skills: its curriculum units, in order. Each with the levels that make
 * its catch-up block and their minutes.
 */
function skillsOfGrade(gradeId) {
  if (skillCache.has(gradeId)) return skillCache.get(gradeId);
  const grade = curriculum.getGrade(TRACK, gradeId);
  const out = [];
  if (grade) {
    const byUnit = new Map();
    for (const row of grade.levels) {
      if (!/^Unit \d+\.\d+$/.test(row.unit)) continue;
      if (!byUnit.has(row.unit)) byUnit.set(row.unit, []);
      byUnit.get(row.unit).push(row);
    }
    for (const [unit, rows] of byUnit) {
      const intro = rows.find((r) => r.type === 'Preview') || rows[0];
      const goal = String(intro.title).replace(/^Unit \d+\.\d+:\s*/, '').trim();
      const block = rows.filter((r) => BLOCK_SLOTS.has(esPath().slotOf(r) || ''));
      const lessons = rows.filter((r) => ['vocabulary', 'grammar', 'listening', 'speaking', 'pronunciation', 'reading', 'writing'].includes(esPath().slotOf(r)));
      out.push({
        key: `${gradeId}|${unit}`,
        grade_id: gradeId,
        unit,
        goal,
        // The skill's name: its first lessons' titles say it best ("Regular -AR Verbs in the Present").
        title: lessons.length ? lessons[0].title : goal,
        levels: block.map((r) => r.level),
        minutes: block.reduce((n, r) => n + (Number(r.minutes) || 5), 0),
        unit_levels: [rows[0].level, rows[rows.length - 1].level],
        unit_minutes: rows.reduce((n, r) => n + (Number(r.minutes) || 5), 0),
      });
    }
  }
  skillCache.set(gradeId, out);
  return out;
}

function skillByKey(key) {
  const [gradeId] = String(key).split('|');
  return skillsOfGrade(gradeId).find((s) => s.key === key) || null;
}

/** The skill's engine unit (content/spanish-path), when it has one. */
function engineUnit(skill) {
  return esPath().UNITS.find((u) => u.grade === skill.grade_id && u.unit === skill.unit) || null;
}

/** Does every level of the skill's block play in the Duolingo-style player? */
function playable(skill) {
  return skill.levels.length > 0 && skill.levels.every((l) => esPath().supports(skill.grade_id, l));
}

// ── the questions (from the checked banks) ────────────────────────────────

const SER = new Set(['soy', 'eres', 'es', 'somos', 'son']);
const COLORS = /(rojo|blanco|negro|amarillo|azul|verde|gris|marrón|rosado|morado|anaranjado)/i;
/**
 * Bank generators that test a skill exactly, with a filter on the item where the
 * generator is wider than the skill. Skills not listed are asked from their own
 * engine unit only.
 */
const BANK = {
  'intermediate|Unit 2.7': [{ gen: 'es_questions' }],
  'advanced|Unit 3.1': [{ gen: 'es_ser_estar', where: (it) => SER.has(String(it.answer).toLowerCase()) && !/fiesta|concierto|reuni|boda|examen|clase/i.test(it.prompt) }],
  'advanced|Unit 3.2': [{ gen: 'es_gender' }],
  'advanced|Unit 3.3': [{ gen: 'es_gender', where: (it) => /article/i.test(it.prompt) }],
  'advanced|Unit 3.6': [{ gen: 'es_adjectives' }],
  'advanced|Unit 3.9': [{ gen: 'es_adjectives' }],
  'advanced|Unit 3.10': [{ gen: 'es_questions' }],
  'spanish_grade_04_time_food_shopping_and_core_verbs|Unit 4.1': [{ gen: 'es_present_ar' }, { gen: 'es_present_erir' }],
  'spanish_grade_04_time_food_shopping_and_core_verbs|Unit 4.8': [{ gen: 'es_adjectives', where: (it) => COLORS.test(it.prompt) }],
  'spanish_grade_04_time_food_shopping_and_core_verbs|Unit 4.11': [{ gen: 'es_present_ar', where: (it) => /wrong|error/i.test(it.prompt) }, { gen: 'es_present_erir', where: (it) => /wrong|error/i.test(it.prompt) }],
};

const nfc = (s) => String(s == null ? '' : s).normalize('NFC').trim();
function hashOf(s) { return crypto.createHash('sha256').update(String(s)).digest().readUInt32LE(0); }
/** The options in an order of their own, the same every time this question is shown. */
function ordered(qid, choices) {
  const rng = makeRng(hashOf(`order|${qid}`));
  return rng.shuffle ? rng.shuffle([...choices]) : [...choices].sort((a, b) => hashOf(`${qid}|${a}`) - hashOf(`${qid}|${b}`));
}

function bankQuestions(skill) {
  const specs = BANK[`${skill.grade_id}|${skill.unit}`] || [];
  const gens = bankGenerators();
  const out = [];
  for (const spec of specs) {
    const gen = gens[spec.gen];
    if (!gen) continue;
    const seen = new Set();
    for (let s = 0; s < 80 && out.filter((q) => q.gen === spec.gen).length < 8; s++) {
      let it;
      try { it = gen(makeRng(`catchup|${skill.key}|${spec.gen}|${s}`), 1 + (s % 5), {}); } catch { continue; }
      if (!it || it.format !== 'multiple_choice' || !Array.isArray(it.choices) || it.choices.length < 3) continue;
      if (!it.choices.map(nfc).includes(nfc(it.answer))) continue;
      if (spec.where && !spec.where(it)) continue;
      if (seen.has(it.prompt)) continue;
      seen.add(it.prompt);
      out.push({ qid: `b:${spec.gen}:${s}`, gen: spec.gen, source: `bank:${spec.gen}`, prompt: it.prompt, choices: it.choices.map(nfc), answer: nfc(it.answer) });
    }
  }
  return out;
}

function unitQuestions(skill) {
  const unit = engineUnit(skill);
  if (!unit) return [];
  const { sameMeaning } = esPath();
  const out = [];
  (unit.fills || []).forEach((f, i) => {
    if (!Array.isArray(f.choices) || f.choices.length < 3) return;
    const before = nfc(f.before);
    const after = nfc(f.after);
    const gap = `${before}${before && !/[¿¡]$/.test(before) ? ' ' : ''}___${after && !/^[.,;:!?…]/.test(after) ? ' ' : ''}${after}`;
    out.push({ qid: `f:${skill.key}:${i}`, source: 'unit:fill', prompt: `Complete: ${gap}${f.en ? `\n(${f.en})` : ''}`, choices: f.choices.map(nfc), answer: nfc(f.choices[f.answer]) });
  });
  const phrases = unit.phrases.filter((p) => p.tier <= 2 || unit.phrases.length < 10);
  phrases.forEach((p, i) => {
    const others = unit.phrases.filter((o) => o.id !== p.id && !sameMeaning(o, p));
    const pick = (field) => {
      const seen = new Set([nfc(field(p)).toLowerCase()]);
      const list = [];
      for (const o of [...others].sort((a, b) => hashOf(`${p.id}|${a.id}`) - hashOf(`${p.id}|${b.id}`))) {
        const v = nfc(field(o));
        if (seen.has(v.toLowerCase())) continue;
        seen.add(v.toLowerCase());
        list.push(v);
        if (list.length === 3) break;
      }
      return list.length === 3 ? list : null;
    };
    // Alternate the direction, so a skill is asked both ways.
    if (i % 2 === 0) {
      const ds = pick((x) => x.en[0]);
      if (ds) out.push({ qid: `m:${p.id}`, pid: p.id, source: 'unit:phrase', prompt: `What does “${p.es}” mean?`, choices: [nfc(p.en[0]), ...ds], answer: nfc(p.en[0]) });
    } else {
      const ds = pick((x) => x.es);
      if (ds) out.push({ qid: `t:${p.id}`, pid: p.id, source: 'unit:phrase', prompt: `How do you say “${p.en[0]}” in Spanish?`, choices: [nfc(p.es), ...ds], answer: nfc(p.es) });
    }
  });
  return out;
}

const questionCache = new Map();
/**
 * Every question for a skill, in the order they are asked: a fill-the-blank, a
 * bank item, a phrase, and round again, so three questions look at the skill three
 * ways. Deterministic: the same skill always gives the same list.
 */
function questionsFor(skill) {
  if (questionCache.has(skill.key)) return questionCache.get(skill.key);
  const unit = unitQuestions(skill);
  const fills = unit.filter((q) => q.source === 'unit:fill');
  const phrases = unit.filter((q) => q.source === 'unit:phrase').sort((a, b) => hashOf(a.qid) - hashOf(b.qid));
  const bank = bankQuestions(skill);
  const lists = [fills, bank, phrases];
  const out = [];
  for (let i = 0; out.length < fills.length + bank.length + phrases.length; i++) {
    for (const l of lists) if (l[i]) out.push(l[i]);
  }
  const final = out.map((q) => ({ ...q, key: skill.key, choices: ordered(q.qid, q.choices) }));
  questionCache.set(skill.key, final);
  return final;
}

function questionById(key, qid) {
  const skill = skillByKey(key);
  return skill ? questionsFor(skill).find((q) => q.qid === qid) || null : null;
}

// ── the row ────────────────────────────────────────────────────────────────

function placementRow(userId) {
  const row = subjectPlacement.placementFor(userId, TRACK);
  return row && row.finished_at && row.recommended_grade_id ? row : null;
}

function rowFor(userId, placementId) {
  return db.findOne(COLL, (r) => r.user_id === userId && r.placement_id === placementId && r.version === VERSION) || null;
}

/** The grades the catch-up looks at: every Spanish grade below the recommended one. */
function gradesBelow(recommended) {
  const ids = gradeIds();
  const at = ids.indexOf(recommended);
  return at > 0 ? ids.slice(0, at) : [];
}

/**
 * Skills the learner has already worked in the Duolingo-style player: every level
 * of the skill's block has a passed run. They are not asked about; the re-check
 * samples them like the known ones. A level the learner was only placed past is
 * not work, so it does not count (the Spanish unit plans cover a whole grade, so
 * they cannot say which skill was done).
 */
function workedSkills(userId, grades) {
  const out = new Set();
  for (const gradeId of grades) {
    const passed = new Set(db.find('es_path_runs', (r) => r.user_id === userId && r.grade_id === gradeId && r.outcome && r.outcome.passed).map((r) => r.level));
    if (!passed.size) continue;
    for (const s of skillsOfGrade(gradeId)) {
      if (s.levels.length && s.levels.every((l) => passed.has(l))) out.add(s.key);
    }
  }
  return out;
}

/** The old (gap-scan) catch-up this learner accepted, if any: what migration replaces. */
function oldRoute(userId, row) {
  // eslint-disable-next-line global-require
  const gapScan = require('../gap-scan');
  const main = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === TRACK && e.grade_id === row.recommended_grade_id);
  const plan = main ? learnerPath.planFor(main) : null;
  const accepted = plan && Array.isArray(plan.catch_up) ? plan.catch_up.filter((e) => e.status === 'accepted' || e.status === 'done') : [];
  const scan = row.gap_scan && row.gap_scan.kind === 'catch_up' ? row.gap_scan : null;
  const taken = row.catch_up_choice && row.catch_up_choice.status === 'taken';
  if (!accepted.length && !scan && !taken) return null;
  const route = main ? gapScan.routeOf(TRACK, row.recommended_grade_id, plan && plan.catch_up, main.id) : null;
  return {
    from: 'gap_scan',
    questions_asked: scan ? (scan.asked || []).length : 0,
    steps: (route ? route.steps : []).map((s) => ({ grade_id: s.grade_id, unit_count: s.unit_count, minutes: s.minutes, enrollment_id: s.enrollment_id, status: s.status })),
    total_minutes: route ? route.total_minutes : 0,
    enrollments: db.find('enrollments', (e) => e.user_id === userId && e.track_id === TRACK).map((e) => ({ id: e.id, grade_id: e.grade_id, current_level: e.current_level, status: e.status })),
  };
}

function newRow(userId, row, now, migratedFrom = null) {
  const grades = gradesBelow(row.recommended_grade_id);
  const worked = workedSkills(userId, grades);
  const skills = grades.flatMap((g) => skillsOfGrade(g)).map((s) => ({
    key: s.key,
    grade_id: s.grade_id,
    status: worked.has(s.key) ? 'worked' : 'pending',
    answers: [],
    p: null,
  }));
  return db.insert(COLL, {
    user_id: userId,
    track_id: TRACK,
    placement_id: row.id,
    version: VERSION,
    grade_id: row.recommended_grade_id,
    phase: 'check',
    skills,
    check: { started_at: new Date(now).toISOString(), finished_at: null, asked: [], current: null },
    blocks: [],
    recheck: null,
    rechecks: [],
    migrated_from: migratedFrom,
    created_at: new Date(now).toISOString(),
    finished_at: null,
  });
}

function save(state) {
  return db.update(COLL, state.id, state);
}

// ── the check ──────────────────────────────────────────────────────────────

const UNDECIDED = ['pending', 'open'];

function decideSkill(sk) {
  const b = learnerPath.unitBelief(sk.answers.map((a) => ({ correct: a.correct, choices: a.choices })), { prior: 'past' });
  sk.p = Math.round(b.p * 10000) / 10000;
  if (b.decision === 'known' || b.decision === 'learn') sk.status = b.decision;
  else if (sk.answers.length >= MAX_PER_SKILL) { sk.status = 'learn'; sk.unchecked = true; } // never skipped on a guess
  else sk.status = 'open';
}

function askedSet(state) {
  const out = new Set(state.check.asked.map((a) => `${a.key}#${a.qid}`));
  for (const r of [state.recheck, ...(state.rechecks || [])]) for (const it of (r && r.items) || []) out.add(`${it.key}#${it.qid}`);
  return out;
}

function freshQuestion(state, key) {
  const skill = skillByKey(key);
  if (!skill) return null;
  const asked = askedSet(state);
  return questionsFor(skill).find((q) => !asked.has(`${key}#${q.qid}`)) || null;
}

/** The next check question: one per skill a round, lowest grade first. Null when every skill is decided. */
function nextCheck(state) {
  const order = gradeIds();
  const live = state.skills
    .map((sk, i) => ({ sk, i }))
    .filter(({ sk }) => UNDECIDED.includes(sk.status));
  live.sort((a, b) => a.sk.answers.length - b.sk.answers.length || order.indexOf(a.sk.grade_id) - order.indexOf(b.sk.grade_id) || a.i - b.i);
  for (const { sk } of live) {
    const q = freshQuestion(state, sk.key);
    if (q) return { key: sk.key, qid: q.qid };
    // Nothing left to ask it: a gap, never a skip.
    sk.status = 'learn';
    sk.unchecked = true;
    sk.no_questions = !sk.answers.length;
  }
  return null;
}

function finishCheck(state, now) {
  state.check.current = null;
  state.check.finished_at = new Date(now).toISOString();
  state.blocks = state.skills.filter((sk) => sk.status === 'learn').map((sk) => blockFor(sk.key));
  state.phase = state.blocks.length ? 'route' : 'recheck';
  if (state.phase === 'recheck') startRecheck(state, now);
}

function blockFor(key, extra = {}) {
  const skill = skillByKey(key);
  return { key, levels: skill ? skill.levels.slice() : [], done: [], status: 'todo', started_at: null, done_at: null, reopened: 0, review_seeded: 0, ...extra };
}

function grade(q, given) {
  return nfc(given) === q.answer;
}

// ── the re-check ───────────────────────────────────────────────────────────

/** Known skills to sample: spread over the grades, the least certain first. */
function knownSample(state) {
  const pool = state.skills.filter((sk) => sk.status === 'known' || sk.status === 'worked');
  const byGrade = new Map();
  for (const sk of pool) {
    if (!byGrade.has(sk.grade_id)) byGrade.set(sk.grade_id, []);
    byGrade.get(sk.grade_id).push(sk);
  }
  for (const list of byGrade.values()) list.sort((a, b) => (a.p ?? 1) - (b.p ?? 1) || hashOf(`${state.id}|${a.key}`) - hashOf(`${state.id}|${b.key}`));
  const out = [];
  const lists = [...byGrade.values()];
  for (let i = 0; out.length < RECHECK_KNOWN_SAMPLE && lists.some((l) => l[i]); i++) {
    for (const l of lists) if (l[i] && out.length < RECHECK_KNOWN_SAMPLE) out.push(l[i]);
  }
  return out;
}

function startRecheck(state, now) {
  const round = (state.rechecks || []).length + 1;
  const items = [];
  const taken = askedSet(state);
  const take = (key, n, role) => {
    const skill = skillByKey(key);
    if (!skill) return;
    let got = 0;
    for (const q of questionsFor(skill)) {
      if (got >= n) break;
      if (taken.has(`${key}#${q.qid}`)) continue;
      taken.add(`${key}#${q.qid}`);
      items.push({ key, qid: q.qid, role });
      got++;
    }
  };
  // The first re-check: every caught-up skill and a sample of known ones. A later
  // one: only the skills sent back.
  const caught = round === 1 ? state.blocks.map((b) => b.key) : state.blocks.filter((b) => b.reopened && b.status === 'done' && b.recheck_round === round - 1).map((b) => b.key);
  for (const key of new Set(caught)) take(key, RECHECK_PER_SKILL, 'caught_up');
  if (round === 1) for (const sk of knownSample(state)) take(sk.key, 1, 'known');
  // Interleaved: skills mixed, not in blocks.
  items.sort((a, b) => hashOf(`${state.id}|${round}|${a.key}|${a.qid}`) - hashOf(`${state.id}|${round}|${b.key}|${b.qid}`));
  state.phase = 'recheck';
  state.recheck = { round, items, answers: [], started_at: new Date(now).toISOString(), finished_at: null, result: null };
}

function scoreRecheck(state, now) {
  const r = state.recheck;
  const bySkill = new Map();
  for (const a of r.answers) {
    if (!bySkill.has(a.key)) bySkill.set(a.key, { right: 0, total: 0, role: a.role });
    const s = bySkill.get(a.key);
    s.total++; if (a.correct) s.right++;
  }
  const right = r.answers.filter((a) => a.correct).length;
  const score = r.answers.length ? right / r.answers.length : 1;
  const failed = [...bySkill.entries()].filter(([, s]) => s.right / s.total < MASTERY).map(([key, s]) => ({ key, ...s }));
  const passed = score >= MASTERY && !failed.length;
  r.result = { score: Math.round(score * 100), right, total: r.answers.length, passed, failed: failed.map((f) => f.key), by_skill: Object.fromEntries(bySkill) };
  r.finished_at = new Date(now).toISOString();
  state.rechecks = [...(state.rechecks || []), r];
  if (passed) {
    state.phase = 'done';
    state.finished_at = new Date(now).toISOString();
    state.recheck = null;
    return;
  }
  // A miss sends the learner back to that skill only.
  for (const f of failed) {
    const b = state.blocks.find((x) => x.key === f.key);
    if (b) Object.assign(b, { status: 'todo', done: [], done_at: null, reopened: (b.reopened || 0) + 1, recheck_round: r.round });
    else {
      state.blocks.push(blockFor(f.key, { reopened: 1, recheck_round: r.round, from: 'recheck' }));
      const sk = state.skills.find((x) => x.key === f.key);
      if (sk) sk.status = 'learn';
    }
  }
  // Below the bar overall with no single skill below it cannot happen (every miss is in a skill), but stay safe.
  if (!failed.length) { startRecheck(state, now); return; }
  state.recheck = null;
  state.phase = 'route';
}

// ── blocks: where the learner plays ────────────────────────────────────────

/** The grade's enrollment the block is played on: the learner's own, else a new one. */
function blockEnrollment(userId, gradeId, now = Date.now()) {
  const existing = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === TRACK && e.grade_id === gradeId);
  if (existing) {
    if (existing.status === 'placement_pending') db.update('enrollments', existing.id, { status: 'active', placed_by: existing.placed_by || 'catch_up' });
    return db.byId('enrollments', existing.id);
  }
  const grade = curriculum.getGrade(TRACK, gradeId);
  return db.insert('enrollments', {
    user_id: userId, track_id: TRACK, grade_id: gradeId, target_level: grade.pathLength,
    current_level: 1, level_items: 0, levels_completed: 0, xp: 0, status: 'active', pending_checkpoint: null,
    placed_at: new Date(now).toISOString(), placed_by: 'catch_up',
  });
}

function openBlocks(state) {
  return (state.blocks || []).filter((b) => b.status !== 'done');
}

/** The block under way and the next level in it, with "k of N". */
function position(state) {
  const blocks = state.blocks || [];
  const i = blocks.findIndex((b) => b.status !== 'done');
  if (i < 0) return { k: blocks.length, n: blocks.length, block: null, level: null };
  const b = blocks[i];
  const level = b.levels.find((l) => !b.done.includes(l)) ?? null;
  return { k: i + 1, n: blocks.length, block: b, level };
}

function levelUrl(enrollmentId, level) {
  return `/spanish/learn?enrollment=${enrollmentId}&level=${level}&catchup=1`;
}

/** Start (or continue) the block under way: its enrollment and the URL of its next level. */
function nextLevel(userId, now = Date.now()) {
  const state = activeRow(userId);
  if (!state || state.phase !== 'route') return { error: 'There is no catch-up block to play now.', status: 409 };
  const pos = position(state);
  if (!pos.block) return { error: 'Every block is done.', status: 409 };
  const skill = skillByKey(pos.block.key);
  const enrollment = blockEnrollment(userId, skill.grade_id, now);
  if (!pos.block.started_at) pos.block.started_at = new Date(now).toISOString();
  pos.block.enrollment_id = enrollment.id;
  save(state);
  return { url: levelUrl(enrollment.id, pos.level), enrollment_id: enrollment.id, level: pos.level, k: pos.k, n: pos.n };
}

/** May the learner open this level? Yes when it is in a catch-up block not yet done. */
function allowsLevel(userId, enrollment, level) {
  if (!enrollment || enrollment.track_id !== TRACK) return false;
  const state = activeRow(userId);
  if (!state || !['route', 'recheck', 'done'].includes(state.phase)) return false;
  return (state.blocks || []).some((b) => skillByKey(b.key) && skillByKey(b.key).grade_id === enrollment.grade_id && b.levels.includes(Number(level)));
}

/** "Catch-up k of N" for a level the player is opening, or null. */
function labelFor(userId, enrollment, level) {
  const state = activeRow(userId);
  if (!state || !enrollment) return null;
  const blocks = state.blocks || [];
  const i = blocks.findIndex((b) => b.status !== 'done' && skillByKey(b.key).grade_id === enrollment.grade_id && b.levels.includes(Number(level)));
  if (i < 0) return null;
  const skill = skillByKey(blocks[i].key);
  return { k: i + 1, n: blocks.length, skill: skill.title, unit: skill.unit, grade: gradeLabel(skill.grade_id), step: blocks[i].levels.indexOf(Number(level)) + 1, steps: blocks[i].levels.length };
}

/** Phrases from skills already caught up, for a later block's lesson to recycle (interleaving). */
function mixInFor(userId, gradeId, level, now = Date.now()) {
  const state = activeRow(userId);
  if (!state) return [];
  const blocks = state.blocks || [];
  const i = blocks.findIndex((b) => b.status !== 'done' && skillByKey(b.key).grade_id === gradeId && b.levels.includes(Number(level)));
  if (i < 0) return [];
  const earlier = blocks.slice(0, i).filter((b) => b.status === 'done');
  // Also skills finished out of order (a reopened one after its later blocks).
  const done = [...earlier, ...blocks.filter((b, k) => k > i && b.status === 'done')];
  const pids = done.flatMap((b) => { const u = engineUnit(skillByKey(b.key)); return u ? u.phrases.map((p) => p.id) : []; });
  if (!pids.length) return [];
  const rows = new Map(db.find('es_review', (r) => r.user_id === userId).map((r) => [r.pid, r]));
  const rank = (pid) => { const r = rows.get(pid); return r ? Date.parse(r.due_at) : now + 1e12; };
  return pids.sort((a, b) => rank(a) - rank(b) || hashOf(`${level}|${a}`) - hashOf(`${level}|${b}`)).slice(0, MIX_IN);
}

/** Put every phrase of a finished skill into the engine's review boxes (box 1, the engine's first interval). */
function seedReview(userId, skill, now) {
  const unit = engineUnit(skill);
  if (!unit) return 0;
  const { BOX_HOURS } = esPath();
  let n = 0;
  for (const p of unit.phrases) {
    if (db.findOne('es_review', (r) => r.user_id === userId && r.pid === p.id)) continue;
    db.insert('es_review', {
      user_id: userId, pid: p.id, unit: unit.unit, grade_id: unit.grade, box: 1, seen: 0, right: 0, wrong: 0,
      first_at: new Date(now).toISOString(), last_at: new Date(now).toISOString(),
      due_at: new Date(now + BOX_HOURS[1] * 3600 * 1000).toISOString(), source: 'catch_up',
    });
    n++;
  }
  return n;
}

/**
 * A Duolingo-style run finished (services/spanish/path.js finishRun). A passed
 * level of a block under way is ticked off; a finished block seeds the review
 * boxes; the last block opens the re-check. Returns what the finish card shows.
 */
function onRunFinished({ userId, gradeId, level, passed, now = Date.now() }) {
  const state = activeRow(userId);
  if (!state || state.phase !== 'route') return null;
  const b = (state.blocks || []).find((x) => x.status !== 'done' && skillByKey(x.key).grade_id === gradeId && x.levels.includes(Number(level)));
  if (!b) return null;
  const skill = skillByKey(b.key);
  if (passed && !b.done.includes(Number(level))) b.done.push(Number(level));
  let blockDone = false;
  if (b.levels.every((l) => b.done.includes(l))) {
    b.status = 'done';
    b.done_at = new Date(now).toISOString();
    b.review_seeded = (b.review_seeded || 0) + seedReview(userId, skill, now);
    blockDone = true;
  }
  if (!openBlocks(state).length) startRecheck(state, now);
  save(state);
  const pos = position(state);
  let next = null;
  if (state.phase === 'route' && pos.block) {
    const nextSkill = skillByKey(pos.block.key);
    const e = db.findOne('enrollments', (x) => x.user_id === userId && x.track_id === TRACK && x.grade_id === nextSkill.grade_id);
    next = e ? { url: levelUrl(e.id, pos.level), label: pos.block.key === b.key ? 'Continue catch-up' : `Next: catch-up ${pos.k} of ${pos.n}` } : { url: '/spanish/catch-up', label: 'Continue catch-up' };
  } else if (state.phase === 'recheck') next = { url: '/spanish/catch-up', label: 'Take the final check' };
  return { k: state.blocks.indexOf(b) + 1, n: state.blocks.length, skill: skill.title, block_done: blockDone, recheck: state.phase === 'recheck', next };
}

// ── reading the state, with migration ───────────────────────────────────────

function activeRow(userId) {
  const row = placementRow(userId);
  return row ? rowFor(userId, row.id) : null;
}

/**
 * The learner's catch-up for the view, made if needed: a learner with an old
 * accepted catch-up is moved onto this one (migrated_from keeps what the old one
 * said). `create` false only reads.
 */
function ensure(userId, { create = false, now = Date.now() } = {}) {
  const row = placementRow(userId);
  if (!row) return { error: 'Take the Spanish placement first.', status: 404 };
  if (!gradesBelow(row.recommended_grade_id).length) return { error: 'There is no grade below yours to catch up on.', status: 400, none: true };
  let state = rowFor(userId, row.id);
  if (state) return { state, row };
  const old = oldRoute(userId, row);
  if (old) return { state: newRow(userId, row, now, old), row, migrated: true };
  if (!create) return { state: null, row };
  state = newRow(userId, row, now);
  db.update('subject_placements', row.id, { catch_up_choice: { status: 'taken', grade_id: row.recommended_grade_id, at: new Date(now).toISOString(), version: VERSION } });
  return { state, row, created: true };
}

/** Mark one answer, in the check or the re-check. `given` is {key, qid, answer}. */
function answer(userId, given, now = Date.now()) {
  const state = activeRow(userId);
  if (!state) return { error: 'No catch-up is running.', status: 404 };
  if (state.phase === 'check') {
    const cur = state.check.current;
    if (!cur || cur.key !== given.key || cur.qid !== given.qid) return { error: 'That is not the question being asked.', status: 409, stale: true };
    const q = questionById(cur.key, cur.qid);
    const correct = q ? grade(q, given.answer) : false;
    const sk = state.skills.find((s) => s.key === cur.key);
    sk.answers.push({ qid: cur.qid, correct, choices: q ? q.choices.length : 4, at: new Date(now).toISOString() });
    decideSkill(sk);
    state.check.asked.push({ key: cur.key, qid: cur.qid, correct, at: new Date(now).toISOString() });
    const next = nextCheck(state);
    state.check.current = next;
    if (!next) finishCheck(state, now);
    save(state);
    return { correct, state };
  }
  if (state.phase === 'recheck' && state.recheck) {
    const r = state.recheck;
    const item = r.items[r.answers.length];
    if (!item || item.key !== given.key || item.qid !== given.qid) return { error: 'That is not the question being asked.', status: 409, stale: true };
    const q = questionById(item.key, item.qid);
    const correct = q ? grade(q, given.answer) : false;
    r.answers.push({ key: item.key, qid: item.qid, role: item.role, correct, at: new Date(now).toISOString() });
    if (r.answers.length >= r.items.length) scoreRecheck(state, now);
    save(state);
    return { correct, state };
  }
  return { error: 'Nothing is being asked now.', status: 409 };
}

/** Begin the check (sets the first question). */
function start(userId, now = Date.now()) {
  const got = ensure(userId, { create: true, now });
  if (got.error) return got;
  const { state } = got;
  if (state.phase === 'check' && !state.check.current && !state.check.finished_at) {
    state.check.current = nextCheck(state);
    if (!state.check.current) finishCheck(state, now);
    save(state);
  }
  return { state };
}

/** What the browser sees of a question: never the answer. */
function questionView(key, qid, index, total) {
  const q = questionById(key, qid);
  const skill = skillByKey(key);
  if (!q || !skill) return null;
  return { key, qid, prompt: q.prompt, choices: q.choices, grade: gradeLabel(skill.grade_id), unit: skill.unit, skill: skill.title, index, total };
}

function reviewOf(userId, skill, now) {
  const unit = engineUnit(skill);
  if (!unit) return null;
  const ids = new Set(unit.phrases.map((p) => p.id));
  const rows = db.find('es_review', (r) => r.user_id === userId && ids.has(r.pid));
  if (!rows.length) return { phrases: unit.phrases.length, in_review: 0, due_now: 0, next_due_at: null };
  const due = rows.filter((r) => Date.parse(r.due_at) <= now);
  const upcoming = rows.map((r) => r.due_at).filter((d) => Date.parse(d) > now).sort();
  return { phrases: unit.phrases.length, in_review: rows.length, due_now: due.length, next_due_at: upcoming[0] || null };
}

/** The whole catch-up for the page. */
function view(userId, now = Date.now()) {
  const got = ensure(userId, { now });
  if (got.error) return { available: false, error: got.error, none: !!got.none };
  const { state, row } = got;
  const main = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === TRACK && e.grade_id === row.recommended_grade_id);
  const base = {
    available: true,
    version: VERSION,
    recommended: { grade_id: row.recommended_grade_id, label: gradeLabel(row.recommended_grade_id), enrollment_id: main ? main.id : null, status: main ? main.status : null },
    grades: gradesBelow(row.recommended_grade_id).map((g) => ({ grade_id: g, label: gradeLabel(g), skills: skillsOfGrade(g).length })),
  };
  if (!state) return { ...base, phase: 'not_started', estimate: { skills: base.grades.reduce((n, g) => n + g.skills, 0), max_questions: base.grades.reduce((n, g) => n + g.skills, 0) * MAX_PER_SKILL } };
  const skills = state.skills.map((sk) => {
    const s = skillByKey(sk.key);
    return { key: sk.key, grade_id: sk.grade_id, unit: s.unit, title: s.title, goal: s.goal, status: sk.status, asked: sk.answers.length, right: sk.answers.filter((a) => a.correct).length, p: sk.p, unchecked: !!sk.unchecked };
  });
  const out = {
    ...base,
    phase: state.phase,
    migrated_from: state.migrated_from ? { from: state.migrated_from.from, total_minutes: state.migrated_from.total_minutes, steps: state.migrated_from.steps } : null,
    skills,
    counts: {
      skills: skills.length,
      known: skills.filter((s) => s.status === 'known').length,
      worked: skills.filter((s) => s.status === 'worked').length,
      learn: skills.filter((s) => s.status === 'learn').length,
      open: skills.filter((s) => UNDECIDED.includes(s.status)).length,
      asked: state.check.asked.length,
    },
  };
  if (state.phase === 'check') {
    const cur = state.check.current;
    const undecided = state.skills.filter((s) => UNDECIDED.includes(s.status));
    // Questions still to come at most: what each undecided skill may still be asked.
    const left = undecided.reduce((n, s) => n + Math.max(0, MAX_PER_SKILL - s.answers.length), 0);
    out.question = cur ? questionView(cur.key, cur.qid, state.check.asked.length + 1, state.check.asked.length + left) : null;
  }
  const pos = position(state);
  out.route = {
    k: pos.k,
    n: pos.n,
    total_minutes: (state.blocks || []).reduce((n, b) => n + (skillByKey(b.key) ? skillByKey(b.key).minutes : 0), 0),
    minutes_left: openBlocks(state).reduce((n, b) => {
      const s = skillByKey(b.key);
      if (!s) return n;
      const g = curriculum.getGrade(TRACK, s.grade_id);
      return n + b.levels.filter((l) => !b.done.includes(l)).reduce((m, l) => m + (Number((g.levels.find((x) => x.level === l) || {}).minutes) || 5), 0);
    }, 0),
    old_minutes: state.migrated_from ? state.migrated_from.total_minutes : null,
    blocks: (state.blocks || []).map((b, i) => {
      const s = skillByKey(b.key);
      const g = curriculum.getGrade(TRACK, s.grade_id);
      return {
        k: i + 1,
        key: b.key,
        grade: gradeLabel(s.grade_id),
        unit: s.unit,
        title: s.title,
        goal: s.goal,
        minutes: s.minutes,
        status: b.status,
        reopened: b.reopened || 0,
        playable: playable(s),
        levels: b.levels.map((l) => { const r = g.levels.find((x) => x.level === l); return { level: l, title: r.title, slot: esPath().SLOT_LABEL[esPath().slotOf(r)] || r.type, minutes: Number(r.minutes) || 5, done: b.done.includes(l) }; }),
        review: b.status === 'done' ? reviewOf(userId, s, now) : null,
        enrollment_id: b.enrollment_id || null,
      };
    }),
    current: pos.block ? { key: pos.block.key, level: pos.level } : null,
  };
  if (state.phase === 'recheck' && state.recheck) {
    const r = state.recheck;
    const item = r.items[r.answers.length];
    out.recheck = { round: r.round, total: r.items.length, answered: r.answers.length, skills: [...new Set(r.items.map((x) => x.key))].length, question: item ? questionView(item.key, item.qid, r.answers.length + 1, r.items.length) : null };
  }
  out.rechecks = (state.rechecks || []).map((r) => ({ round: r.round, ...r.result, failed: (r.result.failed || []).map((k) => ({ key: k, title: skillByKey(k).title, unit: skillByKey(k).unit })) }));
  out.next = state.phase === 'check' ? { kind: 'check' }
    : state.phase === 'route' ? { kind: 'block', k: pos.k, n: pos.n }
      : state.phase === 'recheck' ? { kind: 'recheck' }
        : { kind: 'main', url: main ? (main.status === 'placement_pending' ? `/placement?enrollment=${main.id}` : `/path?enrollment=${main.id}`) : '/dashboard', label: `Start ${gradeLabel(row.recommended_grade_id).split(':')[0]}` };
  return out;
}

/**
 * The catch-up in the shape services/gap-scan.js routeOf gives, so the path page
 * and the dashboard draw it without knowing about skills: one step per block.
 */
function routeShape(userId) {
  const state = activeRow(userId);
  if (!state) return null;
  const row = placementRow(userId);
  const main = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === TRACK && e.grade_id === row.recommended_grade_id);
  const pos = position(state);
  const mainName = (curriculum.getGrade(TRACK, row.recommended_grade_id) || {}).name || row.recommended_grade_id;
  const steps = (state.blocks || []).map((b) => {
    const s = skillByKey(b.key);
    return { grade_id: s.grade_id, grade_name: `${s.unit}: ${s.title}`, status: b.status === 'done' ? 'done' : 'accepted', enrollment_id: b.enrollment_id || null, unit_keys: [b.key], units: [], titles: [s.title], unit_count: 1, minutes: s.minutes, unchecked_count: 0 };
  });
  const status = state.phase === 'done' ? 'done' : 'accepted';
  const headline = state.phase === 'check' ? `Catch-up check: ${state.check.asked.length} answered`
    : state.phase === 'route' ? `Catch-up ${pos.k} of ${pos.n}: ${skillByKey(pos.block.key).unit}, then the final check`
      : state.phase === 'recheck' ? 'Catch-up: the final check'
        : `Caught up. Start ${mainName}`;
  return {
    version: VERSION,
    url: '/spanish/catch-up',
    grade_id: row.recommended_grade_id,
    grade_name: mainName,
    status,
    phase: state.phase,
    headline,
    steps,
    declined: [],
    total_units: openBlocks(state).length,
    total_minutes: openBlocks(state).reduce((n, b) => n + (skillByKey(b.key) ? skillByKey(b.key).minutes : 0), 0),
    k: pos.k,
    n: pos.n,
    next: state.phase === 'done' ? { kind: 'main', grade_id: row.recommended_grade_id, enrollment_id: main ? main.id : null } : { kind: 'catch_up', url: '/spanish/catch-up' },
  };
}

module.exports = {
  VERSION, MAX_PER_SKILL, MASTERY, RECHECK_PER_SKILL, RECHECK_KNOWN_SAMPLE, MIX_IN, BANK,
  skillsOfGrade, skillByKey, questionsFor, engineUnit, playable, gradesBelow,
  ensure, start, answer, view, nextLevel, allowsLevel, labelFor, mixInFor, onRunFinished, routeShape, activeRow,
};
