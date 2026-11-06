/**
 * Scoring planted errors and clean controls. A flag is { where, claim|quote, truth|why }.
 * Strict catch: a flag names the planted words (the words the error added) in a quote at an edited part, or anywhere with the whole wrong phrase, or its truth restores the
 * original words at an edited part. Key plants (no text edit): a flag at that check/block that speaks of the wrong key or its option.
 */
const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const STOP = new Set(['the', 'a', 'an', 'of', 'is', 'it', 'to', 'and', 'in', 'on', 'for', 'at', 'by', 'that', 'this', 'with', 'so', 'not', 'are', 'be', 'as', 'or', 'its', 'you']);
const placeOf = (where) => { const m = /(block|check)\s*#?\s*(\d+)/i.exec(where || ''); return m ? { word: m[1].toLowerCase(), index: Number(m[2]) } : null; };

function distinctive(e) {
  if (e.set || e.path !== undefined) return words(e.marker || '').filter((w) => !STOP.has(w));
  const orig = new Set(words(e.original));
  const w = words(e.wrong).filter((t) => !orig.has(t));
  return w.length ? w : words(e.wrong).filter((t) => !STOP.has(t));
}
function restored(e) {
  if (e.set || e.path !== undefined) return [];
  const wr = new Set(words(e.wrong));
  return words(e.original).filter((t) => !wr.has(t) && !STOP.has(t));
}
function catches(flag, plant) {
  const at = placeOf(flag.where);
  const quote = words(`${flag.claim || ''} ${flag.quote || ''}`);
  const why = words(`${flag.truth || ''} ${flag.why || ''}`);
  const qs = new Set(quote); const ws = new Set(why);
  return plant.edits.some((e) => {
    const onPart = !!at && at.word === e.word && at.index === Number(e.index);
    const dist = distinctive(e); const back = restored(e);
    if (e.set || e.path !== undefined) {
      if (!onPart) return dist.length > 0 && dist.filter((t) => qs.has(t) || ws.has(t)).length >= Math.ceil(dist.length * 0.6) && /key|answer|correct|marked|option/.test(`${quote.join(' ')} ${why.join(' ')}`);
      return true; // a flag on the changed key's part: it had nothing else wrong in the clean read (see cleanFlagsOn in compare)
    }
    const hitQ = dist.some((t) => qs.has(t));
    const hitW = dist.some((t) => ws.has(t)) || back.some((t) => ws.has(t) || qs.has(t));
    if (onPart) return hitQ || hitW;
    // A flag placed on the other side of a contradiction: it must quote most of what was planted.
    return dist.length >= 1 && dist.filter((t) => qs.has(t)).length >= Math.ceil(dist.length * 0.7) && (back.length === 0 || back.some((t) => ws.has(t) || qs.has(t)));
  });
}
module.exports = { words, placeOf, catches };
