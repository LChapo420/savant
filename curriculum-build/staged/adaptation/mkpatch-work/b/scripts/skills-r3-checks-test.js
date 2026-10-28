/**
 * Tests for the stage checks (staged skills round 3, patch 02-stage-tests):
 * services/skill-checks.js, routes/skill-checks.js, content/skill-stage-checks.js
 * and the stage check page's network use. Needs patch 01.
 *
 *   node scripts/skills-r3-checks-test.js
 *
 * Throwaway data file, keys blanked, no model call, no network.
 */
const F = require('./lib/skills-r3-fixture');
const fs = require('fs');
const path = require('path');

const { db, check, learner, serve, fresh, HOUR, DAY, at, later, now } = F;
const C = require('../content/chess-board');
const P = require('../public/engine/piano/piano-core');

/** The open sitting's items with their keys, read from the store (the page never sees them). */
function openItems(uid, metric) {
  const row = db.findOne('skill_records', (r) => r.user_id === uid && r.metric_id === metric);
  return row && row.open ? row.open.items : null;
}
/** A right answer for an item, from its key. */
function rightAnswer(it) {
  const k = it.key;
  if (k.type === 'choice') return k.answer;
  if (k.type === 'text') return k.accepts[0];
  if (k.type === 'squares') return k.set.join(' ');
  if (k.type === 'move') return k.accepts[0];
  if (k.type === 'mate_or_none') {
    if (!k.mate) return 'no mate';
    const pos = C.parseFen(it.fen);
    const m = C.legalMoves(pos).find((x) => C.isCheckmate(C.makeMove(pos, x)));
    return C.san(pos, m);
  }
  if (k.type === 'pc') return { midi: 60 + k.pc };
  if (k.type === 'midi') return { midi: k.midi };
  if (k.type === 'echo') return { tries: [k.notes] };
  return null;
}
/** Played notes for a piano part: every target note on its beat, from `source`. */
function playPart(part, source = 'midi', jitter = 0) {
  const beat = 60000 / part.tempo;
  if (part.chords) return part.target_chords ? [] : [];
  return part.target.map((t, i) => ({ midi: t.midi, time: 1000 + t.beat * beat + (i % 2 ? jitter : -jitter), velocity: 70, source }));
}

(async () => {
  console.log('skills round 3, patch 02: stage checks');
  const routes = fresh('routes/skills');
  const app = await serve([routes]);
  const chess = learner('chess', 'chess_rules_learner');
  const base = `/api/skills/checks/${chess.enrollment.id}`;

  let r = await app.get(base, chess.user.id);
  check('off: the checks answer 404', r.status === 404);
  process.env.SKILL_RECORD = 'on';
  r = await app.get(base, chess.user.id);
  check('SKILL_RECORD alone: still 404 (SKILL_STAGE_TESTS is off)', r.status === 404);
  process.env.SKILL_STAGE_TESTS = 'on';
  r = await app.get(base, chess.user.id);
  const o = r.json.checks;
  check('on: the overview lists the stage\'s four checks with how each is sat', r.status === 200 && o.checks.length === 4 && o.checks.map((c) => c.how).join(',') === 'items,items,not_wired,not_wired', o && o.checks.map((c) => c.how));
  check('...the ones not built yet say what they need', o.checks.filter((c) => !c.wired).every((c) => c.needs_build && c.needs_build.length > 20));
  check('...nothing is due before the Final (the battery opens there)', !o.battery_open && o.due.length === 0);
  r = await app.get(`/api/skills/path/${chess.enrollment.id}`, chess.user.id);
  check('the path shows a Stage check row, not the next step yet', r.json.nodes.length === 1 && r.json.nodes[0].kind === 'stage_check' && !r.json.nodes[0].next, r.json.nodes);

  db.update('enrollments', chess.enrollment.id, { current_level: chess.final });
  r = await app.get(base, chess.user.id);
  check('at the Final every wired check that is cold is due', r.json.checks.battery_open && r.json.checks.due.length === 2, r.json.checks.due);
  r = await app.get(`/api/skills/path/${chess.enrollment.id}`, chess.user.id);
  check('...and the path row is the next step', r.json.nodes[0].next === true && /2 checks ready/.test(r.json.nodes[0].detail), r.json.nodes[0]);

  // ── an items sitting, start to finish ──
  const metric = 'CH1:check_mate_stalemate_id';
  at(Date.UTC(2026, 9, 5, 9));
  r = await app.post(`${base}/${metric}/start`, {}, chess.user.id);
  check('a sitting opens with 20 positions', r.status === 201 && r.json.sitting.items.length === 20 && r.json.sitting.cold === true, r.status);
  check('...and the page gets no answer key', !JSON.stringify(r.json).includes('"key"') && !/"answer"\s*:/.test(JSON.stringify(r.json)));
  let items = openItems(chess.user.id, metric);
  const classes = items.map((it) => {
    const pos = C.parseFen(it.fen);
    const legal = C.legalMoves(pos).length;
    const inCheck = C.inCheck(pos);
    return inCheck ? (legal ? 'Check' : 'Checkmate') : (legal ? 'None of these' : 'Stalemate');
  });
  check('every check / mate / stalemate key agrees with the rules engine', items.every((it, i) => it.key.answer === classes[i]), classes);
  check('...five of each kind', ['Check', 'Checkmate', 'Stalemate', 'None of these'].every((k) => classes.filter((x) => x === k).length === 5), classes);
  r = await app.post(`${base}/${metric}/start`, {}, chess.user.id);
  check('starting again resumes the open sitting', r.status === 200 && r.json.resumed === true);
  for (let i = 0; i < 20; i++) await app.post(`${base}/${metric}/answer`, { index: i, answer: i < 18 ? rightAnswer(items[i]) : 'Check' }, chess.user.id);
  r = await app.post(`${base}/${metric}/answer`, { index: 0, answer: 'Check' }, chess.user.id);
  check('an answer cannot be changed', r.status === 409);
  r = await app.post(`${base}/${metric}/finish`, {}, chess.user.id);
  const res1 = r.json.result;
  check('18 of 20 passes, counts (cold), and is not proof on one day', res1 && res1.pass && res1.counted && res1.status === 'unproven' && res1.right >= 18, res1);
  check('...the review lists what was missed, with the answers', res1.review && res1.review.length === 20);
  later(3 * HOUR);
  r = await app.post(`${base}/${metric}/start`, {}, chess.user.id);
  check('a second sitting the same day opens warm', r.json.sitting.cold === false);
  items = openItems(chess.user.id, metric);
  for (let i = 0; i < 20; i++) await app.post(`${base}/${metric}/answer`, { index: i, answer: rightAnswer(items[i]) }, chess.user.id);
  r = await app.post(`${base}/${metric}/finish`, {}, chess.user.id);
  check('...passes and does not count', r.json.result.pass && !r.json.result.counted && /warm/.test(r.json.result.why), r.json.result);
  at(Date.UTC(2026, 9, 6, 10));
  r = await app.post(`${base}/${metric}/start`, {}, chess.user.id);
  items = openItems(chess.user.id, metric);
  for (let i = 0; i < 20; i++) await app.post(`${base}/${metric}/answer`, { index: i, answer: i < 17 ? rightAnswer(items[i]) : 'zz' }, chess.user.id);
  r = await app.post(`${base}/${metric}/finish`, {}, chess.user.id);
  check('17 of 20 the next day is below the bar: counted as a miss, not proven', !r.json.result.pass && r.json.result.counted && r.json.result.status === 'unproven', r.json.result);
  at(Date.UTC(2026, 9, 7, 10));
  for (const day of [7, 8]) {
    at(Date.UTC(2026, 9, day, 10));
    await app.post(`${base}/${metric}/start`, {}, chess.user.id);
    items = openItems(chess.user.id, metric);
    for (let i = 0; i < 20; i++) await app.post(`${base}/${metric}/answer`, { index: i, answer: rightAnswer(items[i]) }, chess.user.id);
    r = await app.post(`${base}/${metric}/finish`, {}, chess.user.id);
  }
  check('after the miss, two more cold passes prove it', r.json.result.status === 'proven' && r.json.result.proved, r.json.result);

  // Mate in one, unannounced: 10 mates and 5 without.
  const m2 = 'CH1:mate_in_1_unannounced';
  at(Date.UTC(2026, 9, 9, 10));
  await app.post(`${base}/${m2}/start`, {}, chess.user.id);
  items = openItems(chess.user.id, m2);
  const mates = items.filter((it) => it.key.mate);
  check('mate in one: 15 positions, 10 with a mate', items.length === 15 && mates.length === 10);
  check('...every mate exists and every "no mate" has none (rules engine)', items.every((it) => { const pos = C.parseFen(it.fen); const any = C.legalMoves(pos).some((x) => C.isCheckmate(C.makeMove(pos, x))); return any === it.key.mate; }));
  check('...and the prompt does not announce the mate', items.every((it) => /Is there a checkmate in one move/.test(it.prompt) && !/Find checkmate/.test(it.prompt)));
  for (let i = 0; i < 15; i++) await app.post(`${base}/${m2}/answer`, { index: i, answer: i === 0 && items[0].key.mate ? 'no mate' : rightAnswer(items[i]) }, chess.user.id);
  r = await app.post(`${base}/${m2}/finish`, {}, chess.user.id);
  check('14 or 15 of 15 passes', r.json.result.pass && r.json.result.right >= 14, r.json.result);
  const notWired = await app.post(`${base}/CH1:kqk_playout/start`, {}, chess.user.id);
  check('a check that is not built yet cannot be sat', notWired.status === 409 && /not built yet/.test(notWired.json.error));
  const other = await app.post(`${base}/CH3:kpk_judgement/start`, {}, chess.user.id);
  check("another stage's check is refused", other.status === 404);

  // An open sitting left for hours closes as failed.
  const c3 = learner('chess', 'chess_novice_club_player', 'final');
  const b3 = `/api/skills/checks/${c3.enrollment.id}`;
  at(Date.UTC(2026, 9, 10, 9));
  r = await app.post(`${b3}/CH3:kpk_judgement/start`, {}, c3.user.id);
  items = openItems(c3.user.id, 'CH3:kpk_judgement');
  check('KPK: 20 positions, win or draw, keys from the table-proved drills', items.length === 20 && items.every((it) => ['White wins', 'Draw'].includes(it.key.answer)));
  const fen0 = '8/8/5k2/3P4/8/1K6/8/8 b - - 0 1';
  check('the left-right mirror used to vary the set is its own inverse', F.db && require('../services/skill-checks').mirrorFen(require('../services/skill-checks').mirrorFen(fen0)).split(' ')[0] === fen0.split(' ')[0]);
  later(4 * HOUR);
  r = await app.post(`${b3}/CH3:kpk_judgement/start`, {}, c3.user.id);
  const kpkRow = db.findOne('skill_records', (x) => x.user_id === c3.user.id && x.metric_id === 'CH3:kpk_judgement');
  check('a sitting left open for 3+ hours is closed as a sitting that did not pass', kpkRow.sittings.length === 1 && kpkRow.sittings[0].pass === false && kpkRow.sittings[0].detail.left_open, kpkRow.sittings);
  // Tactics from the Stockfish-checked pool.
  await app.post(`${b3}/CH3:tactics_unannounced/start`, {}, c3.user.id);
  items = openItems(c3.user.id, 'CH3:tactics_unannounced');
  check('tactics: 30 pool positions, the motif left unnamed, each key a legal move', items.length === 30 && items.every((it) => /Find the best move/.test(it.prompt) && !/capture|fork/i.test(it.prompt.split('\n')[1]) && C.moveFromText(C.parseFen(it.fen), it.key.accepts[0])));

  // ── piano: score-informed takes ──
  const pi = learner('piano', 'piano_pre_reader', 'final');
  const pb = `/api/skills/checks/${pi.enrollment.id}`;
  at(Date.UTC(2026, 9, 11, 9));
  r = await app.post(`${pb}/PI1:five_finger/start`, {}, pi.user.id);
  check('five-finger pattern: two parts, right hand then left, with notes to read', r.status === 201 && r.json.sitting.parts.length === 2 && r.json.sitting.parts[1].names[0] === 'C3', r.json.sitting && r.json.sitting.parts);
  const parts = db.findOne('skill_records', (x) => x.user_id === pi.user.id && x.metric_id === 'PI1:five_finger').open.parts;
  r = await app.post(`${pb}/PI1:five_finger/take`, { part: 0, played: playPart(parts[0], 'midi', 20) }, pi.user.id);
  check('a MIDI take on the beat passes (scored on the server by piano-core)', r.json.pass && r.json.notes === 1 && r.json.on_beat === 1 && r.json.source === 'midi', r.json);
  const wrong = playPart(parts[1], 'midi').map((n, i) => (i === 3 ? { ...n, midi: n.midi + 1 } : n));
  r = await app.post(`${pb}/PI1:five_finger/take`, { part: 1, played: wrong }, pi.user.id);
  check('one wrong note fails a check that needs every note', !r.json.pass && r.json.notes < 1, r.json);
  r = await app.post(`${pb}/PI1:five_finger/finish`, {}, pi.user.id);
  check('...so the sitting is below the bar, and counted', !r.json.result.pass && r.json.result.counted, r.json.result);
  at(Date.UTC(2026, 9, 12, 9));
  await app.post(`${pb}/PI1:five_finger/start`, {}, pi.user.id);
  const parts2 = db.findOne('skill_records', (x) => x.user_id === pi.user.id && x.metric_id === 'PI1:five_finger').open.parts;
  for (const k of [0, 1]) await app.post(`${pb}/PI1:five_finger/take`, { part: k, played: playPart(parts2[k], 'mic') }, pi.user.id);
  r = await app.post(`${pb}/PI1:five_finger/finish`, {}, pi.user.id);
  check('microphone takes pass but, unconfirmed, do not count', r.json.result.pass && !r.json.result.counted && r.json.result.source === 'mic' && !r.json.result.confirmed, r.json.result);
  at(Date.UTC(2026, 9, 13, 9));
  await app.post(`${pb}/PI1:five_finger/start`, {}, pi.user.id);
  const parts3 = db.findOne('skill_records', (x) => x.user_id === pi.user.id && x.metric_id === 'PI1:five_finger').open.parts;
  for (const k of [0, 1]) for (let t = 0; t < 2; t++) await app.post(`${pb}/PI1:five_finger/take`, { part: k, played: playPart(parts3[k], 'mic', 10) }, pi.user.id);
  r = await app.post(`${pb}/PI1:five_finger/finish`, {}, pi.user.id);
  check('a second passing microphone take of each part confirms it, and it counts', r.json.result.pass && r.json.result.confirmed && r.json.result.counted, r.json.result);
  // Pieces from the song library.
  r = await app.post(`${pb}/PI1:piece/start`, {}, pi.user.id);
  check('pieces: two songs of this grade from the library', r.json.sitting.parts.length === 2 && r.json.sitting.parts.every((p) => p.song));
  const songParts = db.findOne('skill_records', (x) => x.user_id === pi.user.id && x.metric_id === 'PI1:piece').open.parts;
  await app.post(`${pb}/PI1:piece/take`, { part: 0, played: playPart(songParts[0], 'midi') }, pi.user.id);
  const halting = playPart(songParts[1], 'midi').map((n, i) => (i >= 4 ? { ...n, time: n.time + 5000 } : n));
  r = await app.post(`${pb}/PI1:piece/take`, { part: 1, played: halting }, pi.user.id);
  check('a long stop in a piece fails it ("no stops")', !r.json.pass && r.json.stops >= 1, r.json);
  // Beat and cadence.
  const pk = learner('piano', 'piano_keyboard_explorer', 'final');
  await app.post(`/api/skills/checks/${pk.enrollment.id}/PI0:steady_beat/start`, {}, pk.user.id);
  const beatPart = db.findOne('skill_records', (x) => x.user_id === pk.user.id && x.metric_id === 'PI0:steady_beat').open.parts[0];
  const taps = beatPart.target.map((t, i) => ({ midi: 64, time: 2000 + i * 750 + (i % 4 === 0 ? 300 : 0), source: 'tap' }));
  r = await app.post(`/api/skills/checks/${pk.enrollment.id}/PI0:steady_beat/take`, { part: 0, played: taps, origin: 2000 }, pk.user.id);
  check('steady beat: taps on any key, 12 of 16 on the beat passes (0.75)', r.json.pass && r.json.on_beat >= 0.75 && r.json.source === 'tap', r.json);
  const p4 = learner('piano', 'piano_elementary_2', 'final');
  await app.post(`/api/skills/checks/${p4.enrollment.id}/PI4:cadence/start`, {}, p4.user.id);
  const cad = db.findOne('skill_records', (x) => x.user_id === p4.user.id && x.metric_id === 'PI4:cadence').open.parts[0];
  const chords = cad.target_chords.flatMap((ch, i) => ch.map((m, k) => ({ midi: m, time: 1000 + i * 1000 + k * 8, source: 'midi' })));
  r = await app.post(`/api/skills/checks/${p4.enrollment.id}/PI4:cadence/take`, { part: 0, played: chords }, p4.user.id);
  check('cadence: four chords played together, each one right', r.json.pass && r.json.chords_right === 4, r.json);

  // ── chess puzzles rating ──
  const c4 = learner('chess', 'chess_club_player', 'final');
  const b4 = `/api/skills/checks/${c4.enrollment.id}`;
  at(Date.UTC(2026, 9, 14, 9));
  r = await app.post(`${b4}/CH4:tactics_rating/start`, {}, c4.user.id);
  check('puzzle rating: a sitting asks for 10 rated puzzles against the cut', r.status === 201 && r.json.sitting.min === 10 && r.json.sitting.cut === 1590);
  r = await app.post(`${b4}/CH4:tactics_rating/finish`, {}, c4.user.id);
  check('...finishing before 10 are done is refused, the sitting stays open', r.status === 409 && r.json.done === 0);
  const startedIso = new Date(now()).toISOString();
  for (let i = 0; i < 10; i++) db.insert('chess_puzzle_attempts', { user_id: c4.user.id, puzzle_id: `p${i}`, rated: true, status: 'solved', started_at: startedIso });
  db.insert('chess_ratings', { user_id: c4.user.id, rating: 1650, rd: 70, vol: 0.06, solved: 10, failed: 0, history: [] });
  r = await app.post(`${b4}/CH4:tactics_rating/finish`, {}, c4.user.id);
  check('...rating 1650 with deviation 70 passes and counts', r.json.result.pass && r.json.result.counted && r.json.result.detail.rating === 1650, r.json.result);

  // ── basketball counts ──
  const bb = learner('basketball', 'basketball_mini_starter', 'final');
  const bbb = `/api/skills/checks/${bb.enrollment.id}`;
  at(Date.UTC(2026, 9, 15, 9));
  r = await app.post(`${bbb}/BB1:layup_both_hands/count`, { left: { makes: 9, attempts: 10 }, right: { makes: 10, attempts: 10 } }, bb.user.id);
  check('lay-ups 9/10 and 10/10: each hand 90% sure of 50%+, passes and counts', r.json.result.pass && r.json.result.counted && r.json.result.score >= 0.9, r.json.result);
  at(Date.UTC(2026, 9, 16, 9));
  r = await app.post(`${bbb}/BB1:layup_both_hands/count`, { left: { makes: 6, attempts: 10 }, right: { makes: 10, attempts: 10 } }, bb.user.id);
  check('6/10 on one hand fails (one strong hand cannot carry the other)', !r.json.result.pass && r.json.result.counted, r.json.result);
  at(Date.UTC(2026, 9, 17, 9));
  r = await app.post(`${bbb}/BB1:layup_both_hands/count`, { left: { makes: 9, attempts: 9 }, right: { makes: 10, attempts: 10 } }, bb.user.id);
  check('fewer than 10 on a hand does not pass, whatever the rate', !r.json.result.pass && /at least 10/.test(r.json.result.note), r.json.result);
  at(Date.UTC(2026, 9, 18, 9));
  r = await app.post(`${bbb}/BB1:layup_both_hands/count`, { left: { makes: 10, attempts: 10 }, right: { makes: 10, attempts: 10 }, source: 'camera' }, bb.user.id);
  check('a camera count not confirmed by the learner does not count', r.json.result.pass && !r.json.result.counted, r.json.result);
  at(Date.UTC(2026, 9, 19, 9));
  r = await app.post(`${bbb}/BB1:layup_both_hands/count`, { left: { makes: 10, attempts: 10 }, right: { makes: 10, attempts: 10 }, source: 'camera', confirmed: true }, bb.user.id);
  check('...confirmed, it does', r.json.result.counted && r.json.result.confirmed, r.json.result);
  r = await app.post(`${bbb}/BB1:layup_both_hands/count`, { left: { makes: 12, attempts: 10 }, right: { makes: 1, attempts: 1 } }, bb.user.id);
  check('numbers that do not add up are refused', r.status === 400);
  r = await app.post(`${bbb}/BB1:dribble_look_up/count`, { strong: 40, weak: 30 }, bb.user.id);
  check('dribbling: weak 30 of strong 40 (0.75) passes the 0.7 ratio', r.json.result.pass && r.json.result.score === 0.75, r.json.result);
  const b3l = learner('basketball', 'basketball_junior_club_player', 'final');
  r = await app.post(`/api/skills/checks/${b3l.enrollment.id}/BB3:mikan_30s/count`, { makes: 10 }, b3l.user.id);
  check('Mikan: the first count is the learner\'s own baseline, not a sitting', r.json.result.baseline === 10 && r.json.result.pass === null && db.findOne('skill_records', (x) => x.user_id === b3l.user.id && x.metric_id === 'BB3:mikan_30s').sittings.length === 0);
  at(Date.UTC(2026, 9, 20, 9));
  r = await app.post(`/api/skills/checks/${b3l.enrollment.id}/BB3:mikan_30s/count`, { makes: 11 }, b3l.user.id);
  check('...10% more is below the 20% growth bar', !r.json.result.pass, r.json.result);
  at(Date.UTC(2026, 9, 21, 9));
  r = await app.post(`/api/skills/checks/${b3l.enrollment.id}/BB3:mikan_30s/count`, { makes: 12 }, b3l.user.id);
  check('...20% more passes', r.json.result.pass && r.json.result.counted, r.json.result);
  check('the make-rate rule is the Beta posterior (P(rate >= 0.5) after 13/20 is about 0.905)', Math.abs(require('../services/skill-checks').rateAtLeast(13, 20, 0.5) - 0.9054) < 0.002);

  // ── the pages' network use: results only, never sound or pictures ──
  const FORBIDDEN = [/\bXMLHttpRequest\b/, /\bsendBeacon\b/, /\bWebSocket\b/, /\bFormData\b/, /\bMediaRecorder\b/, /\bgetUserMedia\b/, /\bRTCPeerConnection\b/, /\/upload\b|\.upload\b/i, /\bhttps?:\/\/(?!www\.w3\.org)/i, /toDataURL|toBlob|captureStream/];
  for (const f of ['public/js/skill-kit.js', 'public/js/stage-check.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
    const bad = FORBIDDEN.filter((re) => re.test(src)).map(String);
    const fetches = [...src.matchAll(/App\.api\.(get|post)\(\s*([^,)]*)/g)].map((m) => m[2]).filter((u) => !/api|`\$\{base\}|`\$\{api\}/.test(u));
    check(`${f}: no upload path, no recorder, no camera or microphone of its own (the microphone only through the piano engine)`, !bad.length && !fetches.length && !/\bfetch\s*\(/.test(src), { bad, fetches });
  }

  app.close();
  F.done();
})().catch((err) => { console.error(err); process.exit(1); });
