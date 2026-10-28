/**
 * Check every pre-written Spanish lesson the way the app would treat it.
 *
 *   node scripts/check-spanish-prewritten.js            (all lessons)
 *   node scripts/check-spanish-prewritten.js entry/16   (some lessons)
 *   node scripts/check-spanish-prewritten.js --json     (machine-readable report)
 *
 * For each content/spanish-prewritten/<grade>/level-NNN.json:
 *
 *   row        the stored shape: every field block-levels writes for a ready
 *              lesson, user_id null, status ready, attempt 1, the right ids
 *   layout     config/level-layout still says this level is a lesson
 *              (block-levels kindFor), and the title is the curriculum's
 *   blocks     each block exists in the library, its data passes the block's
 *              schema (services/block-schema validate) and pruning removes
 *              nothing; the lesson rules of block-levels (4-10 blocks, a tag at
 *              most twice, a Foundational block, 2-5 checks)
 *   checks     each check passes the app's own check pipeline again
 *              (block-levels cleanCheck → ai.validateItem), its skill is one of
 *              the level's skills, its place is a block index
 *   key        the explanation-key agreement check (services/key-agreement.js)
 *              on every multiple-choice check and every multiple-choice block:
 *              a flag fails the lesson
 *   grading    the key and every accepted answer grade correct with
 *              services/grading.js; every other choice grades wrong; a typed
 *              prompt makes no unintended demand (case, accent, punctuation)
 *   served     servable under the key's gate and without it, never queued for
 *              a re-check, and the page payload (publicPlan) carries no answer
 *   render     every block renders in jsdom from its data, without an error,
 *              and so do the check blocks with what the page is sent
 *   spelling   no unbalanced ¿ or ¡, no line breaks, and none of the common
 *              misspellings of accented words this course teaches
 */
const fs = require('fs');
const path = require('path');

process.env.DB_READONLY = '1';
if (!process.env.DB_FILE) process.env.DB_FILE = path.join(require('os').tmpdir(), `spanish-prewritten-check-${process.pid}.json`);

const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'content', 'spanish-prewritten');
const curriculum = require('../config/curriculum');
const blockLevels = require('../services/block-levels');
const schemaCheck = require('../services/block-schema');
const grading = require('../services/grading');
const { keyAgreement } = require('../services/key-agreement');
const factReader = require('../services/fact-check-anthropic');

const ROW_FIELDS = ['user_id', 'track_id', 'grade_id', 'level', 'attempt', 'kind', 'status', 'arm', 'experiment', 'approach', 'coverage',
  'layout_fallback', 'blocks', 'checks', 'dropped', 'dropped_checks', 'verification', 'self_check', 'check_tier', 'fact_sheet', 'model',
  'layout_model', 'usage', 'seconds', 'brief_hash', 'finished_at'];

/** Unaccented or wrongly accented spellings of words these lessons use, and the right form. */
const MISSPELLED = {
  adios: 'adiós', tambien: 'también', numero: 'número', telefono: 'teléfono', musica: 'música', medico: 'médico', medica: 'médica',
  policia: 'policía', lapiz: 'lápiz', lapices: 'lápices', facil: 'fácil', dificil: 'difícil', ingles: 'inglés', frances: 'francés',
  aleman: 'alemán', japones: 'japonés', despues: 'después', aqui: 'aquí', alli: 'allí', sabado: 'sábado', miercoles: 'miércoles',
  dieciseis: 'dieciséis', veintidos: 'veintidós', veintitres: 'veintitrés', veintiseis: 'veintiséis', jovenes: 'jóvenes',
  examenes: 'exámenes', cancion: 'canción', informacion: 'información', nacion: 'nación', exámen: 'examen', jóven: 'joven',
  canciónes: 'canciones', examénes: 'exámenes', pizarron: 'pizarrón', boligrafo: 'bolígrafo', cuantos: 'cuántos', cuantas: 'cuántas',
  mexico: 'México', peru: 'Perú', panama: 'Panamá', bogota: 'Bogotá', simpatico: 'simpático', simpatica: 'simpática', rapido: 'rápido',
  arbol: 'árbol', ultimo: 'último', unico: 'único', publico: 'público', fantastico: 'fantástico', electrico: 'eléctrico',
  telefonos: 'teléfonos', bebe: 'bebé', mama: 'mamá', papa: 'papá', cafe: 'café', cafes: 'cafés', mas: 'más', esta: 'está/esta', tu: 'tu/tú', el: 'el/él', si: 'si/sí',
};
/** Words above that are real words without the accent: only checked where the context decides (skipped here). */
const AMBIGUOUS = new Set(['mas', 'esta', 'tu', 'el', 'si', 'papa', 'mama', 'bebe', 'medico', 'medica', 'numero', 'publico', 'ultimo', 'unico', 'ingles', 'cuantos', 'cuantas', 'peru', 'mexico', 'panama', 'cafe', 'cafes']);

// ── the render harness (as scripts/check-block.js sets up a page) ─────────
function makePage() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const msg = String((e && e.message) || e);
    if (!/Could not parse CSS stylesheet|Not implemented: HTML(Media|Canvas|Audio)/.test(msg)) errors.push(msg);
  });
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="stage"></div></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
  const noop = () => {};
  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop, dispatchEvent: () => false }));
  window.scrollTo = noop;
  window.Element.prototype.scrollIntoView = noop;
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = noop;
  window.HTMLMediaElement.prototype.load = noop;
  const anything = new Proxy(function any() {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anything), set: () => true, apply: () => anything });
  window.HTMLCanvasElement.prototype.getContext = () => anything;
  window.Element.prototype.animate = function animate() { return { finished: Promise.resolve(), cancel: noop, finish: noop, addEventListener: noop, removeEventListener: noop }; };
  window.Element.prototype.setPointerCapture = noop;
  window.Element.prototype.releasePointerCapture = noop;
  window.Element.prototype.hasPointerCapture = () => false;
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  return { dom, window, errors };
}

const sourceCache = new Map();
function blockSource(url) {
  if (!sourceCache.has(url)) sourceCache.set(url, fs.readFileSync(path.join(ROOT, 'public', url.replace(/^\//, '')), 'utf8'));
  return sourceCache.get(url);
}

/** Render every entry of the page payload; returns problems. */
async function renderAll(pub) {
  const problems = [];
  const lib = blockLevels.library();
  const { dom, window, errors } = makePage();
  try {
    window.eval(fs.readFileSync(path.join(ROOT, 'public', 'engine', 'compiler.js'), 'utf8'));
    for (const url of pub.files) window.eval(blockSource(url));
    for (const [i, e] of pub.entries.entries()) {
      const mod = window.LessonBlocks && window.LessonBlocks.get(e.block);
      if (!mod || typeof mod.renderBlock !== 'function') { problems.push(`render: ${e.block} did not register`); continue; }
      const host = window.document.createElement('div');
      window.document.getElementById('stage').appendChild(host);
      try {
        mod.renderBlock(host, e.data);
      } catch (err) {
        problems.push(`render: entry ${i} ${e.block} threw: ${err.message}`);
        continue;
      }
      if (!host.textContent.trim() && !host.querySelector('canvas,svg')) problems.push(`render: entry ${i} ${e.block} rendered nothing`);
      // The text a learner sees must include the block's own words, not its sample.
      const words = firstWords(e.data);
      if (words && !host.textContent.includes(words) && !(lib[e.block] && lib[e.block].family === 'checks')) {
        problems.push(`render: entry ${i} ${e.block} does not show its own text ("${words}")`);
      }
    }
    await new Promise((r) => setTimeout(r, 50));
    if (errors.length) problems.push(`render: page errors: ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    dom.window.close();
  }
  return problems;
}

/** A short string from the data that the rendered block must show. */
function firstWords(data) {
  const pick = data.title || data.prompt || data.question || data.ruleName || data.caption || data.conceptLabel || data.takeaway || null;
  if (typeof pick !== 'string') return null;
  return pick.replace(/\{\{|\}\}/g, '').slice(0, 24);
}

// ── text checks ───────────────────────────────────────────────────────────
function strings(value, at, out, skip) {
  if (typeof value === 'string') out.push([at, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${at}[${i}]`, out, skip));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (!skip.has(k)) strings(v, `${at}.${k}`, out, skip);
  }
  return out;
}

function spellingProblems(row) {
  const problems = [];
  // A fill-the-blank passage is read as the learner reads it: its segments
  // joined, each blank filled with its right option (a question may span a blank).
  // Wrong options are left out of the spelling check: a misspelled distractor
  // ("canciónes") is sometimes the point of the question.
  const blockData = row.blocks.map((b) => {
    if (b.block === 'Recall_FillTheBlank') return { ...b.data, segments: undefined, passage: b.data.segments.map((s) => (s.kind === 'blank' ? s.options[s.correctIndex] : s.text)).join('') };
    if (b.block === 'Trap_CommonError') return { ...b.data, choices: [b.data.choices[b.data.correctIndex]] };
    if (b.block === 'Interact_MultipleChoice') return { ...b.data, options: b.data.options.filter((o) => o.id === b.data.correctOptionId) };
    return b.data;
  });
  const checkData = row.checks.map((c) => ({ ...c, choices: undefined }));
  const all = strings({ approach: row.approach, coverage: row.coverage, blocks: blockData, checks: checkData }, 'lesson', [], new Set(['accepts', 'id', 'correctOptionId', 'skill_id', 'skill_name', 'source']));
  for (const [at, s] of all) {
    if (/\n/.test(s)) problems.push(`spelling: line break in ${at}`);
    // Every ¿ is closed by a ? before the next ¿, and every ¡ by a !. A mark
    // followed by a space, a comma or a colon is the symbol being named in
    // English prose ("opens with ¿ and ¡"), not an open question.
    for (const [open, close] of [['¿', '?'], ['¡', '!']]) {
      let depth = 0;
      const chars = [...s];
      chars.forEach((ch, i) => {
        if (ch === open && /[\s,:;.)]/.test(chars[i + 1] || ' ')) return;
        if (ch === open) { if (depth) problems.push(`spelling: ${open} opened twice without ${close} in ${at}: "${s.slice(0, 80)}"`); depth = 1; }
        if (ch === close && depth) depth = 0;
      });
      if (depth) problems.push(`spelling: ${open} never closed in ${at}: "${s.slice(0, 80)}"`);
    }
    for (const word of s.toLowerCase().match(/[a-záéíóúüñ]+/g) || []) {
      if (MISSPELLED[word] && !AMBIGUOUS.has(word) && MISSPELLED[word] !== word) problems.push(`spelling: "${word}" should be "${MISSPELLED[word]}" in ${at}`);
    }
  }
  return problems;
}

// ── one lesson ────────────────────────────────────────────────────────────
async function checkLesson(file, indexEntry) {
  const problems = [];
  const notes = [];
  const row = JSON.parse(fs.readFileSync(file, 'utf8'));
  const where = `${row.grade_id}/${row.level}`;

  // row
  for (const f of ROW_FIELDS) if (!(f in row)) problems.push(`row: missing ${f}`);
  if (row.user_id !== null) problems.push('row: user_id must be null (a shared base plan)');
  if (row.track_id !== 'spanish' || row.kind !== 'lesson' || row.status !== 'ready' || row.attempt !== 1) problems.push('row: must be spanish / lesson / ready / attempt 1');
  if (indexEntry && indexEntry.sha256 !== (row.prewritten && row.prewritten.sha256)) problems.push('row: index.json hash does not match the file');

  // layout
  const grade = curriculum.getGrade('spanish', row.grade_id);
  if (!grade) { problems.push('layout: no such grade'); return { where, problems, notes }; }
  if (blockLevels.kindFor(grade, row.level) !== 'lesson') problems.push(`layout: level ${row.level} is no longer a lesson (${blockLevels.kindFor(grade, row.level)})`);
  const entry = grade.levels.find((l) => l.level === row.level) || {};
  if (row.prewritten && entry.title !== row.prewritten.title) problems.push(`layout: title changed to "${entry.title}"`);
  const context = blockLevels.levelContext('spanish', row.grade_id, row.level);

  // blocks
  const lib = blockLevels.library();
  const counts = {};
  row.blocks.forEach((b, i) => {
    if (b.index !== i) problems.push(`blocks: block ${i} has index ${b.index}`);
    const libEntry = lib[b.block];
    if (!libEntry) { problems.push(`blocks: ${b.block} is not in the library`); return; }
    if (libEntry.family !== 'lessons') problems.push(`blocks: ${b.block} is not a lesson block`);
    counts[b.block] = (counts[b.block] || 0) + 1;
    schemaCheck.validate(libEntry.schema, b.data, { max: 20 }).forEach((p) => problems.push(`blocks: ${i} ${b.block}: ${p}`));
    if (JSON.stringify(schemaCheck.prune(libEntry.schema, b.data)) !== JSON.stringify(b.data)) problems.push(`blocks: ${i} ${b.block}: has a field its schema does not`);
  });
  if (row.blocks.length < 4 || row.blocks.length > 10) problems.push(`blocks: ${row.blocks.length} (a lesson has 4 to 10)`);
  Object.entries(counts).filter(([, n]) => n > 2).forEach(([t, n]) => problems.push(`blocks: ${t} used ${n} times (at most twice)`));
  if (!row.blocks.some((b) => lib[b.block] && lib[b.block].category === 'Foundational')) problems.push('blocks: no Foundational block');
  const catalog = new Set(blockLevels.catalogFor('lesson', 'spanish').map((b) => b.tag));
  row.blocks.forEach((b) => { if (!catalog.has(b.block)) problems.push(`blocks: ${b.block} is not offered to a Spanish lesson`); });

  // checks
  if (row.checks.length < 2 || row.checks.length > 5) problems.push(`checks: ${row.checks.length} (a lesson has 2 to 5)`);
  row.checks.forEach((c, i) => {
    if (c.id !== `c${i + 1}`) problems.push(`checks: check ${i} has id ${c.id}`);
    if (!context.skills.includes(c.skill_id)) problems.push(`checks: ${c.id} skill ${c.skill_id} is not one of ${context.skills.join(', ')}`);
    if (!(Number.isInteger(c.after) && c.after >= -1 && c.after < row.blocks.length)) problems.push(`checks: ${c.id} after ${c.after} is not a block`);
    const again = blockLevels.cleanCheck({ ...c }, { format: c.format, skill_id: c.skill_id }, context.difficulty);
    if (!again) problems.push(`checks: ${c.id} is refused by the app's check pipeline (${blockLevels.whyRefused(c, { format: c.format, skill_id: c.skill_id })})`);
    else {
      for (const k of ['prompt', 'answer', 'rationale', 'format', 'skill_id', 'difficulty']) {
        if (JSON.stringify(again[k]) !== JSON.stringify(c[k])) problems.push(`checks: ${c.id} ${k} changes when the app cleans it`);
      }
    }
    // key agreement
    if (c.format === 'multiple_choice') {
      const k = keyAgreement({ choices: c.choices, answer: c.answer, rationale: c.rationale });
      if (k.flagged) problems.push(`key: ${c.id}: ${k.reason}`);
    }
    // grading
    const right = grading.grade(c, c.answer);
    if (!right.correct) problems.push(`grading: ${c.id} its own key grades wrong`);
    for (const a of c.accepts || []) if (!grading.grade(c, a).correct) problems.push(`grading: ${c.id} accepted "${a}" grades wrong`);
    if (c.format === 'multiple_choice') {
      for (const ch of c.choices) if (ch !== c.answer && grading.grade(c, ch).correct) problems.push(`grading: ${c.id} wrong choice "${ch}" grades right`);
    } else {
      const others = row.checks.filter((o) => o !== c).map((o) => o.answer).filter((a) => a && a !== c.answer);
      for (const o of others) if (grading.grade(c, o).correct) problems.push(`grading: ${c.id} another check's answer "${o}" grades right`);
      const d = grading.formDemands(c.prompt);
      const demands = Object.entries(d).filter(([, v]) => v).map(([k]) => k);
      if (demands.length) notes.push(`${c.id} prompt demands ${demands.join(', ')}`);
    }
  });
  // multiple-choice blocks: their own explanation must point at their key
  row.blocks.forEach((b, i) => {
    if (b.block === 'Interact_MultipleChoice') {
      const ids = b.data.options.map((o) => o.id);
      const key = ids.indexOf(b.data.correctOptionId);
      if (key < 0) problems.push(`key: block ${i} correctOptionId is not an option`);
      const why = ((b.data.feedback || {}).byOption || {})[b.data.correctOptionId] || (b.data.feedback || {}).correct || '';
      const k = keyAgreement({ choices: b.data.options.map((o) => o.text), answerIndex: key, rationale: why });
      if (k.flagged) problems.push(`key: block ${i} ${b.block}: ${k.reason}`);
    }
    if (b.block === 'Trap_CommonError') {
      if (b.data.correctIndex >= b.data.choices.length) problems.push(`key: block ${i} correctIndex out of range`);
      if ((b.data.trapChoiceIndexes || []).includes(b.data.correctIndex)) problems.push(`key: block ${i} the correct choice is listed as a trap`);
      const k = keyAgreement({ choices: b.data.choices, answerIndex: b.data.correctIndex, rationale: b.data.correctReasoning });
      if (k.flagged) problems.push(`key: block ${i} ${b.block}: ${k.reason}`);
    }
    if (b.block === 'Recall_FillTheBlank') {
      b.data.segments.filter((s) => s.kind === 'blank').forEach((s) => {
        if (new Set(s.options).size !== s.options.length) problems.push(`key: block ${i} blank ${s.id} repeats an option`);
      });
    }
    if (b.block === 'Interact_TermConnect') {
      const left = new Set(b.data.definitions.map((d) => d.label));
      if (left.size !== b.data.definitions.length) problems.push(`key: block ${i} two definitions read the same`);
    }
    if (b.block === 'Interact_SentenceScramble') {
      const texts = b.data.chips.map((c) => c.text);
      if (new Set(texts).size !== texts.length) problems.push(`key: block ${i} two chips read the same`);
    }
  });

  // served
  const realConfigured = factReader.isConfigured;
  try {
    for (const gate of [false, true]) {
      factReader.isConfigured = () => gate;
      if (!blockLevels.servable(row)) problems.push(`served: not servable with the key's gate ${gate ? 'on' : 'off'}`);
      if (blockLevels.sonnetPending(row)) problems.push(`served: would be queued for a re-check with the gate ${gate ? 'on' : 'off'}`);
    }
  } finally {
    factReader.isConfigured = realConfigured;
  }
  const pub = blockLevels.publicPlan({ ...row, id: 1, answers: {} }, 1);
  for (const e of pub.entries.filter((x) => x.block.startsWith('Check_'))) {
    const c = row.checks.find((x) => x.id === e.data.id);
    if ('answer' in e.data || 'rationale' in e.data) problems.push(`served: check ${e.data.id} sends its answer to the page`);
    if (c && c.format === 'type_in' && JSON.stringify(e.data).toLowerCase().includes(`"${String(c.answer).toLowerCase()}"`)) problems.push(`served: ${c.id} answer appears in the page data`);
  }
  if (pub.entries.filter((x) => x.block.startsWith('Check_')).length !== row.checks.length) problems.push('served: not every check reaches the page');

  // render
  problems.push(...await renderAll(pub));

  // spelling
  problems.push(...spellingProblems(row));

  return { where, problems, notes, blocks: row.blocks.length, checks: row.checks.length, mc: row.checks.filter((c) => c.format === 'multiple_choice').length };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const only = args.filter((a) => !a.startsWith('--'));
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const lessons = index.lessons.filter((l) => !only.length || only.includes(`${l.grade_id}/${l.level}`));
  const results = [];
  for (const l of lessons) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await checkLesson(path.join(DIR, l.file), l));
  }
  const failed = results.filter((r) => r.problems.length);
  if (json) {
    console.log(JSON.stringify({ checked: results.length, failed: failed.length, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.problems.length ? 'FAIL' : 'PASS'}  ${r.where}  (${r.blocks} blocks, ${r.checks} checks)${r.notes.length ? `  note: ${r.notes.join('; ')}` : ''}`);
      r.problems.forEach((p) => console.log(`      - ${p}`));
    }
    console.log(`\n${results.length - failed.length}/${results.length} lessons pass`);
  }
  if (failed.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => { console.error(err.stack || err); process.exit(1); });
}

module.exports = { checkLesson, spellingProblems };
