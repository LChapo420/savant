#!/usr/bin/env node
/**
 * Writes and checks the Duolingo-style engine units (content/spanish-path/units-*.js
 * format) for the Spanish grades the skill catch-up needs: Grade 3 (`advanced`) and
 * Grade 4. CONTENT ONLY: no learner data is ever sent anywhere by this script.
 *
 *   node scripts/spanish-catchup-content.js generate [--grade=advanced|g4] [--unit="Unit 4.1"] [--force]
 *   node scripts/spanish-catchup-content.js check    [--grade=…] [--unit=…] [--checker=mistral|qwen|terra]
 *   node scripts/spanish-catchup-content.js plant    [--units=4]           planted-error runs (catch rate)
 *   node scripts/spanish-catchup-content.js fix                            rewrite rejected items (generator), re-check them
 *   node scripts/spanish-catchup-content.js build                          write content/spanish-path/units-g3.js and units-g4.js
 *   node scripts/spanish-catchup-content.js report                         counts, verdicts, catch rate, spend
 *
 * Who does what (the owner's rules for this job):
 *   - the generator is DeepSeek through Standard Compute (services/providers/standard-compute.js,
 *     STANDARD_COMPUTE_PIPELINE=1); every call reserves in the shared ledger, and this job
 *     stops itself at JOB_CAP_USD (default $6) on top of the ledger's own total cap;
 *   - every item is checked by two checkers of a different model family from the generator:
 *     Mistral Large and Qwen 3.8 Max on xKiro (XKIRO_PIPELINE=1, $0 models only), with
 *     GPT 6.1 Terra on Modelflare as the reserve second checker when Qwen does not answer;
 *   - an item either checker rejects is rewritten once and re-checked by both, or dropped.
 *
 * Point the ledgers at the main checkout's data folder when this runs from a worktree:
 *   STANDARD_COMPUTE_LEDGER_FILE=…/data/standard-compute-ledger.json XKIRO_USAGE_FILE=…/data/xkiro-usage.json
 * The script refuses to call a paid provider when the ledger file does not exist (a fresh
 * ledger would forget what was already spent).
 *
 * Everything it writes lives in curriculum-build/spanish-catchup/: drafts/<unit>.json,
 * checks/<unit>.<checker>.json, planted/, fixes/, and spend.json.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'curriculum-build', 'spanish-catchup');
const DIRS = ['drafts', 'checks', 'planted', 'fixes'].map((d) => path.join(OUT, d));

// ── env: the keys live in a .env above the repo; never printed ─────────────
function loadEnv() {
  let dir = ROOT;
  for (let i = 0; i < 6; i++) {
    const f = path.join(dir, '.env');
    if (fs.existsSync(f)) {
      // eslint-disable-next-line global-require
      const parsed = require('dotenv').parse(fs.readFileSync(f));
      for (const [k, v] of Object.entries(parsed)) if (process.env[k] === undefined) process.env[k] = v;
      return;
    }
    dir = path.dirname(dir);
  }
}

const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const CMD = process.argv[2] || 'report';
const JOB_CAP_USD = Number(process.env.CATCHUP_JOB_CAP_USD || 6);

const curriculum = require('../config/curriculum');

const G4 = 'spanish_grade_04_time_food_shopping_and_core_verbs';
const GRADES = { advanced: { id: 'advanced', no: 3, file: 'units-g3.js' }, g4: { id: G4, no: 4, file: 'units-g4.js' } };
const SKILLS = ['es_greetings', 'es_vocab_core', 'es_present_ar', 'es_present_erir', 'es_numbers', 'es_gender', 'es_adjectives', 'es_ser_estar', 'es_questions'];
const ART = ['agua', 'gato', 'perro', 'pan', 'casa', 'libro', 'cafe', 'manzana', 'hotel', 'tren', 'musica', 'sol', 'luna', 'leche', 'mesa', 'telefono'];
const CAST = ['mara', 'tomas', 'rosa', 'diego'];
const TEACHING = /^(Lesson\/Topic|Speaking\/Topic|Listening\/Topic|Reading\/Topic|Writing\/Topic|Pronunciation\/Topic|Game\/Topic)$/;

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28);
const fileKey = (gradeNo, unit) => `g${gradeNo}-${unit.replace(/^Unit\s+/, '').replace('.', '_')}`;
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `${JSON.stringify(v, null, 1)}\n`); };

/** The curriculum facts a unit is written from: goal, key phrases, its lesson topics, the role-play. */
function unitSpecs(gradeKey) {
  const g = GRADES[gradeKey];
  const grade = curriculum.getGrade('spanish', g.id);
  const byUnit = new Map();
  for (const l of grade.levels) {
    if (!/^Unit \d+\.\d+$/.test(l.unit)) continue;
    if (!byUnit.has(l.unit)) byUnit.set(l.unit, []);
    byUnit.get(l.unit).push(l);
  }
  return [...byUnit.entries()].map(([unit, rows]) => {
    const intro = rows.find((r) => r.type === 'Preview') || rows[0];
    const goal = String(intro.title).replace(/^Unit \d+\.\d+:\s*/, '').trim();
    const keys = ((String(intro.covers).match(/Key phrases: (.*?)\. Hear/) || [])[1] || '').split(' / ').map((s) => s.trim()).filter(Boolean);
    const topics = rows.filter((r) => TEACHING.test(`${r.type}/${r.activity}`)).map((r) => ({ id: slug(r.title.replace(/^(Listening|Speaking|Reading|Writing|Role-Play):\s*/i, '')), title: r.title, covers: String(r.covers).slice(0, 320), level: r.level }));
    const convo = rows.find((r) => r.activity === 'Conversation Lab');
    return { grade: g.id, gradeNo: g.no, unit, goal, keys, topics, convo: convo ? String(convo.title).replace(/^Conversation Lab:\s*/, '') : null, key: fileKey(g.no, unit) };
  });
}

function selected(gradeKey) {
  const grades = gradeKey ? [gradeKey] : Object.keys(GRADES);
  let specs = grades.flatMap(unitSpecs);
  if (args.unit) specs = specs.filter((s) => s.unit === args.unit);
  return specs;
}

// ── providers (content only) ──────────────────────────────────────────────
function guardLedgers() {
  const ledgerFile = process.env.STANDARD_COMPUTE_LEDGER_FILE || path.join(ROOT, 'data', 'standard-compute-ledger.json');
  if (!fs.existsSync(ledgerFile)) throw new Error(`no Standard Compute ledger at ${ledgerFile}: set STANDARD_COMPUTE_LEDGER_FILE to the shared one`);
  const usage = process.env.XKIRO_USAGE_FILE || path.join(ROOT, 'data', 'xkiro-usage.json');
  if (!fs.existsSync(usage)) throw new Error(`no xKiro usage file at ${usage}: set XKIRO_USAGE_FILE to the shared one`);
}

const SPEND = path.join(OUT, 'spend.json');
function spend() { return readJson(SPEND, { standard_compute_usd: 0, standard_compute_calls: 0, xkiro_tokens: 0, xkiro_calls: 0, modelflare_calls: 0, modelflare_tokens: 0, log: [] }); }
function addSpend(patch, note) {
  const s = spend();
  for (const [k, v] of Object.entries(patch)) s[k] = Math.round(((s[k] || 0) + v) * 1e6) / 1e6;
  s.log.push({ at: new Date().toISOString(), note, ...patch });
  writeJson(SPEND, s);
}

async function generator(task, { system, user, schema, maxTokens }) {
  const s = spend();
  if (s.standard_compute_usd >= JOB_CAP_USD) throw new Error(`job cap reached ($${JOB_CAP_USD})`);
  // eslint-disable-next-line global-require
  const { standardCompute, post } = require('../services/providers/standard-compute');
  // eslint-disable-next-line global-require
  const sj = require('../services/providers/structured-json');
  if (!standardCompute.isEnabled()) throw new Error(`Standard Compute unavailable: ${standardCompute.status().reason}`);
  const model = standardCompute.modelFor();
  const messages = [
    { role: 'system', content: `${system}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema:\n${JSON.stringify(schema)}` },
    { role: 'user', content: user },
  ];
  // The provider's own post(): the shared ledger reserves and settles every call.
  const { payload, usage } = await post({ model, messages, max_tokens: maxTokens + 1024, temperature: 0.4, response_format: { type: 'json_object' } }, 300000, { task: `spanish_catchup_${task}` });
  // eslint-disable-next-line global-require
  const cost = require('../services/standard-compute-ledger').costOf(model, usage);
  addSpend({ standard_compute_usd: cost, standard_compute_calls: 1 }, `${task} ${model}`);
  const choice = payload.choices && payload.choices[0];
  const msg = choice && choice.message;
  const parsed = sj.parseStructured(msg, 'unit');
  if (parsed.data === undefined) throw new Error(`${task}: no JSON in the reply (finish ${choice && choice.finish_reason}, ${String((msg && msg.content) || '').length} chars, ${usage.output_tokens} tokens out)`);
  if (choice.finish_reason && choice.finish_reason !== 'stop') console.log(`  ${task}: finish_reason ${choice.finish_reason}, ${usage.output_tokens} tokens out`);
  const checked = sj.validate(schema, parsed.data);
  if (checked.errors.length) console.log(`  ${task}: schema notes: ${checked.errors.slice(0, 4).join('; ')}`);
  return checked.value || parsed.data;
}

const CHECKERS = {
  mistral: { family: 'Mistral', models: ['mistralai/mistral-large-2512'] },
  qwen: { family: 'Qwen', models: ['qwen/qwen3.8-max:free'] },
  terra: { family: 'GPT (Modelflare)', modelflare: true },
};

async function checker(name, { system, user, schema, maxTokens = 1500 }) {
  const c = CHECKERS[name];
  if (c.modelflare) {
    process.env.MODELFLARE_MODEL_PLACEMENT = process.env.MODELFLARE_MODEL_PLACEMENT || 'gpt-6.1-terra';
    // eslint-disable-next-line global-require
    const mf = require('../services/providers/modelflare');
    const out = await mf.structured({ role: 'placement', system, user, schema, schemaName: 'verdicts', maxTokens });
    if (!out) throw new Error('modelflare not enabled');
    const u = out.usage || {};
    addSpend({ modelflare_calls: 1, modelflare_tokens: (u.input_tokens || 0) + (u.output_tokens || 0) }, `check ${name}`);
    return { data: out.data || out, model: out.model || 'gpt-6.1-terra' };
  }
  // eslint-disable-next-line global-require
  const { xkiro } = require('../services/providers/xkiro');
  const out = await xkiro.structured({ system, user, schema, schemaName: 'verdicts', maxTokens, models: c.models });
  addSpend({ xkiro_tokens: (out.usage.input_tokens || 0) + (out.usage.output_tokens || 0), xkiro_calls: 1 }, `check ${name} ${out.model}`);
  return { data: out.data, model: out.model };
}

// ── generation ────────────────────────────────────────────────────────────
const PHRASE = {
  type: 'object',
  properties: {
    es: { type: 'string' }, en: { type: 'array', items: { type: 'string' } }, alt: { type: 'array', items: { type: 'string' } },
    tier: { type: 'integer' }, skill: { type: 'string', enum: SKILLS }, topic: { type: 'string' }, art: { type: 'string' },
  },
  required: ['es', 'en', 'tier', 'skill', 'topic'],
};
const LINE = { type: 'object', properties: { who: { type: 'string', enum: [...CAST, 'narrator'] }, es: { type: 'string' }, en: { type: 'string' } }, required: ['who', 'es', 'en'] };
const MC = { type: 'object', properties: { question: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' } }, required: ['question', 'choices', 'answer'] };
const UNIT_SCHEMA = {
  type: 'object',
  properties: {
    phrases: { type: 'array', items: PHRASE },
    scene: {
      type: 'object',
      properties: {
        title: { type: 'string' }, art: { type: 'string' },
        lines: { type: 'array', items: LINE },
        questions: { type: 'array', items: { type: 'object', properties: { after: { type: 'integer' }, question: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' } }, required: ['after', 'question', 'choices', 'answer'] } },
      },
      required: ['title', 'lines', 'questions'],
    },
    convo: {
      type: 'object',
      properties: {
        partner: { type: 'string', enum: CAST }, setting: { type: 'string' }, learnerCard: { type: 'string' }, learnerCardEs: { type: 'string' }, partnerCard: { type: 'string' },
        goals: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } },
        targets: { type: 'array', items: { type: 'string' } }, opening: { type: 'string' },
        script: { type: 'array', items: { type: 'object', properties: { goal: { type: 'string' }, expect: { type: 'array', items: { type: 'string' } }, reply: { type: 'string' }, hint: { type: 'string' } }, required: ['goal', 'expect', 'reply', 'hint'] } },
        nudges: { type: 'object' }, closing: { type: 'string' },
      },
      required: ['partner', 'setting', 'learnerCard', 'learnerCardEs', 'partnerCard', 'goals', 'targets', 'opening', 'script', 'nudges', 'closing'],
    },
    fills: { type: 'array', items: { type: 'object', properties: { before: { type: 'string' }, after: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' }, en: { type: 'string' } }, required: ['before', 'after', 'choices', 'answer', 'en'] } },
    chats: { type: 'array', items: { type: 'object', properties: { who: { type: 'string', enum: CAST }, es: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' } }, required: ['who', 'es', 'choices', 'answer'] } },
    reads: { type: 'array', items: { type: 'object', properties: { passage: { type: 'string' }, question: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' } }, required: ['passage', 'question', 'choices', 'answer'] } },
  },
  required: ['phrases', 'scene', 'convo', 'fills', 'chats', 'reads'],
};

const EXAMPLE = `Example of the style (Grade 2, greetings), one of each:
phrase: {"es":"Bien, gracias.","en":["Fine, thanks.","Fine, thank you.","Good, thanks."],"tier":1,"skill":"es_greetings","topic":"howareyou"}
phrase: {"es":"Estoy cansado.","en":["I'm tired.","I am tired."],"alt":["Estoy cansada.","Yo estoy cansado."],"tier":1,"skill":"es_greetings","topic":"howareyou"}
scene line: {"who":"rosa","es":"¡Buenas tardes, Tomás! ¿Qué tal?","en":"Good afternoon, Tomás! How's it going?"}
scene question: {"after":3,"question":"How is Tomás?","choices":["Tired","Very well","Sick"],"answer":0}
convo script step: {"goal":"greet","expect":["buenas","hola","buenos"],"reply":"¡Buenas! ¿Cómo estás?","hint":"Say \\"Buenas noches.\\""}
fill: {"before":"Más o","after":".","choices":["menos","bien","tarde"],"answer":0,"en":"So-so."}
chat: {"who":"tomas","es":"Hola, ¿qué tal?","choices":["Bien, gracias. ¿Y tú?","Buenas noches, adiós.","De nada."],"answer":0}
read: {"passage":"Son las nueve de la noche. Mara ve a Diego y dice: \\"¡Buenas noches, Diego!\\"","question":"When does Mara see Diego?","choices":["At night","In the morning","At noon"],"answer":0}`;

function genPrompt(spec) {
  const system = `You write beginner Spanish course content (CEFR A1) for a Duolingo-style app used by English-speaking teenagers and adults. Every Spanish string must be correct standard Spanish: all accents and tildes (á é í ó ú ü ñ), opening ¿ and ¡ marks, correct gender and number agreement, correct present-tense conjugations. Use neutral Latin American Spanish (ustedes, not vosotros) unless a topic is explicitly about vosotros. English must be natural and must mean exactly what the Spanish says. Teach only what the unit's topics name; keep sentences short (2-8 words for phrases).`;
  const user = `Write the content for ${spec.unit} of Grade ${spec.gradeNo}.
Unit goal: ${spec.goal}
Key phrases from the syllabus: ${spec.keys.join(' / ') || '(none)'}
Topics (use these exact ids for each phrase's "topic"):
${spec.topics.map((t) => `- id "${t.id}": ${t.title}. ${t.covers}`).join('\n')}
Role-play scenario: ${spec.convo || 'a short everyday conversation using the unit'}

Write:
- "phrases": 14 to 16 phrases, at least 3 per topic. Each: "es" (the Spanish), "en" (1-4 accepted English translations, the most natural first), optional "alt" (other equally correct Spanish ways to say the first English meaning, e.g. the feminine form), "tier" (1 = very frequent and useful, 2 = common, 3 = topical), "skill" (one of ${SKILLS.join(', ')}: es_present_ar for -ar verb forms, es_present_erir for -er/-ir verb forms, es_numbers for numbers/time/dates/prices, es_gender for articles and noun gender, es_adjectives for adjective agreement, possessives and demonstratives, es_ser_estar for ser/estar, es_questions for question words, es_greetings for social phrases, es_vocab_core otherwise), "topic" (a topic id above). Optionally "art": one of ${ART.join(', ')} only when the phrase is exactly that object. Include the key phrases. A phrase with only one word must include its article for nouns (e.g. "la manzana").
- "scene": a 6-8 line everyday scene with the cast ${CAST.join(', ')} (and "narrator" for at most one line), using the unit's phrases; "title" in Spanish; "art" one of ${ART.join(', ')}; 3 "questions" in English about the scene, each with 3 English choices, "answer" the 0-based index of the right one, "after" the 1-based line number after which it can be answered.
- "convo": a role-play card. "partner" one of ${CAST.join(', ')}; "setting", "learnerCard", "partnerCard" in English; "learnerCardEs" the learner's task in simple Spanish; 3-4 "goals" ({id, text} where text names the Spanish to use in parentheses); "targets" 4-6 Spanish chunks; "opening" the partner's first line in Spanish; "script": exactly one step per goal in the same order, each {goal, expect: 2-5 lowercase keyword stems WITHOUT accents that a correct learner answer would contain, reply: the partner's Spanish reply, hint: 'Say "…"' with a model Spanish answer}; "nudges": {goalId: a short Spanish prompt} for every goal; "closing" a Spanish goodbye line.
- "fills": 4 fill-the-blank items: "before" + blank + "after" makes one Spanish sentence; "choices" 3 single words, exactly one correct; "answer" its index; "en" the English of the full sentence.
- "chats": 3 items: a cast member says "es"; "choices" 3 Spanish replies, exactly one natural and correct; "answer" its index.
- "reads": 2 items: a 2-3 sentence Spanish "passage", an English "question", 3 English "choices", "answer" index.
Use only Spanish a learner of this unit could understand. Do not repeat the same Spanish phrase twice in "phrases".

${EXAMPLE}`;
  return { system, user };
}

/** Structural checks the code can make (no model): the format units-g1/g2 hold to. */
function structural(draft, spec) {
  const problems = [];
  const topicIds = new Set(spec.topics.map((t) => t.id));
  const balanced = (t) => (t.match(/¿/g) || []).length === (t.match(/\?/g) || []).length && (t.match(/¡/g) || []).length === (t.match(/!/g) || []).length;
  const seen = new Set();
  draft.phrases = (draft.phrases || []).filter((p) => {
    const why = [];
    if (!p.es || !Array.isArray(p.en) || !p.en.length) why.push('es/en');
    if (![1, 2, 3].includes(p.tier)) p.tier = 2;
    if (!topicIds.has(p.topic)) why.push(`topic ${p.topic}`);
    if (!SKILLS.includes(p.skill)) why.push(`skill ${p.skill}`);
    if (p.art && !ART.includes(p.art)) delete p.art;
    if (!balanced(p.es)) why.push('¿? ¡! not balanced');
    const k = p.es.toLowerCase().trim();
    if (seen.has(k)) why.push('duplicate');
    seen.add(k);
    if (why.length) problems.push(`phrase "${p.es}": ${why.join(', ')}`);
    return !why.length;
  });
  const okMc = (x) => Array.isArray(x.choices) && x.choices.length >= 2 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.choices.length && new Set(x.choices).size === x.choices.length;
  for (const list of ['fills', 'chats', 'reads']) {
    draft[list] = (draft[list] || []).filter((x) => { const ok = okMc(x) && (list !== 'chats' || balanced(x.es)); if (!ok) problems.push(`${list}: bad item ${JSON.stringify(x).slice(0, 80)}`); return ok; });
  }
  const sc = draft.scene || {};
  if (sc.art && !ART.includes(sc.art)) sc.art = 'casa';
  if (!sc.art) sc.art = 'casa';
  sc.lines = (sc.lines || []).filter((l) => balanced(l.es));
  sc.questions = (sc.questions || []).filter((q) => okMc(q) && q.after >= 1 && q.after <= sc.lines.length);
  if (sc.lines.length < 5) problems.push('scene: fewer than 5 lines');
  const cv = draft.convo || {};
  if (!Array.isArray(cv.goals) || cv.goals.length < 3 || !Array.isArray(cv.script) || cv.script.length !== cv.goals.length) problems.push('convo: one script step per goal');
  if (draft.phrases.length < 10) problems.push(`only ${draft.phrases.length} phrases`);
  return problems;
}

/** Run `fn` over `list`, `n` at a time. */
async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const x = list[i++]; await fn(x); } // eslint-disable-line no-await-in-loop
  }));
}

async function generate() {
  await pool(selected(args.grade), Number(args.parallel || 3), async (spec) => {
    const file = path.join(OUT, 'drafts', `${spec.key}.json`);
    if (fs.existsSync(file) && !args.force) { console.log(`skip ${spec.unit} (${spec.grade}): draft exists`); return; }
    const { system, user } = genPrompt(spec);
    let draft = null; let problems = [];
    for (let attempt = 0; attempt < 3 && !draft; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const d = await generator(`gen_${spec.key}`, { system, user, schema: UNIT_SCHEMA, maxTokens: 12000 });
        problems = structural(d, spec);
        if (problems.some((p) => /fewer than|one script step|only \d+ phrases/.test(p))) { console.log(`  ${spec.unit}: retry (${problems.join('; ')})`); continue; }
        draft = d;
      } catch (err) { console.log(`  ${spec.unit}: ${err.message}`); if (/job cap|ledger|LEDGER/i.test(err.message)) throw err; }
    }
    if (!draft) { console.log(`FAILED ${spec.unit}`); return; }
    writeJson(file, { spec, draft, structural: problems, generated_at: new Date().toISOString() });
    console.log(`wrote ${spec.key}: ${draft.phrases.length} phrases, ${draft.scene.lines.length} scene lines, ${problems.length} structural fixes`);
  });
}

// ── checking ──────────────────────────────────────────────────────────────
/** The draft as a flat list of checkable items, each with a stable id. */
function flatItems(draft) {
  const out = [];
  draft.phrases.forEach((p, i) => out.push({ id: `P${i + 1}`, text: `PHRASE es: "${p.es}"${p.alt && p.alt.length ? ` (also accepted: ${p.alt.map((a) => `"${a}"`).join(', ')})` : ''} = en: ${p.en.map((e) => `"${e}"`).join(' / ')}` }));
  draft.scene.lines.forEach((l, i) => out.push({ id: `S${i + 1}`, text: `SCENE LINE ${i + 1} (${l.who}): "${l.es}" = "${l.en}"` }));
  draft.scene.questions.forEach((q, i) => out.push({ id: `Q${i + 1}`, text: `SCENE QUESTION after line ${q.after}: ${q.question} choices: ${q.choices.map((c, k) => `${k === q.answer ? '[KEY] ' : ''}"${c}"`).join(', ')}` }));
  draft.fills.forEach((f, i) => out.push({ id: `F${i + 1}`, text: `FILL "${f.before} ___ ${f.after}" choices: ${f.choices.map((c, k) => `${k === f.answer ? '[KEY] ' : ''}"${c}"`).join(', ')}; full sentence means "${f.en}"` }));
  draft.chats.forEach((c, i) => out.push({ id: `C${i + 1}`, text: `CHAT ${c.who} says "${c.es}"; reply choices: ${c.choices.map((x, k) => `${k === c.answer ? '[KEY] ' : ''}"${x}"`).join(', ')}` }));
  draft.reads.forEach((r, i) => out.push({ id: `R${i + 1}`, text: `READ "${r.passage}" Q: ${r.question} choices: ${r.choices.map((x, k) => `${k === r.answer ? '[KEY] ' : ''}"${x}"`).join(', ')}` }));
  const cv = draft.convo;
  out.push({ id: 'V1', text: `ROLE-PLAY opening "${cv.opening}"; learner task (es) "${cv.learnerCardEs}"; targets ${cv.targets.map((t) => `"${t}"`).join(', ')}; partner replies ${cv.script.map((s) => `"${s.reply}"`).join(', ')}; hints ${cv.script.map((s) => s.hint).join(' | ')}; closing "${cv.closing}"` });
  return out;
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    rejects: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'problem'] } },
  },
  required: ['rejects'],
};

function checkPrompt(spec, items) {
  const system = 'You are a strict native-speaker reviewer of Spanish teaching content for beginners (A1). You find real errors only.';
  const user = `Review these items for ${spec.unit} (Grade ${spec.gradeNo}: ${spec.goal}).
Reject an item if ANY of these is true:
- a Spanish spelling or accent error (missing or wrong á é í ó ú ñ ü, missing ¿ or ¡);
- wrong gender or number agreement, wrong article;
- a wrong verb form or conjugation;
- the English does not mean what the Spanish says (or an accepted alternative does not mean the same thing);
- in a choice item, the [KEY] option is not the one correct answer, or another option is also correct;
- in a FILL item, "before + [KEY] + after" is not one correct sentence meaning the English given;
- unnatural Spanish no native speaker would say;
- content unsuitable for a teenage learner (alcohol, for example).
Do NOT reject for style preferences, regional variation that is correct somewhere, or missing optional alternatives.

Items:
${items.map((it) => `${it.id}: ${it.text}`).join('\n')}

Reply with {"rejects":[{"id":"…","problem":"…","fix":"…"}]} listing only the items with a real error (an empty list if none).`;
  return { system, user };
}

async function runCheck(name, spec, items) {
  const { system, user } = checkPrompt(spec, items);
  // A model "temporarily unavailable" (503) or an unusable reply is tried again, twice, after a pause.
  let out = null;
  for (let attempt = 0; !out; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      out = await checker(name, { system, user, schema: VERDICT_SCHEMA, maxTokens: 1500 });
    } catch (err) {
      if (attempt >= 2 || err.daily || !(err.status === 503 || err.status === 422 || err.status === 502 || err.status === 0)) throw err;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 20000 * (attempt + 1)));
    }
  }
  const ids = new Set(items.map((i) => i.id));
  return { model: out.model, rejects: (out.data.rejects || []).filter((r) => ids.has(String(r.id).trim())).map((r) => ({ ...r, id: String(r.id).trim() })) };
}

async function check() {
  const names = args.checker ? [args.checker] : ['mistral', 'qwen'];
  let stop = false;
  await pool(selected(args.grade), Number(args.parallel || 2), async (spec) => {
    if (stop) return;
    const d = readJson(path.join(OUT, 'drafts', `${spec.key}.json`));
    if (!d) { console.log(`no draft for ${spec.unit}`); return; }
    const items = flatItems(d.draft);
    await Promise.all(names.map(async (name) => {
      const file = path.join(OUT, 'checks', `${spec.key}.${name}.json`);
      if (fs.existsSync(file) && !args.force) return;
      try {
        // eslint-disable-next-line no-await-in-loop
        const v = await runCheck(name, spec, items);
        writeJson(file, { unit: spec.unit, grade: spec.grade, checker: name, model: v.model, items: items.length, rejects: v.rejects, at: new Date().toISOString() });
        console.log(`${spec.key} ${name}: ${v.rejects.length} of ${items.length} rejected`);
      } catch (err) {
        console.log(`${spec.key} ${name}: ${err.message}`);
        if (err.daily) { stop = true; return; }
        // Qwen not answering: GPT 6.1 Terra on Modelflare takes its place, sparingly.
        if (name === 'qwen' && args.reserve) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const v = await runCheck('terra', spec, items);
            writeJson(path.join(OUT, 'checks', `${spec.key}.qwen.json`), { unit: spec.unit, grade: spec.grade, checker: 'terra', model: v.model, items: items.length, rejects: v.rejects, at: new Date().toISOString() });
            console.log(`${spec.key} terra (for qwen): ${v.rejects.length} rejected`);
          } catch (e2) { console.log(`  terra: ${e2.message}`); }
        }
      }
    }));
  });
}

// ── planted errors: does each checker catch a known mistake? ────────────────
const PLANTS = [
  { kind: 'accent', apply: (s) => { const m = s.match(/[áéíóúñ]/); if (!m) return null; const map = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' }; return s.replace(m[0], map[m[0]]); } },
  { kind: 'gender', apply: (s) => { const r = [[/\bla\b/, 'el'], [/\bel\b/, 'la'], [/\buna\b/, 'un'], [/\bun\b/, 'una'], [/\blos\b/, 'las'], [/\blas\b/, 'los']]; for (const [re, to] of r) if (re.test(s)) return s.replace(re, to); return null; } },
  { kind: 'conjugation', apply: (s) => { const r = [[/\b(\w+)amos\b/, '$1an'], [/\b(\w+)an\b/, '$1amos'], [/\b(\w+)as\b/, '$1amos'], [/\b(\w{3,})o\b/, '$1as'], [/\b(\w+)emos\b/, '$1en'], [/\b(\w+)imos\b/, '$1en'], [/\b(\w{2,})es\b/, '$1o']]; for (const [re, to] of r) if (re.test(s)) return s.replace(re, to); return null; } },
];

async function plant() {
  const n = Number(args.units || 6);
  const specs = [...unitSpecs('advanced').slice(0, Math.ceil(n / 2)), ...unitSpecs('g4').slice(0, Math.floor(n / 2))];
  const names = args.checker ? [args.checker] : ['mistral', 'qwen'];
  for (const spec of specs) {
    const d = readJson(path.join(OUT, 'drafts', `${spec.key}.json`));
    if (!d) continue;
    const draft = JSON.parse(JSON.stringify(d.draft));
    const planted = [];
    // One of each kind on phrases, one wrong English, one wrong key: five per unit.
    const kinds = ['accent', 'gender', 'conjugation'];
    for (const kind of kinds) {
      const fn = PLANTS.find((p) => p.kind === kind).apply;
      const i = draft.phrases.findIndex((p, k) => !planted.some((x) => x.id === `P${k + 1}`) && fn(p.es) && fn(p.es) !== p.es);
      if (i < 0) continue;
      const before = draft.phrases[i].es;
      draft.phrases[i].es = fn(before);
      draft.phrases[i].alt = [];
      planted.push({ id: `P${i + 1}`, kind, before, after: draft.phrases[i].es });
    }
    const a = draft.phrases.findIndex((p, k) => !planted.some((x) => x.id === `P${k + 1}`));
    const b = draft.phrases.findIndex((p, k) => k > a + 3 && !planted.some((x) => x.id === `P${k + 1}`));
    if (a >= 0 && b >= 0) { planted.push({ id: `P${a + 1}`, kind: 'meaning', before: draft.phrases[a].en[0], after: draft.phrases[b].en[0] }); draft.phrases[a].en = [draft.phrases[b].en[0]]; }
    if (draft.fills.length) { const f = draft.fills[0]; const to = (f.answer + 1) % f.choices.length; planted.push({ id: 'F1', kind: 'key', before: f.choices[f.answer], after: f.choices[to] }); f.answer = to; }
    const items = flatItems(draft);
    for (const name of names) {
      const file = path.join(OUT, 'planted', `${spec.key}.${name}.json`);
      if (fs.existsSync(file) && !args.force) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const v = await runCheck(name, spec, items);
        const flagged = new Set(v.rejects.map((r) => r.id));
        writeJson(file, { unit: spec.unit, checker: name, model: v.model, planted: planted.map((p) => ({ ...p, caught: flagged.has(p.id) })), other_rejects: v.rejects.filter((r) => !planted.some((p) => p.id === r.id)), at: new Date().toISOString() });
        console.log(`planted ${spec.key} ${name}: caught ${planted.filter((p) => flagged.has(p.id)).length} of ${planted.length}`);
      } catch (err) { console.log(`planted ${spec.key} ${name}: ${err.message}`); if (err.daily) return; }
    }
  }
}

// ── fixing what a checker rejected ───────────────────────────────────────────
function rejectsFor(spec) {
  const out = new Map();
  for (const name of ['mistral', 'qwen']) {
    const c = readJson(path.join(OUT, 'checks', `${spec.key}.${name}.json`));
    for (const r of (c && c.rejects) || []) {
      if (!out.has(r.id)) out.set(r.id, []);
      out.get(r.id).push({ checker: c.checker, problem: r.problem, fix: r.fix || '' });
    }
  }
  return out;
}

/** Get/set the raw object behind an item id. */
function itemRef(draft, id) {
  const n = Number(id.slice(1)) - 1;
  switch (id[0]) {
    case 'P': return { list: draft.phrases, i: n };
    case 'S': return { list: draft.scene.lines, i: n };
    case 'Q': return { list: draft.scene.questions, i: n };
    case 'F': return { list: draft.fills, i: n };
    case 'C': return { list: draft.chats, i: n };
    case 'R': return { list: draft.reads, i: n };
    default: return null;
  }
}

async function fix() {
  for (const spec of selected(args.grade)) {
    const dfile = path.join(OUT, 'drafts', `${spec.key}.json`);
    const d = readJson(dfile);
    if (!d) continue;
    const ffile = path.join(OUT, 'fixes', `${spec.key}.json`);
    if (fs.existsSync(ffile) && !args.force) continue;
    const rejects = rejectsFor(spec);
    if (!rejects.size) { writeJson(ffile, { unit: spec.unit, rewritten: [], dropped: [], kept_after_recheck: [] }); continue; }
    const targets = [...rejects.keys()].filter((id) => id !== 'V1' && itemRef(d.draft, id));
    const objects = targets.map((id) => { const r = itemRef(d.draft, id); return { id, item: r.list[r.i], problems: rejects.get(id) }; });
    let rewritten = {};
    let incomplete = false;
    for (let attempt = 0; attempt < 2 && !Object.keys(rewritten).length; attempt++) {
      try {
        const schema = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, item: { type: 'object' } }, required: ['id', 'item'] } } }, required: ['items'] };
        // eslint-disable-next-line no-await-in-loop
        const out = await generator(`fix_${spec.key}`, {
          system: 'You correct beginner Spanish course items. Keep each item\'s JSON shape and keys exactly; change only what is needed to make it correct (accents, agreement, conjugation, the English meaning, or which option is the key). Content must suit a teenage learner.',
          user: `${spec.unit} (Grade ${spec.gradeNo}: ${spec.goal}). Reviewers rejected these items. Return every item corrected, same ids.\n${JSON.stringify(objects, null, 1)}`,
          schema,
          maxTokens: 9000,
        });
        for (const x of out.items || []) if (targets.includes(x.id) && x.item && typeof x.item === 'object') rewritten[x.id] = x.item;
      } catch (err) { console.log(`fix ${spec.key}: ${err.message}`); rewritten = {}; }
    }
    if (targets.length && !Object.keys(rewritten).length) incomplete = true;
    // Re-check the rewritten items with both checkers; any reject drops the item.
    const candidate = JSON.parse(JSON.stringify(d.draft));
    for (const [id, obj] of Object.entries(rewritten)) { const r = itemRef(candidate, id); r.list[r.i] = { ...r.list[r.i], ...obj }; }
    const all = flatItems(candidate);
    const recheck = all.filter((it) => rewritten[it.id]);
    const stillBad = new Set(targets.filter((id) => !rewritten[id]));
    if (recheck.length) {
      for (const name of ['mistral', 'qwen']) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const v = await runCheck(name, spec, recheck);
          for (const r of v.rejects) stillBad.add(r.id);
        } catch (err) {
          console.log(`recheck ${spec.key} ${name}: ${err.message}`);
          for (const it of recheck) stillBad.add(it.id); // unchecked is not passed
          incomplete = true;
          if (err.daily) break;
        }
      }
    }
    // A provider that did not answer is not a verdict: leave the unit for the next run (it is not shipped meanwhile).
    if (incomplete && !args.accept_incomplete) { console.log(`fix ${spec.key}: incomplete (provider), not written; run fix again`); continue; }
    const kept = Object.keys(rewritten).filter((id) => !stillBad.has(id));
    writeJson(ffile, {
      unit: spec.unit,
      rejected: Object.fromEntries(rejects),
      rewritten: Object.fromEntries(Object.entries(rewritten).filter(([id]) => kept.includes(id))),
      dropped: [...stillBad],
      convo_flagged: rejects.has('V1') ? rejects.get('V1') : null,
      at: new Date().toISOString(),
    });
    console.log(`fix ${spec.key}: ${targets.length} rejected, ${kept.length} rewritten and passed, ${stillBad.size} dropped`);
  }
}

// ── build the content files ───────────────────────────────────────────────
/** The draft with fixes applied and dropped items removed, in the units-g1/g2 shape. */
function finalUnit(spec) {
  const d = readJson(path.join(OUT, 'drafts', `${spec.key}.json`));
  if (!d) return null;
  const checked = ['mistral', 'qwen'].every((n) => fs.existsSync(path.join(OUT, 'checks', `${spec.key}.${n}.json`)));
  // Never ship an item that both checkers have not seen (--unchecked is for local development only).
  if (!checked && !args.unchecked) return null;
  const f = readJson(path.join(OUT, 'fixes', `${spec.key}.json`), null);
  const rejects = rejectsFor(spec);
  if (rejects.size && !f) return null; // rejected items not resolved yet
  const draft = JSON.parse(JSON.stringify(d.draft));
  const rewritten = (f && f.rewritten) || {};
  const drop = new Set([...((f && f.dropped) || []), ...[...rejects.keys()].filter((id) => !rewritten[id] && id !== 'V1')]);
  for (const [id, obj] of Object.entries(rewritten)) { const r = itemRef(draft, id); if (r && r.list[r.i]) r.list[r.i] = { ...r.list[r.i], ...obj }; }
  const keep = (prefix, list) => list.filter((_, i) => !drop.has(`${prefix}${i + 1}`));
  // Scene lines are a story: a dropped line drops the questions after it.
  const lineDrops = draft.scene.lines.map((_, i) => drop.has(`S${i + 1}`));
  const firstDrop = lineDrops.indexOf(true);
  const lines = firstDrop < 0 ? draft.scene.lines : draft.scene.lines.slice(0, firstDrop);
  const questions = keep('Q', draft.scene.questions).filter((q) => q.after <= lines.length);
  const prefix = `g${spec.gradeNo}u${spec.unit.replace(/^Unit\s+\d+\./, '')}_`;
  const ids = new Set();
  const phrases = keep('P', draft.phrases).map((p) => {
    let id = `${prefix}${slug(p.es)}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    const out = { id, es: p.es, en: p.en };
    if (p.alt && p.alt.length) out.alt = p.alt;
    Object.assign(out, { tier: [1, 2, 3].includes(p.tier) ? p.tier : 2, skill: p.skill, topic: p.topic });
    if (p.art) out.art = p.art;
    return out;
  });
  const cv = draft.convo;
  const convoOk = !rejects.has('V1');
  return {
    unit: spec.unit,
    grade: spec.grade,
    goal: spec.goal,
    topics: spec.topics.map((t) => ({ id: t.id, title: t.title })),
    phrases,
    scene: { title: draft.scene.title, art: draft.scene.art, lines: lines.map((l, i) => ({ who: l.who, es: l.es, en: l.en, ...(i === 0 ? { art: draft.scene.art } : {}) })), questions: questions.map((q) => ({ after: q.after, kind: 'read_respond', question: q.question, choices: q.choices, answer: q.answer })) },
    convo: convoOk ? {
      partner: cv.partner, partnerName: { mara: 'Mara', tomas: 'Tomás', rosa: 'Rosa', diego: 'Diego' }[cv.partner],
      setting: cv.setting, learnerCard: cv.learnerCard, learnerCardEs: cv.learnerCardEs, partnerCard: cv.partnerCard,
      goals: cv.goals, targets: cv.targets, opening: cv.opening, script: cv.script,
      nudges: cv.nudges, fallbackReply: '¿Perdón? ¿Puedes repetir, por favor?', closing: cv.closing, maxTurns: 10,
    } : null,
    fills: keep('F', draft.fills).map((x) => ({ before: x.before, after: x.after, choices: x.choices, answer: x.answer, en: x.en })),
    chats: keep('C', draft.chats).map((x) => ({ lines: [{ who: x.who, es: x.es }], choices: x.choices, answer: x.answer })),
    reads: keep('R', draft.reads).map((x) => ({ passage: x.passage, question: x.question, choices: x.choices, answer: x.answer })),
  };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
function toJs(units, gradeKey) {
  const g = GRADES[gradeKey];
  const body = units.map((u) => {
    const topics = u.topics.map((t) => `      { id: ${JSON.stringify(t.id)}, match: /${esc(t.title)}/i },`).join('\n');
    const rest = { ...u };
    delete rest.topics;
    const json = JSON.stringify(rest, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');
    return json.replace(/^\{\n/, `{\n    topics: [\n${topics}\n    ],\n`);
  }).join(',\n  ');
  return `// Grade ${g.no} content for the main-path Spanish activities, the same shape as
// units-g1.js (see the field notes there). Written for the skill catch-up
// (services/spanish/catch-up.js) by scripts/spanish-catchup-content.js: drafted by
// DeepSeek (Standard Compute), every item checked by Mistral Large and Qwen 3.8 Max
// (xKiro); an item either rejected was rewritten and re-checked by both, or dropped.
// Reports: curriculum-build/spanish-catchup/. Do not edit by hand; re-run the build.

module.exports = [
  ${body},
];
`;
}

function build() {
  for (const gradeKey of Object.keys(GRADES)) {
    const units = unitSpecs(gradeKey).map(finalUnit).filter(Boolean).filter((u) => u.phrases.length >= 8 && u.convo && u.scene.lines.length >= 5);
    const file = path.join(ROOT, 'content', 'spanish-path', GRADES[gradeKey].file);
    fs.writeFileSync(file, toJs(units, gradeKey));
    console.log(`wrote ${path.relative(ROOT, file)}: ${units.length} units, ${units.reduce((n, u) => n + u.phrases.length, 0)} phrases`);
  }
}

function report() {
  const rows = [];
  let planted = { mistral: [0, 0], qwen: [0, 0], either: [0, 0] };
  const byKey = {};
  for (const f of fs.existsSync(path.join(OUT, 'planted')) ? fs.readdirSync(path.join(OUT, 'planted')) : []) {
    const p = readJson(path.join(OUT, 'planted', f));
    const name = f.split('.')[1];
    for (const x of p.planted) {
      planted[name][0] += x.caught ? 1 : 0; planted[name][1] += 1;
      const k = `${p.unit}|${x.id}`;
      byKey[k] = byKey[k] || x.caught;
    }
  }
  planted.either = [Object.values(byKey).filter(Boolean).length, Object.keys(byKey).length];
  for (const gradeKey of Object.keys(GRADES)) {
    for (const spec of unitSpecs(gradeKey)) {
      const d = readJson(path.join(OUT, 'drafts', `${spec.key}.json`));
      const c = Object.fromEntries(['mistral', 'qwen'].map((n) => [n, readJson(path.join(OUT, 'checks', `${spec.key}.${n}.json`))]));
      const f = readJson(path.join(OUT, 'fixes', `${spec.key}.json`));
      const u = finalUnit(spec);
      rows.push({
        unit: `${gradeKey} ${spec.unit}`,
        items: d ? flatItems(d.draft).length : 0,
        mistral: c.mistral ? c.mistral.rejects.length : '-',
        qwen: c.qwen ? `${c.qwen.rejects.length}${c.qwen.checker === 'terra' ? ' (terra)' : ''}` : '-',
        rewritten: f ? Object.keys(f.rewritten || {}).length : 0,
        dropped: f ? (f.dropped || []).length : 0,
        shipped_phrases: u ? u.phrases.length : 0,
      });
    }
  }
  console.table(rows);
  console.log('planted catch rate', JSON.stringify(planted));
  console.log('spend', JSON.stringify({ ...spend(), log: undefined }));
  writeJson(path.join(OUT, 'report.json'), { rows, planted, spend: { ...spend(), log: undefined }, at: new Date().toISOString() });
}

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  DIRS.forEach((d) => fs.mkdirSync(d, { recursive: true }));
  if (['generate', 'check', 'plant', 'fix'].includes(CMD)) {
    loadEnv();
    process.env.STANDARD_COMPUTE_PIPELINE = '1';
    process.env.XKIRO_PIPELINE = '1';
    guardLedgers();
  }
  const fn = { generate, check, plant, fix, build, report }[CMD];
  if (!fn) { console.error(`unknown command ${CMD}`); process.exit(2); }
  await fn();
})().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { unitSpecs, structural, flatItems, PLANTS };
