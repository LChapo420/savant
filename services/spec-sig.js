/**
 * Signatures and drift for learner adaptation specs (services/block-adapt.js specFor).
 *
 * A level written for a learner records the spec it was written to as a signature:
 * every numeric leaf by dotted path, kept to three significant figures, so two
 * specs can be compared later without storing the whole profile on the level.
 *
 * The spec mixes scales (shares from 0 to 1, small counts, word budgets in the
 * hundreds), so drift is measured as relative change per value, not as a fixed
 * step: a value counts as moved a lot at 25% or more (BLOCK_RETAILOR_BIG), a
 * little at 10% or more (BLOCK_RETAILOR_SMALL). A level is re-tailored when the
 * spec has drifted enough (BLOCK_RETAILOR_DRIFT, 2): two values that moved a lot,
 * or one and five that moved a little.
 */
function round3(v) {
  return v === 0 ? 0 : Number(v.toPrecision(3));
}

function specSig(spec) {
  if (!spec || typeof spec !== 'object') return {};
  const entries = [];
  (function walk(value, parts) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      entries.push([parts.join('.'), round3(value)]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, parts.concat(String(index))));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) walk(item, parts.concat(key));
  }(spec, []));
  // The lists the numbers cannot carry (version 1 of the set keys): which interests are used, which domains are avoided, and ESL support.
  // A signature written before this has no `sets.v` key, so its sets are never compared (no mass re-tailoring of levels already stored).
  const slug = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  const it = spec.interests || {};
  entries.push(['sets.v', 1]);
  for (const d of (it.exampleDomains || []).slice(0, 8)) entries.push([`sets.use.${slug(d)}`, 1]);
  for (const d of (it.avoidDomains || []).slice(0, 12)) entries.push([`sets.avoid.${slug(d)}`, 1]);
  if (spec.language && spec.language.eslSupport) entries.push(['sets.esl', 1]);
  return Object.fromEntries(entries);
}

/** How far a value moved, as a share of its size (0 when both are 0). */
function relativeChange(a, b) {
  const size = Math.max(Math.abs(a), Math.abs(b));
  return size === 0 ? 0 : Math.abs(b - a) / size;
}

/** How much two signatures have moved: values that moved a lot, plus one for every five that moved a little. Values only one side has are skipped. */
function specDrift(oldSig, newSig) {
  const before = oldSig && typeof oldSig === 'object' ? oldSig : {};
  const after = newSig && typeof newSig === 'object' ? newSig : {};
  const bigAt = Number(process.env.BLOCK_RETAILOR_BIG || 0.25);
  const smallAt = Number(process.env.BLOCK_RETAILOR_SMALL || 0.1);
  let big = 0;
  let small = 0;
  for (const key of Object.keys(before)) {
    if (!Object.prototype.hasOwnProperty.call(after, key)) continue;
    const a = before[key];
    const b = after[key];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const change = relativeChange(a, b);
    if (change >= bigAt) big++;
    else if (change >= smallAt) small++;
  }
  // Sets (interests used, domains avoided, ESL): a new thing to avoid is a hard constraint and moves a level alone; any other change of set is one big move.
  if (before['sets.v'] === 1 && after['sets.v'] === 1) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)].filter((k) => k.startsWith('sets.') && k !== 'sets.v'));
    for (const k of keys) {
      const had = Object.prototype.hasOwnProperty.call(before, k);
      const has = Object.prototype.hasOwnProperty.call(after, k);
      if (had === has) continue;
      big += k.startsWith('sets.avoid.') && has ? Math.max(1, Number(process.env.BLOCK_RETAILOR_DRIFT || 2)) : 1;
    }
  }
  return big + Math.floor(small / 5);
}

/** Has the learner's spec moved enough since the level was written to re-tailor it? */
function driftedEnough(oldSig, newSig) {
  return specDrift(oldSig, newSig) >= Number(process.env.BLOCK_RETAILOR_DRIFT || 2);
}

module.exports = { specSig, specDrift, driftedEnough };
