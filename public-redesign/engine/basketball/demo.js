/* The basketball testbed's sample data and stand-in grader (see demo.html). */
// A drive and kick: the left corner defender helps, so the left corner is open.
var DRIVE = [
  { players: { o1: [25, 30], o2: [3, 3], o3: [47, 3], d1: [25, 26], d2: [6, 6], d3: [44, 6] }, ball: 'o1' },
  { players: { o1: [25, 14], o2: [3, 3], o3: [47, 3], d1: [25, 18], d2: [17, 10], d3: [44, 6] }, ball: 'o1' },
  { players: { o1: [25, 14], o2: [3, 3], o3: [47, 3], d1: [25, 18], d2: [17, 10], d3: [44, 6] }, ball: 'o2' },
];
var OPTIONS = [{ id: 'shoot', label: 'Pull up and shoot over the help' }, { id: 'left', label: 'Pass to the left corner' }, { id: 'right', label: 'Pass to the right corner' }];
var KEYS = { demo1: { answer: 'Pass to the left corner', answer_id: 'left', rationale: 'The left corner defender stepped in to stop the drive, which leaves the left corner open for a three.' } };
window.PolymathChecks = {
  answered: {},
  submit: function (id, answer) {
    var k = KEYS[id];
    return Promise.resolve({ correct: answer === k.answer_id, answer: k.answer, rationale: k.rationale });
  },
};
var B = window.LessonBlocks;
B.get('Basketball_Play').render(document.getElementById('play'), {
  prompt: 'Watch the drive. When the play stops, choose the read.', frames: DRIVE, pauseAt: 1, options: OPTIONS,
  answer: 'left', explanation: 'The left corner defender stepped in to help on the drive: the shooter that defender left is open in the corner.', seconds: 8,
});
B.get('Check_Play').render(document.getElementById('check'), { id: 'demo1', prompt: 'Graded: read the help.', frames: DRIVE, pauseAt: 1, options: OPTIONS, seconds: 8 });
B.get('Basketball_ShotLog').render(document.getElementById('shots'), { prompt: 'Log 10 spot-up shots from the wings, corners and top.', shots: 10 });
B.get('Basketball_Session').render(document.getElementById('session'), {
  title: 'Form shooting session',
  warmup: [{ name: 'Jog and side shuffle', seconds: 60 }, { name: 'Jump and land softly', seconds: 60 }],
  drills: [{ name: 'One-hand form shots close to the rim', minutes: 5, cue: 'Swish it over the front rim.' }, { name: 'Five spots, three shots each', minutes: 8, cue: 'Same motion every shot.' }],
});
B.get('Basketball_Film').render(document.getElementById('film'), {
  prompt: 'Film ten form shots from the free-throw line.', protocol: ['Warm up first.', 'Stand at the free-throw line.', 'Take ten one-hand form shots.'],
  seconds: 45, cameraTip: 'prop the phone at waist height to your shooting side, 3 metres away.', rubric: ['Balance at the finish', 'Same motion every time', 'High arc into the rim'],
});
B.get('Basketball_ShotTracker').render(document.getElementById('tracker'), {
  prompt: 'Shoot 12 shots from around the key while the phone watches the rim.', shots: 12,
  cameraTip: 'prop the phone at chest height behind the shooter, with the rim and the free-throw line in view.',
});
B.get('Basketball_HandleDrill').render(document.getElementById('drill'), {
  prompt: 'Dribble low with one hand and touch each target as it lights up.', rounds: 2, seconds: 20, pace: 'steady', dribble: 'right',
  cue: 'Eyes on the targets, not the ball.',
});

// Testbed only: what the simulated camera really did, to compare with what the tracker reports,
// and where the rim's edges and the landmarks are in its picture.
(function () {
  var makeShot = window.PolymathBallSim.shot;
  var sim = null;
  window.PolymathBallSim.shot = function () { sim = makeShot(); return sim; };
  var out = document.getElementById('sim-truth');
  var r = function (p) { return '(' + Math.round(p[0]) + ', ' + Math.round(p[1]) + ')'; };
  setInterval(function () {
    if (!sim) return;
    var marks = Object.keys(sim.hints.landmarks).map(function (k) { return k + ' ' + r(sim.hints.landmarks[k]); }).join(', ');
    out.textContent = 'Simulator truth: ' + (sim.truth.length ? sim.truth.map(function (s, i) {
      return (i + 1) + ' ' + (s.made ? 'made' : 'missed') + ' from (' + s.spot.join(', ') + ') ' + window.PolymathTracking.zoneOf(s.spot[0], s.spot[1]);
    }).join('; ') : 'no shots yet') + '\nPicture pixels (320 wide): rim ' + r(sim.hints.rimLeft) + ' to ' + r(sim.hints.rimRight) + '; ' + marks;
  }, 1000);
})();
