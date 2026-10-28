/**
 * Reasoning item families.
 *
 * Analogies, deduction and spatial items were authored pools of six to eight, so
 * a learner met all of them in one sitting. These families keep the same
 * reasoning at the same difficulty and vary what is being reasoned about.
 *
 * Deduction and spatial items are computed wherever the answer can be: a
 * three-runner ordering puzzle is generated from a real order and then asked
 * about, and a painted-cube question is answered by the formula rather than by a
 * number someone typed. A generated puzzle whose answer is derived cannot be
 * wrong, which is the same reason the math bank is procedural.
 */
const { shuffleRelation } = require('./relations');
const { distinctChoices, spread } = require('./pool');
const V = require('./vocab');

/** n-th cube: how many unit cubes have exactly k painted faces. */
const cubeFaces = {
  three: () => 8,
  two: (n) => 12 * (n - 2),
  one: (n) => 6 * (n - 2) ** 2,
  none: (n) => (n - 2) ** 3,
};

const COMPASS = ['north', 'east', 'south', 'west'];

/** Where you end up: right is +1 quarter, left is -1, an about-face is +2. */
function facing(start, turns) {
  return turns.reduce((at, turn) => {
    if (turn === 'right') return (at + 1) % 4;
    if (turn === 'left') return (at + 3) % 4;
    return (at + 2) % 4;
  }, start);
}

/**
 * The smaller angle between clock hands, exactly. The hour hand moves half a
 * degree a minute, so at 1:15 the gap is 52.5 degrees; rounding it to 53 keyed a
 * value no clock shows, with no word in the question asking for rounding.
 */
function clockAngle(hour, minute) {
  const hourAt = ((hour % 12) * 30) + (minute * 0.5);
  const minuteAt = minute * 6;
  const gap = Math.abs(hourAt - minuteAt);
  return Math.min(gap, 360 - gap);
}

const ORDER_NAMES = ['Beto', 'Cara', 'Dia', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jo', 'Kit',
  'Lev', 'Mina', 'Nils', 'Orla', 'Pia', 'Quim', 'Rune', 'Sena', 'Tor', 'Ulla'];

const RACE_EVENTS = ['finish a race', 'cross the line', 'hand in the test', 'reach the summit',
  'arrive at the gate', 'complete the circuit', 'finish the swim', 'reach the checkpoint',
  'file their report', 'clear the obstacle course', 'board the ferry', 'finish the audition'];

const CONDITIONALS = [
  { if: 'it rains', then: 'the game is cancelled', notThen: 'the game was not cancelled', notIf: 'It did not rain' },
  { if: 'the alarm sounds', then: 'the floor is cleared', notThen: 'the floor was not cleared', notIf: 'The alarm did not sound' },
  { if: 'the bridge ices', then: 'the route closes', notThen: 'the route did not close', notIf: 'The bridge did not ice' },
  { if: 'the seal fails', then: 'the tank leaks', notThen: 'the tank did not leak', notIf: 'The seal did not fail' },
  { if: 'the quota is missed', then: 'the bonus is withheld', notThen: 'the bonus was not withheld', notIf: 'The quota was not missed' },
  { if: 'the sensor trips', then: 'the line stops', notThen: 'the line did not stop', notIf: 'The sensor did not trip' },
  { if: 'the river rises a metre', then: 'the path floods', notThen: 'the path did not flood', notIf: 'The river did not rise a metre' },
  { if: 'the batch fails inspection', then: 'the shipment is held', notThen: 'the shipment was not held', notIf: 'The batch did not fail inspection' },
  { if: 'the frost comes before harvest', then: 'the crop is lost', notThen: 'the crop was not lost', notIf: 'The frost did not come before harvest' },
  { if: 'the key card expires', then: 'the door stays shut', notThen: 'the door did not stay shut', notIf: 'The key card did not expire' },
  { if: 'the kiln runs hot', then: 'the glaze cracks', notThen: 'the glaze did not crack', notIf: 'The kiln did not run hot' },
  { if: 'the tide drops below two metres', then: 'the ferry is cancelled', notThen: 'the ferry was not cancelled', notIf: 'The tide did not drop below two metres' },
  { if: 'the filter clogs', then: 'the pump overheats', notThen: 'the pump did not overheat', notIf: 'The filter did not clog' },
  { if: 'the permit lapses', then: 'the site closes', notThen: 'the site did not close', notIf: 'The permit did not lapse' },
];

const GROUPS = [
  { all: 'member of the club', can: 'swim', some: 'sail' },
  { all: 'nurse on the ward', can: 'read a chart', some: 'speak Portuguese' },
  { all: 'driver on the route', can: 'reverse a trailer', some: 'service an engine' },
  { all: 'student in the class', can: 'use the library', some: 'play an instrument' },
  { all: 'guide at the park', can: 'read a map', some: 'climb' },
  { all: 'welder in the yard', can: 'read a drawing', some: 'dive' },
  { all: 'ranger on the reserve', can: 'identify a track', some: 'ride a horse' },
  { all: 'translator on the panel', can: 'work from French', some: 'work from Arabic' },
  { all: 'baker at the mill', can: 'shape a loaf', some: 'temper chocolate' },
  { all: 'dispatcher at the depot', can: 'read a timetable', some: 'drive a bus' },
  { all: 'archivist in the basement', can: 'handle a plate negative', some: 'read Latin' },
  { all: 'paramedic on the shift', can: 'take a pulse', some: 'drive an ambulance' },
];

/** "a" or "an", by the sound the word starts with. */
const an = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

const FAMILIES = {
  // ── verbal analogies ─────────────────────────────────────────────────────
  // Each family is one *relation*, and the pairs inside it all hold that
  // relation, so the reasoning being tested never shifts with the words.
  verbal_analogy: [
    {
      d: 2,
      slots: { pair: 'opposites' },
      relation: 'opposites',
    },
    {
      d: 3,
      slots: { pair: 'young_adult' },
      relation: 'young_adult',
    },
    {
      d: 5,
      slots: { pair: 'instrument' },
      relation: 'instrument',
    },
    {
      d: 6,
      slots: { pair: 'material' },
      relation: 'material',
    },
    {
      d: 7,
      slots: { pair: 'cause' },
      relation: 'cause',
    },
    {
      d: 4,
      slots: { pair: 'part_whole' },
      relation: 'part_whole',
    },
    {
      d: 8,
      slots: { pair: 'worker' },
      relation: 'worker',
    },
  ].map((spec) => shuffleRelation(spec)),

  // ── deduction ────────────────────────────────────────────────────────────
  logic_deduction: [
    {
      // Three-way ordering, generated from a real order so the answer is derived.
      d: 4,
      slots: {
        who: (rng) => rng.shuffle([...ORDER_NAMES]).slice(0, 3),
        event: RACE_EVENTS,
      },
      p: (s) => `Three people ${s.event}. ${s.who[1]} finishes ahead of ${s.who[2]}.`
        + ` ${s.who[0]} finishes ahead of ${s.who[1]}. Who finished last?`,
      c: (s) => [s.who[2], s.who[1], s.who[0], 'Cannot be determined'],
      a: (s) => s.who[2],
      r: (s) => `The order is ${s.who[0]}, ${s.who[1]}, ${s.who[2]}, so ${s.who[2]} is last.`,
    },
    {
      d: 4,
      slots: {
        who: (rng) => rng.shuffle([...ORDER_NAMES]).slice(0, 4),
        event: RACE_EVENTS,
      },
      p: (s) => `Four people ${s.event}. ${s.who[0]} is ahead of ${s.who[1]}.`
        + ` ${s.who[2]} is behind ${s.who[1]} but ahead of ${s.who[3]}. Who is second?`,
      c: (s) => [s.who[1], s.who[0], s.who[2], s.who[3]],
      a: (s) => s.who[1],
      r: (s) => `The order is ${s.who.join(', ')}, so second is ${s.who[1]}.`,
    },
    {
      d: 5,
      slots: { rule: CONDITIONALS },
      p: (s) => `If ${s.rule.if}, ${s.rule.then}. ${s.rule.notThen.charAt(0).toUpperCase()
        + s.rule.notThen.slice(1)}. What follows?`,
      c: (s) => [s.rule.notIf, `${s.rule.if.charAt(0).toUpperCase() + s.rule.if.slice(1)}`,
        'Something else caused it', 'Nothing follows'],
      a: (s) => s.rule.notIf,
      r: () => 'Denying the consequence of a true conditional denies the antecedent.'
        + ' This is valid, and it is called modus tollens.',
    },
    {
      d: 6,
      slots: { rule: CONDITIONALS },
      p: (s) => `If ${s.rule.if}, ${s.rule.then}. ${s.rule.if.charAt(0).toUpperCase()
        + s.rule.if.slice(1)}. What follows?`,
      c: (s) => [`${s.rule.then.charAt(0).toUpperCase() + s.rule.then.slice(1)}`,
        s.rule.notIf, 'Nothing follows', 'The conditional must be false'],
      a: (s) => `${s.rule.then.charAt(0).toUpperCase() + s.rule.then.slice(1)}`,
      r: () => 'Affirming the antecedent gives the consequent — modus ponens.',
    },
    {
      d: 7,
      slots: { group: GROUPS },
      p: (s) => `Every ${s.group.all} can ${s.group.can}. Some can ${s.group.some}. Which must be true?`,
      c: (s) => [`Some people who can ${s.group.some} can ${s.group.can}`,
        `Everyone who can ${s.group.can} is ${an(s.group.all)}`,
        `Most of them can ${s.group.some}`,
        `Nobody who can ${s.group.some} is ${an(s.group.all)}`],
      a: (s) => `Some people who can ${s.group.some} can ${s.group.can}`,
      r: (s) => `The ones who can ${s.group.some} are still every bit ${an(s.group.all)},`
        + ` and all of those can ${s.group.can}, so those people do both.`,
    },
    {
      d: 9,
      slots: { x: ['X', 'P', 'M'], y: ['Y', 'Q', 'N'], z: ['Z', 'R', 'K'] },
      p: (s) => `If all ${s.x} are ${s.y}, and no ${s.y} are ${s.z},`
        + ` what follows about ${s.x} and ${s.z}?`,
      c: (s) => [`No ${s.x} are ${s.z}`, `Some ${s.x} are ${s.z}`,
        `All ${s.z} are ${s.x}`, 'Nothing follows'],
      a: (s) => `No ${s.x} are ${s.z}`,
      r: (s) => `Every ${s.x} sits inside ${s.y}, and ${s.y} is entirely outside ${s.z},`
        + ` so no ${s.x} can be ${s.z}.`,
    },
  ],

  // ── spatial ──────────────────────────────────────────────────────────────
  spatial_reason: [
    {
      d: 4,
      slots: { folds: [1, 2, 3], holes: [1, 2] },
      p: (s) => `A square piece of paper is folded in half ${s.folds === 1 ? 'once'
        : s.folds === 2 ? 'twice' : 'three times'}, then ${s.holes === 1 ? 'a single hole is'
        : `${s.holes} holes are`} punched through all layers. When unfolded, how many holes are there?`,
      c: (s) => distinctChoices(2 ** s.folds * s.holes,
        [2 ** s.folds, s.folds * s.holes, 2 ** s.folds * s.holes * 2]),
      a: (s) => String(2 ** s.folds * s.holes),
      r: (s) => `${s.folds === 1 ? 'One fold makes' : `${s.folds} folds make`} ${2 ** s.folds} layers,`
        + ` and each punch passes through all of them: ${2 ** s.folds} × ${s.holes}.`,
    },
    {
      d: 5,
      slots: { pair: [['b', 'q'], ['d', 'p'], ['p', 'd'], ['q', 'b'], ['N', 'N'], ['S', 'S']] },
      p: (s) => `The letter "${s.pair[0]}" is rotated 180 degrees in the plane.`
        + ' Which letter shape does it most resemble?',
      c: (s) => distinctChoices(s.pair[1], ['b', 'd', 'p', 'q', 'g'].filter((l) => l !== s.pair[1])),
      a: (s) => s.pair[1],
      r: (s) => `A 180-degree rotation flips both horizontally and vertically,`
        + ` turning ${s.pair[0]} into ${s.pair[1]}. A mirror alone would give something else.`,
    },
    {
      d: 6,
      slots: { n: [3, 4, 5] },
      p: (s) => `A cube is painted on all faces, then cut into ${s.n ** 3} equal smaller cubes.`
        + ' How many small cubes have exactly one painted face?',
      c: (s) => distinctChoices(cubeFaces.one(s.n),
        [cubeFaces.two(s.n), cubeFaces.three(), cubeFaces.none(s.n)]),
      a: (s) => String(cubeFaces.one(s.n)),
      r: (s) => `The one-face cubes are the interiors of the six faces:`
        + ` 6 × ${s.n - 2}² = ${cubeFaces.one(s.n)}.`,
    },
    {
      d: 7,
      slots: { n: [3, 4, 5] },
      p: (s) => `A cube is painted and cut into ${s.n ** 3} equal cubes. How many have no paint at all?`,
      c: (s) => distinctChoices(cubeFaces.none(s.n),
        [cubeFaces.one(s.n), cubeFaces.three(), 0]),
      a: (s) => String(cubeFaces.none(s.n)),
      r: (s) => `The unpainted ones form the inner cube: ${s.n - 2}³ = ${cubeFaces.none(s.n)}.`,
    },
    {
      d: 9,
      slots: { n: [4, 5, 6] },
      p: (s) => `A ${s.n}×${s.n}×${s.n} cube built from unit cubes is painted outside, then taken apart.`
        + ' How many unit cubes have exactly two painted faces?',
      c: (s) => distinctChoices(cubeFaces.two(s.n),
        [cubeFaces.three(), cubeFaces.one(s.n), cubeFaces.none(s.n)]),
      a: (s) => String(cubeFaces.two(s.n)),
      r: (s) => `Two-face cubes lie along the edges but not at the corners:`
        + ` 12 edges × ${s.n - 2} = ${cubeFaces.two(s.n)}.`,
    },
    {
      // Facing and turning. Computed from the turns, so the space is every
      // combination of start direction and turn sequence.
      d: 4,
      slots: {
        start: [0, 1, 2, 3],
        turns: (rng) => Array.from({ length: rng.int(2, 4) }, () => rng.pick(['right', 'left', 'about'])),
      },
      p: (s) => `You are facing ${COMPASS[s.start]}. You turn ${s.turns.map((t) => (t === 'about'
        ? 'around' : t)).join(', then turn ')}. Which way are you facing?`,
      c: (s) => {
        const end = facing(s.start, s.turns);
        return [COMPASS[end], COMPASS[(end + 1) % 4], COMPASS[(end + 2) % 4], COMPASS[(end + 3) % 4]];
      },
      a: (s) => COMPASS[facing(s.start, s.turns)],
      r: (s) => `Each right turn is a quarter turn clockwise, each left turn a quarter turn the other way,`
        + ` and turning around is a half turn: starting ${COMPASS[s.start]}, you end facing ${COMPASS[facing(s.start, s.turns)]}.`,
    },
    {
      d: 6,
      slots: { n: [3, 4, 5, 6, 7] },
      p: (s) => `A solid ${s.n}×${s.n}×${s.n} block is built from unit cubes. How many of them`
        + ' touch the outside surface?',
      c: (s) => distinctChoices(s.n ** 3 - (s.n - 2) ** 3,
        [(s.n - 2) ** 3, s.n ** 3, 6 * s.n ** 2]),
      a: (s) => String(s.n ** 3 - (s.n - 2) ** 3),
      r: (s) => `Everything except the inner ${s.n - 2}³ block is on the surface:`
        + ` ${s.n ** 3} − ${(s.n - 2) ** 3} = ${s.n ** 3 - (s.n - 2) ** 3}.`,
    },
    {
      d: 7,
      slots: { hour: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], minute: [0, 10, 15, 20, 30, 40, 45, 50] },
      p: (s) => `On an analog clock at ${s.hour}:${String(s.minute).padStart(2, '0')},`
        + ' what is the smaller angle between the hands?',
      c: (s) => {
        const right = clockAngle(s.hour, s.minute);
        return distinctChoices(`${right} degrees`,
          [`${(right + 15) % 180} degrees`, `${(right + 30) % 180} degrees`, `${(right + 90) % 180} degrees`]);
      },
      a: (s) => `${clockAngle(s.hour, s.minute)} degrees`,
      r: (s) => `The hour hand sits at ${((s.hour % 12) * 30 + s.minute * 0.5).toFixed(1)}°`
        + ` and the minute hand at ${s.minute * 6}°; the smaller gap between them is`
        + ` ${clockAngle(s.hour, s.minute)}°.`,
    },
    {
      d: 8,
      // The two faces not in the row are named as the flaps, so every option is
      // a face this net has: one more choice used to be a "7" on a six-sided cube.
      slots: { strip: [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6], [1, 3, 5, 2]] },
      p: (s) => {
        const [up, down] = [1, 2, 3, 4, 5, 6].filter((n) => !s.strip.includes(n));
        return `A cube net shows four faces in a row: ${s.strip.join(', ')}, with ${up} above face`
          + ` ${s.strip[1]} and ${down} below face ${s.strip[1]}.`
          + ` When folded, which face is opposite face ${s.strip[1]}?`;
      },
      c: (s) => distinctChoices(s.strip[3], [s.strip[0], s.strip[2],
        [1, 2, 3, 4, 5, 6].find((n) => !s.strip.includes(n))]),
      a: (s) => String(s.strip[3]),
      r: (s) => `In a four-in-a-row strip, faces two apart in the strip end up opposite,`
        + ` so ${s.strip[1]} faces ${s.strip[3]} and ${s.strip[0]} faces ${s.strip[2]}.`,
    },
  ],
};


// ── frames ───────────────────────────────────────────────────────────────
// The constant part of each family's question, with the varying words left as
// holes, so the shape filter can tell two families apart when they share a
// prompt. Hand-written for the same reason as english-families.js: deriving
// them collapses every family asking the same question onto one frame, which
// is the pair the picker exists to separate, and leaves fragments with a hole
// where the sentence should be. Families that already carried a frame keep
// it; only the ones with none are set here.
//
// Written before `module.exports`, because spread hands out copies and a block
// after it would assign onto objects nothing else can reach.
// Each label names the family at that index: an earlier list ran in a
// different order from the families, so "an opposite pair" sat on the
// raw-material family and "a cube cut along lines" on the compass one.
FAMILIES.verbal_analogy[0].frame = "A is to B as C is to ___ (an opposite pair)";
FAMILIES.verbal_analogy[1].frame = "A is to B as C is to ___ (a young animal and the adult)";
FAMILIES.verbal_analogy[2].frame = "A is to B as C is to ___ (an instrument and what it measures)";
FAMILIES.verbal_analogy[3].frame = "A is to B as C is to ___ (a maker and the raw material)";
FAMILIES.verbal_analogy[4].frame = "A is to B as C is to ___ (a cause and its result)";
FAMILIES.verbal_analogy[5].frame = "A is to B as C is to ___ (a part and a whole)";
FAMILIES.verbal_analogy[6].frame = "A is to B as C is to ___ (a worker and what they produce)";
FAMILIES.logic_deduction[0].frame = "A race of three people. Who finished last?";
FAMILIES.logic_deduction[1].frame = "An order of four people. Who is second?";
FAMILIES.logic_deduction[2].frame = "If A, then B. Not B. What follows?";
FAMILIES.logic_deduction[3].frame = "If A, then B. A. What follows?";
FAMILIES.logic_deduction[4].frame = "Every A can B. Some can C. Which must be true?";
FAMILIES.logic_deduction[5].frame = "If all A are B, and no B are C, what follows about A and C?";
FAMILIES.spatial_reason[0].frame = "A paper folded in half three times, then holes punched through all layers. How many holes when unfolded?";
FAMILIES.spatial_reason[1].frame = "A letter rotated 180 degrees in the plane. Which letter does it resemble?";
FAMILIES.spatial_reason[2].frame = "A cube painted on all faces and cut into equal cubes. How many have exactly one painted face?";
FAMILIES.spatial_reason[3].frame = "A cube painted and cut into equal cubes. How many have no paint at all?";
FAMILIES.spatial_reason[4].frame = "A cube built from unit cubes and painted outside. How many have exactly two painted faces?";
FAMILIES.spatial_reason[5].frame = "Facing a compass direction, then a series of turns. Which way are you facing?";
FAMILIES.spatial_reason[6].frame = "A solid block built from unit cubes. How many touch the outside surface?";
FAMILIES.spatial_reason[7].frame = "A clock reading. What is the smaller angle between the hands?";
FAMILIES.spatial_reason[8].frame = "A net of a cube. Which face is opposite the given one?";

module.exports = { FAMILIES: spread(FAMILIES) };
