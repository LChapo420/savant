#!/usr/bin/env node
/**
 * The real-tester check for docs/SPEED-4X.md: what does one answer really teach, and how long does it really take? Reads a COPY of a database (DB argument), writes nothing, and
 * prints only counts, quantiles and fitted slopes, never an email, an answer or a row. Never reads the owner's learner account or a test-looking account.
 *   node scripts/speed-rate-check.js DB.json
 * Slope: an additive factors fit (Cen, Koedinger and Junker 2006; used by Koedinger et al. 2023): logit P(right) = learner + skill + slope x earlier answers on that skill.
 * Compare with the simulation: its audited rate goes from 50% to 89% right in about 8 answers, about 0.26 logits an answer, against about 0.1 reported across 27 datasets (secondary sources, docs/SPEED-4X.md).
 */
const fs = require('fs');

const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OWNER = 6689;
const all = (t) => (Array.isArray(t) ? t : Object.values(t || {}));
const users = new Map(all(d.users).map((u) => [u.id, u]));
const testLike = (u) => !u || /example|test|sim|demo|fake|\.local/i.test(String(u.email || ''));
const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rows = all(d.items).filter((i) => i.user_id !== OWNER && !testLike(users.get(i.user_id)) && (i.correct === true || i.correct === false) && !i.skipped && !i.reserved && Number(i.ms) > 0 && Number(i.ms) < 600000)
  .filter((i) => i.ms % 500 !== 0) // whole half-seconds are scripted runs
  .sort((a, b) => Number(a.id) - Number(b.id));
const nUsers = new Set(rows.map((i) => i.user_id)).size;
console.log(`answers ${rows.length} from ${nUsers} learner(s).${nUsers < 30 ? ' TOO FEW to generalise: fewer than 30 learners.' : ''}`);
const secs = rows.map((i) => i.ms / 1000);
console.log(`seconds to answer (excludes reading feedback): p25 ${q(secs, 0.25).toFixed(1)} median ${q(secs, 0.5).toFixed(1)} p75 ${q(secs, 0.75).toFixed(1)} p90 ${q(secs, 0.9).toFixed(1)}. The simulation assumes 35.`);
const seen = new Map(); const X = [];
for (const i of rows) { const key = `${i.user_id}|${i.skill_id}`; const n = seen.get(key) || 0; seen.set(key, n + 1); X.push({ u: i.user_id, s: i.skill_id, n, y: i.correct ? 1 : 0 }); }
const uI = new Map(); const sI = new Map();
for (const x of X) { if (!uI.has(x.u)) uI.set(x.u, 0); if (!sI.has(x.s)) sI.set(x.s, 0); }
let slope = 0; const lr = 0.05; const ridge = 0.01;
for (let it = 0; it < 600 && X.length; it++) {
  const gU = new Map(); const gS = new Map(); let gB = 0; let nB = 0;
  for (const x of X) { const z = uI.get(x.u) + sI.get(x.s) + slope * x.n; const e = x.y - 1 / (1 + Math.exp(-z)); gU.set(x.u, (gU.get(x.u) || 0) + e); gS.set(x.s, (gS.get(x.s) || 0) + e); gB += e * x.n; nB += x.n * x.n; }
  for (const [k, v] of gU) uI.set(k, uI.get(k) + lr * (v / Math.max(1, X.filter((x) => x.u === k).length) - ridge * uI.get(k)));
  for (const [k, v] of gS) sI.set(k, sI.get(k) + lr * (v / Math.max(1, X.filter((x) => x.s === k).length) - ridge * sI.get(k)));
  if (nB) slope += (0.1 * gB) / nB;
}
const multi = [...seen.values()].filter((n) => n >= 2).length;
console.log(`learner-skill pairs with 2 or more answers: ${multi}. Fitted gain per answer: ${slope.toFixed(3)} logits (only meaningful with many learners).`);
