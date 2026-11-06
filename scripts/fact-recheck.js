#!/usr/bin/env node
/**
 * Read a sample of the text stored before the fact guard (services/fact-recheck.js) on a DB COPY, with real checkers on prepaid credits, and report what it finds and
 * what the full run would cost. Reports only; deletes nothing. A model's verdicts, not proof of error: read them. Not part of npm test.
 *
 *   DB_FILE=copy.json node -r ./scripts/fact-guard-tap.js scripts/fact-recheck.js --sample 100 [--seed 4242] [--out FILE]
 */
const fs = require('fs');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
if (!process.env.DB_FILE || /[\\/]data[\\/]db\.json$/.test(process.env.DB_FILE)) { console.error('Needs DB_FILE pointing at a copy.'); process.exit(2); }
require('../services/run-cap').defaultCap(5);
const recheck = require('../services/fact-recheck');

const SAMPLE = Number(arg('sample', 100)); const SEED = Number(arg('seed', 4242)); const OUT = arg('out', '');
let x = SEED; const rnd = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
const shuffled = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

(async () => {
  const counts = Object.fromEntries(recheck.KINDS.map((k) => [k, recheck.rows(k).length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // Games are few and large, so they get a share of their own rather than their share of rows.
  const share = { game: Math.min(counts.game, Math.round(SAMPLE * 0.15)), lesson: Math.min(counts.lesson, Math.round(SAMPLE * 0.25)) };
  share.item = SAMPLE - share.game - share.lesson;
  const todo = recheck.KINDS.flatMap((k) => shuffled(recheck.rows(k)).slice(0, share[k]).map((row) => ({ kind: k, row })));
  const per = Object.fromEntries(recheck.KINDS.map((k) => [k, { read: 0, failed: 0, pieces: 0, findings: 0, rows_flagged: 0, usd: 0, ms: 0 }]));
  const found = [];
  let next = 0;
  await Promise.all(Array.from({ length: Number(arg('width', 4)) }, async () => {
    while (next < todo.length) {
      const { kind, row } = todo[next++];
      const r = await recheck.checkRow(kind, row).catch((e) => ({ ran: false, error: e.message })); // eslint-disable-line no-await-in-loop
      const p = per[kind];
      if (!r.ran) { p.failed++; continue; }
      p.read++; p.pieces += r.pieces; p.findings += r.findings.length; p.rows_flagged += r.findings.length ? 1 : 0; p.usd += r.usd; p.ms += r.ms;
      if (r.findings.length) found.push(...r.findings.map((f) => { const piece = recheck.piecesOf(kind, row).find((q) => q.ref === f.ref); return { ...f, text: piece ? piece.text.slice(0, 900) : '' }; }));
    }
  }));
  let full = 0;
  for (const k of recheck.KINDS) { const p = per[k]; if (p.read) { p.usd_per_row = p.usd / p.read; full += p.usd_per_row * counts[k]; } }
  const summary = { sample: todo.length, total_rows: total, counts, per, full_run_usd_estimate: Number(full.toFixed(3)), report: recheck.report() };
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, found }, null, 1));
  console.log(JSON.stringify(summary));
  setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
