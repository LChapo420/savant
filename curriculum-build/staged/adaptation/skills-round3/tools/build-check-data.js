// Writes content/skill-stage-checks.data.json in the app copy given: the staged
// drills the stage checks serve as they are (every answer computed or
// table-proved in curriculum-build/staged/skills/*/drills.json, re-checked by
// verify-skill-curricula.js), cut to what the checks use.
//   node build-check-data.js <app root>
const fs = require('fs');
const path = require('path');
const app = path.resolve(process.argv[2]);
const chess = JSON.parse(fs.readFileSync(path.join(app, 'curriculum-build/staged/skills/chess/drills.json'), 'utf8'));
const piano = JSON.parse(fs.readFileSync(path.join(app, 'curriculum-build/staged/skills/piano/drills.json'), 'utf8'));
const C = require(path.join(app, 'content/chess-board'));

const pick = (x, keys) => Object.fromEntries(keys.filter((k) => x[k] !== undefined).map((k) => [k, x[k]]));
const kpk = chess.drills.filter((d) => d.type === 'kpk_judgement').map((d) => pick(d, ['id', 'fen', 'side', 'question', 'answer']));
const mateOrNot = chess.drills.filter((d) => d.type === 'mate_or_not').map((d) => pick(d, ['id', 'fen', 'side', 'question', 'answer']));
// Re-check every mate-or-not answer with the rules engine before it is served.
for (const d of mateOrNot) {
  const pos = C.parseFen(d.fen);
  const mates = C.legalMoves(pos).filter((m) => C.isCheckmate(C.makeMove(pos, m))).map((m) => C.san(pos, m));
  const ok = d.answer === 'no mate' ? mates.length === 0 : mates.map((s) => s.replace(/[+#]/g, '')).includes(d.answer.replace(/[+#]/g, ''));
  if (!ok) throw new Error(`mate-or-not ${d.id}: answer ${d.answer}, mates found ${mates.join(',')}`);
  d.mates = mates;
}
const technique = piano.technique_batteries.filter((b) => ['PI2', 'PI3', 'PI4'].includes(b.stage)).map((b) => ({ stage: b.stage, grade: b.grade, items: b.items.map((i) => pick(i, ['item', 'kind', 'tonic', 'notes', 'hands', 'octaves', 'midi_ascending'])) }));
const out = {
  doc: 'Staged drills served by the skill stage checks (services/skill-checks.js). Built from curriculum-build/staged/skills/*/drills.json by skills-round3/tools/build-check-data.js; every mate-or-not answer re-checked with content/chess-board on build. Do not edit by hand.',
  built_at: new Date().toISOString().slice(0, 10),
  chess: { kpk_judgement: kpk, mate_or_not: mateOrNot },
  piano: { technique, tempo_ladder: piano.tempo_ladder },
};
fs.writeFileSync(path.join(app, 'content/skill-stage-checks.data.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`kpk ${kpk.length}, mate-or-not ${mateOrNot.length} (${mateOrNot.filter((d) => d.answer === 'no mate').length} no mate), piano batteries ${technique.length}`);
