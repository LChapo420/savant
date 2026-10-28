#!/usr/bin/env node
/**
 * Build content/objective-items/<track>.<grade>.json from the content
 * factory's KEPT objective items. Re-runnable: run it again whenever the
 * factory has kept more, and the files are rewritten from every source.
 *
 *   node scripts/build-objective-items.js            build
 *   node scripts/build-objective-items.js --dry      report only, write nothing
 *
 * Sources (read only, never written):
 *   curriculum-build/staged/adaptation/objective-items.cache.jsonl     day pilot, one row per objective
 *   curriculum-build/staged/adaptation/objective-items.*.json          day pilot outputs
 *   curriculum-build/staged/adaptation/objective-items-night/*.jsonl   night runner results
 *   curriculum-build/staged/adaptation/objective-items-night/*.json    night runner outputs
 *   OBJECTIVE_ITEM_SOURCES (extra files or folders, separated by ";")
 *
 * An item is imported only when ALL hold:
 *   - it is in a source's kept list (`items`), never its `rejected` list;
 *   - verified.code is true, and two judges are named from two different model
 *     families (the writer-vs-judge rule of the night: both judged blind);
 *   - its objective exists in the coverage model of its grade;
 *   - the app's deterministic checks pass again here (services/objective-items.js
 *     problems(): structure, 4 distinct options, key among them, no answer in
 *     the question, length cue, rationale-key agreement, math-claims for math,
 *     no picture or audio needed);
 *   - it is not a duplicate (same prompt for the same objective, or the same
 *     question and key anywhere in the grade).
 * Everything dropped is listed, with its reason, in content/objective-items/_build-report.json.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const coverage = require('../services/coverage');
const curriculum = require('../config/curriculum');
const oi = require('../services/objective-items');

const DRY = process.argv.includes('--dry');
const STAGED = path.join(ROOT, 'curriculum-build', 'staged', 'adaptation');
const OUT = oi.DIR;

function sourceFiles() {
  const files = [];
  const add = (f) => { if (fs.existsSync(f) && fs.statSync(f).isFile()) files.push(f); };
  add(path.join(STAGED, 'objective-items.cache.jsonl'));
  const pick = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f)) : []);
  pick(STAGED, /^objective-items\.[a-z0-9_]+\.[a-z0-9_]+\.json$/i).forEach(add);
  const night = path.join(STAGED, 'objective-items-night');
  pick(night, /\.jsonl$/i).forEach(add);
  pick(night, /^objective-items\.[a-z0-9_]+\.[a-z0-9_]+\.json$/i).forEach(add);
  for (const extra of String(process.env.OBJECTIVE_ITEM_SOURCES || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const p = path.resolve(ROOT, extra);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) pick(p, /\.(jsonl|json)$/i).forEach(add);
    else add(p);
  }
  return [...new Set(files)];
}

/** Every kept item a source holds: a .jsonl of per-objective rows, or a .json {items}. */
function keptItemsIn(file) {
  const out = [];
  const text = fs.readFileSync(file, 'utf8');
  const fromRow = (row) => {
    if (!row || row.error) return;
    for (const it of row.items || []) out.push(it); // `items` is the kept list; `rejected` is never read
  };
  if (/\.jsonl$/i.test(file)) {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { fromRow(JSON.parse(line)); } catch { /* a half-written last line */ }
    }
  } else {
    try { fromRow(JSON.parse(text)); } catch { /* unreadable: nothing from it */ }
  }
  return out;
}

const FAMILIES = [
  ['minimax', /minimax/], ['nemotron', /nemotron/], ['qwen', /qwen|qwq/], ['glm', /glm|z-ai|zhipu/],
  ['deepseek', /deepseek/], ['gemini', /gemini|gemma/], ['llama', /llama|meta-/], ['mistral', /mistral|mixtral|codestral/],
  ['gpt', /\bgpt|openai|o[34]-/], ['kimi', /kimi|moonshot/], ['claude', /claude|anthropic/], ['grok', /grok|x-ai/],
];
function family(model) {
  const s = String(model || '').toLowerCase();
  const hit = FAMILIES.find(([, re]) => re.test(s));
  return hit ? hit[0] : null;
}

/** Why the verification on an item is not enough to serve it, or null. */
function verificationProblem(it) {
  const v = it.verified || {};
  if (v.code !== true) return 'code checks not recorded as passed';
  const a = family(v.judge_a);
  const b = family(v.judge_b);
  if (!v.judge_a || !v.judge_b) return 'two judges not recorded';
  if (!a || !b) return `judge family unknown (${v.judge_a} / ${v.judge_b})`;
  if (a === b) return `both judges from one family (${a})`;
  return null;
}

function main() {
  const files = sourceFiles();
  const models = new Map(); // track/grade -> coverage model
  const modelFor = (t, g) => {
    const k = `${t}/${g}`;
    if (!models.has(k)) {
      let m = null;
      try { m = curriculum.getGrade(t, g) ? coverage.modelFor(t, g) : null; } catch { m = null; }
      models.set(k, m);
    }
    return models.get(k);
  };

  const byGrade = new Map(); // "t.g" -> { items: [], seenByObjective, seenKeys }
  const dropped = [];
  const counts = { read: 0, kept: 0, duplicates: 0, dropped: 0 };

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const raw of keptItemsIn(file)) {
      counts.read += 1;
      const drop = (reason) => { counts.dropped += 1; dropped.push({ source: rel, objective_id: raw && raw.objective_id, prompt: raw && String(raw.prompt || '').slice(0, 120), reason }); };
      if (!raw || !raw.objective_id || !raw.track_id || !raw.grade_id) { drop('no objective, track or grade'); continue; }
      const model = modelFor(raw.track_id, raw.grade_id);
      if (!model) { drop('grade not in the curriculum'); continue; }
      const objective = model.objectives.find((o) => o.id === raw.objective_id);
      if (!objective) { drop('objective not in the coverage model'); continue; }
      const vp = verificationProblem(raw);
      if (vp) { drop(`verification: ${vp}`); continue; }
      const key = `${raw.track_id}.${raw.grade_id}`;
      if (!byGrade.has(key)) byGrade.set(key, { track_id: raw.track_id, grade_id: raw.grade_id, items: [], seenByObjective: new Map(), seenKeys: new Set() });
      const g = byGrade.get(key);
      const item = {
        objective_id: raw.objective_id,
        track_id: raw.track_id,
        grade_id: raw.grade_id,
        // The objective's own skill (the coverage model's), so skill mastery and
        // the review's interleaving read the same skill as the objective.
        skill_id: objective.skill || raw.skill_id,
        level: objective.lesson_level || raw.level || null,
        format: 'multiple_choice',
        prompt: String(raw.prompt || '').trim(),
        choices: (raw.choices || []).map((c) => String(c).trim()),
        answer: String(raw.answer == null ? '' : raw.answer).trim(),
        rationale: String(raw.rationale || '').trim(),
        kept: true,
        verified: { ...raw.verified, source: rel },
      };
      const seen = g.seenByObjective.get(item.objective_id) || new Set();
      const itemKey = `${oi.norm(item.prompt)}||${oi.norm(item.answer)}`;
      if (seen.has(oi.norm(item.prompt)) || g.seenKeys.has(itemKey)) { counts.duplicates += 1; continue; } // the same item from two sources
      const p = oi.problems(item, { trackId: item.track_id, seen });
      if (p.length) { drop(`checks: ${p.join('; ')}`); continue; }
      seen.add(oi.norm(item.prompt));
      g.seenByObjective.set(item.objective_id, seen);
      g.seenKeys.add(itemKey);
      g.items.push({ id: oi.itemId(item), ...item });
      counts.kept += 1;
    }
  }

  const grades = {};
  const bySubject = {};
  for (const [key, g] of [...byGrade.entries()].sort()) {
    const model = modelFor(g.track_id, g.grade_id);
    const objectives = new Set(g.items.map((i) => i.objective_id));
    grades[key] = { objectives_total: model.objectives.length, objectives_with_items: objectives.size, items: g.items.length };
    const s = bySubject[g.track_id] || (bySubject[g.track_id] = { grades: 0, objectives_with_items: 0, items: 0 });
    s.grades += 1; s.objectives_with_items += objectives.size; s.items += g.items.length;
  }
  const report = {
    built_at: new Date().toISOString(),
    rule: 'kept by the factory (code checks + two blind judges from different families agreeing) AND the app checks re-run here AND not a duplicate',
    sources: files.map((f) => path.relative(ROOT, f).replace(/\\/g, '/')),
    counts,
    objectives_with_items: Object.values(grades).reduce((s, g) => s + g.objectives_with_items, 0),
    bySubject,
    grades,
    dropped,
  };

  console.log(`objective items: read ${counts.read} kept rows from ${files.length} files; imported ${counts.kept}; `
    + `${counts.duplicates} duplicates across sources; dropped ${counts.dropped}`);
  console.log(`objectives with at least one item: ${report.objectives_with_items}`);
  for (const [t, s] of Object.entries(bySubject)) console.log(`  ${t}: ${s.items} items on ${s.objectives_with_items} objectives in ${s.grades} grades`);
  const reasons = {};
  for (const d of dropped) { const r = d.reason.replace(/\(.*$/, '').replace(/:.*?;.*/, '').slice(0, 70); reasons[r] = (reasons[r] || 0) + 1; }
  if (dropped.length) console.log('  dropped because:', JSON.stringify(reasons));

  if (DRY) { console.log('(dry run: nothing written)'); return report; }
  fs.mkdirSync(OUT, { recursive: true });
  // Grades that no longer have any item lose their file, so a rebuild is exact.
  for (const f of fs.readdirSync(OUT)) {
    if (/^[a-z0-9_]+\.[a-z0-9_]+\.json$/i.test(f) && !byGrade.has(f.replace(/\.json$/i, ''))) fs.unlinkSync(path.join(OUT, f));
  }
  for (const [key, g] of byGrade) {
    if (!g.items.length) continue;
    fs.writeFileSync(path.join(OUT, `${key}.json`), `${JSON.stringify({ track_id: g.track_id, grade_id: g.grade_id, built_at: report.built_at, items: g.items }, null, 1)}\n`);
  }
  fs.writeFileSync(path.join(OUT, '_build-report.json'), `${JSON.stringify(report, null, 1)}\n`);
  console.log(`wrote ${byGrade.size} grade files to ${path.relative(ROOT, OUT)}`);
  return report;
}

if (require.main === module) main();
module.exports = { main, family, verificationProblem, keptItemsIn, sourceFiles };
