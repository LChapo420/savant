/**
 * The lesson-block batch generator — "Option 3: Modular Primitives".
 *
 * One call to MiMo-V2.6-Pro per block, each answer a self-contained code module,
 * and the whole library indexed into a registry the lesson compiler reads. The
 * blocks themselves are decoupled by contract: a block is a `render(container,
 * data)` function plus the JSON schema of the data it accepts, and NOTHING
 * pedagogical is baked into its DOM logic. Content is payload; the block is the
 * instrument it is played on.
 *
 *   node scripts/generate_blocks.js                 # every block in the list
 *   node scripts/generate_blocks.js Sort_Challenge  # only these tags
 *   node scripts/generate_blocks.js --list my.json  # a different block list
 *
 * What lands where:
 *
 *   config/lesson-blocks.json         the ingest list ({id, tag, title, ...})
 *   public/engine/blocks/{Tag}.js     one generated module per block
 *   public/engine/registry.json       the index, one entry per block
 *   public/engine/showcase.html       the live testbed (not written here; static)
 *
 * The registry sits at public/engine/registry.json rather than the sketched
 * src/blocks/registry.json because these modules are loaded by the browser —
 * everything under public/ is served as-is, and the registry's `file` values
 * ("./blocks/Tag.js") resolve exactly as the sketch wrote them, relative to the
 * registry itself.
 *
 * Cost discipline: one model call per block, a queue that keeps the whole run
 * inside a modest requests-per-minute window, and a retry that only ever repeats
 * work the model got wrong — never work it already delivered.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const mimo = require('../services/providers/mimo');

/**
 * Two families, one pipeline: lesson blocks and retention primitives share the
 * contract (renderBlock(container, data), content-in-JSON fill-out) but keep
 * separate libraries, registries and bundles — a retention level and a lesson
 * draw from their own shelves.
 */
const FAMILIES = {
  lessons: {
    label: 'lesson',
    list: path.join(ROOT, 'config', 'lesson-blocks.json'),
    engineDir: path.join(ROOT, 'public', 'engine'),
    blocksDir: path.join(ROOT, 'public', 'engine', 'blocks'),
    registry: path.join(ROOT, 'public', 'engine', 'registry.json'),
  },
  retention: {
    label: 'retention',
    list: path.join(ROOT, 'config', 'retention-blocks.json'),
    engineDir: path.join(ROOT, 'public', 'engine', 'retention'),
    blocksDir: path.join(ROOT, 'public', 'engine', 'retention', 'blocks'),
    registry: path.join(ROOT, 'public', 'engine', 'retention', 'registry.json'),
  },
};
let FAM = FAMILIES.lessons;

const CATEGORIES = new Set(['Foundational', 'Assessment', 'Game', 'Utility', 'Retention']);
const TAG = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;

// ── the generation prompt ───────────────────────────────────────────────────

/**
 * The site's design tokens and rules, spelled out for the model rather than
 * implied. A block styled from a different palette is a block that looks broken
 * the moment it is placed on a page, and "some dark theme" is not this one.
 */
const DESIGN_SYSTEM = `SITE DESIGN SYSTEM (mandatory):
- Background base: #090d16 (page), #111827 (card surfaces).
- Borders: #1f293d subtle, #334155 active/input.
- Primary accent: #38bdf8 (cyan/sky) with glow rgba(56, 189, 248, 0.15).
- Status accents: #34d399 success, #f87171 misconception/error, #fbbf24 caution/streak.
- Typography: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
  Headings high-contrast #f8fafc; secondary text #94a3b8.
- Radii 8-12px; card padding 16-20px; spacing on a 4px rhythm.
- Every color, radius and font-family must come from these values.`;

const ENGINE_RULES = `ENGINE RULES (mandatory):
- Vanilla HTML5, CSS3 and native browser APIs ONLY. No external CSS, fonts,
  scripts, CDNs, frameworks, or images fetched from anywhere. Canvas and inline
  SVG are encouraged where they earn their keep.
- SCOPED STYLING: every class name and selector you emit must be prefixed with
  the block's own snake_case tag (for example .sort_challenge__bin), or styles
  must be injected inside a single container-scoped <style> built the same way.
  A block may never restyle anything outside its own container.
- Sub-second, tactile feedback on every interaction: state changes are visible
  immediately, transitions are short (120-200ms), and respect
  prefers-reduced-motion.
- Must reflow cleanly from 320px phones to wide desktops without breaking layout.
- Touch-first: tappable hit targets at least 40px tall; never drag-only.`;

const DECOUPLING_RULES = `DECOUPLING RULES (mandatory — this is the architecture):
- The block is an instrument, not a lesson. EVERY piece of subject content —
  questions, answers, explanations, examples, labels — arrives through the data
  argument. Hardcoding any pedagogical content inside the renderer is a defect.
- A lesson is authored by filling data against the schema and NEVER by recoding
  this renderer: the block is written once here and every later lesson is pure
  JSON. That is the whole economy of the system — respect it absolutely.
- The renderer must be reusable verbatim with a different payload: same layout,
  same wiring, different content.
- Treat data as untrusted shape-wise: render usefully when optional fields are
  missing rather than throwing.`;

const SCOPE_LOCK = `SCOPE LOCK (mandatory — build only what the description says):
- Build EXACTLY the block the description names and NOTHING else. The
  description is a complete specification: if it does not name a feature, the
  block must not have it.
- FORBIDDEN unless the description explicitly calls for them: questions,
  quizzes, multiple choice, true/false, yes/no, "state it in your own words"
  prompts, confidence sliders, hint ladders, self-assessment or reflection
  boxes, analysis or explanation panels, hide/show-detail buttons, tabs,
  accordions, sort controls, carousels, sound toggles — or any other button,
  input, or chrome not named in the description.
- A block whose description is a display — a table, a card, a diagram, a
  banner, a badge, a block of text — is STATIC: it must create zero buttons and
  zero inputs.
- An interactive block exposes ONLY the one interaction its description names,
  plus at most the controls that interaction strictly requires.
- Never bolt a question or a reflection onto a display block "for engagement".
  A feature worth having is worth its OWN block in the library — never smuggle
  one in.`;

const OUTPUT_CONTRACT = `OUTPUT CONTRACT (mandatory):
Reply only through the tool, with exactly one JSON object:
{
  "schema":         A JSON Schema (draft-07 style) describing the block's data
                    payload — every field the renderer reads, with types,
                    required-ness and short descriptions. Root type "object".
  "renderFunction": The complete source of ONE function, exactly:
                    function render(container, data) { ... }
                    It must be executable as-is. It clears/fills the container,
                    may inject its scoped <style> once per page, wires its own
                    events, and is safe to call again on the same container.
  "testPayload":    A realistic, high-retention sample dataset in a Grades 11-12
                    ELA or STEM context (rhetoric, close reading, physics,
                    algebra...), exercising every field of the schema and showing
                    the block working end to end. Plain JSON matching the schema.
}
In renderFunction: no fetch, no require, no imports, no eval, no new Function,
no document.write, no network of any kind, and no native dialogs (alert, confirm,
prompt) — feedback lives in the block's own styled UI.`;

function buildPrompts(block) {
  const familyIntro = FAM.label === 'retention'
    ? 'These are RETENTION-ENGINE blocks: the retrieval-practice machinery played at'
      + ' RETENTION levels, where the job is to strengthen recall — the learner must'
      + ' produce or recognize from memory, never merely read. Design for retrieval'
      + ' pressure and fast, honest feedback.'
    : 'These are lesson blocks: the exposition and practice machinery of taught'
      + ' lessons.';

  const system = [
    'You are an elite learning-interaction engineer building modular lesson blocks',
    'for a dark, high-tactility educational app. You produce complete, runnable,',
    'vanilla-JS render modules that satisfy a strict output contract.',
    '',
    familyIntro,
    '',
    DESIGN_SYSTEM,
    '',
    ENGINE_RULES,
    '',
    DECOUPLING_RULES,
    '',
    SCOPE_LOCK,
    '',
    OUTPUT_CONTRACT,
  ].join('\n');

  const user = [
    `BLOCK TO BUILD: ${block.title}`,
    `TAG: ${block.tag} (all class names and the schema $id must use this)`,
    `CATEGORY: ${block.category}`,
    `PEDAGOGICAL DESCRIPTION: ${block.description}`,
    ...(block.bestFor ? [`LEARNER FIT: ${block.bestFor} — tune the ergonomics and feedback to this learner.`] : []),
    '',
    block.interactive === false
      ? 'SCOPE: DISPLAY-ONLY. This block must create ZERO buttons, ZERO inputs and'
        + ' ZERO handlers of any kind. It renders its content and stops. Any'
        + ' control at all is a scope violation.'
      : 'SCOPE: INTERACTIVE, and only for the one interaction the description'
        + ' names. Its controls are limited to what that interaction strictly'
        + ' needs — no extra questions, modes, or panels.',
    '',
    'Build this block now as the single JSON object the contract asks for.',
    'Make the testPayload rich enough that a teacher reading it recognises a real',
    'Grades 11-12 lesson moment, and make the render function the kind of thing',
    'that feels instant under a thumb.',
  ].join('\n');

  return { system, user };
}

/** The tool schema the model answers through. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'renderFunction', 'testPayload'],
  properties: {
    schema: {
      type: 'object',
      description: 'JSON Schema of the block\'s data payload. Root type "object".',
    },
    renderFunction: {
      type: 'string',
      description: 'The complete source of function render(container, data) {...}.',
    },
    testPayload: {
      type: 'object',
      description: 'A realistic Grades 11-12 ELA/STEM payload matching `schema`.',
    },
  },
};

// ── validation ──────────────────────────────────────────────────────────────

/**
 * Check a reply before it becomes a module.
 *
 * The model writes code that runs on a learner's page, so the checks are the
 * contract itself, not politeness: a renderer that fetches is a block that
 * breaks the no-network rule the whole library is built on, and a renderer that
 * does not parse is worse than no block at all.
 */
function inspectReply(reply) {
  const problems = [];
  if (!reply || typeof reply !== 'object') return ['no reply object'];

  const schema = reply.schema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    problems.push('schema: not an object');
  } else if (schema.type && schema.type !== 'object') {
    problems.push(`schema: root type is ${schema.type}, expected "object"`);
  }

  const source = String(reply.renderFunction || '');
  if (!/function\s+render\s*\(\s*container\s*,\s*data\s*\)/.test(source)) {
    problems.push('renderFunction: no `function render(container, data)` signature');
  }
  if (/require\s*\(|^\s*import\s|fetch\s*\(|XMLHttpRequest|new WebSocket|eval\s*\(|new Function\s*\(|document\s*\.\s*write|\b(?:alert|confirm|prompt)\s*\(/.test(source)) {
    problems.push('renderFunction: external dependency, eval-like call, or native dialog present');
  }
  if (/<script[^>]+\bsrc\s*=|<link[^>]+\bhref\s*=|https?:\/\/[^"'\s]+\.(js|css|woff)/i.test(source)) {
    problems.push('renderFunction: loads an external script/style/font');
  }
  // Does it even parse? A syntax error here is a white page later.
  try {
    // eslint-disable-next-line no-new-func
    new Function(`return (${source});`);
  } catch (err) {
    problems.push(`renderFunction: does not parse (${err.message})`);
  }

  const payload = reply.testPayload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    problems.push('testPayload: not an object');
  }

  return problems.slice(0, 10);
}

// ── the module file ─────────────────────────────────────────────────────────

/**
 * Wrap the model's three answers into one self-contained module.
 *
 * The wrapper is written here rather than asked for from the model: the
 * registration shape is the contract between every block and the compiler, and
 * a shape the model can drift is a shape the library can break on. The model
 * writes the renderer; the machine writes the envelope.
 */
function moduleFor(block, reply) {
  const schema = JSON.stringify(reply.schema, null, 2);
  const payload = JSON.stringify(reply.testPayload, null, 2);
  return `/* ${block.tag} — ${block.title} (${block.category})
 *
 * Generated by scripts/generate_blocks.js. Re-run for this tag to regenerate:
 *   node scripts/generate_blocks.js ${block.tag}
 *
 * Contract: renderBlock(targetElement, blockData) — every piece of subject
 * content arrives through blockData; this file is layout and interaction only.
 */
(function (global) {
  var blocks = global.LessonBlocks = global.LessonBlocks || {
    modules: {},
    register: function (tag, mod) { this.modules[tag] = mod; },
    get: function (tag) { return this.modules[tag]; },
    all: function () {
      var out = [];
      for (var k in this.modules) if (this.modules.hasOwnProperty(k)) out.push(this.modules[k]);
      return out;
    },
  };

  var schema = ${schema};

  var testPayload = ${payload};

  /* The model-written renderer. */
  ${reply.renderFunction.trim()}

  /* The library-wide standard: same call shape for every block on the site. */
  function renderBlock(targetElement, blockData) {
    if (!targetElement) return;
    var data = (blockData === undefined || blockData === null) ? testPayload : blockData;
    render(targetElement, data);
  }

  blocks.register(${JSON.stringify(block.tag)}, {
    id: ${Number(block.id) || 0},
    tag: ${JSON.stringify(block.tag)},
    name: ${JSON.stringify(block.title)},
    category: ${JSON.stringify(block.category)},
    description: ${JSON.stringify(block.description)},
    schema: schema,
    testPayload: testPayload,
    render: render,
    renderBlock: renderBlock,
  });
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

// ── the registry ────────────────────────────────────────────────────────────

/**
 * Rebuild the index from the whole list, not from one run's slice of it.
 *
 * The entry shape is fixed — id, name, category, description, file, schema —
 * because the lesson compiler plans against it. A run that regenerates one
 * block re-indexes every block: regenerating one block is not permission to
 * forget the others. Schemas come from this run where there was one, then the
 * previous registry, then the module on disk — so a reindex after wiping the
 * registry can still recover everything.
 */
function schemaFromModule(tag) {
  try {
    const src = fs.readFileSync(path.join(FAM.blocksDir, `${tag}.js`), 'utf8');
    const m = src.match(/var schema = ([\s\S]*?);\r?\n\r?\n  var testPayload/);
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

function rebuildRegistry(fullList, schemasByTag) {
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(FAM.registry, 'utf8')) || {}; } catch { /* first run */ }

  const registry = {};
  for (const block of fullList) {
    const prior = existing[block.tag] || {};
    registry[block.tag] = {
      id: Number(block.id) || prior.id || 0,
      name: block.title,
      category: block.category,
      interactive: block.interactive !== false,
      description: block.description,
      ...(block.bestFor ? { bestFor: block.bestFor } : {}),
      file: `./blocks/${block.tag}.js`,
      schema: schemasByTag[block.tag] || prior.schema || schemaFromModule(block.tag) || null,
    };
  }
  fs.writeFileSync(FAM.registry, `${JSON.stringify(registry, null, 2)}\n`);
  writeBundle(registry);
  return registry;
}

/**
 * Every module in one file, in registry order.
 *
 * 107 separate <script> tags is 107 round trips, and browsers queue them a few
 * at a time — minutes of "loading" on a cold cache for what is one concatenated
 * read. Each module is a self-registering IIFE, so concatenation is safe: they
 * share nothing but the registry object they write themselves into. The
 * showcase loads this one file; the per-file modules stay for the compiler's
 * targeted loads and for review.
 */
function writeBundle(registry) {
  const parts = Object.keys(registry).map((tag) => {
    const file = path.join(FAM.blocksDir, `${tag}.js`);
    try {
      return `\n/* ── ${tag} ─────────────────────────────────────────────── */\n${fs.readFileSync(file, 'utf8')}`;
    } catch {
      return ''; // not generated (yet); the next run folds it in
    }
  }).filter(Boolean);
  const header = '/* Lesson block bundle — every generated module in registry order.\n'
    + ' *\n'
    + ' * Written by scripts/generate_blocks.js (rebuild with --rebundle). One file,\n'
    + ' * one request: the showcase and any full-library page load this instead of\n'
    + ' * 107 separate scripts. Each module below is a self-registering IIFE.\n'
    + ' */\n';
  fs.writeFileSync(path.join(FAM.engineDir, 'bundle.js'), header + parts.join('\n'));
}

// ── the queue ───────────────────────────────────────────────────────────────

/**
 * Run the jobs with a ceiling on both parallelism and pace, and retry a failed
 * generation with backoff.
 *
 * 20-30 requests per minute is the working window: `concurrency` keeps at most
 * this many in flight and `minGapMs` spaces their starts. Retries exist for the
 * flaky middle of a long generation — a 502 from a gateway should not cost a
 * block — and are capped so one bad block cannot hold the batch hostage.
 */
async function runQueue(jobs, { concurrency = 30, minGapMs = 500 } = {}) {
  const results = new Array(jobs.length);
  let nextStart = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor++;
      const wait = Math.max(0, nextStart - Date.now());
      nextStart = Math.max(Date.now(), nextStart) + minGapMs;
      if (wait) await new Promise((r) => setTimeout(r, wait));
      results[index] = await jobs[index]();
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return results;
}

/** One block, generated and written, with repair-and-retry on a bad reply. */
async function generateBlock(block) {
  const prompts = buildPrompts(block);
  let problems = ['no reply'];
  let reply = null;
  let attempts = 0;

  for (let attempt = 0; attempt < 3 && problems.length; attempt++) {
    attempts++;
    const repair = attempt === 0 ? '' : `\n\nYour previous reply was rejected for these reasons. Fix exactly these:\n- ${problems.join('\n- ')}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await mimo.structured({
        role: 'games', // the pinned MiMo-V2.6-Pro route — one model writes the library
        system: prompts.system,
        user: prompts.user + repair,
        schema: OUTPUT_SCHEMA,
        schemaName: 'submit_block',
        // Room for the thinking as well as the code. The most intricate blocks
        // (auction ledgers, escape rooms) were coming back cut off at the tool
        // call with 12k — a starved reply, not a bad one.
        maxTokens: 24000,
        // 'parallel' opts out of the provider's per-lane chain, because this
        // script owns the batch's pacing (see runQueue). At library scale the
        // provider's serial queue would turn 107 blocks into a night's work.
        lane: 'parallel',
      });
      reply = res && (res.data !== undefined ? res.data : res);
      problems = inspectReply(reply);
    } catch (err) {
      problems = [`model call failed: ${err.message}`];
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
    }
  }

  if (problems.length) {
    console.error(`FAIL  ${block.tag}: ${problems.join('; ')}`);
    return { tag: block.tag, ok: false, problems };
  }

  fs.mkdirSync(FAM.blocksDir, { recursive: true });
  fs.writeFileSync(path.join(FAM.blocksDir, `${block.tag}.js`), moduleFor(block, reply));
  console.log(`OK    ${block.tag}  (${(reply.renderFunction.length / 1024).toFixed(1)}k chars of renderer, ${attempts} call${attempts > 1 ? 's' : ''})`);
  return { tag: block.tag, ok: true, schema: reply.schema, attempts };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const familyAt = args.indexOf('--family');
  const familyName = familyAt >= 0 ? args[familyAt + 1] : 'lessons';
  if (!FAMILIES[familyName]) {
    console.error(`unknown family "${familyName}" — one of ${Object.keys(FAMILIES).join(', ')}`);
    process.exit(1);
  }
  FAM = FAMILIES[familyName];
  const skip = new Set(familyAt >= 0 ? [familyAt + 1] : []);

  const listAt = args.indexOf('--list');
  const listFile = listAt >= 0 ? args[listAt + 1] : FAM.list;
  if (listAt >= 0) skip.add(listAt + 1);
  const wanted = args.filter((a, i) => !a.startsWith('--') && !skip.has(i));

  const fullList = JSON.parse(fs.readFileSync(listFile, 'utf8')).blocks || [];
  const list = fullList.filter((b) => wanted.length === 0 || wanted.includes(b.tag));

  for (const block of fullList) {
    if (!TAG.test(block.tag || '')) {
      console.error(`invalid tag "${block.tag}" — use Block_Tag style`);
      process.exit(1);
    }
    if (!CATEGORIES.has(block.category)) {
      console.error(`invalid category "${block.category}" for ${block.tag} — one of ${[...CATEGORIES].join(' | ')}`);
      process.exit(1);
    }
  }

  // Re-index without generating: recover every schema from the previous
  // registry or the modules themselves. For hand-edited lists and wiped
  // registries.
  if (args.includes('--reindex') || args.includes('--rebundle')) {
    const registry = rebuildRegistry(fullList, {});
    console.log(`registry rebuilt from ${listFile}: ${Object.keys(registry).length} entries`);
    console.log(`bundle: ${path.join(FAM.engineDir, 'bundle.js')}`);
    return;
  }

  if (!list.length) {
    console.error(`no blocks to generate (list: ${listFile})`);
    process.exit(1);
  }

  if (!mimo.isConfigured || !mimo.isConfigured()) {
    console.error('MiMo is not configured — set MIMO_API_KEY in .env');
    process.exit(1);
  }

  console.log(`generating ${list.length} block${list.length > 1 ? 's' : ''} with ${mimo.modelFor('games')}`
    + ` (queue: 30 in flight)`);
  const t0 = Date.now();

  const results = await runQueue(
    list.map((block) => () => generateBlock(block)),
    { concurrency: 30, minGapMs: 500 },
  );

  const schemasByTag = {};
  for (const r of results) if (r.ok) schemasByTag[r.tag] = r.schema;
  const registry = rebuildRegistry(fullList, schemasByTag);

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${list.length} blocks written in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`registry: ${path.relative(process.cwd(), FAM.registry)} (${Object.keys(registry).length} entries)`);
  if (ok < list.length) process.exit(1);
}

main().catch((err) => {
  console.error('generate_blocks crashed:', err && err.stack || err);
  process.exit(1);
});
