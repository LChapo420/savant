/**
 * A small, budget-capped pilot of TypeSafe Jev 1.13 (a decision model on
 * OpenRouter): where, if anywhere, can it replace an LLM call here without
 * losing accuracy?
 *
 *   node scripts/jev-pilot.js cases            build every case set and print sizes (no calls)
 *   node scripts/jev-pilot.js probe            5 calls to confirm the format and cost per call
 *   node scripts/jev-pilot.js grading          task 1: typed-answer grading (noul)
 *   node scripts/jev-pilot.js units            task 2: placement-unit location (choice)
 *   node scripts/jev-pilot.js blind            task 3: blind multiple-choice answering (choice)
 *   node scripts/jev-pilot.js report           metrics from the cached answers (no calls)
 *   node scripts/jev-pilot.js key              read the key's usage (no model call)
 *
 * The owner authorised up to $0.10 in total on OpenRouter for this pilot and
 * nothing else. The guard below is the point of this file:
 *   - before any model call the key's usage (GET /api/v1/key, data.usage, USD) is
 *     read and the first reading is kept in the ledger as the pilot's start;
 *   - every call's cost is counted as the largest of the cost OpenRouter reports,
 *     the reported input tokens at the listed price, and (when a response has no
 *     usage) 1.5 x characters / 4 tokens at the listed price;
 *   - a call is only sent when the counted spend plus the calls in flight plus
 *     this call's generous estimate stays under $0.08, and no new task starts
 *     when the key's own usage has moved $0.08 since the start;
 *   - a call reported at more than 3x the listed price (or over $0.0005) stops
 *     everything at once.
 * Answers are cached per case in curriculum-build/jev-pilot/, so a re-run never
 * pays twice. The key is only ever sent to openrouter.ai and never printed.
 *
 * Read-only on content: nothing under content/ or data/ is written. The app's
 * store is pointed at a scratch file so that loading the curriculum cannot touch
 * data/db.json.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.DB_FILE = process.env.JEV_PILOT_DB || path.join(os.tmpdir(), 'jev-pilot-scratch-db.json');
process.env.DB_READONLY = '1';

const ROOT = path.join(__dirname, '..');
const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
const here = path.join(ROOT, '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(ROOT, '..', '.env') });

const MODEL = 'typesafe/jev-1.13';
const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const KEY_URL = 'https://openrouter.ai/api/v1/key';
const PRICE = 0.000000042; // USD per prompt token; completion is free
const CAP = 0.08; // stop all calls once the counted spend reaches this
const PARALLEL = 4;
const OUT = path.join(ROOT, 'curriculum-build', 'jev-pilot');
const LEDGER = path.join(OUT, 'ledger.json');

// ── the budget guard ────────────────────────────────────────────────────────

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
}

const ledger = readJson(LEDGER, {
  model: MODEL,
  cap_usd: CAP,
  start_usage: null,
  start_at: null,
  readings: [],
  calls: 0,
  failed_calls: 0,
  input_tokens: 0,
  reported_cost: 0,
  counted_cost: 0,
  max_cost_per_call: 0,
  by_task: {},
});
let inFlight = 0;
let stopped = null;

function saveLedger() { writeJson(LEDGER, ledger); }

class BudgetStop extends Error {}

function apiKey() {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error('OPENROUTER_API_KEY is not set');
  return k;
}

/** The key's usage in USD, from OpenRouter. Recorded in the ledger. */
async function keyUsage(label) {
  const res = await fetch(KEY_URL, { headers: { Authorization: `Bearer ${apiKey()}` } });
  if (!res.ok) throw new Error(`GET /api/v1/key failed: HTTP ${res.status}`);
  const body = await res.json();
  const usage = Number(body && body.data && body.data.usage);
  if (!Number.isFinite(usage)) throw new Error('GET /api/v1/key returned no data.usage');
  const reading = { at: new Date().toISOString(), label, usage };
  ledger.readings.push(reading);
  if (ledger.start_usage == null) { ledger.start_usage = usage; ledger.start_at = reading.at; }
  saveLedger();
  return usage;
}

/** Before a task: the key's own usage must not have moved CAP since the pilot began. */
async function preflight(task) {
  const usage = await keyUsage(`before ${task}`);
  const delta = usage - ledger.start_usage;
  console.log(`key usage before ${task}: $${usage.toFixed(6)} (pilot so far by the key: $${delta.toFixed(6)}; counted: $${ledger.counted_cost.toFixed(6)})`);
  if (delta >= CAP || ledger.counted_cost >= CAP) throw new BudgetStop(`budget reached before ${task}: key delta $${delta.toFixed(6)}, counted $${ledger.counted_cost.toFixed(6)}`);
}

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * One Jev call. Throws BudgetStop when the guard says no; returns the parsed
 * response, or null when the call failed after retries.
 */
async function decide(task, state, questions) {
  if (stopped) throw new BudgetStop(stopped);
  const body = JSON.stringify({ model: MODEL, state, questions });
  const estimate = Math.ceil((body.length / 4) * 1.5) * PRICE;
  if (ledger.counted_cost + inFlight + estimate >= CAP) {
    stopped = `counted spend $${ledger.counted_cost.toFixed(6)} + in flight would reach the $${CAP} cap`;
    throw new BudgetStop(stopped);
  }
  inFlight += estimate;
  const t = ledger.by_task[task] || (ledger.by_task[task] = { calls: 0, input_tokens: 0, counted_cost: 0 });
  try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      let res;
      try {
        // eslint-disable-next-line no-await-in-loop
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', 'X-Title': 'jev-pilot' },
          body,
        });
      } catch (err) {
        // A network failure may or may not have been billed: count the estimate.
        ledger.failed_calls++;
        ledger.counted_cost += estimate;
        t.counted_cost += estimate;
        saveLedger();
        if (attempt === 4) return null;
        // eslint-disable-next-line no-await-in-loop
        await wait(1500 * attempt);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { data = null; }
      if (!res.ok) {
        ledger.failed_calls++;
        // Server errors may have been billed; refusals of the request (4xx) are not.
        if (res.status >= 500) { ledger.counted_cost += estimate; t.counted_cost += estimate; }
        saveLedger();
        console.log(`  HTTP ${res.status}: ${text.slice(0, 300)}`);
        if (res.status === 402 || res.status === 401 || res.status === 403) { stopped = `HTTP ${res.status}`; throw new BudgetStop(stopped); }
        if (res.status === 400 || res.status === 422 || attempt === 4) return null;
        // eslint-disable-next-line no-await-in-loop
        await wait(2000 * attempt);
        continue;
      }
      const usage = (data && data.usage) || {};
      const tokens = Number(usage.input_tokens) || 0;
      const reported = Number(usage.cost);
      const byTokens = tokens * PRICE;
      const counted = Math.max(Number.isFinite(reported) ? reported : 0, byTokens, tokens ? 0 : estimate);
      ledger.calls++;
      ledger.input_tokens += tokens;
      if (Number.isFinite(reported)) ledger.reported_cost += reported;
      ledger.counted_cost += counted;
      ledger.max_cost_per_call = Math.max(ledger.max_cost_per_call, counted);
      t.calls++;
      t.input_tokens += tokens;
      t.counted_cost += counted;
      saveLedger();
      // Far above the listed price: stop everything and report.
      if ((Number.isFinite(reported) && byTokens > 0 && reported > 3 * byTokens) || counted > 0.0005) {
        stopped = `a call cost $${counted} for ${tokens} input tokens (listed price would be $${byTokens.toFixed(8)})`;
        throw new BudgetStop(stopped);
      }
      if (ledger.counted_cost >= CAP) stopped = `counted spend reached $${ledger.counted_cost.toFixed(6)}`;
      return data;
    }
    return null;
  } finally {
    inFlight -= estimate;
  }
}

async function pool(items, limit, fn) {
  let next = 0;
  const run = async () => {
    while (next < items.length && !stopped) {
      const i = next++;
      // eslint-disable-next-line no-await-in-loop
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: limit }, run));
}

// ── shared content helpers ──────────────────────────────────────────────────

const { makeRng } = require('../content/rng');
const bank = require('../content/bank');
const curriculum = require('../config/curriculum');
const grading = require('../services/grading');

function shuffle(list, seed) {
  const rng = makeRng(String(seed));
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function skillsOf(trackId) {
  const set = new Set();
  for (const g of curriculum.getTrack(trackId).grades) for (const s of (g.skills || [])) set.add(typeof s === 'string' ? s : s.id);
  return [...set];
}

/** Distinct generated items of a skill, by item key. */
function itemsOf(skillId, count, seedTag, filter = () => true) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < count * 12 && out.length < count; i++) {
    let it;
    try { it = bank.generate({ skillId, difficulty: 1 + (i % 10), seed: `jev-pilot:${seedTag}:${skillId}:${i}` }); } catch { continue; }
    const k = bank.itemKey(it);
    if (seen.has(k) || !filter(it)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.!?¡¿]+$/g, '').replace(/\s+/g, ' ').trim();
const stripAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');

// ── task 1: typed-answer grading ────────────────────────────────────────────

/** Near-miss wrong forms of a Spanish translation key: each is a real error a teacher marks wrong. */
const ES_MUTATIONS = [
  ['ser for location', /\best[aá]n\b/, 'son'],
  ['present for preterite (-é)', /^(Ayer (?:yo )?)(\w+?)é\b/, (m, a, b) => `${a}${b}o`],
  ['present for preterite (-í)', /^(Ayer (?:yo )?)(\w+?)í\b/, (m, a, b) => `${a}${b}o`],
  ['preterite for habitual imperfect', /\bleía\b/, 'leí'],
  ['indicative after querer que', /\bvengas\b/, 'vienes'],
  ['wrong person (they for we)', /\b(\w+?)(amos)\b/, (m, a) => `${a}an`],
  ['wrong person (they for we)', /\b(\w+?)(emos|imos)\b/, (m, a) => `${a}en`],
  ['wrong verb form (-o to -a)', /^((?:Yo )?)([A-Za-zñ]+?)o\b/, (m, a, b) => `${a}${b}a`],
  ['wrong person (I for he)', /^(Él |Ella )([A-Za-zñ]+?)e\b/, (m, a, b) => `${a}${b}o`],
  ['article gender (las→los)', /\bLas (\w+as)\b/, 'Los $1'],
  ['article gender (los→las)', /\bLos (\w+os)\b/, 'Las $1'],
  ['article gender (la→el)', /\bla (mesa|oficina|casa|ciudad|mañana)\b/, 'el $1'],
  ['article gender (una→un)', /\buna (\w+)\b/, 'un $1'],
];

function mutateSpanish(answer, used) {
  const order = [...ES_MUTATIONS].sort((a, b) => (used[a[0]] || 0) - (used[b[0]] || 0));
  for (const [why, rx, to] of order) {
    if (!rx.test(answer)) continue;
    const out = answer.replace(rx, to);
    if (out !== answer) { used[why] = (used[why] || 0) + 1; return { text: out, why }; }
  }
  return null;
}

const EN_MUTATIONS = [
  ['did not + past form', /\bdid not (\w+)\b/, (m, v) => `did not ${v.endsWith('e') ? `${v}d` : `${v}ed`}`],
  ['didn\'t + past form', /\bdidn't (\w+)\b/, (m, v) => `didn't ${v.endsWith('e') ? `${v}d` : `${v}ed`}`],
  ['agreement left broken', /\b(\w+)s (the|every)\b/, '$1 $2'],
  ['non-parallel kept', /, (\w+) the (\w+) and (\w+) /, (m, a, b, c) => `, ${a.endsWith('e') ? a.slice(0, -1) : a}ing the ${b} and to ${c} `],
];

function mutateEnglish(answer, used) {
  const order = [...EN_MUTATIONS].sort((a, b) => (used[a[0]] || 0) - (used[b[0]] || 0));
  for (const [why, rx, to] of order) {
    if (!rx.test(answer)) continue;
    const out = answer.replace(rx, to);
    if (out !== answer) { used[why] = (used[why] || 0) + 1; return { text: out, why }; }
  }
  return null;
}

function rulesSay(item, learner) {
  return grading.grade({ format: item.format === 'multiple_choice' ? 'type_in' : item.format, answer: item.answer, accepts: item.accepts || [] }, learner).correct;
}

/** The item as the grader sees it for one case: an accepted alternate under test is held out. */
function heldOut(item, alt) {
  const accepts = (item.accepts || []).filter((a) => norm(a) !== norm(alt) && norm(a) !== norm(item.answer));
  return { ...item, accepts };
}

function gradingCases() {
  const cases = [];
  const add = (group, kind, item, learner, correct, why) => {
    const shown = kind === 'held-out alternate' ? heldOut(item, learner) : { ...item, accepts: (item.accepts || []).filter((a) => norm(a) !== norm(item.answer)) };
    cases.push({
      id: `g${cases.length + 1}`,
      group,
      kind,
      why,
      truth: correct,
      question: item.prompt,
      reference: shown.answer,
      accepted: shown.accepts,
      learner,
      rules: rulesSay(shown, learner),
      format: item.format,
    });
  };

  // Spanish translations (short_answer: the one format the app sends to a model today).
  const tr = shuffle(itemsOf('es_translate', 60, 'tr'), 'tr');
  const used = {};
  let c = 0; let w = 0;
  tr.forEach((it, i) => {
    const all = [...new Set([it.answer, ...(it.accepts || [])])];
    // Alternates the rules would reject once held out: the cases a model is for.
    const alts = all.filter((a) => norm(a) !== norm(it.answer) && !rulesSay(heldOut(it, a), a));
    if (alts.length && c < 20) { add('spanish translation', 'held-out alternate', it, alts[i % alts.length], true, 'an accepted alternate the grader was not given'); c++; }
    if (w < 22) {
      const m = mutateSpanish(it.answer, used);
      if (m && !all.some((a) => norm(a) === norm(m.text))) { add('spanish translation', 'near-miss', it, m.text, false, m.why); w++; }
    }
  });
  tr.slice(0, 5).forEach((it) => add('spanish translation', 'form variant', it, stripAccents(it.answer).toLowerCase(), true, 'no accents, lower case'));
  tr.slice(5, 10).forEach((it, i) => {
    const other = tr.slice(10).find((o) => o.answer.split(' ')[0] === it.answer.split(' ')[0] && norm(o.answer) !== norm(it.answer) && ![it.answer, ...(it.accepts || [])].some((a) => norm(a) === norm(o.answer)))
      || tr[(i + 20) % tr.length];
    if (other && norm(other.answer) !== norm(it.answer)) add('spanish translation', 'sibling answer', it, other.answer, false, 'a well-formed answer to a different sentence');
  });

  // Spanish type-ins: vocabulary and numbers/times.
  const typed = shuffle([...itemsOf('es_vocab_core', 40, 'sv', (x) => x.format === 'type_in'), ...itemsOf('es_numbers', 40, 'sn', (x) => x.format === 'type_in')], 'st');
  let sc = 0; let sw = 0;
  typed.forEach((it, i) => {
    const alts = (it.accepts || []).filter((a) => norm(a) !== norm(it.answer));
    if (alts.length && sc < 6) { add('spanish type-in', 'held-out alternate', it, alts[0], true, 'an accepted alternate the grader was not given'); sc++; return; }
    if (i % 2 === 0 && sc < 10) { add('spanish type-in', 'form variant', it, stripAccents(it.answer).toUpperCase(), true, 'no accents, capitals'); sc++; return; }
    if (sw < 10) {
      const siblings = typed.filter((o) => o !== it && o.prompt.replace(/[\d"“”][^ ]*/g, '') === it.prompt.replace(/[\d"“”][^ ]*/g, '') && norm(o.answer) !== norm(it.answer) && ![it.answer, ...(it.accepts || [])].some((a) => norm(a) === norm(o.answer)));
      const same = siblings[(i * 7) % Math.max(1, siblings.length)];
      if (same) { add('spanish type-in', 'sibling answer', it, same.answer, false, 'the answer to a sibling question of the same template'); sw++; }
    }
  });

  // Spanish fill-in-the-blank multiple choice, typed: the key or an audited distractor.
  const blanks = (it) => it.format === 'multiple_choice' && /_{3,}/.test(it.prompt) && it.choices.length >= 3;
  const esMc = shuffle(skillsOf('spanish').flatMap((s) => itemsOf(s, 4, 'smc', blanks)), 'smc').slice(0, 20);
  esMc.forEach((it, i) => {
    if (i % 2 === 0) add('spanish fill-in', 'key typed', it, i % 4 === 0 ? stripAccents(it.answer) : it.answer, true, 'the key, typed');
    else add('spanish fill-in', 'distractor typed', it, it.choices.find((ch) => ch !== it.answer), false, 'an audited near-miss distractor');
  });

  // English rewrites and fixes (type_in).
  const enTyped = shuffle(['sentence_struct', 'modifiers', 'verb_tense', 'subject_verb'].flatMap((s) => itemsOf(s, 40, 'et', (x) => x.format === 'type_in')), 'et');
  let ec = 0; let ew = 0; const eused = {};
  enTyped.forEach((it, i) => {
    const alts = (it.accepts || []).filter((a) => norm(a) !== norm(it.answer));
    if (ec < 20 && (i % 2 === 0 || ew >= 20)) {
      if (alts.length) add('english rewrite', 'held-out alternate', it, alts[i % alts.length], true, 'an accepted alternate the grader was not given');
      else add('english rewrite', 'key typed', it, it.answer.replace(/\.$/, ''), true, 'the key without its final period');
      ec++;
      return;
    }
    if (ew < 20) {
      const quoted = (it.prompt.match(/"([^"]+)"/) || [])[1];
      const unfixed = i % 3 === 0 && quoted && /^Fix/.test(it.prompt) ? quoted : null;
      // A one-word key ("measured"): the learner types the word the prompt already had ("measures").
      const oneWord = /^\w+$/.test(it.answer) && quoted
        ? (quoted.match(/\b\w+\b/g) || []).find((wd) => wd.toLowerCase() !== it.answer.toLowerCase() && wd.slice(0, 4).toLowerCase() === it.answer.slice(0, 4).toLowerCase())
        : null;
      const m = oneWord ? { text: oneWord, why: 'the verb left in the wrong tense' }
        : unfixed ? { text: unfixed, why: 'the sentence copied back unfixed' } : mutateEnglish(it.answer, eused);
      if (m && ![it.answer, ...(it.accepts || [])].some((a) => norm(a) === norm(m.text))) { add('english rewrite', 'near-miss', it, m.text, false, m.why); ew++; }
    }
  });

  // English fill-in-the-blank multiple choice, typed.
  const enMc = shuffle(skillsOf('english').filter((s) => !/^act_/.test(s)).flatMap((s) => itemsOf(s, 4, 'emc', blanks)), 'emc').slice(0, 20);
  enMc.forEach((it, i) => {
    if (i % 2 === 0) add('english fill-in', 'key typed', it, it.answer, true, 'the key, typed');
    else add('english fill-in', 'distractor typed', it, it.choices.find((ch) => ch !== it.answer), false, 'an audited near-miss distractor');
  });

  // Math type-ins: equivalent forms against near-miss values.
  const fr = itemsOf('fractions', 30, 'mf', (x) => x.format === 'type_in' && /^-?\d+\/\d+$/.test(x.answer));
  fr.slice(0, 10).forEach((it, i) => {
    const [n, d] = it.answer.split('/').map(Number);
    if (i % 2 === 0) add('math', 'form variant', it, `${n} / ${d}`, true, 'spaces around the slash');
    else add('math', 'near-miss', it, `${n}/${d + 1}`, false, 'denominator off by one');
  });
  fr.slice(10, 16).forEach((it) => {
    const [n, d] = it.answer.split('/').map(Number);
    add('math', 'near-miss', it, `${n + 1}/${d}`, false, 'numerator off by one');
  });
  const ints = shuffle(['add_sub', 'integers', 'mul_div', 'linear_eq', 'order_ops'].flatMap((s) => itemsOf(s, 12, 'mi', (x) => x.format === 'type_in' && /^-?\d+$/.test(x.answer))), 'mi');
  ints.slice(0, 24).forEach((it, i) => {
    const v = Number(it.answer);
    if (i % 2 === 0) add('math', 'form variant', it, /linear_eq/.test(it.skill_id) ? `x = ${v}` : ` ${v} `, true, /linear_eq/.test(it.skill_id) ? 'written as an assignment' : 'stray spaces');
    else {
      // A sign flip only where a sign is unambiguous: a bare expression.
      const flip = i % 4 === 1 && v !== 0 && /^[\d\s()+\-−×÷^*/=]+$/.test(it.prompt);
      add('math', 'near-miss', it, String(flip ? -v : v + (i % 3 === 0 ? 1 : -1)), false, flip ? 'sign flipped' : 'off by one');
    }
  });
  return cases;
}

const GRADE_QUESTION = {
  acceptable: {
    type: 'noul',
    instructions: "Is learner_answer an acceptable answer to question, given reference_answer and other_accepted_answers? Judge meaning and correctness the way a careful teacher would.",
    criteria: {
      true: 'The learner answer says the same thing as the reference answer or one of the other accepted answers, with correct grammar and form. Differences only in accents, capital letters, spacing, final punctuation, a contraction, or an optional subject pronoun do not matter, and neither does a different but equally correct word choice or word order.',
      false: 'The learner answer has a real error: a different word, number or value, a different person, tense, mood, gender or agreement, a mistake the question asked to fix left in place, or a requirement of the question ignored (such as lowest terms).',
    },
  },
};

function gradingState(c) {
  return {
    question: c.question,
    reference_answer: c.reference,
    other_accepted_answers: c.accepted.length ? c.accepted : 'none',
    learner_answer: c.learner,
  };
}

// ── task 2: placement-unit location ─────────────────────────────────────────

function unitCases() {
  // eslint-disable-next-line global-require
  const testers = require('./placement-testers');
  // eslint-disable-next-line global-require
  const rules = require('../config/subject-placement');
  const judges = (trackId, tag) => readJson(path.join(ROOT, 'curriculum-build', 'placement-judge', `${trackId}${tag}.json`), {});
  const cases = [];
  for (const trackId of ['english', 'reading', 'math']) {
    const mean = judges(trackId, '-units-mean');
    const mimo = judges(trackId, '-units');
    const claude = judges(trackId, '-units-claude');
    const byGrade = rules.gradesFor(trackId).map((gradeId) => shuffle(testers.unitQuestions(trackId, gradeId).filter((q) => mean[q.key] && mimo[q.key] && claude[q.key]), `u:${gradeId}`).map((q) => ({ ...q, gradeId })));
    // Round robin across the grades, so every grade is sampled.
    const picked = [];
    for (let r = 0; picked.length < 50; r++) {
      let any = false;
      for (const list of shuffle(byGrade, `rr:${trackId}:${r}`)) {
        if (list[r] && picked.length < 50) { picked.push(list[r]); any = true; }
      }
      if (!any) break;
    }
    for (const q of picked) {
      const units = testers.unitsOf(trackId, q.gradeId);
      const criteria = { U0: 'Before this grade starts: earlier grades or everyday knowledge are enough.' };
      units.forEach((u, i) => {
        criteria[`U${i + 1}`] = u.lessons.map((l) => `${l.title}${l.covers ? ` (${String(l.covers).slice(0, 110)})` : ''}`).join(' | ');
      });
      cases.push({
        id: `u:${trackId}:${q.key}`,
        track: trackId,
        grade_id: q.gradeId,
        grade: curriculum.getGrade(trackId, q.gradeId).name,
        units: units.length,
        written_for: q.unit,
        mean: mean[q.key].unit,
        mimo: mimo[q.key].unit,
        claude: claude[q.key].unit,
        question: q.prompt,
        options: q.choices,
        answer: q.answer,
        criteria,
      });
    }
  }
  return cases;
}

function unitQuestion(c) {
  return {
    unit: {
      type: 'choice',
      instructions: `This is one grade of a ${c.track} curriculum ("${c.grade}"), its units in order from U1. Which is the FIRST unit by which a learner who has worked through every unit up to and including it would reliably answer the question in the state (about 9 in 10 such learners right)? Choose U0 if a learner reliably answers it before this grade starts. Judge from what the question actually requires; multiple choice is answered by recognising the right option, which is easier than producing it.`,
      criteria: c.criteria,
    },
  };
}

// ── task 3: blind multiple-choice answering ─────────────────────────────────

function blindCases() {
  const cases = [];
  const mc = (it) => it.format === 'multiple_choice' && it.choices.length >= 2 && it.choices.length <= 8;
  const take = (trackId, n, skills, group) => {
    const per = Math.ceil(n / skills.length) + 1;
    const items = shuffle(skills.flatMap((s) => itemsOf(s, per, `b:${trackId}`, mc)), `b:${trackId}`);
    const seen = new Set(cases.map((x) => x.key));
    let k = 0;
    for (const it of items) {
      if (k >= n) break;
      const key = bank.itemKey(it);
      if (seen.has(key)) continue;
      seen.add(key);
      const letters = 'ABCDEFGH';
      const order = shuffle(it.choices, `o:${key}`);
      cases.push({
        id: `b${cases.length + 1}`,
        key,
        group,
        skill: it.skill_id,
        difficulty: it.difficulty,
        question: it.prompt,
        passage: it.passage || null,
        options: Object.fromEntries(order.map((o, i) => [letters[i], o])),
        answer_letter: letters[order.indexOf(it.answer)],
        answer: it.answer,
      });
      k++;
    }
  };
  take('english', 50, skillsOf('english').filter((s) => !skillsOf('reading').includes(s)), 'english');
  take('reading', 50, skillsOf('reading'), 'reading');
  take('spanish', 50, skillsOf('spanish'), 'spanish');
  take('math', 50, skillsOf('math'), 'math');
  return cases;
}

function blindQuestion(c) {
  return {
    answer: {
      type: 'choice',
      instructions: 'Which option is the correct answer to the question in the state? Work it out; exactly one option is right.',
      criteria: c.options,
    },
  };
}

function blindState(c) {
  return c.passage ? { passage: c.passage, question: c.question } : { question: c.question };
}

// ── running a task ──────────────────────────────────────────────────────────

const TASKS = {
  grading: { build: gradingCases, state: gradingState, questions: () => GRADE_QUESTION },
  units: { build: unitCases, state: (c) => ({ question: c.question, options: c.options, keyed_answer: c.answer }), questions: unitQuestion },
  blind: { build: blindCases, state: blindState, questions: blindQuestion },
};

function cachePath(task) { return path.join(OUT, `${task}.json`); }

async function runTask(task, limit = Infinity) {
  const def = TASKS[task];
  const cases = def.build();
  writeJson(path.join(OUT, `${task}-cases.json`), cases);
  const cache = readJson(cachePath(task), {});
  const todo = cases.filter((c) => !cache[c.id]).slice(0, limit);
  console.log(`${task}: ${cases.length} cases, ${todo.length} to ask`);
  await preflight(task);
  let done = 0;
  await pool(todo, PARALLEL, async (c) => {
    try {
      const data = await decide(task, def.state(c), def.questions(c));
      if (data && data.answers) {
        cache[c.id] = { answers: data.answers, usage: data.usage, model: data.model };
        done++;
        if (done % 25 === 0) { writeJson(cachePath(task), cache); console.log(`  ${done}/${todo.length}  counted $${ledger.counted_cost.toFixed(6)}`); }
      }
    } catch (err) {
      if (!(err instanceof BudgetStop)) console.log(`  ${c.id}: ${err.message}`);
    }
  });
  writeJson(cachePath(task), cache);
  console.log(`${task}: ${done} answered this run; ledger: ${ledger.calls} calls, ${ledger.input_tokens} input tokens, reported $${ledger.reported_cost.toFixed(6)}, counted $${ledger.counted_cost.toFixed(6)}`);
  if (stopped) console.log(`STOPPED: ${stopped}`);
}

/** Five calls across the three tasks, to confirm the format and the cost per call. */
async function probe() {
  await preflight('probe');
  const g = gradingCases();
  const u = unitCases();
  const b = blindCases();
  const picks = [['grading', g[0]], ['grading', g.find((c) => !c.truth)], ['units', u[0]], ['blind', b[0]], ['blind', b.find((c) => c.group === 'reading')]];
  for (const [task, c] of picks) {
    const def = TASKS[task];
    // eslint-disable-next-line no-await-in-loop
    const data = await decide(`probe-${task}`, def.state(c), def.questions(c));
    console.log(`\n${task} ${c.id}: ${JSON.stringify(data && data.answers).slice(0, 600)}`);
    console.log(`  usage ${JSON.stringify(data && data.usage)}  listed-price cost $${(((data && data.usage && data.usage.input_tokens) || 0) * PRICE).toFixed(8)}  model ${data && data.model}`);
    const cache = readJson(cachePath(task), {});
    if (data && data.answers) { cache[c.id] = { answers: data.answers, usage: data.usage, model: data.model }; writeJson(cachePath(task), cache); }
  }
  const after = await keyUsage('after probe');
  console.log(`\nkey usage after probe: $${after.toFixed(6)}; delta since start $${(after - ledger.start_usage).toFixed(6)}; counted $${ledger.counted_cost.toFixed(6)}`);
}

// ── metrics ─────────────────────────────────────────────────────────────────

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');

function gradingReport() {
  const cases = readJson(path.join(OUT, 'grading-cases.json'), []);
  const cache = readJson(cachePath('grading'), {});
  const rows = cases.filter((c) => cache[c.id]).map((c) => ({ ...c, p: cache[c.id].answers.acceptable.noul }));
  const conf = (pred) => {
    const m = { tp: 0, fp: 0, tn: 0, fn: 0 };
    rows.forEach((r) => {
      const y = pred(r);
      if (y == null) return;
      if (y && r.truth) m.tp++; else if (y && !r.truth) m.fp++; else if (!y && !r.truth) m.tn++; else m.fn++;
    });
    const n = m.tp + m.fp + m.tn + m.fn;
    return { ...m, n, acc: (m.tp + m.tn) / n, far: m.fp / (m.fp + m.tn), frr: m.fn / (m.fn + m.tp) };
  };
  const line = (name, m) => `| ${name} | ${m.n} | ${pct(m.tp + m.tn, m.n)} | ${m.fp}/${m.fp + m.tn} = ${pct(m.fp, m.fp + m.tn)} | ${m.fn}/${m.fn + m.tp} = ${pct(m.fn, m.fn + m.tp)} | TP ${m.tp} FP ${m.fp} TN ${m.tn} FN ${m.fn} |`;
  const out = [];
  out.push(`Cases answered: ${rows.length} of ${cases.length} (${rows.filter((r) => r.truth).length} acceptable, ${rows.filter((r) => !r.truth).length} not).`, '');
  out.push('| Grader | n | Accuracy | False accepts | False rejects | Confusion |', '|---|---|---|---|---|---|');
  out.push(line('Rules only (services/grading.js)', conf((r) => r.rules)));
  for (const t of [0.5, 0.7, 0.9]) out.push(line(`Jev alone, accept if p >= ${t}`, conf((r) => r.p >= t)));
  for (const t of [0.5, 0.7, 0.9]) out.push(line(`Rules, then Jev on rule rejects (p >= ${t})`, conf((r) => r.rules || r.p >= t)));
  const banded = conf((r) => (r.p >= 0.7 ? true : r.p <= 0.3 ? false : null));
  out.push(line('Jev three-way: >=0.7 accept, <=0.3 reject (rest deferred)', banded));
  out.push('', `Three-way band: decided ${banded.n} of ${rows.length} (${pct(banded.n, rows.length)}); ${rows.length - banded.n} deferred to a model or a person.`);
  // The part a model is actually needed for: answers the rules reject.
  const rej = rows.filter((r) => !r.rules);
  const rejConf = (t) => { const m = { tp: 0, fp: 0, tn: 0, fn: 0 }; rej.forEach((r) => { const y = r.p >= t; if (y && r.truth) m.tp++; else if (y) m.fp++; else if (!r.truth) m.tn++; else m.fn++; }); return m; };
  out.push('', `Answers the rules reject (where the app would call a model): ${rej.length} (${rej.filter((r) => r.truth).length} actually acceptable, ${rej.filter((r) => !r.truth).length} not).`, '');
  out.push('| Threshold | Acceptable answers rescued | Wrong answers let through |', '|---|---|---|');
  for (const t of [0.5, 0.7, 0.9]) { const m = rejConf(t); out.push(`| p >= ${t} | ${m.tp}/${m.tp + m.fn} | ${m.fp}/${m.fp + m.tn} |`); }
  out.push('', '| Group | Kind | n | Truth | Jev right at 0.5 | Jev right at 0.7 | Rules right | mean p |', '|---|---|---|---|---|---|---|---|');
  const groups = {};
  rows.forEach((r) => { const k = `${r.group}|${r.kind}`; (groups[k] = groups[k] || []).push(r); });
  for (const [k, list] of Object.entries(groups)) {
    const [g, kind] = k.split('|');
    out.push(`| ${g} | ${kind} | ${list.length} | ${list[0].truth ? 'accept' : 'reject'} | ${list.filter((r) => (r.p >= 0.5) === r.truth).length} | ${list.filter((r) => (r.p >= 0.7) === r.truth).length} | ${list.filter((r) => r.rules === r.truth).length} | ${(list.reduce((s, r) => s + r.p, 0) / list.length).toFixed(2)} |`);
  }
  const fa = rows.filter((r) => !r.truth && r.p >= 0.5).sort((a, b) => b.p - a.p);
  const fr = rows.filter((r) => r.truth && r.p < 0.5).sort((a, b) => a.p - b.p);
  out.push('', `False accepts at 0.5 (${fa.length}):`, '');
  fa.forEach((r) => out.push(`- p=${r.p.toFixed(2)} [${r.group}, ${r.why}] Q: ${r.question.slice(0, 90)} | key: ${r.reference} | learner: ${r.learner}`));
  out.push('', `False rejects at 0.5 (${fr.length}):`, '');
  fr.forEach((r) => out.push(`- p=${r.p.toFixed(2)} [${r.group}, ${r.why}] Q: ${r.question.slice(0, 90)} | key: ${r.reference} | learner: ${r.learner}`));
  return out.join('\n');
}

function unitsReport() {
  const cases = readJson(path.join(OUT, 'units-cases.json'), []);
  const cache = readJson(cachePath('units'), {});
  const rows = cases.filter((c) => cache[c.id]).map((c) => {
    const a = cache[c.id].answers.unit;
    const pred = Number(String(a.choice).replace(/^U/, ''));
    const expected = Object.entries(a.probabilities || {}).reduce((s, [k, p]) => s + Number(k.replace(/^U/, '')) * p, 0);
    return { ...c, pred, expected, confidence: a.confidence };
  });
  const stats = (list, f) => {
    const d = list.map(f);
    return {
      n: d.length,
      exact: d.filter((x) => Math.abs(x) <= 0.5).length,
      w1: d.filter((x) => Math.abs(x) <= 1).length,
      w2: d.filter((x) => Math.abs(x) <= 2).length,
      mae: d.reduce((s, x) => s + Math.abs(x), 0) / Math.max(1, d.length),
      bias: d.reduce((s, x) => s + x, 0) / Math.max(1, d.length),
    };
  };
  const line = (name, s) => `| ${name} | ${s.n} | ${pct(s.exact, s.n)} | ${pct(s.w1, s.n)} | ${pct(s.w2, s.n)} | ${s.mae.toFixed(2)} | ${s.bias >= 0 ? '+' : ''}${s.bias.toFixed(2)} |`;
  const out = [];
  out.push(`Questions answered: ${rows.length} of ${cases.length}. "Exact" is within half a unit of the two-judge mean (the mean is often x.5).`, '');
  out.push('| Comparison | n | Exact | Within 1 | Within 2 | Mean abs. error (units) | Bias |', '|---|---|---|---|---|---|---|');
  out.push(line('Jev (top choice) vs two-judge mean', stats(rows, (r) => r.pred - r.mean)));
  out.push(line('Jev (probability-weighted unit) vs mean', stats(rows, (r) => r.expected - r.mean)));
  out.push(line('Writer\'s unit (where it was written for) vs mean', stats(rows, (r) => r.written_for - r.mean)));
  out.push(line('MiMo vs Claude (judge-to-judge, same questions)', stats(rows, (r) => r.mimo - r.claude)));
  out.push(line('Jev (top choice) vs MiMo', stats(rows, (r) => r.pred - r.mimo)));
  out.push(line('Jev (top choice) vs Claude', stats(rows, (r) => r.pred - r.claude)));
  out.push('', '| Track | n | Jev exact | Jev within 1 | Jev within 2 | Jev MAE | MiMo-vs-Claude within 1 | Writer within 1 |', '|---|---|---|---|---|---|---|---|');
  for (const t of ['english', 'reading', 'math']) {
    const list = rows.filter((r) => r.track === t);
    const s = stats(list, (r) => r.pred - r.mean);
    const jj = stats(list, (r) => r.mimo - r.claude);
    const wr = stats(list, (r) => r.written_for - r.mean);
    out.push(`| ${t} | ${s.n} | ${pct(s.exact, s.n)} | ${pct(s.w1, s.n)} | ${pct(s.w2, s.n)} | ${s.mae.toFixed(2)} | ${pct(jj.w1, jj.n)} | ${pct(wr.w1, wr.n)} |`);
  }
  for (const t of [0.3, 0.5]) {
    const hi = rows.filter((r) => r.confidence >= t);
    const s = stats(hi, (r) => r.pred - r.mean);
    out.push('', `Jev confidence >= ${t}: ${hi.length} of ${rows.length} questions; within 1 of the mean ${pct(s.w1, s.n)}, within 2 ${pct(s.w2, s.n)}, MAE ${s.mae.toFixed(2)}.`);
  }
  const u0 = rows.filter((r) => r.pred === 0).length;
  out.push('', `Jev chose U0 (before the grade) for ${u0} of ${rows.length}; the mean is 0 for ${rows.filter((r) => r.mean === 0).length}. Mean units per grade in the sample: ${(rows.reduce((s, r) => s + r.units, 0) / Math.max(1, rows.length)).toFixed(1)}.`);
  return out.join('\n');
}

function blindReport() {
  const cases = readJson(path.join(OUT, 'blind-cases.json'), []);
  const cache = readJson(cachePath('blind'), {});
  const rows = cases.filter((c) => cache[c.id]).map((c) => {
    const a = cache[c.id].answers.answer;
    return { ...c, pick: a.choice, confidence: a.confidence, pKey: (a.probabilities || {})[c.answer_letter] || 0, right: a.choice === c.answer_letter };
  });
  const out = [];
  out.push(`Items answered: ${rows.length} of ${cases.length}. Keys are audited clean, so every disagreement is a false flag the cascade would send on to Claude.`, '');
  out.push('| Group | n | Accuracy (= 1 - false-flag rate) | Chance (1/options) | Accuracy at confidence >= 0.5 (coverage) | Accuracy at confidence >= 0.8 (coverage) |', '|---|---|---|---|---|---|');
  const groups = ['english', 'reading', 'spanish', 'math'];
  const lineFor = (name, list) => {
    const chance = list.reduce((s, r) => s + 1 / Object.keys(r.options).length, 0) / Math.max(1, list.length);
    const at = (t) => { const h = list.filter((r) => r.confidence >= t); return `${pct(h.filter((r) => r.right).length, h.length)} (${h.length}/${list.length})`; };
    return `| ${name} | ${list.length} | ${pct(list.filter((r) => r.right).length, list.length)} | ${pct(chance, 1)} | ${at(0.5)} | ${at(0.8)} |`;
  };
  for (const g of groups) out.push(lineFor(g, rows.filter((r) => r.group === g)));
  out.push(lineFor('all non-math', rows.filter((r) => r.group !== 'math')));
  out.push('', '| Skill | n | right |', '|---|---|---|');
  const bySkill = {};
  rows.forEach((r) => { const k = `${r.group}/${r.skill}`; (bySkill[k] = bySkill[k] || []).push(r); });
  Object.entries(bySkill).sort().forEach(([k, l]) => out.push(`| ${k} | ${l.length} | ${l.filter((r) => r.right).length} |`));
  const wrong = rows.filter((r) => !r.right && r.group !== 'math').sort((a, b) => b.confidence - a.confidence).slice(0, 12);
  out.push('', 'Highest-confidence misses (non-math):', '');
  wrong.forEach((r) => out.push(`- conf ${r.confidence.toFixed(2)} [${r.group}/${r.skill}] ${r.question.replace(/\s+/g, ' ').slice(0, 110)} | key: ${r.answer} | Jev: ${r.options[r.pick]}`));
  return out.join('\n');
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  try {
    if (cmd === 'cases') {
      for (const task of Object.keys(TASKS)) {
        const cases = TASKS[task].build();
        writeJson(path.join(OUT, `${task}-cases.json`), cases);
        const chars = cases.reduce((s, c) => s + JSON.stringify({ model: MODEL, state: TASKS[task].state(c), questions: TASKS[task].questions(c) }).length, 0);
        console.log(`${task}: ${cases.length} cases, ~${Math.round(chars / 4)} tokens by chars/4, generous estimate $${((chars / 4) * 1.5 * PRICE).toFixed(5)}`);
      }
    } else if (cmd === 'key') {
      const u = await keyUsage('manual');
      console.log(`key usage $${u.toFixed(6)}; start $${ledger.start_usage}; delta $${(u - ledger.start_usage).toFixed(6)}; counted $${ledger.counted_cost.toFixed(6)}`);
    } else if (cmd === 'probe') await probe();
    else if (TASKS[cmd]) await runTask(cmd, arg ? Number(arg) : Infinity);
    else if (cmd === 'report') {
      console.log('## grading\n'); console.log(gradingReport());
      console.log('\n## units\n'); console.log(unitsReport());
      console.log('\n## blind\n'); console.log(blindReport());
    } else console.log('usage: node scripts/jev-pilot.js cases|probe|grading|units|blind|report|key');
  } catch (err) {
    if (err instanceof BudgetStop) console.log(`STOPPED by the budget guard: ${err.message}`);
    else throw err;
  } finally {
    saveLedger();
  }
}

if (require.main === module) main();

module.exports = { gradingCases, unitCases, blindCases, gradingReport, unitsReport, blindReport };
