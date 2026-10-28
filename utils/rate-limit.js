/**
 * In-memory rate limiting, keyed by address plus bucket name.
 *
 * In memory is the right scope for one box: it costs nothing, needs no service,
 * and loses only its counters on restart. When the app runs on more than one
 * instance this moves to a shared store — until then, per-instance counters are
 * honest about what they protect.
 */
const buckets = new Map();

function clientKey(req) {
  // req.ip already honors the configured proxy trust, which is why the app never
  // reads x-forwarded-for directly.
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * @param {string} name     bucket name, e.g. 'login'
 * @param {number} max      allowed requests per window
 * @param {number} windowMs window length
 */
function limit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${clientKey(req)}`;
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
