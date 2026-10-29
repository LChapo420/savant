/**
 * Looking at a picture on the learner's own Savant page (a graph, a chess board, a drawing) when the
 * page's text is not enough. Goes through services/pool.js to a vision-capable, LEARNER-class model
 * only; nothing here picks a provider or names a price, and the pool's own ledgers still apply.
 *
 * No slot in the lineup declares `vision` today, so describe() returns null and the tutor says it
 * cannot see the picture and asks the learner to describe it. The day a vision slot is registered
 * (a slot with supports: ['chat','vision']), this starts working with no other change.
 *
 * Rules: only a small JPEG/PNG/WebP data URL of the page area (client captures it, see
 * public/js/tutor-snapshot.js), never in 'method' mode, size-capped, one short description back.
 */
// Small on purpose: the whole request has to fit the app's 64 KB JSON limit (server.js), which stays as it is.
const IMAGE_MAX_BYTES = 30 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function checkImage(dataUrl) {
  const m = DATA_URL.exec(String(dataUrl || ''));
  if (!m) return null;
  if (Math.floor((m[2].length * 3) / 4) > IMAGE_MAX_BYTES) return null;
  return dataUrl;
}

/** A one-paragraph description of the picture for the tutor's notes, or null when no vision model can serve it. */
async function describe({ userId, image, mode = 'full', pool }) {
  if (mode !== 'full') return null;
  const url = checkImage(image);
  if (!url) return null;
  // eslint-disable-next-line global-require
  const p = pool || require('./pool');
  const req = {
    kind: 'vision', role: 'fast', task: 'tutor_vision', userId, dataClass: 'learner', outside: true,
    system: 'Describe what is shown in this picture from a learning app in at most four plain sentences: any text, numbers, labels, axes, pieces on a board, or shapes. Do not solve or answer anything.',
    messages: [{ role: 'user', content: [{ type: 'image', url }, { type: 'text', text: 'Describe it.' }] }],
    maxTokens: 220, effort: 'low',
  };
  try {
    if (!p.candidatesFor(req).length) return null;
    const res = await p.callHedged(req, { allowPaid: false, validate: (r) => !!(r && (r.text || typeof r === 'string')) });
    const t = res && (typeof res === 'string' ? res : res.text);
    return t ? String(t).replace(/\s+/g, ' ').trim().slice(0, 600) : null;
  } catch { return null; }
}

module.exports = { IMAGE_MAX_BYTES, checkImage, describe };
