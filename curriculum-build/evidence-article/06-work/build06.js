// Section 06 step 7: assemble the section from the checked data and merge it into the article.
//   node build06.js <article.md>            writes the merged article in place and section06.md beside this file
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
if (!ART) throw new Error('usage: node build06.js <article.md>');
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
      const bothOk = ch.qwen && ch.mistral && ch.qwen.rating === 'supported' && ch.mistral.rating === 'supported';
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
  out.push('## <a id="section-06"></a>Section 06. The tutor on every page');
  out.push('');
  out.push('This section covers the tutor that sits on every page of the app (the "dock"): when it is available, how it decides what it may say on each kind of page, what it knows about the learner and the page, how it replies, talk mode, memory, and how it resists instructions hidden in page text. It was written on 29 October 2026 with the same method as sections 01 to 05 (see "How the sources were checked"), with two additions: two independent checkers rated every claim, and every claim either questioned went to a final reviewer whose rewrites were checked again.');
  out.push('');
  out.push('Honest limits, up front:');
  out.push('- **No trial of this tutor exists.** The trials below test other AI tutors. What they show transfers only as far as the designs match (06-M13, 06-P3).');
  out.push('- **The exact numbers are design choices.** No study sets a 3,600-character context budget, a 900-character memory, or "two to four sentences". They are marked design choice.');
  out.push('- **Most AI-tutor evidence is recent and short.** Several sources are from 2025 and 2026; long-term effects are unknown.');
  out.push('- **A paraphrase is printed only where two checks confirmed it.** For the other sources the section shows their own words only (see the rules at the top of this section\'s build script, `curriculum-build/evidence-article/06-work/build06.js`).');
  out.push('');
  const verdicts = mechs.map((m) => meta[m.id].verdict);
  for (const v of verdicts) V[v] = (V[v] || 0) + 1;
  const distinct = new Set([...Object.values(perMech).flat().map((p) => p.ref.n)]);
  const changed = mechs.filter((m) => /29 October 2026/.test(meta[m.id].status)).length;
  const vtxt = ['strong', 'moderate', 'mixed', 'design choice'].filter((k) => V[k]).map((k) => `${V[k]} ${k}`).join(', ');
  out.push(`**In numbers:** ${mechs.length} mechanisms; ${mechs.filter((m) => perMech[m.id].length >= 3).length} with 3 or more quoted sources; ${vtxt}; ${distinct.size} distinct sources cited; ${changed} mechanisms built or changed on 29 October 2026.`);
  out.push('');
  out.push('### 06 at a glance');
  out.push('');
  out.push('| Mechanism | Verdict | Quoted sources | Status |');
  out.push('|---|---|---|---|');
  for (const m of mechs) out.push(`| [${m.id}](#${m.id}) ${meta[m.id].name} | ${meta[m.id].verdict} | ${perMech[m.id].length} | ${lowerFirst(meta[m.id].status.replace(/\.$/, '')).replace(/^existing.*/, 'existing')} |`);
  out.push('');
  out.push('### 06-A. The tutor\'s rules');
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
  out.push('Status after 29 October 2026: gap 2 (answers on practice pages) was closed that day.');
  out.push('');
  out.push('1. The tutor never offers help; learners who need it often do not ask (06-M2). Open: 06-P1.');
  out.push('2. Full mode could give answers on practice pages (06-M4). Closed on 29 October 2026: 06-P2.');
  out.push('3. No trial of this tutor (06-M13). Open: 06-P3.');
  out.push('4. The injection defence relies on a prompt rule plus the structural rule that no answer key reaches the model; the prompt rule alone would be unreliable (06-M12). No change needed while the answer key stays out of the prompt.');
  out.push('');
  out.push('### 06 proposals (each backed by 3 or more sources; status on each)');
  out.push('');
  const P = [
    ['06-P1', 'Offer help after repeated errors. PROPOSED.', 'After two wrong answers in a row on the same skill, the dock shows one dismissible line ("Want a hint?") without opening; never on sealed or method-only pages; at most once per item.', ['aleven2003', 'almeda2017', 'cukurova2022', 'maniktala2020']],
    ['06-P2', 'Hints, not answers, in full mode. BUILT on 29 October 2026 (no flag; the rule is in the prompt).', 'A five-rung hint ladder in full mode; the answer is never stated for a question being worked on; a proposed answer gets "why?" first. Measured on a test copy: 7 of 7 "just tell me" probes kept to hints.', ['bastani2025', 'koedinger2007', 'chi2014', 'shih2010']],
    ['06-P3', 'A small trial of this tutor. PROPOSED.', 'Testers randomly get the dock on or off for two weeks of practice on the same subject; compare a delayed test without the tutor (the outcome Bastani 2025 used), not practice scores.', ['kestin2025', 'bastani2025', 'wu2026', 'che2026']],
  ];
  for (const [id, title, body, src] of P) {
    out.push(`<a id="${id}"></a>**${id}. ${title}** ${body}`);
    out.push(`- Sources: ${resolve(src.map((s) => `@${s}`).join('; '))}.`);
    out.push('');
  }
  out.push('### What was not done');
  out.push('');
  out.push(`- ${dropped.length} picked sources were left out because their DOI did not resolve on Crossref or they had none: ${dropped.map((d) => d.replace(/:.*/, '')).join('; ')}.`);
  out.push('- The tutor was measured on a test copy with one cloned learner and seven fixed prompts, not with real learners. Response times depend on the free model tiers being free of other load.');
  out.push('- One questioned claim (a prompt-injection paper) could not be sent to the final reviewer, whose provider blocked its text; it is shown by its quote only.');
  out.push('');
  const section = out.join('\n');
  fs.writeFileSync(path.join(D, 'section06.md'), section);

  // ---- merge ----
  const anchor = '## <a id="open-items"></a>Open items';
  if (!md.includes(anchor) || md.includes('<a id="section-06">')) throw new Error('anchor missing or section 06 already merged');
  md = md.replace(anchor, `${section}\n${anchor}`);
  md = md.replace('- [Section 05. Engagement, UX and wellbeing](#section-05)\n', '- [Section 05. Engagement, UX and wellbeing](#section-05)\n- [Section 06. The tutor on every page](#section-06)\n');
  // reused references: add "06" to "Cited in"
  for (const r of refOf.values()) {
    if (r.isNew) continue;
    md = md.replace(new RegExp(`^(${r.n}\\. <a id="ref-${r.n}"></a>.*Cited in: )([^\\n]*?)\\.?$`, 'm'), (all, a, b) => (/\b06\b/.test(b) ? all : `${a}${b}, 06.`));
  }
  // new references after the last one
  const refLines = newRefs.map((r) => `${r.n}. <a id="ref-${r.n}"></a>${authorList(r.c.authors)} (${r.c.year}). ${r.c.title}. *${r.c.venue || r.c.type}*. https://doi.org/${r.doi}. **Verified:** DOI + quote. Ids: ${r.id}. Cited in: 06.`);
  const lastLine = new RegExp(`^${lastRef}\\. <a id="ref-${lastRef}"></a>.*$`, 'm');
  md = md.replace(lastLine, (l) => `${l}\n${refLines.join('\n')}`);
  fs.writeFileSync(ART, md);
  console.log(`section 06: ${mechs.length} mechanisms, ${distinct.size} distinct sources (${newRefs.length} new, numbered ${lastRef + 1}-${lastRef + newRefs.length}), ${[...refOf.values()].filter((r) => !r.isNew).length} reused; verdicts ${JSON.stringify(V)}; ${dropped.length} dropped`);
  console.log(`paraphrases printed: ${Object.values(perMech).flat().filter((p) => p.claim).length} of ${Object.values(perMech).flat().length}`);
  for (const d of dropped) console.log('  dropped', d);
})();
