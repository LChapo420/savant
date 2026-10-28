/**
 * Math question shapes: the same knowledge asked in a different way.
 *
 * A procedural generator produces unlimited *numbers* and very few *questions*.
 * `add_sub` can produce a million additions, and a learner meets three of them
 * and then a million more, all of them the same question wearing different
 * digits — which is exactly what the repeat metric caught and what a learner
 * reports as "the same question again".
 *
 * The answer is still computed, never typed, because a bank item's answer is
 * what makes it trustworthy: `npm run check` validates all of them, and nothing
 * unverified is ever graded. So a "shape" here is a different *task* on the same
 * arithmetic, not a different source of truth.
 *
 * What a learner gets below, for `add_sub` alone: a plain sum, a missing addend,
 * a comparison between two expressions, an error in a worked sum, a rounded
 * estimate, a multi-step word problem, and a rearrangement. Seven tasks instead
 * of one, all of them provably correct.
 */
const { choicesFrom } = require('./rng');

/**
 * Several shapes list their other accepted spellings as `x`, the pool-entry
 * name for them. The bank only reads `accepts`, so those spellings were dropped
 * on the way out and "2:3" was marked wrong against a key of "2 : 3". Both names
 * are honoured here, once.
 */
const item = ({ x, ...o }) => {
  const accepts = [...new Set([...(o.accepts || []), ...(x || [])].map(String))]
    .filter((a) => a !== String(o.answer));
  const out = { source: 'bank', ...o };
  if (accepts.length) out.accepts = accepts; else delete out.accepts;
  return out;
};

/** A number written inside working, bracketed when negative. */
const par = (n) => (n < 0 ? `(${n})` : String(n));

/** A positive coefficient on a variable, without the "1x" nobody writes. */
const co = (a, v) => (a === 1 ? v : `${a}${v}`);

/** "+ 3", "− 3": a term with its sign, for prompts written with the true minus. */
const plusMinus = (n) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`;

/** x^2 + bx + c written as a learner would, with no "+ 0x" and no "+ −3". */
function quad(b, c) {
  let out = 'x^2';
  if (b) out += Math.abs(b) === 1 ? ` ${b < 0 ? '−' : '+'} x` : ` ${plusMinus(b)}x`;
  if (c) out += ` ${plusMinus(c)}`;
  return out;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

function frac(n, d) {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  const sn = n / g;
  const sd = d / g;
  return sd === 1 ? String(sn) : `${sn}/${sd}`;
}

const round2 = (x) => Math.round(x * 100) / 100;
const signed = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));

function mag(d, base = 10) {
  return Math.max(base, Math.round(base * Math.pow(1.9, d - 1)));
}

/** Words and figures for a problem stated in sentences rather than symbols. */
const COUNTABLE = [
  { noun: 'apples', single: 'apple' },
  { noun: 'pencils', single: 'pencil' },
  { noun: 'stickers', single: 'sticker' },
  { noun: 'marbles', single: 'marble' },
  { noun: 'tickets', single: 'ticket' },
  { noun: 'books', single: 'book' },
  { noun: 'bottles', single: 'bottle' },
  { noun: 'cards', single: 'card' },
  { noun: 'erasers', single: 'eraser' },
  { noun: 'seashells', single: 'seashell' },
];

// Where a stack of boxes can stand. Not "in the box" or "in the jar": "There
// are 5 boxes in the box" is not a place.
const PLACES = ['on the shelf', 'in the storeroom', 'on the table', 'in the cupboard', 'on the cart'];

const SHAPES = {
  // ── addition and subtraction ──────────────────────────────────────────────
  add_sub(rng, d) {
    const m = mag(d, 12);
    const roll = rng.int(0, 6);

    // A missing addend: the total is given and one part is missing, so the
    // learner has to work out what fills the gap rather than read left to right.
    if (roll === 0) {
      const a = rng.int(5, m);
      const b = rng.int(5, m);
      const total = a + b;
      return item({
        format: 'type_in',
        prompt: `___ + ${b} = ${total}`,
        answer: String(a),
        rationale: `The total is ${total} and ${b} of it is accounted for, so the gap is ${total} − ${b} = ${a}.`,
      });
    }

    // An error to find: the working is shown, the answer is wrong, and the
    // question is by how much. Different act from computing the sum at all.
    if (roll === 1) {
      const a = rng.int(20, m);
      const b = rng.int(20, m);
      const wrong = a + b + rng.int(1, 9);
      return item({
        format: 'type_in',
        prompt: `Someone adds ${a} + ${b} and writes ${wrong}. By how much are they wrong?`,
        answer: String(Math.abs(wrong - (a + b))),
        rationale: `${a} + ${b} is ${a + b}, which is ${Math.abs(wrong - (a + b))} away from ${wrong}.`,
      });
    }

    // Which is larger: comparing three expressions rather than evaluating one.
    // Three options, because two is a coin flip rather than a comparison.
    if (roll === 2) {
      const a = rng.int(10, m);
      const b = rng.int(10, Math.max(11, Math.floor(m / 2)));
      const forms = [[`${a} + ${b}`, a + b], [`${a} − ${b}`, a - b], [`${a} × ${b}`, a * b]];
      const best = forms.reduce((x, y) => (y[1] > x[1] ? y : x));
      return item({
        format: 'multiple_choice',
        prompt: `Which is larger: ${a} + ${b}, ${a} − ${b}, or ${a} × ${b}?`,
        choices: rng.shuffle(forms.map((f) => f[0])),
        answer: best[0],
        rationale: `They work out to ${forms.map((f) => `${f[0]} is ${f[1]}`).join(', ')}.`,
      });
    }

    // Rounded to the nearest ten: an estimate, which is a different skill from
    // the exact sum and is the one a real sum needs.
    if (roll === 3) {
      const a = rng.int(12, m) * 3 + rng.int(1, 4);
      const b = rng.int(12, m) * 3 + rng.int(1, 4);
      const nearest = (x) => Math.round(x / 10) * 10;
      // The sum is what is rounded. Rounding each part first is a different
      // estimate and does not always agree: 14 + 14 is 28, which rounds to 30,
      // while 10 + 10 is 20.
      return item({
        format: 'type_in',
        prompt: `Work out ${a} + ${b}, then round the sum to the nearest ten.`,
        answer: String(nearest(a + b)),
        rationale: `${a} + ${b} = ${a + b}, which rounds to ${nearest(a + b)}.`,
      });
    }

    // Word form, because arithmetic arrives in sentences more often than symbols.
    if (roll === 4) {
      const thing = rng.pick(COUNTABLE);
      const place = rng.pick(PLACES);
      const each = rng.int(3, 9);
      const boxes = rng.int(3, 8);
      const given = rng.int(2, 6);
      return item({
        format: 'type_in',
        prompt: `There are ${boxes} boxes ${place} with ${each} ${thing.noun} in each. `
          + `${given} ${thing.noun} are taken out. How many ${thing.noun} are left?`,
        answer: String(boxes * each - given),
        rationale: `${boxes} × ${each} is ${boxes * each}, and ${boxes * each} − ${given} is ${boxes * each - given}.`,
      });
    }

    // A rearrangement: subtraction checked by adding back, which is the inverse
    // a learner can always fall back on. (The old working here said "5 × 3 is
    // 15, which is 12 less than 17" — the arithmetic of a different question.)
    if (roll === 5) {
      const b = rng.int(3, Math.max(4, Math.floor(m / 2)));
      const q = rng.int(2, 9);
      const a = b * q + rng.int(1, b - 1);
      return item({
        format: 'type_in',
        prompt: `${a} − ${b} =`,
        answer: String(a - b),
        rationale: `${a} − ${b} = ${a - b}. Check by adding back: ${a - b} + ${b} = ${a}.`,
      });
    }

    // Three-part with a negative result, which is where borrowing actually bites.
    if (roll === 6 && d >= 4) {
      const a = rng.int(2, Math.max(3, Math.floor(m / 3)));
      const b = rng.int(a + 4, m);
      return item({
        format: 'type_in',
        prompt: `${a} − ${b} =`,
        answer: String(a - b),
        rationale: `${a} is ${b - a} short of ${b}, so the answer is −${b - a}.`,
      });
    }

    const a = rng.int(2, m);
    const b = rng.int(2, m);
    return item({
      format: 'type_in',
      prompt: `${a} + ${b} =`,
      answer: String(a + b),
      rationale: `Counting on ${b} from ${a} lands on ${a + b}.`,
    });
  },

  // ── multiplication and division ───────────────────────────────────────────
  mul_div(rng, d) {
    const m = mag(d, 9);
    const roll = rng.int(0, 5);

    if (roll === 0) {
      // A missing factor: the product and one factor are given.
      const b = rng.int(2, Math.max(3, Math.floor(m / 2)));
      const q = rng.int(2, 9);
      const product = b * q;
      return item({
        format: 'type_in',
        prompt: `${b} × ___ = ${product}`,
        answer: String(q),
        rationale: `${product} ÷ ${b} is ${q}, since ${b} × ${q} = ${product}.`,
      });
    }

    if (roll === 1) {
      // Posts and gaps: a row of posts has one gap fewer than it has posts, the
      // classic place where multiplying the obvious numbers goes wrong. The row
      // length comes from the posts in a row, not from the number of rows — the
      // old prompt keyed the number of rows minus one.
      const w = rng.int(2, 9);
      const h = rng.int(3, 9);
      return item({
        format: 'type_in',
        prompt: `A garden has ${w} rows of fence posts with ${h} posts in each row, and the posts in a row are one metre apart. `
          + 'How many metres long is one row of fence?',
        answer: String(h - 1),
        rationale: `${h} posts in a row make ${h - 1} one-metre gaps, so a row is ${h - 1} metres long. The number of rows does not change it.`,
      });
    }

    if (roll === 2) {
      // Which division is right: choosing a fact rather than computing one.
      const b = rng.int(2, 9);
      const q = rng.int(2, 9);
      const product = b * q;
      return item({
        format: 'multiple_choice',
        prompt: `${product} ÷ ${b} =`,
        // Four distinct options: b equals q half the time a learner meets 3 × 3,
        // and product − b can land on q + 1.
        choices: choicesFrom(rng, String(q), [String(q + 1), String(product - b), String(b === q ? q - 1 : b), String(q + 2),
          String(product), String(q + b), String(q + 3)]),
        answer: String(q),
        rationale: `${b} × ${q} is ${product}, so ${product} ÷ ${b} = ${q}.`,
      });
    }

    if (roll === 3) {
      // Remainder as a fraction, which is where a whole answer is impossible.
      const b = rng.int(3, 9);
      const n = b * rng.int(3, 9) + rng.int(1, b - 1);
      return item({
        format: 'type_in',
        prompt: `${n} ÷ ${b} = ___. Write the answer as a whole number and a fraction, like 3 1/4.`,
        answer: `${Math.floor(n / b)} ${frac(n % b, b)}`,
        accepts: [`${Math.floor(n / b)} ${frac(n % b, b)}`],
        rationale: `${n} is ${Math.floor(n / b)} groups of ${b} with ${n % b} left over, and ${n % b} out of ${b} is ${frac(n % b, b)}, so the answer is ${Math.floor(n / b)} ${frac(n % b, b)}.`,
      });
    }

    if (roll === 4) {
      // Rate: multiplication as a per-unit cost, which is how it appears in
      // shopping, work, and travel.
      const each = rng.int(3, 12);
      const count = rng.int(4, 9);
      return item({
        format: 'type_in',
        prompt: `One ticket costs $${each}. How much do ${count} tickets cost?`,
        answer: String(each * count),
        rationale: `${count} × $${each} = $${each * count}.`,
      });
    }

    // A square, which is a different mental object from a rectangle.
    const side = rng.int(3, 12);
    return item({
      format: 'type_in',
      prompt: `A square has sides of ${side} cm. What is its area in square centimetres?`,
      answer: String(side * side),
      rationale: `${side} × ${side} = ${side * side}.`,
    });
  },

  // ── order of operations ──────────────────────────────────────────────────
  order_ops(rng, d) {
    const roll = rng.int(0, 4);
    const m = mag(d, 8);

    if (roll === 0) {
      // Insert the bracket: choosing where the grouping goes is the skill, and
      // it is not the same act as evaluating a given grouping.
      const a = rng.int(2, m);
      const b = rng.int(2, m);
      const c = rng.int(2, m);
      // The old prompt printed the number it then asked for, so the answer was
      // in the question. Now the target is the grouping the rule would not give,
      // and the learner picks the brackets that produce it.
      const left = a + b * c;
      const right = (a + b) * c;
      return item({
        format: 'multiple_choice',
        prompt: `Where do brackets go in ${a} + ${b} × ${c} to make it equal ${right}?`,
        choices: rng.shuffle([`(${a} + ${b}) × ${c}`, `${a} + (${b} × ${c})`, 'No brackets are needed',
          'No placement of brackets can do it']),
        answer: `(${a} + ${b}) × ${c}`,
        rationale: `(${a} + ${b}) × ${c} = ${a + b} × ${c} = ${right}. Without brackets, or with them around`
          + ` ${b} × ${c}, the multiplication goes first and gives ${left}.`,
      });
    }

    if (roll === 1) {
      // The one that catches people: an exponent and a multiply at the same time.
      const base = rng.int(2, Math.max(3, Math.floor(m / 2)));
      const power = rng.int(2, 3);
      const mul = rng.int(2, 9);
      return item({
        format: 'type_in',
        prompt: `${mul} × ${base}^${power} =`,
        answer: String(mul * Math.pow(base, power)),
        rationale: `${base}^${power} is ${Math.pow(base, power)}, and ${mul} × ${Math.pow(base, power)} is ${mul * Math.pow(base, power)}.`,
      });
    }

    if (roll === 2) {
      // Undo: the inverse of the whole rule chain rather than another forward pass.
      const a = rng.int(2, m);
      const b = rng.int(2, 9);
      const c = rng.int(2, m);
      const total = (a + b) * c;
      return item({
        format: 'type_in',
        prompt: `(${a} + ${b}) × ${c} = ${total}. What is ${a} + ${b}?`,
        answer: String(a + b),
        rationale: `${total} ÷ ${c} is ${a + b}.`,
      });
    }

    if (roll === 3) {
      // Two evaluations of the same digits, which is where the order bites.
      // Three forms, so the learner is choosing between readings rather than
      // being told which of two to believe.
      const a = rng.int(2, m);
      const b = rng.int(2, 9);
      const c = rng.int(2, m);
      // Values, not worked lines: "a + b × c = 14" and "a + (b × c) = 14" were
      // both offered and both true, with only the first keyed.
      return item({
        format: 'multiple_choice',
        prompt: `Which is the value of ${a} + ${b} × ${c}?`,
        choices: choicesFrom(rng, String(a + b * c),
          [String((a + b) * c), String(a * b + c), String(a + b + c), String(a * b * c),
            // Spares, for the draws where two of the above coincide (2 + 2 × 4).
            String(a + b * c + 1), String(a + b * c - 1)]),
        answer: String(a + b * c),
        rationale: `Multiplication before addition makes it ${a + b * c}; doing the addition first`
          + ` would give ${(a + b) * c}, which the rule does not allow.`,
      });
    }

    const a = rng.int(2, m);
    const b = rng.int(2, 9);
    const c = rng.int(2, m);
    return item({
      format: 'type_in',
      prompt: `${a} + ${b} × ${c} =`,
      answer: String(a + b * c),
      rationale: `${b} × ${c} is ${b * c}, and ${a} + ${b * c} is ${a + b * c}.`,
    });
  },

  // ── signed numbers ───────────────────────────────────────────────────────
  integers(rng, d) {
    const m = mag(d, 7);
    const roll = rng.int(0, 4);
    const a = rng.int(2, m);
    const b = rng.int(2, m);

    if (roll === 0) {
      // Distance on a line, which is what a negative number is before it is a
      // symbol.
      const start = -rng.int(1, m);
      const move = rng.int(1, m);
      return item({
        format: 'type_in',
        prompt: `A counter on a number line starts at ${start} and moves ${move} to the right. Where does it end?`,
        answer: String(start + move),
        rationale: `Right is positive, so ${start} + ${move} = ${start + move}.`,
      });
    }

    if (roll === 1) {
      // The temperature context, where the arithmetic is trivial and the sign is
      // the whole question.
      const t = -rng.int(1, 15);
      const drop = rng.int(1, 9);
      return item({
        format: 'type_in',
        prompt: `A freezer is at ${t}°C. It gets ${drop} degree${drop === 1 ? '' : 's'} colder. What is the new temperature, in °C?`,
        answer: String(t - drop),
        rationale: `Colder is less, so ${t} − ${drop} = ${t - drop}.`,
      });
    }

    if (roll === 2) {
      return item({
        format: 'type_in',
        prompt: `−${a} + ${b} =`,
        answer: String(b - a),
        rationale: `Adding ${b} to −${a} gives ${signed(b - a)}.`,
      });
    }

    if (roll === 3) {
      return item({
        format: 'type_in',
        prompt: `−${a} − ${b} =`,
        answer: String(-(a + b)),
        rationale: `Subtracting ${b} from a negative number goes further negative: −${a} − ${b} = −${a + b}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `${a} − ${b} =`,
      answer: String(a - b),
      rationale: a - b >= 0 ? `${a} − ${b} = ${a - b}.` : `${a} is ${b - a} less than ${b}, so the answer is −${b - a}.`,
    });
  },

  // ── ratios and proportions ────────────────────────────────────────────────
  ratios(rng, d) {
    const roll = rng.int(0, 4);

    if (roll === 0) {
      // Simplify, which is the one ratio task that is not a division problem in
      // disguise and the one most learners have never been asked to do.
      // x and y share no factor, or "simplest form" is a step further than the
      // key: x = 4, y = 6, g = 2 printed 8 : 12 and keyed 4 : 6, which is 2 : 3.
      const g = rng.int(2, 6);
      let x = rng.int(2, 9);
      let y = rng.int(2, 9);
      while (gcd(x, y) !== 1) { x = rng.int(2, 9); y = rng.int(2, 9); }
      return item({
        format: 'type_in',
        // Written "8:12", not "8 : 12": bank.tidy() pulls a space-preceded colon
        // onto the number before it, and the learner saw "8: 12" and "as a: b".
        prompt: `Write the ratio ${x * g}:${y * g} in its simplest form, as a:b.`,
        answer: `${x}:${y}`,
        x: [`${x} : ${y}`, `${x} to ${y}`],
        rationale: `Both terms share a factor of ${g}, and ${x} and ${y} share no further common factor.`,
      });
    }

    if (roll === 1) {
      // Unit rate, the reasoning behind every other ratio problem.
      const per = rng.int(2, 9);
      const units = rng.int(3, 8);
      return item({
        format: 'type_in',
        prompt: `One pack holds ${per} cards. How many cards do ${units} packs hold?`,
        answer: String(per * units),
        rationale: `The unit rate is ${per} a pack, so ${units} × ${per} = ${per * units}.`,
      });
    }

    if (roll === 2) {
      // Part to whole to part, which is a different move from part to part.
      const total = rng.int(4, 12) * 5;
      const part = rng.int(1, 4) * 5;
      return item({
        format: 'type_in',
        prompt: `In a bag of ${total} marbles, ${part} are blue. At the same rate, how many blue marbles are there in a group of ${total * 2}?`,
        answer: String(part * 2),
        rationale: `The proportion is ${part} in ${total}. A group of ${total * 2} is twice as big, so it has twice as many blue: ${part * 2}.`,
      });
    }

    if (roll === 3) {
      // Scale a recipe up, which is proportion wearing an apron.
      const servings = rng.int(2, 6);
      const scaled = servings * 2;
      // In fifty-gram steps: a recipe that feeds four on 3 g of flour is not one.
      const amount = rng.int(2, 9) * 50;
      return item({
        format: 'type_in',
        prompt: `A recipe for ${servings} servings uses ${amount} g of flour. How many grams of flour are needed for ${scaled} servings?`,
        answer: String(amount * 2),
        rationale: `${scaled} is twice ${servings}, so the flour doubles to ${amount * 2} g.`,
      });
    }

    const a = rng.int(2, 9);
    const b = rng.int(2, 9);
    const k = rng.int(2, 6);
    return item({
      format: 'type_in',
      prompt: `The ratio is ${a}:${b}. If the first quantity is ${a * k}, what is the second?`,
      answer: String(b * k),
      rationale: `Multiplying both parts by ${k} gives ${a * k}:${b * k}, so the second quantity is ${b * k}.`,
    });
  },

  // ── exponents and roots ──────────────────────────────────────────────────
  exponents(rng, d) {
    const m = mag(d, 5);
    const roll = rng.int(0, 3);
    const power = rng.int(2, 4);
    // The magnitude grows with difficulty, which is right for a square root and
    // absurd for a fourth power: at the top it asked for 805^4. A cube or a
    // fourth power stays at a base a learner can multiply out.
    const base = rng.int(2, power >= 3 ? 12 : Math.max(3, Math.floor(m / 2)));

    if (roll === 0) {
      // A perfect square, so the root is exact and the answer is checkable.
      const n = rng.int(3, 12);
      return item({
        format: 'type_in',
        prompt: `What is the positive square root of ${n * n}?`,
        answer: String(n),
        rationale: `${n} × ${n} is ${n * n}, and the square root of ${n * n} is ${n}.`,
      });
    }

    if (roll === 1) {
      // Same power, both sides: the defining property, asked as an equation.
      const k = rng.int(2, 4);
      return item({
        format: 'type_in',
        prompt: `2^${power} × 2^${k} = ___. Give the answer as a power of 2.`,
        answer: `2^${power + k}`,
        accepts: [`2^${power + k}`, String(2 ** (power + k))],
        rationale: `Multiplying powers of the same base adds the exponents: 2^${power} × 2^${k} = 2^${power + k}.`,
      });
    }

    if (roll === 2) {
      // A root as a power in reverse, which is where the two notations meet.
      return item({
        format: 'type_in',
        prompt: `√${Math.pow(base, 2)} = ___. Give a whole number.`,
        answer: String(base),
        rationale: `The square root of ${base}^2 is ${base}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `${base}^${power} =`,
      answer: String(Math.pow(base, power)),
      rationale: `${Array(power).fill(base).join(' × ')} = ${Math.pow(base, power)}.`,
    });
  },

  // ── fractions ────────────────────────────────────────────────────────────
  fractions(rng, d) {
    const roll = rng.int(0, 5);
    const d1 = rng.int(2, 9);
    const d2 = rng.int(2, 9);
    const n1 = rng.int(1, d1 - 1);
    const n2 = rng.int(1, d2 - 1);

    if (roll === 0) {
      // Simplify, which is the one fraction task that is not a division problem
      // and the one most learners have never been asked to do explicitly.
      const g = gcd(n1, d1) || 1;
      return item({
        format: 'type_in',
        prompt: `Write ${n1}/${d1} in lowest terms, as a fraction.`,
        answer: frac(n1, d1),
        x: [frac(n1, d1)],
        rationale: g > 1
          ? `The top and bottom share a factor of ${g}; dividing both by ${g} gives ${frac(n1, d1)}, which has no further common factor.`
          : `${n1} and ${d1} share no factor other than 1, so ${n1}/${d1} is already in lowest terms.`,
      });
    }

    if (roll === 1) {
      // Same value, different looking: the one that breaks "but that is not what
      // it looked like".
      const k = rng.int(2, 6);
      return item({
        format: 'type_in',
        prompt: `Write ${n1 * k}/${d1 * k} in lowest terms.`,
        answer: frac(n1, d1),
        x: [frac(n1, d1)],
        // Divide by the whole common factor, not by k: 4/6 times 2 is 8/12, and
        // dividing that by 2 gives 4/6, which is not lowest terms.
        rationale: `${n1 * k} and ${d1 * k} share a factor of ${gcd(n1 * k, d1 * k)}; dividing top and bottom by it gives ${frac(n1, d1)}.`,
      });
    }

    if (roll === 2) {
      // Proper or improper: the classification, before any arithmetic.
      // A mixed number is written with its fraction in lowest terms (1 1/2, not
      // 1 2/4), and the whole is written over the same denominator rather than
      // reduced back to itself ("2 is 2" said nothing).
      const whole = rng.int(1, 6);
      const g = gcd(n1, d1) || 1;
      const rn = n1 / g;
      const rd = d1 / g;
      return item({
        format: 'type_in',
        prompt: `Write ${whole} ${rn}/${rd} as an improper fraction.`,
        answer: `${whole * rd + rn}/${rd}`,
        rationale: `${whole} is ${whole * rd}/${rd}, and adding ${rn}/${rd} gives ${whole * rd + rn}/${rd}.`,
      });
    }

    if (roll === 3) {
      // Find the missing numerator, so the task is not "compute a sum" again.
      const n2b = rng.int(1, d2 - 1);
      const total = frac((n1 * d2 + n2b * d1), d1 * d2);
      return item({
        format: 'type_in',
        prompt: `${n1}/${d1} + ___/${d2} = ${total}. Give the missing numerator.`,
        answer: String(n2b),
        rationale: `Over a common denominator of ${d1 * d2}, ${n1}/${d1} is ${n1 * d2}/${d1 * d2} and ${total} is ${n1 * d2 + n2b * d1}/${d1 * d2}. `
          + `The difference is ${n2b * d1}/${d1 * d2}, which is ${n2b}/${d2}.`,
      });
    }

    if (roll === 4) {
      // Which is larger, as a fraction rather than a decimal, with a third
      // option that cannot collide with either of the two being compared.
      const p = rng.int(1, 8);
      const q = rng.int(p + 1, 9);
      // p < q, so p/q is below 1 and its reciprocal q/p is above it. The key
      // used to be p/q — the smaller of the two.
      const other = `${q}/${p}`;
      return item({
        format: 'multiple_choice',
        prompt: `Which is larger: ${p}/${q} or ${other}?`,
        choices: rng.shuffle([`${p}/${q}`, other, 'They are the same']),
        answer: other,
        rationale: `${p}/${q} is less than 1 (about ${round2(p / q)}), and ${other} is more than 1 (about ${round2(q / p)}), so ${other} is larger.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `${n1}/${d1} + ${n2}/${d2} =   (answer in lowest terms, as a fraction like 3/4)`,
      answer: frac(n1 * d2 + n2 * d1, d1 * d2),
      x: [frac(n1 * d2 + n2 * d1, d1 * d2)],
      rationale: `A common denominator of ${d1 * d2} gives ${frac(n1 * d2, d1 * d2)} + ${frac(n2 * d1, d1 * d2)} = ${frac(n1 * d2 + n2 * d1, d1 * d2)}.`,
    });
  },

  // ── decimals ─────────────────────────────────────────────────────────────
  decimals(rng, d) {
    const roll = rng.int(0, 4);
    const m = mag(d, 20);

    if (roll === 0) {
      // Place value: which digit is in which place, which is the thing decimal
      // arithmetic is built on and almost never asks directly.
      const whole = rng.int(10, m);
      const tenths = rng.int(0, 9);
      const hundredths = rng.int(0, 9);
      return item({
        format: 'type_in',
        prompt: `In ${whole}.${tenths}${hundredths}, which digit is in the hundredths place?`,
        answer: String(hundredths),
        rationale: `The hundredths place is the second digit after the point.`,
      });
    }

    if (roll === 1) {
      // A decimal as a fraction, which is the two topics meeting.
      const n = rng.int(1, 9);
      const d = rng.pick([2, 4, 5, 10]);
      return item({
        format: 'type_in',
        prompt: `Write ${n}/${d} as a decimal.`,
        answer: String(round2(n / d)),
        x: [String(round2(n / d))],
        rationale: `${n} ÷ ${d} = ${round2(n / d)}.`,
      });
    }

    if (roll === 2) {
      // An error to find, in a column sum, which is how decimal mistakes are
      // actually noticed.
      const a = round2(rng.int(10, m) + rng.int(1, 99) / 100);
      const b = round2(rng.int(10, m) + rng.int(1, 99) / 100);
      const wrong = round2(a + b + rng.int(1, 9) / 100);
      return item({
        format: 'type_in',
        prompt: `${a} + ${b} is written as ${wrong}. By how much is it wrong?`,
        answer: String(Math.abs(round2(wrong - round2(a + b)))),
        rationale: `${a} + ${b} is ${round2(a + b)}, which differs from ${wrong} by ${Math.abs(round2(wrong - round2(a + b)))}.`,
      });
    }

    if (roll === 3) {
      // Order by size: comparing decimals is where place value actually shows.
      // Three different values: "largest first" has one order only when no two tie.
      const draw = () => round2(rng.int(1, 99) + rng.int(1, 99) / 100);
      const vals = [draw()];
      while (vals.length < 3) { const v = draw(); if (!vals.includes(v)) vals.push(v); }
      const [a, b, c] = vals;
      const sorted = [...vals].sort((x, y) => y - x);
      return item({
        format: 'type_in',
        prompt: `Put these in order, largest first: ${a}, ${b}, ${c}`,
        answer: sorted.join(', '),
        x: [sorted.join(' '), sorted.join(',')],
        rationale: `Compare the whole-number parts first, then the tenths, then the hundredths: ${sorted.join(' > ')}.`,
      });
    }

    const a = round2(rng.int(10, m) + rng.int(1, 99) / 100);
    const b = round2(rng.int(10, m) + rng.int(1, 99) / 100);
    return item({
      format: 'type_in',
      prompt: `${a} + ${b} =`,
      answer: String(round2(a + b)),
      // Whole parts and decimal parts added separately, with the carry shown: the
      // old line printed float noise ("0.1499999") and dropped the carry.
      rationale: (() => {
        const wholes = Math.floor(a) + Math.floor(b);
        const parts = Math.round((a - Math.floor(a)) * 100) + Math.round((b - Math.floor(b)) * 100);
        const carry = parts >= 100;
        return `Line up the decimal points. The whole numbers make ${Math.floor(a)} + ${Math.floor(b)} = ${wholes}; `
          + `the decimal parts make ${round2(parts / 100)}${carry ? `, which carries 1 into the ones` : ''}. `
          + `Together that is ${round2(a + b)}.`;
      })(),
    });
  },

  // ── word problems ────────────────────────────────────────────────────────
  word_problems(rng, d) {
    const roll = rng.int(0, 4);
    // Each worker has a thing they make and a container it goes in. The old list
    // had "a bus driver has 7 stops. If 3 are used…", lower-case sentence starts,
    // a packing answer of ceil(per × count ÷ 4) for a question about boxes of
    // `count`, and a two-step answer that always subtracted 1 whatever number
    // the prompt said was given away.
    const who = rng.pick([
      { name: 'A baker', thing: 'rolls', box: 'bag', boxes: 'bags', gone: 'sold' },
      { name: 'A gardener', thing: 'seedlings', box: 'tray', boxes: 'trays', gone: 'planted' },
      { name: 'A printer', thing: 'copies', box: 'box', boxes: 'boxes', gone: 'posted' },
      { name: 'A florist', thing: 'roses', box: 'vase', boxes: 'vases', gone: 'sold' },
    ]);
    const per = rng.int(3, 12);
    const count = rng.int(3, 9);
    const start = rng.int(2, 15);

    if (roll === 0) {
      // Take-away, stated in the worker's own terms.
      const used = rng.int(2, per - 1);
      return item({
        format: 'type_in',
        prompt: `${who.name} has ${per} ${who.thing}. If ${used} are ${who.gone}, how many ${who.thing} are left?`,
        answer: String(per - used),
        rationale: `${per} − ${used} = ${per - used}.`,
      });
    }

    if (roll === 1) {
      // Packing: a division whose remainder still needs a container, which is
      // the step a learner who stops at the quotient misses.
      const total = rng.int(count + 1, count * 6);
      const full = Math.floor(total / count);
      const rest = total % count;
      const need = Math.ceil(total / count);
      return item({
        format: 'type_in',
        prompt: `${who.name} has ${total} ${who.thing} and puts them ${count} to a ${who.box}. `
          + `How many ${who.boxes} are needed to hold all of them?`,
        answer: String(need),
        rationale: rest
          ? `${total} ÷ ${count} is ${full} with ${rest} left over, and the ${rest} left over need one more ${who.box}: ${need}.`
          : `${total} ÷ ${count} is exactly ${full}, so ${full} ${full === 1 ? who.box : who.boxes} hold all of them.`,
      });
    }

    if (roll === 2) {
      // Two steps, stated as one, so the learner has to see the second step.
      const given = rng.int(1, 5);
      return item({
        format: 'type_in',
        prompt: `${who.name} starts with ${start} ${who.thing} and gets ${per} more. Then ${given} `
          + `${given === 1 ? 'is' : 'are'} given away. How many ${who.thing} are there now?`,
        answer: String(start + per - given),
        rationale: `${start} + ${per} = ${start + per}, and ${start + per} − ${given} = ${start + per - given}.`,
      });
    }

    if (roll === 3) {
      // Which operation fits, which is the decision a word problem is testing
      // before it is testing any arithmetic.
      return item({
        format: 'multiple_choice',
        prompt: `${who.name} has ${per} ${who.thing} and gets ${count} more. Which calculation gives how many there are now?`,
        choices: rng.shuffle([`${per} + ${count}`, `${per} × ${count}`, `${per} − ${count}`, `${per} ÷ ${count}`]),
        answer: `${per} + ${count}`,
        rationale: `Getting ${count} more on top of ${per} is an addition: ${per} + ${count} = ${per + count}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `${who.name} has ${per} ${who.thing} and gets ${count} more. How many ${who.thing} are there now?`,
      answer: String(per + count),
      rationale: `${per} + ${count} = ${per + count}.`,
    });
  },

  // ── linear equations ─────────────────────────────────────────────────────
  linear_eq(rng, d) {
    const roll = rng.int(0, 4);
    const a = rng.int(2, 9);
    const x = rng.int(2, 12);
    const b = rng.int(1, 20);
    const target = a * x + b;

    if (roll === 0) {
      // Is it a solution: substitute and see, which is the definitional check and
      // is not the same act as solving.
      const claimed = rng.int(1, 14);
      return item({
        format: 'multiple_choice',
        prompt: `Is x = ${claimed} a solution of ${a}x + ${b} = ${target}?`,
        choices: rng.shuffle(['Yes', 'No', 'Only if b is negative', 'Not enough information']),
        answer: a * claimed + b === target ? 'Yes' : 'No',
        rationale: `Substituting gives ${a} × ${claimed} + ${b} = ${a * claimed + b}`
          + `${a * claimed + b === target ? ', which is the right side.' : `, and the right side is ${target}.`}`,
      });
    }

    if (roll === 1) {
      // Solve for the other side: the same equation, a different unknown.
      return item({
        format: 'type_in',
        prompt: `If ${a}x + ${b} = ${target}, what is x?`,
        answer: String(x),
        rationale: `Subtracting ${b} gives ${a}x = ${a * x}, and dividing by ${a} gives x = ${x}.`,
      });
    }

    if (roll === 2) {
      // A word problem as an equation: the form a real one arrives in.
      const each = rng.int(2, 9);
      const extras = rng.int(1, 20);
      const items = rng.int(2, 8);
      return item({
        format: 'type_in',
        prompt: `Tickets cost $${each} each. A group pays $${each * items + extras}, including $${extras} `
          + 'in fees. How many tickets did the group buy?',
        answer: String(items),
        rationale: `$${each * items + extras} − $${extras} is $${each * items}, which at $${each} each is ${items} tickets.`,
      });
    }

    if (roll === 3) {
      // The balance reading: the same equation ax + b = target, as a scale. (The
      // old prompt keyed the difference between two counts as "the weight of one
      // item", which no balance says.)
      return item({
        format: 'type_in',
        prompt: `A balance has ${a} identical blocks and a ${b} g weight on one pan, and a ${target} g weight on the other. `
          + 'It balances. How many grams does one block weigh?',
        answer: String(x),
        rationale: `${a} blocks + ${b} g = ${target} g, so the blocks weigh ${target} − ${b} = ${a * x} g, and one block weighs ${a * x} ÷ ${a} = ${x} g.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `Solve for x:  ${a}x + ${b} = ${target}`,
      answer: String(x),
      rationale: `Subtract ${b} to get ${a}x = ${a * x}, then divide by ${a} for x = ${x}.`,
    });
  },

  // ── inequalities ─────────────────────────────────────────────────────────
  inequalities(rng, d) {
    const roll = rng.int(0, 3);
    const a = rng.int(2, 9);
    const x = rng.int(1, 14);
    const bound = x + rng.int(1, 4);

    if (roll === 0) {
      // Does it satisfy, decided by substitution rather than by solving.
      const claimed = rng.int(1, 16);
      return item({
        format: 'multiple_choice',
        prompt: `Does x = ${claimed} satisfy  ${a}x < ${a * bound}?`,
        choices: rng.shuffle(['Yes', 'No', 'Only for positive x', 'Cannot be determined']),
        answer: a * claimed < a * bound ? 'Yes' : 'No',
        rationale: `Substituting gives ${a * claimed} < ${a * bound}, which is`
          + `${a * claimed < a * bound ? ' true.' : ' false.'}`,
      });
    }

    if (roll === 1) {
      // How many whole numbers, which is where the boundary decides the count.
      return item({
        format: 'type_in',
        prompt: `How many whole numbers satisfy  ${a}x < ${a * bound}?`,
        answer: String(bound),
        rationale: `x can be 0 up to ${bound - 1}, which is ${bound} values.`,
      });
    }

    if (roll === 2) {
      // Solving for the variable, which is the form most of these arrive in.
      return item({
        format: 'type_in',
        prompt: `Solve for x:  ${a}x > ${a * x}. What is the smallest whole number x?`,
        answer: String(x + 1),
        rationale: `Dividing by ${a} gives x > ${x}, so the smallest whole number is ${x + 1}.`,
      });
    }

    return item({
      format: 'type_in',
      // The largest: every whole number from 0 up satisfies x ≤ bound, so "the
      // smallest that works" was always 0, never the keyed bound.
      prompt: `Solve for x, giving the largest whole number that works:  ${a}x ≤ ${a * bound}`,
      answer: String(bound),
      rationale: `Dividing by ${a} gives x ≤ ${bound}, so ${bound} is the largest that works.`,
    });
  },

  // ── slope and lines ──────────────────────────────────────────────────────
  slope_lines(rng, d) {
    const roll = rng.int(0, 4);
    const x1 = rng.int(-6, 6);
    const y1 = rng.int(-6, 6);
    const dx = rng.int(1, 7) * (rng.bool() ? 1 : -1);
    const dy = rng.int(-7, 7) || 3;
    const x2 = x1 + dx;
    const y2 = y1 + dy;

    if (roll === 0) {
      // Increasing or decreasing, which is a property rather than a number.
      return item({
        format: 'multiple_choice',
        prompt: `A line passes through (${x1}, ${y1}) and (${x2}, ${y2}). Is its slope positive, negative, or zero?`,
        choices: rng.shuffle(['Positive', 'Negative', 'Zero', 'It depends on the points']),
        // The sign of rise over run, not of the rise alone: dx is negative half
        // the time, and keying the sign of dy got every one of those wrong.
        answer: dy * dx > 0 ? 'Positive' : dy * dx < 0 ? 'Negative' : 'Zero',
        rationale: `Going from (${x1}, ${y1}) to (${x2}, ${y2}), x changes by ${dx} and y by ${dy}, so the slope is ${dy}/${dx}, which is `
          + `${dy * dx > 0 ? 'positive: the line rises from left to right' : dy * dx < 0 ? 'negative: the line falls from left to right' : 'zero: the line is flat'}.`,
      });
    }

    // Slopes and intercepts are kept as exact fractions. Rounded to two places
    // they stopped being true: "slopes 0.33 and -3 are perpendicular" is false
    // (0.33 × -3 is not -1), and a keyed 0.33 marked an exact 1/3 wrong. The
    // grader compares numbers exactly, so 0.5 still matches a key of 1/2.
    const m = frac(dy, dx);

    if (roll === 1) {
      // The equation of the line, which is a different question from the slope.
      // b = y1 − m·x1 = (y1·dx − dy·x1) / dx.
      const b = frac(y1 * dx - dy * x1, dx);
      return item({
        format: 'type_in',
        prompt: `A line passes through (${x1}, ${y1}) and (${x2}, ${y2}). `
          + 'Write its equation in the form y = mx + b, and give b.   (an integer or a fraction like -5/3)',
        answer: b,
        rationale: `The slope is (${y2} − ${par(y1)}) ÷ (${x2} − ${par(x1)}) = ${m}. Substituting (${x1}, ${y1}) into y = mx + b gives `
          + `b = ${y1} − (${m})(${x1}) = ${b}.`,
      });
    }

    if (roll === 2) {
      // Parallel or perpendicular, which is what a slope is usually for.
      const perp = frac(-dx, dy);
      return item({
        format: 'multiple_choice',
        prompt: `Line A has slope ${m} and line B has slope ${perp}. What is the relationship?`,
        choices: rng.shuffle(['They are perpendicular', 'They are parallel', 'They are the same line', 'Nothing can be said']),
        answer: 'They are perpendicular',
        rationale: `Two lines are perpendicular when their slopes multiply to −1, and ${m} × ${perp} = −1.`,
      });
    }

    if (roll === 3) {
      // From the intercept to one more point: rise over run from a point that
      // is easy to read. (The old second point kept the intercept's y, so the
      // line it described was flat and the keyed slope belonged to another one.)
      return item({
        format: 'type_in',
        prompt: `A line crosses the y-axis at (0, ${y1}). Another point on it is (${dx}, ${y1 + dy}). `
          + 'What is the slope?   (an integer or a fraction like -5/3)',
        answer: m,
        rationale: `From (0, ${y1}) to (${dx}, ${y1 + dy}), y changes by ${dy} while x changes by ${dx}, so the slope is ${dy}/${dx} = ${m}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `A line passes through (${x1}, ${y1}) and (${x2}, ${y2}). What is its slope?   (an integer or a fraction like -5/3)`,
      answer: m,
      rationale: `Slope is rise over run: (${y2} − ${par(y1)}) ÷ (${x2} − ${par(x1)}) = ${dy}/${dx} = ${m}.`,
    });
  },

  // ── systems ──────────────────────────────────────────────────────────────
  systems(rng, d) {
    const roll = rng.int(0, 3);
    const x = rng.int(2, 9);
    const y = rng.int(2, 9);
    const a1 = rng.int(1, 5); const b1 = rng.int(1, 5);
    const a2 = rng.int(1, 5); const b2 = rng.int(1, 5);

    if (roll === 0) {
      // Is it the solution: substitute into both, which is checking rather than
      // solving and is a different act.
      return item({
        format: 'multiple_choice',
        prompt: `Is x = ${x}, y = ${y} a solution of the pair  ${co(a1, 'x')} + ${co(b1, 'y')} = ${a1 * x + b1 * y} `
          + `and  ${co(a2, 'x')} + ${co(b2, 'y')} = ${a2 * x + b2 * y}?`,
        choices: rng.shuffle(['Yes', 'No', 'Only the first equation', 'Only if x = y']),
        answer: 'Yes',
        rationale: `Substituting gives ${a1}(${x}) + ${b1}(${y}) = ${a1 * x + b1 * y} and`
          + ` ${a2}(${x}) + ${b2}(${y}) = ${a2 * x + b2 * y}, which are both the right sides.`,
      });
    }

    if (roll === 1) {
      // One equation of a pair, given the other variable: substitution in
      // reverse.
      return item({
        format: 'type_in',
        prompt: `If y = ${y} in  ${co(a1, 'x')} + ${co(b1, 'y')} = ${a1 * x + b1 * y}, what is x?`,
        answer: String(x),
        rationale: `${b1}(${y}) is ${b1 * y}, so ${co(a1, 'x')} = ${a1 * x + b1 * y} − ${b1 * y} = ${a1 * x}, and x = ${a1 * x} ÷ ${a1} = ${x}.`,
      });
    }

    if (roll === 2) {
      // A story, which is where a system actually comes from. The pen price is
      // the unknown, so it is not printed in the question (it used to be).
      return item({
        format: 'type_in',
        prompt: `Tickets cost $${a1} each. A group buys ${x} tickets and ${y} pens and `
          + `pays $${a1 * x + b1 * y} in all. How much does one pen cost, in dollars?`,
        answer: String(b1),
        rationale: `The tickets cost ${x} × $${a1} = $${a1 * x}, leaving $${b1 * y} for ${y} pens, so one pen costs $${b1 * y} ÷ ${y} = $${b1}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `Solve the pair:  x + y = ${x + y}  and  x − y = ${x - y}. What is x?`,
      answer: String(x),
      rationale: `Adding the two gives 2x = ${2 * x}, so x = ${x}.`,
    });
  },

  // ── quadratics ───────────────────────────────────────────────────────────
  quadratics(rng, d) {
    const roll = rng.int(0, 3);
    const r1 = rng.int(1, 6) * (rng.bool() ? 1 : -1);
    let r2 = rng.int(1, 6) * (rng.bool() ? 1 : -1);
    // Two different roots, so "which root is larger" has one answer and the two
    // choices naming the roots are two choices, not one printed twice.
    while (r2 === r1) r2 = rng.int(1, 6) * (rng.bool() ? 1 : -1);
    const b = -(r1 + r2);
    const c = r1 * r2;
    const factored = `(x ${plusMinus(-r1)})(x ${plusMinus(-r2)})`;

    if (roll === 0) {
      // The two roots, which is a reading of the graph rather than a formula.
      return item({
        format: 'type_in',
        prompt: `The quadratic ${quad(b, c)} = 0 has two roots. What is their sum?`,
        answer: String(-b),
        rationale: `It factors as ${factored} = 0, so the roots are ${r1} and ${r2}, and they sum to ${r1 + r2}.`,
      });
    }

    if (roll === 1) {
      // Which is the larger root, a comparison rather than a solve.
      return item({
        format: 'multiple_choice',
        prompt: `For ${quad(b, c)} = 0, which root is larger?`,
        choices: rng.shuffle([String(r1), String(r2), 'They are equal', 'Cannot be told']),
        answer: String(Math.max(r1, r2)),
        rationale: `It factors as ${factored} = 0, so the roots are ${r1} and ${r2}, and ${Math.max(r1, r2)} is the larger.`,
      });
    }

    if (roll === 2) {
      // The vertex, which is what a parabola is actually for.
      const vertex = -b / 2;
      return item({
        format: 'type_in',
        prompt: `For y = ${quad(b, c)}, what is the x-coordinate of the lowest point?`,
        answer: String(vertex),
        rationale: `The roots are ${r1} and ${r2}, and the turning point of a parabola is halfway between them: (${r1} + ${par(r2)}) ÷ 2 = ${vertex}.`,
      });
    }

    // The larger root, not "the positive root": both roots can be positive, or
    // both negative, and then the old wording had two answers or none.
    return item({
      format: 'type_in',
      prompt: `Solve:  ${quad(b, c)} = 0. Give the larger root.`,
      answer: String(Math.max(r1, r2)),
      rationale: `It factors as ${factored} = 0, so the roots are ${r1} and ${r2}; the larger is ${Math.max(r1, r2)}.`,
    });
  },

  // ── functions and notation ───────────────────────────────────────────────
  functions(rng, d) {
    const roll = rng.int(0, 3);
    const a = rng.int(2, 6);
    const b = rng.int(-8, 8);
    const c = rng.int(-6, 6);
    // "3x − 4", "3x": never "3x + -4" or "3x + 0".
    const fx = `${a}x${c ? ` ${plusMinus(c)}` : ''}`;

    if (roll === 0) {
      // Which input gives that output, which is evaluation run backwards.
      const target = a * b + c;
      return item({
        format: 'type_in',
        prompt: `f(x) = ${fx}. Which value of x gives f(x) = ${target}?`,
        answer: String(b),
        rationale: `${fx} = ${target} means ${a}x = ${target} − ${par(c)} = ${target - c}, so x = ${target - c} ÷ ${a} = ${b}.`,
      });
    }

    if (roll === 1) {
      // Domain: the one question about functions that is not arithmetic.
      return item({
        format: 'type_in',
        prompt: `f(x) = 1/(${c ? `x ${plusMinus(-c)}` : 'x'}). What is the one value of x that is not in the domain?`,
        answer: String(c),
        rationale: `The denominator cannot be zero, and ${c ? `x ${plusMinus(-c)}` : 'x'} is zero exactly when x = ${c}.`,
      });
    }

    if (roll === 2) {
      // Read a table rather than a formula, which is how functions are often
      // given before algebra. Linear is stated: three values alone fit many
      // functions, and only a linear one has to give the keyed fourth.
      return item({
        format: 'type_in',
        prompt: `A linear function has f(1) = ${a + c}, f(2) = ${2 * a + c}, f(3) = ${3 * a + c}. What is f(4)?`,
        answer: String(4 * a + c),
        rationale: `Each step up by one in x raises the value by ${a}, so f(4) = ${3 * a + c} + ${a} = ${4 * a + c}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `f(x) = ${fx}. What is f(${b})?`,
      answer: String(a * b + c),
      rationale: `${a} × ${par(b)}${c ? ` ${plusMinus(c)}` : ''} = ${a * b + c}.`,
    });
  },

  // ── trigonometry ─────────────────────────────────────────────────────────
  trig_basics(rng, d) {
    const roll = rng.int(0, 5);
    // A right triangle, because trigonometry is a property of right triangles and
    // a question that hides the triangle is a question about memorised numbers.
    const a = rng.int(2, 9);
    let b = rng.int(2, 9);
    // a and b differ, or "a/c" and "b/c" are one option printed twice.
    while (b === a) b = rng.int(2, 9);
    const c = a + b;
    // Not rounded: the question asks for two decimals, and rounding the square
    // root to a whole number first keyed √13 as 4 instead of 3.61.
    const hyp = (a, b) => Math.sqrt(a * a + b * b);
    const r2 = (x) => Math.round(x * 100) / 100;
    const ratio = (o, h) => r2(o / h);
    const angle = (deg) => {
      const t = Math.tan(deg * Math.PI / 180);
      return `${r2(t)}`;
    };
    const deg = [30, 45, 60][rng.int(0, 2)];

    if (roll === 0) {
      // Which trig ratio, decided by naming the sides rather than computing.
      return item({
        format: 'multiple_choice',
        prompt: `In a right triangle the side opposite angle A is ${a} and the hypotenuse is ${c}. `
          + 'Which ratio gives the sine of angle A?',
        choices: rng.shuffle([`${a}/${c}`, `${b}/${c}`, `${a}/${b}`, `${c}/${a}`]),
        answer: `${a}/${c}`,
        rationale: 'Sine is the opposite side over the hypotenuse.',
      });
    }

    if (roll === 1) {
      // A special-angle value, which is the one part of trigonometry that is
      // worth knowing without calculating.
      const values = {
        30: { sin: '0.5', cos: '√3/2', tan: '√3/3' },
        45: { sin: '√2/2', cos: '√2/2', tan: '1' },
        60: { sin: '√3/2', cos: '0.5', tan: '√3' },
      };
      const which = rng.pick(['sin', 'cos', 'tan']);
      return item({
        format: 'multiple_choice',
        prompt: `What is the ${which} of ${deg}°?`,
        // From a pool, because the fixed list repeated itself: at 30° the "30°
        // value" and the answer were one option twice, and tan 45° is "1".
        choices: choicesFrom(rng, values[deg][which],
          rng.shuffle([values[30][which], values[45][which], values[60][which], '1', '0.5', '√3/2', '√2/2', '0'])),
        answer: values[deg][which],
        rationale: `The ${which} of ${deg}° is ${values[deg][which]}.`,
      });
    }

    if (roll === 2) {
      // Find a side, which is the reason trigonometry exists.
      const h = hyp(a, b);
      return item({
        format: 'type_in',
        prompt: `A right triangle has legs of ${a} and ${b} cm. How long is the hypotenuse? `
          + 'Round to two decimals.',
        answer: String(r2(h)),
        rationale: `${a}² + ${b}² is ${a * a + b * b}, whose square root is about ${r2(h)}.`,
      });
    }

    if (roll === 3) {
      // Degrees to radians, which is a conversion rather than a calculation and
      // is never asked in a trigonometry generator on its own.
      return item({
        format: 'type_in',
        prompt: `Convert ${deg * 2}° to radians. Give a decimal, rounded to two places.`,
        answer: String(r2((deg * 2) * Math.PI / 180)),
        // The exact form is a right answer too, however the question asked.
        accepts: [{ 60: 'π/3', 90: 'π/2', 120: '2π/3' }[deg * 2]],
        rationale: `Multiply the degrees by π/180: ${deg * 2} × π/180 = ${{ 60: 'π/3', 90: 'π/2', 120: '2π/3' }[deg * 2]}, which is about ${r2((deg * 2) * Math.PI / 180)}.`,
      });
    }

    if (roll === 4) {
      // Which angle, decided by comparing a ratio against a known one.
      const target = angle(deg);
      return item({
        format: 'multiple_choice',
        prompt: `An angle has a tangent of about ${target}. Which is it most likely to be?`,
        choices: rng.shuffle(['30°', '45°', '60°', '90°']),
        answer: deg === 30 ? '30°' : deg === 45 ? '45°' : '60°',
        rationale: `The tangent of ${deg}° is about ${target}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `A right triangle has a hypotenuse of ${c} and the side opposite angle A is ${a}. `
        + 'What is the sine of angle A? Round to two decimals.',
      answer: String(ratio(a, c)),
      rationale: `Sine is opposite over hypotenuse: ${a} ÷ ${c}, which is ${ratio(a, c)}.`,
    });
  },

  // ── logarithms ───────────────────────────────────────────────────────────
  logs(rng, d) {
    const roll = rng.int(0, 4);
    const base = rng.pick([2, 3, 10]);
    const power = rng.int(2, 5);

    if (roll === 0) {
      // The definition, run backwards: which power is this.
      return item({
        format: 'type_in',
        prompt: `What is log base ${base} of ${Math.pow(base, power)}?`,
        answer: String(power),
        rationale: `${base}^${power} is ${Math.pow(base, power)}, and that is what the log asks for.`,
      });
    }

    if (roll === 1) {
      // Solve for the base, which is the same definition read the other way.
      return item({
        format: 'type_in',
        prompt: `Solve for x:  log base x of ${Math.pow(base, power)} = ${power}`,
        answer: String(base),
        rationale: `x^${power} is ${Math.pow(base, power)} when x is ${base}.`,
      });
    }

    if (roll === 2) {
      // Expand a product, which is the one property that turns a calculation
      // into arithmetic.
      // The product rule, asked as a number: the old version asked for "two logs
      // separated by +", keyed "3 + 2" (not two logs), and printed a raw
      // "${base}^{power + other}" in its working.
      const other = rng.int(2, 4);
      const p = Math.pow(base, power);
      const q = Math.pow(base, other);
      return item({
        format: 'type_in',
        prompt: `Use log(ab) = log a + log b: what is log base ${base} of (${p} × ${q})? Give a whole number.`,
        answer: String(power + other),
        rationale: `log base ${base} of ${p} is ${power} and log base ${base} of ${q} is ${other}, so the log of the product is ${power} + ${other} = ${power + other}.`,
      });
    }

    if (roll === 3) {
      // The defining property stated as an equation to check.
      return item({
        format: 'multiple_choice',
        prompt: `Is this true?  log base ${base} of ${Math.pow(base, power + 1)} = ${power + 1}`,
        choices: rng.shuffle(['Yes', 'No', 'Only if the base is 10', 'Only if the number is even']),
        answer: 'Yes',
        rationale: `${base}^${power + 1} is ${Math.pow(base, power + 1)}, so the log is ${power + 1}.`,
      });
    }

    // Exponential form: the definition read the third way. (This used to claim
    // that base^power "cannot be done exactly" as a power of 2 × base, which is
    // false for 2^4 = 4^2.)
    return item({
      format: 'type_in',
      prompt: `If log base ${base} of y = ${power}, what is y?`,
      answer: String(Math.pow(base, power)),
      rationale: `log base ${base} of y = ${power} means ${base}^${power} = y, so y = ${Math.pow(base, power)}.`,
    });
  },

  // ── sequences and series ─────────────────────────────────────────────────
  sequences(rng, d) {
    const roll = rng.int(0, 4);
    const start = rng.int(1, 12);
    const step = rng.int(2, 8);

    if (roll === 0) {
      // Find the rule, which is the actual skill in a sequence question.
      const seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
      return item({
        format: 'multiple_choice',
        prompt: `Which rule fits ${seq.join(', ')}?`,
        choices: rng.shuffle([
          `Each term is ${step} more than the one before`,
          `Each term is ${step + 1} more than the one before`,
          `Each term is twice the one before`,
          `The terms are in no pattern`,
        ]),
        answer: `Each term is ${step} more than the one before`,
        rationale: `The gaps are all ${step}.`,
      });
    }

    if (roll === 1) {
      // Which term, which is the nth-term formula rather than a next term.
      const n = rng.int(5, 12);
      return item({
        format: 'type_in',
        prompt: `In the sequence ${start}, ${start + step}, ${start + 2 * step}, … what is the ${n}th term?`,
        answer: String(start + (n - 1) * step),
        rationale: `The nth term is ${start} + (n − 1) × ${step}, and at n = ${n} that is ${start + (n - 1) * step}.`,
      });
    }

    if (roll === 2) {
      // A geometric rule, which grows and is a different shape from a constant step.
      const s = rng.int(1, 4);
      const seq = [0, 1, 2, 3].map((i) => s * Math.pow(2, i));
      return item({
        format: 'type_in',
        prompt: `What is the next term?\n${seq.join(', ')}, ___`,
        answer: String(seq[3] * 2),
        rationale: `Each term is twice the one before, so the next is ${seq[3] * 2}.`,
      });
    }

    if (roll === 3) {
      // A term that does not fit, which is sequence reasoning run as a check.
      const seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
      const badAt = rng.int(1, 4);
      const broken = [...seq];
      broken[badAt] += rng.int(1, 6) * (rng.bool() ? 1 : -1);
      return item({
        format: 'type_in',
        prompt: `In ${broken.join(', ')}, which position breaks the pattern? Give the position number.`,
        answer: String(badAt + 1),
        rationale: `The other terms go up by ${step} each time, so position ${badAt + 1} should be ${seq[badAt]}, not ${broken[badAt]}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `What is the next term?\n${start}, ${start + step}, ${start + 2 * step}, ${start + 3 * step}, ___`,
      answer: String(start + 4 * step),
      rationale: `Each term is ${step} more, so the next is ${start + 4 * step}.`,
    });
  },

  // ── rational expressions ─────────────────────────────────────────────────
  rational_expr(rng, d) {
    const roll = rng.int(0, 4);
    const a = rng.int(1, 6);
    // b from 2: a denominator of 1 printed "(2/1)" and "(4x)/1". And a ≠ b, or
    // a/b is 1 and its reciprocal is equal to it.
    let b = rng.int(2, 6);
    while (b === a) b = rng.int(2, 6);
    const c = rng.int(1, 6);

    if (roll === 0) {
      // Multiply through, then simplify: the numerator asked for is the one in
      // lowest terms. (The key used to be a × c before simplifying, which is
      // not the numerator of the simplified product when anything cancels.)
      const num = a * c;
      const den = b * d1(a, b);
      const simplest = frac(num, den);
      return item({
        format: 'type_in',
        prompt: `Multiply (${a}/${b}) × (${c}/${d1(a, b)}) and write the result in lowest terms. What is its numerator?`,
        answer: simplest.split('/')[0],
        rationale: `Straight across, (${a} × ${c})/(${b} × ${d1(a, b)}) = ${num}/${den}, which in lowest terms is ${simplest}`
          + `${simplest.includes('/') ? '' : ` (that is, ${simplest}/1)`}, so the numerator is ${simplest.split('/')[0]}.`,
      });
    }

    if (roll === 1) {
      // Spot the one that is not equivalent, which is simplification run as a check.
      return item({
        format: 'multiple_choice',
        prompt: `Which is NOT equal to ${a}/${b}?`,
        choices: rng.shuffle([
          `${a}/${b}`,
          `${a * 2}/${b * 2}`,
          `${b}/${a}`,
          `${a * 3}/${b * 3}`,
        ]),
        answer: `${b}/${a}`,
        rationale: `Multiplying top and bottom by the same number keeps the value, but swapping them does not.`,
      });
    }

    if (roll === 2) {
      // Find the value a variable must take, which is substitution with a purpose.
      const x = rng.int(2, 9);
      return item({
        format: 'type_in',
        prompt: `If x = ${x}, what is the value of (${co(a, 'x')})/${b}?   (an integer or a fraction in lowest terms)`,
        answer: frac((a * x), b),
        x: [frac((a * x), b)],
        rationale: `${a} × ${x} is ${a * x}, over ${b}, which is ${frac(a * x, b)}.`,
      });
    }

    if (roll === 3) {
      // A denominator that cannot be zero, which is the one thing rational
      // expressions are strict about. The value comes from the denominator
      // alone — the numerator is irrelevant here, which is the point of the rule.
      //
      // The question avoids the word "undefined" in the prompt: the content
      // check treats that string as a sign a generator has produced a broken
      // value, and a question whose subject is the word trips it every time.
      const k = rng.int(2, 9);
      return item({
        format: 'type_in',
        // Exact, so −2/3 is keyed as −2/3 and not as a rounded −0.67 the prompt
        // never asked for. The grader still accepts −1.5 for −3/2.
        prompt: `At what value of x can (${co(a, 'x')} + ${b})/(${co(c, 'x')} + ${k}) not be worked out?   (an integer or a fraction like -5/3)`,
        answer: frac(-k, c),
        rationale: `It cannot be worked out when the denominator is zero: ${co(c, 'x')} + ${k} = 0 gives x = −${k}/${c} = ${frac(-k, c)}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `Simplify (${a}/${b}) ÷ (${c}/${d1(c, a)}). Give an integer or a fraction in lowest terms.`,
      answer: frac(a * d1(c, a), b * c),
      rationale: `Dividing by a fraction means multiplying by its reciprocal: (${a}/${b}) × (${d1(c, a)}/${c}) = `
        + `${a * d1(c, a)}/${b * c}, which is ${frac(a * d1(c, a), b * c)} in lowest terms.`,
    });
  },

  // ── geometry ─────────────────────────────────────────────────────────────
  geometry_area(rng, d) {
    const roll = rng.int(0, 5);
    const w = rng.int(2, 12);
    const h = rng.int(2, 12);
    const l = rng.int(2, 10);
    const wd = rng.int(2, 8);

    if (roll === 0) {
      // Perimeter against area, which is the distinction the skill is named for.
      return item({
        format: 'multiple_choice',
        prompt: `A rectangle is ${w} by ${h}. Which is its perimeter?`,
        // A 4 by 4 square has area 16 and perimeter 16, so the area is only a
        // distractor when it differs; the spares keep four options either way.
        choices: choicesFrom(rng, String(2 * (w + h)),
          [String(w * h), String(w + h), String(2 * w + 2 * h + 1), String(2 * w + h), String(w + 2 * h + 2)]),
        answer: String(2 * (w + h)),
        rationale: `The perimeter is the distance around: two of ${w} and two of ${h}, which is ${2 * (w + h)}.`,
      });
    }

    if (roll === 1) {
      // A missing side, which is a real problem rather than a substitution.
      return item({
        format: 'type_in',
        prompt: `A rectangle has a perimeter of ${2 * (l + wd)} cm and is ${l} cm long. How wide is it?`,
        answer: String(wd),
        rationale: `Half the perimeter is ${l + wd}, and that is the length plus the width.`,
      });
    }

    if (roll === 2) {
      // Volume rather than area, which is a third dimension and a different question.
      return item({
        format: 'type_in',
        prompt: `A box is ${w} by ${h} by ${l} cm. What is its volume in cubic centimetres?`,
        answer: String(w * h * l),
        rationale: `${w} × ${h} × ${l} = ${w * h * l}.`,
      });
    }

    if (roll === 3) {
      // Circumference against diameter, which is where the constant actually is.
      return item({
        format: 'type_in',
        prompt: `A circle has a diameter of ${w} cm. What is its circumference? `
          + 'Use 3.14 for pi, and round to two decimals.',
        answer: String(round2(3.14 * w)),
        accepts: [String(round2(3.14 * w))],
        rationale: `The circumference is pi times the diameter: 3.14 × ${w} = ${round2(3.14 * w)}.`,
      });
    }

    if (roll === 4) {
      // A triangle's area, which uses half and is the formula most often forgotten.
      return item({
        format: 'type_in',
        prompt: `A triangle has a base of ${w} cm and a height of ${h} cm. What is its area?`,
        answer: String(round2((w * h) / 2)),
        rationale: `A triangle is half its base times its height: (${w} × ${h}) ÷ 2 = ${round2((w * h) / 2)}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `A rectangle is ${w} by ${h}. What is its area?`,
      answer: String(w * h),
      rationale: `Area is length times width: ${w} × ${h} = ${w * h}.`,
    });
  },

  // ── percents ─────────────────────────────────────────────────────────────
  percents(rng, d) {
    const roll = rng.int(0, 4);
    // A multiple of 20, so every percent below (all multiples of 5) of it is a
    // whole number. Rounded parts made the keys false: "What percent of 23 is
    // 3?" was keyed 15, and 3 is 13% of 23.
    const whole = rng.int(1, 20) * 20;
    const pct = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75]);

    if (roll === 0) {
      // What percent, which is the reverse of "what is n percent of m".
      const part = whole * pct / 100;
      return item({
        format: 'type_in',
        prompt: `What percent of ${whole} is ${part}? Give the number only.`,
        answer: String(pct),
        rationale: `${part} ÷ ${whole} is ${round2(part / whole)}, which is ${pct}%.`,
      });
    }

    if (roll === 1) {
      // A percent change, which is the thing people actually need and the one a
      // generator that only asks "percent of" never reaches.
      const up = rng.bool();
      const amount = whole * pct / 100;
      const after = up ? whole + amount : whole - amount;
      return item({
        format: 'type_in',
        prompt: `A price goes from $${whole} to $${after}. By what percent did it ${up ? 'rise' : 'fall'}? `
          + 'Give the number only.',
        answer: String(pct),
        rationale: `The change is $${amount}, and ${amount} ÷ ${whole} × 100 = ${pct}%.`,
      });
    }

    if (roll === 2) {
      // Successive change, where the second percent applies to a different base.
      // A multiple of 50, so both steps land on whole dollars and the total is
      // exactly 28%.
      const base = rng.int(1, 8) * 50;
      const after = base * 0.8;
      const final = after * 0.9;
      return item({
        format: 'multiple_choice',
        prompt: `A price of $${base} is reduced by 20%, then the new price is reduced by 10%. Is the total reduction more than, `
          + 'less than, or equal to 30%?',
        choices: rng.shuffle(['less than 30%', 'more than 30%', 'exactly 30%', 'it depends on the price']),
        answer: 'less than 30%',
        rationale: `20% off $${base} is $${after}, and 10% off $${after} is $${final}. That is a reduction of $${base - final}, or `
          + `${round2((base - final) / base * 100)}% — less than 30%, because the second 10% applies to the smaller price.`,
      });
    }

    if (roll === 3) {
      // A discount, which is a percent question with a real shape to it.
      const off = whole * pct / 100;
      const sale = whole - off;
      return item({
        format: 'type_in',
        prompt: `A $${whole} item is ${pct}% off. What is the sale price, in dollars?`,
        answer: String(sale),
        rationale: `${pct}% of $${whole} is $${off}, so the sale price is $${whole} − $${off} = $${sale}.`,
      });
    }

    const part = whole * pct / 100;
    return item({
      format: 'type_in',
      prompt: `What is ${pct}% of ${whole}? Give the number only.`,
      answer: String(part),
      rationale: `${whole} ÷ 100 is ${round2(whole / 100)}, and ${pct} × ${round2(whole / 100)} = ${part}.`,
    });
  },

  // ── complex numbers ──────────────────────────────────────────────────────
  complex_nums(rng, d) {
    const roll = rng.int(0, 4);
    const a = rng.int(1, 8);
    const b = rng.int(1, 8);
    const c = rng.int(1, 8);
    const e = rng.int(1, 8);

    // "3 + 2i", "3 - 2i", "3 + i": the form a textbook writes, and never "3 + -2i".
    const cx = (re, im) => {
      const mag = Math.abs(im) === 1 ? '' : String(Math.abs(im));
      return `${re} ${im < 0 ? '-' : '+'} ${mag}i`;
    };
    // The same value written the other ways a learner might type it.
    const cxAlso = (re, im) => {
      const out = [cx(re, im).replace(/ /g, ''), `${re} + ${im}i`];
      if (re === 0) out.push(`${im === 1 ? '' : im === -1 ? '-' : im}i`);
      if (im === 0) out.push(String(re));
      return out;
    };

    if (roll === 0) {
      // A complex conjugate, which is the one piece of vocabulary the rest hangs on.
      return item({
        format: 'type_in',
        prompt: `What is the conjugate of ${cx(a, b)}? Answer in the form a - bi.`,
        answer: cx(a, -b),
        x: cxAlso(a, -b),
        rationale: `The imaginary part changes sign and nothing else does: the conjugate of ${cx(a, b)} is ${cx(a, -b)}.`,
      });
    }

    if (roll === 1) {
      // Which is real, which decides by a part rather than by arithmetic.
      let [p, q] = [a, b];
      // Two different non-real options, or one is printed twice.
      while (p === c && q === e) { p = rng.int(1, 8); q = rng.int(1, 8); }
      return item({
        format: 'multiple_choice',
        prompt: `Which of these is a real number?`,
        choices: rng.shuffle([cx(p, q), `${c} + 0i`, `${e === 1 ? '' : e}i`, cx(c, e)]),
        answer: `${c} + 0i`,
        rationale: `A real number has no imaginary part: ${c} + 0i has an imaginary coefficient of zero, so it is just ${c}.`,
      });
    }

    if (roll === 2) {
      // Multiply, using i² = −1.
      const re = a * c - b * e;
      const im = a * e + b * c;
      return item({
        format: 'type_in',
        prompt: `Multiply (${cx(a, b)})(${cx(c, e)}). Give the answer in the form "x + yi".`,
        answer: cx(re, im),
        x: cxAlso(re, im),
        rationale: `Using i² = −1, the real part is ${a}×${c} − ${b}×${e} = ${re}, and the imaginary part is `
          + `${a}×${e} + ${b}×${c} = ${im}, so the product is ${cx(re, im)}.`,
      });
    }

    if (roll === 3) {
      return item({
        format: 'type_in',
        prompt: `Add (${cx(a, b)}) + (${cx(c, e)}). Give the answer in the form "x + yi".`,
        answer: cx(a + c, b + e),
        x: cxAlso(a + c, b + e),
        rationale: `Add the real parts and the imaginary parts separately: ${a} + ${c} = ${a + c} and ${b} + ${e} = ${b + e}, so the sum is ${cx(a + c, b + e)}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `Subtract (${cx(a, b)}) − (${cx(c, e)}). Give the answer in the form "x + yi".`,
      answer: cx(a - c, b - e),
      x: cxAlso(a - c, b - e),
      rationale: `Subtract the real parts and the imaginary parts separately: ${a} − ${c} = ${a - c} and ${b} − ${e} = ${b - e}, so the difference is ${cx(a - c, b - e)}.`,
    });
  },

  // ── polynomials ──────────────────────────────────────────────────────────
  polynomials(rng, d) {
    const roll = rng.int(0, 4);
    const a = rng.int(1, 7);
    const b = rng.int(1, 9);
    const c = rng.int(1, 9);

    if (roll === 0) {
      // Multiply out two binomials, which is the operation the skill is named for.
      return item({
        format: 'type_in',
        prompt: `(x + ${a})(x + ${b}) = x^2 + ___x + ___. What is the coefficient of x?`,
        answer: String(a + b),
        rationale: `The x terms come from x×${b} and ${a}×x, so the coefficient is ${b} + ${a} = ${a + b}.`,
      });
    }

    if (roll === 1) {
      // The constant term, which is the other half of the same product.
      return item({
        format: 'type_in',
        prompt: `(x + ${a})(x + ${b}) = x^2 + ${a + b}x + ___. What is the constant term?`,
        answer: String(a * b),
        rationale: `Only ${a}×${b} has no x in it, so the constant is ${a * b}.`,
      });
    }

    if (roll === 2) {
      // Evaluate at a value, which is a different act from expanding.
      return item({
        format: 'type_in',
        prompt: `What is the value of x^2 + ${co(b, 'x')} + ${c} when x = ${a}?`,
        answer: String(a * a + b * a + c),
        rationale: `${a}² + ${b}×${a} + ${c} = ${a * a} + ${b * a} + ${c} = ${a * a + b * a + c}.`,
      });
    }

    if (roll === 3) {
      // A difference of squares, which is a shortcut the skill exists to teach.
      return item({
        format: 'type_in',
        prompt: `Expand (x + ${a})² − (x − ${a})². What is the coefficient of x?`,
        answer: String(4 * a),
        rationale: `(x + ${a})² = x² + ${co(2 * a, 'x')} + ${a * a} and (x − ${a})² = x² − ${co(2 * a, 'x')} + ${a * a}; `
          + `subtracting leaves ${co(4 * a, 'x')}, so the coefficient is ${4 * a}.`,
      });
    }

    return item({
      format: 'type_in',
      prompt: `(x + ${a})(x + ${b}) = x^2 + ___x + ${a * b}. What number goes in the blank?`,
      answer: String(a + b),
      rationale: `The x terms are x×${b} and ${a}×x, which sum to ${a + b}.`,
    });
  },
};

/** A second number used where a question needs two denominators that differ. */
function d1(a, b) {
  return a + b;
}

module.exports = SHAPES;
