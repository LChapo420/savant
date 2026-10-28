/**
 * Deterministic checks of the algebra and arithmetic a model-written lesson states.
 *
 * The 2026-10-23 content fact audit (curriculum-build/CONTENT-FACT-AUDIT.md) found
 * 31 algebra misstatements in 30 stored lessons, nearly all in "Common Mistakes":
 *
 *   "Adding 7 to both sides of x + 7 = 12 ... gives x = 19"   (it gives x + 14 = 19)
 *   "Dividing by 2 before removing the 4 in 2x + 4 = 14 ... gives x + 4 = 7"
 *
 * The writer was asked to "name the wrong move and what it produces", and computed
 * what the wrong move produces wrongly. And one check question keyed x = 3 as wrong
 * for 2x + 4 = 10, where x = 3 is the solution.
 *
 * What is checked (only what can be settled by computation; anything that does not
 * parse is left alone, so prose and non-linear work are never rejected here):
 *
 *   1. Operation claims, anywhere in the lesson, including wrong work: "<add|subtract|
 *      multiply|divide> N <to/from/by> <both sides | one side | the left side ...> of EQ
 *      ... gives EQ2". Doing that operation to EQ must give an equation with EQ2's
 *      solution. A wrong MOVE is fine to describe; a wrong RESULT of the move is not.
 *      A term-only move ("divides only the 2x by 2") is not checked.
 *   2. Worked work stated as correct (worked example, section examples): every
 *      one-variable linear equation in it has the problem's solution, the stated
 *      answer is that solution, and every arithmetic line ("3(5) + 5 = 20") is true.
 *   3. Arithmetic stated as true in teaching text ("5 + 3 = 8 checks out"), unless the
 *      sentence marks it as wrong ("not", "fails", "wrong", "instead" ...).
 *   4. Check questions: "Solve EQ" keys must be the solution; "a student solves EQ and
 *      writes x = v. What went wrong?" must key "nothing went wrong" exactly when v is
 *      the solution.
 *   5. (opt-in, for the labelled format of the fixed prompt) every common mistake
 *      shows the wrong work labelled as wrong and the correct step.
 */

const EPS = 1e-9;
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

// ── linear arithmetic: {c: coefficient of the variable, k: constant, v: variable|null}
function parseLinear(src, { xIsTimes = false } = {}) {
  let s = String(src)
    .replace(/\btimes\b/gi, '*').replace(/\bplus\b/gi, '+').replace(/\bminus\b/gi, '-').replace(/\bdivided by\b/gi, '/')
    .replace(/(\d) (\d)\/(\d)/g, '($1+$2/$3)')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
    .replace(/[−–—]/g, '-').replace(/[×·∙]/g, '*').replace(/÷/g, '/').replace(/\$/g, '')
    .replace(/(\d),(\d{3})/g, '$1$2');
  if (xIsTimes) s = s.replace(/(\d|\))\s*[xX]\s*(?=[\d(])/g, '$1*');
  const toks = [];
  const re = /\s*(\d+(?:\.\d+)?|\.\d+|[a-zA-Z]|[-+*/^()])/y;
  s = s.trim();
  let at = 0;
  while (at < s.length) {
    re.lastIndex = at;
    const m = re.exec(s);
    if (!m) throw new Error('bad char');
    toks.push(m[1]);
    at = re.lastIndex;
    while (at < s.length && /\s/.test(s[at])) at++;
  }
  if (!toks.length) throw new Error('empty');
  let i = 0;
  let varName = null;
  const peek = () => toks[i];
  const lin = (c, k) => ({ c, k });
  const mul = (a, b) => { if (Math.abs(a.c) > EPS && Math.abs(b.c) > EPS) throw new Error('nonlinear'); return lin(a.c * b.k + b.c * a.k, a.k * b.k); };
  const div = (a, b) => { if (Math.abs(b.c) > EPS) throw new Error('nonlinear'); if (Math.abs(b.k) < EPS) throw new Error('div0'); return lin(a.c / b.k, a.k / b.k); };
  function expr() {
    let a = term();
    while (peek() === '+' || peek() === '-') { const op = toks[i++]; const b = term(); a = op === '+' ? lin(a.c + b.c, a.k + b.k) : lin(a.c - b.c, a.k - b.k); }
    return a;
  }
  function term() {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t === '*') { i++; a = mul(a, unary()); } else if (t === '/') { i++; a = div(a, unary()); } else if (t !== undefined && (t === '(' || /^[a-zA-Z\d.]/.test(t))) a = mul(a, power());
      else return a;
    }
  }
  function unary() { if (peek() === '-') { i++; const a = unary(); return lin(-a.c, -a.k); } if (peek() === '+') { i++; return unary(); } return power(); }
  function power() {
    const b = atom();
    if (peek() === '^') { i++; const e = unary(); if (Math.abs(e.c) > EPS || Math.abs(b.c) > EPS) throw new Error('nonlinear'); return lin(0, b.k ** e.k); }
    return b;
  }
  function atom() {
    const t = toks[i++];
    if (t === undefined) throw new Error('eof');
    if (t === '(') { const a = expr(); if (toks[i++] !== ')') throw new Error('paren'); return a; }
    if (/^[\d.]/.test(t)) return lin(0, Number(t));
    if (/^[a-zA-Z]$/.test(t)) { if (varName && varName !== t) throw new Error('twovars'); varName = t; return lin(1, 0); }
    throw new Error('unexpected');
  }
  const r = expr();
  if (i !== toks.length) throw new Error('trailing');
  return { ...r, v: varName };
}

// An equation's sides: digits, one-letter variables, operators and brackets.
const SIDE = "(?:[-+*/×÷·−^().%\\d \\t]|\\btimes\\b|\\bplus\\b|\\bminus\\b|\\bdivided by\\b|(?<![A-Za-z])[A-Za-z](?![A-Za-z']))+";
/** One-variable equations and arithmetic equalities in a text, with their positions. */
function equationsIn(text) {
  // Thousands separators ("1,000", "2,500,000") are one number, not "1" and "000":
  // read as "1000" before parsing. The removed commas are padded back as trailing
  // spaces so every offset (`at`, `end`) still points into the caller's text.
  const t = String(text || '').replace(/[?!]/g, '|')
    .replace(/\b\d{1,3}(?:,\d{3})+(?![\d,])/g, (n) => n.replace(/,/g, '') + ' '.repeat((n.match(/,/g) || []).length));
  const out = [];
  const re = new RegExp(`(${SIDE})=(${SIDE})`, 'g');
  let m;
  while ((m = re.exec(t))) {
    const L = m[1].replace(/^[\s,.:(]+/, '').trim();
    const R = m[2].replace(/[\s.,:;)]+$/, '').trim();
    // a left side cut off after an operator word ("half of 12 = 6", "3 squared = 9") is not an equation
    const before = t.slice(Math.max(0, m.index - 14), m.index + m[0].indexOf(L));
    const numericL = !/[a-z]/i.test(L.replace(/\b(?:times|plus|minus|divided by)\b/gi, ''));
    const cut = numericL
      && (/(?:\b(?:of|by|over|than|squared|cubed|percent|times|plus|minus|root|mod|modulo|log|ln|sin|cos|tan|sqrt|base|power|choose|gcd|lcm|gcf)|[%^*/+-])\s*$/i.test(before)
        || /[^\s\w(,:;.'"“‘—–-]\s*$/.test(before)); // "√16 = 4", "|−3| = 3"
    // "78 ÷ 7 = 11 full teams with 1 left over": a division read as whole groups
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
    const grouped = /[÷/]/.test(L) && /^\s*(?:r\s*\d|rem|remainder|with|full|whole|groups?|teams?|times|left|and)\b/i.test(after);
    if (!cut && !grouped && L && R && /[\da-z]/i.test(L) && /[\da-z]/i.test(R) && !/^[a-z]$/i.test(L + R)) {
      out.push({ L, R, raw: `${L} = ${R}`, at: m.index + m[0].indexOf(L), end: m.index + m[1].length + 1 + m[2].replace(/[\s.,:;)]+$/, '').length });
    }
    re.lastIndex = m.index + m[1].length + 1; // chains "a = b = c" are read pairwise
  }
  return out;
}

/** "2 x 3" is a product; "2x" is two times the variable x. */
const timesX = (raw) => /\d\s+x\s+\d|\)\s*x\s*\(/.test(raw);

/** Solve one equation: {v, x} | {arith: true, ok} | {degenerate: true}; throws when it does not parse. */
function solve(L, R, raw = `${L}=${R}`) {
  const opt = { xIsTimes: timesX(raw) };
  const a = parseLinear(L, opt);
  const b = parseLinear(R, opt);
  if (a.v && b.v && a.v !== b.v) throw new Error('twovars');
  const v = a.v || b.v;
  if (!v) {
    // "20 ÷ 20 × 100 = 100%": a percent sign may be a label as well as a / 100
    let ok = close(a.k, b.k);
    if (!ok && /%/.test(raw)) {
      try { ok = close(parseLinear(L.replace(/%/g, ''), opt).k, parseLinear(R.replace(/%/g, ''), opt).k); } catch { /* */ }
    }
    return { arith: true, ok, lhs: a.k, rhs: b.k };
  }
  const c = a.c - b.c;
  if (Math.abs(c) < EPS) return { v, degenerate: true };
  return { v, x: (b.k - a.k) / c, a, b };
}
const trySolve = (e) => { try { return solve(e.L, e.R, e.raw); } catch { return null; } };

// ── 1. operation claims ────────────────────────────────────────────────────────
const OP_RE = /\b(add(?:s|ing|ed)?|subtract(?:s|ing|ed)?|multipl(?:y|ies|ying|ied)|divid(?:e|es|ing|ed))\b/gi;
const RESULT_RE = /\b(gives?|giving|gave|leaves?|leaving|yields?|yielding|produces?|producing|results? in|resulting in|you get|to get|get|gets|getting|turns? (?:it )?into|becomes?|makes? it)\b/i;
const WRONG_CUE = /\b(not|never|isn't|is not|doesn't|fails?|wrong|incorrect|mistake|instead|error|slip|false|would|could|might|if you|≠)\b|≠/i;

function opKind(word) {
  const w = word.toLowerCase();
  if (w.startsWith('add')) return 'add';
  if (w.startsWith('sub')) return 'sub';
  if (w.startsWith('mul')) return 'mul';
  return 'div';
}
function apply(kind, side, n) {
  if (kind === 'add') return { c: side.c, k: side.k + n };
  if (kind === 'sub') return { c: side.c, k: side.k - n };
  if (kind === 'mul') return { c: side.c * n, k: side.k * n };
  return { c: side.c / n, k: side.k / n };
}
const solOf = (l, r) => (Math.abs(l.c - r.c) < EPS ? null : (r.k - l.k) / (l.c - r.c));

function scopeOf(clause) {
  const c = clause.toLowerCase();
  if (/\bonly (?:the |its )?(?:\d+(?:\.\d+)?\s*)?[a-z]\b(?! side)|\bjust (?:the )?(?:\d+(?:\.\d+)?\s*)?[a-z]\b(?! side)|\b(?:only|just) (?:the )?(?:\w+ )?term\b|\bthe \d*[a-z] term\b|\binto (?:the )?(?:\d+(?:\.\d+)?)?[a-z]\b/.test(c)) return 'term';
  if (/\bboth sides\b|\beach side\b/.test(c) && !/\bonly\b/.test(c)) return 'both';
  if (/\bleft\b/.test(c) && !/\bright\b/.test(c)) return 'left';
  if (/\bright\b/.test(c) && !/\bleft\b/.test(c)) return 'right';
  if (/\bone side\b|\bonly one\b|\bsingle side\b/.test(c)) return 'one';
  if (/\bboth sides\b|\beach side\b|\bwhole equation\b|\bevery term\b|\beverything\b|\bfirst\b|\bbefore\b/.test(c)) return 'both';
  return 'unspecified';
}

/**
 * Operation claims in one passage (a bullet, a step, a paragraph).
 * @returns {{claim: string, problem: string}[]}
 */
function operationProblems(text) {
  const t = String(text || '');
  const eqs = equationsIn(t);
  const problems = [];
  if (!eqs.length) return problems;
  OP_RE.lastIndex = 0;
  let m;
  while ((m = OP_RE.exec(t))) {
    const opAt = m.index;
    // "instead of subtracting 7", "x is divided by 5": an alternative or a description, not the move made
    if (/\b(?:instead of|rather than|than|not|is|are|was|were|be|been|being|by)\s+$/i.test(t.slice(Math.max(0, opAt - 14), opAt))) continue;
    {
      // the second of two moves joined by "and" before one result: "adding 8 to the left and subtracting 8 from the right gives"
      const lead = t.slice(Math.max(0, opAt - 120), opAt);
      const sentenceStart = Math.max(lead.lastIndexOf('. '), lead.lastIndexOf('\n'), lead.lastIndexOf('; '));
      const before = lead.slice(sentenceStart + 1);
      if (/\b(?:add(?:s|ing|ed)?|subtract(?:s|ing|ed)?|multipl(?:y|ies|ying|ied)|divid(?:e|es|ing|ed))\b[^.;]*\band\s+$/i.test(before) && !RESULT_RE.test(before)) continue;
    }
    // the number operated with: "adding 7", "dividing both sides by 3", "dividing 3x + 5 = 20 by 3"
    const resultIdx = (() => {
      const seg = t.slice(opAt, Math.min(t.length, opAt + 260));
      const r = seg.search(RESULT_RE);
      return r < 0 ? -1 : opAt + r;
    })();
    if (resultIdx < 0) continue;
    const head = t.slice(opAt, resultIdx);
    // The result belongs to this move only when it follows in the same sentence, or
    // in the next one opening "That ...": "Adding 7 to both sides of x + 7 = 12. That gives x = 19."
    const stop = head.search(/[.;!?:]\s+(?=\S)|\n/);
    if (stop >= 0) {
      const rest = head.slice(stop).replace(/^[.;!?:\s]+/, '');
      if (!(/^(?:that|this|which|it|doing (?:that|this|so)|so)\b/i.test(rest) || /\b(?:this|that|the) (?:move|step)\b/i.test(rest)) || /[.;!?]\s+\S/.test(rest)) continue;
    }
    // Two moves before one result ("adding 8 to the left and subtracting 8 from the right gives ...")
    // cannot be checked one at a time.
    const otherMove = [...head.slice(m[0].length).matchAll(/\b(?:add(?:s|ing|ed)?|subtract(?:s|ing|ed)?|multipl(?:y|ies|ying|ied)|divid(?:e|es|ing|ed))\b/gi)]
      .some((x) => !/\b(?:instead of|rather than|than|not|of|is|are|by)\s+$/i.test(head.slice(Math.max(0, m[0].length + x.index - 14), m[0].length + x.index)));
    if (otherMove) continue;
    const numM = head.match(/^\S+\s+(?:(?:both sides|each side|the (?:whole )?equation|everything|it)\s+(?:of [^,]*?\s+)?)?(?:by\s+)?(?:the\s+|another\s+)?(-?\d+(?:\.\d+)?)(?!\.\d|[a-z(\d])/i)
      || head.match(/\bby\s+(-?\d+(?:\.\d+)?)(?!\.\d|[a-z(\d])/i);
    if (!numM) continue;
    const n = Number(numM[1]);
    const kind = opKind(m[1]);
    if ((kind === 'mul' || kind === 'div') && Math.abs(n) < EPS) continue;
    // the result: the first equation that starts after the result word
    const result = eqs.find((e) => e.at > resultIdx && e.at - resultIdx < 80);
    // ... in the same sentence as the result word ("add 2 to get 14. Evaluate ... x = 3" is not a result)
    if (!result || /[.;!?|]\s|\n/.test(t.slice(resultIdx, result.at))) continue;
    // The source: the equation the move is named on ("of/in/to/for/when you see EQ"),
    // else the passage's first equation before the move. Any other equation between
    // the move and its result is the learner's own written step, which the claim
    // then describes: that cannot be checked against the move.
    const between = eqs.filter((e) => e.at > opAt && e.end <= resultIdx + 1);
    const named = (e) => /\b(?:of|in|to|for|from|on|see|with)\s+$/i.test(t.slice(Math.max(0, e.at - 10), e.at));
    if (between.some((e) => !named(e))) continue;
    // A source named right at the move ("of EQ", "In EQ, subtracting ...") is the only
    // one; otherwise the move may be on any equation before it in the passage, and the
    // claim is wrong only when it fits none of them.
    const prior = eqs.filter((e) => e.end <= opAt);
    const last = prior[prior.length - 1];
    const lead = last && named(last) && /^[\s,:]*(?:then\s+|and\s+|so\s+)?$/i.test(t.slice(last.end, opAt)) ? last : null;
    const sources = between.length ? [between[0]] : lead ? [lead] : prior;
    if (!sources.length) continue;
    let res;
    try {
      const o2 = { xIsTimes: timesX(result.raw) };
      res = { l: parseLinear(result.L, o2), r: parseLinear(result.R, o2) };
    } catch { continue; }
    const scope = scopeOf(t.slice(opAt, resultIdx));
    if (scope === 'term') continue;
    const sRes = solOf(res.l, res.r);
    let checked = null;
    let fits = false;
    for (const source of sources) {
      if (source === result) continue;
      let src;
      try {
        const o = { xIsTimes: timesX(source.raw) };
        src = { l: parseLinear(source.L, o), r: parseLinear(source.R, o) };
      } catch { continue; }
      const v = src.l.v || src.r.v;
      if (!v || (src.l.v && src.r.v && src.l.v !== src.r.v)) continue;
      if ((res.l.v && res.l.v !== v) || (res.r.v && res.r.v !== v) || (!res.l.v && !res.r.v)) continue;
      const s0 = solOf(src.l, src.r);
      if (s0 == null || sRes == null) continue;
      const cands = [];
      const both = solOf(apply(kind, src.l, n), apply(kind, src.r, n));
      const left = solOf(apply(kind, src.l, n), src.r);
      const right = solOf(src.l, apply(kind, src.r, n));
      if (scope === 'both') cands.push(both);
      else if (scope === 'left') cands.push(left);
      else if (scope === 'right') cands.push(right);
      else if (scope === 'one') cands.push(left, right);
      else {
        // Unspecified: the move as written on both sides, on one side, or the classic
        // slip of carrying the number across without changing the operation
        // ("x + 7 = 15, adding 7 instead gives 22" means x = 15 + 7).
        cands.push(both, left, right);
        const varSide = Math.abs(src.l.c) > EPS ? src.l : src.r;
        const numSide = varSide === src.l ? src.r : src.l;
        if (Math.abs(varSide.c) > EPS) {
          const moved = apply(kind, numSide, n);
          cands.push((moved.k) / varSide.c, moved.k);
        }
      }
      if (cands.some((c) => c != null && close(c, sRes))) { fits = true; break; }
      if (!checked) checked = { source, v, s0 };
    }
    if (fits || !checked) continue;
    const claim = t.slice(opAt, Math.min(t.length, result.end + 1)).replace(/\s+/g, ' ').trim();
    const { source, v, s0 } = checked;
    const want = scope === 'both' ? `doing that to both sides of ${source.raw} keeps the solution ${v} = ${fmt(s0)}` : `that move on ${source.raw} does not lead to ${result.raw}`;
    problems.push({ claim, problem: `${want}, but ${result.raw} has ${v} = ${fmt(sRes)}` });
  }
  return problems;
}
const fmt = (x) => String(+Number(x).toFixed(4));

// ── 2/3. correct work: chains and arithmetic ────────────────────────────────────
/** Arithmetic equalities stated as true in a passage (sentences that mark them wrong are skipped). */
function arithmeticProblems(text) {
  const out = [];
  for (const sentence of String(text || '').split(/(?<=[.;!?])\s+|\n/)) {
    if (WRONG_CUE.test(sentence)) continue;
    for (const e of equationsIn(sentence)) {
      const s = trySolve(e);
      if (s && s.arith && !s.ok) out.push({ claim: e.raw, problem: `${e.L} is ${fmt(s.lhs)}, not ${fmt(s.rhs)}` });
    }
  }
  return out;
}

function arithmeticOnly(lines) {
  return lines.flatMap((line) => arithmeticProblems(line));
}

/**
 * Work stated as correct: the problem's equation, the lines that follow, the answer.
 * Every one-variable equation in the lines has the problem's solution.
 */
function workProblems(problemText, lines, answer) {
  const out = [];
  const all = [problemText, ...lines].join('\n');
  if (/[<>≤≥]|\bsystem\b|\binequalit/i.test(all)) return out;
  // "Find 2x + 5 when x = 6" substitutes a value; it is not an equation to solve.
  if (/\b(?:when|if|for|with|where|at|using|let)\s+[a-z]\s*=/i.test(problemText)) return arithmeticOnly(lines);
  const assignment = (e) => /^[a-z]$/i.test(e.L.trim()) && !/[a-z]/i.test(e.R) ;
  const firstEqs = equationsIn(problemText).map((e) => ({ e, s: trySolve(e) })).filter((x) => x.s && !x.s.arith && !x.s.degenerate && !assignment(x.e));
  // The equation to solve comes from the problem itself: one read off a later line
  // can be a unit ("5 g = 17 g") or a sub-step, and is not checked against.
  const base = firstEqs.length === 1 ? firstEqs[0] : null;
  const fromProblem = Boolean(base);
  for (const line of lines) {
    for (const sentence of String(line).split(/(?<=[.;!?])\s+|\n/)) {
      if (WRONG_CUE.test(sentence)) continue;
      const trial = /\b(?:try|test|suppose|guess|plug|substitut\w*|whether|what if)\b/i.test(sentence);
      for (const e of equationsIn(sentence)) {
        const s = trySolve(e);
        if (!s) continue;
        if (s.arith) { if (!s.ok) out.push({ claim: e.raw, problem: `${e.L} is ${fmt(s.lhs)}, not ${fmt(s.rhs)}` }); continue; }
        if (!base || s.degenerate || s.v !== base.s.v) continue;
        if (trial && /^[a-z]$/i.test(e.L.trim())) continue;
        if (!close(s.x, base.s.x)) out.push({ claim: e.raw, problem: `${base.e.raw} has ${s.v} = ${fmt(base.s.x)}, but this step has ${s.v} = ${fmt(s.x)}` });
      }
    }
  }
  if (base && fromProblem && answer) {
    const a = String(answer).match(/^\s*(?:([a-z])\s*=\s*)?(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)\s*\.?\s*$/i);
    if (a && (!a[1] || a[1] === base.s.v)) {
      let val = null;
      try { val = parseLinear(a[2]).k; } catch { /* not numeric */ }
      if (val != null && !close(val, base.s.x)) out.push({ claim: `answer ${answer}`, problem: `${base.e.raw} has ${base.s.v} = ${fmt(base.s.x)}` });
    }
  }
  return out;
}

// ── 4. check questions ─────────────────────────────────────────────────────────
const NOTHING_WRONG = /\bnothing (?:went |is )?wrong\b|\b(?:is|was) (?:already )?correct\b|\bno (?:mistake|error)\b|\bthe answer is right\b/i;
function questionProblems(q) {
  const out = [];
  const prompt = String((q && q.prompt) || '');
  const choices = Array.isArray(q && q.choices) ? q.choices.map(String) : [];
  const answer = String((q && q.answer) || '');
  // "A student solves EQ and writes x = v. What went wrong?"
  const st = prompt.match(/\b(?:solv(?:es|ed|ing)|work(?:s|ed) out|answer(?:s|ed))\s+(.+?=.+?)\s+(?:and|but|then)\s+(?:\w+\s+){0,3}?(?:writes?|wrote|gets?|got|finds?|found|says?|said|claims?|claimed|ends? up with|arrives? at)\s+([a-z])\s*=\s*(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)/i);
  if (st && choices.length) {
    const eq = equationsIn(st[1])[0];
    const s = eq && trySolve(eq);
    let v = null;
    try { v = parseLinear(st[3]).k; } catch { /* */ }
    if (s && !s.arith && !s.degenerate && s.v === st[2] && v != null) {
      const right = close(s.x, v);
      const nothing = choices.find((c) => NOTHING_WRONG.test(c));
      if (right && nothing && nothing.trim() !== answer.trim()) out.push({ claim: prompt, problem: `${st[2]} = ${st[3]} does solve ${eq.raw}, so the key should be "${nothing}"` });
      if (!right && NOTHING_WRONG.test(answer)) out.push({ claim: prompt, problem: `${st[2]} = ${st[3]} does not solve ${eq.raw} (${st[2]} = ${fmt(s.x)}), but the key says nothing went wrong` });
    }
  }
  // "Solve EQ. What is x?" with a numeric key
  const asked = (prompt.match(/\b(?:what is|value of|find|solve for)\s+([a-z])\b(?![a-z'])/i) || [])[1];
  if (/\bsolve\b|\bwhat is ([a-z])\s*[|?]|\bvalue of ([a-z])\b|\bfind ([a-z])\b/i.test(prompt)
    && !/\bstudent\b|\bcheck\b|\bleft side\b|\bright side\b|[<>≤≥]|\b(?:if|when|where|given|with|for)\s+[a-z]\s*=/i.test(prompt)) {
    const isAssignment = (e) => /^[a-z]$/i.test(e.L.trim()) && !/[a-z]/i.test(e.R);
    const eqs = equationsIn(prompt).map((e) => ({ e, s: trySolve(e) })).filter((x) => x.s && !x.s.arith && !x.s.degenerate && !isAssignment(x.e));
    const key = String(answer).match(/^\s*(?:([a-z])\s*=\s*)?(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)\s*$/i);
    if (eqs.length === 1 && key && (!key[1] || key[1] === eqs[0].s.v) && (!asked || asked.toLowerCase() === eqs[0].s.v.toLowerCase())) {
      let val = null;
      try { val = parseLinear(key[2]).k; } catch { /* */ }
      if (val != null && !close(val, eqs[0].s.x)) out.push({ claim: prompt, problem: `${eqs[0].e.raw} has ${eqs[0].s.v} = ${fmt(eqs[0].s.x)}, the key says ${answer}` });
    }
  }
  return out;
}

// ── 5. labelled wrong work (the fixed prompt's format) ─────────────────────────
const WRONG_LABEL = /^\s*(?:wrong|mistake|wrong work|the slip)\s*:/i;
const RIGHT_LABEL = /\b(?:right|correct|instead|fix|correct step)\s*:/i;
function labelProblems(mistakes) {
  return (mistakes || []).map(String).map((m, index) => ({ m, index })).filter(({ m }) => !(WRONG_LABEL.test(m) && RIGHT_LABEL.test(m)))
    .map(({ m, index }) => ({ index, claim: m.slice(0, 160), problem: 'a common mistake must show the wrong work labelled "Wrong:" and the correct step labelled "Right:"' }));
}

/**
 * Every problem found in a lesson, by place. Places: 'section', 'worked', 'mistake',
 * 'summary', 'check'. A lesson with none is clean.
 *
 * @param {object} lesson  {sections, worked_example, common_mistakes, summary, check_questions}
 * @param {{requireLabels?: boolean}} [opts]
 */
function lessonProblems(lesson, opts = {}) {
  const out = [];
  if (!lesson || typeof lesson !== 'object') return out;
  const push = (where, index, list) => list.forEach((p) => out.push({ where, index, ...p }));
  (lesson.sections || []).forEach((s, i) => {
    push('section', i, operationProblems(s.body));
    push('section', i, arithmeticProblems(s.body));
    push('section', i, operationProblems(s.example));
    // An example may hold several problems; each one's lines run until the next starts.
    const lines = String(s.example || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
    // a new problem starts with a keyword, or on the line after one that ended solved ("... : x = 11.")
    const solvedEnd = (x) => /\b[a-z]\s*=\s*-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?\s*\.?\s*$/i.test(x);
    const starts = lines.map((x, j) => (j === 0 || /^(?:solve|example|now|try|another|next|problem|find|compare)\b/i.test(x) || solvedEnd(lines[j - 1]) ? j : -1)).filter((j) => j >= 0);
    starts.forEach((st, k) => {
      const until = k + 1 < starts.length ? starts[k + 1] : lines.length;
      push('section', i, workProblems(lines[st], lines.slice(st + 1, until), null));
    });
  });
  const we = lesson.worked_example;
  if (we && we.problem) {
    push('worked', 0, workProblems(we.problem, we.steps || [], we.answer));
    (we.steps || []).forEach((st) => push('worked', 0, operationProblems(st)));
  }
  (lesson.common_mistakes || []).forEach((m, i) => {
    const text = String(m);
    push('mistake', i, operationProblems(text));
    // In the labelled format the "Right:" part is correct work.
    const right = text.split(RIGHT_LABEL)[1];
    if (right) push('mistake', i, arithmeticProblems(right));
  });
  if (opts.requireLabels) labelProblems(lesson.common_mistakes).forEach((p) => out.push({ where: 'mistake', ...p }));
  push('summary', 0, operationProblems(lesson.summary));
  push('summary', 0, arithmeticProblems(lesson.summary));
  (lesson.check_questions || []).forEach((q, i) => push('check', i, questionProblems(q)));
  // the same claim found by two checks is one problem
  const seen = new Set();
  return out.filter((p) => { const k = `${p.where}:${p.index}:${p.claim}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { lessonProblems, operationProblems, arithmeticProblems, workProblems, questionProblems, labelProblems, equationsIn, parseLinear, solve };
