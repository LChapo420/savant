// Remap stored basketball/piano level numbers after the 2026-10-24 skill-curriculum rebuild
// (B04 +1 lesson, B05 +1 lesson, P05 +1 lesson, P04 two lessons swapped; summaries and quizzes reflowed).
//
// usage: node remap-levels.js <db.json> <remap-input.json> <report.json> [--write] [--allow-approx] [--repo <path>]
//
// - Every object that names an affected grade (track_id + grade_id) has its own level fields remapped:
//   level, current_level, target_level (the path's end maps to the new path's end), and for fact_pools
//   key/start/end/lessons by unit. Self-describing strings anywhere are remapped too:
//   "<track>/<grade>/<N>" (learner-record fact levels), "<grade>:L<N>" (objective ids) and
//   "<track>:<grade>:<N>" (unit keys). "Level N" in a context object's `conclusion` is rewritten.
// - A level maps "exact" (same row, same text), "text" (the same lesson or activity, its wording updated)
//   or "approx" (a summary, quiz or tester whose lessons regrouped). Approx maps are listed and block
//   --write unless --allow-approx; on content rows (plans, lessons, games, pools) they are always refused.
// - Each changed row gets level_remap: {id, at, changes}; a row already stamped is left alone, so a second
//   run changes nothing. With --write, refuses unless the repo's content files are the rebuilt ones,
//   and writes to a temp file then renames (JSON, 2-space indent, as config/db.js writes).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const [dbPath, inputPath, reportPath] = args;
const WRITE = args.includes('--write');
const ALLOW_APPROX = args.includes('--allow-approx');
const REPO = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq';
const STAMP = 'skill-rebuild-2026-10-24';
const CONTENT_TABLES = new Set(['block_plans', 'lessons', 'game_payloads', 'level_edits', 'fact_pools', 'content_cache', 'placement_question_sets']);
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const raw = fs.readFileSync(dbPath);
const db = JSON.parse(raw.toString('utf8'));
const G = input.grades; // "track/grade" -> { map, unitMap, pathLength }
const byGrade = new Map(Object.values(G).map((g) => [g.grade, g]));

const report = { db: dbPath, md5_before: md5(raw), md5_after: null, wrote: false, stamp: STAMP,
  content_live: {}, rows_changed: 0, fields_changed: 0, by_table: {}, by_class: {}, approx: [], refused: [], already_stamped: [], unknown: [], text_mentions_left: [], changes: [] };

// Is the rebuilt content live in the repo?
let contentLive = true;
for (const [rel, m] of Object.entries(input.content_md5)) {
  const f = path.join(REPO, rel);
  const now = fs.existsSync(f) ? md5(fs.readFileSync(f)) : null;
  report.content_live[rel] = { now, expected_new: m.new, is_new: now === m.new, is_old: now === m.old };
  if (now !== m.new) contentLive = false;
}

function mapLevel(g, n, field) {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return null;
  const v = Number(n);
  if (field === 'target_level' && v === g.pathLength.old) return { to: g.pathLength.new, cls: 'exact', why: 'path end' };
  if (v === g.pathLength.old) return { to: g.pathLength.new, cls: 'exact', why: 'path end' };
  const m = g.map[v];
  if (!m) return { to: null, cls: 'unknown' };
  return { to: m.to, cls: m.cls, title: m.title, type: m.type };
}

for (const [table, rows] of Object.entries(db)) {
  if (!Array.isArray(rows)) continue;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const changes = [];
    let refuse = null;
    const note = (p, from, to, m) => {
      changes.push({ path: p, from, to, cls: m.cls, ...(m.type ? { type: m.type, title: m.title } : {}) });
      if (m.cls === 'approx') {
        report.approx.push({ table, id: row.id, path: p, from, to, type: m.type, title: m.title });
        if (CONTENT_TABLES.has(table)) refuse = `${p}: ${from} is a regrouped ${m.type || 'row'}; stored content there would not match the new row`;
      }
      if (m.cls === 'unknown') { report.unknown.push({ table, id: row.id, path: p, from }); refuse = `${p}: ${from} is not a level of the old layout`; }
    };
    const strMap = (s, p) => {
      let out = s;
      // track/grade/N
      out = out.replace(/\b(basketball|piano)\/((?:basketball|piano)_[a-z0-9_]+)\/(\d+)\b/g, (all, t, gid, n) => {
        const g = byGrade.get(gid); if (!g) return all;
        const m = mapLevel(g, n); if (!m || m.to === null) { note(p, all, null, m || { cls: 'unknown' }); return all; }
        if (m.to === Number(n)) return all;
        note(p, all, `${t}/${gid}/${m.to}`, m); return `${t}/${gid}/${m.to}`;
      });
      // grade:LN objective ids
      out = out.replace(/\b((?:basketball|piano)_[a-z0-9_]+):L(\d+)\b/g, (all, gid, n) => {
        const g = byGrade.get(gid); if (!g) return all;
        const m = mapLevel(g, n); if (!m || m.to === null) { note(p, all, null, m || { cls: 'unknown' }); return all; }
        if (m.to === Number(n)) return all;
        note(p, all, `${gid}:L${m.to}`, m); return `${gid}:L${m.to}`;
      });
      // track:grade:N unit keys (fact_pools keys are handled with their unit below)
      if (!(table === 'fact_pools' && p === 'key')) {
        out = out.replace(/\b(basketball|piano):((?:basketball|piano)_[a-z0-9_]+):(\d+)\b/g, (all, t, gid, n) => {
          const g = byGrade.get(gid); if (!g) return all;
          const m = mapLevel(g, n); if (!m || m.to === null) { note(p, all, null, m || { cls: 'unknown' }); return all; }
          if (m.to === Number(n)) return all;
          note(p, all, `${t}:${gid}:${m.to}`, m); return `${t}:${gid}:${m.to}`;
        });
      }
      return out;
    };
    const walk = (node, p) => {
      if (Array.isArray(node)) { node.forEach((v, i) => { if (typeof v === 'string') { const s = strMap(v, `${p}[${i}]`); if (s !== v) node[i] = s; } else if (v && typeof v === 'object') walk(v, `${p}[${i}]`); }); return; }
      const g = byGrade.get(node.grade_id);
      const ctx = g && node.track_id === g.track ? g : (g && table === 'piano_song_results' ? null : null);
      if (ctx) {
        for (const f of ['level', 'current_level', 'target_level']) {
          if (node[f] === undefined || node[f] === null) continue;
          const m = mapLevel(ctx, node[f], f);
          if (!m) continue;
          if (m.to === null) { note(p ? `${p}.${f}` : f, node[f], null, m); continue; }
          if (m.to !== Number(node[f]) || m.cls === 'approx') note(p ? `${p}.${f}` : f, node[f], m.to, m);
          if (m.to !== Number(node[f])) {
            if (f === 'level' && typeof node.conclusion === 'string') {
              const re = new RegExp(`\\bLevel ${node[f]}\\b`, 'g');
              if (re.test(node.conclusion)) { const c = node.conclusion.replace(re, `Level ${m.to}`); changes.push({ path: p ? `${p}.conclusion` : 'conclusion', from: `Level ${node[f]}`, to: `Level ${m.to}`, cls: m.cls }); node.conclusion = c; }
            }
            node[f] = m.to;
          }
        }
        if (table === 'fact_pools' && !p) {
          const u = ctx.unitMap[node.start];
          if (!u) { report.unknown.push({ table, id: row.id, path: 'start', from: node.start }); refuse = `start ${node.start} is not a unit of the old layout`; }
          else if (JSON.stringify(u.old.lessons) !== JSON.stringify(node.lessons) || u.old.end !== node.end) { refuse = 'stored unit is not the old layout\'s unit at this start (already remapped, or written under another layout)'; }
          else if (u.cls !== 'exact') { refuse = `unit ${node.start}-${node.end}: ${u.note}`; report.approx.push({ table, id: row.id, path: 'unit', from: node.start, note: u.note }); }
          else if (u.new.start !== node.start || u.new.end !== node.end) {
            const key = `${ctx.track}:${ctx.grade}:${u.new.start}`;
            changes.push({ path: 'key', from: node.key, to: key, cls: 'exact' }, { path: 'start', from: node.start, to: u.new.start, cls: 'exact' }, { path: 'end', from: node.end, to: u.new.end, cls: 'exact' }, { path: 'lessons', from: node.lessons, to: u.new.lessons, cls: 'exact' });
            node.key = key; node.start = u.new.start; node.end = u.new.end; node.lessons = u.new.lessons.slice();
          }
        }
      }
      for (const [k, v] of Object.entries(node)) {
        if (k === 'level_remap') continue;
        if (typeof v === 'string') { const s = strMap(v, p ? `${p}.${k}` : k); if (s !== v) node[k] = s; } else if (v && typeof v === 'object') walk(v, p ? `${p}.${k}` : k);
      }
    };

    if (row.level_remap && row.level_remap.id === STAMP) {
      // Already done: only check it is still consistent (nothing to do).
      report.already_stamped.push({ table, id: row.id });
      continue;
    }
    const copy = JSON.parse(JSON.stringify(row));
    walk(copy, '');
    if (!changes.length) continue;
    if (refuse) { report.refused.push({ table, id: row.id, why: refuse, changes }); continue; }
    // Text that still names an old level of this row's grade (left as written; listed for review).
    const g = byGrade.get(row.grade_id);
    if (g && row.track_id === g.track) {
      const olds = changes.filter((c) => /(^|\.)level$/.test(c.path)).map((c) => c.from);
      const s = JSON.stringify(copy);
      for (const o of olds) if (new RegExp(`\\b[Ll]evel ${o}\\b`).test(s)) report.text_mentions_left.push({ table, id: row.id, level: o });
    }
    copy.level_remap = { id: STAMP, at: new Date().toISOString(), changes: changes.map(({ path: pp, from, to, cls }) => ({ path: pp, from, to, cls })) };
    Object.keys(row).forEach((k) => delete row[k]);
    Object.assign(row, copy);
    report.rows_changed += 1;
    report.fields_changed += changes.length;
    report.by_table[table] = (report.by_table[table] || 0) + 1;
    changes.forEach((c) => { report.by_class[c.cls] = (report.by_class[c.cls] || 0) + 1; });
    report.changes.push({ table, id: row.id, user_id: row.user_id ?? null, track_id: row.track_id || null, grade_id: row.grade_id || null, changes });
  }
}

const blockers = [];
if (report.refused.length) blockers.push(`${report.refused.length} row(s) refused`);
if (report.unknown.length) blockers.push(`${report.unknown.length} unknown level(s)`);
if (report.approx.length && !ALLOW_APPROX) blockers.push(`${report.approx.length} approximate map(s) (pass --allow-approx after review)`);
if (WRITE && !contentLive) blockers.push('the rebuilt content files are not live in the repo (content/basketball-grades.js, content/piano-grades.js)');
report.blockers = blockers;
const out = Buffer.from(JSON.stringify(db, null, 2), 'utf8');
report.md5_after = md5(out);
if (WRITE && !blockers.length) {
  const tmp = `${dbPath}.tmp-level-remap`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, dbPath);
  report.wrote = true;
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ db: path.basename(dbPath), rows_changed: report.rows_changed, fields_changed: report.fields_changed, by_table: report.by_table, by_class: report.by_class, approx: report.approx.length, refused: report.refused.length, unknown: report.unknown.length, already_stamped: report.already_stamped.length, text_mentions_left: report.text_mentions_left.length, content_live: contentLive, blockers, wrote: report.wrote, md5_before: report.md5_before, md5_after: report.md5_after }));
if (WRITE && blockers.length) process.exitCode = 2;
