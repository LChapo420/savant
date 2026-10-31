/**
 * Which scorecard metrics change anything?
 *
 *   node scripts/scorecard-usage-audit.js           writes docs/SCORECARD-MAP.md
 *   node scripts/scorecard-usage-audit.js --check   writes nothing; exits 1 if any metric is dead after the learning spec (run by `npm test`)
 *
 * For each of the 100 metrics in services/scorecard/stats.js: what it means, every file that reads it, and
 * whether it changes anything a learner sees. The test is mechanical, from the code, not from claims:
 *
 *   before the learning spec (the "channels" that existed):
 *     lesson text    a hand-written lesson directive exists for a side, the metric is used for lessons (use L),
 *                    and translate.directives lets it through (memory-kind and secondary-rate stats never steer)
 *     coach text     the same for the coach (use C)
 *     structure      a knob in scorecard/contract.js KNOBS (guidance, length, items, stretch, support, context, recap)
 *     tutor plan     read by services/tutor-plan.js
 *     experiment     tried as a teaching experiment (services/personalize.js EXPERIMENTS)
 *     session        read by services/learner.js stat()
 *   A metric with none of those is DEAD: it is measured and shown and changes nothing.
 *
 *   after: + the learning spec (services/learning-spec.js METRIC_RULES). A metric is live through the spec when moving it
 *   changes a spec field that a generator reads (a prompt sentence, or a field read in code), found by building the spec
 *   at both ends of the score and comparing.
 *
 * Even a "live" lesson directive is gated: it fires only when the app is sure of the learner's side (a calibrated
 * posterior, top or bottom fifth), and at most six fire at once. That gate is why so few metrics ever changed a
 * lesson; the spec weights every metric by its confidence instead of switching it on or off.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `scorecard-audit-${process.pid}.json`);
process.on('exit', () => { for (const f of [process.env.DB_FILE, `${process.env.DB_FILE}.tmp`]) try { fs.unlinkSync(f); } catch { /* gone */ } });

const ROOT = path.join(__dirname, '..');
const { STATS, CATEGORIES } = require('../services/scorecard/stats');
const contract = require('../services/scorecard/contract');
const ls = require('../services/learning-spec');
const scorecardIndex = require('../services/scorecard');

const CHECK = process.argv.includes('--check');

// ── what the old channels were ────────────────────────────────────────────
const MEMORY_KIND = new Set(['decay_rate', 'retention_index', 'retrieval_strength']); // scorecard/index.js apply(): evidence kind 'memory'
const SECONDARY = scorecardIndex.SECONDARY_RATES;                                      // a rate read inverted as a second stat
const blocked = (id) => MEMORY_KIND.has(id) || SECONDARY.has(id);

function read(file) { try { return fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { return ''; } }

const tutorPlan = require('../services/tutor-plan');
const personalizeSrc = read('services/personalize.js');
const learnerSrc = read('services/learner.js');
const experimentStats = new Set([...personalizeSrc.matchAll(/stat: '([a-z_]+)'/g)].map((m) => m[1]));
const sessionStats = new Set([...learnerSrc.matchAll(/stat\(\s*[a-zA-Z.]+,\s*'([a-z_]+)'/g)].map((m) => m[1]));
const knobStats = new Set(Object.keys(contract.KNOBS));
const combinedStats = new Set(require('../services/scorecard/translate').COMBINED.flatMap(([a, , b]) => [a, b]));

// ── every file that mentions a metric id ──────────────────────────────────
const SCAN_DIRS = ['services', 'routes', 'config', 'content', 'middleware', 'utils', 'public/js'];
const SKIP = new Set(['services/scorecard/stats.js', 'services/learning-spec.js']);
const PLUMBING = /^services\/scorecard\/(signals|index|hooks|forgetting|irt|reliability|stats|summary)\.js$/;
function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!['node_modules', 'fixtures'].includes(e.name)) walk(rel, out); } else if (/\.(js|mjs)$/.test(e.name) && !SKIP.has(rel)) out.push(rel);
  }
  return out;
}
const files = SCAN_DIRS.flatMap((d) => walk(d)).map((f) => ({ f, text: read(f) }));
const readersOf = (id) => {
  const re = new RegExp(`(?<![a-z_])${id}(?![a-z_])`);
  const out = [];
  for (const { f, text } of files) {
    const lines = text.split('\n');
    const hits = [];
    lines.forEach((line, i) => { if (re.test(line)) hits.push(i + 1); });
    if (hits.length) out.push({ file: f, lines: hits.slice(0, 4), n: hits.length, plumbing: PLUMBING.test(f) });
  }
  return out;
};

// ── which spec fields a generator reads ───────────────────────────────────
const GROUPS = ['lesson', 'difficulty', 'scaffolding', 'practice', 'explain', 'language', 'interests', 'review', 'feedback', 'session', 'engagement', 'transfer', 'meta', 'learner'];
const specUsers = files.filter(({ text }) => /learning-spec|learningSpec/.test(text));
const codeReads = new Set(); // 'group.field' read by code
for (const { text } of specUsers) {
  for (const m of text.matchAll(new RegExp(`\\b(?:spec|s)\\.(${GROUPS.join('|')})\\.([a-zA-Z]+)`, 'g'))) codeReads.add(`${m[1]}.${m[2]}`);
}
const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = JSON.stringify(v);
  }
  return out;
};
const concrete = (s) => { const { levers, provenance, version, isDefault, ...rest } = s; return flat(rest); };

const blank = () => Object.fromEntries(STATS.map((s) => [s.id, { measured: 50, confidence: 0 }]));
const at = (id, score) => ls.buildSpecFrom({ metrics: { ...blank(), [id]: { measured: score, confidence: 95 } }, interests: ['soccer'], age: 14 });

function specEffect(id) {
  const hi = at(id, 98);
  const lo = at(id, 2);
  const a = concrete(hi);
  const b = concrete(lo);
  const fields = Object.keys(a).filter((k) => a[k] !== b[k]);
  const prompt = ls.specToPrompt(hi, { surface: 'lesson' }) !== ls.specToPrompt(lo, { surface: 'lesson' });
  const code = fields.filter((k) => codeReads.has(k));
  return { fields, prompt, code, live: prompt || code.length > 0 };
}

// ── the table ─────────────────────────────────────────────────────────────
const rows = STATS.map((s) => {
  const dirs = s.dir.filter(Boolean).length;
  const channels = [];
  if (dirs && s.use.includes('L') && !blocked(s.id)) channels.push('lesson text');
  if (dirs && s.use.includes('C') && !blocked(s.id)) channels.push('coach text');
  if (knobStats.has(s.id) && !blocked(s.id)) channels.push('structure');
  if (tutorPlan.STAT_IDS.includes(s.id)) channels.push('tutor plan');
  if (experimentStats.has(s.id)) channels.push('experiment');
  if (sessionStats.has(s.id)) channels.push('session');
  const why = [];
  if (!channels.length) {
    if (blocked(s.id)) why.push(MEMORY_KIND.has(s.id) ? 'memory-kind: never steers a lesson (03-M5)' : 'secondary rate: never steers (03-M5)');
    if (!s.use) why.push('use is empty: no writer is told');
    if (!dirs) why.push('no directive text on either side');
  }
  const rule = ls.RULE_OF.get(s.id);
  const eff = specEffect(s.id);
  const after = [...channels];
  if (eff.live) after.push('learning spec');
  return {
    s, readers: readersOf(s.id), channels, why, rule, eff,
    deadBefore: channels.length === 0,
    deadAfter: after.length === 0,
    gatedOnly: channels.length > 0,
    after,
  };
});

const deadBefore = rows.filter((r) => r.deadBefore);
const deadAfter = rows.filter((r) => r.deadAfter);
const fieldsLive = new Set(rows.flatMap((r) => r.eff.fields));

// ── the document ──────────────────────────────────────────────────────────
const md = [];
md.push('# Scorecard map: every metric, who reads it, and whether it changes anything');
md.push('');
md.push('Written by `node scripts/scorecard-usage-audit.js` from the code (do not edit by hand). The test is mechanical: a metric is **dead** when nothing that writes, orders, tests or schedules a learner\'s material reads it. Definitions are `services/scorecard/stats.js`; the learning spec is `services/learning-spec.js`.');
md.push('');
md.push('## Summary');
md.push('');
md.push(`| | Before the learning spec | After |`);
md.push(`|---|---|---|`);
md.push(`| Metrics | ${STATS.length} | ${STATS.length} |`);
md.push(`| **Dead** (change nothing) | **${deadBefore.length}** | **${deadAfter.length}** |`);
md.push(`| Live through a hand-written directive, a knob, the tutor plan, an experiment or a session read | ${rows.filter((r) => !r.deadBefore).length} | ${rows.filter((r) => !r.deadBefore).length} |`);
md.push(`| Live through the learning spec (a prompt sentence or a field read in code) | 0 | ${rows.filter((r) => r.eff.live).length} |`);
md.push(`| With a documented rule in METRIC_RULES | 0 | ${rows.filter((r) => r.rule).length} |`);
md.push('');
md.push('"Live before" is generous: it only means a path exists. A lesson directive fires only when the app is confident of the learner\'s side (a calibrated posterior of at least 0.98 and the top or bottom fifth), and at most six fire at once (`translate.js` MAX_DIRECTIVES), so on any one lesson most of the metrics marked live before did nothing. The spec reads every metric on every build, weighted by its confidence.');
md.push('');
md.push(`### Dead before (${deadBefore.length})`);
md.push('');
for (const r of deadBefore) md.push(`- \`${r.s.id}\` (${r.s.name}): ${r.why.join('; ') || 'nothing reads it'}`);
md.push('');
md.push(`### Dead after (${deadAfter.length})`);
md.push('');
md.push(deadAfter.length ? deadAfter.map((r) => `- \`${r.s.id}\``).join('\n') : 'None.');
md.push('');
md.push('## Every metric');
md.push('');
md.push('Columns: **meaning** (a low score, then a high one); **channels before**; **spec** (the levers its rule pulls, the evidence id, and the concrete fields that move when the score goes from 2 to 98); **readers** (files that mention the id besides its definition and the spec; `[w]` marks the scorecard\'s own plumbing that measures it).');
for (const cat of CATEGORIES) {
  md.push('');
  md.push(`### ${cat.name}`);
  md.push('');
  md.push('| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |');
  md.push('|---|---|---|---|---|');
  for (const r of rows.filter((x) => x.s.category === cat.id)) {
    const levers = r.rule ? r.rule.effects.map((e) => `${e.dir > 0 ? '+' : '-'}${e.lever}`).join(' ') : 'none';
    const fields = r.eff.fields.slice(0, 5).join(', ') + (r.eff.fields.length > 5 ? `, +${r.eff.fields.length - 5}` : '');
    const rd = r.readers.map((x) => `${x.plumbing ? '[w] ' : ''}${x.file.replace(/^services\//, '')}:${x.lines[0]}`).slice(0, 4).join('; ') || 'none';
    md.push(`| \`${r.s.id}\` | ${r.s.low} / ${r.s.high} | ${r.deadBefore ? '**dead**' : r.channels.join(', ')} | ${levers}; ${r.rule && r.rule.ev ? r.rule.ev : 'no mechanism'}; ${fields || 'none'} | ${rd} |`);
  }
}
md.push('');
md.push('## What the spec fields are read by');
md.push('');
md.push('Each spec group, its fields, and whether a generator reads the field in code (`code`) or only through the prompt sentence it selects (`prompt`). Prompt sentences are chosen in `specToPrompt` from the lever leans, so every lever with a phrase reaches every writer that adds the block.');
md.push('');
md.push('| Field | Read in code by | Moved by metrics |');
md.push('|---|---|---|');
const byField = new Map();
for (const r of rows) for (const f of r.eff.fields) { if (!byField.has(f)) byField.set(f, []); byField.get(f).push(r.s.id); }
for (const f of Object.keys(concrete(ls.defaultSpec()))) {
  const readers = specUsers.filter(({ text }) => new RegExp(`\\b(?:spec|s)\\.${f.replace('.', '\\.')}\\b`).test(text)).map(({ f: file }) => file.replace(/^services\//, ''));
  md.push(`| \`${f}\` | ${readers.length ? readers.join(', ') : 'prompt only'} | ${(byField.get(f) || []).length} |`);
}
md.push('');
md.push('## Context that is not on the scorecard');
md.push('');
md.push('| Rule | Reads | What it does |');
md.push('|---|---|---|');
for (const c of ls.CONTEXT_RULES) md.push(`| \`${c.id}\` | ${c.reads} | ${c.rule} |`);
md.push('');
md.push('Interests and hobbies (the about-you survey, tutor facts, solid learner-record facts) become example domains; dislikes (the record, the survey notes, an explicit dislikes field) become avoided domains; a dislike of the subject itself becomes an aversion that lowers the stakes and shrinks the first step.');
md.push('');
fs.writeFileSync(path.join(ROOT, 'docs', 'SCORECARD-MAP.md'), md.join('\n'));

console.log(`metrics ${STATS.length}; dead before ${deadBefore.length}; dead after ${deadAfter.length}; live through the spec ${rows.filter((r) => r.eff.live).length}; rules ${rows.filter((r) => r.rule).length}`);
console.log(`spec fields moved by at least one metric: ${fieldsLive.size} of ${Object.keys(concrete(ls.defaultSpec())).length}`);
console.log(CHECK ? 'checked (docs/SCORECARD-MAP.md not rewritten)' : 'wrote docs/SCORECARD-MAP.md');
if (CHECK && deadAfter.length) {
  console.error(`dead after the spec: ${deadAfter.map((r) => r.s.id).join(', ')}`);
  process.exit(1);
}
