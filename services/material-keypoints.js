/**
 * What an uploaded material is about and what it STRESSES: key points with an emphasis weight and a source location.
 *
 * No model, no network, no cost: this is a deterministic pass over the "rich" text a parser hands back. The rich text is
 * plain text plus a few markers (every parser emits only these):
 *
 *   # Heading, ## Subheading ...        structure (a PDF's large type, a DOCX heading style, a slide title, an <h1>)
 *   **bold**   ==highlight==            emphasis inside a line
 *   > boxed or callout line             a "key" box, a theorem or definition environment, a blockquote, an <aside>
 *   - list item
 *   [[p3]]  [[s2]]  [[c4]]  [[f name]]  where the lines below it come from (page, slide, notebook cell, file in a zip)
 *   [m:ss] spoken line                  transcripts, captions, subtitles (time)
 *
 * A key point is one sentence (or list item, or callout) and its weight runs from 1 (taught, nothing stressed it) to 5
 * (stressed by several independent signals). Signals and their score:
 *   boxed/callout 2.0 | "on the test / you need to know" 2.5 | summary or objectives section 1.5 | bold sentence 1.6 |
 *   bold term 0.9 | "important / remember / must / never" 1.0 | "I'll say that again" 1.5 | restated elsewhere 0.9 each
 *   (to 2.0) | a worked example or exercise that uses it 0.8 | definition 0.6 | formula 0.4
 * weight = min(5, 1 + 0.85 * score). The same sentence said twice (near duplicate) is ONE point with `repeats`.
 *
 * Worked examples and exercises are not key points themselves but they signal what is assessed: they lift the weight of the
 * statement they use, and they are listed in `assessed`.
 *
 * Each key point: { id, text, weight, signals[], loc: { kind, value } | null, at: offset in the plain text | null, repeats }.
 * `coverage()` is the gate the course builder uses: which key points are not taught by any of the given bundles of text.
 */

const STOP = new Set('a an the and or but if then than so of to in on at by for with from as is are was were be been being it its this that these those there here which who whom whose what when where why how not no nor do does did done have has had will would can could should may might must shall about into over under again also very just only own same such too more most other some any each both few many much all one two you your we our they them their he she his her i me my us out up down off very than'.split(' '));

const KEY_CUES = /\b(key (?:point|idea|takeaway|fact|concept|rule)|important(?:ly)?|remember|must|never|always|critical|crucial|essential|note that|keep in mind|don'?t forget|make sure|the main (?:point|idea)|above all|the trick|the rule)\b/i;
const TEST_CUES = /\b(on the (?:test|exam|quiz|final|midterm|assessment)|will be (?:tested|asked|examined)|exam question|you(?:'ll| will) (?:be asked|need to know|be tested)|you need to (?:know|memori[sz]e|understand)|be sure to (?:know|learn)|memori[sz]e|know this (?:cold|well|by heart)|this is (?:tested|assessed))\b/i;
const SAY_AGAIN = /\b(i(?:'ll| will) say (?:that|it|this) again|let me repeat|once more|say it again|as i said|i can'?t stress|i want to stress|i keep saying|pay attention to this)\b/i;
const DEFINITION = /^[A-Za-z][^.:;?!]{1,60}?\b(?:is|are|means|refers to|is defined as|is called|are called|is known as)\b\s+\S/;
const FORMULA = /[A-Za-z)\]]\s*=\s*[-\w(\\]/;
// A box that a format cannot mark (a PDF drawing, a slide) usually carries a label: "KEY POINT: ...", "Important - ...".
const LABEL_BOX = /^(?:key (?:point|idea|takeaway|fact)s?|important|remember|definition|theorem|rule|warning|note|must know|exam tip|exam trap|teacher'?s note|teacher note|tutor'?s note|professor'?s note|note to students|common (?:mistake|error|trap))\s*[:\u2014-]\s*\S/i;
// What a teacher says about a point rather than the point: "Teacher's note: students always miss this one." It stresses the sentence it is about (usually the next one).
const TEACHER_CUE = /\b(teacher'?s note|teacher note|tutor'?s note|professor'?s note|note to students|students? (?:always|often|usually|tend to|commonly|never) (?:miss|forget|confuse|get|mix)|common (?:mistake|error|trap|pitfall)|exam trap|pay (?:close )?attention|watch out for|be careful)\b/i;
const CUE_ONLY = new RegExp(`${KEY_CUES.source}|${TEST_CUES.source}|${SAY_AGAIN.source}|${TEACHER_CUE.source}`, 'i');
// Words that carry no subject of their own: a cue sentence made only of these ("This will be on the exam, so write it down.") is about the sentence before it.
const GENERIC = new Set('idea point thing things today write down part remember important exam test quiz know need sure make again say repeat stress attention pay everything come comes question questions set problem problems time sets single most one every this that these those'.split(' '));
const DEICTIC_CUE = /^(?:(?:and|so|now|but|okay|ok)[ ,]+)?(?:(?:remember|note|keep in mind|don'?t forget|make sure you (?:know|remember|understand)|you need to (?:know|remember))\s+(?:that|this|these|those|it)\b|(?:this|that|these|those|it)\b)/i;
function anaphoric(text) {
  const stripped = [TEACHER_CUE, KEY_CUES, TEST_CUES, SAY_AGAIN].reduce((t, re) => t.replace(new RegExp(re.source, 'gi'), ' '), text);
  const own = terms(stripped).filter((t) => !GENERIC.has(t)).length;
  return own <= 1 || (own <= 2 && DEICTIC_CUE.test(text.trim()));
}

const SECTION_KINDS = [
  ['summary', /\b(summary|recap|key takeaways?|takeaways?|in short|to sum up|conclusion|review points?|remember this|cheat sheet|key points?|key terms?)\b/i],
  ['objectives', /\b(objectives?|learning goals?|you will (?:learn|be able)|outcomes?|aims?|by the end of|goals)\b/i],
  ['example', /\b(worked examples?|examples?|exercises?|problems?|practice|questions?|quiz|activity|try it|check your understanding)\b/i],
];

const MAX_UNIT_WORDS = 70;
const MIN_UNIT_WORDS = 4;
const THRESHOLD = 0.55;

/** Content words of a text, lightly stemmed; the same function judges extraction, coverage and repetition. */
function terms(text) {
  const out = [];
  for (const raw of String(text || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []) {
    let w = raw.replace(/['’]s$/, '');
    if (w.length < 3 || STOP.has(w)) continue;
    if (w.length > 5 && /ing$/.test(w)) w = w.slice(0, -3);
    else if (w.length > 4 && /ies$/.test(w)) w = `${w.slice(0, -3)}y`;
    else if (w.length > 4 && /(?:ed|es)$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    out.push(w);
  }
  return out;
}
const termSet = (t) => new Set(terms(t));

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

const stripMarks = (s) => String(s).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/==([^=]+)==/g, '$1').replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '').replace(/\s+/g, ' ').trim();

function sectionKind(heading) {
  for (const [kind, re] of SECTION_KINDS) if (re.test(heading)) return kind;
  return null;
}

function markedFraction(raw) {
  const plain = stripMarks(raw).length || 1;
  let marked = 0;
  for (const m of String(raw).matchAll(/\*\*([^*]+)\*\*|==([^=]+)==/g)) marked += (m[1] || m[2]).length;
  return { frac: Math.min(1, marked / plain), any: marked > 0 };
}

/** Split one block into sentence units (a list item or callout line is one unit). */
function sentences(raw) {
  // A sentence may end inside its mark: "**It is so.** The next one."
  const parts = raw.split(/(?<=[.!?](?:\*\*|==)?)\s+(?=[A-Z0-9"“(\[*=])/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Walk the rich text into blocks: { kind: heading|para|callout|list, raw, level?, loc, section }. */
function parseBlocks(rich) {
  const blocks = [];
  let loc = null;
  let section = null;
  let sectionLevel = 0;
  let para = [];
  const flush = () => {
    if (para.length) { blocks.push({ kind: 'para', raw: para.join(' '), loc, section }); para = []; }
  };
  for (const line0 of String(rich || '').split('\n')) {
    const line = line0.trim();
    if (!line) { flush(); continue; }
    const mark = line.match(/^\[\[([a-z])\s*([^\]]*)\]\]$/);
    if (mark) {
      flush();
      const kinds = { p: 'page', s: 'slide', c: 'cell', f: 'file', n: 'section' };
      loc = { kind: kinds[mark[1]] || 'section', value: mark[2].trim() };
      continue;
    }
    const stamp = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/);
    if (stamp) {
      flush();
      loc = { kind: 'time', value: stamp[1] };
      if (stamp[2]) blocks.push({ kind: 'para', raw: stamp[2], loc, section, spoken: true });
      continue;
    }
    if (/^Speaker notes:\s*\S/i.test(line)) { flush(); blocks.push({ kind: 'para', raw: line.replace(/^Speaker notes:\s*/i, ''), loc, section, notes: true }); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      const text = stripMarks(h[2]);
      if (level <= sectionLevel || !section) { section = sectionKind(text); sectionLevel = level; } else if (!section) section = sectionKind(text);
      blocks.push({ kind: 'heading', raw: text, level, loc, section });
      continue;
    }
    if (/^>\s?/.test(line)) { flush(); blocks.push({ kind: 'callout', raw: line.replace(/^>\s?/, ''), loc, section }); continue; }
    if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) { flush(); blocks.push({ kind: 'list', raw: line, loc, section }); continue; }
    para.push(line);
  }
  flush();
  return blocks;
}

function locate(plain, text) {
  if (!plain) return null;
  const probe = stripMarks(text).slice(0, 60);
  let at = plain.indexOf(probe);
  if (at >= 0) return at;
  const words = probe.split(/\s+/).filter(Boolean).slice(0, 8).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length < 3) return null;
  // Markers (**bold**, ==mark==) may sit between the words in a Markdown or text file.
  const m = new RegExp(words.join('[\\s*=_]+'), 'i').exec(plain);
  at = m ? m.index : -1;
  return at >= 0 ? at : null;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** The specifics of a sentence: names (capitalised in mid-sentence) and numbers. Two sentences that share two of them say the same thing, however the rest is worded. */
function specificsOf(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/[a-z,;:]\s+([A-Z][\p{L}'-]{2,})/gu)) out.add(m[1].toLowerCase());
  for (const m of String(text).matchAll(/\b[A-Z][\p{L}'-]{2,}(?=\s+[a-z]+\s)/gu)) if (m.index > 0) out.add(m[0].toLowerCase());
  for (const m of String(text).matchAll(/(?<![\p{L}\d])\d[\d,.]*\d|(?<![\p{L}\d])\d(?![\d\p{L}])/gu)) out.add(m[0]);
  return out;
}
/** A heading written as a whole statement ("Tamsin Reef shelters the harbour") makes a point of its own; a topic label ("Types of plate boundaries") does not. */
const CLAIM_HEADING = (t) => (t.match(/\S+/g) || []).length >= 5 && !/^(?:why|how|what|when|where|who|which|the\s+(?:role|types?|causes?|history)\b)/i.test(t) && /\b[a-z]{3,}(?:s|ed)\s+(?:the|a|an|its|their|all|every|most|some|no)\b|\b(?:is|are|was|were|must|cannot|never)\b/.test(t);

/**
 * Key points and topics from rich text. opts: { plain } (the stored text, to place each point at an offset),
 * { spoken: true } to count a repeat as emphasis more strongly.
 * Returns { key_points, topics, assessed, stats }.
 */
function extract(rich0, opts = {}) {
  // Underline and highlight count like a mark, and so does a sentence written all in capitals.
  const rich = String(rich0 || '').replace(/<(u|mark)>([^<]*)<\/\1>/gi, '==$2==');
  const blocks = parseBlocks(rich);
  const units = [];
  const notesCues = [];
  const headings = [];
  let lastHeading = null;
  let afterHeading = false;
  let pendingNext = null; // a cue that points forward ("This will be on the test:", "Teacher's note: students always miss this one.") stresses the next sentence
  for (const b of blocks) {
    if (b.kind === 'heading') {
      lastHeading = { title: b.raw, level: b.level, loc: b.loc }; headings.push({ ...lastHeading, section: b.section, first: units.length }); afterHeading = true;
      if (b.level >= 2 && CLAIM_HEADING(b.raw)) units.push({ notes: false, raw: b.raw, text: b.raw, words: (b.raw.match(/\S+/g) || []).length, kind: 'list', labelled: false, loc: b.loc, section: b.section, heading: b.raw, topic: false, terms: termSet(b.raw), signals: { claim_heading: 1.2 }, spoken: false });
      continue;
    }
    const list = b.kind === 'para' ? sentences(b.raw) : [b.raw];
    list.forEach((raw, i) => {
      const plainText = stripMarks(raw).replace(/^(?:KEY (?:POINT|IDEA|TAKEAWAY|FACT)S?|IMPORTANT|NOTE|REMEMBER|DEFINITION|THEOREM|WARNING|TIP|RULE|MUST KNOW|EXAM TIP)\s*[:.\u2014-]\s*/i, '');
      const n = (plainText.match(/\S+/g) || []).length;
      const prev = units[units.length - 1];
      // Speaker notes: a cue there ("this will be on the exam") stresses the slide's strongest point, whichever it is.
      if (b.notes && CUE_ONLY.test(plainText)) { notesCues.push({ loc: b.loc, text: plainText }); return; }
      // A short cue on its own ("Remember this.", "That will be on the exam.") stresses the sentence before it.
      if (n < MIN_UNIT_WORDS || (n <= 18 && CUE_ONLY.test(plainText) && anaphoric(plainText))) {
        const forward = CUE_ONLY.test(plainText) && (/:\s*$/.test(plainText) || TEACHER_CUE.test(plainText) || /\b(?:the next|next one|following|coming up)\b/i.test(plainText));
        if (forward) { pendingNext = { test: TEST_CUES.test(plainText), teacher: TEACHER_CUE.test(plainText), key: KEY_CUES.test(plainText) }; return; }
        if (prev && !prev.notes && CUE_ONLY.test(plainText)) {
          if (TEACHER_CUE.test(plainText)) prev.signals.teacher = 2.0;
          if (TEST_CUES.test(plainText)) prev.signals.test_cue = 2.5;
          if (KEY_CUES.test(plainText)) prev.signals.key_cue = Math.max(prev.signals.key_cue || 0, 1.0);
          if (SAY_AGAIN.test(plainText)) prev.signals.say_again = 1.5;
        }
        return;
      }
      units.push({ notes: !!b.notes, raw, text: plainText, words: n, kind: b.kind, labelled: LABEL_BOX.test(stripMarks(raw)), loc: b.loc, section: b.section, heading: lastHeading && lastHeading.title, topic: afterHeading && i === 0 && b.kind === 'para', terms: termSet(plainText), signals: {}, spoken: !!b.spoken || !!opts.spoken });
      if (pendingNext) { const nu = units[units.length - 1]; if (pendingNext.test) nu.signals.test_cue = 2.5; if (pendingNext.teacher) nu.signals.teacher = 2.0; if (pendingNext.key) nu.signals.key_cue = 1.0; pendingNext = null; }
    });
    afterHeading = false;
  }

  // Per-unit signals.
  for (const u of units) {
    const s = u.signals;
    const m = markedFraction(u.raw);
    if (u.kind === 'callout' || u.labelled) s.callout = 2.0;
    if (u.topic && u.section !== 'example') s.topic_sentence = 0.6;
    const letters = u.text.replace(/[^\p{L}]/gu, '');
    const caps = u.words >= 4 && letters.length >= 12 && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length >= 0.9;
    if ((m.frac >= 0.6 || caps) && u.kind !== 'callout' && !u.labelled) s.bold_sentence = 1.6;
    else if (m.any) s.bold_term = 0.9;
    if (TEACHER_CUE.test(u.text)) s.teacher = 2.0;
    if (TEST_CUES.test(u.text)) s.test_cue = 2.5;
    if (KEY_CUES.test(u.text)) s.key_cue = 1.0;
    if (SAY_AGAIN.test(u.text)) s.say_again = 1.5;
    if (u.section === 'summary') s.summary_section = 1.5;
    if (u.section === 'objectives') s.objective = 1.5;
    if (DEFINITION.test(u.text) && u.words <= 40) s.definition = 0.6;
    if (FORMULA.test(u.text)) s.formula = 0.4;
    u.assessedItem = u.section === 'example' || /^(?:exercise|problem|question|example|q\d+|try)\b/i.test(u.text) || (u.kind !== 'callout' && /\?\s*$/.test(u.text) && u.words >= 5);
  }

  for (const c of notesCues) {
    const sum = (u) => Object.values(u.signals).reduce((a, v) => a + v, 0);
    let best = null;
    for (const u of units) if (!u.notes && u.loc && c.loc && u.loc.value === c.loc.value && u.loc.kind === c.loc.kind && (!best || sum(u) > sum(best))) best = u;
    if (!best) continue;
    // The points of this slide the note names ("the salt tax and the treaty date"); if it names none, the slide's strongest point.
    const noteTerms = termSet(c.text);
    const slide = units.filter((u) => !u.notes && u.loc && c.loc && u.loc.value === c.loc.value && u.loc.kind === c.loc.kind);
    const named = slide.filter((u) => [...u.terms].some((t) => noteTerms.has(t) && !GENERIC.has(t)));
    for (const u of named.length ? named : [best]) {
      if (TEST_CUES.test(c.text)) u.signals.test_cue = 2.5;
      if (KEY_CUES.test(c.text)) u.signals.key_cue = Math.max(u.signals.key_cue || 0, 1.0);
      if (SAY_AGAIN.test(c.text)) u.signals.say_again = 1.5;
      if (TEACHER_CUE.test(c.text)) u.signals.teacher = 2.0;
    }
  }

  // A cue sentence about something ("Make sure you can explain why boosters are needed.") stresses the nearby sentence it is about.
  const cueKeys = ['key_cue', 'test_cue', 'say_again', 'teacher'];
  units.forEach((u, i) => {
    if (!cueKeys.some((k) => u.signals[k])) return;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const v = units[j];
      if (v.notes || v.assessedItem || v.kind === 'heading' || !v.loc !== !u.loc || (v.loc && u.loc && v.loc.value !== u.loc.value)) continue;
      let shared = 0;
      for (const t of u.terms) if (v.terms.has(t)) shared++;
      if (shared >= 2) { for (const k of cueKeys) if (u.signals[k]) v.signals[k] = Math.max(v.signals[k] || 0, u.signals[k]); break; }
    }
  });

  // Restated elsewhere: near-duplicate units merge into one point with a repeat count. Compared only with units that share a rare word (Jaccard 0.55 means one of the rarest 45% of a unit's words
  // must be shared), so a long document stays fast: all pairs held the server's one thread for minutes on 850 KB of text.
  const used = new Set();
  const clusters = [];
  const postings = new Map();
  units.forEach((u, idx) => { if (u.terms.size < 3 || u.assessedItem) return; for (const t of u.terms) { if (!postings.has(t)) postings.set(t, []); postings.get(t).push(idx); } });
  units.forEach((u) => { u.specifics = specificsOf(u.text); });
  const specPost = new Map();
  units.forEach((u, idx) => { if (u.assessedItem) return; for (const x of u.specifics) { if (!specPost.has(x)) specPost.set(x, []); specPost.get(x).push(idx); } });
  for (let i = 0; i < units.length; i++) {
    if (used.has(i) || units[i].terms.size < 3 || units[i].assessedItem) continue;
    const members = [i];
    const rare = [...units[i].terms].sort((x, y) => postings.get(x).length - postings.get(y).length).slice(0, Math.floor(units[i].terms.size * 0.45) + 1);
    const cand = new Set();
    for (const t of rare) { const list = postings.get(t); if (list.length > 2500 && t !== rare[0]) continue; for (const j of list) if (j > i) cand.add(j); }
    for (const j of [...cand].sort((x, y) => x - y)) {
      if (used.has(j)) continue;
      if (jaccard(units[i].terms, units[j].terms) < 0.55) continue;
      // The same frame with different names and numbers ("Station A holds 12", "Station B holds 30") is two facts, not one said twice.
      const si = units[i].specifics; const sj = units[j].specifics;
      if (si.size && sj.size && ![...si].some((x) => sj.has(x))) continue;
      members.push(j); used.add(j);
    }
    used.add(i);
    clusters.push(members);
  }

  // Assessed: terms of exercises and worked examples.
  const assessed = units.filter((u) => u.assessedItem && u.words >= MIN_UNIT_WORDS);
  const assessedTerms = assessed.map((u) => u.terms);

  const points = [];
  for (const members of clusters) {
    const group = members.map((k) => units[k]);
    // The representative is the member with the most signal; ties go to the first.
    let rep = group[0];
    const score = (u) => Object.values(u.signals).reduce((a, b) => a + b, 0);
    for (const g of group) if (score(g) > score(rep)) rep = g;
    const signals = {};
    for (const g of group) for (const [k, v] of Object.entries(g.signals)) signals[k] = Math.max(signals[k] || 0, v);
    if (group.length > 1) signals.repeated = Math.min(2.0, 0.9 * (group.length - 1));
    // Said again in other words: other sentences that share two of its specifics (a name and a number) count as restatements.
    const repSpec = rep.specifics;
    if (repSpec.size >= 2) {
      const shared = new Map();
      for (const x of repSpec) for (const vi of specPost.get(x) || []) shared.set(vi, (shared.get(vi) || 0) + 1);
      let again = 0;
      for (const [vi, n] of shared) if (n >= 2 && !members.includes(vi)) { again++; if (again >= 3) break; }
      if (again) signals.repeated = Math.min(2.0, (signals.repeated || 0) + 0.9 * again);
    }
    if (rep.section !== 'example' && !rep.assessedItem) {
      const linked = assessedTerms.some((t, idx) => assessed[idx] !== rep && [...rep.terms].filter((x) => t.has(x)).length >= 3 && [...rep.terms].filter((x) => t.has(x)).length / Math.max(1, Math.min(rep.terms.size, t.size)) >= 0.3);
      if (linked) signals.assessed = 0.8;
    }
    const total = Object.values(signals).reduce((a, b) => a + b, 0);
    if (total < THRESHOLD || rep.assessedItem) continue;
    points.push({
      text: rep.text.length > 320 ? `${rep.text.slice(0, 317)}...` : rep.text,
      score: total, signals: Object.keys(signals).sort((a, b) => signals[b] - signals[a]),
      loc: rep.loc, repeats: group.length, order: members[0], full: rep.text,
    });
  }

  const words = units.reduce((n, u) => n + u.words, 0);
  const cap = Math.max(12, Math.min(400, Math.round(words / 30)));
  points.sort((a, b) => b.score - a.score || a.order - b.order);
  // The cap is for plain sentences only: a point with a real signal (weight 2 or more) is never cut, or a short handout that stresses many things loses some of them.
  const stressedN = points.filter((p) => 1 + 0.85 * p.score >= 2).length;
  const kept = points.slice(0, Math.max(cap, Math.min(stressedN, 1500))).sort((a, b) => a.order - b.order);
  const key_points = kept.map((p, i) => ({
    id: `k${i + 1}`, text: p.text, weight: round1(Math.min(5, 1 + 0.85 * p.score)), signals: p.signals,
    loc: p.loc, at: opts.plain ? locate(opts.plain, p.full) : null, repeats: p.repeats,
  }));

  // Topics: the headings, weighted by what is stressed beneath them.
  const topics = headings.map((h, i) => {
    const next = headings[i + 1] ? headings[i + 1].first : units.length;
    const under = key_points.filter((k) => units.slice(h.first, next).some((u) => u.text.startsWith(k.text.slice(0, 40))));
    const top = under.map((k) => k.weight).sort((a, b) => b - a).slice(0, 3);
    const share = units.slice(h.first, next).reduce((n, u) => n + u.words, 0) / Math.max(1, words);
    const stress = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 1;
    return { title: h.title, level: h.level, loc: h.loc, weight: round1(Math.min(5, stress)), share: round1(share * 100) / 100 };
  }).slice(0, 120);

  return {
    key_points, topics,
    assessed: assessed.slice(0, 40).map((u) => ({ text: u.text.slice(0, 200), loc: u.loc })),
    stats: { units: units.length, words, headings: headings.length },
  };
}

/** The same as extract() for plain text with no markers: Markdown headings and **bold** still count. */
function extractPlain(text, opts = {}) { return extract(text, { ...opts, plain: text }); }

/**
 * Which key points are not taught by any bundle. `bundles` are strings (a skill's lesson plus its questions, say); a point
 * is covered when one bundle holds at least `need` of its content words. Returns { covered, uncovered[], ratio, weighted }.
 */
function coverage(keyPoints, bundles, opts = {}) {
  const minWeight = opts.minWeight == null ? 0 : opts.minWeight;
  const need = opts.need == null ? 0.7 : opts.need;
  const sets = bundles.map((b) => termSet(b));
  const considered = (keyPoints || []).filter((k) => k.weight >= minWeight);
  const uncovered = [];
  let weightAll = 0;
  let weightCovered = 0;
  for (const k of considered) {
    const kt = termSet(k.text);
    weightAll += k.weight;
    if (!kt.size) { weightCovered += k.weight; continue; }
    const ok = sets.some((s) => {
      let n = 0;
      for (const x of kt) if (s.has(x)) n++;
      return n / kt.size >= need;
    });
    if (ok) weightCovered += k.weight; else uncovered.push(k);
  }
  const covered = considered.length - uncovered.length;
  return { total: considered.length, covered, uncovered, ratio: considered.length ? covered / considered.length : 1, weighted: weightAll ? weightCovered / weightAll : 1 };
}

/** Spearman rank correlation (ties share their mean rank). */
function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const mean = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = mean;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs); const ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n; const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

module.exports = { extract, extractPlain, coverage, spearman, terms, termSet, jaccard, stripMarks, parseBlocks, THRESHOLD };
