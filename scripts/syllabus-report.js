/**
 * Print every level of every grade, in the order a learner meets them.
 *
 *   npm run syllabus              every grade, a summary per grade
 *   npm run syllabus -- english   just the grades whose id contains "english",
 *                                  and every level listed in order
 *
 * Two kinds of grade, and the report checks each by its own rule.
 *
 * A grade that **names its levels** — all sixteen English grades, from the
 * creator's sheet — has 382 to 766 of them, and only some are lessons. The other
 * 332 in the kindergarten grade are Testers, Activities, quizzes and an exam, and
 * reporting them as "332 topics never taught" was the report describing a level as
 * a topic and then wondering why no lesson mentioned it. What is checked here is
 * the thing the sheet promises: every level it names is on the path, with its own
 * title and its own coverage, and every lesson on it teaches it.
 *
 * A grade on the **rule** — the other fourteen, whose layout is arithmetic — has
 * one lesson per topic, and the checks are the ones that always applied: every
 * topic reached, in order, first lesson first, last lesson last, and exactly one
 * lesson per topic.
 *
 * Exits non-zero when a grade fails any of those, so it can gate a release the
 * same way `check` and `test` do.
 */
const curriculum = require('../config/curriculum');
const layout = require('../config/level-layout');
const topics = require('../content/topics');

const filter = process.argv[2] || null;
let problems = 0;

/** The one line under a grade's name. */
function summaryFor(grade, trackId, lessons) {
  const stated = layout.statedIndex(grade);
  const kinds = new Map();
  if (stated) {
    for (const e of stated.byLevel.values()) kinds.set(e.kind, (kinds.get(e.kind) || 0) + 1);
    const named = [...kinds].map(([k, n]) => `${k} ${n}`).join(', ');
    return `path ${grade.pathLength} levels, ${stated.byLevel.size} named by the sheet, `
      + `${lessons} taught lessons\n     ${named}`;
  }
  return `path ${grade.pathLength} levels, ${topics.gradeOutline(grade, trackId).length} topics, `
    + `${lessons} lessons (one per topic)`;
}

for (const track of curriculum.TRACKS) {
  for (const grade of track.grades) {
    const label = `${track.id}/${grade.id}`;
    if (filter && !label.includes(filter) && !grade.id.includes(filter)) continue;

    const stated = layout.statedIndex(grade);
    const rows = [];
    for (let level = 1; level <= grade.pathLength; level++) {
      const entry = stated ? stated.byLevel.get(level) : null;
      const t = topics.topicFor(
        grade, level, curriculum.levelPlan(grade, level).focus, track.id,
      );
      rows.push({
        level,
        kind: curriculum.levelKind(level, grade.pathLength, grade),
        type: entry ? entry.type : (curriculum.levelKind(level, grade.pathLength, grade) === 'lesson' ? 'Lesson' : ''),
        title: entry ? entry.title : (t ? t.topic : null),
        covers: t ? t.covers : null,
      });
    }

    const faults = [];

    if (stated) {
      // A level the sheet names but the path does not have, or has as something
      // other than what the sheet says it is.
      for (const [level, entry] of stated.byLevel) {
        if (level >= grade.pathLength) {
          faults.push(`level ${level} is named by the sheet but the path ends at ${grade.pathLength - 1}`);
          continue;
        }
        const served = rows[level - 1];
        if (!served || served.title !== entry.title) {
          faults.push(`level ${level} serves "${served ? served.title : 'nothing'}",`
            + ` not "${entry.title}"`);
        }
        if (served && served.covers !== entry.covers) {
          faults.push(`level ${level} has different coverage from the sheet`);
        }
        if (served && served.kind !== entry.kind) {
          faults.push(`level ${level} is ${served.kind}, the sheet says ${entry.kind}`);
        }
      }
      // A lesson on a level the sheet does not name: an app that invented a
      // lesson the course did not write.
      for (const r of rows) {
        if (r.kind === 'lesson' && !stated.byLevel.has(r.level)) {
          faults.push(`level ${r.level} is a lesson the sheet did not write`);
        }
      }
    } else {
      // The rule-shaped checks: one lesson per topic, all reached, in order.
      const outline = topics.gradeOutline(grade, track.id);
      const names = outline.map((o) => o.topic);
      const lessons = rows.filter((r) => r.kind === 'lesson');
      const taught = new Set(lessons.map((r) => r.title));
      const missed = names.filter((n) => !taught.has(n));
      for (const m of missed.slice(0, 5)) faults.push(`"${m}" is never taught`);
      if (lessons.length !== names.length) {
        faults.push(`${lessons.length} lessons for ${names.length} topics`);
      }
      if (lessons[0] && lessons[0].title !== names[0]) {
        faults.push(`first lesson is "${lessons[0].title}", not "${names[0]}"`);
      }
      if (lessons.length && lessons[lessons.length - 1].title !== names[names.length - 1]) {
        faults.push(`last lesson is "${lessons[lessons.length - 1].title}",`
          + ` not "${names[names.length - 1]}"`);
      }
      let lastAt = -1;
      for (const l of lessons) {
        const at = names.indexOf(l.title);
        if (at < lastAt) faults.push(`order breaks at level ${l.level} ("${l.title}")`);
        lastAt = at;
      }
    }

    if (faults.length) problems++;
    console.log(`${faults.length ? 'FAIL' : 'ok  '} ${label}  ${grade.name}`);
    console.log(`     ${summaryFor(grade, track.id, rows.filter((r) => r.kind === 'lesson').length)}`);
    for (const f of faults.slice(0, 8)) console.log(`     ${f}`);
    if (faults.length > 8) console.log(`     ... and ${faults.length - 8} more`);

    if (filter) {
      console.log('\n     every level, in order:');
      for (const r of rows) {
        const kind = r.type || (r.kind === 'lesson' ? 'Lesson' : r.kind);
        console.log(`     ${String(r.level).padStart(5)}  ${kind.padEnd(20)} ${r.title}`);
        if (r.covers) console.log(`            ${r.covers}`);
      }
      console.log('');
    }
  }
}

console.log(problems
  ? `${problems} grade(s) with a problem`
  : 'every grade: every level served with its own title and coverage, and every'
    + ' lesson teaching the level it is on');
process.exit(problems ? 1 : 0);
