/**
 * The chess rules, for the server.
 *
 * The rules live in public/engine/chess/chess-core.js so the board in the browser
 * and the server that grades a move run the very same code; this file only lets
 * server modules keep requiring them from content/.
 */
module.exports = require('../public/engine/chess/chess-core');
