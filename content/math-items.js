/**
 * Procedural math items. Every generator takes (rng, d) where d is difficulty
 * 1–10, and returns an item whose answer is computed, not typed — so the bank
 * can serve an unlimited number of verifiably correct questions with no model
 * call and no answer key to maintain.
 */
const { choicesFrom } = require('./rng');
// The same arithmetic asked in a different way. A generator below can produce
// unlimited numbers and only a handful of questions; these are the questions.
const SHAPES = require('./math-shapes');
const { withShapes } = require('./pool');

// ── helpers ────────────────────────────────────────────────────────────────
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

function frac(n, d) {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  const sn = n / g;
  const sd = d / g;
  return sd === 1 ? String(sn) : `${sn}/${sd}`;
}

const round2 = (x) => Math.round(x * 100) / 100;

/** Scale a magnitude with difficulty: small numbers early, large numbers late. */
function mag(d, base = 10) {
  return Math.max(base, Math.round(base * Math.pow(1.9, d - 1)));
}

/**
 * One term of an expression with its sign attached: " - 4x", "+ 7", "2x".
 * A leading space on the non-first terms is what keeps "x^2 + 3x - 10" from
 * rendering as "x^2+ 3x- 10", so callers concatenate without adding their own.
 */
function signedTerm(coef, variable, first = false) {
  const abs = Math.abs(coef);
  const num = abs === 1 && variable ? '' : String(abs);
  if (first) return `${coef < 0 ? '-' : ''}${num}${variable}`;
  return ` ${coef < 0 ? '-' : '+'} ${num}${variable}`;
}

function poly(coefs, variable = 'x') {
  // coefs highest power first, e.g. [1, -2, -8] -> x^2 - 2x - 8
  const deg = coefs.length - 1;
  let out = '';
  let first = true;
  coefs.forEach((c, i) => {
    if (c === 0) return;
    const p = deg - i;
    const v = p === 0 ? '' : p === 1 ? variable : `${variable}^${p}`;
    out += signedTerm(c, v, first);
    first = false;
  });
  return out || '0';
}

const item = (o) => ({ source: 'bank', ...o });

/** A number written inside working, bracketed when negative: "3 - (-5)", not "3 - -5". */
const par = (n) => (n < 0 ? `(${n})` : String(n));

/** Dollars as a price is written: "$4", "$4.50" — never "$4.5". */
const money = (x) => (Number.isInteger(x) ? `$${x}` : `$${x.toFixed(2)}`);

/** Decimal places a number shows when printed: 0.3 has one, 1.25 has two. */
const placesOf = (x) => (String(x).split('.')[1] || '').length;

/** x to a power, written the way a textbook would: x, x^2, x^5. */
const xPow = (k) => (k === 1 ? 'x' : `x^${k}`);

// ── generators ─────────────────────────────────────────────────────────────
const G = {
  add_sub(rng, d) {
    const m = mag(d, 12);
    const a = rng.int(2, m);
    const b = rng.int(2, m);
    const sub = rng.bool();
    if (d >= 6 && rng.bool(0.4)) {
      const c = rng.int(2, m);
      const answer = a + b - c;
      return item({
        format: 'type_in',
        prompt: `${a} + ${b} - ${c} =`,
        answer: String(answer),
        rationale: `${a} + ${b} = ${a + b}, and ${a + b} - ${c} = ${answer}.`,
      });
    }
    const answer = sub ? a - b : a + b;
    return item({
      format: 'type_in',
      prompt: `${a} ${sub ? '-' : '+'} ${b} =`,
      answer: String(answer),
      rationale: sub && a < b
        ? `Subtracting a larger number from a smaller one crosses zero: ${a} - ${b} = ${answer}.`
        : `${a} ${sub ? '-' : '+'} ${b} = ${answer}.`,
    });
  },

  mul_div(rng, d) {
    const divide = rng.bool();
    const aMax = d <= 2 ? 9 : d <= 4 ? 12 : d <= 6 ? 25 : 99;
    const bMax = d <= 2 ? 9 : d <= 5 ? 12 : d <= 7 ? 25 : 40;
    const a = rng.int(2, aMax);
    const b = rng.int(2, bMax);
    if (divide) {
      const product = a * b;
      return item({
        format: 'type_in',
        prompt: `${product} ÷ ${b} =`,
        answer: String(a),
        rationale: `${b} × ${a} = ${product}, so ${product} ÷ ${b} = ${a}.`,
      });
    }
    const answer = a * b;
    return item({
      format: 'type_in',
      prompt: `${a} × ${b} =`,
      answer: String(answer),
      // Splitting into tens and ones only helps when there are both: "7 × 8 = 7 × 0
      // + 7 × 8" and "7 × 20 = 7 × 20 + 7 × 0" are true and teach nothing.
      rationale: d >= 6 && b > 10 && b % 10 !== 0
        ? `Break it up: ${a} × ${b} = ${a} × ${b - (b % 10)} + ${a} × ${b % 10} = ${a * (b - (b % 10))} + ${a * (b % 10)} = ${answer}.`
        : `${a} × ${b} = ${answer}.`,
    });
  },

  fractions(rng, d) {
    const dens = d <= 3 ? [2, 3, 4, 5, 6, 8] : [3, 4, 5, 6, 7, 8, 9, 10, 12];
    const b = rng.pick(dens);
    let e = rng.pick(dens.filter((x) => x !== b));
    const a = rng.int(1, b - 1);
    const c = rng.int(1, e - 1);
    const op = d <= 3 ? rng.pick(['+', '-']) : rng.pick(['+', '-', '×', '÷']);
    let n, den, work;
    if (op === '+' || op === '-') {
      den = b * e;
      n = op === '+' ? a * e + c * b : a * e - c * b;
      work = `Common denominator ${den}: ${a * e}/${den} ${op} ${c * b}/${den} = ${n}/${den}`;
    } else if (op === '×') {
      n = a * c; den = b * e;
      work = `Multiply straight across: (${a}×${c})/(${b}×${e}) = ${n}/${den}`;
    } else {
      n = a * e; den = b * c;
      work = `Dividing is multiplying by the reciprocal: ${a}/${b} × ${e}/${c} = ${n}/${den}`;
    }
    const answer = frac(n, den);
    return item({
      format: 'type_in',
      prompt: `${a}/${b} ${op} ${c}/${e} =   (answer in lowest terms, as a fraction like 3/4)`,
      answer,
      accepts: [frac(n, den).replace('/', ' / ')],
      rationale: `${work}, which reduces to ${answer}.`,
    });
  },

  decimals(rng, d) {
    const places = d <= 3 ? 1 : d <= 6 ? 2 : 3;
    const scale = Math.pow(10, places);
    const a = rng.int(10, mag(d, 40)) / scale;
    const b = rng.int(10, mag(d, 40)) / scale;
    const op = d <= 4 ? rng.pick(['+', '-']) : rng.pick(['+', '-', '×']);
    let answer;
    if (op === '+') answer = a + b;
    else if (op === '-') answer = a - b;
    else answer = a * b;
    answer = Number(answer.toFixed(places * 2));
    return item({
      format: 'type_in',
      prompt: `${a} ${op} ${b} =`,
      answer: String(answer),
      rationale: op === '×'
        // Count the places the learner can see: 0.3 is printed with one, however
        // many the generator drew it with.
        ? `Multiply as whole numbers, then place the point: ${placesOf(a)} + ${placesOf(b)} = ${placesOf(a) + placesOf(b)} decimal places in total, which gives ${answer}.`
        : `Line up the decimal points and ${op === '+' ? 'add' : 'subtract'}: ${answer}.`,
    });
  },

  percents(rng, d) {
    const kind = d <= 3 ? rng.pick(['of', 'of']) : rng.pick(['of', 'whatPercent', 'change', 'reverse']);
    if (kind === 'of') {
      const p = rng.pick(d <= 3 ? [10, 25, 50, 20, 75] : [5, 12, 15, 18, 35, 45, 62, 85]);
      const whole = rng.int(2, 20) * (d <= 3 ? 10 : 4);
      const answer = round2((p / 100) * whole);
      return item({
        format: 'type_in',
        prompt: `What is ${p}% of ${whole}?`,
        answer: String(answer),
        rationale: `${p}% means ${p}/100, so ${p}/100 × ${whole} = ${answer}.`,
      });
    }
    if (kind === 'whatPercent') {
      const whole = rng.pick([20, 25, 40, 50, 60, 80, 200]);
      const part = (whole / rng.pick([2, 4, 5, 10])) * rng.int(1, 3);
      const answer = round2((part / whole) * 100);
      return item({
        format: 'type_in',
        prompt: `${part} is what percent of ${whole}?   (enter the number only)`,
        answer: String(answer),
        rationale: `part ÷ whole × 100 = ${part} ÷ ${whole} × 100 = ${answer}%.`,
      });
    }
    if (kind === 'reverse') {
      const p = rng.pick([20, 25, 40, 50, 60, 80]);
      const answer = rng.int(4, 30) * 5;
      const part = round2((p / 100) * answer);
      return item({
        format: 'type_in',
        prompt: `${p}% of a number is ${part}. What is the number?`,
        answer: String(answer),
        rationale: `Divide by the rate: ${part} ÷ ${p / 100} = ${answer}.`,
      });
    }
    const from = rng.int(4, 40) * 5;
    const pct = rng.pick([10, 20, 25, 50]);
    const up = rng.bool();
    const to = round2(up ? from * (1 + pct / 100) : from * (1 - pct / 100));
    return item({
      format: 'type_in',
      prompt: `A price ${up ? 'rises' : 'falls'} from $${from} to $${to}. By what percent did it change?   (enter the number only)`,
      answer: String(pct),
      rationale: `Change ÷ original × 100 = ${Math.abs(to - from)} ÷ ${from} × 100 = ${pct}%.`,
    });
  },

  word_problems(rng, d) {
    const kind = rng.pick(['rate', 'money', 'split', 'mixture']);
    if (kind === 'rate') {
      const speed = rng.int(3, 12) * 5;
      const hours = rng.int(2, d <= 4 ? 5 : 9);
      return item({
        format: 'type_in',
        prompt: `A train travels at ${speed} miles per hour for ${hours} hours. How many miles does it cover?`,
        answer: String(speed * hours),
        rationale: `distance = rate × time = ${speed} × ${hours} = ${speed * hours} miles.`,
      });
    }
    if (kind === 'money') {
      const price = rng.int(2, 9) + rng.pick([0, 0.5, 0.25, 0.75]);
      const qty = rng.int(3, d <= 4 ? 8 : 15);
      const paid = Math.ceil(price * qty / 10) * 10 + 10;
      const answer = round2(paid - price * qty);
      return item({
        format: 'type_in',
        prompt: `Notebooks cost ${money(price)} each. You buy ${qty} and pay with ${money(paid)}. How much change do you get?   (enter the number only)`,
        answer: String(answer),
        rationale: `Cost is ${qty} × ${money(price)} = ${money(round2(price * qty))}; ${money(paid)} - ${money(round2(price * qty))} = ${money(answer)}.`,
      });
    }
    if (kind === 'split') {
      const per = rng.int(3, 9);
      const groups = rng.int(4, d <= 4 ? 9 : 20);
      const total = per * groups + rng.int(0, per - 1);
      return item({
        format: 'type_in',
        prompt: `${total} students are put into teams of ${per}. How many students are left over after the full teams are formed?`,
        answer: String(total % per),
        rationale: `${total} ÷ ${per} = ${Math.floor(total / per)} full teams with ${total % per} left over.`,
      });
    }
    const a = rng.int(2, 9);
    const b = rng.int(2, 9);
    const total = rng.int(5, 15) * (a + b);
    const answer = (total / (a + b)) * a;
    return item({
      format: 'type_in',
      prompt: `A mix holds sand and gravel in the ratio ${a}:${b}. In ${total} pounds of the mix, how many pounds are sand?`,
      answer: String(answer),
      rationale: `The mix has ${a + b} parts, so one part is ${total} ÷ ${a + b} = ${total / (a + b)} lb, and sand is ${a} parts: ${answer} lb.`,
    });
  },

  integers(rng, d) {
    const m = mag(d, 9);
    const a = rng.nz(-m, m);
    const b = rng.nz(-m, m);
    const op = d <= 3 ? rng.pick(['+', '-']) : rng.pick(['+', '-', '×', '÷']);
    let answer, why;
    if (op === '+') { answer = a + b; why = 'Same signs add and keep the sign; different signs subtract and take the sign of the larger size.'; }
    else if (op === '-') { answer = a - b; why = `Subtracting is adding the opposite: ${a} + ${par(-b)} = ${a - b}.`; }
    else if (op === '×') { answer = a * b; why = `A negative times a negative is positive; one negative makes the product negative.`; }
    else { answer = a; why = `${par(a * b)} ÷ ${par(b)} = ${a}; the sign rule for division matches multiplication.`; }
    const shown = op === '÷' ? `(${a * b}) ÷ (${b})` : `(${a}) ${op} (${b})`;
    return item({
      format: 'type_in',
      prompt: `${shown} =`,
      answer: String(answer),
      rationale: `${why} The answer is ${answer}.`,
    });
  },

  order_ops(rng, d) {
    const a = rng.int(2, 9), b = rng.int(2, 9), c = rng.int(2, 6), e = rng.int(2, 5);
    if (d <= 4) {
      const answer = a + b * c;
      return item({
        format: 'type_in',
        prompt: `${a} + ${b} × ${c} =`,
        answer: String(answer),
        rationale: `Multiplication comes before addition: ${b} × ${c} = ${b * c}, then ${a} + ${b * c} = ${answer}.`,
      });
    }
    if (d <= 7) {
      const answer = a + Math.pow(c, 2) * e - b;
      return item({
        format: 'type_in',
        prompt: `${a} + ${c}^2 × ${e} - ${b} =`,
        answer: String(answer),
        rationale: `Exponent first: ${c}^2 = ${c * c}. Then ${c * c} × ${e} = ${c * c * e}. Then left to right: ${a} + ${c * c * e} - ${b} = ${answer}.`,
      });
    }
    const inner = a + b;
    const answer = e * Math.pow(inner, 2) - Math.floor((c * 12) / c) + c;
    return item({
      format: 'type_in',
      prompt: `${e}(${a} + ${b})^2 - 12 + ${c} =`,
      answer: String(e * inner * inner - 12 + c),
      rationale: `Parentheses: ${a} + ${b} = ${inner}. Exponent: ${inner}^2 = ${inner * inner}. Multiply: ${e} × ${inner * inner} = ${e * inner * inner}. Then -12 + ${c} gives ${e * inner * inner - 12 + c}.`,
    });
  },

  exponents(rng, d) {
    // Wider than it looks: every branch below draws from these, so the ranges
    // here are what decide how often a learner meets the same power twice.
    const kind = d <= 3 ? rng.pick(['power', 'root']) : d <= 5 ? rng.pick(['power', 'root', 'lawMul'])
      : rng.pick(['lawMul', 'lawDiv', 'negative', 'fractional', 'root', 'power']);
    if (kind === 'power') {
      const b = rng.int(2, d <= 3 ? 9 : 15);
      const p = rng.int(2, d <= 3 ? 3 : 5);
      return item({ format: 'type_in', prompt: `${b}^${p} =`, answer: String(Math.pow(b, p)),
        rationale: `${b}^${p} means ${Array(p).fill(b).join(' × ')} = ${Math.pow(b, p)}.` });
    }
    if (kind === 'root') {
      const r = rng.int(4, 40);
      return item({ format: 'type_in', prompt: `√${r * r} =`, answer: String(r),
        rationale: `${r} × ${r} = ${r * r}, so the square root is ${r}.` });
    }
    if (kind === 'lawMul') {
      const p = rng.int(2, 12), q = rng.int(2, 12);
      const answer = `x^${p + q}`;
      // Five candidates for three places: x^(p·q) is the answer itself when p and
      // q are both 2, and the de-duplication would otherwise leave three choices.
      return item({ format: 'multiple_choice', prompt: `Simplify: x^${p} · x^${q}`,
        choices: choicesFrom(rng, answer, [`x^${p * q}`, xPow(Math.abs(p - q) || p), `2x^${p + q}`, `(2x)^${p + q}`, `x^${p + q + 1}`]),
        answer, rationale: `Multiplying powers of the same base adds the exponents: ${p} + ${q} = ${p + q}.` });
    }
    if (kind === 'lawDiv') {
      const q = rng.int(2, 9), p = q + rng.int(1, 9);
      const answer = xPow(p - q);
      return item({ format: 'multiple_choice', prompt: `Simplify: x^${p} ÷ x^${q}`,
        choices: choicesFrom(rng, answer, [`x^${p + q}`, `x^${p * q}`, `x^${q - p}`]),
        answer, rationale: `Dividing powers of the same base subtracts the exponents: ${p} - ${q} = ${p - q}.` });
    }
    if (kind === 'negative') {
      const b = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const p = rng.int(2, 4);
      const answer = frac(1, Math.pow(b, p));
      return item({ format: 'type_in', prompt: `${b}^-${p} =   (as a fraction)`, answer,
        rationale: `A negative exponent means the reciprocal: ${b}^-${p} = 1/${b}^${p} = ${answer}.` });
    }
    const r = rng.pick([4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 256, 289,
      324, 361, 400, 441, 484, 529, 576, 625]);
    return item({ format: 'type_in', prompt: `${r}^(1/2) =`, answer: String(Math.sqrt(r)),
      rationale: `An exponent of 1/2 is a square root: √${r} = ${Math.sqrt(r)}.` });
  },

  ratios(rng, d) {
    const a = rng.int(2, 12);
    const b = rng.int(2, 12);
    const k = rng.int(2, d <= 4 ? 6 : 15);
    const answer = b * k;
    return item({
      format: 'type_in',
      prompt: `Solve the proportion: ${a}/${b} = ${a * k}/x`,
      answer: String(answer),
      rationale: `${a * k} is ${a} × ${k}, so x must be ${b} × ${k} = ${answer}. (Or cross-multiply: ${a}x = ${b} × ${a * k}.)`,
    });
  },

  linear_eq(rng, d) {
    if (d <= 3) {
      const a = rng.int(2, 9), x = rng.int(1, 12), b = rng.int(1, 20);
      return item({ format: 'type_in', prompt: `Solve for x:  ${a}x + ${b} = ${a * x + b}`, answer: String(x),
        rationale: `Subtract ${b} from both sides: ${a}x = ${a * x}. Divide by ${a}: x = ${x}.` });
    }
    if (d <= 6) {
      const a = rng.int(2, 9), c = rng.int(2, 9), x = rng.nz(-9, 9);
      const b = rng.int(-15, 15);
      if (a === c) return G.linear_eq(rng, d - 1);
      const dd = (a - c) * x + b;
      return item({ format: 'type_in', prompt: `Solve for x:  ${poly([a, b])} = ${poly([c, dd])}`, answer: String(x),
        rationale: `Collect x on the left and numbers on the right: ${signedTerm(a - c, 'x', true)} = ${dd - b}, so x = ${dd - b} ÷ ${par(a - c)} = ${x}.` });
    }
    const den = rng.pick([2, 3, 4]);
    const a = rng.nz(-9, 9), b = rng.nz(-12, 12);
    // ax has to divide by the denominator, or the right side is a rounded
    // decimal and the equation's true solution is not the keyed x: (2x)/3 + 1 =
    // 3.67 solves to x = 4.005, not 4.
    let x = rng.nz(-8, 8);
    for (let tries = 0; (a * x) % den !== 0 && tries < 50; tries++) x = rng.nz(-8, 8);
    if ((a * x) % den !== 0) x = den * (rng.bool() ? 1 : -1);
    const rhs = (a * x) / den + b;
    return item({
      format: 'type_in',
      prompt: `Solve for x:  (${signedTerm(a, 'x', true)})/${den}${signedTerm(b, '')} = ${rhs}`,
      answer: String(x),
      rationale: `${b > 0 ? `Subtract ${b}` : `Add ${-b}`}: (${signedTerm(a, 'x', true)})/${den} = ${rhs - b}. Multiply by ${den}: ${signedTerm(a, 'x', true)} = ${(rhs - b) * den}. Divide by ${a}: x = ${x}.`,
    });
  },

  inequalities(rng, d) {
    const a = rng.nz(-8, 8);
    const x = rng.nz(-9, 9);
    const b = rng.int(-12, 12);
    const rhs = a * x + b;
    const flip = a < 0;
    const answer = `x ${flip ? '<' : '>'} ${x}`;
    return item({
      format: 'multiple_choice',
      prompt: `Solve:  ${poly([a, b])} > ${rhs}`,
      // Spares at the end, because rhs can equal x (x > 2 from 2x - 2 > 2) and
      // then the third candidate repeats the first.
      choices: choicesFrom(rng, answer, [`x ${flip ? '>' : '<'} ${x}`, `x ${flip ? '<' : '>'} ${-x}`, `x ${flip ? '>' : '<'} ${rhs}`,
        `x ${flip ? '>' : '<'} ${-x}`, `x ${flip ? '<' : '>'} ${x + 1}`]),
      answer,
      rationale: `${b > 0 ? `Subtract ${b} from both sides, then` : b < 0 ? `Add ${-b} to both sides, then` : 'Then'}`
        + `${flip
          ? ` divide by the negative coefficient ${a}, which reverses the inequality: ${answer}.`
          : ` divide by ${a}: ${answer}.`}`,
    });
  },

  slope_lines(rng, d) {
    const kind = d <= 4 ? 'twoPoints' : rng.pick(['twoPoints', 'fromEq', 'evalLine', 'parallel']);
    const m = rng.nz(-6, 6), b = rng.int(-9, 9);
    if (kind === 'twoPoints') {
      const x1 = rng.int(-6, 6);
      let x2 = rng.nz(-6, 6);
      if (x2 === x1) x2 = x1 + 1;
      const y1 = m * x1 + b, y2 = m * x2 + b;
      return item({ format: 'type_in', prompt: `What is the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2})?`, answer: String(m),
        rationale: `slope = (y₂ - y₁)/(x₂ - x₁) = (${y2} - ${par(y1)})/(${x2} - ${par(x1)}) = ${y2 - y1}/${x2 - x1} = ${m}.` });
    }
    if (kind === 'fromEq') {
      // Standard form Ax + By = C, where reading the slope off means rearranging.
      const A = rng.nz(-6, 6), B = rng.nz(-6, 6), C = rng.int(-12, 12);
      const answer = frac(-A, B);
      return item({
        format: 'type_in',
        prompt: `What is the slope of the line ${signedTerm(A, 'x', true)}${signedTerm(B, 'y')} = ${C}?   (a fraction like -2/3, or an integer)`,
        answer,
        rationale: `Solve for y: ${signedTerm(B, 'y', true)} = ${signedTerm(-A, 'x', true)}${C ? signedTerm(C, '') : ''}, so y = (${frac(-A, B)})x${C ? ` + (${frac(C, B)})` : ''}. The slope is the x coefficient, ${answer}.`,
      });
    }
    if (kind === 'evalLine') {
      const x = rng.int(-8, 8);
      return item({ format: 'type_in', prompt: `For the line y = ${poly([m, b])}, what is y when x = ${x}?`, answer: String(m * x + b),
        rationale: `Substitute: y = ${m}(${x})${signedTerm(b, '')} = ${m * x}${signedTerm(b, '')} = ${m * x + b}.` });
    }
    const answer = String(m);
    return item({
      format: 'multiple_choice',
      prompt: `A line is parallel to y = ${poly([m, b])}. What is its slope?`,
      // Spare candidates, because the obvious ones collide: when m is 1 the
      // perpendicular slope and -m are both "-1", and b can equal m or -m.
      choices: choicesFrom(rng, answer, [frac(-1, m), String(-m), String(b), frac(1, m), String(m + 1), String(m - 1)]),
      answer,
      rationale: `Parallel lines share a slope, so the slope is ${m}. (The perpendicular slope would be ${frac(-1, m)}.)`,
    });
  },

  systems(rng, d) {
    const x = rng.nz(-7, 7), y = rng.nz(-7, 7);
    const a = rng.nz(-5, 5), b = rng.nz(-5, 5), c = rng.nz(-5, 5), e = rng.nz(-5, 5);
    if (a * e - b * c === 0) return G.systems(rng, d);
    const r1 = a * x + b * y, r2 = c * x + e * y;
    const askY = d >= 6 && rng.bool();
    return item({
      format: 'type_in',
      prompt: `Solve the system and enter ${askY ? 'y' : 'x'}:\n  ${signedTerm(a, 'x', true)}${signedTerm(b, 'y')} = ${r1}\n  ${signedTerm(c, 'x', true)}${signedTerm(e, 'y')} = ${r2}`,
      answer: String(askY ? y : x),
      rationale: `Elimination gives x = ${x} and y = ${y}; check both equations: ${a}(${x}) ${b < 0 ? '-' : '+'} ${Math.abs(b)}(${y}) = ${r1} and ${c}(${x}) ${e < 0 ? '-' : '+'} ${Math.abs(e)}(${y}) = ${r2}.`,
    });
  },

  quadratics(rng, d) {
    const r1 = rng.nz(-9, 9);
    let r2 = rng.nz(-9, 9);
    if (d <= 4) r2 = Math.abs(r2);
    // Two different roots: "the larger solution" of a repeated root is no
    // question, and the factoring distractors below collapse onto one another.
    for (let tries = 0; r2 === r1 && tries < 20; tries++) r2 = d <= 4 ? Math.abs(rng.nz(-9, 9)) : rng.nz(-9, 9);
    if (r2 === r1) r2 = r1 + 1 === 0 ? r1 + 2 : r1 + 1;
    const b = -(r1 + r2), c = r1 * r2;
    if (d >= 7 && rng.bool(0.5)) {
      const factor = (r) => `(x ${r < 0 ? '+' : '-'} ${Math.abs(r)})`;
      const answer = `${factor(r1)}${factor(r2)}`;
      return item({
        format: 'multiple_choice',
        prompt: `Factor:  ${poly([1, b, c])}`,
        // Every candidate is a product that is not the trinomial: both signs
        // wrong, one sign wrong each way, and one root off by one. When the roots
        // are opposites, "both signs wrong" is the answer with its factors swapped,
        // so that one is dropped rather than offered as a second key.
        choices: choicesFrom(rng, answer, [
          `${factor(-r1)}${factor(-r2)}`,
          `${factor(r1)}${factor(-r2)}`,
          `${factor(-r1)}${factor(r2)}`,
          `${factor(r1 + Math.sign(r1))}${factor(r2)}`,
        ].filter((s) => s !== `${factor(r2)}${factor(r1)}`)),
        answer,
        rationale: `Two numbers multiplying to ${c} and adding to ${b}: ${r1} and ${r2}. So the factors are ${answer}.`,
      });
    }
    const larger = Math.max(r1, r2);
    return item({
      format: 'type_in',
      prompt: `Solve ${poly([1, b, c])} = 0 and enter the larger solution.`,
      answer: String(larger),
      rationale: `Factor into (x - ${r1})(x - ${r2}) = 0, so x = ${r1} or x = ${r2}. The larger is ${larger}.`
        .replace(/- -/g, '+ '),
    });
  },

  geometry_area(rng, d) {
    const kind = d <= 3 ? rng.pick(['rect', 'tri']) : d <= 6 ? rng.pick(['rect', 'tri', 'circle', 'box']) : rng.pick(['circle', 'box', 'cylinder', 'composite']);
    if (kind === 'rect') {
      const w = rng.int(3, 20), h = rng.int(3, 20);
      const perim = rng.bool();
      return item({ format: 'type_in',
        prompt: `A rectangle is ${w} by ${h}. What is its ${perim ? 'perimeter' : 'area'}?`,
        answer: String(perim ? 2 * (w + h) : w * h),
        rationale: perim ? `Perimeter = 2(w + h) = 2(${w} + ${h}) = ${2 * (w + h)}.` : `Area = w × h = ${w} × ${h} = ${w * h}.` });
    }
    if (kind === 'tri') {
      const b = rng.int(2, 20) * 2, h = rng.int(3, 20);
      return item({ format: 'type_in', prompt: `A triangle has base ${b} and height ${h}. What is its area?`,
        answer: String((b * h) / 2), rationale: `Area = ½bh = ½ × ${b} × ${h} = ${(b * h) / 2}.` });
    }
    if (kind === 'circle') {
      const r = rng.int(2, 12);
      const area = rng.bool();
      const val = round2(area ? Math.PI * r * r : 2 * Math.PI * r);
      return item({ format: 'type_in',
        prompt: `A circle has radius ${r}. What is its ${area ? 'area' : 'circumference'}?   (use π ≈ 3.14159, round to 2 decimals)`,
        answer: String(val),
        rationale: area ? `Area = πr² = π × ${r}² = ${val}.` : `Circumference = 2πr = 2π × ${r} = ${val}.` });
    }
    if (kind === 'box') {
      const a = rng.int(2, 12), b = rng.int(2, 12), c = rng.int(2, 12);
      return item({ format: 'type_in', prompt: `A rectangular box is ${a} by ${b} by ${c}. What is its volume?`,
        answer: String(a * b * c), rationale: `Volume = lwh = ${a} × ${b} × ${c} = ${a * b * c}.` });
    }
    if (kind === 'cylinder') {
      const r = rng.int(2, 8), h = rng.int(3, 15);
      const val = round2(Math.PI * r * r * h);
      return item({ format: 'type_in', prompt: `A cylinder has radius ${r} and height ${h}. What is its volume?   (π ≈ 3.14159, 2 decimals)`,
        answer: String(val), rationale: `Volume = πr²h = π × ${r}² × ${h} = ${val}.` });
    }
    const s = rng.int(4, 14), r = Math.floor(s / 2);
    const val = round2(s * s - Math.PI * r * r);
    return item({ format: 'type_in',
      prompt: `A circle of radius ${r} is cut out of a square of side ${s}. What area is left?   (π ≈ 3.14159, 2 decimals)`,
      answer: String(val),
      rationale: `Square minus circle: ${s}² - π(${r})² = ${s * s} - ${round2(Math.PI * r * r)} = ${val}.` });
  },

  polynomials(rng, d) {
    const kind = d <= 4 ? 'add' : rng.pick(['add', 'expand', 'expand', 'degree']);
    if (kind === 'add') {
      const a = [rng.nz(-6, 6), rng.nz(-8, 8), rng.nz(-9, 9)];
      const b = [rng.nz(-6, 6), rng.nz(-8, 8), rng.nz(-9, 9)];
      const sum = poly([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
      return item({ format: 'multiple_choice',
        prompt: `Simplify: (${poly(a)}) + (${poly(b)})`,
        choices: choicesFrom(rng, sum, [
          poly([a[0] - b[0], a[1] - b[1], a[2] - b[2]]),
          poly([a[0] + b[0], a[1] - b[1], a[2] + b[2]]),
          poly([a[0] * b[0], a[1] + b[1], a[2] + b[2]]),
          // Spares for when one above lands on the answer (2 × 2 = 2 + 2).
          poly([a[0] + b[0], a[1] + b[1], a[2] - b[2]]),
          poly([a[0] + b[0], a[1] + b[1] + a[2] + b[2], 0]),
        ]),
        answer: sum, rationale: `Add like terms only: x² terms ${a[0]} + ${par(b[0])} = ${a[0] + b[0]}, x terms ${a[1]} + ${par(b[1])} = ${a[1] + b[1]}, constants ${a[2]} + ${par(b[2])} = ${a[2] + b[2]}, which gives ${sum}.` });
    }
    if (kind === 'expand') {
      const p = rng.nz(-7, 7), q = rng.nz(-7, 7);
      const answer = poly([1, p + q, p * q]);
      return item({ format: 'multiple_choice',
        prompt: `Expand: (x${signedTerm(p, '')})(x${signedTerm(q, '')})`,
        choices: choicesFrom(rng, answer, [poly([1, p * q, p + q]), poly([1, p + q, p + q]), poly([1, p - q, p * q]),
          poly([1, p + q, -(p * q)]), poly([1, -(p + q), p * q])]),
        answer, rationale: `FOIL: x² + (${p} + ${par(q)})x + (${p})(${q}) = ${answer}.` });
    }
    const degs = rng.sample([2, 3, 4, 5], 2);
    const answer = String(degs[0] + degs[1]);
    return item({ format: 'multiple_choice',
      prompt: `What is the degree of the product of a degree-${degs[0]} polynomial and a degree-${degs[1]} polynomial?`,
      choices: choicesFrom(rng, answer, [String(Math.max(...degs)), String(degs[0] * degs[1]), String(Math.abs(degs[0] - degs[1]))]),
      answer, rationale: `Degrees add when polynomials multiply: ${degs[0]} + ${degs[1]} = ${answer}.` });
  },

  functions(rng, d) {
    const a = rng.nz(-5, 5), b = rng.nz(-8, 8), c = rng.int(-9, 9);
    const x = rng.int(-6, 6);
    if (d <= 5) {
      const val = a * x + b;
      return item({ format: 'type_in', prompt: `If f(x) = ${poly([a, b])}, what is f(${x})?`, answer: String(val),
        rationale: `Substitute ${x}: ${a}(${x})${signedTerm(b, '')} = ${a * x}${signedTerm(b, '')} = ${val}.` });
    }
    if (d <= 8) {
      const val = a * x * x + b * x + c;
      return item({ format: 'type_in', prompt: `If f(x) = ${poly([a, b, c])}, what is f(${x})?`, answer: String(val),
        rationale: `${a}(${x})² ${b < 0 ? '-' : '+'} ${Math.abs(b)}(${x}) + ${par(c)} = ${a * x * x} + ${par(b * x)} + ${par(c)} = ${val}.` });
    }
    const g0 = a * x + b;
    const val = 2 * g0 + c;
    return item({ format: 'type_in',
      prompt: `If f(x) = ${poly([2, c])} and g(x) = ${poly([a, b])}, what is f(g(${x}))?`,
      answer: String(val),
      rationale: `g(${x}) = ${g0}. Then f(${g0}) = 2(${g0}) + ${par(c)} = ${val}.` });
  },

  logs(rng, d) {
    const base = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const p = rng.int(2, d <= 5 ? 7 : 11);
    if (d <= 5) {
      return item({ format: 'type_in', prompt: `log${base}(${Math.pow(base, p)}) =`, answer: String(p),
        rationale: `${base}^${p} = ${Math.pow(base, p)}, so the logarithm is ${p}.` });
    }
    const kind = rng.pick(['solve', 'rule', 'ln']);
    if (kind === 'solve') {
      return item({ format: 'type_in', prompt: `Solve for x:  ${base}^x = ${Math.pow(base, p)}`, answer: String(p),
        rationale: `Both sides as powers of ${base}: x = ${p}.` });
    }
    if (kind === 'ln') {
      return item({ format: 'type_in', prompt: `ln(e^${p}) =`, answer: String(p),
        rationale: `ln and e are inverses, so ln(e^${p}) = ${p}.` });
    }
    // The log rules, asked over several expressions rather than one.
    const k = rng.int(2, 9);
    const rules = [
      { q: 'log(ab)', a: 'log(a) + log(b)', wrong: ['log(a) · log(b)', 'log(a) - log(b)', 'log(a)^log(b)'],
        why: 'A product inside a logarithm becomes a sum of logarithms.' },
      { q: 'log(a/b)', a: 'log(a) - log(b)', wrong: ['log(a) / log(b)', 'log(a) + log(b)', 'log(a - b)'],
        why: 'A quotient inside a logarithm becomes a difference of logarithms.' },
      { q: `log(a^${k})`, a: `${k}·log(a)`, wrong: [`log(a)^${k}`, `log(${k}a)`, `${k} + log(a)`],
        why: `An exponent inside a logarithm comes out in front: log(a^${k}) = ${k}·log(a).` },
      { q: `log${base}(${base}), evaluated`, a: '1', wrong: ['0', String(base), 'no value'],
        why: `A logarithm of its own base is 1, because ${base}^1 = ${base}.` },
      { q: `log${base}(1), evaluated`, a: '0', wrong: ['1', String(base), 'no value'],
        why: `Anything to the power 0 is 1, so the logarithm of 1 is 0 in every base.` },
    ];
    const rule = rng.pick(rules);
    return item({ format: 'multiple_choice', prompt: `Which expression equals ${rule.q}?`,
      choices: choicesFrom(rng, rule.a, rule.wrong),
      answer: rule.a, rationale: rule.why });
  },

  sequences(rng, d) {
    const geometric = d >= 6 && rng.bool();
    const a1 = rng.int(1, 12);
    if (!geometric) {
      const step = rng.nz(-9, 9);
      const n = rng.int(5, d <= 4 ? 12 : 40);
      const nth = a1 + (n - 1) * step;
      if (d >= 7 && rng.bool(0.4)) {
        const sum = (n * (a1 + nth)) / 2;
        return item({ format: 'type_in',
          // A negative step decreases: "increases by -3 each term" is not English.
          prompt: `An arithmetic sequence starts at ${a1} and ${step < 0 ? 'decreases' : 'increases'} by ${Math.abs(step)} each term. What is the sum of the first ${n} terms?`,
          answer: String(sum),
          rationale: `The ${n}th term is ${a1} + (${n} - 1)(${step}) = ${nth}. Sum = n(first + last)/2 = ${n}(${a1} + ${par(nth)})/2 = ${sum}.` });
      }
      return item({ format: 'type_in',
        prompt: `An arithmetic sequence starts at ${a1} with common difference ${step}. What is term ${n}?`,
        answer: String(nth),
        rationale: `aₙ = a₁ + (n-1)d = ${a1} + ${n - 1}(${step}) = ${nth}.` });
    }
    const r = rng.pick([2, 3, -2]);
    const n = rng.int(4, 8);
    const nth = a1 * Math.pow(r, n - 1);
    return item({ format: 'type_in',
      prompt: `A geometric sequence starts at ${a1} with common ratio ${r}. What is term ${n}?`,
      answer: String(nth),
      rationale: `aₙ = a₁·r^(n-1) = ${a1} × ${r}^${n - 1} = ${nth}.` });
  },

  rational_expr(rng, d) {
    const r = rng.int(2, 25);
    const kind = d <= 6 ? rng.pick(['simplify', 'squareDiff', 'trinomial'])
      : rng.pick(['simplify', 'restrict', 'squareDiff', 'trinomial']);
    if (kind === 'squareDiff') {
      // (x² - r²)/(x - r) cancels the other factor, which catches anyone who
      // memorised the shape instead of the reason.
      const answer = `x${signedTerm(r, '')}`;
      return item({ format: 'multiple_choice',
        prompt: `Simplify:  (x² - ${r * r}) / (x - ${r})`,
        choices: choicesFrom(rng, answer, [`x - ${r}`, `x² + ${r}`, `1/(x - ${r})`]),
        answer,
        rationale: `x² - ${r * r} factors as (x - ${r})(x + ${r}); the (x - ${r}) cancels, leaving x + ${r} (with x ≠ ${r}).` });
    }
    if (kind === 'trinomial') {
      const a = rng.int(2, 14);
      let b = rng.int(2, 14);
      if (b === a) b = a + 1;
      const answer = `x${signedTerm(-b, '')}`;
      return item({ format: 'multiple_choice',
        prompt: `Simplify:  (x²${signedTerm(-(a + b), 'x')} + ${a * b}) / (x - ${a})`,
        choices: choicesFrom(rng, answer, [`x${signedTerm(b, '')}`, `x${signedTerm(-a, '')}`, `x${signedTerm(-(a + b), '')}`]),
        answer,
        rationale: `The numerator factors as (x - ${a})(x - ${b}) because ${a} + ${b} = ${a + b} and ${a} × ${b} = ${a * b}; cancelling (x - ${a}) leaves x - ${b} (with x ≠ ${a}).` });
    }
    if (kind === 'simplify') {
      const answer = `x${signedTerm(-r, '')}`;
      return item({ format: 'multiple_choice',
        prompt: `Simplify:  (x² - ${r * r}) / (x + ${r})`,
        choices: choicesFrom(rng, answer, [`x + ${r}`, `x² - ${r}`, `1/(x + ${r})`]),
        answer,
        rationale: `x² - ${r * r} factors as (x - ${r})(x + ${r}); the (x + ${r}) cancels, leaving x - ${r} (with x ≠ -${r}).` });
    }
    const a = rng.int(2, 25);
    // The question asks where it is NOT defined, so the answer names those
    // values. "x ≠ 5 and x ≠ -5" is the domain restriction — the opposite set.
    const answer = `x = ${a} or x = -${a}`;
    return item({ format: 'multiple_choice',
      prompt: `For which values is  1 / (x² - ${a * a})  not defined?`,
      choices: choicesFrom(rng, answer, [`x = ${a} only`, `x = ${a * a} or x = -${a * a}`, `x = 0`]),
      answer,
      rationale: `The denominator is zero when x² = ${a * a}, which happens at x = ${a} and x = -${a}.` });
  },

  complex_nums(rng, d) {
    const a = rng.nz(-6, 6), b = rng.nz(-6, 6), c = rng.nz(-6, 6), e = rng.nz(-6, 6);
    const kind = d <= 5 ? 'add' : rng.pick(['add', 'mul', 'power']);
    if (kind === 'add') {
      const answer = `${a + c}${signedTerm(b + e, 'i')}`;
      return item({ format: 'multiple_choice',
        prompt: `Simplify: (${a}${signedTerm(b, 'i')}) + (${c}${signedTerm(e, 'i')})`,
        choices: choicesFrom(rng, answer, [`${a + c}${signedTerm(b - e, 'i')}`, `${a * c}${signedTerm(b * e, 'i')}`, `${a - c}${signedTerm(b + e, 'i')}`]),
        answer, rationale: `Add real parts and imaginary parts separately: (${a} + ${par(c)}) + (${b} + ${par(e)})i = ${answer}.` });
    }
    if (kind === 'mul') {
      const real = a * c - b * e;
      const imag = a * e + b * c;
      const answer = `${real}${signedTerm(imag, 'i')}`;
      return item({ format: 'multiple_choice',
        prompt: `Multiply: (${a}${signedTerm(b, 'i')})(${c}${signedTerm(e, 'i')})`,
        // Spares last: when the imaginary part is 0, "real − imag·i" is the answer.
        choices: choicesFrom(rng, answer, [`${a * c}${signedTerm(b * e, 'i')}`, `${a * c + b * e}${signedTerm(imag, 'i')}`, `${real}${signedTerm(-imag, 'i')}`,
          `${-real}${signedTerm(imag, 'i')}`, `${imag}${signedTerm(real, 'i')}`, `${real + 1}${signedTerm(imag, 'i')}`]),
        answer, rationale: `FOIL, then use i² = -1: real part ${par(a)}·${par(c)} - ${par(b)}·${par(e)} = ${real}; imaginary part ${par(a)}·${par(e)} + ${par(b)}·${par(c)} = ${imag}.` });
    }
    const p = rng.int(5, 40);
    const cycle = ['1', 'i', '-1', '-i'][p % 4];
    return item({ format: 'type_in', prompt: `i^${p} =`, answer: cycle,
      rationale: `Powers of i repeat every 4. ${p} mod 4 = ${p % 4}, so i^${p} = ${cycle}.` });
  },

  trig_basics(rng, d) {
    // Primitive triples, scaled. A 3-4-5 and a 24-32-40 triangle are the same
    // idea and different arithmetic, which is exactly what practice needs.
    const primitives = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29],
      [9, 40, 41], [12, 35, 37], [11, 60, 61], [28, 45, 53], [33, 56, 65], [16, 63, 65],
      [48, 55, 73], [13, 84, 85], [36, 77, 85], [39, 80, 89], [65, 72, 97]];
    const scale = rng.int(1, d <= 4 ? 4 : 8);
    const triples = primitives.map(([x, y, z]) => [x * scale, y * scale, z * scale]);
    const [o, a, h] = rng.pick(triples);
    const kind = d <= 5 ? rng.pick(['sin', 'pyth']) : rng.pick(['sin', 'cos', 'tan', 'special']);
    if (kind === 'pyth') {
      return item({ format: 'type_in', prompt: `A right triangle has legs ${o} and ${a}. How long is the hypotenuse?`,
        answer: String(h), rationale: `${o}² + ${a}² = ${o * o + a * a} = ${h}², so the hypotenuse is ${h}.` });
    }
    if (kind === 'special') {
      const specials = [
        { q: 'sin(30°)', a: '1/2', why: 'In a 30-60-90 triangle the side opposite 30° is half the hypotenuse.' },
        { q: 'cos(60°)', a: '1/2', why: 'cos(60°) = sin(30°), and that side is half the hypotenuse.' },
        { q: 'sin(60°)', a: '√3/2', why: 'The long leg of a 30-60-90 triangle is √3/2 of the hypotenuse.' },
        { q: 'cos(30°)', a: '√3/2', why: 'cos(30°) = sin(60°) = √3/2.' },
        { q: 'sin(45°)', a: '√2/2', why: 'A 45-45-90 triangle has equal legs, giving √2/2.' },
        { q: 'cos(45°)', a: '√2/2', why: 'Both legs are equal, so sine and cosine agree at 45°.' },
        { q: 'tan(45°)', a: '1', why: 'The legs are equal, so opposite over adjacent is 1.' },
        { q: 'tan(30°)', a: '√3/3', why: 'tan(30°) = (1/2) ÷ (√3/2) = 1/√3 = √3/3.' },
        { q: 'sin(0°)', a: '0', why: 'At 0° the opposite side has no length.' },
        { q: 'cos(0°)', a: '1', why: 'At 0° the adjacent side is the whole hypotenuse.' },
        { q: 'sin(90°)', a: '1', why: 'At 90° the opposite side is the hypotenuse.' },
        { q: 'cos(90°)', a: '0', why: 'At 90° the adjacent side has no length.' },
      ];
      const pick = rng.pick(specials);
      return item({ format: 'multiple_choice', prompt: `What is ${pick.q}?`,
        choices: choicesFrom(rng, pick.a, ['1/2', '√3/2', '√2/2', '1', '0', '√3/3'].filter((x) => x !== pick.a).slice(0, 3)),
        answer: pick.a, rationale: pick.why });
    }
    const map = { sin: [o, h, 'opposite/hypotenuse'], cos: [a, h, 'adjacent/hypotenuse'], tan: [o, a, 'opposite/adjacent'] };
    const [num, den, words] = map[kind];
    return item({ format: 'type_in',
      prompt: `In a right triangle, the side opposite angle A is ${o}, the adjacent side is ${a}, and the hypotenuse is ${h}. What is ${kind}(A)?   (as a fraction in lowest terms)`,
      answer: frac(num, den),
      rationale: `${kind} is ${words} = ${num}/${den} = ${frac(num, den)}.` });
  },

  act_data(rng, d) {
    const kind = rng.pick(['unitRate', 'table', 'average']);
    if (kind === 'unitRate') {
      const items = rng.int(3, 12);
      const each = rng.int(2, 9);
      const total = items * each;
      const want = rng.int(2, 20);
      return item({ format: 'type_in',
        prompt: `${items} identical parts cost $${total}. At the same rate, what do ${want} parts cost?   (enter the number only)`,
        answer: String(want * each),
        rationale: `One part costs $${total} ÷ ${items} = $${each}, so ${want} parts cost ${want} × $${each} = $${want * each}.` });
    }
    if (kind === 'table') {
      const years = [2019, 2020, 2021, 2022];
      let vals = years.map(() => rng.int(10, 90));
      // A tie for the largest makes "in which year were the most sold" a
      // question with two right answers and one key.
      while (vals.filter((v) => v === Math.max(...vals)).length > 1) vals = years.map(() => rng.int(10, 90));
      const maxIdx = vals.indexOf(Math.max(...vals));
      const answer = String(years[maxIdx]);
      const table = years.map((y, i) => `${y}: ${vals[i]}`).join('   ');
      return item({ format: 'multiple_choice',
        prompt: `Units sold by year\n${table}\n\nIn which year were the most units sold?`,
        choices: rng.shuffle(years.map(String)),
        answer,
        rationale: `${vals[maxIdx]} in ${years[maxIdx]} is the largest value in the table.` });
    }
    const n = rng.int(4, 6);
    const nums = Array.from({ length: n }, () => rng.int(2, 20));
    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = round2(sum / n);
    return item({ format: 'type_in', prompt: `What is the average of ${nums.join(', ')}?   (2 decimals if needed)`,
      answer: String(mean), rationale: `Sum ${sum} ÷ ${n} values = ${mean}.` });
  },
};

// The skills that fill the early and late ends of the track (grade-fit,
// 2026-10-24): counting to topology. Same contract; see math-grade-items.js.
Object.assign(G, require('./math-grade-items'));

// A skill with shapes in it alternates between the arithmetic and a different
// task on the same arithmetic, so a sitting is not a hundred of the first. The
// arithmetic is the default; a shape is used while one this skill has not
// served yet is still available, and after that the arithmetic takes over,
// because repeating arithmetic is the point of the skill rather than a failure
// of it.
for (const [skill, shapes] of Object.entries(SHAPES)) {
  const base = G[skill];
  if (!base) continue;
  G[skill] = withShapes(base, shapes, skill);
}

// A school grade is served the tier its standard covers (standards check,
// 2026-10-24; content/math-grade-items.js SCHOOL). Only a caller that passes
// ctx.school (config/grade-skills.js fitEntry) reaches it; the ACT, the upper
// grades and anything else get the skill's own generator, unchanged.
const { SCHOOL } = require('./math-grade-items');
for (const [skill, tier] of Object.entries(SCHOOL)) {
  const full = G[skill];
  if (!full) continue;
  G[skill] = (rng, d, ctx = {}) => {
    if (Number.isFinite(ctx.school)) {
      const served = tier(rng, d, ctx.school, ctx, full);
      if (served) return served;
    }
    return full(rng, d, ctx);
  };
}

module.exports = G;
