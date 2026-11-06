#!/usr/bin/env node
/**
 * Step 5: what is wrong in the shared lessons today. Readers: Kimi K3.1 Pro, plus grok-4.3 and GLM-5.3 Flash, on the unmodified stored text (a copy). A finding counts when two rulers of
 * other families agree: Sonnet and GLM-5.3 (for GLM flash's own flags too, a different model). Output docs/fact-gate/audit-live.json. Nothing here writes to live data.
 */
const L = require('./lib');
const { placeOf, words } = require('./scoring');

const flagKey = (f) => `${placeOf(f.where) ? `${placeOf(f.where).word}${placeOf(f.where).index}` : '?'}|${words(f.claim).slice(0, 8).join(' ')}`;
const raw = L.path.join(L.TMP, 'raw');
const dec = (d) => new Map(L.readJsonl(L.path.join(raw, `${d}.decisions.jsonl`)).map((r) => [r.key, r]));
const S = dec('sonnet'); const G = dec('glm53');
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const rows = new Map();
for (const j of ['kimi31', 'grok43', 'glm_flash_zgpu']) {
  for (const r of L.readJsonl(L.path.join(raw, `${j}.jsonl`))) {
    if (!r.read || !r.id.startsWith('clean:')) continue;
    for (const f of r.flags) {
      const k = `${r.id}|${flagKey(f)}`;
      if (!rows.has(k)) rows.set(k, { level: r.level, where: f.where, quote: f.claim, why: f.why, truth: f.truth, by: [j], sonnet: S.get(k) ? S.get(k).real : null, glm53: G.get(k) ? G.get(k).real : null, sonnet_reason: S.get(k) ? S.get(k).reason : null });
      else if (!rows.get(k).by.includes(j)) rows.get(k).by.push(j);
    }
  }
}
const all = [...rows.values()];
const status = (x) => (x.sonnet === true && x.glm53 === true ? 'confirmed' : x.sonnet === true || x.glm53 === true ? 'one ruler' : x.sonnet === false && x.glm53 === false ? 'false alarm' : x.sonnet === false ? 'false alarm (sonnet)' : 'unruled');
all.forEach((x) => { x.status = status(x); });
const byLevel = {};
for (const x of all) (byLevel[x.level] = byLevel[x.level] || []).push(x);
const inDb = (id) => levels.get(id) && levels.get(id).source === 'db';
const groups = {};
for (const lv of levels.values()) {
  const g = `${lv.track}/${lv.grade}`;
  groups[g] = groups[g] || { levels: 0, withConfirmed: 0, confirmed: 0, one: 0, checked: 0, live: lv.source === 'db' };
  groups[g].levels++;
  if (lv.verification && lv.verification.status === 'verified') groups[g].checked++;
  const list = byLevel[lv.id] || [];
  const c = list.filter((x) => x.status === 'confirmed').length;
  groups[g].confirmed += c; groups[g].one += list.filter((x) => x.status === 'one ruler').length;
  if (c) groups[g].withConfirmed++;
}
const counts = all.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
console.log(JSON.stringify(counts));
for (const [g, v] of Object.entries(groups)) console.log(`${g.slice(0, 40).padEnd(40)} levels ${String(v.levels).padStart(2)} checked-before ${String(v.checked).padStart(2)} with confirmed ${String(v.withConfirmed).padStart(2)} confirmed ${String(v.confirmed).padStart(3)} one-ruler ${v.one}`);
const liveLevels = [...levels.values()].filter((l) => l.source === 'db').length;
const liveWith = Object.keys(byLevel).filter((id) => inDb(id) && byLevel[id].some((x) => x.status === 'confirmed')).length;
console.log(`live shared levels ${liveLevels}: ${liveWith} with a confirmed error, ${all.filter((x) => inDb(x.level) && x.status === 'confirmed').length} confirmed errors`);
L.writeJson(L.path.join(L.DOCS, 'audit-live.json'), { built: '2026-11-06', method: 'AI-judged on a copy; readers kimi k3.1 pro, grok-4.3, glm-5.3 flash; rulers sonnet 5.5 and glm-5.3; confirmed = both rulers say real; sample read by hand', groups, findings: all.sort((a, b) => (a.level < b.level ? -1 : 1)) });
