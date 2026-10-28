/**
 * The chess API, mounted at /api/chess. Every answer is graded here; the page
 * gets a position and never its solution until the puzzle or move is over.
 *
 * Puzzle trainer (content/chess-trainer.js)
 *   GET  /puzzles/me              the learner's puzzle rating and rush best
 *   POST /puzzles/next            a rated puzzle ({ retry: attemptId } shows a failed one again, unrated)
 *   POST /puzzles/:id/move        one move ({ move: "e2e4" or "Nf3" }): right or wrong, and the reply
 *   POST /puzzles/:id/resign      give up and see the solution
 *   POST /rush/start              a 3-minute, 3-strike rush and its first puzzle
 *   GET  /rush/:id                the rush's state by the server's clock
 *
 * Move trainer: per-move spaced repetition (content/chess-srs.js)
 *   GET  /drills                  the decks and the learner's counts
 *   POST /drills/next             { deck?, mode: 'learn' | 'review' } a line to play
 *   POST /drills/:runId/move      { move } one move of that line
 *
 * Engines on our server (services/chess-engine.js, services/chess-maia.js)
 *   GET  /engine                  which engines this server has
 *   POST /review                  { plies: [{ fen, uci }] } a game judged by Stockfish (503 without it:
 *                                 the page then reviews in its own Web Worker)
 *   POST /bot/move                { fen, elo?: 600-2100, moves?: [uci] } a human-like move: the CC0 opening
 *                                 book first, then Maia-2 at that rating; below 1000, or without Maia-2,
 *                                 the app's own bot (the page may also play that one itself)
 *   GET  /opening?fen=&moves=     the opening's name (CC0 lichess-org/chess-openings)
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');
const trainer = require('../content/chess-trainer');
const srs = require('../content/chess-srs');
const openings = require('../content/chess-openings');
const C = require('../content/chess-board');
const engine = require('../services/chess-engine');
const maia = require('../services/chess-maia');
const bot = require('../public/engine/chess/bot');

const router = express.Router();
router.use(requireAuth);
router.use(limit('chess-puzzles', 1500, 60 * 60 * 1000));

const send = (res, out) => (out && out.error ? res.status(out.status || 400).json({ error: out.error }) : res.json(out));
const fenOk = (fen) => {
  if (typeof fen !== 'string' || fen.length > 100) return null;
  try {
    const pos = C.parseFen(fen);
    return C.kingSquare(pos, 'w') >= 0 && C.kingSquare(pos, 'b') >= 0 ? pos : null;
  } catch { return null; }
};

router.get('/puzzles/me', (req, res) => res.json(trainer.summary(req.user.id)));
router.post('/puzzles/next', (req, res) => send(res, trainer.nextRated(req.user.id, { retry: req.body && req.body.retry })));
router.post('/puzzles/:id/move', (req, res) => send(res, trainer.move(req.user.id, req.params.id, String((req.body && req.body.move) || '').slice(0, 12))));
router.post('/puzzles/:id/resign', (req, res) => send(res, trainer.resign(req.user.id, req.params.id)));
router.post('/rush/start', (req, res) => send(res, trainer.startRush(req.user.id)));
router.get('/rush/:id', (req, res) => send(res, trainer.rushStatus(req.user.id, req.params.id)));

router.get('/drills', (req, res) => res.json(srs.decks(req.user.id)));
router.post('/drills/next', (req, res) => send(res, srs.next(req.user.id, { deck: req.body && req.body.deck, mode: req.body && req.body.mode })));
router.post('/drills/:id/move', (req, res) => send(res, srs.move(req.user.id, req.params.id, String((req.body && req.body.move) || '').slice(0, 12))));

router.get('/engine', (req, res) => {
  // The sparring page asks this on load: start Maia-2 now, so its first move is not slow.
  if (req.query.warm && maia.available()) maia.warm();
  res.json({ analysis: engine.pick('analysis'), stockfish: engine.available('stockfish'), leorik: engine.available('leorik'), maia2: maia.available() });
});

// Game review: a few positions per request, a few seconds of server time at most.
const reviewLimit = limit('chess-review', 60, 60 * 60 * 1000);
router.post('/review', reviewLimit, async (req, res) => {
  if (!engine.pick('analysis')) return res.status(503).json({ error: 'No engine on this server; review in the browser.' });
  const plies = Array.isArray(req.body && req.body.plies) ? req.body.plies.slice(0, 200) : [];
  if (!plies.length) return res.status(400).json({ error: 'No moves to review.' });
  try {
    const out = [];
    for (const p of plies) {
      if (!fenOk(p && p.fen) || typeof p.uci !== 'string') { out.push(null); continue; }
      out.push(await engine.reviewPly(p.fen, p.uci.slice(0, 5), { depth: 12 }));
    }
    res.json({ engine: engine.pick('analysis'), results: out });
  } catch (err) {
    res.status(503).json({ error: 'The engine could not finish; review in the browser.' });
  }
});

const botLimit = limit('chess-bot', 2000, 60 * 60 * 1000);
router.post('/bot/move', botLimit, async (req, res) => {
  const pos = fenOk(req.body && req.body.fen);
  if (!pos) return res.status(400).json({ error: 'That position could not be read.' });
  const legal = C.legalMoves(pos);
  if (!legal.length) return res.status(400).json({ error: 'There is no legal move in that position.' });
  const elo = Math.max(400, Math.min(2100, Number(req.body.elo) || 1200));
  const fen = C.toFen(pos);
  const reply = (uci, source, extra = {}) => {
    const m = C.moveFromText(pos, uci);
    res.json({ uci: C.uci(m), san: C.san(pos, m), source, ...extra });
  };
  // The opening book (CC0 named lines). How many named lines continue with a move
  // is a fair stand-in for how often it is played, so main lines are weighted up
  // (lines^1.5) and rare sidelines (under 5% of the main move's count) left out.
  const all = openings.bookMoves(fen);
  const book = all.filter((b) => b.lines >= 3 && b.lines >= 0.05 * all[0].lines);
  if (book.length && elo >= 800) {
    const w = (b) => b.lines ** 1.5;
    let r = Math.random() * book.reduce((n, b) => n + w(b), 0);
    const pick = book.find((b) => (r -= w(b)) <= 0) || book[0];
    return reply(pick.uci, 'book');
  }
  if (elo >= 1000 && maia.available()) {
    try {
      const p = await maia.predict(fen, { elo });
      const uci = maia.choose(p.moves);
      if (uci && C.moveFromText(pos, uci)) return reply(uci, 'maia2', { win_prob: p.win_prob });
    } catch { /* fall through to the app's own bot */ }
  }
  // The measured strength nearest the rating asked for (was 300 + 100 x strength, which
  // put strength 1 at 400 though it plays near 125; CHESS-ENGINE-BAKEOFF.md).
  const strength = bot.strengthForRating(elo);
  const own = bot.chooseMove(pos, { strength });
  return reply(C.uci(own.move), 'bot', { strength });
});

router.get('/opening', (req, res) => {
  const moves = String(req.query.moves || '').split(/[\s,]+/).filter(Boolean).slice(0, 60);
  if (moves.length) return res.json({ opening: openings.nameOfGame(moves, req.query.fen && fenOk(req.query.fen) ? req.query.fen : undefined) });
  if (!fenOk(req.query.fen)) return res.status(400).json({ error: 'That position could not be read.' });
  return res.json({ opening: openings.nameOf(req.query.fen) });
});

module.exports = router;
