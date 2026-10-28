/**
 * Writes the night audit's results into curriculum-build/CONTENT-FACT-AUDIT.md, between
 * the markers below (replaced on every run, so the section stays current). No model calls.
 *   node curriculum-build/staged/night-runner/audit-section.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const MD = path.join(ROOT, 'curriculum-build', 'CONTENT-FACT-AUDIT.md');
const DIR = path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'night-audit');
const START = '<!-- night-2026-10-24: start (written by staged/night-runner/audit-section.js) -->';
const END = '<!-- night-2026-10-24: end -->';

function build() {
  const results = new Map();
  const file = path.join(DIR, 'results.jsonl');
  if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) { try { const r = JSON.parse(l); results.set(r.uid, r); } catch { /* */ } }
  const all = [...results.values()].map(require('./corroborate').corroborate);
  const qs = all.filter((r) => r.kind !== 'prose');
  const prose = all.filter((r) => r.kind === 'prose');
  const count = (re) => qs.filter((r) => re.test(r.outcome)).length;
  let fixes = { fixes: [] };
  try { fixes = JSON.parse(fs.readFileSync(path.join(DIR, 'fixes-night.json'), 'utf8')); } catch { /* */ }
  const confirmed = qs.filter((r) => /^confirmed wrong/.test(r.outcome));
  const owner = qs.filter((r) => /no source settles it/.test(r.outcome));
  const flagged = qs.filter((r) => r.flagged);
  const flaggedWrong = flagged.filter((r) => /^confirmed wrong|no source settles it/.test(r.outcome));
  const byColl = {};
  for (const r of confirmed) for (const o of r.occ) byColl[o.coll] = (byColl[o.coll] || 0) + 1;
  const lines = [
    START,
    '',
    `## 8. Night completion run (2026-10-24, updated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
    '',
    'Finishes section 7. Every question answered blind by MiniMax M3.1 Flash; where it disagreed with the key (or reported a problem), and for every question the explanation-key heuristic flagged, a judge from another family (NVIDIA Nemotron Ultra, UnoRouter Gemini 3.6 Flash or Nemotron Ultra `:free`) reviewed it with the key and explanation. A "wrong" both judges agree on is then source-checked: by computation (`services/math-claims.js`) where it applies, else an offline Wikipedia or Wiktionary passage whose quoted sentence must appear in the passage. Learner names were redacted before any text was sent. Nothing was applied.',
    '',
    `- **Questions judged:** ${qs.length} of 3,821 (3,819 never judged + 2 flagged ones judged before; 5 board/keyboard items are left to the code checkers).`,
    `  - MiniMax blind agrees with the key: ${count(/^ok \(MiniMax blind agrees/)}.`,
    `  - Both judges accept the key (flagged or MiniMax disagreed): ${count(/^ok \(flagged/) + count(/^split: MiniMax disagreed/)} (of which MiniMax false alarms: ${count(/^split: MiniMax disagreed/)}).`,
    `  - MiniMax accepted the key, judge B calls it wrong: ${count(/^split: MiniMax accepted/)} (not counted as errors).`,
    `  - **Both judges call it wrong: ${confirmed.length + owner.length}.** With a source: **${confirmed.length}** (staged as fixes). No source settles it: ${owner.length} (listed for the owner).`,
    `  - No judge B verdict yet: ${count(/^unsettled/)}.`,
    `  - Confirmed-and-sourced places by collection: ${Object.entries(byColl).map(([k, v]) => `${k} ${v}`).join(', ') || 'none yet'}.`,
    `- **The 269 heuristic flags:** ${flagged.length} judged; ${flaggedWrong.length} called wrong by both judges (${flagged.length ? Math.round((100 * flaggedWrong.length) / flagged.length) : 0}%).`,
    `- **The 5 lessons no judge read:** ${prose.length} read. ${prose.map((p) => `lessons ${p.occ.map((o) => o.row).join('/')}: ${p.outcome}`).join('; ') || ''}.`,
    `- **Staged fixes:** ${fixes.fixes.length} entries in \`staged/content-fixes/night-audit/fixes-night.json\` (same fields as \`fixes.json\`, plus \`quote\`). The unsourced ones are in \`owner-review.json\`; every verdict is in \`results.jsonl\`.`,
    '',
    '| Ref | Where | Wrong | Correct | Source |',
    '|---|---|---|---|---|',
    ...fixes.fixes.slice(0, 400).map((f) => `| ${f.ref} | ${f.collection} ${f.row_id} \`${f.path}\` | ${String(f.wrong).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 220)} | ${String(f.correct).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 220)} | ${f.source === 'computation' ? 'computation' : f.source ? `[${decodeURIComponent(String(f.source).split('/wiki/')[1] || f.source).replace(/_/g, ' ')}](${f.source})` : ''} |`),
    '',
    END,
  ];
  return lines.join('\n');
}

function write() {
  const md = fs.readFileSync(MD, 'utf8');
  const section = build();
  const a = md.indexOf(START);
  const b = md.indexOf(END);
  const next = a >= 0 && b > a ? `${md.slice(0, a)}${section}${md.slice(b + END.length)}` : `${md.replace(/\s*$/, '')}\n\n${section}\n`;
  fs.writeFileSync(MD, next);
}

if (require.main === module) write();
module.exports = { write, build };
