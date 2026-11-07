/**
 * What the material stresses reaches every surface: not only the lesson and the notes, but the flashcards and the practice questions. Measured before this (docs/UPLOADS-ANY-FORMAT.md section 17): of 12 planted
 * stressed points the notes kept 11 or 12 and the lesson 10 to 12, but the flashcards only 1 to 3 and the practice questions 4 to 7.
 *
 * No model and no cost: a stressed point no card or question carries becomes a fill-in-the-gap from the material's own sentence, so nothing can be invented. A fact the lessons lost goes back in as the material's own
 * sentence. On by default; UPLOAD_STRESS_SWEEP=off turns it off. A scripted `llm` (a unit test of something else) gets it only when it asks.
 */
const keypoints = require('./material-keypoints');

const STRESS_MIN = 2.0;
const enabled = () => String(process.env.UPLOAD_STRESS_SWEEP || '').toLowerCase() !== 'off';
const onFor = (opts = {}) => enabled() && (!opts.llm || !!opts.factcheck || !!opts.stress);

const NUMBER_WORD = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|half|twice|double)\b/i;

/** The gap of a fill-in: a number, else a name, else the longest uncommon word of the sentence's second half. { prompt, answer } or null. */
function clozeOf(sentence) {
  const s = String(sentence || '').replace(/\s+/g, ' ').trim();
  if (s.length < 15 || s.length > 300 || s.endsWith('...')) return null;
  let m = /\d[\d,.:/-]*\d|\d/.exec(s);
  if (!m) m = NUMBER_WORD.exec(s);
  // A name: capitalised words, at the start only if there are two ("Tamsin Reef"), else in mid-sentence.
  if (!m) m = /(?:^|\s)((?:[A-Z][\p{L}'-]+)(?:\s+(?:of\s+)?[A-Z][\p{L}'-]+)+)/u.exec(s);
  if (!m) { const mid = /[a-z,;:]\s+([A-Z][\p{L}'-]{2,})/u.exec(s); if (mid) m = { 0: mid[1], index: mid.index + mid[0].length - mid[1].length }; }
  if (!m) {
    const words = [...s.matchAll(/[\p{L}][\p{L}'-]{5,}/gu)].filter((w) => w.index > s.length * 0.25).sort((a, b) => b[0].length - a[0].length);
    if (!words.length) return null;
    m = words[0];
  }
  const raw = m[1] && m[0].startsWith(' ') ? m[1] : (m[1] || m[0]);
  const at = s.indexOf(raw, m.index);
  const answer = raw.trim().replace(/[.,;:]+$/, '');
  if (!answer || answer.split(/\s+/).length > 5) return null;
  return { prompt: `${s.slice(0, at)}___${s.slice(at + answer.length)}`, answer };
}

/** Does this one item carry the point: most of its words, and every number in it. */
function carries(k, text) {
  const pt = keypoints.termSet(k.text);
  const it = keypoints.termSet(text);
  let n = 0; for (const x of pt) if (it.has(x)) n++;
  if (pt.size && n / pt.size < 0.6) return false;
  const low = String(text).toLowerCase();
  if (!(String(k.text).match(/\d[\d,.]*\d|\d/g) || []).every((d) => low.includes(d))) return false;
  return (String(k.text).toLowerCase().match(new RegExp(NUMBER_WORD.source, 'gi')) || []).every((w) => low.includes(w));
}
const stressedOf = (kps) => (kps || []).filter((k) => k.weight >= STRESS_MIN && k.text && !/\.\.\.$/.test(k.text)).sort((a, b) => b.weight - a.weight).slice(0, 40);

/** The stressed points none of `items` (strings, one per card or question) carries. */
const missing = (kps, items) => stressedOf(kps).filter((k) => !items.some((t) => carries(k, t)));

const ANSWER_KEY = (k) => `Your material says: "${k.text}"`;

/**
 * Study pack: a card and a fill-in for each stressed point that has none. `passageFor(k)` gives { id } of the point's passage or null.
 * Mutates cards and test. Returns how many of each were added.
 */
function sweepPack({ cards, quiz, test, kps, passageFor }) {
  let c = 0; let t = 0;
  for (const k of missing(kps, cards.map((x) => `${x.front} ${x.back}`))) {
    const z = clozeOf(k.text); const p = passageFor(k);
    if (!z || !p) continue;
    cards.push({ front: z.prompt, back: z.answer, passage_id: p, quote: k.text, stressed: true }); c++;
  }
  for (const k of missing(kps, [...quiz, ...test].map((q) => `${q.prompt} ${q.answer || ''} ${(q.choices || []).join(' ')}`))) {
    const z = clozeOf(k.text); const p = passageFor(k);
    if (!z || !p) continue;
    test.push({ type: 'short_answer', prompt: z.prompt, answer: z.answer, explanation: ANSWER_KEY(k), passage_id: p, quote: k.text, tier: 1, stressed: true }); t++;
  }
  return { cards: c, test: t };
}

/** Learning path and practice test: a fill-in on the owning skill for each stressed point no question of the course carries. */
function sweepCourse({ skills, kps, passageFor }) {
  let added = 0;
  const all = () => skills.flatMap((s) => (s.questions || []).map((q) => `${q.prompt} ${q.answer || ''} ${q.type === 'multiple_choice' ? (q.choices || [])[q.answer_index] : ''}`));
  for (const k of missing(kps, all())) {
    const z = clozeOf(k.text); const pid = passageFor(k);
    if (!z || !pid) continue;
    const owner = skills.find((s) => s.source !== 'general' && (s.passage_ids || []).includes(pid)) || skills.find((s) => s.source !== 'general');
    if (!owner) continue;
    owner.questions = owner.questions || [];
    owner.questions.push({ id: `${owner.id}_s${owner.questions.length + 1}`, type: 'short_answer', prompt: z.prompt, answer: z.answer, explanation: ANSWER_KEY(k), passage_id: pid, quote: k.text, tier: 1, stressed: true });
    added++;
  }
  return added;
}

/**
 * What no lesson says goes back in as the material's own sentence, so no fact is lost and nothing is invented. A source sentence counts as said when the lessons hold its numbers, most of its names, most of its
 * words, and every word that is rare in the material (said in one sentence only: "northwest", "euvolemic"). A short course with many stressed points kept 1 or 2 of 8 plain facts before this.
 * Mutates the lessons. Returns the number of sentences added. `capWords` limits what is added, most specific sentences first.
 */
function sweepFacts({ skills, passages, sentencesOf, capWords, linesOf = (t) => String(t).split(/\n+/), clean = (t) => t }) {
  const lessonText = () => skills.flatMap((s) => [...(s.lesson.paragraphs || []), ...(s.lesson.key_points || [])]).join(' ');
  let have = lessonText().toLowerCase();
  const haveTerms = keypoints.termSet(have);
  const all = [];
  const df = new Map();
  for (const p of passages) {
    const owner = skills.find((s) => s.source !== 'general' && (s.passage_ids || []).includes(p.id)) || null;
    for (const line of linesOf(p.text)) for (const s of sentencesOf(line)) {
      const n = (s.match(/\S+/g) || []).length;
      if (n < 5 || n > 60 || /\?\s*$/.test(s)) continue;
      const terms = keypoints.termSet(s);
      for (const t of terms) df.set(t, (df.get(t) || 0) + 1);
      all.push({ s, n, p, owner, terms });
    }
  }
  const fallbackOwner = skills.find((s) => s.source !== 'general');
  const miss = [];
  for (const x of all) {
    if (!(x.owner || fallbackOwner)) continue;
    const nums = x.s.match(/\d[\d,.]*\d|\d/g) || [];
    const names = [...x.s.matchAll(/[a-z,;:]\s+([A-Z][\p{L}'-]{2,})/gu)].map((m) => m[1].toLowerCase());
    const numsGone = nums.filter((d) => !have.includes(d.toLowerCase())).length;
    const namesGone = names.filter((w) => !have.includes(w)).length;
    let held = 0; let rareGone = 0;
    for (const t of x.terms) { if (haveTerms.has(t)) held++; else if (df.get(t) === 1 && t.length >= 6) rareGone++; }
    const share = x.terms.size ? held / x.terms.size : 1;
    if (numsGone || namesGone > names.length / 2 || share < 0.7 || rareGone) miss.push({ ...x, score: numsGone * 3 + namesGone * 2 + rareGone + (1 - share) });
  }
  miss.sort((a, b) => b.score - a.score);
  let room = capWords; let added = 0;
  const byOwner = new Map();
  for (const m of miss) {
    if (room - m.n < 0) continue;
    const owner = m.owner || fallbackOwner;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(m);
    room -= m.n; added++;
    have += ` ${m.s.toLowerCase()}`;
  }
  for (const [owner, list] of byOwner) {
    // In the material's order, one short paragraph.
    const order = list.sort((a, b) => all.indexOf(all.find((y) => y.s === a.s)) - all.indexOf(all.find((y) => y.s === b.s))).map((m) => clean(m.s));
    owner.lesson.paragraphs = [...owner.lesson.paragraphs, order.join(' ')];
  }
  return added;
}

/** Notes: a stressed point no bullet carries becomes a bullet of its own words, under the heading of its part. Mutates sections. */
function sweepNotes({ sections, kps, passageFor }) {
  let added = 0;
  for (const k of missing(kps, sections.flatMap((s) => s.bullets.map((b) => b.text)))) {
    const pid = passageFor(k);
    if (!pid || !sections.length) continue;
    const sec = sections.find((s) => s.bullets.some((b) => b.passage_id === pid)) || sections[sections.length - 1];
    sec.bullets.push({ text: k.text, passage_id: pid, quote: k.text, stressed: true });
    added++;
  }
  return added;
}

module.exports = { sweepNotes, enabled, onFor, clozeOf, carries, missing, stressedOf, sweepPack, sweepCourse, sweepFacts };
