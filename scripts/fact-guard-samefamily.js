#!/usr/bin/env node
/**
 * Is a reader from the writer's own family weaker? The argument for a slower independent checker is that a model shares its own family's false beliefs. This puts a number on it:
 * DeepSeek writes short, unaided answers to hard questions with a known answer, so its errors are real ones, not planted. Each checker then reads every answer. Catches on the
 * writer's own errors, false alarms on its right answers, and time. Hand-written questions, no learner data, prepaid credits through the ledgers. Not part of npm test.
 * The questions are hard on purpose, and the answer key is matched by a pattern and then read by a person: the output lists every error for that.
 *
 *   node scripts/fact-guard-samefamily.js [--out FILE] [--runs 2]
 */
const fs = require('fs');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV, quiet: true }); } catch { /* the environment */ } }
require('../services/run-cap').defaultCap(5);
const LIVE_DIR = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['CORAL', 'GONKA', 'GROKIFIED', 'LYCEUM', 'MUNITO', 'ZEROGPU']) {
  if (!process.env[`${n}_LEDGER_FILE`]) process.env[`${n}_LEDGER_FILE`] = `${LIVE_DIR}/${n.toLowerCase()}-ledger.json`;
  process.env[`${n}_PIPELINE`] = '1';
}
const guard = require('../services/fact-guard');

const coral = () => require('../services/providers/coral').coral; // eslint-disable-line global-require
const CHECKERS = {
  'coral-deepseek-std (same family)': { prov: coral, model: 'deepseek-v4.1-flash' },
  'zerogpu-glm-flash': { prov: () => require('../services/providers/zerogpu').zerogpu, model: 'z-ai/glm-5.3-flash' }, // eslint-disable-line global-require
  'munito-glm-flash': { prov: () => require('../services/providers/munito').munito, model: 'zai-org/glm-5.3-flash' }, // eslint-disable-line global-require
  'grokified-grok-4.3': { prov: () => require('../services/providers/grokified').grokified, model: 'grok-4.3' }, // eslint-disable-line global-require
};

// [question, a pattern the right answer matches]
const Q = [
  ['What is 1234 x 5678?', /7,?006,?652/], ['What is 987 x 654?', /645,?498/], ['What is 3^11?', /177,?147/], ['What is the remainder of 2^100 divided by 7?', /\b2\b/],
  ['What is the 20th Fibonacci number, with F1 = F2 = 1?', /6,?765/], ['What is the square root of 15129?', /\b123\b/], ['How many primes are below 100?', /\b25\b/], ['What is the LCM of 18, 24 and 30?', /\b360\b/],
  ['What is the sum of the interior angles of a 17-sided polygon?', /2,?700/], ['How many distinct arrangements are there of the letters of MISSISSIPPI?', /34,?650/], ['What is the probability of at least one six in four rolls of a fair die, to 3 decimal places?', /0?\.518|51\.8/],
  ['$1000 at 5% compounded yearly for 3 years grows to how much, to the cent?', /1,?157\.63/], ['How many trailing zeros does 25! have?', /\b6\b/], ['What is the derivative of x^x at x = 1?', /\b1\b/], ['What is the integral of ln x from 1 to e?', /\b1\b/],
  ['What is 7/13 as a decimal to 4 places?', /0?\.5385/], ['What day of the week was 1 January 2000?', /saturday/i], ['What is the determinant of [[2,3],[5,7]]?', /-\s?1\b/], ['Solve 3x^2 - 12x + 9 = 0.', /\b1\b[\s\S]*\b3\b/], ['What is the sum of the integers from 1 to 250?', /31,?375/],
  ['What is 17% of 2340?', /397\.8/], ['Convert 255 to base 7.', /\b513\b/], ['What is log base 2 of 1024 plus log base 3 of 81?', /\b14\b/], ['How many diagonals does a 12-sided polygon have?', /\b54\b/],
  ['What is the atomic number of tungsten?', /\b74\b/], ['How many chromosomes does a dog have?', /\b78\b/], ['How many chromosomes does a potato have?', /\b48\b/], ['What is the half-life of carbon-14, in years, roughly?', /5,?7[0-9]0/], ['What is the boiling point of nitrogen at 1 atm in kelvin, roughly?', /\b77\b/],
  ['What is the charge of a down quark?', /1\/3/], ['What is the formula of gypsum?', /CaSO|calcium sulfate/i], ['What is the oxidation state of sulfur in H2SO4?', /\+?\s?6\b/], ['What is the molar mass of glucose, to the nearest gram?', /\b180\b/], ['Which blood type is the universal red cell donor?', /O[\s-]*(negative|neg|-|\u2212)/i],
  ['What organ produces insulin?', /pancrea/i], ['How many hearts does an octopus have?', /\b(3|three)\b/i], ['Who proved that the speed of light is finite, and in what century?', /r(ø|o)mer|roemer/i], ['What is the second-most abundant element in Earth\'s crust by mass?', /silicon/i],
  ['In what year was the Treaty of Westphalia signed?', /1648/], ['In what year was the Treaty of Tordesillas?', /1494/], ['In what year was the Peace of Augsburg?', /1555/], ['Who succeeded Augustus as Roman emperor?', /tiberius/i], ['Who was the third Vice President of the United States?', /burr/i], ['Who was the US president when the War of 1812 began?', /madison/i],
  ['Which country first gave women the national vote, and when?', /new zealand/i], ['Who was the first monarch of the Tudor dynasty?', /henry vii\b/i], ['Who won the Battle of Lepanto in 1571?', /holy league/i], ['In what year did the Edict of Nantes get revoked?', /1685/], ['Who led the Haitian Revolution at its start, until captured in 1802?', /louverture|l'ouverture/i], ['Which treaty ended the Crimean War?', /paris/i],
  ['What is the first-person singular preterite of Spanish andar?', /anduve/i], ['What is the first-person singular preterite of Spanish conducir?', /conduje/i], ['What is the present subjunctive yo form of Spanish haber?', /haya/i], ['What is the past participle of Spanish romper?', /roto/i], ['What is the past participle of French naitre?', /n(é|e)\b/i], ['What is the Spanish for "I would have gone"?', /habr(í|i)a ido/i],
  ['What is the past tense of the English verb lie, meaning recline?', /\blay\b/i], ['What is the past participle of the English verb lie, meaning recline?', /\blain\b/i], ['What is the plural of the English word criterion?', /criteria/i], ['What figure of speech is "the crown" meaning the monarchy?', /metonym/i], ['In "whom did you call", what case is whom?', /objective|accusative/i],
  ['How many squares can a knight move to from b1 on an empty board?', /\b(3|three)\b/i], ['How many legal first moves does White have in chess?', /\b20\b/], ['What is the first move of the Ruy Lopez for White\'s third move?', /Bb5/i], ['What is the key signature of E-flat major?', /(3|three) flats/i], ['What is the relative minor of A major?', /f.?(#|sharp)/i], ['What notes are in a D7 chord?', /F.?(#|sharp)[\s\S]*C|C[\s\S]*F.?(#|sharp)/i], ['Which major key has five sharps?', /\bB major/i],
  ['What is the capital of Kazakhstan?', /astana/i], ['What is the capital of Myanmar?', /nay.?pyi.?daw/i], ['What is the capital of Nigeria?', /abuja/i], ['Which country has the most time zones, counting its territories?', /france/i], ['Which US state is closest to Africa?', /maine/i], ['What is the longest river in Asia?', /yangtze/i], ['What is the largest lake in Africa by area?', /victoria/i],
];

const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const WRITER = 'You are a tutor. Answer in one or two short sentences and do not show working. State the answer plainly.';

async function pool(list, width, fn) { let n = 0; const out = []; await Promise.all(Array.from({ length: width }, async () => { while (n < list.length) { const i = n++; out[i] = await fn(list[i], i); } })); return out; } // eslint-disable-line no-await-in-loop

(async () => {
  const runs = Number(arg('runs', 2));
  const asks = []; for (let r = 0; r < runs; r++) for (const q of Q) asks.push(q);
  const answers = await pool(asks, 3, async ([question, right]) => {
    try {
      const r = await coral().chat({ system: WRITER, messages: [{ role: 'user', content: question }], model: 'deepseek-v4.1-flash', maxTokens: 120, timeoutMs: 30000, effort: 'off' });
      const text = String(r.text || '').trim();
      return text ? { question, text, right: right.test(text) } : null;
    } catch { return null; }
  });
  const got = answers.filter(Boolean);
  const results = {};
  for (const [name, c] of Object.entries(CHECKERS)) {
    const t = [];
    // eslint-disable-next-line no-await-in-loop
    const verdicts = await pool(got, 3, async (a) => {
      const t0 = Date.now();
      try {
        const r = await c.prov().structured({ system: guard.SYSTEMS.general, user: guard.checkUser({ pieces: [a.text], source: `The question was: ${a.question}`, mode: 'general' }), schema: guard.SCHEMA, schemaName: 'submit_check', maxTokens: 500, effort: 'off', model: c.model, timeoutMs: 45000 });
        t.push(Date.now() - t0);
        return r && r.data && Array.isArray(r.data.wrong) ? r.data.wrong.length > 0 : null;
      } catch { return null; }
    });
    const errs = got.map((a, i) => ({ a, v: verdicts[i] }));
    results[name] = {
      answered: verdicts.filter((v) => v !== null).length,
      errors_caught: errs.filter((x) => !x.a.right && x.v === true).length,
      errors_read: errs.filter((x) => !x.a.right && x.v !== null).length,
      false_alarms: errs.filter((x) => x.a.right && x.v === true).length,
      rights_read: errs.filter((x) => x.a.right && x.v !== null).length,
      p50_ms: pct(t, 0.5), p95_ms: pct(t, 0.95),
      verdicts,
    };
    console.log(name, JSON.stringify({ ...results[name], verdicts: undefined }));
  }
  const OUT = arg('out', '');
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ got, results }, null, 1));
  const wrong = got.filter((a) => !a.right);
  console.log(`writer answered ${got.length} of ${asks.length}; pattern says wrong: ${wrong.length}`);
  wrong.forEach((a) => console.log(`WRONG? ${a.question} => ${a.text.slice(0, 160).replace(/\n/g, ' ')}`));
  setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
