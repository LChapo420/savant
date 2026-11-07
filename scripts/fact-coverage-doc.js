#!/usr/bin/env node
/**
 * Writes the map table of docs/FACT-COVERAGE.md from services/fact-registry.js, between the two marker lines, so the table cannot drift from what the code does.
 * BEFORE is what main did at ab91559, read from the code on 6 Nov 2026; a new task added later has "new" there.
 *
 *   node scripts/fact-coverage-doc.js
 */
const fs = require('fs');
const path = require('path');
const registry = require('../services/fact-registry');

const NO = 'No check';
const BEFORE = {
  dock_help: `${NO}. A leak check, not a fact check`,
  assist_help: NO,
  coach_turn: `${NO}. Streamed as written, leak guard only`,
  tutor_explain: NO,
  remediation_teach: NO,
  part_layer: `${NO}. Rules only (numbers, words)`,
  part_modify: `${NO}. Rules only (numbers kept, none added)`,
  level_editor: `${NO}. Page structure and base comparison by rules`,
  choice_pair: NO,
  personalize_read: NO,
  analyze_session: NO,
  author_items: `${NO}. Shape rules only`,
  regen_items: `${NO}. Shape rules only`,
  checkpoint_fill: 'Part: blind re-solve of multiple choice only, and only with no verifier key; typed questions and explanations none',
  game_questions: 'Part: a blind judge only when explanation and key disagree by rule',
  theme: 'Yes: two blind re-solves and a judge (the story around the question: no)',
  grade_free_response: 'Part: the verdict by judges; the feedback line none',
  spanish_partner_turn: NO,
  spanish_rubric: NO,
  spanish_reaction: NO,
  spanish_write_ahead: 'Yes: review pass',
  block_fill: 'Yes: verifyLevel, not served until passed',
  fact_repair: 'Yes: read again',
  lesson_write: 'Part: maths rule, and a blind judge on flagged keys',
  lesson_write_urgent: 'Part: maths rule, and a blind judge on flagged keys',
  diagnose: NO,
  essay_prompt: NO,
  essay_grade: NO,
  material_lesson: 'Part: questions by material_verify; lesson paragraphs by rules only',
  material_shorten: `${NO}. Rules only`,
  material_follow: `${NO}. Rules only (no new number or name)`,
  material_sweep: NO,
  material_outline: NO,
  material_notes: `${NO}. A quote must exist, nothing reads whether the bullet says what the quote says`,
  material_pack: 'Part: multiple choice and fill-in by material_verify; summary, cards and written items a quote only',
  material_podcast: `${NO}. A quote must exist`,
  placement_write: `${NO} when written live (the sets on disk went through their own pipeline judges)`,
  placement_repair: NO,
  placement_recommend: NO,
};

const esc = (t) => String(t || '').replace(/\|/g, '/');
const kindWord = (e) => (e.kind === 'downstream' ? esc(e.by) : `The guard, before it is ${e.live ? 'shown' : 'stored'}: fact_live, mode ${e.mode}`);
const rows = registry.shown().map((k) => {
  const e = registry.TASKS[k];
  return `| ${esc(e.what)} | \`${k}\` | ${esc(BEFORE[k] || 'new')} | ${kindWord(e)} | ${esc(e.source)} | ${esc(e.ifHeld)} |`;
});
const table = ['| What the learner sees | Task | Before (main at ab91559) | Now, with FACT_CHECK_ALL on: checked by | Against | If it says wrong or cannot run |', '|---|---|---|---|---|---|', ...rows].join('\n');
const internal = Object.entries(registry.TASKS).filter(([, e]) => e.kind === 'internal').map(([k, e]) => `- \`${k}\`: ${e.why}`).join('\n');
const exempt = Object.entries(registry.TASKS).filter(([, e]) => e.kind === 'exempt').map(([k, e]) => `- \`${k}\`: ${e.why}`).join('\n') || `- None. ${registry.EXEMPT_NOTE}`;

const before = registry.shown().filter((k) => /^Yes/.test(BEFORE[k] || '')).length;
const part = registry.shown().filter((k) => /^Part/.test(BEFORE[k] || '')).length;
const total = registry.shown().length;
const counts = `Paths that show model text: ${total}. Before: ${before} checked, ${part} checked in part, ${total - before - part} not checked. Now, with the switch on: ${total} of ${total} pass a model check before they are shown or stored.`;

const p = path.join(__dirname, '..', 'docs', 'FACT-COVERAGE.md');
let doc = fs.readFileSync(p, 'utf8');
const swap = (name, body) => {
  const a = `<!-- ${name}:start -->`; const b = `<!-- ${name}:end -->`;
  const i = doc.indexOf(a); const j = doc.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`no ${name} markers in the doc`);
  doc = `${doc.slice(0, i + a.length)}\n${body}\n${doc.slice(j)}`;
};
swap('counts', counts); swap('map', table); swap('internal', internal); swap('exempt', exempt);
fs.writeFileSync(p, doc);
console.log(counts);
