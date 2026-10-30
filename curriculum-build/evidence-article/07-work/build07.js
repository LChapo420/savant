// Section 07 step 7: assemble the section from the checked data and merge it into the article.
//   node build07.js <article.md>            writes the merged article in place and section07.md beside this file
// Rules (as in sections 01-05):
// - a source is used only if its DOI resolved on Crossref; title, first author and year come from Crossref;
// - every quote was matched verbatim against the abstract when it was picked (select.js);
// - a paraphrase of what a source shows is printed only if both checkers rated it "supported", or the final
//   reviewer rewrote it and an independent re-check rated the rewrite "supported"; otherwise the source is shown
//   by its own words (the verbatim quote) and population only;
// - a source already in the article keeps its number; new sources are numbered after the last one.
const fs = require('fs');
const path = require('path');
const ART = process.argv[2];
if (!ART) throw new Error('usage: node build07.js <article.md>');
const D = __dirname;
const picks = require('./picks.json');
const checks = require('./checks.json');
const reviews = require('./reviews.json');
const meta = require('./section-meta.json');
const mechs = require('./mechanisms.json');
const CACHE = path.join(D, 'crossref-cache.json');
const cache = fs.existsSync(CACHE) ? require(CACHE) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function crossref(doi) {
  if (cache[doi]) return cache[doi];
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { 'user-agent': 'savant-evidence-check/1.0 (mailto:savant@example.com)' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) { const m = (await r.json()).message; cache[doi] = { title: String((m.title || [''])[0]).replace(/<[^>]+>/g, ''), authors: (m.author || []).map((x) => ({ family: x.family || x.name || '', given: x.given || '' })), year: ((m['published-print'] || m.issued || {})['date-parts'] || [[null]])[0][0], venue: (m['container-title'] || [''])[0], type: m.type }; fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1)); return cache[doi]; }
    } catch { /* retry */ }
    await sleep(1500);
  }
  return null;
}
const ascii = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase();
const initials = (g) => String(g).split(/[\s.-]+/).filter(Boolean).map((p) => p[0].toUpperCase()).join('');
const authorList = (a) => { const names = a.slice(0, 6).map((x) => `${x.family} ${initials(x.given)}`.trim()); return a.length > 6 ? `${names.join(', ')}, et al.` : names.join(', '); };
// "High school students" -> "high school students"; acronyms ("ICAP", "LLM") are left alone.
const lowerFirst = (t) => (/^(A |[A-Z][a-z])/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const sentence = (s) => { const t = String(s).trim(); return /[.!?]$/.test(t) ? t : `${t}.`; };

(async () => {
  let md = fs.readFileSync(ART, 'utf8').replace(/\r\n/g, '\n');
  // existing references: doi -> { n, id }
  const existing = new Map();
  const usedIds = new Set();
  let lastRef = 0;
  for (const line of md.split('\n')) {
    const m = line.match(/^(\d+)\. <a id="ref-\d+"><\/a>.*?Ids: ([^.]+)\./);
    if (!m) continue;
    const n = Number(m[1]);
    lastRef = Math.max(lastRef, n);
    m[2].split(',').map((s) => s.trim()).forEach((x) => usedIds.add(x));
    const doi = (line.match(/https:\/\/doi\.org\/(\S+?)\.?(?:\s|$)/) || [])[1];
    if (doi) existing.set(doi.toLowerCase().replace(/\.$/, ''), { n, id: m[2].split(',')[0].trim() });
  }
  const newRefs = [];
  const refOf = new Map(); // doi -> { n, id, isNew }
  const dropped = [];
  const perMech = {};
  for (const m of mechs) {
    const list = [];
    for (const p of (picks[m.id] || {}).picks || []) {
      const cr = p.crossref || {};
      const iss = (cr.issues || []).join('; ');
      if (!p.doi || /not found|no DOI/i.test(iss)) { dropped.push(`${m.id} ${p.first_author} ${p.year}: ${iss || 'no DOI'}`); continue; }
      const doi = p.doi.toLowerCase();
      if (!refOf.has(doi)) {
        const c = await crossref(doi);
        if (!c) { dropped.push(`${m.id} ${p.first_author} ${p.year}: Crossref did not answer`); continue; }
        const ex = existing.get(doi);
        if (ex) refOf.set(doi, { ...ex, isNew: false, c });
        else {
          let id = `${ascii((c.authors[0] || {}).family || p.first_author || 'anon')}${c.year || p.year}`;
          if (usedIds.has(id)) { let k = 98; while (usedIds.has(id + String.fromCharCode(k))) k++; id += String.fromCharCode(k); }
          usedIds.add(id);
          const n = lastRef + newRefs.length + 1;
          const ref = { n, id, isNew: true, c, doi };
          newRefs.push(ref);
          refOf.set(doi, ref);
        }
      }
      const ref = refOf.get(doi);
      const ch = checks[p.cid] || {};
      const rv = reviews[p.cid];
      const bothOk = ch.minimax && ch.mistral && ch.minimax.rating === 'supported' && ch.mistral.rating === 'supported';
      const rewriteOk = rv && rv.decision === 'rewrite' && rv.recheck && rv.recheck.rating === 'supported';
      const claim = bothOk ? p.claim : rewriteOk ? rv.claim : null;
      list.push({ ...p, ref, claim, stance: p.stance });
    }
    if (list.length < 3) throw new Error(`${m.id} has only ${list.length} usable sources`);
    perMech[m.id] = list;
  }

  // ---- the section ----
  const cite = (p) => `${p.ref.id} [${p.ref.n}]`;
  const resolve = (text) => text.replace(/@([a-z]+\d{4}[a-z]?)/g, (all, id) => {
    for (const r of refOf.values()) if (r.id === id) return `${r.id} [${r.n}]`;
    throw new Error(`unresolved citation ${all}`);
  });
  const V = {};
  const out = [];
  out.push('## <a id="section-07"></a>Section 07. Learning from your own material');
  out.push('');
  out.push('This section covers turning a learner\'s own upload (notes, a syllabus, a textbook, a document) into a course: the skill outline, the prerequisite order, placement that skips what they know, difficulty tiers, the mastery bar, remediation, retrieval, interleaving, spaced review, generated questions tied to quotes, the checks on every item, and privacy. It was written on 30 October 2026 with the same method as section 06. The feature is built on branch `own-material-paths` and was proven on six test uploads (docs/OWN-MATERIAL-PROOF.md on that branch); it is not yet live.');
  out.push('');
  out.push('Honest limits, up front:');
  out.push('- **No study tests a course built from a learner\'s own upload.** The sources test the parts (retrieval, spacing, mastery, adaptive placement, question generation), not this combination. 07-P3 proposes the first test.');
  out.push('- **The exact numbers are design choices:** the 75% mastery bar, the tier steps and the skip threshold. No study sets them for this setting.');
  out.push('- **Language-model evidence is recent.** The question-generation and judging sources are mostly from 2023 to 2026, and several are from medicine or general NLP, not school learning.');
  out.push('- **A paraphrase is printed only where two checks confirmed it.** For the other sources the section shows their own words only (see the rules at the top of this section\'s build script, `curriculum-build/evidence-article/07-work/build07.js`).');
  out.push('');
  const verdicts = mechs.map((m) => meta[m.id].verdict);
  for (const v of verdicts) V[v] = (V[v] || 0) + 1;
  const distinct = new Set([...Object.values(perMech).flat().map((p) => p.ref.n)]);
  const changed = mechs.filter((m) => /29-30 October 2026/.test(meta[m.id].status)).length;
  const vtxt = ['strong', 'moderate', 'mixed', 'design choice'].filter((k) => V[k]).map((k) => `${V[k]} ${k}`).join(', ');
  out.push(`**In numbers:** ${mechs.length} mechanisms; ${mechs.filter((m) => perMech[m.id].length >= 3).length} with 3 or more quoted sources; ${vtxt}; ${distinct.size} distinct sources cited; ${changed} mechanisms built on 29-30 October 2026 (not yet live).`);
  out.push('');
  out.push('### 07 at a glance');
  out.push('');
  out.push('| Mechanism | Verdict | Quoted sources | Status |');
  out.push('|---|---|---|---|');
  for (const m of mechs) out.push(`| [${m.id}](#${m.id}) ${meta[m.id].name} | ${meta[m.id].verdict} | ${perMech[m.id].length} | ${lowerFirst(meta[m.id].status.replace(/\.$/, '')).replace(/^existing.*/, 'existing')} |`);
  out.push('');
  out.push('### 07-A. From an upload to a learning path');
  out.push('');
  for (const m of mechs) {
    const x = meta[m.id];
    const L = perMech[m.id];
    out.push(`#### <a id="${m.id}"></a>${m.id}. ${x.name}`);
    out.push('');
    out.push(`- **Where:** ${x.where}`);
    out.push(`- **Evidence:** ${L.map((p) => (p.claim ? `${cite(p)} (${lowerFirst(sentence(p.claim).replace(/\.$/, ''))})` : cite(p))).join('; ')}.`);
    for (const p of L) out.push(`  - ${cite(p)}: "${p.quote}" (${String(p.population).replace(/\.$/, '')}${p.stance === 'against' ? '; cuts against the design' : p.stance === 'mixed' ? '; mixed' : ''})`);
    out.push(`- **Verdict:** **${x.verdict}**. ${resolve(x.note.replace(/\(([^()]*\d{4}[^()]*)\)/g, (all) => all))}`);
    out.push(`- **Status:** ${x.status}`);
    out.push('');
  }
  out.push('### Code-versus-evidence gaps found');
  out.push('');
  out.push('Status on 30 October 2026: gap 1 is queued as backlog item S2c on branch `studley-parity`.');
  out.push('');
  out.push('1. A part of the upload whose outline fails every try is left out of the course without telling the learner (07-M1). Open: 07-P1.');
  out.push('2. The 75% mastery bar is fixed, while the right criterion depends on the data and the course (07-M5). Open: 07-P2.');
  out.push('3. No study of courses built from learners\' own uploads (all mechanisms). Open: 07-P3.');
  out.push('');
  out.push('### 07 proposals (each backed by 3 or more sources; status on each)');
  out.push('');
  const P = [
    ['07-P1', 'Never drop part of an upload silently. QUEUED (backlog S2c).', 'Record which parts of the source were not turned into skills, retry them, and if they still fail, show the learner which pages could not be read, with a retry button; count them in the course\'s coverage.', ['nesbit2006', 'pinandito2021', 'kurdi2020']],
    ['07-P2', 'Set the mastery bar from data. PROPOSED.', 'Keep 75% as the default, but log, per course, how later review and test results differ between learners who passed at different scores, and raise or lower the bar where the data says so.', ['kulik1990', 'slavin1990', 'pelanek2018']],
    ['07-P3', 'A first test with real learners. PROPOSED.', 'Learners who upload the same material get either the learning path or a one-time study pack, at random; compare a delayed test a week later, not practice scores.', ['adesope2017', 'lindsey2014', 'kulik1990']],
  ];
  for (const [id, title, body, src] of P) {
    out.push(`<a id="${id}"></a>**${id}. ${title}** ${body}`);
    out.push(`- Sources: ${resolve(src.map((s) => `@${s}`).join('; '))}.`);
    out.push('');
  }
  out.push('### What was not done');
  out.push('');
  out.push(`- ${dropped.length} picked sources were left out because their DOI did not resolve on Crossref or they had none: ${dropped.map((d) => d.replace(/:.*/, '')).join('; ')}.`);
  out.push('- The feature was proven on six test uploads with simulated learners, not with real learners (docs/OWN-MATERIAL-PROOF.md on branch `own-material-paths`). It is not yet live.');
  out.push('- One questioned claim (a prompt-injection paper) could not be sent to the final reviewer, whose provider blocked its text; it is shown by its quote only.');
  out.push('');
  const section = out.join('\n');
  fs.writeFileSync(path.join(D, 'section07.md'), section);

  // ---- merge ----
  const anchor = '## <a id="open-items"></a>Open items';
  if (!md.includes(anchor) || md.includes('<a id="section-07">')) throw new Error('anchor missing or section 07 already merged');
  md = md.replace(anchor, `${section}\n${anchor}`);
  md = md.replace('- [Section 06. The tutor on every page](#section-06)\n', '- [Section 06. The tutor on every page](#section-06)\n- [Section 07. Learning from your own material](#section-07)\n');
  // reused references: add "07" to "Cited in"
  for (const r of refOf.values()) {
    if (r.isNew) continue;
    md = md.replace(new RegExp(`^(${r.n}\\. <a id="ref-${r.n}"></a>.*Cited in: )([^\\n]*?)\\.?$`, 'm'), (all, a, b) => (/\b07\b/.test(b) ? all : `${a}${b}, 07.`));
  }
  // new references after the last one
  const refLines = newRefs.map((r) => `${r.n}. <a id="ref-${r.n}"></a>${authorList(r.c.authors)} (${r.c.year}). ${r.c.title}. *${r.c.venue || r.c.type}*. https://doi.org/${r.doi}. **Verified:** DOI + quote. Ids: ${r.id}. Cited in: 07.`);
  const lastLine = new RegExp(`^${lastRef}\\. <a id="ref-${lastRef}"></a>.*$`, 'm');
  md = md.replace(lastLine, (l) => `${l}\n${refLines.join('\n')}`);
  fs.writeFileSync(ART, md);
  console.log(`section 07: ${mechs.length} mechanisms, ${distinct.size} distinct sources (${newRefs.length} new, numbered ${lastRef + 1}-${lastRef + newRefs.length}), ${[...refOf.values()].filter((r) => !r.isNew).length} reused; verdicts ${JSON.stringify(V)}; ${dropped.length} dropped`);
  console.log(`paraphrases printed: ${Object.values(perMech).flat().filter((p) => p.claim).length} of ${Object.values(perMech).flat().length}`);
  for (const d of dropped) console.log('  dropped', d);
})();
