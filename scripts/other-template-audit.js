/**
 * Render every built-in Piano, Chess and Basketball question and check what comes out.
 *
 *   node scripts/other-template-audit.js               audit; exits 1 on any flag
 *   node scripts/other-template-audit.js --skill=chess_mate   one skill only
 *   node scripts/other-template-audit.js --examples=5  more examples per problem
 *   node scripts/other-template-audit.js --show=2      also print renderings per family
 *   node scripts/other-template-audit.js --seeds=2     scale the seeded sample counts
 *
 * These three subjects have no AI in their fallback bank: content/piano-items.js
 * (with the theory engine in piano-theory.js), content/chess-items.js (with the
 * rules in chess-board.js) and content/basketball-items.js. Their answers are
 * computed, so they look trustworthy, and a computed answer is exactly as right as
 * the model it was computed from. So this does not trust the generators or their
 * engines. It reads the rendered prompt, rebuilds the question from what the
 * learner is shown, and works it again by its own route:
 *
 *   piano       intervals, chord spellings, key signatures, relative keys, scale
 *               degrees (every form of minor), note names and enharmonics, staff
 *               positions, rhythm values and time signatures, the keyboard layout,
 *               the ii-V-I — each from a small model written here, not from
 *               piano-theory.js. The engine itself is also checked exhaustively
 *               against that model (every key, every interval from every note,
 *               every chord on every root).
 *   chess       the position is rebuilt from the prompt's piece list and compared
 *               with the item's FEN; FENs must be legal positions with the side to
 *               move the prompt names; every keyed move must be legal and do what
 *               the prompt asks (mate is mate, a fork forks and wins material by a
 *               search written here, a "winning capture" wins material and is the
 *               only capture that does); no second move may also be correct unless
 *               it is accepted; the rule-of-the-square answer is solved as a race;
 *               notation is re-written from the move; square colours, the starting
 *               position and move counts are worked from scratch. The puzzle
 *               trainer's set (chess-puzzles.js) is re-verified with the solver,
 *               and the Lichess import (chess-puzzles-lichess.js, CC0) is replayed
 *               move by move: lines legal, mates end in mate, mate-in-1 proved
 *               unique for all and mate-in-2 for every fifth, ratings in their
 *               bands, the Stockfish check recorded.
 *   basketball  the stat line must be a possible one (no more two-point makes than
 *               two-point attempts) and every percentage and possession estimate is
 *               recomputed in exact integer arithmetic.
 *   pools       every authored item in all three subjects is checked for form and
 *               against REVIEWED below: the key each one was fact-checked with (and,
 *               for basketball, the rulebook that says so, naming NBA, FIBA, NCAA or
 *               NFHS where they differ). A new or edited pool item is flagged until
 *               someone checks it and records it there. Chess opening lines in the
 *               pools are replayed move by move.
 *
 * Every item is also checked for template debris (undefined, NaN, "${"), spacing,
 * doubled words, a/an, the key among the choices, duplicate choices, enough choices
 * (two only for an explicitly binary pair such as Yes/No or Dark/Light), the key not
 * always sitting in the same slot, the same question keyed two ways, and grading:
 * the key and every accepted spelling grade correct, and every other choice grades
 * wrong.
 *
 * No model is called and nothing is written.
 */
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}

// The bank loads every subject; another subject's file being mid-edit must not
// stop this audit, so it falls back to a copy of the bank's normalize step.
let bank = null;
try { bank = require('../content/bank'); } catch (e) {
  console.log(`note: content/bank.js did not load (${String(e.message).split(/\r?\n/)[0]}); rendering through a copy of its normalize step`);
}
const { makeRng } = require('../content/rng');
const { grade } = require('../services/grading');
const C = require('../content/chess-board');
const T = require('../content/piano-theory');
const S = require('../content/chess-solver');
const PUZZLES = require('../content/chess-puzzles');
let LICHESS_PUZZLES = [];
try { LICHESS_PUZZLES = require('../content/chess-puzzles-lichess'); } catch { /* not imported */ }
const { fenProblem } = require('../services/chess-checks');
const PIANO = require('../content/piano-items');
const CHESS = require('../content/chess-items');
const BB = require('../content/basketball-items');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = arg('skill', null);
const EXAMPLES = Number(arg('examples', 2));
const SHOW = Number(arg('show', 0));
const SCALE = Number(arg('seeds', 1));

/** Seeds per difficulty (ten difficulties). The heavy chess generators search positions. */
const SEEDS = {
  default: 120,
  chess_mate: 12, chess_tactics: 10, chess_endgame: 40, chess_notation: 30,
};
const seedsFor = (skill) => Math.max(1, Math.round((SEEDS[skill] || SEEDS.default) * SCALE));

// ── report ──────────────────────────────────────────────────────────────────
const report = new Map();
function fam(key) {
  if (!report.has(key)) report.set(key, { rendered: 0, flags: new Map(), samples: [], positions: [], sets: new Set(), keys: new Set() });
  return report.get(key);
}
function flag(f, code, detail, it) {
  const e = f.flags.get(code) || { n: 0, ex: [] };
  e.n++;
  if (e.ex.length < EXAMPLES) e.ex.push({ detail, prompt: it ? it.prompt : '', choices: it && it.choices, answer: it ? it.answer : '' });
  f.flags.set(code, e);
}

// ── checks every item gets ──────────────────────────────────────────────────
const BINARY_OK = [['Yes', 'No'], ['Dark', 'Light']].map((pair) => pair.slice().sort().join('|'));
const RX = {
  debris: /undefined|NaN|\[object|\bnull\b|\$\{|\{\{|Infinity/,
  spaces: / {2,}|^\s|\s$| \n|\n /,
  spaceBeforeMark: /[A-Za-z0-9)] [,.;:!?](?=\s|$)/,
  doubled: /\b([A-Za-z]{2,}) \1\b/i,
  // Case matters: "from A up" is a note, not an article, and "an NBA game" is said "en-bee-ay".
  aVowel: /\ba (?!one\b|uni|use|usu|eu)[aeiou]\w*/,
  // A single letter is said by name: "an x for a capture".
  anConsonant: /(?:\ban|^An) (?!hour|honest|honou?r|[a-z]\b)[b-df-hj-np-tv-z]\w*/,
  aNoteLetter: /\ba [AEF](?:#|b|##|bb)?(?=[\s,.?)]|$)/,
  aNumber: /\ba (8\d*|11|18)\b/,
  lowerAfterStop: /[a-z]\. [a-z]/,
  // Arithmetic on a count that comes out as 1: "wins 1 points".
  // A square ("g1 moves") and a box-score "of" ("1 of 1 threes") are not counts.
  onePlural: /(^|[^\w.])(?<!of )1 (points|moves|king moves|squares|beats|half steps|sharps|flats|seconds|minutes|steps|letters|names|attempts|threes|twos|free throws)\b/,
};

function textChecks(f, it) {
  const own = [it.prompt, it.answer, it.rationale, ...(it.accepts || [])];
  for (const t of own.concat(it.choices || [])) {
    if (RX.debris.test(String(t))) { flag(f, 'debris', String(t).slice(0, 100), it); break; }
  }
  for (const t of own) {
    const s = String(t);
    if (RX.spaces.test(s)) flag(f, 'spacing', JSON.stringify(s.slice(0, 80)), it);
    if (RX.spaceBeforeMark.test(s)) flag(f, 'space-before-mark', s.match(RX.spaceBeforeMark)[0], it);
    const d = s.match(RX.doubled);
    if (d && !/^(that|had|is)$/i.test(d[1])) flag(f, 'doubled-word', d[0], it);
    if (RX.onePlural.test(s)) flag(f, 'one-plural', s.match(RX.onePlural)[0].trim(), it);
    if (RX.lowerAfterStop.test(s.replace(/\b(e\.g|i\.e|vs|etc)\./g, ''))) flag(f, 'sentence-capital', s.match(RX.lowerAfterStop)[0], it);
    for (const code of ['aVowel', 'anConsonant', 'aNoteLetter', 'aNumber']) {
      const m = s.match(RX[code]);
      if (m) flag(f, 'a-an', m[0], it);
    }
  }
  if (!/^[A-Z0-9"']/.test(it.prompt)) flag(f, 'prompt-capital', it.prompt.slice(0, 40), it);
  if (!it.rationale || it.rationale.length < 12) flag(f, 'no-rationale', it.rationale, it);
}

function formChecks(f, it) {
  if (it.format === 'multiple_choice') {
    const ch = it.choices || [];
    if (!ch.includes(it.answer)) flag(f, 'key-not-in-choices', it.answer, it);
    if (new Set(ch).size !== ch.length) flag(f, 'duplicate-choices', ch.join(' | '), it);
    if (ch.length < 3 && !(ch.length === 2 && BINARY_OK.includes(ch.slice().sort().join('|')))) flag(f, 'too-few-choices', `${ch.length} choices`, it);
    if (!grade(it, it.answer).correct) flag(f, 'grading', 'the key grades wrong', it);
    for (const c of ch) if (c !== it.answer && grade(it, c).correct) flag(f, 'grading', `the wrong choice "${c}" grades correct`, it);
    f.positions.push(ch.indexOf(it.answer));
    f.sets.add(ch.slice().sort().join('|'));
  } else {
    if (it.choices) flag(f, 'stray-choices', '', it);
    for (const a of [it.answer, ...(it.accepts || [])]) if (!grade(it, a).correct) flag(f, 'grading', `accepted answer "${a}" grades wrong`, it);
    if (grade(it, '').correct) flag(f, 'grading', 'a blank answer grades correct', it);
  }
  f.keys.add(it.answer);
}

const seen = new Map(); // skill -> question -> key
function contradiction(f, skill, it) {
  const q = `${it.prompt}||${(it.choices || []).slice().sort().join('|')}`;
  const bySkill = seen.get(skill) || new Map();
  seen.set(skill, bySkill);
  if (bySkill.has(q) && bySkill.get(q) !== it.answer) flag(f, 'same-question-two-keys', `${bySkill.get(q)} vs ${it.answer}`, it);
  bySkill.set(q, it.answer);
}

function positionBias() {
  for (const [key, f] of report) {
    if (f.positions.length < 30 || f.sets.size < 2) continue;
    const counts = {};
    for (const p of f.positions) counts[p] = (counts[p] || 0) + 1;
    const [slot, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (n / f.positions.length >= 0.9) flag(f, 'key-always-same-slot', `the key is choice ${Number(slot) + 1} in ${n} of ${f.positions.length} renderings`, null);
    void key;
  }
}

// ── piano: an independent model ─────────────────────────────────────────────
const LET = 'CDEFGAB';
const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC = { '': 0, '#': 1, '##': 2, x: 2, b: -1, bb: -2 };
const ACC_TEXT = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };
function note(n) {
  const m = /^([A-G])(##|x|#|bb|b)?$/.exec(String(n).trim());
  return m ? { l: m[1], a: ACC[m[2] || ''] } : null;
}
const pcOf = (n) => { const x = note(n); return ((NAT[x.l] + x.a) % 12 + 12) % 12; };
/** The note `steps` letters and `semis` half steps above `from`, by counting naturals. */
function up(from, steps, semis) {
  const x = note(from);
  const li = LET.indexOf(x.l);
  const l2 = LET[(li + steps) % 7];
  let natural = NAT[l2] - NAT[x.l];
  if (li + steps >= 7) natural += 12;
  const a = x.a + semis - natural;
  return a < -2 || a > 2 ? null : l2 + ACC_TEXT[a];
}
const PATTERNS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodic: [0, 2, 3, 5, 7, 9, 11],
};
const spellScale = (tonic, form) => PATTERNS[form].map((s, i) => up(tonic, i, s));
function signatureOf(tonic, minor) {
  const sc = spellScale(tonic, minor ? 'natural' : 'major');
  if (sc.includes(null)) return null;
  const accs = sc.map((n) => note(n).a);
  if (accs.some((a) => Math.abs(a) > 1) || (accs.some((a) => a > 0) && accs.some((a) => a < 0))) return null;
  return accs.reduce((s, a) => s + a, 0);
}
const NUM = { unison: 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7, octave: 8 };
const PERFECT_BASE = { 1: 0, 4: 5, 5: 7, 8: 12 };
const MAJOR_BASE = { 2: 2, 3: 4, 6: 9, 7: 11 };
function intervalBetween(a, b) {
  const x = note(a); const y = note(b);
  const steps = (LET.indexOf(y.l) - LET.indexOf(x.l) + 7) % 7;
  const number = steps + 1;
  const semis = (pcOf(b) - pcOf(a) + 12) % 12;
  const label = number === 1 ? 'unison' : ['', '', '2nd', '3rd', '4th', '5th', '6th', '7th'][number];
  if (number in PERFECT_BASE) {
    const q = { 0: 'perfect', 1: 'augmented', '-1': 'diminished' }[semis - PERFECT_BASE[number]];
    return q ? `${q} ${label}` : null;
  }
  const q = { 0: 'major', '-1': 'minor', 1: 'augmented', '-2': 'diminished' }[semis - MAJOR_BASE[number]];
  return q ? `${q} ${label}` : null;
}
function intervalSize(name) {
  const m = /^(perfect|major|minor|augmented|diminished) (unison|2nd|3rd|4th|5th|6th|7th|octave)$/.exec(name);
  if (!m) return null;
  const number = NUM[m[2]];
  if (number in PERFECT_BASE) return { steps: number - 1, semis: PERFECT_BASE[number] + { perfect: 0, augmented: 1, diminished: -1 }[m[1]] };
  return { steps: number - 1, semis: MAJOR_BASE[number] + { major: 0, minor: -1, augmented: 1, diminished: -2 }[m[1]] };
}
const CHORD_MODEL = {
  major: { sym: '', parts: [[2, 4], [4, 7]] },
  minor: { sym: 'm', parts: [[2, 3], [4, 7]] },
  diminished: { sym: 'dim', parts: [[2, 3], [4, 6]] },
  augmented: { sym: 'aug', parts: [[2, 4], [4, 8]] },
  'major 7th': { sym: 'maj7', parts: [[2, 4], [4, 7], [6, 11]] },
  'dominant 7th': { sym: '7', parts: [[2, 4], [4, 7], [6, 10]] },
  'minor 7th': { sym: 'm7', parts: [[2, 3], [4, 7], [6, 10]] },
  'half-diminished 7th': { sym: 'm7b5', parts: [[2, 3], [4, 6], [6, 10]] },
  'diminished 7th': { sym: 'dim7', parts: [[2, 3], [4, 6], [6, 9]] },
};
function spellChord(root, quality) {
  const out = [root, ...CHORD_MODEL[quality].parts.map(([s, n]) => up(root, s, n))];
  return out.includes(null) ? null : out;
}
function chordFromSymbol(sym) {
  const m = /^([A-G](?:##|#|bb|b)?)(.*)$/.exec(sym);
  if (!m) return null;
  const q = Object.keys(CHORD_MODEL).find((k) => CHORD_MODEL[k].sym === m[2]);
  return q ? spellChord(m[1], q) : null;
}
const NOTE_NAMES = [];
for (const l of LET) for (const a of ['', '#', 'b']) NOTE_NAMES.push(l + a);
/** Every common name (single accidental) for a pitch class. */
const namesOfPc = (pc) => NOTE_NAMES.filter((n) => pcOf(n) === pc && !/^(E#|B#|Cb|Fb)$/.test(n));
/** Every spelling, doubles included, that the learner might type for a key. */
const xForm = (n) => String(n).replace(/##/g, 'x');

const STAFF_BASE = { treble: LET.indexOf('E') + 4 * 7, bass: LET.indexOf('G') + 2 * 7 };
const ORD_WORD = { first: 1, second: 2, third: 3 };
function staffPosition(text) {
  let m = /^line (\d)\b/.exec(text) || /^the (\d)(?:st|nd|rd|th) line\b/.exec(text);
  if (m) return 2 * (Number(m[1]) - 1);
  m = /^space (\d)\b/.exec(text) || /^the (\d)(?:st|nd|rd|th) space\b/.exec(text);
  if (m) return 2 * Number(m[1]) - 1;
  m = /^the (first|second|third) ledger line (below|above) the staff$/.exec(text);
  if (m) return m[2] === 'below' ? -2 * ORD_WORD[m[1]] : 8 + 2 * ORD_WORD[m[1]];
  if (text === 'the space just below the staff') return -1;
  if (text === 'the space just above the staff') return 9;
  m = /^the space just (below|above) (?:the (first|second|third) ledger line|ledger line (\d)) (below|above)(?: the staff)?$/.exec(text);
  if (m) {
    const n = m[2] ? ORD_WORD[m[2]] : Number(m[3]);
    return m[1] === 'below' ? -2 * n - 1 : 8 + 2 * n + 1;
  }
  return null;
}
const RHYTHM = { 'whole note': 4, 'dotted half note': 3, 'half note': 2, 'dotted quarter note': 1.5, 'quarter note': 1, 'eighth note': 0.5, 'sixteenth note': 0.25 };
const BLACK_GROUPS = { two: [1, 3], three: [6, 8, 10] };
const WHITE_NAME = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

function pianoItem(f, it, skill) {
  const p = it.prompt;
  const key = it.answer;
  const keyIs = (want, what) => { if (key !== want) flag(f, 'wrong-key', `${what}: keyed "${key}", should be "${want}"`, it); };
  let m;
  // keyboard landmarks
  m = /^Which white key sits (just to the left of|just to the right of|between the two black keys of) a group of (two|three) black keys\?$/.exec(p)
    || /^Which white key sits between the two black keys of a group of (two)\?$/.exec(p);
  if (m) {
    const where = m.length === 3 ? m[1] : 'between the two black keys of';
    const group = BLACK_GROUPS[m.length === 3 ? m[2] : m[1]];
    const pc = where.includes('left') ? group[0] - 1 : where.includes('right') ? group[group.length - 1] + 1 : group[0] + 1;
    return keyIs(WHITE_NAME[(pc + 12) % 12], 'keyboard landmark');
  }
  m = /^What key is a half step (above|below) ([A-G])\?$/.exec(p);
  if (m) {
    const pc = (pcOf(m[2]) + (m[1] === 'above' ? 1 : 11)) % 12;
    if (pcOf(key) !== pc) flag(f, 'wrong-key', `keyed ${key}, a half step ${m[1]} ${m[2]} is pitch class ${namesOfPc(pc).join('/')}`, it);
    for (const n of namesOfPc(pc)) if (!grade(it, n).correct) flag(f, 'grading', `"${n}" is that key and grades wrong`, it);
    for (const n of NOTE_NAMES) if (pcOf(n) !== pc && grade(it, n).correct) flag(f, 'grading', `"${n}" is not that key and grades correct`, it);
    return;
  }
  m = /^How many half steps is it from ([A-G]) up to ([A-G])\?$/.exec(p);
  if (m) return keyIs(String((pcOf(m[2]) - pcOf(m[1]) + 12) % 12), 'half steps');
  m = /^In the (treble|bass) clef, which note sits on (.+?)\?/.exec(p);
  if (m) {
    const pos = staffPosition(m[2]);
    if (pos == null) return flag(f, 'no-verifier', `staff position "${m[2]}" not understood`, it);
    const idx = STAFF_BASE[m[1]] + pos;
    const letter = LET[idx % 7];
    keyIs(letter, `${m[1]} ${m[2]}`);
    const oct = Math.floor(idx / 7);
    if (!it.rationale.includes(`${letter}${oct}`)) flag(f, 'rationale', `rationale should name ${letter}${oct}`, it);
    if ((letter === 'C' && oct === 4) !== /middle C/.test(it.rationale)) flag(f, 'rationale', 'middle C named wrongly', it);
    if (!/count|from the bottom/i.test(p) && pos >= 0 && pos <= 8) flag(f, 'ambiguous', 'a staff line or space number without saying it counts from the bottom', it);
    return;
  }
  m = /^How many eighth notes fill one bar of (\d+)\/(\d+)\?$/.exec(p);
  if (m) return keyIs(String(Number(m[1]) * 8 / Number(m[2])), 'time signature');
  m = /^Counting a quarter note as one beat, how many beats do these notes last together: (.+)\?$/.exec(p);
  if (m) {
    let total = 0;
    for (const part of m[1].split(', ')) {
      const w = /^(a|an) (.+)$/.exec(part);
      if (!w || !(w[2] in RHYTHM)) return flag(f, 'no-verifier', `note value "${part}" not understood`, it);
      if ((w[1] === 'an') !== /^[aeiou]/.test(w[2])) flag(f, 'a-an', part, it);
      total += RHYTHM[w[2]];
    }
    if (Number(key) !== total) flag(f, 'wrong-key', `keyed ${key}, the notes add to ${total}`, it);
    return;
  }
  m = /^How many sharps or flats are in the key signature of ([A-G][#b]?) (major|minor)\?$/.exec(p);
  if (m) {
    const n = signatureOf(m[1], m[2] === 'minor');
    if (n == null) return flag(f, 'wrong-key', `${m[1]} ${m[2]} is not a key with a standard signature`, it);
    return keyIs(n === 0 ? 'none' : `${Math.abs(n)} ${n > 0 ? 'sharp' : 'flat'}${Math.abs(n) > 1 ? 's' : ''}`, 'signature');
  }
  m = /^What is the relative (minor|major) of ([A-G][#b]?) (major|minor)\?$/.exec(p);
  if (m) {
    const want = m[1] === 'minor' ? spellScale(m[2], 'major')[5] : spellScale(m[2], 'natural')[2];
    keyIs(want, 'relative key');
    for (const c of it.choices || []) if (c !== key && pcOf(c) === pcOf(want)) flag(f, 'second-correct', `"${c}" ${m[1]} is the same key spelled enharmonically`, it);
    return;
  }
  m = /^What is the (\d)(?:st|nd|rd|th) note of the ([A-G][#b]?) (major|natural minor|harmonic minor|melodic minor \(ascending\)) scale\? Spell it with the right sharp or flat\.$/.exec(p);
  if (m) {
    const form = m[3] === 'major' ? 'major' : m[3].split(' ')[0];
    const want = spellScale(m[2], form)[Number(m[1]) - 1];
    keyIs(want, `${m[2]} ${m[3]} degree ${m[1]}`);
    if (/##/.test(key) && !grade(it, xForm(key)).correct) flag(f, 'grading', `the double sharp written "${xForm(key)}" grades wrong`, it);
    for (const n of namesOfPc(pcOf(want))) if (n !== want && grade(it, n).correct) flag(f, 'grading', `the misspelling "${n}" grades correct`, it);
    return;
  }
  m = /^What is the interval from ([A-G](?:##|#|bb|b)?) up to ([A-G](?:##|#|bb|b)?)\?$/.exec(p);
  if (m) {
    const want = intervalBetween(m[1], m[2]);
    keyIs(want, 'interval');
    const same = (it.choices || []).filter((c) => c === want);
    if (same.length !== 1) flag(f, 'second-correct', `${same.length} choices name ${want}`, it);
    return;
  }
  m = /^What note is an? ((?:perfect|major|minor|augmented|diminished) (?:unison|2nd|3rd|4th|5th|6th|7th|octave)) above ([A-G](?:##|#|bb|b)?)\? Spell it correctly\.$/.exec(p);
  if (m) {
    const size = intervalSize(m[1]);
    const want = up(m[2], size.steps, size.semis);
    keyIs(want, `${m[1]} above ${m[2]}`);
    if (/##/.test(key) && !grade(it, xForm(key)).correct) flag(f, 'grading', `the double sharp written "${xForm(key)}" grades wrong`, it);
    return;
  }
  m = /^Spell the ([A-G](?:#|b)?) (major|minor|diminished|augmented|major 7th|dominant 7th|minor 7th|half-diminished 7th|diminished 7th) chord \((.+?)\) from the root up, notes separated by spaces\.$/.exec(p);
  if (m) {
    const want = spellChord(m[1], m[2]);
    if (!want) return flag(f, 'wrong-key', 'the chord cannot be spelled', it);
    keyIs(want.join(' '), `${m[1]} ${m[2]}`);
    if (m[3] !== m[1] + CHORD_MODEL[m[2]].sym) flag(f, 'wrong-symbol', `${m[1]} ${m[2]} is written ${m[1] + CHORD_MODEL[m[2]].sym}, not ${m[3]}`, it);
    if (key.includes('##') && !grade(it, xForm(key)).correct) flag(f, 'grading', `"${xForm(key)}" grades wrong`, it);
    return;
  }
  m = /^Which chord symbol names the notes (.+)\?$/.exec(p);
  if (m) {
    const notes = m[1];
    const right = (it.choices || []).filter((c) => { const s = chordFromSymbol(c); return s && s.join(' ') === notes; });
    if (right.length !== 1 || right[0] !== key) flag(f, 'wrong-key', `choices that spell ${notes}: ${right.join(', ') || 'none'}; keyed ${key}`, it);
    return;
  }
  m = /^Which is the ii-V-I progression in ([A-G][#b]?) major\?$/.exec(p);
  if (m) {
    const sc = spellScale(m[1], 'major');
    const want = `${sc[1]}m7 ${sc[4]}7 ${m[1]}maj7`;
    keyIs(want, 'ii-V-I');
    if ((it.choices || []).filter((c) => c === want).length !== 1) flag(f, 'second-correct', 'the progression appears more than once', it);
    return;
  }
  flag(f, 'no-verifier', `no piano check recognises this prompt (${skill})`, it);
}

/** The engine against the model: every key, every interval from every spelling, every chord. */
function pianoEngine() {
  const f = fam('piano-theory engine (exhaustive)');
  const it = (p, a) => ({ prompt: p, answer: a });
  for (const [k, n] of Object.entries(T.MAJOR_KEYS)) {
    f.rendered++;
    if (T.majorScale(k).join(' ') !== spellScale(k, 'major').join(' ')) flag(f, 'scale', `${k} major`, it(k, T.majorScale(k).join(' ')));
    if (signatureOf(k, false) !== n) flag(f, 'signature', `${k} major listed with ${n}`, it(k, String(n)));
    if (T.relativeMinor(k) !== spellScale(k, 'major')[5]) flag(f, 'relative', `${k} major`, it(k, T.relativeMinor(k)));
  }
  for (const [k, n] of Object.entries(T.MINOR_KEYS)) {
    for (const form of ['natural', 'harmonic', 'melodic']) {
      f.rendered++;
      if (T.minorScale(k, form).join(' ') !== spellScale(k, form).join(' ')) flag(f, 'scale', `${k} ${form} minor`, it(k, T.minorScale(k, form).join(' ')));
    }
    if (signatureOf(k, true) !== n) flag(f, 'signature', `${k} minor listed with ${n}`, it(k, String(n)));
  }
  const roots = NOTE_NAMES;
  for (const r of roots) {
    for (const [steps, semis, name] of T.INTERVALS) {
      f.rendered++;
      const got = T.above(r, steps, semis);
      const want = up(r, steps, semis);
      if (got !== want) flag(f, 'interval', `${name} above ${r}: engine ${got}, model ${want}`, it(r, String(got)));
      if (want && steps > 0 && steps < 7 && intervalBetween(r, want) !== name) flag(f, 'interval-name', `${r} to ${want} is a ${intervalBetween(r, want)}, table says ${name}`, it(r, name));
    }
    for (const q of Object.keys(T.CHORDS)) {
      f.rendered++;
      const got = T.chord(r, q);
      const want = spellChord(r, q);
      if (JSON.stringify(got) !== JSON.stringify(want)) flag(f, 'chord', `${r} ${q}: engine ${got}, model ${want}`, it(r, String(got)));
      if (T.CHORDS[q].symbol !== CHORD_MODEL[q].sym) flag(f, 'chord-symbol', `${q} written ${T.CHORDS[q].symbol}`, it(r, q));
    }
  }
  for (const clef of ['treble', 'bass']) {
    for (let pos = -6; pos <= 14; pos++) {
      f.rendered++;
      const got = T.staffNote(clef, pos);
      const idx = STAFF_BASE[clef] + pos;
      if (got.letter !== LET[idx % 7] || got.octave !== Math.floor(idx / 7)) flag(f, 'staff', `${clef} ${pos}`, it(clef, got.letter));
      const back = staffPosition(T.describePosition(pos));
      if (back !== pos) flag(f, 'staff-text', `position ${pos} is described as "${T.describePosition(pos)}"`, it(clef, String(back)));
    }
  }
}

// ── chess: rebuilding the position from the prompt ──────────────────────────
function positionFrom(prompt) {
  const w = /White: (.*?)\. Black: (.*?)\. (White|Black) to move\./.exec(prompt);
  if (!w) return null;
  const pos = { board: Array(64).fill(null), side: w[3] === 'White' ? 'w' : 'b', castling: '', ep: -1 };
  for (const [colour, list] of [['w', w[1]], ['b', w[2]]]) {
    for (const part of list.split(', ')) {
      if (!part) continue;
      if (part.startsWith('pawns ')) {
        for (const s of part.slice(6).split(' ')) pos.board[C.sqIndex(s)] = colour === 'w' ? 'P' : 'p';
      } else if (/^[KQRBN][a-h][1-8]$/.test(part)) {
        pos.board[C.sqIndex(part.slice(1))] = colour === 'w' ? part[0] : part[0].toLowerCase();
      } else return null;
    }
  }
  return pos;
}
const placement = (fen) => String(fen).split(' ').slice(0, 2).join(' ');
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(pos, side) {
  let s = 0;
  for (const p of pos.board) if (p) s += (C.colorOf(p) === side ? 1 : -1) * VAL[p.toLowerCase()];
  return s;
}
const MATE = 1000;
/** Material negamax: full width for `depth` plies, then captures (and every reply to check). */
function search(pos, depth, alpha, beta, ply) {
  const moves = C.legalMoves(pos);
  if (!moves.length) return C.inCheck(pos) ? -MATE + ply : 0;
  if (depth <= 0) return quiesce(pos, alpha, beta, ply, 6, moves);
  moves.sort((a, b) => (b.captured ? VAL[b.captured.toLowerCase()] : 0) - (a.captured ? VAL[a.captured.toLowerCase()] : 0));
  for (const m of moves) {
    const v = -search(C.makeMove(pos, m), depth - 1, -beta, -alpha, ply + 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
function quiesce(pos, alpha, beta, ply, left, known) {
  const moves = known || C.legalMoves(pos);
  if (!moves.length) return C.inCheck(pos) ? -MATE + ply : 0;
  const check = C.inCheck(pos);
  const stand = material(pos, pos.side);
  if (!check) {
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
  }
  if (left <= 0) return check ? Math.max(alpha, stand) : alpha;
  let best = check ? -Infinity : alpha;
  for (const m of check ? moves : moves.filter((x) => x.captured || x.promo)) {
    const v = -quiesce(C.makeMove(pos, m), -beta, -Math.max(alpha, best), ply + 1, left - 1);
    if (v >= beta) return v;
    if (v > best) best = v;
  }
  return best === -Infinity ? stand : best;
}
/** What a move wins, in points, for the side making it, searched `depth` plies (the move included). */
function gain(pos, m, depth) {
  return -search(C.makeMove(pos, m), depth - 1, -Infinity, Infinity, 1) - material(pos, pos.side);
}
/** Algebraic notation written from the move, by its own rules. */
function sanOf(pos, m) {
  if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
  const t = m.piece.toLowerCase();
  let s;
  if (t === 'p') s = (m.captured ? `${'abcdefgh'[m.from & 7]}x` : '') + C.sqName(m.to) + (m.promo ? `=${m.promo.toUpperCase()}` : '');
  else {
    const rivals = C.legalMoves(pos).filter((o) => o.to === m.to && o.from !== m.from && o.piece === m.piece);
    let dis = '';
    if (rivals.length) {
      const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7));
      const sameRank = rivals.some((o) => (o.from >> 3) === (m.from >> 3));
      dis = !sameFile ? 'abcdefgh'[m.from & 7] : !sameRank ? String((m.from >> 3) + 1) : C.sqName(m.from);
    }
    s = t.toUpperCase() + dis + (m.captured ? 'x' : '') + C.sqName(m.to);
  }
  const after = C.makeMove(pos, m);
  if (C.inCheck(after)) s += C.legalMoves(after).length ? '+' : '#';
  return s;
}
const START = { 0: 'R', 1: 'N', 2: 'B', 3: 'Q', 4: 'K', 5: 'B', 6: 'N', 7: 'R' };
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const BY_NAME = Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [v, k]));
const sq = (name) => ({ f: 'abcdefgh'.indexOf(name[0]), r: Number(name[1]) - 1 });
const on = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const DIRS = { r: [[1, 0], [-1, 0], [0, 1], [0, -1]], b: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
DIRS.q = DIRS.r.concat(DIRS.b);
const JUMPS = { n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]], k: DIRS.q };
/** Squares a piece reaches from (f, r) given what stands where: own pieces stop it, enemies may be taken. */
function reachFrom(t, f, r, occ) {
  const out = [];
  if (JUMPS[t]) {
    for (const [df, dr] of JUMPS[t]) if (on(f + df, r + dr) && occ(f + df, r + dr) !== 'own') out.push([f + df, r + dr]);
    return out;
  }
  for (const [df, dr] of DIRS[t]) {
    for (let x = f + df, y = r + dr; on(x, y); x += df, y += dr) {
      const o = occ(x, y);
      if (o === 'own') break;
      out.push([x, y]);
      if (o === 'foe') break;
    }
  }
  return out;
}

/** Can White's lone pawn promote and keep its new queen, the white king out of play? */
function raceSolve(pf, pr, kf, kr, toMove, memo = new Map()) {
  const key = `${pf}${pr}${kf}${kr}${toMove}`;
  if (memo.has(key)) return memo.get(key);
  let out;
  if (toMove === 'w') {
    if (kf === pf && kr === pr + 1) out = false; // blocked; the king then takes the pawn
    else if (pr + 1 === 7) out = Math.max(Math.abs(kf - pf), Math.abs(kr - 7)) > 1; // promotes; taken if the king is next to it
    else out = raceSolve(pf, pr + 1, kf, kr, 'b', memo);
  } else {
    const attacked = (x, y) => y === pr + 1 && Math.abs(x - pf) === 1;
    const steps = JUMPS.k.map(([dx, dy]) => [kf + dx, kr + dy]).filter(([x, y]) => on(x, y) && !attacked(x, y));
    if (steps.some(([x, y]) => x === pf && y === pr)) out = false;
    else if (!steps.length) out = 'stalemate';
    else out = steps.every(([x, y]) => raceSolve(pf, pr, x, y, 'w', memo) === true);
  }
  memo.set(key, out);
  return out;
}

function chessItem(f, it, skill) {
  const p = it.prompt;
  const key = it.answer;
  let m;
  m = /^What colou?r is the square ([a-h][1-8])\?$/.exec(p);
  if (m) {
    const s = sq(m[1]);
    const want = (s.f + s.r) % 2 === 0 ? 'Dark' : 'Light';
    if (key !== want) flag(f, 'wrong-key', `${m[1]} is ${want}`, it);
    return;
  }
  m = /^In the starting position, which piece stands on ([a-h][1-8])\?$/.exec(p);
  if (m) {
    const s = sq(m[1]);
    const colour = s.r === 0 ? 'White' : s.r === 7 ? 'Black' : null;
    const piece = s.r === 1 || s.r === 6 ? 'pawn' : colour ? NAMES[START[s.f].toLowerCase()] : null;
    const want = piece ? `${s.r <= 1 ? 'White' : 'Black'} ${piece}` : 'empty';
    if (key !== want) flag(f, 'wrong-key', `${m[1]} holds ${want}`, it);
    return;
  }
  m = /^How many moves does a king need to walk from ([a-h][1-8]) to ([a-h][1-8]) on an empty board\?$/.exec(p);
  if (m) {
    const a = sq(m[1]); const b = sq(m[2]);
    if (Number(key) !== Math.max(Math.abs(a.f - b.f), Math.abs(a.r - b.r))) flag(f, 'wrong-key', 'king distance', it);
    return;
  }
  m = /^On an empty board, how many squares can an? (\w+) on ([a-h][1-8]) move to\?$/.exec(p);
  if (m) {
    const s = sq(m[2]);
    const n = reachFrom(BY_NAME[m[1]], s.f, s.r, () => null).length;
    if (Number(key) !== n) flag(f, 'wrong-key', `a ${m[1]} on ${m[2]} reaches ${n}`, it);
    return;
  }
  m = /^A white (\w+) stands on ([a-h][1-8])\. A white (\w+) is on ([a-h][1-8]) and a black (\w+) on ([a-h][1-8])\. Nothing else is on the board\. How many moves does the \w+ have\?$/.exec(p);
  if (m) {
    const t = BY_NAME[m[1]]; const s = sq(m[2]); const own = sq(m[4]); const foe = sq(m[6]); const ft = BY_NAME[m[5]];
    const occ = (x, y) => (x === own.f && y === own.r ? 'own' : x === foe.f && y === foe.r ? 'foe' : null);
    let moves = reachFrom(t, s.f, s.r, occ);
    if (t === 'k') {
      // The king may not step onto a square the black piece attacks (with the king gone from its square).
      const occAfter = (x, y) => (x === own.f && y === own.r ? 'own' : null);
      const hit = new Set(reachFrom(ft, foe.f, foe.r, (x, y) => (occAfter(x, y) ? 'foe' : null)).map(([x, y]) => `${x}${y}`));
      moves = moves.filter(([x, y]) => (x === foe.f && y === foe.r) || !hit.has(`${x}${y}`));
    }
    if (Number(key) !== moves.length) flag(f, 'wrong-key', `the ${m[1]} has ${moves.length} legal moves, keyed ${key}`, it);
    return;
  }
  m = /^In a trade, White gives up (.+) and Black gives up (.+?)\. Using the usual values/.exec(p);
  if (m) {
    const parse = (list) => {
      let sum = 0;
      for (const part of list.replace(/,? and /g, ', ').split(', ')) {
        const w = /^(?:(a|an|one|two|three|four) )?(\w+?)s?$/.exec(part.trim());
        if (!w || !(w[2] in BY_NAME)) return null;
        if (!w[1]) flag(f, 'grammar', `"${part}" has no article or number`, it);
        sum += ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 }[w[1]] || 1) * VAL[BY_NAME[w[2]]];
      }
      return sum;
    };
    const whiteLoses = parse(m[1].replace(/,$/, '')); const blackLoses = parse(m[2]);
    if (whiteLoses == null || blackLoses == null) return flag(f, 'no-verifier', 'piece list not understood', it);
    const want = blackLoses === whiteLoses ? 'Equal' : blackLoses > whiteLoses ? 'White' : 'Black';
    if (key !== want) flag(f, 'wrong-key', `White loses ${whiteLoses}, Black loses ${blackLoses}`, it);
    if (/\b(\w+) and \1\b/.test(p)) flag(f, 'grammar', 'a piece repeated with "and"', it);
    return;
  }
  m = /^White: pawn ([a-h][1-8]) \(the white king is far away and cannot help\)\. Black: king ([a-h][1-8])\. (White|Black) to move\. Can the black king catch the pawn\?$/.exec(p);
  if (m) {
    const pw = sq(m[1]); const k = sq(m[2]);
    const toMove = m[3] === 'White' ? 'w' : 'b';
    if (toMove === 'w' && k.r === pw.r + 1 && Math.abs(k.f - pw.f) === 1) return flag(f, 'illegal-position', 'White to move with Black in check', it);
    const promotes = raceSolve(pw.f, pw.r, k.f, k.r, toMove);
    if (promotes === 'stalemate') return flag(f, 'no-verifier', 'stalemate in the race', it);
    const want = promotes ? 'No' : 'Yes';
    if (key !== want) flag(f, 'wrong-key', `solved as a race the answer is ${want}`, it);
    const steps = 7 - pw.r;
    const dist = Math.max(Math.abs(k.f - pw.f), 7 - k.r);
    const n = /needs (\d+) move/.exec(it.rationale);
    const kd = /(?:is|needs) (\d+) (?:king )?move/.exec(it.rationale.slice(it.rationale.indexOf(';') + 1));
    if (!n || Number(n[1]) !== steps) flag(f, 'rationale', `the pawn needs ${steps} moves`, it);
    if (!kd || Number(kd[1]) !== dist) flag(f, 'rationale', `the king is ${dist} moves from the promotion square`, it);
    return;
  }
  // Everything else is set on a position written out in the prompt.
  const pos = positionFrom(p);
  if (!pos) return flag(f, 'no-verifier', `no chess check recognises this prompt (${skill})`, it);
  if (it.fen) {
    const bad = fenProblem(it.fen);
    if (bad) flag(f, 'bad-fen', bad, it);
    if (placement(it.fen) !== placement(C.toFen(pos))) flag(f, 'fen-mismatch', `prompt ${placement(C.toFen(pos))} vs fen ${placement(it.fen)}`, it);
  }
  if (!C.legalMoves(pos).length && !/checkmate, stalemate, or neither/.test(p)) flag(f, 'no-legal-move', 'the side to move has no move', it);
  if (C.inCheck(pos, C.other(pos.side))) flag(f, 'illegal-position', 'the side not to move is in check', it);
  const legal = C.legalMoves(pos);
  const keyed = C.moveFromText(pos, key);

  if (/Find checkmate in one move/.test(p)) {
    if (pos.side !== 'w') flag(f, 'side', 'mate puzzle with Black to move', it);
    const mates = legal.filter((x) => C.isCheckmate(C.makeMove(pos, x)));
    if (!keyed || !C.isCheckmate(C.makeMove(pos, keyed))) flag(f, 'wrong-key', `${key} is not mate`, it);
    for (const x of mates) {
      if (!grade(it, sanOf(pos, x)).correct) flag(f, 'second-correct', `${sanOf(pos, x)} is also mate and grades wrong`, it);
    }
    const quiet = legal.find((x) => !C.isCheckmate(C.makeMove(pos, x)));
    if (quiet && grade(it, sanOf(pos, quiet)).correct) flag(f, 'grading', `${sanOf(pos, quiet)} is not mate and grades correct`, it);
    if (keyed && sanOf(pos, keyed) !== key) flag(f, 'notation', `${key} is written ${sanOf(pos, keyed)}`, it);
    return;
  }
  if (/One capture wins material/.test(p)) {
    if (pos.side !== 'w') flag(f, 'side', 'Black to move', it);
    if (!keyed || !keyed.captured) return flag(f, 'wrong-key', `${key} is not a capture`, it);
    const g = gain(pos, keyed, 3);
    if (g < 1) flag(f, 'wrong-key', `${key} does not win material (net ${g} after a 3-ply search)`, it);
    for (const x of legal) {
      if (!x.captured || C.uci(x) === C.uci(keyed)) continue;
      const gx = gain(pos, x, 3);
      if (gx >= 1) flag(f, 'second-correct', `${sanOf(pos, x)} also wins material (net ${gx})`, it);
    }
    if (/for free: nothing black can recapture/.test(it.rationale) && C.attacked(C.makeMove(pos, keyed), keyed.to, 'b')) flag(f, 'rationale', 'says nothing can recapture, and something can', it);
    if (keyed && sanOf(pos, keyed) !== key) flag(f, 'notation', `${key} is written ${sanOf(pos, keyed)}`, it);
    return;
  }
  if (/Find the knight fork/.test(p)) {
    if (!keyed || keyed.piece !== 'N') return flag(f, 'wrong-key', `${key} is not a knight move`, it);
    const forks = (x) => {
      const after = C.makeMove(pos, x);
      return C.reach('n', x.to).filter((s) => after.board[s] && 'kqr'.includes(after.board[s])).length >= 2;
    };
    if (!forks(keyed)) flag(f, 'wrong-key', `${key} does not attack two of king, queen and rook`, it);
    if (C.attacked(C.makeMove(pos, keyed), keyed.to, 'b')) flag(f, 'wrong-key', `${key} lands on a guarded square`, it);
    const g = gain(pos, keyed, 3);
    if (g < 2) flag(f, 'wrong-key', `${key} wins only ${g} after a 3-ply search`, it);
    for (const x of legal) {
      if (x.piece !== 'N' || C.uci(x) === C.uci(keyed) || !forks(x)) continue;
      const gx = gain(pos, x, 3);
      if (gx >= 2) flag(f, 'second-correct', `${sanOf(pos, x)} is also a fork that wins ${gx}`, it);
    }
    return;
  }
  if (/Write the move in algebraic notation\./.test(p)) {
    const d = /(white|black) (\w+) on ([a-h][1-8]) (?:moves to ([a-h][1-8])(?:, capturing the (\w+))?|captures the (\w+) on ([a-h][1-8]))(?:,? and promotes to an? (\w+))?(?:, giving (check|checkmate))?\./.exec(p);
    if (!d) return flag(f, 'no-verifier', 'move description not understood', it);
    const from = C.sqIndex(d[3]); const to = C.sqIndex(d[4] || d[7]);
    const promo = d[8] ? BY_NAME[d[8]] : undefined;
    const mv = legal.find((x) => x.from === from && x.to === to && (x.promo || undefined) === promo);
    if (!mv) return flag(f, 'wrong-key', 'the described move is not legal', it);
    if ((d[1] === 'white') !== (pos.side === 'w')) flag(f, 'side', 'the moving side is not the side to move', it);
    if (NAMES[mv.piece.toLowerCase()] !== d[2]) flag(f, 'description', `the piece on ${d[3]} is a ${NAMES[mv.piece.toLowerCase()]}`, it);
    const capName = d[5] || d[6];
    if (!!capName !== !!mv.captured || (capName && NAMES[mv.captured.toLowerCase()] !== capName)) flag(f, 'description', 'capture described wrongly', it);
    const after = C.makeMove(pos, mv);
    const said = d[9] || '';
    const truth = C.inCheck(after) ? (C.legalMoves(after).length ? 'check' : 'checkmate') : '';
    if (said !== truth) flag(f, 'description', `says "${said || 'no check'}", the move gives ${truth || 'no check'}`, it);
    const want = sanOf(pos, mv);
    if (key !== want) flag(f, 'wrong-key', `the move is written ${want}`, it);
    const clash = legal.find((x) => C.uci(x) !== C.uci(mv) && sanOf(pos, x).toLowerCase() === want.toLowerCase());
    if (clash) flag(f, 'grading', `the different move ${sanOf(pos, clash)} grades correct (the grader ignores case)`, it);
    return;
  }
  if (/Is this checkmate, stalemate, or neither\?/.test(p)) {
    const moves = C.legalMoves(pos).length;
    const want = moves ? 'Neither' : C.inCheck(pos) ? 'Checkmate' : 'Stalemate';
    if (key !== want) flag(f, 'wrong-key', `the position is ${want}`, it);
    if (pos.side !== 'b') flag(f, 'side', 'the question is about Black and White is to move', it);
    if (it.fen && fenProblem(it.fen)) flag(f, 'bad-fen', fenProblem(it.fen), it);
    return;
  }
  flag(f, 'no-verifier', `no chess check recognises this prompt (${skill})`, it);
}

/** The puzzle trainer's set: each line legal, each claim true. */
function auditPuzzles() {
  const f = fam('chess-puzzles.js (trainer set)');
  const ids = new Set();
  for (const pz of PUZZLES) {
    f.rendered++;
    const it = { prompt: `${pz.id}: ${pz.fen}`, answer: pz.line.join(' ') };
    if (ids.has(pz.id)) flag(f, 'duplicate-id', pz.id, it);
    ids.add(pz.id);
    const bad = fenProblem(pz.fen);
    if (bad) { flag(f, 'bad-fen', bad, it); continue; }
    const run = S.replay(pz.fen, pz.line);
    if (!run) { flag(f, 'illegal-line', 'a move in the line is not legal', it); continue; }
    if (Math.ceil(pz.line.length / 2) !== pz.moves) flag(f, 'move-count', `${pz.line.length} plies for ${pz.moves} moves`, it);
    const pos = C.parseFen(pz.fen);
    if (pz.kind === 'mate') {
      if (!C.isCheckmate(run.end)) flag(f, 'wrong-key', 'the line does not end in mate', it);
      if (S.mateDistance(pos, pz.moves) !== pz.moves) flag(f, 'wrong-key', `a mate shorter than ${pz.moves} exists`, it);
      const first = S.mateMoves(pos, pz.moves).map(C.uci);
      if (/only move/.test(pz.verified) && (first.length !== 1 || first[0] !== pz.line[0])) flag(f, 'second-correct', `moves that mate in ${pz.moves}: ${first.join(', ')}`, it);
    } else {
      const won = material(run.end, pos.side) - material(pos, pos.side);
      if (won < 2) flag(f, 'wrong-key', `the line wins only ${won}`, it);
    }
  }
}

/** The Lichess import: fast replays (a from-to move found among the legal moves) and the cheap proofs. */
function auditLichessPuzzles() {
  if (!LICHESS_PUZZLES.length) return;
  const f = fam('chess-puzzles-lichess.js (Lichess import, CC0)');
  const ids = new Set(PUZZLES.map((p) => p.id));
  let mateIn2 = 0;
  for (const pz of LICHESS_PUZZLES) {
    f.rendered++;
    const it = { prompt: `${pz.id}: ${pz.fen}`, answer: pz.line.join(' ') };
    if (ids.has(pz.id)) flag(f, 'duplicate-id', pz.id, it);
    ids.add(pz.id);
    if (pz.source !== 'lichess' || !/^[A-Za-z0-9]{5}$/.test(pz.lichess || '')) flag(f, 'credit', 'no Lichess id to credit', it);
    if (!/^Stockfish/.test(pz.verified || '')) flag(f, 'unverified', 'no Stockfish check recorded', it);
    if (!(pz.rating >= 400 && pz.rating < 2400)) flag(f, 'rating', `rating ${pz.rating} outside 400-2399`, it);
    const bad = fenProblem(pz.fen);
    if (bad) { flag(f, 'bad-fen', bad, it); continue; }
    let pos = C.parseFen(pz.fen);
    const start = pos;
    let legal = true;
    for (const u of pz.line) {
      const m = C.legalMoves(pos).find((x) => C.uci(x) === u);
      if (!m) { legal = false; break; }
      pos = C.makeMove(pos, m);
    }
    if (!legal) { flag(f, 'illegal-line', 'a move in the line is not legal', it); continue; }
    if (Math.ceil(pz.line.length / 2) !== pz.moves) flag(f, 'move-count', `${pz.line.length} plies for ${pz.moves} moves`, it);
    if (pz.kind === 'mate') {
      if (!C.isCheckmate(pos)) flag(f, 'wrong-key', 'the line does not end in mate', it);
      const prove = pz.moves === 1 || (pz.moves === 2 && mateIn2++ % 5 === 0);
      if (prove) {
        const first = S.mateMoves(start, pz.moves).map(C.uci);
        if (first.length !== 1 || first[0] !== pz.line[0]) flag(f, 'second-correct', `moves that mate in ${pz.moves}: ${first.join(', ')}`, it);
      }
    } else if (pz.kind !== 'advantage') flag(f, 'kind', `unknown kind ${pz.kind}`, it);
  }
}

// ── basketball ──────────────────────────────────────────────────────────────
/** n / d to one decimal place, half up, in integers: the exact value a careful learner gets. */
const oneDecimal = (n, d) => Math.floor((2 * n * 10 + d) / (2 * d)) / 10;
function bbItem(f, it) {
  const p = it.prompt;
  const key = Number(it.answer);
  const same = (want, what) => { if (Math.abs(key - want) > 1e-9) flag(f, 'wrong-key', `${what}: keyed ${it.answer}, exact ${want}`, it); };
  let m = /shoots (\d+) of (\d+) from the field \((\d+) of (\d+) threes\) and (\d+) of (\d+) free throws/.exec(p);
  if (m) {
    const [fgm, fga, tpm, tpa, ftm, fta] = m.slice(1, 7).map(Number);
    if (fgm > fga || tpm > tpa || ftm > fta || tpa > fga || tpm > fgm || fgm - tpm > fga - tpa) flag(f, 'impossible-line', `${fgm}/${fga} FG with ${tpm}/${tpa} threes: ${fgm - tpm} two-point makes from ${fga - tpa} two-point attempts`, it);
    const pts = 2 * (fgm - tpm) + 3 * tpm + ftm;
    if (/How many points/.test(p)) return same(pts, 'points');
    if (/effective field-goal/.test(p)) return same(oneDecimal(100 * (2 * fgm + tpm), 2 * fga), 'eFG%');
    if (/true shooting/.test(p)) {
      const stated = /\((\d+) points\)/.exec(p);
      if (!stated || Number(stated[1]) !== pts) flag(f, 'wrong-points', `the line makes ${pts} points`, it);
      return same(oneDecimal(100 * 25 * pts, 2 * (25 * fga + 11 * fta)), 'TS%');
    }
  }
  m = /^A player makes (\d+) of (\d+) field-goal attempts\./.exec(p);
  if (m) return same(oneDecimal(100 * Number(m[1]), Number(m[2])), 'FG%');
  m = /^A team has (\d+) field-goal attempts, (\d+) offensive rebounds, (\d+) turnovers and (\d+) free-throw attempts\./.exec(p);
  if (m) {
    const [fga, orb, tov, fta] = m.slice(1).map(Number);
    return same(oneDecimal(25 * (fga - orb + tov) + 11 * fta, 25), 'possessions');
  }
  flag(f, 'no-verifier', 'no basketball check recognises this prompt', it);
}

// ── authored pools: what each was fact-checked against ──────────────────────
/**
 * The key every authored item was checked with. An item whose prompt is missing
 * here, or whose key differs, is flagged until someone checks it and records it.
 * Basketball rules name the rulebook; where NBA, FIBA, NCAA and NFHS (US high
 * school) differ the prompt must say which one it asks about.
 */
const REVIEWED = {
  piano_terms: {
    'What does "forte" (f) mean?': 'Loud',
    'What does "piano" (p) mean as a dynamic?': 'Soft',
    'What does "crescendo" mean?': 'Gradually getting louder',
    'What does "staccato" (a dot above or below a note) ask for?': 'Short and detached',
    'What does "allegro" mean?': 'Fast and lively',
    'What does "D.C. al Fine" tell you to do?': 'Go back to the beginning and play until Fine',
    'What does "rallentando" (rall.) mean?': 'Gradually slowing down',
    'What does "una corda" ask the pianist to do?': 'Press the left (soft) pedal',
    'What does "rubato" mean?': 'Flexible tempo, stretching and giving back time for expression',
  },
  piano_technique: {
    'Which finger number is the thumb?': '1',
    'In the C major scale with the right hand going up, where does the thumb pass under?': 'After finger 3 plays E, the thumb plays F',
    'What is legato pedalling (syncopated pedalling)?': 'Lifting the pedal as you play the new chord and pressing it again just after',
    'What should you do if playing hurts?': 'Stop, rest and check your posture or ask a teacher',
    'What is the main purpose of practising a passage slowly?': 'To play the right notes, fingering and sound every time so the correct version is learned',
    'On a grand piano, what does the middle (sostenuto) pedal do?': 'Sustains only the notes held down when it is pressed',
    'In piano technique, what does it mean to "voice" a chord?': 'Making one note, often the melody, sound louder than the others',
  },
  piano_repertoire: {
    'Which composer wrote the 48 Preludes and Fugues of "The Well-Tempered Clavier"?': 'J. S. Bach',
    'The popular Minuet in G from the Anna Magdalena Bach Notebook is now attributed to…': 'Christian Petzold',
    'Which musical period do Haydn, Mozart and early Beethoven belong to?': 'Classical',
    'Which composer wrote most of his music for solo piano, including nocturnes, mazurkas and ballades?': 'Frédéric Chopin',
    'How many piano sonatas did Beethoven write (the standard numbered set)?': '32',
    'Which composer is most associated with Impressionism at the piano, with pieces like "Clair de lune"?': 'Claude Debussy',
    'What is an "Urtext" edition?': 'An edition that aims to show what the composer wrote, with editorial additions marked',
    'Which early hammer keyboard, played by Mozart and Haydn, is the forerunner of the modern piano?': 'The fortepiano',
  },
  piano_practice: {
    'When you make a mistake while practising, what works best?': 'Stop, find the exact spot, fix it slowly, play it right several times, then rejoin',
    'Why play a piece "cold" the next day before warming up?': 'It shows what you really learned, not what you can do after repeating it',
    'Which memorisation method do concert pianists rely on most?': 'Knowing the structure and having planned cues they can start from anywhere',
    'Which is a well-supported way to manage performance nerves?': 'Gradual exposure: perform first privately, then for one person, then for small groups',
  },
  piano_profession: {
    'What is a collaborative pianist?': 'A pianist who plays with singers, instrumentalists or ensembles as an equal partner',
    'What does a piano technician do when "regulating" a piano?': 'Adjusts the action so the keys and hammers respond evenly',
    'What is equal temperament?': 'A tuning that divides the octave into 12 equal half steps',
    'In a good first lesson with a young child, the teacher should mostly…': 'Have them play and explore sounds quickly, with short activities and early success',
  },
  piano_science: {
    'Why are a piano string\'s overtones slightly sharper than exact multiples of the fundamental?': 'The steel string is stiff, which raises the higher partials (inharmonicity)',
    'What does a MIDI keyboard send to a computer when a key is played?': 'Which note, when, and how fast the key went down (velocity), but no audio',
    'Why is grading piano playing from a microphone harder than from MIDI?': 'Many notes sound at once and overlap, so separating them from audio is error-prone',
    'Do music lessons reliably raise children\'s IQ or school grades?': 'No; well-controlled studies find little or no far-transfer effect',
  },
  chess_strategy: {
    'What is an outpost?': 'A square in enemy territory that an enemy pawn can no longer attack',
    'What makes a bishop "bad"?': 'Many of its own pawns are fixed on squares of its colour',
    'An isolated pawn is a pawn that…': 'has no friendly pawns on the files next to it',
    'Where does a rook usually belong in the middlegame?': 'On an open or half-open file',
    'What is prophylaxis?': 'A move that stops the opponent\'s plan before it starts',
    'The minority attack is typically used by White in which structure?': 'Queen\'s Gambit Declined Exchange (Carlsbad) structure',
    'What is the principle of two weaknesses?': 'One weakness can often be defended, so the attacker creates a second one far away',
    'Why might a player give up a rook for a bishop or knight (an exchange sacrifice)?': 'For lasting positional gains such as a strong minor piece, broken pawns or an attack',
    'A passed pawn is a pawn that…': 'has no enemy pawns in front of it on its own file or the files next to it',
  },
  chess_opening: {
    'Which is a sound opening principle?': 'Develop knights and bishops early and castle',
    'After 1.e4 e5 2.Nf3 Nc6 3.Bc4, which opening is this?': 'Italian Game',
    'After 1.e4 e5 2.Nf3 Nc6 3.Bb5, which opening is this?': 'Ruy Lopez (Spanish)',
    'Which first move for Black defines the Sicilian Defence after 1.e4?': '1...c5',
    'What is the Queen\'s Gambit?': '1.d4 d5 2.c4',
    'Fool\'s Mate, the fastest possible checkmate, is 1.f3 e5 2.g4 and then…': '2...Qh4#',
    'In the ECO system, which letter covers the Sicilian, French and Caro-Kann (semi-open games)?': 'B (mostly), with the French in C',
    'What is a "gambit"?': 'An opening that gives up material, usually a pawn, for development or attack',
  },
  chess_practical: {
    'Before making your move, what should you check first?': 'What your opponent\'s last move threatens, and whether any of your pieces are loose',
    'Under the touch-move rule, if you deliberately touch one of your own pieces, you must…': 'move it, if it has a legal move',
    'In "90 minutes + 30 seconds", what does the 30 seconds mean?': '30 seconds are added to your clock after each move',
    'What is the best order when reviewing your own game?': 'Write down your own thoughts first, then check with an engine',
    'What is the correct way to offer a draw in a tournament game?': 'Make your move, offer the draw, then press your clock',
    'You are in time trouble in a complicated position. What is usually the best practical approach?': 'Keep the position safe and simple, and make solid moves quickly',
  },
  chess_history: {
    'Who was the first official World Chess Champion (1886)?': 'Wilhelm Steinitz',
    'Who held the world title longest, for 27 years (1894-1921)?': 'Emanuel Lasker',
    'In 1972 in Reykjavik, who became World Champion by beating Boris Spassky?': 'Bobby Fischer',
    'In 1997, which computer beat Garry Kasparov in a six-game match?': 'IBM Deep Blue',
    'Which school of thought, led by Nimzowitsch and Réti, argued the centre can be controlled from a distance with pieces?': 'The hypermodern school',
    'In what year and city was FIDE founded?': '1924, Paris',
    'Which World Champion died while still holding the title?': 'Alexander Alekhine',
    'Who is widely regarded as the strongest female player in history, reaching the world top 10?': 'Judit Polgar',
  },
  chess_professional: {
    'Under FIDE rules, a game is drawn automatically (without a claim) after…': '75 moves by each side with no capture or pawn move',
    'A player\'s flag falls, but the opponent has only a king left. What is the result?': 'Draw',
    'In a chess problem, what is the "key"?': 'The first move of the solution',
    'In a helpmate, …': 'Black moves first and both sides cooperate so that Black is mated',
    'In composition, what is a "cook"?': 'An unintended solution that ruins the problem',
    'What does the Buchholz tiebreak add up?': 'The scores of a player\'s opponents',
    'In a Swiss-system tournament, players are mostly paired with…': 'opponents on the same or a similar score',
    'What is an endgame study, as opposed to a problem?': 'A composed position, usually "White to play and win (or draw)", with no fixed number of moves',
  },
  chess_engines: {
    'What does alpha-beta pruning do in a chess engine?': 'Skips branches that cannot change the result, giving the same answer as full minimax faster',
    'What does NNUE stand for in Stockfish?': 'Efficiently updatable neural network',
    'How did AlphaZero (DeepMind, 2017) learn chess?': 'By playing against itself, starting from only the rules',
    'What is an endgame tablebase?': 'A complete database of every position with a few pieces, giving the perfect result and moves',
    'Is chess solved?': 'No; it is not known whether perfect play is a win for White or a draw',
    'Zermelo\'s 1913 theorem says that in chess…': 'Either White can force a win, Black can force a win, or both can force at least a draw',
    'What is the difference between DTM and DTZ in tablebases?': 'DTM counts moves to mate; DTZ counts moves to the next capture or pawn move (zeroing the 50-move count)',
    'Claude Shannon\'s 1950 paper estimated the game-tree complexity of chess at about…': '10^120',
  },
  // Basketball. NBA = NBA Official Rules; FIBA = FIBA Official Basketball Rules;
  // NCAA = NCAA Men's and Women's Basketball Rules; NFHS = US high-school rules.
  bb_rules: {
    'How many points is a basket from inside the three-point line worth?': '2', // NBA Rule 5 / FIBA Art. 16: 2 inside, 3 beyond the arc, 1 per free throw
    'What is a travel (travelling)?': 'Moving your pivot foot or taking too many steps while holding the ball', // NBA Rule 10 Sec. XIII; FIBA Art. 25
    'What is a double dribble?': 'Dribbling, stopping, then dribbling again, or dribbling with both hands at once', // NBA Rule 10 Sec. II; FIBA Art. 24
    'How long can an offensive player stay in the lane (the painted area FIBA calls the restricted area) in the NBA and FIBA?': '3 seconds', // NBA Rule 10 Sec. VII; FIBA Art. 26 (NCAA and NFHS also 3)
    'How long is the shot clock in the NBA and FIBA?': '24 seconds', // NBA Rule 7; FIBA Art. 29 (NCAA 30; NFHS 35 where a state adopts one)
    'How many personal fouls lead to a player fouling out in the NBA?': '6', // NBA Rule 3: disqualified on the 6th; FIBA Art. 40 and NCAA: 5
    'How long is an NBA game, and how long is a FIBA game?': 'NBA 4 x 12 minutes; FIBA 4 x 10 minutes', // NBA Rule 5 Sec. II; FIBA Art. 8 (NCAA men 2 x 20, women 4 x 10)
    'A defender has established legal guarding position outside the restricted-area arc and slides sideways to stay in front of the dribbler, who runs into the defender\'s chest. What is the usual call?': 'Charge (offensive foul)', // FIBA Art. 33.3-33.5; NBA Rule 12B; NFHS 4-23: after legal guarding position is set the defender may move laterally or backward
    'What is goaltending?': 'Touching a shot on its way down, while it is entirely above the rim and could still go in', // NBA Rule 11; FIBA Art. 31; NFHS 4-22 (touching it on or in the cylinder is basket interference)
  },
  bb_court: {
    'How high is a regulation basketball rim?': '10 feet (3.05 m)', // NBA Rule 1; FIBA equipment: ring 3.05 m
    'How far is the NBA three-point line at the top of the arc?': '23 feet 9 inches (7.24 m)', // NBA Rule 1: 23 ft 9 in, 22 ft in the corners; FIBA 6.75 m, 6.60 m in the corners
    'How far is the free-throw line from the backboard?': '15 feet (4.6 m) from the backboard face', // NBA Rule 1: 15 ft from the plane of the backboard; FIBA: 5.80 m from the end line, board 1.20 m in
    'Why do young players use a smaller ball and a lower rim?': 'So they can use good shooting technique instead of heaving the ball',
  },
  bb_skills: {
    'What is the triple-threat position?': 'Holding the ball low and ready so you can shoot, pass or dribble',
    'What is a jump stop?': 'Landing on both feet at the same time to stop, so either foot can become the pivot',
    'Which kind of cue tends to help shooting most?': 'An external cue, such as "drop it just over the front rim"',
    'What does a good bounce pass aim for?': 'Bouncing about two-thirds of the way to the receiver so it arrives at waist height',
    'Why practise lay-ups with both hands from the start?': 'Finishing with the outside hand protects the ball from the defender on either side',
    'What is boxing out?': 'Making contact and holding your position between your opponent and the basket after a shot',
  },
  bb_tactics: {
    'In man-to-man defence, what is "help side"?': 'The side of the floor away from the ball, where defenders sag to help stop drives',
    'What is a give-and-go?': 'Pass to a teammate, cut to the basket and get the ball back',
    'What is the "pick and roll"?': 'A screener blocks the ball handler\'s defender, then rolls to the basket for a pass',
    'In pick-and-roll defence, what does "drop" coverage mean?': 'The screener\'s defender sinks toward the basket to protect the rim',
    'Why is good spacing important on offence?': 'Spread-out players make it hard for one defender to guard two attackers and open driving lanes',
  },
  bb_health: {
    'What should you do before every practice or game?': 'A proper warm-up, such as an 11+-style neuromuscular warm-up',
    'A player bumps heads and then has a headache and feels dizzy. What should happen?': 'Stop playing right away, no return that day, and see a healthcare provider before playing again',
    'How should you land from a jump to protect your knees?': 'Softly on both feet with knees bent and tracking over the toes',
    'What do the NBA and USA Basketball youth guidelines say about specialising in basketball only?': 'Delay it until about 14 and play other sports',
    'Which kind of pain means you should stop the session?': 'Pain that changes how you move or lasts into the next day',
  },
  bb_mental: {
    'Why use the same free-throw routine every time?': 'A consistent routine settles focus and makes the shot more repeatable under pressure',
    'After a mistake in a game, what helps most?': 'A quick reset routine and focus on the next play',
  },
  bb_history: {
    'Who invented basketball, and when?': 'James Naismith, in 1891',
    'Why was the 24-second shot clock introduced in 1954?': 'To stop teams stalling with the ball and to speed up the game',
    'When did the NBA add the three-point line?': 'The 1979-80 season',
    'In which Olympic Games did men\'s basketball first appear as a medal sport?': 'Berlin 1936',
    'When did the WNBA play its first season?': '1997',
  },
  bb_officiating: {
    'In FIBA basketball, how many officials usually work a top-level game?': 'Three (a crew chief and two umpires)', // FIBA Art. 45-46: a crew chief and one or two umpires; three at top level
    'Why do officials use set positions and rotations?': 'So that every part of the floor and every matchup is watched from a good angle',
  },
  bb_coaching: {
    'Which practice design keeps young players most engaged and learning?': 'Small-sided games with everyone active and rules that shape the skill',
    'What is a constraints-led approach to coaching?': 'Changing the task, space or rules so that players discover good solutions',
  },
  bb_frontier: {
    'What did the 2018 Miller and Sanjurjo paper show about the "hot hand"?': 'The original 1985 test had a statistical bias, and corrected analyses find evidence of a modest hot hand',
    'Dean Oliver\'s "Four Factors" of winning are shooting, turnovers, rebounding and…': 'getting to the free-throw line',
    'Why did many teams shift toward more three-pointers and shots at the rim?': 'Those shots return more points per attempt than long two-pointers',
    'What does player-tracking data (such as Second Spectrum) record?': 'The positions of every player and the ball many times per second',
  },
};

/** Claims a rationale may not make, because the rulebooks say otherwise. */
const FALSE_CLAIMS = [
  [/feet set|must be stationary|stationary before contact/i, 'a defender need not be stationary to draw a charge (NBA, FIBA, NFHS): legal guarding position, then lateral or backward movement, is enough'],
  [/restricted area \(the lane\) in the NBA/i, 'the NBA restricted area is the arc under the basket, not the lane'],
];

function auditPools() {
  const sources = [['piano', PIANO.POOLS], ['chess', CHESS.POOLS], ['basketball', BB.POOLS]];
  const prompts = new Map();
  for (const [subject, pools] of sources) {
    for (const [skill, pool] of Object.entries(pools)) {
      if (ONLY && skill !== ONLY) continue;
      const f = fam(`${subject} pools/${skill}`);
      const reviewed = REVIEWED[skill] || {};
      pool.forEach((e, i) => {
        f.rendered++;
        const it = { format: e.c ? 'multiple_choice' : 'type_in', prompt: e.p, answer: String(e.a), rationale: e.r, choices: e.c ? e.c.map(String) : undefined, accepts: e.x };
        textChecks(f, it);
        formChecks(f, it);
        if (e.c && e.c.length !== 4) flag(f, 'choice-count', `${e.c.length} choices`, it);
        if (e.c && e.c.some((c) => /all of the above|none of the above/i.test(c))) flag(f, 'all-of-the-above', '', it);
        if (!(e.p in reviewed)) flag(f, 'unreviewed', `item ${i} is not in REVIEWED: fact-check it and record its key`, it);
        else if (reviewed[e.p] !== String(e.a)) flag(f, 'key-changed', `reviewed key "${reviewed[e.p]}", now "${e.a}"`, it);
        if (prompts.has(e.p)) flag(f, 'duplicate-prompt', `also in ${prompts.get(e.p)}`, it);
        prompts.set(e.p, skill);
        for (const [rx, why] of FALSE_CLAIMS) if (rx.test(`${e.p} ${e.a} ${e.r}`)) flag(f, 'false-claim', why, it);
        // Chess lines in a pool are replayed.
        const line = /^After (1\..+?), which opening is this\?$/.exec(e.p);
        if (line && !playLine(line[1])) flag(f, 'illegal-line', line[1], it);
        if (/Fool's Mate/.test(e.p)) {
          const end = playLine(`1.f3 e5 2.g4 ${e.a.replace(/^2\.\.\./, '')}`);
          if (!end || !C.isCheckmate(end)) flag(f, 'wrong-key', `${e.a} is not mate after 1.f3 e5 2.g4`, it);
          for (const c of e.c) {
            if (c === e.a) continue;
            const other = playLine(`1.f3 e5 2.g4 ${c.replace(/^2\.\.\./, '')}`);
            if (other && C.isCheckmate(other)) flag(f, 'second-correct', `${c} is also mate`, it);
          }
        }
        if (/^What is the Queen's Gambit\?$/.test(e.p)) for (const c of e.c) if (!playLine(c)) flag(f, 'illegal-line', c, it);
      });
    }
  }
  for (const [skill, table] of Object.entries(REVIEWED)) {
    const pool = (PIANO.POOLS[skill] || CHESS.POOLS[skill] || BB.POOLS[skill] || []);
    for (const prompt of Object.keys(table)) {
      if (!pool.some((e) => e.p === prompt)) flag(fam(`reviewed table/${skill}`), 'stale-review', `"${prompt.slice(0, 60)}" is no longer in the pool`, { prompt, answer: table[prompt] });
    }
  }
}
function playLine(text) {
  let pos = C.parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  for (const tok of text.split(/\s+/)) {
    const mv = tok.replace(/^\d+\.(\.\.)?/, '');
    if (!mv) continue;
    const m = C.moveFromText(pos, mv);
    if (!m) return null;
    pos = C.makeMove(pos, m);
  }
  return pos;
}

// ── rendering the generators ────────────────────────────────────────────────
function familyOf(skill, it) {
  const p = it.prompt;
  const rules = [
    [/white key sits/, 'keyboard landmark'], [/half step (above|below)/, 'half step'], [/half steps is it/, 'half-step count'],
    [/clef, which note/, 'staff reading'], [/eighth notes fill/, 'time signature'], [/how many beats/, 'rhythm sum'],
    [/sharps or flats/, 'key signature'], [/relative (minor|major)/, 'relative key'], [/note of the .* scale/, 'scale degree'],
    [/What is the interval/, 'interval name'], [/What note is an? /, 'interval above'], [/^Spell the/, 'chord spelling'],
    [/chord symbol names/, 'chord symbol'], [/ii-V-I/, 'ii-V-I'],
    [/colou?r is the square/, 'square colour'], [/starting position/, 'starting position'], [/king need to walk/, 'king distance'],
    [/On an empty board/, 'piece reach'], [/Nothing else is on the board/, 'moves with blockers'], [/In a trade/, 'material trade'],
    [/catch the pawn/, 'rule of the square'], [/checkmate in one/, 'mate in one'], [/One capture wins material/, 'winning capture'],
    [/knight fork/, 'knight fork'], [/algebraic notation\.$/, 'notation'], [/checkmate, stalemate, or neither/, 'mate or stalemate'],
    [/How many points/, 'points'], [/field-goal percentage/, 'FG%'], [/effective field-goal/, 'eFG%'], [/true shooting/, 'TS%'],
    [/possessions/, 'possessions'],
  ];
  const hit = rules.find(([rx]) => rx.test(p));
  return `${skill} / ${hit ? hit[1] : 'unrecognised'}`;
}

/** What content/bank.js does to every item on its way out (used only if the bank cannot load). */
function tidy(text) {
  return String(text).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;:!])/g, '$1')
    .replace(/[ \t]+\?(?![ \t]*[\w=+\-×÷*/(])/g, '?').trim();
}
function render(gens, skill, d, seed) {
  if (bank) return bank.generate({ skillId: skill, difficulty: d, seed });
  const raw = gens[skill](makeRng(String(seed)), d, { avoid: new Set(), seenShapes: null });
  const it = { skill_id: skill, format: raw.format || 'multiple_choice', prompt: tidy(raw.prompt || ''), answer: String(raw.answer), rationale: tidy(raw.rationale || '') };
  if (raw.fen) it.fen = String(raw.fen);
  if (Array.isArray(raw.accepts) && raw.accepts.length) it.accepts = raw.accepts.map(String);
  if (it.format === 'multiple_choice') {
    it.choices = [...new Set((raw.choices || []).map(String))];
    if (!it.choices.includes(it.answer)) it.choices.push(it.answer);
    if (it.choices.length < 2) { it.format = 'type_in'; delete it.choices; }
  }
  return it;
}

function auditGenerators() {
  const subjects = [['piano', PIANO.GENERATORS, PIANO.POOLS, pianoItem], ['chess', CHESS.GENERATORS, CHESS.POOLS, chessItem], ['basketball', BB.GENERATORS, BB.POOLS, (f, it) => bbItem(f, it)]];
  for (const [subject, gens, pools, verify] of subjects) {
    for (const skill of Object.keys(gens)) {
      if (pools[skill]) continue; // authored pools are audited item by item
      if (ONLY && skill !== ONLY) continue;
      const n = seedsFor(skill);
      for (let d = 1; d <= 10; d++) {
        for (let i = 0; i < n; i++) {
          const it = render(gens, skill, d, `other-audit:${skill}:${d}:${i}`);
          const f = fam(`${subject}/${familyOf(skill, it)}`);
          f.rendered++;
          if (f.samples.length < SHOW) f.samples.push(it);
          textChecks(f, it);
          formChecks(f, it);
          contradiction(f, skill, it);
          verify(f, it, skill);
        }
      }
    }
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
const started = Date.now();
if (!ONLY) pianoEngine();
auditGenerators();
auditPools();
if (!ONLY || ONLY === 'chess_puzzles') { auditPuzzles(); auditLichessPuzzles(); }
positionBias();

let renderings = 0; let problems = 0;
for (const [, f] of report) {
  renderings += f.rendered;
  for (const e of f.flags.values()) problems += e.n;
}
if (SHOW) {
  for (const [key, f] of report) {
    if (!f.samples.length) continue;
    console.log(`\n${key}  (${f.rendered} rendered)`);
    for (const it of f.samples) {
      console.log(`  Q: ${it.prompt.replace(/\n/g, ' / ')}`);
      if (it.choices) console.log(`     [${it.choices.join(' | ')}]`);
      console.log(`     key: ${it.answer}${it.accepts ? `  (also: ${it.accepts.join(' / ')})` : ''}`);
      console.log(`     why: ${it.rationale}`);
    }
  }
}
console.log('\nPiano, Chess and Basketball template audit');
console.log(`${report.size} families, ${renderings} renderings, ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
for (const [key, f] of report) console.log(`  ${f.flags.size ? '✗' : '✓'} ${key.padEnd(52)} ${String(f.rendered).padStart(6)}`);

const flagged = [...report].filter(([, f]) => f.flags.size);
for (const [key, f] of flagged) {
  console.log(`\n✗ ${key}  (${f.rendered} rendered)`);
  for (const [code, e] of f.flags) {
    console.log(`    ${code} ×${e.n}`);
    for (const ex of e.ex) {
      console.log(`      - ${ex.detail}`);
      if (ex.prompt) console.log(`        Q: ${String(ex.prompt).replace(/\n/g, ' / ')}`);
      if (ex.choices) console.log(`        [${ex.choices.join(' | ')}]  key: ${ex.answer}`);
      else if (ex.answer) console.log(`        key: ${ex.answer}`);
    }
  }
}
if (problems) {
  console.log(`\n${problems} flags in ${flagged.length} families.`);
  process.exit(1);
}
console.log('\nClean: every rendering passed.');
