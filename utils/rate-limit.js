/**
 * In-memory rate limiting, keyed by bucket name plus the signed-in account, or the address for someone not signed in.
 *
 * Counting by address alone meant a classroom, a school or a phone network sharing one address also shared one allowance: thirty
 * learners ran out of a limit meant for one (beta load test, Nov 2026). RATE_LIMIT_BY=ip goes back to that.
 *
 * In memory is the right scope for one box: it costs nothing, needs no service,
 * and loses only its counters on restart. When the app runs on more than one
 * instance this moves to a shared store — until then, per-instance counters are
 * honest about what they protect.
 */
const buckets = new Map();

function clientKey(req) {
  if (req.user && req.user.id && process.env.RATE_LIMIT_BY !== 'ip') return `u${req.user.id}`;
  // req.ip already honors the configured proxy trust, which is why the app never
  // reads x-forwarded-for directly.
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * @param {string} name     bucket name, e.g. 'login'
 * @param {number} max      allowed requests per window
 * @param {number} windowMs window length
 * @param {object} [opts]
 * @param {Function} [opts.by]  req -> string: count by this instead (a sign-in counts by the account it names as well as the address)
 */
function limit(name, max, windowMs, opts = {}) {
  return (req, res, next) => {
    const key = `${name}:${opts.by ? opts.by(req) : clientKey(req)}`;
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Too many requests. Try again in ${retryAfter} seconds.` });
    }
    return next();
  };
}

// Counters for addresses that have gone quiet are dropped every ten minutes, so
// the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) if (now > entry.resetAt) buckets.delete(key);
}, 10 * 60 * 1000).unref();

module.exports = { limit };
