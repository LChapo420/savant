#!/usr/bin/env node
/**
 * Markdown tables from load run reports.
 *   node scripts/beta-load/report-table.js label=<report.json> [label=<report.json> ...] [--routes 10]
 */
const fs = require('fs');

const args = process.argv.slice(2);
const i = args.indexOf('--routes');
const ROUTES = i >= 0 ? Number(args[i + 1]) : 10;
const runs = args.filter((a) => a.includes('=')).map((a) => { const [label, f] = a.split('='); return { label, r: JSON.parse(fs.readFileSync(f, 'utf8')) }; });
console.log('| Run | Requests/s | p50 ms | p95 ms | p99 ms | Without the lesson wait: p50 / p95 / p99 ms | 5xx or dropped | Loop stalls over 1 s | Longest stall ms | Server CPU s / wall s | ms CPU per request | Save share of time | Peak memory MB | Store MB at end | Box CPU |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const { label, r } of runs) {
  const o = r.overall; const p = r.probe || {}; const q = o.without_lesson_wait || {};
  console.log(`| ${label} | ${o.rps} | ${o.p50} | ${o.p95} | ${o.p99} | ${q.p50 === undefined ? 'n/a' : `${q.p50} / ${q.p95} / ${q.p99}`} | ${o.server_errors} | ${p.secs_with_stall_over_1s} | ${p.lag_max_ms} | ${p.cpu_s} / ${p.wall_s} | ${r.cpu_ms_per_request} | ${p.save_share_of_time} | ${p.rss_mb_max} | ${Math.round((r.db_bytes_end || 0) / 1048576)} | ${p.box_cpu_median} |`);
}
for (const { label, r } of runs) {
  console.log(`\n**${label}**\n\n| Route | n | p50 | p95 | p99 | max | Statuses |\n|---|---|---|---|---|---|---|`);
  for (const x of r.routes.slice().sort((a, b) => b.n - a.n).slice(0, ROUTES)) console.log(`| ${x.route.replace(/\|/g, '/')} | ${x.n} | ${x.p50} | ${x.p95} | ${x.p99} | ${x.max} | ${Object.entries(x.statuses).map(([k, v]) => `${k}: ${v}`).join(', ')} |`);
}
