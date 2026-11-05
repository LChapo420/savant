/**
 * Build the IQ in-tier placement bank: content/unit-placement/iq.json.
 *
 *   node scripts/generate-iq-unit-placement.js            write the bank (CLUSTERS=9 per tier, QUESTIONS=7 per cluster)
 *   node scripts/generate-iq-unit-placement.js --check    rebuild in memory and fail if the file on disk differs
 *   node scripts/generate-iq-unit-placement.js --gate     also run every question past the blind key check (NVIDIA, free)
 *
 * An IQ tier is 100-234 hours and 27-63 checkpoint units, far too fine to tell apart with
 * a handful of reasoning items, so the placement step here is a *cluster*: the tier cut into
 * CLUSTERS (default 9, the same ninths the tier's nine Testers cover) runs of whole units, snapped
 * to unit ends so a cluster is a whole number of the units the path already plans by.
 *
 * What a question claims to measure: the tier's own practice at that point. Question j of a
 * cluster is exactly what the course serves at one level of that cluster (curriculum.levelPlan:
 * that level's focus skill at that level's difficulty), drawn from the cluster's second half
 * (so, like the other banks, a question sits about 75% of the way through its unit). So the
 * claim is "can already do the work this stretch trains", which is the right test for skipping
 * that stretch. It is NOT a claim that adjacent clusters differ a lot: the course ramps gently
 * (about 0.2 difficulty points per cluster), which is why the bank carries its own walk shape
 * (`shape` in the file) and the sim reports wide learner slopes too.
 *
 * Correctness: every item comes from the built-in generators, whose answer is the rule that built
 * it (audited by scripts/iq-template-audit.js, which re-solves the rendered prompts). A generator
 * item that is type-in gets three wrong options made from the usual slips on the answer (digits in
 * the original order, two swapped, one off by one), never an option the item accepts. Multiple-choice
 * items keep their own options. --gate re-solves every item blind with the app's key-gate judge.
 *
 * Free: generators only; --gate uses the free NVIDIA judge and sends question text only.
 */
const fs = require('fs');
require('../services/run-cap').defaultCap(5); // hard per-process spend cap across every paid ledger; --run-cap N or RUN_CAP_USD overrides
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'unit-placement', 'iq.json');
const CLUSTERS = Number(process.env.CLUSTERS || 9);
const QUESTIONS = Number(process.env.QUESTIONS || 7);
const HASH = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

/** The walk's shape for this bank: a cluster step is gentler than a unit's (see the header). */
const SHAPE = { width: Number(process.env.IQ_WIDTH || 0.45), reliable: Number(process.env.IQ_RELIABLE || 0.3) };

function lazy() {
  // eslint-disable-next-line global-require
  return { curriculum: require('../config/curriculum'), bank: require('../content/bank'), testers: require('./placement-testers') };
}

/** Questions the blind check disagreed with (or that are weak in the wording), left out for good. Prompt text, exact. */
const EXCLUDE = new Set([
  'What is the total of 9 + 5 + 2 + 6 + 2 + 3?',
  'The letter "d" is rotated 180 degrees in the plane. Which letter shape does it most resemble?',
  'Elin is taller than Dev. Dev is taller than Cass. Which must be true?',
  'Drought is to famine as strike is to ___',
]);

const NOT_NAMES = new Set(['Who', 'What', 'Which', 'The', 'How', 'If', 'Each', 'Three', 'Four', 'Five', 'Two', 'One', 'A', 'An', 'In', 'On', 'At', 'Find', 'Name', 'Enter']);

/** Wrong options for a type-in answer: the slips a person makes on it. null when it cannot make three. */
function wrongOptions(answer, accepts, seed, prompt = '') {
  const a = String(answer);
  // A name answer ("Who ran south?"): the wrong options are the other names in the question, never a scramble of the letters.
  if (/^[A-Z][a-z]{1,}$/.test(a) && String(prompt).includes(a)) {
    const names = [...new Set((String(prompt).match(/\b[A-Z][a-z]{1,}\b/g) || []).filter((w) => w !== a && !NOT_NAMES.has(w)))];
    return names.length >= 3 ? names.slice(0, 3) : null;
  }
  const bad = new Set([a, ...(accepts || []).map(String)].map((s) => s.trim().toLowerCase()));
  const out = [];
  const add = (s) => {
    const t = String(s);
    if (!t || bad.has(t.trim().toLowerCase())) return;
    bad.add(t.trim().toLowerCase());
    out.push(t);
  };
  const num = /^-?\d+(\.\d+)?$/.test(a.trim());
  const cands = [];
  if (num) {
    const n = Number(a);
    const dec = (a.split('.')[1] || '').length;
    const fix = (x) => (dec ? x.toFixed(dec) : String(Math.round(x)));
    const step = Math.max(1, Math.round(Math.abs(n) * 0.1));
    for (const d of [1, -1, 2, -2, step, -step, 10, -10, 5, -5, 3, -3]) cands.push(fix(n + d));
    cands.push(fix(n * 2), fix(-n), fix(n / 2));
    if (a.length > 1) { const c = a.split(''); [c[c.length - 2], c[c.length - 1]] = [c[c.length - 1], c[c.length - 2]]; cands.push(c.join('')); }
  } else {
    const chars = a.split('');
    const sep = /[- ,]/.test(a) ? a.match(/[- ,]/)[0] : '';
    const parts = sep ? a.split(sep) : chars;
    const join = (p) => p.join(sep);
    cands.push(join([...parts].reverse()));
    for (let i = 0; i + 1 < parts.length; i++) { const p = [...parts]; [p[i], p[i + 1]] = [p[i + 1], p[i]]; cands.push(join(p)); }
    for (let i = parts.length - 1; i >= 0; i--) {
      for (const d of [1, -1, 2]) {
        const p = [...parts];
        const x = p[i];
        if (/^\d+$/.test(x)) p[i] = String(Math.max(0, Number(x) + d));
        else if (/^[A-Za-z]$/.test(x)) { const base = x === x.toUpperCase() ? 65 : 97; p[i] = String.fromCharCode(base + (((x.charCodeAt(0) - base + d) % 26) + 26) % 26); }
        else continue;
        cands.push(join(p));
      }
    }
    if (parts.length > 2) { cands.push(join(parts.slice(1))); cands.push(join(parts.slice(0, -1))); }
  }
  const order = cands.map((c, i) => ({ c, k: HASH(`${seed}|${c}|${i}`) }));
  // keep the likeliest slips first, break ties by hash so a bank is the same every build
  const head = cands.slice(0, 3);
  const rest = order.slice(3).sort((x, y) => x.k - y.k).map((o) => o.c);
  for (const c of [...head, ...rest]) { add(c); if (out.length === 3) break; }
  return out.length === 3 ? out : null;
}

/** One bank question from a generated item, or null. */
function toQuestion(item, skill, seed) {
  if (!item || !item.prompt || item.answer == null) return null;
  if (EXCLUDE.has(String(item.prompt).trim())) return null;
  if (item.image || item.svg || item.shapes) return null;
  const answer = String(item.answer);
  let choices;
  if (item.format === 'multiple_choice' && Array.isArray(item.choices)) {
    choices = item.choices.map(String);
    if (choices.length < 4 || new Set(choices.map((c) => c.toLowerCase())).size !== choices.length || !choices.includes(answer)) return null;
    choices = choices.slice(0, 4).includes(answer) ? choices.slice(0, 4) : [answer, ...choices.filter((c) => c !== answer).slice(0, 3)];
  } else {
    const wrong = wrongOptions(answer, item.accepts, seed, item.prompt);
    if (!wrong) return null;
    choices = [answer, ...wrong];
  }
  return { skill, prompt: String(item.prompt).trim(), answer, choices, rationale: String(item.rationale || '') };
}

function clustersOf(trackUnits, k) {
  const n = trackUnits.length;
  const per = Math.min(k, n);
  const cuts = [];
  for (let c = 1; c <= per; c++) cuts.push(Math.round((c * n) / per));
  const out = [];
  let from = 0;
  for (const cut of cuts) { if (cut > from) { out.push(trackUnits.slice(from, cut)); from = cut; } }
  return out;
}

function build() {
  const { curriculum, bank, testers } = lazy();
  const grades = {};
  const withRationale = [];
  for (const g of curriculum.getTrack('iq').grades) {
    const grade = curriculum.getGrade('iq', g.id);
    const units = testers.unitsOf('iq', g.id);
    const seen = new Set();
    const out = [];
    clustersOf(units, CLUSTERS).forEach((group, ci) => {
      const start = group[0].start;
      const end = group[group.length - 1].end;
      const titles = group.flatMap((u) => u.lessons.map((l) => l.title)).filter(Boolean);
      const questions = [];
      for (let j = 0; j < QUESTIONS * 6 && questions.length < QUESTIONS; j++) {
        const slot = questions.length;
        const frac = 0.45 + (0.55 * slot) / Math.max(1, QUESTIONS - 1);
        const level = Math.min(end, start + Math.round(frac * (end - start)));
        const plan = curriculum.levelPlan(grade, level);
        const skill = plan.focus;
        if (typeof require('../content/iq-items').GENERATORS[skill] !== 'function') continue;
        const seed = `iqpl:${g.id}:${ci + 1}:${slot}:${j}`;
        let item;
        try { item = bank.generate({ skillId: skill, difficulty: Math.round(plan.difficulty * 10) / 10, seed, stable: true }); } catch { continue; }
        const q = toQuestion(item, skill, seed);
        if (!q) continue;
        const key = `${q.prompt}||${q.answer}`;
        if (seen.has(key)) continue;
        seen.add(key);
        questions.push(q);
      }
      out.push({ key: `iq:${g.id}:${ci + 1}`, start, end, titles: titles.slice(0, 4), questions });
    });
    grades[g.id] = { units: out };
    for (const u of out) for (const q of u.questions) withRationale.push({ ...q, grade: g.id, unit: u.key });
  }
  const file = {
    track_id: 'iq',
    note: 'Generated by scripts/generate-iq-unit-placement.js from the built-in IQ generators (the rule is the key). A unit here is a cluster of whole checkpoint units, about a ninth of the tier.',
    shape: SHAPE,
    grades,
  };
  // rationale is kept out of the shipped bank: it is for the key gate only
  const shipped = JSON.parse(JSON.stringify(file));
  for (const gr of Object.values(shipped.grades)) for (const u of gr.units) for (const q of u.questions) delete q.rationale;
  return { shipped, withRationale };
}

/**
 * The blind judge for --gate: NVIDIA Nemotron Ultra only (free), question text and options only, never the key. On a 429 it waits and
 * retries; it never falls back to the app's wider chain (that chain can end at a paid key), and an unanswered question counts as unjudged.
 */
function nvidiaOnlyJudge() {
  // eslint-disable-next-line global-require
  const nvidia = require('../services/providers/nvidia');
  const SYSTEM = 'You answer multiple-choice reasoning questions. For each question, work it out yourself and give the index (0-based) of the one option you believe is correct. You are not told which option is keyed.';
  const SCHEMA = { type: 'object', properties: { picks: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' } }, required: ['index', 'chosen_index'] } } }, required: ['picks'] };
  return async (batch) => {
    const user = `${batch.map((q, i) => [`Question ${i}: ${q.prompt}`, ...q.choices.map((c, j) => `  (${j}) ${c}`)].join('\n')).join('\n\n')}\n\nReturn one pick per question, with its index.`;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await nvidia.structured({ role: 'check', system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_picks', maxTokens: 3000, models: [{ model: process.env.KEY_GATE_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], timeoutMs: 180000, attempts: 1 });
        const by = new Map(((r && r.data && r.data.picks) || []).map((p) => [p.index, p.chosen_index]));
        const picks = batch.map((_, i) => (Number.isInteger(by.get(i)) ? by.get(i) : null));
        if (picks.some((x) => x !== null)) return picks;
      } catch (err) { /* rate limit or timeout: wait and try again */ }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((ok) => setTimeout(ok, 65000));
    }
    return batch.map(() => null);
  };
}

async function gate(rows) {
  const keyGate = require('../services/key-gate');
  const judge = nvidiaOnlyJudge();
  const cacheFile = process.env.GATE_CACHE || path.join(require('os').tmpdir(), 'iq-bank-gate-cache.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  const keyOf = (q) => `${HASH(q.prompt + '|' + q.choices.join('|'))}`;
  const batch = 15;
  const bad = [];
  let unjudged = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const part = rows.slice(i, i + batch);
    const todo = part.filter((q) => !cache[keyOf(q)]);
    if (todo.length) {
      // eslint-disable-next-line no-await-in-loop
      const res = await keyGate.blindResolve(todo.map((q) => ({ prompt: q.prompt, choices: q.choices, answer: q.answer })), { judge });
      res.forEach((r, k) => { if (r.verdict !== 'unjudged') cache[keyOf(todo[k])] = r.verdict; });
      fs.writeFileSync(cacheFile, JSON.stringify(cache));
    }
    process.stdout.write(`blind key check ${Math.min(rows.length, i + batch)}/${rows.length}\n`);
  }
  let agreed = 0; let disagreed = 0;
  for (const q of rows) {
    const v = cache[keyOf(q)];
    if (v === 'agreed') agreed++; else if (v === 'disagreed') { disagreed++; bad.push(q); } else unjudged++;
  }
  console.log(`blind check (Nemotron Ultra, key withheld): ${agreed} agreed, ${disagreed} disagreed, ${unjudged} unjudged of ${rows.length}`);
  if (unjudged) process.exitCode = 1;
  return bad;
}

(async () => {
  const envFile = [process.env.ENV_FILE, path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')].find((f) => f && fs.existsSync(f));
  if (envFile) require('dotenv').config({ path: envFile });
  const { shipped, withRationale } = build();
  const text = `${JSON.stringify(shipped)}\n`;
  const total = withRationale.length;
  const tiers = Object.keys(shipped.grades).length;
  const clusters = Object.values(shipped.grades).reduce((n, g) => n + g.units.length, 0);
  const thin = Object.values(shipped.grades).flatMap((g) => g.units).filter((u) => u.questions.length < QUESTIONS).length;
  console.log(`${tiers} tiers, ${clusters} clusters, ${total} questions, ${thin} clusters short of ${QUESTIONS}`);
  if (process.argv.includes('--check')) {
    // A Windows checkout (core.autocrlf) turns the trailing newline into CRLF; the content is what is checked.
    const disk = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (disk !== text) { console.log('FAIL content/unit-placement/iq.json differs from a fresh build (run without --check)'); process.exit(1); }
    console.log('ok iq.json is the fresh build');
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`wrote ${path.relative(ROOT, OUT)}`);
  }
  if (process.argv.includes('--gate')) {
    const bad = await gate(withRationale);
    if (bad.length) { for (const q of bad.slice(0, 10)) console.log('DISAGREED', q.grade, q.unit, q.skill, JSON.stringify(q.prompt).slice(0, 140), '->', q.answer); process.exitCode = 1; }
  }
})();
