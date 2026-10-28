// Learner names never leave this machine: a lesson written for one learner may address
// them by name, so the row's own learner's display name is replaced before any text is
// sent to a model.
const fs = require('fs');

let names = null;
function load(dbCopy) {
  const db = JSON.parse(fs.readFileSync(dbCopy, 'utf8'));
  names = new Map(db.users.map((u) => [u.id, String(u.display_name || '').trim()]));
  return db;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function redact(text, userIds) {
  let t = String(text == null ? '' : text);
  if (!names) return t;
  for (const id of [].concat(userIds || [])) {
    const full = names.get(id);
    if (!full || full.length < 2) continue;
    const parts = [full, ...full.split(/\s+/).filter((p) => p.length >= 2)];
    for (const p of parts) t = t.replace(new RegExp(`\\b${esc(p)}\\b`, 'gi'), 'the learner');
  }
  return t;
}
module.exports = { load, redact };
