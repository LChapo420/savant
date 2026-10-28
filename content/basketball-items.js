/**
 * Basketball items: the deterministic fallback for the basketball track.
 *
 * Playing is learned on the court and judged there, from film, counts and logs;
 * the bank covers what can be asked on a screen. Statistics are computed from
 * generated box-score lines, so the arithmetic is always right. Rules, court
 * facts, cues, tactics, health, history and the professional domains come from
 * authored pools kept to settled facts, naming the rulebook where they differ.
 */
const { fromPool } = require('./pool');

const item = (o) => ({ source: 'bank', ...o });
/**
 * num / den as a percentage to one decimal place, rounded half up in whole numbers.
 * Floating point cannot be trusted at the half: 0.44 is not exact, so a true
 * shooting figure that should end in .x5 could round the wrong way.
 */
const oneDecimal = (num, den) => Math.floor((20 * num + den) / (2 * den)) / 10;
const pctOf = (num, den) => oneDecimal(100 * num, den);

const G = {
  bb_stats(rng, d) {
    const fga = rng.int(8, 22);
    const threePA = rng.int(0, Math.min(fga, d <= 4 ? 4 : 10));
    const fgm = rng.int(Math.max(1, Math.floor(fga * 0.3)), Math.ceil(fga * 0.6));
    // A possible line: the two-point makes (fgm - threePM) cannot exceed the
    // two-point attempts (fga - threePA). Drawn freely, 4 of 13 with 4 of 10 threes
    // came out as 4 twos made from 3 tried.
    const threePM = Math.max(fgm - (fga - threePA), Math.min(rng.int(0, threePA), fgm));
    const fta = rng.int(0, 10);
    const ftm = rng.int(Math.floor(fta * 0.5), fta);
    const pts = 2 * (fgm - threePM) + 3 * threePM + ftm;
    const line = `${fgm} of ${fga} from the field (${threePM} of ${threePA} threes) and ${ftm} of ${fta} free throws`;
    const kind = d <= 3 ? rng.pick(['points', 'fg']) : d <= 6 ? rng.pick(['points', 'fg', 'efg']) : rng.pick(['efg', 'ts', 'poss']);
    if (kind === 'points') {
      return item({ format: 'type_in', prompt: `A player shoots ${line}. How many points did they score?`, answer: String(pts),
        rationale: `Twos: ${fgm - threePM} x 2 = ${2 * (fgm - threePM)}; threes: ${threePM} x 3 = ${3 * threePM}; free throws: ${ftm}. Total ${pts}.` });
    }
    if (kind === 'fg') {
      const v = pctOf(fgm, fga);
      return item({ format: 'type_in', prompt: `A player makes ${fgm} of ${fga} field-goal attempts. What is their field-goal percentage, to one decimal place?`,
        answer: String(v), accepts: [String(v), `${v}%`], rationale: `FG% = makes / attempts = ${fgm} / ${fga} = ${v}%.` });
    }
    if (kind === 'efg') {
      const v = pctOf(2 * fgm + threePM, 2 * fga);
      return item({ format: 'type_in', prompt: `A player shoots ${line}. What is their effective field-goal percentage (eFG%), to one decimal place?`,
        answer: String(v), accepts: [String(v), `${v}%`],
        rationale: `eFG% = (FGM + 0.5 x 3PM) / FGA = (${fgm} + 0.5 x ${threePM}) / ${fga} = ${v}%. It credits a three as worth 1.5 twos.` });
    }
    if (kind === 'ts') {
      const v = pctOf(25 * pts, 2 * (25 * fga + 11 * fta)); // 0.44 = 11/25
      return item({ format: 'type_in', prompt: `A player shoots ${line} (${pts} points). What is their true shooting percentage (TS%), to one decimal place?`,
        answer: String(v), accepts: [String(v), `${v}%`],
        rationale: `TS% = PTS / (2 x (FGA + 0.44 x FTA)) = ${pts} / (2 x (${fga} + 0.44 x ${fta})) = ${v}%. It folds threes and free throws into one efficiency number.` });
    }
    const orb = rng.int(5, 14);
    const tov = rng.int(8, 18);
    const teamFga = rng.int(75, 95);
    const teamFta = rng.int(15, 30);
    const poss = oneDecimal(25 * (teamFga - orb + tov) + 11 * teamFta, 25);
    return item({ format: 'type_in',
      prompt: `A team has ${teamFga} field-goal attempts, ${orb} offensive rebounds, ${tov} turnovers and ${teamFta} free-throw attempts. Estimate its possessions (FGA - ORB + TOV + 0.44 x FTA), to one decimal place.`,
      answer: String(poss), accepts: [String(poss), String(Math.round(poss))],
      rationale: `${teamFga} - ${orb} + ${tov} + 0.44 x ${teamFta} = ${poss}. Possessions let you compare teams that play at different speeds.` });
  },
};

// ── Authored pools ───────────────────────────────────────────────────────
const POOLS = {
  bb_rules: [
    { d: 2, p: 'How many points is a basket from inside the three-point line worth?', c: ['2', '1', '3', '4'], a: '2', r: 'Field goals are worth 2 inside the arc and 3 beyond it; a free throw is worth 1.' },
    { d: 3, p: 'What is a travel (travelling)?', c: ['Moving your pivot foot or taking too many steps while holding the ball', 'Dribbling with two hands at once', 'Touching the ball after it goes out of bounds', 'Staying in the lane too long'], a: 'Moving your pivot foot or taking too many steps while holding the ball', r: 'Once you stop, your pivot foot must stay down until you pass or shoot.' },
    { d: 3, p: 'What is a double dribble?', c: ['Dribbling, stopping, then dribbling again, or dribbling with both hands at once', 'Taking three steps', 'Passing to yourself', 'Shooting twice'], a: 'Dribbling, stopping, then dribbling again, or dribbling with both hands at once', r: 'Once you end your dribble, you must pass or shoot.' },
    // In the NBA the "restricted area" is the arc under the basket, not the lane.
    { d: 4, p: 'How long can an offensive player stay in the lane (the painted area FIBA calls the restricted area) in the NBA and FIBA?', c: ['3 seconds', '5 seconds', '8 seconds', '10 seconds'], a: '3 seconds', r: 'The three-second rule (NBA, FIBA, and NCAA and US high-school rules too) stops attackers camping under the basket.' },
    { d: 5, p: 'How long is the shot clock in the NBA and FIBA?', c: ['24 seconds', '30 seconds', '35 seconds', '20 seconds'], a: '24 seconds', r: 'NCAA basketball uses a 30-second shot clock; high-school rules vary by state.' },
    { d: 5, p: 'How many personal fouls lead to a player fouling out in the NBA?', c: ['6', '5', '4', '7'], a: '6', r: 'In FIBA and NCAA play, a player fouls out on 5.' },
    { d: 5, p: 'How long is an NBA game, and how long is a FIBA game?', c: ['NBA 4 x 12 minutes; FIBA 4 x 10 minutes', 'Both 4 x 12 minutes', 'NBA 2 x 20; FIBA 4 x 10', 'Both 4 x 10 minutes'], a: 'NBA 4 x 12 minutes; FIBA 4 x 10 minutes', r: 'NCAA men play two 20-minute halves; NCAA women play four 10-minute quarters.' },
    // "Moving sideways" and "feet set" contradicted each other, and "feet set" is a
    // myth: once in legal guarding position a defender may move sideways or backward
    // (FIBA Art. 33, NBA Rule 12B, NFHS 4-23).
    { d: 6, p: 'A defender has established legal guarding position outside the restricted-area arc and slides sideways to stay in front of the dribbler, who runs into the defender\'s chest. What is the usual call?', c: ['Charge (offensive foul)', 'Block (defensive foul)', 'No call', 'Travel'], a: 'Charge (offensive foul)', r: 'Once in legal guarding position, a defender does not have to stand still: moving sideways or backward to stay in front is legal, so contact to the torso is a charge. It is a block if the defender had not yet established position or moved forward into the dribbler.' },
    // Touching the ball on the rim or in the cylinder is basket interference, a
    // separate violation, so it is not part of the definition.
    { d: 7, p: 'What is goaltending?', c: ['Touching a shot on its way down, while it is entirely above the rim and could still go in', 'Blocking a shot on its way up', 'Fouling the shooter', 'Standing in the lane'], a: 'Touching a shot on its way down, while it is entirely above the rim and could still go in', r: 'If the defence goaltends, the basket counts (NBA, FIBA and US high-school rules). Touching the ball while it is on the rim or inside the cylinder is a related violation, basket interference.' },
  ],
  bb_court: [
    { d: 2, p: 'How high is a regulation basketball rim?', c: ['10 feet (3.05 m)', '9 feet', '11 feet', '8 feet'], a: '10 feet (3.05 m)', r: 'Mini-basketball lowers the rim for young players so good technique is possible.' },
    { d: 4, p: 'How far is the NBA three-point line at the top of the arc?', c: ['23 feet 9 inches (7.24 m)', '22 feet (6.71 m)', '20 feet 9 inches (6.32 m)', '25 feet (7.62 m)'], a: '23 feet 9 inches (7.24 m)', r: 'In the corners it is 22 feet (6.71 m). FIBA\'s line is 6.75 m round the arc and 6.60 m in the corners.' },
    { d: 4, p: 'How far is the free-throw line from the backboard?', c: ['15 feet (4.6 m) from the backboard face', '12 feet', '19 feet 9 inches', '10 feet'], a: '15 feet (4.6 m) from the backboard face', r: 'The free-throw line is about 4.6 m from the backboard face in both NBA and FIBA courts.' },
    { d: 3, p: 'Why do young players use a smaller ball and a lower rim?', c: ['So they can use good shooting technique instead of heaving the ball', 'To make the game faster', 'To save money', 'Because of league fees'], a: 'So they can use good shooting technique instead of heaving the ball', r: 'Equipment scaled to body size lets children learn correct form; youth guidelines recommend it.' },
  ],
  bb_skills: [
    { d: 2, p: 'What is the triple-threat position?', c: ['Holding the ball low and ready so you can shoot, pass or dribble', 'Dribbling with both hands', 'Standing under the basket', 'Jumping before you catch'], a: 'Holding the ball low and ready so you can shoot, pass or dribble', r: 'From triple threat the defender cannot know which of the three you will do.' },
    { d: 2, p: 'What is a jump stop?', c: ['Landing on both feet at the same time to stop, so either foot can become the pivot', 'Jumping to shoot', 'Stopping on one foot', 'A move to avoid a charge'], a: 'Landing on both feet at the same time to stop, so either foot can become the pivot', r: 'It gives balance and pivot choice, and helps avoid travels.' },
    { d: 3, p: 'Which kind of cue tends to help shooting most?', c: ['An external cue, such as "drop it just over the front rim"', 'A cue about the elbow angle', 'A cue about wrist muscles', 'No cue at all'], a: 'An external cue, such as "drop it just over the front rim"', r: 'Meta-analyses find attention on the outcome or target helps learning more than attention on body parts.' },
    { d: 3, p: 'What does a good bounce pass aim for?', c: ['Bouncing about two-thirds of the way to the receiver so it arrives at waist height', 'Bouncing right in front of the passer', 'Bouncing at the receiver\'s feet', 'Bouncing twice'], a: 'Bouncing about two-thirds of the way to the receiver so it arrives at waist height', r: 'That makes it easy to catch and hard to steal.' },
    { d: 4, p: 'Why practise lay-ups with both hands from the start?', c: ['Finishing with the outside hand protects the ball from the defender on either side', 'It looks better', 'The rules require it', 'It is only for left-handed players'], a: 'Finishing with the outside hand protects the ball from the defender on either side', r: 'Youth programmes teach both-hand lay-ups early because the weak side is easy to defend.' },
    { d: 5, p: 'What is boxing out?', c: ['Making contact and holding your position between your opponent and the basket after a shot', 'Guarding the ball handler', 'Passing out of a double team', 'Setting a screen'], a: 'Making contact and holding your position between your opponent and the basket after a shot', r: 'Find, hit, then go get the ball.' },
  ],
  bb_tactics: [
    { d: 4, p: 'In man-to-man defence, what is "help side"?', c: ['The side of the floor away from the ball, where defenders sag to help stop drives', 'The side the ball is on', 'The baseline', 'The bench side'], a: 'The side of the floor away from the ball, where defenders sag to help stop drives', r: 'Defenders one pass away deny; two passes away help.' },
    { d: 4, p: 'What is a give-and-go?', c: ['Pass to a teammate, cut to the basket and get the ball back', 'Dribble handoff', 'A full-court press', 'A zone defence'], a: 'Pass to a teammate, cut to the basket and get the ball back', r: 'It punishes defenders who relax after the pass.' },
    { d: 5, p: 'What is the "pick and roll"?', c: ['A screener blocks the ball handler\'s defender, then rolls to the basket for a pass', 'Two players switching defence', 'A rebound play', 'A free-throw lineup'], a: 'A screener blocks the ball handler\'s defender, then rolls to the basket for a pass', r: 'It is the most common action in modern basketball.' },
    { d: 6, p: 'In pick-and-roll defence, what does "drop" coverage mean?', c: ['The screener\'s defender sinks toward the basket to protect the rim', 'The defenders swap players', 'Both defenders trap the ball handler', 'The defender goes under the screen'], a: 'The screener\'s defender sinks toward the basket to protect the rim', r: 'Drop gives up mid-range pull-ups to protect the rim; switching, hedging, blitzing and ICE are other coverages.' },
    { d: 6, p: 'Why is good spacing important on offence?', c: ['Spread-out players make it hard for one defender to guard two attackers and open driving lanes', 'It saves energy', 'The rules require it', 'It makes passes shorter'], a: 'Spread-out players make it hard for one defender to guard two attackers and open driving lanes', r: 'Bunched players let one defender help on two.' },
  ],
  bb_health: [
    { d: 2, p: 'What should you do before every practice or game?', c: ['A proper warm-up, such as an 11+-style neuromuscular warm-up', 'Static stretching only', 'Nothing', 'Shoot half-court shots'], a: 'A proper warm-up, such as an 11+-style neuromuscular warm-up', r: 'Structured warm-ups with running, strength, landing and balance cut injury rates in trials.' },
    { d: 3, p: 'A player bumps heads and then has a headache and feels dizzy. What should happen?', c: ['Stop playing right away, no return that day, and see a healthcare provider before playing again', 'Rest five minutes then continue', 'Drink water and keep playing', 'Play but avoid contact'], a: 'Stop playing right away, no return that day, and see a healthcare provider before playing again', r: 'Suspected concussions need removal from play and clearance; this is the CDC HEADS UP guidance.' },
    { d: 4, p: 'How should you land from a jump to protect your knees?', c: ['Softly on both feet with knees bent and tracking over the toes', 'Stiff-legged', 'With knees pointing inward', 'On your heels'], a: 'Softly on both feet with knees bent and tracking over the toes', r: 'Knees caving inward on landing is a risk pattern for ACL injuries.' },
    { d: 5, p: 'What do the NBA and USA Basketball youth guidelines say about specialising in basketball only?', c: ['Delay it until about 14 and play other sports', 'Specialise as early as possible', 'Specialise by age 8', 'They give no advice'], a: 'Delay it until about 14 and play other sports', r: 'Early single-sport specialisation is linked to overuse injury and burnout; the guidelines also cap weekly hours and set rest days.' },
    { d: 5, p: 'Which kind of pain means you should stop the session?', c: ['Pain that changes how you move or lasts into the next day', 'Normal tiredness', 'A good burn in the legs', 'Being out of breath'], a: 'Pain that changes how you move or lasts into the next day', r: 'Stop, log it, and get it checked if it lasts or comes back.' },
  ],
  bb_mental: [
    { d: 3, p: 'Why use the same free-throw routine every time?', c: ['A consistent routine settles focus and makes the shot more repeatable under pressure', 'The rules require it', 'It wastes the defender\'s time', 'It has no effect'], a: 'A consistent routine settles focus and makes the shot more repeatable under pressure', r: 'Studies of imagery and routines show benefits for free-throw performance.' },
    { d: 4, p: 'After a mistake in a game, what helps most?', c: ['A quick reset routine and focus on the next play', 'Thinking about the mistake until the break', 'Arguing with the referee', 'Asking to be subbed out'], a: 'A quick reset routine and focus on the next play', r: 'Next-play focus keeps one mistake from becoming two.' },
  ],
  bb_history: [
    { d: 3, p: 'Who invented basketball, and when?', c: ['James Naismith, in 1891', 'Michael Jordan, in 1984', 'James Naismith, in 1936', 'Abraham Lincoln, in 1861'], a: 'James Naismith, in 1891', r: 'Naismith invented it in Springfield, Massachusetts, with peach baskets as the goals.' },
    { d: 4, p: 'Why was the 24-second shot clock introduced in 1954?', c: ['To stop teams stalling with the ball and to speed up the game', 'To give players rest', 'To lengthen games', 'For television adverts only'], a: 'To stop teams stalling with the ball and to speed up the game', r: 'Danny Biasone of the Syracuse Nationals is credited with it; scoring rose sharply afterwards.' },
    { d: 5, p: 'When did the NBA add the three-point line?', c: ['The 1979-80 season', '1954', '1996', '2010'], a: 'The 1979-80 season', r: 'The ABA used it earlier; the three-point revolution in shot selection came decades later.' },
    { d: 5, p: 'In which Olympic Games did men\'s basketball first appear as a medal sport?', c: ['Berlin 1936', 'Los Angeles 1932', 'London 1948', 'Montreal 1976'], a: 'Berlin 1936', r: 'Women\'s Olympic basketball began in Montreal in 1976.' },
    { d: 6, p: 'When did the WNBA play its first season?', c: ['1997', '1984', '2005', '1976'], a: '1997', r: 'It was founded with NBA support in 1996 and began play in 1997.' },
  ],
  bb_officiating: [
    { d: 5, p: 'In FIBA basketball, how many officials usually work a top-level game?', c: ['Three (a crew chief and two umpires)', 'One', 'Two', 'Five'], a: 'Three (a crew chief and two umpires)', r: 'Three-person mechanics are the standard at top level; youth games often use two.' },
    { d: 6, p: 'Why do officials use set positions and rotations?', c: ['So that every part of the floor and every matchup is watched from a good angle', 'To stay out of the players\' way only', 'Because the rules forbid moving', 'To save energy'], a: 'So that every part of the floor and every matchup is watched from a good angle', r: 'Good position is what makes a correct call possible.' },
  ],
  bb_coaching: [
    { d: 5, p: 'Which practice design keeps young players most engaged and learning?', c: ['Small-sided games with everyone active and rules that shape the skill', 'Long lines waiting for one shot each', 'Running laps as punishment', '5v5 scrimmage only'], a: 'Small-sided games with everyone active and rules that shape the skill', r: 'Small-sided games give far more touches and decisions per player than 5v5 or lines.' },
    { d: 6, p: 'What is a constraints-led approach to coaching?', c: ['Changing the task, space or rules so that players discover good solutions', 'Telling players exactly how to move every body part', 'Only running drills without defence', 'Coaching by video only'], a: 'Changing the task, space or rules so that players discover good solutions', r: 'For example, "no dribbling" forces spacing and cutting.' },
  ],
  bb_frontier: [
    { d: 6, p: 'What did the 2018 Miller and Sanjurjo paper show about the "hot hand"?', c: ['The original 1985 test had a statistical bias, and corrected analyses find evidence of a modest hot hand', 'The hot hand is pure myth', 'Shooters always get colder after makes', 'Hot streaks only happen in practice'], a: 'The original 1985 test had a statistical bias, and corrected analyses find evidence of a modest hot hand', r: 'Their finding reversed the famous Gilovich, Vallone and Tversky conclusion.' },
    { d: 6, p: 'Dean Oliver\'s "Four Factors" of winning are shooting, turnovers, rebounding and…', c: ['getting to the free-throw line', 'height', 'three-point attempts', 'pace'], a: 'getting to the free-throw line', r: 'Shooting (eFG%) matters most, then turnovers, rebounding and free throws.' },
    { d: 7, p: 'Why did many teams shift toward more three-pointers and shots at the rim?', c: ['Those shots return more points per attempt than long two-pointers', 'Three-pointers are easier to make', 'Rules banned mid-range shots', 'Fans demanded it'], a: 'Those shots return more points per attempt than long two-pointers', r: 'A 36% three is worth about 1.08 points; a 40% long two about 0.80.' },
    { d: 7, p: 'What does player-tracking data (such as Second Spectrum) record?', c: ['The positions of every player and the ball many times per second', 'Only made and missed shots', 'Heart rate only', 'Ticket sales'], a: 'The positions of every player and the ball many times per second', r: 'It made new measures like shot quality and defensive impact possible.' },
  ],
};

for (const [skill, pool] of Object.entries(POOLS)) G[skill] = fromPool(pool, skill);

module.exports = { GENERATORS: G, POOLS };
