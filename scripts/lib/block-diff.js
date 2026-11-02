// Lists the single-measure cases whose block changed between two snapshots (scripts/lib/block-snapshot.js).
// node scripts/lib/block-diff.js BEFORE.json AFTER.json [surface]
const fs = require('fs');
const a = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const b = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const only = process.argv[4] || null;
const bySurf = {};
for (const k of Object.keys(a)) {
  const [m, v, s] = k.split(':');
  if (only && s !== only) continue;
  if (a[k] !== b[k]) { (bySurf[s] = bySurf[s] || new Set()).add(m); }
}
for (const [s, set] of Object.entries(bySurf)) console.log(`${s}: ${set.size} measures changed: ${[...set].join(', ')}`);
if (!Object.keys(bySurf).length) console.log('no block changed');
