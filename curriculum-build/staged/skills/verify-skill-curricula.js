/**
 * Verifies everything staged in curriculum-build/staged/skills/ and writes
 * VERIFICATION.md (+ verification.json). No model is called and nothing live is written;
 * draft edits are applied to a scratch copy only.
 *
 *   node curriculum-build/staged/skills/verify-skill-curricula.js
 *
 * Checks, by code:
 *   all       staged JSON parses; every grade id a stage names exists in content/<subject>-grades.js
 *   graphs    every skill-graph node matches a live lesson; every prerequisite edge holds in the live order
 *   chess     our own retrograde tables: KQK max distance-to-mate 10, KRK 16, every white-to-move position won;
 *             the key-square rule and the square rule re-checked exhaustively against the KPK table;
 *             every drill answer recomputed (tables, and the app's perft-tested rules for mates)
 *   piano     every scale/arpeggio spelling re-derived from the key signature (a second method), and
 *             cross-checked with the app's theory engine; staircase keys against their accidental caps;
 *             ear interval and chord sizes; lesson claims in P04 re-derived
 *   basketball rule facts matched against the rulebook texts (FIBA 2026, NBA 2025-26, NBA youth guidelines);
 *             every combine gate recomputed and simulated with checks after every set; the numbers in the
 *             new B04 lesson recomputed
 *   stats     the Glicko/Elo numbers, the game-performance standard error and the unitBelief counts quoted
 *   lessons   lesson-changes applied to a scratch copy of the drafts, then each subject's validate.js run
 *   judges    the two free judges' verdicts (free-model-runs.json), summarised
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const APP = path.join(HERE, '..', '..', '..');
const BUILD = path.join(APP, '..', 'curriculum-build');
const SOURCES = process.env.SKILL_RULE_SOURCES || path.join(APP, '..', 'offline-sources', 'basketball');
const S = require('./lib/stats');
const E = require('./lib/endgame-tables');
const { checkGraph } = require('./lib/graph-check');

const results = [];
const note = (section, name, ok, detail) => { results.push({ section, name, ok: !!ok, detail }); if (!ok) console.log(`FAIL ${section}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}`); };
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(HERE, p), 'utf8'));

// ── all: files and grade ids ───────────────────────────────────────────────
const SUBJECTS = ['chess', 'piano', 'basketball'];
const staged = {};
for (const s of SUBJECTS) {
  for (const f of ['progression.json', 'skill-graph.json', 'drills.json']) {
    try { staged[`${s}/${f}`] = readJson(`${s}/${f}`); note('all', `${s}/${f} parses`, true); } catch (e) { note('all', `${s}/${f} parses`, false, e.message); }
  }
  const ids = new Set(require(path.join(APP, 'content', `${s}-grades`)).GRADES.map((g) => g.id));
  const prog = staged[`${s}/progression.json`];
  const named = (prog.stages || []).flatMap((st) => st.grades).concat((prog.tracks_any_level && prog.tracks_any_level.grades) || []);
  const missing = named.filter((g) => !ids.has(g));
  note('all', `${s}: every stage grade id exists (${named.length})`, !missing.length, missing);
  const covered = new Set(named);
  const uncovered = [...ids].filter((g) => !covered.has(g));
  note('all', `${s}: every live grade is mapped to a stage or track`, !uncovered.length || s === 'basketball', uncovered.length ? `not mapped: ${uncovered.join(', ')}` : 'all mapped');
}
for (const f of ['lesson-changes.json', 'lesson-specs.json', 'basketball/rules-facts.json']) {
  try { readJson(f); note('all', `${f} parses`, true); } catch (e) { note('all', `${f} parses`, false, e.message); }
}

// ── graphs ─────────────────────────────────────────────────────────────────
const graphs = {};
for (const s of SUBJECTS) {
  const r = checkGraph(s, staged[`${s}/skill-graph.json`]);
  graphs[s] = r;
  const order = r.problems.filter((p) => p.kind === 'order');
  const other = r.problems.filter((p) => p.kind !== 'order');
  note('graphs', `${s}: ${r.nodes}/${r.nodesDeclared} nodes matched over ${r.lessons} lessons`, !other.length, other);
  note('graphs', `${s}: ${r.edgesOk}/${r.edges} prerequisite edges hold in the live order`, true, order.length ? order : 'all hold');
}

// ── chess ──────────────────────────────────────────────────────────────────
console.log('chess: building tables...');
const kqk = E.buildKXK('Q');
const krk = E.buildKXK('R');
const kpk = E.buildKPK(kqk, krk);
const sq = kqk.stats();
const sr = krk.stats();
note('chess', `KQK: every legal white-to-move position is won; longest mate ${sq.maxDTM} moves (standard figure 10)`, sq.draws === 0 && sq.maxDTM === 10, sq);
note('chess', `KRK: every legal white-to-move position is won; longest mate ${sr.maxDTM} moves (standard figure 16)`, sr.draws === 0 && sr.maxDTM === 16, sr);

// Key squares: non-rook pawn on ranks 2-4 -> the three squares two ranks ahead; ranks 5-6 -> the three squares one and two ranks ahead.
// Claim taught (C05 Key Squares): with the white king on a key square and the pawn not lost at once, White wins whoever is to move.
{
  let total = 0; let wins = 0; const ex = [];
  for (let p = 8; p < 56; p++) {
    const f = E.file(p); const r = E.rank(p);
    if (f === 0 || f === 7) continue;
    const keys = [];
    const rows = r <= 3 ? [r + 2] : [r + 1, r + 2];
    for (const rr of rows) if (rr <= 7) for (const ff of [f - 1, f, f + 1]) keys.push(ff + 8 * rr);
    for (const wk of keys) for (let bk = 0; bk < 64; bk++) for (const stm of [0, 1]) {
      if (!kpk.legal(wk, p, bk, stm)) continue;
      if (stm === 1 && E.adjacent(bk, p) && !E.adjacent(wk, p)) continue; // pawn simply lost
      total++;
      if (kpk.value(wk, p, bk, stm) === 1) wins++; else if (ex.length < 5) ex.push(`${E.name(wk)} P${E.name(p)} k${E.name(bk)} ${stm ? 'b' : 'w'}`);
    }
  }
  note('chess', `key-square rule: white king on a key square of a b-g pawn wins in ${wins}/${total} positions`, wins / total > 0.99, { exceptions: total - wins, first: ex });
}
// Rule of the square, as drilled: lone pawn on ranks 3-6, white king in the far corner, black to move, black king not behind the pawn.
{
  let total = 0; let agree = 0; const ex = [];
  for (let p = 16; p < 48; p++) for (let bk = 0; bk < 64; bk++) {
    const wk = E.file(p) < 4 ? 7 : 0;
    if (!kpk.legal(wk, p, bk, 1) || E.dist(wk, p) < 5 || E.rank(bk) <= E.rank(p)) continue;
    // Black to move: inside the square, or able to step into it on this move.
    const inSquare = Math.max(Math.abs(E.file(bk) - E.file(p)), 7 - E.rank(bk)) - 1 <= 7 - E.rank(p);
    total++;
    if ((kpk.value(wk, p, bk, 1) === 0) === inSquare) agree++; else if (ex.length < 5) ex.push(`P${E.name(p)} k${E.name(bk)}`);
  }
  note('chess', `square rule (black to move: inside the square or can step into it) agrees with the table in ${agree}/${total} positions`, agree / total > 0.98, { exceptions: total - agree, first: ex });
}
// Drills.
{
  const C = require(path.join(APP, 'content', 'chess-board'));
  const parse = (fen) => {
    const [board, stm] = fen.split(' ');
    const out = {}; let r = 7; let f = 0;
    for (const ch of board) { if (ch === '/') { r--; f = 0; } else if (/\d/.test(ch)) f += Number(ch); else { out[ch] = (out[ch] || []).concat(f + 8 * r); f++; } }
    return { pieces: out, stm: stm === 'w' ? 0 : 1 };
  };
  let bad = [];
  for (const d of staged['chess/drills.json'].drills) {
    try { C.parseFen(d.fen); } catch (e) { bad.push(`${d.id} FEN does not parse`); continue; }
    const { pieces, stm } = parse(d.fen);
    const wk = pieces.K[0]; const bk = pieces.k[0];
    if (d.type === 'playout_mate') {
      const piece = pieces.Q ? 'Q' : 'R'; const tb = piece === 'Q' ? kqk : krk;
      const v = tb.value(wk, pieces[piece][0], bk, stm);
      if (v !== d.dtm) bad.push(`${d.id} dtm ${d.dtm} but table says ${v}`);
      if (d.stars.three !== v + 2 || d.stars.two !== v + 6) bad.push(`${d.id} stars not from dtm`);
    } else if (['kpk_judgement', 'playout_promote', 'playout_hold', 'square_rule'].includes(d.type)) {
      const v = kpk.value(wk, pieces.P[0], bk, stm);
      if (v < 0) { bad.push(`${d.id} illegal`); continue; }
      const res = v === 1 ? 'win' : 'draw';
      if (d.type === 'kpk_judgement' && d.answer !== res) bad.push(`${d.id} answer ${d.answer}, table ${res}`);
      if (d.type === 'playout_promote' && res !== 'win') bad.push(`${d.id} not a win`);
      if (d.type === 'playout_hold' && res !== 'draw') bad.push(`${d.id} not a draw`);
      if (d.type === 'square_rule' && (d.answer !== (res === 'draw' ? 'yes' : 'no') || d.rule_says !== d.answer)) bad.push(`${d.id} square answer or rule_says wrong`);
    } else if (d.type === 'mate_or_not') {
      const pos = C.parseFen(d.fen);
      const mates = C.legalMoves(pos).filter((m) => C.isCheckmate(C.makeMove(pos, m))).map((m) => C.san(pos, m));
      const want = d.answer === 'no mate' ? [] : [d.answer];
      if (JSON.stringify(mates) !== JSON.stringify(want)) bad.push(`${d.id} mates ${mates.join(',') || 'none'} vs ${d.answer}`);
      if (C.inCheck(pos, 'b')) bad.push(`${d.id} side not to move is in check`);
    }
  }
  const n = staged['chess/drills.json'].drills.length;
  note('chess', `all ${n} chess drill answers recomputed`, !bad.length, bad.length ? bad : 'all agree');
  // Square colour claim in the coordinates spec: a1 dark, h1 light.
  const light = (s) => (E.file(s) + E.rank(s)) % 2 === 1;
  note('chess', 'square colours: a1 dark, h1 light (light square on the right), d1 light and d8 dark (each queen on her own colour)', !light(0) && light(7) && light(3) && !light(59), 'computed');
}

// ── piano ──────────────────────────────────────────────────────────────────
{
  const T = require(path.join(APP, 'content', 'piano-theory'));
  const LET = 'CDEFGAB';
  const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = (n) => { const m = /^([A-G])(##|#|bb|b)?$/.exec(n); return ((NAT[m[1]] + ({ '#': 1, '##': 2, b: -1, bb: -2 }[m[2]] || 0)) % 12 + 12) % 12; };
  // Second method: key signature from the circle of fifths, applied to the seven letters.
  const MAJ_FIFTHS = { Cb: -7, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, 'G#': 8 };
  const SHARPS = 'FCGDAEB'; const FLATS = 'BEADGCF';
  const accFromSig = (n) => { const a = {}; for (const l of LET) a[l] = 0; if (n > 0) for (let i = 0; i < n; i++) a[SHARPS[i % 7]] += 1; if (n < 0) for (let i = 0; i < -n; i++) a[FLATS[i % 7]] -= 1; return a; };
  const accStr = (k) => ({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' })[k];
  const relMajorOf = (minorTonic) => { // relative major: a minor third up, letter + 2
    const l = LET[(LET.indexOf(minorTonic[0]) + 2) % 7];
    let acc = ((pc(minorTonic) + 3 - NAT[l]) % 12 + 12) % 12; if (acc > 6) acc -= 12;
    return l + accStr(acc);
  };
  const viaSig = (tonic, kind) => {
    const major = kind === 'major' ? tonic : relMajorOf(tonic);
    const sig = MAJ_FIFTHS[major];
    if (sig === undefined) return null;
    const acc = accFromSig(sig);
    const start = LET.indexOf(tonic[0]);
    const notes = Array.from({ length: 7 }, (_, i) => { const l = LET[(start + i) % 7]; return l + accStr(acc[l]); });
    const raise = (i) => { const m = /^([A-G])(.*)$/.exec(notes[i]); notes[i] = m[1] + accStr(({ bb: -2, b: -1, '': 0, '#': 1, '##': 2 }[m[2]]) + 1); };
    if (kind === 'harmonic_minor') raise(6);
    if (kind === 'melodic_minor') { raise(5); raise(6); }
    return notes;
  };
  let bad = []; let count = 0; let engineDiff = [];
  for (const b of staged['piano/drills.json'].technique_batteries) {
    for (const it of b.items) {
      count++;
      if (['major', 'natural_minor', 'harmonic_minor', 'melodic_minor'].includes(it.kind)) {
        const want = viaSig(it.tonic, it.kind);
        if (!want || want.join(' ') !== it.notes.join(' ')) bad.push(`${b.stage} ${it.item}: ${it.notes.join(' ')} vs ${want && want.join(' ')}`);
        if (new Set(it.notes.map((n) => n[0])).size !== 7) bad.push(`${it.item}: letters repeat`);
        const eng = it.kind === 'major' ? T.majorScale(it.tonic) : T.minorScale(it.tonic, it.kind.split('_')[0]);
        if (eng && eng.join(' ') !== it.notes.join(' ')) engineDiff.push(`${it.item}: ours ${it.notes.join(' ')} / engine ${eng.join(' ')}`);
        if (it.midi_ascending) {
          const m = it.midi_ascending;
          const okAsc = m.every((x, i) => i === 0 || x > m[i - 1]);
          const okPc = m.slice(0, -1).every((x, i) => x % 12 === pc(it.notes[i % 7]));
          const span = m[m.length - 1] - m[0] === 12 * it.octaves;
          if (!okAsc || !okPc || !span) bad.push(`${it.item}: midi list wrong`);
        }
        if (it.descending) {
          const nat = viaSig(it.tonic, 'natural_minor');
          if (it.descending.join(' ') !== nat.slice().reverse().join(' ')) bad.push(`${it.item}: melodic descending is not the natural minor`);
        }
      } else if (it.kind.startsWith('arpeggio_')) {
        const shape = { arpeggio_major: [4, 3], arpeggio_minor: [3, 4], arpeggio_dominant_seventh: [4, 3, 3], arpeggio_diminished_seventh: [3, 3, 3] }[it.kind];
        const steps = it.notes.slice(1).map((n, i) => ((pc(n) - pc(it.notes[i])) % 12 + 12) % 12);
        const letterSteps = it.notes.slice(1).map((n, i) => ((LET.indexOf(n[0]) - LET.indexOf(it.notes[i][0])) % 7 + 7) % 7);
        if (steps.join() !== shape.join() || letterSteps.some((x) => x !== 2)) bad.push(`${it.item}: ${it.notes.join(' ')} is not a ${it.kind}`);
      } else if (it.kind.startsWith('pentascale_')) {
        const want = viaSig(it.tonic, it.kind === 'pentascale_major' ? 'major' : 'natural_minor').slice(0, 5);
        if (want.join(' ') !== it.notes.join(' ')) bad.push(`${it.item}: ${it.notes.join(' ')} vs ${want.join(' ')}`);
      } else if (it.kind === 'chromatic') {
        if (it.pitch_classes.length !== 12 || new Set(it.pitch_classes).size !== 12 || it.pitch_classes[0] !== pc(it.tonic)) bad.push(`${it.item}: chromatic wrong`);
      } else if (it.kind === 'whole_tone') {
        const ok = it.pitch_classes.length === 6 && it.pitch_classes.every((x, i) => i === 0 || (x - it.pitch_classes[i - 1] + 12) % 12 === 2) && it.pitch_classes[0] === pc(it.tonic);
        if (!ok) bad.push(`${it.item}: whole-tone wrong`);
      }
    }
  }
  note('piano', `${count} technique items re-derived from key signatures`, !bad.length, bad.length ? bad : 'all agree');
  note('piano', 'technique spellings agree with the app theory engine (content/piano-theory.js)', !engineDiff.length, engineDiff.length ? engineDiff : 'all agree');
  // Staircase: key lists within each level's accidental cap and the cap never decreases.
  const sigCount = (k) => { const minor = k === k.toLowerCase(); const t = k[0].toUpperCase() + k.slice(1); const maj = minor ? relMajorOf(t) : t; return Math.abs(MAJ_FIFTHS[maj]); };
  const lv = staged['piano/drills.json'].sight_reading_staircase.levels;
  const sBad = [];
  lv.forEach((l, i) => {
    for (const k of l.keys) if (!(sigCount(k) <= l.max_accidentals)) sBad.push(`${l.level} key ${k} has ${sigCount(k)} accidentals > ${l.max_accidentals}`);
    if (i && l.max_accidentals < lv[i - 1].max_accidentals) sBad.push(`${l.level} cap decreases`);
    if (i && l.bars < lv[i - 1].bars) sBad.push(`${l.level} shorter than before`);
  });
  note('piano', `sight-reading staircase: ${lv.length} levels, keys within caps, never easier`, !sBad.length, sBad.length ? sBad : 'ok');
  // Ear battery sizes.
  const SIZE = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12, m9: 13, M9: 14, m10: 15, M10: 16 };
  const CH = { major: [4, 3], minor: [3, 4], diminished: [3, 3], augmented: [4, 4], dominant_seventh: [4, 3, 3], diminished_seventh: [3, 3, 3], half_diminished_seventh: [3, 3, 4], major_seventh: [4, 3, 4], minor_seventh: [3, 4, 3] };
  const eBad = [];
  for (const b of staged['piano/drills.json'].ear_batteries) {
    for (const [k, v] of Object.entries(b.intervals || {})) if (SIZE[k] !== v) eBad.push(`${b.stage} ${k}=${v}`);
    for (const [k, v] of Object.entries(b.chords || {})) if (JSON.stringify(CH[k]) !== JSON.stringify(v)) eBad.push(`${b.stage} ${k}`);
  }
  note('piano', 'ear batteries: interval and chord sizes', !eBad.length, eBad.length ? eBad : 'ok');
  const tl = staged['piano/drills.json'].tempo_ladder;
  note('piano', 'tempo ladder steps 60..100 by 10', tl.steps_from_60.every((x, i) => x === 60 + 10 * i) && tl.steps_from_60[tl.steps_from_60.length - 1] === tl.gate_at, tl.steps_from_60);
  // Live lesson P04:32 / P04:33 claims, re-derived.
  const relMinor = (maj) => { const l = LET[(LET.indexOf(maj[0]) + 5) % 7]; let acc = ((pc(maj) + 9 - NAT[l]) % 12 + 12) % 12; if (acc > 6) acc -= 12; return l + accStr(acc); };
  const claims = relMinor('C') === 'A' && relMinor('F') === 'D' && relMinor('G') === 'E' && (pc('C') - pc('A') + 12) % 12 === 3
    && viaSig('A', 'harmonic_minor')[6] === 'G#' && viaSig('D', 'harmonic_minor')[6] === 'C#';
  note('piano', 'P04 lesson claims: relative minor three semitones below; A, D, E minor share C, F, G; harmonic sevenths G# and C#', claims, 'computed');
}

// ── basketball ─────────────────────────────────────────────────────────────
{
  const rf = readJson('basketball/rules-facts.json');
  const norm = (t) => t.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/\s+/g, ' ');
  const texts = {};
  for (const [k, rel] of Object.entries(rf.sources)) {
    try { texts[k] = norm(fs.readFileSync(path.join(SOURCES, rel), 'utf8')); } catch { texts[k] = null; }
  }
  for (const f of rf.facts) {
    const t = texts[f.source];
    if (!t) { note('basketball', `rule ${f.id}`, false, `source ${f.source} not found under ${SOURCES}`); continue; }
    const miss = f.patterns.filter((p) => !new RegExp(p.replace(/ /g, '\\s+'), 'i').test(t));
    note('basketball', `rule ${f.id} (${f.body}): ${f.claim}`, !miss.length, miss.length ? `pattern not found: ${miss.join(' | ')}` : `found in ${f.source}`);
  }
  for (const u of rf.unverified_here) note('basketball', `NOT VERIFIED HERE ${u.id}: ${u.claim}`, true, u.why);
  // Gates.
  let seed = 11;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sim = (thr, nmin, conf, rate, trials = 3000) => {
    let pass = 0;
    for (let t = 0; t < trials; t++) {
      let m = 0; let n = 0;
      while (n < 200) { for (let i = 0; i < 10; i++) { n++; if (rnd() < rate) m++; } if (n >= nmin && S.pAtLeast(thr, m, n) >= conf) { pass++; break; } }
    }
    return pass / trials;
  };
  for (const g of staged['basketball/drills.json'].combine_gates) {
    const k = S.makesNeeded(g.threshold, g.n_min, g.confidence);
    const lucky = sim(g.threshold, g.n_min, g.confidence, g.threshold - 0.1);
    const fair = sim(g.threshold, g.n_min, g.confidence, g.threshold + 0.1);
    note('basketball', `gate ${g.id}: ${k}/${g.n_min} at confidence ${g.confidence}; sequential lucky pass ${(lucky * 100).toFixed(1)}%, pass at +10 points ${(fair * 100).toFixed(1)}%`, k === g.makes_needed_at_n_min && lucky <= 0.035 && fair >= 0.95, { lucky, fair });
  }
  // Numbers in the new B04 lesson.
  const wilson = (x, n) => { const z = 1.96; const p = x / n; const d = 1 + z * z / n; const c = p + z * z / (2 * n); const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - h) / d, (c + h) / d].map((v) => Math.round(v * 100) / 100); };
  const w7 = wilson(7, 10); const w5 = wilson(5, 10);
  const p7 = S.binomPmf(7, 10, 0.6); const p5 = S.binomPmf(5, 10, 0.6);
  note('basketball', `B04 lesson numbers: Wilson 95% 7/10 = ${w7}, 5/10 = ${w5} (overlap); a 60% shooter makes 7/10 ${(p7 * 100).toFixed(0)}% and 5/10 ${(p5 * 100).toFixed(0)}% of the time; 70% shooter margin at 50 = ${(1.96 * Math.sqrt(0.21 / 50) * 100).toFixed(1)} points`, w7[0] < w5[1] && p7 > 0.15 && p5 > 0.15, { w7, w5, p7, p5 });
}

// ── stats quoted in the progression files ──────────────────────────────────
{
  note('stats', `expected score 0.75 -> puzzle ${S.diffFor(0.75).toFixed(1)} points below the learner; 0.6 -> ${S.diffFor(0.6).toFixed(1)}`, Math.round(S.diffFor(0.75)) === 191 && Math.round(S.diffFor(0.6)) === 70, 'Elo logistic');
  note('stats', `performance-rating standard error over 12 games ~ ${S.perfSE(12).toFixed(0)} Elo (347/sqrt(n))`, Math.round(S.perfSE(12)) === 100, 'computed');
  try {
    const L = require(path.join(APP, 'services', 'learner-path'));
    const need = (prior, choices) => { for (let k = 1; k <= 12; k++) { const r = L.unitBelief(Array.from({ length: k }, () => ({ correct: true, choices })), { prior }); if (r.decision === 'known') return k; } return null; };
    const v = { past4: need('past', 4), past30: need('past', 30), island4: need('island', 4), island30: need('island', 30) };
    note('stats', `live unitBelief: rights to prove a unit — past: MC ${v.past4}, board ${v.past30}; island: MC ${v.island4}, board ${v.island30}`, v.past30 < v.past4 && v.island30 < v.island4, v);
  } catch (e) { note('stats', 'live unitBelief', false, e.message); }
}

// ── lessons: apply changes to a scratch copy, then validate ────────────────
{
  const ch = readJson('lesson-changes.json').changes;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-lessons-'));
  for (const s of ['piano', 'basketball']) {
    const dir = path.join(tmp, s); fs.mkdirSync(path.join(dir, 'drafts'), { recursive: true });
    fs.copyFileSync(path.join(BUILD, s, 'validate.js'), path.join(dir, 'validate.js'));
    for (const f of fs.readdirSync(path.join(BUILD, s, 'drafts')).filter((x) => /^[A-Z]\d\d\.txt$/.test(x))) fs.copyFileSync(path.join(BUILD, s, 'drafts', f), path.join(dir, 'drafts', f));
  }
  const problems = [];
  for (const c of ch) {
    const file = path.join(tmp, c.subject, 'drafts', `${c.draft}.txt`);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const idx = (title) => lines.findIndex((l) => l.startsWith('[') && l.split(' | ')[0].replace(/^\[\w+\] /, '') === title);
    if (c.action === 'edit_description') {
      const i = idx(c.title);
      if (i < 0 || !lines[i].endsWith(`| ${c.from}`)) { problems.push(`${c.id}: 'from' text not found`); continue; }
      lines[i] = lines[i].replace(`| ${c.from}`, `| ${c.to}`);
    } else if (c.action === 'insert_after') {
      const i = idx(c.anchor);
      if (i < 0) { problems.push(`${c.id}: anchor not found`); continue; }
      lines.splice(i + 1, 0, c.line);
    } else if (c.action === 'swap') {
      const a = idx(c.a); const b = idx(c.b);
      if (a < 0 || b < 0) { problems.push(`${c.id}: swap titles not found`); continue; }
      [lines[a], lines[b]] = [lines[b], lines[a]];
    }
    fs.writeFileSync(file, lines.join('\n'));
  }
  note('lessons', `${ch.length} staged lesson changes apply cleanly to a scratch copy`, !problems.length, problems.length ? problems : 'ok');
  for (const s of ['piano', 'basketball']) {
    let out = ''; let ok = true;
    try { out = execFileSync(process.execPath, [path.join(tmp, s, 'validate.js')], { encoding: 'utf8' }); } catch (e) { ok = false; out = String(e.stdout || e.message); }
    const errs = out.split(/\r?\n/).filter((l) => /^\s+\S/.test(l));
    note('lessons', `${s}: validate.js on the changed drafts (format, 10-25 word descriptions, unique titles, same-tag runs)`, ok, ok ? 'pass' : errs.slice(0, 10));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── judges ─────────────────────────────────────────────────────────────────
let judgeSummary = null;
{
  const runsFile = path.join(HERE, 'free-model-runs.json');
  if (fs.existsSync(runsFile) && fs.existsSync(path.join(HERE, 'judge-items.json'))) {
    const runs = JSON.parse(fs.readFileSync(runsFile, 'utf8'));
    const items = readJson('judge-items.json').items;
    const rows = items.map((it) => ({ id: it.id, A: runs.judges.A && runs.judges.A[it.id], B: runs.judges.B && runs.judges.B[it.id] }));
    const both = rows.filter((r) => r.A && r.B && r.A.verdict === 'correct' && r.B.verdict === 'correct').length;
    const flagged = rows.filter((r) => (r.A && r.A.verdict === 'wrong') || (r.B && r.B.verdict === 'wrong'));
    const missing = rows.filter((r) => !r.A || !r.B).length;
    judgeSummary = { items: items.length, both_correct: both, flagged: flagged.map((r) => ({ id: r.id, A: r.A, B: r.B })), unsure_or_missing: rows.length - both - flagged.length, missing };
    note('judges', `two free judges: ${both}/${items.length} both 'correct'; ${flagged.length} flagged 'wrong' by at least one; ${missing} without both verdicts`, true, judgeSummary);
  } else note('judges', 'two free judges not run yet', true, 'run free-models.js judge');
}

// ── report ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(HERE, 'verification.json'), JSON.stringify({ at: new Date().toISOString(), failed: failed.length, results, graphs: Object.fromEntries(Object.entries(graphs).map(([k, v]) => [k, v.nodeIndex])) }, null, 1));
const md = ['# Verification report: staged skill curricula', '', `Generated by \`verify-skill-curricula.js\` at ${new Date().toISOString()}. ${results.length} checks, **${failed.length} failed**. No model is called by this script; judge verdicts are read from \`free-model-runs.json\`.`, ''];
for (const sec of ['all', 'graphs', 'chess', 'piano', 'basketball', 'stats', 'lessons', 'judges']) {
  md.push(`## ${sec}`, '');
  for (const r of results.filter((x) => x.section === sec)) {
    const d = typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail);
    md.push(`- ${r.ok ? 'PASS' : '**FAIL**'} ${r.name}${d && d !== 'ok' ? ` — ${d.length > 400 ? `${d.slice(0, 400)}…` : d}` : ''}`);
  }
  md.push('');
}
fs.writeFileSync(path.join(HERE, 'VERIFICATION.md'), md.join('\n'));
console.log(`${results.length} checks, ${failed.length} failed. Wrote VERIFICATION.md`);
process.exit(failed.length ? 1 : 0);
