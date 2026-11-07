#!/usr/bin/env node
/**
 * Measures the same-facts judges before their verdicts are trusted. Hand-written calibration set (scripts/fixtures/fact-judge-cal.js):
 *   identical    the same text twice (noise control)        should pass
 *   clean        a hand-written paraphrase, no fact changed should pass
 *   comparison   one comparison from another field added    reported on its own
 *   changed / added / dropped    planted faults             should be caught
 * Two prompts: `strict` (the judge behind the "16 of 40" figure, unchanged) and `claims` (services/part-modify.js factGate's prompt, claim by claim).
 * Three families. Then both prompts on the 23 feedback and review pairs of the pm2 run, against my own labels.
 *
 *   node scripts/fact-judge-calibrate.js --pairs <dir of pm2 rows> --out docs/part-modify/judge-cal.json
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const fs = require('fs');
const path = require('path');
const { MODELS, makeChat, pool, ledgers } = require('./lib/pm-models');
const { ITEMS, LABELS } = require('./fixtures/fact-judge-cal');
const pm = require('../services/part-modify');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const OUT = arg('out', path.join(__dirname, '..', 'docs', 'part-modify', 'judge-cal.json'));
const { chat, save, stats } = makeChat(arg('cache', path.join(require('os').tmpdir(), 'pm-judge-cal-cache.json')));
const JUDGES = [MODELS.glm, MODELS.deepseek, MODELS.grok];

const STRICT = 'You compare two texts about the same question. Say whether they state the same facts, the same answer and the same numbers (wording, length and tone may differ; extra friendly words are fine). Reply with the last line exactly "SAME FACTS: YES" or "SAME FACTS: NO" (NO if the second adds, drops or changes a fact, number or the answer).';
async function strict(j, a, b) {
  const text = await chat(j, STRICT, `TEXT 1:\n${a}\n\nTEXT 2:\n${b}`, 4000);
  const m = String(text || '').match(/SAME FACTS:\s*(YES|NO)/gi);
  return m ? m[m.length - 1].toUpperCase().includes('YES') : null;
}
async function claims(j, a, b) {
  const q = pm.factGatePrompt({ text: a }, b);
  const text = await chat(j, q.system, q.user, 4000);
  const r = pm.readFactGate(text);
  return r ? r.ok : null;
}
const PROMPTS = { strict, claims };

async function main() {
  const trials = [];
  const jobs = [];
  const add = (set, label, a, b, want, tag) => {
    for (const j of JUDGES) for (const [pn, fn] of Object.entries(PROMPTS)) jobs.push(async () => { const pass = await fn(j, a, b); trials.push({ set, label, judge: j.id, prompt: pn, pass, want, tag }); });
  };
  for (const it of ITEMS) {
    add('cal', 'identical', it.r, it.r, true, it.id);
    add('cal', 'clean', it.r, it.clean, true, it.id);
    if (it.comparison) add('cal', 'comparison', it.r, it.comparison, null, it.id);
    add('cal', 'changed', it.r, it.changed, false, it.id);
    add('cal', 'added', it.r, it.added, false, it.id);
    if (it.dropped) add('cal', 'dropped', it.r, it.dropped, false, it.id);
  }
  const dir = arg('pairs');
  if (dir) {
    for (const part of ['feedback', 'review']) {
      const rows = JSON.parse(fs.readFileSync(path.join(dir, `${part}-rows.json`), 'utf8')).filter((r) => r.same !== undefined && r.same !== null);
      rows.forEach((r, i) => { add(`pm2-${part}`, LABELS[part][i][0] ? 'label_clean' : 'label_fault', r.stored, r.vL, LABELS[part][i][0], `${r.L}#${r.k}`); });
    }
  }
  await pool(jobs, Number(arg('concurrency', 8)));
  save();
  const table = {};
  for (const t of trials) {
    const k = `${t.set}|${t.label}|${t.prompt}|${t.judge}`;
    table[k] = table[k] || { set: t.set, label: t.label, prompt: t.prompt, judge: t.judge, n: 0, pass: 0, unread: 0, want: t.want };
    const row = table[k];
    row.n += 1; if (t.pass === null || t.pass === undefined) row.unread += 1; else if (t.pass) row.pass += 1;
  }
  const rows = Object.values(table).sort((a, b) => `${a.set}${a.label}${a.prompt}${a.judge}`.localeCompare(`${b.set}${b.label}${b.prompt}${b.judge}`));
  for (const r of rows) console.log(`${r.set.padEnd(13)} ${r.label.padEnd(12)} ${r.prompt.padEnd(7)} ${r.judge.padEnd(15)} pass ${String(r.pass).padStart(3)}/${String(r.n - r.unread).padEnd(3)} ${r.want === true ? 'should pass' : r.want === false ? 'should fail' : 'policy'}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), simulated: true, note: 'hand-written calibration set; AI judges', stats, ledgers: ledgers(), rows, misses: trials.filter((t) => t.want !== null && t.pass !== null && t.pass !== t.want).map((t) => ({ set: t.set, label: t.label, prompt: t.prompt, judge: t.judge, tag: t.tag })) }, null, 1));
  console.log('calls', stats, 'ledgers', ledgers());
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
