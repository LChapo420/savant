// Section 07 step 8: the article's totals after section 07 is merged (Summary table, subtitle, front page).
//   node totals07.js <article.md> <front.html>
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
  ['and a sixth section on the tutor on every page (29 October 2026)._', 'a sixth section on the tutor on every page (29 October 2026) and a seventh on learning from your own material (30 October 2026)._'],
  ['Section 06, on the tutor that sits on every page, was added on 29 October 2026 with the same method plus a second-checker and final-review step.', 'Section 06, on the tutor that sits on every page, was added on 29 October 2026 with the same method plus a second-checker and final-review step; section 07, on turning a learner\'s own upload into a course, followed on 30 October 2026.'],
  ['| Mechanisms | **296** (01: 64, 02: 50, 03: 61, 04: 58, 05: 50, 06: 13) |', '| Mechanisms | **309** (01: 64, 02: 50, 03: 61, 04: 58, 05: 50, 06: 13, 07: 13) |'],
  ['| With 3 or more quoted, non-title-level sources | **290** of 296 |', '| With 3 or more quoted, non-title-level sources | **303** of 309 |'],
  ['| Verdict: strong | 51 |', '| Verdict: strong | 52 |'],
  ['| Verdict: moderate | 108 |', '| Verdict: moderate | 114 |'],
  ['| Verdict: mixed | 37 |', '| Verdict: mixed | 39 |'],
  ['| Verdict: design choice | 81 |', '| Verdict: design choice | 85 |'],
  ['| Distinct sources, deduplicated by DOI or URL | **652** |', '| Distinct sources, deduplicated by DOI or URL | **699** |'],
  ['| Verified by DOI and a verbatim quote | 554 |', '| Verified by DOI and a verbatim quote | 601 |'],
  ['| Distinct verified sources (DOI or official URL checked: the three rows above) | **652** |', '| Distinct verified sources (DOI or official URL checked: the three rows above) | **699** |'],
  ['| Proposals | 48: 33 built (32 on 25 October 2026, fully or in part; 06-P2 on 29 October 2026), 15 not built |', '| Proposals | 51: 33 built (32 on 25 October 2026, fully or in part; 06-P2 on 29 October 2026), 18 not built (07-P1 queued) |'],
], 'article');
fs.writeFileSync(ART, md);
let fr = fs.readFileSync(FRONT, 'utf8');
fr = fr.split('296').join('309').split('652 distinct').join('699 distinct').split('596 ').join('643 ');
fr = swap(fr, [['51 rest on strong', '52 rest on strong'], ['108 on moderate', '114 on moderate'], ['37 on mixed', '39 on mixed'], ['81 are reasoned', '85 are reasoned'], ['48 evidence', '51 evidence']], 'front');
fs.writeFileSync(FRONT, fr);
console.log('totals updated');
