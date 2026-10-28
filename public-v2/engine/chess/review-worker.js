/* Game review in a Web Worker, so the page stays responsive while the bot searches.
 *
 *   in:  { plies: [{ fen, uci }], depth? }   each move with the position before it
 *   out: { type: 'ply', index, result }      one per move, in order (teach.js reviewPly)
 *        { type: 'done' }
 *
 * Same origin as the page, so the content security policy (script-src 'self') allows it.
 */
/* global importScripts, PolymathChessTeach */
importScripts('/engine/chess/chess-core.js', '/engine/chess/bot.js', '/engine/chess/teach.js');

self.onmessage = function (e) {
  var data = e.data || {};
  var plies = data.plies || [];
  for (var i = 0; i < plies.length; i++) {
    var result = null;
    try { result = PolymathChessTeach.reviewPly(plies[i].fen, plies[i].uci, { depth: data.depth || 3 }); } catch (err) { result = null; }
    self.postMessage({ type: 'ply', index: i, result: result });
  }
  self.postMessage({ type: 'done' });
};
