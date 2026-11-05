/**
 * Build the reading-check item bank (content/reading-check-bank.json), through Standard Compute.
 *
 *   node -r dotenv/config scripts/reading-bank-build.js gen [--per N]        candidate items across reading levels (DeepSeek V4.1 Flash)
 *   node -r dotenv/config scripts/reading-bank-build.js judge [model ...]    blind readings by a panel (Claude Sonnet 5.5, Gemini 3.8 Flash)
 *   node -r dotenv/config scripts/reading-bank-build.js calibrate            write content/reading-check-bank.json and the report
 *   node scripts/reading-bank-build.js report                               print the calibration figures again
 *
 * The check measures language level (the scorecard's vocabulary_ceiling): vocabulary in context and short passage
 * comprehension, each item with a calibrated level on a reading-grade scale (1 to 13, 13 = adult). The writer is given the
 * level it should write at; the judges are NOT: each reads the item cold (the way scripts/placement-panel-judge.js reads
 * placement questions), says the reading grade at which a typical student would answer it right about three times in four,
 * and checks the key. An item is kept only when both judges accept the key and their levels are within one grade; its level
 * is their mean. Candidates and verdicts are cached in curriculum-build/reading-check/, so a rerun asks only for what is
 * missing. Every call goes through services/standard-compute-ledger.js (ceilingUsd 26) with usd from costOf; the script also
 * stops at --budget USD of its own spend (default 2.4). Only invented text is sent: no learner data exists here.
 */
const fs = require('fs');
require('../services/run-cap').defaultCap(5); // hard per-process spend cap across every paid ledger; --run-cap N or RUN_CAP_USD overrides
const path = require('path');

const ROOT = path.join(__dirname, '..');
process.env.STANDARD_COMPUTE_LEDGER_FILE = process.env.STANDARD_COMPUTE_LEDGER_FILE || 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/standard-compute-ledger.json';
const ledger = require('../services/standard-compute-ledger');

const DIR = path.join(ROOT, 'curriculum-build', 'reading-check');
const BANK = path.join(ROOT, 'content', 'reading-check-bank.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BUDGET = Number(flag('budget', 2.4));
const WRITER = 'deepseek/deepseek-v4.1-flash-1017';
const JUDGES = [
  { tag: 'sonnet', model: 'anthropic/claude-sonnet-5.5' },
  { tag: 'gemini', model: 'google/gemini-3.8-flash' },
];
const LEVELS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const TYPES = ['vocab', 'passage'];
const CEILING_USD = 38;
let spent = 0;

async function chat(model, system, user, { maxTokens, json = true } = {}) {
  if (spent >= BUDGET) throw new Error(`script budget $${BUDGET} reached`);
  const key = String(process.env.STANDARD_COMPUTE_API_KEY || '').trim();
  if (!key) throw new Error('no Standard Compute key');
  const base = (/^https?:\/\//.test(String(process.env.STANDARD_COMPUTE_BASE_URL || '')) ? process.env.STANDARD_COMPUTE_BASE_URL : 'https://api.stdcmpt.com/v1').replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
  const id = ledger.reserve({ usd: ledger.estimate({ model, inputChars: system.length + user.length, maxTokens }), task: 'reading_bank', model, ceilingUsd: CEILING_USD });
  let settled = false;
  const settleOnce = (a) => { if (!settled) { settled = true; ledger.settle(id, a); } };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 420000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.7, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    });
    const text = await res.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* not json */ }
    if (res.status !== 200 || !j || !j.choices) { settleOnce({ outcome: 'not_billed' }); throw new Error(`${model} ${res.status}: ${text.slice(0, 150)}`); }
    const u = j.usage || {};
    const usage = { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 };
    const usd = ledger.costOf(model, usage);
    spent += usd;
    settleOnce({ usd, outcome: 'ok', usage });
    if (j.choices[0].finish_reason === 'length') console.log(`  ${model}: reply cut at the token limit (${usage.output_tokens} tokens)`);
    return j.choices[0].message.content || '';
  } catch (e) { settleOnce({ outcome: 'unknown' }); throw e; } finally { clearTimeout(timer); }
}

const parseJson = (text) => {
  const s = String(text).replace(/<think>[\s\S]*?<\/think>/g, '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
};

// ── 1. candidates ────────────────────────────────────────────────────────────
const GUIDE = {
  2: 'grade 2: very common words (a seven-year-old knows them), short sentences',
  3: 'grade 3: common words, simple sentences',
  4: 'grade 4: everyday and some school words',
  5: 'grade 5: school vocabulary, some compound sentences',
  6: 'grade 6: middle-school vocabulary, more abstract words',
  7: 'grade 7: words such as "reluctant", "abundant"',
  8: 'grade 8: words such as "inevitable", "meticulous"',
  9: 'grade 9: words such as "ambiguous", "paradox", complex sentences',
  10: 'grade 10: words such as "ubiquitous", "pragmatic", dense sentences',
  11: 'grade 11: words such as "equivocal", "sanguine", formal register',
  12: 'grade 12: words such as "obsequious", "perfunctory", abstract argument',
  13: 'adult / college: words such as "quixotic", "tendentious", scholarly prose',
};
const TOPICS = ['weather and seasons', 'animals', 'a small town', 'sport', 'cooking', 'machines and invention', 'an old map', 'music', 'a library', 'the sea', 'gardens', 'a journey by train', 'a market', 'the night sky', 'a school day', 'a bridge being built', 'a river', 'a festival', 'a museum', 'a mountain village'];

function genPrompt(level, type, n, seed, harder = false) {
  const topics = Array.from({ length: n }, (_, i) => TOPICS[(seed + i * 3) % TOPICS.length]);
  const push = harder ? ` An earlier attempt at this level came out about one and a half grades too easy for the judges who read it: write at the demanding end of grade ${level}, with richer vocabulary, longer and more complex sentences, and questions that need careful reading.` : '';
  const common = `${push}Write ${n} multiple-choice reading items at reading grade ${level} (${GUIDE[level]}). A learner who reads at grade ${level} should answer each correctly about three times in four; a learner two grades lower should often miss it. Four choices, exactly one correct, the wrong ones plausible but clearly wrong to a careful reader. Nothing may depend on outside knowledge: the item must be answerable from what it contains. No names of real people, no politics, nothing frightening. `;
  if (type === 'vocab') {
    return `${common}Each item is VOCABULARY IN CONTEXT: one or two sentences that use a target word at that level in a context that makes its meaning decidable, then the question "What does the word <target> mean in this sentence?" with four short meaning choices. Different target words in every item. Topics, one per item: ${topics.join('; ')}.
Reply with one JSON object: {"items":[{"context":"<the sentence(s), the target word written exactly as in the question>","target":"<word>","prompt":"What does the word \\"<word>\\" mean in this sentence?","choices":["...","...","...","..."],"answer":<index 0-3 of the correct choice>}]}`;
  }
  const words = level <= 3 ? '40 to 60' : level <= 6 ? '60 to 90' : level <= 9 ? '90 to 130' : '120 to 170';
  return `${common}Each item is PASSAGE COMPREHENSION: a self-contained passage of ${words} words written at grade ${level}, then ONE question: a mix of literal detail, inference, main idea and the meaning of a word as the passage uses it. Passage topics, one per item: ${topics.join('; ')}.
Reply with one JSON object: {"items":[{"passage":"<the passage>","prompt":"<the question>","skill":"literal|inference|main_idea|word_in_passage","choices":["...","...","...","..."],"answer":<index 0-3 of the correct choice>}]}`;
}

const SYSTEM_WRITER = 'You write reading-assessment items for a learning app. Items are original, accurate and neutral. Reply with the JSON object only.';

async function gen() {
  const per = Number(flag('per', 8));
  const file = path.join(DIR, 'candidates.json');
  const cands = readJson(file, []);
  const have = (l, t) => cands.filter((c) => c.intended === l && c.type === t).length;
  const jobs = [];
  for (const level of LEVELS) for (const type of TYPES) if (have(level, type) < per) jobs.push({ level, type });
  console.log(`${cands.length} candidates on file; ${jobs.length} (level, type) cells to write`);
  let seed = cands.length;
  const run = async ({ level, type }) => {
    const n = per - have(level, type);
    seed += 7;
    let data = null;
    try { data = parseJson(await chat(WRITER, SYSTEM_WRITER, genPrompt(level, type, n, seed, have(level, type) > 0 && level >= 5), { maxTokens: 9000 })); } catch (e) { console.log(`  grade ${level} ${type}: ${e.message}`); return; }
    const items = (data && data.items) || [];
    for (const it of items) {
      const choices = Array.isArray(it.choices) ? it.choices.map((c) => String(c).trim()).filter(Boolean) : [];
      const answer = Number(it.answer);
      if (choices.length !== 4 || new Set(choices.map((c) => c.toLowerCase())).size !== 4 || !(answer >= 0 && answer < 4)) continue;
      const prompt = String(it.prompt || '').trim();
      if (!prompt) continue;
      if (type === 'vocab' && !String(it.context || '').trim()) continue;
      if (type === 'passage' && String(it.passage || '').trim().split(/\s+/).length < 25) continue;
      // The writers put the right answer in one or two slots; place it by a hash of the prompt instead.
      const h = [...(prompt + choices.join('|'))].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const right = choices[answer];
      const rest = choices.filter((_, i) => i !== answer);
      const at = h % 4;
      const placed = [...rest.slice(0, at), right, ...rest.slice(at)];
      cands.push({
        id: `c${String(cands.length + 1).padStart(4, '0')}`, type, intended: level, skill: type === 'vocab' ? 'vocab_in_context' : String(it.skill || 'literal'),
        ...(type === 'vocab' ? { context: String(it.context).trim(), target: String(it.target || '').trim() } : { passage: String(it.passage).trim() }),
        prompt, choices: placed, answer: at,
      });
    }
    writeJson(file, cands);
    console.log(`  grade ${level} ${type}: ${items.length} written (spent $${spent.toFixed(3)})`);
  };
  for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map(run));
  console.log(`${cands.length} candidates; spent $${spent.toFixed(3)}`);
}

// ── 2. the blind panel ───────────────────────────────────────────────────────
const JUDGE_SYSTEM = 'You are an expert in reading assessment and readability. You are shown reading items with no information about who they were written for. Reply with one JSON object only.';
const JUDGE_INSTR = 'For each item give: "level": the US reading grade (1 to 13, where 13 means an adult or college reader; use one decimal) at which a typical student would answer it correctly about three times in four, judged from the difficulty of the vocabulary, the text and what the question requires; and "key": whether the keyed answer is "correct", "wrong" or "ambiguous" (another choice also defensible, or the item needs outside knowledge). Reply: {"items":[{"id":"<id>","level":<number>,"key":"correct|wrong|ambiguous","note":"<one short reason, only when the key is not correct>"}]} with one entry for every id.';

const showItem = (c) => `id: ${c.id}\n${c.type === 'vocab' ? `sentence: ${c.context}` : `passage: ${c.passage}`}\nquestion: ${c.prompt}\nchoices: ${c.choices.map((x, i) => `(${'ABCD'[i]}) ${x}`).join(' ')}\nkeyed answer: ${'ABCD'[c.answer]}\n`;

async function judge() {
  const cands = readJson(path.join(DIR, 'candidates.json'), []);
  const wanted = argv.slice(1).filter((a) => !a.startsWith('--') && !/^\d/.test(a));
  const panel = wanted.length ? JUDGES.filter((j) => wanted.includes(j.tag) || wanted.includes(j.model)) : JUDGES;
  for (const j of panel) {
    const file = path.join(DIR, `judge-${j.tag}.json`);
    const cache = readJson(file, {});
    for (let round = 1; round <= 3; round++) {
      const todo = cands.filter((c) => !cache[c.id]);
      if (!todo.length) break;
      let s = 0xbeef + round;
      const order = todo.map((c) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return [s, c]; }).sort((a, b) => a[0] - b[0]).map((x) => x[1]); // shuffled: the order carries no level
      const size = round === 1 ? 12 : 6;
      const batches = [];
      for (let i = 0; i < order.length; i += size) batches.push(order.slice(i, i + size));
      const run = async (batch) => {
        let data = null;
        try { data = parseJson(await chat(j.model, JUDGE_SYSTEM, `${JUDGE_INSTR}\n\n${batch.map(showItem).join('\n')}`, { maxTokens: 16000 })); } catch (e) { console.log(`  ${j.tag}: ${e.message}`); return; }
        const byId = new Map(batch.map((c) => [c.id, c]));
        for (const r of (data && data.items) || []) {
          const c = byId.get(String(r.id).trim());
          const level = Number(r.level);
          if (!c || !(level >= 1 && level <= 13.5)) continue;
          cache[c.id] = { level: Number(level.toFixed(1)), key: ['correct', 'wrong', 'ambiguous'].includes(r.key) ? r.key : 'ambiguous', note: String(r.note || '').slice(0, 160) };
        }
        writeJson(file, cache);
      };
      for (let i = 0; i < batches.length; i += 4) await Promise.all(batches.slice(i, i + 4).map(run));
      console.log(`  ${j.tag} round ${round}: ${Object.keys(cache).length} of ${cands.length} read (spent $${spent.toFixed(3)})`);
    }
  }
  console.log(`spent $${spent.toFixed(3)}`);
}

// ── 3. calibrate ─────────────────────────────────────────────────────────────
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pearson = (a, b) => {
  const ma = mean(a); const mb = mean(b);
  let sab = 0; let saa = 0; let sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
};

const sd = (xs) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const syllables = (w) => { const s = w.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, ''); const m = s.match(/[aeiouy]+/g); return Math.max(1, m ? m.length : 1); };
/** Flesch-Kincaid grade of a text: an objective, text-only yardstick for the passages. */
function fkGrade(t) {
  const sents = t.split(/[.!?]+/).filter((x) => x.trim().length > 2).length || 1;
  const ws = t.split(/\s+/).filter(Boolean);
  return 0.39 * ws.length / sents + 11.8 * ws.reduce((a, w) => a + syllables(w), 0) / (ws.length || 1) - 15.59;
}

function calibrate(write = true) {
  const cands = readJson(path.join(DIR, 'candidates.json'), []);
  const caches = Object.fromEntries(JUDGES.map((j) => [j.tag, readJson(path.join(DIR, `judge-${j.tag}.json`), {})]));
  const both = cands.filter((c) => JUDGES.every((j) => caches[j.tag][c.id]));
  // The judges agree on the order of the items (r 0.97) but not on where the scale sits: Gemini reads every item about
  // a grade lower than Claude, and flatter at the top. Each judge's levels are put on the first judge's scale (Claude's,
  // which tracks the Flesch-Kincaid grade of the passages) by matching mean and spread over the items both read, and the
  // disagreement that is judged is what is left after that.
  const base = JUDGES[0].tag;
  const ref = both.map((c) => caches[base][c.id].level);
  const scale = {};
  for (const j of JUDGES) {
    const xs = both.map((c) => caches[j.tag][c.id].level);
    scale[j.tag] = j.tag === base ? { a: 1, b: 0 } : { a: sd(ref) / (sd(xs) || 1), b: mean(ref) - (sd(ref) / (sd(xs) || 1)) * mean(xs) };
  }
  const levelOf = (tag, id) => caches[tag][id].level * scale[tag].a + scale[tag].b;
  const kept = [];
  const dropped = { key_doubt: 0, disagree: 0, duplicate: 0, unread: cands.length - both.length };
  const seen = new Set();
  const dups = (c) => { const k = (c.type === 'vocab' ? c.target : c.passage.slice(0, 50)).toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false; };
  const gaps = [];
  for (const c of both) {
    const v = JUDGES.map((j) => caches[j.tag][c.id]);
    const al = JUDGES.map((j) => levelOf(j.tag, c.id));
    gaps.push(Math.abs(al[0] - al[1]));
    if (v.some((x) => x.key !== 'correct')) { dropped.key_doubt++; continue; }
    if (Math.abs(al[0] - al[1]) > 1) { dropped.disagree++; continue; }
    if (dups(c)) { dropped.duplicate++; continue; }
    const level = Number(Math.max(1, Math.min(13, mean(al))).toFixed(2));
    kept.push({ id: '', type: c.type, skill: c.skill, level, intended: c.intended, ...(c.type === 'vocab' ? { context: c.context, target: c.target } : { passage: c.passage }), prompt: c.prompt, choices: c.choices, answer: c.answer, judged: Object.fromEntries(JUDGES.map((j, i) => [j.tag, Number(al[i].toFixed(1))])) });
  }
  kept.sort((a, b) => a.level - b.level || a.type.localeCompare(b.type));
  kept.forEach((k, i) => { k.id = `rc${String(i + 1).padStart(3, '0')}`; });
  const lv = both.map((c) => JUDGES.map((j) => levelOf(j.tag, c.id)));
  const raw = both.map((c) => JUDGES.map((j) => caches[j.tag][c.id].level));
  const fkPairs = both.filter((c) => c.type === 'passage').map((c) => [fkGrade(c.passage), mean(JUDGES.map((j) => levelOf(j.tag, c.id)))]);
  const stats = {
    candidates: cands.length, read_by_both: both.length, kept: kept.length, dropped,
    judge_scale: { reference: base, gemini_to_reference: scale.gemini ? { a: Number(scale.gemini.a.toFixed(3)), b: Number(scale.gemini.b.toFixed(3)) } : null, raw_mean_gap_before_alignment: Number(mean(raw.map((x) => x[0] - x[1])).toFixed(2)), raw_r: Number((pearson(raw.map((x) => x[0]), raw.map((x) => x[1])) || 0).toFixed(3)) },
    passage_vs_flesch_kincaid: { n: fkPairs.length, r: Number((pearson(fkPairs.map((x) => x[0]), fkPairs.map((x) => x[1])) || 0).toFixed(3)), mean_level_minus_fk: Number(mean(fkPairs.map((x) => x[1] - x[0])).toFixed(2)) },
    judge_agreement: {
      after_alignment: true, pairs: both.length, within_1_grade: Number((gaps.filter((g) => g <= 1).length / (gaps.length || 1)).toFixed(3)),
      mean_abs_gap: Number(mean(gaps).toFixed(2)), r: Number((pearson(lv.map((x) => x[0]), lv.map((x) => x[1])) || 0).toFixed(3)),
    },
    key_accepted_by_both: Number((both.filter((c) => JUDGES.every((j) => caches[j.tag][c.id].key === 'correct')).length / (both.length || 1)).toFixed(3)),
    judge_mean_vs_intended: { r: Number((pearson(both.map((c, i) => mean(lv[i])), both.map((c) => c.intended)) || 0).toFixed(3)), mean_abs_gap: Number(mean(both.map((c, i) => Math.abs(mean(lv[i]) - c.intended))).toFixed(2)) },
    by_type: Object.fromEntries(TYPES.map((t) => [t, kept.filter((k) => k.type === t).length])),
    by_level_band: Object.fromEntries(LEVELS.map((l) => [l, kept.filter((k) => Math.round(k.level) === l).length])),
  };
  const bank = {
    version: 1,
    scale: 'US reading grade, 1 to 13 (13 = adult or college); an item\'s level is the grade at which a typical student answers it right about three times in four, the mean of two blind judges (Claude Sonnet 5.5, Gemini 3.8 Flash) that agree within one grade and accept the key',
    built_at: new Date().toISOString(), writer: WRITER, judges: JUDGES.map((j) => j.model), calibration: stats, items: kept,
  };
  if (write) { writeJson(BANK, bank); writeJson(path.join(DIR, 'report.json'), stats); }
  console.log(JSON.stringify(stats, null, 1));
  return bank;
}

(async () => {
  if (cmd === 'gen') await gen();
  else if (cmd === 'judge') await judge();
  else if (cmd === 'calibrate') calibrate(true);
  else if (cmd === 'report') calibrate(false);
  else { console.log('usage: reading-bank-build.js gen | judge | calibrate | report'); process.exit(2); }
  if (spent) console.log(`this run: $${spent.toFixed(4)} through the ledger`);
})().catch((e) => { console.error(e); process.exit(1); });
