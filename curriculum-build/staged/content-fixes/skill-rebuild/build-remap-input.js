// Build the input for remap-levels.js: for every basketball and piano grade whose layout changed, the old->new
// level map with a class per level, the old/new path lengths, and the fact-pool units of both layouts.
// usage: node build-remap-input.js <oldTree> <newTree> <out.json>
//   oldTree/newTree: folders holding config/ and content/ (the old snapshot and the rebuilt copy).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [oldTree, newTree, outFile] = process.argv.slice(2);
const TRACKS = ['basketball', 'piano'];
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

function load(tree) {
  const curriculum = require(path.join(tree, 'config', 'curriculum'));
  const LAYOUT = require(path.join(tree, 'config', 'level-layout'));
  return { curriculum, LAYOUT };
}
// Same rule as services/fact-cascade.js unitOf, computed for every unit of a grade.
function units(cur, LAYOUT, trackId, gradeId) {
  const grade = cur.getGrade(trackId, gradeId);
  const kind = (at) => cur.levelKind(at, grade.pathLength, grade);
  const checkpoint = (at) => cur.isCheckpoint(kind(at));
  const out = {};
  let start = 1;
  while (start <= grade.pathLength) {
    let end = start;
    while (end < grade.pathLength && !checkpoint(end)) end++;
    const lessons = [];
    for (let at = start; at <= end; at++) {
      if (kind(at) !== 'lesson') continue;
      const e = LAYOUT.entryFor(grade, at) || {};
      if (/summary/i.test(String(e.type || '')) || /^summary:/i.test(String(e.title || ''))) continue;
      lessons.push(at);
    }
    out[start] = { start, end, lessons };
    start = end + 1;
  }
  return out;
}

const O = load(oldTree);
// The two trees must not share module instances.
Object.keys(require.cache).forEach((k) => { delete require.cache[k]; });
const oldGrades = {};
for (const t of TRACKS) {
  oldGrades[t] = O.curriculum.getTrack(t).grades.map((g) => ({ id: g.id, pathLength: g.pathLength, levels: g.levels.map((l) => ({ ...l })), units: units(O.curriculum, O.LAYOUT, t, g.id) }));
}
Object.keys(require.cache).forEach((k) => { delete require.cache[k]; });
const N = load(newTree);

const GENERIC_OK = new Set(['Lesson', 'Activity']);
const result = { built_at: new Date().toISOString(), content_md5: {}, grades: {} };
for (const t of TRACKS) {
  result.content_md5[`content/${t}-grades.js`] = { old: md5(path.join(oldTree, 'content', `${t}-grades.js`)), new: md5(path.join(newTree, 'content', `${t}-grades.js`)) };
  const ng = N.curriculum.getTrack(t).grades;
  oldGrades[t].forEach((og, gi) => {
    const g = ng[gi];
    if (g.id !== og.id) throw new Error(`grade id changed at ${t} ${gi}`);
    const key = (l) => `${l.type}|${l.title}`;
    const sameAll = og.levels.length === g.levels.length && og.levels.every((l, i) => JSON.stringify(l) === JSON.stringify(g.levels[i]));
    if (sameAll && og.pathLength === g.pathLength) return;
    const nIdx = new Map();
    g.levels.forEach((l) => { if (!nIdx.has(key(l))) nIdx.set(key(l), []); nIdx.get(key(l)).push(l); });
    const oCount = new Map();
    og.levels.forEach((l) => oCount.set(key(l), (oCount.get(key(l)) || 0) + 1));
    const used = new Map();
    const map = {};
    let prevNew = 0;
    for (const l of og.levels) {
      const k = key(l); const c = nIdx.get(k) || [];
      const i = used.get(k) || 0; used.set(k, i + 1);
      const hit = c.length === oCount.get(k) ? c[i] : null;
      if (hit) {
        const cls = hit.covers === l.covers && hit.skill === l.skill ? 'exact' : (GENERIC_OK.has(l.type) ? 'text' : 'approx');
        map[l.level] = { to: hit.level, cls, type: l.type, title: l.title };
        prevNew = hit.level;
      } else {
        // A reflowed row (a Summary whose lessons regrouped): the slot right after the same earlier row.
        map[l.level] = { to: Math.min(prevNew + 1, g.levels.length), cls: 'approx', type: l.type, title: l.title, note: 'reflowed: no row with this title in the new layout' };
        prevNew = map[l.level].to;
      }
    }
    // Units: an old unit maps exactly when its remapped lessons are exactly a new unit's lessons.
    const nUnits = units(N.curriculum, N.LAYOUT, t, g.id);
    const unitMap = {};
    for (const u of Object.values(og.units)) {
      const ls = u.lessons.map((x) => map[x] && map[x].to);
      const exactLessons = u.lessons.every((x) => map[x] && map[x].cls !== 'approx');
      let target = Object.values(nUnits).find((v) => v.lessons.length && JSON.stringify(v.lessons) === JSON.stringify(ls));
      // A unit with no lessons (the path's end) maps by its start.
      if (!u.lessons.length) {
        const s = u.start === og.pathLength ? g.pathLength : (map[u.start] && map[u.start].cls !== 'approx' ? map[u.start].to : null);
        target = s && nUnits[s] && !nUnits[s].lessons.length ? nUnits[s] : null;
      }
      unitMap[u.start] = target && exactLessons
        ? { old: u, new: target, cls: 'exact' }
        : { old: u, new: null, cls: 'approx', note: 'the unit\'s lessons are not one unit in the new layout' };
    }
    const counts = {};
    Object.values(map).forEach((m) => { counts[m.cls] = (counts[m.cls] || 0) + 1; });
    const moved = Object.entries(map).filter(([a, m]) => Number(a) !== m.to).length;
    result.grades[`${t}/${g.id}`] = {
      track: t, grade: g.id, index: gi + 1, old_levels: og.levels.length, new_levels: g.levels.length,
      pathLength: { old: og.pathLength, new: g.pathLength }, moved, counts,
      units: { exact: Object.values(unitMap).filter((u) => u.cls === 'exact').length, approx: Object.values(unitMap).filter((u) => u.cls !== 'exact').length },
      map, unitMap,
    };
  });
}
fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
for (const [k, v] of Object.entries(result.grades)) console.log(k, `levels ${v.old_levels}->${v.new_levels}`, `path ${v.pathLength.old}->${v.pathLength.new}`, `moved ${v.moved}`, JSON.stringify(v.counts), `units exact ${v.units.exact} approx ${v.units.approx}`);
console.log(JSON.stringify(result.content_md5));
