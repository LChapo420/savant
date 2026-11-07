/**
 * What the check on a change catches and what it wrongly stops (AI-JUDGED, on hand-written pairs, so easier than real mistakes). False alarms count as much as misses: a clean rewording refused is a change the learner did not get.
 * Each pair is a sentence of a held-out handout and a rewording: clean (plain words, same meaning) or planted (a changed meaning, a new cause, a wider scope, a changed number or name, a lost negation).
 *   node scripts/uploads-beta-check-eval.js          rules plus the two readers exactly as services/material-parts.js runs them
 */
const path = require('path');
const L = require('./lib/uploads-beta-lib');

L.setup('check-eval');
process.env.UPLOAD_PARTS = 'on';
const P = require('../services/material-parts');
const F = require('../services/material-factcheck');
const J = require('./lib/invented-judges');

const CLEAN = [
  ['h1', 'Plates move because of mantle convection, slab pull, and ridge push.', 'Three things push and pull plates along: mantle convection, slab pull, and ridge push.'],
  ['h1', 'Plate edges are locked by friction; strain builds until it exceeds rock strength.', 'Friction holds the plate edges still, and strain grows until it is more than the rock can take.'],
  ['h1', 'Earthquakes are not randomly distributed; they trace the kinematic framework of plate interactions.', 'Earthquakes do not happen just anywhere; they follow the lines where plates interact.'],
  ['h1', 'Pre-existing faults concentrate slip.', 'Slip gathers on faults that are already there.'],
  ['h1', 'The Nazca Plate subducts beneath South America at about 8 cm per year.', 'The Nazca Plate slides under South America at about 8 cm each year.'],
  ['h1', 'Seismic gap theory says that segments that have not ruptured in a full cycle are candidates for future large events.', 'By seismic gap theory, a stretch that has not broken in a full cycle may have a large event later.'],
  ['h2', 'Bismarck sought to isolate France after 1871.', 'After 1871 Bismarck tried to keep France on its own.'],
  ['h3', 'Every transaction is recorded twice, once as a debit and once as a credit.', 'Each transaction goes in two times: one debit and one credit.'],
  ['h3', 'Assets must always equal liabilities plus owner\'s equity.', 'Assets always have to match liabilities plus owner\'s equity.'],
  ['h4', 'Do not stop a beta blocker abruptly.', 'A beta blocker should not be stopped all at once.'],
  ['h5', 'Do not confuse a quorum with a majority.', 'A quorum and a majority are not the same thing.'],
  ['h6', 'Evaporation moves water from the oceans to the atmosphere.', 'Water goes from the oceans up into the air by evaporation.'],
];
const PLANTED = [
  ['h1', 'Plates move because of mantle convection, slab pull, and ridge push.', 'Plates move mostly because of mantle convection, which is stronger than slab pull and ridge push.', 'a ranking the material does not make'],
  ['h1', 'Plate edges are locked by friction; strain builds until it exceeds rock strength.', 'Plate edges are locked by friction, so strain cannot build up in the rock.', 'meaning reversed'],
  ['h1', 'Earthquakes are not randomly distributed; they trace the kinematic framework of plate interactions.', 'Earthquakes are randomly distributed along plate interactions.', 'a lost negation'],
  ['h1', 'Pre-existing faults concentrate slip.', 'Pre-existing faults spread slip out evenly.', 'meaning reversed'],
  ['h1', 'The Nazca Plate subducts beneath South America at about 8 cm per year.', 'The Nazca Plate subducts beneath South America at about 18 cm per year.', 'a changed number'],
  ['h1', 'Seismic gap theory says that segments that have not ruptured in a full cycle are candidates for future large events.', 'Seismic gap theory shows that segments that have not ruptured in a full cycle will have large events.', 'a candidate became a certainty'],
  ['h2', 'Bismarck sought to isolate France after 1871.', 'Bismarck isolated France after 1871.', 'sought became did'],
  ['h3', 'Every transaction is recorded twice, once as a debit and once as a credit.', 'Every transaction is recorded twice, which prevents all fraud in the books.', 'a new purpose'],
  ['h3', 'Assets must always equal liabilities plus owner\'s equity.', 'Assets must always equal liabilities minus owner\'s equity.', 'a changed sign'],
  ['h4', 'Do not stop a beta blocker abruptly.', 'Stop a beta blocker abruptly.', 'a lost negation'],
  ['h5', 'Do not confuse a quorum with a majority.', 'A quorum is the same as a majority.', 'meaning reversed'],
  ['h6', 'Evaporation moves water from the oceans to the atmosphere.', 'Evaporation moves water from the atmosphere to the oceans.', 'swapped direction'],
];
const srcOf = (id) => L.load(path.join(L.OUT_DIR, 'courses', `${id}.json`));

function readerLlm() {
  return async (a) => {
    const fam = a.task === 'material_part_read_a' ? 'C' : 'Q';
    for (let i = 0; i < 3; i += 1) {
      try { return { data: await J.call(fam, { system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: Math.max(a.maxTokens || 1000, 2500) }) }; } catch (e) { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
    }
    return null;
  };
}
async function one(id, base, rewrite) {
  const c = srcOf(id);
  const rule = P.leafProblems(base, rewrite, []);
  if (rule.length) return { caught: true, by: `rule: ${rule[0]}` };
  // The material is what the check reads; the base line is added only if the handout says it in other words, so a clean rewording is not refused for that.
  const llm = readerLlm();
  const idx = F.indexSource(`${c.plain}\n${base}`);
  const asker = async (a) => { let res = null; try { res = await llm(a); } catch { res = null; } return { res }; };
  const got = await F.check([{ id: 'x', text: rewrite, extra: base }], {
    idx, sourceText: `${c.plain.slice(0, 15000)}\n${base}`, needQuote: false, once: true, system: P.REWORD_SYSTEM,
    asker: (a) => asker({ ...a, task: 'material_part_read_a' }), asker2: (a) => asker({ ...a, task: 'material_part_read_b' }), askerAny: (a) => asker({ ...a, task: 'material_part_read_a' }),
  });
  const v = got.get('x');
  return { caught: !v || !v.keep || !!v.text || v.how === 'unchecked', by: v ? `${v.how}${v.reason ? `: ${String(v.reason).slice(0, 60)}` : ''}` : 'none' };
}
(async () => {
  const out = { clean: [], planted: [] };
  await J.pool(CLEAN, 3, async ([id, b, r]) => { out.clean.push({ id, r, ...(await one(id, b, r)) }); });
  await J.pool(PLANTED, 3, async ([id, b, r, what]) => { out.planted.push({ id, r, what, ...(await one(id, b, r)) }); });
  console.log(`clean rewordings: ${out.clean.filter((x) => !x.caught).length} of ${out.clean.length} passed (false alarms: ${out.clean.filter((x) => x.caught).length})`);
  out.clean.filter((x) => x.caught).forEach((x) => console.log(`  FALSE ALARM ${x.r} [${x.by}]`));
  console.log(`planted errors: ${out.planted.filter((x) => x.caught).length} of ${out.planted.length} caught`);
  out.planted.filter((x) => !x.caught).forEach((x) => console.log(`  MISSED (${x.what}) ${x.r} [${x.by}]`));
  out.planted.filter((x) => x.caught).forEach((x) => console.log(`  caught (${x.what}) by ${x.by}`));
  L.save(path.join(L.OUT_DIR, 'check-eval.json'), out);
  console.log('spend', JSON.stringify(J.spend));
  process.exit(0);
})();
