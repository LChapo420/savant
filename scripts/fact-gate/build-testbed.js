#!/usr/bin/env node
/**
 * Step 1: the test bed. Candidates from the planters (plant.js, plant-keys.js), kept or rejected by a human read (lists below), plus hand-written
 * date/name errors and code-swapped block keys. Dev/held-out split by LEVEL (seeded hash), so no level is in both.
 * Output: docs/fact-gate/testbed.json. Judges never see this file: only the level text with the edit applied (docs/FACT-GATE.md: who sees what).
 */
const L = require('./lib');

const rd = (f) => L.readJsonl(L.path.join(L.TMP, f));
const A = rd('plant-candidates.jsonl'); const K = rd('plant-candidates-keys.jsonl'); const E = rd('plant-candidates-ex.jsonl');
const levels = L.loadLevels(); const byId = new Map(levels.map((l) => [l.id, l]));

// id: kind (as re-labelled on reading)
const KEEP_A = {
  0: 'reversed_cause', 1: 'formula_step', 2: 'formula_step', 3: 'formula_step', 4: 'wrong_worked_example', 5: 'wrong_number', 6: 'wrong_number', 7: 'misleading_simplification', 8: 'formula_step', 9: 'reversed_cause',
  12: 'wrong_number', 14: 'wrong_number', 15: 'formula_step', 17: 'wrong_number', 18: 'reversed_cause', 19: 'reversed_cause', 22: 'formula_step', 24: 'formula_step', 25: 'wrong_worked_example', 26: 'reversed_cause',
  27: 'formula_step', 28: 'wrong_worked_example', 29: 'formula_step', 30: 'wrong_worked_example', 31: 'wrong_number', 32: 'wrong_worked_example', 33: 'wrong_number', 34: 'wrong_worked_example', 35: 'wrong_worked_example', 36: 'wrong_number',
  37: 'date_name', 38: 'reversed_cause', 39: 'date_name', 40: 'reversed_cause', 42: 'wrong_number', 43: 'reversed_cause', 44: 'misleading_simplification', 45: 'reversed_cause', 46: 'wrong_number',
  47: 'date_name', 48: 'reversed_cause', 49: 'date_name', 50: 'reversed_cause', 51: 'misleading_simplification', 55: 'reversed_cause', 57: 'misleading_simplification', 58: 'reversed_cause', 59: 'wrong_worked_example',
  63: 'reversed_cause', 64: 'wrong_worked_example', 65: 'misleading_simplification', 66: 'reversed_cause', 67: 'reversed_cause', 70: 'misleading_simplification', 71: 'misleading_simplification', 73: 'formula_step', 76: 'reversed_cause', 80: 'wrong_number',
  82: 'formula_step', 83: 'wrong_number', 84: 'reversed_cause', 85: 'reversed_cause', 86: 'misleading_simplification', 88: 'date_name', 90: 'reversed_cause', 91: 'formula_step', 93: 'wrong_worked_example', 94: 'reversed_cause',
  95: 'misleading_simplification', 96: 'formula_step', 97: 'reversed_cause', 98: 'misleading_simplification', 99: 'formula_step', 100: 'formula_step', 101: 'reversed_cause', 102: 'formula_step', 103: 'reversed_cause',
};
const SUBSET_A = { 81: { kind: 'wrong_number', edits: [1] }, 87: { kind: 'misleading_simplification', edits: [1] }, 89: { kind: 'formula_step', edits: [1] } };
const KEEP_E = {
  0: 'wrong_number', 1: 'wrong_worked_example', 2: 'date_name', 3: 'wrong_worked_example', 8: 'wrong_worked_example', 10: 'wrong_number', 11: 'reversed_cause', 12: 'wrong_number', 15: 'wrong_worked_example', 16: 'wrong_number',
  18: 'wrong_number', 19: 'wrong_worked_example', 20: 'wrong_worked_example', 21: 'wrong_worked_example', 27: 'date_name', 44: 'wrong_worked_example', 48: 'wrong_number', 50: 'wrong_number', 57: 'date_name', 60: 'wrong_number',
};
const KEEP_K = [39, 41, 43, 45, 47, 49, 51, 2, 8, 10, 12, 20, 36, 26, 28, 30, 32, 33, 18, 24, 1, 3, 7, 9, 11, 13, 17, 21, 23, 25, 27, 29, 31, 35, 40, 42, 44, 46, 48, 50, 52];

// Hand-written: real names and dates (the shared lessons hold few of either). See docs/FACT-GATE.md.
const HAND = require('./hand-plants.json');

const norm = (e) => ({ word: e.word, index: e.index, original: e.original, wrong: e.wrong });
const plants = [];
const push = (p) => {
  const lv = byId.get(p.level);
  if (!lv) throw new Error(`no level ${p.level}`);
  try { L.applyEdits(lv, p.edits); } catch (err) { console.log('DROP', p.src, err.message.slice(0, 100)); return; }
  plants.push(p);
};
for (const [i, kind] of Object.entries(KEEP_A)) push({ src: `A${i}`, level: A[i].level, track: A[i].track, kind, edits: A[i].edits.map(norm), truth: A[i].truth });
for (const [i, s] of Object.entries(SUBSET_A)) push({ src: `A${i}`, level: A[i].level, track: A[i].track, kind: s.kind, edits: s.edits.map((k) => norm(A[i].edits[k])), truth: A[i].truth });
for (const [i, kind] of Object.entries(KEEP_E)) push({ src: `E${i}`, level: E[i].level, track: E[i].track, kind, edits: E[i].edits.map(norm), truth: E[i].truth });
for (const i of KEEP_K) {
  const k = K[i]; const lv = byId.get(k.level); const c = lv.checks.find((x) => x.index === k.check);
  const set = { answer: k.new_answer, rationale: k.new_rationale };
  if (c.accepts) set.accepts = [k.new_answer];
  push({ src: `K${i}`, level: k.level, track: k.track, kind: k.kind, edits: [{ word: 'check', index: k.check, set, marker: k.new_answer }], truth: k.truth, old_answer: k.old_answer });
}
HAND.forEach((h, i) => push({ src: `H${i}`, level: h.level, track: h.level.split('/')[0], kind: h.kind, edits: h.edits, truth: h.truth }));

// Code-swapped block keys: the interactive item's key moved to another option, feedback untouched (the 2026-10-23 audit's real error: reasoned right, keyed wrong).
const seed = (s) => parseInt(L.hash(s).slice(0, 8), 16);
const used = new Set();
for (const lv of levels.filter((l) => plants.some((p) => p.level === l.id))) {
  for (const b of lv.blocks) {
    const key = `${lv.id}|${b.block}`;
    if (used.size >= 14 || used.has(lv.id)) continue;
    const d = b.data;
    let p = null;
    if (b.block === 'Ret_MisconceptionTrap' && d.correctId && (d.options || []).length > 1) {
      const other = d.options.find((o) => o.id !== d.correctId);
      p = { path: 'correctId', value: other.id, marker: other.text };
    } else if (b.block === 'Interact_MultipleChoice' && d.correctOptionId && (d.options || []).length > 1) {
      const other = d.options.find((o) => o.id !== d.correctOptionId);
      p = { path: 'correctOptionId', value: other.id, marker: other.text };
    } else if (b.block === 'Recall_FillTheBlank' && (d.blanks || d.items || []).length) {
      const arr = d.blanks || d.items; const f = arr[seed(key) % arr.length];
      if (f && Array.isArray(f.options || f.choices) && typeof f.correctIndex === 'number') {
        const opts = f.options || f.choices; const j = (f.correctIndex + 1) % opts.length;
        p = { path: `${d.blanks ? 'blanks' : 'items'}.${arr.indexOf(f)}.correctIndex`, value: j, marker: typeof opts[j] === 'string' ? opts[j] : (opts[j].text || opts[j].label || '') };
      }
    }
    if (!p) continue;
    used.add(lv.id);
    push({ src: `S${used.size}`, level: lv.id, track: lv.track, kind: 'wrong_answer_key', edits: [{ word: 'block', index: b.index, ...p }], truth: `The key of ${b.block} was moved to a wrong option.` });
  }
}

plants.forEach((p, i) => { p.id = `p${String(i).padStart(3, '0')}`; });
const lvIds = [...new Set(plants.map((p) => p.level))];
const split = {}; for (const id of lvIds) split[id] = parseInt(L.hash(`fact-gate-split-1|${id}`).slice(0, 6), 16) % 100 < 35 ? 'dev' : 'heldout';
// Marked before any held-out result was read: arguably not false on a second read. Kept in every count; reported apart too.
const SOFT = new Set(['A44', 'A51', 'A70', 'A83', 'E57']);
plants.forEach((p) => { p.split = split[p.level]; p.consistent = p.edits.length > 1; if (SOFT.has(p.src)) p.soft = true; });
const clean = levels.filter((l) => split[l.id]).map((l) => ({ level: l.id, split: split[l.id] }));
const count = (arr, f) => arr.reduce((m, x) => { m[f(x)] = (m[f(x)] || 0) + 1; return m; }, {});
console.log(plants.length, count(plants, (p) => p.kind), count(plants, (p) => p.track), count(plants, (p) => p.split), 'clean', clean.length, count(clean, (c) => c.split), count(clean, (c) => c.level.split('/')[0]));
L.writeJson(L.path.join(L.DOCS, 'testbed.json'), { built: '2026-11-06', planted_by: 'Lyceum MiniMax M3 (most), xKiro Mistral Large (first 23), human (H*), code (S*); every one read and kept or rejected by a human before any judge ran', plants, clean });
