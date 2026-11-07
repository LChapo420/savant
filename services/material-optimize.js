/**
 * The optimizer: one built course, seen through a learner's goal, with no model and no cost (uploads-beta, 7 Nov 2026; UPLOAD_OPTIMIZE=on, off by default until the owner turns it on).
 *
 * Owner: "every single little bit can be changed, and put into that user's goals whether it be learn the core parts fast"; faster means "they get all the information they normally would ... and
 * remember it". Rounds 1 to 4 (docs/UPLOADS-ANY-FORMAT.md sections 13 to 16) wrote short and hoped a model kept every fact: plain facts fell 18 to 35 points, because a fact's survival was left to a writer.
 * Here a fact's survival is bookkeeping, so it cannot be lost:
 *
 *   ledger(text, keyPoints)     every sentence of the material that says something, with what stresses it, its numbers and names. Sentences said twice are one entry, weightier.
 *   optimize({ course, ... })   each skill's lesson as this goal should read it. Only sentences already fact-checked at build, or the material's own sentences, can appear: nothing can be invented here.
 *     full   every fact in the material is in the reading, each said once: a sentence that says nothing new goes; a fact no sentence carries comes back as the material's own sentence.
 *     core   the stressed facts and what they need, at about half the words. Everything else is in `aside`, on the same page, one tap away, and listed: nothing is deleted.
 *     test   every fact, stressed ones first, a "Watch out" line from what the material warns about, more checks.
 *   A learner who asked for less reading (spec.course.skillShare under 0.9, or a "shorter" choice) gets `lean`: of the sentences that cover the same facts, the fewest words.
 *   The goal also sets how many checks a skill needs (`checks`): one per distinct fact, up to the old five, because a check is most of a learner's time.
 *
 * Pure: it reads nothing and calls nothing (viewFor in services/material-parts.js gathers its inputs). Stored rows are never changed by it, so changing a goal back is exact.
 */
const K = require('./material-keypoints');
const F = require('./material-factcheck');

const enabled = () => String(process.env.UPLOAD_OPTIMIZE || 'off').toLowerCase() === 'on';
const STRESS_MIN = 2.0;
const CORE_SHARE = 0.55;
const COVER_NEED = 0.7;      // share of a fact's terms a sentence must hold to carry it
const PAIR_NEED = 0.85;      // two sentences side by side may carry a fact between them, at a higher bar
const DUP_NEED = 0.85;       // a sentence whose terms were all said already says nothing new
const FULL_QUIZ = 5;
const FILLER = /^(?:in this (?:chapter|section|handout|lesson|unit|document)\b|this (?:chapter|section|handout|lesson|unit|document) (?:will|covers|explains|looks)|we will (?:now|look|see|cover)|let'?s\b|as (?:we|you) (?:saw|said|will see)|see (?:above|below)|see (?:page|section|figure)\b|next,? we\b|for more\b|good luck\b|thanks?\b)/i;

const wc = (t) => (String(t || '').match(/\S+/g) || []).length;
const wcAll = (a) => a.reduce((n, t) => n + wc(t), 0);
const overlap = (a, b) => { if (!a.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / a.size; };
const hardOf = (t) => { const nums = F.numbersOf(t).all; const out = new Set(); for (const n of nums) if (/\d/.test(n)) out.add(n); return out; };
const hasAll = (need, have) => { for (const x of need) if (!have.has(x)) return false; return true; };

/** Sentences of a material, in order, as a learner should read them. */
function sourceSentences(text) {
  const out = [];
  for (const line of F.logicalLines(text)) {
    const plain = F.plainSentence(line);
    if (!plain || /^\[\[[^\]]*\]\]$/.test(plain)) continue;
    for (const s of F.sentencesOf(plain)) out.push(s);
  }
  return out;
}
const isHeading = (s) => wc(s) <= 8 && !/[.!?:;]["'”)\]]*$/.test(s) && !/\d/.test(s);

/**
 * The facts of the material: [{ i, text, terms, nums, weight, cues, repeats }]. A heading or a sentence that only steers the reader is not a fact (kept in `skipped`, for the count).
 * Key points carry the material's own emphasis (services/material-keypoints.js): a sentence takes the weight of the heaviest point it says.
 */
function ledger(text, keyPoints = []) {
  const facts = [];
  const skipped = [];
  const byTerm = new Map();
  const kps = (keyPoints || []).map((k) => ({ weight: k.weight || 1, terms: K.termSet(k.text), text: k.text, signals: k.signals || [] })).filter((k) => k.terms.size);
  for (const s of sourceSentences(text)) {
    const terms = K.termSet(s);
    if (isHeading(s) || FILLER.test(s) || terms.size < 2) { skipped.push(s); continue; }
    // Compared only with facts that share this sentence's rarest terms, so a long material stays quick.
    const seen = [...terms].filter((t) => byTerm.has(t)).sort((a, b) => byTerm.get(a).length - byTerm.get(b).length).slice(0, 3).flatMap((t) => byTerm.get(t));
    const same = [...new Set(seen)].map((n) => facts[n]).find((f) => overlap(terms, f.terms) >= 0.9 && overlap(f.terms, terms) >= 0.9 && hasAll(hardOf(s), f.nums));
    if (same) { same.repeats += 1; same.weight = Math.min(5, same.weight + 0.5); continue; }
    let weight = 1; let cues = [];
    for (const k of kps) if (overlap(k.terms, terms) >= 0.6 && k.weight > weight) { weight = k.weight; cues = k.signals; }
    for (const t of terms) { if (!byTerm.has(t)) byTerm.set(t, []); byTerm.get(t).push(facts.length); }
    facts.push({ i: facts.length, text: s, terms, nums: hardOf(s), weight, cues, repeats: 0 });
  }
  return { facts, skipped };
}

/** A map from a term to the sentences holding it, so a long course is compared quickly: a fact is only held against sentences that share its rarest terms. */
function termIndex(sents) {
  const idx = new Map();
  sents.forEach((s, n) => { for (const t of s.terms) { if (!idx.has(t)) idx.set(t, []); idx.get(t).push(n); } });
  return idx;
}
function candidates(fact, idx) {
  const rare = [...fact.terms].filter((t) => idx.has(t)).sort((a, b) => idx.get(a).length - idx.get(b).length).slice(0, 4);
  // A hard cap on the work: in a material with few distinct words a term can sit in thousands of sentences.
  return [...new Set(rare.flatMap((t) => idx.get(t)))].slice(0, 120);
}
/** Which sentence (or sentence with its neighbour) carries a fact; -1 when none does. Numbers must be there as well as words. */
function carrierOf(fact, sents, idx) {
  let best = -1; let bestShare = 0;
  for (const n of candidates(fact, idx)) {
    const s = sents[n];
    const here = overlap(fact.terms, s.terms);
    if (here >= COVER_NEED && hasAll(fact.nums, s.nums) && here > bestShare) { best = n; bestShare = here; }
    for (const m of [n - 1, n + 1]) {
      const o = sents[m];
      if (!o || o.skill !== s.skill) continue;
      const both = overlap(fact.terms, new Set([...s.terms, ...o.terms]));
      if (both >= PAIR_NEED && hasAll(fact.nums, new Set([...s.nums, ...o.nums])) && both > bestShare) { best = n; bestShare = both; }
    }
  }
  return best;
}

/** The sentences of a course's lessons, in path order. */
function lessonSentences(course) {
  const out = [];
  for (const skill of course.skills || []) {
    const l = skill.lesson || {};
    (l.paragraphs || []).forEach((p, pi) => F.sentencesOf(p).forEach((text) => out.push({ skill: skill.id, pi, text, terms: K.termSet(text), nums: hardOf(text), kind: 'p' })));
    (l.key_points || []).forEach((text) => out.push({ skill: skill.id, pi: -1, text, terms: K.termSet(text), nums: hardOf(text), kind: 'k' }));
  }
  return out;
}

/** The skill a fact belongs to: the one whose passages hold it, or whose lesson shares most of its words. */
function ownerOf(fact, course, passageOf, sents, idx) {
  const pid = passageOf(fact.text);
  const skills = course.skills || [];
  const holders = pid ? skills.filter((s) => (s.passage_ids || []).includes(pid)) : [];
  if (holders.length === 1) return holders[0].id;
  const pool = holders.length ? holders : skills;
  const score = new Map(pool.map((s) => [s.id, 0]));
  for (const n of candidates(fact, idx)) { const s = sents[n]; if (score.has(s.skill)) score.set(s.skill, score.get(s.skill) + overlap(fact.terms, s.terms)); }
  let best = pool[0] ? pool[0].id : null; let v = -1;
  for (const [id, x] of score) if (x > v) { best = id; v = x; }
  return best;
}

const leanFor = (spec) => !!(spec && !spec.isDefault && ((spec.course && Number.isFinite(spec.course.skillShare) && spec.course.skillShare < 0.9) || (spec.lesson && spec.lesson.keepShort)));

/**
 * @returns {{ skills: Map<id, { paragraphs, key_points, aside, added, checks, focus }>, stats }}
 */
function optimize({ course, text, keyPoints = [], goal = 'full', spec = null, lean = null }) {
  const useLean = lean === null ? leanFor(spec) : !!lean;
  const { facts, skipped } = ledger(text, keyPoints);
  const sents = lessonSentences(course);
  const idx = termIndex(sents);
  const passages = (course.passages || []).map((p) => ({ id: p.id, low: String(p.text || '').toLowerCase() }));
  const passageOf = (t) => { const probe = String(t).toLowerCase().slice(0, 60); const hit = passages.find((p) => p.low.includes(probe)); return hit ? hit.id : null; };

  // Which sentence carries which fact.
  const carrier = new Map();
  const carries = new Map();
  for (const f of facts) {
    const n = carrierOf(f, sents, idx);
    if (n >= 0) { carrier.set(f.i, n); if (!carries.has(n)) carries.set(n, []); carries.get(n).push(f); }
    f.owner = ownerOf(f, course, passageOf, sents, idx);
  }
  const stressedFact = (f) => f.weight >= STRESS_MIN;
  // With no emphasis in the material at all, what is core is what the rest leans on: facts whose terms recur, with a number, a name or a definition.
  const docTerms = new Map();
  for (const f of facts) for (const t of f.terms) docTerms.set(t, (docTerms.get(t) || 0) + 1);
  const central = (f) => { let v = 0; for (const t of f.terms) v += Math.min(4, docTerms.get(t) - 1); return v / Math.max(1, f.terms.size) + (f.nums.size ? 0.6 : 0) + (/\b(?:is|are|means|called|defined)\b/.test(f.text) ? 0.4 : 0) + (f.weight - 1); };

  // The reading each sentence would add in the order it comes. Greedy: a sentence stays when it carries a fact nothing kept has, or (not lean) when it is teaching talk that does not repeat what was said.
  const kept = new Set();
  const coveredFacts = new Set();
  const asideOf = new Map();
  const put = (id, t) => { if (!asideOf.has(id)) asideOf.set(id, []); asideOf.get(id).push(t); };
  // What has been said so far, by term, so "does this repeat" looks only at sentences that share its rarest terms.
  const saidBy = new Map();
  const saidNums = new Set();
  const addSaid = (s) => { for (const t of s.terms) { if (!saidBy.has(t)) saidBy.set(t, []); saidBy.get(t).push(s); } for (const n of s.nums) saidNums.add(n); };
  const repeats = (s) => {
    if (![...s.nums].every((n) => saidNums.has(n))) return false;
    const near = [...s.terms].filter((t) => saidBy.has(t)).sort((a, b) => saidBy.get(a).length - saidBy.get(b).length).slice(0, 3).flatMap((t) => saidBy.get(t));
    return near.some((o) => overlap(s.terms, o.terms) >= DUP_NEED);
  };

  // Core: how much reading, and which facts earn it.
  const coreFacts = new Set();
  if (goal === 'core') {
    for (const f of facts) if (stressedFact(f)) coreFacts.add(f.i);
    const total = facts.reduce((n, f) => n + wc(f.text), 0);
    const budget = Math.max(40, total * CORE_SHARE * (useLean ? 0.8 : 1));
    let w = 0; for (const f of facts) if (coreFacts.has(f.i)) w += wc(f.text);
    // Every skill says at least its most central fact, so a skill is never empty.
    const ownedBy = new Map();
    for (const f of facts) { if (!ownedBy.has(f.owner)) ownedBy.set(f.owner, []); ownedBy.get(f.owner).push(f); }
    for (const skill of course.skills || []) {
      const mine = (ownedBy.get(skill.id) || []);
      if (mine.length && !mine.some((f) => coreFacts.has(f.i))) { const top = mine.slice().sort((a, b) => central(b) - central(a))[0]; coreFacts.add(top.i); w += wc(top.text); }
    }
    for (const f of facts.slice().sort((a, b) => central(b) - central(a))) {
      if (coreFacts.has(f.i)) continue;
      if (w + wc(f.text) > budget) continue;
      coreFacts.add(f.i); w += wc(f.text);
    }
  }
  const needed = (f) => (goal === 'core' ? coreFacts.has(f.i) : true);

  sents.forEach((s, n) => {
    const mine = (carries.get(n) || []).filter((f) => needed(f) && !coveredFacts.has(f.i));
    const talk = !(carries.get(n) || []).length;
    let keep = mine.length > 0;
    if (!keep && goal !== 'core' && !useLean && talk && !repeats(s) && s.kind === 'p') keep = true; // teaching talk the ledger has no line for: it was fact-checked at build, and it stays unless it repeats
    if (keep) { kept.add(n); addSaid(s); for (const f of mine) coveredFacts.add(f.i); } else if (s.kind === 'p' && !repeats(s)) put(s.skill, s.text);
  });

  // What no kept sentence carries, in the material's own words, on the skill that owns it.
  const added = new Map();
  for (const f of facts) {
    if (coveredFacts.has(f.i)) continue;
    if (!f.owner) continue;
    if (needed(f)) { if (!added.has(f.owner)) added.set(f.owner, []); added.get(f.owner).push(f); coveredFacts.add(f.i); } else put(f.owner, f.text);
  }

  // Put the skills together.
  const skills = new Map();
  const keptOf = new Map();
  sents.forEach((s, n) => { if (!kept.has(n)) return; if (!keptOf.has(s.skill)) keptOf.set(s.skill, []); keptOf.get(s.skill).push({ s, n }); });
  const factsOf = new Map();
  for (const f of facts) { if (!factsOf.has(f.owner)) factsOf.set(f.owner, []); factsOf.get(f.owner).push(f); }
  for (const skill of course.skills || []) {
    const mineKept = keptOf.get(skill.id) || [];
    const paras = new Map();
    for (const { s } of mineKept) if (s.kind === 'p') { if (!paras.has(s.pi)) paras.set(s.pi, []); paras.get(s.pi).push(s.text); }
    let paragraphs = [...paras.keys()].sort((a, b) => a - b).map((k) => paras.get(k).join(' '));
    const own = added.get(skill.id) || [];
    if (own.length) paragraphs.push(own.map((f) => f.text).join(' '));
    // Keep a lesson's key points only when a kept sentence is not already saying them; a stressed one stays when the learner has room for a recap.
    const key_points = mineKept.filter(({ s }) => s.kind === 'k').map(({ s }) => s.text);
    if (!paragraphs.length && key_points.length) paragraphs = [key_points.shift()];
    // Test goal: stressed facts first, and what the material warns about, in its own words.
    const myFacts = factsOf.get(skill.id) || [];
    const traps = goal === 'test' ? myFacts.filter((f) => /\b(?:trap|mistake|never|not to be confused|common error|do not|don't|careful|avoid|beware|contraindicat)/i.test(f.text)).slice(0, 2).map((f) => `Watch out: ${f.text}`) : [];
    if (traps.length) paragraphs = [...paragraphs, ...traps];
    const stressedCount = myFacts.filter(stressedFact).length;
    const distinct = goal === 'core' ? myFacts.filter((f) => coreFacts.has(f.i)).length : myFacts.length;
    const lowBound = goal === 'core' ? 2 : 3;
    const checks = goal === 'test' ? Math.min(FULL_QUIZ + 2, Math.max(lowBound, distinct)) : Math.min(FULL_QUIZ, Math.max(lowBound, distinct));
    const focusFacts = goal === 'core' ? myFacts.filter((f) => coreFacts.has(f.i)) : myFacts;
    skills.set(skill.id, {
      paragraphs: paragraphs.length ? paragraphs : (skill.lesson && skill.lesson.paragraphs) || [],
      key_points,
      aside: [...new Set(asideOf.get(skill.id) || [])],
      added: own.length,
      checks,
      stressed: stressedCount,
      focus: focusQuestions(skill, focusFacts),
    });
  }

  // How it came out.
  const readingWords = [...skills.values()].reduce((n, s) => n + wcAll(s.paragraphs) + wcAll(s.key_points), 0);
  const asideWords = [...skills.values()].reduce((n, s) => n + wcAll(s.aside), 0);
  const sourceWords = wc(text);
  const stressedAll = facts.filter(stressedFact);
  const inReading = (f) => coveredFacts.has(f.i);
  const stats = {
    goal, lean: useLean, source_words: sourceWords, reading_words: readingWords, aside_words: asideWords, share: sourceWords ? readingWords / sourceWords : 0,
    facts: facts.length, facts_in_reading: facts.filter(inReading).length, stressed: stressedAll.length, stressed_in_reading: stressedAll.filter(inReading).length,
    skipped: skipped.length, added_from_source: [...added.values()].reduce((n, a) => n + a.length, 0), core_facts: coreFacts.size,
    checks: [...skills.values()].reduce((n, s) => n + s.checks, 0),
  };
  return { skills, stats, facts };
}

/** The ids of the questions that test these facts, the ones on the heaviest facts first; at least two when there are two. */
function focusQuestions(skill, factsOfSkill) {
  const qs = (skill.questions || []).map((q) => ({ q, terms: K.termSet([q.prompt, q.answer, (q.choices || [])[q.answer_index], q.quote].filter(Boolean).join(' ')) }));
  const ordered = factsOfSkill.slice().sort((a, b) => b.weight - a.weight);
  const out = [];
  for (const f of ordered) {
    let best = null; let v = 0.25;
    for (const x of qs) { if (out.includes(x.q.id)) continue; const o = overlap(f.terms, x.terms); if (o > v) { best = x; v = o; } }
    if (best) out.push(best.q.id);
  }
  for (const x of qs) { if (out.length >= 2) break; if (!out.includes(x.q.id)) out.push(x.q.id); }
  return out;
}

/**
 * The same choice for short text that has no lesson around it (notes bullets, summary lines, flashcards): which entries the goal keeps. Core keeps entries that carry a stressed fact or, when there are too few
 * of those, the most central ones up to the share; full and test keep them all, each said once. Returns { keep: boolean[], stressed: boolean[] }.
 */
function selectEntries(texts, { text, keyPoints = [], goal = 'full' }) {
  const { facts } = ledger(text, keyPoints);
  const stressedTerms = facts.filter((f) => f.weight >= STRESS_MIN).map((f) => f);
  const termsOf = texts.map((t) => K.termSet(t));
  const stressed = termsOf.map((t) => stressedTerms.some((f) => overlap(f.terms, t) >= 0.6 && hasAll(f.nums, hardOf(texts[termsOf.indexOf(t)]))));
  const seen = [];
  const dup = termsOf.map((t, i) => { const d = t.size > 0 && seen.some((o) => overlap(t, o) >= 0.95); if (!d) seen.push(t); return d && i >= 0; });
  if (goal !== 'core') return { keep: dup.map((d) => !d), stressed };
  const keep = stressed.map((s, i) => s && !dup[i]);
  const want = Math.max(1, Math.ceil(texts.length * CORE_SHARE));
  const doc = new Map(); for (const f of facts) for (const t of f.terms) doc.set(t, (doc.get(t) || 0) + 1);
  const score = (t) => { let v = 0; for (const x of t) v += Math.min(4, doc.get(x) || 0); return v / Math.max(1, t.size); };
  const rest = termsOf.map((t, i) => ({ i, v: score(t) })).filter((x) => !keep[x.i] && !dup[x.i]).sort((a, b) => b.v - a.v);
  for (const x of rest) { if (keep.filter(Boolean).length >= want) break; keep[x.i] = true; }
  return { keep, stressed };
}

/** Minutes, ESTIMATED (230 words a minute, as in section 6 of the upload doc; 35 s a question, as in docs/FASTER-BY-GOAL.md). Not a measurement of anyone. */
function estimateMinutes(stats, practicePerSkill = 1, skills = 1) {
  const read = (stats.reading_words || 0) / 230;
  const questions = (stats.checks || 0) + practicePerSkill * skills;
  return { read: Math.round(read * 10) / 10, questions, check: Math.round((questions * 35) / 6) / 10, total: Math.round((read + (questions * 35) / 60) * 10) / 10 };
}

module.exports = { enabled, STRESS_MIN, CORE_SHARE, sourceSentences, ledger, optimize, selectEntries, estimateMinutes, lessonSentences, leanFor };
