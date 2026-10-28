/**
 * Calibration simulations for the English subject-placement instrument.
 *
 * This is intentionally deterministic. Each simulated learner has average
 * knowledge centered on one curriculum grade, a small amount of answer noise,
 * and a shape-checking heuristic that only helps when an option gives itself away
 * by length or format. The latter is measured against the same question set the
 * browser receives; a clean set should give that heuristic no advantage.
 *
 * Usage:
 *   node scripts/english-placement-calibration.js --round=calibration
 *   node scripts/english-placement-calibration.js --round=final
 */
const bank = require('../content/english-placement');
const rules = require('../config/subject-placement');
const curriculum = require('../config/curriculum');
const placement = require('../services/subject-placement');
const grading = require('../services/grading');

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function probabilityFor(questionGrade, knowledgeGrade, band) {
  const distance = questionGrade - knowledgeGrade;
  const byBand = {
    // Three below / two below / this grade / one above / farther above. These
    // values model uncertainty around a grade; they are not a learner-facing
    // pass mark, and the bank's calibrated content supplies the discrimination.
    easy: [0.98, 0.97, 0.80, 0.42, 0.25],
    medium: [0.96, 0.93, 0.65, 0.30, 0.25],
    hard: [0.94, 0.86, 0.40, 0.20, 0.25],
    capstone: [0.90, 0.72, 0.25, 0.12, 0.25],
  };
  const row = byBand[band];
  if (distance <= -2) return row[0];
  if (distance === -1) return row[1];
  if (distance === 0) return row[2];
  if (distance === 1) return row[3];
  return row[4];
}

function shapeCue(question) {
  return placement.lengthCue(question.choices, question.answer);
}

function scoreGrade(gradeIndex, knowledgeGrade, random) {
  const source = bank.GRADES[gradeIndex];
  const bands = {};
  const answers = [];
  let correct = 0;

  source.questions.forEach((question, index) => {
    const band = rules.MIX[index];
    const cueAdvantage = shapeCue(question) ? 0.10 : 0;
    const knowsIt = random() < Math.min(0.99, probabilityFor(gradeIndex, knowledgeGrade, band) + cueAdvantage);
    const visible = placement.spreadChoices(placement.usable(question, index));
    const wrongs = visible.choices.filter((choice) => choice !== question.answer);
    const answer = knowsIt ? question.answer : wrongs[Math.floor(random() * wrongs.length)];
    const verdict = grading.grade({
      format: 'multiple_choice',
      prompt: question.prompt,
      choices: visible.choices,
      answer: question.answer,
    }, answer);
    const row = bands[band] || (bands[band] = { asked: 0, correct: 0 });
    row.asked++;
    if (verdict.correct) {
      correct++;
      row.correct++;
    }
    answers.push({ band, correct: verdict.correct });
  });

  return {
    grade_id: source.grade_id,
    asked: 7,
    correct,
    bands,
    answers,
  };
}

function scoreGradePattern(gradeIndex, correctByBand) {
  const source = bank.GRADES[gradeIndex];
  const bands = {};
  let correct = 0;
  let seenByBand = {};

  source.questions.forEach((question, index) => {
    const band = rules.MIX[index];
    const seen = seenByBand[band] || 0;
    const knowsIt = seen < (correctByBand[band] || 0);
    seenByBand[band] = seen + 1;
    const visible = placement.spreadChoices(placement.usable(question, index));
    const wrong = visible.choices.find((choice) => choice !== question.answer);
    const verdict = grading.grade({
      format: 'multiple_choice',
      prompt: question.prompt,
      choices: visible.choices,
      answer: question.answer,
    }, knowsIt ? question.answer : wrong);
    const row = bands[band] || (bands[band] = { asked: 0, correct: 0 });
    row.asked++;
    if (verdict.correct) {
      correct++;
      row.correct++;
    }
  });

  return { grade_id: source.grade_id, asked: 7, correct, bands };
}

function runGradeProfiles() {
  const curriculumGrades = curriculum.getTrack('english').grades;
  if (curriculumGrades.length !== bank.GRADES.length
    || curriculumGrades.some((grade, index) => grade.id !== bank.GRADES[index].grade_id)) {
    throw new Error('English question bank order does not match the curriculum grades');
  }

  const profiles = [
    { name: 'entering', pattern: { easy: 1 }, expectedOffset: 0 },
    { name: 'core-ready', pattern: { easy: 2, medium: 2 }, expectedOffset: 0 },
    { name: 'near-complete', pattern: { easy: 2, medium: 2, hard: 1 }, expectedOffset: 0 },
    { name: 'completed', pattern: { easy: 2, medium: 2, hard: 2, capstone: 1 }, expectedOffset: 1 },
  ];
  const results = [];

  for (let target = 0; target < bank.GRADES.length; target++) {
    for (const profile of profiles) {
      const profileTarget = target + profile.expectedOffset;
      const expected = Math.min(bank.GRADES.length - 1, profileTarget);
      const scores = [];

      for (let index = 0; index < bank.GRADES.length; index++) {
        let pattern = {};
        if (index < target) pattern = { easy: 2, medium: 2, hard: 2, capstone: 1 };
        else if (index === target) pattern = profile.pattern;
        else if (profile.name === 'completed' && index === target + 1) pattern = { easy: 2, medium: 2 };
        scores.push(scoreGradePattern(index, pattern));
        if (rules.shouldStop(scores)) break;
      }

      const result = placement.recommendEnglishFromShape('english', {
        grade_ids: bank.GRADES.map((grade) => grade.grade_id),
        scores,
        skipped: [],
      });
      const recommended = bank.GRADES.findIndex((grade) => grade.grade_id === result.recommended_grade_id);
      results.push({
        profile: profile.name,
        target,
        recommended,
        expected,
        target_name: curriculumGrades[target].name,
        recommended_name: curriculumGrades[recommended].name,
      });
    }
  }

  return results;
}

function simulate(knowledgeGrade, simNumber) {
  const random = rng(0x51eeda + knowledgeGrade * 7919 + simNumber * 104729);
  const scores = [];
  for (let gradeIndex = 0; gradeIndex < bank.GRADES.length; gradeIndex++) {
    const score = scoreGrade(gradeIndex, knowledgeGrade, random);
    scores.push(score);
    if (rules.shouldStop(scores)) break;
  }

  const result = placement.recommendEnglishFromShape('english', {
    grade_ids: bank.GRADES.map((grade) => grade.grade_id),
    scores,
    skipped: [],
  });
  const recommended = bank.GRADES.findIndex((grade) => grade.grade_id === result.recommended_grade_id);
  return {
    knowledge_grade: knowledgeGrade,
    simulation: simNumber,
    recommended_grade: recommended,
    recommended_grade_id: result.recommended_grade_id,
    distance: recommended - knowledgeGrade,
    grades_answered: scores.length,
    score_summary: scores.map((score) => `${score.correct}/${score.asked}`).join(' '),
    percentages: result.recommendation.map((row) => row.percent),
  };
}

function run(count) {
  const rows = [];
  for (let knowledgeGrade = 0; knowledgeGrade < bank.GRADES.length; knowledgeGrade++) {
    for (let simulation = 1; simulation <= count; simulation++) rows.push(simulate(knowledgeGrade, simulation));
  }
  return rows;
}

function report(rows, label) {
  const failures = rows.filter((row) => Math.abs(row.distance) > 1);
  console.log(`${label}: ${rows.length} simulations, ${failures.length} outside one grade`);
  for (const row of rows) {
    console.log(`  knowledge ${String(row.knowledge_grade + 1).padStart(2, '0')} `
      + `-> recommended ${String(row.recommended_grade + 1).padStart(2, '0')} `
      + `(distance ${row.distance >= 0 ? '+' : ''}${row.distance}, `
      + `${row.grades_answered} grades answered, scores ${row.score_summary})`);
  }
  if (failures.length) {
    console.error('Calibration failures:');
    for (const row of failures) console.error(JSON.stringify(row));
  }
  return failures.length === 0;
}

function reportGradeProfiles(rows) {
  const failures = rows.filter((row) => row.recommended !== row.expected);
  console.log(`Grade-specific profiles: ${rows.length} deterministic simulations, ${failures.length} misplaced`);
  if (failures.length) {
    for (const row of failures) {
      console.error(`  ${row.profile}, target ${row.target_name}: recommended ${row.recommended_name}; expected grade ${row.expected + 1}`);
    }
  }
  return failures.length === 0;
}

const requested = String(process.argv.find((arg) => arg.startsWith('--round=')) || '--round=calibration').split('=')[1];
const count = requested === 'final' ? 3 : 2;
const shapeCues = bank.GRADES.flatMap((grade) => grade.questions.filter(shapeCue));
const sevenOfSevenGuessChance = (1 / 4) ** 7;
console.log(`English placement question-shape cues: ${shapeCues.length}`);
console.log(`Blind 4-option guessing chance of a perfect grade: ${(sevenOfSevenGuessChance * 100).toFixed(5)}%`);
const profileOk = reportGradeProfiles(runGradeProfiles());
const noiseOk = report(run(count), requested === 'final' ? 'Final validation' : 'Calibration');
const ok = profileOk && noiseOk;
process.exit(ok ? 0 : 1);
