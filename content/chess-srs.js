/**
 * The chess move trainer: Chessable-style spaced repetition where every move the
 * learner plays in a line is its own card with its own timer.
 *
 * Schedule (MoveTrainer's published ladder): 8 levels, due after
 *   4 hours, 1 day, 3 days, 1 week, 2 weeks, 1 month, 3 months, 6 months.
 * Our choices where we differ, to avoid "review debt" (a known Chessable complaint):
 *   - a mistake drops a card two levels (never below level 1) and brings it back in
 *     4 hours, with the reason for the move shown again; it does not reset to 1;
 *   - a review done late is not punished: a right answer moves up as usual;
 *   - at most NEW_PER_DAY new moves are learned a day.
 *
 * A session plays one line. Learn mode teaches the line's new moves (shown with
 * their reason, then played by the learner). Review mode asks only the moves that
 * are due; the rest of the line is played for the learner. The page never holds a
 * move before it is played: every answer is graded here.
 *
 * Collections: chess_drill_cards (one per learner per card), chess_drill_runs.
 */
const db = require('../config/db');
const C = require('./chess-board');
const { DECKS, LINES } = require('./chess-drills');

let ALTS = {};
try { ALTS = require('./chess-drills-alts'); } catch { /* written by scripts/chess-engine-verify.js */ }

const HOUR = 3600 * 1000;
const LEVEL_HOURS = [4, 24, 72, 168, 336, 720, 2160, 4320];
const NEW_PER_DAY = 12;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A line made playable: every ply with its position, SAN, and card id when the learner plays it. */
function expand(line) {
  const fen = line.fen || START;
  let pos = C.parseFen(fen);
  const plies = [];
  const texts = line.moves || line.uci;
  for (let i = 0; i < texts.length; i++) {
    const m = C.moveFromText(pos, texts[i]);
    if (!m) throw new Error(`${line.id}: move ${i + 1} (${texts[i]}) is not legal`);
    const mine = pos.side === line.side;
    plies.push({
      i, fen: C.toFen(pos), uci: C.uci(m), san: C.san(pos, m), mine,
      why: (line.why && line.why[i]) || null, card: mine ? `${line.id}:${i}` : null,
      mates: C.isCheckmate(C.makeMove(pos, m)),
    });
    pos = C.makeMove(pos, m);
  }
  return { ...line, fen, plies, end: C.toFen(pos) };
}

const EXPANDED = LINES.map(expand);
const byLine = new Map(EXPANDED.map((l) => [l.id, l]));
const CARDS = new Map();
for (const l of EXPANDED) for (const p of l.plies) if (p.card) CARDS.set(p.card, { line: l, ply: p });

/** When a card at `level` (1-8) is next due, counted from `from`. */
const dueAfter = (level, from) => new Date(from + LEVEL_HOURS[Math.max(1, Math.min(8, level)) - 1] * HOUR).toISOString();

function cardRow(userId, cardId) {
  return db.findOne('chess_drill_cards', (c) => c.user_id === userId && c.card_id === cardId);
}

/** Move a card after an answer; returns the row. `now` may be given for tests. */
function schedule(userId, cardId, right, now = Date.now()) {
  const info = CARDS.get(cardId);
  const row = cardRow(userId, cardId);
  const at = new Date(now).toISOString();
  if (!row) {
    // A first right answer is the move learned: level 1.
    const level = right ? 1 : 0;
    return db.insert('chess_drill_cards', {
      user_id: userId, card_id: cardId, deck: info.line.deck, line_id: info.line.id, level,
      due_at: level ? dueAfter(1, now) : at, learned_at: right ? at : null, reps: 1, lapses: right ? 0 : 1,
      last_at: at, history: [{ at, right }],
    });
  }
  const lateBy = Math.max(0, now - Date.parse(row.due_at));
  let level;
  let due;
  if (right) {
    level = Math.min(8, Math.max(1, row.level + 1));
    due = dueAfter(level, now);
  } else {
    level = Math.max(1, row.level - 2);
    due = dueAfter(1, now);
  }
  return db.update('chess_drill_cards', row.id, {
    level, due_at: due, reps: row.reps + 1, lapses: row.lapses + (right ? 0 : 1), last_at: at,
    learned_at: row.learned_at || (right ? at : null),
    history: (row.history || []).concat([{ at, right, late_hours: Math.round(lateBy / HOUR) }]).slice(-30),
  });
}

const isDue = (row, now) => row && row.level > 0 && Date.parse(row.due_at) <= now;
const learnedToday = (userId, now) => db.find('chess_drill_cards', (c) => c.user_id === userId && c.learned_at && now - Date.parse(c.learned_at) < 24 * HOUR).length;

/** Every deck with the learner's counts. */
function decks(userId, now = Date.now()) {
  const rows = db.find('chess_drill_cards', (c) => c.user_id === userId);
  const mine = new Map(rows.map((r) => [r.card_id, r]));
  return {
    decks: DECKS.map((d) => {
      const cards = [...CARDS.entries()].filter(([, v]) => v.line.deck === d.id).map(([id]) => id);
      const learned = cards.filter((id) => mine.get(id) && mine.get(id).level > 0);
      return {
        ...d, lines: EXPANDED.filter((l) => l.deck === d.id).length, cards: cards.length,
        learned: learned.length, due: learned.filter((id) => isDue(mine.get(id), now)).length,
        new: cards.length - learned.length,
      };
    }),
    new_today: learnedToday(userId, now),
    new_per_day: NEW_PER_DAY,
    schedule_hours: LEVEL_HOURS,
  };
}

/** The line a session should play, or null. */
function pickLine(userId, deck, mode, now) {
  const lines = EXPANDED.filter((l) => !deck || l.deck === deck);
  const mine = new Map(db.find('chess_drill_cards', (c) => c.user_id === userId).map((r) => [r.card_id, r]));
  const cardRow = (u, id) => mine.get(id) || null; // eslint-disable-line no-shadow
  if (mode === 'review') {
    let best = null;
    for (const l of lines) {
      const due = l.plies.filter((p) => p.card && isDue(cardRow(userId, p.card), now))
        .map((p) => Date.parse(cardRow(userId, p.card).due_at));
      if (due.length && (!best || Math.min(...due) < best.at)) best = { l, at: Math.min(...due) };
    }
    return best && best.l;
  }
  return lines.find((l) => l.plies.some((p) => p.card && !(cardRow(userId, p.card) || {}).level)) || null;
}

/** Does the learner answer this ply in this run? */
function asks(run, p, userId, now) {
  if (!p.mine) return false;
  const row = cardRow(userId, p.card);
  if (run.mode === 'learn') return true; // the whole line is played in learn mode
  return isDue(row, now);
}

/** Play forward from run.at to the next ply the learner answers; returns what was auto-played. */
function advance(run, userId, now) {
  const line = byLine.get(run.line_id);
  const auto = [];
  let at = run.at;
  while (at < line.plies.length && !asks(run, line.plies[at], userId, now)) {
    const p = line.plies[at];
    auto.push({ uci: p.uci, san: p.san, why: p.mine ? p.why : null });
    at++;
  }
  return { at, auto };
}

/** What the page may see of a run. */
function view(run, userId, auto, now) {
  const line = byLine.get(run.line_id);
  const base = {
    run_id: run.id, mode: run.mode,
    line: { id: line.id, title: line.title, deck: line.deck, side: line.side === 'w' ? 'white' : 'black', start: line.fen },
    auto, results: run.results,
  };
  if (run.at >= line.plies.length) return { ...base, done: true, fen: line.end, summary: summarise(run) };
  const p = line.plies[run.at];
  const row = cardRow(userId, p.card);
  const isNew = !row || !row.level;
  return {
    ...base, done: false, fen: p.fen, retry: !!run.retry,
    // Learn mode shows a new move before the learner plays it.
    teach: run.mode === 'learn' && isNew && !run.retry ? { uci: p.uci, san: p.san, why: p.why } : null,
    card: { id: p.card, level: row ? row.level : 0, due: row ? row.due_at : null },
  };
}

const summarise = (run) => ({ right: run.results.filter((r) => r.right).length, wrong: run.results.filter((r) => !r.right).length });

function next(userId, { deck = null, mode = 'review' } = {}, now = Date.now()) {
  if (deck && !DECKS.some((d) => d.id === deck)) return { error: 'No such deck.', status: 404 };
  if (mode !== 'learn') mode = 'review';
  if (mode === 'learn' && learnedToday(userId, now) >= NEW_PER_DAY) {
    return { limit: true, message: `That is ${NEW_PER_DAY} new moves today. Review what is due, and learn more tomorrow.` };
  }
  const line = pickLine(userId, deck, mode, now);
  if (!line) return { none: true, message: mode === 'review' ? 'Nothing is due right now.' : 'Every move in this deck is learned.' };
  for (const old of db.find('chess_drill_runs', (r) => r.user_id === userId && r.status === 'open')) db.update('chess_drill_runs', old.id, { status: 'left' });
  const run = db.insert('chess_drill_runs', { user_id: userId, line_id: line.id, deck: line.deck, mode, at: 0, retry: false, status: 'open', results: [] });
  const { at, auto } = advance(run, userId, now);
  const fresh = db.update('chess_drill_runs', run.id, { at, status: at >= line.plies.length ? 'done' : 'open' });
  return view(fresh, userId, auto, now);
}

/** One learner move in a run. */
function move(userId, runId, text, now = Date.now()) {
  const run = db.byId('chess_drill_runs', Number(runId));
  if (!run || run.user_id !== userId) return { error: 'No such session.', status: 404 };
  if (run.status !== 'open') return { error: 'This line is finished.', status: 409 };
  const line = byLine.get(run.line_id);
  const p = line.plies[run.at];
  const pos = C.parseFen(p.fen);
  const m = C.moveFromText(pos, text);
  if (!m) return { error: 'That is not a legal move here.', status: 400 };
  const u = C.uci(m);
  const right = u === p.uci || (p.mates && C.isCheckmate(C.makeMove(pos, m)));
  if (!right && (ALTS[p.card] || []).includes(u)) {
    return { correct: false, alsoGood: true, played: C.san(pos, m), message: `${C.san(pos, m)} is a good move too, but this line plays something else. Try again.`, fen: p.fen };
  }
  // Learn mode scores a new card, or a learned one only when it is due; a retry is never scored.
  const row = cardRow(userId, p.card);
  const counts = !run.retry && (run.mode === 'review' || !row || !row.level || isDue(row, now));
  if (!right) {
    let card = null;
    if (counts && row && row.level) card = schedule(userId, p.card, false, now);
    const results = counts ? run.results.concat([{ card: p.card, right: false }]) : run.results;
    db.update('chess_drill_runs', run.id, { retry: true, results });
    return {
      correct: false, played: C.san(pos, m), answer: { uci: p.uci, san: p.san }, why: p.why, fen: p.fen,
      scored: card ? { level: card.level, due: card.due_at } : null, message: 'Not this one. Play the line\'s move to go on.',
    };
  }
  let card = null;
  if (counts) card = schedule(userId, p.card, true, now);
  const results = counts ? run.results.concat([{ card: p.card, right: true }]) : run.results;
  let fresh = db.update('chess_drill_runs', run.id, { at: run.at + 1, retry: false, results });
  const { at, auto } = advance(fresh, userId, now);
  fresh = db.update('chess_drill_runs', run.id, { at, status: at >= line.plies.length ? 'done' : 'open' });
  return {
    correct: true, played: p.san, why: p.why, scored: card ? { level: card.level, due: card.due_at } : null,
    ...view(fresh, userId, auto, now),
  };
}

module.exports = { decks, next, move, schedule, expand, EXPANDED, CARDS, ALTS, LEVEL_HOURS, NEW_PER_DAY, DECKS };
