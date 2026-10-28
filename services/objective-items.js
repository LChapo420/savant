/**
 * Questions written for one objective each (the "objective items"), served
 * before the bank wherever the app asks a question about one objective: the
 * daily review's memory checks, fading and durability retrievals
 * (services/review-session.js) and the recall round of record-based
 * remediation (routes/remediation.js).
 *
 * Where they come from: content/objective-items/<track>.<grade>.json, built by
 * scripts/build-objective-items.js from the content factory's KEPT items only
 * (code checks + two blind judges from different model families agreeing on
 * the key, on-objective, exactly one correct and grade-suitable). The build
 * re-runs the deterministic checks below and drops anything that fails; this
 * module runs them again when a grade's file is first read, so a hand-edited or
 * half-written file can never put a broken question in front of a learner.
 *
 * Why it matters: the coverage model's proof needs right answers to questions
 * written *for the objective* (services/coverage.js, OBJ_MIN_ALIGNED). The
 * bank's questions are written per skill, so a bank question tagged with an
 * objective tests the objective less closely; an objective item is the
 * stronger evidence, and coverage.answersFor() now tells the two apart.
 *
 * OBJECTIVE_ITEMS: on (default) | off. Off serves the bank everywhere, exactly
 * as before, and coverage reads tagged answers as it did before.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const curriculum = require('../config/curriculum');
const { keyAgreement } = require('./key-agreement');
const mathClaims = require('./math-claims');

const DIR = path.join(__dirname, '..', 'content', 'objective-items');
/** Where the built files are read from (OBJECTIVE_ITEMS_DIR overrides it, for tests). */
function dir() { return process.env.OBJECTIVE_ITEMS_DIR || DIR; }

function enabled() {
  return String(process.env.OBJECTIVE_ITEMS || 'on').toLowerCase() !== 'off';
}

/** May an objective item have 3 options (evidence 03, P11)? OBJ_ITEMS_3_OPTIONS=off keeps exactly 4. */
function threeOptionsOk() {
  return String(process.env.OBJ_ITEMS_3_OPTIONS || 'on').toLowerCase() !== 'off';
}

// ── the deterministic checks (the night runner's code checks, as the app runs them) ──

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

/** The key stands out by length: much longer than every other option, or much shorter. */
function lengthCue(choices, ki) {
  const a = String(choices[ki] || '').trim().length;
  const others = choices.filter((_, j) => j !== ki).map((c) => String(c).trim().length);
  const mean = others.reduce((x, y) => x + y, 0) / others.length;
  const max = Math.max(...others);
  return (a >= 1.8 * mean && a - max >= 10)
    || (max >= 1.8 * a && max - a >= 10 && others.filter((l) => l >= 1.8 * a).length === others.length);
}

const NEEDS_MEDIA = /\b(picture|diagram|image|listen to|audio)\b|\b(the|this) (figure|graph|grid|model) (below|above|shown)\b|\b(shown|pictured) (below|above|here)\b|\bin the (figure|diagram)\b/i;

/**
 * Problems with one item, [] when it may be served. `objective` is the coverage
 * model's objective (for its track); `seen` is the normalised prompts already
 * accepted for that objective (duplicates).
 */
function problems(item, { trackId = null, seen = null } = {}) {
  const p = [];
  const q = item || {};
  if (q.kept === false) p.push('not kept');
  if (typeof q.prompt !== 'string' || q.prompt.trim().length < 12) p.push('prompt missing or too short');
  else if (q.prompt.split(/\s+/).length > 80) p.push('prompt over 80 words');
  if ((q.format || 'multiple_choice') !== 'multiple_choice') p.push('not multiple choice');
  const choices = Array.isArray(q.choices) ? q.choices.map((c) => String(c)) : null;
  // Three options are as good as four where no fourth plausible distractor exists
  // (rodriguez2005, aamodt1992, gierl2017; evidence 03, P11): OBJ_ITEMS_3_OPTIONS,
  // default on. The coverage model reads each answer's real option count for its
  // guessing rate (coverage.guessOf), so a 3-option item is weighed as one.
  const counts = threeOptionsOk() ? [3, 4] : [4];
  const fits = !!choices && counts.includes(choices.length);
  if (!fits) p.push(counts.length > 1 ? 'not 3 or 4 choices' : 'not exactly 4 choices');
  else {
    if (new Set(choices.map(norm)).size !== choices.length) p.push('duplicate choices');
    if (choices.some((c) => !c.trim())) p.push('empty choice');
    if (choices.some((c) => /\b(all|none) of the above\b/i.test(c))) p.push('all/none of the above');
  }
  const ki = choices ? choices.indexOf(String(q.answer)) : -1;
  if (q.answer === undefined || q.answer === null || String(q.answer).trim() === '') p.push('no key');
  else if (fits && ki < 0) p.push('key is not one of the choices');
  if (fits && ki >= 0) {
    const key = norm(choices[ki]);
    if (key.length > 3 && norm(q.prompt).includes(key)) p.push('the correct option is written in the question');
    if (lengthCue(choices, ki)) p.push('length cue: the key stands out by length');
    const ka = keyAgreement({ choices, answerIndex: ki, explanation: String(q.rationale || '') });
    if (ka.flagged) p.push(`rationale points to another option (${ka.reason})`);
    if ((trackId || q.track_id) === 'math') {
      const mp = [
        ...mathClaims.questionProblems({ prompt: q.prompt, choices, answer: choices[ki] }),
        ...mathClaims.arithmeticProblems(String(q.rationale || '')),
      ];
      if (mp.length) p.push(`math-claims: ${mp.map((x) => x.problem).join('; ').slice(0, 200)}`);
    }
  }
  if (NEEDS_MEDIA.test(String(q.prompt || ''))) p.push('needs a picture or audio');
  if (!String(q.rationale || '').trim()) p.push('no rationale');
  if (seen && q.prompt && seen.has(norm(q.prompt))) p.push('duplicate of another question for this objective');
  return p;
}

/** A stable id for an item: its objective plus its question and key. */
function itemId(item) {
  const h = crypto.createHash('sha1')
    .update(`${item.objective_id}\u0001${norm(item.prompt)}\u0001${norm(item.answer)}`).digest('hex').slice(0, 12);
  return `oi_${h}`;
}

// ── loading ─────────────────────────────────────────────────────────────────

const cache = new Map();

/** Forget what was read (tests, or after a rebuild in a running process). */
function reset() { cache.clear(); }

/** Objective id -> its servable items, for one grade. Empty when there is no file. */
function forGrade(trackId, gradeId) {
  const key = `${trackId}/${gradeId}`;
  if (cache.has(key)) return cache.get(key);
  const byObjective = new Map();
  const file = path.join(dir(), `${trackId}.${gradeId}.json`);
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const seenBy = new Map();
      for (const item of data.items || []) {
        if (!item || !item.objective_id || item.track_id !== trackId || item.grade_id !== gradeId) continue;
        const seen = seenBy.get(item.objective_id) || new Set();
        if (problems(item, { trackId, seen }).length) continue;
        seen.add(norm(item.prompt));
        seenBy.set(item.objective_id, seen);
        const list = byObjective.get(item.objective_id) || [];
        list.push({ ...item, id: item.id || itemId(item) });
        byObjective.set(item.objective_id, list);
      }
    }
  } catch (err) {
    console.warn(`objective items for ${key} unreadable: ${err.message}`);
  }
  cache.set(key, byObjective);
  return byObjective;
}

/** The servable items written for one objective ([] when none). */
function forObjective(trackId, gradeId, objectiveId) {
  return forGrade(trackId, gradeId).get(objectiveId) || [];
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One question for one objective, written for it and not yet asked of this
 * learner, or null (then the caller uses the bank, as before).
 *
 * `avoid` is the caller's set of bank.itemKey()s already asked (the learner's
 * recent history plus this sitting), so the no-repeat rule is the bank's own.
 * The key is prompt + answer + the options sorted, so the shuffle below never
 * makes an asked question look new. `seenShapes`, when given, gets the item's
 * shape so a bank question later in the sitting is not the same frame.
 *
 * The returned item carries its key and rationale for grading and feedback;
 * sessions.sanitize() is what keeps both from the browser until it answers.
 */
function pick({ trackId, gradeId, objectiveId, avoid = null, seenShapes = null, difficulty = null }) {
  if (!enabled() || !trackId || !gradeId || !objectiveId) return null;
  // eslint-disable-next-line global-require
  const bank = require('../content/bank');
  const asked = avoid instanceof Set ? avoid : new Set(avoid || []);
  const fresh = forObjective(trackId, gradeId, objectiveId).filter((q) => !asked.has(bank.itemKey(q)));
  if (!fresh.length) return null;
  const q = fresh[crypto.randomInt(fresh.length)];
  // Served on the objective's skill as the grade now defines it. The stored tag is
  // the one the item was written under; grade-fit (config/grade-skills.js) can
  // have re-pointed the objective since, and mastery, history and coverage all
  // key on the skill an item is served with.
  let skillId = q.skill_id || null;
  try {
    // eslint-disable-next-line global-require
    const o = require('./coverage').objectivesFor(trackId, gradeId).find((x) => x.id === objectiveId);
    if (o && o.skill) skillId = o.skill;
  } catch (err) { /* keep the stored tag */ }
  const item = {
    skill_id: skillId,
    skill_name: curriculum.skillName(skillId),
    difficulty: Number.isFinite(Number(difficulty)) ? Math.max(1, Math.min(10, Number(difficulty))) : 5,
    format: 'multiple_choice',
    prompt: q.prompt,
    choices: shuffle(q.choices.map(String)),
    answer: String(q.answer),
    rationale: q.rationale,
    source: 'objective_item',
    objective_item_id: q.id,
    // Written to test this objective: the stronger evidence coverage counts
    // toward a proof (services/coverage.js answersFor / fold).
    written_for_objective: true,
  };
  if (seenShapes instanceof Set) { try { seenShapes.add(bank.shapeKey(item)); } catch { /* a shape is a hint */ } }
  return item;
}

/** Counts for reports and tests: {grades, objectives, items, bySubject}. */
function summary() {
  const out = { grades: 0, objectives: 0, items: 0, bySubject: {} };
  if (!fs.existsSync(dir())) return out;
  for (const f of fs.readdirSync(dir())) {
    const m = /^([a-z0-9_]+)\.([a-z0-9_]+)\.json$/i.exec(f);
    if (!m) continue;
    const byObj = forGrade(m[1], m[2]);
    if (!byObj.size) continue;
    out.grades += 1;
    const s = out.bySubject[m[1]] || (out.bySubject[m[1]] = { grades: 0, objectives: 0, items: 0 });
    s.grades += 1;
    for (const list of byObj.values()) { out.objectives += 1; s.objectives += 1; out.items += list.length; s.items += list.length; }
  }
  return out;
}

module.exports = { enabled, threeOptionsOk, problems, lengthCue, itemId, forGrade, forObjective, pick, reset, summary, DIR, dir, norm };
