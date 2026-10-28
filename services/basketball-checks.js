/**
 * Checking what a model writes about basketball plays, and grading a read.
 *
 * A play is drawn on the court from frames of player positions
 * (public/engine/basketball/court.js), and a check asks which read is right at
 * the moment it stops. The play must be drawable (every player on the half court
 * in every frame, the ball with someone on it) and the answer must be one of its
 * options, or the check is dropped.
 *
 * Beyond drawing, the drawn play has to agree with its words: a player called a
 * corner shooter stands in the corner behind the line, the pass the answer names
 * is the pass the play then shows, the player the answer passes to is not the
 * covered one. And the words have to be right: players are "they", rules claims
 * that are known to be false (lifting the pivot foot to pass is not a travel) are
 * refused, a shot log asks only for what it records, a court session has a real
 * warm-up and no unsafe loads.
 */
const Court = require('../public/engine/basketball/court');

// ── words ──────────────────────────────────────────────────────────────────

/** Every string inside a value, joined: the text a learner would read. A choice
 * written as a JSON string of an object is read as that object. */
function textOf(value) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') {
      if (/^\s*[{[]/.test(v)) {
        try { walk(JSON.parse(v)); return; } catch { /* plain text that starts with a brace */ }
      }
      out.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return out.join('\n');
}

function sentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** A gendered pronoun used for a player or learner: they play in every gender. */
function pronounProblem(text) {
  const m = /\b(he|him|his|himself|she|her|hers|herself)\b/i.exec(String(text || ''));
  return m ? `uses "${m[1]}": a player is "they", or named by role ("the helper", "the corner shooter", "o3")` : '';
}

/**
 * Rules claims that are known to be false under current FIBA and NBA rules
 * (as of 2026). Each reads one sentence; the list is short and precise, since a
 * wrong refusal throws away a good question.
 */
const NEGATED = /\b(not|no|never|legal|allowed|may|can)\b|n't/;
const RULES = [
  {
    // FIBA Art. 25.2.1, NBA Rule 10 Sec. XIII: the pivot foot may be lifted to pass
    // or shoot, but not before a dribble starts, and must not come back down first.
    test: (s) => /\blift/.test(s) && /\bpivot/.test(s) && /\b(pass|shot|shoot)/.test(s) && /\btravel/.test(s)
      && !/\bdribbl/.test(s) && !/\bback down|\breturn|\bput (it )?back|\bcomes? down|\bland/.test(s) && !NEGATED.test(s.replace(/^no\b\W*/, '')),
    why: 'lifting the pivot foot to pass or shoot is legal (FIBA and NBA); it is a travel only when it is lifted before a dribble starts, or comes back down before the ball is released',
  },
  {
    test: (s) => /\b(nba|wnba)\b/.test(s) && /\b(five|5)(th)? (personal )?fouls?\b|\bfifth (personal )?foul/.test(s) && /foul(s|ed)? out|disqualif/.test(s)
      && !/\b(fiba|ncaa|college|high school|nfhs)\b/.test(s) && !NEGATED.test(s),
    why: 'an NBA or WNBA player fouls out on the sixth personal foul (FIBA, NCAA and NFHS: the fifth)',
  },
  {
    test: (s) => /\bfiba\b/.test(s) && /\b(six|6)(th)? (personal )?fouls?\b|\bsixth (personal )?foul/.test(s) && /foul(s|ed)? out|disqualif/.test(s)
      && !/\b(nba|wnba)\b/.test(s) && !NEGATED.test(s),
    why: 'under FIBA rules a player is disqualified on the fifth foul',
  },
  {
    test: (s) => {
      if (!/\b(nba|wnba|fiba)\b/.test(s) || /\b(ncaa|college|high school|nfhs)\b/.test(s)) return false;
      const m = /\b(\d{2})[- ]second shot[- ]clock|\bshot[- ]clock (?:of|is|lasts|runs(?: for)?|gives(?: you)?) (\d{2})\b/.exec(s);
      const n = m && Number(m[1] || m[2]);
      return !!n && n !== 24 && n !== 14;
    },
    why: 'the NBA, WNBA and FIBA shot clock is 24 seconds (reset to 14 in some cases); 30 is college, 35 high school where used',
  },
  {
    test: (s) => /\b(nba|wnba|fiba)\b/.test(s) && /\b(10|ten)[- ]seconds?\b/.test(s) && /backcourt|half[- ]?court|mid[- ]?court|half[- ]?way|cent(er|re) line|cross/.test(s)
      && !/\b(ncaa|college|high school|nfhs)\b/.test(s) && !NEGATED.test(s),
    why: 'NBA, WNBA and FIBA teams have 8 seconds to bring the ball over the half-way line (10 in college)',
  },
  {
    test: (s) => /\bfiba\b/.test(s) && /defensive (three|3)[- ]seconds?/.test(s) && !/\b(no|not|never|only|nba)\b|n't/.test(s),
    why: 'FIBA has no defensive three-second rule; the NBA does',
  },
  {
    test: (s) => /\bfoul/.test(s) && /\b(three|3)[- ]?(point|pointer)|\bthree\b/.test(s) && /\bmiss/.test(s) && /\b(shoot|shot|attempt|act)/.test(s)
      && /\b(two|2) free throws?\b/.test(s) && !/\b(two|2)[- ]point/.test(s) && !NEGATED.test(s),
    why: 'a shooter fouled on a missed three-point try gets three free throws',
  },
];

/** False rules claims in a text, each as why it is false. */
function ruleProblems(text) {
  const out = [];
  for (const s of sentences(text)) {
    const low = s.toLowerCase();
    for (const r of RULES) if (r.test(low) && !out.includes(r.why)) out.push(r.why);
  }
  return out;
}

/** A question and its key that describe different moves of the pivot foot. */
function pivotMismatch(prompt, keyText) {
  const p = String(prompt || '').toLowerCase();
  const k = String(keyText || '').toLowerCase();
  const slides = /\b(slid|slide|slides|sliding|drag|drags|dragged|dragging)\b[^.]{0,40}\bpivot|\bpivot( foot)?\b[^.]{0,30}\b(slid|slide|slides|sliding|drag|drags|dragged|dragging)\b/.test(p);
  if (!slides) return '';
  if (/\blift/.test(k) && !/\b(slid|slide|drag)/.test(k)) return 'the question has the pivot foot sliding but the answer talks about lifting it: both must describe the same move (sliding or dragging the pivot foot is a travel)';
  if (/\b(legal|no violation|not a travel|allowed)\b/.test(k) && !/\bnot legal\b/.test(k)) return 'sliding or dragging the pivot foot is a travel, not legal';
  return '';
}

/** Everything wrong with the words of a basketball check (any format), or []. */
function checkTextProblems(raw, skillId = '') {
  if (!raw || typeof raw !== 'object') return [];
  const out = [];
  const all = textOf([raw.prompt, raw.choices, raw.options, raw.answer, raw.rationale, raw.hint, raw.explanation]);
  // A history question may name a real person, who is "he" or "she".
  if (!/^bb_history/.test(String(skillId))) {
    const p = pronounProblem(all);
    if (p) out.push(p);
  }
  out.push(...ruleProblems(all));
  // The key itself, not the rationale, which may rightly mention both moves.
  const mismatch = pivotMismatch(raw.prompt, textOf(raw.answer));
  if (mismatch) out.push(mismatch);
  return out;
}

// ── plays ──────────────────────────────────────────────────────────────────

/** The options cleaned: 2 to 4, each with a unique id and a distinct label. */
function cleanOptions(list) {
  const seen = new Set();
  const labels = new Set();
  const out = [];
  for (const o of Array.isArray(list) ? list : []) {
    const id = String((o && o.id) || '').trim().slice(0, 40);
    const label = String((o && o.label) || '').trim().slice(0, 160);
    if (!id || !label || seen.has(id)) continue;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (labels.has(key)) return null;
    seen.add(id);
    labels.add(key);
    out.push({ id, label });
  }
  return out.length >= 2 && out.length <= 4 ? out : null;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const PASS_WORDS = /\b(pass|kick|swing|hit|find|lob|throw|dump|feed|skip|hand ?off|dish)/i;
/** Beyond the arc, with half a foot of give for a toe drawn on the line. */
function beyondArc(p) {
  const [x, y] = p;
  if (x <= 3.5 || x >= 46.5) return y <= 14.5;
  return Math.hypot(x - Court.RIM.x, y - Court.RIM.y) > 23.25;
}
const where = (p) => `(${p[0]}, ${p[1]})`;
const playerIds = (text) => [...new Set((String(text || '').match(/\b[od]\d{1,2}\b/gi) || []).map((s) => s.toLowerCase()))];

/**
 * What a drawn play gets wrong against its own words, or []. `play` is
 * { prompt, frames, pauseAt, options, answer (an option id), explanation }.
 * Assumes the frames already pass Court.validate.
 */
function playProblems(play) {
  const out = [];
  const frames = play.frames;
  const ids = Object.keys(frames[0].players);
  const pauseAt = Number.isInteger(play.pauseAt) ? Math.max(0, Math.min(frames.length - 1, play.pauseAt)) : frames.length - 1;
  const at = frames[pauseAt].players;
  const options = cleanOptions(play.options) || [];
  const right = options.find((o) => o.id === String(play.answer || '').trim()) || options.find((o) => o.label.toLowerCase() === String(play.answer || '').trim().toLowerCase());
  const words = [play.prompt, ...options.map((o) => o.label), play.explanation, play.rationale].join('\n');

  // Every player the words name is on the court.
  const ghost = playerIds(words).filter((id) => !ids.includes(id));
  if (ghost.length) out.push(`the text names ${ghost.join(', ')}, who ${ghost.length > 1 ? 'are' : 'is'} not in the frames`);

  // Players move a realistic distance between key moments.
  for (let k = 1; k < frames.length; k++) {
    for (const id of ids) {
      const d = dist(frames[k - 1].players[id], frames[k].players[id]);
      if (d > 22) { out.push(`${id} moves ${Math.round(d)} ft between frames ${k - 1} and ${k}: keep a move under about 15 ft, or add a frame`); break; }
    }
  }

  // The decision is made with the ball in the offence's hands.
  const holder = frames[pauseAt].ball;
  if (holder && !/^o/.test(holder)) out.push(`at the pause (frame ${pauseAt}) the ball is with the defender ${holder}`);

  // "You are o1", choosing a pass: o1 has the ball at the pause.
  const you = /\byou are (o\d{1,2})\b/i.exec(String(play.prompt || ''));
  if (you && holder && you[1].toLowerCase() !== holder && options.some((o) => PASS_WORDS.test(o.label))) {
    out.push(`the prompt says you are ${you[1].toLowerCase()}, but ${holder} has the ball at the pause (frame ${pauseAt})`);
  }

  // A player called a corner or wing shooter, or shooting a three, stands
  // behind the line. Not the driver: they are named by where they started.
  const lines = [...options.map((o) => o.label), ...sentences(play.prompt), ...sentences(play.explanation || play.rationale)];
  const checked = new Set();
  for (const line of lines) {
    const low = line.toLowerCase();
    const named = playerIds(line).filter((id) => /^o/.test(id) && ids.includes(id) && id !== holder);
    if (named.length !== 1) continue;
    const id = named[0];
    const corner = /\bcorner\b/.test(low) && !/short corner/.test(low);
    const wing = /\bwing\b/.test(low);
    const three = /\bthree\b|\b3[- ]?(point|pointer|pt)\b|behind the (line|arc)|beyond the (arc|line)/.test(low) && !/three seconds|three defenders|three players|three passes/.test(low);
    if (!corner && !wing && !three) continue;
    // Where they stand when they would shoot: the first frame from the pause on
    // where they hold the ball, else the pause.
    let k = frames.findIndex((f, i) => i >= pauseAt && f.ball === id);
    if (k < 0) k = pauseAt;
    const p = frames[k].players[id];
    const key = `${id}:${k}`;
    if (checked.has(key)) continue;
    checked.add(key);
    const fromRim = Math.hypot(p[0] - Court.RIM.x, p[1] - Court.RIM.y);
    if (corner && !(p[0] <= 4 || p[0] >= 46) && p[1] <= 16) {
      out.push(`${id} is called the corner player but stands at ${where(p)} in frame ${k}: the corner is x 0-3 (or 47-50) with y 0-14, behind the three-point line`);
    } else if (three && !beyondArc(p)) {
      out.push(`${id} is meant to shoot a three but stands at ${where(p)} in frame ${k}, inside the arc: corner threes need x 0-3 (or 47-50) and y 0-14, others more than 23.75 ft from the rim (25, 5.25)`);
    } else if (wing && !corner && fromRim < 20) {
      out.push(`${id} is called the wing player but stands at ${where(p)} in frame ${k}, ${Math.round(fromRim)} ft from the rim, well inside the arc: the wings are about (7, 23) and (43, 23)`);
    }
  }

  // Left and right are as the attacker sees the court: the baseline is at the
  // top of the picture, so left is low x and right is high x.
  const starter = frames[0].ball;
  if (starter && /^o/.test(starter) && frames[pauseAt].players[starter]) {
    const dx = frames[pauseAt].players[starter][0] - frames[0].players[starter][0];
    for (const line of [...sentences(play.prompt), ...sentences(play.explanation || play.rationale)]) {
      // A direction ("drives left", "attacks the gap to the right", "the left gap"),
      // not a starting place ("driving from the left wing").
      const m = /\b(?:drives?|driving|drove|attacks?|attacking|attacked|goes|going|went|dribbles?|dribbling)\s+(?:hard\s+)?(?:to(?:wards?)?\s+(?:the\s+|your\s+)?)?(left|right)\b(?![- ]?(?:wing|corner|elbow|block|slot|side of))|\bgap\s+(?:to|on)\s+(?:the\s+|your\s+)?(left|right)\b|\b(left|right)(?:[- ]side)? gap\b/i.exec(line);
      if (!m) continue;
      const side = (m[1] || m[2] || m[3]).toLowerCase();
      if ((side === 'left' && dx > 2) || (side === 'right' && dx < -2)) {
        out.push(`the text says ${starter} drives ${side}, but ${starter} moves ${dx > 0 ? 'right' : 'left'} (x ${frames[0].players[starter][0]} to ${frames[pauseAt].players[starter][0]}): left is low x, right is high x, as the attacker faces the basket`);
      }
      break;
    }
  }

  // Weak side is the half of the floor away from the ball; strong side is the ball's half.
  const ballAt = holder && at[holder];
  if (ballAt && Math.abs(ballAt[0] - 25) >= 3) {
    for (const line of [...options.map((o) => o.label), ...sentences(play.prompt), ...sentences(play.explanation || play.rationale)]) {
      const low = line.toLowerCase();
      const side = /\bweak[- ]side\b/.test(low) ? 'weak' : /\bstrong[- ]side\b|\bball[- ]side\b/.test(low) ? 'strong' : '';
      const ds = playerIds(line).filter((id) => /^d/.test(id) && ids.includes(id));
      if (!side || ds.length !== 1) continue;
      const startX = frames[0].players[ds[0]][0];
      if (Math.abs(startX - 25) < 3) continue;
      const sameSide = (startX - 25) * (ballAt[0] - 25) > 0;
      if (side === 'weak' && sameSide) out.push(`${ds[0]} is called weak-side help but starts on the ball's side of the floor (x ${startX}, the ball at x ${ballAt[0]}): the weak side is the half away from the ball`);
      if (side === 'strong' && !sameSide) out.push(`${ds[0]} is called strong-side but starts on the far side from the ball (x ${startX}, the ball at x ${ballAt[0]})`);
      break;
    }
  }

  // A helper the words describe is in the drawing: a defender other than the
  // ball's own who closes in on the ball by the pause.
  const told = [play.prompt, play.explanation, play.rationale].filter(Boolean).join(' ');
  if (holder && /^o/.test(holder) && /\b(help|helper|helps|helping|helped|steps? up|stepped up|stepping up|collapses?|collapsed)\b/i.test(told)
    && !/\b(no|nobody|not|never|doesn't|does not|didn't|did not)\b[^.]{0,25}\b(help|helps|helper|steps? up|comes?)\b/i.test(told)) {
    const ballNow = at[holder];
    const ball0 = frames[0].players[holder];
    const defenders = ids.filter((id) => /^d/.test(id));
    const own = defenders.reduce((m, id) => (!m || dist(frames[0].players[id], ball0) < dist(frames[0].players[m], ball0) ? id : m), null);
    const helps = defenders.some((id) => id !== own && dist(at[id], ballNow) <= 10 && dist(frames[0].players[id], ballNow) - dist(at[id], ballNow) >= 3);
    if (own && !helps) out.push(`the text has a helper stepping up, but no defender other than ${holder}'s own (${own}) moves in to within 10 ft of ${holder} by the pause (frame ${pauseAt})`);
  }

  // The right read, when it is a pass to one teammate.
  if (right) {
    const named = playerIds(right.label).filter((id) => /^o/.test(id) && id !== holder);
    const target = named.length === 1 && (PASS_WORDS.test(right.label) || !/\b(shoot|drive|finish|pull|dribble|attack|keep)\b/i.test(right.label)) ? named[0] : null;
    if (target && at[target]) {
      // After the pause, the ball goes where the answer sends it.
      const later = frames.slice(pauseAt + 1).map((f) => f.ball).filter(Boolean);
      const firstNew = later.find((b) => b !== holder);
      if (firstNew && firstNew !== target) out.push(`the answer passes to ${target}, but after the pause the play sends the ball to ${firstNew}`);
      // And the target is the open one: not covered while another option's target is free.
      const open = (id) => Math.min(...ids.filter((d) => /^d/.test(d)).map((d) => dist(at[id], at[d])));
      const mine = open(target);
      for (const o of options) {
        if (o === right) continue;
        const other = playerIds(o.label).filter((id) => /^o/.test(id) && id !== holder && id !== target && at[id]);
        if (other.length !== 1) continue;
        const theirs = open(other[0]);
        if (mine < 6 && theirs >= mine + 4) {
          out.push(`at the pause the answer's ${target} has a defender ${Math.round(mine)} ft away while ${other[0]} (another option) has none within ${Math.round(theirs)} ft: the drawing does not show the answer as the open pass`);
        }
      }
    }
  }
  return out;
}

/** A list as the model sent it: an array, or an array sent as a JSON string. */
function listOf(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { const v = JSON.parse(value); return Array.isArray(v) ? v : value; } catch { return value; }
  }
  return value;
}

/** A play check with its frames and options read as lists, and pauseAt as a number. */
function readPlay(raw) {
  const out = { ...raw, frames: listOf(raw.frames), options: listOf(raw.options) };
  if (typeof out.pauseAt === 'string' && /^\d+$/.test(out.pauseAt.trim())) out.pauseAt = Number(out.pauseAt);
  return out;
}

/** Everything wrong with a play check as written, or []: what a repair call is told. */
function playCheckProblems(raw, skillId = '') {
  if (!raw || typeof raw !== 'object') return ['not written'];
  raw = readPlay(raw);
  const drawn = Court.validate(raw.frames);
  if (drawn) return [drawn];
  const options = cleanOptions(raw.options);
  if (!options) {
    const n = Array.isArray(raw.options) ? raw.options.length : 0;
    return [n >= 2 && n <= 4 ? 'two options have the same words, or one has no id or label' : `${n} options, not 2 to 4 {id, label}`];
  }
  const want = String(raw.answer || '').trim();
  if (!options.some((o) => o.id === want || o.label.toLowerCase() === want.toLowerCase())) return ['the answer is not the id or label of one of its options'];
  return [...playProblems({ ...raw, explanation: raw.explanation || raw.rationale }), ...checkTextProblems(raw, skillId)];
}

/** A play check written by the model, made safe, or null. */
function cleanPlayCheck(raw, skillId = '') {
  if (!raw || typeof raw !== 'object') return null;
  raw = readPlay(raw);
  const prompt = String(raw.prompt || '').trim();
  const rationale = String(raw.rationale || '').trim();
  if (prompt.length < 4 || rationale.length < 10) return null;
  if (playCheckProblems(raw, skillId).length) return null;
  const options = cleanOptions(raw.options);
  const want = String(raw.answer || '').trim();
  const right = options.find((o) => o.id === want) || options.find((o) => o.label.toLowerCase() === want.toLowerCase());
  const pauseAt = Number.isInteger(raw.pauseAt) ? Math.max(0, Math.min(raw.frames.length - 1, raw.pauseAt)) : raw.frames.length - 1;
  return {
    format: 'play',
    frames: raw.frames,
    pauseAt,
    options,
    seconds: Math.max(2, Math.min(30, Number(raw.seconds) || 6)),
    prompt: prompt.slice(0, 600),
    answer: right.label,
    answer_id: right.id,
    accepts: [right.id],
    rationale: rationale.slice(0, 600),
    hint: String(raw.hint || '').trim().slice(0, 300),
  };
}

/** Is the read picked the right one? The page sends the option id. */
function gradePlay(check, answer) {
  const a = String(answer == null ? '' : answer).trim();
  return !!a && (a === check.answer_id || a.toLowerCase() === String(check.answer || '').toLowerCase());
}

// ── the other blocks ───────────────────────────────────────────────────────

/** A shot log records a spot and make or miss: a prompt asking for more is asking for what it cannot keep. */
function shotLogProblems(data) {
  const out = [];
  const prompt = String(data.prompt || '');
  const asks = /\b(note|record|write down|write|track|rate|grade|score|jot)\b\W+(?:[\w'-]+\W+){0,5}?(pass(?:er|es)?|catch(?:es)?|foot(?:work)?|feet|defenders?|contests?|close-?outs?|arc|form|release|dribbles?|feel(?:ing)?|confidence|quality|clean|balance|time)\b/i.exec(prompt);
  if (asks) out.push(`prompt: asks the learner to ${asks[1].toLowerCase()} the ${asks[2].toLowerCase()}, which a shot log cannot record; it records only where each shot was taken and whether it went in`);
  // "3 shots from each of 5 spots" counts per spot, not the set.
  if (!/\b(from|at|on|per|in) (each|every)\b|\bper (spot|side|location|wing|corner|station)\b|\beach of\b/i.test(prompt)) {
    const counts = [...prompt.matchAll(/\b(\d{1,3})\s+(?:[a-z-]+\s+){0,3}?(shots|threes|3s|jumpers|jump shots|free throws|layups|attempts|reps)\b/gi)].map((m) => Number(m[1]));
    const distinct = [...new Set(counts)];
    if (distinct.length === 1 && distinct[0] >= 5 && distinct[0] <= 100 && data.shots !== distinct[0]) out.push(`shots: the prompt asks for ${distinct[0]} shots, so set "shots" to ${distinct[0]}`);
  }
  return out;
}

const UNSAFE = /\b(barbell|dumbbell|kettlebell|weighted (vest|ball|jump)|max(imum)? (out|reps|weight|lift)|one[- ]rep max|to failure|until (you )?(puke|throw up|collapse|drop|exhaust)|no (water|rest)|punishment|as a punishment|depth jumps?)\b/i;

/** A court session: a real warm-up first, safe loads. */
function sessionProblems(data) {
  const out = [];
  const warmup = Array.isArray(data.warmup) ? data.warmup : [];
  if (warmup.length) {
    const total = warmup.reduce((n, w) => n + (Number(w && w.seconds) || 0), 0);
    if (total < 300) out.push(`warmup: ${total} seconds in all; give at least 5 minutes of jogging, dynamic movement and jump-and-land practice, or leave "warmup" out to use the built-in one`);
    if (!warmup.some((w) => /\b(jump|land|hop|bound|skip|spring)/i.test(String(w && w.name)))) out.push('warmup: include a jump-and-land item (land softly, knees over toes): landing practice is the part of a warm-up that cuts knee and ankle injuries');
  }
  const drills = Array.isArray(data.drills) ? data.drills : [];
  const minutes = drills.reduce((n, d) => n + (Number(d && d.minutes) || 0), 0);
  if (minutes > 60) out.push(`drills: ${minutes} minutes of drills; keep a session's drills to an hour or less`);
  const bad = UNSAFE.exec(textOf(data));
  if (bad) out.push(`"${bad[0]}": court sessions use bodyweight and bands only, with rest, never maximal loads, training to failure or running as punishment`);
  return out;
}

/** The handling drill counts touches and reaction times, in short rounds. */
function handleDrillProblems(data) {
  const out = [];
  const total = (Number(data.rounds) || 3) * (Number(data.seconds) || 30);
  if (total > 300) out.push(`rounds x seconds is ${total} s; keep the drill to 5 minutes or less`);
  const asks = /\b(count|record|log|note|track|write down)\b\W+(?:[\w'-]+\W+){0,5}?(dribbles?|bounces?|turnovers?|heart ?rate|steps)\b/i.exec(String(data.prompt || ''));
  if (asks) out.push(`prompt: asks the learner to ${asks[1].toLowerCase()} ${asks[2].toLowerCase()}, which the drill cannot record; it counts touches on the targets and reaction times`);
  const bad = UNSAFE.exec(textOf(data));
  if (bad) out.push(`"${bad[0]}": no maximal loads, training to failure or punishment in a drill`);
  return out;
}

/** Problems with a basketball block's data that its schema cannot see. */
function blockProblems(tag, data) {
  if (!data || typeof data !== 'object') return [];
  // Basketball's own blocks; the words of every block are checked against false rules claims.
  const rules = ruleProblems(textOf(data)).map((why) => `false rules claim: ${why}`);
  if (!/^Basketball_/.test(tag)) return rules;
  const out = [];
  const p = pronounProblem(textOf(data));
  if (p) out.push(p);
  if (tag === 'Basketball_Play') {
    const problem = Court.validate(data.frames);
    if (problem) return [`frames: ${problem}`];
    const options = cleanOptions(data.options);
    if (!options) return ['options: give 2 to 4 options, each with a unique id and its own words'];
    if (!options.some((o) => o.id === data.answer)) return ['answer: must be the id of one of the options'];
    out.push(...playProblems(data).map((x) => `play: ${x}`));
  }
  if (tag === 'Basketball_ShotLog' || tag === 'Basketball_ShotTracker') out.push(...shotLogProblems(data));
  if (tag === 'Basketball_Session') out.push(...sessionProblems(data));
  if (tag === 'Basketball_HandleDrill') out.push(...handleDrillProblems(data));
  return [...out, ...rules];
}

module.exports = {
  cleanPlayCheck, gradePlay, blockProblems, playCheckProblems, checkTextProblems,
  // For tests.
  playProblems, ruleProblems, pronounProblem, shotLogProblems, sessionProblems, cleanOptions, beyondArc,
};
