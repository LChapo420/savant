/**
 * Fact checks that do not guess: a first pass over a written level, no model, no network, no cost (brief fact-gate, 6 Nov 2026).
 *
 *   checkLevel({ trackId, gradeId, topic, blocks, checks }) -> [{ where: 'block 3'|'check 1', rule, certain, claim, truth, path }]
 *
 * It recomputes what can be recomputed, and stays silent on everything it cannot parse:
 *   - arithmetic and unit chains: "(41 - 5) / 6 = 36 / 6 = 6 m/s", "1 inch = 2.54 cm", "25% of 80 = 20", word forms ("dividing 250 by 0.80 gives 312.50");
 *   - solution steps: consecutive equations or inequalities joined by so/then/gives/becomes keep the same solution set; a point claimed to work is substituted;
 *   - functions defined in the same part: f(2) = ..., and rows of a table under the definition;
 *   - keys: an MC key is one of its choices, a block's key points at a real option, two choices are not the same text, a computed prompt ("Evaluate 27^(2/3)",
 *     "Solve 3x + 5 = 20", a system of two equations, perpendicular slope) matches its key, the accepted answers agree with the key;
 *   - agreement inside a level: the same formula written two ways, near-identical sentences that differ only in a number, the same table key with two values;
 *   - the subject checkers that already exist (chess, piano, basketball).
 *
 * `certain: true` findings are recomputed facts: send them straight to repair. `certain: false` findings are strong suspicions (a rationale ending on another
 * number than the key, a formula restated differently): hand them to a reader to rule on, never repair on them alone.
 * Text that is meant to be wrong is not checked: wrong options, trap reasons, wrong examples, flagged audit lines, the false side of a true/false card.
 */
const UNITS = {
  m: ['L', 1], meter: ['L', 1], meters: ['L', 1], metre: ['L', 1], metres: ['L', 1], cm: ['L', 0.01], centimeter: ['L', 0.01], centimeters: ['L', 0.01], mm: ['L', 0.001], millimeter: ['L', 0.001], millimeters: ['L', 0.001], km: ['L', 1000], kilometer: ['L', 1000], kilometers: ['L', 1000],
  inch: ['L', 0.0254], inches: ['L', 0.0254], ft: ['L', 0.3048], foot: ['L', 0.3048], feet: ['L', 0.3048], yd: ['L', 0.9144], yard: ['L', 0.9144], yards: ['L', 0.9144], mile: ['L', 1609.344], miles: ['L', 1609.344], mi: ['L', 1609.344],
  s: ['T', 1], sec: ['T', 1], second: ['T', 1], seconds: ['T', 1], min: ['T', 60], minute: ['T', 60], minutes: ['T', 60], h: ['T', 3600], hr: ['T', 3600], hrs: ['T', 3600], hour: ['T', 3600], hours: ['T', 3600], day: ['T', 86400], days: ['T', 86400], week: ['T', 604800], weeks: ['T', 604800],
  g: ['M', 1], gram: ['M', 1], grams: ['M', 1], kg: ['M', 1000], kilogram: ['M', 1000], kilograms: ['M', 1000], kilo: ['M', 1000], kilos: ['M', 1000], mg: ['M', 0.001], lb: ['M', 453.592], lbs: ['M', 453.592], pound: ['M', 453.592], pounds: ['M', 453.592], oz: ['M', 28.3495], ounce: ['M', 28.3495], ounces: ['M', 28.3495],
  L: ['V', 1], liter: ['V', 1], liters: ['V', 1], litre: ['V', 1], litres: ['V', 1], mL: ['V', 0.001], ml: ['V', 0.001], gallon: ['V', 3.78541], gallons: ['V', 3.78541], gal: ['V', 3.78541], cup: ['V', 0.236588], cups: ['V', 0.236588], quart: ['V', 0.946353], quarts: ['V', 0.946353], pint: ['V', 0.473176], pints: ['V', 0.473176], tablespoon: ['V', 0.0147868], tablespoons: ['V', 0.0147868], teaspoon: ['V', 0.00492892], teaspoons: ['V', 0.00492892],
  dollar: ['$', 1], dollars: ['$', 1], cent: ['$', 0.01], cents: ['$', 0.01],
};
const SPEEDS = { mph: [{ L: 1, T: -1 }, 1609.344 / 3600], kph: [{ L: 1, T: -1 }, 1000 / 3600] };
const SINGLE_LETTER_UNITS = new Set(['s', 'm', 'h', 'g', 'L']);
const FN_NOT = new Set(['x', 'y', 'n', 'a', 'b', 'c', 'm', 'k', 'i', 'j', 'u', 'w', 'z', 'q', 'r', 'l']);
const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };

// ── text → tokens ──
function normalize(s) {
  return String(s)
    .replace(/ | | /g, ' ')
    .replace(/[×·∙⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—](?=\s*[\d(a-zA-Z|])/g, (m, at, str) => (/[—]/.test(m) && /\s/.test(str[at - 1] || '') ? ' ; ' : '-'))
    .replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/½/g, '(1/2)').replace(/¼/g, '(1/4)').replace(/¾/g, '(3/4)')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, ' != ')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(').replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/∛\s*\(/g, 'cbrt(').replace(/∛\s*(\d+(?:\.\d+)?)/g, 'cbrt($1)')
    .replace(/\bUS (cups?|quarts?|pints?|gallons?)\b/g, '$1')
    .replace(/\$\s?(\d+(?:\.\d+)?)/g, '$1 dollars ')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d|\)|\b[a-zA-Z]+)\s+x\s+(?=[\d(])/g, '$1 * ')
    .replace(/\b(\d+(?:\.\d+)?)\s+x\s+(?=[a-zA-Z]{2,})/g, '$1 * ')
    .replace(/(\d|\)|\bpi)\s+times\s+(?=[\d(]|sqrt|cbrt|pi\b)/g, '$1 * ');
}

function tokenize(text) {
  const toks = [];
  const re = /(\d+(?:\.\d+)?(?:\.\.\.)?|\.\d+)|(<=|>=|!=|=>|->|→|⇒|≈|~=|=|<|>)|([+\-*/^()|%])|([A-Za-z](?:[A-Za-z']*|\d(?![\d.])))|(\s+)|([\s\S])/g;
  let m; let space = false;
  while ((m = re.exec(text))) {
    if (m[5]) { space = true; continue; }
    const base = { at: m.index, end: m.index + m[0].length, space };
    if (m[1]) toks.push({ ...base, t: 'num', v: parseFloat(m[1]), dec: (m[1].split('.')[1] || '').replace(/\.+$/, '').length, approx: m[1].endsWith('...') });
    else if (m[2]) {
      if (['=>', '->', '→', '⇒'].includes(m[2])) toks.push({ ...base, t: 'sep', v: m[2] });
      else if (m[2] === '!=') toks.push({ ...base, t: 'sep', v: m[2] });
      else toks.push({ ...base, t: 'rel', v: m[2] === '~=' ? '≈' : m[2] });
    } else if (m[3]) {
      if (m[3] === '(' || m[3] === ')') toks.push({ ...base, t: m[3] === '(' ? 'lp' : 'rp' });
      else if (m[3] === '|') toks.push({ ...base, t: 'bar' });
      else if (m[3] === '%') toks.push({ ...base, t: 'pct' });
      else toks.push({ ...base, t: 'op', v: m[3] });
    } else if (m[4]) {
      const w = m[4];
      if (w === 'pi') toks.push({ ...base, t: 'pi' });
      else if (w === 'sqrt' || w === 'cbrt') toks.push({ ...base, t: 'root', v: w });
      else if (w === 'of') toks.push({ ...base, t: 'of' });
      else if (UNITS[w] && w.length > 1) toks.push({ ...base, t: 'unit', v: w });
      else if (SPEEDS[w]) toks.push({ ...base, t: 'unit', v: w });
      else if (w === 'per') toks.push({ ...base, t: 'per' });
      else if (w.length === 1 || /^[a-z]\d$/.test(w)) toks.push({ ...base, t: 'var', v: w });
      else toks.push({ ...base, t: 'word', v: w });
    } else toks.push({ ...base, t: 'sep', v: m[6] });
    space = false;
  }
  return expandProducts(toks);
}

const ENGLISH_SHORT = new Set(['is', 'at', 'to', 'in', 'on', 'of', 'or', 'an', 'as', 'it', 'if', 'by', 'so', 'the', 'and', 'be', 'we', 'he', 'my', 'us', 'up', 'no', 'do', 'go', 'am', 'are', 'for', 'but', 'not', 'you', 'can', 'has', 'his', 'her', 'she', 'was', 'its', 'one', 'two', 'six', 'ten', 'pen', 'bus', 'car', 'cat', 'dog', 'day']);
/** "ab" or "mx" with an operator or relation beside it is a product of letters, not a word. */
function expandProducts(toks) {
  const out = [];
  toks.forEach((t, i) => {
    if (t.t === 'word' && /^[a-z]{2,3}$/.test(t.v) && !ENGLISH_SHORT.has(t.v)) {
      const p = toks[i - 1]; const n = toks[i + 1];
      const math = (x) => x && (x.t === 'rel' || (x.t === 'op' && x.v !== '/'));
      if (math(p) || math(n) || (p && p.t === 'num' && !t.space && !UNITS[t.v])) { [...t.v].forEach((c, k) => out.push({ ...t, t: 'var', v: c, space: k === 0 ? t.space : false })); return; }
    }
    out.push(t);
  });
  return out;
}

// ── parser: AST nodes { k:'n'|'v'|'f'|'+'|'-'|'*'|'/'|'^'|'neg'|'abs'|'root' } ──
class Fail extends Error {}
function parse(tokens, scope = {}) {
  let i = 0;
  let barDepth = 0;
  const peek = () => tokens[i];
  const unitAfter = () => {
    const a = peek();
    if (!a) return null;
    let u = null;
    if (a.t === 'unit') u = a.v;
    else if (a.t === 'var' && a.space && SINGLE_LETTER_UNITS.has(a.v) && !(tokens[i + 1] && ['op', 'rel'].includes(tokens[i + 1].t) && tokens[i + 1].v !== '/' && scope.__algebra)) u = a.v;
    if (!u) return null;
    i++;
    const n = peek(); const n2 = tokens[i + 1];
    if (n && n2 && ((n.t === 'op' && n.v === '/') || n.t === 'per') && (n2.t === 'unit' || (n2.t === 'var' && SINGLE_LETTER_UNITS.has(n2.v)))) { i += 2; return { top: u, bot: n2.v }; }
    return { top: u };
  };
  const primary = () => {
    const a = peek();
    if (!a) throw new Fail('end');
    if (a.t === 'num') {
      i++;
      const node = { k: 'n', v: a.v, dec: a.dec, approx: a.approx };
      const u = unitAfter();
      if (u) node.unit = u;
      if (peek() && peek().t === 'pct') { i++; node.pct = true; }
      return node;
    }
    if (a.t === 'pi') { i++; return { k: 'n', v: Math.PI, irrational: true }; }
    if (a.t === 'root') {
      i++;
      if (!peek() || peek().t !== 'lp') throw new Fail('root');
      i++;
      const e = expr();
      if (!peek() || peek().t !== 'rp') throw new Fail('rp');
      i++;
      return { k: 'root', d: a.v === 'cbrt' ? 3 : 2, a: e };
    }
    if (a.t === 'lp') {
      i++;
      const e = expr();
      if (!peek() || peek().t !== 'rp') throw new Fail('rp');
      i++;
      return { k: 'p', a: e };
    }
    if (a.t === 'bar') {
      i++;
      barDepth++;
      const e = expr();
      if (!peek() || peek().t !== 'bar') throw new Fail('bar');
      i++;
      barDepth--;
      return { k: 'abs', a: e };
    }
    if (a.t === 'var') {
      i++;
      const n = peek();
      if (n && n.t === 'lp' && !n.space && (!FN_NOT.has(a.v) || scope[a.v])) {
        i++;
        const e = expr();
        if (!peek() || peek().t !== 'rp') throw new Fail('rp');
        i++;
        return { k: 'f', name: a.v, a: e };
      }
      return { k: 'v', v: a.v };
    }
    throw new Fail(`bad ${a.t}`);
  };
  const power = () => {
    const a = primary();
    if (peek() && peek().t === 'op' && peek().v === '^') { i++; return { k: '^', a, b: unary() }; }
    return a;
  };
  const unary = () => {
    const a = peek();
    if (a && a.t === 'op' && a.v === '-') { i++; return { k: 'neg', a: unary() }; }
    if (a && a.t === 'op' && a.v === '+') { i++; return unary(); }
    return power();
  };
  const term = () => {
    let a = unary();
    for (;;) {
      const n = peek();
      if (!n) return a;
      if (n.t === 'op' && (n.v === '*' || n.v === '/')) { i++; a = { k: n.v, a, b: unary() }; continue; }
      if (n.t === 'of' && (a.pct || a.k === 'p' || a.k === '/')) { i++; a = { k: '*', a, b: unary() }; continue; }
      // implicit multiplication, never two bare numbers
      if (n.t === 'var' || n.t === 'lp' || n.t === 'root' || n.t === 'pi' || (n.t === 'bar' && !barDepth)) {
        a = { k: '*', a, b: power() };
        continue;
      }
      return a;
    }
  };
  function expr() {
    let a = term();
    for (;;) {
      const n = peek();
      if (n && n.t === 'op' && (n.v === '+' || n.v === '-')) { i++; a = { k: n.v, a, b: term() }; continue; }
      return a;
    }
  }
  const out = expr();
  if (i < tokens.length) throw new Fail('left over');
  return out;
}
const tryParse = (tokens, scope) => { if (!tokens.length) return null; try { return parse(tokens, scope); } catch (e) { if (e instanceof Fail) return null; throw e; } };

function varsOf(n, out = new Set()) {
  if (!n) return out;
  if (n.k === 'v') out.add(n.v);
  if (n.k === 'f') out.add(`${n.name}()`);
  varsOf(n.a, out); varsOf(n.b, out);
  return out;
}
function hasUnit(n) { return !!n && (!!n.unit || hasUnit(n.a) || hasUnit(n.b)); }
function hasPct(n) { return !!n && (!!n.pct || hasPct(n.a) || hasPct(n.b)); }
function maxDec(n) { return !n ? 0 : Math.max(n.dec || 0, maxDec(n.a), maxDec(n.b)); }
function irrational(n) { return !!n && (!!n.irrational || n.k === 'root' || (n.k === '^' && n.b && (n.b.k === '/' || (n.b.k === 'p' && n.b.a.k === '/'))) || irrational(n.a) || irrational(n.b)); }
function unitOf(u) {
  if (!u) return { dim: {}, si: 1 };
  const d = {}; let si = 1;
  const add = (w, sign) => {
    if (SPEEDS[w]) { for (const [k, v] of Object.entries(SPEEDS[w][0])) d[k] = (d[k] || 0) + v * sign; si *= SPEEDS[w][1] ** sign; return; }
    const [dim, f] = UNITS[w]; d[dim] = (d[dim] || 0) + sign; si *= f ** sign;
  };
  add(u.top, 1);
  if (u.bot) add(u.bot, -1);
  return { dim: d, si };
}
function dimAdd(a, b, sign) { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] || 0) + v * sign; for (const k of Object.keys(o)) if (!o[k]) delete o[k]; return o; }
const dimEq = (a, b) => { const ka = Object.keys(a).filter((k) => a[k]); const kb = Object.keys(b).filter((k) => b[k]); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };

/** Value of a node with `env` for variables, `scope` for functions. opts.si converts units; opts.pct false reads 16% as 16. dims are tracked in opts.si mode. */
function ev(n, env, scope, opts) {
  switch (n.k) {
    case 'n': {
      let v = n.v;
      if (n.pct && opts.pct !== false) v /= 100;
      if (opts.si && n.unit) { const u = unitOf(n.unit); return { v: v * u.si, d: u.dim }; }
      return { v, d: {} };
    }
    case 'p': return ev(n.a, env, scope, opts);
    case 'v': { if (env && n.v in env) return { v: env[n.v], d: {} }; throw new Fail(`var ${n.v}`); }
    case 'f': {
      const def = scope && scope[n.name];
      if (!def) throw new Fail(`fn ${n.name}`);
      const x = ev(n.a, env, scope, { ...opts, si: false }).v;
      return { v: ev(def.body, { ...(env || {}), [def.arg]: x }, scope, { ...opts, si: false }).v, d: {} };
    }
    case 'neg': { const a = ev(n.a, env, scope, opts); return { v: -a.v, d: a.d }; }
    case 'abs': { const a = ev(n.a, env, scope, opts); return { v: Math.abs(a.v), d: a.d }; }
    case 'root': { const a = ev(n.a, env, scope, opts); return { v: n.d === 3 ? Math.cbrt(a.v) : Math.sqrt(a.v), d: {} }; }
    case '+': case '-': {
      const a = ev(n.a, env, scope, opts); const b = ev(n.b, env, scope, opts);
      const d = Object.keys(a.d).length ? a.d : b.d;
      return { v: n.k === '+' ? a.v + b.v : a.v - b.v, d };
    }
    case '*': { const a = ev(n.a, env, scope, opts); const b = ev(n.b, env, scope, opts); return { v: a.v * b.v, d: dimAdd(a.d, b.d, 1) }; }
    case '/': { const a = ev(n.a, env, scope, opts); const b = ev(n.b, env, scope, opts); return { v: a.v / b.v, d: dimAdd(a.d, b.d, -1) }; }
    case '^': { const a = ev(n.a, env, scope, opts); const b = ev(n.b, env, scope, opts); return { v: a.v ** b.v, d: {} }; }
    default: throw new Fail('node');
  }
}
const num = (n, env, scope, opts = {}) => { try { const r = ev(n, env, scope, opts); return Number.isFinite(r.v) ? r : null; } catch (e) { if (e instanceof Fail) return null; throw e; } };

const isLiteral = (n) => n && (n.k === 'n' || (n.k === 'neg' && n.a.k === 'n') || (n.k === 'p' && isLiteral(n.a)));
const literalOf = (n) => (n.k === 'n' ? n : isLiteral(n.a) ? literalOf(n.a) : n);

/** Do two numeric sides agree, given how the written number is rounded and the relation (= or ≈)? */
function agree(a, b, rel, A, B) {
  if (a === b) return true;
  if (rel === '≈') return Math.abs(a - b) <= Math.max(0.06 * Math.abs(b), 0.5 * 10 ** -Math.max(maxDec(A), maxDec(B)));
  let tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  for (const S of [A, B]) {
    if (isLiteral(S)) {
      const lit = literalOf(S);
      if (lit.approx) tol = Math.max(tol, 1.1 * 10 ** -(lit.dec || 0));
      if ((lit.dec || 0) > 0) tol = Math.max(tol, 0.51 * 10 ** -lit.dec);
      if (lit.pct && (lit.dec || 0) === 0) tol = Math.max(tol, 0.0051);
    }
  }
  if (maxDec(A) >= 2 && !isLiteral(A)) tol = Math.max(tol, 0.006 * Math.abs(b));
  if (maxDec(B) >= 2 && !isLiteral(B)) tol = Math.max(tol, 0.006 * Math.abs(a));
  if (irrational(A) || irrational(B)) tol = Math.max(tol, 0.51);
  return Math.abs(a - b) <= tol;
}

const REL = { '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b };

// ── a string → runs of math between words ──
const CUE_BEFORE = /\b(not|never|isn't|wrong|wrongly|mistake|mistaken|incorrect|incorrectly|error|false|slip|instead|misread|misconception|some students|students? (?:think|write|wrote)|claims?|thinks?|thought|wrote|writes?|writing|if you|you might|might|could|would|suppose|imagine|tempting|trap|trick|bug|bad|fails?|careless|someone|forgot|forgetting|dropped|dropping)\b/i;
const SPLIT_SENT = /(?<=[.!?;])\s+(?=[A-Z(¿¡"'‘“])|\n+/;

function runsOf(sentence) {
  const toks = tokenize(sentence);
  const runs = []; let cur = []; let last = 0;
  const flush = () => {
    if (cur.length) {
      runs.push({ toks: cur, at: cur[0].at, end: cur[cur.length - 1].end, before: sentence.slice(last, cur[0].at) });
      last = cur[cur.length - 1].end;
    }
    cur = [];
  };
  toks.forEach((t) => {
    if (t.t === 'word' || t.t === 'sep') flush();
    else if (t.t === 'of' && !(cur.length && ['pct', 'rp', 'num'].includes(cur[cur.length - 1].t))) flush();
    else if (t.t === 'per' && !(cur.length && ['unit', 'var'].includes(cur[cur.length - 1].t))) flush();
    else cur.push(t);
  });
  flush();
  return runs;
}

/** A run split on its relations, into parsed sides. */
function sidesOf(run, scope) {
  const segs = []; let cur = []; const rels = [];
  for (const t of run.toks) { if (t.t === 'rel') { segs.push(cur); rels.push(t.v); cur = []; } else cur.push(t); }
  segs.push(cur);
  return { segs: segs.map((s) => tryParse(s, scope)), rels, raw: segs };
}

// Strip tokens from the left of a run's first side until it parses (a leading "a" or "I" is a word), and from the right of the last side.
function trimmed(segs, raw, scope) {
  const out = [...segs];
  if (!out[0] && raw[0].length > 1 && raw[0][0].t === 'var' && /^[aAI]$/.test(raw[0][0].v)) out[0] = tryParse(raw[0].slice(1), scope);
  const L = out.length - 1;
  if (!out[L] && raw[L].length > 1 && raw[L][raw[L].length - 1].t === 'var' && /^[aAI]$/.test(raw[L][raw[L].length - 1].v)) out[L] = tryParse(raw[L].slice(0, -1), scope);
  return out;
}

const textOf = (toks, s) => (toks.length ? s.slice(toks[0].at, toks[toks.length - 1].end) : '');

/** Arithmetic in one sentence: each numeric relation is computed. */
function checkArithmetic(sentence, scope, push) {
  const runs = runsOf(sentence);
  for (const run of runs) {
    if (!run.toks.some((t) => t.t === 'rel')) continue;
    const before = sentence.slice(0, run.at);
    if (CUE_BEFORE.test(before)) continue;
    if (/\b(false|fails?|not true|untrue|wrong|impossible|never|contradiction|no solution|not a solution)\b/i.test(sentence.slice(run.end, run.end + 40))) continue;
    const { segs, rels, raw } = sidesOf(run, scope);
    const sides = trimmed(segs, raw, scope);
    // an ordered pair or an interval such as [1, 3] is words and separators here, so nothing to do
    let lastGood = null; let lastK = -1;
    for (let k = 0; k < sides.length; k++) {
      const s = sides[k];
      if (!s) { lastGood = null; continue; }
      const raws = num(s, null, scope);
      if (raws === null) { lastGood = null; continue; }
      if (lastGood && lastK === k - 1) {
        const A = lastGood; const B = s; const rel = rels[k - 1];
        if (rel === '=' || rel === '≈') {
          let ok; let unitBad = false;
          const bothUnits = hasUnit(A) && hasUnit(B);
          if (bothUnits) {
            const a = num(A, null, scope, { si: true }); const b = num(B, null, scope, { si: true });
            if (a && b && dimEq(a.d, b.d)) ok = agree(a.v, b.v, rel, A, B) || agree(num(A, null, scope).v, num(B, null, scope).v, rel, A, B);
            else { ok = agree(num(A, null, scope).v, num(B, null, scope).v, rel, A, B); unitBad = !!(a && b && !dimEq(a.d, b.d)); }
          } else ok = agree(num(A, null, scope).v, num(B, null, scope).v, rel, A, B);
          if (!ok && (hasPct(A) || hasPct(B))) ok = agree(num(A, null, scope, { pct: false }).v, num(B, null, scope, { pct: false }).v, rel, A, B);
          if (!ok) push({ rule: 'arithmetic', certain: true, claim: `${textOf(raw[k - 1], sentence)} ${rel} ${textOf(raw[k], sentence)}`, truth: `${textOf(raw[k - 1], sentence)} comes to ${+num(A, null, scope).v.toFixed(6)}` });
          else if (unitBad) push({ rule: 'units', certain: false, claim: `${textOf(raw[k - 1], sentence)} ${rel} ${textOf(raw[k], sentence)}`, truth: 'the two sides have different units' });
        } else if (REL[rel] && !/\bnot\s*$/i.test(before)) {
          const a = num(A, null, scope, { si: hasUnit(A) && hasUnit(B) }); const b = num(B, null, scope, { si: hasUnit(A) && hasUnit(B) });
          if (a && b && !REL[rel](a.v, b.v)) push({ rule: 'comparison', certain: true, claim: `${textOf(raw[k - 1], sentence)} ${rel} ${textOf(raw[k], sentence)}`, truth: `${+a.v.toFixed(6)} is not ${rel} ${+b.v.toFixed(6)}` });
        }
      }
      lastGood = s; lastK = k;
    }
  }
}

// ── word arithmetic ──
const NUMW = '(-?\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)';
const nw = (s) => { const l = String(s).toLowerCase(); return l in NUMBER_WORDS ? NUMBER_WORDS[l] : parseFloat(l); };
const IS = '(?:is|are|equals?|makes?|gives?|=|gets? you|comes? to|is equal to)';
const WORD_PATTERNS = [
  [new RegExp(`\\b${NUMW} plus ${NUMW} ${IS} ${NUMW}\\b`, 'gi'), (a, b) => a + b],
  [new RegExp(`\\b${NUMW} minus ${NUMW} ${IS} ${NUMW}\\b`, 'gi'), (a, b) => a - b],
  [new RegExp(`\\b${NUMW} times ${NUMW} ${IS} ${NUMW}\\b`, 'gi'), (a, b) => a * b],
  [new RegExp(`\\b${NUMW} divided by ${NUMW} ${IS} ${NUMW}\\b`, 'gi'), (a, b) => a / b],
  [new RegExp(`\\bdividing ${NUMW} by ${NUMW} ${IS} ${NUMW}\\b`, 'gi'), (a, b) => a / b],
  [new RegExp(`\\bmultiplying ${NUMW} by ${NUMW} ${IS} ${NUMW}\\b`, 'gi'), (a, b) => a * b],
  [new RegExp(`\\bmultiply ${NUMW} by ${NUMW} (?:to get|and get|gives) ${NUMW}\\b`, 'gi'), (a, b) => a * b],
  [new RegExp(`\\badding ${NUMW} and ${NUMW} ${IS} ${NUMW}\\b`, 'gi'), (a, b) => a + b],
  [new RegExp(`\\bsubtracting ${NUMW} from ${NUMW} ${IS} ${NUMW}\\b`, 'gi'), (a, b) => b - a],
  [new RegExp(`\\b${NUMW} hours? at \\$?${NUMW} earns? \\$?${NUMW}\\b`, 'gi'), (a, b) => a * b],
];
function checkWordArithmetic(sentence, push) {
  if (CUE_BEFORE.test(sentence)) return;
  for (const [re, f] of WORD_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sentence))) {
      if (/(times|plus|minus|divided by|[*+/-])\s*$/i.test(sentence.slice(0, m.index))) continue; // the tail of a longer sum
      const v = f(nw(m[1]), nw(m[2])); const c = nw(m[3]);
      const dec = (String(m[3]).split('.')[1] || '').length;
      if (Math.abs(v - c) > (dec ? 0.51 * 10 ** -dec : 1e-9)) push({ rule: 'arithmetic', certain: true, claim: m[0], truth: `it comes to ${+v.toFixed(6)}` });
    }
  }
  // 12 minutes at 4 gallons per minute ... 1.80 m, about 5 feet 11 inches
  const h = /(\d+(?:\.\d+)?)\s*m\b[^.]{0,20}?\babout (\d+) (?:feet|foot|ft) (\d+) (?:inches|inch|in)\b/i.exec(sentence);
  if (h) {
    const feet = Number(h[2]) * 0.3048 + Number(h[3]) * 0.0254;
    if (Math.abs(feet - Number(h[1])) > 0.03) push({ rule: 'units', certain: true, claim: h[0], truth: `${h[1]} m is about ${Math.floor(Number(h[1]) / 0.3048)} feet ${Math.round((Number(h[1]) / 0.0254) % 12)} inches` });
  }
}

// ── steps: consecutive statements keep their solution set ──
const STEP_LINK = /\b(so|then|gives?|giving|becomes?|to get|yields?|therefore|hence|which means|means|simplifies to|leaves|left with)\b|→|=>|⇒|->/i;
const OTHER_LINK = /\b(or|if|for|when|while|not|but|versus|vs|compare|instead|unlike|like|another|next|also)\b/i;

function statementsOf(sentence, scope) {
  const out = [];
  for (const run of runsOf(sentence)) {
    if (!run.toks.some((t) => t.t === 'rel')) continue;
    const { segs, rels, raw } = sidesOf(run, { ...scope, __algebra: true });
    const sides = trimmed(segs, raw, { ...scope, __algebra: true });
    if (sides.some((s) => !s)) { out.push({ bad: true, before: run.before }); continue; }
    const vars = new Set();
    sides.forEach((s) => varsOf(s, vars));
    out.push({ sides, rels, vars, before: run.before, text: sentence.slice(run.at, run.end) });
  }
  return out;
}
const holds = (st, x, v, scope) => {
  for (let k = 0; k < st.rels.length; k++) {
    const a = num(st.sides[k], { [v]: x }, scope); const b = num(st.sides[k + 1], { [v]: x }, scope);
    if (!a || !b) return null;
    if (st.rels[k] === '=' || st.rels[k] === '≈') { if (Math.abs(a.v - b.v) > 1e-6 * Math.max(1, Math.abs(a.v), Math.abs(b.v))) return false; } else if (!REL[st.rels[k]](a.v, b.v)) return false;
  }
  return true;
};
const allEq = (st) => st.rels.every((r) => r === '=');
/** The solution of a one-variable linear statement a = b, or null. */
function linearRoot(st, v, scope) {
  if (st.rels.length !== 1 || st.rels[0] !== '=') return null;
  const f = (x) => { const a = num(st.sides[0], { [v]: x }, scope); const b = num(st.sides[1], { [v]: x }, scope); return a && b ? a.v - b.v : null; };
  const y0 = f(0); const y1 = f(1); const y2 = f(2); const y5 = f(5);
  if ([y0, y1, y2, y5].some((y) => y === null)) return null;
  const m = y1 - y0;
  if (Math.abs(m) < 1e-12) return null;
  if (Math.abs(y0 + 2 * m - y2) > 1e-9 || Math.abs(y0 + 5 * m - y5) > 1e-9) return null;
  return -y0 / m;
}
function compareSteps(a, b, scope, push, why) {
  if (a.bad || b.bad) return;
  const va = [...a.vars]; const vb = [...b.vars];
  if (va.some((x) => x.endsWith('()')) || vb.some((x) => x.endsWith('()'))) return;
  if (va.length === 1 && vb.length === 1 && va[0] === vb[0]) {
    const v = va[0];
    const claim = `${a.text} then ${b.text}`;
    if (allEq(a) && allEq(b)) {
      const root = linearRoot(b, v, scope);
      if (root !== null) { if (holds(a, root, v, scope) === false) push({ rule: 'solve_step', certain: true, claim, truth: `${v} = ${+root.toFixed(4)} does not satisfy ${a.text}` }); return; }
      const root0 = linearRoot(a, v, scope);
      if (root0 !== null && holds(b, root0, v, scope) === false) push({ rule: 'solve_step', certain: true, claim, truth: `${v} = ${+root0.toFixed(4)} does not satisfy ${b.text}` });
      return;
    }
    if (a.rels.every((r) => r !== '=') && b.rels.every((r) => r !== '=')) {
      for (let x = -60; x <= 60; x += 0.25) {
        const p = holds(a, x, v, scope); const q = holds(b, x, v, scope);
        if (p === null || q === null) return;
        if (p !== q) { push({ rule: 'solve_step', certain: true, claim, truth: `${v} = ${x} is in one solution set but not the other` }); return; }
      }
    }
    return;
  }
  // Two variables, same set, both linear equations: the same line?
  if (va.length === 2 && vb.length === 2 && va.every((x) => vb.includes(x)) && a.rels.length === 1 && b.rels.length === 1 && a.rels[0] === '=' && b.rels[0] === '=') {
    const coef = (st) => {
      const f = (x, y) => { const p = num(st.sides[0], { [va[0]]: x, [va[1]]: y }, scope); const q = num(st.sides[1], { [va[0]]: x, [va[1]]: y }, scope); return p && q ? p.v - q.v : null; };
      const c = f(0, 0); const m = f(1, 0); const n = f(0, 1); const t = f(2, 3);
      if ([c, m, n, t].some((z) => z === null)) return null;
      const A = m - c; const B = n - c;
      if (Math.abs(c + 2 * A + 3 * B - t) > 1e-9) return null;
      return [A, B, c];
    };
    const p = coef(a); const q = coef(b);
    if (!p || !q) return;
    const k = Math.abs(q[0]) > 1e-9 ? p[0] / q[0] : Math.abs(q[1]) > 1e-9 ? p[1] / q[1] : null;
    if (k === null || Math.abs(k) < 1e-9) return;
    if (p.some((z, i) => Math.abs(z - k * q[i]) > 1e-6)) push({ rule: 'solve_step', certain: false, claim: `${a.text} ${why} ${b.text}`, truth: 'these two equations describe different lines' });
  }
}
function checkSteps(string, scope, push, { forceSteps = false } = {}) {
  const lines = string.split(/\n+/);
  const all = [];
  for (const line of lines) for (const s of line.split(SPLIT_SENT)) { const ss = statementsOf(s, scope); ss.forEach((st, i) => { st.first = i === 0; st.lineStart = i === 0; st.cue = CUE_BEFORE.test(s); }); all.push(...ss); }
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1]; const b = all[i];
    const between = b.before || '';
    if (a.cue || b.cue) continue;
    if (between.length > 60) continue;
    const newline = lines.length > 1 && !between.trim();
    if (!(forceSteps || newline || STEP_LINK.test(between))) continue;
    if (OTHER_LINK.test(between)) continue;
    if (/\b(and|or)\s*$/i.test(a.before || '')) continue; // the end of a compound statement
    const c = all[i + 1];
    if (c && /^\s*,?\s*(or|and)\b/i.test(c.before || '')) continue;
    if (/\b(false|fails?|not true|no solution)\b/i.test(b.afterText || '')) continue;
    compareSteps(a, b, scope, push, (between.match(STEP_LINK) || ['then'])[0]);
  }
}

// ── identity with several letters: a(b + c) = ab + ac; chains with letters ──
function checkIdentities(sentence, scope, push) {
  if (CUE_BEFORE.test(sentence)) return;
  for (const st of statementsOf(sentence, scope)) {
    if (st.bad || !allEq(st)) continue;
    const vs = [...st.vars];
    if (!vs.length || vs.some((x) => x.endsWith('()')) || vs.some((x) => /\d/.test(x))) continue;
    for (let k = 0; k + 1 < st.sides.length; k++) {
      const A = st.sides[k]; const B = st.sides[k + 1];
      const va = [...varsOf(A)]; const vb = [...varsOf(B)];
      const same = va.length && va.length === vb.length && va.every((x) => vb.includes(x));
      const chain = st.sides.length >= 3;
      if (!same || !(chain || va.length >= 2)) continue;
      if (va.length >= 2 && !chain && (isLinearEq(A, va, scope) && isLinearEq(B, va, scope) && !sharedShape(A, B))) continue; // 2x + 3y = x - y is an equation to solve, not a claim
      let bad = false;
      for (const seed of [1.37, 2.11, -0.73]) {
        const env = {}; va.forEach((x, i) => { env[x] = seed + i * 0.61; });
        const p = num(A, env, scope); const q = num(B, env, scope);
        if (!p || !q) { bad = false; break; }
        if (Math.abs(p.v - q.v) > 1e-6 * Math.max(1, Math.abs(p.v))) bad = true;
      }
      if (bad) push({ rule: 'identity', certain: false, claim: st.text, truth: 'the two sides differ when numbers are put in' });
    }
  }
}
function isLinearEq(n, vs, scope) {
  const f = (arr) => { const e = {}; vs.forEach((x, i) => { e[x] = arr[i]; }); const r = num(n, e, scope); return r ? r.v : NaN; };
  const z = vs.map(() => 0); const base = f(z); const two = vs.map(() => 2); const one = vs.map(() => 1);
  return Math.abs(f(two) - 2 * f(one) + base) < 1e-9;
}
function sharedShape(A, B) { return A.k === 'p' || B.k === 'p' || A.k === '*' || B.k === '*'; }

// ── functions defined in a part ──
function definitionsOf(strings) {
  const defs = {};
  const clash = new Set();
  const re = /\b([a-zA-Z])\(([a-z])\)\s*=\s*([^,;:.\n]+?(?:\.\d+[^,;:.\n]*)?)(?=$|[,;:\n]|\.(?:\s|$)|\s+(?:meters?|feet|miles|dollars|in\b|at\b|on\b|from\b|for\b|where\b|and\b|with\b|gives\b|is\b|has\b|shown\b|a\b|the\b|opens?\b))/g;
  for (const s of strings) {
    const t = normalize(s);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      if (/\d/.test(m[2])) continue;
      const toks = tokenize(m[3]);
      const body = tryParse(toks, { __algebra: true });
      if (!body) continue;
      const vars = [...varsOf(body)];
      if (vars.some((x) => x !== m[2])) continue;
      if (!vars.length) continue;
      const prev = defs[m[1]];
      if (prev) {
        const same = [0.5, 2.3, -1.2].every((x) => { const a = num(prev.body, { [prev.arg]: x }, {}); const b = num(body, { [m[2]]: x }, {}); return a && b && Math.abs(a.v - b.v) < 1e-9; });
        if (!same) clash.add(m[1]);
      } else defs[m[1]] = { arg: m[2], body };
    }
  }
  for (const k of clash) delete defs[k];
  return defs;
}

// ── Spanish numbers ──
const ES = { cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiún: 21, veintidós: 22, veintitrés: 23, veinticuatro: 24, veinticinco: 25, veintiséis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900, mil: 1000 };
function spanishNumber(s) {
  const w = String(s).toLowerCase().replace(/[.,!?¿¡]/g, '').trim().split(/\s+/).filter((x) => x !== 'y');
  if (!w.length || w.length > 4 || !w.every((x) => x in ES)) return null;
  let total = 0;
  for (const x of w) { if (x === 'mil') total = (total || 1) * 1000; else total += ES[x]; }
  return total;
}

// ── walking a part's text, skipping what is meant to be wrong ──
const SKIP_PATH = /(^|\.)(wrong\w*|trap\w*|whyNot|mistake\w*|distractor\w*|incorrect\w*|myth\w*|slip\w*|misconception\w*|flaw\w*|before|bad\w*|error\w*|whyIntuitionFailed|byOption|fail\w*|hint|placeholder|aria\w*|\w*Aria|id|color|accent|icon|answerLabel|eyebrow|tag)(\.|$)/i;
const SKIP_TEXT_BLOCKS = new Set(['Recall_BinarySwipe', 'Interact_TrueFalseMatrix', 'Interact_CategorySort', 'Ret_SpeedCategorizer', 'Game_ConveyorSorter', 'Game_WhackAMole', 'Game_DuckHunt', 'Hook_Dilemma', 'Interact_ErrorHighlighter', 'Trap_SpotTheLie', 'Interact_XRay', 'Interact_ScrubNumber']);
const SKIP_TEXT_KEYS = /^(text|statement|label|claim|body|sentence|title|value)$/;

function collectStrings(data, block) {
  const out = [];
  const walk = (o, p) => {
    if (typeof o === 'string') {
      const key = p.split('.').pop();
      if (SKIP_PATH.test(p)) return;
      if (SKIP_TEXT_BLOCKS.has(block) && SKIP_TEXT_KEYS.test(key)) return;
      out.push({ s: o, path: p });
      return;
    }
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, `${p}.${i}`)); return; }
    if (!o || typeof o !== 'object') return;
    if (o.isError === true || o.isLie === true) { if (o.explanation) walk(o.explanation, `${p}.explanation`); return; }
    const correctIdx = typeof o.correctIndex === 'number' ? o.correctIndex : null;
    const keyId = o.correctId || o.correctOptionId || o.correctChoiceId || o.answerId || null;
    for (const k of Object.keys(o)) {
      if ((k === 'options' || k === 'choices') && Array.isArray(o[k])) {
        o[k].forEach((opt, i) => {
          const isKey = correctIdx !== null ? i === correctIdx : keyId ? opt && opt.id === keyId : false;
          if (isKey) walk(opt, `${p}.${k}.${i}`);
        });
        continue;
      }
      walk(o[k], p ? `${p}.${k}` : k);
    }
  };
  walk(data, '');
  return out;
}

const normText = (s) => String(s || '').toLowerCase().replace(/[\s.,;:!?'"‘’“”]+/g, ' ').trim();
/** A key or choice's number, when it is just a number with an optional unit or "x =". */
function numberIn(text) {
  const t = normalize(String(text)).trim().replace(/^[a-zA-Z]\s*=\s*/, '').replace(/[.]$/, '');
  const toks = tokenize(t);
  if (!toks.length || toks.some((k) => k.t === 'word' || k.t === 'sep' || k.t === 'rel')) return null;
  const n = tryParse(toks, {});
  if (!n) return null;
  const r = num(n, null, {});
  return r ? { v: r.v, node: n } : null;
}
const near = (a, b) => Math.abs(a - b) <= Math.max(1e-6, 0.006 * Math.abs(b));
function pairIn(text) {
  const m = /\(\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*\)/.exec(normalize(text));
  if (!m) return null;
  const f = (x) => { const [a, b] = x.split('/'); return b ? Number(a) / Number(b) : Number(a); };
  return [f(m[1]), f(m[2])];
}
const twoVarEquations = (s, scope = {}) => {
  const out = [];
  for (const st of statementsOf(normalize(s), scope)) {
    if (st.bad || st.rels.length !== 1 || st.rels[0] !== '=') continue;
    const v = [...st.vars];
    if (v.length === 2 && v.every((x) => /^[a-z]$/.test(x))) out.push(st);
  }
  return out;
};

// ── graded checks ──
function checkChecks(checks, keyAgreement, push) {
  checks.forEach((c) => {
    const where = `check ${c.index}`;
    const add = (f) => push({ where, ...f });
    const key = c.answer;
    const choices = Array.isArray(c.choices) ? c.choices.map((x) => (typeof x === 'string' ? x : (x && (x.text || x.label)) || '')) : null;
    if (c.format === 'multiple_choice' && choices && choices.length) {
      if (!choices.some((x) => normText(x) === normText(key))) add({ rule: 'key_not_a_choice', certain: true, claim: String(key).slice(0, 200), truth: 'the marked answer is not one of the choices' });
      const seen = new Map();
      choices.forEach((x) => { const n = String(x).trim().toLowerCase(); if (seen.has(n)) add({ rule: 'duplicate_choice', certain: true, claim: x, truth: 'two choices are the same' }); seen.set(n, 1); });
    }
    const keyNum = key == null ? null : numberIn(key);
    // A prompt that can be computed
    const prompt = normalize(c.prompt || '');
    if (key != null && !CUE_BEFORE.test(prompt)) {
      const ev1 = /\b(?:evaluate|compute|calculate|simplify|what is|find the value of)\s+([^?.:;]+)[?.:;]?/i.exec(prompt);
      if (ev1 && keyNum) {
        const n = numberIn(ev1[1]);
        if (n && /[+\-*/^]|sqrt|cbrt/.test(ev1[1]) && !near(n.v, keyNum.v)) add({ rule: 'prompt_vs_key', certain: true, claim: `${ev1[1].trim()} keyed as ${key}`, truth: `${ev1[1].trim()} comes to ${+n.v.toFixed(6)}` });
      }
      // Solve: one equation, one letter
      if (/\bsolve\b/i.test(prompt) || /\bvalue of [a-z]\b/i.test(prompt)) {
        const sts = statementsOf(prompt, {}).filter((st) => !st.bad && allEq(st) && st.vars.size === 1 && st.sides.length === 2);
        if (sts.length === 1 && keyNum) {
          const v = [...sts[0].vars][0];
          if (holds(sts[0], keyNum.v, v, {}) === false) add({ rule: 'prompt_vs_key', certain: true, claim: `${sts[0].text} keyed as ${key}`, truth: `${v} = ${keyNum.v} does not satisfy it` });
        }
        const sys = twoVarEquations(prompt);
        const pair = key != null ? pairIn(key) : null;
        if (sys.length >= 2 && pair) {
          const names = [...sys[0].vars].includes('x') && [...sys[0].vars].includes('y') ? ['x', 'y'] : [...sys[0].vars].sort();
          const env = { [names[0]]: pair[0], [names[1]]: pair[1] };
          for (const st of sys) {
            const a = num(st.sides[0], env, {}); const b = num(st.sides[1], env, {});
            if (a && b && Math.abs(a.v - b.v) > 1e-6) { add({ rule: 'prompt_vs_key', certain: true, claim: `${st.text} with (${pair.join(', ')})`, truth: `(${pair.join(', ')}) does not satisfy ${st.text}` }); break; }
          }
        }
      }
      // Slope of a perpendicular or parallel line
      const sl = /slope\s*(?:of\s*)?(-?\d+(?:\/\d+)?)/i.exec(prompt);
      if (sl && keyNum && /perpendicular|parallel/i.test(prompt)) {
        const n = numberIn(sl[1]);
        const want = /perpendicular/i.test(prompt) ? -1 / n.v : n.v;
        if (n && !near(want, keyNum.v)) add({ rule: 'prompt_vs_key', certain: true, claim: `slope ${sl[1]} keyed as ${key}`, truth: `the answer is ${+want.toFixed(4)}` });
      }
    }
    // The accepted answers agree with the key
    if (Array.isArray(c.accepts) && c.accepts.length && keyNum) {
      const differ = c.accepts.map((x) => numberIn(x)).filter((n) => n && !near(n.v, keyNum.v) && !hasUnit(n.node));
      if (differ.length) add({ rule: 'accepts_vs_key', certain: false, claim: `${key} but also accepts ${differ[0].v}`, truth: 'an accepted answer has another value than the key' });
    }
    // The rationale's own last result against the key
    if (keyNum && c.rationale) {
      const sentences = normalize(c.rationale).split(SPLIT_SENT);
      let last = null; let lastText = '';
      for (const s of sentences) {
        for (const run of runsOf(s)) {
          if (!run.toks.some((t) => t.t === 'rel')) continue;
          const { segs, raw } = sidesOf(run, {});
          const sides = trimmed(segs, raw, {});
          const end = sides[sides.length - 1];
          const r = end && num(end, null, {});
          if (r && sides.length >= 2 && !CUE_BEFORE.test(s.slice(0, run.at))) { last = r.v; lastText = s.slice(run.at, run.end); }
        }
      }
      if (last !== null && !near(last, keyNum.v)) add({ rule: 'rationale_vs_key', certain: false, claim: `key ${key}; rationale ends on ${lastText}`, truth: 'the rationale reaches another number than the key' });
    }
    // Words: the explanation describes another option than the key (flag, not a verdict)
    if (c.format === 'multiple_choice' && choices && choices.length > 1 && c.rationale && keyAgreement) {
      try {
        const r = keyAgreement({ question: c.prompt, prompt: c.prompt, choices, answer: key, rationale: c.rationale, explanation: c.rationale });
        if (r && r.flagged) add({ rule: 'rationale_describes_other_option', certain: false, claim: `key "${String(key).slice(0, 80)}"`, truth: `the rationale reads closer to "${String(r.pointsTo != null && choices[r.pointsTo] != null ? choices[r.pointsTo] : r.pointsTo || '').slice(0, 80)}"` });
      } catch { /* the words check is optional */ }
    }
  });
}

// ── block keys ──
function checkBlockKeys(b, push) {
  const where = `block ${b.index}`;
  const d = b.data || {};
  const ids = new Set();
  const collect = (o) => { if (Array.isArray(o)) o.forEach(collect); else if (o && typeof o === 'object') { if (typeof o.id === 'string') ids.add(o.id); Object.values(o).forEach(collect); } };
  collect(d);
  const walk = (o, p) => {
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, `${p}.${i}`)); return; }
    if (!o || typeof o !== 'object') return;
    for (const k of ['correctId', 'correctOptionId', 'correctChoiceId', 'correctChipId', 'correctCategoryId', 'correctBucket', 'correctBinId', 'answerId']) {
      if (typeof o[k] === 'string' && o[k] && ids.size && !ids.has(o[k])) push({ where, rule: 'key_points_nowhere', certain: true, claim: `${p}.${k} = ${o[k]}`, truth: 'no option has this id', path: `${p}.${k}` });
    }
    const arr = o.options || o.choices;
    if (typeof o.correctIndex === 'number' && Array.isArray(arr) && (o.correctIndex < 0 || o.correctIndex >= arr.length)) push({ where, rule: 'key_points_nowhere', certain: true, claim: `${p}.correctIndex = ${o.correctIndex}`, truth: 'no option at that place', path: `${p}.correctIndex` });
    // Every wrong option carries its "why not": the key must be the one without it.
    const keyId = o.correctId || o.correctOptionId;
    if (keyId && Array.isArray(o.options)) {
      const noWhy = o.options.filter((x) => x && !x.whyNot && !x.why_not);
      if (o.options.some((x) => x && x.whyNot) && noWhy.length === 1 && noWhy[0].id !== keyId) push({ where, rule: 'key_vs_feedback', certain: true, claim: `key is ${keyId}, but only "${String(noWhy[0].text || noWhy[0].id).slice(0, 80)}" has no reason it is wrong`, truth: `the key looks like ${noWhy[0].id}`, path: p });
      const by = o.feedback && o.feedback.byOption;
      if (by) for (const [id, text] of Object.entries(by)) {
        if (id !== keyId && /^\s*(correct|right|yes|exactly|that's it|that's right)\b/i.test(String(text))) push({ where, rule: 'key_vs_feedback', certain: false, claim: `key is ${keyId}, but the feedback for ${id} says "${String(text).slice(0, 80)}"`, truth: `the key looks like ${id}`, path: p });
        if (id === keyId && /^\s*(not quite|no\b|wrong|incorrect|that's a)\b/i.test(String(text))) push({ where, rule: 'key_vs_feedback', certain: false, claim: `key is ${keyId}, but its feedback says "${String(text).slice(0, 80)}"`, truth: 'the feedback treats the key as wrong', path: p });
      }
    }
    Object.keys(o).forEach((k) => walk(o[k], `${p}.${k}`));
  };
  walk(d, '');
  // A slider's true value against its worked note.
  if (typeof d.trueValue === 'number' && d.revealNote) {
    const runs = runsOf(normalize(d.revealNote)).filter((r) => r.toks.some((t) => t.t === 'rel'));
    const lastRun = runs[runs.length - 1];
    if (lastRun) {
      const { segs, raw } = sidesOf(lastRun, {});
      const sides = trimmed(segs, raw, {});
      const r = sides[sides.length - 1] && num(sides[sides.length - 1], null, {});
      if (r && !near(r.v, d.trueValue)) push({ where, rule: 'key_vs_worked', certain: false, claim: `trueValue ${d.trueValue}; note ends on ${r.v}`, truth: 'the value and its working disagree' });
    }
  }
}

// ── tables ──
function checkTables(b, defs, trackId, push) {
  const d = b.data || {};
  if (!Array.isArray(d.rows) || !d.rows.every(Array.isArray)) return;
  const where = `block ${b.index}`;
  const headers = (d.headers || []).map((x) => String(x));
  for (const row of d.rows) {
    const cells = row.map((x) => String(x));
    if (trackId === 'spanish') {
      const dig = cells.findIndex((x) => /^-?\d+$/.test(x.trim()));
      if (dig >= 0) {
        for (let j = 0; j < cells.length; j++) {
          if (j === dig) continue;
          const v = spanishNumber(cells[j]);
          if (v !== null && v !== Number(cells[dig])) push({ where, rule: 'spanish_number', certain: true, claim: `${cells[dig]} is ${cells[j]}`, truth: `${cells[j]} is ${v}` });
        }
      }
    }
    // A column headed f(t) under a definition: compute each row.
    for (const [name, def] of Object.entries(defs)) {
      const argCol = headers.findIndex((h) => new RegExp(`^\\s*${def.arg}\\b`, 'i').test(h));
      const fnCol = headers.findIndex((h) => new RegExp(`\\b${name}\\(${def.arg}\\)`).test(h));
      if (argCol < 0 || fnCol < 0) continue;
      const x = numberIn(cells[argCol]); const y = numberIn(cells[fnCol]);
      if (!x || !y) continue;
      const v = num(def.body, { [def.arg]: x.v }, {});
      if (v && !near(v.v, y.v)) push({ where, rule: 'table_vs_function', certain: true, claim: `${name}(${x.v}) = ${y.v}`, truth: `${name}(${x.v}) = ${+v.v.toFixed(6)}` });
    }
  }
}

// ── agreement across parts ──
function sentenceKey(s) {
  const toks = normalize(s).toLowerCase().match(/[\p{L}]+|\d+(?:\.\d+)?/gu) || [];
  return toks;
}
function checkAgreement(partTexts, push) {
  // near-identical sentences that differ only in a number
  const sents = [];
  for (const { where, s } of partTexts) {
    for (const x of s.split(SPLIT_SENT)) {
      const toks = sentenceKey(x);
      const alpha = toks.filter((t) => /\p{L}/u.test(t));
      if (alpha.length >= 4 && !/\?\s*$/.test(x) && toks.some((t) => /\d/.test(t))) sents.push({ where, x, toks });
    }
  }
  const byShape = new Map();
  for (const it of sents) {
    const shape = it.toks.map((t) => (/\d/.test(t) ? '#' : t)).join(' ');
    if (!byShape.has(shape)) byShape.set(shape, []);
    byShape.get(shape).push(it);
  }
  for (const group of byShape.values()) {
    const seen = new Set(group.map((g) => g.toks.filter((t) => /\d/.test(t)).join('|')));
    if (seen.size < 2) continue;
    const parts = new Set(group.map((g) => g.where));
    if (parts.size < 2 || group[0].toks.filter((t) => /\d/.test(t)).length > 2) continue;
    push({ where: group[1].where, rule: 'same_sentence_other_number', certain: false, claim: group[1].x.slice(0, 200), truth: `${group[0].where} has: ${group[0].x.slice(0, 160)}` });
  }
  // the same left side with another right side, by formula letters
  const forms = new Map();
  for (const { where, s } of partTexts) {
    for (const x of s.split(SPLIT_SENT)) {
      for (const st of statementsOf(normalize(x), {})) {
        if (st.bad || st.rels.length !== 1 || st.rels[0] !== '=' || CUE_BEFORE.test(x)) continue;
        const lv = [...varsOf(st.sides[0])]; const rv = [...varsOf(st.sides[1])];
        if (lv.length + rv.length < 3 || lv.some((v) => v.endsWith('()')) || rv.some((v) => v.endsWith('()'))) continue;
        if (!rv.every((v) => lv.includes(v)) && lv.length > 1) continue;
        const left = st.text.split('=')[0].replace(/\s+/g, '');
        if (!forms.has(left)) forms.set(left, []);
        forms.get(left).push({ where, st });
      }
    }
  }
  for (const [left, list] of forms) {
    if (list.length < 2) continue;
    const first = list[0];
    for (const it of list.slice(1)) {
      const vs = [...new Set([...varsOf(first.st.sides[1]), ...varsOf(it.st.sides[1])])];
      let differ = false; let known = true;
      for (const seed of [1.7, 3.1]) {
        const env = {}; vs.forEach((x, i) => { env[x] = seed + i * 0.77; });
        const a = num(first.st.sides[1], env, {}); const b = num(it.st.sides[1], env, {});
        if (!a || !b) { known = false; break; }
        if (Math.abs(a.v - b.v) > 1e-6) differ = true;
      }
      if (known && differ) push({ where: it.where, rule: 'formula_restated_differently', certain: false, claim: it.st.text, truth: `${first.where} has ${first.st.text} (${left})` });
    }
  }
  // the same short table key with two values
  return null;
}
function checkTableKeys(blocks, push) {
  const seen = new Map();
  for (const b of blocks) {
    const d = b.data || {};
    const rows = Array.isArray(d.rows) ? d.rows : [];
    for (const r of rows) {
      let k; let v;
      if (Array.isArray(r) && r.length === 2) { [k, v] = r; } else if (r && typeof r === 'object' && !Array.isArray(r) && r.key && r.value) { k = r.key; v = r.value; } else continue;
      const nk = normText(k); const nv = normText(v);
      if (!nk || nk.split(' ').length > 3 || nv.split(' ').length > 3 || /^-?\d/.test(nk)) continue;
      if (seen.has(nk) && seen.get(nk).nv !== nv && seen.get(nk).where !== `block ${b.index}`) push({ where: `block ${b.index}`, rule: 'same_key_other_value', certain: false, claim: `${k}: ${v}`, truth: `${seen.get(nk).where} has ${k}: ${seen.get(nk).v}` });
      if (!seen.has(nk)) seen.set(nk, { nv, v, where: `block ${b.index}` });
    }
  }
}
function checkCounts(partTexts, push) {
  const W = 'two|three|four|five|six|seven|eight|nine|ten|\\d+';
  for (const { where, s } of partTexts) {
    for (const x of s.split(SPLIT_SENT)) {
      // "The terms are A, B, and C. There are two terms."
      const m = new RegExp(`\\b(?:the|these) (\\w+) are ([^.]+?)\\.\\s+there are (${W}) \\1\\b`, 'i').exec(s);
      if (m) {
        const n = m[2].split(/,|\band\b/).map((t) => t.trim()).filter(Boolean).length;
        if (nw(m[3]) !== n) { push({ where, rule: 'count', certain: true, claim: m[0].slice(0, 200), truth: `that lists ${n}` }); break; }
      }
      const p = new RegExp(`\\b(${W}) of (?:them|these)\\b[^()]{0,40}\\(([^)]+)\\)`, 'i').exec(x);
      if (p) {
        const items = p[2].split(/,|\band\b/).map((t) => t.trim()).filter(Boolean);
        if (items.length >= 2 && nw(p[1]) !== items.length) push({ where, rule: 'count', certain: false, claim: p[0].slice(0, 200), truth: `that lists ${items.length}` });
      }
    }
  }
}

/** What a line or a function's own formula settles: slope and y-intercept of y = mx + b, zeros, which way a parabola opens, a vertex. */
function checkFormulaFacts(where, strings, defs, push) {
  for (const { s, path } of strings) {
    const n = normalize(s);
    for (const x of n.split(SPLIT_SENT)) {
      if (CUE_BEFORE.test(x)) continue;
      const line = /\by\s*=\s*(-?\d*(?:\.\d+)?(?:\/\d+)?)\s*x\s*([+-])\s*(\d+(?:\.\d+)?)\b/.exec(x);
      if (line) {
        const mRaw = line[1] === '' ? '1' : line[1] === '-' ? '-1' : line[1];
        const m = numberIn(mRaw); const b = (line[2] === '-' ? -1 : 1) * Number(line[3]);
        const sl = /\bslope\s*(?:of|is|=)?\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)/i.exec(x.slice(line.index));
        const yi = /\by-intercept\s*(?:of|is|=|at)?\s*\(?\s*(?:0\s*,\s*)?(-?\d+(?:\.\d+)?)/i.exec(x.slice(line.index));
        if (m && sl && !near(numberIn(sl[1]).v, m.v)) push({ where, path, rule: 'line_fact', certain: true, claim: x.slice(0, 200), truth: `the slope is ${m.v}` });
        if (yi && Math.abs(Number(yi[1]) - b) > 1e-9) push({ where, path, rule: 'line_fact', certain: true, claim: x.slice(0, 200), truth: `the y-intercept is ${b}` });
      }
      for (const [name, def] of Object.entries(defs)) {
        const zs = /\bzeros? (?:are|is|at)\s+([^.;]+)/i.exec(x);
        if (zs) {
          for (const m of zs[1].matchAll(/-?\d+(?:\.\d+)?/g)) {
            const v = num(def.body, { [def.arg]: Number(m[0]) }, {});
            if (v && Math.abs(v.v) > 1e-6) push({ where, path, rule: 'function_fact', certain: true, claim: x.slice(0, 200), truth: `${name}(${m[0]}) = ${+v.v.toFixed(4)}, not 0` });
          }
        }
        const op = /\bopens? (up|upward|upwards|down|downward|downwards)\b/i.exec(x);
        if (op && new RegExp(`\\b${name}\\(${def.arg}\\)`).test(x)) {
          const y = (t) => num(def.body, { [def.arg]: t }, {}).v;
          const curve = y(1) + y(-1) - 2 * y(0);
          if (Math.abs(curve) > 1e-9 && (curve > 0) !== /up/i.test(op[1])) push({ where, path, rule: 'function_fact', certain: true, claim: x.slice(0, 200), truth: `it opens ${curve > 0 ? 'upward' : 'downward'}` });
        }
        const vx = /\bvertex (?:is )?(?:at )?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i.exec(x);
        if (vx) { const v = num(def.body, { [def.arg]: Number(vx[1]) }, {}); if (v && Math.abs(v.v - Number(vx[2])) > 1e-6) push({ where, path, rule: 'function_fact', certain: true, claim: x.slice(0, 200), truth: `${name}(${vx[1]}) = ${+v.v.toFixed(4)}` }); }
      }
      // A point said to work in an equation.
      const pt = /\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)\s+(?:works|checks out|satisfies|solves|is a solution)\s*(?:in|to|of)?\s*([^.;,]+)/i.exec(x);
      if (pt) {
        const st = statementsOf(pt[3], {}).find((q) => !q.bad && q.rels.length === 1 && q.rels[0] === '=' && q.vars.has('x') && q.vars.has('y') && q.vars.size === 2);
        if (st) { const e = { x: Number(pt[1]), y: Number(pt[2]) }; const a = num(st.sides[0], e, {}); const b = num(st.sides[1], e, {}); if (a && b && Math.abs(a.v - b.v) > 1e-6) push({ where, path, rule: 'point_check', certain: true, claim: pt[0].slice(0, 200), truth: `(${e.x}, ${e.y}) gives ${+a.v.toFixed(4)} = ${+b.v.toFixed(4)}` }); }
      }
    }
  }
}
/** A key that is itself an inequality (or a pair joined by and/or) against the inequality in its prompt. */
function checkInequalityKey(c, push) {
  const key = String(c.answer || '');
  const prompt = normalize(c.prompt || '');
  if (!/[<>≤≥]/.test(key) || !/\b(equivalent|solve|solution|same as)\b/i.test(prompt)) return;
  const asked = statementsOf(prompt, {}).filter((st) => !st.bad && st.rels.every((r) => r !== '=') && st.vars.size === 1);
  if (asked.length !== 1) return;
  const v = [...asked[0].vars][0];
  const n = normalize(key);
  const op = /\bor\b/i.test(n) ? 'or' : 'and';
  const parts = n.split(/\b(?:or|and)\b|,/i).flatMap((x) => statementsOf(x, {})).filter((st) => !st.bad && st.vars.size === 1 && st.vars.has(v));
  if (!parts.length) return;
  for (let x = -60; x <= 60; x += 0.25) {
    const p = holds(asked[0], x, v, {});
    const qs = parts.map((q) => holds(q, x, v, {}));
    if (p === null || qs.some((q) => q === null)) return;
    const q = op === 'or' ? qs.some(Boolean) : qs.every(Boolean);
    if (p !== q) { push({ where: `check ${c.index}`, rule: 'prompt_vs_key', certain: true, claim: `${asked[0].text} keyed as ${key}`, truth: `${v} = ${x} is in one solution set but not the other` }); return; }
  }
}

/** The first pass over one level. Pure: no model, no network. */
function checkLevel({ trackId = null, gradeId = null, topic = null, blocks = [], checks = [] }) {
  const findings = [];
  const seen = new Set();
  const push = (f) => {
    const k = `${f.where}|${f.rule}|${f.claim}`;
    if (seen.has(k)) return;
    seen.add(k);
    findings.push({ where: f.where, rule: f.rule, certain: !!f.certain, claim: String(f.claim || '').slice(0, 400), truth: String(f.truth || '').slice(0, 400), path: f.path || null, by: 'code' });
  };
  let keyAgreement = null;
  try { keyAgreement = require('./key-agreement').keyAgreement; } catch { /* optional */ } // eslint-disable-line global-require
  const partTexts = [];
  const runPart = (where, strings, data, block) => {
    const defs = definitionsOf(strings.map((x) => x.s));
    const scope = { ...defs };
    for (const { s, path } of strings) {
      const add = (f) => push({ where, path, ...f });
      const n = normalize(s);
      for (const sentence of n.split(SPLIT_SENT)) {
        checkArithmetic(sentence, scope, add);
        checkWordArithmetic(sentence, add);
        checkIdentities(sentence, scope, add);
      }
      checkSteps(n, scope, add);
      partTexts.push({ where, s });
    }
    // Steps written as one equation per list item.
    if (data && Array.isArray(data.steps)) {
      const lines = data.steps.map((st) => (typeof st === 'string' ? st : st && st.text)).filter(Boolean).map(normalize);
      for (let i = 1; i < lines.length; i++) {
        const a = statementsOf(lines[i - 1], scope); const b = statementsOf(lines[i], scope);
        if (a.length === 1 && b.length === 1 && a[0].text === lines[i - 1].trim() && b[0].text === lines[i].trim()) compareSteps(a[0], b[0], scope, (f) => push({ where, ...f }), 'then');
      }
    }
    if (block) checkTables({ index: Number(where.split(' ')[1]), data }, defs, trackId, push);
    checkFormulaFacts(where, strings, defs, push);
    return defs;
  };
  for (const b of blocks) {
    const where = `block ${b.index}`;
    runPart(where, collectStrings(b.data, b.block), b.data, b.block);
    checkBlockKeys(b, push);
  }
  for (const c of checks) {
    const strings = [];
    for (const k of ['prompt', 'rationale']) if (c[k]) strings.push({ s: String(c[k]), path: k });
    if (typeof c.answer === 'string' && /[=<>]/.test(c.answer)) strings.push({ s: c.answer, path: 'answer' });
    runPart(`check ${c.index}`, strings, null, null);
  }
  checkChecks(checks, keyAgreement, push);
  checks.forEach((c) => checkInequalityKey(c, push));
  checkAgreement(partTexts, push);
  checkTableKeys(blocks, push);
  checkCounts(partTexts, push);
  // The subject checkers that already gate a level.
  /* eslint-disable global-require */
  for (const b of blocks) {
    let probs = [];
    try {
      if (trackId === 'chess') probs = require('./chess-checks').blockProblems(b.block, b.data);
      else if (trackId === 'piano') probs = require('./piano-checks').blockProblems(b.block, b.data, { gradeId, topic });
      else if (trackId === 'basketball') probs = require('./basketball-checks').blockProblems(b.block, b.data);
    } catch { probs = []; }
    for (const p of probs || []) push({ where: `block ${b.index}`, rule: 'subject_check', certain: true, claim: String(p).slice(0, 300), truth: String(p).slice(0, 300) });
  }
  /* eslint-enable global-require */
  return findings;
}

/** Off unless FACT_CODE_CHECKS=on (docs/FACT-GATE.md). */
function codeChecksOn() { return String(process.env.FACT_CODE_CHECKS || '').toLowerCase() === 'on'; }

module.exports = { checkLevel, codeChecksOn, spanishNumber, _parse: (s) => tryParse(tokenize(normalize(s)), {}), _num: num };
