/**
 * Label curriculum questions with the reasoning skills they need (services/scorecard/item-tags.js TAGS), so ability-like scorecard stats
 * (pattern detection, logical rigor, causal chains, systems thinking, contradiction sensitivity, near and far transfer) can be read from
 * how a learner does on the questions that need them (signals.js SHIFTS, the tag_on / tag_off sides).
 *
 *   node scripts/tag-question-skills.js --sample=60            tag up to 60 questions (the default and the cap for a first run)
 *   node scripts/tag-question-skills.js --dry                  print the sample and the first prompt, call nothing
 *   ... --out=content/item-skill-tags.json --batch=10 --models=qwen/qwen3.8-max:free,mistralai/mistral-large-2512
 *
 * What is sent: the question text, its choices, its subject and skill name. Never anything about a learner: the questions come from the
 * curriculum's own verified bank (content/objective-items/*.json).
 *
 * The model: xKiro's free plan only (services/providers/xkiro.js, pipeline use, XKIRO_PIPELINE=1; each model is checked to be listed at
 * $0 before it is used, and a paid one is refused), at temperature 0. Nothing here can spend: no OpenRouter, no paid key. Keys come from
 * the env file named by ENV_FILE (or ./.env, ../.env) and are never printed. Its usage record is XKIRO_USAGE_FILE (default: the
 * provider's own). If no free model answers, the script stops and says so; the table keeps what it had.
 *
 * Output: content/item-skill-tags.json { version, generated, models, definitions, tags: { tagKey: [tag, ...] }, sources: { tagKey:
 * { id, track, skill, model } } }. A question's entry is its full list of tags (an empty list means it was tagged and needs none).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : dflt; };
const has = (flag) => argv.includes(`--${flag}`);

const itemTags = require('../services/scorecard/item-tags');

const SAMPLE = Math.max(1, Number(opt('sample', 60)));
const BATCH = Math.max(1, Math.min(20, Number(opt('batch', 10))));
const OUT = path.resolve(ROOT, opt('out', path.relative(ROOT, itemTags.TABLE_FILE)));
const MODELS = String(opt('models', 'qwen/qwen3.8-max:free,mistralai/mistral-large-2512')).split(',').map((s) => s.trim()).filter(Boolean);
const BANK_DIR = path.join(ROOT, 'content', 'objective-items');

/** Every verified bank question with a prompt, in a stable order. */
function bankQuestions(dir = BANK_DIR) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    for (const it of (j && j.items) || []) {
      if (!it || !it.prompt || it.kept === false) continue;
      out.push({ id: it.id, track: it.track_id || j.track_id, grade: it.grade_id || j.grade_id, skill_id: it.skill_id, prompt: String(it.prompt), choices: Array.isArray(it.choices) ? it.choices.map(String) : null });
    }
  }
  return out;
}

/** A spread sample: questions ordered by a hash (stable), at most a fair share from each bank file's subject and grade. */
function sampleOf(questions, n, table = {}) {
  const fresh = questions.filter((q) => !table[itemTags.tagKey(q)]);
  const h = (q) => crypto.createHash('sha1').update(`${q.id}:${q.prompt}`).digest('hex');
  const groups = {};
  for (const q of fresh.sort((a, b) => (h(a) < h(b) ? -1 : 1))) (groups[`${q.track}/${q.grade}`] = groups[`${q.track}/${q.grade}`] || []).push(q);
  const keys = Object.keys(groups).sort();
  const out = [];
  for (let round = 0; out.length < n && keys.some((k) => groups[k].length > round); round++) {
    for (const k of keys) if (groups[k][round] && out.length < n) out.push(groups[k][round]);
  }
  return out;
}

const SYSTEM = [
  'You label school questions with the reasoning skills a learner needs to answer them. You are strict: a tag applies only when the',
  'question clearly needs that skill, not when it could be involved. Most questions carry zero, one or two tags.',
  '',
  'The tags:',
  ...Object.entries(itemTags.TAGS).map(([k, v]) => `- ${k}: ${v}`),
].join('\n');

function promptFor(batch) {
  return [
    'Label each question below. For each, give its number and the list of tags that clearly apply (an empty list when none do).',
    '',
    ...batch.map((q, i) => `${i + 1}. [${q.track}${q.skill_id ? `, skill: ${String(q.skill_id).replace(/_/g, ' ')}` : ''}] ${q.prompt}${q.choices ? `\n   choices: ${q.choices.join(' | ')}` : ''}`),
  ].join('\n');
}

const SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, tags: { type: 'array', items: { type: 'string', enum: itemTags.TAG_STATS } } },
        required: ['n', 'tags'],
      },
    },
  },
  required: ['questions'],
};

/** A model's answer for one batch, as { tagKey: tags } for the questions it answered (unknown tags dropped, numbers out of range ignored). */
function parseBatch(batch, data) {
  const out = {};
  for (const row of (data && data.questions) || []) {
    const q = batch[Number(row.n) - 1];
    if (!q || !Array.isArray(row.tags)) continue;
    out[itemTags.tagKey(q)] = [...new Set(row.tags.filter((t) => itemTags.TAGS[t]))].sort();
  }
  return out;
}

function readTable(file = OUT) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { version: 1, tags: {}, sources: {} }; }
}

async function main() {
  const table = readTable();
  table.tags = table.tags || {};
  table.sources = table.sources || {};
  const sample = sampleOf(bankQuestions(), SAMPLE, table.tags);
  console.log(`questions to tag: ${sample.length} (sample cap ${SAMPLE}, batches of ${BATCH}); already tagged: ${Object.keys(table.tags).length}`);
  if (has('dry')) {
    console.log(SYSTEM);
    console.log('');
    console.log(promptFor(sample.slice(0, BATCH)));
    return;
  }
  // eslint-disable-next-line global-require
  const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
  const envFile = process.env.ENV_FILE || [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')].find((f) => fs.existsSync(f));
  if (envFile) dotenv.config({ path: envFile, quiet: true });
  process.env.XKIRO_PIPELINE = '1';
  // eslint-disable-next-line global-require
  const { xkiro } = require('../services/providers/xkiro');
  if (!String(process.env.XKIRO_API_KEY || '').trim()) { console.log('No xKiro key in the environment (ENV_FILE): nothing tagged.'); process.exitCode = 1; return; }
  let tagged = 0;
  let tokens = 0;
  const used = new Set();
  for (let i = 0; i < sample.length; i += BATCH) {
    const batch = sample.slice(i, i + BATCH);
    let res;
    try {
      // eslint-disable-next-line no-await-in-loop
      res = await xkiro.structured({ system: SYSTEM, user: promptFor(batch), schema: SCHEMA, schemaName: 'tags', maxTokens: 1200, models: MODELS, timeoutMs: 180000 });
    } catch (err) {
      console.log(`batch ${i / BATCH + 1}: no free model answered (${String(err.message).slice(0, 160)}); stopping.`);
      break;
    }
    const got = parseBatch(batch, res.data);
    for (const q of batch) {
      const k = itemTags.tagKey(q);
      if (!got[k]) continue;
      table.tags[k] = got[k];
      table.sources[k] = { id: q.id, track: q.track, skill: q.skill_id, model: res.model };
      tagged++;
    }
    used.add(res.model);
    tokens += (res.usage.input_tokens || 0) + (res.usage.output_tokens || 0);
    console.log(`batch ${i / BATCH + 1}: ${Object.keys(got).length}/${batch.length} tagged by ${res.model}`);
  }
  table.version = 1;
  table.generated = new Date().toISOString();
  table.models = [...new Set([...(table.models || []), ...used])];
  table.definitions = itemTags.TAGS;
  fs.writeFileSync(OUT, `${JSON.stringify(table, null, 1)}\n`);
  const counts = {};
  for (const list of Object.values(table.tags)) for (const t of list) counts[t] = (counts[t] || 0) + 1;
  console.log(`tagged ${tagged} now, ${Object.keys(table.tags).length} in the table (${path.relative(ROOT, OUT)}); ${tokens} tokens on free models; tags: ${JSON.stringify(counts)}`);
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });

module.exports = { bankQuestions, sampleOf, promptFor, parseBatch, SCHEMA, SYSTEM };
