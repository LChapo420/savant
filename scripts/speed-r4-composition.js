#!/usr/bin/env node
/**
 * Round 4 (docs/speed-real/ROUND4.md): what the real router serves at every level of every grade, for a standard account with no stored plans (MEASURED from the code and the sheets; no learner, no model).
 * Which grades are design and which held out is fixed by a hash of the grade id, so nothing tuned reads a held-out grade.
 *   node scripts/speed-r4-composition.js [--out=FILE]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r4-comp-')), 'db.json');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const assignments = require('../config/game-assignments');
const gameBank = require('../services/game-bank');
const objItems = require('../services/objective-items');

/** Held out: 3 grades in 4 by a hash fixed before any tuning. Design: the rest. */
const SAMPLE = 7; // one plain practice level in 7 goes through the (slow) game router; counts are scaled
const heldOut = (track, grade) => crypto.createHash('sha1').update(`r4:${track}/${grade}`).digest()[0] % 4 !== 0;
module.exports = { heldOut };

if (require.main === module) {
  const arg = (k) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : null; };
  const rows = [];
  for (const tr of Object.values(curriculum.TRACKS)) {
    for (const g of tr.grades) {
      const r = { track: tr.id, grade: g.id, held_out: heldOut(tr.id, g.id), levels: g.pathLength, lesson: 0, retention: 0, game: 0, practice: 0, checkpoint: 0, essay: 0, game_questions: [] };
      for (let L = 1; L <= g.pathLength; L++) {
        const k = curriculum.levelKind(L, g.pathLength, g);
        const e = LAYOUT.entryFor(g, L) || {};
        if (k === 'lesson') { r.lesson++; continue; }
        if (curriculum.isEssayCheckpoint(g, L)) { r.essay++; continue; }
        if (curriculum.isCheckpoint(k)) { r.checkpoint++; continue; }
        if (/\(retention\)/i.test(String(e.title || '')) || /^retention\b/i.test(String(e.covers || ''))) { r.retention++; continue; }
        if (L % SAMPLE !== 0) { r.practice_unsampled = (r.practice_unsampled || 0) + 1; continue; }
        const a = assignments.resolve(tr.id, g.id, L);
        if (a) { r.game++; if (r.game_questions.length < 3) { try { const p = gameBank.payloadFor(tr.id, g.id, L); const q = p && (p.questions || (p.config && p.config.questions) || p.items); if (q) r.game_questions.push(q.length); } catch { /* none */ } } } else r.practice++;
      }
      r.game *= SAMPLE; r.practice = (r.practice_unsampled || 0) + r.practice * 1 - Math.round((r.game * (SAMPLE - 1)) / SAMPLE); delete r.practice_unsampled;
      try { r.objective_items = objItems.forGrade(tr.id, g.id).size; } catch { r.objective_items = 0; }
      rows.push(r);
    }
  }
  const sum = (k, f = () => true) => rows.filter(f).reduce((s, x) => s + x[k], 0);
  const line = (name, f) => console.log(`${name}: grades ${rows.filter(f).length}, levels ${sum('levels', f)}, lessons ${sum('lesson', f)}, retention ${sum('retention', f)}, bank/engine games ${sum('game', f)}, ordinary practice ${sum('practice', f)}, checkpoints ${sum('checkpoint', f)}, essays ${sum('essay', f)}; levels per lesson ${(sum('levels', f) / sum('lesson', f)).toFixed(1)}; grades with objective items ${rows.filter((x) => f(x) && x.objective_items > 0).length}`);
  line('all', () => true); line('design', (x) => !x.held_out); line('held out', (x) => x.held_out);
  for (const tr of Object.values(curriculum.TRACKS)) line(tr.id, (x) => x.track === tr.id);
  const gq = rows.flatMap((r) => r.game_questions); if (gq.length) console.log(`game questions per level: n ${gq.length}, min ${Math.min(...gq)}, median ${[...gq].sort((a, b) => a - b)[Math.floor(gq.length / 2)]}, max ${Math.max(...gq)}`);
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(rows));
  process.exit(0);
}
