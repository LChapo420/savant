// The basketball track: every basketball bank skill producing well-formed items
// with correct statistics, and the generated track agreeing with its sheet.
const fs = require('fs');
const path = require('path');
const bank = require('../content/bank');
const curriculum = require('../config/curriculum');
const { GENERATORS } = require('../content/basketball-items');
const { parseCsv } = require('./build-sheet-track');

let failures = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};
console.log('statistics');
const stats = GENERATORS.bb_stats;
const { makeRng } = require('../content/rng');
let mathOk = true;
for (let i = 0; i < 200; i++) {
  const it = stats(makeRng('st' + i), 1 + (i % 10), {});
  const m = /shoots (\d+) of (\d+) from the field \((\d+) of (\d+) threes\) and (\d+) of (\d+) free throws/.exec(it.prompt);
  if (m && /How many points/.test(it.prompt)) {
    const [fgm, , tpm, , ftm] = m.slice(1).map(Number);
    if (Number(it.answer) !== 2 * (fgm - tpm) + 3 * tpm + ftm) mathOk = false;
  }
}
ok(mathOk, 'points are always 2 per two, 3 per three, 1 per free throw');

console.log('bank items');
for (const skill of Object.keys(GENERATORS)) {
  let good = true;
  let why = '';
  for (let i = 0; i < 40; i++) {
    try {
      const it = bank.generate({ skillId: skill, difficulty: 1 + (i % 10), seed: `${skill}:${i}` });
      if (!it.prompt || !it.answer || !it.rationale) { good = false; why = 'empty field'; }
      if (it.format === 'multiple_choice' && !it.choices.includes(it.answer)) { good = false; why = 'answer not in choices'; }
      if (/undefined|null/.test(it.prompt + it.answer)) { good = false; why = `bad text: ${it.prompt}`; }
    } catch (e) { good = false; why = e.message; }
  }
  ok(good, `${skill} makes 40 well-formed items${why ? ` (${why})` : ''}`);
}

console.log('track');
const track = curriculum.TRACKS.find((t) => t.id === 'basketball');
ok(!!track, 'the basketball track is registered');
ok(track && track.grades.length === 15, 'it has fifteen grades');
ok(bank.missingSkills().filter((s) => s.startsWith('bb_')).length === 0, 'every basketball skill a grade uses has a generator');
const rows = parseCsv(fs.readFileSync(path.join(process.env.SHEET_DIR || path.join(__dirname, '..', 'data'), 'Basketball_Grades_Levels.csv'), 'utf8'));
const csvLevels = rows.slice(2).reduce((n, r) => n + r.filter((_, i) => i % 5 === 0 && /^\d+$/.test(String(r[i]).trim())).length, 0);
const trackLevels = track ? track.grades.reduce((n, g) => n + g.levels.length, 0) : 0;
ok(csvLevels === trackLevels, `every sheet row is a level (${csvLevels} rows, ${trackLevels} levels)`);
ok(track && track.grades.every((g) => g.levels.slice(0, 9).every((l) => l.type === 'Tester')), 'every grade opens with nine testers');
ok(track && track.grades.every((g) => g.levels[g.levels.length - 1].type === 'Final'), 'every grade ends on its Final');
ok(track && track.grades.slice(0, 13).every((g) => g.levels[g.levels.length - 3].type === 'Grade Combine' && g.levels[g.levels.length - 2].type === 'Game Showcase'), 'grades 1-13 have a combine and a showcase before the Final');
ok(track && track.grades.every((g) => g.levels.filter((l) => l.type === 'Lesson').every((l) => l.skill)), 'every lesson has a question skill');

console.log('the court: plays, reads and checks');
const Court = require('../public/engine/basketball/court');
const bballChecks = require('../services/basketball-checks');
const grading = require('../services/grading');
const blockLevels = require('../services/block-levels');
// A drive and kick: the left corner defender helps, so the left corner is open.
const drive = [
  { players: { o1: [25, 30], o2: [3, 3], d1: [25, 26], d2: [6, 6] }, ball: 'o1' },
  { players: { o1: [25, 14], o2: [3, 3], d1: [25, 18], d2: [17, 10] }, ball: 'o1' },
];
const options = [{ id: 'shoot', label: 'Pull up and shoot' }, { id: 'corner', label: 'Pass to the open corner' }];
ok(Court.validate(drive) === '', 'a drawable play passes');
ok(!!Court.validate([{ players: { o1: [25, 60], d1: [25, 26] }, ball: 'o1' }]), 'a player off the half court is refused');
ok(!!Court.validate([{ players: { o1: [25, 30], d1: [25, 26] }, ball: 'o5' }]), 'the ball with someone not on the court is refused');
ok(Court.isThree(1, 3) && Court.isThree(25, 30) && !Court.isThree(25, 18) && !Court.isThree(4, 3), 'corner and top threes count, a long two and a toe-on-the-line corner do not');
const read = bballChecks.cleanPlayCheck({ prompt: 'Who is open?', frames: drive, pauseAt: 1, options, answer: 'corner', rationale: 'The corner defender helped on the drive.' });
ok(read && read.answer === 'Pass to the open corner' && read.answer_id === 'corner', 'a read check is kept, its key named by label and id');
ok(!bballChecks.cleanPlayCheck({ prompt: 'Who is open?', frames: drive, options, answer: 'lob', rationale: 'The corner defender helped on the drive.' }), 'a read whose key is not an option is dropped');
ok(!bballChecks.cleanPlayCheck({ prompt: 'Who is open?', frames: [{ players: { o1: [80, 3] }, ball: 'o1' }], options, answer: 'corner', rationale: 'The corner defender helped on the drive.' }), 'a play that cannot be drawn is dropped');
ok(grading.grade(read, 'corner').correct && !grading.grade(read, 'shoot').correct && !grading.grade(read, '').correct, 'the right read is right, the wrong one and no answer are not');
ok(!blockLevels.catalogFor('lesson', 'piano').some((b) => /^Basketball_/.test(b.tag)), 'other subjects are not offered basketball blocks');
ok(blockLevels.catalogFor('lesson', 'basketball').filter((b) => /^Basketball_/.test(b.tag)).length === 6, 'basketball lessons are offered the play, film, shot log, session, shot tracker and handling drill blocks');
const served = blockLevels.publicPlan({ id: 1, checks: [{ ...read, id: 'c1', after: -1 }], blocks: [] }, 1, {});
const sent = served.entries[0];
ok(sent.block === 'Check_Play' && !('answer' in sent.data) && !('answer_id' in sent.data) && !('accepts' in sent.data), 'a read reaches the page without its answer');
ok(served.files[0] === '/engine/basketball/court.js', 'the court loads first');
const camPlan = blockLevels.publicPlan({ id: 2, checks: [], blocks: [
  { block: 'Basketball_ShotTracker', data: { prompt: 'Shoot 10.', shots: 10 }, index: 0 },
  { block: 'Basketball_Play', data: {}, index: 1 },
] }, 1, {});
const order = (f) => camPlan.files.indexOf(f);
ok(order('/engine/basketball/court.js') === 0 && order('/engine/basketball/tracking.js') === 1
  && order('/engine/basketball/basketball-blocks.js') < order('/engine/basketball/camera-blocks.js'), 'the camera blocks load after the court, the tracking maths and the other basketball blocks');

console.log('choices written as objects');
// GLM wrote these for basketball level 696: choices as JSON objects, the answer naming one by id.
const asJson = (id, text, extra = {}) => JSON.stringify({ id, text, ...extra });
const spec = { format: 'multiple_choice', skill_id: 'bb_tactics' };
const mc = blockLevels.cleanCheck({
  prompt: 'You drive along the baseline. Which defender usually steps up first to stop you?',
  rationale: 'Help comes from the nearest low defender.',
  choices: [asJson('a', 'Your own defender'), asJson('b', 'The far wing defender'), asJson('c', 'The low defender on your side'), asJson('d', 'The defender at the top of the key')],
  answer: asJson('c', 'The low defender on your side'),
}, spec, 4);
ok(mc && mc.choices.every((c) => !/[{}]/.test(c)) && mc.answer === 'The low defender on your side', 'choices become their text and the answer the chosen text');
const byId = blockLevels.cleanCheck({
  prompt: 'Which defender helps first?', rationale: 'Help comes from the nearest low defender.',
  choices: [{ id: 'x', label: 'Top' }, { id: 'y', label: 'Low man' }, { id: 'z', label: 'Far wing' }, { id: 'w', label: 'Your own' }], answer: 'y',
}, spec, 4);
ok(byId && byId.answer === 'Low man', 'an answer given as a bare id names that choice');
ok(!blockLevels.cleanCheck({
  prompt: 'What is your rule on the catch?', rationale: 'Shoot or one dribble before the close-out.',
  choices: [asJson('a', 'Shoot or one dribble'), asJson('b', 'Hold the ball'), asJson('c', 'Shoot or one dribble', { tag: 'Both A and C' }), asJson('d', 'Drive with two more dribbles')],
  answer: asJson('c', 'Shoot or one dribble'),
}, spec, 4), 'two choices with the same text are caught once the objects are read');
ok(/off the half court|missing|frames/.test(blockLevels.whyRefused({ prompt: 'Who is open?', answer: 'corner', rationale: 'The corner defender helped.', frames: [{ players: { o1: [25, 80], d1: [25, 20] }, ball: 'o1' }], options: [] }, { format: 'play' })), 'a refused play says what was wrong with it');

console.log('what GLM wrote for level 696, caught');
// Each case below is the model's own output for "Drive and Kick to the Open Spot"
// (runs of 2026-10-21), cut to the parts that matter.
const P = (o1, o2, o3, o4, o5, d1, d2, d3, d4, d5, ball) => ({ ball, players: { o1, o2, o3, o4, o5, d1, d2, d3, d4, d5 } });
// Run 0: the corner shooter o3 is drawn at (6, 6), inside the arc, and the explanation says "his man".
const run0Play = {
  prompt: 'You are o1. You drove into the gap between d1 and d5. Watch d3, the corner defender. The play stops at the moment they commit to you. What is your read?',
  frames: [
    P([25, 26], [40, 20], [6, 6], [42, 6], [25, 8], [23, 24], [38, 20], [8, 7], [40, 7], [24, 10], 'o1'),
    P([19, 23], [41, 20], [6, 6], [43, 6], [24, 9], [22, 24], [38, 21], [10, 10], [40, 7], [23, 10], 'o1'),
    P([14, 20], [41, 20], [6, 6], [43, 6], [24, 9], [20, 23], [38, 21], [14, 16], [40, 7], [22, 10], 'o1'),
    P([13, 20], [41, 20], [6, 6], [43, 6], [24, 9], [20, 23], [38, 21], [13, 15], [40, 7], [22, 10], 'o3'),
  ],
  pauseAt: 2,
  options: [{ id: 'corner', label: 'Kick out to o3 in the corner' }, { id: 'dunk', label: 'Keep driving at the rim past d3' }, { id: 'rim', label: 'Pass to o5 rolling to the rim' }, { id: 'pull', label: 'Pull up for a two-point jumper in the lane' }],
  answer: 'corner',
  explanation: 'The cue is d3, the corner defender, leaving his man to step up and stop the ball. o3 is wide open.',
};
const run0Problems = bballChecks.blockProblems('Basketball_Play', run0Play);
ok(run0Problems.some((p) => /o3 is called the corner player but stands at \(6, 6\)/.test(p)), 'a corner shooter drawn inside the arc is caught');
ok(run0Problems.some((p) => /uses "his"/.test(p)), '"his man" is caught in a play');
const fixedCorner = JSON.parse(JSON.stringify(run0Play));
fixedCorner.frames.forEach((f) => { f.players.o3 = [2, 3]; f.players.d3 = f.players.d3[0] === 8 ? [4, 5] : f.players.d3; });
fixedCorner.explanation = 'The cue is d3, the corner defender, leaving their player to stop the ball. o3 is wide open.';
ok(bballChecks.blockProblems('Basketball_Play', fixedCorner).length === 0, 'the same play with the shooter in the corner, and "their player", passes');
// Run 0: the travelling question ("slides" in the question, "lifting" in the key, and lifting to pass is legal).
const travel = {
  prompt: 'A player picks up the dribble to make a kick-out pass. Before releasing the pass, they slide the pivot foot along the floor to get a better angle. What is the call?',
  choices: ['The pass was kicked, so the old dribble rules no longer apply', 'It is fine, because a held ball is called on the defence in the lane', 'No — lifting the pivot foot before releasing the pass is travelling', 'Yes, it is legal, as long as they stayed inside the court'],
  answer: 'No — lifting the pivot foot before releasing the pass is travelling',
  rationale: 'After picking up the dribble, a player may pivot, but lifting or sliding the pivot foot before the pass leaves the hands is travelling.',
};
const travelWhy = bballChecks.checkTextProblems(travel, 'bb_rules');
ok(travelWhy.some((p) => /lifting the pivot foot to pass or shoot is legal/.test(p)), 'the false claim that lifting the pivot foot to pass is a travel is caught');
ok(travelWhy.some((p) => /sliding but the answer talks about lifting/.test(p)), 'a key about lifting for a question about sliding is caught');
ok(!blockLevels.cleanCheck(travel, { format: 'multiple_choice', skill_id: 'bb_rules' }, 8), 'and the check is refused');
ok(/pivot/.test(blockLevels.whyRefused(travel, { format: 'multiple_choice', skill_id: 'bb_rules' })), 'with the reason sent to the repair call');
const travelRight = { ...travel, choices: ['Travelling: the pivot foot slid before the pass', 'Legal: a pivot foot may slide to pass', 'A held ball', 'No call: the pass was released'], answer: 'Travelling: the pivot foot slid before the pass', rationale: 'Sliding or dragging the pivot foot is a travel; lifting it to pass is legal if it does not come back down first.' };
ok(bballChecks.checkTextProblems(travelRight, 'bb_rules').length === 0 && !!blockLevels.cleanCheck(travelRight, { format: 'multiple_choice', skill_id: 'bb_rules' }, 8), 'the corrected travelling question passes');
ok(bballChecks.ruleProblems('In the NBA a player fouls out with five personal fouls.').length === 1 && bballChecks.ruleProblems('In the NBA a player fouls out with six personal fouls.').length === 0, 'NBA foul-outs: five is caught, six passes');
ok(bballChecks.ruleProblems('FIBA uses a 30-second shot clock.').length === 1 && bballChecks.ruleProblems('FIBA uses a 24-second shot clock.').length === 0, 'the FIBA shot clock: 30 is caught, 24 passes');
ok(bballChecks.ruleProblems('Under FIBA rules there is no defensive three-second rule.').length === 0, 'a true FIBA three-second statement passes');
// Run 0: the shot log asked for what it cannot record.
const run0Log = { prompt: 'Your kick-out set: 5 catch-and-shoot threes off a drive. Enter the shots into your log — for each one, note where the pass came from and whether the catch was clean.' };
const logWhy = bballChecks.blockProblems('Basketball_ShotLog', run0Log);
ok(logWhy.some((p) => /cannot record/.test(p)) && logWhy.some((p) => /set "shots" to 5/.test(p)), 'a shot log asking about the pass, with no shot count, is caught');
ok(bballChecks.blockProblems('Basketball_ShotLog', { prompt: 'Log 10 catch-and-shoot threes off a pass from a partner: tap where you shot and whether it went in.', shots: 10 }).length === 0, 'a shot log that mentions the pass but records only spot and result passes');
ok(bballChecks.blockProblems('Basketball_ShotLog', { prompt: 'Take 3 shots from each of 5 spots and log them.', shots: 15 }).length === 0, 'a per-spot count is not mistaken for the set size');
// Run 1: 270 seconds of warm-up.
const run1Session = { title: 'Drive-and-Kick Session', warmup: [{ name: 'Jog and ball slaps', seconds: 60 }, { name: 'Two-foot spring stops', seconds: 60 }, { name: 'Stationary low dribble, weak hand', seconds: 90 }, { name: 'Partner pass on the move', seconds: 60 }], drills: [{ name: 'Help Kick-Out', minutes: 6, cue: 'Pass to the shooter they left.' }] };
ok(bballChecks.blockProblems('Basketball_Session', run1Session).some((p) => /270 seconds/.test(p)), 'a warm-up under five minutes is caught');
ok(bballChecks.blockProblems('Basketball_Session', { title: 'T', drills: run1Session.drills }).length === 0, 'a session that leaves the warm-up to the built-in one passes');
ok(bballChecks.blockProblems('Basketball_Session', { title: 'T', drills: [{ name: 'Squats with a barbell', minutes: 5, cue: 'Go to failure.' }] }).length > 0, 'a barbell in a court session is caught');
// Run 1: "attack the gap to the left" while o1 moves right, and "weak-side" help from the ball's side.
const run1Play = {
  prompt: 'You attack the gap to the left. Now weak-side help arrives: d5 crosses over from the right side. What do you do?',
  frames: [
    P([25, 24], [7, 7], [44, 7], [12, 16], [37, 16], [24, 23], [8, 8], [43, 8], [13, 16], [36, 17], 'o1'),
    P([26, 18], [7, 7], [44, 7], [12, 16], [37, 16], [27, 17], [8, 8], [43, 8], [13, 16], [31, 14], 'o1'),
    P([27, 13], [7, 7], [44, 7], [12, 16], [37, 16], [28, 12], [8, 8], [43, 8], [13, 16], [28, 12], 'o1'),
    P([28, 10], [7, 7], [44, 7], [12, 16], [37, 16], [29, 10], [8, 8], [43, 8], [13, 16], [29, 10], 'o1'),
    P([17, 24], [7, 7], [44, 7], [12, 16], [37, 15], [29, 14], [8, 8], [43, 8], [13, 16], [29, 12], 'o5'),
  ],
  pauseAt: 3,
  options: [{ id: 'weakkick', label: 'Kick to o5, the player the helper left' }, { id: 'contested', label: 'Finish the layup through the helper' }, { id: 'hold', label: 'Hold the ball and wait for a better look' }],
  answer: 'weakkick',
  explanation: 'The cue is weak-side help: d5 crosses the floor from the right side to stop your drive. That leaves o5 wide open on the right wing.',
};
const run1Why = bballChecks.blockProblems('Basketball_Play', run1Play);
ok(run1Why.some((p) => /drives left, but o1 moves right/.test(p)), 'a drive called left that goes right is caught');
ok(run1Why.some((p) => /d5 is called weak-side help but starts on the ball's side/.test(p)), 'strong-side help called weak-side is caught');
ok(run1Why.some((p) => /o5 is called the wing player but stands at \(37, 15\)/.test(p)), 'a wing shooter drawn at 15 ft is caught');
// A play whose answer passes to a covered player while another option's player is free.
const covered = {
  prompt: 'Who is open?',
  frames: [P([25, 25], [2, 3], [48, 3], [7, 23], [43, 23], [25, 20], [3, 5], [47, 5], [9, 21], [30, 15], 'o1')],
  options: [{ id: 'left', label: 'Pass to o2 in the left corner' }, { id: 'right', label: 'Pass to o5 on the right wing' }],
  answer: 'left',
  rationale: 'The corner is open.',
};
ok(bballChecks.playCheckProblems(covered, 'bb_tactics').some((p) => /does not show the answer as the open pass/.test(p)), 'an answer passing to a covered player while another option is free is caught');
ok(bballChecks.playCheckProblems({ ...covered, answer: 'right' }, 'bb_tactics').length === 0, 'the same play keyed to the open player passes');
ok(bballChecks.playCheckProblems({ ...covered, frames: JSON.stringify(covered.frames), options: JSON.stringify(covered.options), answer: 'right' }, 'bb_tactics').length === 0, 'frames and options sent as JSON strings are read');
ok(/does not show the answer as the open pass/.test(blockLevels.whyRefused(covered, { format: 'play', skill_id: 'bb_tactics' })), 'a refused play check sends the drawing problem to the repair call');
ok(!bballChecks.cleanPlayCheck({ ...covered, answer: 'right', options: [{ id: 'a', label: 'Pass to o5' }, { id: 'b', label: 'pass to o5' }] }), 'two options with the same words are refused');
// Run 2: a check was refused for "driving from the left wing" (a starting place, not a direction): fixed.
const fromWing = (prompt) => bballChecks.playProblems({ prompt, frames: [{ ball: 'o1', players: { o1: [7, 23], d1: [9, 21] } }, { ball: 'o1', players: { o1: [19, 15], d1: [20, 17] } }], pauseAt: 1, options: [{ id: 'a', label: 'Finish' }, { id: 'b', label: 'Pull up' }], answer: 'a', explanation: 'Nobody helps, so finish.' });
ok(fromWing('You are o1, driving from the left wing.').length === 0, '"driving from the left wing" is a starting place, not a direction');
ok(fromWing('You are o1 and you drive left.').some((p) => /drives left/.test(p)) && fromWing('You attack the left gap.').some((p) => /drives left/.test(p)), '"drive left" and "the left gap" are directions');
// Run 2, check c1: "a low defender steps up" but no defender moves to the driver.
const run2c1 = {
  prompt: 'You are o1, driving from the left wing. A low defender steps up to stop you. Is the kick the right decision?',
  frames: [
    P([15, 23], [7, 23], [43, 23], [33, 19], [32, 7], [15, 21], [39, 21], [41, 22], [35, 8], [20, 9], 'o1'),
    P([12, 19], [7, 23], [43, 23], [33, 19], [32, 7], [15, 21], [40, 18], [41, 22], [30, 10], [20, 9], 'o1'),
  ],
  pauseAt: 1,
  options: [{ id: 'kick', label: 'Kick to the teammate the helper left open' }, { id: 'finish', label: 'Finish the lay-up at the rim' }],
  answer: 'kick',
  rationale: 'The low helper stepped up to the drive, so the correct read is to kick to the teammate that helper just left open.',
};
ok(bballChecks.playCheckProblems(run2c1, 'bb_tactics').some((p) => /no defender other than o1's own \(d1\) moves in/.test(p)), 'a helper named in the words but not drawn is caught');
ok(bballChecks.blockProblems('Basketball_Play', fixedCorner).length === 0, 'a drawn helper (run 0, fixed) passes the same rule');
// The camera blocks are held to the same words as the shot log, and the drill to short rounds.
ok(bballChecks.blockProblems('Basketball_ShotTracker', { prompt: 'Shoot 20 catch-and-shoot threes; rate your form on each one.', shots: 20 }).some((p) => /cannot record/.test(p)), 'a shot tracker asking for a form rating is caught');
ok(bballChecks.blockProblems('Basketball_ShotTracker', { prompt: 'Shoot 20 shots: 5 from each corner and 10 from the wings.', shots: 20 }).length === 0, 'a plain shot-tracker set passes');
ok(bballChecks.blockProblems('Basketball_HandleDrill', { prompt: 'Dribble low with your right hand and count your dribbles.', rounds: 5, seconds: 60 }).some((p) => /count dribbles/.test(p)), 'a drill that asks to count dribbles is caught');
ok(bballChecks.blockProblems('Basketball_HandleDrill', { prompt: 'Dribble low with your right hand; touch each target with your left.', rounds: 3, seconds: 30, pace: 'steady', dribble: 'right' }).length === 0, 'a plain handling drill passes');

// A check about a named player in history may say "he"; a tactics check may not.
ok(bballChecks.checkTextProblems({ prompt: 'Which team did Bill Russell win his titles with?', answer: 'Boston Celtics', rationale: 'He won 11 titles with Boston.' }, 'bb_history').length === 0, 'a history question about a named person may use "he"');
ok(bballChecks.checkTextProblems({ prompt: 'When the helper leaves his man, who is open?', answer: 'The shooter', rationale: 'The helper left them.' }, 'bb_tactics').length === 1, 'a tactics question with "his man" is caught');

console.log(failures ? `\n${failures} failure(s)` : '\nall basketball checks pass');
process.exit(failures ? 1 : 0);
