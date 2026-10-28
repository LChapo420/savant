/**
 * Math skills the bank was missing at both ends of the track (grade-fit, 2026-10-24).
 *
 * The bank's 24 math skills start at "3 + 4" and stop at right-triangle trig, so a
 * preschool grade could only be served addition and linear equations, and a
 * doctoral grade only high-school algebra. These fill both ends: counting, facts
 * within 20, shapes and patterns, place value, money/time/units and data for the
 * early grades; calculus, linear algebra, probability, discrete mathematics,
 * abstract algebra, analysis and topology for the late ones. Which grade may use
 * which skill is config/grade-skills.js.
 *
 * Same contract as math-items.js: (rng, d) -> item, every answer computed, never
 * typed. Every prompt is a fixed template that scripts/math-reading-template-audit.js
 * reads back and re-solves by its own route, so a new template must get a
 * verifier there or the audit fails.
 */
const { choicesFrom } = require('./rng');

const item = (o) => ({ source: 'bank', ...o });
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a, b) => (a / gcd(a, b)) * b;
function frac(n, d) {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`;
}
const round2 = (x) => Math.round(x * 100) / 100;
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };
const phi = (n) => { let c = 0; for (let k = 1; k <= n; k++) if (gcd(k, n) === 1) c++; return c; };
const divisors = (n) => { const out = []; for (let k = 1; k <= n; k++) if (n % k === 0) out.push(k); return out; };
const comma = (n) => n.toLocaleString('en-US');
/** "x^2 - 5x + 2" from [3, -5, 2] (highest power first), the way the other generators write it. */
function poly(coefs) {
  const deg = coefs.length - 1;
  let out = '';
  coefs.forEach((c, i) => {
    if (c === 0) return;
    const p = deg - i;
    const v = p === 0 ? '' : p === 1 ? 'x' : `x^${p}`;
    const abs = Math.abs(c);
    const num = abs === 1 && v ? '' : String(abs);
    out += out ? ` ${c < 0 ? '-' : '+'} ${num}${v}` : `${c < 0 ? '-' : ''}${num}${v}`;
  });
  return out || '0';
}
const tier = (d, cuts) => { let i = 0; while (i < cuts.length && d >= cuts[i]) i++; return i; };
const pickKind = (rng, d, cuts, lists) => rng.pick(lists[tier(d, cuts)]);
const plural = (n, one, many) => (n === 1 ? one : many);
/** A coefficient on a variable as written: "x", "-x", "3x" — never "1x". */
const co = (a, v) => `${a === 1 ? '' : a === -1 ? '-' : a}${v}`;

// ── early number ────────────────────────────────────────────────────────────
const SYMBOLS = [['★', 'stars'], ['●', 'dots'], ['■', 'squares'], ['▲', 'triangles'], ['♥', 'hearts']];
const NAMES = ['Ana', 'Ben', 'Mia', 'Leo', 'Zoe', 'Sam', 'Ivy', 'Max'];
const THINGS = ['apples', 'stickers', 'blocks', 'shells', 'crayons', 'marbles', 'cookies', 'balloons'];

const TEEN_WORDS = { 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen', 20: 'twenty' };
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function teenPlaceValue(rng) {
  const kind = rng.pick(['makeTeen', 'bundles', 'split', 'tensIn', 'onesDigit', 'tenFrame', 'compare', 'tenMore', 'tenLess', 'countOn', 'word']);
  const o = rng.int(1, 9);
  if (kind === 'tenLess') {
    return item({ format: 'type_in', prompt: `What is 10 less than ${10 + o}?`, answer: String(o),
      rationale: `Take away the ten from ${10 + o} and the ${o} ${plural(o, 'one is', 'ones are')} left.` });
  }
  if (kind === 'countOn') {
    return item({ format: 'type_in', prompt: `Start at 10 and count on ${o} more. What number do you reach?`, answer: String(10 + o),
      rationale: `Counting on ${o} from 10: ${Array.from({ length: o }, (_, i) => 11 + i).join(', ')}. You reach ${10 + o}.` });
  }
  if (kind === 'word') {
    const n = 10 + o;
    const others = rng.sample([11, 12, 13, 14, 15, 16, 17, 18, 19, 20].filter((k) => k !== n), 2);
    return item({ format: 'multiple_choice', prompt: `Which number is ${TEEN_WORDS[n]}?`, choices: rng.shuffle([n, ...others].map(String)), answer: String(n),
      rationale: `${cap1(TEEN_WORDS[n])} is written ${n}: one ten and ${o} ${plural(o, 'one', 'ones')}.` });
  }
  if (kind === 'makeTeen') {
    return item({ format: 'type_in', prompt: `What number is 1 ten and ${o} ${plural(o, 'one', 'ones')}?`, answer: String(10 + o),
      rationale: `1 ten is 10, and ${o} more makes ${10 + o}.` });
  }
  if (kind === 'bundles') {
    const name = rng.pick(NAMES); const thing = rng.pick(THINGS);
    const loose = rng.int(2, 9); // THINGS are plural nouns
    return item({ format: 'type_in', prompt: `${name} has 1 bag of 10 ${thing} and ${loose} loose ${thing}. How many ${thing} is that in all?`, answer: String(10 + loose),
      rationale: `1 bag of 10 is 10; with ${loose} more that is ${10 + loose}.` });
  }
  if (kind === 'split') {
    return item({ format: 'type_in', prompt: `${10 + o} = 10 + ___`, answer: String(o),
      rationale: `${10 + o} is one ten and ${o} ${plural(o, 'one', 'ones')}, so ${10 + o} = 10 + ${o}.` });
  }
  if (kind === 'tensIn') {
    const n = rng.int(10, 20);
    return item({ format: 'type_in', prompt: `How many tens are in ${n}?`, answer: String(Math.floor(n / 10)),
      rationale: n === 20 ? '20 is two tens and no ones.' : `${n} is one ten and ${n - 10} ${plural(n - 10, 'one', 'ones')}.` });
  }
  if (kind === 'onesDigit') {
    const n = 10 + o;
    return item({ format: 'type_in', prompt: `What digit is in the ones place of ${n}?`, answer: String(o),
      rationale: `${n} is 1 ten and ${o} ${plural(o, 'one', 'ones')}, so the ones digit is ${o}.` });
  }
  if (kind === 'tenFrame') {
    return item({ format: 'type_in', prompt: `A ten frame is full and ${o} more ${plural(o, 'dot is', 'dots are')} next to it. How many dots are there in all?`, answer: String(10 + o),
      rationale: `A full ten frame holds 10, and ${o} more makes ${10 + o}.` });
  }
  if (kind === 'compare') {
    const [a, b] = rng.sample(Array.from({ length: 11 }, (_, i) => 10 + i), 2);
    return item({ format: 'type_in', prompt: `Which is more: ${a} or ${b}?`, answer: String(Math.max(a, b)),
      rationale: Math.max(a, b) === 20 ? '20 is two tens, more than any number with one ten.' : `Both have one ten, so compare the ones: ${Math.max(a, b)} is more.` });
  }
  return item({ format: 'type_in', prompt: `What is 10 more than ${o}?`, answer: String(10 + o),
    rationale: `10 more than ${o} is one ten and ${o} ${plural(o, 'one', 'ones')}: ${10 + o}.` });
}

const G = {
  counting(rng, d) {
    const max = d < 1.7 ? 5 : d < 2.4 ? 10 : 20;
    // Numbers stay within 20: counting by tens to 100 belongs to place value,
    // which the Kindergarten grades also draw from (config/grade-skills.js).
    const kind = pickKind(rng, d, [1.7, 2.4, 2.8], [
      ['count', 'after', 'before', 'greatest', 'between', 'countOn', 'moreGroup', 'numeral'],
      ['count', 'after', 'before', 'greatest', 'oneMore', 'oneLess', 'between', 'countOn', 'moreGroup', 'numeral'],
      ['count', 'after', 'before', 'greatest', 'smallest', 'oneMore', 'oneLess', 'teen', 'between', 'countOn', 'moreGroup'],
      ['after', 'before', 'greatest', 'smallest', 'oneMore', 'oneLess', 'teen', 'between', 'countOn'],
    ]);
    if (kind === 'between') {
      const n = rng.int(0, max - 2);
      return item({ format: 'type_in', prompt: `What number is between ${n} and ${n + 2}?`, answer: String(n + 1),
        rationale: `Count ${n}, ${n + 1}, ${n + 2}: the number in the middle is ${n + 1}.` });
    }
    if (kind === 'countOn') {
      const n = rng.int(0, max - 3);
      return item({ format: 'type_in', prompt: `Count on: ${n}, ${n + 1}, ${n + 2}, ___. What comes next?`, answer: String(n + 3),
        rationale: `Each number is one more than the one before, so after ${n + 2} comes ${n + 3}.` });
    }
    if (kind === 'moreGroup') {
      const [a, b] = rng.sample(Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1), 2);
      const sym = rng.pick(SYMBOLS)[0];
      const marks = (k) => Array(k).fill(sym).join(' ');
      return item({ format: 'multiple_choice', prompt: `Which group has more? A: ${marks(a)}   B: ${marks(b)}`, choices: ['A', 'B', 'they have the same'], answer: a > b ? 'A' : 'B',
        rationale: `Count each group: A has ${a} and B has ${b}, so ${a > b ? 'A' : 'B'} has more.` });
    }
    if (kind === 'numeral') {
      const n = rng.int(1, Math.min(max, 10));
      const [sym, name] = rng.pick(SYMBOLS);
      const others = rng.sample(Array.from({ length: Math.min(max, 10) + 1 }, (_, i) => i).filter((k) => k !== n && k > 0), 2);
      return item({ format: 'multiple_choice', prompt: `Which number tells how many ${name}? ${Array(n).fill(sym).join(' ')}`, choices: rng.shuffle([n, ...others].map(String)), answer: String(n),
        rationale: `Count them one at a time: there ${n === 1 ? 'is 1' : `are ${n}`}, so the number is ${n}.` });
    }
    if (kind === 'count') {
      const n = rng.int(1, Math.min(max, 12));
      const [sym, name] = rng.pick(SYMBOLS);
      return item({ format: 'type_in', prompt: `How many ${name}? ${Array(n).fill(sym).join(' ')}`, answer: String(n),
        rationale: `Touch each one once as you count: ${Array.from({ length: n }, (_, i) => i + 1).join(', ')}. There ${n === 1 ? 'is 1' : `are ${n}`}.` });
    }
    if (kind === 'after' || kind === 'before') {
      const n = kind === 'after' ? rng.int(0, max - 1) : rng.int(1, max);
      const a = kind === 'after' ? n + 1 : n - 1;
      return item({ format: 'type_in', prompt: `What number comes just ${kind} ${n}?`, answer: String(a),
        rationale: kind === 'after' ? `Counting on from ${n}, the next number is ${a}.` : `Counting back from ${n}, the number before it is ${a}.` });
    }
    if (kind === 'greatest' || kind === 'smallest') {
      const nums = rng.sample(Array.from({ length: max + 1 }, (_, i) => i), 3);
      const a = kind === 'greatest' ? Math.max(...nums) : Math.min(...nums);
      return item({ format: 'multiple_choice', prompt: `Which number is the ${kind}?`, choices: rng.shuffle(nums.map(String)), answer: String(a),
        rationale: `Counting up, you reach ${a} ${kind === 'greatest' ? 'after' : 'before'} the other two numbers, so it is the ${kind}.` });
    }
    if (kind === 'oneMore' || kind === 'oneLess') {
      const n = kind === 'oneMore' ? rng.int(0, max - 1) : rng.int(1, max);
      const a = kind === 'oneMore' ? n + 1 : n - 1;
      return item({ format: 'type_in', prompt: `What is one ${kind === 'oneMore' ? 'more' : 'less'} than ${n}?`, answer: String(a),
        rationale: `One ${kind === 'oneMore' ? 'more' : 'less'} than ${n} is the next number ${kind === 'oneMore' ? 'up' : 'down'}: ${a}.` });
    }
    const n = rng.int(11, 19);
    return item({ format: 'type_in', prompt: `${n} is one ten and how many ones?`, answer: String(n - 10),
      rationale: `${n} = 10 + ${n - 10}, so it is one ten and ${n - 10} ${plural(n - 10, 'one', 'ones')}.` });
  },

  facts_within_20(rng, d) {
    const limit = d < 1.5 ? 5 : d < 2.2 ? 10 : 20;
    // "How many more" (compare) problems are 1.OA.1; Kindergarten's are add to,
    // take from, put together and take apart within 10 (K.OA.2).
    const kind = rng.pick(['sum', 'diff', 'missing', 'missingRight', 'story', 'storyAway', 'doubles', 'decompose', 'putTogether', ...(limit >= 20 ? ['compare'] : [])]);
    const sumPair = () => { const s = rng.int(2, limit); const a = rng.int(1, s - 1); return [a, s - a, s]; };
    // K.OA.3: a number split into two parts; K.OA.2: two groups put together.
    if (kind === 'decompose') { const s = rng.int(3, Math.min(limit, 10)); const a = rng.int(1, s - 1); return item({ format: 'type_in', prompt: `${s} = ${a} + ___`, answer: String(s - a), rationale: `${s} can be split into ${a} and ${s - a}, because ${a} + ${s - a} = ${s}.` }); }
    if (kind === 'putTogether') {
      const [a, b, s] = sumPair(); const nm = rng.pick(NAMES); const th = rng.pick(THINGS);
      if (a < 2 || b < 2) return G.facts_within_20(rng, d);
      return item({ format: 'type_in', prompt: `${nm} has ${a} red ${th} and ${b} blue ${th}. How many ${th} does ${nm} have in all?`, answer: String(s), rationale: `Put the two groups together: ${a} + ${b} = ${s}.` });
    }
    if (kind === 'sum') { const [a, b, s] = sumPair(); return item({ format: 'type_in', prompt: `${a} + ${b} =`, answer: String(s), rationale: `Start at ${a} and count on ${b}: ${s}.` }); }
    if (kind === 'doubles') { const a = rng.int(1, Math.floor(limit / 2)); return item({ format: 'type_in', prompt: `${a} + ${a} =`, answer: String(2 * a), rationale: `A double: ${a} + ${a} = ${2 * a}.` }); }
    if (kind === 'diff') { const [a, b, s] = sumPair(); return item({ format: 'type_in', prompt: `${s} - ${a} =`, answer: String(b), rationale: `Think addition: ${a} + ${b} = ${s}, so ${s} - ${a} = ${b}.` }); }
    if (kind === 'missing') { const [a, b, s] = sumPair(); return item({ format: 'type_in', prompt: `___ + ${b} = ${s}`, answer: String(a), rationale: `${s} - ${b} = ${a}, and ${a} + ${b} = ${s}.` }); }
    if (kind === 'missingRight') {
      const target = limit >= 10 && rng.bool(0.5) ? 10 : rng.int(3, limit);
      const a = rng.int(1, target - 1);
      return item({ format: 'type_in', prompt: `${a} + ___ = ${target}`, answer: String(target - a), rationale: `Count on from ${a} to ${target}: that is ${target - a} more.` });
    }
    const name = rng.pick(NAMES);
    const thing = rng.pick(THINGS);
    if (kind === 'story') {
      const [a, b, s] = sumPair();
      if (a < 2) return G.facts_within_20(rng, d);
      return item({ format: 'type_in', prompt: `${name} has ${a} ${thing}. ${name} gets ${b} more. How many ${thing} does ${name} have now?`, answer: String(s),
        rationale: `Getting more means adding: ${a} + ${b} = ${s}.` });
    }
    if (kind === 'storyAway') {
      const [a, b, s] = sumPair();
      return item({ format: 'type_in', prompt: `${name} has ${s} ${thing} and gives ${a} away. How many ${thing} are left?`, answer: String(b),
        rationale: `Giving some away means taking away: ${s} - ${a} = ${b}.` });
    }
    const [p, q] = rng.sample(NAMES.filter((n) => n !== name), 2);
    const big = rng.int(3, limit);
    const small = rng.int(2, big - 1);
    return item({ format: 'type_in', prompt: `${p} has ${big} ${thing}. ${q} has ${small} ${thing}. How many more ${thing} does ${p} have than ${q}?`, answer: String(big - small),
      rationale: `Compare by subtracting: ${big} - ${small} = ${big - small}.` });
  },

  shapes(rng, d) {
    const SIDES = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, octagon: 8 };
    const FLAT = ['circle', 'square', 'triangle', 'rectangle'];
    const SOLID = ['cube', 'sphere', 'cone', 'cylinder'];
    const kind = pickKind(rng, d, [1.7, 2.2], [
      ['sides', 'corners', 'which', 'solid', 'flat', 'pattern', 'longer', 'round', 'name'],
      ['sides', 'corners', 'which', 'solid', 'flat', 'pattern', 'longer', 'heavier', 'round', 'name'],
      ['sides', 'which', 'solid', 'pattern', 'longer', 'heavier', 'parts', 'name'],
    ]);
    // Kindergarten names triangles, squares and hexagons (K.G.2); pentagons and
    // octagons come with grade 1-2 attributes (1.G.1, 2.G.1).
    const shapes = d < 2.2 ? ['triangle', 'square', 'hexagon'] : Object.keys(SIDES);
    if (kind === 'round') {
      return item({ format: 'multiple_choice', prompt: 'Which shape is round and has no corners?', choices: rng.shuffle(['circle', ...rng.sample(['square', 'triangle', 'rectangle', 'hexagon'], 3)]), answer: 'circle',
        rationale: 'A circle is round all the way around, so it has no straight sides and no corners.' });
    }
    if (kind === 'name') {
      const s = rng.pick(shapes);
      const opts = rng.sample(shapes.filter((k) => k !== s), 2);
      return item({ format: 'multiple_choice', prompt: `A shape has ${SIDES[s]} straight sides and ${SIDES[s]} corners. What shape is it?`, choices: rng.shuffle([s, ...opts, 'circle']), answer: s,
        rationale: `A ${s} has ${SIDES[s]} sides and ${SIDES[s]} corners.` });
    }
    if (kind === 'sides' || kind === 'corners') {
      const s = rng.pick(shapes);
      return item({ format: 'type_in', prompt: kind === 'sides' ? `How many sides does a ${s} have?` : `Count the corners on a ${s}. How many corners are there?`, answer: String(SIDES[s]),
        rationale: `A ${s} has ${SIDES[s]} straight sides and ${SIDES[s]} corners.` });
    }
    if (kind === 'which') {
      const opts = rng.sample(shapes, 3);
      const s = rng.pick(opts);
      return item({ format: 'multiple_choice', prompt: `Which shape has ${SIDES[s]} sides?`, choices: rng.shuffle([...opts, 'circle']), answer: s,
        rationale: `A ${s} has ${SIDES[s]} sides; a circle has no straight sides at all.` });
    }
    if (kind === 'solid' || kind === 'flat') {
      const one = rng.pick(kind === 'solid' ? SOLID : FLAT);
      const others = rng.sample(kind === 'solid' ? FLAT : SOLID, 3);
      return item({ format: 'multiple_choice', prompt: kind === 'solid' ? 'Which of these is a solid shape, not a flat one?' : 'Which one is flat, like a shape drawn on paper?',
        choices: rng.shuffle([one, ...others]), answer: one,
        rationale: kind === 'solid' ? `A ${one} takes up space and you can hold it; the others are flat.` : `A ${one} is flat, like a drawing; the others are solids you can hold.` });
    }
    if (kind === 'pattern') {
      const COLOURS = ['red', 'blue', 'green', 'yellow', 'purple'];
      const unitShape = rng.pick(d < 1.7 ? ['AB'] : ['AB', 'AAB', 'ABB', 'ABC']);
      const tokens = rng.sample(COLOURS, 4);
      const unit = [...unitShape].map((ch) => tokens['ABC'.indexOf(ch)]);
      const shown = [];
      const len = unit.length * 2 + rng.int(0, unit.length - 1);
      for (let i = 0; i < len; i++) shown.push(unit[i % unit.length]);
      const next = unit[len % unit.length];
      const used = [...new Set(unit)];
      const choices = [...used, ...tokens.filter((t) => !used.includes(t))].slice(0, Math.max(3, used.length));
      return item({ format: 'multiple_choice', prompt: `What comes next in the pattern? ${shown.join(', ')}, ___`, choices: rng.shuffle(choices), answer: next,
        rationale: `The part that repeats is ${unit.join(', ')}. After ${shown.join(', ')} the next one is ${next}.` });
    }
    if (kind === 'longer' || kind === 'heavier') {
      const [x, y] = rng.sample(kind === 'longer' ? ['pencil', 'crayon', 'ribbon', 'stick', 'straw'] : ['box', 'bag', 'book', 'ball', 'toy car'], 2);
      let a = rng.int(2, 12); let b = rng.int(2, 12);
      while (b === a) b = rng.int(2, 12);
      const unit = kind === 'longer' ? 'cubes long' : 'blocks heavy on a balance';
      const win = a > b ? x : y;
      const same = kind === 'longer' ? 'they are the same length' : 'they weigh the same';
      return item({ format: 'multiple_choice', prompt: `The ${x} is ${a} ${unit}. The ${y} is ${b} ${unit}. Which is ${kind}?`, choices: rng.shuffle([`the ${x}`, `the ${y}`, same]), answer: `the ${win}`,
        rationale: `${Math.max(a, b)} is more than ${Math.min(a, b)}, so the ${win} is ${kind}.` });
    }
    const PARTS = { 2: 'one half', 3: 'one third', 4: 'one fourth' };
    // Halves and fourths are 1.G.3; thirds are 2.G.3.
    const n = rng.pick(d < 2.5 ? [2, 4] : [2, 3, 4]);
    const thing = rng.pick(['sandwich', 'pizza', 'paper square', 'cake']);
    return item({ format: 'multiple_choice', prompt: `A ${thing} is cut into ${n} equal parts. What is each part called?`, choices: rng.shuffle(Object.values(PARTS)), answer: PARTS[n],
      rationale: `${n} equal parts make the whole, so each part is ${PARTS[n]}.` });
  },

  place_value(rng, d) {
    // The easiest band is Kindergarten's: numbers to 20, where a teen number is
    // one ten and some ones. Two-digit numbers in general start at the next band.
    if (d < 1.7) return teenPlaceValue(rng);
    const digits = d < 2 ? 2 : d < 2.8 ? 3 : d < 3.4 ? 4 : 6;
    // Rounding is 3.NBT.1, so the grade-2 slice (2 to 2.4) has none.
    const kind = pickKind(rng, d, [2, 2.4, 3.4, 3.9], [
      ['value', 'place', 'expanded', 'tenMore', 'greatest', 'makeNumber', 'bundles'],
      ['value', 'place', 'expanded', 'tenMore', 'greatest'],
      ['value', 'place', 'expanded', 'round', 'tenMore', 'greatest'],
      ['value', 'place', 'expanded', 'round', 'tenMore', 'greatest'],
      ['decimalValue', 'value', 'round', 'greatest'],
    ]);
    const distinct = (k) => {
      const ds = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9, 0], k);
      if (ds[0] === 0) [ds[0], ds[1]] = [ds[1], ds[0]];
      return ds;
    };
    const PLACE = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands'];
    if (kind === 'makeNumber') {
      const t = rng.int(1, 9); const o = rng.int(0, 9);
      return item({ format: 'type_in', prompt: `What number is ${t} ${plural(t, 'ten', 'tens')} and ${o} ${plural(o, 'one', 'ones')}?`, answer: String(10 * t + o),
        rationale: `${t} ${plural(t, 'ten', 'tens')} is ${10 * t}, and ${o} more makes ${10 * t + o}.` });
    }
    if (kind === 'bundles') {
      const t = rng.int(1, 9); const o = rng.int(2, 9); // THINGS are plural nouns
      const name = rng.pick(NAMES); const thing = rng.pick(THINGS);
      return item({ format: 'type_in', prompt: `${name} has ${t} ${plural(t, 'bag', 'bags')} of 10 ${thing} and ${o} loose ${thing}. How many ${thing} is that in all?`, answer: String(10 * t + o),
        rationale: `${t} ${plural(t, 'bag', 'bags')} of 10 is ${10 * t}; with ${o} more that is ${10 * t + o}.` });
    }
    if (kind === 'value' || kind === 'place') {
      const ds = distinct(digits);
      const n = Number(ds.join(''));
      const pos = rng.int(0, digits - 1); // from the right
      const digit = ds[digits - 1 - pos];
      if (digit === 0) return G.place_value(rng, d);
      if (kind === 'value') {
        return item({ format: 'type_in', prompt: `In ${comma(n)}, what is the value of the digit ${digit}?`, answer: String(digit * 10 ** pos),
          rationale: `The ${digit} is in the ${PLACE[pos]} place, so it stands for ${digit} × ${comma(10 ** pos)} = ${comma(digit * 10 ** pos)}.` });
      }
      return item({ format: 'type_in', prompt: `In ${comma(n)}, which digit is in the ${PLACE[pos]} place?`, answer: String(digit),
        rationale: `Reading from the right: ${PLACE.slice(0, digits).map((p, i) => `${p} ${ds[digits - 1 - i]}`).join(', ')}.` });
    }
    if (kind === 'decimalValue') {
      const ds = distinct(4);
      const pos = rng.int(1, 3);
      const digit = ds[pos];
      if (digit === 0) return G.place_value(rng, d);
      const text = `${ds[0]}.${ds.slice(1).join('')}`;
      const val = [0.1, 0.01, 0.001][pos - 1] * digit;
      const shown = val.toFixed(pos);
      return item({ format: 'type_in', prompt: `In ${text}, what is the value of the digit ${digit}?`, answer: shown,
        rationale: `The ${digit} is in the ${['tenths', 'hundredths', 'thousandths'][pos - 1]} place, so it stands for ${shown}.` });
    }
    if (kind === 'expanded') {
      const ds = distinct(Math.min(digits, 4));
      const parts = ds.map((x, i) => x * 10 ** (ds.length - 1 - i)).filter((x) => x > 0);
      if (parts.length < 2) return G.place_value(rng, d);
      const n = parts.reduce((a, b) => a + b, 0);
      return item({ format: 'type_in', prompt: `Write as one number: ${parts.map(comma).join(' + ')}.`, answer: String(n),
        rationale: `Put each part in its place: ${parts.map(comma).join(' + ')} = ${comma(n)}.` });
    }
    if (kind === 'round') {
      const to = digits <= 3 ? rng.pick([10, 100].filter((t) => t < 10 ** digits)) : rng.pick([10, 100, 1000]);
      let n = rng.int(10 ** (digits - 1), 10 ** digits - 1);
      while (n % to === to / 2 || n % to === 0) n = rng.int(10 ** (digits - 1), 10 ** digits - 1);
      const r = Math.round(n / to) * to;
      return item({ format: 'type_in', prompt: `Round ${comma(n)} to the nearest ${{ 10: 'ten', 100: 'hundred', 1000: 'thousand' }[to]}.`, answer: String(r),
        rationale: `${comma(n)} is between ${comma(Math.floor(n / to) * to)} and ${comma(Math.ceil(n / to) * to)}, and nearer to ${comma(r)}.` });
    }
    if (kind === 'tenMore') {
      const step = digits >= 3 ? rng.pick([10, 100]) : 10;
      const more = rng.bool();
      const n = rng.int(10 ** (digits - 1) + step, 10 ** digits - 1 - step);
      const a = more ? n + step : n - step;
      return item({ format: 'type_in', prompt: `What is ${step} ${more ? 'more' : 'less'} than ${comma(n)}?`, answer: String(a),
        rationale: `${step} ${more ? 'more' : 'less'} changes the ${step === 10 ? 'tens' : 'hundreds'} digit by one: ${comma(a)}.` });
    }
    const base = distinct(digits);
    const nums = new Set([Number(base.join(''))]);
    while (nums.size < 3) {
      const swap = [...base];
      const i = rng.int(1, digits - 1); const j = rng.int(1, digits - 1);
      [swap[i], swap[j]] = [swap[j], swap[i]];
      nums.add(Number(swap.join('')));
      if (nums.size < 3 && rng.bool(0.3)) nums.add(Number(distinct(digits).join('')));
    }
    const list = [...nums].slice(0, 3);
    const best = Math.max(...list);
    return item({ format: 'multiple_choice', prompt: 'Which of these numbers is the greatest?', choices: rng.shuffle(list.map(comma)), answer: comma(best),
      rationale: `Compare from the left: the first place where the digits differ decides it, and ${comma(best)} is greatest.` });
  },

  measurement(rng, d) {
    // One tier per grade (standards check, 2026-10-24; ranges in config/grade-skills.js):
    // grade 1 time to the hour and half hour and length in same-size units
    // (1.MD.1-3); grade 2 coins, time to five minutes and length in inches and
    // centimetres (2.MD.1-8); grade 3 elapsed time and mass and liquid volume
    // (3.MD.1-2); grade 4 converts units (4.MD.1). Conversions used to start at 1.
    const kind = pickKind(rng, d, [1.7, 2.3, 2.8], [
      ['clockHour', 'clockHalf', 'lengthUnits', 'orderLength'],
      ['coins', 'clock5', 'clockHalf', 'lengthCompare'],
      ['coins', 'elapsed', 'clock5', 'massAdd'],
      ['coins', 'elapsed', 'convert'],
    ]);
    const pad = (n) => String(n).padStart(2, '0');
    if (kind === 'lengthUnits') {
      const [x, y] = rng.sample(['pencil', 'crayon', 'ribbon', 'stick', 'straw', 'spoon'], 2);
      const unit = rng.pick(['paper clips', 'cubes', 'erasers']);
      const b = rng.int(2, 10); const a = b + rng.int(1, 6);
      return item({ format: 'type_in', prompt: `A ${x} is ${a} ${unit} long and a ${y} is ${b} ${unit} long. How many ${unit} longer is the ${x}?`, answer: String(a - b),
        rationale: `Compare the lengths: ${a} - ${b} = ${a - b}.` });
    }
    if (kind === 'orderLength') {
      const [a, b, c] = rng.sample(['ribbon', 'string', 'straw', 'rope', 'stick', 'scarf'], 3);
      const ask = rng.pick(['longest', 'shortest']);
      return item({ format: 'multiple_choice', prompt: `The ${a} is longer than the ${b}. The ${b} is longer than the ${c}. Which is the ${ask}?`, choices: rng.shuffle([`the ${a}`, `the ${b}`, `the ${c}`]),
        answer: `the ${ask === 'longest' ? a : c}`, rationale: `In order from longest: ${a}, ${b}, ${c}. So the ${ask === 'longest' ? a : c} is the ${ask}.` });
    }
    if (kind === 'clock5') {
      const h = rng.int(1, 12); const k = rng.pick([1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
      const ans = `${h}:${pad(5 * k)}`;
      const next = h === 12 ? 1 : h + 1;
      return item({ format: 'multiple_choice', prompt: `The hour hand is just past ${h} and the minute hand points to ${k}. What time is it?`,
        choices: choicesFrom(rng, ans, [`${h}:${pad(k)}`, `${next}:${pad(5 * k)}`, `${h}:${pad((5 * k + 5) % 60)}`]), answer: ans,
        rationale: `Each number on the clock is 5 minutes for the minute hand, so ${k} means ${k} × 5 = ${5 * k} minutes past ${h}: ${ans}.` });
    }
    if (kind === 'lengthCompare') {
      // Things that can be five to ninety units long in either unit.
      const [x, y] = rng.sample(['ribbon', 'string', 'rope', 'scarf', 'board'], 2);
      const unit = rng.pick(['inches', 'centimetres']);
      const b = rng.int(5, 60); const a = b + rng.int(2, 30);
      return item({ format: 'type_in', prompt: `A ${x} is ${a} ${unit} long. A ${y} is ${b} ${unit} long. How much longer is the ${x}, in ${unit}?`, answer: String(a - b),
        rationale: `${a} - ${b} = ${a - b} ${unit}.` });
    }
    if (kind === 'massAdd') {
      const a = rng.int(2, 9); const b = rng.int(2, 9);
      const mass = rng.bool();
      const prompt = mass
        ? `A bag of rice has a mass of ${a} kilograms and a bag of beans has a mass of ${b} kilograms. What is their total mass, in kilograms?`
        : `A jug holds ${a} litres and a bucket holds ${b} litres. How many litres do they hold together?`;
      return item({ format: 'type_in', prompt, answer: String(a + b),
        rationale: `Add the two amounts: ${a} + ${b} = ${a + b} ${mass ? 'kilograms' : 'litres'}.` });
    }
    if (kind === 'clockHour' || kind === 'clockHalf') {
      const h = rng.int(1, 12);
      const half = kind === 'clockHalf';
      const next = h === 12 ? 1 : h + 1;
      const ans = `${h}:${half ? '30' : '00'}`;
      const wrong = half ? [`${h}:00`, `${next}:30`, `${next}:00`] : [`${h}:30`, `${next}:00`, `${h}:15`];
      return item({ format: 'multiple_choice',
        prompt: half ? `The minute hand points to 6 and the hour hand is halfway between ${h} and ${next}. What time is it?` : `The minute hand points to 12 and the hour hand points to ${h}. What time is it?`,
        choices: choicesFrom(rng, ans, wrong), answer: ans,
        rationale: half ? `The minute hand on 6 means 30 minutes past the hour, and the hour hand has gone past ${h}: ${ans}.` : `The minute hand on 12 means exactly on the hour, and the hour hand shows ${h}: ${ans}.` });
    }
    if (kind === 'coins') {
      const COINS = [['quarter', 'quarters', 25], ['dime', 'dimes', 10], ['nickel', 'nickels', 5], ['penny', 'pennies', 1]];
      const use = rng.sample(COINS, rng.int(2, 3)).sort((a, b) => b[2] - a[2]);
      const counts = use.map(() => rng.int(1, 4));
      const total = use.reduce((s, c, i) => s + c[2] * counts[i], 0);
      const words = use.map((c, i) => `${counts[i]} ${plural(counts[i], c[0], c[1])}`);
      const list = words.length === 2 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
      return item({ format: 'type_in', prompt: `What is the total value, in cents, of ${list}?`, answer: String(total),
        rationale: `${use.map((c, i) => `${counts[i]} × ${c[2]}¢`).join(' + ')} = ${total}¢.` });
    }
    if (kind === 'elapsed') {
      const h = rng.int(7, 10); const m = rng.pick([0, 5, 10, 15, 20, 25, 30]);
      const len = rng.pick([15, 20, 25, 30, 35, 40, 45]);
      const end = h * 60 + m + len;
      const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      const ans = fmt(end);
      return item({ format: 'multiple_choice', prompt: `A lesson starts at ${fmt(h * 60 + m)} and lasts ${len} minutes. What time does it end?`,
        choices: choicesFrom(rng, ans, [fmt(end + 10), fmt(end - 10), fmt(h * 60 + m + len + 60)]), answer: ans,
        rationale: `Count on ${len} minutes from ${fmt(h * 60 + m)}: ${ans}.` });
    }
    const CONV = [['centimetres', 'metres', 100], ['inches', 'feet', 12], ['minutes', 'hours', 60], ['hours', 'days', 24], ['grams', 'kilograms', 1000], ['days', 'weeks', 7], ['months', 'years', 12]];
    const [small, big, k] = rng.pick(CONV);
    const n = rng.int(2, 9);
    return item({ format: 'type_in', prompt: `How many ${small} are in ${n} ${big}?`, answer: String(n * k),
      rationale: `Each one of the ${big} is ${k} ${small}, so ${n} × ${k} = ${n * k}.` });
  },

  data_stats(rng, d) {
    const kind = pickKind(rng, d, [3, 4.5, 6, 7.5], [
      ['tallyMore', 'tallyTotal'],
      ['median', 'range', 'mode', 'mean'],
      ['mean2', 'medianEven', 'range', 'mean'],
      ['zscore', 'sd', 'medianEven'],
      ['ev', 'slope', 'zscore', 'sd'],
    ]);
    if (kind === 'tallyMore' || kind === 'tallyTotal') {
      const cats = rng.sample(['cats', 'dogs', 'fish', 'birds', 'rabbits'], 3);
      let vals = cats.map(() => rng.int(2, 12));
      while (new Set(vals).size < 3) vals = cats.map(() => rng.int(2, 12));
      const list = cats.map((c, i) => `${c} ${vals[i]}`).join(', ');
      if (kind === 'tallyTotal') {
        const s = vals.reduce((a, b) => a + b, 0);
        return item({ format: 'type_in', prompt: `A class voted for a favourite pet: ${list}. How many votes were there in all?`, answer: String(s), rationale: `${vals.join(' + ')} = ${s}.` });
      }
      const [i, j] = vals[0] > vals[1] ? [0, 1] : [1, 0];
      return item({ format: 'type_in', prompt: `A class voted for a favourite pet: ${list}. How many more votes did ${cats[i]} get than ${cats[j]}?`, answer: String(vals[i] - vals[j]),
        rationale: `${vals[i]} - ${vals[j]} = ${vals[i] - vals[j]}.` });
    }
    const listOf = (n, lo, hi) => Array.from({ length: n }, () => rng.int(lo, hi));
    if (kind === 'median') {
      const xs = listOf(rng.pick([5, 7]), 1, 30);
      const s = [...xs].sort((a, b) => a - b);
      return item({ format: 'type_in', prompt: `What is the median of ${xs.join(', ')}?`, answer: String(s[(s.length - 1) / 2]),
        rationale: `In order: ${s.join(', ')}. The middle value is ${s[(s.length - 1) / 2]}.` });
    }
    if (kind === 'medianEven') {
      const xs = listOf(6, 1, 40);
      const s = [...xs].sort((a, b) => a - b);
      const m = (s[2] + s[3]) / 2;
      return item({ format: 'type_in', prompt: `What is the median of ${xs.join(', ')}?   (as a decimal if needed)`, answer: String(m),
        rationale: `In order: ${s.join(', ')}. With six values the median is the mean of the middle two: (${s[2]} + ${s[3]}) ÷ 2 = ${m}.` });
    }
    if (kind === 'range') {
      const xs = listOf(rng.int(5, 7), 1, 60);
      return item({ format: 'type_in', prompt: `What is the range of ${xs.join(', ')}?`, answer: String(Math.max(...xs) - Math.min(...xs)),
        rationale: `Largest minus smallest: ${Math.max(...xs)} - ${Math.min(...xs)} = ${Math.max(...xs) - Math.min(...xs)}.` });
    }
    if (kind === 'mode') {
      const pool = rng.sample(Array.from({ length: 20 }, (_, i) => i + 1), 5);
      const m = pool[0];
      const xs = rng.shuffle([m, m, m, pool[1], pool[1], pool[2], pool[3], pool[4]]);
      return item({ format: 'type_in', prompt: `What is the mode of ${xs.join(', ')}?`, answer: String(m), rationale: `Appearing three times, ${m} is more common than any other value.` });
    }
    if (kind === 'mean') {
      const n = rng.int(4, 6);
      const target = rng.int(5, 20);
      const xs = listOf(n - 1, 1, 30);
      const last = target * n - xs.reduce((a, b) => a + b, 0);
      if (last < 1 || last > 60) return G.data_stats(rng, d);
      xs.push(last);
      return item({ format: 'type_in', prompt: `What is the mean of ${rng.shuffle(xs).join(', ')}?`, answer: String(target),
        rationale: `The sum is ${target * n}, and ${target * n} ÷ ${n} = ${target}.` });
    }
    if (kind === 'mean2') {
      const xs = listOf(rng.int(4, 6), 1, 50);
      const m = round2(xs.reduce((a, b) => a + b, 0) / xs.length);
      return item({ format: 'type_in', prompt: `What is the mean of ${xs.join(', ')}?   (round to 2 decimals)`, answer: String(m),
        rationale: `Sum ${xs.reduce((a, b) => a + b, 0)} ÷ ${xs.length} = ${m}.` });
    }
    if (kind === 'zscore') {
      const mu = rng.int(40, 90); const sd = rng.int(2, 12); const k = rng.pick([-2.5, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5, 3]);
      const x = mu + k * sd;
      if (!Number.isInteger(x)) return G.data_stats(rng, d);
      return item({ format: 'type_in', prompt: `Scores have mean ${mu} and standard deviation ${sd}. What is the z-score of a score of ${x}?`, answer: String(k),
        rationale: `z = (x - μ) / σ = (${x} - ${mu}) / ${sd} = ${k}.` });
    }
    if (kind === 'sd') {
      const xs = listOf(rng.int(4, 6), 1, 20);
      const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
      const v = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length;
      const s = round2(Math.sqrt(v));
      return item({ format: 'type_in', prompt: `What is the population standard deviation of ${xs.join(', ')}?   (round to 2 decimals)`, answer: String(s),
        rationale: `The mean is ${round2(mu)}; the mean squared deviation is ${round2(v)}; its square root is ${s}.` });
    }
    if (kind === 'ev') {
      const vals = rng.sample([0, 4, 8, 12, 16, 20, 24, 40], 3);
      const ev = vals[0] / 2 + vals[1] / 4 + vals[2] / 4;
      return item({ format: 'type_in', prompt: `A random variable X takes the values ${vals[0]}, ${vals[1]} and ${vals[2]} with probabilities 1/2, 1/4 and 1/4. What is E[X]?`, answer: String(ev),
        rationale: `E[X] = ${vals[0]}(1/2) + ${vals[1]}(1/4) + ${vals[2]}(1/4) = ${ev}.` });
    }
    const xs = [1, 2, 3, 4, 5].slice(0, rng.int(4, 5));
    const ys = xs.map((x) => 2 + rng.int(1, 3) * x + rng.int(-2, 2));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    return item({ format: 'type_in', prompt: `For the points ${xs.map((x, i) => `(${x}, ${ys[i]})`).join(', ')}, what is the slope of the least-squares regression line?   (round to 2 decimals)`,
      answer: String(round2(b)), rationale: `Slope = Σ(x - x̄)(y - ȳ) / Σ(x - x̄)^2 = ${round2(b)}.` });
  },

  // ── university and beyond ─────────────────────────────────────────────────
  calculus(rng, d) {
    // Below 5, limits only: the slice Precalculus is held to (config/grade-skills.js),
    // since its lessons introduce limits and derivatives are Calculus I.
    const kind = pickKind(rng, d, [5, 6, 7.5], [['limitFactor', 'limitInf'], ['power', 'derivAt', 'limitFactor'], ['integral', 'limitInf', 'chain', 'derivAt'], ['series', 'chain', 'integral', 'limitInf']]);
    if (kind === 'power') {
      const n = rng.int(2, 9);
      const ans = `${n}x^${n - 1}`.replace('x^1', 'x');
      const wrong = [`x^${n - 1}`.replace('x^1', 'x'), `${n}x^${n}`, co(n - 1, `x^${n}`)];
      return item({ format: 'multiple_choice', prompt: `What is the derivative of x^${n}?`, choices: choicesFrom(rng, ans, wrong), answer: ans,
        rationale: `Power rule: the derivative of x^n is n·x^(n - 1), so x^${n} gives ${ans}.` });
    }
    if (kind === 'derivAt') {
      const deg = rng.int(2, 3);
      const coefs = Array.from({ length: deg + 1 }, (_, i) => (i === 0 ? rng.nz(-4, 5) : rng.int(-9, 9)));
      const a = rng.int(-3, 4);
      const der = coefs.slice(0, -1).reduce((s, c, i) => s + c * (deg - i) * a ** (deg - i - 1), 0);
      return item({ format: 'type_in', prompt: `If f(x) = ${poly(coefs)}, what is f'(${a})?`, answer: String(der),
        rationale: `f'(x) = ${poly(coefs.slice(0, -1).map((c, i) => c * (deg - i)))}, so f'(${a}) = ${der}.` });
    }
    if (kind === 'limitFactor') {
      const a = rng.nz(-9, 9);
      const minus = a < 0 ? `x + ${-a}` : `x - ${a}`;
      return item({ format: 'type_in', prompt: `What is the limit of (x^2 - ${a * a}) / (${minus}) as x approaches ${a}?`, answer: String(2 * a),
        rationale: `x^2 - ${a * a} = (${minus})(${a < 0 ? `x - ${-a}` : `x + ${a}`}); cancel the common factor and substitute x = ${a} into the other one: 2 × (${a}) = ${2 * a}.` });
    }
    if (kind === 'limitInf') {
      const a = rng.int(1, 9); const c = rng.int(2, 9); const b = rng.int(1, 9); const e = rng.int(1, 9);
      return item({ format: 'type_in', prompt: `What is the limit of (${co(a, 'x^2')} + ${b}) / (${c}x^2 - ${co(e, 'x')}) as x approaches infinity?   (as a fraction in lowest terms)`, answer: frac(a, c),
        rationale: `Divide top and bottom by x^2; every other term goes to 0, leaving ${a}/${c} = ${frac(a, c)}.` });
    }
    if (kind === 'integral') {
      const n = rng.int(1, 4); const k = rng.int(1, 3); const a = k * (n + 1); const b = rng.int(1, 3);
      const val = (a * b ** (n + 1)) / (n + 1);
      return item({ format: 'type_in', prompt: `Evaluate the definite integral of ${a}${n === 1 ? 'x' : `x^${n}`} dx from x = 0 to x = ${b}.`, answer: String(val),
        rationale: `An antiderivative is ${k === 1 ? '' : k}x^${n + 1}; at ${b} it is ${val} and at 0 it is 0, so the integral is ${val}.` });
    }
    if (kind === 'chain') {
      const a = rng.nz(-3, 4); const b = rng.int(-5, 5); const n = rng.int(2, 4); const c = rng.int(-2, 2);
      const inner = a * c + b;
      const ans = n * a * inner ** (n - 1);
      const lin = b === 0 ? `${a === 1 ? '' : a === -1 ? '-' : a}x` : `${a === 1 ? '' : a === -1 ? '-' : a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}`;
      return item({ format: 'type_in', prompt: `If f(x) = (${lin})^${n}, what is f'(${c})?`, answer: String(ans),
        rationale: `Chain rule: f'(x) = ${n}·(${lin})^${n - 1}·${a}. At x = ${c} the inside is ${inner}, so f'(${c}) = ${ans}.` });
    }
    const A = rng.int(1, 9); const k = rng.int(2, 9);
    return item({ format: 'type_in', prompt: `What is the sum of the infinite geometric series with first term ${A} and common ratio 1/${k}?   (as a fraction in lowest terms)`, answer: frac(A * k, k - 1),
      rationale: `S = a / (1 - r) = ${A} / (1 - 1/${k}) = ${frac(A * k, k - 1)}.` });
  },

  linear_algebra(rng, d) {
    const kind = pickKind(rng, d, [6, 7.5, 9], [['det2', 'dot', 'matvec'], ['det3', 'eigenTri', 'matvec', 'det2'], ['eigen', 'rank', 'det3'], ['detProduct', 'eigen', 'rank']]);
    const m2 = (a, b, c, e) => `[[${a}, ${b}], [${c}, ${e}]]`;
    if (kind === 'det2') {
      const [a, b, c, e] = [rng.int(-9, 9), rng.int(-9, 9), rng.int(-9, 9), rng.int(-9, 9)];
      return item({ format: 'type_in', prompt: `What is the determinant of the matrix ${m2(a, b, c, e)}?`, answer: String(a * e - b * c),
        rationale: `ad - bc = (${a})(${e}) - (${b})(${c}) = ${a * e - b * c}.` });
    }
    if (kind === 'dot') {
      const u = [rng.int(-6, 6), rng.int(-6, 6), rng.int(-6, 6)]; const v = [rng.int(-6, 6), rng.int(-6, 6), rng.int(-6, 6)];
      const s = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      return item({ format: 'type_in', prompt: `What is the dot product of (${u.join(', ')}) and (${v.join(', ')})?`, answer: String(s),
        rationale: `Multiply matching entries and add: ${u.map((x, i) => `(${x})(${v[i]})`).join(' + ')} = ${s}.` });
    }
    if (kind === 'matvec') {
      const [a, b, c, e] = [rng.int(-6, 6), rng.int(-6, 6), rng.int(-6, 6), rng.int(-6, 6)]; const [x, y] = [rng.int(-5, 5), rng.int(-5, 5)];
      const first = rng.bool();
      const val = first ? a * x + b * y : c * x + e * y;
      return item({ format: 'type_in', prompt: `If A = ${m2(a, b, c, e)} and v = (${x}, ${y}), what is the ${first ? 'first' : 'second'} entry of Av?`, answer: String(val),
        rationale: `Row ${first ? 1 : 2} of A dotted with v: ${first ? `(${a})(${x}) + (${b})(${y})` : `(${c})(${x}) + (${e})(${y})`} = ${val}.` });
    }
    if (kind === 'det3') {
      const M = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => rng.int(-4, 4)));
      const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
      return item({ format: 'type_in', prompt: `What is the determinant of the matrix [${M.map((r) => `[${r.join(', ')}]`).join(', ')}]?`, answer: String(det),
        rationale: `Expanding along the first row gives ${det}.` });
    }
    if (kind === 'eigenTri') {
      const [a, e] = rng.sample([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7], 2); const b = rng.int(-6, 6);
      return item({ format: 'type_in', prompt: `What is the larger eigenvalue of the matrix ${m2(a, b, 0, e)}?`, answer: String(Math.max(a, e)),
        rationale: `The matrix is upper triangular, so its eigenvalues are its diagonal entries ${a} and ${e}; the larger is ${Math.max(a, e)}.` });
    }
    if (kind === 'eigen') {
      const [l1, l2] = rng.sample([-4, -3, -2, -1, 1, 2, 3, 4, 5, 6], 2);
      const p = rng.int(-3, 5); const s = l1 + l2 - p; const qr = p * s - l1 * l2;
      if (qr === 0) return G.linear_algebra(rng, d);
      const opts = divisors(Math.abs(qr)).filter((x) => x <= 9 && Math.abs(qr) / x <= 9);
      if (!opts.length) return G.linear_algebra(rng, d);
      const q = rng.pick(opts) * (rng.bool() ? 1 : -1); const r = qr / q;
      const smaller = rng.bool();
      return item({ format: 'type_in', prompt: `What is the ${smaller ? 'smaller' : 'larger'} eigenvalue of the matrix ${m2(p, q, r, s)}?`, answer: String(smaller ? Math.min(l1, l2) : Math.max(l1, l2)),
        rationale: `The trace is ${p + s} and the determinant is ${p * s - q * r}, so the eigenvalues solve λ^2 - (${p + s})λ + (${p * s - q * r}) = 0: λ = ${Math.min(l1, l2)} and ${Math.max(l1, l2)}.` });
    }
    if (kind === 'rank') {
      const rank = rng.int(1, 3);
      const r1 = [rng.nz(-3, 3), rng.int(-3, 3), rng.int(-3, 3)]; const r2 = [rng.int(-3, 3), rng.nz(-3, 3), rng.int(-3, 3)];
      const k1 = rng.nz(-2, 2); const k2 = rng.nz(-2, 2);
      let rows;
      if (rank === 1) rows = [r1, r1.map((x) => x * k1), r1.map((x) => x * k2)];
      else if (rank === 2) rows = [r1, r2, r1.map((x, i) => k1 * x + k2 * r2[i])];
      else rows = [[rng.nz(-3, 3), rng.int(-3, 3), rng.int(-3, 3)], [0, rng.nz(-3, 3), rng.int(-3, 3)], [0, 0, rng.nz(-3, 3)]];
      if (rank === 2 && r1[0] * r2[1] - r1[1] * r2[0] === 0 && r1[1] * r2[2] - r1[2] * r2[1] === 0 && r1[0] * r2[2] - r1[2] * r2[0] === 0) return G.linear_algebra(rng, d);
      return item({ format: 'type_in', prompt: `What is the rank of the matrix [${rng.shuffle(rows).map((r) => `[${r.join(', ')}]`).join(', ')}]?`, answer: String(rank),
        rationale: `Row-reduce: ${rank} independent row${rank === 1 ? '' : 's'} remain, so the rank is ${rank}.` });
    }
    const a = rng.nz(-5, 5); const b = rng.nz(-5, 5); const c = rng.int(2, 3); const n = rng.int(2, 4);
    return item({ format: 'type_in', prompt: `A and B are ${n}×${n} matrices with det(A) = ${a} and det(B) = ${b}. What is det(${c}AB)?`, answer: String(c ** n * a * b),
      rationale: `det(cM) = c^n det(M) for an n×n matrix, and det(AB) = det(A)det(B): ${c}^${n} · (${a}) · (${b}) = ${c ** n * a * b}.` });
  },

  probability(rng, d) {
    const kind = pickKind(rng, d, [5, 7, 9], [['die', 'bag'], ['choose', 'arrange', 'twoDraw', 'bag'], ['binomial', 'evDie', 'cond', 'choose'], ['markov', 'geometric', 'binomial', 'cond']]);
    if (kind === 'die') {
      const k = rng.int(1, 5);
      return item({ format: 'type_in', prompt: `A fair six-sided die is rolled once. What is the probability of rolling a number greater than ${k}?   (as a fraction in lowest terms)`, answer: frac(6 - k, 6),
        rationale: `${6 - k} of the 6 faces are greater than ${k}: ${6 - k}/6 = ${frac(6 - k, 6)}.` });
    }
    if (kind === 'bag') {
      const r = rng.int(1, 9); const b = rng.int(1, 9); const g = rng.int(1, 9);
      return item({ format: 'type_in', prompt: `A bag holds ${r} red, ${b} blue and ${g} green marbles. One marble is picked at random. What is the probability that it is blue?   (as a fraction in lowest terms)`, answer: frac(b, r + b + g),
        rationale: `${b} of the ${r + b + g} marbles are blue: ${frac(b, r + b + g)}.` });
    }
    if (kind === 'choose') {
      const n = rng.int(5, 12); const k = rng.int(2, Math.min(5, n - 1));
      return item({ format: 'type_in', prompt: `How many ways are there to choose ${k} items from ${n} distinct items, when order does not matter?`, answer: String(choose(n, k)),
        rationale: `C(${n}, ${k}) = ${n}! / (${k}! · ${n - k}!) = ${choose(n, k)}.` });
    }
    if (kind === 'arrange') {
      const n = rng.int(5, 10); const k = rng.int(2, 4);
      const p = fact(n) / fact(n - k);
      return item({ format: 'type_in', prompt: `How many ordered arrangements of ${k} items can be made from ${n} distinct items?`, answer: String(p),
        rationale: `P(${n}, ${k}) = ${Array.from({ length: k }, (_, i) => n - i).join(' × ')} = ${p}.` });
    }
    if (kind === 'twoDraw') {
      const r = rng.int(2, 8); const b = rng.int(1, 8);
      return item({ format: 'type_in', prompt: `A bag holds ${r} red and ${b} blue marbles. Two are drawn without replacement. What is the probability that both are red?   (as a fraction in lowest terms)`, answer: frac(r * (r - 1), (r + b) * (r + b - 1)),
        rationale: `(${r}/${r + b}) × (${r - 1}/${r + b - 1}) = ${frac(r * (r - 1), (r + b) * (r + b - 1))}.` });
    }
    if (kind === 'binomial') {
      const n = rng.int(3, 8); const k = rng.int(0, n);
      return item({ format: 'type_in', prompt: `A fair coin is flipped ${n} times. What is the probability of exactly ${k} ${k === 1 ? 'head' : 'heads'}?   (as a fraction in lowest terms)`, answer: frac(choose(n, k), 2 ** n),
        rationale: `C(${n}, ${k}) / 2^${n} = ${choose(n, k)}/${2 ** n} = ${frac(choose(n, k), 2 ** n)}.` });
    }
    if (kind === 'evDie') {
      const n = rng.pick([4, 6, 8, 10, 12, 20]);
      return item({ format: 'type_in', prompt: `A fair die with faces numbered 1 to ${n} is rolled. What is the expected value of the roll?   (as a decimal)`, answer: String((n + 1) / 2),
        rationale: `E = (1 + 2 + … + ${n}) / ${n} = (${n} + 1) / 2 = ${(n + 1) / 2}.` });
    }
    if (kind === 'cond') {
      const both = rng.int(2, 12); const coffee = both + rng.int(1, 15); const tea = both + rng.int(1, 15); const N = coffee + tea - both + rng.int(0, 10);
      return item({ format: 'type_in', prompt: `Of ${N} people, ${tea} like tea, ${coffee} like coffee and ${both} like both. One person who likes coffee is chosen at random. What is the probability that this person also likes tea?   (as a fraction in lowest terms)`, answer: frac(both, coffee),
        rationale: `P(tea | coffee) = ${both}/${coffee} = ${frac(both, coffee)}.` });
    }
    if (kind === 'geometric') {
      const k = rng.int(2, 20);
      return item({ format: 'type_in', prompt: `Independent trials each succeed with probability 1/${k}. What is the expected number of trials up to and including the first success?`, answer: String(k),
        rationale: `The number of trials is geometric with p = 1/${k}, whose mean is 1/p = ${k}.` });
    }
    const [a, b] = [rng.int(1, 4), rng.int(5, 9)]; const [c, e] = [rng.int(1, 4), rng.int(5, 9)];
    // p = P(1 -> 2) = a/b, q = P(2 -> 1) = c/e; pi1 = q / (p + q).
    const num = c * b; const den = c * b + a * e;
    return item({ format: 'type_in', prompt: `A two-state Markov chain moves from state 1 to state 2 with probability ${a}/${b} and from state 2 to state 1 with probability ${c}/${e}. What is the long-run probability of being in state 1?   (as a fraction in lowest terms)`, answer: frac(num, den),
      rationale: `The stationary distribution balances the flows: π1 · ${a}/${b} = π2 · ${c}/${e} with π1 + π2 = 1, so π1 = (${c}/${e}) / (${a}/${b} + ${c}/${e}) = ${frac(num, den)}.` });
  },

  discrete_math(rng, d) {
    const kind = pickKind(rng, d, [7, 8.5], [['mod', 'gcd', 'union', 'subsets', 'logic'], ['edges', 'functions', 'recurrence', 'pigeonhole', 'logic'], ['bijections', 'derangements', 'recurrence', 'edges']]);
    if (kind === 'mod') { const n = rng.int(3, 13); const a = rng.int(20, 300); return item({ format: 'type_in', prompt: `What is ${a} mod ${n}?`, answer: String(a % n), rationale: `${a} = ${n} × ${Math.floor(a / n)} + ${a % n}, so the remainder is ${a % n}.` }); }
    if (kind === 'gcd') { const g = rng.int(2, 15); const a = g * rng.int(2, 12); const b = g * rng.int(2, 12); return item({ format: 'type_in', prompt: `What is gcd(${a}, ${b})?`, answer: String(gcd(a, b)), rationale: `By the Euclidean algorithm, gcd(${a}, ${b}) = ${gcd(a, b)}.` }); }
    if (kind === 'union') {
      const c = rng.int(1, 10); const a = c + rng.int(1, 15); const b = c + rng.int(1, 15);
      return item({ format: 'type_in', prompt: `Sets A and B have |A| = ${a}, |B| = ${b} and |A ∩ B| = ${c}. What is |A ∪ B|?`, answer: String(a + b - c),
        rationale: `Inclusion-exclusion: |A ∪ B| = |A| + |B| - |A ∩ B| = ${a} + ${b} - ${c} = ${a + b - c}.` });
    }
    if (kind === 'subsets') { const n = rng.int(2, 10); return item({ format: 'type_in', prompt: `How many subsets does a set with ${n} elements have?`, answer: String(2 ** n), rationale: `Each element is in or out: 2^${n} = ${2 ** n}.` }); }
    if (kind === 'logic') {
      const p = rng.bool(); const q = rng.bool();
      const OPS = [['p → q', (x, y) => !x || y], ['p ∧ q', (x, y) => x && y], ['p ∨ q', (x, y) => x || y], ['¬p ∨ q', (x, y) => !x || y], ['p ↔ q', (x, y) => x === y], ['¬(p ∧ q)', (x, y) => !(x && y)]];
      const [text, fn] = rng.pick(OPS);
      const v = fn(p, q) ? 'true' : 'false';
      return item({ format: 'multiple_choice', prompt: `If p is ${p} and q is ${q}, what is the truth value of ${text}?`, choices: rng.shuffle(['true', 'false', 'it cannot be determined']), answer: v,
        rationale: `Substitute p = ${p} and q = ${q} into ${text}: the result is ${v}.` });
    }
    if (kind === 'edges') {
      const n = rng.int(4, 7); const edges = new Set();
      const want = rng.int(n - 1, Math.min(n * (n - 1) / 2, 2 * n));
      while (edges.size < want) { const a = rng.int(0, n - 1); const b = rng.int(0, n - 1); if (a !== b) edges.add(a < b ? `${a}-${b}` : `${b}-${a}`); }
      const deg = Array(n).fill(0);
      for (const e of edges) { const [a, b] = e.split('-').map(Number); deg[a]++; deg[b]++; }
      deg.sort((x, y) => y - x);
      return item({ format: 'type_in', prompt: `A simple graph has vertex degrees ${deg.join(', ')}. How many edges does it have?`, answer: String(edges.size),
        rationale: `Each edge adds 2 to the degree sum (the handshake lemma): ${deg.reduce((a, b) => a + b, 0)} ÷ 2 = ${edges.size}.` });
    }
    if (kind === 'functions') { const m = rng.int(2, 5); const n = rng.int(2, 5); return item({ format: 'type_in', prompt: `How many functions are there from a set with ${m} elements to a set with ${n} elements?`, answer: String(n ** m), rationale: `Each of the ${m} inputs has ${n} choices of output: ${n}^${m} = ${n ** m}.` }); }
    if (kind === 'recurrence') {
      const A = rng.int(1, 5); const k = rng.int(2, 3); const c = rng.int(-2, 3);
      let a = A; for (let i = 2; i <= 5; i++) a = k * a + c;
      const tail = c === 0 ? '' : ` ${c < 0 ? '-' : '+'} ${Math.abs(c)}`;
      return item({ format: 'type_in', prompt: `a_1 = ${A} and a_n = ${k}a_(n-1)${tail} for n ≥ 2. What is a_5?`, answer: String(a),
        rationale: `Apply the rule four times starting from a_1 = ${A}: a_5 = ${a}.` });
    }
    if (kind === 'pigeonhole') { const k = rng.int(2, 6); return item({ format: 'type_in', prompt: `What is the smallest number of people that guarantees at least ${k} of them share a birth month?`, answer: String(12 * (k - 1) + 1), rationale: `With 12 months, 12 × ${k - 1} people could avoid it; one more forces it: ${12 * (k - 1) + 1}.` }); }
    if (kind === 'bijections') { const n = rng.int(3, 8); return item({ format: 'type_in', prompt: `How many bijections are there from a set with ${n} elements to itself?`, answer: String(fact(n)), rationale: `A bijection of a finite set to itself is a permutation: ${n}! = ${fact(n)}.` }); }
    const n = rng.int(3, 7);
    const D = [1, 0]; for (let i = 2; i <= n; i++) D[i] = (i - 1) * (D[i - 1] + D[i - 2]);
    return item({ format: 'type_in', prompt: `How many derangements (permutations with no fixed point) of ${n} objects are there?`, answer: String(D[n]),
      rationale: `D(n) = (n - 1)(D(n - 1) + D(n - 2)) with D(1) = 0 and D(2) = 1, giving D(${n}) = ${D[n]}.` });
  },

  abstract_algebra(rng, d) {
    const kind = pickKind(rng, d, [8, 9], [['orderZn', 'sn', 'permOrder', 'lagrange'], ['generators', 'inverseMod', 'units', 'ideals', 'permOrder'], ['abelian', 'extDegree', 'permOrder', 'ideals']]);
    if (kind === 'orderZn') { const n = rng.int(6, 40); const k = rng.int(1, n - 1); return item({ format: 'type_in', prompt: `In the group of integers mod ${n} under addition, what is the order of the element ${k}?`, answer: String(n / gcd(k, n)), rationale: `The order of k in ℤ_n is n / gcd(k, n) = ${n} / ${gcd(k, n)} = ${n / gcd(k, n)}.` }); }
    if (kind === 'sn') { const n = rng.int(3, 7); return item({ format: 'type_in', prompt: `How many elements does the symmetric group S_${n} have?`, answer: String(fact(n)), rationale: `S_${n} is all permutations of ${n} objects: ${n}! = ${fact(n)}.` }); }
    if (kind === 'permOrder') {
      const lens = rng.pick([[2, 3], [3, 4], [2, 5], [2, 2, 3], [4, 6], [3, 5], [2, 4], [3, 3], [2, 3, 4]]);
      const total = lens.reduce((a, b) => a + b, 0);
      const elems = rng.shuffle(Array.from({ length: total }, (_, i) => i + 1));
      let at = 0;
      const cycles = lens.map((l) => { const c = elems.slice(at, at + l); at += l; return `(${c.join(' ')})`; });
      const ord = lens.reduce(lcm, 1);
      return item({ format: 'type_in', prompt: `What is the order of the permutation ${cycles.join('')} in S_${total}?`, answer: String(ord),
        rationale: `Disjoint cycles of lengths ${lens.join(', ')} commute, so the order is lcm(${lens.join(', ')}) = ${ord}.` });
    }
    if (kind === 'lagrange') {
      const N = rng.pick([12, 18, 20, 24, 28, 30, 36, 40, 42, 45, 48, 50, 56, 60]);
      const divs = divisors(N).filter((x) => x > 1 && x < N);
      const non = Array.from({ length: N - 1 }, (_, i) => i + 1).filter((x) => N % x !== 0);
      const ans = rng.pick(divs);
      return item({ format: 'multiple_choice', prompt: `A group has order ${N}. By Lagrange's theorem, which of these could be the order of one of its subgroups?`, choices: rng.shuffle([String(ans), ...rng.sample(non, 3).map(String)]), answer: String(ans),
        rationale: `A subgroup's order divides the group's order; of these only ${ans} divides ${N}.` });
    }
    if (kind === 'generators') { const n = rng.int(5, 40); return item({ format: 'type_in', prompt: `How many generators does a cyclic group of order ${n} have?`, answer: String(phi(n)), rationale: `The generators of ℤ_${n} are the residues coprime to ${n}: φ(${n}) = ${phi(n)}.` }); }
    if (kind === 'units') { const n = rng.int(5, 40); return item({ format: 'type_in', prompt: `How many units does the ring ℤ/${n}ℤ have?`, answer: String(phi(n)), rationale: `A residue is a unit exactly when it is coprime to ${n}: φ(${n}) = ${phi(n)}.` }); }
    if (kind === 'ideals') { const n = rng.int(4, 60); return item({ format: 'type_in', prompt: `How many ideals does the ring ℤ/${n}ℤ have?`, answer: String(divisors(n).length), rationale: `Ideals of ℤ/${n}ℤ correspond to the divisors of ${n}, and ${n} has ${divisors(n).length}.` }); }
    if (kind === 'inverseMod') {
      const p = rng.pick([5, 7, 11, 13, 17, 19, 23]); const a = rng.int(2, p - 1);
      let inv = 1; while ((a * inv) % p !== 1) inv++;
      return item({ format: 'type_in', prompt: `What is the multiplicative inverse of ${a} modulo ${p}?   (a number from 1 to ${p - 1})`, answer: String(inv), rationale: `${a} × ${inv} = ${a * inv} = ${Math.floor(a * inv / p)} × ${p} + 1.` });
    }
    if (kind === 'abelian') {
      const PART = [1, 1, 2, 3, 5, 7, 11];
      const options = [[2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [3, 2], [3, 3], [3, 4], [5, 2], [5, 3], [7, 2]];
      const [[p, a], [q, b]] = rng.bool(0.5) ? [rng.pick(options), [1, 0]] : (() => { const x = rng.pick(options); const y = rng.pick(options.filter((o) => o[0] !== x[0] && o[0] ** o[1] * x[0] ** x[1] <= 2000)); return y ? [x, y] : [x, [1, 0]]; })();
      const N = p ** a * q ** b;
      const count = PART[a] * PART[b];
      return item({ format: 'type_in', prompt: `How many abelian groups of order ${N} are there, up to isomorphism?`, answer: String(count),
        rationale: `By the fundamental theorem, count the partitions of each prime's exponent and multiply: ${count}.` });
    }
    const p = rng.pick([2, 3, 5, 7, 11]); const n = rng.int(2, 7);
    return item({ format: 'type_in', prompt: `What is the degree of the field extension ℚ(${p}^(1/${n})) over ℚ?`, answer: String(n),
      rationale: `x^${n} - ${p} is irreducible over ℚ by Eisenstein's criterion at ${p}, so it is the minimal polynomial and the degree is ${n}.` });
  },

  analysis(rng, d) {
    const kind = pickKind(rng, d, [7.5, 9], [['seqLimit', 'sup', 'inf', 'modulus'], ['pseries', 'radius', 'residue', 'seqLimit'], ['contour', 'holomorphic', 'radius', 'residue']]);
    if (kind === 'seqLimit') {
      const a = rng.nz(-9, 9); const c = rng.int(1, 9); const b = rng.int(-9, 9); const e = rng.int(1, 9);
      return item({ format: 'type_in', prompt: `What is the limit of the sequence (${co(a, 'n')} ${b < 0 ? '-' : '+'} ${Math.abs(b)}) / (${co(c, 'n')} + ${e}) as n → ∞?   (as a fraction in lowest terms)`, answer: frac(a, c),
        rationale: `Divide top and bottom by n: the constants vanish and the limit is ${a}/${c} = ${frac(a, c)}.` });
    }
    if (kind === 'sup' || kind === 'inf') {
      const k = rng.int(1, 9);
      return item({ format: 'type_in', prompt: `What is the ${kind === 'sup' ? 'supremum' : 'infimum'} of the set {${k} - 1/n : n = 1, 2, 3, …}?`, answer: String(kind === 'sup' ? k : k - 1),
        rationale: kind === 'sup' ? `The terms increase towards ${k} without reaching it, so the least upper bound is ${k}.` : `The terms increase, so the smallest is the first, n = 1: ${k} - 1 = ${k - 1}.` });
    }
    if (kind === 'modulus') {
      const [x, y, h] = rng.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [20, 21, 29]]);
      const [re, im] = rng.bool() ? [x, y] : [y, x];
      const sre = rng.bool() ? re : -re; const sim = rng.bool() ? im : -im;
      return item({ format: 'type_in', prompt: `What is the modulus of the complex number ${sre} ${sim < 0 ? '-' : '+'} ${Math.abs(sim)}i?`, answer: String(h),
        rationale: `|a + bi| = √(a^2 + b^2) = √(${re * re} + ${im * im}) = ${h}.` });
    }
    if (kind === 'pseries') {
      const [num, den] = rng.pick([[1, 2], [2, 3], [3, 4], [1, 1], [3, 2], [5, 4], [2, 1], [4, 3], [5, 3], [1, 3]]);
      const conv = num / den > 1;
      const shown = den === 1 ? String(num) : `${num}/${den}`;
      return item({ format: 'multiple_choice', prompt: `Does the series Σ 1/n^p (n = 1, 2, 3, …) converge when p = ${shown}?`, choices: rng.shuffle(['it converges', 'it diverges', 'it converges only conditionally']), answer: conv ? 'it converges' : 'it diverges',
        rationale: `A p-series converges exactly when p > 1; here p = ${shown}, so it ${conv ? 'converges' : 'diverges'}.` });
    }
    if (kind === 'radius') {
      const k = rng.int(2, 9); const j = rng.int(0, 3);
      const term = j === 0 ? `x^n / ${k}^n` : j === 1 ? `n x^n / ${k}^n` : `n^${j} x^n / ${k}^n`;
      return item({ format: 'type_in', prompt: `What is the radius of convergence of the power series Σ ${term} (n ≥ 0)?`, answer: String(k),
        rationale: `By the root test the nth root of the coefficient tends to 1/${k}${j ? ` (the polynomial factor in n has nth root tending to 1)` : ''}, so R = ${k}.` });
    }
    if (kind === 'residue') {
      const [a, b] = rng.sample([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5], 2);
      const f = (v) => (v === 0 ? 'z' : v < 0 ? `(z + ${-v})` : `(z - ${v})`);
      return item({ format: 'type_in', prompt: `What is the residue of f(z) = 1 / (${f(a)}${f(b)}) at z = ${a}?   (as a fraction in lowest terms)`, answer: frac(1, a - b),
        rationale: `At the simple pole z = ${a} the residue is 1 / (${a} - (${b})) = ${frac(1, a - b)}.` });
    }
    if (kind === 'contour') {
      const R = rng.int(1, 6); let a = rng.int(-8, 8); while (Math.abs(a) === R) a = rng.int(-8, 8);
      const inside = Math.abs(a) < R;
      const den = a === 0 ? 'z' : a < 0 ? `z + ${-a}` : `z - ${a}`;
      return item({ format: 'multiple_choice', prompt: `Let C be the circle |z| = ${R}, traversed once counterclockwise. What is the integral of 1/(${den}) dz around C?`, choices: rng.shuffle(['2πi', '0', 'πi', '-2πi']), answer: inside ? '2πi' : '0',
        rationale: inside ? `The integrand has its pole at z = ${a}, inside C, with residue 1, so the integral is 2πi.` : `The integrand has its pole at z = ${a}, outside C, so the integrand is holomorphic inside and the integral is 0 (Cauchy's theorem).` });
    }
    const ENTIRE = ['e^z', 'sin z', 'z^3 + 2z', 'cos z + z^2'];
    const NOT = ['the complex conjugate of z', '|z|^2', 'Re(z)', 'Im(z)', '|z|'];
    const ans = rng.pick(ENTIRE);
    return item({ format: 'multiple_choice', prompt: 'Which of these functions is holomorphic on all of ℂ?', choices: rng.shuffle([ans, ...rng.sample(NOT, 3)]), answer: ans,
      rationale: `${ans} satisfies the Cauchy-Riemann equations everywhere; the others fail them (they depend on the conjugate of z).` });
  },

  topology(rng, d) {
    const kind = pickKind(rng, d, [8, 9], [['openClosed', 'components', 'polyhedron'], ['eulerGenus', 'compact', 'pi1', 'components'], ['betti', 'pi1', 'eulerGenus', 'compact']]);
    if (kind === 'openClosed') {
      const a = rng.int(-5, 3); const b = a + rng.int(1, 6);
      const [l, r] = rng.pick([['(', ')'], ['[', ']'], ['[', ')'], ['(', ']']]);
      const ans = l === '(' && r === ')' ? 'open' : l === '[' && r === ']' ? 'closed' : 'neither open nor closed';
      return item({ format: 'multiple_choice', prompt: `In ℝ with the usual topology, the interval ${l}${a}, ${b}${r} is`, choices: rng.shuffle(['open', 'closed', 'neither open nor closed', 'both open and closed']), answer: ans,
        rationale: ans === 'open' ? 'Every point has a small interval around it inside the set.' : ans === 'closed' ? 'Its complement is a union of two open rays, so it is closed.' : 'It contains one endpoint and not the other, so it is neither open nor closed.' });
    }
    if (kind === 'components') {
      const pts = rng.sample(Array.from({ length: 12 }, (_, i) => i), 4).sort((x, y) => x - y);
      const pieces = [[pts[0], pts[1]], [pts[2], pts[3]]];
      const overlap = rng.bool(0.3);
      if (overlap) pieces[1] = [pts[1], pts[3]];
      const single = rng.bool(0.5) ? 15 + rng.int(0, 5) : null;
      const shown = pieces.map(([x, y]) => `[${x}, ${y}]`).concat(single == null ? [] : [`{${single}}`]).join(' ∪ ');
      const count = (overlap ? 1 : 2) + (single == null ? 0 : 1);
      return item({ format: 'type_in', prompt: `How many connected components does the subset ${shown} of ℝ have?`, answer: String(count),
        rationale: `${overlap ? 'The two intervals share a point, so they form one interval' : 'The two intervals are separated by a gap'}${single == null ? '' : ', and the single point is its own component'}: ${count}.` });
    }
    if (kind === 'polyhedron') {
      const P = [['tetrahedron', 4, 6, 4], ['cube', 8, 12, 6], ['octahedron', 6, 12, 8], ['dodecahedron', 20, 30, 12], ['icosahedron', 12, 30, 20], ['triangular prism', 6, 9, 5], ['pentagonal prism', 10, 15, 7], ['square pyramid', 5, 8, 5], ['hexagonal prism', 12, 18, 8]];
      const [, V, E, F] = rng.pick(P);
      return item({ format: 'type_in', prompt: `A convex polyhedron has ${V} vertices and ${E} edges. How many faces does it have?`, answer: String(F),
        rationale: `Euler's formula V - E + F = 2 gives F = 2 - ${V} + ${E} = ${F}.` });
    }
    if (kind === 'eulerGenus') { const g = rng.int(0, 8); return item({ format: 'type_in', prompt: `What is the Euler characteristic of a closed orientable surface of genus ${g}?`, answer: String(2 - 2 * g), rationale: `χ = 2 - 2g = 2 - ${2 * g} = ${2 - 2 * g}.` }); }
    if (kind === 'betti') { const g = rng.int(1, 8); return item({ format: 'type_in', prompt: `What is the first Betti number of a closed orientable surface of genus ${g}?`, answer: String(2 * g), rationale: `H_1 of a genus-g surface is ℤ^(2g), so b_1 = ${2 * g}.` }); }
    if (kind === 'compact') {
      const a = rng.int(-5, 2); const b = a + rng.int(1, 6);
      const NON = [`(${a}, ${b})`, `[${a}, ∞)`, `[${a}, ${b})`, 'ℤ', 'ℚ ∩ [0, 1]'];
      return item({ format: 'multiple_choice', prompt: 'Which of these subsets of ℝ is compact?', choices: rng.shuffle([`[${a}, ${b}]`, ...rng.sample(NON, 3)]), answer: `[${a}, ${b}]`,
        rationale: `By Heine-Borel a subset of ℝ is compact exactly when it is closed and bounded; only [${a}, ${b}] is both.` });
    }
    const PI1 = { 'the circle S^1': 'ℤ', 'the 2-sphere S^2': 'the trivial group', 'the torus': 'ℤ × ℤ', 'the real projective plane': 'ℤ/2ℤ', 'the figure-eight space': 'the free group on two generators' };
    const space = rng.pick(Object.keys(PI1));
    const ans = PI1[space];
    return item({ format: 'multiple_choice', prompt: `What is the fundamental group of ${space}?`, choices: rng.shuffle([ans, ...rng.sample(Object.values(PI1).filter((v) => v !== ans), 3)]), answer: ans,
      rationale: `The fundamental group of ${space} is ${ans}.` });
  },
};

// ── school tiers for the shared skills (standards check, 2026-10-24) ─────────
// add_sub, fractions, decimals and the rest also serve the ACT and the upper
// grades, and their difficulty scale was set for those: a first-grader drew
// "48 − 93" (negatives are 7.NS.1) and "Which is larger: 21 + 12, 21 − 12 or
// 21 × 12?", a third-grader 3/8 − 5/6 (unlike denominators are 5.NF.1) and the
// area of a circle (7.G.4). A school grade now passes its grade (`ctx.school`,
// config/grade-skills.js schoolGrade) and is served the tier its Common Core
// standard covers; the difficulty still sets the number size inside the tier.
// A function returns null where the skill's own generator already fits.
// Every prompt here has its verifier in scripts/math-reading-template-audit.js.
const nn = (x) => String(Number(x.toFixed(6)));
const twoOf = (rng, list) => rng.sample(list, 2);
const SCHOOL = {
  add_sub(rng, d, g) {
    if (g >= 7) return null;
    const name = rng.pick(NAMES); const thing = rng.pick(THINGS);
    if (g <= 1) {
      // 1.NBT.4-6, 1.OA.1 and 1.OA.8: within 100, a ten at a time, no negatives.
      const kind = rng.pick(['twoOne', 'plusTens', 'tensMinus', 'missing', 'story', 'storyAway']);
      if (kind === 'twoOne') { const a = rng.int(11, 89); const b = rng.int(1, Math.min(9, 99 - a)); return item({ format: 'type_in', prompt: `${a} + ${b} =`, answer: String(a + b), rationale: `Add the ones to ${a}: ${a} + ${b} = ${a + b}.` }); }
      if (kind === 'plusTens') { const t = 10 * rng.int(1, 4); const a = rng.int(11, 99 - t); return item({ format: 'type_in', prompt: `${a} + ${t} =`, answer: String(a + t), rationale: `${t} is ${t / 10} ${plural(t / 10, 'ten', 'tens')}, so the tens digit goes up by ${t / 10}: ${a + t}.` }); }
      if (kind === 'tensMinus') { const x = 10 * rng.int(2, 9); const y = 10 * rng.int(1, x / 10 - 1); return item({ format: 'type_in', prompt: `${x} - ${y} =`, answer: String(x - y), rationale: `${x / 10} tens take away ${y / 10} ${plural(y / 10, 'ten', 'tens')} is ${(x - y) / 10} ${plural((x - y) / 10, 'ten', 'tens')}: ${x - y}.` }); }
      const s = rng.int(6, 20); const a = rng.int(2, s - 2);
      if (kind === 'missing') return item({ format: 'type_in', prompt: `___ + ${s - a} = ${s}`, answer: String(a), rationale: `${s} - ${s - a} = ${a}, and ${a} + ${s - a} = ${s}.` });
      if (kind === 'story') return item({ format: 'type_in', prompt: `${name} has ${a} ${thing}. ${name} gets ${s - a} more. How many ${thing} does ${name} have now?`, answer: String(s), rationale: `Getting more means adding: ${a} + ${s - a} = ${s}.` });
      return item({ format: 'type_in', prompt: `${name} has ${s} ${thing} and gives ${a} away. How many ${thing} are left?`, answer: String(s - a), rationale: `${s} - ${a} = ${s - a}.` });
    }
    if (g === 2) {
      // 2.NBT.5-7 and 2.OA.1: within 100, then within 1,000; up to four
      // two-digit numbers; one- and two-step stories.
      const lim = d < 2 ? 100 : 1000;
      const kind = rng.pick(['sum', 'diff', 'four', 'missing', 'twoStep', 'compare']);
      if (kind === 'sum') { const a = rng.int(10, lim / 2); const b = rng.int(10, lim - 1 - a); return item({ format: 'type_in', prompt: `${a} + ${b} =`, answer: String(a + b), rationale: `Add ones, tens${lim > 100 ? ' and hundreds' : ''}, regrouping where a place reaches ten: ${a + b}.` }); }
      if (kind === 'diff') { const a = rng.int(20, lim - 1); const b = rng.int(10, a - 1); return item({ format: 'type_in', prompt: `${a} - ${b} =`, answer: String(a - b), rationale: `${a} - ${b} = ${a - b}. Check: ${a - b} + ${b} = ${a}.` }); }
      if (kind === 'four') { const xs = Array.from({ length: rng.int(3, 4) }, () => rng.int(10, 49)); const s = xs.reduce((p, q) => p + q, 0); return item({ format: 'type_in', prompt: `${xs.join(' + ')} =`, answer: String(s), rationale: `Add them in any order, tens and ones: ${s}.` }); }
      if (kind === 'missing') { const s = rng.int(30, 100); const b = rng.int(10, s - 10); return item({ format: 'type_in', prompt: `___ + ${b} = ${s}`, answer: String(s - b), rationale: `${s} - ${b} = ${s - b}.` }); }
      if (kind === 'twoStep') {
        const a = rng.int(20, 60); const b = rng.int(5, 30); const c = rng.int(5, a + b - 5);
        return item({ format: 'type_in', prompt: `${name} had ${a} ${thing}, got ${b} more and then gave away ${c}. How many ${thing} does ${name} have now?`, answer: String(a + b - c),
          rationale: `${a} + ${b} = ${a + b}, and ${a + b} - ${c} = ${a + b - c}.` });
      }
      const [p, q] = rng.sample(NAMES, 2); const small = rng.int(10, 60); const big = small + rng.int(5, 39);
      return item({ format: 'type_in', prompt: `${p} has ${big} ${thing}. ${q} has ${small} ${thing}. How many more ${thing} does ${p} have than ${q}?`, answer: String(big - small), rationale: `Compare by subtracting: ${big} - ${small} = ${big - small}.` });
    }
    if (g === 3) {
      // 3.NBT.1-2 and 3.OA.8: within 1,000, rounding to estimate, two steps.
      const kind = rng.pick(['sum', 'diff', 'round', 'estimate', 'error', 'twoStep']);
      if (kind === 'sum') { const a = rng.int(100, 600); const b = rng.int(100, 999 - a); return item({ format: 'type_in', prompt: `${a} + ${b} =`, answer: String(a + b), rationale: `${a} + ${b} = ${a + b}.` }); }
      if (kind === 'diff') { const a = rng.int(300, 999); const b = rng.int(100, a - 1); return item({ format: 'type_in', prompt: `${a} - ${b} =`, answer: String(a - b), rationale: `${a} - ${b} = ${a - b}. Check: ${a - b} + ${b} = ${a}.` }); }
      if (kind === 'round') { const a = rng.int(100, 450); const b = rng.int(100, 450); return item({ format: 'type_in', prompt: `Work out ${a} + ${b}, then round the sum to the nearest ten.`, answer: String(Math.round((a + b) / 10) * 10), rationale: `${a} + ${b} = ${a + b}, which rounds to ${Math.round((a + b) / 10) * 10}.` }); }
      if (kind === 'estimate') {
        const r = () => { let n = rng.int(110, 480); while (n % 100 === 50) n = rng.int(110, 480); return n; };
        const a = r(); const b = r(); const e = Math.round(a / 100) * 100 + Math.round(b / 100) * 100;
        return item({ format: 'type_in', prompt: `Round ${a} and ${b} to the nearest hundred, then add. What is the estimate?`, answer: String(e), rationale: `${a} rounds to ${Math.round(a / 100) * 100} and ${b} to ${Math.round(b / 100) * 100}; together ${e}.` });
      }
      if (kind === 'error') { const a = rng.int(120, 480); const b = rng.int(120, 480); const w = a + b + 10 * rng.int(1, 3); return item({ format: 'type_in', prompt: `Someone adds ${a} + ${b} and writes ${w}. By how much are they wrong?`, answer: String(w - a - b), rationale: `${a} + ${b} is ${a + b}, which is ${w - a - b} away from ${w}.` }); }
      const a = rng.int(200, 500); const b = rng.int(50, 300); const c = rng.int(50, a + b - 50);
      return item({ format: 'type_in', prompt: `${name} had ${a} ${thing}, got ${b} more and then gave away ${c}. How many ${thing} does ${name} have now?`, answer: String(a + b - c), rationale: `${a} + ${b} = ${a + b}, and ${a + b} - ${c} = ${a + b - c}.` });
    }
    // Grades 4-6: multi-digit whole numbers within 1,000,000 (4.NBT.4), and
    // multi-digit decimals in grade 6 (6.NS.3). Never below zero (7.NS.1).
    const digits = d < 2.5 ? 4 : d < 3.5 ? 5 : 6;
    const top = 10 ** digits - 1;
    const kind = rng.pick(['sum', 'diff', 'missing', 'roundThousand', 'error', ...(g >= 6 ? ['decimal', 'decimalDiff'] : [])]);
    if (kind === 'sum') { const a = rng.int(10 ** (digits - 1), Math.floor(top / 2)); const b = rng.int(10 ** (digits - 1), top - a); return item({ format: 'type_in', prompt: `${a} + ${b} =`, answer: String(a + b), rationale: `Line up the places and add, regrouping as needed: ${a + b}.` }); }
    if (kind === 'diff') { const a = rng.int(2 * 10 ** (digits - 1), top); const b = rng.int(10 ** (digits - 1), a - 1); return item({ format: 'type_in', prompt: `${a} - ${b} =`, answer: String(a - b), rationale: `Line up the places and subtract, regrouping as needed: ${a - b}. Check: ${a - b} + ${b} = ${a}.` }); }
    if (kind === 'missing') { const s = rng.int(2 * 10 ** (digits - 1), top); const b = rng.int(10 ** (digits - 1), s - 1); return item({ format: 'type_in', prompt: `___ + ${b} = ${s}`, answer: String(s - b), rationale: `${s} - ${b} = ${s - b}.` }); }
    if (kind === 'roundThousand') {
      const r = () => { let n = rng.int(1100, 48000); while (n % 1000 === 500) n = rng.int(1100, 48000); return n; };
      const a = r(); const b = r(); const e = Math.round(a / 1000) * 1000 + Math.round(b / 1000) * 1000;
      return item({ format: 'type_in', prompt: `Round ${a} and ${b} to the nearest thousand, then add. What is the estimate?`, answer: String(e), rationale: `${a} rounds to ${Math.round(a / 1000) * 1000} and ${b} to ${Math.round(b / 1000) * 1000}; together ${e}.` });
    }
    if (kind === 'error') { const a = rng.int(1000, 4999); const b = rng.int(1000, 4999); const w = a + b + 100 * rng.int(1, 3); return item({ format: 'type_in', prompt: `Someone adds ${a} + ${b} and writes ${w}. By how much are they wrong?`, answer: String(w - a - b), rationale: `${a} + ${b} is ${a + b}, which is ${w - a - b} away from ${w}.` }); }
    const a = rng.int(1000, 9999) / 100; const b = rng.int(100, 4999) / 100;
    if (kind === 'decimal') return item({ format: 'type_in', prompt: `${a} + ${b} =`, answer: nn(a + b), rationale: `Line up the decimal points and add: ${nn(a + b)}.` });
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return item({ format: 'type_in', prompt: `${hi} - ${lo} =`, answer: nn(hi - lo), rationale: `Line up the decimal points and subtract: ${nn(hi - lo)}.` });
  },

  mul_div(rng, d, g) {
    if (g >= 5) return null;
    const name = rng.pick(NAMES); const thing = rng.pick(THINGS);
    if (g <= 2) {
      // 2.OA.3-4 and 2.NBT.2: arrays up to 5 by 5, equal addends, skip counting, odd and even.
      const kind = rng.pick(['array', 'repeated', 'skip', 'even']);
      const r = rng.int(2, 5); const c = rng.int(2, 5);
      if (kind === 'array') { const sym = rng.pick(SYMBOLS); return item({ format: 'type_in', prompt: `An array has ${r} rows with ${c} ${sym[1]} in each row. How many ${sym[1]} are there in all?`, answer: String(r * c), rationale: `${r} rows of ${c}: ${Array(r).fill(c).join(' + ')} = ${r * c}.` }); }
      if (kind === 'repeated') return item({ format: 'type_in', prompt: `${Array(r).fill(c).join(' + ')} =`, answer: String(r * c), rationale: `${r} groups of ${c} make ${r * c}.` });
      if (kind === 'skip') { const k = rng.pick([2, 5, 10, 100]); const s = rng.int(1, 6); return item({ format: 'type_in', prompt: `Skip count by ${k}s: ${k * s}, ${k * (s + 1)}, ${k * (s + 2)}, ___. What comes next?`, answer: String(k * (s + 3)), rationale: `Each number is ${k} more than the one before: ${k * (s + 3)}.` }); }
      const even = 2 * rng.int(2, 10); const odds = rng.sample([3, 5, 7, 9, 11, 13, 15, 17, 19], 2);
      return item({ format: 'multiple_choice', prompt: 'Which of these numbers is even?', choices: rng.shuffle([even, ...odds].map(String)), answer: String(even),
        rationale: `${even} can be split into two equal groups of ${even / 2}; the odd numbers leave one over.` });
    }
    if (g === 3) {
      // 3.OA.1-7 and 3.NBT.3: facts within 100, unknown factors, one digit times a
      // multiple of ten, equal groups.
      const kind = rng.pick(['fact', 'divide', 'missing', 'tens', 'share', 'groups']);
      const a = rng.int(2, 9); const b = rng.int(2, 9);
      if (kind === 'fact') return item({ format: 'type_in', prompt: `${a} × ${b} =`, answer: String(a * b), rationale: `${a} groups of ${b} make ${a * b}.` });
      if (kind === 'divide') return item({ format: 'type_in', prompt: `${a * b} ÷ ${b} =`, answer: String(a), rationale: `${b} × ${a} = ${a * b}, so ${a * b} ÷ ${b} = ${a}.` });
      if (kind === 'missing') return item({ format: 'type_in', prompt: `${a} × ___ = ${a * b}`, answer: String(b), rationale: `${a} × ${b} = ${a * b}.` });
      if (kind === 'tens') { const t = 10 * rng.int(2, 9); return item({ format: 'type_in', prompt: `${a} × ${t} =`, answer: String(a * t), rationale: `${a} × ${t / 10} = ${a * t / 10}, and ${a} tens times ${t / 10} is ${a * t / 10} tens: ${a * t}.` }); }
      if (kind === 'share') return item({ format: 'type_in', prompt: `${name} shares ${a * b} ${thing} equally among ${b} friends. How many ${thing} does each friend get?`, answer: String(a), rationale: `${a * b} ÷ ${b} = ${a}.` });
      return item({ format: 'type_in', prompt: `There are ${a} bags with ${b} ${thing} in each bag. How many ${thing} are there in all?`, answer: String(a * b), rationale: `${a} × ${b} = ${a * b}.` });
    }
    // 4.NBT.5-6 and 4.OA.1-4: four digits by one, two digits by two, division with
    // remainders, factors, "times as many".
    const kind = rng.pick(['fourByOne', 'twoByTwo', 'divide', 'remainder', 'factor', 'timesAsMany']);
    if (kind === 'fourByOne') { const a = rng.int(1000, 9999); const b = rng.int(2, 9); return item({ format: 'type_in', prompt: `${a} × ${b} =`, answer: String(a * b), rationale: `Multiply each place by ${b} and add: ${a * b}.` }); }
    if (kind === 'twoByTwo') { const a = rng.int(11, 99); const b = rng.int(11, 99); return item({ format: 'type_in', prompt: `${a} × ${b} =`, answer: String(a * b), rationale: `${a} × ${b - (b % 10)} + ${a} × ${b % 10} = ${a * (b - (b % 10))} + ${a * (b % 10)} = ${a * b}.` }); }
    if (kind === 'divide') { const q = rng.int(100, 999); const b = rng.int(2, 9); return item({ format: 'type_in', prompt: `${q * b} ÷ ${b} =`, answer: String(q), rationale: `${b} × ${q} = ${q * b}.` }); }
    if (kind === 'remainder') { const b = rng.int(3, 9); const n = b * rng.int(100, 999) + rng.int(1, b - 1); return item({ format: 'type_in', prompt: `What is the remainder when ${n} is divided by ${b}?`, answer: String(n % b), rationale: `${b} × ${Math.floor(n / b)} = ${n - (n % b)}, and ${n} - ${n - (n % b)} = ${n % b}.` }); }
    if (kind === 'factor') {
      const n = rng.pick([12, 18, 20, 24, 30, 36, 40, 42, 48, 54, 56, 60, 63, 72, 84, 90]);
      const fs = divisors(n).filter((x) => x > 1 && x < n); const nots = Array.from({ length: 11 }, (_, i) => i + 2).filter((x) => n % x !== 0);
      const f = rng.pick(fs);
      return item({ format: 'multiple_choice', prompt: `Which of these numbers is a factor of ${n}?`, choices: rng.shuffle([f, ...rng.sample(nots, 3)].map(String)), answer: String(f),
        rationale: `${n} ÷ ${f} = ${n / f} with nothing left over, so ${f} is a factor of ${n}.` });
    }
    const [p, q] = rng.sample(NAMES, 2); const a = rng.int(3, 12); const k = rng.int(2, 9);
    return item({ format: 'type_in', prompt: `${p} has ${a} ${thing}. ${q} has ${k} times as many. How many ${thing} does ${q} have?`, answer: String(a * k), rationale: `${k} times as many as ${a} is ${k} × ${a} = ${a * k}.` });
  },

  fractions(rng, d, g) {
    if (g >= 7) return null;
    const lowest = '   (answer in lowest terms, as a fraction like 3/4)';
    const coprime = (b) => { let a = rng.int(1, b - 1); while (gcd(a, b) !== 1) a = rng.int(1, b - 1); return a; };
    if (g <= 3) {
      // 3.NF.1-3, denominators 2, 3, 4, 6 and 8: unit fractions, the number line,
      // simple equivalents, comparing with a shared numerator or denominator.
      const kind = rng.pick(['unit', 'shaded', 'line', 'equiv', 'sameDen', 'sameNum', 'whole']);
      const b = rng.pick([2, 3, 4, 6, 8]);
      if (kind === 'unit') { const what = rng.pick(['pizza', 'cake', 'pie', 'sandwich']); return item({ format: 'type_in', prompt: `A ${what} is cut into ${b} equal pieces. What fraction of the ${what} is one piece?`, answer: `1/${b}`, rationale: `One of ${b} equal pieces is 1/${b}.` }); }
      if (kind === 'shaded') { const a = coprime(b); return item({ format: 'type_in', prompt: `A bar is split into ${b} equal parts and ${a} of them ${a === 1 ? 'is' : 'are'} shaded. What fraction of the bar is shaded?`, answer: `${a}/${b}`, rationale: `${a} ${plural(a, 'part', 'parts')} of size 1/${b} ${plural(a, 'makes', 'make')} ${a}/${b}.` }); }
      if (kind === 'line') { const a = coprime(b); return item({ format: 'type_in', prompt: `A number line from 0 to 1 is split into ${b} equal parts. What fraction names the point ${a} ${plural(a, 'part', 'parts')} from 0?`, answer: `${a}/${b}`, rationale: `Each part is 1/${b}, so ${a} of them reach ${a}/${b}.` }); }
      if (kind === 'equiv') { const [p, q] = rng.pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4]]); const k = rng.pick([2, 3, 4].filter((x) => [4, 6, 8].includes(q * x)) .concat(q * 2 <= 8 ? [2] : [])); return item({ format: 'type_in', prompt: `${p}/${q} = ___/${q * k}. What number goes in the blank?`, answer: String(p * k), rationale: `${q} × ${k} = ${q * k}, so the top is ${p} × ${k} = ${p * k}.` }); }
      if (kind === 'sameDen') { const [a, c] = twoOf(rng, Array.from({ length: b - 1 }, (_, i) => i + 1).concat(b > 2 ? [] : [])); if (a === undefined || c === undefined) return SCHOOL.fractions(rng, d, g); return item({ format: 'type_in', prompt: `Which is larger: ${a}/${b} or ${c}/${b}?`, answer: `${Math.max(a, c)}/${b}`, rationale: `The pieces are the same size (1/${b}), so more pieces is larger: ${Math.max(a, c)}/${b}.` }); }
      if (kind === 'sameNum') { const [x, y] = twoOf(rng, [2, 3, 4, 6, 8]); return item({ format: 'type_in', prompt: `Which is larger: 1/${x} or 1/${y}?`, answer: `1/${Math.min(x, y)}`, rationale: `With the same number of pieces, fewer equal parts means bigger pieces: 1/${Math.min(x, y)}.` }); }
      return item({ format: 'type_in', prompt: `How many 1/${b} pieces make one whole?`, answer: String(b), rationale: `${b} pieces of 1/${b} make ${b}/${b} = 1.` });
    }
    if (g === 4) {
      // 4.NF.1-5: equivalents, comparing, like denominators, mixed numbers, a whole
      // number times a fraction, tenths as hundredths.
      const kind = rng.pick(['equiv', 'compare', 'addLike', 'subLike', 'improper', 'wholeTimes', 'tenths']);
      const b = rng.pick([3, 4, 5, 6, 8, 10, 12]);
      if (kind === 'equiv') { const a = coprime(b); const k = rng.int(2, 5); return item({ format: 'type_in', prompt: `${a}/${b} = ___/${b * k}. What number goes in the blank?`, answer: String(a * k), rationale: `Multiply top and bottom by ${k}: ${a * k}/${b * k}.` }); }
      if (kind === 'compare') {
        const e = rng.pick([3, 4, 5, 6, 8, 10, 12].filter((x) => x !== b)); const a = coprime(b); let c = coprime(e);
        for (let t = 0; t < 10 && a * e === c * b; t++) c = coprime(e);
        if (a * e === c * b) return SCHOOL.fractions(rng, d, g);
        return item({ format: 'type_in', prompt: `Which is larger: ${a}/${b} or ${c}/${e}?`, answer: a * e > c * b ? `${a}/${b}` : `${c}/${e}`, rationale: `With a common denominator of ${b * e}: ${a * e}/${b * e} and ${c * b}/${b * e}.` });
      }
      if (kind === 'addLike') { const a = rng.int(1, b - 1); const c = rng.int(1, b - 1); return item({ format: 'type_in', prompt: `${a}/${b} + ${c}/${b} =${lowest}`, answer: frac(a + c, b), rationale: `Same-size pieces: ${a} + ${c} = ${a + c} of them, ${a + c}/${b} = ${frac(a + c, b)}.` }); }
      if (kind === 'subLike') { const a = rng.int(2, b - 1); const c = rng.int(1, a - 1); return item({ format: 'type_in', prompt: `${a}/${b} - ${c}/${b} =${lowest}`, answer: frac(a - c, b), rationale: `${a} - ${c} = ${a - c} ${plural(a - c, 'piece', 'pieces')} of 1/${b}: ${frac(a - c, b)}.` }); }
      if (kind === 'improper') { const w = rng.int(1, 5); const a = coprime(b); return item({ format: 'type_in', prompt: `Write ${w} ${a}/${b} as an improper fraction.`, answer: frac(w * b + a, b), rationale: `${w} = ${w * b}/${b}, and ${w * b}/${b} + ${a}/${b} = ${w * b + a}/${b}.` }); }
      if (kind === 'wholeTimes') { const n = rng.int(2, 9); const a = rng.int(1, b - 1); return item({ format: 'type_in', prompt: `${n} × ${a}/${b} =${lowest}`, answer: frac(n * a, b), rationale: `${n} groups of ${a}/${b} is ${n * a}/${b} = ${frac(n * a, b)}.` }); }
      const t = rng.int(1, 9); return item({ format: 'type_in', prompt: `${t}/10 = ___/100. What number goes in the blank?`, answer: String(10 * t), rationale: `Each tenth is ten hundredths, so ${t}/10 = ${10 * t}/100.` });
    }
    // Grades 5-6: unlike denominators (5.NF.1), multiplying (5.NF.4), unit
    // fractions and whole numbers divided (5.NF.7), fraction by fraction (6.NS.1).
    // Results stay positive: signed numbers are grade 7.
    const dens = [2, 3, 4, 5, 6, 8, 9, 10, 12];
    const [b, e] = twoOf(rng, dens); const a = coprime(b); const c = coprime(e);
    const kind = rng.pick(['add', 'sub', 'mul', ...(g >= 6 ? ['div', 'div'] : ['unitDiv', 'wholeDiv'])]);
    if (kind === 'add') return item({ format: 'type_in', prompt: `${a}/${b} + ${c}/${e} =${lowest}`, answer: frac(a * e + c * b, b * e), rationale: `Common denominator ${b * e}: ${a * e}/${b * e} + ${c * b}/${b * e} = ${frac(a * e + c * b, b * e)}.` });
    if (kind === 'sub') {
      const [p, q, r, s] = a * e >= c * b ? [a, b, c, e] : [c, e, a, b];
      if (p * s === r * q) return SCHOOL.fractions(rng, d, g);
      return item({ format: 'type_in', prompt: `${p}/${q} - ${r}/${s} =${lowest}`, answer: frac(p * s - r * q, q * s), rationale: `Common denominator ${q * s}: ${p * s}/${q * s} - ${r * q}/${q * s} = ${frac(p * s - r * q, q * s)}.` });
    }
    if (kind === 'mul') return item({ format: 'type_in', prompt: `${a}/${b} × ${c}/${e} =${lowest}`, answer: frac(a * c, b * e), rationale: `Multiply straight across: ${a * c}/${b * e} = ${frac(a * c, b * e)}.` });
    if (kind === 'div') return item({ format: 'type_in', prompt: `${a}/${b} ÷ ${c}/${e} =${lowest}`, answer: frac(a * e, b * c), rationale: `Multiply by the reciprocal: ${a}/${b} × ${e}/${c} = ${frac(a * e, b * c)}.` });
    const n = rng.int(2, 8);
    if (kind === 'unitDiv') return item({ format: 'type_in', prompt: `1/${b} ÷ ${n} =${lowest}`, answer: frac(1, b * n), rationale: `Splitting 1/${b} into ${n} equal parts makes parts of 1/${b * n}.` });
    return item({ format: 'type_in', prompt: `${n} ÷ 1/${b} =`, answer: String(n * b), rationale: `Each whole holds ${b} pieces of 1/${b}, so ${n} wholes hold ${n * b}.` });
  },

  decimals(rng, d, g) {
    if (g >= 7) return null;
    if (g <= 4) {
      // 4.NF.5-7: tenths and hundredths as decimals, and comparing them.
      const kind = rng.pick(['toDecimal', 'toHundredths', 'compare', 'digit']);
      if (kind === 'toDecimal') { const den = rng.pick([10, 100]); const n = den === 10 ? rng.int(1, 9) : rng.int(1, 99); return item({ format: 'type_in', prompt: `Write ${n}/${den} as a decimal.`, answer: nn(n / den), rationale: `${n}/${den} is ${nn(n / den)}: the last digit sits in the ${den === 10 ? 'tenths' : 'hundredths'} place.` }); }
      if (kind === 'toHundredths') { const h = rng.int(1, 99); return item({ format: 'type_in', prompt: `Write ${nn(h / 100)} as a fraction with a denominator of 100.`, answer: `${h}/100`, rationale: `${nn(h / 100)} has its last digit in the hundredths place, so it is ${h}/100.` }); }
      if (kind === 'compare') { const [x, y] = twoOf(rng, Array.from({ length: 98 }, (_, i) => i + 1)); return item({ format: 'type_in', prompt: `Which is larger: ${nn(x / 100)} or ${nn(y / 100)}?`, answer: nn(Math.max(x, y) / 100), rationale: `Compare the tenths first, then the hundredths: ${nn(Math.max(x, y) / 100)} is larger.` }); }
      const w = rng.int(1, 9); const t = rng.int(0, 9); const h = rng.int(1, 9);
      return item({ format: 'type_in', prompt: `In ${w}.${t}${h}, which digit is in the hundredths place?`, answer: String(h), rationale: `The second digit after the point is the hundredths: ${h}.` });
    }
    if (g === 5) {
      // 5.NBT.2, 5.NBT.4 and 5.NBT.7: to hundredths, times and divided by 10 and 100, rounding.
      const kind = rng.pick(['add', 'sub', 'timesWhole', 'pow10', 'round']);
      const a = rng.int(101, 999) / 100; const b = rng.int(11, 99) / 10;
      if (kind === 'add') return item({ format: 'type_in', prompt: `${a} + ${b} =`, answer: nn(a + b), rationale: `Line up the decimal points and add: ${nn(a + b)}.` });
      if (kind === 'sub') { const [hi, lo] = a > b ? [a, b] : [b, a]; if (hi === lo) return SCHOOL.decimals(rng, d, g); return item({ format: 'type_in', prompt: `${hi} - ${lo} =`, answer: nn(hi - lo), rationale: `Line up the decimal points and subtract: ${nn(hi - lo)}.` }); }
      if (kind === 'timesWhole') { const n = rng.int(2, 9); return item({ format: 'type_in', prompt: `${a} × ${n} =`, answer: nn(a * n), rationale: `${Math.round(a * 100)} × ${n} = ${Math.round(a * 100) * n} hundredths, which is ${nn(a * n)}.` }); }
      if (kind === 'pow10') { const p = rng.pick([10, 100]); const times = rng.bool(); return item({ format: 'type_in', prompt: times ? `${a} × ${p} =` : `${a} ÷ ${p} =`, answer: nn(times ? a * p : a / p), rationale: `${times ? 'Multiplying' : 'Dividing'} by ${p} moves every digit ${p === 10 ? 'one place' : 'two places'} ${times ? 'left' : 'right'}: ${nn(times ? a * p : a / p)}.` }); }
      let h = rng.int(101, 999); while (h % 10 === 5) h = rng.int(101, 999);
      return item({ format: 'type_in', prompt: `Round ${nn(h / 100)} to the nearest tenth.`, answer: nn(Math.round(h / 10) / 10), rationale: `Look at the hundredths digit, ${h % 10}: ${h % 10 >= 5 ? 'round up' : 'keep the tenths'}, giving ${nn(Math.round(h / 10) / 10)}.` });
    }
    // 6.NS.3: all four operations on multi-digit decimals, never below zero.
    const kind = rng.pick(['add', 'sub', 'mul', 'div']);
    const a = rng.int(1001, 9999) / 100; const b = rng.int(11, 999) / 100;
    if (kind === 'add') return item({ format: 'type_in', prompt: `${a} + ${b} =`, answer: nn(a + b), rationale: `Line up the decimal points and add: ${nn(a + b)}.` });
    if (kind === 'sub') return item({ format: 'type_in', prompt: `${a} - ${b} =`, answer: nn(a - b), rationale: `Line up the decimal points and subtract: ${nn(a - b)}.` });
    if (kind === 'mul') { const x = rng.int(11, 99) / 10; const y = rng.int(11, 99) / 10; return item({ format: 'type_in', prompt: `${x} × ${y} =`, answer: nn(x * y), rationale: `${Math.round(x * 10)} × ${Math.round(y * 10)} = ${Math.round(x * 10) * Math.round(y * 10)}, with 2 decimal places: ${nn(x * y)}.` }); }
    const q = rng.int(2, 40) / 2; const dv = rng.int(2, 25) / 10; const p = Number((q * dv).toFixed(2));
    return item({ format: 'type_in', prompt: `${p} ÷ ${dv} =`, answer: nn(p / dv), rationale: `Multiply both by 10 to divide by a whole number: ${nn(p * 10)} ÷ ${nn(dv * 10)} = ${nn(p / dv)}.` });
  },

  geometry_area(rng, d, g, ctx, full) {
    if (g >= 8) return null;
    if (g === 7) return full(rng, Math.min(d, 6), ctx); // rectangles, triangles, circles (7.G.4) and boxes; no cylinders (8.G.9)
    if (g <= 3) {
      // 3.MD.5-8: area by unit squares and by multiplying, perimeter, an unknown side.
      const kind = rng.pick(['grid', 'rect', 'missingSide']);
      const w = rng.int(2, 10); const h = rng.int(2, 10);
      if (kind === 'grid') return item({ format: 'type_in', prompt: `A rectangle is made of ${h} rows of ${w} unit squares. What is its area, in square units?`, answer: String(w * h), rationale: `${h} rows of ${w} squares: ${h} × ${w} = ${w * h} square units.` });
      if (kind === 'rect') { const perim = rng.bool(); return item({ format: 'type_in', prompt: `A rectangle is ${w} by ${h}. What is its ${perim ? 'perimeter' : 'area'}?`, answer: String(perim ? 2 * (w + h) : w * h), rationale: perim ? `Add all four sides: ${w} + ${h} + ${w} + ${h} = ${2 * (w + h)}.` : `${w} × ${h} = ${w * h} square units.` }); }
      return item({ format: 'type_in', prompt: `A rectangle has a perimeter of ${2 * (w + h)} cm and is ${w} cm long. How wide is it?`, answer: String(h), rationale: `Two lengths are ${2 * w} cm, leaving ${2 * h} cm for two widths: ${h} cm each.` });
    }
    if (g === 4) {
      // 4.MD.3 and 4.MD.5-7: area and perimeter formulas with an unknown side, and angles.
      const kind = rng.pick(['rect', 'missingWidth', 'missingLength', 'angleSum', 'anglePart', 'turn']);
      const w = rng.int(3, 25); const h = rng.int(3, 25);
      if (kind === 'rect') { const perim = rng.bool(); return item({ format: 'type_in', prompt: `A rectangle is ${w} by ${h}. What is its ${perim ? 'perimeter' : 'area'}?`, answer: String(perim ? 2 * (w + h) : w * h), rationale: perim ? `2 × (${w} + ${h}) = ${2 * (w + h)}.` : `${w} × ${h} = ${w * h}.` }); }
      if (kind === 'missingWidth') return item({ format: 'type_in', prompt: `A rectangle has a perimeter of ${2 * (w + h)} cm and is ${w} cm long. How wide is it?`, answer: String(h), rationale: `${2 * (w + h)} ÷ 2 = ${w + h}, and ${w + h} - ${w} = ${h} cm.` });
      if (kind === 'missingLength') return item({ format: 'type_in', prompt: `A rectangle has an area of ${w * h} square metres and is ${w} metres wide. How long is it, in metres?`, answer: String(h), rationale: `${w * h} ÷ ${w} = ${h} metres.` });
      if (kind === 'angleSum') { const a = rng.int(15, 80); const b = rng.int(15, 90); return item({ format: 'type_in', prompt: `Two angles of ${a}° and ${b}° fit together with no gap and no overlap. What is the measure of the angle they make together, in degrees?`, answer: String(a + b), rationale: `Angle measures add: ${a} + ${b} = ${a + b} degrees.` }); }
      if (kind === 'anglePart') { const t = rng.pick([90, 180]); const a = rng.int(10, t - 10); return item({ format: 'type_in', prompt: `A ${t}° angle is split into two angles. One of them is ${a}°. What is the other one, in degrees?`, answer: String(t - a), rationale: `${t} - ${a} = ${t - a} degrees.` }); }
      const [turn, deg] = rng.pick([['quarter', 90], ['half', 180], ['three-quarter', 270], ['full', 360]]);
      return item({ format: 'type_in', prompt: `How many degrees does a ${turn} turn sweep through?`, answer: String(deg), rationale: `A full turn is 360 degrees, and a ${turn} turn is ${deg}.` });
    }
    if (g === 5) {
      // 5.MD.3-5: volume by unit cubes and by length × width × height, added volumes.
      const kind = rng.pick(['cubes', 'box', 'stacked', 'height']);
      const l = rng.int(2, 9); const w = rng.int(2, 9); const h = rng.int(2, 9);
      if (kind === 'cubes') return item({ format: 'type_in', prompt: `A box is packed with unit cubes: ${l} cubes long, ${w} cubes wide and ${h} cubes high. How many unit cubes fill it?`, answer: String(l * w * h), rationale: `${l} × ${w} = ${l * w} cubes in each layer, and ${h} layers make ${l * w * h}.` });
      if (kind === 'box') return item({ format: 'type_in', prompt: `A rectangular box is ${l} by ${w} by ${h}. What is its volume?`, answer: String(l * w * h), rationale: `Volume = length × width × height = ${l * w * h}.` });
      if (kind === 'stacked') { const a = rng.int(2, 6); const b = rng.int(2, 6); const c = rng.int(2, 6); return item({ format: 'type_in', prompt: `One box is ${l} by ${w} by ${h} and another is ${a} by ${b} by ${c}. What is their total volume?`, answer: String(l * w * h + a * b * c), rationale: `${l * w * h} + ${a * b * c} = ${l * w * h + a * b * c}.` }); }
      return item({ format: 'type_in', prompt: `A rectangular box has a volume of ${l * w * h} cubic centimetres. Its base is ${l} cm by ${w} cm. How tall is it, in centimetres?`, answer: String(h), rationale: `The base holds ${l * w} cubes per layer, and ${l * w * h} ÷ ${l * w} = ${h} layers.` });
    }
    // 6.G.1-4: triangles and parallelograms, volume, surface area.
    const kind = rng.pick(['tri', 'parallelogram', 'box', 'surface']);
    const a = rng.int(2, 12); const b = rng.int(2, 12); const c = rng.int(2, 12);
    if (kind === 'tri') { const base = 2 * rng.int(2, 10); return item({ format: 'type_in', prompt: `A triangle has base ${base} and height ${a}. What is its area?`, answer: String(base * a / 2), rationale: `Area = ½ × base × height = ½ × ${base} × ${a} = ${base * a / 2}.` }); }
    if (kind === 'parallelogram') return item({ format: 'type_in', prompt: `A parallelogram has a base of ${a} and a height of ${b}. What is its area?`, answer: String(a * b), rationale: `Area = base × height = ${a} × ${b} = ${a * b}.` });
    if (kind === 'box') return item({ format: 'type_in', prompt: `A rectangular box is ${a} by ${b} by ${c}. What is its volume?`, answer: String(a * b * c), rationale: `Volume = ${a} × ${b} × ${c} = ${a * b * c}.` });
    return item({ format: 'type_in', prompt: `What is the surface area of a rectangular box that is ${a} by ${b} by ${c}?`, answer: String(2 * (a * b + b * c + a * c)), rationale: `Six faces in three pairs: 2 × (${a * b} + ${b * c} + ${a * c}) = ${2 * (a * b + b * c + a * c)}.` });
  },

  exponents(rng, d, g, ctx, full) {
    if (g >= 9) return null;
    if (g === 8) return full(rng, Math.min(d, 5), ctx); // integer powers, roots and the product law (8.EE.1-2); no fractional exponents
    if (g <= 5) {
      // 5.NBT.2: powers of ten. Squares as a first look, because the grade's sheet
      // has a "Perfect Squares" lesson (whole-number exponents are 6.EE.1).
      const kind = rng.pick(['pow10', 'times10', 'zeros', 'square']);
      const n = rng.int(1, 6);
      if (kind === 'pow10') return item({ format: 'type_in', prompt: `10^${n} =`, answer: String(10 ** n), rationale: `10^${n} = ${10 ** n}, a 1 followed by ${n} ${plural(n, 'zero', 'zeros')}.` });
      if (kind === 'times10') { const a = rng.int(2, 9); const p = rng.int(1, 4); return item({ format: 'type_in', prompt: `${a} × 10^${p} =`, answer: String(a * 10 ** p), rationale: `10^${p} is ${10 ** p}, and ${a} × ${10 ** p} = ${a * 10 ** p}.` }); }
      if (kind === 'zeros') return item({ format: 'type_in', prompt: `How many zeros does 10^${n} have when it is written out?`, answer: String(n), rationale: `10^${n} = ${10 ** n}: ${n} ${plural(n, 'zero', 'zeros')}.` });
      const b = rng.int(2, 10); return item({ format: 'type_in', prompt: `${b}^2 =`, answer: String(b * b), rationale: `${b}^2 means ${b} × ${b} = ${b * b}.` });
    }
    // 6.EE.1-2: whole-number exponents, and expressions with them.
    const kind = rng.pick(['power', 'asPower', 'plus', 'times']);
    const b = rng.int(2, 10); const p = rng.int(2, b <= 4 ? 5 : b <= 6 ? 4 : 3);
    if (kind === 'power') return item({ format: 'type_in', prompt: `${b}^${p} =`, answer: String(b ** p), rationale: `${b}^${p} means ${Array(p).fill(b).join(' × ')} = ${b ** p}.` });
    if (kind === 'asPower') return item({ format: 'type_in', prompt: `Write ${Array(p).fill(b).join(' × ')} as a power of ${b}.`, answer: `${b}^${p}`, rationale: `${p} factors of ${b} is ${b}^${p}.` });
    const c = rng.int(1, 20);
    if (kind === 'plus') return item({ format: 'type_in', prompt: `${b}^${p} + ${c} =`, answer: String(b ** p + c), rationale: `The power first: ${b}^${p} = ${b ** p}, then ${b ** p} + ${c} = ${b ** p + c}.` });
    const k = rng.int(2, 9); return item({ format: 'type_in', prompt: `${k} × ${b}^2 =`, answer: String(k * b * b), rationale: `The power first: ${b}^2 = ${b * b}, then ${k} × ${b * b} = ${k * b * b}.` });
  },

  integers(rng, d, g) {
    if (g >= 7) return null;
    // 6.NS.5-8: what a negative number means, order, opposites, absolute value,
    // distance on the coordinate plane. Adding and multiplying them is 7.NS.1-2.
    const kind = rng.pick(['greater', 'least', 'opposite', 'abs', 'colder', 'gridDistance']);
    const m = d < 2.5 ? 10 : 30;
    if (kind === 'greater') { const [a, b] = twoOf(rng, Array.from({ length: 2 * m + 1 }, (_, i) => i - m).filter((x) => x !== 0)); return item({ format: 'type_in', prompt: `Which is greater: ${a} or ${b}?`, answer: String(Math.max(a, b)), rationale: `On a number line ${Math.max(a, b)} is to the right of ${Math.min(a, b)}, so it is greater.` }); }
    if (kind === 'least') {
      const xs = rng.sample(Array.from({ length: 2 * m + 1 }, (_, i) => i - m), 3);
      return item({ format: 'multiple_choice', prompt: `Which of these numbers is the least: ${xs.join(', ')}?`, choices: rng.shuffle(xs.map(String)), answer: String(Math.min(...xs)), rationale: `The least is the one furthest to the left on a number line: ${Math.min(...xs)}.` });
    }
    const a = rng.nz(-m, m);
    if (kind === 'opposite') return item({ format: 'type_in', prompt: `What is the opposite of ${a}?`, answer: String(-a), rationale: `Opposites are the same distance from 0 on opposite sides: ${-a}.` });
    if (kind === 'abs') return item({ format: 'type_in', prompt: `What is the absolute value of ${a}?`, answer: String(Math.abs(a)), rationale: `${a} is ${Math.abs(a)} away from 0, so |${a}| = ${Math.abs(a)}.` });
    if (kind === 'colder') { const [x, y] = twoOf(rng, Array.from({ length: 31 }, (_, i) => i - 20)); return item({ format: 'type_in', prompt: `One morning it is ${x}°C and the next morning it is ${y}°C. Which temperature is colder, in °C?`, answer: String(Math.min(x, y)), rationale: `The colder temperature is the lower number: ${Math.min(x, y)}°C.` }); }
    const x = rng.nz(-9, 9); const [y1, y2] = twoOf(rng, Array.from({ length: 19 }, (_, i) => i - 9));
    return item({ format: 'type_in', prompt: `How far apart are the points (${x}, ${y1}) and (${x}, ${y2}) on a grid?`, answer: String(Math.abs(y1 - y2)), rationale: `They share x = ${x}, so the distance is |${y1} - (${y2})| = ${Math.abs(y1 - y2)}.` });
  },

  linear_eq(rng, d, g) {
    if (g >= 8) return null;
    if (g <= 6) {
      // 6.EE.5 and 6.EE.7: one-step equations with whole numbers.
      const kind = rng.pick(['plus', 'minus', 'times', 'divided', 'which']);
      const x = rng.int(1, d < 2.5 ? 20 : 60); const p = rng.int(2, 12);
      if (kind === 'plus') return item({ format: 'type_in', prompt: `Solve for x:  x + ${p} = ${x + p}`, answer: String(x), rationale: `Subtract ${p} from both sides: x = ${x}.` });
      if (kind === 'minus') return item({ format: 'type_in', prompt: `Solve for x:  x - ${p} = ${x}`, answer: String(x + p), rationale: `Add ${p} to both sides: x = ${x + p}.` });
      if (kind === 'times') return item({ format: 'type_in', prompt: `Solve for x:  ${p}x = ${p * x}`, answer: String(x), rationale: `Divide both sides by ${p}: x = ${x}.` });
      if (kind === 'divided') { const q = rng.int(1, 12); return item({ format: 'type_in', prompt: `Solve for x:  x/${p} = ${q}`, answer: String(q * p), rationale: `Multiply both sides by ${p}: x = ${q * p}.` }); }
      const wrong = rng.sample([...new Set([x - 1, x + 1, x + 2, x * 2, x + p])].filter((v) => v !== x && v > 0), 2);
      return item({ format: 'multiple_choice', prompt: `Which value of x makes ${p}x = ${p * x} true?`, choices: rng.shuffle([x, ...wrong].map(String)), answer: String(x), rationale: `${p} × ${x} = ${p * x}.` });
    }
    // 7.EE.4a: px + q = r and p(x + q) = r, with integers.
    const p = rng.nz(-9, 9); const x = rng.nz(-12, 12); const q = rng.nz(-15, 15);
    if (rng.bool()) {
      const lhs = `${co(p, 'x')} ${q < 0 ? '-' : '+'} ${Math.abs(q)}`;
      return item({ format: 'type_in', prompt: `Solve for x:  ${lhs} = ${p * x + q}`, answer: String(x), rationale: `${q < 0 ? `Add ${-q}` : `Subtract ${q}`} on both sides: ${co(p, 'x')} = ${p * x}, so x = ${x}.` });
    }
    const inner = `x ${q < 0 ? '-' : '+'} ${Math.abs(q)}`;
    return item({ format: 'type_in', prompt: `Solve for x:  ${p}(${inner}) = ${p * (x + q)}`, answer: String(x), rationale: `Divide both sides by ${p}: ${inner} = ${x + q}, so x = ${x}.` });
  },

  inequalities(rng, d, g) {
    if (g >= 7) return null;
    // 6.EE.5 and 6.EE.8: which values make an inequality true, and writing one.
    const kind = rng.pick(['whichTrue', 'write', 'count']);
    const c = rng.int(2, 20);
    const OPS = [['>', (v) => v > c, 'more than'], ['<', (v) => v < c, 'less than'], ['≥', (v) => v >= c, 'at least'], ['≤', (v) => v <= c, 'at most']];
    const [op, test, words] = rng.pick(OPS);
    if (kind === 'whichTrue') {
      const yes = rng.pick([c - 3, c - 1, c, c + 1, c + 3].filter((v) => v >= 0 && test(v)));
      const no = rng.sample([c - 3, c - 1, c, c + 1, c + 3].filter((v) => v >= 0 && !test(v)), 2);
      if (yes === undefined || no.length < 2) return SCHOOL.inequalities(rng, d, g);
      return item({ format: 'multiple_choice', prompt: `Which value of x makes x ${op} ${c} true?`, choices: rng.shuffle([yes, ...no].map(String)), answer: String(yes), rationale: `${yes} ${op} ${c} is true; the others are not.` });
    }
    if (kind === 'write') return item({ format: 'multiple_choice', prompt: `Which inequality says "x is ${words} ${c}"?`, choices: rng.shuffle(OPS.map(([o]) => `x ${o} ${c}`)), answer: `x ${op} ${c}`, rationale: `"${words}" is written ${op}.` });
    const n = c + rng.int(2, 10); const lt = rng.bool();
    return item({ format: 'type_in', prompt: `How many whole numbers from 0 to ${n} make x ${lt ? '<' : '>'} ${c} true?`, answer: String(lt ? c : n - c), rationale: lt ? `0 up to ${c - 1}: that is ${c} numbers.` : `${c + 1} up to ${n}: that is ${n - c} numbers.` });
  },

  percents(rng, d, g) {
    if (g >= 7) return null;
    // 6.RP.3c: a percent of a quantity as a rate per 100, and finding the whole.
    // Percent increase and decrease are 7.RP.3.
    const kind = rng.pick(['of', 'whole', 'what', 'per100']);
    if (kind === 'of') { const p = rng.pick([10, 20, 25, 50, 75]); const w = 20 * rng.int(1, 15); return item({ format: 'type_in', prompt: `What is ${p}% of ${w}?`, answer: nn(p * w / 100), rationale: `${p}% means ${p} out of every 100: ${p}/100 × ${w} = ${nn(p * w / 100)}.` }); }
    if (kind === 'whole') { const p = rng.pick([10, 20, 25, 50]); const w = 20 * rng.int(1, 15); return item({ format: 'type_in', prompt: `${p}% of a number is ${nn(p * w / 100)}. What is the number?`, answer: String(w), rationale: `${nn(p * w / 100)} is ${p}/100 of the number, so the number is ${nn(p * w / 100)} × 100/${p} = ${w}.` }); }
    if (kind === 'what') { const w = rng.pick([20, 25, 50, 200]); const part = (w / rng.pick([4, 5, 10])) * rng.int(1, 3); return item({ format: 'type_in', prompt: `${part} is what percent of ${w}?   (enter the number only)`, answer: nn(part / w * 100), rationale: `${part} ÷ ${w} × 100 = ${nn(part / w * 100)}%.` }); }
    const k = rng.int(1, 99);
    return item({ format: 'type_in', prompt: `Out of 100 students, ${k} walk to school. What percent of the students walk to school?   (enter the number only)`, answer: String(k), rationale: `Percent means per 100: ${k} out of 100 is ${k}%.` });
  },

  word_problems(rng, d, g) {
    if (g >= 6) return null;
    const name = rng.pick(NAMES); const thing = rng.pick(THINGS);
    if (g <= 1) {
      // 1.OA.1-2: within 20; joining, taking away, comparing, three addends.
      const kind = rng.pick(['join', 'away', 'compare', 'three']);
      const s = rng.int(6, 20); const a = rng.int(2, s - 2);
      if (kind === 'join') return item({ format: 'type_in', prompt: `${name} has ${a} ${thing}. ${name} gets ${s - a} more. How many ${thing} does ${name} have now?`, answer: String(s), rationale: `${a} + ${s - a} = ${s}.` });
      if (kind === 'away') return item({ format: 'type_in', prompt: `${name} has ${s} ${thing} and gives ${a} away. How many ${thing} are left?`, answer: String(s - a), rationale: `${s} - ${a} = ${s - a}.` });
      if (kind === 'compare') { const [p, q] = rng.sample(NAMES, 2); return item({ format: 'type_in', prompt: `${p} has ${s} ${thing}. ${q} has ${a} ${thing}. How many more ${thing} does ${p} have than ${q}?`, answer: String(s - a), rationale: `${s} - ${a} = ${s - a}.` }); }
      const x = rng.int(1, 6); const y = rng.int(1, 6); const z = rng.int(1, 6);
      return item({ format: 'type_in', prompt: `${name} has ${x} red, ${y} blue and ${z} green ${thing}. How many ${thing} is that in all?`, answer: String(x + y + z), rationale: `${x} + ${y} + ${z} = ${x + y + z}.` });
    }
    if (g === 2) {
      // 2.OA.1, 2.MD.5 and 2.MD.8: within 100, one and two steps, length, money.
      const kind = rng.pick(['twoStep', 'compare', 'length', 'coins']);
      if (kind === 'twoStep') { const a = rng.int(20, 60); const b = rng.int(5, 30); const c = rng.int(5, a + b - 5); return item({ format: 'type_in', prompt: `${name} had ${a} ${thing}, got ${b} more and then gave away ${c}. How many ${thing} does ${name} have now?`, answer: String(a + b - c), rationale: `${a} + ${b} = ${a + b}, and ${a + b} - ${c} = ${a + b - c}.` }); }
      if (kind === 'compare') { const [p, q] = rng.sample(NAMES, 2); const small = rng.int(10, 50); const big = small + rng.int(5, 40); return item({ format: 'type_in', prompt: `${p} has ${big} ${thing}. ${q} has ${small} ${thing}. How many more ${thing} does ${p} have than ${q}?`, answer: String(big - small), rationale: `${big} - ${small} = ${big - small}.` }); }
      if (kind === 'length') { const b = rng.int(10, 60); const a = b + rng.int(3, 39); return item({ format: 'type_in', prompt: `A ribbon is ${a} centimetres long. A string is ${b} centimetres long. How much longer is the ribbon, in centimetres?`, answer: String(a - b), rationale: `${a} - ${b} = ${a - b} centimetres.` }); }
      const qn = rng.int(1, 3); const dm = rng.int(1, 4); const pn = rng.int(1, 4);
      return item({ format: 'type_in', prompt: `${name} has ${qn} ${plural(qn, 'quarter', 'quarters')}, ${dm} ${plural(dm, 'dime', 'dimes')} and ${pn} ${plural(pn, 'penny', 'pennies')}. How many cents is that?`, answer: String(25 * qn + 10 * dm + pn), rationale: `${25 * qn} + ${10 * dm} + ${pn} = ${25 * qn + 10 * dm + pn} cents.` });
    }
    if (g === 3) {
      // 3.OA.3 and 3.OA.8: equal groups, sharing, two steps with the four operations.
      const kind = rng.pick(['groups', 'share', 'packsLeft', 'packsMore']);
      const k = rng.int(2, 9); const m = rng.int(2, 9);
      if (kind === 'groups') return item({ format: 'type_in', prompt: `There are ${k} bags with ${m} ${thing} in each bag. How many ${thing} are there in all?`, answer: String(k * m), rationale: `${k} × ${m} = ${k * m}.` });
      if (kind === 'share') return item({ format: 'type_in', prompt: `${name} shares ${k * m} ${thing} equally among ${k} friends. How many ${thing} does each friend get?`, answer: String(m), rationale: `${k * m} ÷ ${k} = ${m}.` });
      if (kind === 'packsLeft') { const gv = rng.int(1, k * m - 1); return item({ format: 'type_in', prompt: `${name} buys ${k} packs of ${m} ${thing} and gives away ${gv}. How many ${thing} are left?`, answer: String(k * m - gv), rationale: `${k} × ${m} = ${k * m}, and ${k * m} - ${gv} = ${k * m - gv}.` }); }
      const have = rng.int(5, 40); return item({ format: 'type_in', prompt: `${name} has ${have} ${thing} and buys ${k} packs of ${m} more. How many ${thing} does ${name} have now?`, answer: String(have + k * m), rationale: `${k} × ${m} = ${k * m}, and ${have} + ${k * m} = ${have + k * m}.` });
    }
    // Grades 4-5: multi-step whole-number problems with remainders (4.OA.3),
    // "times as long" (4.OA.2), distance at a speed (4.NBT.5) and money (4.MD.2).
    const kind = rng.pick(['leftOver', 'carsNeeded', 'timesLong', 'distance', 'change']);
    if (kind === 'leftOver') { const per = rng.int(3, 9); const total = per * rng.int(4, 20) + rng.int(1, per - 1); return item({ format: 'type_in', prompt: `${total} students are put into teams of ${per}. How many students are left over after the full teams are formed?`, answer: String(total % per), rationale: `${total} ÷ ${per} = ${Math.floor(total / per)} full teams with ${total % per} left over.` }); }
    if (kind === 'carsNeeded') { const per = rng.int(3, 7); const total = per * rng.int(3, 15) + rng.int(1, per - 1); return item({ format: 'type_in', prompt: `${total} people need a ride and each car holds ${per} people. How many cars are needed to carry everyone?`, answer: String(Math.ceil(total / per)), rationale: `${total} ÷ ${per} = ${Math.floor(total / per)} R ${total % per}; the people left over need one more car: ${Math.ceil(total / per)}.` }); }
    if (kind === 'timesLong') { const a = rng.int(3, 25); const k = rng.int(2, 9); return item({ format: 'type_in', prompt: `A red ribbon is ${a} cm long. A blue ribbon is ${k} times as long. How long is the blue ribbon, in cm?`, answer: String(a * k), rationale: `${k} times ${a} is ${k} × ${a} = ${a * k} cm.` }); }
    if (kind === 'distance') { const speed = rng.int(3, 12) * 5; const hours = rng.int(2, 6); return item({ format: 'type_in', prompt: `A train travels at ${speed} miles per hour for ${hours} hours. How many miles does it cover?`, answer: String(speed * hours), rationale: `${speed} × ${hours} = ${speed * hours} miles.` }); }
    const price = rng.int(2, 9) + rng.pick([0, 0.5, 0.25, 0.75]); const qty = rng.int(3, 8);
    const paid = Math.ceil(price * qty / 10) * 10 + 10; const change = Math.round((paid - price * qty) * 100) / 100;
    const money = (x) => (Number.isInteger(x) ? `$${x}` : `$${x.toFixed(2)}`);
    return item({ format: 'type_in', prompt: `Notebooks cost ${money(price)} each. You buy ${qty} and pay with ${money(paid)}. How much change do you get?   (enter the number only)`, answer: String(change),
      rationale: `${qty} × ${money(price)} = ${money(Math.round(price * qty * 100) / 100)}; ${money(paid)} - ${money(Math.round(price * qty * 100) / 100)} = ${money(change)}.` });
  },

  order_ops(rng, d, g) {
    if (g >= 6) return null;
    // 5.OA.1: parentheses first, then multiplication before addition; no
    // exponents (6.EE.2c).
    const a = rng.int(2, 9); const b = rng.int(2, 9); const c = rng.int(2, 9);
    const forms = [[`(${a} + ${b}) × ${c}`, (a + b) * c], [`${a} × (${b} + ${c})`, a * (b + c)], [`${a} + ${b} × ${c}`, a + b * c], [`${a * b} - ${c} × ${a}`, a * b - c * a], [`(${a * c + b} - ${b}) ÷ ${c}`, a]];
    const [text, val] = rng.pick(forms.filter(([, v]) => v >= 0));
    return item({ format: 'type_in', prompt: `${text} =`, answer: String(val), rationale: `Parentheses first, then multiplication and division, then addition and subtraction: ${text} = ${val}.` });
  },
};
// Not a generator: kept off the enumerable keys so math-items.js and the audit
// do not take it for a skill.
Object.defineProperty(G, 'SCHOOL', { value: SCHOOL, enumerable: false });

module.exports = G;
