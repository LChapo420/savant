// Generate content/spanish-grades.js from the Spanish fluency path CSV.
// The nine source cells are retained verbatim in each level's `columns` object.
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./build-sheet-track');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'Spanish_Fluency_Path.csv');
const OUT = path.join(ROOT, 'content', 'spanish-grades.js');
const STRIDE = 9;
const FIRST_IDS = ['entry', 'intermediate', 'advanced'];

const HEADERS = [
  'Level #', 'Level Type', 'Activity', 'Unit', 'Node', 'Skill Focus', 'Path',
  'What Happens', 'Est. Min',
];

const SKILL_RULES = [
  [/\bsubjunctive\b|\bsubjuntivo\b/i, 'es_subjunctive'],
  [/\bpreterite\b|\bpreterit\b|\bpret[eé]rito\b|\bpast tense\b|\bpast simple\b/i, 'es_preterite'],
  [/\bimperfect\b|\bimperfecto\b/i, 'es_imperfect'],
  [/\bobject pronoun|direct object|indirect object|clitic|pronoun placement\b/i, 'es_object_pron'],
  [/\bser\b.*\bestar\b|\bestar\b.*\bser\b|\bser vs\.? estar\b/i, 'es_ser_estar'],
  [/\bquestion|interrogative|negation|negative sentence/i, 'es_questions'],
  [/\b(gender|article|masculine|feminine)\b/i, 'es_gender'],
  [/\badjective|agreement|plural/i, 'es_adjectives'],
  [/\bnumber|counting|date|time|clock|ordinal|cardinal/i, 'es_numbers'],
  [/\btranslation|translating|translator|interpreting|mediation|literature|rhetoric|essay|academic|research|dialect|register|idiom|pragmatic|linguistic|professional writing|argumentation/i, 'es_translate'],
  [/\b(ar|regular -ar) verbs?\b|present tense.*-ar|conjugat.*-ar|\bar verb|\b-ar\b/i, 'es_present_ar'],
  [/\b(er|ir|regular -er|regular -ir) verbs?\b|present tense.*-(er|ir)|conjugat.*-(er|ir)|\b(er|ir) verb|\b-(er|ir)\b/i, 'es_present_erir'],
  [/\bverb|conjugat|present tense|stem-changing|irregular form/i, 'es_present_ar'],
  [/\bser\b|\bestar\b/i, 'es_ser_estar'],
  [/\bgreet|goodbye|courtesy|polite|pronunciation|phonetic|vowel|sound/i, 'es_greetings'],
  [/\bvocab|word|lexic|cognate|idiom|phrase|food|family|home|travel|shopping|body|health|clothing|work|school|environment/i, 'es_vocab_core'],
];

function skillFor(level) {
  const text = `${level.title} ${level.skillFocus} ${level.covers}`;
  for (const [pattern, skill] of SKILL_RULES) {
    if (pattern.test(text)) return skill;
  }
  return 'es_vocab_core';
}

function gradeName(heading) {
  const match = heading.match(/(?:^| - )Grade\s+\d+\s*:\s*(.*?)(?:\s+-\s+(?:Pre-A1|A[12](?:\.\d+)?|B[12](?:\.\d+)?|C[12](?:\.\d+)?|Track:).*)?$/i);
  return (match && match[1] ? match[1] : heading)
    .replace(/\s+-\s+target known lemmas.*$/i, '')
    .trim();
}

function gradeId(heading, index) {
  if (index < FIRST_IDS.length) return FIRST_IDS[index];
  const name = gradeName(heading).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 54)
    .replace(/_+$/g, '');
  return `spanish_grade_${String(index + 1).padStart(2, '0')}_${name || 'course'}`;
}

function tierFor(heading) {
  const cefr = heading.match(/\b([ABC])([12])(?:\.\d+)?\b/i);
  if (!cefr) return 5;
  const letter = cefr[1].toUpperCase();
  return letter === 'A' ? 1 : letter === 'B' ? 3 : 5;
}

function readSpanishSheet(src = SRC) {
  const rows = parseCsv(fs.readFileSync(src, 'utf8'));
  const header = rows[1] || [];
  if (header.length !== 57 * STRIDE) {
    throw new Error(`${src}: expected 57 nine-column grade blocks, found ${header.length} columns`);
  }

  const grades = [];
  for (let g = 0; g < header.length / STRIDE; g++) {
    const base = g * STRIDE;
    const heading = String((rows[0] || [])[base] || '').replace(/^\uFEFF/, '').trim();
    if (!heading) throw new Error(`${src}: missing grade heading in block ${g + 1}`);
    const blockHeaders = header.slice(base, base + STRIDE).map((value) => String(value || '').trim());
    if (blockHeaders.join('\u0000') !== HEADERS.join('\u0000')) {
      throw new Error(`${src}: unexpected column headers in ${heading}`);
    }

    const levels = [];
    for (let r = 2; r < rows.length; r++) {
      const raw = (rows[r] || []).slice(base, base + STRIDE);
      if (raw.every((value) => !String(value || '').trim())) continue;
      const level = Number(String(raw[0] || '').trim());
      const type = String(raw[1] || '').trim();
      const title = String(raw[4] || '').trim();
      if (!Number.isInteger(level) || level !== levels.length + 1) {
        throw new Error(`${heading}: expected level ${levels.length + 1} at CSV row ${r + 1}, got ${raw[0]}`);
      }
      if (!type || !title) throw new Error(`${heading}: incomplete level ${level} at CSV row ${r + 1}`);

      const columns = Object.fromEntries(blockHeaders.map((key, i) => [key, String(raw[i] || '')]));
      levels.push({
        level,
        type,
        kind: type === 'Lesson' ? 'lesson' : 'practice',
        teaches: type === 'Lesson',
        activity: columns.Activity,
        unit: columns.Unit,
        node: columns.Node,
        skillFocus: columns['Skill Focus'],
        path: columns.Path,
        title,
        topic: title,
        covers: columns['What Happens'],
        minutes: columns['Est. Min'],
        columns,
      });
    }
    if (!levels.length) throw new Error(`${heading}: no levels found`);
    const finalTest = levels.find((row) => row.type === 'Final Test');
    if (finalTest) {
      finalTest.kind = finalTest.level === levels[levels.length - 1].level ? 'graduation' : 'master';
    }
    // Every practice and game activity uses the closest lesson's existing Spanish
    // question generator, so it remains playable without inventing new skills.
    let previousSkill = null;
    const nextSkills = new Array(levels.length);
    let nextSkill = null;
    for (let i = levels.length - 1; i >= 0; i--) {
      if (levels[i].kind === 'lesson') nextSkill = skillFor(levels[i]);
      nextSkills[i] = nextSkill;
    }
    for (let i = 0; i < levels.length; i++) {
      const row = levels[i];
      if (row.kind === 'lesson') previousSkill = skillFor(row);
      row.skill = row.kind === 'lesson' ? previousSkill : (previousSkill || nextSkills[i] || 'es_vocab_core');
    }

    const name = gradeName(heading);
    grades.push({
      id: gradeId(heading, g),
      heading,
      name,
      tier: tierFor(heading),
      blurb: heading,
      skills: [...new Set(levels.filter((row) => row.kind === 'lesson').map((row) => row.skill))],
      levels,
      levelCount: levels.length,
      teachingLevelCount: levels.filter((row) => row.teaches).length,
    });
  }
  return grades;
}

function writeGrades(grades, out = OUT) {
  const lines = [
    '// Generated by scripts/build-spanish-grades.js from data/Spanish_Fluency_Path.csv.',
    '// Do not edit by hand; every original CSV cell is retained in level.columns.',
    `const GRADES = ${JSON.stringify(grades, null, 2)};`,
    '',
    'module.exports = { GRADES };',
    '',
  ];
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
}

if (require.main === module) {
  const grades = readSpanishSheet();
  writeGrades(grades);
  const levels = grades.reduce((sum, grade) => sum + grade.levelCount, 0);
  const lessons = grades.reduce((sum, grade) => sum + grade.teachingLevelCount, 0);
  console.log(`wrote ${OUT}`);
  console.log(`${grades.length} grades, ${levels} levels, ${lessons} teaching lessons`);
}

module.exports = { HEADERS, SKILL_RULES, gradeId, gradeName, readSpanishSheet, skillFor, tierFor, writeGrades };