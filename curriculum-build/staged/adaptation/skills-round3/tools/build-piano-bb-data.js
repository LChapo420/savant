// Writes content/skill-piano-bb-sittings.data.json in the app copy given: the
// later piano stages' technique batteries (PI5-PI10, as written in
// curriculum-build/staged/skills/piano/drills.json, spellings and MIDI checked
// there by verify-skill-curricula.js) and the sight-reading staircase specs,
// and the basketball decision-clip set specs. Re-checks every battery item's
// notes against its MIDI here before writing.
//   node build-piano-bb-data.js <app root>
const fs = require('fs');
const path = require('path');
const app = path.resolve(process.argv[2]);
const piano = JSON.parse(fs.readFileSync(path.join(app, 'curriculum-build/staged/skills/piano/drills.json'), 'utf8'));
const bb = JSON.parse(fs.readFileSync(path.join(app, 'curriculum-build/staged/skills/basketball/drills.json'), 'utf8'));
const P = require(path.join(app, 'public/engine/piano/piano-core'));
const pick = (x, keys) => Object.fromEntries(keys.filter((k) => x[k] !== undefined).map((k) => [k, x[k]]));
const pc = (name) => ((P.noteToMidi(`${name}4`) % 12) + 12) % 12;
const technique = piano.technique_batteries.filter((b) => ['PI5', 'PI6', 'PI7', 'PI8', 'PI9', 'PI10'].includes(b.stage)).map((b) => ({
  stage: b.stage,
  grade: b.grade,
  items: b.items.map((i) => {
    if (i.midi_ascending && i.notes) {
      const want = i.notes.map(pc);
      const got = i.midi_ascending.slice(0, i.notes.length).map((m) => ((m % 12) + 12) % 12);
      if (want.join() !== got.join()) throw new Error(`${b.stage} ${i.item}: notes ${i.notes} do not match MIDI ${i.midi_ascending}`);
    }
    return pick(i, ['item', 'kind', 'tonic', 'notes', 'hands', 'octaves', 'midi_ascending', 'descending', 'pitch_classes']);
  }),
}));
const out = {
  doc: 'Data for the later piano and basketball stage checks (services/skill-piano-bb-sittings.js). Built from curriculum-build/staged/skills/{piano,basketball}/drills.json by skills-round3/tools/build-piano-bb-data.js. Do not edit by hand.',
  built_at: new Date().toISOString().slice(0, 10),
  piano: { technique, sight_reading_staircase: piano.sight_reading_staircase },
  basketball: { decision_clip_sets: bb.decision_clip_sets },
};
fs.writeFileSync(path.join(app, 'content/skill-piano-bb-sittings.data.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`piano batteries ${technique.map((b) => `${b.stage}:${b.items.length}`).join(' ')}; clip sets ${bb.decision_clip_sets.length}`);
