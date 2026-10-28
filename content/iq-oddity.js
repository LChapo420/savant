/**
 * Is there exactly one odd one out?
 *
 * "Which number does not belong: 25, 16, 72, 4?" was built as "three squares
 * and a non-square", so it keyed 72 — but 25 is the only odd number and 4 the
 * only one-digit number, and a learner who said either was marked wrong for a
 * reason as good as the key's. A set is only a fair question when the intended
 * number is the *only* one that lacks a property the other three share, under
 * every property a learner could reasonably name. The generators draw a set,
 * ask this, and draw again when the answer is no.
 *
 * scripts/iq-template-audit.js checks the same thing independently, from the
 * rendered prompt.
 */
function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let k = 2; k * k <= n; k++) if (n % k === 0) return false;
  return true;
}

/** Properties of a whole number that a learner could name as "the rule". */
const TRAITS = [
  (n) => n % 2 === 0,
  (n) => n % 2 !== 0,
  isPrime,
  (n) => n > 3 && !isPrime(n),
  (n) => Number.isInteger(Math.sqrt(n)),
  (n) => Math.round(Math.cbrt(n)) ** 3 === n,
  // The other way round as well: "16 is the only perfect square" is as good a
  // reason to pick 16 as any shared property is to pick the odd one.
  (n) => !Number.isInteger(Math.sqrt(n)),
  (n) => Math.round(Math.cbrt(n)) ** 3 !== n,
  ...[3, 4, 5, 6, 7, 8, 9, 10].map((k) => (n) => n % k === 0),
  (n) => n < 10,
  (n) => n >= 10 && n < 100,
  (n) => n >= 100 && n < 1000,
];

/** The numbers that the other three outvote on some property. */
function oddOnesOut(nums) {
  return nums.filter((x, i) => {
    const others = nums.filter((_, j) => j !== i);
    return TRAITS.some((t) => !t(x) && others.every(t));
  });
}

/** True when `odd` is the one and only odd one out of `nums`. */
function onlyOdd(nums, odd) {
  if (new Set(nums).size !== nums.length) return false;
  const found = oddOnesOut(nums);
  return found.length === 1 && found[0] === odd;
}

module.exports = { oddOnesOut, onlyOdd, isPrime };
