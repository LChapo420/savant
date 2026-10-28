/**
 * The puzzle trainer, graded on the server: a rated mode that moves the learner's
 * Glicko-2 puzzle rating, and a rush mode (3 minutes, 3 strikes, puzzles getting
 * harder) with its own best score.
 *
 * The page never sees a solution before the puzzle is over. It sends one move at
 * a time; the server says whether it was right and plays the reply. Any move that
 * checkmates is right. In a mate puzzle with one or two of the learner's moves
 * left, any move that still forces mate in time is right (proved by exhaustive
 * search); with more left, only the line's move, which Stockfish confirmed is the
 * only one that mates in time. In a material or advantage puzzle only the line's
 * move is right, because each was checked to stand out ("verified").
 *
 * The pool is our hand-set starter puzzles (content/chess-puzzles.js) plus the
 * curated Lichess import (content/chess-puzzles-lichess.js, CC0), whose credit
 * and link are shown once a puzzle is over (a link before then would show the
 * solution).
 *
 * Collections: chess_ratings (one row per learner), chess_puzzle_attempts (one per
 * puzzle shown), chess_rush_runs (one per rush).
 */
const db = require('../config/db');
const C = require('./chess-board');
const S = require('./chess-solver');
const rating = require('./chess-rating');
let LICHESS = [];
try { LICHESS = require('./chess-puzzles-lichess'); } catch { /* not imported yet: scripts/chess-lichess-import.js */ }
const PUZZLES = require('./chess-puzzles').concat(LICHESS);

const RUSH_MS = 3 * 60 * 1000;
const RUSH_GRACE_MS = 3000; // a move sent in the last instant still counts
const RUSH_STRIKES = 3;
const PUZZLE_RD = 80; // our ratings are estimates, so a puzzle counts as a slightly uncertain opponent

const byId = new Map(PUZZLES.map((p) => [p.id, p]));

function ratingRow(userId) {
  return db.findOne('chess_ratings', (r) => r.user_id === userId)
    || db.insert('chess_ratings', { user_id: userId, ...rating.START, solved: 0, failed: 0, rush_best: 0, history: [] });
}

/** What the page shows about a learner: rating rounded, how sure it is, and counts. */
function summary(userId) {
  const r = ratingRow(userId);
  return {
    rating: Math.round(r.rating),
    deviation: Math.round(r.rd),
    provisional: r.rd > 110,
    solved: r.solved,
    failed: r.failed,
    rush_best: r.rush_best || 0,
    recent: (r.history || []).slice(-10),
  };
}

/** The puzzle a learner meets next: near their rating, not one they saw lately. */
function choose(userId, target, exclude = new Set()) {
  const recent = new Set(db.find('chess_puzzle_attempts', (a) => a.user_id === userId)
    .slice(-30).map((a) => a.puzzle_id));
  let pool = PUZZLES.filter((p) => !exclude.has(p.id) && !recent.has(p.id));
  if (!pool.length) pool = PUZZLES.filter((p) => !exclude.has(p.id));
  if (!pool.length) pool = PUZZLES.slice();
  const near = pool.map((p) => ({ p, d: Math.abs(p.rating - target) + Math.random() * 120 }))
    .sort((a, b) => a.d - b.d);
  return near[0].p;
}

/** The part of an attempt the page may see. */
function shown(attempt) {
  const p = byId.get(attempt.puzzle_id);
  return {
    attempt_id: attempt.id,
    fen: p.fen,
    side: C.parseFen(p.fen).side === 'w' ? 'white' : 'black',
    moves: p.moves,
    kind: p.kind,
    last: p.last || null,
    played: attempt.played || [],
  };
}

/** Credit for a puzzle from the Lichess database, shown when it is over. */
const credit = (p) => (p.source === 'lichess'
  ? { text: 'Puzzle from the Lichess puzzle database (CC0). Thank you, Lichess.', url: `https://lichess.org/training/${p.lichess}` }
  : null);

/**
 * Practice at the expected score the curriculum names (SKILL-CURRICULA.md §3,
 * "expected score 0.75 ... 191 points below"; evidence article 04, P1). By the
 * Elo expectation E = 1 / (1 + 10^(-d/400)), a puzzle d = 400·log10(E/(1-E))
 * points below the learner is solved with chance E: 191 points for 0.75, 70 for
 * 0.6. The rating update itself is unchanged (Glicko-2 against the puzzle's own
 * rating), so an easier puzzle moves the rating by what it is worth; it only
 * carries less information, so the rating settles a little more slowly.
 *
 * Kept at the learner's own rating (about 0.5, the measurement optimum) while a
 * stage check's rated-puzzle sitting is open (skill-checks how: 'puzzles'), for
 * the owner (config/owner.js: base product) and with CHESS_PRACTICE_TARGET=off.
 * CHESS_PRACTICE_TARGET=0.6 (any 0.5-0.95) sets another expected score.
 */
const PRACTICE_SCORE = 0.75;
function practiceScore() {
  const raw = String(process.env.CHESS_PRACTICE_TARGET || 'on').toLowerCase();
  if (raw === 'off' || raw === '0') return null;
  const n = Number(raw);
  return raw !== 'on' && Number.isFinite(n) && n >= 0.5 && n <= 0.95 ? n : PRACTICE_SCORE;
}
const eloOffset = (score) => 400 * Math.log10(score / (1 - score));

function inStageSitting(userId) {
  return !!db.findOne('skill_records', (r) => r.user_id === userId && r.open && r.open.how === 'puzzles');
}

/** The puzzle rating a rated puzzle aims at, and the expected score it was chosen for. */
function practiceTarget(userId, ratingNow) {
  const score = practiceScore();
  // eslint-disable-next-line global-require
  if (score === null || require('../config/owner').ownerBase(userId) || inStageSitting(userId)) return { target: ratingNow, expected: 0.5 };
  return { target: ratingNow - eloOffset(score), expected: score };
}

function start(userId, { mode = 'rated', rushId = null, puzzle = null } = {}) {
  const r = ratingRow(userId);
  const p = puzzle || choose(userId, practiceTarget(userId, r.rating).target);
  const attempt = db.insert('chess_puzzle_attempts', {
    user_id: userId, puzzle_id: p.id, mode, rush_id: rushId, fen: p.fen, step: 0, played: [],
    status: 'open', rated: mode === 'rated', started_at: new Date().toISOString(),
  });
  return attempt;
}

/** Start a rated puzzle. A retry of a failed puzzle is shown again but not rated. */
function nextRated(userId, { retry = null } = {}) {
  if (retry) {
    const old = db.byId('chess_puzzle_attempts', Number(retry));
    if (old && old.user_id === userId && byId.has(old.puzzle_id)) {
      const a = start(userId, { mode: 'retry', puzzle: byId.get(old.puzzle_id) });
      return { puzzle: shown(a), me: summary(userId) };
    }
  }
  // A rated puzzle left unfinished counts as failed when the next one starts.
  for (const open of db.find('chess_puzzle_attempts', (x) => x.user_id === userId && x.status === 'open' && x.rated)) {
    db.update('chess_puzzle_attempts', open.id, { status: 'failed', finished_at: new Date().toISOString(), left: true });
    settleRating(userId, byId.get(open.puzzle_id), false, open);
  }
  const a = start(userId, { mode: 'rated' });
  return { puzzle: shown(a), me: summary(userId) };
}

/**
 * Is `move` right at this point of the puzzle? Returns the move to store and the
 * reply to play, or null.
 */
function judge(p, attempt, move) {
  const pos = C.parseFen(attempt.fen);
  const lineMove = p.line[attempt.step];
  const isLine = lineMove && C.uci(move) === lineMove;
  const learnerMovesLeft = Math.ceil((p.line.length - attempt.step) / 2);
  const after = C.makeMove(pos, move);
  let ok = isLine || C.isCheckmate(after);
  // A different route to mate: proved here when it is short; longer lines were
  // checked to have only one mating move at each step, so there is nothing to find.
  if (!ok && p.kind === 'mate' && learnerMovesLeft > 1 && learnerMovesLeft <= 2) ok = S.mateMoves(pos, learnerMovesLeft).some((m) => C.uci(m) === C.uci(move));
  if (!ok) return null;
  if (C.status(after) !== 'playing' || attempt.step + 1 >= p.line.length) return { after, reply: null };
  // The line's reply when the learner followed the line; otherwise the longest defence.
  let reply = isLine ? C.moveFromText(after, p.line[attempt.step + 1]) : null;
  if (!reply) reply = p.kind === 'mate' && learnerMovesLeft <= 2 ? S.longestDefence(after, learnerMovesLeft - 1) : null;
  if (!reply) return { after, reply: null };
  return { after, reply };
}

function settleRating(userId, p, solved, attempt) {
  if (!attempt.rated) return null;
  const r = ratingRow(userId);
  const was = Math.round(r.rating);
  const next = rating.update(r, [{ rating: p.rating, rd: PUZZLE_RD, score: solved ? 1 : 0 }]);
  const history = (r.history || []).concat([{ puzzle: p.id, solved, before: was, after: Math.round(next.rating), at: new Date().toISOString() }]).slice(-200);
  db.update('chess_ratings', r.id, {
    rating: next.rating, rd: next.rd, vol: next.vol,
    solved: r.solved + (solved ? 1 : 0), failed: r.failed + (solved ? 0 : 1), history,
  });
  return { before: was, after: Math.round(next.rating), change: Math.round(next.rating) - was };
}

/** The rest of the solution from where the learner went wrong, as SAN, for showing. */
function restOfLine(p, attempt) {
  const out = [];
  let pos = C.parseFen(attempt.fen);
  for (const u of p.line.slice(attempt.step)) {
    const m = C.moveFromText(pos, u);
    if (!m) break;
    out.push({ uci: C.uci(m), san: C.san(pos, m) });
    pos = C.makeMove(pos, m);
  }
  return out;
}

/** One learner move. Rated, retry and rush puzzles all come through here. */
function move(userId, attemptId, text) {
  const attempt = db.byId('chess_puzzle_attempts', Number(attemptId));
  if (!attempt || attempt.user_id !== userId) return { error: 'No such puzzle.', status: 404 };
  if (attempt.status !== 'open') return { error: 'This puzzle is over.', status: 409 };
  const p = byId.get(attempt.puzzle_id);
  const pos = C.parseFen(attempt.fen);
  const m = C.moveFromText(pos, text);
  if (!m) return { error: 'That is not a legal move here.', status: 400 };

  let run = null;
  if (attempt.mode === 'rush') {
    run = db.byId('chess_rush_runs', attempt.rush_id);
    if (!run || run.status !== 'open') return { error: 'This rush is over.', status: 409 };
    if (Date.now() > Date.parse(run.ends_at) + RUSH_GRACE_MS) {
      db.update('chess_puzzle_attempts', attempt.id, { status: 'timeout' });
      return { rush: endRush(userId, run, 'time'), correct: false, done: true, timeUp: true };
    }
  }

  const verdict = judge(p, attempt, m);
  const san = C.san(pos, m);
  if (!verdict) {
    const solution = restOfLine(p, attempt);
    db.update('chess_puzzle_attempts', attempt.id, { status: 'failed', played: attempt.played.concat([C.uci(m)]), finished_at: new Date().toISOString() });
    const change = settleRating(userId, p, false, attempt);
    const out = { correct: false, done: true, played: san, solution, puzzle_rating: p.rating, themes: p.themes, credit: credit(p), change, me: summary(userId) };
    if (run) return { ...out, rush: strike(userId, run) };
    return out;
  }
  const played = attempt.played.concat([C.uci(m)]);
  if (!verdict.reply) {
    db.update('chess_puzzle_attempts', attempt.id, { status: 'solved', played, fen: C.toFen(verdict.after), finished_at: new Date().toISOString() });
    const change = settleRating(userId, p, true, attempt);
    const out = { correct: true, done: true, played: san, puzzle_rating: p.rating, themes: p.themes, credit: credit(p), change, me: summary(userId) };
    if (run) return { ...out, rush: solvedInRush(userId, run) };
    return out;
  }
  const replySan = C.san(verdict.after, verdict.reply);
  const next = C.makeMove(verdict.after, verdict.reply);
  db.update('chess_puzzle_attempts', attempt.id, { played: played.concat([C.uci(verdict.reply)]), fen: C.toFen(next), step: attempt.step + 2 });
  return { correct: true, done: false, played: san, reply: { uci: C.uci(verdict.reply), san: replySan } };
}

/** Give up: the puzzle counts as failed (rated) and the solution is shown. */
function resign(userId, attemptId) {
  const attempt = db.byId('chess_puzzle_attempts', Number(attemptId));
  if (!attempt || attempt.user_id !== userId) return { error: 'No such puzzle.', status: 404 };
  if (attempt.status !== 'open') return { error: 'This puzzle is over.', status: 409 };
  const p = byId.get(attempt.puzzle_id);
  db.update('chess_puzzle_attempts', attempt.id, { status: 'failed', finished_at: new Date().toISOString() });
  return { correct: false, done: true, solution: restOfLine(p, attempt), credit: credit(p), change: settleRating(userId, p, false, attempt), me: summary(userId) };
}

// ── rush ───────────────────────────────────────────────────────────────────
/** Rush puzzles climb: the n-th puzzle aims at 450 + 60n, a little random. */
function rushPuzzle(userId, run) {
  const target = 450 + 60 * run.served.length;
  const p = choose(userId, target, new Set(run.served));
  const a = start(userId, { mode: 'rush', rushId: run.id, puzzle: p });
  db.update('chess_rush_runs', run.id, { served: run.served.concat([p.id]) });
  return shown(a);
}

function startRush(userId) {
  // One open rush at a time: an older one still open is closed first.
  for (const old of db.find('chess_rush_runs', (r) => r.user_id === userId && r.status === 'open')) endRush(userId, old, 'replaced');
  const now = Date.now();
  const run = db.insert('chess_rush_runs', {
    user_id: userId, status: 'open', score: 0, strikes: 0, served: [],
    started_at: new Date(now).toISOString(), ends_at: new Date(now + RUSH_MS).toISOString(),
  });
  const puzzle = rushPuzzle(userId, run);
  const fresh = db.byId('chess_rush_runs', run.id);
  return { rush: rushState(fresh), puzzle };
}

function rushState(run) {
  return {
    id: run.id, status: run.status, score: run.score, strikes: run.strikes, max_strikes: RUSH_STRIKES,
    ends_at: run.ends_at, ms_left: Math.max(0, Date.parse(run.ends_at) - Date.now()), reason: run.reason || null,
  };
}

function endRush(userId, run, reason) {
  if (run.status !== 'open') return rushState(run);
  const r = ratingRow(userId);
  const best = Math.max(r.rush_best || 0, run.score);
  db.update('chess_ratings', r.id, { rush_best: best });
  const done = db.update('chess_rush_runs', run.id, { status: 'over', reason, finished_at: new Date().toISOString() });
  for (const a of db.find('chess_puzzle_attempts', (x) => x.rush_id === run.id && x.status === 'open')) db.update('chess_puzzle_attempts', a.id, { status: 'abandoned' });
  return { ...rushState(done), best, new_best: run.score > (r.rush_best || 0) };
}

function strike(userId, run) {
  const now = db.update('chess_rush_runs', run.id, { strikes: run.strikes + 1 });
  if (now.strikes >= RUSH_STRIKES) return endRush(userId, now, 'strikes');
  return { ...rushState(now), next: rushPuzzle(userId, now) };
}

function solvedInRush(userId, run) {
  const now = db.update('chess_rush_runs', run.id, { score: run.score + 1 });
  if (Date.now() > Date.parse(now.ends_at) + RUSH_GRACE_MS) return endRush(userId, now, 'time');
  return { ...rushState(now), next: rushPuzzle(userId, now) };
}

/** The page asks when its clock runs out; the server's clock decides. */
function rushStatus(userId, runId) {
  const run = db.byId('chess_rush_runs', Number(runId));
  if (!run || run.user_id !== userId) return { error: 'No such rush.', status: 404 };
  if (run.status === 'open' && Date.now() > Date.parse(run.ends_at) + RUSH_GRACE_MS) return { rush: endRush(userId, run, 'time') };
  return { rush: rushState(run) };
}

module.exports = {
  summary, nextRated, move, resign, startRush, rushStatus, judge, PUZZLES, RUSH_MS, RUSH_STRIKES,
  practiceTarget, practiceScore, eloOffset,
};
