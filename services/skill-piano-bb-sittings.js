/**
 * The later piano and basketball stage checks (PI2-PI10, BB1-BB12) that patch
 * 02 listed as "not wired": SKILL_PIANO_BB_SITTINGS=on (default on), on top of
 * SKILL_RECORD (01) and SKILL_STAGE_TESTS (02). The definitions are
 * content/skill-piano-bb-sittings.js; services/skill-checks.js opens, grades
 * and records the sittings and asks this module for the new parts.
 *
 * Why these can prove a skill:
 *   sight-reading   the excerpt is generated when the sitting opens (never seen
 *                   before) and drawn in notation on the page; piano-core scores
 *                   the notes and the timing separately, as the staircase asks;
 *   technique       every scale or arpeggio run is built from the staged batteries
 *                   (spellings and MIDI checked when the data is built), and the
 *                   evenness CV comes from the onset times;
 *   dynamics        MIDI velocity of the notes marked f against those marked p;
 *   pedalling       the keyboard's CC64 moves against the chord onsets
 *                   (piano-core scorePedal), MIDI only;
 *   repertoire      the library's pieces, then restarts from bars picked at random,
 *                   with no notes on the page (from memory);
 *   a piece learned a new 16-bar piece made for the learner and kept on their
 *                   record for 14 days; the cold take is scored as a piece;
 *   decision scenes the right read is re-derived from the players' positions
 *                   (content/basketball-scenes.js read());
 *   counts          the Beta rule per zone; a camera count only when confirmed.
 *
 * The microphone and camera stay on the device: the page sends note events,
 * pedal moves, answers and counts, never sound or pictures.
 */
'use strict';

const { CHECKS } = require('../content/skill-piano-bb-sittings');
const SR = require('../content/piano-sight-reading');
const SCENES = require('../content/basketball-scenes');
const P = require('../public/engine/piano/piano-core');

let DATA = null;
const data = () => { if (!DATA) DATA = require('../content/skill-piano-bb-sittings.data.json'); return DATA; };

const HOWS = []; // no new sitting kinds: every check is a take, items or a count
const DAY = 24 * 3600 * 1000;

/** On when the stage checks are (patch 02's own rule); SKILL_PIANO_BB_SITTINGS=off turns it off. */
function enabled() {
  if (String(process.env.SKILL_PIANO_BB_SITTINGS || 'on').toLowerCase() !== 'on') return false;
  // eslint-disable-next-line global-require
  return require('./skill-checks').enabled();
}

/** The definition patch 02 should use for a metric while the flag is on, or null. */
function checkFor(metricId) {
  if (!enabled()) return null;
  return CHECKS[metricId] || null;
}
const defFor = (metricId) => CHECKS[metricId] || null;

/** A short fingerprint of an excerpt's music (key, metre and every onset), to keep it new for the learner. */
function excerptHash(e) {
  // eslint-disable-next-line global-require
  return require('crypto').createHash('sha1').update(`${e.key}|${e.metre}|${e.target.map((t) => `${t.midi}@${t.beat}`).join(',')}`).digest('hex').slice(0, 16);
}

const shuffle = (xs, rnd) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const levelFor = (def, ctx) => (def.level_by_grade && ctx && def.level_by_grade[ctx.gradeId]) || def.level;
const countIn = (score) => { const [n, d] = score.metre; return Math.max(2, Math.round((n * 4) / d)); };

// ── piano parts ─────────────────────────────────────────────────────────────

/** A take part from a generated excerpt: what the page draws and what is scored. */
function excerptPart(e, label) {
  return {
    label,
    tempo: e.tempo,
    hands: e.hands === 'together' ? 'both' : e.hands === 'alternating' ? 'alternating' : (e.score.staves[0] === 'bass' ? 'left' : 'right'),
    mic_hands: 'right',
    score: e.score,
    count_in: countIn(e.score),
    target: e.target.map((t) => ({ midi: t.midi, beat: t.beat, ...(t.dynamic ? { dynamic: t.dynamic } : {}) })),
  };
}

function targetOf(midis, hands) {
  const out = [];
  midis.forEach((m, i) => {
    if (hands === 'left' || hands === 'both') out.push({ midi: m - 12, beat: i });
    if (hands === 'right' || hands === 'both') out.push({ midi: m, beat: i });
  });
  return out;
}

/** A new 16-bar piece to learn, made once and kept on the learner's record. */
function newPiece(def, rnd) {
  const e = SR.excerpt(def.level, rnd, { bars: def.bars });
  return { score: e.score, target: e.target, tempo: e.tempo, key_label: e.key_label, metre: e.metre };
}

/**
 * The parts of a take sitting for the builds this module owns, or null for
 * patch 02's own builds. ctx: { gradeId, row (the learner's skill row), now }.
 */
function takeParts(def, rnd, ctx = {}) {
  if (def.build === 'sight_reading') {
    // Never-seen excerpts only: none this learner has had before (the record keeps the last 300).
    const level = levelFor(def, ctx);
    const seen = new Set((ctx.row && ctx.row.seen_excerpts) || []);
    return Array.from({ length: def.excerpts || 2 }, (_, i) => {
      let e = SR.excerpt(level, rnd);
      for (let tries = 0; tries < 30 && seen.has(excerptHash(e)); tries++) e = SR.excerpt(level, rnd);
      seen.add(excerptHash(e));
      return { ...excerptPart(e, `New piece ${i + 1} of ${def.excerpts || 2}: level ${level.slice(2)}, ${e.key_label}, ${e.metre}`), level, excerpt: excerptHash(e) };
    });
  }
  if (def.build === 'technique') {
    const stages = (def.battery_by_grade && ctx.gradeId && def.battery_by_grade[ctx.gradeId]) || Object.values(def.battery_by_grade || {}).pop() || [];
    const pool = data().piano.technique.filter((b) => stages.includes(b.stage)).flatMap((b) => b.items);
    return shuffle(pool, rnd).slice(0, def.pick || 1).flatMap((item) => {
      const run = SR.scaleRun(item);
      // Fixed 2026-10-25: names spelled from the scale's own notes, not midiToName's sharps.
      const spelled = SR.scaleNames(item, run);
      const names = run.map((m, i) => spelled[i] || P.midiToName(m));
      return def.hands.map((h) => ({ label: `${item.item}${h === 'both' ? ', hands together' : `, ${h} hand`}`, tempo: def.tempo, hands: h, mic_hands: 'right', names, target: targetOf(run, h), evenness: true }));
    });
  }
  if (def.build === 'dynamics') {
    const e = SR.excerpt(def.level, rnd, { bars: def.bars, dynamics: 'pf', clef: 'treble' });
    return [{ ...excerptPart(e, `A new passage in ${e.key_label}: play the p bars softly and the f bars loudly`), dynamics: true }];
  }
  if (def.build === 'pedal') {
    const e = SR.pedalPassage(rnd, { bars: def.bars });
    return [{ ...excerptPart(e, `Chords in ${e.key_label}, one a bar: change the pedal at each new chord`), pedal: true, target_chords: e.chords }];
  }
  if (def.build === 'learn_piece') {
    const a = ctx.row && ctx.row.assignment;
    const piece = a && a.piece ? a.piece : newPiece(def, rnd);
    return [{ label: `Your piece: ${piece.key_label}, ${piece.metre}, ${def.bars} bars`, tempo: piece.tempo, hands: 'both', mic_hands: 'right', score: piece.score, count_in: countIn(piece.score), target: piece.target }];
  }
  if (def.build === 'repertoire') {
    // eslint-disable-next-line global-require
    const songs = require('../content/piano-songs');
    const pool = songs.SONGS.filter((s) => def.grades.includes(s.grade));
    const chosen = shuffle(pool, rnd).slice(0, def.pieces);
    if (!chosen.length) return [];
    const parts = chosen.map((song) => {
      const hands = song.lh ? 'both' : 'right';
      const sp = P.songParts(song, hands);
      return { label: `${song.title}${hands === 'both' ? ', hands together' : ', right hand'}`, song: song.id, tempo: song.tempo, hands, mic_hands: 'right', target: sp.target, beats_per_bar: song.beatsPerBar };
    });
    // From memory: one of the pieces, started at bars picked at random, nothing shown.
    const mem = chosen[Math.floor(rnd() * chosen.length)];
    const hands = mem.lh ? 'both' : 'right';
    const full = P.songParts(mem, hands).target;
    const bpb = mem.beatsPerBar || 4;
    const lastBar = Math.floor(full[full.length - 1].beat / bpb);
    const bars = [];
    for (let b = 1; b <= lastBar; b++) {
      const seg = full.filter((t) => t.beat >= b * bpb && t.beat < (b + def.restart_bars) * bpb);
      if (seg.length >= 4) bars.push(b);
    }
    const cues = shuffle(bars, rnd).slice(0, def.restarts);
    while (cues.length < def.restarts && bars.length) cues.push(bars[Math.floor(rnd() * bars.length)]);
    for (const b of cues.sort((x, y) => x - y)) {
      const seg = full.filter((t) => t.beat >= b * bpb && t.beat < (b + def.restart_bars) * bpb).map((t) => ({ midi: t.midi, beat: Math.round((t.beat - b * bpb) * 1000) / 1000 }));
      parts.push({ label: `${mem.title}, from memory: start at bar ${b + 1} and play ${def.restart_bars} bars`, song: mem.id, tempo: mem.tempo, hands, mic_hands: 'right', target: seg, memory: true, cue_bar: b + 1 });
    }
    return parts;
  }
  return null;
}

/** The learner's piece for "learn a new piece": kept for `window_days`, then a new one. */
function assignment(def, row, now, rnd) {
  const a = row && row.assignment;
  if (a && a.piece && now - a.assigned_at < def.window_days * DAY) return { assignment: a, fresh: false };
  return { assignment: { piece: newPiece(def, rnd), assigned_at: now, due_at: now + def.window_days * DAY }, fresh: true };
}
const assignmentForPage = (a) => (a ? { score: a.piece.score, tempo: a.piece.tempo, key_label: a.piece.key_label, metre: a.piece.metre, assigned_at: new Date(a.assigned_at).toISOString(), due_at: new Date(a.due_at).toISOString() } : null);

/** Pedal moves from the page: [{time, down}] in time order, or an error. */
function cleanPedal(list) {
  if (list === undefined || list === null) return { pedal: [] };
  if (!Array.isArray(list) || list.length > 600) return { error: 'The pedal moves were not readable.' };
  const out = [];
  for (const x of list) {
    const time = Number(x && x.time);
    if (!Number.isFinite(time) || typeof (x && x.down) !== 'boolean') return { error: 'A pedal move was not a time and up or down.' };
    out.push({ time, down: x.down });
  }
  return { pedal: out.sort((a, b) => a.time - b.time) };
}

const median = (xs) => { const a = xs.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };

/**
 * Extra scoring for the parts this module owns, given patch 02's standard
 * score `base` of the same take (notes, beat, CV, stops): dynamics and pedalling.
 * Returns the take's result, or null to keep `base`.
 */
function scorePart(def, part, notes, base, extra = {}) {
  if (part.dynamics) {
    const pairs = P.align(part.target, notes, {});
    const by = { p: [], f: [] };
    for (const x of pairs) {
      if (x.t === null || x.p === null) continue;
      const t = part.target[x.t];
      const n = notes[x.p];
      if (n.midi !== t.midi || n.source !== 'midi' || typeof n.velocity !== 'number') continue;
      if (by[t.dynamic]) by[t.dynamic].push(n.velocity);
    }
    const midi = notes.every((n) => n.source === 'midi');
    const mp = median(by.p); const mf = median(by.f);
    const diff = mp !== null && mf !== null ? mf - mp : null;
    const enough = by.p.length >= 4 && by.f.length >= 4;
    const pass = !!(base.pass && midi && enough && diff !== null && diff >= def.rule.dynamics);
    return { ...base, pass, dynamics: diff === null ? null : Math.round(diff), p_median: mp, f_median: mf, note: midi ? (enough ? null : 'too few p or f notes were matched') : 'loudness needs a MIDI keyboard; shown only on other inputs' };
  }
  if (part.pedal) {
    const cp = cleanPedal(extra.pedal);
    if (cp.error) return { error: cp.error };
    // The chord onsets as played: notes within 120 ms make one chord.
    const groups = [];
    for (const n of notes) {
      const g = groups[groups.length - 1];
      if (g && n.time - g.time <= 120) g.midis.push(n.midi); else groups.push({ time: n.time, midis: [n.midi] });
    }
    const right = part.target_chords.filter((ch, i) => groups[i] && P.samePitchClasses(groups[i].midis, ch)).length;
    const chords = right / part.target_chords.length;
    const midi = notes.every((n) => n.source === 'midi');
    const ped = P.scorePedal(groups.slice(0, part.target_chords.length).map((g) => g.time), cp.pedal, { beforeMs: def.before_ms, liftMs: def.lift_ms });
    const pass = midi && groups.length >= part.target_chords.length && chords >= def.rule.chords && ped.share >= def.rule.pedal;
    return { source: base.source, pass, notes: Number(chords.toFixed(2)), chords_right: right, chords: part.target_chords.length, pedal: ped.share, pedal_clean: ped.clean, pedal_changes: ped.changes, blurred: ped.blurred.length, dry: ped.dry.length, note: midi ? null : 'pedalling needs a MIDI keyboard with a sustain pedal' };
  }
  return null;
}

// ── basketball items ────────────────────────────────────────────────────────

function buildScenes(def, rnd) {
  return SCENES.sceneSet(def.mix, rnd, { twice: !!def.twice });
}

/** Applied tasks: computed box-score items (numbers with a tolerance) and rules calls from the bank. */
function buildApplied(def, rnd, seed) {
  // eslint-disable-next-line global-require
  const bank = require('../content/bank');
  const items = [];
  const avoid = new Set();
  for (const part of def.parts) {
    let got = 0;
    for (let i = 0; got < part.count && i < part.count * 6; i++) {
      const difficulty = part.difficulties ? part.difficulties[i % part.difficulties.length] : part.difficulty;
      const q = bank.generate({ skillId: part.skill, difficulty, seed: `${seed}:${part.skill}:${i}`, avoid });
      const k = bank.itemKey ? bank.itemKey(q) : q.prompt;
      if (avoid.has(k)) continue;
      avoid.add(k);
      got++;
      if (Array.isArray(q.choices) && q.choices.length) items.push({ kind: 'choice', prompt: q.prompt, choices: shuffle(q.choices, rnd), key: { type: 'choice', answer: q.answer, why: q.rationale || null } });
      else {
        const value = Number(String(q.answer).replace('%', ''));
        items.push({ kind: 'text', prompt: q.prompt, key: Number.isFinite(value) ? { type: 'number', value, tol: 0.051, accepts: [String(q.answer)], why: q.rationale || null } : { type: 'text', accepts: [q.answer, ...(q.accepts || [])] } });
      }
    }
  }
  return shuffle(items, rnd);
}

const BUILDERS = { bb_scenes: buildScenes, bb_applied: buildApplied };

/** Grading for the key kinds this module adds, or null. */
function gradeItem(item, answer) {
  const k = item.key;
  if (k.type === 'number') {
    const raw = String(answer == null ? '' : answer).trim().replace(/%$/, '').replace(',', '.');
    const x = Number(raw);
    return { correct: raw !== '' && Number.isFinite(x) && Math.abs(x - k.value) <= k.tol };
  }
  return null;
}

function answerText(item) {
  const k = item && item.key;
  if (!k) return null;
  if (k.type === 'number') return `${k.value}${k.why ? ` (${k.why.replace(/\.$/, '')})` : ''}`;
  if (item.kind === 'scene') return `${k.answer}${k.why ? `: ${k.why.replace(/\.$/, '')}` : ''}`;
  return null;
}

// ── basketball counts by zone ───────────────────────────────────────────────

/** A zone count against its rule, or null for patch 02's own rules. `rateAtLeast` is 02's Beta rule. */
function countResult(def, body, rateAtLeast) {
  if (!def.rule || !def.rule.zones) return null;
  const b = body || {};
  const range = b.range === 'three' ? 'three' : 'mid';
  const bar = def.rule.zones[range];
  const zones = [];
  const values = { range };
  for (const [name, , lo, hi] of def.fields) {
    const v = Number(b[name]);
    if (!Number.isInteger(v) || v < lo || v > hi) return { error: 'Those numbers do not add up.' };
    values[name] = v;
  }
  for (const f of def.fields.filter(([n]) => /_makes$/.test(n))) {
    const z = f[0].replace(/_makes$/, '');
    const makes = values[`${z}_makes`];
    const attempts = values[`${z}_attempts`];
    if (makes > attempts) return { error: 'Those numbers do not add up.' };
    const p = rateAtLeast(makes, attempts, bar);
    // The posterior mean and its central 80% interval (Beta(1+makes, 1+misses)), shown with the profile.
    const lo = betaQuantile(makes + 1, attempts - makes + 1, 0.1);
    const hi = betaQuantile(makes + 1, attempts - makes + 1, 0.9);
    zones.push({ zone: z, makes, attempts, p: Number(p.toFixed(3)), rate: Number(((makes + 1) / (attempts + 2)).toFixed(3)), lo: Number(lo.toFixed(3)), hi: Number(hi.toFixed(3)) });
  }
  const short = zones.filter((z) => z.attempts < def.min_n);
  const pass = !short.length && zones.every((z) => z.p >= def.rule.conf);
  const n = zones.reduce((a, z) => a + z.attempts, 0);
  const note = short.length ? `at least ${def.min_n} in every zone for a sitting to pass` : `${range === 'three' ? '3-point' : 'mid-range'} mark ${Math.round(bar * 100)}%`;
  return { pass, score: Number(Math.min(...zones.map((z) => z.p)).toFixed(3)), n, note, values: { ...values, zones } };
}

/** The p-quantile of Beta(a, b) by bisection on its CDF (a, b positive integers). */
function betaQuantile(a, b, p) {
  // P(X <= x) for integer a, b: P(Binomial(a+b-1, x) >= a)
  const cdf = (x) => {
    const n = a + b - 1;
    let s = 0;
    let logC = 0;
    for (let k = 0; k <= n; k++) {
      if (k > 0) logC += Math.log(n - k + 1) - Math.log(k);
      if (k >= a) s += Math.exp(logC + k * Math.log(Math.max(x, 1e-12)) + (n - k) * Math.log(Math.max(1 - x, 1e-12)));
    }
    return s;
  };
  let lo = 0; let hi = 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (cdf(mid) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

module.exports = {
  CHECKS, HOWS, BUILDERS, enabled, checkFor, defFor, takeParts, scorePart, cleanPedal, gradeItem, answerText,
  countResult, assignment, assignmentForPage, betaQuantile, levelFor, excerptHash,
};
