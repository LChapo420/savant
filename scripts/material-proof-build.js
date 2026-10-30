/**
 * Proof run, step 1: upload one input and build its course with the app's own code and providers.
 *
 *   DB_FILE=<a COPY of the db> node -r dotenv/config scripts/material-proof-build.js --file <path> [--paste] [--title "..."] --out <dir>
 *
 * Runs services/materials.js (the same extraction the upload route uses) and services/course-builder.js with no mock,
 * so every model call goes through services/ai.js as learner data (learner-class slots only). The proof user is
 * synthetic (proof-<name>@test.invalid). Writes <out>/<name>.course.json and <name>.text.txt for the checkers
 * (scripts/material-proof-check.js) and the simulated learners (scripts/material-learner-sim.js).
 * Never point DB_FILE at the live db; the script refuses data/db.json.
 *
 * --llm sc: for PUBLIC test inputs only, build with the same builder code but send the model calls to Standard Compute
 * (DeepSeek V4.1 Flash, paid, inside services/standard-compute-ledger.js; needs STANDARD_COMPUTE_PIPELINE=1), as
 * pipeline work with no user attached. Used when the free NVIDIA tier is shared with the live tutor and too slow.
 */
const fs = require('fs');
const path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);

if (!process.env.DB_FILE || path.resolve(process.env.DB_FILE) === path.resolve(__dirname, '..', 'data', 'db.json')) {
  console.error('Set DB_FILE to a copy of the db (never the live data/db.json).');
  process.exit(2);
}

const db = require('../config/db');
const materials = require('../services/materials');
const cb = require('../services/course-builder');

(async () => {
  const file = arg('file');
  const out = arg('out');
  if (!file || !out) { console.error('usage: --file <path> --out <dir> --public [--paste] [--title t] [--llm sc]'); process.exit(2); }
  // The proof sends the text to checkers that may be pipeline-only (xKiro, Standard Compute): only public test inputs.
  if (!flag('public')) { console.error('Pass --public to confirm the file is a public test input (never learner data).'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const name = path.basename(file).replace(/\.[^.]+$/, '');
  const email = `proof-${name}@test.invalid`.toLowerCase();
  // An adult account (age check passed, no parent needed): the app lets outside AI see its text, as for any adult learner.
  const adult = { age_check: { needs_parent: false, checked_at: new Date().toISOString() } };
  let user = db.findOne('users', (u) => u.email === email) || db.insert('users', { email, role: 'learner', name: 'Proof learner', created_at: new Date().toISOString(), ...adult });
  if (!user.age_check) user = db.update('users', user.id, adult);
  for (const m of materials.list(user.id)) materials.remove(user.id, m.id);
  const t0 = Date.now();
  const added = flag('paste')
    ? materials.addPaste(user.id, arg('title', name), fs.readFileSync(file, 'utf8'))
    : await materials.addFile(user.id, fs.readFileSync(file), path.basename(file));
  if (added.error) { console.error('upload refused:', added.code, added.error); process.exit(1); }
  const mat = materials.get(user.id, added.value.id, true);
  console.log(`${name}: ${mat.kind}, ${mat.text.length} chars${mat.pages ? `, ${mat.pages} pages` : ''}, extracted in ${Date.now() - t0} ms`);
  const t1 = Date.now();
  let llm;
  if (arg('llm') === 'sc') {
    // eslint-disable-next-line global-require
    const { standardCompute } = require('../services/providers/standard-compute');
    llm = async (a) => {
      try {
        // Headroom for reasoning: DeepSeek spends most of an answer budget thinking, and a cut-off JSON is unusable.
        const r = await standardCompute.structured({ task: a.task, system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: a.maxTokens + 6000, timeoutMs: 240000 });
        spent += (r.usage && r.usage.cost_usd) || 0;
        return r;
      } catch (err) { console.warn(`standard compute: ${err.message}`); return null; }
    };
  }
  let spent = 0;
  const res = await cb.build(user.id, mat.id, llm ? { llm, concurrency: 4 } : {});
  if (llm) console.log(`Standard Compute spend for this build: $${spent.toFixed(4)}`);
  const secs = Math.round((Date.now() - t1) / 1000);
  if (res.error) { console.error(`build failed after ${secs}s:`, res.code, res.error); process.exit(1); }
  const c = res.course;
  const qn = c.skills.reduce((n, s) => n + s.questions.length, 0);
  console.log(`built in ${secs}s: status ${c.status}, ${c.units.length} units, ${c.skills.length} skills, ${qn} questions, ~${c.tokens_used} tokens, models ${c.models.join(', ')}`);
  console.log('dropped', JSON.stringify(c.dropped));
  fs.writeFileSync(path.join(out, `${name}.course.json`), JSON.stringify({ ...c, proof: { file: path.basename(file), user_id: user.id, material_id: mat.id, build_seconds: secs, chars: mat.text.length, pages: mat.pages || null, kind: mat.kind, public: true, generator: arg('llm') === 'sc' ? 'standard-compute deepseek-v4.1-flash' : 'app learner chain' } }, null, 1));
  fs.writeFileSync(path.join(out, `${name}.text.txt`), mat.text);
  db.flush();
  process.exit(0);
})();
