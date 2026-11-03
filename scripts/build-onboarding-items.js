/**
 * Writes the words of the onboarding pool with FREE models (NVIDIA build), and checks every item with a second model that never sees the key.
 *
 *   NODE_PATH=<app>/node_modules node scripts/build-onboarding-items.js [--only=self,reading,reason,minilesson,taste]
 *
 * Output: content/onboarding/items.json. Nothing here touches a learner: the prompts carry only scorecard definitions and topics.
 *   writer   nvidia/nemotron-3-ultra-550b-a55b (thinking off)
 *   judge    nvidia/nemotron-3.5-lightning, else z-ai/glm-5.3-flash, else the writer model again (a model that times out is skipped; the run prints which model
 *            answered how many calls, so a check the writer model made on itself is visible as such)
 * Checks (an item that fails one is dropped, never shown):
 *   forced-choice self-report  the judge, shown the two options shuffled and the measure's low/high meaning, must pick the writer's high option
 *   anything with a key        the judge solves it without the key and must agree with the writer's key
 *   structure                  word limits, option counts, no duplicate options
 * The key is the free tier's: paced under NVIDIA_RPM, backing off on 429. The .env is read with dotenv and never printed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
const { STATS } = require('../services/scorecard/stats');

const KEY = process.env.NVIDIA_API_KEY;
const BASE = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
const WRITER = { model: 'nvidia/nemotron-3-ultra-550b-a55b', kwargs: { enable_thinking: false } };
// 3 Nov: glm-5.3-flash and deepseek-v4.1-flash timed out on every call for hours, and the Gemini free tier was over quota, so the independent judge is
// nemotron-3.5-lightning (a different, smaller model; 0.3 s a call); the writer model is the last resort and the report says when it was used.
const JUDGE = [{ model: 'nvidia/nemotron-3.5-lightning-30b-a3b', kwargs: { enable_thinking: false } }, { model: 'z-ai/glm-5.3-flash', kwargs: { reasoning_effort: 'low' } }, { model: 'nvidia/nemotron-3-ultra-550b-a55b', kwargs: { enable_thinking: false } }];
const OUT = path.join(__dirname, '..', 'content', 'onboarding', 'items.json');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

const used = {};
const dead = new Set();   // a model that timed out is left alone for the rest of the run (the free endpoint is slow for some models some hours)   // which model actually answered how many calls (the judge falls back when a model times out: the report says so)
// 3 Nov (owner): the 90M MiniMax M3.1 Flash tokens on xKiro expire Nov 6, so the WRITER is MiniMax through services/providers/xkiro.js (pipeline only; set
// XKIRO_PIPELINE=1 and XKIRO_GRANTS='{"minimax/minimax-m3.1-flash":108000000}'), with NVIDIA's nemotron as the fallback; the JUDGE stays a different
// model (NVIDIA nemotron-3.5-lightning), so no item is checked by the model that wrote it. No learner data goes in any prompt.
const XK_MODEL = 'minimax/minimax-m3.1-flash';
const xk = process.env.XKIRO_API_KEY && process.env.XKIRO_PIPELINE === '1' && process.env.NO_XKIRO !== '1' ? require('../services/providers/xkiro').xkiro : null;
async function viaXkiro(prompt, maxTokens) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await xk.chat({ messages: [{ role: 'user', content: prompt }], maxTokens: Math.max(maxTokens, 6000), models: [XK_MODEL], timeoutMs: 300000 });
      used[XK_MODEL] = (used[XK_MODEL] || 0) + 1;
      return r.text;
    } catch (err) {
      if (err.status === 402 || err.status === 403 || err.daily) return null;   // refused locally: use NVIDIA
      await sleep(Math.min(90000, 8000 * 2 ** attempt));
    }
  }
  return null;
}
async function chat(who, prompt, maxTokens = 3000) {
  if (who === WRITER && xk) { const t = await viaXkiro(`${prompt}
(Draft ${Math.random().toString(36).slice(2, 7)}.)`, maxTokens); if (t) return t; }
  const chain = Array.isArray(who) ? who : [who];
  for (const m of chain) {
    if (dead.has(m.model) && chain.length > 1) continue;
    for (let attempt = 0; attempt < 9; attempt++) {
      const wait = Math.max(0, last + 2600 - Date.now()); await sleep(wait); last = Date.now();
      const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), chain.length > 1 ? 40000 : 150000);   // the writer is alone in its chain and writes long answers: it gets time and a retry, not a verdict
      let res;
      try {
        res = await fetch(BASE + '/chat/completions', {
          signal: ac.signal, method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
          body: JSON.stringify({ model: m.model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.7, chat_template_kwargs: m.kwargs }),
        });
      } catch { clearTimeout(timer); if (chain.length > 1) { dead.add(m.model); break; } await sleep(Math.min(60000, 4000 * 2 ** attempt)); continue; }   // timed out or unreachable: the next model in the chain (or, alone, another try)
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) { await sleep(Math.min(60000, 4000 * 2 ** attempt)); continue; }
      if (!res.ok) break;
      const j = await res.json();
      used[m.model] = (used[m.model] || 0) + 1;
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    }
  }
  throw new Error('NVIDIA: no model in the chain answered');
}
function json(text) {
  const m = /[\[{][\s\S]*[\]}]/.exec(text || '');
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
const ask = async (who, prompt, tokens) => json(await chat(who, `${prompt}\n\nReply with JSON only, no commentary.`, tokens));
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const db = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { built: null, self: {}, reading: [], reason: {}, minilesson: [], taste: [] };
// Several stages can run in parallel processes, each with --only=: a save re-reads the file and replaces only the sections this process owns.
const save = () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const mine = ['self', 'reading', 'reason', 'minilesson', 'taste'].filter(want);
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { cur = {}; }
  const merged = { ...cur, built: new Date().toISOString() };
  for (const k of mine) merged[k] = db[k];
  fs.writeFileSync(OUT, JSON.stringify(merged, null, 1));
};
const stats = {};
const tally = (k, ok) => { (stats[k] = stats[k] || { kept: 0, dropped: 0 })[ok ? 'kept' : 'dropped']++; };

// ── forced-choice self-report: two items for every measure ─────────────────────
async function selfItems() {
  const todo = STATS.filter((s) => !(db.self[s.id] && db.self[s.id].length >= 2));
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    for (let round = 0; round < 3 && batch.some((s) => !(db.self[s.id] && db.self[s.id].length >= 2)); round++) {
      const need = batch.filter((s) => !(db.self[s.id] && db.self[s.id].length >= 2));
      const spec = need.map((s) => `- ${s.id}: LOW = ${s.low}; HIGH = ${s.high}`).join('\n');
      const out = await ask(WRITER, `Write forced-choice questions for a learning-habits quiz for teens and adults. For each measure below, write 3 different questions. Each question has two options, each a first-person statement of 5 to 14 words about a concrete thing the person does or prefers when learning: "high" describes the HIGH end of the measure and "low" the LOW end. Rules: plain words, no jargon, no mention of the measure's name; both options must sound equally reasonable and neither should sound smarter, better or morally superior; do not use "I always" or "I never"; the two options must be about the same behaviour.\nMeasures:\n${spec}\nFormat: {"items":[{"stat":"id","high":"...","low":"..."}]}`, 4000);
      for (const it of (out && out.items) || []) {
        const stat = STATS.find((s) => s.id === it.stat);
        if (!stat || !it.high || !it.low || words(it.high) > 16 || words(it.low) > 16 || words(it.high) < 3 || it.high === it.low) continue;
        if ((db.self[stat.id] || []).length >= 2) continue;
        const flip = Math.random() < 0.5;
        const verdict = await ask(JUDGE, `A question offers two options about how someone learns. Measure: "${stat.name}". LOW end means: ${stat.low}. HIGH end means: ${stat.high}.\nOption A: ${flip ? it.low : it.high}\nOption B: ${flip ? it.high : it.low}\nWhich option shows the HIGH end of the measure? Answer {"high":"A"} or {"high":"B"}; answer {"high":"neither"} if the options do not clearly differ on this measure.`, 400);
        const ok = verdict && verdict.high === (flip ? 'B' : 'A');
        tally('self', ok);
        if (ok) (db.self[stat.id] = db.self[stat.id] || []).push({ high: it.high.trim(), low: it.low.trim() });
      }
    }
    save(); console.error(`self ${Math.min(i + 8, todo.length)}/${todo.length}`);
  }
}

// ── things with a key: writer writes, judge solves blind, keep the agreeing ──────
async function solveBlind(item) {
  const v = await ask(JUDGE, `${item.passage ? `Passage:\n${item.passage}\n\n` : ''}Question: ${item.q}\n${item.options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')}\nChoose the single best answer. Reply {"answer":"A"} (a letter).`, 600);
  return v && 'ABCD'.indexOf(String(v.answer).trim().toUpperCase()[0]);
}
const wellFormed = (q) => q && q.q && Array.isArray(q.options) && q.options.length === 4 && new Set(q.options).size === 4 && Number.isInteger(q.key) && q.key >= 0 && q.key < 4;
async function keep(kind, item) {
  if (!wellFormed(item)) { tally(kind, false); return false; }
  const got = await solveBlind(item);
  const ok = got === item.key;
  tally(kind, ok);
  return ok;
}

async function reading() {
  const levels = [['an interested 13 to 15 year old', 150, 'mid'], ['a strong high-school reader', 220, 'hard']];
  for (const [who, len, tag] of levels) {
    if (db.reading.some((p) => p.tag === tag)) continue;
    for (let tries = 0; tries < 4 && !db.reading.some((p) => p.tag === tag); tries++) {
      const out = await ask(WRITER, `Write an original factual passage of about ${len} words on a science or history topic, pitched at ${who}. Then write 4 multiple-choice questions on it: two literal, one inference, one about the meaning of a word as used. Every question has exactly 4 options and exactly one correct answer that the passage alone supports. Format: {"passage":"...","questions":[{"q":"...","options":["..","..","..",".."],"key":0}]}`, 3500);
      if (!out || !out.passage || words(out.passage) < len * 0.7) continue;
      const qs = [];
      for (const q of out.questions || []) if (await keep('reading', { ...q, passage: out.passage })) qs.push(q);
      if (qs.length >= 3) db.reading.push({ tag, passage: out.passage, questions: qs });
    }
    save();
  }
}

async function reason() {
  const kinds = {
    analogy: 'a verbal analogy (A is to B as C is to ?) whose relation is clear and not about trivia, solvable by anyone with a general vocabulary',
    causal: 'a short cause-and-effect puzzle: three or four linked events in a chain, asking what must happen next or what the root cause was',
    abstract: 'an abstract reasoning item stated in words: a rule is described in a few sentences and the person picks the case that follows or breaks the rule',
  };
  for (const [kind, what] of Object.entries(kinds)) {
    db.reason[kind] = db.reason[kind] || [];
    for (let tries = 0; tries < 6 && db.reason[kind].length < 5; tries++) {
      const out = await ask(WRITER, `Write 4 different items. Each is ${what}. Each has exactly 4 options and one defensible correct answer, with difficulty from easy to moderately hard. Format: {"items":[{"q":"...","options":["..","..","..",".."],"key":0}]}`, 3000);
      for (const it of (out && out.items) || []) {
        if (db.reason[kind].length >= 5) break;
        if (await keep(`reason:${kind}`, it)) db.reason[kind].push({ q: it.q, options: it.options, key: it.key });
      }
    }
    save();
  }
}

async function minilesson() {
  if (db.minilesson.length >= 3) return;
  db.minilesson = [];
  const parts = ['why the sky is blue (Rayleigh scattering)', 'how a bill becomes law in the United States', 'how compound interest grows money'];
  for (const topic of parts) {
    for (let tries = 0; tries < 4 && db.minilesson.length < parts.indexOf(topic) + 1; tries++) {
      const out = await ask(WRITER, `Write a mini-lesson part on: ${topic}. Fields: "title"; "intro" (60 to 90 words, plain and engaging); "steps" (3 short numbered steps, 12 words each, the procedure or sequence); "why" (50 to 70 words explaining the underlying reason or principle); "extra" (a 35-word optional "go deeper" paragraph); "problem" ({"q":"a question that needs the idea, 4 options, one correct","options":[4],"key":0}); "hint" (one sentence that helps without giving the answer); "explain" (two sentences explaining the correct answer); "connect" (a one-sentence prompt asking the learner to connect the idea to something they already know). Format: {"title":"","intro":"","steps":["",""],"why":"","extra":"","problem":{"q":"","options":["","","",""],"key":0},"hint":"","explain":"","connect":""}`, 3500);
      if (!out || !out.problem || !out.intro || !Array.isArray(out.steps)) continue;
      if (await keep('minilesson', out.problem)) db.minilesson.push(out);
    }
  }
  save();
}

async function taste() {
  const pairs = [
    ['examples', 'A', 'states the rule first, then shows two worked examples', 'B', 'shows two worked examples first and lets the rule emerge at the end', 'how the water cycle moves water between sea, air and land'],
    ['visual', 'A', 'is plain prose', 'B', 'is the same content laid out as a small labelled table or list of rows', 'the differences between three kinds of rock (igneous, sedimentary, metamorphic)'],
    ['depth', 'A', 'is brief: the core idea in about 45 words', 'B', 'is thorough: the same idea with the full reasoning in about 120 words', 'how vaccines teach the immune system'],
    ['story', 'A', 'is told as a short story about a person', 'B', 'is plain and formal, like a textbook', 'why the Roman Empire built roads'],
  ];
  db.taste = db.taste || [];
  for (const [id, , a, , b, topic] of pairs) {
    if (db.taste.some((t) => t.id === id)) continue;
    for (let tries = 0; tries < 4 && !db.taste.some((t) => t.id === id); tries++) {
      const out = await ask(WRITER, `Topic: ${topic}. Write two versions of a short excerpt that teach EXACTLY the same facts. Version A ${a}. Version B ${b}. Then write 3 multiple-choice recall questions answerable from the facts the two versions share (each version must contain what is needed), 4 options each. Format: {"a":"...","b":"...","questions":[{"q":"","options":["","","",""],"key":0}]}`, 3500);
      if (!out || !out.a || !out.b) continue;
      const qs = [];
      for (const q of out.questions || []) {
        // blind: solved from version A and from version B alone; kept only if both versions support the key
        const okA = (await solveBlind({ ...q, passage: out.a })) === q.key;
        const okB = (await solveBlind({ ...q, passage: out.b })) === q.key;
        tally('taste', wellFormed(q) && okA && okB);
        if (wellFormed(q) && okA && okB) qs.push(q);
      }
      if (qs.length >= 2) db.taste.push({ id, a: out.a, b: out.b, questions: qs });
    }
    save();
  }
}

(async () => {
  if (!KEY) { console.error('NVIDIA_API_KEY missing'); process.exit(1); }
  if (want('self')) await selfItems();
  if (want('reading')) await reading();
  if (want('reason')) await reason();
  if (want('minilesson')) await minilesson();
  if (want('taste')) await taste();
  save();
  console.log(JSON.stringify({ calls_answered_by: used, kept_dropped_by_kind: stats, self_measures_with_2: Object.values(db.self).filter((x) => x.length >= 2).length, reading: db.reading.length, reason: Object.fromEntries(Object.entries(db.reason).map(([k, v]) => [k, v.length])), minilesson: db.minilesson.length, taste: db.taste.length }, null, 1));
})().catch((e) => { console.error('build failed:', e.message); save(); process.exit(1); });
