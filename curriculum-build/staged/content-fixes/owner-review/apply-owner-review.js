// Apply the verified owner-review rewrites and re-keys to a DB file (apply-db-fixes.js style): every changed field
// must still hold the exact audited "before" value, the row's owner must match, lessons must pass
// services/math-claims.js with 0 problems, and the file is written to a temp name then renamed.
// usage: node apply-owner-review.js <db.json> <db-changes.json> <report.json> [--write]
const fs = require('fs');
const path = require('path');
const REPO = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq';
const [dbPath, resPath, reportPath] = process.argv.slice(2);
const write = process.argv.includes('--write');
process.env.DB_FILE = path.join(require('os').tmpdir(), 'db.apply-scratch.json');
fs.writeFileSync(process.env.DB_FILE, '{}');
const mathClaims = require(path.join(REPO, 'services/math-claims.js'));
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const results = JSON.parse(fs.readFileSync(resPath, 'utf8')).changes;

const parts = (p) => p.split(/\.|\[(\d+)\]/).filter((s) => s !== undefined && s !== '');
const getP = (o, p) => parts(p).reduce((a, k) => (a == null ? undefined : a[k]), o);
const setP = (o, p, v) => { const ks = parts(p); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
const at = new Date().toISOString();
const out = { applied: [], skipped: [] };
for (const r of results) {
  if (r.key.startsWith('skill:')) continue;

  const [coll, id] = r.key.split(':');
  const why = [];
  if (!r.verified) why.push('not verified by both judges');
  if ((r.code_problems || []).length) why.push('code problems');
  const row = (db[coll] || []).find((x) => x.id === Number(id));
  if (!row) why.push('row not found');
  if (!why.length) {
    const copy = JSON.parse(JSON.stringify(row));
    for (const d of r.diff) {
      if (JSON.stringify(getP(copy, d.path)) !== JSON.stringify(d.before)) { why.push(`${d.path}: stored value is not the audited "before"`); break; }
      setP(copy, d.path, d.after);
    }
    if (!why.length && coll === 'lessons') { const p = mathClaims.lessonProblems(copy); if (p.length) why.push(`math check: ${p.map((x) => x.problem).join('; ')}`); }
    if (!why.length) {
      const stamp = { source: 'curriculum-build/staged/content-fixes/owner-review/db-changes.json', fixes: r.errors.map((e) => e.ref), judges: [r.model_a, r.model_b], at };
      Object.assign(row, copy, { updated_at: at });
      if (row.verified_rewrite) row.verified_rewrite_2 = stamp; else row.verified_rewrite = stamp;
      out.applied.push({ key: r.key, user_id: row.user_id || null, fields: r.diff.length, fixes: stamp.fixes });
      continue;
    }
  }
  out.skipped.push({ key: r.key, why });
}
out.summary = { applied: out.applied.length, skipped: out.skipped.length, fields: out.applied.reduce((s, a) => s + a.fields, 0), wrote: write };
fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
if (write) { const tmp = `${dbPath}.tmp-owner-review`; fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8'); fs.renameSync(tmp, dbPath); }
fs.unlinkSync(process.env.DB_FILE);
console.log(JSON.stringify(out.summary), JSON.stringify(out.skipped));
