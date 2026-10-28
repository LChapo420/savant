#!/usr/bin/env node
/**
 * Export written base levels to content/base-levels, or import them by hand.
 *
 *   node scripts/base-content.js export --track english --grade proficient
 *   node scripts/base-content.js import
 */
const content = require('../services/base-content');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

if (args[0] === 'export') {
  const track = flag('track');
  const grade = flag('grade');
  if (!track || !grade) { console.error('Usage: export --track <track> --grade <grade>'); process.exit(1); }
  const out = content.exportGrade(track, grade);
  console.log(`Wrote ${out.file}: ${out.plans} plans, ${out.games} games.`);
} else if (args[0] === 'import') {
  const out = content.importAll();
  console.log(`Imported ${out.plans} plans, ${out.games} games.`);
} else {
  console.error('Usage: node scripts/base-content.js export|import');
  process.exit(1);
}
