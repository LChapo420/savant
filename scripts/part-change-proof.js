#!/usr/bin/env node
/**
 * Gate for the learner's own change (services/part-change.js). Real stored explanations and lesson paragraphs, SIMULATED requests, AI judges; not a result on real people.
 * For each text and each change: is it served or refused; did it do what was asked (mechanically); and do two families that did not guard it find a fact lost, changed or wrong?
 *
 *   node scripts/part-change-proof.js --n 30 --out docs/part-modify/pc1.json
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const fs = require('fs');
const path = require('path');
const { MODELS, makeChat, pool, ledgers } = require('./lib/pm-models');
const pc = require('../services/part-change');
const pm = require('../services/part-modify');
const X = require('./lib/extreme-learners');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const N = Number(arg('n', 30));
const OUT = arg('out', path.join(__dirname, '..', 'docs', 'part-modify', 'pc1.json'));
const { chat, save, stats } = makeChat(arg('cache', path.join(require('os').tmpdir(), 'pc-proof-cache.json')));
const ROOT = path.join(__dirname, '..');
const POOL = fs.readdirSync(path.join(ROOT, 'content', 'objective-items')).filter((f) => /^(math|english)\./.test(f)).flatMap((f) => (require(path.join(ROOT, 'content', 'objective-items', f)).items || []).filter((i) => i.kept !== false && String(i.rationale || '').split(/\s+/).length >= 13));
const LESSONS = ['The Thirty Years War began in 1618 and ended in 1648 with the Peace of Westphalia. It was fought mostly in the Holy Roman Empire and started as a conflict between Catholic and Protestant states.', 'The mean of a list of numbers is their sum divided by how many numbers there are. For 2, 4 and 9 the sum is 15, and 15 divided by 3 is 5.', 'Plants make their own food in a process called photosynthesis. It happens mostly in the leaves, inside tiny parts called chloroplasts that hold a green pigment called chlorophyll.', 'The median is the middle value once the list is in order. In 1, 3, 7, 8, 20 the median is 7, and the very large 20 does not change it. That is why the median is often used for incomes.'];
const texts = [];
for (let k = 0; texts.length < N; k += 1) { const it = POOL[X.hash('pc', k) % POOL.length]; if (!texts.some((t) => t.text === it.rationale)) texts.push({ text: it.rationale, context: `Question: ${it.prompt}\nCorrect answer: ${it.answer}` }); }
for (const l of LESSONS) texts.push({ text: l, context: 'A paragraph of a lesson' });

const llm = async ({ system, user }) => pm.firstJson(await chat(MODELS.glm, `${system}\nReply with JSON only.`, user, 3000));
// As live: two families, both must pass.
const gate = async ({ original, text, withExample, spec, context }) => {
  for (const who of [MODELS.grok, MODELS.gonka]) {
    let v;
    if (withExample) v = pc.readExampleGate(await chat(who, pc.WITH_EXAMPLE_GATE, `${context ? `${context}\n\n` : ''}ORIGINAL:\n${original}\n\nREWRITE:\n${text}`, 4000));
    else { const q = pm.factGatePrompt({ text: original }, text, (spec && spec.interests && spec.interests.avoidDomains) || []); v = pm.readFactGate(await chat(who, q.system, q.user, 4000)); }
    if (!v || !v.ok) return v;
  }
  return { ok: true, problems: [] };
};
const judge = async (j, original, text, withExample, context) => {
  if (withExample) return pc.readExampleGate(await chat(j, pc.WITH_EXAMPLE_GATE, `${context ? `${context}\n\n` : ''}ORIGINAL:\n${original}\n\nREWRITE:\n${text}`, 4000));
  const q = pm.factGatePrompt({ text: original }, text);
  return pm.readFactGate(await chat(j, q.system, q.user, 4000));
};
const TOPICS = ['model trains', 'football', 'cooking', 'space travel'];
// Judges that did not guard it: DeepSeek at Coral is the same family as one guard, GLM is the writer's. Reported apart; every flag is printed to be read.
const JUDGES = [MODELS.deepseek, MODELS.glm];

async function main() {
  const rows = [];
  const jobs = [];
  texts.forEach((t, i) => {
    for (const change of pc.CHANGES) {
      jobs.push(async () => {
        const topic = change === 'topic' ? TOPICS[i % TOPICS.length] : null;
        const r = await pc.rewrite({ original: t.text, context: t.context, asked: [change], topic, llm, gate });
        const row = { i, change, original: t.text, text: r.text, noop: !!r.noop, problems: r.problems, words_before: t.text.split(/\s+/).length, words_after: r.text ? r.text.split(/\s+/).length : null, load_before: pc.readingLoad(t.text), load_after: r.text ? pc.readingLoad(r.text) : null, judges: {} };
        if (r.text) for (const j of JUDGES) { const v = await judge(j, t.text, r.text, change === 'examples', t.context); row.judges[j.id] = v ? v.problems : null; }
        rows.push(row);
      });
    }
  });
  await pool(jobs, Number(arg('concurrency', 12)));
  save();
  const out = { generated_at: new Date().toISOString(), simulated: true, n_texts: texts.length, by_change: {}, flagged: [], stats, ledgers: ledgers() };
  for (const change of pc.CHANGES) {
    const R = rows.filter((r) => r.change === change);
    const served = R.filter((r) => r.text);
    const cut = (r) => 1 - r.words_after / r.words_before;
    const sorted = served.map(cut).sort((a, b) => a - b);
    const q = (f) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] : null);
    const entry = { asked: R.length, served: served.length, refused: R.filter((r) => !r.text && !r.noop).length, noop: R.filter((r) => r.noop).length };
    if (change === 'shorter') Object.assign(entry, { mean_cut: sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1), worst_1pct_cut: sorted[0], worst_5pct_cut: q(0.05), worst_10pct_cut: q(0.1) });
    if (change === 'simpler') entry.reading_load_lower = served.filter((r) => r.load_after < r.load_before).length;
    if (change === 'examples') entry.longer = served.filter((r) => r.words_after > r.words_before).length;
    for (const j of JUDGES) { const v = served.map((r) => r.judges[j.id]); entry[j.id] = { read: v.filter(Boolean).length, clean: v.filter((x) => x && !x.length).length }; }
    out.by_change[change] = entry;
  }
  out.flagged = rows.filter((r) => r.text && Object.values(r.judges).some((x) => x && x.length)).map((r) => ({ change: r.change, original: r.original, text: r.text, judges: r.judges }));
  out.samples = rows.filter((r) => r.text).slice(0, 12).map((r) => ({ change: r.change, original: r.original, text: r.text }));
  out.refused_because = rows.filter((r) => !r.text && !r.noop).slice(0, 12).map((r) => ({ change: r.change, problems: (r.problems || []).slice(0, 2) }));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.by_change, null, 0), stats, ledgers());
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
