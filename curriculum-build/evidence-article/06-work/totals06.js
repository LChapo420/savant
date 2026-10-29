// Section 06 step 8: the article's totals after section 06 is merged (Summary table, subtitle, front page).
//   node totals06.js <article.md> <front.html>
// Each replacement must match exactly once, or nothing is written.
const fs = require('fs');
const [ART, FRONT] = process.argv.slice(2);
const swap = (text, pairs, label) => {
  for (const [a, b] of pairs) {
    const n = text.split(a).length - 1;
    if (n !== 1) throw new Error(`${label}: "${a.slice(0, 60)}" matches ${n} times`);
    text = text.replace(a, () => b);
  }
  return text;
};
let md = fs.readFileSync(ART, 'utf8');
md = swap(md, [
  ['merged from the five evidence sections (25 October 2026), with a citation and consistency audit (27 October 2026)._', 'merged from the five evidence sections (25 October 2026), with a citation and consistency audit (27 October 2026) and a sixth section on the tutor on every page (29 October 2026)._'],
  ['It merges five evidence sections written on 2026-10-25:', 'Section 06, on the tutor that sits on every page, was added on 29 October 2026 with the same method plus a second-checker and final-review step. It merges five evidence sections written on 2026-10-25:'],
  ['| Mechanisms | **283** (01: 64, 02: 50, 03: 61, 04: 58, 05: 50) |', '| Mechanisms | **296** (01: 64, 02: 50, 03: 61, 04: 58, 05: 50, 06: 13) |'],
  ['| With 3 or more quoted, non-title-level sources | **277** of 283 |', '| With 3 or more quoted, non-title-level sources | **290** of 296 |'],
  ['| Verdict: strong | 50 |', '| Verdict: strong | 51 |'],
  ['| Verdict: moderate | 104 |', '| Verdict: moderate | 108 |'],
  ['| Verdict: mixed | 33 |', '| Verdict: mixed | 37 |'],
  ['| Verdict: design choice | 77 |', '| Verdict: design choice | 81 |'],
  ['| Distinct sources, deduplicated by DOI or URL | **607** |', '| Distinct sources, deduplicated by DOI or URL | **652** |'],
  ['| Verified by DOI and a verbatim quote | 509 |', '| Verified by DOI and a verbatim quote | 554 |'],
  ['| Distinct verified sources (DOI or official URL checked: the three rows above) | **607** |', '| Distinct verified sources (DOI or official URL checked: the three rows above) | **652** |'],
  ['| Proposals | 45: 32 built on 25 October 2026 (fully or in part), 13 not built |', '| Proposals | 48: 33 built (32 on 25 October 2026, fully or in part; 06-P2 on 29 October 2026), 15 not built |'],
], 'article');
fs.writeFileSync(ART, md);
let fr = fs.readFileSync(FRONT, 'utf8');
fr = fr.split('283').join('296').split('607 distinct').join('652 distinct').split('551 ').join('596 ');
fr = swap(fr, [['50 rest on strong', '51 rest on strong'], ['104 on moderate', '108 on moderate'], ['33 on mixed', '37 on mixed'], ['77 are reasoned', '81 are reasoned'], ['45 evidence', '48 evidence'], ['32 of which were built', '33 of which were built']], 'front');
fs.writeFileSync(FRONT, fr);
console.log('totals updated');
