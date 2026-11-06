/**
 * Which invented-facts judge can be believed? (MEASURED against planted errors and clean controls; AI-JUDGED.)
 *
 * The round 3 and 4 gates used a free-form prompt ("list any specific factual claim in the COURSE that is not in the SOURCE") with two judges:
 * C = Coral DeepSeek V4.1 Flash, N = NVIDIA nemotron. They disagreed by a factor of 12 on the same text. This runs both on the same prompt, on:
 *   verbatim  the source's own sentences, in order: nothing can be invented
 *   clean     a real course's lessons with every sentence I flagged by hand repaired or removed (my own read; docs/UPLOADS-ANY-FORMAT.md section 17)
 *   planted   the clean text plus 6 planted claims of 6 kinds (number, name, plain general knowledge, why-it-matters, swapped fact, analogy with a claim)
 *   real      the real course as stored in docs/uploads-heldout-r2 (with its questions)
 * and also a sentence-by-sentence form of the check, which is what the product's own checker is.
 *
 *   node scripts/uploads-judge-calibrate.js [reps=3] [judges=C,N,Z] [forms=free,sent]
 * Rows: docs/uploads-judge-calibration.json. Prepaid credits only; RUN_CAP_USD applies.
 */
const fs = require('fs'); const os = require('os'); const path = require('path');
require('../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 5));
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
process.env.GONKA_PIPELINE = '1'; process.env.CORAL_PIPELINE = '1'; process.env.LYCEUM_PIPELINE = '1'; process.env.ZEROGPU_PIPELINE = '1';
for (const [k, f] of [['GONKA', 'gonka'], ['CORAL', 'coral'], ['LYCEUM', 'lyceum'], ['ZEROGPU', 'zerogpu']]) process.env[`${k}_LEDGER_FILE`] = process.env[`${k}_LEDGER_FILE`] || `${LIVE}${f}-ledger.json`;
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-judgecal-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
const J = require('./lib/invented-judges');

const REPS = Number(process.argv[2] || 3);
const JUDGES = (process.argv[3] || 'C,N,Z').split(',');
const FORMS = (process.argv[4] || 'free,sent').split(',');
const OUT = path.join(__dirname, '..', 'docs', 'uploads-judge-calibration.json');
const R2 = path.join(__dirname, '..', 'docs', 'uploads-heldout-r2');
const docs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'uploads-heldout-docs.json'), 'utf8'));

// My own read of the r2 "full" courses (lessons). Each entry: text to find, what replaces it (claims the source does not make).
const HAND = {
  h1: [
    ['in the Wadati-Benioff zone, a dipping zone of seismicity within subducting slabs', 'in the Wadati-Benioff zone of subducting slabs'],
    [' (locked or slipping)', ''], [' This helps identify areas of higher hazard.', ''], [' This helps identify where earthquakes might happen.', ''],
    ['segments of a fault that', 'segments that'], ['These faster plate speeds help explain why large earthquakes happen so often', 'These rates explain the high frequency of large earthquakes'],
  ],
  h2: [
    ["The Schlieffen Plan was Germany's military strategy for a two-front war against France and Russia. It required a rapid invasion of Belgium to outflank the French army and defeat France quickly before turning east against Russia.", 'The Schlieffen Plan required the invasion of Belgium.'],
    [', and Britain was a signatory', ''], ['When Germany invaded Belgium in August 1914, Britain declared war on Germany on 4 August 1914, citing the violation of Belgian neutrality.', 'Britain declared war on Germany on 4 August 1914.'],
    ['The plan was set in motion after the July Crisis: ', ''], [', and then invaded Belgium', ''], ['This encouraged Austria-Hungary to issue an ultimatum to Serbia', 'Austria-Hungary issued an ultimatum to Serbia'],
    [', creating the Triple Entente', ''],
  ],
  h4: [
    ['In sinus bradycardia (heart rate <50 bpm), 2nd/3rd degree AV block, or sick sinus syndrome, they can worsen bradycardia or heart block.', 'Sinus bradycardia (<50 bpm), 2nd/3rd degree AV block and sick sinus syndrome are also listed.'],
    [', so dose adjustments may be needed', ''], ['This is a key exam trap: selectivity is dose-dependent, so high doses of a beta-1 selective drug can lose selectivity and affect beta-2 receptors in the lungs.', 'This is a key exam trap.'],
    ['from common fatigue', 'from fatigue'], ['to rarer bronchospasm', 'to bronchospasm'], ['Beta-blockers are not safe for everyone. ', ''], ['because they can trigger bronchospasm', ''],
    ['due to intrauterine growth restriction (IUGR)', '(IUGR)'], ['because it can cause intrauterine growth restriction (IUGR)', '(IUGR)'], ['heart failure with reduced ejection fraction', 'HFrEF'], ['atrial fibrillation/flutter', 'AF/flutter'],
    ['chronic kidney disease', 'CKD'], ['because they can cause bronchospasm', ''],
  ],
  h5: [
    [' based on its subject and cost', ''], [' This rule ensures a waiting period before the final vote.', ''], [' This rule prevents same-day passage unless every Delegate agrees.', ''],
  ],
};
// The count of real invented or over-reaching claims I found in each course's lessons (my read, strict). Listed so the judges' lists can be read against it.
const MY_COUNT = { h1: 4, h2: 7, h4: 6, h5: 3 };

const PLANTED = {
  h1: [
    ['number', 'Most ridge earthquakes release their energy within about 12 seconds of the first slip.', /12 sec|ridge earthquakes release/i],
    ['name', 'Alfred Wegener first proposed continental drift, long before plate motion could be measured.', /wegener/i],
    ['plain', 'Volcanoes commonly form above subducting slabs as the sinking plate releases water into the mantle.', /volcano/i],
    ['why', 'This matters because building codes in earthquake regions are written directly from these boundary maps.', /building code/i],
    ['swap', 'The Nazca Plate subducts beneath South America at about 5 cm per year, slower than the Pacific Plate.', /nazca.*(5 cm|slower)|slower.*pacific/i],
    ['analogy', 'Like a stuck zipper, a locked fault always gives way first at its deepest end.', /zipper|deepest end/i],
  ],
  h2: [
    ['number', 'By 1914 Germany had built 38 dreadnought battleships.', /38|dreadnought battleships/i],
    ['name', 'Franz Conrad von Hotzendorf, the Austrian chief of staff, pressed hardest for war.', /conrad|hotzendorf/i],
    ['plain', 'Nationalist newspapers in each capital stirred up public anger against rival powers.', /newspaper/i],
    ['why', 'This matters because the alliance system meant that no country could stay out once its partner was attacked.', /stay out|no country/i],
    ['swap', 'Germany declared war on France on 1 August and on Russia on 3 August.', /(france on 1 august|russia on 3 august)/i],
    ['analogy', 'Like dominoes stacked too close, the mobilisation timetables left generals unable to stop once the trains were moving.', /domino|timetable|trains/i],
  ],
  h4: [
    ['number', 'Metoprolol reaches its peak plasma level about 90 minutes after an oral dose.', /90 min|peak plasma/i],
    ['name', 'Sir James Black developed propranolol and later received a Nobel Prize for it.', /james black|nobel/i],
    ['plain', 'Beta blockers reduce the oxygen demand of the heart, which is why they ease angina.', /oxygen demand/i],
    ['why', 'This matters because lipid-soluble beta blockers cross into the brain and cause vivid dreams.', /lipid-soluble|vivid dream/i],
    ['swap', 'Atenolol is preferred in pregnancy while labetalol is avoided.', /atenolol is preferred|labetalol is avoided/i],
    ['analogy', 'Think of a beta blocker as a brake pedal that only works once the heart has exceeded its resting rate.', /brake pedal|resting rate/i],
  ],
  h5: [
    ['number', "The Speaker's term lasts 14 school weeks.", /14|school weeks/i],
    ['name', 'The first Speaker of Benches was Eleanor Whitcombe.', /whitcombe/i],
    ['plain', 'Delegates are usually chosen by their homerooms each autumn.', /homeroom/i],
    ['why', 'This matters because the Committee on Clubs controls the largest share of club meeting time.', /largest share|meeting time/i],
    ['swap', 'The Assembly may override a veto by a vote of eleven of the thirty-one Delegates.', /eleven of the thirty|override.*eleven/i],
    ['analogy', 'Like a relay race, a bill cannot leave committee until the chair physically hands it to the Clerk.', /relay|physically hands/i],
  ],
};

function conditions(id) {
  const d = docs.find((x) => x.id === id);
  const src = J.stripMd(d.md);
  const r2 = JSON.parse(fs.readFileSync(path.join(R2, `uploads-heldout-results-${id}.json`), 'utf8')).arms.find((a) => a.arm === 'full');
  const lessonsOnly = r2.gen.split('\n').filter((l) => !/^(Q|Key): /.test(l)).join('\n');
  let clean = lessonsOnly;
  for (const [a, b] of HAND[id]) {
    if (!clean.includes(a)) console.log(`  (${id}: hand fix not found: ${a.slice(0, 50)})`);
    clean = clean.split(a).join(b);
  }
  const lines = clean.split('\n');
  const spots = lines.map((l, i) => (l.startsWith('## ') || !l.trim() ? -1 : i)).filter((i) => i >= 0);
  const planted = lines.slice();
  PLANTED[id].forEach((p, k) => { const at = spots[Math.floor((k + 0.5) * spots.length / 6)]; planted[at] = `${planted[at]} ${p[1]}`; });
  const verbatim = src.split('\n').map((l) => l.replace(/^[-*\d.>\s|]+/, '')).filter((l) => l.split(' ').length > 3).join('\n');
  return { src, verbatim, clean, planted: planted.join('\n'), real: r2.gen };
}

(async () => {
  const rows = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const has = (r) => rows.some((x) => x.doc === r.doc && x.cond === r.cond && x.judge === r.judge && x.form === r.form && x.rep === r.rep);
  const jobs = [];
  for (const id of Object.keys(PLANTED)) {
    const cc = conditions(id);
    for (const cond of ['verbatim', 'clean', 'planted', 'real']) for (const judge of JUDGES) for (const form of FORMS) for (let rep = 1; rep <= REPS; rep++) {
      if (form === 'sent' && cond === 'real') continue; // the sentence form reads lessons; the real course's questions are not in it
      const row = { doc: id, cond, judge, form, rep };
      if (!has(row)) jobs.push({ row, src: cc.src, text: cc[cond] });
    }
  }
  console.log(`${jobs.length} judge calls to make`);
  let done = 0;
  await J.pool(jobs, Number(process.env.CAL_CONC || 6), async ({ row, src, text }) => {
    const t = Date.now();
    const flagged = await J.judge(row.judge, row.form, src, text);
    row.ms = Date.now() - t;
    if (flagged == null) { row.failed = true; row.flagged = []; } else row.flagged = flagged;
    rows.push(row); done++;
    if (done % 10 === 0) { fs.writeFileSync(OUT, JSON.stringify(rows)); console.log(`  ${done}/${jobs.length}`); }
  });
  fs.writeFileSync(OUT, JSON.stringify(rows));
  // report
  const by = (f) => rows.filter(f);
  for (const form of FORMS) for (const judge of JUDGES) {
    const line = [`${judge}/${form}`];
    for (const cond of ['verbatim', 'clean', 'real']) { const v = by((r) => r.judge === judge && r.form === form && r.cond === cond && !r.failed); if (v.length) line.push(`${cond} ${(v.reduce((n, r) => n + r.flagged.length, 0) / v.length).toFixed(2)}/doc (n ${v.length})`); }
    const pl = by((r) => r.judge === judge && r.form === form && r.cond === 'planted' && !r.failed);
    if (pl.length) {
      const kinds = {}; let hit = 0; let of = 0; let extra = 0;
      for (const r of pl) {
        const used = new Set();
        for (const [kind, , re] of PLANTED[r.doc]) { of++; const k = kinds[kind] = kinds[kind] || [0, 0]; k[1]++; const idx = r.flagged.findIndex((f) => re.test(f)); if (idx >= 0) { hit++; k[0]++; used.add(idx); } }
        extra += r.flagged.filter((f, i) => !used.has(i)).length;
      }
      line.push(`planted recall ${(100 * hit / of).toFixed(0)}% (${Object.entries(kinds).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join(', ')}), other flags ${(extra / pl.length).toFixed(2)}/doc`);
    }
    const fails = by((r) => r.judge === judge && r.form === form && r.failed).length;
    if (fails) line.push(`no answer ${fails}`);
    console.log(line.join(' | '));
  }
  console.log('my own count on real lessons:', JSON.stringify(MY_COUNT));
})();
