/**
 * Build the ACT track from the authored workbook.
 *
 * The workbook is an XLSX rather than a CSV: its first sheet contains sixteen
 * five-column grade blocks (level, type, topic, coverage, estimated minutes).
 * This script uses only Node's standard library so the generated curriculum can
 * be rebuilt without adding an office-file dependency to the application.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.env.ACT_XLSX || path.join(ROOT, 'data', 'ACT_Grades_Topics.xlsx');
const OUT = process.env.ACT_OUT || path.join(ROOT, 'content', 'act-grades.js');

const TYPE_KIND = {
  Tester: { kind: 'practice', teaches: false },
  Lesson: { kind: 'lesson', teaches: true },
  Summary: { kind: 'lesson', teaches: true },
  'Grade Review Lesson': { kind: 'lesson', teaches: true },
  Activity: { kind: 'practice', teaches: false },
  'Grade Review Activity': { kind: 'practice', teaches: false },
  'Master Quiz': { kind: 'master', teaches: false },
  'Grand Master Quiz': { kind: 'grand', teaches: false },
  'Timed Task': { kind: 'practice', teaches: false },
  'Task Revision': { kind: 'practice', teaches: false },
  Final: { kind: 'graduation', teaches: false },
};

const GRADE_META = [
  ['act_grade_1', 'ACT Foundations I', 1, 'Number sense, reading basics, and the first ACT question habits.'],
  ['act_grade_2', 'ACT Foundations II', 1, 'Sentences, fractions, and main ideas across the four sections.'],
  ['act_grade_3', 'ACT Core Skills I', 2, 'Pre-algebra, grammar rules, and evidence-based reading.'],
  ['act_grade_4', 'ACT Core Skills II', 2, 'Equations, punctuation, and passage structure.'],
  ['act_grade_5', 'ACT Building Toward the Benchmarks', 2, 'The core skills needed to reach the ACT benchmarks.'],
  ['act_grade_6', 'ACT Readiness', 3, 'A complete benchmark-ready ACT foundation with timed practice.'],
  ['act_grade_7', 'ACT Intermediate I', 3, 'Algebra, rhetoric, and data interpretation.'],
  ['act_grade_8', 'ACT Intermediate II', 3, 'Functions, style, and paired-passage reasoning.'],
  ['act_grade_9', 'ACT Advanced I', 4, 'Geometry, trigonometry, and precise inference.'],
  ['act_grade_10', 'ACT Advanced II', 4, 'Advanced algebra and precision reading under pressure.'],
  ['act_grade_11', 'ACT High Scorer I', 4, 'Hard mathematics and subtle grammar distinctions.'],
  ['act_grade_12', 'ACT High Scorer II', 4, 'The hardest question types across every ACT section.'],
  ['act_grade_13', 'ACT Elite I', 5, 'Speed with accuracy on demanding mixed sections.'],
  ['act_grade_14', 'ACT Elite II', 5, 'Eliminating the last recurring errors.'],
  ['act_grade_15', 'ACT Perfect Score Mastery', 5, '35–36-level performance in every section.'],
  ['act_grade_16', 'ACT Consistency', 5, 'Maintaining a 36 across separate test sittings.'],
];

const META_BY_HEADING = new Map(GRADE_META.map(([id, name, tier, blurb]) => [
  id, { id, name, tier, blurb },
]));

function findEnd(buffer, signature) {
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === signature) return i;
  }
  return -1;
}

function zipEntries(file) {
  const buffer = fs.readFileSync(file);
  const end = findEnd(buffer, 0x06054b50);
  if (end < 0) throw new Error(`${file}: not a ZIP/XLSX archive`);
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  let at = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error(`${file}: bad ZIP directory`);
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${file}: bad ZIP entry ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    entries.set(name, data.toString('utf8'));
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (!entries.size || directorySize <= 0) throw new Error(`${file}: empty ZIP archive`);
  return entries;
}

function xmlDecode(value) {
  return String(value)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function sharedStrings(xml) {
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) => [...match[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((part) => xmlDecode(part[1])).join(''));
}

function columnNumber(ref) {
  const letters = /^([A-Z]+)/.exec(ref)[1];
  let number = 0;
  for (const letter of letters) number = number * 26 + letter.charCodeAt(0) - 64;
  return number;
}

function worksheetRows(xml, strings) {
  const rows = new Map();
  for (const rowMatch of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\s*\/>/g)) {
      const attrs = cellMatch[1] || cellMatch[3] || '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
      if (!ref) continue;
      const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(cellMatch[2] || '');
      if (!valueMatch) { cells.set(columnNumber(ref[1]), ''); continue; }
      const raw = xmlDecode(valueMatch[1]);
      cells.set(columnNumber(ref[1]), /\bt="s"/.test(attrs) ? strings[Number(raw)] : raw);
    }
    rows.set(Number(rowMatch[1]), cells);
  }
  return rows;
}

function skillFor(text) {
  const value = String(text).toLowerCase();
  const rules = [
    [/trig|sine|cosine|tangent|right triangle|unit circle/, 'trig_basics'],
    [/quadratic|parabola|completing the square|discriminant/, 'quadratics'],
    [/function|domain and range|inverse function|composition/, 'functions'],
    [/logarithm|exponential/, 'logs'],
    [/complex number|imaginary|complex plane/, 'complex_nums'],
    [/polynomial|factor theorem|remainder theorem/, 'polynomials'],
    [/rational expression|rational equation|extraneous/, 'rational_expr'],
    [/system[s]? of|simultaneous equation/, 'systems'],
    [/slope|linear function|line equation|coordinate plane|midpoint|distance formula/, 'slope_lines'],
    [/inequalit|absolute value equation/, 'inequalities'],
    [/equation|solve for|variable|expression|distributive|proportion/, 'linear_eq'],
    [/area|perimeter|volume|circle|triangle|polygon|angle|geometry|similar/, 'geometry_area'],
    [/sequence|arithmetic series|geometric series/, 'sequences'],
    [/fraction|numerator|denominator/, 'fractions'],
    [/percent|simple interest|compound interest|discount|markup/, 'percents'],
    [/ratio|unit rate|unit conversion|proportion/, 'ratios'],
    [/integer|negative number|absolute value|number line/, 'integers'],
    [/exponent|scientific notation|root|radical|order of operations/, 'exponents'],
    [/decimal|rounding|estimate|place value/, 'decimals'],
    [/data|table|graph|chart|mean|median|mode|probability|statistic|distribution|sampling|standard deviation|margin of error/, 'act_data'],
    [/independent variable|dependent variable|control group|experiment|hypothesis|scientist|research|lab|biology|physics|chemistry|earth science|scientific|conflicting viewpoint/, 'act_science'],
    [/transition[s]?/, 'transitions'],
    [/transition|organization|paragraph order|logical|relevance|redundan|concision|audience|purpose|rhetoric|rhetorical|claim|thesis|opening|conclusion|style|tone|word choice|sentence addition|delete a sentence|hook/, 'act_rhetoric'],
    [/apostrophe|possessive|contraction/, 'apostrophes'],
    [/subject.?verb|agreement/, 'subject_verb'],
    [/pronoun|antecedent/, 'pronoun_case'],
    [/verb|tense|mood|voice|participle|gerund|infinitive/, 'verb_tense'],
    [/modifier|parallel|adjective|adverb/, 'modifiers'],
    [/fragment|run.?on|comma splice|complete sentence|sentence structure|clause/, 'sentence_struct'],
    [/end punctuation|capital letter|capitalization/, 'punctuation_basic'],
    [/comma|semicolon|colon|punctuation/, 'comma_use'],
    [/add|subtract|multiply|divide|whole number|arithmetic|calculation/, 'add_sub'],
    [/vocab|word in context|meaning of|figurative|connotation|denotation/, 'vocab_context'],
    [/main idea|central idea|main point|summary|summarize|passage purpose/, 'main_idea'],
    [/inference|imply|suggest|conclude|most strongly/, 'inference'],
    [/author|writer|narrator|point of view|attitude|perspective|purpose|tone/, 'author_purpose'],
    [/detail|according to|line reference|evidence|support|explicit|information|sequence|cause and effect|compare|contrast/, 'detail_support'],
  ];
  for (const [pattern, skill] of rules) if (pattern.test(value)) return skill;
  // The ACT workbook intentionally mixes strategy and test-management levels
  // with content. Rhetorical reasoning is the closest bank family for those
  // levels and keeps every authored row executable.
  return 'act_rhetoric';
}

function idFromHeading(heading, index) {
  const match = /^Grade\s+(\d+)/i.exec(heading);
  return match ? `act_grade_${match[1]}` : `act_grade_${index + 1}`;
}

function readGrades() {
  const entries = zipEntries(SRC);
  const strings = sharedStrings(entries.get('xl/sharedStrings.xml'));
  const rows = worksheetRows(entries.get('xl/worksheets/sheet1.xml'), strings);
  const headings = strings.filter((value) => /^Grade \d+:/i.test(value));
  const grades = [];
  for (let index = 0; index < 16; index++) {
    const base = 1 + index * 5;
    // The heading row uses merged cells. LibreOffice writes the value on the
    // first cell of a merge, while other spreadsheet writers may omit that cell
    // from the XML entirely; the shared-string heading is the stable fallback.
    const heading = rows.get(1).get(base) || headings[index];
    if (!heading) throw new Error(`ACT grade block ${index + 1} has no heading`);
    const levels = [];
    for (const [rowNumber, row] of rows) {
      if (rowNumber <= 2 || !row.has(base)) continue;
      const level = Number(row.get(base));
      const type = row.get(base + 1) || 'Activity';
      const title = row.get(base + 2) || '';
      const covers = row.get(base + 3) || '';
      if (!Number.isInteger(level) || !title) throw new Error(`${heading}: invalid row ${rowNumber}`);
      const mapped = TYPE_KIND[type] || { kind: 'practice', teaches: false };
      levels.push({ level, type, kind: mapped.kind, title, topic: title, covers, skill: skillFor(`${title} ${covers}`) });
    }
    levels.sort((a, b) => a.level - b.level);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i].level !== levels[i - 1].level + 1) throw new Error(`${heading}: level sequence has a gap`);
    }
    const id = idFromHeading(heading, index);
    const meta = META_BY_HEADING.get(id);
    grades.push({
      id,
      heading,
      name: meta ? meta.name : heading,
      tier: meta ? meta.tier : 5,
      blurb: meta ? meta.blurb : '',
      skills: [...new Set(levels.map((level) => level.skill))],
      levels,
      levelCount: levels.length,
      teachingLevelCount: levels.filter((level) => level.kind === 'lesson').length,
    });
  }
  return grades;
}

function write(grades) {
  const lines = [
    '/**',
    ' * The authored ACT curriculum, generated from data/ACT_Grades_Topics.xlsx.',
    ' * Do not hand-edit this file; run `npm run build:act` after changing the workbook.',
    ' */',
    'const GRADES = ',
    JSON.stringify(grades, null, 2),
    ';',
    '',
    'module.exports = { GRADES };',
    '',
  ];
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  const total = grades.reduce((sum, grade) => sum + grade.levels.length, 0);
  console.log(`wrote ${OUT}`);
  console.log(`${grades.length} grades, ${total} levels`);
  for (const grade of grades) console.log(`  ${grade.id}: ${grade.levels.length} levels, ${grade.teachingLevelCount} teaching`);
}

write(readGrades());