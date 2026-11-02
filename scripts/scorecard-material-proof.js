/**
 * Proof that EVERY kind of material is rebuilt around the learner's scorecard, not only lessons.
 *
 *   node scripts/scorecard-material-proof.js --mock                       offline, every kind end to end; part of `npm test`
 *   node scripts/scorecard-material-proof.js --live [--kind=all] [--learners=16] [--topics=2]
 *
 * Kinds: lesson, notes, podcast, test, pack, path (or all). For each learner and topic the SAME base material (a short
 * text per topic, the learner's "upload") is turned into each kind twice through the app's REAL generator:
 *
 *   spec      the learner's own spec in the prompt (services/learning-spec.js), as the generator reads it
 *   generic   a learner we know nothing about (no scorecard: the default spec, no block): the shared version
 *
 *   lesson    services/ai.js generateLesson            notes   services/material-notes.js build
 *   podcast   services/material-podcast.js build       pack    services/material-pack.js build
 *   path      services/course-builder.js build         test    course-builder, then services/material-test.js start
 *
 * Two judges from different model families (Google Gemini 3.8 Flash and Anthropic Claude Sonnet 5.5, both on Standard
 * Compute through the ledger) each read one learner's pair of materials in ONE call, blind to which is which and with
 * the order shuffled, and score every spec field that applies to that kind (0 to 10), plus key-fact coverage (missing
 * facts listed), accuracy, interests used, dislikes avoided and reading level. Plain code measures what it can
 * (sentence length, long words, counts, tier order, key-fact terms, interest and disliked-domain mentions) beside them.
 *
 *   --mock   fake provider (the real generators run, with their grounding and checks) and two code judges. It proves the
 *            harness and the wiring, not the feature.
 *   --live   generation through the app's own path or, when the free lineup is slow, Standard Compute DeepSeek V4.1 Flash
 *            (--writer sc forces it, --writer app forces the app path). Every Standard Compute call is booked on
 *            services/standard-compute-ledger.js (ceilingUsd 26); --budget USD stops this run at that spend.
 *
 * Flags: --kind, --learners N (first N of the sixteen), --topics N (first N of each learner's topics), --topic NAME,
 * --budget USD, --tag NAME, --out FILE, --json FILE, --cache FILE, --concurrency N, --writer sc|app, --judges a,b,
 * --render FILE.json (write the report again from a saved run).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const base = require('./scorecard-modification-proof');
const K = require('./lib/material-proof-kinds');

const { LIVE, MOCK, flag, db, ai, ls, providers, TOPICS, LEARNERS, STATS, avg, f1, table } = base;
const argv = process.argv.slice(2);
const readJsonSafe = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
/** --name=value or --name value. */
function arg(name, def = null) {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
}
const TAG = arg('tag', MOCK ? 'mock' : 'run');
const KIND_ARG = arg('kind', 'all');
let KINDS = KIND_ARG === 'all' ? K.KINDS : KIND_ARG.split(',').filter(Boolean);
for (const k of KINDS) if (!K.KINDS.includes(k)) { console.error(`unknown kind "${k}" (lesson, notes, podcast, test, pack, path, all)`); process.exit(2); }
const N_LEARNERS = Math.max(1, Math.min(LEARNERS.length, Number(arg('learners', LEARNERS.length))));
const N_TOPICS = Math.max(1, Number(arg('topics', 4)));
const TOPIC_FILTER = arg('topic');
const CONCURRENCY = Number(arg('concurrency', LIVE ? 4 : 8));
const BUDGET_USD = Number(arg('budget', LIVE ? 3.5 : 0));
const OUT = arg('out', MOCK ? path.join(os.tmpdir(), `scorecard-proof-all-mock-${process.pid}.md`) : path.join(base.ROOT, 'docs', 'SCORECARD-PROOF-ALL.md'));
const JSON_OUT = arg('json', MOCK ? path.join(os.tmpdir(), `scorecard-proof-all-mock-${process.pid}.json`) : path.join(base.ROOT, 'docs', `scorecard-proof-all-${TAG}.json`));
const TIE = 0.25; // a difference of a quarter point or less is a tie
const JUDGE_VERSION = 'v1';
// Bump a kind's spec-arm revision when its generator changes, so a cached artifact written by older code is not reused.
// notes, podcast r3: held to the learner's spec as a lesson is (every point of the text, their interests as analogies, one revision).
const SPEC_REV = { notes: 'r3', podcast: 'r3' };

const materials = require('../services/materials');
const notesSvc = require('../services/material-notes');
const podcastSvc = require('../services/material-podcast');
const packSvc = require('../services/material-pack');
const courseSvc = require('../services/course-builder');
const testSvc = require('../services/material-test');

const { cache, sha, limited, spend } = base;
const state = { generic: null };

// ── judges ──────────────────────────────────────────────────────────────────
const ALL_JUDGES = {
  gemini: { id: 'google/gemini-3.8-flash', short: 'gemini', family: 'google', extra: { reasoning_effort: 'low' } },
  sonnet: { id: 'anthropic/claude-sonnet-5.5', short: 'sonnet', family: 'anthropic', extra: {} },
};
const MOCK_JUDGES = { gemini: { id: 'code-a', short: 'gemini', family: 'code' }, sonnet: { id: 'code-b', short: 'sonnet', family: 'code' } };
const JUDGE_SET = (arg('judges', 'gemini,sonnet')).split(',').filter(Boolean).map((j) => (MOCK ? MOCK_JUDGES : ALL_JUDGES)[j]).filter(Boolean);
const JUDGE_NAMES = JUDGE_SET.map((j) => j.short);

// ── the mock transport: a fake provider that answers every task the generators ask ──
const passagesOf = (user) => {
  const out = []; const re = /\[(p\d+)\]\n([\s\S]*?)(?=\n\n\[p\d+\]\n|$)/g; let m;
  while ((m = re.exec(String(user)))) out.push({ id: m[1], text: m[2] });
  return out;
};
const sentsOf = (t) => String(t).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 25);
/** One sentence as pieces of at most `capWords` words (split at the comma nearest the middle, else the middle). */
function splitAt(sent, capWords) {
  const w = sent.split(' ');
  if (w.length <= capWords) return [sent];
  const mid = Math.floor(w.length / 2);
  let at = mid;
  for (let d = 0; d < w.length; d++) { if (/,$/.test(w[mid + d] || '')) { at = mid + d + 1; break; } if (/,$/.test(w[mid - d] || '')) { at = mid - d + 1; break; } }
  return [w.slice(0, at).join(' '), w.slice(at).join(' ')].filter(Boolean);
}
const num = (re, s, d) => { const m = re.exec(s); return m ? Number(m[1]) : d; };

function mockTask(req) {
  const sys = String(req.system || '');
  const hasBlock = sys.includes('HOW TO BUILD THIS FOR THIS LEARNER');
  const hasQ = sys.includes('Questions: Give every question a tier');
  const cap = num(/most sentences (\d+) words or fewer/, sys, 99);
  const ps = passagesOf(req.user);
  const flat = ps.flatMap((p) => sentsOf(p.text).map((s) => ({ pid: p.id, s })));
  const task = req.task;
  const explain = (s) => (hasQ && /one short sentence/.test(sys) ? 'Right.' : hasQ && /two or three sentences/.test(sys) ? `Because the text says: ${s.slice(0, 80)}. The tempting choice leaves that out, so it fails.` : `${/Low stakes/.test(sys) ? 'Practice answer' : 'Test answer'}: ${s.slice(0, 60)}.`);
  const tierAt = (i, n) => (hasQ ? Math.min(3, Math.floor((i * 3) / Math.max(1, n)) + 1) : [2, 3, 1, 3, 2, 1, 2, 3][i % 8]);
  const mcFrom = (x, i, n, forWhere) => ({
    ...(forWhere ? { for: forWhere } : {}), type: 'multiple_choice', prompt: `${doms.length && i % 2 === 0 ? `In ${doms[i % doms.length]}, what` : 'What'} does the text say about "${x.s.split(' ').slice(0, 5).join(' ')}"? (${i + 1})`,
    choices: [x.s.slice(0, 70), 'The text does not mention it.', 'It says the opposite.'], answer_index: 0, misconceptions: ['', 'a guess', 'a mix-up'], explanation: explain(x.s), tier: tierAt(i, n), passage_id: x.pid, quote: x.s,
  });
  const typedFrom = (x, i, n, forWhere) => ({
    ...(forWhere ? { for: forWhere } : {}), type: 'short_answer', prompt: `Fill in: ${x.s.split(' ').slice(0, 4).join(' ')} ___ (${i + 1})`, answer: x.s.split(' ')[4] || 'idea', explanation: explain(x.s), tier: tierAt(i, n), passage_id: x.pid, quote: x.s,
  });
  const typedPref = /Prefer questions answered by typing/.test(sys);
  // The interests the block asks for (the "Interests:" line, or the setting a question may use): framed analogies that point back at a point of the text.
  const doms = (((/ on ([^\n]*?), (?:at least|at most) \w+ in all/.exec(sys) || [])[1] || (/use ([^\n]*?) as the context/.exec(sys) || [])[1] || '')).split(',').map((d) => d.trim()).filter(Boolean);
  const longest = (s) => s.split(/[^A-Za-zà-ÿ-]+/).sort((a, b) => b.length - a.length)[0];
  const analogy = (x, i) => (doms.length ? `Think of ${doms[i % doms.length]}, like ${longest(x.s)}.` : '');
  if (task === 'material_notes') {
    const maxB = num(/2 to (\d+) bullets/, sys, 8);
    const bullets = flat.flatMap((x, i) => splitAt(x.s, cap).map((t, k) => ({ text: k === 0 && i % 2 === 0 && doms.length ? `${t.replace(/[,;:]$/, '').replace(/([^.!?])$/, '$1.')} ${analogy(x, i)}` : t, passage_id: x.pid, quote: x.s })));
    const sections = [];
    for (let i = 0; i < bullets.length && sections.length < 5; i += maxB) sections.push({ heading: `Part ${sections.length + 1}`, bullets: bullets.slice(i, i + maxB) });
    return { sections };
  }
  if (task === 'material_podcast') {
    const dialogic = /question-and-answer exchanges/.test(sys);
    const turns = [{ host: 'A', text: 'Welcome. Today we go through your material.' }];
    flat.forEach((x, i) => {
      for (const part of splitAt(x.s, cap)) turns.push({ host: 'A', text: part, passage_id: x.pid, quote: x.s });
      if (doms.length && i % 2 === 0) turns.push({ host: 'A', text: analogy(x, i) });
      if (dialogic || i % 3 === 2) turns.push({ host: 'B', text: 'Can you say more about that?' });
    });
    turns.push({ host: 'A', text: 'So, to recap: that was the main idea.' });
    while (turns.length < 8) turns.splice(turns.length - 1, 0, { host: 'B', text: 'Anything else?' });
    return { title: 'Episode', turns: turns.slice(0, 46), checkins: [] };
  }
  if (task === 'material_pack') {
    const maxPara = num(/summary \(\d+ to (\d+) short paragraphs/, sys, 4);
    const nCards = num(/flashcards \(up to (\d+)/, sys, 8);
    const nQuiz = num(/up to (\d+) with for "quiz"/, sys, 4);
    const nTest = num(/up to (\d+) with for "test"/, sys, 6);
    const paras = Array.from({ length: Math.min(maxPara, Math.max(1, Math.ceil(flat.length / 2))) }, (_, i) => `${flat.slice(i * 2, i * 2 + 2).map((x) => x.s).join(' ') || flat[0].s}${doms.length ? ` ${analogy(flat[i * 2] || flat[0], i)}` : ''}`);
    const quiz = flat.slice(0, nQuiz).map((x, i, a) => mcFrom(x, i, a.length, 'quiz'));
    const test = flat.slice(0, nTest).map((x, i, a) => (typedPref || (i % 2 && /Mix multiple/.test(sys)) ? typedFrom(x, i, a.length, 'test') : mcFrom(x, i, a.length, 'test')));
    return { summary: paras, flashcards: flat.slice(0, nCards).map((x, i) => ({ front: x.s.split(' ').slice(0, 3).join(' '), back: `${x.s.slice(0, 120)}${doms.length && i % 3 === 0 ? ` ${analogy(x, i)}` : ''}`, passage_id: x.pid, quote: x.s })), questions: [...quiz, ...test] };
  }
  if (task === 'material_verify') {
    const n = (String(req.user).match(/^\d+\./gm) || []).length;
    return { verdicts: Array.from({ length: n }, (_, i) => ({ n: i + 1, supported: true })) };
  }
  if (task === 'material_outline') {
    const ids = [...new Set(String(req.user).match(/\[p\d+\]/g) || [])].map((x) => x.slice(1, -1));
    return { skills: [1, 2, 3].map((i) => ({ id: `skill${i}`, title: `Skill ${i} of the material`, summary: `Part ${i}.`, unit: 'Unit 1', prerequisites: i > 1 ? [`skill${i - 1}`] : [], passage_ids: ids.slice(0, 6), taught: true })) };
  }
  if (task === 'material_lesson') {
    const sparse = /Keep paragraphs to two or three short sentences/.test(sys);
    const per = sparse ? 2 : 4;
    const paragraphs = [];
    const lim = hasBlock ? flat.slice(0, 6) : flat;
    for (let i = 0; i < lim.length; i += per) paragraphs.push(`${lim.slice(i, i + per).map((x) => x.s).join(' ')}${doms.length && i === 0 ? ` ${analogy(lim[0], 0)}` : ''}`);
    const qs = flat.slice(0, 7).map((x, i, a) => (typedPref && i % 2 ? typedFrom(x, i, a.length) : mcFrom(x, i, a.length)));
    return { lesson: { paragraphs: paragraphs.slice(0, 5), key_points: flat.slice(0, 2).map((x) => x.s.slice(0, 90)) }, questions: qs };
  }
  return null;
}

function installMock() {
  const fake = {
    name: 'mock', isEnabled: () => true, costCents: () => 0,
    structured: async (req) => {
      if (/^lesson_write/.test(String(req.task))) return { data: base.mockWriter(req), model: 'mock-writer', usage: null };
      const data = mockTask(req);
      return data ? { data, model: 'mock-writer', usage: null } : null;
    },
  };
  providers.chain = () => [fake];
  providers.isOutside = () => false;
}

// ── the learners, and the material each one uploaded ────────────────────────
const matCache = new Map();
function matFor(user, topicId) {
  const k = `${user.id}|${topicId}`;
  if (!matCache.has(k)) {
    const r = materials.addPaste(user.id, TOPICS[topicId].title, K.BASE_TEXTS[topicId]);
    if (!r || !r.value) throw new Error(`could not add material for ${user.id}: ${JSON.stringify(r).slice(0, 120)}`);
    matCache.set(k, r.value);
  }
  return matCache.get(k);
}
const llm = (a) => ai.structuredDetail(a); // the generators' own default transport

const courses = new Map();
function courseFor(user, topicId) {
  const mat = matFor(user, topicId);
  const k = `${user.id}|${topicId}`;
  if (!courses.has(k)) courses.set(k, (async () => {
    const r = await courseSvc.build(user.id, mat.id, { llm, force: true });
    return r.course ? r.course : { error: r.error || r.code };
  })());
  return courses.get(k);
}

/** The spec the generator itself computes for this material (buildSpec with the material's title as the topic). */
const specFor = (userId, topicId) => ls.buildSpec(userId, { topic: TOPICS[topicId].title });

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Build one kind of material for one user and topic through the app's real generator. Resolves { text, parts, models } or { error }. */
async function buildKind(kind, arm, lrn, user, topicId) {
  const mat = kind === 'lesson' ? null : matFor(user, topicId);
  try {
    if (kind === 'lesson') {
      const spec = ls.buildSpec(user.id, { topic: topicId, trackId: null });
      const g = await base.generate(arm, lrn, user.id, topicId, spec);
      if (!g || !g.lesson) return { error: (g && g.error) || 'no lesson' };
      return { text: base.lessonDisplay(g.lesson), measureText: base.lessonText(g.lesson), parts: { lesson: g.lesson }, models: g.models || [], spec };
    }
    const spec = specFor(user.id, topicId);
    if (kind === 'notes') {
      const r = await notesSvc.build(user.id, mat.id, { llm, force: true });
      if (!r.notes) return { error: r.error || r.code };
      const text = K.renderNotes(r.notes);
      return { text, units: r.notes.sections.flatMap((s) => s.bullets.map((b) => b.text)), parts: { sections: r.notes.sections }, models: [], spec, meta: { spec_hash: r.notes.spec_hash || null, coverage: r.notes.coverage, dropped: r.notes.dropped } };
    }
    if (kind === 'podcast') {
      const r = await podcastSvc.build(user.id, mat.id, { kind: 'overview', llm, force: true });
      if (!r.episode) return { error: r.error || r.code };
      return { text: K.renderPodcast(r.episode, spec), units: r.episode.turns.map((t) => t.text), measureText: r.episode.turns.map((t) => t.text).join(' '), parts: { turns: r.episode.turns }, models: r.episode.models || [], spec };
    }
    if (kind === 'pack') {
      const r = await packSvc.build(user.id, mat.id, { llm, force: true });
      if (!r.pack) return { error: r.error || r.code };
      const qText = (q) => `${q.prompt} ${(q.choices || []).join(' ')} ${q.explanation || ''}`;
      return { text: K.renderPack(r.pack), units: [...(r.pack.summary || []), ...(r.pack.cards || []).map((c) => `${c.front} ${c.back}`), ...(r.pack.quiz || []).map(qText), ...(r.pack.test || []).map(qText)], parts: { summary: r.pack.summary, cards: r.pack.cards, quiz: r.pack.quiz, test: r.pack.test }, models: r.pack.models || [], spec, meta: { spec_hash: r.pack.spec_hash || null, dropped: r.pack.dropped } };
    }
    const course = await courseFor(user, topicId);
    if (course.error) return { error: course.error };
    if (kind === 'path') return { text: K.renderPath(course), units: course.skills.flatMap((s) => [...(s.lesson.paragraphs || []), ...(s.lesson.key_points || []), ...(s.questions || []).map((q) => `${q.prompt} ${(q.choices || []).join(' ')} ${q.explanation || ''}`)]), parts: { skills: course.skills }, models: course.models || [], spec };
    if (kind === 'test') {
      const opts = testSvc.options(user.id, mat.id);
      if (opts.error) return { error: opts.error };
      const t = testSvc.start(user.id, mat.id, { timed: false, random: rng(7) });
      if (t.error) return { error: t.error };
      const byQ = new Map(course.skills.flatMap((s) => s.questions.map((q) => [q.id, q])));
      const questions = t.questions.map((q) => { const full = byQ.get(q.id) || {}; return { ...full, id: q.id, tier: q.tier, type: q.type, prompt: q.prompt, choices: q.choices || full.choices }; });
      const view = { questions, timed_seconds: opts.seconds_per_question, suggest_timed: opts.suggest_timed };
      return { text: K.renderTest(view), units: questions.map((q) => `${q.prompt} ${(q.choices || []).join(' ')} ${q.explanation || ''}`), measureText: questions.map((q) => `${q.prompt} ${q.explanation || ''}`).join(' '), parts: { questions, secondsPer: opts.seconds_per_question, suggestTimed: opts.suggest_timed }, models: course.models || [], spec };
    }
    return { error: `unknown kind ${kind}` };
  } catch (e) {
    return { error: `${kind}: ${e.message}` };
  }
}

const inflightGeneric = new Map();
async function artifact(kind, arm, lrn, user, topicId) {
  const generic = arm === 'generic';
  const key = `art:${JUDGE_VERSION}:${kind}:${arm}:${generic ? '' : lrn.name}:${topicId}`;
  const ck = `${key}:${sha(JSON.stringify([K.BASE_TEXTS[topicId], generic ? '' : ls.specToPrompt(specFor(user.id, topicId), { surface: 'lesson' }), kind, ...(!generic && SPEC_REV[kind] ? [SPEC_REV[kind]] : [])]))}`;
  const hit = LIVE ? cache.get(ck) : null;
  if (hit && hit.text) return hit;
  const run = async () => { const a = await buildKind(kind, arm, lrn, user, topicId); if (LIVE && a.text) cache.set(ck, { ...a, spec: undefined }); return a; };
  if (!generic) return run();
  if (!inflightGeneric.has(key)) inflightGeneric.set(key, run());
  return inflightGeneric.get(key);
}

// ── the judge ───────────────────────────────────────────────────────────────
const EXTRAS = ['coverage', 'accuracy', 'interests_used', 'dislikes_avoided', 'reading_level'];
const JUDGE_SYSTEM = 'You are a strict, fair evaluator of teaching material. You are shown one learner\'s profile, the base text that learner uploaded, the requirements for how this kind of material should be built for them (the spec), and TWO versions of the material, X and Y. Score each version only on the evidence in its text, on its own. Use the whole 0 to 10 range: 10 is exact, 5 is half-followed, 0 is the opposite or absent. Do not reward length. Do not guess who or what wrote either version. Both versions were meant to teach only what the base text says. Reply with one JSON object only, no prose.';

function judgeUserPrompt(kind, lrn, topicId, spec, fieldList, X, Y) {
  const topic = TOPICS[topicId];
  const info = K.KIND_INFO[kind];
  const one = (v) => `{ ${[...fieldList.map(([id]) => `"${id}": {"score": 0-10, "reason": "at most 12 words"}`)].join(', ')} }`;
  const verdict = `{"fit": ${one()}, "coverage": {"score": 0-10, "missing": ["each key fact missing or wrong, in a few words"]}, "accuracy": {"score": 0-10, "errors": ["each factual error, or empty"]}, "interests_used": {"score": 0-10, "used": ["the learner's interests that shaped an example, comparison or framing; 10 if woven in naturally, 0 if none, 5 if the learner states no interests"]}, "dislikes_avoided": {"score": 0-10, "violations": ["anything the learner dislikes that appears; 10 if none"]}, "reading_level": {"score": 0-10, "reason": "is the language right for this learner's age and reading needs"}}`;
  return `LEARNER: ${lrn.blurb}. Age ${lrn.age}. Interests and what they said: ${JSON.stringify(lrn.survey || {})}${lrn.esl ? '. English is not their first language' : ''}${lrn.device === 'phone' ? '. Uses a phone only, short sessions' : ''}${lrn.device === 'desk' ? '. Long desk sessions' : ''}.

KIND OF MATERIAL: ${info.label}: ${info.what}.

BASE TEXT THE LEARNER UPLOADED (${topic.title}):
"""
${kind === 'lesson' ? `(no uploaded text: the lesson is on the topic "${topic.title}")` : K.BASE_TEXTS[topicId]}
"""
KEY FACTS THAT MUST SURVIVE (each should be present, correct and clear):
${topic.keyFacts.map((k, i) => `${i + 1}. ${k}`).join('\n')}

WHAT THIS ${info.label.toUpperCase()} SHOULD BE LIKE FOR THIS LEARNER (the spec), one line per field:
${fieldList.map(([id, d]) => `- ${id}: ${d}`).join('\n')}

VERSION X:
<<<
${X}
>>>

VERSION Y:
<<<
${Y}
>>>

Return this JSON (every key present for both versions):
{"X": ${verdict}, "Y": ${verdict}}`;
}

function parseVerdict(v, fieldList) {
  if (!v || typeof v !== 'object' || !v.fit) return null;
  const n = (x) => (Number.isFinite(Number(x && x.score)) ? Math.max(0, Math.min(10, Number(x.score))) : null);
  const fit = {};
  for (const [id] of fieldList) { const s = n(v.fit[id]); if (s === null) return null; fit[id] = { score: s, reason: String(v.fit[id].reason || '').slice(0, 160) }; }
  const out = { fit };
  for (const e of EXTRAS) { const s = n(v[e]); if (s === null) return null; out[e] = { ...v[e], score: s }; }
  out.coverage.missing = Array.isArray(v.coverage.missing) ? v.coverage.missing.map(String).slice(0, 8) : [];
  out.accuracy.errors = Array.isArray(v.accuracy.errors) ? v.accuracy.errors.map(String).slice(0, 8) : [];
  out.dislikes_avoided.violations = Array.isArray(v.dislikes_avoided.violations) ? v.dislikes_avoided.violations.map(String).slice(0, 8) : [];
  out.interests_used.used = Array.isArray(v.interests_used.used) ? v.interests_used.used.map(String).slice(0, 8) : [];
  return out;
}

const clamp10 = (x) => Math.max(0, Math.min(10, x));
const near = (actual, want, tol) => clamp10(10 - (Math.abs(actual - want) / Math.max(tol, 1e-9)) * 5);

/** The mock judges: scores from what code measured, so the harness can be run offline. Two judges that differ by a small fixed offset. */
function mockVerdict(kind, fieldList, m, spec, lrn, judgeIndex) {
  const jit = (id) => (judgeIndex ? ((parseInt(sha(`${id}${m.words}`).slice(0, 2), 16) % 9) - 4) / 8 : 0);
  const score = (id) => {
    let s = 7;
    if (id === 'sentence_length') s = near(m.meanSentenceWords, Math.min(spec.language.maxSentenceWords, 14), 8);
    else if (id === 'vocabulary' || id === 'vocabulary_spoken' || id === 'wording') s = clamp10(10 - Math.max(0, m.longWordShare - (0.025 + 0.012 * Math.max(0, spec.language.vocabularyGrade - 3))) * 120);
    else if (id === 'bullet_size') s = near(m.bulletsPerSection, Math.max(3, Math.min(8, spec.lesson.chunkSentences + 2)), 3);
    else if (id === 'lesson_chunking') s = near(m.sentencesPerParagraph, spec.explain.paragraphSentences, 3);
    else if (id === 'difficulty_ramp' || id === 'question_ramp') s = m.tierMonotone ? 9 : 3.5;
    else if (id === 'difficulty_start') s = (spec.difficulty.startOffset <= -0.5 ? (m.tierSeq || '2')[0] === '1' : true) && (m.tierSeq || '').length ? 8.5 : 4;
    else if (id === 'stakes_tone') s = spec.feedback.lowStakes ? (m.testWordHits ? 3 : 9) : 7;
    else if (id === 'feedback_detail' || id === 'explanations') s = near(m.meanExplanationWords, spec.feedback.granularity === 'detailed' ? 22 : spec.feedback.granularity === 'brief' ? 3 : 12, 12);
    else if (id === 'question_format') s = near(m.typedShare, spec.practice.typedAnswers, 0.5);
    else if (id === 'check_in_frequency') s = m.checkIns !== undefined ? near(m.checkIns, Math.max(1, Math.round(m.spokenMinutes / (spec.lesson.checkEveryChunks === 1 ? 2 : spec.lesson.checkEveryChunks === 3 ? 4 : 3))), 3) : 7;
    else if (id === 'dialogue_style') s = spec.engagement.dialogue ? (m.bQuestions >= m.turns / 3 ? 9 : 5) : 7;
    else if (id === 'interest_analogies') s = m.interestsUsed ? (m.analogyProblems ? 5 : 9.5) : 2;
    else if (id === 'avoided_domains') s = m.avoidHits.length ? 1 : 10;
    else if (kind === 'lesson') s = 7;
    return Number(clamp10(s + jit(id)).toFixed(1));
  };
  const o = { fit: Object.fromEntries(fieldList.map(([id]) => [id, { score: score(id), reason: 'measured by code' }])) };
  o.coverage = { score: Number((10 * (1 - (m.keyFactsMissing || 0) / Math.max(1, m.keyFacts))).toFixed(1)), missing: [] };
  o.accuracy = { score: 9, errors: [] };
  o.interests_used = { score: spec.interests.exampleDomains.length ? (m.interestsUsed ? 9 : 2) : 5, used: [] };
  o.dislikes_avoided = { score: m.avoidHits.length ? 0 : 10, violations: m.avoidHits };
  o.reading_level = { score: Number(near(m.meanSentenceWords, spec.language.maxSentenceWords, 10).toFixed(1)), reason: 'measured by code' };
  return o;
}

/** One judge reads one learner's pair of materials, blind and shuffled. Resolves { spec, generic, order } or throws. */
async function judgePair(judge, ji, kind, lrn, topicId, specArt, genArt, spec, fieldList, ms) {
  const specFirst = parseInt(sha(`${kind}|${lrn.name}|${topicId}`).slice(0, 2), 16) % 2 === 0; // shuffled, the same for both judges
  const X = specFirst ? specArt : genArt;
  const Y = specFirst ? genArt : specArt;
  const jkey = `judge:${JUDGE_VERSION}:${judge.id}:${kind}:${lrn.name}:${topicId}:${sha(JSON.stringify([X.text, Y.text, fieldList]))}`;
  const cached = LIVE ? cache.get(jkey) : null;
  if (cached) return cached;
  let out;
  if (MOCK) {
    const mk = (art, m) => {
      if (kind !== 'lesson') return mockVerdict(kind, fieldList, m, spec, lrn, ji);
      // The lesson's mock judge is the first harness's: its code metrics scored against the spec's fourteen dimensions.
      const v = base.heuristicJudge(lrn, topicId, spec, art.parts.lesson);
      for (const [id, x] of Object.entries(v.fit)) x.score = Number(clamp10(x.score + (ji ? ((parseInt(sha(`${id}${m.words}`).slice(0, 2), 16) % 9) - 4) / 8 : 0)).toFixed(1));
      return v;
    };
    out = { spec: mk(specArt, ms.spec), generic: mk(genArt, ms.generic), order: specFirst ? 'spec-first' : 'generic-first', judge: judge.id };
  } else {
    const prompt = judgeUserPrompt(kind, lrn, topicId, spec, fieldList, X.text, Y.text);
    let lastErr = null;
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      if (spend.scUsd >= BUDGET_USD) throw new Error(`budget $${BUDGET_USD} reached`);
      try {
        const text = await base.chatStandardCompute(judge.id, JUDGE_SYSTEM, prompt, { maxTokens: 16000, task: 'scorecard_material_judge', extra: judge.extra });
        const j = base.parseJsonLoose(text);
        const vx = j && parseVerdict(j.X, fieldList); const vy = j && parseVerdict(j.Y, fieldList);
        spend.judgeCalls += 1; spend.judgeModels[judge.id] = (spend.judgeModels[judge.id] || 0) + 1;
        if (vx && vy) out = { spec: specFirst ? vx : vy, generic: specFirst ? vy : vx, order: specFirst ? 'spec-first' : 'generic-first', judge: judge.id };
        else lastErr = new Error(`${judge.id}: unusable verdict`);
      } catch (e) { lastErr = e; }
    }
    if (!out) throw lastErr || new Error('no verdict');
  }
  if (LIVE) cache.set(jkey, out);
  return out;
}

// ── one cell: a learner and a topic, every kind ─────────────────────────────
async function runCell({ l, topicId }, record) {
  const out = [];
  for (const kind of KINDS) {
    const rec = { kind, learner: l.name, topic: topicId, ok: false };
    try {
      const [sa, ga] = await Promise.all([artifact(kind, 'spec', l, l.user, topicId), artifact(kind, 'generic', l, state.generic, topicId)]);
      if (sa.error || ga.error) { rec.error = `${sa.error ? `spec: ${sa.error}` : ''} ${ga.error ? `generic: ${ga.error}` : ''}`.trim(); out.push(rec); continue; }
      const spec = kind === 'lesson' ? ls.buildSpec(l.user.id, { topic: topicId, trackId: null }) : specFor(l.user.id, topicId);
      const topic = TOPICS[topicId];
      const topicWithSource = { ...topic, source: kind === 'lesson' ? null : K.BASE_TEXTS[topicId] };
      const ms = { spec: K.measureArtifact(kind, sa, spec, topicWithSource), generic: K.measureArtifact(kind, ga, spec, topicWithSource) };
      rec.fields = kind === 'lesson' ? base.dimensions(spec) : K.fields(kind, spec);
      // A script too short to reach its first check-in (about 450 spoken words by default) has nothing to judge for check-in spacing: the field is left out, and the code counts stay in the measures.
      if (kind === 'podcast' && !ms.spec.checkIns && !ms.generic.checkIns) rec.fields = rec.fields.filter(([id]) => id !== 'check_in_frequency');
      rec.specSummary = { hash: ls.specHash(spec), isDefault: spec.isDefault, vocabularyGrade: spec.language.vocabularyGrade, maxSentenceWords: spec.language.maxSentenceWords, chunkSentences: spec.lesson.chunkSentences, retrievalChecks: spec.lesson.retrievalChecks, checkEveryChunks: spec.lesson.checkEveryChunks, rampLabel: spec.difficulty.rampLabel, startOffset: spec.difficulty.startOffset, granularity: spec.feedback.granularity, interestShare: spec.interests.share, lowStakes: spec.feedback.lowStakes, typedAnswers: spec.practice.typedAnswers, interests: spec.interests.exampleDomains, avoid: spec.interests.avoidDomains, modes: spec.explain.modes };
      rec.measures = ms;
      rec.models = { spec: sa.models, generic: ga.models };
      rec.text = { spec: sa.text, generic: ga.text };
      rec.meta = { spec: sa.meta || null, generic: ga.meta || null };
      rec.verdicts = {};
      for (let ji = 0; ji < JUDGE_SET.length; ji++) {
        const j = JUDGE_SET[ji];
        try { rec.verdicts[j.short] = await judgePair(j, ji, kind, l, topicId, sa, ga, spec, rec.fields, ms); } catch (e) { rec.verdicts[j.short] = { error: e.message }; }
      }
      rec.ok = true;
    } catch (e) { rec.error = e.message; }
    out.push(rec);
    process.stdout.write('.');
  }
  record(out);
}

// ── the report ──────────────────────────────────────────────────────────────
const fieldIds = (rec) => rec.fields.map(([id]) => id);
const verdictOf = (rec, j, arm) => (rec.verdicts && rec.verdicts[j] && rec.verdicts[j][arm] ? rec.verdicts[j][arm] : null);
const fitMean = (rec, j, arm) => { const v = verdictOf(rec, j, arm); return v ? avg(fieldIds(rec).map((id) => v.fit[id].score)) : null; };
const dimScore = (rec, j, arm, dim) => { const v = verdictOf(rec, j, arm); if (!v) return null; return EXTRAS.includes(dim) ? v[dim].score : (v.fit[dim] ? v.fit[dim].score : null); };
const avgOf = (xs) => avg(xs.filter((x) => x !== null && x !== undefined));
const sgn = (d) => (Math.abs(d) <= TIE ? 0 : d > 0 ? 1 : -1);
const pearson = (a, b) => {
  if (a.length < 3) return null;
  const ma = avg(a); const mb = avg(b);
  let sab = 0; let saa = 0; let sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
};
const fmtR = (r) => (r === null || r === undefined ? 'n/a' : r.toFixed(2));
const sign = (x) => (x === null ? 'n/a' : `${x >= 0 ? '+' : ''}${f1(x)}`);

function aggregate(recs) {
  const agg = {};
  for (const kind of KINDS) {
    const rs = recs.filter((r) => r.kind === kind);
    const okRs = rs.filter((r) => r.ok);
    const a = { cells: rs.length, built: okRs.length, errors: rs.filter((r) => !r.ok).map((r) => `${r.learner}/${r.topic}: ${r.error}`), judges: {} };
    const ids = [...new Set(okRs.flatMap((r) => fieldIds(r)))];
    for (const j of JUDGE_NAMES) {
      const have = okRs.filter((r) => verdictOf(r, j, 'spec') && verdictOf(r, j, 'generic'));
      const failed = okRs.filter((r) => r.verdicts && r.verdicts[j] && r.verdicts[j].error).length;
      const perField = {};
      for (const id of ids) {
        const withF = have.filter((r) => fieldIds(r).includes(id));
        perField[id] = { n: withF.length, spec: avgOf(withF.map((r) => dimScore(r, j, 'spec', id))), generic: avgOf(withF.map((r) => dimScore(r, j, 'generic', id))) };
      }
      const extras = {};
      for (const e of EXTRAS) extras[e] = { spec: avgOf(have.map((r) => dimScore(r, j, 'spec', e))), generic: avgOf(have.map((r) => dimScore(r, j, 'generic', e))) };
      const deltas = have.map((r) => fitMean(r, j, 'spec') - fitMean(r, j, 'generic'));
      a.judges[j] = {
        n: have.length, failed, perField, extras,
        fit: { spec: avgOf(have.map((r) => fitMean(r, j, 'spec'))), generic: avgOf(have.map((r) => fitMean(r, j, 'generic'))) },
        wins: deltas.filter((d) => d > TIE).length, ties: deltas.filter((d) => Math.abs(d) <= TIE).length, losses: deltas.filter((d) => d < -TIE).length,
        lost: have.filter((r, i) => deltas[i] < -TIE).map((r) => `${r.learner}/${r.topic} ${f1(fitMean(r, j, 'spec'))} vs ${f1(fitMean(r, j, 'generic'))}`),
      };
    }
    // Agreement between the judges, cell by cell.
    if (JUDGE_NAMES.length >= 2) {
      const [ja, jb] = JUDGE_NAMES;
      const both = okRs.filter((r) => verdictOf(r, ja, 'spec') && verdictOf(r, jb, 'spec'));
      const da = both.map((r) => fitMean(r, ja, 'spec') - fitMean(r, ja, 'generic'));
      const db_ = both.map((r) => fitMean(r, jb, 'spec') - fitMean(r, jb, 'generic'));
      const levelsA = both.flatMap((r) => [fitMean(r, ja, 'spec'), fitMean(r, ja, 'generic')]);
      const levelsB = both.flatMap((r) => [fitMean(r, jb, 'spec'), fitMean(r, jb, 'generic')]);
      a.agreement = {
        n: both.length, sameVerdict: both.filter((r, i) => sgn(da[i]) === sgn(db_[i])).length,
        bothSpecBetter: both.filter((r, i) => sgn(da[i]) === 1 && sgn(db_[i]) === 1).length,
        opposite: both.filter((r, i) => sgn(da[i]) * sgn(db_[i]) === -1).length,
        rDelta: pearson(da, db_), rLevels: pearson(levelsA, levelsB),
        meanAbsLevelGap: avgOf(levelsA.map((x, i) => Math.abs(x - levelsB[i]))),
      };
    }
    // Learners, weakest first (mean over both judges).
    const byLearner = {};
    for (const r of okRs) {
      const sc = avgOf(JUDGE_NAMES.map((j) => fitMean(r, j, 'spec')));
      if (sc !== null) (byLearner[r.learner] = byLearner[r.learner] || []).push(sc);
    }
    a.learners = Object.entries(byLearner).map(([name, xs]) => ({ name, fit: avg(xs) })).sort((x, y) => x.fit - y.fit);
    // Code measurements: spec vs generic.
    const mkeys = new Set(okRs.flatMap((r) => Object.keys(r.measures.spec)));
    a.measures = {};
    for (const k of mkeys) {
      const vals = (arm) => okRs.map((r) => r.measures[arm][k]).filter((x) => typeof x === 'number');
      if (vals('spec').length) a.measures[k] = { spec: avg(vals('spec')), generic: avg(vals('generic')) };
    }
    a.measures.avoidViolations = { spec: okRs.filter((r) => r.measures.spec.avoidHits.length).length, generic: okRs.filter((r) => r.measures.generic.avoidHits.length).length };
    a.measures.interestCells = { spec: okRs.filter((r) => r.measures.spec.interestsAvailable && r.measures.spec.interestsUsed).length, generic: okRs.filter((r) => r.measures.generic.interestsAvailable && r.measures.generic.interestsUsed).length, of: okRs.filter((r) => r.measures.spec.interestsAvailable).length };
    a.measures.keyFactsMissing = { spec: okRs.reduce((n, r) => n + (r.measures.spec.keyFactsMissing || 0), 0), generic: okRs.reduce((n, r) => n + (r.measures.generic.keyFactsMissing || 0), 0), of: okRs.reduce((n, r) => n + r.measures.spec.keyFacts, 0) };
    // Facts the judges found missing.
    a.missing = {};
    for (const r of okRs) for (const j of JUDGE_NAMES) for (const arm of ['spec', 'generic']) { const v = verdictOf(r, j, arm); if (v) for (const m of v.coverage.missing) { const key = `${arm}/${r.topic}: ${m}`; a.missing[key] = (a.missing[key] || 0) + 1; } }
    agg[kind] = a;
  }
  return agg;
}

const LABEL = (id) => base.DIM_LABEL[id] || id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const EXTRA_LABEL = { coverage: 'Key-fact coverage', accuracy: 'Accuracy', interests_used: 'Interests used', dislikes_avoided: 'Dislikes avoided', reading_level: 'Age-appropriate reading level' };
const JNAME = { gemini: 'Gemini 3.8 Flash', sonnet: 'Claude Sonnet 5.5' };
const jn = (j) => (MOCK ? `code judge ${j === 'gemini' ? 'A' : 'B'}` : JNAME[j] || j);

function renderMarkdown(data) {
  const { agg, recs } = data;
  const L = [];
  const live = data.live;
  const smoke = data.learners < 16 || data.cells < 32;
  L.push('# Scorecard proof, every kind of material', '');
  L.push(`Run \`${data.tag}\`${live ? ' (live models)' : ' (mock: harness check only, not evidence)'} on ${data.generated_at.slice(0, 10)}. Written by \`node scripts/scorecard-material-proof.js\`.`, '');
  if (live && smoke) L.push(`> **This is a smoke run** (${data.learners} learners, ${data.cells} learner-topic cells, kinds: ${data.kinds.join(', ')}), made to prove the pipeline end to end. It is too small to show a trend. The full proof is the command in the last section; running it rewrites this file.`, '');
  L.push(`For each learner and topic, the same short base text (what the learner "uploaded") is turned into each kind of material twice through the app's real generator: with the learner's **spec** (the learning spec in the prompt, built from their scorecard, survey and context) and **generic** (a learner we know nothing about: the default spec, no block). Kinds: ${data.kinds.map((k) => K.KIND_INFO[k].label).join(', ')}. ${data.cells} learner-topic cells, ${data.learners} synthetic learners. Writer path: ${data.writerPath}. Writers: ${Object.entries(data.writers).map(([k, v]) => `${k} x${v}`).join(', ') || 'n/a'}.`, '');
  L.push(`Two judges from different model families, ${JUDGE_NAMES.map(jn).join(' and ')}${live ? ' (both on Standard Compute, through the ledger)' : ''}, each read one learner's pair in a single call, **blind to which version is which** (labelled X and Y, order shuffled), and score each version 0 to 10 on every spec field that applies to that kind, plus key-fact coverage, accuracy, interests used, dislikes avoided and reading level. "Fit" is the mean of a kind's spec fields. A **win** is a cell where the spec version's fit is more than ${TIE} above the generic one's; within ${TIE} is a tie.`, '');

  // Overview
  L.push('## Overview: spec against generic, every kind', '');
  const head = ['Kind', 'Cells'];
  for (const j of JUDGE_NAMES) head.push(`${jn(j)} spec`, 'generic', 'gain');
  head.push('Wins (judge 1 / 2)', 'Judges agree');
  L.push(table(head, KINDS.map((k) => {
    const a = agg[k];
    const row = [K.KIND_INFO[k].label, `${a.built}/${a.cells}`];
    for (const j of JUDGE_NAMES) { const x = a.judges[j]; row.push(f1(x.fit.spec), f1(x.fit.generic), sign(x.fit.spec - x.fit.generic)); }
    row.push(JUDGE_NAMES.map((j) => `${a.judges[j].wins} of ${a.judges[j].n}`).join(' / '));
    row.push(a.agreement ? `${a.agreement.sameVerdict} of ${a.agreement.n}` : 'n/a');
    return row;
  })));
  L.push('');
  const allWins = JUDGE_NAMES.map((j) => ({ j, wins: KINDS.reduce((n, k) => n + agg[k].judges[j].wins, 0), losses: KINDS.reduce((n, k) => n + agg[k].judges[j].losses, 0), n: KINDS.reduce((n, k) => n + agg[k].judges[j].n, 0) }));
  L.push(`Across all kinds: ${allWins.map((w) => `${jn(w.j)} found the spec version better in ${w.wins} of ${w.n} comparisons and worse in ${w.losses}`).join('; ')}.`, '');

  if (data.merge) {
    const m = data.merge;
    L.push('## Re-run: ' + m.redone.map((k) => K.KIND_INFO[k].label.toLowerCase()).join(' and '), '');
    L.push(`These kinds were written again after their generators were changed (notes and podcast are now held to the learner's spec as a lesson is: every point of the text carried, their interests used as framed analogies, one revision pass naming what was wrong, never a revision with fewer points). Every other kind in this report is from the run before (${m.merged_from}). Same sixteen learners, one topic each, same judges and the same generic versions.`, '');
    const row = (k, a) => (a ? [K.KIND_INFO[k].label, a.built + '/' + a.cells, ...JUDGE_NAMES.flatMap((j) => [f1(a.judges[j].fit.spec), f1(a.judges[j].fit.generic), `${a.judges[j].wins} of ${a.judges[j].n}`]), a.agreement ? `${a.agreement.sameVerdict} of ${a.agreement.n}` : 'n/a'] : [K.KIND_INFO[k].label, 'n/a']);
    L.push(table(['Kind', 'Cells', ...JUDGE_NAMES.flatMap((j) => [`${jn(j)} spec`, 'generic', 'wins']), 'Judges agree'], [...m.redone.flatMap((k) => [['**before**', ...row(k, m.before[k]).slice(1)].map((c, i) => (i === 0 ? `${K.KIND_INFO[k].label}, before` : c)), row(k, agg[k]).map((c, i) => (i === 0 ? `**${K.KIND_INFO[k].label}, after**` : c))])]), '');
  }
  for (const kind of KINDS) {
    const a = agg[kind];
    const info = K.KIND_INFO[kind];
    L.push(`## ${info.label}`, '');
    L.push(`Real generator: ${{ lesson: '`services/ai.js` `generateLesson` (the spec block, the post-check and one revision)', notes: '`services/material-notes.js` `build` (surface `notes`)', podcast: '`services/material-podcast.js` `build` (surface `podcast`; check-in spacing by `checkinSlots`)', test: '`services/course-builder.js` `build` (the questions) then `services/material-test.js` `start` (length, order, timing)', pack: '`services/material-pack.js` `build` (surface `material` plus the question shape)', path: '`services/course-builder.js` `build` (surface `material`)' }[kind]}. What is judged: ${info.what}.`, '');
    if (!a.built) { L.push(`No ${info.label.toLowerCase()} was built (${a.errors.slice(0, 3).join('; ') || 'no cells'}).`, ''); continue; }
    if (a.errors.length) L.push(`Cells that did not complete: ${a.errors.slice(0, 6).join('; ')}.`, '');
    const ids = Object.keys(a.judges[JUDGE_NAMES[0]].perField);
    const cols = ['Spec field (0 to 10)'];
    for (const j of JUDGE_NAMES) cols.push(`${jn(j)} generic`, 'spec', 'gain');
    cols.push('n');
    const rows = ids.map((id) => {
      const row = [LABEL(id)];
      for (const j of JUDGE_NAMES) { const p = a.judges[j].perField[id]; row.push(f1(p.generic), f1(p.spec), p.spec === null ? 'n/a' : sign(p.spec - p.generic)); }
      row.push(a.judges[JUDGE_NAMES[0]].perField[id].n);
      return row;
    });
    rows.push(['**Fit (mean of the fields)**', ...JUDGE_NAMES.flatMap((j) => { const x = a.judges[j]; return [`**${f1(x.fit.generic)}**`, `**${f1(x.fit.spec)}**`, `**${sign(x.fit.spec - x.fit.generic)}**`]; }), '']);
    for (const e of EXTRAS) rows.push([EXTRA_LABEL[e], ...JUDGE_NAMES.flatMap((j) => { const x = a.judges[j].extras[e]; return [f1(x.generic), f1(x.spec), sign(x.spec - x.generic)]; }), '']);
    L.push(table(cols, rows), '');
    L.push(`**Wins:** ${JUDGE_NAMES.map((j) => `${jn(j)} ${a.judges[j].wins} of ${a.judges[j].n} (${a.judges[j].ties} ties, ${a.judges[j].losses} worse)`).join('; ')}.${JUDGE_NAMES.some((j) => a.judges[j].lost.length) ? ` Cells where the spec version scored worse: ${JUDGE_NAMES.map((j) => a.judges[j].lost.length ? `${jn(j)}: ${a.judges[j].lost.slice(0, 5).join('; ')}` : '').filter(Boolean).join(' | ')}.` : ''}${JUDGE_NAMES.some((j) => a.judges[j].failed) ? ` Judge calls that failed: ${JUDGE_NAMES.map((j) => `${jn(j)} ${a.judges[j].failed}`).join(', ')}.` : ''}`);
    if (a.agreement) L.push('', `**Agreement between the judges:** the same verdict (spec better, tie or worse) in ${a.agreement.sameVerdict} of ${a.agreement.n} cells; both found the spec version better in ${a.agreement.bothSpecBetter}; opposite verdicts in ${a.agreement.opposite}. Correlation of the spec-minus-generic gain across cells ${fmtR(a.agreement.rDelta)}; of the fit scores themselves ${fmtR(a.agreement.rLevels)}; on average the two judges' fit scores for the same text differ by ${f1(a.agreement.meanAbsLevelGap)} points.`);
    // Weaknesses
    const comb = ids.map((id) => ({ id, spec: avgOf(JUDGE_NAMES.map((j) => a.judges[j].perField[id].spec)), gain: avgOf(JUDGE_NAMES.map((j) => (a.judges[j].perField[id].spec !== null ? a.judges[j].perField[id].spec - a.judges[j].perField[id].generic : null))) }));
    const lowest = [...comb].sort((x, y) => x.spec - y.spec).slice(0, 3);
    const smallest = [...comb].sort((x, y) => x.gain - y.gain).slice(0, 3);
    L.push('', `**Per-field weaknesses** (mean of both judges): lowest for the spec version: ${lowest.map((w) => `${LABEL(w.id).toLowerCase()} ${f1(w.spec)}`).join(', ')}. Smallest gain over generic: ${smallest.map((w) => `${LABEL(w.id).toLowerCase()} ${sign(w.gain)}`).join(', ')}${comb.some((w) => w.gain < 0) ? `. **Fields where generic scored higher: ${comb.filter((w) => w.gain < 0).map((w) => `${LABEL(w.id).toLowerCase()} ${sign(w.gain)}`).join(', ')}**` : ''}.`);
    L.push('', `**Learners the spec fitted least well:** ${a.learners.slice(0, 3).map((x) => `${x.name} ${f1(x.fit)}`).join(', ')}.`);
    const miss = Object.entries(a.missing).sort((x, y) => y[1] - x[1]).slice(0, 5);
    L.push('', `**Key facts the judges found missing:** ${miss.length ? miss.map(([k, v]) => `${k}${v > 1 ? ` (x${v})` : ''}`).join('; ') : 'none reported'}.`);
    // Measures
    const m = a.measures;
    const pick = { lesson: ['words', 'meanSentenceWords', 'longWordShare', 'sections', 'checks'], notes: ['words', 'meanSentenceWords', 'longWordShare', 'sections', 'bullets', 'bulletsPerSection', 'meanBulletWords'], podcast: ['words', 'meanSentenceWords', 'longWordShare', 'turns', 'wordsPerTurn', 'bQuestions', 'checkIns', 'spokenMinutes'], pack: ['words', 'meanSentenceWords', 'longWordShare', 'summaryParagraphs', 'cards', 'quiz', 'testItems', 'tierMonotone', 'typedShare', 'meanExplanationWords', 'testWordHits'], path: ['words', 'meanSentenceWords', 'longWordShare', 'skills', 'paragraphsPerSkill', 'wordsPerParagraph', 'sentencesPerParagraph', 'questionsPerSkill'], test: ['questions', 'meanSentenceWords', 'longWordShare', 'tierMonotone', 'firstTier', 'typedShare', 'meanExplanationWords', 'testWordHits', 'secondsPerQuestion'] }[kind];
    const mrows = pick.filter((k) => m[k]).map((k) => [LABEL(k), f1(m[k].spec), f1(m[k].generic)]);
    mrows.push(['Cells that used a disliked domain', m.avoidViolations.spec, m.avoidViolations.generic], ['Cells that used a stated interest (of those with interests)', `${m.interestCells.spec} of ${m.interestCells.of}`, `${m.interestCells.generic} of ${m.interestCells.of}`], ['Key facts missing by term overlap (of all)', `${m.keyFactsMissing.spec} of ${m.keyFactsMissing.of}`, `${m.keyFactsMissing.generic} of ${m.keyFactsMissing.of}`]);
    L.push('', '**What the code measured in the text (no model):**', '', table(['Measure (mean over cells)', 'spec', 'generic'], mrows), '');
  }

  // Systemic patterns
  L.push('## Systemic patterns across learners and kinds', '');
  const weakFields = {};
  for (const k of KINDS) {
    const a = agg[k]; if (!a.built) continue;
    const ids = Object.keys(a.judges[JUDGE_NAMES[0]].perField);
    for (const id of ids) {
      const g = avgOf(JUDGE_NAMES.map((j) => a.judges[j].perField[id].spec - a.judges[j].perField[id].generic));
      const s = avgOf(JUDGE_NAMES.map((j) => a.judges[j].perField[id].spec));
      (weakFields[id] = weakFields[id] || []).push({ kind: k, spec: s, gain: g });
    }
  }
  const recurring = Object.entries(weakFields).filter(([, xs]) => xs.length >= 2).map(([id, xs]) => ({ id, spec: avg(xs.map((x) => x.spec)), gain: avg(xs.map((x) => x.gain)), kinds: xs.map((x) => x.kind) })).sort((x, y) => x.spec - y.spec);
  if (recurring.length) L.push(`- Fields that recur across kinds, lowest first: ${recurring.slice(0, 4).map((r) => `${LABEL(r.id).toLowerCase()} (${r.kinds.join(', ')}) spec ${f1(r.spec)}, gain ${sign(r.gain)}`).join('; ')}.`);
  const flat = KINDS.filter((k) => agg[k].built).map((k) => ({ k, gain: avgOf(JUDGE_NAMES.map((j) => agg[k].judges[j].fit.spec - agg[k].judges[j].fit.generic)) })).sort((x, y) => x.gain - y.gain);
  if (flat.length) L.push(`- Kind with the smallest overall gain: ${K.KIND_INFO[flat[0].k].label.toLowerCase()} ${sign(flat[0].gain)}; the largest: ${K.KIND_INFO[flat[flat.length - 1].k].label.toLowerCase()} ${sign(flat[flat.length - 1].gain)}.`);
  const learnerAll = {};
  for (const k of KINDS) for (const x of agg[k].learners) (learnerAll[x.name] = learnerAll[x.name] || []).push(x.fit);
  const lw = Object.entries(learnerAll).map(([name, xs]) => ({ name, fit: avg(xs) })).sort((x, y) => x.fit - y.fit);
  if (lw.length) L.push(`- Learners the spec fitted least well across all kinds: ${lw.slice(0, 3).map((x) => `${x.name} ${f1(x.fit)}`).join(', ')}.`);
  const interestKinds = KINDS.filter((k) => agg[k].built && agg[k].measures.interestCells.of);
  const own = interestKinds.filter((k) => k !== 'lesson');
  if (own.length) L.push(`- **Interests in own-material kinds.** The learner's interests, hobbies and dislikes shape their own material too, with the text as the only source of facts: interests appear only as clearly framed analogies, examples or practice contexts that map back to a point of the text (\`analogyProblems\` in \`services/learning-spec.js\` checks that one adds no number, name or point the text lacks, and each generator falls back to the text's own words when it does). Cells where the spec version used a stated interest, of those with interests: ${interestKinds.map((k) => `${K.KIND_INFO[k].label.toLowerCase()} ${agg[k].measures.interestCells.spec} of ${agg[k].measures.interestCells.of} (generic ${agg[k].measures.interestCells.generic})`).join('; ')}. Spec versions that used a disliked domain: ${KINDS.filter((k) => agg[k].built).map((k) => `${k} ${agg[k].measures.avoidViolations.spec}`).join(', ')}. Analogies the check would flag in the spec version: ${KINDS.filter((k) => agg[k].built && agg[k].measures.analogyProblems).map((k) => `${k} ${f1(agg[k].measures.analogyProblems.spec)} per cell`).join(', ') || 'none measured'}. The one lever own material still withholds is \`depth\` (one deeper why or edge case), which would bring facts the text lacks.`);
  const fails = KINDS.flatMap((k) => agg[k].errors.map((e) => `${k} ${e}`));
  L.push(`- Cells that did not complete: ${fails.length ? fails.slice(0, 8).join('; ') : 'none'}.`);
  L.push('');

  // Limits
  L.push('## Limits of this proof', '');
  L.push('- **Fit to the spec is not learning.** The judges score how well a version follows what the spec asks for and whether it keeps the base text\'s facts. They cannot measure that a real learner understands more or remembers longer. Only people learning from these materials can show that.');
  L.push(`- **One writer, two judges.** Every spec and generic version was written by ${Object.keys(data.writers).join(', ') || 'the same writer'} and judged by ${JUDGE_NAMES.map(jn).join(' and ')}. Two families lower the risk that one model's taste decides the result, and the table above reports how often they agree, but both are still language models, and ${live ? 'Gemini ran with low reasoning effort to keep the cost down' : 'the mock judges are code'}.`);
  L.push('- **A pair in one call.** Each judge scores the two versions of a learner side by side (blind, shuffled). That makes the comparison sharp but lets a judge contrast them; it is not two independent absolute ratings.');
  L.push(`- **Short base texts.** Each topic's base text is about 1,300 to 1,800 characters. Longer material exercises more of the pipeline (several passages per call, longer scripts, more check-ins); this proof does not.`);
  L.push('- **Podcast check-ins** are placed by the app\'s own `checkinSlots` from the script length and the spec (a check-in about every 2, 3 or 4 minutes of speech); a real episode pairs them with questions from the learning path. The judge sees the marks, not the questions. With a short base text the script is under two minutes of speech and has no check-in at all, in which case the field is left out of the judged fields for that cell and only the code count (above) speaks for it. A longer base text is needed to exercise it.');
  L.push('- **Practice test.** The questions are written once per learner by the course builder (with the spec\'s question shape in the prompt) and then ordered, sized and timed by `material-test`; a test never writes new questions at start time.');
  L.push('- **Synthetic learners.** Sixteen invented profiles with settled scorecards; most dislikes in them are of a subject or a format (maths, long reading, being timed), so the avoided-domain path is exercised less than the rest.');
  L.push(`- **Fixes this work made** are listed in the commit; the generators that were not receiving the spec, or lost it, were fixed in the mechanism (see the commit message).`);
  L.push('');
  L.push('## Cost', '');
  const lb = data.ledgers.ledgerBefore; const la = data.ledgers.ledgerAfter;
  L.push(`- Standard Compute spend by this run: $${data.spend.scUsd.toFixed(4)} through the ledger (assumed prices, an upper bound), ${data.spend.calls} writer calls and ${data.spend.judgeCalls} judge calls (${Object.entries(data.spend.judgeModels).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}).`);
  if (lb && la) L.push(`- Ledger: before spent $${lb.spent_usd} (${lb.calls} calls, headroom $${lb.headroom_usd}); after spent $${la.spent_usd} (${la.calls} calls, headroom $${la.headroom_usd}).`);
  L.push('');
  L.push('## Running the full proof', '');
  L.push('```', 'node -r dotenv/config scripts/scorecard-material-proof.js --live --kind=all --learners=16 --tag full', '```', '');
  L.push('with `DOTENV_CONFIG_PATH` set to the owner\'s `.env` and `STANDARD_COMPUTE_LEDGER_FILE` set to the real ledger (the script already defaults to both paths). Add `--writer sc` to write with Standard Compute DeepSeek V4.1 Flash instead of probing the free lineup, `--kind=notes,pack` for some kinds, `--learners=4 --topics=1` for fewer cells, `--budget USD` to stop at a spend, and re-run with the same cache file to pay only for what changed.', '');
  return L.join('\n');
}

// ── the mock run's own assertions (part of npm test) ────────────────────────
function assertMock(data, capture) {
  const bad = [];
  const need = (c, m) => { if (!c) bad.push(m); };
  need(data.kinds.length === 6 || KIND_ARG !== 'all', 'all six kinds ran');
  for (const kind of KINDS) {
    const a = data.agg[kind];
    need(a.cells === data.cells, `${kind}: a record for every cell (${a.cells} of ${data.cells})`);
    need(a.built === a.cells, `${kind}: every cell built both versions (${a.built} of ${a.cells}; ${a.errors.slice(0, 2).join('; ')})`);
    for (const j of JUDGE_NAMES) need(a.judges[j].n === a.built, `${kind}: judge ${j} has a verdict for every built cell (${a.judges[j].n} of ${a.built})`);
    need(a.judges[JUDGE_NAMES[0]].fit.spec > a.judges[JUDGE_NAMES[0]].fit.generic, `${kind}: the spec version fits better than the generic one in the mock (${f1(a.judges[JUDGE_NAMES[0]].fit.spec)} vs ${f1(a.judges[JUDGE_NAMES[0]].fit.generic)})`);
    need(a.agreement && a.agreement.n === a.built, `${kind}: agreement computed over every cell`);
    const specs = new Set(data.recs.filter((r) => r.kind === kind && r.ok).map((r) => r.specSummary.hash));
    need(specs.size >= Math.min(data.learners, 12), `${kind}: learners get different specs (${specs.size} distinct)`);
    for (const r of data.recs.filter((x) => x.kind === kind && x.ok)) {
      need(r.text.spec.length > 40 && r.text.generic.length > 40, `${kind}/${r.learner}/${r.topic}: both versions have text`);
      need(r.fields.length >= 4, `${kind}/${r.learner}/${r.topic}: at least four spec fields apply (${r.fields.length})`);
    }
  }
  // Interests and dislikes drive every kind, own material included: used as framed analogies, never as new facts, and dislikes avoided.
  for (const kind of KINDS) {
    const rs = data.recs.filter((r) => r.kind === kind && r.ok);
    const withInterests = rs.filter((r) => r.specSummary.interests.length && r.specSummary.interestShare >= 0.3);
    need(withInterests.length >= 12, `${kind}: enough learners with interests to test (${withInterests.length})`);
    need(withInterests.every((r) => r.measures.spec.interestsUsed > 0), `${kind}: every spec version with interests uses them (${withInterests.filter((r) => !r.measures.spec.interestsUsed).map((r) => r.learner).join(', ')} did not)`);
    need(withInterests.filter((r) => r.measures.generic.interestsUsed > 0).length < withInterests.length / 2, `${kind}: the generic version rarely mentions a learner's interests, and then only by chance`);
    need(rs.every((r) => r.measures.spec.avoidHits.length === 0), `${kind}: no spec version uses a disliked domain`);
    if (kind !== 'lesson') need(rs.every((r) => r.measures.spec.analogyProblems === 0), `${kind}: no interest analogy in a spec version adds a claim the base text lacks or points at nothing`);
    if (kind !== 'lesson') need(withInterests.every((r) => r.fields.some(([id]) => id === 'interest_analogies')), `${kind}: the judge scores the interest analogies`);
  }
  // Every generator got the spec block for the learner and none for the generic user, through the real generator path.
  const seen = capture;
  for (const kind of KINDS.filter((k) => k !== 'lesson')) {
    const task = { notes: 'material_notes', podcast: 'material_podcast', pack: 'material_pack', path: 'material_lesson', test: 'material_lesson' }[kind];
    const calls = seen.filter((c) => c.task === task);
    need(calls.some((c) => c.system.includes('HOW TO BUILD THIS FOR THIS LEARNER')), `${kind}: the writer was given the spec block (${task})`);
    need(calls.some((c) => !c.system.includes('HOW TO BUILD THIS FOR THIS LEARNER')), `${kind}: the generic version was written without a block`);
  }
  if (KINDS.includes('pack') || KINDS.includes('path') || KINDS.includes('test')) {
    const q = seen.filter((c) => (c.task === 'material_pack' || c.task === 'material_lesson') && c.system.includes('Questions: Give every question a tier'));
    need(q.length > 0, 'the question shape (tiers, answer format, explanations, stakes) reaches the question writers');
    need(!seen.filter((c) => !c.system.includes('HOW TO BUILD')).some((c) => c.system.includes('Questions: Give every question a tier')), 'and never reaches a generic learner\'s prompt');
  }
  if (KINDS.includes('test')) {
    const t = data.recs.filter((r) => r.kind === 'test' && r.ok);
    need(t.every((r) => r.specSummary.startOffset >= 0.5 || r.measures.spec.tierMonotone), 'the spec learners\' practice tests climb in tier order (a learner who starts at the level may open with one tier-2 question)');
    need(t.some((r) => !r.measures.generic.tierMonotone), 'the generic practice test is shuffled');
  }
  const md = fs.readFileSync(OUT, 'utf8');
  need(/## Overview/.test(md) && /## Systemic patterns/.test(md) && /## Limits of this proof/.test(md), 'the markdown has its sections');
  need(KINDS.every((k) => md.includes(`## ${K.KIND_INFO[k].label}`)), 'the markdown has a section per kind');
  if (bad.length) { console.error(`mock material proof FAILED:\n- ${bad.join('\n- ')}`); process.exit(1); }
  console.log(`scorecard-material-proof --mock: all checks passed (${data.kinds.length} kinds, ${data.cells} cells)`);
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const ledger = LIVE ? require('../services/standard-compute-ledger') : null; // eslint-disable-line global-require
  const ledgerBefore = ledger ? ledger.status() : null;
  // The generic learner is one we know nothing about: no scorecard, no survey and no birth date, so the spec reads as the default.
  state.generic = db.insert('users', { email: 'proof-generic@example.test', display_name: 'Generic', password_hash: 'x', onboarded: true, age_check: { needs_parent: false, under_13: false, synthetic: true } });
  base.setGeneric(state.generic);
  const capture = [];
  let writerPath = 'mock';
  if (MOCK) {
    installMock();
    const real = providers.chain;
    providers.chain = (...a) => real(...a).map((p) => ({ ...p, structured: (req) => { capture.push({ task: req.task, system: String(req.system || ''), user: String(req.user || '') }); return p.structured(req); } }));
  } else {
    base.installPoolTap();
    const forced = arg('writer');
    const healthy = forced ? forced === 'app' : await base.appPathHealthy();
    writerPath = healthy ? 'app path (pool, learner class, free NVIDIA lineup)' : 'Standard Compute DeepSeek V4.1 Flash through the ledger (the free NVIDIA lineup was not answering)';
    if (!healthy) {
      process.env.AI_POOL = '0';
      const w = base.makeScWriter();
      const raw = w.structured.bind(w);
      w.structured = async (a) => { if (spend.scUsd >= BUDGET_USD) throw new Error(`budget $${BUDGET_USD} reached`); return raw(a); };
      providers.chain = () => [w];
      providers.isOutside = () => false;
    }
    console.log(`writer: ${writerPath}`);
  }

  const learners = LEARNERS.slice(0, N_LEARNERS).map((l) => ({ ...l, user: base.makeUser(l) }));
  const cells = [];
  for (const l of learners) {
    const topics = l.topics.filter((t) => !TOPIC_FILTER || t === TOPIC_FILTER).slice(0, N_TOPICS);
    for (const t of topics) cells.push({ l, topicId: t });
  }
  console.log(`${learners.length} learners, ${cells.length} learner-topic cells, kinds ${KINDS.join('+')}, judges ${JUDGE_SET.map((j) => j.id).join(' + ')}, ${MOCK ? 'mock' : 'LIVE'}${LIVE ? `, budget $${BUDGET_USD}` : ''}`);
  const recs = [];
  await limited(cells, CONCURRENCY, (cell) => runCell(cell, (out) => recs.push(...out)));
  process.stdout.write('\n');
  if (cache.flush) cache.flush();

  const order = (r) => K.KINDS.indexOf(r.kind) * 1000 + cells.findIndex((c) => c.l.name === r.learner && c.topicId === r.topic);
  // --merge FILE.json: this run re-did some kinds; the others come from an earlier run's results (its -materials.json carries their text),
  // and the report covers them all.
  let note = null;
  if (arg('merge')) {
    const old = JSON.parse(fs.readFileSync(arg('merge'), 'utf8'));
    const oldMats = readJsonSafe(arg('merge').replace(/\.json$/, '-materials.json'), []);
    const redone = new Set(KINDS);
    const carried = old.recs.filter((r) => !redone.has(r.kind)).map((r) => ({ ...r, text: (oldMats.find((m) => m.kind === r.kind && m.learner === r.learner && m.topic === r.topic) || {}).text }));
    // The earlier results of the same cells (this run may cover fewer than the earlier one), for the before and after.
    const cellKeys = new Set(recs.map((r) => `${r.learner}|${r.topic}`));
    const was = aggregate(old.recs.filter((r) => redone.has(r.kind) && cellKeys.has(`${r.learner}|${r.topic}`)));
    recs.push(...carried);
    KINDS = K.KINDS.filter((k) => recs.some((r) => r.kind === k));
    note = { merged_from: path.basename(arg('merge')), redone: [...redone], before: was, earlier_spend: old.spend, earlier_ledgers: old.ledgers };
  }
  recs.sort((a, b) => order(a) - order(b));
  const agg = aggregate(recs);
  const data = {
    tag: TAG, live: LIVE, writerPath, generated_at: new Date().toISOString(), kinds: KINDS, learners: new Set(recs.map((r) => r.learner)).size, cells: new Set(recs.map((r) => `${r.learner}|${r.topic}`)).size, judges: JUDGE_SET.map((j) => j.id),
    agg, recs: recs.map((r) => ({ ...r, text: undefined })), spend, writers: spend.models, ledgers: { ledgerBefore, ledgerAfter: ledger ? ledger.status() : null }, merge: note,
  };
  const md = renderMarkdown({ ...data, recs });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(data, null, 1));
  fs.writeFileSync(JSON_OUT.replace(/\.json$/, '-materials.json'), JSON.stringify(recs.map((r) => ({ kind: r.kind, learner: r.learner, topic: r.topic, text: r.text, verdicts: r.verdicts })), null, 1));
  fs.writeFileSync(OUT, md);
  console.log(`wrote ${OUT}`);
  for (const k of KINDS) { const a = agg[k]; console.log(`${k}: built ${a.built}/${a.cells}; ${JUDGE_NAMES.map((j) => `${j} spec ${f1(a.judges[j].fit.spec)} vs generic ${f1(a.judges[j].fit.generic)} (wins ${a.judges[j].wins}/${a.judges[j].n})`).join('; ')}${a.agreement ? `; agree ${a.agreement.sameVerdict}/${a.agreement.n}` : ''}`); }
  if (ledger) console.log(`ledger: before spent $${ledgerBefore.spent_usd}, after $${ledger.status().spent_usd}; this run $${spend.scUsd.toFixed(4)} (${spend.calls} writer calls, ${spend.judgeCalls} judge calls)`);
  if (MOCK) assertMock({ ...data, recs }, capture);
}

if (arg('render')) {
  const saved = JSON.parse(fs.readFileSync(arg('render'), 'utf8'));
  const mats = fs.existsSync(arg('render').replace(/\.json$/, '-materials.json')) ? JSON.parse(fs.readFileSync(arg('render').replace(/\.json$/, '-materials.json'), 'utf8')) : [];
  const recs = saved.recs.map((r) => ({ ...r, text: (mats.find((m) => m.kind === r.kind && m.learner === r.learner && m.topic === r.topic) || {}).text }));
  fs.writeFileSync(OUT, renderMarkdown({ ...saved, recs }));
  console.log(`wrote ${OUT}`);
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}
