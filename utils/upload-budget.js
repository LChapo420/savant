/**
 * Uploads are read into memory whole (a video up to 200 MB), so a few at once could take the app past its memory limit and end it for
 * everyone (beta load test, Nov 2026: six 180 MB uploads, 882 MB resident against a service limit of 800 MB). This holds what is being read at
 * once to UPLOAD_INFLIGHT_MB (300) in all: past that the upload is told to try again in a minute, before any of it is read.
 */
let inFlight = 0;

function uploadBudget(req, res, next) {
  const most = Number(process.env.UPLOAD_INFLIGHT_MB || 300) * 1048576;
  const size = Number(req.headers['content-length']) || 0;
  if (inFlight > 0 && inFlight + size > most) {
    res.set('Retry-After', '60');
    return res.status(503).json({ error: 'A lot of files are being uploaded right now. Please try again in a minute.', code: 'busy' });
  }
  inFlight += size;
  let done = false;
  res.on('close', () => { if (!done) { done = true; inFlight -= size; } });
  return next();
}

module.exports = { uploadBudget, inFlightBytes: () => inFlight };
